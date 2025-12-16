// BootLoader: 内核引导程序
// 负责管理模块依赖关系，按正确顺序异步加载所有内核模块
(function() {
    'use strict';
    
    // 定义模块依赖关系图
    const MODULE_DEPENDENCIES = {
        // 第零层：基础核心模块（在 HTML 中直接加载）
        // - KernelLogger: 在 HTML 中直接加载
        // - DependencyConfig: 在 HTML 中直接加载（依赖 KernelLogger）
        // - POOL: 在 HTML 中直接加载（依赖 KernelLogger 和 DependencyConfig）
        // 这些模块不在此依赖图中
        
        // 第一层：基础枚举管理器（依赖 pool）
        // 注意：pool、DependencyConfig 已在 HTML 中加载，不需要在依赖图中
        "../kernel/typePool/enumManager.js": [],
        
        // 第三层：依赖 enumManager 的枚举
        "../kernel/typePool/logLevel.js": ["../kernel/typePool/enumManager.js"],
        "../kernel/typePool/addressType.js": ["../kernel/typePool/enumManager.js"],
        "../kernel/typePool/fileType.js": ["../kernel/typePool/enumManager.js"],
        
        // 第四层：文件系统模块（依赖 fileType）
        "../kernel/fileSystem/fileFramework.js": ["../kernel/typePool/fileType.js"],
        "../kernel/fileSystem/disk.js": [],
        "../kernel/fileSystem/nodeTree.js": ["../kernel/typePool/fileType.js"],
        
        // 第五层：内存管理模块（依赖 addressType 和 logLevel）
        "../kernel/memory/heap.js": ["../kernel/typePool/logLevel.js", "../kernel/typePool/addressType.js"],
        "../kernel/memory/shed.js": ["../kernel/typePool/logLevel.js", "../kernel/typePool/addressType.js"],
        "../kernel/memory/memoryManager.js": ["../kernel/typePool/logLevel.js", "../kernel/memory/heap.js", "../kernel/memory/shed.js"],
        "../kernel/memory/kernelMemory.js": ["../kernel/memory/memoryManager.js"],
        "../kernel/memory/memoryUtils.js": ["../kernel/memory/memoryManager.js", "../kernel/memory/heap.js"],
        
        // 第六层：进程管理模块（依赖内存管理）
        // 注意：applicationAssets.js 和 applicationAssetManager.js 由 processManager.js 动态加载
        "../kernel/process/applicationAssets.js": [],
        "../kernel/process/applicationAssetManager.js": ["../kernel/process/applicationAssets.js"],
        "../kernel/process/programCategories.js": [], // 程序类别配置（独立模块）
        "../kernel/process/processManager.js": ["../kernel/memory/memoryManager.js", "../kernel/memory/kernelMemory.js", "../kernel/process/applicationAssetManager.js"],
        
        // 第六层：事件管理器（必须在其他使用事件的模块之前加载）
        "../kernel/process/eventManager.js": ["../kernel/process/processManager.js"],
        
        // 第七层：GUI 和菜单管理模块（依赖进程管理器和事件管理器）
        "../kernel/process/guiManager.js": ["../kernel/process/processManager.js", "../kernel/process/eventManager.js"],
        "../kernel/process/contextMenuManager.js": ["../kernel/process/processManager.js", "../kernel/process/eventManager.js"],
        "../kernel/process/taskbarManager.js": ["../kernel/process/processManager.js", "../kernel/process/applicationAssetManager.js", "../kernel/process/contextMenuManager.js", "../kernel/process/eventManager.js", "../kernel/process/programCategories.js", "../kernel/process/themeManager.js"],
        "../kernel/process/notificationManager.js": ["../kernel/process/taskbarManager.js", "../kernel/process/processManager.js", "../kernel/process/eventManager.js"],
        "../kernel/process/desktop.js": ["../kernel/process/processManager.js", "../kernel/process/applicationAssetManager.js", "../kernel/process/contextMenuManager.js", "../kernel/process/themeManager.js", "../kernel/process/guiManager.js", "../kernel/process/eventManager.js"],
        
        // 第七层：文件系统初始化（依赖所有文件系统模块）
        "../kernel/fileSystem/init.js": [
            "../kernel/fileSystem/disk.js",
            "../kernel/fileSystem/nodeTree.js",
            "../kernel/fileSystem/fileFramework.js"
        ],
        
        // 第八层：网络管理模块（独立模块）
        "../kernel/drive/networkManager.js": [],
        
        // 第九层：动态模块管理器（独立模块）
        "../kernel/dynamicModule/dynamicManager.js": [],
        
        // 第九层：系统信息模块（独立模块，可在任何地方使用）
        "../kernel/SystemInformation.js": [],
        
        // 第十层：本地存储管理器（依赖文件系统）
        "../kernel/drive/LStorage.js": [
            "../kernel/fileSystem/init.js",
            "../kernel/fileSystem/nodeTree.js",
            "../kernel/fileSystem/fileFramework.js"
        ],
        
        // 第十一层：主题管理器（依赖本地存储管理器）
        "../kernel/process/themeManager.js": [
            "../kernel/drive/LStorage.js"
        ],
        
        // 第十一层：权限管理器（依赖进程管理器和本地存储管理器）
        "../kernel/process/permissionManager.js": [
            "../kernel/process/processManager.js",
            "../kernel/drive/LStorage.js"
        ],
        
        // 第十二层：动画管理器（依赖动态模块管理器，用于管理 animate.css）
        "../kernel/drive/animateManager.js": [
            "../kernel/dynamicModule/dynamicManager.js"
        ],
        
        // 第十二层：多线程驱动器（依赖进程管理器，用于进程退出时清理线程）
        "../kernel/drive/multithreadingDrive.js": [
            "../kernel/process/processManager.js"
        ],
        
        // 第十二层：拖拽驱动器（依赖进程管理器，用于进程退出时清理拖拽会话）
        "../kernel/drive/dragDrive.js": [
            "../kernel/process/processManager.js"
        ],
        
        // 第十二层：地理位置驱动器（依赖进程管理器，用于权限检查）
        "../kernel/drive/geographyDrive.js": [
            "../kernel/process/processManager.js"
        ],
        
        // 第十二层：加密驱动器（依赖本地存储管理器和动态模块管理器）
        "../kernel/drive/cryptDrive.js": [
            "../kernel/drive/LStorage.js",
            "../kernel/dynamicModule/dynamicManager.js"
        ],
    };
    
    // 加载脚本的 Promise 缓存
    const scriptPromises = new Map();
    
    /**
     * 异步加载单个脚本文件
     * @param {string} src - 脚本路径
     * @returns {Promise<void>}
     */
    function loadScript(src) {
        // 如果已经加载过，返回缓存的 Promise
        if (scriptPromises.has(src)) {
            return scriptPromises.get(src);
        }
        
        // 如果脚本已经存在于 DOM 中，直接返回 resolved Promise
        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
            const promise = Promise.resolve();
            scriptPromises.set(src, promise);
            return promise;
        }
        
        // 创建新的加载 Promise
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = false; // 确保顺序执行
            
            script.onload = () => {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("BootLoader", `脚本加载完成: ${src}`);
                } else {
                    console.log(`[内核][BootLoader] 脚本加载完成: ${src}`);
                }
                resolve();
            };
            
            script.onerror = () => {
                const error = new Error(`Failed to load script: ${src}`);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("BootLoader", `脚本加载失败: ${src}`, error);
                } else {
                    console.error(`[内核][BootLoader] 脚本加载失败: ${src}`, error);
                }
                reject(error);
            };
            
            document.head.appendChild(script);
        });
        
        scriptPromises.set(src, promise);
        return promise;
    }
    
    /**
     * 拓扑排序：计算模块加载顺序
     * @param {Object} dependencies - 依赖关系图
     * @returns {Array<string>} 排序后的模块列表
     */
    function topologicalSort(dependencies) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();
        const allModules = new Set(Object.keys(dependencies));
        
        // 添加所有依赖的模块到 allModules
        Object.values(dependencies).forEach(deps => {
            deps.forEach(dep => allModules.add(dep));
        });
        
        function visit(module) {
            if (visiting.has(module)) {
                throw new Error(`循环依赖 detected: ${module}`);
            }
            if (visited.has(module)) {
                return;
            }
            
            visiting.add(module);
            
            // 访问所有依赖
            const deps = dependencies[module] || [];
            deps.forEach(dep => {
                if (allModules.has(dep)) {
                    visit(dep);
                }
            });
            
            visiting.delete(module);
            visited.add(module);
            
            // 只添加在依赖图中的模块
            if (dependencies.hasOwnProperty(module)) {
                sorted.push(module);
            }
        }
        
        // 访问所有模块
        allModules.forEach(module => {
            if (!visited.has(module)) {
                visit(module);
            }
        });
        
        return sorted;
    }
    
    /**
     * 异步加载所有模块（按依赖顺序，支持并行加载）
     * @param {Object} dependencies - 依赖关系图
     * @returns {Promise<void>}
     */
    async function loadModules(dependencies) {
        const sortedModules = topologicalSort(dependencies);
        
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("BootLoader", `开始加载 ${sortedModules.length} 个模块`, {
                modules: sortedModules
            });
        } else {
            console.log(`[内核][BootLoader] 开始加载 ${sortedModules.length} 个模块`);
        }
        
        // 按层级分组模块，同一层级的模块可以并行加载
        const moduleLayers = [];
        const loadedModules = new Set();
        
        for (const module of sortedModules) {
            const deps = dependencies[module] || [];
            const layerIndex = deps.length === 0 ? 0 : 
                Math.max(...deps.map(dep => {
                    const depIndex = sortedModules.indexOf(dep);
                    return depIndex >= 0 ? moduleLayers.findIndex(layer => layer.includes(dep)) + 1 : 0;
                }), 0);
            
            if (!moduleLayers[layerIndex]) {
                moduleLayers[layerIndex] = [];
            }
            moduleLayers[layerIndex].push(module);
        }
        
        // 按层级加载模块
        for (let layerIndex = 0; layerIndex < moduleLayers.length; layerIndex++) {
            const layer = moduleLayers[layerIndex];
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug("BootLoader", `加载第 ${layerIndex + 1} 层模块 (${layer.length} 个)`, {
                    modules: layer
                });
            }
            
            // 并行加载当前层级的所有模块
            await Promise.all(layer.map(async (module) => {
                const deps = dependencies[module] || [];
                
                // 确保所有依赖已加载
                try {
                    await Promise.all(deps.map(dep => {
                        if (!loadedModules.has(dep)) {
                            return loadScript(dep);
                        }
                        return Promise.resolve();
                    }));
                } catch (error) {
                    const errorMsg = `依赖加载失败: ${module} 的依赖 ${deps.join(', ')} 加载失败: ${error.message}`;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("BootLoader", errorMsg, { module, deps, error: error.message });
                    }
                    throw new Error(errorMsg);
                }
                
                // 加载当前模块
                try {
                    await loadScript(module);
                    loadedModules.add(module);
                    
                    // 确保模块在 DependencyConfig 中注册（如果 DependencyConfig 已加载）
                if (typeof POOL !== 'undefined' && POOL.__GET__) {
                    try {
                        const Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
                        if (Dependency && Dependency.dependencyMap) {
                            // 如果条目不存在，创建它
                            if (!Dependency.dependencyMap.has(module)) {
                                Dependency.dependencyMap.set(module, DependencyConfig.generate(module));
                                Dependency.dependencyMap.get(module).linked = true;
                            }
                        }
                    } catch (e) {
                        // 忽略错误，继续执行
                    }
                }
                
                // 等待模块初始化完成（通过 DependencyConfig 信号）
                // 使用较短的超时时间，因为脚本已经加载完成
                if (typeof POOL !== 'undefined' && POOL.__GET__) {
                    try {
                        const Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
                        if (Dependency && typeof Dependency.waitLoaded === 'function') {
                            // 等待当前模块初始化
                            try {
                                await Dependency.waitLoaded(module, { interval: 10, timeout: 2000 });
                            } catch (e) {
                                // 如果等待超时，可能是模块没有发布信号，继续执行
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug("BootLoader", `模块 ${module} 可能未发布信号，继续执行`);
                                }
                            }
                        }
                    } catch (e) {
                        // 如果 POOL 还未初始化，跳过等待
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug("BootLoader", `跳过依赖等待: ${e.message}`);
                        }
                    }
                } else {
                    // 如果 POOL 未初始化，给模块一些时间初始化
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                } catch (error) {
                    const errorMsg = `模块加载失败: ${module} - ${error.message}`;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("BootLoader", errorMsg, { module, error: error.message });
                    }
                    throw new Error(errorMsg);
                }
            }));
        }
        
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("BootLoader", "所有模块加载完成");
        } else {
            console.log("[内核][BootLoader] 所有模块加载完成");
        }
    }
    
    /**
     * 执行内核自检
     * @param {Function} progressCallback 进度回调函数 (step, message, percent) => void
     * @returns {Promise<Object>} 自检结果 { passed: number, failed: number, warnings: number, criticalErrors: number }
     */
    async function performKernelSelfCheck(progressCallback = null) {
        const result = {
            passed: 0,
            failed: 0,
            warnings: 0,
            criticalErrors: 0,
            totalChecks: 0
        };
        
        const updateProgress = (step, message, percent) => {
            if (progressCallback) {
                progressCallback(step, message, percent);
            }
        };
        
        // 检查函数辅助
        const check = (name, condition, isCritical = false) => {
            result.totalChecks++;
            if (condition) {
                result.passed++;
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("BootLoader", `[自检] ${name}: 正常`);
                }
            } else {
                result.failed++;
                if (isCritical) {
                    result.criticalErrors++;
                }
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("BootLoader", `[自检] ${name}: 失败${isCritical ? ' (严重)' : ''}`);
                }
            }
        };
        
        const warn = (name, message) => {
            result.warnings++;
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("BootLoader", `[自检] ${name}: 警告 - ${message}`);
            }
        };
        
        const info = (name, message) => {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug("BootLoader", `[自检] ${name}: ${message}`);
            }
        };
        
        // ========== 1. 核心模块检查 ==========
        updateProgress(1, '检查核心模块...', 10);
        check('KernelLogger', typeof KernelLogger !== 'undefined', true);
        if (typeof KernelLogger !== 'undefined') {
            check('KernelLogger.info', typeof KernelLogger.info === 'function', true);
            check('KernelLogger.error', typeof KernelLogger.error === 'function', true);
            check('KernelLogger.warn', typeof KernelLogger.warn === 'function');
            check('KernelLogger.debug', typeof KernelLogger.debug === 'function');
            // 检查日志级别配置
            try {
                if (KernelLogger.getLogLevel) {
                    const logLevel = KernelLogger.getLogLevel();
                    info('KernelLogger 日志级别', logLevel || '默认');
                }
            } catch (e) {}
        }
        
        check('DependencyConfig', typeof DependencyConfig !== 'undefined', true);
        if (typeof DependencyConfig !== 'undefined') {
            check('DependencyConfig.generate', typeof DependencyConfig.generate === 'function');
            check('DependencyConfig.publishSignal', typeof DependencyConfig.publishSignal === 'function');
            // 检查依赖配置状态
            try {
                if (DependencyConfig.getConfig) {
                    const config = DependencyConfig.getConfig();
                    if (config && typeof config === 'object') {
                        const moduleCount = Object.keys(config).length;
                        info('依赖配置模块数', `${moduleCount} 个`);
                    }
                }
            } catch (e) {}
        }
        
        check('POOL', typeof POOL !== 'undefined', true);
        if (typeof POOL !== 'undefined') {
            check('POOL.__GET__', typeof POOL.__GET__ === 'function', true);
            check('POOL.__ADD__', typeof POOL.__ADD__ === 'function', true);
            check('POOL.__INIT__', typeof POOL.__INIT__ === 'function');
            check('POOL.__HAS__', typeof POOL.__HAS__ === 'function');
            
            // 检查 POOL 初始化状态
            try {
                const categoryExists = typeof POOL.__HAS__ === 'function' && POOL.__HAS__("KERNEL_GLOBAL_POOL");
                if (categoryExists) {
                    const dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
                    const isDependencyValid = dependency !== undefined && 
                                             dependency !== null && 
                                             (typeof dependency !== 'object' || dependency.isInit !== false);
                    check('POOL.KERNEL_GLOBAL_POOL.Dependency', isDependencyValid);
                    
                    const workspace = POOL.__GET__("KERNEL_GLOBAL_POOL", "WORK_SPACE");
                    if (workspace) {
                        info('POOL.WORK_SPACE', workspace);
                    }
                    
                    // 检查 POOL 中的其他关键模块
                    const modules = ['GUIManager', 'ProcessManager', 'ThemeManager', 'MemoryManager', 'NetworkManager', 'CryptDrive'];
                    let loadedModules = 0;
                    modules.forEach(moduleName => {
                        try {
                            const module = POOL.__GET__("KERNEL_GLOBAL_POOL", moduleName);
                            if (module !== undefined && module !== null) {
                                loadedModules++;
                            }
                        } catch (e) {}
                    });
                    info('POOL 已加载模块', `${loadedModules}/${modules.length} 个核心模块`);
                } else {
                    warn('POOL.KERNEL_GLOBAL_POOL', '类别未初始化');
                }
            } catch (e) {
                warn('POOL.KERNEL_GLOBAL_POOL', `访问失败: ${e.message}`);
            }
        }
        
        // ========== 2. 枚举管理器检查 ==========
        updateProgress(2, '检查枚举管理器...', 20);
        check('EnumManager', typeof EnumManager !== 'undefined');
        if (typeof EnumManager !== 'undefined') {
            check('EnumManager.createEnum', typeof EnumManager.createEnum === 'function');
            check('EnumManager.getEnum', typeof EnumManager.getEnum === 'function');
            check('EnumManager.hasEnum', typeof EnumManager.hasEnum === 'function');
        }
        
        // FileType
        let FileType = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                FileType = POOL.__GET__("TYPE_POOL", "FileType");
            } catch (e) {}
        }
        if (!FileType && typeof window !== 'undefined' && window.FileType) {
            FileType = window.FileType;
        }
        check('FileType', FileType !== null && FileType !== undefined);
        if (FileType) {
            check('FileType.GENRE', typeof FileType.GENRE !== 'undefined');
            check('FileType.WRITE_MODES', typeof FileType.WRITE_MODES !== 'undefined');
        }
        
        // LogLevel
        let LogLevel = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                LogLevel = POOL.__GET__("TYPE_POOL", "LogLevel");
            } catch (e) {}
        }
        if (!LogLevel && typeof window !== 'undefined' && window.LogLevel) {
            LogLevel = window.LogLevel;
        }
        check('LogLevel', LogLevel !== null && LogLevel !== undefined);
        
        // AddressType
        let AddressType = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                AddressType = POOL.__GET__("TYPE_POOL", "AddressType");
            } catch (e) {}
        }
        if (!AddressType && typeof window !== 'undefined' && window.AddressType) {
            AddressType = window.AddressType;
        }
        check('AddressType', AddressType !== null && AddressType !== undefined);
        
        // ========== 3. 文件系统检查 ==========
        updateProgress(3, '检查文件系统...', 35);
        check('Disk', typeof Disk !== 'undefined');
        if (typeof Disk !== 'undefined') {
            check('Disk.init', typeof Disk.init === 'function');
            check('Disk.format', typeof Disk.format === 'function');
            check('Disk.canUsed', Disk.canUsed === true);
            check('Disk.update', typeof Disk.update === 'function');
            
            // 检查磁盘分区（文件系统可能还未完全初始化，这是正常的）
            if (Disk.diskSeparateMap && Disk.diskSeparateMap.size > 0) {
                const partitions = Array.from(Disk.diskSeparateMap.keys());
                info('磁盘分区', `${partitions.length} 个分区: ${partitions.join(', ')}`);
                partitions.forEach(part => {
                    const size = Disk.diskSeparateSize ? Disk.diskSeparateSize.get(part) : undefined;
                    const free = Disk.diskFreeMap ? Disk.diskFreeMap.get(part) : undefined;
                    if (size !== undefined && free !== undefined) {
                        const used = size - free;
                        const percent = ((used / size) * 100).toFixed(1);
                        info(`分区 ${part}`, `已用 ${percent}%`);
                    }
                });
            } else {
                // 文件系统可能还未完全初始化，这是正常的，不标记为警告
                info('磁盘分区', '文件系统正在初始化中（这是正常的）');
            }
        }
        
        check('NodeTreeCollection', typeof NodeTreeCollection !== 'undefined');
        if (typeof NodeTreeCollection !== 'undefined') {
            check('NodeTreeCollection 构造函数', typeof NodeTreeCollection === 'function');
        }
        
        // FileFramework (实际类名是 FileFormwork，拼写错误但保持兼容)
        // 尝试从多个位置获取
        let FileFramework = null;
        // 1. 尝试从 POOL 获取
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                FileFramework = POOL.__GET__("KERNEL_GLOBAL_POOL", "FileFormwork");
            } catch (e) {
                // 忽略错误
            }
        }
        // 2. 尝试从全局对象获取（使用错误的拼写）
        if (!FileFramework && typeof window !== 'undefined' && window.FileFormwork) {
            FileFramework = window.FileFormwork;
        }
        if (!FileFramework && typeof globalThis !== 'undefined' && globalThis.FileFormwork) {
            FileFramework = globalThis.FileFormwork;
        }
        // 3. 尝试使用正确的拼写（如果将来修复了）
        if (!FileFramework && typeof window !== 'undefined' && window.FileFramework) {
            FileFramework = window.FileFramework;
        }
        if (!FileFramework && typeof globalThis !== 'undefined' && globalThis.FileFramework) {
            FileFramework = globalThis.FileFramework;
        }
        
        check('FileFramework', FileFramework !== null && FileFramework !== undefined, false);
        if (FileFramework) {
            check('FileFramework 构造函数', typeof FileFramework === 'function');
        } else {
            // FileFramework 可能还未加载，这是正常的
            info('FileFramework', '模块可能还未加载（非关键模块）');
        }
        
        check('LStorage', typeof LStorage !== 'undefined');
        if (typeof LStorage !== 'undefined') {
            check('LStorage.setSystemStorage', typeof LStorage.setSystemStorage === 'function');
            check('LStorage.getSystemStorage', typeof LStorage.getSystemStorage === 'function');
        }
        
        // ========== 4. 内存管理检查 ==========
        updateProgress(4, '检查内存管理...', 50);
        check('MemoryManager', typeof MemoryManager !== 'undefined', true);
        if (typeof MemoryManager !== 'undefined') {
            check('MemoryManager.allocateMemory', typeof MemoryManager.allocateMemory === 'function');
            check('MemoryManager.freeMemory', typeof MemoryManager.freeMemory === 'function');
            check('MemoryManager.registerProgramName', typeof MemoryManager.registerProgramName === 'function');
            check('MemoryManager.checkMemory', typeof MemoryManager.checkMemory === 'function');
            // 检查内存使用情况
            try {
                if (MemoryManager.checkMemory) {
                    const memInfo = MemoryManager.checkMemory();
                    if (memInfo && typeof memInfo === 'object') {
                        const total = memInfo.total || memInfo.totalMemory || 0;
                        const used = memInfo.used || memInfo.usedMemory || 0;
                        const free = memInfo.free || memInfo.freeMemory || 0;
                        if (total > 0) {
                            const usedPercent = ((used / total) * 100).toFixed(1);
                            info('内存使用情况', `已用 ${usedPercent}% (${used}/${total})`);
                        }
                    }
                }
            } catch (e) {}
        }
        
        check('Heap', typeof Heap !== 'undefined');
        if (typeof Heap !== 'undefined') {
            try {
                if (Heap.getSize) {
                    const heapSize = Heap.getSize();
                    info('堆内存大小', `${heapSize} 字节`);
                }
            } catch (e) {}
        }
        check('Shed', typeof Shed !== 'undefined');
        if (typeof Shed !== 'undefined') {
            try {
                if (Shed.getSize) {
                    const shedSize = Shed.getSize();
                    info('栈内存大小', `${shedSize} 字节`);
                }
            } catch (e) {}
        }
        
        check('KernelMemory', typeof KernelMemory !== 'undefined', true);
        if (typeof KernelMemory !== 'undefined') {
            check('KernelMemory.saveData', typeof KernelMemory.saveData === 'function');
            check('KernelMemory.loadData', typeof KernelMemory.loadData === 'function');
            check('KernelMemory.hasData', typeof KernelMemory.hasData === 'function');
        }
        
        // ========== 5. 进程管理检查 ==========
        updateProgress(5, '检查进程管理...', 65);
        check('ProcessManager', typeof ProcessManager !== 'undefined', true);
        if (typeof ProcessManager !== 'undefined') {
            check('ProcessManager.startProgram', typeof ProcessManager.startProgram === 'function', true);
            check('ProcessManager.killProgram', typeof ProcessManager.killProgram === 'function', true);
            check('ProcessManager.getProcessInfo', typeof ProcessManager.getProcessInfo === 'function');
            check('ProcessManager.listProcesses', typeof ProcessManager.listProcesses === 'function');
            
            // 检查 Exploit 程序是否已注册
            if (ProcessManager.PROCESS_TABLE) {
                const exploitRegistered = ProcessManager.PROCESS_TABLE.has(ProcessManager.EXPLOIT_PID || 10000);
                check('ProcessManager.Exploit程序', exploitRegistered, true);
                info('运行中的进程', `${ProcessManager.PROCESS_TABLE.size} 个`);
            }
        }
        
        check('ApplicationAssetManager', typeof ApplicationAssetManager !== 'undefined');
        if (typeof ApplicationAssetManager !== 'undefined') {
            check('ApplicationAssetManager.getProgramInfo', typeof ApplicationAssetManager.getProgramInfo === 'function');
            check('ApplicationAssetManager.listPrograms', typeof ApplicationAssetManager.listPrograms === 'function');
            try {
                const programs = ApplicationAssetManager.listPrograms();
                if (programs && programs.length > 0) {
                    info('已注册的程序', `${programs.length} 个`);
                }
            } catch (e) {
                warn('程序列表', `获取失败: ${e.message}`);
            }
        }
        
        // ========== 6. GUI 管理检查 ==========
        updateProgress(6, '检查GUI管理...', 80);
        check('GUIManager', typeof GUIManager !== 'undefined');
        if (typeof GUIManager !== 'undefined') {
            check('GUIManager.registerWindow', typeof GUIManager.registerWindow === 'function');
            check('GUIManager.unregisterWindow', typeof GUIManager.unregisterWindow === 'function');
            // 检查窗口状态
            try {
                if (GUIManager.getWindows) {
                    const windows = GUIManager.getWindows();
                    if (windows && windows.length > 0) {
                        info('已注册窗口', `${windows.length} 个`);
                    }
                } else if (GUIManager._windows) {
                    const windowCount = GUIManager._windows.size || 0;
                    if (windowCount > 0) {
                        info('已注册窗口', `${windowCount} 个`);
                    }
                }
            } catch (e) {}
        }
        
        check('ThemeManager', typeof ThemeManager !== 'undefined');
        if (typeof ThemeManager !== 'undefined') {
            check('ThemeManager.setTheme', typeof ThemeManager.setTheme === 'function');
            check('ThemeManager.getCurrentTheme', typeof ThemeManager.getCurrentTheme === 'function');
            check('ThemeManager.setDesktopBackground', typeof ThemeManager.setDesktopBackground === 'function');
            check('ThemeManager.setLocalImageAsBackground', typeof ThemeManager.setLocalImageAsBackground === 'function');
            check('ThemeManager.getCurrentDesktopBackground', typeof ThemeManager.getCurrentDesktopBackground === 'function');
            check('ThemeManager.getAllDesktopBackgrounds', typeof ThemeManager.getAllDesktopBackgrounds === 'function');
            try {
                const currentBg = ThemeManager.getCurrentDesktopBackground ? ThemeManager.getCurrentDesktopBackground() : null;
                if (currentBg) {
                    const bgInfo = ThemeManager.getDesktopBackground ? ThemeManager.getDesktopBackground(currentBg) : null;
                    const isGif = bgInfo && bgInfo.path && bgInfo.path.toLowerCase().endsWith('.gif');
                    if (isGif) {
                        info('桌面背景', `${currentBg} (GIF动图)`);
                    }
                }
            } catch (e) {
                warn('主题信息', `获取失败: ${e.message}`);
            }
        }
        
        check('DesktopManager', typeof DesktopManager !== 'undefined');
        if (typeof DesktopManager !== 'undefined') {
            check('DesktopManager.init', typeof DesktopManager.init === 'function');
            check('DesktopManager.addShortcut', typeof DesktopManager.addShortcut === 'function');
        }
        
        check('TaskbarManager', typeof TaskbarManager !== 'undefined');
        check('NotificationManager', typeof NotificationManager !== 'undefined');
        if (typeof NotificationManager !== 'undefined') {
            check('NotificationManager.init', typeof NotificationManager.init === 'function');
            check('NotificationManager.createNotification', typeof NotificationManager.createNotification === 'function');
            check('NotificationManager.removeNotification', typeof NotificationManager.removeNotification === 'function');
        }
        check('PermissionManager', typeof PermissionManager !== 'undefined');
        if (typeof PermissionManager !== 'undefined') {
            check('PermissionManager.init', typeof PermissionManager.init === 'function');
            check('PermissionManager.checkAndRequestPermission', typeof PermissionManager.checkAndRequestPermission === 'function');
            check('PermissionManager.registerProgramPermissions', typeof PermissionManager.registerProgramPermissions === 'function');
        }
        check('ContextMenuManager', typeof ContextMenuManager !== 'undefined');
        if (typeof ContextMenuManager !== 'undefined') {
            check('ContextMenuManager.registerContextMenu', typeof ContextMenuManager.registerContextMenu === 'function');
            check('ContextMenuManager.registerMenu', typeof ContextMenuManager.registerMenu === 'function');
        }
        check('EventManager', typeof EventManager !== 'undefined');
        if (typeof EventManager !== 'undefined') {
            check('EventManager.registerDrag', typeof EventManager.registerDrag === 'function');
            check('EventManager.registerResizer', typeof EventManager.registerResizer === 'function');
            check('EventManager.registerMenu', typeof EventManager.registerMenu === 'function');
        }
        
        // ========== 7. 其他模块检查 ==========
        updateProgress(7, '检查其他模块...', 90);
        
        // NetworkManager 是一个实例，不是类
        // 尝试等待 NetworkManager 加载完成（如果可能）
        let networkManager = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                const Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
                if (Dependency && typeof Dependency.waitLoaded === 'function') {
                    try {
                        // 尝试等待 NetworkManager 模块加载完成（最多等待 500ms）
                        await Dependency.waitLoaded("../kernel/drive/networkManager.js", { interval: 10, timeout: 500 });
                    } catch (e) {
                        // 如果等待超时，继续检查
                    }
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        // 尝试从 POOL 获取 NetworkManager 实例
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
            } catch (e) {
                // 忽略错误
            }
        }
        // 尝试从全局对象获取
        if (!networkManager && typeof window !== 'undefined' && window.NetworkManager) {
            networkManager = window.NetworkManager;
        }
        if (!networkManager && typeof globalThis !== 'undefined' && globalThis.NetworkManager) {
            networkManager = globalThis.NetworkManager;
        }
        
        // NetworkManager 不是关键模块，失败不影响系统启动
        check('NetworkManager', networkManager !== null && networkManager !== undefined, false);
        if (networkManager) {
            check('NetworkManager.isOnline', typeof networkManager.isOnline === 'function');
            check('NetworkManager.getConnectionInfo', typeof networkManager.getConnectionInfo === 'function');
            check('NetworkManager.getNetworkStateSnapshot', typeof networkManager.getNetworkStateSnapshot === 'function');
        } else {
            // 如果 NetworkManager 未加载，记录警告但不标记为失败
            warn('NetworkManager', '模块未加载或未初始化（非关键模块）');
        }
        
        check('SystemInformation', typeof SystemInformation !== 'undefined');
        if (typeof SystemInformation !== 'undefined') {
            check('SystemInformation.getSystemVersion', typeof SystemInformation.getSystemVersion === 'function');
            check('SystemInformation.getKernelVersion', typeof SystemInformation.getKernelVersion === 'function');
            // 获取系统版本信息
            try {
                if (SystemInformation.getSystemVersion) {
                    const sysVersion = SystemInformation.getSystemVersion();
                    if (sysVersion) {
                        info('系统版本', sysVersion);
                    }
                }
                if (SystemInformation.getKernelVersion) {
                    const kernelVersion = SystemInformation.getKernelVersion();
                    if (kernelVersion) {
                        info('内核版本', kernelVersion);
                    }
                }
            } catch (e) {}
        }
        
        check('DynamicManager', typeof DynamicManager !== 'undefined');
        
        check('MultithreadingDrive', typeof MultithreadingDrive !== 'undefined');
        if (typeof MultithreadingDrive !== 'undefined') {
            check('MultithreadingDrive.createThread', typeof MultithreadingDrive.createThread === 'function');
            check('MultithreadingDrive.executeTask', typeof MultithreadingDrive.executeTask === 'function');
            check('MultithreadingDrive.getPoolStatus', typeof MultithreadingDrive.getPoolStatus === 'function');
            check('MultithreadingDrive.cleanupProcessThreads', typeof MultithreadingDrive.cleanupProcessThreads === 'function');
        }
        
        check('DragDrive', typeof DragDrive !== 'undefined');
        if (typeof DragDrive !== 'undefined') {
            check('DragDrive.createDragSession', typeof DragDrive.createDragSession === 'function');
            check('DragDrive.enableDrag', typeof DragDrive.enableDrag === 'function');
            check('DragDrive.disableDrag', typeof DragDrive.disableDrag === 'function');
            check('DragDrive.registerDropZone', typeof DragDrive.registerDropZone === 'function');
            check('DragDrive.cleanupProcessDrags', typeof DragDrive.cleanupProcessDrags === 'function');
        }
        
        check('GeographyDrive', typeof GeographyDrive !== 'undefined');
        if (typeof GeographyDrive !== 'undefined') {
            check('GeographyDrive.getCurrentPosition', typeof GeographyDrive.getCurrentPosition === 'function');
            check('GeographyDrive.clearCache', typeof GeographyDrive.clearCache === 'function');
            check('GeographyDrive.isSupported', typeof GeographyDrive.isSupported === 'function');
            check('GeographyDrive.getCachedLocation', typeof GeographyDrive.getCachedLocation === 'function');
        }
        
        check('CryptDrive', typeof CryptDrive !== 'undefined');
        if (typeof CryptDrive !== 'undefined') {
            check('CryptDrive.generateKeyPair', typeof CryptDrive.generateKeyPair === 'function');
            check('CryptDrive.encrypt', typeof CryptDrive.encrypt === 'function');
            check('CryptDrive.decrypt', typeof CryptDrive.decrypt === 'function');
            check('CryptDrive.md5', typeof CryptDrive.md5 === 'function');
            check('CryptDrive.randomInt', typeof CryptDrive.randomInt === 'function');
            check('CryptDrive.randomBoolean', typeof CryptDrive.randomBoolean === 'function');
            // 检查密钥管理状态
            try {
                if (CryptDrive.listKeys) {
                    const keys = await CryptDrive.listKeys();
                    if (keys && Array.isArray(keys)) {
                        info('加密密钥数量', `${keys.length} 个`);
                        if (keys.length > 0) {
                            const defaultKey = keys.find(k => k.isDefault);
                            if (defaultKey) {
                                info('默认密钥', defaultKey.keyId);
                            }
                        }
                    }
                }
            } catch (e) {}
        }
        
        // ========== 8. 浏览器环境检查 ==========
        updateProgress(8, '检查浏览器环境...', 95);
        check('localStorage', typeof Storage !== 'undefined' && typeof localStorage !== 'undefined');
        if (typeof localStorage !== 'undefined') {
            try {
                const testKey = '__zeros_test__';
                localStorage.setItem(testKey, 'test');
                const canWrite = localStorage.getItem(testKey) === 'test';
                localStorage.removeItem(testKey);
                if (canWrite) {
                    info('localStorage', '读写功能正常');
                } else {
                    warn('localStorage', '写入测试失败');
                }
            } catch (e) {
                warn('localStorage', `测试失败: ${e.message}`);
            }
        }
        check('document.body', typeof document !== 'undefined' && document.body !== null);
        if (typeof document !== 'undefined' && document.body) {
            try {
                const bodyChildren = document.body.children ? document.body.children.length : 0;
                info('DOM 结构', `body 包含 ${bodyChildren} 个子元素`);
            } catch (e) {}
        }
        check('window 对象', typeof window !== 'undefined');
        if (typeof window !== 'undefined') {
            try {
                const userAgent = window.navigator ? window.navigator.userAgent : '未知';
                const platform = window.navigator ? window.navigator.platform : '未知';
                info('浏览器信息', `${platform} - ${userAgent.substring(0, 50)}...`);
            } catch (e) {}
        }
        
        // 输出自检摘要
        updateProgress(9, '完成自检...', 100);
        if (typeof KernelLogger !== 'undefined') {
            const successRate = result.totalChecks > 0 ? ((result.passed / result.totalChecks) * 100).toFixed(1) : 0;
            KernelLogger.info("BootLoader", `内核自检完成: ${result.passed}/${result.totalChecks} 通过 (${successRate}%), ${result.failed} 失败, ${result.warnings} 警告, ${result.criticalErrors} 严重错误`);
        }
        
        return result;
    }
    
    /**
     * 异步等待核心模块加载完成
     * 核心模块（KernelLogger, DependencyConfig, POOL）已在 HTML 中加载
     * @returns {Promise<void>}
     */
    async function waitForCoreModules() {
        KernelLogger.info("BootLoader", "等待核心模块初始化");
        
        // 检查核心模块是否已加载
        if (typeof KernelLogger === 'undefined') {
            throw new Error("KernelLogger 未加载，请确保在 HTML 中加载 kernelLogger.js");
        }
        
        if (typeof DependencyConfig === 'undefined') {
            throw new Error("DependencyConfig 未加载，请确保在 HTML 中加载 dependencyConfig.js");
        }
        
        if (typeof POOL === 'undefined') {
            throw new Error("POOL 未加载，请确保在 HTML 中加载 pool.js");
        }
        
        // 创建 DependencyConfig 实例以等待模块初始化完成
        const Dependency = new DependencyConfig();
        
        // 由于核心模块在 HTML 中已加载，它们可能已经发布了信号
        // 我们需要先手动标记它们为已加载（如果它们确实已加载）
        // 然后等待信号（如果还没有收到）
        
        // 手动检查并标记已加载的模块
        const markAsLoaded = (moduleName) => {
            if (!Dependency.dependencyMap.has(moduleName)) {
                Dependency.dependencyMap.set(moduleName, DependencyConfig.generate(moduleName));
                Dependency.dependencyMap.get(moduleName).linked = true;
            }
            const entry = Dependency.dependencyMap.get(moduleName);
            // 如果模块确实存在（通过检查全局对象），标记为已加载
            if (moduleName === "../kernel/signal/dependencyConfig.js" && typeof DependencyConfig !== 'undefined') {
                entry.inited = true;
                entry.loaded = true;
                return true;
            }
            if (moduleName === "../kernel/signal/pool.js" && typeof POOL !== 'undefined') {
                entry.inited = true;
                entry.loaded = true;
                return true;
            }
            return entry.loaded;
        };
        
        // 检查并标记已加载的模块
        const dependencyConfigLoaded = markAsLoaded("../kernel/signal/dependencyConfig.js");
        const poolLoaded = markAsLoaded("../kernel/signal/pool.js");
        
        // 如果模块已经加载，直接返回
        if (dependencyConfigLoaded && poolLoaded) {
            KernelLogger.info("BootLoader", "核心模块已初始化完成");
            return;
        }
        
        // 等待未加载的模块初始化完成（使用较短的超时时间，因为它们应该已经加载）
        const waitPromises = [];
        
        if (!dependencyConfigLoaded) {
            waitPromises.push(
                Dependency.waitLoaded("../kernel/signal/dependencyConfig.js", { interval: 10, timeout: 500 })
                    .catch(() => {
                        // 如果超时，再次检查是否已加载
                        if (markAsLoaded("../kernel/signal/dependencyConfig.js")) {
                            KernelLogger.debug("BootLoader", "dependencyConfig.js 已加载");
                        } else {
                            KernelLogger.warn("BootLoader", "dependencyConfig.js 初始化信号未收到，继续执行");
                        }
                    })
            );
        }
        
        if (!poolLoaded) {
            waitPromises.push(
                Dependency.waitLoaded("../kernel/signal/pool.js", { interval: 10, timeout: 500 })
                    .catch(() => {
                        // 如果超时，再次检查是否已加载
                        if (markAsLoaded("../kernel/signal/pool.js")) {
                            KernelLogger.debug("BootLoader", "pool.js 已加载");
                        } else {
                            KernelLogger.warn("BootLoader", "pool.js 初始化信号未收到，继续执行");
                        }
                    })
            );
        }
        
        // 等待所有检查完成
        if (waitPromises.length > 0) {
            await Promise.all(waitPromises);
        }
        
        KernelLogger.info("BootLoader", "核心模块初始化完成");
    }
    
    /**
     * 初始化 BootLoader
     */
    async function start_init() {
        try {
            // 检查 KernelLogger 是否已加载（应该在 HTML 中直接加载）
            if (typeof KernelLogger === 'undefined') {
                console.error("[内核][BootLoader] KernelLogger 未加载，请确保在 HTML 中加载 kernelLogger.js");
                throw new Error("KernelLogger is required but not loaded");
            }
            
            KernelLogger.info("BootLoader", "启动内核引导程序");
            
            // 异步等待核心模块初始化完成
            // 核心模块（KernelLogger, DependencyConfig, POOL）已在 HTML 中加载
            await waitForCoreModules();
            
            // 创建依赖管理器实例（DependencyConfig 类已在 HTML 中加载）
            const Dependency = new DependencyConfig();
            
            // 初始化对象池（如果还未初始化）
            // 使用 __HAS__ 方法检查类别是否存在，更可靠
            if (!POOL.__HAS__ || !POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            // 确保 Dependency 和 WORK_SPACE 已添加（如果还未添加）
            if (!POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency")) {
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "Dependency", Dependency);
            }
            if (!POOL.__GET__("KERNEL_GLOBAL_POOL", "WORK_SPACE")) {
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "WORK_SPACE", "C:");
            }
            
            // 将所有模块添加到依赖管理器（用于兼容性）
            Object.keys(MODULE_DEPENDENCIES).forEach(module => {
                Dependency.addDependency(module);
            });
            
            // 异步加载所有其他模块
            await loadModules(MODULE_DEPENDENCIES);
            
            // 确保KernelMemory已注册到POOL
            if (typeof KernelMemory !== 'undefined') {
                try {
                    if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                        POOL.__INIT__("KERNEL_GLOBAL_POOL");
                    }
                    if (!POOL.__GET__("KERNEL_GLOBAL_POOL", "KernelMemory")) {
                        POOL.__ADD__("KERNEL_GLOBAL_POOL", "KernelMemory", KernelMemory);
                    }
                    KernelLogger.info("BootLoader", "KernelMemory 已注册");
                } catch (e) {
                    KernelLogger.warn("BootLoader", `注册KernelMemory失败: ${e.message}`);
                }
            }
            
            // 确保事件管理器已初始化（必须在进程管理器之前）
            if (typeof EventManager !== 'undefined') {
                EventManager.init();
                KernelLogger.info("BootLoader", "事件管理器初始化完成");
            } else {
                KernelLogger.warn("BootLoader", "EventManager 未加载，事件管理功能将不可用");
            }
            
            // 初始化进程管理器
            if (typeof ProcessManager !== 'undefined') {
                await ProcessManager.init();
                KernelLogger.info("BootLoader", "进程管理器初始化完成");
                
                // 验证Exploit程序已注册
                const exploitPid = ProcessManager.EXPLOIT_PID || 10000;
                
                // 清空缓存以确保获取最新数据
                ProcessManager._processTableCache = null;
                
                if (ProcessManager.PROCESS_TABLE.has(exploitPid)) {
                    const exploitInfo = ProcessManager.PROCESS_TABLE.get(exploitPid);
                    if (exploitInfo && exploitInfo.isExploit && exploitInfo.status === 'running') {
                        KernelLogger.info("BootLoader", `Exploit程序已注册 (PID: ${exploitPid}, 状态: ${exploitInfo.status})`);
                    } else {
                        KernelLogger.warn("BootLoader", `Exploit程序信息不完整 (PID: ${exploitPid})，尝试重新注册`);
                        ProcessManager._registerExploitProgram();
                    }
                } else {
                    KernelLogger.warn("BootLoader", `Exploit程序未注册 (PID: ${exploitPid})，尝试重新注册`);
                    ProcessManager._registerExploitProgram();
                    
                    // 再次验证
                    ProcessManager._processTableCache = null;
                    if (ProcessManager.PROCESS_TABLE.has(exploitPid)) {
                        KernelLogger.info("BootLoader", `Exploit程序重新注册成功 (PID: ${exploitPid})`);
                    } else {
                        KernelLogger.error("BootLoader", `Exploit程序重新注册失败 (PID: ${exploitPid})`);
                    }
                }
                
                // 启动需要自动启动的程序（可选，如果没有程序需要自动启动则跳过）
                try {
                    await ProcessManager.startAutoStartPrograms();
                    KernelLogger.info("BootLoader", "自动启动程序检查完成");
                } catch (e) {
                    KernelLogger.warn("BootLoader", `自动启动程序检查失败: ${e.message}`);
                    // 不阻塞内核启动
                }
            } else {
                KernelLogger.error("BootLoader", "ProcessManager 未加载");
            }
            
            // 清理过期缓存（在文件系统初始化后执行）
            try {
                await cleanupExpiredCache();
            } catch (e) {
                KernelLogger.warn("BootLoader", `清理过期缓存失败: ${e.message}`);
                // 不阻塞系统启动
            }
            
            // 验证文件系统初始化
            if (typeof Disk !== 'undefined') {
                // 等待文件系统初始化完成（最多等待2秒）
                let fsInitComplete = false;
                const maxWaitTime = 2000;
                const startTime = Date.now();
                let checkCount = 0;
                const maxChecks = 40;  // 最多检查40次（2秒/50ms）
                
                while (!fsInitComplete && (Date.now() - startTime) < maxWaitTime && checkCount < maxChecks) {
                    try {
                        if (Disk.canUsed) {
                            fsInitComplete = true;
                            break;
                        }
                    } catch (e) {
                        // 如果访问Disk.canUsed失败，停止检查
                        KernelLogger.warn("BootLoader", `检查文件系统状态失败: ${e.message}`);
                        break;
                    }
                    checkCount++;
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
                if (fsInitComplete) {
                    KernelLogger.info("BootLoader", "文件系统初始化完成");
                } else {
                    KernelLogger.warn("BootLoader", "文件系统初始化超时，但内核继续启动");
                }
            }
            
            // 验证内核核心模块
            const kernelModules = {
                'KernelLogger': typeof KernelLogger !== 'undefined',
                'DependencyConfig': typeof DependencyConfig !== 'undefined',
                'POOL': typeof POOL !== 'undefined',
                'MemoryManager': typeof MemoryManager !== 'undefined',
                'KernelMemory': typeof KernelMemory !== 'undefined',
                'ProcessManager': typeof ProcessManager !== 'undefined',
                'Disk': typeof Disk !== 'undefined'
            };
            
            const missingModules = Object.entries(kernelModules)
                .filter(([name, loaded]) => !loaded)
                .map(([name]) => name);
            
            if (missingModules.length > 0) {
                KernelLogger.warn("BootLoader", `以下内核模块未加载: ${missingModules.join(', ')}`);
            } else {
                KernelLogger.info("BootLoader", "所有核心内核模块已加载");
            }
            
            // 生成内核初始化报告
            const initReport = {
                timestamp: Date.now(),
                modules: kernelModules,
                missingModules: missingModules,
                exploitRegistered: (typeof ProcessManager !== 'undefined' && ProcessManager.PROCESS_TABLE) 
                    ? ProcessManager.PROCESS_TABLE.has(ProcessManager.EXPLOIT_PID || 10000) 
                    : false,
                filesystemReady: typeof Disk !== 'undefined' ? Disk.canUsed : false,
                kernelMemoryReady: (typeof KernelMemory !== 'undefined' && KernelMemory._memoryCache !== null)
                    ? true
                    : false
            };
            
            if (missingModules.length === 0 && initReport.exploitRegistered && initReport.kernelMemoryReady) {
                KernelLogger.info("BootLoader", "内核引导完成 - 所有核心模块已就绪", initReport);
            } else {
                KernelLogger.warn("BootLoader", "内核引导完成 - 部分模块未就绪", initReport);
            }
            
            // 进行内核自检（1-2秒）
            if (typeof document !== 'undefined') {
                const loadingEl = document.getElementById('kernel-loading');
                const loadingTextEl = loadingEl ? loadingEl.querySelector('.loading-text') : null;
                const progressFillEl = loadingEl ? loadingEl.querySelector('.loading-progress-fill') : null;
                
                // 更新进度条和文本的函数
                const updateProgress = (percent, text) => {
                    if (progressFillEl) {
                        progressFillEl.style.width = percent + '%';
                    }
                    if (loadingTextEl) {
                        loadingTextEl.textContent = text;
                    }
                };
                
                // 初始进度
                updateProgress(30, '正在加载内核模块...');
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // 执行内核自检（带进度回调）
                const selfCheckProgressCallback = (step, message, percent) => {
                    // 将自检进度映射到 60-90% 的范围内
                    const mappedPercent = 60 + (percent * 0.3);
                    updateProgress(mappedPercent, message);
                };
                
                const selfCheckResult = await performKernelSelfCheck(selfCheckProgressCallback);
                
                // 根据自检结果更新文本
                const successRate = selfCheckResult.totalChecks > 0 ? 
                    ((selfCheckResult.passed / selfCheckResult.totalChecks) * 100).toFixed(1) : 0;
                
                if (selfCheckResult.criticalErrors > 0) {
                    updateProgress(92, `内核自检完成（${selfCheckResult.passed}/${selfCheckResult.totalChecks} 通过，${selfCheckResult.criticalErrors} 个严重错误）...`);
                } else if (selfCheckResult.failed > 0) {
                    updateProgress(92, `内核自检完成（${selfCheckResult.passed}/${selfCheckResult.totalChecks} 通过，${selfCheckResult.failed} 个失败）...`);
                } else if (selfCheckResult.warnings > 0) {
                    updateProgress(92, `内核自检完成（${selfCheckResult.passed}/${selfCheckResult.totalChecks} 通过，${selfCheckResult.warnings} 个警告）...`);
                } else {
                    updateProgress(92, `内核自检完成（${selfCheckResult.passed}/${selfCheckResult.totalChecks} 通过，${successRate}%）...`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // 完成加载
                updateProgress(100, '正在启动系统...');
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 淡出动画
                if (loadingEl) {
                    loadingEl.style.opacity = '0';
                    loadingEl.style.transition = 'opacity 0.8s ease-out';
                }
                
                // 等待淡出完成后再隐藏
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // 隐藏加载界面，显示内核内容容器
                if (loadingEl) {
                    loadingEl.style.display = 'none';
                }
                const contentEl = document.getElementById('kernel-content');
                if (contentEl) {
                    contentEl.style.display = 'flex';
                    contentEl.style.opacity = '0';
                    contentEl.style.transition = 'opacity 0.5s ease-in';
                    // 触发重排以应用transition
                    void contentEl.offsetWidth;
                    contentEl.style.opacity = '1';
                }
                
                // 初始化任务栏（如果 TaskbarManager 已加载）
                if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.init === 'function') {
                    try {
                        // 延迟初始化，确保所有程序都已启动
                        setTimeout(() => {
                            TaskbarManager.init();
                        }, 500);
                    } catch (e) {
                        KernelLogger.warn("BootLoader", `任务栏初始化失败: ${e.message}`);
                    }
                }
                
                // 初始化通知管理器（如果 NotificationManager 已加载）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.init === 'function') {
                    try {
                        // 延迟初始化，确保任务栏已初始化（通知管理器依赖任务栏位置）
                        setTimeout(() => {
                            NotificationManager.init().then(() => {
                                KernelLogger.info("BootLoader", "通知管理器初始化完成");
                            }).catch(e => {
                                KernelLogger.warn("BootLoader", `通知管理器初始化失败: ${e.message}`);
                            });
                        }, 1000);
                    } catch (e) {
                        KernelLogger.warn("BootLoader", `通知管理器初始化失败: ${e.message}`);
                    }
                }
            }
            
            // 触发引导完成事件
            if (typeof document !== 'undefined' && document.body) {
                document.body.dispatchEvent(new CustomEvent('kernelBootComplete', {
                    detail: initReport
                }));
            }
            
        } catch (error) {
            const errorMsg = `内核引导失败: ${error.message}`;
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("BootLoader", errorMsg, error);
            } else {
                console.error(`[内核][BootLoader] ${errorMsg}`, error);
            }
            throw error;
        }
    }
    
    // 自动启动（如果 DOM 已就绪）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start_init);
    } else {
        // DOM 已就绪，立即启动
        start_init().catch(error => {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("BootLoader", "启动失败", error);
            } else {
                console.error("[内核][BootLoader] 启动失败", error);
            }
        });
    }
    
    // 导出启动函数和 API（供外部调用）
    if (typeof window !== 'undefined') {
        // 不导出到全局作用域，交由POOL管理
        // 通过POOL注册（如果POOL已加载）
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                // 确保 KERNEL_GLOBAL_POOL 类别存在
                if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                    POOL.__INIT__("KERNEL_GLOBAL_POOL");
                }
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "startKernel", start_init);
            } catch (e) {
                // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
                window.startKernel = start_init;
            }
        } else {
            // POOL不可用，降级到全局对象
            window.startKernel = start_init;
        }
        // 暴露 API
        window.BootLoader = {
            // 异步加载脚本
            loadScript: loadScript,
            // 异步等待核心模块
            waitForCoreModules: waitForCoreModules,
            // 启动内核
            start: start_init,
        };
    }
})();
