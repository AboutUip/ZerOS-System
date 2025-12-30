// ZerOS 设置程序
// 提供系统设置管理界面，Windows10风格
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const SETTINGS = {
        pid: null,
        window: null,
        windowId: null,
        
        // 当前选中的分类
        currentCategory: null,
        
        // 设置分类注册表
        categories: new Map(),
        
        // 设置项注册表（按分类组织）
        settings: new Map(),
        
        // 搜索关键词
        searchQuery: '',
        
        // 用户管理页面状态（用于页面切换）
        userManagementPage: 'list', // 'list' | 'create' | 'groups' | 'groupDetail' | 'userGroups'
        userManagementPageData: {}, // 存储页面数据（如当前查看的用户名、组名等）
        
        // 事件处理器ID（用于清理）
        eventHandlers: [],
        
        // 主题变更监听器取消函数
        themeChangeUnsubscribe: null,
        
        // 加载蒙版相关
        _loadingOverlay: null,
        _isLoading: false,
        
        /**
         * 初始化程序
         */
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('SETTINGS', '设置程序初始化');
            }
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'settings-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 使用 GUIManager 注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('settings');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '设置',
                    icon: icon,
                    onClose: () => {
                        // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                        // 窗口关闭由 GUIManager._closeWindow 统一处理
                        // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                        // 这样可以确保程序多实例（不同 PID）互不影响
                    }
                });
                
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 创建窗口内容
            this._createWindowContent();
            
            // 注册默认设置分类和设置项
            this._registerDefaultSettings();
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 注册事件处理器
            this._registerEventHandlers();
            
            // 应用主题
            this._applyTheme();
            
            // 监听主题变更
            this._setupThemeListener();
            
            // 初始化用户管理页面状态
            this.userManagementPage = 'list';
            this.userManagementPageData = {};
            
            // 默认显示第一个分类
            if (this.categories.size > 0) {
                const firstCategory = Array.from(this.categories.keys())[0];
                this._switchCategory(firstCategory);
            }
        },
        
        /**
         * 退出程序
         */
        __exit__: async function() {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('SETTINGS', '设置程序退出');
            }
            
            // 取消主题监听
            if (this.themeChangeUnsubscribe && typeof this.themeChangeUnsubscribe === 'function') {
                this.themeChangeUnsubscribe();
                this.themeChangeUnsubscribe = null;
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
            
            // 清理引用
            this.window = null;
            this.windowId = null;
            this.categories.clear();
            this.settings.clear();
        },
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: '设置',
                type: 'GUI',
                version: '1.0.0',
                description: '系统设置管理',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL,
                    PermissionManager.PERMISSION.THEME_READ,
                    PermissionManager.PERMISSION.THEME_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE
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
            // 创建搜索栏
            const searchBar = this._createSearchBar();
            this.window.appendChild(searchBar);
            
            // 创建主内容区域
            const mainContent = document.createElement('div');
            mainContent.className = 'settings-main-content';
            mainContent.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
                min-height: 0;
            `;
            
            // 创建左侧导航栏
            const navPanel = this._createNavigationPanel();
            mainContent.appendChild(navPanel);
            
            // 创建右侧内容区域
            const contentPanel = this._createContentPanel();
            mainContent.appendChild(contentPanel);
            
            this.window.appendChild(mainContent);
        },
        
        /**
         * 创建搜索栏
         */
        _createSearchBar: function() {
            const searchBar = document.createElement('div');
            searchBar.className = 'settings-search-bar';
            searchBar.style.cssText = `
                height: 60px;
                min-height: 60px;
                max-height: 60px;
                flex: 0 0 60px;
                display: flex;
                align-items: center;
                padding: 0 24px;
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                border-bottom: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                box-sizing: border-box;
            `;
            
            // 搜索图标
            const searchIcon = document.createElement('div');
            searchIcon.className = 'settings-search-icon';
            searchIcon.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3C5.686 3 3 5.686 3 9C3 12.314 5.686 15 9 15C10.657 15 12.157 14.314 13.243 13.243L16.707 16.707C17.098 17.098 17.731 17.098 18.122 16.707C18.513 16.316 18.513 15.683 18.122 15.292L14.657 11.828C15.314 10.743 16 9.243 16 7.586C16 4.272 13.314 1.586 10 1.586H9V3ZM9 5C12.314 5 15 7.686 15 11C15 14.314 12.314 17 9 17C5.686 17 3 14.314 3 11C3 7.686 5.686 5 9 5Z" fill="currentColor"/>
                </svg>
            `;
            searchIcon.style.cssText = `
                width: 20px;
                height: 20px;
                margin-right: 12px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            
            // 搜索输入框
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'settings-search-input';
            searchInput.placeholder = '搜索设置';
            searchInput.style.cssText = `
                flex: 1;
                height: 40px;
                border: none;
                outline: none;
                font-size: 15px;
                color: var(--theme-text, #d7e0dd);
                background: transparent;
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            `;
            
            searchBar.appendChild(searchIcon);
            searchBar.appendChild(searchInput);
            
            // 保存搜索输入框引用
            this.searchInput = searchInput;
            
            return searchBar;
        },
        
        /**
         * 创建导航面板
         */
        _createNavigationPanel: function() {
            const navPanel = document.createElement('div');
            navPanel.className = 'settings-nav-panel';
            navPanel.style.cssText = `
                width: 220px;
                min-width: 220px;
                max-width: 220px;
                flex: 0 0 220px;
                background: var(--theme-background-secondary, var(--theme-background-tertiary, #1a1f28));
                border-right: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                overflow-y: auto;
                overflow-x: hidden;
            `;
            
            // 导航列表容器
            const navList = document.createElement('div');
            navList.className = 'settings-nav-list';
            navList.style.cssText = `
                padding: 8px 0;
            `;
            
            navPanel.appendChild(navList);
            
            // 保存引用
            this.navList = navList;
            this.navPanel = navPanel;
            
            return navPanel;
        },
        
        /**
         * 创建内容面板
         */
        _createContentPanel: function() {
            const contentPanel = document.createElement('div');
            contentPanel.className = 'settings-content-panel';
            contentPanel.style.cssText = `
                flex: 1;
                background: var(--theme-background, #050810);
                overflow-y: auto;
                overflow-x: hidden;
            `;
            
            // 内容容器
            const contentContainer = document.createElement('div');
            contentContainer.className = 'settings-content-container';
            contentContainer.style.cssText = `
                padding: 48px 24px;
                max-width: 1200px;
                margin: 0 auto;
            `;
            
            contentPanel.appendChild(contentContainer);
            
            // 保存引用
            this.contentContainer = contentContainer;
            this.contentPanel = contentPanel;
            
            return contentPanel;
        },
        
        /**
         * 注册事件处理器
         */
        _registerEventHandlers: function() {
            if (typeof EventManager === 'undefined') {
                return;
            }
            
            // 搜索输入框事件
            if (this.searchInput) {
                const inputHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    this.searchInput,
                    'input',
                    (e) => {
                        this.searchQuery = e.target.value.trim();
                        this._handleSearch();
                    }
                );
                this.eventHandlers.push(inputHandlerId);
            }
        },
        
        /**
         * 注册设置分类
         * @param {string} categoryId 分类ID
         * @param {Object} categoryInfo 分类信息 { name, icon, description? }
         */
        registerCategory: function(categoryId, categoryInfo) {
            if (!categoryId || !categoryInfo || !categoryInfo.name) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('SETTINGS', `注册分类失败: 无效的分类信息`);
                }
                return false;
            }
            
            this.categories.set(categoryId, {
                id: categoryId,
                name: categoryInfo.name,
                icon: categoryInfo.icon || null,
                description: categoryInfo.description || null
            });
            
            // 初始化该分类的设置项列表
            if (!this.settings.has(categoryId)) {
                this.settings.set(categoryId, []);
            }
            
            // 更新导航栏
            this._updateNavigationPanel();
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('SETTINGS', `已注册设置分类: ${categoryId} - ${categoryInfo.name}`);
            }
            
            return true;
        },
        
        /**
         * 注册设置项
         * @param {string} categoryId 分类ID
         * @param {string} settingId 设置项ID
         * @param {Object} settingInfo 设置项信息 { name, description?, type, component?, onRender?, onChange? }
         */
        registerSetting: function(categoryId, settingId, settingInfo) {
            if (!categoryId || !settingId || !settingInfo || !settingInfo.name) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('SETTINGS', `注册设置项失败: 无效的设置项信息`);
                }
                return false;
            }
            
            // 检查分类是否存在
            if (!this.categories.has(categoryId)) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('SETTINGS', `注册设置项失败: 分类 ${categoryId} 不存在`);
                }
                return false;
            }
            
            // 获取该分类的设置项列表
            if (!this.settings.has(categoryId)) {
                this.settings.set(categoryId, []);
            }
            
            const categorySettings = this.settings.get(categoryId);
            
            // 检查是否已存在
            const existingIndex = categorySettings.findIndex(s => s.id === settingId);
            if (existingIndex >= 0) {
                // 更新现有设置项
                categorySettings[existingIndex] = {
                    id: settingId,
                    categoryId: categoryId,
                    name: settingInfo.name,
                    description: settingInfo.description || null,
                    type: settingInfo.type || 'text',
                    component: settingInfo.component || null,
                    onRender: settingInfo.onRender || null,
                    onChange: settingInfo.onChange || null,
                    value: settingInfo.value !== undefined ? settingInfo.value : null,
                    metadata: settingInfo.metadata || {}
                };
            } else {
                // 添加新设置项
                categorySettings.push({
                    id: settingId,
                    categoryId: categoryId,
                    name: settingInfo.name,
                    description: settingInfo.description || null,
                    type: settingInfo.type || 'text',
                    component: settingInfo.component || null,
                    onRender: settingInfo.onRender || null,
                    onChange: settingInfo.onChange || null,
                    value: settingInfo.value !== undefined ? settingInfo.value : null,
                    metadata: settingInfo.metadata || {}
                });
            }
            
            // 如果当前显示的是该分类，更新内容
            if (this.currentCategory === categoryId) {
                this._renderCategoryContent(categoryId);
            }
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('SETTINGS', `已注册设置项: ${categoryId}/${settingId} - ${settingInfo.name}`);
            }
            
            return true;
        },
        
        /**
         * 更新导航面板
         */
        _updateNavigationPanel: function() {
            if (!this.navList) {
                return;
            }
            
            // 清空现有内容
            this.navList.innerHTML = '';
            
            // 创建分类项
            for (const [categoryId, category] of this.categories) {
                const navItem = this._createNavItem(category);
                this.navList.appendChild(navItem);
            }
        },
        
        /**
         * 创建导航项
         */
        _createNavItem: function(category) {
            const navItem = document.createElement('div');
            navItem.className = 'settings-nav-item';
            navItem.dataset.categoryId = category.id;
            navItem.style.cssText = `
                height: 40px;
                display: flex;
                align-items: center;
                padding: 0 16px;
                cursor: pointer;
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                transition: background-color 0.1s;
            `;
            
            // 图标
            if (category.icon) {
                const iconEl = document.createElement('div');
                iconEl.className = 'settings-nav-icon';
                iconEl.style.cssText = `
                    width: 20px;
                    height: 20px;
                    margin-right: 12px;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                if (typeof category.icon === 'string') {
                    // SVG 路径或 URL
                    if (category.icon.startsWith('<svg') || category.icon.startsWith('<path')) {
                        iconEl.innerHTML = category.icon;
                    } else {
                        // URL
                        const img = document.createElement('img');
                        img.src = category.icon;
                        img.style.cssText = 'width: 20px; height: 20px;';
                        iconEl.appendChild(img);
                    }
                } else {
                    iconEl.appendChild(category.icon);
                }
                
                navItem.appendChild(iconEl);
            }
            
            // 名称
            const nameEl = document.createElement('span');
            nameEl.textContent = category.name;
            nameEl.style.cssText = `
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            navItem.appendChild(nameEl);
            
            // 点击事件
            if (typeof EventManager !== 'undefined') {
                const clickHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    navItem,
                    'click',
                    () => {
                        this._switchCategory(category.id);
                    }
                );
                this.eventHandlers.push(clickHandlerId);
            }
            
            return navItem;
        },
        
        /**
         * 切换分类
         */
        _switchCategory: function(categoryId) {
            if (!this.categories.has(categoryId)) {
                return;
            }
            
            this.currentCategory = categoryId;
            
            // 如果切换到非用户分类，重置用户管理页面状态
            if (categoryId !== 'users') {
                this.userManagementPage = 'list';
                this.userManagementPageData = {};
            }
            
            // 更新导航栏选中状态
            if (this.navList) {
                const navItems = this.navList.querySelectorAll('.settings-nav-item');
                navItems.forEach(item => {
                    if (item.dataset.categoryId === categoryId) {
                        item.classList.add('active');
                        const primaryLight = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                            ? ThemeManager.getCurrentTheme().colors.primaryLight || 'rgba(139, 92, 246, 0.15)'
                            : 'rgba(139, 92, 246, 0.15)';
                        const primaryColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                            ? ThemeManager.getCurrentTheme().colors.primary || '#8b5cf6'
                            : '#8b5cf6';
                        item.style.backgroundColor = primaryLight;
                        item.style.color = primaryColor;
                    } else {
                        item.classList.remove('active');
                        item.style.backgroundColor = 'transparent';
                        const textColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                            ? ThemeManager.getCurrentTheme().colors.text || '#d7e0dd'
                            : '#d7e0dd';
                        item.style.color = textColor;
                    }
                });
            }
            
            // 渲染分类内容
            this._renderCategoryContent(categoryId);
        },
        
        /**
         * 渲染分类内容
         */
        _renderCategoryContent: function(categoryId) {
            if (!this.contentContainer) {
                return;
            }
            
            const category = this.categories.get(categoryId);
            if (!category) {
                return;
            }
            
            // 清空内容
            this.contentContainer.innerHTML = '';
            
            // 创建分类标题
            const title = document.createElement('h1');
            title.className = 'settings-category-title';
            title.textContent = category.name;
            title.style.cssText = `
                font-size: 28px;
                font-weight: 300;
                color: var(--theme-text, #d7e0dd);
                margin: 0 0 8px 0;
                font-family: 'Segoe UI Light', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            `;
            this.contentContainer.appendChild(title);
            
            // 创建分类描述（如果有）
            if (category.description) {
                const description = document.createElement('p');
                description.className = 'settings-category-description';
                description.textContent = category.description;
                description.style.cssText = `
                    font-size: 14px;
                    color: var(--theme-text-secondary, var(--theme-text-muted, #b8c5c0));
                    margin: 0 0 32px 0;
                    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                `;
                this.contentContainer.appendChild(description);
            }
            
            // 获取该分类的设置项
            const categorySettings = this.settings.get(categoryId) || [];
            
            if (categorySettings.length === 0) {
                // 没有设置项，显示提示
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'settings-empty-message';
                emptyMessage.textContent = '此分类暂无设置项';
                emptyMessage.style.cssText = `
                    padding: 48px;
                    text-align: center;
                    color: var(--theme-text-secondary, var(--theme-text-muted, #b8c5c0));
                    font-size: 14px;
                    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                `;
                this.contentContainer.appendChild(emptyMessage);
            } else {
                // 渲染设置项
                categorySettings.forEach(setting => {
                    const settingElement = this._renderSetting(setting);
                    if (settingElement) {
                        this.contentContainer.appendChild(settingElement);
                    }
                });
            }
        },
        
        /**
         * 渲染设置项
         */
        _renderSetting: function(setting) {
            // 创建设置项容器
            const settingContainer = document.createElement('div');
            settingContainer.className = 'settings-item';
            settingContainer.dataset.settingId = setting.id;
            settingContainer.style.cssText = `
                margin-bottom: 32px;
            `;
            
            // 设置项标题和描述
            const header = document.createElement('div');
            header.className = 'settings-item-header';
            header.style.cssText = `
                margin-bottom: 12px;
            `;
            
            const title = document.createElement('div');
            title.className = 'settings-item-title';
            title.textContent = setting.name;
            title.style.cssText = `
                font-size: 16px;
                font-weight: 400;
                color: var(--theme-text, #d7e0dd);
                margin-bottom: 4px;
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            `;
            header.appendChild(title);
            
            if (setting.description) {
                const description = document.createElement('div');
                description.className = 'settings-item-description';
                description.textContent = setting.description;
                description.style.cssText = `
                    font-size: 13px;
                    color: var(--theme-text-secondary, var(--theme-text-muted, #b8c5c0));
                    line-height: 1.5;
                    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                `;
                header.appendChild(description);
            }
            
            settingContainer.appendChild(header);
            
            // 设置项控件
            const control = document.createElement('div');
            control.className = 'settings-item-control';
            control.style.cssText = `
                margin-top: 8px;
            `;
            
            // 如果有自定义渲染函数，使用它
            if (setting.onRender && typeof setting.onRender === 'function') {
                try {
                    const customElement = setting.onRender(setting, control);
                    if (customElement) {
                        control.appendChild(customElement);
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SETTINGS', `设置项 ${setting.id} 渲染失败: ${e.message}`, e);
                    }
                }
            } else {
                // 使用默认渲染
                const defaultElement = this._renderDefaultSettingControl(setting);
                if (defaultElement) {
                    control.appendChild(defaultElement);
                }
            }
            
            settingContainer.appendChild(control);
            
            return settingContainer;
        },
        
        /**
         * 渲染默认设置控件
         */
        _renderDefaultSettingControl: function(setting) {
            const type = setting.type || 'text';
            
            switch (type) {
                case 'toggle':
                    return this._createToggleControl(setting);
                case 'text':
                    return this._createTextControl(setting);
                case 'number':
                    return this._createNumberControl(setting);
                case 'select':
                    return this._createSelectControl(setting);
                case 'button':
                    return this._createButtonControl(setting);
                default:
                    // 未知类型，显示占位符
                    const placeholder = document.createElement('div');
                    placeholder.textContent = `[${type} 类型设置项]`;
                    placeholder.style.cssText = `
                        padding: 12px;
                        background: var(--theme-background-secondary, var(--theme-background-tertiary, #1a1f28));
                        border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                        border-radius: 4px;
                        color: var(--theme-text-secondary, var(--theme-text-muted, #b8c5c0));
                        font-size: 13px;
                        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                    `;
                    return placeholder;
            }
        },
        
        /**
         * 创建开关控件
         */
        _createToggleControl: function(setting) {
            const container = document.createElement('div');
            container.style.cssText = `
                display: flex;
                align-items: center;
            `;
            
            const toggle = document.createElement('div');
            toggle.className = 'settings-toggle';
            toggle.dataset.settingId = setting.id;
            const primaryColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                ? ThemeManager.getCurrentTheme().colors.primary || '#8b5cf6'
                : '#8b5cf6';
            const borderColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme()
                ? ThemeManager.getCurrentTheme().colors.border || ThemeManager.getCurrentTheme().colors.textMuted || '#cccccc'
                : '#cccccc';
            
            toggle.style.cssText = `
                width: 44px;
                height: 24px;
                background: ${setting.value ? primaryColor : borderColor};
                border-radius: 12px;
                position: relative;
                cursor: pointer;
                transition: background-color 0.2s;
            `;
            
            const toggleThumb = document.createElement('div');
            toggleThumb.style.cssText = `
                width: 20px;
                height: 20px;
                background: #ffffff;
                border-radius: 50%;
                position: absolute;
                top: 2px;
                left: ${setting.value ? '22px' : '2px'};
                transition: left 0.2s;
                box-shadow: 0 2px 4px var(--theme-shadow, rgba(0, 0, 0, 0.5));
            `;
            toggle.appendChild(toggleThumb);
            
            // 点击事件
            if (typeof EventManager !== 'undefined') {
                const clickHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    toggle,
                    'click',
                    () => {
                        const newValue = !setting.value;
                        setting.value = newValue;
                        const primaryColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                            ? ThemeManager.getCurrentTheme().colors.primary || '#8b5cf6'
                            : '#8b5cf6';
                        const borderColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme()
                            ? ThemeManager.getCurrentTheme().colors.border || ThemeManager.getCurrentTheme().colors.textMuted || '#cccccc'
                            : '#cccccc';
                        toggle.style.background = newValue ? primaryColor : borderColor;
                        toggleThumb.style.left = newValue ? '22px' : '2px';
                        
                        // 调用 onChange 回调
                        if (setting.onChange && typeof setting.onChange === 'function') {
                            try {
                                setting.onChange(newValue, setting);
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('SETTINGS', `设置项 ${setting.id} onChange 回调失败: ${e.message}`, e);
                                }
                            }
                        }
                    }
                );
                this.eventHandlers.push(clickHandlerId);
            }
            
            container.appendChild(toggle);
            return container;
        },
        
        /**
         * 创建文本输入控件
         */
        _createTextControl: function(setting) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'settings-text-input';
            input.dataset.settingId = setting.id;
            input.value = setting.value || '';
            input.placeholder = setting.metadata.placeholder || '';
            input.style.cssText = `
                width: 100%;
                max-width: 400px;
                height: 32px;
                padding: 0 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 2px;
                font-size: 14px;
                color: var(--theme-text, #d7e0dd);
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                outline: none;
                transition: border-color 0.2s;
            `;
            
            // 焦点事件
            if (typeof EventManager !== 'undefined') {
                const focusHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    input,
                    'focus',
                    () => {
                        input.style.borderColor = '#0078d4';
                    }
                );
                this.eventHandlers.push(focusHandlerId);
                
                const blurHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    input,
                    'blur',
                    () => {
                        input.style.borderColor = '#cccccc';
                    }
                );
                this.eventHandlers.push(blurHandlerId);
                
                const changeHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    input,
                    'input',
                    (e) => {
                        setting.value = e.target.value;
                        
                        // 调用 onChange 回调
                        if (setting.onChange && typeof setting.onChange === 'function') {
                            try {
                                setting.onChange(e.target.value, setting);
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('SETTINGS', `设置项 ${setting.id} onChange 回调失败: ${e.message}`, e);
                                }
                            }
                        }
                    }
                );
                this.eventHandlers.push(changeHandlerId);
            }
            
            return input;
        },
        
        /**
         * 创建数字输入控件
         */
        _createNumberControl: function(setting) {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'settings-number-input';
            input.dataset.settingId = setting.id;
            input.value = setting.value !== undefined ? setting.value : '';
            input.min = setting.metadata.min !== undefined ? setting.metadata.min : '';
            input.max = setting.metadata.max !== undefined ? setting.metadata.max : '';
            input.step = setting.metadata.step !== undefined ? setting.metadata.step : '1';
            input.style.cssText = `
                width: 100%;
                max-width: 200px;
                height: 32px;
                padding: 0 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 2px;
                font-size: 14px;
                color: var(--theme-text, #d7e0dd);
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                outline: none;
                transition: border-color 0.2s;
            `;
            
            // 事件处理（与文本输入相同）
            if (typeof EventManager !== 'undefined') {
                const focusHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    input,
                    'focus',
                    () => {
                        input.style.borderColor = '#0078d4';
                    }
                );
                this.eventHandlers.push(focusHandlerId);
                
                const blurHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    input,
                    'blur',
                    () => {
                        input.style.borderColor = '#cccccc';
                    }
                );
                this.eventHandlers.push(blurHandlerId);
                
                const changeHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    input,
                    'change',
                    (e) => {
                        setting.value = parseFloat(e.target.value) || 0;
                        
                        if (setting.onChange && typeof setting.onChange === 'function') {
                            try {
                                setting.onChange(setting.value, setting);
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('SETTINGS', `设置项 ${setting.id} onChange 回调失败: ${e.message}`, e);
                                }
                            }
                        }
                    }
                );
                this.eventHandlers.push(changeHandlerId);
            }
            
            return input;
        },
        
        /**
         * 创建下拉选择控件
         */
        _createSelectControl: function(setting) {
            const select = document.createElement('select');
            select.className = 'settings-select';
            select.dataset.settingId = setting.id;
            select.style.cssText = `
                width: 100%;
                max-width: 400px;
                height: 32px;
                padding: 0 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 2px;
                font-size: 14px;
                color: var(--theme-text, #d7e0dd);
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                outline: none;
                cursor: pointer;
                transition: border-color 0.2s;
            `;
            
            // 添加选项
            const options = setting.metadata.options || [];
            options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option.value !== undefined ? option.value : option;
                optionEl.textContent = option.label !== undefined ? option.label : option;
                if (setting.value === optionEl.value) {
                    optionEl.selected = true;
                }
                select.appendChild(optionEl);
            });
            
            // 事件处理
            if (typeof EventManager !== 'undefined') {
                const changeHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    select,
                    'change',
                    (e) => {
                        setting.value = e.target.value;
                        
                        if (setting.onChange && typeof setting.onChange === 'function') {
                            try {
                                setting.onChange(e.target.value, setting);
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('SETTINGS', `设置项 ${setting.id} onChange 回调失败: ${e.message}`, e);
                                }
                            }
                        }
                    }
                );
                this.eventHandlers.push(changeHandlerId);
            }
            
            return select;
        },
        
        /**
         * 创建按钮控件
         */
        _createButtonControl: function(setting) {
            const button = document.createElement('button');
            button.className = 'settings-button';
            button.dataset.settingId = setting.id;
            button.textContent = setting.metadata.buttonText || '执行';
            const primaryColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                ? ThemeManager.getCurrentTheme().colors.primary || '#8b5cf6'
                : '#8b5cf6';
            
            button.style.cssText = `
                height: 32px;
                padding: 0 16px;
                border: 1px solid ${primaryColor};
                border-radius: 2px;
                background: ${primaryColor};
                color: #ffffff;
                font-size: 14px;
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                cursor: pointer;
                outline: none;
                transition: background-color 0.2s, border-color 0.2s;
            `;
            
            // 悬停效果
            if (typeof EventManager !== 'undefined') {
                const mouseenterHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    button,
                    'mouseenter',
                    () => {
                        const primaryDark = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                            ? ThemeManager.getCurrentTheme().colors.primaryDark || '#7c3aed'
                            : '#7c3aed';
                        button.style.background = primaryDark;
                        button.style.borderColor = primaryDark;
                    }
                );
                this.eventHandlers.push(mouseenterHandlerId);
                
                const mouseleaveHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    button,
                    'mouseleave',
                    () => {
                        const primaryColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                            ? ThemeManager.getCurrentTheme().colors.primary || '#8b5cf6'
                            : '#8b5cf6';
                        button.style.background = primaryColor;
                        button.style.borderColor = primaryColor;
                    }
                );
                this.eventHandlers.push(mouseleaveHandlerId);
                
                const clickHandlerId = EventManager.registerElementEvent(
                    this.pid,
                    button,
                    'click',
                    () => {
                        if (setting.onChange && typeof setting.onChange === 'function') {
                            try {
                                setting.onChange(null, setting);
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('SETTINGS', `设置项 ${setting.id} onChange 回调失败: ${e.message}`, e);
                                }
                            }
                        }
                    }
                );
                this.eventHandlers.push(clickHandlerId);
            }
            
            return button;
        },
        
        /**
         * 处理搜索
         */
        _handleSearch: function() {
            if (!this.searchQuery) {
                // 没有搜索关键词，显示当前分类
                if (this.currentCategory) {
                    this._renderCategoryContent(this.currentCategory);
                }
                return;
            }
            
            // 搜索所有分类和设置项
            const results = [];
            
            for (const [categoryId, category] of this.categories) {
                const categorySettings = this.settings.get(categoryId) || [];
                
                // 检查分类名称
                if (category.name.toLowerCase().includes(this.searchQuery.toLowerCase())) {
                    results.push({
                        type: 'category',
                        category: category,
                        settings: categorySettings
                    });
                } else {
                    // 检查设置项
                    const matchingSettings = categorySettings.filter(setting => {
                        return setting.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                               (setting.description && setting.description.toLowerCase().includes(this.searchQuery.toLowerCase()));
                    });
                    
                    if (matchingSettings.length > 0) {
                        results.push({
                            type: 'settings',
                            category: category,
                            settings: matchingSettings
                        });
                    }
                }
            }
            
            // 渲染搜索结果
            this._renderSearchResults(results);
        },
        
        /**
         * 渲染搜索结果
         */
        _renderSearchResults: function(results) {
            if (!this.contentContainer) {
                return;
            }
            
            // 清空内容
            this.contentContainer.innerHTML = '';
            
            // 搜索结果标题
            const title = document.createElement('h1');
            title.className = 'settings-search-title';
            title.textContent = `搜索结果: "${this.searchQuery}"`;
            title.style.cssText = `
                font-size: 28px;
                font-weight: 300;
                color: var(--theme-text, #d7e0dd);
                margin: 0 0 32px 0;
                font-family: 'Segoe UI Light', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            `;
            this.contentContainer.appendChild(title);
            
            if (results.length === 0) {
                // 没有结果
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'settings-empty-message';
                emptyMessage.textContent = '未找到匹配的设置项';
                emptyMessage.style.cssText = `
                    padding: 48px;
                    text-align: center;
                    color: var(--theme-text-secondary, var(--theme-text-muted, #b8c5c0));
                    font-size: 14px;
                    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                `;
                this.contentContainer.appendChild(emptyMessage);
            } else {
                // 显示结果
                results.forEach(result => {
                    // 分类标题
                    const categoryTitle = document.createElement('h2');
                    categoryTitle.className = 'settings-search-category-title';
                    categoryTitle.textContent = result.category.name;
                    categoryTitle.style.cssText = `
                        font-size: 20px;
                        font-weight: 400;
                        color: var(--theme-text, #d7e0dd);
                        margin: 32px 0 16px 0;
                        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                    `;
                    this.contentContainer.appendChild(categoryTitle);
                    
                    // 设置项
                    result.settings.forEach(setting => {
                        const settingElement = this._renderSetting(setting);
                        if (settingElement) {
                            this.contentContainer.appendChild(settingElement);
                        }
                    });
                });
            }
        },
        
        /**
         * 应用主题
         */
        _applyTheme: function() {
            if (typeof ThemeManager === 'undefined') {
                return;
            }
            
            const theme = ThemeManager.getCurrentTheme();
            if (!theme || !theme.colors) {
                return;
            }
            
            const colors = theme.colors;
            
            // 应用主题到窗口元素
            if (this.window) {
                // 搜索栏背景
                const searchBar = this.window.querySelector('.settings-search-bar');
                if (searchBar) {
                    searchBar.style.backgroundColor = colors.backgroundElevated || colors.backgroundSecondary || colors.background;
                    searchBar.style.borderBottomColor = colors.border || colors.borderLight || 'rgba(255, 255, 255, 0.1)';
                }
                
                // 搜索图标和输入框
                const searchIcon = this.window.querySelector('.settings-search-icon');
                if (searchIcon) {
                    const svgPath = searchIcon.querySelector('svg path');
                    if (svgPath) {
                        svgPath.setAttribute('fill', colors.textSecondary || colors.textMuted || colors.text);
                    }
                }
                
                const searchInput = this.window.querySelector('.settings-search-input');
                if (searchInput) {
                    searchInput.style.color = colors.text || '#ffffff';
                    searchInput.style.setProperty('--placeholder-color', colors.textMuted || colors.textSecondary || '#999999');
                }
                
                // 导航面板
                const navPanel = this.window.querySelector('.settings-nav-panel');
                if (navPanel) {
                    navPanel.style.backgroundColor = colors.backgroundSecondary || colors.backgroundTertiary || colors.background;
                    navPanel.style.borderRightColor = colors.border || colors.borderLight || 'rgba(255, 255, 255, 0.1)';
                }
                
                // 导航项
                const navItems = this.window.querySelectorAll('.settings-nav-item');
                navItems.forEach(item => {
                    if (item.classList.contains('active')) {
                        item.style.backgroundColor = colors.primaryLight || 'rgba(139, 92, 246, 0.15)';
                        item.style.color = colors.primary || '#8b5cf6';
                    } else {
                        item.style.color = colors.text || '#ffffff';
                    }
                });
                
                // 内容面板
                const contentPanel = this.window.querySelector('.settings-content-panel');
                if (contentPanel) {
                    contentPanel.style.backgroundColor = colors.background || '#050810';
                }
                
                // 内容容器
                const contentContainer = this.window.querySelector('.settings-content-container');
                if (contentContainer) {
                    // 标题
                    const titles = contentContainer.querySelectorAll('.settings-category-title, .settings-search-title');
                    titles.forEach(title => {
                        title.style.color = colors.text || '#ffffff';
                    });
                    
                    // 描述
                    const descriptions = contentContainer.querySelectorAll('.settings-category-description, .settings-item-description');
                    descriptions.forEach(desc => {
                        desc.style.color = colors.textSecondary || colors.textMuted || '#b8c5c0';
                    });
                    
                    // 设置项标题
                    const itemTitles = contentContainer.querySelectorAll('.settings-item-title');
                    itemTitles.forEach(title => {
                        title.style.color = colors.text || '#ffffff';
                    });
                    
                    // 输入框
                    const inputs = contentContainer.querySelectorAll('.settings-text-input, .settings-number-input, .settings-select');
                    inputs.forEach(input => {
                        input.style.backgroundColor = colors.backgroundElevated || colors.backgroundSecondary || colors.background;
                        input.style.borderColor = colors.border || colors.borderLight || 'rgba(255, 255, 255, 0.2)';
                        input.style.color = colors.text || '#ffffff';
                    });
                    
                    // 按钮
                    const buttons = contentContainer.querySelectorAll('.settings-button');
                    buttons.forEach(button => {
                        button.style.backgroundColor = colors.primary || '#8b5cf6';
                        button.style.borderColor = colors.primary || '#8b5cf6';
                        button.style.color = '#ffffff';
                    });
                    
                    // 开关
                    const toggles = contentContainer.querySelectorAll('.settings-toggle');
                    toggles.forEach(toggle => {
                        const isActive = toggle.style.background && toggle.style.background.includes(colors.primary || '#8b5cf6');
                        if (isActive) {
                            toggle.style.background = colors.primary || '#8b5cf6';
                        } else {
                            toggle.style.background = colors.border || colors.textMuted || '#cccccc';
                        }
                    });
                }
            }
        },
        
        /**
         * 设置主题监听器
         */
        _setupThemeListener: function() {
            if (typeof ThemeManager === 'undefined') {
                return;
            }
            
            // 监听主题变更
            this.themeChangeUnsubscribe = ThemeManager.onThemeChange((themeId, theme) => {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('SETTINGS', `主题已变更: ${themeId}`);
                }
                this._applyTheme();
            });
        },
        
        /**
         * 注册默认设置分类和设置项
         */
        _registerDefaultSettings: function() {
            // 注册系统分类
            this.registerCategory('system', {
                name: '系统',
                icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 2L2 7V9C2 13.55 5.16 17.74 10 18C14.84 17.74 18 13.55 18 9V7L10 2ZM10 4.21L16 8.14V9C16 12.52 13.33 15.86 10 16.18C6.67 15.86 4 12.52 4 9V8.14L10 4.21Z" fill="currentColor"/>
                </svg>`,
                description: '系统相关设置'
            });
            
            // 注册用户管理分类
            this.registerCategory('users', {
                name: '用户',
                icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 10C12.7614 10 15 7.76142 15 5C15 2.23858 12.7614 0 10 0C7.23858 0 5 2.23858 5 5C5 7.76142 7.23858 10 10 10Z" fill="currentColor"/>
                    <path d="M10 12C6.68629 12 0 13.6863 0 17V20H20V17C20 13.6863 13.3137 12 10 12Z" fill="currentColor"/>
                </svg>`,
                description: '用户账户管理'
            });
            
            // 注册用户管理设置项（使用自定义渲染）
            this.registerSetting('users', 'user_management', {
                name: '用户管理',
                description: '管理用户账户、头像、密码等',
                type: 'custom',
                onRender: (setting, control) => {
                    return this._renderUserManagement(setting, control);
                }
            });
        },
        
        /**
         * 渲染用户管理界面
         */
        _renderUserManagement: function(setting, control) {
            const container = document.createElement('div');
            container.className = 'settings-user-management';
            container.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 24px;
            `;
            
            // 检查UserControl是否可用
            if (typeof UserControl === 'undefined') {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '用户控制系统未加载';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 根据当前页面状态渲染不同的视图
            if (this.userManagementPage === 'create') {
                return this._renderCreateUserPage(container);
            } else if (this.userManagementPage === 'createGroup') {
                return this._renderCreateGroupPage(container);
            } else if (this.userManagementPage === 'groups') {
                return this._renderGroupsPage(container);
            } else if (this.userManagementPage === 'groupDetail') {
                return this._renderGroupDetailPage(container);
            } else if (this.userManagementPage === 'userGroups') {
                return this._renderUserGroupsPage(container);
            } else {
                // 默认显示用户列表
                return this._renderUserListPage(container);
            }
        },
        
        /**
         * 渲染用户列表页面
         */
        _renderUserListPage: function(container) {
            // 检查UserControl是否可用
            if (typeof UserControl === 'undefined') {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '用户控制系统未加载';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 获取当前用户信息
            const currentUser = UserControl.getCurrentUser();
            const isAdmin = UserControl.isAdmin();
            const users = UserControl.listUsers();
            
            // 创建工具栏
            const toolbar = document.createElement('div');
            toolbar.className = 'settings-user-toolbar';
            toolbar.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
            `;
            
            const toolbarLeft = document.createElement('div');
            toolbarLeft.style.cssText = `display: flex; gap: 12px; align-items: center;`;
            
            const title = document.createElement('h2');
            title.textContent = '用户账户';
            title.style.cssText = `
                font-size: 20px;
                font-weight: 400;
                color: var(--theme-text, #d7e0dd);
                margin: 0;
            `;
            toolbarLeft.appendChild(title);
            
            toolbar.appendChild(toolbarLeft);
            
            // 工具栏右侧按钮
            const toolbarRight = document.createElement('div');
            toolbarRight.style.cssText = `display: flex; gap: 12px;`;
            
            // 管理组按钮（管理员）
            if (isAdmin) {
                const groupsBtn = document.createElement('button');
                groupsBtn.textContent = '管理组';
                groupsBtn.style.cssText = `
                    padding: 8px 16px;
                    border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                    border-radius: 4px;
                    background: transparent;
                    color: var(--theme-text, #d7e0dd);
                    cursor: pointer;
                    font-size: 14px;
                    transition: background-color 0.2s;
                `;
                groupsBtn.addEventListener('mouseenter', () => {
                    groupsBtn.style.background = 'var(--theme-background-tertiary, rgba(139, 92, 246, 0.1))';
                });
                groupsBtn.addEventListener('mouseleave', () => {
                    groupsBtn.style.background = 'transparent';
                });
                groupsBtn.addEventListener('click', () => {
                    this.userManagementPage = 'groups';
                    this._switchCategory('users');
                });
                toolbarRight.appendChild(groupsBtn);
            }
            
            // 创建用户按钮（管理员）
            if (isAdmin) {
                const createBtn = document.createElement('button');
                createBtn.textContent = '+ 创建用户';
                const primaryColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                    ? ThemeManager.getCurrentTheme().colors.primary || '#8b5cf6'
                    : '#8b5cf6';
                createBtn.style.cssText = `
                    padding: 8px 16px;
                    border: 1px solid ${primaryColor};
                    border-radius: 4px;
                    background: ${primaryColor};
                    color: #ffffff;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: background-color 0.2s, border-color 0.2s;
                `;
                createBtn.addEventListener('mouseenter', () => {
                    const primaryDark = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                        ? ThemeManager.getCurrentTheme().colors.primaryDark || '#7c3aed'
                        : '#7c3aed';
                    createBtn.style.background = primaryDark;
                    createBtn.style.borderColor = primaryDark;
                });
                createBtn.addEventListener('mouseleave', () => {
                    createBtn.style.background = primaryColor;
                    createBtn.style.borderColor = primaryColor;
                });
                createBtn.addEventListener('click', () => {
                    this.userManagementPage = 'create';
                    this._switchCategory('users');
                });
                toolbarRight.appendChild(createBtn);
            }
            
            toolbar.appendChild(toolbarRight);
            container.appendChild(toolbar);
            
            // 创建用户列表
            const userList = document.createElement('div');
            userList.className = 'settings-user-list';
            userList.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 16px;
            `;
            
            users.forEach(user => {
                const userCard = this._createUserCard(user, currentUser, isAdmin);
                userList.appendChild(userCard);
            });
            
            container.appendChild(userList);
            
            return container;
        },
        
        /**
         * 创建用户卡片
         */
        _createUserCard: function(user, currentUser, isAdmin) {
            const card = document.createElement('div');
            card.className = 'settings-user-card';
            card.style.cssText = `
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 8px;
                padding: 20px;
                display: flex;
                align-items: center;
                gap: 16px;
            `;
            
            // 用户头像
            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'settings-user-avatar-container';
            avatarContainer.style.cssText = `
                width: 64px;
                height: 64px;
                border-radius: 50%;
                background: var(--theme-background-tertiary, #1a1f28);
                border: 2px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                overflow: hidden;
                position: relative;
            `;
            
            // 获取最新的用户数据（直接从UserControl获取，而不是使用listUsers返回的缓存数据）
            const userData = UserControl._users && UserControl._users.get ? UserControl._users.get(user.username) : null;
            const avatarFileName = userData && userData.avatar ? userData.avatar : (user.avatar || null);
            
            // 创建默认头像SVG（作为后备）
            const defaultAvatarSvg = document.createElement('div');
            defaultAvatarSvg.innerHTML = `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.9"/>
                    <path d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="2" fill="none" opacity="0.9"/>
                </svg>
            `;
            defaultAvatarSvg.style.cssText = `
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--theme-text-secondary, #b8c5c0);
            `;
            defaultAvatarSvg.style.display = avatarFileName ? 'none' : 'flex';
            avatarContainer.appendChild(defaultAvatarSvg);
            
            // 创建头像图片元素
            const avatarImg = document.createElement('img');
            avatarImg.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: ${avatarFileName ? 'block' : 'none'};
            `;
            
            if (avatarFileName) {
                // 使用FSDirve读取本地文件并转换为base64 data URL
                (async () => {
                    try {
                        const url = new URL('/system/service/FSDirve.php', window.location.origin);
                        url.searchParams.set('action', 'read_file');
                        url.searchParams.set('path', 'D:/cache/');
                        url.searchParams.set('fileName', avatarFileName);
                        url.searchParams.set('asBase64', 'true');
                        
                        const response = await fetch(url.toString());
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}`);
                        }
                        
                        const result = await response.json();
                        if (result.status === 'success' && result.data && result.data.content) {
                            // 确定MIME类型
                            const fileExt = avatarFileName.split('.').pop()?.toLowerCase() || 'jpg';
                            const mimeType = fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' :
                                            fileExt === 'png' ? 'image/png' :
                                            fileExt === 'gif' ? 'image/gif' :
                                            fileExt === 'webp' ? 'image/webp' :
                                            fileExt === 'svg' ? 'image/svg+xml' :
                                            fileExt === 'bmp' ? 'image/bmp' : 'image/jpeg';
                            
                            // 转换为data URL
                            avatarImg.src = `data:${mimeType};base64,${result.data.content}`;
                            avatarImg.onload = () => {
                                // 图片加载成功，隐藏默认头像
                                defaultAvatarSvg.style.display = 'none';
                                avatarImg.style.display = 'block';
                            };
                        } else {
                            throw new Error(result.message || '读取文件失败');
                        }
                    } catch (error) {
                        // 如果读取失败，显示默认头像
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('SETTINGS', `头像加载失败: ${avatarFileName}, 错误: ${error.message}`);
                        }
                        avatarImg.style.display = 'none';
                        defaultAvatarSvg.style.display = 'flex';
                    }
                })();
            }
            avatarContainer.appendChild(avatarImg);
            
            // 头像上传按钮（仅管理员或用户自己）
            if (isAdmin || user.username === currentUser) {
                const avatarUploadBtn = document.createElement('button');
                avatarUploadBtn.className = 'settings-avatar-upload-btn';
                avatarUploadBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 4V20M4 12H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                `;
                avatarUploadBtn.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: var(--theme-primary, #8b5cf6);
                    border: 2px solid var(--theme-background-elevated, #252b35);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    padding: 0;
                    outline: none;
                    z-index: 10;
                `;
                avatarUploadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._handleAvatarUpload(user.username);
                });
                avatarContainer.appendChild(avatarUploadBtn);
            }
            
            // 用户信息
            const userInfo = document.createElement('div');
            userInfo.className = 'settings-user-info';
            userInfo.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            // 用户名和级别
            const userNameRow = document.createElement('div');
            userNameRow.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            
            const userName = document.createElement('div');
            userName.className = 'settings-user-name';
            userName.textContent = user.username;
            userName.style.cssText = `
                font-size: 18px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            userNameRow.appendChild(userName);
            
            // 级别标签
            const levelTag = document.createElement('span');
            levelTag.className = 'settings-user-level';
            const levelNames = {
                'USER': '用户',
                'ADMIN': '管理员',
                'DEFAULT_ADMIN': '默认管理员'
            };
            levelTag.textContent = levelNames[user.level] || user.level;
            levelTag.style.cssText = `
                font-size: 12px;
                padding: 2px 8px;
                border-radius: 4px;
                background: ${user.level === 'DEFAULT_ADMIN' ? 'rgba(255, 193, 7, 0.2)' : user.level === 'ADMIN' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(108, 117, 125, 0.2)'};
                color: ${user.level === 'DEFAULT_ADMIN' ? '#ffc107' : user.level === 'ADMIN' ? '#8b5cf6' : '#6c757d'};
            `;
            userNameRow.appendChild(levelTag);
            
            userInfo.appendChild(userNameRow);
            
            // 用户操作按钮
            const actions = document.createElement('div');
            actions.className = 'settings-user-actions';
            actions.style.cssText = `
                display: flex;
                gap: 8px;
                margin-top: 8px;
            `;
            
            // 改名按钮（仅管理员）
            if (isAdmin && user.username !== 'root') {
                const renameBtn = document.createElement('button');
                renameBtn.textContent = '改名';
                renameBtn.className = 'settings-user-action-btn';
                renameBtn.style.cssText = `
                    padding: 6px 12px;
                    border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                    border-radius: 4px;
                    background: transparent;
                    color: var(--theme-text, #d7e0dd);
                    cursor: pointer;
                    font-size: 13px;
                `;
                renameBtn.addEventListener('click', () => {
                    this._handleRenameUser(user.username);
                });
                actions.appendChild(renameBtn);
            }
            
            // 设置密码按钮（管理员或用户自己）
            if (isAdmin || user.username === currentUser) {
                const passwordBtn = document.createElement('button');
                passwordBtn.textContent = user.hasPassword ? '修改密码' : '设置密码';
                passwordBtn.className = 'settings-user-action-btn';
                passwordBtn.style.cssText = `
                    padding: 6px 12px;
                    border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                    border-radius: 4px;
                    background: transparent;
                    color: var(--theme-text, #d7e0dd);
                    cursor: pointer;
                    font-size: 13px;
                `;
                passwordBtn.addEventListener('click', () => {
                    this._handleSetPassword(user.username, isAdmin);
                });
                actions.appendChild(passwordBtn);
            }
            
            // 管理组按钮（管理员）
            if (isAdmin && typeof UserGroup !== 'undefined') {
                const manageGroupsBtn = document.createElement('button');
                manageGroupsBtn.textContent = '管理组';
                manageGroupsBtn.className = 'settings-user-action-btn';
                manageGroupsBtn.style.cssText = `
                    padding: 6px 12px;
                    border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                    border-radius: 4px;
                    background: transparent;
                    color: var(--theme-text, #d7e0dd);
                    cursor: pointer;
                    font-size: 13px;
                `;
                manageGroupsBtn.addEventListener('click', async () => {
                    this.userManagementPage = 'userGroups';
                    this.userManagementPageData = { username: user.username };
                    this._switchCategory('users');
                });
                actions.appendChild(manageGroupsBtn);
            }
            
            // 删除用户按钮（仅管理员，不能删除 root）
            if (isAdmin && user.username !== 'root' && user.username !== currentUser) {
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '删除';
                deleteBtn.className = 'settings-user-action-btn';
                deleteBtn.style.cssText = `
                    padding: 6px 12px;
                    border: 1px solid var(--theme-border, rgba(255, 0, 0, 0.3));
                    border-radius: 4px;
                    background: transparent;
                    color: #ff6b6b;
                    cursor: pointer;
                    font-size: 13px;
                `;
                deleteBtn.addEventListener('click', async () => {
                    await this._handleDeleteUser(user.username);
                });
                actions.appendChild(deleteBtn);
            }
            
            userInfo.appendChild(actions);
            
            card.appendChild(avatarContainer);
            card.appendChild(userInfo);
            
            return card;
        },
        
        /**
         * 处理头像上传
         */
        _handleAvatarUpload: async function(username) {
            try {
                // 使用文件管理器选择文件
                if (typeof ProcessManager === 'undefined') {
                    throw new Error('ProcessManager 未加载');
                }
                
                // 启动文件管理器，设置为文件选择模式
                await ProcessManager.startProgram('filemanager', {
                    args: ['D:'],
                    mode: 'file-selector',
                    onFileSelected: async (fileItem) => {
                        try {
                            if (!fileItem || !fileItem.path) {
                                return;
                            }
                            
                            // 检查文件扩展名（只允许图片格式）
                            const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
                            const fileExt = fileItem.name.split('.').pop()?.toLowerCase();
                            if (!fileExt || !imageExtensions.includes(fileExt)) {
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                    await GUIManager.showAlert('请选择图片文件（jpg, png, gif, bmp, webp, svg）', '错误', 'error');
                                }
                                return;
                            }
                            
                            // 读取文件内容（图片文件会自动使用base64编码）
                            const url = new URL('/system/service/FSDirve.php', window.location.origin);
                            url.searchParams.set('action', 'read_file');
                            
                            // 解析文件路径
                            const pathParts = fileItem.path.split('/');
                            const fileName = pathParts[pathParts.length - 1];
                            const parentPath = pathParts.slice(0, -1).join('/') || (fileItem.path.split(':')[0] + ':');
                            
                            // 规范化路径
                            let phpPath = parentPath;
                            if (/^[CD]:$/.test(phpPath)) {
                                phpPath = phpPath + '/';
                            }
                            
                            url.searchParams.set('path', phpPath);
                            url.searchParams.set('fileName', fileName);
                            // 图片文件会自动使用base64编码，但也可以显式指定
                            url.searchParams.set('asBase64', 'true');
                            
                            const readResponse = await fetch(url.toString());
                            if (!readResponse.ok) {
                                throw new Error(`读取文件失败: HTTP ${readResponse.status}`);
                            }
                            
                            // 检查响应内容类型
                            const contentType = readResponse.headers.get('content-type');
                            let readResult;
                            
                            try {
                                const responseText = await readResponse.text();
                                if (!responseText || responseText.trim() === '') {
                                    throw new Error('服务器返回空响应');
                                }
                                readResult = JSON.parse(responseText);
                            } catch (jsonError) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('SETTINGS', `JSON解析失败: ${jsonError.message}`, jsonError);
                                }
                                throw new Error(`读取文件失败: 服务器返回的数据格式错误`);
                            }
                            
                            if (readResult.status !== 'success' || !readResult.data || !readResult.data.content) {
                                throw new Error(`读取文件失败: ${readResult.message || '未知错误'}`);
                            }
                            
                            // 检查文件大小（限制5MB）
                            const fileSize = readResult.data.size || 0;
                            if (fileSize > 5 * 1024 * 1024) {
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                    await GUIManager.showAlert('头像文件大小不能超过5MB', '错误', 'error');
                                }
                                return;
                            }
                            
                            // 获取文件内容（PHP已经返回base64编码的内容）
                            let fileContent = readResult.data.content;
                            const isBase64 = readResult.data.isBase64 !== false; // 默认为true，因为图片文件会自动编码
                            
                            // 生成新的文件名
                            const timestamp = Date.now();
                            const newFileName = `avatar_${username}_${timestamp}.${fileExt}`;
                            
                            // 保存到cache目录
                            const saveUrl = new URL('/system/service/FSDirve.php', window.location.origin);
                            saveUrl.searchParams.set('action', 'write_file');
                            saveUrl.searchParams.set('path', 'D:/cache/');
                            saveUrl.searchParams.set('fileName', newFileName);
                            saveUrl.searchParams.set('writeMod', 'overwrite');
                            
                            const saveResponse = await fetch(saveUrl.toString(), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    content: fileContent,
                                    isBase64: isBase64
                                })
                            });
                            
                            if (!saveResponse.ok) {
                                throw new Error(`保存文件失败: HTTP ${saveResponse.status}`);
                            }
                            
                            const saveResult = await saveResponse.json();
                            if (saveResult.status !== 'success') {
                                throw new Error(`保存文件失败: ${saveResult.message || '未知错误'}`);
                            }
                            
                            // 更新用户头像
                            const success = await UserControl.setAvatar(username, newFileName);
                            if (success) {
                                // 等待更长时间，确保文件已完全写入文件系统
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug('SETTINGS', `头像已保存，准备刷新界面: ${newFileName}`);
                                }
                                
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                    await GUIManager.showAlert('头像已更新', '成功', 'success');
                                }
                                
                                // 强制刷新用户列表（清空并重新渲染）
                                // 确保从 UserControl._users 获取最新数据
                                if (this.currentCategory === 'users') {
                                    this._renderCategoryContent('users');
                                } else {
                                    this._switchCategory('users');
                                }
                                
                                // 更新开始菜单的用户信息
                                if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager._updateStartMenuUserInfo === 'function') {
                                    TaskbarManager._updateStartMenuUserInfo().catch(err => {
                                        if (typeof KernelLogger !== 'undefined') {
                                            KernelLogger.warn('SETTINGS', `更新开始菜单用户信息失败: ${err.message}`);
                                        }
                                    });
                                }
                                
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug('SETTINGS', '用户列表已刷新');
                                }
                            } else {
                                throw new Error('更新用户头像失败');
                            }
                        } catch (error) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('SETTINGS', `头像上传失败: ${error.message}`, error);
                            }
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert(`头像上传失败: ${error.message}`, '错误', 'error');
                            }
                        }
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SETTINGS', `启动文件管理器失败: ${error.message}`, error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`启动文件管理器失败: ${error.message}`, '错误', 'error');
                }
            }
        },
        
        /**
         * 处理用户改名
         */
        _handleRenameUser: async function(oldUsername) {
            if (typeof GUIManager === 'undefined') {
                return;
            }
            
            const newUsername = await GUIManager.showPrompt('请输入新用户名', '重命名用户', oldUsername);
            if (!newUsername || newUsername.trim() === '') {
                return;
            }
            
            const trimmedUsername = newUsername.trim();
            if (trimmedUsername === oldUsername) {
                return;
            }
            
            try {
                const success = await UserControl.renameUser(oldUsername, trimmedUsername);
                if (success) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert(`用户已重命名为 ${trimmedUsername}`, '成功', 'success');
                    }
                    // 刷新用户列表
                    this._switchCategory('users');
                } else {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('重命名用户失败', '错误', 'error');
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SETTINGS', `重命名用户失败: ${error.message}`, error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`重命名用户失败: ${error.message}`, '错误', 'error');
                }
            }
        },
        
        /**
         * 处理设置密码
         */
        _handleSetPassword: async function(username, isAdmin) {
            if (typeof GUIManager === 'undefined') {
                return;
            }
            
            // 如果是管理员，可以直接设置密码（无需当前密码）
            // 如果是用户自己，需要输入当前密码（如果已有密码）
            const currentUser = UserControl.getCurrentUser();
            const userInfo = UserControl.getUserInfo(username);
            const isCurrentUser = username === currentUser;
            const hasPassword = userInfo && userInfo.hasPassword;
            
            let currentPassword = null;
            if (isCurrentUser && hasPassword && !isAdmin) {
                // 非管理员用户修改自己的密码，需要输入当前密码
                currentPassword = await GUIManager.showPrompt('请输入当前密码', '验证身份', '', true);
                if (currentPassword === null) {
                    return; // 用户取消
                }
                
                    if (currentPassword.trim() === '') {
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                            await GUIManager.showAlert('当前密码不能为空', '错误', 'error');
                        }
                        return;
                    }
            }
            
            // 输入新密码
            const newPassword = await GUIManager.showPrompt('请输入新密码', '设置密码', '', true);
            if (newPassword === null) {
                return; // 用户取消
            }
            
            // 如果新密码为空，表示移除密码（仅管理员可以）
                if (newPassword.trim() === '') {
                    if (!isAdmin) {
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                            await GUIManager.showAlert('密码不能为空', '错误', 'error');
                        }
                        return;
                    }
                // 管理员可以移除密码
                try {
                    const success = await UserControl.setPassword(username, null, currentPassword);
                    if (success) {
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                            await GUIManager.showAlert('密码已移除', '成功', 'success');
                        }
                    } else {
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                            await GUIManager.showAlert('移除密码失败', '错误', 'error');
                        }
                    }
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SETTINGS', `移除密码失败: ${error.message}`, error);
                    }
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert(`移除密码失败: ${error.message}`, '错误', 'error');
                    }
                }
                return;
            }
            
            // 确认新密码（明确提示这是确认新密码，不是原密码）
            const confirmPassword = await GUIManager.showPrompt('请再次输入新密码以确认', '确认新密码', '', true);
            if (confirmPassword === null) {
                return; // 用户取消
            }
            
            // 检查是否误输入了原密码（如果提供了当前密码）
            if (currentPassword && confirmPassword === currentPassword) {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('您输入的是当前密码，请重新输入新密码', '提示', 'warning');
                }
                return;
            }
            
            if (newPassword !== confirmPassword) {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('两次输入的密码不一致，请重新输入', '错误', 'error');
                }
                return;
            }
            
            try {
                // 调用setPassword，传入当前密码（如果提供）
                // setPassword方法内部会验证当前密码（对于非管理员用户）
                const success = await UserControl.setPassword(username, newPassword, currentPassword);
                if (success) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('密码已设置', '成功', 'success');
                    }
                } else {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('设置密码失败，请检查当前密码是否正确', '错误', 'error');
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SETTINGS', `设置密码失败: ${error.message}`, error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`设置密码失败: ${error.message}`, '错误', 'error');
                }
            }
        },
        
        /**
         * 渲染创建用户页面
         */
        _renderCreateUserPage: function(container) {
            // 检查UserControl是否可用
            if (typeof UserControl === 'undefined') {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '用户控制系统未加载';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 检查管理员权限
            const isAdmin = UserControl.isAdmin();
            if (!isAdmin) {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '只有管理员可以创建用户';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 创建返回按钮
            const backBtn = document.createElement('button');
            backBtn.textContent = '← 返回';
            backBtn.style.cssText = `
                padding: 8px 16px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: transparent;
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
                font-size: 14px;
                margin-bottom: 24px;
            `;
            backBtn.addEventListener('click', () => {
                this.userManagementPage = 'list';
                this._switchCategory('users');
            });
            container.appendChild(backBtn);
            
            // 创建标题
            const title = document.createElement('h2');
            title.textContent = '创建新用户';
            title.style.cssText = `
                font-size: 24px;
                font-weight: 300;
                color: var(--theme-text, #d7e0dd);
                margin: 0 0 32px 0;
            `;
            container.appendChild(title);
            
            // 创建表单
            const form = document.createElement('div');
            form.style.cssText = `
                max-width: 500px;
                display: flex;
                flex-direction: column;
                gap: 24px;
            `;
            
            // 用户名输入
            const usernameGroup = document.createElement('div');
            usernameGroup.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;
            
            const usernameLabel = document.createElement('label');
            usernameLabel.textContent = '用户名';
            usernameLabel.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            usernameGroup.appendChild(usernameLabel);
            
            const usernameInput = document.createElement('input');
            usernameInput.type = 'text';
            usernameInput.placeholder = '请输入用户名';
            usernameInput.style.cssText = `
                padding: 10px 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                outline: none;
            `;
            usernameGroup.appendChild(usernameInput);
            
            form.appendChild(usernameGroup);
            
            // 用户级别选择
            const levelGroup = document.createElement('div');
            levelGroup.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;
            
            const levelLabel = document.createElement('label');
            levelLabel.textContent = '用户级别';
            levelLabel.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            levelGroup.appendChild(levelLabel);
            
            const levelSelect = document.createElement('select');
            const isDefaultAdmin = UserControl.isDefaultAdmin();
            levelSelect.innerHTML = `
                <option value="${UserControl.USER_LEVEL.USER}">普通用户</option>
                ${isDefaultAdmin ? `<option value="${UserControl.USER_LEVEL.ADMIN}">管理员</option>` : ''}
            `;
            levelSelect.style.cssText = `
                padding: 10px 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                outline: none;
                cursor: pointer;
            `;
            levelGroup.appendChild(levelSelect);
            
            form.appendChild(levelGroup);
            
            // 密码输入（可选）
            const passwordGroup = document.createElement('div');
            passwordGroup.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;
            
            const passwordLabel = document.createElement('label');
            passwordLabel.textContent = '密码（可选，留空表示无密码）';
            passwordLabel.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            passwordGroup.appendChild(passwordLabel);
            
            const passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.placeholder = '请输入密码（可选）';
            passwordInput.style.cssText = `
                padding: 10px 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                outline: none;
            `;
            passwordGroup.appendChild(passwordInput);
            
            form.appendChild(passwordGroup);
            
            // 按钮组
            const buttonGroup = document.createElement('div');
            buttonGroup.style.cssText = `
                display: flex;
                gap: 12px;
                margin-top: 8px;
            `;
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = `
                padding: 10px 20px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: transparent;
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
                font-size: 14px;
            `;
            cancelBtn.addEventListener('click', () => {
                this.userManagementPage = 'list';
                this._switchCategory('users');
            });
            buttonGroup.appendChild(cancelBtn);
            
            const createBtn = document.createElement('button');
            createBtn.textContent = '创建';
            const primaryColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                ? ThemeManager.getCurrentTheme().colors.primary || '#8b5cf6'
                : '#8b5cf6';
            createBtn.style.cssText = `
                padding: 10px 20px;
                border: 1px solid ${primaryColor};
                border-radius: 4px;
                background: ${primaryColor};
                color: #ffffff;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            `;
            createBtn.addEventListener('click', async () => {
                await this._handleCreateUser(usernameInput.value, levelSelect.value, passwordInput.value);
            });
            buttonGroup.appendChild(createBtn);
            
            form.appendChild(buttonGroup);
            container.appendChild(form);
            
            return container;
        },
        
        /**
         * 处理创建用户
         */
        _handleCreateUser: async function(username, level, password) {
            if (!username || username.trim() === '') {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('用户名不能为空', '错误', 'error');
                }
                return;
            }
            
            try {
                const success = await UserControl.createUser(username.trim(), level);
                if (success) {
                    // 如果提供了密码，设置密码
                    if (password && password.trim() !== '') {
                        await UserControl.setPassword(username.trim(), password.trim());
                    }
                    
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('用户创建成功', '成功', 'success');
                    }
                    
                    // 返回用户列表
                    this.userManagementPage = 'list';
                    this._switchCategory('users');
                } else {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('用户创建失败', '错误', 'error');
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SETTINGS', `创建用户失败: ${error.message}`, error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`创建用户失败: ${error.message}`, '错误', 'error');
                }
            }
        },
        
        /**
         * 处理删除用户
         */
        _handleDeleteUser: async function(username) {
            if (typeof GUIManager === 'undefined') {
                return;
            }
            
            // 确认删除
            const confirmed = await GUIManager.showConfirm(
                `确定要删除用户 "${username}" 吗？此操作无法撤销。`,
                '删除用户',
                'warning'
            );
            
            if (!confirmed) {
                return;
            }
            
            try {
                const success = await UserControl.deleteUser(username);
                if (success) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('用户已删除', '成功', 'success');
                    }
                    // 刷新用户列表
                    this._switchCategory('users');
                } else {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('删除用户失败', '错误', 'error');
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SETTINGS', `删除用户失败: ${error.message}`, error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`删除用户失败: ${error.message}`, '错误', 'error');
                }
            }
        },
        
        /**
         * 渲染用户组管理页面
         */
        _renderUserGroupsPage: function(container) {
            // 检查UserGroup是否可用
            if (typeof UserGroup === 'undefined') {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '用户组管理系统未加载';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            const username = this.userManagementPageData.username;
            if (!username) {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '无效的用户名';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 创建返回按钮
            const backBtn = document.createElement('button');
            backBtn.textContent = '← 返回';
            backBtn.style.cssText = `
                padding: 8px 16px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: transparent;
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
                font-size: 14px;
                margin-bottom: 24px;
            `;
            backBtn.addEventListener('click', () => {
                this.userManagementPage = 'list';
                this._switchCategory('users');
            });
            container.appendChild(backBtn);
            
            // 创建标题
            const title = document.createElement('h2');
            title.textContent = `管理用户 "${username}" 的组成员`;
            title.style.cssText = `
                font-size: 24px;
                font-weight: 300;
                color: var(--theme-text, #d7e0dd);
                margin: 0 0 32px 0;
            `;
            container.appendChild(title);
            
            // 异步加载用户所在的组和所有组
            (async () => {
                try {
                    await UserGroup.ensureInitialized();
                    
                    const userGroups = await UserGroup.getUserGroups(username);
                    const allGroups = await UserGroup.getAllGroups();
                    
                    // 创建组列表
                    const groupsList = document.createElement('div');
                    groupsList.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        max-width: 600px;
                    `;
                    
                    allGroups.forEach(group => {
                        const isMember = userGroups.includes(group.name);
                        const groupItem = this._createGroupCheckboxItem(group, username, isMember);
                        groupsList.appendChild(groupItem);
                    });
                    
                    container.appendChild(groupsList);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SETTINGS', `加载用户组信息失败: ${error.message}`, error);
                    }
                    const errorMsg = document.createElement('div');
                    errorMsg.textContent = `加载失败: ${error.message}`;
                    errorMsg.style.cssText = `
                        padding: 24px;
                        text-align: center;
                        color: var(--theme-text-secondary, #b8c5c0);
                    `;
                    container.appendChild(errorMsg);
                }
            })();
            
            return container;
        },
        
        /**
         * 创建组复选框项
         */
        _createGroupCheckboxItem: function(group, username, isMember) {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 16px;
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 8px;
            `;
            
            // 复选框
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = isMember;
            checkbox.disabled = group.name === 'admins' || group.name === 'users'; // 默认组不能手动管理
            checkbox.style.cssText = `
                width: 20px;
                height: 20px;
                cursor: ${checkbox.disabled ? 'not-allowed' : 'pointer'};
            `;
            
            checkbox.addEventListener('change', async (e) => {
                if (checkbox.disabled) {
                    return;
                }
                
                try {
                    if (e.target.checked) {
                        const success = await UserGroup.addMember(group.name, username);
                        if (!success) {
                            checkbox.checked = false;
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert(`将用户添加到组 "${group.name}" 失败`, '错误', 'error');
                            }
                        } else {
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert(`用户已添加到组 "${group.name}"`, '成功', 'success');
                            }
                        }
                    } else {
                        const success = await UserGroup.removeMember(group.name, username);
                        if (!success) {
                            checkbox.checked = true;
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert(`从组 "${group.name}" 移除用户失败`, '错误', 'error');
                            }
                        } else {
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert(`用户已从组 "${group.name}" 移除`, '成功', 'success');
                            }
                        }
                    }
                } catch (error) {
                    checkbox.checked = !checkbox.checked;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SETTINGS', `管理组成员失败: ${error.message}`, error);
                    }
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert(`操作失败: ${error.message}`, '错误', 'error');
                    }
                }
            });
            
            item.appendChild(checkbox);
            
            // 组信息
            const groupInfo = document.createElement('div');
            groupInfo.style.cssText = `flex: 1; display: flex; flex-direction: column; gap: 4px;`;
            
            const groupName = document.createElement('div');
            groupName.textContent = group.name;
            groupName.style.cssText = `
                font-size: 16px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            groupInfo.appendChild(groupName);
            
            if (group.description) {
                const groupDesc = document.createElement('div');
                groupDesc.textContent = group.description;
                groupDesc.style.cssText = `
                    font-size: 13px;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                groupInfo.appendChild(groupDesc);
            }
            
            // 组类型标签
            const typeTag = document.createElement('span');
            typeTag.textContent = group.type === 'ADMIN_GROUP' ? '管理员组' : '用户组';
            typeTag.style.cssText = `
                font-size: 12px;
                padding: 2px 8px;
                border-radius: 4px;
                background: ${group.type === 'ADMIN_GROUP' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(108, 117, 125, 0.2)'};
                color: ${group.type === 'ADMIN_GROUP' ? '#8b5cf6' : '#6c757d'};
                align-self: flex-start;
                margin-top: 4px;
            `;
            groupInfo.appendChild(typeTag);
            
            item.appendChild(groupInfo);
            
            // 如果是默认组，显示提示
            if (checkbox.disabled) {
                const hint = document.createElement('span');
                hint.textContent = '（默认组）';
                hint.style.cssText = `
                    font-size: 12px;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                item.appendChild(hint);
            }
            
            return item;
        },
        
        /**
         * 渲染组管理页面
         */
        _renderGroupsPage: function(container) {
            // 检查UserGroup是否可用
            if (typeof UserGroup === 'undefined') {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '用户组管理系统未加载';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 检查管理员权限
            const isAdmin = typeof UserControl !== 'undefined' ? UserControl.isAdmin() : false;
            if (!isAdmin) {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '只有管理员可以管理组';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 创建返回按钮
            const backBtn = document.createElement('button');
            backBtn.textContent = '← 返回';
            backBtn.style.cssText = `
                padding: 8px 16px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: transparent;
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
                font-size: 14px;
                margin-bottom: 24px;
            `;
            backBtn.addEventListener('click', () => {
                this.userManagementPage = 'list';
                this._switchCategory('users');
            });
            container.appendChild(backBtn);
            
            // 创建标题和工具栏
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 32px;
            `;
            
            const title = document.createElement('h2');
            title.textContent = '用户组管理';
            title.style.cssText = `
                font-size: 24px;
                font-weight: 300;
                color: var(--theme-text, #d7e0dd);
                margin: 0;
            `;
            header.appendChild(title);
            
            // 创建组按钮
            const createBtn = document.createElement('button');
            createBtn.textContent = '+ 创建组';
            const primaryColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                ? ThemeManager.getCurrentTheme().colors.primary || '#8b5cf6'
                : '#8b5cf6';
            createBtn.style.cssText = `
                padding: 8px 16px;
                border: 1px solid ${primaryColor};
                border-radius: 4px;
                background: ${primaryColor};
                color: #ffffff;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            `;
            createBtn.addEventListener('click', async () => {
                await this._handleCreateGroup();
            });
            header.appendChild(createBtn);
            
            container.appendChild(header);
            
            // 异步加载所有组
            (async () => {
                try {
                    await UserGroup.ensureInitialized();
                    
                    const groups = await UserGroup.getAllGroups();
                    
                    if (groups.length === 0) {
                        const emptyMsg = document.createElement('div');
                        emptyMsg.textContent = '暂无用户组';
                        emptyMsg.style.cssText = `
                            padding: 48px;
                            text-align: center;
                            color: var(--theme-text-secondary, #b8c5c0);
                        `;
                        container.appendChild(emptyMsg);
                        return;
                    }
                    
                    // 创建组列表
                    const groupsList = document.createElement('div');
                    groupsList.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                        max-width: 800px;
                    `;
                    
                    groups.forEach(group => {
                        const groupCard = this._createGroupCard(group);
                        groupsList.appendChild(groupCard);
                    });
                    
                    container.appendChild(groupsList);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SETTINGS', `加载用户组失败: ${error.message}`, error);
                    }
                    const errorMsg = document.createElement('div');
                    errorMsg.textContent = `加载失败: ${error.message}`;
                    errorMsg.style.cssText = `
                        padding: 24px;
                        text-align: center;
                        color: var(--theme-text-secondary, #b8c5c0);
                    `;
                    container.appendChild(errorMsg);
                }
            })();
            
            return container;
        },
        
        /**
         * 创建组卡片
         */
        _createGroupCard: function(group) {
            const card = document.createElement('div');
            card.style.cssText = `
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 8px;
                padding: 20px;
            `;
            
            // 组信息头部
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 16px;
            `;
            
            const groupInfo = document.createElement('div');
            groupInfo.style.cssText = `flex: 1;`;
            
            const groupName = document.createElement('div');
            groupName.textContent = group.name;
            groupName.style.cssText = `
                font-size: 18px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
                margin-bottom: 8px;
            `;
            groupInfo.appendChild(groupName);
            
            if (group.description) {
                const groupDesc = document.createElement('div');
                groupDesc.textContent = group.description;
                groupDesc.style.cssText = `
                    font-size: 14px;
                    color: var(--theme-text-secondary, #b8c5c0);
                    margin-bottom: 8px;
                `;
                groupInfo.appendChild(groupDesc);
            }
            
            // 组类型和成员数
            const metaInfo = document.createElement('div');
            metaInfo.style.cssText = `display: flex; gap: 12px; align-items: center;`;
            
            const typeTag = document.createElement('span');
            typeTag.textContent = group.type === 'ADMIN_GROUP' ? '管理员组' : '用户组';
            typeTag.style.cssText = `
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 4px;
                background: ${group.type === 'ADMIN_GROUP' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(108, 117, 125, 0.2)'};
                color: ${group.type === 'ADMIN_GROUP' ? '#8b5cf6' : '#6c757d'};
            `;
            metaInfo.appendChild(typeTag);
            
            const memberCount = document.createElement('span');
            memberCount.textContent = `${group.members.length} 个成员`;
            memberCount.style.cssText = `
                font-size: 12px;
                color: var(--theme-text-secondary, #b8c5c0);
            `;
            metaInfo.appendChild(memberCount);
            
            if (group.name === 'admins' || group.name === 'users') {
                const defaultTag = document.createElement('span');
                defaultTag.textContent = '默认组';
                defaultTag.style.cssText = `
                    font-size: 12px;
                    padding: 4px 8px;
                    border-radius: 4px;
                    background: rgba(255, 193, 7, 0.2);
                    color: #ffc107;
                `;
                metaInfo.appendChild(defaultTag);
            }
            
            groupInfo.appendChild(metaInfo);
            header.appendChild(groupInfo);
            
            // 操作按钮
            const actions = document.createElement('div');
            actions.style.cssText = `display: flex; gap: 8px;`;
            
            // 查看成员按钮
            const viewBtn = document.createElement('button');
            viewBtn.textContent = '查看成员';
            viewBtn.style.cssText = `
                padding: 6px 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: transparent;
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
                font-size: 13px;
            `;
            viewBtn.addEventListener('click', () => {
                this.userManagementPage = 'groupDetail';
                this.userManagementPageData = { groupName: group.name };
                this._switchCategory('users');
            });
            actions.appendChild(viewBtn);
            
            // 删除按钮（非默认组）
            if (group.name !== 'admins' && group.name !== 'users') {
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '删除';
                deleteBtn.style.cssText = `
                    padding: 6px 12px;
                    border: 1px solid var(--theme-border, rgba(255, 0, 0, 0.3));
                    border-radius: 4px;
                    background: transparent;
                    color: #ff6b6b;
                    cursor: pointer;
                    font-size: 13px;
                `;
                deleteBtn.addEventListener('click', async () => {
                    await this._handleDeleteGroup(group.name);
                });
                actions.appendChild(deleteBtn);
            }
            
            header.appendChild(actions);
            card.appendChild(header);
            
            // 成员列表预览（显示前5个）
            if (group.members.length > 0) {
                const membersPreview = document.createElement('div');
                membersPreview.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 16px;
                    padding-top: 16px;
                    border-top: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                `;
                
                const previewCount = Math.min(5, group.members.length);
                for (let i = 0; i < previewCount; i++) {
                    const memberTag = document.createElement('span');
                    memberTag.textContent = group.members[i];
                    memberTag.style.cssText = `
                        font-size: 12px;
                        padding: 4px 8px;
                        border-radius: 4px;
                        background: var(--theme-background-tertiary, #1a1f28);
                        color: var(--theme-text, #d7e0dd);
                    `;
                    membersPreview.appendChild(memberTag);
                }
                
                if (group.members.length > 5) {
                    const moreTag = document.createElement('span');
                    moreTag.textContent = `+${group.members.length - 5} 更多`;
                    moreTag.style.cssText = `
                        font-size: 12px;
                        padding: 4px 8px;
                        border-radius: 4px;
                        background: var(--theme-background-tertiary, #1a1f28);
                        color: var(--theme-text-secondary, #b8c5c0);
                    `;
                    membersPreview.appendChild(moreTag);
                }
                
                card.appendChild(membersPreview);
            }
            
            return card;
        },
        
        /**
         * 渲染组详情页面
         */
        _renderGroupDetailPage: function(container) {
            // 检查UserGroup是否可用
            if (typeof UserGroup === 'undefined') {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '用户组管理系统未加载';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            const groupName = this.userManagementPageData.groupName;
            if (!groupName) {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '无效的组名';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 创建返回按钮
            const backBtn = document.createElement('button');
            backBtn.textContent = '← 返回';
            backBtn.style.cssText = `
                padding: 8px 16px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: transparent;
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
                font-size: 14px;
                margin-bottom: 24px;
            `;
            backBtn.addEventListener('click', () => {
                this.userManagementPage = 'groups';
                this._switchCategory('users');
            });
            container.appendChild(backBtn);
            
            // 异步加载组信息
            (async () => {
                try {
                    await UserGroup.ensureInitialized();
                    
                    const group = await UserGroup.getGroup(groupName);
                    if (!group) {
                        const errorMsg = document.createElement('div');
                        errorMsg.textContent = '组不存在';
                        errorMsg.style.cssText = `
                            padding: 24px;
                            text-align: center;
                            color: var(--theme-text-secondary, #b8c5c0);
                        `;
                        container.appendChild(errorMsg);
                        return;
                    }
                    
                    // 创建标题
                    const title = document.createElement('h2');
                    title.textContent = `组 "${group.name}" 的成员`;
                    title.style.cssText = `
                        font-size: 24px;
                        font-weight: 300;
                        color: var(--theme-text, #d7e0dd);
                        margin: 0 0 16px 0;
                    `;
                    container.appendChild(title);
                    
                    if (group.description) {
                        const desc = document.createElement('div');
                        desc.textContent = group.description;
                        desc.style.cssText = `
                            font-size: 14px;
                            color: var(--theme-text-secondary, #b8c5c0);
                            margin-bottom: 24px;
                        `;
                        container.appendChild(desc);
                    }
                    
                    if (group.members.length === 0) {
                        const emptyMsg = document.createElement('div');
                        emptyMsg.textContent = '此组暂无成员';
                        emptyMsg.style.cssText = `
                            padding: 48px;
                            text-align: center;
                            color: var(--theme-text-secondary, #b8c5c0);
                        `;
                        container.appendChild(emptyMsg);
                        return;
                    }
                    
                    // 创建成员列表
                    const membersList = document.createElement('div');
                    membersList.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        max-width: 600px;
                    `;
                    
                    // 获取所有用户信息
                    const allUsers = typeof UserControl !== 'undefined' ? UserControl.listUsers() : [];
                    const userMap = new Map();
                    allUsers.forEach(user => {
                        userMap.set(user.username, user);
                    });
                    
                    group.members.forEach(username => {
                        const user = userMap.get(username);
                        const memberItem = document.createElement('div');
                        memberItem.style.cssText = `
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            padding: 12px 16px;
                            background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                            border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                            border-radius: 8px;
                        `;
                        
                        const usernameEl = document.createElement('div');
                        usernameEl.textContent = username;
                        usernameEl.style.cssText = `
                            font-size: 14px;
                            color: var(--theme-text, #d7e0dd);
                        `;
                        memberItem.appendChild(usernameEl);
                        
                        // 如果是默认组，不能移除成员
                        const isDefaultGroup = groupName === 'admins' || groupName === 'users';
                        if (!isDefaultGroup) {
                            const removeBtn = document.createElement('button');
                            removeBtn.textContent = '移除';
                            removeBtn.style.cssText = `
                                padding: 4px 12px;
                                border: 1px solid var(--theme-border, rgba(255, 0, 0, 0.3));
                                border-radius: 4px;
                                background: transparent;
                                color: #ff6b6b;
                                cursor: pointer;
                                font-size: 12px;
                            `;
                            removeBtn.addEventListener('click', async () => {
                                await this._handleRemoveMemberFromGroup(groupName, username);
                            });
                            memberItem.appendChild(removeBtn);
                        }
                        
                        membersList.appendChild(memberItem);
                    });
                    
                    container.appendChild(membersList);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('SETTINGS', `加载组详情失败: ${error.message}`, error);
                    }
                    const errorMsg = document.createElement('div');
                    errorMsg.textContent = `加载失败: ${error.message}`;
                    errorMsg.style.cssText = `
                        padding: 24px;
                        text-align: center;
                        color: var(--theme-text-secondary, #b8c5c0);
                    `;
                    container.appendChild(errorMsg);
                }
            })();
            
            return container;
        },
        
        /**
         * 处理创建组（使用更友好的方式）
         */
        _handleCreateGroup: async function() {
            // 直接切换到创建组页面（使用页面切换，而不是弹窗）
            this.userManagementPage = 'createGroup';
            this.userManagementPageData = {};
            this._switchCategory('users');
        },
        
        /**
         * 渲染创建组页面
         */
        _renderCreateGroupPage: function(container) {
            // 检查UserGroup是否可用
            if (typeof UserGroup === 'undefined') {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '用户组管理系统未加载';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 检查管理员权限
            const isAdmin = typeof UserControl !== 'undefined' ? UserControl.isAdmin() : false;
            if (!isAdmin) {
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '只有管理员可以创建组';
                errorMsg.style.cssText = `
                    padding: 24px;
                    text-align: center;
                    color: var(--theme-text-secondary, #b8c5c0);
                `;
                container.appendChild(errorMsg);
                return container;
            }
            
            // 创建返回按钮
            const backBtn = document.createElement('button');
            backBtn.textContent = '← 返回';
            backBtn.style.cssText = `
                padding: 8px 16px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: transparent;
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
                font-size: 14px;
                margin-bottom: 24px;
            `;
            backBtn.addEventListener('click', () => {
                this.userManagementPage = 'groups';
                this._switchCategory('users');
            });
            container.appendChild(backBtn);
            
            // 创建标题
            const title = document.createElement('h2');
            title.textContent = '创建新组';
            title.style.cssText = `
                font-size: 24px;
                font-weight: 300;
                color: var(--theme-text, #d7e0dd);
                margin: 0 0 32px 0;
            `;
            container.appendChild(title);
            
            // 创建表单
            const form = document.createElement('div');
            form.style.cssText = `
                max-width: 500px;
                display: flex;
                flex-direction: column;
                gap: 24px;
            `;
            
            // 组名输入
            const nameGroup = document.createElement('div');
            nameGroup.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;
            
            const nameLabel = document.createElement('label');
            nameLabel.textContent = '组名';
            nameLabel.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            nameGroup.appendChild(nameLabel);
            
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.placeholder = '请输入组名';
            nameInput.style.cssText = `
                padding: 10px 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                outline: none;
            `;
            nameGroup.appendChild(nameInput);
            
            form.appendChild(nameGroup);
            
            // 组类型选择
            const typeGroup = document.createElement('div');
            typeGroup.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;
            
            const typeLabel = document.createElement('label');
            typeLabel.textContent = '组类型';
            typeLabel.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            typeGroup.appendChild(typeLabel);
            
            const typeSelect = document.createElement('select');
            const isDefaultAdmin = typeof UserControl !== 'undefined' ? UserControl.isDefaultAdmin() : false;
            // 确保 UserGroup 已定义
            const userGroupType = typeof UserGroup !== 'undefined' ? UserGroup.GROUP_TYPE.USER_GROUP : 'USER_GROUP';
            const adminGroupType = typeof UserGroup !== 'undefined' ? UserGroup.GROUP_TYPE.ADMIN_GROUP : 'ADMIN_GROUP';
            typeSelect.innerHTML = `
                <option value="${userGroupType}">普通用户组</option>
                ${isDefaultAdmin ? `<option value="${adminGroupType}">管理员组</option>` : ''}
            `;
            typeSelect.style.cssText = `
                padding: 10px 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                outline: none;
                cursor: pointer;
            `;
            typeGroup.appendChild(typeSelect);
            
            form.appendChild(typeGroup);
            
            // 组描述输入
            const descGroup = document.createElement('div');
            descGroup.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;
            
            const descLabel = document.createElement('label');
            descLabel.textContent = '组描述（可选）';
            descLabel.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--theme-text, #d7e0dd);
            `;
            descGroup.appendChild(descLabel);
            
            const descInput = document.createElement('input');
            descInput.type = 'text';
            descInput.placeholder = '请输入组描述';
            descInput.style.cssText = `
                padding: 10px 12px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: var(--theme-background-elevated, var(--theme-background-secondary, #252b35));
                color: var(--theme-text, #d7e0dd);
                font-size: 14px;
                outline: none;
            `;
            descGroup.appendChild(descInput);
            
            form.appendChild(descGroup);
            
            // 按钮组
            const buttonGroup = document.createElement('div');
            buttonGroup.style.cssText = `
                display: flex;
                gap: 12px;
                margin-top: 8px;
            `;
            
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button'; // 明确指定按钮类型，防止表单提交
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = `
                padding: 10px 20px;
                border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.25));
                border-radius: 4px;
                background: transparent;
                color: var(--theme-text, #d7e0dd);
                cursor: pointer;
                font-size: 14px;
            `;
            // 直接使用 addEventListener，与创建用户页面的取消按钮保持一致
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.userManagementPage = 'groups';
                this._switchCategory('users');
            });
            buttonGroup.appendChild(cancelBtn);
            
            const createBtn = document.createElement('button');
            createBtn.type = 'button'; // 明确指定按钮类型，防止表单提交
            createBtn.textContent = '创建';
            const primaryColor = typeof ThemeManager !== 'undefined' && ThemeManager.getCurrentTheme() 
                ? ThemeManager.getCurrentTheme().colors.primary || '#8b5cf6'
                : '#8b5cf6';
            createBtn.style.cssText = `
                padding: 10px 20px;
                border: 1px solid ${primaryColor};
                border-radius: 4px;
                background: ${primaryColor};
                color: #ffffff;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            `;
            // 直接使用 addEventListener，与创建用户页面的创建按钮保持一致
            // 保存输入元素的引用（确保在事件处理函数中可以访问）
            const nameInputRef = nameInput;
            const typeSelectRef = typeSelect;
            const descInputRef = descInput;
            
            createBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('SETTINGS', '创建组按钮被点击', { 
                        groupName: nameInputRef.value, 
                        groupType: typeSelectRef.value,
                        description: descInputRef.value 
                    });
                }
                await this._handleCreateGroupSubmit(nameInputRef.value, typeSelectRef.value, descInputRef.value);
            });
            
            buttonGroup.appendChild(createBtn);
            
            form.appendChild(buttonGroup);
            container.appendChild(form);
            
            return container;
        },
        
        /**
         * 处理创建组提交
         */
        _handleCreateGroupSubmit: async function(groupName, groupType, description) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('SETTINGS', `开始创建组: ${groupName}, 类型: ${groupType}`);
            }
            
            if (!groupName || groupName.trim() === '') {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('组名不能为空', '错误', 'error');
                }
                return;
            }
            
            // 检查 UserGroup 是否可用
            if (typeof UserGroup === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SETTINGS', 'UserGroup 未定义');
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('用户组管理系统未加载', '错误', 'error');
                }
                return;
            }
            
            try {
                // 确保 UserGroup 已初始化
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('SETTINGS', '等待 UserGroup.ensureInitialized...');
                }
                await UserGroup.ensureInitialized();
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('SETTINGS', `UserGroup 已初始化，调用 UserGroup.createGroup: ${groupName.trim()}, ${groupType}, ${description || 'null'}`);
                }
                
                const success = await UserGroup.createGroup(
                    groupName.trim(),
                    groupType,
                    description && description.trim() !== '' ? description.trim() : null
                );
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('SETTINGS', `UserGroup.createGroup 返回: ${success}`);
                }
                
                if (success) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('组创建成功', '成功', 'success');
                    }
                    // 返回组列表页面
                    this.userManagementPage = 'groups';
                    this._switchCategory('users');
                    // 触发重新渲染以确保组列表更新
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('SETTINGS', '返回组列表页面');
                    }
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('SETTINGS', '组创建失败，但未抛出异常');
                    }
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('组创建失败，请检查权限或组名是否已存在', '错误', 'error');
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SETTINGS', `创建组失败: ${error.message}`, error);
                    KernelLogger.error('SETTINGS', `创建组失败堆栈: ${error.stack}`);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`创建组失败: ${error.message}`, '错误', 'error');
                }
            }
        },
        
        /**
         * 处理删除组
         */
        _handleDeleteGroup: async function(groupName) {
            if (typeof GUIManager === 'undefined') {
                return;
            }
            
            // 确认删除
            const confirmed = await GUIManager.showConfirm(
                `确定要删除组 "${groupName}" 吗？此操作无法撤销。`,
                '删除组',
                'warning'
            );
            
            if (!confirmed) {
                return;
            }
            
            try {
                const success = await UserGroup.deleteGroup(groupName);
                if (success) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('组已删除', '成功', 'success');
                    }
                    // 刷新组列表
                    this.userManagementPage = 'groups';
                    this._switchCategory('users');
                } else {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('删除组失败', '错误', 'error');
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SETTINGS', `删除组失败: ${error.message}`, error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`删除组失败: ${error.message}`, '错误', 'error');
                }
            }
        },
        
        /**
         * 处理从组中移除成员
         */
        _handleRemoveMemberFromGroup: async function(groupName, username) {
            if (typeof GUIManager === 'undefined') {
                return;
            }
            
            try {
                const success = await UserGroup.removeMember(groupName, username);
                if (success) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert(`用户已从组 "${groupName}" 移除`, '成功', 'success');
                    }
                    // 刷新组详情
                    this._switchCategory('users');
                } else {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('移除成员失败', '错误', 'error');
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('SETTINGS', `移除成员失败: ${error.message}`, error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`移除成员失败: ${error.message}`, '错误', 'error');
                }
            }
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.SETTINGS = SETTINGS;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.SETTINGS = SETTINGS;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

