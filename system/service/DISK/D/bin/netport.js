/* NetPort 命令实现
 * 功能：
 * - 注册 TCP 端口监听
 * - 取消端口监听
 * - 查看端口状态
 * - 列出所有已注册的端口
 * - 向端口发送数据
 * - 程序执行完成后自动关闭
 */

(function(window) {
    'use strict';

    const NETPORT = {
        pid: null,
        terminal: null,
        _closing: false,  // 标记是否正在关闭

        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'NetPort',
                type: 'CLI',
                version: '1.0.0',
                description: 'TCP 端口管理工具',
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
                throw new Error('NetPort 程序需要终端环境');
            }

            // 检查管理员权限（端口管理需要管理员权限）
            if (typeof UserControl !== 'undefined') {
                try {
                    await UserControl.ensureInitialized();
                    const isAdmin = UserControl.isAdmin();
                    if (!isAdmin) {
                        this.terminal.write('netport: 需要管理员权限，当前用户不是管理员\n');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("NetPort", `非管理员用户尝试使用 netport 命令 (PID: ${pid})`);
                        }
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }
                } catch (e) {
                    // UserControl 检查失败，为了安全起见，拒绝执行
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetPort", `检查用户权限失败: ${e.message}`, e);
                    }
                    this.terminal.write('netport: UserControl 检查失败，为了安全起见，拒绝执行\n');
                    setTimeout(async () => {
                        await this._selfClose();
                    }, 300);
                    return;
                }
            } else {
                // UserControl 未加载，为了安全起见，拒绝执行
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("NetPort", `UserControl 未加载，无法验证用户权限，拒绝执行端口管理操作`);
                }
                this.terminal.write('netport: UserControl 未加载，为了安全起见，拒绝执行端口管理操作\n');
                setTimeout(async () => {
                    await this._selfClose();
                }, 300);
                return;
            }

            // 保存参数供后续使用
            const args = initArgs.args || [];

            // 使用 setTimeout 延迟执行命令逻辑
            setTimeout(async () => {
                try {
                    // 检查帮助选项
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }

                    // 如果没有参数，显示帮助
                    if (args.length === 0) {
                        this._showUsage();
                        setTimeout(async () => {
                            await this._selfClose();
                        }, 300);
                        return;
                    }

                    // 解析命令
                    const command = args[0];
                    const commandArgs = args.slice(1);

                    switch (command) {
                        case 'register':
                        case 'reg':
                        case 'r':
                            await this._handleRegister(commandArgs);
                            break;
                        case 'unregister':
                        case 'unreg':
                        case 'u':
                            await this._handleUnregister(commandArgs);
                            break;
                        case 'status':
                        case 'stat':
                        case 's':
                            await this._handleStatus(commandArgs);
                            break;
                        case 'list':
                        case 'ls':
                        case 'l':
                            await this._handleList(commandArgs);
                            break;
                        case 'send':
                            await this._handleSend(commandArgs);
                            break;
                        default:
                            this.terminal.write(`netport: 未知命令: ${command}\n`);
                            this.terminal.write('使用 "netport --help" 查看帮助\n');
                            setTimeout(async () => {
                                await this._selfClose();
                            }, 300);
                            return;
                    }

                    // 确保所有输出都已完成，然后延迟关闭
                    await new Promise(resolve => setTimeout(resolve, 200));
                    setTimeout(async () => {
                        await this._selfClose();
                    }, 300);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetPort", `执行 netport 命令失败: ${error.message}`, error);
                    }
                    this.terminal.write(`netport: 错误: ${error.message}\n`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    setTimeout(async () => {
                        await this._selfClose();
                    }, 300);
                }
            }, 0);
        },

        /**
         * 显示使用帮助
         */
        _showUsage: function() {
            this.terminal.write('NetPort - TCP 端口管理工具\n');
            this.terminal.write('\n');
            this.terminal.write('用法:\n');
            this.terminal.write('  netport <命令> [选项]\n');
            this.terminal.write('\n');
            this.terminal.write('命令:\n');
            this.terminal.write('  register, reg, r   注册端口监听\n');
            this.terminal.write('                     用法: netport register <端口> [程序名]\n');
            this.terminal.write('                     示例: netport register 8080 MyServer\n');
            this.terminal.write('\n');
            this.terminal.write('  unregister, unreg, u  取消端口监听\n');
            this.terminal.write('                         用法: netport unregister <端口>\n');
            this.terminal.write('                         示例: netport unregister 8080\n');
            this.terminal.write('\n');
            this.terminal.write('  status, stat, s    查看端口状态\n');
            this.terminal.write('                     用法: netport status <端口>\n');
            this.terminal.write('                     示例: netport status 8080\n');
            this.terminal.write('\n');
            this.terminal.write('  list, ls, l        列出所有已注册的端口\n');
            this.terminal.write('                     用法: netport list\n');
            this.terminal.write('\n');
            this.terminal.write('  send               向端口发送数据\n');
            this.terminal.write('                     用法: netport send <主机> <端口> <数据>\n');
            this.terminal.write('                     示例: netport send 127.0.0.1 8080 "Hello"\n');
            this.terminal.write('\n');
            this.terminal.write('选项:\n');
            this.terminal.write('  -h, --help         显示此帮助信息\n');
            this.terminal.write('\n');
        },

        /**
         * 处理注册端口命令
         */
        _handleRegister: async function(args) {
            if (args.length === 0) {
                this.terminal.write('netport register: 缺少端口号\n');
                this.terminal.write('用法: netport register <端口> [程序名]\n');
                return;
            }

            const port = parseInt(args[0]);
            if (isNaN(port) || port < 1 || port > 65535) {
                this.terminal.write(`netport register: 无效的端口号: ${args[0]}\n`);
                this.terminal.write('端口号必须是 1-65535 之间的整数\n');
                return;
            }

            const programName = args[1] || `Program_${this.pid}`;

            // 获取 ProcessManager
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetPort", `获取 ProcessManager 失败: ${e.message}`, e);
                    }
                }
            }

            if (!ProcessMgr) {
                this.terminal.write('netport: ProcessManager 不可用\n');
                return;
            }

            try {
                const result = await ProcessMgr.callKernelAPI(this.pid, 'Network.Port.register', [
                    port,
                    this.pid,
                    programName,
                    {}
                ]);

                if (result.success) {
                    this.terminal.write(`端口 ${port} 注册成功\n`);
                    this.terminal.write(`程序名: ${programName}\n`);
                    this.terminal.write(`PID: ${this.pid}\n`);
                } else {
                    this.terminal.write(`端口 ${port} 注册失败: ${result.message || '未知错误'}\n`);
                }
            } catch (error) {
                this.terminal.write(`端口 ${port} 注册失败: ${error.message}\n`);
            }
        },

        /**
         * 处理取消端口命令
         */
        _handleUnregister: async function(args) {
            if (args.length === 0) {
                this.terminal.write('netport unregister: 缺少端口号\n');
                this.terminal.write('用法: netport unregister <端口>\n');
                return;
            }

            const port = parseInt(args[0]);
            if (isNaN(port) || port < 1 || port > 65535) {
                this.terminal.write(`netport unregister: 无效的端口号: ${args[0]}\n`);
                this.terminal.write('端口号必须是 1-65535 之间的整数\n');
                return;
            }

            // 获取 ProcessManager
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetPort", `获取 ProcessManager 失败: ${e.message}`, e);
                    }
                }
            }

            if (!ProcessMgr) {
                this.terminal.write('netport: ProcessManager 不可用\n');
                return;
            }

            try {
                const result = await ProcessMgr.callKernelAPI(this.pid, 'Network.Port.unregister', [port]);

                if (result.success) {
                    this.terminal.write(`端口 ${port} 已取消注册\n`);
                } else {
                    this.terminal.write(`端口 ${port} 取消注册失败: ${result.message || '未知错误'}\n`);
                }
            } catch (error) {
                this.terminal.write(`端口 ${port} 取消注册失败: ${error.message}\n`);
            }
        },

        /**
         * 处理查看端口状态命令
         */
        _handleStatus: async function(args) {
            if (args.length === 0) {
                this.terminal.write('netport status: 缺少端口号\n');
                this.terminal.write('用法: netport status <端口>\n');
                return;
            }

            const port = parseInt(args[0]);
            if (isNaN(port) || port < 1 || port > 65535) {
                this.terminal.write(`netport status: 无效的端口号: ${args[0]}\n`);
                this.terminal.write('端口号必须是 1-65535 之间的整数\n');
                return;
            }

            // 获取 ProcessManager
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetPort", `获取 ProcessManager 失败: ${e.message}`, e);
                    }
                }
            }

            if (!ProcessMgr) {
                this.terminal.write('netport: ProcessManager 不可用\n');
                return;
            }

            try {
                const status = await ProcessMgr.callKernelAPI(this.pid, 'Network.Port.getStatus', [port]);

                this.terminal.write(`端口 ${port} 状态:\n`);
                this.terminal.write(`  状态: ${status.status || 'unknown'}\n`);
                this.terminal.write(`  程序名: ${status.programName || 'N/A'}\n`);
                this.terminal.write(`  PID: ${status.pid || 'N/A'}\n`);
                this.terminal.write(`  地址: ${status.address || '0.0.0.0'}\n`);
                this.terminal.write(`  创建时间: ${status.created ? new Date(status.created * 1000).toLocaleString() : 'N/A'}\n`);
                this.terminal.write(`  连接数: ${status.connectionCount || 0}\n`);

                if (status.connections && status.connections.length > 0) {
                    this.terminal.write(`\n  连接列表:\n`);
                    status.connections.forEach((conn, index) => {
                        this.terminal.write(`    [${index + 1}] ${conn.remoteAddress || conn.remote_address || 'unknown'}:${conn.remotePort || conn.remote_port || 0}\n`);
                        this.terminal.write(`        连接ID: ${conn.connectionId || conn.id || 'N/A'}\n`);
                        this.terminal.write(`        连接时间: ${conn.connectedAt || conn.connected_at ? new Date((conn.connectedAt || conn.connected_at) * 1000).toLocaleString() : 'N/A'}\n`);
                    });
                }
            } catch (error) {
                const errorMsg = error.message || '未知错误';
                if (errorMsg.includes('未注册')) {
                    this.terminal.write(`端口 ${port} 未注册\n`);
                    this.terminal.write(`使用 "netport register ${port} [程序名]" 注册端口\n`);
                } else {
                    this.terminal.write(`获取端口 ${port} 状态失败: ${errorMsg}\n`);
                }
            }
        },

        /**
         * 处理列出所有端口命令
         */
        _handleList: async function(args) {
            // 获取 ProcessManager
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetPort", `获取 ProcessManager 失败: ${e.message}`, e);
                    }
                }
            }

            if (!ProcessMgr) {
                this.terminal.write('netport: ProcessManager 不可用\n');
                return;
            }

            try {
                const ports = await ProcessMgr.callKernelAPI(this.pid, 'Network.Port.list', []);

                if (ports.length === 0) {
                    this.terminal.write('没有已注册的端口\n');
                    return;
                }

                this.terminal.write('已注册的端口:\n');
                this.terminal.write('\n');
                this.terminal.write('端口\t程序名\t\tPID\t状态\t\t地址\n');
                this.terminal.write('----\t------\t\t---\t----\t\t----\n');

                ports.forEach(port => {
                    const portNum = port.port || 'N/A';
                    const programName = (port.programName || 'N/A').substring(0, 12).padEnd(12);
                    const pid = port.pid || 'N/A';
                    const status = (port.status || 'unknown').substring(0, 10).padEnd(10);
                    const address = port.address || '0.0.0.0';
                    this.terminal.write(`${portNum}\t${programName}\t${pid}\t${status}\t${address}\n`);
                });
            } catch (error) {
                this.terminal.write(`获取端口列表失败: ${error.message}\n`);
            }
        },

        /**
         * 处理发送数据命令
         */
        _handleSend: async function(args) {
            if (args.length < 3) {
                this.terminal.write('netport send: 缺少参数\n');
                this.terminal.write('用法: netport send <主机> <端口> <数据>\n');
                this.terminal.write('示例: netport send 127.0.0.1 8080 "Hello World"\n');
                return;
            }

            const host = args[0];
            const port = parseInt(args[1]);
            const data = args.slice(2).join(' '); // 支持包含空格的数据

            if (isNaN(port) || port < 1 || port > 65535) {
                this.terminal.write(`netport send: 无效的端口号: ${args[1]}\n`);
                this.terminal.write('端口号必须是 1-65535 之间的整数\n');
                return;
            }

            // 获取 ProcessManager
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("NetPort", `获取 ProcessManager 失败: ${e.message}`, e);
                    }
                }
            }

            if (!ProcessMgr) {
                this.terminal.write('netport: ProcessManager 不可用\n');
                return;
            }

            try {
                const result = await ProcessMgr.callKernelAPI(this.pid, 'Network.Port.send', [
                    host,
                    port,
                    data
                ]);

                if (result.bytesWritten !== undefined) {
                    this.terminal.write(`数据已发送到 ${host}:${port}\n`);
                    this.terminal.write(`发送字节数: ${result.bytesWritten}\n`);
                } else {
                    this.terminal.write(`数据已发送到 ${host}:${port}\n`);
                }
            } catch (error) {
                this.terminal.write(`发送数据失败: ${error.message}\n`);
            }
        },

        /**
         * 自动关闭程序
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
            this._closing = true;
        }
    };

    // 导出到全局
    if (typeof window !== 'undefined') {
        window.NETPORT = NETPORT;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.NETPORT = NETPORT;
    }

})(typeof window !== 'undefined' ? window : globalThis);

