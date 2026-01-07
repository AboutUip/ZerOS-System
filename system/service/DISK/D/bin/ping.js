/* Ping 命令实现
 * 功能：
 * - 使用 fetch 模拟 ping 命令
 * - 支持指定目标主机和包数量
 * - 显示延迟统计信息
 * - 程序执行完成后自动关闭
 */

(function(window) {
    'use strict';

    const PING = {
        pid: null,
        terminal: null,
        pingInterval: null,
        pingCount: 4,  // 默认发送 4 个包
        targetHost: null,
        sentCount: 0,
        receivedCount: 0,
        minTime: Infinity,
        maxTime: 0,
        totalTime: 0,
        isRunning: false,
        _closing: false,  // 标记是否正在关闭

        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'Ping',
                type: 'CLI',
                version: '1.0.0',
                description: '网络连通性测试工具（模拟 ping 命令）',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.NETWORK_ACCESS,
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
                throw new Error('Ping 程序需要终端环境');
            }

            // 保存参数供后续使用
            const args = initArgs.args || [];

            // 使用 setTimeout 延迟执行命令逻辑
            // 这样 __init__ 可以立即返回，进程管理器会将状态设置为 running
            // 然后 setTimeout 回调执行时，状态已经是 running 了
            setTimeout(async () => {
                try {
                    // 此时程序状态已经是 running，可以安全执行命令逻辑
                    
                    // 检查帮助选项（-h 或 --help）
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }
                    
                    if (args.length === 0) {
                        this._showUsage();
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }

                    // 解析参数
                    let host = null;
                    let count = 4;  // 默认 4 个包
                    let continuous = false;  // 是否持续 ping

                    for (let i = 0; i < args.length; i++) {
                        const arg = args[i];
                        
                        if (arg === '-c') {
                            // 指定包数量
                            if (i + 1 >= args.length) {
                                this.terminal.write('ping: -c 选项需要指定包数量\n');
                                this.terminal.write('用法: ping -c <数量> <主机>\n');
                                setTimeout(async () => {
                                    await this._selfClose();
                                }, 300);
                                return;
                            }
                            count = parseInt(args[i + 1], 10);
                            if (isNaN(count) || count <= 0) {
                                this.terminal.write('ping: 无效的包数量\n');
                                setTimeout(async () => {
                                    await this._selfClose();
                                }, 300);
                                return;
                            }
                            i++;  // 跳过下一个参数
                        } else if (arg === '-t' || arg === '--continuous') {
                            // 持续 ping（如果同时指定了 -c，则忽略 -c）
                            continuous = true;
                        } else if (arg === '-h' || arg === '--help') {
                            // 帮助选项（虽然前面已经检查过，但这里也处理一下）
                            this._showUsage();
                            setTimeout(async () => {
                                await this._selfClose();
                            }, 300);
                            return;
                        } else if (!host && !arg.startsWith('-')) {
                            // 目标主机
                            host = arg;
                        } else if (arg.startsWith('-')) {
                            // 未知选项
                            this.terminal.write(`ping: 无效的选项 -- ${arg}\n`);
                            this._showUsage();
                            setTimeout(async () => {
                                await this._selfClose();
                            }, 300);
                            return;
                        }
                    }

                    if (!host) {
                        this._showUsage();
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }

                    this.targetHost = host;
                    // 持续 ping 模式设置最大包数量（100个），确保程序能够自关闭
                    this.pingCount = continuous ? 100 : count;
                    this.isRunning = true;

                    // 开始 ping
                    await this._startPing();
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("Ping", `执行 ping 命令失败: ${error.message}`, error);
                    }
                    // 错误情况下也延迟关闭
                    await new Promise(resolve => setTimeout(resolve, 200));
                    setTimeout(async () => {
                        await this._selfClose();
                    }, 300);
                }
            }, 0);  // 使用 0ms 延迟，确保在下一个事件循环中执行
        },

        /**
         * 显示使用说明
         */
        _showUsage: function() {
            this.terminal.write('用法: ping [选项] <主机>\n');
            this.terminal.write('\n');
            this.terminal.write('选项:\n');
            this.terminal.write('  -c <数量>        发送指定数量的包后停止\n');
            this.terminal.write('  -t, --continuous 持续 ping 直到手动停止 (Ctrl+C)\n');
            this.terminal.write('  -h, --help       显示此帮助信息\n');
            this.terminal.write('\n');
            this.terminal.write('示例:\n');
            this.terminal.write('  ping www.example.com\n');
            this.terminal.write('  ping -c 10 www.example.com\n');
            this.terminal.write('  ping -t www.example.com\n');
        },

        /**
         * 开始 ping
         */
        _startPing: async function() {
            this.terminal.write(`正在 Ping ${this.targetHost} ...\n`);
            this.terminal.write('\n');

            // 发送第一个包
            await this._sendPing();

            // 如果只发送一个包，直接显示统计并退出
            if (this.pingCount === 1) {
                await this._showStatistics();
                await this._selfClose();
                return;
            }

            // 设置定时器，每 1 秒发送一个包
            this.pingInterval = setInterval(() => {
                if (!this.isRunning) {
                    clearInterval(this.pingInterval);
                    return;
                }

                // 检查是否达到指定数量
                if (this.sentCount >= this.pingCount) {
                    clearInterval(this.pingInterval);
                    // 使用立即执行的异步函数确保正确等待
                    (async () => {
                        await this._showStatistics();
                        await this._selfClose();
                    })();
                    return;
                }

                // 发送 ping 包（不等待，让定时器继续运行）
                this._sendPing().catch(error => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("Ping", `发送 ping 包失败: ${error.message}`, error);
                    }
                });
            }, 1000);
        },

        /**
         * 发送单个 ping 包
         */
        _sendPing: async function() {
            this.sentCount++;
            const seq = this.sentCount;
            const startTime = performance.now();

            try {
                // 构建 URL（尝试添加 http:// 或 https:// 前缀）
                let url = this.targetHost;
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    // 默认使用 https
                    url = `https://${url}`;
                }

                // 使用 fetch 发送请求（添加时间戳避免缓存）
                const fetchUrl = `${url}?t=${Date.now()}`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 秒超时

                try {
                    // 尝试发送请求
                    // 注意：由于 CORS 限制，我们可能无法读取响应状态
                    // 但我们可以通过请求是否完成（不抛出错误）来判断连通性
                    const response = await fetch(fetchUrl, {
                        method: 'HEAD',  // 使用 HEAD 请求，只获取响应头
                        mode: 'no-cors', // 避免 CORS 问题（但无法读取响应状态）
                        signal: controller.signal,
                        cache: 'no-cache'
                    });

                    clearTimeout(timeoutId);
                    const endTime = performance.now();
                    const time = Math.round(endTime - startTime);

                    // 即使无法读取响应状态，请求完成也说明网络连通
                    this.receivedCount++;
                    this._updateStatistics(time);

                    // 显示响应信息
                    this.terminal.write(`来自 ${this.targetHost} 的回复: 时间=${time}ms 序号=${seq}\n`);
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    
                    // 如果是超时
                    if (fetchError.name === 'AbortError') {
                        const endTime = performance.now();
                        const time = Math.round(endTime - startTime);
                        this.terminal.write(`请求超时 (${time}ms)\n`);
                    } else {
                        // 尝试使用 http
                        if (url.startsWith('https://')) {
                            const httpUrl = url.replace('https://', 'http://');
                            const httpController = new AbortController();
                            const httpTimeoutId = setTimeout(() => httpController.abort(), 5000);
                            
                            try {
                                await fetch(`${httpUrl}?t=${Date.now()}`, {
                                    method: 'HEAD',
                                    mode: 'no-cors',
                                    signal: httpController.signal,
                                    cache: 'no-cache'
                                });
                                
                                clearTimeout(httpTimeoutId);
                                const endTime = performance.now();
                                const time = Math.round(endTime - startTime);

                                this.receivedCount++;
                                this._updateStatistics(time);

                                this.terminal.write(`来自 ${this.targetHost} 的回复: 时间=${time}ms 序号=${seq}\n`);
                            } catch (httpError) {
                                clearTimeout(httpTimeoutId);
                                const endTime = performance.now();
                                const time = Math.round(endTime - startTime);
                                
                                if (httpError.name === 'AbortError') {
                                    this.terminal.write(`请求超时 (${time}ms)\n`);
                                } else {
                                    this.terminal.write(`请求失败: 无法连接到 ${this.targetHost} (${time}ms)\n`);
                                }
                            }
                        } else {
                            const endTime = performance.now();
                            const time = Math.round(endTime - startTime);
                            this.terminal.write(`请求失败: 无法连接到 ${this.targetHost} (${time}ms)\n`);
                        }
                    }
                }
            } catch (error) {
                const endTime = performance.now();
                const time = Math.round(endTime - startTime);
                this.terminal.write(`错误: ${error.message || '未知错误'} (${time}ms)\n`);
            }
        },

        /**
         * 更新统计信息
         */
        _updateStatistics: function(time) {
            if (time < this.minTime) {
                this.minTime = time;
            }
            if (time > this.maxTime) {
                this.maxTime = time;
            }
            this.totalTime += time;
        },

        /**
         * 显示统计信息
         */
        _showStatistics: async function() {
            if (this.sentCount === 0) {
                return;
            }

            this.terminal.write('\n');
            this.terminal.write(`${this.targetHost} 的 Ping 统计信息:\n`);
            this.terminal.write(`    数据包: 已发送 = ${this.sentCount}，已接收 = ${this.receivedCount}，丢失 = ${this.sentCount - this.receivedCount} (${Math.round((this.sentCount - this.receivedCount) / this.sentCount * 100)}% 丢失)\n`);

            if (this.receivedCount > 0) {
                const avgTime = Math.round(this.totalTime / this.receivedCount);
                this.terminal.write(`往返行程的估计时间(以毫秒为单位):\n`);
                this.terminal.write(`    最短 = ${this.minTime === Infinity ? 0 : this.minTime}ms，最长 = ${this.maxTime}ms，平均 = ${avgTime}ms\n`);
            }
        },

        /**
         * 自关闭程序
         */
        _selfClose: async function() {
            // 防止重复调用
            if (this._closing) {
                return;
            }
            this._closing = true;

            // 停止 ping
            this.isRunning = false;
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }

            // 延迟一小段时间，确保所有输出都已完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 检查 PID 是否存在
            if (!this.pid) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("Ping", "PID 不存在，无法关闭程序");
                }
                return;
            }

            // 通过 ProcessManager 关闭程序
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("Ping", `获取 ProcessManager 失败: ${e.message}`, e);
                    }
                }
            }

            if (ProcessMgr && typeof ProcessMgr.killProgram === 'function') {
                try {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("Ping", `正在关闭程序 (PID: ${this.pid})`);
                    }
                    const success = await ProcessMgr.killProgram(this.pid, false);
                    if (typeof KernelLogger !== 'undefined') {
                        if (success) {
                            KernelLogger.debug("Ping", `程序已成功关闭 (PID: ${this.pid})`);
                        } else {
                            KernelLogger.warn("Ping", `程序关闭失败 (PID: ${this.pid})`);
                        }
                    }
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("Ping", `关闭程序失败: ${error.message}`, error);
                    }
                }
            } else {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("Ping", "ProcessManager 不可用，无法自动关闭");
                }
            }
        },

        /**
         * 退出方法
         */
        __exit__: async function() {
            // 清理定时器
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }

            // 重置状态
            this.isRunning = false;
            this.terminal = null;
        }
    };

    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.PING = PING;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.PING = PING;
    }

    // 注册到 POOL（如果可用）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
                POOL.__INIT__("APPLICATION_SHARED_POOL");
            }
            POOL.__ADD__("APPLICATION_SHARED_POOL", "PING", PING);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("Ping", `注册到 POOL 失败: ${e.message}`, e);
            }
        }
    }

})(window);

