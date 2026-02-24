// WASM 总控服务
// 管理 WebAssembly 模块的加载、卸载和调用
// 自动检测 D/wasm 目录下的所有 WASM 模块并加载

(function () {
    'use strict';

    const SYSTEM_PID = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;

    const STORAGE_KEY = '_wasm_service_tracking';

    var _running = false;
    var _moduleStates = new Map();

    function _log(type, message) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger[type]('WASMService', message);
        }
    }

    function _ensureWasmExpansion() {
        if (typeof window !== 'undefined' && window.WasmExpansion) {
            return window.WasmExpansion;
        }
        throw new Error('WasmExpansion 扩展未加载');
    }

    function _saveModuleStates() {
        if (typeof LStorage !== 'undefined' && typeof LStorage.setSystemStorage === 'function') {
            var states = {};
            _moduleStates.forEach(function(value, key) {
                states[key] = value;
            });
            LStorage.setSystemStorage(STORAGE_KEY, states).catch(function(e) {
                _log('warn', '保存模块状态失败: ' + e.message);
            });
        }
    }

    function _loadModuleStates() {
        return new Promise(function(resolve) {
            if (typeof LStorage === 'undefined' || typeof LStorage.getSystemStorage !== 'function') {
                resolve({});
                return;
            }
            LStorage.getSystemStorage(STORAGE_KEY).then(function(data) {
                if (data && typeof data === 'object') {
                    _log('debug', '从存储加载了 ' + Object.keys(data).length + ' 个模块状态');
                    Object.keys(data).forEach(function(key) {
                        _moduleStates.set(key, data[key]);
                    });
                }
                resolve(Object.keys(data || {}));
            }).catch(function(e) {
                _log('warn', '加载模块状态失败: ' + e.message);
                resolve({});
            });
        });
    }

    function _updateModuleState(moduleName, state) {
        var current = _moduleStates.get(moduleName) || {};
        var newState = Object.assign({}, current, state, {
            lastUpdate: Date.now()
        });
        _moduleStates.set(moduleName, newState);
        _saveModuleStates();
        return newState;
    }

    function _getModuleState(moduleName) {
        return _moduleStates.get(moduleName) || null;
    }

    function _extractModuleName(fileName) {
        return fileName.replace(/\.wasm$/i, '');
    }

    const WasmService = {
        __init__: function() {
            _log('info', 'WASM 服务初始化');
            return _loadModuleStates();
        },

        __start__: function() {
            _running = true;
            _log('info', 'WASM 服务启动');

            var wasm = _ensureWasmExpansion();
            var available = wasm.listAvailable();
            _log('info', '检测到 ' + available.length + ' 个 WASM 模块');

            var loadPromises = available.map(function(fileName) {
                var moduleName = _extractModuleName(fileName);

                _updateModuleState(moduleName, {
                    fileName: fileName,
                    status: 'loading'
                });

                return wasm.loadModule(moduleName).then(function(result) {
                    if (result.success) {
                        _updateModuleState(moduleName, {
                            status: 'loaded',
                            exports: result.exports || [],
                            loadedAt: Date.now()
                        });
                        _log('info', '模块 ' + moduleName + ' 自动加载成功');
                    } else {
                        _updateModuleState(moduleName, {
                            status: 'error',
                            error: result.message
                        });
                        _log('warn', '模块 ' + moduleName + ' 加载失败: ' + result.message);
                    }
                    return result;
                });
            });

            return Promise.all(loadPromises).then(function() {
                return { success: true, message: 'WASM 服务已启动，共 ' + available.length + ' 个模块' };
            });
        },

        __stop__: function() {
            _running = false;
            _log('info', 'WASM 服务已停止');
            return { success: true, message: 'WASM 服务已停止' };
        },

        __status__: function() {
            var wasm = null;
            var available = [];

            try {
                wasm = _ensureWasmExpansion();
                available = wasm.listAvailable();
            } catch (e) {
                return {
                    running: _running,
                    error: e.message
                };
            }

            var modules = available.map(function(fileName) {
                var moduleName = _extractModuleName(fileName);
                var state = _getModuleState(moduleName);
                var isLoaded = wasm.isLoaded(moduleName);
                var exports = isLoaded ? wasm.getExports(moduleName) : [];

                return {
                    name: moduleName,
                    fileName: fileName,
                    loaded: isLoaded,
                    exports: exports,
                    status: state ? state.status : (isLoaded ? 'loaded' : 'available'),
                    autoLoad: state ? state.autoLoad : true,
                    error: state ? state.error : null,
                    loadedAt: state ? state.loadedAt : null,
                    lastUpdate: state ? state.lastUpdate : null
                };
            });

            return {
                running: _running,
                totalModules: modules.length,
                loadedCount: modules.filter(function(m) { return m.loaded; }).length,
                modules: modules
            };
        },

        __info__: function() {
            return {
                name: 'WASM Service',
                version: '1.0.0',
                description: 'WebAssembly 模块总控服务 - 自动检测并加载 WASM 模块',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS'
            };
        },

        listAvailable: function() {
            var wasm = _ensureWasmExpansion();
            var available = wasm.listAvailable();
            return available.map(function(fileName) {
                return _extractModuleName(fileName);
            });
        },

        listLoaded: function() {
            var wasm = _ensureWasmExpansion();
            return wasm.listModules();
        },

        getModuleStatus: function(moduleName) {
            var wasm = _ensureWasmExpansion();
            var isLoaded = wasm.isLoaded(moduleName);
            var state = _getModuleState(moduleName);
            var exports = isLoaded ? wasm.getExports(moduleName) : [];

            return {
                name: moduleName,
                loaded: isLoaded,
                exports: exports,
                status: state ? state.status : (isLoaded ? 'loaded' : 'available'),
                autoLoad: state ? state.autoLoad : true,
                error: state ? state.error : null,
                loadedAt: state ? state.loadedAt : null,
                lastUpdate: state ? state.lastUpdate : null
            };
        },

        getAllModulesStatus: function() {
            var status = this.__status__();
            return status.modules || [];
        },

        load: function(moduleName, wasmPath) {
            var wasm = _ensureWasmExpansion();

            _updateModuleState(moduleName, {
                status: 'loading'
            });

            return wasm.loadModule(moduleName, wasmPath).then(function(result) {
                if (result.success) {
                    _updateModuleState(moduleName, {
                        status: 'loaded',
                        exports: result.exports || [],
                        loadedAt: Date.now()
                    });
                } else {
                    _updateModuleState(moduleName, {
                        status: 'error',
                        error: result.message
                    });
                }
                return result;
            });
        },

        unload: function(moduleName) {
            var wasm = _ensureWasmExpansion();
            var result = wasm.unloadModule(moduleName);

            if (result.success) {
                _updateModuleState(moduleName, {
                    status: 'unloaded'
                });
            }

            return result;
        },

        reload: function(moduleName) {
            var wasm = _ensureWasmExpansion();

            wasm.unloadModule(moduleName);

            _updateModuleState(moduleName, {
                status: 'loading'
            });

            return wasm.loadModule(moduleName).then(function(result) {
                if (result.success) {
                    _updateModuleState(moduleName, {
                        status: 'loaded',
                        exports: result.exports || [],
                        loadedAt: Date.now()
                    });
                } else {
                    _updateModuleState(moduleName, {
                        status: 'error',
                        error: result.message
                    });
                }
                return result;
            });
        },

        call: function(moduleName, functionName) {
            var wasm = _ensureWasmExpansion();
            var args = Array.prototype.slice.call(arguments).slice(2);
            return wasm.callFunction.apply(wasm, [moduleName, functionName].concat(args));
        },

        getExports: function(moduleName) {
            var wasm = _ensureWasmExpansion();
            return wasm.getExports(moduleName);
        },

        setAutoLoad: function(moduleName, autoLoad) {
            var state = _getModuleState(moduleName);
            _updateModuleState(moduleName, Object.assign({}, state, {
                autoLoad: autoLoad
            }));
            return { success: true, autoLoad: autoLoad };
        },

        getAutoLoad: function() {
            var autoLoad = [];
            _moduleStates.forEach(function(state, name) {
                if (state.autoLoad !== false) {
                    autoLoad.push(name);
                }
            });
            return autoLoad;
        },

        isModuleLoaded: function(moduleName) {
            var wasm = _ensureWasmExpansion();
            return wasm.isLoaded(moduleName);
        }
    };

    if (typeof window !== 'undefined') {
        window.__ZerOS_ServerExpansion_Register__(WasmService);
    }

})();
