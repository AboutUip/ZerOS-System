// Node 扩展：检测宿主是否支持 shell + Node，在注册表维护 node 可用状态；仅支持手动调用脚本，无定时执行
// setConfig 仅允许 D/server 或 terminal 调用；对程序暴露的 NodeLib API 由 server-nodeLib 在 POOL > SERVER 注册

(function () {
    'use strict';

    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("NodeLibExpansion", "模块初始化");
    }

    function _checkCaller() {
        try {
            var stack = new Error().stack;
            if (!stack) return false;
            if (/terminal|Terminal|debug/i.test(stack)) return true;
            if (/system[\/\\]service[\/\\]DISK[\/\\]D[\/\\]server[\/\\]/i.test(stack)) return true;
            return false;
        } catch (e) {
            return false;
        }
    }

    const STORAGE_KEY = 'nodeLibExpansion';
    const SCRIPT_ID_WHITELIST = ['check', 'perf'];
    const DEFAULT_SCRIPT_ID = 'perf';
    /** 合法 npm 包名：允许 @scope/name 或 name，仅字母数字、连字符、下划线、点，单名最长 256，列表最多 32 个 */
    const NPM_NAME_REGEX = /^(@[a-z0-9-]+\/)?[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
    const NPM_NAME_MAX_LEN = 256;
    const NODE_DEPS_MAX_COUNT = 32;

    let _nodeAvailable = false;
    let _lastCheck = 0;
    let _scriptId = DEFAULT_SCRIPT_ID;
    /** 默认配置性能指标库；init 时始终会包含 PERFORMANCE_LIB_PKG，确保自动安装 */
    let _nodeDependencies = ['systeminformation'];
    const PERFORMANCE_LIB_PKG = 'systeminformation';

    function _getExecUrl() {
        if (typeof SystemInformation !== 'undefined' && typeof SystemInformation.buildServiceUrlObject === 'function') {
            return SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.NODE_LIB_EXEC).toString();
        }
        var origin = typeof SystemInformation !== 'undefined' && typeof SystemInformation.getOrigin === 'function'
            ? SystemInformation.getOrigin()
            : (typeof window !== 'undefined' && window.location ? window.location.origin : '');
        var path = (typeof SystemInformation !== 'undefined' && typeof SystemInformation.getServicePath === 'function')
            ? SystemInformation.getServicePath('nodeLibExec')
            : '/system/service/nodeLibExec.php';
        return (origin || '') + path;
    }

    function _getInitUrl() {
        if (typeof SystemInformation !== 'undefined' && typeof SystemInformation.buildServiceUrlObject === 'function') {
            return SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.NODE_LIB_INIT).toString();
        }
        var origin = typeof SystemInformation !== 'undefined' && typeof SystemInformation.getOrigin === 'function'
            ? SystemInformation.getOrigin()
            : (typeof window !== 'undefined' && window.location ? window.location.origin : '');
        var path = (typeof SystemInformation !== 'undefined' && typeof SystemInformation.getServicePath === 'function')
            ? SystemInformation.getServicePath('nodeLibInit')
            : '/system/service/nodeLibInit.php';
        return (origin || '') + path;
    }

    /**
     * 调用后端 exec 接口（仅 SystemToken 放行）
     * @param {string} scriptId 白名单 scriptId：'check' | 'perf'
     * @returns {Promise<{ success: boolean, data?: Object }>}
     */
    function _callExec(scriptId) {
        if (!SCRIPT_ID_WHITELIST.includes(scriptId)) {
            return Promise.resolve({ success: false });
        }
        var url = _getExecUrl();
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scriptId: scriptId })
        }).then(function (res) {
            return res.json().then(function (data) {
                return { success: res.ok && data && data.status === 'success', data: data };
            }).catch(function () {
                return { success: false };
            });
        }).catch(function () {
            return { success: false };
        });
    }

    function _persistState() {
        if (typeof LStorage === 'undefined') return;
        LStorage.getSystemStorage(STORAGE_KEY).then(function (obj) {
            var o = obj && typeof obj === 'object' ? obj : {};
            o.nodeAvailable = _nodeAvailable;
            o.lastCheck = _lastCheck;
            o.scriptId = _scriptId;
            o.nodeDependencies = Array.isArray(_nodeDependencies) ? _nodeDependencies.slice() : [];
            return LStorage.setSystemStorage(STORAGE_KEY, o);
        }).catch(function () {});
    }

    function _loadConfig() {
        if (typeof LStorage === 'undefined') return Promise.resolve();
        return LStorage.getSystemStorage(STORAGE_KEY).then(function (obj) {
            if (obj && typeof obj === 'object') {
                if (typeof obj.scriptId === 'string' && SCRIPT_ID_WHITELIST.includes(obj.scriptId)) {
                    _scriptId = obj.scriptId;
                }
                if (typeof obj.nodeAvailable === 'boolean') {
                    _nodeAvailable = obj.nodeAvailable;
                }
                if (typeof obj.lastCheck === 'number') {
                    _lastCheck = obj.lastCheck;
                }
                if (Array.isArray(obj.nodeDependencies)) {
                    _nodeDependencies = obj.nodeDependencies.filter(function (p) {
                        return typeof p === 'string' && NPM_NAME_REGEX.test(p) && p.length <= NPM_NAME_MAX_LEN;
                    }).slice(0, NODE_DEPS_MAX_COUNT);
                }
            }
        }).catch(function () {});
    }

    /**
     * 执行一次检测（scriptId=check），更新 nodeAvailable 并写注册表
     */
    function _runCheck() {
        return _callExec('check').then(function (result) {
            var available = result.success && result.data && result.data.data && result.data.data.nodeAvailable === true;
            _nodeAvailable = available;
            _lastCheck = Date.now();
            _persistState();
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("NodeLibExpansion", "Node 环境检测: " + (available ? "可用" : "不可用"));
            }
            return available;
        }).catch(function () {
            _nodeAvailable = false;
            _lastCheck = Date.now();
            _persistState();
            return false;
        });
    }

    var NodeLibExpansion = {
        isNodeAvailable: function () {
            return _nodeAvailable;
        },
        getLastCheck: function () {
            return _lastCheck;
        },
        getConfig: function () {
            return {
                scriptId: _scriptId,
                scriptIdWhitelist: SCRIPT_ID_WHITELIST.slice(),
                nodeDependencies: _nodeDependencies.slice()
            };
        },
        /** 仅 D/server 或 terminal 可调用 */
        setConfig: function (config) {
            if (!_checkCaller()) {
                throw new Error('NodeLibExpansion.setConfig: 仅允许 D/server 或 terminal 调用');
            }
            if (!config || typeof config !== 'object') return Promise.resolve();
            if (typeof config.scriptId === 'string' && SCRIPT_ID_WHITELIST.includes(config.scriptId)) {
                _scriptId = config.scriptId;
            }
            if (Array.isArray(config.nodeDependencies)) {
                _nodeDependencies = config.nodeDependencies.filter(function (p) {
                    return typeof p === 'string' && NPM_NAME_REGEX.test(p) && p.length <= NPM_NAME_MAX_LEN;
                }).slice(0, NODE_DEPS_MAX_COUNT);
            }
            _persistState();
            return Promise.resolve();
        },
        /**
         * 根据配置项 nodeDependencies 检查并安装全局依赖（-g）；已安装则放行，未安装则发起一次 init 请求由后端执行 npm install -g。
         * 仅由 server-nodeLib 在 __start__ 时调用，不在扩展加载或 run(scriptId) 时执行，保证 init 安装只在启动服务时进行。
         * @returns {Promise<{ success: boolean, data?: { alreadyInstalled: string[], installed: string[], failed: string[] } }>}
         */
        ensureNodeDependencies: function () {
            var list = _nodeDependencies.slice();
            if (list.indexOf(PERFORMANCE_LIB_PKG) === -1) {
                list.push(PERFORMANCE_LIB_PKG);
            }
            var url = _getInitUrl();
            return fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packages: list })
            }).then(function (res) {
                return res.json().then(function (data) {
                    var ok = res.ok && data && data.status === 'success';
                    if (typeof KernelLogger !== 'undefined' && data && data.data) {
                        var d = data.data;
                        if (d.installed && d.installed.length) {
                            KernelLogger.info("NodeLibExpansion", "Node 全局依赖已安装: " + d.installed.join(', '));
                        }
                        if (d.failed && d.failed.length) {
                            KernelLogger.warn("NodeLibExpansion", "Node 全局依赖安装失败: " + d.failed.join(', '));
                        }
                    }
                    return { success: ok, data: data.data };
                }).catch(function () {
                    return { success: false };
                });
            }).catch(function () {
                return { success: false };
            });
        },
        /** 执行一次 Node 环境检测，更新注册表 */
        check: function () {
            return _runCheck();
        },
        /** 手动执行一次指定脚本（白名单 scriptId，如 'perf'） */
        run: function (scriptId) {
            if (!SCRIPT_ID_WHITELIST.includes(scriptId) || scriptId === 'check') {
                return Promise.resolve({ success: false });
            }
            return _callExec(scriptId);
        },
        init: function () {
            var self = this;
            return _loadConfig().then(function () {
                return _runCheck();
            }).then(function () {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("NodeLibExpansion", "初始化完成, nodeAvailable=" + _nodeAvailable);
                }
            }).catch(function (e) {
                _nodeAvailable = false;
                _lastCheck = Date.now();
                _persistState();
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("NodeLibExpansion", "初始化失败: " + (e && e.message));
                }
            });
        }
    };

    NodeLibExpansion._ready = NodeLibExpansion.init();

    if (typeof window !== 'undefined') {
        window.NodeLibExpansion = NodeLibExpansion;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.NodeLibExpansion = NodeLibExpansion;
    }

    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "NodeLibExpansion", NodeLibExpansion);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("NodeLibExpansion", "注册到 POOL 失败: " + (e && e.message));
            }
        }
    }

    if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
        DependencyConfig.publishSignal("../system/expansion/nodeLibExpansion.js");
    }
})();
