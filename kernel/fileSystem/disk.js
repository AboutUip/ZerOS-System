KernelLogger.info("Disk", "module init");

class Disk {
    // diskSize = [long] 描述磁盘大小（从 DiskData.json 读取，默认为 3GB）
    static _diskSize = 1024 * 1024 * 1024 * 5; // 5GB 默认值
    
    static get diskSize() {
        return Disk._diskSize;
    }
    
    static set diskSize(value) {
        Disk._diskSize = value;
    }
    
    // 注意：以下数据存储在Exploit内存中
    // diskSeparateMap = [Map<String,NodeTreeCollection>] 描述磁盘分区映射表
    // 注意：NodeTreeCollection对象存储在POOL中，这里只存储分区名称列表
    // diskSeparateSize = [Map<String,long>] 描述磁盘分区大小映射表
    // diskFreeMap = [Map<String,long>] 描述磁盘空闲区映射表
    // diskUsedMap = [Map<String,long>] 描述磁盘已用区映射表
    // canUsed = [bool] 表示磁盘初始化程度
    
    /**
     * 获取磁盘分区映射表（从Exploit内存）
     * 注意：NodeTreeCollection对象从POOL获取，这里只返回分区名称列表
     * @returns {Map<String,NodeTreeCollection>} 磁盘分区映射表
     */
    static _getDiskSeparateMap() {
        if (typeof KernelMemory === 'undefined') {
            if (!Disk._fallbackDiskSeparateMap) {
                Disk._fallbackDiskSeparateMap = new Map();
            }
            return Disk._fallbackDiskSeparateMap;
        }
        
        const data = KernelMemory.loadData('DISK_SEPARATE_MAP');
        if (data) {
            // 从存储的分区名称列表重建Map
            const map = new Map();
            if (Array.isArray(data)) {
                for (const separateName of data) {
                    // 从POOL获取NodeTreeCollection对象
                    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                        try {
                            const coll = POOL.__GET__("KERNEL_GLOBAL_POOL", separateName);
                            if (coll) {
                                map.set(separateName, coll);
                            }
                        } catch (e) {
                            KernelLogger.debug("Disk", `无法从POOL获取分区 ${separateName}`);
                        }
                    }
                }
            }
            return map;
        }
        
