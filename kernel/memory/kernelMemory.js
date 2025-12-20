// 内核内存访问工具
// 用于内核代码访问Exploit程序的内存空间
// Exploit程序PID固定为10000，用于存储所有内核动态数据

KernelLogger.info("KernelMemory", "模块初始化");

class KernelMemory {
    // Exploit程序PID（固定）
    static EXPLOIT_PID = 10000;
    
    // Exploit内存ID（固定）
    static EXPLOIT_HEAP_ID = 1;
    static EXPLOIT_SHED_ID = 1;
    
    // Exploit内存大小（2MB Heap用于存储内核数据，增加以支持更多进程和更大的数据）
    static EXPLOIT_HEAP_SIZE = 2 * 1024 * 1024; // 2MB
    
    // 内存引用缓存（避免重复获取）
    static _memoryCache = null;
    
    // 防止递归调用的标志
    static _ensuringMemory = false;
    static _ensureMemoryCallCount = 0;
    static _maxEnsureMemoryCalls = 3;  // 最多允许3次调用，防止无限循环
    
    // 内存分配器：记录已分配的地址范围
    static _allocatedRanges = new Map();  // Map<startAddr, {size, key}>
    static _nextAddress = 0;  // 下一个可用地址
    
    /**
     * 确保Exploit内存已分配并可用
     * @returns {Object|null} { heap: Heap, shed: Shed } 或 null
     */
    static _ensureMemory() {
        // 防止递归调用
        if (KernelMemory._ensuringMemory) {
            // 如果正在确保内存，返回缓存（如果存在）
            if (KernelMemory._memoryCache) {
                return KernelMemory._memoryCache;
            }
            return null;
        }
        
        // 检查调用次数，防止无限循环
        KernelMemory._ensureMemoryCallCount++;
        if (KernelMemory._ensureMemoryCallCount > KernelMemory._maxEnsureMemoryCalls) {
            // 超过最大调用次数，返回缓存或null
            if (KernelMemory._memoryCache) {
                return KernelMemory._memoryCache;
            }
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("KernelMemory", `_ensureMemory 调用次数过多 (${KernelMemory._ensureMemoryCallCount})，可能存在循环调用`);
            }
            return null;
        }
        
        KernelMemory._ensuringMemory = true;
        
