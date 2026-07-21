// WallpaperEngine 壁纸引擎服务
// 源码存放于程序 assets，由安装/运行流程部署到 D/server/ 后由 ServerExpansion 加载
// 接管系统桌面壁纸层：提供 HTML 渲染、置底图层、事件（click/resize 等）

(function () {
    'use strict';

    var _pid = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;

    var _running = false;
    var _initialized = false;
    /** @type {HTMLElement|null} 壁纸层容器，作为 gui-container 的第一个子节点，z-index: 1（在主题背景之上、图标之下） */
    var _layer = null;
    /** @type {HTMLElement|null} */
    var _guiContainer = null;
    /** 是否当前由本服务接管（有内容时为 true，clear 后为 false） */
    var _active = false;
    /** 自定义事件名（由主窗口内脚本派发，不经过进程管理器） */
    var EV_SET_CONTENT = 'zeros-wallpaperengine-setcontent';
    var EV_SET_CONTENT_URL = 'zeros-wallpaperengine-setcontenturl';
    var EV_CLEAR = 'zeros-wallpaperengine-clear';

    var _boundOnSetContent = null;
    var _boundOnSetContentUrl = null;
    var _boundOnClear = null;
    var _boundOnMessage = null;

    function _log(level, msg, err) {
        if (typeof KernelLogger === 'undefined') return;
        if (level === 'info') KernelLogger.info('server-wallpaperengine', msg);
        else if (level === 'warn') KernelLogger.warn('server-wallpaperengine', msg);
        else if (level === 'error') KernelLogger.error('server-wallpaperengine', msg, err || undefined);
    }

    /**
     * 获取 gui-container，若尚未存在则返回 null
     */
    function _getGuiContainer() {
        if (typeof document === 'undefined') return null;
        return document.getElementById('gui-container') || null;
    }

    /**
     * 创建壁纸层 DOM：作为桌面最底层（z-index: 0），位于主题背景之上、图标与窗口之下
     */
    function _ensureLayer() {
        if (_layer && _layer.parentNode) return _layer;
        _guiContainer = _getGuiContainer();
        if (!_guiContainer) {
            _log('warn', 'gui-container 不存在，无法创建壁纸层');
            return null;
        }
        var el = document.createElement('div');
        el.className = 'wallpaper-engine-layer';
        el.setAttribute('data-service', 'wallpaperengine');
        el.style.cssText = [
            'position:absolute',
            'top:0',
            'left:0',
            'width:100%',
            'height:100%',
            'z-index:1',
            'pointer-events:none',
            'overflow:hidden',
            'box-sizing:border-box',
            'display:none',
            'background:transparent'
        ].join(';');
        _guiContainer.insertBefore(el, _guiContainer.firstChild);
        _layer = el;
        _log('info', '壁纸层已创建并插入 gui-container 首位');
        return _layer;
    }

    /**
     * 设置壁纸层为 HTML 内容（接管桌面壁纸）
     * @param {string} html
     */
    function setContent(html) {
        var layer = _ensureLayer();
        if (!layer) return;
        if (typeof html !== 'string') html = '';
        _active = !!html;
        if (!_active) {
            layer.style.display = 'none';
            layer.style.background = 'transparent';
        } else {
            layer.style.background = '#0a0e1a';
            layer.style.display = '';
        }
        layer.innerHTML = html || '';
        layer.style.pointerEvents = html ? 'auto' : 'none';
        _log('info', _active ? '已设置 HTML 壁纸内容' : '已清空 HTML 壁纸内容');
    }

    /**
     * 设置壁纸层为 iframe（URL 或 srcdoc）
     * @param {string} url 完整 URL 或 data URL；若以 data:text/html 开头则用 srcdoc 渲染
     */
    function setContentUrl(url) {
        var layer = _ensureLayer();
        if (!layer) return;
        if (typeof url !== 'string') url = '';
        if (!url) {
            _active = false;
            layer.style.display = 'none';
            layer.style.background = 'transparent';
            layer.innerHTML = '';
            layer.style.pointerEvents = 'none';
            _log('info', '已清空 URL 壁纸');
            return;
        }
        layer.style.background = '#0a0e1a';
        layer.style.display = '';
        layer.innerHTML = '';
        layer.style.pointerEvents = 'none';
        var iframe = document.createElement('iframe');
        iframe.className = 'wallpaper-engine-iframe';
        iframe.setAttribute('data-service', 'wallpaperengine');
        iframe.style.cssText = [
            'position:absolute',
            'top:0',
            'left:0',
            'width:100%',
            'height:100%',
            'border:none',
            'pointer-events:auto',
            'box-sizing:border-box'
        ].join(';');
        iframe.src = url;
        layer.appendChild(iframe);
        layer.style.pointerEvents = 'auto';
        _active = true;
        _log('info', '已设置 URL 壁纸: ' + (url.length > 60 ? url.slice(0, 60) + '...' : url));
    }

    /**
     * 清除壁纸内容，恢复系统主题背景显示
     */
    function clear() {
        var layer = _ensureLayer();
        if (layer) {
            layer.style.display = 'none';
            layer.style.background = 'transparent';
            layer.innerHTML = '';
            layer.style.pointerEvents = 'none';
        }
        _active = false;
        _log('info', '已清除壁纸层');
    }

    function __init__() {
        if (_initialized) return;
        _initialized = true;
        _log('info', 'init');
        _guiContainer = _getGuiContainer();
        if (_guiContainer) {
            _ensureLayer();
        } else {
            if (typeof window !== 'undefined') {
                var check = function () {
                    _guiContainer = _getGuiContainer();
                    if (_guiContainer) {
                        _ensureLayer();
                        return;
                    }
                    setTimeout(check, 100);
                };
                setTimeout(check, 50);
            }
        }
    }

    function __start__() {
        if (_running) return;
        _running = true;
        _log('info', 'start');
        _guiContainer = _getGuiContainer();
        _ensureLayer();
        if (_layer) {
            _layer.style.display = '';
            _layer.style.visibility = 'visible';
        }
        _boundOnSetContent = function (e) {
            var d = e && e.detail;
            setContent(d && d.html != null ? d.html : '');
        };
        _boundOnSetContentUrl = function (e) {
            var d = e && e.detail;
            setContentUrl(d && d.url != null ? d.url : '');
        };
        _boundOnClear = function () {
            clear();
        };
        _boundOnMessage = function (e) {
            var d = e.data;
            if (!d || typeof d.type !== 'string') return;
            var gui = document.getElementById('gui-container');
            var x = d.clientX != null ? d.clientX : 0;
            var y = d.clientY != null ? d.clientY : 0;
            if (d.type === 'zeros-wallpaperengine-contextmenu') {
                if (gui && typeof ContextMenuManager !== 'undefined' && typeof ContextMenuManager._handleContextMenu === 'function') {
                    var ev = {
                        clientX: x,
                        clientY: y,
                        target: gui,
                        preventDefault: function () {},
                        stopPropagation: function () {}
                    };
                    ContextMenuManager._handleContextMenu(ev);
                }
                return;
            }
            if (d.type === 'zeros-wallpaperengine-click' || d.type === 'zeros-wallpaperengine-mousedown') {
                var el = _layer || gui;
                if (el && typeof window !== 'undefined') {
                    var eventType = d.type === 'zeros-wallpaperengine-click' ? 'click' : 'mousedown';
                    try {
                        var synthetic = new MouseEvent(eventType, {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                            clientX: x,
                            clientY: y,
                            button: 0,
                            buttons: 1
                        });
                        el.dispatchEvent(synthetic);
                    } catch (err) {
                        _log('warn', '壁纸层派发 ' + eventType + ' 失败: ' + (err && err.message));
                    }
                }
            }
        };
        if (typeof window !== 'undefined') {
            window.addEventListener(EV_SET_CONTENT, _boundOnSetContent);
            window.addEventListener(EV_SET_CONTENT_URL, _boundOnSetContentUrl);
            window.addEventListener(EV_CLEAR, _boundOnClear);
            window.addEventListener('message', _boundOnMessage);
        }
        _log('info', '壁纸层已就绪，可接收 setContent/setContentUrl/clear 事件');
    }

    function __stop__() {
        if (!_running) return;
        _running = false;
        _log('info', 'stop');
        if (typeof window !== 'undefined') {
            if (_boundOnSetContent) window.removeEventListener(EV_SET_CONTENT, _boundOnSetContent);
            if (_boundOnSetContentUrl) window.removeEventListener(EV_SET_CONTENT_URL, _boundOnSetContentUrl);
            if (_boundOnClear) window.removeEventListener(EV_CLEAR, _boundOnClear);
            if (_boundOnMessage) window.removeEventListener('message', _boundOnMessage);
        }
        _boundOnSetContent = null;
        _boundOnSetContentUrl = null;
        _boundOnClear = null;
        _boundOnMessage = null;
        clear();
        if (_layer) {
            _layer.style.display = 'none';
            _layer.style.visibility = 'hidden';
        }
    }

    function __status__() {
        return {
            running: _running,
            initialized: _initialized,
            active: _active,
            hasLayer: !!(_layer && _layer.parentNode)
        };
    }

    function __info__() {
        return {
            name: 'WallpaperEngine',
            version: '1.0.0',
            description: '壁纸引擎服务 - 接管桌面壁纸层，提供 HTML 渲染与事件'
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
