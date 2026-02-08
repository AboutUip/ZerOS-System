// Hello GUI - 支持后台的测试程序
// 点击关闭转为后台；托盘单击恢复前台；右键关闭强制退出；点击 hello 文字也可转为后台

(function(window) {
    'use strict';

    const HELLOGUI = {
        pid: null,
        window: null,
        windowId: null,
        _kernelAPI: null,

        __info__: function() {
            return {
                name: 'Hello',
                type: 'GUI',
                version: '1.0.0',
                description: '支持后台的 GUI 测试程序，展示 hello 文字',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.PROCESS_BACKGROUND,
                    PermissionManager.PERMISSION.EVENT_LISTENER
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
                width: 320px;
                height: 200px;
                min-width: 200px;
                min-height: 120px;
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
                    title: 'Hello',
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
                align-items: center;
                justify-content: center;
                padding: 24px;
                box-sizing: border-box;
                cursor: pointer;
                user-select: none;
            `;

            const helloText = document.createElement('span');
            helloText.className = 'hellogui-hello';
            helloText.textContent = 'hello';
            helloText.style.cssText = `
                font-size: 28px;
                color: #e8ecf0;
                transition: opacity 0.2s;
            `;
            helloText.addEventListener('mouseenter', () => { helloText.style.opacity = '0.85'; });
            helloText.addEventListener('mouseleave', () => { helloText.style.opacity = '1'; });
            helloText.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closeAndExit();
            });

            content.appendChild(helloText);
            this.window.appendChild(content);
            guiContainer.appendChild(this.window);

            await this._registerBackgroundTray();
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

        /** 完全关闭程序（自终止），用于点击 hello 文字 */
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
        }
    };

    if (typeof window !== 'undefined') {
        window.HELLOGUI = HELLOGUI;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.HELLOGUI = HELLOGUI;
    }
})(typeof window !== 'undefined' ? window : globalThis);
