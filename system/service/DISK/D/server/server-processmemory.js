// 进程堆内存读写服务：供内存编辑器等工具使用
// 启用后在 POOL > SERVER 中暴露 ProcessMemory：
//   getProcessMemoryInfo(targetPid) - 获取指定进程内存信息（堆列表等）
//   readProcessHeap(targetPid, heapId, start, length) - 读取堆区间，返回 [{ addr, data }, ...]
//   writeProcessHeap(targetPid, heapId, offset, data) - 写入堆单元

(function () {
    'use strict';

    const POOL_CATEGORY = 'SERVER';
    const POOL_KEY = 'ProcessMemory';

    var _running = false;

    function getDecType() {
        return (typeof AddressType !== 'undefined' && AddressType.TYPE && AddressType.TYPE.DECIMAL !== undefined) ? AddressType.TYPE.DECIMAL : 10;
    }
    function getHexType() {
        return (typeof AddressType !== 'undefined' && AddressType.TYPE && AddressType.TYPE.HEX !== undefined) ? AddressType.TYPE.HEX : 16;
    }

    /**
     * 获取指定进程的内存信息（堆列表等），供内存编辑器使用
     * @param {number} targetPid 目标进程 PID
     * @returns {Object|null} checkMemory 单进程结果（programs[0]）或 null
     */
    function getProcessMemoryInfo(targetPid) {
        if (targetPid == null || typeof targetPid !== 'number') {
            return null;
        }
        try {
            if (typeof MemoryManager === 'undefined') return null;
            var result = MemoryManager.checkMemory(targetPid);
            return result && result.programs && result.programs.length > 0 ? result.programs[0] : result;
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-processmemory', 'getProcessMemoryInfo 异常: ' + (e && e.message), e);
            }
            return null;
        }
    }

    /**
     * 读取指定进程指定堆的区间数据
     * @param {number} targetPid 目标进程 PID
     * @param {number|string} heapId 堆 ID（数字或十六进制字符串如 "0x1"）
     * @param {number} start 起始偏移（十进制索引）
     * @param {number} [length] 读取长度，默认 256
     * @returns {Array<{addr: string, data: *}>}
     */
    function readProcessHeap(targetPid, heapId, start, length) {
        if (targetPid == null || typeof targetPid !== 'number') {
            throw new Error('ProcessMemory.readProcessHeap: targetPid 必须为数字');
        }
        if (typeof MemoryManager === 'undefined' || typeof Heap === 'undefined') return [];
        var appSpace = MemoryManager.APPLICATION_SOP.get(targetPid);
        if (!appSpace || !appSpace.heaps) return [];
        var heapIdNum = typeof heapId === 'number' ? heapId : (typeof heapId === 'string' && /^0x[0-9a-fA-F]+$/.test(heapId.trim()) ? parseInt(heapId, 16) : parseInt(heapId, 10));
        var heap = appSpace.heaps.get(heapIdNum);
        if (!heap) return [];
        var decType = getDecType();
        var hexType = getHexType();
        var startIdx = typeof start === 'number' ? start : Heap.addressing(start, decType);
        var len = Math.min(length || 256, Math.max(0, heap.heapSize - startIdx));
        if (len <= 0) return [];
        var addrHex = Heap.addressing(startIdx, hexType);
        var data = heap.readDataRange(addrHex, len);
        return data.map(function (v, i) {
            return { addr: Heap.addressing(startIdx + i, hexType), data: v };
        });
    }

    /**
     * 向指定进程指定堆的偏移处写入一个单元
     * @param {number} targetPid 目标进程 PID
     * @param {number|string} heapId 堆 ID
     * @param {number} offset 偏移（十进制索引）
     * @param {*} data 要写入的值（数字或单字符等）
     * @returns {boolean}
     */
    function writeProcessHeap(targetPid, heapId, offset, data) {
        if (targetPid == null || typeof targetPid !== 'number') {
            throw new Error('ProcessMemory.writeProcessHeap: targetPid 必须为数字');
        }
        if (typeof MemoryManager === 'undefined' || typeof Heap === 'undefined') return false;
        var appSpace = MemoryManager.APPLICATION_SOP.get(targetPid);
        if (!appSpace || !appSpace.heaps) return false;
        var heapIdNum = typeof heapId === 'number' ? heapId : (typeof heapId === 'string' && /^0x[0-9a-fA-F]+$/.test(heapId.trim()) ? parseInt(heapId, 16) : parseInt(heapId, 10));
        var heap = appSpace.heaps.get(heapIdNum);
        if (!heap) return false;
        var decType = getDecType();
        var hexType = getHexType();
        var idx = typeof offset === 'number' ? offset : Heap.addressing(offset, decType);
        var addrHex = Heap.addressing(idx, hexType);
        return heap.writeData(addrHex, data);
    }

    function getProcessMemoryAPI() {
        return {
            getProcessMemoryInfo: getProcessMemoryInfo,
            readProcessHeap: readProcessHeap,
            writeProcessHeap: writeProcessHeap
        };
    }

    function __init__() {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-processmemory', 'init');
        }
    }

    function __start__() {
        if (_running) return;
        _running = true;
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                if (!POOL.__HAS__(POOL_CATEGORY)) {
                    POOL.__INIT__(POOL_CATEGORY);
                }
                POOL.__ADD__(POOL_CATEGORY, POOL_KEY, getProcessMemoryAPI());
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('server-processmemory', '已向 POOL > SERVER 注册 ProcessMemory');
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-processmemory', '注册 POOL 失败: ' + (e && e.message));
                }
            }
        }
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-processmemory', 'start');
        }
    }

    function __stop__() {
        if (!_running) return;
        _running = false;
        if (typeof POOL !== 'undefined' && typeof POOL.__REMOVE__ === 'function') {
            try {
                POOL.__REMOVE__(POOL_CATEGORY, POOL_KEY);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('server-processmemory', '已从 POOL > SERVER 移除 ProcessMemory');
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-processmemory', '移除 POOL 失败: ' + (e && e.message));
                }
            }
        }
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-processmemory', 'stop');
        }
    }

    function __status__() {
        var poolExposed = _running && typeof POOL !== 'undefined' && POOL.__HAS__ && POOL.__HAS__(POOL_CATEGORY, POOL_KEY);
        return {
            serviceId: 'processmemory',
            serviceName: 'ProcessMemory',
            version: '1.0',
            running: _running,
            poolExposed: poolExposed,
            poolCategory: POOL_CATEGORY,
            poolKey: POOL_KEY,
            poolPath: POOL_CATEGORY + ' > ' + POOL_KEY,
            usage: poolExposed ? 'ProcessMemory.getProcessMemoryInfo(pid) | readProcessHeap(pid, heapId, start, length) | writeProcessHeap(pid, heapId, offset, data)' : null
        };
    }

    function __info__() {
        return {
            name: 'ProcessMemory',
            version: '1.0',
            description: 'ZerOS 进程堆内存读写服务：供内存编辑器等工具使用。POOL > SERVER 暴露 ProcessMemory（getProcessMemoryInfo / readProcessHeap / writeProcessHeap）'
        };
    }

    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__({
            __init__: __init__,
            __start__: __start__,
            __stop__: __stop__,
            __status__: __status__,
            __info__: __info__
        });
    }
})();
