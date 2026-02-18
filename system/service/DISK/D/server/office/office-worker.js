(function () {
    'use strict';

    function ensureJSZip() {
        if (typeof JSZip !== 'undefined') return;
        importScripts('/kernel/dynamicModule/libs/office/jszip/jszip.min.js');
    }

    const SUPPORTED_TYPES = new Set(['text', 'audio', 'video', 'image', 'url', 'asset', 'container']);

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
        if (!file) throw new Error('missing file: ' + path);
        return file.async('uint8array').then(function (bytes) {
            return jsonParse(decodeBytesToText(bytes), path);
        });
    }

    function isUrlString(v) {
        return typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function cssEscape(s) {
        return String(s == null ? '' : s).replace(/"/g, '\\"').replace(/\r/g, '').replace(/\n/g, '');
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
            'layout.top': 'top',
            'layout.left': 'left',
            'layout.right': 'right',
            'layout.bottom': 'bottom',
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
            'text.align': 'align',
            'text.letterSpacing': 'letterSpacing',
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
            'letterSpacing', 'wordSpacing', 'indent',
            'top', 'left', 'right', 'bottom'
        ]);
        if (percentKeys.has(key)) return hasPercentUnit(value);
        if (key === 'fontFamily') return typeof value === 'string';
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
        if (key === 'borderStyle') return value === 'solid' || value === 'dashed' || value === 'dotted' || value === 'none';
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

    function normalizeAssetValue(type, value) {
        if (isUrlString(value)) return { kind: 'url', value: value };
        if (type === 'asset') return { kind: 'asset', value: value };
        if (type === 'image') return { kind: 'asset', value: (String(value).indexOf('images/') === 0 ? value : 'images/' + value) };
        if (type === 'audio') return { kind: 'asset', value: (String(value).indexOf('audios/') === 0 ? value : 'audios/' + value) };
        if (type === 'video') return { kind: 'asset', value: (String(value).indexOf('videos/') === 0 ? value : 'videos/' + value) };
        return { kind: 'raw', value: value };
    }

    function styleToCss(type, style) {
        if (!style || typeof style !== 'object') return '';
        const css = [];
        const transform = [];

        if (style.display) css.push('display:' + cssEscape(style.display));
        if (style.opacity != null) css.push('opacity:' + cssEscape(style.opacity));
        if (style.visible === false) css.push('visibility:hidden');
        if (style.zIndex != null) css.push('position:relative', 'z-index:' + cssEscape(style.zIndex));
        if (style.rotate) transform.push('rotate(' + cssEscape(style.rotate) + ')');
        if (style.scale != null) transform.push('scale(' + cssEscape(style.scale) + ')');
        if (style.translateX || style.translateY) transform.push('translate(' + cssEscape(style.translateX || '0%') + ',' + cssEscape(style.translateY || '0%') + ')');

        if (style.top) css.push('top:' + cssEscape(style.top));
        if (style.left) css.push('left:' + cssEscape(style.left));
        if (style.right) css.push('right:' + cssEscape(style.right));
        if (style.bottom) css.push('bottom:' + cssEscape(style.bottom));

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
            css.push(map[k] + ':' + cssEscape(style[k]));
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
                css.push(tmap[k] + ':' + cssEscape(style[k]));
            });
            if (style.align) css.push('text-align:' + cssEscape(style.align));
            if (style.indent) css.push('text-indent:' + cssEscape(style.indent));
            if (style.wrap === 'word') css.push('overflow-wrap:anywhere');
            if (style.wrap === 'char') css.push('word-break:break-all');
            if (style.wrap === 'none') css.push('white-space:nowrap');
            if (style.maxLines) {
                css.push('display:-webkit-box', '-webkit-box-orient:vertical', '-webkit-line-clamp:' + cssEscape(style.maxLines), 'overflow:hidden');
                if (style.ellipsis) css.push('text-overflow:ellipsis');
            }
        }

        if (type === 'image' || type === 'video') {
            if (style.fit) css.push('object-fit:' + cssEscape(style.fit));
            if (style.position) css.push('object-position:' + cssEscape(style.position === 'center' ? 'center' : style.position));
        }

        if (transform.length) css.push('transform:' + transform.join(' '));
        return css.join(';');
    }

    function renderNode(node, styles, contents, assetsSet) {
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
                ordered.sort(function (a, b) {
                    const ia = String(a && a.id || '');
                    const ib = String(b && b.id || '');
                    return ia < ib ? -1 : (ia > ib ? 1 : 0);
                });
            }
            const inner = ordered.map(function (c) { return renderNode(c, styles, contents, assetsSet); }).join('');
            return '<div' + attr + '>' + inner + '</div>';
        }

        const value = contents[id] || '';
        if (type === 'text') return '<p' + attr + '>' + escapeHtml(value) + '</p>';

        if (type === 'url') {
            const href = value;
            const target = style.target ? ' target="' + escapeHtml(style.target) + '"' : '';
            const rel = style.rel ? ' rel="' + escapeHtml(style.rel) + '"' : '';
            return '<a' + attr + ' href="' + escapeHtml(href) + '"' + target + rel + '>' + escapeHtml(href) + '</a>';
        }

        const normalized = normalizeAssetValue(type, value);
        if (type === 'asset') {
            if (normalized.kind === 'url') return '<a' + attr + ' href="' + escapeHtml(normalized.value) + '">' + escapeHtml(style.label || normalized.value) + '</a>';
            assetsSet.add(String(normalized.value));
            const token = 'zdoc-asset://' + encodeURIComponent(String(normalized.value));
            const download = style.downloadName ? ' download="' + escapeHtml(style.downloadName) + '"' : '';
            return '<a' + attr + ' href="' + escapeHtml(token) + '"' + download + '>' + escapeHtml(style.label || normalized.value) + '</a>';
        }

        if (normalized.kind === 'url') {
            if (type === 'image') return '<img' + attr + ' src="' + escapeHtml(normalized.value) + '" alt=""/>';
            if (type === 'audio') return '<audio' + attr + ' src="' + escapeHtml(normalized.value) + '"' + mediaAttr + '></audio>';
            if (type === 'video') return '<video' + attr + ' src="' + escapeHtml(normalized.value) + '"' + mediaAttr + '></video>';
        }

        assetsSet.add(String(normalized.value));
        const srcToken = 'zdoc-asset://' + encodeURIComponent(String(normalized.value));
        if (type === 'image') return '<img' + attr + ' src="' + escapeHtml(srcToken) + '" alt=""/>';
        if (type === 'audio') return '<audio' + attr + ' src="' + escapeHtml(srcToken) + '"' + mediaAttr + '></audio>';
        if (type === 'video') {
            let posterAttr = '';
            if (style.poster) {
                const pv = normalizeAssetValue('image', String(style.poster));
                if (pv.kind === 'url') {
                    posterAttr = ' poster="' + escapeHtml(pv.value) + '"';
                } else {
                    assetsSet.add(String(pv.value));
                    posterAttr = ' poster="' + escapeHtml('zdoc-asset://' + encodeURIComponent(String(pv.value))) + '"';
                }
            }
            return '<video' + attr + posterAttr + ' src="' + escapeHtml(srcToken) + '"' + mediaAttr + '></video>';
        }
        return '';
    }

    function previewFromArrayBuffer(arrayBuffer) {
        ensureJSZip();
        return JSZip.loadAsync(arrayBuffer).then(function (zip) {
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
                const assets = new Set();
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

                                const html = order.map(function (sec) {
                                    const n = rootBySection[sec];
                                    if (!n) return '';
                                    const h = renderNode(n, styles, contents, assets);
                                    return '<div class="zdoc-section zdoc-' + sec + '">' + h + '</div>';
                                }).join('');
                                pages.push({ index: idx, html: html });
                            });
                        });
                    })(i);
                }
                return seq.then(function () {
                    const styleText = 'html,body{margin:0;padding:0;background:#111;color:#eee;font-family:system-ui,Arial,sans-serif}.zdoc-root{padding:16px;display:flex;flex-direction:column;gap:16px}.zdoc-page{background:#fff;color:#000;border-radius:8px;overflow:hidden;padding:16px}.zdoc-section{width:100%}.zdoc-header,.zdoc-footer{opacity:.9}img,video{max-width:100%}';
                    const html = '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>' + escapeHtml(desc.title || 'ZDOC') + '</title><style>' + styleText + '</style></head><body><div class="zdoc-root">' + pages.map(function (p) { return '<div class="zdoc-page" data-zdoc-page="' + p.index + '">' + p.html + '</div>'; }).join('') + '</div></body></html>';
                    return { description: desc, pages: pages, html: html, assets: Array.from(assets), basePrefix: basePrefix };
                });
            });
        });
    }

    function getRandomId(length) {
        const chars = '0123456789abcdef';
        let id = '';
        for (let i = 0; i < length; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    function createNode(type, customId) {
        const id = customId || ('n' + getRandomId(12));
        const node = { id: id, type: String(type) };
        if (type === 'container') {
            node.child = {};
            node.order = [];
        }
        return node;
    }

    function findNodeByIdInObject(obj, targetId) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
        if (obj.id === targetId) return { node: obj, parent: null, key: null, isRoot: true };
        if (obj.type === 'container' && obj.child && typeof obj.child === 'object') {
            for (const key in obj.child) {
                const child = obj.child[key];
                if (child && typeof child === 'object') {
                    if (child.id === targetId) {
                        return { node: child, parent: obj.child, key: key, isRoot: false };
                    }
                    if (child.type === 'container' && child.child) {
                        const found = findNodeByIdInObject(child, targetId);
                        if (found) return found;
                    }
                }
            }
        }
        return null;
    }

    function findNodeById(structure, targetId) {
        if (!Array.isArray(structure)) return null;
        for (let i = 0; i < structure.length; i++) {
            const section = structure[i];
            if (!section || typeof section !== 'object') continue;
            for (const key in section) {
                const root = section[key];
                if (!root || typeof root !== 'object') continue;
                if (root.id === targetId) {
                    return { node: root, parent: section, key: key, isRoot: true };
                }
                const found = findNodeByIdInObject(root, targetId);
                if (found) return found;
            }
        }
        return null;
    }

    function findParentContainerAndNode(structure, targetId) {
        if (!Array.isArray(structure)) return null;
        for (let i = 0; i < structure.length; i++) {
            const section = structure[i];
            if (!section || typeof section !== 'object') continue;
            for (const key in section) {
                const root = section[key];
                if (!root || typeof root !== 'object') continue;
                if (root.id === targetId) {
                    return { container: section, key: key, node: root, isRoot: true };
                }
                const found = findParentContainerInObject(root, targetId);
                if (found) return found;
            }
        }
        return null;
    }

    function findParentContainerInObject(obj, targetId) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
        if (obj.type === 'container' && obj.child && typeof obj.child === 'object') {
            for (const key in obj.child) {
                const child = obj.child[key];
                if (child && typeof child === 'object') {
                    if (child.id === targetId) {
                        return { container: obj, key: key, node: child, isRoot: false };
                    }
                    if (child.type === 'container' && child.child) {
                        const found = findParentContainerInObject(child, targetId);
                        if (found) return found;
                    }
                }
            }
        }
        return null;
    }

    function removeNodeFromStructure(structure, nodeId) {
        const found = findParentContainerAndNode(structure, nodeId);
        if (!found) return false;
        if (found.isRoot) {
            delete found.container[found.key];
        } else {
            delete found.container.child[found.key];
            if (found.container.order) {
                const idx = found.container.order.indexOf(nodeId);
                if (idx >= 0) found.container.order.splice(idx, 1);
            }
        }
        return true;
    }

    function addNodeToStructure(structure, parentId, newNode, position) {
        const found = findNodeById(structure, parentId);
        if (!found) return false;
        if (found.node.type !== 'container') return false;
        if (!found.node.child) found.node.child = {};
        if (!found.node.order) found.node.order = [];
        found.node.child[newNode.id] = newNode;
        if (position === undefined || position === -1 || position >= found.node.order.length) {
            found.node.order.push(newNode.id);
        } else {
            found.node.order.splice(position, 0, newNode.id);
        }
        return true;
    }

    function moveNodeInStructure(structure, nodeId, newParentId, newPosition) {
        const sourceFound = findParentContainerAndNode(structure, nodeId);
        if (!sourceFound) return false;
        const nodeToMove = sourceFound.node;
        
        const targetFound = findNodeById(structure, newParentId);
        if (!targetFound || targetFound.node.type !== 'container') return false;
        
        if (sourceFound.container === targetFound.node) {
            const order = sourceFound.container.order;
            if (order && Array.isArray(order)) {
                const oldIdx = order.indexOf(nodeId);
                if (oldIdx >= 0) order.splice(oldIdx, 1);
                if (newPosition === undefined || newPosition === -1 || newPosition >= order.length) {
                    order.push(nodeId);
                } else {
                    order.splice(newPosition, 0, nodeId);
                }
            }
            return true;
        }
        
        if (!targetFound.node.child) targetFound.node.child = {};
        if (!targetFound.node.order) targetFound.node.order = [];
        
        if (sourceFound.isRoot) {
            delete sourceFound.container[sourceFound.key];
        } else {
            delete sourceFound.container.child[sourceFound.key];
            if (sourceFound.container.order) {
                const oldIdx = sourceFound.container.order.indexOf(nodeId);
                if (oldIdx >= 0) sourceFound.container.order.splice(oldIdx, 1);
            }
        }
        
        targetFound.node.child[nodeId] = nodeToMove;
        if (newPosition === undefined || newPosition === -1 || newPosition >= targetFound.node.order.length) {
            targetFound.node.order.push(nodeId);
        } else {
            targetFound.node.order.splice(newPosition, 0, nodeId);
        }
        return true;
    }

    function ensurePageExists(zip, basePrefix, pageIndex) {
        const pageDir = basePrefix + 'pages/zd' + pageIndex + '/';
        const pageFile = zip.file(pageDir + 'page.json');
        if (!pageFile) {
            const newPage = {
                structure: [{
                    content: {
                        id: 'content',
                        type: 'container',
                        child: {},
                        order: []
                    }
                }]
            };
            zip.file(pageDir + 'page.json', JSON.stringify(newPage, null, 2));
            zip.file(pageDir + 'style.json', JSON.stringify([], null, 2));
            zip.file(pageDir + 'content.json', JSON.stringify([], null, 2));
        }
    }

    function addPageToDescription(desc) {
        desc.pageCount = (desc.pageCount || 0) + 1;
        return desc;
    }

    function removePageFromDescription(desc, pageIndex) {
        if (desc.pageCount > 0) desc.pageCount--;
        return desc;
    }

    function editZdocBuffer(arrayBuffer, operation) {
        ensureJSZip();
        return JSZip.loadAsync(arrayBuffer).then(function (zip) {
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
                const opType = operation && operation.type;
                if (opType === 'addNode') {
                    const pageIndex = operation.pageIndex || 0;
                    const parentId = operation.parentId;
                    const nodeType = operation.nodeType || 'text';
                    const customId = operation.nodeId;
                    const position = operation.position;
                    ensurePageExists(zip, basePrefix, pageIndex);
                    const pageDir = basePrefix + 'pages/zd' + pageIndex + '/';
                    return readJsonFile(zip, pageDir + 'page.json').then(function (page) {
                        const newNode = createNode(nodeType, customId);
                        const added = addNodeToStructure(page.structure, parentId, newNode, position);
                        if (!added) throw new Error('Failed to add node: parent not found or invalid parent type');
                        zip.file(pageDir + 'page.json', JSON.stringify(page, null, 2));
                        zip.file(basePrefix + 'Description.json', JSON.stringify(desc, null, 2));
                        return zip.generateAsync({ type: 'arraybuffer' }).then(function (buf) {
                            return { success: true, buffer: buf, newNodeId: newNode.id };
                        });
                    });
                }
                if (opType === 'removeNode') {
                    const pageIndex = operation.pageIndex || 0;
                    const nodeId = operation.nodeId;
                    const pageDir = basePrefix + 'pages/zd' + pageIndex + '/';
                    return readJsonFile(zip, pageDir + 'page.json').then(function (page) {
                        const removed = removeNodeFromStructure(page.structure, nodeId);
                        if (!removed) throw new Error('Node not found: ' + nodeId);
                        zip.file(pageDir + 'page.json', JSON.stringify(page, null, 2));
                        return readJsonFile(zip, pageDir + 'style.json').then(function (style) {
                            const newStyle = Array.isArray(style) ? style.filter(function (s) {
                                return s && s.link !== nodeId;
                            }) : [];
                            zip.file(pageDir + 'style.json', JSON.stringify(newStyle, null, 2));
                            return readJsonFile(zip, pageDir + 'content.json').then(function (content) {
                                const newContent = Array.isArray(content) ? content.filter(function (c) {
                                    return c && c.link !== nodeId;
                                }) : [];
                                zip.file(pageDir + 'content.json', JSON.stringify(newContent, null, 2));
                                return zip.generateAsync({ type: 'arraybuffer' }).then(function (buf) {
                                    return { success: true, buffer: buf };
                                });
                            });
                        });
                    });
                }
                if (opType === 'moveNode') {
                    const pageIndex = operation.pageIndex || 0;
                    const nodeId = operation.nodeId;
                    const newParentId = operation.newParentId;
                    const newPosition = operation.position;
                    const pageDir = basePrefix + 'pages/zd' + pageIndex + '/';
                    return readJsonFile(zip, pageDir + 'page.json').then(function (page) {
                        const moved = moveNodeInStructure(page.structure, nodeId, newParentId, newPosition);
                        if (!moved) throw new Error('Failed to move node: source or target not found');
                        zip.file(pageDir + 'page.json', JSON.stringify(page, null, 2));
                        return zip.generateAsync({ type: 'arraybuffer' }).then(function (buf) {
                            return { success: true, buffer: buf };
                        });
                    });
                }
                if (opType === 'addPage') {
                    const newPageIndex = desc.pageCount || 0;
                    desc = addPageToDescription(desc);
                    const pageDir = basePrefix + 'pages/zd' + newPageIndex + '/';
                    const newPage = {
                        structure: [{
                            content: {
                                id: 'content',
                                type: 'container',
                                child: {},
                                order: []
                            }
                        }]
                    };
                    zip.file(pageDir + 'page.json', JSON.stringify(newPage, null, 2));
                    zip.file(pageDir + 'style.json', JSON.stringify([], null, 2));
                    zip.file(pageDir + 'content.json', JSON.stringify([], null, 2));
                    zip.file(basePrefix + 'Description.json', JSON.stringify(desc, null, 2));
                    return zip.generateAsync({ type: 'arraybuffer' }).then(function (buf) {
                        return { success: true, buffer: buf, newPageIndex: newPageIndex };
                    });
                }
                if (opType === 'removePage') {
                    const pageIndex = operation.pageIndex || 0;
                    if (desc.pageCount <= 1) throw new Error('Cannot remove the only page');
                    desc = removePageFromDescription(desc, pageIndex);
                    const pageDir = basePrefix + 'pages/zd' + pageIndex + '/';
                    zip.remove(pageDir + 'page.json');
                    zip.remove(pageDir + 'style.json');
                    zip.remove(pageDir + 'content.json');
                    
                    let seq = Promise.resolve();
                    for (let i = pageIndex + 1; i < 1000; i++) {
                        (function (idx) {
                            seq = seq.then(function () {
                                const nextDir = basePrefix + 'pages/zd' + idx + '/';
                                const nextPage = zip.file(nextDir + 'page.json');
                                if (!nextPage) return;
                                const prevDir = basePrefix + 'pages/zd' + (idx - 1) + '/';
                                return Promise.all([
                                    zip.file(nextDir + 'page.json').async('text'),
                                    zip.file(nextDir + 'style.json').async('text'),
                                    zip.file(nextDir + 'content.json').async('text')
                                ]).then(function (arr) {
                                    zip.file(prevDir + 'page.json', arr[0]);
                                    zip.file(prevDir + 'style.json', arr[1]);
                                    zip.file(prevDir + 'content.json', arr[2]);
                                    zip.remove(nextDir + 'page.json');
                                    zip.remove(nextDir + 'style.json');
                                    zip.remove(nextDir + 'content.json');
                                });
                            });
                        })(i);
                    }
                    return seq.then(function () {
                        zip.file(basePrefix + 'Description.json', JSON.stringify(desc, null, 2));
                        return zip.generateAsync({ type: 'arraybuffer' }).then(function (buf) {
                            return { success: true, buffer: buf };
                        });
                    });
                }
                if (opType === 'renameNode') {
                    const pageIndex = operation.pageIndex || 0;
                    const oldNodeId = operation.oldNodeId;
                    const newNodeId = operation.newNodeId;
                    if (!oldNodeId || !newNodeId) {
                        throw new Error('Missing oldNodeId or newNodeId');
                    }
                    if (oldNodeId === newNodeId) {
                        return zip.generateAsync({ type: 'arraybuffer' }).then(function (buf) {
                            return { success: true, buffer: buf };
                        });
                    }
                    const pageDir = basePrefix + 'pages/zd' + pageIndex + '/';
                    return Promise.all([
                        readJsonFile(zip, pageDir + 'page.json'),
                        readJsonFile(zip, pageDir + 'style.json'),
                        readJsonFile(zip, pageDir + 'content.json')
                    ]).then(function (arr) {
                        const page = arr[0];
                        const style = arr[1];
                        const content = arr[2];
                        
                        function renameNodeInObject(obj) {
                            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
                            if (obj.id === oldNodeId) {
                                obj.id = newNodeId;
                            }
                            if (obj.type === 'container' && obj.child && typeof obj.child === 'object') {
                                if (obj.child[oldNodeId]) {
                                    obj.child[newNodeId] = obj.child[oldNodeId];
                                    delete obj.child[oldNodeId];
                                }
                                if (Array.isArray(obj.order)) {
                                    const idx = obj.order.indexOf(oldNodeId);
                                    if (idx >= 0) {
                                        obj.order[idx] = newNodeId;
                                    }
                                }
                                Object.keys(obj.child).forEach(function (k) {
                                    renameNodeInObject(obj.child[k]);
                                });
                            }
                        }
                        
                        if (Array.isArray(page.structure)) {
                            page.structure.forEach(function (section) {
                                if (section && typeof section === 'object') {
                                    Object.keys(section).forEach(function (key) {
                                        renameNodeInObject(section[key]);
                                    });
                                }
                            });
                        }
                        
                        if (Array.isArray(style)) {
                            style.forEach(function (s) {
                                if (s && s.link === oldNodeId) {
                                    s.link = newNodeId;
                                }
                            });
                        }
                        
                        if (Array.isArray(content)) {
                            content.forEach(function (c) {
                                if (c && c.link === oldNodeId) {
                                    c.link = newNodeId;
                                }
                            });
                        }
                        
                        zip.file(pageDir + 'page.json', JSON.stringify(page, null, 2));
                        zip.file(pageDir + 'style.json', JSON.stringify(style, null, 2));
                        zip.file(pageDir + 'content.json', JSON.stringify(content, null, 2));
                        
                        return zip.generateAsync({ type: 'arraybuffer' }).then(function (buf) {
                            return { success: true, buffer: buf };
                        });
                    });
                }
                throw new Error('Unknown operation type: ' + opType);
            });
        });
    }

    self.onmessage = function (evt) {
        const msg = evt && evt.data ? evt.data : null;
        if (!msg || msg.id == null) return;
        if (msg.type === 'preview') {
            previewFromArrayBuffer(msg.arrayBuffer).then(function (result) {
                self.postMessage({ id: msg.id, ok: true, result: result });
            }).catch(function (e) {
                self.postMessage({ id: msg.id, ok: false, error: e && (e.message || String(e)) || 'preview failed' });
            });
            return;
        }
        if (msg.type === 'edit') {
            var operation = msg.operation;
            if (!operation || !operation.type) {
                self.postMessage({ id: msg.id, ok: false, error: 'Missing operation type' });
                return;
            }
            editZdocBuffer(msg.arrayBuffer, operation).then(function (result) {
                self.postMessage({ id: msg.id, ok: true, result: result });
            }).catch(function (e) {
                self.postMessage({ id: msg.id, ok: false, error: e && (e.message || String(e)) || 'edit failed' });
            });
            return;
        }
        self.postMessage({ id: msg.id, ok: false, error: 'Unknown message type' });
    };
})();
