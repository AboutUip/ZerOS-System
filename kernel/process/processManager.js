// 进程管理器：负责程序的执行与卸载
// 管理进程的启动、PID分配、内存分配和程序生命周期

KernelLogger.info("ProcessManager", "模块初始化");

class ProcessManager {
    // Exploit程序PID（固定为10000）
    static EXPLOIT_PID = 10000;
    
    // 日志级别
    static logLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.DEBUG) ? LogLevel.LEVEL.DEBUG : 3;

    static setLogLevel(lvl) {
        this.logLevel = lvl;
    }

    static _log(level, ...args) {
        // 总是输出到console.log（用于调试）
        const message = args.length > 0 && typeof args[0] === 'string' ? args[0] : '';
        const meta = args.length > 1 ? args.slice(1) : undefined;
        console.log(`[ProcessManager._log] level=${level}, logLevel=${ProcessManager.logLevel}, message=${message}`, meta);
        
        if (ProcessManager.logLevel >= level) {
            const debugLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL && LogLevel.LEVEL.DEBUG) ? LogLevel.LEVEL.DEBUG : 3;
            const infoLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL && LogLevel.LEVEL.INFO) ? LogLevel.LEVEL.INFO : 2;
            const errorLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL && LogLevel.LEVEL.ERROR) ? LogLevel.LEVEL.ERROR : 1;
            const debugName = (typeof LogLevel !== 'undefined' && LogLevel.NAME && LogLevel.NAME.DEBUG) ? LogLevel.NAME.DEBUG : "DEBUG";
            const infoName = (typeof LogLevel !== 'undefined' && LogLevel.NAME && LogLevel.NAME.INFO) ? LogLevel.NAME.INFO : "INFO";
            const errorName = (typeof LogLevel !== 'undefined' && LogLevel.NAME && LogLevel.NAME.ERROR) ? LogLevel.NAME.ERROR : "ERROR";
            const lvlName = level >= debugLevel ? debugName : level >= infoLevel ? infoName : errorName;
            const subsystem = "ProcessManager";
            KernelLogger.log(lvlName, subsystem, message, meta);
        }
    }

    // 进程表 Map<pid, ProcessInfo>
    // 注意：实际数据存储在Exploit内存中，这里只是访问接口
    // ProcessInfo: {
    //     pid: number,
    //     programName: string,
    //     programNameUpper: string,  // 大写全拼，用于调用 __init__ 和 __exit__
    //     scriptPath: string,
    //     status: 'loading' | 'running' | 'exited',
    //     startTime: number,
    //     exitTime: number | null,
    //     memoryRefs: Map<string, any>,  // 内存引用 Map<refId, memoryObject>
    //     domElements: Set<Element>,  // 该程序创建的 DOM 元素
    //     mutationObserver: MutationObserver | null,  // DOM 观察器
    //     isMinimized: boolean,  // 是否最小化
    //     windowState: {  // 窗口状态（用于恢复）
    //         savedLeft: number,
    //         savedTop: number,
    //         savedWidth: number,
    //         savedHeight: number
    //     },
    //     requestedModules: Set<string>  // 该进程请求的动态模块集合
    // }
    
    /**
     * 获取进程表（从Exploit内存）
     * @returns {Map<number, Object>} 进程表
     */
    static _getProcessTable() {
        if (typeof KernelMemory === 'undefined') {
            // 降级：使用临时Map（仅在KernelMemory不可用时）
            if (!ProcessManager._fallbackProcessTable) {
                ProcessManager._fallbackProcessTable = new Map();
            }
            return ProcessManager._fallbackProcessTable;
        }
        
        const data = KernelMemory.loadData('PROCESS_TABLE');
        if (data) {
            // 将数组转换回Map
            const map = new Map();
            if (Array.isArray(data)) {
                for (const [pid, info] of data) {
                    // 反序列化：恢复Map和Set对象
                    const deserializedInfo = { ...info };
                    
                    // 恢复 memoryRefs (Map)
                    if (Array.isArray(info.memoryRefs)) {
                        deserializedInfo.memoryRefs = new Map(info.memoryRefs);
                    } else if (!(info.memoryRefs instanceof Map)) {
                        deserializedInfo.memoryRefs = new Map();
                    }
                    
                    // 恢复 domElements (Set) - 但DOM元素无法恢复，所以创建新的空Set
                    deserializedInfo.domElements = new Set();
                    
                    // mutationObserver 无法恢复，设为null
                    deserializedInfo.mutationObserver = null;
                    
                    // 恢复 requestedModules (Set)
                    if (Array.isArray(info.requestedModules)) {
                        deserializedInfo.requestedModules = new Set(info.requestedModules);
                    } else if (!(info.requestedModules instanceof Set)) {
                        deserializedInfo.requestedModules = new Set();
                    }
                    
                    map.set(pid, deserializedInfo);
                }
            } else if (typeof data === 'object') {
                // 兼容对象格式
                for (const [pid, info] of Object.entries(data)) {
                    const deserializedInfo = { ...info };
                    
                    // 恢复 memoryRefs (Map)
                    if (Array.isArray(info.memoryRefs)) {
                        deserializedInfo.memoryRefs = new Map(info.memoryRefs);
                    } else if (!(info.memoryRefs instanceof Map)) {
                        deserializedInfo.memoryRefs = new Map();
                    }
                    
                    // 恢复 domElements (Set)
                    deserializedInfo.domElements = new Set();
                    deserializedInfo.mutationObserver = null;
                    
                    // 恢复 requestedModules (Set)
                    if (Array.isArray(info.requestedModules)) {
                        deserializedInfo.requestedModules = new Set(info.requestedModules);
                    } else if (!(info.requestedModules instanceof Set)) {
                        deserializedInfo.requestedModules = new Set();
                    }
                    
                    map.set(parseInt(pid), deserializedInfo);
                }
            }
            return map;
        }
        
        // 如果不存在，创建新的Map并保存
        const newMap = new Map();
        ProcessManager._saveProcessTable(newMap);
        return newMap;
    }
    
    /**
     * 保存进程表（到Exploit内存）
     * @param {Map<number, Object>} table 进程表
     */
    static _saveProcessTable(table) {
        if (typeof KernelMemory === 'undefined') {
            return;
        }
        
        // 将Map转换为数组以便序列化
        // 注意：需要序列化Map和Set对象
        const array = Array.from(table.entries()).map(([pid, info]) => {
            // 深拷贝，将Map和Set转换为普通对象
            const serializedInfo = { ...info };
            
            // 序列化 memoryRefs (Map)
            if (info.memoryRefs instanceof Map) {
                serializedInfo.memoryRefs = Array.from(info.memoryRefs.entries());
            }
            
            // 序列化 domElements (Set) - 但DOM元素无法序列化，所以只保存数量
            if (info.domElements instanceof Set) {
                serializedInfo.domElementsCount = info.domElements.size;
                serializedInfo.domElements = []; // 清空，因为DOM元素无法序列化
            }
            
            // mutationObserver 无法序列化，清空
            if (info.mutationObserver) {
                serializedInfo.mutationObserver = null;
            }
            
            // 序列化 requestedModules (Set)
            if (info.requestedModules instanceof Set) {
                serializedInfo.requestedModules = Array.from(info.requestedModules);
            } else if (!Array.isArray(info.requestedModules)) {
                serializedInfo.requestedModules = [];
            }
            
            return [pid, serializedInfo];
        });
        
        KernelMemory.saveData('PROCESS_TABLE', array);
        
        // 保存后更新缓存
        ProcessManager._processTableCache = table;
    }
    
    /**
     * 获取进程表（兼容旧代码）
     * @returns {Map<number, Object>} 进程表
     */
    static get PROCESS_TABLE() {
        // 如果已经有缓存的Map，直接返回
        if (ProcessManager._processTableCache) {
            return ProcessManager._processTableCache;
        }
        
        // 从内存加载
        const table = ProcessManager._getProcessTable();
        ProcessManager._processTableCache = table;
        return table;
    }
    
    // 进程表缓存（避免频繁从内存读取）
    static _processTableCache = null;
    
    /**
     * 获取下一个PID（从Exploit内存）
     * @returns {number} 下一个PID
     */
    static get NEXT_PID() {
        if (typeof KernelMemory === 'undefined') {
            // 降级：使用静态变量
            if (ProcessManager._fallbackNextPid === undefined) {
                // 默认从 10001 开始（Exploit 使用 10000）
                ProcessManager._fallbackNextPid = ProcessManager.EXPLOIT_PID + 1;
            }
            return ProcessManager._fallbackNextPid;
        }
        
        const pid = KernelMemory.loadData('NEXT_PID');
        // 如果加载的 PID 小于等于 Exploit PID，则从 10001 开始
        if (pid !== null && pid > ProcessManager.EXPLOIT_PID) {
            return pid;
        }
        // 默认从 10001 开始（Exploit 使用 10000）
        return ProcessManager.EXPLOIT_PID + 1;
    }
    
    /**
     * 设置下一个PID（保存到Exploit内存）
     * @param {number} pid 下一个PID
     */
    static set NEXT_PID(pid) {
        if (typeof KernelMemory === 'undefined') {
            // 降级：使用静态变量
            ProcessManager._fallbackNextPid = pid;
            return;
        }
        
        KernelMemory.saveData('NEXT_PID', pid);
    }
    
    // 降级方案：临时存储（仅在KernelMemory不可用时使用）
    static _fallbackProcessTable = null;
    static _fallbackNextPid = undefined;
    
    // DOM 观察器（全局，观察 document.body 的变化）
    static _globalDOMObserver = null;
    
    // DOM 元素到 PID 的映射（用于快速查找元素属于哪个进程）
    static _elementToPidMap = new WeakMap();

    // 应用程序资源映射（从 applicationAssets.js 加载）
    static APPLICATION_ASSETS = null;

    /**
     * 初始化进程管理器
     * 加载 applicationAssets.js 和 ApplicationAssetManager
     */
    static async init() {
        ProcessManager._log(2, "初始化进程管理器");
        
        // 确保KernelMemory可用
        if (typeof KernelMemory === 'undefined') {
            ProcessManager._log(1, "KernelMemory 不可用，将使用降级方案");
        } else {
            // 初始化进程表缓存
            ProcessManager._processTableCache = null;
            ProcessManager._log(2, "进程表已从Exploit内存加载");
        }
        
        // 加载应用程序资源管理器
        try {
            // 如果 ApplicationAssetManager 还未加载，尝试动态加载
            if (typeof ApplicationAssetManager === 'undefined') {
                const managerPath = "../kernel/process/applicationAssetManager.js";
                await ProcessManager._loadScript(managerPath);
            }
            
            // 初始化 ApplicationAssetManager
            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.init === 'function') {
                await ApplicationAssetManager.init();
                ProcessManager._log(2, "应用程序资源管理器初始化成功");
            } else {
                ProcessManager._log(1, "ApplicationAssetManager 不可用，使用降级方案");
                
                // 降级方案：直接加载 applicationAssets.js
                if (typeof APPLICATION_ASSETS === 'undefined') {
                    const assetsPath = "../kernel/process/applicationAssets.js";
                    await ProcessManager._loadScript(assetsPath);
                }
                
                // 从POOL获取APPLICATION_ASSETS，如果不存在则从全局对象获取
                let applicationAssets = null;
                if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    try {
                        applicationAssets = POOL.__GET__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS");
                    } catch (e) {
                        // 忽略错误
                    }
                }
                
                if (!applicationAssets && typeof APPLICATION_ASSETS !== 'undefined') {
                    applicationAssets = APPLICATION_ASSETS;
                }
                
                if (applicationAssets) {
                    // 将APPLICATION_ASSETS存储到POOL
                    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                        try {
                            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                                POOL.__INIT__("KERNEL_GLOBAL_POOL");
                            }
                            POOL.__ADD__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS", applicationAssets);
                        } catch (e) {
                            ProcessManager._log(1, `存储APPLICATION_ASSETS到POOL失败: ${e.message}`);
                        }
                    }
                    ProcessManager._log(2, "应用程序资源映射加载成功", { 
                        programs: Object.keys(applicationAssets || {}) 
                    });
                } else {
                    applicationAssets = {};
                    // 即使为空也存储到POOL
                    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                        try {
                            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                                POOL.__INIT__("KERNEL_GLOBAL_POOL");
                            }
                            POOL.__ADD__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS", applicationAssets);
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                    ProcessManager._log(1, "应用程序资源映射未找到，使用空映射");
                }
            }
        } catch (e) {
            ProcessManager._log(1, `加载应用程序资源管理器失败: ${e.message}`);
        }
        
        // 注册Exploit程序（进程管理器自身）
        ProcessManager._registerExploitProgram();
        
        // 验证Exploit程序是否成功注册
        const exploitPid = ProcessManager.EXPLOIT_PID;
        const exploitInfo = ProcessManager.PROCESS_TABLE.get(exploitPid);
        if (exploitInfo) {
            ProcessManager._log(2, `Exploit程序验证成功 (PID: ${exploitPid}, 状态: ${exploitInfo.status})`);
        } else {
            ProcessManager._log(1, `Exploit程序注册失败 (PID: ${exploitPid})，尝试重新注册`);
            // 强制重新注册
            ProcessManager._processTableCache = null;
            ProcessManager._registerExploitProgram();
            
            // 再次验证
            const retryInfo = ProcessManager.PROCESS_TABLE.get(exploitPid);
            if (retryInfo) {
                ProcessManager._log(2, `Exploit程序重新注册成功 (PID: ${exploitPid})`);
            } else {
                ProcessManager._log(1, `Exploit程序重新注册仍然失败 (PID: ${exploitPid})`);
            }
        }
        
        // 初始化 DOM 观察器
        if (typeof document !== 'undefined' && document.body) {
            ProcessManager._initDOMObserver();
        }
        
        // 初始化共享空间
        ProcessManager._initSharedSpace();
        
        ProcessManager._log(2, "进程管理器初始化完成");
    }
    
    /**
     * 启动需要自动启动的程序
     * 在内核加载完成后调用
     */
    static async startAutoStartPrograms() {
        ProcessManager._log(2, "检查需要自动启动的程序");
        
        // 从POOL获取应用程序资源映射
        let applicationAssets = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                applicationAssets = POOL.__GET__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS");
            } catch (e) {
                ProcessManager._log(1, `获取APPLICATION_ASSETS失败: ${e.message}`);
                return;
            }
        }
        
        if (!applicationAssets) {
            ProcessManager._log(2, "没有应用程序资源映射，跳过自动启动");
            return;
        }
        
        // 收集需要自动启动的程序
        const autoStartPrograms = [];
        for (const [programName, asset] of Object.entries(applicationAssets)) {
            const parsedAsset = ProcessManager._parseAsset(asset);
            const metadata = parsedAsset.metadata || {};
            
            if (metadata.autoStart === true) {
                autoStartPrograms.push({
                    programName: programName,
                    priority: metadata.priority !== undefined ? metadata.priority : 0,
                    metadata: metadata
                });
            }
        }
        
        if (autoStartPrograms.length === 0) {
            ProcessManager._log(2, "没有需要自动启动的程序");
            return;
        }
        
        // 按优先级排序（数字越小优先级越高）
        autoStartPrograms.sort((a, b) => a.priority - b.priority);
        
        ProcessManager._log(2, `找到 ${autoStartPrograms.length} 个需要自动启动的程序`, {
            programs: autoStartPrograms.map(p => ({ name: p.programName, priority: p.priority }))
        });
        
        // 依次启动程序
        for (const program of autoStartPrograms) {
            try {
                ProcessManager._log(2, `自动启动程序: ${program.programName} (优先级: ${program.priority})`);
                await ProcessManager.startProgram(program.programName, {
                    autoStart: true,
                    metadata: program.metadata
                });
                ProcessManager._log(2, `程序 ${program.programName} 自动启动成功`);
            } catch (e) {
                ProcessManager._log(1, `程序 ${program.programName} 自动启动失败: ${e.message}`);
                // 继续启动其他程序，不因一个程序失败而停止
            }
        }
        
        ProcessManager._log(2, "自动启动程序检查完成");
    }

    /**
     * 动态加载脚本
     * @param {string} path 脚本路径
     * @returns {Promise<void>}
     */
    /**
     * 将虚拟文件系统路径转换为实际 URL（公共方法，供其他模块使用）
     * @param {string} path 虚拟路径（如 D:/application/xxx.js）
     * @returns {string} 实际 URL（如 /service/DISK/D/application/xxx.js）
     */
    static convertVirtualPathToUrl(path) {
        // 如果路径已经是 URL（以 http:// 或 https:// 或 / 开头），直接返回
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
            // 检查是否已经是 /service/DISK/ 格式
            if (path.startsWith('/service/DISK/')) {
                return path;
            }
            // 检查是否是相对路径（不以 / 开头，但也不是 D:/ 或 C:/）
            if (!path.match(/^[CD]:\//)) {
                return path;
            }
        }
        
        // 处理虚拟路径 D:/ 或 C:/
        if (path.startsWith('D:/')) {
            // 将 D:/application/xxx.js 转换为 /service/DISK/D/application/xxx.js
            const relativePath = path.substring(3); // 移除 "D:/"
            return `/service/DISK/D/${relativePath}`;
        } else if (path.startsWith('C:/')) {
            // 将 C:/xxx.js 转换为 /service/DISK/C/xxx.js
            const relativePath = path.substring(3); // 移除 "C:/"
            return `/service/DISK/C/${relativePath}`;
        }
        
        // 其他情况直接返回原路径
        return path;
    }
    
    static _loadScript(path) {
        return new Promise((resolve, reject) => {
            // 转换虚拟路径为实际 URL
            const actualUrl = ProcessManager.convertVirtualPathToUrl(path);
            
            // 检查是否已经加载过
            const existingScript = document.querySelector(`script[src="${actualUrl}"]`);
            if (existingScript) {
                ProcessManager._log(3, `脚本已加载: ${path} (${actualUrl})`);
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = actualUrl;
            script.async = true;
            script.onload = () => {
                ProcessManager._log(3, `脚本加载成功: ${path} (${actualUrl})`);
                resolve();
            };
            script.onerror = () => {
                ProcessManager._log(1, `脚本加载失败: ${path} (${actualUrl})`);
                reject(new Error(`Failed to load script: ${path} (${actualUrl})`));
            };
            document.head.appendChild(script);
        });
    }
    
    /**
     * 动态加载样式表
     * @param {string} path 样式表路径
     * @returns {Promise<void>}
     */
    static _loadStylesheet(path) {
        return new Promise((resolve, reject) => {
            // 转换虚拟路径为实际 URL
            const actualUrl = ProcessManager.convertVirtualPathToUrl(path);
            
            // 检查是否已经加载过
            const existingLink = document.querySelector(`link[href="${actualUrl}"]`);
            if (existingLink) {
                ProcessManager._log(3, `样式表已加载: ${path} (${actualUrl})`);
                resolve();
                return;
            }
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = actualUrl;
            link.onload = () => {
                ProcessManager._log(3, `样式表加载成功: ${path} (${actualUrl})`);
                resolve();
            };
            link.onerror = () => {
                ProcessManager._log(1, `样式表加载失败: ${path} (${actualUrl})`);
                reject(new Error(`Failed to load stylesheet: ${path} (${actualUrl})`));
            };
            document.head.appendChild(link);
        });
    }
    
    /**
     * 动态加载程序资源文件（图片、字体、数据文件等）
     * @param {string} path 资源文件路径
     * @returns {Promise<void>}
     */
    static _loadAsset(path) {
        return new Promise((resolve, reject) => {
            // 转换虚拟路径为实际 URL
            const actualUrl = ProcessManager.convertVirtualPathToUrl(path);
            
            // 根据文件扩展名确定资源类型
            const ext = path.split('.').pop().toLowerCase();
            const imageExts = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'];
            const fontExts = ['woff', 'woff2', 'ttf', 'otf', 'eot'];
            
            // 检查是否已经加载过（对于图片，检查img标签；对于字体，检查link标签）
            if (imageExts.includes(ext)) {
                const existingImg = document.querySelector(`img[src="${actualUrl}"]`);
                if (existingImg) {
                    ProcessManager._log(3, `图片资源已加载: ${path} (${actualUrl})`);
                    resolve();
                    return;
                }
                
                // 预加载图片
                const img = new Image();
                img.onload = () => {
                    ProcessManager._log(3, `图片资源加载成功: ${path} (${actualUrl})`);
                    resolve();
                };
                img.onerror = () => {
                    ProcessManager._log(1, `图片资源加载失败: ${path} (${actualUrl})`);
                    // 图片加载失败不影响程序启动，只记录警告
                    resolve();  // 不reject，允许程序继续
                };
                img.src = actualUrl;
                
            } else if (fontExts.includes(ext)) {
                // 检查字体是否已加载
                const existingLink = document.querySelector(`link[href="${actualUrl}"]`);
                if (existingLink) {
                    ProcessManager._log(3, `字体资源已加载: ${path} (${actualUrl})`);
                    resolve();
                    return;
                }
                
                // 加载字体
                const link = document.createElement('link');
                link.rel = 'preload';
                link.as = 'font';
                link.type = `font/${ext}`;
                link.crossOrigin = 'anonymous';
                link.href = actualUrl;
                link.onload = () => {
                    ProcessManager._log(3, `字体资源加载成功: ${path} (${actualUrl})`);
                    resolve();
                };
                link.onerror = () => {
                    ProcessManager._log(1, `字体资源加载失败: ${path} (${actualUrl})`);
                    // 字体加载失败不影响程序启动
                    resolve();  // 不reject，允许程序继续
                };
                document.head.appendChild(link);
                
            } else if (ext === 'js') {
                // JavaScript文件：使用script标签加载
                const existingScript = document.querySelector(`script[src="${actualUrl}"]`);
                if (existingScript) {
                    ProcessManager._log(3, `JavaScript资源已加载: ${path} (${actualUrl})`);
                    resolve();
                    return;
                }
                
                const script = document.createElement('script');
                script.src = actualUrl;
                script.onload = () => {
                    ProcessManager._log(3, `JavaScript资源加载成功: ${path} (${actualUrl})`);
                    resolve();
                };
                script.onerror = () => {
                    ProcessManager._log(1, `JavaScript资源加载失败: ${path} (${actualUrl})`);
                    // JavaScript加载失败不影响程序启动
                    resolve();  // 不reject，允许程序继续
                };
                document.head.appendChild(script);
            } else {
                // 其他类型的资源（JSON、数据文件等）
                // 使用 NetworkManager 进行网络请求（如果可用）
                let fetchFn = fetch; // 默认使用原生 fetch
                
                // 尝试获取 NetworkManager
                if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    try {
                        const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
                        if (networkManager && typeof networkManager.fetch === 'function') {
                            fetchFn = networkManager.fetch.bind(networkManager);
                        }
                    } catch (e) {
                        // NetworkManager 不可用，使用原生 fetch
                    }
                }
                
                // 使用 fetch 预加载
                fetchFn(actualUrl, { method: 'HEAD' })
                    .then(() => {
                        ProcessManager._log(3, `资源文件可访问: ${path} (${actualUrl})`);
                        resolve();
                    })
                    .catch((error) => {
                        ProcessManager._log(1, `资源文件加载失败: ${path} - ${error.message}`);
                        // 资源加载失败不影响程序启动
                        resolve();  // 不reject，允许程序继续
                    });
            }
        });
    }
    
    /**
     * 解析应用程序资源项（支持简单格式和完整格式）
     * @param {string|Object} asset 资源项（字符串路径或对象）
     * @returns {Object} 解析后的资源对象 { script, styles, assets, metadata }
     */
    static _parseAsset(asset) {
        if (typeof asset === 'string') {
            // 简单格式：直接是路径字符串
            return {
                script: asset,
                styles: [],
                assets: [],
                metadata: {}
            };
        } else if (typeof asset === 'object' && asset !== null) {
            // 完整格式：包含 script, styles, assets, metadata
            // assets 支持字符串（单个资源）或数组（多个资源）
            let assets = [];
            if (asset.assets) {
                if (typeof asset.assets === 'string') {
                    assets = [asset.assets];
                } else if (Array.isArray(asset.assets)) {
                    assets = asset.assets;
                }
            }
            
            return {
                script: asset.script || asset.path || '',
                styles: Array.isArray(asset.styles) ? asset.styles : [],
                assets: assets,
                metadata: asset.metadata || {}
            };
        } else {
            throw new Error('Invalid asset format');
        }
    }

    /**
     * 分配新的 PID
     * @returns {number} 新的 PID
     */
    static _allocatePid() {
        let pid = ProcessManager.NEXT_PID;
        
        // 确保不会分配 Exploit 程序的 PID (10000)
        if (pid === ProcessManager.EXPLOIT_PID) {
            pid = ProcessManager.EXPLOIT_PID + 1;
            ProcessManager.NEXT_PID = pid + 1;
            ProcessManager._log(2, `跳过 Exploit PID，分配 PID: ${pid}`);
        } else {
            ProcessManager.NEXT_PID = pid + 1;
            ProcessManager._log(3, `分配 PID: ${pid}`);
        }
        
        return pid;
    }

    /**
     * 启动程序
     * @param {string} programName 程序名称（小写，如 "vim"）
     * @param {Object} initArgs 初始化参数（可选）
     * @returns {Promise<number>} 返回 PID
     */
    static async startProgram(programName, initArgs = {}) {
        ProcessManager._log(2, `[启动程序] 开始启动: ${programName}`, initArgs);
        
        // 优先使用 ApplicationAssetManager 获取程序信息和元数据
        let asset = null;
        let programMetadata = null;
        ProcessManager._log(2, `[启动程序] 查找程序资源: ${programName}`);
        
        if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.getProgramInfo === 'function') {
            try {
                const programInfo = ApplicationAssetManager.getProgramInfo(programName);
                if (programInfo) {
                    asset = {
                        script: programInfo.script,
                        styles: programInfo.styles || [],
                        assets: programInfo.assets || [],
                        metadata: programInfo.metadata || {}
                    };
                    programMetadata = programInfo.metadata || {};
                    ProcessManager._log(2, `[启动程序] 从ApplicationAssetManager获取资源成功`, asset);
                } else {
                    ProcessManager._log(2, `[启动程序] ApplicationAssetManager未找到程序: ${programName}`);
                }
            } catch (e) {
                ProcessManager._log(1, `从ApplicationAssetManager获取程序信息失败: ${e.message}`);
            }
        } else {
            ProcessManager._log(2, `[启动程序] ApplicationAssetManager不可用，使用降级方案`);
        }
        
        // 降级方案：直接从POOL获取
        if (!asset) {
            let applicationAssets = null;
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    applicationAssets = POOL.__GET__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS");
                } catch (e) {
                    ProcessManager._log(1, `从POOL获取APPLICATION_ASSETS失败: ${e.message}`);
                }
            }
            
            if (!applicationAssets) {
                ProcessManager._log(1, `应用程序资源映射不可用`);
                throw new Error(`Application assets not available`);
            }
            
            // 检查应用程序资源映射
            if (!applicationAssets[programName]) {
                ProcessManager._log(1, `程序 ${programName} 未在应用程序资源映射中找到`);
                throw new Error(`Program ${programName} not found in application assets`);
            }
            
            // 解析应用程序资源（支持简单格式和完整格式）
            asset = ProcessManager._parseAsset(applicationAssets[programName]);
            programMetadata = asset.metadata || {};
            ProcessManager._log(2, `[启动程序] 从POOL获取资源成功`, asset);
        }
        
        // 尝试从程序对象获取元数据（如果程序已加载）
        if (!programMetadata || !programMetadata.hasOwnProperty('allowMultipleInstances')) {
            const programNameUpper = programName.toUpperCase();
            let programClass = null;
            if (typeof window !== 'undefined' && window[programNameUpper]) {
                programClass = window[programNameUpper];
            } else if (typeof globalThis !== 'undefined' && globalThis[programNameUpper]) {
                programClass = globalThis[programNameUpper];
            }
            
            if (programClass && typeof programClass.__info__ === 'function') {
                try {
                    const programInfo = programClass.__info__();
                    if (programInfo && programInfo.metadata) {
                        programMetadata = { ...programMetadata, ...programInfo.metadata };
                        ProcessManager._log(2, `[启动程序] 从程序对象获取元数据`, programMetadata);
                    }
                } catch (e) {
                    ProcessManager._log(2, `获取程序元数据失败: ${e.message}`);
                }
            }
        }
        
        // 检查程序是否支持多开
        const allowMultipleInstances = programMetadata && programMetadata.allowMultipleInstances === true;
        
        // 如果不支持多开，检查程序是否已在运行
        if (!allowMultipleInstances) {
            for (const [pid, processInfo] of ProcessManager.PROCESS_TABLE) {
                if (processInfo.programName === programName && processInfo.status === 'running') {
                    ProcessManager._log(1, `程序 ${programName} 已在运行 (PID: ${pid})，且不支持多开`);
                    throw new Error(`Program ${programName} is already running (PID: ${pid}) and does not support multiple instances`);
                }
            }
        } else {
            ProcessManager._log(2, `程序 ${programName} 支持多开，将创建新实例`);
            // 日志已通过 ProcessManager._log 输出
        }
        
        if (!asset.script) {
            ProcessManager._log(1, `程序 ${programName} 的脚本路径未定义`);
            ProcessManager._log(1, `程序 ${programName} 的脚本路径未定义`);
            throw new Error(`Program ${programName} script path is not defined`);
        }
        
        const scriptPath = asset.script;
        const styles = asset.styles || [];
        const assets = asset.assets || [];  // 程序资源文件
        const metadata = asset.metadata || {};
        const pid = ProcessManager._allocatePid();
        const programNameUpper = programName.toUpperCase();
        
        ProcessManager._log(2, `[启动程序] 分配PID: ${pid}, 脚本路径: ${scriptPath}`);
        
        // 创建进程信息
        const processInfo = {
            pid: pid,
            programName: programName,
            programNameUpper: programNameUpper,
            scriptPath: scriptPath,
            styles: styles,
            assets: assets,  // 存储资源文件列表
            metadata: metadata,
            status: 'loading',
            startTime: Date.now(),
            exitTime: null,
            memoryRefs: new Map(),
            actions: [],  // 程序行为记录
            isExploit: false,  // 普通程序不享有直接通信权限
            initArgs: initArgs,
            domElements: new Set(),  // 该程序创建的 DOM 元素
            mutationObserver: null,  // DOM 观察器（可选，用于更精确的跟踪）
            isMinimized: false,  // 是否最小化
            windowState: null,  // 窗口状态（用于恢复）
            isCLI: false,  // 是否为CLI程序
            terminalPid: null,  // 关联的终端PID（如果是CLI程序且创建了独立终端）
            launchedFromTerminal: false,  // 是否从终端内启动
            isCLITerminal: false,  // 是否为CLI程序创建的独立终端（不应在任务栏显示为terminal程序）
            requestedModules: new Set()  // 该进程请求的动态模块集合
        };
        
        const table = ProcessManager.PROCESS_TABLE;
        table.set(pid, processInfo);
        ProcessManager._saveProcessTable(table);
        
        // 注册程序名称到 MemoryManager
        if (typeof MemoryManager !== 'undefined') {
            MemoryManager.registerProgramName(pid, programName);
        }
        
        try {
            // 先加载样式表（如果有）
            if (styles.length > 0) {
                ProcessManager._log(2, `加载程序样式表: ${programName}`, { styles });
                try {
                    await Promise.all(styles.map(stylePath => ProcessManager._loadStylesheet(stylePath)));
                    ProcessManager._log(2, `程序 ${programName} 的所有样式表加载完成`);
                } catch (e) {
                    ProcessManager._log(1, `程序 ${programName} 的样式表加载失败: ${e.message}，继续加载脚本`);
                    // 样式表加载失败不影响程序启动
                }
            }
            
            // 加载程序资源文件（如果有）
            if (assets.length > 0) {
                ProcessManager._log(2, `加载程序资源: ${programName}`, { assets });
                try {
                    await Promise.all(assets.map(assetPath => ProcessManager._loadAsset(assetPath)));
                    ProcessManager._log(2, `程序 ${programName} 的所有资源加载完成`);
                } catch (e) {
                    ProcessManager._log(1, `程序 ${programName} 的资源加载失败: ${e.message}，继续加载脚本`);
                    // 资源加载失败不影响程序启动
                }
            }
            
            // 异步加载程序脚本
            ProcessManager._log(2, `[启动程序] 加载程序脚本: ${scriptPath}`);
            await ProcessManager._loadScript(scriptPath);
            ProcessManager._log(2, `[启动程序] 脚本加载完成，等待程序对象出现: ${programNameUpper}`);
            
            // 等待程序通过依赖管理器注册加载完成
            // 程序应该调用 DependencyConfig.publishSignal() 来通知加载完成
            // 这里我们通过轮询检查全局对象是否存在
            const maxWaitTime = 5000; // 最多等待5秒
            const checkInterval = 50; // 每50ms检查一次
            const startTime = Date.now();
            const maxChecks = 100;  // 最多检查100次（5秒/50ms）
            let checkCount = 0;
            
            let programLoaded = false;
            while (Date.now() - startTime < maxWaitTime && checkCount < maxChecks) {
                try {
                    // 检查程序是否已加载（通过检查全局对象）
                    // 程序名大写全拼的对象应该存在
                    if (typeof window !== 'undefined' && window[programNameUpper]) {
                        programLoaded = true;
                        ProcessManager._log(2, `[启动程序] 在window中找到程序对象: ${programNameUpper}`);
                        break;
                    }
                    if (typeof globalThis !== 'undefined' && globalThis[programNameUpper]) {
                        programLoaded = true;
                        ProcessManager._log(2, `[启动程序] 在globalThis中找到程序对象: ${programNameUpper}`);
                        break;
                    }
                    
                    // 也检查 POOL 中的 APPLICATION_POOL
                    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                        try {
                            const poolObj = POOL.__GET__("APPLICATION_POOL", programNameUpper);
                            if (poolObj && poolObj !== undefined) {
                                programLoaded = true;
                                ProcessManager._log(2, `[启动程序] 在POOL中找到程序对象: ${programNameUpper}`);
                                // 同时设置到 window 以便后续访问
                                if (typeof window !== 'undefined') {
                                    window[programNameUpper] = poolObj;
                                }
                                break;
                            }
                        } catch (e) {
                            // 忽略 POOL 访问错误，继续检查
                        }
                    }
                } catch (e) {
                    // 如果检查失败，停止等待
                    ProcessManager._log(1, `检查程序加载状态失败: ${e.message}`);
                    break;
                }
                
                checkCount++;
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
            
            if (!programLoaded) {
                ProcessManager._log(1, `程序 ${programName} 加载超时，未找到对象: ${programNameUpper}`);
                throw new Error(`Program ${programName} failed to load within timeout`);
            }
            
            ProcessManager._log(2, `[启动程序] 程序 ${programName} 加载完成，调用 __init__`);
            
            // 调用程序的 __init__ 方法
            const programClass = (typeof window !== 'undefined' && window[programNameUpper]) || 
                                (typeof globalThis !== 'undefined' && globalThis[programNameUpper]);
            
            if (!programClass) {
                ProcessManager._log(1, `程序对象 ${programNameUpper} 不存在`);
                throw new Error(`Program class ${programNameUpper} not found`);
            }
            
            ProcessManager._log(2, `[启动程序] 找到程序对象，检查类型`);
            
            // 检查程序类型（CLI或GUI）
            let programType = null;
            if (programClass && typeof programClass.__info__ === 'function') {
                try {
                    const programInfo = programClass.__info__();
                    programType = programInfo.type || null;
                    ProcessManager._log(2, `[启动程序] 程序类型: ${programType}`);
                } catch (e) {
                    ProcessManager._log(1, `获取程序类型失败: ${e.message}`);
                }
            } else {
                ProcessManager._log(2, `[启动程序] 程序没有__info__方法`);
            }
            
            // 如果是CLI程序，处理终端环境
            let terminalInstance = initArgs.terminal || null;
            let terminalPid = null;
            let launchedFromTerminal = false;
            
            if (programType === 'CLI') {
                // 标记为CLI程序
                processInfo.isCLI = true;
                
                // 检查是否从终端内启动（如果提供了terminal实例，说明是从终端启动的）
                if (terminalInstance) {
                    launchedFromTerminal = true;
                    processInfo.launchedFromTerminal = true;
                    ProcessManager._log(2, `CLI程序 ${programName} 从终端内启动，使用现有终端实例`);
                } else {
                    // 从GUI启动，需要创建独立的终端实例（无标签页）
                    ProcessManager._log(2, `CLI程序 ${programName} 从GUI启动，创建独立终端实例`);
                    
                    // 创建新的终端程序实例（独立窗口，无标签页）
                    try {
                        terminalPid = await ProcessManager.startProgram('terminal', {
                            autoStart: true,  // 标记为自动启动
                            forCLI: true,  // 标记为CLI程序专用终端
                            cliProgramName: programName,  // 关联的CLI程序名称
                            cliProgramPid: pid,  // 关联的CLI程序PID
                            disableTabs: true  // 禁用标签页功能
                        });
                        processInfo.terminalPid = terminalPid;
                        // 标记这个终端实例为CLI程序专用终端
                        const terminalProcessInfo = ProcessManager.PROCESS_TABLE.get(terminalPid);
                        if (terminalProcessInfo) {
                            terminalProcessInfo.isCLITerminal = true;
                        }
                        ProcessManager._log(2, `为CLI程序 ${programName} 创建独立终端 (PID: ${terminalPid})`);
                        
                        // 等待终端完全初始化（最多等待3秒）
                        let terminalReady = false;
                        const maxWaitTime = 3000;
                        const checkInterval = 50;
                        const startTime = Date.now();
                        while (Date.now() - startTime < maxWaitTime && !terminalReady) {
                            // 检查终端状态
                            const terminalProcessInfo = ProcessManager.PROCESS_TABLE.get(terminalPid);
                            if (terminalProcessInfo && terminalProcessInfo.status === 'running') {
                                // 检查终端API是否可用
                                try {
                                    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                                        const terminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");
                                        if (terminalAPI && typeof terminalAPI.getActiveTerminal === 'function') {
                                            const term = terminalAPI.getActiveTerminal();
                                            if (term) {
                                                terminalInstance = term;
                                                terminalReady = true;
                                                break;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // 忽略错误，继续等待
                                }
                            }
                            await new Promise(resolve => setTimeout(resolve, checkInterval));
                        }
                        
                        if (!terminalReady) {
                            ProcessManager._log(1, `终端程序启动超时，CLI程序可能无法正常工作`);
                        } else {
                            ProcessManager._log(2, `终端环境已就绪，CLI程序可以正常启动`);
                        }
                    } catch (e) {
                        ProcessManager._log(1, `创建独立终端失败: ${e.message}，CLI程序可能无法正常工作`);
                    }
                }
            }
            
            // 记录启动前的 DOM 快照（用于后续跟踪）
            const domSnapshotBefore = ProcessManager._getDOMSnapshot();
            
            // 将进程状态设置为 'starting'，允许在 __init__ 中调用 ProcessManager API
            processInfo.status = 'starting';
            ProcessManager._saveProcessTable(ProcessManager.PROCESS_TABLE);
            
            // 注册程序权限（从 __info__ 中读取）
            // 必须在 __init__ 之前完成权限注册，确保程序初始化时已拥有所需权限
            if (typeof PermissionManager !== 'undefined') {
                try {
                    let programInfo = null;
                    if (programClass && typeof programClass.__info__ === 'function') {
                        programInfo = programClass.__info__();
                    }
                    if (programInfo) {
                        // 等待权限注册完成，确保程序初始化时已拥有所需权限
                        await PermissionManager.registerProgramPermissions(pid, programInfo);
                        ProcessManager._log(2, `程序 ${programName} (PID: ${pid}) 权限注册完成`);
                    }
                } catch (e) {
                    ProcessManager._log(1, `注册程序权限失败: ${e.message}`);
                    KernelLogger.error("ProcessManager", `注册程序 ${pid} 权限失败`, e);
                    // 权限注册失败不应该阻止程序启动，但会记录错误
                }
            }
            
            if (programClass && typeof programClass.__init__ === 'function') {
                try {
                    // 构建标准化的初始化参数
                    const standardizedInitArgs = {
                        pid: pid,
                        args: initArgs.args || [],  // 命令行参数（如文件名）
                        env: initArgs.env || {},  // 环境变量
                        cwd: initArgs.cwd || 'C:',  // 当前工作目录
                        terminal: terminalInstance,  // 终端实例（CLI程序，已自动获取或启动）
                        metadata: initArgs.metadata || {},  // 元数据
                        ...initArgs  // 保留其他自定义参数
                    };
                    
                    ProcessManager._log(2, `[启动程序] 调用 __init__ 方法`, standardizedInitArgs);
                    ProcessManager._log(2, `[启动程序] 调用 __init__ 方法`, standardizedInitArgs);
                    
                    await programClass.__init__(pid, standardizedInitArgs);
                    processInfo.status = 'running';
                    
                    // 标记程序创建的元素（通过 data-pid 属性）
                    if (typeof document !== 'undefined' && document.body) {
                        ProcessManager._markProgramElements(pid, domSnapshotBefore);
                    }
                    
                    ProcessManager._log(2, `[启动程序] 程序 ${programName} (PID: ${pid}) 初始化完成`, {
                        args: standardizedInitArgs.args
                    });
                    ProcessManager._log(2, `[启动程序] 程序 ${programName} (PID: ${pid}) 初始化完成`);
                    
                    // 通知任务栏更新（延迟更新，确保程序状态已保存）
                    if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.update === 'function') {
                        setTimeout(() => {
                            TaskbarManager.update();
                        }, 100);
                    }
                } catch (e) {
                    processInfo.status = 'exited';
                    processInfo.exitTime = Date.now();
                    ProcessManager._log(1, `程序 ${programName} (PID: ${pid}) 初始化失败: ${e.message}`);
                    throw e;
                }
            } else {
                ProcessManager._log(1, `程序 ${programName} 没有 __init__ 方法，跳过初始化`);
                processInfo.status = 'running';
                
                // 即使没有 __init__ 方法，也尝试标记元素
                if (typeof document !== 'undefined' && document.body) {
                    ProcessManager._markProgramElements(pid, domSnapshotBefore);
                }
            }
            
            return pid;
        } catch (e) {
            // 启动失败，清理进程信息
            const table = ProcessManager.PROCESS_TABLE;
            table.delete(pid);
            ProcessManager._saveProcessTable(table);
            if (typeof MemoryManager !== 'undefined') {
                MemoryManager.freeMemory(pid);
            }
            ProcessManager._log(1, `启动程序 ${programName} 失败: ${e.message}`);
            throw e;
        }
    }

    /**
     * 终止程序
     * @param {number} pid 进程 ID
     * @param {boolean} force 是否强制终止（默认 false）
     * @returns {boolean} 是否成功终止
     */
    static async killProgram(pid, force = false) {
        ProcessManager._log(2, `终止程序 PID: ${pid}`, { force });
        
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            ProcessManager._log(1, `程序 PID ${pid} 不存在`);
            return false;
        }
        
        // 如果程序已经退出，但强制关闭或需要清理资源，继续执行清理
        if (processInfo.status === 'exited') {
            ProcessManager._log(1, `程序 PID ${pid} 已经退出，但继续清理资源`);
            // 如果强制关闭，继续执行清理
            if (!force) {
                // 即使状态是 'exited'，如果还有窗口存在，也需要清理
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.getWindowsByPid === 'function') {
                    const windows = GUIManager.getWindowsByPid(pid);
                    if (windows.length > 0) {
                        ProcessManager._log(2, `程序 PID ${pid} 已退出但仍有窗口，继续清理`);
                        // 继续执行清理，但跳过 __exit__ 调用
                        force = true;
                    } else {
                        // 没有窗口，直接返回
                        return false;
                    }
                } else {
                    // 无法检查窗口，直接返回
                    return false;
                }
            }
        }
        
        try {
            // 调用程序的 __exit__ 方法（仅在程序未退出时）
            if (processInfo.status !== 'exited') {
                const programNameUpper = processInfo.programNameUpper;
                const programClass = (typeof window !== 'undefined' && window[programNameUpper]) || 
                                    (typeof globalThis !== 'undefined' && globalThis[programNameUpper]);
                
                if (programClass && typeof programClass.__exit__ === 'function') {
                    try {
                        ProcessManager._log(2, `调用程序 ${processInfo.programName} 的 __exit__ 方法`);
                        // 标记进程状态为 exiting，防止 __exit__ 中再次调用 killProgram
                        processInfo.status = 'exiting';
                        await programClass.__exit__(pid, force);
                    } catch (e) {
                        ProcessManager._log(1, `程序 ${processInfo.programName} 的 __exit__ 方法执行失败: ${e.message}`);
                        if (!force) {
                            throw e;
                        }
                    }
                } else {
                    ProcessManager._log(2, `程序 ${processInfo.programName} 没有 __exit__ 方法，跳过退出处理`);
                }
            } else {
                ProcessManager._log(2, `程序 ${processInfo.programName} 已退出，跳过 __exit__ 调用，直接清理资源`);
            }
            
            // 如果是CLI程序且创建了独立终端，先关闭终端
            if (processInfo.isCLI && processInfo.terminalPid) {
                ProcessManager._log(2, `CLI程序 ${processInfo.programName} 退出，关闭关联终端 (PID: ${processInfo.terminalPid})`);
                try {
                    await ProcessManager.killProgram(processInfo.terminalPid, force);
                } catch (e) {
                    ProcessManager._log(1, `关闭关联终端失败: ${e.message}`);
                }
            }
            
            // 如果是CLI程序创建的独立终端，关闭关联的CLI程序
            // 注意：必须在清理GUI之前关闭关联程序，避免递归调用问题
            let cliProgramPidToKill = null;
            if (processInfo.isCLITerminal) {
                // 查找关联的CLI程序
                for (const [p, info] of ProcessManager.PROCESS_TABLE) {
                    if (info.terminalPid === pid && info.isCLI && info.status === 'running') {
                        cliProgramPidToKill = p;
                        break;
                    }
                }
            }
            
            // 清理 GUI 元素（包括 GUIManager 中的窗口注册）
            // 先关闭所有窗口，确保窗口的 onClose 回调被调用
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.getWindowsByPid === 'function') {
                const windows = GUIManager.getWindowsByPid(pid);
                for (const window of windows) {
                    try {
                        // 使用 forceClose = true，因为进程已经被 kill，不需要再调用 onClose 回调
                        // 但为了确保窗口被正确清理，我们仍然调用 unregisterWindow
                        if (window.windowId && typeof GUIManager.unregisterWindow === 'function') {
                            GUIManager.unregisterWindow(window.windowId);
                        }
                    } catch (e) {
                        ProcessManager._log(1, `清理窗口 ${window.windowId} 失败: ${e.message}`);
                    }
                }
            }
            // 然后清理其他 GUI 元素
            ProcessManager._cleanupGUI(pid);
            
            // 清理程序注册的上下文菜单
            if (typeof ContextMenuManager !== 'undefined' && typeof ContextMenuManager.unregisterContextMenu === 'function') {
                try {
                    ContextMenuManager.unregisterContextMenu(pid);
                    ProcessManager._log(2, `已清理程序 PID ${pid} 的上下文菜单`);
                } catch (e) {
                    ProcessManager._log(1, `清理程序 PID ${pid} 的上下文菜单失败: ${e.message}`);
                }
            }
            
            // 清理程序创建的桌面组件
            if (typeof DesktopManager !== 'undefined' && typeof DesktopManager.cleanupProgramComponents === 'function') {
                try {
                    DesktopManager.cleanupProgramComponents(pid);
                    ProcessManager._log(2, `已清理程序 PID ${pid} 的桌面组件`);
                } catch (e) {
                    ProcessManager._log(1, `清理程序 PID ${pid} 的桌面组件失败: ${e.message}`);
                }
            }
            
            // 清理程序创建的拖拽会话
            if (typeof DragDrive !== 'undefined' && typeof DragDrive.cleanupProcessDrags === 'function') {
                try {
                    DragDrive.cleanupProcessDrags(pid);
                    ProcessManager._log(2, `已清理程序 PID ${pid} 的拖拽会话`);
                } catch (e) {
                    ProcessManager._log(1, `清理程序 PID ${pid} 的拖拽会话失败: ${e.message}`);
                }
            }
            
            // 清理程序创建的通知（仅清理依赖类型的通知，快照类型保留）
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.cleanupProgramNotifications === 'function') {
                try {
                    // 只清理依赖类型的通知，快照类型的通知保留，并触发关闭回调
                    NotificationManager.cleanupProgramNotifications(pid, true, true);
                    ProcessManager._log(2, `已清理程序 PID ${pid} 的依赖类型通知`);
                } catch (e) {
                    ProcessManager._log(1, `清理程序 PID ${pid} 的通知失败: ${e.message}`);
                }
            }
            
            // 清理程序注册的事件处理器
            if (typeof EventManager !== 'undefined' && typeof EventManager.unregisterAllHandlersForPid === 'function') {
                try {
                    EventManager.unregisterAllHandlersForPid(pid);
                    ProcessManager._log(2, `已清理程序 PID ${pid} 的事件处理器`);
                } catch (e) {
                    ProcessManager._log(1, `清理程序 PID ${pid} 的事件处理器失败: ${e.message}`);
                }
            }
            
            // 清理程序权限
            if (typeof PermissionManager !== 'undefined' && typeof PermissionManager.clearProgramPermissions === 'function') {
                try {
                    PermissionManager.clearProgramPermissions(pid);
                    ProcessManager._log(2, `已清理程序 PID ${pid} 的权限`);
                } catch (e) {
                    ProcessManager._log(1, `清理程序 PID ${pid} 的权限失败: ${e.message}`);
                }
            }
            
            // 清理程序的多线程资源
            if (typeof MultithreadingDrive !== 'undefined' && typeof MultithreadingDrive.cleanupProcessThreads === 'function') {
                try {
                    MultithreadingDrive.cleanupProcessThreads(pid);
                    ProcessManager._log(2, `已清理程序 PID ${pid} 的多线程资源`);
                } catch (e) {
                    ProcessManager._log(1, `清理程序 PID ${pid} 的多线程资源失败: ${e.message}`);
                }
            }
            
            // 在清理GUI之后，关闭关联的CLI程序（避免递归调用）
            if (cliProgramPidToKill) {
                ProcessManager._log(2, `CLI程序专用终端退出，关闭关联CLI程序 (PID: ${cliProgramPidToKill})`);
                // 使用setTimeout避免在killProgram执行过程中再次调用killProgram导致递归
                setTimeout(async () => {
                    try {
                        await ProcessManager.killProgram(cliProgramPidToKill, force);
                    } catch (e) {
                        ProcessManager._log(1, `关闭关联CLI程序失败: ${e.message}`);
                    }
                }, 0);
            }
            
            // 释放内存（在状态设置为 exited 之前，避免 MemoryManager 检查失败）
            if (typeof MemoryManager !== 'undefined') {
                try {
                    MemoryManager.freeMemory(pid);
                } catch (e) {
                    // 如果内存释放失败（例如进程已不存在），记录警告但继续执行
                    ProcessManager._log(1, `释放内存失败: ${e.message}`);
                }
            }
            
            // 清理内存引用
            processInfo.memoryRefs.clear();
            
            // 清理 DOM 元素集合
            if (processInfo.domElements) {
                processInfo.domElements.clear();
            }
            
            // 停止 DOM 观察器（如果有）
            if (processInfo.mutationObserver) {
                processInfo.mutationObserver.disconnect();
                processInfo.mutationObserver = null;
            }
            
            // 更新进程状态
            processInfo.status = 'exited';
            processInfo.exitTime = Date.now();
            
            // 保存进程表
            ProcessManager._saveProcessTable(ProcessManager.PROCESS_TABLE);
            
            // 通知任务栏更新（延迟更新，确保状态已保存）
            if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.update === 'function') {
                setTimeout(() => {
                    TaskbarManager.update();
                }, 50);
            }
            
            ProcessManager._log(2, `程序 PID ${pid} 已终止`);
            return true;
        } catch (e) {
            if (force) {
                // 强制终止，即使出错也清理
                // 清理 GUI 元素
                ProcessManager._cleanupGUI(pid);
                
                processInfo.status = 'exited';
                processInfo.exitTime = Date.now();
                if (typeof MemoryManager !== 'undefined') {
                    MemoryManager.freeMemory(pid);
                }
                
                // 清理 DOM 元素集合
                if (processInfo.domElements) {
                    processInfo.domElements.clear();
                }
                
                // 停止 DOM 观察器（如果有）
                if (processInfo.mutationObserver) {
                    processInfo.mutationObserver.disconnect();
                    processInfo.mutationObserver = null;
                }
                
                // 保存进程表
                ProcessManager._saveProcessTable(ProcessManager.PROCESS_TABLE);
                
                // 通知任务栏更新（延迟更新，确保状态已保存）
                if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.update === 'function') {
                    setTimeout(() => {
                        TaskbarManager.update();
                    }, 50);
                }
                
                ProcessManager._log(1, `强制终止程序 PID ${pid}，但退出处理失败: ${e.message}`);
                return true;
            }
            ProcessManager._log(1, `终止程序 PID ${pid} 失败: ${e.message}`);
            return false;
        }
    }

    /**
     * 通过进程管理器申请内存（自动生成ID）
     * @param {number} pid 进程 ID
     * @param {number} heapSize 堆大小（-1 表示不需要堆）
     * @param {number} shedSize 栈大小（-1 表示不需要栈）
     * @param {string} refId 引用 ID（可选，用于标识内存引用）
     * @returns {Object} 内存引用对象 { heap: Heap | null, shed: Shed | null, refId: string, heapId: number, shedId: number }
     */
    static allocateMemory(pid, heapSize = -1, shedSize = -1, refId = null) {
        ProcessManager._log(2, `为进程 PID ${pid} 申请内存`, { heapSize, shedSize, refId });
        
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            ProcessManager._log(1, `进程 PID ${pid} 不存在`);
            throw new Error(`Process ${pid} does not exist`);
        }
        
        if (processInfo.status !== 'running') {
            ProcessManager._log(1, `进程 PID ${pid} 状态异常: ${processInfo.status}`);
            throw new Error(`Process ${pid} is not running`);
        }
        
        // 通过 MemoryManager 分配内存（自动生成ID）
        if (typeof MemoryManager === 'undefined') {
            ProcessManager._log(1, "MemoryManager 不可用");
            throw new Error("MemoryManager is not available");
        }
        
        const memoryResult = MemoryManager.allocateMemory(pid, heapSize, shedSize);
        
        // 生成引用 ID
        if (!refId) {
            refId = `ref_${pid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // 创建内存引用对象
        const memoryRef = {
            pid: pid,
            heapId: memoryResult.heapId,
            shedId: memoryResult.shedId,
            heap: memoryResult.heap,
            shed: memoryResult.shed,
            refId: refId,
            allocatedAt: Date.now()
        };
        
        // 存储内存引用
        processInfo.memoryRefs.set(refId, memoryRef);
        
        // 记录程序行为
        ProcessManager._logProgramAction(pid, 'allocateMemory', { heapSize, shedSize, heapId: memoryResult.heapId, shedId: memoryResult.shedId });
        
        ProcessManager._log(2, `内存申请成功`, { pid, refId, heapId: memoryResult.heapId, shedId: memoryResult.shedId });
        
        return memoryRef;
    }

    /**
     * 释放内存引用
     * @param {number} pid 进程 ID
     * @param {string} refId 引用 ID
     * @returns {boolean} 是否成功释放
     */
    static freeMemoryRef(pid, refId) {
        ProcessManager._log(2, `释放内存引用 PID: ${pid}, refId: ${refId}`);
        
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            ProcessManager._log(1, `进程 PID ${pid} 不存在`);
            return false;
        }
        
        const memoryRef = processInfo.memoryRefs.get(refId);
        if (!memoryRef) {
            ProcessManager._log(1, `内存引用 ${refId} 不存在`);
            return false;
        }
        
        // 注意：这里不实际释放内存，只是移除引用
        // 实际的内存释放由 MemoryManager.freeMemory() 统一处理
        processInfo.memoryRefs.delete(refId);
        
        ProcessManager._log(2, `内存引用 ${refId} 已释放`);
        return true;
    }

    /**
     * 获取进程信息
     * @param {number} pid 进程 ID（可选，不提供则返回所有进程）
     * @returns {Object|null} 进程信息或进程列表
     */
    static getProcessInfo(pid = null) {
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo) {
                return null;
            }
            
            // 获取内存信息
            let memoryInfo = null;
            if (typeof MemoryManager !== 'undefined') {
                memoryInfo = MemoryManager.checkMemory(pid);
            }
            
            // 确保返回的对象包含所有原始信息，包括actions
            return {
                ...processInfo,
                memoryInfo: memoryInfo,
                // 确保actions数组被正确传递
                actions: processInfo.actions || []
            };
        } else {
            // 返回所有进程信息
            const processes = [];
            
            // 确保Exploit程序在进程表中
            const exploitPid = ProcessManager.EXPLOIT_PID;
            if (!ProcessManager.PROCESS_TABLE.has(exploitPid)) {
                ProcessManager._log(1, `Exploit程序不在进程表中，尝试注册 (PID: ${exploitPid})`);
                ProcessManager._registerExploitProgram();
            }
            
            ProcessManager.PROCESS_TABLE.forEach((processInfo, pid) => {
                let memoryInfo = null;
                if (typeof MemoryManager !== 'undefined') {
                    // 对于Exploit程序，确保内存已分配
                    if (pid === exploitPid && typeof KernelMemory !== 'undefined') {
                        try {
                            KernelMemory._ensureMemory();
                        } catch (e) {
                            ProcessManager._log(1, `确保Exploit程序内存失败: ${e.message}`);
                        }
                    }
                    memoryInfo = MemoryManager.checkMemory(pid);
                }
                processes.push({
                    ...processInfo,
                    memoryInfo: memoryInfo
                });
            });
            return processes;
        }
    }

    /**
     * 检查进程是否存在
     * @param {number} pid 进程 ID
     * @returns {boolean}
     */
    static hasProcess(pid) {
        return ProcessManager.PROCESS_TABLE.has(pid);
    }

    /**
     * 获取所有运行中的进程
     * @returns {Array<Object>}
     */
    static getRunningProcesses() {
        const running = [];
        ProcessManager.PROCESS_TABLE.forEach((processInfo, pid) => {
            if (processInfo.status === 'running') {
                running.push(processInfo);
            }
        });
        return running;
    }
    
    /**
     * 列出所有进程（包含内存信息）
     * @returns {Array<Object>} 进程信息数组
     */
    static listProcesses() {
        // 返回所有进程信息（包含内存信息）
        return ProcessManager.getProcessInfo();
    }
    
    /**
     * 记录程序行为
     * @param {number} pid 进程ID
     * @param {string} action 行为名称
     * @param {Object} details 详细信息
     */
    static _logProgramAction(pid, action, details = {}) {
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            return;
        }
        
        // 限制行为记录数量，避免内存泄漏
        if (!processInfo.actions) {
            processInfo.actions = [];
        }
        if (processInfo.actions.length > 1000) {
            processInfo.actions.shift(); // 移除最旧的记录
        }
        
        processInfo.actions.push({
            action: action,
            timestamp: Date.now(),
            details: details
        });
    }
    
    /**
     * 内核API代理：所有程序调用内核API必须通过此方法
     * @param {number} pid 进程ID
     * @param {string} apiName API名称
     * @param {Array} args 参数数组
     * @returns {Promise<any>} API调用结果
     */
    static async callKernelAPI(pid, apiName, args = []) {
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            throw new Error(`Process ${pid} does not exist`);
        }
        
        // Exploit程序享有直接通信权限
        if (processInfo.isExploit) {
            ProcessManager._log(3, `Exploit程序 ${pid} 直接调用内核API: ${apiName}`);
            return await ProcessManager._executeKernelAPI(apiName, args);
        }
        
        // 普通程序需要通过进程管理器代理
        if (processInfo.status !== 'running') {
            throw new Error(`Process ${pid} is not running`);
        }
        
        // 权限检查（如果权限管理器已加载）- 这是强制性的安全检查
        if (typeof PermissionManager !== 'undefined') {
            const requiredPermission = ProcessManager._getRequiredPermission(apiName);
            if (requiredPermission) {
                try {
                    const hasPermission = await PermissionManager.checkAndRequestPermission(pid, requiredPermission);
                    if (!hasPermission) {
                        // 权限被拒绝，立即拒绝API调用，不继续执行
                        const error = new Error(`程序 ${pid} 没有权限调用 ${apiName}（需要权限: ${requiredPermission}）。权限已被用户拒绝。`);
                        ProcessManager._log(1, error.message);
                        KernelLogger.error("ProcessManager", `API调用被拒绝: ${apiName} (PID: ${pid}, 权限: ${requiredPermission})`);
                        throw error;
                    }
                    // 权限已授予，继续执行
                    ProcessManager._log(2, `程序 ${pid} 已获得权限 ${requiredPermission}，允许调用 ${apiName}`);
                } catch (e) {
                    // 权限检查过程中发生错误，也拒绝API调用
                    ProcessManager._log(1, `权限检查失败: ${e.message}`);
                    KernelLogger.error("ProcessManager", `权限检查失败，拒绝API调用: ${apiName} (PID: ${pid})`, e);
                    throw new Error(`权限检查失败: ${e.message}`);
                }
            } else {
                // 该API不需要权限，记录日志
                ProcessManager._log(3, `API ${apiName} 不需要权限检查`);
            }
        } else {
            // 权限管理器未加载，记录警告但允许继续（向后兼容）
            ProcessManager._log(2, `警告: 权限管理器未加载，跳过权限检查: ${apiName}`);
        }
        
        // 记录程序行为
        ProcessManager._logProgramAction(pid, 'callKernelAPI', { apiName, args });
        
        ProcessManager._log(2, `进程 ${pid} 调用内核API: ${apiName}`);
        
        // 执行API调用
        return await ProcessManager._executeKernelAPI(apiName, args, pid);
    }
    
    /**
     * 获取API所需的权限
     * @param {string} apiName API名称
     * @returns {string|null} 所需权限，如果不需要权限则返回null
     */
    static _getRequiredPermission(apiName) {
        if (typeof PermissionManager === 'undefined') {
            return null;
        }
        
        // API到权限的映射
        const apiPermissionMap = {
            // 文件系统API
            'FileSystem.read': PermissionManager.PERMISSION.KERNEL_DISK_READ,
            'FileSystem.write': PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
            'FileSystem.delete': PermissionManager.PERMISSION.KERNEL_DISK_DELETE,
            'FileSystem.create': PermissionManager.PERMISSION.KERNEL_DISK_CREATE,
            'FileSystem.list': PermissionManager.PERMISSION.KERNEL_DISK_LIST,
            
            // 通知API
            'Notification.create': PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
            'Notification.remove': PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
            
            // 网络API
            'Network.request': PermissionManager.PERMISSION.NETWORK_ACCESS,
            'Network.fetch': PermissionManager.PERMISSION.NETWORK_ACCESS,
            
            // GUI API
            'GUI.createWindow': PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
            'GUI.manageWindow': PermissionManager.PERMISSION.GUI_WINDOW_MANAGE,
            
            // 存储API
            'Storage.read': PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
            'Storage.write': PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
            
            // 主题API
            'Theme.read': PermissionManager.PERMISSION.THEME_READ,
            'Theme.write': PermissionManager.PERMISSION.THEME_WRITE,
            
            // 桌面API
            'Desktop.manage': PermissionManager.PERMISSION.DESKTOP_MANAGE,
            
            // 任务栏API
            'Taskbar.pinProgram': PermissionManager.PERMISSION.DESKTOP_MANAGE,
            
            // 事件API
            'Event.register': PermissionManager.PERMISSION.EVENT_LISTENER,
            'Event.unregister': PermissionManager.PERMISSION.EVENT_LISTENER, // 使用桌面管理权限
            'Taskbar.unpinProgram': PermissionManager.PERMISSION.DESKTOP_MANAGE,
            'Taskbar.getPinnedPrograms': null, // 读取操作不需要权限
            'Taskbar.isPinned': null, // 读取操作不需要权限
            'Taskbar.setPinnedPrograms': PermissionManager.PERMISSION.DESKTOP_MANAGE,
            
            // 进程管理API
            'Process.manage': PermissionManager.PERMISSION.PROCESS_MANAGE,
            
            // 多线程API
            'Multithreading.createThread': PermissionManager.PERMISSION.MULTITHREADING_CREATE,
            'Multithreading.executeTask': PermissionManager.PERMISSION.MULTITHREADING_EXECUTE,
            'Multithreading.getPoolStatus': PermissionManager.PERMISSION.MULTITHREADING_EXECUTE,
            
            // 加密API
            'Crypt.generateKeyPair': PermissionManager.PERMISSION.CRYPT_GENERATE_KEY,
            'Crypt.importKeyPair': PermissionManager.PERMISSION.CRYPT_IMPORT_KEY,
            'Crypt.getKeyInfo': null,  // 读取操作不需要权限
            'Crypt.listKeys': null,  // 读取操作不需要权限
            'Crypt.deleteKey': PermissionManager.PERMISSION.CRYPT_DELETE_KEY,
            'Crypt.setDefaultKey': PermissionManager.PERMISSION.CRYPT_DELETE_KEY,  // 使用删除权限（管理密钥）
            'Crypt.encrypt': PermissionManager.PERMISSION.CRYPT_ENCRYPT,
            'Crypt.decrypt': PermissionManager.PERMISSION.CRYPT_DECRYPT,
            'Crypt.md5': PermissionManager.PERMISSION.CRYPT_MD5,
            'Crypt.randomInt': PermissionManager.PERMISSION.CRYPT_RANDOM,
            'Crypt.randomFloat': PermissionManager.PERMISSION.CRYPT_RANDOM,
            'Crypt.randomBoolean': PermissionManager.PERMISSION.CRYPT_RANDOM,
            'Crypt.randomString': PermissionManager.PERMISSION.CRYPT_RANDOM,
            'Crypt.randomChoice': PermissionManager.PERMISSION.CRYPT_RANDOM,
            'Crypt.shuffle': PermissionManager.PERMISSION.CRYPT_RANDOM,
            
            // 拖拽API
            'Drag.createSession': PermissionManager.PERMISSION.DRAG_ELEMENT,
            'Drag.enable': PermissionManager.PERMISSION.DRAG_ELEMENT,
            'Drag.disable': PermissionManager.PERMISSION.DRAG_ELEMENT,
            'Drag.destroySession': PermissionManager.PERMISSION.DRAG_ELEMENT,
            'Drag.getSession': PermissionManager.PERMISSION.DRAG_ELEMENT,
            'Drag.registerDropZone': PermissionManager.PERMISSION.DRAG_ELEMENT,
            'Drag.unregisterDropZone': PermissionManager.PERMISSION.DRAG_ELEMENT,
            'Drag.createFileDrag': PermissionManager.PERMISSION.DRAG_FILE,
            'Drag.createWindowDrag': PermissionManager.PERMISSION.DRAG_WINDOW,
            'Drag.getProcessDrags': PermissionManager.PERMISSION.DRAG_ELEMENT,
            
            // 地理位置API
            'Geography.getCurrentPosition': PermissionManager.PERMISSION.GEOGRAPHY_LOCATION,
            'Geography.clearCache': PermissionManager.PERMISSION.GEOGRAPHY_LOCATION,
            'Geography.isSupported': null, // 检查支持性不需要权限
            'Geography.getCachedLocation': PermissionManager.PERMISSION.GEOGRAPHY_LOCATION,
            
            // 缓存API
            'Cache.set': PermissionManager.PERMISSION.CACHE_WRITE,
            'Cache.get': PermissionManager.PERMISSION.CACHE_READ,
            'Cache.has': PermissionManager.PERMISSION.CACHE_READ,
            'Cache.delete': PermissionManager.PERMISSION.CACHE_WRITE,
            'Cache.clear': PermissionManager.PERMISSION.CACHE_WRITE,
            'Cache.getStats': PermissionManager.PERMISSION.CACHE_READ,
        };
        
        return apiPermissionMap[apiName] || null;
    }
    
    /**
     * 执行内核API调用（内部方法）
     * @param {string} apiName API名称
     * @param {Array} args 参数数组
     * @returns {Promise<any>} API调用结果
     * @throws {Error} 如果API名称无效或调用失败
     */
    static async _executeKernelAPI(apiName, args, pid = null) {
        // 参数验证
        if (!apiName || typeof apiName !== 'string') {
            throw new Error('_executeKernelAPI: apiName 必须是字符串');
        }
        
        if (!Array.isArray(args)) {
            throw new Error('_executeKernelAPI: args 必须是数组');
        }
        // 定义可用的内核API
        const kernelAPIs = {
            // 文件系统API
            'FileSystem.read': async (path) => {
                if (!path || typeof path !== 'string') {
                    throw new Error('FileSystem.read: 路径必须是字符串');
                }
                
                try {
                    // 解析路径：格式为 "盘符/路径/文件名"
                    const parts = path.split('/');
                    if (parts.length < 2) {
                        throw new Error(`FileSystem.read: 无效的路径格式: ${path}`);
                    }
                    
                    const diskName = parts[0];
                    const fileName = parts[parts.length - 1];
                    const dirPath = parts.slice(0, -1).join('/');
                    
                    // 获取磁盘分区
                    if (typeof Disk === 'undefined') {
                        throw new Error('FileSystem.read: Disk 模块未加载');
                    }
                    
                    // 检查分区是否存在（同时检查 diskSeparateMap 和 diskSeparateSize）
                    const diskMap = Disk.diskSeparateMap;
                    const diskSize = Disk.diskSeparateSize;
                    const hasPartition = (diskMap && diskMap.has(diskName)) || 
                                       (diskSize && diskSize.has(diskName));
                    if (!hasPartition) {
                        throw new Error(`FileSystem.read: 磁盘分区不存在: ${diskName}`);
                    }
                    
                    // 尝试获取 nodeTree（可能不存在或未初始化）
                    let nodeTree = diskMap && diskMap.has(diskName) ? diskMap.get(diskName) : null;
                    
                    // 如果 nodeTree 不存在或未初始化，尝试从 PHP 服务重建
                    if (!nodeTree || !nodeTree.initialized) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('ProcessManager', `FileSystem.read: 磁盘分区 ${diskName} 的 nodeTree 不可靠，尝试从 PHP 服务重建`);
                        }
                        
                        // 如果 nodeTree 不存在，尝试创建它
                        if (!nodeTree && typeof NodeTreeCollection !== 'undefined') {
                            try {
                                nodeTree = new NodeTreeCollection(diskName);
                                // 将新的 nodeTree 添加到 diskMap
                                if (diskMap) {
                                    diskMap.set(diskName, nodeTree);
                                }
                                // 注册到 POOL
                                if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                                    try {
                                        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                                            POOL.__INIT__("KERNEL_GLOBAL_POOL");
                                        }
                                        POOL.__ADD__("KERNEL_GLOBAL_POOL", diskName, nodeTree);
                                    } catch (e) {
                                        KernelLogger.warn('ProcessManager', `注册 nodeTree 到 POOL 失败: ${diskName}`);
                                    }
                                }
                            } catch (e) {
                                KernelLogger.error('ProcessManager', `创建 nodeTree 失败: ${diskName}`, e);
                            }
                        }
                        
                        // 如果 nodeTree 存在但未初始化，尝试从 PHP 服务重建
                        if (nodeTree && typeof nodeTree._rebuildFromPHP === 'function') {
                            try {
                                await nodeTree._rebuildFromPHP();
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.info('ProcessManager', `FileSystem.read: 从 PHP 服务重建 nodeTree 成功: ${diskName}`);
                                }
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ProcessManager', `FileSystem.read: 从 PHP 服务重建 nodeTree 失败: ${diskName}，将从 PHP 服务直接读取`, e);
                                }
                            }
                        }
                    }
                    
                    // 读取文件
                    // 如果 nodeTree 仍然不存在或未初始化，直接从 PHP 服务读取
                    if (!nodeTree || !nodeTree.initialized) {
                        // 从 PHP 服务直接读取文件
                        const url = new URL('/service/FSDirve.php', window.location.origin);
                        url.searchParams.set('action', 'read_file');
                        url.searchParams.set('path', path);
                        
                        const response = await fetch(url.toString());
                        if (!response.ok) {
                            throw new Error(`FileSystem.read: 从 PHP 服务读取文件失败: ${path}`);
                        }
                        const result = await response.json();
                        if (result.status === 'success' && result.data) {
                            return result.data.content || '';
                        }
                        throw new Error(`FileSystem.read: PHP 服务返回错误: ${result.message || '未知错误'}`);
                    }
                    
                    // 如果 dirPath 是根目录（如 "D:"），使用 separateName 作为路径
                    let actualDirPath = dirPath;
                    if (dirPath === diskName) {
                        actualDirPath = nodeTree.separateName || diskName;
                    }
                    
                    const content = nodeTree.read_file(actualDirPath, fileName);
                    if (content === null || content === undefined) {
                        // 记录详细的错误信息
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ProcessManager', `FileSystem.read: 文件不存在或读取失败: ${path}，dirPath=${dirPath}，actualDirPath=${actualDirPath}，diskName=${diskName}，separateName=${nodeTree.separateName}`);
                        }
                        throw new Error(`FileSystem.read: 文件不存在: ${path}`);
                    }
                    
                    return content;
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ProcessManager', `FileSystem.read 失败: ${error.message}`, { path });
                    }
                    throw error;
                }
            },
            'FileSystem.write': async (path, content, writeMode = 'OVERWRITE') => {
                if (!path || typeof path !== 'string') {
                    throw new Error('FileSystem.write: 路径必须是字符串');
                }
                
                if (content === undefined || content === null) {
                    throw new Error('FileSystem.write: 内容不能为空');
                }
                
                try {
                    // 解析路径：格式为 "盘符/路径/文件名"
                    const parts = path.split('/');
                    if (parts.length < 2) {
                        throw new Error(`FileSystem.write: 无效的路径格式: ${path}`);
                    }
                    
                    const diskName = parts[0];
                    const fileName = parts[parts.length - 1];
                    const dirPath = parts.slice(0, -1).join('/');
                    
                    // 获取磁盘分区
                    if (typeof Disk === 'undefined') {
                        throw new Error('FileSystem.write: Disk 模块未加载');
                    }
                    
                    // 检查分区是否存在（同时检查 diskSeparateMap 和 diskSeparateSize）
                    const diskMap = Disk.diskSeparateMap;
                    const diskSize = Disk.diskSeparateSize;
                    const hasPartition = (diskMap && diskMap.has(diskName)) || 
                                       (diskSize && diskSize.has(diskName));
                    if (!hasPartition) {
                        throw new Error(`FileSystem.write: 磁盘分区不存在: ${diskName}`);
                    }
                    
                    // 尝试获取 nodeTree（可能不存在或未初始化）
                    let nodeTree = diskMap && diskMap.has(diskName) ? diskMap.get(diskName) : null;
                    
                    // 如果 nodeTree 不存在或未初始化，尝试从 PHP 服务重建
                    if (!nodeTree || !nodeTree.initialized) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('ProcessManager', `FileSystem.write: 磁盘分区 ${diskName} 的 nodeTree 不可靠，尝试从 PHP 服务重建`);
                        }
                        
                        // 如果 nodeTree 不存在，尝试创建它
                        if (!nodeTree && typeof NodeTreeCollection !== 'undefined') {
                            try {
                                nodeTree = new NodeTreeCollection(diskName);
                                // 将新的 nodeTree 添加到 diskMap
                                if (diskMap) {
                                    diskMap.set(diskName, nodeTree);
                                }
                                // 注册到 POOL
                                if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                                    try {
                                        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                                            POOL.__INIT__("KERNEL_GLOBAL_POOL");
                                        }
                                        POOL.__ADD__("KERNEL_GLOBAL_POOL", diskName, nodeTree);
                                    } catch (e) {
                                        KernelLogger.warn('ProcessManager', `注册 nodeTree 到 POOL 失败: ${diskName}`);
                                    }
                                }
                            } catch (e) {
                                KernelLogger.error('ProcessManager', `创建 nodeTree 失败: ${diskName}`, e);
                            }
                        }
                        
                        // 如果 nodeTree 存在但未初始化，尝试从 PHP 服务重建
                        if (nodeTree && typeof nodeTree._rebuildFromPHP === 'function') {
                            try {
                                await nodeTree._rebuildFromPHP();
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.info('ProcessManager', `FileSystem.write: 从 PHP 服务重建 nodeTree 成功: ${diskName}`);
                                }
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ProcessManager', `FileSystem.write: 从 PHP 服务重建 nodeTree 失败: ${diskName}，将通过 PHP 服务直接写入`, e);
                                }
                            }
                        }
                    }
                    
                    // 如果 nodeTree 仍然不存在或未初始化，直接通过 PHP 服务写入
                    if (!nodeTree || !nodeTree.initialized) {
                        // 通过 PHP 服务直接写入文件
                        const url = new URL('/service/FSDirve.php', window.location.origin);
                        url.searchParams.set('action', 'write_file');
                        url.searchParams.set('path', path);
                        url.searchParams.set('content', content);
                        url.searchParams.set('writeMod', writeMode);
                        
                        const response = await fetch(url.toString(), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                                action: 'write_file',
                                path: path,
                                content: content,
                                writeMod: writeMode
                            })
                        });
                        
                        if (!response.ok) {
                            throw new Error(`FileSystem.write: 从 PHP 服务写入文件失败: ${path}`);
                        }
                        const result = await response.json();
                        if (result.status === 'success') {
                            return true;
                        }
                        throw new Error(`FileSystem.write: PHP 服务返回错误: ${result.message || '未知错误'}`);
                    }
                    
                    // 检查目录节点是否存在
                    // 如果 dirPath 是根目录（如 "D:"），使用 separateName 作为路径
                    let actualDirPath = dirPath;
                    if (dirPath === diskName) {
                        actualDirPath = nodeTree.separateName || diskName;
                    }
                    
                    let dirNode = nodeTree.getNode(actualDirPath);
                    if (!dirNode) {
                        // 如果目录节点不存在，且是根目录，尝试确保根节点存在
                        if (actualDirPath === nodeTree.separateName && !nodeTree.initialized) {
                            throw new Error(`FileSystem.write: 磁盘分区未初始化: ${diskName}`);
                        }
                        
                        // 尝试自动创建不存在的目录
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('ProcessManager', `FileSystem.write: 目录不存在，尝试自动创建: ${actualDirPath}`);
                        }
                        
                        try {
                            // 解析目录路径，逐级创建
                            // 规范化路径：移除双斜杠，过滤空部分
                            const normalizedPath = actualDirPath.replace(/\/+/g, '/').replace(/\/$/, '');
                            const pathParts = normalizedPath.split('/').filter(p => p);
                            
                            // 移除盘符和 separateName（如果存在）
                            const basePath = nodeTree.separateName || diskName;
                            const dirParts = pathParts.filter(p => p !== diskName && p !== nodeTree.separateName);
                            
                            let currentPath = basePath;
                            
                            for (const dirName of dirParts) {
                                // 构建检查路径
                                const checkPath = currentPath === basePath ? 
                                    `${basePath}/${dirName}` : 
                                    `${currentPath}/${dirName}`;
                                
                                const checkNode = nodeTree.getNode(checkPath);
                                if (!checkNode) {
                                    // 目录不存在，创建它
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.debug('ProcessManager', `FileSystem.write: 创建目录: ${checkPath}`);
                                    }
                                    
                                    // 使用 nodeTree.create_dir 创建目录
                                    if (typeof nodeTree.create_dir === 'function') {
                                        await nodeTree.create_dir(currentPath, dirName);
                                    } else {
                                        // 如果 create_dir 不可用，通过 PHP 服务创建
                                        const phpPath = currentPath === basePath ? diskName : currentPath;
                                        const url = new URL('/service/FSDirve.php', window.location.origin);
                                        url.searchParams.set('action', 'create_dir');
                                        url.searchParams.set('path', phpPath);
                                        url.searchParams.set('name', dirName);
                                        
                                        const createResponse = await fetch(url.toString());
                                        if (!createResponse.ok) {
                                            const createResult = await createResponse.json();
                                            throw new Error(`创建目录失败: ${createResult.message || '未知错误'}`);
                                        }
                                        
                                        // 手动在 nodeTree 中添加节点
                                        const FileTypeRef = typeof FileType !== 'undefined' ? FileType : null;
                                        if (FileTypeRef && typeof Node !== 'undefined' && nodeTree.optNode) {
                                            const parentNode = nodeTree.getNode(currentPath);
                                            if (parentNode) {
                                                const newNode = new Node(dirName, {
                                                    parent: currentPath,
                                                    name: dirName,
                                                });
                                                nodeTree.optNode(FileTypeRef.DIR_OPS.CREATE, currentPath, newNode);
                                            }
                                        }
                                    }
                                }
                                
                                // 更新当前路径
                                currentPath = checkPath;
                            }
                            
                            // 重新检查目录节点（使用规范化后的路径）
                            const finalDirPath = dirParts.length === 0 ? basePath : `${basePath}/${dirParts.join('/')}`;
                            const finalDirNode = nodeTree.getNode(finalDirPath);
                            if (!finalDirNode) {
                                // 如果仍然不存在，记录警告但继续（可能是 nodeTree 同步问题）
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ProcessManager', `FileSystem.write: 目录创建后仍无法找到节点: ${finalDirPath}，将尝试继续写入`);
                                }
                                // 即使找不到节点，也更新 actualDirPath，后续会通过 PHP 服务写入
                                actualDirPath = finalDirPath;
                            } else {
                                // 更新 actualDirPath 为实际创建的路径
                                actualDirPath = finalDirPath;
                            }
                        } catch (createError) {
                            // 如果创建目录失败，记录错误并抛出
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ProcessManager', `FileSystem.write: 自动创建目录失败: ${actualDirPath}`, createError);
                            }
                            throw new Error(`FileSystem.write: 目录不存在且无法创建: ${actualDirPath}，错误: ${createError.message}`);
                        }
                    }
                    
                    // 重新获取目录节点（可能在创建目录后已更新）
                    dirNode = nodeTree.getNode(actualDirPath);
                    if (!dirNode) {
                        // 如果仍然找不到节点，可能是 nodeTree 同步问题，尝试通过 PHP 服务直接写入
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ProcessManager', `FileSystem.write: 无法找到目录节点: ${actualDirPath}，将通过 PHP 服务直接写入`);
                        }
                        // 通过 PHP 服务直接写入文件
                        const url = new URL('/service/FSDirve.php', window.location.origin);
                        url.searchParams.set('action', 'write_file');
                        url.searchParams.set('path', dirPath);
                        url.searchParams.set('fileName', fileName);
                        url.searchParams.set('writeMod', writeMode.toLowerCase());
                        
                        const response = await fetch(url.toString(), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                                action: 'write_file',
                                path: dirPath,
                                fileName: fileName,
                                content: typeof content === 'string' ? content : JSON.stringify(content),
                                writeMod: writeMode.toLowerCase()
                            })
                        });
                        
                        if (!response.ok) {
                            throw new Error(`FileSystem.write: 从 PHP 服务写入文件失败: ${path}`);
                        }
                        const result = await response.json();
                        if (result.status === 'success') {
                            return true;
                        }
                        throw new Error(`FileSystem.write: PHP 服务返回错误: ${result.message || '未知错误'}`);
                    }
                    
                    // 检查文件是否存在，如果不存在则先创建
                    if (!dirNode.attributes[fileName]) {
                        // 文件不存在，先创建文件
                        const FileTypeRef = typeof FileType !== 'undefined' ? FileType : null;
                        let fileObj = null;
                        
                        if (FileTypeRef && typeof FileFormwork !== 'undefined') {
                            try {
                                const fileType = FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0;
                                const fileAttributes = FileTypeRef.FILE_ATTRIBUTES ? FileTypeRef.FILE_ATTRIBUTES.NORMAL : null;
                                fileObj = new FileFormwork(
                                    fileType,
                                    fileName,
                                    '',
                                    `${actualDirPath}/${fileName}`,
                                    fileAttributes
                                );
                            } catch (e) {
                                // 如果 FileFormwork 创建失败，使用降级方案
                                fileObj = {
                                    fileName: fileName,
                                    fileSize: 0,
                                    fileContent: [],
                                    filePath: `${actualDirPath}/${fileName}`,
                                    fileBelongDisk: diskName,
                                    inited: true,
                                    fileCreatTime: new Date().getTime(),
                                    fileModifyTime: new Date().getTime(),
                                    readFile() { 
                                        return this.fileContent.join('\n') + (this.fileContent.length ? '\n' : ''); 
                                    },
                                    writeFile(newContent, writeMod) {
                                        const appendMode = FileTypeRef && FileTypeRef.WRITE_MODES ? FileTypeRef.WRITE_MODES.APPEND : 1;
                                        if (writeMod === appendMode) {
                                            for (const line of newContent.split(/\n/)) {
                                                this.fileContent.push(line);
                                            }
                                            this.fileSize += newContent.length;
                                        } else {
                                            this.fileContent = [];
                                            for (const line of newContent.split(/\n/)) {
                                                this.fileContent.push(line);
                                            }
                                            this.fileSize = newContent.length;
                                        }
                                        this.fileModifyTime = new Date().getTime();
                                    }
                                };
                            }
                        } else {
                            // 降级方案：创建简单的文件对象
                            fileObj = {
                                fileName: fileName,
                                fileSize: 0,
                                fileContent: [],
                                filePath: `${actualDirPath}/${fileName}`,
                                fileBelongDisk: diskName,
                                inited: true,
                                fileCreatTime: new Date().getTime(),
                                fileModifyTime: new Date().getTime(),
                                readFile() { 
                                    return this.fileContent.join('\n') + (this.fileContent.length ? '\n' : ''); 
                                },
                                writeFile(newContent, writeMod) {
                                    if (writeMod === 1) { // APPEND
                                        for (const line of newContent.split(/\n/)) {
                                            this.fileContent.push(line);
                                        }
                                        this.fileSize += newContent.length;
                                    } else {
                                        this.fileContent = [];
                                        for (const line of newContent.split(/\n/)) {
                                            this.fileContent.push(line);
                                        }
                                        this.fileSize = newContent.length;
                                    }
                                    this.fileModifyTime = new Date().getTime();
                                }
                            };
                        }
                        
                        // 创建文件（使用实际目录路径）
                        await nodeTree.create_file(actualDirPath, fileObj);
                    }
                    
                    // 将内容转换为字符串
                    const contentStr = typeof content === 'string' ? content : String(content);
                    
                    // 获取写入模式
                    let writeMod = null;
                    if (typeof FileType !== 'undefined' && FileType.WRITE_MODES) {
                        writeMod = FileType.WRITE_MODES[writeMode] || FileType.WRITE_MODES.OVERWRITE;
                    }
                    
                    // 写入文件（使用实际目录路径）
                    await nodeTree.write_file(actualDirPath, fileName, contentStr, writeMod);
                    
                    return true;
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ProcessManager', `FileSystem.write 失败: ${error.message}`, { path });
                    }
                    throw error;
                }
            },
            'FileSystem.create': async (type, path) => {
                if (!type || typeof type !== 'string') {
                    throw new Error('FileSystem.create: type 必须是字符串 (directory 或 file)');
                }
                if (!path || typeof path !== 'string') {
                    throw new Error('FileSystem.create: path 必须是字符串');
                }
                
                try {
                    // 解析路径
                    const parts = path.split('/');
                    const diskName = parts[0];
                    const itemName = parts[parts.length - 1];
                    const parentPath = parts.slice(0, -1).join('/') || diskName;
                    
                    // 获取磁盘分区
                    if (typeof Disk === 'undefined') {
                        throw new Error('FileSystem.create: Disk 模块未加载');
                    }
                    
                    // 检查分区是否存在（同时检查 diskSeparateMap 和 diskSeparateSize）
                    const diskMap = Disk.diskSeparateMap;
                    const diskSize = Disk.diskSeparateSize;
                    const hasPartition = (diskMap && diskMap.has(diskName)) || 
                                       (diskSize && diskSize.has(diskName));
                    if (!hasPartition) {
                        throw new Error(`FileSystem.create: 磁盘分区不存在: ${diskName}`);
                    }
                    
                    // 尝试获取 nodeTree（可能不存在或未初始化）
                    let nodeTree = diskMap && diskMap.has(diskName) ? diskMap.get(diskName) : null;
                    
                    // 如果 nodeTree 不存在或未初始化，尝试从 PHP 服务重建
                    if (!nodeTree || !nodeTree.initialized) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('ProcessManager', `FileSystem.create: 磁盘分区 ${diskName} 的 nodeTree 不可靠，尝试从 PHP 服务重建`);
                        }
                        
                        // 如果 nodeTree 不存在，尝试创建它
                        if (!nodeTree && typeof NodeTreeCollection !== 'undefined') {
                            try {
                                nodeTree = new NodeTreeCollection(diskName);
                                // 将新的 nodeTree 添加到 diskMap
                                if (diskMap) {
                                    diskMap.set(diskName, nodeTree);
                                }
                                // 注册到 POOL
                                if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                                    try {
                                        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                                            POOL.__INIT__("KERNEL_GLOBAL_POOL");
                                        }
                                        POOL.__ADD__("KERNEL_GLOBAL_POOL", diskName, nodeTree);
                                    } catch (e) {
                                        KernelLogger.warn('ProcessManager', `注册 nodeTree 到 POOL 失败: ${diskName}`);
                                    }
                                }
                            } catch (e) {
                                KernelLogger.error('ProcessManager', `创建 nodeTree 失败: ${diskName}`, e);
                            }
                        }
                        
                        // 如果 nodeTree 存在但未初始化，尝试从 PHP 服务重建
                        if (nodeTree && typeof nodeTree._rebuildFromPHP === 'function') {
                            try {
                                await nodeTree._rebuildFromPHP();
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.info('ProcessManager', `FileSystem.create: 从 PHP 服务重建 nodeTree 成功: ${diskName}`);
                                }
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ProcessManager', `FileSystem.create: 从 PHP 服务重建 nodeTree 失败: ${diskName}，将通过 PHP 服务直接创建`, e);
                                }
                            }
                        }
                    }
                    
                    // 规范化路径
                    let phpPath = parentPath;
                    if (/^[CD]:$/.test(phpPath)) {
                        phpPath = phpPath + '/';
                    }
                    
                    // 使用 PHP 服务创建
                    const url = new URL('/service/FSDirve.php', window.location.origin);
                    if (type === 'directory') {
                        url.searchParams.set('action', 'create_dir');
                        url.searchParams.set('path', phpPath);
                        url.searchParams.set('name', itemName);
                    } else if (type === 'file') {
                        url.searchParams.set('action', 'create_file');
                        url.searchParams.set('path', phpPath);
                        url.searchParams.set('fileName', itemName);
                        url.searchParams.set('content', '');
                    } else {
                        throw new Error(`FileSystem.create: 无效的类型: ${type} (必须是 directory 或 file)`);
                    }
                    
                    const response = await fetch(url.toString());
                    
                    if (!response.ok) {
                        const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                        throw new Error(errorResult.message || `HTTP ${response.status}`);
                    }
                    
                    const result = await response.json();
                    
                    if (result.status !== 'success') {
                        throw new Error(result.message || '创建失败');
                    }
                    
                    // 如果创建成功，还需要在 nodeTree 中创建对应的节点（如果 nodeTree 存在）
                    if (type === 'directory' && nodeTree) {
                        try {
                            // 检查目录是否已经在 nodeTree 中存在
                            const fullPath = path;
                            if (!nodeTree.hasNode(fullPath)) {
                                // 目录不存在，手动在 nodeTree 中添加节点（不调用 create_dir，因为 PHP 已经创建了）
                                const FileTypeRef = typeof FileType !== 'undefined' ? FileType : null;
                                if (FileTypeRef && typeof Node !== 'undefined' && nodeTree.optNode) {
                                    // 检查父目录节点是否存在
                                    // 如果 parentPath 是根目录（如 "D:"），使用 separateName 作为父路径
                                    let actualParentPath = parentPath;
                                    if (parentPath === diskName) {
                                        // 父路径是根目录，使用 nodeTree 的 separateName
                                        actualParentPath = nodeTree.separateName || diskName;
                                    }
                                    
                                    // 如果 actualParentPath 是根目录，确保使用正确的根节点路径
                                    if (actualParentPath === nodeTree.separateName) {
                                        // 根节点应该总是存在，直接使用 separateName
                                        const rootNode = nodeTree.getNode(nodeTree.separateName);
                                        if (rootNode) {
                                            const newNode = new Node(itemName, {
                                                parent: nodeTree.separateName,
                                                name: itemName
                                            });
                                            nodeTree.optNode(FileTypeRef.DIR_OPS.CREATE, nodeTree.separateName, newNode);
                                            if (typeof KernelLogger !== 'undefined') {
                                                KernelLogger.debug('ProcessManager', `FileSystem.create: 在 nodeTree 中添加目录节点: ${fullPath}`);
                                            }
                                        } else {
                                            // 根节点不存在，记录警告但不抛出错误（因为 PHP 已经创建成功）
                                            if (typeof KernelLogger !== 'undefined') {
                                                KernelLogger.warn('ProcessManager', `FileSystem.create: 根节点不存在: ${nodeTree.separateName}，nodeTree.initialized=${nodeTree.initialized}，跳过 nodeTree 节点创建`);
                                            }
                                        }
                                    } else {
                                        const parentNode = nodeTree.getNode(actualParentPath);
                                        if (parentNode) {
                                            const newNode = new Node(itemName, {
                                                parent: actualParentPath,
                                                name: itemName
                                            });
                                            nodeTree.optNode(FileTypeRef.DIR_OPS.CREATE, actualParentPath, newNode);
                                            if (typeof KernelLogger !== 'undefined') {
                                                KernelLogger.debug('ProcessManager', `FileSystem.create: 在 nodeTree 中添加目录节点: ${fullPath}`);
                                            }
                                        } else {
                                            // 父目录节点不存在，记录警告但不抛出错误（因为 PHP 已经创建成功）
                                            if (typeof KernelLogger !== 'undefined') {
                                                KernelLogger.warn('ProcessManager', `FileSystem.create: 父目录节点不存在: ${actualParentPath}，跳过 nodeTree 节点创建`);
                                            }
                                        }
                                    }
                                } else {
                                    // 如果 Node 类不可用，尝试使用 create_dir（它会处理已存在的目录）
                                    // 但 create_dir 会再次尝试通过 PHP 创建，所以我们需要确保它不会失败
                                    try {
                                        // 如果 parentPath 是根目录，使用 nodeTree 的 separateName
                                        let actualParentPath = parentPath;
                                        if (parentPath === diskName) {
                                            actualParentPath = nodeTree.separateName || diskName;
                                        }
                                        await nodeTree.create_dir(actualParentPath, itemName);
                                    } catch (createDirError) {
                                        // create_dir 可能会因为目录已存在而失败，这是正常的
                                        if (typeof KernelLogger !== 'undefined') {
                                            KernelLogger.debug('ProcessManager', `FileSystem.create: nodeTree.create_dir 失败（可能因为目录已存在）: ${createDirError.message}`);
                                        }
                                    }
                                }
                            } else {
                                // 目录已存在，记录调试信息
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug('ProcessManager', `FileSystem.create: 目录已在 nodeTree 中存在: ${fullPath}`);
                                }
                            }
                        } catch (e) {
                            // 如果 nodeTree 创建失败，记录警告但不抛出错误（因为 PHP 已经创建成功）
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ProcessManager', `FileSystem.create: nodeTree 创建目录节点失败: ${e.message}`, { path });
                            }
                        }
                    } else if (type === 'file' && nodeTree) {
                        try {
                            // 如果 parentPath 是根目录（如 "D:"），使用 separateName 作为路径
                            let actualParentPath = parentPath;
                            if (parentPath === diskName) {
                                actualParentPath = nodeTree.separateName || diskName;
                            }
                            
                            // 检查父目录节点是否存在
                            const parentNode = nodeTree.getNode(actualParentPath);
                            if (!parentNode) {
                                // 父目录节点不存在，记录警告但不抛出错误（因为 PHP 已经创建成功）
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ProcessManager', `FileSystem.create: 父目录节点不存在: ${actualParentPath}，跳过 nodeTree 文件创建`);
                                }
                            } else {
                                // 创建文件对象
                                const FileTypeRef = typeof FileType !== 'undefined' ? FileType : null;
                                let fileObj = null;
                                
                                if (FileTypeRef && typeof FileFormwork !== 'undefined') {
                                    try {
                                        const fileType = FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0;
                                        const fileAttributes = FileTypeRef.FILE_ATTRIBUTES ? FileTypeRef.FILE_ATTRIBUTES.NORMAL : null;
                                        fileObj = new FileFormwork(
                                            fileType,
                                            itemName,
                                            '',
                                            `${actualParentPath}/${itemName}`,
                                            fileAttributes
                                        );
                                    } catch (e) {
                                        // 降级方案
                                        fileObj = {
                                            fileName: itemName,
                                            fileSize: 0,
                                            fileContent: [],
                                            filePath: `${actualParentPath}/${itemName}`,
                                            fileBelongDisk: diskName,
                                            inited: true,
                                            fileCreatTime: new Date().getTime(),
                                            fileModifyTime: new Date().getTime(),
                                            readFile() { 
                                                return this.fileContent.join('\n') + (this.fileContent.length ? '\n' : ''); 
                                            },
                                            writeFile(newContent, writeMod) {
                                                if (writeMod === 1) { // APPEND
                                                    for (const line of newContent.split(/\n/)) {
                                                        this.fileContent.push(line);
                                                    }
                                                    this.fileSize += newContent.length;
                                                } else {
                                                    this.fileContent = [];
                                                    for (const line of newContent.split(/\n/)) {
                                                        this.fileContent.push(line);
                                                    }
                                                    this.fileSize = newContent.length;
                                                }
                                                this.fileModifyTime = new Date().getTime();
                                            }
                                        };
                                    }
                                } else {
                                    // 降级方案
                                    fileObj = {
                                        fileName: itemName,
                                        fileSize: 0,
                                        fileContent: [],
                                        filePath: `${actualParentPath}/${itemName}`,
                                        fileBelongDisk: diskName,
                                        inited: true,
                                        fileCreatTime: new Date().getTime(),
                                        fileModifyTime: new Date().getTime(),
                                        readFile() { 
                                            return this.fileContent.join('\n') + (this.fileContent.length ? '\n' : ''); 
                                        },
                                        writeFile(newContent, writeMod) {
                                            if (writeMod === 1) { // APPEND
                                                for (const line of newContent.split(/\n/)) {
                                                    this.fileContent.push(line);
                                                }
                                                this.fileSize += newContent.length;
                                            } else {
                                                this.fileContent = [];
                                                for (const line of newContent.split(/\n/)) {
                                                    this.fileContent.push(line);
                                                }
                                                this.fileSize = newContent.length;
                                            }
                                            this.fileModifyTime = new Date().getTime();
                                        }
                                    };
                                }
                                
                                await nodeTree.create_file(actualParentPath, fileObj);
                            }
                        } catch (e) {
                            // 如果 nodeTree 创建失败，记录警告但不抛出错误（因为 PHP 已经创建成功）
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ProcessManager', `FileSystem.create: nodeTree 创建文件失败: ${e.message}`, { path });
                            }
                        }
                    }
                    
                    return { status: 'success', data: result.data };
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ProcessManager', `FileSystem.create 失败: ${error.message}`, { type, path });
                    }
                    throw error;
                }
            },
            'FileSystem.delete': async (path) => {
                if (!path || typeof path !== 'string') {
                    throw new Error('FileSystem.delete: path 必须是字符串');
                }
                
                try {
                    // 解析路径
                    const pathParts = path.split('/');
                    const itemName = pathParts[pathParts.length - 1];
                    const parentPath = pathParts.slice(0, -1).join('/') || (path.split(':')[0] + ':');
                    
                    // 规范化路径
                    let phpPath = parentPath;
                    if (/^[CD]:$/.test(phpPath)) {
                        phpPath = phpPath + '/';
                    }
                    
                    // 使用 PHP 服务删除
                    const url = new URL('/service/FSDirve.php', window.location.origin);
                    
                    // 先检查是文件还是目录（通过尝试列出目录）
                    try {
                        const checkUrl = new URL('/service/FSDirve.php', window.location.origin);
                        checkUrl.searchParams.set('action', 'list_dir');
                        checkUrl.searchParams.set('path', phpPath);
                        
                        const checkResponse = await fetch(checkUrl.toString());
                        if (checkResponse.ok) {
                            const checkResult = await checkResponse.json();
                            if (checkResult.status === 'success' && checkResult.data && checkResult.data.items) {
                                const item = checkResult.data.items.find(i => i.path === path || i.name === itemName);
                                if (item && item.type === 'directory') {
                                    // 是目录，使用递归删除
                                    url.searchParams.set('action', 'delete_dir_recursive');
                                    url.searchParams.set('path', path);
                                } else {
                                    // 是文件
                                    url.searchParams.set('action', 'delete_file');
                                    url.searchParams.set('path', phpPath);
                                    url.searchParams.set('fileName', itemName);
                                }
                            } else {
                                // 默认尝试删除文件
                                url.searchParams.set('action', 'delete_file');
                                url.searchParams.set('path', phpPath);
                                url.searchParams.set('fileName', itemName);
                            }
                        } else {
                            // 默认尝试删除文件
                            url.searchParams.set('action', 'delete_file');
                            url.searchParams.set('path', phpPath);
                            url.searchParams.set('fileName', itemName);
                        }
                    } catch (e) {
                        // 检查失败，默认尝试删除文件
                        url.searchParams.set('action', 'delete_file');
                        url.searchParams.set('path', phpPath);
                        url.searchParams.set('fileName', itemName);
                    }
                    
                    const response = await fetch(url.toString());
                    
                    if (!response.ok) {
                        const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                        throw new Error(errorResult.message || `HTTP ${response.status}`);
                    }
                    
                    const result = await response.json();
                    
                    if (result.status !== 'success') {
                        throw new Error(result.message || '删除失败');
                    }
                    
                    return { status: 'success', data: result.data };
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ProcessManager', `FileSystem.delete 失败: ${error.message}`, { path });
                    }
                    throw error;
                }
            },
            'FileSystem.list': async (path) => {
                if (!path || typeof path !== 'string') {
                    throw new Error('FileSystem.list: 路径必须是字符串');
                }
                
                try {
                    // 解析路径：格式为 "盘符/路径" 或 "盘符"
                    // 处理可能的双斜杠情况：C://path -> C:/path
                    let normalizedPath = path.replace(/([CD]:)\/\/+/g, '$1/');
                    const parts = normalizedPath.split('/');
                    const diskName = parts[0];
                    const dirPath = normalizedPath;
                    
                    // 获取磁盘分区
                    if (typeof Disk === 'undefined') {
                        throw new Error('FileSystem.list: Disk 模块未加载');
                    }
                    
                    const diskMap = Disk.diskSeparateMap;
                    
                    // 调试信息：检查磁盘映射表
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ProcessManager', `FileSystem.list: 路径=${path}, 规范化路径=${normalizedPath}, 盘符=${diskName}, 磁盘映射表大小=${diskMap.size}`);
                        if (diskMap.size > 0) {
                            const diskNames = Array.from(diskMap.keys());
                            KernelLogger.debug('ProcessManager', `FileSystem.list: 可用的磁盘分区: ${diskNames.join(', ')}`);
                        }
                    }
                    
                    // 如果磁盘映射表为空，直接从 PHP 服务获取数据（不尝试重新初始化，避免重复格式化）
                    if (diskMap.size === 0) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('ProcessManager', `磁盘映射表为空，直接从 PHP 服务获取目录列表: ${dirPath}`);
                        }
                        
                        try {
                            const phpServiceUrl = "/service/FSDirve.php";
                            const listUrl = new URL(phpServiceUrl, window.location.origin);
                            listUrl.searchParams.set('action', 'list_dir');
                            listUrl.searchParams.set('path', dirPath);
                            
                            const response = await fetch(listUrl.toString(), {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (response.ok) {
                                const phpResult = await response.json();
                                if (phpResult.status === 'success' && phpResult.data && phpResult.data.items) {
                                    // 从 PHP 服务获取到的数据
                                    const phpItems = phpResult.data.items || [];
                                    
                                    // 从 PHP 服务数据构建结果
                                    const files = phpItems.filter(item => item.type === 'file').map(item => ({
                                        name: item.name,
                                        size: item.size || 0,
                                        path: item.path || `${dirPath}/${item.name}`,
                                        type: 'file'
                                    }));
                                    
                                    const dirs = phpItems.filter(item => item.type === 'directory').map(item => ({
                                        name: item.name,
                                        path: item.path || `${dirPath}/${item.name}`,
                                        type: 'directory'
                                    }));
                                    
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.info('ProcessManager', `从 PHP 服务获取目录列表成功，文件数: ${files.length}, 目录数: ${dirs.length}`);
                                    }
                                    
                                    return {
                                        path: dirPath,
                                        files: files,
                                        directories: dirs
                                    };
                                } else {
                                    throw new Error(phpResult?.message || 'PHP 服务返回失败');
                                }
                            } else {
                                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                            }
                        } catch (phpError) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ProcessManager', `从 PHP 服务获取目录列表失败: ${phpError.message}`, {
                                    path: dirPath,
                                    error: phpError.stack
                                });
                            }
                            throw new Error(`FileSystem.list: 磁盘映射表为空且无法从 PHP 服务获取数据: ${phpError.message}`);
                        }
                    }
                    
                    if (!diskMap.has(diskName)) {
                        const availableDisks = Array.from(diskMap.keys()).join(', ') || '无';
                        throw new Error(`FileSystem.list: 磁盘分区不存在: ${diskName} (可用分区: ${availableDisks})`);
                    }
                    
                    let nodeTree = diskMap.get(diskName);
                    
                    // 如果 nodeTree 不存在或未初始化，尝试从 PHP 服务重建
                    if (!nodeTree || !nodeTree.initialized) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('ProcessManager', `FileSystem.list: 磁盘分区 ${diskName} 的 nodeTree 不可靠，尝试从 PHP 服务重建`);
                        }
                        
                        // 如果 nodeTree 不存在，尝试创建它
                        if (!nodeTree && typeof NodeTreeCollection !== 'undefined') {
                            try {
                                nodeTree = new NodeTreeCollection(diskName);
                                // 将新的 nodeTree 添加到 diskMap
                                diskMap.set(diskName, nodeTree);
                                // 注册到 POOL
                                if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                                    try {
                                        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                                            POOL.__INIT__("KERNEL_GLOBAL_POOL");
                                        }
                                        POOL.__ADD__("KERNEL_GLOBAL_POOL", diskName, nodeTree);
                                    } catch (e) {
                                        KernelLogger.warn('ProcessManager', `注册 nodeTree 到 POOL 失败: ${diskName}`);
                                    }
                                }
                            } catch (e) {
                                KernelLogger.error('ProcessManager', `创建 nodeTree 失败: ${diskName}`, e);
                            }
                        }
                        
                        // 如果 nodeTree 存在但未初始化，尝试从 PHP 服务重建
                        if (nodeTree && typeof nodeTree._rebuildFromPHP === 'function') {
                            try {
                                await nodeTree._rebuildFromPHP();
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.info('ProcessManager', `FileSystem.list: 从 PHP 服务重建 nodeTree 成功: ${diskName}`);
                                }
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ProcessManager', `FileSystem.list: 从 PHP 服务重建 nodeTree 失败: ${diskName}，将从 PHP 服务直接获取列表`, e);
                                }
                            }
                        }
                    }
                    
                    // 如果 nodeTree 仍然不存在或未初始化，直接从 PHP 服务获取列表
                    if (!nodeTree || !nodeTree.initialized) {
                        // 从 PHP 服务直接获取目录列表
                        const phpServiceUrl = "/service/FSDirve.php";
                        const listUrl = new URL(phpServiceUrl, window.location.origin);
                        listUrl.searchParams.set('action', 'list_dir');
                        listUrl.searchParams.set('path', dirPath);
                        
                        const response = await fetch(listUrl.toString(), {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (response.ok) {
                            const phpResult = await response.json();
                            if (phpResult.status === 'success' && phpResult.data && phpResult.data.items) {
                                // 从 PHP 服务获取到的数据
                                const phpItems = phpResult.data.items || [];
                                
                                // 从 PHP 服务数据构建结果
                                const files = phpItems.filter(item => item.type === 'file').map(item => ({
                                    name: item.name,
                                    size: item.size || 0,
                                    type: 'file'
                                }));
                                
                                const directories = phpItems.filter(item => item.type === 'directory').map(item => ({
                                    name: item.name,
                                    type: 'directory'
                                }));
                                
                                return {
                                    files: files,
                                    directories: directories
                                };
                            }
                        }
                        
                        throw new Error(`FileSystem.list: 无法从 PHP 服务获取目录列表: ${dirPath}`);
                    }
                    
                    // 检查节点是否存在
                    const targetNode = nodeTree.nodes.get(dirPath);
                    
                    // 如果节点不存在，直接尝试从 PHP 服务获取目录列表
                    if (!targetNode) {
                        // 节点不存在，尝试从 PHP 服务获取
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ProcessManager', `NodeTree 中找不到节点 ${dirPath}，尝试从 PHP 服务获取`);
                        }
                        
                        try {
                            const phpServiceUrl = "/service/FSDirve.php";
                            const listUrl = new URL(phpServiceUrl, window.location.origin);
                            listUrl.searchParams.set('action', 'list_dir');
                            listUrl.searchParams.set('path', dirPath);
                            
                            const response = await fetch(listUrl.toString(), {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (response.ok) {
                                const phpResult = await response.json();
                                if (phpResult.status === 'success' && phpResult.data && phpResult.data.items) {
                                    // 从 PHP 服务获取到的数据
                                    const phpItems = phpResult.data.items || [];
                                    
                                    // 从 PHP 服务数据构建结果
                                    const files = phpItems.filter(item => item.type === 'file').map(item => ({
                                        name: item.name,
                                        size: item.size || 0,
                                        path: item.path || `${dirPath}/${item.name}`,
                                        type: 'file'
                                    }));
                                    
                                    const dirs = phpItems.filter(item => item.type === 'directory').map(item => ({
                                        name: item.name,
                                        path: item.path || `${dirPath}/${item.name}`,
                                        type: 'directory'
                                    }));
                                    
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.debug('ProcessManager', `从 PHP 服务获取目录列表成功，文件数: ${files.length}, 目录数: ${dirs.length}`);
                                    }
                                    
                                    return {
                                        path: dirPath,
                                        files: files,
                                        directories: dirs
                                    };
                                } else {
                                    // PHP 服务返回失败，返回空列表而不是抛出错误
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ProcessManager', `PHP 服务返回失败: ${phpResult?.message || '未知错误'}`);
                                    }
                                    return {
                                        path: dirPath,
                                        files: [],
                                        directories: []
                                    };
                                }
                            } else {
                                // HTTP 错误，返回空列表而不是抛出错误
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ProcessManager', `从 PHP 服务获取目录列表失败: HTTP ${response.status}`);
                                }
                                return {
                                    path: dirPath,
                                    files: [],
                                    directories: []
                                };
                            }
                        } catch (phpError) {
                            // PHP 服务调用失败，返回空列表而不是抛出错误
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ProcessManager', `从 PHP 服务获取目录列表异常: ${phpError.message}`);
                            }
                            return {
                                path: dirPath,
                                files: [],
                                directories: []
                            };
                        }
                    }
                    
                    // 节点存在，从 NodeTree 列出文件和目录
                    let files = nodeTree.list_file(dirPath) || [];
                    let dirs = nodeTree.list_dir(dirPath) || [];
                    
                    // 如果列表为空，尝试从 PHP 服务获取（可能是新创建的目录）
                    const isEmpty = (!files || files.length === 0) && (!dirs || dirs.length === 0);
                    
                    if (isEmpty) {
                        // 列表为空，尝试从 PHP 服务获取（可能是新创建的目录或文件系统不同步）
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ProcessManager', `NodeTree 中节点 ${dirPath} 列表为空，尝试从 PHP 服务获取`);
                        }
                        
                        try {
                            const phpServiceUrl = "/service/FSDirve.php";
                            const listUrl = new URL(phpServiceUrl, window.location.origin);
                            listUrl.searchParams.set('action', 'list_dir');
                            listUrl.searchParams.set('path', dirPath);
                            
                            const response = await fetch(listUrl.toString(), {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (response.ok) {
                                const phpResult = await response.json();
                                if (phpResult.status === 'success' && phpResult.data && phpResult.data.items) {
                                    // 从 PHP 服务获取到的数据
                                    const phpItems = phpResult.data.items || [];
                                    
                                    // 从 PHP 服务数据构建结果
                                    files = phpItems.filter(item => item.type === 'file').map(item => ({
                                        name: item.name,
                                        size: item.size || 0,
                                        path: item.path || `${dirPath}/${item.name}`,
                                        type: 'file'
                                    }));
                                    
                                    dirs = phpItems.filter(item => item.type === 'directory').map(item => ({
                                        name: item.name,
                                        path: item.path || `${dirPath}/${item.name}`,
                                        type: 'directory'
                                    }));
                                    
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.info('ProcessManager', `从 PHP 服务获取目录列表成功，文件数: ${files.length}, 目录数: ${dirs.length}`);
                                    }
                                } else {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ProcessManager', `PHP 服务返回失败: ${phpResult?.message || '未知错误'}`);
                                    }
                                }
                            } else {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ProcessManager', `PHP 服务请求失败: ${response.status} ${response.statusText}`);
                                }
                            }
                        } catch (phpError) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ProcessManager', `从 PHP 服务获取目录列表失败: ${phpError.message}`, { 
                                    path: dirPath,
                                    error: phpError.stack 
                                });
                            }
                            // 继续使用空的文件/目录列表
                        }
                    } else if (!targetNode) {
                        // 节点不存在但列表不为空（不应该发生，但记录一下）
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ProcessManager', `节点 ${dirPath} 不存在，但列表不为空（文件: ${files?.length || 0}, 目录: ${dirs?.length || 0}）`);
                        }
                    }
                    
                    // 格式化结果
                    const result = {
                        path: dirPath,
                        files: files.map(f => ({
                            name: f.name,
                            size: f.size || 0,
                            path: f.path || `${dirPath}/${f.name}`,
                            type: 'file'
                        })),
                        directories: dirs.map(d => ({
                            name: d.name,
                            path: d.path || `${dirPath}/${d.name}`,
                            type: 'directory'
                        }))
                    };
                    
                    return result;
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ProcessManager', `FileSystem.list 失败: ${error.message}`, { path });
                    }
                    throw error;
                }
            },
            
            // 通知API
            'Notification.create': async (pid, options) => {
                if (typeof NotificationManager === 'undefined') {
                    throw new Error('NotificationManager 模块未加载');
                }
                if (!options || typeof options !== 'object') {
                    throw new Error('Notification.create: options 必须是对象');
                }
                
                // 转换参数格式（从 ProcessManager API 格式转换为 NotificationManager 格式）
                const notificationOptions = {
                    type: options.type || 'snapshot',
                    title: options.title,
                    content: options.message || options.content || '',
                    duration: options.duration || 0,
                    onClose: options.onClose
                };
                
                // 调用 NotificationManager.createNotification
                const notificationId = await NotificationManager.createNotification(pid, notificationOptions);
                return { status: 'success', data: { id: notificationId } };
            },
            'Notification.remove': async (pid, notificationId) => {
                if (typeof NotificationManager === 'undefined') {
                    throw new Error('NotificationManager 模块未加载');
                }
                if (!notificationId || typeof notificationId !== 'string') {
                    throw new Error('Notification.remove: notificationId 必须是字符串');
                }
                
                NotificationManager.removeNotification(notificationId);
                return { status: 'success' };
            },
            
            // 事件API
            'Event.register': async (pid, eventType, handler, options) => {
                if (typeof EventManager === 'undefined') {
                    throw new Error('EventManager 模块未加载');
                }
                if (!eventType || typeof eventType !== 'string') {
                    throw new Error('Event.register: eventType 必须是字符串');
                }
                if (!handler || typeof handler !== 'function') {
                    throw new Error('Event.register: handler 必须是函数');
                }
                
                const handlerId = EventManager.registerEventHandler(pid, eventType, handler, options || {});
                return { status: 'success', data: { handlerId } };
            },
            'Event.unregister': async (pid, handlerId) => {
                if (typeof EventManager === 'undefined') {
                    throw new Error('EventManager 模块未加载');
                }
                if (!handlerId || typeof handlerId !== 'number') {
                    throw new Error('Event.unregister: handlerId 必须是数字');
                }
                
                EventManager.unregisterEventHandler(handlerId);
                return { status: 'success' };
            },
            'Event.unregisterAll': async (pid) => {
                if (typeof EventManager === 'undefined') {
                    throw new Error('EventManager 模块未加载');
                }
                
                EventManager.unregisterAllHandlersForPid(pid);
                return { status: 'success' };
            },
            
            // 内存管理API
            'Memory.allocate': async (pid, heapSize, shedSize) => {
                return ProcessManager.allocateMemory(pid, heapSize, shedSize);
            },
            'Memory.free': async (pid, refId) => {
                return ProcessManager.freeMemoryRef(pid, refId);
            },
            
            // 日志API
            'Logger.log': async (level, subsystem, message, meta) => {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.log(level, subsystem, message, meta);
                }
            },
            
            // 动态模块API
            'DynamicModule.request': async (pid, moduleName) => {
                return await ProcessManager.requestDynamicModule(pid, moduleName);
            },
            
            // 本地存储API
            'LocalStorage.register': async (pid, key, defaultValue) => {
                return await ProcessManager.requestLocalStorage(pid, 'register', key, defaultValue);
            },
            'LocalStorage.get': async (pid, key) => {
                return await ProcessManager.requestLocalStorage(pid, 'get', key);
            },
            'LocalStorage.set': async (pid, key, value) => {
                return await ProcessManager.requestLocalStorage(pid, 'set', key, value);
            },
            'LocalStorage.delete': async (pid, key) => {
                return await ProcessManager.requestLocalStorage(pid, 'delete', key);
            },
            
            // 网络信息API
            'Network.getInfo': async () => {
                return await ProcessManager.getNetworkInfo();
            },
            'Network.getState': async () => {
                return await ProcessManager.getNetworkState();
            },
            'Network.isOnline': async () => {
                return await ProcessManager.isNetworkOnline();
            },
            'Network.getConnectionInfo': async () => {
                return await ProcessManager.getNetworkConnectionInfo();
            },
            'Network.enable': async () => {
                return await ProcessManager.enableNetwork();
            },
            'Network.disable': async () => {
                return await ProcessManager.disableNetwork();
            },
            'Network.toggle': async () => {
                return await ProcessManager.toggleNetwork();
            },
            
            // 电池信息API
            'Battery.getInfo': async () => {
                return await ProcessManager.getBatteryInfo();
            },
            
            // 主题管理API
            'Theme.getCurrent': async () => {
                return ProcessManager.getCurrentTheme();
            },
            'Theme.getAll': async () => {
                return ProcessManager.getAllThemes();
            },
            'Theme.get': async (themeId) => {
                return ProcessManager.getTheme(themeId);
            },
            'Theme.set': async (themeId) => {
                return await ProcessManager.setTheme(themeId);
            },
            // 风格管理API
            'Style.getCurrent': async () => {
                return ProcessManager.getCurrentStyle();
            },
            'Style.getAll': async () => {
                return ProcessManager.getAllStyles();
            },
            'Style.get': async (styleId) => {
                return ProcessManager.getStyle(styleId);
            },
            'Style.set': async (styleId) => {
                return await ProcessManager.setStyle(styleId);
            },
            // 桌面背景图管理API
            'DesktopBackground.getCurrent': async () => {
                return ProcessManager.getCurrentDesktopBackground();
            },
            'DesktopBackground.getAll': async () => {
                return ProcessManager.getAllDesktopBackgrounds();
            },
            'DesktopBackground.get': async (backgroundId) => {
                return ProcessManager.getDesktopBackground(backgroundId);
            },
            'DesktopBackground.set': async (backgroundId) => {
                return await ProcessManager.setDesktopBackground(backgroundId);
            },
            // 动画预设管理API
            'AnimationPreset.getCurrent': async () => {
                return ProcessManager.getCurrentAnimationPreset();
            },
            'AnimationPreset.getAll': async () => {
                return ProcessManager.getAllAnimationPresets();
            },
            'AnimationPreset.get': async (presetId) => {
                return ProcessManager.getAnimationPreset(presetId);
            },
            'AnimationPreset.set': async (presetId) => {
                return await ProcessManager.setAnimationPreset(presetId);
            },
            
            // 桌面管理API
            'Desktop.addShortcut': async (options) => {
                if (typeof DesktopManager === 'undefined') {
                    throw new Error('DesktopManager 未加载');
                }
                return DesktopManager.addShortcut(options);
            },
            'Desktop.removeShortcut': async (iconId) => {
                if (typeof DesktopManager === 'undefined') {
                    throw new Error('DesktopManager 未加载');
                }
                DesktopManager.removeShortcut(iconId);
                return true;
            },
            'Desktop.getIcons': async () => {
                if (typeof DesktopManager === 'undefined') {
                    throw new Error('DesktopManager 未加载');
                }
                return DesktopManager.getIcons();
            },
            'Desktop.getConfig': async () => {
                if (typeof DesktopManager === 'undefined') {
                    throw new Error('DesktopManager 未加载');
                }
                return DesktopManager.getConfig();
            },
            'Desktop.setArrangementMode': async (mode) => {
                if (typeof DesktopManager === 'undefined') {
                    throw new Error('DesktopManager 未加载');
                }
                DesktopManager.setArrangementMode(mode);
                return true;
            },
            'Desktop.setIconSize': async (size) => {
                if (typeof DesktopManager === 'undefined') {
                    throw new Error('DesktopManager 未加载');
                }
                DesktopManager.setIconSize(size);
                return true;
            },
            'Desktop.setAutoArrange': async (autoArrange) => {
                if (typeof DesktopManager === 'undefined') {
                    throw new Error('DesktopManager 未加载');
                }
                DesktopManager.setAutoArrange(autoArrange);
                return true;
            },
            'Desktop.refresh': async () => {
                if (typeof DesktopManager === 'undefined') {
                    throw new Error('DesktopManager 未加载');
                }
                DesktopManager.refresh();
                return true;
            },
            
            // 任务栏固定程序管理 API
            'Taskbar.pinProgram': async (programName) => {
                if (typeof TaskbarManager === 'undefined') {
                    throw new Error('TaskbarManager 未加载');
                }
                if (!programName || typeof programName !== 'string') {
                    throw new Error('Taskbar.pinProgram: 程序名称必须是字符串');
                }
                return await TaskbarManager.pinProgram(programName);
            },
            'Taskbar.unpinProgram': async (programName) => {
                if (typeof TaskbarManager === 'undefined') {
                    throw new Error('TaskbarManager 未加载');
                }
                if (!programName || typeof programName !== 'string') {
                    throw new Error('Taskbar.unpinProgram: 程序名称必须是字符串');
                }
                return await TaskbarManager.unpinProgram(programName);
            },
            'Taskbar.getPinnedPrograms': async () => {
                if (typeof TaskbarManager === 'undefined') {
                    throw new Error('TaskbarManager 未加载');
                }
                return await TaskbarManager.getPinnedPrograms();
            },
            'Taskbar.isPinned': async (programName) => {
                if (typeof TaskbarManager === 'undefined') {
                    throw new Error('TaskbarManager 未加载');
                }
                if (!programName || typeof programName !== 'string') {
                    throw new Error('Taskbar.isPinned: 程序名称必须是字符串');
                }
                return await TaskbarManager.isPinned(programName);
            },
            'Taskbar.setPinnedPrograms': async (programNames) => {
                if (typeof TaskbarManager === 'undefined') {
                    throw new Error('TaskbarManager 未加载');
                }
                if (!Array.isArray(programNames)) {
                    throw new Error('Taskbar.setPinnedPrograms: 程序名称列表必须是数组');
                }
                return await TaskbarManager.setPinnedPrograms(programNames);
            },
            
            // 多线程API
            'Multithreading.createThread': async (pid) => {
                if (typeof MultithreadingDrive === 'undefined') {
                    throw new Error('MultithreadingDrive 模块未加载');
                }
                return MultithreadingDrive.createThread(pid);
            },
            'Multithreading.executeTask': async (pid, script, args = []) => {
                if (typeof MultithreadingDrive === 'undefined') {
                    throw new Error('MultithreadingDrive 模块未加载');
                }
                if (!script || typeof script !== 'string') {
                    throw new Error('Multithreading.executeTask: script 必须是字符串');
                }
                if (!Array.isArray(args)) {
                    throw new Error('Multithreading.executeTask: args 必须是数组');
                }
                return await MultithreadingDrive.executeTask(pid, script, args);
            },
            'Multithreading.getPoolStatus': async () => {
                if (typeof MultithreadingDrive === 'undefined') {
                    throw new Error('MultithreadingDrive 模块未加载');
                }
                return MultithreadingDrive.getPoolStatus();
            },
            
            // 拖拽API
            'Drag.createSession': async (pid, sourceElementSelector, dragType, dragData = {}, options = {}) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (!sourceElementSelector || typeof sourceElementSelector !== 'string') {
                    throw new Error('Drag.createSession: sourceElementSelector 必须是字符串选择器');
                }
                if (!Object.values(DragDrive.DRAG_TYPE).includes(dragType)) {
                    throw new Error(`Drag.createSession: 无效的拖拽类型: ${dragType}`);
                }
                
                // 查找源元素
                const sourceElement = document.querySelector(sourceElementSelector);
                if (!sourceElement) {
                    throw new Error(`Drag.createSession: 找不到元素: ${sourceElementSelector}`);
                }
                
                return DragDrive.createDragSession(pid, sourceElement, dragType, dragData, options);
            },
            'Drag.enable': async (dragId) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (!dragId || typeof dragId !== 'string') {
                    throw new Error('Drag.enable: dragId 必须是字符串');
                }
                return DragDrive.enableDrag(dragId);
            },
            'Drag.disable': async (dragId) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (!dragId || typeof dragId !== 'string') {
                    throw new Error('Drag.disable: dragId 必须是字符串');
                }
                DragDrive.disableDrag(dragId);
                return true;
            },
            'Drag.destroySession': async (dragId) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (!dragId || typeof dragId !== 'string') {
                    throw new Error('Drag.destroySession: dragId 必须是字符串');
                }
                DragDrive.destroyDragSession(dragId);
                return true;
            },
            'Drag.getSession': async (dragId) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (!dragId || typeof dragId !== 'string') {
                    throw new Error('Drag.getSession: dragId 必须是字符串');
                }
                return DragDrive.getDragSession(dragId);
            },
            'Drag.registerDropZone': async (dropZoneSelector, options = {}) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (!dropZoneSelector || typeof dropZoneSelector !== 'string') {
                    throw new Error('Drag.registerDropZone: dropZoneSelector 必须是字符串选择器');
                }
                
                // 查找放置区域元素
                const element = document.querySelector(dropZoneSelector);
                if (!element) {
                    throw new Error(`Drag.registerDropZone: 找不到元素: ${dropZoneSelector}`);
                }
                
                return DragDrive.registerDropZone(element, options);
            },
            'Drag.unregisterDropZone': async (dropZoneSelector) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (!dropZoneSelector || typeof dropZoneSelector !== 'string') {
                    throw new Error('Drag.unregisterDropZone: dropZoneSelector 必须是字符串选择器');
                }
                
                // 查找放置区域元素
                const element = document.querySelector(dropZoneSelector);
                if (!element) {
                    throw new Error(`Drag.unregisterDropZone: 找不到元素: ${dropZoneSelector}`);
                }
                
                DragDrive.unregisterDropZone(element);
                return true;
            },
            'Drag.createFileDrag': async (pid, sourceElementSelector, filePaths, options = {}) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (!sourceElementSelector || typeof sourceElementSelector !== 'string') {
                    throw new Error('Drag.createFileDrag: sourceElementSelector 必须是字符串选择器');
                }
                if (!Array.isArray(filePaths)) {
                    throw new Error('Drag.createFileDrag: filePaths 必须是数组');
                }
                
                // 查找源元素
                const sourceElement = document.querySelector(sourceElementSelector);
                if (!sourceElement) {
                    throw new Error(`Drag.createFileDrag: 找不到元素: ${sourceElementSelector}`);
                }
                
                const dragData = {
                    filePaths: filePaths,
                    type: 'file'
                };
                
                return DragDrive.createDragSession(pid, sourceElement, DragDrive.DRAG_TYPE.FILE, dragData, options);
            },
            'Drag.createWindowDrag': async (pid, sourceElementSelector, windowId, options = {}) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (!sourceElementSelector || typeof sourceElementSelector !== 'string') {
                    throw new Error('Drag.createWindowDrag: sourceElementSelector 必须是字符串选择器');
                }
                if (!windowId || typeof windowId !== 'string') {
                    throw new Error('Drag.createWindowDrag: windowId 必须是字符串');
                }
                
                // 查找源元素
                const sourceElement = document.querySelector(sourceElementSelector);
                if (!sourceElement) {
                    throw new Error(`Drag.createWindowDrag: 找不到元素: ${sourceElementSelector}`);
                }
                
                const dragData = {
                    windowId: windowId,
                    type: 'window'
                };
                
                return DragDrive.createDragSession(pid, sourceElement, DragDrive.DRAG_TYPE.WINDOW, dragData, options);
            },
            'Drag.getProcessDrags': async (pid) => {
                if (typeof DragDrive === 'undefined') {
                    throw new Error('DragDrive 模块未加载');
                }
                if (typeof pid !== 'number') {
                    throw new Error('Drag.getProcessDrags: pid 必须是数字');
                }
                return DragDrive.getProcessDrags(pid);
            },
            
            // 地理位置API
            'Geography.getCurrentPosition': async (options = {}) => {
                if (typeof GeographyDrive === 'undefined') {
                    throw new Error('GeographyDrive 模块未加载');
                }
                if (options && typeof options !== 'object') {
                    throw new Error('Geography.getCurrentPosition: options 必须是对象');
                }
                return await GeographyDrive.getCurrentPosition(options);
            },
            'Geography.clearCache': async () => {
                if (typeof GeographyDrive === 'undefined') {
                    throw new Error('GeographyDrive 模块未加载');
                }
                GeographyDrive.clearCache();
                return true;
            },
            'Geography.isSupported': async () => {
                if (typeof GeographyDrive === 'undefined') {
                    throw new Error('GeographyDrive 模块未加载');
                }
                return GeographyDrive.isSupported();
            },
            'Geography.getCachedLocation': async () => {
                if (typeof GeographyDrive === 'undefined') {
                    throw new Error('GeographyDrive 模块未加载');
                }
                return GeographyDrive.getCachedLocation();
            },
            
            // 缓存API
            'Cache.set': async (key, value, options = {}) => {
                if (typeof CacheDrive === 'undefined') {
                    throw new Error('CacheDrive 模块未加载');
                }
                if (!key || typeof key !== 'string') {
                    throw new Error('Cache.set: key 必须是字符串');
                }
                // 如果 options 中没有指定 pid，使用调用者的 pid
                const finalOptions = typeof options === 'object' && options !== null ? { ...options } : {};
                if (pid !== null && pid !== undefined && finalOptions.pid === undefined) {
                    finalOptions.pid = pid;
                }
                return await CacheDrive.set(key, value, finalOptions);
            },
            'Cache.get': async (key, defaultValue = null, options = {}) => {
                if (typeof CacheDrive === 'undefined') {
                    throw new Error('CacheDrive 模块未加载');
                }
                if (!key || typeof key !== 'string') {
                    throw new Error('Cache.get: key 必须是字符串');
                }
                // 如果 options 中没有指定 pid，使用调用者的 pid
                const finalOptions = typeof options === 'object' && options !== null ? { ...options } : {};
                if (pid !== null && pid !== undefined && finalOptions.pid === undefined) {
                    finalOptions.pid = pid;
                }
                return await CacheDrive.get(key, defaultValue, finalOptions);
            },
            'Cache.has': async (key, options = {}) => {
                if (typeof CacheDrive === 'undefined') {
                    throw new Error('CacheDrive 模块未加载');
                }
                if (!key || typeof key !== 'string') {
                    throw new Error('Cache.has: key 必须是字符串');
                }
                // 如果 options 中没有指定 pid，使用调用者的 pid
                const finalOptions = typeof options === 'object' && options !== null ? { ...options } : {};
                if (pid !== null && pid !== undefined && finalOptions.pid === undefined) {
                    finalOptions.pid = pid;
                }
                return await CacheDrive.has(key, finalOptions);
            },
            'Cache.delete': async (key, options = {}) => {
                if (typeof CacheDrive === 'undefined') {
                    throw new Error('CacheDrive 模块未加载');
                }
                if (!key || typeof key !== 'string') {
                    throw new Error('Cache.delete: key 必须是字符串');
                }
                // 如果 options 中没有指定 pid，使用调用者的 pid
                const finalOptions = typeof options === 'object' && options !== null ? { ...options } : {};
                if (pid !== null && pid !== undefined && finalOptions.pid === undefined) {
                    finalOptions.pid = pid;
                }
                return await CacheDrive.delete(key, finalOptions);
            },
            'Cache.clear': async (options = {}) => {
                if (typeof CacheDrive === 'undefined') {
                    throw new Error('CacheDrive 模块未加载');
                }
                // 如果 options 中没有指定 pid，使用调用者的 pid
                const finalOptions = typeof options === 'object' && options !== null ? { ...options } : {};
                if (pid !== null && pid !== undefined && finalOptions.pid === undefined) {
                    finalOptions.pid = pid;
                }
                return await CacheDrive.clear(finalOptions);
            },
            'Cache.getStats': async (options = {}) => {
                if (typeof CacheDrive === 'undefined') {
                    throw new Error('CacheDrive 模块未加载');
                }
                // 如果 options 中没有指定 pid，使用调用者的 pid
                const finalOptions = typeof options === 'object' && options !== null ? { ...options } : {};
                if (pid !== null && pid !== undefined && finalOptions.pid === undefined) {
                    finalOptions.pid = pid;
                }
                return await CacheDrive.getStats(finalOptions);
            },
            
            // 加密API
            'Crypt.generateKeyPair': async (options) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return await CryptDrive.generateKeyPair(options || {});
            },
            'Crypt.importKeyPair': async (publicKey, privateKey, options) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return await CryptDrive.importKeyPair(publicKey, privateKey, options || {});
            },
            'Crypt.getKeyInfo': async (keyId) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.getKeyInfo(keyId);
            },
            'Crypt.listKeys': async () => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.listKeys();
            },
            'Crypt.deleteKey': async (keyId) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return await CryptDrive.deleteKey(keyId);
            },
            'Crypt.setDefaultKey': async (keyId) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return await CryptDrive.setDefaultKey(keyId);
            },
            'Crypt.encrypt': async (data, keyId, publicKey) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.encrypt(data, keyId, publicKey);
            },
            'Crypt.decrypt': async (encryptedData, keyId, privateKey) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.decrypt(encryptedData, keyId, privateKey);
            },
            'Crypt.md5': async (data) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return await CryptDrive.md5(data);
            },
            'Crypt.randomInt': async (min, max) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.randomInt(min, max);
            },
            'Crypt.randomFloat': async (min, max) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.randomFloat(min, max);
            },
            'Crypt.randomBoolean': async () => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.randomBoolean();
            },
            'Crypt.randomString': async (length, charset) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.randomString(length, charset);
            },
            'Crypt.randomChoice': async (array) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.randomChoice(array);
            },
            'Crypt.shuffle': async (array) => {
                if (typeof CryptDrive === 'undefined') {
                    throw new Error('CryptDrive 模块未加载');
                }
                return CryptDrive.shuffle(array);
            },
            
            // 其他API可以在这里添加
        };
        
        const apiHandler = kernelAPIs[apiName];
        if (!apiHandler) {
            const availableAPIs = Object.keys(kernelAPIs).join(', ');
            const errorMsg = `Unknown kernel API: ${apiName}. Available APIs: ${availableAPIs}`;
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('ProcessManager', errorMsg, { apiName, availableAPIs });
            }
            throw new Error(errorMsg);
        }
        
        try {
            // 某些 API 需要 pid 作为第一个参数
            if (pid !== null && (
                apiName === 'Notification.create' || 
                apiName === 'Notification.remove' ||
                apiName === 'Event.register' ||
                apiName === 'Event.unregister' ||
                apiName === 'Event.unregisterAll'
            )) {
                // 这些 API 需要 pid 作为第一个参数
                return await apiHandler(pid, ...args);
            }
            return await apiHandler(...args);
        } catch (error) {
            // 增强错误信息
            const errorMsg = `Kernel API调用失败: ${apiName} - ${error.message}`;
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('ProcessManager', errorMsg, { apiName, args, error: error.message, stack: error.stack });
            }
            throw new Error(errorMsg);
        }
    }
    
    /**
     * 请求本地存储操作（供程序调用）
     * 
     * 程序需要本地保存数据时，应通过此方法提交申请到进程管理器。
     * 进程管理器会记录申请，然后转交给 LStorage 执行相应逻辑。
     * 
     * 使用示例：
     * ```javascript
     * // 在程序的 __init__ 方法中保存 pid
     * async __init__(pid, initArgs) {
     *     this.pid = pid;
     *     // ...
     * }
     * 
     * // 注册存储键
     * async initStorage() {
     *     const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
     *     await ProcessManager.callKernelAPI(this.pid, 'LocalStorage.register', ['userSettings', {}]);
     * }
     * 
     * // 读取数据
     * async loadData() {
     *     const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
     *     const data = await ProcessManager.callKernelAPI(this.pid, 'LocalStorage.get', ['userSettings']);
     *     return data;
     * }
     * 
     * // 保存数据
     * async saveData(data) {
     *     const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
     *     await ProcessManager.callKernelAPI(this.pid, 'LocalStorage.set', ['userSettings', data]);
     * }
     * ```
     * 
     * @param {number} pid 进程ID（程序在 __init__ 方法中接收）
     * @param {string} operation 操作类型：'register', 'get', 'set', 'delete'
     * @param {string} key 存储键
     * @param {any} value 存储的值（仅用于 'set' 和 'register' 操作）
     * @returns {Promise<any>} 操作结果
     * @throws {Error} 如果进程不存在或操作失败
     */
    static async requestLocalStorage(pid, operation, key, value = null) {
        ProcessManager._log(2, `进程 ${pid} 请求本地存储操作: ${operation}, Key=${key}`);
        
        // 验证进程
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            ProcessManager._log(1, `进程 ${pid} 不存在`);
            throw new Error(`Process ${pid} does not exist`);
        }
        
        if (processInfo.status !== 'running') {
            ProcessManager._log(1, `进程 ${pid} 状态异常: ${processInfo.status}`);
            throw new Error(`Process ${pid} is not running`);
        }
        
        // 获取 LStorage
        let LStorageRef = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                LStorageRef = POOL.__GET__("KERNEL_GLOBAL_POOL", "LStorage");
            } catch (e) {
                ProcessManager._log(1, `无法从POOL获取LStorage: ${e.message}`);
            }
        }
        
        if (!LStorageRef && typeof LStorage !== 'undefined') {
            LStorageRef = LStorage;
        }
        
        if (!LStorageRef) {
            ProcessManager._log(1, `LStorage 不可用`);
            throw new Error('LStorage is not available');
        }
        
        // 记录程序行为
        ProcessManager._logProgramAction(pid, 'requestLocalStorage', { operation, key });
        
        // 执行操作
        try {
            switch (operation) {
                case 'register':
                    return await LStorageRef.registerProgramStorage(pid, key, value);
                case 'get':
                    return await LStorageRef.getProgramStorage(pid, key);
                case 'set':
                    return await LStorageRef.setProgramStorage(pid, key, value);
                case 'delete':
                    return await LStorageRef.deleteProgramStorage(pid, key);
                default:
                    throw new Error(`Unknown operation: ${operation}`);
            }
        } catch (error) {
            ProcessManager._log(1, `本地存储操作失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 请求动态模块（供程序调用）
     * 
     * 程序需要动态依赖库时，应通过此方法提交申请到进程管理器。
     * 进程管理器会检查模块是否已加载：
     * - 如果已加载，直接返回模块的全局对象
     * - 如果未加载，进行加载，然后返回模块的全局对象
     * 
     * 使用示例：
     * ```javascript
     * // 在程序的 __init__ 方法中保存 pid
     * async __init__(pid, initArgs) {
     *     this.pid = pid;
     *     // ...
     * }
     * 
     * // 在需要时请求动态模块
     * async someMethod() {
     *     // 通过 POOL 获取 ProcessManager
     *     const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
     *     
     *     // 请求 html2canvas 模块
     *     try {
     *         const html2canvas = await ProcessManager.requestDynamicModule(this.pid, 'html2canvas');
     *         // 使用 html2canvas
     *         const canvas = await html2canvas(element);
     *     } catch (error) {
     *         console.error('加载模块失败:', error);
     *     }
     * }
     * ```
     * 
     * @param {number} pid 进程ID（程序在 __init__ 方法中接收）
     * @param {string} moduleName 模块名称（如 'html2canvas'）
     * @returns {Promise<Object|Function>} 返回模块的全局对象
     * @throws {Error} 如果进程不存在、模块不存在或加载失败
     */
    static async requestDynamicModule(pid, moduleName) {
        ProcessManager._log(2, `进程 ${pid} 请求动态模块: ${moduleName}`);
        
        // 验证进程
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            ProcessManager._log(1, `进程 ${pid} 不存在`);
            throw new Error(`Process ${pid} does not exist`);
        }
        
        if (processInfo.status !== 'running') {
            ProcessManager._log(1, `进程 ${pid} 状态异常: ${processInfo.status}`);
            throw new Error(`Process ${pid} is not running`);
        }
        
        // 检查 DynamicManager 是否可用
        if (typeof DynamicManager === 'undefined') {
            ProcessManager._log(1, `DynamicManager 不可用`);
            throw new Error('DynamicManager is not available');
        }
        
        // 检查模块是否存在
        if (!DynamicManager.hasModule(moduleName)) {
            ProcessManager._log(1, `模块 ${moduleName} 不存在`);
            throw new Error(`Dynamic module ${moduleName} does not exist`);
        }
        
        // 记录程序行为
        ProcessManager._logProgramAction(pid, 'requestDynamicModule', { moduleName });
        
        // 检查模块是否已加载
        if (DynamicManager.isModuleLoaded(moduleName)) {
            ProcessManager._log(2, `模块 ${moduleName} 已加载，直接返回`);
            
            // 记录到进程信息中
            if (!processInfo.requestedModules) {
                processInfo.requestedModules = new Set();
            }
            processInfo.requestedModules.add(moduleName);
            
            // 返回模块的全局对象
            const moduleGlobal = DynamicManager.getModuleGlobal(moduleName);
            if (moduleGlobal) {
                return moduleGlobal;
            } else {
                // 如果全局对象不存在，可能需要重新加载
                ProcessManager._log(1, `模块 ${moduleName} 已标记为加载，但全局对象不存在，尝试重新加载`);
            }
        }
        
        // 模块未加载，进行加载
        ProcessManager._log(2, `模块 ${moduleName} 未加载，开始加载`);
        
        try {
            // 通过 DynamicManager 加载模块
            const moduleGlobal = await DynamicManager.loadModule(moduleName, {
                force: false,
                checkDependencies: true
            });
            
            // 记录到进程信息中
            if (!processInfo.requestedModules) {
                processInfo.requestedModules = new Set();
            }
            processInfo.requestedModules.add(moduleName);
            
            ProcessManager._log(2, `模块 ${moduleName} 加载完成，已告知进程 ${pid}`);
            
            return moduleGlobal;
        } catch (error) {
            ProcessManager._log(1, `模块 ${moduleName} 加载失败: ${error.message}`);
            throw new Error(`Failed to load dynamic module ${moduleName}: ${error.message}`);
        }
    }
    
    /**
     * 获取进程请求的动态模块列表
     * @param {number} pid 进程ID
     * @returns {Array<string>} 模块名称数组
     */
    static getRequestedModules(pid) {
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo || !processInfo.requestedModules) {
            return [];
        }
        
        return Array.from(processInfo.requestedModules);
    }
    
    /**
     * 检查进程是否为Exploit程序
     * @param {number} pid 进程ID
     * @returns {boolean}
     */
    static isExploitProcess(pid) {
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        return processInfo ? processInfo.isExploit : false;
    }
    
    /**
     * 获取程序行为记录
     * @param {number} pid 进程ID
     * @param {number} limit 限制返回数量（可选）
     * @returns {Array<Object>}
     */
    static getProgramActions(pid, limit = null) {
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            return [];
        }
        
        const actions = processInfo.actions || [];
        if (limit && limit > 0) {
            return actions.slice(-limit);
        }
        return actions;
    }
    
    /**
     * 注册Exploit程序（进程管理器自身）
     * Exploit程序享有与内核直接通信的权限
     */
    static _registerExploitProgram() {
        const exploitPid = ProcessManager.EXPLOIT_PID;
        const exploitInfo = {
            pid: exploitPid,
            programName: 'exploit',
            programNameUpper: 'EXPLOIT',
            scriptPath: 'builtin',
            status: 'running',
            startTime: Date.now(),
            exitTime: null,
            memoryRefs: new Map(),
            actions: [],
            isExploit: true  // 标记为Exploit程序
        };
        
        try {
            // 清空缓存，确保从内存加载最新的数据
            ProcessManager._processTableCache = null;
            
            // 获取进程表（如果不存在则创建新的）
            const table = ProcessManager.PROCESS_TABLE;
            
            // 检查是否已存在（避免重复注册）
            if (table.has(exploitPid)) {
                const existingInfo = table.get(exploitPid);
                // 验证现有信息是否完整
                if (existingInfo && existingInfo.isExploit && existingInfo.status === 'running') {
                    ProcessManager._log(2, `Exploit程序已存在 (PID: ${exploitPid})，跳过注册`);
                    return;
                } else {
                    // 现有信息不完整，更新它
                    ProcessManager._log(2, `Exploit程序信息不完整，更新信息 (PID: ${exploitPid})`);
                    table.set(exploitPid, exploitInfo);
                }
            } else {
                // 添加Exploit程序到进程表
                table.set(exploitPid, exploitInfo);
                ProcessManager._log(2, `添加Exploit程序到进程表 (PID: ${exploitPid})`);
            }
            
            // 更新缓存
            ProcessManager._processTableCache = table;
            
            // 保存到内存
            ProcessManager._saveProcessTable(table);
            
            // 验证保存是否成功
            ProcessManager._processTableCache = null;  // 清空缓存以验证
            const verifyTable = ProcessManager.PROCESS_TABLE;
            if (verifyTable.has(exploitPid)) {
                ProcessManager._log(2, `Exploit程序已成功保存到内存 (PID: ${exploitPid})`);
            } else {
                ProcessManager._log(1, `Exploit程序保存验证失败 (PID: ${exploitPid})`);
            }
            
            // 恢复缓存
            ProcessManager._processTableCache = table;
            
            // 确保Exploit程序的内存已分配
            if (typeof KernelMemory !== 'undefined') {
                try {
                    // 确保内存已分配（这会调用 MemoryManager.allocateMemory）
                    const memory = KernelMemory._ensureMemory();
                    if (memory && memory.heap && memory.shed) {
                        ProcessManager._log(2, `Exploit程序内存已分配 (PID: ${exploitPid}, Heap: ${memory.heap.heapSize})`);
                    } else {
                        ProcessManager._log(1, `Exploit程序内存分配失败 (PID: ${exploitPid})`);
                    }
                } catch (e) {
                    ProcessManager._log(1, `确保Exploit程序内存失败: ${e.message}`);
                }
            }
            
            // 注册程序名称到MemoryManager
            if (typeof MemoryManager !== 'undefined') {
                try {
                    MemoryManager.registerProgramName(exploitPid, 'exploit');
                    ProcessManager._log(2, `Exploit程序名称已注册到MemoryManager (PID: ${exploitPid})`);
                } catch (e) {
                    ProcessManager._log(1, `注册Exploit程序名称到MemoryManager失败: ${e.message}`);
                }
            }
            
            // 确保 NEXT_PID 从 10001 开始（Exploit 使用 10000）
            if (ProcessManager.NEXT_PID <= ProcessManager.EXPLOIT_PID) {
                ProcessManager.NEXT_PID = ProcessManager.EXPLOIT_PID + 1;
                ProcessManager._log(2, `设置 NEXT_PID 为 ${ProcessManager.NEXT_PID}（Exploit 使用 ${ProcessManager.EXPLOIT_PID}）`);
            }
            
            ProcessManager._log(2, `Exploit程序已注册 (PID: ${exploitPid})`);
        } catch (e) {
            ProcessManager._log(1, `注册Exploit程序失败: ${e.message}`, { error: String(e), stack: e.stack });
            // 即使失败也尝试使用降级方案
            if (!ProcessManager._fallbackProcessTable) {
                ProcessManager._fallbackProcessTable = new Map();
            }
            ProcessManager._fallbackProcessTable.set(exploitPid, exploitInfo);
            
            // 确保 NEXT_PID 从 10001 开始
            if (ProcessManager.NEXT_PID <= ProcessManager.EXPLOIT_PID) {
                ProcessManager.NEXT_PID = ProcessManager.EXPLOIT_PID + 1;
            }
            
            ProcessManager._log(2, `Exploit程序已使用降级方案注册 (PID: ${exploitPid})`);
        }
    }
    
    /**
     * 获取 DOM 快照（用于跟踪新创建的元素）
     * @returns {Set<Element>} 当前所有元素的集合
     */
    static _getDOMSnapshot() {
        if (typeof document === 'undefined' || !document.body) {
            return new Set();
        }
        
        const snapshot = new Set();
        const allElements = document.body.querySelectorAll('*');
        for (const element of allElements) {
            snapshot.add(element);
        }
        return snapshot;
    }
    
    /**
     * 标记程序创建的元素
     * @param {number} pid 进程 ID
     * @param {Set<Element>} snapshotBefore 启动前的 DOM 快照
     */
    static _markProgramElements(pid, snapshotBefore) {
        if (typeof document === 'undefined' || !document.body) {
            return;
        }
        
        const snapshotAfter = ProcessManager._getDOMSnapshot();
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            return;
        }
        
        // 找出新创建的元素
        for (const element of snapshotAfter) {
            if (!snapshotBefore.has(element)) {
                // 标记元素属于这个进程
                if (element.dataset) {
                    element.dataset.pid = pid.toString();
                }
                
                // 添加到进程的 DOM 元素集合
                if (!processInfo.domElements) {
                    processInfo.domElements = new Set();
                }
                processInfo.domElements.add(element);
                ProcessManager._elementToPidMap.set(element, pid);
                
                ProcessManager._log(3, `标记程序元素: ${element.tagName} (PID: ${pid})`);
            }
        }
    }
    
    /**
     * 获取程序创建的所有 GUI 元素
     * @param {number} pid 进程 ID
     * @returns {Array<Element>} DOM 元素数组
     */
    static getProgramGUIElements(pid) {
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo || !processInfo.domElements) {
            return [];
        }
        
        // 过滤出仍然在 DOM 中的元素
        const elements = Array.from(processInfo.domElements).filter(el => {
            return el.parentNode !== null;
        });
        
        return elements;
    }
    
    /**
     * 获取 ApplicationAssetManager（如果可用）
     * @returns {ApplicationAssetManager|null} 应用程序资源管理器
     */
    static getAssetManager() {
        if (typeof ApplicationAssetManager !== 'undefined') {
            return ApplicationAssetManager;
        }
        
        // 尝试从 POOL 获取
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                return POOL.__GET__("KERNEL_GLOBAL_POOL", "ApplicationAssetManager");
            } catch (e) {
                return null;
            }
        }
        
        return null;
    }
    
    /**
     * 获取 NetworkManager 实例（内部方法）
     * @returns {Object|null} NetworkManager 实例
     */
    static _getNetworkManager() {
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
    }
    
    /**
     * 获取网络信息（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<Object>} 网络信息对象
     */
    static async getNetworkInfo(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || processInfo.status !== 'running') {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getNetworkInfo', {});
        }
        
        const networkManager = ProcessManager._getNetworkManager();
        if (!networkManager) {
            // 降级：返回基本网络信息
            return {
                online: typeof navigator !== 'undefined' ? navigator.onLine : false,
                enabled: true,
                connectionInfo: null,
                timestamp: Date.now()
            };
        }
        
        try {
            const connectionInfo = networkManager.getConnectionInfo();
            const isOnline = networkManager.isOnline();
            const isEnabled = networkManager.isNetworkEnabled();
            
            return {
                online: isOnline,
                enabled: isEnabled,
                connectionInfo: connectionInfo,
                navigatorData: networkManager.getAllNavigatorNetworkData(),
                timestamp: Date.now()
            };
        } catch (e) {
            ProcessManager._log(1, `获取网络信息失败: ${e.message}`);
            throw e;
        }
    }
    
    /**
     * 获取网络状态（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Object} 网络状态对象
     */
    static getNetworkState(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || processInfo.status !== 'running') {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getNetworkState', {});
        }
        
        const networkManager = ProcessManager._getNetworkManager();
        if (!networkManager) {
            // 降级：返回基本网络状态
            return {
                online: typeof navigator !== 'undefined' ? navigator.onLine : false,
                enabled: true,
                timestamp: Date.now()
            };
        }
        
        try {
            return networkManager.getNetworkStateSnapshot();
        } catch (e) {
            ProcessManager._log(1, `获取网络状态失败: ${e.message}`);
            throw e;
        }
    }
    
    /**
     * 检查网络是否在线（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {boolean} 是否在线
     */
    static isNetworkOnline(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || processInfo.status !== 'running') {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'isNetworkOnline', {});
        }
        
        const networkManager = ProcessManager._getNetworkManager();
        if (!networkManager) {
            // 降级：使用 navigator.onLine
            return typeof navigator !== 'undefined' ? navigator.onLine : false;
        }
        
        try {
            return networkManager.isOnline();
        } catch (e) {
            ProcessManager._log(1, `检查网络状态失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 获取网络连接信息（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Object|null} 连接信息对象
     */
    static getNetworkConnectionInfo(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || processInfo.status !== 'running') {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getNetworkConnectionInfo', {});
        }
        
        const networkManager = ProcessManager._getNetworkManager();
        if (!networkManager) {
            return null;
        }
        
        try {
            return networkManager.getConnectionInfo();
        } catch (e) {
            ProcessManager._log(1, `获取网络连接信息失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 获取电池信息（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<Object|null>} 电池信息对象
     */
    static async getBatteryInfo(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getBatteryInfo', {});
        }
        
        const networkManager = ProcessManager._getNetworkManager();
        if (!networkManager) {
            // 降级：尝试直接使用 navigator.getBattery
            if (typeof navigator !== 'undefined' && navigator.getBattery) {
                try {
                    const battery = await navigator.getBattery();
                    return {
                        charging: battery.charging,
                        chargingTime: battery.chargingTime,
                        dischargingTime: battery.dischargingTime,
                        level: battery.level
                    };
                } catch (e) {
                    ProcessManager._log(1, `获取电池信息失败: ${e.message}`);
                    return null;
                }
            }
            return null;
        }
        
        try {
            // 检查 getBatteryInfo 方法是否存在
            if (typeof networkManager.getBatteryInfo !== 'function') {
                ProcessManager._log(1, `NetworkManager.getBatteryInfo 不是函数`);
                // 降级：尝试直接使用 navigator.getBattery
                if (typeof navigator !== 'undefined' && navigator.getBattery) {
                    try {
                        const battery = await navigator.getBattery();
                        return {
                            charging: battery.charging,
                            chargingTime: battery.chargingTime,
                            dischargingTime: battery.dischargingTime,
                            level: battery.level
                        };
                    } catch (e) {
                        ProcessManager._log(1, `降级获取电池信息失败: ${e.message}`);
                        return null;
                    }
                }
                return null;
            }
            return await networkManager.getBatteryInfo();
        } catch (e) {
            ProcessManager._log(1, `获取电池信息失败: ${e.message}`);
            // 降级：尝试直接使用 navigator.getBattery
            if (typeof navigator !== 'undefined' && navigator.getBattery) {
                try {
                    const battery = await navigator.getBattery();
                    return {
                        charging: battery.charging,
                        chargingTime: battery.chargingTime,
                        dischargingTime: battery.dischargingTime,
                        level: battery.level
                    };
                } catch (e2) {
                    ProcessManager._log(1, `降级获取电池信息失败: ${e2.message}`);
                    return null;
                }
            }
            return null;
        }
    }
    
    /**
     * 启用网络（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<boolean>} 是否成功
     */
    static async enableNetwork(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || processInfo.status !== 'running') {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'enableNetwork', {});
        }
        
        const networkManager = ProcessManager._getNetworkManager();
        if (!networkManager) {
            ProcessManager._log(1, "NetworkManager 不可用");
            return false;
        }
        
        try {
            networkManager.enableNetwork();
            return true;
        } catch (e) {
            ProcessManager._log(1, `启用网络失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 禁用网络（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<boolean>} 是否成功
     */
    static async disableNetwork(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || processInfo.status !== 'running') {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'disableNetwork', {});
        }
        
        const networkManager = ProcessManager._getNetworkManager();
        if (!networkManager) {
            ProcessManager._log(1, "NetworkManager 不可用");
            return false;
        }
        
        try {
            networkManager.disableNetwork();
            return true;
        } catch (e) {
            ProcessManager._log(1, `禁用网络失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 切换网络状态（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<boolean>} 切换后的状态（true=启用，false=禁用）
     */
    static async toggleNetwork(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || processInfo.status !== 'running') {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'toggleNetwork', {});
        }
        
        const networkManager = ProcessManager._getNetworkManager();
        if (!networkManager) {
            ProcessManager._log(1, "NetworkManager 不可用");
            return false;
        }
        
        try {
            return networkManager.toggleNetwork();
        } catch (e) {
            ProcessManager._log(1, `切换网络状态失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 获取 ThemeManager 实例（内部方法）
     * @returns {Object|null} ThemeManager 实例
     */
    static _getThemeManager() {
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                return POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager");
            } catch (e) {
                // 忽略错误
            }
        }
        // 降级：尝试从全局对象获取
        if (typeof window !== 'undefined' && window.ThemeManager) {
            return window.ThemeManager;
        } else if (typeof globalThis !== 'undefined' && globalThis.ThemeManager) {
            return globalThis.ThemeManager;
        }
        return null;
    }
    
    /**
     * 获取当前主题（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Object|null} 当前主题配置
     */
    static getCurrentTheme(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getCurrentTheme', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return null;
        }
        
        try {
            return themeManager.getCurrentTheme();
        } catch (e) {
            ProcessManager._log(1, `获取当前主题失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 获取当前主题ID（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {string} 当前主题ID
     */
    static getCurrentThemeId(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getCurrentThemeId', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return 'default';
        }
        
        try {
            return themeManager.getCurrentThemeId();
        } catch (e) {
            ProcessManager._log(1, `获取当前主题ID失败: ${e.message}`);
            return 'default';
        }
    }
    
    /**
     * 获取所有主题列表（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Array<Object>} 主题列表
     */
    static getAllThemes(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getAllThemes', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return [];
        }
        
        try {
            return themeManager.getAllThemes();
        } catch (e) {
            ProcessManager._log(1, `获取所有主题失败: ${e.message}`);
            return [];
        }
    }
    
    /**
     * 获取指定主题配置（供程序调用）
     * @param {string} themeId 主题ID
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Object|null} 主题配置
     */
    static getTheme(themeId, pid = null) {
        if (!themeId || typeof themeId !== 'string') {
            throw new Error('themeId 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getTheme', { themeId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return null;
        }
        
        try {
            return themeManager.getTheme(themeId);
        } catch (e) {
            ProcessManager._log(1, `获取主题失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 设置主题（供程序调用）
     * @param {string} themeId 主题ID
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<boolean>} 是否成功
     */
    static async setTheme(themeId, pid = null) {
        if (!themeId || typeof themeId !== 'string') {
            throw new Error('themeId 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'setTheme', { themeId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return false;
        }
        
        try {
            // 确保 ThemeManager 已初始化
            if (!themeManager._initialized) {
                await themeManager.init();
            }
            
            // 检查主题是否存在
            if (!themeManager._themes || !themeManager._themes.has(themeId)) {
                ProcessManager._log(1, `主题不存在: ${themeId}`);
                // 列出所有可用的主题ID用于调试
                if (themeManager._themes) {
                    const availableThemes = Array.from(themeManager._themes.keys());
                    ProcessManager._log(1, `可用主题: ${availableThemes.join(', ')}`);
                }
                return false;
            }
            
            return await themeManager.setTheme(themeId);
        } catch (e) {
            ProcessManager._log(1, `设置主题失败: ${e.message}`);
            KernelLogger.error("ProcessManager", `设置主题失败: ${e.message}`, e);
            return false;
        }
    }
    
    /**
     * 监听主题变更（供程序调用）
     * @param {Function} listener 监听器函数
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Function} 取消监听的函数
     */
    static onThemeChange(listener, pid = null) {
        if (typeof listener !== 'function') {
            throw new Error('listener 必须是函数');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'onThemeChange', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return () => {};
        }
        
        try {
            return themeManager.onThemeChange(listener);
        } catch (e) {
            ProcessManager._log(1, `注册主题变更监听器失败: ${e.message}`);
            return () => {};
        }
    }
    
    /**
     * 获取当前风格ID（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {string} 当前风格ID
     */
    static getCurrentStyleId(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getCurrentStyleId', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return 'ubuntu';
        }
        
        try {
            return themeManager.getCurrentStyleId();
        } catch (e) {
            ProcessManager._log(1, `获取当前风格ID失败: ${e.message}`);
            return 'ubuntu';
        }
    }
    
    /**
     * 获取当前风格配置（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Object|null} 当前风格配置
     */
    static getCurrentStyle(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getCurrentStyle', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return null;
        }
        
        try {
            return themeManager.getCurrentStyle();
        } catch (e) {
            ProcessManager._log(1, `获取当前风格失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 获取所有风格列表（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Array<Object>} 风格列表
     */
    static getAllStyles(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getAllStyles', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return [];
        }
        
        try {
            return themeManager.getAllStyles();
        } catch (e) {
            ProcessManager._log(1, `获取所有风格失败: ${e.message}`);
            return [];
        }
    }
    
    /**
     * 获取指定风格配置（供程序调用）
     * @param {string} styleId 风格ID
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Object|null} 风格配置
     */
    static getStyle(styleId, pid = null) {
        if (!styleId || typeof styleId !== 'string') {
            throw new Error('styleId 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getStyle', { styleId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return null;
        }
        
        try {
            return themeManager.getStyle(styleId);
        } catch (e) {
            ProcessManager._log(1, `获取风格失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 设置风格（供程序调用）
     * @param {string} styleId 风格ID
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<boolean>} 是否成功
     */
    static async setStyle(styleId, pid = null) {
        if (!styleId || typeof styleId !== 'string') {
            throw new Error('styleId 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'setStyle', { styleId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return false;
        }
        
        try {
            // 确保 ThemeManager 已初始化
            if (!themeManager._initialized) {
                await themeManager.init();
            }
            
            return await themeManager.setStyle(styleId);
        } catch (e) {
            ProcessManager._log(1, `设置风格失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 获取当前桌面背景图ID（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {string|null} 当前桌面背景图ID
     */
    static getCurrentDesktopBackground(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getCurrentDesktopBackground', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return null;
        }
        
        try {
            return themeManager.getCurrentDesktopBackground();
        } catch (e) {
            ProcessManager._log(1, `获取当前桌面背景失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 获取所有桌面背景图列表（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Array<Object>} 桌面背景图列表
     */
    static getAllDesktopBackgrounds(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getAllDesktopBackgrounds', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return [];
        }
        
        try {
            return themeManager.getAllDesktopBackgrounds();
        } catch (e) {
            ProcessManager._log(1, `获取所有桌面背景失败: ${e.message}`);
            return [];
        }
    }
    
    /**
     * 获取指定桌面背景图信息（供程序调用）
     * @param {string} backgroundId 背景图ID
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Object|null} 桌面背景图信息
     */
    static getDesktopBackground(backgroundId, pid = null) {
        if (!backgroundId || typeof backgroundId !== 'string') {
            throw new Error('backgroundId 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getDesktopBackground', { backgroundId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return null;
        }
        
        try {
            return themeManager.getDesktopBackground(backgroundId);
        } catch (e) {
            ProcessManager._log(1, `获取桌面背景失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 设置桌面背景图（供程序调用）
     * @param {string} backgroundId 背景图ID
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<boolean>} 是否设置成功
     */
    static async setDesktopBackground(backgroundId, pid = null) {
        if (!backgroundId || typeof backgroundId !== 'string') {
            throw new Error('backgroundId 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'setDesktopBackground', { backgroundId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return false;
        }
        
        try {
            // 确保 ThemeManager 已初始化
            if (!themeManager._initialized) {
                await themeManager.init();
            }
            
            return await themeManager.setDesktopBackground(backgroundId);
        } catch (e) {
            ProcessManager._log(1, `设置桌面背景失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 获取当前动画预设配置（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Object|null} 当前动画预设配置
     */
    static getCurrentAnimationPreset(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getCurrentAnimationPreset', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return null;
        }
        
        try {
            return themeManager.getCurrentAnimationPreset();
        } catch (e) {
            ProcessManager._log(1, `获取当前动画预设失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 获取所有动画预设列表（供程序调用）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Array<Object>} 动画预设列表
     */
    static getAllAnimationPresets(pid = null) {
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getAllAnimationPresets', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return [];
        }
        
        try {
            return themeManager.getAllAnimationPresets();
        } catch (e) {
            ProcessManager._log(1, `获取所有动画预设失败: ${e.message}`);
            return [];
        }
    }
    
    /**
     * 获取指定动画预设配置（供程序调用）
     * @param {string} presetId 预设ID
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Object|null} 动画预设配置
     */
    static getAnimationPreset(presetId, pid = null) {
        if (!presetId || typeof presetId !== 'string') {
            throw new Error('presetId 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getAnimationPreset', { presetId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return null;
        }
        
        try {
            return themeManager.getAnimationPreset(presetId);
        } catch (e) {
            ProcessManager._log(1, `获取动画预设失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 设置动画预设（供程序调用）
     * @param {string} presetId 预设ID
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<boolean>} 是否设置成功
     */
    static async setAnimationPreset(presetId, pid = null) {
        if (!presetId || typeof presetId !== 'string') {
            throw new Error('presetId 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'setAnimationPreset', { presetId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return false;
        }
        
        try {
            // 确保 ThemeManager 已初始化
            if (!themeManager._initialized) {
                await themeManager.init();
            }
            
            return await themeManager.setAnimationPreset(presetId);
        } catch (e) {
            ProcessManager._log(1, `设置动画预设失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 监听动画预设变更（供程序调用）
     * @param {Function} listener 监听器函数
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Function} 取消监听的函数
     */
    static onAnimationPresetChange(listener, pid = null) {
        if (typeof listener !== 'function') {
            throw new Error('listener 必须是函数');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'onAnimationPresetChange', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return () => {};
        }
        
        try {
            return themeManager.onAnimationPresetChange(listener);
        } catch (e) {
            ProcessManager._log(1, `注册动画预设变更监听器失败: ${e.message}`);
            return () => {};
        }
    }
    
    /**
     * 监听风格变更（供程序调用）
     * @param {Function} listener 监听器函数
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Function} 取消监听的函数
     */
    static onStyleChange(listener, pid = null) {
        if (typeof listener !== 'function') {
            throw new Error('listener 必须是函数');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || (processInfo.status !== 'running' && processInfo.status !== 'starting')) {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'onStyleChange', {});
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return () => {};
        }
        
        try {
            return themeManager.onStyleChange(listener);
        } catch (e) {
            ProcessManager._log(1, `注册风格变更监听器失败: ${e.message}`);
            return () => {};
        }
    }
    
    /**
     * 获取系统图标路径（供程序调用）
     * @param {string} iconName 图标名称（如 'network', 'battery'）
     * @param {string} styleId 风格ID（可选，默认使用当前风格）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {string} 图标文件路径
     */
    static getSystemIconPath(iconName, styleId = null, pid = null) {
        if (!iconName || typeof iconName !== 'string') {
            throw new Error('iconName 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || processInfo.status !== 'running') {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getSystemIconPath', { iconName, styleId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return '';
        }
        
        try {
            return themeManager.getSystemIconPath(iconName, styleId);
        } catch (e) {
            ProcessManager._log(1, `获取系统图标路径失败: ${e.message}`);
            return '';
        }
    }
    
    /**
     * 获取系统图标SVG内容（供程序调用）
     * @param {string} iconName 图标名称
     * @param {string} styleId 风格ID（可选，默认使用当前风格）
     * @param {number} pid 进程ID（可选，用于权限检查）
     * @returns {Promise<string>} SVG内容
     */
    static async getSystemIconSVG(iconName, styleId = null, pid = null) {
        if (!iconName || typeof iconName !== 'string') {
            throw new Error('iconName 必须是字符串');
        }
        
        // 如果提供了 PID，验证进程是否存在
        if (pid !== null) {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo || processInfo.status !== 'running') {
                throw new Error(`Process ${pid} does not exist or is not running`);
            }
            ProcessManager._logProgramAction(pid, 'getSystemIconSVG', { iconName, styleId });
        }
        
        const themeManager = ProcessManager._getThemeManager();
        if (!themeManager) {
            ProcessManager._log(1, "ThemeManager 不可用");
            return '';
        }
        
        try {
            return await themeManager.getSystemIconSVG(iconName, styleId);
        } catch (e) {
            ProcessManager._log(1, `获取系统图标SVG失败: ${e.message}`);
            return '';
        }
    }
    
    /**
     * 获取程序信息（通过 __info__ 方法）
     * @param {string} programName 程序名称
     * @returns {Object|null} 程序信息对象
     */
    static getProgramInfo(programName) {
        if (!programName || typeof programName !== 'string') {
            return null;
        }
        
        const programNameUpper = programName.toUpperCase();
        const programClass = (typeof window !== 'undefined' && window[programNameUpper]) || 
                            (typeof globalThis !== 'undefined' && globalThis[programNameUpper]);
        
        if (!programClass) {
            return null;
        }
        
        // 调用程序的 __info__ 方法
        if (typeof programClass.__info__ === 'function') {
            try {
                return programClass.__info__();
            } catch (e) {
                ProcessManager._log(1, `获取程序 ${programName} 信息失败: ${e.message}`);
                return null;
            }
        }
        
        // 如果没有 __info__ 方法，返回基本信息
        return {
            name: programName,
            type: 'UNKNOWN',
            version: 'unknown',
            description: `Program ${programName}`,
            hasInfoMethod: false
        };
    }
    
    /**
     * 检查共享空间的使用情况
     * @returns {Object} 共享空间使用情况报告
     */
    static checkSharedSpace() {
        const sharedSpace = ProcessManager.getSharedSpace();
        if (!sharedSpace) {
            return {
                available: false,
                message: "共享空间不可用"
            };
        }
        
        if (typeof POOL === 'undefined' || typeof POOL.__GET__ !== 'function') {
            return {
                available: false,
                message: "POOL 不可用"
            };
        }
        
        try {
            // 获取共享空间中的所有键
            const sharedPool = POOL.__GET__("APPLICATION_SHARED_POOL");
            const keys = [];
            
            // 尝试获取所有键（如果 POOL 支持）
            if (sharedPool && typeof sharedPool === 'object') {
                for (const key in sharedPool) {
                    if (key !== '__PROCESS_MANAGER__' && !key.startsWith('__')) {
                        keys.push(key);
                    }
                }
            }
            
            return {
                available: true,
                keys: keys,
                keyCount: keys.length,
                message: `共享空间可用，包含 ${keys.length} 个数据项`
            };
        } catch (e) {
            return {
                available: false,
                message: `检查共享空间失败: ${e.message}`
            };
        }
    }
    
    /**
     * 初始化 DOM 观察器（观察 document.body 的变化）
     */
    static _initDOMObserver() {
        if (typeof document === 'undefined' || !document.body) {
            return;
        }
        
        // 如果已经初始化，跳过
        if (ProcessManager._globalDOMObserver) {
            return;
        }
        
        // 创建全局 MutationObserver
        ProcessManager._globalDOMObserver = new MutationObserver((mutations) => {
            // 当 DOM 发生变化时，可以在这里处理
            // 目前主要用于跟踪，不需要特别处理
        });
        
        // 开始观察 document.body
        ProcessManager._globalDOMObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-pid']
        });
        
        ProcessManager._log(2, "DOM 观察器已初始化");
    }
    
    /**
     * 清理程序创建的 GUI 元素
     * @param {number} pid 进程 ID
     */
    static _cleanupGUI(pid) {
        const elements = ProcessManager.getProgramGUIElements(pid);
        for (const element of elements) {
            try {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            } catch (e) {
                ProcessManager._log(1, `清理 GUI 元素失败: ${e.message}`);
            }
        }
        
        // 清理进程的 DOM 元素集合
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (processInfo && processInfo.domElements) {
            processInfo.domElements.clear();
        }
    }
    
    /**
     * 初始化共享空间
     */
    static _initSharedSpace() {
        if (typeof POOL === 'undefined' || typeof POOL.__INIT__ !== 'function') {
            ProcessManager._log(1, "POOL 不可用，无法初始化共享空间");
            return;
        }
        
        // 确保 APPLICATION_SHARED_POOL 类别存在
        if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
            POOL.__INIT__("APPLICATION_SHARED_POOL");
        }
        
        ProcessManager._log(2, "共享空间已初始化");
    }
    
    /**
     * 获取共享空间对象
     * @returns {Object|null} 共享空间对象
     */
    static getSharedSpace() {
        if (typeof POOL === 'undefined' || typeof POOL.__GET__ !== 'function') {
            return null;
        }
        
        try {
            return POOL.__GET__("APPLICATION_SHARED_POOL");
        } catch (e) {
            return null;
        }
    }
    
    /**
     * 获取 GUI 容器（所有 GUI 程序应该在这个容器内渲染）
     * @returns {HTMLElement|null} GUI 容器元素
     */
    static getGUIContainer() {
        if (typeof document === 'undefined') {
            return null;
        }
        
        // 尝试获取 GUI 容器
        let guiContainer = document.getElementById('gui-container');
        
        // 如果不存在，尝试创建（降级方案）
        if (!guiContainer) {
            // 检查沙盒容器是否存在
            const sandboxContainer = document.getElementById('sandbox-container');
            if (sandboxContainer) {
                // 检查内核内容容器
                let kernelContent = document.getElementById('kernel-content');
                if (!kernelContent) {
                    kernelContent = document.createElement('div');
                    kernelContent.id = 'kernel-content';
                    kernelContent.className = 'kernel-content';
                    kernelContent.style.display = 'flex';
                    kernelContent.style.flexDirection = 'column';
                    sandboxContainer.appendChild(kernelContent);
                }
                
                // 创建 GUI 容器
                guiContainer = document.createElement('div');
                guiContainer.id = 'gui-container';
                guiContainer.className = 'gui-container';
                guiContainer.style.flex = '1';
                guiContainer.style.position = 'relative';
                guiContainer.style.overflow = 'hidden';
                guiContainer.style.width = '100%';
                guiContainer.style.height = 'calc(100% - 40px)';
                kernelContent.appendChild(guiContainer);
                
                // 创建任务栏（如果不存在）
                let taskbar = document.getElementById('taskbar');
                if (!taskbar) {
                    taskbar = document.createElement('div');
                    taskbar.id = 'taskbar';
                    taskbar.className = 'taskbar';
                    taskbar.style.position = 'relative';
                    taskbar.style.width = '100%';
                    taskbar.style.height = '40px';
                    taskbar.style.background = 'rgba(0, 0, 0, 0.3)';
                    taskbar.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
                    taskbar.style.display = 'flex';
                    taskbar.style.alignItems = 'center';
                    taskbar.style.padding = '0 10px';
                    taskbar.style.zIndex = '9999';
                    kernelContent.appendChild(taskbar);
                }
                
                ProcessManager._log(2, `已创建 GUI 容器（降级方案）`);
            } else {
                ProcessManager._log(1, `沙盒容器不存在，无法创建 GUI 容器`);
            }
        }
        
        return guiContainer;
    }
    
    /**
     * 在共享空间中设置数据
     * @param {string} key 键名
     * @param {*} value 值
     */
    static setSharedData(key, value) {
        const sharedSpace = ProcessManager.getSharedSpace();
        if (!sharedSpace) {
            ProcessManager._log(1, "共享空间不可用");
            return false;
        }
        
        sharedSpace[key] = value;
        return true;
    }
    
    /**
     * 从共享空间获取数据
     * @param {string} key 键名
     * @returns {*} 值
     */
    static getSharedData(key) {
        const sharedSpace = ProcessManager.getSharedSpace();
        if (!sharedSpace) {
            return null;
        }
        
        return sharedSpace[key];
    }
}

// 不导出到全局作用域，交由POOL管理
// 通过POOL注册（如果POOL已加载）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        // 确保 KERNEL_GLOBAL_POOL 类别存在
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "ProcessManager", ProcessManager);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.ProcessManager = ProcessManager;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.ProcessManager = ProcessManager;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.ProcessManager = ProcessManager;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.ProcessManager = ProcessManager;
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/process/processManager.js");
}


