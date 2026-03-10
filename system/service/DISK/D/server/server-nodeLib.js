// Node 脚本服务：依赖 NodeLibExpansion，仅手动调用；启动后向 POOL > SERVER 暴露 NodeLib API 供程序使用

(function () {
    'use strict';

    const POOL_CATEGORY = 'SERVER';
    const POOL_KEY = 'NodeLib';

    var _running = false;

    function _log(level, msg) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger[level]('NodeLibService', msg);
        }
    }

    function _ensureNodeLibExpansion() {
        var exp = typeof window !== 'undefined' ? window.NodeLibExpansion : null;
        if (!exp) {
            throw new Error('NodeLibExpansion 扩展未加载');
        }
        return exp;
    }

    function _getNodeLibAPI() {
        var exp = _ensureNodeLibExpansion();
        return {
            isNodeAvailable: function () { return exp.isNodeAvailable(); },
            getLastCheck: function () { return exp.getLastCheck(); },
            getConfig: function () { return exp.getConfig(); },
            check: function () { return exp.check(); },
            run: function (scriptId) { return exp.run(scriptId); }
        };
    }

    var NodeLibService = {
        __init__: function () {
            _log('info', 'Node 脚本服务初始化');
        },

        __start__: function () {
            if (_running) return;
            _running = true;
            _log('info', 'Node 脚本服务启动');

            var exp = _ensureNodeLibExpansion();
            var ready = exp._ready || Promise.resolve();

            ready.then(function () {
                // 仅在此处（启动服务时）发起 init：检查并 npm install -g 配置的依赖，不随扩展加载或 run(scriptId) 触发
                return Promise.race([
                    exp.ensureNodeDependencies(),
                    new Promise(function (_, reject) {
                        setTimeout(function () { reject(new Error('ensureNodeDependencies 超时')); }, 90000);
                    })
                ]).catch(function (e) {
                    _log('warn', 'Node 依赖检查/安装: ' + (e && e.message));
                    return null;
                }).then(function () {
                    return exp.check();
                });
            }).then(function () {
                if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                    try {
                        if (!POOL.__HAS__(POOL_CATEGORY)) {
                            POOL.__INIT__(POOL_CATEGORY);
                        }
                        POOL.__ADD__(POOL_CATEGORY, POOL_KEY, _getNodeLibAPI());
                        _log('info', '已向 POOL > SERVER 注册 NodeLib');
                    } catch (e) {
                        _log('warn', '注册 POOL 失败: ' + (e && e.message));
                    }
                }
            }).catch(function (e) {
                _log('warn', '启动时检测 Node 失败: ' + (e && e.message));
                if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                    try {
                        if (!POOL.__HAS__(POOL_CATEGORY)) {
                            POOL.__INIT__(POOL_CATEGORY);
                        }
                        POOL.__ADD__(POOL_CATEGORY, POOL_KEY, _getNodeLibAPI());
                        _log('info', '已向 POOL > SERVER 注册 NodeLib（Node 不可用时 API 仍可用）');
                    } catch (err) {
                        _log('warn', '注册 POOL 失败: ' + (err && err.message));
                    }
                }
            });
        },

        __stop__: function () {
            if (!_running) return;
            _running = false;
            if (typeof POOL !== 'undefined' && typeof POOL.__REMOVE__ === 'function') {
                try {
                    POOL.__REMOVE__(POOL_CATEGORY, POOL_KEY);
                    _log('info', '已从 POOL > SERVER 移除 NodeLib');
                } catch (e) {
                    _log('warn', '移除 POOL 失败: ' + (e && e.message));
                }
            }
            _log('info', 'Node 脚本服务已停止');
        },

        __status__: function () {
            try {
                var exp = _ensureNodeLibExpansion();
                return {
                    running: _running,
                    nodeAvailable: exp.isNodeAvailable(),
                    lastCheck: exp.getLastCheck(),
                    poolExposed: _running
                };
            } catch (e) {
                return { running: _running, nodeAvailable: false, error: e && e.message };
            }
        },

        __info__: function () {
            return {
                name: 'Node 脚本服务',
                version: '1.0.0',
                description: '仅手动调用 Node 脚本（system/assets/nodeLibs）。启动后向 POOL > SERVER 暴露 NodeLib（isNodeAvailable / getLastCheck / getConfig / check / run），程序通过 POOL.__GET__("SERVER", "NodeLib") 获取',
                author: 'ZerOS Team'
            };
        }
    };

    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__(NodeLibService);
    }
})();
