/* Service 命令实现
 * 功能：
 * - 系统服务相关处理，依赖内核服务扩展模块 ServerExpansion
 * - 支持 list / start / stop / status / info / reload
 * - 程序执行完成后自动关闭
 */

(function(window) {
    'use strict';

    const SERVICE = {
        pid: null,
        terminal: null,
        _closing: false,
        /** 进程管理器注入的 kernelAPI（通过 Server.* 调用，需 SERVER_SERVICE_MANAGE 权限） */
        _kernelAPI: null,

        __info__: function() {
            return {
                name: 'Service',
                type: 'CLI',
                version: '1.0.0',
                description: '系统服务管理',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE
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
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

            if (!this.terminal) {
                throw new Error('Service 程序需要终端环境');
            }

            const args = initArgs.args || [];

            setTimeout(async () => {
                try {
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    if (!this._kernelAPI || typeof this._kernelAPI.call !== 'function') {
                        this.terminal.write('service: 内核 API 不可用或缺少 SERVER_SERVICE_MANAGE 权限\n');
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    const sub = (args[0] && !args[0].startsWith('-')) ? args[0].toLowerCase() : 'list';
                    const id = args[1];

                    if (sub === 'list') {
                        await this._cmdList();
                    } else if (sub === 'start') {
                        if (!id) {
                            this.terminal.write('service: start 需要指定服务 id\n');
                            this._showUsage();
                        } else {
                            await this._cmdStart(id);
                        }
                    } else if (sub === 'stop') {
                        if (!id) {
                            this.terminal.write('service: stop 需要指定服务 id\n');
                            this._showUsage();
                        } else {
                            await this._cmdStop(id);
                        }
                    } else if (sub === 'status') {
                        if (!id) {
                            this.terminal.write('service: status 需要指定服务 id\n');
                            this._showUsage();
                        } else {
                            await this._cmdStatus(id);
                        }
                    } else if (sub === 'info') {
                        if (!id) {
                            this.terminal.write('service: info 需要指定服务 id\n');
                            this._showUsage();
                        } else {
                            await this._cmdInfo(id);
                        }
                    } else if (sub === 'reload') {
                        await this._cmdReload();
                    } else {
                        this.terminal.write(`service: 未知子命令 '${args[0]}'\n`);
                        this._showUsage();
                    }
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('Service', `执行失败: ${error.message}`, error);
                    }
                    this.terminal.write(`service: 错误: ${error.message || '未知错误'}\n`);
                } finally {
                    setTimeout(() => this._selfClose(), 300);
                }
            }, 0);
        },

        _showUsage: function() {
            this.terminal.write('用法: service <子命令> [服务 id]\n');
            this.terminal.write('\n');
            this.terminal.write('子命令:\n');
            this.terminal.write('  list      列出已加载的服务（默认）\n');
            this.terminal.write('  start     启动服务\n');
            this.terminal.write('  stop      停止服务\n');
            this.terminal.write('  status    查询服务状态\n');
            this.terminal.write('  info      查看服务信息\n');
            this.terminal.write('  reload    重新扫描 D/server 并加载服务模块\n');
            this.terminal.write('\n');
            this.terminal.write('选项: -h, --help  显示此帮助\n');
            this.terminal.write('\n');
            this.terminal.write('示例:\n');
            this.terminal.write('  service\n');
            this.terminal.write('  service list\n');
            this.terminal.write('  service start notice\n');
            this.terminal.write('  service stop notice\n');
            this.terminal.write('  service status notice\n');
        },

        _cmdList: async function() {
            const ids = await this._kernelAPI.call('Server.listServices', []) || [];
            this.terminal.write('已加载的服务:\n');
            if (ids.length === 0) {
                this.terminal.write('  (无)\n');
                return;
            }
            for (const id of ids) {
                const inited = await this._kernelAPI.call('Server.isInited', [id]);
                const started = await this._kernelAPI.call('Server.isStarted', [id]);
                this.terminal.write(`  ${id}  [${inited ? '已初始化' : '-'}] [${started ? '运行中' : '已停止'}]\n`);
            }
        },

        _cmdStart: async function(id) {
            this.terminal.write(`正在启动服务: ${id} ...\n`);
            try {
                const ok = await this._kernelAPI.call('Server.start', [id]);
                if (ok) {
                    this.terminal.write(`服务 ${id} 已启动\n`);
                } else {
                    this.terminal.write(`服务 ${id} 启动失败\n`);
                }
            } catch (e) {
                this.terminal.write(`service start: ${e.message || e}\n`);
            }
        },

        _cmdStop: async function(id) {
            this.terminal.write(`正在停止服务: ${id} ...\n`);
            try {
                const ok = await this._kernelAPI.call('Server.stop', [id]);
                if (ok) {
                    this.terminal.write(`服务 ${id} 已停止\n`);
                } else {
                    this.terminal.write(`服务 ${id} 停止失败或未加载\n`);
                }
            } catch (e) {
                this.terminal.write(`service stop: ${e.message || e}\n`);
            }
        },

        _cmdStatus: async function(id) {
            try {
                const st = await this._kernelAPI.call('Server.status', [id]);
                this.terminal.write(`服务 ${id} 状态: ${st !== undefined ? JSON.stringify(st) : '(未加载或无 __status__)'}\n`);
                const started = await this._kernelAPI.call('Server.isStarted', [id]);
                this.terminal.write(started ? '  运行中: 是\n' : '  运行中: 否\n');
            } catch (e) {
                this.terminal.write(`service status: ${e.message || e}\n`);
            }
        },

        _cmdInfo: async function(id) {
            try {
                const info = await this._kernelAPI.call('Server.info', [id]);
                if (info === undefined) {
                    this.terminal.write(`服务 ${id}: 未加载或无 __info__\n`);
                    return;
                }
                this.terminal.write(`服务 ${id} 信息:\n`);
                this.terminal.write(JSON.stringify(info, null, 2) + '\n');
            } catch (e) {
                this.terminal.write(`service info: ${e.message || e}\n`);
            }
        },

        _cmdReload: async function() {
            this.terminal.write('正在重新扫描 D/server 并加载服务模块 ...\n');
            try {
                const ids = await this._kernelAPI.call('Server.loadAll', []) || [];
                this.terminal.write(`已加载 ${ids && ids.length ? ids.length : 0} 个服务: ${ids && ids.length ? ids.join(', ') : '(无)'}\n`);
            } catch (e) {
                this.terminal.write(`service reload: ${e.message || e}\n`);
            }
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
        window.SERVICE = SERVICE;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.SERVICE = SERVICE;
    }

    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__('APPLICATION_SHARED_POOL')) {
                POOL.__INIT__('APPLICATION_SHARED_POOL');
            }
            POOL.__ADD__('APPLICATION_SHARED_POOL', 'SERVICE', SERVICE);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('Service', `注册到 POOL 失败: ${e.message}`, e);
            }
        }
    }
})(window);