        try {
            // 检查缓存
            if (KernelMemory._memoryCache) {
                const { heap, shed } = KernelMemory._memoryCache;
                if (heap && shed && heap.heapSize > 0) {
                    KernelMemory._ensuringMemory = false;
                    KernelMemory._ensureMemoryCallCount = 0;  // 成功时重置计数
                    return KernelMemory._memoryCache;
                }
                // 缓存无效，清除
                KernelMemory._memoryCache = null;
            }
            
            // 检查依赖
            if (typeof MemoryManager === 'undefined') {
                KernelMemory._ensuringMemory = false;
                return null;
            }
            
            // 直接访问缓存的Map，避免每次都重新加载
            // 注意：APPLICATION_SOP 是 getter，但第一次访问后会缓存
            const sop = MemoryManager.APPLICATION_SOP;
            
            // 检查是否已分配内存（直接检查缓存中的Map）
            let appSpace = sop.get(KernelMemory.EXPLOIT_PID);
            
            // 如果分区不存在，创建它
            if (!appSpace) {
                appSpace = {
                    heaps: new Map(),
                    sheds: new Map(),
                    nextHeapId: 1,
                    nextShedId: 1
                };
                sop.set(KernelMemory.EXPLOIT_PID, appSpace);
                // 延迟保存，避免在内存初始化时触发循环
                // MemoryManager._saveApplicationSOP(sop);
            }
            
            // 确保 heaps 和 sheds Map 存在
            if (!appSpace.heaps) {
                appSpace.heaps = new Map();
            }
            if (!appSpace.sheds) {
                appSpace.sheds = new Map();
            }
            
            // 检查Heap和Shed是否都已存在
            const heapExists = appSpace.heaps.has(KernelMemory.EXPLOIT_HEAP_ID);
            const shedExists = appSpace.sheds.has(KernelMemory.EXPLOIT_SHED_ID);
            
            if (!heapExists || !shedExists) {
                // 分配内存
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("KernelMemory", `为Exploit程序分配内存 (PID: ${KernelMemory.EXPLOIT_PID}, Heap: ${KernelMemory.EXPLOIT_HEAP_SIZE} bytes)`);
                }
                // 分配内存（需要Shed来存储地址映射信息）
                const result = MemoryManager.allocateMemory(
                    KernelMemory.EXPLOIT_PID,
                    KernelMemory.EXPLOIT_HEAP_SIZE,
                    1000,  // 需要Shed来存储地址映射（resourceLinkArea）
                    KernelMemory.EXPLOIT_HEAP_ID,
                    KernelMemory.EXPLOIT_SHED_ID
                );
                
                if (!result || !result.heap) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("KernelMemory", "Exploit内存分配失败");
                    }
                    return null;
                }
                
                // 注册程序名称（延迟注册，避免在内存初始化时触发循环）
                // 注意：registerProgramName 会在后续调用时自动处理
            }
            
            // 在内存完全初始化后，保存 APPLICATION_SOP 和注册程序名称
            if (KernelMemory._memoryCache) {
                // 延迟执行，避免在初始化过程中触发循环
                setTimeout(() => {
                    if (typeof MemoryManager !== 'undefined') {
                        try {
                            const finalSop = MemoryManager.APPLICATION_SOP;
                            if (finalSop) {
                                MemoryManager._saveApplicationSOP(finalSop);
                            }
                            if (typeof MemoryManager.registerProgramName === 'function') {
                                MemoryManager.registerProgramName(KernelMemory.EXPLOIT_PID, 'Exploit');
                            }
                        } catch (e) {
                            // 静默失败，避免日志爆炸
                        }
                    }
                }, 50);
            }
            
            // 再次获取内存引用（从缓存中）
            appSpace = sop.get(KernelMemory.EXPLOIT_PID);
            if (!appSpace) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("KernelMemory", "无法获取Exploit内存空间");
                }
                return null;
            }
            
            const heap = appSpace.heaps.get(KernelMemory.EXPLOIT_HEAP_ID);
            const shed = appSpace.sheds.get(KernelMemory.EXPLOIT_SHED_ID);
            
            if (!heap) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("KernelMemory", "无法获取Exploit Heap");
                }
                return null;
            }
            
            // 缓存内存引用
            KernelMemory._memoryCache = { heap, shed };
            KernelMemory._ensureMemoryCallCount = 0;  // 成功时重置计数
            return KernelMemory._memoryCache;
        } catch (e) {
            if (typeof KernelLogger !== 'undefined' && KernelMemory._ensureMemoryCallCount <= 1) {
                // 只在第一次调用时记录错误，避免日志爆炸
                KernelLogger.error("KernelMemory", `确保Exploit内存失败: ${e.message}`, e);
            }
            return null;
        } finally {
            KernelMemory._ensuringMemory = false;
        }
    }
    
    /**
     * 保存数据到Exploit内存
     * @param {string} key 数据键名
     * @param {*} data 要保存的数据（会被序列化为JSON）
     * @returns {boolean} 是否成功
     */
    static saveData(key, data) {
        // 防止在加载 APPLICATION_SOP 时保存数据，避免循环
        if (key === 'APPLICATION_SOP' && typeof MemoryManager !== 'undefined' && MemoryManager._loadingApplicationSOP) {
            return false;  // 静默失败，避免循环
        }
        
        const memory = KernelMemory._ensureMemory();
        if (!memory || !memory.heap) {
            // 只在第一次失败时记录错误
            if (KernelMemory._ensureMemoryCallCount <= 1) {
                KernelLogger.error("KernelMemory", `保存数据失败: 内存不可用 (key: ${key})`);
            }
            return false;
        }
        
        try {
            // 序列化数据
            const jsonStr = JSON.stringify(data);
            const dataSize = jsonStr.length;
            
            // 检查Heap是否有足够空间
            if (dataSize > memory.heap.heapSize) {
                KernelLogger.error("KernelMemory", `数据太大，无法存储 (key: ${key}, size: ${dataSize}, heapSize: ${memory.heap.heapSize})`);
                return false;
            }
            
            // 查找或释放旧数据占用的地址
            let startAddr = null;
            let oldSize = 0;
            if (memory.shed) {
                const oldAddrStr = memory.shed.readResourceLink(`${key}_ADDR`);
                const oldSizeStr = memory.shed.readResourceLink(`${key}_SIZE`);
                if (oldAddrStr) {
                    const oldAddr = parseInt(oldAddrStr);
                    oldSize = oldSizeStr ? parseInt(oldSizeStr) : 0;
                    if (!isNaN(oldAddr) && oldAddr >= 0 && oldSize > 0) {
                        // 先清理旧数据（填充null）
                        for (let i = 0; i < oldSize; i++) {
                            memory.heap.writeData(oldAddr + i, null);
                        }
                        // 释放旧地址
                        KernelMemory._allocatedRanges.delete(oldAddr);
                        // 如果新数据大小小于等于旧数据大小，可以重用地址
                        if (dataSize <= oldSize) {
                            startAddr = oldAddr;
                        }
                    }
                }
            }
            
            // 如果没有旧地址或新数据更大，查找空闲地址
            if (startAddr === null) {
                // 改进的线性分配：先尝试从_nextAddress开始，如果失败则从头开始查找
                let found = false;
                
                // 第一轮：从_nextAddress开始查找（优先使用连续空间）
                for (let addr = KernelMemory._nextAddress; addr <= memory.heap.heapSize - dataSize; addr++) {
                    // 检查这个地址范围是否已被分配
                    let conflict = false;
                    for (const [allocatedAddr, range] of KernelMemory._allocatedRanges.entries()) {
                        if (addr < allocatedAddr + range.size && addr + dataSize > allocatedAddr) {
                            conflict = true;
                            break;
                        }
                    }
                    
                    if (!conflict) {
                        startAddr = addr;
                        found = true;
                        KernelMemory._nextAddress = addr + dataSize;
                        break;
                    }
                }
                
                // 第二轮：如果第一轮失败，从头开始查找（处理内存碎片）
                if (!found) {
                    KernelLogger.debug("KernelMemory", `从_nextAddress(${KernelMemory._nextAddress})未找到空间，尝试从头查找 (key: ${key}, size: ${dataSize})`);
                    for (let addr = 0; addr <= memory.heap.heapSize - dataSize; addr++) {
                        // 检查这个地址范围是否已被分配
                        let conflict = false;
                        for (const [allocatedAddr, range] of KernelMemory._allocatedRanges.entries()) {
                            if (addr < allocatedAddr + range.size && addr + dataSize > allocatedAddr) {
                                conflict = true;
                                break;
                            }
                        }
                        
                        if (!conflict) {
                            startAddr = addr;
                            found = true;
                            KernelMemory._nextAddress = addr + dataSize;
                            KernelLogger.debug("KernelMemory", `从头查找找到空间: addr=${addr} (key: ${key})`);
                            break;
                        }
                    }
                }
                
                if (!found) {
                    // 尝试内存压缩：清理已删除的数据
                    KernelLogger.warn("KernelMemory", `无法找到足够的内存空间，尝试清理内存 (key: ${key}, size: ${dataSize})`);
                    
                    // 检查是否有可以清理的无效数据
                    let cleaned = false;
                    for (const [allocatedAddr, range] of KernelMemory._allocatedRanges.entries()) {
                        // 检查这个范围是否真的在使用（通过检查shed中的链接）
                        if (memory.shed) {
                            const addrStr = memory.shed.readResourceLink(`${range.key}_ADDR`);
                            if (!addrStr || parseInt(addrStr) !== allocatedAddr) {
                                // 这个地址范围已经无效，可以清理
                                KernelLogger.debug("KernelMemory", `清理无效内存范围: addr=${allocatedAddr}, size=${range.size}, key=${range.key}`);
                                for (let i = 0; i < range.size; i++) {
                                    memory.heap.writeData(allocatedAddr + i, null);
                                }
                                KernelMemory._allocatedRanges.delete(allocatedAddr);
                                cleaned = true;
                            }
                        }
                    }
                    
                    // 如果清理了内存，再次尝试分配
                    if (cleaned) {
                        for (let addr = 0; addr <= memory.heap.heapSize - dataSize; addr++) {
                            let conflict = false;
                            for (const [allocatedAddr, range] of KernelMemory._allocatedRanges.entries()) {
                                if (addr < allocatedAddr + range.size && addr + dataSize > allocatedAddr) {
                                    conflict = true;
                                    break;
                                }
                            }
                            
                            if (!conflict) {
                                startAddr = addr;
                                found = true;
                                KernelMemory._nextAddress = addr + dataSize;
                                KernelLogger.info("KernelMemory", `清理后找到空间: addr=${addr} (key: ${key})`);
                                break;
                            }
                        }
                    }
                    
                    if (!found) {
                        // 计算已使用的内存和可用内存
                        let totalUsed = 0;
                        for (const [allocatedAddr, range] of KernelMemory._allocatedRanges.entries()) {
                            totalUsed += range.size;
                        }
                        const available = memory.heap.heapSize - totalUsed;
                        
                        KernelLogger.error("KernelMemory", `无法找到足够的内存空间 (key: ${key}, size: ${dataSize}, heapSize: ${memory.heap.heapSize}, used: ${totalUsed}, available: ${available}, allocatedRanges: ${KernelMemory._allocatedRanges.size})`);
                        return false;
                    }
                }
            }
            
            // 先清理要写入的地址范围（确保没有残留数据）
            // 如果重用旧地址且新数据更小，需要清理超出部分
            const maxSize = oldSize > 0 ? Math.max(dataSize, oldSize) : dataSize;
            for (let i = 0; i < maxSize; i++) {
                memory.heap.writeData(startAddr + i, null);
            }
            
            // 写入数据（确保每个字符都是字符串类型）
            for (let i = 0; i < dataSize; i++) {
                const char = jsonStr[i];
                if (char === undefined || char === null) {
                    // 如果字符不存在，写入空字符
                    memory.heap.writeData(startAddr + i, '');
                } else {
                    // 确保写入的是字符串类型（只写入单个字符）
                    const charStr = String(char);
                    const charToWrite = charStr.length > 0 ? charStr[0] : '';
                    const success = memory.heap.writeData(startAddr + i, charToWrite);
                    if (!success) {
                        KernelLogger.error("KernelMemory", `写入数据失败 (key: ${key}, addr: ${startAddr + i})`);
                        return false;
                    }
                }
            }
            
            // 记录分配的地址范围
            KernelMemory._allocatedRanges.set(startAddr, { size: dataSize, key: key });
            
            // 在Shed的resourceLinkArea中保存地址和大小信息
            if (memory.shed) {
                memory.shed.writeResourceLink(`${key}_ADDR`, String(startAddr));
                memory.shed.writeResourceLink(`${key}_SIZE`, String(dataSize));
            }
            
            // 移除成功日志，这是高频操作，会产生大量日志
            // 只保留错误日志（保存失败时）
            return true;
        } catch (e) {
            KernelLogger.error("KernelMemory", `保存数据失败 (key: ${key}): ${e.message}`, e);
            return false;
        }
    }
    
    /**
     * 从Exploit内存加载数据
     * @param {string} key 数据键名
     * @returns {*|null} 加载的数据或null
     */
    static loadData(key) {
        // 防止在加载 APPLICATION_SOP 时再次加载，避免循环
        if (key === 'APPLICATION_SOP' && typeof MemoryManager !== 'undefined' && MemoryManager._loadingApplicationSOP) {
            return null;  // 返回null，避免循环
        }
        
        const memory = KernelMemory._ensureMemory();
        if (!memory || !memory.heap || !memory.shed) {
            // 只在第一次失败时记录错误
            if (KernelMemory._ensureMemoryCallCount <= 1) {
                KernelLogger.error("KernelMemory", `加载数据失败: 内存不可用 (key: ${key})`);
            }
            return null;
        }
        
        try {
            // 从Shed的resourceLinkArea中读取地址和大小
            const addrStr = memory.shed.readResourceLink(`${key}_ADDR`);
            const sizeStr = memory.shed.readResourceLink(`${key}_SIZE`);
            
            if (!addrStr || !sizeStr) {
                // 数据不存在（减少日志输出，避免频繁的调试日志）
                // 只在特定情况下输出日志（如非系统初始化阶段）
                // KernelLogger.debug("KernelMemory", `数据不存在 (key: ${key})`);
                return null;
            }
            
            const addr = parseInt(addrStr);
            const size = parseInt(sizeStr);
            
            if (isNaN(addr) || isNaN(size) || addr < 0 || size <= 0) {
                KernelLogger.error("KernelMemory", `无效的地址或大小 (key: ${key}, addr: ${addrStr}, size: ${sizeStr})`);
                return null;
            }
            
            // 从Heap中读取数据
            let jsonStr = '';
            let nullCount = 0;  // 连续null计数
            const maxNullCount = 10;  // 最多允许10个连续null，超过则认为数据结束
            
            for (let i = 0; i < size; i++) {
                const char = memory.heap.readData(addr + i);
                
                // 如果遇到null或undefined，增加计数
                if (char === null || char === undefined) {
                    nullCount++;
                    // 如果连续null太多，可能数据已结束，停止读取
                    if (nullCount > maxNullCount) {
                        break;
                    }
                    continue;
                }
                
                // 重置null计数
                nullCount = 0;
                
                // 处理非null值
                if (typeof char === 'string') {
                    // 如果字符串长度为1，直接添加
                    if (char.length === 1) {
                        jsonStr += char;
                    } else if (char.length > 1) {
                        // 如果字符串长度大于1，只取第一个字符（可能是数据损坏）
                        jsonStr += char[0];
                    } else {
                        // 空字符串，跳过
                    }
                } else if (typeof char === 'number') {
                    // 数字类型转换为字符
                    jsonStr += String.fromCharCode(char);
                } else {
                    // 其他类型转换为字符串（只取第一个字符）
                    const str = String(char);
                    if (str.length > 0) {
                        jsonStr += str[0];
                    }
                }
            }
            
            // 清理字符串（移除尾部的null字符和空白字符）
            // 移除所有null字符（\0）和undefined字符
            jsonStr = jsonStr.replace(/\0/g, '').replace(/undefined/g, '').trim();
            
            // 检查是否为空
            if (!jsonStr || jsonStr.length === 0) {
                KernelLogger.debug("KernelMemory", `数据为空 (key: ${key})`);
                return null;
            }
            
            // 反序列化数据
            try {
                const data = JSON.parse(jsonStr);
                // 移除成功日志，这是高频操作，会产生大量日志
                return data;
            } catch (e) {
                // 如果JSON解析失败，尝试处理特殊情况
                // 对于布尔值，尝试直接转换
                if (jsonStr === 'true' || jsonStr === 'True' || jsonStr === 'TRUE') {
                    return true;
                }
                if (jsonStr === 'false' || jsonStr === 'False' || jsonStr === 'FALSE') {
                    return false;
                }
                // 对于数字，尝试直接转换
                if (/^-?\d+$/.test(jsonStr)) {
                    return parseInt(jsonStr, 10);
                }
                if (/^-?\d+\.\d+$/.test(jsonStr)) {
                    return parseFloat(jsonStr);
                }
                // 如果都失败了，记录错误并返回null
                KernelLogger.error("KernelMemory", `加载数据失败 (key: ${key}): ${e.message}, 原始数据: ${jsonStr.substring(0, 100)}`, e);
                return null;
            }
        } catch (e) {
            KernelLogger.error("KernelMemory", `加载数据失败 (key: ${key}): ${e.message}`, e);
            return null;
        }
    }
    
    /**
     * 删除数据（释放内存）
     * @param {string} key 数据键名
     * @returns {boolean} 是否成功
     */
    static deleteData(key) {
        const memory = KernelMemory._ensureMemory();
        if (!memory || !memory.shed) {
            return false;
        }
        
        try {
            // 从Shed中获取地址信息
            const addrStr = memory.shed.readResourceLink(`${key}_ADDR`);
            if (addrStr) {
                const addr = parseInt(addrStr);
                if (!isNaN(addr) && addr >= 0) {
                    // 从分配记录中删除
                    KernelMemory._allocatedRanges.delete(addr);
                }
            }
            
            // 从Shed中删除地址和大小信息
            // 注意：Heap中的内存会在下次分配时被覆盖，不需要手动释放
            memory.shed.writeResourceLink(`${key}_ADDR`, '');
            memory.shed.writeResourceLink(`${key}_SIZE`, '');
            
            KernelLogger.debug("KernelMemory", `删除数据成功 (key: ${key})`);
            return true;
        } catch (e) {
            KernelLogger.error("KernelMemory", `删除数据失败 (key: ${key}): ${e.message}`, e);
            return false;
        }
    }
    
    /**
     * 检查数据是否存在
     * @param {string} key 数据键名
     * @returns {boolean} 是否存在
     */
    static hasData(key) {
        const memory = KernelMemory._ensureMemory();
        if (!memory || !memory.shed) {
            return false;
        }
        
        const addrStr = memory.shed.readResourceLink(`${key}_ADDR`);
        return addrStr !== null && addrStr !== '';
    }
    
    /**
     * 获取Exploit内存使用情况
     * @returns {Object} 内存使用情况
     */
    static getMemoryUsage() {
        const memory = KernelMemory._ensureMemory();
        if (!memory || !memory.heap) {
            return {
                available: false,
                heapSize: 0,
                heapUsed: 0,
                heapFree: 0
            };
        }
        
        try {
            const heap = memory.heap;
            const heapSize = heap.heapSize || 0;
            const heapUsed = heap.usedSize || 0;
            const heapFree = heapSize - heapUsed;
            
            return {
                available: true,
                heapSize,
                heapUsed,
                heapFree,
                usagePercent: heapSize > 0 ? ((heapUsed / heapSize) * 100).toFixed(2) : 0
            };
        } catch (e) {
            KernelLogger.error("KernelMemory", `获取内存使用情况失败: ${e.message}`, e);
            return {
                available: false,
                heapSize: 0,
                heapUsed: 0,
                heapFree: 0
            };
        }
    }
}

// 注册到POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        POOL.__INIT__("KERNEL_GLOBAL_POOL");
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "KernelMemory", KernelMemory);
    } catch (e) {
        // POOL可能还未初始化，稍后重试
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug("KernelMemory", "注册到POOL失败，将在稍后重试", e);
        }
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/memory/kernelMemory.js");
}

