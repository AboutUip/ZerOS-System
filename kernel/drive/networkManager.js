// 全局网络管理器
// 使用 Service Worker 截取所有网络请求进行统一处理与管理
// 注意：此模块必须通过 BootLoader 加载

(function() {
    'use strict';
    
    // 检查 KernelLogger 是否可用
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("NetworkManager", "模块初始化");
    } else {
        console.log('[内核][NetworkManager] 模块初始化');
    }
    
    class NetworkManager {
        constructor() {
            this.serviceWorkerRegistration = null;
            this.serviceWorker = null;
            this.isRegistered = false;
            this.requestHandlers = new Map(); // 请求处理器映射
            this.requestInterceptors = []; // 请求拦截器列表
            this.responseInterceptors = []; // 响应拦截器列表
            this.requestCache = new Map(); // 请求缓存
            this.requestHistory = []; // 请求历史记录
            this.maxHistorySize = 1000; // 最大历史记录数
            this.networkStats = {
                totalRequests: 0,
                totalBytes: 0,
                failedRequests: 0,
                cachedRequests: 0
            };
            
            // 网络状态相关
            this.networkStateListeners = []; // 网络状态监听器列表
            this.connectionStateListeners = []; // 连接状态监听器列表
            this.lastNetworkState = null; // 上次网络状态
            this.lastConnectionInfo = null; // 上次连接信息
            this.batteryInfo = null; // 电池信息
            this.networkStateUpdateInterval = null; // 网络状态更新定时器
            
            // 网络启用/禁用控制
            this.networkEnabled = true; // 网络是否启用（默认启用）
            this.networkEnabledListeners = []; // 网络启用状态监听器列表
            
            // 初始化 Service Worker
            this._initServiceWorker();
            
            // 始终拦截网络请求（无论是否使用 Service Worker）
            this._interceptFetch();
            this._interceptXMLHttpRequest();
            
            // 初始化网络状态监控
            this._initNetworkStateMonitoring();
            
            // 初始化电池信息（如果支持）
            this._initBatteryInfo();
        }
        
        /**
         * 初始化 Service Worker
         */
        async _initServiceWorker() {
            // 检查 Service Worker 支持
            if (!('serviceWorker' in navigator)) {
                const error = 'Service Worker 不支持';
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("NetworkManager", error);
                } else {
                    console.warn(`[内核][NetworkManager] ${error}`);
                }
                return;
            }
            
            // 检查协议支持（Service Worker 只能在 http/https 下工作）
            const protocol = window.location.protocol;
            if (protocol === 'file:' || protocol === 'null:' || !protocol) {
                const error = `Service Worker 不支持当前协议: ${protocol || 'null'}，将使用降级模式`;
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("NetworkManager", error);
                } else {
                    console.warn(`[内核][NetworkManager] ${error}`);
                }
                // 降级模式：不使用 Service Worker，但提供基本功能
                this._initFallbackMode();
                return;
            }
            
            try {
                // 检查是否为 localhost 且使用 HTTPS（可能存在证书问题）
                const isLocalhost = window.location.hostname === 'localhost' || 
                                   window.location.hostname === '127.0.0.1' ||
                                   window.location.hostname === '[::1]';
                const isHTTPS = protocol === 'https:';
                
                // 对于 localhost 的 HTTPS，如果可能遇到证书问题，给出提示
                if (isLocalhost && isHTTPS) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("NetworkManager", "检测到 localhost HTTPS，如果遇到 SSL 证书错误，建议使用 HTTP 或信任证书");
                    }
                }
                
                // 注册 Service Worker
                // 注意：Service Worker 的作用域不能超过其所在目录
                // Service Worker 文件在 /kernel/drive/ 目录下，所以作用域只能是 /kernel/drive/ 或子目录
                // 使用绝对路径确保无论页面在哪个目录下都能正确找到 Service Worker
                // 绝对路径：/kernel/drive/networkServiceWorker.js（从网站根目录开始）
                const serviceWorkerPath = '/kernel/drive/networkServiceWorker.js';
                const serviceWorkerScope = '/kernel/drive/';
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("NetworkManager", `注册 Service Worker: ${serviceWorkerPath}, 作用域: ${serviceWorkerScope}`);
                }
                
                const registration = await navigator.serviceWorker.register(serviceWorkerPath, {
                    scope: serviceWorkerScope  // 作用域限制在 Service Worker 文件所在目录
                });
                
                this.serviceWorkerRegistration = registration;
                
                // 等待 Service Worker 激活
                if (registration.installing) {
                    await this._waitForServiceWorker(registration.installing);
                } else if (registration.waiting) {
                    await this._waitForServiceWorker(registration.waiting);
                } else if (registration.active) {
                    this.serviceWorker = registration.active;
                }
                
                // 监听 Service Worker 更新
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'activated') {
                                this.serviceWorker = newWorker;
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.info("NetworkManager", "Service Worker 已更新");
                                } else {
                                    console.log('[内核][NetworkManager] Service Worker 已更新');
                                }
                            }
                        });
                    }
                });
                
                // 监听来自 Service Worker 的消息
                navigator.serviceWorker.addEventListener('message', (event) => {
                    this._handleServiceWorkerMessage(event);
                });
                
                // 初始化时通知 Service Worker 当前网络状态
                if (this.serviceWorker) {
                    this._notifyServiceWorkerNetworkState(this.networkEnabled);
                } else {
                    // 如果 Service Worker 还未激活，等待激活后再通知
                    const checkAndNotify = () => {
                        if (this.serviceWorker) {
                            this._notifyServiceWorkerNetworkState(this.networkEnabled);
                        } else {
                            setTimeout(checkAndNotify, 100);
                        }
                    };
                    setTimeout(checkAndNotify, 100);
                }
                
                this.isRegistered = true;
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("NetworkManager", "Service Worker 注册成功");
                } else {
                    console.log('[内核][NetworkManager] Service Worker 注册成功');
                }
                
            } catch (error) {
                // 详细错误处理
                let errorMessage = error.message || String(error);
                let suggestions = [];
                
                // 检查是否为 SSL 证书错误
                if (errorMessage.includes('SSL') || 
                    errorMessage.includes('certificate') || 
                    errorMessage.includes('证书') ||
                    errorMessage.includes('ERR_CERT')) {
                    errorMessage = `SSL 证书错误: ${errorMessage}`;
                    suggestions.push('【推荐】对于本地开发，使用 HTTP 而不是 HTTPS（localhost 的 HTTP 也完全支持 Service Worker）');
                    suggestions.push('如果必须使用 HTTPS，请按以下步骤操作：');
                    suggestions.push('  - Chrome/Edge: 访问页面时，点击地址栏的"不安全"警告，选择"继续访问"或"高级" -> "继续访问 localhost（不安全）"');
                    suggestions.push('  - Firefox: 点击"高级" -> "接受风险并继续"');
                    suggestions.push('  - 或者生成并安装受信任的自签名证书到系统证书存储');
                    suggestions.push('注意：降级模式功能完整，不影响网络请求拦截功能');
                }
                
                // 检查是否为路径错误
                if (errorMessage.includes('Failed to register') || errorMessage.includes('404')) {
                    suggestions.push('检查 Service Worker 文件路径是否正确');
                    suggestions.push('确保 networkServiceWorker.js 文件存在于指定位置');
                }
                
                const fullMessage = `Service Worker 注册失败: ${errorMessage}${suggestions.length > 0 ? '\n建议:\n' + suggestions.join('\n') : ''}，将使用降级模式`;
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("NetworkManager", fullMessage, error);
                } else {
                    console.warn(`[内核][NetworkManager] ${fullMessage}`, error);
                }
                
                // 降级模式：不使用 Service Worker，但提供基本功能
                this._initFallbackMode();
            }
        }
        
        /**
         * 初始化降级模式（不使用 Service Worker）
         * 在降级模式下，通过拦截全局 fetch API 和 XMLHttpRequest 来实现网络请求监控
         * 注意：降级模式功能完整，只是不使用 Service Worker 进行拦截
         */
        _initFallbackMode() {
            // 始终拦截 fetch API（无论是否使用 Service Worker）
            this._interceptFetch();
            
            // 拦截 XMLHttpRequest
            this._interceptXMLHttpRequest();
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("NetworkManager", "已启用降级模式：网络请求拦截（fetch 和 XMLHttpRequest）。功能完整，无需 Service Worker。");
            } else {
                console.log('[内核][NetworkManager] 已启用降级模式：网络请求拦截（fetch 和 XMLHttpRequest）。功能完整，无需 Service Worker。');
            }
        }
        
        /**
         * 拦截全局 fetch API
         */
        _interceptFetch() {
            if (typeof window === 'undefined' || !window.fetch) {
                return;
            }
            
            const originalFetch = window.fetch;
            const self = this;
            
            window.fetch = function(...args) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : String(args[0]));
                const options = args[1] || {};
                
                // 只处理 HTTP/HTTPS 请求
                if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
                    return originalFetch.apply(this, args);
                }
                
                // 检查网络是否被禁用
                if (!self.networkEnabled) {
                    // 记录被拒绝的请求
                    self._handleInterceptedRequest({
                        url: url,
                        method: options.method || 'GET',
                        headers: options.headers || {},
                        body: options.body || null
                    });
                    
                    self._handleRequestFailed({
                        url: url,
                        error: 'Network is disabled by NetworkManager'
                    });
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("NetworkManager", `网络请求被拒绝: ${url} (网络已禁用)`);
                    }
                    
                    // 返回拒绝的 Promise
                    return Promise.reject(new Error('Network is disabled by NetworkManager'));
                }
                
                // 记录请求
                self._handleInterceptedRequest({
                    url: url,
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body || null
                });
                
                // 执行原始 fetch
                return originalFetch.apply(this, args)
                    .then(response => {
                        // 异步记录响应（不阻塞响应返回）
                        response.clone().text().then(body => {
                            self._handleResponseReceived({
                                url: url,
                                status: response.status,
                                statusText: response.statusText,
                                headers: Object.fromEntries(response.headers.entries()),
                                body: body.substring(0, 1000), // 只记录前1000字符
                                size: new Blob([body]).size
                            });
                        }).catch(() => {
                            // 忽略错误
                        });
                        
                        return response;
                    })
                    .catch(error => {
                        // 记录失败
                        self._handleRequestFailed({
                            url: url,
                            error: error.message
                        });
                        throw error;
                    });
            };
        }
        
        /**
         * 拦截 XMLHttpRequest
         */
        _interceptXMLHttpRequest() {
            if (typeof window === 'undefined' || !window.XMLHttpRequest) {
                return;
            }
            
            const self = this;
            const OriginalXHR = window.XMLHttpRequest;
            
            window.XMLHttpRequest = function(...args) {
                const xhr = new OriginalXHR(...args);
                const originalOpen = xhr.open;
                const originalSend = xhr.send;
                let requestUrl = null;
                let requestMethod = 'GET';
                let requestHeaders = {};
                
                // 拦截 open 方法
                xhr.open = function(method, url, ...rest) {
                    requestMethod = method;
                    requestUrl = url;
                    return originalOpen.apply(this, [method, url, ...rest]);
                };
                
                // 拦截 send 方法
                xhr.send = function(body) {
                    // 只处理 HTTP/HTTPS 请求
                    if (!requestUrl || (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://'))) {
                        return originalSend.apply(this, [body]);
                    }
                    
                    // 检查网络是否被禁用
                    if (!self.networkEnabled) {
                        // 记录被拒绝的请求
                        self._handleInterceptedRequest({
                            url: requestUrl,
                            method: requestMethod,
                            headers: requestHeaders,
                            body: body || null
                        });
                        
                        self._handleRequestFailed({
                            url: requestUrl,
                            error: 'Network is disabled by NetworkManager'
                        });
                        
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("NetworkManager", `XMLHttpRequest 被拒绝: ${requestUrl} (网络已禁用)`);
                        }
                        
                        // 触发 error 事件
                        setTimeout(() => {
                            if (xhr.onerror) {
                                xhr.onerror(new ErrorEvent('error', {
                                    message: 'Network is disabled by NetworkManager'
                                }));
                            }
                        }, 0);
                        
                        return;
                    }
                    
                    // 记录请求
                    self._handleInterceptedRequest({
                        url: requestUrl,
                        method: requestMethod,
                        headers: requestHeaders,
                        body: body || null
                    });
                    
                    // 监听响应
                    xhr.addEventListener('load', function() {
                        self._handleResponseReceived({
                            url: requestUrl,
                            status: xhr.status,
                            statusText: xhr.statusText,
                            headers: {},
                            body: xhr.responseText ? xhr.responseText.substring(0, 1000) : '',
                            size: xhr.responseText ? new Blob([xhr.responseText]).size : 0
                        });
                    });
                    
                    xhr.addEventListener('error', function() {
                        self._handleRequestFailed({
                            url: requestUrl,
                            error: 'XMLHttpRequest failed'
                        });
                    });
                    
                    // 执行原始 send
                    return originalSend.apply(this, [body]);
                };
                
                return xhr;
            };
        }
        
        /**
         * 等待 Service Worker 激活
         */
        _waitForServiceWorker(worker) {
            return new Promise((resolve) => {
                if (worker.state === 'activated') {
                    this.serviceWorker = worker;
                    resolve();
                    return;
                }
                
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'activated') {
                        this.serviceWorker = worker;
                        resolve();
                    }
                });
            });
        }
        
        /**
         * 处理来自 Service Worker 的消息
         */
        _handleServiceWorkerMessage(event) {
            const { type, data } = event.data;
            
            switch (type) {
                case 'REQUEST_INTERCEPTED':
                    this._handleInterceptedRequest(data);
                    break;
                case 'RESPONSE_RECEIVED':
                    this._handleResponseReceived(data);
                    break;
                case 'REQUEST_FAILED':
                    this._handleRequestFailed(data);
                    break;
                default:
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("NetworkManager", `未知的消息类型: ${type}`);
                    }
            }
        }
        
        /**
         * 处理被拦截的请求（内部方法，供 Service Worker 和降级模式使用）
         * @param {Object} data - 请求数据
         */
        _handleInterceptedRequest(data) {
            const { url, method, headers, body } = data;
            
            // 记录请求历史
            this._addToHistory({
                url,
                method,
                timestamp: Date.now(),
                status: 'pending'
            });
            
            // 更新统计信息
            this.networkStats.totalRequests++;
            
            // 执行请求拦截器
            for (const interceptor of this.requestInterceptors) {
                try {
                    interceptor({ url, method, headers, body });
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetworkManager", `请求拦截器执行失败: ${error.message}`, error);
                    }
                }
            }
        }
        
        /**
         * 处理接收到的响应（内部方法，供 Service Worker 和降级模式使用）
         * @param {Object} data - 响应数据
         */
        _handleResponseReceived(data) {
            const { url, status, statusText, headers, body, size } = data;
            
            // 更新请求历史
            this._updateHistory(url, {
                status: status,
                statusText: statusText,
                timestamp: Date.now(),
                size: size
            });
            
            // 更新统计信息
            if (size) {
                this.networkStats.totalBytes += size;
            }
            
            // 执行响应拦截器
            for (const interceptor of this.responseInterceptors) {
                try {
                    interceptor({ url, status, statusText, headers, body, size });
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetworkManager", `响应拦截器执行失败: ${error.message}`, error);
                    }
                }
            }
        }
        
        /**
         * 处理失败的请求（内部方法，供 Service Worker 和降级模式使用）
         * @param {Object} data - 失败数据
         */
        _handleRequestFailed(data) {
            const { url, error } = data;
            
            // 更新请求历史
            this._updateHistory(url, {
                status: 'failed',
                error: error,
                timestamp: Date.now()
            });
            
            // 更新统计信息
            this.networkStats.failedRequests++;
        }
        
        /**
         * 添加到请求历史
         */
        _addToHistory(request) {
            this.requestHistory.unshift(request);
            if (this.requestHistory.length > this.maxHistorySize) {
                this.requestHistory.pop();
            }
        }
        
        /**
         * 更新请求历史
         */
        _updateHistory(url, updates) {
            const request = this.requestHistory.find(r => r.url === url && r.status === 'pending');
            if (request) {
                Object.assign(request, updates);
            }
        }
        
        /**
         * 注册请求处理器
         * @param {string} pattern - URL 匹配模式（支持正则表达式字符串）
         * @param {Function} handler - 处理函数
         */
        registerRequestHandler(pattern, handler) {
            if (typeof handler !== 'function') {
                throw new Error('处理器必须是函数');
            }
            
            this.requestHandlers.set(pattern, handler);
            
            // 通知 Service Worker 更新处理器列表
            if (this.serviceWorker) {
                this.serviceWorker.postMessage({
                    type: 'REGISTER_HANDLER',
                    data: { pattern, handler: null } // Service Worker 中会重新注册
                });
            }
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("NetworkManager", `注册请求处理器: ${pattern}`);
            }
        }
        
        /**
         * 注销请求处理器
         * @param {string} pattern - URL 匹配模式
         */
        unregisterRequestHandler(pattern) {
            this.requestHandlers.delete(pattern);
            
            // 通知 Service Worker 移除处理器
            if (this.serviceWorker) {
                this.serviceWorker.postMessage({
                    type: 'UNREGISTER_HANDLER',
                    data: { pattern }
                });
            }
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("NetworkManager", `注销请求处理器: ${pattern}`);
            }
        }
        
        /**
         * 添加请求拦截器
         * @param {Function} interceptor - 拦截器函数
         */
        addRequestInterceptor(interceptor) {
            if (typeof interceptor !== 'function') {
                throw new Error('拦截器必须是函数');
            }
            
            this.requestInterceptors.push(interceptor);
        }
        
        /**
         * 移除请求拦截器
         * @param {Function} interceptor - 拦截器函数
         */
        removeRequestInterceptor(interceptor) {
            const index = this.requestInterceptors.indexOf(interceptor);
            if (index > -1) {
                this.requestInterceptors.splice(index, 1);
            }
        }
        
        /**
         * 添加响应拦截器
         * @param {Function} interceptor - 拦截器函数
         */
        addResponseInterceptor(interceptor) {
            if (typeof interceptor !== 'function') {
                throw new Error('拦截器必须是函数');
            }
            
            this.responseInterceptors.push(interceptor);
        }
        
        /**
         * 移除响应拦截器
         * @param {Function} interceptor - 拦截器函数
         */
        removeResponseInterceptor(interceptor) {
            const index = this.responseInterceptors.indexOf(interceptor);
            if (index > -1) {
                this.responseInterceptors.splice(index, 1);
            }
        }
        
        /**
         * 获取请求历史
         * @param {Object} options - 查询选项
         * @returns {Array} 请求历史列表
         */
        getRequestHistory(options = {}) {
            let history = [...this.requestHistory];
            
            // 按 URL 过滤
            if (options.url) {
                const urlPattern = new RegExp(options.url);
                history = history.filter(r => urlPattern.test(r.url));
            }
            
            // 按方法过滤
            if (options.method) {
                history = history.filter(r => r.method === options.method);
            }
            
            // 按状态过滤
            if (options.status) {
                if (typeof options.status === 'number') {
                    history = history.filter(r => r.status === options.status);
                } else if (options.status === 'failed') {
                    history = history.filter(r => r.status === 'failed');
                } else if (options.status === 'pending') {
                    history = history.filter(r => r.status === 'pending');
                }
            }
            
            // 按时间范围过滤
            if (options.startTime) {
                history = history.filter(r => r.timestamp >= options.startTime);
            }
            if (options.endTime) {
                history = history.filter(r => r.timestamp <= options.endTime);
            }
            
            // 限制返回数量
            if (options.limit) {
                history = history.slice(0, options.limit);
            }
            
            return history;
        }
        
        /**
         * 清除请求历史
         */
        clearRequestHistory() {
            this.requestHistory = [];
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("NetworkManager", "请求历史已清除");
            }
        }
        
        /**
         * 获取网络统计信息
         * @returns {Object} 统计信息
         */
        getNetworkStats() {
            return {
                ...this.networkStats,
                cacheSize: this.requestCache.size,
                historySize: this.requestHistory.length
            };
        }
        
        /**
         * 重置网络统计信息
         */
        resetNetworkStats() {
            this.networkStats = {
                totalRequests: 0,
                totalBytes: 0,
                failedRequests: 0,
                cachedRequests: 0
            };
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("NetworkManager", "网络统计信息已重置");
            }
        }
        
        /**
         * 设置请求缓存
         * @param {string} url - 请求 URL
         * @param {Object} response - 响应数据
         * @param {number} ttl - 缓存生存时间（毫秒）
         */
        setCache(url, response, ttl = 60000) {
            this.requestCache.set(url, {
                response,
                timestamp: Date.now(),
                ttl
            });
            
            // 自动清理过期缓存
            setTimeout(() => {
                this.requestCache.delete(url);
            }, ttl);
        }
        
        /**
         * 获取请求缓存
         * @param {string} url - 请求 URL
         * @returns {Object|null} 缓存的响应数据
         */
        getCache(url) {
            const cached = this.requestCache.get(url);
            if (!cached) {
                return null;
            }
            
            // 检查是否过期
            if (Date.now() - cached.timestamp > cached.ttl) {
                this.requestCache.delete(url);
                return null;
            }
            
            return cached.response;
        }
        
        /**
         * 清除请求缓存
         * @param {string} url - 可选的 URL，如果提供则只清除该 URL 的缓存
         */
        clearCache(url) {
            if (url) {
                this.requestCache.delete(url);
            } else {
                this.requestCache.clear();
            }
        }
        
        /**
         * 发送网络请求（通过 Service Worker）
         * @param {string} url - 请求 URL
         * @param {Object} options - 请求选项
         * @returns {Promise<Response>} 响应 Promise
         */
        async fetch(url, options = {}) {
            // 检查网络是否被禁用
            if (!this.networkEnabled) {
                const error = new Error('Network is disabled by NetworkManager');
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("NetworkManager", `网络请求被拒绝: ${url} (网络已禁用)`);
                }
                throw error;
            }
            
            // 检查缓存
            const cached = this.getCache(url);
            if (cached) {
                this.networkStats.cachedRequests++;
                return new Response(cached.body, {
                    status: cached.status,
                    statusText: cached.statusText,
                    headers: cached.headers
                });
            }
            
            // 通过 Service Worker 发送请求
            if (this.serviceWorker) {
                try {
                    const response = await fetch(url, options);
                    
                    // 缓存响应
                    const responseData = {
                        status: response.status,
                        statusText: response.statusText,
                        headers: Object.fromEntries(response.headers.entries()),
                        body: await response.clone().text()
                    };
                    this.setCache(url, responseData);
                    
                    return response;
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetworkManager", `请求失败: ${url}`, error);
                    }
                    throw error;
                }
            } else {
                // 降级：直接使用原生 fetch
                return fetch(url, options);
            }
        }
        
        /**
         * 启用网络
         */
        enableNetwork() {
            if (this.networkEnabled) {
                return; // 已经启用
            }
            
            this.networkEnabled = true;
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("NetworkManager", "网络已启用");
            }
            
            // 通知 Service Worker
            this._notifyServiceWorkerNetworkState(true);
            
            // 通知所有监听器
            this._notifyNetworkEnabledListeners(true);
        }
        
        /**
         * 禁用网络
         */
        disableNetwork() {
            if (!this.networkEnabled) {
                return; // 已经禁用
            }
            
            this.networkEnabled = false;
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("NetworkManager", "网络已禁用");
            }
            
            // 通知 Service Worker
            this._notifyServiceWorkerNetworkState(false);
            
            // 通知所有监听器
            this._notifyNetworkEnabledListeners(false);
        }
        
        /**
         * 通知 Service Worker 网络状态变化
         * @param {boolean} enabled - 是否启用
         */
        _notifyServiceWorkerNetworkState(enabled) {
            if (this.serviceWorker) {
                try {
                    this.serviceWorker.postMessage({
                        type: 'NETWORK_ENABLED',
                        data: { enabled: enabled }
                    });
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("NetworkManager", `通知 Service Worker 网络状态失败: ${error.message}`);
                    }
                }
            }
        }
        
        /**
         * 检查网络是否启用
         * @returns {boolean} 网络是否启用
         */
        isNetworkEnabled() {
            return this.networkEnabled;
        }
        
        /**
         * 切换网络启用状态
         * @returns {boolean} 切换后的状态
         */
        toggleNetwork() {
            if (this.networkEnabled) {
                this.disableNetwork();
            } else {
                this.enableNetwork();
            }
            return this.networkEnabled;
        }
        
        /**
         * 添加网络启用状态监听器
         * @param {Function} listener - 监听器函数
         * @returns {Function} 取消监听的函数
         */
        addNetworkEnabledListener(listener) {
            if (typeof listener !== 'function') {
                throw new Error('监听器必须是函数');
            }
            
            this.networkEnabledListeners.push(listener);
            
            // 立即调用一次，传递当前状态
            try {
                listener(this.networkEnabled);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("NetworkManager", `网络启用状态监听器初始化失败: ${error.message}`, error);
                }
            }
            
            // 返回取消监听的函数
            return () => {
                const index = this.networkEnabledListeners.indexOf(listener);
                if (index > -1) {
                    this.networkEnabledListeners.splice(index, 1);
                }
            };
        }
        
        /**
         * 移除网络启用状态监听器
         * @param {Function} listener - 要移除的监听器函数
         */
        removeNetworkEnabledListener(listener) {
            const index = this.networkEnabledListeners.indexOf(listener);
            if (index > -1) {
                this.networkEnabledListeners.splice(index, 1);
            }
        }
        
        /**
         * 通知网络启用状态监听器
         * @param {boolean} enabled - 是否启用
         */
        _notifyNetworkEnabledListeners(enabled) {
            this.networkEnabledListeners.forEach(listener => {
                try {
                    listener(enabled);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetworkManager", `网络启用状态监听器执行失败: ${error.message}`, error);
                    }
                }
            });
        }
        
        /**
         * 初始化网络状态监控
         */
        _initNetworkStateMonitoring() {
            // 监听在线/离线事件
            if (typeof window !== 'undefined') {
                window.addEventListener('online', () => {
                    this._handleNetworkStateChange(true);
                });
                
                window.addEventListener('offline', () => {
                    this._handleNetworkStateChange(false);
                });
            }
            
            // 监听连接变化事件
            this._setupConnectionListener();
            
            // 获取初始网络状态
            this._updateNetworkState();
            
            // 定期更新网络状态（每30秒）
            this.networkStateUpdateInterval = setInterval(() => {
                this._updateNetworkState();
            }, 30000);
        }
        
        /**
         * 初始化电池信息
         */
        async _initBatteryInfo() {
            if (typeof navigator !== 'undefined' && navigator.getBattery) {
                try {
                    this.batteryInfo = await this.getBatteryInfo();
                    
                    // 监听电池状态变化
                    const battery = await navigator.getBattery();
                    if (battery) {
                        const updateBatteryInfo = () => {
                            this.batteryInfo = {
                                charging: battery.charging,
                                chargingTime: battery.chargingTime,
                                dischargingTime: battery.dischargingTime,
                                level: battery.level
                            };
                        };
                        
                        battery.addEventListener('chargingchange', updateBatteryInfo);
                        battery.addEventListener('chargingtimechange', updateBatteryInfo);
                        battery.addEventListener('dischargingtimechange', updateBatteryInfo);
                        battery.addEventListener('levelchange', updateBatteryInfo);
                    }
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("NetworkManager", `初始化电池信息失败: ${error.message}`);
                    }
                }
            }
        }
        
        /**
         * 设置连接监听器
         */
        _setupConnectionListener() {
            const conn = this._getConnectionObject();
            if (conn) {
                // 监听连接变化
                const events = ['change', 'typechange'];
                events.forEach(event => {
                    if (typeof conn.addEventListener === 'function') {
                        conn.addEventListener(event, () => {
                            this._handleConnectionChange();
                        });
                    }
                });
            }
        }
        
        /**
         * 获取连接对象
         * @returns {Object|null} 连接对象
         */
        _getConnectionObject() {
            if (typeof navigator === 'undefined') return null;
            
            return navigator.connection || 
                   navigator.mozConnection || 
                   navigator.webkitConnection ||
                   null;
        }
        
        /**
         * 处理网络状态变化
         * @param {boolean} isOnline - 是否在线
         */
        _handleNetworkStateChange(isOnline) {
            const state = {
                online: isOnline,
                timestamp: Date.now(),
                connectionInfo: this.getConnectionInfo(),
                navigatorData: this.getAllNavigatorNetworkData()
            };
            
            this.lastNetworkState = state;
            
            // 通知所有监听器
            this.networkStateListeners.forEach(listener => {
                try {
                    listener(state);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetworkManager", `网络状态监听器执行失败: ${error.message}`, error);
                    }
                }
            });
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("NetworkManager", `网络状态变化: ${isOnline ? '在线' : '离线'}`);
            }
        }
        
        /**
         * 处理连接变化
         */
        _handleConnectionChange() {
            const connectionInfo = this.getConnectionInfo();
            
            // 如果连接信息发生变化，通知监听器
            if (JSON.stringify(connectionInfo) !== JSON.stringify(this.lastConnectionInfo)) {
                this.lastConnectionInfo = connectionInfo;
                
                const state = {
                    online: this.isOnline(),
                    timestamp: Date.now(),
                    connectionInfo: connectionInfo,
                    navigatorData: this.getAllNavigatorNetworkData()
                };
                
                // 通知所有连接状态监听器
                this.connectionStateListeners.forEach(listener => {
                    try {
                        listener(state);
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error("NetworkManager", `连接状态监听器执行失败: ${error.message}`, error);
                        }
                    }
                });
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("NetworkManager", "网络连接信息已更新", connectionInfo);
                }
            }
        }
        
        /**
         * 更新网络状态
         */
        _updateNetworkState() {
            const isOnline = this.isOnline();
            const connectionInfo = this.getConnectionInfo();
            
            // 检查状态是否变化
            if (this.lastNetworkState === null || 
                this.lastNetworkState.online !== isOnline ||
                JSON.stringify(this.lastNetworkState.connectionInfo) !== JSON.stringify(connectionInfo)) {
                this._handleNetworkStateChange(isOnline);
            }
        }
        
        /**
         * 检查网络连接状态
         * @returns {boolean} 是否在线
         */
        isOnline() {
            if (typeof navigator === 'undefined') return false;
            return navigator.onLine === true;
        }
        
        /**
         * 获取网络连接信息（如果支持）
         * @returns {Object|null} 连接信息
         */
        getConnectionInfo() {
            const conn = this._getConnectionObject();
            if (conn) {
                return {
                    effectiveType: conn.effectiveType || null,
                    downlink: conn.downlink || null,
                    rtt: conn.rtt || null,
                    saveData: conn.saveData || false,
                    type: conn.type || null,
                    downlinkMax: conn.downlinkMax || null
                };
            }
            return null;
        }
        
        /**
         * 获取所有 navigator 网络相关数据
         * @returns {Object} 所有网络相关数据
         */
        getAllNavigatorNetworkData() {
            const data = {
                // 基本在线状态
                onLine: this.isOnline(),
                
                // 连接信息
                connection: this.getConnectionInfo(),
                
                // 用户代理（可能包含网络相关信息）
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                
                // 平台信息
                platform: typeof navigator !== 'undefined' ? navigator.platform : null,
                
                // 语言设置（可能影响网络请求）
                language: typeof navigator !== 'undefined' ? navigator.language : null,
                languages: typeof navigator !== 'undefined' && navigator.languages ? [...navigator.languages] : null,
                
                // 硬件信息（可能影响网络性能）
                hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null,
                deviceMemory: typeof navigator !== 'undefined' && navigator.deviceMemory ? navigator.deviceMemory : null,
                
                // Cookie 启用状态（影响网络请求）
                cookieEnabled: typeof navigator !== 'undefined' ? navigator.cookieEnabled : null,
                
                // 是否支持 Service Worker
                serviceWorkerSupported: 'serviceWorker' in (typeof navigator !== 'undefined' ? navigator : {}),
                
                // 时间戳
                timestamp: Date.now()
            };
            
            return data;
        }
        
        /**
         * 获取电池信息（如果支持）
         * @returns {Promise<Object|null>} 电池信息
         */
        async getBatteryInfo() {
            if (typeof navigator === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("NetworkManager", "navigator 不可用");
                }
                return null;
            }
            
            // 检查 getBattery API 是否可用
            if (!navigator.getBattery) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("NetworkManager", "navigator.getBattery API 不可用（可能需要 HTTPS 或浏览器不支持）");
                    KernelLogger.debug("NetworkManager", `当前协议: ${window.location.protocol}, 是否为 HTTPS: ${window.location.protocol === 'https:'}`);
                }
                return null;
            }
            
            try {
                const battery = await navigator.getBattery();
                if (!battery) {
                    return null;
                }
                
                const batteryInfo = {
                    charging: battery.charging,
                    chargingTime: battery.chargingTime,
                    dischargingTime: battery.dischargingTime,
                    level: battery.level
                };
                
                // 更新缓存的电池信息
                this.batteryInfo = batteryInfo;
                
                return batteryInfo;
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("NetworkManager", `获取电池信息失败: ${error.message}`);
                }
                return null;
            }
        }
        
        /**
         * 添加网络状态监听器
         * @param {Function} listener - 监听器函数
         * @returns {Function} 取消监听的函数
         */
        addNetworkStateListener(listener) {
            if (typeof listener !== 'function') {
                throw new Error('监听器必须是函数');
            }
            
            this.networkStateListeners.push(listener);
            
            // 立即调用一次，传递当前状态
            const currentState = {
                online: this.isOnline(),
                timestamp: Date.now(),
                connectionInfo: this.getConnectionInfo(),
                navigatorData: this.getAllNavigatorNetworkData()
            };
            
            try {
                listener(currentState);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("NetworkManager", `网络状态监听器初始化失败: ${error.message}`, error);
                }
            }
            
            // 返回取消监听的函数
            return () => {
                const index = this.networkStateListeners.indexOf(listener);
                if (index > -1) {
                    this.networkStateListeners.splice(index, 1);
                }
            };
        }
        
        /**
         * 移除网络状态监听器
         * @param {Function} listener - 要移除的监听器函数
         */
        removeNetworkStateListener(listener) {
            const index = this.networkStateListeners.indexOf(listener);
            if (index > -1) {
                this.networkStateListeners.splice(index, 1);
            }
        }
        
        /**
         * 添加连接状态监听器
         * @param {Function} listener - 监听器函数
         * @returns {Function} 取消监听的函数
         */
        addConnectionStateListener(listener) {
            if (typeof listener !== 'function') {
                throw new Error('监听器必须是函数');
            }
            
            this.connectionStateListeners.push(listener);
            
            // 立即调用一次，传递当前状态
            const currentState = {
                online: this.isOnline(),
                timestamp: Date.now(),
                connectionInfo: this.getConnectionInfo(),
                navigatorData: this.getAllNavigatorNetworkData()
            };
            
            try {
                listener(currentState);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("NetworkManager", `连接状态监听器初始化失败: ${error.message}`, error);
                }
            }
            
            // 返回取消监听的函数
            return () => {
                const index = this.connectionStateListeners.indexOf(listener);
                if (index > -1) {
                    this.connectionStateListeners.splice(index, 1);
                }
            };
        }
        
        /**
         * 移除连接状态监听器
         * @param {Function} listener - 要移除的监听器函数
         */
        removeConnectionStateListener(listener) {
            const index = this.connectionStateListeners.indexOf(listener);
            if (index > -1) {
                this.connectionStateListeners.splice(index, 1);
            }
        }
        
        /**
         * 获取当前网络状态快照
         * @returns {Object} 网络状态快照
         */
        getNetworkStateSnapshot() {
            return {
                online: this.isOnline(),
                timestamp: Date.now(),
                connectionInfo: this.getConnectionInfo(),
                navigatorData: this.getAllNavigatorNetworkData(),
                batteryInfo: this.batteryInfo,
                stats: { ...this.networkStats }
            };
        }
        
        /**
         * 清理资源
         */
        destroy() {
            // 清理定时器
            if (this.networkStateUpdateInterval) {
                clearInterval(this.networkStateUpdateInterval);
                this.networkStateUpdateInterval = null;
            }
            
            // 清理监听器
            this.networkStateListeners = [];
            this.connectionStateListeners = [];
        }
    }
    
    // 创建全局实例
    const networkManager = new NetworkManager();
    
    // 导出到 POOL
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            // 确保 KERNEL_GLOBAL_POOL 类别存在
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "NetworkManager", networkManager);
        } catch (e) {
            // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
            if (typeof window !== 'undefined') {
                window.NetworkManager = networkManager;
            } else if (typeof globalThis !== 'undefined') {
                globalThis.NetworkManager = networkManager;
            }
        }
    } else {
        // POOL不可用，降级到全局对象
        if (typeof window !== 'undefined') {
            window.NetworkManager = networkManager;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.NetworkManager = networkManager;
        }
    }
    
    // 发布信号
    if (typeof DependencyConfig !== 'undefined') {
        DependencyConfig.publishSignal("../kernel/drive/networkManager.js");
    } else {
        // 如果 DependencyConfig 还未加载，延迟发布信号
        if (typeof document !== 'undefined' && document.body) {
            const publishWhenReady = () => {
                if (typeof DependencyConfig !== 'undefined') {
                    DependencyConfig.publishSignal("../kernel/drive/networkManager.js");
                } else {
                    setTimeout(publishWhenReady, 10);
                }
            };
            publishWhenReady();
        }
    }
    
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("NetworkManager", "模块加载完成");
    } else {
        console.log('[内核][NetworkManager] 模块加载完成');
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

