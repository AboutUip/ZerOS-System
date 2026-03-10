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
        _kitemusicState: { name: '', artist: '', isPlaying: false, cover: '', lyrics: [], currentIndex: -1, progress: 0 },
        _messageHandler: null,
        _previewElement: null,
        _desktopLyricsEnabled: false,
        _desktopLyricsComponentId: null,
        _lyricsSyncTimer: null,
        _cacheHelper: null,

        __init__: async function(pid, initArgs) {
            this._isExiting = false;
            this._kitemusicState = { name: '', artist: '', isPlaying: false, cover: '', lyrics: [], currentIndex: -1, progress: 0 };
            this._messageHandler = null;
            this._previewElement = null;
            this._desktopLyricsEnabled = false;
            this._desktopLyricsComponentId = null;
            this._lyricsSyncTimer = null;
            this.windowId = null;
            
            // 初始化缓存辅助函数
            this._initCacheHelper(initArgs);
            
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

            this.iframe.addEventListener('load', () => {
                if (!this._isExiting && this._cacheHelper && this._cacheHelper.syncAllToParent) {
                    setTimeout(() => {
                        this._cacheHelper.syncAllToParent();
                    }, 1000);
                }
                if (this.iframe.contentWindow) {
                    try {
                        if (typeof VolumeManager !== 'undefined') {
                            this.iframe.contentWindow.postMessage({
                                type: 'kitemusic-system-volume',
                                value: VolumeManager.getSystemVolume()
                            }, '*');
                        }
                        if (typeof SystemInformation !== 'undefined' && SystemInformation.getAudioProxyUrl) {
                            this.iframe.contentWindow.postMessage({
                                type: 'kitemusic-audio-proxy',
                                url: SystemInformation.getAudioProxyUrl()
                            }, '*');
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('MusicPlayer', '发送消息到 iframe 失败: ' + (e && e.message));
                        }
                    }
                }
            });

            this._messageHandler = (e) => {
                if (this._isExiting || !e.data) return;
                if (e.data.type === 'kitemusic-state') {
                    var s = e.data;
                    this._kitemusicState = {
                        name: s.name || '',
                        artist: s.artist || '',
                        isPlaying: !!s.isPlaying,
                        cover: s.cover || '',
                        lyrics: s.lyrics || [],
                        currentIndex: s.currentIndex || -1,
                        progress: s.progress || 0
                    };
                    this._refreshPreviewContent();
                    if (this._desktopLyricsEnabled) {
                        this._syncDesktopLyrics();
                    }
                    if (typeof KernelLogger !== 'undefined') {
                        var lyricsInfo = this._kitemusicState.lyrics ? '[' + this._kitemusicState.lyrics.join('|') + ']' : '(无)';
                        KernelLogger.debug('MusicPlayer', '收到状态: name=' + this._kitemusicState.name + ', lyrics=' + lyricsInfo);
                    }
                    return;
                }
                if (e.data.type === 'kitemusic-window-control') {
                    var a = e.data.action;
                    if (a === 'minimize') this._minimize();
                    else if (a === 'maximize' || a === 'unmaximize') this._toggleMaximize();
                    else if (a === 'close') this._close();
                }
                if (e.data.type === 'kitemusic-lyrics-toggle') {
                    this._toggleDesktopLyrics();
                }
                if (e.data.type === 'kitemusic-cache-get') {
                    var cacheKey = e.data.key;
                    var cacheDefault = e.data.defaultValue;
                    if (this._cacheHelper) {
                        this._cacheHelper.get(cacheKey, cacheDefault).then(function(value) {
                            if (self.iframe && self.iframe.contentWindow) {
                                self.iframe.contentWindow.postMessage({
                                    type: 'kitemusic-cache-result',
                                    key: cacheKey,
                                    value: value
                                }, '*');
                            }
                        });
                    }
                }
                if (e.data.type === 'kitemusic-cache-set') {
                    var cacheKey = e.data.key;
                    var cacheValue = e.data.value;
                    if (this._cacheHelper) {
                        this._cacheHelper.set(cacheKey, cacheValue);
                    }
                }
            };
            window.addEventListener('message', this._messageHandler);
            this._volumeChangeHandler = (e) => {
                if (this._isExiting || !this.iframe || !this.iframe.contentWindow || !e || e.detail == null) return;
                try {
                    this.iframe.contentWindow.postMessage({
                        type: 'kitemusic-system-volume',
                        value: typeof e.detail.value === 'number' ? e.detail.value : (typeof VolumeManager !== 'undefined' ? VolumeManager.getSystemVolume() : 1)
                    }, '*');
                } catch (err) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('MusicPlayer', '转发系统音量到 iframe 失败: ' + (err && err.message));
                    }
                }
            };
            if (typeof document !== 'undefined') {
                document.addEventListener('zeros-system-volume-change', this._volumeChangeHandler);
            }

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

        _enableDesktopLyrics: function() {
            if (this._desktopLyricsEnabled) return { success: true, message: '桌面歌词已开启' };
            
            if (typeof DesktopManager === 'undefined') {
                return { success: false, message: 'DesktopManager 不可用' };
            }

            try {
                this._desktopLyricsComponentId = DesktopManager.createComponent(this.pid, {
                    type: 'desktop-lyrics',
                    position: { x: 100, y: 300 },
                    size: { width: 500, height: 200 },
                    style: {
                        backgroundColor: 'transparent',
                        backdropFilter: 'none',
                        borderRadius: '16px',
                        padding: '24px',
                        color: '#ffffff',
                        fontSize: '32px',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        textShadow: 'none',
                        pointerEvents: 'auto',
                        cursor: 'default',
                        fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
                        overflow: 'hidden',
                        border: 'none',
                        boxShadow: 'none'
                    },
                    draggable: true,
                    persistent: false
                });

                this._desktopLyricsEnabled = true;

                const container = DesktopManager.getComponentContentContainer(this._desktopLyricsComponentId);
                if (container) {
                    container.innerHTML = '<div class="desktop-lyrics-text" style="opacity:0.9;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;">' + 
                        (this._kitemusicState.name || '等待播放...') + 
                        '</div>';
                    
                    container.addEventListener('click', () => {
                        this._disableDesktopLyrics();
                    });
                }

                this._startLyricsSync();

                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('MusicPlayer', '桌面歌词已开启');
                }

                return { success: true, message: '桌面歌词已开启' };
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '开启桌面歌词失败: ' + e.message);
                }
                if (typeof ExceptionHandler !== 'undefined') {
                    ExceptionHandler.reportException(
                        ExceptionHandler.ExceptionLevel.SERVICE,
                        'MusicPlayer 开启桌面歌词失败',
                        { error: e.message, stack: e.stack }
                    );
                }
                return { success: false, message: e.message };
            }
        },

        _disableDesktopLyrics: function() {
            if (!this._desktopLyricsEnabled) return { success: true, message: '桌面歌词已关闭' };

            this._stopLyricsSync();

            if (this._desktopLyricsComponentId && typeof DesktopManager !== 'undefined') {
                try {
                    DesktopManager.removeComponent(this._desktopLyricsComponentId);
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('MusicPlayer', '移除桌面歌词组件失败: ' + e.message);
                    }
                }
            }

            this._desktopLyricsEnabled = false;
            this._desktopLyricsComponentId = null;

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('MusicPlayer', '桌面歌词已关闭');
            }

            return { success: true, message: '桌面歌词已关闭' };
        },

        _toggleDesktopLyrics: function() {
            if (this._desktopLyricsEnabled) {
                return this._disableDesktopLyrics();
            } else {
                return this._enableDesktopLyrics();
            }
        },

        _startLyricsSync: function() {
            if (this._lyricsSyncTimer) return;
            
            this._lyricsSyncTimer = setInterval(() => {
                this._syncDesktopLyrics();
            }, 500);
        },

        _stopLyricsSync: function() {
            if (this._lyricsSyncTimer) {
                clearInterval(this._lyricsSyncTimer);
                this._lyricsSyncTimer = null;
            }
        },

        _syncDesktopLyrics: function() {
            if (!this._desktopLyricsEnabled || !this._desktopLyricsComponentId) return;

            try {
                const lyrics = this._kitemusicState.lyrics || [];
                const progress = this._kitemusicState.progress || 0;
                
                const prevLine = lyrics[0] || '';
                const currentLine = lyrics[1] || this._kitemusicState.name || '等待播放...';
                const nextLine = lyrics[2] || '';

                const gradientStyle = 'background: linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ' + progress + '%, rgba(255,255,255,0.6) ' + Math.min(100, progress + 20) + '%, rgba(255,255,255,0.3) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;';

                const container = DesktopManager.getComponentContentContainer(this._desktopLyricsComponentId);
                if (container) {
                    container.innerHTML = `
                        <div class="desktop-lyrics-container" style="
                            width: 100%;
                            height: 100%;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            align-items: center;
                            gap: 16px;
                            font-family: 'Microsoft YaHei', 'PingFang SC', -apple-system, sans-serif;
                            user-select: none;
                        ">
                            <div class="lyrics-prev" style="
                                font-size: 18px;
                                color: rgba(255, 255, 255, 0.35);
                                text-align: center;
                                transition: all 0.5s ease-out;
                                opacity: 0.7;
                                transform: translateY(-10px);
                            ">${this._escapeHtml(prevLine)}</div>
                            <div class="lyrics-current" style="
                                font-size: 28px;
                                font-weight: 600;
                                text-align: center;
                                background: linear-gradient(90deg, 
                                    #fff 0%, 
                                    #e0e7ff 30%, 
                                    #a5b4fc 60%, 
                                    #fff 100%
                                );
                                background-size: 200% 100%;
                                -webkit-background-clip: text;
                                -webkit-text-fill-color: transparent;
                                background-clip: text;
                                animation: lyrics-glow 3s ease-in-out infinite;
                                transition: all 0.5s ease-out;
                            ">${this._escapeHtml(currentLine)}</div>
                            <div class="lyrics-next" style="
                                font-size: 18px;
                                color: rgba(255, 255, 255, 0.35);
                                text-align: center;
                                transition: all 0.5s ease-out;
                                opacity: 0.7;
                                transform: translateY(10px);
                            ">${this._escapeHtml(nextLine)}</div>
                        </div>
                        <style>
                            @keyframes lyrics-glow {
                                0%, 100% { background-position: 0% 50%; }
                                50% { background-position: 100% 50%; }
                            }
                        </style>`;
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('MusicPlayer', '歌词容器获取失败');
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MusicPlayer', '同步歌词失败: ' + e.message);
                }
                if (typeof ExceptionHandler !== 'undefined') {
                    ExceptionHandler.reportException(
                        ExceptionHandler.ExceptionLevel.SERVICE,
                        'MusicPlayer 同步歌词失败',
                        { error: e.message, stack: e.stack }
                    );
                }
            }
        },

        _escapeHtml: function(text) {
            if (!text) return '';
            return text.replace(/&/g, '&amp;')
                       .replace(/</g, '&lt;')
                       .replace(/>/g, '&gt;')
                       .replace(/"/g, '&quot;');
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

        _cleanup: async function() {
            try {
                this._isExiting = true;
                this._disableDesktopLyrics();
                this._stopLyricsSync();
                this._previewElement = null;
                
                if (this.iframe) {
                    if (this.iframe.parentElement) {
                        this.iframe.parentElement.removeChild(this.iframe);
                    }
                    this.iframe.src = 'about:blank';
                    this.iframe = null;
                }
                
                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                
                if (this._messageHandler) {
                    window.removeEventListener('message', this._messageHandler);
                    this._messageHandler = null;
                }
                if (this._volumeChangeHandler && typeof document !== 'undefined') {
                    document.removeEventListener('zeros-system-volume-change', this._volumeChangeHandler);
                    this._volumeChangeHandler = null;
                }
                
                this.window = null;
                this.windowId = null;
                this._kitemusicState = { name: '', artist: '', isPlaying: false, cover: '', lyrics: [], currentIndex: -1, progress: 0 };
                this._desktopLyricsEnabled = false;
                this._desktopLyricsComponentId = null;
                
                if (this._cacheHelper) {
                    if (this._cacheHelper.cleanup) {
                        this._cacheHelper.cleanup();
                    }
                    await this._cacheHelper.clear();
                    this._cacheHelper = null;
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('MusicPlayer', '清理失败', e);
            }
        },

        _initCacheHelper: function(initArgs) {
            var self = this;
            var cachePrefix = 'kitemusic.';
            var cleanupInterval = null;
            
            // 启动定期清理缓存的定时器
            function startCleanupInterval() {
                // 每10分钟清理一次过期缓存
                cleanupInterval = setInterval(async function() {
                    try {
                        if (initArgs.kernelAPI && typeof initArgs.kernelAPI.call === 'function') {
                            var pid = initArgs.pid || 0;
                            // 只清理过期缓存
                            await initArgs.kernelAPI.call('Cache.clear', [{ 
                                pid: pid, 
                                expiredOnly: true 
                            }]);
                        }
                    } catch (e) {}
                }, 10 * 60 * 1000);
            }
            
            // 启动清理定时器
            startCleanupInterval();
            
            this._cacheHelper = {
                set: async function(key, value) {
                    if (!initArgs.kernelAPI || typeof initArgs.kernelAPI.call !== 'function') return;
                    try {
                        // 检查键是否已经包含kitemusic.前缀
                        var finalKey = key.startsWith('kitemusic.') ? key : 'kitemusic.' + key;
                        // 设置10分钟的过期时间
                        await initArgs.kernelAPI.call('Cache.set', [
                            finalKey,
                            value,
                            { ttl: 10 * 60 * 1000, fileCache: true }
                        ]);
                    } catch (e) {}
                },
                get: async function(key, defaultValue) {
                    if (!initArgs.kernelAPI || typeof initArgs.kernelAPI.call !== 'function') return defaultValue;
                    try {
                        // 检查键是否已经包含kitemusic.前缀
                        var finalKey = key.startsWith('kitemusic.') ? key : 'kitemusic.' + key;
                        var result = await initArgs.kernelAPI.call('Cache.get', [
                            finalKey,
                            defaultValue
                        ]);
                        return result;
                    } catch (e) {
                        return defaultValue;
                    }
                },
                clear: async function() {
                    if (!initArgs.kernelAPI || typeof initArgs.kernelAPI.call !== 'function') return;
                    try {
                        var pid = initArgs.pid || 0;
                        await initArgs.kernelAPI.call('Cache.clear', [{ 
                            pid: pid 
                        }]);
                    } catch (e) {}
                },
                saveToParent: function(key, value) {
                    if (!key || !value) return;
                    try {
                        parent.postMessage({
                            type: 'kitemusic-cache-set',
                            key: cachePrefix + key,
                            value: value
                        }, '*');
                    } catch (e) {}
                },
                syncAllToParent: async function() {
                    if (!initArgs.kernelAPI || typeof initArgs.kernelAPI.call !== 'function') return;
                    try {
                        var pid = initArgs.pid || 0;
                        var stats = await initArgs.kernelAPI.call('Cache.getStats', [{ pid: pid }]);
                        if (stats && stats.validCount > 0) {
                            var allKeys = self._getAllCacheKeys();
                            for (var i = 0; i < allKeys.length; i++) {
                                var key = allKeys[i];
                                var value = await initArgs.kernelAPI.call('Cache.get', [
                                    key,
                                    null
                                ]);
                                if (value && typeof value === 'object' && value.code === 200) {
                                    parent.postMessage({
                                        type: 'kitemusic-cache-set',
                                        key: key,
                                        value: value
                                    }, '*');
                                }
                            }
                        }
                    } catch (e) {}
                },
                _getAllCacheKeys: function() {
                    return [
                        'kitemusic./user/playlist',
                        'kitemusic./user/playlist&uid=',
                        'kitemusic./likelist',
                        'kitemusic./playlist/detail&id=',
                        'kitemusic./song/detail&ids='
                    ];
                },
                cleanup: function() {
                    if (cleanupInterval) {
                        clearInterval(cleanupInterval);
                        cleanupInterval = null;
                    }
                }
            };
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
                    PermissionManager.PERMISSION.NETWORK_ACCESS,
                    PermissionManager.PERMISSION.CACHE_READ,
                    PermissionManager.PERMISSION.CACHE_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE
                ] : []
            };
        },

        __exit__: async function() {
            await this._cleanup();
        }
    };

    if (typeof window !== 'undefined') window.MUSICPLAYER = MUSICPLAYER;
    else if (typeof globalThis !== 'undefined') globalThis.MUSICPLAYER = MUSICPLAYER;
})(window);
