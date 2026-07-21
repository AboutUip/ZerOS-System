// D:/bin/test.js — 代理启动壳，将命令转发给 C:/test.js
// 用法: 终端输入 test [...参数]，自动加载并执行 C:/test.js
(function(globalThis) {
    'use strict';

    const TARGET_PATH = 'C:/test.js';  // ← 指向你的 CLI 程序路径

    const TEST_SHELL = {
        pid: null,
        terminal: null,
        _closing: false,

        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;
            this.terminal = initArgs.terminal;
            if (!this.terminal) throw new Error('程序需要终端环境');

            const args = initArgs.args || [];

            // 关键：用 setTimeout 让 __init__ 立即返回，进程才能变为 running
            setTimeout(async () => {
                try {
                    await this._loadAndRun(TARGET_PATH, pid, initArgs);
                } catch (e) {
                    this.terminal.write({
                        text: 'test: 加载 C:/test.js 失败 — ' + (e.message || e) + '\n',
                        color: 'red'
                    });
                    setTimeout(async () => { await this._selfClose(); }, 300);
                }
            }, 0);
        },

        // 通过内核 FileSystem API 读取目标文件，eval 后执行其 __init__
        _loadAndRun: async function(fullPath, pid, initArgs) {
            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined') {
                ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
            }
            if (!ProcessMgr || typeof ProcessMgr.callKernelAPI !== 'function') {
                throw new Error('ProcessManager 不可用');
            }

            // 读取 C:/test.js
            const existsInfo = await ProcessMgr.callKernelAPI(pid, 'FileSystem.exists', [fullPath]);
            if (!existsInfo || !existsInfo.exists) {
                throw new Error('文件不存在: ' + fullPath);
            }
            const fileContent = await ProcessMgr.callKernelAPI(pid, 'FileSystem.read', [fullPath]);
            if (!fileContent || typeof fileContent !== 'string') {
                throw new Error('文件内容为空或无法读取');
            }

            // 查找 PROGRAM_OBJECT（遵循 ZerOS 程序规范：IIFE 导出全局变量）
            let programName = null;
            const nameMatch = fileContent.match(/var\s+PROGRAM_NAME\s*=\s*['"]([^'"]+)['"]/);
            if (nameMatch) programName = nameMatch[1];

            if (!programName) {
                // 回退：从文件名推导
                const parts = fullPath.replace(/\\/g, '/').split('/');
                const fileName = parts[parts.length - 1];
                programName = fileName.replace(/\.js$/i, '').toUpperCase();
            }

            // 在沙箱中 eval，获取程序对象引用
            let programObject = null;
            try {
                const evalFn = new Function('globalThis', fileContent);
                const mockGlobal = {};
                evalFn(mockGlobal);
                programObject = mockGlobal[programName];
            } catch (evalErr) {
                throw new Error('C:/test.js 语法或导出错误: ' + (evalErr.message || evalErr));
            }

            if (!programObject || typeof programObject.__init__ !== 'function') {
                throw new Error('C:/test.js 未导出合法的 ZerOS 程序（缺少 __init__）');
            }

            // 注入 _selfClose 供目标程序使用
            if (!programObject._selfClose) {
                programObject._selfClose = this._selfClose.bind(this);
            }

            // 调用目标程序的 __init__
            const targetArgs = initArgs.args || [];
            try {
                await programObject.__init__(pid, {
                    terminal: initArgs.terminal,
                    args: targetArgs,
                    env: initArgs.env,
                    cwd: initArgs.cwd
                });
            } catch (runErr) {
                throw new Error('执行 C:/test.js 时出错: ' + (runErr.message || runErr));
            }
        },

        _showUsage: function() {
            this.terminal.write('用法: test [...]\n');
            this.terminal.write('  代理启动 C:/test.js\n');
        },

        _selfClose: async function() {
            if (this._closing) return;
            this._closing = true;
            await new Promise(r => setTimeout(r, 200));
            if (!this.pid) return;

            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined') {
                ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
            }
            if (ProcessMgr) {
                try {
                    if (typeof ProcessMgr.callKernelAPI === 'function') {
                        await ProcessMgr.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
                    } else if (typeof ProcessMgr.requestSelfTermination === 'function') {
                        await ProcessMgr.requestSelfTermination(this.pid);
                    } else if (typeof ProcessMgr.killProgram === 'function') {
                        await ProcessMgr.killProgram(this.pid, true);
                    }
                } catch (e) { /* 忽略 */ }
            }
        },

        __exit__: async function() {
            this.terminal = null;
        },

        __info__: function() {
            return {
                name: 'TEST',
                type: 'CLI',
                version: '1.0.0',
                description: 'C:/test.js 的代理启动壳',
                metadata: { allowMultipleInstances: true }
            };
        }
    };

    // 导出到全局作用域（ZerOS 程序规范）
    const exportName = 'TEST';
    if (typeof globalThis !== 'undefined') globalThis[exportName] = TEST_SHELL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
