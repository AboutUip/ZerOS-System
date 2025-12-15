// ZerOS 文件管理器
// 提供图形化的文件浏览、编辑和管理功能
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const FILEMANAGER = {
        pid: null,
        window: null,
        windowId: null,  // 保存窗口ID，用于精确清理
        
        // 内存管理引用
        _heap: null,
        _shed: null,
        
        // 数据键名（存储在内存中）
        _currentPathKey: 'currentPath',
        _fileListKey: 'fileList',
        _selectedItemKey: 'selectedItem',
        _editingFileKey: 'editingFile',
        _editContentKey: 'editContent',
        
        // 剪贴板数据（复制/剪切）
        _clipboard: null,  // { type: 'copy' | 'cut', items: [{ type, path, name }] }
        
        // 拖拽处理标志（防止重复调用）
        _isHandlingDrop: false,
        
        // 视图模式：'details' | 'large-icons' | 'small-icons' | 'list' | 'tiles'
        _viewMode: 'details',
        
        // 导航历史记录
        _navigationHistory: [],
        _historyIndex: -1,
        
        // 搜索相关
        _searchQuery: '',
        _filteredFileList: null,
        
        // 历史记录导航标志（防止在前进/后退时重复添加历史记录）
        _isNavigatingHistory: false,
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 检查是否是文件选择器模式
            this._isFileSelectorMode = initArgs && initArgs.mode === 'file-selector';
            this._isFolderSelectorMode = initArgs && initArgs.mode === 'folder-selector';
            this._onFileSelected = initArgs && initArgs.onFileSelected;
            this._onFolderSelected = initArgs && initArgs.onFolderSelected;
            
            // 初始化内存管理
            this._initMemory(pid);
            
            // 默认显示根目录视图（显示所有磁盘分区）
            this._setCurrentPath(null);
            
            // 如果指定了初始路径，则使用指定路径
            if (initArgs && initArgs.args && initArgs.args.length > 0) {
                const specifiedPath = initArgs.args[0];
                // 只有在明确指定路径时才使用，否则保持根目录视图
                if (specifiedPath && specifiedPath !== '\\' && specifiedPath !== '') {
                    this._setCurrentPath(specifiedPath);
                }
            } else if (initArgs && initArgs.cwd) {
                const cwdPath = initArgs.cwd;
                if (cwdPath && cwdPath !== '\\' && cwdPath !== '') {
                    this._setCurrentPath(cwdPath);
                }
            }
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'filemanager-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            
            // 注意：窗口的基础样式由 GUIManager 管理，这里只设置必要的样式
            // 如果 GUIManager 不可用，则设置完整样式
            if (typeof GUIManager === 'undefined') {
                this.window.style.cssText = `
                    width: 900px;
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
                // GUIManager 可用时，只设置必要的样式
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
                    icon = ApplicationAssetManager.getIcon('filemanager');
                }
                
                // 根据模式设置不同的窗口标题
                let windowTitle = '文件管理器';
                if (this._isFolderSelectorMode) {
                    windowTitle = '选择文件夹';
                } else if (this._isFileSelectorMode) {
                    windowTitle = '选择文件';
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: windowTitle,
                    icon: icon,
                    onClose: () => {
                        if (typeof ProcessManager !== 'undefined') {
                            ProcessManager.killProgram(this.pid);
                        }
                    }
                });
                // 保存窗口ID，用于精确清理
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 在选择器模式下添加模式标识类
            if (this._isFolderSelectorMode) {
                this.window.classList.add('filemanager-folder-selector-mode');
            } else if (this._isFileSelectorMode) {
                this.window.classList.add('filemanager-file-selector-mode');
            }
            
            // 创建顶部工具栏（Ubuntu风格）
            const topToolbar = this._createTopToolbar();
            this.topToolbar = topToolbar;  // 保存引用以便清理
            this.window.appendChild(topToolbar);
            
            // 创建主内容区域（Ubuntu风格：左侧边栏 + 主内容区）
            const content = document.createElement('div');
            content.className = 'filemanager-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
                min-height: 0;
            `;
            
            // 创建左侧边栏（Ubuntu风格）
            const sidebar = this._createSidebar();
            this.sidebar = sidebar;  // 保存引用以便清理
            content.appendChild(sidebar);
            
            // 创建主内容区（文件列表区域）
            const mainContent = document.createElement('div');
            mainContent.className = 'filemanager-main-content';
            this.mainContent = mainContent;  // 保存引用以便清理
            mainContent.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                min-width: 0;
            `;
            
            // 创建地址栏和搜索框容器（Windows 风格）
            const addressBarContainer = document.createElement('div');
            addressBarContainer.className = 'filemanager-addressbar-container';
            addressBarContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                background: rgba(40, 40, 40, 0.5);
                flex-shrink: 0;
            `;
            
            // 创建地址栏（Windows 风格，面包屑导航）
            const addressBar = this._createAddressBar();
            addressBarContainer.appendChild(addressBar);
            
            // 创建搜索框
            const searchBox = this._createSearchBox();
            addressBarContainer.appendChild(searchBox);
            
            mainContent.appendChild(addressBarContainer);
            
            // 在选择器模式下添加提示信息和选择按钮
            if (this._isFolderSelectorMode || this._isFileSelectorMode) {
                const selectorHint = document.createElement('div');
                selectorHint.className = 'filemanager-selector-hint';
                selectorHint.style.cssText = `
                    padding: 8px 16px;
                    background: rgba(139, 92, 246, 0.1);
                    border-bottom: 1px solid rgba(139, 92, 246, 0.2);
                    color: rgba(215, 224, 221, 0.9);
                    font-size: 13px;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                `;
                
                const hintText = document.createElement('span');
                if (this._isFolderSelectorMode) {
                    hintText.textContent = '📁 双击文件夹进入，单击选中后点击"选择"按钮';
                } else if (this._isFileSelectorMode) {
                    hintText.textContent = '📄 请选择一个文件（单击或双击文件进行选择）';
                }
                selectorHint.appendChild(hintText);
                
                // 文件夹选择器模式下添加选择按钮
                if (this._isFolderSelectorMode) {
                    const selectButton = document.createElement('button');
                    selectButton.className = 'filemanager-select-button';
                    selectButton.textContent = '选择文件夹';
                    selectButton.style.cssText = `
                        padding: 6px 16px;
                        background: rgba(139, 92, 246, 0.3);
                        border: 1px solid rgba(139, 92, 246, 0.5);
                        border-radius: 6px;
                        color: rgba(215, 224, 221, 0.9);
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s;
                        opacity: 0.5;
                        pointer-events: none;
                    `;
                    selectButton.addEventListener('click', () => {
                        this._confirmFolderSelection();
                    });
                    selectorHint.appendChild(selectButton);
                    this.selectButton = selectButton;
                    this.selectedFolder = null; // 存储当前选中的文件夹
                }
                
                mainContent.appendChild(selectorHint);
                this.selectorHint = selectorHint;
            }
            
            // 创建文件列表
            const fileList = this._createFileList();
            mainContent.appendChild(fileList);
            
            // 创建状态栏（Windows 风格，在主内容区底部）
            const statusBar = this._createStatusBar();
            mainContent.appendChild(statusBar);
            
            content.appendChild(mainContent);
            
            // 创建属性面板（初始隐藏，Ubuntu风格在右侧）
            const propertiesPanel = this._createPropertiesPanel();
            content.appendChild(propertiesPanel);
            
            // 创建编辑面板（初始隐藏）
            const editPanel = this._createEditPanel();
            content.appendChild(editPanel);
            
            this.window.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 注册右键菜单
            this._registerContextMenu();
            
            // 初始化拖拽功能（延迟执行，确保进程已完全启动）
            // 使用 setTimeout 确保进程状态已变为 'running'
            setTimeout(() => {
                this._initDragAndDrop();
            }, 100);
            
            // 监听来自桌面的显示属性事件
            this.window.addEventListener('show-file-properties', (e) => {
                const { path, name, type } = e.detail;
                if (path && name) {
                    // 构建项目对象
                    const item = {
                        type: type || 'file',
                        path: path,
                        name: name
                    };
                    // 显示属性面板
                    this._showProperties(item);
                }
            });
            
            // 初始化历史记录（添加初始路径）
            const initialPath = this._getCurrentPath();
            this._navigationHistory = [];
            this._historyIndex = -1;
            this._addToHistory(initialPath);
            
            // 初始化视图模式按钮状态
            this._updateViewModeButtonState();
            
            // 加载当前目录（如果是null，则加载根目录视图）
            if (initialPath === null || initialPath === '') {
                await this._loadRootDirectory();
            } else {
                await this._loadDirectory(initialPath);
            }
            
            // 如果使用GUIManager，窗口已自动居中并获得焦点
            if (typeof GUIManager !== 'undefined') {
                GUIManager.focusWindow(pid);
            }
        },
        
        /**
         * 创建顶部工具栏（Ubuntu风格）
         */
        _createTopToolbar: function() {
            const toolbar = document.createElement('div');
            toolbar.className = 'filemanager-top-toolbar';
            toolbar.style.cssText = `
                height: 48px;
                min-height: 48px;
                max-height: 48px;
                padding: 8px 16px;
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                background: rgba(30, 30, 30, 0.6);
                backdrop-filter: blur(10px);
                box-sizing: border-box;
                flex-shrink: 0;
                overflow: hidden;
            `;
            
            // 后退按钮
            const backBtn = this._createToolbarButton('←', '后退 (Alt+←)', () => {
                this._goBack();
            });
            this.backBtn = backBtn;  // 保存引用以便更新状态
            toolbar.appendChild(backBtn);
            
            // 前进按钮
            const forwardBtn = this._createToolbarButton('→', '前进 (Alt+→)', () => {
                this._goForward();
            });
            this.forwardBtn = forwardBtn;  // 保存引用以便更新状态
            forwardBtn.style.opacity = '0.5';
            forwardBtn.style.cursor = 'not-allowed';
            toolbar.appendChild(forwardBtn);
            
            // 返回上级按钮
            const upBtn = this._createToolbarButton('↑', '返回上级目录', () => {
                this._goUp();
            });
            toolbar.appendChild(upBtn);
            
            // 分隔符
            const separator1 = document.createElement('div');
            separator1.style.cssText = `
                width: 1px;
                height: 24px;
                background: rgba(255, 255, 255, 0.15);
                margin: 0 4px;
            `;
            toolbar.appendChild(separator1);
            
            // 刷新按钮
            const refreshBtn = this._createToolbarButton('↻', '刷新', async () => {
                const currentPath = this._getCurrentPath();
                if (currentPath === null || currentPath === '') {
                    await this._loadRootDirectory();
                } else {
                    await this._loadDirectory(currentPath);
                }
            });
            toolbar.appendChild(refreshBtn);
            
            // 分隔符
            const separator2 = document.createElement('div');
            separator2.style.cssText = separator1.style.cssText;
            toolbar.appendChild(separator2);
            
            // 在选择器模式下隐藏文件操作按钮
            if (!this._isFolderSelectorMode && !this._isFileSelectorMode) {
                // 新建文件按钮
                const newFileBtn = this._createToolbarButton('+ 文件', '新建文件', () => {
                    this._createNewFile();
                }, true);
                toolbar.appendChild(newFileBtn);
                
                // 新建目录按钮
                const newDirBtn = this._createToolbarButton('+ 目录', '新建目录', () => {
                    this._createNewDirectory();
                }, true);
                toolbar.appendChild(newDirBtn);
                
                // 分隔符
                const separator3 = document.createElement('div');
                separator3.style.cssText = separator1.style.cssText;
                toolbar.appendChild(separator3);
                
                // 复制按钮
                const copyBtn = this._createToolbarButton('📋 复制', '复制 (Ctrl+C)', () => {
                    this._copySelectedItems();
                }, true);
                copyBtn.style.opacity = '0.5';
                copyBtn.style.cursor = 'not-allowed';
                this.copyBtn = copyBtn;  // 保存引用以便更新状态
                toolbar.appendChild(copyBtn);
                
                // 剪切按钮
                const cutBtn = this._createToolbarButton('✂️ 剪切', '剪切 (Ctrl+X)', () => {
                    this._cutSelectedItems();
                }, true);
                cutBtn.style.opacity = '0.5';
                cutBtn.style.cursor = 'not-allowed';
                this.cutBtn = cutBtn;  // 保存引用以便更新状态
                toolbar.appendChild(cutBtn);
                
                // 粘贴按钮
                const pasteBtn = this._createToolbarButton('📄 粘贴', '粘贴 (Ctrl+V)', () => {
                    this._pasteItems();
                }, true);
                pasteBtn.style.opacity = '0.5';
                pasteBtn.style.cursor = 'not-allowed';
                this.pasteBtn = pasteBtn;  // 保存引用以便更新状态
                toolbar.appendChild(pasteBtn);
                
                // 分隔符
                const separator4 = document.createElement('div');
                separator4.style.cssText = separator1.style.cssText;
                toolbar.appendChild(separator4);
                
                // 视图模式切换按钮组
                const viewModeGroup = document.createElement('div');
                viewModeGroup.style.cssText = `
                    display: flex;
                    gap: 2px;
                    align-items: center;
                    padding: 2px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                `;
                
                // 详细信息视图按钮
                const detailsViewBtn = this._createViewModeButton('详细信息', 'details', '≡');
                viewModeGroup.appendChild(detailsViewBtn);
                
                // 大图标视图按钮
                const largeIconsViewBtn = this._createViewModeButton('大图标', 'large-icons', '⊞');
                viewModeGroup.appendChild(largeIconsViewBtn);
                
                // 小图标视图按钮
                const smallIconsViewBtn = this._createViewModeButton('小图标', 'small-icons', '⊟');
                viewModeGroup.appendChild(smallIconsViewBtn);
                
                // 列表视图按钮
                const listViewBtn = this._createViewModeButton('列表', 'list', '☰');
                viewModeGroup.appendChild(listViewBtn);
                
                // 平铺视图按钮
                const tilesViewBtn = this._createViewModeButton('平铺', 'tiles', '▦');
                viewModeGroup.appendChild(tilesViewBtn);
                
                this.viewModeButtons = {
                    'details': detailsViewBtn,
                    'large-icons': largeIconsViewBtn,
                    'small-icons': smallIconsViewBtn,
                    'list': listViewBtn,
                    'tiles': tilesViewBtn
                };
                
                // 更新当前视图模式按钮状态
                this._updateViewModeButtonState();
                
                toolbar.appendChild(viewModeGroup);
            }
            
            return toolbar;
        },
        
        /**
         * 创建工具栏按钮（辅助方法）
         */
        _createToolbarButton: function(text, title, onClick, isTextButton = false) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.title = title;
            if (isTextButton) {
                btn.style.cssText = `
                    padding: 6px 12px;
                    height: 32px;
                    min-height: 32px;
                    max-height: 32px;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    background: rgba(255, 255, 255, 0.05);
                    color: #e8ecf0;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.2s;
                    box-sizing: border-box;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                `;
            } else {
                btn.style.cssText = `
                    width: 32px;
                    height: 32px;
                    min-width: 32px;
                    min-height: 32px;
                    max-width: 32px;
                    max-height: 32px;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    background: rgba(255, 255, 255, 0.05);
                    color: #e8ecf0;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    flex-shrink: 0;
                `;
            }
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(255, 255, 255, 0.1)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(255, 255, 255, 0.05)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            });
            btn.addEventListener('click', onClick);
            return btn;
        },
        
        /**
         * 创建视图模式切换按钮
         */
        _createViewModeButton: function(title, mode, icon) {
            const btn = document.createElement('button');
            btn.title = title;
            btn.dataset.viewMode = mode;
            btn.style.cssText = `
                width: 28px;
                height: 28px;
                min-width: 28px;
                min-height: 28px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                background: rgba(255, 255, 255, 0.05);
                color: #e8ecf0;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
            `;
            btn.textContent = icon;
            
            btn.addEventListener('mouseenter', () => {
                if (!btn.classList.contains('active')) {
                    btn.style.background = 'rgba(255, 255, 255, 0.1)';
                    btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }
            });
            btn.addEventListener('mouseleave', () => {
                if (!btn.classList.contains('active')) {
                    btn.style.background = 'rgba(255, 255, 255, 0.05)';
                    btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }
            });
            btn.addEventListener('click', () => {
                this._setViewMode(mode);
            });
            
            return btn;
        },
        
        /**
         * 设置视图模式
         */
        _setViewMode: function(mode) {
            if (this._viewMode === mode) return;
            
            this._viewMode = mode;
            this._updateViewModeButtonState();
            
            // 更新文件列表容器的类名以应用不同的视图样式
            if (this.fileListElement) {
                // 移除所有视图模式类
                this.fileListElement.classList.remove(
                    'view-details',
                    'view-large-icons',
                    'view-small-icons',
                    'view-list',
                    'view-tiles'
                );
                // 添加当前视图模式类
                this.fileListElement.classList.add(`view-${mode}`);
            }
            
            this._renderFileList();  // 重新渲染以应用新视图模式
        },
        
        /**
         * 更新视图模式按钮状态
         */
        _updateViewModeButtonState: function() {
            if (!this.viewModeButtons) return;
            
            Object.keys(this.viewModeButtons).forEach(mode => {
                const btn = this.viewModeButtons[mode];
                if (mode === this._viewMode) {
                    btn.classList.add('active');
                    btn.style.background = 'rgba(108, 142, 255, 0.3)';
                    btn.style.borderColor = 'rgba(108, 142, 255, 0.5)';
                    btn.style.color = '#6c8eff';
                } else {
                    btn.classList.remove('active');
                    btn.style.background = 'rgba(255, 255, 255, 0.05)';
                    btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    btn.style.color = '#e8ecf0';
                }
            });
        },
        
        /**
         * 创建左侧边栏（Ubuntu风格）
         */
        _createSidebar: function() {
            const sidebar = document.createElement('div');
            sidebar.className = 'filemanager-sidebar';
            sidebar.style.cssText = `
                width: 220px;
                min-width: 180px;
                max-width: 300px;
                background: rgba(25, 25, 25, 0.8);
                border-right: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                overflow-y: auto;
                overflow-x: hidden;
            `;
            
            // 侧边栏标题
            const sidebarTitle = document.createElement('div');
            sidebarTitle.style.cssText = `
                padding: 12px 16px;
                font-size: 11px;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            `;
            sidebarTitle.textContent = '位置';
            sidebar.appendChild(sidebarTitle);
            
            // 磁盘分区列表
            const diskList = document.createElement('div');
            diskList.className = 'filemanager-sidebar-disks';
            diskList.style.cssText = `
                padding: 4px 0;
            `;
            
            // 根目录项
            const rootItem = this._createSidebarItem('\\', '计算机', () => {
                this._loadRootDirectory();
            }, true);
            diskList.appendChild(rootItem);
            
            // 分隔线
            const separator = document.createElement('div');
            separator.style.cssText = `
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 8px 16px;
            `;
            diskList.appendChild(separator);
            
            // 动态加载磁盘分区
            this._updateSidebarDisks(diskList);
            
            sidebar.appendChild(diskList);
            this.sidebar = sidebar;
            this.sidebarDiskList = diskList;
            return sidebar;
        },
        
        /**
         * 创建侧边栏项
         */
        _createSidebarItem: function(name, label, onClick, isActive = false) {
            const item = document.createElement('div');
            item.className = 'filemanager-sidebar-item';
            item.style.cssText = `
                padding: 8px 16px;
                display: flex;
                align-items: center;
                gap: 12px;
                cursor: pointer;
                color: ${isActive ? '#6c8eff' : '#e8ecf0'};
                background: ${isActive ? 'rgba(108, 142, 255, 0.15)' : 'transparent'};
                transition: all 0.2s;
                font-size: 14px;
            `;
            
            // 图标
            const icon = document.createElement('div');
            icon.style.cssText = `
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            `;
            const iconImg = document.createElement('img');
            let iconUrl = 'D:/application/filemanager/assets/folder.svg';
            // 使用 ProcessManager.convertVirtualPathToUrl 转换路径
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
                iconUrl = ProcessManager.convertVirtualPathToUrl(iconUrl);
            }
            iconImg.src = iconUrl;
            iconImg.style.cssText = 'width: 18px; height: 18px; opacity: 0.8;';
            iconImg.onerror = () => {
                iconImg.style.display = 'none';
            };
            icon.appendChild(iconImg);
            item.appendChild(icon);
            
            // 标签
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            item.appendChild(labelEl);
            
            item.addEventListener('mouseenter', () => {
                if (!isActive) {
                    item.style.background = 'rgba(255, 255, 255, 0.05)';
                }
            });
            item.addEventListener('mouseleave', () => {
                if (!isActive) {
                    item.style.background = 'transparent';
                }
            });
            item.addEventListener('click', onClick);
            
            return item;
        },
        
        /**
         * 更新侧边栏磁盘列表
         */
        _updateSidebarDisks: function(diskList) {
            // 清除现有磁盘项（保留根目录项和分隔线）
            const itemsToRemove = [];
            for (let i = 2; i < diskList.children.length; i++) {
                itemsToRemove.push(diskList.children[i]);
            }
            itemsToRemove.forEach(item => item.remove());
            
            // 获取所有磁盘分区
            const disks = [];
            if (typeof Disk !== 'undefined' && typeof Disk._getDiskSeparateMap === 'function') {
                try {
                    const diskMap = Disk._getDiskSeparateMap();
                    if (diskMap && diskMap.size > 0) {
                        for (const [diskName, coll] of diskMap) {
                            if (coll && typeof coll === 'object') {
                                disks.push(diskName);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('获取磁盘分区失败:', e);
                }
            }
            
            // 如果 Disk API 不可用，尝试从 POOL 获取
            if (disks.length === 0 && typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                const knownDisks = ['C:', 'D:'];
                for (const diskName of knownDisks) {
                    try {
                        const coll = POOL.__GET__("KERNEL_GLOBAL_POOL", diskName);
                        if (coll && typeof coll === 'object') {
                            disks.push(diskName);
                        }
                    } catch (e) {
                        // 忽略
                    }
                }
            }
            
            // 排序并添加磁盘项
            disks.sort();
            for (const diskName of disks) {
                const currentPath = this._getCurrentPath();
                const isActive = currentPath === diskName;
                const diskItem = this._createSidebarItem(diskName, diskName, () => {
                    this._loadDirectory(diskName);
                }, isActive);
                diskList.appendChild(diskItem);
            }
        },
        
        /**
         * 创建工具栏（保留原方法名以兼容）
         */
        _createToolbar: function() {
            const toolbar = document.createElement('div');
            toolbar.className = 'filemanager-toolbar';
            toolbar.style.cssText = `
                height: 40px;
                padding: 8px 12px;
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                background: rgba(108, 142, 255, 0.05);
            `;
            
            // 返回上级按钮
            const upBtn = document.createElement('button');
            upBtn.textContent = '↑';
            upBtn.title = '返回上级目录';
            upBtn.style.cssText = `
                width: 32px;
                height: 32px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #e8ecf0;
                border-radius: 6px;
                cursor: pointer;
                font-size: 18px;
                transition: all 0.2s;
            `;
            upBtn.addEventListener('mouseenter', () => {
                upBtn.style.background = 'rgba(108, 142, 255, 0.2)';
                upBtn.style.borderColor = '#6c8eff';
            });
            upBtn.addEventListener('mouseleave', () => {
                upBtn.style.background = 'rgba(108, 142, 255, 0.1)';
                upBtn.style.borderColor = 'rgba(108, 142, 255, 0.3)';
            });
            upBtn.addEventListener('click', () => {
                this._goUp();
            });
            toolbar.appendChild(upBtn);
            
            // 刷新按钮
            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = '↻';
            refreshBtn.title = '刷新';
            refreshBtn.style.cssText = upBtn.style.cssText;
            refreshBtn.addEventListener('mouseenter', () => {
                refreshBtn.style.background = 'rgba(108, 142, 255, 0.2)';
                refreshBtn.style.borderColor = '#6c8eff';
            });
            refreshBtn.addEventListener('mouseleave', () => {
                refreshBtn.style.background = 'rgba(108, 142, 255, 0.1)';
                refreshBtn.style.borderColor = 'rgba(108, 142, 255, 0.3)';
            });
            refreshBtn.addEventListener('click', () => {
                const currentPath = this._getCurrentPath();
                if (currentPath === null || currentPath === '') {
                    this._loadRootDirectory();
                } else {
                    this._loadDirectory(currentPath);
                }
            });
            toolbar.appendChild(refreshBtn);
            
            // 分隔符
            const separator = document.createElement('div');
            separator.style.cssText = `
                width: 1px;
                height: 24px;
                background: rgba(108, 142, 255, 0.2);
                margin: 0 8px;
            `;
            toolbar.appendChild(separator);
            
            // 新建文件按钮
            const newFileBtn = document.createElement('button');
            newFileBtn.textContent = '+ 文件';
            newFileBtn.title = '新建文件';
            newFileBtn.style.cssText = `
                padding: 6px 12px;
                height: 32px;
                border: 1px solid rgba(108, 142, 255, 0.3);
                background: rgba(108, 142, 255, 0.1);
                color: #e8ecf0;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            `;
            newFileBtn.addEventListener('mouseenter', () => {
                newFileBtn.style.background = 'rgba(108, 142, 255, 0.2)';
                newFileBtn.style.borderColor = '#6c8eff';
            });
            newFileBtn.addEventListener('mouseleave', () => {
                newFileBtn.style.background = 'rgba(108, 142, 255, 0.1)';
                newFileBtn.style.borderColor = 'rgba(108, 142, 255, 0.3)';
            });
            newFileBtn.addEventListener('click', () => {
                this._createNewFile();
            });
            toolbar.appendChild(newFileBtn);
            
            // 新建目录按钮
            const newDirBtn = document.createElement('button');
            newDirBtn.textContent = '+ 目录';
            newDirBtn.title = '新建目录';
            newDirBtn.style.cssText = newFileBtn.style.cssText;
            newDirBtn.addEventListener('mouseenter', () => {
                newDirBtn.style.background = 'rgba(108, 142, 255, 0.2)';
                newDirBtn.style.borderColor = '#6c8eff';
            });
            newDirBtn.addEventListener('mouseleave', () => {
                newDirBtn.style.background = 'rgba(108, 142, 255, 0.1)';
                newDirBtn.style.borderColor = 'rgba(108, 142, 255, 0.3)';
            });
            newDirBtn.addEventListener('click', () => {
                this._createNewDirectory();
            });
            toolbar.appendChild(newDirBtn);
            
            return toolbar;
        },
        
        /**
         * 创建地址栏
         */
        _createAddressBar: function() {
            const addressBar = document.createElement('div');
            addressBar.className = 'filemanager-addressbar';
            addressBar.style.cssText = `
                height: 36px;
                padding: 8px 12px;
                display: flex;
                align-items: center;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                background: rgba(108, 142, 255, 0.03);
            `;
            
            // 地址栏图标
            const addressIcon = document.createElement('div');
            addressIcon.style.cssText = `
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.6;
            `;
            const iconImg = document.createElement('img');
            let iconUrl = 'D:/application/filemanager/assets/folder.svg';
            // 使用 ProcessManager.convertVirtualPathToUrl 转换路径
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
                iconUrl = ProcessManager.convertVirtualPathToUrl(iconUrl);
            }
            iconImg.src = iconUrl;
            iconImg.style.cssText = 'width: 16px; height: 16px;';
            iconImg.onerror = () => {
                iconImg.style.display = 'none';
            };
            addressIcon.appendChild(iconImg);
            addressBar.appendChild(addressIcon);
            
            const addressInput = document.createElement('input');
            addressInput.type = 'text';
            addressInput.className = 'filemanager-address-input';
            addressInput.value = this.currentPath || '\\';  // 根目录显示为 \
            addressInput.style.cssText = `
                flex: 1;
                height: 32px;
                padding: 6px 12px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                color: #e8ecf0;
                font-size: 13px;
                outline: none;
                transition: all 0.2s;
            `;
            addressInput.addEventListener('focus', () => {
                addressInput.style.borderColor = 'rgba(108, 142, 255, 0.5)';
                addressInput.style.background = 'rgba(255, 255, 255, 0.08)';
            });
            addressInput.addEventListener('blur', () => {
                addressInput.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                addressInput.style.background = 'rgba(255, 255, 255, 0.05)';
            });
            addressInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const path = addressInput.value.trim();
                    if (path === '\\' || path === '') {
                        this._loadRootDirectory();
                    } else if (path) {
                        this._navigateToPath(path);
                    }
                }
            });
            
            this.addressInput = addressInput;
            addressBar.appendChild(addressInput);
            
            return addressBar;
        },
        
        /**
         * 更新面包屑导航
         */
        _updateBreadcrumb: function() {
            if (!this.breadcrumbContainer) return;
            
            this.breadcrumbContainer.innerHTML = '';
            
            const currentPath = this._getCurrentPath();
            
            // 根目录
            const rootItem = document.createElement('span');
            rootItem.className = 'breadcrumb-item';
            rootItem.textContent = '此电脑';
            rootItem.style.cssText = `
                padding: 4px 8px;
                cursor: pointer;
                color: #e8ecf0;
                font-size: 13px;
                border-radius: 3px;
                transition: background 0.2s;
                white-space: nowrap;
            `;
            rootItem.addEventListener('mouseenter', () => {
                rootItem.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            rootItem.addEventListener('mouseleave', () => {
                rootItem.style.background = 'transparent';
            });
            rootItem.addEventListener('click', () => {
                this._loadRootDirectory();
            });
            this.breadcrumbContainer.appendChild(rootItem);
            
            if (!currentPath || currentPath === '\\' || currentPath === '') {
                return;  // 根目录，只显示"此电脑"
            }
            
            // 分隔符
            const separator = document.createElement('span');
            separator.textContent = '›';
            separator.style.cssText = `
                color: rgba(255, 255, 255, 0.4);
                font-size: 13px;
                margin: 0 2px;
            `;
            this.breadcrumbContainer.appendChild(separator);
            
            // 解析路径并创建面包屑项
            const pathParts = currentPath.split('/').filter(p => p);
            if (pathParts.length === 0) return;
            
            // 处理盘符（如 C:）
            const diskPart = pathParts[0];
            if (/^[CD]:$/.test(diskPart)) {
                const diskItem = document.createElement('span');
                diskItem.className = 'breadcrumb-item';
                diskItem.textContent = diskPart;
                diskItem.style.cssText = rootItem.style.cssText;
                diskItem.addEventListener('mouseenter', () => {
                    diskItem.style.background = 'rgba(255, 255, 255, 0.1)';
                });
                diskItem.addEventListener('mouseleave', () => {
                    diskItem.style.background = 'transparent';
                });
                diskItem.addEventListener('click', () => {
                    this._loadDirectory(diskPart);
                });
                this.breadcrumbContainer.appendChild(diskItem);
                
                // 处理子路径
                for (let i = 1; i < pathParts.length; i++) {
                    const separator2 = document.createElement('span');
                    separator2.textContent = '›';
                    separator2.style.cssText = separator.style.cssText;
                    this.breadcrumbContainer.appendChild(separator2);
                    
                    const part = pathParts[i];
                    const partPath = pathParts.slice(0, i + 1).join('/');
                    
                    const partItem = document.createElement('span');
                    partItem.className = 'breadcrumb-item';
                    partItem.textContent = part;
                    partItem.style.cssText = rootItem.style.cssText;
                    partItem.addEventListener('mouseenter', () => {
                        partItem.style.background = 'rgba(255, 255, 255, 0.1)';
                    });
                    partItem.addEventListener('mouseleave', () => {
                        partItem.style.background = 'transparent';
                    });
                    partItem.addEventListener('click', () => {
                        this._loadDirectory(diskPart + '/' + pathParts.slice(1, i + 1).join('/'));
                    });
                    this.breadcrumbContainer.appendChild(partItem);
                }
            }
        },
        
        /**
         * 创建搜索框
         */
        _createSearchBox: function() {
            const searchContainer = document.createElement('div');
            searchContainer.className = 'filemanager-search-box';
            searchContainer.style.cssText = `
                width: 200px;
                height: 32px;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 8px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 4px;
                transition: all 0.2s;
            `;
            
            // 搜索图标
            const searchIcon = document.createElement('span');
            searchIcon.textContent = '🔍';
            searchIcon.style.cssText = `
                font-size: 14px;
                opacity: 0.6;
                flex-shrink: 0;
            `;
            searchContainer.appendChild(searchIcon);
            
            // 搜索输入框
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = '搜索...';
            searchInput.className = 'filemanager-search-input';
            searchInput.style.cssText = `
                flex: 1;
                height: 24px;
                padding: 0;
                background: transparent;
                border: none;
                color: #e8ecf0;
                font-size: 13px;
                outline: none;
            `;
            
            // 清除按钮（初始隐藏）
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '×';
            clearBtn.title = '清除搜索';
            clearBtn.style.cssText = `
                width: 18px;
                height: 18px;
                padding: 0;
                border: none;
                background: transparent;
                color: #e8ecf0;
                cursor: pointer;
                font-size: 16px;
                opacity: 0.6;
                display: none;
                transition: opacity 0.2s;
                flex-shrink: 0;
            `;
            clearBtn.addEventListener('mouseenter', () => {
                clearBtn.style.opacity = '1';
            });
            clearBtn.addEventListener('mouseleave', () => {
                clearBtn.style.opacity = '0.6';
            });
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                this._searchQuery = '';
                this._filteredFileList = null;
                clearBtn.style.display = 'none';
                this._renderFileList();
                this._updateStatusBar();
            });
            
            // 搜索事件处理
            let searchTimeout = null;
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                
                if (query) {
                    clearBtn.style.display = 'block';
                } else {
                    clearBtn.style.display = 'none';
                }
                
                // 防抖处理
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                
                searchTimeout = setTimeout(() => {
                    this._performSearch(query);
                }, 300);
            });
            
            searchInput.addEventListener('focus', () => {
                searchContainer.style.borderColor = 'rgba(108, 142, 255, 0.5)';
                searchContainer.style.background = 'rgba(255, 255, 255, 0.08)';
            });
            
            searchInput.addEventListener('blur', () => {
                searchContainer.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                searchContainer.style.background = 'rgba(255, 255, 255, 0.05)';
            });
            
            this.searchInput = searchInput;
            searchContainer.appendChild(searchInput);
            searchContainer.appendChild(clearBtn);
            
            return searchContainer;
        },
        
        /**
         * 执行搜索
         */
        _performSearch: function(query) {
            this._searchQuery = query;
            
            if (!query) {
                this._filteredFileList = null;
                this._renderFileList();
                this._updateStatusBar();
                return;
            }
            
            const fileList = this._getFileList();
            const lowerQuery = query.toLowerCase();
            
            this._filteredFileList = fileList.filter(item => {
                return item.name.toLowerCase().includes(lowerQuery);
            });
            
            this._renderFileList();
            this._updateStatusBar();
        },
        
        /**
         * 创建状态栏
         */
        _createStatusBar: function() {
            const statusBar = document.createElement('div');
            statusBar.className = 'filemanager-statusbar';
            statusBar.style.cssText = `
                height: 24px;
                min-height: 24px;
                padding: 4px 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                background: rgba(30, 30, 30, 0.6);
                font-size: 12px;
                color: rgba(255, 255, 255, 0.7);
                flex-shrink: 0;
            `;
            
            // 左侧：选中项信息
            const statusLeft = document.createElement('div');
            statusLeft.className = 'filemanager-status-left';
            statusLeft.style.cssText = `
                display: flex;
                align-items: center;
                gap: 16px;
            `;
            
            const statusText = document.createElement('span');
            statusText.className = 'filemanager-status-text';
            this.statusText = statusText;
            statusLeft.appendChild(statusText);
            
            // 右侧：文件数量、大小等信息
            const statusRight = document.createElement('div');
            statusRight.className = 'filemanager-status-right';
            statusRight.style.cssText = `
                display: flex;
                align-items: center;
                gap: 16px;
            `;
            
            const fileCountText = document.createElement('span');
            fileCountText.className = 'filemanager-status-count';
            this.fileCountText = fileCountText;
            statusRight.appendChild(fileCountText);
            
            statusBar.appendChild(statusLeft);
            statusBar.appendChild(statusRight);
            
            // 初始化状态栏
            this._updateStatusBar();
            
            return statusBar;
        },
        
        /**
         * 更新状态栏
         */
        _updateStatusBar: function() {
            if (!this.statusText || !this.fileCountText) return;
            
            const fileList = this._filteredFileList || this._getFileList();
            const selectedItem = this._getSelectedItem();
            
            // 更新选中项信息
            if (selectedItem) {
                const size = selectedItem.type === 'file' ? this._formatFileSize(selectedItem.size || 0) : '';
                this.statusText.textContent = selectedItem.name + (size ? ` (${size})` : '');
            } else {
                this.statusText.textContent = '';
            }
            
            // 更新文件数量
            const totalCount = fileList.length;
            const fileCount = fileList.filter(item => item.type === 'file').length;
            const folderCount = fileList.filter(item => item.type === 'directory').length;
            
            if (this._searchQuery) {
                this.fileCountText.textContent = `找到 ${totalCount} 项 (${fileCount} 个文件, ${folderCount} 个文件夹)`;
            } else {
                this.fileCountText.textContent = `${totalCount} 项 (${fileCount} 个文件, ${folderCount} 个文件夹)`;
            }
        },
        
        /**
         * 创建文件列表
         */
        _createFileList: function() {
            const fileList = document.createElement('div');
            fileList.className = 'filemanager-filelist';
            fileList.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 8px;
                background: rgba(15, 20, 35, 0.5);
            `;
            
            // 添加滚动条样式
            fileList.style.scrollbarWidth = 'thin';
            fileList.style.scrollbarColor = 'rgba(108, 142, 255, 0.3) rgba(15, 20, 35, 0.5)';
            
            // 应用初始视图模式类
            if (this._viewMode) {
                fileList.classList.add(`view-${this._viewMode}`);
            } else {
                // 默认使用详细信息视图
                fileList.classList.add('view-details');
                this._viewMode = 'details';
            }
            
            this.fileListElement = fileList;
            return fileList;
        },
        
        /**
         * 创建编辑面板
         */
        _createEditPanel: function() {
            const editPanel = document.createElement('div');
            editPanel.className = 'filemanager-editpanel';
            editPanel.style.cssText = `
                width: 0;
                display: none;
                flex-direction: column;
                border-left: 1px solid rgba(108, 142, 255, 0.2);
                background: rgba(15, 20, 35, 0.7);
                transition: width 0.3s;
            `;
            
            // 编辑面板标题栏
            const editHeader = document.createElement('div');
            editHeader.style.cssText = `
                height: 40px;
                padding: 8px 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                background: rgba(108, 142, 255, 0.05);
            `;
            
            const editTitle = document.createElement('div');
            editTitle.className = 'filemanager-edit-title';
            editTitle.style.cssText = `
                font-size: 14px;
                font-weight: 600;
                color: #e8ecf0;
            `;
            editTitle.textContent = '编辑文件';
            editHeader.appendChild(editTitle);
            
            const editActions = document.createElement('div');
            editActions.style.cssText = `
                display: flex;
                gap: 8px;
            `;
            
            // 保存按钮
            const saveBtn = document.createElement('button');
            saveBtn.textContent = '保存';
            saveBtn.style.cssText = `
                padding: 4px 12px;
                height: 28px;
                border: 1px solid rgba(74, 222, 128, 0.5);
                background: rgba(74, 222, 128, 0.1);
                color: #4ade80;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            `;
            saveBtn.addEventListener('mouseenter', () => {
                saveBtn.style.background = 'rgba(74, 222, 128, 0.2)';
                saveBtn.style.borderColor = '#4ade80';
            });
            saveBtn.addEventListener('mouseleave', () => {
                saveBtn.style.background = 'rgba(74, 222, 128, 0.1)';
                saveBtn.style.borderColor = 'rgba(74, 222, 128, 0.5)';
            });
            saveBtn.addEventListener('click', () => {
                this._saveEditingFile();
            });
            editActions.appendChild(saveBtn);
            
            // 关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.style.cssText = `
                width: 28px;
                height: 28px;
                border: 1px solid rgba(255, 68, 68, 0.5);
                background: rgba(255, 68, 68, 0.1);
                color: #ff4444;
                border-radius: 6px;
                cursor: pointer;
                font-size: 18px;
                transition: all 0.2s;
            `;
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'rgba(255, 68, 68, 0.2)';
                closeBtn.style.borderColor = '#ff4444';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'rgba(255, 68, 68, 0.1)';
                closeBtn.style.borderColor = 'rgba(255, 68, 68, 0.5)';
            });
            closeBtn.addEventListener('click', () => {
                this._closeEditPanel();
            });
            editActions.appendChild(closeBtn);
            
            editHeader.appendChild(editActions);
            editPanel.appendChild(editHeader);
            
            // 编辑区域
            const editArea = document.createElement('textarea');
            editArea.className = 'filemanager-edit-area';
            editArea.style.cssText = `
                flex: 1;
                padding: 12px;
                background: rgba(15, 20, 35, 0.8);
                border: none;
                color: #e8ecf0;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 14px;
                line-height: 1.6;
                resize: none;
                outline: none;
            `;
            this.editArea = editArea;
            editPanel.appendChild(editArea);
            
            this.editPanel = editPanel;
            return editPanel;
        },
        
        /**
         * 创建属性面板
         */
        _createPropertiesPanel: function() {
            const propertiesPanel = document.createElement('div');
            propertiesPanel.className = 'filemanager-propertiespanel';
            propertiesPanel.style.cssText = `
                width: 0;
                display: none;
                flex-direction: column;
                border-left: 1px solid rgba(108, 142, 255, 0.2);
                background: rgba(15, 20, 35, 0.7);
                transition: width 0.3s;
                overflow: hidden;
            `;
            
            // 属性面板标题栏
            const propHeader = document.createElement('div');
            propHeader.style.cssText = `
                height: 40px;
                padding: 8px 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                background: rgba(108, 142, 255, 0.05);
            `;
            
            const propTitle = document.createElement('div');
            propTitle.className = 'filemanager-properties-title';
            propTitle.style.cssText = `
                font-size: 14px;
                font-weight: 600;
                color: #e8ecf0;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            
            // 使用SVG图标
            const titleIcon = document.createElement('img');
            let iconUrl = 'D:/application/filemanager/assets/info.svg';
            // 使用 ProcessManager.convertVirtualPathToUrl 转换路径
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
                iconUrl = ProcessManager.convertVirtualPathToUrl(iconUrl);
            }
            titleIcon.src = iconUrl;
            titleIcon.style.cssText = 'width: 16px; height: 16px; opacity: 0.8;';
            titleIcon.onerror = () => {
                titleIcon.style.display = 'none';
            };
            propTitle.appendChild(titleIcon);
            
            const titleText = document.createElement('span');
            titleText.textContent = '属性';
            propTitle.appendChild(titleText);
            propHeader.appendChild(propTitle);
            
            // 关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.style.cssText = `
                width: 28px;
                height: 28px;
                border: 1px solid rgba(255, 68, 68, 0.5);
                background: rgba(255, 68, 68, 0.1);
                color: #ff4444;
                border-radius: 6px;
                cursor: pointer;
                font-size: 18px;
                transition: all 0.2s;
            `;
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'rgba(255, 68, 68, 0.2)';
                closeBtn.style.borderColor = '#ff4444';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'rgba(255, 68, 68, 0.1)';
                closeBtn.style.borderColor = 'rgba(255, 68, 68, 0.5)';
            });
            closeBtn.addEventListener('click', () => {
                this._closePropertiesPanel();
            });
            propHeader.appendChild(closeBtn);
            propertiesPanel.appendChild(propHeader);
            
            // 属性内容区域
            const propContent = document.createElement('div');
            propContent.className = 'filemanager-properties-content';
            propContent.style.cssText = `
                flex: 1;
                padding: 16px;
                overflow-y: auto;
                color: #e8ecf0;
                font-size: 13px;
            `;
            this.propertiesContent = propContent;
            propertiesPanel.appendChild(propContent);
            
            this.propertiesPanel = propertiesPanel;
            return propertiesPanel;
        },
        
        /**
         * 显示属性面板
         */
        _showProperties: async function(item) {
            if (!this.propertiesPanel || !this.propertiesContent) {
                console.warn('[FileManager] 属性面板未初始化');
                return;
            }
            
            // 显示属性面板
            this.propertiesPanel.style.display = 'flex';
            this.propertiesPanel.style.width = '300px';
            
            // 清空内容，显示加载中
            this.propertiesContent.innerHTML = '<div style="color: #aab2c0; text-align: center; padding: 20px;">加载中...</div>';
            
            try {
                // 从文件系统获取详细信息（使用 FSDirve.php，与桌面图标属性功能一致）
                const fileInfo = await this._getFileInfoFromFS(item.path);
                
                // 格式化文件大小
                const formatFileSize = (bytes) => {
                    if (bytes === 0) return '0 B';
                    const k = 1024;
                    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
                };
                
                // 构建属性HTML
                let html = '';
                
                // 基本信息
                html += '<div style="margin-bottom: 20px;">';
                html += '<div style="font-weight: 600; margin-bottom: 12px; color: #6c8eff; font-size: 14px;">基本信息</div>';
                html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">名称:</span> <span style="margin-left: 8px;">${this._escapeHtml(item.name)}</span></div>`;
                html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">类型:</span> <span style="margin-left: 8px;">${item.type === 'directory' ? '文件夹' : '文件'}</span></div>`;
                html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">路径:</span> <div style="margin-left: 8px; margin-top: 4px; word-break: break-all; color: #d7e0dd;">${this._escapeHtml(item.path)}</div></div>`;
                html += '</div>';
                
                if (item.type === 'file') {
                    // 文件信息
                    html += '<div style="margin-bottom: 20px;">';
                    html += '<div style="font-weight: 600; margin-bottom: 12px; color: #6c8eff; font-size: 14px;">文件信息</div>';
                    
                    if (fileInfo) {
                        if (fileInfo.size !== undefined) {
                            html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">大小:</span> <span style="margin-left: 8px;">${formatFileSize(fileInfo.size)}</span></div>`;
                        }
                        if (fileInfo.extension) {
                            html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">扩展名:</span> <span style="margin-left: 8px;">${fileInfo.extension}</span></div>`;
                        }
                        if (fileInfo.created) {
                            html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">创建时间:</span> <span style="margin-left: 8px;">${fileInfo.created}</span></div>`;
                        }
                        if (fileInfo.modified) {
                            html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">修改时间:</span> <span style="margin-left: 8px;">${fileInfo.modified}</span></div>`;
                        }
                    } else {
                        // 如果无法获取文件信息，使用项目数据
                        if (item.size !== undefined) {
                            html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">大小:</span> <span style="margin-left: 8px;">${formatFileSize(item.size)}</span></div>`;
                        }
                        if (item.fileType) {
                            html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">文件类型:</span> <span style="margin-left: 8px;">${item.fileType}</span></div>`;
                        }
                    }
                    html += '</div>';
                } else {
                    // 目录信息
                    html += '<div style="margin-bottom: 20px;">';
                    html += '<div style="font-weight: 600; margin-bottom: 12px; color: #6c8eff; font-size: 14px;">目录信息</div>';
                    
                    if (fileInfo && fileInfo.created) {
                        html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">创建时间:</span> <span style="margin-left: 8px;">${fileInfo.created}</span></div>`;
                    }
                    if (fileInfo && fileInfo.modified) {
                        html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">修改时间:</span> <span style="margin-left: 8px;">${fileInfo.modified}</span></div>`;
                    }
                    
                    // 统计目录中的文件和子目录数量（从 PHP 服务获取）
                    let phpPath = item.path;
                    if (/^[CD]:$/.test(phpPath)) {
                        phpPath = phpPath + '/';
                    }
                    
                    try {
                        const listUrl = new URL('/service/FSDirve.php', window.location.origin);
                        listUrl.searchParams.set('action', 'list_dir');
                        listUrl.searchParams.set('path', phpPath);
                        
                        const listResponse = await fetch(listUrl.toString());
                        if (listResponse.ok) {
                            const listResult = await listResponse.json();
                            if (listResult.status === 'success' && listResult.data && listResult.data.items) {
                                const items = listResult.data.items;
                                const dirsCount = items.filter(i => i.type === 'directory').length;
                                const filesCount = items.filter(i => i.type === 'file').length;
                                html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">子目录:</span> <span style="margin-left: 8px;">${dirsCount}</span></div>`;
                                html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">文件:</span> <span style="margin-left: 8px;">${filesCount}</span></div>`;
                            } else {
                                html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">子目录:</span> <span style="margin-left: 8px;">-</span></div>`;
                                html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">文件:</span> <span style="margin-left: 8px;">-</span></div>`;
                            }
                        } else {
                            html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">子目录:</span> <span style="margin-left: 8px;">-</span></div>`;
                            html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">文件:</span> <span style="margin-left: 8px;">-</span></div>`;
                        }
                    } catch (e) {
                        html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">子目录:</span> <span style="margin-left: 8px;">-</span></div>`;
                        html += `<div style="margin-bottom: 8px;"><span style="color: #aab2c0;">文件:</span> <span style="margin-left: 8px;">-</span></div>`;
                    }
                    html += '</div>';
                }
                
                this.propertiesContent.innerHTML = html;
                
            } catch (error) {
                console.error('[FileManager] 加载属性失败:', error);
                this.propertiesContent.innerHTML = `<div style="color: #ff4444;">加载属性失败: ${error.message}</div>`;
            }
        },
        
        /**
         * 从文件系统获取文件信息（使用 FSDirve.php）
         * @param {string} filePath 文件路径
         * @returns {Promise<Object|null>} 文件信息
         */
        _getFileInfoFromFS: async function(filePath) {
            try {
                // 解析路径
                // 例如：C:/UH.jpg -> dirPath: C:, fileName: UH.jpg
                // 例如：C:/folder/file.txt -> dirPath: C:/folder, fileName: file.txt
                const pathParts = filePath.split('/');
                const fileName = pathParts.pop() || '';
                
                // 获取目录路径
                let dirPath = pathParts.join('/');
                
                // 如果路径为空或只有盘符，确保格式为 C: 或 D:
                if (!dirPath || dirPath === '') {
                    // 从完整路径中提取盘符
                    const match = filePath.match(/^([CD]):/);
                    dirPath = match ? match[1] + ':' : 'C:';
                } else {
                    // 规范化路径：移除多余的斜杠
                    dirPath = dirPath.replace(/\/+/g, '/');
                    // 移除尾部斜杠（但保留根路径格式 C:/）
                    if (dirPath.endsWith('/') && !dirPath.match(/^[CD]:\/$/)) {
                        dirPath = dirPath.slice(0, -1);
                    }
                    // 确保根路径格式为 C: 而不是 C:/
                    if (dirPath.match(/^[CD]:\/$/)) {
                        dirPath = dirPath.slice(0, -1); // 移除尾部斜杠，变成 C:
                    }
                }
                
                // 使用 FSDirve.php 获取文件信息
                const url = new URL('/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'get_file_info');
                url.searchParams.set('path', dirPath);
                url.searchParams.set('fileName', fileName); // 注意：PHP 期望的是 fileName，不是 name
                
                const response = await fetch(url.toString());
                if (!response.ok) {
                    console.warn('[FileManager] 获取文件信息失败:', response.status, response.statusText, `(path: ${dirPath}, name: ${fileName})`);
                    return null;
                }
                
                const result = await response.json();
                if (result.status === 'success' && result.data) {
                    return result.data;
                }
                
                return null;
            } catch (error) {
                console.error('[FileManager] 获取文件信息失败:', error);
                return null;
            }
        },
        
        /**
         * 关闭属性面板
         */
        _closePropertiesPanel: function() {
            if (this.propertiesPanel) {
                this.propertiesPanel.style.width = '0';
                setTimeout(() => {
                    this.propertiesPanel.style.display = 'none';
                }, 300);
            }
        },
        
        /**
         * HTML转义
         */
        _escapeHtml: function(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },
        
        /**
         * 格式化日期
         */
        _formatDate: function(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}`;
        },
        
        /**
         * 加载根目录（显示所有磁盘分区）
         */
        _loadRootDirectory: async function() {
            // 确保窗口和文件列表容器已创建
            if (!this.window) {
                console.warn('[FileManager] 窗口未初始化，无法加载根目录');
                return;
            }
            
            // 确保文件列表容器存在
            if (!this.fileListElement) {
                const existingFileList = this.window.querySelector('.filemanager-filelist');
                if (existingFileList) {
                    this.fileListElement = existingFileList;
                } else {
                    // 尝试重新创建
                    const mainContent = this.window.querySelector('.filemanager-main-content');
                    if (mainContent) {
                        const fileList = this._createFileList();
                        mainContent.appendChild(fileList);
                    } else {
                        console.warn('[FileManager] 无法创建文件列表容器，跳过加载根目录');
                        return;
                    }
                }
            }
            
            try {
                // 添加到历史记录（如果不是历史记录导航）
                if (!this._isNavigatingHistory) {
                    this._addToHistory(null);
                }
                
                this._setCurrentPath(null);
                if (this.addressInput) {
                    this.addressInput.value = '\\';
                }
                if (this.breadcrumbContainer) {
                    this._updateBreadcrumb();
                }
                
                // 获取所有磁盘分区
                let fileList = [];
                
                // 方法1：尝试从 Disk API 获取
                if (typeof Disk !== 'undefined' && typeof Disk._getDiskSeparateMap === 'function') {
                    try {
                        const diskMap = Disk._getDiskSeparateMap();
                        if (diskMap && diskMap.size > 0) {
                            for (const [diskName, coll] of diskMap) {
                                if (coll && typeof coll === 'object') {
                                    fileList.push({
                                        name: diskName,
                                        type: 'directory',
                                        path: diskName,
                                        isRoot: true  // 标记为根目录项
                                    });
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('从 Disk._getDiskSeparateMap 获取分区失败:', e);
                    }
                }
                
                // 方法2：如果方法1没有结果，尝试从POOL直接获取
                // 注意：即使方法1有结果，也检查方法2，确保所有磁盘都被列出
                if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    // 尝试获取已知的分区
                    const knownDisks = ['C:', 'D:'];
                    for (const diskName of knownDisks) {
                        // 检查是否已经在列表中
                        const alreadyInList = fileList.some(item => item.name === diskName);
                        if (alreadyInList) {
                            continue; // 已存在，跳过
                        }
                        
                        try {
                            const coll = POOL.__GET__("KERNEL_GLOBAL_POOL", diskName);
                            if (coll && typeof coll === 'object') {
                                // 验证集合是否已初始化
                                if (coll.initialized !== false) {
                                    fileList.push({
                                        name: diskName,
                                        type: 'directory',
                                        path: diskName,
                                        isRoot: true
                                    });
                                    console.log(`[FileManager] 成功添加磁盘分区: ${diskName}`);
                                } else {
                                    console.warn(`[FileManager] 磁盘分区 ${diskName} 未初始化`);
                                }
                            }
                        } catch (e) {
                            // 记录错误但不阻止其他磁盘的加载
                            console.warn(`[FileManager] 无法获取分区 ${diskName}:`, e);
                        }
                    }
                }
                
                // 如果仍然没有结果，至少显示一个提示
                if (fileList.length === 0) {
                    console.warn('未找到任何磁盘分区');
                }
                
                // 按名称排序（确保 name 是字符串）
                fileList.sort((a, b) => {
                    const nameA = String(a && a.name !== undefined ? a.name : '');
                    const nameB = String(b && b.name !== undefined ? b.name : '');
                    return nameA.localeCompare(nameB);
                });
                
                // 保存文件列表
                this._setFileList(fileList);
                
                // 渲染文件列表
                this._renderFileList();
                
                // 更新侧边栏选中状态
                this._updateSidebarSelection();
                
                // 更新状态栏
                this._updateStatusBar();
                
            } catch (error) {
                console.error('加载根目录失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`加载根目录失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`加载根目录失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 加载目录
         */
        _loadDirectory: async function(path) {
            // 确保窗口和文件列表容器已创建
            if (!this.window) {
                console.warn('[FileManager] 窗口未初始化，无法加载目录');
                return;
            }
            
            // 确保文件列表容器存在
            if (!this.fileListElement) {
                const existingFileList = this.window.querySelector('.filemanager-filelist');
                if (existingFileList) {
                    this.fileListElement = existingFileList;
                } else {
                    // 尝试重新创建
                    const mainContent = this.window.querySelector('.filemanager-main-content');
                    if (mainContent) {
                        const fileList = this._createFileList();
                        mainContent.appendChild(fileList);
                    } else {
                        console.warn('[FileManager] 无法创建文件列表容器，跳过加载目录');
                        return;
                    }
                }
            }
            
            try {
                // 如果路径为空或根目录，加载根目录视图
                if (!path || path === '\\' || path === '') {
                    await this._loadRootDirectory();
                    return;
                }
                
                // 添加到历史记录（如果不是历史记录导航）
                if (!this._isNavigatingHistory) {
                    this._addToHistory(path);
                }
                
                this._setCurrentPath(path);
                if (this.addressInput) {
                    this.addressInput.value = path;
                }
                if (this.breadcrumbContainer) {
                    this._updateBreadcrumb();
                }
                
                // 确保路径格式正确
                let phpPath = path;
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                // 从 PHP 服务获取目录列表
                const url = new URL('/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'list_dir');
                url.searchParams.set('path', phpPath);
                
                const response = await fetch(url.toString());
                
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    const errorMessage = errorResult.message || `HTTP ${response.status}`;
                    console.error(`[FileManager] 加载目录失败: ${errorMessage}`);
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert(`无法访问路径: ${path}\n${errorMessage}`, '错误', 'error');
                    } else {
                        alert(`无法访问路径: ${path}\n${errorMessage}`);
                    }
                    return;
                }
                
                const result = await response.json();
                
                if (result.status !== 'success' || !result.data || !result.data.items) {
                    const errorMessage = result.message || '未知错误';
                    console.error(`[FileManager] 加载目录失败: ${errorMessage}`);
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert(`无法访问路径: ${path}\n${errorMessage}`, '错误', 'error');
                    } else {
                        alert(`无法访问路径: ${path}\n${errorMessage}`);
                    }
                    return;
                }
                
                const items = result.data.items || [];
                
                // 调试信息
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("FileManager", `加载目录: path=${path}, phpPath=${phpPath}, items=${items.length}`);
                } else {
                    console.log(`[FileManager] 加载目录: path=${path}, phpPath=${phpPath}, items=${items.length}`);
                }
                
                // 构建文件列表
                let fileList = [];
                
                // 处理所有项目（目录和文件）
                for (const item of items) {
                    if (!item || !item.name) {
                        continue;
                    }
                    
                    const itemName = String(item.name);
                    const itemPath = item.path || ((path.endsWith('/')) ? `${path}${itemName}` : `${path}/${itemName}`);
                    
                    if (item.type === 'directory') {
                        fileList.push({
                            name: itemName,
                            type: 'directory',
                            path: itemPath,
                            size: item.size || 0,
                            modified: item.modified || null,
                            created: item.created || null
                        });
                    } else if (item.type === 'file') {
                        // 确保从文件名中提取扩展名（如果PHP服务没有提供）
                        let extension = item.extension || '';
                        if (!extension && itemName.includes('.')) {
                            extension = itemName.split('.').pop().toLowerCase();
                        }
                        
                        fileList.push({
                            name: itemName,
                            type: 'file',
                            path: itemPath,
                            size: item.size || 0,
                            extension: extension,
                            fileType: this._getFileTypeFromExtension(extension),
                            modified: item.modified || null,
                            created: item.created || null
                        });
                    }
                }
                
                // 排序：目录在前，然后按名称排序
                fileList.sort((a, b) => {
                    if (a.type !== b.type) {
                        return a.type === 'directory' ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name);
                });
                
                // 保存文件列表到内存
                this._setFileList(fileList);
                
                // 更新UI
                this._renderFileList(fileList);
                
                // 更新工具栏按钮状态
                this._updateToolbarButtons();
                
                // 更新状态栏
                this._updateStatusBar();
                
                // 更新侧边栏选中状态
                this._updateSidebarSelection();
                
            } catch (error) {
                console.error('[FileManager] 加载目录异常:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`加载目录失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`加载目录失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 根据扩展名获取文件类型
         */
        _getFileTypeFromExtension: function(extension) {
            const ext = extension.toLowerCase();
            const textExts = ['txt', 'md', 'markdown', 'log', 'readme'];
            const codeExts = ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'xml', 'php', 'py', 'java', 'cpp', 'c', 'h', 'hpp'];
            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'];
            const audioExts = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'wma', 'opus'];
            const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v', '3gp'];
            
            if (textExts.includes(ext)) return 'TEXT';
            if (codeExts.includes(ext)) return 'CODE';
            if (imageExts.includes(ext)) return 'IMAGE';
            if (audioExts.includes(ext)) return 'AUDIO';
            if (videoExts.includes(ext)) return 'VIDEO';
            if (ext === 'md' || ext === 'markdown') return 'MARKDOWN';
            
            return 'BINARY';
        },
        
        /**
         * 创建文件列表项元素
         */
        _createFileListItem: function(item) {
            const itemElement = document.createElement('div');
            itemElement.className = 'filemanager-item';
            itemElement.dataset.type = item.type;
            itemElement.dataset.path = item.path;
            itemElement.dataset.itemName = item.name;
            
            // 保存完整的 item 对象到元素上，供右键菜单使用
            itemElement._fileManagerItem = item;
            
            // 在选择器模式下添加特殊样式类
            if (this._isFolderSelectorMode && item.type === 'directory') {
                itemElement.classList.add('filemanager-item-selectable');
            } else if (this._isFileSelectorMode && item.type === 'file') {
                itemElement.classList.add('filemanager-item-selectable');
            } else if ((this._isFolderSelectorMode && item.type === 'file') || 
                       (this._isFileSelectorMode && item.type === 'directory')) {
                itemElement.classList.add('filemanager-item-disabled');
            }
            
            // 点击事件
            itemElement.addEventListener('click', (e) => {
                if (e.detail === 2) {
                    // 双击
                    this._openItem(item);
                } else {
                    // 单击
                    if (this._isFolderSelectorMode && item.type === 'directory') {
                        // 在文件夹选择器模式下，单击文件夹选中（不立即触发选择）
                        this._selectFolderForSelection(item, itemElement);
                    } else if (this._isFileSelectorMode && item.type === 'file') {
                        // 在文件选择器模式下，单击文件触发选择
                        if (this._onFileSelected && typeof this._onFileSelected === 'function') {
                            this._onFileSelected(item).then(() => {
                                // 选择完成后关闭文件管理器
                                if (typeof ProcessManager !== 'undefined') {
                                    ProcessManager.killProgram(this.pid);
                                }
                            }).catch(err => {
                                console.error('[FileManager] 文件选择回调执行失败:', err);
                            });
                        }
                    } else {
                        // 正常模式下，单击选中
                        this._selectItem(itemElement, item);
                    }
                }
            });
            
            // 右键菜单 - ContextMenuManager 会自动处理 .filemanager-item 的右键事件
            // 不需要手动添加事件监听器，ContextMenuManager 已经在全局监听 contextmenu 事件
            
            // 图标
            const icon = document.createElement('div');
            icon.className = 'filemanager-item-icon';
            
            let iconUrl = '';
            if (item.type === 'directory') {
                iconUrl = 'D:/application/filemanager/assets/folder.svg';
            } else {
                const fileType = item.fileType || 'BINARY';
                switch (fileType) {
                    case 'TEXT':
                    case 'MARKDOWN':
                        iconUrl = 'D:/application/filemanager/assets/file-text.svg';
                        break;
                    case 'CODE':
                        iconUrl = 'D:/application/filemanager/assets/file-code.svg';
                        break;
                    case 'IMAGE':
                        iconUrl = 'D:/application/filemanager/assets/file-image.svg';
                        break;
                    case 'AUDIO':
                        iconUrl = 'D:/application/filemanager/assets/file-audio.svg';
                        break;
                    case 'VIDEO':
                        iconUrl = 'D:/application/filemanager/assets/file-video.svg';
                        break;
                    default:
                        iconUrl = 'D:/application/filemanager/assets/file.svg';
                }
            }
            
            // 使用 ProcessManager.convertVirtualPathToUrl 转换路径
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
                iconUrl = ProcessManager.convertVirtualPathToUrl(iconUrl);
            }
            
            const iconImg = document.createElement('img');
            iconImg.src = iconUrl;
            iconImg.alt = item.type === 'directory' ? '目录' : '文件';
            iconImg.style.cssText = 'width: 24px; height: 24px;';
            icon.appendChild(iconImg);
            
            // 名称
            const name = document.createElement('div');
            name.className = 'filemanager-item-name';
            name.textContent = item.name;
            
            // 大小（仅文件显示）
            const size = document.createElement('div');
            size.className = 'filemanager-item-size';
            if (item.type === 'file') {
                size.textContent = this._formatFileSize(item.size || 0);
            } else {
                size.textContent = '';
            }
            
            itemElement.appendChild(icon);
            itemElement.appendChild(name);
            itemElement.appendChild(size);
            
            // 基础样式（视图模式特定的样式由 CSS 类控制）
            itemElement.style.cssText = `
                cursor: pointer;
                transition: background-color 0.2s;
            `;
            
            // 启用拖拽功能（仅在非选择器模式下）
            // 注意：将在元素添加到 DOM 后启用（在 _renderFileList 中处理）
            
            itemElement.addEventListener('mouseenter', () => {
                itemElement.style.backgroundColor = 'rgba(108, 142, 255, 0.1)';
            });
            
            itemElement.addEventListener('mouseleave', () => {
                itemElement.style.backgroundColor = 'transparent';
            });
            
            return itemElement;
        },
        
        /**
         * 为文件列表项启用拖拽
         */
        _enableItemDrag: function(itemElement, item) {
            if (typeof DragDrive === 'undefined') {
                console.warn('[FileManager] DragDrive 不可用，无法启用拖拽');
                return;
            }
            
            // 检查元素是否在 DOM 中
            if (!itemElement.parentElement) {
                console.warn('[FileManager] 元素尚未添加到 DOM，无法启用拖拽');
                return;
            }
            
            try {
                // 创建拖拽预览图像（如果是图片文件，使用图片本身作为预览）
                let dragImage = null;
                let dragImageOffset = { x: 0, y: 0 };
                
                if (item.type === 'file' && item.fileType === 'IMAGE') {
                    // 图片文件：创建预览图像
                    const previewImg = document.createElement('img');
                    const imageUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                        ? ProcessManager.convertVirtualPathToUrl(item.path)
                        : item.path;
                    previewImg.src = imageUrl;
                    previewImg.style.cssText = `
                        width: 64px;
                        height: 64px;
                        object-fit: cover;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                    `;
                    dragImage = previewImg;
                    dragImageOffset = { x: -32, y: -32 };
                }
                
                // 直接使用 DragDrive API（不通过 ProcessManager，避免选择器问题）
                const dragId = DragDrive.createDragSession(
                    this.pid,
                    itemElement,
                    DragDrive.DRAG_TYPE.ELEMENT,
                    {
                        type: 'filemanager-item',
                        itemType: item.type,
                        path: item.path,
                        name: item.name,
                        fileType: item.fileType,
                        size: item.size
                    },
                    {
                        cloneOnDrag: true,
                        dragImage: dragImage,
                        dragImageOffset: dragImageOffset,
                        onDragStart: (e, session) => {
                            // 拖拽开始时添加视觉反馈
                            itemElement.style.opacity = '0.6';
                            itemElement.style.transform = 'scale(0.95)';
                            itemElement.style.transition = 'all 0.2s ease';
                            
                            // 添加拖拽光标样式
                            if (e.dataTransfer) {
                                e.dataTransfer.effectAllowed = 'move';
                            }
                        },
                        onDrag: (e, session) => {
                            // 拖拽过程中可以添加额外效果
                        },
                        onDragEnd: (e, session) => {
                            // 拖拽结束时恢复
                            itemElement.style.opacity = '1';
                            itemElement.style.transform = 'scale(1)';
                        }
                    }
                );
                
                // 启用拖拽
                DragDrive.enableDrag(dragId);
                
                // 保存 dragId 到元素上，以便后续清理
                itemElement._fileManagerDragId = dragId;
                
                console.log('[FileManager] 拖拽已启用:', dragId, item.name);
            } catch (error) {
                console.error('[FileManager] 启用拖拽失败:', error);
            }
        },
        
        /**
         * 格式化文件大小
         */
        _formatFileSize: function(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        },
        
        /**
         * 渲染文件列表（从内存中读取）
         */
        _renderFileList: function(fileList) {
            // 如果文件列表容器不存在，尝试重新查找或创建
            if (!this.fileListElement) {
                // 首先检查窗口是否存在
                if (!this.window) {
                    console.warn('[FileManager] 窗口不存在，跳过渲染文件列表');
                    return;
                }
                
                // 尝试从 DOM 中查找
                const existingFileList = this.window.querySelector('.filemanager-filelist');
                if (existingFileList) {
                    this.fileListElement = existingFileList;
                } else {
                    // 如果窗口存在但文件列表容器不存在，尝试重新创建
                    const mainContent = this.window.querySelector('.filemanager-main-content');
                    if (mainContent) {
                        const newFileList = this._createFileList();
                        mainContent.appendChild(newFileList);
                        // _createFileList 已经设置了 this.fileListElement，所以这里不需要再设置
                    } else {
                        console.warn('[FileManager] 主内容容器不存在，无法创建文件列表');
                        return;
                    }
                }
            }
            
            // 再次检查，确保 fileListElement 已设置
            if (!this.fileListElement) {
                console.warn('[FileManager] 文件列表容器仍未创建，跳过渲染');
                return;
            }
            
            // 清空容器
            this.fileListElement.innerHTML = '';
            
            // 如果参数为空，从内存获取
            if (!fileList) {
                fileList = this._getFileList();
            }
            
            // 应用搜索过滤
            if (this._searchQuery && this._filteredFileList) {
                fileList = this._filteredFileList;
            }
            
            // 确保 fileList 是数组
            if (!Array.isArray(fileList)) {
                console.warn('fileList 不是数组:', fileList);
                this._setFileList([]);
                return;
            }
            
            if (fileList.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'filemanager-empty';
                emptyMsg.textContent = this._searchQuery ? '未找到匹配的文件' : '此目录为空';
                emptyMsg.style.cssText = `
                    padding: 40px;
                    text-align: center;
                    color: #aab2c0;
                    font-size: 14px;
                `;
                this.fileListElement.appendChild(emptyMsg);
                return;
            }
            
            // 应用视图模式类
            if (this._viewMode) {
                this.fileListElement.classList.remove(
                    'view-details',
                    'view-large-icons',
                    'view-small-icons',
                    'view-list',
                    'view-tiles'
                );
                this.fileListElement.classList.add(`view-${this._viewMode}`);
            }
            
            // 渲染每个文件/目录项
            for (const item of fileList) {
                // 验证 item 对象
                if (!item || typeof item !== 'object' || !item.name) {
                    console.warn('无效的 item:', item);
                    continue;
                }
                
                const itemElement = this._createFileListItem(item);
                this.fileListElement.appendChild(itemElement);
                
                // 在元素添加到 DOM 后启用拖拽（仅在非选择器模式下）
                if (!this._isFileSelectorMode && !this._isFolderSelectorMode) {
                    // 使用 setTimeout 确保元素已完全添加到 DOM
                    setTimeout(() => {
                        this._enableItemDrag(itemElement, item);
                    }, 0);
                }
            }
        },
        
        /**
         * 选择项目
         */
        _selectItem: function(element, item) {
            // 取消之前的选择
            if (this.selectedItem) {
                this.selectedItem.style.background = 'transparent';
            }
            
            // 选择新项目
            this._setSelectedItem(item);
            element.style.background = 'rgba(108, 142, 255, 0.25)';
            this.selectedItemData = element; // DOM元素引用保留在变量中
            this.selectedItem = element; // 保存引用以便取消选择
            
            // 更新工具栏按钮状态
            this._updateToolbarButtons();
            
            // 更新状态栏
            this._updateStatusBar();
            
            // 不再自动显示属性面板，只有通过"文件属性"菜单才会显示
        },
        
        /**
         * 在文件夹选择器模式下选中文件夹
         */
        _selectFolderForSelection: function(item, itemElement) {
            // 清除之前选中的项
            if (this._lastSelectedFolderElement) {
                this._lastSelectedFolderElement.classList.remove('selected');
            }
            
            // 选中当前项
            this._selectItem(itemElement, item);
            this.selectedFolder = item;
            this._lastSelectedFolderElement = itemElement;
            
            // 启用选择按钮
            if (this.selectButton) {
                this.selectButton.style.opacity = '1';
                this.selectButton.style.pointerEvents = 'auto';
                this.selectButton.style.background = 'rgba(139, 92, 246, 0.4)';
            }
        },
        
        /**
         * 确认文件夹选择
         */
        _confirmFolderSelection: async function() {
            if (!this.selectedFolder) {
                return;
            }
            
            if (this._onFolderSelected && typeof this._onFolderSelected === 'function') {
                try {
                    await this._onFolderSelected(this.selectedFolder);
                    // 选择完成后关闭文件管理器
                    if (typeof ProcessManager !== 'undefined') {
                        ProcessManager.killProgram(this.pid);
                    }
                } catch (err) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('FileManager', `文件夹选择回调失败: ${err.message}`);
                    }
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert(`选择失败: ${err.message}`, '错误', 'error');
                    }
                }
            }
        },
        
        /**
         * 打开项目
         */
        _openItem: async function(item) {
            // 如果是文件夹选择器模式
            if (this._isFolderSelectorMode) {
                if (item.type === 'directory') {
                    // 在文件夹选择器模式下，双击目录进入该目录（导航）
                    await this._loadDirectory(item.path);
                    // 清除之前选中的文件夹
                    this.selectedFolder = null;
                    if (this.selectButton) {
                        this.selectButton.style.opacity = '0.5';
                        this.selectButton.style.pointerEvents = 'none';
                        this.selectButton.style.background = 'rgba(139, 92, 246, 0.3)';
                    }
                    if (this._lastSelectedFolderElement) {
                        this._lastSelectedFolderElement.classList.remove('selected');
                        this._lastSelectedFolderElement = null;
                    }
                } else if (item.type === 'file') {
                    // 在文件夹选择器模式下，双击文件不执行任何操作（只选择文件夹）
                    // 可以显示提示信息
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('请选择一个文件夹', '提示', 'info');
                    }
                }
                return;
            }
            
            // 如果是文件选择器模式
            if (this._isFileSelectorMode) {
                if (item.type === 'directory') {
                    // 在文件选择器模式下，双击目录仍然可以导航
                    if (item.isRoot) {
                        await this._loadDirectory(item.path);
                    } else {
                        await this._loadDirectory(item.path);
                    }
                } else if (item.type === 'file') {
                    // 在文件选择器模式下，双击文件触发选择回调
                    if (this._onFileSelected && typeof this._onFileSelected === 'function') {
                        await this._onFileSelected(item);
                        // 选择完成后关闭文件管理器
                        if (typeof ProcessManager !== 'undefined') {
                            ProcessManager.killProgram(this.pid);
                        }
                    }
                }
                return;
            }
            
            // 正常模式下的处理
            if (item.type === 'directory') {
                // 如果是根目录项（磁盘分区），直接加载该分区
                if (item.isRoot) {
                    await this._loadDirectory(item.path);
                } else {
                    await this._loadDirectory(item.path);
                }
            } else if (item.type === 'file') {
                // 检查文件类型
                const fileType = item.fileType || 'TEXT';
                
                // 获取文件扩展名
                const fileName = item.name || '';
                const extension = fileName.split('.').pop()?.toLowerCase() || '';
                const isSvg = extension === 'svg';
                
                // 视频文件默认用视频播放器打开
                if (fileType === 'VIDEO') {
                    await this._openFileWithVideoPlayer(item);
                }
                // 音频文件默认用音频播放器打开
                else if (fileType === 'AUDIO') {
                    await this._openFileWithAudioPlayer(item);
                }
                // 图片文件（包括SVG）默认用图片查看器打开
                else if (fileType === 'IMAGE') {
                    await this._openFileWithImageViewer(item);
                } 
                // 所有文本文件类型（TEXT、CODE、MARKDOWN）默认用 vim 打开
                else if (fileType === 'TEXT' || fileType === 'CODE' || fileType === 'MARKDOWN') {
                    await this._openFileWithVim(item);
                } else {
                    // 其他类型文件（如 BINARY），提示用vim打开
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                        const confirmed = await GUIManager.showConfirm(
                            `文件 "${item.name}" 不是文本文件。是否用 Vim 打开？`,
                            '打开文件',
                            'info'
                        );
                        if (confirmed) {
                            await this._openFileWithVim(item);
                        }
                    } else {
                        if (confirm(`文件 "${item.name}" 不是文本文件。是否用 Vim 打开？`)) {
                            await this._openFileWithVim(item);
                        }
                    }
                }
            }
        },
        
        /**
         * 使用视频播放器打开文件
         */
        _openFileWithVideoPlayer: async function(item) {
            try {
                if (typeof ProcessManager === 'undefined') {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('ProcessManager 不可用', '错误', 'error');
                    } else {
                        alert('ProcessManager 不可用');
                    }
                    return;
                }
                
                // 确保item.path存在且有效
                if (!item || !item.path) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('文件路径无效', '错误', 'error');
                    } else {
                        alert('文件路径无效');
                    }
                    return;
                }
                
                // 获取当前路径（用于cwd）
                const currentPath = this._getCurrentPath();
                const cwd = currentPath || 'C:';
                
                // 启动视频播放器程序，传递视频路径
                await ProcessManager.startProgram('videoplayer', {
                    args: [item.path],
                    cwd: cwd
                });
                
            } catch (error) {
                console.error('启动视频播放器失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`启动视频播放器失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`启动视频播放器失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 使用音频播放器打开文件
         */
        _openFileWithAudioPlayer: async function(item) {
            try {
                if (typeof ProcessManager === 'undefined') {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('ProcessManager 不可用', '错误', 'error');
                    } else {
                        alert('ProcessManager 不可用');
                    }
                    return;
                }
                
                // 确保item.path存在且有效
                if (!item || !item.path) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('文件路径无效', '错误', 'error');
                    } else {
                        alert('文件路径无效');
                    }
                    return;
                }
                
                // 获取当前路径（用于cwd）
                const currentPath = this._getCurrentPath();
                const cwd = currentPath || 'C:';
                
                // 启动音频播放器程序，传递音频路径
                await ProcessManager.startProgram('audioplayer', {
                    args: [item.path],
                    cwd: cwd
                });
                
            } catch (error) {
                console.error('启动音频播放器失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`启动音频播放器失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`启动音频播放器失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 使用图片查看器打开文件
         */
        _openFileWithImageViewer: async function(item) {
            try {
                if (typeof ProcessManager === 'undefined') {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('ProcessManager 不可用', '错误', 'error');
                    } else {
                        alert('ProcessManager 不可用');
                    }
                    return;
                }
                
                // 确保item.path存在且有效
                if (!item || !item.path) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('文件路径无效', '错误', 'error');
                    } else {
                        alert('文件路径无效');
                    }
                    return;
                }
                
                // 获取当前路径（用于cwd）
                const currentPath = this._getCurrentPath();
                const cwd = currentPath || 'C:';
                
                // 启动图片查看器程序，传递图片路径
                await ProcessManager.startProgram('imageviewer', {
                    args: [item.path],
                    cwd: cwd
                });
                
            } catch (error) {
                console.error('启动图片查看器失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`启动图片查看器失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`启动图片查看器失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 打开文件进行编辑
         */
        _openFileForEdit: async function(item) {
            try {
                // 解析路径：分离父目录路径和文件名
                const pathParts = item.path.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const parentPath = pathParts.slice(0, -1).join('/') || (item.path.split(':')[0] + ':');
                
                // 确保路径格式正确
                let phpPath = parentPath;
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                // 从 PHP 服务读取文件
                const url = new URL('/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'read_file');
                url.searchParams.set('path', phpPath);
                url.searchParams.set('fileName', fileName);
                
                const response = await fetch(url.toString());
                
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    const errorMessage = errorResult.message || `HTTP ${response.status}`;
                    throw new Error(errorMessage);
                }
                
                const result = await response.json();
                
                if (result.status !== 'success' || !result.data || !result.data.content) {
                    throw new Error(result.message || '文件读取失败');
                }
                
                const content = result.data.content || '';
                
                // 显示编辑面板
                this._setEditingFile(item);
                this._setEditContent(content);
                
                if (this.editPanel) {
                    this.editPanel.style.display = 'flex';
                    this.editPanel.style.width = '400px';
                }
                
                if (this.editArea) {
                    this.editArea.value = content;
                }
                
                if (this.editTitle) {
                    const titleElement = this.editPanel.querySelector('.filemanager-edit-title');
                    if (titleElement) {
                        titleElement.textContent = `编辑: ${item.name}`;
                    }
                }
                
            } catch (error) {
                console.error('打开文件失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`打开文件失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`打开文件失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 保存编辑的文件
         */
        _saveEditingFile: async function() {
            if (!this.editingFile || !this.editArea) {
                return;
            }
            
            try {
                const content = this.editArea.value;
                const filePath = this.editingFile.path;
                
                // 解析父路径和文件名
                const pathParts = filePath.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const parentPath = pathParts.slice(0, -1).join('/') || (filePath.split(':')[0] + ':');
                
                // 确保路径格式正确
                let phpPath = parentPath;
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                // 使用 PHP 服务写入文件
                const url = new URL('/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'write_file');
                url.searchParams.set('path', phpPath);
                url.searchParams.set('fileName', fileName);
                url.searchParams.set('writeMod', 'overwrite');
                
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: content })
                });
                
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    const errorMessage = errorResult.message || `HTTP ${response.status}`;
                    throw new Error(errorMessage);
                }
                
                const result = await response.json();
                
                if (result.status !== 'success') {
                    throw new Error(result.message || '文件保存失败');
                }
                
                // 更新文件信息
                this.editingFile.content = content;
                
                // 刷新文件列表以更新文件大小显示
                const currentPathForRefresh = this._getCurrentPath();
                if (currentPathForRefresh) {
                    await this._loadDirectory(currentPathForRefresh);
                }
                
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('文件已保存', '成功', 'success');
                } else {
                    alert('文件已保存');
                }
                
            } catch (error) {
                console.error('保存文件失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`保存文件失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`保存文件失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 关闭编辑面板
         */
        _closeEditPanel: function() {
            if (this.editPanel) {
                this.editPanel.style.width = '0';
                setTimeout(() => {
                    this.editPanel.style.display = 'none';
                }, 300);
            }
            this._setEditingFile(null);
            this._setEditContent(null);
        },
        
        /**
         * 用 Vim 打开文件
         */
        _openFileWithVim: async function(item) {
            try {
                if (typeof ProcessManager === 'undefined') {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('ProcessManager 不可用', '错误', 'error');
                    } else {
                        alert('ProcessManager 不可用');
                    }
                    return;
                }
                
                // 确保item.path存在且有效
                if (!item || !item.path) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('文件路径无效', '错误', 'error');
                    } else {
                        alert('文件路径无效');
                    }
                    return;
                }
                
                // 获取终端实例（vim需要终端来运行）
                // 尝试获取当前活动的终端，如果没有则启动一个新的终端
                let terminalInstance = null;
                let terminalPid = null;
                
                // 查找活动的终端实例
                // TERMINAL._instances 存储的是 { tabManager, pid } 对象
                // 需要从 tabManager 获取活动的终端实例
                if (typeof TERMINAL !== 'undefined' && TERMINAL._instances) {
                    const instances = Array.from(TERMINAL._instances.values());
                    for (const instance of instances) {
                        if (instance && instance.tabManager) {
                            const activeTerm = instance.tabManager.getActiveTerminal();
                            if (activeTerm) {
                                terminalInstance = activeTerm;
                                break;
                            }
                        }
                    }
                }
                
                // 如果没有活动的终端，先启动一个终端
                if (!terminalInstance) {
                    terminalPid = await ProcessManager.startProgram('terminal');
                    // 等待终端初始化
                    await new Promise(resolve => setTimeout(resolve, 500));
                    // 获取终端实例（从 tabManager 获取活动终端）
                    if (typeof TERMINAL !== 'undefined' && TERMINAL._instances) {
                        const instance = TERMINAL._instances.get(terminalPid);
                        if (instance && instance.tabManager) {
                            terminalInstance = instance.tabManager.getActiveTerminal();
                        }
                    }
                }
                
                if (!terminalInstance) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('无法获取终端实例，Vim 需要终端来运行', '错误', 'error');
                    } else {
                        alert('无法获取终端实例，Vim 需要终端来运行');
                    }
                    return;
                }
                
                // 获取当前路径（用于cwd）
                const currentPath = this._getCurrentPath();
                const cwd = currentPath || 'C:';
                
                // 启动 vim 程序，传递终端实例
                await ProcessManager.startProgram('vim', {
                    args: [item.path],
                    cwd: cwd,
                    terminal: terminalInstance
                });
                
            } catch (error) {
                console.error('启动 Vim 失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`启动 Vim 失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`启动 Vim 失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 返回上级目录
         */
        _goUp: async function() {
            // 如果当前在根目录视图，则无法返回
            const currentPath = this._getCurrentPath();
            if (currentPath === null || currentPath === '') {
                return;
            }
            
            // 如果当前在磁盘根目录（如 C:），则返回根目录视图
            if (typeof currentPath !== 'string') {
                await this._loadRootDirectory();
                return;
            }
            const diskNameMatch = currentPath.match(/^([A-Za-z]:)/);
            const diskName = diskNameMatch ? diskNameMatch[1] : 'C:';
            if (currentPath === diskName) {
                await this._loadRootDirectory();
                return;
            }
            
            // 否则返回上一级目录
            const parts = currentPath.split('/');
            if (parts.length <= 1) {
                await this._loadRootDirectory();
            } else {
                parts.pop();
                const parentPath = parts.join('/');
                await this._loadDirectory(parentPath);
            }
        },
        
        /**
         * 导航到指定路径
         */
        _navigateToPath: async function(path) {
            await this._loadDirectory(path);
        },
        
        /**
         * 创建新文件
         */
        _createNewFile: async function() {
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                const fileName = await GUIManager.showPrompt('请输入文件名:', '新建文件', 'newfile.txt');
                if (fileName) {
                    await this._doCreateFile(fileName);
                }
            } else {
                const fileName = prompt('请输入文件名:', 'newfile.txt');
                if (fileName) {
                    await this._doCreateFile(fileName);
                }
            }
        },
        
        /**
         * 执行创建文件
         */
        _doCreateFile: async function(fileName) {
            try {
                // 如果当前在根目录视图，无法创建文件
                const currentPath = this._getCurrentPath();
                if (currentPath === null || currentPath === '') {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('请在磁盘分区内创建文件', '提示', 'info');
                    } else {
                        alert('请在磁盘分区内创建文件');
                    }
                    return;
                }
                
                // 确保currentPath是字符串
                if (typeof currentPath !== 'string') {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('当前路径无效', '错误', 'error');
                    } else {
                        alert('当前路径无效');
                    }
                    return;
                }
                
                // 确保路径格式正确
                let phpPath = currentPath;
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                // 使用 PHP 服务创建文件
                const url = new URL('/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'create_file');
                url.searchParams.set('path', phpPath);
                url.searchParams.set('fileName', fileName);
                url.searchParams.set('content', ''); // 创建空文件
                
                const response = await fetch(url.toString());
                
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    const errorMessage = errorResult.message || `HTTP ${response.status}`;
                    throw new Error(errorMessage);
                }
                
                const result = await response.json();
                
                if (result.status !== 'success') {
                    throw new Error(result.message || '创建文件失败');
                }
                
                // 刷新目录列表
                await this._loadDirectory(currentPath);
                
            } catch (error) {
                console.error('创建文件失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`创建文件失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`创建文件失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 创建新目录
         */
        _createNewDirectory: async function() {
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                const dirName = await GUIManager.showPrompt('请输入目录名:', '新建目录', 'newdir');
                if (dirName) {
                    await this._doCreateDirectory(dirName);
                }
            } else {
                const dirName = prompt('请输入目录名:', 'newdir');
                if (dirName) {
                    await this._doCreateDirectory(dirName);
                }
            }
        },
        
        /**
         * 执行创建目录
         */
        _doCreateDirectory: async function(dirName) {
            try {
                // 如果当前在根目录视图，无法创建目录
                const currentPath = this._getCurrentPath();
                if (currentPath === null || currentPath === '') {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('请在磁盘分区内创建目录', '提示', 'info');
                    } else {
                        alert('请在磁盘分区内创建目录');
                    }
                    return;
                }
                
                // 确保currentPath是字符串
                if (typeof currentPath !== 'string') {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('当前路径无效', '错误', 'error');
                    } else {
                        alert('当前路径无效');
                    }
                    return;
                }
                
                // 规范化路径（移除双斜杠等）
                let phpPath = currentPath;
                // 处理 Windows 盘符后的双斜杠（如 C:// -> C:/）
                phpPath = phpPath.replace(/^([CD]):\/\//, '$1:/');
                // 将其他多个连续斜杠替换为单个斜杠
                phpPath = phpPath.replace(/\/+/g, '/');
                // 移除尾部斜杠（但保留根路径，如 C:/）
                if (phpPath.length > 3 && phpPath.endsWith('/') && !phpPath.match(/^[CD]:\/$/)) {
                    phpPath = phpPath.slice(0, -1);
                }
                // 确保根路径格式正确
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                // 使用 PHP 服务创建目录
                // 注意：FSDirve.php 需要参数 'name' 而不是 'dirName'
                const url = new URL('/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'create_dir');
                url.searchParams.set('path', phpPath);
                url.searchParams.set('name', dirName);
                
                const response = await fetch(url.toString());
                
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    const errorMessage = errorResult.message || `HTTP ${response.status}`;
                    throw new Error(errorMessage);
                }
                
                const result = await response.json();
                
                if (result.status !== 'success') {
                    throw new Error(result.message || '创建目录失败');
                }
                
                // 刷新目录列表
                await this._loadDirectory(currentPath);
                
            } catch (error) {
                console.error('创建目录失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`创建目录失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`创建目录失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 初始化拖拽功能
         */
        _initDragAndDrop: function() {
            if (typeof DragDrive === 'undefined') {
                console.warn('[FileManager] DragDrive 不可用，无法初始化拖拽功能');
                return;
            }
            
            // 注册桌面为放置区域（直接使用 DragDrive，不通过 ProcessManager）
            const desktopContainer = document.getElementById('gui-container');
            if (desktopContainer) {
                try {
                    // 直接使用 DragDrive API 注册放置区域
                    DragDrive.registerDropZone(desktopContainer);
                    
                    // 如果已经存在事件监听器，先移除它（防止重复注册）
                    if (desktopContainer._fileManagerDropHandler) {
                        desktopContainer.removeEventListener('zeros-drop', desktopContainer._fileManagerDropHandler);
                    }
                    
                    // 监听桌面放置事件
                    const self = this;
                    const dropHandler = (e) => {
                        console.log('[FileManager] 收到桌面放置事件:', e.detail);
                        const { dragData, session } = e.detail;
                        
                        // 检查拖拽数据
                        let itemData = null;
                        if (dragData && dragData.data) {
                            itemData = dragData.data;
                        } else if (session && session.dragData) {
                            itemData = session.dragData;
                        }
                        
                        // 检查是否是文件管理器项目
                        if (itemData && itemData.type === 'filemanager-item') {
                            console.log('[FileManager] 检测到文件管理器项目拖拽:', itemData);
                            self._handleDropToDesktop(itemData);
                        } else {
                            console.log('[FileManager] 不是文件管理器项目拖拽，忽略');
                        }
                    };
                    
                    // 保存事件处理器的引用，以便后续移除
                    desktopContainer._fileManagerDropHandler = dropHandler;
                    desktopContainer.addEventListener('zeros-drop', dropHandler);
                    
                    console.log('[FileManager] 桌面放置区域注册成功');
                } catch (error) {
                    console.error('[FileManager] 注册桌面放置区域失败:', error);
                    // 如果直接使用 DragDrive 失败，尝试通过 ProcessManager（如果进程已运行）
                    if (typeof ProcessManager !== 'undefined') {
                        const processInfo = ProcessManager.getProcessInfo(this.pid);
                        if (processInfo && processInfo.status === 'running') {
                            ProcessManager.callKernelAPI(
                                this.pid,
                                'Drag.registerDropZone',
                                ['#gui-container']
                            ).catch(err => {
                                console.error('[FileManager] 通过 ProcessManager 注册失败:', err);
                            });
                        }
                    }
                }
            } else {
                console.warn('[FileManager] 桌面容器不存在，无法注册放置区域');
            }
        },
        
        /**
         * 处理拖拽到桌面（带防抖机制，防止重复调用）
         */
        _handleDropToDesktop: async function(itemData) {
            // 防抖：如果正在处理，忽略新的请求
            if (this._isHandlingDrop) {
                console.log('[FileManager] 正在处理拖拽，忽略重复请求');
                return;
            }
            
            // 设置处理标志
            this._isHandlingDrop = true;
            
            try {
                console.log('[FileManager] 处理拖拽到桌面:', itemData);
                
                if (typeof DesktopManager === 'undefined') {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('DesktopManager 不可用', '错误', 'error');
                    }
                    return;
                }
                
                // 从拖拽数据中获取信息
                // 注意：itemData.type 是 'filemanager-item'，itemData.itemType 才是文件/文件夹类型
                const itemType = itemData.itemType;  // 'file' 或 'directory'
                const itemPath = itemData.path;
                const itemName = itemData.name;
                
                if (!itemType || !itemPath || !itemName) {
                    console.error('[FileManager] 拖拽数据不完整:', itemData);
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('拖拽数据不完整，无法添加到桌面', '错误', 'error');
                    }
                    return;
                }
                
                // 规范化路径（用于比较）
                const normalizePath = (path) => {
                    if (!path) return '';
                    // 统一使用正斜杠
                    let normalized = path.replace(/\\/g, '/');
                    // 移除多个连续斜杠（但保留盘符后的双斜杠，如 C:// -> C:/）
                    normalized = normalized.replace(/([CD]:)\/\/+/g, '$1/');
                    normalized = normalized.replace(/\/+/g, '/');
                    // 移除尾部斜杠（但保留根路径，如 C:/）
                    if (normalized.length > 3 && normalized.endsWith('/') && !normalized.match(/^[CD]:\/$/)) {
                        normalized = normalized.slice(0, -1);
                    }
                    // 确保根路径格式正确
                    if (/^[CD]:$/.test(normalized)) {
                        normalized = normalized + '/';
                    }
                    return normalized;
                };
                
                const normalizedItemPath = normalizePath(itemPath);
                
                // 检查是否已经存在相同的桌面图标
                const existingIcons = DesktopManager.getIcons();
                const alreadyExists = existingIcons.some(icon => {
                    // 只检查文件/文件夹类型的图标
                    if (icon.type !== 'file' && icon.type !== 'directory') {
                        return false;
                    }
                    // 类型必须匹配
                    if (icon.type !== itemType) {
                        return false;
                    }
                    // 路径必须匹配（规范化后比较）
                    const normalizedIconPath = normalizePath(icon.targetPath);
                    return normalizedIconPath === normalizedItemPath;
                });
                
                if (alreadyExists) {
                    // 静默处理，不显示弹窗（避免干扰用户）
                    console.log('[FileManager] 文件/文件夹已在桌面存在，跳过添加');
                    return;
                }
                
                // 获取图标路径（复用发送到桌面的逻辑）
                const iconPath = this._getItemIconPath(itemType, itemData);
                
                // 添加到桌面
                DesktopManager.addFileOrFolderIcon({
                    type: itemType,
                    targetPath: itemPath,
                    name: itemName,
                    icon: iconPath,
                    description: itemName
                });
                
                // 移除成功提示弹窗，静默完成操作
            } catch (error) {
                console.error('拖拽到桌面失败:', error);
                // 错误时也不显示弹窗，避免干扰用户
            } finally {
                // 清除处理标志（延迟清除，确保操作完成）
                setTimeout(() => {
                    this._isHandlingDrop = false;
                }, 100);
            }
        },
        
        /**
         * 获取项目图标路径（复用发送到桌面的逻辑）
         */
        _getItemIconPath: function(itemType, itemData) {
            if (itemType === 'directory') {
                return 'D:/application/filemanager/assets/folder.svg';
            }
            
            // 文件图标：根据文件类型选择
            const fileType = itemData.fileType;
            const itemName = itemData.name;
            
            if (fileType) {
                switch (fileType) {
                    case 'TEXT':
                    case 'MARKDOWN':
                        return 'D:/application/filemanager/assets/file-text.svg';
                    case 'CODE':
                        return 'D:/application/filemanager/assets/file-code.svg';
                    case 'IMAGE':
                        return 'D:/application/filemanager/assets/file-image.svg';
                    case 'AUDIO':
                        return 'D:/application/filemanager/assets/file-audio.svg';
                    case 'VIDEO':
                        return 'D:/application/filemanager/assets/file-video.svg';
                    default:
                        return 'D:/application/filemanager/assets/file.svg';
                }
            } else {
                // 从扩展名推断
                const extension = itemName.split('.').pop()?.toLowerCase() || '';
                if (extension) {
                    const inferredFileType = this._getFileTypeFromExtension(extension);
                    switch (inferredFileType) {
                        case 'TEXT':
                        case 'MARKDOWN':
                            return 'D:/application/filemanager/assets/file-text.svg';
                        case 'CODE':
                            return 'D:/application/filemanager/assets/file-code.svg';
                        case 'IMAGE':
                            return 'D:/application/filemanager/assets/file-image.svg';
                        case 'AUDIO':
                            return 'D:/application/filemanager/assets/file-audio.svg';
                        case 'VIDEO':
                            return 'D:/application/filemanager/assets/file-video.svg';
                        default:
                            return 'D:/application/filemanager/assets/file.svg';
                    }
                } else {
                    return 'D:/application/filemanager/assets/file.svg';
                }
            }
        },
        
        /**
         * 注册右键菜单
         */
        _registerContextMenu: function() {
            if (typeof ContextMenuManager === 'undefined' || !this.pid) {
                return;
            }
            
            // 保存 this 引用，确保在回调函数中能正确访问
            const self = this;
            
            // 注册文件管理器窗口的右键菜单（使用 registerContextMenu 而不是 registerMenu）
            ContextMenuManager.registerContextMenu(this.pid, {
                context: 'filemanager-item',
                selector: '.filemanager-item',
                priority: 100,
                items: (target) => {
                    const itemElement = target.closest('.filemanager-item');
                    if (!itemElement) {
                        return null;
                    }
                    
                    // 从 dataset 或保存的对象引用获取信息
                    const itemType = itemElement.dataset.type;
                    const itemPath = itemElement.dataset.path;
                    // 优先使用 dataset 中的 itemName，如果没有则从保存的对象引用获取
                    let itemName = itemElement.dataset.itemName;
                    if (!itemName && itemElement._fileManagerItem) {
                        itemName = String(itemElement._fileManagerItem.name || '');
                    }
                    // 如果仍然没有，尝试从子元素中获取
                    if (!itemName) {
                        const nameElement = itemElement.querySelector('div[data-item-name]');
                        if (nameElement) {
                            itemName = nameElement.dataset.itemName || nameElement.textContent.trim();
                        } else {
                            itemName = itemElement.textContent.trim();
                        }
                    }
                    
                    const items = [];
                    
                    // 在选择器模式下，禁用某些操作
                    const isSelectorMode = self._isFileSelectorMode || self._isFolderSelectorMode;
                    
                    if (itemType === 'directory') {
                        // 文件夹选择器模式下，文件夹可以打开
                        if (!self._isFileSelectorMode) {
                            items.push({
                                label: '打开',
                                icon: '📂',
                                action: () => {
                                    self._openItem({ type: 'directory', path: itemPath, name: itemName });
                                }
                            });
                        }
                        
                        // 文件夹选择器模式下，文件夹可以选择
                        if (self._isFolderSelectorMode) {
                            items.push({
                                label: '选择',
                                icon: '✓',
                                action: () => {
                                    const itemElement = target.closest('.filemanager-item');
                                    if (itemElement) {
                                        const item = itemElement._fileManagerItem || {
                                            type: 'directory',
                                            path: itemPath,
                                            name: itemName
                                        };
                                        self._selectFolderForSelection(item, itemElement);
                                        // 立即确认选择
                                        setTimeout(() => {
                                            self._confirmFolderSelection();
                                        }, 100);
                                    }
                                }
                            });
                        }
                        
                        // 非选择器模式下显示其他选项
                        if (!isSelectorMode) {
                            items.push({
                                label: '在新窗口打开',
                            icon: '🪟',
                            action: async () => {
                                if (typeof ProcessManager !== 'undefined') {
                                    await ProcessManager.startProgram('filemanager', {
                                        args: [itemPath]
                                    });
                                }
                            }
                            });
                            items.push({ type: 'separator' });
                            items.push({
                                label: '新建文件',
                            icon: '📄',
                            action: async () => {
                                // 临时切换到该目录，创建文件，然后切换回来
                                const currentPath = self._getCurrentPath();
                                await self._loadDirectory(itemPath);
                                await self._createNewFile();
                                // 如果之前不在该目录，切换回去
                                if (currentPath !== itemPath) {
                                    await self._loadDirectory(currentPath);
                                }
                            }
                            });
                            items.push({
                                label: '新建文件夹',
                            icon: '📁',
                            action: async () => {
                                // 临时切换到该目录，创建文件夹，然后切换回来
                                const currentPath = self._getCurrentPath();
                                await self._loadDirectory(itemPath);
                                await self._createNewDirectory();
                                // 如果之前不在该目录，切换回去
                                if (currentPath !== itemPath) {
                                    await self._loadDirectory(currentPath);
                                }
                            }
                            });
                        }
                    } else {
                        // 获取文件类型（从保存的对象引用中获取）
                        let fileType = 'TEXT';
                    if (itemElement._fileManagerItem && itemElement._fileManagerItem.fileType) {
                        fileType = itemElement._fileManagerItem.fileType;
                    } else {
                        // 如果 _fileManagerItem 中没有 fileType，尝试从扩展名推断
                        const extension = itemName.split('.').pop()?.toLowerCase() || '';
                        if (extension && typeof self._getFileTypeFromExtension === 'function') {
                            fileType = self._getFileTypeFromExtension(extension);
                        }
                    }
                    
                    // 获取文件扩展名
                    const extension = itemName.split('.').pop()?.toLowerCase() || '';
                    const isSvg = extension === 'svg';
                    const isImage = fileType === 'IMAGE';
                    const isAudio = fileType === 'AUDIO';
                    const isVideo = fileType === 'VIDEO';
                    const isTextFile = fileType === 'TEXT' || fileType === 'CODE' || fileType === 'MARKDOWN';
                    
                    // 调试日志（可选，帮助排查问题）
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("FileManager", `右键菜单 - 文件: ${itemName}, 类型: ${fileType}, 扩展名: ${extension}`);
                    }
                    
                    // 文件选择器模式下，文件可以选择
                    if (self._isFileSelectorMode) {
                        items.push({
                            label: '选择',
                            icon: '✓',
                            action: () => {
                                if (self._onFileSelected && typeof self._onFileSelected === 'function') {
                                    const item = itemElement._fileManagerItem || {
                                        type: 'file',
                                        path: itemPath,
                                        name: itemName,
                                        fileType: fileType
                                    };
                                    self._onFileSelected(item).then(() => {
                                        // 选择完成后关闭文件管理器
                                        if (typeof ProcessManager !== 'undefined') {
                                            ProcessManager.killProgram(self.pid);
                                        }
                                    }).catch(err => {
                                        console.error('[FileManager] 文件选择回调执行失败:', err);
                                    });
                                }
                            }
                        });
                        items.push({ type: 'separator' });
                    }
                    
                    // 视频文件：用视频播放器打开
                    if (isVideo) {
                        if (!isSelectorMode) {
                            items.push({
                                label: '打开',
                                icon: '🎬',
                                action: () => {
                                    self._openFileWithVideoPlayer({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                            items.push({
                                label: '用视频播放器打开',
                                icon: '🎬',
                                action: () => {
                                    self._openFileWithVideoPlayer({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                            items.push({
                                type: 'separator'
                            });
                            items.push({
                                label: '用 Vim 打开',
                                icon: '✏️',
                                action: () => {
                                    self._openFileWithVim({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                        }
                    }
                    // 音频文件：用音频播放器打开
                    else if (isAudio) {
                        if (!isSelectorMode) {
                            items.push({
                                label: '打开',
                                icon: '🎵',
                                action: () => {
                                    self._openFileWithAudioPlayer({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                            items.push({
                                label: '用音频播放器打开',
                                icon: '🎵',
                                action: () => {
                                    self._openFileWithAudioPlayer({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                            items.push({
                                type: 'separator'
                            });
                            items.push({
                                label: '用 Vim 打开',
                                icon: '✏️',
                                action: () => {
                                    self._openFileWithVim({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                        }
                    }
                    // SVG 文件：提供图片查看和 Vim 打开两种方式
                    else if (isSvg && isImage) {
                        if (!isSelectorMode) {
                            items.push({
                                label: '用图片查看器打开',
                                icon: '🖼️',
                                action: () => {
                                    self._openFileWithImageViewer({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                            items.push({
                                label: '用 Vim 打开',
                                icon: '✏️',
                                action: () => {
                                    self._openFileWithVim({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                        }
                    }
                    // 其他图片文件：提供"打开"（默认用图片查看器）和"用图片查看器打开"选项
                    else if (isImage && !isSvg) {
                        if (!isSelectorMode) {
                            items.push({
                                label: '打开',
                                icon: '🖼️',
                                action: () => {
                                    self._openFileWithImageViewer({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                            items.push({
                                label: '用图片查看器打开',
                                icon: '🖼️',
                                action: () => {
                                    self._openFileWithImageViewer({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                        }
                    }
                    // 文本文件："打开"就是"用 Vim 打开"
                    else if (isTextFile) {
                        if (!isSelectorMode) {
                            items.push({
                                label: '用 Vim 打开',
                                icon: '✏️',
                                action: () => {
                                    self._openFileWithVim({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                        }
                    }
                    // 其他类型文件：提供"打开"选项（会提示用户）
                    else {
                        if (!isSelectorMode) {
                            items.push({
                                label: '打开',
                                icon: '📄',
                                action: () => {
                                    self._openItem({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                            items.push({
                                label: '用 Vim 打开',
                                icon: '✏️',
                                action: () => {
                                    self._openFileWithVim({ type: 'file', path: itemPath, name: itemName, fileType: fileType });
                                }
                            });
                        }
                    }
                    }
                    
                    // 非选择器模式下显示文件操作菜单
                    if (!isSelectorMode) {
                        items.push({ type: 'separator' });
                        
                        // 复制选项
                        items.push({
                            label: '复制',
                            icon: '📋',
                            action: () => {
                                // 设置选中项（如果还没有选中）
                                if (!self._getSelectedItem() || self._getSelectedItem().path !== itemPath) {
                                    const itemElement = target.closest('.filemanager-item');
                                    if (itemElement) {
                                        const item = itemElement._fileManagerItem || {
                                            type: itemType,
                                            path: itemPath,
                                            name: itemName
                                        };
                                        self._selectItem(itemElement, item);
                                    }
                                }
                                self._copySelectedItems();
                            }
                        });
                        
                        // 剪切选项
                        items.push({
                            label: '剪切',
                            icon: '✂️',
                            action: () => {
                                // 设置选中项（如果还没有选中）
                                if (!self._getSelectedItem() || self._getSelectedItem().path !== itemPath) {
                                    const itemElement = target.closest('.filemanager-item');
                                    if (itemElement) {
                                        const item = itemElement._fileManagerItem || {
                                            type: itemType,
                                            path: itemPath,
                                            name: itemName
                                        };
                                        self._selectItem(itemElement, item);
                                    }
                                }
                                self._cutSelectedItems();
                            }
                        });
                        
                        // 粘贴选项（如果有剪贴板内容）
                        if (self._clipboard && self._clipboard.items && self._clipboard.items.length > 0) {
                            items.push({
                                label: '粘贴',
                                icon: '📄',
                                action: async () => {
                                    await self._pasteItems();
                                }
                            });
                        }
                        
                        items.push({ type: 'separator' });
                        
                        items.push({
                            label: '重命名',
                            icon: '✏️',
                            action: async () => {
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                                    const newName = await GUIManager.showPrompt('请输入新名称:', '重命名', itemName);
                                    if (newName && newName !== itemName) {
                                        await self._renameItem(itemPath, newName);
                                    }
                                } else {
                                    const newName = prompt('请输入新名称:', itemName);
                                    if (newName && newName !== itemName) {
                                        await self._renameItem(itemPath, newName);
                                    }
                                }
                            }
                        });
                        
                        items.push({
                            label: '删除',
                            icon: '🗑️',
                            danger: true,
                            action: async () => {
                                // 直接执行删除，不显示确认弹窗
                                await self._deleteItem(itemPath, itemType);
                            }
                        });
                        
                        items.push({ type: 'separator' });
                        
                        // 发送到桌面选项
                        items.push({
                            label: '发送到桌面',
                            icon: '🖥️',
                            action: async () => {
                                try {
                                    if (typeof DesktopManager === 'undefined') {
                                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                            await GUIManager.showAlert('DesktopManager 不可用', '错误', 'error');
                                        }
                                        return;
                                    }
                            
                            // 规范化路径（用于比较）
                            const normalizePath = (path) => {
                                if (!path) return '';
                                // 统一使用正斜杠
                                let normalized = path.replace(/\\/g, '/');
                                // 移除多个连续斜杠（但保留盘符后的双斜杠，如 C:// -> C:/）
                                normalized = normalized.replace(/([CD]:)\/\/+/g, '$1/');
                                normalized = normalized.replace(/\/+/g, '/');
                                // 移除尾部斜杠（但保留根路径，如 C:/）
                                if (normalized.length > 3 && normalized.endsWith('/') && !normalized.match(/^[CD]:\/$/)) {
                                    normalized = normalized.slice(0, -1);
                                }
                                // 确保根路径格式正确
                                if (/^[CD]:$/.test(normalized)) {
                                    normalized = normalized + '/';
                                }
                                return normalized;
                            };
                            
                            const normalizedItemPath = normalizePath(itemPath);
                            
                            // 检查是否已经存在相同的桌面图标
                            const existingIcons = DesktopManager.getIcons();
                            const alreadyExists = existingIcons.some(icon => {
                                // 只检查文件/文件夹类型的图标
                                if (icon.type !== 'file' && icon.type !== 'directory') {
                                    return false;
                                }
                                // 类型必须匹配
                                if (icon.type !== itemType) {
                                    return false;
                                }
                                // 路径必须匹配（规范化后比较）
                                const normalizedIconPath = normalizePath(icon.targetPath);
                                return normalizedIconPath === normalizedItemPath;
                            });
                            
                            if (alreadyExists) {
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                    await GUIManager.showAlert('该文件/文件夹已在桌面存在', '提示', 'info');
                                }
                                return;
                            }
                            
                            // 获取图标路径
                            let iconPath = null;
                            if (itemType === 'directory') {
                                // 文件夹图标
                                iconPath = 'D:/application/filemanager/assets/folder.svg';
                            } else {
                                // 文件图标：根据文件类型选择
                                if (itemElement._fileManagerItem && itemElement._fileManagerItem.fileType) {
                                    const fileType = itemElement._fileManagerItem.fileType;
                                    switch (fileType) {
                                        case 'TEXT':
                                        case 'MARKDOWN':
                                            iconPath = 'D:/application/filemanager/assets/file-text.svg';
                                            break;
                                        case 'CODE':
                                            iconPath = 'D:/application/filemanager/assets/file-code.svg';
                                            break;
                                        case 'IMAGE':
                                            iconPath = 'D:/application/filemanager/assets/file-image.svg';
                                            break;
                                        case 'AUDIO':
                                            iconPath = 'D:/application/filemanager/assets/file-audio.svg';
                                            break;
                                        case 'VIDEO':
                                            iconPath = 'D:/application/filemanager/assets/file-video.svg';
                                            break;
                                        default:
                                            iconPath = 'D:/application/filemanager/assets/file.svg';
                                    }
                                } else {
                                    // 从扩展名推断
                                    const extension = itemName.split('.').pop()?.toLowerCase() || '';
                                    if (extension) {
                                        const fileType = self._getFileTypeFromExtension(extension);
                                        switch (fileType) {
                                            case 'TEXT':
                                            case 'MARKDOWN':
                                                iconPath = 'D:/application/filemanager/assets/file-text.svg';
                                                break;
                                            case 'CODE':
                                                iconPath = 'D:/application/filemanager/assets/file-code.svg';
                                                break;
                                            case 'IMAGE':
                                                iconPath = 'D:/application/filemanager/assets/file-image.svg';
                                                break;
                                            case 'AUDIO':
                                                iconPath = 'D:/application/filemanager/assets/file-audio.svg';
                                                break;
                                            case 'VIDEO':
                                                iconPath = 'D:/application/filemanager/assets/file-video.svg';
                                                break;
                                            default:
                                                iconPath = 'D:/application/filemanager/assets/file.svg';
                                        }
                                    } else {
                                        iconPath = 'D:/application/filemanager/assets/file.svg';
                                    }
                                }
                            }
                            
                            // 添加到桌面
                            DesktopManager.addFileOrFolderIcon({
                                type: itemType,
                                targetPath: itemPath,
                                name: itemName,
                                icon: iconPath,
                                description: itemName
                            });
                            
                            // 移除成功提示弹窗，静默完成操作
                        } catch (error) {
                            console.error('发送到桌面失败:', error);
                            // 错误时也不显示弹窗，避免干扰用户
                        }
                    }
                });
                
                    // 非选择器模式下显示属性和其他选项
                    if (!isSelectorMode) {
                        items.push({ type: 'separator' });
                        
                        // 文件属性选项
                        items.push({
                                label: '文件属性',
                                icon: '📋',
                                action: () => {
                                    // 隐藏右键菜单（使用内核API）
                                    if (typeof ContextMenuManager !== 'undefined' && typeof ContextMenuManager._hideMenu === 'function') {
                                        ContextMenuManager._hideMenu();
                                    }
                                    
                                    // 获取完整的项目信息
                                    let item = itemElement._fileManagerItem;
                                    if (!item) {
                                        // 如果没有保存的项目信息，构建基本项目对象
                                        item = {
                                            type: itemType,
                                            path: itemPath,
                                            name: itemName
                                        };
                                        // 如果是文件，尝试获取文件类型
                                        if (itemType === 'file') {
                                            // 从扩展名推断文件类型
                                            const extension = itemName.split('.').pop()?.toLowerCase() || '';
                                            if (extension && typeof self._getFileTypeFromExtension === 'function') {
                                                item.fileType = self._getFileTypeFromExtension(extension);
                                            }
                                        }
                                    }
                                    
                                    // 直接显示属性面板（同步执行，不阻塞UI）
                                    // 不使用 await，避免阻塞，也不显示弹窗
                                    self._showProperties(item);
                                }
                            });
                            
                            // 复制路径选项
                            items.push({
                                label: '复制路径',
                                icon: '📋',
                                action: async () => {
                                    try {
                                        // 复制路径到剪贴板
                                        if (navigator.clipboard && navigator.clipboard.writeText) {
                                            await navigator.clipboard.writeText(itemPath);
                                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                                await GUIManager.showAlert('路径已复制到剪贴板', '提示', 'success');
                                            }
                                        } else {
                                            // 降级方案：使用临时文本区域
                                            const textArea = document.createElement('textarea');
                                            textArea.value = itemPath;
                                            textArea.style.position = 'fixed';
                                            textArea.style.opacity = '0';
                                            document.body.appendChild(textArea);
                                            textArea.select();
                                            document.execCommand('copy');
                                            document.body.removeChild(textArea);
                                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                                await GUIManager.showAlert('路径已复制到剪贴板', '提示', 'success');
                                            }
                                        }
                                    } catch (error) {
                                        console.error('复制路径失败:', error);
                                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                            await GUIManager.showAlert('复制路径失败', '错误', 'error');
                                        }
                                    }
                                }
                            });
                        }
                    }
                    
                    // 返回菜单项数组
                    return items;
                }
            });
            
            // 注册空白区域的右键菜单（在文件列表的空白区域右键）
            ContextMenuManager.registerContextMenu(this.pid, {
                context: 'filemanager-content',
                selector: '.filemanager-content',
                priority: 90,
                items: (target) => {
                    // 检查是否点击在文件项上，如果是则不显示空白区域菜单
                    if (target.closest('.filemanager-item')) {
                        return null;
                    }
                    
                    // 检查是否点击在文件列表容器内
                    const contentArea = target.closest('.filemanager-content');
                    if (!contentArea) {
                        return null;
                    }
                    
                    const items = [];
                    
                    // 新建文件
                    items.push({
                        label: '新建文件',
                        icon: '📄',
                        action: async () => {
                            await self._createNewFile();
                        }
                    });
                    
                    // 新建文件夹
                    items.push({
                        label: '新建文件夹',
                        icon: '📁',
                        action: async () => {
                            await self._createNewDirectory();
                        }
                    });
                    
                    // 粘贴选项（如果有剪贴板内容）
                    if (self._clipboard && self._clipboard.items && self._clipboard.items.length > 0) {
                        items.push({ type: 'separator' });
                        items.push({
                            label: '粘贴',
                            icon: '📄',
                            action: async () => {
                                await self._pasteItems();
                            }
                        });
                    }
                    
                    items.push({ type: 'separator' });
                    
                    // 刷新
                    items.push({
                        label: '刷新',
                        icon: '↻',
                        action: async () => {
                            const currentPath = self._getCurrentPath();
                            if (currentPath === null || currentPath === '') {
                                await self._loadRootDirectory();
                            } else {
                                await self._loadDirectory(currentPath);
                            }
                        }
                    });
                    
                    return items;
                }
            });
        },
        
        /**
         * 重命名项目
         */
        _renameItem: async function(oldPath, newName) {
            try {
                // 解析路径
                const parts = oldPath.split('/');
                const oldName = parts[parts.length - 1];
                const parentPath = parts.slice(0, -1).join('/') || (oldPath.split(':')[0] + ':');
                
                // 确保路径格式正确
                let phpPath = parentPath;
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                // 检查是文件还是目录（通过 PHP 服务）
                const checkUrl = new URL('/service/FSDirve.php', window.location.origin);
                checkUrl.searchParams.set('action', 'exists');
                checkUrl.searchParams.set('path', oldPath);
                
                const checkResponse = await fetch(checkUrl.toString());
                if (!checkResponse.ok) {
                    throw new Error('无法检查文件/目录是否存在');
                }
                
                const checkResult = await checkResponse.json();
                if (checkResult.status !== 'success' || !checkResult.data || !checkResult.data.exists) {
                    throw new Error('文件或目录不存在');
                }
                
                const isDirectory = checkResult.data.type === 'directory';
                
                // 使用 PHP 的 rename 功能（更高效）
                if (isDirectory) {
                    // 目录：使用 rename_dir
                    const renameUrl = new URL('/service/FSDirve.php', window.location.origin);
                    renameUrl.searchParams.set('action', 'rename_dir');
                    renameUrl.searchParams.set('path', phpPath);
                    renameUrl.searchParams.set('oldName', oldName);
                    renameUrl.searchParams.set('newName', newName);
                    
                    const renameResponse = await fetch(renameUrl.toString());
                    if (!renameResponse.ok) {
                        const errorResult = await renameResponse.json().catch(() => ({ message: renameResponse.statusText }));
                        throw new Error(errorResult.message || '重命名目录失败');
                    }
                    
                    const renameResult = await renameResponse.json();
                    if (renameResult.status !== 'success') {
                        throw new Error(renameResult.message || '重命名目录失败');
                    }
                } else {
                    // 文件：使用 rename_file
                    const renameUrl = new URL('/service/FSDirve.php', window.location.origin);
                    renameUrl.searchParams.set('action', 'rename_file');
                    renameUrl.searchParams.set('path', phpPath);
                    renameUrl.searchParams.set('oldFileName', oldName);
                    renameUrl.searchParams.set('newFileName', newName);
                    
                    const renameResponse = await fetch(renameUrl.toString());
                    if (!renameResponse.ok) {
                        const errorResult = await renameResponse.json().catch(() => ({ message: renameResponse.statusText }));
                        throw new Error(errorResult.message || '重命名文件失败');
                    }
                    
                    const renameResult = await renameResponse.json();
                    if (renameResult.status !== 'success') {
                        throw new Error(renameResult.message || '重命名文件失败');
                    }
                }
                
                // 刷新当前目录
                const currentPath = this._getCurrentPath();
                if (currentPath === null || currentPath === '') {
                    await this._loadRootDirectory();
                } else {
                    await this._loadDirectory(currentPath);
                }
                
            } catch (error) {
                console.error('重命名失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`重命名失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`重命名失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 删除项目
         */
        _deleteItem: async function(itemPath, itemType) {
            try {
                // 解析路径：分离父目录路径和项目名称
                const pathParts = itemPath.split('/');
                const itemName = pathParts[pathParts.length - 1];
                const parentPath = pathParts.slice(0, -1).join('/') || (itemPath.split(':')[0] + ':');
                
                // 确保路径格式正确
                let phpPath = parentPath;
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                const url = new URL('/service/FSDirve.php', window.location.origin);
                
                if (itemType === 'directory') {
                    // 删除目录（使用递归删除，支持非空目录）
                    url.searchParams.set('action', 'delete_dir_recursive');
                    url.searchParams.set('path', itemPath);
                } else {
                    // 删除文件
                    url.searchParams.set('action', 'delete_file');
                    url.searchParams.set('path', phpPath);
                    url.searchParams.set('fileName', itemName);
                }
                
                const response = await fetch(url.toString());
                
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    const errorMessage = errorResult.message || `HTTP ${response.status}`;
                    throw new Error(errorMessage);
                }
                
                const result = await response.json();
                
                if (result.status !== 'success') {
                    throw new Error(result.message || '删除失败');
                }
                
                // 刷新当前目录
                const currentPath = this._getCurrentPath();
                if (currentPath === null || currentPath === '') {
                    await this._loadRootDirectory();
                } else {
                    await this._loadDirectory(currentPath);
                }
                
            } catch (error) {
                console.error('删除失败:', error);
                // 移除删除失败的错误弹窗，只记录日志
            }
        },
        
        /**
         * 复制选中的项目
         */
        _copySelectedItems: function() {
            const selectedItem = this._getSelectedItem();
            if (!selectedItem) {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    GUIManager.showAlert('请先选择一个文件或目录', '提示', 'info');
                } else {
                    alert('请先选择一个文件或目录');
                }
                return;
            }
            
            // 保存到剪贴板
            this._clipboard = {
                type: 'copy',
                items: [{
                    type: selectedItem.type,
                    path: selectedItem.path,
                    name: selectedItem.name
                }]
            };
            
            // 更新工具栏按钮状态
            this._updateToolbarButtons();
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug("FileManager", `已复制: ${selectedItem.name}`);
            }
        },
        
        /**
         * 剪切选中的项目
         */
        _cutSelectedItems: function() {
            const selectedItem = this._getSelectedItem();
            if (!selectedItem) {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    GUIManager.showAlert('请先选择一个文件或目录', '提示', 'info');
                } else {
                    alert('请先选择一个文件或目录');
                }
                return;
            }
            
            // 保存到剪贴板
            this._clipboard = {
                type: 'cut',
                items: [{
                    type: selectedItem.type,
                    path: selectedItem.path,
                    name: selectedItem.name
                }]
            };
            
            // 更新工具栏按钮状态
            this._updateToolbarButtons();
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug("FileManager", `已剪切: ${selectedItem.name}`);
            }
        },
        
        /**
         * 粘贴项目
         */
        _pasteItems: async function() {
            if (!this._clipboard || !this._clipboard.items || this._clipboard.items.length === 0) {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('剪贴板为空', '提示', 'info');
                } else {
                    alert('剪贴板为空');
                }
                return;
            }
            
            const currentPath = this._getCurrentPath();
            if (currentPath === null || currentPath === '') {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('无法在根目录粘贴', '错误', 'error');
                } else {
                    alert('无法在根目录粘贴');
                }
                return;
            }
            
            try {
                // 确保目标路径格式正确
                let targetPath = currentPath;
                if (/^[CD]:$/.test(targetPath)) {
                    targetPath = targetPath + '/';
                }
                
                for (const item of this._clipboard.items) {
                    // 解析源路径
                    const sourceParts = item.path.split('/');
                    const sourceName = sourceParts[sourceParts.length - 1];
                    const sourceParentPath = sourceParts.slice(0, -1).join('/') || (item.path.split(':')[0] + ':');
                    
                    // 确保源路径格式正确
                    let sourcePath = sourceParentPath;
                    if (/^[CD]:$/.test(sourcePath)) {
                        sourcePath = sourcePath + '/';
                    }
                    
                    if (this._clipboard.type === 'copy') {
                        // 复制操作
                        if (item.type === 'directory') {
                            // 复制目录
                            const copyUrl = new URL('/service/FSDirve.php', window.location.origin);
                            copyUrl.searchParams.set('action', 'copy_dir');
                            copyUrl.searchParams.set('sourcePath', item.path);
                            copyUrl.searchParams.set('targetPath', targetPath + '/' + sourceName);
                            
                            const copyResponse = await fetch(copyUrl.toString());
                            if (!copyResponse.ok) {
                                const errorResult = await copyResponse.json().catch(() => ({ message: copyResponse.statusText }));
                                throw new Error(`复制目录失败: ${errorResult.message || copyResponse.statusText}`);
                            }
                            
                            const copyResult = await copyResponse.json();
                            if (copyResult.status !== 'success') {
                                throw new Error(`复制目录失败: ${copyResult.message || '未知错误'}`);
                            }
                        } else {
                            // 复制文件
                            const copyUrl = new URL('/service/FSDirve.php', window.location.origin);
                            copyUrl.searchParams.set('action', 'copy_file');
                            copyUrl.searchParams.set('sourcePath', sourcePath);
                            copyUrl.searchParams.set('sourceFileName', sourceName);
                            copyUrl.searchParams.set('targetPath', targetPath);
                            copyUrl.searchParams.set('targetFileName', sourceName);
                            
                            const copyResponse = await fetch(copyUrl.toString());
                            if (!copyResponse.ok) {
                                const errorResult = await copyResponse.json().catch(() => ({ message: copyResponse.statusText }));
                                throw new Error(`复制文件失败: ${errorResult.message || copyResponse.statusText}`);
                            }
                            
                            const copyResult = await copyResponse.json();
                            if (copyResult.status !== 'success') {
                                throw new Error(`复制文件失败: ${copyResult.message || '未知错误'}`);
                            }
                        }
                    } else if (this._clipboard.type === 'cut') {
                        // 剪切操作（移动）
                        if (item.type === 'directory') {
                            // 移动目录
                            const moveUrl = new URL('/service/FSDirve.php', window.location.origin);
                            moveUrl.searchParams.set('action', 'move_dir');
                            moveUrl.searchParams.set('sourcePath', item.path);
                            moveUrl.searchParams.set('targetPath', targetPath + '/' + sourceName);
                            
                            const moveResponse = await fetch(moveUrl.toString());
                            if (!moveResponse.ok) {
                                const errorResult = await moveResponse.json().catch(() => ({ message: moveResponse.statusText }));
                                throw new Error(`移动目录失败: ${errorResult.message || moveResponse.statusText}`);
                            }
                            
                            const moveResult = await moveResponse.json();
                            if (moveResult.status !== 'success') {
                                throw new Error(`移动目录失败: ${moveResult.message || '未知错误'}`);
                            }
                        } else {
                            // 移动文件
                            const moveUrl = new URL('/service/FSDirve.php', window.location.origin);
                            moveUrl.searchParams.set('action', 'move_file');
                            moveUrl.searchParams.set('sourcePath', sourcePath);
                            moveUrl.searchParams.set('sourceFileName', sourceName);
                            moveUrl.searchParams.set('targetPath', targetPath);
                            moveUrl.searchParams.set('targetFileName', sourceName);
                            
                            const moveResponse = await fetch(moveUrl.toString());
                            if (!moveResponse.ok) {
                                const errorResult = await moveResponse.json().catch(() => ({ message: moveResponse.statusText }));
                                throw new Error(`移动文件失败: ${errorResult.message || moveResponse.statusText}`);
                            }
                            
                            const moveResult = await moveResponse.json();
                            if (moveResult.status !== 'success') {
                                throw new Error(`移动文件失败: ${moveResult.message || '未知错误'}`);
                            }
                        }
                        
                        // 剪切后清空剪贴板
                        this._clipboard = null;
                    }
                }
                
                // 刷新当前目录
                if (currentPath === null || currentPath === '') {
                    await this._loadRootDirectory();
                } else {
                    await this._loadDirectory(currentPath);
                }
                
                // 更新工具栏按钮状态
                this._updateToolbarButtons();
                
            } catch (error) {
                console.error('粘贴失败:', error);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`粘贴失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`粘贴失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 更新工具栏按钮状态
         */
        _updateToolbarButtons: function() {
            const selectedItem = this._getSelectedItem();
            const hasSelection = !!selectedItem;
            const hasClipboard = !!this._clipboard && this._clipboard.items && this._clipboard.items.length > 0;
            const currentPath = this._getCurrentPath();
            const canPaste = hasClipboard && currentPath !== null && currentPath !== '';
            
            // 更新复制按钮
            if (this.copyBtn) {
                if (hasSelection) {
                    this.copyBtn.style.opacity = '1';
                    this.copyBtn.style.cursor = 'pointer';
                } else {
                    this.copyBtn.style.opacity = '0.5';
                    this.copyBtn.style.cursor = 'not-allowed';
                }
            }
            
            // 更新剪切按钮
            if (this.cutBtn) {
                if (hasSelection) {
                    this.cutBtn.style.opacity = '1';
                    this.cutBtn.style.cursor = 'pointer';
                } else {
                    this.cutBtn.style.opacity = '0.5';
                    this.cutBtn.style.cursor = 'not-allowed';
                }
            }
            
            // 更新粘贴按钮
            if (this.pasteBtn) {
                if (canPaste) {
                    this.pasteBtn.style.opacity = '1';
                    this.pasteBtn.style.cursor = 'pointer';
                } else {
                    this.pasteBtn.style.opacity = '0.5';
                    this.pasteBtn.style.cursor = 'not-allowed';
                }
            }
        },
        
        /**
         * 注册键盘快捷键
         */
        _registerKeyboardShortcuts: function() {
            if (!this.window) return;
            
            const self = this;
            
            // 监听键盘事件
            this.window.addEventListener('keydown', (e) => {
                // 检查是否在输入框中
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                )) {
                    return;
                }
                
                // Ctrl+C: 复制
                if (e.ctrlKey && e.key === 'c' && !e.shiftKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    self._copySelectedItems();
                }
                
                // Ctrl+X: 剪切
                if (e.ctrlKey && e.key === 'x' && !e.shiftKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    self._cutSelectedItems();
                }
                
                // Ctrl+V: 粘贴
                if (e.ctrlKey && e.key === 'v' && !e.shiftKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    self._pasteItems();
                }
            });
        },
        
        /**
         * 更新侧边栏选中状态
         */
        _updateSidebarSelection: function() {
            if (!this.sidebarDiskList) return;
            
            // 更新所有侧边栏项的选中状态
            const items = this.sidebarDiskList.querySelectorAll('.filemanager-sidebar-item');
            items.forEach(item => {
                const isRoot = item.textContent.trim() === '计算机';
                const isCurrentDisk = !isRoot && item.textContent.trim() === this.currentPath;
                const currentPath = this._getCurrentPath();
                const isRootView = isRoot && (currentPath === null || currentPath === '');
                
                if (isRootView || isCurrentDisk) {
                    item.style.color = '#6c8eff';
                    item.style.background = 'rgba(108, 142, 255, 0.15)';
                } else {
                    item.style.color = '#e8ecf0';
                    item.style.background = 'transparent';
                }
            });
        },
        
        /**
         * 格式化文件大小
         */
        _formatSize: function(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        },
        
        /**
         * 退出方法
         */
        __exit__: async function() {
            try {
                // 注销右键菜单
                if (typeof ContextMenuManager !== 'undefined' && ContextMenuManager.unregisterMenu) {
                    try {
                        ContextMenuManager.unregisterMenu('filemanager-item');
                    } catch (e) {
                        console.warn('注销右键菜单失败:', e);
                    }
                }
                
                // 先移除 DOM 元素（确保 UI 立即清除）
                if (this.window) {
                    try {
                        // 如果窗口还在 DOM 中，直接移除
                        if (this.window.parentElement) {
                            this.window.parentElement.removeChild(this.window);
                        } else if (this.window.parentNode) {
                            this.window.parentNode.removeChild(this.window);
                        }
                    } catch (e) {
                        console.warn('移除窗口 DOM 失败:', e);
                    }
                }
                
                // 如果使用GUIManager，注销窗口（从 GUIManager 的内部映射中移除）
                // 注意：这应该在 DOM 移除之后进行，因为 unregisterWindow 不会移除 DOM
                if (typeof GUIManager !== 'undefined' && GUIManager.unregisterWindow) {
                    try {
                        GUIManager.unregisterWindow(this.pid);
                    } catch (e) {
                        console.warn('注销 GUIManager 窗口失败:', e);
                    }
                }
                
                // 5. 清理所有子元素的引用（这些元素应该已经被 GUIManager 从 DOM 中移除）
                // 但为了确保没有内存泄漏，我们仍然清理引用
                this.topToolbar = null;
                this.sidebar = null;
                this.mainContent = null;
                
                // 6. 清理所有引用
                this.window = null;
                this.windowId = null;
                this.fileListElement = null;
                this.addressInput = null;
                this.propertiesPanel = null;
                this.editPanel = null;
                this._setSelectedItem(null);
                this.selectedItemData = null;
                this._setEditingFile(null);
                this._setFileList([]);
                this._setCurrentPath(null);
                this._clipboard = null;
                this._isHandlingDrop = false;
                
                // 强制垃圾回收提示（如果浏览器支持）
                if (window.gc) {
                    try {
                        window.gc();
                    } catch (e) {}
                }
                
            } catch (error) {
                console.error('文件管理器退出时发生错误:', error);
                // 即使出错，也尝试强制移除窗口
                if (this.window && this.window.parentElement) {
                    try {
                        this.window.parentElement.removeChild(this.window);
                    } catch (e) {
                        console.error('强制移除窗口失败:', e);
                    }
                }
            }
        },
        
        /**
         * 初始化内存管理
         */
        _initMemory: function(pid) {
            if (!pid) {
                console.warn('FileManager: PID not available');
                return;
            }
            
            // 确保内存已分配
            if (typeof MemoryUtils !== 'undefined') {
                const mem = MemoryUtils.ensureMemory(pid, 100000, 2000);
                if (mem) {
                    this._heap = mem.heap;
                    this._shed = mem.shed;
                }
            } else if (typeof MemoryManager !== 'undefined') {
                // 降级方案：直接使用MemoryManager
                try {
                    const result = MemoryManager.allocateMemory(pid, 100000, 2000, 1, 1);
                    this._heap = result.heap;
                    this._shed = result.shed;
                } catch (e) {
                    console.error('FileManager: Error allocating memory', e);
                }
            }
        },
        
        /**
         * 数据访问方法（getter/setter）
         */
        _getCurrentPath: function() {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                return MemoryUtils.loadString(this.pid, this._currentPathKey);
            }
            return null;
        },
        
        _setCurrentPath: function(value) {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                MemoryUtils.storeString(this.pid, this._currentPathKey, value !== null ? value : '');
            }
        },
        
        _getFileList: function() {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                return MemoryUtils.loadArray(this.pid, this._fileListKey) || [];
            }
            return [];
        },
        
        _setFileList: function(value) {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                MemoryUtils.storeArray(this.pid, this._fileListKey, value || []);
            }
        },
        
        _getSelectedItem: function() {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                const selectedItemData = MemoryUtils.loadObject(this.pid, this._selectedItemKey);
                if (!selectedItemData) {
                    return null;
                }
                
                // 从当前文件列表中查找匹配的项目（确保数据是最新的）
                const fileList = this._getFileList();
                return fileList.find(item => item.path === selectedItemData.path) || selectedItemData;
            }
            return null;
        },
        
        _setSelectedItem: function(value) {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                MemoryUtils.storeObject(this.pid, this._selectedItemKey, value);
            }
        },
        
        _getEditingFile: function() {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                return MemoryUtils.loadObject(this.pid, this._editingFileKey);
            }
            return null;
        },
        
        _setEditingFile: function(value) {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                MemoryUtils.storeObject(this.pid, this._editingFileKey, value);
            }
        },
        
        _getEditContent: function() {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                return MemoryUtils.loadString(this.pid, this._editContentKey);
            }
            return null;
        },
        
        _setEditContent: function(value) {
            if (typeof MemoryUtils !== 'undefined' && this.pid) {
                MemoryUtils.storeString(this.pid, this._editContentKey, value || '');
            }
        },
        
        /**
         * 添加到导航历史记录
         */
        _addToHistory: function(path) {
            // 如果当前路径与历史记录中的最后一个路径相同，不添加
            if (this._navigationHistory.length > 0 && 
                this._navigationHistory[this._historyIndex] === path) {
                return;
            }
            
            // 如果不在历史记录末尾，删除后面的记录
            if (this._historyIndex < this._navigationHistory.length - 1) {
                this._navigationHistory = this._navigationHistory.slice(0, this._historyIndex + 1);
            }
            
            // 添加到历史记录
            this._navigationHistory.push(path);
            this._historyIndex = this._navigationHistory.length - 1;
            
            // 限制历史记录长度（最多50条）
            if (this._navigationHistory.length > 50) {
                this._navigationHistory.shift();
                this._historyIndex--;
            }
            
            // 更新前进/后退按钮状态
            this._updateNavigationButtons();
        },
        
        /**
         * 后退
         */
        _goBack: async function() {
            if (this._historyIndex > 0) {
                this._historyIndex--;
                const path = this._navigationHistory[this._historyIndex];
                
                // 设置标志，防止在加载目录时重复添加到历史记录
                this._isNavigatingHistory = true;
                
                try {
                    this._setCurrentPath(path);
                    if (this.addressInput) {
                        this.addressInput.value = path || '\\';
                    }
                    if (this.breadcrumbContainer) {
                        this._updateBreadcrumb();
                    }
                    
                    if (path === null || path === '\\' || path === '') {
                        await this._loadRootDirectory();
                    } else {
                        await this._loadDirectory(path);
                    }
                    
                    this._updateNavigationButtons();
                } finally {
                    // 清除标志
                    this._isNavigatingHistory = false;
                }
            }
        },
        
        /**
         * 前进
         */
        _goForward: async function() {
            if (this._historyIndex < this._navigationHistory.length - 1) {
                this._historyIndex++;
                const path = this._navigationHistory[this._historyIndex];
                
                // 设置标志，防止在加载目录时重复添加到历史记录
                this._isNavigatingHistory = true;
                
                try {
                    this._setCurrentPath(path);
                    if (this.addressInput) {
                        this.addressInput.value = path || '\\';
                    }
                    if (this.breadcrumbContainer) {
                        this._updateBreadcrumb();
                    }
                    
                    if (path === null || path === '\\' || path === '') {
                        await this._loadRootDirectory();
                    } else {
                        await this._loadDirectory(path);
                    }
                    
                    this._updateNavigationButtons();
                } finally {
                    // 清除标志
                    this._isNavigatingHistory = false;
                }
            }
        },
        
        /**
         * 更新前进/后退按钮状态
         */
        _updateNavigationButtons: function() {
            if (this.backBtn) {
                if (this._historyIndex > 0) {
                    this.backBtn.style.opacity = '1';
                    this.backBtn.style.cursor = 'pointer';
                } else {
                    this.backBtn.style.opacity = '0.5';
                    this.backBtn.style.cursor = 'not-allowed';
                }
            }
            
            if (this.forwardBtn) {
                if (this._historyIndex < this._navigationHistory.length - 1) {
                    this.forwardBtn.style.opacity = '1';
                    this.forwardBtn.style.cursor = 'pointer';
                } else {
                    this.forwardBtn.style.opacity = '0.5';
                    this.forwardBtn.style.cursor = 'not-allowed';
                }
            }
        },
        
        /**
         * 信息方法
         */
        __info__: function() {
            return {
                name: '文件管理器',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS 文件管理器 - 图形化文件浏览、编辑和管理',
                author: 'ZerOS Team',
                copyright: '© 2024',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE,
                    PermissionManager.PERMISSION.KERNEL_DISK_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.FILEMANAGER = FILEMANAGER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.FILEMANAGER = FILEMANAGER;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

