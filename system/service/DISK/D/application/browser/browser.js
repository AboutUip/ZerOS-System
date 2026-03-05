// ZerOS 浏览器
// 提供基于iframe的简单网页浏览功能
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const BROWSER = {
        pid: null,
        window: null,
        iframe: null,
        addressBar: null,
        bookmarksBar: null,
        currentUrl: 'https://www.bing.com/',
        history: [], // 浏览历史记录
        historyIndex: -1, // 当前历史记录索引
        backBtn: null,
        forwardBtn: null,
        bookmarks: [], // 书签列表

        /**
         * 获取当前语言下的本地化文本
         */
        _getText: function(key, fallback) {
            if (!key) return (fallback != null ? fallback : '');
            try {
                const LanguagesExpansion = (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function')
                    ? POOL.__GET__('KERNEL_GLOBAL_POOL', 'LanguagesExpansion')
                    : (typeof window !== 'undefined' ? window.LanguagesExpansion : null);
                if (LanguagesExpansion && typeof LanguagesExpansion.getText === 'function') {
                    const value = LanguagesExpansion.getText(key);
                    if (value && value !== key) return value;
                }
            } catch (e) {}
            return (fallback != null ? fallback : '');
        },
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'browser-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            
            // 如果 GUIManager 不可用，设置完整样式
            if (typeof GUIManager === 'undefined') {
                this.window.style.cssText = `
                    width: 1000px;
                    height: 700px;
                    display: flex;
                    flex-direction: column;
                    background: transparent;
                    border: 1px solid rgba(108, 142, 255, 0.3);
                    border-radius: 12px;
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(30px) saturate(180%);
                    -webkit-backdrop-filter: blur(30px) saturate(180%);
                    overflow: hidden;
                `;
            } else {
                this.window.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                `;
            }
            
            // 加载书签数据
            await this._loadBookmarksData();
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('browser');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: this._getText('BROWSER_TITLE', '浏览器'),
                    icon: icon,
                    onClose: () => {
                        // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                        // 窗口关闭由 GUIManager._closeWindow 统一处理
                        // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                        // 这样可以确保程序多实例（不同 PID）互不影响
                    }
                });
                // 保存窗口ID，用于精确清理
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 先等待代理 Service Worker 激活，再加载首屏，确保 iframe 文档被 SW 控制（脚本/XHR 经代理，避免 ERR_CONNECTION_RESET、CORS）
            await this._registerProxyServiceWorker();
            
            // 拦截 F5/刷新：在浏览器窗口内只刷新 iframe，不刷新整个应用
            this.window.addEventListener('keydown', (e) => {
                if (e.key === 'F5' || e.keyCode === 116) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.iframe && this.currentUrl) {
                        this._navigateTo(this.currentUrl, false);
                    }
                }
            }, true);
            
            // 创建工具栏
            const toolbar = this._createToolbar();
            this.window.appendChild(toolbar);
            
            // 创建书签栏
            const bookmarksBar = this._createBookmarksBar();
            this.bookmarksBar = bookmarksBar;
            this.window.appendChild(bookmarksBar);
            
            // 渲染书签
            this._loadBookmarks(bookmarksBar);
            
            // 创建内容区域（iframe）
            const content = this._createContent();
            this.window.appendChild(content);
            
            // 添加到GUI容器
            guiContainer.appendChild(this.window);
            
            // 加载默认页面
            this._navigateTo(this.currentUrl);
        },
        
        /**
         * 创建工具栏
         */
        _createToolbar: function() {
            const toolbar = document.createElement('div');
            toolbar.className = 'browser-toolbar';
            // 确保工具栏固定高度
            toolbar.style.cssText = `
                height: 56px;
                min-height: 56px;
                max-height: 56px;
                flex-shrink: 0;
                box-sizing: border-box;
                overflow: hidden;
            `;
            
            // 导航按钮组
            const navGroup = document.createElement('div');
            navGroup.className = 'browser-nav-group';
            
            // 后退按钮
            const backBtn = this._createToolbarButton('‹', '后退', () => {
                this._goBack();
            });
            this.backBtn = backBtn;
            navGroup.appendChild(backBtn);
            
            // 前进按钮
            const forwardBtn = this._createToolbarButton('›', '前进', () => {
                this._goForward();
            });
            this.forwardBtn = forwardBtn;
            navGroup.appendChild(forwardBtn);
            
            // 初始化按钮状态
            this._updateNavigationButtons();
            
            // 刷新按钮
            const refreshBtn = this._createToolbarButton('↻', '刷新', () => {
                if (this.iframe && this.currentUrl) {
                    // 重新加载当前页面
                    this._navigateTo(this.currentUrl, false);
                }
            });
            navGroup.appendChild(refreshBtn);
            
            toolbar.appendChild(navGroup);
            
            // 地址栏
            const addressBarContainer = document.createElement('div');
            addressBarContainer.className = 'browser-address-container';
            
            const addressBar = document.createElement('input');
            addressBar.className = 'browser-address-bar';
            addressBar.type = 'text';
            addressBar.placeholder = this._getText('BROWSER_PLACEHOLDER', '输入网址或搜索...');
            addressBar.value = this.currentUrl;
            addressBar.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this._handleAddressSubmit(addressBar.value);
                }
            });
            addressBar.addEventListener('focus', () => {
                addressBar.select();
            });
            
            this.addressBar = addressBar;
            addressBarContainer.appendChild(addressBar);
            
            // 转到按钮
            const goBtn = this._createToolbarButton('→', '转到', () => {
                this._handleAddressSubmit(addressBar.value);
            });
            addressBarContainer.appendChild(goBtn);
            
            toolbar.appendChild(addressBarContainer);
            
            return toolbar;
        },
        
        /**
         * 创建工具栏按钮
         */
        _createToolbarButton: function(text, title, onClick) {
            const btn = document.createElement('button');
            btn.className = 'browser-toolbar-btn';
            btn.textContent = text;
            btn.title = title;
            btn.addEventListener('click', onClick);
            return btn;
        },
        
        /**
         * 处理地址栏提交
         */
        _handleAddressSubmit: function(input) {
            let url = input.trim();
            
            // 如果没有协议，添加 https://
            if (!url.match(/^https?:\/\//i)) {
                // 检查是否是域名格式
                if (url.match(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)+$/)) {
                    url = 'https://' + url;
                } else {
                    // 否则作为搜索查询
                    url = 'https://www.bing.com/search?q=' + encodeURIComponent(url);
                }
            }
            
            this._navigateTo(url);
        },
        
        /**
         * 构建代理 URL（后端代理去掉禁止嵌入头并设置 frame-ancestors，允许 iframe 显示）
         * @param {string} targetUrl - 目标网页 URL
         * @returns {string} 代理服务 URL
         */
        /** 始终使用浏览器程序内 proxy.php 与同目录 browser-proxy-sw.js，不与 PHP 同目录 */
        _getProxyBase: function() {
            const origin = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (window.location && window.location.origin || '');
            try {
                if (document.currentScript && document.currentScript.src) {
                    const base = document.currentScript.src.replace(/\/[^/]*$/, '/');
                    if (base.indexOf('application/browser') !== -1 || base.indexOf('browser') !== -1) {
                        return base + 'proxy.php';
                    }
                }
            } catch (e) {}
            // 脚本非从 browser 路径加载时，使用浏览器程序固定路径（与 applicationAssets 中 D:/application/browser 对应）
            return origin + '/system/service/DISK/D/application/browser/proxy.php';
        },
        _buildProxyUrl: function(targetUrl) {
            const proxyBase = this._getProxyBase();
            return proxyBase + (proxyBase.indexOf('?') >= 0 ? '&' : '?') + 'url=' + encodeURIComponent(targetUrl);
        },
        /**
         * 注册代理 Service Worker，并返回 Promise，在 SW 激活后 resolve，确保首次导航的文档被 SW 控制（脚本/XHR 经代理）
         */
        _registerProxyServiceWorker: function() {
            if (!navigator.serviceWorker || !navigator.serviceWorker.register) {
                return Promise.resolve();
            }
            const proxyBase = this._getProxyBase();
            const swUrl = proxyBase.replace(/(proxy|BrowserProxy)\.php(\?.*)?$/i, 'browser-proxy-sw.js');
            let scope = '/system/service/';
            try {
                const pathname = new URL(proxyBase).pathname;
                if (pathname) scope = pathname.replace(/\/[^/]*$/, '/') || scope;
            } catch (e) {}
            return navigator.serviceWorker.register(swUrl, { scope: scope }).then(function(reg) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.debug('Browser', '代理 Service Worker 已注册', reg.scope);
                if (reg.installing) {
                    return new Promise(function(resolve) {
                        reg.installing.addEventListener('statechange', function() {
                            if (reg.active) resolve();
                        });
                    });
                }
                if (reg.waiting) {
                    return new Promise(function(resolve) {
                        reg.waiting.addEventListener('statechange', function() {
                            if (reg.active) resolve();
                        });
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    });
                }
                return reg.active ? Promise.resolve() : navigator.serviceWorker.ready;
            }).catch(function(err) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('Browser', '代理 Service Worker 注册失败', err);
            });
        },

        /**
         * 是否为目标可代理的 URL（仅 http/https）
         */
        _shouldUseProxy: function(url) {
            try {
                const parsed = new URL(url);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch (e) {
                return false;
            }
        },
        
        /**
         * 从代理 URL 中提取目标 URL
         * @param {string} href - 可能是代理 URL 的链接
         * @returns {string|null} 提取的目标 URL，非代理链接则返回 null
         */
        _extractUrlFromProxy: function(href) {
            try {
                const u = new URL(href, window.location.origin);
                const isProxyPath = u.pathname.indexOf('BrowserProxy') !== -1 || (u.pathname.indexOf('browser') !== -1 && u.pathname.indexOf('proxy.php') !== -1);
                if (isProxyPath && u.searchParams.has('url')) {
                    return u.searchParams.get('url');
                }
            } catch (e) {
                // 忽略
            }
            return null;
        },
        
        /**
         * 导航到指定 URL。外部 http(s) 一律经代理加载（后端去掉禁止嵌入头并设置 frame-ancestors）。
         */
        _navigateTo: function(url, addToHistory = true) {
            if (!this.iframe) return;

            try {
                new URL(url);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Browser', '无效的URL', url);
                }
                this._showError('无效的URL: ' + url);
                return;
            }

            if (addToHistory) {
                if (this.historyIndex < this.history.length - 1) {
                    this.history = this.history.slice(0, this.historyIndex + 1);
                }
                this.history.push(url);
                this.historyIndex = this.history.length - 1;
                this._updateNavigationButtons();
            }

            this.currentUrl = url;
            if (this.addressBar) {
                this.addressBar.value = url;
            }

            this.iframe.classList.add('loading');
            this._showLoading(true);

            const useProxy = this._shouldUseProxy(url);
            const iframeSrc = useProxy ? this._buildProxyUrl(url) : url;
            this.iframe.src = iframeSrc;

            this.iframe.onload = () => {
                this.iframe.classList.remove('loading');
                this._showLoading(false);
                if (this.addressBar) {
                    if (useProxy) {
                        this.addressBar.value = this.currentUrl;
                        this._injectNavigationInterceptor();
                    } else {
                        try {
                            const iframeUrl = this.iframe.contentWindow.location.href;
                            this.addressBar.value = iframeUrl;
                            this.currentUrl = iframeUrl;
                            if (addToHistory && this.historyIndex >= 0) {
                                this.history[this.historyIndex] = iframeUrl;
                            }
                            this._injectNavigationInterceptor();
                        } catch (e) {
                            this.addressBar.value = url;
                        }
                    }
                }
            };

            this.iframe.onerror = () => {
                this.iframe.classList.remove('loading');
                this._showLoading(false);
                this._showError('加载失败: ' + url);
            };
        },
        
        /**
         * 后退
         */
        _goBack: function() {
            if (this.historyIndex > 0) {
                this.historyIndex--;
                const url = this.history[this.historyIndex];
                this._navigateTo(url, false);
            } else if (this.iframe && this.iframe.contentWindow) {
                try {
                    this.iframe.contentWindow.history.back();
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('Browser', '无法后退', e);
                    }
                }
            }
        },
        
        /**
         * 前进
         */
        _goForward: function() {
            if (this.historyIndex < this.history.length - 1) {
                this.historyIndex++;
                const url = this.history[this.historyIndex];
                this._navigateTo(url, false);
            } else if (this.iframe && this.iframe.contentWindow) {
                try {
                    this.iframe.contentWindow.history.forward();
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('Browser', '无法前进', e);
                    }
                }
            }
        },
        
        /**
         * 更新导航按钮状态
         */
        _updateNavigationButtons: function() {
            if (this.backBtn) {
                const canGoBack = this.historyIndex > 0;
                this.backBtn.disabled = !canGoBack;
                this.backBtn.style.opacity = canGoBack ? '1' : '0.5';
                this.backBtn.style.cursor = canGoBack ? 'pointer' : 'not-allowed';
            }
            if (this.forwardBtn) {
                const canGoForward = this.historyIndex < this.history.length - 1;
                this.forwardBtn.disabled = !canGoForward;
                this.forwardBtn.style.opacity = canGoForward ? '1' : '0.5';
                this.forwardBtn.style.cursor = canGoForward ? 'pointer' : 'not-allowed';
            }
        },
        
        /**
         * 显示/隐藏加载指示器
         */
        _showLoading: function(show) {
            const loadingIndicator = this.window?.querySelector('.browser-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = show ? 'flex' : 'none';
            }
        },
        
        /**
         * 显示错误信息
         */
        _showError: function(message) {
            const loadingIndicator = this.window?.querySelector('.browser-loading-indicator');
            if (loadingIndicator) {
                const text = loadingIndicator.querySelector('.browser-loading-text');
                if (text) {
                    text.textContent = message;
                    text.style.color = 'rgba(255, 100, 100, 0.9)';
                    loadingIndicator.style.display = 'flex';
                    // 3秒后恢复
                    setTimeout(() => {
                        text.textContent = this._getText('BROWSER_LOADING', '正在加载...');
                        text.style.color = 'rgba(215, 224, 221, 0.8)';
                        loadingIndicator.style.display = 'none';
                    }, 3000);
                }
            }
        },
        
        /**
         * 创建书签栏
         */
        _createBookmarksBar: function() {
            const bar = document.createElement('div');
            bar.className = 'browser-bookmarks-bar';
            // 确保书签栏固定高度
            bar.style.cssText = `
                height: 40px;
                min-height: 40px;
                max-height: 40px;
                flex-shrink: 0;
                box-sizing: border-box;
            `;
            
            // 加载书签
            this._loadBookmarks(bar);
            
            return bar;
        },
        
        /**
         * 加载书签数据（从LStorage）
         */
        _loadBookmarksData: async function() {
            try {
                if (typeof LStorage === 'undefined') {
                    // 使用默认书签
                    this.bookmarks = [
                        { name: "必应", url: "https://www.bing.com" },
                        { name: "GitHub", url: "https://github.com" }
                    ];
                    return;
                }
                
                // 确保LStorage已初始化
                if (!LStorage._initialized) {
                    await LStorage.init();
                }
                
                // 从LStorage获取书签数据
                const bookmarksData = await LStorage.getSystemStorage('browser.bookmarks');
                
                if (bookmarksData && Array.isArray(bookmarksData) && bookmarksData.length > 0) {
                    this.bookmarks = bookmarksData;
                } else {
                    // 使用默认书签
                    this.bookmarks = [
                        { name: "必应", url: "https://www.bing.com" },
                        { name: "GitHub", url: "https://github.com" }
                    ];
                    // 保存默认书签
                    await this._saveBookmarksData();
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Browser', '加载书签失败', error);
                }
                if (typeof ExceptionHandler !== 'undefined') {
                    ExceptionHandler.reportException(
                        ExceptionHandler.ExceptionLevel.SERVICE,
                        'Browser 加载书签失败',
                        { error: error.message, stack: error.stack }
                    );
                }
                // 使用默认书签
                this.bookmarks = [
                    { name: "必应", url: "https://www.bing.com" },
                    { name: "GitHub", url: "https://github.com" }
                ];
            }
        },
        
        /**
         * 保存书签数据（到LStorage）
         */
        _saveBookmarksData: async function() {
            try {
                if (typeof LStorage === 'undefined') {
                    return;
                }
                
                // 确保LStorage已初始化
                if (!LStorage._initialized) {
                    await LStorage.init();
                }
                
                // 保存到LStorage
                await LStorage.setSystemStorage('browser.bookmarks', this.bookmarks);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Browser', '保存书签失败', error);
                }
            }
        },
        
        /**
         * 加载书签（渲染到UI）
         */
        _loadBookmarks: function(container) {
            // 清空容器
            container.innerHTML = '';
            
            // 使用已加载的书签数据
            const bookmarks = this.bookmarks || [];
            
            // 创建书签项
            bookmarks.forEach((bookmark, index) => {
                if (!bookmark || !bookmark.name || !bookmark.url) return;
                
                const item = document.createElement('button');
                item.className = 'browser-bookmark-item';
                item.textContent = bookmark.name;
                item.title = bookmark.url;
                item.addEventListener('click', () => {
                    this._navigateTo(bookmark.url);
                });
                
                // 添加动画延迟
                item.style.animationDelay = `${index * 0.05}s`;
                
                container.appendChild(item);
            });
        },
        
        /**
         * 添加书签
         */
        addBookmark: async function(name, url) {
            if (!name || !url) {
                return false;
            }
            
            // 检查是否已存在
            const exists = this.bookmarks.some(b => b.url === url);
            if (exists) {
                return false;
            }
            
            // 添加书签
            this.bookmarks.push({ name, url });
            
            // 保存到LStorage
            await this._saveBookmarksData();
            
            // 重新渲染书签栏
            if (this.bookmarksBar) {
                this._loadBookmarks(this.bookmarksBar);
            }
            
            return true;
        },
        
        /**
         * 删除书签
         */
        removeBookmark: async function(url) {
            const index = this.bookmarks.findIndex(b => b.url === url);
            if (index === -1) {
                return false;
            }
            
            // 删除书签
            this.bookmarks.splice(index, 1);
            
            // 保存到LStorage
            await this._saveBookmarksData();
            
            // 重新渲染书签栏
            if (this.bookmarksBar) {
                this._loadBookmarks(this.bookmarksBar);
            }
            
            return true;
        },
        
        /**
         * 创建内容区域（普通 iframe，外部页经代理加载故可嵌入）
         */
        _createContent: function() {
            const content = document.createElement('div');
            content.className = 'browser-content';

            const iframe = document.createElement('iframe');
            iframe.className = 'browser-iframe';
            iframe.frameBorder = '0';
            iframe.allow = 'fullscreen';
            // sandbox：allow-scripts + allow-same-origin 为嵌入代理页所必需（脚本、cookie、父页注入拦截）；
            // 控制台 “escape its sandboxing” 为浏览器对二者同用时给出的提示，无法消除，实际通过不设 allow-top-navigation 与注入拦截限制跳出
            iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';
            iframe.referrerPolicy = 'no-referrer-when-downgrade';
            iframe.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
                background: #ffffff;
            `;
            
            this.iframe = iframe;
            iframe.name = 'browser-content-frame';
            content.appendChild(iframe);
            // 已移除加载弹窗（browser-loading-indicator）
            return content;
        },
        
        /**
         * 注入 fetch/XHR 代理：仅把请求基础地址改为代理（与 base 一致），其余不处理，绕过 CORS
         */
        _injectFetchXHRProxy: function(win, doc) {
            const script = doc.createElement('script');
            script.textContent = '(' + function() {
                var proxyBase = location.origin + location.pathname;
                function toProxyUrl(url) {
                    if (typeof url !== 'string') return url;
                    if (url.startsWith('http://') || url.startsWith('https://')) {
                        if (url.indexOf(proxyBase) === 0) return url;
                        return proxyBase + (proxyBase.indexOf('?') >= 0 ? '&' : '?') + 'url=' + encodeURIComponent(url);
                    }
                    return url;
                }
                var f = window.fetch;
                if (f) {
                    window.fetch = function(input, init) {
                        if (typeof input === 'string') input = toProxyUrl(input);
                        return f.call(this, input, init);
                    };
                }
                var X = window.XMLHttpRequest;
                if (X) {
                    window.XMLHttpRequest = function() {
                        var xhr = new X();
                        var open = xhr.open;
                        xhr.open = function(method, url, async, user, pass) {
                            return open.apply(this, [method, toProxyUrl(url), async !== false, user, pass]);
                        };
                        return xhr;
                    };
                }
            } + ')();';
            try {
                (doc.head || doc.documentElement).appendChild(script);
                script.remove();
            } catch (e) {}
        },

        /**
         * 注入脚本拦截链接和导航，并增强安全性
         * 注意：此方法仅对同源页面有效（跨域页面无法访问）
         */
        _injectNavigationInterceptor: function() {
            if (!this.iframe || !this.iframe.contentWindow) {
                return;
            }
            
            try {
                const iframeWindow = this.iframe.contentWindow;
                const iframeDocument = iframeWindow.document;
                
                // 检查是否同源
                try {
                    // 尝试访问 iframe 的 location，如果跨域会抛出异常
                    const test = iframeWindow.location.href;
                } catch (e) {
                    // 跨域，无法注入脚本（这是正常的，跨域页面无法访问）
                    return;
                }
                
                // 同源，可以注入脚本
                const self = this;
                this._injectFetchXHRProxy(iframeWindow, iframeDocument);
                // 从点击目标向上查找最近的 <a href>
                const findLink = (el) => {
                    while (el && el !== iframeDocument.body) {
                        if (el.tagName === 'A' && el.getAttribute('href')) return el;
                        el = el.parentElement;
                    }
                    return null;
                };
                
                // 解析链接 URL 为绝对地址
                const resolveLinkUrl = (href, linkEl) => {
                    if (!href) return null;
                    let targetUrl = href;
                    const extractedFromProxy = self._extractUrlFromProxy(href);
                    if (extractedFromProxy) return extractedFromProxy;
                    if (href.startsWith('#')) return null;
                    try {
                        const base = (self.currentUrl && self.currentUrl.startsWith('http')) ? self.currentUrl : (iframeWindow.location.href.startsWith('http') ? iframeWindow.location.href : 'https://example.com/');
                        return new URL(href, base).href;
                    } catch (e) {
                        return null;
                    }
                };
                
                // 拦截所有 http(s) 链接，在本窗口内打开（含 target=_blank/_top/_parent、Ctrl/中键），与代理注入逻辑一致
                const captureHandler = (e) => {
                    const link = findLink(e.target);
                    if (!link) return;
                    const href = link.getAttribute('href');
                    if (!href) return;
                    if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
                    if (href.startsWith('#')) {
                        try {
                            const anchor = iframeDocument.querySelector(href);
                            if (anchor) {
                                e.preventDefault();
                                anchor.scrollIntoView({ behavior: 'smooth' });
                            }
                        } catch (err) {}
                        return;
                    }
                    const targetUrl = resolveLinkUrl(href, link);
                    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    self._navigateTo(targetUrl);
                };
                
                ['click', 'auxclick'].forEach(ev => {
                    iframeDocument.addEventListener(ev, captureHandler, true);
                });
                
                // 拦截 window.open（防止通过 open 打开新窗口）
                const originalOpen = iframeWindow.open;
                iframeWindow.open = function(url, target, features) {
                    if (url) {
                        self._navigateTo(url);
                        return null; // 返回 null 表示不打开新窗口
                    }
                    return originalOpen.apply(this, arguments);
                };
                
                // 严格拦截 location：href 赋值、replace、assign、reload 均经代理，防止跳出标签页
                try {
                    const loc = iframeWindow.location;
                    const locationProxy = new Proxy(loc, {
                        set: function(target, property, value) {
                            if (property === 'href' && value && typeof value === 'string') {
                                self._navigateTo(value);
                                return true;
                            }
                            if (property === 'assign' || property === 'replace') return true;
                            target[property] = value;
                            return true;
                        },
                        get: function(target, property) {
                            if (property === 'replace') {
                                return function(url) {
                                    if (url && typeof url === 'string' && /^https?:\/\//i.test(url)) {
                                        self._navigateTo(url);
                                    } else {
                                        target.replace.apply(target, arguments);
                                    }
                                };
                            }
                            if (property === 'assign') {
                                return function(url) {
                                    if (url && typeof url === 'string' && /^https?:\/\//i.test(url)) {
                                        self._navigateTo(url);
                                    } else {
                                        target.assign.apply(target, arguments);
                                    }
                                };
                            }
                            if (property === 'reload') {
                                return function() {
                                    if (self.currentUrl) self._navigateTo(self.currentUrl, false);
                                    else target.reload.apply(target, arguments);
                                };
                            }
                            return target[property];
                        }
                    });
                    try {
                        Object.defineProperty(iframeWindow, 'location', {
                            get: function() { return locationProxy; },
                            configurable: true
                        });
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('Browser', '无法拦截 location 属性');
                        }
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('Browser', '无法代理 location 对象');
                    }
                }
                
                // 拦截表单提交（文档委托，包含动态添加的表单，如 Bing 结果页的搜索框）
                iframeDocument.addEventListener('submit', (e) => {
                    const form = e.target && e.target.tagName === 'FORM' ? e.target : null;
                    if (!form) return;
                    e.preventDefault();
                    e.stopPropagation();
                    
                    let action = form.getAttribute('action') || '';
                    const extractedFromProxy = action ? self._extractUrlFromProxy(action) : null;
                    if (extractedFromProxy) {
                        action = extractedFromProxy;
                    }
                    const baseHref = (self.currentUrl && self.currentUrl.startsWith('http')) ? self.currentUrl : 'https://example.com/';
                    const actionUrl = (action && !action.startsWith('about:')) ? action : baseHref.replace(/\?.*$/, '');
                    const method = (form.getAttribute('method') || 'GET').toUpperCase();
                    
                    try {
                        const fullActionUrl = new URL(actionUrl, baseHref).href;
                        if (method === 'POST' && self._shouldUseProxy(fullActionUrl)) {
                            const proxyUrl = self._buildProxyUrl(fullActionUrl);
                            const origAction = form.action;
                            const origTarget = form.target;
                            form.action = proxyUrl;
                            form.target = self.iframe && self.iframe.name ? self.iframe.name : '_self';
                            self.currentUrl = fullActionUrl;
                            if (self.addressBar) self.addressBar.value = fullActionUrl;
                            self.history.push(fullActionUrl);
                            self.historyIndex = self.history.length - 1;
                            self._updateNavigationButtons();
                            form.submit();
                            form.action = origAction;
                            form.target = origTarget;
                        } else {
                            const formData = new FormData(form);
                            const params = new URLSearchParams(formData);
                            const url = new URL(actionUrl, baseHref);
                            params.forEach((value, key) => {
                                url.searchParams.append(key, value);
                            });
                            self._navigateTo(url.href);
                        }
                    } catch (err) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('Browser', '表单 action URL 解析失败', { action, baseHref, err });
                        }
                    }
                }, true);
                
            } catch (e) {
                // 跨域或其他错误，无法注入
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('Browser', `无法注入导航拦截脚本（可能是跨域页面）: ${e.message}`);
                }
            }
        },
        
        /**
         * 程序退出
         */
        __exit__: function() {
            if (typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            }
            
            // 清理 DOM
            if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
            
            // 清理引用
            this.window = null;
            this.iframe = null;
            this.addressBar = null;
            this.bookmarksBar = null;
        },
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: '浏览器',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS 浏览器 - 基于iframe的简单网页浏览器',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                pid: this.pid,
                status: this.window ? 'running' : 'exited',
                currentUrl: this.currentUrl,
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.NETWORK_ACCESS,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,   // 读取书签
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE  // 保存书签
                ] : []
            };
        }
    };
    
    // 导出到全局
    if (typeof window !== 'undefined') {
        window.BROWSER = BROWSER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.BROWSER = BROWSER;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

