// 服务扩展：管理系统服务
// 负责从 D/server 自识别并加载 server-xxx.js 服务模块，支持 start/stop 生命周期
// 合规模块需包含 __init__, __start__, __stop__, __status__, __info__ 方法（均为函数）
// 加载时不调用任何方法；仅当明确启用某服务时依次调用 init、start；再次启动不调用 init
//
// 服务模块约定：脚本加载后需调用 window.__ZerOS_ServerExpansion_Register__(api) 上报导出对象，
// 其中 api 必须包含上述五个方法，否则视为不合规、不会加入已加载列表。

(function () {
    'use strict';

    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("ServerExpansion", "模块初始化");
    }

    /** 服务模块存放目录：盘符 D，路径 server（即 D/server） */
    const SERVER_DIR = 'server';
    /** 服务模块命名正则：server-xxx.js */
    const SERVER_FILE_PATTERN = /^server-(.+)\.js$/i;
    /** 合规服务必须实现的方法 */
    const REQUIRED_METHODS = ['__init__', '__start__', '__stop__', '__status__', '__info__'];
    /** LStorage 持久化键（可选：记录已启用的服务等） */
    const STORAGE_KEY = 'serverExpansion';

    /**
     * 获取 D 盘对应的 NodeTree 及 server 路径
     * @returns {{ nodeTree: Object, serverPath: string }|null}
     */
    function getNodeTreeForServer() {
        if (typeof Disk === 'undefined') return null;
        var map = Disk.diskSeparateMap;
        if (!map) return null;
        var nodeTree = map.get('D') || map.get('D:') || null;
        if (!nodeTree) return null;
        var serverPath = nodeTree.separateName + '/' + SERVER_DIR;
        return { nodeTree: nodeTree, serverPath: serverPath };
    }

    /**
     * 列出 D/server 下符合 server-xxx.js 的文件名
     * @returns {string[]}
     */
    function listServerFileNames() {
        var ref = getNodeTreeForServer();
        if (!ref || !ref.nodeTree.initialized) return [];
        if (typeof ref.nodeTree.hasNode === 'function' && !ref.nodeTree.hasNode(ref.serverPath)) {
            return [];
        }
        try {
            var list = ref.nodeTree.list_file(ref.serverPath);
            if (!Array.isArray(list)) return [];
            return list
                .filter(function (item) { return item && item.name && SERVER_FILE_PATTERN.test(item.name); })
                .map(function (item) { return item.name; });
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("ServerExpansion", "列出服务目录失败: " + (e && e.message));
            }
            return [];
        }
    }

    /**
     * 检查模块导出是否合规（所有必需方法存在且为函数）
     * @param {*} api 模块导出对象
     * @returns {boolean}
     */
    function isCompliant(api) {
        if (!api || typeof api !== 'object') return false;
        for (var i = 0; i < REQUIRED_METHODS.length; i++) {
            var key = REQUIRED_METHODS[i];
            if (typeof api[key] !== 'function') return false;
        }
        return true;
    }

    /** 已加载的合规服务：id -> { api, inited, started } */
    var _modules = new Map();
    /** 已加载过的脚本 URL 集合，避免重复加载 */
    var _loadedUrls = new Set();

    /**
     * 通过 script 标签加载单个服务脚本，并等待其通过全局注册函数上报导出
     * @param {string} fileName 文件名，如 server-xxx.js
     * @returns {Promise<{ id: string, api: Object }|null>} 合规则返回 { id, api }，否则 null
     */
    function loadServerScript(fileName) {
        var match = fileName.match(SERVER_FILE_PATTERN);
        if (!match) return Promise.resolve(null);
        var id = match[1];
        var virtualPath = 'D:/' + SERVER_DIR + '/' + fileName;
        var actualUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
            ? ProcessManager.convertVirtualPathToUrl(virtualPath)
            : '/system/service/DISK/D/' + SERVER_DIR + '/' + fileName;

        if (_loadedUrls.has(actualUrl)) {
            var existing = _modules.get(id);
            return Promise.resolve(existing ? { id: id, api: existing.api } : null);
        }

        return new Promise(function (resolve) {
            var pending = { name: id, api: null };
            if (typeof window !== 'undefined') {
                window.__ZerOS_ServerExpansion_Pending__ = pending;
                window.__ZerOS_ServerExpansion_Register__ = function (api) {
                    window.__ZerOS_ServerExpansion_Pending__.api = api;
                };
            }

            var script = document.createElement('script');
            script.src = actualUrl;
            script.async = true;
            script.onload = function () {
                if (typeof window !== 'undefined') {
                    var api = window.__ZerOS_ServerExpansion_Pending__ && window.__ZerOS_ServerExpansion_Pending__.api;
                    if (api && isCompliant(api)) {
                        _modules.set(id, { api: api, inited: false, started: false });
                        _loadedUrls.add(actualUrl);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info("ServerExpansion", "已加载合规服务: " + id);
                        }
                        resolve({ id: id, api: api });
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("ServerExpansion", "服务模块不合规或未注册: " + fileName);
                        }
                        resolve(null);
                    }
                    try {
                        delete window.__ZerOS_ServerExpansion_Pending__;
                        delete window.__ZerOS_ServerExpansion_Register__;
                    } catch (e) {}
                } else {
                    resolve(null);
                }
            };
            script.onerror = function () {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("ServerExpansion", "加载服务脚本失败: " + virtualPath);
                }
                if (typeof window !== 'undefined') {
                    try {
                        delete window.__ZerOS_ServerExpansion_Pending__;
                        delete window.__ZerOS_ServerExpansion_Register__;
                    } catch (e) {}
                }
                resolve(null);
            };
            document.head.appendChild(script);
        });
    }

    /**
     * 等待 D/server 可用（系统初始化后立刻可加载服务）
     * @param {number} maxWaitMs 最大等待毫秒数
     * @param {number} intervalMs 轮询间隔
     * @returns {Promise<void>}
     */
    function waitForServerPathReady(maxWaitMs, intervalMs) {
        maxWaitMs = maxWaitMs || 10000;
        intervalMs = intervalMs || 200;
        var start = Date.now();
        return new Promise(function (resolve) {
            function check() {
                var ref = getNodeTreeForServer();
                if (ref && ref.nodeTree && ref.nodeTree.initialized) {
                    resolve();
                    return;
                }
                if (Date.now() - start >= maxWaitMs) {
                    resolve();
                    return;
                }
                setTimeout(check, intervalMs);
            }
            check();
        });
    }

    /**
     * 扫描 D/server 并加载所有 server-*.js，仅加载不调用任何方法
     * @returns {Promise<string[]>} 合规服务 id 列表
     */
    function discoverAndLoad() {
        var fileNames = listServerFileNames();
        if (fileNames.length === 0) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug("ServerExpansion", "D/server 下无服务文件或目录不存在");
            }
            return Promise.resolve([]);
        }
        var seq = Promise.resolve();
        var ids = [];
        fileNames.forEach(function (fileName) {
            seq = seq.then(function () {
                return loadServerScript(fileName).then(function (result) {
                    if (result) ids.push(result.id);
                    return ids;
                });
            });
        });
        return seq.then(function () { return ids; });
    }

    var ServerExpansion = {
        /**
         * 获取所有已加载的合规服务 id
         * @returns {string[]}
         */
        listServices: function () {
            return Array.from(_modules.keys());
        },

        /**
         * 扫描并加载 D/server 下所有合规服务（不调用 init/start）
         * @returns {Promise<string[]>} 合规服务 id 列表
         */
        loadAll: function () {
            return discoverAndLoad();
        },

        /**
         * 启动服务：首次会先 __init__ 再 __start__，之后仅 __start__
         * @param {string} id 服务 id（如 server-xxx.js 中的 xxx）
         * @returns {Promise<boolean>} 是否成功
         */
        start: function (id) {
            var entry = _modules.get(id);
            if (!entry) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("ServerExpansion", "start: 未知服务 " + id);
                }
                // 抛出以便计划任务等调用方可走 loadAll 后重试（若仅 return false 则不会触发重试）
                return Promise.reject(new Error("未知服务 " + id));
            }
            var api = entry.api;
            return Promise.resolve().then(function () {
                if (!entry.inited) {
                    try {
                        if (typeof api.__init__ === 'function') api.__init__();
                        entry.inited = true;
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("ServerExpansion", "start: __init__ 失败 " + id + ", " + (e && e.message));
                        }
                        return false;
                    }
                }
                try {
                    if (typeof api.__start__ === 'function') api.__start__();
                    entry.started = true;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info("ServerExpansion", "服务已启动: " + id);
                    }
                    return true;
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("ServerExpansion", "start: __start__ 失败 " + id + ", " + (e && e.message));
                    }
                    return false;
                }
            });
        },

        /**
         * 停止服务
         * @param {string} id 服务 id
         * @returns {Promise<boolean>} 是否成功
         */
        stop: function (id) {
            var entry = _modules.get(id);
            if (!entry) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("ServerExpansion", "stop: 未知服务 " + id);
                }
                return Promise.resolve(false);
            }
            try {
                if (typeof entry.api.__stop__ === 'function') entry.api.__stop__();
                entry.started = false;
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("ServerExpansion", "服务已停止: " + id);
                }
                return Promise.resolve(true);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("ServerExpansion", "stop: __stop__ 失败 " + id + ", " + (e && e.message));
                }
                return Promise.resolve(false);
            }
        },

        /**
         * 查询服务状态（调用模块 __status__）
         * @param {string} id 服务 id
         * @returns {Promise<*>} __status__ 返回值，未加载或失败则返回 undefined
         */
        status: function (id) {
            var entry = _modules.get(id);
            if (!entry || typeof entry.api.__status__ !== 'function') {
                return Promise.resolve(undefined);
            }
            try {
                var result = entry.api.__status__();
                return Promise.resolve(result);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("ServerExpansion", "status: " + id + ", " + (e && e.message));
                }
                return Promise.resolve(undefined);
            }
        },

        /**
         * 获取服务信息（调用模块 __info__）
         * @param {string} id 服务 id
         * @returns {Promise<*>} __info__ 返回值，未加载或失败则返回 undefined
         */
        info: function (id) {
            var entry = _modules.get(id);
            if (!entry || typeof entry.api.__info__ !== 'function') {
                return Promise.resolve(undefined);
            }
            try {
                var result = entry.api.__info__();
                return Promise.resolve(result);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("ServerExpansion", "info: " + id + ", " + (e && e.message));
                }
                return Promise.resolve(undefined);
            }
        },

        /**
         * 判断服务是否已初始化（已调用过 __init__）
         * @param {string} id 服务 id
         * @returns {boolean}
         */
        isInited: function (id) {
            var entry = _modules.get(id);
            return !!(entry && entry.inited);
        },

        /**
         * 判断服务是否已启动（已调用 __start__ 且未 __stop__）
         * @param {string} id 服务 id
         * @returns {boolean}
         */
        isStarted: function (id) {
            var entry = _modules.get(id);
            return !!(entry && entry.started);
        },

        /**
         * 初始化扩展：在系统（D/server）就绪后立刻扫描并加载所有合规服务脚本，不调用任何服务的 __init__/__start__
         * @returns {Promise<string[]>} 已加载的合规服务 id 列表
         */
        init: function () {
            var self = this;
            return waitForServerPathReady(10000, 200).then(function () {
                return discoverAndLoad();
            }).then(function (ids) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("ServerExpansion", "初始化完成，已加载服务: " + (ids.length ? ids.join(', ') : '(无)'));
                }
                return ids;
            });
        }
    };

    // 系统初始化后立刻加载服务（仅加载脚本、不调用各服务的 init/start）
    ServerExpansion._ready = ServerExpansion.init();

    if (typeof window !== 'undefined') {
        window.ServerExpansion = ServerExpansion;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.ServerExpansion = ServerExpansion;
    }

    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "ServerExpansion", ServerExpansion);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("ServerExpansion", "注册到 POOL 失败: " + (e && e.message));
            }
        }
    }

    if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
        DependencyConfig.publishSignal("../system/expansion/serverExpansion.js");
    }
})();
