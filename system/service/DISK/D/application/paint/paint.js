/**
 * 绘图 - 简易画板（仿苹果风格）
 * 功能：铅笔/画笔/橡皮擦、颜色、线宽、清空画布、导出 PNG（选择保存位置）
 */
(function(window) {
    'use strict';

    const PAINT = {
        pid: null,
        window: null,
        windowId: null,
        canvas: null,           // 显示用 canvas
        ctx: null,              // 显示用 ctx
        offCanvas: null,        // 离屏 canvas（存储绘画内容）
        offCtx: null,           // 离屏 ctx
        toolbar: null,
        colorInput: null,
        widthInput: null,
        toolButtons: {},
        currentTool: 'pencil',
        currentColor: '#ff9f0a',
        currentWidth: 3,
        isDrawing: false,
        lastX: 0,
        lastY: 0,
        // 离屏 canvas 的固定尺寸
        OFF_WIDTH: 3000,
        OFF_HEIGHT: 2000,

        /**
         * 初始化
         * @param {Object} initArgs
         */
        __init__: async function(pid, initArgs = {}) {
            try {
                this.pid = pid;
                GUIManager.init();
                // 优先使用 GUI 容器，避免窗口脱离容器导致与任务栏的 z-index 失衡
                const container =
                    initArgs.guiContainer
                    || (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getGUIContainer === 'function'
                        ? ProcessManager.getGUIContainer()
                        : null)
                    || document.getElementById('gui-container')
                    || document.body;
                await this._createWindow(container);
                this._bindEvents();
            } catch (e) {
                KernelLogger.error('PAINT', `初始化失败: ${e.message}`, e);
            }
        },

        /**
         * 创建窗口与布局
         */
        _createWindow: async function(container) {
            const win = document.createElement('div');
            win.className = 'paint-window zos-gui-window';
            win.dataset.pid = this.pid.toString();
            
            // 设置窗口样式（GUIManager 存在时只设置布局，位置和尺寸由 GUIManager 管理）
            if (typeof GUIManager === 'undefined') {
                // 当 GUIManager 不存在时，需要设置位置和尺寸
                win.style.cssText = `
                    position: absolute;
                    width: 1080px;
                    height: 760px;
                    left: 80px;
                    top: 80px;
                `;
            } else {
                // GUIManager 存在时，只设置布局样式，位置和尺寸由 GUIManager 管理
                // 注意：不设置 z-index，由 GUIManager 统一管理
                win.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                `;
                // 确保 z-index 由 GUIManager 管理，移除任何可能的内联 z-index
                win.style.zIndex = '';
            }

            // 工具栏
            const toolbar = document.createElement('div');
            toolbar.className = 'paint-toolbar';

            const tools = [
                { key: 'pencil', label: '铅笔', width: 2 },
                { key: 'brush', label: '画笔', width: 6 },
                { key: 'eraser', label: '橡皮擦', width: 12 }
            ];

            tools.forEach(tool => {
                const btn = document.createElement('button');
                btn.textContent = tool.label;
                btn.dataset.tool = tool.key;
                btn.onclick = () => this._selectTool(tool.key, tool.width);
                this.toolButtons[tool.key] = btn;
                toolbar.appendChild(btn);
            });

            // 颜色
            const colorLabel = document.createElement('span');
            colorLabel.textContent = '颜色';
            toolbar.appendChild(colorLabel);

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = this.currentColor;
            colorInput.oninput = (e) => {
                this.currentColor = e.target.value;
            };
            this.colorInput = colorInput;
            toolbar.appendChild(colorInput);

            // 线宽
            const widthLabel = document.createElement('span');
            widthLabel.textContent = '线宽';
            toolbar.appendChild(widthLabel);

            const widthInput = document.createElement('input');
            widthInput.type = 'range';
            widthInput.min = '1';
            widthInput.max = '24';
            widthInput.value = String(this.currentWidth);
            widthInput.oninput = (e) => {
                this.currentWidth = Number(e.target.value);
            };
            this.widthInput = widthInput;
            toolbar.appendChild(widthInput);

            // 清空
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '清空';
            clearBtn.className = 'danger';
            clearBtn.onclick = () => this._clearCanvas();
            toolbar.appendChild(clearBtn);

            // 导出
            const exportBtn = document.createElement('button');
            exportBtn.textContent = '导出 PNG';
            exportBtn.className = 'primary';
            exportBtn.onclick = () => this._exportImage();
            toolbar.appendChild(exportBtn);

            // 画布容器
            const canvasWrap = document.createElement('div');
            canvasWrap.className = 'paint-canvas-wrap';

            const canvas = document.createElement('canvas');
            canvasWrap.appendChild(canvas);

            // 创建内容容器（提供内边距和样式）
            const content = document.createElement('div');
            content.className = 'paint-content';
            content.appendChild(toolbar);
            content.appendChild(canvasWrap);
            win.appendChild(content);

            // 先添加到容器
            container.appendChild(win);

            this.window = win;
            this.toolbar = toolbar;
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');

            // 创建离屏 canvas（固定尺寸，存储所有绘画内容）
            this.offCanvas = document.createElement('canvas');
            this.offCanvas.width = this.OFF_WIDTH;
            this.offCanvas.height = this.OFF_HEIGHT;
            this.offCtx = this.offCanvas.getContext('2d');
            // 初始化离屏 canvas 为白色背景
            this.offCtx.fillStyle = '#ffffff';
            this.offCtx.fillRect(0, 0, this.OFF_WIDTH, this.OFF_HEIGHT);

            // 注册窗口（在添加到容器之后）
            if (typeof GUIManager !== 'undefined') {
                // 设置初始尺寸（GUIManager 会读取这个尺寸来定位窗口）
                win.style.width = '1080px';
                win.style.height = '760px';
                
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('paint');
                }
                if (!icon) {
                    icon = 'D:/application/paint/paint.svg';
                }
                
                const registered = GUIManager.registerWindow(this.pid, win, {
                    title: '绘图',
                    icon: icon,
                    onClose: () => {
                        // onClose 回调只做清理工作，窗口关闭由 GUIManager._closeWindow 统一处理
                        ProcessManager.killProgram(this.pid);
                    }
                });
                this.windowId = registered ? registered.windowId : null;
                // 注意：registerWindow 会自动聚焦窗口，不需要手动调用 focusWindow
            }

            // 初始同步显示
            this._syncDisplay();
            
            // 监听窗口变化，重新同步显示
            const resizeObserver = new ResizeObserver(() => this._syncDisplay());
            resizeObserver.observe(canvasWrap);
            this._resizeObserver = resizeObserver;

            // 默认选中铅笔
            this._selectTool('pencil', this.currentWidth);
        },


        _bindEvents: function() {
            const onPointerDown = (e) => {
                this.isDrawing = true;
                const { x, y } = this._getPos(e);
                this.lastX = x;
                this.lastY = y;
                this._applyToolStyle();
                // 在离屏 canvas 上绘制
                this.offCtx.beginPath();
                this.offCtx.moveTo(x, y);
            };

            const onPointerMove = (e) => {
                if (!this.isDrawing) return;
                const { x, y } = this._getPos(e);
                // 在离屏 canvas 上绘制
                this.offCtx.lineTo(x, y);
                this.offCtx.stroke();
                this.lastX = x;
                this.lastY = y;
                // 实时同步到显示 canvas
                this._syncDisplay();
            };

            const endDrawing = () => {
                if (!this.isDrawing) return;
                this.isDrawing = false;
                this.offCtx.closePath();
                this._syncDisplay();
            };

            this.canvas.addEventListener('pointerdown', onPointerDown);
            this.canvas.addEventListener('pointermove', onPointerMove);
            this.canvas.addEventListener('pointerup', endDrawing);
            this.canvas.addEventListener('pointerleave', endDrawing);
        },

        _getPos: function(e) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left),
                y: (e.clientY - rect.top)
            };
        },

        _applyToolStyle: function() {
            if (!this.offCtx) return;
            this.offCtx.lineCap = 'round';
            this.offCtx.lineJoin = 'round';

            if (this.currentTool === 'eraser') {
                // 橡皮擦：用白色覆盖（因为背景是白色）
                this.offCtx.globalCompositeOperation = 'source-over';
                this.offCtx.strokeStyle = '#ffffff';
                this.offCtx.lineWidth = Math.max(this.currentWidth, 8);
            } else {
                this.offCtx.globalCompositeOperation = 'source-over';
                this.offCtx.strokeStyle = this.currentColor;
                this.offCtx.lineWidth = this.currentWidth;
            }
        },

        _selectTool: function(tool, width) {
            this.currentTool = tool;
            if (width) {
                this.currentWidth = width;
                if (this.widthInput) {
                    this.widthInput.value = String(width);
                }
            }
            Object.values(this.toolButtons).forEach(btn => {
                if (btn.dataset.tool === tool) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        },

        /**
         * 同步离屏 canvas 到显示 canvas（不缩放，1:1 绘制）
         */
        _syncDisplay: function() {
            if (!this.canvas || !this.ctx || !this.offCanvas) return;
            const rect = this.canvas.getBoundingClientRect();
            const w = Math.max(1, Math.floor(rect.width));
            const h = Math.max(1, Math.floor(rect.height));

            // 确保显示 canvas 尺寸与 CSS 尺寸一致（1:1，不使用 dpr）
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w;
                this.canvas.height = h;
            }

            // 清空显示 canvas
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.clearRect(0, 0, w, h);

            // 从离屏 canvas 绘制到显示 canvas（1:1，不缩放）
            this.ctx.drawImage(this.offCanvas, 0, 0, w, h, 0, 0, w, h);
        },

        _clearCanvas: function() {
            if (!this.offCtx || !this.offCanvas) return;
            // 清空离屏 canvas
            this.offCtx.setTransform(1, 0, 0, 1, 0, 0);
            this.offCtx.globalCompositeOperation = 'source-over';
            this.offCtx.fillStyle = '#ffffff';
            this.offCtx.fillRect(0, 0, this.OFF_WIDTH, this.OFF_HEIGHT);
            // 同步到显示
            this._syncDisplay();
        },

        _exportImage: async function() {
            try {
                // 导出离屏 canvas 中显示区域的内容
                const rect = this.canvas.getBoundingClientRect();
                const w = Math.max(1, Math.floor(rect.width));
                const h = Math.max(1, Math.floor(rect.height));
                
                // 创建临时 canvas 用于导出
                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = w;
                exportCanvas.height = h;
                const exportCtx = exportCanvas.getContext('2d');
                exportCtx.drawImage(this.offCanvas, 0, 0, w, h, 0, 0, w, h);
                
                const dataUrl = exportCanvas.toDataURL('image/png');
                const base64Data = dataUrl.split(',')[1];
                const defaultName = `paint_${Date.now()}.png`;

                // 打开文件管理器选择目录
                await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'folder-selector',
                    onFolderSelected: async (folderItem) => {
                        try {
                            let folderPath = folderItem?.path || folderItem?.absolutePath || folderItem?.fullPath || '';
                            if (!folderPath) {
                                throw new Error('未获取到有效目录');
                            }
                            folderPath = folderPath.replace(/\\/g, '/');
                            if (folderPath.endsWith('/') && !folderPath.match(/^[CD]:\/$/)) {
                                folderPath = folderPath.slice(0, -1);
                            }
                            if (/^[CD]:$/.test(folderPath)) {
                                folderPath += '/';
                            }

                            // 使用 FSDirve 写入（支持 base64）
                            const url = new URL('/system/service/FSDirve.php', window.location.origin);
                            url.searchParams.set('action', 'write_file');
                            url.searchParams.set('path', folderPath);
                            url.searchParams.set('fileName', defaultName);
                            url.searchParams.set('writeMod', 'overwrite');

                            const resp = await fetch(url.toString(), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ content: base64Data, isBase64: true })
                            });

                            if (!resp.ok) {
                                throw new Error(`HTTP ${resp.status}`);
                            }
                            const json = await resp.json();
                            if (!json.status) {
                                throw new Error(json.message || '写入失败');
                            }

                            this._toast(`已导出到: ${folderPath}/${defaultName}`, 'success');
                        } catch (err) {
                            this._toast(`导出失败: ${err.message}`, 'error');
                        }
                    }
                });
            } catch (e) {
                this._toast(`导出失败: ${e.message}`, 'error');
            }
        },

        _toast: function(msg, type = 'info') {
            const el = document.createElement('div');
            el.textContent = msg;
            el.style.cssText = `
                position: absolute;
                right: 12px;
                bottom: 12px;
                padding: 10px 14px;
                border-radius: 10px;
                background: ${type === 'error' ? 'rgba(255,99,99,0.9)' : 'rgba(99,255,181,0.9)'};
                color: #0b0f19;
                font-size: 12px;
                z-index: 9999;
                box-shadow: 0 8px 20px rgba(0,0,0,0.3);
                max-width: 320px;
                word-break: break-all;
                pointer-events: none;
                opacity: 0;
                transform: translateY(10px);
                transition: all .2s ease;
            `;
            this.window.appendChild(el);
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            });
            setTimeout(() => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(10px)';
                setTimeout(() => el.remove(), 200);
            }, 2000);
        },

        /**
         * 退出清理
         */
        __exit__: async function() {
            try {
                if (this.windowId && GUIManager) {
                    await GUIManager.unregisterWindow(this.windowId);
                } else if (this.pid) {
                    await GUIManager.unregisterWindow(this.pid);
                }
            } catch (e) {
                KernelLogger.warn('PAINT', `窗口注销失败: ${e.message}`);
            }

            // 清理 ResizeObserver
            if (this._resizeObserver) {
                this._resizeObserver.disconnect();
                this._resizeObserver = null;
            }

            if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }

            this.canvas = null;
            this.ctx = null;
            this.offCanvas = null;
            this.offCtx = null;
            this.window = null;
            this.toolbar = null;
            this.toolButtons = {};
        },

        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: '绘图',
                type: 'GUI',
                version: '1.0.0',
                description: '简易画板，支持铅笔/画笔/橡皮擦与导出 PNG',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        }
    };

    if (typeof window !== 'undefined') {
        window.PAINT = PAINT;
    }
})(typeof window !== 'undefined' ? window : globalThis);

