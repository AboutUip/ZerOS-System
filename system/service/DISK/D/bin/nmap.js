/* Nmap 命令实现
 * 功能：
 * - 调用远程 API 进行端口扫描（uapis.cn portscan）
 * - 支持指定主机、端口（单端口或 -p 多端口）、协议（tcp/udp）
 * - 程序执行完成后自动关闭
 */

(function(window) {
    'use strict';

    const PORTSCAN_API_URL = 'https://uapis.cn/api/v1/network/portscan';

    /** 未指定端口时扫描的常用端口 */
    const DEFAULT_PORTS = [21, 22, 23, 25, 80, 443, 3306, 8080, 8443];

    const NMAP = {
        pid: null,
        terminal: null,
        _closing: false,

        __info__: function() {
            return {
                name: 'Nmap',
                type: 'CLI',
                version: '1.0.0',
                description: '端口扫描（远程 API，host + port + protocol）',
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

        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;
            this.terminal = initArgs.terminal;

            if (!this.terminal) {
                throw new Error('Nmap 程序需要终端环境');
            }

            const args = initArgs.args || [];

            setTimeout(async () => {
                try {
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    let host = null;
                    let ports = [];
                    let protocol = 'tcp';

                    for (let i = 0; i < args.length; i++) {
                        const arg = args[i];
                        if (arg === '-p' || arg === '--ports') {
                            if (i + 1 >= args.length) {
                                this.terminal.write('nmap: -p 需要指定端口（可逗号分隔多个）\n');
                                this._showUsage();
                                setTimeout(() => this._selfClose(), 300);
                                return;
                            }
                            const portStr = args[++i];
                            const parts = portStr.split(',');
                            for (const p of parts) {
                                const num = parseInt(p.trim(), 10);
                                if (isNaN(num) || num < 1 || num > 65535) {
                                    this.terminal.write(`nmap: 无效端口 ${p.trim()}\n`);
                                    setTimeout(() => this._selfClose(), 300);
                                    return;
                                }
                                ports.push(num);
                            }
                        } else if (arg === '--udp' || arg === '-sU') {
                            protocol = 'udp';
                        } else if (arg === '--tcp' || arg === '-sT') {
                            protocol = 'tcp';
                        } else if (!host && !arg.startsWith('-')) {
                            host = arg;
                        } else if (host && ports.length === 0 && !arg.startsWith('-')) {
                            const num = parseInt(arg, 10);
                            if (!isNaN(num) && num >= 1 && num <= 65535) {
                                ports = [num];
                            }
                        }
                    }

                    if (!host || !host.trim()) {
                        this.terminal.write('nmap: 请指定目标主机\n');
                        this._showUsage();
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    host = host.trim();
                    if (ports.length === 0) {
                        ports = DEFAULT_PORTS.slice();
                    }

                    this.terminal.write(`正在扫描 ${host} (${protocol.toUpperCase()}) ...\n\n`);

                    await this._scanPorts(host, ports, protocol);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('Nmap', `执行失败: ${error.message}`, error);
                    }
                    this.terminal.write(`nmap: 错误: ${error.message || '未知错误'}\n`);
                } finally {
                    setTimeout(() => this._selfClose(), 300);
                }
            }, 0);
        },

        _showUsage: function() {
            this.terminal.write('用法: nmap [选项] <主机> [端口]\n');
            this.terminal.write('\n');
            this.terminal.write('选项:\n');
            this.terminal.write('  -p, --ports <端口[,端口,...]>  指定要扫描的端口（逗号分隔，1-65535）\n');
            this.terminal.write('  --tcp, -sT                    使用 TCP 扫描（默认）\n');
            this.terminal.write('  --udp, -sU                   使用 UDP 扫描\n');
            this.terminal.write('  -h, --help                    显示此帮助信息\n');
            this.terminal.write('\n');
            this.terminal.write('示例:\n');
            this.terminal.write('  nmap 127.0.0.1 8089\n');
            this.terminal.write('  nmap -p 80,443,8080 baidu.com\n');
            this.terminal.write('  nmap --udp -p 53 8.8.8.8\n');
        },

        _scanPorts: async function(host, ports, protocol) {
            const results = [];
            for (const port of ports) {
                try {
                    const url = `${PORTSCAN_API_URL}?host=${encodeURIComponent(host)}&port=${port}&protocol=${encodeURIComponent(protocol)}`;
                    const response = await fetch(url);
                    if (!response.ok) {
                        this.terminal.write(`端口 ${port}: 请求失败 HTTP ${response.status}\n`);
                        results.push({ port, status: 'error', ip: null, protocol });
                        continue;
                    }
                    const text = await response.text();
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        this.terminal.write(`端口 ${port}: 响应解析失败\n`);
                        results.push({ port, status: 'error', ip: null, protocol });
                        continue;
                    }
                    const status = (data && data.port_status) ? data.port_status : 'unknown';
                    const ip = (data && data.ip) ? data.ip : host;
                    results.push({ port, status, ip, protocol: (data && data.protocol) || protocol });
                    const statusLabel = status === 'open' ? '开放' : (status === 'closed' ? '关闭' : (status === 'timeout' ? '超时' : status));
                    this.terminal.write(`${ip}:${port} ${status} (${statusLabel})\n`);
                } catch (err) {
                    this.terminal.write(`端口 ${port}: ${err.message || '未知错误'}\n`);
                    results.push({ port, status: 'error', ip: null, protocol });
                }
            }
            const openCount = results.filter(r => r.status === 'open').length;
            this.terminal.write(`\n扫描完成: ${ports.length} 个端口，${openCount} 个开放\n`);
        },

        _selfClose: async function() {
            if (this._closing) return;
            this._closing = true;
            await new Promise(r => setTimeout(r, 200));
            if (!this.pid) return;
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {}
            }
            if (ProcessMgr && typeof ProcessMgr.killProgram === 'function') {
                try {
                    await ProcessMgr.killProgram(this.pid, false);
                } catch (e) {}
            }
        },

        __exit__: async function() {
            this.terminal = null;
        }
    };

    if (typeof window !== 'undefined') {
        window.NMAP = NMAP;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.NMAP = NMAP;
    }

    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__('APPLICATION_SHARED_POOL')) {
                POOL.__INIT__('APPLICATION_SHARED_POOL');
            }
            POOL.__ADD__('APPLICATION_SHARED_POOL', 'NMAP', NMAP);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('Nmap', `注册到 POOL 失败: ${e.message}`, e);
            }
        }
    }
})(window);
