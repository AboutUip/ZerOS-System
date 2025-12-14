// 内存管理器:对于一个pid应用程序的内存管理(目前实现有堆内存Heap)
KernelLogger.info("MemoryManager", "模块初始化");
class MemoryManager {
    // 日志级别: 使用 LogLevel.LEVEL 枚举
    static logLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.DEBUG) ? LogLevel.LEVEL.DEBUG : 3;

    static setLogLevel(lvl) {
        this.logLevel = lvl;
    }

    static _log(level, ...args) {
        if (MemoryManager.logLevel >= level) {
            const debugLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.DEBUG) ? LogLevel.LEVEL.DEBUG : 3;
            const infoLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.INFO) ? LogLevel.LEVEL.INFO : 2;
            const errorLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.ERROR) ? LogLevel.LEVEL.ERROR : 1;
            const debugName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.DEBUG) ? LogLevel.NAME.DEBUG : "DEBUG";
            const infoName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.INFO) ? LogLevel.NAME.INFO : "INFO";
            const errorName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.ERROR) ? LogLevel.NAME.ERROR : "ERROR";
            const lvlName = level >= debugLevel ? debugName : level >= infoLevel ? infoName : errorName;
            const subsystem = "MemoryManager";
            const message = args.length > 0 && typeof args[0] === 'string' ? args[0] : '';
            const meta = args.length > 1 ? args.slice(1) : (args.length === 1 ? undefined : undefined);
            KernelLogger.log(lvlName, subsystem, message, meta);
            return;
        }
    }

    // 应用程序分区管理Map<pid,Object>
    // 注意：实际数据存储在Exploit内存中
    // Object:
    // {
    //      heaps : Map<heapId,Heap>
    //      sheds : Map<shedId,Shed>
    //      nextHeapId: number,  // 下一个堆ID
    //      nextShedId: number   // 下一个栈ID
    // }
    
    /**
     * 获取应用程序分区管理表（从Exploit内存）
     * @returns {Map<number, Object>} 应用程序分区管理表
     */
    static _getApplicationSOP() {
        // 防止递归调用：如果正在加载，使用降级方案
        if (MemoryManager._loadingApplicationSOP) {
            if (!MemoryManager._fallbackApplicationSOP) {
                MemoryManager._fallbackApplicationSOP = new Map();
            }
            return MemoryManager._fallbackApplicationSOP;
        }
        
        if (typeof KernelMemory === 'undefined') {
            // 降级：使用临时Map
            if (!MemoryManager._fallbackApplicationSOP) {
                MemoryManager._fallbackApplicationSOP = new Map();
            }
            return MemoryManager._fallbackApplicationSOP;
        }
        
        MemoryManager._loadingApplicationSOP = true;
        try {
            const data = KernelMemory.loadData('APPLICATION_SOP');
            if (data) {
                // 将数组转换回Map
                const map = new Map();
                if (Array.isArray(data)) {
                    for (const [pid, info] of data) {
                        map.set(pid, info);
                    }
                } else if (typeof data === 'object') {
                    for (const [pid, info] of Object.entries(data)) {
                        map.set(parseInt(pid), info);
                    }
                }
                return map;
            }
            
            // 如果不存在，创建新的Map并保存
            const newMap = new Map();
            MemoryManager._saveApplicationSOP(newMap);
            return newMap;
        } finally {
            MemoryManager._loadingApplicationSOP = false;
        }
    }
    
    /**
     * 保存应用程序分区管理表（到Exploit内存）
     * @param {Map<number, Object>} sop 应用程序分区管理表
     */
    static _saveApplicationSOP(sop) {
        if (typeof KernelMemory === 'undefined') {
            return;
        }
        
        // 防止在内存初始化时保存，避免循环
        if (KernelMemory._ensuringMemory) {
            return;  // 静默跳过，避免循环
        }
        
        // 将Map转换为数组以便序列化
        // 注意：Heap和Shed对象不能序列化，需要特殊处理
        const array = Array.from(sop.entries()).map(([pid, info]) => {
            // 只保存元数据，不保存Heap和Shed对象引用
            return [pid, {
                nextHeapId: info.nextHeapId || 1,
                nextShedId: info.nextShedId || 1
                // heaps和sheds是运行时对象，不序列化
            }];
        });
        
        // 延迟保存，避免在内存初始化时触发循环
        if (KernelMemory._memoryCache) {
            KernelMemory.saveData('APPLICATION_SOP', array);
        } else {
            // 如果内存还没初始化，延迟保存
            setTimeout(() => {
                if (KernelMemory._memoryCache) {
                    KernelMemory.saveData('APPLICATION_SOP', array);
                }
            }, 100);
        }
    }
    
    /**
     * 获取应用程序分区管理表（兼容旧代码）
     * @returns {Map<number, Object>} 应用程序分区管理表
     */
    static get APPLICATION_SOP() {
        // 如果已经有缓存的Map，直接返回
        if (MemoryManager._applicationSOPCache) {
            return MemoryManager._applicationSOPCache;
        }
        
        // 从内存加载
        const sop = MemoryManager._getApplicationSOP();
        MemoryManager._applicationSOPCache = sop;
        return sop;
    }
    
    // 应用程序分区管理表缓存
    static _applicationSOPCache = null;
    static _fallbackApplicationSOP = null;
    static _loadingApplicationSOP = false;  // 防止递归加载的标志
    
    /**
     * 获取程序名称映射（从Exploit内存）
     * @returns {Map<number, string>} 程序名称映射
     */
    static _getProgramNames() {
        if (typeof KernelMemory === 'undefined') {
            // 降级：使用临时Map
            if (!MemoryManager._fallbackProgramNames) {
                MemoryManager._fallbackProgramNames = new Map();
            }
            return MemoryManager._fallbackProgramNames;
        }
        
        const data = KernelMemory.loadData('PROGRAM_NAMES');
        if (data) {
            const map = new Map();
            if (Array.isArray(data)) {
                for (const [pid, name] of data) {
                    map.set(pid, name);
                }
            } else if (typeof data === 'object') {
                for (const [pid, name] of Object.entries(data)) {
                    map.set(parseInt(pid), name);
                }
            }
            return map;
        }
        
        const newMap = new Map();
        MemoryManager._saveProgramNames(newMap);
        return newMap;
    }
    
    /**
     * 保存程序名称映射（到Exploit内存）
     * @param {Map<number, string>} names 程序名称映射
     */
    static _saveProgramNames(names) {
        if (typeof KernelMemory === 'undefined') {
            return;
        }
        
        // 防止在内存初始化时保存，避免循环
        if (KernelMemory._ensuringMemory) {
            return;  // 静默跳过，避免循环
        }
        
        const array = Array.from(names.entries());
        
        // 延迟保存，避免在内存初始化时触发循环
        if (KernelMemory._memoryCache) {
            KernelMemory.saveData('PROGRAM_NAMES', array);
        } else {
            // 如果内存还没初始化，延迟保存
            setTimeout(() => {
                if (KernelMemory._memoryCache) {
                    KernelMemory.saveData('PROGRAM_NAMES', array);
                }
            }, 100);
        }
    }
    
    /**
     * 获取程序名称映射（兼容旧代码）
     * @returns {Map<number, string>} 程序名称映射
     */
    static get PROGRAM_NAMES() {
        if (MemoryManager._programNamesCache) {
            return MemoryManager._programNamesCache;
        }
        
        const names = MemoryManager._getProgramNames();
        MemoryManager._programNamesCache = names;
        return names;
    }
    
    // 程序名称映射缓存
    static _programNamesCache = null;
    static _fallbackProgramNames = null;
    
    /**
     * 获取下一个堆ID（从Exploit内存）
     * @returns {number} 下一个堆ID
     */
    static get NEXT_HEAP_ID() {
        if (typeof KernelMemory === 'undefined') {
            if (MemoryManager._fallbackNextHeapId === undefined) {
                MemoryManager._fallbackNextHeapId = 1;
            }
            return MemoryManager._fallbackNextHeapId;
        }
        
        const id = KernelMemory.loadData('NEXT_HEAP_ID');
        return id !== null ? id : 1;
    }
    
    /**
     * 设置下一个堆ID（保存到Exploit内存）
     * @param {number} id 下一个堆ID
     */
    static set NEXT_HEAP_ID(id) {
        if (typeof KernelMemory === 'undefined') {
            MemoryManager._fallbackNextHeapId = id;
            return;
        }
        
        KernelMemory.saveData('NEXT_HEAP_ID', id);
    }
    
    /**
     * 获取下一个栈ID（从Exploit内存）
     * @returns {number} 下一个栈ID
     */
    static get NEXT_SHED_ID() {
        if (typeof KernelMemory === 'undefined') {
            if (MemoryManager._fallbackNextShedId === undefined) {
                MemoryManager._fallbackNextShedId = 1;
            }
            return MemoryManager._fallbackNextShedId;
        }
        
        const id = KernelMemory.loadData('NEXT_SHED_ID');
        return id !== null ? id : 1;
    }
    
    /**
     * 设置下一个栈ID（保存到Exploit内存）
     * @param {number} id 下一个栈ID
     */
    static set NEXT_SHED_ID(id) {
        if (typeof KernelMemory === 'undefined') {
            MemoryManager._fallbackNextShedId = id;
            return;
        }
        
        KernelMemory.saveData('NEXT_SHED_ID', id);
    }
    
    // 降级方案：临时存储
    static _fallbackNextHeapId = undefined;
    static _fallbackNextShedId = undefined;

    // 注册程序名称
    static registerProgramName(pid, programName) {
        if (pid === undefined || pid === null) {
            MemoryManager._log(1, `registerProgramName 失败: pid 无效`);
            return false;
        }
        
        // 防止在内存初始化时注册，避免循环
        if (typeof KernelMemory !== 'undefined' && KernelMemory._ensuringMemory) {
            // 静默跳过，避免循环
            return false;
        }
        
        try {
            const names = MemoryManager.PROGRAM_NAMES;
            names.set(pid, programName || `Program-${pid}`);
            MemoryManager._saveProgramNames(names);
            MemoryManager._log(2, `注册程序名称: pid=${pid}, name=${programName || `Program-${pid}`}`);
            return true;
        } catch (e) {
            // 静默失败，避免日志爆炸
            return false;
        }
    }

    // 获取程序名称
    static getProgramName(pid) {
        return MemoryManager.PROGRAM_NAMES.get(pid) || `Program-${pid}`;
    }

    // heapId = [int(16)]
    // shedId = [int(16)]
    // heapSize = [long]
    // shedSize = [long]
    // heap = [Map<String,Heap>]
    // shed = [Map<String,Shed>]
    /**
     * 统一为准备运行的应用程序分配Heap和Shed并且进行统一管理
     * @param {number} pid 进程ID
     * @param {number} heapSize 堆大小（-1表示不需要堆）
     * @param {number} shedSize 栈大小（-1表示不需要栈，实际不使用）
     * @param {number} heapId 堆ID（可选，如果不提供则自动生成）
     * @param {number} shedId 栈ID（可选，如果不提供则自动生成）
     * @returns {Object} { heapId: number, shedId: number, heap: Heap|null, shed: Shed|null }
     */
    static allocateMemory(pid, heapSize = -1, shedSize = -1, heapId = null, shedId = null) {
        MemoryManager._log(2, `为应用程序 ${pid} 分配内存 heapSize=${heapSize} shedSize=${shedSize}`);
        
        // 检查
        const sop = MemoryManager.APPLICATION_SOP;
        if(!sop.has(pid)){
            // 没有则初始化
            sop.set(pid,{
                heaps : (new Map()),
                sheds : (new Map()),
                nextHeapId: 1,  // 每个进程的堆ID从1开始
                nextShedId: 1   // 每个进程的栈ID从1开始
            });
            MemoryManager._saveApplicationSOP(sop);
            MemoryManager._log(2, `为应用程序 ${pid} 创建新的内存分区`);
        }
        
        const appSpace = sop.get(pid);
        let allocatedHeapId = heapId;
        let allocatedShedId = shedId;
        let heap = null;
        let shed = null;
        
        // 如果需要堆内存
        if(heapSize !== -1 && heapSize > 0){
            // 如果没有指定heapId，自动生成
            if(allocatedHeapId === null || allocatedHeapId === undefined){
                allocatedHeapId = appSpace.nextHeapId++;
            }
            
            // 检查Heap是否已存在
            if (appSpace.heaps.has(allocatedHeapId)) {
                heap = appSpace.heaps.get(allocatedHeapId);
                MemoryManager._log(2, `Heap已存在，重用 heapId=${allocatedHeapId}`);
            } else {
                // 申请堆内存
                heap = new Heap(pid, heapSize, allocatedHeapId);
                appSpace.heaps.set(allocatedHeapId, heap);
                MemoryManager._log(2, `为应用程序 ${pid} 分配堆内存成功 heapId=${allocatedHeapId} heapSize=${heapSize}`);
            }
        }
        
        // 如果需要栈内存
        if(shedSize !== -1 && shedSize >= 0){
            // 如果没有指定shedId，自动生成
            if(allocatedShedId === null || allocatedShedId === undefined){
                allocatedShedId = appSpace.nextShedId++;
            }
            
            // 检查Shed是否已存在
            if (appSpace.sheds.has(allocatedShedId)) {
                shed = appSpace.sheds.get(allocatedShedId);
                MemoryManager._log(2, `Shed已存在，重用 shedId=${allocatedShedId}`);
            } else {
                // 申请栈内存（Shed构造函数不需要size参数）
                shed = new Shed(pid, allocatedShedId);
                appSpace.sheds.set(allocatedShedId, shed);
                MemoryManager._log(2, `为应用程序 ${pid} 分配栈内存成功 shedId=${allocatedShedId}`);
            }
        }
        
        return {
            heapId: allocatedHeapId,
            shedId: allocatedShedId,
            heap: heap,
            shed: shed
        };
    }

    // 统一为准备运行的应用程序释放Heap和Shed
    static freeMemory(pid) {
        MemoryManager._log(2, `为应用程序 ${pid} 释放内存`);
        
        // 检查进程是否存在
        const applicationSOP = MemoryManager._getApplicationSOP();
        if (!applicationSOP.has(pid)) {
            MemoryManager._log(3, `释放内存失败: 应用程序 ${pid} 不存在`);
            return; // 静默返回，不抛出错误
        }
        let APP_MEM_SPACE = MemoryManager.APPLICATION_SOP.get(pid);
        if (!APP_MEM_SPACE) {
            MemoryManager._log(1, `释放内存失败: 应用程序 ${pid} 不存在`);
            return false;
        }
        MemoryManager._log(3, `释放堆内存, 共 ${APP_MEM_SPACE.heaps.size} 个堆`);
        APP_MEM_SPACE.heaps.forEach((val,key,self) => {
            val.freeAll();
        });
        MemoryManager._log(3, `释放栈内存, 共 ${APP_MEM_SPACE.sheds.size} 个栈`);
        // 清除程序名称注册（可选，如果希望保留程序名称历史记录可以不删除）
        // MemoryManager.PROGRAM_NAMES.delete(pid);
        APP_MEM_SPACE.sheds.forEach((val,key,self) => {
            val.clearCode();
            val.clearResourceLink();
        });
        APP_MEM_SPACE = null;
        MemoryManager.APPLICATION_SOP.delete(pid);
        MemoryManager._log(2, `应用程序 ${pid} 内存释放完成`);
        return true;
    }

    // 检查内存(完整获得所有程序所占用的空间,也可以传入某pid来获得特定的程序空间占用)
    static checkMemory(pid = -1){
        MemoryManager._log(2, `检查内存 pid=${pid === -1 ? '全部' : pid}`);
        
        const result = {
            totalPrograms: 0,
            programs: []
        };

        // 如果指定了 pid，只检查该程序
        if (pid !== -1) {
            // 对于Exploit程序（PID 10000），确保内存已分配
            if (pid === 10000 && typeof KernelMemory !== 'undefined') {
                try {
                    // 确保Exploit程序的内存已分配
                    KernelMemory._ensureMemory();
                } catch (e) {
                    MemoryManager._log(1, `确保Exploit程序内存失败: ${e.message}`);
                }
            }
            
            const appSpace = MemoryManager.APPLICATION_SOP.get(pid);
            if (!appSpace) {
                MemoryManager._log(1, `检查内存失败: 应用程序 ${pid} 不存在`);
                return null;
            }
            const programInfo = MemoryManager._collectProgramMemory(pid, appSpace);
            result.totalPrograms = 1;
            result.programs.push(programInfo);
        } else {
            // 检查所有程序
            // 对于Exploit程序，确保内存已分配
            if (typeof KernelMemory !== 'undefined') {
                try {
                    KernelMemory._ensureMemory();
                } catch (e) {
                    MemoryManager._log(1, `确保Exploit程序内存失败: ${e.message}`);
                }
            }
            
            MemoryManager.APPLICATION_SOP.forEach((appSpace, currentPid) => {
                const programInfo = MemoryManager._collectProgramMemory(currentPid, appSpace);
                result.programs.push(programInfo);
            });
            result.totalPrograms = result.programs.length;
        }

        MemoryManager._log(2, `检查内存完成 共 ${result.totalPrograms} 个程序`);
        MemoryManager._log(3, `内存检查结果`, result);
        return result;
    }

    // 收集单个程序的内存信息（内部辅助方法）
    static _collectProgramMemory(pid, appSpace) {
        const programInfo = {
            pid: pid,
            programName: MemoryManager.getProgramName(pid),
            heaps: [],
            sheds: [],
            totalHeapSize: 0,
            totalHeapUsed: 0,
            totalHeapFree: 0,
            totalShedSize: 0
        };

        // 收集堆内存信息
        appSpace.heaps.forEach((heap, heapId) => {
            const heapStats = heap.stats();
            // 将十六进制字符串转换为数字进行统计
            const decimalType = (typeof AddressType !== 'undefined' && AddressType.TYPE.DECIMAL) ? AddressType.TYPE.DECIMAL : 10;
            const heapSizeNum = Heap.addressing(heapStats.heapSize, decimalType);
            const usedNum = Heap.addressing(heapStats.used, decimalType);
            const freeNum = Heap.addressing(heapStats.free, decimalType);
            
            // 安全检查：确保转换后的值是有效数字
            const safeHeapSize = (typeof heapSizeNum === 'number' && !Number.isNaN(heapSizeNum)) ? heapSizeNum : 0;
            const safeUsed = (typeof usedNum === 'number' && !Number.isNaN(usedNum)) ? usedNum : 0;
            const safeFree = (typeof freeNum === 'number' && !Number.isNaN(freeNum)) ? freeNum : 0;
            
            programInfo.heaps.push({
                heapId: heapStats.heapId,
                heapSize: heapStats.heapSize,
                used: heapStats.used,
                free: heapStats.free,
                heapSizeNum: safeHeapSize,
                usedNum: safeUsed,
                freeNum: safeFree
            });
            
            programInfo.totalHeapSize += safeHeapSize;
            programInfo.totalHeapUsed += safeUsed;
            programInfo.totalHeapFree += safeFree;
        });

        // 收集栈内存信息
        appSpace.sheds.forEach((shed, shedId) => {
            const shedStatus = shed.queryStackStatus();
            
            // 安全检查：确保 stackSize 是有效数字
            const safeShedSize = (typeof shedStatus.stackSize === 'number' && !Number.isNaN(shedStatus.stackSize)) ? shedStatus.stackSize : 0;
            
            programInfo.sheds.push({
                stackId: shedStatus.stackId,
                stackSize: shedStatus.stackSize,
                codeSize: shedStatus.codeSize,
                resourceLinkSize: shedStatus.resourceLinkSize,
                programManagementId: shedStatus.programManagementId
            });
            
            programInfo.totalShedSize += safeShedSize;
        });

        // 获取程序名称
        programInfo.programName = MemoryManager.PROGRAM_NAMES.get(pid) || `Process-${pid}`;
        
        return programInfo;
    }
    
    // 注册程序名称（已存在，这里只是确保一致性）
    // registerProgramName 方法已在上面定义
    
    // 获取程序名称
    static getProgramName(pid) {
        return MemoryManager.PROGRAM_NAMES.get(pid) || `Program-${pid}`;
    }
    
    // ==================== 内存回收和优化机制 ====================
    
    // 垃圾回收配置
    static _gcConfig = {
        enabled: true,                    // 是否启用自动垃圾回收
        interval: 60000,                  // 回收间隔（毫秒），默认60秒
        minFreePercent: 10,               // 最小空闲百分比阈值，低于此值触发回收
        maxUsagePercent: 90,              // 最大使用百分比阈值，超过此值触发警告
        leakDetectionInterval: 300000,   // 内存泄漏检测间隔（毫秒），默认5分钟
        fragmentationThreshold: 30,      // 碎片化阈值（%），超过此值触发碎片整理
        compactionEnabled: true          // 是否启用内存压缩
    };
    
    // 垃圾回收定时器
    static _gcTimer = null;
    static _leakDetectionTimer = null;
    
    // 内存使用历史记录（用于泄漏检测）
    static _memoryHistory = new Map(); // Map<pid, Array<{timestamp, usage}>>
    
    /**
     * 启动自动垃圾回收
     */
    static startGarbageCollection() {
        if (!MemoryManager._gcConfig.enabled) {
            return;
        }
        
        // 停止现有的定时器
        MemoryManager.stopGarbageCollection();
        
        // 启动定期垃圾回收
        MemoryManager._gcTimer = setInterval(() => {
            MemoryManager._performGarbageCollection();
        }, MemoryManager._gcConfig.interval);
        
        // 启动内存泄漏检测
        MemoryManager._leakDetectionTimer = setInterval(() => {
            MemoryManager._detectMemoryLeaks();
        }, MemoryManager._gcConfig.leakDetectionInterval);
        
        MemoryManager._log(2, "自动垃圾回收已启动", {
            gcInterval: MemoryManager._gcConfig.interval,
            leakDetectionInterval: MemoryManager._gcConfig.leakDetectionInterval
        });
    }
    
    /**
     * 停止自动垃圾回收
     */
    static stopGarbageCollection() {
        if (MemoryManager._gcTimer) {
            clearInterval(MemoryManager._gcTimer);
            MemoryManager._gcTimer = null;
        }
        if (MemoryManager._leakDetectionTimer) {
            clearInterval(MemoryManager._leakDetectionTimer);
            MemoryManager._leakDetectionTimer = null;
        }
        MemoryManager._log(2, "自动垃圾回收已停止");
    }
    
    /**
     * 执行垃圾回收
     */
    static _performGarbageCollection() {
        MemoryManager._log(3, "开始执行垃圾回收");
        
        const sop = MemoryManager.APPLICATION_SOP;
        let totalFreed = 0;
        let totalChecked = 0;
        
        sop.forEach((appSpace, pid) => {
            // 检查进程是否还在运行
            if (typeof ProcessManager !== 'undefined') {
                const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
                if (!processInfo || processInfo.status !== 'running') {
                    // 进程已退出，清理其内存
                    MemoryManager._log(2, `检测到已退出进程 ${pid}，清理内存`);
                    MemoryManager.freeMemory(pid);
                    return;
                }
            }
            
            // 检查堆内存使用情况
            appSpace.heaps.forEach((heap, heapId) => {
                totalChecked++;
                const status = heap._getHeapStatus();
                const freePercent = (status.free / status.total) * 100;
                
                // 如果空闲内存低于阈值，尝试清理
                if (freePercent < MemoryManager._gcConfig.minFreePercent) {
                    MemoryManager._log(2, `进程 ${pid} 堆 ${heapId} 内存使用率过高 (${(100 - freePercent).toFixed(2)}%)，尝试清理`);
                    
                    // 执行碎片整理
                    if (MemoryManager._gcConfig.compactionEnabled) {
                        const freed = MemoryManager._compactHeap(heap);
                        totalFreed += freed;
                    }
                }
                
                // 检查内存使用警告
                const usagePercent = (status.used / status.total) * 100;
                if (usagePercent > MemoryManager._gcConfig.maxUsagePercent) {
                    MemoryManager._log(1, `警告: 进程 ${pid} 堆 ${heapId} 内存使用率过高 (${usagePercent.toFixed(2)}%)`, {
                        pid: pid,
                        heapId: heapId,
                        usage: status.used,
                        total: status.total,
                        free: status.free
                    });
                }
            });
        });
        
        if (totalFreed > 0) {
            MemoryManager._log(2, `垃圾回收完成，释放了 ${totalFreed} 个内存块`, {
                totalChecked: totalChecked,
                totalFreed: totalFreed
            });
        } else {
            MemoryManager._log(3, `垃圾回收完成，无需清理`, {
                totalChecked: totalChecked
            });
        }
    }
    
    /**
     * 内存碎片整理
     * @param {Heap} heap 堆对象
     * @returns {number} 整理后释放的块数
     */
    static _compactHeap(heap) {
        if (!heap || !heap.memoryDataList) {
            return 0;
        }
        
        MemoryManager._log(3, `开始整理堆 ${heap.heapId} 的碎片`);
        
        const beforeStatus = heap._getHeapStatus();
        const memoryList = heap.memoryDataList;
        const newList = [];
        const addressMap = new Map(); // 旧地址 -> 新地址的映射
        
        // 第一步：收集所有已分配的内存块
        const allocatedBlocks = [];
        for (let i = 0; i < memoryList.length; i++) {
            const item = memoryList[i];
            if (item !== null && typeof item === 'object' && item.__reserved) {
                const base = item.base;
                const length = item.length;
                
                // 检查是否已经处理过这个块
                if (i === base) {
                    allocatedBlocks.push({
                        base: base,
                        length: length,
                        data: memoryList.slice(base, base + length)
                    });
                }
            }
        }
        
        // 第二步：按顺序重新排列
        let newIndex = 0;
        for (const block of allocatedBlocks) {
            const oldBase = block.base;
            const newBase = newIndex;
            const length = block.length;
            
            // 记录地址映射
            const hexType = (typeof AddressType !== 'undefined' && AddressType.TYPE.HEX) ? AddressType.TYPE.HEX : 16;
            const oldAddr = Heap.addressing(oldBase, hexType);
            const newAddr = Heap.addressing(newBase, hexType);
            addressMap.set(oldAddr, newAddr);
            
            // 复制数据到新位置
            for (let i = 0; i < length; i++) {
                newList[newIndex] = {
                    __reserved: true,
                    base: newBase,
                    length: length
                };
                newIndex++;
            }
        }
        
        // 第三步：填充剩余空间为null
        while (newList.length < memoryList.length) {
            newList.push(null);
        }
        
        // 第四步：更新堆内存
        heap.memoryDataList = newList;
        
        const afterStatus = heap._getHeapStatus();
        const freed = beforeStatus.used - afterStatus.used;
        
        MemoryManager._log(2, `堆 ${heap.heapId} 碎片整理完成`, {
            before: beforeStatus,
            after: afterStatus,
            freed: freed,
            addressMappings: addressMap.size
        });
        
        // 注意：地址映射需要通知使用该堆的代码更新引用
        // 这里只做整理，不更新外部引用（因为外部引用通过resourceLinkArea管理）
        
        return freed;
    }
    
    /**
     * 检测内存泄漏
     */
    static _detectMemoryLeaks() {
        MemoryManager._log(3, "开始检测内存泄漏");
        
        const sop = MemoryManager.APPLICATION_SOP;
        const now = Date.now();
        const historyWindow = 5 * 60 * 1000; // 5分钟窗口
        
        sop.forEach((appSpace, pid) => {
            // 检查进程是否还在运行
            if (typeof ProcessManager !== 'undefined') {
                const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
                if (!processInfo || processInfo.status !== 'running') {
                    // 进程已退出，清除历史记录
                    MemoryManager._memoryHistory.delete(pid);
                    return;
                }
            }
            
            // 计算当前内存使用
            let totalUsed = 0;
            let totalSize = 0;
            appSpace.heaps.forEach((heap) => {
                const status = heap._getHeapStatus();
                totalUsed += status.used;
                totalSize += status.total;
            });
            
            const usagePercent = totalSize > 0 ? (totalUsed / totalSize) * 100 : 0;
            
            // 获取历史记录
            let history = MemoryManager._memoryHistory.get(pid);
            if (!history) {
                history = [];
                MemoryManager._memoryHistory.set(pid, history);
            }
            
            // 添加当前记录
            history.push({
                timestamp: now,
                usage: usagePercent,
                used: totalUsed,
                total: totalSize
            });
            
            // 清理过期记录
            history = history.filter(h => now - h.timestamp < historyWindow);
            MemoryManager._memoryHistory.set(pid, history);
            
            // 检测泄漏：如果内存使用持续增长
            if (history.length >= 3) {
                const recent = history.slice(-3);
                const trend = recent[2].usage - recent[0].usage;
                
                if (trend > 10 && recent[2].usage > 80) {
                    MemoryManager._log(1, `检测到潜在内存泄漏: 进程 ${pid}`, {
                        pid: pid,
                        programName: MemoryManager.getProgramName(pid),
                        currentUsage: recent[2].usage.toFixed(2) + '%',
                        trend: trend.toFixed(2) + '%',
                        history: recent
                    });
                }
            }
        });
        
        MemoryManager._log(3, "内存泄漏检测完成");
    }
    
    /**
     * 手动触发垃圾回收
     * @param {number} pid 进程ID（可选，如果指定则只回收该进程）
     * @returns {Object} 回收统计信息
     */
    static collectGarbage(pid = null) {
        MemoryManager._log(2, `手动触发垃圾回收`, { pid: pid });
        
        const result = {
            totalChecked: 0,
            totalFreed: 0,
            processes: []
        };
        
        const sop = MemoryManager.APPLICATION_SOP;
        const targetPids = pid ? [pid] : Array.from(sop.keys());
        
        targetPids.forEach(currentPid => {
            if (!sop.has(currentPid)) {
                return;
            }
            
            const appSpace = sop.get(currentPid);
            let processFreed = 0;
            
            appSpace.heaps.forEach((heap, heapId) => {
                result.totalChecked++;
                const beforeStatus = heap._getHeapStatus();
                
                if (MemoryManager._gcConfig.compactionEnabled) {
                    const freed = MemoryManager._compactHeap(heap);
                    processFreed += freed;
                }
                
                const afterStatus = heap._getHeapStatus();
                
                result.processes.push({
                    pid: currentPid,
                    heapId: heapId,
                    before: beforeStatus,
                    after: afterStatus,
                    freed: afterStatus.used - beforeStatus.used
                });
            });
            
            result.totalFreed += processFreed;
        });
        
        MemoryManager._log(2, `手动垃圾回收完成`, result);
        return result;
    }
    
    /**
     * 获取内存使用统计
     * @param {number} pid 进程ID（可选）
     * @returns {Object} 统计信息
     */
    static getMemoryStatistics(pid = null) {
        const sop = MemoryManager.APPLICATION_SOP;
        const stats = {
            totalProcesses: 0,
            totalHeaps: 0,
            totalSize: 0,
            totalUsed: 0,
            totalFree: 0,
            averageUsage: 0,
            processes: []
        };
        
        const targetPids = pid ? [pid] : Array.from(sop.keys());
        
        targetPids.forEach(currentPid => {
            if (!sop.has(currentPid)) {
                return;
            }
            
            const appSpace = sop.get(currentPid);
            let processSize = 0;
            let processUsed = 0;
            let processFree = 0;
            
            appSpace.heaps.forEach((heap) => {
                stats.totalHeaps++;
                const status = heap._getHeapStatus();
                processSize += status.total;
                processUsed += status.used;
                processFree += status.free;
            });
            
            const processUsage = processSize > 0 ? (processUsed / processSize) * 100 : 0;
            
            stats.processes.push({
                pid: currentPid,
                programName: MemoryManager.getProgramName(currentPid),
                heapCount: appSpace.heaps.size,
                totalSize: processSize,
                used: processUsed,
                free: processFree,
                usagePercent: processUsage.toFixed(2) + '%'
            });
            
            stats.totalSize += processSize;
            stats.totalUsed += processUsed;
            stats.totalFree += processFree;
        });
        
        stats.totalProcesses = stats.processes.length;
        stats.averageUsage = stats.totalSize > 0 ? (stats.totalUsed / stats.totalSize) * 100 : 0;
        
        return stats;
    }
    
    /**
     * 配置垃圾回收参数
     * @param {Object} config 配置对象
     */
    static configureGC(config) {
        if (typeof config !== 'object') {
            MemoryManager._log(1, "configureGC: 配置参数必须是对象");
            return;
        }
        
        Object.assign(MemoryManager._gcConfig, config);
        
        // 如果修改了间隔，重启定时器
        if (config.interval || config.leakDetectionInterval) {
            if (MemoryManager._gcTimer || MemoryManager._leakDetectionTimer) {
                MemoryManager.startGarbageCollection();
            }
        }
        
        MemoryManager._log(2, "垃圾回收配置已更新", MemoryManager._gcConfig);
    }
    
    /**
     * 获取垃圾回收配置
     * @returns {Object} 配置对象
     */
    static getGCConfig() {
        return { ...MemoryManager._gcConfig };
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
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "MemoryManager", MemoryManager);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.MemoryManager = MemoryManager;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.MemoryManager = MemoryManager;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.MemoryManager = MemoryManager;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.MemoryManager = MemoryManager;
    }
}

// 自动启动垃圾回收（延迟启动，确保系统完全初始化）
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                MemoryManager.startGarbageCollection();
            }, 5000); // 延迟5秒启动，确保系统完全初始化
        });
    } else {
        setTimeout(() => {
            MemoryManager.startGarbageCollection();
        }, 5000);
    }
} else {
    // 非浏览器环境，直接启动
    setTimeout(() => {
        MemoryManager.startGarbageCollection();
    }, 5000);
}

DependencyConfig.publishSignal("../kernel/memory/memoryManager.js");