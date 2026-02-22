// JWT/Upid 测试程序 - 支持后台
// 覆盖 FSDirve、CompressionDirve、DISKMANAGER 的 upid 权限校验测试

(function(window) {
    'use strict';

    const PM = typeof PermissionManager !== 'undefined' ? PermissionManager.PERMISSION : {};

    const HELLOGUI = {
        pid: null,
        window: null,
        windowId: null,
        _kernelAPI: null,
        _upid: null,

        __info__: function() {
            return {
                name: 'JWT/Upid 测试',
                type: 'GUI',
                version: '1.0.0',
                description: 'JWT 与 upid 权限校验测试程序，覆盖 FSDirve/CompressionDirve/DISKMANAGER',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PM.GUI_WINDOW_CREATE,
                    PM.PROCESS_BACKGROUND,
                    PM.EVENT_LISTENER,
                    PM.KERNEL_DISK_READ,
                    PM.KERNEL_DISK_WRITE,
                    PM.KERNEL_DISK_LIST,
                    PM.KERNEL_DISK_CREATE,
                    PM.KERNEL_DISK_DELETE
                ] : [],
                metadata: {
                    category: 'system',
                    showOnDesktop: true
                }
            };
        },

        __init__: async function(pid, initArgs) {
            this.pid = pid;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;
            this._upid = (initArgs && initArgs.upid) || null;

            const guiContainer = (initArgs && initArgs.guiContainer) || document.getElementById('gui-container');
            if (!guiContainer) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('HelloGUI', '未找到 gui-container');
                }
                return;
            }

            this.window = document.createElement('div');
            this.window.className = 'hellogui-window';
            this.window.dataset.pid = String(pid);
            this.window.style.cssText = `
                width: 420px;
                height: 480px;
                min-width: 360px;
                min-height: 400px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;

            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('hellogui');
                }
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: 'JWT/Upid 测试',
                    icon: icon,
                    onClose: () => this._onCloseRequest()
                });
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }

            const content = document.createElement('div');
            content.className = 'hellogui-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                padding: 16px;
                box-sizing: border-box;
                overflow: hidden;
            `;

            const header = document.createElement('div');
            header.style.cssText = 'margin-bottom: 12px; font-size: 13px; color: #a0aec0;';
            header.innerHTML = 'upid: <code style="background:#2d3748;padding:2px 6px;border-radius:4px;">' + (this._upid || '(无)') + '</code>';
            content.appendChild(header);

            const hint = document.createElement('div');
            hint.style.cssText = 'margin-bottom: 12px; font-size: 11px; color: #718096; line-height: 1.5;';
            hint.innerHTML = '说明：首项测试会<strong>故意</strong>发送无 upid 的请求，网络面板中出现的 401 为预期结果，用于验证后端正确拒绝。';
            content.appendChild(hint);

            const runBtn = document.createElement('button');
            runBtn.textContent = '运行全部测试';
            runBtn.style.cssText = `
                padding: 10px 16px;
                margin-bottom: 12px;
                background: #4299e1;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            `;
            runBtn.addEventListener('click', () => this._runAllTests());
            content.appendChild(runBtn);

            const results = document.createElement('div');
            results.className = 'hellogui-results';
            results.style.cssText = `
                flex: 1;
                overflow-y: auto;
                font-family: monospace;
                font-size: 12px;
                line-height: 1.6;
            `;
            content.appendChild(results);
            this._resultsEl = results;

            const exitBtn = document.createElement('button');
            exitBtn.textContent = '退出';
            exitBtn.style.cssText = `
                margin-top: 12px;
                padding: 8px 16px;
                background: #e53e3e;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            `;
            exitBtn.addEventListener('click', () => this._closeAndExit());
            content.appendChild(exitBtn);

            this.window.appendChild(content);
            guiContainer.appendChild(this.window);

            // 延迟注册：Process.registerBackgroundTrayClick 要求 status='running'，此时 __init__ 尚未返回故仍为 starting，需等下一事件循环
            setTimeout(() => { this._registerBackgroundTray(); }, 0);
        },

        _log: function(msg, isError) {
            if (!this._resultsEl) return;
            const line = document.createElement('div');
            line.style.color = isError ? '#fc8181' : '#68d391';
            line.textContent = msg;
            this._resultsEl.appendChild(line);
            this._resultsEl.scrollTop = this._resultsEl.scrollHeight;
        },

        _clearLog: function() {
            if (this._resultsEl) this._resultsEl.innerHTML = '';
        },

        _buildUrl: function(serviceName, params) {
            if (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) {
                const nameMap = { FSDirve: SystemInformation.SERVICE_NAMES.FSDIRVE, CompressionDirve: SystemInformation.SERVICE_NAMES.COMPRESSION_DIRVE, DISKMANAGER: SystemInformation.SERVICE_NAMES.DISKMANAGER };
                const key = nameMap[serviceName] || serviceName;
                const url = SystemInformation.buildServiceUrlObject(key, { upid: this._upid });
                if (params) {
                    for (const [k, v] of Object.entries(params)) {
                        url.searchParams.set(k, String(v));
                    }
                }
                return url.toString();
            }
            const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:8089';
            const pathMap = {
                FSDirve: (typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php',
                CompressionDirve: (typeof SystemInformation !== 'undefined' && SystemInformation.getCompressionDirvePath) ? SystemInformation.getCompressionDirvePath() : '/system/service/CompressionDirve.php',
                DISKMANAGER: (typeof SystemInformation !== 'undefined' && SystemInformation.getServicePath) ? SystemInformation.getServicePath(SystemInformation.SERVICE_NAMES.DISKMANAGER) : '/system/service/DISKMANAGER.php'
            };
            const url = new URL(pathMap[serviceName] || serviceName, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : origin);
            if (this._upid != null) url.searchParams.set('upid', String(this._upid));
            if (params) {
                for (const [k, v] of Object.entries(params)) {
                    url.searchParams.set(k, String(v));
                }
            }
            return url.toString();
        },

        _runAllTests: async function() {
            this._clearLog();
            if (!this._upid) {
                this._log('❌ 无 upid，无法测试', true);
                return;
            }
            this._testDir = 'D:/cache/_hellogui_test_' + Date.now();
            this._log('开始测试...');

            const tests = [
                { name: 'UserToken 无 upid 应拒绝', fn: () => this._testNoUpidRejected() },
                { name: 'FSDirve list_dir', fn: () => this._testFSListDir() },
                { name: 'FSDirve get_disk_info', fn: () => this._testFSGetDiskInfo() },
                { name: 'FSDirve exists', fn: () => this._testFSExists() },
                { name: 'FSDirve create_dir', fn: () => this._testFSCreateDir() },
                { name: 'FSDirve create_file', fn: () => this._testFSCreateFile() },
                { name: 'FSDirve read_file', fn: () => this._testFSReadFile() },
                { name: 'FSDirve get_file_info', fn: () => this._testFSGetFileInfo() },
                { name: 'FSDirve write_file', fn: () => this._testFSWriteFile() },
                { name: 'FSDirve delete_file', fn: () => this._testFSDeleteFile() },
                { name: 'FSDirve delete_dir_recursive', fn: () => this._testFSDeleteDir() },
                { name: 'CompressionDirve check_support', fn: () => this._testCompCheckSupport() },
                { name: 'CompressionDirve list_zip', fn: () => this._testCompListZip() },
                { name: 'DISKMANAGER list', fn: () => this._testDiskList() },
                { name: 'DISKMANAGER check', fn: () => this._testDiskCheck() },
                { name: 'DISKMANAGER read_data', fn: () => this._testDiskReadData() }
            ];

            for (const t of tests) {
                try {
                    await t.fn();
                    this._log('✓ ' + t.name);
                } catch (e) {
                    this._log('✗ ' + t.name + ': ' + (e && e.message), true);
                }
            }
            this._log('测试完成');
        },

        _testNoUpidRejected: async function() {
            const base = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:8089');
            const path = (typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php';
            const url = new URL(path, base);
            url.searchParams.set('action', 'list_dir');
            url.searchParams.set('path', 'D:');
            const res = await fetch(url.toString());
            if (res.status !== 401) throw new Error('预期 401，实际 ' + res.status);
            const data = await res.json();
            if (!data.message || !data.message.includes('upid')) throw new Error('预期提示 upid，实际: ' + (data.message || ''));
        },

        _testFSListDir: async function() {
            const url = this._buildUrl('FSDirve', { action: 'list_dir', path: 'D:' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'list_dir 失败');
        },

        _testFSGetDiskInfo: async function() {
            const url = this._buildUrl('FSDirve', { action: 'get_disk_info', disk: 'D' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'get_disk_info 失败');
        },

        _testFSExists: async function() {
            const url = this._buildUrl('FSDirve', { action: 'exists', path: 'D:/cache' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'exists 失败');
        },

        _testFSCreateDir: async function() {
            const dirName = '_hellogui_test_' + Date.now();
            const url = this._buildUrl('FSDirve', { action: 'create_dir', path: 'D:/cache', name: dirName });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'create_dir 失败');
        },

        _testFSCreateFile: async function() {
            const name = this._testDir.split('/').pop();
            await fetch(this._buildUrl('FSDirve', { action: 'create_dir', path: 'D:/cache', name }));
            const url = this._buildUrl('FSDirve', { action: 'create_file', path: this._testDir, fileName: 'test.txt', content: 'hello' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'create_file 失败');
        },

        _testFSReadFile: async function() {
            const url = this._buildUrl('FSDirve', { action: 'read_file', path: this._testDir, fileName: 'test.txt' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'read_file 失败');
        },

        _testFSGetFileInfo: async function() {
            const url = this._buildUrl('FSDirve', { action: 'get_file_info', path: this._testDir, fileName: 'test.txt' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'get_file_info 失败');
        },

        _testFSWriteFile: async function() {
            const url = this._buildUrl('FSDirve', { action: 'write_file', path: this._testDir, fileName: 'w.txt', writeMod: 'overwrite' });
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: 'test' })
            });
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'write_file 失败');
        },

        _testFSDeleteFile: async function() {
            const url = this._buildUrl('FSDirve', { action: 'delete_file', path: this._testDir, fileName: 'test.txt' });
            const res = await fetch(url);
            if (!res.ok) {
                const data = await res.json();
                if (data.message && !data.message.includes('不存在')) throw new Error(data.message);
            }
        },

        _testFSDeleteDir: async function() {
            const url = this._buildUrl('FSDirve', { action: 'delete_dir_recursive', path: this._testDir });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'delete_dir_recursive 失败');
        },

        _testCompCheckSupport: async function() {
            const url = this._buildUrl('CompressionDirve', { action: 'check_support' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'check_support 失败');
        },

        _testCompListZip: async function() {
            const url = this._buildUrl('CompressionDirve', { action: 'list_zip', sourcePath: 'D:/cache/empty.zip' });
            const res = await fetch(url);
            if (res.ok) return;
            const data = await res.json();
            if (data.message && data.message.includes('不存在')) return;
            throw new Error(data.message || 'list_zip 失败');
        },

        _testDiskList: async function() {
            const url = this._buildUrl('DISKMANAGER', { action: 'list' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'list 失败');
        },

        _testDiskCheck: async function() {
            const url = this._buildUrl('DISKMANAGER', { action: 'check', partition: 'D:' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'check 失败');
        },

        _testDiskReadData: async function() {
            const url = this._buildUrl('DISKMANAGER', { action: 'read_data' });
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'read_data 失败');
        },

        _onCloseRequest: function() {
            this._goToBackground();
        },

        _goToBackground: function() {
            if (!this.windowId || !this.window) return;
            const winInfo = typeof GUIManager !== 'undefined' ? GUIManager.getWindowInfo(this.windowId) : null;
            if (winInfo) {
                winInfo._backgroundRequested = true;
            }
            if (this.window.style) {
                this.window.style.display = 'none';
            }
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                this._kernelAPI.call('Process.requestBackground', []).catch(e => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('HelloGUI', 'requestBackground 失败: ' + (e && e.message));
                    }
                });
            }
        },

        _closeAndExit: function() {
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                this._kernelAPI.call('Process.requestSelfTermination', []).catch(e => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('HelloGUI', 'requestSelfTermination 失败: ' + (e && e.message));
                    }
                });
                return;
            }
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                ProcessManager.killProgram(this.pid).catch(function() {});
            }
        },

        _registerBackgroundTray: async function() {
            if (!this._kernelAPI || typeof this._kernelAPI.call !== 'function') return;
            const windowId = this.windowId;
            const kernelAPI = this._kernelAPI;
            try {
                await this._kernelAPI.call('Process.registerBackgroundTrayClick', [
                    function() {
                        if (typeof GUIManager === 'undefined') return;
                        const winInfo = GUIManager.getWindowInfo(windowId);
                        if (winInfo && winInfo.window) {
                            winInfo.window.style.display = '';
                            if (typeof GUIManager.focusWindow === 'function') {
                                GUIManager.focusWindow(windowId);
                            }
                        }
                        if (kernelAPI && typeof kernelAPI.call === 'function') {
                            kernelAPI.call('Process.requestForeground', []).catch(function() {});
                        }
                    }
                ]);
                await this._kernelAPI.call('Process.registerBackgroundTrayContextMenu', [
                    function() { return []; }
                ]);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('HelloGUI', '注册后台托盘失败: ' + (e && e.message));
                }
            }
        },

        __exit__: function() {
            if (this.window && this.window.parentElement) {
                this.window.remove();
            }
            this.window = null;
            this.windowId = null;
            this._kernelAPI = null;
            this._resultsEl = null;
        }
    };

    if (typeof window !== 'undefined') {
        window.HELLOGUI = HELLOGUI;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.HELLOGUI = HELLOGUI;
    }
})(typeof window !== 'undefined' ? window : globalThis);
