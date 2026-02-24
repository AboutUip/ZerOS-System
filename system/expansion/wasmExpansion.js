// WASM 扩展：WebAssembly 模块管理器
// 负责加载、管理和执行 WebAssembly 模块
// 仅允许 D/server 目录下服务调用（通过调用栈检查）

(function () {
    'use strict';

    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("WasmExpansion", "模块初始化");
    }

    const SYSTEM_PID = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;

    const WASM_DIR = 'wasm';

    const _wasmModules = new Map();
    const _wasmInstances = new Map();

    function _checkCaller() {
        try {
            const stack = new Error().stack;
            if (!stack) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("WasmExpansion", "无法获取调用栈");
                }
                return false;
            }

            if (stack.includes('terminal') || stack.includes('Terminal') || stack.includes('debug')) {
                return true;
            }

            const lines = stack.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('wasmExpansion.js')) continue;

                if (line.includes('system/service/DISK/D/server/')) {
                    const match = line.match(/system\/service\/DISK\/D\/server\/([^:/]+)/);
                    if (match && match[1]) {
                        return true;
                    }
                }
            }

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("WasmExpansion", "非法的调用来源");
            }
            return false;
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("WasmExpansion", "调用来源验证失败: " + e.message);
            }
            return false;
        }
    }

    function _getNodeTreeForWasm() {
        if (typeof Disk === 'undefined') return null;
        let map = Disk.diskSeparateMap;
        if (!map) return null;
        let nodeTree = map.get('D') || map.get('D:') || null;
        if (!nodeTree) return null;
        let wasmPath = nodeTree.separateName + '/' + WASM_DIR;
        return { nodeTree: nodeTree, wasmPath: wasmPath };
    }

    async function _loadWasmFile(fileName) {
        let ref = _getNodeTreeForWasm();
        if (!ref || !ref.nodeTree.initialized) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("WasmExpansion", "无法读取 WASM: D 盘或 wasm 目录未就绪");
            }
            return null;
        }
        if (typeof ref.nodeTree.hasNode === 'function' && !ref.nodeTree.hasNode(ref.wasmPath)) {
            return null;
        }
        try {
            let content = await ref.nodeTree.read_file(ref.wasmPath, fileName);
            return content != null ? String(content) : null;
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("WasmExpansion", "读取 WASM 文件失败: " + fileName + ", " + (e && e.message));
            }
            return null;
        }
    }

    function _listWasmFiles() {
        var ref = _getNodeTreeForWasm();
        if (!ref || !ref.nodeTree.initialized) return [];
        if (typeof ref.nodeTree.hasNode === 'function' && !ref.nodeTree.hasNode(ref.wasmPath)) {
            return [];
        }
        try {
            var list = ref.nodeTree.list_file(ref.wasmPath);
            if (!Array.isArray(list)) return [];
            return list
                .filter(function (item) { return item && item.name && /\.wasm$/i.test(item.name); })
                .map(function (item) { return item.name; });
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("WasmExpansion", "列出 WASM 文件失败: " + (e && e.message));
            }
            return [];
        }
    }

    async function _fetchWasmBytes(url) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function() {
                if (xhr.status === 200) {
                    resolve(xhr.response);
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            };
            xhr.onerror = function() {
                reject(new Error('Network error'));
            };
            xhr.send();
        });
    }

    const WasmExpansion = {
        listModules: function() {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }
            return Array.from(_wasmModules.keys());
        },

        getModuleInfo: function(moduleName) {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }
            if (!_wasmModules.has(moduleName)) {
                return null;
            }
            return _wasmModules.get(moduleName);
        },

        isLoaded: function(moduleName) {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }
            return _wasmModules.has(moduleName) && _wasmInstances.has(moduleName);
        },

        loadModule: async function(moduleName, wasmPath) {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }

            if (_wasmModules.has(moduleName)) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("WasmExpansion", "模块已加载: " + moduleName);
                }
                return { success: true, message: '模块已加载', alreadyLoaded: true };
            }

            try {
                let wasmBytes;
                if (wasmPath) {
                    if (wasmPath.startsWith('http://') || wasmPath.startsWith('https://')) {
                        wasmBytes = await _fetchWasmBytes(wasmPath);
                    } else {
                        let fileName = wasmPath;
                        if (!fileName.endsWith('.wasm')) {
                            fileName = fileName + '.wasm';
                        }
                        let content = await _loadWasmFile(fileName);
                        if (!content) {
                            throw new Error('WASM 文件不存在: ' + fileName);
                        }
                        wasmBytes = new Uint8Array(content.split('').map(function(c) { return c.charCodeAt(0); }));
                    }
                } else {
                    let defaultFile = moduleName + '.wasm';
                    let content = await _loadWasmFile(defaultFile);
                    if (!content) {
                        throw new Error('WASM 文件不存在: ' + defaultFile);
                    }
                    wasmBytes = new Uint8Array(content.split('').map(function(c) { return c.charCodeAt(0); }));
                }

                const module = await WebAssembly.compile(wasmBytes);
                const instance = await WebAssembly.instantiate(module, {});

                _wasmModules.set(moduleName, {
                    name: moduleName,
                    module: module,
                    loadedAt: Date.now()
                });

                _wasmInstances.set(moduleName, instance);

                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("WasmExpansion", "WASM 模块加载成功: " + moduleName);
                }

                return {
                    success: true,
                    message: '模块加载成功',
                    exports: Object.keys(instance.exports)
                };
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("WasmExpansion", "WASM 模块加载失败: " + moduleName + ", " + e.message);
                }
                return {
                    success: false,
                    message: e.message
                };
            }
        },

        unloadModule: function(moduleName) {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }

            if (!_wasmModules.has(moduleName)) {
                return { success: false, message: '模块不存在' };
            }

            _wasmModules.delete(moduleName);
            _wasmInstances.delete(moduleName);

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("WasmExpansion", "WASM 模块卸载: " + moduleName);
            }

            return { success: true, message: '模块已卸载' };
        },

        callFunction: function(moduleName, functionName) {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }

            if (!_wasmInstances.has(moduleName)) {
                throw new Error('模块未加载: ' + moduleName);
            }

            const instance = _wasmInstances.get(moduleName);
            if (!instance.exports[functionName]) {
                throw new Error('函数不存在: ' + functionName);
            }

            const args = Array.prototype.slice.call(arguments).slice(2);
            return instance.exports[functionName].apply(null, args);
        },

        getExports: function(moduleName) {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }

            if (!_wasmInstances.has(moduleName)) {
                return null;
            }

            return Object.keys(_wasmInstances.get(moduleName).exports);
        },

        listAvailable: function() {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }

            return _listWasmFiles();
        },

        getMemory: function(moduleName) {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }

            if (!_wasmInstances.has(moduleName)) {
                return null;
            }

            const instance = _wasmInstances.get(moduleName);
            return instance.exports.memory || null;
        },

        readMemory: function(moduleName, offset, length) {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }

            const memory = this.getMemory(moduleName);
            if (!memory) {
                throw new Error('模块没有导出内存');
            }

            const buffer = new Uint8Array(memory.buffer, offset, length);
            return Array.from(buffer);
        },

        writeMemory: function(moduleName, offset, data) {
            if (!_checkCaller()) {
                throw new Error('权限不足：仅允许 server 目录下的服务调用');
            }

            const memory = this.getMemory(moduleName);
            if (!memory) {
                throw new Error('模块没有导出内存');
            }

            const buffer = new Uint8Array(memory.buffer);
            buffer.set(new Uint8Array(data), offset);
            return true;
        }
    };

    if (typeof window !== 'undefined') {
        window.WasmExpansion = WasmExpansion;
    }

    if (typeof DependencyConfig !== 'undefined') {
        DependencyConfig.publishSignal("../system/expansion/wasmExpansion.js");
    }

})();
