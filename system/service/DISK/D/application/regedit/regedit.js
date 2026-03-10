// ZerOS 注册表编辑器
// 提供图形化的注册表编辑功能，类似Windows的regedit

(function(window) {
    'use strict';
    
    const REGEDIT = {
        pid: null,
        window: null,
        treeContainer: null,
        valueContainer: null,
        selectedPath: null,
        storageData: null,
        refreshTimer: null,
        _refreshInFlight: false,
        _autoRefreshIntervalMs: 5000,
        _lastAutoRefreshDataRef: null,
        _lastAutoRefreshStorageType: null,
        _lastAutoRefreshStamp: 0,
        _applicationTableCache: null,
        childWindows: [], // 子窗口列表
        currentStorageType: 'localSData', // 当前编辑的存储类型：'localSData'、'localCache' 或 'applicationTable'
        _selectedValue: null, // 当前选中的值 { parentPath, key, row }
        _languageChangeUnsubscribe: null,
        _history: [], // 导航历史
        _historyIndex: -1, // 当前历史位置
        _maxHistorySize: 50, // 最大历史记录数

        /** 多语言文案：优先使用 LanguagesExpansion，否则返回 fallback */
        _getText: function(key, fallback) {
            try {
                const LanguagesExpansion = (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function')
                    ? POOL.__GET__('KERNEL_GLOBAL_POOL', 'LanguagesExpansion')
                    : (typeof window !== 'undefined' ? window.LanguagesExpansion : null);
                if (LanguagesExpansion && typeof LanguagesExpansion.getText === 'function') {
                    const value = LanguagesExpansion.getText(key);
                    if (value && value !== key) return value;
                }
            } catch (e) {}
            return fallback != null ? fallback : key;
        },

        /** 当前存储类型的显示标签（多语言） */
        _getStorageTypeLabel: function(storageType) {
            if (storageType === 'localCache') return this._getText('REGEDIT_LOCAL_CACHE', 'LocalCache');
            if (storageType === 'applicationTable') return this._getText('REGEDIT_APPLICATION_TABLE', 'ApplicationTable');
            return this._getText('REGEDIT_LOCAL_SDATA', 'LocalSData');
        },

        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 获取 GUI 容器（优先使用内核提供的容器，避免脱离 stacking context）
            const guiContainer =
                (initArgs && initArgs.guiContainer)
                || (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getGUIContainer === 'function'
                    ? ProcessManager.getGUIContainer()
                    : null)
                || document.getElementById('gui-container')
                || document.body;
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'regedit-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            
            // 设置窗口样式
            if (typeof GUIManager === 'undefined') {
                this.window.style.cssText = `
                    width: 1000px;
                    height: 700px;
                    display: flex;
                    flex-direction: column;
                    background: transparent;
                    border: 1px solid rgba(108, 142, 255, 0.3);
                    border-radius: 12px;
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(30px) saturate(180%);
                    -webkit-backdrop-filter: blur(30px) saturate(180%);
                    overflow: hidden;
                `;
            } else {
                this.window.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                `;
            }
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('regedit');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: this._getText('REGEDIT_TITLE', '注册表编辑器'),
                    icon: icon,
                    onClose: () => {
                        // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                        // 窗口关闭由 GUIManager._closeWindow 统一处理
                        // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                        // 这样可以确保程序多实例（不同 PID）互不影响
                    }
                });
                // 保存窗口ID，用于精确清理
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 创建菜单栏（工具栏）
            const menuBar = this._createMenuBar();
            this.window.appendChild(menuBar);
            
            // 创建主内容区域（左右分栏）
            const content = document.createElement('div');
            content.className = 'regedit-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
                min-height: 0;
            `;
            
            // 创建左侧树形结构
            const leftPanel = document.createElement('div');
            leftPanel.className = 'regedit-tree-panel';
            leftPanel.style.cssText = `
                width: 300px;
                border-right: 1px solid rgba(108, 142, 255, 0.2);
                overflow-y: auto;
                overflow-x: hidden;
                background: rgba(20, 20, 30, 0.3);
            `;
            this.treeContainer = document.createElement('div');
            this.treeContainer.className = 'regedit-tree';
            this.treeContainer.addEventListener('click', (e) => {
                const item = e.target.closest('.regedit-tree-item');
                if (!item) return;
                const path = (item.dataset.path !== undefined) ? item.dataset.path : '';
                const hasChildren = item.dataset.hasChildren === 'true';
                if (hasChildren) {
                    item.dataset.expanded = item.dataset.expanded === 'true' ? 'false' : 'true';
                    requestAnimationFrame(() => { this._renderTree(); });
                }
                this._selectPath(path);
            });
            leftPanel.appendChild(this.treeContainer);
            content.appendChild(leftPanel);
            
            // 创建右侧键值对列表
            const rightPanel = document.createElement('div');
            rightPanel.className = 'regedit-value-panel';
            rightPanel.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                min-width: 0;
            `;
            
            // 创建面包屑导航栏
            const breadcrumbBar = document.createElement('div');
            breadcrumbBar.className = 'regedit-breadcrumb-bar';
            breadcrumbBar.style.cssText = `
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: rgba(20, 20, 30, 0.4);
                border-bottom: 1px solid rgba(108, 142, 255, 0.15);
                font-size: 13px;
                min-height: 36px;
                overflow-x: auto;
                white-space: nowrap;
            `;
            
            const breadcrumbContainer = document.createElement('div');
            breadcrumbContainer.className = 'regedit-breadcrumb';
            breadcrumbContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
            `;
            
            // 根节点
            const rootItem = document.createElement('span');
            rootItem.textContent = this._getText('REGEDIT_ROOT', '根');
            rootItem.style.cssText = `
                color: rgba(108, 142, 255, 0.8);
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 3px;
                transition: background 0.2s;
            `;
            rootItem.addEventListener('click', () => {
                this._selectPath('');
                this._renderTree();
            });
            rootItem.addEventListener('mouseenter', () => {
                rootItem.style.background = 'rgba(108, 142, 255, 0.15)';
            });
            rootItem.addEventListener('mouseleave', () => {
                rootItem.style.background = 'transparent';
            });
            breadcrumbContainer.appendChild(rootItem);
            
            // 存储类型节点（如果已选择）
            this._updateBreadcrumb = (path) => {
                breadcrumbContainer.innerHTML = '';
                
                // 根节点
                const root = document.createElement('span');
                root.textContent = this._getText('REGEDIT_ROOT', '根');
                root.style.cssText = `
                    color: rgba(108, 142, 255, 0.8);
                    cursor: pointer;
                    padding: 2px 6px;
                    border-radius: 3px;
                    transition: background 0.2s;
                `;
                root.addEventListener('click', () => {
                    this._selectPath('');
                    this._renderTree();
                });
                root.addEventListener('mouseenter', () => {
                    root.style.background = 'rgba(108, 142, 255, 0.15)';
                });
                root.addEventListener('mouseleave', () => {
                    root.style.background = 'transparent';
                });
                breadcrumbContainer.appendChild(root);
                
                if (!path) return;
                
                const parts = path.split('.');
                let currentPath = '';
                
                parts.forEach((part, index) => {
                    // 分隔符
                    const sep = document.createElement('span');
                    sep.textContent = '›';
                    sep.style.cssText = `
                        color: rgba(215, 224, 221, 0.4);
                        margin: 0 2px;
                    `;
                    breadcrumbContainer.appendChild(sep);
                    
                    // 路径部分
                    currentPath = currentPath ? `${currentPath}.${part}` : part;
                    const partEl = document.createElement('span');
                    partEl.textContent = part;
                    partEl.style.cssText = `
                        color: ${index === parts.length - 1 ? 'var(--theme-text, #d7e0dd)' : 'rgba(215, 224, 221, 0.7)'};
                        cursor: pointer;
                        padding: 2px 6px;
                        border-radius: 3px;
                        transition: background 0.2s;
                        font-weight: ${index === parts.length - 1 ? '500' : '400'};
                    `;
                    if (index < parts.length - 1) {
                        partEl.addEventListener('click', () => {
                            this._selectPath(currentPath);
                            this._renderTree();
                        });
                        partEl.addEventListener('mouseenter', () => {
                            partEl.style.background = 'rgba(108, 142, 255, 0.15)';
                        });
                        partEl.addEventListener('mouseleave', () => {
                            partEl.style.background = 'transparent';
                        });
                    }
                    breadcrumbContainer.appendChild(partEl);
                });
            };
            
            breadcrumbBar.appendChild(breadcrumbContainer);
            rightPanel.appendChild(breadcrumbBar);
            
            // 创建值列表头部（列头）
            const valueHeader = document.createElement('div');
            valueHeader.className = 'regedit-value-header';
            valueHeader.style.cssText = `
                height: 30px;
                display: flex;
                align-items: center;
                padding: 0 10px;
                background: rgba(30, 30, 46, 0.5);
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                font-size: 12px;
                color: rgba(215, 224, 221, 0.8);
            `;
            valueHeader.innerHTML = `
                <div style="width: 200px; font-weight: bold;">` + this._getText('KEY_NAME', '名称') + `</div>
                <div style="flex: 1; font-weight: bold;">` + this._getText('REGEDIT_DATA', '数据') + `</div>
            `;
            rightPanel.appendChild(valueHeader);
            
            // 创建值列表容器
            this.valueContainer = document.createElement('div');
            this.valueContainer.className = 'regedit-value-list';
            this.valueContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
            `;
            rightPanel.appendChild(this.valueContainer);
            
            // 创建状态栏
            const statusBar = document.createElement('div');
            statusBar.className = 'regedit-status-bar';
            statusBar.style.cssText = `
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 12px;
                background: rgba(20, 20, 30, 0.4);
                border-top: 1px solid rgba(108, 142, 255, 0.15);
                font-size: 11px;
                color: rgba(215, 224, 221, 0.5);
            `;
            
            const itemCount = document.createElement('span');
            itemCount.className = 'regedit-item-count';
            itemCount.textContent = this._getText('REGEDIT_READY', '就绪');
            statusBar.appendChild(itemCount);
            
            const storageInfo = document.createElement('span');
            storageInfo.className = 'regedit-storage-info';
            storageInfo.textContent = this._getStorageTypeLabel(this.currentStorageType);
            statusBar.appendChild(storageInfo);
            
            // 保存引用以便更新
            this._statusItemCount = itemCount;
            this._statusStorageInfo = storageInfo;
            
            rightPanel.appendChild(statusBar);
            
            content.appendChild(rightPanel);
            this.window.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 加载注册表数据
            await this._loadRegistryData();
            
            // 验证数据加载
            if (!this.storageData || !this.storageData.system) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('RegEdit', '数据加载异常', { storageData: this.storageData });
                }
            }
            
            // 渲染树形结构
            this._renderTree();
            
            // 默认选择根节点
            this._selectPath('');
            
            // 注册右键菜单
            this._registerContextMenu();
            
            // 注册键盘快捷键（Delete 删除选中值）
            this._registerKeyboardShortcuts();
            
            // 启动定时刷新
            this.refreshTimer = setInterval(() => {
                this._refreshData({ auto: true });
            }, this._autoRefreshIntervalMs);
            
            // 语言变更时刷新界面文案
            const LanguagesExpansion = (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function')
                ? POOL.__GET__('KERNEL_GLOBAL_POOL', 'LanguagesExpansion')
                : (typeof window !== 'undefined' ? window.LanguagesExpansion : null);
            if (LanguagesExpansion && typeof LanguagesExpansion.onLanguageChange === 'function') {
                this._languageChangeUnsubscribe = LanguagesExpansion.onLanguageChange(() => {
                    this._refreshAllUITexts();
                });
            }
        },
        
        /**
         * 创建菜单栏（工具栏）
         */
        _createMenuBar: function() {
            const menuBar = document.createElement('div');
            menuBar.className = 'regedit-menu-bar';
            menuBar.style.cssText = `
                display: flex;
                align-items: center;
                padding: 8px 15px;
                background: rgba(20, 20, 30, 0.5);
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                gap: 10px;
            `;
            
            // 存储类型切换标签
            const typeLabel = document.createElement('div');
            typeLabel.className = 'regedit-type-label';
            typeLabel.textContent = this._getText('REGEDIT_STORAGE_TYPE', '存储类型:');
            typeLabel.style.cssText = `
                color: rgba(215, 224, 221, 0.7);
                font-size: 12px;
                margin-right: 5px;
            `;
            menuBar.appendChild(typeLabel);
            
            // 存储类型切换按钮组
            const buttonGroup = document.createElement('div');
            buttonGroup.style.cssText = `
                display: flex;
                gap: 5px;
            `;
            
            const storageTypes = [
                { value: 'localSData', labelKey: 'REGEDIT_LOCAL_SDATA', label: this._getText('REGEDIT_LOCAL_SDATA', 'LocalSData') },
                { value: 'localCache', labelKey: 'REGEDIT_LOCAL_CACHE', label: this._getText('REGEDIT_LOCAL_CACHE', 'LocalCache') },
                { value: 'applicationTable', labelKey: 'REGEDIT_APPLICATION_TABLE', label: this._getText('REGEDIT_APPLICATION_TABLE', 'ApplicationTable') }
            ];
            
            const self = this;
            storageTypes.forEach(type => {
                const btn = this._createMenuButton(type.label, async () => {
                    if (self.currentStorageType !== type.value) {
                        self.currentStorageType = type.value;
                        await self._loadRegistryData({ forceReload: false });
                        self._renderTree();
                        self._selectPath('');
                        // 更新按钮状态
                        buttonGroup.querySelectorAll('.regedit-storage-btn').forEach(b => {
                            if (b.dataset.storageType === type.value) {
                                b.style.background = 'rgba(108, 142, 255, 0.3)';
                                b.style.borderColor = 'rgba(108, 142, 255, 0.6)';
} else {
                    b.style.background = 'transparent';
                    b.style.borderColor = 'rgba(108, 142, 255, 0.2)';
                }
                        });
                    }
                });
                
                btn.className = 'regedit-storage-btn';
                btn.dataset.storageType = type.value;
                // 设置初始状态
                if (self.currentStorageType === type.value) {
                    btn.style.background = 'rgba(108, 142, 255, 0.3)';
                    btn.style.borderColor = 'rgba(108, 142, 255, 0.6)';
                } else {
                    btn.style.background = 'transparent';
                    btn.style.borderColor = 'rgba(108, 142, 255, 0.2)';
                }
                
                btn.style.border = '1px solid';
                btn.style.borderRadius = '4px';
                buttonGroup.appendChild(btn);
            });
            
            menuBar.appendChild(buttonGroup);
            
            // 前进/后退按钮组
            const historyGroup = document.createElement('div');
            historyGroup.style.cssText = `
                display: flex;
                gap: 4px;
                margin-left: 15px;
            `;
            
            const backBtn = document.createElement('button');
            backBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>';
            backBtn.className = 'regedit-history-back';
            backBtn.title = this._getText('REGEDIT_BACK', '后退 (Alt+←)');
            backBtn.style.cssText = `
                padding: 6px 8px;
                background: transparent;
                border: 1px solid rgba(108, 142, 255, 0.2);
                border-radius: 4px;
                color: rgba(215, 224, 221, 0.7);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                opacity: 0.4;
            `;
            backBtn.addEventListener('click', () => self._goBack());
            backBtn.addEventListener('mouseenter', () => {
                if (backBtn.style.opacity !== '0.4') {
                    backBtn.style.background = 'rgba(108, 142, 255, 0.2)';
                }
            });
            backBtn.addEventListener('mouseleave', () => {
                backBtn.style.background = 'transparent';
            });
            
            const forwardBtn = document.createElement('button');
            forwardBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>';
            forwardBtn.className = 'regedit-history-forward';
            forwardBtn.title = this._getText('REGEDIT_FORWARD', '前进 (Alt+→)');
            forwardBtn.style.cssText = `
                padding: 6px 8px;
                background: transparent;
                border: 1px solid rgba(108, 142, 255, 0.2);
                border-radius: 4px;
                color: rgba(215, 224, 221, 0.7);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                opacity: 0.4;
            `;
            forwardBtn.addEventListener('click', () => self._goForward());
            forwardBtn.addEventListener('mouseenter', () => {
                if (forwardBtn.style.opacity !== '0.4') {
                    forwardBtn.style.background = 'rgba(108, 142, 255, 0.2)';
                }
            });
            forwardBtn.addEventListener('mouseleave', () => {
                forwardBtn.style.background = 'transparent';
            });
            
            historyGroup.appendChild(backBtn);
            historyGroup.appendChild(forwardBtn);
            menuBar.appendChild(historyGroup);
            
            // 刷新按钮
            const refreshBtn = this._createMenuButton(this._getText('KEY_REFRESH', '刷新'), async () => {
                await self._refreshData({ forceReload: true });
                self._renderTree();
                self._renderValues(self.selectedPath);
            });
            refreshBtn.className = 'regedit-refresh-btn';
            refreshBtn.style.marginLeft = 'auto';
            menuBar.appendChild(refreshBtn);

            // 搜索框
            const searchContainer = document.createElement('div');
            searchContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                margin-left: 10px;
            `;

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = this._getText('REGEDIT_SEARCH', '搜索...');
            searchInput.className = 'regedit-search-input';
            searchInput.style.cssText = `
                width: 150px;
                padding: 6px 12px;
                background: rgba(20, 20, 30, 0.5);
                border: 1px solid rgba(108, 142, 255, 0.3);
                border-radius: 4px;
                color: var(--theme-text, #d7e0dd);
                font-size: 12px;
                outline: none;
                transition: border-color 0.2s, width 0.2s;
            `;
            searchInput.addEventListener('focus', () => {
                searchInput.style.borderColor = 'rgba(108, 142, 255, 0.6)';
                searchInput.style.width = '250px';
            });
            searchInput.addEventListener('blur', () => {
                searchInput.style.borderColor = 'rgba(108, 142, 255, 0.3)';
                if (!searchInput.value) {
                    searchInput.style.width = '150px';
                }
            });
            searchInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    const query = searchInput.value.trim();
                    if (query) {
                        await self._searchRegistry(query);
                    }
                }
            });

            const searchBtn = document.createElement('button');
            searchBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
            searchBtn.className = 'regedit-search-btn';
            searchBtn.style.cssText = `
                padding: 6px 10px;
                background: transparent;
                border: 1px solid rgba(108, 142, 255, 0.3);
                border-radius: 4px;
                color: rgba(215, 224, 221, 0.7);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            `;
            searchBtn.addEventListener('mouseenter', () => {
                searchBtn.style.background = 'rgba(108, 142, 255, 0.2)';
                searchBtn.style.borderColor = 'rgba(108, 142, 255, 0.5)';
            });
            searchBtn.addEventListener('mouseleave', () => {
                searchBtn.style.background = 'transparent';
                searchBtn.style.borderColor = 'rgba(108, 142, 255, 0.3)';
            });
            searchBtn.addEventListener('click', async () => {
                const query = searchInput.value.trim();
                if (query) {
                    await self._searchRegistry(query);
                }
            });

            searchContainer.appendChild(searchInput);
            searchContainer.appendChild(searchBtn);
            menuBar.appendChild(searchContainer);
            
            return menuBar;
        },
        
        /**
         * 语言切换后刷新所有界面文案
         */
        _refreshAllUITexts: function() {
            if (!this.window) return;
            const titleEl = this.window.querySelector('.zos-window-title');
            if (titleEl) titleEl.textContent = this._getText('REGEDIT_TITLE', '注册表编辑器');
            const fileEl = this.window.querySelector('.regedit-menu-file');
            if (fileEl) fileEl.textContent = this._getText('REGEDIT_MENU_FILE', '文件(F)');
            const editEl = this.window.querySelector('.regedit-menu-edit');
            if (editEl) editEl.textContent = this._getText('REGEDIT_MENU_EDIT', '编辑(E)');
            const viewEl = this.window.querySelector('.regedit-menu-view');
            if (viewEl) viewEl.textContent = this._getText('REGEDIT_MENU_VIEW', '查看(V)');
            const refreshEl = this.window.querySelector('.regedit-menu-refresh');
            if (refreshEl) refreshEl.textContent = this._getText('REGEDIT_MENU_REFRESH', '刷新(R)');
            const storageTypeBtn = this.window.querySelector('.regedit-storage-type-btn');
            if (storageTypeBtn) storageTypeBtn.textContent = this._getStorageTypeLabel(this.currentStorageType);
            const valueHeader = this.window.querySelector('.regedit-value-header');
            if (valueHeader) {
                valueHeader.innerHTML = '<div style="width: 200px; font-weight: bold;">' + this._getText('KEY_NAME', '名称') + '</div><div style="flex: 1; font-weight: bold;">' + this._getText('REGEDIT_DATA', '数据') + '</div>';
            }
            this._renderTree();
            if (this.selectedPath !== undefined && this.selectedPath !== null) {
                this._renderValues(this.selectedPath);
            }
            this.childWindows.forEach(function(cw) {
                const key = cw.key != null ? cw.key : (cw.path ? cw.path.split('.').pop() : '');
                const titleEl = cw.window && cw.window.querySelector ? cw.window.querySelector('.zos-window-title') : null;
                if (titleEl && key) titleEl.textContent = key + ' - ' + this._getText('REGEDIT_TITLE', '注册表编辑器');
            }.bind(this));
        },

        /**
         * 搜索注册表
         * @param {string} query 搜索关键词
         */
        _searchRegistry: async function(query) {
            if (!this.storageData || !query) return;

            const results = [];
            const lowerQuery = query.toLowerCase();
            const storageType = this.currentStorageType;

            // 递归搜索函数
            const searchObject = (obj, path, currentStorageType) => {
                if (!obj || typeof obj !== 'object') return;

                for (const key in obj) {
                    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
                    
                    const currentPath = path ? `${path}.${key}` : key;
                    const value = obj[key];

                    // 检查键名是否匹配
                    if (key.toLowerCase().includes(lowerQuery)) {
                        results.push({
                            key: key,
                            path: currentPath,
                            value: value,
                            matchType: 'key',
                            storageType: currentStorageType
                        });
                    }

                    // 检查值是否匹配
                    if (value !== null && value !== undefined) {
                        const valueStr = String(value).toLowerCase();
                        if (valueStr.includes(lowerQuery)) {
                            results.push({
                                key: key,
                                path: currentPath,
                                value: value,
                                matchType: 'value',
                                storageType: currentStorageType
                            });
                        }
                    }

                    // 递归搜索子对象
                    if (value && typeof value === 'object' && !Array.isArray(value)) {
                        searchObject(value, currentPath, currentStorageType);
                    }
                }
            };

            // 根据当前存储类型搜索
            if (storageType === 'localSData' && this.storageData.system) {
                searchObject(this.storageData.system, 'system', 'localSData');
            } else if (storageType === 'localCache' && this.storageData.applications) {
                searchObject(this.storageData.applications, 'applications', 'localCache');
            } else if (storageType === 'applicationTable' && this.storageData.programs) {
                searchObject(this.storageData.programs, 'programs', 'applicationTable');
            }

            // 显示搜索结果
            this._showSearchResults(results, query);
        },

        /**
         * 显示搜索结果
         * @param {Array} results 搜索结果
         * @param {string} query 搜索关键词
         */
        _showSearchResults: function(results, query) {
            if (!this.valueContainer) return;

            this.valueContainer.innerHTML = '';

            // 创建搜索结果头部
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 12px 16px;
                background: rgba(30, 30, 46, 0.5);
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            const resultCount = document.createElement('div');
            resultCount.style.cssText = `
                color: rgba(215, 224, 221, 0.8);
                font-size: 13px;
            `;
            resultCount.textContent = this._getText('REGEDIT_SEARCH_RESULTS', '搜索结果') + `: ${results.length} ${this._getText('REGEDIT_FOUND_ITEMS', '项')}`;
            header.appendChild(resultCount);

            const clearBtn = document.createElement('button');
            clearBtn.textContent = this._getText('REGEDIT_CLEAR_SEARCH', '清除搜索');
            clearBtn.style.cssText = `
                padding: 4px 12px;
                background: transparent;
                border: 1px solid rgba(108, 142, 255, 0.3);
                border-radius: 4px;
                color: rgba(215, 224, 221, 0.7);
                font-size: 12px;
                cursor: pointer;
            `;
            clearBtn.addEventListener('click', () => {
                this._renderValues(this.selectedPath);
            });
            header.appendChild(clearBtn);

            this.valueContainer.appendChild(header);

            if (results.length === 0) {
                const noResult = document.createElement('div');
                noResult.style.cssText = `
                    padding: 40px;
                    text-align: center;
                    color: rgba(215, 224, 221, 0.5);
                `;
                noResult.textContent = this._getText('REGEDIT_NO_RESULTS', '未找到匹配项');
                this.valueContainer.appendChild(noResult);
                return;
            }

            // 限制显示结果数量
            const maxResults = 100;
            const displayResults = results.slice(0, maxResults);

            // 创建结果列表
            const listContainer = document.createElement('div');
            listContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
            `;

            displayResults.forEach(result => {
                const item = document.createElement('div');
                item.style.cssText = `
                    padding: 10px 16px;
                    border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                    cursor: pointer;
                    transition: background 0.2s;
                `;
                item.addEventListener('mouseenter', () => {
                    item.style.background = 'rgba(108, 142, 255, 0.1)';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.background = 'transparent';
                });
                item.addEventListener('click', () => {
                    this._selectPath(result.path);
                    this._renderTree();
                    // 展开到目标路径
                    const pathParts = result.path.split('.');
                    const treeItems = this.treeContainer.querySelectorAll('.regedit-tree-item');
                    treeItems.forEach(treeItem => {
                        const itemPath = treeItem.dataset.path;
                        if (itemPath && result.path.startsWith(itemPath)) {
                            treeItem.dataset.expanded = 'true';
                        }
                    });
                    this._renderTree();
                });

                const keyName = document.createElement('div');
                keyName.style.cssText = `
                    color: var(--theme-text, #d7e0dd);
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 4px;
                `;
                keyName.textContent = result.key;
                
                // 添加匹配类型标签
                if (result.matchType === 'key') {
                    const tag = document.createElement('span');
                    tag.textContent = '键名';
                    tag.style.cssText = `
                        display: inline-block;
                        padding: 2px 6px;
                        background: rgba(76, 175, 80, 0.2);
                        color: #4CAF50;
                        border-radius: 3px;
                        font-size: 10px;
                        margin-left: 8px;
                    `;
                    keyName.appendChild(tag);
                }

                item.appendChild(keyName);

                const pathInfo = document.createElement('div');
                pathInfo.style.cssText = `
                    color: rgba(215, 224, 221, 0.5);
                    font-size: 11px;
                    margin-bottom: 4px;
                    word-break: break-all;
                `;
                pathInfo.textContent = result.path;
                item.appendChild(pathInfo);

                const valueInfo = document.createElement('div');
                valueInfo.style.cssText = `
                    color: rgba(215, 224, 221, 0.7);
                    font-size: 12px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 400px;
                `;
                const valueStr = result.value !== null && result.value !== undefined ? String(result.value) : '(null)';
                if (result.matchType === 'value') {
                    // 高亮匹配的值
                    const regex = new RegExp(`(${query})`, 'gi');
                    valueInfo.innerHTML = valueStr.replace(regex, '<mark style="background: rgba(255, 235, 59, 0.3); color: inherit;">$1</mark>');
                } else {
                    valueInfo.textContent = valueStr;
                }
                item.appendChild(valueInfo);

                listContainer.appendChild(item);
            });

            if (results.length > maxResults) {
                const more = document.createElement('div');
                more.style.cssText = `
                    padding: 12px;
                    text-align: center;
                    color: rgba(215, 224, 221, 0.5);
                    font-size: 12px;
                `;
                more.textContent = `... 还有 ${results.length - maxResults} 项结果`;
                listContainer.appendChild(more);
            }

            this.valueContainer.appendChild(listContainer);
        },

        /**
         * 加载注册表数据
         */
        _loadRegistryData: async function(options) {
            try {
                const forceReload = !!(options && options.forceReload);
                if (this.currentStorageType === 'localCache') {
                    // 加载 LocalCache.json（CacheDrive 的元数据）
                    if (typeof ProcessManager === 'undefined') {
                        throw new Error('ProcessManager 不可用');
                    }
                    
                    // 确保 CacheDrive 已初始化
                    if (typeof CacheDrive === 'undefined') {
                        throw new Error('CacheDrive 不可用');
                    }
                    
                    if (!CacheDrive._initialized) {
                        await CacheDrive.init();
                    }
                    
                    if (forceReload) {
                        await CacheDrive._loadCacheMetadata(true);
                    } else if (!CacheDrive._cacheMetadata) {
                        await CacheDrive._loadCacheMetadata(false);
                    }
                    
                    // 直接访问_cacheMetadata（注册表编辑器需要访问完整数据）
                    this.storageData = CacheDrive._cacheMetadata;
                    
                    if (!this.storageData) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('RegEdit', 'cacheMetadata 为 null，使用默认值');
                        }
                        this.storageData = {
                            system: {},
                            programs: {}
                        };
                    } else {
                        // 确保 system 和 programs 存在
                        if (!this.storageData.system) {
                            this.storageData.system = {};
                        }
                        if (!this.storageData.programs) {
                            this.storageData.programs = {};
                        }
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('RegEdit', `LocalCache 数据加载成功，system键数: ${Object.keys(this.storageData.system).length}, programs键数: ${Object.keys(this.storageData.programs).length}`);
                        }
                    }
                } else if (this.currentStorageType === 'applicationTable') {
                    // 加载 ApplicationTable.json（动态安装的应用程序注册表）
                    if (typeof LStorage === 'undefined') {
                        throw new Error('LStorage 不可用');
                    }
                    
                    // 确保LStorage已初始化
                    if (!LStorage._initialized) {
                        await LStorage.init();
                    }
                    
                    let applicationTable = null;
                    if (forceReload || !this._applicationTableCache) {
                        applicationTable = await LStorage.getSystemStorage('applicationTable');
                        this._applicationTableCache = applicationTable || {};
                    } else {
                        applicationTable = this._applicationTableCache;
                    }
                    
                    // ApplicationTable 是一个对象，键是程序名，值是程序资源对象
                    // 为了统一显示，我们将其包装为 { applications: {...} } 格式
                    this.storageData = {
                        applications: applicationTable || {}
                    };
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('RegEdit', `ApplicationTable 数据加载成功，应用程序数: ${Object.keys(this.storageData.applications).length}`);
                    }
                } else {
                    // 加载 LocalSData.json（LStorage 的数据）
                if (typeof LStorage === 'undefined') {
                    throw new Error('LStorage 不可用');
                }
                
                // 确保LStorage已初始化
                if (!LStorage._initialized) {
                    await LStorage.init();
                }

                if (forceReload) {
                    if (typeof LStorage !== 'undefined' && typeof LStorage.clearCache === 'function') {
                        LStorage.clearCache();
                    }
                    await LStorage._loadStorageData(false);
                }
                
                // 直接访问_storageData（注册表编辑器需要访问完整数据）
                this.storageData = LStorage._storageData;
                
                if (!this.storageData) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('RegEdit', 'storageData 为 null，使用默认值');
                        }
                    this.storageData = {
                        system: {},
                        programs: {}
                    };
                } else {
                    // 确保 system 和 programs 存在
                    if (!this.storageData.system) {
                        this.storageData.system = {};
                    }
                    if (!this.storageData.programs) {
                        this.storageData.programs = {};
                    }
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('RegEdit', `LocalSData 数据加载成功，system键数: ${Object.keys(this.storageData.system).length}, programs键数: ${Object.keys(this.storageData.programs).length}`);
                        }
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('RegEdit', '加载注册表数据失败', error);
                }
                if (this.currentStorageType === 'applicationTable') {
                    this.storageData = {
                        applications: {}
                    };
                } else {
                    this.storageData = {
                        system: {},
                        programs: {}
                    };
                }
            }
        },
        
        /**
         * 刷新数据
         */
        _refreshData: async function(options) {
            try {
                if (this._refreshInFlight) return;
                if (!this.window || !this.window.isConnected) return;
                if (options && options.auto && typeof document !== 'undefined' && document.hidden) return;
                if (options && options.auto && this.currentStorageType === 'applicationTable') return;

                this._refreshInFlight = true;
                const prevDataRef = this.storageData;
                const prevStorageType = this.currentStorageType;
                await this._loadRegistryData(options);

                const dataRefChanged = this.storageData !== prevDataRef || this.currentStorageType !== prevStorageType;
                if (options && options.auto && !dataRefChanged) {
                    let currentStamp = 0;
                    if (this.currentStorageType === 'localSData' && typeof LStorage !== 'undefined' && LStorage._requestCache) {
                        currentStamp = LStorage._requestCache.readCacheTime || 0;
                    } else if (this.currentStorageType === 'localCache' && typeof CacheDrive !== 'undefined' && CacheDrive._requestCache) {
                        currentStamp = CacheDrive._requestCache.timestamp || 0;
                    }
                    if (this._lastAutoRefreshDataRef === this.storageData &&
                        this._lastAutoRefreshStorageType === this.currentStorageType &&
                        this._lastAutoRefreshStamp === currentStamp) {
                        return;
                    }
                    this._lastAutoRefreshStamp = currentStamp;
                }
                this._lastAutoRefreshDataRef = this.storageData;
                this._lastAutoRefreshStorageType = this.currentStorageType;

                if (this.selectedPath !== undefined && this.selectedPath !== null) {
                    this._renderValues(this.selectedPath);
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('RegEdit', '刷新数据失败', error);
                }
            } finally {
                this._refreshInFlight = false;
            }
        },
        
        /**
         * 渲染树形结构
         */
        _renderTree: function() {
            if (!this.treeContainer) return;
            
            // 保存展开状态
            const expandedPaths = new Set();
            const items = this.treeContainer.querySelectorAll('.regedit-tree-item');
            items.forEach(item => {
                if (item.dataset.expanded === 'true') {
                    expandedPaths.add(item.dataset.path || '');
                }
            });
            
            this.treeContainer.innerHTML = '';
            
            // 根节点
            const root = document.createElement('div');
            root.className = 'regedit-tree-item';
            root.dataset.path = '';
            root.style.cssText = `
                padding: 5px 10px;
                cursor: pointer;
                user-select: none;
                color: rgba(215, 224, 221, 0.9);
                font-size: 13px;
            `;
            let rootLabel;
            if (this.currentStorageType === 'localCache') {
                rootLabel = this._getText('REGEDIT_LOCAL_CACHE', 'LocalCache');
            } else if (this.currentStorageType === 'applicationTable') {
                rootLabel = this._getText('REGEDIT_APPLICATION_TABLE', 'ApplicationTable');
            } else {
                rootLabel = this._getText('REGEDIT_LOCAL_SDATA', 'LocalSData');
            }
            root.innerHTML = `<span style="margin-right: 5px;">📁</span>${rootLabel}`;
            root.dataset.hasChildren = 'false';
            this.treeContainer.appendChild(root);
            
            if (this.currentStorageType === 'applicationTable') {
                // ApplicationTable 节点
                const applicationsNode = this._createTreeNode('applications', this._getText('REGEDIT_APPLICATIONS', 'Applications'), this.storageData.applications || {}, expandedPaths, 0);
                this.treeContainer.appendChild(applicationsNode);
                // 注意：applications 的子节点路径应该是 'applications.程序名'
                if (expandedPaths.has('applications')) {
                    this._renderTreeChildren('applications', this.storageData.applications || {}, expandedPaths, 1);
                }
            } else {
                // System节点
                const systemNode = this._createTreeNode('system', this._getText('REGEDIT_SYSTEM', 'System'), this.storageData.system || {}, expandedPaths, 0);
                this.treeContainer.appendChild(systemNode);
                // 注意：system 的子节点路径应该是 'system.键名'，键名可能包含点号
                if (expandedPaths.has('system')) {
                    this._renderTreeChildren('system', this.storageData.system || {}, expandedPaths, 1);
                }
                
                // Programs节点
                const programsNode = this._createTreeNode('programs', this._getText('REGEDIT_PROGRAMS', 'Programs'), this.storageData.programs || {}, expandedPaths, 0);
                this.treeContainer.appendChild(programsNode);
                // 注意：programs 的子节点路径应该是 'programs.键名'
                if (expandedPaths.has('programs')) {
                    this._renderTreeChildren('programs', this.storageData.programs || {}, expandedPaths, 1);
                }
            }
        },
        
        /**
         * 渲染树节点的子节点（递归）
         */
        _renderTreeChildren: function(parentPath, data, expandedPaths, level) {
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                return;
            }
            
            const isExpanded = expandedPaths.has(parentPath);
            if (!isExpanded) {
                return;
            }
            
            Object.keys(data).forEach(childKey => {
                const childValue = data[childKey];
                const childPath = parentPath ? `${parentPath}.${childKey}` : childKey;
                const childNode = this._createTreeNode(childPath, childKey, childValue, expandedPaths, level);
                this.treeContainer.appendChild(childNode);
                if (typeof childValue === 'object' && childValue !== null && !Array.isArray(childValue)) {
                    this._renderTreeChildren(childPath, childValue, expandedPaths, level + 1);
                }
            });
        },
        
        /**
         * 创建树节点（递归）
         */
        _createTreeNode: function(key, label, data, expandedPaths, level) {
            level = level || 0;
            expandedPaths = expandedPaths || new Set();
            
            const node = document.createElement('div');
            node.className = 'regedit-tree-item';
            node.dataset.path = key;
            node.dataset.level = level;
            
            const isExpanded = expandedPaths.has(key);
            const hasChildren = typeof data === 'object' && data !== null && !Array.isArray(data) && Object.keys(data).length > 0;
            node.dataset.hasChildren = hasChildren ? 'true' : 'false';
            
            if (isExpanded) {
                node.dataset.expanded = 'true';
            }
            
            node.style.cssText = `
                padding: 5px 10px;
                padding-left: ${10 + level * 20}px;
                cursor: pointer;
                user-select: none;
                color: rgba(215, 224, 221, 0.9);
                font-size: 13px;
                position: relative;
                transition: background 0.2s;
            `;
            
            const icon = hasChildren ? (isExpanded ? '📂' : '📁') : '📄';
            node.innerHTML = `<span style="margin-right: 5px;">${icon}</span>${label}`;
            
            // 选中状态
            if (this.selectedPath === key) {
                node.style.background = 'rgba(108, 142, 255, 0.2)';
            }
            
            // 点击事件由 treeContainer 上的委托处理，悬停由 CSS .regedit-tree-item:hover 处理
            
            return node;
        },
        
        /**
         * 选择路径
         */
        _selectPath: function(path, isHistoryNavigation = false) {
            this.selectedPath = path;
            
            // 添加到历史记录（如果不是历史导航）
            if (!isHistoryNavigation) {
                this._addToHistory(path);
            }
            
            // 更新面包屑导航
            if (this._updateBreadcrumb) {
                this._updateBreadcrumb(path);
            }
            
            // 更新选中状态
            const items = this.treeContainer.querySelectorAll('.regedit-tree-item');
            items.forEach(item => {
                if (item.dataset.path === path) {
                    item.style.background = 'rgba(108, 142, 255, 0.2)';
                } else if (this.selectedPath !== item.dataset.path) {
                    item.style.background = 'transparent';
                }
            });
            
            // 渲染值列表
            this._renderValues(path);
            
            // 更新前进/后退按钮状态
            this._updateHistoryButtons();
        },
        
        /**
         * 添加到历史记录
         */
        _addToHistory: function(path) {
            // 如果当前不是最新位置，删除当前位置之后的所有历史
            if (this._historyIndex < this._history.length - 1) {
                this._history = this._history.slice(0, this._historyIndex + 1);
            }
            
            // 如果与最后一个历史相同，不添加
            if (this._history.length > 0 && this._history[this._history.length - 1] === path) {
                return;
            }
            
            // 添加新历史
            this._history.push(path);
            
            // 限制历史记录数量
            if (this._history.length > this._maxHistorySize) {
                this._history.shift();
            } else {
                this._historyIndex++;
            }
        },
        
        /**
         * 后退到上一个历史
         */
        _goBack: function() {
            if (this._historyIndex > 0) {
                this._historyIndex--;
                const path = this._history[this._historyIndex];
                this._selectPath(path, true);
            }
        },
        
        /**
         * 前进到下一个历史
         */
        _goForward: function() {
            if (this._historyIndex < this._history.length - 1) {
                this._historyIndex++;
                const path = this._history[this._historyIndex];
                this._selectPath(path, true);
            }
        },
        
        /**
         * 更新前进/后退按钮状态
         */
        _updateHistoryButtons: function() {
            if (!this.window) return;
            
            const backBtn = this.window.querySelector('.regedit-history-back');
            const forwardBtn = this.window.querySelector('.regedit-history-forward');
            
            if (backBtn) {
                backBtn.disabled = this._historyIndex <= 0;
                backBtn.style.opacity = this._historyIndex <= 0 ? '0.4' : '1';
            }
            if (forwardBtn) {
                forwardBtn.disabled = this._historyIndex >= this._history.length - 1;
                forwardBtn.style.opacity = this._historyIndex >= this._history.length - 1 ? '0.4' : '1';
            }
        },
        
        /**
         * 渲染值列表
         */
        _renderValues: function(path) {
            if (!this.valueContainer) return;
            
            // 清除选中状态（因为要重新渲染）
            if (this._selectedValue) {
                this._selectedValue = null;
            }
            
            this.valueContainer.innerHTML = '';
            
            // 确保数据已加载
            if (!this.storageData) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('RegEdit', 'storageData 未加载');
                }
                this.valueContainer.innerHTML = '<div style="padding: 20px; color: rgba(255, 100, 100, 0.7);">' + this._getText('REGEDIT_DATA_NOT_LOADED', '数据未加载，请刷新') + '</div>';
                this._updateStatusBar(0);
                return;
            }
            
            // 使用统一的路径解析方法
            let data = this._resolvePath(path);
            
            if (data === null || data === undefined) {
                this.valueContainer.innerHTML = '<div style="padding: 20px; color: rgba(215, 224, 221, 0.5);">' + this._getText('REGEDIT_NO_DATA', '无数据') + '</div>';
                this._updateStatusBar(0);
                return;
            }
            
            // 如果数据不是对象也不是数组，显示为单个值（基本类型：string, number, boolean等）
            if (typeof data !== 'object' || data === null) {
                // 获取当前路径的键名（用于显示）
                // 对于路径如 'system.randomAnimeBgStatus'，键名应该是 'randomAnimeBgStatus'
                // 对于路径如 'system.musicplayer.settings'，键名应该是 'settings'
                let currentKey = '';
                if (path) {
                    const pathParts = path.split('.');
                    if (pathParts.length > 0) {
                        // 获取路径的最后一部分作为键名
                        currentKey = pathParts[pathParts.length - 1];
                    }
                }
                
                // 如果路径为空，使用"（默认）"作为键名
                if (!currentKey) {
                    currentKey = this._getText('REGEDIT_DEFAULT_KEY', '（默认）');
                }
                
                // 创建一个特殊的值行，显示基本类型的值
                // 注意：parentPath 应该是当前路径的父路径，用于编辑和删除操作
                // 例如：如果 path 是 'system.randomAnimeBgStatus'，parentPath 应该是 'system'
                let parentPath = '';
                if (path) {
                    const pathParts = path.split('.');
                    if (pathParts.length > 1) {
                        // 移除最后一部分，得到父路径
                        parentPath = pathParts.slice(0, -1).join('.');
                    } else if (pathParts.length === 1) {
                        // 如果只有一部分（如 'system'），父路径为空
                        parentPath = '';
                    }
                }
                
                const row = this._createValueRow(currentKey, data, parentPath);
                this.valueContainer.appendChild(row);
                return;
            }
            
            // 如果是数组，显示数组项
            if (Array.isArray(data)) {
                const frag = document.createDocumentFragment();
                for (let index = 0; index < data.length; index++) {
                    const row = this._createValueRow(String(index), data[index], path);
                    frag.appendChild(row);
                }
                this.valueContainer.appendChild(frag);
                this._updateStatusBar(data.length);
            } else {
                // 显示对象键值对
                const frag = document.createDocumentFragment();
                const keys = Object.keys(data);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const value = data[key];
                    const row = this._createValueRow(key, value, path);
                    frag.appendChild(row);
                }
                this.valueContainer.appendChild(frag);
                this._updateStatusBar(keys.length);
            }
        },
        
        /**
         * 更新状态栏
         * @param {number} itemCount 项数量
         */
        _updateStatusBar: function(itemCount) {
            if (this._statusItemCount) {
                const countText = itemCount === 0 
                    ? this._getText('REGEDIT_NO_ITEMS', '无项目')
                    : `${itemCount} ${this._getText('REGEDIT_ITEMS', '项')}`;
                this._statusItemCount.textContent = countText;
            }
            if (this._statusStorageInfo) {
                this._statusStorageInfo.textContent = this._getStorageTypeLabel(this.currentStorageType);
            }
        },
        
        /**
         * 创建值行
         */
        _createValueRow: function(key, value, parentPath) {
            const row = document.createElement('div');
            row.className = 'regedit-value-row';
            // 存储数据到dataset，供ContextMenuManager使用
            row.dataset.key = key;
            row.dataset.parentPath = parentPath || '';
            row.dataset.valueType = typeof value;
            row.style.cssText = `
                display: flex;
                padding: 5px 10px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                cursor: pointer;
                transition: background 0.2s;
            `;
            
            // 使用 EventManager 注册鼠标事件（如果可用且有权限）
            let useEventManager = false;
            if (typeof EventManager !== 'undefined' && this.pid) {
                // 尝试注册事件，检查返回值以确认是否有权限
                const mouseenterId = EventManager.registerElementEvent(this.pid, row, 'mouseenter', () => {
                    row.style.background = 'rgba(108, 142, 255, 0.1)';
                });
                
                const mouseleaveId = EventManager.registerElementEvent(this.pid, row, 'mouseleave', () => {
                    // 如果不是选中的行，恢复透明背景
                    if (this._selectedValue && this._selectedValue.row === row) {
                        row.style.background = 'rgba(108, 142, 255, 0.2)';
                    } else {
                        row.style.background = 'transparent';
                    }
                });
                
                const clickId = EventManager.registerElementEvent(this.pid, row, 'click', () => {
                    // 选中当前行
                    this._selectValueRow(row, parentPath, key);
                });
                
                const dblclickId = EventManager.registerElementEvent(this.pid, row, 'dblclick', () => {
                    if (typeof value === 'object' && value !== null) {
                        // 对象或数组，打开新窗口
                        this._openChildWindow(key, value, parentPath);
                    } else {
                        // 其他类型，编辑
                        this._editValue(parentPath, key, value);
                    }
                });
                
                // 如果所有事件都成功注册（返回值不为 null），则使用 EventManager
                useEventManager = mouseenterId !== null && mouseleaveId !== null && clickId !== null && dblclickId !== null;
            }
            
            // 如果 EventManager 不可用或权限不足，使用降级方案
            if (!useEventManager) {
            row.addEventListener('mouseenter', () => {
                row.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            
            row.addEventListener('mouseleave', () => {
                // 如果不是选中的行，恢复透明背景
                if (this._selectedValue && this._selectedValue.row === row) {
                    row.style.background = 'rgba(108, 142, 255, 0.2)';
                } else {
                    row.style.background = 'transparent';
                }
            });
                
                row.addEventListener('click', () => {
                    // 选中当前行
                    this._selectValueRow(row, parentPath, key);
                });
                
                row.addEventListener('dblclick', () => {
                    if (typeof value === 'object' && value !== null) {
                        // 对象或数组，打开新窗口
                        this._openChildWindow(key, value, parentPath);
                    } else {
                        // 其他类型，编辑
                        this._editValue(parentPath, key, value);
                    }
                });
            }
            
            const nameCell = document.createElement('div');
            nameCell.style.cssText = `
                width: 200px;
                color: rgba(215, 224, 221, 0.9);
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            nameCell.textContent = key;
            
            const valueCell = document.createElement('div');
            valueCell.style.cssText = `
                flex: 1;
                color: rgba(215, 224, 221, 0.7);
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            
            // 格式化值显示
            if (value === null) {
                valueCell.textContent = '(null)';
                valueCell.style.color = 'rgba(255, 100, 100, 0.7)';
            } else if (value === undefined) {
                valueCell.textContent = '(undefined)';
                valueCell.style.color = 'rgba(255, 100, 100, 0.7)';
            } else if (typeof value === 'object') {
                if (Array.isArray(value)) {
                    valueCell.textContent = `Array[${value.length}]`;
                    valueCell.style.color = 'rgba(100, 200, 255, 0.7)';
                } else {
                    valueCell.textContent = `Object{${Object.keys(value).length}}`;
                    valueCell.style.color = 'rgba(100, 200, 255, 0.7)';
                }
            } else if (typeof value === 'string') {
                valueCell.textContent = `"${value}"`;
            } else if (typeof value === 'number') {
                valueCell.textContent = String(value);
                valueCell.style.color = 'rgba(255, 200, 100, 0.7)';
            } else if (typeof value === 'boolean') {
                valueCell.textContent = value ? 'true' : 'false';
                valueCell.style.color = 'rgba(100, 255, 100, 0.7)';
            } else {
                valueCell.textContent = String(value);
            }
            
            // 右键菜单由ContextMenuManager处理，不需要在这里添加事件监听
            
            row.appendChild(nameCell);
            row.appendChild(valueCell);
            
            return row;
        },
        
        /**
         * 编辑值
         */
        _editValue: function(parentPath, key, currentValue) {
            if (typeof GUIManager === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('RegEdit', 'GUIManager 不可用，无法创建编辑窗口');
                }
                return;
            }
            
            const self = this;
            const valueType = typeof currentValue;
            const isObject = typeof currentValue === 'object' && currentValue !== null;
            
            // 生成窗口ID（必须符合GUIManager规范：以window_开头）
            const windowId = `window_${this.pid}_regedit_edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // 获取 GUI 容器
            const guiContainer = document.getElementById('gui-container');
            if (!guiContainer) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('RegEdit', 'GUI 容器不存在，无法创建编辑窗口');
                }
                return;
            }
            
            // 创建窗口元素
            const editWindow = document.createElement('div');
            editWindow.className = 'regedit-edit-window zos-gui-window';
            editWindow.dataset.pid = this.pid.toString();
            editWindow.style.cssText = `
                width: 600px;
                height: 500px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 获取图标
            let icon = null;
            if (typeof ApplicationAssetManager !== 'undefined') {
                icon = ApplicationAssetManager.getIcon('regedit');
            }
            
            // 使用GUIManager注册窗口
            const windowInfo = GUIManager.registerWindow(this.pid, editWindow, {
                title: this._getText('REGEDIT_EDIT_VALUE', '编辑值').replace('{0}', key),
                icon: icon,
                windowId: windowId,
                onClose: () => {
                    // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                    // 窗口关闭由 GUIManager._closeWindow 统一处理
                    // _closeWindow 会在窗口关闭后自动调用 unregisterWindow
                    // 这样可以确保程序多实例（不同 PID）互不影响
                    
                    // 从子窗口列表中移除
                    const actualWindowId = windowInfo ? windowInfo.windowId : windowId;
                    const index = self.childWindows.findIndex(w => w.windowId === actualWindowId);
                    if (index !== -1) {
                        self.childWindows.splice(index, 1);
                    }
                }
            });
            
            // 保存实际的windowId
            const actualWindowId = windowInfo ? windowInfo.windowId : windowId;
            
            // 创建内容区域
            const content = document.createElement('div');
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                padding: 20px;
                background: rgba(20, 20, 30, 0.3);
            `;
            
            // 创建信息显示区域
            const infoSection = document.createElement('div');
            infoSection.style.cssText = `
                margin-bottom: 15px;
                padding: 12px;
                background: rgba(30, 30, 46, 0.5);
                border: 1px solid rgba(108, 142, 255, 0.2);
                border-radius: 4px;
            `;
            
            const keyLabel = document.createElement('div');
            keyLabel.style.cssText = `
                font-size: 14px;
                font-weight: bold;
                color: rgba(215, 224, 221, 0.9);
                margin-bottom: 8px;
            `;
            keyLabel.textContent = `键名: ${key}`;
            infoSection.appendChild(keyLabel);
            
            const typeLabel = document.createElement('div');
            typeLabel.style.cssText = `
                font-size: 12px;
                color: rgba(215, 224, 221, 0.6);
            `;
            typeLabel.textContent = `类型: ${valueType}${isObject ? (Array.isArray(currentValue) ? ' (Array)' : ' (Object)') : ''}`;
            infoSection.appendChild(typeLabel);
            
            if (parentPath) {
                const pathLabel = document.createElement('div');
                pathLabel.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    margin-top: 4px;
                    font-family: monospace;
                `;
                pathLabel.textContent = `路径: ${parentPath}`;
                infoSection.appendChild(pathLabel);
            }
            
            content.appendChild(infoSection);
            
            // 创建文本编辑区域
            const textarea = document.createElement('textarea');
            textarea.id = 'regedit-edit-value';
            textarea.value = isObject ? JSON.stringify(currentValue, null, 2) : String(currentValue);
            textarea.style.cssText = `
                flex: 1;
                    width: 100%;
                min-height: 200px;
                    background: rgba(20, 20, 30, 0.8);
                    border: 1px solid rgba(108, 142, 255, 0.3);
                    border-radius: 4px;
                    padding: 10px;
                    color: rgba(215, 224, 221, 0.9);
                    font-family: monospace;
                    font-size: 12px;
                    resize: vertical;
                    box-sizing: border-box;
                outline: none;
            `;
            content.appendChild(textarea);
            
            // 创建按钮区域
            const buttonBar = document.createElement('div');
            buttonBar.style.cssText = `
                margin-top: 15px;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            `;
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = this._getText('KEY_CANCEL', '取消');
            cancelBtn.style.cssText = `
                        padding: 8px 20px;
                        background: rgba(100, 100, 100, 0.3);
                        border: 1px solid rgba(108, 142, 255, 0.3);
                        border-radius: 4px;
                        color: rgba(215, 224, 221, 0.9);
                        cursor: pointer;
                transition: all 0.2s;
            `;
            
            const saveBtn = document.createElement('button');
            saveBtn.textContent = this._getText('KEY_SAVE', '保存');
            saveBtn.style.cssText = `
                        padding: 8px 20px;
                        background: rgba(108, 142, 255, 0.3);
                        border: 1px solid rgba(108, 142, 255, 0.5);
                        border-radius: 4px;
                        color: rgba(215, 224, 221, 0.9);
                        cursor: pointer;
                transition: all 0.2s;
            `;
            
            // 按钮悬停效果
            cancelBtn.addEventListener('mouseenter', () => {
                cancelBtn.style.background = 'rgba(100, 100, 100, 0.5)';
            });
            cancelBtn.addEventListener('mouseleave', () => {
                cancelBtn.style.background = 'rgba(100, 100, 100, 0.3)';
            });
            
            saveBtn.addEventListener('mouseenter', () => {
                saveBtn.style.background = 'rgba(108, 142, 255, 0.5)';
            });
            saveBtn.addEventListener('mouseleave', () => {
                saveBtn.style.background = 'rgba(108, 142, 255, 0.3)';
            });
            
            buttonBar.appendChild(cancelBtn);
            buttonBar.appendChild(saveBtn);
            content.appendChild(buttonBar);
            
            editWindow.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(editWindow);
            
            // 保存子窗口引用
            this.childWindows.push({
                windowId: actualWindowId,
                window: editWindow,
                path: parentPath,
                key: key,
                windowInfo: windowInfo
            });
            
            // 使用 EventManager 注册按钮点击事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, cancelBtn, 'click', () => {
                    // 关闭窗口
                    if (windowInfo && windowInfo.windowId) {
                        GUIManager._closeWindow(windowInfo.windowId, false);
                    } else {
                        GUIManager._closeWindow(windowId, false);
                    }
                });
                
                EventManager.registerElementEvent(this.pid, saveBtn, 'click', async () => {
                try {
                    const newValueText = textarea.value.trim();
                    let newValue;
                    
                    // 尝试解析JSON
                    try {
                        newValue = JSON.parse(newValueText);
                    } catch (e) {
                        // 如果不是JSON，尝试按原类型转换
                        if (valueType === 'number') {
                            newValue = parseFloat(newValueText);
                            if (isNaN(newValue)) {
                                throw new Error(this._getText('REGEDIT_INVALID_NUMBER', '无效的数字'));
                            }
                        } else if (valueType === 'boolean') {
                            newValue = newValueText === 'true';
                        } else {
                            newValue = newValueText;
                        }
                    }
                    
                    await this._setValue(parentPath, key, newValue);
                        
                        // 关闭窗口
                        if (windowInfo && windowInfo.windowId) {
                            GUIManager._closeWindow(windowInfo.windowId, false);
                        } else {
                            GUIManager._closeWindow(windowId, false);
                        }
                        
                        // 刷新数据
                    this._refreshData();
                    this._renderValues(this.selectedPath);
                } catch (error) {
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                            GUIManager.showAlert(this._getText('REGEDIT_SAVE_FAILED', '保存失败') + ': ' + error.message);
                        } else {
                    alert(this._getText('REGEDIT_SAVE_FAILED', '保存失败') + ': ' + error.message);
                }
                    }
                });
            } else {
                // 降级方案
                cancelBtn.addEventListener('click', () => {
                    if (windowInfo && windowInfo.windowId) {
                        GUIManager._closeWindow(windowInfo.windowId, false);
                    } else {
                        GUIManager._closeWindow(windowId, false);
                    }
                });
                
                saveBtn.addEventListener('click', async () => {
                    try {
                        const newValueText = textarea.value.trim();
                        let newValue;
                        
                        // 尝试解析JSON
                        try {
                            newValue = JSON.parse(newValueText);
                        } catch (e) {
                            // 如果不是JSON，尝试按原类型转换
                            if (valueType === 'number') {
                                newValue = parseFloat(newValueText);
                                if (isNaN(newValue)) {
                                    throw new Error(this._getText('REGEDIT_INVALID_NUMBER', '无效的数字'));
                                }
                            } else if (valueType === 'boolean') {
                                newValue = newValueText === 'true';
                            } else {
                                newValue = newValueText;
                            }
                        }
                        
                        await this._setValue(parentPath, key, newValue);
                        
                        // 关闭窗口
                        if (windowInfo && windowInfo.windowId) {
                            GUIManager._closeWindow(windowInfo.windowId, false);
                        } else {
                            GUIManager._closeWindow(windowId, false);
                        }
                        
                        // 刷新数据
                        this._refreshData();
                        this._renderValues(this.selectedPath);
                    } catch (error) {
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                            GUIManager.showAlert(this._getText('REGEDIT_SAVE_FAILED', '保存失败') + ': ' + error.message);
                        } else {
                            alert(this._getText('REGEDIT_SAVE_FAILED', '保存失败') + ': ' + error.message);
                        }
                }
            });
            }
            
            // 聚焦新窗口
            GUIManager.focusWindow(actualWindowId);
            
            // 自动聚焦文本区域
            setTimeout(() => {
                textarea.focus();
                textarea.select();
            }, 100);
        },
        
        /**
         * 根据路径解析数据对象（与_renderValues使用相同的逻辑）
         * @param {string} path 路径
         * @returns {Object|null} 解析后的数据对象，如果路径不存在返回null
         */
        _resolvePath: function(path) {
            if (!this.storageData || typeof this.storageData !== 'object') {
                return null;
            }
            
            if (path === null || path === '') {
                // 根节点
                if (this.currentStorageType === 'applicationTable') {
                    return {
                        applications: this.storageData.applications || {}
                    };
                } else {
                    return {
                        system: this.storageData.system || {},
                        programs: this.storageData.programs || {}
                    };
                }
            } else if (path === 'system') {
                return this.storageData.system || {};
            } else if (path === 'programs') {
                return this.storageData.programs || {};
            } else if (path === 'applications') {
                return this.storageData.applications || {};
            } else {
                // 解析路径：注意键名本身可能包含点号
                const pathParts = path.split('.');
                
                // 从根开始解析
                let data = this.storageData;
                
                // 先解析到父对象（system 或 programs）
                if (pathParts.length > 0 && pathParts[0] === 'system') {
                    data = this.storageData.system || {};
                    // 如果路径只有 'system'，已经完成
                    if (pathParts.length === 1) {
                        // data 已经是 system 对象
                    } else {
                        // 路径是 'system.xxx'，需要在 system 对象中查找键 'xxx'（可能包含点号）
                        // 有两种情况：
                        // 1. 键名包含点号，如 'permissionControl.settings' 存储在 system['permissionControl.settings']
                        // 2. 嵌套对象，如 system['permissionControl']['settings']
                        // 需要同时支持这两种情况
                        const keyInSystem = pathParts.slice(1).join('.');
                        
                        // 首先尝试逐层解析（支持嵌套对象的情况）
                        // 例如：system.permissionControl.settings -> system['permissionControl']['settings']
                        let tempData = data;
                        let foundByLayers = true;
                        for (let i = 1; i < pathParts.length; i++) {
                            const part = pathParts[i];
                            if (tempData && typeof tempData === 'object' && part in tempData) {
                                tempData = tempData[part];
                            } else {
                                foundByLayers = false;
                                break;
                            }
                        }
                        
                        if (foundByLayers) {
                            // 逐层解析成功
                            data = tempData;
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('RegEdit', `_resolvePath: 通过逐层解析找到路径 "${path}"`);
                            }
                        } else if (data && typeof data === 'object' && keyInSystem in data) {
                            // 逐层解析失败，尝试完整键名（支持键名包含点号的情况）
                            // 例如：system.permissionControl.settings -> system['permissionControl.settings']
                            data = data[keyInSystem];
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('RegEdit', `_resolvePath: 通过完整键名找到路径 "${path}" (key: "${keyInSystem}")`);
                            }
                        } else {
                            // 两种方式都失败
                            data = null;
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('RegEdit', `_resolvePath: 未找到路径 "${path}", 尝试的层级: ${pathParts.slice(1).join(' -> ')}, 完整键名: "${keyInSystem}"`);
                            }
                        }
                    }
                } else if (pathParts.length > 0 && pathParts[0] === 'programs') {
                    data = this.storageData.programs || {};
                    // 如果路径只有 'programs'，已经完成
                    if (pathParts.length === 1) {
                        // data 已经是 programs 对象
                    } else {
                        // 路径是 'programs.xxx.yyy.zzz'，需要逐层解析
                        // 第一层是程序名（如 'TaskbarManager'），后续层是嵌套的键
                        const programName = pathParts[1];
                        if (data && typeof data === 'object' && programName in data) {
                            data = data[programName];
                            
                            // 如果有更多层级，继续解析
                            if (pathParts.length > 2) {
                                // 从第三层开始逐层解析（跳过 'programs' 和程序名）
                                for (let i = 2; i < pathParts.length; i++) {
                                    const part = pathParts[i];
                                    if (data && typeof data === 'object' && part in data) {
                                        data = data[part];
                                    } else {
                                        data = null;
                                        break;
                                    }
                                }
                            }
                        } else {
                            data = null;
                        }
                    }
                } else if (pathParts.length > 0 && pathParts[0] === 'applications') {
                    data = this.storageData.applications || {};
                    // 如果路径只有 'applications'，已经完成
                    if (pathParts.length === 1) {
                        // data 已经是 applications 对象
                    } else {
                        // 路径是 'applications.程序名.xxx.yyy'，需要逐层解析
                        // 第一层是程序名（如 'piano'），后续层是程序资源对象的属性
                        const programName = pathParts[1];
                        if (data && typeof data === 'object' && programName in data) {
                            data = data[programName];
                            
                            // 如果有更多层级，继续解析
                            if (pathParts.length > 2) {
                                // 从第三层开始逐层解析（跳过 'applications' 和程序名）
                                for (let i = 2; i < pathParts.length; i++) {
                                    const part = pathParts[i];
                                    if (data && typeof data === 'object' && part in data) {
                                        data = data[part];
                                    } else {
                                        data = null;
                                        break;
                                    }
                                }
                            }
                        } else {
                            data = null;
                        }
                    }
                } else {
                    // 其他路径，可能是system下的键（键名包含点号，如 'permissionControl.whitelist'）
                    // 首先尝试在system对象中查找完整路径作为键名
                    const fullKeyInSystem = path;
                    if (this.storageData.system && typeof this.storageData.system === 'object' && fullKeyInSystem in this.storageData.system) {
                        // 找到了，直接返回
                        data = this.storageData.system[fullKeyInSystem];
                    } else {
                        // 如果完整路径不在system中，尝试逐层解析
                        // 先检查第一层是否在system中
                        const firstPart = pathParts[0];
                        if (this.storageData.system && typeof this.storageData.system === 'object' && firstPart in this.storageData.system) {
                            // 第一层在system中，从system开始解析
                            data = this.storageData.system[firstPart];
                            // 继续解析后续层级
                            for (let i = 1; i < pathParts.length; i++) {
                                const part = pathParts[i];
                                if (data && typeof data === 'object' && part in data) {
                                    data = data[part];
                                } else {
                                    data = null;
                                    break;
                                }
                            }
                        } else {
                            // 第一层不在system中，尝试从根开始按层级解析
                            for (let i = 0; i < pathParts.length; i++) {
                                const part = pathParts[i];
                                if (data && typeof data === 'object' && part in data) {
                                    data = data[part];
                                } else {
                                    data = null;
                                    break;
                                }
                            }
                        }
                    }
                }
                
                return data;
            }
        },
        
        /**
         * 设置值
         */
        _setValue: async function(parentPath, key, value) {
            try {
                // 数据完整性检查：确保 storageData 已正确加载
                if (!this.storageData || typeof this.storageData !== 'object') {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('RegEdit', 'storageData 未正确加载，尝试重新加载');
                    }
                    await this._loadRegistryData({ forceReload: true });
                    if (!this.storageData || typeof this.storageData !== 'object') {
                        throw new Error('无法加载存储数据，操作已取消');
                    }
                }
                
                // 根据存储类型确保相应的数据结构存在
                if (this.currentStorageType === 'applicationTable') {
                    if (!this.storageData.applications || typeof this.storageData.applications !== 'object') {
                        this.storageData.applications = {};
                    }
                } else {
                    if (!this.storageData.system || typeof this.storageData.system !== 'object') {
                        this.storageData.system = {};
                    }
                    if (!this.storageData.programs || typeof this.storageData.programs !== 'object') {
                        this.storageData.programs = {};
                    }
                }
                
                // 使用与_renderValues相同的逻辑解析路径
                let target = this._resolvePath(parentPath);
                
                if (!target || typeof target !== 'object') {
                    throw new Error('路径不存在或目标不是对象');
                }
                
                target[key] = value;
                
                // 根据存储类型保存到不同的位置
                try {
                    if (this.currentStorageType === 'localCache') {
                        // 保存到 CacheDrive
                        if (typeof CacheDrive === 'undefined') {
                            throw new Error('CacheDrive 不可用');
                        }
                        
                        // 确保 CacheDrive._cacheMetadata 与 this.storageData 同步
                        if (CacheDrive._cacheMetadata !== this.storageData) {
                            CacheDrive._cacheMetadata = this.storageData;
                        }
                        await CacheDrive._saveCacheMetadata();
                    } else if (this.currentStorageType === 'applicationTable') {
                        // 保存到 ApplicationTable.json
                        if (typeof LStorage === 'undefined') {
                            throw new Error('LStorage 不可用');
                        }
                        
                        // 如果设置的是 applications 下的程序
                        if (parentPath === 'applications') {
                            // 直接保存整个 ApplicationTable
                            const applicationTable = this.storageData.applications || {};
                            this._applicationTableCache = applicationTable;
                            await LStorage.setSystemStorage('applicationTable', applicationTable);
                            // 刷新 ApplicationAssetManager
                            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.refresh === 'function') {
                                await ApplicationAssetManager.refresh();
                            }
                        } else {
                            // 其他路径的设置，需要保存整个 ApplicationTable
                            const applicationTable = this.storageData.applications || {};
                            this._applicationTableCache = applicationTable;
                            await LStorage.setSystemStorage('applicationTable', applicationTable);
                            // 刷新 ApplicationAssetManager
                            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.refresh === 'function') {
                                await ApplicationAssetManager.refresh();
                            }
                        }
                    } else {
                        // 保存到 LStorage
                        if (typeof LStorage === 'undefined') {
                            throw new Error('LStorage 不可用');
                        }
                        
                        // 判断是否需要使用setSystemStorage（仅当parentPath为'system'时）
                        // 对于'system.xxx'这样的路径，应该保存整个数据，因为键名可能包含点号
                        if (parentPath === 'system') {
                            // 直接保存到system存储
                            await LStorage.setSystemStorage(key, value);
                        } else {
                            // 需要手动保存整个数据（包括system.xxx和programs路径）
                            // 确保 LStorage._storageData 与 this.storageData 同步
                            if (LStorage._storageData !== this.storageData) {
                                LStorage._storageData = this.storageData;
                            }
                            await LStorage._saveStorageData();
                        }
                    }
                } catch (saveError) {
                    // 保存失败，恢复数据
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('RegEdit', '保存失败，尝试恢复数据', saveError);
                    }
                    // 重新加载数据以恢复
                    await this._loadRegistryData({ forceReload: true });
                    throw new Error(`保存失败: ${saveError.message}`);
                }
                
                // 重新加载数据
                await this._loadRegistryData();
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('RegEdit', '设置值失败', error);
                }
                throw error;
            }
        },
        
        /**
         * 注册右键菜单（使用ContextMenuManager）
         */
        _registerContextMenu: function() {
            if (typeof ContextMenuManager === 'undefined' || !this.pid) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('RegEdit', 'ContextMenuManager 不可用，无法注册右键菜单');
                }
                return;
            }
            
            const self = this;
            
            // 1. 注册值列表项的右键菜单
            this.contextMenuId = ContextMenuManager.registerContextMenu(this.pid, {
                context: 'window-content',
                selector: '.regedit-value-row',
                priority: 100,
                items: (target) => {
                    const row = target.closest('.regedit-value-row');
                    if (!row) {
                        return [];
                    }
                    
                    const key = row.dataset.key;
                    const parentPath = row.dataset.parentPath;
                    const valueType = row.dataset.valueType;
                    
                    if (!key || parentPath === undefined) {
                        return [];
                    }
                    
                    let value = null;
                    try {
                        const pathParts = parentPath ? parentPath.split('.') : [];
                        let data = self.storageData;
                        for (const part of pathParts) {
                            if (data && typeof data === 'object' && part in data) {
                                data = data[part];
                            } else {
                                data = null;
                                break;
                            }
                        }
                        if (data && typeof data === 'object' && key in data) {
                            value = data[key];
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('RegEdit', '获取值失败', e);
                        }
                    }
                    
                    return [
                        {
                            label: self._getText('KEY_EDIT', '编辑'),
                            action: () => {
                                self._editValue(parentPath, key, value);
                            }
                        },
                        {
                            label: self._getText('KEY_DELETE', '删除'),
                            danger: true,
                            action: () => {
                                self._deleteValue(parentPath, key);
                            }
                        },
                        { separator: true },
                        { label: self._getText('REGEDIT_COPY_KEY', '复制键名'), action: () => { navigator.clipboard.writeText(key); } },
                        { label: self._getText('REGEDIT_COPY_VALUE', '复制值'), action: () => { navigator.clipboard.writeText(String(value)); } },
                        { label: self._getText('REGEDIT_COPY_PATH', '复制完整路径'), action: () => { navigator.clipboard.writeText(parentPath ? parentPath + '.' + key : key); } },
                        { separator: true },
                        { label: self._getText('REGEDIT_NEW_STRING', '新建字符串值'), action: () => { self._newValue(parentPath, 'string'); } },
                        { label: self._getText('REGEDIT_NEW_NUMBER', '新建数字值'), action: () => { self._newValue(parentPath, 'number'); } },
                        { label: self._getText('REGEDIT_NEW_BOOLEAN', '新建布尔值'), action: () => { self._newValue(parentPath, 'boolean'); } },
                        { label: self._getText('REGEDIT_NEW_OBJECT', '新建对象'), action: () => { self._newValue(parentPath, 'object'); } }
                    ];
                }
            });
            
            // 2. 注册树形结构项的右键菜单
            this.treeContextMenuId = ContextMenuManager.registerContextMenu(this.pid, {
                context: 'window-content',
                selector: '.regedit-tree-item',
                priority: 99,
                items: (target) => {
                    const item = target.closest('.regedit-tree-item');
                    if (!item) {
                        return [];
                    }
                    
                    const path = item.dataset.path;
                    const hasChildren = item.dataset.hasChildren === 'true';
                    
                    const menuItems = [];
                    
                    if (path) {
                        menuItems.push(
                            { label: self._getText('REGEDIT_EXPAND_ALL', '展开全部'), action: () => { self._expandAll(path); } },
                            { label: self._getText('REGEDIT_COLLAPSE_ALL', '折叠全部'), action: () => { self._collapseAll(path); } },
                            { separator: true },
                            { label: self._getText('REGEDIT_COPY_PATH', '复制路径'), action: () => { navigator.clipboard.writeText(path); } },
                            { separator: true }
                        );
                        
                        if (path !== 'system' && path !== 'applications' && path !== 'programs') {
                            menuItems.push(
                                { label: self._getText('KEY_DELETE', '删除项'), danger: true, action: () => { self._deleteTreeItem(path); } },
                                { separator: true }
                            );
                        }
                    }
                    
                    menuItems.push(
                        { label: self._getText('REGEDIT_NEW_STRING', '新建字符串值'), action: () => { self._newValue(path || '', 'string'); } },
                        { label: self._getText('REGEDIT_NEW_NUMBER', '新建数字值'), action: () => { self._newValue(path || '', 'number'); } },
                        { label: self._getText('REGEDIT_NEW_BOOLEAN', '新建布尔值'), action: () => { self._newValue(path || '', 'boolean'); } },
                        { label: self._getText('REGEDIT_NEW_OBJECT', '新建对象'), action: () => { self._newValue(path || '', 'object'); } },
                        { separator: true },
                        { label: self._getText('KEY_REFRESH', '刷新'), action: () => { self._refreshData({ forceReload: true }); self._renderTree(); } }
                    );
                    
                    return menuItems;
                }
            });
            
            // 3. 注册空白区域的右键菜单（值列表空白处）
            this.blankContextMenuId = ContextMenuManager.registerContextMenu(this.pid, {
                context: 'window-content',
                selector: '.regedit-value-list',
                priority: 98,
                items: (target) => {
                    return [
                        { label: self._getText('KEY_REFRESH', '刷新'), action: () => { self._refreshData({ forceReload: true }); self._renderTree(); self._renderValues(self.selectedPath); } },
                        { separator: true },
                        { label: self._getText('REGEDIT_NEW_STRING', '新建字符串值'), action: () => { self._newValue(self.selectedPath || '', 'string'); } },
                        { label: self._getText('REGEDIT_NEW_NUMBER', '新建数字值'), action: () => { self._newValue(self.selectedPath || '', 'number'); } },
                        { label: self._getText('REGEDIT_NEW_BOOLEAN', '新建布尔值'), action: () => { self._newValue(self.selectedPath || '', 'boolean'); } },
                        { label: self._getText('REGEDIT_NEW_OBJECT', '新建对象'), action: () => { self._newValue(self.selectedPath || '', 'object'); } }
                    ];
                }
            });
            
            // 4. 注册树形容器空白区域的右键菜单
            this.treeBlankContextMenuId = ContextMenuManager.registerContextMenu(this.pid, {
                context: 'window-content',
                selector: '.regedit-tree',
                priority: 97,
                items: (target) => {
                    return [
                        { label: self._getText('KEY_REFRESH', '刷新'), action: () => { self._refreshData({ forceReload: true }); self._renderTree(); } },
                        { separator: true },
                        { label: self._getText('REGEDIT_EXPAND_ALL', '展开全部'), action: () => { self._expandAllTree(); } },
                        { label: self._getText('REGEDIT_COLLAPSE_ALL', '折叠全部'), action: () => { self._collapseAllTree(); } }
                    ];
                }
            });
        },
        
        /**
         * 展开指定路径下的所有子节点
         */
        _expandAll: function(parentPath) {
            if (!this.treeContainer) return;
            const items = this.treeContainer.querySelectorAll('.regedit-tree-item');
            items.forEach(item => {
                const itemPath = item.dataset.path;
                if (itemPath && itemPath.startsWith(parentPath) && itemPath !== parentPath) {
                    item.dataset.expanded = 'true';
                }
            });
            this._renderTree();
        },
        
        /**
         * 折叠指定路径下的所有子节点
         */
        _collapseAll: function(parentPath) {
            if (!this.treeContainer) return;
            const items = this.treeContainer.querySelectorAll('.regedit-tree-item');
            items.forEach(item => {
                const itemPath = item.dataset.path;
                if (itemPath && itemPath.startsWith(parentPath) && itemPath !== parentPath) {
                    item.dataset.expanded = 'false';
                }
            });
            this._renderTree();
        },
        
        /**
         * 展开全部树节点
         */
        _expandAllTree: function() {
            if (!this.treeContainer) return;
            const items = this.treeContainer.querySelectorAll('.regedit-tree-item');
            items.forEach(item => {
                if (item.dataset.hasChildren === 'true') {
                    item.dataset.expanded = 'true';
                }
            });
            this._renderTree();
        },
        
        /**
         * 折叠全部树节点
         */
        _collapseAllTree: function() {
            if (!this.treeContainer) return;
            const items = this.treeContainer.querySelectorAll('.regedit-tree-item');
            items.forEach(item => {
                item.dataset.expanded = 'false';
            });
            this._renderTree();
        },
        
        /**
         * 删除树节点
         */
        _deleteTreeItem: function(path) {
            if (!path) return;
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('RegEdit', '删除树节点: ' + path);
            }
            
            const parts = path.split('.');
            const key = parts.pop();
            const parentPath = parts.join('.');
            
            this._deleteValue(parentPath, key);
        },
        
        /**
         * 显示右键菜单（已废弃，改用ContextMenuManager）
         */
        _showContextMenu: function(e, parentPath, key, value) {
            // 阻止默认右键菜单
            e.preventDefault();
            e.stopPropagation();
            
            // 移除现有菜单
            const existingMenu = document.querySelector('.regedit-context-menu');
            if (existingMenu && existingMenu.parentNode) {
                existingMenu.parentNode.removeChild(existingMenu);
            }
            
            const menu = document.createElement('div');
            menu.className = 'regedit-context-menu';
            
            // 计算菜单位置，确保在视口内
            const menuWidth = 180;
            const menuHeight = 200; // 估算高度
            let menuX = e.clientX;
            let menuY = e.clientY;
            
            // 如果菜单会超出右边界，调整位置
            if (menuX + menuWidth > window.innerWidth) {
                menuX = window.innerWidth - menuWidth - 10;
            }
            
            // 如果菜单会超出下边界，调整位置
            if (menuY + menuHeight > window.innerHeight) {
                menuY = window.innerHeight - menuHeight - 10;
            }
            
            menu.style.cssText = `
                position: fixed;
                top: ${menuY}px;
                left: ${menuX}px;
                background: rgba(30, 30, 46, 0.98);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 1px solid rgba(108, 142, 255, 0.3);
                border-radius: 4px;
                padding: 5px 0;
                z-index: 999999;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                min-width: 150px;
                pointer-events: auto;
            `;
            
            const menuItems = [
                { label: this._getText('KEY_EDIT', '编辑'), action: () => this._editValue(parentPath, key, value) },
                { label: this._getText('KEY_DELETE', '删除'), action: () => this._deleteValue(parentPath, key) },
                { type: 'separator' },
                { label: this._getText('REGEDIT_NEW_STRING', '新建字符串值'), action: () => this._newValue(parentPath, 'string') },
                { label: this._getText('REGEDIT_NEW_NUMBER', '新建数字值'), action: () => this._newValue(parentPath, 'number') },
                { label: this._getText('REGEDIT_NEW_BOOLEAN', '新建布尔值'), action: () => this._newValue(parentPath, 'boolean') },
                { label: this._getText('REGEDIT_NEW_OBJECT', '新建对象'), action: () => this._newValue(parentPath, 'object') },
            ];
            
            menuItems.forEach(item => {
                if (item.type === 'separator') {
                    const separator = document.createElement('div');
                    separator.style.cssText = `
                        height: 1px;
                        background: rgba(108, 142, 255, 0.2);
                        margin: 5px 0;
                    `;
                    menu.appendChild(separator);
                } else {
                    const menuItem = document.createElement('div');
                    menuItem.style.cssText = `
                        padding: 8px 15px;
                        cursor: pointer;
                        color: rgba(215, 224, 221, 0.9);
                        font-size: 12px;
                        transition: background 0.2s;
                    `;
                    menuItem.textContent = item.label;
                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.background = 'rgba(108, 142, 255, 0.2)';
                    });
                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.background = 'transparent';
                    });
                    menuItem.addEventListener('click', () => {
                        item.action();
                        document.body.removeChild(menu);
                    });
                    menu.appendChild(menuItem);
                }
            });
            
            // 添加到 body，确保在最上层
            document.body.appendChild(menu);
            
            // 确保菜单可见
            menu.style.display = 'block';
            menu.style.visibility = 'visible';
            
            // 点击外部关闭菜单
            const closeMenu = (e) => {
                if (menu && menu.parentNode && !menu.contains(e.target)) {
                    menu.parentNode.removeChild(menu);
                    document.removeEventListener('click', closeMenu);
                    document.removeEventListener('contextmenu', closeMenu);
                }
            };
            
            // 右键点击外部也关闭菜单
            const closeMenuOnContext = (e) => {
                if (menu && menu.parentNode && !menu.contains(e.target)) {
                    menu.parentNode.removeChild(menu);
                    document.removeEventListener('click', closeMenu);
                    document.removeEventListener('contextmenu', closeMenu);
                }
            };
            
            // 延迟添加事件监听，避免立即触发
            setTimeout(() => {
                document.addEventListener('click', closeMenu, true);
                document.addEventListener('contextmenu', closeMenuOnContext, true);
            }, 100);
        },
        
        /**
         * 创建菜单栏
         */
        _createMenuBar: function() {
            const menuBar = document.createElement('div');
            menuBar.className = 'regedit-menubar';
            menuBar.style.cssText = `
                height: 30px;
                min-height: 30px;
                max-height: 30px;
                display: flex;
                align-items: center;
                padding: 0 10px;
                background: rgba(30, 30, 46, 0.5);
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                gap: 20px;
                font-size: 12px;
                flex-shrink: 0;
            `;
            
            // 文件菜单
            const fileMenu = this._createMenuButton(this._getText('REGEDIT_MENU_FILE', '文件(F)'), () => {
                // 可以添加文件菜单功能
            });
            fileMenu.className = (fileMenu.className || '') + ' regedit-menu-file';
            menuBar.appendChild(fileMenu);
            
            // 编辑菜单
            const editMenu = this._createMenuButton(this._getText('REGEDIT_MENU_EDIT', '编辑(E)'), () => {
                // 可以添加编辑菜单功能
            });
            editMenu.className = (editMenu.className || '') + ' regedit-menu-edit';
            menuBar.appendChild(editMenu);
            
            // 查看菜单
            const viewMenu = this._createMenuButton(this._getText('REGEDIT_MENU_VIEW', '查看(V)'), () => {
                // 可以添加查看菜单功能
            });
            viewMenu.className = (viewMenu.className || '') + ' regedit-menu-view';
            menuBar.appendChild(viewMenu);
            
            // 刷新按钮
            const refreshBtn = this._createMenuButton(this._getText('REGEDIT_MENU_REFRESH', '刷新(R)'), () => {
                this._refreshData();
                this._renderTree();
                if (this.selectedPath) {
                    this._renderValues(this.selectedPath);
                }
            });
            refreshBtn.className = (refreshBtn.className || '') + ' regedit-menu-refresh';
            menuBar.appendChild(refreshBtn);
            
            // 存储类型切换按钮
            const storageTypeBtn = document.createElement('div');
            storageTypeBtn.className = 'regedit-storage-type-btn';
            storageTypeBtn.style.cssText = `
                padding: 4px 12px;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.2s;
                user-select: none;
                color: rgba(215, 224, 221, 0.9);
                font-size: 12px;
                margin-left: auto;
            `;
            storageTypeBtn.textContent = this._getStorageTypeLabel(this.currentStorageType);
            storageTypeBtn.addEventListener('mouseenter', () => {
                storageTypeBtn.style.background = 'rgba(108, 142, 255, 0.2)';
            });
            storageTypeBtn.addEventListener('mouseleave', () => {
                storageTypeBtn.style.background = 'transparent';
            });
            storageTypeBtn.addEventListener('click', () => {
                // 切换存储类型：localSData -> localCache -> applicationTable -> localSData
                const next = { localSData: 'localCache', localCache: 'applicationTable', applicationTable: 'localSData' };
                this.currentStorageType = next[this.currentStorageType] || 'localSData';
                storageTypeBtn.textContent = this._getStorageTypeLabel(this.currentStorageType);
                // 重新加载数据并刷新显示
                this._loadRegistryData().then(() => {
                    this._renderTree();
                    this._selectPath('');
                });
            });
            menuBar.appendChild(storageTypeBtn);
            this.storageTypeBtn = storageTypeBtn; // 保存引用以便更新文本
            
            return menuBar;
        },
        
        /**
         * 打开子窗口显示数据
         */
        _openChildWindow: function(key, data, parentPath) {
            const self = this;
            const fullPath = parentPath ? `${parentPath}.${key}` : key;
            // 使用符合GUIManager规范的窗口ID格式（必须以window_开头）
            const windowId = `window_${this.pid}_regedit_child_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // 创建子窗口
            const childWindow = document.createElement('div');
            childWindow.className = 'regedit-child-window zos-gui-window';
            childWindow.dataset.pid = this.pid.toString();
            childWindow.dataset.windowId = windowId;
            
            // 设置窗口样式
            childWindow.style.cssText = `
                display: flex;
                flex-direction: column;
                overflow: hidden;
                width: 600px;
                height: 500px;
                min-width: 400px;
                min-height: 300px;
            `;
            
            // 获取 GUI 容器
            const guiContainer = document.getElementById('gui-container');
            
            // 注册到 GUIManager
            let icon = null;
            if (typeof ApplicationAssetManager !== 'undefined') {
                icon = ApplicationAssetManager.getIcon('regedit');
            }
            
            const windowInfo = GUIManager.registerWindow(this.pid, childWindow, {
                title: key + ' - ' + this._getText('REGEDIT_TITLE', '注册表编辑器'),
                icon: icon,
                windowId: windowId,
                onClose: () => {
                    // 从子窗口列表中移除（使用windowInfo中的实际windowId）
                    const actualWindowId = windowInfo ? windowInfo.windowId : windowId;
                    const index = self.childWindows.findIndex(w => w.windowId === actualWindowId);
                    if (index !== -1) {
                        self.childWindows.splice(index, 1);
                    }
                    // 移除窗口元素
                    if (childWindow.parentElement) {
                        childWindow.parentElement.removeChild(childWindow);
                    }
                    // 注销窗口（使用windowInfo中的实际windowId）
                    if (windowInfo && windowInfo.windowId) {
                        GUIManager.unregisterWindow(windowInfo.windowId);
                    } else {
                        // 如果windowInfo无效，尝试使用传入的windowId
                        GUIManager.unregisterWindow(windowId);
                    }
                }
            });
            
            // 创建内容区域
            const content = document.createElement('div');
            content.className = 'regedit-child-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                padding: 20px;
                background: rgba(20, 20, 30, 0.3);
            `;
            
            // 创建路径显示
            const pathDisplay = document.createElement('div');
            pathDisplay.style.cssText = `
                margin-bottom: 15px;
                padding: 10px;
                background: rgba(30, 30, 46, 0.5);
                border: 1px solid rgba(108, 142, 255, 0.2);
                border-radius: 4px;
                font-size: 12px;
                color: rgba(215, 224, 221, 0.7);
                font-family: monospace;
            `;
            pathDisplay.textContent = this._getText('KEY_PATH', '路径') + ': ' + fullPath;
            content.appendChild(pathDisplay);
            
            // 创建值列表容器
            const valueList = document.createElement('div');
            valueList.className = 'regedit-child-value-list';
            valueList.style.cssText = `
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
            `;
            
            // 创建值列表头部
            const valueHeader = document.createElement('div');
            valueHeader.style.cssText = `
                height: 30px;
                display: flex;
                align-items: center;
                padding: 0 10px;
                background: rgba(30, 30, 46, 0.5);
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                font-size: 12px;
                color: rgba(215, 224, 221, 0.8);
                font-weight: bold;
            `;
            valueHeader.innerHTML = `
                <div style="width: 200px;">` + this._getText('KEY_NAME', '名称') + `</div>
                <div style="flex: 1;">` + this._getText('REGEDIT_DATA', '数据') + `</div>
            `;
            valueList.appendChild(valueHeader);
            
            // 保存实际的windowId（可能和传入的不同）
            const actualWindowId = windowInfo ? windowInfo.windowId : windowId;
            
            // 渲染数据
            if (Array.isArray(data)) {
                data.forEach((item, index) => {
                    const row = this._createChildValueRow(String(index), item, fullPath, actualWindowId);
                    valueList.appendChild(row);
                });
            } else if (typeof data === 'object' && data !== null) {
                Object.keys(data).forEach(itemKey => {
                    const itemValue = data[itemKey];
                    const row = this._createChildValueRow(itemKey, itemValue, fullPath, actualWindowId);
                    valueList.appendChild(row);
                });
            }
            
            content.appendChild(valueList);
            childWindow.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(childWindow);
            
            // 保存子窗口引用（含 key 供语言切换时更新标题）
            this.childWindows.push({
                windowId: actualWindowId,
                window: childWindow,
                path: fullPath,
                key: key,
                data: data,
                windowInfo: windowInfo
            });
            
            // 聚焦新窗口（使用实际的windowId）
            GUIManager.focusWindow(actualWindowId);
            
            // 为子窗口注册右键菜单（使用相同的ContextMenuManager，selector会自动匹配）
            // 注意：由于ContextMenuManager是基于selector的，子窗口中的.regedit-value-row也会被匹配
        },
        
        /**
         * 创建子窗口的值行
         */
        _createChildValueRow: function(key, value, parentPath, windowId) {
            const row = document.createElement('div');
            row.className = 'regedit-value-row';
            row.dataset.key = key;
            row.dataset.parentPath = parentPath;
            row.dataset.valueType = typeof value;
            row.style.cssText = `
                display: flex;
                padding: 5px 10px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                cursor: pointer;
                transition: background 0.2s;
            `;
            
            // 使用 EventManager 注册鼠标事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, row, 'mouseenter', () => {
                    row.style.background = 'rgba(108, 142, 255, 0.1)';
                });
                
                EventManager.registerElementEvent(this.pid, row, 'mouseleave', () => {
                    row.style.background = 'transparent';
                });
            } else {
                // 降级方案
            row.addEventListener('mouseenter', () => {
                row.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            
            row.addEventListener('mouseleave', () => {
                row.style.background = 'transparent';
            });
            }
            
            const nameCell = document.createElement('div');
            nameCell.style.cssText = `
                width: 200px;
                color: rgba(215, 224, 221, 0.9);
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            nameCell.textContent = key;
            
            const valueCell = document.createElement('div');
            valueCell.style.cssText = `
                flex: 1;
                color: rgba(215, 224, 221, 0.7);
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            
            // 格式化值显示
            if (value === null) {
                valueCell.textContent = '(null)';
                valueCell.style.color = 'rgba(255, 100, 100, 0.7)';
            } else if (value === undefined) {
                valueCell.textContent = '(undefined)';
                valueCell.style.color = 'rgba(255, 100, 100, 0.7)';
            } else if (typeof value === 'object') {
                if (Array.isArray(value)) {
                    valueCell.textContent = `Array[${value.length}]`;
                    valueCell.style.color = 'rgba(100, 200, 255, 0.7)';
                } else {
                    valueCell.textContent = `Object{${Object.keys(value).length}}`;
                    valueCell.style.color = 'rgba(100, 200, 255, 0.7)';
                }
            } else if (typeof value === 'string') {
                valueCell.textContent = `"${value}"`;
            } else if (typeof value === 'number') {
                valueCell.textContent = String(value);
                valueCell.style.color = 'rgba(255, 200, 100, 0.7)';
            } else if (typeof value === 'boolean') {
                valueCell.textContent = value ? 'true' : 'false';
                valueCell.style.color = 'rgba(100, 255, 100, 0.7)';
            } else {
                valueCell.textContent = String(value);
            }
            
            // 双击：如果是对象或数组，打开新窗口；否则编辑
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, row, 'dblclick', () => {
                    if (typeof value === 'object' && value !== null) {
                        // 对象或数组，打开新窗口
                        this._openChildWindow(key, value, parentPath);
                    } else {
                        // 其他类型，编辑
                        this._editValue(parentPath, key, value);
                    }
                });
            } else {
                // 降级方案
            row.addEventListener('dblclick', () => {
                if (typeof value === 'object' && value !== null) {
                    // 对象或数组，打开新窗口
                    this._openChildWindow(key, value, parentPath);
                } else {
                    // 其他类型，编辑
                    this._editValue(parentPath, key, value);
                }
            });
            }
            
            row.appendChild(nameCell);
            row.appendChild(valueCell);
            
            return row;
        },
        
        /**
         * 创建菜单按钮
         */
        _createMenuButton: function(label, onClick) {
            const btn = document.createElement('div');
            btn.style.cssText = `
                padding: 5px 10px;
                cursor: pointer;
                color: rgba(215, 224, 221, 0.9);
                user-select: none;
                transition: background 0.2s;
                border-radius: 3px;
            `;
            btn.textContent = label;
            
            // 使用 EventManager 注册事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, btn, 'mouseenter', () => {
                    btn.style.background = 'rgba(108, 142, 255, 0.2)';
                });
                
                EventManager.registerElementEvent(this.pid, btn, 'mouseleave', () => {
                    btn.style.background = 'transparent';
                });
                
                EventManager.registerElementEvent(this.pid, btn, 'click', onClick);
            } else {
                // 降级方案
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(108, 142, 255, 0.2)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
            });
            btn.addEventListener('click', onClick);
            }
            
            return btn;
        },
        
        /**
         * 选中值行
         */
        _selectValueRow: function(row, parentPath, key) {
            // 清除之前的选中状态
            if (this._selectedValue && this._selectedValue.row) {
                this._selectedValue.row.style.background = 'transparent';
            }
            
            // 设置新的选中状态
            this._selectedValue = {
                row: row,
                parentPath: parentPath,
                key: key
            };
            
            // 高亮选中的行
            row.style.background = 'rgba(108, 142, 255, 0.2)';
        },
        
        /**
         * 注册键盘快捷键
         */
        _registerKeyboardShortcuts: function() {
            const self = this;
            
            // 使用 EventManager 注册键盘事件（如果可用且有权限）
            if (typeof EventManager !== 'undefined' && this.pid) {
                this._keyboardHandlerId = EventManager.registerEventHandler(this.pid, 'keydown', (e) => {
                    // 检查是否在窗口内
                    if (!this.window || !this.window.contains(e.target)) {
                        return;
                    }
                    
                    // 检查是否在输入框中（除了特定快捷键）
                    const activeElement = document.activeElement;
                    const isInInput = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );
                    
                    // Delete: 删除选中的值
                    if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === 'Delete' && !isInInput) {
                        e.preventDefault();
                        e.stopPropagation();
                        self._deleteSelectedValue();
                    }
                    
                    // F5: 刷新
                    if (e.key === 'F5' && !isInInput) {
                        e.preventDefault();
                        self._refreshData({ forceReload: true });
                        self._renderTree();
                        self._renderValues(self.selectedPath);
                    }
                    
                    // Ctrl+F: 聚焦搜索框
                    if (e.ctrlKey && e.key === 'f' && !isInInput) {
                        e.preventDefault();
                        const searchInput = self.window.querySelector('.regedit-search-input');
                        if (searchInput) {
                            searchInput.focus();
                        }
                    }
                    
                    // Alt+←: 后退
                    if (e.altKey && e.key === 'ArrowLeft' && !isInInput) {
                        e.preventDefault();
                        self._goBack();
                    }
                    
                    // Alt+→: 前进
                    if (e.altKey && e.key === 'ArrowRight' && !isInInput) {
                        e.preventDefault();
                        self._goForward();
                    }
                    
                    // Ctrl+N: 新建值
                    if (e.ctrlKey && e.key === 'n' && !isInInput) {
                        e.preventDefault();
                        self._newValue(self.selectedPath || '', 'string');
                    }
                }, {
                    priority: 100,
                    selector: null  // 全局键盘事件
                });
            } else {
                // 降级：直接使用 addEventListener（不推荐）
                this.window.addEventListener('keydown', (e) => {
                    // 检查是否在输入框中
                    const activeElement = document.activeElement;
                    const isInInput = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );
                    
                    // Delete: 删除选中的值
                    if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === 'Delete' && !isInInput) {
                        e.preventDefault();
                        e.stopPropagation();
                        self._deleteSelectedValue();
                    }
                    
                    // F5: 刷新
                    if (e.key === 'F5' && !isInInput) {
                        e.preventDefault();
                        self._refreshData({ forceReload: true });
                        self._renderTree();
                        self._renderValues(self.selectedPath);
                    }
                    
                    // Ctrl+F: 聚焦搜索框
                    if (e.ctrlKey && e.key === 'f' && !isInInput) {
                        e.preventDefault();
                        const searchInput = self.window.querySelector('.regedit-search-input');
                        if (searchInput) {
                            searchInput.focus();
                        }
                    }
                    
                    // Alt+←: 后退
                    if (e.altKey && e.key === 'ArrowLeft' && !isInInput) {
                        e.preventDefault();
                        self._goBack();
                    }
                    
                    // Alt+→: 前进
                    if (e.altKey && e.key === 'ArrowRight' && !isInInput) {
                        e.preventDefault();
                        self._goForward();
                    }
                    
                    // Ctrl+N: 新建值
                    if (e.ctrlKey && e.key === 'n' && !isInInput) {
                        e.preventDefault();
                        self._newValue(self.selectedPath || '', 'string');
                    }
                });
            }
        },
        
        /**
         * 删除选中的值
         */
        _deleteSelectedValue: async function() {
            if (!this._selectedValue || !this._selectedValue.key) {
                // 没有选中的值，提示用户
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(this._getText('REGEDIT_SELECT_VALUE_FIRST', '请先选择一个值'), this._getText('KEY_INFO', '提示'), 'info');
                }
                return;
            }
            
            const { parentPath, key } = this._selectedValue;
            await this._deleteValue(parentPath, key);
            
            // 清除选中状态
            this._selectedValue = null;
        },
        
        /**
         * 删除值
         */
        _deleteValue: async function(parentPath, key) {
            // 直接删除，不显示确认对话框
            try {
                // 数据完整性检查：确保 storageData 已正确加载
                if (!this.storageData || typeof this.storageData !== 'object') {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('RegEdit', 'storageData 未正确加载，尝试重新加载');
                    }
                    await this._loadRegistryData({ forceReload: true });
                    if (!this.storageData || typeof this.storageData !== 'object') {
                        throw new Error('无法加载存储数据，操作已取消');
                    }
                }
                
                // 根据存储类型确保相应的数据结构存在
                if (this.currentStorageType === 'applicationTable') {
                    if (!this.storageData.applications || typeof this.storageData.applications !== 'object') {
                        this.storageData.applications = {};
                    }
                } else {
                    if (!this.storageData.system || typeof this.storageData.system !== 'object') {
                        this.storageData.system = {};
                    }
                    if (!this.storageData.programs || typeof this.storageData.programs !== 'object') {
                        this.storageData.programs = {};
                    }
                }
                
                // 使用与_renderValues和_setValue相同的逻辑解析路径
                let target = this._resolvePath(parentPath);
                
                if (!target || typeof target !== 'object') {
                    throw new Error('路径不存在或目标不是对象');
                }
                
                delete target[key];
                
                // 根据存储类型保存到不同的位置
                try {
                    if (this.currentStorageType === 'localCache') {
                        // 保存到 CacheDrive
                        if (typeof CacheDrive === 'undefined') {
                            throw new Error('CacheDrive 不可用');
                        }
                        
                        // 确保 CacheDrive._cacheMetadata 与 this.storageData 同步
                        if (CacheDrive._cacheMetadata !== this.storageData) {
                            CacheDrive._cacheMetadata = this.storageData;
                        }
                        await CacheDrive._saveCacheMetadata();
                    } else if (this.currentStorageType === 'applicationTable') {
                        // 保存到 ApplicationTable.json
                        if (typeof LStorage === 'undefined') {
                            throw new Error('LStorage 不可用');
                        }
                        
                        // 如果删除的是 applications 下的程序
                        if (parentPath === 'applications') {
                            // 从 applications 对象中删除程序
                            const applicationTable = this.storageData.applications || {};
                            delete applicationTable[key];
                            this._applicationTableCache = applicationTable;
                            // 保存到 ApplicationTable.json
                            await LStorage.setSystemStorage('applicationTable', applicationTable);
                            // 刷新 ApplicationAssetManager
                            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.refresh === 'function') {
                                await ApplicationAssetManager.refresh();
                            }
                        } else {
                            // 其他路径的删除，需要保存整个 ApplicationTable
                            const applicationTable = this.storageData.applications || {};
                            this._applicationTableCache = applicationTable;
                            await LStorage.setSystemStorage('applicationTable', applicationTable);
                            // 刷新 ApplicationAssetManager
                            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.refresh === 'function') {
                                await ApplicationAssetManager.refresh();
                            }
                        }
                    } else {
                        // 保存到 LStorage
                        if (typeof LStorage === 'undefined') {
                            throw new Error('LStorage 不可用');
                        }
                        
                        // 判断是否需要使用deleteSystemStorage（仅当parentPath为'system'时）
                        // 对于'system.xxx'这样的路径，应该保存整个数据，因为键名可能包含点号
                        if (parentPath === 'system') {
                            // 直接删除system存储中的键
                            await LStorage.deleteSystemStorage(key);
                        } else {
                            // 需要手动保存整个数据（包括system.xxx和programs路径）
                            // 确保 LStorage._storageData 与 this.storageData 同步
                            if (LStorage._storageData !== this.storageData) {
                                LStorage._storageData = this.storageData;
                            }
                            await LStorage._saveStorageData();
                        }
                    }
                } catch (saveError) {
                    // 保存失败，恢复数据
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('RegEdit', '保存失败，尝试恢复数据', saveError);
                    }
                    // 重新加载数据以恢复
                    await this._loadRegistryData({ forceReload: true });
                    throw new Error(`保存失败: ${saveError.message}`);
                }
                
                // 重新加载数据
                await this._loadRegistryData();
                this._renderTree();
                this._renderValues(this.selectedPath);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('RegEdit', '删除值失败', error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    GUIManager.showAlert(this._getText('REGEDIT_DELETE_FAILED', '删除失败') + ': ' + error.message);
                } else {
                alert(this._getText('REGEDIT_DELETE_FAILED', '删除失败') + ': ' + error.message);
                }
            }
        },
        
        /**
         * 新建值
         */
        _newValue: async function(parentPath, type) {
            const keyName = prompt(this._getText('REGEDIT_PROMPT_KEY_NAME', '请输入键名:'));
            if (!keyName || !keyName.trim()) {
                return;
            }
            
            let defaultValue;
            switch (type) {
                case 'string':
                    defaultValue = '';
                    break;
                case 'number':
                    defaultValue = 0;
                    break;
                case 'boolean':
                    defaultValue = false;
                    break;
                case 'object':
                    defaultValue = {};
                    break;
                default:
                    defaultValue = null;
            }
            
            try {
                await this._setValue(parentPath, keyName.trim(), defaultValue);
                this._renderTree();
                this._renderValues(this.selectedPath);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('RegEdit', '新建值失败', error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    GUIManager.showAlert(this._getText('REGEDIT_NEW_FAILED', '新建失败') + ': ' + error.message);
                } else {
                alert(this._getText('REGEDIT_NEW_FAILED', '新建失败') + ': ' + error.message);
                }
            }
        },
        
        /**
         * 退出程序
         */
        __exit__: async function() {
            if (this._languageChangeUnsubscribe && typeof this._languageChangeUnsubscribe === 'function') {
                this._languageChangeUnsubscribe();
                this._languageChangeUnsubscribe = null;
            }
            
            // 清理定时器
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }
            
            // 关闭所有子窗口
            if (this.childWindows && this.childWindows.length > 0) {
                this.childWindows.forEach(childWindow => {
                    if (childWindow.window && childWindow.window.parentElement) {
                        childWindow.window.parentElement.removeChild(childWindow.window);
                    }
                    if (typeof GUIManager !== 'undefined' && childWindow.windowId) {
                        GUIManager.unregisterWindow(childWindow.windowId);
                    }
                });
                this.childWindows = [];
            }
            
            // 注销右键菜单
            if (typeof ContextMenuManager !== 'undefined' && this.contextMenuId) {
                ContextMenuManager.unregisterContextMenu(this.pid, this.contextMenuId);
            }
            
            // 移除自定义右键菜单（如果存在）
            const existingMenu = document.querySelector('.regedit-context-menu');
            if (existingMenu && existingMenu.parentNode) {
                existingMenu.parentNode.removeChild(existingMenu);
            }
            
            // 注销主窗口
            if (typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
        },
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'RegEdit',
                type: 'GUI',
                version: '1.0.0',
                description: this._getText('REGEDIT_DESCRIPTION', '注册表编辑器'),
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.CACHE_READ,
                    PermissionManager.PERMISSION.CACHE_WRITE,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,   // 读取系统存储（基础权限，仅可读取非敏感键）
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL,      // 读取用户控制相关存储（userControl.*）- 需要管理员授权
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_PERMISSION_CONTROL, // 读取权限控制相关存储（permissionControl.*, permissionManager.*）- 需要管理员授权
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,  // 写入系统存储（基础权限，仅可写入非敏感键）
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL,      // 写入用户控制相关存储（userControl.*）- 需要管理员授权
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL, // 写入权限控制相关存储（permissionControl.*, permissionManager.*）- 需要管理员授权
                    PermissionManager.PERMISSION.APPLICATION_INSTALL,   // 安装应用程序（用于编辑 ApplicationTable）
                    PermissionManager.PERMISSION.APPLICATION_UNINSTALL, // 卸载应用程序（用于编辑 ApplicationTable）
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 5,
                    alwaysShowInTaskbar: false,
                    allowMultipleInstances: false,
                    supportsPreview: true,
                    category: "system"
                }
            };
        }
    };
    
    // 导出程序对象
    if (typeof window !== 'undefined') {
        window.REGEDIT = REGEDIT;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.REGEDIT = REGEDIT;
    }
    
})(window);
