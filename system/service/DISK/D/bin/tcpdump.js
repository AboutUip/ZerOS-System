/* TCPDump 命令实现
 * 功能：
 * - 实时监控所有 ZerOS 网络数据包
 * - 显示请求和响应的详细信息
 * - 支持过滤选项（URL、方法、状态码等）
 * - 显示统计信息
 * - 基于 NetworkManager 的请求拦截功能
 */

(function(window) {
    'use strict';

    const TCPDUMP = {
        pid: null,
        terminal: null,
        networkManager: null,
        requestInterceptor: null,
        responseInterceptor: null,
        isCapturing: false,
        packetCount: 0,
        startTime: null,
        filterOptions: {
            url: null,
            method: null,
            status: null,
            minTime: null,
            maxTime: null
        },
        _closing: false,  // 标记是否正在关闭
        displayInterval: null,  // 显示更新定时器

        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'TCPDump',
                type: 'CLI',
                version: '1.0.0',
                description: 'ZerOS 网络数据包捕获和分析工具',
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
                throw new Error('TCPDump 程序需要终端环境');
            }

            // 获取 NetworkManager
            try {
                if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    this.networkManager = POOL.__GET__('KERNEL_GLOBAL_POOL', 'NetworkManager');
                } else if (typeof window !== 'undefined' && window.NetworkManager) {
                    this.networkManager = window.NetworkManager;
                } else {
                    throw new Error('NetworkManager 不可用');
                }
            } catch (e) {
                this.terminal.write(`tcpdump: 无法获取 NetworkManager: ${e.message}\n`);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("TCPDump", `获取 NetworkManager 失败: ${e.message}`, e);
                }
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

                    // 解析参数
                    this._parseArguments(args);

                    // 开始捕获
                    await this._startCapture();
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("TCPDump", `执行 tcpdump 命令失败: ${error.message}`, error);
                    }
                    this.terminal.write(`tcpdump: 错误: ${error.message}\n`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    setTimeout(async () => {
                        await this._selfClose();
                    }, 300);
                }
            }, 0);
        },

        /**
         * 解析命令行参数
         */
        _parseArguments: function(args) {
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                
                if (arg === '-i' || arg === '--interface') {
                    // 接口过滤（暂时不支持，保留参数）
                    if (i + 1 < args.length) {
                        i++; // 跳过接口参数
                    }
                } else if (arg === '-n' || arg === '--numeric') {
                    // 数字格式（不解析域名）
                    // 暂时不支持，保留参数
                } else if (arg === '-c' || arg === '--count') {
                    // 捕获指定数量的包后退出
                    if (i + 1 < args.length) {
                        const count = parseInt(args[i + 1], 10);
                        if (!isNaN(count) && count > 0) {
                            this.maxPackets = count;
                        }
                        i++;
                    }
                } else if (arg === '-w' || arg === '--write') {
                    // 写入文件（暂时不支持）
                    if (i + 1 < args.length) {
                        i++; // 跳过文件名
                    }
                } else if (arg.startsWith('host=')) {
                    // 主机过滤
                    const host = arg.substring(5);
                    this.filterOptions.url = new RegExp(host.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i');
                } else if (arg.startsWith('port=')) {
                    // 端口过滤
                    const port = arg.substring(5);
                    this.filterOptions.url = new RegExp(`:${port}(/|$|\\?)`, 'i');
                } else if (arg.startsWith('method=')) {
                    // 方法过滤
                    const method = arg.substring(7).toUpperCase();
                    this.filterOptions.method = method;
                } else if (arg.startsWith('status=')) {
                    // 状态码过滤
                    const status = arg.substring(7);
                    if (status === 'success') {
                        this.filterOptions.status = (s) => s >= 200 && s < 300;
                    } else if (status === 'error') {
                        this.filterOptions.status = (s) => s >= 400;
                    } else if (status === 'failed') {
                        this.filterOptions.status = 'failed';
                    } else {
                        const statusNum = parseInt(status, 10);
                        if (!isNaN(statusNum)) {
                            this.filterOptions.status = statusNum;
                        }
                    }
                } else if (arg === '-v' || arg === '--verbose') {
                    // 详细输出
                    this.verbose = true;
                } else if (arg === '-q' || arg === '--quiet') {
                    // 安静模式（只显示统计）
                    this.quiet = true;
                } else if (arg === '-s' || arg === '--stats') {
                    // 只显示统计信息
                    this.statsOnly = true;
                } else if (!arg.startsWith('-')) {
                    // 可能是表达式（暂时不支持复杂表达式）
                    if (!this.filterOptions.url) {
                        this.filterOptions.url = new RegExp(arg.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i');
                    }
                }
            }
        },

        /**
         * 显示使用说明
         */
        _showUsage: function() {
            this.terminal.write('用法: tcpdump [选项] [表达式]\n');
            this.terminal.write('\n');
            this.terminal.write('选项:\n');
            this.terminal.write('  -h, --help         显示此帮助信息\n');
            this.terminal.write('  -c <数量>          捕获指定数量的包后退出\n');
            this.terminal.write('  -v, --verbose      详细输出模式\n');
            this.terminal.write('  -q, --quiet        安静模式（只显示统计）\n');
            this.terminal.write('  -s, --stats        只显示统计信息\n');
            this.terminal.write('\n');
            this.terminal.write('过滤表达式:\n');
            this.terminal.write('  host=<主机>        按主机过滤（支持通配符 *）\n');
            this.terminal.write('  port=<端口>        按端口过滤\n');
            this.terminal.write('  method=<方法>       按 HTTP 方法过滤（GET, POST, PUT, DELETE 等）\n');
            this.terminal.write('  status=<状态>      按状态码过滤（数字、success、error、failed）\n');
            this.terminal.write('\n');
            this.terminal.write('示例:\n');
            this.terminal.write('  tcpdump                           # 捕获所有网络数据包\n');
            this.terminal.write('  tcpdump host=example.com          # 只捕获 example.com 的请求\n');
            this.terminal.write('  tcpdump port=8080                 # 只捕获端口 8080 的请求\n');
            this.terminal.write('  tcpdump method=POST               # 只捕获 POST 请求\n');
            this.terminal.write('  tcpdump status=200                # 只捕获状态码 200 的响应\n');
            this.terminal.write('  tcpdump -c 100                     # 捕获 100 个包后退出\n');
            this.terminal.write('  tcpdump -v                        # 详细输出模式\n');
            this.terminal.write('\n');
            this.terminal.write('提示: 按 Ctrl+C 停止捕获\n');
        },

        /**
         * 开始捕获
         */
        _startCapture: async function() {
            this.isCapturing = true;
            this.startTime = Date.now();
            this.packetCount = 0;

            // 显示开始信息
            if (!this.quiet && !this.statsOnly) {
                this.terminal.write('开始捕获网络数据包...\n');
                this.terminal.write('按 Ctrl+C 停止捕获\n');
                this.terminal.write('\n');
            }

            // 注册请求拦截器
            this.requestInterceptor = (request) => {
                if (!this.isCapturing) return;
                this._handleRequest(request);
            };

            // 注册响应拦截器
            this.responseInterceptor = (response) => {
                if (!this.isCapturing) return;
                this._handleResponse(response);
            };

            // 添加到 NetworkManager
            if (this.networkManager) {
                this.networkManager.addRequestInterceptor(this.requestInterceptor);
                this.networkManager.addResponseInterceptor(this.responseInterceptor);
            }

            // 如果只显示统计，定期更新统计信息
            if (this.statsOnly) {
                this.displayInterval = setInterval(() => {
                    this._showStatistics();
                }, 1000);
            }

            // 如果指定了最大包数量，检查是否达到
            if (this.maxPackets) {
                const checkInterval = setInterval(() => {
                    if (this.packetCount >= this.maxPackets) {
                        clearInterval(checkInterval);
                        this._stopCapture();
                    }
                }, 100);
            }

            // 注意：Ctrl+C 处理由终端统一处理，通过 ProcessManager.killProgram 来终止程序
            // 程序会在 __exit__ 方法中清理资源
        },

        /**
         * 处理请求
         */
        _handleRequest: function(request) {
            const { url, method, headers, body } = request;

            // 应用过滤
            if (!this._matchesFilter(url, method, null)) {
                return;
            }

            this.packetCount++;

            if (this.quiet || this.statsOnly) {
                return;
            }

            // 格式化时间戳
            const timestamp = new Date().toLocaleTimeString('zh-CN', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 3
            });

            // 解析 URL
            let urlObj;
            try {
                urlObj = new URL(url);
            } catch (e) {
                urlObj = { hostname: url, pathname: '', search: '' };
            }

            // 显示请求信息
            if (this.verbose) {
                this.terminal.write(`[${timestamp}] → ${method} ${url}\n`);
                if (headers && Object.keys(headers).length > 0) {
                    for (const [key, value] of Object.entries(headers)) {
                        this.terminal.write(`  Header: ${key}: ${value}\n`);
                    }
                }
                if (body) {
                    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                    const bodyPreview = bodyStr.length > 100 ? bodyStr.substring(0, 100) + '...' : bodyStr;
                    this.terminal.write(`  Body: ${bodyPreview}\n`);
                }
            } else {
                this.terminal.write(`[${timestamp}] → ${method} ${urlObj.hostname}${urlObj.pathname}${urlObj.search}\n`);
            }
        },

        /**
         * 处理响应
         */
        _handleResponse: function(response) {
            const { url, status, statusText, headers, body, size } = response;

            // 应用过滤
            if (!this._matchesFilter(url, null, status)) {
                return;
            }

            if (this.quiet || this.statsOnly) {
                return;
            }

            // 格式化时间戳
            const timestamp = new Date().toLocaleTimeString('zh-CN', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 3
            });

            // 解析 URL
            let urlObj;
            try {
                urlObj = new URL(url);
            } catch (e) {
                urlObj = { hostname: url, pathname: '', search: '' };
            }

            // 状态码颜色（简单实现）
            const statusColor = status >= 200 && status < 300 ? '' : 
                               status >= 400 ? '' : '';

            // 显示响应信息
            if (this.verbose) {
                this.terminal.write(`[${timestamp}] ← ${status} ${statusText} ${url}\n`);
                if (headers && Object.keys(headers).length > 0) {
                    for (const [key, value] of Object.entries(headers)) {
                        this.terminal.write(`  Header: ${key}: ${value}\n`);
                    }
                }
                if (size) {
                    this.terminal.write(`  Size: ${this._formatBytes(size)}\n`);
                }
                if (body) {
                    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                    const bodyPreview = bodyStr.length > 200 ? bodyStr.substring(0, 200) + '...' : bodyStr;
                    this.terminal.write(`  Body: ${bodyPreview}\n`);
                }
            } else {
                const sizeStr = size ? ` (${this._formatBytes(size)})` : '';
                this.terminal.write(`[${timestamp}] ← ${status} ${statusText} ${urlObj.hostname}${urlObj.pathname}${sizeStr}\n`);
            }
        },

        /**
         * 检查是否匹配过滤条件
         */
        _matchesFilter: function(url, method, status) {
            // URL 过滤
            if (this.filterOptions.url && !this.filterOptions.url.test(url)) {
                return false;
            }

            // 方法过滤
            if (this.filterOptions.method && method !== this.filterOptions.method) {
                return false;
            }

            // 状态过滤
            if (this.filterOptions.status !== null && status !== null) {
                if (typeof this.filterOptions.status === 'function') {
                    if (!this.filterOptions.status(status)) {
                        return false;
                    }
                } else if (this.filterOptions.status === 'failed') {
                    // failed 状态在响应拦截器中处理
                    return true;
                } else if (this.filterOptions.status !== status) {
                    return false;
                }
            }

            return true;
        },

        /**
         * 格式化字节数
         */
        _formatBytes: function(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        },

        /**
         * 显示统计信息
         */
        _showStatistics: function() {
            if (!this.networkManager) return;

            const stats = this.networkManager.getNetworkStats();
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

            this.terminal.write('\n');
            this.terminal.write('=== 网络统计信息 ===\n');
            this.terminal.write(`捕获时间: ${elapsed} 秒\n`);
            this.terminal.write(`总请求数: ${stats.totalRequests}\n`);
            this.terminal.write(`总字节数: ${this._formatBytes(stats.totalBytes)}\n`);
            this.terminal.write(`失败请求: ${stats.failedRequests}\n`);
            this.terminal.write(`缓存请求: ${stats.cachedRequests}\n`);
            this.terminal.write(`历史记录: ${stats.historySize}\n`);
            this.terminal.write(`匹配包数: ${this.packetCount}\n`);
            this.terminal.write('==================\n');
        },

        /**
         * 停止捕获
         */
        _stopCapture: function() {
            if (!this.isCapturing) return;

            this.isCapturing = false;

            // 移除拦截器
            if (this.networkManager) {
                if (this.requestInterceptor) {
                    this.networkManager.removeRequestInterceptor(this.requestInterceptor);
                }
                if (this.responseInterceptor) {
                    this.networkManager.removeResponseInterceptor(this.responseInterceptor);
                }
            }

            // 清除定时器
            if (this.displayInterval) {
                clearInterval(this.displayInterval);
                this.displayInterval = null;
            }

            // 显示最终统计
            if (!this.quiet) {
                this.terminal.write('\n');
                this.terminal.write('捕获已停止\n');
                this._showStatistics();
            }

            // 延迟关闭
            setTimeout(async () => {
                await this._selfClose();
            }, 500);
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

            // 停止捕获
            this._stopCapture();

            // 延迟一小段时间，确保所有输出都已完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 检查 PID 是否存在
            if (!this.pid) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("TCPDump", "PID 不存在，无法关闭程序");
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
                        KernelLogger.error("TCPDump", `获取 ProcessManager 失败: ${e.message}`, e);
                    }
                }
            }

            if (ProcessMgr && typeof ProcessMgr.killProgram === 'function') {
                try {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("TCPDump", `正在关闭程序 (PID: ${this.pid})`);
                    }
                    const success = await ProcessMgr.killProgram(this.pid, false);
                    if (typeof KernelLogger !== 'undefined') {
                        if (success) {
                            KernelLogger.debug("TCPDump", `程序已成功关闭 (PID: ${this.pid})`);
                        } else {
                            KernelLogger.warn("TCPDump", `程序关闭失败 (PID: ${this.pid})`);
                        }
                    }
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("TCPDump", `关闭程序失败: ${error.message}`, error);
                    }
                }
            } else {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("TCPDump", "ProcessManager 不可用，无法自动关闭");
                }
            }
        },

        /**
         * 退出方法
         */
        __exit__: async function() {
            // 停止捕获
            this._stopCapture();

            // 清理定时器
            if (this.displayInterval) {
                clearInterval(this.displayInterval);
                this.displayInterval = null;
            }

            // 重置状态
            this.isCapturing = false;
            this.terminal = null;
            this.networkManager = null;
            this.requestInterceptor = null;
            this.responseInterceptor = null;
        }
    };

    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.TCPDUMP = TCPDUMP;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.TCPDUMP = TCPDUMP;
    }

    // 注册到 POOL（如果可用）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
                POOL.__INIT__("APPLICATION_SHARED_POOL");
            }
            POOL.__ADD__("APPLICATION_SHARED_POOL", "TCPDump", TCPDUMP);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("TCPDump", `注册到 POOL 失败: ${e.message}`, e);
            }
        }
    }

})(window);