        const newMap = new Map();
        Disk._saveDiskSeparateMap(newMap);
        return newMap;
    }
    
    /**
     * 保存磁盘分区映射表（到Exploit内存）
     * 只保存分区名称列表，不保存NodeTreeCollection对象
     * @param {Map<String,NodeTreeCollection>} map 磁盘分区映射表
     */
    static _saveDiskSeparateMap(map) {
        if (typeof KernelMemory === 'undefined') {
            return;
        }
        
        // 只保存分区名称列表
        const names = Array.from(map.keys());
        KernelMemory.saveData('DISK_SEPARATE_MAP', names);
    }
    
    /**
     * 获取磁盘分区映射表（兼容旧代码）
     * @returns {Map<String,NodeTreeCollection>} 磁盘分区映射表
     */
    static get diskSeparateMap() {
        if (Disk._diskSeparateMapCache) {
            return Disk._diskSeparateMapCache;
        }
        
        const map = Disk._getDiskSeparateMap();
        Disk._diskSeparateMapCache = map;
        return map;
    }
    
    /**
     * 获取磁盘分区大小映射表（从Exploit内存）
     * @returns {Map<String,number>} 磁盘分区大小映射表
     */
    static _getDiskSeparateSize() {
        if (typeof KernelMemory === 'undefined') {
            if (!Disk._fallbackDiskSeparateSize) {
                Disk._fallbackDiskSeparateSize = new Map();
            }
            return Disk._fallbackDiskSeparateSize;
        }
        
        const data = KernelMemory.loadData('DISK_SEPARATE_SIZE');
        if (data) {
            const map = new Map();
            if (Array.isArray(data)) {
                for (const [name, size] of data) {
                    map.set(name, size);
                }
            } else if (typeof data === 'object') {
                for (const [name, size] of Object.entries(data)) {
                    map.set(name, size);
                }
            }
            const keys = Array.from(map.keys());
            KernelLogger.debug("Disk", `从 KernelMemory 加载 diskSeparateSize，分区数量: ${map.size}, 分区列表: ${keys.join(', ')}`);
            return map;
        }
        
        KernelLogger.debug("Disk", "KernelMemory 中没有 diskSeparateSize 数据，创建新 Map");
        const newMap = new Map();
        Disk._saveDiskSeparateSize(newMap);
        return newMap;
    }
    
    /**
     * 保存磁盘分区大小映射表（到Exploit内存）
     * @param {Map<String,number>} map 磁盘分区大小映射表
     */
    static _saveDiskSeparateSize(map) {
        if (typeof KernelMemory === 'undefined') {
            return;
        }
        
        const array = Array.from(map.entries());
        KernelMemory.saveData('DISK_SEPARATE_SIZE', array);
    }
    
    /**
     * 获取磁盘分区大小映射表（兼容旧代码）
     * @returns {Map<String,number>} 磁盘分区大小映射表
     */
    static get diskSeparateSize() {
        if (Disk._diskSeparateSizeCache) {
            const keys = Array.from(Disk._diskSeparateSizeCache.keys());
            KernelLogger.debug("Disk", `diskSeparateSize getter (缓存): 分区数量=${Disk._diskSeparateSizeCache.size}, 分区列表=${keys.join(', ')}`);
            return Disk._diskSeparateSizeCache;
        }
        
        const map = Disk._getDiskSeparateSize();
        Disk._diskSeparateSizeCache = map;
        const keys = Array.from(map.keys());
        KernelLogger.debug("Disk", `diskSeparateSize getter (新建): 分区数量=${map.size}, 分区列表=${keys.join(', ')}`);
        return map;
    }
    
    /**
     * 获取磁盘空闲区映射表（从Exploit内存）
     * @returns {Map<String,number>} 磁盘空闲区映射表
     */
    static _getDiskFreeMap() {
        if (typeof KernelMemory === 'undefined') {
            if (!Disk._fallbackDiskFreeMap) {
                Disk._fallbackDiskFreeMap = new Map();
            }
            return Disk._fallbackDiskFreeMap;
        }
        
        const data = KernelMemory.loadData('DISK_FREE_MAP');
        if (data) {
            const map = new Map();
            if (Array.isArray(data)) {
                for (const [name, size] of data) {
                    map.set(name, size);
                }
            } else if (typeof data === 'object') {
                for (const [name, size] of Object.entries(data)) {
                    map.set(name, size);
                }
            }
            return map;
        }
        
        const newMap = new Map();
        Disk._saveDiskFreeMap(newMap);
        return newMap;
    }
    
    /**
     * 保存磁盘空闲区映射表（到Exploit内存）
     * @param {Map<String,number>} map 磁盘空闲区映射表
     */
    static _saveDiskFreeMap(map) {
        if (typeof KernelMemory === 'undefined') {
            return;
        }
        
        const array = Array.from(map.entries());
        KernelMemory.saveData('DISK_FREE_MAP', array);
    }
    
    /**
     * 获取磁盘空闲区映射表（兼容旧代码）
     * @returns {Map<String,number>} 磁盘空闲区映射表
     */
    static get diskFreeMap() {
        if (Disk._diskFreeMapCache) {
            return Disk._diskFreeMapCache;
        }
        
        const map = Disk._getDiskFreeMap();
        Disk._diskFreeMapCache = map;
        return map;
    }
    
    /**
     * 获取磁盘已用区映射表（从Exploit内存）
     * @returns {Map<String,number>} 磁盘已用区映射表
     */
    static _getDiskUsedMap() {
        if (typeof KernelMemory === 'undefined') {
            if (!Disk._fallbackDiskUsedMap) {
                Disk._fallbackDiskUsedMap = new Map();
            }
            return Disk._fallbackDiskUsedMap;
        }
        
        const data = KernelMemory.loadData('DISK_USED_MAP');
        if (data) {
            const map = new Map();
            if (Array.isArray(data)) {
                for (const [name, size] of data) {
                    map.set(name, size);
                }
            } else if (typeof data === 'object') {
                for (const [name, size] of Object.entries(data)) {
                    map.set(name, size);
                }
            }
            return map;
        }
        
        const newMap = new Map();
        Disk._saveDiskUsedMap(newMap);
        return newMap;
    }
    
    /**
     * 保存磁盘已用区映射表（到Exploit内存）
     * @param {Map<String,number>} map 磁盘已用区映射表
     */
    static _saveDiskUsedMap(map) {
        if (typeof KernelMemory === 'undefined') {
            return;
        }
        
        const array = Array.from(map.entries());
        KernelMemory.saveData('DISK_USED_MAP', array);
    }
    
    /**
     * 获取磁盘已用区映射表（兼容旧代码）
     * @returns {Map<String,number>} 磁盘已用区映射表
     */
    static get diskUsedMap() {
        if (Disk._diskUsedMapCache) {
            return Disk._diskUsedMapCache;
        }
        
        const map = Disk._getDiskUsedMap();
        Disk._diskUsedMapCache = map;
        return map;
    }
    
    /**
     * 获取磁盘可用状态（从Exploit内存）
     * @returns {boolean} 磁盘是否可用
     */
    static get canUsed() {
        // 使用缓存避免频繁调用 KernelMemory.loadData
        if (Disk._canUsedCache !== undefined) {
            return Disk._canUsedCache;
        }
        
        if (typeof KernelMemory === 'undefined') {
            if (Disk._fallbackCanUsed === undefined) {
                Disk._fallbackCanUsed = false;
            }
            Disk._canUsedCache = Disk._fallbackCanUsed;
            return Disk._fallbackCanUsed;
        }
        
        const canUsed = KernelMemory.loadData('DISK_CAN_USED');
        const result = canUsed !== null ? canUsed : false;
        Disk._canUsedCache = result;
        return result;
    }
    
    /**
     * 设置磁盘可用状态（保存到Exploit内存）
     * @param {boolean} value 磁盘是否可用
     */
    static set canUsed(value) {
        // 更新缓存
        Disk._canUsedCache = value;
        
        if (typeof KernelMemory === 'undefined') {
            Disk._fallbackCanUsed = value;
            return;
        }
        
        KernelMemory.saveData('DISK_CAN_USED', value);
    }
    
    // 缓存（避免频繁从内存读取）
    static _diskSeparateMapCache = null;
    static _diskSeparateSizeCache = null;
    static _diskFreeMapCache = null;
    static _diskUsedMapCache = null;
    static _canUsedCache = undefined;  // canUsed 缓存
    
    // 降级方案：临时存储
    static _fallbackDiskSeparateMap = null;
    static _fallbackDiskSeparateSize = null;
    static _fallbackDiskFreeMap = null;
    static _fallbackDiskUsedMap = null;
    static _fallbackCanUsed = undefined;

    /**
     * 从DiskData.json加载分区配置（异步）
     * @returns {Promise<Map<string, number>>} 分区名称到大小的映射
     */
    static async _loadPartitionConfig() {
        try {
            // 直接使用fetch读取DiskData.json（不依赖diskSeparateMap，因为此时可能还未初始化）
            // DiskData.json存储在D:分区，如果D:不存在则从第一个可用分区读取
            // 优先尝试从D:读取（系统盘）
            let configUrl = '/system/service/DISK/D/DiskData.json';
            let response = await fetch(configUrl);
            
            // 如果D:不存在，尝试从其他分区读取（A-Z）
            if (!response.ok) {
                for (let i = 0; i < 26; i++) {
                    const letter = String.fromCharCode(65 + i); // A-Z
                    configUrl = `/system/service/DISK/${letter}/DiskData.json`;
                    response = await fetch(configUrl);
                    if (response.ok) {
                        KernelLogger.debug("Disk", `从分区 ${letter}: 读取DiskData.json`);
                        break;
                    }
                }
            }
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.partitions && typeof data.partitions === 'object') {
                    const partitionMap = new Map();
                    // 首先提取所有分区配置
                    const partitionEntries = [];
                    for (const [partitionName, size] of Object.entries(data.partitions)) {
                        // 确保分区名称格式正确（以:结尾）
                        const normalizedName = partitionName.endsWith(':') ? partitionName : partitionName + ':';
                        partitionEntries.push([normalizedName, parseInt(size, 10)]);
                    }
                    // 排序：D: 分区优先（系统盘），然后按字母顺序
                    partitionEntries.sort((a, b) => {
                        const nameA = a[0];
                        const nameB = b[0];
                        // D: 分区始终排在第一位
                        if (nameA === 'D:') return -1;
                        if (nameB === 'D:') return 1;
                        // 其他分区按字母顺序
                        return nameA.localeCompare(nameB);
                    });
                    // 按照排序后的顺序添加到 Map（Map 保持插入顺序）
                    for (const [partitionName, size] of partitionEntries) {
                        partitionMap.set(partitionName, size);
                    }
                    if (data.totalSize) {
                        Disk.diskSize = parseInt(data.totalSize, 10);
                    }
                    KernelLogger.info("Disk", `从DiskData.json加载了 ${partitionMap.size} 个分区配置（按优先级排序）: ${Array.from(partitionMap.keys()).join(', ')}`);
                    return partitionMap;
                }
            } else {
                KernelLogger.debug("Disk", `无法读取DiskData.json: ${response.status} ${response.statusText}`);
            }
        } catch (e) {
            KernelLogger.debug("Disk", `从DiskData.json加载配置失败: ${e.message}`);
        }
        
        // 返回null表示使用默认配置
        return null;
    }
    
    static init() {
        // 初始化磁盘分区
        KernelLogger.info("Disk", "initializing partitions");
        try {
            // 尝试获取 Dependency 实例
            // 优先从 POOL 中获取，如果不可用，则创建新实例
            let Dependency = null;
            
            // 首先尝试从 POOL 中获取
            if (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function') {
                try {
                    Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
                    if (Dependency) {
                        KernelLogger.debug("Disk", "从 POOL 中获取 Dependency 实例");
                    }
                } catch (e) {
                    // POOL 可能还未初始化，忽略错误
                    KernelLogger.debug("Disk", "从 POOL 获取 Dependency 失败，将创建新实例");
                }
            }
            
            // 如果从 POOL 中获取失败，直接创建新实例（DependencyConfig 已在 HTML 中加载）
            if (!Dependency) {
                if (typeof DependencyConfig !== 'undefined') {
                    try {
                        Dependency = new DependencyConfig();
                        KernelLogger.debug("Disk", "创建新的 DependencyConfig 实例");
                    } catch (e) {
                        KernelLogger.warn("Disk", "创建 DependencyConfig 实例失败", String(e));
                    }
                } else {
                    KernelLogger.debug("Disk", "DependencyConfig 类未定义");
                }
            }
            
            // 初始化分区的内部函数
            const initializePartitions = async (partitionConfig) => {
                Disk.canUsed = true;
                
                // 如果提供了分区配置，使用配置；否则使用默认配置
                if (partitionConfig && partitionConfig.size > 0) {
                    KernelLogger.info("Disk", `使用配置的分区: ${Array.from(partitionConfig.keys()).join(', ')}`);
                    for (const [partitionName, size] of partitionConfig) {
                        // 首先检查分区是否已存在于内存中（diskSeparateSize）
                        const diskSeparateSize = Disk.diskSeparateSize;
                        const existingSize = diskSeparateSize.get(partitionName);
                        
                        if (existingSize !== undefined) {
                            // 分区已在内存中存在，但需要确保diskSeparateMap中有对应的NodeTreeCollection
                            KernelLogger.debug("Disk", `分区 ${partitionName} 已在内存中存在 (${existingSize} 字节)`);
                            
                            // 检查大小是否需要更新
                            if (existingSize !== size) {
                                KernelLogger.info("Disk", `更新分区 ${partitionName} 大小: ${existingSize} -> ${size}`);
                                Disk.setMap("diskSeparateSize", partitionName, size);
                                const used = (Disk.diskUsedMap && Disk.diskUsedMap.get(partitionName)) || 0;
                                const free = size - used;
                                Disk.setMap("diskFreeMap", partitionName, free);
                            }
                            
                            // 确保diskSeparateMap中有对应的NodeTreeCollection
                            let coll = Disk.diskSeparateMap.get(partitionName);
                            if (!coll) {
                                // 尝试从POOL获取
                                if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                                    try {
                                        coll = POOL.__GET__("KERNEL_GLOBAL_POOL", partitionName);
                                        if (coll) {
                                            Disk.diskSeparateMap.set(partitionName, coll);
                                            Disk._diskSeparateMapCache = Disk.diskSeparateMap;
                                        }
                                    } catch (e) {
                                        // POOL中没有，需要重新加载分区
                                        const partitionExists = await Disk._checkPartitionExists(partitionName);
                                        if (partitionExists) {
                                            await Disk._loadPartition(partitionName, size);
                                        } else {
                                            KernelLogger.warn("Disk", `分区 ${partitionName} 在内存中存在，但物理文件不存在，尝试重新格式化`);
                                            await Disk.format(partitionName, size);
                                        }
                                    }
                                } else {
                                    // POOL不可用，尝试重新加载分区
                                    const partitionExists = await Disk._checkPartitionExists(partitionName);
                                    if (partitionExists) {
                                        await Disk._loadPartition(partitionName, size);
                                    } else {
                                        KernelLogger.warn("Disk", `分区 ${partitionName} 在内存中存在，但物理文件不存在，尝试重新格式化`);
                                        await Disk.format(partitionName, size);
                                    }
                                }
                            }
                        } else {
                            // 分区在内存中不存在，检查物理分区是否存在
                            const partitionExists = await Disk._checkPartitionExists(partitionName);
                            
                            if (partitionExists) {
                                // 物理分区存在，加载分区
                                KernelLogger.info("Disk", `检测到已存在的物理分区: ${partitionName}，正在加载...`);
                                const loadSuccess = await Disk._loadPartition(partitionName, size);
                                if (!loadSuccess) {
                                    const errorMsg = `分区 ${partitionName} 加载失败`;
                                    if (partitionName === 'D:') {
                                        KernelLogger.error("Disk", `${errorMsg}。D: 是系统盘，必须加载！`);
                                        throw new Error(`${errorMsg}。D: 是系统盘，必须加载！`);
                                    } else {
                                        KernelLogger.warn("Disk", errorMsg);
                                    }
                                }
                            } else {
                                // 物理分区不存在，创建新分区
                                KernelLogger.info("Disk", `初始化新分区: ${partitionName} (${size} 字节)`);
                                try {
                                    await Disk.format(partitionName, size);
                                    // 验证分区是否创建成功
                                    const diskSeparateSizeAfter = Disk.diskSeparateSize;
                                    if (!diskSeparateSizeAfter.has(partitionName)) {
                                        const errorMsg = `分区 ${partitionName} 创建失败（可能空间不足）`;
                                        if (partitionName === 'D:') {
                                            KernelLogger.error("Disk", `${errorMsg}。D: 是系统盘，必须创建！请检查 DiskData.json 中的分区大小配置，确保分区大小总和不超过 totalSize。`);
                                            throw new Error(`${errorMsg}。D: 是系统盘，必须创建！`);
                                        } else {
                                            KernelLogger.warn("Disk", errorMsg);
                                        }
                                    }
                                } catch (error) {
                                    if (partitionName === 'D:') {
                                        KernelLogger.error("Disk", `D: 分区创建失败: ${error.message}。D: 是系统盘，所有系统资源都必须从 D: 加载，必须创建！`);
                                        throw error; // 重新抛出错误，因为 D: 必须创建
                                    } else {
                                        KernelLogger.warn("Disk", `分区 ${partitionName} 创建失败: ${error.message}`);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // 默认配置：C: 1GB, D: 2GB（向后兼容）
                    KernelLogger.info("Disk", "使用默认分区配置: C: (1GB), D: (2GB)");
                    const defaultPartitions = [
                        ["C:", 1024 * 1024 * 1024 * 1], // 1GB
                        ["D:", 1024 * 1024 * 1024 * 2]  // 2GB
                    ];
                    
                    for (const [partitionName, size] of defaultPartitions) {
                        const diskSeparateSize = Disk.diskSeparateSize;
                        const existingSize = diskSeparateSize.get(partitionName);
                        
                        if (existingSize === undefined) {
                            const partitionExists = await Disk._checkPartitionExists(partitionName);
                            if (partitionExists) {
                                await Disk._loadPartition(partitionName, size);
                            } else {
                                await Disk.format(partitionName, size);
                            }
                        }
                    }
                }
                
                Disk.update();
                KernelLogger.info("Disk", "initialization complete");
            };
            
            // 如果 Dependency 可用，等待 nodeTree 加载
            if (Dependency && typeof Dependency.waitLoaded === 'function') {
                KernelLogger.debug("Disk", "等待 nodeTree 模块加载");
                Dependency.waitLoaded("../kernel/filesystem/nodeTree.js", {
                    interval: 50,
                    timeout: 1000,
                })
                .then(async () => {
                    KernelLogger.debug("Disk", "nodeTree 模块已加载，开始初始化");
                    // 尝试加载分区配置
                    const partitionConfig = await Disk._loadPartitionConfig();
                    await initializePartitions(partitionConfig);
                })
                .catch(async (e) => {
                    KernelLogger.warn("Disk", "等待 nodeTree 超时，直接初始化", String(e));
                    // 即使失败也尝试初始化
                    try {
                        const partitionConfig = await Disk._loadPartitionConfig();
                        await initializePartitions(partitionConfig);
                    } catch (e2) {
                        KernelLogger.error("Disk", "fallback initialization failed", { e: String(e2) });
                    }
                });
            } else {
                // 如果 Dependency 不可用，直接尝试初始化（Disk 不强制依赖 nodeTree）
                KernelLogger.debug("Disk", "Dependency 不可用，直接初始化（不等待 nodeTree）");
                (async () => {
                    try {
                        const partitionConfig = await Disk._loadPartitionConfig();
                        await initializePartitions(partitionConfig);
                    } catch (e) {
                        KernelLogger.error("Disk", "initialization error", { e: String(e) });
                    }
                })();
            }
        } catch (e) {
            KernelLogger.error("Disk", "初始化失败", String(e));
            // 尝试直接初始化
            (async () => {
                try {
                    Disk.canUsed = true;
                    const partitionConfig = await Disk._loadPartitionConfig();
                    if (!partitionConfig || partitionConfig.size === 0) {
                        // 使用默认配置
                        const diskSeparateSize = Disk.diskSeparateSize;
                        const existingC = diskSeparateSize.get("C:");
                        const existingD = diskSeparateSize.get("D:");
                        if (!existingC) {
                            await Disk.format("C:", 1024 * 1024 * 1024 * 1);
                        }
                        if (!existingD) {
                            await Disk.format("D:", 1024 * 1024 * 1024 * 2);
                        }
                    } else {
                        const diskSeparateSize = Disk.diskSeparateSize;
                        for (const [partitionName, size] of partitionConfig) {
                            const existingSize = diskSeparateSize.get(partitionName);
                            if (existingSize === undefined) {
                                await Disk.format(partitionName, size);
                            } else if (existingSize !== size) {
                                // 更新大小
                                Disk.setMap("diskSeparateSize", partitionName, size);
                                const used = (Disk.diskUsedMap && Disk.diskUsedMap.get(partitionName)) || 0;
                                const free = size - used;
                                Disk.setMap("diskFreeMap", partitionName, free);
                            }
                        }
                    }
                    Disk.update();
                } catch (e2) {
                    KernelLogger.error("Disk", "fallback initialization failed", { e: String(e2) });
                }
            })();
        }
    }

    // 更新磁盘使用情况
    static update() {
        if (!Disk.canUsed) {
            KernelLogger.warn("Disk", "not initialized");
            return;
        }
        KernelLogger.info("Disk", "updating usage");
        // 清除所有相关缓存，强制从 KernelMemory 重新加载（确保数据是最新的）
        Disk._diskSeparateSizeCache = null;
        Disk._diskFreeMapCache = null;
        Disk._diskUsedMapCache = null;
        // 遍历所有已格式化的分区（从 diskSeparateSize 获取），而不是 diskUsedMap
        // 这样可以确保所有分区都被更新，即使 diskUsedMap 中没有条目
        let diskSeparateSizeMap = Disk.diskSeparateSize;
        if (!diskSeparateSizeMap || !(diskSeparateSizeMap instanceof Map)) {
            KernelLogger.warn("Disk", "diskSeparateSize 不可用，无法更新磁盘使用情况");
            return;
        }
        const partitionKeys = Array.from(diskSeparateSizeMap.keys());
        KernelLogger.info("Disk", `开始更新磁盘使用情况，分区数量: ${diskSeparateSizeMap.size}, 分区列表: ${partitionKeys.join(', ')}`);
        if (diskSeparateSizeMap.size === 0) {
            // 如果 diskSeparateSize 为空，尝试从 diskSeparateMap 获取分区信息
            const diskSeparateMap = Disk.diskSeparateMap;
            if (diskSeparateMap && diskSeparateMap instanceof Map && diskSeparateMap.size > 0) {
                KernelLogger.info("Disk", `diskSeparateSize 为空，从 diskSeparateMap 发现 ${diskSeparateMap.size} 个分区，尝试重建 diskSeparateSize...`);
                // 从 diskSeparateMap 重建 diskSeparateSize（使用默认大小）
                let rebuildCount = 0;
                diskSeparateMap.forEach((coll, key) => {
                    // 使用默认大小：C: 1GB, D: 2GB
                    const defaultSize = key === "C:" ? 1024 * 1024 * 1024 * 1 : (key === "D:" ? 1024 * 1024 * 1024 * 2 : 0);
                    if (defaultSize > 0) {
                        // 直接更新 diskSeparateSizeMap（避免重复调用 getter）
                        diskSeparateSizeMap.set(key, defaultSize);
                        // 同时保存到 KernelMemory
                        Disk.setMap("diskSeparateSize", key, defaultSize);
                        rebuildCount++;
                        KernelLogger.info("Disk", `为分区 ${key} 设置默认大小: ${defaultSize} 字节`);
                    }
                });
                
                if (rebuildCount > 0) {
                    // 重新获取 diskSeparateSizeMap（因为可能已经更新）
                    diskSeparateSizeMap = Disk.diskSeparateSize;
                    const newPartitionKeys = Array.from(diskSeparateSizeMap.keys());
                    KernelLogger.info("Disk", `重建完成，分区数量: ${diskSeparateSizeMap.size}, 分区列表: ${newPartitionKeys.join(', ')}`);
                } else {
                    KernelLogger.debug("Disk", "diskSeparateMap 中的分区没有匹配的默认大小，无法重建 diskSeparateSize");
                }
            } else {
                KernelLogger.debug("Disk", "diskSeparateSize 为空，diskSeparateMap 也为空或不可用，可能分区尚未初始化");
            }
            
            // 如果重建后仍然为空，直接返回（不输出警告，因为这是正常的初始化状态）
            if (diskSeparateSizeMap.size === 0) {
                KernelLogger.debug("Disk", "diskSeparateSize 为空，跳过更新（分区可能尚未初始化）");
                return;
            }
        }
        // 直接使用 map.forEach 而不是 forEachMap，避免再次调用 getter
        diskSeparateSizeMap.forEach((size, key) => {
            KernelLogger.info("Disk", `处理分区 ${key}, 大小: ${size}`);
            try {
                // 首先尝试从 diskSeparateMap 获取
                let coll = Disk.getMap("diskSeparateMap", key);
                
                // 如果从 diskSeparateMap 获取失败，尝试从 POOL 获取
                if (!coll && typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    try {
                        coll = POOL.__GET__("KERNEL_GLOBAL_POOL", key);
                        if (coll && Disk.diskSeparateMap) {
                            // 如果从 POOL 获取成功，也更新 diskSeparateMap（保持一致性）
                            Disk.diskSeparateMap.set(key, coll);
                            // 更新缓存
                            Disk._diskSeparateMapCache = Disk.diskSeparateMap;
                            KernelLogger.debug("Disk", `从 POOL 获取分区 ${key} 成功（update 时）`);
                        }
                    } catch (e) {
                        KernelLogger.debug("Disk", `从 POOL 获取分区 ${key} 失败: ${e.message}`);
                    }
                }
                
                const used =
                    coll && typeof coll.usedSpace === "function"
                        ? coll.usedSpace()
                        : 0;
                Disk.setMap("diskUsedMap", key, used);
                const free = size - used;
                Disk.setMap("diskFreeMap", key, free);
                KernelLogger.info("Disk", `更新分区 ${key}: 总大小=${size}, 已用=${used}, 剩余=${free}`);
            } catch (e) {
                KernelLogger.error("Disk", "update error", { key, e: String(e) });
            }
        });
    }

    /**
     * 检查分区是否存在（检查物理目录和filesystem JSON文件）
     * @param {string} partitionName 分区名称（如 "C:"）
     * @returns {Promise<boolean>} 分区是否存在
     */
    static async _checkPartitionExists(partitionName) {
        try {
            // 提取分区字母
            const diskLetter = partitionName.replace(':', '');
            if (!/^[A-Z]$/.test(diskLetter)) {
                return false;
            }
            
            // 检查filesystem JSON文件是否存在
            const safeName = partitionName.replace(':', '_');
            const fileName = `filesystem_${safeName}.json`;
            const filePath = `${partitionName}/`;
            
            const phpServiceUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) 
                ? SystemInformation.getFSDirvePath()
                : "/system/service/FSDirve.php";
            const checkUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                ? SystemInformation.buildServiceUrlObject(phpServiceUrl)
                : new URL(phpServiceUrl, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                    ? SystemInformation.getOrigin()
                    : window.location.origin);
            checkUrl.searchParams.set('action', 'exists');
            checkUrl.searchParams.set('path', `${filePath}${fileName}`);
            
            const response = await fetch(checkUrl.toString());
            if (!response.ok) {
                return false;
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                return false;
            }
            
            const result = await response.json();
            return result.status === 'success' && result.data && result.data.exists && result.data.type === 'file';
        } catch (e) {
            KernelLogger.debug("Disk", `检查分区 ${partitionName} 是否存在时出错: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 加载已存在的分区（从filesystem JSON文件加载数据）
     * @param {string} partitionName 分区名称（如 "C:"）
     * @param {number} size 分区大小（字节）
     * @returns {Promise<boolean>} 是否成功
     */
    static async _loadPartition(partitionName, size) {
        try {
            KernelLogger.info("Disk", `加载已存在的分区: ${partitionName} (${size} 字节)`);
            
            // 确保物理目录存在
            await Disk._ensurePartitionDirectoryExists(partitionName);
            
            // 创建NodeTreeCollection（会自动从filesystem JSON文件加载数据）
            if (typeof NodeTreeCollection === 'undefined') {
                KernelLogger.error("Disk", `NodeTreeCollection 未定义，无法加载分区 ${partitionName}`);
                return false;
            }
            
            const nodeTree = new NodeTreeCollection(partitionName);
            
            // 更新分区信息到diskSeparateSize和diskSeparateMap
            Disk.setMap("diskSeparateSize", partitionName, size);
            const diskSeparateMap = Disk.diskSeparateMap;
            diskSeparateMap.set(partitionName, nodeTree);
            Disk._diskSeparateMapCache = diskSeparateMap;
            Disk._saveDiskSeparateMap(diskSeparateMap);
            
            // 初始化空闲空间（从NodeTreeCollection计算或使用分区大小）
            // 注意：这里先设置为分区大小，后续Disk.update()会重新计算
            Disk.setMap("diskFreeMap", partitionName, size);
            Disk.setMap("diskUsedMap", partitionName, 0);
            
            // 注册到POOL
            try {
                if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                    if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                        POOL.__INIT__("KERNEL_GLOBAL_POOL");
                    }
                    POOL.__ADD__("KERNEL_GLOBAL_POOL", partitionName, nodeTree);
                    KernelLogger.info("Disk", `分区 ${partitionName} 加载成功，已注册到POOL`);
                } else {
                    KernelLogger.warn("Disk", `POOL 不可用，无法注册 ${partitionName} 到POOL`);
                }
            } catch (e) {
                KernelLogger.error("Disk", `注册 ${partitionName} 到POOL失败: ${e.message}`, e);
            }
            
            return true;
        } catch (e) {
            KernelLogger.error("Disk", `加载分区 ${partitionName} 失败: ${e.message}`, e);
            return false;
        }
    }
    
    /**
     * 确保分区物理目录存在（通过 DISKMANAGER API 创建）
     * @param {string} partitionName 分区名称（如 "B:"）
     * @returns {Promise<boolean>} 是否成功
     */
    static async _ensurePartitionDirectoryExists(partitionName) {
        try {
            // 提取分区字母
            const diskLetter = partitionName.replace(':', '');
            if (!/^[A-Z]$/.test(diskLetter)) {
                KernelLogger.warn("Disk", `无效的分区名称: ${partitionName}`);
                return false;
            }
            
            // D: 是系统盘，应该已经存在，跳过创建
            if (diskLetter === 'D') {
                return true;
            }
            
            // 通过 DISKMANAGER API 检查分区是否存在
            const origin = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                ? SystemInformation.getOrigin()
                : (typeof window !== 'undefined' && window.location) ? window.location.origin : 'http://localhost:8089';
            const diskManagerUrl = new URL('/system/service/DISKMANAGER.php', origin);
            
            // 先检查分区是否存在
            const checkUrl = new URL(diskManagerUrl);
            checkUrl.searchParams.set('action', 'check');
            checkUrl.searchParams.set('partition', partitionName);
            
            const checkResponse = await fetch(checkUrl.toString());
            if (checkResponse.ok) {
                const checkResult = await checkResponse.json();
                if (checkResult.status === 'success' && checkResult.data && checkResult.data.exists) {
                    KernelLogger.debug("Disk", `分区 ${partitionName} 物理目录已存在`);
                    return true;
                }
            }
            
            // 分区不存在，创建分区
            const createUrl = new URL(diskManagerUrl);
            createUrl.searchParams.set('action', 'create');
            createUrl.searchParams.set('partition', partitionName);
            
            KernelLogger.info("Disk", `创建分区物理目录: ${partitionName}`);
            const createResponse = await fetch(createUrl.toString());
            
            if (createResponse.ok) {
                const createResult = await createResponse.json();
                if (createResult.status === 'success') {
                    KernelLogger.info("Disk", `分区 ${partitionName} 物理目录创建成功`);
                    return true;
                } else {
                    KernelLogger.warn("Disk", `创建分区 ${partitionName} 物理目录失败: ${createResult.message}`);
                    return false;
                }
            } else {
                KernelLogger.warn("Disk", `创建分区 ${partitionName} 物理目录失败: HTTP ${createResponse.status}`);
                return false;
            }
        } catch (e) {
            KernelLogger.warn("Disk", `创建分区 ${partitionName} 物理目录时出错: ${e.message}`);
            return false;
        }
    }
    
    // 分卷格式化
    static async format(separateName, size) {
        if (!Disk.canUsed) {
            KernelLogger.warn("Disk", "format on uninitialized disk");
            return;
        }
        
        // 检查分区是否已存在（防止覆盖已存在的分区）
        const partitionExists = await Disk._checkPartitionExists(separateName);
        if (partitionExists) {
            KernelLogger.warn("Disk", `分区 ${separateName} 已存在，跳过格式化。如果需要重新格式化，请先删除该分区。`);
            // 如果分区已存在，尝试加载而不是格式化
            await Disk._loadPartition(separateName, size);
            return;
        }
        
        // 计算当前磁盘空闲大小
        let diskFreeSize = Disk.diskSize;
        // 计算空闲大小
        Disk.forEachMap("diskSeparateSize", (value, key) => {
            diskFreeSize -= value;
        });
        
        // 检查是否有足够空间进行格式化
        KernelLogger.info("Disk", `format prepare ${separateName}, 大小: ${size} 字节, 可用空间: ${diskFreeSize} 字节`);
        if (size <= diskFreeSize) {
            // 进行格式化
            KernelLogger.info("Disk", `格式化新分区 ${separateName}，大小: ${size} 字节`);
            
            // 确保物理目录存在（在创建 NodeTreeCollection 之前）
            await Disk._ensurePartitionDirectoryExists(separateName);
            
            // 设置分区大小
            Disk.setMap("diskSeparateSize", separateName, size);
            
            // 创建NodeTreeCollection（会自动创建filesystem JSON文件）
            if (typeof NodeTreeCollection === 'undefined') {
                KernelLogger.error("Disk", `NodeTreeCollection 未定义，无法格式化分区 ${separateName}`);
                return;
            }
            const nodeTree = new NodeTreeCollection(separateName);
            
            // 直接更新 diskSeparateMap（绕过 setMap 以避免缓存问题）
            const diskSeparateMap = Disk.diskSeparateMap;
            diskSeparateMap.set(separateName, nodeTree);
            // 更新缓存
            Disk._diskSeparateMapCache = diskSeparateMap;
            // 保存到 KernelMemory
            Disk._saveDiskSeparateMap(diskSeparateMap);
            
            // 初始化空闲和已用空间
            Disk.setMap("diskFreeMap", separateName, size);
            Disk.setMap("diskUsedMap", separateName, 0);
            
            // 注册到 POOL
            try {
                if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                    // 确保 KERNEL_GLOBAL_POOL 存在
                    if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                        POOL.__INIT__("KERNEL_GLOBAL_POOL");
                    }
                    POOL.__ADD__(
                        "KERNEL_GLOBAL_POOL",
                        separateName,
                        Disk.getMap("diskSeparateMap", separateName)
                    );
                    KernelLogger.info("Disk", `format success ${separateName}, registered to POOL`, { size });
                } else {
                    KernelLogger.warn("Disk", `POOL 不可用，无法注册 ${separateName} 到 POOL`);
                }
            } catch (e) {
                KernelLogger.error("Disk", `注册 ${separateName} 到 POOL 失败: ${e.message}`, e);
            }
            
            KernelLogger.info("Disk", `format success ${separateName}`, { size });
        } else {
            KernelLogger.warn("Disk", `format failed ${separateName} insufficient space`, { size, diskFreeSize });
            throw new Error(`格式化失败: 分区 ${separateName} 空间不足（需要 ${size} 字节，可用 ${diskFreeSize} 字节）`);
        }
    }

    // ---------- Map 操作封装与日志 ----------
    static _logMap(op, mapName, key, value) {
        // KernelLogger is expected to be loaded first; use it for all map logs
        KernelLogger.map(op, mapName, key, value);
        return;
    }

    static setMap(mapName, key, value) {
        // 对于使用 getter 的 Map（diskSeparateMap, diskSeparateSize, diskFreeMap, diskUsedMap），
        // 需要先获取实际的 Map 对象，然后更新它
        let map = null;
        if (mapName === 'diskSeparateMap') {
            map = Disk.diskSeparateMap;
        } else if (mapName === 'diskSeparateSize') {
            map = Disk.diskSeparateSize;
        } else if (mapName === 'diskFreeMap') {
            map = Disk.diskFreeMap;
        } else if (mapName === 'diskUsedMap') {
            map = Disk.diskUsedMap;
        } else if (Disk[mapName] && Disk[mapName] instanceof Map) {
            map = Disk[mapName];
        } else {
            KernelLogger.error("Disk", "setMap unknown map", { mapName });
            return;
        }
        
        Disk._logMap("SET", mapName, key, value);
        const result = map.set(key, value);
        
        // 更新缓存（确保缓存与 Map 同步）
        if (mapName === 'diskSeparateMap') {
            Disk._diskSeparateMapCache = map;
            Disk._saveDiskSeparateMap(map);
        } else if (mapName === 'diskSeparateSize') {
            Disk._diskSeparateSizeCache = map;
            Disk._saveDiskSeparateSize(map);
            const sizeKeys = Array.from(map.keys());
            KernelLogger.debug("Disk", `diskSeparateSize 已更新并保存，当前分区: ${sizeKeys.join(', ')}, 数量: ${map.size}`);
        } else if (mapName === 'diskFreeMap') {
            Disk._diskFreeMapCache = map;
            Disk._saveDiskFreeMap(map);
        } else if (mapName === 'diskUsedMap') {
            Disk._diskUsedMapCache = map;
            Disk._saveDiskUsedMap(map);
        }
        
        return result;
    }

    static getMap(mapName, key) {
        // 对于使用 getter 的 Map，需要通过 getter 获取实际的 Map 对象
        let map = null;
        if (mapName === 'diskSeparateMap') {
            map = Disk.diskSeparateMap;
        } else if (mapName === 'diskSeparateSize') {
            map = Disk.diskSeparateSize;
        } else if (mapName === 'diskFreeMap') {
            map = Disk.diskFreeMap;
        } else if (mapName === 'diskUsedMap') {
            map = Disk.diskUsedMap;
        } else if (Disk[mapName] && Disk[mapName] instanceof Map) {
            map = Disk[mapName];
        } else {
            KernelLogger.error("Disk", "getMap unknown map", { mapName });
            return undefined;
        }
        
        if (!map || !(map instanceof Map)) {
            KernelLogger.error("Disk", "getMap: map is not a Map", { mapName, mapType: typeof map });
            return undefined;
        }
        
        const val = map.get(key);
        Disk._logMap("GET", mapName, key, val);
        return val;
    }

    static deleteMap(mapName, key) {
        if (!Disk[mapName] || !(Disk[mapName] instanceof Map)) {
            KernelLogger.error("Disk", "deleteMap unknown map", { mapName });
            return false;
        }
        Disk._logMap("DEL", mapName, key, "");
        return Disk[mapName].delete(key);
    }

    static forEachMap(mapName, fn) {
        // 对于使用 getter 的 Map，需要通过 getter 获取实际的 Map 对象
        let map = null;
        if (mapName === 'diskSeparateMap') {
            map = Disk.diskSeparateMap;
        } else if (mapName === 'diskSeparateSize') {
            map = Disk.diskSeparateSize;
        } else if (mapName === 'diskFreeMap') {
            map = Disk.diskFreeMap;
        } else if (mapName === 'diskUsedMap') {
            map = Disk.diskUsedMap;
        } else if (Disk[mapName] && Disk[mapName] instanceof Map) {
            map = Disk[mapName];
        } else {
            KernelLogger.error('Disk','forEachMap unknown map', { mapName });
            return;
        }
        
        if (!map || !(map instanceof Map)) {
            KernelLogger.error('Disk','forEachMap: map is not a Map', { mapName, mapType: typeof map });
            return;
        }
        
        map.forEach((v, k) => {
            Disk._logMap("ITER", mapName, k, v);
            try {
                fn(v, k);
            } catch (e) {
                KernelLogger.error('Disk','forEachMap callback error', String(e));
            }
        });
    }

    // Attach logging wrappers to existing Map instance methods so external direct Map ops are traced
    static _attachLoggingToMap(mapName) {
        const m = Disk[mapName];
        if (!m || !(m instanceof Map)) {
            KernelLogger.warn('Disk','attachLogging skip unknown map', { mapName });
            return;
        }
        if (m.__logged) return; // avoid double-wrap
        const orig = {
            set: m.set.bind(m),
            get: m.get.bind(m),
            delete: m.delete.bind(m),
            forEach: m.forEach.bind(m),
            has: m.has.bind(m),
            clear: m.clear.bind(m),
        };

        m.set = function (key, value) {
            Disk._logMap("SET", mapName, key, value);
            return orig.set(key, value);
        };
        m.get = function (key) {
            const v = orig.get(key);
            Disk._logMap("GET", mapName, key, v);
            return v;
        };
        m.delete = function (key) {
            Disk._logMap("DEL", mapName, key, "");
            return orig.delete(key);
        };
        m.forEach = function (callback, thisArg) {
            return orig.forEach(function (v, k) {
                Disk._logMap("ITER", mapName, k, v);
                return callback.call(thisArg, v, k, m);
            }, thisArg);
        };
        m.has = function (key) {
            const r = orig.has(key);
            Disk._logMap("HAS", mapName, key, r);
            return r;
        };
        m.clear = function () {
            Disk._logMap("CLR", mapName, "ALL", "");
            return orig.clear();
        };
        m.__logged = true;
        Disk._logMap("WRAP", mapName, "__attach__", "wrapped");
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
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "Disk", Disk);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.Disk = Disk;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.Disk = Disk;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.Disk = Disk;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.Disk = Disk;
    }
}

DependencyConfig.publishSignal("../kernel/filesystem/disk.js");

// 初始化缓存（在模块加载时）
// 注意：_attachLoggingToMap 会在访问Map时自动调用，但我们需要先初始化缓存
// 延迟初始化，确保KernelMemory已加载
// 使用延迟初始化，避免在模块加载时触发循环调用
setTimeout(() => {
    if (typeof KernelMemory !== 'undefined' && KernelMemory._memoryCache) {
        try {
            // 预加载缓存（静默失败，避免日志爆炸）
            Disk._diskSeparateMapCache = Disk._getDiskSeparateMap();
            Disk._diskSeparateSizeCache = Disk._getDiskSeparateSize();
            Disk._diskFreeMapCache = Disk._getDiskFreeMap();
            Disk._diskUsedMapCache = Disk._getDiskUsedMap();
        } catch (e) {
            // 静默失败，避免日志爆炸
        }
    }
}, 100);

// Attach logging wrappers to the known maps so external callers are traced
// 注意：由于使用了getter，_attachLoggingToMap需要在缓存初始化后调用
setTimeout(() => {
    Disk._attachLoggingToMap("diskSeparateMap");
    Disk._attachLoggingToMap("diskSeparateSize");
    Disk._attachLoggingToMap("diskFreeMap");
    Disk._attachLoggingToMap("diskUsedMap");
}, 0);
