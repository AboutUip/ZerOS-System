// ZerOS 任务管理器
// 负责所有动态进程任务的管理、资源监控和内核系统检测
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const TASKMANAGER = {
        pid: null,
        
        // 磁盘信息缓存
        _diskInfoCache: new Map(), // Map<diskName, { data, timestamp }>
        _diskInfoCacheTimeout: 30000, // 缓存30秒,
        window: null,
        windowState: null,
        updateInterval: null,
        detailPanel: null,
        
        // 内存管理引用
        _heap: null,
        _shed: null,
        
        // 多窗口管理
        _childWindows: new Map(), // Map<windowId, windowElement>
        _memoryViewWindows: new Map(), // Map<pid, windowElement> - 内存查看窗口
        _poolViewWindow: null, // POOL查看窗口
        _networkViewWindow: null, // 网络信息窗口
        
        // 数据键名（存储在内存中）
        _selectedPidKey: 'selectedPid',
        _filterExitedKey: 'filterExited',
        _logFilterKey: 'logFilter',
        
        // 搜索和排序（临时状态，不需要存储到内存）
        _searchQuery: '',
        _sortBy: 'status',
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 初始化内存管理
            this._initMemory(pid);
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'taskmanager-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 1000px;
                height: 700px;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('taskmanager');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '任务管理器',
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
            } else {
                // 降级方案：手动创建标题栏
                const titleBar = this._createTitleBar();
                this.window.appendChild(titleBar);
            }
            
            // 创建主内容区域
            const content = document.createElement('div');
            content.className = 'taskmanager-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
            `;
            
            // 创建左侧进程列表
            const processList = this._createProcessList();
            content.appendChild(processList);
            
            // 创建右侧详情面板
            this.detailPanel = this._createDetailPanel();
            content.appendChild(this.detailPanel);
            
            this.window.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 如果使用GUIManager，窗口已自动居中并获得焦点
            // 否则使用降级方案
            if (typeof GUIManager === 'undefined') {
                // 初始化窗口状态
                this.windowState = {
                    isFullscreen: false,
                    isDragging: false,
                    isResizing: false,
                    dragStartX: 0,
                    dragStartY: 0,
                    dragStartLeft: 0,
                    dragStartTop: 0
                };
                
                // 居中显示
                this.window.style.left = '50%';
                this.window.style.top = '50%';
                this.window.style.transform = 'translate(-50%, -50%)';
            } else {
                // 居中显示（GUIManager会自动处理）
                this.window.style.left = '50%';
                this.window.style.top = '50%';
                this.window.style.transform = 'translate(-50%, -50%)';
            }
            
            // 开始更新循环
            this._startUpdateLoop();
            
            // 初始更新
            this._updateProcessList();
            this._updateSystemInfo();
        },
        
        _createTitleBar: function() {
            // 降级方案：如果GUIManager不可用，手动创建标题栏
            const titleBar = document.createElement('div');
            titleBar.className = 'taskmanager-titlebar';
            titleBar.style.cssText = `
                height: 48px;
                background: transparent;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                backdrop-filter: blur(60px) saturate(180%);
                -webkit-backdrop-filter: blur(60px) saturate(180%);
                display: flex;
                align-items: center;
                padding: 0 20px;
                cursor: move;
                user-select: none;
            `;
            
            // 标题
            const title = document.createElement('div');
            title.textContent = '任务管理器';
            title.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: #e8ecf0;
                display: flex;
                align-items: center;
                gap: 10px;
            `;
            
            titleBar.appendChild(title);
            
            // 控制按钮
            const controls = document.createElement('div');
            controls.style.cssText = `
                margin-left: auto;
                display: flex;
                gap: 8px;
                align-items: center;
            `;
            
            // 关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.className = 'control-btn';
            closeBtn.innerHTML = '×';
            closeBtn.title = '关闭';
            closeBtn.style.cssText = `
                width: 32px;
                height: 32px;
                border: none;
                background: transparent;
                color: #e8ecf0;
                cursor: pointer;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                transition: all 0.2s;
            `;
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'rgba(255, 0, 0, 0.2)';
                closeBtn.style.color = '#ff4444';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'transparent';
                closeBtn.style.color = '#e8ecf0';
            });
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof ProcessManager !== 'undefined') {
                    ProcessManager.killProgram(this.pid);
                }
            });
            
            controls.appendChild(closeBtn);
            titleBar.appendChild(controls);
            
            return titleBar;
        },
        
        _createProcessList: function() {
            const container = document.createElement('div');
            container.className = 'taskmanager-process-list';
            container.style.cssText = `
                width: 400px;
                border-right: 1px solid rgba(108, 142, 255, 0.2);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 工具栏
            const toolbar = document.createElement('div');
            toolbar.style.cssText = `
                padding: 12px 16px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                display: flex;
                gap: 8px;
                align-items: center;
            `;
            
            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = '刷新';
            refreshBtn.style.cssText = `
                padding: 6px 12px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #e8ecf0;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            `;
            refreshBtn.addEventListener('mouseenter', () => {
                refreshBtn.style.background = 'rgba(108, 142, 255, 0.2)';
            });
            refreshBtn.addEventListener('mouseleave', () => {
                refreshBtn.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            refreshBtn.addEventListener('click', () => {
                this._updateProcessList();
            });
            
            // 查看POOL按钮
            const viewPoolBtn = document.createElement('button');
            viewPoolBtn.textContent = '查看POOL';
            viewPoolBtn.style.cssText = `
                padding: 6px 12px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #e8ecf0;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            `;
            viewPoolBtn.addEventListener('mouseenter', () => {
                viewPoolBtn.style.background = 'rgba(108, 142, 255, 0.2)';
            });
            viewPoolBtn.addEventListener('mouseleave', () => {
                viewPoolBtn.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            viewPoolBtn.addEventListener('click', () => {
                this._openPoolViewWindow();
            });
            
            // 查看网络按钮
            const viewNetworkBtn = document.createElement('button');
            viewNetworkBtn.textContent = '查看网络';
            viewNetworkBtn.style.cssText = `
                padding: 6px 12px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #e8ecf0;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            `;
            viewNetworkBtn.addEventListener('mouseenter', () => {
                viewNetworkBtn.style.background = 'rgba(108, 142, 255, 0.2)';
            });
            viewNetworkBtn.addEventListener('mouseleave', () => {
                viewNetworkBtn.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            viewNetworkBtn.addEventListener('click', () => {
                this._openNetworkViewWindow();
            });
            
            // 搜索框
            const searchContainer = document.createElement('div');
            searchContainer.style.cssText = `
                flex: 1;
                max-width: 200px;
                margin: 0 12px;
                position: relative;
            `;
            
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = '搜索进程...';
            searchInput.style.cssText = `
                width: 100%;
                padding: 6px 12px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.05);
                color: #e8ecf0;
                border-radius: 6px;
                font-size: 13px;
                outline: none;
            `;
            searchInput.addEventListener('input', (e) => {
                this._searchQuery = e.target.value.toLowerCase();
                this._updateProcessList();
            });
            searchInput.addEventListener('focus', () => {
                searchInput.style.borderColor = 'rgba(108, 142, 255, 0.5)';
                searchInput.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            searchInput.addEventListener('blur', () => {
                searchInput.style.borderColor = 'rgba(108, 142, 255, 0.3)';
                searchInput.style.background = 'rgba(108, 142, 255, 0.05)';
            });
            searchContainer.appendChild(searchInput);
            this.searchInput = searchInput;
            
            // 排序选择
            const sortContainer = document.createElement('div');
            sortContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
            `;
            
            const sortLabel = document.createElement('span');
            sortLabel.textContent = '排序:';
            sortLabel.style.cssText = `
                font-size: 12px;
                color: #aab2c0;
            `;
            
            const sortSelect = document.createElement('select');
            sortSelect.style.cssText = `
                padding: 4px 8px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #e8ecf0;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                outline: none;
            `;
            sortSelect.innerHTML = `
                <option value="status">按状态</option>
                <option value="name">按名称</option>
                <option value="pid">按PID</option>
                <option value="memory">按内存</option>
                <option value="time">按启动时间</option>
            `;
            sortSelect.value = this._sortBy || 'status';
            sortSelect.addEventListener('change', (e) => {
                this._sortBy = e.target.value;
                this._updateProcessList();
            });
            sortContainer.appendChild(sortLabel);
            sortContainer.appendChild(sortSelect);
            this.sortSelect = sortSelect;
            
            // 过滤已退出程序的开关
            const filterCheckbox = document.createElement('label');
            filterCheckbox.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                font-size: 12px;
                color: #aab2c0;
                margin-left: auto;
                user-select: none;
            `;
            
            const filterInput = document.createElement('input');
            filterInput.type = 'checkbox';
            filterInput.checked = this._getFilterExited();
            filterInput.style.cssText = `
                width: 16px;
                height: 16px;
                cursor: pointer;
            `;
            filterInput.addEventListener('change', (e) => {
                this._setFilterExited(e.target.checked);
                this._updateProcessList();
            });
            
            const filterLabel = document.createElement('span');
            filterLabel.textContent = '隐藏已退出';
            
            filterCheckbox.appendChild(filterInput);
            filterCheckbox.appendChild(filterLabel);
            
            toolbar.appendChild(refreshBtn);
            toolbar.appendChild(viewPoolBtn);
            toolbar.appendChild(viewNetworkBtn);
            toolbar.appendChild(searchContainer);
            toolbar.appendChild(sortContainer);
            toolbar.appendChild(filterCheckbox);
            container.appendChild(toolbar);
            
            // 进程列表
            const list = document.createElement('div');
            list.className = 'taskmanager-process-list-content';
            list.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            `;
            container.appendChild(list);
            
            // 存储列表引用
            this.processListElement = list;
            
            return container;
        },
        
        _createDetailPanel: function() {
            const panel = document.createElement('div');
            panel.className = 'taskmanager-detail-panel';
            panel.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 标签页
            const tabs = document.createElement('div');
            tabs.className = 'taskmanager-tabs';
            tabs.style.cssText = `
                display: flex;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                background: rgba(108, 142, 255, 0.05);
            `;
            
            const tabProcess = this._createTab('进程详情', true);
            const tabResources = this._createTab('资源监控', false);
            const tabSystem = this._createTab('系统信息', false);
            const tabLogs = this._createTab('程序日志', false);
            
            tabs.appendChild(tabProcess);
            tabs.appendChild(tabResources);
            tabs.appendChild(tabSystem);
            tabs.appendChild(tabLogs);
            
            panel.appendChild(tabs);
            
            // 内容区域
            const content = document.createElement('div');
            content.className = 'taskmanager-detail-content';
            content.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 20px;
            `;
            
            // 进程详情面板
            const processDetail = this._createProcessDetail();
            content.appendChild(processDetail);
            
            // 资源监控面板
            const resourceMonitor = this._createResourceMonitor();
            content.appendChild(resourceMonitor);
            
            // 系统信息面板
            const systemInfo = this._createSystemInfo();
            content.appendChild(systemInfo);
            
            // 程序日志面板
            const processLogs = this._createProcessLogs();
            content.appendChild(processLogs);
            
            panel.appendChild(content);
            
            // 存储引用
            this.detailContent = content;
            this.tabs = { process: tabProcess, resources: tabResources, system: tabSystem, logs: tabLogs };
            this.panels = { process: processDetail, resources: resourceMonitor, system: systemInfo, logs: processLogs };
            
            // 标签页切换
            tabProcess.addEventListener('click', () => this._switchTab('process'));
            tabResources.addEventListener('click', () => this._switchTab('resources'));
            tabSystem.addEventListener('click', () => this._switchTab('system'));
            tabLogs.addEventListener('click', () => this._switchTab('logs'));
            
            return panel;
        },
        
        _createTab: function(text, active) {
            const tab = document.createElement('div');
            tab.className = 'taskmanager-tab';
            tab.textContent = text;
            tab.style.cssText = `
                padding: 12px 20px;
                cursor: pointer;
                color: ${active ? '#6c8eff' : '#aab2c0'};
                border-bottom: 2px solid ${active ? '#6c8eff' : 'transparent'};
                transition: all 0.2s;
                font-size: 14px;
                font-weight: ${active ? '600' : '400'};
            `;
            tab.addEventListener('mouseenter', () => {
                if (!tab.classList.contains('active')) {
                    tab.style.color = '#8da6ff';
                }
            });
            tab.addEventListener('mouseleave', () => {
                if (!tab.classList.contains('active')) {
                    tab.style.color = '#aab2c0';
                }
            });
            if (active) {
                tab.classList.add('active');
            }
            return tab;
        },
        
        _switchTab: function(tabName) {
            // 更新标签页状态
            Object.keys(this.tabs).forEach(key => {
                const tab = this.tabs[key];
                const isActive = key === tabName;
                tab.classList.toggle('active', isActive);
                tab.style.color = isActive ? '#6c8eff' : '#aab2c0';
                tab.style.borderBottomColor = isActive ? '#6c8eff' : 'transparent';
                tab.style.fontWeight = isActive ? '600' : '400';
            });
            
            // 显示/隐藏面板
            Object.keys(this.panels).forEach(key => {
                const panel = this.panels[key];
                if (key === tabName) {
                    panel.style.display = 'block';
                    // 如果切换到日志标签页，更新日志
                    const selectedPid = this._getSelectedPid();
                    if (key === 'logs' && selectedPid) {
                        this._updateProcessLogs(selectedPid);
                    }
                    // 如果切换到资源监控标签页，更新资源监控
                    if (key === 'resources') {
                        this._updateResourceMonitor();
                    }
                    // 如果切换到系统信息标签页，更新系统信息
                    if (key === 'system') {
                        this._updateSystemInfo();
                    }
                } else {
                    panel.style.display = 'none';
                }
            });
        },
        
        _createProcessDetail: function() {
            const panel = document.createElement('div');
            panel.className = 'taskmanager-process-detail';
            panel.style.cssText = `
                display: block;
            `;
            
            const placeholder = document.createElement('div');
            placeholder.className = 'taskmanager-placeholder';
            placeholder.textContent = '选择一个进程查看详情';
            placeholder.style.cssText = `
                text-align: center;
                color: #aab2c0;
                padding: 40px;
                font-size: 14px;
            `;
            panel.appendChild(placeholder);
            
            this.processDetailPanel = panel;
            this.processDetailPlaceholder = placeholder;
            
            return panel;
        },
        
        _createResourceMonitor: function() {
            const panel = document.createElement('div');
            panel.className = 'taskmanager-resource-monitor';
            panel.style.cssText = `
                display: none;
                overflow-y: auto;
            `;
            
            // 内存使用图表
            const memorySection = document.createElement('div');
            memorySection.style.cssText = `
                margin-bottom: 24px;
            `;
            
            const memoryTitle = document.createElement('h3');
            memoryTitle.textContent = '内存使用';
            memoryTitle.style.cssText = `
                color: #e8ecf0;
                font-size: 16px;
                margin-bottom: 12px;
            `;
            memorySection.appendChild(memoryTitle);
            
            const memoryChart = document.createElement('div');
            memoryChart.className = 'taskmanager-memory-chart';
            memoryChart.style.cssText = `
                background: rgba(108, 142, 255, 0.05);
                border: 1px solid rgba(108, 142, 255, 0.2);
                border-radius: 8px;
                padding: 16px;
                min-height: 200px;
            `;
            memorySection.appendChild(memoryChart);
            
            panel.appendChild(memorySection);
            
            // 磁盘分区使用情况
            const diskSection = document.createElement('div');
            diskSection.style.cssText = `
                margin-bottom: 24px;
            `;
            
            const diskTitle = document.createElement('h3');
            diskTitle.textContent = '磁盘分区';
            diskTitle.style.cssText = `
                color: #e8ecf0;
                font-size: 16px;
                margin-bottom: 12px;
            `;
            diskSection.appendChild(diskTitle);
            
            const diskChart = document.createElement('div');
            diskChart.className = 'taskmanager-disk-chart';
            diskChart.style.cssText = `
                background: rgba(108, 142, 255, 0.05);
                border: 1px solid rgba(108, 142, 255, 0.2);
                border-radius: 8px;
                padding: 16px;
                min-height: 150px;
            `;
            diskSection.appendChild(diskChart);
            
            panel.appendChild(diskSection);
            
            // 存储引用
            this.resourceMonitorPanel = panel;
            this.memoryChart = memoryChart;
            this.diskChart = diskChart;
            
            return panel;
        },
        
        _createSystemInfo: function() {
            const panel = document.createElement('div');
            panel.className = 'taskmanager-system-info';
            panel.style.cssText = `
                display: none;
            `;
            
            const infoContainer = document.createElement('div');
            infoContainer.className = 'taskmanager-system-info-content';
            panel.appendChild(infoContainer);
            
            this.systemInfoPanel = panel;
            this.systemInfoContent = infoContainer;
            
            return panel;
        },
        
        _updateProcessList: function() {
            if (!this.processListElement) return;
            
            // 清空列表
            this.processListElement.innerHTML = '';
            
            // 获取所有进程
            if (typeof ProcessManager === 'undefined') {
                const error = document.createElement('div');
                error.textContent = 'ProcessManager 不可用';
                error.style.cssText = `
                    padding: 20px;
                    text-align: center;
                    color: #ff4444;
                `;
                this.processListElement.appendChild(error);
                return;
            }
            
            const processes = ProcessManager.listProcesses();
            
            if (processes.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = '没有运行的进程';
                empty.style.cssText = `
                    padding: 20px;
                    text-align: center;
                    color: #aab2c0;
                `;
                this.processListElement.appendChild(empty);
                return;
            }
            
            // 过滤已退出的程序（如果启用）
            let filteredProcesses = processes;
            const filterExited = this._getFilterExited();
            if (filterExited) {
                filteredProcesses = processes.filter(p => p.status !== 'exited');
            }
            
            // 搜索过滤
            if (this._searchQuery) {
                filteredProcesses = filteredProcesses.filter(p => {
                    const name = (p.programName || '').toLowerCase();
                    const pid = String(p.pid);
                    return name.includes(this._searchQuery) || pid.includes(this._searchQuery);
                });
            }
            
            if (filteredProcesses.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = this._searchQuery ? '未找到匹配的进程' : (filterExited ? '没有运行中的进程' : '没有进程');
                empty.style.cssText = `
                    padding: 20px;
                    text-align: center;
                    color: #aab2c0;
                `;
                this.processListElement.appendChild(empty);
                return;
            }
            
            // 排序
            const sortBy = this._sortBy || 'status';
            filteredProcesses.sort((a, b) => {
                switch (sortBy) {
                    case 'name':
                        const nameA = (a.programName || '').toLowerCase();
                        const nameB = (b.programName || '').toLowerCase();
                        return nameA.localeCompare(nameB);
                    case 'pid':
                        return a.pid - b.pid;
                    case 'memory':
                        const memA = this._getProcessMemorySize(a);
                        const memB = this._getProcessMemorySize(b);
                        return memB - memA; // 降序
                    case 'time':
                        return b.startTime - a.startTime; // 降序（最新的在前）
                    case 'status':
                    default:
                        const statusOrder = { 'running': 0, 'loading': 1, 'exited': 2 };
                        return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
                }
            });
            
            filteredProcesses.forEach(process => {
                const item = this._createProcessItem(process);
                this.processListElement.appendChild(item);
            });
        },
        
        _createProcessItem: function(process) {
            const item = document.createElement('div');
            item.className = 'taskmanager-process-item';
            item.dataset.pid = process.pid;
            item.style.cssText = `
                padding: 12px;
                margin-bottom: 8px;
                background: rgba(108, 142, 255, 0.05);
                border: 1px solid rgba(108, 142, 255, 0.2);
                border-radius: 8px;
                cursor: pointer;
            `;
            
            const selectedPid = this._getSelectedPid();
            if (selectedPid === process.pid) {
                item.style.background = 'rgba(108, 142, 255, 0.15)';
                item.style.borderColor = '#6c8eff';
            }
            
            item.addEventListener('mouseenter', () => {
                const selectedPid = this._getSelectedPid();
                if (selectedPid !== process.pid) {
                    item.style.background = 'rgba(108, 142, 255, 0.1)';
                }
            });
            item.addEventListener('mouseleave', () => {
                const selectedPid = this._getSelectedPid();
                if (selectedPid !== process.pid) {
                    item.style.background = 'rgba(108, 142, 255, 0.05)';
                }
            });
            
            item.addEventListener('click', () => {
                this._selectProcess(process.pid);
            });
            
            // 右键菜单
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showProcessContextMenu(e, process);
            });
            
            // 进程信息
            const name = document.createElement('div');
            name.style.cssText = `
                font-size: 14px;
                font-weight: 600;
                color: #e8ecf0;
                margin-bottom: 4px;
            `;
            name.textContent = process.programName || `PID ${process.pid}`;
            item.appendChild(name);
            
            const info = document.createElement('div');
            info.style.cssText = `
                font-size: 12px;
                color: #aab2c0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            
            const status = document.createElement('span');
            const statusColors = {
                'running': '#4ade80',
                'loading': '#fbbf24',
                'exited': '#aab2c0'
            };
            status.textContent = process.status === 'running' ? '运行中' : 
                                process.status === 'loading' ? '加载中' : '已退出';
            status.style.color = statusColors[process.status] || '#aab2c0';
            info.appendChild(status);
            
            // 尝试获取内存信息
            let memInfo = null;
            if (process.memoryInfo) {
                memInfo = process.memoryInfo;
                if (memInfo.programs && memInfo.programs.length > 0) {
                    memInfo = memInfo.programs[0];
                }
            } else {
                // 如果 process.memoryInfo 不存在，尝试直接获取
                if (typeof MemoryManager !== 'undefined') {
                    try {
                        // 对于Exploit程序，确保内存已分配
                        if (process.pid === 10000 && typeof KernelMemory !== 'undefined') {
                            try {
                                KernelMemory._ensureMemory();
                            } catch (e) {
                                // 忽略错误
                            }
                        }
                        const memoryResult = MemoryManager.checkMemory(process.pid);
                        if (memoryResult) {
                            if (memoryResult.programs && memoryResult.programs.length > 0) {
                                memInfo = memoryResult.programs[0];
                            } else if (memoryResult.pid === process.pid) {
                                memInfo = memoryResult;
                            }
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }
            }
            
            if (memInfo) {
                const memory = document.createElement('span');
                const heapSize = memInfo.totalHeapSize || 0;
                memory.textContent = this._formatBytes(heapSize);
                memory.style.cssText = `
                    font-size: 11px;
                    color: #8da6ff;
                `;
                info.appendChild(memory);
            }
            
            item.appendChild(info);
            
            // 添加终止按钮（对于运行中的非Exploit程序）
            if (!process.isExploit && process.status === 'running') {
                const killBtn = document.createElement('button');
                killBtn.textContent = '×';
                killBtn.title = '强制退出';
                killBtn.style.cssText = `
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: rgba(255, 68, 68, 0.1);
                    color: #ff4444;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 18px;
                    line-height: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    opacity: 0;
                `;
                killBtn.addEventListener('mouseenter', () => {
                    killBtn.style.background = 'rgba(255, 68, 68, 0.2)';
                    killBtn.style.opacity = '1';
                });
                killBtn.addEventListener('mouseleave', () => {
                    killBtn.style.background = 'rgba(255, 68, 68, 0.1)';
                    killBtn.style.opacity = '0';
                });
                killBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._killProcess(process.pid, process.programName);
                });
                item.style.position = 'relative';
                item.appendChild(killBtn);
                
                // 鼠标悬停时显示按钮
                item.addEventListener('mouseenter', () => {
                    killBtn.style.opacity = '1';
                });
                item.addEventListener('mouseleave', () => {
                    killBtn.style.opacity = '0';
                });
            }
            
            return item;
        },
        
        _killProcess: async function(pid, programName) {
            const process = ProcessManager.getProcessInfo(pid);
            if (!process) {
                // 进程不存在，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '任务管理器',
                            content: '进程不存在',
                            duration: 3000
                        });
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('TaskManager', `创建通知失败: ${e.message}`);
                        }
                    }
                }
                return;
            }
            
            // 如果是Exploit程序，不允许终止
            if (process.isExploit) {
                // 无法终止Exploit程序，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '任务管理器',
                            content: '无法终止Exploit程序',
                            duration: 3000
                        });
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('TaskManager', `创建通知失败: ${e.message}`);
                        }
                    }
                }
                return;
            }
            
            // 确认对话框
            let confirmed = false;
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                confirmed = await GUIManager.showConfirm(
                    `确定要强制退出程序 "${programName || `PID ${pid}`}" 吗？\n\n此操作将立即终止该程序，未保存的数据可能会丢失。`,
                    '确认强制退出',
                    'danger'
                );
            } else {
                confirmed = confirm(`确定要强制退出程序 "${programName || `PID ${pid}`}" 吗？\n\n此操作将立即终止该程序，未保存的数据可能会丢失。`);
            }
            
            if (!confirmed) {
                return;
            }
            
            try {
                // 调用ProcessManager强制终止程序（force=true）
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                    ProcessManager.killProgram(pid, true);  // force=true 表示强制退出
                    
                    // 如果终止的是当前选中的进程，清除选中状态
                    const selectedPid = this._getSelectedPid();
                    if (selectedPid === pid) {
                        this._setSelectedPid(null);
                        this._updateProcessDetail(null);
                        if (this.logsContent) {
                            this.logsContent.innerHTML = '<div style="text-align: center; color: #aab2c0; padding: 40px;">请选择一个进程查看日志</div>';
                        }
                    }
                    
                    // 延迟更新列表，确保进程状态已更新
                    setTimeout(() => {
                        this._updateProcessList();
                    }, 200);
                } else {
                    // ProcessManager 不可用，使用通知提示（不打断用户）
                    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                        try {
                            await NotificationManager.createNotification(this.pid, {
                                type: 'snapshot',
                                title: '任务管理器',
                                content: 'ProcessManager 不可用，无法终止进程',
                                duration: 3000
                            });
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('TaskManager', `创建通知失败: ${e.message}`);
                            }
                        }
                    }
                }
            } catch (e) {
                // 终止进程失败，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '任务管理器',
                            content: `终止进程失败: ${e.message}`,
                            duration: 4000
                        });
                    } catch (notifError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('TaskManager', `创建通知失败: ${notifError.message}`);
                        }
                    }
                }
                console.error('终止进程失败:', e);
            }
        },
        
        _selectProcess: function(pid) {
            this._setSelectedPid(pid);
            
            // 更新列表项样式
            const items = this.processListElement.querySelectorAll('.taskmanager-process-item');
            items.forEach(item => {
                const itemPid = parseInt(item.dataset.pid);
                if (itemPid === pid) {
                    item.style.background = 'rgba(108, 142, 255, 0.15)';
                    item.style.borderColor = '#6c8eff';
                } else {
                    item.style.background = 'rgba(108, 142, 255, 0.05)';
                    item.style.borderColor = 'rgba(108, 142, 255, 0.2)';
                }
            });
            
            // 更新详情面板
            this._updateProcessDetail(pid);
            
            // 如果当前在日志标签页，更新日志
            if (this.tabs && this.tabs.logs && this.tabs.logs.classList.contains('active')) {
                this._updateProcessLogs(pid);
            }
        },
        
        _updateProcessDetail: function(pid) {
            if (!this.processDetailPanel) return;
            
            const process = ProcessManager.getProcessInfo(pid);
            if (!process) {
                this.processDetailPlaceholder.textContent = '进程不存在';
                this.processDetailPlaceholder.style.display = 'block';
                return;
            }
            
            this.processDetailPlaceholder.style.display = 'none';
            
            // 清空现有内容（除了placeholder）
            const existing = this.processDetailPanel.querySelectorAll(':not(.taskmanager-placeholder)');
            existing.forEach(el => el.remove());
            
            // 创建详情内容
            const detail = document.createElement('div');
            detail.style.cssText = `
                color: #e8ecf0;
            `;
            
            // 基本信息
            const basicInfo = this._createInfoSection('基本信息', [
                { label: '进程ID', value: process.pid },
                { label: '程序名称', value: process.programName || '未知' },
                { label: '状态', value: process.status === 'running' ? '运行中' : 
                                    process.status === 'loading' ? '加载中' : '已退出' },
                { label: '启动时间', value: new Date(process.startTime).toLocaleString() },
                { label: '退出时间', value: process.exitTime ? new Date(process.exitTime).toLocaleString() : '未退出' },
            ]);
            detail.appendChild(basicInfo);
            
            // 内存信息 - 改进获取逻辑
            let memInfo = null;
            if (process.memoryInfo) {
                // process.memoryInfo 可能是 MemoryManager.checkMemory 的返回结果
                // 需要检查结构：可能是 { programs: [...] } 或直接是程序信息
                memInfo = process.memoryInfo;
                if (memInfo.programs && memInfo.programs.length > 0) {
                    memInfo = memInfo.programs[0];
                }
            } else {
                // 如果 process.memoryInfo 不存在，尝试直接获取
                if (typeof MemoryManager !== 'undefined') {
                    try {
                        // 对于Exploit程序，确保内存已分配
                        if (pid === 10000 && typeof KernelMemory !== 'undefined') {
                            try {
                                KernelMemory._ensureMemory();
                            } catch (e) {
                                // 静默处理，避免日志过多
                            }
                        }
                        const memoryResult = MemoryManager.checkMemory(pid);
                        if (memoryResult) {
                            if (memoryResult.programs && memoryResult.programs.length > 0) {
                                memInfo = memoryResult.programs[0];
                            } else if (memoryResult.pid === pid) {
                                memInfo = memoryResult;
                            }
                        }
                    } catch (e) {
                        // 静默处理，避免日志过多
                    }
                }
            }
            
            if (memInfo) {
                const memoryInfo = this._createInfoSection('内存信息', [
                    { label: '堆数量', value: (memInfo.heaps ? memInfo.heaps.length : 0).toString() },
                    { label: '堆总大小', value: this._formatBytes(memInfo.totalHeapSize || 0) },
                    { label: '堆已用', value: this._formatBytes(memInfo.totalHeapUsed || 0) },
                    { label: '堆空闲', value: this._formatBytes(memInfo.totalHeapFree || 0) },
                    { label: '堆使用率', value: memInfo.totalHeapSize > 0 ? 
                        ((memInfo.totalHeapUsed / memInfo.totalHeapSize * 100).toFixed(2) + '%') : '0%' },
                    { label: '栈数量', value: (memInfo.sheds ? memInfo.sheds.length : 0).toString() },
                    { label: '栈总大小', value: this._formatBytes(memInfo.totalShedSize || 0) },
                ]);
                detail.appendChild(memoryInfo);
            } else {
                // 显示内存信息不可用
                const memoryInfo = this._createInfoSection('内存信息', [
                    { label: '状态', value: '内存信息不可用' },
                    { label: '说明', value: '该进程可能未分配内存或内存已被释放' },
                ]);
                detail.appendChild(memoryInfo);
            }
            
            // 程序元数据信息
            let programMetadata = null;
            if (typeof ApplicationAssetManager !== 'undefined' && process.programName) {
                try {
                    const programInfo = ApplicationAssetManager.getProgramInfo(process.programName);
                    if (programInfo && programInfo.metadata) {
                        programMetadata = programInfo.metadata;
                    }
                } catch (e) {
                    // 静默处理
                }
            }
            
            if (programMetadata) {
                const metadataInfo = this._createInfoSection('程序信息', [
                    { label: '版本', value: programMetadata.version || '未知' },
                    { label: '作者', value: programMetadata.author || '未知' },
                    { label: '描述', value: programMetadata.description || '无描述' },
                    { label: '类型', value: programMetadata.type || '未知' },
                    { label: '支持多实例', value: programMetadata.allowMultipleInstances ? '是' : '否' },
                    { label: '常显任务栏', value: programMetadata.alwaysShowInTaskbar ? '是' : '否' },
                ]);
                detail.appendChild(metadataInfo);
            }
            
            // 权限信息
            if (typeof PermissionManager !== 'undefined') {
                const permissions = PermissionManager.getProgramPermissions(pid);
                if (permissions && permissions.length > 0) {
                    const permissionItems = permissions.map(perm => {
                        const level = PermissionManager.PERMISSION_LEVEL_MAP[perm] || PermissionManager.PERMISSION_LEVEL.NORMAL;
                        const levelText = level === PermissionManager.PERMISSION_LEVEL.NORMAL ? '普通' :
                                        level === PermissionManager.PERMISSION_LEVEL.SPECIAL ? '特殊' : '危险';
                        // 权限名称映射（简化版，因为 _getPermissionInfo 是私有方法）
                        const permNameMap = {
                            'SYSTEM_NOTIFICATION': '系统通知',
                            'KERNEL_DISK_READ': '读取文件',
                            'KERNEL_DISK_WRITE': '写入文件',
                            'KERNEL_DISK_DELETE': '删除文件',
                            'KERNEL_DISK_CREATE': '创建文件',
                            'KERNEL_DISK_LIST': '列出目录',
                            'KERNEL_MEMORY_READ': '读取内存',
                            'KERNEL_MEMORY_WRITE': '写入内存',
                            'NETWORK_ACCESS': '网络访问',
                            'GUI_WINDOW_CREATE': '创建窗口',
                            'GUI_WINDOW_MANAGE': '管理窗口',
                            'SYSTEM_STORAGE_READ': '读取系统存储',
                            'SYSTEM_STORAGE_WRITE': '写入系统存储',
                            'PROCESS_MANAGE': '管理进程',
                            'THEME_READ': '读取主题',
                            'THEME_WRITE': '修改主题',
                            'DESKTOP_MANAGE': '管理桌面'
                        };
                        const permName = permNameMap[perm] || perm;
                        return {
                            label: permName,
                            value: levelText,
                            permission: perm,
                            level: level
                        };
                    });
                    
                    const permissionSection = this._createPermissionSection('权限信息', permissionItems, pid);
                    detail.appendChild(permissionSection);
                } else {
                    const permissionInfo = this._createInfoSection('权限信息', [
                        { label: '状态', value: '该程序未声明或未获得任何权限' },
                    ]);
                    detail.appendChild(permissionInfo);
                }
            }
            
            // 其他信息
            const otherInfo = this._createInfoSection('其他信息', [
                { label: '是否Exploit', value: process.isExploit ? '是' : '否' },
                { label: '是否CLI', value: process.isCLI ? '是' : '否' },
                { label: '是否最小化', value: process.isMinimized ? '是' : '否' },
                { label: '脚本路径', value: process.scriptPath || '未知' },
            ]);
            detail.appendChild(otherInfo);
            
            // 程序行为记录详细显示
            if (process.actions && process.actions.length > 0) {
                const actionsSection = this._createActionsSection('行为记录', process.actions);
                detail.appendChild(actionsSection);
            }
            
            // 操作按钮区域
            const actionsSection = document.createElement('div');
            actionsSection.style.cssText = `
                margin-top: 24px;
                padding-top: 24px;
                border-top: 1px solid rgba(108, 142, 255, 0.2);
            `;
            
            const actionsTitle = document.createElement('h3');
            actionsTitle.textContent = '操作';
            actionsTitle.style.cssText = `
                color: #e8ecf0;
                font-size: 16px;
                margin-bottom: 12px;
            `;
            actionsSection.appendChild(actionsTitle);
            
            const buttonsContainer = document.createElement('div');
            buttonsContainer.style.cssText = `
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
            `;
            
            // 强制退出按钮（仅对运行中的非Exploit程序显示）
            if (!process.isExploit && process.status === 'running') {
                const killBtn = document.createElement('button');
                killBtn.textContent = '强制退出';
                killBtn.style.cssText = `
                    padding: 10px 20px;
                    border: 1px solid rgba(255, 68, 68, 0.5);
                    background: rgba(255, 68, 68, 0.1);
                    color: #ff4444;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: all 0.2s;
                `;
                killBtn.addEventListener('mouseenter', () => {
                    killBtn.style.background = 'rgba(255, 68, 68, 0.2)';
                    killBtn.style.borderColor = '#ff4444';
                });
                killBtn.addEventListener('mouseleave', () => {
                    killBtn.style.background = 'rgba(255, 68, 68, 0.1)';
                    killBtn.style.borderColor = 'rgba(255, 68, 68, 0.5)';
                });
                killBtn.addEventListener('click', () => {
                    this._killProcess(process.pid, process.programName);
                });
                buttonsContainer.appendChild(killBtn);
            }
            
            // 查看内存按钮
            const viewMemoryBtn = document.createElement('button');
            viewMemoryBtn.textContent = '查看内存';
            viewMemoryBtn.style.cssText = `
                padding: 10px 20px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #6c8eff;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s;
            `;
            viewMemoryBtn.addEventListener('mouseenter', () => {
                viewMemoryBtn.style.background = 'rgba(108, 142, 255, 0.2)';
            });
            viewMemoryBtn.addEventListener('mouseleave', () => {
                viewMemoryBtn.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            viewMemoryBtn.addEventListener('click', () => {
                this._openMemoryViewWindow(pid);
            });
            buttonsContainer.appendChild(viewMemoryBtn);
            
            // 刷新信息按钮
            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = '刷新信息';
            refreshBtn.style.cssText = `
                padding: 10px 20px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #6c8eff;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s;
            `;
            refreshBtn.addEventListener('mouseenter', () => {
                refreshBtn.style.background = 'rgba(108, 142, 255, 0.2)';
            });
            refreshBtn.addEventListener('mouseleave', () => {
                refreshBtn.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            refreshBtn.addEventListener('click', () => {
                this._updateProcessDetail(pid);
                this._updateProcessList();
            });
            buttonsContainer.appendChild(refreshBtn);
            
            actionsSection.appendChild(buttonsContainer);
            detail.appendChild(actionsSection);
            
            this.processDetailPanel.appendChild(detail);
        },
        
        _createInfoSection: function(title, items) {
            const section = document.createElement('div');
            section.style.cssText = `
                margin-bottom: 24px;
            `;
            
            const sectionTitle = document.createElement('h3');
            sectionTitle.textContent = title;
            sectionTitle.style.cssText = `
                color: #e8ecf0;
                font-size: 16px;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
            `;
            section.appendChild(sectionTitle);
            
            const list = document.createElement('div');
            items.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                `;
                
                const label = document.createElement('span');
                label.textContent = item.label + ':';
                label.style.cssText = `
                    color: #aab2c0;
                    font-size: 13px;
                `;
                
                const value = document.createElement('span');
                value.textContent = item.value;
                value.style.cssText = `
                    color: #e8ecf0;
                    font-size: 13px;
                    font-weight: 500;
                `;
                
                // 如果指定了 dataAttribute，添加到值元素
                if (item.dataAttribute) {
                    value.setAttribute(item.dataAttribute, '');
                }
                
                row.appendChild(label);
                row.appendChild(value);
                list.appendChild(row);
            });
            
            section.appendChild(list);
            return section;
        },
        
        _createPermissionSection: function(title, permissionItems, pid) {
            const section = document.createElement('div');
            section.style.cssText = `
                margin-bottom: 24px;
            `;
            
            const sectionTitle = document.createElement('h3');
            sectionTitle.textContent = title;
            sectionTitle.style.cssText = `
                color: #e8ecf0;
                font-size: 16px;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
            `;
            section.appendChild(sectionTitle);
            
            const list = document.createElement('div');
            permissionItems.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                `;
                
                const left = document.createElement('div');
                left.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    flex: 1;
                `;
                
                const label = document.createElement('span');
                label.textContent = item.label;
                label.style.cssText = `
                    color: #e8ecf0;
                    font-size: 13px;
                    font-weight: 500;
                `;
                
                const permCode = document.createElement('span');
                permCode.textContent = item.permission;
                permCode.style.cssText = `
                    color: #aab2c0;
                    font-size: 11px;
                    font-family: monospace;
                `;
                
                left.appendChild(label);
                left.appendChild(permCode);
                
                const right = document.createElement('div');
                right.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                
                const levelBadge = document.createElement('span');
                levelBadge.textContent = item.value;
                const levelColor = item.level === PermissionManager.PERMISSION_LEVEL.NORMAL ? '#4caf50' :
                                  item.level === PermissionManager.PERMISSION_LEVEL.SPECIAL ? '#ff9800' : '#f44336';
                levelBadge.style.cssText = `
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    background: ${levelColor}33;
                    color: ${levelColor};
                    border: 1px solid ${levelColor}66;
                `;
                
                // 撤销权限按钮（仅对非Exploit程序显示）
                const process = ProcessManager.getProcessInfo(pid);
                if (process && !process.isExploit) {
                    const revokeBtn = document.createElement('button');
                    revokeBtn.textContent = '撤销';
                    revokeBtn.title = '撤销此权限';
                    revokeBtn.style.cssText = `
                        padding: 4px 8px;
                        border: 1px solid rgba(255, 68, 68, 0.3);
                        background: rgba(255, 68, 68, 0.1);
                        color: #ff4444;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 11px;
                        transition: all 0.2s;
                    `;
                    revokeBtn.addEventListener('mouseenter', () => {
                        revokeBtn.style.background = 'rgba(255, 68, 68, 0.2)';
                    });
                    revokeBtn.addEventListener('mouseleave', () => {
                        revokeBtn.style.background = 'rgba(255, 68, 68, 0.1)';
                    });
                    revokeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm(`确定要撤销程序 ${process.programName} (PID: ${pid}) 的权限 "${item.label}" 吗？`)) {
                            PermissionManager.revokePermission(pid, item.permission);
                            PermissionManager.clearPermissionCache(pid);
                            this._updateProcessDetail(pid);
                            this._updateProcessList();
                        }
                    });
                    right.appendChild(revokeBtn);
                }
                
                right.appendChild(levelBadge);
                
                row.appendChild(left);
                row.appendChild(right);
                list.appendChild(row);
            });
            
            section.appendChild(list);
            return section;
        },
        
        _createActionsSection: function(title, actions) {
            const section = document.createElement('div');
            section.style.cssText = `
                margin-bottom: 24px;
            `;
            
            const sectionTitle = document.createElement('h3');
            sectionTitle.textContent = `${title} (${actions.length} 条)`;
            sectionTitle.style.cssText = `
                color: #e8ecf0;
                font-size: 16px;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
            `;
            section.appendChild(sectionTitle);
            
            const list = document.createElement('div');
            list.style.cssText = `
                max-height: 300px;
                overflow-y: auto;
            `;
            
            // 显示最近20条记录
            const recentActions = actions.slice(-20).reverse();
            recentActions.forEach((action, index) => {
                const row = document.createElement('div');
                row.style.cssText = `
                    padding: 10px;
                    margin-bottom: 8px;
                    background: rgba(108, 142, 255, 0.05);
                    border: 1px solid rgba(108, 142, 255, 0.1);
                    border-radius: 6px;
                `;
                
                const actionName = document.createElement('div');
                actionName.textContent = action.action || '未知操作';
                actionName.style.cssText = `
                    color: #e8ecf0;
                    font-size: 13px;
                    font-weight: 600;
                    margin-bottom: 4px;
                `;
                
                const actionTime = document.createElement('div');
                actionTime.textContent = action.timestamp ? new Date(action.timestamp).toLocaleString() : '未知时间';
                actionTime.style.cssText = `
                    color: #aab2c0;
                    font-size: 11px;
                    margin-bottom: 4px;
                `;
                
                if (action.details && typeof action.details === 'object') {
                    const details = document.createElement('div');
                    details.style.cssText = `
                        color: #aab2c0;
                        font-size: 11px;
                        font-family: monospace;
                        background: rgba(0, 0, 0, 0.2);
                        padding: 6px;
                        border-radius: 4px;
                        margin-top: 4px;
                        white-space: pre-wrap;
                        word-break: break-all;
                    `;
                    details.textContent = JSON.stringify(action.details, null, 2);
                    row.appendChild(details);
                }
                
                row.appendChild(actionName);
                row.appendChild(actionTime);
                list.appendChild(row);
            });
            
            if (actions.length > 20) {
                const moreInfo = document.createElement('div');
                moreInfo.textContent = `（仅显示最近 20 条，共 ${actions.length} 条记录）`;
                moreInfo.style.cssText = `
                    color: #aab2c0;
                    font-size: 11px;
                    text-align: center;
                    padding: 8px;
                    font-style: italic;
                `;
                list.appendChild(moreInfo);
            }
            
            section.appendChild(list);
            return section;
        },
        
        _openPermissionViewWindow: function(pid) {
            // 如果窗口已存在，直接显示
            if (this._permissionViewWindow) {
                if (typeof GUIManager !== 'undefined') {
                    GUIManager.focusWindow(this.pid);
                }
                return;
            }
            
            const process = ProcessManager.getProcessInfo(pid);
            if (!process) {
                alert('进程不存在');
                return;
            }
            
            // 创建权限查看窗口
            const window = document.createElement('div');
            window.className = 'taskmanager-permission-window';
            window.style.cssText = `
                width: 600px;
                height: 500px;
                background: var(--theme-background-elevated, rgba(15, 20, 30, 0.95));
                border: 1px solid rgba(108, 142, 255, 0.3);
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            `;
            
            // 标题栏
            const titleBar = document.createElement('div');
            titleBar.style.cssText = `
                padding: 16px 20px;
                background: transparent;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                backdrop-filter: blur(60px) saturate(180%);
                -webkit-backdrop-filter: blur(60px) saturate(180%);
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            
            const title = document.createElement('h3');
            title.textContent = `权限管理 - ${process.programName} (PID: ${pid})`;
            title.style.cssText = `
                color: #e8ecf0;
                font-size: 16px;
                font-weight: 600;
                margin: 0;
            `;
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.style.cssText = `
                width: 32px;
                height: 32px;
                border: none;
                background: transparent;
                color: #e8ecf0;
                cursor: pointer;
                border-radius: 6px;
                font-size: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            `;
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'rgba(255, 68, 68, 0.2)';
                closeBtn.style.color = '#ff4444';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'transparent';
                closeBtn.style.color = '#e8ecf0';
            });
            closeBtn.addEventListener('click', () => {
                window.remove();
                this._permissionViewWindow = null;
            });
            
            titleBar.appendChild(title);
            titleBar.appendChild(closeBtn);
            
            // 内容区域
            const content = document.createElement('div');
            content.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 20px;
            `;
            
            // 获取权限信息
            if (typeof PermissionManager !== 'undefined') {
                const permissions = PermissionManager.getProgramPermissions(pid);
                if (permissions && permissions.length > 0) {
                    const permissionItems = permissions.map(perm => {
                        const level = PermissionManager.PERMISSION_LEVEL_MAP[perm] || PermissionManager.PERMISSION_LEVEL.NORMAL;
                        const levelText = level === PermissionManager.PERMISSION_LEVEL.NORMAL ? '普通' :
                                        level === PermissionManager.PERMISSION_LEVEL.SPECIAL ? '特殊' : '危险';
                        // 权限名称映射
                        const permNameMap = {
                            'SYSTEM_NOTIFICATION': '系统通知',
                            'KERNEL_DISK_READ': '读取文件',
                            'KERNEL_DISK_WRITE': '写入文件',
                            'KERNEL_DISK_DELETE': '删除文件',
                            'KERNEL_DISK_CREATE': '创建文件',
                            'KERNEL_DISK_LIST': '列出目录',
                            'KERNEL_MEMORY_READ': '读取内存',
                            'KERNEL_MEMORY_WRITE': '写入内存',
                            'NETWORK_ACCESS': '网络访问',
                            'GUI_WINDOW_CREATE': '创建窗口',
                            'GUI_WINDOW_MANAGE': '管理窗口',
                            'SYSTEM_STORAGE_READ': '读取系统存储',
                            'SYSTEM_STORAGE_WRITE': '写入系统存储',
                            'PROCESS_MANAGE': '管理进程',
                            'THEME_READ': '读取主题',
                            'THEME_WRITE': '修改主题',
                            'DESKTOP_MANAGE': '管理桌面'
                        };
                        const permName = permNameMap[perm] || perm;
                        return { permission: perm, name: permName, description: '', level: level, levelText: levelText };
                    });
                    
                    const permissionSection = this._createPermissionSection('已授予权限', permissionItems, pid);
                    content.appendChild(permissionSection);
                } else {
                    const empty = document.createElement('div');
                    empty.textContent = '该程序未获得任何权限';
                    empty.style.cssText = `
                        text-align: center;
                        color: #aab2c0;
                        padding: 40px;
                        font-size: 14px;
                    `;
                    content.appendChild(empty);
                }
            } else {
                const error = document.createElement('div');
                error.textContent = '权限管理器不可用';
                error.style.cssText = `
                    text-align: center;
                    color: #ff4444;
                    padding: 40px;
                    font-size: 14px;
                `;
                content.appendChild(error);
            }
            
            window.appendChild(titleBar);
            window.appendChild(content);
            
            // 添加到主窗口
            this.window.appendChild(window);
            this._permissionViewWindow = window;
            
            // 居中显示
            window.style.position = 'absolute';
            window.style.left = '50%';
            window.style.top = '50%';
            window.style.transform = 'translate(-50%, -50%)';
            window.style.zIndex = '10001';
        },
        
        _updateResourceMonitor: function() {
            if (!this.memoryChart) return;
            
            // 获取所有进程的内存信息
            const processes = ProcessManager.listProcesses();
            let totalHeap = 0;
            let totalShed = 0;
            
            // 调试：记录获取到的内存信息
            const debugInfo = [];
            
            processes.forEach(process => {
                let memInfo = null;
                
                // 尝试从 process.memoryInfo 获取
                if (process.memoryInfo) {
                    memInfo = process.memoryInfo;
                    if (memInfo.programs && memInfo.programs.length > 0) {
                        memInfo = memInfo.programs[0];
                    }
                } else {
                    // 如果 process.memoryInfo 不存在，尝试直接获取
                    if (typeof MemoryManager !== 'undefined') {
                        try {
                            // 对于Exploit程序，确保内存已分配
                            if (process.pid === 10000 && typeof KernelMemory !== 'undefined') {
                                try {
                                    KernelMemory._ensureMemory();
                                } catch (e) {
                                    // 忽略错误
                                }
                            }
                            const memoryResult = MemoryManager.checkMemory(process.pid);
                            if (memoryResult) {
                                // MemoryManager.checkMemory 返回 { totalPrograms, programs: [...] }
                                if (memoryResult.programs && memoryResult.programs.length > 0) {
                                    memInfo = memoryResult.programs[0];
                                } else if (memoryResult.pid === process.pid) {
                                    // 如果直接返回程序信息（不应该发生，但兼容处理）
                                    memInfo = memoryResult;
                                }
                            }
                        } catch (e) {
                            // 静默处理，避免日志过多
                            debugInfo.push(`PID ${process.pid}: 获取失败 - ${e.message}`);
                        }
                    }
                }
                
                if (memInfo) {
                    // 确保使用数字值，而不是字符串
                    const heapSize = typeof memInfo.totalHeapSize === 'number' ? memInfo.totalHeapSize : 
                                    (typeof memInfo.totalHeapSize === 'string' ? parseInt(memInfo.totalHeapSize, 10) || 0 : 0);
                    const shedSize = typeof memInfo.totalShedSize === 'number' ? memInfo.totalShedSize : 
                                   (typeof memInfo.totalShedSize === 'string' ? parseInt(memInfo.totalShedSize, 10) || 0 : 0);
                    totalHeap += heapSize;
                    totalShed += shedSize;
                    debugInfo.push(`PID ${process.pid} (${process.programName}): 堆=${heapSize}, 栈=${shedSize}`);
                } else {
                    debugInfo.push(`PID ${process.pid} (${process.programName}): 无内存信息`);
                }
            });
            
            // 移除调试输出，避免日志过多
            
            // 更新内存图表
            this.memoryChart.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #aab2c0; font-size: 13px;">堆内存</span>
                        <span style="color: #6c8eff; font-size: 14px; font-weight: 600;">${this._formatBytes(totalHeap)}</span>
                    </div>
                    <div style="height: 8px; background: rgba(108, 142, 255, 0.1); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${Math.min(100, (totalHeap / (1024 * 1024 * 100)) * 100)}%; background: linear-gradient(90deg, #6c8eff, #8da6ff); transition: width 0.3s;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #aab2c0; font-size: 13px;">栈内存</span>
                        <span style="color: #6c8eff; font-size: 14px; font-weight: 600;">${this._formatBytes(totalShed)}</span>
                    </div>
                    <div style="height: 8px; background: rgba(108, 142, 255, 0.1); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${Math.min(100, (totalShed / (1024 * 1024 * 50)) * 100)}%; background: linear-gradient(90deg, #6c8eff, #8da6ff); transition: width 0.3s;"></div>
                    </div>
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(108, 142, 255, 0.1);">
                        <div style="color: #aab2c0; font-size: 12px; margin-bottom: 8px;">进程内存详情</div>
                        <div style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;">
                            ${processes.map(p => {
                                let pmemInfo = null;
                                if (p.memoryInfo) {
                                    pmemInfo = p.memoryInfo;
                                    if (pmemInfo.programs && pmemInfo.programs.length > 0) {
                                        pmemInfo = pmemInfo.programs[0];
                                    }
                                } else if (typeof MemoryManager !== 'undefined') {
                                    try {
                                        if (p.pid === 10000 && typeof KernelMemory !== 'undefined') {
                                            try { KernelMemory._ensureMemory(); } catch(e) {}
                                        }
                                        const mr = MemoryManager.checkMemory(p.pid);
                                        if (mr && mr.programs && mr.programs.length > 0) {
                                            pmemInfo = mr.programs[0];
                                        }
                                    } catch(e) {}
                                }
                                const pheap = pmemInfo ? (typeof pmemInfo.totalHeapSize === 'number' ? pmemInfo.totalHeapSize : parseInt(pmemInfo.totalHeapSize, 10) || 0) : 0;
                                return `<div style="display: flex; justify-content: space-between; font-size: 11px; color: #aab2c0;">
                                    <span>${p.programName || `PID ${p.pid}`}</span>
                                    <span style="color: #8da6ff;">${this._formatBytes(pheap)}</span>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
            
            // 更新磁盘分区图表（从 PHP 服务实时获取）
            if (this.diskChart) {
                this._updateDiskChart();
            }
        },
        
        _updateSystemInfo: function() {
            if (!this.systemInfoContent) return;
            
            this.systemInfoContent.innerHTML = '';
            
            // 内核模块检查
            const kernelModules = this._checkKernelModules();
            const modulesSection = this._createInfoSection('内核模块', kernelModules);
            this.systemInfoContent.appendChild(modulesSection);
            
            // 系统资源
            const systemResources = this._getSystemResources();
            const resourcesSection = this._createInfoSection('系统资源', systemResources);
            this.systemInfoContent.appendChild(resourcesSection);
            
            // 文件系统
            const filesystem = this._getFilesystemInfo();
            const fsSection = this._createInfoSection('文件系统', filesystem);
            this.systemInfoContent.appendChild(fsSection);
        },
        
        _checkKernelModules: function() {
            const modules = [];
            
            // 检查各个内核模块
            const moduleChecks = [
                { name: 'ProcessManager', obj: typeof ProcessManager !== 'undefined' ? ProcessManager : null },
                { name: 'MemoryManager', obj: typeof MemoryManager !== 'undefined' ? MemoryManager : null },
                { name: 'Disk', obj: typeof Disk !== 'undefined' ? Disk : null },
                { name: 'POOL', obj: typeof POOL !== 'undefined' ? POOL : null },
                { name: 'KernelMemory', obj: typeof KernelMemory !== 'undefined' ? KernelMemory : null },
                { name: 'EventManager', obj: typeof EventManager !== 'undefined' ? EventManager : null },
                { name: 'ApplicationAssetManager', obj: typeof ApplicationAssetManager !== 'undefined' ? ApplicationAssetManager : null },
            ];
            
            moduleChecks.forEach(check => {
                modules.push({
                    label: check.name,
                    value: check.obj ? '✓ 已加载' : '✗ 未加载',
                    style: check.obj ? 'color: #4ade80;' : 'color: #ff4444;'
                });
            });
            
            return modules;
        },
        
        _getSystemResources: function() {
            const resources = [];
            
            // 进程数量
            const processes = ProcessManager.listProcesses();
            const runningCount = processes.filter(p => p.status === 'running').length;
            resources.push({ label: '运行中进程', value: `${runningCount} / ${processes.length}` });
            
            // 总内存使用
            let totalHeap = 0;
            let totalShed = 0;
            processes.forEach(process => {
                let memInfo = null;
                
                // 尝试从 process.memoryInfo 获取
                if (process.memoryInfo) {
                    memInfo = process.memoryInfo;
                    if (memInfo.programs && memInfo.programs.length > 0) {
                        memInfo = memInfo.programs[0];
                    }
                } else {
                    // 如果 process.memoryInfo 不存在，尝试直接获取
                    if (typeof MemoryManager !== 'undefined') {
                        try {
                            // 对于Exploit程序，确保内存已分配
                            if (process.pid === 10000 && typeof KernelMemory !== 'undefined') {
                                try {
                                    KernelMemory._ensureMemory();
                                } catch (e) {
                                    // 忽略错误
                                }
                            }
                            const memoryResult = MemoryManager.checkMemory(process.pid);
                            if (memoryResult) {
                                if (memoryResult.programs && memoryResult.programs.length > 0) {
                                    memInfo = memoryResult.programs[0];
                                } else if (memoryResult.pid === process.pid) {
                                    memInfo = memoryResult;
                                }
                            }
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                }
                
                if (memInfo) {
                    totalHeap += memInfo.totalHeapSize || 0;
                    totalShed += memInfo.totalShedSize || 0;
                }
            });
            resources.push({ label: '总堆内存', value: this._formatBytes(totalHeap) });
            resources.push({ label: '总栈内存', value: this._formatBytes(totalShed) });
            
            return resources;
        },
        
        _getFilesystemInfo: function() {
            const info = [];
            
            if (typeof Disk !== 'undefined') {
                info.push({ label: '磁盘状态', value: Disk.canUsed ? '✓ 可用' : '✗ 不可用' });
                
                if (Disk.canUsed && Disk.diskSeparateMap) {
                    // 获取所有分区（不依赖 initialized 属性，因为分区可能已经存在但还未完全初始化）
                    const allPartitions = [];
                    Disk.diskSeparateMap.forEach((nodeTree, partitionName) => {
                        if (nodeTree) {
                            allPartitions.push(partitionName);
                        }
                    });
                    
                    // 如果 diskSeparateMap 为空，尝试从 diskSeparateSize 获取分区列表
                    if (allPartitions.length === 0 && Disk.diskSeparateSize) {
                        Disk.diskSeparateSize.forEach((size, partitionName) => {
                            allPartitions.push(partitionName);
                        });
                    }
                    
                    info.push({ label: '分区数量', value: allPartitions.length.toString() });
                    info.push({ label: '分区列表', value: allPartitions.length > 0 ? allPartitions.join(', ') : '无' });
                    
                    // 显示每个分区的详细信息（从 PHP 服务实时获取）
                    if (allPartitions.length > 0) {
                        // 先显示"加载中..."，然后异步更新
                        allPartitions.forEach(partitionName => {
                            const partitionLabel = partitionName === 'D:' ? `${partitionName} (系统盘)` : partitionName;
                            info.push({ 
                                label: partitionLabel, 
                                value: '加载中...',
                                dataAttribute: 'data-disk-info' // 标记为磁盘信息，用于后续更新
                            });
                        });
                        
                        // 异步更新磁盘信息（使用缓存）
                        (async () => {
                            try {
                                const diskInfos = await Promise.all(
                                    allPartitions.map(partitionName => this._getRealDiskInfo(partitionName, false))
                                );
                                
                                // 更新系统信息面板中的磁盘信息
                                if (this.systemInfoContent) {
                                    const diskInfoElements = this.systemInfoContent.querySelectorAll('[data-disk-info]');
                                    diskInfos.forEach((diskInfo, index) => {
                                        if (diskInfoElements[index]) {
                                            const usedPercent = diskInfo.total > 0 ? ((diskInfo.used / diskInfo.total) * 100).toFixed(1) : '0.0';
                                            diskInfoElements[index].textContent = `${this._formatBytes(diskInfo.used)} / ${this._formatBytes(diskInfo.total)} (${usedPercent}%)`;
                                        }
                                    });
                                }
                            } catch (e) {
                                // 如果获取失败，更新为错误信息
                                if (this.systemInfoContent) {
                                    const diskInfoElements = this.systemInfoContent.querySelectorAll('[data-disk-info]');
                                    diskInfoElements.forEach(el => {
                                        if (el.textContent === '加载中...') {
                                            el.textContent = '获取失败';
                                            el.style.color = '#ff4444';
                                        }
                                    });
                                }
                            }
                        })();
                    }
                }
            } else {
                info.push({ label: '磁盘状态', value: '✗ Disk模块未加载' });
            }
            
            return info;
        },
        
        /**
         * 从 PHP 服务获取真实的磁盘信息（带缓存）
         * @param {string} diskName 磁盘名称（如 'C:' 或 'D:'）
         * @param {boolean} forceRefresh 是否强制刷新缓存（默认false）
         * @returns {Promise<Object>} 磁盘信息对象 { name, total, used, free }
         */
        _getRealDiskInfo: async function(diskName, forceRefresh = false) {
            // 检查缓存
            if (!forceRefresh && this._diskInfoCache.has(diskName)) {
                const cached = this._diskInfoCache.get(diskName);
                const now = Date.now();
                // 如果缓存未过期，直接返回缓存数据
                if (now - cached.timestamp < this._diskInfoCacheTimeout) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('TASKMANAGER', `使用缓存的磁盘信息: ${diskName}`);
                    }
                    return cached.data;
                }
            }
            
            const disk = diskName.replace(':', ''); // 移除冒号，得到 C 或 D
            try {
                const url = new URL('/system/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'get_disk_info');
                url.searchParams.set('disk', disk);
                
                const response = await fetch(url);
                const result = await response.json();
                
                if (result.status === 'success' && result.data) {
                    const data = result.data;
                    // 使用 dirSize 作为已用空间（这是真实的目录大小）
                    // 如果 dirSize 为 0 或不存在，使用 usedSpace 作为备用
                    const used = data.dirSize && data.dirSize > 0 ? data.dirSize : (data.usedSpace || 0);
                    // 使用配置的分区大小作为总大小，如果没有配置则使用 PHP 返回的 totalSize
                    const total = (typeof Disk !== 'undefined' && Disk.diskSeparateSize) 
                        ? (Disk.diskSeparateSize.get(diskName) || data.totalSize || 0)
                        : (data.totalSize || 0);
                    const free = total - used;
                    
                    const diskInfo = {
                        name: diskName,
                        total: total,
                        used: used,
                        free: free
                    };
                    
                    // 更新缓存
                    this._diskInfoCache.set(diskName, {
                        data: diskInfo,
                        timestamp: Date.now()
                    });
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('TASKMANAGER', `从 PHP 服务获取磁盘 ${diskName} 信息成功: ${this._formatBytes(used)} / ${this._formatBytes(total)}`);
                    }
                    
                    return diskInfo;
                }
            } catch (e) {
                // 如果 PHP 服务不可用，回退到使用内存中的数据
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('TASKMANAGER', `从 PHP 服务获取磁盘 ${diskName} 信息失败，使用内存数据: ${e.message}`);
                }
            }
            
            // 回退方案：使用内存中的数据
            if (typeof Disk !== 'undefined' && Disk.diskSeparateSize) {
                const total = Disk.diskSeparateSize.get(diskName) || 0;
                const used = (Disk.diskUsedMap && Disk.diskUsedMap.get(diskName)) || 0;
                const free = (Disk.diskFreeMap && Disk.diskFreeMap.get(diskName)) || (total - used);
                
                return {
                    name: diskName,
                    total: total,
                    used: used,
                    free: free
                };
            }
            
            // 如果 Disk 模块也不可用，使用默认值
            const defaultTotal = diskName === 'C:' ? 1024 * 1024 * 1024 * 1 : 
                                 (diskName === 'D:' ? 1024 * 1024 * 1024 * 2 : 0);
            return {
                name: diskName,
                total: defaultTotal,
                used: 0,
                free: defaultTotal
            };
        },
        
        /**
         * 更新磁盘分区图表（从 PHP 服务实时获取）
         */
        _updateDiskChart: async function() {
            if (!this.diskChart) return;
            
            let diskHtml = '<div style="display: flex; flex-direction: column; gap: 12px;">';
            
            if (typeof Disk !== 'undefined' && Disk.canUsed && Disk.diskSeparateMap) {
                // 获取所有分区（不依赖 initialized 属性）
                const allPartitions = [];
                Disk.diskSeparateMap.forEach((nodeTree, partitionName) => {
                    if (nodeTree) {
                        allPartitions.push(partitionName);
                    }
                });
                
                // 如果 diskSeparateMap 为空，尝试从 diskSeparateSize 获取分区列表
                if (allPartitions.length === 0 && Disk.diskSeparateSize) {
                    Disk.diskSeparateSize.forEach((size, partitionName) => {
                        allPartitions.push(partitionName);
                    });
                }
                
                if (allPartitions.length > 0) {
                    // 从 PHP 服务获取所有分区的磁盘信息（使用缓存）
                    try {
                        const diskInfos = await Promise.all(
                            allPartitions.map(partitionName => this._getRealDiskInfo(partitionName, false))
                        );
                        
                        diskInfos.forEach(info => {
                            const usedPercent = info.total > 0 ? ((info.used / info.total) * 100) : 0;
                            const partitionLabel = info.name === 'D:' ? `${info.name} (系统盘)` : info.name;
                            
                            diskHtml += `
                                <div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                        <span style="color: #aab2c0; font-size: 13px;">${partitionLabel}</span>
                                        <span style="color: #6c8eff; font-size: 14px; font-weight: 600;">${this._formatBytes(info.used)} / ${this._formatBytes(info.total)}</span>
                                    </div>
                                    <div style="height: 8px; background: rgba(108, 142, 255, 0.1); border-radius: 4px; overflow: hidden;">
                                        <div style="height: 100%; width: ${Math.min(100, usedPercent)}%; background: linear-gradient(90deg, #6c8eff, #8da6ff); transition: width 0.3s;"></div>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                                        <span style="color: #8da6ff; font-size: 11px;">已用: ${this._formatBytes(info.used)}</span>
                                        <span style="color: #aab2c0; font-size: 11px;">空闲: ${this._formatBytes(info.free)}</span>
                                        <span style="color: #6c8eff; font-size: 11px;">${usedPercent.toFixed(1)}%</span>
                                    </div>
                                </div>
                            `;
                        });
                    } catch (e) {
                        // 如果获取失败，显示错误信息
                        diskHtml += `<div style="color: #ff4444; font-size: 13px; text-align: center; padding: 20px;">获取磁盘信息失败: ${e.message}</div>`;
                    }
                } else {
                    diskHtml += '<div style="color: #aab2c0; font-size: 13px; text-align: center; padding: 20px;">暂无已初始化的分区</div>';
                }
            } else {
                diskHtml += '<div style="color: #aab2c0; font-size: 13px; text-align: center; padding: 20px;">磁盘未初始化或不可用</div>';
            }
            
            diskHtml += '</div>';
            this.diskChart.innerHTML = diskHtml;
        },
        
        _showProcessContextMenu: function(e, process) {
            // 创建右键菜单
            const menu = document.createElement('div');
            menu.className = 'taskmanager-context-menu';
            menu.style.cssText = `
                position: fixed;
                left: ${e.clientX}px;
                top: ${e.clientY}px;
                background: linear-gradient(180deg, rgba(26, 31, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 100%);
                border: 1px solid rgba(108, 142, 255, 0.2);
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                padding: 8px;
                z-index: 100000;
                min-width: 180px;
                backdrop-filter: blur(20px);
            `;
            
            // 菜单项
            const items = [
                { text: '查看详情', action: () => { this._selectProcess(process.pid); this._switchTab('process'); } },
                { text: '刷新信息', action: () => { this._updateProcessList(); this._updateProcessDetail(process.pid); } },
            ];
            
            // 如果不是Exploit程序，添加终止选项
            if (!process.isExploit && process.status === 'running') {
                items.push({ 
                    text: '强制退出', 
                    action: () => { 
                        this._killProcess(process.pid, process.programName);
                    },
                    danger: true
                });
            }
            
            items.forEach(item => {
                const menuItem = document.createElement('div');
                menuItem.textContent = item.text;
                menuItem.style.cssText = `
                    padding: 10px 16px;
                    cursor: pointer;
                    color: ${item.danger ? '#ff4444' : '#e8ecf0'};
                    border-radius: 6px;
                    font-size: 13px;
                    transition: all 0.2s;
                `;
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.background = item.danger ? 'rgba(255, 68, 68, 0.2)' : 'rgba(108, 142, 255, 0.1)';
                });
                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.background = 'transparent';
                });
                menuItem.addEventListener('click', () => {
                    item.action();
                    document.body.removeChild(menu);
                });
                menu.appendChild(menuItem);
            });
            
            document.body.appendChild(menu);
            
            // 点击外部关闭
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    document.body.removeChild(menu);
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeMenu);
            }, 0);
        },
        
        _toggleFullscreen: function() {
            // 使用GUIManager的最大化功能
            if (typeof GUIManager !== 'undefined') {
                GUIManager.toggleMaximize(this.pid);
            } else {
                // 降级方案
                if (this.windowState.isFullscreen) {
                    // 还原
                    this.window.style.width = '1000px';
                    this.window.style.height = '700px';
                    this.window.style.left = '50%';
                    this.window.style.top = '50%';
                    this.window.style.transform = 'translate(-50%, -50%)';
                    this.windowState.isFullscreen = false;
                } else {
                    // 全屏
                    const guiContainer = document.getElementById('gui-container');
                    if (guiContainer) {
                        const rect = guiContainer.getBoundingClientRect();
                        this.window.style.width = rect.width + 'px';
                        this.window.style.height = rect.height + 'px';
                        this.window.style.left = '0';
                        this.window.style.top = '0';
                        this.window.style.transform = 'none';
                    } else {
                        this.window.style.width = '100%';
                        this.window.style.height = '100%';
                        this.window.style.left = '0';
                        this.window.style.top = '0';
                        this.window.style.transform = 'none';
                    }
                    this.windowState.isFullscreen = true;
                }
            }
        },
        
        _startUpdateLoop: function() {
            // 每2秒更新一次
            this.updateInterval = setInterval(() => {
                this._updateProcessList();
                this._updateResourceMonitor();
                this._updateSystemInfo();
                const selectedPid = this._getSelectedPid();
                if (selectedPid) {
                    this._updateProcessDetail(selectedPid);
                    // 如果当前在日志标签页，也更新日志
                    if (this.tabs && this.tabs.logs && this.tabs.logs.classList.contains('active')) {
                        this._updateProcessLogs(selectedPid);
                    }
                }
                
                // 更新所有打开的内存查看窗口
                this._memoryViewWindows.forEach((window, pid) => {
                    const tabs = window.querySelectorAll('div[style*="padding: 12px 20px"]');
                    const activeTab = Array.from(tabs).find(t => t.classList.contains('active'));
                    if (activeTab) {
                        const type = activeTab.textContent.includes('堆') ? 'heap' : 'shed';
                        this._updateMemoryViewWindow(pid, type);
                    }
                });
                
                // POOL和网络信息窗口是快照，不需要更新
            }, 2000);
            
            // 监听进程变化（如果ProcessManager支持事件）
            this._setupProcessListeners();
            
            // 监听网络状态变化
            this._setupNetworkListeners();
        },
        
        /**
         * 设置进程监听器
         */
        _setupProcessListeners: function() {
            // 如果ProcessManager有事件系统，可以在这里添加监听
            // 目前通过定时更新来实现，未来可以优化为事件驱动
        },
        
        /**
         * 设置网络监听器
         */
        _setupNetworkListeners: function() {
            if (typeof NetworkManager !== 'undefined' && NetworkManager.addEventListener) {
                // 网络信息窗口是快照，不需要监听变化
            }
        },
        
        _createProcessLogs: function() {
            const panel = document.createElement('div');
            panel.className = 'taskmanager-process-logs';
            panel.style.cssText = `
                display: none;
                flex-direction: column;
                height: 100%;
            `;
            
            // 工具栏
            const toolbar = document.createElement('div');
            toolbar.style.cssText = `
                padding: 12px 16px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                display: flex;
                gap: 8px;
                align-items: center;
                flex-shrink: 0;
            `;
            
            // 日志过滤选择器
            const filterLabel = document.createElement('span');
            filterLabel.textContent = '过滤:';
            filterLabel.style.cssText = `
                font-size: 12px;
                color: #aab2c0;
                margin-right: 8px;
            `;
            
            const filterSelect = document.createElement('select');
            filterSelect.style.cssText = `
                padding: 4px 8px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #e8ecf0;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
            `;
            filterSelect.innerHTML = `
                <option value="all">全部</option>
                <option value="error">错误</option>
                <option value="warning">警告</option>
                <option value="info">信息</option>
            `;
            filterSelect.value = this._getLogFilter();
            filterSelect.addEventListener('change', (e) => {
                this._setLogFilter(e.target.value);
                const selectedPid = this._getSelectedPid();
                if (selectedPid) {
                    this._updateProcessLogs(selectedPid);
                }
            });
            
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '清空';
            clearBtn.style.cssText = `
                padding: 4px 12px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #e8ecf0;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                margin-left: auto;
                transition: all 0.2s;
            `;
            clearBtn.addEventListener('mouseenter', () => {
                clearBtn.style.background = 'rgba(108, 142, 255, 0.2)';
            });
            clearBtn.addEventListener('mouseleave', () => {
                clearBtn.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            clearBtn.addEventListener('click', () => {
                if (this.logsContent) {
                    this.logsContent.innerHTML = '';
                }
            });
            
            toolbar.appendChild(filterLabel);
            toolbar.appendChild(filterSelect);
            toolbar.appendChild(clearBtn);
            panel.appendChild(toolbar);
            
            // 日志内容区域
            const logsContent = document.createElement('div');
            logsContent.className = 'taskmanager-logs-content';
            logsContent.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 12px;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 12px;
                line-height: 1.6;
            `;
            panel.appendChild(logsContent);
            
            // 存储引用
            this.logsPanel = panel;
            this.logsContent = logsContent;
            this.logFilterSelect = filterSelect;
            
            return panel;
        },
        
        _updateProcessLogs: function(pid) {
            if (!this.logsContent || !pid) {
                if (this.logsContent) {
                    this.logsContent.innerHTML = '<div style="text-align: center; color: #aab2c0; padding: 40px;">请选择一个进程查看日志</div>';
                }
                return;
            }
            
            // 直接从PROCESS_TABLE获取进程信息，确保获取到最新的actions
            let process = null;
            if (typeof ProcessManager !== 'undefined' && ProcessManager.PROCESS_TABLE) {
                process = ProcessManager.PROCESS_TABLE.get(pid);
            }
            
            if (!process) {
                // 如果PROCESS_TABLE中没有，尝试使用getProcessInfo
                // 注意：getProcessInfo(pid) 返回的是包含内存信息的对象，但actions应该在原始processInfo中
                const processInfo = ProcessManager.getProcessInfo(pid);
                if (processInfo) {
                    // 如果getProcessInfo返回的对象没有actions，尝试从PROCESS_TABLE获取
                    if (!processInfo.actions && ProcessManager.PROCESS_TABLE) {
                        const rawProcess = ProcessManager.PROCESS_TABLE.get(pid);
                        if (rawProcess && rawProcess.actions) {
                            process = rawProcess;
                        } else {
                            process = processInfo;
                        }
                    } else {
                        process = processInfo;
                    }
                }
            }
            
            if (!process) {
                this.logsContent.innerHTML = '<div style="text-align: center; color: #ff4444; padding: 40px;">进程不存在</div>';
                return;
            }
            
            // 获取程序行为记录（确保actions数组存在）
            // 如果process.actions不存在，尝试从PROCESS_TABLE直接获取
            let actions = (process.actions && Array.isArray(process.actions)) ? process.actions : [];
            if (actions.length === 0 && typeof ProcessManager !== 'undefined' && ProcessManager.PROCESS_TABLE) {
                const rawProcess = ProcessManager.PROCESS_TABLE.get(pid);
                if (rawProcess && rawProcess.actions && Array.isArray(rawProcess.actions)) {
                    actions = rawProcess.actions;
                }
            }
            
            if (actions.length === 0) {
                this.logsContent.innerHTML = '<div style="text-align: center; color: #aab2c0; padding: 40px;">该进程没有行为记录</div>';
                return;
            }
            
            // 过滤日志
            let filteredActions = actions;
            const logFilter = this._getLogFilter();
            if (logFilter !== 'all') {
                filteredActions = actions.filter(action => {
                    // 根据action类型判断日志级别
                    if (logFilter === 'error') {
                        return action.action === 'error' || action.action === 'kill' || action.action === 'crash';
                    } else if (logFilter === 'warning') {
                        return action.action === 'warning' || action.action === 'timeout';
                    } else if (logFilter === 'info') {
                        return action.action === 'start' || action.action === 'init' || action.action === 'allocateMemory';
                    }
                    return true;
                });
            }
            
            if (filteredActions.length === 0) {
                this.logsContent.innerHTML = '<div style="text-align: center; color: #aab2c0; padding: 40px;">没有符合条件的日志记录</div>';
                return;
            }
            
            // 保存当前滚动位置
            const wasAtBottom = this.logsContent.scrollHeight - this.logsContent.scrollTop <= this.logsContent.clientHeight + 10;
            const oldScrollTop = this.logsContent.scrollTop;
            
            // 显示日志（保留现有内容，只追加新日志）
            const existingLogs = Array.from(this.logsContent.children);
            const existingLogCount = existingLogs.length;
            const newLogCount = filteredActions.length;
            
            // 如果日志数量没有变化，说明没有新日志，不需要更新
            if (existingLogCount === newLogCount && existingLogCount > 0) {
                // 检查是否有新日志（比较最后一条的时间戳）
                const lastExistingLog = existingLogs[existingLogCount - 1];
                const lastAction = filteredActions[filteredActions.length - 1];
                if (lastExistingLog && lastAction) {
                    const lastExistingTime = lastExistingLog.querySelector('div[data-timestamp]');
                    if (lastExistingTime && lastExistingTime.dataset.timestamp === lastAction.timestamp.toString()) {
                        // 没有新日志，保持滚动位置
                        if (!wasAtBottom) {
                            this.logsContent.scrollTop = oldScrollTop;
                        }
                        return;
                    }
                }
            }
            
            // 完全重新渲染（简化逻辑，避免复杂的增量更新）
            this.logsContent.innerHTML = '';
            filteredActions.forEach((action, index) => {
                const logEntry = document.createElement('div');
                logEntry.style.cssText = `
                    padding: 8px 12px;
                    margin-bottom: 4px;
                    background: rgba(108, 142, 255, 0.05);
                    border-left: 3px solid ${this._getLogColor(action.action)};
                    border-radius: 4px;
                    word-break: break-word;
                `;
                
                const time = document.createElement('div');
                time.style.cssText = `
                    color: #8da6ff;
                    font-size: 11px;
                    margin-bottom: 4px;
                `;
                if (action.timestamp) {
                    time.textContent = new Date(action.timestamp).toLocaleString();
                    time.dataset.timestamp = action.timestamp.toString();
                } else {
                    time.textContent = '未知时间';
                }
                logEntry.appendChild(time);
                
                const actionText = document.createElement('div');
                actionText.style.cssText = `
                    color: #e8ecf0;
                    font-size: 12px;
                `;
                
                let actionDisplay = action.action || '未知操作';
                if (action.details) {
                    if (typeof action.details === 'object') {
                        actionDisplay += ': ' + JSON.stringify(action.details, null, 2);
                    } else {
                        actionDisplay += ': ' + action.details;
                    }
                }
                
                actionText.textContent = actionDisplay;
                logEntry.appendChild(actionText);
                
                this.logsContent.appendChild(logEntry);
            });
            
            // 如果之前在底部，滚动到底部；否则保持滚动位置
            if (wasAtBottom) {
                this.logsContent.scrollTop = this.logsContent.scrollHeight;
            } else {
                // 尝试保持相对位置
                const scrollRatio = oldScrollTop / (this.logsContent.scrollHeight - this.logsContent.clientHeight);
                this.logsContent.scrollTop = (this.logsContent.scrollHeight - this.logsContent.clientHeight) * scrollRatio;
            }
        },
        
        /**
         * 打开进程内存查看窗口
         */
        _openMemoryViewWindow: function(pid) {
            // 如果窗口已存在，聚焦它
            if (this._memoryViewWindows.has(pid)) {
                const existingWindow = this._memoryViewWindows.get(pid);
                // 通过GUIManager聚焦窗口
                if (typeof GUIManager !== 'undefined' && existingWindow.dataset.windowId) {
                    GUIManager.focusWindow(existingWindow.dataset.windowId);
                }
                return;
            }
            
            const guiContainer = document.getElementById('gui-container');
            if (!guiContainer) return;
            
            // 创建窗口
            const memoryWindow = document.createElement('div');
            memoryWindow.className = 'taskmanager-memory-window';
            memoryWindow.dataset.pid = this.pid.toString();
            memoryWindow.dataset.childPid = pid.toString();
            
            memoryWindow.style.cssText = `
                position: fixed;
                width: 900px;
                height: 700px;
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.85));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                border-radius: var(--style-window-border-radius, 12px);
                box-shadow: var(--style-window-box-shadow-focused, 0 12px 40px rgba(0, 0, 0, 0.5));
                backdrop-filter: var(--style-window-backdrop-filter, blur(30px) saturate(180%));
                -webkit-backdrop-filter: var(--style-window-backdrop-filter, blur(30px) saturate(180%));
                color: var(--theme-text, #d7e0dd);
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 获取进程信息用于标题
            const process = ProcessManager.getProcessInfo(pid);
            const windowTitle = `内存查看 - ${process ? (process.programName || `PID ${pid}`) : `PID ${pid}`}`;
            
            // 注册到GUIManager（作为子窗口）
            let windowInfo = null;
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('taskmanager');
                }
                
                windowInfo = GUIManager.registerWindow(this.pid, memoryWindow, {
                    title: windowTitle,
                    icon: icon,
                    isMainWindow: false, // 标记为子窗口
                    onClose: () => {
                        this._closeMemoryViewWindow(pid);
                    }
                });
            }
            
            guiContainer.appendChild(memoryWindow);
            
            // 存储窗口引用
            this._memoryViewWindows.set(pid, memoryWindow);
            this._childWindows.set(`memory-${pid}`, memoryWindow);
            
            // 如果GUIManager注册成功，存储窗口ID
            if (windowInfo && windowInfo.windowId) {
                memoryWindow.dataset.windowId = windowInfo.windowId;
            }
            
            // 等待GUIManager添加标题栏后再创建内容区域
            // 使用setTimeout确保标题栏已添加
            setTimeout(() => {
                // 创建内容区域（在标题栏之后）
                const content = document.createElement('div');
                content.className = 'taskmanager-memory-content';
                content.style.cssText = `
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    box-sizing: border-box;
                `;
                
                // 标签页
                const tabs = document.createElement('div');
                tabs.style.cssText = `
                    display: flex;
                    border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                    background: rgba(108, 142, 255, 0.05);
                    flex-shrink: 0;
                `;
                
                const heapTab = this._createMemoryTab('堆内存', true);
                const shedTab = this._createMemoryTab('栈内存', false);
                tabs.appendChild(heapTab);
                tabs.appendChild(shedTab);
                content.appendChild(tabs);
                
                // 内存表格容器
                const tableContainer = document.createElement('div');
                tableContainer.className = 'taskmanager-memory-table-container';
                tableContainer.style.cssText = `
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 16px;
                    min-height: 0;
                    box-sizing: border-box;
                `;
                // 确保表格容器可以滚动
                tableContainer.addEventListener('wheel', (e) => {
                    e.stopPropagation();
                }, { passive: true });
                content.appendChild(tableContainer);
                
                // 插入到标题栏之后
                const titleBar = memoryWindow.querySelector('.zos-window-titlebar');
                if (titleBar && titleBar.nextSibling) {
                    memoryWindow.insertBefore(content, titleBar.nextSibling);
                } else {
                    memoryWindow.appendChild(content);
                }
                
                // 更新内存数据
                this._updateMemoryViewWindow(pid);
                
                // 标签页切换
                heapTab.addEventListener('click', () => {
                    heapTab.classList.add('active');
                    shedTab.classList.remove('active');
                    this._updateMemoryViewWindow(pid, 'heap');
                });
                shedTab.addEventListener('click', () => {
                    shedTab.classList.add('active');
                    heapTab.classList.remove('active');
                    this._updateMemoryViewWindow(pid, 'shed');
                });
            }, 0);
            
            // 定时更新
            const updateInterval = setInterval(() => {
                if (!this._memoryViewWindows.has(pid)) {
                    clearInterval(updateInterval);
                    return;
                }
                this._updateMemoryViewWindow(pid);
            }, 2000);
            memoryWindow._updateInterval = updateInterval;
                },
                
        /**
         * 创建内存标签页
         */
        _createMemoryTab: function(text, active) {
            const tab = document.createElement('div');
            tab.textContent = text;
            tab.className = active ? 'active' : '';
            tab.style.cssText = `
                padding: 12px 20px;
                cursor: pointer;
                color: ${active ? '#6c8eff' : '#aab2c0'};
                border-bottom: 2px solid ${active ? '#6c8eff' : 'transparent'};
                transition: all 0.2s;
                font-size: 14px;
                font-weight: ${active ? '600' : '400'};
            `;
            tab.addEventListener('mouseenter', () => {
                if (!tab.classList.contains('active')) {
                    tab.style.color = '#8da6ff';
                }
            });
            tab.addEventListener('mouseleave', () => {
                if (!tab.classList.contains('active')) {
                    tab.style.color = '#aab2c0';
                }
            });
            return tab;
        },
                
        /**
         * 更新内存查看窗口
         */
        _updateMemoryViewWindow: function(pid, type = 'heap') {
            const window = this._memoryViewWindows.get(pid);
            if (!window) return;
            
            // 查找表格容器 - 通过更精确的选择器
            const content = window.querySelector('div[style*="flex-direction: column"]');
            if (!content) return;
            const tableContainer = content.querySelector('div[style*="overflow: auto"]');
            if (!tableContainer) return;
                    
            // 获取内存信息
            let memoryInfo = null;
            if (typeof MemoryManager !== 'undefined') {
                try {
                    if (pid === 10000 && typeof KernelMemory !== 'undefined') {
                        try {
                            KernelMemory._ensureMemory();
                        } catch (e) {}
                    }
                    const memoryResult = MemoryManager.checkMemory(pid);
                    if (memoryResult) {
                        if (memoryResult.programs && memoryResult.programs.length > 0) {
                            memoryInfo = memoryResult.programs[0];
                        } else if (memoryResult.pid === pid) {
                            memoryInfo = memoryResult;
                        }
                    }
                } catch (e) {
                    // 静默处理，避免日志过多
                }
            }
            
            if (!memoryInfo) {
                tableContainer.innerHTML = '<div style="text-align: center; color: #aab2c0; padding: 40px;">该进程没有内存信息</div>';
                return;
            }
            
            // 获取当前激活的标签页
            const tabs = window.querySelectorAll('div[style*="padding: 12px 20px"]');
            const activeTab = Array.from(tabs).find(t => t.classList.contains('active'));
            if (activeTab) {
                type = activeTab.textContent.includes('堆') ? 'heap' : 'shed';
            }
            
            // 创建内存表格
            const table = document.createElement('table');
            table.style.cssText = `
                width: 100%;
                border-collapse: collapse;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 12px;
            `;
            
            // 表头
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr style="background: rgba(108, 142, 255, 0.1); border-bottom: 2px solid rgba(108, 142, 255, 0.3);">
                    <th style="padding: 10px; text-align: left; color: #6c8eff; font-weight: 600;">地址 (Hex)</th>
                    <th style="padding: 10px; text-align: left; color: #6c8eff; font-weight: 600;">地址 (Dec)</th>
                    <th style="padding: 10px; text-align: left; color: #6c8eff; font-weight: 600;">值</th>
                    <th style="padding: 10px; text-align: left; color: #6c8eff; font-weight: 600;">类型</th>
                </tr>
            `;
            table.appendChild(thead);
            
            // 表体
            const tbody = document.createElement('tbody');
            
            if (type === 'heap' && memoryInfo.heaps && memoryInfo.heaps.length > 0) {
                // 直接从 APPLICATION_SOP 获取 Heap 对象
                let appSpace = null;
                if (typeof MemoryManager !== 'undefined' && MemoryManager.APPLICATION_SOP) {
                    appSpace = MemoryManager.APPLICATION_SOP.get(pid);
                }
                
                memoryInfo.heaps.forEach((heapInfo, heapIndex) => {
                            // 从 appSpace 获取实际的 Heap 对象
                            let heap = null;
                            if (appSpace && appSpace.heaps) {
                                const heapId = heapInfo.heapId;
                                // heapId 可能是16进制字符串，需要转换
                                const hexType = (typeof AddressType !== 'undefined' && AddressType.TYPE.HEX) ? AddressType.TYPE.HEX : 16;
                                const decimalType = (typeof AddressType !== 'undefined' && AddressType.TYPE.DECIMAL) ? AddressType.TYPE.DECIMAL : 10;
                                
                                // 尝试通过 heapId 查找
                                appSpace.heaps.forEach((h, id) => {
                                    const idStr = typeof id === 'string' ? id : String(id);
                                    const heapIdStr = typeof heapId === 'string' ? heapId : String(heapId);
                                    if (idStr === heapIdStr || 
                                        (typeof Heap !== 'undefined' && Heap.addressing(idStr, decimalType) === Heap.addressing(heapIdStr, decimalType))) {
                                        heap = h;
                                    }
                                });
                                
                                // 如果还是找不到，尝试通过索引
                                if (!heap && appSpace.heaps.size > heapIndex) {
                                    const heapEntries = Array.from(appSpace.heaps.entries());
                                    if (heapEntries[heapIndex]) {
                                        heap = heapEntries[heapIndex][1];
                                    }
                                }
                            }
                            
                            if (!heap || !heap.memoryDataList) {
                                // 如果找不到Heap对象，至少显示统计信息
                                const headerRow = document.createElement('tr');
                                headerRow.style.cssText = `
                                    background: rgba(108, 142, 255, 0.1);
                                    border-bottom: 2px solid rgba(108, 142, 255, 0.3);
                                `;
                                headerRow.innerHTML = `
                                    <td colspan="4" style="padding: 12px; color: #6c8eff; font-weight: 600; font-size: 13px;">
                                        堆 #${heapInfo.heapId || heapIndex + 1} (PID: ${pid}, 大小: ${heapInfo.heapSizeNum || heapInfo.heapSize || 0} bytes) - 无法访问内存数据
                                    </td>
                                `;
                                tbody.appendChild(headerRow);
                                return;
                            }
                            
                            // 添加堆信息标题行
                            const headerRow = document.createElement('tr');
                            headerRow.style.cssText = `
                                background: rgba(108, 142, 255, 0.1);
                                border-bottom: 2px solid rgba(108, 142, 255, 0.3);
                            `;
                            headerRow.innerHTML = `
                                <td colspan="4" style="padding: 12px; color: #6c8eff; font-weight: 600; font-size: 13px;">
                                    堆 #${heapInfo.heapId || heapIndex + 1} (PID: ${pid}, 大小: ${heap.heapSize || 0} bytes)
                                </td>
                            `;
                            tbody.appendChild(headerRow);
                            
                            // 遍历内存数据（只显示非null值，或前1000个地址）
                            let nonNullCount = 0;
                            let displayedCount = 0;
                            const maxDisplay = 1000; // 最多显示1000行
                            
                            for (let i = 0; i < heap.memoryDataList.length; i++) {
                                const value = heap.memoryDataList[i];
                                
                                // 如果值不为null，或者在前1000个地址内，则显示
                                if (value !== null || i < 100) {
                                    if (value !== null) nonNullCount++;
                                    
                                    if (displayedCount >= maxDisplay) {
                                        // 添加省略提示
                                        const skipRow = document.createElement('tr');
                                        skipRow.innerHTML = `
                                            <td colspan="4" style="padding: 12px; text-align: center; color: #aab2c0; font-style: italic;">
                                                ... (已显示前 ${maxDisplay} 行，共 ${heap.memoryDataList.length} 行，其中 ${nonNullCount} 个非空值)
                                            </td>
                                        `;
                                        tbody.appendChild(skipRow);
                                        break;
                                    }
                                    
                                    const addr = i;
                                    const addrHex = '0x' + addr.toString(16).toUpperCase().padStart(8, '0');
                                    const addrDec = addr.toString();
                                    
                                    const row = document.createElement('tr');
                                    row.style.cssText = `
                                        border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                                        transition: background 0.2s;
                                    `;
                                    row.addEventListener('mouseenter', () => {
                                        row.style.background = 'rgba(108, 142, 255, 0.05)';
                                    });
                                    row.addEventListener('mouseleave', () => {
                                        row.style.background = 'transparent';
                                    });
                                    
                                    let valueStr = '';
                                    let valueType = 'null';
                                    
                                    if (value === null) {
                                        valueStr = '<span style="color: #5a6a64;">null</span>';
                                        valueType = 'null';
                                    } else if (typeof value === 'object') {
                                        try {
                                            const jsonStr = JSON.stringify(value, (key, val) => {
                                                if (typeof val === 'function') return '[Function]';
                                                if (val instanceof Map) return '[Map]';
                                                if (val instanceof Set) return '[Set]';
                                                return val;
                                            }, 2);
                                            valueStr = jsonStr.length > 200 ? jsonStr.substring(0, 200) + '...' : jsonStr;
                                            valueType = Array.isArray(value) ? 'array' : 'object';
                                        } catch (e) {
                                            valueStr = `[无法序列化: ${e.message}]`;
                                            valueType = 'object';
                                        }
                                    } else {
                                        valueStr = String(value);
                                        valueType = typeof value;
                                    }
                                    
                                    row.innerHTML = `
                                        <td style="padding: 8px; color: #8da6ff; font-weight: 600; font-family: monospace;">${addrHex}</td>
                                        <td style="padding: 8px; color: #aab2c0; font-family: monospace;">${addrDec}</td>
                                        <td style="padding: 8px; color: #e8ecf0; word-break: break-all; font-family: monospace; font-size: 11px;">${valueStr}</td>
                                        <td style="padding: 8px; color: #aab2c0;">${valueType}</td>
                                    `;
                                    tbody.appendChild(row);
                                    displayedCount++;
                                }
                            }
                            
                            // 如果所有值都是null，显示提示
                            if (nonNullCount === 0 && displayedCount > 0) {
                                const emptyRow = document.createElement('tr');
                                emptyRow.innerHTML = `
                                    <td colspan="4" style="padding: 12px; text-align: center; color: #aab2c0; font-style: italic;">
                                        该堆内存中所有值均为 null
                                    </td>
                                `;
                                tbody.appendChild(emptyRow);
                }
                });
            } else if (type === 'shed' && memoryInfo.sheds && memoryInfo.sheds.length > 0) {
                // 直接从 APPLICATION_SOP 获取 Shed 对象
                let appSpace = null;
                if (typeof MemoryManager !== 'undefined' && MemoryManager.APPLICATION_SOP) {
                    appSpace = MemoryManager.APPLICATION_SOP.get(pid);
                }
                
                memoryInfo.sheds.forEach((shedInfo, shedIndex) => {
                            // 从 appSpace 获取实际的 Shed 对象
                            let shed = null;
                            if (appSpace && appSpace.sheds) {
                                const shedId = shedInfo.shedId;
                                const decimalType = (typeof AddressType !== 'undefined' && AddressType.TYPE.DECIMAL) ? AddressType.TYPE.DECIMAL : 10;
                                
                                // 尝试通过 shedId 查找
                                appSpace.sheds.forEach((s, id) => {
                                    const idStr = typeof id === 'string' ? id : String(id);
                                    const shedIdStr = typeof shedId === 'string' ? shedId : String(shedId);
                                    if (idStr === shedIdStr || 
                                        (typeof Heap !== 'undefined' && Heap.addressing(idStr, decimalType) === Heap.addressing(shedIdStr, decimalType))) {
                                        shed = s;
                                    }
                                });
                                
                                // 如果还是找不到，尝试通过索引
                                if (!shed && appSpace.sheds.size > shedIndex) {
                                    const shedEntries = Array.from(appSpace.sheds.entries());
                                    if (shedEntries[shedIndex]) {
                                        shed = shedEntries[shedIndex][1];
                                    }
                                }
                            }
                            
                            if (!shed) {
                                // 如果找不到Shed对象，至少显示统计信息
                                const headerRow = document.createElement('tr');
                                headerRow.style.cssText = `
                                    background: rgba(108, 142, 255, 0.1);
                                    border-bottom: 2px solid rgba(108, 142, 255, 0.3);
                                `;
                                headerRow.innerHTML = `
                                    <td colspan="4" style="padding: 12px; color: #6c8eff; font-weight: 600; font-size: 13px;">
                                        栈 #${shedInfo.shedId || shedIndex + 1} (PID: ${pid}, 大小: ${shedInfo.stackSize || 0} bytes) - 无法访问内存数据
                                    </td>
                                `;
                                tbody.appendChild(headerRow);
                                return;
                            }
                            
                            // 添加栈信息标题行
                            const headerRow = document.createElement('tr');
                            headerRow.style.cssText = `
                                background: rgba(108, 142, 255, 0.1);
                                border-bottom: 2px solid rgba(108, 142, 255, 0.3);
                            `;
                            headerRow.innerHTML = `
                                <td colspan="4" style="padding: 12px; color: #6c8eff; font-weight: 600; font-size: 13px;">
                                    栈 #${shedInfo.shedId || shedIndex + 1} (PID: ${pid}, 大小: ${shed.stackSize || 0} bytes)
                                </td>
                            `;
                            tbody.appendChild(headerRow);
                            
                            // 代码区
                            if (shed.codeArea && Array.isArray(shed.codeArea) && shed.codeArea.length > 0) {
                                const codeHeaderRow = document.createElement('tr');
                                codeHeaderRow.style.cssText = `
                                    background: rgba(108, 142, 255, 0.05);
                                `;
                                codeHeaderRow.innerHTML = `
                                    <td colspan="4" style="padding: 8px; color: #8da6ff; font-weight: 600; font-size: 12px;">
                                        代码区 (${shed.codeArea.length} 项)
                                    </td>
                                `;
                                tbody.appendChild(codeHeaderRow);
                                
                                shed.codeArea.forEach((code, index) => {
                                    const addr = index;
                                    const addrHex = '0x' + addr.toString(16).toUpperCase().padStart(8, '0');
                                    const addrDec = addr.toString();
                                    
                                    const row = document.createElement('tr');
                                    row.style.cssText = `
                                        border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                                        transition: background 0.2s;
                                    `;
                                    row.addEventListener('mouseenter', () => {
                                        row.style.background = 'rgba(108, 142, 255, 0.05)';
                                    });
                                    row.addEventListener('mouseleave', () => {
                                        row.style.background = 'transparent';
                                    });
                                    
                                    const valueStr = String(code).substring(0, 200);
                                    
                                    row.innerHTML = `
                                        <td style="padding: 8px; color: #8da6ff; font-weight: 600; font-family: monospace;">${addrHex}</td>
                                        <td style="padding: 8px; color: #aab2c0; font-family: monospace;">${addrDec}</td>
                                        <td style="padding: 8px; color: #e8ecf0; word-break: break-all; font-family: monospace; font-size: 11px;">${valueStr}</td>
                                        <td style="padding: 8px; color: #aab2c0;">code</td>
                                    `;
                                    tbody.appendChild(row);
                                });
                            }
                            
                            // 资源链接区
                            if (shed.resourceLinkArea && shed.resourceLinkArea instanceof Map && shed.resourceLinkArea.size > 0) {
                                const resourceHeaderRow = document.createElement('tr');
                                resourceHeaderRow.style.cssText = `
                                    background: rgba(108, 142, 255, 0.05);
                                `;
                                resourceHeaderRow.innerHTML = `
                                    <td colspan="4" style="padding: 8px; color: #8da6ff; font-weight: 600; font-size: 12px;">
                                        资源链接区 (${shed.resourceLinkArea.size} 项)
                                    </td>
                                `;
                                tbody.appendChild(resourceHeaderRow);
                                
                                let resourceIndex = 0;
                                shed.resourceLinkArea.forEach((value, key) => {
                                    const row = document.createElement('tr');
                                    row.style.cssText = `
                                        border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                                        transition: background 0.2s;
                                    `;
                                    row.addEventListener('mouseenter', () => {
                                        row.style.background = 'rgba(108, 142, 255, 0.05)';
                                    });
                                    row.addEventListener('mouseleave', () => {
                                        row.style.background = 'transparent';
                                    });
                                    
                                    let valueStr = '';
                                    try {
                                        if (typeof value === 'object' && value !== null) {
                                            valueStr = JSON.stringify(value, (k, v) => {
                                                if (typeof v === 'function') return '[Function]';
                                                if (v instanceof Map) return '[Map]';
                                                if (v instanceof Set) return '[Set]';
                                                return v;
                                            }, 2).substring(0, 200);
                                        } else {
                                            valueStr = String(value).substring(0, 200);
                                        }
                                    } catch (e) {
                                        valueStr = `[无法序列化: ${e.message}]`;
                                    }
                                    
                                    const addrHex = '0x' + resourceIndex.toString(16).toUpperCase().padStart(8, '0');
                                    
                                    row.innerHTML = `
                                        <td style="padding: 8px; color: #8da6ff; font-weight: 600; font-family: monospace;">${addrHex}</td>
                                        <td style="padding: 8px; color: #aab2c0; font-family: monospace;">${resourceIndex}</td>
                                        <td style="padding: 8px; color: #e8ecf0; word-break: break-all; font-family: monospace; font-size: 11px;">Key: <span style="color: #6c8eff;">${key}</span>, Value: ${valueStr}</td>
                                        <td style="padding: 8px; color: #aab2c0;">resource</td>
                                    `;
                                    tbody.appendChild(row);
                                    resourceIndex++;
                                });
                            }
                            
                            // 如果栈为空
                            if ((!shed.codeArea || shed.codeArea.length === 0) && 
                                (!shed.resourceLinkArea || shed.resourceLinkArea.size === 0)) {
                                const emptyRow = document.createElement('tr');
                                emptyRow.innerHTML = `
                                    <td colspan="4" style="padding: 12px; text-align: center; color: #aab2c0; font-style: italic;">
                                        该栈为空
                                    </td>
                                `;
                                tbody.appendChild(emptyRow);
                }
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #aab2c0;">该进程没有' + (type === 'heap' ? '堆' : '栈') + '内存数据</td></tr>';
            }
            
            table.appendChild(tbody);
            tableContainer.innerHTML = '';
            tableContainer.appendChild(table);
        },
                
        /**
         * 关闭内存查看窗口
         */
        _closeMemoryViewWindow: function(pid) {
            const window = this._memoryViewWindows.get(pid);
            if (!window) return;
            
            // 清除更新定时器
            if (window._updateInterval) {
                clearInterval(window._updateInterval);
                window._updateInterval = null;
            }
            
            // 清理引用（先清理，避免重复调用）
            this._memoryViewWindows.delete(pid);
            this._childWindows.delete(`memory-${pid}`);
            
            // 通过GUIManager注销窗口（这会自动移除DOM）
            if (typeof GUIManager !== 'undefined' && window.dataset.windowId) {
                GUIManager.unregisterWindow(window.dataset.windowId);
            } else {
                // 降级方案：直接移除DOM
                if (window.parentElement) {
                    window.parentElement.removeChild(window);
                }
            }
        },
                
        /**
         * 打开POOL查看窗口
         */
        _openPoolViewWindow: function() {
            // 如果窗口已存在，聚焦它
            if (this._poolViewWindow) {
                // 通过GUIManager聚焦窗口
                if (typeof GUIManager !== 'undefined' && this._poolViewWindow.dataset.windowId) {
                    GUIManager.focusWindow(this._poolViewWindow.dataset.windowId);
                }
                this._updatePoolViewWindow();
                return;
            }
            
            const guiContainer = document.getElementById('gui-container');
            if (!guiContainer) return;
            
            // 创建窗口
            const poolWindow = document.createElement('div');
            poolWindow.className = 'taskmanager-pool-window';
            poolWindow.dataset.pid = this.pid.toString();
            
            poolWindow.style.cssText = `
                position: fixed;
                width: 900px;
                height: 700px;
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.85));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                border-radius: var(--style-window-border-radius, 12px);
                box-shadow: var(--style-window-box-shadow-focused, 0 12px 40px rgba(0, 0, 0, 0.5));
                backdrop-filter: var(--style-window-backdrop-filter, blur(30px) saturate(180%));
                -webkit-backdrop-filter: var(--style-window-backdrop-filter, blur(30px) saturate(180%));
                color: var(--theme-text, #d7e0dd);
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 注册到GUIManager（作为子窗口）
            let windowInfo = null;
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('taskmanager');
                }
                
                windowInfo = GUIManager.registerWindow(this.pid, poolWindow, {
                    title: 'POOL 查看器',
                    icon: icon,
                    isMainWindow: false, // 标记为子窗口
                    onClose: () => {
                        this._closePoolViewWindow();
                    }
                });
            }
            
            guiContainer.appendChild(poolWindow);
            
            // 存储窗口引用
            this._poolViewWindow = poolWindow;
            this._childWindows.set('pool', poolWindow);
            
            // 如果GUIManager注册成功，存储窗口ID
            if (windowInfo && windowInfo.windowId) {
                poolWindow.dataset.windowId = windowInfo.windowId;
            }
            
            // 等待GUIManager添加标题栏后再创建内容区域
            // 使用setTimeout确保标题栏已添加
            setTimeout(() => {
                // 创建内容区域（在标题栏之后）
                const content = document.createElement('div');
                content.className = 'taskmanager-pool-content';
                content.style.cssText = `
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 20px;
                    min-height: 0;
                    box-sizing: border-box;
                `;
                // 确保内容区域可以滚动
                content.addEventListener('wheel', (e) => {
                    e.stopPropagation();
                }, { passive: true });
                
                // 插入到标题栏之后
                const titleBar = poolWindow.querySelector('.zos-window-titlebar');
                if (titleBar && titleBar.nextSibling) {
                    poolWindow.insertBefore(content, titleBar.nextSibling);
                } else {
                    poolWindow.appendChild(content);
                }
                
                // 更新POOL数据（快照，只显示一次）
                this._updatePoolViewWindow();
            }, 0);
        },
                
        /**
         * 更新POOL查看窗口
         */
        _updatePoolViewWindow: function() {
                    if (!this._poolViewWindow) return;
                    
                    // 使用类名选择器，更可靠
                    const content = this._poolViewWindow.querySelector('.taskmanager-pool-content') || 
                                    this._poolViewWindow.querySelector('div[style*="flex: 1"]');
                    if (!content) return;
                    
                    if (typeof POOL === 'undefined') {
                        content.innerHTML = '<div style="text-align: center; color: #ff4444; padding: 40px;">POOL 不可用</div>';
                        return;
                    }
                    
                    // 获取所有POOL类别
                    // 使用已知的类别列表，并通过 __GET_ALL__ 获取所有项
                    const knownTypes = [
                        'KERNEL_GLOBAL_POOL',
                        'APPLICATION_SHARED_POOL',
                        'TYPE_POOL'
                    ];
                    
                    let html = '<div style="display: flex; flex-direction: column; gap: 24px; width: 100%;">';
                    
                    knownTypes.forEach(type => {
                        // 直接尝试获取类别数据，不依赖 __HAS__
                        // 因为 __HAS__ 可能不准确，而 __GET_ALL__ 会返回 { isInit: false } 如果类别不存在
                        html += `<div style="background: rgba(108, 142, 255, 0.05); border: 1px solid rgba(108, 142, 255, 0.2); border-radius: 8px; padding: 16px;">`;
                        html += `<h3 style="color: #6c8eff; font-size: 16px; margin-bottom: 12px; border-bottom: 1px solid rgba(108, 142, 255, 0.2); padding-bottom: 8px;">${type}</h3>`;
                        
                        // 使用 __GET_ALL__ 获取类别中的所有元素
                        let hasItems = false;
                        let allItems = null;
                        try {
                            allItems = POOL.__GET_ALL__(type);
                            
                            // 检查是否是有效的类别对象
                            // __GET_ALL__ 如果类别不存在会返回 { isInit: false }
                            // 如果类别存在但为空，会返回空对象 {} 或包含 isInit 的对象
                            if (allItems && typeof allItems === 'object') {
                                // 如果返回 { isInit: false }，说明类别不存在
                                if (allItems.isInit === false) {
                                    html += '<div style="color: #aab2c0; font-size: 12px; padding: 12px;">该类别不存在</div>';
                                } else {
                                    const keys = Object.keys(allItems);
                                    
                                    // 过滤掉内部属性
                                    const validKeys = keys.filter(key => key !== 'isInit');
                                    
                                    if (validKeys.length > 0) {
                                        validKeys.forEach(key => {
                                            try {
                                                const value = allItems[key];
                                                hasItems = true;
                                            
                                                html += `<div style="margin-bottom: 12px; padding: 12px; background: rgba(108, 142, 255, 0.05); border-radius: 6px; border-left: 3px solid #6c8eff;">`;
                                                html += `<div style="color: #8da6ff; font-weight: 600; margin-bottom: 4px;">${key}</div>`;
                                                html += `<div style="color: #aab2c0; font-size: 12px; font-family: monospace;">`;
                                                
                                                if (value === null || value === undefined) {
                                                    html += `<span style="color: #5a6a64;">${value === null ? 'null' : 'undefined'}</span>`;
                                                } else if (typeof value === 'function') {
                                                    html += `<span style="color: #6c8eff;">[Function: ${value.name || 'anonymous'}]</span>`;
                                                } else if (typeof value === 'object') {
                                                    try {
                                                        const jsonStr = JSON.stringify(value, (key, val) => {
                                                            if (typeof val === 'function') return '[Function]';
                                                            if (val instanceof Map) return '[Map]';
                                                            if (val instanceof Set) return '[Set]';
                                                            return val;
                                                        }, 2);
                                                        html += `<pre style="margin: 0; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto;">${jsonStr.substring(0, 2000)}${jsonStr.length > 2000 ? '\n... (内容过长，已截断)' : ''}</pre>`;
                                                    } catch (e) {
                                                        html += `<span style="color: #ff4444;">[无法序列化对象: ${e.message}]</span>`;
                                                    }
                                                } else {
                                                    html += String(value);
                                                }
                                                
                                                html += `</div>`;
                                                html += `</div>`;
                                            } catch (e) {
                                                // 忽略单个项的错误
                                            }
                                        });
                                    } else {
                                        // 类别存在但没有有效项
                                        html += '<div style="color: #aab2c0; font-size: 12px; padding: 12px;">该类别为空</div>';
                                    }
                                }
                            } else {
                                // allItems 不是对象或为 null
                                html += '<div style="color: #aab2c0; font-size: 12px; padding: 12px;">该类别为空或无法访问</div>';
                            }
                        } catch (e) {
                            html += `<div style="color: #ff4444; font-size: 12px; padding: 12px;">获取类别数据失败: ${e.message}</div>`;
                        }
                        
                        html += `</div>`;
                    });
                    
                    html += '</div>';
                    content.innerHTML = html;
                },
                
        /**
         * 关闭POOL查看窗口
         */
        _closePoolViewWindow: function() {
            if (!this._poolViewWindow) return;
            
            // 清理引用（先清理，避免重复调用）
            const window = this._poolViewWindow;
            const windowId = window.dataset.windowId;
            this._poolViewWindow = null;
            this._childWindows.delete('pool');
            
            // 通过GUIManager关闭窗口（使用 _closeWindow 确保正确关闭）
            if (typeof GUIManager !== 'undefined' && windowId && typeof GUIManager._closeWindow === 'function') {
                GUIManager._closeWindow(windowId, false);
            } else if (typeof GUIManager !== 'undefined' && windowId && typeof GUIManager.unregisterWindow === 'function') {
                // 降级方案：直接注销窗口
                GUIManager.unregisterWindow(windowId);
            } else {
                // 最后降级方案：直接移除DOM
                if (window.parentElement) {
                    window.parentElement.removeChild(window);
                }
            }
        },
                
        /**
         * 打开网络信息查看窗口
         */
        _openNetworkViewWindow: function() {
            // 如果窗口已存在，聚焦它
            if (this._networkViewWindow) {
                // 通过GUIManager聚焦窗口
                if (typeof GUIManager !== 'undefined' && this._networkViewWindow.dataset.windowId) {
                    GUIManager.focusWindow(this._networkViewWindow.dataset.windowId);
                }
                this._updateNetworkViewWindow();
                return;
            }
            
            const guiContainer = document.getElementById('gui-container');
            if (!guiContainer) return;
            
            // 创建窗口
            const networkWindow = document.createElement('div');
            networkWindow.className = 'taskmanager-network-window';
            networkWindow.dataset.pid = this.pid.toString();
            
            networkWindow.style.cssText = `
                position: fixed;
                width: 900px;
                height: 700px;
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.85));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                border-radius: var(--style-window-border-radius, 12px);
                box-shadow: var(--style-window-box-shadow-focused, 0 12px 40px rgba(0, 0, 0, 0.5));
                backdrop-filter: var(--style-window-backdrop-filter, blur(30px) saturate(180%));
                -webkit-backdrop-filter: var(--style-window-backdrop-filter, blur(30px) saturate(180%));
                color: var(--theme-text, #d7e0dd);
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 注册到GUIManager（作为子窗口）
            let windowInfo = null;
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('taskmanager');
                }
                
                windowInfo = GUIManager.registerWindow(this.pid, networkWindow, {
                    title: '网络信息',
                    icon: icon,
                    isMainWindow: false, // 标记为子窗口
                    onClose: () => {
                        this._closeNetworkViewWindow();
                    }
                });
            }
            
            guiContainer.appendChild(networkWindow);
            
            // 存储窗口引用
            this._networkViewWindow = networkWindow;
            this._childWindows.set('network', networkWindow);
            
            // 如果GUIManager注册成功，存储窗口ID
            if (windowInfo && windowInfo.windowId) {
                networkWindow.dataset.windowId = windowInfo.windowId;
            }
            
            // 等待GUIManager添加标题栏后再创建内容区域
            // 使用setTimeout确保标题栏已添加
            setTimeout(() => {
                // 创建内容区域（在标题栏之后）
                const content = document.createElement('div');
                content.className = 'taskmanager-network-content';
                content.style.cssText = `
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 20px;
                    min-height: 0;
                    box-sizing: border-box;
                `;
                // 确保内容区域可以滚动
                content.addEventListener('wheel', (e) => {
                    e.stopPropagation();
                }, { passive: true });
                
                // 插入到标题栏之后
                const titleBar = networkWindow.querySelector('.zos-window-titlebar');
                if (titleBar && titleBar.nextSibling) {
                    networkWindow.insertBefore(content, titleBar.nextSibling);
                } else {
                    networkWindow.appendChild(content);
                }
                
                // 更新网络数据（快照，只显示一次）
                this._updateNetworkViewWindow();
            }, 0);
        },
                
        /**
         * 更新网络信息查看窗口
         */
        _updateNetworkViewWindow: async function() {
            if (!this._networkViewWindow) return;
            
            // 使用类名选择器，更可靠
            const content = this._networkViewWindow.querySelector('.taskmanager-network-content') || 
                            this._networkViewWindow.querySelector('div[style*="flex: 1"]');
            if (!content) return;
            
            let html = '<div style="display: flex; flex-direction: column; gap: 24px; width: 100%;">';
            
            // 网络状态
            html += '<div style="background: rgba(108, 142, 255, 0.05); border: 1px solid rgba(108, 142, 255, 0.2); border-radius: 8px; padding: 16px;">';
            html += '<h3 style="color: #6c8eff; font-size: 16px; margin-bottom: 12px; border-bottom: 1px solid rgba(108, 142, 255, 0.2); padding-bottom: 8px;">网络状态</h3>';
            
            // 获取NetworkManager实例
            let networkManager = null;
            if (typeof NetworkManager !== 'undefined') {
                networkManager = NetworkManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    networkManager = POOL.__GET__('KERNEL_GLOBAL_POOL', 'NetworkManager');
                } catch (e) {
                    // 忽略错误
                }
            }
            
            if (networkManager) {
                try {
                    // NetworkManager是实例对象，方法不需要PID参数
                    const isOnline = networkManager.isOnline();
                    const isEnabled = networkManager.isNetworkEnabled ? networkManager.isNetworkEnabled() : true;
                    const connectionInfo = networkManager.getConnectionInfo();
                    const networkStateSnapshot = networkManager.getNetworkStateSnapshot();
                            
                    html += `<div style="margin-bottom: 12px; padding: 12px; background: rgba(108, 142, 255, 0.05); border-radius: 6px;">`;
                    html += `<div style="color: #8da6ff; font-weight: 600; margin-bottom: 4px;">网络状态</div>`;
                    if (!isEnabled) {
                        html += `<div style="color: #9ca3af; font-size: 14px;">✗ 网络已禁用</div>`;
                    } else {
                        html += `<div style="color: ${isOnline ? '#4ade80' : '#ff4444'}; font-size: 14px;">${isOnline ? '✓ 在线' : '✗ 离线'}</div>`;
                    }
                    html += `</div>`;
                    
                    if (connectionInfo) {
                        html += `<div style="margin-bottom: 12px; padding: 12px; background: rgba(108, 142, 255, 0.05); border-radius: 6px;">`;
                        html += `<div style="color: #8da6ff; font-weight: 600; margin-bottom: 4px;">连接信息</div>`;
                        html += `<div style="color: #aab2c0; font-size: 12px; font-family: monospace;">`;
                        html += `<pre style="margin: 0; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(connectionInfo, null, 2)}</pre>`;
                        html += `</div>`;
                        html += `</div>`;
                    }
                    
                    if (networkStateSnapshot) {
                        html += `<div style="margin-bottom: 12px; padding: 12px; background: rgba(108, 142, 255, 0.05); border-radius: 6px;">`;
                        html += `<div style="color: #8da6ff; font-weight: 600; margin-bottom: 4px;">网络状态详情</div>`;
                        html += `<div style="color: #aab2c0; font-size: 12px; font-family: monospace;">`;
                        html += `<pre style="margin: 0; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto;">${JSON.stringify(networkStateSnapshot, null, 2)}</pre>`;
                        html += `</div>`;
                        html += `</div>`;
                    }
                } catch (e) {
                    html += `<div style="color: #ff4444; padding: 12px;">获取网络状态失败: ${e.message}</div>`;
                }
            } else {
                html += '<div style="color: #ff4444; padding: 12px;">NetworkManager 不可用</div>';
            }
            
            html += '</div>';
            
            // 电池信息
            html += '<div style="background: rgba(108, 142, 255, 0.05); border: 1px solid rgba(108, 142, 255, 0.2); border-radius: 8px; padding: 16px;">';
            html += '<h3 style="color: #6c8eff; font-size: 16px; margin-bottom: 12px; border-bottom: 1px solid rgba(108, 142, 255, 0.2); padding-bottom: 8px;">电池信息</h3>';
            
            if (networkManager) {
                try {
                    const batteryInfo = await networkManager.getBatteryInfo();
                            
                            if (batteryInfo) {
                                html += `<div style="margin-bottom: 12px; padding: 12px; background: rgba(108, 142, 255, 0.05); border-radius: 6px;">`;
                                html += `<div style="color: #8da6ff; font-weight: 600; margin-bottom: 8px;">电池状态</div>`;
                                html += `<div style="display: flex; flex-direction: column; gap: 6px;">`;
                                html += `<div style="display: flex; justify-content: space-between;"><span style="color: #aab2c0;">电量:</span><span style="color: #e8ecf0; font-weight: 600;">${(batteryInfo.level * 100).toFixed(1)}%</span></div>`;
                                html += `<div style="display: flex; justify-content: space-between;"><span style="color: #aab2c0;">充电中:</span><span style="color: ${batteryInfo.charging ? '#4ade80' : '#aab2c0'};">${batteryInfo.charging ? '是' : '否'}</span></div>`;
                                if (batteryInfo.chargingTime !== null && batteryInfo.chargingTime !== undefined) {
                                    const hours = Math.floor(batteryInfo.chargingTime / 3600);
                                    const minutes = Math.floor((batteryInfo.chargingTime % 3600) / 60);
                                    html += `<div style="display: flex; justify-content: space-between;"><span style="color: #aab2c0;">充满时间:</span><span style="color: #e8ecf0;">${hours}小时${minutes}分钟</span></div>`;
                                }
                                if (batteryInfo.dischargingTime !== null && batteryInfo.dischargingTime !== undefined) {
                                    const hours = Math.floor(batteryInfo.dischargingTime / 3600);
                                    const minutes = Math.floor((batteryInfo.dischargingTime % 3600) / 60);
                                    html += `<div style="display: flex; justify-content: space-between;"><span style="color: #aab2c0;">剩余时间:</span><span style="color: #e8ecf0;">${hours}小时${minutes}分钟</span></div>`;
                                }
                                html += `</div>`;
                                html += `</div>`;
                                
                                html += `<div style="margin-bottom: 12px; padding: 12px; background: rgba(108, 142, 255, 0.05); border-radius: 6px;">`;
                                html += `<div style="color: #8da6ff; font-weight: 600; margin-bottom: 4px;">详细信息</div>`;
                                html += `<div style="color: #aab2c0; font-size: 12px; font-family: monospace;">`;
                                html += `<pre style="margin: 0; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(batteryInfo, null, 2)}</pre>`;
                                html += `</div>`;
                                html += `</div>`;
                            } else {
                                html += '<div style="color: #aab2c0; padding: 12px;">电池信息不可用（可能设备不支持）</div>';
                            }
                } catch (e) {
                    html += `<div style="color: #ff4444; padding: 12px;">获取电池信息失败: ${e.message}</div>`;
                }
            } else {
                html += '<div style="color: #ff4444; padding: 12px;">NetworkManager 不可用</div>';
            }
            
            html += '</div>';
            html += '</div>';
            
            content.innerHTML = html;
        },
                
        /**
         * 关闭网络信息查看窗口
         */
        _closeNetworkViewWindow: function() {
            if (!this._networkViewWindow) return;
            
            // 清理引用（先清理，避免重复调用）
            const window = this._networkViewWindow;
            this._networkViewWindow = null;
            this._childWindows.delete('network');
            
            // 通过GUIManager注销窗口（这会自动移除DOM）
            if (typeof GUIManager !== 'undefined' && window.dataset.windowId) {
                GUIManager.unregisterWindow(window.dataset.windowId);
            } else {
                // 降级方案：直接移除DOM
                if (window.parentElement) {
                    window.parentElement.removeChild(window);
                }
            }
        },
        
        _getLogColor: function(action) {
            const colorMap = {
                'error': '#ff4444',
                'kill': '#ff4444',
                'crash': '#ff4444',
                'warning': '#fbbf24',
                'timeout': '#fbbf24',
                'start': '#4ade80',
                'init': '#4ade80',
                'allocateMemory': '#6c8eff',
                'default': '#6c8eff'
            };
            return colorMap[action] || colorMap['default'];
        },
        
        _formatBytes: function(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        },
        
        /**
         * 获取进程的内存大小（用于排序）
         */
        _getProcessMemorySize: function(process) {
            // 首先尝试从 process.memoryInfo 获取
            let memInfo = null;
            if (process.memoryInfo) {
                memInfo = process.memoryInfo;
                if (memInfo.programs && memInfo.programs.length > 0) {
                    memInfo = memInfo.programs[0];
                } else if (memInfo.pid === process.pid) {
                    // 如果直接是程序信息对象
                    memInfo = memInfo;
                }
            }
            
            // 如果从 process.memoryInfo 获取失败，尝试直接调用 MemoryManager
            if (!memInfo || !memInfo.totalHeapSize) {
                if (typeof MemoryManager !== 'undefined') {
                    try {
                        // 对于Exploit程序，确保内存已分配
                        if (process.pid === 10000 && typeof KernelMemory !== 'undefined') {
                            try {
                                KernelMemory._ensureMemory();
                            } catch (e) {
                                // 忽略错误
                            }
                        }
                        const memoryResult = MemoryManager.checkMemory(process.pid);
                        if (memoryResult) {
                            if (memoryResult.programs && memoryResult.programs.length > 0) {
                                memInfo = memoryResult.programs[0];
                            } else if (memoryResult.pid === process.pid) {
                                memInfo = memoryResult;
                            }
                        }
                    } catch (e) {
                        // 忽略错误，返回 0
                        return 0;
                    }
                }
            }
            
            // 返回内存大小（优先使用 totalHeapSize，如果没有则使用 heapSize）
            if (memInfo) {
                return memInfo.totalHeapSize || memInfo.heapSize || 0;
            }
            
            return 0;
        },
        
        __exit__: async function() {
            // 停止更新循环
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            
            // 关闭所有子窗口
            // 关闭内存查看窗口
            this._memoryViewWindows.forEach((window, pid) => {
                this._closeMemoryViewWindow(pid);
            });
            this._memoryViewWindows.clear();
            
            // 关闭POOL查看窗口
            if (this._poolViewWindow) {
                this._closePoolViewWindow();
            }
            
            // 关闭网络信息查看窗口
            if (this._networkViewWindow) {
                this._closeNetworkViewWindow();
            }
            
            // 先关闭所有子窗口
            // 关闭所有内存查看窗口
            for (const [pid, window] of this._memoryViewWindows) {
                this._closeMemoryViewWindow(pid);
            }
            
            // 关闭POOL查看窗口
            if (this._poolViewWindow) {
                this._closePoolViewWindow();
            }
            
            // 关闭网络查看窗口
            if (this._networkViewWindow) {
                this._closeNetworkViewWindow();
            }
            
            // 清理所有子窗口引用
            this._childWindows.clear();
            this._memoryViewWindows.clear();
            
            // 注销主窗口（这会自动清理所有相关的窗口）
            if (typeof GUIManager !== 'undefined') {
                // 获取主窗口的窗口ID
                const mainWindows = GUIManager.getWindowsByPid(this.pid);
                const mainWindow = mainWindows.find(w => w.isMainWindow) || mainWindows[0];
                if (mainWindow && mainWindow.windowId) {
                    GUIManager.unregisterWindow(mainWindow.windowId);
                } else {
                    // 降级方案：通过PID注销所有窗口
                    GUIManager.unregisterWindow(this.pid);
                }
            } else {
                // 降级方案：注销事件
                if (typeof EventManager !== 'undefined') {
                    EventManager.unregisterDrag(`taskmanager-window-${this.pid}`);
                }
            }
            
            // 清理 DOM
            if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
        },
        
        /**
         * 初始化内存管理
         */
        _initMemory: function(pid) {
            if (!pid) {
                // 静默处理，避免日志过多
                return;
            }
            
            // 确保内存已分配
            if (typeof MemoryUtils !== 'undefined') {
                const mem = MemoryUtils.ensureMemory(pid, 50000, 1000);
                if (mem) {
                    this._heap = mem.heap;
                    this._shed = mem.shed;
                }
            } else if (typeof MemoryManager !== 'undefined') {
                // 降级方案：直接使用MemoryManager
                try {
                    const result = MemoryManager.allocateMemory(pid, 50000, 1000, 1, 1);
                    this._heap = result.heap;
                    this._shed = result.shed;
                } catch (e) {
                    console.error('TaskManager: Error allocating memory', e);
                }
            }
        },
        
        /**
         * 数据访问方法（getter/setter）
         */
        _getSelectedPid: function() {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                const pid = MemoryUtils.loadData(this.pid, this._selectedPidKey);
                return pid !== null ? pid : null;
            }
            return null;
        },
        
        _setSelectedPid: function(value) {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                MemoryUtils.storeData(this.pid, this._selectedPidKey, value);
            }
        },
        
        _getFilterExited: function() {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                const value = MemoryUtils.loadData(this.pid, this._filterExitedKey);
                return value !== null ? value : true;
            }
            return true;
        },
        
        _setFilterExited: function(value) {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                MemoryUtils.storeData(this.pid, this._filterExitedKey, value);
            }
        },
        
        _getLogFilter: function() {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                return MemoryUtils.loadString(this.pid, this._logFilterKey) || 'all';
            }
            return 'all';
        },
        
        _setLogFilter: function(value) {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                MemoryUtils.storeString(this.pid, this._logFilterKey, value || 'all');
            }
        },
        
        __info__: function() {
            return {
                name: '任务管理器',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS 任务管理器 - 进程管理、资源监控和系统检测',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.PROCESS_MANAGE,
                    PermissionManager.PERMISSION.KERNEL_MEMORY_READ,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        }
    };
    
    // 导出
    if (typeof window !== 'undefined') {
        window.TASKMANAGER = TASKMANAGER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.TASKMANAGER = TASKMANAGER;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

