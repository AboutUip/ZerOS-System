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
        childWindows: [], // 子窗口列表
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
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
                    title: '注册表编辑器',
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
            
            // 创建菜单栏
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
            
            // 创建值列表头部
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
                <div style="width: 200px; font-weight: bold;">名称</div>
                <div style="flex: 1; font-weight: bold;">数据</div>
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
            
            // 启动定时刷新（每2秒刷新一次）
            this.refreshTimer = setInterval(() => {
                this._refreshData();
            }, 2000);
        },
        
        /**
         * 加载注册表数据
         */
        _loadRegistryData: async function() {
            try {
                if (typeof LStorage === 'undefined') {
                    throw new Error('LStorage 不可用');
                }
                
                // 确保LStorage已初始化
                if (!LStorage._initialized) {
                    await LStorage.init();
                }
                
                // 重新加载数据（清除缓存）
                await LStorage._loadStorageData(false);
                
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
                        KernelLogger.debug('RegEdit', `数据加载成功，system键数: ${Object.keys(this.storageData.system).length}, programs键数: ${Object.keys(this.storageData.programs).length}`);
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('RegEdit', '加载注册表数据失败', error);
                }
                this.storageData = {
                    system: {},
                    programs: {}
                };
            }
        },
        
        /**
         * 刷新数据
         */
        _refreshData: async function() {
            try {
                await this._loadRegistryData();
                if (this.selectedPath) {
                    this._renderValues(this.selectedPath);
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('RegEdit', '刷新数据失败', error);
                }
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
            root.innerHTML = '<span style="margin-right: 5px;">📁</span>LocalSData';
            // 使用 EventManager 注册点击事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, root, 'click', () => {
                    this._selectPath('');
                });
            } else {
                root.addEventListener('click', () => {
                    this._selectPath('');
                });
            }
            this.treeContainer.appendChild(root);
            
            // System节点
            const systemNode = this._createTreeNode('system', 'System', this.storageData.system || {}, expandedPaths, 0);
            this.treeContainer.appendChild(systemNode);
            // 注意：system 的子节点路径应该是 'system.键名'，键名可能包含点号
            if (expandedPaths.has('system')) {
                this._renderTreeChildren('system', this.storageData.system || {}, expandedPaths, 1);
            }
            
            // Programs节点
            const programsNode = this._createTreeNode('programs', 'Programs', this.storageData.programs || {}, expandedPaths, 0);
            this.treeContainer.appendChild(programsNode);
            // 注意：programs 的子节点路径应该是 'programs.键名'
            if (expandedPaths.has('programs')) {
                this._renderTreeChildren('programs', this.storageData.programs || {}, expandedPaths, 1);
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
                // 对于system和programs的直接子项，路径就是键名本身（如 'system.style'）
                // 对于嵌套项，路径是 'parent.child' 格式
                const childPath = parentPath ? `${parentPath}.${childKey}` : childKey;
                const childNode = this._createTreeNode(childPath, childKey, childValue, expandedPaths, level);
                this.treeContainer.appendChild(childNode);
                
                // 递归渲染子节点的子节点
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
            
            // 使用 EventManager 注册鼠标事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, node, 'mouseenter', () => {
                    if (this.selectedPath !== key) {
                        node.style.background = 'rgba(108, 142, 255, 0.1)';
                    }
                });
                
                EventManager.registerElementEvent(this.pid, node, 'mouseleave', () => {
                    if (this.selectedPath !== key) {
                        node.style.background = 'transparent';
                    }
                });
                
                EventManager.registerElementEvent(this.pid, node, 'click', (e) => {
                    e.stopPropagation();
                    this._selectPath(key);
                    
                    // 如果是对象且有子节点，展开/折叠
                    if (hasChildren) {
                        const wasExpanded = node.dataset.expanded === 'true';
                        if (wasExpanded) {
                            expandedPaths.delete(key);
                            node.dataset.expanded = 'false';
                        } else {
                            expandedPaths.add(key);
                            node.dataset.expanded = 'true';
                        }
                        this._renderTree(); // 重新渲染以更新展开状态
                    } else {
                        // 没有子节点，只选择路径
                        this._selectPath(key);
                    }
                });
            } else {
                // 降级方案：使用原生 addEventListener
                node.addEventListener('mouseenter', () => {
                    if (this.selectedPath !== key) {
                        node.style.background = 'rgba(108, 142, 255, 0.1)';
                    }
                });
                
                node.addEventListener('mouseleave', () => {
                    if (this.selectedPath !== key) {
                        node.style.background = 'transparent';
                    }
                });
                
                node.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._selectPath(key);
                    
                    // 如果是对象且有子节点，展开/折叠
                    if (hasChildren) {
                        const wasExpanded = node.dataset.expanded === 'true';
                        if (wasExpanded) {
                            expandedPaths.delete(key);
                            node.dataset.expanded = 'false';
                        } else {
                            expandedPaths.add(key);
                            node.dataset.expanded = 'true';
                        }
                        this._renderTree(); // 重新渲染以更新展开状态
                    } else {
                        // 没有子节点，只选择路径
                        this._selectPath(key);
                    }
                });
            }
            
            // 注意：子节点的创建在_renderTree中处理，这里只返回当前节点
            
            return node;
        },
        
        /**
         * 选择路径
         */
        _selectPath: function(path) {
            this.selectedPath = path;
            
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
        },
        
        /**
         * 渲染值列表
         */
        _renderValues: function(path) {
            if (!this.valueContainer) return;
            
            this.valueContainer.innerHTML = '';
            
            // 确保数据已加载
            if (!this.storageData) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('RegEdit', 'storageData 未加载');
                }
                this.valueContainer.innerHTML = '<div style="padding: 20px; color: rgba(255, 100, 100, 0.7);">数据未加载，请刷新</div>';
                return;
            }
            
            let data = null;
            
            if (path === null || path === '') {
                // 根节点，显示system和programs
                data = {
                    system: this.storageData.system || {},
                    programs: this.storageData.programs || {}
                };
            } else if (path === 'system') {
                data = this.storageData.system || {};
            } else if (path === 'programs') {
                data = this.storageData.programs || {};
            } else {
                // 解析路径：注意键名本身可能包含点号（如 'system.style', 'desktop.icons'）
                // 路径格式：'system.style' 表示在 system 对象中查找键 'system.style'
                // 路径格式：'system.musicplayer.settings' 表示在 system 对象中查找键 'musicplayer.settings'
                
                const pathParts = path.split('.');
                
                // 从根开始解析
                data = this.storageData;
                
                // 先解析到父对象（system 或 programs）
                if (pathParts.length > 0 && pathParts[0] === 'system') {
                    data = this.storageData.system || {};
                    // 如果路径只有 'system'，已经完成
                    if (pathParts.length === 1) {
                        // data 已经是 system 对象
                    } else {
                        // 路径是 'system.xxx'，需要在 system 对象中查找键 'xxx'（可能包含点号）
                        // 例如：'system.style' -> 在 system 中查找 'style'
                        // 例如：'system.musicplayer.settings' -> 在 system 中查找 'musicplayer.settings'
                        const keyInSystem = pathParts.slice(1).join('.');
                        if (data && typeof data === 'object' && keyInSystem in data) {
                            data = data[keyInSystem];
                        } else {
                            data = null;
                        }
                    }
                } else if (pathParts.length > 0 && pathParts[0] === 'programs') {
                    data = this.storageData.programs || {};
                    // 如果路径只有 'programs'，已经完成
                    if (pathParts.length === 1) {
                        // data 已经是 programs 对象
                    } else {
                        // 路径是 'programs.xxx'，需要在 programs 对象中查找键 'xxx'
                        const keyInPrograms = pathParts.slice(1).join('.');
                        if (data && typeof data === 'object' && keyInPrograms in data) {
                            data = data[keyInPrograms];
                        } else {
                            data = null;
                        }
                    }
                } else {
                    // 其他路径，尝试从根开始按层级解析
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
            
            if (data === null || data === undefined) {
                this.valueContainer.innerHTML = '<div style="padding: 20px; color: rgba(215, 224, 221, 0.5);">无数据</div>';
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
                    currentKey = '（默认）';
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
                data.forEach((item, index) => {
                    const row = this._createValueRow(String(index), item, path);
                    this.valueContainer.appendChild(row);
                });
            } else {
                // 显示对象键值对
                Object.keys(data).forEach(key => {
                    const value = data[key];
                    const row = this._createValueRow(key, value, path);
                    this.valueContainer.appendChild(row);
                });
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
            
            // 使用 EventManager 注册鼠标事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, row, 'mouseenter', () => {
                    row.style.background = 'rgba(108, 142, 255, 0.1)';
                });
                
                EventManager.registerElementEvent(this.pid, row, 'mouseleave', () => {
                    row.style.background = 'transparent';
                });
                
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
                row.addEventListener('mouseenter', () => {
                    row.style.background = 'rgba(108, 142, 255, 0.1)';
                });
                
                row.addEventListener('mouseleave', () => {
                    row.style.background = 'transparent';
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
                title: `编辑值: ${key}`,
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
            cancelBtn.textContent = '取消';
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
            saveBtn.textContent = '保存';
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
                                    throw new Error('无效的数字');
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
                            GUIManager.showAlert('保存失败: ' + error.message);
                        } else {
                            alert('保存失败: ' + error.message);
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
                                    throw new Error('无效的数字');
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
                            GUIManager.showAlert('保存失败: ' + error.message);
                        } else {
                            alert('保存失败: ' + error.message);
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
         * 设置值
         */
        _setValue: async function(parentPath, key, value) {
            try {
                if (typeof LStorage === 'undefined') {
                    throw new Error('LStorage 不可用');
                }
                
                let target = this.storageData;
                
                if (parentPath === 'system') {
                    target = this.storageData.system;
                } else if (parentPath === 'programs') {
                    target = this.storageData.programs;
                } else if (parentPath) {
                    const pathParts = parentPath.split('.');
                    target = this.storageData;
                    for (const part of pathParts) {
                        if (target && typeof target === 'object' && part in target) {
                            target = target[part];
                        } else {
                            throw new Error('路径不存在');
                        }
                    }
                }
                
                if (!target || typeof target !== 'object') {
                    throw new Error('目标不是对象');
                }
                
                target[key] = value;
                
                // 保存到LStorage
                if (parentPath === 'system' || (parentPath && parentPath.startsWith('system.'))) {
                    await LStorage.setSystemStorage(key, value);
                } else {
                    // 需要手动保存整个数据
                    await LStorage._saveStorageData();
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
            
            // 注册值列表项的右键菜单
            this.contextMenuId = ContextMenuManager.registerContextMenu(this.pid, {
                context: 'window-content',
                selector: '.regedit-value-row',
                priority: 100,
                items: (target) => {
                    const row = target.closest('.regedit-value-row');
                    if (!row) {
                        return [];
                    }
                    
                    // 从行元素获取数据（需要存储这些信息）
                    const key = row.dataset.key;
                    const parentPath = row.dataset.parentPath;
                    const valueType = row.dataset.valueType;
                    
                    if (!key || parentPath === undefined) {
                        return [];
                    }
                    
                    // 获取实际值
                    let value = null;
                    try {
                        // 从存储的数据中获取值
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
                            label: '编辑',
                            action: () => {
                                self._editValue(parentPath, key, value);
                            }
                        },
                        {
                            label: '删除',
                            danger: true,
                            action: () => {
                                self._deleteValue(parentPath, key);
                            }
                        },
                        {
                            separator: true
                        },
                        {
                            label: '新建字符串值',
                            action: () => {
                                self._newValue(parentPath, 'string');
                            }
                        },
                        {
                            label: '新建数字值',
                            action: () => {
                                self._newValue(parentPath, 'number');
                            }
                        },
                        {
                            label: '新建布尔值',
                            action: () => {
                                self._newValue(parentPath, 'boolean');
                            }
                        },
                        {
                            label: '新建对象',
                            action: () => {
                                self._newValue(parentPath, 'object');
                            }
                        }
                    ];
                }
            });
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
                { label: '编辑', action: () => this._editValue(parentPath, key, value) },
                { label: '删除', action: () => this._deleteValue(parentPath, key) },
                { type: 'separator' },
                { label: '新建字符串值', action: () => this._newValue(parentPath, 'string') },
                { label: '新建数字值', action: () => this._newValue(parentPath, 'number') },
                { label: '新建布尔值', action: () => this._newValue(parentPath, 'boolean') },
                { label: '新建对象', action: () => this._newValue(parentPath, 'object') },
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
            const fileMenu = this._createMenuButton('文件(F)', () => {
                // 可以添加文件菜单功能
            });
            menuBar.appendChild(fileMenu);
            
            // 编辑菜单
            const editMenu = this._createMenuButton('编辑(E)', () => {
                // 可以添加编辑菜单功能
            });
            menuBar.appendChild(editMenu);
            
            // 查看菜单
            const viewMenu = this._createMenuButton('查看(V)', () => {
                // 可以添加查看菜单功能
            });
            menuBar.appendChild(viewMenu);
            
            // 刷新按钮
            const refreshBtn = this._createMenuButton('刷新(R)', () => {
                this._refreshData();
                this._renderTree();
                if (this.selectedPath) {
                    this._renderValues(this.selectedPath);
                }
            });
            menuBar.appendChild(refreshBtn);
            
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
                title: `${key} - 注册表编辑器`,
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
            pathDisplay.textContent = `路径: ${fullPath}`;
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
                <div style="width: 200px;">名称</div>
                <div style="flex: 1;">数据</div>
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
            
            // 保存子窗口引用
            this.childWindows.push({
                windowId: actualWindowId,
                window: childWindow,
                path: fullPath,
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
         * 删除值
         */
        _deleteValue: async function(parentPath, key) {
            if (!confirm(`确定要删除 "${key}" 吗？`)) {
                return;
            }
            
            try {
                let target = this.storageData;
                
                if (parentPath === 'system') {
                    target = this.storageData.system;
                } else if (parentPath === 'programs') {
                    target = this.storageData.programs;
                } else if (parentPath) {
                    const pathParts = parentPath.split('.');
                    target = this.storageData;
                    for (const part of pathParts) {
                        if (target && typeof target === 'object' && part in target) {
                            target = target[part];
                        } else {
                            throw new Error('路径不存在');
                        }
                    }
                }
                
                if (!target || typeof target !== 'object') {
                    throw new Error('目标不是对象');
                }
                
                delete target[key];
                
                // 保存到LStorage
                if (parentPath === 'system' || (parentPath && parentPath.startsWith('system.'))) {
                    await LStorage.deleteSystemStorage(key);
                } else {
                    // 需要手动保存整个数据
                    await LStorage._saveStorageData();
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
                    GUIManager.showAlert('删除失败: ' + error.message);
                } else {
                    alert('删除失败: ' + error.message);
                }
            }
        },
        
        /**
         * 新建值
         */
        _newValue: async function(parentPath, type) {
            const keyName = prompt('请输入键名:');
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
                    GUIManager.showAlert('新建失败: ' + error.message);
                } else {
                    alert('新建失败: ' + error.message);
                }
            }
        },
        
        /**
         * 退出程序
         */
        __exit__: async function() {
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
                description: '注册表编辑器',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE
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