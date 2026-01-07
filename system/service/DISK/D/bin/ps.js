/* PS 命令实现
 * 功能：
 * - 显示运行中的程序信息
 * - 支持简要和详细格式
 * - 支持显示所有程序（包括已退出的）
 * - 支持显示特定 PID 的程序信息
 * - 程序执行完成后自动关闭
 */

(function(window) {
    'use strict';

    const PS = {
        pid: null,
        terminal: null,
        _closing: false,  // 标记是否正在关闭

        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'PS',
                type: 'CLI',
                version: '1.0.0',
                description: '显示进程信息工具',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: true
                }
            };
        },

        /**
         * 初始化方法
         */
        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;
            this.terminal = initArgs.terminal;

            if (!this.terminal) {
                throw new Error('PS 程序需要终端环境');
            }

            // 保存参数供后续使用
            const args = initArgs.args || [];

            // 使用 setTimeout 延迟执行命令逻辑
            // 这样 __init__ 可以立即返回，进程管理器会将状态设置为 running
            // 然后 setTimeout 回调执行时，状态已经是 running 了
            setTimeout(async () => {
                try {
                    // 解析命令行参数
                    // 检查帮助选项（-h 或 --help）
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        // 帮助显示后，延迟关闭以确保输出完成
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }

                    // 解析参数
                    let longFormat = false;
                    let showAll = false;
                    let targetPid = -1;

                    for (let i = 0; i < args.length; i++) {
                        const arg = args[i];
                        if (arg === '-l' || arg === '--long') {
                            longFormat = true;
                        } else if (arg === '-a' || arg === '--all') {
                            showAll = true;
                        } else if (arg === '-h' || arg === '--help') {
                            this._showUsage();
                            // 帮助显示后，延迟关闭以确保输出完成
                            setTimeout(async () => {
                                await this._selfClose();
                            }, 300);
                            return;
                        } else if (!isNaN(parseInt(arg))) {
                            if (targetPid === -1) {
                                targetPid = parseInt(arg);
                            } else {
                                this.terminal.write(`ps: 警告: 已指定 PID ${targetPid}，忽略后续 PID ${arg}\n`);
                            }
                        } else if (arg.startsWith('-')) {
                            this.terminal.write(`ps: invalid option -- ${arg}\n`);
                            this.terminal.write('Usage: ps [-l|--long] [-a|--all] [-h|--help] [pid]\n');
                            // 错误输出后，延迟关闭以确保输出完成
                            setTimeout(async () => {
                                await this._selfClose();
                            }, 300);
                            return;
                        } else {
                            this.terminal.write(`ps: 无效的参数: ${arg}\n`);
                            this.terminal.write('Usage: ps [-l|--long] [-a|--all] [-h|--help] [pid]\n');
                            // 错误输出后，延迟关闭以确保输出完成
                            setTimeout(async () => {
                                await this._selfClose();
                            }, 300);
                            return;
                        }
                    }
                    
                    // 执行 ps 命令
                    await this._executePS(longFormat, showAll, targetPid);
                    
                    // 确保所有输出都已完成，然后延迟关闭
                    await new Promise(resolve => setTimeout(resolve, 200));
                    setTimeout(async () => {
                        await this._selfClose();
                    }, 300);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("PS", `执行 ps 命令失败: ${error.message}`, error);
                    }
                    // 错误情况下也等待一下，然后延迟关闭
                    await new Promise(resolve => setTimeout(resolve, 200));
                    setTimeout(async () => {
                        await this._selfClose();
                    }, 300);
                }
            }, 0);  // 使用 0ms 延迟，确保在下一个事件循环中执行
        },


        /**
         * 执行 ps 命令
         */
        _executePS: async function(longFormat, showAll, targetPid) {
            // 优先使用 ProcessManager，如果不可用则降级到 MemoryManager
            let processes = [];
            
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("PS", `获取 ProcessManager 失败: ${e.message}`, e);
                    }
                }
            }

            if (ProcessMgr) {
                if (targetPid !== -1) {
                    const processInfo = ProcessMgr.getProcessInfo(targetPid);
                    if (processInfo) {
                        processes = [processInfo];
                    } else {
                        this.terminal.write(`ps: 程序 ${targetPid} 不存在\n`);
                        return;
                    }
                } else {
                    processes = ProcessMgr.getProcessInfo();
                }
                
                // 默认情况下，过滤掉已退出的程序
                if (!showAll) {
                    processes = processes.filter(p => p.status !== 'exited');
                }
                
                if (processes.length === 0) {
                    this.terminal.write('ps: 没有运行的程序\n');
                    return;
                }
            } else if (typeof MemoryManager !== 'undefined') {
                // 降级到 MemoryManager（兼容旧代码）
                const memoryInfo = MemoryManager.checkMemory(targetPid);
                if (memoryInfo === null) {
                    this.terminal.write(`ps: 程序 ${targetPid} 不存在\n`);
                    return;
                }
                
                if (memoryInfo.totalPrograms === 0) {
                    this.terminal.write('ps: 没有运行的程序\n');
                    return;
                }
                
                // 转换为 ProcessManager 格式
                processes = memoryInfo.programs.map(prog => ({
                    pid: prog.pid,
                    programName: prog.programName || `Program-${prog.pid}`,
                    status: 'running',
                    memoryInfo: {
                        totalPrograms: 1,
                        programs: [prog]
                    }
                }));
            } else {
                this.terminal.write('ps: ProcessManager 和 MemoryManager 都不可用\n');
                return;
            }
            
            // 分离运行中的程序和已退出的程序
            const runningProcesses = processes.filter(p => p.status !== 'exited');
            const exitedProcesses = showAll ? processes.filter(p => p.status === 'exited') : [];
            
            // 显示表头（仅对运行中的程序）
            if (runningProcesses.length > 0) {
                if (longFormat) {
                    this.terminal.write('PID\tNAME\t\tSTATUS\tHEAPS\tSHEDS\tHEAP_SIZE\tHEAP_USED\tHEAP_FREE\tSHED_SIZE\n');
                    this.terminal.write('---\t----\t\t------\t-----\t------\t---------\t----------\t----------\t---------\n');
                } else {
                    this.terminal.write('PID\tNAME\t\tSTATUS\tHEAPS\tSHEDS\tTOTAL_HEAP\tTOTAL_SHED\n');
                    this.terminal.write('---\t----\t\t------\t-----\t------\t----------\t-----------\n');
                }
            }
            
            // 显示运行中的程序
            for (const processInfo of runningProcesses) {
                const pid = processInfo.pid;
                const programName = processInfo.programName || `Program-${pid}`;
                const status = processInfo.status || 'unknown';
                const memInfo = processInfo.memoryInfo;
                
                let heapCount = 0;
                let shedCount = 0;
                let totalHeap = 0;
                let totalShed = 0;
                let heapUsed = 0;
                let heapFree = 0;
                let shedSize = 0;
                
                if (memInfo && memInfo.programs && memInfo.programs.length > 0) {
                    const prog = memInfo.programs[0];
                    heapCount = prog.heaps ? prog.heaps.length : 0;
                    shedCount = prog.sheds ? prog.sheds.length : 0;
                    totalHeap = prog.totalHeapSize || 0;
                    totalShed = prog.totalShedSize || 0;
                    heapUsed = prog.heapUsedSize || prog.totalHeapUsed || 0;
                    heapFree = prog.heapFreeSize || prog.totalHeapFree || 0;
                    shedSize = prog.shedSize || prog.totalShedSize || 0;
                    
                    if (longFormat) {
                        this.terminal.write(`${pid}\t${programName.padEnd(12)}\t${status}\t${heapCount}\t${shedCount}\t${totalHeap}\t\t${heapUsed}\t\t${heapFree}\t\t${shedSize}\n`);
                        
                        // 显示每个堆的详细信息
                        if (prog.heaps && prog.heaps.length > 0) {
                            this.terminal.write(`  Heaps:\n`);
                            for (const heap of prog.heaps) {
                                this.terminal.write(`    ${heap.heapId}: size=${heap.heapSize} used=${heap.used} free=${heap.free}\n`);
                            }
                        }
                        
                        // 显示每个栈的详细信息
                        if (prog.sheds && prog.sheds.length > 0) {
                            this.terminal.write(`  Sheds:\n`);
                            for (const shed of prog.sheds) {
                                this.terminal.write(`    ${shed.stackId}: size=${shed.stackSize} code=${shed.codeSize} resources=${shed.resourceLinkSize}\n`);
                            }
                        }
                    } else {
                        this.terminal.write(`${pid}\t${programName.padEnd(12)}\t${status}\t${heapCount}\t${shedCount}\t${totalHeap}\t${totalShed}\n`);
                    }
                } else {
                    // 没有内存信息，只显示基本信息
                    if (longFormat) {
                        this.terminal.write(`${pid}\t${programName.padEnd(12)}\t${status}\t0\t0\t0\t\t0\t\t0\t\t0\n`);
                    } else {
                        this.terminal.write(`${pid}\t${programName.padEnd(12)}\t${status}\t0\t0\t0\t0\n`);
                    }
                }
            }
            
            // 如果使用 -a 参数，显示已退出的程序
            if (showAll && exitedProcesses.length > 0) {
                if (runningProcesses.length > 0) {
                    this.terminal.write('\n');
                }
                this.terminal.write('已退出的程序:\n');
                for (const processInfo of exitedProcesses) {
                    const pid = processInfo.pid;
                    const programName = processInfo.programName || `Program-${pid}`;
                    const status = processInfo.status || 'unknown';
                    const exitTime = processInfo.exitTime ? new Date(processInfo.exitTime).toLocaleString() : '未知';
                    const startTime = processInfo.startTime ? new Date(processInfo.startTime).toLocaleString() : '未知';
                    
                    const isLast = exitedProcesses.indexOf(processInfo) === exitedProcesses.length - 1;
                    const prefix = isLast ? '└─' : '├─';
                    
                    this.terminal.write(`${prefix} ${pid}\t${programName.padEnd(12)}\t${status}\n`);
                    this.terminal.write(`${isLast ? '  ' : '│ '}  启动时间: ${startTime}\n`);
                    this.terminal.write(`${isLast ? '  ' : '│ '}  退出时间: ${exitTime}\n`);
                    
                    const memInfo = processInfo.memoryInfo;
                    if (memInfo && memInfo.programs && memInfo.programs.length > 0) {
                        const prog = memInfo.programs[0];
                        const heapCount = prog.heaps ? prog.heaps.length : 0;
                        const shedCount = prog.sheds ? prog.sheds.length : 0;
                        this.terminal.write(`${isLast ? '  ' : '│ '}  内存: ${heapCount} 堆, ${shedCount} 栈\n`);
                    }
                }
            }
            
            // 显示总计（只计算运行中的程序，如果有多个）
            if (runningProcesses.length > 1) {
                let totalHeapSize = 0;
                let totalHeapUsed = 0;
                let totalHeapFree = 0;
                let totalShedSize = 0;
                let totalHeapCount = 0;
                let totalShedCount = 0;
                
                for (const processInfo of runningProcesses) {
                    const memInfo = processInfo.memoryInfo;
                    if (memInfo && memInfo.programs && memInfo.programs.length > 0) {
                        const prog = memInfo.programs[0];
                        const safeHeapSize = (typeof prog.totalHeapSize === 'number' && !Number.isNaN(prog.totalHeapSize)) ? prog.totalHeapSize : 0;
                        const safeHeapUsed = (typeof prog.heapUsedSize === 'number' && !Number.isNaN(prog.heapUsedSize)) ? prog.heapUsedSize : (typeof prog.totalHeapUsed === 'number' && !Number.isNaN(prog.totalHeapUsed)) ? prog.totalHeapUsed : 0;
                        const safeHeapFree = (typeof prog.heapFreeSize === 'number' && !Number.isNaN(prog.heapFreeSize)) ? prog.heapFreeSize : (typeof prog.totalHeapFree === 'number' && !Number.isNaN(prog.totalHeapFree)) ? prog.totalHeapFree : 0;
                        const safeShedSize = (typeof prog.shedSize === 'number' && !Number.isNaN(prog.shedSize)) ? prog.shedSize : (typeof prog.totalShedSize === 'number' && !Number.isNaN(prog.totalShedSize)) ? prog.totalShedSize : 0;
                        
                        totalHeapSize += safeHeapSize;
                        totalHeapUsed += safeHeapUsed;
                        totalHeapFree += safeHeapFree;
                        totalShedSize += safeShedSize;
                        totalHeapCount += (prog.heaps ? prog.heaps.length : 0);
                        totalShedCount += (prog.sheds ? prog.sheds.length : 0);
                    }
                }
                
                if (longFormat) {
                    this.terminal.write(`---\t----\t\t-----\t------\t---------\t----------\t----------\t---------\n`);
                    this.terminal.write(`TOTAL\t${String('').padEnd(12)}\t${totalHeapCount}\t${totalShedCount}\t${totalHeapSize}\t${totalHeapUsed}\t${totalHeapFree}\t${totalShedSize}\n`);
                } else {
                    this.terminal.write(`---\t----\t\t-----\t------\t----------\t-----------\n`);
                    this.terminal.write(`TOTAL\t${String('').padEnd(12)}\t${totalHeapCount}\t${totalShedCount}\t${totalHeapSize}\t${totalShedSize}\n`);
                }
            }
        },

        /**
         * 显示使用说明
         */
        _showUsage: function() {
            this.terminal.write('用法: ps [选项] [pid]\n');
            this.terminal.write('\n');
            this.terminal.write('选项:\n');
            this.terminal.write('  -l, --long      显示详细信息（包括堆和栈的详细信息）\n');
            this.terminal.write('  -a, --all       显示所有程序（包括已退出的）\n');
            this.terminal.write('  -h, --help      显示此帮助信息\n');
            this.terminal.write('\n');
            this.terminal.write('示例:\n');
            this.terminal.write('  ps               显示所有运行中的程序的简要信息\n');
            this.terminal.write('  ps -l            显示所有运行中的程序的详细信息\n');
            this.terminal.write('  ps -a            显示所有程序（包括已退出的）\n');
            this.terminal.write('  ps -a -l         显示所有程序的详细信息\n');
            this.terminal.write('  ps 12345         显示 PID 为 12345 的程序信息\n');
            this.terminal.write('  ps -l 12345      显示 PID 为 12345 的程序的详细信息\n');
        },

        /**
         * 自关闭程序（使用强制自终止 API）
         */
        _selfClose: async function() {
            // 防止重复调用
            if (this._closing) {
                return;
            }
            this._closing = true;

            // 延迟一小段时间，确保所有输出都已完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 检查 PID 是否存在
            if (!this.pid) {
                return;
            }

            // 使用 ProcessManager 的强制自终止 API
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    // 忽略错误
                }
            }

            if (ProcessMgr) {
                try {
                    // 优先通过内核 API 调用 requestSelfTermination（强制自终止）
                    if (typeof ProcessMgr.callKernelAPI === 'function') {
                        await ProcessMgr.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
                    } else if (typeof ProcessMgr.requestSelfTermination === 'function') {
                        // 如果内核 API 不可用，尝试直接方法
                        await ProcessMgr.requestSelfTermination(this.pid);
                    } else if (typeof ProcessMgr.killProgram === 'function') {
                        // 降级到 killProgram
                        await ProcessMgr.killProgram(this.pid, true);
                    }
                } catch (error) {
                    // 如果所有方法都失败，尝试强制关闭
                    if (typeof ProcessMgr.killProgram === 'function') {
                        try {
                            await ProcessMgr.killProgram(this.pid, true);
                        } catch (forceError) {
                            // 忽略强制关闭失败
                        }
                    }
                }
            }
        },

        /**
         * 退出方法
         */
        __exit__: async function() {
            // 清理资源
            this.terminal = null;
        }
    };

    // 注册到全局
    if (typeof window !== 'undefined') {
        window.PS = PS;
    }

    // 注册到 POOL（如果可用）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
                POOL.__INIT__("APPLICATION_SHARED_POOL");
            }
            POOL.__ADD__("APPLICATION_SHARED_POOL", "PS", PS);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("PS", `注册到 POOL 失败: ${e.message}`, e);
            }
        }
    }

})(window);
