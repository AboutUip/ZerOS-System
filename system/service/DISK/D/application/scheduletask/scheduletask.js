// ZerOS 计划任务管理程序
// 提供计划任务的创建、编辑、删除和管理功能
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const SCHEDULETASK = {
        pid: null,
        window: null,
        windowId: null,
        
        // 多窗口管理
        _childWindows: new Map(), // Map<windowId, windowElement>
        
        // 任务列表数据
        tasks: [],
        selectedTaskId: null,
        
        // 事件处理器ID（用于清理）
        eventHandlers: [],
        
        // 刷新定时器
        refreshInterval: null,
        
        // 对话框引用
        createDialog: null,
        editDialog: null,
        
        // 右键菜单ID
        contextMenuId: null,
        
        /**
         * 初始化程序
         */
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('SCHEDULETASK', '计划任务管理程序初始化');
            }
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'scheduletask-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                display: flex;
                flex-direction: column;
                overflow: hidden;
                width: 1000px;
                height: 700px;
            `;
            
            // 使用 GUIManager 注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('scheduletask');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '计划任务',
                    icon: icon,
                    onClose: () => {
                        // onClose 回调只做清理工作
                    }
                });
                
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 创建窗口内容
            this._createWindowContent();
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 注册事件处理器
            this._registerEventHandlers();
            
            // 注册右键菜单
            this._registerContextMenu();
            
            // 延迟加载任务列表，确保进程状态已更新为 running
            // 使用 setTimeout 确保在 __init__ 完成后执行（此时进程状态已更新为 running）
            setTimeout(() => {
                this._loadTasks().catch(error => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SCHEDULETASK', '延迟加载任务列表失败', error);
                    }
                });
            }, 0);
            
            // 开始定时刷新
            this._startRefreshTimer();
        },
        
        /**
         * 退出程序
         */
        __exit__: async function() {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('SCHEDULETASK', '计划任务管理程序退出');
            }
            
            // 停止刷新定时器
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
            
            // 清理事件处理器
            if (typeof EventManager !== 'undefined') {
                for (const handlerId of this.eventHandlers) {
                    try {
                        EventManager.unregisterEventHandler(this.pid, handlerId);
                    } catch (e) {
                        // 忽略错误
                    }
                }
            }
            this.eventHandlers = [];
            
            // 注销窗口
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                GUIManager.unregisterWindow(this.windowId);
            } else if (this.pid && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
            
            // 注销右键菜单
            if (this.contextMenuId && typeof ContextMenuManager !== 'undefined') {
                try {
                    ContextMenuManager.unregisterContextMenu(this.pid, this.contextMenuId);
                } catch (e) {
                    // 忽略错误
                }
            }
            this.contextMenuId = null;
            
            // 清理所有子窗口
            if (typeof GUIManager !== 'undefined') {
                for (const [windowId, windowElement] of this._childWindows) {
                    try {
                        GUIManager.unregisterWindow(windowId);
                    } catch (e) {
                        // 忽略错误
                    }
                }
            }
            this._childWindows.clear();
            
            // 清理引用
            this.window = null;
            this.tasks = [];
            this.selectedTaskId = null;
        },
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'scheduletask',
                type: 'GUI',
                version: '1.0.0',
                description: '计划任务管理程序',
                author: 'ZerOS Team',
                copyright: '© 2026',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.SCHEDULE_TASK_CREATE,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_MANAGE,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_STARTUP,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION
                ] : [],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        },
        
        /**
         * 创建窗口内容
         */
        _createWindowContent: function() {
            // 创建工具栏
            const toolbar = this._createToolbar();
            this.window.appendChild(toolbar);
            
            // 创建主内容区域
            const content = document.createElement('div');
            content.className = 'scheduletask-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
            `;
            
            // 创建左侧任务列表
            const taskList = this._createTaskList();
            content.appendChild(taskList);
            
            // 创建右侧详情面板
            const detailPanel = this._createDetailPanel();
            content.appendChild(detailPanel);
            
            this.window.appendChild(content);
        },
        
        /**
         * 创建工具栏
         */
        _createToolbar: function() {
            const toolbar = document.createElement('div');
            toolbar.className = 'scheduletask-toolbar';
            toolbar.style.cssText = `
                padding: 12px 16px;
                border-bottom: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                background: var(--theme-background-tertiary, rgba(15, 20, 30, 0.3));
                display: flex;
                gap: 8px;
                align-items: center;
                height: 48px !important;
                min-height: 48px !important;
                max-height: 48px !important;
                box-sizing: border-box;
                flex-shrink: 0;
                overflow: hidden;
            `;
            
            // 创建任务按钮
            const createBtn = document.createElement('button');
            createBtn.className = 'scheduletask-btn scheduletask-btn-primary';
            createBtn.textContent = '创建任务';
            createBtn.onclick = () => this._showCreateDialog();
            toolbar.appendChild(createBtn);
            
            // 删除任务按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'scheduletask-btn';
            deleteBtn.textContent = '删除任务';
            deleteBtn.onclick = () => this._deleteSelectedTask();
            toolbar.appendChild(deleteBtn);
            
            // 刷新按钮
            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'scheduletask-btn';
            refreshBtn.textContent = '刷新';
            refreshBtn.onclick = () => this._loadTasks();
            toolbar.appendChild(refreshBtn);
            
            return toolbar;
        },
        
        /**
         * 创建任务列表
         */
        _createTaskList: function() {
            const listContainer = document.createElement('div');
            listContainer.className = 'scheduletask-list-container';
            listContainer.style.cssText = `
                width: 300px;
                border-right: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                display: flex;
                flex-direction: column;
                overflow: hidden;
                background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
            `;
            
            // 列表标题
            const listHeader = document.createElement('div');
            listHeader.className = 'scheduletask-list-header';
            listHeader.textContent = '任务列表';
            listHeader.style.cssText = `
                padding: 12px 16px;
                font-weight: 600;
                font-size: 14px;
                border-bottom: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                background: var(--theme-background-tertiary, rgba(15, 20, 30, 0.3));
            `;
            listContainer.appendChild(listHeader);
            
            // 任务列表
            const taskList = document.createElement('div');
            taskList.className = 'scheduletask-list';
            taskList.id = 'scheduletask-task-list';
            taskList.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            `;
            listContainer.appendChild(taskList);
            
            return listContainer;
        },
        
        /**
         * 创建详情面板
         */
        _createDetailPanel: function() {
            const panel = document.createElement('div');
            panel.className = 'scheduletask-detail-panel';
            panel.id = 'scheduletask-detail-panel';
            panel.style.cssText = `
                flex: 1;
                padding: 24px;
                overflow-y: auto;
                background: var(--theme-background, rgba(15, 20, 30, 0.6));
            `;
            
            // 默认显示空状态
            const emptyState = document.createElement('div');
            emptyState.className = 'scheduletask-empty-state';
            emptyState.innerHTML = `
                <div style="text-align: center; color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6)); padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
                    <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">未选择任务</div>
                    <div style="font-size: 14px;">请从左侧列表选择一个任务查看详情</div>
                </div>
            `;
            panel.appendChild(emptyState);
            
            return panel;
        },
        
        /**
         * 加载任务列表
         */
        _loadTasks: async function() {
            try {
                if (typeof POOL === 'undefined' || typeof POOL.__GET__ !== 'function') {
                    throw new Error("POOL 不可用");
                }
                
                const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
                if (!ProcessManager || typeof ProcessManager.callKernelAPI !== 'function') {
                    throw new Error("ProcessManager 不可用");
                }
                
                // 等待进程状态变为 running（如果还在 loading）
                // 注意：如果是在 __init__ 中调用，进程状态可能还是 loading，需要等待
                let processReadyRetries = 0;
                const maxProcessReadyRetries = 20; // 最多等待 2 秒
                while (processReadyRetries < maxProcessReadyRetries) {
                    const processInfo = ProcessManager.getProcessInfo(this.pid);
                    if (processInfo && processInfo.status === 'running') {
                        break;
                    }
                    if (processInfo && processInfo.status === 'exited') {
                        throw new Error(`进程 ${this.pid} 已退出`);
                    }
                    // 如果状态是 loading，继续等待（这是正常的，因为可能还在 __init__ 中）
                    processReadyRetries++;
                    if (processReadyRetries >= maxProcessReadyRetries) {
                        // 如果超时，记录警告但继续尝试调用 API（可能状态检查有延迟）
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SCHEDULETASK', `进程 ${this.pid} 状态检查超时，状态: ${processInfo ? processInfo.status : 'unknown'}，继续尝试调用 API`);
                        }
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // 等待 ScheduleTaskManager 初始化完成
                let retries = 0;
                const maxRetries = 20; // 最多等待 2 秒
                while (retries < maxRetries) {
                    try {
                        // 尝试获取任务列表
                        const result = await ProcessManager.callKernelAPI(
                            this.pid,
                            'ScheduleTask.getAll',
                            []
                        );
                        
                        // 确保结果是数组
                        if (!Array.isArray(result)) {
                            throw new Error(`ScheduleTask.getAll 返回了非数组值: ${typeof result}`);
                        }
                        
                        this.tasks = result;
                        
                        // 如果成功获取，跳出循环
                        break;
                    } catch (error) {
                        const errorMessage = error.message || String(error);
                        
                        // 如果是进程未运行错误，等待后重试
                        if (errorMessage.includes('is not running') || errorMessage.includes('未运行')) {
                            retries++;
                            if (retries >= maxRetries) {
                                throw new Error(`进程 ${this.pid} 状态检查失败: ${errorMessage}`);
                            }
                            // 检查进程状态
                            const processInfo = ProcessManager.getProcessInfo(this.pid);
                            if (processInfo && processInfo.status === 'exited') {
                                throw new Error(`进程 ${this.pid} 已退出`);
                            }
                            await new Promise(resolve => setTimeout(resolve, 100));
                            continue;
                        }
                        
                        // 如果是模块未加载错误，等待后重试
                        if (errorMessage.includes('ScheduleTaskManager 模块未加载') || 
                            errorMessage.includes('ScheduleTaskManager') && errorMessage.includes('未加载')) {
                            retries++;
                            if (retries >= maxRetries) {
                                throw new Error(`ScheduleTaskManager 模块加载超时: ${errorMessage}`);
                            }
                            await new Promise(resolve => setTimeout(resolve, 100));
                            continue;
                        }
                        
                        // 其他错误直接抛出
                        throw error;
                    }
                }
                
                // 更新UI
                this._updateTaskList();
                this._updateDetailPanel();
            } catch (error) {
                // 记录详细错误信息
                const errorMessage = error.message || String(error);
                const errorStack = error.stack || '';
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SCHEDULETASK', `加载任务列表失败: ${errorMessage}`, {
                        error: errorMessage,
                        stack: errorStack,
                        pid: this.pid
                    });
                }
                
                // 显示错误消息（但不阻塞UI）
                this._showError('加载任务列表失败: ' + errorMessage);
                
                // 即使失败，也显示空列表，确保UI可用
                this.tasks = [];
                this._updateTaskList();
                this._updateDetailPanel();
            }
        },
        
        /**
         * 更新任务列表UI
         */
        _updateTaskList: function() {
            const taskList = document.getElementById('scheduletask-task-list');
            if (!taskList) return;
            
            // 清空列表
            taskList.innerHTML = '';
            
            if (this.tasks.length === 0) {
                const emptyItem = document.createElement('div');
                emptyItem.className = 'scheduletask-list-empty';
                emptyItem.textContent = '暂无计划任务';
                emptyItem.style.cssText = `
                    padding: 20px;
                    text-align: center;
                    color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));
                    font-size: 14px;
                `;
                taskList.appendChild(emptyItem);
                return;
            }
            
            // 创建任务项
            this.tasks.forEach(task => {
                const item = this._createTaskListItem(task);
                taskList.appendChild(item);
            });
        },
        
        /**
         * 创建任务列表项
         */
        _createTaskListItem: function(task) {
            const item = document.createElement('div');
            item.className = 'scheduletask-list-item';
            item.dataset.taskId = task.id; // 添加任务ID到data属性，用于右键菜单
            if (this.selectedTaskId === task.id) {
                item.classList.add('selected');
            }
            item.style.cssText = `
                padding: 12px 16px;
                cursor: pointer;
                border-bottom: 1px solid var(--theme-border, rgba(139, 92, 246, 0.1));
                transition: background 0.2s;
                background: ${this.selectedTaskId === task.id ? 'var(--theme-primary, rgba(139, 92, 246, 0.2))' : 'transparent'};
            `;
            
            // 任务名称/命令
            const name = document.createElement('div');
            name.className = 'scheduletask-list-item-name';
            const taskType = task.taskType || 'program'; // 向后兼容
            if (taskType === 'command') {
                name.textContent = task.command || '未定义命令';
                name.title = task.command || '未定义命令';
            } else {
                name.textContent = task.programName || '未定义程序';
                name.title = task.programName || '未定义程序';
            }
            name.style.cssText = `
                font-weight: 500;
                font-size: 14px;
                margin-bottom: 4px;
                color: var(--theme-text, #d7e0dd);
            `;
            item.appendChild(name);
            
            // 任务类型标签
            const typeTag = document.createElement('div');
            typeTag.className = 'scheduletask-list-item-type';
            typeTag.textContent = taskType === 'command' ? '命令' : '程序';
            typeTag.style.cssText = `
                font-size: 10px;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.5));
                margin-bottom: 2px;
            `;
            item.appendChild(typeTag);
            
            // 触发类型
            const triggerType = document.createElement('div');
            triggerType.className = 'scheduletask-list-item-trigger';
            triggerType.textContent = this._getTriggerTypeText(task.triggerType);
            triggerType.style.cssText = `
                font-size: 12px;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));
            `;
            item.appendChild(triggerType);
            
            // 状态指示器
            const status = document.createElement('div');
            status.className = 'scheduletask-list-item-status';
            status.innerHTML = task.enabled 
                ? '<span style="color: #4ade80;">●</span> 已启用'
                : '<span style="color: #f87171;">●</span> 已禁用';
            status.style.cssText = `
                font-size: 11px;
                margin-top: 4px;
            `;
            item.appendChild(status);
            
            // 点击事件
            item.onclick = () => {
                this.selectedTaskId = task.id;
                this._updateTaskList();
                this._updateDetailPanel();
            };
            
            // 悬停效果
            item.onmouseenter = () => {
                if (this.selectedTaskId !== task.id) {
                    item.style.background = 'var(--theme-background-elevated, rgba(139, 92, 246, 0.1))';
                }
            };
            item.onmouseleave = () => {
                if (this.selectedTaskId !== task.id) {
                    item.style.background = 'transparent';
                }
            };
            
            return item;
        },
        
        /**
         * 获取触发类型文本
         */
        _getTriggerTypeText: function(triggerType) {
            const typeMap = {
                'SYSTEM_STARTUP': '系统启动时',
                'SYSTEM_SHUTDOWN': '系统关闭前',
                'SPECIFIC_TIME': '特定时间',
                'TIME_RANGE': '时间区间',
                'INTERVAL': '间隔时间'
            };
            return typeMap[triggerType] || triggerType;
        },
        
        /**
         * 更新详情面板
         */
        _updateDetailPanel: function() {
            const panel = document.getElementById('scheduletask-detail-panel');
            if (!panel) return;
            
            if (!this.selectedTaskId) {
                panel.innerHTML = `
                    <div style="text-align: center; color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6)); padding: 60px 20px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
                        <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">未选择任务</div>
                        <div style="font-size: 14px;">请从左侧列表选择一个任务查看详情</div>
                    </div>
                `;
                return;
            }
            
            const task = this.tasks.find(t => t.id === this.selectedTaskId);
            if (!task) {
                panel.innerHTML = '<div>任务不存在</div>';
                return;
            }
            
            // 创建详情内容
            panel.innerHTML = '';
            
            // 标题栏
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
            `;
            
            const title = document.createElement('h2');
            const taskType = task.taskType || 'program'; // 向后兼容
            if (taskType === 'command') {
                title.textContent = task.command || '未定义命令';
            } else {
                title.textContent = task.programName || '未定义程序';
            }
            title.style.cssText = `
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                color: var(--theme-text, #d7e0dd);
            `;
            header.appendChild(title);
            
            // 操作按钮组
            const actions = document.createElement('div');
            actions.style.cssText = 'display: flex; gap: 8px;';
            
            // 编辑按钮
            const editBtn = document.createElement('button');
            editBtn.className = 'scheduletask-btn';
            editBtn.textContent = '编辑';
            editBtn.onclick = () => this._showEditDialog(task);
            actions.appendChild(editBtn);
            
            // 启用/禁用按钮
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'scheduletask-btn';
            toggleBtn.textContent = task.enabled ? '禁用' : '启用';
            toggleBtn.onclick = () => this._toggleTask(task.id, !task.enabled);
            actions.appendChild(toggleBtn);
            
            header.appendChild(actions);
            panel.appendChild(header);
            
            // 基本信息
            const infoSection = this._createInfoSection(task);
            panel.appendChild(infoSection);
            
            // 触发配置
            const triggerSection = this._createTriggerSection(task);
            panel.appendChild(triggerSection);
            
            // 统计信息
            const statsSection = this._createStatsSection(task);
            panel.appendChild(statsSection);
        },
        
        /**
         * 创建信息部分
         */
        _createInfoSection: function(task) {
            const section = document.createElement('div');
            section.className = 'scheduletask-detail-section';
            section.style.cssText = 'margin-bottom: 24px;';
            
            const title = document.createElement('h3');
            title.textContent = '基本信息';
            title.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 16px 0;
                color: var(--theme-text, #d7e0dd);
            `;
            section.appendChild(title);
            
            const grid = document.createElement('div');
            grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px;';
            
            // 任务类型
            const taskType = task.taskType || 'program'; // 向后兼容
            this._addInfoRow(grid, '任务类型', taskType === 'command' ? '命令' : '程序');
            
            // 程序名称或命令
            if (taskType === 'command') {
                this._addInfoRow(grid, '命令', task.command || '未定义');
            } else {
                this._addInfoRow(grid, '程序名称', task.programName || '未定义');
            }
            
            // 触发类型
            this._addInfoRow(grid, '触发类型', this._getTriggerTypeText(task.triggerType));
            
            // 状态
            this._addInfoRow(grid, '状态', task.enabled ? '已启用' : '已禁用');
            
            // 创建时间
            this._addInfoRow(grid, '创建时间', new Date(task.createdAt).toLocaleString('zh-CN'));
            
            // 更新时间
            this._addInfoRow(grid, '更新时间', new Date(task.updatedAt).toLocaleString('zh-CN'));
            
            // 创建者
            this._addInfoRow(grid, '创建者', task.createdBy || '未知');
            
            section.appendChild(grid);
            return section;
        },
        
        /**
         * 添加信息行
         */
        _addInfoRow: function(container, label, value) {
            const row = document.createElement('div');
            row.style.cssText = 'padding: 8px 0;';
            
            const labelEl = document.createElement('div');
            labelEl.textContent = label + ':';
            labelEl.style.cssText = `
                font-size: 12px;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));
                margin-bottom: 4px;
            `;
            row.appendChild(labelEl);
            
            const valueEl = document.createElement('div');
            valueEl.textContent = value;
            valueEl.style.cssText = `
                font-size: 14px;
                color: var(--theme-text, #d7e0dd);
                font-weight: 500;
            `;
            row.appendChild(valueEl);
            
            container.appendChild(row);
        },
        
        /**
         * 创建触发配置部分
         */
        _createTriggerSection: function(task) {
            const section = document.createElement('div');
            section.className = 'scheduletask-detail-section';
            section.style.cssText = 'margin-bottom: 24px;';
            
            const title = document.createElement('h3');
            title.textContent = '触发配置';
            title.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 16px 0;
                color: var(--theme-text, #d7e0dd);
            `;
            section.appendChild(title);
            
            const config = document.createElement('div');
            config.style.cssText = `
                padding: 16px;
                background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                border-radius: 8px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
            `;
            
            let configText = '';
            switch (task.triggerType) {
                case 'SYSTEM_STARTUP':
                    configText = '系统启动完成后立即执行';
                    break;
                case 'SYSTEM_SHUTDOWN':
                    configText = '系统关闭前执行';
                    break;
                case 'SPECIFIC_TIME':
                    configText = `每天 ${task.triggerConfig.time} 执行`;
                    break;
                case 'TIME_RANGE':
                    configText = `从 ${task.triggerConfig.startTime} 到 ${task.triggerConfig.endTime}，每 ${task.triggerConfig.interval} 分钟执行一次`;
                    break;
                case 'INTERVAL':
                    configText = `每 ${task.triggerConfig.interval} 分钟执行一次`;
                    break;
                default:
                    configText = JSON.stringify(task.triggerConfig);
            }
            
            config.textContent = configText;
            config.style.cssText += `
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                line-height: 1.6;
            `;
            section.appendChild(config);
            
            return section;
        },
        
        /**
         * 创建统计信息部分
         */
        _createStatsSection: function(task) {
            const section = document.createElement('div');
            section.className = 'scheduletask-detail-section';
            
            const title = document.createElement('h3');
            title.textContent = '统计信息';
            title.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 16px 0;
                color: var(--theme-text, #d7e0dd);
            `;
            section.appendChild(title);
            
            const grid = document.createElement('div');
            grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px;';
            
            // 运行次数
            this._addInfoRow(grid, '运行次数', task.runCount || 0);
            
            // 最后运行时间
            const lastRun = task.lastRunAt > 0 
                ? new Date(task.lastRunAt).toLocaleString('zh-CN')
                : '从未运行';
            this._addInfoRow(grid, '最后运行时间', lastRun);
            
            section.appendChild(grid);
            return section;
        },
        
        /**
         * 显示创建任务对话框
         */
        _showCreateDialog: function() {
            this._showTaskDialog(null);
        },
        
        /**
         * 显示编辑任务对话框
         */
        _showEditDialog: function(task) {
            this._showTaskDialog(task);
        },
        
        /**
         * 显示任务窗口（创建或编辑）
         */
        _showTaskDialog: function(task) {
            const isEdit = !!task;
            
            // 获取 GUI 容器
            const guiContainer = document.getElementById('gui-container');
            if (!guiContainer) {
                this._showError('GUI 容器不可用');
                return;
            }
            
            // 创建窗口元素
            const windowElement = document.createElement('div');
            windowElement.className = 'scheduletask-task-window zos-gui-window';
            windowElement.dataset.pid = this.pid.toString();
            windowElement.style.cssText = `
                display: flex;
                flex-direction: column;
                overflow: hidden;
                width: 600px;
                height: 600px;
            `;
            
            // 创建窗口内容容器
            const content = document.createElement('div');
            content.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 24px;
            `;
            windowElement.appendChild(content);
            
            // 使用 GUIManager 注册窗口
            let windowId = null;
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('scheduletask');
                }
                
                const windowInfo = GUIManager.registerWindow(this.pid, windowElement, {
                    title: isEdit ? '编辑计划任务' : '创建计划任务',
                    icon: icon,
                    onClose: () => {
                        // 从子窗口列表中移除
                        if (windowId) {
                            this._childWindows.delete(windowId);
                        }
                    }
                });
                
                if (windowInfo && windowInfo.windowId) {
                    windowId = windowInfo.windowId;
                    this._childWindows.set(windowId, windowElement);
                }
            }
            
            // 创建对话框内容
            const dialog = document.createElement('div');
            dialog.className = 'scheduletask-dialog';
            dialog.style.cssText = `
                display: flex;
                flex-direction: column;
                height: 100%;
            `;
            
            // 标题
            const title = document.createElement('h2');
            title.textContent = isEdit ? '编辑计划任务' : '创建计划任务';
            title.style.cssText = `
                margin: 0 0 24px 0;
                font-size: 20px;
                font-weight: 600;
                color: var(--theme-text, #d7e0dd);
            `;
            dialog.appendChild(title);
            
            // 表单
            const form = document.createElement('form');
            form.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
            
            // 任务类型选择
            const taskTypeGroup = document.createElement('div');
            taskTypeGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
            
            const taskTypeLabel = document.createElement('label');
            taskTypeLabel.textContent = '任务类型 *';
            taskTypeLabel.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            taskTypeGroup.appendChild(taskTypeLabel);
            
            const taskTypeSelect = document.createElement('select');
            taskTypeSelect.style.cssText = `
                padding: 10px 12px;
                background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                border-radius: 8px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
            `;
            
            const programOption = document.createElement('option');
            programOption.value = 'program';
            programOption.textContent = '执行程序';
            if (!task || (task.taskType || 'program') === 'program') {
                programOption.selected = true;
            }
            taskTypeSelect.appendChild(programOption);
            
            const commandOption = document.createElement('option');
            commandOption.value = 'command';
            commandOption.textContent = '执行命令';
            if (task && task.taskType === 'command') {
                commandOption.selected = true;
            }
            taskTypeSelect.appendChild(commandOption);
            taskTypeGroup.appendChild(taskTypeSelect);
            form.appendChild(taskTypeGroup);
            
            // 程序名称/命令输入容器（动态显示）
            const actionInputContainer = document.createElement('div');
            actionInputContainer.id = 'scheduletask-action-input';
            actionInputContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
            form.appendChild(actionInputContainer);
            
            // 更新输入字段
            const updateActionInput = () => {
                actionInputContainer.innerHTML = '';
                const selectedType = taskTypeSelect.value;
                
                if (selectedType === 'program') {
                    // 程序名称输入
                    const programNameLabel = document.createElement('label');
                    programNameLabel.textContent = '程序名称 *';
                    programNameLabel.style.cssText = `
                        font-size: 14px;
                        font-weight: 500;
                        color: var(--theme-text, #d7e0dd);
                    `;
                    actionInputContainer.appendChild(programNameLabel);
                    
                    const programNameInput = document.createElement('input');
                    programNameInput.type = 'text';
                    programNameInput.value = task && task.taskType !== 'command' ? (task.programName || '') : '';
                    programNameInput.required = true;
                    programNameInput.id = 'scheduletask-program-name';
                    programNameInput.style.cssText = `
                        padding: 10px 12px;
                        background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                        border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                        border-radius: 8px;
                        color: var(--theme-text, #d7e0dd);
                        font-size: 14px;
                    `;
                    actionInputContainer.appendChild(programNameInput);
                } else if (selectedType === 'command') {
                    // 命令输入
                    const commandLabel = document.createElement('label');
                    commandLabel.textContent = '命令 *';
                    commandLabel.style.cssText = `
                        font-size: 14px;
                        font-weight: 500;
                        color: var(--theme-text, #d7e0dd);
                    `;
                    actionInputContainer.appendChild(commandLabel);
                    
                    const commandInput = document.createElement('textarea');
                    commandInput.value = task && task.taskType === 'command' ? (task.command || '') : '';
                    commandInput.required = true;
                    commandInput.id = 'scheduletask-command';
                    commandInput.rows = 3;
                    commandInput.placeholder = '例如: ls -la 或 echo "Hello World"';
                    commandInput.style.cssText = `
                        padding: 10px 12px;
                        background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                        border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                        border-radius: 8px;
                        color: var(--theme-text, #d7e0dd);
                        font-size: 14px;
                        font-family: monospace;
                        resize: vertical;
                    `;
                    actionInputContainer.appendChild(commandInput);
                }
            };
            
            // 初始更新
            updateActionInput();
            
            // 监听任务类型变化
            taskTypeSelect.onchange = updateActionInput;
            
            // 触发类型
            const triggerTypeGroup = document.createElement('div');
            triggerTypeGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
            
            const triggerTypeLabel = document.createElement('label');
            triggerTypeLabel.textContent = '触发类型 *';
            triggerTypeLabel.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            triggerTypeGroup.appendChild(triggerTypeLabel);
            
            const triggerTypeSelect = document.createElement('select');
            triggerTypeSelect.style.cssText = `
                padding: 10px 12px;
                background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                border-radius: 8px;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
            `;
            
            const triggerTypes = [
                { value: 'SYSTEM_STARTUP', text: '系统启动时' },
                { value: 'SYSTEM_SHUTDOWN', text: '系统关闭前' },
                { value: 'SPECIFIC_TIME', text: '特定时间' },
                { value: 'TIME_RANGE', text: '时间区间' },
                { value: 'INTERVAL', text: '间隔时间' }
            ];
            
            triggerTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type.value;
                option.textContent = type.text;
                if (task && task.triggerType === type.value) {
                    option.selected = true;
                }
                triggerTypeSelect.appendChild(option);
            });
            triggerTypeGroup.appendChild(triggerTypeSelect);
            form.appendChild(triggerTypeGroup);
            
            // 触发配置容器（动态显示）
            const triggerConfigContainer = document.createElement('div');
            triggerConfigContainer.id = 'scheduletask-trigger-config';
            triggerConfigContainer.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
            form.appendChild(triggerConfigContainer);
            
            // 更新触发配置UI
            const updateTriggerConfig = () => {
                triggerConfigContainer.innerHTML = '';
                const selectedType = triggerTypeSelect.value;
                
                if (selectedType === 'SPECIFIC_TIME') {
                    const timeGroup = document.createElement('div');
                    timeGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
                    
                    const timeLabel = document.createElement('label');
                    timeLabel.textContent = '执行时间 (HH:mm) *';
                    timeLabel.style.cssText = `
                        font-size: 14px;
                        font-weight: 500;
                        color: var(--theme-text, #d7e0dd);
                    `;
                    timeGroup.appendChild(timeLabel);
                    
                    const timeInput = document.createElement('input');
                    timeInput.type = 'time';
                    timeInput.value = task && task.triggerConfig.time ? task.triggerConfig.time : '09:00';
                    timeInput.required = true;
                    timeInput.dataset.configKey = 'time';
                    timeInput.style.cssText = `
                        padding: 10px 12px;
                        background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                        border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                        border-radius: 8px;
                        color: var(--theme-text, #d7e0dd);
                        font-size: 14px;
                    `;
                    timeGroup.appendChild(timeInput);
                    triggerConfigContainer.appendChild(timeGroup);
                } else if (selectedType === 'TIME_RANGE') {
                    const startTimeGroup = document.createElement('div');
                    startTimeGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
                    
                    const startTimeLabel = document.createElement('label');
                    startTimeLabel.textContent = '开始时间 (HH:mm) *';
                    startTimeLabel.style.cssText = `
                        font-size: 14px;
                        font-weight: 500;
                        color: var(--theme-text, #d7e0dd);
                    `;
                    startTimeGroup.appendChild(startTimeLabel);
                    
                    const startTimeInput = document.createElement('input');
                    startTimeInput.type = 'time';
                    startTimeInput.value = task && task.triggerConfig.startTime ? task.triggerConfig.startTime : '09:00';
                    startTimeInput.required = true;
                    startTimeInput.dataset.configKey = 'startTime';
                    startTimeInput.style.cssText = `
                        padding: 10px 12px;
                        background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                        border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                        border-radius: 8px;
                        color: var(--theme-text, #d7e0dd);
                        font-size: 14px;
                    `;
                    startTimeGroup.appendChild(startTimeInput);
                    triggerConfigContainer.appendChild(startTimeGroup);
                    
                    const endTimeGroup = document.createElement('div');
                    endTimeGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
                    
                    const endTimeLabel = document.createElement('label');
                    endTimeLabel.textContent = '结束时间 (HH:mm) *';
                    endTimeLabel.style.cssText = `
                        font-size: 14px;
                        font-weight: 500;
                        color: var(--theme-text, #d7e0dd);
                    `;
                    endTimeGroup.appendChild(endTimeLabel);
                    
                    const endTimeInput = document.createElement('input');
                    endTimeInput.type = 'time';
                    endTimeInput.value = task && task.triggerConfig.endTime ? task.triggerConfig.endTime : '18:00';
                    endTimeInput.required = true;
                    endTimeInput.dataset.configKey = 'endTime';
                    endTimeInput.style.cssText = `
                        padding: 10px 12px;
                        background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                        border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                        border-radius: 8px;
                        color: var(--theme-text, #d7e0dd);
                        font-size: 14px;
                    `;
                    endTimeGroup.appendChild(endTimeInput);
                    triggerConfigContainer.appendChild(endTimeGroup);
                    
                    const intervalGroup = document.createElement('div');
                    intervalGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
                    
                    const intervalLabel = document.createElement('label');
                    intervalLabel.textContent = '执行间隔 (分钟) *';
                    intervalLabel.style.cssText = `
                        font-size: 14px;
                        font-weight: 500;
                        color: var(--theme-text, #d7e0dd);
                    `;
                    intervalGroup.appendChild(intervalLabel);
                    
                    const intervalInput = document.createElement('input');
                    intervalInput.type = 'number';
                    intervalInput.min = '1';
                    intervalInput.value = task && task.triggerConfig.interval ? task.triggerConfig.interval : '30';
                    intervalInput.required = true;
                    intervalInput.dataset.configKey = 'interval';
                    intervalInput.style.cssText = `
                        padding: 10px 12px;
                        background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                        border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                        border-radius: 8px;
                        color: var(--theme-text, #d7e0dd);
                        font-size: 14px;
                    `;
                    intervalGroup.appendChild(intervalInput);
                    triggerConfigContainer.appendChild(intervalGroup);
                } else if (selectedType === 'INTERVAL') {
                    const intervalGroup = document.createElement('div');
                    intervalGroup.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
                    
                    const intervalLabel = document.createElement('label');
                    intervalLabel.textContent = '执行间隔 (分钟) *';
                    intervalLabel.style.cssText = `
                        font-size: 14px;
                        font-weight: 500;
                        color: var(--theme-text, #d7e0dd);
                    `;
                    intervalGroup.appendChild(intervalLabel);
                    
                    const intervalInput = document.createElement('input');
                    intervalInput.type = 'number';
                    intervalInput.min = '1';
                    intervalInput.value = task && task.triggerConfig.interval ? task.triggerConfig.interval : '60';
                    intervalInput.required = true;
                    intervalInput.dataset.configKey = 'interval';
                    intervalInput.style.cssText = `
                        padding: 10px 12px;
                        background: var(--theme-background-secondary, rgba(20, 25, 35, 0.4));
                        border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                        border-radius: 8px;
                        color: var(--theme-text, #d7e0dd);
                        font-size: 14px;
                    `;
                    intervalGroup.appendChild(intervalInput);
                    triggerConfigContainer.appendChild(intervalGroup);
                }
            };
            
            // 初始更新
            updateTriggerConfig();
            
            // 监听触发类型变化
            triggerTypeSelect.onchange = updateTriggerConfig;
            
            // 是否启用
            const enabledGroup = document.createElement('div');
            enabledGroup.style.cssText = 'display: flex; align-items: center; gap: 8px;';
            
            const enabledCheckbox = document.createElement('input');
            enabledCheckbox.type = 'checkbox';
            enabledCheckbox.checked = task ? task.enabled : true;
            enabledCheckbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
            enabledGroup.appendChild(enabledCheckbox);
            
            const enabledLabel = document.createElement('label');
            enabledLabel.textContent = '启用任务';
            enabledLabel.style.cssText = `
                font-size: 14px;
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
            `;
            enabledGroup.appendChild(enabledLabel);
            form.appendChild(enabledGroup);
            
            // 是否需要启动权限（仅创建时显示）
            let startupPermissionGroup = null;
            if (!isEdit) {
                startupPermissionGroup = document.createElement('div');
                startupPermissionGroup.style.cssText = 'display: flex; align-items: center; gap: 8px;';
                
                const startupCheckbox = document.createElement('input');
                startupCheckbox.type = 'checkbox';
                startupCheckbox.id = 'scheduletask-startup-permission';
                startupCheckbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
                startupPermissionGroup.appendChild(startupCheckbox);
                
                const startupLabel = document.createElement('label');
                startupLabel.htmlFor = 'scheduletask-startup-permission';
                startupLabel.innerHTML = '系统启动后执行（需要危险权限）';
                startupLabel.style.cssText = `
                    font-size: 14px;
                    color: var(--theme-text, #d7e0dd);
                    cursor: pointer;
                `;
                startupPermissionGroup.appendChild(startupLabel);
                form.appendChild(startupPermissionGroup);
            }
            
            // 按钮组
            const buttonGroup = document.createElement('div');
            buttonGroup.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'scheduletask-btn';
            cancelBtn.textContent = '取消';
            cancelBtn.onclick = () => {
                // 关闭窗口
                if (windowId && typeof GUIManager !== 'undefined') {
                    GUIManager.unregisterWindow(windowId);
                } else if (windowElement && windowElement.parentElement) {
                    windowElement.parentElement.removeChild(windowElement);
                }
            };
            buttonGroup.appendChild(cancelBtn);
            
            const submitBtn = document.createElement('button');
            submitBtn.type = 'submit';
            submitBtn.className = 'scheduletask-btn scheduletask-btn-primary';
            submitBtn.textContent = isEdit ? '保存' : '创建';
            buttonGroup.appendChild(submitBtn);
            
            form.appendChild(buttonGroup);
            
            // 表单提交
            form.onsubmit = async (e) => {
                e.preventDefault();
                
                try {
                    const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
                    if (!ProcessManager) {
                        throw new Error("ProcessManager 不可用");
                    }
                    
                    // 获取任务类型
                    const taskType = taskTypeSelect.value;
                    
                    // 收集触发配置
                    const triggerType = triggerTypeSelect.value;
                    let triggerConfig = {};
                    
                    if (triggerType === 'SPECIFIC_TIME') {
                        const timeInput = triggerConfigContainer.querySelector('input[data-config-key="time"]');
                        triggerConfig = { time: timeInput.value };
                    } else if (triggerType === 'TIME_RANGE') {
                        const startTimeInput = triggerConfigContainer.querySelector('input[data-config-key="startTime"]');
                        const endTimeInput = triggerConfigContainer.querySelector('input[data-config-key="endTime"]');
                        const intervalInput = triggerConfigContainer.querySelector('input[data-config-key="interval"]');
                        triggerConfig = {
                            startTime: startTimeInput.value,
                            endTime: endTimeInput.value,
                            interval: parseInt(intervalInput.value)
                        };
                    } else if (triggerType === 'INTERVAL') {
                        const intervalInput = triggerConfigContainer.querySelector('input[data-config-key="interval"]');
                        triggerConfig = { interval: parseInt(intervalInput.value) };
                    }
                    
                    // 根据任务类型构建任务配置
                    const taskConfig = {
                        taskType: taskType,
                        triggerType: triggerType,
                        triggerConfig: triggerConfig,
                        enabled: enabledCheckbox.checked
                    };
                    
                    // 根据任务类型设置相应字段
                    if (taskType === 'program') {
                        const programNameInput = document.getElementById('scheduletask-program-name');
                        if (!programNameInput || !programNameInput.value.trim()) {
                            throw new Error("程序名称不能为空");
                        }
                        taskConfig.programName = programNameInput.value.trim();
                    } else if (taskType === 'command') {
                        const commandInput = document.getElementById('scheduletask-command');
                        if (!commandInput || !commandInput.value.trim()) {
                            throw new Error("命令不能为空");
                        }
                        taskConfig.command = commandInput.value.trim();
                    }
                    
                    if (isEdit) {
                        // 更新任务
                        await ProcessManager.callKernelAPI(
                            this.pid,
                            'ScheduleTask.update',
                            [task.id, taskConfig]
                        );
                        this._showSuccess('任务更新成功');
                    } else {
                        // 创建任务
                        const requiresStartupPermission = startupPermissionGroup && 
                            startupPermissionGroup.querySelector('input[type="checkbox"]').checked;
                        
                        await ProcessManager.callKernelAPI(
                            this.pid,
                            'ScheduleTask.create',
                            [taskConfig, requiresStartupPermission]
                        );
                        this._showSuccess('任务创建成功');
                    }
                    
                    // 关闭窗口
                    if (windowId && typeof GUIManager !== 'undefined') {
                        GUIManager.unregisterWindow(windowId);
                    } else if (windowElement && windowElement.parentElement) {
                        windowElement.parentElement.removeChild(windowElement);
                    }
                    
                    // 刷新任务列表
                    await this._loadTasks();
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SCHEDULETASK', '保存任务失败', error);
                    }
                    this._showError('保存任务失败: ' + error.message);
                }
            };
            
            dialog.appendChild(form);
            content.appendChild(dialog);
            
            // 添加到 GUI 容器
            guiContainer.appendChild(windowElement);
            
            // 聚焦窗口
            if (windowId && typeof GUIManager !== 'undefined') {
                GUIManager.focusWindow(windowId);
            }
        },
        
        /**
         * 删除任务
         * @param {string} taskId 任务ID（可选，如果不提供则使用选中的任务）
         */
        _deleteTask: async function(taskId = null) {
            const targetTaskId = taskId || this.selectedTaskId;
            
            if (!targetTaskId) {
                this._showError('请先选择一个任务');
                return;
            }
            
            const task = this.tasks.find(t => t.id === targetTaskId);
            if (!task) {
                this._showError('任务不存在');
                return;
            }
            
            // 获取任务显示名称
            const taskName = (task.taskType === 'command' ? task.command : task.programName) || '未命名任务';
            
            // 使用 GUIManager 的确认对话框
            let confirmed = false;
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                confirmed = await GUIManager.showConfirm(
                    `确定要删除任务 "${taskName}" 吗？`,
                    '删除计划任务',
                    'danger'
                );
            } else {
                // 如果没有 GUIManager，直接删除（无确认）
                confirmed = true;
            }
            
            if (!confirmed) {
                return;
            }
            
            try {
                const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
                if (!ProcessManager) {
                    throw new Error("ProcessManager 不可用");
                }
                
                await ProcessManager.callKernelAPI(
                    this.pid,
                    'ScheduleTask.delete',
                    [targetTaskId]
                );
                
                this._showSuccess('任务删除成功');
                
                // 如果删除的是选中的任务，清除选中状态
                if (this.selectedTaskId === targetTaskId) {
                    this.selectedTaskId = null;
                }
                
                await this._loadTasks();
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SCHEDULETASK', '删除任务失败', error);
                }
                this._showError('删除任务失败: ' + error.message);
            }
        },
        
        /**
         * 删除选中的任务（向后兼容）
         */
        _deleteSelectedTask: async function() {
            return this._deleteTask();
        },
        
        /**
         * 切换任务启用状态
         */
        _toggleTask: async function(taskId, enabled) {
            try {
                const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
                if (!ProcessManager) {
                    throw new Error("ProcessManager 不可用");
                }
                
                await ProcessManager.callKernelAPI(
                    this.pid,
                    'ScheduleTask.setEnabled',
                    [taskId, enabled]
                );
                
                this._showSuccess(enabled ? '任务已启用' : '任务已禁用');
                await this._loadTasks();
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SCHEDULETASK', '切换任务状态失败', error);
                }
                this._showError('操作失败: ' + error.message);
            }
        },
        
        /**
         * 注册右键菜单
         */
        _registerContextMenu: function() {
            if (typeof ContextMenuManager === 'undefined') {
                return;
            }
            
            this.contextMenuId = ContextMenuManager.registerContextMenu(this.pid, {
                context: 'window-content',
                selector: '.scheduletask-list-item',
                priority: 10,
                items: (targetElement) => {
                    // 从元素中获取任务ID
                    const taskId = targetElement.dataset.taskId;
                    if (!taskId) {
                        return [];
                    }
                    
                    // 查找任务
                    const task = this.tasks.find(t => t.id === taskId);
                    if (!task) {
                        return [];
                    }
                    
                    const taskName = (task.taskType === 'command' ? task.command : task.programName) || '未命名任务';
                    
                    return [
                        {
                            label: '编辑',
                            action: () => {
                                this._showEditDialog(task);
                            }
                        },
                        {
                            label: task.enabled ? '禁用' : '启用',
                            action: () => {
                                this._toggleTask(taskId, !task.enabled);
                            }
                        },
                        {
                            separator: true
                        },
                        {
                            label: '删除',
                            action: () => {
                                this._deleteTask(taskId);
                            }
                        }
                    ];
                }
            });
        },
        
        /**
         * 注册事件处理器
         */
        _registerEventHandlers: function() {
            // 暂无需要注册的事件
        },
        
        /**
         * 开始刷新定时器
         */
        _startRefreshTimer: function() {
            // 每30秒刷新一次任务列表
            this.refreshInterval = setInterval(() => {
                this._loadTasks();
            }, 30000);
        },
        
        /**
         * 显示成功消息
         */
        _showSuccess: async function(message) {
            if (typeof NotificationManager !== 'undefined') {
                try {
                    await NotificationManager.createNotification(this.pid, {
                        title: '成功',
                        content: message,
                        type: 'snapshot',
                        duration: 3000
                    });
                } catch (e) {
                    // 如果通知失败，使用 GUIManager 的对话框
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert(message, '成功', 'info');
                    }
                    // 如果都没有，静默失败（不显示弹窗）
                }
            } else {
                // 如果没有 NotificationManager，使用 GUIManager 的对话框
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(message, '成功', 'info');
                }
                // 如果都没有，静默失败（不显示弹窗）
            }
        },
        
        /**
         * 显示错误消息
         */
        _showError: async function(message) {
            if (typeof NotificationManager !== 'undefined') {
                try {
                    await NotificationManager.createNotification(this.pid, {
                        title: '错误',
                        content: message,
                        type: 'snapshot',
                        duration: 5000
                    });
                } catch (e) {
                    // 如果通知失败，使用 GUIManager 的对话框
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert(message, '错误', 'error');
                    }
                    // 如果都没有，静默失败（不显示弹窗）
                }
            } else {
                // 如果没有 NotificationManager，使用 GUIManager 的对话框
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(message, '错误', 'error');
                }
                // 如果都没有，静默失败（不显示弹窗）
            }
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.SCHEDULETASK = SCHEDULETASK;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.SCHEDULETASK = SCHEDULETASK;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

