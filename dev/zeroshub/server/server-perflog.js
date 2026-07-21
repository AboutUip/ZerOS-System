// server-perflog.js — 性能日志开关
// 安装到 D:/server/ 后，自动关闭 ProcessManager 的 action 日志
// 仅在任务管理器运行时临时开启，减少内核内存压力

(function() {
    'use strict';

    var _originalLogAction = null;
    var _patched = false;
    var _pollTimer = null;
    var _taskmanagerRunning = false;

    function isTaskManagerRunning() {
        if (typeof ProcessManager === 'undefined') return false;
        try {
            var processes = ProcessManager.getProcessInfo();
            if (!processes) return false;
            for (var i = 0; i < processes.length; i++) {
                var p = processes[i];
                if (p && p.status === 'running' && p.programName === 'taskmanager') {
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function applyPatch() {
        if (_patched) return;
        if (typeof ProcessManager === 'undefined') return;
        if (typeof ProcessManager._logProgramAction !== 'function') return;

        _originalLogAction = ProcessManager._logProgramAction;
        ProcessManager._actionLoggingEnabled = false;

        ProcessManager._logProgramAction = function(pid, action, details) {
            if (!ProcessManager._actionLoggingEnabled) return;
            return _originalLogAction.call(this, pid, action, details);
        };

        _patched = true;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('PERFLOG', 'action 日志已关闭，仅在任务管理器运行时开启');
        }
    }

    function removePatch() {
        if (!_patched) return;
        if (typeof ProcessManager === 'undefined') return;
        if (_originalLogAction) {
            ProcessManager._logProgramAction = _originalLogAction;
            _originalLogAction = null;
        }
        _patched = false;
    }

    function startPolling() {
        if (_pollTimer) return;
        _pollTimer = setInterval(function() {
            var wasRunning = _taskmanagerRunning;
            _taskmanagerRunning = isTaskManagerRunning();

            if (_taskmanagerRunning !== wasRunning) {
                if (typeof ProcessManager !== 'undefined') {
                    ProcessManager._actionLoggingEnabled = _taskmanagerRunning;
                }
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('PERFLOG', 'action 日志: ' + (_taskmanagerRunning ? '开启（检测到任务管理器）' : '关闭'));
                }
            }
        }, 3000);
    }

    function stopPolling() {
        if (_pollTimer) {
            clearInterval(_pollTimer);
            _pollTimer = null;
        }
        if (typeof ProcessManager !== 'undefined') {
            ProcessManager._actionLoggingEnabled = false;
        }
    }

    var api = {
        __init__: function() {
            applyPatch();
            startPolling();
        },

        __start__: function() {
            applyPatch();
            startPolling();
        },

        __stop__: function() {
            stopPolling();
            removePatch();
        },

        __status__: function() {
            return {
                patched: _patched,
                taskManagerRunning: _taskmanagerRunning,
                loggingEnabled: (typeof ProcessManager !== 'undefined') ? ProcessManager._actionLoggingEnabled : false
            };
        },

        __info__: function() {
            return {
                name: '性能日志开关',
                version: '1.0.0',
                description: '关闭 ProcessManager action 日志，仅在任务管理器运行时临时开启',
                author: 'DevBridge'
            };
        }
    };

    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__(api);
    }
})();
