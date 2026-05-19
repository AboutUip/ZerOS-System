// RandomSecurity: 引导前随机安全校验模块
// 在 BootLoader 引导期间第一个加载，必须完全执行完成后才允许继续加载其余内核模块
// 生成128位（16字节）高随机性安全字符串

(function (global) {
    'use strict';

    const MODULE_PATH = '../kernel/core/safemode/randomSecurity.js';
    
    // 生成的128位随机字符串（十六进制编码，32个字符）
    let _randomSecurityValue = null;
    // 系统级 JWT Token（私有存储，仅通过 getSystemJWT API 获取）
    let _systemJWT = null;
    // 用户级 JWT Token（私有存储，登录时由 generateUserToken 生成，type 固定为 UserToken）
    let _userJWT = null;

    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("RandomSecurity", "模块加载，执行引导前安全校验");
    }

    /**
     * 生成128位（16字节）高随机性安全字符串
     * 使用 Web Crypto API 的 crypto.getRandomValues() 确保加密级别的随机性
     * @returns {string} 128位随机字符串（十六进制编码，32个字符）
     */
    function generateRandomSecurityValue() {
        try {
            // 检查 Web Crypto API 是否可用
            if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
                throw new Error('Web Crypto API 不可用');
            }

            // 生成16字节（128位）的随机数据
            const randomBytes = new Uint8Array(16);
            crypto.getRandomValues(randomBytes);

            // 转换为十六进制字符串（32个字符）
            let hexString = '';
            for (let i = 0; i < randomBytes.length; i++) {
                const hex = randomBytes[i].toString(16).padStart(2, '0');
                hexString += hex;
            }

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug("RandomSecurity", `已生成128位随机安全值: ${hexString.substring(0, 8)}...${hexString.substring(24)}`);
            }

            return hexString;
        } catch (error) {
            // 降级方案：如果 Web Crypto API 不可用，使用 Math.random（不够安全，但至少能工作）
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("RandomSecurity", `Web Crypto API 不可用，使用降级方案生成随机值: ${error.message}`);
            }

            let fallbackString = '';
            for (let i = 0; i < 32; i++) {
                // 生成0-15的随机数，转换为十六进制字符
                const randomValue = Math.floor(Math.random() * 16);
                fallbackString += randomValue.toString(16);
            }

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("RandomSecurity", `降级方案生成的随机值: ${fallbackString.substring(0, 8)}...${fallbackString.substring(24)}`);
            }

            return fallbackString;
        }
    }

    /**
     * 获取 RandomSecurity 服务 URL（与 FSDirve/LStorage 一致：有 SystemInformation 走 getRandomSecurityPath + getOrigin，否则降级为默认 PHP + 当前页 origin）
     * @returns {string}
     */
    function getRandomSecurityServiceUrl() {
        if (typeof SystemInformation !== 'undefined' && typeof SystemInformation.getRandomSecurityPath === 'function' && typeof SystemInformation.getOrigin === 'function') {
            return new URL(SystemInformation.getRandomSecurityPath(), SystemInformation.getOrigin()).toString();
        }
        var origin = (typeof window !== 'undefined' && window.location && window.location.origin)
            ? window.location.origin
            : 'http://localhost:8089';
        return origin + '/system/service/randomSecurity.php';
    }

    /**
     * CVS-ZEROS-016：签发 SystemToken 前先提交 randomValue（每 IP 仅允许一笔未消费提交）
     * @param {string} randomValue 128位随机字符串
     * @returns {Promise<void>}
     */
    function commitRandomValueForSystem(randomValue) {
        var serviceUrl = getRandomSecurityServiceUrl();
        var urlWithAction = serviceUrl + (serviceUrl.indexOf('?') !== -1 ? '&' : '?') + 'action=commit_for_system';
        return new Promise(function (resolve, reject) {
            if (typeof fetch !== 'undefined') {
                fetch(urlWithAction, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ randomValue: randomValue })
                })
                .then(function (response) {
                    if (!response.ok) {
                        return response.json().then(function (data) {
                            reject(new Error(data.message || 'commit_for_system 失败: ' + response.status));
                        }).catch(function () {
                            reject(new Error('commit_for_system 失败: ' + response.status));
                        });
                    }
                    return response.json();
                })
                .then(function (data) {
                    if (data.status === 'success') {
                        resolve();
                    } else {
                        reject(new Error(data.message || 'commit_for_system 失败'));
                    }
                })
                .catch(reject);
            } else {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', urlWithAction, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.onload = function () {
                    if (xhr.status === 200) {
                        try {
                            var data = JSON.parse(xhr.responseText);
                            if (data.status === 'success') resolve();
                            else reject(new Error(data.message || 'commit_for_system 失败'));
                        } catch (e) {
                            reject(new Error('解析响应失败'));
                        }
                    } else {
                        reject(new Error('commit_for_system 失败: ' + xhr.status));
                    }
                };
                xhr.onerror = function () { reject(new Error('网络请求失败')); };
                xhr.send(JSON.stringify({ randomValue: randomValue }));
            }
        });
    }

    /**
     * 发送随机字符串到后端并获取 JWT Token
     * @param {string} randomValue 128位随机字符串
     * @param {string} type Token 类型（如 'SystemToken'、'UserToken'）
     * @param {Object} [extraPayload] 额外载荷（如 userLevel，用于 UserToken）
     * @returns {Promise<string>} JWT Token
     */
    function getJWTFromBackend(randomValue, type, extraPayload) {
        return new Promise(function (resolve, reject) {
            var serviceUrl = getRandomSecurityServiceUrl();

            var body = { randomValue: randomValue };
            if (type) {
                body.type = type;
            }
            if (extraPayload && typeof extraPayload === 'object') {
                for (var k in extraPayload) {
                    if (extraPayload.hasOwnProperty(k)) {
                        body[k] = extraPayload[k];
                    }
                }
            }

            // 发送 POST 请求
            if (typeof fetch !== 'undefined') {
                fetch(serviceUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                })
                .then(function (response) {
                    if (!response.ok) {
                        return response.text().then(function (text) {
                            var detail = '';
                            try {
                                var j = JSON.parse(text);
                                if (j && j.message) {
                                    detail = ': ' + j.message;
                                }
                            } catch (ignore) { }
                            throw new Error('HTTP ' + response.status + ': ' + response.statusText + detail);
                        });
                    }
                    return response.json();
                })
                .then(function (data) {
                    if (data.status === 'success' && data.data && data.data.token) {
                        resolve(data.data.token);
                    } else {
                        reject(new Error(data.message || '获取 JWT Token 失败'));
                    }
                })
                .catch(function (error) {
                    reject(error);
                });
            } else {
                // 降级方案：使用 XMLHttpRequest
                const xhr = new XMLHttpRequest();
                xhr.open('POST', serviceUrl, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.onload = function () {
                    if (xhr.status === 200) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            if (data.status === 'success' && data.data && data.data.token) {
                                resolve(data.data.token);
                            } else {
                                reject(new Error(data.message || '获取 JWT Token 失败'));
                            }
                        } catch (e) {
                            reject(new Error('解析响应失败: ' + e.message));
                        }
                    } else {
                        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                    }
                };
                xhr.onerror = function () {
                    reject(new Error('网络请求失败'));
                };
                xhr.send(JSON.stringify(body));
            }
        });
    }

    /**
     * 引导前安全校验：生成128位随机安全值并获取 JWT Token
     * @returns {Promise<void>}
     */
    function runSecurityCheck() {
        return new Promise(function (resolve, reject) {
            // 生成128位随机安全值
            _randomSecurityValue = generateRandomSecurityValue();

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("RandomSecurity", `已生成128位随机安全值，正在提交并获取 JWT Token...`);
            }

            // CVS-ZEROS-016：先提交 randomValue，再请求签发 SystemToken
            commitRandomValueForSystem(_randomSecurityValue)
                .then(function () {
                    return getJWTFromBackend(_randomSecurityValue, 'SystemToken');
                })
                .then(function (jwtToken) {
                    // 私有保存 JWT，不传给 BootLoader
                    _systemJWT = jwtToken;

                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info("RandomSecurity", `引导前安全校验完成，已获取 JWT Token（长度: ${jwtToken.length}字符）`);
                    }

                    resolve();
                })
                .catch(function (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("RandomSecurity", `获取 JWT Token 失败: ${error.message}`, error);
                    }
                    // 降级方案：无 JWT，_systemJWT 保持 null
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("RandomSecurity", "降级方案：未获取到 JWT Token，getSystemJWT 将返回 null");
                    }
                    resolve(); // 继续引导，不阻塞
                });
        });
    }

    // 执行安全校验
    runSecurityCheck().then(function () {
        if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
            DependencyConfig.publishSignal(MODULE_PATH);
        }
    });

    /**
     * 用户登录后生成 UserToken JWT（CVS-ZEROS-017：userLevel/permissions 由 randomSecurity.php 根据 LocalSData 与密码签发，不信任客户端声明）
     * @param {string} username 当前登录用户名（与 UserControl.login 一致）
     * @param {string|null|undefined} [password] 登录所用明文密码；无密码用户可省略或传 null
     * @returns {Promise<string|null>} JWT Token 或 null
     */
    function generateUserToken(username, password) {
        return new Promise(function (resolve, reject) {
            if (!username || typeof username !== 'string' || !String(username).trim()) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("RandomSecurity", "generateUserToken: username 无效");
                }
                resolve(null);
                return;
            }

            var randomValue = generateRandomSecurityValue();
            var extraPayload = { username: String(username).trim() };
            if (password !== undefined && password !== null) {
                extraPayload.password = typeof password === 'string' ? password : String(password);
            }

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("RandomSecurity", '用户登录，正在向后端请求签发 UserToken（username: ' + extraPayload.username + '）');
            }

            getJWTFromBackend(randomValue, 'UserToken', extraPayload)
                .then(function (jwtToken) {
                    _userJWT = jwtToken;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info("RandomSecurity", `UserToken 生成完成（长度: ${jwtToken.length} 字符）`);
                    }
                    resolve(jwtToken);
                })
                .catch(function (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("RandomSecurity", `生成 UserToken 失败: ${error.message}`, error);
                    }
                    _userJWT = null;
                    reject(error);
                });
        });
    }

    /**
     * 清除用户级 JWT（用户登出时调用）
     */
    function clearUserToken() {
        _userJWT = null;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("RandomSecurity", "UserToken 已清除");
        }
    }

    /**
     * 获取用户级 JWT
     * 仅系统模块可调用（非 DISK/application 来源，DISK/server 允许）
     * @returns {string|null} 用户 JWT 或 null
     */
    function getUserJWT() {
        if (!_isSystemModuleCaller()) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("RandomSecurity", "getUserJWT: 调用来源非法，仅系统模块可调用");
            }
            return null;
        }
        return _userJWT;
    }

    /**
     * 验证调用来源：仅系统模块可调用（非 DISK/application，DISK/server 允许）
     * @returns {boolean} 是否允许
     */
    function _isSystemModuleCaller() {
        try {
            const stack = new Error().stack;
            if (!stack) return false;

            const lines = stack.split('\n');
            let firstCallerLine = null;
            for (let i = 1; i < Math.min(lines.length, 20); i++) {
                const line = lines[i];
                if (line.includes('randomSecurity.js')) continue;
                if (firstCallerLine === null) firstCallerLine = line;

                const normalized = line.replace(/\\/g, '/');
                if (/\/application\//i.test(normalized) && !/\/server\//i.test(normalized)) {
                    // 若直接调用者为 NetworkManager（网络拦截器注入 JWT），则放行
                    if (firstCallerLine && firstCallerLine.replace(/\\/g, '/').includes('networkManager.js')) {
                        return true;
                    }
                    return false;
                }
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 获取系统级 JWT
     * 系统启动时生成一个，之后所有系统模块复用该 JWT
     * 仅系统模块可调用（非 DISK/application 来源，DISK/server 允许）
     * @returns {string|null} 系统 JWT 或 null（获取失败或调用来源非法时为 null）
     */
    function getSystemJWT() {
        if (!_isSystemModuleCaller()) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("RandomSecurity", "getSystemJWT: 调用来源非法，仅系统模块可调用（DISK/application 禁止）");
            }
            return null;
        }
        return _systemJWT;
    }

    // 由安全模块暴露 API，供其他系统模块获取系统级/用户级 JWT
    if (typeof global !== 'undefined') {
        global.RandomSecurity = {
            getSystemJWT: getSystemJWT,
            generateUserToken: generateUserToken,
            getUserJWT: getUserJWT,
            clearUserToken: clearUserToken
        };
    }

})(typeof window !== 'undefined' ? window : globalThis);
