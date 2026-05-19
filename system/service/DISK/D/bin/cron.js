// CRON 计划管理器

(function (window) {
    'use strict';

    const TRIGGER = {
        startup: 'SYSTEM_STARTUP',
        shutdown: 'SYSTEM_SHUTDOWN',
        time: 'SPECIFIC_TIME',
        interval: 'INTERVAL',
        range: 'TIME_RANGE'
    };

    const CRON = {
        pid: null,
        upid: null,
        terminal: null,
        kernelAPI: null,
        initArgs: null,
        version: '1.1.0',
        _closing: false,

        _callKernel: function (apiName, args) {
            if (this.kernelAPI && typeof this.kernelAPI.call === 'function') {
                return this.kernelAPI.call(apiName, args || []);
            }
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                return ProcessManager.callKernelAPI(this.pid, apiName, args || []);
            }
            return Promise.reject(new Error('无可用的内核 API 调用入口'));
        },

        _timeOk: function (s) {
            return typeof s === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim());
        },

        _parsePositiveInt: function (s, name) {
            const n = parseInt(String(s), 10);
            if (!Number.isFinite(n) || n < 1) {
                throw new Error(name + ' 必须是大于等于 1 的整数');
            }
            return n;
        },

        /**
         * 从 argv 尾部解析 --foreground、-D / --dangerous-startup
         * @returns {{ argv: string[], runInBackground: boolean, requiresStartupPermission: boolean }}
         */
        _consumeFlags: function (argv) {
            const out = argv.slice();
            let runInBackground = true;
            let requiresStartupPermission = false;
            let i = out.length - 1;
            while (i >= 0) {
                const t = out[i];
                if (t === '--foreground' || t === '-f') {
                    runInBackground = false;
                    out.splice(i, 1);
                    i--;
                    continue;
                }
                if (t === '-D' || t === '--dangerous-startup') {
                    requiresStartupPermission = true;
                    out.splice(i, 1);
                    i--;
                    continue;
                }
                break;
            }
            return { argv: out, runInBackground, requiresStartupPermission };
        },

        _buildTaskConfigProgram: function (programName, mode, rest, flagResult) {
            const triggerType = TRIGGER[mode];
            if (!triggerType) {
                throw new Error('无效触发模式: ' + mode);
            }
            let triggerConfig = {};
            if (mode === 'time') {
                const t = rest[0];
                if (!this._timeOk(t)) {
                    throw new Error('time 模式需要参数 HH:mm（24 小时制），例如 09:30');
                }
                triggerConfig = { time: t.trim() };
            } else if (mode === 'interval') {
                const minutes = this._parsePositiveInt(rest[0], '间隔分钟数');
                triggerConfig = { interval: minutes };
            } else if (mode === 'range') {
                const startTime = rest[0];
                const endTime = rest[1];
                const interval = this._parsePositiveInt(rest[2], '区间内间隔分钟数');
                if (!this._timeOk(startTime) || !this._timeOk(endTime)) {
                    throw new Error('range 模式需要 startTime endTime interval（分钟），时间格式 HH:mm');
                }
                triggerConfig = {
                    startTime: startTime.trim(),
                    endTime: endTime.trim(),
                    interval: interval
                };
            } else if (mode === 'startup' || mode === 'shutdown') {
                triggerConfig = {};
            }

            const cfg = {
                taskType: 'program',
                programName: programName,
                triggerType: triggerType,
                triggerConfig: triggerConfig,
                enabled: true,
                runInBackground: flagResult.runInBackground
            };
            return { taskConfig: cfg, requiresStartupPermission: flagResult.requiresStartupPermission };
        },

        _cmdSetFromJson: async function (jsonStr) {
            let obj;
            try {
                obj = JSON.parse(jsonStr);
            } catch (e) {
                throw new Error('JSON 解析失败: ' + (e && e.message));
            }
            if (!obj || typeof obj !== 'object') {
                throw new Error('JSON 必须是对象');
            }
            const requiresStartupPermission = !!obj.requiresStartupPermission;
            const payload = Object.assign({}, obj);
            delete payload.requiresStartupPermission;
            const taskId = await this._callKernel('ScheduleTask.create', [payload, requiresStartupPermission]);
            this.terminal.write('已创建计划任务，ID: ' + taskId + '\n');
        },

        _cmdSetProgram: async function (argv) {
            const fr = this._consumeFlags(argv);
            const a = fr.argv;
            if (a.length < 3) {
                throw new Error('用法: cron set program <程序名> <startup|shutdown|time|interval|range> [参数...] [--foreground|-f] [-D|--dangerous-startup]');
            }
            const programName = a[0];
            const mode = a[1];
            const rest = a.slice(2);
            if (mode === 'startup' && rest.length > 0) {
                throw new Error('startup 模式不需要额外参数');
            }
            if (mode === 'shutdown' && rest.length > 0) {
                throw new Error('shutdown 模式不需要额外参数');
            }
            if (mode === 'time' && rest.length !== 1) {
                throw new Error('time 模式需要 1 个参数: HH:mm');
            }
            if (mode === 'interval' && rest.length !== 1) {
                throw new Error('interval 模式需要 1 个参数: 分钟数');
            }
            if (mode === 'range' && rest.length !== 3) {
                throw new Error('range 模式需要 3 个参数: 开始HH:mm 结束HH:mm 间隔分钟');
            }
            const { taskConfig, requiresStartupPermission } = this._buildTaskConfigProgram(programName, mode, rest, fr);
            const req = mode === 'startup' ? requiresStartupPermission : false;
            const taskId = await this._callKernel('ScheduleTask.create', [taskConfig, req]);
            this.terminal.write('已创建计划任务，ID: ' + taskId + '\n');
        },

        _cmdSetCommand: async function (argv) {
            const fr = this._consumeFlags(argv);
            const a = fr.argv;
            if (a.length >= 2 && a[0] === '--cmd') {
                const cmd = a[1];
                const tail = a.slice(2);
                if (tail.length < 2) {
                    throw new Error('用法: cron set command --cmd "<命令>" <startup|shutdown|time|interval|range> [参数...]');
                }
                const mode = tail[0];
                const rest = tail.slice(1);
                const { taskConfig, requiresStartupPermission } = this._buildTaskConfigProgram('__unused__', mode, rest, fr);
                taskConfig.taskType = 'command';
                delete taskConfig.programName;
                taskConfig.command = cmd;
                delete taskConfig.runInBackground;
                const req = mode === 'startup' ? requiresStartupPermission : false;
                const taskId = await this._callKernel('ScheduleTask.create', [taskConfig, req]);
                this.terminal.write('已创建命令计划任务，ID: ' + taskId + '\n');
                return;
            }
            if (a.length < 3) {
                throw new Error('用法: cron set command --cmd "<命令>" <模式> [参数...]  或  cron set command <命令片段...> <模式> [参数...]');
            }
            const known = Object.keys(TRIGGER);
            let modeIdx = -1;
            for (let i = a.length - 1; i >= 0; i--) {
                if (known.indexOf(a[i]) !== -1) {
                    modeIdx = i;
                    break;
                }
            }
            if (modeIdx <= 0) {
                throw new Error('无法解析命令与触发模式，请使用: cron set command --cmd "你的命令" interval 5');
            }
            const mode = a[modeIdx];
            const cmdParts = a.slice(0, modeIdx);
            const command = cmdParts.join(' ').trim();
            if (!command) {
                throw new Error('命令不能为空');
            }
            const rest = a.slice(modeIdx + 1);
            const { taskConfig, requiresStartupPermission } = this._buildTaskConfigProgram('__unused__', mode, rest, fr);
            taskConfig.taskType = 'command';
            delete taskConfig.programName;
            taskConfig.command = command;
            delete taskConfig.runInBackground;
            const req = mode === 'startup' ? requiresStartupPermission : false;
            const taskId = await this._callKernel('ScheduleTask.create', [taskConfig, req]);
            this.terminal.write('已创建命令计划任务，ID: ' + taskId + '\n');
        },

        _cmdSetService: async function (argv) {
            const fr = this._consumeFlags(argv);
            const a = fr.argv;
            if (a.length < 4) {
                throw new Error('用法: cron set service <服务ID> start|stop <startup|shutdown|time|interval|range> [参数...]');
            }
            const serviceId = a[0];
            const action = (a[1] || '').toLowerCase();
            if (action !== 'start' && action !== 'stop') {
                throw new Error('服务操作必须是 start 或 stop');
            }
            const mode = a[2];
            const rest = a.slice(3);
            const { taskConfig, requiresStartupPermission } = this._buildTaskConfigProgram('__unused__', mode, rest, fr);
            taskConfig.taskType = 'service';
            delete taskConfig.programName;
            delete taskConfig.runInBackground;
            taskConfig.serviceId = serviceId;
            taskConfig.serviceAction = action;
            const req = mode === 'startup' ? requiresStartupPermission : false;
            const taskId = await this._callKernel('ScheduleTask.create', [taskConfig, req]);
            this.terminal.write('已创建服务计划任务，ID: ' + taskId + '\n');
        },

        _cmdSet: async function (args) {
            if (!args.length) {
                this.terminal.write('用法: cron set program|command|service ...  或  cron set --json <JSON>\n');
                return;
            }
            if (args[0] === '--json' || args[0] === '-j') {
                if (!args[1]) {
                    throw new Error('cron set --json 需要一段 JSON 字符串');
                }
                const jsonStr = args.slice(1).join(' ');
                await this._cmdSetFromJson(jsonStr);
                return;
            }
            const kind = (args[0] || '').toLowerCase();
            const tail = args.slice(1);
            if (kind === 'program') {
                await this._cmdSetProgram(tail);
            } else if (kind === 'command') {
                await this._cmdSetCommand(tail);
            } else if (kind === 'service') {
                await this._cmdSetService(tail);
            } else {
                throw new Error('未知的 set 子类型: ' + args[0] + '（应为 program、command、service 或 --json）');
            }
        },

        _cmdList: async function () {
            const tasks = await this._callKernel('ScheduleTask.getAll', []);
            const list = Array.isArray(tasks) ? tasks : [];
            this.terminal.write('计划任务共 ' + list.length + ' 个:\n');
            list.forEach(function (task) {
                const line = [
                    '- ' + task.id,
                    'type=' + (task.taskType || 'program'),
                    task.programName ? 'prog=' + task.programName : '',
                    task.command ? 'cmd=' + task.command : '',
                    task.serviceId ? 'svc=' + task.serviceId + '/' + (task.serviceAction || 'start') : '',
                    'trigger=' + task.triggerType,
                    'enabled=' + (task.enabled !== false),
                    'runs=' + (task.runCount || 0)
                ].filter(Boolean).join(' ');
                this.terminal.write(line + '\n');
            }, this);
        },

        _cmdShow: async function (taskId) {
            if (!taskId) {
                throw new Error('用法: cron show <任务ID>');
            }
            const task = await this._callKernel('ScheduleTask.get', [taskId]);
            if (!task) {
                this.terminal.write('未找到任务: ' + taskId + '\n');
                return;
            }
            this.terminal.write(JSON.stringify(task, null, 2) + '\n');
        },

        _cmdRemove: async function (taskId) {
            if (!taskId) {
                throw new Error('用法: cron remove <任务ID>');
            }
            const ok = await this._callKernel('ScheduleTask.delete', [taskId]);
            this.terminal.write(ok ? ('已删除: ' + taskId + '\n') : ('删除失败: ' + taskId + '\n'));
        },

        _cmdEnable: async function (taskId, enabled) {
            if (!taskId) {
                throw new Error('用法: cron enable <任务ID>  或  cron disable <任务ID>');
            }
            const ok = await this._callKernel('ScheduleTask.setEnabled', [taskId, enabled]);
            this.terminal.write(ok ? ('已更新: ' + taskId + '\n') : ('更新失败: ' + taskId + '\n'));
        },

        _printHelp: function () {
            this.terminal.write('CRON 计划任务管理器 v' + this.version + '\n');
            this.terminal.write('用法: cron [选项|子命令]\n');
            this.terminal.write('选项:\n');
            this.terminal.write('  -h, --help              帮助\n');
            this.terminal.write('  -v, --version           版本\n');
            this.terminal.write('  -l, --list              列出全部计划任务\n');
            this.terminal.write('  show <任务ID>           查看任务详情(JSON)\n');
            this.terminal.write('  remove <任务ID>         删除任务（需 SCHEDULE_TASK_MANAGE）\n');
            this.terminal.write('  enable <任务ID>         启用任务\n');
            this.terminal.write('  disable <任务ID>        禁用任务\n');
            this.terminal.write('设置计划任务:\n');
            this.terminal.write('  cron set program <程序名> startup [--foreground|-f] [-D|--dangerous-startup]\n');
            this.terminal.write('  cron set program <程序名> shutdown\n');
            this.terminal.write('  cron set program <程序名> time HH:mm\n');
            this.terminal.write('  cron set program <程序名> interval <分钟>\n');
            this.terminal.write('  cron set program <程序名> range <开始HH:mm> <结束HH:mm> <间隔分钟>\n');
            this.terminal.write('  cron set command --cmd "<命令>" interval <分钟>  （推荐）\n');
            this.terminal.write('  cron set command ls interval 5  （单段命令）\n');
            this.terminal.write('  cron set service <服务ID> start|stop startup|shutdown|time|... [参数]\n');
            this.terminal.write('  cron set --json \'<任务配置JSON>\'  （高级；可含 requiresStartupPermission）\n');
            this.terminal.write('说明: -D/--dangerous-startup 仅用于 startup 模式，对应 SCHEDULE_TASK_STARTUP（管理员）。\n');
        },

        _selfClose: async function () {
            if (this._closing) {
                return;
            }
            this._closing = true;
            await new Promise(function (r) {
                setTimeout(r, 150);
            });
            if (!this.pid) {
                return;
            }
            try {
                if (this.kernelAPI && typeof this.kernelAPI.call === 'function') {
                    await this.kernelAPI.call('Process.requestSelfTermination', []);
                } else if (typeof ProcessManager !== 'undefined') {
                    if (typeof ProcessManager.callKernelAPI === 'function') {
                        await ProcessManager.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
                    } else if (typeof ProcessManager.requestSelfTermination === 'function') {
                        await ProcessManager.requestSelfTermination(this.pid);
                    }
                }
            } catch (e) {
                /* ignore */
            }
        },

        async __init__(pid, initArgs) {
            this.pid = pid;
            this.initArgs = initArgs || {};
            this.kernelAPI = initArgs && initArgs.kernelAPI;
            this.upid = initArgs && initArgs.upid;
            this.terminal = initArgs && initArgs.terminal;

            if (!this.terminal) {
                throw new Error('CRON 需要终端环境');
            }

            const self = this;
            const args = (initArgs && initArgs.args) ? initArgs.args.slice() : [];

            setTimeout(async function () {
                try {
                    const cmd = args[0];

                    if (cmd === '-h' || cmd === '--help' || cmd === undefined) {
                        self._printHelp();
                    } else if (cmd === '-v' || cmd === '--version') {
                        self.terminal.write('CRON 计划管理器版本: ' + self.version + '\n');
                    } else if (cmd === '-l' || cmd === '--list') {
                        await self._cmdList();
                    } else if (cmd === 'set') {
                        await self._cmdSet(args.slice(1));
                    } else if (cmd === 'show') {
                        await self._cmdShow(args[1]);
                    } else if (cmd === 'remove' || cmd === 'rm') {
                        await self._cmdRemove(args[1]);
                    } else if (cmd === 'enable') {
                        await self._cmdEnable(args[1], true);
                    } else if (cmd === 'disable') {
                        await self._cmdEnable(args[1], false);
                    } else {
                        self.terminal.write("未知子命令。使用 cron -h 查看帮助。\n");
                    }
                } catch (err) {
                    const msg = (err && err.message) ? err.message : String(err);
                    self.terminal.write('错误: ' + msg + '\n');
                } finally {
                    try {
                        await self._selfClose();
                    } catch (e2) { /* */ }
                    try {
                        await self.__exit__();
                    } catch (e3) { /* */ }
                }
            }, 0);
        },

        async __exit__() {
            this.terminal = null;
            this.kernelAPI = null;
            this.initArgs = null;
        },

        __info__() {
            return {
                name: 'CRON',
                type: 'CLI',
                version: this.version,
                description: '计划任务 CLI：列出、创建、删除、启停计划任务。',
                author: '小萱baibai',
                copyright: 'Copyright (c) 2026 小萱baibai. All rights reserved.',
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: false
                },
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_CREATE,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_STARTUP,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_MANAGE
                ] : [
                    'SYSTEM_NOTIFICATION',
                    'SCHEDULE_TASK_CREATE',
                    'SCHEDULE_TASK_STARTUP',
                    'SCHEDULE_TASK_MANAGE'
                ]
            };
        }
    };

    if (typeof window !== 'undefined') {
        window.CRON = CRON;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.CRON = CRON;
    }

    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__('APPLICATION_SHARED_POOL')) {
                POOL.__INIT__('APPLICATION_SHARED_POOL');
            }
            POOL.__ADD__('APPLICATION_SHARED_POOL', 'CRON', CRON);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('CRON', '注册到 POOL 失败: ' + (e && e.message), e);
            }
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);