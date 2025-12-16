// ZerOS 运行程序
// 提供类似Windows运行对话框的功能，快速启动程序
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const RUN = {
        pid: null,
        window: null,
        inputElement: null,
        suggestionsList: null,
        selectedIndex: -1,
        allPrograms: [],
        filteredPrograms: [],
        
        // 内存管理引用
        _heap: null,
        _shed: null,
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 初始化内存管理
            this._initMemory(pid);
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'run-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 500px;
                height: 200px;
                min-width: 400px;
                min-height: 150px;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('run');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '运行',
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
                // 保存窗口ID，用于精确清理
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 创建主内容区域
            const content = this._createContent();
            this.window.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 聚焦输入框
            setTimeout(() => {
                if (this.inputElement) {
                    this.inputElement.focus();
                }
            }, 100);
        },
        
        _initMemory: function(pid) {
            if (typeof MemoryManager !== 'undefined') {
                try {
                    // 使用 MemoryUtils.getAppMemory 获取内存，如果不可用则直接从 APPLICATION_SOP 获取
                    if (typeof MemoryUtils !== 'undefined' && typeof MemoryUtils.getAppMemory === 'function') {
                        const memory = MemoryUtils.getAppMemory(pid);
                        if (memory) {
                            this._heap = memory.heap;
                            this._shed = memory.shed;
                        }
                    } else {
                        // 降级方案：直接从 APPLICATION_SOP 获取
                        const appSpace = MemoryManager.APPLICATION_SOP.get(pid);
                        if (appSpace) {
                            this._heap = appSpace.heaps.get(1) || null;
                            this._shed = appSpace.sheds.get(1) || null;
                        }
                    }
                } catch (e) {
                    console.warn('[Run] 内存初始化失败:', e);
                }
            }
        },
        
        _createContent: function() {
            const content = document.createElement('div');
            content.className = 'run-content';
            content.style.cssText = `
                width: 100%;
                height: 100%;
                padding: 30px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 20px;
                justify-content: center;
            `;
            
            // 标签
            const label = document.createElement('div');
            label.textContent = '请输入程序名称:';
            label.style.cssText = `
                font-size: 14px;
                color: rgba(255, 255, 255, 0.8);
                margin-bottom: 10px;
            `;
            content.appendChild(label);
            
            // 输入框容器
            const inputContainer = document.createElement('div');
            inputContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 15px;
            `;
            
            // 输入框
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '例如: terminal, about, filemanager...';
            input.className = 'run-input';
            input.style.cssText = `
                width: 100%;
                padding: 12px 16px;
                font-size: 14px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #fff;
                outline: none;
                transition: all 0.2s;
                box-sizing: border-box;
            `;
            
            // 输入框焦点样式（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, input, 'focus', () => {
                    input.style.borderColor = 'rgba(108, 142, 255, 0.6)';
                    input.style.background = 'rgba(255, 255, 255, 0.15)';
                });
                
                EventManager.registerElementEvent(this.pid, input, 'blur', () => {
                    input.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    input.style.background = 'rgba(255, 255, 255, 0.1)';
                });
            } else {
                // 降级方案
                input.addEventListener('focus', () => {
                    input.style.borderColor = 'rgba(108, 142, 255, 0.6)';
                    input.style.background = 'rgba(255, 255, 255, 0.15)';
                });
                
                input.addEventListener('blur', () => {
                    input.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    input.style.background = 'rgba(255, 255, 255, 0.1)';
                });
            }
            
            // 保存输入框引用
            this.inputElement = input;
            
            // 获取所有注册的程序列表
            this._loadPrograms();
            
            // 创建建议列表容器
            const suggestionsContainer = document.createElement('div');
            suggestionsContainer.className = 'run-suggestions-container';
            suggestionsContainer.style.cssText = `
                position: relative;
                width: 100%;
                margin-top: 5px;
            `;
            
            const suggestionsList = document.createElement('div');
            suggestionsList.className = 'run-suggestions-list';
            suggestionsList.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                max-height: 200px;
                overflow-y: auto;
                background: rgba(30, 30, 40, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                display: none;
                z-index: 1000;
            `;
            
            this.suggestionsList = suggestionsList;
            suggestionsContainer.appendChild(suggestionsList);
            
            // 输入框输入事件 - 显示建议（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, input, 'input', (e) => {
                    this._handleInput(e.target.value);
                });
                
                // 输入框键盘事件 - 导航建议列表
                EventManager.registerEventHandler(this.pid, 'keydown', (e) => {
                    // 检查事件是否发生在 input 内
                    if (input !== e.target && !input.contains(e.target)) {
                        return;
                    }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.selectedIndex >= 0 && this.filteredPrograms.length > 0) {
                        // 如果有选中的建议，使用建议值
                        const selectedProgram = this.filteredPrograms[this.selectedIndex];
                        input.value = selectedProgram;
                        this._hideSuggestions();
                        this._handleRun();
                    } else {
                        // 否则直接运行
                        this._handleRun();
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this._hideSuggestions();
                    this._handleCancel();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this._navigateSuggestions(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this._navigateSuggestions(-1);
                } else if (e.key === 'Tab' && this.filteredPrograms.length > 0) {
                    e.preventDefault();
                    // Tab键补全第一个匹配项
                    if (this.filteredPrograms.length === 1) {
                        input.value = this.filteredPrograms[0];
                        this._hideSuggestions();
                    } else if (this.selectedIndex >= 0) {
                        input.value = this.filteredPrograms[this.selectedIndex];
                        this._hideSuggestions();
                    }
                }
                }, {
                    priority: 100,
                    selector: null
                });
            } else {
                // 降级方案
                input.addEventListener('input', (e) => {
                    this._handleInput(e.target.value);
                });
                
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (this.selectedIndex >= 0 && this.filteredPrograms.length > 0) {
                            const selectedProgram = this.filteredPrograms[this.selectedIndex];
                            input.value = selectedProgram;
                            this._hideSuggestions();
                            this._handleRun();
                        } else {
                            this._handleRun();
                        }
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        this._hideSuggestions();
                        this._handleCancel();
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this._navigateSuggestions(1);
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this._navigateSuggestions(-1);
                    } else if (e.key === 'Tab' && this.filteredPrograms.length > 0) {
                        e.preventDefault();
                        if (this.filteredPrograms.length === 1) {
                            input.value = this.filteredPrograms[0];
                            this._hideSuggestions();
                        } else if (this.selectedIndex >= 0) {
                            input.value = this.filteredPrograms[this.selectedIndex];
                            this._hideSuggestions();
                        }
                    }
                });
            }
            
            // 输入框焦点事件（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, input, 'focus', () => {
                    if (input.value.trim()) {
                        this._handleInput(input.value);
                    }
                });
            } else {
                // 降级方案
                input.addEventListener('focus', () => {
                    if (input.value.trim()) {
                        this._handleInput(input.value);
                    }
                });
            }
            
            // 点击外部关闭建议列表（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (!this.window.contains(e.target)) {
                        this._hideSuggestions();
                    }
                }, {
                    priority: 50,
                    selector: null
                });
            } else {
                // 降级方案
                document.addEventListener('click', (e) => {
                    if (!this.window.contains(e.target)) {
                        this._hideSuggestions();
                    }
                });
            }
            
            // 按钮容器
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            `;
            
            // 确定按钮
            const okButton = document.createElement('button');
            okButton.textContent = '确定';
            okButton.className = 'run-ok-button';
            okButton.style.cssText = `
                padding: 10px 24px;
                font-size: 14px;
                background: rgba(108, 142, 255, 0.8);
                border: 1px solid rgba(108, 142, 255, 0.5);
                border-radius: 6px;
                color: #fff;
                cursor: pointer;
                outline: none;
                transition: all 0.2s;
            `;
            
            // 按钮悬停效果（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, okButton, 'mouseenter', () => {
                    okButton.style.background = 'rgba(108, 142, 255, 1)';
                    okButton.style.borderColor = 'rgba(108, 142, 255, 0.8)';
                });
                
                EventManager.registerElementEvent(this.pid, okButton, 'mouseleave', () => {
                    okButton.style.background = 'rgba(108, 142, 255, 0.8)';
                    okButton.style.borderColor = 'rgba(108, 142, 255, 0.5)';
                });
            } else {
                // 降级方案
                okButton.addEventListener('mouseenter', () => {
                    okButton.style.background = 'rgba(108, 142, 255, 1)';
                    okButton.style.borderColor = 'rgba(108, 142, 255, 0.8)';
                });
                
                okButton.addEventListener('mouseleave', () => {
                    okButton.style.background = 'rgba(108, 142, 255, 0.8)';
                    okButton.style.borderColor = 'rgba(108, 142, 255, 0.5)';
                });
            }
            
            // 取消按钮
            const cancelButton = document.createElement('button');
            cancelButton.textContent = '取消';
            cancelButton.className = 'run-cancel-button';
            cancelButton.style.cssText = `
                padding: 10px 24px;
                font-size: 14px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                outline: none;
                transition: all 0.2s;
            `;
            
            // 取消按钮悬停效果（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, cancelButton, 'mouseenter', () => {
                    cancelButton.style.background = 'rgba(255, 255, 255, 0.15)';
                    cancelButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                });
                
                EventManager.registerElementEvent(this.pid, cancelButton, 'mouseleave', () => {
                    cancelButton.style.background = 'rgba(255, 255, 255, 0.1)';
                    cancelButton.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                });
            } else {
                // 降级方案
                cancelButton.addEventListener('mouseenter', () => {
                    cancelButton.style.background = 'rgba(255, 255, 255, 0.15)';
                    cancelButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                });
                
                cancelButton.addEventListener('mouseleave', () => {
                    cancelButton.style.background = 'rgba(255, 255, 255, 0.1)';
                    cancelButton.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                });
            }
            
            // 确定按钮点击事件（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                const okButtonId = `run-ok-button-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                okButton.dataset.eventId = okButtonId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    this._handleRun();
                }, {
                    priority: 100,
                    selector: `[data-event-id="${okButtonId}"]`
                });
            } else {
                // 降级方案
                okButton.addEventListener('click', () => {
                    this._handleRun();
                });
            }
            
            // 取消按钮点击事件（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                const cancelButtonId = `run-cancel-button-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                cancelButton.dataset.eventId = cancelButtonId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    this._handleCancel();
                }, {
                    priority: 100,
                    selector: `[data-event-id="${cancelButtonId}"]`
                });
            } else {
                // 降级方案
                cancelButton.addEventListener('click', () => {
                    this._handleCancel();
                });
            }
            
            // 组装
            buttonContainer.appendChild(okButton);
            buttonContainer.appendChild(cancelButton);
            inputContainer.appendChild(input);
            inputContainer.appendChild(suggestionsContainer);
            inputContainer.appendChild(buttonContainer);
            content.appendChild(inputContainer);
            
            return content;
        },
        
        _loadPrograms: function() {
            // 获取所有注册的程序列表
            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.listPrograms === 'function') {
                try {
                    this.allPrograms = ApplicationAssetManager.listPrograms();
                    // 按字母顺序排序
                    this.allPrograms.sort();
                } catch (e) {
                    console.warn('[Run] 获取程序列表失败:', e);
                    this.allPrograms = [];
                }
            } else {
                this.allPrograms = [];
            }
        },
        
        _handleInput: function(value) {
            const query = value.trim().toLowerCase();
            
            if (!query) {
                this._hideSuggestions();
                return;
            }
            
            // 过滤程序列表
            this.filteredPrograms = this.allPrograms.filter(program => 
                program.toLowerCase().startsWith(query)
            );
            
            if (this.filteredPrograms.length > 0) {
                this._showSuggestions(this.filteredPrograms);
            } else {
                this._hideSuggestions();
            }
        },
        
        _showSuggestions: function(programs) {
            if (!this.suggestionsList) return;
            
            this.suggestionsList.innerHTML = '';
            this.selectedIndex = -1;
            
            programs.forEach((program, index) => {
                const item = document.createElement('div');
                item.className = 'run-suggestion-item';
                item.textContent = program;
                item.dataset.index = index;
                item.style.cssText = `
                    padding: 10px 16px;
                    cursor: pointer;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 14px;
                    transition: all 0.15s;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                `;
                
                // 悬停效果（使用 EventManager）
                if (typeof EventManager !== 'undefined' && this.pid) {
                    EventManager.registerElementEvent(this.pid, item, 'mouseenter', () => {
                        this.selectedIndex = index;
                        this._updateSelection();
                    });
                    
                    // 点击选择
                    const itemId = `run-suggestion-item-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    item.dataset.eventId = itemId;
                    EventManager.registerEventHandler(this.pid, 'click', () => {
                        this.inputElement.value = program;
                        this._hideSuggestions();
                        this._handleRun();
                    }, {
                        priority: 100,
                        selector: `[data-event-id="${itemId}"]`
                    });
                } else {
                    // 降级方案
                    item.addEventListener('mouseenter', () => {
                        this.selectedIndex = index;
                        this._updateSelection();
                    });
                    
                    item.addEventListener('click', () => {
                        this.inputElement.value = program;
                        this._hideSuggestions();
                        this._handleRun();
                    });
                }
                
                this.suggestionsList.appendChild(item);
            });
            
            this.suggestionsList.style.display = 'block';
        },
        
        _hideSuggestions: function() {
            if (this.suggestionsList) {
                this.suggestionsList.style.display = 'none';
                this.selectedIndex = -1;
            }
        },
        
        _navigateSuggestions: function(direction) {
            if (this.filteredPrograms.length === 0) return;
            
            this.selectedIndex += direction;
            
            if (this.selectedIndex < 0) {
                this.selectedIndex = this.filteredPrograms.length - 1;
            } else if (this.selectedIndex >= this.filteredPrograms.length) {
                this.selectedIndex = 0;
            }
            
            this._updateSelection();
            
            // 滚动到选中项
            const items = this.suggestionsList.querySelectorAll('.run-suggestion-item');
            if (items[this.selectedIndex]) {
                items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
            }
        },
        
        _updateSelection: function() {
            const items = this.suggestionsList.querySelectorAll('.run-suggestion-item');
            items.forEach((item, index) => {
                if (index === this.selectedIndex) {
                    item.style.background = 'rgba(108, 142, 255, 0.3)';
                    item.style.color = '#fff';
                } else {
                    item.style.background = 'transparent';
                    item.style.color = 'rgba(255, 255, 255, 0.8)';
                }
            });
        },
        
        _handleRun: function() {
            const programName = this.inputElement.value.trim().toLowerCase();
            
            if (!programName) {
                // 如果输入为空，显示提示
                this._showMessage('请输入程序名称', 'error');
                return;
            }
            
            // 检查 ProcessManager 是否可用
            if (typeof ProcessManager === 'undefined') {
                this._showMessage('ProcessManager 不可用', 'error');
                return;
            }
            
            // 启动程序
            ProcessManager.startProgram(programName, {})
                .then((pid) => {
                    // 程序启动成功，关闭自身
                    if (typeof ProcessManager !== 'undefined') {
                        ProcessManager.killProgram(this.pid);
                    }
                })
                .catch((error) => {
                    // 程序启动失败，显示错误信息
                    const errorMessage = error.message || '程序启动失败';
                    this._showMessage(`无法启动程序 "${programName}": ${errorMessage}`, 'error');
                });
        },
        
        _handleCancel: function() {
            // 关闭窗口
            if (typeof ProcessManager !== 'undefined') {
                ProcessManager.killProgram(this.pid);
            }
        },
        
        _showMessage: function(message, type) {
            // 创建消息提示元素
            const messageEl = document.createElement('div');
            messageEl.textContent = message;
            messageEl.style.cssText = `
                position: absolute;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                padding: 8px 16px;
                background: ${type === 'error' ? 'rgba(255, 59, 48, 0.9)' : 'rgba(52, 199, 89, 0.9)'};
                color: #fff;
                border-radius: 6px;
                font-size: 12px;
                z-index: 10000;
                pointer-events: none;
                animation: fadeInOut 2s ease-in-out;
            `;
            
            // 添加动画样式（如果还没有）
            if (!document.getElementById('run-message-style')) {
                const style = document.createElement('style');
                style.id = 'run-message-style';
                style.textContent = `
                    @keyframes fadeInOut {
                        0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
                        20% { opacity: 1; transform: translateX(-50%) translateY(0); }
                        80% { opacity: 1; transform: translateX(-50%) translateY(0); }
                        100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
                    }
                `;
                document.head.appendChild(style);
            }
            
            // 添加到窗口
            this.window.appendChild(messageEl);
            
            // 2秒后移除
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 2000);
        },
        
        /**
         * 信息方法
         */
        __info__: function() {
            return {
                name: '运行',
                type: 'GUI',
                version: '1.0.0',
                description: '运行程序 - 快速启动程序对话框',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        }
    };
    
    // 导出到全局（如果 POOL 不可用）
    if (typeof window !== 'undefined') {
        window.RUN = RUN;
    }
    
    // 注册到 POOL（如果可用）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SOP")) {
                POOL.__INIT__("APPLICATION_SOP");
            }
            POOL.__ADD__("APPLICATION_SOP", "RUN", RUN);
        } catch (e) {
            console.warn('[Run] 注册到 POOL 失败:', e);
        }
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

