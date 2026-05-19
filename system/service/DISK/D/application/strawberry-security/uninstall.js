/**
 * 草莓安全卸载脚本（CLI）
 * 由系统在卸载 strawberry-security 时自动执行，或可单独从终端运行以清理残余。
 * 清理：D:/server/server-strawberrysecurity.js、.zom 文件关联、草莓安全服务自启计划任务。
 * 终端写入日志；同时写入 D:/cache/strawberry-uninstall.log。
 */
(function(global) {
    'use strict';

    const UNINSTALL = {
        pid: null,
        terminal: null,
        kernelAPI: null,
        logLines: [],

        __info__: function() {
            return {
                name: 'Uninstall',
                type: 'CLI',
                version: '1.0.0',
                description: '草莓安全卸载脚本：清理残余文件与配置',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    PermissionManager.PERMISSION.FILE_ASSOC_MANAGE,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_MANAGE
                ] : [],
                metadata: { autoStart: false, allowMultipleInstances: false }
            };
        },

        _log: function(msg) {
            var line = '[' + new Date().toISOString() + '] ' + msg;
            this.logLines.push(line);
            if (this.terminal && typeof this.terminal.write === 'function') {
                this.terminal.write(line + '\n');
            }
        },

        _call: function(apiName, args) {
            var api = this.kernelAPI;
            if (!api || typeof api.call !== 'function') {
                return Promise.reject(new Error('内核 API 不可用'));
            }
            return api.call(apiName, Array.isArray(args) ? args : []);
        },

        __init__: async function(pid, initArgs) {
            this.pid = pid;
            this.terminal = (initArgs && initArgs.terminal) || null;
            this.kernelAPI = (initArgs && initArgs.kernelAPI) || null;
            var self = this;
            var programName = (initArgs && initArgs.args && initArgs.args[0]) ? initArgs.args[0] : 'strawberry-security';

            self._log('strawberry-uninstall: 开始清理残余与配置');

            try {
                // 1. 删除 D:/server/server-strawberrysecurity.js
                try {
                    await self._call('FileSystem.delete', ['D:/server/server-strawberrysecurity.js']);
                    self._log('strawberry-uninstall: 已删除 D:/server/server-strawberrysecurity.js');
                } catch (e) {
                    self._log('strawberry-uninstall: 删除服务脚本跳过（可能不存在）');
                }

                // 2. 若 .zom 当前关联为草莓安全，则清除关联
                try {
                    var current = await self._call('FileAssoc.get', ['.zom']);
                    if (current === 'strawberry-security' || current === programName) {
                        await self._call('FileAssoc.clear', ['.zom']);
                        self._log('strawberry-uninstall: 已清除 .zom 文件关联');
                    } else {
                        self._log('strawberry-uninstall: .zom 未关联草莓安全，跳过');
                    }
                } catch (e) {
                    self._log('strawberry-uninstall: 清除 .zom 关联跳过');
                }

                // 3. 删除草莓安全服务自启计划任务
                try {
                    var tasks = await self._call('ScheduleTask.getAll', []);
                    if (Array.isArray(tasks)) {
                        var removed = 0;
                        for (var i = 0; i < tasks.length; i++) {
                            var t = tasks[i];
                            if (t && t.taskType === 'service' && t.serviceId === 'strawberrysecurity' &&
                                t.triggerType === 'SYSTEM_STARTUP') {
                                await self._call('ScheduleTask.delete', [t.id]);
                                removed++;
                            }
                        }
                        if (removed > 0) {
                            self._log('strawberry-uninstall: 已删除 ' + removed + ' 条服务自启计划任务');
                        } else {
                            self._log('strawberry-uninstall: 无草莓安全服务自启任务，跳过');
                        }
                    }
                } catch (e) {
                    self._log('strawberry-uninstall: 删除计划任务跳过');
                }

                self._log('strawberry-uninstall: 清理完成');
            } catch (err) {
                self._log('strawberry-uninstall: 执行出错 ' + (err && err.message ? err.message : String(err)));
            }

            // 写入日志文件：先检查是否存在再决定追加或新建，避免对不存在文件 read 导致 404
            try {
                var logContent = self.logLines.join('\n') + '\n';
                var logPath = 'D:/cache/strawberry-uninstall.log';
                var listResult = await self._call('FileSystem.list', ['D:/cache']).catch(function() { return null; });
                var files = (listResult && listResult.files) ? listResult.files : [];
                var exists = files.some(function(item) {
                    return item && (item.name === 'strawberry-uninstall.log' || item.fileName === 'strawberry-uninstall.log');
                });
                var content = logContent;
                if (exists) {
                    var prev = await self._call('FileSystem.read', [logPath]).catch(function() { return null; });
                    if (prev && typeof prev === 'string') {
                        content = prev + logContent;
                    }
                }
                await self._call('FileSystem.write', [logPath, content, 'OVERWRITE']);
            } catch (e) {}

            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.requestSelfTermination === 'function') {
                try {
                    ProcessManager.requestSelfTermination(self.pid);
                } catch (e) {}
            }
        }
    };

    if (typeof window !== 'undefined') {
        window['UNINSTALL'] = UNINSTALL;
    }
    if (typeof global !== 'undefined') {
        global['UNINSTALL'] = UNINSTALL;
    }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
