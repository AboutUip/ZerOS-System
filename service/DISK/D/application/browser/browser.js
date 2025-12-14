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
        currentUrl: 'https://www.baidu.com',
        history: [], // 浏览历史记录
        historyIndex: -1, // 当前历史记录索引
        backBtn: null,
        forwardBtn: null,
        bookmarks: [], // 书签列表
        
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
                
                GUIManager.registerWindow(pid, this.window, {
                    title: '浏览器',
                    icon: icon,
                    onClose: () => {
                        if (typeof ProcessManager !== 'undefined') {
                            ProcessManager.killProgram(this.pid);
                        }
                    }
                });
            }
            
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
            addressBar.placeholder = '输入网址或搜索...';
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
         * 获取 NetworkManager 实例（辅助函数）
         */
        _getNetworkManager: function() {
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    return POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
                } catch (e) {
                    // 忽略错误
                }
            }
            // 降级：尝试从全局对象获取
            if (typeof window !== 'undefined' && window.NetworkManager) {
                return window.NetworkManager;
            } else if (typeof globalThis !== 'undefined' && globalThis.NetworkManager) {
                return globalThis.NetworkManager;
            }
            return null;
        },
        
        /**
         * 导航到指定URL
         */
        _navigateTo: function(url, addToHistory = true) {
            if (!this.iframe) return;
            
            // 验证URL
            try {
                new URL(url);
            } catch (e) {
                console.error('[Browser] 无效的URL:', url);
                this._showError('无效的URL: ' + url);
                return;
            }
            
            // 添加到历史记录
            if (addToHistory) {
                // 如果当前不在历史记录末尾，删除后面的记录
                if (this.historyIndex < this.history.length - 1) {
                    this.history = this.history.slice(0, this.historyIndex + 1);
                }
                // 添加到历史记录
                this.history.push(url);
                this.historyIndex = this.history.length - 1;
                this._updateNavigationButtons();
            }
            
            this.currentUrl = url;
            if (this.addressBar) {
                this.addressBar.value = url;
            }
            
            // 添加加载动画
            this.iframe.classList.add('loading');
            this._showLoading(true);
            
            // 通过 NetworkManager 记录网络请求（如果可用）
            // 注意：iframe.src 的加载会自动被 NetworkManager 拦截（在降级模式下）
            // 这里我们只是确保 NetworkManager 已初始化
            
            // 设置iframe源（iframe 的加载会被 NetworkManager 自动拦截）
            this.iframe.src = url;
            
            // 监听加载完成
            this.iframe.onload = () => {
                this.iframe.classList.remove('loading');
                this._showLoading(false);
                
                if (this.addressBar) {
                    try {
                        // 尝试获取iframe的实际URL（可能因为跨域限制失败）
                        const iframeUrl = this.iframe.contentWindow.location.href;
                        this.addressBar.value = iframeUrl;
                        this.currentUrl = iframeUrl;
                        // 更新历史记录中的URL（如果不同）
                        if (addToHistory && this.historyIndex >= 0) {
                            this.history[this.historyIndex] = iframeUrl;
                        }
                        
                        // 尝试注入导航拦截脚本（仅对同源页面有效）
                        setTimeout(() => {
                            this._injectNavigationInterceptor();
                        }, 100);
                    } catch (e) {
                        // 跨域限制，使用设置的URL
                        this.addressBar.value = url;
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
                    console.warn('[Browser] 无法后退:', e);
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
                    console.warn('[Browser] 无法前进:', e);
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
                        text.textContent = '正在加载...';
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
                console.error('[Browser] 加载书签失败:', error);
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
                console.error('[Browser] 保存书签失败:', error);
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
         * 创建内容区域（iframe）
         */
        _createContent: function() {
            const content = document.createElement('div');
            content.className = 'browser-content';
            
            const iframe = document.createElement('iframe');
            iframe.className = 'browser-iframe';
            iframe.frameBorder = '0';
            iframe.allow = 'fullscreen';
            // 使用 sandbox 属性限制导航，但允许必要的功能
            // allow-scripts: 允许脚本执行
            // allow-same-origin: 允许同源访问（用于注入脚本拦截链接）
            // allow-forms: 允许表单提交
            // allow-popups: 允许弹窗（但我们会拦截）
            // allow-top-navigation: 禁止顶级导航（防止跳出）
            iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';
            iframe.referrerPolicy = 'no-referrer-when-downgrade';
            iframe.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
                background: #ffffff;
            `;
            
            this.iframe = iframe;
            content.appendChild(iframe);
            
            // 加载指示器
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'browser-loading-indicator';
            loadingIndicator.style.display = 'none';
            loadingIndicator.innerHTML = `
                <div class="browser-loading-spinner"></div>
                <div class="browser-loading-text">正在加载...</div>
            `;
            content.appendChild(loadingIndicator);
            
            return content;
        },
        
        /**
         * 注入脚本拦截链接和导航（仅对同源页面有效）
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
                    // 跨域，无法注入脚本
                    return;
                }
                
                // 同源，可以注入脚本
                const self = this;
                
                // 拦截所有链接点击
                const interceptLinks = () => {
                    const links = iframeDocument.querySelectorAll('a[href]');
                    links.forEach(link => {
                        // 移除旧的事件监听器（如果存在）
                        const newLink = link.cloneNode(true);
                        link.parentNode.replaceChild(newLink, link);
                        
                        newLink.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            const href = newLink.getAttribute('href');
                            const target = newLink.getAttribute('target');
                            
                            // 移除 target 属性，确保在浏览器内打开
                            if (target) {
                                newLink.removeAttribute('target');
                            }
                            
                            if (href) {
                                let targetUrl = href;
                                
                                // 处理相对URL
                                if (href.startsWith('#')) {
                                    // 锚点链接，在iframe内处理
                                    // 允许默认行为（滚动到锚点）
                                    try {
                                        const anchor = iframeDocument.querySelector(href);
                                        if (anchor) {
                                            anchor.scrollIntoView({ behavior: 'smooth' });
                                        }
                                    } catch (e) {
                                        // 忽略错误
                                    }
                                    return;
                                } else if (href.startsWith('/')) {
                                    // 绝对路径
                                    try {
                                        const currentUrl = new URL(iframeWindow.location.href);
                                        targetUrl = currentUrl.origin + href;
                                    } catch (e) {
                                        console.warn('[Browser] 无法解析相对URL:', href);
                                        return;
                                    }
                                } else if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                                    // 相对路径
                                    try {
                                        const currentUrl = new URL(iframeWindow.location.href);
                                        targetUrl = new URL(href, currentUrl.href).href;
                                    } catch (e) {
                                        console.warn('[Browser] 无法解析相对URL:', href);
                                        return;
                                    }
                                } else if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                                    // 特殊协议，允许默认行为
                                    return;
                                }
                                
                                // 在浏览器内导航
                                self._navigateTo(targetUrl);
                            }
                        });
                    });
                };
                
                // 拦截 window.open
                const originalOpen = iframeWindow.open;
                iframeWindow.open = function(url, target, features) {
                    if (url) {
                        self._navigateTo(url);
                        return null; // 返回 null 表示不打开新窗口
                    }
                    return originalOpen.apply(this, arguments);
                };
                
                // 拦截 location 赋值（使用代理）
                try {
                    const locationProxy = new Proxy(iframeWindow.location, {
                        set: function(target, property, value) {
                            if (property === 'href' && value && typeof value === 'string') {
                                self._navigateTo(value);
                                return true;
                            }
                            target[property] = value;
                            return true;
                        }
                    });
                    
                    // 尝试替换 location（可能因为安全限制失败）
                    try {
                        Object.defineProperty(iframeWindow, 'location', {
                            get: function() {
                                return locationProxy;
                            },
                            configurable: true
                        });
                    } catch (e) {
                        // location 属性不可配置，跳过
                        console.debug('[Browser] 无法拦截 location 属性');
                    }
                } catch (e) {
                    // Proxy 不可用或 location 不可代理
                    console.debug('[Browser] 无法代理 location 对象');
                }
                
                // 拦截表单提交
                const forms = iframeDocument.querySelectorAll('form');
                forms.forEach(form => {
                    form.addEventListener('submit', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const action = form.getAttribute('action') || iframeWindow.location.href;
                        const method = form.getAttribute('method') || 'GET';
                        
                        if (method.toUpperCase() === 'GET') {
                            // GET 请求，构建查询字符串
                            const formData = new FormData(form);
                            const params = new URLSearchParams(formData);
                            const url = new URL(action, iframeWindow.location.href);
                            params.forEach((value, key) => {
                                url.searchParams.append(key, value);
                            });
                            self._navigateTo(url.href);
                        } else {
                            // POST 请求，显示提示（因为无法在iframe内提交POST）
                            console.warn('[Browser] POST 表单提交需要在浏览器内处理');
                            self._navigateTo(action);
                        }
                    });
                });
                
                // 初始拦截
                if (iframeDocument.readyState === 'loading') {
                    iframeDocument.addEventListener('DOMContentLoaded', interceptLinks);
                } else {
                    interceptLinks();
                }
                
                // 监听动态添加的链接
                const observer = new MutationObserver(() => {
                    interceptLinks();
                });
                observer.observe(iframeDocument.body, {
                    childList: true,
                    subtree: true
                });
                
            } catch (e) {
                // 跨域或其他错误，无法注入
                console.debug('[Browser] 无法注入导航拦截脚本（可能是跨域页面）:', e.message);
            }
        },
        
        /**
         * 程序退出
         */
        __exit__: function() {
            // 清理定时器
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            
            // 注销窗口
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
                pid: this.pid,
                status: this.window ? 'running' : 'exited',
                currentUrl: this.currentUrl,
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.NETWORK_ACCESS
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

