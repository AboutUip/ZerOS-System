// 全局网络管理器
// 使用 Service Worker 截取所有网络请求进行统一处理与管理
// 注意：此模块必须通过 BootLoader 加载

(function () {
    'use strict';

    // 内核日志模块时刻可用，直接使用
    KernelLogger.info("NetworkManager", "模块初始化");

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

            // TCP 端口管理
            this.registeredPorts = new Map(); // 已注册的端口映射 port -> {pid, programName, status, ...}
            this.portCheckIntervals = new Map(); // 端口检查定时器映射 port -> intervalId
            this.portDataListeners = new Map(); // 端口数据监听器映射 port -> [listeners]
            this.portConnectionListeners = new Map(); // 端口连接监听器映射 port -> [listeners]

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
                KernelLogger.warn("NetworkManager", error);
                return;
            }

            // 检查协议支持（Service Worker 只能在 http/https 下工作）
            const protocol = window.location.protocol;
            if (protocol === 'file:' || protocol === 'null:' || !protocol) {
                const error = `Service Worker 不支持当前协议: ${protocol || 'null'}，将使用降级模式`;
                KernelLogger.warn("NetworkManager", error);
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
                                KernelLogger.info("NetworkManager", "Service Worker 已更新");
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

                KernelLogger.info("NetworkManager", "Service Worker 注册成功");

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

                KernelLogger.warn("NetworkManager", fullMessage, error);

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

            KernelLogger.info("NetworkManager", "已启用降级模式：网络请求拦截（fetch 和 XMLHttpRequest）。功能完整，无需 Service Worker。");
        }

        /**
         * 检查请求头是否已携带 JWT
         * @param {Headers|Object|undefined} headers - 请求头
         * @returns {boolean} 是否已有 JWT
         */
        _headersHasJWT(headers) {
            if (!headers) return false;
            const get = (name) => {
                if (headers instanceof Headers) return headers.get(name) || headers.get(name.toLowerCase());
                if (typeof headers === 'object') {
                    const v = headers[name] || headers[name.toLowerCase()];
                    if (v != null) return String(v);
                    for (const k of Object.keys(headers)) {
                        if (k.toLowerCase() === name.toLowerCase()) return String(headers[k]);
                    }
                }
                return null;
            };
            const auth = get('Authorization');
            if (auth && (auth.startsWith('Bearer ') ? auth.length > 7 : auth.length > 0)) return true;
            const xAuth = get('X-Auth-Token');
            if (xAuth && xAuth.length > 0) return true;
            const xJwt = get('X-JWT');
            if (xJwt && xJwt.length > 0) return true;
            return false;
        }

        /**
         * 获取调用者应使用的 JWT 类型（严格遵守，无后备方案）
         * - DISK/ 之外：系统 JWT
         * - DISK/D/server/：系统 JWT（系统盘 D 且子目录为 server）
         * - 其余（DISK/D/application、DISK/C/ 等）：用户 JWT，由调用方自行传递
         * @returns {'system'|'user'} 或 null（需用户 JWT 但不可用时）
         */
        _getJWTTypeForCaller() {
            try {
                const stack = new Error().stack;
                if (!stack) return null;
                const lines = stack.split('\n');
                for (let i = 1; i < Math.min(lines.length, 25); i++) {
                    const line = lines[i];
                    if (line.includes('networkManager.js')) continue;
                    const norm = line.replace(/\\/g, '/');
                    if (!/\/DISK[\/\\]/i.test(norm)) return 'system'; // DISK 之外统一系统 JWT
                    if (/\/DISK[\/\\]D[\/\\]server[\/\\]/i.test(norm)) return 'system'; // 系统盘 D 且子目录为 server
                    return 'user'; // 其余位置（含 DISK/D/application、DISK/C/ 等）使用用户 JWT
                }
                return null;
            } catch (e) {
                return null;
            }
        }

        /**
         * 若请求未携带 JWT，则按调用来源自动注入对应 JWT；已有 JWT 则直接放行
         * 规则：DISK/ 之外 + DISK/D/server/ → 自动注入系统 JWT；其余 → 自动注入用户 JWT（无后备）
         * @param {Array} args - fetch 参数 (input, init?)
         * @param {string} [url] - 请求 URL（用于 debug 日志）
         * @param {string} [source] - 来源标识，如 'fetch' / 'XHR'
         */
        _ensureRequestHasJWT(args, url, source) {
            const src = source || 'fetch';
            const logJWT = (msg, meta) => {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("NetworkManager", `[JWT] ${msg}`, meta || {});
                }
            };
            if (typeof RandomSecurity === 'undefined') {
                logJWT(`${src} 未注入: RandomSecurity 不可用`, { url: url || '' });
                return;
            }
            const jwtType = this._getJWTTypeForCaller();
            let jwt = null;
            if (jwtType === 'system' && typeof RandomSecurity.getSystemJWT === 'function') {
                jwt = RandomSecurity.getSystemJWT();
            } else if (jwtType === 'user' && typeof RandomSecurity.getUserJWT === 'function') {
                jwt = RandomSecurity.getUserJWT();
            }
            if (!jwt) {
                logJWT(`${src} 未注入: 无可用 JWT (类型=${jwtType || '?'})`, { url: url || '' });
                return;
            }
            const tokenLabel = jwtType === 'system' ? 'SystemToken' : 'UserToken';

            const input = args[0];

            if (input instanceof Request) {
                if (this._headersHasJWT(input.headers)) {
                    logJWT(`${src} 直接放行: 请求已携带 JWT`);
                    return;
                }
                const newHeaders = new Headers(input.headers);
                newHeaders.set('Authorization', 'Bearer ' + jwt);
                args[0] = new Request(input, { headers: newHeaders });
                logJWT(`${src} 已注入 ${tokenLabel}`, { url: input.url || url || '' });
            } else {
                const options = args[1] || {};
                const headers = options.headers;
                if (this._headersHasJWT(headers)) {
                    logJWT(`${src} 直接放行: 请求已携带 JWT`);
                    return;
                }
                args[1] = options;
                const newHeaders = new Headers(headers || {});
                newHeaders.set('Authorization', 'Bearer ' + jwt);
                options.headers = newHeaders;
                logJWT(`${src} 已注入 ${tokenLabel}`, { url: url || '' });
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

            window.fetch = function (...args) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : String(args[0]));
                const options = args[1] || {};

                // 只处理 HTTP/HTTPS 请求
                if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("NetworkManager", `[拦截-跳过] 非 HTTP(S) 请求`, { url: url || '(unknown)' });
                    }
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

                    // [NetworkService] debug 日志，可通过 Log.getBySubsystem("NetworkService") 过滤
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("NetworkService", `[拦截-拒绝] ${options.method || 'GET'} ${url} (网络已禁用)`);
                    }

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

                // [NetworkService] debug 日志，可通过 Log.getBySubsystem("NetworkService") 过滤
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("NetworkService", `[拦截] ${options.method || 'GET'} ${url}`, { url, method: options.method || 'GET' });
                }

                // 跨域请求不注入 JWT，避免第三方 API 的 CORS 预检因不允许 Authorization 头而失败
                let isCrossOrigin = false;
                try {
                    const reqOrigin = new URL(url).origin;
                    if (typeof window !== 'undefined' && window.location && reqOrigin !== window.location.origin) {
                        isCrossOrigin = true;
                    }
                } catch (e) {
                    // URL 解析失败时仍按原逻辑注入
                }
                if (!isCrossOrigin) {
                    try {
                        self._ensureRequestHasJWT(args, url, 'fetch');
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug("NetworkManager", `[JWT] fetch 注入异常: ${e.message}`, { url });
                        }
                    }
                }

                // 执行原始 fetch
                // 对于 D:/bin/ 路径的请求，静默处理404错误（文件不存在是正常情况，不应该输出到控制台）
                const isBinPathRequest = url.includes('path=D%3A%2Fbin') || url.includes('path=D:/bin');

                return originalFetch.apply(this, args)
                    .then(response => {
                        // 对于 D:/bin/ 路径的 404 错误，完全静默处理（不记录响应）
                        // 注意：浏览器开发者工具仍可能显示404，这是浏览器行为，无法完全避免
                        const isBinPath404 = response.status === 404 && isBinPathRequest;

                        if (!isBinPath404) {
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
                        }

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

            window.XMLHttpRequest = function (...args) {
                const xhr = new OriginalXHR(...args);
                const originalOpen = xhr.open;
                const originalSend = xhr.send;
                const originalSetRequestHeader = xhr.setRequestHeader;
                let requestUrl = null;
                let requestMethod = 'GET';
                let requestHeaders = {};

                // 拦截 setRequestHeader 以记录请求头
                xhr.setRequestHeader = function (name, value) {
                    requestHeaders[name] = value;
                    return originalSetRequestHeader.apply(this, arguments);
                };

                // 拦截 open 方法
                xhr.open = function (method, url, ...rest) {
                    requestMethod = method;
                    requestUrl = url;
                    return originalOpen.apply(this, [method, url, ...rest]);
                };

                // 拦截 send 方法
                xhr.send = function (body) {
                    // 只处理 HTTP/HTTPS 请求
                    if (!requestUrl || (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://'))) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug("NetworkManager", `[拦截-跳过] XHR 非 HTTP(S) 请求`, { url: requestUrl || '(unknown)' });
                        }
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

                        // [NetworkService] debug 日志，可通过 Log.getBySubsystem("NetworkService") 过滤
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug("NetworkService", `[拦截-拒绝] XHR ${requestMethod} ${requestUrl} (网络已禁用)`);
                        }

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

                    // [NetworkService] debug 日志，可通过 Log.getBySubsystem("NetworkService") 过滤
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("NetworkService", `[拦截] XHR ${requestMethod} ${requestUrl}`, { url: requestUrl, method: requestMethod });
                    }

                    // 跨域请求不注入 JWT，避免第三方 API 的 CORS 预检因不允许 Authorization 头而失败
                    let xhrCrossOrigin = false;
                    try {
                        const xhrReqOrigin = new URL(requestUrl).origin;
                        if (typeof window !== 'undefined' && window.location && xhrReqOrigin !== window.location.origin) {
                            xhrCrossOrigin = true;
                        }
                    } catch (e) {}
                    if (!xhrCrossOrigin) {
                        try {
                            const hasJwt = self._headersHasJWT(requestHeaders);
                            if (hasJwt) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug("NetworkManager", "[JWT] XHR 直接放行: 请求已携带 JWT", { url: requestUrl });
                                }
                            } else if (typeof RandomSecurity !== 'undefined') {
                                const jwtType = self._getJWTTypeForCaller();
                                let jwt = null;
                                if (jwtType === 'system' && typeof RandomSecurity.getSystemJWT === 'function') {
                                    jwt = RandomSecurity.getSystemJWT();
                                } else if (jwtType === 'user' && typeof RandomSecurity.getUserJWT === 'function') {
                                    jwt = RandomSecurity.getUserJWT();
                                }
                                if (jwt) {
                                    xhr.setRequestHeader('Authorization', 'Bearer ' + jwt);
                                    const tokenLabel = jwtType === 'system' ? 'SystemToken' : 'UserToken';
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.debug("NetworkManager", `[JWT] XHR 已注入 ${tokenLabel}`, { url: requestUrl });
                                    }
                                } else {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.debug("NetworkManager", `[JWT] XHR 未注入: 无可用 JWT (类型=${jwtType || '?'})`, { url: requestUrl });
                                    }
                                }
                            } else {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug("NetworkManager", "[JWT] XHR 未注入: RandomSecurity 不可用", { url: requestUrl });
                                }
                            }
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("NetworkManager", `[JWT] XHR 注入异常: ${e.message}`, { url: requestUrl });
                            }
                        }
                    }

                    // 监听响应
                    xhr.addEventListener('load', function () {
                        // 根据 responseType 选择正确的响应数据
                        let responseBody = '';
                        let responseSize = 0;

                        try {
                            // 检查 responseType
                            const responseType = xhr.responseType || '';

                            if (responseType === '' || responseType === 'text') {
                                // 文本类型，使用 responseText
                                if (xhr.responseText) {
                                    responseBody = xhr.responseText.substring(0, 1000);
                                    responseSize = new Blob([xhr.responseText]).size;
                                }
                            } else {
                                // 二进制类型（arraybuffer, blob 等），使用 response
                                if (xhr.response) {
                                    if (responseType === 'arraybuffer') {
                                        // ArrayBuffer 类型
                                        const buffer = xhr.response;
                                        responseSize = buffer.byteLength;
                                        // 只记录大小，不记录内容（二进制数据不适合作为字符串）
                                        responseBody = `[ArrayBuffer: ${responseSize} bytes]`;
                                    } else if (responseType === 'blob') {
                                        // Blob 类型
                                        const blob = xhr.response;
                                        responseSize = blob.size;
                                        responseBody = `[Blob: ${responseSize} bytes, type: ${blob.type || 'unknown'}]`;
                                    } else {
                                        // 其他类型（json 等）
                                        try {
                                            const responseStr = JSON.stringify(xhr.response);
                                            responseBody = responseStr.substring(0, 1000);
                                            responseSize = new Blob([responseStr]).size;
                                        } catch (e) {
                                            responseBody = `[${responseType}: ${typeof xhr.response}]`;
                                            responseSize = 0;
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            // 如果读取响应失败，记录错误但不影响请求
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("NetworkManager", `读取响应数据失败: ${e.message}`);
                            }
                            responseBody = '[无法读取响应数据]';
                            responseSize = 0;
                        }

                        self._handleResponseReceived({
                            url: requestUrl,
                            status: xhr.status,
                            statusText: xhr.statusText,
                            headers: {},
                            body: responseBody,
                            size: responseSize
                        });
                    });

                    xhr.addEventListener('error', function () {
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
                        KernelLogger.info("NetworkManager", `初始化电池信息失败: ${error.message}`);
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
                    KernelLogger.info("NetworkManager", "navigator.getBattery API 不可用（可能需要 HTTPS 或浏览器不支持）");
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
                    KernelLogger.info("NetworkManager", `获取电池信息失败: ${error.message}`);
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
         * 注册 TCP 端口监听
         * @param {number} port - 端口号（1-65535）
         * @param {number} pid - 进程 ID
         * @param {string} programName - 程序名称
         * @param {Object} options - 选项
         * @param {Function} onData - 数据接收回调函数
         * @param {Function} onConnection - 新连接回调函数
         * @returns {Promise<Object>} 注册结果
         */
        async registerPort(port, pid, programName, options = {}) {
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error('端口号必须是 1-65535 之间的整数');
            }

            if (this.registeredPorts.has(port)) {
                throw new Error(`端口 ${port} 已被注册`);
            }

            try {
                // 调用 PHP 服务注册端口
                const registerUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrl)
                    ? SystemInformation.buildServiceUrl(SystemInformation.SERVICE_NAMES.NETWORK_DIRVE, { action: 'register', port, pid, programName: programName })
                    : `${(typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' && window.location ? window.location.origin : '')}/system/service/networkDirve.php?action=register&port=${port}&pid=${pid}&programName=${encodeURIComponent(programName)}`;
                const response = await fetch(registerUrl, {
                    method: 'GET'
                });

                const result = await response.json();

                if (result.status === 'success') {
                    // 保存端口信息
                    this.registeredPorts.set(port, {
                        port: port,
                        pid: pid,
                        programName: programName,
                        status: 'listening',
                        created: Date.now(),
                        options: options
                    });

                    // 初始化监听器列表
                    this.portDataListeners.set(port, []);
                    this.portConnectionListeners.set(port, []);

                    // 添加数据监听器
                    if (options.onData && typeof options.onData === 'function') {
                        this.addPortDataListener(port, options.onData);
                    }

                    // 添加连接监听器
                    if (options.onConnection && typeof options.onConnection === 'function') {
                        this.addPortConnectionListener(port, options.onConnection);
                    }

                    // 启动端口检查定时器（每 500ms 检查一次）
                    const checkInterval = setInterval(() => {
                        this._checkPort(port);
                    }, 500);

                    this.portCheckIntervals.set(port, checkInterval);

                    KernelLogger.info("NetworkManager", `端口 ${port} 注册成功 (PID: ${pid}, 程序: ${programName})`);

                    return {
                        success: true,
                        port: port,
                        message: result.message
                    };
                } else {
                    throw new Error(result.message || '端口注册失败');
                }
            } catch (error) {
                KernelLogger.error("NetworkManager", `端口 ${port} 注册失败: ${error.message}`, error);
                throw error;
            }
        }

        /**
         * 取消 TCP 端口监听
         * @param {number} port - 端口号
         * @returns {Promise<Object>} 取消结果
         */
        async unregisterPort(port) {
            if (!this.registeredPorts.has(port)) {
                throw new Error(`端口 ${port} 未注册`);
            }

            try {
                // 调用 PHP 服务取消端口
                const unregisterUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrl)
                    ? SystemInformation.buildServiceUrl(SystemInformation.SERVICE_NAMES.NETWORK_DIRVE, { action: 'unregister', port })
                    : `${(typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' && window.location ? window.location.origin : '')}/system/service/networkDirve.php?action=unregister&port=${port}`;
                const response = await fetch(unregisterUrl, {
                    method: 'GET'
                });

                const result = await response.json();

                if (result.status === 'success') {
                    // 清理定时器
                    const intervalId = this.portCheckIntervals.get(port);
                    if (intervalId) {
                        clearInterval(intervalId);
                        this.portCheckIntervals.delete(port);
                    }

                    // 清理监听器
                    this.portDataListeners.delete(port);
                    this.portConnectionListeners.delete(port);

                    // 删除端口信息
                    this.registeredPorts.delete(port);

                    KernelLogger.info("NetworkManager", `端口 ${port} 已取消注册`);

                    return {
                        success: true,
                        message: result.message
                    };
                } else {
                    throw new Error(result.message || '端口取消注册失败');
                }
            } catch (error) {
                KernelLogger.error("NetworkManager", `端口 ${port} 取消注册失败: ${error.message}`, error);
                throw error;
            }
        }

        /**
         * 检查端口（接受新连接并读取数据）
         * @param {number} port - 端口号
         * @returns {Promise<Object>} 检查结果
         */
        async _checkPort(port) {
            if (!this.registeredPorts.has(port)) {
                return;
            }

            try {
                const checkUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrl)
                    ? SystemInformation.buildServiceUrl(SystemInformation.SERVICE_NAMES.NETWORK_DIRVE, { action: 'check', port })
                    : `${(typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' && window.location ? window.location.origin : '')}/system/service/networkDirve.php?action=check&port=${port}`;
                const response = await fetch(checkUrl, {
                    method: 'GET'
                });

                const result = await response.json();

                if (result.status === 'success' && result.data) {
                    // 处理新连接
                    if (result.data.newConnections && result.data.newConnections.length > 0) {
                        const listeners = this.portConnectionListeners.get(port) || [];
                        result.data.newConnections.forEach(connection => {
                            listeners.forEach(listener => {
                                try {
                                    listener(connection);
                                } catch (error) {
                                    KernelLogger.error("NetworkManager", `端口 ${port} 连接监听器执行失败: ${error.message}`, error);
                                }
                            });
                        });
                    }

                    // 处理接收到的数据
                    if (result.data.dataReceived && result.data.dataReceived.length > 0) {
                        const listeners = this.portDataListeners.get(port) || [];
                        result.data.dataReceived.forEach(data => {
                            listeners.forEach(listener => {
                                try {
                                    listener(data);
                                } catch (error) {
                                    KernelLogger.error("NetworkManager", `端口 ${port} 数据监听器执行失败: ${error.message}`, error);
                                }
                            });
                        });
                    }
                }
            } catch (error) {
                // 静默处理错误，避免日志过多
                KernelLogger.debug("NetworkManager", `端口 ${port} 检查失败: ${error.message}`);
            }
        }

        /**
         * 获取端口状态
         * @param {number} port - 端口号
         * @returns {Promise<Object>} 端口状态
         */
        async getPortStatus(port) {
            try {
                const statusUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrl)
                    ? SystemInformation.buildServiceUrl(SystemInformation.SERVICE_NAMES.NETWORK_DIRVE, { action: 'status', port })
                    : `${(typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' && window.location ? window.location.origin : '')}/system/service/networkDirve.php?action=status&port=${port}`;
                const response = await fetch(statusUrl, {
                    method: 'GET'
                });

                const result = await response.json();

                if (result.status === 'success') {
                    return result.data;
                } else {
                    // 端口未注册是正常情况，不应该记录为错误
                    const errorMessage = result.message || '获取端口状态失败';
                    if (errorMessage.includes('未注册')) {
                        // 端口未注册是正常的业务逻辑，使用调试日志
                        KernelLogger.debug("NetworkManager", `端口 ${port} 未注册（正常情况）`);
                    } else {
                        // 其他错误（如配置文件损坏）才记录为错误
                        KernelLogger.error("NetworkManager", `获取端口 ${port} 状态失败: ${errorMessage}`);
                    }
                    throw new Error(errorMessage);
                }
            } catch (error) {
                // 只有在不是"未注册"错误时才记录为错误
                if (!error.message || !error.message.includes('未注册')) {
                    KernelLogger.error("NetworkManager", `获取端口 ${port} 状态失败: ${error.message}`, error);
                }
                throw error;
            }
        }

        /**
         * 列出所有已注册的端口
         * @returns {Promise<Array>} 端口列表
         */
        async listPorts() {
            try {
                const listUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrl)
                    ? SystemInformation.buildServiceUrl(SystemInformation.SERVICE_NAMES.NETWORK_DIRVE, { action: 'list' })
                    : `${(typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' && window.location ? window.location.origin : '')}/system/service/networkDirve.php?action=list`;
                const response = await fetch(listUrl, {
                    method: 'GET'
                });

                const result = await response.json();

                if (result.status === 'success') {
                    return result.data || [];
                } else {
                    throw new Error(result.message || '获取端口列表失败');
                }
            } catch (error) {
                KernelLogger.error("NetworkManager", `获取端口列表失败: ${error.message}`, error);
                throw error;
            }
        }

        /**
         * 向端口发送数据（作为客户端）
         * @param {string} host - 主机地址
         * @param {number} port - 端口号
         * @param {string|ArrayBuffer|Blob} data - 要发送的数据
         * @returns {Promise<Object>} 发送结果
         */
        async sendDataToPort(host, port, data) {
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error('端口号必须是 1-65535 之间的整数');
            }

            // 将数据转换为字符串
            let dataString;
            if (typeof data === 'string') {
                dataString = data;
            } else if (data instanceof ArrayBuffer) {
                dataString = String.fromCharCode.apply(null, new Uint8Array(data));
            } else if (data instanceof Blob) {
                dataString = await data.text();
            } else {
                dataString = String(data);
            }

            try {
                const sendUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrl)
                    ? SystemInformation.buildServiceUrl(SystemInformation.SERVICE_NAMES.NETWORK_DIRVE, { action: 'send', host: host || '127.0.0.1', port, data: dataString })
                    : `${(typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' && window.location ? window.location.origin : '')}/system/service/networkDirve.php?action=send&host=${encodeURIComponent(host || '127.0.0.1')}&port=${port}&data=${encodeURIComponent(dataString)}`;
                const response = await fetch(sendUrl, {
                    method: 'GET'
                });

                const result = await response.json();

                if (result.status === 'success') {
                    return result.data || {};
                } else {
                    throw new Error(result.message || '发送数据失败');
                }
            } catch (error) {
                KernelLogger.error("NetworkManager", `向 ${host}:${port} 发送数据失败: ${error.message}`, error);
                throw error;
            }
        }

        /**
         * 添加端口数据监听器
         * @param {number} port - 端口号
         * @param {Function} listener - 监听器函数
         * @returns {Function} 取消监听的函数
         */
        addPortDataListener(port, listener) {
            if (typeof listener !== 'function') {
                throw new Error('监听器必须是函数');
            }

            if (!this.portDataListeners.has(port)) {
                this.portDataListeners.set(port, []);
            }

            const listeners = this.portDataListeners.get(port);
            listeners.push(listener);

            // 返回取消监听的函数
            return () => {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            };
        }

        /**
         * 移除端口数据监听器
         * @param {number} port - 端口号
         * @param {Function} listener - 要移除的监听器函数
         */
        removePortDataListener(port, listener) {
            const listeners = this.portDataListeners.get(port);
            if (listeners) {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        }

        /**
         * 添加端口连接监听器
         * @param {number} port - 端口号
         * @param {Function} listener - 监听器函数
         * @returns {Function} 取消监听的函数
         */
        addPortConnectionListener(port, listener) {
            if (typeof listener !== 'function') {
                throw new Error('监听器必须是函数');
            }

            if (!this.portConnectionListeners.has(port)) {
                this.portConnectionListeners.set(port, []);
            }

            const listeners = this.portConnectionListeners.get(port);
            listeners.push(listener);

            // 返回取消监听的函数
            return () => {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            };
        }

        /**
         * 移除端口连接监听器
         * @param {number} port - 端口号
         * @param {Function} listener - 要移除的监听器函数
         */
        removePortConnectionListener(port, listener) {
            const listeners = this.portConnectionListeners.get(port);
            if (listeners) {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
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

            // 清理所有端口检查定时器
            this.portCheckIntervals.forEach((intervalId, port) => {
                clearInterval(intervalId);
            });
            this.portCheckIntervals.clear();

            // 清理监听器
            this.networkStateListeners = [];
            this.connectionStateListeners = [];
            this.portDataListeners.clear();
            this.portConnectionListeners.clear();

            // 清理已注册的端口
            this.registeredPorts.clear();
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
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SERVICE,
                    `NetworkManager.POOL注册失败: ${e.message}`,
                    { error: e.message, stack: e.stack }
                ).catch(() => { });
            }

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

    KernelLogger.info("NetworkManager", "模块加载完成");

})(typeof window !== 'undefined' ? window : globalThis);

