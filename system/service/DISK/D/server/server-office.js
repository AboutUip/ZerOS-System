(function () {
    'use strict';

    const POOL_CATEGORY = 'SERVER';
    const POOL_KEY = 'Office';
    const SUPPORTED_TYPES = new Set(['text', 'audio', 'video', 'image', 'url', 'asset', 'container']);

    let _running = false;
    let _inited = false;
    let _lastError = null;
    let _lastPreviewAt = null;
    let _previewCount = 0;

    const _assetUrlCache = new Map();
    let _worker = null;
    let _workerSeq = 0;
    const _workerPending = new Map();

    function getWorkerUrl() {
        return '/system/service/DISK/D/server/office/office-worker.js';
    }

    function getWorker() {
        if (typeof Worker === 'undefined') return null;
        if (_worker) return _worker;
        try {
            const w = new Worker(getWorkerUrl());
            w.onmessage = function (evt) {
                const msg = evt && evt.data ? evt.data : null;
                if (!msg || msg.id == null) return;
                const pending = _workerPending.get(msg.id);
                if (!pending) return;
                _workerPending.delete(msg.id);
                if (msg.ok) pending.resolve(msg.result);
                else pending.reject(new Error(msg.error || 'worker failed'));
            };
            w.onerror = function () {
                try { w.terminate(); } catch (e) {}
                _worker = null;
                _workerPending.forEach(function (p) { p.reject(new Error('worker crashed')); });
                _workerPending.clear();
            };
            _worker = w;
            return _worker;
        } catch (e) {
            _worker = null;
            return null;
        }
    }

    function workerPreview(arrayBuffer) {
        const w = getWorker();
        if (!w) return Promise.reject(new Error('worker unavailable'));
        const id = ++_workerSeq;
        const p = new Promise(function (resolve, reject) {
            _workerPending.set(id, { resolve: resolve, reject: reject });
        });
        const buf = arrayBuffer.slice(0);
        w.postMessage({ id: id, type: 'preview', arrayBuffer: buf }, [buf]);
        return p;
    }

    function workerEdit(arrayBuffer, operation) {
        const w = getWorker();
        if (!w) return Promise.reject(new Error('worker unavailable'));
        const id = ++_workerSeq;
        const p = new Promise(function (resolve, reject) {
            _workerPending.set(id, { resolve: resolve, reject: reject });
        });
        const buf = arrayBuffer.slice(0);
        w.postMessage({ id: id, type: 'edit', arrayBuffer: buf, operation: operation }, [buf]);
        return p;
    }

    function editZdocBuffer(arrayBuffer, operation) {
        return workerEdit(arrayBuffer, operation).then(function (result) {
            if (result && result.buffer) {
                return { success: true, buffer: result.buffer, newNodeId: result.newNodeId, newPageIndex: result.newPageIndex };
            }
            return { success: false, error: 'Invalid result' };
        }).catch(function (e) {
            _lastError = e && (e.message || String(e)) || 'edit failed';
            throw e;
        });
    }

    function virtualPathToUrl(vpath) {
        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
            return ProcessManager.convertVirtualPathToUrl(vpath);
        }
        const m = String(vpath || '').match(/^([A-Z]):\/?(.*)$/);
        if (!m) return null;
        const disk = m[1];
        const rel = m[2] || '';
        return '/system/service/DISK/' + disk + '/' + rel;
    }

    function isUrlString(v) {
        return typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v);
    }

    function loadScriptOnce(url) {
        return new Promise(function (resolve, reject) {
            if (!url) {
                reject(new Error('script url empty'));
                return;
            }
            if (document.querySelector('script[data-office-src="' + url.replace(/"/g, '&quot;') + '"]')) {
                resolve();
                return;
            }
            const s = document.createElement('script');
            s.async = true;
            s.src = url;
            s.dataset.officeSrc = url;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('failed to load script: ' + url)); };
            document.head.appendChild(s);
        });
    }

    function ensureJSZip() {
        if (typeof JSZip !== 'undefined') return Promise.resolve();
        return loadScriptOnce('/kernel/dynamicModule/libs/office/jszip/jszip.min.js');
    }

    function stripBom(text) {
        const s = String(text == null ? '' : text);
        if (s && s.charCodeAt(0) === 0xFEFF) return s.slice(1);
        return s;
    }

    function looksUtf16le(bytes) {
        if (!bytes || bytes.length < 8) return false;
        let oddZero = 0;
        let oddCount = 0;
        for (let i = 1; i < bytes.length; i += 2) {
            oddCount++;
            if (bytes[i] === 0) oddZero++;
        }
        return oddCount > 0 && (oddZero / oddCount) > 0.6;
    }

    function decodeUtf16le(bytes) {
        let out = '';
        for (let i = 0; i + 1 < bytes.length; i += 2) {
            out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
        }
        return out;
    }

    function decodeBytesToText(bytes) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        if (typeof TextDecoder !== 'undefined') {
            if (looksUtf16le(u8)) {
                try {
                    return new TextDecoder('utf-16le').decode(u8);
                } catch (e) {}
            }
            try {
                return new TextDecoder('utf-8').decode(u8);
            } catch (e) {}
        }
        if (looksUtf16le(u8)) return decodeUtf16le(u8);
        let s = '';
        for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return s;
    }

    function jsonParse(text, fileName) {
        try {
            return JSON.parse(stripBom(text));
        } catch (e) {
            throw new Error('JSON parse failed: ' + fileName);
        }
    }

    function readJsonFile(zip, path) {
        const file = zip.file(path);
        if (!file) return Promise.reject(new Error('missing file: ' + path));
        return file.async('uint8array').then(function (bytes) {
            return jsonParse(decodeBytesToText(bytes), path);
        });
    }

    function flattenStyleProperty(property) {
        const flat = {};
        const grouped = {};
        if (!property || typeof property !== 'object' || Array.isArray(property)) return { flat: flat, grouped: grouped };

        Object.keys(property).forEach(function (k) {
            const v = property[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) return;
            flat[k] = v;
        });

        const map = {
            'layout.width': 'width',
            'layout.height': 'height',
            'layout.minWidth': 'minWidth',
            'layout.maxWidth': 'maxWidth',
            'layout.minHeight': 'minHeight',
            'layout.maxHeight': 'maxHeight',
            'layout.align': 'align',
            'layout.translateX': 'translateX',
            'layout.translateY': 'translateY',
            'spacing.padding': 'padding',
            'spacing.paddingTop': 'paddingTop',
            'spacing.paddingRight': 'paddingRight',
            'spacing.paddingBottom': 'paddingBottom',
            'spacing.paddingLeft': 'paddingLeft',
            'spacing.margin': 'margin',
            'spacing.marginTop': 'marginTop',
            'spacing.marginRight': 'marginRight',
            'spacing.marginBottom': 'marginBottom',
            'spacing.marginLeft': 'marginLeft',
            'spacing.gap': 'gap',
            'spacing.indent': 'indent',
            'spacing.letterSpacing': 'letterSpacing',
            'spacing.wordSpacing': 'wordSpacing',
            'border.width': 'borderWidth',
            'border.color': 'borderColor',
            'border.style': 'borderStyle',
            'border.radius': 'borderRadius',
            'background.color': 'backgroundColor',
            'transform.rotate': 'rotate',
            'transform.scale': 'scale',
            'text.size': 'size',
            'text.color': 'color',
            'text.fontFamily': 'fontFamily',
            'text.weight': 'weight',
            'text.style': 'style',
            'text.decoration': 'decoration',
            'text.lineHeight': 'lineHeight',
            'text.whiteSpace': 'whiteSpace',
            'text.wrap': 'wrap',
            'text.maxLines': 'maxLines',
            'text.ellipsis': 'ellipsis',
            'media.fit': 'fit',
            'media.position': 'position',
            'media.poster': 'poster',
            'media.autoplay': 'autoplay',
            'media.loop': 'loop',
            'media.muted': 'muted',
            'media.controls': 'controls',
            'media.volume': 'volume',
            'link.target': 'target',
            'link.rel': 'rel',
            'asset.label': 'label',
            'asset.icon': 'icon',
            'asset.downloadName': 'downloadName',
            'asset.openMode': 'openMode'
        };

        Object.keys(property).forEach(function (groupKey) {
            const groupValue = property[groupKey];
            if (!groupValue || typeof groupValue !== 'object' || Array.isArray(groupValue)) return;
            Object.keys(groupValue).forEach(function (k) {
                const v = groupValue[k];
                if (v && typeof v === 'object') return;
                const full = groupKey + '.' + k;
                if (!map[full]) return;
                grouped[map[full]] = v;
            });
        });

        return { flat: flat, grouped: grouped };
    }

    function isHexColor(v) {
        return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
    }

    function hasPercentUnit(v) {
        return typeof v === 'string' && /^-?\d+(\.\d+)?%$/.test(v);
    }

    function hasRemUnit(v) {
        return typeof v === 'string' && /^-?\d+(\.\d+)?rem$/.test(v);
    }

    function hasDegUnit(v) {
        return typeof v === 'string' && /^-?\d+(\.\d+)?deg$/.test(v);
    }

    function validateStyleValue(key, value) {
        const percentKeys = new Set([
            'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
            'translateX', 'translateY',
            'gap', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
            'borderWidth', 'borderRadius',
            'letterSpacing', 'wordSpacing', 'indent'
        ]);
        if (percentKeys.has(key)) return hasPercentUnit(value);
        if (key === 'size') return hasRemUnit(value);
        if (key === 'rotate') return hasDegUnit(value);
        if (key === 'color' || key === 'borderColor' || key === 'backgroundColor') return isHexColor(value);
        if (key === 'opacity') return typeof value === 'number' && value >= 0 && value <= 1;
        if (key === 'visible') return typeof value === 'boolean';
        if (key === 'zIndex') return Number.isInteger(value);
        if (key === 'display') return value === 'block' || value === 'inline' || value === 'none';
        if (key === 'direction') return value === 'row' || value === 'column';
        if (key === 'justify') return value === 'start' || value === 'center' || value === 'end' || value === 'space-between' || value === 'space-around';
        if (key === 'items') return value === 'start' || value === 'center' || value === 'end' || value === 'stretch';
        if (key === 'wrap') return value === 'nowrap' || value === 'wrap' || value === 'word' || value === 'char' || value === 'none';
        if (key === 'fit') return value === 'contain' || value === 'cover' || value === 'fill' || value === 'none' || value === 'scale-down';
        if (key === 'position') return value === 'center' || value === 'top' || value === 'bottom' || value === 'left' || value === 'right';
        if (key === 'autoplay' || key === 'loop' || key === 'muted' || key === 'controls' || key === 'ellipsis') return typeof value === 'boolean';
        if (key === 'volume') return typeof value === 'number' && value >= 0 && value <= 1;
        if (key === 'weight') return (Number.isInteger(value) && value >= 1) || value === 'normal' || value === 'bold';
        if (key === 'style') return value === 'normal' || value === 'italic';
        if (key === 'decoration') return value === 'none' || value === 'underline' || value === 'line-through';
        if (key === 'lineHeight') return typeof value === 'number';
        if (key === 'align') return value === 'left' || value === 'center' || value === 'right' || value === 'justify';
        if (key === 'whiteSpace') return value === 'normal' || value === 'nowrap' || value === 'pre' || value === 'pre-wrap';
        if (key === 'maxLines') return Number.isInteger(value) && value >= 1;
        if (key === 'fontFamily' || key === 'shadow' || key === 'poster' || key === 'rel' || key === 'label' || key === 'icon' || key === 'downloadName') return typeof value === 'string';
        if (key === 'openMode') return value === 'preview' || value === 'download';
        if (key === 'target') return value === '_self' || value === '_blank';
        if (key === 'scale') return typeof value === 'number';
        return true;
    }

    function mergeStyles(styleArray) {
        const merged = {};
        if (!Array.isArray(styleArray)) return merged;
        styleArray.forEach(function (entry) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
            if (!('link' in entry) || !('property' in entry)) return;
            if (Object.keys(entry).length !== 2) return;
            if (typeof entry.link !== 'string') return;
            const property = entry.property;
            if (!property || typeof property !== 'object' || Array.isArray(property)) return;
            if (!merged[entry.link]) merged[entry.link] = {};
            const fp = flattenStyleProperty(property);
            Object.keys(fp.flat).forEach(function (k) {
                const v = fp.flat[k];
                if (!validateStyleValue(k, v)) return;
                merged[entry.link][k] = v;
            });
            Object.keys(fp.grouped).forEach(function (k) {
                const v = fp.grouped[k];
                if (!validateStyleValue(k, v)) return;
                merged[entry.link][k] = v;
            });
        });
        return merged;
    }

    function mergeContent(contentArray) {
        const merged = {};
        if (!Array.isArray(contentArray)) return merged;
        contentArray.forEach(function (entry) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
            if (!('link' in entry) || !('value' in entry)) return;
            if (Object.keys(entry).length !== 2) return;
            if (typeof entry.link !== 'string' || typeof entry.value !== 'string') return;
            merged[entry.link] = entry.value;
        });
        return merged;
    }

    function sortByIdAsc(a, b) {
        const ia = String(a && a.id || '');
        const ib = String(b && b.id || '');
        return ia < ib ? -1 : (ia > ib ? 1 : 0);
    }

    function normalizeAssetValue(type, value) {
        if (isUrlString(value)) return { kind: 'url', value: value };
        if (type === 'asset') return { kind: 'asset', value: value };
        if (type === 'image') return { kind: 'asset', value: (value.indexOf('images/') === 0 ? value : 'images/' + value) };
        if (type === 'audio') return { kind: 'asset', value: (value.indexOf('audios/') === 0 ? value : 'audios/' + value) };
        if (type === 'video') return { kind: 'asset', value: (value.indexOf('videos/') === 0 ? value : 'videos/' + value) };
        return { kind: 'raw', value: value };
    }

    function bytesToBase64(bytes) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < u8.length; i += chunk) {
            const sub = u8.subarray(i, i + chunk);
            bin += String.fromCharCode.apply(null, Array.prototype.slice.call(sub));
        }
        try {
            return btoa(bin);
        } catch (e) {
            return '';
        }
    }

    function guessMimeType(rel) {
        const name = String(rel || '').toLowerCase();
        if (name.endsWith('.svg')) return 'image/svg+xml';
        if (name.endsWith('.png')) return 'image/png';
        if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
        if (name.endsWith('.gif')) return 'image/gif';
        if (name.endsWith('.webp')) return 'image/webp';
        if (name.endsWith('.mp3')) return 'audio/mpeg';
        if (name.endsWith('.wav')) return 'audio/wav';
        if (name.endsWith('.mp4')) return 'video/mp4';
        if (name.endsWith('.webm')) return 'video/webm';
        if (name.endsWith('.txt')) return 'text/plain';
        if (name.endsWith('.json')) return 'application/json';
        return 'application/octet-stream';
    }

    function ensureAssetDataUrl(zip, assetRel, basePrefix) {
        const rel = String(assetRel || '');
        const prefix = String(basePrefix || '');
        const cacheKey = prefix + 'assets/' + rel;
        if (_assetUrlCache.has(cacheKey)) return Promise.resolve(_assetUrlCache.get(cacheKey));
        const file = zip.file(prefix + 'assets/' + rel);
        if (!file) return Promise.resolve(null);
        return file.async('uint8array').then(function (bytes) {
            const b64 = bytesToBase64(bytes);
            const mime = guessMimeType(rel);
            const url = b64 ? ('data:' + mime + ';base64,' + b64) : null;
            if (url) _assetUrlCache.set(cacheKey, url);
            return url;
        });
    }

    function styleToCss(type, style) {
        if (!style || typeof style !== 'object') return '';
        const css = [];
        const transform = [];

        if (style.display) css.push('display:' + String(style.display));
        if (style.opacity != null) css.push('opacity:' + String(style.opacity));
        if (style.visible === false) css.push('visibility:hidden');
        if (style.zIndex != null) css.push('position:relative', 'z-index:' + String(style.zIndex));
        if (style.rotate) transform.push('rotate(' + String(style.rotate) + ')');
        if (style.scale != null) transform.push('scale(' + String(style.scale) + ')');
        if (style.translateX || style.translateY) transform.push('translate(' + String(style.translateX || '0%') + ',' + String(style.translateY || '0%') + ')');

        const map = {
            backgroundColor: 'background-color',
            width: 'width',
            height: 'height',
            minWidth: 'min-width',
            maxWidth: 'max-width',
            minHeight: 'min-height',
            maxHeight: 'max-height',
            padding: 'padding',
            paddingTop: 'padding-top',
            paddingRight: 'padding-right',
            paddingBottom: 'padding-bottom',
            paddingLeft: 'padding-left',
            margin: 'margin',
            marginTop: 'margin-top',
            marginRight: 'margin-right',
            marginBottom: 'margin-bottom',
            marginLeft: 'margin-left',
            gap: 'gap',
            borderWidth: 'border-width',
            borderColor: 'border-color',
            borderStyle: 'border-style',
            borderRadius: 'border-radius',
            shadow: 'box-shadow'
        };
        Object.keys(map).forEach(function (k) {
            if (style[k] == null) return;
            css.push(map[k] + ':' + String(style[k]));
        });

        if (type === 'container') {
            const flex = style.direction || style.justify || style.items || (style.wrap === 'wrap' || style.wrap === 'nowrap') || style.gap;
            if (flex) {
                css.push('display:flex');
                if (style.direction) css.push('flex-direction:' + (style.direction === 'row' ? 'row' : 'column'));
                if (style.justify) css.push('justify-content:' + (style.justify === 'start' ? 'flex-start' : (style.justify === 'end' ? 'flex-end' : style.justify)));
                if (style.items) css.push('align-items:' + (style.items === 'start' ? 'flex-start' : (style.items === 'end' ? 'flex-end' : style.items)));
                if (style.wrap === 'wrap' || style.wrap === 'nowrap') css.push('flex-wrap:' + style.wrap);
            }
        }

        if (type === 'text' || type === 'url' || type === 'asset') {
            const tmap = {
                size: 'font-size',
                color: 'color',
                fontFamily: 'font-family',
                weight: 'font-weight',
                style: 'font-style',
                decoration: 'text-decoration',
                lineHeight: 'line-height',
                letterSpacing: 'letter-spacing',
                wordSpacing: 'word-spacing',
                whiteSpace: 'white-space'
            };
            Object.keys(tmap).forEach(function (k) {
                if (style[k] == null) return;
                css.push(tmap[k] + ':' + String(style[k]));
            });
            if (style.align) css.push('text-align:' + String(style.align));
            if (style.indent) css.push('text-indent:' + String(style.indent));
            if (style.wrap === 'word') css.push('overflow-wrap:anywhere');
            if (style.wrap === 'char') css.push('word-break:break-all');
            if (style.wrap === 'none') css.push('white-space:nowrap');
            if (style.maxLines) {
                css.push('display:-webkit-box', '-webkit-box-orient:vertical', '-webkit-line-clamp:' + String(style.maxLines), 'overflow:hidden');
                if (style.ellipsis) css.push('text-overflow:ellipsis');
            }
        }

        if (type === 'image' || type === 'video') {
            if (style.fit) css.push('object-fit:' + String(style.fit));
            if (style.position) css.push('object-position:' + String(style.position === 'center' ? 'center' : style.position));
        }

        if (transform.length) css.push('transform:' + transform.join(' '));
        return css.join(';');
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function validateNode(node, seenIds) {
        if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error('node invalid');
        if (typeof node.id !== 'string' || typeof node.type !== 'string') throw new Error('node id/type invalid');
        if (!SUPPORTED_TYPES.has(node.type)) throw new Error('node type not supported: ' + node.type);
        if (seenIds.has(node.id)) throw new Error('duplicate node id in page: ' + node.id);
        seenIds.add(node.id);
        if (node.type !== 'container') return;
        if (!node.child || typeof node.child !== 'object' || Array.isArray(node.child)) throw new Error('container.child invalid: ' + node.id);
        const children = [];
        Object.keys(node.child).forEach(function (k) {
            const v = node.child[k];
            if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('child node invalid: ' + node.id);
            children.push(v);
        });
        const ids = children.map(function (c) { return c.id; });
        const uniq = new Set(ids);
        if (uniq.size !== ids.length) throw new Error('duplicate child id in container: ' + node.id);
        if (node.order != null) {
            if (!Array.isArray(node.order)) throw new Error('container.order invalid: ' + node.id);
            const orderIds = node.order.map(function (x) { return String(x); });
            const orderSet = new Set(orderIds);
            if (orderSet.size !== orderIds.length) throw new Error('container.order duplicate: ' + node.id);
            if (orderIds.length !== ids.length) throw new Error('container.order not cover all children: ' + node.id);
            ids.forEach(function (cid) {
                if (!orderSet.has(cid)) throw new Error('container.order missing child: ' + node.id);
            });
        }
        children.forEach(function (c) { validateNode(c, seenIds); });
    }

    function renderNode(zip, basePrefix, zdocPath, node, styles, contents) {
        const id = String(node.id);
        const type = String(node.type);
        const style = styles[id] || {};
        const css = styleToCss(type, style);
        const attr = ' data-zdoc-id="' + escapeHtml(id) + '"' + (css ? ' style="' + escapeHtml(css) + '"' : '');
        const mediaAttr = (style.controls === false ? '' : ' controls') + (style.autoplay ? ' autoplay' : '') + (style.loop ? ' loop' : '') + (style.muted ? ' muted' : '');

        if (type === 'container') {
            const children = [];
            Object.keys(node.child || {}).forEach(function (k) {
                const v = node.child[k];
                if (v && typeof v === 'object' && !Array.isArray(v)) children.push(v);
            });
            let ordered = children.slice();
            if (Array.isArray(node.order)) {
                const map = new Map();
                children.forEach(function (c) { map.set(String(c.id), c); });
                ordered = [];
                node.order.forEach(function (cid) {
                    const c = map.get(String(cid));
                    if (c) ordered.push(c);
                });
            } else {
                ordered.sort(sortByIdAsc);
            }
            const innerPromises = ordered.map(function (c) { return renderNode(zip, basePrefix, zdocPath, c, styles, contents); });
            return Promise.all(innerPromises).then(function (inners) {
                return '<div' + attr + '>' + inners.join('') + '</div>';
            });
        }

        const value = contents[id] || '';
        if (type === 'text') return Promise.resolve('<div' + attr + '>' + escapeHtml(value) + '</div>');

        if (type === 'url') {
            const href = value;
            const target = style.target ? ' target="' + escapeHtml(style.target) + '"' : '';
            const rel = style.rel ? ' rel="' + escapeHtml(style.rel) + '"' : '';
            return Promise.resolve('<a' + attr + ' href="' + escapeHtml(href) + '"' + target + rel + '>' + escapeHtml(href) + '</a>');
        }

        const normalized = normalizeAssetValue(type, value);
        if (type === 'asset') {
            if (normalized.kind === 'url') {
                return Promise.resolve('<a' + attr + ' href="' + escapeHtml(normalized.value) + '">' + escapeHtml(style.label || normalized.value) + '</a>');
            }
            return ensureAssetDataUrl(zip, normalized.value, basePrefix).then(function (u) {
                const href = u || '';
                const label = style.label || normalized.value;
                const download = style.downloadName ? ' download="' + escapeHtml(style.downloadName) + '"' : '';
                return '<a' + attr + ' href="' + escapeHtml(href) + '"' + download + '>' + escapeHtml(label) + '</a>';
            });
        }

        if (normalized.kind === 'url') {
            if (type === 'image') return Promise.resolve('<img' + attr + ' src="' + escapeHtml(normalized.value) + '" alt=""/>');
            if (type === 'audio') return Promise.resolve('<audio' + attr + ' src="' + escapeHtml(normalized.value) + '"' + mediaAttr + '></audio>');
            if (type === 'video') return Promise.resolve('<video' + attr + ' src="' + escapeHtml(normalized.value) + '"' + mediaAttr + '></video>');
        }

        return ensureAssetDataUrl(zip, normalized.value, basePrefix).then(function (u) {
            const src = u || '';
            if (type === 'image') return '<img' + attr + ' src="' + escapeHtml(src) + '" alt=""/>';
            if (type === 'audio') return '<audio' + attr + ' src="' + escapeHtml(src) + '"' + mediaAttr + '></audio>';
            if (type === 'video') {
                if (style.poster) {
                    const pv = normalizeAssetValue('image', String(style.poster));
                    if (pv.kind === 'url') {
                        return '<video' + attr + ' poster="' + escapeHtml(pv.value) + '" src="' + escapeHtml(src) + '"' + mediaAttr + '></video>';
                    }
                    return ensureAssetDataUrl(zip, pv.value, basePrefix).then(function (pu) {
                        const purl = pu || '';
                        const posterAttr = purl ? ' poster="' + escapeHtml(purl) + '"' : '';
                        return '<video' + attr + posterAttr + ' src="' + escapeHtml(src) + '"' + mediaAttr + '></video>';
                    });
                }
                return '<video' + attr + ' src="' + escapeHtml(src) + '"' + mediaAttr + '></video>';
            }
            return '';
        });
    }

    function previewZdocBuffer(arrayBuffer) {
        _lastError = null;
        _lastPreviewAt = Date.now();
        _previewCount++;
        return ensureJSZip().then(function () {
            return workerPreview(arrayBuffer).then(function (result) {
                const basePrefix = String(result && result.basePrefix || '');
                const assets = Array.isArray(result && result.assets) ? result.assets : [];
                if (assets.length === 0) return result;
                return JSZip.loadAsync(arrayBuffer).then(function (zip) {
                    const seq = assets.map(function (rel) {
                        return ensureAssetDataUrl(zip, rel, basePrefix).then(function (url) {
                            return { rel: rel, url: url || '' };
                        });
                    });
                    return Promise.all(seq).then(function (pairs) {
                        const map = new Map();
                        pairs.forEach(function (p) { map.set(String(p.rel), String(p.url)); });
                        const replace = function (s) {
                            if (typeof s !== 'string') return s;
                            let out = s;
                            map.forEach(function (u, rel) {
                                const token = 'zdoc-asset://' + encodeURIComponent(rel);
                                out = out.split(token).join(u);
                            });
                            return out;
                        };
                        const pages = Array.isArray(result.pages) ? result.pages.map(function (p) {
                            return { index: p.index, html: replace(p.html) };
                        }) : [];
                        return {
                            description: result.description,
                            pages: pages,
                            html: replace(result.html)
                        };
                    });
                });
            }).catch(function () {
                return JSZip.loadAsync(arrayBuffer).then(function (zip) {
                    return previewZdocFromZip(zip);
                });
            });
        }).catch(function (e) {
            _lastError = e && (e.message || String(e)) || 'preview failed';
            throw e;
        });
    }

    function previewZdocFromZip(zip) {
        const basePrefix = (function () {
            const direct = zip.file('Description.json');
            if (direct) return '';
            const keys = zip && zip.files ? Object.keys(zip.files) : [];
            let best = null;
            keys.forEach(function (p) {
                if (!/(^|\/)Description\.json$/i.test(p)) return;
                if (!best || String(p).length < String(best).length) best = p;
            });
            if (!best) return '';
            return String(best).slice(0, String(best).length - 'Description.json'.length);
        })();

        return readJsonFile(zip, basePrefix + 'Description.json').then(function (desc) {
            const pageCount = Number(desc.pageCount);
            if (!Number.isFinite(pageCount) || pageCount < 0) throw new Error('pageCount invalid');
            const pages = [];
            let seq = Promise.resolve();
            for (let i = 0; i < pageCount; i++) {
                (function (idx) {
                    seq = seq.then(function () {
                        const base = basePrefix + 'pages/zd' + idx + '/';
                        return Promise.all([
                            readJsonFile(zip, base + 'page.json'),
                            readJsonFile(zip, base + 'style.json'),
                            readJsonFile(zip, base + 'content.json')
                        ]).then(function (arr) {
                            const page = arr[0];
                            const style = arr[1];
                            const content = arr[2];

                            const structure = page.structure;
                            if (!Array.isArray(structure) || structure.length < 1 || structure.length > 3) throw new Error('structure invalid: ' + base);

                            const seenIds = new Set();
                            const roots = [];
                            structure.forEach(function (obj, si) {
                                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('structure item invalid: ' + base);
                                const keys = Object.keys(obj);
                                if (keys.length !== 1) throw new Error('structure item must single key: ' + base);
                                const k = keys[0];
                                const root = obj[k];
                                if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('root invalid: ' + base);
                                if (String(root.id) !== String(k)) throw new Error('root id mismatch: ' + base);
                                validateNode(root, seenIds);
                                roots.push({ sectionIndex: si, node: root });
                            });

                            const styles = mergeStyles(style);
                            const contents = mergeContent(content);

                            const sections = structure.length === 1 ? ['content'] : (structure.length === 2 ? ['header', 'content'] : ['header', 'content', 'footer']);
                            const order = sections;
                            const rootBySection = {};
                            roots.forEach(function (r) { rootBySection[sections[r.sectionIndex]] = r.node; });

                            const htmlSeq = order.reduce(function (p, sec) {
                                return p.then(function (acc) {
                                    const n = rootBySection[sec];
                                    if (!n) return acc;
                                    return renderNode(zip, basePrefix, '', n, styles, contents).then(function (h) {
                                        acc.push('<div class="zdoc-section zdoc-' + sec + '">' + h + '</div>');
                                        return acc;
                                    });
                                });
                            }, Promise.resolve([]));

                            return htmlSeq.then(function (sectionHtml) {
                                pages.push({ index: idx, html: sectionHtml.join('') });
                            });
                        });
                    });
                })(i);
            }
            return seq.then(function () {
                const styleText = 'html,body{margin:0;padding:0;background:#111;color:#eee;font-family:system-ui,Arial,sans-serif}.zdoc-root{padding:16px;display:flex;flex-direction:column;gap:16px}.zdoc-page{background:#fff;color:#000;border-radius:8px;overflow:hidden;padding:16px}.zdoc-section{width:100%}.zdoc-header,.zdoc-footer{opacity:.9}img,video{max-width:100%}';
                const html = '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>' + escapeHtml(desc.title || 'ZDOC') + '</title><style>' + styleText + '</style></head><body><div class="zdoc-root">' + pages.map(function (p) { return '<div class="zdoc-page" data-zdoc-page="' + p.index + '">' + p.html + '</div>'; }).join('') + '</div></body></html>';
                return { description: desc, pages: pages, html: html };
            });
        });
    }

    function previewZdoc(path) {
        const url = virtualPathToUrl(path);
        if (!url) return Promise.reject(new Error('invalid path'));
        return fetch(url).then(function (res) {
            if (!res || !res.ok) throw new Error('fetch zdoc failed: ' + (res ? res.status : 'unknown'));
            return res.arrayBuffer();
        }).then(function (buf) {
            return previewZdocBuffer(buf);
        });
    }

    function disposePreviewResources() {
        _assetUrlCache.clear();
    }

    function getOfficeAPI() {
        return {
            previewZdoc: previewZdoc,
            previewZdocBuffer: previewZdocBuffer,
            editZdocBuffer: editZdocBuffer,
            disposePreviewResources: disposePreviewResources
        };
    }

    function __init__() {
        _inited = true;
    }

    function __start__() {
        if (_running) return;
        _running = true;
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            if (!POOL.__HAS__(POOL_CATEGORY)) {
                POOL.__INIT__(POOL_CATEGORY);
            }
            POOL.__ADD__(POOL_CATEGORY, POOL_KEY, getOfficeAPI());
        }
    }

    function __stop__() {
        if (!_running) return;
        _running = false;
        disposePreviewResources();
        if (typeof POOL !== 'undefined' && typeof POOL.__REMOVE__ === 'function') {
            try { POOL.__REMOVE__(POOL_CATEGORY, POOL_KEY); } catch (e) {}
        }
    }

    function __status__() {
        const poolExposed = _running && typeof POOL !== 'undefined' && typeof POOL.__HAS__ === 'function' && POOL.__HAS__(POOL_CATEGORY, POOL_KEY);
        return {
            serviceId: 'office',
            serviceName: 'Office',
            version: '1.0',
            running: _running,
            inited: _inited,
            poolExposed: poolExposed,
            poolCategory: POOL_CATEGORY,
            poolKey: POOL_KEY,
            poolPath: POOL_CATEGORY + ' > ' + POOL_KEY,
            lastPreviewAt: _lastPreviewAt,
            previewCount: _previewCount,
            lastError: _lastError
        };
    }

    function __info__() {
        return {
            name: 'Office',
            version: '1.0',
            description: 'ZerOS Office 服务：提供 ZDOC 预览渲染（POOL > SERVER 暴露 Office.previewZdoc）'
        };
    }

    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__({
            __init__: __init__,
            __start__: __start__,
            __stop__: __stop__,
            __status__: __status__,
            __info__: __info__
        });
    }
})();
