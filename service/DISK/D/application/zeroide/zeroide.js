// ZerOS 代码编辑器 (ZeroIDE)
// 基于 Ace Editor 的完整代码编辑器
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const ZEROIDE = {
        pid: null,
        window: null,
        
        // Ace Editor 实例
        editor: null,
        ace: null,
        
        // 工作空间
        workspacePath: null,
        workspaceName: null,
        
        // 文件管理
        fileTree: null,
        openFiles: new Map(), // Map<filePath, {editor, tab, content, modified}>
        activeFile: null,
        
        // UI 元素
        sidebar: null,
        editorContainer: null,
        statusBar: null,
        tabsContainer: null,
        settingsPanel: null,
        settingsWindow: null, // 设置窗口（独立窗口）
        menuBar: null, // 菜单栏
        activeMenu: null, // 当前激活的菜单
        
        // 设置
        settings: {
            theme: 'monokai',
            fontSize: 14,
            fontFamily: 'Consolas, "Courier New", monospace',
            tabSize: 4,
            useSoftTabs: true,
            wordWrap: false,
            showLineNumbers: true,
            showGutter: true,
            enableSnippets: true,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            showPrintMargin: false,
            highlightActiveLine: true,
            showInvisibles: false,
            wrapBehavioursEnabled: true,
            autoIndent: true
        },
        
        /**
         * 初始化
         */
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            try {
                // 获取 GUI 容器
                const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
                
                // 创建主窗口
                this.window = document.createElement('div');
                this.window.className = 'zeroide-window zos-gui-window';
                this.window.dataset.pid = pid.toString();
                
                // 设置窗口初始大小（在注册前设置，确保 GUIManager 能正确识别）
                // 遵守 ZerOS GUI 开发约定：使用固定宽度和高度，支持拉伸
                this.window.style.width = '1000px';
                this.window.style.height = '600px';
                this.window.style.minWidth = '600px';  // 最小宽度，支持拉伸
                this.window.style.minHeight = '400px'; // 最小高度，支持拉伸
                this.window.style.maxWidth = '100vw';  // 最大宽度不超过屏幕
                this.window.style.maxHeight = '100vh'; // 最大高度不超过屏幕
                
                // 使用GUIManager注册窗口
                if (typeof GUIManager !== 'undefined') {
                    let icon = null;
                    if (typeof ApplicationAssetManager !== 'undefined') {
                        icon = ApplicationAssetManager.getIcon('zeroide');
                    }
                    
                    const windowInfo = GUIManager.registerWindow(pid, this.window, {
                        title: 'ZeroIDE',
                        icon: icon,
                        onClose: () => {
                            if (typeof ProcessManager !== 'undefined') {
                                ProcessManager.killProgram(this.pid);
                            }
                        },
                        onMaximize: (isMaximized) => {
                            // 监听窗口最大化/还原事件，只在最大化时设置高度
                            if (isMaximized) {
                                // 最大化时，确保容器高度为 100vh（全屏）
                                this.window.style.height = '100vh';
                                this.window.style.width = '100vw';
                            } else {
                                // 还原时，不强制设置高度，让用户可以通过拉伸调整
                                // 高度由用户拉伸决定，不强制恢复为 600px
                            }
                            // 确保内部容器也正确
                            const mainContainer = this.window.querySelector('.zeroide-main');
                            if (mainContainer) {
                                mainContainer.style.flex = '1';
                                mainContainer.style.minHeight = '0';
                            }
                        }
                    });
                }
                
                // 加载样式表
                await this._loadStyles();
                
                // 创建UI
                this._createUI();
                
                // 添加到GUI容器
                guiContainer.appendChild(this.window);
                
                // 加载依赖库
                await this._loadDependencies();
                
                // 初始化编辑器
                this._initEditor();
                
                // 加载设置
                this._loadSettings();
                
                // 如果没有工作空间，提示选择
                if (!initArgs || !initArgs.workspacePath) {
                    await this._openWorkspaceSelector();
                } else {
                    await this._openWorkspace(initArgs.workspacePath);
                }
                
            } catch (error) {
                console.error('[ZeroIDE] 初始化失败:', error);
                this._showError('初始化失败: ' + error.message);
            }
        },
        
        /**
         * 创建UI界面
         */
        _createUI: function() {
            // 主容器（不覆盖已设置的窗口尺寸，只设置布局相关样式）
            // 遵守 ZerOS GUI 开发约定：保持窗口固定尺寸，支持拉伸
            this.window.style.display = 'flex';
            this.window.style.flexDirection = 'column';
            // 不设置 width 和 height，保持之前设置的固定尺寸（1000px x 600px）
            // 不设置 minHeight，保持之前设置的最小高度（400px）
            this.window.style.overflow = 'hidden';
            this.window.style.background = '#1e1e1e';
            this.window.style.color = '#cccccc';
            this.window.style.position = 'relative';
            
            // 顶部工具栏
            const toolbar = document.createElement('div');
            toolbar.className = 'zeroide-toolbar';
            toolbar.style.cssText = `
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: #2d2d2d;
                border-bottom: 1px solid #3e3e3e;
                gap: 8px;
                height: 40px;
                min-height: 40px;
                max-height: 40px;
                flex-shrink: 0;
            `;
            
            // 创建菜单栏（VSCode 风格）
            this.menuBar = document.createElement('div');
            this.menuBar.className = 'zeroide-menubar';
            this.menuBar.style.cssText = `
                display: flex;
                align-items: center;
                gap: 0;
            `;
            
            // 文件菜单
            const fileMenu = this._createMenuButton('文件', () => this._showMenu('file'));
            const editMenu = this._createMenuButton('编辑', () => this._showMenu('edit'));
            const viewMenu = this._createMenuButton('视图', () => this._showMenu('view'));
            const settingsMenu = this._createMenuButton('设置', () => this._showMenu('settings'));
            const helpMenu = this._createMenuButton('帮助', () => this._showMenu('help'));
            
            this.menuBar.appendChild(fileMenu);
            this.menuBar.appendChild(editMenu);
            this.menuBar.appendChild(viewMenu);
            this.menuBar.appendChild(settingsMenu);
            this.menuBar.appendChild(helpMenu);
            
            toolbar.appendChild(this.menuBar);
            
            // 工作空间显示
            const workspaceInfo = document.createElement('div');
            workspaceInfo.className = 'zeroide-workspace-info';
            workspaceInfo.style.cssText = `
                margin-left: auto;
                padding: 4px 12px;
                font-size: 12px;
                color: #888;
            `;
            workspaceInfo.textContent = '未打开工作空间';
            this.workspaceInfo = workspaceInfo;
            toolbar.appendChild(workspaceInfo);
            
            this.window.appendChild(toolbar);
            
            // 主内容区域
            const mainContainer = document.createElement('div');
            mainContainer.className = 'zeroide-main';
            mainContainer.style.cssText = `
                display: flex;
                flex: 1;
                overflow: hidden;
            `;
            
            // 侧边栏
            this.sidebar = document.createElement('div');
            this.sidebar.className = 'zeroide-sidebar';
            this.sidebar.style.cssText = `
                width: 250px;
                background: #252526;
                border-right: 1px solid #3e3e3e;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 侧边栏标题栏（VSCode 风格）
            const sidebarHeader = document.createElement('div');
            sidebarHeader.className = 'zeroide-sidebar-header';
            sidebarHeader.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 4px 8px;
                background: #2d2d2d;
                border-bottom: 1px solid #3e3e3e;
                height: 35px;
                flex-shrink: 0;
            `;
            
            const headerTitle = document.createElement('div');
            headerTitle.style.cssText = `
                display: flex;
                align-items: center;
                flex: 1;
                font-weight: 600;
                font-size: 11px;
                text-transform: uppercase;
                color: #cccccc;
                letter-spacing: 0.5px;
            `;
            headerTitle.textContent = '资源管理器';
            sidebarHeader.appendChild(headerTitle);
            
            // 操作按钮组
            const headerActions = document.createElement('div');
            headerActions.className = 'zeroide-sidebar-actions';
            headerActions.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
            `;
            
            // 新建文件按钮
            const newFileBtn = this._createActionButton('📄', '新建文件', () => this._createNewFileInWorkspace());
            // 新建文件夹按钮
            const newFolderBtn = this._createActionButton('📁', '新建文件夹', () => this._createNewFolderInWorkspace());
            // 刷新按钮
            const refreshBtn = this._createActionButton('🔄', '刷新', () => this._refreshFileTree());
            // 折叠全部按钮
            const collapseAllBtn = this._createActionButton('▼', '折叠全部', () => this._collapseAll());
            
            headerActions.appendChild(newFileBtn);
            headerActions.appendChild(newFolderBtn);
            headerActions.appendChild(refreshBtn);
            headerActions.appendChild(collapseAllBtn);
            
            sidebarHeader.appendChild(headerActions);
            this.sidebar.appendChild(sidebarHeader);
            this.sidebarHeader = sidebarHeader;
            
            // 文件树容器
            const fileTreeContainer = document.createElement('div');
            fileTreeContainer.className = 'zeroide-file-tree';
            fileTreeContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            `;
            this.fileTreeContainer = fileTreeContainer;
            this.sidebar.appendChild(fileTreeContainer);
            
            mainContainer.appendChild(this.sidebar);
            
            // 编辑器区域
            const editorArea = document.createElement('div');
            editorArea.className = 'zeroide-editor-area';
            editorArea.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 标签栏
            this.tabsContainer = document.createElement('div');
            this.tabsContainer.className = 'zeroide-tabs';
            this.tabsContainer.style.cssText = `
                display: flex;
                background: #2d2d2d;
                border-bottom: 1px solid #3e3e3e;
                overflow-x: auto;
                min-height: 35px;
            `;
            editorArea.appendChild(this.tabsContainer);
            
            // 编辑器容器
            this.editorContainer = document.createElement('div');
            this.editorContainer.className = 'zeroide-editor-container';
            this.editorContainer.style.cssText = `
                flex: 1;
                position: relative;
                overflow: hidden;
            `;
            editorArea.appendChild(this.editorContainer);
            
            mainContainer.appendChild(editorArea);
            this.window.appendChild(mainContainer);
            
            // 状态栏
            this.statusBar = document.createElement('div');
            this.statusBar.className = 'zeroide-statusbar';
            this.statusBar.style.cssText = `
                display: flex;
                align-items: center;
                padding: 4px 12px;
                background: #007acc;
                color: white;
                font-size: 12px;
                height: 22px;
                min-height: 22px;
                max-height: 22px;
                flex-shrink: 0;
            `;
            this.statusBar.textContent = '就绪';
            this.window.appendChild(this.statusBar);
        },
        
        /**
         * 创建菜单按钮（VSCode 风格）
         */
        _createMenuButton: function(text, onClick) {
            const button = document.createElement('div');
            button.className = 'zeroide-menu-button';
            button.textContent = text;
            button.style.cssText = `
                padding: 4px 12px;
                background: transparent;
                border: none;
                color: #cccccc;
                cursor: pointer;
                border-radius: 3px;
                user-select: none;
                position: relative;
            `;
            button.addEventListener('mouseenter', () => {
                button.style.background = '#3e3e3e';
            });
            button.addEventListener('mouseleave', () => {
                if (!button.classList.contains('active')) {
                    button.style.background = 'transparent';
                }
            });
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
            });
            return button;
        },
        
        /**
         * 显示菜单（VSCode 风格下拉菜单）
         */
        _showMenu: function(menuType) {
            // 关闭当前菜单
            this._hideMenu();
            
            // 获取菜单按钮
            const menuButtons = this.menuBar.querySelectorAll('.zeroide-menu-button');
            let menuButton = null;
            let menuIndex = 0;
            
            if (menuType === 'file') menuIndex = 0;
            else if (menuType === 'edit') menuIndex = 1;
            else if (menuType === 'view') menuIndex = 2;
            else if (menuType === 'settings') menuIndex = 3;
            else if (menuType === 'help') menuIndex = 4;
            
            if (menuButtons[menuIndex]) {
                menuButton = menuButtons[menuIndex];
                menuButton.classList.add('active');
                menuButton.style.background = '#3e3e3e';
            }
            
            // 创建菜单
            const menu = document.createElement('div');
            menu.className = 'zeroide-menu';
            menu.style.cssText = `
                position: absolute;
                background: #2d2d2d;
                border: 1px solid #3e3e3e;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                z-index: 10001;
                min-width: 200px;
                padding: 4px 0;
                font-size: 13px;
            `;
            
            // 获取菜单项
            const menuItems = this._getMenuItems(menuType);
            
            menuItems.forEach((item, index) => {
                if (item.separator) {
                    const separator = document.createElement('div');
                    separator.style.cssText = `
                        height: 1px;
                        background: #3e3e3e;
                        margin: 4px 0;
                    `;
                    menu.appendChild(separator);
                } else {
                    const menuItem = document.createElement('div');
                    menuItem.className = 'zeroide-menu-item';
                    menuItem.style.cssText = `
                        padding: 6px 24px 6px 32px;
                        color: #cccccc;
                        cursor: pointer;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        position: relative;
                    `;
                    
                    const label = document.createElement('span');
                    label.textContent = item.label;
                    
                    const shortcut = document.createElement('span');
                    shortcut.textContent = item.shortcut || '';
                    shortcut.style.cssText = `
                        color: #888;
                        font-size: 11px;
                        margin-left: 32px;
                    `;
                    
                    menuItem.appendChild(label);
                    if (item.shortcut) {
                        menuItem.appendChild(shortcut);
                    }
                    
                    if (item.disabled) {
                        menuItem.style.opacity = '0.5';
                        menuItem.style.cursor = 'not-allowed';
                    } else {
                        menuItem.addEventListener('mouseenter', () => {
                            menuItem.style.background = '#37373d';
                        });
                        menuItem.addEventListener('mouseleave', () => {
                            menuItem.style.background = 'transparent';
                        });
                        menuItem.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (item.action) {
                                item.action();
                            }
                            this._hideMenu();
                        });
                    }
                    
                    menu.appendChild(menuItem);
                }
            });
            
            // 计算菜单位置（相对于窗口）
            if (menuButton) {
                const buttonRect = menuButton.getBoundingClientRect();
                const windowRect = this.window.getBoundingClientRect();
                
                // 计算相对于窗口的位置
                menu.style.left = `${buttonRect.left - windowRect.left}px`;
                menu.style.top = `${buttonRect.bottom - windowRect.top}px`;
                menu.style.position = 'absolute';
            }
            
            // 将菜单添加到窗口内（而不是 body）
            this.window.appendChild(menu);
            this.activeMenu = menu;
            
            // 点击外部关闭菜单
            const closeMenu = (e) => {
                if (!menu.contains(e.target) && !menuButton.contains(e.target)) {
                    this._hideMenu();
                    document.removeEventListener('click', closeMenu, true);
                    document.removeEventListener('mousedown', closeMenu, true);
                }
            };
            
            // 延迟添加监听器，避免立即触发
            setTimeout(() => {
                document.addEventListener('click', closeMenu, true);
                document.addEventListener('mousedown', closeMenu, true);
            }, 10);
        },
        
        /**
         * 隐藏菜单
         */
        _hideMenu: function() {
            if (this.activeMenu) {
                this.activeMenu.remove();
                this.activeMenu = null;
            }
            
            // 移除所有菜单按钮的 active 状态
            if (this.menuBar) {
                const menuButtons = this.menuBar.querySelectorAll('.zeroide-menu-button');
                menuButtons.forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.background = 'transparent';
                });
            }
        },
        
        /**
         * 获取菜单项
         */
        _getMenuItems: function(menuType) {
            const items = [];
            
            if (menuType === 'file') {
                items.push(
                    { label: '新建文件', shortcut: 'Ctrl+N', action: () => this._newFile() },
                    { label: '打开文件...', shortcut: 'Ctrl+O', action: () => this._openFileDialog() },
                    { separator: true },
                    { label: '保存', shortcut: 'Ctrl+S', action: () => this._saveFile() },
                    { label: '另存为...', shortcut: 'Ctrl+Shift+S', action: () => this._saveAsFile() },
                    { separator: true },
                    { label: '关闭编辑器', shortcut: 'Ctrl+W', action: () => this._closeFile() },
                    { label: '关闭所有', action: () => this._closeAllFiles() },
                    { separator: true },
                    { label: '退出', shortcut: 'Alt+F4', action: () => this._exit() }
                );
            } else if (menuType === 'edit') {
                items.push(
                    { label: '撤销', shortcut: 'Ctrl+Z', action: () => this._undo() },
                    { label: '重做', shortcut: 'Ctrl+Y', action: () => this._redo() },
                    { separator: true },
                    { label: '剪切', shortcut: 'Ctrl+X', action: () => this._cut() },
                    { label: '复制', shortcut: 'Ctrl+C', action: () => this._copy() },
                    { label: '粘贴', shortcut: 'Ctrl+V', action: () => this._paste() },
                    { separator: true },
                    { label: '查找', shortcut: 'Ctrl+F', action: () => this._find() },
                    { label: '替换', shortcut: 'Ctrl+H', action: () => this._replace() },
                    { separator: true },
                    { label: '全选', shortcut: 'Ctrl+A', action: () => this._selectAll() }
                );
            } else if (menuType === 'view') {
                items.push(
                    { label: '命令面板...', shortcut: 'Ctrl+Shift+P', action: () => this._showCommandPalette() },
                    { separator: true },
                    { label: '切换侧边栏', shortcut: 'Ctrl+B', action: () => this._toggleSidebar() },
                    { label: '切换终端', shortcut: 'Ctrl+`', action: () => this._toggleTerminal() },
                    { separator: true },
                    { label: '放大', shortcut: 'Ctrl+=', action: () => this._zoomIn() },
                    { label: '缩小', shortcut: 'Ctrl+-', action: () => this._zoomOut() },
                    { label: '重置缩放', shortcut: 'Ctrl+0', action: () => this._resetZoom() }
                );
            } else if (menuType === 'settings') {
                items.push(
                    { label: '设置', shortcut: 'Ctrl+,', action: () => this._showSettings() },
                    { label: '键盘快捷键', shortcut: 'Ctrl+K Ctrl+S', action: () => this._showKeybindings() },
                    { separator: true },
                    { label: '主题', action: () => this._showThemeSelector() }
                );
            } else if (menuType === 'help') {
                items.push(
                    { label: '关于 ZeroIDE', action: () => this._showAbout() },
                    { label: '快捷键参考', action: () => this._showShortcuts() }
                );
            }
            
            return items;
        },
        
        /**
         * 加载样式表
         */
        _loadStyles: async function() {
            // 通过 ApplicationAssetManager 加载样式
            if (typeof ApplicationAssetManager !== 'undefined') {
                const programInfo = ApplicationAssetManager.getProgramInfo('zeroide');
                if (programInfo && programInfo.styles) {
                    for (const stylePath of programInfo.styles) {
                        const url = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                            ? ProcessManager.convertVirtualPathToUrl(stylePath)
                            : stylePath;
                        
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = url;
                        document.head.appendChild(link);
                    }
                }
            }
        },
        
        /**
         * 加载依赖库
         */
        _loadDependencies: async function() {
            // 加载 Ace Editor
            if (typeof DynamicManager !== 'undefined') {
                this.ace = await DynamicManager.loadModule('ace');
                if (!this.ace) {
                    throw new Error('无法加载 Ace Editor');
                }
                
                // 加载 Highlight.js 以增强代码高亮（可选）
                try {
                    this.hljs = await DynamicManager.loadModule('highlight');
                } catch (e) {
                    console.warn('[ZeroIDE] 无法加载 Highlight.js，将仅使用 Ace Editor 的高亮:', e);
                    this.hljs = null;
                }
            } else {
                throw new Error('DynamicManager 不可用');
            }
        },
        
        /**
         * 初始化编辑器
         */
        _initEditor: function() {
            if (!this.ace) {
                throw new Error('Ace Editor 未加载');
            }
            
            // 创建编辑器
            this.editor = this.ace.edit(this.editorContainer);
            
            // 应用设置
            this._applySettings();
            
            // 启用代码补全
            this._setupAutocompletion();
            
            // 设置键盘快捷键
            this._setupKeyboardShortcuts();
            
            // 监听内容变化
            this.editor.on('change', () => {
                if (this.activeFile) {
                    const fileInfo = this.openFiles.get(this.activeFile);
                    if (fileInfo) {
                        fileInfo.modified = true;
                        fileInfo.content = this.editor.getValue();
                        this._updateTab(fileInfo.tab);
                    }
                }
            });
            
            // 监听光标位置变化
            this.editor.on('changeSelection', () => {
                this._updateStatusBar();
            });
        },
        
        /**
         * 设置代码补全（加载 language_tools 扩展）
         */
        _setupAutocompletion: async function() {
            if (!this.editor || !this.ace) return;
            
            try {
                // 预构建版本中，language_tools 需要通过动态加载
                // 首先尝试直接加载 ext-language_tools.js
                let langTools = null;
                
                // 方法1: 尝试通过 script 标签加载 language_tools
                if (!langTools) {
                    langTools = await this._loadLanguageTools();
                }
                
                // 方法2: 如果加载成功，应用补全器
                if (langTools) {
                    this._applyCompleters(langTools);
                } else {
                    console.warn('[ZeroIDE] 无法加载 language_tools 扩展，代码补全可能不可用');
                }
            } catch (e) {
                console.warn('[ZeroIDE] 代码补全设置失败:', e);
            }
        },
        
        /**
         * 加载 language_tools 扩展
         */
        _loadLanguageTools: async function() {
            return new Promise((resolve) => {
                try {
                    // 检查是否已经加载
                    if (this.ace && this.ace.require) {
                        try {
                            const langTools = this.ace.require('ace/ext/language_tools');
                            if (langTools) {
                                resolve(langTools);
                                return;
                            }
                        } catch (e) {
                            // require 不可用，继续尝试其他方法
                        }
                    }
                    
                    // 通过 script 标签加载 ext-language_tools.js
                    const script = document.createElement('script');
                    const scriptUrl = '/kernel/dynamicModule/libs/ace/ext-language_tools.js';
                    
                    script.src = scriptUrl;
                    script.async = false;
                    
                    script.onload = () => {
                        // 等待脚本执行
                        setTimeout(() => {
                            // 再次尝试 require
                            if (this.ace && this.ace.require) {
                                try {
                                    const langTools = this.ace.require('ace/ext/language_tools');
                                    if (langTools) {
                                        resolve(langTools);
                                        return;
                                    }
                                } catch (e) {
                                    console.warn('[ZeroIDE] language_tools 加载后无法通过 require 获取:', e);
                                }
                            }
                            
                            // 如果 require 不可用，检查 window 对象
                            if (typeof window !== 'undefined' && window.ace && window.ace.require) {
                                try {
                                    const langTools = window.ace.require('ace/ext/language_tools');
                                    if (langTools) {
                                        resolve(langTools);
                                        return;
                                    }
                                } catch (e) {
                                    // 忽略错误
                                }
                            }
                            
                            // 如果都失败了，返回 null
                            resolve(null);
                        }, 200);
                    };
                    
                    script.onerror = () => {
                        console.warn('[ZeroIDE] 加载 ext-language_tools.js 失败');
                        resolve(null);
                    };
                    
                    document.head.appendChild(script);
                } catch (e) {
                    console.warn('[ZeroIDE] 加载 language_tools 时出错:', e);
                    resolve(null);
                }
            });
        },
        
        /**
         * 应用补全器（启用代码补全功能）
         */
        _applyCompleters: function(langTools) {
            if (!langTools) return;
            
            try {
                // 启用代码补全
                if (typeof langTools.setCompleters === 'function') {
                    // 使用默认的补全器
                    langTools.setCompleters([
                        langTools.textCompleter,
                        langTools.keyWordCompleter,
                        langTools.snippetCompleter
                    ].filter(Boolean));
                }
                
                // 启用自动补全（这些选项只在 ext-language_tools 扩展加载后才有效）
                // 由于 langTools 已加载，可以安全地设置这些选项
                try {
                    this.editor.setOptions({
                        enableBasicAutocompletion: true,
                        enableLiveAutocompletion: true,
                        enableSnippets: true
                    });
                } catch (e) {
                    // 如果设置选项失败，记录警告但不影响其他功能
                    console.warn('[ZeroIDE] 设置自动补全选项时出现警告:', e);
                }
                
                console.log('[ZeroIDE] 代码补全已启用');
            } catch (e) {
                console.warn('[ZeroIDE] 应用补全器失败:', e);
            }
        },
        
        /**
         * 获取模式的关键字
         */
        _getKeywordsForMode: function(modeId) {
            const keywords = {
                'javascript': ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'return', 'true', 'false', 'null', 'undefined', 'this', 'new', 'class', 'extends', 'async', 'await', 'try', 'catch', 'finally', 'throw'],
                'html': ['html', 'head', 'body', 'div', 'span', 'p', 'a', 'img', 'script', 'style', 'link', 'meta', 'title'],
                'css': ['color', 'background', 'margin', 'padding', 'border', 'width', 'height', 'display', 'flex', 'grid', 'position', 'top', 'left', 'right', 'bottom'],
                'python': ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'pass', 'break', 'continue'],
                'java': ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'final', 'void', 'int', 'String', 'if', 'else', 'for', 'while', 'return', 'new', 'this', 'super']
            };
            
            // 从模式ID中提取语言
            const lang = modeId ? modeId.split('/').pop() : '';
            return keywords[lang] || [];
        },
        
        /**
         * 设置键盘快捷键
         */
        _setupKeyboardShortcuts: function() {
            if (!this.editor) return;
            
            // Ctrl+S 保存（阻止默认行为，避免浏览器保存页面）
            this.editor.commands.addCommand({
                name: 'save',
                bindKey: { win: 'Ctrl-S', mac: 'Command-S' },
                exec: () => {
                    if (this.activeFile) {
                        this._saveFile();
                    } else {
                        // 如果没有活动文件，提示用户
                        this._updateStatusBar('没有打开的文件');
                    }
                    return false; // 阻止默认行为
                }
            });
            
            // 同时监听键盘事件，确保快捷键生效
            this.editor.container.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.activeFile) {
                        this._saveFile();
                    }
                }
            }, true);
            
            // Ctrl+O 打开文件
            this.editor.commands.addCommand({
                name: 'openFile',
                bindKey: { win: 'Ctrl-O', mac: 'Command-O' },
                exec: () => {
                    this._openFileDialog();
                }
            });
            
            // Ctrl+W 关闭文件
            this.editor.commands.addCommand({
                name: 'closeFile',
                bindKey: { win: 'Ctrl-W', mac: 'Command-W' },
                exec: () => {
                    if (this.activeFile) {
                        this._closeFile(this.activeFile);
                    }
                }
            });
            
            // Ctrl+K Ctrl+S 打开设置
            this.editor.commands.addCommand({
                name: 'openSettings',
                bindKey: { win: 'Ctrl-K Ctrl-S', mac: 'Command-K Command-S' },
                exec: () => {
                    this._showSettings();
                }
            });
        },
        
        /**
         * 打开文件对话框
         */
        _openFileDialog: async function() {
            if (typeof ProcessManager === 'undefined') {
                this._showError('ProcessManager 不可用');
                return;
            }
            
            try {
                const fileManagerPid = await ProcessManager.startProgram('filemanager', {
                    args: [this.workspacePath || 'C:'],
                    mode: 'file-selector',
                    onFileSelected: async (fileItem) => {
                        if (fileItem && fileItem.path) {
                            await this._openFile(fileItem.path);
                        }
                    }
                });
            } catch (error) {
                this._showError(`打开文件对话框失败: ${error.message}`);
            }
        },
        
        /**
         * 应用设置
         */
        _applySettings: function() {
            if (!this.editor) return;
            
            const s = this.settings;
            
            // 应用主题（异步加载，需要等待完成）
            this.editor.setTheme(`ace/theme/${s.theme}`, () => {
                // 主题加载完成后，触发重新渲染
                this.editor.renderer.updateFull();
            });
            
            // 应用字体设置
            this.editor.setFontSize(s.fontSize);
            this.editor.setOption('fontFamily', s.fontFamily);
            
            // 应用编辑器选项
            this.editor.setOption('tabSize', s.tabSize);
            this.editor.setOption('useSoftTabs', s.useSoftTabs);
            // 修复：wordWrap 应该是 wrap
            this.editor.setOption('wrap', s.wordWrap ? 'free' : false);
            this.editor.setOption('showLineNumbers', s.showLineNumbers);
            this.editor.setOption('showGutter', s.showGutter !== false);
            this.editor.setOption('showPrintMargin', s.showPrintMargin);
            this.editor.setOption('highlightActiveLine', s.highlightActiveLine);
            this.editor.setOption('showInvisibles', s.showInvisibles);
            this.editor.setOption('wrapBehavioursEnabled', s.wrapBehavioursEnabled);
            
            // 应用代码补全设置（仅在 language_tools 扩展加载后）
            try {
                // 检查 language_tools 扩展是否已加载
                let langTools = null;
                if (this.ace && this.ace.require) {
                    try {
                        langTools = this.ace.require('ace/ext/language_tools');
                    } catch (e) {
                        // 扩展未加载，忽略
                    }
                }
                
                // 只有在扩展加载后才设置这些选项，避免警告
                if (langTools) {
                    this.editor.setOptions({
                        enableBasicAutocompletion: s.enableBasicAutocompletion !== false,
                        enableLiveAutocompletion: s.enableLiveAutocompletion !== false,
                        enableSnippets: s.enableSnippets !== false
                    });
                }
            } catch (e) {
                // 如果 language_tools 未加载，忽略错误
                console.warn('[ZeroIDE] 无法设置代码补全选项:', e);
            }
            
            // 设置语言模式（根据文件扩展名）
            if (this.activeFile) {
                this._setLanguageMode(this.activeFile);
            }
            
            // 强制更新渲染，确保所有设置生效
            this.editor.renderer.updateFull();
        },
        
        /**
         * 设置语言模式
         */
        _setLanguageMode: function(filePath) {
            if (!this.editor || !filePath) return;
            
            // 安全地获取文件扩展名
            const parts = filePath.split('.');
            const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
            const modeMap = {
                'js': 'javascript',
                'jsx': 'jsx',
                'ts': 'typescript',
                'tsx': 'tsx',
                'html': 'html',
                'css': 'css',
                'json': 'json',
                'xml': 'xml',
                'md': 'markdown',
                'py': 'python',
                'java': 'java',
                'cpp': 'cpp',
                'c': 'c',
                'h': 'c_cpp',
                'php': 'php',
                'sql': 'sql',
                'sh': 'sh',
                'bat': 'batchfile',
                'yml': 'yaml',
                'yaml': 'yaml'
            };
            
            const mode = modeMap[ext] || 'text';
            const modePath = `ace/mode/${mode}`;
            
            // Ace Editor 的 setMode 是异步的，需要等待模式加载完成
            this.editor.session.setMode(modePath, () => {
                // 模式加载完成后，更新补全器（如果需要）
                this._updateCompletersForMode(mode);
                // 触发重新渲染以确保语法高亮正确显示
                this.editor.renderer.updateFull();
            });
        },
        
        /**
         * 根据语言模式更新补全器
         */
        _updateCompletersForMode: function(mode) {
            if (!this.editor || !this.ace) return;
            
            try {
                // 尝试获取 language_tools
                if (this.ace.require) {
                    const langTools = this.ace.require('ace/ext/language_tools');
                    if (langTools && langTools.setCompleters) {
                        const completers = [
                            langTools.textCompleter,
                            langTools.keyWordCompleter,
                            langTools.snippetCompleter
                        ];
                        
                        // 为特定语言添加专门的补全器
                        if (mode === 'javascript' || mode === 'jsx') {
                            // JavaScript 模式：使用 JavaScript 补全器
                            try {
                                const jsCompleter = this._createJavaScriptCompleter();
                                if (jsCompleter) {
                                    completers.push(jsCompleter);
                                }
                            } catch (e) {
                                console.warn('[ZeroIDE] 无法创建 JavaScript 补全器:', e);
                            }
                        } else if (mode === 'css') {
                            // CSS 模式：使用 CSS 补全器
                            try {
                                const cssCompleter = this._createCSSCompleter();
                                if (cssCompleter) {
                                    completers.push(cssCompleter);
                                }
                            } catch (e) {
                                console.warn('[ZeroIDE] 无法创建 CSS 补全器:', e);
                            }
                        }
                        
                        langTools.setCompleters(completers.filter(Boolean));
                    }
                }
            } catch (e) {
                console.warn('[ZeroIDE] 更新补全器失败:', e);
            }
        },
        
        /**
         * 创建 JavaScript 补全器
         */
        _createJavaScriptCompleter: function() {
            if (!this.ace) return null;
            
            // JavaScript 关键字和常用 API
            const jsKeywords = [
                'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
                'return', 'true', 'false', 'null', 'undefined', 'this', 'new', 'class', 'extends', 'super', 'static',
                'async', 'await', 'try', 'catch', 'finally', 'throw', 'import', 'export', 'default', 'from', 'as',
                'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'yield', 'get', 'set', 'constructor', 'prototype'
            ];
            
            const jsAPIs = [
                'console', 'document', 'window', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
                'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Promise', 'Set', 'Map',
                'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
                'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'
            ];
            
            const completions = [...jsKeywords, ...jsAPIs].map(word => ({
                caption: word,
                snippet: word,
                meta: 'JavaScript',
                type: 'keyword'
            }));
            
            return {
                getCompletions: (editor, session, pos, prefix, callback) => {
                    callback(null, completions.filter(item => 
                        item.caption.toLowerCase().startsWith(prefix.toLowerCase())
                    ));
                }
            };
        },
        
        /**
         * 创建 CSS 补全器
         */
        _createCSSCompleter: function() {
            if (!this.ace) return null;
            
            // CSS 属性和值
            const cssProperties = [
                'color', 'background', 'background-color', 'background-image', 'background-position', 'background-repeat', 'background-size',
                'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
                'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                'border', 'border-width', 'border-style', 'border-color', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left',
                'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
                'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
                'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'flex-grow', 'flex-shrink', 'flex-basis',
                'grid', 'grid-template-columns', 'grid-template-rows', 'grid-gap', 'grid-column', 'grid-row',
                'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height',
                'text-align', 'text-decoration', 'text-transform', 'text-indent', 'text-shadow',
                'opacity', 'visibility', 'overflow', 'overflow-x', 'overflow-y', 'cursor',
                'transition', 'transform', 'animation', 'box-shadow', 'outline'
            ];
            
            const cssValues = [
                'auto', 'none', 'inherit', 'initial', 'unset', 'transparent',
                'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset',
                'static', 'relative', 'absolute', 'fixed', 'sticky',
                'block', 'inline', 'inline-block', 'flex', 'grid', 'table', 'table-cell', 'table-row',
                'row', 'column', 'row-reverse', 'column-reverse',
                'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly',
                'normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900',
                'left', 'right', 'center', 'justify',
                'uppercase', 'lowercase', 'capitalize', 'none'
            ];
            
            const completions = [
                ...cssProperties.map(prop => ({
                    caption: prop,
                    snippet: `${prop}: $0;`,
                    meta: 'CSS Property',
                    type: 'property'
                })),
                ...cssValues.map(val => ({
                    caption: val,
                    snippet: val,
                    meta: 'CSS Value',
                    type: 'value'
                }))
            ];
            
            return {
                getCompletions: (editor, session, pos, prefix, callback) => {
                    callback(null, completions.filter(item => 
                        item.caption.toLowerCase().startsWith(prefix.toLowerCase())
                    ));
                }
            };
        },
        
        /**
         * 打开工作空间选择器
         */
        _openWorkspaceSelector: async function() {
            if (typeof ProcessManager === 'undefined') {
                this._showError('ProcessManager 不可用');
                return;
            }
            
            try {
                const fileManagerPid = await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'folder-selector',
                    onFolderSelected: async (folderItem) => {
                        if (folderItem && folderItem.path) {
                            await this._openWorkspace(folderItem.path);
                        }
                    }
                });
            } catch (error) {
                this._showError(`打开工作空间选择器失败: ${error.message}`);
            }
        },
        
        /**
         * 规范化路径（移除双斜杠，统一格式）
         */
        _normalizePath: function(path) {
            if (!path) return path;
            
            // 处理 Windows 盘符后的双斜杠（如 C:// -> C:/）
            path = path.replace(/^([CD]):\/\//, '$1:/');
            
            // 将其他多个连续斜杠替换为单个斜杠
            path = path.replace(/\/+/g, '/');
            
            // 移除尾部斜杠（但保留根路径，如 C:/）
            if (path.length > 3 && path.endsWith('/') && !path.match(/^[CD]:\/$/)) {
                path = path.slice(0, -1);
            }
            
            return path;
        },
        
        /**
         * 打开工作空间
         */
        _openWorkspace: async function(workspacePath) {
            // 规范化路径
            workspacePath = this._normalizePath(workspacePath);
            this.workspacePath = workspacePath;
            this.workspaceName = workspacePath.split('/').pop() || workspacePath;
            
            // 更新工作空间信息
            if (this.workspaceInfo) {
                this.workspaceInfo.textContent = `工作空间: ${this.workspaceName}`;
            }
            
            // 加载文件树
            await this._loadFileTree();
        },
        
        /**
         * 加载文件树
         */
        _loadFileTree: async function() {
            if (!this.workspacePath) return;
            
            try {
                const files = await this._listDirectory(this.workspacePath);
                this._renderFileTree(files);
            } catch (error) {
                this._showError(`加载文件树失败: ${error.message}`);
            }
        },
        
        /**
         * 列出目录
         */
        _listDirectory: async function(path) {
            // 规范化路径
            path = this._normalizePath(path);
            
            const url = new URL('/service/FSDirve.php', window.location.origin);
            url.searchParams.set('action', 'list_dir'); // 注意：FSDirve.php 使用 'list_dir' 而不是 'list_directory'
            url.searchParams.set('path', path);
            
            const response = await fetch(url.toString());
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${errorText || '列出目录失败'}`);
            }
            
            const result = await response.json();
            if (result.status !== 'success') {
                throw new Error(result.message || '列出目录失败');
            }
            
            // 确保返回的是数组，处理空文件夹的情况
            if (!result.data) {
                return [];
            }
            
            // 如果 data 是对象且包含 items 属性，返回 items
            if (result.data.items && Array.isArray(result.data.items)) {
                return result.data.items;
            }
            
            // 如果 data 本身就是数组，直接返回
            if (Array.isArray(result.data)) {
                return result.data;
            }
            
            // 其他情况返回空数组
            return [];
        },
        
        /**
         * 渲染文件树（VSCode 风格，实时构建）
         */
        _renderFileTree: function(files) {
            this.fileTreeContainer.innerHTML = '';
            
            // 确保 files 是数组
            if (!files || !Array.isArray(files)) {
                files = [];
            }
            
            const tree = document.createElement('div');
            tree.className = 'zeroide-file-tree-items';
            
            // 如果是空文件夹，显示提示信息
            if (files.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'zeroide-tree-empty';
                emptyMessage.style.cssText = `
                    padding: 8px;
                    color: #858585;
                    font-size: 11px;
                    text-align: center;
                    font-style: italic;
                `;
                emptyMessage.textContent = '（空文件夹）';
                tree.appendChild(emptyMessage);
            } else {
                // 排序：文件夹在前，文件在后
                const sortedFiles = [...files].sort((a, b) => {
                    if (a.type === 'directory' && b.type !== 'directory') return -1;
                    if (a.type !== 'directory' && b.type === 'directory') return 1;
                    return a.name.localeCompare(b.name);
                });
                
                sortedFiles.forEach(item => {
                    const node = this._createFileTreeNode(item);
                    // 根级别节点，无缩进
                    node.style.paddingLeft = '0px';
                    tree.appendChild(node);
                });
            }
            
            this.fileTreeContainer.appendChild(tree);
        },
        
        /**
         * 创建操作按钮（用于侧边栏标题栏）
         */
        _createActionButton: function(icon, title, onClick) {
            const btn = document.createElement('button');
            btn.className = 'zeroide-action-btn';
            btn.textContent = icon;
            btn.title = title;
            btn.style.cssText = `
                width: 22px;
                height: 22px;
                padding: 0;
                margin: 0;
                background: transparent;
                border: none;
                color: #cccccc;
                cursor: pointer;
                border-radius: 3px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                opacity: 0.7;
                transition: opacity 0.2s, background 0.2s;
            `;
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#3e3e3e';
                btn.style.opacity = '1';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
                btn.style.opacity = '0.7';
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
            });
            return btn;
        },
        
        /**
         * 创建文件树节点（VSCode 风格）
         */
        _createFileTreeNode: function(item) {
            const node = document.createElement('div');
            node.className = 'zeroide-file-tree-node';
            node.dataset.path = item.path;
            node.dataset.type = item.type;
            node.style.cssText = `
                display: flex;
                align-items: center;
                padding: 2px 4px;
                cursor: pointer;
                user-select: none;
                position: relative;
                height: 22px;
            `;
            
            // 展开/折叠指示器（仅文件夹）
            if (item.type === 'directory') {
                const expander = document.createElement('span');
                expander.className = 'zeroide-tree-expander';
                expander.style.cssText = `
                    width: 16px;
                    height: 16px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    color: #858585;
                    margin-right: 2px;
                `;
                expander.textContent = '▶';
                node.appendChild(expander);
            } else {
                // 文件不需要展开器，但需要占位
                const spacer = document.createElement('span');
                spacer.style.cssText = `width: 18px; display: inline-block;`;
                node.appendChild(spacer);
            }
            
            const icon = document.createElement('span');
            icon.className = 'zeroide-tree-icon';
            icon.style.cssText = `
                width: 16px;
                height: 16px;
                margin-right: 4px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            `;
            
            if (item.type === 'directory') {
                icon.textContent = '📁';
            } else {
                // 根据文件扩展名显示不同图标
                const ext = item.name.split('.').pop()?.toLowerCase();
                icon.textContent = this._getFileIcon(ext);
            }
            
            const label = document.createElement('span');
            label.className = 'zeroide-tree-label';
            label.textContent = item.name;
            label.style.cssText = `
                flex: 1;
                font-size: 13px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: #cccccc;
            `;
            
            // 操作按钮容器（悬停时显示）
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'zeroide-tree-actions';
            actionsContainer.style.cssText = `
                display: none;
                align-items: center;
                gap: 2px;
                margin-left: auto;
                padding-right: 4px;
            `;
            
            if (item.type === 'directory') {
                const newFileBtn = this._createTreeActionButton('📄', '新建文件', (e) => {
                    e.stopPropagation();
                    this._createNewFileInDirectory(item.path);
                });
                const newFolderBtn = this._createTreeActionButton('📁', '新建文件夹', (e) => {
                    e.stopPropagation();
                    this._createNewFolderInDirectory(item.path);
                });
                const deleteBtn = this._createTreeActionButton('🗑️', '删除', (e) => {
                    e.stopPropagation();
                    this._deleteItem(item.path, item.type);
                });
                actionsContainer.appendChild(newFileBtn);
                actionsContainer.appendChild(newFolderBtn);
                actionsContainer.appendChild(deleteBtn);
            } else {
                const deleteBtn = this._createTreeActionButton('🗑️', '删除', (e) => {
                    e.stopPropagation();
                    this._deleteItem(item.path, item.type);
                });
                const renameBtn = this._createTreeActionButton('✏️', '重命名', (e) => {
                    e.stopPropagation();
                    this._renameItem(item.path, item.type);
                });
                actionsContainer.appendChild(renameBtn);
                actionsContainer.appendChild(deleteBtn);
            }
            
            node.appendChild(icon);
            node.appendChild(label);
            node.appendChild(actionsContainer);
            
            // 事件处理
            if (item.type === 'directory') {
                // 单击展开/折叠
                node.addEventListener('click', (e) => {
                    if (e.target.closest('.zeroide-tree-actions')) return;
                    e.stopPropagation();
                    this._toggleDirectory(node, item.path);
                });
                // 双击进入
                node.addEventListener('dblclick', async (e) => {
                    e.stopPropagation();
                    await this._loadDirectory(item.path);
                });
            } else {
                // 单击选中，双击打开
                node.addEventListener('click', (e) => {
                    if (e.target.closest('.zeroide-tree-actions')) return;
                    e.stopPropagation();
                    // 选中文件（高亮显示）
                    this._selectFileTreeNode(node);
                });
                node.addEventListener('dblclick', async (e) => {
                    e.stopPropagation();
                    await this._openFile(item.path);
                });
            }
            
            // 悬停显示操作按钮
            node.addEventListener('mouseenter', () => {
                node.style.background = '#2a2d2e';
                actionsContainer.style.display = 'flex';
            });
            node.addEventListener('mouseleave', () => {
                node.style.background = 'transparent';
                actionsContainer.style.display = 'none';
            });
            
            // 右键菜单
            node.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showFileTreeContextMenu(e, item);
            });
            
            return node;
        },
        
        /**
         * 创建文件树节点操作按钮
         */
        _createTreeActionButton: function(icon, title, onClick) {
            const btn = document.createElement('button');
            btn.textContent = icon;
            btn.title = title;
            btn.style.cssText = `
                width: 18px;
                height: 18px;
                padding: 0;
                margin: 0;
                background: transparent;
                border: none;
                color: #cccccc;
                cursor: pointer;
                border-radius: 2px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                opacity: 0.8;
            `;
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#3e3e3e';
                btn.style.opacity = '1';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
                btn.style.opacity = '0.8';
            });
            btn.addEventListener('click', onClick);
            return btn;
        },
        
        /**
         * 获取文件图标
         */
        _getFileIcon: function(ext) {
            const iconMap = {
                'js': '📜', 'jsx': '⚛️', 'ts': '📘', 'tsx': '⚛️',
                'html': '🌐', 'css': '🎨', 'scss': '🎨', 'sass': '🎨',
                'json': '📋', 'xml': '📄', 'yaml': '📄', 'yml': '📄',
                'md': '📝', 'txt': '📄', 'log': '📄',
                'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
                'pdf': '📕', 'zip': '📦', 'rar': '📦',
                'py': '🐍', 'java': '☕', 'cpp': '⚙️', 'c': '⚙️',
                'php': '🐘', 'rb': '💎', 'go': '🐹', 'rs': '🦀'
            };
            return iconMap[ext] || '📄';
        },
        
        /**
         * 切换目录展开/折叠（VSCode 风格，实时加载）
         */
        _toggleDirectory: async function(node, path) {
            const isExpanded = node.dataset.expanded === 'true';
            const expander = node.querySelector('.zeroide-tree-expander');
            
            if (isExpanded) {
                // 折叠：移除子节点
                const children = node.parentNode.querySelectorAll(`[data-parent-path="${path}"]`);
                children.forEach(child => child.remove());
                node.dataset.expanded = 'false';
                if (expander) expander.textContent = '▶';
                const icon = node.querySelector('.zeroide-tree-icon');
                if (icon) icon.textContent = '📁';
            } else {
                // 展开：实时加载子节点
                try {
                    // 规范化路径
                    path = this._normalizePath(path);
                    const files = await this._listDirectory(path);
                    
                    // 确保 files 是数组
                    const fileArray = Array.isArray(files) ? files : [];
                    
                    // 计算缩进（基于父节点的缩进）
                    const parentPadding = parseInt(node.style.paddingLeft || '0') || 0;
                    const childPadding = parentPadding + 16;
                    
                    if (fileArray.length === 0) {
                        // 空文件夹：显示提示信息
                        const emptyNode = document.createElement('div');
                        emptyNode.className = 'zeroide-tree-empty';
                        emptyNode.style.cssText = `
                            padding: 2px 4px 2px ${childPadding + 18}px;
                            color: #858585;
                            font-size: 11px;
                            font-style: italic;
                            height: 22px;
                            display: flex;
                            align-items: center;
                        `;
                        emptyNode.textContent = '（空文件夹）';
                        emptyNode.dataset.parentPath = path;
                        node.parentNode.insertBefore(emptyNode, node.nextSibling);
                    } else {
                        // 排序：文件夹在前，文件在后
                        const sortedFiles = [...fileArray].sort((a, b) => {
                            if (a.type === 'directory' && b.type !== 'directory') return -1;
                            if (a.type !== 'directory' && b.type === 'directory') return 1;
                            return a.name.localeCompare(b.name);
                        });
                        
                        sortedFiles.forEach(item => {
                            const childNode = this._createFileTreeNode(item);
                            childNode.dataset.parentPath = path;
                            childNode.style.paddingLeft = `${childPadding}px`;
                            node.parentNode.insertBefore(childNode, node.nextSibling);
                        });
                    }
                    
                    node.dataset.expanded = 'true';
                    if (expander) expander.textContent = '▼';
                    const icon = node.querySelector('.zeroide-tree-icon');
                    if (icon) icon.textContent = '📂';
                } catch (error) {
                    this._showError(`加载目录失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 选中文件树节点
         */
        _selectFileTreeNode: function(node) {
            // 移除所有选中状态
            const allNodes = this.fileTreeContainer.querySelectorAll('.zeroide-file-tree-node');
            allNodes.forEach(n => {
                n.classList.remove('selected');
                n.style.background = 'transparent';
            });
            
            // 添加选中状态
            node.classList.add('selected');
            node.style.background = '#37373d';
        },
        
        /**
         * 加载目录（导航到新目录）
         */
        _loadDirectory: async function(path) {
            this.workspacePath = path;
            this.workspaceName = path.split('/').pop() || path;
            
            // 更新工作空间信息
            if (this.workspaceInfo) {
                this.workspaceInfo.textContent = `工作空间: ${this.workspaceName}`;
            }
            
            // 重新加载文件树
            await this._loadFileTree();
        },
        
        /**
         * 打开文件
         */
        _openFile: async function(filePath, isNew = false) {
            // 检查是否已打开
            if (this.openFiles.has(filePath)) {
                this._switchToFile(filePath);
                return;
            }
            
            try {
                let content = '';
                
                if (!isNew) {
                    // 读取文件内容
                    content = await this._readFile(filePath);
                }
                
                // 创建标签
                const tab = this._createTab(filePath);
                this.tabsContainer.appendChild(tab);
                
                // 保存文件信息
                this.openFiles.set(filePath, {
                    editor: null, // Ace 编辑器是共享的
                    tab: tab,
                    content: content,
                    modified: isNew // 新建文件标记为已修改
                });
                
                // 切换到该文件
                this._switchToFile(filePath);
                
            } catch (error) {
                this._showError(`打开文件失败: ${error.message}`);
            }
        },
        
        /**
         * 读取文件
         */
        _readFile: async function(filePath) {
            // 规范化路径
            filePath = this._normalizePath(filePath);
            
            const pathParts = filePath.split('/');
            const fileName = pathParts[pathParts.length - 1];
            const parentPath = pathParts.slice(0, -1).join('/') || (filePath.split(':')[0] + ':');
            
            let phpPath = this._normalizePath(parentPath);
            if (/^[CD]:$/.test(phpPath)) {
                phpPath = phpPath + '/';
            }
            
            const url = new URL('/service/FSDirve.php', window.location.origin);
            url.searchParams.set('action', 'read_file');
            url.searchParams.set('path', phpPath);
            url.searchParams.set('fileName', fileName);
            
            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            if (result.status !== 'success') {
                throw new Error(result.message || '读取文件失败');
            }
            
            // 检查数据结构
            if (!result.data) {
                throw new Error('服务器返回数据格式错误：缺少 data 字段');
            }
            
            // 支持两种数据结构：
            // 1. result.data.content (直接包含内容)
            // 2. result.data 本身就是内容对象，包含 content 字段
            const content = result.data.content !== undefined ? result.data.content : 
                          (typeof result.data === 'string' ? result.data : '');
            
            // 如果 content 是 undefined 或 null，返回空字符串
            return content !== undefined && content !== null ? String(content) : '';
        },
        
        /**
         * 创建标签
         */
        _createTab: function(filePath) {
            const fileName = filePath.split('/').pop();
            const tab = document.createElement('div');
            tab.className = 'zeroide-tab';
            tab.style.cssText = `
                display: flex;
                align-items: center;
                padding: 8px 16px;
                background: #2d2d2d;
                border-right: 1px solid #3e3e3e;
                cursor: pointer;
                user-select: none;
                min-width: 120px;
                max-width: 200px;
            `;
            
            const label = document.createElement('span');
            label.textContent = fileName;
            label.style.cssText = `
                flex: 1;
                font-size: 13px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            
            const closeBtn = document.createElement('span');
            closeBtn.textContent = '×';
            closeBtn.style.cssText = `
                margin-left: 8px;
                padding: 2px 6px;
                cursor: pointer;
                border-radius: 3px;
                font-size: 16px;
            `;
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closeFile(filePath);
            });
            
            tab.appendChild(label);
            tab.appendChild(closeBtn);
            
            tab.addEventListener('click', () => {
                this._switchToFile(filePath);
            });
            
            return tab;
        },
        
        /**
         * 更新标签
         */
        _updateTab: function(tab) {
            const label = tab.querySelector('span:first-child');
            if (label) {
                const filePath = Array.from(this.openFiles.entries()).find(([path, info]) => info.tab === tab)?.[0];
                if (filePath) {
                    const fileInfo = this.openFiles.get(filePath);
                    const fileName = filePath.split('/').pop();
                    label.textContent = fileInfo.modified ? `● ${fileName}` : fileName;
                }
            }
        },
        
        /**
         * 切换到文件
         */
        _switchToFile: function(filePath) {
            const fileInfo = this.openFiles.get(filePath);
            if (!fileInfo) return;
            
            // 更新活动文件
            this.activeFile = filePath;
            
            // 更新标签样式
            Array.from(this.openFiles.values()).forEach(info => {
                info.tab.style.background = '#2d2d2d';
            });
            fileInfo.tab.style.background = '#1e1e1e';
            
            // 更新编辑器内容
            if (this.editor) {
                this.editor.setValue(fileInfo.content);
                this.editor.clearSelection();
                this._setLanguageMode(filePath);
            }
            
            this._updateStatusBar();
        },
        
        /**
         * 关闭文件
         */
        _closeFile: async function(filePath) {
            const fileInfo = this.openFiles.get(filePath);
            if (!fileInfo) return;
            
            // 检查是否有未保存的更改
            if (fileInfo.modified) {
                let confirmed = false;
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                    confirmed = await GUIManager.showConfirm(
                        `文件 ${filePath.split('/').pop()} 有未保存的更改，确定要关闭吗？`,
                        '确认关闭',
                        'warning'
                    );
                } else {
                    confirmed = confirm(`文件 ${filePath.split('/').pop()} 有未保存的更改，确定要关闭吗？`);
                }
                if (!confirmed) return;
            }
            
            // 移除标签
            fileInfo.tab.remove();
            
            // 从打开文件列表中移除
            this.openFiles.delete(filePath);
            
            // 如果关闭的是活动文件，切换到其他文件
            if (this.activeFile === filePath) {
                const remainingFiles = Array.from(this.openFiles.keys());
                if (remainingFiles.length > 0) {
                    this._switchToFile(remainingFiles[0]);
                } else {
                    this.activeFile = null;
                    if (this.editor) {
                        this.editor.setValue('');
                    }
                }
            }
        },
        
        /**
         * 保存文件
         */
        _saveFile: async function(filePath) {
            if (!filePath) filePath = this.activeFile;
            if (!filePath) return;
            
            const fileInfo = this.openFiles.get(filePath);
            if (!fileInfo) return;
            
            try {
                // 获取当前内容
                const content = this.editor ? this.editor.getValue() : fileInfo.content;
                
                // 保存文件
                await this._writeFile(filePath, content);
                
                // 更新状态
                fileInfo.content = content;
                fileInfo.modified = false;
                this._updateTab(fileInfo.tab);
                
                this._updateStatusBar('文件已保存');
                
            } catch (error) {
                this._showError(`保存文件失败: ${error.message}`);
            }
        },
        
        /**
         * 写入文件
         */
        _writeFile: async function(filePath, content) {
            if (!filePath) {
                throw new Error('文件路径不能为空');
            }
            
            // 规范化路径
            filePath = this._normalizePath(filePath);
            
            if (content === undefined || content === null) {
                content = '';
            }
            
            const pathParts = filePath.split('/');
            const fileName = pathParts[pathParts.length - 1];
            if (!fileName) {
                throw new Error('无效的文件路径');
            }
            const parentPath = pathParts.slice(0, -1).join('/') || (filePath.split(':')[0] + ':');
            
            let phpPath = this._normalizePath(parentPath);
            if (/^[CD]:$/.test(phpPath)) {
                phpPath = phpPath + '/';
            }
            
            const url = new URL('/service/FSDirve.php', window.location.origin);
            url.searchParams.set('action', 'write_file');
            url.searchParams.set('path', phpPath);
            url.searchParams.set('fileName', fileName);
            url.searchParams.set('writeMod', 'overwrite');
            
            // 使用 JSON 格式发送 POST 请求（FSDirve.php 期望 JSON 格式）
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: content })
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${errorText || '写入文件失败'}`);
            }
            
            const result = await response.json();
            if (result.status !== 'success') {
                throw new Error(result.message || '写入文件失败');
            }
            
            // 验证保存成功
            if (result.data && result.data.path) {
                console.log(`[ZeroIDE] 文件保存成功: ${result.data.path}`);
            }
        },
        
        /**
         * 更新状态栏
         */
        _updateStatusBar: function(message) {
            if (message) {
                this.statusBar.textContent = message;
                return;
            }
            
            if (!this.editor || !this.activeFile) {
                this.statusBar.textContent = '就绪';
                return;
            }
            
            const cursor = this.editor.getCursorPosition();
            const line = cursor.row + 1;
            const col = cursor.column + 1;
            const fileInfo = this.openFiles.get(this.activeFile);
            const modified = fileInfo && fileInfo.modified ? ' • 已修改' : '';
            
            this.statusBar.textContent = `行 ${line}, 列 ${col}${modified}`;
        },
        
        /**
         * 菜单项功能实现
         */
        _newFile: async function() {
            let fileName = null;
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                fileName = await GUIManager.showPrompt('请输入文件名:', '新建文件', 'untitled');
            } else {
                fileName = prompt('请输入文件名:', 'untitled');
            }
            if (fileName) {
                const filePath = this.workspacePath ? `${this.workspacePath}/${fileName}` : `C:/${fileName}`;
                await this._openFile(filePath, true); // true 表示新建文件
            }
        },
        
        _undo: function() {
            if (this.editor) {
                this.editor.undo();
            }
        },
        
        _redo: function() {
            if (this.editor) {
                this.editor.redo();
            }
        },
        
        _cut: function() {
            if (this.editor) {
                const selectedText = this.editor.getSelectedText();
                if (selectedText) {
                    // 复制到剪贴板
                    navigator.clipboard.writeText(selectedText).catch(() => {});
                    // 删除选中内容
                    this.editor.remove(this.editor.getSelectionRange());
                }
            }
        },
        
        _copy: function() {
            if (this.editor) {
                const selectedText = this.editor.getSelectedText();
                if (selectedText) {
                    navigator.clipboard.writeText(selectedText).catch(() => {});
                }
            }
        },
        
        _paste: function() {
            if (this.editor) {
                navigator.clipboard.readText().then(text => {
                    this.editor.insert(text);
                }).catch(() => {
                    // 降级方案：使用空字符串
                    this.editor.insert('');
                });
            }
        },
        
        _find: function() {
            if (this.editor && this.ace) {
                this.editor.execCommand('find');
            }
        },
        
        _replace: function() {
            if (this.editor && this.ace) {
                this.editor.execCommand('replace');
            }
        },
        
        _selectAll: function() {
            if (this.editor) {
                this.editor.selectAll();
            }
        },
        
        _saveAsFile: async function() {
            let fileName = null;
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                fileName = await GUIManager.showPrompt(
                    '请输入新文件名:',
                    '另存为',
                    this.activeFile ? this.activeFile.split('/').pop() : 'untitled'
                );
            } else {
                fileName = prompt('请输入新文件名:', this.activeFile ? this.activeFile.split('/').pop() : 'untitled');
            }
            if (fileName) {
                const newPath = this.workspacePath ? `${this.workspacePath}/${fileName}` : `C:/${fileName}`;
                await this._saveFile(newPath);
                // 如果当前文件已打开，关闭它并打开新文件
                if (this.activeFile && this.activeFile !== newPath) {
                    await this._closeFile(this.activeFile);
                    await this._openFile(newPath);
                }
            }
        },
        
        _closeAllFiles: async function() {
            const files = Array.from(this.openFiles.keys());
            for (const filePath of files) {
                await this._closeFile(filePath);
            }
        },
        
        _exit: function() {
            if (typeof ProcessManager !== 'undefined') {
                ProcessManager.killProgram(this.pid);
            }
        },
        
        _showCommandPalette: function() {
            // TODO: 实现命令面板
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                GUIManager.showAlert('命令面板功能待实现', '提示', 'info');
            }
        },
        
        _toggleSidebar: function() {
            if (this.sidebar) {
                const isVisible = this.sidebar.style.display !== 'none';
                this.sidebar.style.display = isVisible ? 'none' : 'flex';
            }
        },
        
        _toggleTerminal: function() {
            // TODO: 实现终端切换
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                GUIManager.showAlert('终端功能待实现', '提示', 'info');
            }
        },
        
        _zoomIn: function() {
            if (this.editor) {
                const currentSize = this.settings.fontSize || 14;
                this.settings.fontSize = Math.min(currentSize + 1, 30);
                this._applySettings();
            }
        },
        
        _zoomOut: function() {
            if (this.editor) {
                const currentSize = this.settings.fontSize || 14;
                this.settings.fontSize = Math.max(currentSize - 1, 10);
                this._applySettings();
            }
        },
        
        _resetZoom: function() {
            if (this.editor) {
                this.settings.fontSize = 14;
                this._applySettings();
            }
        },
        
        _showKeybindings: function() {
            // TODO: 实现快捷键设置窗口
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                GUIManager.showAlert('快捷键设置功能待实现', '提示', 'info');
            }
        },
        
        _showThemeSelector: function() {
            this._showSettings();
        },
        
        _showAbout: function() {
            // 创建关于窗口
            const aboutWindow = document.createElement('div');
            aboutWindow.className = 'zeroide-about-window zos-gui-window';
            aboutWindow.style.cssText = `
                display: flex;
                flex-direction: column;
                width: 500px;
                height: 400px;
                background: #1e1e1e;
                color: #cccccc;
            `;
            
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('zeroide');
                }
                
                GUIManager.registerWindow(this.pid, aboutWindow, {
                    title: '关于 ZeroIDE',
                    icon: icon,
                    onClose: () => {
                        aboutWindow.remove();
                    }
                });
            }
            
            const content = document.createElement('div');
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px;
                text-align: center;
            `;
            
            const title = document.createElement('h1');
            title.textContent = 'ZeroIDE';
            title.style.cssText = `font-size: 32px; margin: 0 0 10px 0;`;
            
            const version = document.createElement('p');
            version.textContent = '版本 1.0.0';
            version.style.cssText = `font-size: 14px; color: #888; margin: 0 0 30px 0;`;
            
            const desc = document.createElement('p');
            desc.textContent = '基于 Ace Editor 的完整代码编辑器\n支持代码高亮、补全、多文件编辑等功能';
            desc.style.cssText = `font-size: 13px; line-height: 1.6; color: #aaa; margin: 0;`;
            
            content.appendChild(title);
            content.appendChild(version);
            content.appendChild(desc);
            aboutWindow.appendChild(content);
            
            const guiContainer = document.getElementById('gui-container');
            if (guiContainer) {
                guiContainer.appendChild(aboutWindow);
            }
        },
        
        _showShortcuts: function() {
            // TODO: 实现快捷键参考窗口
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                GUIManager.showAlert('快捷键参考功能待实现', '提示', 'info');
            }
        },
        
        /**
         * 显示设置（独立窗口）
         */
        _showSettings: function() {
            // 如果设置窗口已存在，聚焦它
            if (this.settingsWindow) {
                if (typeof GUIManager !== 'undefined') {
                    const windowInfo = GUIManager.getWindowInfo(this.settingsWindow.dataset.windowId);
                    if (windowInfo) {
                        GUIManager.focusWindow(windowInfo.windowId);
                    }
                }
                return;
            }
            
            // 创建新的设置窗口
            const settingsWindow = document.createElement('div');
            settingsWindow.className = 'zeroide-settings-window zos-gui-window';
            settingsWindow.style.cssText = `
                display: flex;
                flex-direction: column;
                width: 700px;
                height: 600px;
                min-width: 500px;
                min-height: 400px;
                background: #1e1e1e;
                color: #cccccc;
            `;
            
            // 注册窗口到 GUIManager
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('zeroide');
                }
                
                const windowInfo = GUIManager.registerWindow(this.pid, settingsWindow, {
                    title: '设置 - ZeroIDE',
                    icon: icon,
                    onClose: () => {
                        this.settingsWindow = null;
                    }
                });
                
                settingsWindow.dataset.windowId = windowInfo.windowId;
            }
            
            // 创建窗口内容
            const windowContent = document.createElement('div');
            windowContent.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                padding: 20px;
            `;
            
            const header = document.createElement('div');
            header.style.cssText = `
                margin-bottom: 20px;
            `;
            
            const title = document.createElement('h2');
            title.textContent = '设置';
            title.style.cssText = `
                margin: 0;
                font-size: 18px;
            `;
            header.appendChild(title);
            
            const scrollContent = document.createElement('div');
            scrollContent.style.cssText = `
                flex: 1;
                overflow-y: auto;
            `;
            
            // 主题设置
            const themeGroup = this._createSettingGroup('主题', [
                this._createSelectSetting('编辑器主题', 'theme', [
                    { value: 'monokai', label: 'Monokai' },
                    { value: 'github', label: 'GitHub' },
                    { value: 'tomorrow', label: 'Tomorrow' },
                    { value: 'tomorrow_night', label: 'Tomorrow Night' },
                    { value: 'xcode', label: 'Xcode' },
                    { value: 'textmate', label: 'TextMate' }
                ])
            ]);
            
            // 编辑器设置
            const editorGroup = this._createSettingGroup('编辑器', [
                this._createNumberSetting('字体大小', 'fontSize', 10, 30),
                this._createTextSetting('字体', 'fontFamily'),
                this._createNumberSetting('Tab 大小', 'tabSize', 1, 8),
                this._createCheckboxSetting('使用空格代替 Tab', 'useSoftTabs'),
                this._createCheckboxSetting('自动换行', 'wordWrap'),
                this._createCheckboxSetting('显示行号', 'showLineNumbers'),
                this._createCheckboxSetting('高亮当前行', 'highlightActiveLine'),
                this._createCheckboxSetting('启用代码补全', 'enableLiveAutocompletion')
            ]);
            
            scrollContent.appendChild(themeGroup);
            scrollContent.appendChild(editorGroup);
            
            const footer = document.createElement('div');
            footer.style.cssText = `
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid #3e3e3e;
            `;
            
            const saveBtn = document.createElement('button');
            saveBtn.textContent = '保存';
            saveBtn.style.cssText = `
                padding: 8px 16px;
                background: #007acc;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            `;
            saveBtn.addEventListener('click', () => {
                this._saveSettings();
                // 关闭窗口
                if (typeof GUIManager !== 'undefined' && this.settingsWindow) {
                    const windowInfo = GUIManager.getWindowInfo(this.settingsWindow.dataset.windowId);
                    if (windowInfo) {
                        // 使用 unregisterWindow 关闭窗口
                        GUIManager.unregisterWindow(windowInfo.windowId);
                    }
                }
            });
            
            footer.appendChild(saveBtn);
            
            windowContent.appendChild(header);
            windowContent.appendChild(scrollContent);
            windowContent.appendChild(footer);
            
            settingsWindow.appendChild(windowContent);
            
            // 添加到 GUI 容器
            const guiContainer = typeof document !== 'undefined' ? document.getElementById('gui-container') : null;
            if (guiContainer) {
                guiContainer.appendChild(settingsWindow);
            }
            
            this.settingsWindow = settingsWindow;
        },
        
        /**
         * 创建设置组
         */
        _createSettingGroup: function(title, settings) {
            const group = document.createElement('div');
            group.style.cssText = `
                margin-bottom: 24px;
            `;
            
            const titleEl = document.createElement('h3');
            titleEl.textContent = title;
            titleEl.style.cssText = `
                margin: 0 0 12px 0;
                font-size: 14px;
                color: #cccccc;
            `;
            group.appendChild(titleEl);
            
            settings.forEach(setting => {
                group.appendChild(setting);
            });
            
            return group;
        },
        
        /**
         * 创建选择设置
         */
        _createSelectSetting: function(label, key, options) {
            const container = document.createElement('div');
            container.style.cssText = `
                margin-bottom: 12px;
            `;
            
            const labelEl = document.createElement('label');
            labelEl.textContent = label;
            labelEl.style.cssText = `
                display: block;
                margin-bottom: 4px;
                font-size: 13px;
            `;
            
            const select = document.createElement('select');
            select.style.cssText = `
                width: 100%;
                padding: 6px;
                background: #1e1e1e;
                border: 1px solid #3e3e3e;
                color: #cccccc;
                border-radius: 4px;
            `;
            
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                if (this.settings[key] === opt.value) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            
            select.addEventListener('change', () => {
                this.settings[key] = select.value;
                // 实时应用设置
                this._applySettings();
            });
            
            container.appendChild(labelEl);
            container.appendChild(select);
            
            return container;
        },
        
        /**
         * 创建数字设置
         */
        _createNumberSetting: function(label, key, min, max) {
            const container = document.createElement('div');
            container.style.cssText = `
                margin-bottom: 12px;
            `;
            
            const labelEl = document.createElement('label');
            labelEl.textContent = label;
            labelEl.style.cssText = `
                display: block;
                margin-bottom: 4px;
                font-size: 13px;
            `;
            
            const input = document.createElement('input');
            input.type = 'number';
            input.min = min;
            input.max = max;
            input.value = this.settings[key];
            input.style.cssText = `
                width: 100%;
                padding: 6px;
                background: #1e1e1e;
                border: 1px solid #3e3e3e;
                color: #cccccc;
                border-radius: 4px;
            `;
            
            input.addEventListener('change', () => {
                this.settings[key] = parseInt(input.value);
                // 实时应用设置
                this._applySettings();
            });
            
            container.appendChild(labelEl);
            container.appendChild(input);
            
            return container;
        },
        
        /**
         * 创建文本设置
         */
        _createTextSetting: function(label, key) {
            const container = document.createElement('div');
            container.style.cssText = `
                margin-bottom: 12px;
            `;
            
            const labelEl = document.createElement('label');
            labelEl.textContent = label;
            labelEl.style.cssText = `
                display: block;
                margin-bottom: 4px;
                font-size: 13px;
            `;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = this.settings[key];
            input.style.cssText = `
                width: 100%;
                padding: 6px;
                background: #1e1e1e;
                border: 1px solid #3e3e3e;
                color: #cccccc;
                border-radius: 4px;
            `;
            
            input.addEventListener('change', () => {
                this.settings[key] = input.value;
                // 实时应用设置
                this._applySettings();
            });
            
            container.appendChild(labelEl);
            container.appendChild(input);
            
            return container;
        },
        
        /**
         * 创建复选框设置
         */
        _createCheckboxSetting: function(label, key) {
            const container = document.createElement('div');
            container.style.cssText = `
                margin-bottom: 12px;
                display: flex;
                align-items: center;
            `;
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = this.settings[key];
            input.style.cssText = `
                margin-right: 8px;
            `;
            
            input.addEventListener('change', () => {
                this.settings[key] = input.checked;
                // 实时应用设置
                this._applySettings();
            });
            
            const labelEl = document.createElement('label');
            labelEl.textContent = label;
            labelEl.style.cssText = `
                font-size: 13px;
                cursor: pointer;
            `;
            
            container.appendChild(input);
            container.appendChild(labelEl);
            
            return container;
        },
        
        /**
         * 保存设置
         */
        _saveSettings: function() {
            // 保存到 localStorage
            try {
                localStorage.setItem('zeroide_settings', JSON.stringify(this.settings));
            } catch (e) {
                console.error('保存设置失败:', e);
            }
            
            // 应用设置
            this._applySettings();
        },
        
        /**
         * 加载设置
         */
        _loadSettings: function() {
            try {
                const saved = localStorage.getItem('zeroide_settings');
                if (saved) {
                    this.settings = { ...this.settings, ...JSON.parse(saved) };
                }
            } catch (e) {
                console.error('加载设置失败:', e);
            }
        },
        
        /**
         * 显示错误
         */
        _showError: function(message) {
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                GUIManager.showAlert(message, '错误', 'error');
            } else {
                alert(message);
            }
        },
        
        /**
         * 信息方法
         */
        __info__: function() {
            return {
                name: 'ZeroIDE',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZeroIDE - 基于 Ace Editor 的完整代码编辑器',
                author: 'ZerOS Team',
                copyright: '© 2024',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        },
        
        /**
         * 退出方法
         */
        /**
         * 在工作空间根目录创建新文件
         */
        _createNewFileInWorkspace: async function() {
            if (!this.workspacePath) {
                this._showError('请先打开工作空间');
                return;
            }
            await this._createNewFileInDirectory(this.workspacePath);
        },
        
        /**
         * 在工作空间根目录创建新文件夹
         */
        _createNewFolderInWorkspace: async function() {
            if (!this.workspacePath) {
                this._showError('请先打开工作空间');
                return;
            }
            await this._createNewFolderInDirectory(this.workspacePath);
        },
        
        /**
         * 刷新文件树
         */
        _refreshFileTree: async function() {
            if (!this.workspacePath) return;
            
            // 折叠所有展开的目录
            this._collapseAll();
            
            // 重新加载文件树
            await this._loadFileTree();
        },
        
        /**
         * 折叠所有目录
         */
        _collapseAll: function() {
            const expandedNodes = this.fileTreeContainer.querySelectorAll('[data-expanded="true"]');
            expandedNodes.forEach(node => {
                const path = node.dataset.path;
                if (path) {
                    const children = node.parentNode.querySelectorAll(`[data-parent-path="${path}"]`);
                    children.forEach(child => child.remove());
                    node.dataset.expanded = 'false';
                    const expander = node.querySelector('.zeroide-tree-expander');
                    if (expander) expander.textContent = '▶';
                    const icon = node.querySelector('.zeroide-tree-icon');
                    if (icon) icon.textContent = '📁';
                }
            });
        },
        
        /**
         * 在指定目录创建新文件
         */
        _createNewFileInDirectory: async function(dirPath) {
            if (!dirPath) {
                dirPath = this.workspacePath;
            }
            
            let fileName = null;
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                fileName = await GUIManager.showPrompt('请输入文件名:', '新建文件', 'untitled');
            } else {
                fileName = prompt('请输入文件名:', 'untitled');
            }
            if (!fileName) return;
            
            try {
                // 规范化路径
                dirPath = this._normalizePath(dirPath);
                
                const url = new URL('/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'create_file');
                url.searchParams.set('path', dirPath);
                url.searchParams.set('fileName', fileName);
                url.searchParams.set('content', '');
                
                const response = await fetch(url.toString());
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    throw new Error(errorResult.message || `HTTP ${response.status}`);
                }
                
                const result = await response.json();
                if (result.status !== 'success') {
                    throw new Error(result.message || '创建文件失败');
                }
                
                // 刷新文件树
                await this._refreshDirectoryInTree(dirPath);
                
                // 打开新创建的文件
                const filePath = result.data?.path || `${dirPath}/${fileName}`;
                await this._openFile(filePath, true);
                
            } catch (error) {
                this._showError(`创建文件失败: ${error.message}`);
            }
        },
        
        /**
         * 在指定目录创建新文件夹
         */
        _createNewFolderInDirectory: async function(dirPath) {
            if (!dirPath) {
                dirPath = this.workspacePath;
            }
            
            let folderName = null;
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                folderName = await GUIManager.showPrompt('请输入文件夹名:', '新建文件夹', 'newfolder');
            } else {
                folderName = prompt('请输入文件夹名:', 'newfolder');
            }
            if (!folderName) return;
            
            try {
                // 规范化路径
                dirPath = this._normalizePath(dirPath);
                
                const url = new URL('/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'create_dir');
                url.searchParams.set('path', dirPath);
                url.searchParams.set('name', folderName);
                
                const response = await fetch(url.toString());
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    throw new Error(errorResult.message || `HTTP ${response.status}`);
                }
                
                const result = await response.json();
                if (result.status !== 'success') {
                    throw new Error(result.message || '创建文件夹失败');
                }
                
                // 刷新文件树
                await this._refreshDirectoryInTree(dirPath);
                
            } catch (error) {
                this._showError(`创建文件夹失败: ${error.message}`);
            }
        },
        
        /**
         * 删除项目（文件或文件夹）
         */
        _deleteItem: async function(itemPath, itemType) {
            const itemName = itemPath.split('/').pop();
            let confirmed = false;
            const message = `确定要删除 "${itemName}" 吗？${itemType === 'directory' ? '\n（此操作不可撤销）' : ''}`;
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                confirmed = await GUIManager.showConfirm(
                    message,
                    '确认删除',
                    itemType === 'directory' ? 'danger' : 'warning'
                );
            } else {
                confirmed = confirm(message);
            }
            if (!confirmed) return;
            
            try {
                // 规范化路径
                itemPath = this._normalizePath(itemPath);
                
                const url = new URL('/service/FSDirve.php', window.location.origin);
                
                if (itemType === 'directory') {
                    url.searchParams.set('action', 'delete_dir');
                    url.searchParams.set('path', itemPath);
                } else {
                    const pathParts = itemPath.split('/');
                    const fileName = pathParts[pathParts.length - 1];
                    const parentPath = pathParts.slice(0, -1).join('/') || (itemPath.split(':')[0] + ':');
                    let phpPath = this._normalizePath(parentPath);
                    if (/^[CD]:$/.test(phpPath)) {
                        phpPath = phpPath + '/';
                    }
                    
                    url.searchParams.set('action', 'delete_file');
                    url.searchParams.set('path', phpPath);
                    url.searchParams.set('fileName', fileName);
                }
                
                const response = await fetch(url.toString());
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    throw new Error(errorResult.message || `HTTP ${response.status}`);
                }
                
                const result = await response.json();
                if (result.status !== 'success') {
                    throw new Error(result.message || '删除失败');
                }
                
                // 如果删除的是已打开的文件，关闭它
                if (itemType === 'file' && this.openFiles.has(itemPath)) {
                    await this._closeFile(itemPath);
                }
                
                // 刷新文件树
                const parentPath = itemPath.split('/').slice(0, -1).join('/') || (itemPath.split(':')[0] + ':');
                await this._refreshDirectoryInTree(parentPath);
                
            } catch (error) {
                this._showError(`删除失败: ${error.message}`);
            }
        },
        
        /**
         * 重命名项目
         */
        _renameItem: async function(itemPath, itemType) {
            const oldName = itemPath.split('/').pop();
            let newName = null;
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                newName = await GUIManager.showPrompt('请输入新名称:', '重命名', oldName);
            } else {
                newName = prompt('请输入新名称:', oldName);
            }
            if (!newName || newName === oldName) return;
            
            try {
                // 规范化路径
                itemPath = this._normalizePath(itemPath);
                const pathParts = itemPath.split('/');
                const parentPath = pathParts.slice(0, -1).join('/') || (itemPath.split(':')[0] + ':');
                let phpPath = this._normalizePath(parentPath);
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                const url = new URL('/service/FSDirve.php', window.location.origin);
                
                if (itemType === 'directory') {
                    url.searchParams.set('action', 'rename_dir');
                    url.searchParams.set('path', phpPath);
                    url.searchParams.set('oldName', oldName);
                    url.searchParams.set('newName', newName);
                } else {
                    url.searchParams.set('action', 'rename_file');
                    url.searchParams.set('path', phpPath);
                    url.searchParams.set('oldFileName', oldName);
                    url.searchParams.set('newFileName', newName);
                }
                
                const response = await fetch(url.toString());
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                    throw new Error(errorResult.message || `HTTP ${response.status}`);
                }
                
                const result = await response.json();
                if (result.status !== 'success') {
                    throw new Error(result.message || '重命名失败');
                }
                
                // 如果重命名的是已打开的文件，更新引用
                if (itemType === 'file' && this.openFiles.has(itemPath)) {
                    const newPath = result.data?.path || `${parentPath}/${newName}`;
                    const fileInfo = this.openFiles.get(itemPath);
                    this.openFiles.delete(itemPath);
                    this.openFiles.set(newPath, fileInfo);
                    fileInfo.tab.dataset.path = newPath;
                    this._updateTab(fileInfo.tab);
                    if (this.activeFile === itemPath) {
                        this.activeFile = newPath;
                    }
                }
                
                // 刷新文件树
                await this._refreshDirectoryInTree(parentPath);
                
            } catch (error) {
                this._showError(`重命名失败: ${error.message}`);
            }
        },
        
        /**
         * 刷新文件树中的指定目录
         */
        _refreshDirectoryInTree: async function(dirPath) {
            if (!dirPath) return;
            
            // 规范化路径
            dirPath = this._normalizePath(dirPath);
            
            // 如果是工作空间根目录，刷新整个文件树
            if (dirPath === this.workspacePath) {
                await this._loadFileTree();
                return;
            }
            
            // 查找对应的节点
            const node = this.fileTreeContainer.querySelector(`[data-path="${dirPath}"]`);
            if (node && node.dataset.type === 'directory') {
                // 如果节点已展开，重新加载其子节点
                if (node.dataset.expanded === 'true') {
                    // 先折叠
                    const children = node.parentNode.querySelectorAll(`[data-parent-path="${dirPath}"]`);
                    children.forEach(child => child.remove());
                    node.dataset.expanded = 'false';
                    
                    // 再展开（会重新加载）
                    await this._toggleDirectory(node, dirPath);
                }
            }
        },
        
        /**
         * 显示文件树右键菜单
         */
        _showFileTreeContextMenu: function(e, item) {
            // 关闭当前菜单
            this._hideMenu();
            
            const menu = document.createElement('div');
            menu.className = 'zeroide-menu';
            menu.style.cssText = `
                position: fixed;
                background: #2d2d2d;
                border: 1px solid #3e3e3e;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                z-index: 10001;
                min-width: 180px;
                padding: 4px 0;
                font-size: 13px;
            `;
            
            const items = [];
            
            if (item.type === 'directory') {
                items.push(
                    { label: '新建文件', action: () => this._createNewFileInDirectory(item.path) },
                    { label: '新建文件夹', action: () => this._createNewFolderInDirectory(item.path) },
                    { separator: true },
                    { label: '重命名', action: () => this._renameItem(item.path, item.type) },
                    { label: '删除', action: () => this._deleteItem(item.path, item.type) }
                );
            } else {
                items.push(
                    { label: '打开', action: () => this._openFile(item.path) },
                    { separator: true },
                    { label: '重命名', action: () => this._renameItem(item.path, item.type) },
                    { label: '删除', action: () => this._deleteItem(item.path, item.type) }
                );
            }
            
            items.forEach((menuItem, index) => {
                if (menuItem.separator) {
                    const separator = document.createElement('div');
                    separator.style.cssText = `
                        height: 1px;
                        background: #3e3e3e;
                        margin: 4px 0;
                    `;
                    menu.appendChild(separator);
                } else {
                    const menuItemEl = document.createElement('div');
                    menuItemEl.className = 'zeroide-menu-item';
                    menuItemEl.textContent = menuItem.label;
                    menuItemEl.style.cssText = `
                        padding: 6px 24px 6px 32px;
                        color: #cccccc;
                        cursor: pointer;
                    `;
                    
                    menuItemEl.addEventListener('mouseenter', () => {
                        menuItemEl.style.background = '#37373d';
                    });
                    menuItemEl.addEventListener('mouseleave', () => {
                        menuItemEl.style.background = 'transparent';
                    });
                    menuItemEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (menuItem.action) {
                            menuItem.action();
                        }
                        menu.remove();
                    });
                    
                    menu.appendChild(menuItemEl);
                }
            });
            
            // 设置菜单位置
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
            
            document.body.appendChild(menu);
            this.activeMenu = menu;
            
            // 点击外部关闭菜单
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu, true);
                    document.removeEventListener('mousedown', closeMenu, true);
                }
            };
            
            setTimeout(() => {
                document.addEventListener('click', closeMenu, true);
                document.addEventListener('mousedown', closeMenu, true);
            }, 10);
        },
        
        __exit__: function() {
            return this.__cleanup__();
        },
        
        /**
         * 清理
         */
        __cleanup__: function() {
            // 检查是否有未保存的文件
            const unsavedFiles = [];
            this.openFiles.forEach((fileInfo, filePath) => {
                if (fileInfo.modified) {
                    unsavedFiles.push(filePath);
                }
            });
            
            // 清理资源
            if (this.editor) {
                this.editor.destroy();
                this.editor = null;
            }
            
            // 清理所有打开的文件引用
            this.openFiles.clear();
            
            // 清理设置面板
            if (this.settingsPanel && this.settingsPanel.parentNode) {
                this.settingsPanel.parentNode.removeChild(this.settingsPanel);
                this.settingsPanel = null;
            }
            
            return true;
        }
    };
    
    // 导出到全局（供 ProcessManager 使用）
    if (typeof window !== 'undefined') {
        window.ZEROIDE = ZEROIDE;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.ZEROIDE = ZEROIDE;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

