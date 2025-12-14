// 内存管理工具模块
// 提供统一的数据存储和读取接口，简化程序使用内存管理的复杂度

KernelLogger.info("MemoryUtils", "模块初始化");

class MemoryUtils {
    /**
     * 获取程序的内存空间
     * @param {number} pid 进程ID
     * @returns {Object|null} { heap: Heap, shed: Shed } 或 null
     */
    static getAppMemory(pid) {
        if (!pid) {
            KernelLogger.warn("MemoryUtils", "getAppMemory: pid 无效");
            return null;
        }
        
        try {
            if (typeof MemoryManager === 'undefined') {
                return null;
            }
            
            const appSpace = MemoryManager.APPLICATION_SOP.get(pid);
            if (!appSpace) {
                return null;
            }
            
            // 获取默认的堆和栈（heapId=1, shedId=1）
            const heap = appSpace.heaps.get(1) || null;
            const shed = appSpace.sheds.get(1) || null;
            
            return { heap, shed };
        } catch (e) {
            KernelLogger.error("MemoryUtils", `getAppMemory 失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 确保程序已分配内存
     * @param {number} pid 进程ID
     * @param {number} heapSize 堆大小（-1表示不需要堆）
     * @param {number} shedSize 栈大小（-1表示不需要栈）
     * @returns {Object|null} { heap: Heap, shed: Shed } 或 null
     */
    static ensureMemory(pid, heapSize = 10000, shedSize = 1000) {
        if (!pid) {
            KernelLogger.warn("MemoryUtils", "ensureMemory: pid 无效");
            return null;
        }
        
        try {
            if (typeof MemoryManager === 'undefined') {
                KernelLogger.warn("MemoryUtils", "MemoryManager 不可用");
                return null;
            }
            
            // 检查是否已有内存
            let appSpace = MemoryManager.APPLICATION_SOP.get(pid);
            if (appSpace) {
                const heap = appSpace.heaps.get(1) || null;
                const shed = appSpace.sheds.get(1) || null;
                if (heap || shed) {
                    return { heap, shed };
                }
            }
            
            // 分配内存
            const result = MemoryManager.allocateMemory(pid, heapSize, shedSize, 1, 1);
            return {
                heap: result.heap || null,
                shed: result.shed || null
            };
        } catch (e) {
            KernelLogger.error("MemoryUtils", `ensureMemory 失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 存储数据到堆内存（JSON序列化）
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @param {*} data 要存储的数据
     * @returns {string|null} 内存地址（十六进制）或 null
     */
    static storeData(pid, key, data) {
        if (!pid || !key) {
            KernelLogger.warn("MemoryUtils", "storeData: 参数无效");
            return null;
        }
        
        try {
            let mem = MemoryUtils.getAppMemory(pid);
            if (!mem || !mem.heap) {
                // 尝试分配内存
                const newMem = MemoryUtils.ensureMemory(pid);
                if (!newMem || !newMem.heap) {
                    KernelLogger.error("MemoryUtils", `storeData 失败: 无法获取堆内存 (pid=${pid})`);
                    return null;
                }
                // 如果 mem 为 null，使用 newMem；否则更新 mem.heap
                if (!mem) {
                    mem = newMem;
                } else {
                    mem.heap = newMem.heap;
                }
            }
            
            // 序列化数据
            const jsonStr = JSON.stringify(data);
            
            // 写入堆内存（自动扩容已由Heap.alloc处理）
            let addr = mem.heap.alloc(jsonStr.length + 1);
            if (!addr) {
                // 如果分配失败，尝试手动扩容后重试
                const heapStatus = mem.heap._getHeapStatus();
                const needed = jsonStr.length + 1;
                const expansionSize = Math.max(needed * 2, mem.heap.heapSize * 0.5);
                
                KernelLogger.warn("MemoryUtils", "storeData: 内存分配失败，尝试扩容", {
                    needed: needed,
                    available: heapStatus.free,
                    currentSize: mem.heap.heapSize,
                    expansionSize: expansionSize
                });
                
                if (mem.heap.expand(Math.ceil(expansionSize))) {
                    // 扩容成功，重试分配
                    addr = mem.heap.alloc(needed, false); // 禁用自动扩容避免无限循环
                    if (!addr) {
                        KernelLogger.warn("MemoryUtils", "storeData: 扩容后仍分配失败");
                        return null;
                    }
                } else {
                    KernelLogger.warn("MemoryUtils", "storeData: 内存分配失败，扩容也失败");
                    return null;
                }
            }
            
            // 写入字符串
            const startIdx = Heap.addressing(addr, 10);
            for (let i = 0; i < jsonStr.length; i++) {
                if (startIdx + i < mem.heap.heapSize) {
                    mem.heap.writeData(Heap.addressing(startIdx + i, 16), jsonStr[i]);
                }
            }
            // 写入结束符
            if (startIdx + jsonStr.length < mem.heap.heapSize) {
                mem.heap.writeData(Heap.addressing(startIdx + jsonStr.length, 16), '\0');
            }
            
            // 在栈内存中存储地址映射（使用resourceLinkArea）
            if (mem.shed) {
                mem.shed.resourceLinkArea.set(key, addr);
            }
            
            return addr;
        } catch (e) {
            KernelLogger.error("MemoryUtils", `storeData 失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 从堆内存读取数据（JSON反序列化）
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @returns {*} 数据或 null
     */
    static loadData(pid, key) {
        if (!pid || !key) {
            KernelLogger.warn("MemoryUtils", "loadData: 参数无效");
            return null;
        }
        
        try {
            const mem = MemoryUtils.getAppMemory(pid);
            if (!mem || !mem.heap || !mem.shed) {
                return null;
            }
            
            // 从栈内存获取地址
            const addr = mem.shed.resourceLinkArea.get(key);
            if (!addr) {
                return null;
            }
            
            // 从堆内存读取字符串
            const jsonStr = mem.heap.readString(addr);
            if (!jsonStr) {
                return null;
            }
            
            // 反序列化
            return JSON.parse(jsonStr);
        } catch (e) {
            KernelLogger.error("MemoryUtils", `loadData 失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 更新堆内存中的数据
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @param {*} data 新数据
     * @returns {boolean} 是否成功
     */
    static updateData(pid, key, data) {
        if (!pid || !key) {
            KernelLogger.warn("MemoryUtils", "updateData: 参数无效");
            return false;
        }
        
        try {
            const mem = MemoryUtils.getAppMemory(pid);
            if (!mem || !mem.heap || !mem.shed) {
                return false;
            }
            
            // 获取旧地址
            const oldAddr = mem.shed.resourceLinkArea.get(key);
            
            // 释放旧内存（如果存在）
            if (oldAddr && typeof mem.heap.free === 'function') {
                try {
                    const oldStr = mem.heap.readString(oldAddr);
                    if (oldStr) {
                        mem.heap.free(oldAddr, oldStr.length + 1);
                    }
                } catch (e) {
                    // 忽略释放错误
                }
            }
            
            // 存储新数据
            const newAddr = MemoryUtils.storeData(pid, key, data);
            return newAddr !== null;
        } catch (e) {
            KernelLogger.error("MemoryUtils", `updateData 失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 删除数据
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @returns {boolean} 是否成功
     */
    static deleteData(pid, key) {
        if (!pid || !key) {
            KernelLogger.warn("MemoryUtils", "deleteData: 参数无效");
            return false;
        }
        
        try {
            const mem = MemoryUtils.getAppMemory(pid);
            if (!mem || !mem.heap || !mem.shed) {
                return false;
            }
            
            // 获取地址
            const addr = mem.shed.resourceLinkArea.get(key);
            if (!addr) {
                return true; // 不存在也算成功
            }
            
            // 释放内存
            if (typeof mem.heap.free === 'function') {
                try {
                    const str = mem.heap.readString(addr);
                    if (str) {
                        mem.heap.free(addr, str.length + 1);
                    }
                } catch (e) {
                    // 忽略释放错误
                }
            }
            
            // 从映射中删除
            mem.shed.resourceLinkArea.delete(key);
            
            return true;
        } catch (e) {
            KernelLogger.error("MemoryUtils", `deleteData 失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 存储字符串到堆内存
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @param {string} str 字符串
     * @returns {string|null} 内存地址或 null
     */
    static storeString(pid, key, str) {
        if (!pid || !key || typeof str !== 'string') {
            KernelLogger.warn("MemoryUtils", "storeString: 参数无效");
            return null;
        }
        
        try {
            let mem = MemoryUtils.getAppMemory(pid);
            if (!mem || !mem.heap) {
                const newMem = MemoryUtils.ensureMemory(pid);
                if (!newMem || !newMem.heap) {
                    KernelLogger.error("MemoryUtils", `storeString 失败: 无法获取堆内存 (pid=${pid})`);
                    return null;
                }
                // 如果 mem 为 null，使用 newMem；否则更新 mem.heap
                if (!mem) {
                    mem = newMem;
                } else {
                    mem.heap = newMem.heap;
                    if (newMem.shed) mem.shed = newMem.shed;
                }
            }
            
            // 分配内存（自动扩容已由Heap.alloc处理）
            let addr = mem.heap.alloc(str.length + 1);
            if (!addr) {
                // 如果分配失败，尝试手动扩容后重试
                const heapStatus = mem.heap._getHeapStatus();
                const needed = str.length + 1;
                const expansionSize = Math.max(needed * 2, mem.heap.heapSize * 0.5);
                
                KernelLogger.warn("MemoryUtils", "storeString: 内存分配失败，尝试扩容", {
                    needed: needed,
                    available: heapStatus.free,
                    currentSize: mem.heap.heapSize,
                    expansionSize: expansionSize
                });
                
                if (mem.heap.expand(Math.ceil(expansionSize))) {
                    // 扩容成功，重试分配
                    addr = mem.heap.alloc(needed, false); // 禁用自动扩容避免无限循环
                    if (!addr) {
                        KernelLogger.warn("MemoryUtils", "storeString: 扩容后仍分配失败");
                        return null;
                    }
                } else {
                    KernelLogger.warn("MemoryUtils", "storeString: 内存分配失败，扩容也失败");
                    return null;
                }
            }
            
            // 写入字符串
            const startIdx = Heap.addressing(addr, 10);
            for (let i = 0; i < str.length; i++) {
                if (startIdx + i < mem.heap.heapSize) {
                    mem.heap.writeData(Heap.addressing(startIdx + i, 16), str[i]);
                }
            }
            // 写入结束符
            if (startIdx + str.length < mem.heap.heapSize) {
                mem.heap.writeData(Heap.addressing(startIdx + str.length, 16), '\0');
            }
            
            // 存储地址映射
            if (mem.shed) {
                mem.shed.resourceLinkArea.set(key, addr);
            }
            
            return addr;
        } catch (e) {
            KernelLogger.error("MemoryUtils", `storeString 失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 从堆内存读取字符串
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @returns {string|null} 字符串或 null
     */
    static loadString(pid, key) {
        if (!pid || !key) {
            KernelLogger.warn("MemoryUtils", "loadString: 参数无效");
            return null;
        }
        
        try {
            const mem = MemoryUtils.getAppMemory(pid);
            if (!mem || !mem.heap || !mem.shed) {
                return null;
            }
            
            const addr = mem.shed.resourceLinkArea.get(key);
            if (!addr) {
                return null;
            }
            
            return mem.heap.readString(addr);
        } catch (e) {
            KernelLogger.error("MemoryUtils", `loadString 失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 存储数组到堆内存
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @param {Array} arr 数组
     * @returns {boolean} 是否成功
     */
    static storeArray(pid, key, arr) {
        return MemoryUtils.storeData(pid, key, arr) !== null;
    }
    
    /**
     * 从堆内存读取数组
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @returns {Array|null} 数组或 null
     */
    static loadArray(pid, key) {
        const data = MemoryUtils.loadData(pid, key);
        return Array.isArray(data) ? data : null;
    }
    
    /**
     * 存储对象到堆内存
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @param {Object} obj 对象
     * @returns {boolean} 是否成功
     */
    static storeObject(pid, key, obj) {
        return MemoryUtils.storeData(pid, key, obj) !== null;
    }
    
    /**
     * 从堆内存读取对象
     * @param {number} pid 进程ID
     * @param {string} key 数据键名
     * @returns {Object|null} 对象或 null
     */
    static loadObject(pid, key) {
        const data = MemoryUtils.loadData(pid, key);
        return (data && typeof data === 'object' && !Array.isArray(data)) ? data : null;
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.MemoryUtils = MemoryUtils;
}
if (typeof globalThis !== 'undefined') {
    globalThis.MemoryUtils = MemoryUtils;
}

// 注册到POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "MemoryUtils", MemoryUtils);
    } catch (e) {
        // 静默失败
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/memory/memoryUtils.js");
} else {
    if (typeof document !== 'undefined' && document.body) {
        const publishWhenReady = () => {
            if (typeof DependencyConfig !== 'undefined') {
                DependencyConfig.publishSignal("../kernel/memory/memoryUtils.js");
            } else {
                setTimeout(publishWhenReady, 10);
            }
        };
        publishWhenReady();
    }
}

