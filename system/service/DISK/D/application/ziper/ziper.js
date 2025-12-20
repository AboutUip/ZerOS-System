// ZerOS ZIP 压缩工具
// 提供图形化的 ZIP 压缩和解压缩功能
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const ZIPER = {
        pid: null,
        window: null,
        windowId: null,
        
        // 内存管理引用
        _heap: null,
        _shed: null,
        
        // 当前操作状态
        _isProcessing: false,
        
        // 已选择的源文件/目录列表（用于压缩）
        _selectedSources: [],
        
        // 已选择的 ZIP 文件列表（用于解压）
        _selectedZipFiles: [],
        
        /**
         * 辅助函数：为按钮注册事件（使用 EventManager）
         * @param {HTMLElement} btn 按钮元素
         * @param {Function} onClick 点击回调
         * @param {string} hoverColor 悬停背景色
         * @param {string} normalColor 正常背景色
         * @param {string} btnIdPrefix 按钮ID前缀
         */
        _registerButtonEvents: function(btn, onClick, hoverColor, normalColor, btnIdPrefix) {
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, btn, 'mouseenter', () => {
                    btn.style.background = hoverColor;
                });
                EventManager.registerElementEvent(this.pid, btn, 'mouseleave', () => {
                    btn.style.background = normalColor;
                });
                const btnId = `${btnIdPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                btn.dataset.eventId = btnId;
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (btn === e.target || btn.contains(e.target)) {
                        onClick(e);
                    }
                }, {
                    priority: 100,
                    selector: `[data-event-id="${btnId}"]`
                });
            } else {
                // 降级方案
                btn.addEventListener('mouseenter', () => {
                    btn.style.background = hoverColor;
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.background = normalColor;
                });
                btn.addEventListener('click', onClick);
            }
        },
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 初始化内存管理
            this._initMemory(pid);
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'ziper-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 800px;
                height: 600px;
                min-width: 600px;
                min-height: 400px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('ziper');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: 'Ziper - Zip压缩工具',
                    icon: icon,
                    onClose: () => {
                        // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                        // 窗口关闭由 GUIManager._closeWindow 统一处理
                        // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                        // 这样可以确保程序多实例（不同 PID）互不影响
                    },
                    onMinimize: () => {
                        // 最小化回调
                    },
                    onMaximize: (isMaximized) => {
                        // 最大化回调
                    }
                });
                
                if (windowInfo) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 创建主内容区域
            const content = this._createContent();
            this.window.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 检查是否有命令行参数（ZIP 文件路径）
            if (initArgs && initArgs.args && initArgs.args.length > 0) {
                const zipPath = initArgs.args[0];
                if (zipPath && typeof zipPath === 'string' && zipPath.toLowerCase().endsWith('.zip')) {
                    // 自动填充到"查看 ZIP 内容"输入框并执行查看
                    setTimeout(() => {
                        if (this._listZipInput) {
                            this._listZipInput.value = zipPath;
                            // 自动执行查看操作
                            if (this._listBtn) {
                                this._listBtn.click();
                            }
                        }
                    }, 100); // 延迟一下确保 UI 已完全创建
                }
            }
        },
        
        _initMemory: function(pid) {
            if (typeof MemoryManager !== 'undefined') {
                try {
                    if (typeof MemoryUtils !== 'undefined' && typeof MemoryUtils.getAppMemory === 'function') {
                        const memory = MemoryUtils.getAppMemory(pid);
                        if (memory) {
                            this._heap = memory.heap;
                            this._shed = memory.shed;
                        }
                    } else {
                        const appSpace = MemoryManager.APPLICATION_SOP.get(pid);
                        if (appSpace) {
                            this._heap = appSpace.heaps.get(1) || null;
                            this._shed = appSpace.sheds.get(1) || null;
                        }
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('Ziper', '内存初始化失败', e);
                    }
                }
            }
        },
        
        _createContent: function() {
            const content = document.createElement('div');
            content.className = 'ziper-content';
            content.style.cssText = `
                width: 100%;
                height: 100%;
                padding: 20px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 20px;
                overflow-y: auto;
            `;
            
            // 标题
            const title = document.createElement('div');
            title.textContent = 'ZIP 压缩工具';
            title.style.cssText = `
                font-size: 20px;
                font-weight: bold;
                color: var(--theme-text, #d7e0dd);
                margin-bottom: 10px;
            `;
            content.appendChild(title);
            
            // 压缩功能区域
            const compressSection = this._createCompressSection();
            content.appendChild(compressSection);
            
            // 分隔线
            const divider = document.createElement('div');
            divider.style.cssText = `
                width: 100%;
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 10px 0;
            `;
            content.appendChild(divider);
            
            // 解压缩功能区域
            const extractSection = this._createExtractSection();
            content.appendChild(extractSection);
            
            // 分隔线
            const divider2 = document.createElement('div');
            divider2.style.cssText = `
                width: 100%;
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 10px 0;
            `;
            content.appendChild(divider2);
            
            // 查看 ZIP 内容功能区域
            const listSection = this._createListSection();
            content.appendChild(listSection);
            
            return content;
        },
        
        _createCompressSection: function() {
            const section = document.createElement('div');
            section.className = 'ziper-section';
            section.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 15px;
            `;
            
            // 标题
            const title = document.createElement('div');
            title.textContent = '压缩文件/目录';
            title.style.cssText = `
                font-size: 16px;
                font-weight: bold;
                color: var(--theme-text, #d7e0dd);
            `;
            section.appendChild(title);
            
            // 源路径选择（支持多选）
            const sourceGroup = document.createElement('div');
            sourceGroup.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            const sourceLabel = document.createElement('label');
            sourceLabel.textContent = '源文件/目录 (可多选):';
            sourceLabel.style.cssText = `
                font-size: 14px;
                color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
            `;
            sourceGroup.appendChild(sourceLabel);
            
            // 已选项目列表容器
            const sourceListContainer = document.createElement('div');
            sourceListContainer.className = 'ziper-source-list';
            sourceListContainer.style.cssText = `
                min-height: 40px;
                max-height: 150px;
                overflow-y: auto;
                padding: 8px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            `;
            
            // 空状态提示
            const emptyHint = document.createElement('div');
            emptyHint.className = 'ziper-empty-hint';
            emptyHint.textContent = '未选择任何文件或目录';
            emptyHint.style.cssText = `
                padding: 8px;
                text-align: center;
                color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
                font-size: 13px;
            `;
            sourceListContainer.appendChild(emptyHint);
            
            const sourceInputGroup = document.createElement('div');
            sourceInputGroup.style.cssText = `
                display: flex;
                gap: 10px;
            `;
            
            const sourceBtn = document.createElement('button');
            sourceBtn.textContent = '添加文件/目录...';
            sourceBtn.className = 'ziper-button';
            sourceBtn.style.cssText = `
                padding: 10px 20px;
                background: rgba(108, 142, 255, 0.3);
                border: 1px solid rgba(108, 142, 255, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            // 使用辅助函数注册事件
            this._registerButtonEvents(
                sourceBtn,
                () => this._addSourceForCompress(sourceListContainer, emptyHint),
                'rgba(108, 142, 255, 0.5)',
                'rgba(108, 142, 255, 0.3)',
                'ziper-source-btn'
            );
            sourceInputGroup.appendChild(sourceBtn);
            
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '清空';
            clearBtn.className = 'ziper-button';
            clearBtn.style.cssText = `
                padding: 10px 20px;
                background: rgba(239, 68, 68, 0.3);
                border: 1px solid rgba(239, 68, 68, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            // 使用辅助函数注册事件
            this._registerButtonEvents(
                clearBtn,
                () => {
                    this._selectedSources = [];
                    this._updateSourceList(sourceListContainer, emptyHint);
                },
                'rgba(239, 68, 68, 0.5)',
                'rgba(239, 68, 68, 0.3)',
                'ziper-clear-btn'
            );
            sourceInputGroup.appendChild(clearBtn);
            
            sourceGroup.appendChild(sourceListContainer);
            sourceGroup.appendChild(sourceInputGroup);
            section.appendChild(sourceGroup);
            
            // 保存引用
            this._compressSourceListContainer = sourceListContainer;
            this._compressEmptyHint = emptyHint;
            
            // 目标路径选择
            const targetGroup = document.createElement('div');
            targetGroup.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            const targetLabel = document.createElement('label');
            targetLabel.textContent = '目标 ZIP 文件:';
            targetLabel.style.cssText = `
                font-size: 14px;
                color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
            `;
            targetGroup.appendChild(targetLabel);
            
            const targetInputGroup = document.createElement('div');
            targetInputGroup.style.cssText = `
                display: flex;
                gap: 10px;
            `;
            
            const targetInput = document.createElement('input');
            targetInput.type = 'text';
            targetInput.placeholder = '选择保存位置和文件名...';
            targetInput.readOnly = true;
            targetInput.className = 'ziper-input';
            targetInput.style.cssText = `
                flex: 1;
                padding: 10px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
            `;
            targetInputGroup.appendChild(targetInput);
            
            const targetBtn = document.createElement('button');
            targetBtn.textContent = '浏览...';
            targetBtn.className = 'ziper-button';
            targetBtn.style.cssText = `
                padding: 10px 20px;
                background: rgba(108, 142, 255, 0.3);
                border: 1px solid rgba(108, 142, 255, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            // 使用辅助函数注册事件
            this._registerButtonEvents(
                targetBtn,
                () => this._selectTargetForCompress(targetInput),
                'rgba(108, 142, 255, 0.5)',
                'rgba(108, 142, 255, 0.3)',
                'ziper-target-btn'
            );
            targetInputGroup.appendChild(targetBtn);
            
            targetGroup.appendChild(targetInputGroup);
            section.appendChild(targetGroup);
            
            // 压缩按钮
            const compressBtn = document.createElement('button');
            compressBtn.textContent = '开始压缩';
            compressBtn.className = 'ziper-button-primary';
            compressBtn.style.cssText = `
                padding: 12px 24px;
                background: rgba(245, 158, 11, 0.3);
                border: 1px solid rgba(245, 158, 11, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                align-self: flex-start;
            `;
            // 使用 EventManager 注册事件（特殊处理：需要检查处理状态）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, compressBtn, 'mouseenter', () => {
                    if (!this._isProcessing) {
                        compressBtn.style.background = 'rgba(245, 158, 11, 0.5)';
                    }
                });
                EventManager.registerElementEvent(this.pid, compressBtn, 'mouseleave', () => {
                    if (!this._isProcessing) {
                        compressBtn.style.background = 'rgba(245, 158, 11, 0.3)';
                    }
                });
                const compressBtnId = `ziper-compress-btn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                compressBtn.dataset.eventId = compressBtnId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    this._compress(this._selectedSources, targetInput.value, compressBtn);
                }, {
                    priority: 100,
                    selector: `[data-event-id="${compressBtnId}"]`
                });
            } else {
                // 降级方案
                compressBtn.addEventListener('mouseenter', () => {
                    if (!this._isProcessing) {
                        compressBtn.style.background = 'rgba(245, 158, 11, 0.5)';
                    }
                });
                compressBtn.addEventListener('mouseleave', () => {
                    if (!this._isProcessing) {
                        compressBtn.style.background = 'rgba(245, 158, 11, 0.3)';
                    }
                });
                compressBtn.addEventListener('click', () => {
                    this._compress(this._selectedSources, targetInput.value, compressBtn);
                });
            }
            section.appendChild(compressBtn);
            
            // 保存引用
            this._compressTargetInput = targetInput;
            this._compressBtn = compressBtn;
            
            return section;
        },
        
        _createExtractSection: function() {
            const section = document.createElement('div');
            section.className = 'ziper-section';
            section.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 15px;
            `;
            
            // 标题
            const title = document.createElement('div');
            title.textContent = '解压缩文件';
            title.style.cssText = `
                font-size: 16px;
                font-weight: bold;
                color: var(--theme-text, #d7e0dd);
            `;
            section.appendChild(title);
            
            // ZIP 文件选择（支持多选）
            const zipGroup = document.createElement('div');
            zipGroup.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            const zipLabel = document.createElement('label');
            zipLabel.textContent = 'ZIP 文件 (可多选):';
            zipLabel.style.cssText = `
                font-size: 14px;
                color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
            `;
            zipGroup.appendChild(zipLabel);
            
            // 已选 ZIP 文件列表容器
            const zipListContainer = document.createElement('div');
            zipListContainer.className = 'ziper-zip-list';
            zipListContainer.style.cssText = `
                min-height: 40px;
                max-height: 150px;
                overflow-y: auto;
                padding: 8px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            `;
            
            // 空状态提示
            const zipEmptyHint = document.createElement('div');
            zipEmptyHint.className = 'ziper-empty-hint';
            zipEmptyHint.textContent = '未选择任何 ZIP 文件';
            zipEmptyHint.style.cssText = `
                padding: 8px;
                text-align: center;
                color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
                font-size: 13px;
            `;
            zipListContainer.appendChild(zipEmptyHint);
            
            const zipInputGroup = document.createElement('div');
            zipInputGroup.style.cssText = `
                display: flex;
                gap: 10px;
            `;
            
            const zipBtn = document.createElement('button');
            zipBtn.textContent = '添加 ZIP 文件...';
            zipBtn.className = 'ziper-button';
            zipBtn.style.cssText = `
                padding: 10px 20px;
                background: rgba(108, 142, 255, 0.3);
                border: 1px solid rgba(108, 142, 255, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            // 使用辅助函数注册事件
            this._registerButtonEvents(
                zipBtn,
                () => this._addZipFileForExtract(zipListContainer, zipEmptyHint),
                'rgba(108, 142, 255, 0.5)',
                'rgba(108, 142, 255, 0.3)',
                'ziper-zip-btn'
            );
            zipInputGroup.appendChild(zipBtn);
            
            const clearZipBtn = document.createElement('button');
            clearZipBtn.textContent = '清空';
            clearZipBtn.className = 'ziper-button';
            clearZipBtn.style.cssText = `
                padding: 10px 20px;
                background: rgba(239, 68, 68, 0.3);
                border: 1px solid rgba(239, 68, 68, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            // 使用辅助函数注册事件
            this._registerButtonEvents(
                clearZipBtn,
                () => {
                    this._selectedZipFiles = [];
                    this._updateZipFileList(zipListContainer, zipEmptyHint);
                },
                'rgba(239, 68, 68, 0.5)',
                'rgba(239, 68, 68, 0.3)',
                'ziper-clear-zip-btn'
            );
            zipInputGroup.appendChild(clearZipBtn);
            
            zipGroup.appendChild(zipListContainer);
            zipGroup.appendChild(zipInputGroup);
            section.appendChild(zipGroup);
            
            // 保存引用
            this._extractZipListContainer = zipListContainer;
            this._extractZipEmptyHint = zipEmptyHint;
            
            // 目标目录选择
            const targetGroup = document.createElement('div');
            targetGroup.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            const targetLabel = document.createElement('label');
            targetLabel.textContent = '解压到目录:';
            targetLabel.style.cssText = `
                font-size: 14px;
                color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
            `;
            targetGroup.appendChild(targetLabel);
            
            const targetInputGroup = document.createElement('div');
            targetInputGroup.style.cssText = `
                display: flex;
                gap: 10px;
            `;
            
            const targetInput = document.createElement('input');
            targetInput.type = 'text';
            targetInput.placeholder = '选择解压目标目录...';
            targetInput.readOnly = true;
            targetInput.className = 'ziper-input';
            targetInput.style.cssText = `
                flex: 1;
                padding: 10px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
            `;
            targetInputGroup.appendChild(targetInput);
            
            const targetBtn = document.createElement('button');
            targetBtn.textContent = '浏览...';
            targetBtn.className = 'ziper-button';
            targetBtn.style.cssText = `
                padding: 10px 20px;
                background: rgba(108, 142, 255, 0.3);
                border: 1px solid rgba(108, 142, 255, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            // 使用辅助函数注册事件
            this._registerButtonEvents(
                targetBtn,
                () => this._selectTargetForExtract(targetInput),
                'rgba(108, 142, 255, 0.5)',
                'rgba(108, 142, 255, 0.3)',
                'ziper-extract-target-btn'
            );
            targetInputGroup.appendChild(targetBtn);
            
            targetGroup.appendChild(targetInputGroup);
            section.appendChild(targetGroup);
            
            // 解压按钮
            const extractBtn = document.createElement('button');
            extractBtn.textContent = '开始解压';
            extractBtn.className = 'ziper-button-primary';
            extractBtn.style.cssText = `
                padding: 12px 24px;
                background: rgba(34, 197, 94, 0.3);
                border: 1px solid rgba(34, 197, 94, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                align-self: flex-start;
            `;
            // 使用 EventManager 注册事件（特殊处理：需要检查处理状态）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, extractBtn, 'mouseenter', () => {
                    if (!this._isProcessing) {
                        extractBtn.style.background = 'rgba(34, 197, 94, 0.5)';
                    }
                });
                EventManager.registerElementEvent(this.pid, extractBtn, 'mouseleave', () => {
                    if (!this._isProcessing) {
                        extractBtn.style.background = 'rgba(34, 197, 94, 0.3)';
                    }
                });
                const extractBtnId = `ziper-extract-btn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                extractBtn.dataset.eventId = extractBtnId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    this._extract(this._selectedZipFiles, targetInput.value, extractBtn);
                }, {
                    priority: 100,
                    selector: `[data-event-id="${extractBtnId}"]`
                });
            } else {
                // 降级方案
                extractBtn.addEventListener('mouseenter', () => {
                    if (!this._isProcessing) {
                        extractBtn.style.background = 'rgba(34, 197, 94, 0.5)';
                    }
                });
                extractBtn.addEventListener('mouseleave', () => {
                    if (!this._isProcessing) {
                        extractBtn.style.background = 'rgba(34, 197, 94, 0.3)';
                    }
                });
                extractBtn.addEventListener('click', () => {
                    this._extract(this._selectedZipFiles, targetInput.value, extractBtn);
                });
            }
            section.appendChild(extractBtn);
            
            // 保存引用
            this._extractTargetInput = targetInput;
            this._extractBtn = extractBtn;
            
            return section;
        },
        
        _createListSection: function() {
            const section = document.createElement('div');
            section.className = 'ziper-section';
            section.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 15px;
            `;
            
            // 标题
            const title = document.createElement('div');
            title.textContent = '查看 ZIP 内容';
            title.style.cssText = `
                font-size: 16px;
                font-weight: bold;
                color: var(--theme-text, #d7e0dd);
            `;
            section.appendChild(title);
            
            // ZIP 文件选择
            const zipGroup = document.createElement('div');
            zipGroup.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            const zipLabel = document.createElement('label');
            zipLabel.textContent = 'ZIP 文件:';
            zipLabel.style.cssText = `
                font-size: 14px;
                color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
            `;
            zipGroup.appendChild(zipLabel);
            
            const zipInputGroup = document.createElement('div');
            zipInputGroup.style.cssText = `
                display: flex;
                gap: 10px;
            `;
            
            const zipInput = document.createElement('input');
            zipInput.type = 'text';
            zipInput.placeholder = '选择要查看的 ZIP 文件...';
            zipInput.readOnly = true;
            zipInput.className = 'ziper-input';
            zipInput.style.cssText = `
                flex: 1;
                padding: 10px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
            `;
            zipInputGroup.appendChild(zipInput);
            
            const zipBtn = document.createElement('button');
            zipBtn.textContent = '浏览...';
            zipBtn.className = 'ziper-button';
            zipBtn.style.cssText = `
                padding: 10px 20px;
                background: rgba(108, 142, 255, 0.3);
                border: 1px solid rgba(108, 142, 255, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            // 使用辅助函数注册事件
            this._registerButtonEvents(
                zipBtn,
                () => this._selectZipFile(zipInput),
                'rgba(108, 142, 255, 0.5)',
                'rgba(108, 142, 255, 0.3)',
                'ziper-list-zip-btn'
            );
            zipInputGroup.appendChild(zipBtn);
            
            zipGroup.appendChild(zipInputGroup);
            section.appendChild(zipGroup);
            
            // 查看按钮
            const listBtn = document.createElement('button');
            listBtn.textContent = '查看内容';
            listBtn.className = 'ziper-button-primary';
            listBtn.style.cssText = `
                padding: 12px 24px;
                background: rgba(139, 92, 246, 0.3);
                border: 1px solid rgba(139, 92, 246, 0.5);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                align-self: flex-start;
            `;
            // 使用 EventManager 注册事件（特殊处理：需要检查处理状态）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, listBtn, 'mouseenter', () => {
                    if (!this._isProcessing) {
                        listBtn.style.background = 'rgba(139, 92, 246, 0.5)';
                    }
                });
                EventManager.registerElementEvent(this.pid, listBtn, 'mouseleave', () => {
                    if (!this._isProcessing) {
                        listBtn.style.background = 'rgba(139, 92, 246, 0.3)';
                    }
                });
                const listBtnId = `ziper-list-btn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                listBtn.dataset.eventId = listBtnId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    this._listZip(zipInput.value, listBtn);
                }, {
                    priority: 100,
                    selector: `[data-event-id="${listBtnId}"]`
                });
            } else {
                // 降级方案
                listBtn.addEventListener('mouseenter', () => {
                    if (!this._isProcessing) {
                        listBtn.style.background = 'rgba(139, 92, 246, 0.5)';
                    }
                });
                listBtn.addEventListener('mouseleave', () => {
                    if (!this._isProcessing) {
                        listBtn.style.background = 'rgba(139, 92, 246, 0.3)';
                    }
                });
                listBtn.addEventListener('click', () => {
                    this._listZip(zipInput.value, listBtn);
                });
            }
            section.appendChild(listBtn);
            
            // 保存引用
            this._listZipInput = zipInput;
            this._listBtn = listBtn;
            
            return section;
        },
        
        /**
         * 添加压缩源文件/目录（支持多选）
         */
        _addSourceForCompress: async function(listContainer, emptyHint) {
            if (typeof ProcessManager === 'undefined') {
                this._showMessage('ProcessManager 不可用', 'error');
                return;
            }
            
            try {
                // 启动文件管理器，支持多选文件或目录
                await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'file-selector',
                    multiSelect: true, // 启用多选模式
                    onMultipleSelected: async (items) => {
                        if (items && Array.isArray(items)) {
                            // 添加所有选中的项目
                            items.forEach(item => {
                                if (item && item.path && !this._selectedSources.includes(item.path)) {
                                    this._selectedSources.push(item.path);
                                }
                            });
                            this._updateSourceList(listContainer, emptyHint);
                        }
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Ziper', '选择源文件失败', error);
                }
                this._showMessage(`选择源文件失败: ${error.message}`, 'error');
            }
        },
        
        /**
         * 更新源文件/目录列表显示
         */
        _updateSourceList: function(listContainer, emptyHint) {
            // 清空列表（保留空状态提示）
            const items = listContainer.querySelectorAll('.ziper-source-item');
            items.forEach(item => item.remove());
            
            if (this._selectedSources.length === 0) {
                // 显示空状态
                if (!listContainer.contains(emptyHint)) {
                    listContainer.appendChild(emptyHint);
                }
                emptyHint.style.display = 'block';
            } else {
                // 隐藏空状态
                emptyHint.style.display = 'none';
                
                // 显示已选项目
                this._selectedSources.forEach((path, index) => {
                    const item = document.createElement('div');
                    item.className = 'ziper-source-item';
                    item.style.cssText = `
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 8px 12px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 4px;
                        font-size: 13px;
                        color: var(--theme-text, #d7e0dd);
                    `;
                    
                    const pathText = document.createElement('span');
                    pathText.textContent = path;
                    pathText.style.cssText = `
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        margin-right: 8px;
                    `;
                    item.appendChild(pathText);
                    
                    const removeBtn = document.createElement('button');
                    removeBtn.textContent = '×';
                    removeBtn.style.cssText = `
                        width: 24px;
                        height: 24px;
                        padding: 0;
                        background: rgba(239, 68, 68, 0.3);
                        border: 1px solid rgba(239, 68, 68, 0.5);
                        border-radius: 4px;
                        color: var(--theme-text, #d7e0dd);
                        font-size: 18px;
                        cursor: pointer;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    `;
                    // 使用辅助函数注册事件
                    this._registerButtonEvents(
                        removeBtn,
                        () => {
                            this._selectedSources.splice(index, 1);
                            this._updateSourceList(listContainer, emptyHint);
                        },
                        'rgba(239, 68, 68, 0.5)',
                        'rgba(239, 68, 68, 0.3)',
                        `ziper-remove-source-btn-${index}`
                    );
                    item.appendChild(removeBtn);
                    
                    listContainer.appendChild(item);
                });
            }
        },
        
        /**
         * 选择压缩目标 ZIP 文件
         */
        _selectTargetForCompress: async function(inputElement) {
            if (typeof ProcessManager === 'undefined') {
                this._showMessage('ProcessManager 不可用', 'error');
                return;
            }
            
            try {
                // 启动文件管理器，选择保存位置
                await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'folder-selector',
                    onFolderSelected: async (folderItem) => {
                        if (folderItem && folderItem.path) {
                            // 默认文件名
                            const defaultName = 'archive.zip';
                            inputElement.value = folderItem.path + '/' + defaultName;
                        }
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Ziper', '选择目标位置失败', error);
                }
                this._showMessage(`选择目标位置失败: ${error.message}`, 'error');
            }
        },
        
        /**
         * 添加 ZIP 文件（支持多选）
         */
        _addZipFileForExtract: async function(listContainer, emptyHint) {
            if (typeof ProcessManager === 'undefined') {
                this._showMessage('ProcessManager 不可用', 'error');
                return;
            }
            
            try {
                // 启动文件管理器，支持多选 ZIP 文件
                await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'file-selector',
                    multiSelect: true, // 启用多选模式
                    onMultipleSelected: async (items) => {
                        if (items && Array.isArray(items)) {
                            // 添加所有选中的 ZIP 文件
                            items.forEach(item => {
                                if (item && item.path) {
                                    // 检查是否为 ZIP 文件
                                    if (item.path.toLowerCase().endsWith('.zip')) {
                                        // 检查是否已存在
                                        if (!this._selectedZipFiles.includes(item.path)) {
                                            this._selectedZipFiles.push(item.path);
                                        }
                                    }
                                }
                            });
                            this._updateZipFileList(listContainer, emptyHint);
                        }
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Ziper', '选择 ZIP 文件失败', error);
                }
                this._showMessage(`选择 ZIP 文件失败: ${error.message}`, 'error');
            }
        },
        
        /**
         * 更新 ZIP 文件列表显示
         */
        _updateZipFileList: function(listContainer, emptyHint) {
            // 清空列表（保留空状态提示）
            const items = listContainer.querySelectorAll('.ziper-zip-item');
            items.forEach(item => item.remove());
            
            if (this._selectedZipFiles.length === 0) {
                // 显示空状态
                if (!listContainer.contains(emptyHint)) {
                    listContainer.appendChild(emptyHint);
                }
                emptyHint.style.display = 'block';
            } else {
                // 隐藏空状态
                emptyHint.style.display = 'none';
                
                // 显示已选项目
                this._selectedZipFiles.forEach((path, index) => {
                    const item = document.createElement('div');
                    item.className = 'ziper-zip-item';
                    item.style.cssText = `
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 8px 12px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 4px;
                        font-size: 13px;
                        color: var(--theme-text, #d7e0dd);
                    `;
                    
                    const pathText = document.createElement('span');
                    pathText.textContent = path;
                    pathText.style.cssText = `
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        margin-right: 8px;
                    `;
                    item.appendChild(pathText);
                    
                    const removeBtn = document.createElement('button');
                    removeBtn.textContent = '×';
                    removeBtn.style.cssText = `
                        width: 24px;
                        height: 24px;
                        padding: 0;
                        background: rgba(239, 68, 68, 0.3);
                        border: 1px solid rgba(239, 68, 68, 0.5);
                        border-radius: 4px;
                        color: var(--theme-text, #d7e0dd);
                        font-size: 18px;
                        cursor: pointer;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    `;
                    // 使用辅助函数注册事件
                    this._registerButtonEvents(
                        removeBtn,
                        () => {
                            this._selectedZipFiles.splice(index, 1);
                            this._updateZipFileList(listContainer, emptyHint);
                        },
                        'rgba(239, 68, 68, 0.5)',
                        'rgba(239, 68, 68, 0.3)',
                        `ziper-remove-zip-btn-${index}`
                    );
                    item.appendChild(removeBtn);
                    
                    listContainer.appendChild(item);
                });
            }
        },
        
        /**
         * 选择 ZIP 文件（用于查看内容，保持单选）
         */
        _selectZipFile: async function(inputElement) {
            if (typeof ProcessManager === 'undefined') {
                this._showMessage('ProcessManager 不可用', 'error');
                return;
            }
            
            try {
                // 启动文件管理器，选择 ZIP 文件
                await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'file-selector',
                    onFileSelected: async (fileItem) => {
                        if (fileItem && fileItem.path) {
                            // 检查是否为 ZIP 文件
                            if (fileItem.path.toLowerCase().endsWith('.zip')) {
                                inputElement.value = fileItem.path;
                            } else {
                                this._showMessage('请选择 ZIP 文件', 'error');
                            }
                        }
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Ziper', '选择 ZIP 文件失败', error);
                }
                this._showMessage(`选择 ZIP 文件失败: ${error.message}`, 'error');
            }
        },
        
        /**
         * 选择解压目标目录
         */
        _selectTargetForExtract: async function(inputElement) {
            if (typeof ProcessManager === 'undefined') {
                this._showMessage('ProcessManager 不可用', 'error');
                return;
            }
            
            try {
                // 启动文件管理器，选择解压目标目录
                await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'folder-selector',
                    onFolderSelected: async (folderItem) => {
                        if (folderItem && folderItem.path) {
                            inputElement.value = folderItem.path;
                        }
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Ziper', '选择解压目标目录失败', error);
                }
                this._showMessage(`选择解压目标目录失败: ${error.message}`, 'error');
            }
        },
        
        /**
         * 压缩文件/目录（支持多路径）
         */
        _compress: async function(sourcePaths, targetPath, buttonElement) {
            if (this._isProcessing) {
                return;
            }
            
            // 支持单个路径字符串或路径数组
            const paths = Array.isArray(sourcePaths) ? sourcePaths : (sourcePaths ? [sourcePaths] : []);
            
            if (paths.length === 0 || !targetPath) {
                this._showMessage('请选择源文件/目录和目标位置', 'error');
                return;
            }
            
            // 确保目标路径以 .zip 结尾
            if (!targetPath.toLowerCase().endsWith('.zip')) {
                targetPath = targetPath + '.zip';
                this._compressTargetInput.value = targetPath;
            }
            
            this._isProcessing = true;
            buttonElement.textContent = '压缩中...';
            buttonElement.disabled = true;
            buttonElement.style.opacity = '0.6';
            buttonElement.style.cursor = 'not-allowed';
            
            try {
                const url = new URL('/system/service/CompressionDirve.php', window.location.origin);
                url.searchParams.set('action', 'compress_zip');
                url.searchParams.set('targetPath', targetPath);
                
                let response;
                if (paths.length === 1) {
                    // 单个路径使用 GET 方式（兼容性）
                    url.searchParams.set('sourcePath', paths[0]);
                    response = await fetch(url.toString());
                } else {
                    // 多个路径使用 POST 方式传递
                    response = await fetch(url.toString(), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            sourcePaths: paths
                        })
                    });
                }
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    this._showMessage(`压缩成功！文件大小: ${this._formatFileSize(result.data.size)}`, 'success');
                    // 清空选择
                    this._selectedSources = [];
                    this._updateSourceList(this._compressSourceListContainer, this._compressEmptyHint);
                    this._compressTargetInput.value = '';
                } else {
                    throw new Error(result.message || '压缩失败');
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Ziper', '压缩失败', error);
                }
                this._showMessage(`压缩失败: ${error.message}`, 'error');
            } finally {
                this._isProcessing = false;
                buttonElement.textContent = '开始压缩';
                buttonElement.disabled = false;
                buttonElement.style.opacity = '1';
                buttonElement.style.cursor = 'pointer';
            }
        },
        
        /**
         * 解压缩文件（支持多 ZIP 文件）
         */
        _extract: async function(zipPaths, targetPath, buttonElement) {
            if (this._isProcessing) {
                return;
            }
            
            // 支持单个路径字符串或路径数组
            const paths = Array.isArray(zipPaths) ? zipPaths : (zipPaths ? [zipPaths] : []);
            
            if (paths.length === 0 || !targetPath) {
                this._showMessage('请选择 ZIP 文件和解压目标目录', 'error');
                return;
            }
            
            this._isProcessing = true;
            buttonElement.textContent = '解压中...';
            buttonElement.disabled = true;
            buttonElement.style.opacity = '0.6';
            buttonElement.style.cursor = 'not-allowed';
            
            try {
                let successCount = 0;
                let failCount = 0;
                const errors = [];
                
                // 依次解压每个 ZIP 文件
                for (const zipPath of paths) {
                    try {
                        const url = new URL('/system/service/CompressionDirve.php', window.location.origin);
                        url.searchParams.set('action', 'extract_zip');
                        url.searchParams.set('sourcePath', zipPath);
                        url.searchParams.set('targetPath', targetPath);
                        
                        const response = await fetch(url.toString());
                        const result = await response.json();
                        
                        if (result.status === 'success') {
                            successCount++;
                        } else {
                            failCount++;
                            const fileName = zipPath.split('/').pop() || zipPath.split('\\').pop() || zipPath;
                            errors.push(`${fileName}: ${result.message || '解压失败'}`);
                        }
                    } catch (error) {
                        failCount++;
                        const fileName = zipPath.split('/').pop() || zipPath.split('\\').pop() || zipPath;
                        errors.push(`${fileName}: ${error.message}`);
                    }
                }
                
                // 显示结果
                if (successCount === paths.length) {
                    this._showMessage(`解压成功！共解压 ${paths.length} 个 ZIP 文件`, 'success');
                    // 清空选择
                    this._selectedZipFiles = [];
                    this._updateZipFileList(this._extractZipListContainer, this._extractZipEmptyHint);
                    this._extractTargetInput.value = '';
                } else if (successCount > 0) {
                    this._showMessage(`部分成功：${successCount} 个成功，${failCount} 个失败。\n${errors.join('\n')}`, 'error');
                } else {
                    throw new Error(`所有 ZIP 文件解压失败：\n${errors.join('\n')}`);
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Ziper', '解压失败', error);
                }
                this._showMessage(`解压失败: ${error.message}`, 'error');
            } finally {
                this._isProcessing = false;
                buttonElement.textContent = '开始解压';
                buttonElement.disabled = false;
                buttonElement.style.opacity = '1';
                buttonElement.style.cursor = 'pointer';
            }
        },
        
        /**
         * 查看 ZIP 文件内容
         */
        _listZip: async function(zipPath, buttonElement) {
            if (this._isProcessing) {
                return;
            }
            
            if (!zipPath) {
                this._showMessage('请选择 ZIP 文件', 'error');
                return;
            }
            
            this._isProcessing = true;
            buttonElement.textContent = '加载中...';
            buttonElement.disabled = true;
            buttonElement.style.opacity = '0.6';
            buttonElement.style.cursor = 'not-allowed';
            
            try {
                const url = new URL('/system/service/CompressionDirve.php', window.location.origin);
                url.searchParams.set('action', 'list_zip');
                url.searchParams.set('sourcePath', zipPath);
                
                const response = await fetch(url.toString());
                
                // 检查响应类型
                const contentType = response.headers.get('content-type') || '';
                let result;
                
                if (contentType.includes('application/json')) {
                    // 正常 JSON 响应
                    result = await response.json();
                } else {
                    // 可能是错误页面（HTML）
                    const text = await response.text();
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('Ziper', '服务端返回非 JSON 响应', { text: text.substring(0, 200) });
                    }
                    
                    // 尝试解析为 JSON（可能错误信息是 JSON 格式）
                    try {
                        result = JSON.parse(text);
                    } catch (e) {
                        // 如果无法解析，说明是 HTML 错误页面
                        throw new Error(`服务端错误 (HTTP ${response.status}): 请检查 ZIP 文件路径是否正确`);
                    }
                }
                
                // 检查 HTTP 状态码
                if (!response.ok) {
                    throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
                }
                
                if (result.status === 'success') {
                    this._showZipContents(result.data.files, result.data.fileCount);
                } else {
                    throw new Error(result.message || '查看 ZIP 内容失败');
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Ziper', '查看 ZIP 内容失败', error);
                }
                // 如果是 JSON 解析错误，提供更友好的提示
                if (error.message && error.message.includes('JSON')) {
                    this._showMessage('查看 ZIP 内容失败: 服务端返回了无效的响应，请检查文件路径是否正确', 'error');
                } else {
                    this._showMessage(`查看 ZIP 内容失败: ${error.message}`, 'error');
                }
            } finally {
                this._isProcessing = false;
                buttonElement.textContent = '查看内容';
                buttonElement.disabled = false;
                buttonElement.style.opacity = '1';
                buttonElement.style.cursor = 'pointer';
            }
        },
        
        /**
         * 显示 ZIP 文件内容
         */
        _showZipContents: function(files, fileCount) {
            // 创建自定义对话框显示 ZIP 内容
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 650px;
                max-width: 90vw;
                max-height: 80vh;
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.98));
                backdrop-filter: blur(30px) saturate(180%);
                -webkit-backdrop-filter: blur(30px) saturate(180%);
                border: 1px solid rgba(139, 92, 246, 0.3);
                border-radius: 12px;
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
                z-index: 20000;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 标题栏
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            
            const title = document.createElement('div');
            title.textContent = `ZIP 文件内容 (共 ${fileCount} 项)`;
            title.style.cssText = `
                font-size: 18px;
                font-weight: bold;
                color: var(--theme-text, #d7e0dd);
            `;
            header.appendChild(title);
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.style.cssText = `
                width: 32px;
                height: 32px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                color: var(--theme-text, #d7e0dd);
                font-size: 20px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'rgba(255, 59, 48, 0.3)';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            closeBtn.addEventListener('click', () => {
                if (dialog.parentElement) {
                    document.body.removeChild(dialog);
                }
            });
            header.appendChild(closeBtn);
            
            dialog.appendChild(header);
            
            // 内容区域
            const content = document.createElement('div');
            content.style.cssText = `
                padding: 20px;
                overflow-y: auto;
                flex: 1;
            `;
            
            const list = document.createElement('div');
            list.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            files.forEach((file) => {
                const item = document.createElement('div');
                item.style.cssText = `
                    padding: 10px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    font-size: 13px;
                    color: var(--theme-text, #d7e0dd);
                `;
                
                const name = document.createElement('div');
                name.textContent = file.isDir ? `📁 ${file.name}` : `📄 ${file.name}`;
                name.style.cssText = `margin-bottom: 4px; font-weight: 500;`;
                item.appendChild(name);
                
                if (!file.isDir) {
                    const info = document.createElement('div');
                    info.textContent = `大小: ${this._formatFileSize(file.size)} | 压缩后: ${this._formatFileSize(file.compressedSize)}`;
                    info.style.cssText = `
                        font-size: 11px;
                        color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
                    `;
                    item.appendChild(info);
                }
                
                list.appendChild(item);
            });
            
            content.appendChild(list);
            dialog.appendChild(content);
            
            // 添加到页面
            document.body.appendChild(dialog);
            
            // 点击外部关闭
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog && dialog.parentElement) {
                    document.body.removeChild(dialog);
                }
            });
        },
        
        /**
         * 格式化文件大小
         */
        _formatFileSize: function(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        },
        
        /**
         * 显示消息
         */
        _showMessage: function(message, type) {
            // 使用通知提示（不打断用户）
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                try {
                    NotificationManager.createNotification(this.pid, {
                        type: 'snapshot',
                        title: type === 'error' ? '错误' : '提示',
                        content: message,
                        duration: type === 'error' ? 4000 : 3000
                    }).catch(e => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('Ziper', `创建通知失败: ${e.message}`);
                        }
                    });
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('Ziper', `创建通知失败: ${e.message}`);
                    }
                }
            }
        },
        
        /**
         * 退出程序
         */
        __exit__: async function() {
            // 清理窗口
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                GUIManager.unregisterWindow(this.windowId);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
            
            // 清理内存引用
            this._heap = null;
            this._shed = null;
            this.window = null;
            this.windowId = null;
        },
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'ziper',
                type: 'GUI',
                version: '1.0.0',
                description: 'Zip压缩工具',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.ZIPER = ZIPER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.ZIPER = ZIPER;
    }
    
    // 注册到 POOL（如果可用）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SOP")) {
                POOL.__INIT__("APPLICATION_SOP");
            }
            POOL.__ADD__("APPLICATION_SOP", "ZIPER", ZIPER);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('Ziper', '注册到 POOL 失败', e);
            }
        }
    }
    
})(typeof window !== 'undefined' ? window : globalThis);
     