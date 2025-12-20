// 对于专一的应用程序分配堆内存(用于存放活跃的数据)
KernelLogger.info("Heap", "模块初始化");
class Heap {
    // 日志级别: 使用 LogLevel.LEVEL 枚举
    static logLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.DEBUG) ? LogLevel.LEVEL.DEBUG : 3;
    
    // 寻址类型常量（用于内部使用）
    static _getHexType() {
        return (typeof AddressType !== 'undefined' && AddressType.TYPE.HEX) ? AddressType.TYPE.HEX : 16;
    }
    
    static _getDecimalType() {
        return (typeof AddressType !== 'undefined' && AddressType.TYPE.DECIMAL) ? AddressType.TYPE.DECIMAL : 10;
    }

    static setLogLevel(lvl) {
        this.logLevel = lvl;
    }

    static _log(level, methodName, instanceId, message, ...meta) {
        if (Heap.logLevel >= level) {
            const debugLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.DEBUG) ? LogLevel.LEVEL.DEBUG : 3;
            const infoLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.INFO) ? LogLevel.LEVEL.INFO : 2;
            const errorLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.ERROR) ? LogLevel.LEVEL.ERROR : 1;
            const debugName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.DEBUG) ? LogLevel.NAME.DEBUG : "DEBUG";
            const infoName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.INFO) ? LogLevel.NAME.INFO : "INFO";
            const errorName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.ERROR) ? LogLevel.NAME.ERROR : "ERROR";
            const lvlName = level >= debugLevel ? debugName : level >= infoLevel ? infoName : errorName;
            const subsystem = "Heap";
            // 构建详细的日志消息
            let fullMessage = '';
            if (instanceId) {
                fullMessage = `[heapId=${instanceId}]`;
            }
            if (methodName) {
                fullMessage += `[${methodName}]`;
            }
            if (message) {
                fullMessage += ` ${message}`;
            }
            
            // 合并所有元数据
            const allMeta = meta.length > 0 ? meta : undefined;
            KernelLogger.log(lvlName, subsystem, fullMessage, allMeta);
            return;
        }
    }
    
    // 获取堆状态摘要（用于日志）
    _getHeapStatus() {
        let used = 0;
        let free = 0;
        for (let i = 0; i < this.heapSize; i++) {
            if (this.memoryDataList[i] === null) free++;
            else used++;
        }
        return {
            heapId: this.heapId,
            pid: this.pid,
            total: this.heapSize,
            used: used,
            free: free,
            usagePercent: ((used / this.heapSize) * 100).toFixed(2) + '%'
        };
    }
    // 内存堆栈
    // memoryDataList = [Array<Object>]
    // 堆内存id
    // heapId = [int(16)]
    // 堆内存大小
    // heapSize = [long]
    // 程序id
    // pid = [int(16)]
    // 堆内存大小
    // heapSize = [long]
    // 构造函数
    constructor(pid, size, heapId) {
        const pidHex = Heap.addressing(pid, Heap._getHexType());
        const sizeHex = Heap.addressing(size, Heap._getHexType());
        // 降低日志级别：从DEBUG(3)降到INFO(2)，减少日志输出
        Heap._log(2, 'constructor', null, `程序 ${pidHex} 申请内存 ${sizeHex} (${size} bytes)`, {
            pid: pid,
            pidHex: pidHex,
            size: size,
            sizeHex: sizeHex,
            heapId: heapId
        });
        
        this.memoryDataList = new Array(size);
        for (let i = 0; i < size; i++) {
            this.memoryDataList[i] = null;
        }
        this.pid = Heap.addressing(String(pid), Heap._getHexType());
        this.heapId = Heap.addressing(String(heapId), Heap._getHexType());
        this.heapSize = size;
        
        // 移除初始化完成的详细日志，减少日志输出
        // const status = this._getHeapStatus();
        // Heap._log(2, 'constructor', this.heapId, `初始化完成`, status);
    }
    // 写入数据
    writeData(addr, data) {
        const idx = Heap.addressing(addr, Heap._getDecimalType());
        const addrHex = Heap.addressing(addr, Heap._getHexType());
        
        // 边界检查
        if (idx < 0 || idx >= this.heapSize) {
            Heap._log(1, 'writeData', this.heapId, `写入失败: 地址越界`, {
                addr: addr,
                addrHex: addrHex,
                idx: idx,
                heapSize: this.heapSize,
                data: data,
                dataType: typeof data
            });
            return false;
        }
        
        const oldValue = this.memoryDataList[idx];
        this.memoryDataList[idx] = data;
        
        // 移除成功日志，这是高频操作，会产生大量日志
        // 只保留错误日志（地址越界时）
        return true;
    }
    // 读取数据
    readData(addr) {
        const idx = Heap.addressing(addr, Heap._getDecimalType());
        const addrHex = Heap.addressing(addr, Heap._getHexType());
        
        // 边界检查
        if (idx < 0 || idx >= this.heapSize) {
            Heap._log(1, 'readData', this.heapId, `读取失败: 地址越界`, {
                addr: addr,
                addrHex: addrHex,
                idx: idx,
                heapSize: this.heapSize
            });
            return null;
        }
        
        const v = this.memoryDataList[idx];
        // 移除成功日志，这是高频操作，会产生大量日志
        // 只保留错误日志（地址越界时）
        return v;
    }
    
    // 批量读取数据（从起始地址读取指定长度的数据）
    // 返回数组，包含读取到的所有数据
    readDataRange(addr, length) {
        const startIdx = Heap.addressing(addr, Heap._getDecimalType());
        const addrHex = Heap.addressing(addr, Heap._getHexType());
        
        // 参数验证
        if (!length || length <= 0) {
            Heap._log(1, 'readDataRange', this.heapId, `批量读取失败: 长度无效`, {
                addr: addr,
                addrHex: addrHex,
                length: length
            });
            return [];
        }
        
        // 边界检查
        if (startIdx < 0 || startIdx >= this.heapSize) {
            Heap._log(1, 'readDataRange', this.heapId, `批量读取失败: 起始地址越界`, {
                addr: addr,
                addrHex: addrHex,
                startIdx: startIdx,
                heapSize: this.heapSize,
                length: length
            });
            return [];
        }
        
        const endIdx = Math.min(startIdx + length, this.heapSize);
        const result = [];
        
        for (let i = startIdx; i < endIdx; i++) {
            const value = this.memoryDataList[i];
            result.push(value);
        }
        
        // 移除成功日志，这是高频操作，会产生大量日志
        // 只保留错误日志（参数无效或地址越界时）
        
        return result;
    }
    
    // 批量读取字符串（从起始地址读取直到遇到结束符或达到最大长度）
    // 返回完整的字符串
    readString(addr, maxLength = null) {
        const startIdx = Heap.addressing(addr, Heap._getDecimalType());
        const addrHex = Heap.addressing(addr, Heap._getHexType());
        
        // 边界检查
        if (startIdx < 0 || startIdx >= this.heapSize) {
            Heap._log(1, 'readString', this.heapId, `读取字符串失败: 起始地址越界`, {
                addr: addr,
                addrHex: addrHex,
                startIdx: startIdx,
                heapSize: this.heapSize,
                maxLength: maxLength
            });
            return null;
        }
        
        const maxRead = maxLength || (this.heapSize - startIdx);
        const endIdx = Math.min(startIdx + maxRead, this.heapSize);
        
        // 批量读取一段数据
        const dataRange = this.readDataRange(addr, maxRead);
        
        let result = '';
        let actualLength = 0;
        
        for (let i = 0; i < dataRange.length; i++) {
            const char = dataRange[i];
            
            // 遇到结束符或预留标记，停止读取
            if (char === null || char === '\0' || (typeof char === 'object' && char && char.__reserved)) {
                break;
            }
            
            // 只处理单字符字符串
            if (typeof char === 'string' && char.length === 1) {
                result += char;
                actualLength++;
            } else {
                break;
            }
        }
        
        // 移除成功日志，这是高频操作，会产生大量日志
        // 只保留错误日志（地址越界时）
        
        return result || null;
    }
    // 删除
    deleteData(addr, offset) {
        let i = Heap.addressing(addr, Heap._getDecimalType());
        const end = offset || i + 1;
        // 移除成功日志，这是高频操作，会产生大量日志
        for (; i < end; i++) {
            this.memoryDataList[i] = null;
        }
    }
    // 改数据
    setData(addr, data) {
        // 移除成功日志，这是高频操作，会产生大量日志
        this.deleteData(addr);
        this.writeData(addr, data);
    }
    // 查询堆内存总空间
    queryTotalSpace() {
        return {
            start: "0x0",
            offset: Heap.addressing(this.heapSize, Heap._getHexType()),
        };
    }
    // 查询堆内存内容
    queryHeapSpace() {
        let start = "0x0";
        let offset = this.heapSize;
        let endCall = new Array();
        for (let i = Heap.addressing(start, Heap._getDecimalType()); i < offset; i++) {
            endCall[i] = {
                addr: Heap.addressing(i, Heap._getHexType()),
                data: this.readData(Heap.addressing(i, Heap._getHexType())),
            };
        }
        Heap._log(2, `queryHeapSpace returned ${endCall.length} entries`);
        return endCall;
    }
    /**
     * 扩容堆内存
     * @param {number} additionalSize 额外增加的大小（块数）
     * @returns {boolean} 是否成功
     */
    expand(additionalSize) {
        if (!additionalSize || additionalSize <= 0) {
            Heap._log(1, 'expand', this.heapId, `扩容失败: 增加大小无效`, {
                additionalSize: additionalSize
            });
            return false;
        }
        
        const oldSize = this.heapSize;
        const newSize = oldSize + additionalSize;
        const oldStatus = this._getHeapStatus();
        
        Heap._log(2, 'expand', this.heapId, `开始扩容`, {
            oldSize: oldSize,
            newSize: newSize,
            additionalSize: additionalSize,
            oldStatus: oldStatus
        });
        
        try {
            // 创建新的内存数组
            const newMemoryDataList = new Array(newSize);
            
            // 复制原有数据
            for (let i = 0; i < oldSize; i++) {
                newMemoryDataList[i] = this.memoryDataList[i];
            }
            
            // 初始化新增的内存空间
            for (let i = oldSize; i < newSize; i++) {
                newMemoryDataList[i] = null;
            }
            
            // 替换内存数组
            this.memoryDataList = newMemoryDataList;
            this.heapSize = newSize;
            
            const newStatus = this._getHeapStatus();
            Heap._log(2, 'expand', this.heapId, `扩容成功`, {
                oldSize: oldSize,
                newSize: newSize,
                additionalSize: additionalSize,
                oldStatus: oldStatus,
                newStatus: newStatus
            });
            
            return true;
        } catch (e) {
            Heap._log(1, 'expand', this.heapId, `扩容失败: ${e.message}`, {
                additionalSize: additionalSize,
                error: e
            });
            return false;
        }
    }
    
    // 分配连续块，返回起始地址（hex 字符串），若分配失败返回 null
    alloc(count, autoExpand = true) {
        if (!count || count <= 0) {
            Heap._log(1, 'alloc', this.heapId, `分配失败: 请求大小无效`, {
                count: count,
                heapStatus: this._getHeapStatus()
            });
            return null;
        }
        
        const heapStatus = this._getHeapStatus();
        Heap._log(2, 'alloc', this.heapId, `请求分配 ${count} 个块`, {
            count: count,
            heapStatus: heapStatus,
            hasEnoughSpace: heapStatus.free >= count
        });
        
        let consec = 0;
        let searchStart = 0;
        
        for (let i = 0; i < this.heapSize; i++) {
            if (this.memoryDataList[i] === null) {
                consec++;
            } else {
                consec = 0;
            }
            if (consec === count) {
                const start = i - count + 1;
                // 标记为预留
                for (let j = start; j <= i; j++) {
                    this.memoryDataList[j] = {
                        __reserved: true,
                        base: start,
                        length: count,
                    };
                }
                const addr = Heap.addressing(start, Heap._getHexType());
                const newStatus = this._getHeapStatus();
                
                Heap._log(2, 'alloc', this.heapId, `分配成功`, {
                    addr: addr,
                    addrHex: addr,
                    startIdx: start,
                    count: count,
                    searchIterations: i - searchStart + 1,
                    oldStatus: heapStatus,
                    newStatus: newStatus
                });
                return addr;
            }
        }
        
        // 分配失败，检查是否需要自动扩容
        if (autoExpand) {
            const usagePercent = (heapStatus.used / heapStatus.total) * 100;
            const EXPANSION_THRESHOLD = 80; // 使用率达到80%时扩容
            const MIN_EXPANSION_SIZE = Math.max(count * 2, this.heapSize * 0.5); // 至少扩容到能容纳当前请求的2倍，或当前大小的50%
            
            if (usagePercent >= EXPANSION_THRESHOLD || heapStatus.free < count) {
                Heap._log(2, 'alloc', this.heapId, `内存不足，尝试自动扩容`, {
                    usagePercent: usagePercent.toFixed(2) + '%',
                    threshold: EXPANSION_THRESHOLD + '%',
                    needed: count,
                    available: heapStatus.free,
                    expansionSize: MIN_EXPANSION_SIZE
                });
                
                // 尝试扩容
                const expansionSize = Math.ceil(MIN_EXPANSION_SIZE);
                if (this.expand(expansionSize)) {
                    // 扩容成功，重试分配
                    Heap._log(2, 'alloc', this.heapId, `扩容成功，重试分配`, {
                        expansionSize: expansionSize,
                        newHeapSize: this.heapSize
                    });
                    return this.alloc(count, false); // 递归调用，但禁用自动扩容避免无限循环
                } else {
                    Heap._log(1, 'alloc', this.heapId, `扩容失败，分配失败`, {
                        expansionSize: expansionSize
                    });
                }
            }
        }
        
        Heap._log(1, 'alloc', this.heapId, `分配失败: 内存不足`, {
            count: count,
            heapStatus: heapStatus,
            availableFree: heapStatus.free,
            needed: count
        });
        return null;
    }

    // 释放所有内存
    freeAll(){
        Heap._log(2, `释放所有堆内存 heapId=${this.heapId}`);
        this.memoryDataList = [];
        Heap._log(2, `释放所有堆内存完成 heapId=${this.heapId}`);
    }

    // 释放从 addr 开始的块，可传入 size，否则尝试读取预留元信息
    free(addr, size) {
        const idx = Heap.addressing(addr, Heap._getDecimalType());
        const addrHex = Heap.addressing(addr, Heap._getHexType());
        
        if (idx < 0 || idx >= this.heapSize) {
            Heap._log(1, 'free', this.heapId, `释放失败: 地址越界`, {
                addr: addr,
                addrHex: addrHex,
                idx: idx,
                heapSize: this.heapSize
            });
            return false;
        }
        
        const oldStatus = this._getHeapStatus();
        const metaBefore = this.memoryDataList[idx];
        
        let cnt = size;
        if (!cnt) {
            const meta = this.memoryDataList[idx];
            if (meta && typeof meta === 'object' && meta.__reserved && meta.length) {
                cnt = meta.length;
            } else {
                cnt = 1;
            }
        }
        
        // 实际释放的块数
        let actualFreed = 0;
        for (let i = idx; i < idx + cnt && i < this.heapSize; i++) {
            if (this.memoryDataList[i] !== null) {
                this.memoryDataList[i] = null;
                actualFreed++;
            }
        }
        
        const newStatus = this._getHeapStatus();
        
        Heap._log(2, 'free', this.heapId, `释放完成`, {
            addr: addr,
            addrHex: addrHex,
            idx: idx,
            requestedSize: size,
            actualFreed: actualFreed,
            metaBefore: metaBefore,
            oldStatus: oldStatus,
            newStatus: newStatus
        });
        
        return true;
    }

    // 返回基本统计信息
    stats() {
        let used = 0;
        let free = 0;
        for (let i = 0; i < this.heapSize; i++) {
            if (this.memoryDataList[i] === null) free++;
            else used++;
        }
        const res = {
            heapId: this.heapId,
            heapSize: Heap.addressing(this.heapSize, Heap._getHexType()),
            used: Heap.addressing(used, Heap._getHexType()),
            free: Heap.addressing(free, Heap._getHexType()),
        };
        Heap._log(2, `stats:`, res);
        return res;
    }
    // 转译寻址
    static addressing(address, type) {
        // type == AddressType.TYPE.DECIMAL -> return numeric index (number)
        // otherwise return hex string like '0x...' for readability
        let num = null;
        if (typeof address === "number") {
            num = address;
        } else if (typeof address === "string") {
            const s = address.trim();
            if (s.startsWith("0x") || s.startsWith("0X")) {
                num = parseInt(s, 16);
            } else if (/^[-+]?\d+$/.test(s)) {
                num = parseInt(s, 10);
            } else {
                // fallback: try parse as hex then decimal
                const phex = parseInt(s, 16);
                if (!Number.isNaN(phex)) num = phex;
                else num = parseInt(s, 10);
            }
        } else {
            num = Number(address);
        }

        // 安全检查：确保 num 是有效数字
        if (Number.isNaN(num) || num === null || num === undefined) {
            Heap._log(1, `addressing 解析失败: address=${address}, type=${type}`);
            num = 0; // 返回 0 而不是 NaN
        }

        if (type == Heap._getDecimalType()) return Number(num);
        return "0x" + Number(num).toString(16);
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
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "Heap", Heap);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.Heap = Heap;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.Heap = Heap;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.Heap = Heap;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.Heap = Heap;
    }
}

DependencyConfig.publishSignal("../kernel/memory/heap.js");
