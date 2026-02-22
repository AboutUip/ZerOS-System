// ZerOS 音乐（KiteMusic 壳子）
// 以 iframe 加载程序 assets 下的 KiteMusic 页面，支持任务栏预览与快捷控制（上一首/下一首/播放暂停）
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';

    const MUSICPLAYER = {
        pid: null,
        window: null,
        iframe: null,
        dragHandle: null,
        _isExiting: false,
        _kitemusicState: { name: '', artist: '', isPlaying: false, cover: '' },
        _messageHandler: null,
        _previewElement: null,

        __init__: async function(pid, initArgs) {
            this.pid = pid;

            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');

            this.window = document.createElement('div');
            this.window.className = 'musicplayer-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;width:100%;height:100%;min-width:400px;min-height:300px;position:relative;';

            var dragStrip = document.createElement('div');
            dragStrip.className = 'musicplayer-drag-strip';
            dragStrip.style.cssText = 'height:24px;min-height:24px;max-height:24px;flex-shrink:0;cursor:move;user-select:none;position:absolute;top:0;left:0;right:0;z-index:1;';
            this.window.appendChild(dragStrip);
            this.dragHandle = dragStrip;

            this.iframe = document.createElement('iframe');
            this.iframe.setAttribute('data-src', '');
            this.iframe.style.cssText = 'flex:1;width:100%;height:100%;min-height:0;border:none;display:block;';
            this.window.appendChild(this.iframe);

            if (typeof GUIManager !== 'undefined') {
                var icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    var rawIcon = ApplicationAssetManager.getIcon('musicplayer');
                    if (rawIcon && typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
                        var u = typeof rawIcon === 'string' ? rawIcon : (rawIcon.url || rawIcon.src || '');
                        if (u) icon = ProcessManager.convertVirtualPathToUrl(u);
                        else icon = rawIcon;
                    } else {
                        icon = rawIcon;
                    }
                }
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '音乐',
                    icon: icon,
                    borderless: true,
                    noTitleBar: true,
                    dragHandle: this.dragHandle,
                    onClose: () => {
                        this._cleanup();
                    }
                });
                if (windowInfo && windowInfo.windowId) this.windowId = windowInfo.windowId;
            }

            guiContainer.appendChild(this.window);

            var htmlPath = 'D:/application/musicplayer/assets/index.html';
            if (typeof ProcessManager !== 'undefined' && ProcessManager.convertVirtualPathToUrl) {
                htmlPath = ProcessManager.convertVirtualPathToUrl(htmlPath);
            } else {
                var m = htmlPath.match(/^([A-Z]):\/(.*)$/);
                if (m) htmlPath = '/system/service/DISK/' + m[1] + '/' + m[2];
            }
            var origin = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location.origin || '');
            this.iframe.src = origin + (htmlPath.startsWith('/') ? htmlPath : '/' + htmlPath);

            this._messageHandler = (e) => {
                if (this._isExiting || !e.data) return;
                if (e.data.type === 'kitemusic-state') {
                    var s = e.data;
                    this._kitemusicState = {
                        name: s.name || '',
                        artist: s.artist || '',
                        isPlaying: !!s.isPlaying,
                        cover: s.cover || ''
                    };
                    this._refreshPreviewContent();
                    return;
                }
                if (e.data.type === 'kitemusic-window-control') {
                    var a = e.data.action;
                    if (a === 'minimize') this._minimize();
                    else if (a === 'maximize' || a === 'unmaximize') this._toggleMaximize();
                    else if (a === 'close') this._close();
                }
            };
            window.addEventListener('message', this._messageHandler);

            if (initArgs.kernelAPI && typeof initArgs.kernelAPI.call === 'function') {
                var kernelAPI = initArgs.kernelAPI;
                setTimeout(() => {
                    if (this._isExiting) return;
                    try {
                        kernelAPI.call('GUI.registerTaskbarPreviewProvider', [{
                            getPreviewContent: () => this._getTaskbarPreviewElement(),
                            onPreviewClick: (e) => this._onTaskbarPreviewClick(e)
                        }]);
                    } catch (err) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('MusicPlayer', '注册任务栏预览失败: ' + (err && err.message));
                        }
                    }
                }, 0);
            }
        },

        _getTaskbarPreviewHtml: function() {
            if (this._isExiting) return '<div style="padding:12px;color:#999;">正在退出…</div>';
            var s = this._kitemusicState;
            var name = s.name || '未播放';
            var artist = s.artist || '--';
            var cover = s.cover || '';
            var playIcon = s.isPlaying ? '⏸' : '▶';
            var bg = '#1a1a2e';
            var fg = '#e4e4e7';
            var muted = '#71717a';
            var btnBg = 'rgba(255,255,255,0.1)';
            var esc = function(x) { return (x + '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
            return '<div class="musicplayer-preview" style="width:100%;min-height:80px;box-sizing:border-box;background:' + bg + ';color:' + fg + ';font-family:system-ui,sans-serif;font-size:13px;padding:10px;border-radius:8px;">' +
                '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
                '<div style="width:48px;height:48px;border-radius:6px;overflow:hidden;background:' + muted + ';flex-shrink:0;">' +
                (cover ? '<img src="' + esc(cover) + '" alt="" style="width:100%;height:100%;object-fit:cover;" />' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:' + muted + ';">♪</div>') +
                '</div>' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;">' + esc(name) + '</div>' +
                '<div style="color:' + muted + ';font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(artist) + '</div>' +
                '</div></div>' +
                '<div style="display:flex;align-items:center;justify-content:center;gap:8px;">' +
                '<button type="button" data-action="prev" style="width:36px;height:36px;border:none;border-radius:50%;background:' + btnBg + ';color:' + fg + ';font-size:16px;cursor:pointer;">⏮</button>' +
                '<button type="button" data-action="play" style="width:40px;height:40px;border:none;border-radius:50%;background:rgba(236,65,65,0.9);color:#fff;font-size:18px;cursor:pointer;">' + playIcon + '</button>' +
                '<button type="button" data-action="next" style="width:36px;height:36px;border:none;border-radius:50%;background:' + btnBg + ';color:' + fg + ';font-size:16px;cursor:pointer;">⏭</button>' +
                '</div></div>';
        },

        _getTaskbarPreviewElement: function() {
            var wrap = document.createElement('div');
            wrap.className = 'taskbar-window-preview-content musicplayer-preview-wrap';
            wrap.style.cssText = 'width:100%;height:100%;overflow:auto;';
            this._previewElement = wrap;
            wrap.innerHTML = this._getTaskbarPreviewHtml();
            return wrap;
        },

        _refreshPreviewContent: function() {
            if (this._previewElement && this._previewElement.parentNode) {
                this._previewElement.innerHTML = this._getTaskbarPreviewHtml();
            }
        },

        _onTaskbarPreviewClick: function(e) {
            if (this._isExiting) return;
            // 点击可能落在按钮内文字上，target 为文本节点时无 closest，从可用的 element 上找
            var el = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
            var btn = el && el.closest && el.closest('[data-action]');
            if (!btn) {
                if (typeof GUIManager !== 'undefined' && this.pid) GUIManager.focusWindow(this.pid);
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            var action = btn.getAttribute('data-action');
            if (!this.iframe || !this.iframe.contentWindow) return;
            if (action === 'prev') {
                this.iframe.contentWindow.postMessage({ type: 'kitemusic-control', action: 'prev' }, '*');
                this._refreshPreviewContent();
            } else if (action === 'next') {
                this.iframe.contentWindow.postMessage({ type: 'kitemusic-control', action: 'next' }, '*');
                this._refreshPreviewContent();
            } else if (action === 'play') {
                this._kitemusicState.isPlaying = !this._kitemusicState.isPlaying;
                this._refreshPreviewContent();
                this.iframe.contentWindow.postMessage({ type: 'kitemusic-control', action: 'toggle' }, '*');
            } else if (typeof GUIManager !== 'undefined' && this.pid) {
                GUIManager.focusWindow(this.pid);
            }
        },

        _minimize: function() {
            try {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.minimizeWindow === 'function') {
                    GUIManager.minimizeWindow(this.windowId || this.pid);
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('MusicPlayer', '_minimize: ' + (e && e.message));
            }
        },
        _toggleMaximize: function() {
            try {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.toggleMaximize === 'function') {
                    GUIManager.toggleMaximize(this.windowId || this.pid);
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('MusicPlayer', '_toggleMaximize: ' + (e && e.message));
            }
        },
        _close: function() {
            try {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager._closeWindow === 'function' && this.windowId) {
                    GUIManager._closeWindow(this.windowId, false);
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('MusicPlayer', '_close: ' + (e && e.message));
            }
        },

        _cleanup: function() {
            try {
                this._isExiting = true;
                this._previewElement = null;
                if (this._messageHandler) {
                    window.removeEventListener('message', this._messageHandler);
                    this._messageHandler = null;
                }
                this.iframe = null;
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('MusicPlayer', '清理失败', e);
            }
        },

        __info__: function() {
            return {
                name: '音乐',
                type: 'GUI',
                version: '1.0.0',
                description: 'KiteMusic 在线音乐播放器',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                category: 'other',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.NETWORK_ACCESS
                ] : []
            };
        },

        __exit__: function() {
            this._cleanup();
        }
    };

    if (typeof window !== 'undefined') window.MUSICPLAYER = MUSICPLAYER;
    else if (typeof globalThis !== 'undefined') globalThis.MUSICPLAYER = MUSICPLAYER;
})(window);
