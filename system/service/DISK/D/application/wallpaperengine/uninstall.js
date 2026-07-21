// WallpaperEngine 卸载脚本：删除程序时自动删除服务、移除自启动等配置
// 必须导出 window.UNINSTALL，供 LStorage.uninstallApplication 执行

(function (window) {
    'use strict';

    const PM = typeof PermissionManager !== 'undefined' ? PermissionManager.PERMISSION : {};
    const SERVER_SERVICE_PATH = 'D:/server/server-wallpaperengine.js';
    const PROGRAM_NAME = 'wallpaperengine';
    const TRIGGER_STARTUP = 'SYSTEM_STARTUP';

    const UNINSTALL = {
        pid: null,
        _uninstallContext: null,
        _kernelAPI: null,

        __info__: function () {
            return {
                name: 'WallpaperEngine Uninstall',
                type: 'CLI',
                version: '1.0.0',
                description: '壁纸引擎卸载脚本 - 删除服务与自启动',
                author: 'ZerOS',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PM.KERNEL_DISK_DELETE,
                    PM.SCHEDULE_TASK_MANAGE
                ] : [],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        },

        __init__: async function (pid, initArgs) {
            this.pid = pid;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;
            if (initArgs && initArgs.metadata && initArgs.metadata.uninstallContext) {
                this._uninstallContext = initArgs.metadata.uninstallContext;
            }

            if (!this._kernelAPI || typeof this._kernelAPI.call !== 'function') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('WallpaperEngine Uninstall', '无 kernelAPI，跳过清理');
                }
                return;
            }

            var api = this._kernelAPI;

            // 1. 删除 D/server 下的服务文件
            try {
                await api.call('FileSystem.delete', [SERVER_SERVICE_PATH]);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('WallpaperEngine Uninstall', '已删除服务: ' + SERVER_SERVICE_PATH);
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('WallpaperEngine Uninstall', '删除服务失败（可能不存在）: ' + (e && e.message));
                }
            }

            // 2. 移除自启动计划任务（服务自启 + 程序自启，若存在）
            try {
                var list = await api.call('ScheduleTask.getAll', []);
                if (Array.isArray(list)) {
                    var startupTasks = list.filter(function (t) {
                        if (!t || t.triggerType !== TRIGGER_STARTUP) return false;
                        return (t.taskType === 'service' && t.serviceId === PROGRAM_NAME) || ((t.taskType || 'program') === 'program' && t.programName === PROGRAM_NAME);
                    });
                    for (var i = 0; i < startupTasks.length; i++) {
                        var task = startupTasks[i];
                        if (task.id != null) {
                            await api.call('ScheduleTask.delete', [task.id]);
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.info('WallpaperEngine Uninstall', '已移除自启动任务: ' + task.id);
                            }
                        }
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('WallpaperEngine Uninstall', '移除自启动失败: ' + (e && e.message));
                }
            }

            if (api && typeof api.call === 'function') {
                api.call('Process.requestSelfTermination', []).catch(function () {});
            }
        },

        __exit__: async function () {}
    };

    if (typeof window !== 'undefined') {
        window.UNINSTALL = UNINSTALL;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.UNINSTALL = UNINSTALL;
    }
})(typeof window !== 'undefined' ? window : globalThis);
