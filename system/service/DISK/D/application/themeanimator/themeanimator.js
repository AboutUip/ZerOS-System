// ZerOS 主题与动画管理器
// 负责系统主题和GUI风格的切换，以及动画参数的调整
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const THEMEANIMATOR = {
        pid: null,
        window: null,
        currentThemeId: null,
        currentStyleId: null,
        currentAnimationPresetId: null,
        themeChangeUnsubscribe: null,
        styleChangeUnsubscribe: null,
        animationPresetChangeUnsubscribe: null,
        _loadingRandomAnimeBg: false,  // 防止重复请求标志
        
        __init__: async function(pid, initArgs) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', `__init__ 被调用, PID: ${pid}`);
            }
            this.pid = pid;
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'themeanimator-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 900px;
                height: 700px;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                // 获取程序图标
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('themeanimator');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '主题与动画管理器',
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
            
            // 创建主内容区域
            const content = document.createElement('div');
            content.className = 'themeanimator-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                padding: 20px;
                gap: 20px;
            `;
            
            // 创建标签页容器
            const tabsContainer = this._createTabsContainer();
            content.appendChild(tabsContainer);
            
            // 创建内容面板容器
            const panelsContainer = document.createElement('div');
            panelsContainer.className = 'themeanimator-panels';
            panelsContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding-top: 20px;
            `;
            
            // 创建主题管理面板
            const themePanel = this._createThemePanel();
            themePanel.classList.add('active');
            themePanel.style.display = 'flex';
            panelsContainer.appendChild(themePanel);
            
            // 创建风格管理面板
            const stylePanel = this._createStylePanel();
            panelsContainer.appendChild(stylePanel);
            
            // 创建背景图管理面板
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', '准备创建背景面板');
            }
            const backgroundPanel = this._createBackgroundPanel();
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', '背景面板创建完成', backgroundPanel);
            }
            panelsContainer.appendChild(backgroundPanel);
            
            // 创建动画管理面板
            const animationPanel = this._createAnimationPanel();
            panelsContainer.appendChild(animationPanel);
            
            content.appendChild(panelsContainer);
            this.window.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 初始化数据
            await this._loadCurrentSettings();
            
            // 监听主题和风格变更
            this._setupListeners();
            
            // 注册本地背景卡片的右键菜单（删除功能）
            this._registerBackgroundContextMenu();
        },
        
        __info__: function() {
            return {
                name: '主题管理器',
                type: 'GUI',
                description: '系统主题与动画的调控与管理',
                version: '1.0.0',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.THEME_READ,
                    PermissionManager.PERMISSION.THEME_WRITE,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.CACHE_READ,
                    PermissionManager.PERMISSION.CACHE_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE
                ] : []
            };
        },
        
        __exit__: function(pid, force) {
            // 防止递归调用：如果已经标记为退出中，直接返回
            if (this._exiting) {
                return;
            }
            this._exiting = true;
            
            // 移除监听器（onThemeChange和onStyleChange返回取消函数）
            if (this.themeChangeUnsubscribe && typeof this.themeChangeUnsubscribe === 'function') {
                try {
                    this.themeChangeUnsubscribe();
                } catch (e) {
                    // 忽略错误
                }
            }
            if (this.styleChangeUnsubscribe && typeof this.styleChangeUnsubscribe === 'function') {
                try {
                    this.styleChangeUnsubscribe();
                } catch (e) {
                    // 忽略错误
                }
            }
            if (this.animationPresetChangeUnsubscribe && typeof this.animationPresetChangeUnsubscribe === 'function') {
                try {
                    this.animationPresetChangeUnsubscribe();
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 移除窗口
            if (this.window && this.window.parentElement) {
                try {
                    this.window.parentElement.removeChild(this.window);
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 注销窗口
            if (typeof GUIManager !== 'undefined' && this.pid) {
                try {
                    GUIManager.unregisterWindow(this.pid);
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 注意：不要在这里调用 ProcessManager.killProgram，因为 killProgram 会调用 __exit__
            // ProcessManager 会在调用 __exit__ 后自动清理资源
        },
        
        /**
         * 创建标签页容器
         */
        _createTabsContainer: function() {
            const container = document.createElement('div');
            container.className = 'themeanimator-tabs';
            container.style.cssText = `
                display: flex;
                gap: 8px;
                border-bottom: 2px solid rgba(139, 92, 246, 0.3);
                padding-bottom: 8px;
            `;
            
            const tabs = [
                { id: 'theme', label: '主题', icon: '🎨' },
                { id: 'style', label: '风格', icon: '💅' },
                { id: 'background', label: '背景', icon: '🖼️' },
                { id: 'animation', label: '动画', icon: '✨' }
            ];
            
            tabs.forEach((tab, index) => {
                const tabBtn = document.createElement('button');
                tabBtn.className = 'themeanimator-tab';
                tabBtn.dataset.tab = tab.id;
                tabBtn.style.cssText = `
                    padding: 10px 20px;
                    background: transparent;
                    border: none;
                    color: rgba(215, 224, 221, 0.7);
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    border-radius: 6px 6px 0 0;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                tabBtn.innerHTML = `<span>${tab.icon}</span><span>${tab.label}</span>`;
                
                if (index === 0) {
                    tabBtn.classList.add('active');
                    tabBtn.style.color = 'rgba(139, 92, 246, 1)';
                    tabBtn.style.background = 'rgba(139, 92, 246, 0.1)';
                }
                
                tabBtn.addEventListener('click', () => {
                    this._switchTab(tab.id);
                });
                
                tabBtn.addEventListener('mouseenter', () => {
                    if (!tabBtn.classList.contains('active')) {
                        tabBtn.style.background = 'rgba(139, 92, 246, 0.05)';
                    }
                });
                
                tabBtn.addEventListener('mouseleave', () => {
                    if (!tabBtn.classList.contains('active')) {
                        tabBtn.style.background = 'transparent';
                    }
                });
                
                container.appendChild(tabBtn);
            });
            
            return container;
        },
        
        /**
         * 切换标签页
         */
        _switchTab: function(tabId) {
            // 更新标签按钮
            const tabs = this.window.querySelectorAll('.themeanimator-tab');
            tabs.forEach(tab => {
                if (tab.dataset.tab === tabId) {
                    tab.classList.add('active');
                    tab.style.color = 'rgba(139, 92, 246, 1)';
                    tab.style.background = 'rgba(139, 92, 246, 0.1)';
                } else {
                    tab.classList.remove('active');
                    tab.style.color = 'rgba(215, 224, 221, 0.7)';
                    tab.style.background = 'transparent';
                }
            });
            
            // 更新面板
            const panels = this.window.querySelectorAll('.themeanimator-panel');
            panels.forEach(panel => {
                if (panel.dataset.panel === tabId) {
                    panel.style.display = 'flex';
                    panel.classList.add('active');
                    
                    // 如果是背景面板，确保按钮可见
                    if (tabId === 'background') {
                        setTimeout(() => {
                            const insideBtn = panel.querySelector('#select-local-image-btn-inside');
                            if (insideBtn) {
                                insideBtn.style.display = 'block';
                                insideBtn.style.visibility = 'visible';
                                insideBtn.style.opacity = '1';
                            }
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', '背景面板显示，按钮状态', {
                                    insideBtn: insideBtn ? '存在且可见' : '不存在'
                                });
                            }
                        }, 50);
                    }
                } else {
                    panel.style.display = 'none';
                    panel.classList.remove('active');
                }
            });
        },
        
        /**
         * 创建主题管理面板
         */
        _createThemePanel: function() {
            const panel = document.createElement('div');
            panel.className = 'themeanimator-panel';
            panel.dataset.panel = 'theme';
            panel.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 20px;
            `;
            
            // 当前主题显示
            const currentSection = document.createElement('div');
            currentSection.className = 'themeanimator-section';
            currentSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">当前主题</h3>
                <div class="current-theme-display" style="
                    padding: 16px;
                    background: rgba(139, 92, 246, 0.1);
                    border-radius: 8px;
                    border: 1px solid rgba(139, 92, 246, 0.3);
                ">
                    <div id="current-theme-name" style="font-size: 18px; font-weight: 600; color: rgba(139, 92, 246, 1); margin-bottom: 8px;">加载中...</div>
                    <div id="current-theme-description" style="font-size: 13px; color: rgba(215, 224, 221, 0.7);">正在加载主题信息...</div>
                </div>
            `;
            panel.appendChild(currentSection);
            
            // 主题列表
            const themesSection = document.createElement('div');
            themesSection.className = 'themeanimator-section';
            themesSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">可用主题</h3>
                <div id="themes-list" class="themes-list" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                "></div>
            `;
            panel.appendChild(themesSection);
            
            // 加载主题列表
            this._loadThemesList(themesSection.querySelector('#themes-list'));
            
            return panel;
        },
        
        /**
         * 创建风格管理面板
         */
        _createStylePanel: function() {
            const panel = document.createElement('div');
            panel.className = 'themeanimator-panel';
            panel.dataset.panel = 'style';
            panel.style.cssText = `
                display: none;
                flex-direction: column;
                gap: 20px;
            `;
            
            // 当前风格显示
            const currentSection = document.createElement('div');
            currentSection.className = 'themeanimator-section';
            currentSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">当前风格</h3>
                <div class="current-style-display" style="
                    padding: 16px;
                    background: rgba(139, 92, 246, 0.1);
                    border-radius: 8px;
                    border: 1px solid rgba(139, 92, 246, 0.3);
                ">
                    <div id="current-style-name" style="font-size: 18px; font-weight: 600; color: rgba(139, 92, 246, 1); margin-bottom: 8px;">加载中...</div>
                    <div id="current-style-description" style="font-size: 13px; color: rgba(215, 224, 221, 0.7);">正在加载风格信息...</div>
                </div>
            `;
            panel.appendChild(currentSection);
            
            // 风格列表
            const stylesSection = document.createElement('div');
            stylesSection.className = 'themeanimator-section';
            stylesSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">可用风格</h3>
                <div id="styles-list" class="styles-list" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                "></div>
            `;
            panel.appendChild(stylesSection);
            
            // 加载风格列表
            this._loadStylesList(stylesSection.querySelector('#styles-list'));
            
            return panel;
        },
        
        /**
         * 创建背景图管理面板
         */
        _createBackgroundPanel: function() {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', '开始创建背景面板');
            }
            const panel = document.createElement('div');
            panel.className = 'themeanimator-panel';
            panel.dataset.panel = 'background';
            panel.style.cssText = `
                display: none;
                flex-direction: column;
                gap: 20px;
            `;
            
            // 当前背景显示
            const currentSection = document.createElement('div');
            currentSection.className = 'themeanimator-section';
            
            // 创建标题
            const sectionTitle = document.createElement('h3');
            sectionTitle.style.cssText = `
                margin: 0 0 12px 0;
                color: rgba(215, 224, 221, 0.9);
                font-size: 16px;
                font-weight: 600;
            `;
            sectionTitle.textContent = '当前背景';
            currentSection.appendChild(sectionTitle);
            
            // 当前背景信息显示
            const currentBackgroundDisplay = document.createElement('div');
            currentBackgroundDisplay.className = 'current-background-display';
            currentBackgroundDisplay.style.cssText = `
                padding: 16px;
                background: rgba(139, 92, 246, 0.1);
                border-radius: 8px;
                border: 1px solid rgba(139, 92, 246, 0.3);
            `;
            
            // 创建名称元素
            const nameElement = document.createElement('div');
            nameElement.id = 'current-background-name';
            nameElement.style.cssText = `
                font-size: 18px;
                font-weight: 600;
                color: rgba(139, 92, 246, 1);
                margin-bottom: 8px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            nameElement.textContent = '加载中...';
            currentBackgroundDisplay.appendChild(nameElement);
            
            // 创建描述元素
            const descElement = document.createElement('div');
            descElement.id = 'current-background-description';
            descElement.style.cssText = `
                font-size: 13px;
                color: rgba(215, 224, 221, 0.7);
                margin-bottom: 12px;
                overflow: hidden;
                word-break: break-all;
                word-wrap: break-word;
                line-height: 1.5;
            `;
            descElement.textContent = '正在加载背景信息...';
            currentBackgroundDisplay.appendChild(descElement);
            
            // 在当前背景显示框内也添加一个按钮（更明显）
            const selectLocalImageBtnInside = document.createElement('button');
            selectLocalImageBtnInside.textContent = '📁 选择本地图片/视频作为背景';
            selectLocalImageBtnInside.id = 'select-local-image-btn-inside';
            selectLocalImageBtnInside.className = 'select-local-image-btn-inside';
            selectLocalImageBtnInside.style.cssText = `
                width: 100% !important;
                padding: 10px 16px !important;
                background: rgba(139, 92, 246, 0.2) !important;
                border: 2px solid rgba(139, 92, 246, 0.5) !important;
                border-radius: 6px !important;
                color: rgba(215, 224, 221, 0.95) !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: all 0.2s ease;
                margin-top: 8px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                box-sizing: border-box !important;
                position: relative !important;
            `;
            selectLocalImageBtnInside.addEventListener('mouseenter', () => {
                selectLocalImageBtnInside.style.background = 'rgba(139, 92, 246, 0.3) !important';
                selectLocalImageBtnInside.style.borderColor = 'rgba(139, 92, 246, 0.7) !important';
                selectLocalImageBtnInside.style.transform = 'translateY(-1px)';
            });
            selectLocalImageBtnInside.addEventListener('mouseleave', () => {
                selectLocalImageBtnInside.style.background = 'rgba(139, 92, 246, 0.2) !important';
                selectLocalImageBtnInside.style.borderColor = 'rgba(139, 92, 246, 0.5) !important';
                selectLocalImageBtnInside.style.transform = 'translateY(0)';
            });
            selectLocalImageBtnInside.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', '点击内部按钮');
                }
                this._openFileSelector();
            });
            currentBackgroundDisplay.appendChild(selectLocalImageBtnInside);
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('ThemeAnimator', '内部按钮已添加到DOM', { button: selectLocalImageBtnInside, parent: currentBackgroundDisplay });
            }
            
            // 添加随机二次元背景按钮
            const randomAnimeBgBtn = document.createElement('button');
            randomAnimeBgBtn.textContent = '🎨 随机二次元背景';
            randomAnimeBgBtn.id = 'random-anime-bg-btn';
            randomAnimeBgBtn.className = 'random-anime-bg-btn';
            randomAnimeBgBtn.style.cssText = `
                width: 100% !important;
                padding: 10px 16px !important;
                background: rgba(108, 142, 255, 0.2) !important;
                border: 2px solid rgba(108, 142, 255, 0.5) !important;
                border-radius: 6px !important;
                color: rgba(215, 224, 221, 0.95) !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: all 0.2s ease;
                margin-top: 8px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                box-sizing: border-box !important;
                position: relative !important;
            `;
            randomAnimeBgBtn.addEventListener('mouseenter', () => {
                randomAnimeBgBtn.style.background = 'rgba(108, 142, 255, 0.3) !important';
                randomAnimeBgBtn.style.borderColor = 'rgba(108, 142, 255, 0.7) !important';
                randomAnimeBgBtn.style.transform = 'translateY(-1px)';
            });
            randomAnimeBgBtn.addEventListener('mouseleave', () => {
                randomAnimeBgBtn.style.background = 'rgba(108, 142, 255, 0.2) !important';
                randomAnimeBgBtn.style.borderColor = 'rgba(108, 142, 255, 0.5) !important';
                randomAnimeBgBtn.style.transform = 'translateY(0)';
            });
            randomAnimeBgBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._loadRandomAnimeBackground();
            });
            currentBackgroundDisplay.appendChild(randomAnimeBgBtn);
            
            // 添加取消随机二次元背景按钮
            const cancelRandomAnimeBgBtn = document.createElement('button');
            cancelRandomAnimeBgBtn.textContent = '❌ 取消随机二次元背景';
            cancelRandomAnimeBgBtn.id = 'cancel-random-anime-bg-btn';
            cancelRandomAnimeBgBtn.className = 'cancel-random-anime-bg-btn';
            cancelRandomAnimeBgBtn.style.cssText = `
                width: 100% !important;
                padding: 10px 16px !important;
                background: rgba(239, 68, 68, 0.2) !important;
                border: 2px solid rgba(239, 68, 68, 0.5) !important;
                border-radius: 6px !important;
                color: rgba(215, 224, 221, 0.95) !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: all 0.2s ease;
                margin-top: 8px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                box-sizing: border-box !important;
                position: relative !important;
            `;
            cancelRandomAnimeBgBtn.addEventListener('mouseenter', () => {
                cancelRandomAnimeBgBtn.style.background = 'rgba(239, 68, 68, 0.3) !important';
                cancelRandomAnimeBgBtn.style.borderColor = 'rgba(239, 68, 68, 0.7) !important';
                cancelRandomAnimeBgBtn.style.transform = 'translateY(-1px)';
            });
            cancelRandomAnimeBgBtn.addEventListener('mouseleave', () => {
                cancelRandomAnimeBgBtn.style.background = 'rgba(239, 68, 68, 0.2) !important';
                cancelRandomAnimeBgBtn.style.borderColor = 'rgba(239, 68, 68, 0.5) !important';
                cancelRandomAnimeBgBtn.style.transform = 'translateY(0)';
            });
            cancelRandomAnimeBgBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._cancelRandomAnimeBackground();
            });
            currentBackgroundDisplay.appendChild(cancelRandomAnimeBgBtn);
            
            currentSection.appendChild(currentBackgroundDisplay);
            
            panel.appendChild(currentSection);
            
            // 验证按钮是否已添加到DOM
            setTimeout(() => {
                const insideBtn = panel.querySelector('#select-local-image-btn-inside');
                const currentDisplay = panel.querySelector('.current-background-display');
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', '面板创建完成，检查按钮', {
                        insideBtn: insideBtn ? {
                            exists: true,
                            text: insideBtn.textContent,
                            display: window.getComputedStyle(insideBtn).display,
                            visibility: window.getComputedStyle(insideBtn).visibility,
                            opacity: window.getComputedStyle(insideBtn).opacity,
                            parent: currentDisplay ? 'currentDisplay存在' : 'currentDisplay不存在'
                        } : '不存在',
                        panelDisplay: panel.style.display,
                        panelVisible: window.getComputedStyle(panel).display,
                        panelInDOM: panel.parentElement ? '已添加到DOM' : '未添加到DOM'
                    });
                }
            }, 100);
            
            // 背景图列表
            const backgroundsSection = document.createElement('div');
            backgroundsSection.className = 'themeanimator-section';
            backgroundsSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">可用背景</h3>
                <div id="backgrounds-list" class="backgrounds-list" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                "></div>
            `;
            panel.appendChild(backgroundsSection);
            
            // 加载背景图列表
            this._loadBackgroundsList(backgroundsSection.querySelector('#backgrounds-list'));
            
            return panel;
        },
        
        /**
         * 创建动画管理面板
         */
        _createAnimationPanel: function() {
            const panel = document.createElement('div');
            panel.className = 'themeanimator-panel';
            panel.dataset.panel = 'animation';
            panel.style.cssText = `
                display: none;
                flex-direction: column;
                gap: 20px;
            `;
            
            // 当前动画预设显示
            const currentSection = document.createElement('div');
            currentSection.className = 'themeanimator-section';
            currentSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">当前动画预设</h3>
                <div class="current-animation-preset-display" style="
                    padding: 16px;
                    background: rgba(139, 92, 246, 0.1);
                    border-radius: 8px;
                    border: 1px solid rgba(139, 92, 246, 0.3);
                ">
                    <div id="current-animation-preset-name" style="font-size: 18px; font-weight: 600; color: rgba(139, 92, 246, 1); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; word-break: break-all;">加载中...</div>
                    <div id="current-animation-preset-description" style="font-size: 13px; color: rgba(215, 224, 221, 0.7); overflow: hidden; word-break: break-all; word-wrap: break-word; line-height: 1.5;">正在加载动画预设信息...</div>
                </div>
            `;
            panel.appendChild(currentSection);
            
            // 动画预设列表
            const presetsSection = document.createElement('div');
            presetsSection.className = 'themeanimator-section';
            presetsSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">可用动画预设</h3>
                <div id="animation-presets-list" class="animation-presets-list" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                "></div>
            `;
            panel.appendChild(presetsSection);
            
            // 加载动画预设列表
            this._loadAnimationPresetsList(presetsSection.querySelector('#animation-presets-list'));
            
            // 动画信息
            const infoSection = document.createElement('div');
            infoSection.className = 'themeanimator-section';
            infoSection.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: rgba(215, 224, 221, 0.9); font-size: 16px; font-weight: 600;">动画信息</h3>
                <div id="animation-info" style="
                    padding: 16px;
                    background: rgba(139, 92, 246, 0.05);
                    border-radius: 8px;
                    border: 1px solid rgba(139, 92, 246, 0.2);
                "></div>
            `;
            panel.appendChild(infoSection);
            
            // 加载动画信息
            this._loadAnimationInfo(infoSection.querySelector('#animation-info'));
            
            return panel;
        },
        
        /**
         * 加载当前设置
         */
        _loadCurrentSettings: async function() {
            if (typeof ProcessManager === 'undefined') {
                return;
            }
            
            try {
                // 获取当前主题
                const currentTheme = await ProcessManager.getCurrentTheme(this.pid);
                if (currentTheme) {
                    this.currentThemeId = currentTheme.id;
                    this._updateCurrentThemeDisplay(currentTheme);
                }
                
                // 获取当前风格
                const currentStyle = await ProcessManager.getCurrentStyle(this.pid);
                if (currentStyle) {
                    this.currentStyleId = currentStyle.id;
                    this._updateCurrentStyleDisplay(currentStyle);
                }
                
                // 获取当前桌面背景
                const currentBackgroundId = ProcessManager.getCurrentDesktopBackground(this.pid);
                if (currentBackgroundId) {
                    const currentBackground = ProcessManager.getDesktopBackground(currentBackgroundId, this.pid);
                    if (currentBackground) {
                        this._updateCurrentBackgroundDisplay(currentBackground);
                    }
                }
                
                // 获取当前动画预设
                if (typeof ThemeManager !== 'undefined') {
                    const currentPresetId = ThemeManager.getCurrentAnimationPresetId();
                    if (currentPresetId) {
                        this.currentAnimationPresetId = currentPresetId;
                        const currentPreset = ThemeManager.getCurrentAnimationPreset();
                        if (currentPreset) {
                            this._updateCurrentAnimationPresetDisplay(currentPreset);
                        }
                    }
                }
                
                // 检查随机二次元背景的刷新逻辑
                // 如果上次请求失败，刷新时自动再次尝试请求
                // 如果已禁用，则不自动请求
                if (typeof LStorage !== 'undefined') {
                    try {
                        const lastRequestStatus = await LStorage.getSystemStorage('system.randomAnimeBgStatus');
                        if (lastRequestStatus === 'failed') {
                            // 如果上次请求失败，刷新时自动再次尝试请求
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', '检测到上次请求失败，刷新时自动再次尝试请求');
                            }
                            // 延迟执行，确保UI已完全加载
                            setTimeout(() => {
                                this._loadRandomAnimeBackground();
                            }, 1000);
                        } else if (lastRequestStatus === 'disabled') {
                            // 如果已禁用，不自动请求
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', '随机二次元背景功能已禁用，跳过自动请求');
                            }
                        }
                        // 如果上次请求成功，刷新时不再次请求（保持当前背景）
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', '读取请求状态失败', e);
                        }
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '加载当前设置失败', e);
                }
            }
        },
        
        /**
         * 设置监听器
         */
        _setupListeners: function() {
            if (typeof ProcessManager === 'undefined') {
                return;
            }
            
            // 监听主题变更
            try {
                const themeChangeListener = (themeId, theme) => {
                    this.currentThemeId = themeId;
                    this._updateCurrentThemeDisplay(theme);
                    this._updateThemesList();
                };
                this.themeChangeUnsubscribe = ProcessManager.onThemeChange(themeChangeListener, this.pid);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '注册主题变更监听器失败', e);
                }
            }
            
            // 监听风格变更
            try {
                const styleChangeListener = (styleId, style) => {
                    this.currentStyleId = styleId;
                    this._updateCurrentStyleDisplay(style);
                    this._updateStylesList();
                };
                this.styleChangeUnsubscribe = ProcessManager.onStyleChange(styleChangeListener, this.pid);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '注册风格变更监听器失败', e);
                }
            }
            
            // 监听动画预设变更
            if (typeof ThemeManager !== 'undefined') {
                try {
                    const animationPresetChangeListener = (presetId, preset) => {
                        this.currentAnimationPresetId = presetId;
                        // 只有当 preset 不为 null 时才更新显示
                        if (preset) {
                            this._updateCurrentAnimationPresetDisplay(preset);
                        }
                        this._updateAnimationPresetsList();
                    };
                    this.animationPresetChangeUnsubscribe = ThemeManager.onAnimationPresetChange(animationPresetChangeListener);
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ThemeAnimator', '注册动画预设变更监听器失败', e);
                    }
                }
            }
        },
        
        /**
         * 加载主题列表
         */
        _loadThemesList: async function(container) {
            if (typeof ProcessManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">ProcessManager 不可用</p>';
                return;
            }
            
            try {
                const themes = await ProcessManager.getAllThemes(this.pid);
                if (!themes || themes.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的主题</p>';
                    return;
                }
                
                container.innerHTML = '';
                themes.forEach(theme => {
                    const themeCard = this._createThemeCard(theme);
                    container.appendChild(themeCard);
                });
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载主题列表失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 创建主题卡片
         */
        _createThemeCard: function(theme) {
            const card = document.createElement('div');
            card.className = 'theme-card';
            const isActive = theme.id === this.currentThemeId;
            
            card.style.cssText = `
                padding: 16px;
                background: ${isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.05)'};
                border: 2px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.2)'};
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 主题预览（使用主题的主要颜色）
            const preview = document.createElement('div');
            preview.style.cssText = `
                width: 100%;
                height: 80px;
                border-radius: 6px;
                margin-bottom: 12px;
                background: linear-gradient(135deg, 
                    ${theme.colors?.primary || '#8b5cf6'} 0%, 
                    ${theme.colors?.secondary || '#6366f1'} 100%);
                border: 1px solid rgba(255, 255, 255, 0.1);
            `;
            card.appendChild(preview);
            
            // 主题名称
            const name = document.createElement('div');
            name.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            const nameText = theme.name || theme.id;
            name.textContent = nameText;
            name.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            card.appendChild(name);
            
            // 主题描述
            if (theme.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                `;
                desc.textContent = theme.description;
                desc.title = theme.description; // 添加 title 属性
                card.appendChild(desc);
            }
            
            // 激活标记
            if (isActive) {
                const badge = document.createElement('div');
                badge.style.cssText = `
                    margin-top: 8px;
                    padding: 4px 8px;
                    background: rgba(139, 92, 246, 0.3);
                    color: rgba(139, 92, 246, 1);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                `;
                badge.textContent = '当前主题';
                card.appendChild(badge);
            }
            
            // 点击切换主题
            if (!isActive) {
                card.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `切换主题: ${theme.id}`);
                        }
                        const result = await ProcessManager.setTheme(theme.id, this.pid);
                        if (!result) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `切换主题失败: 主题 ${theme.id} 不存在或无法应用`);
                            }
                            alert(`切换主题失败: 主题 ${theme.id} 不存在或无法应用`);
                        } else {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `主题切换成功: ${theme.id}`);
                            }
                            // 成功时，监听器会自动更新UI
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '切换主题失败', e);
                        }
                        alert(`切换主题失败: ${e.message}`);
                    }
                });
                
                card.addEventListener('mouseenter', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.1)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.05)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                });
            }
            
            return card;
        },
        
        /**
         * 加载风格列表
         */
        _loadStylesList: async function(container) {
            if (typeof ProcessManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">ProcessManager 不可用</p>';
                return;
            }
            
            try {
                const styles = await ProcessManager.getAllStyles(this.pid);
                if (!styles || styles.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的风格</p>';
                    return;
                }
                
                container.innerHTML = '';
                styles.forEach(style => {
                    const styleCard = this._createStyleCard(style);
                    container.appendChild(styleCard);
                });
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载风格列表失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 创建风格卡片
         */
        _createStyleCard: function(style) {
            const card = document.createElement('div');
            card.className = 'style-card';
            const isActive = style.id === this.currentStyleId;
            
            card.style.cssText = `
                padding: 16px;
                background: ${isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.05)'};
                border: 2px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.2)'};
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 风格预览（显示风格特征）
            const preview = document.createElement('div');
            preview.style.cssText = `
                width: 100%;
                height: 80px;
                border-radius: ${style.styles?.window?.borderRadius || '8px'};
                margin-bottom: 12px;
                background: rgba(139, 92, 246, 0.1);
                border: 1px solid rgba(139, 92, 246, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
            `;
            preview.textContent = style.name === 'Ubuntu' ? '🟣' : 
                                 style.name === 'Windows' ? '🟦' : 
                                 style.name === 'macOS' ? '⚪' : 
                                 style.name === 'GNOME' ? '🟢' : 
                                 style.name === 'Material' ? '🔷' : '🎨';
            card.appendChild(preview);
            
            // 风格名称
            const name = document.createElement('div');
            name.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            const nameText = style.name || style.id;
            name.textContent = nameText;
            name.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            card.appendChild(name);
            
            // 风格描述
            if (style.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                `;
                desc.textContent = style.description;
                desc.title = style.description; // 添加 title 属性
                card.appendChild(desc);
            }
            
            // 激活标记
            if (isActive) {
                const badge = document.createElement('div');
                badge.style.cssText = `
                    margin-top: 8px;
                    padding: 4px 8px;
                    background: rgba(139, 92, 246, 0.3);
                    color: rgba(139, 92, 246, 1);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                `;
                badge.textContent = '当前风格';
                card.appendChild(badge);
            }
            
            // 点击切换风格
            if (!isActive) {
                card.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `切换风格: ${style.id}`);
                        }
                        const result = await ProcessManager.setStyle(style.id, this.pid);
                        if (!result) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `切换风格失败: 风格 ${style.id} 不存在或无法应用`);
                            }
                            alert(`切换风格失败: 风格 ${style.id} 不存在或无法应用`);
                        } else {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `风格切换成功: ${style.id}`);
                            }
                            // 成功时，监听器会自动更新UI
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '切换风格失败', e);
                        }
                        alert(`切换风格失败: ${e.message}`);
                    }
                });
                
                card.addEventListener('mouseenter', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.1)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.05)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                });
            }
            
            return card;
        },
        
        /**
         * 更新当前主题显示
         */
        _updateCurrentThemeDisplay: function(theme) {
            const nameEl = this.window.querySelector('#current-theme-name');
            const descEl = this.window.querySelector('#current-theme-description');
            
            if (nameEl) {
                nameEl.textContent = theme.name || theme.id;
            }
            if (descEl) {
                descEl.textContent = theme.description || '无描述';
            }
        },
        
        /**
         * 更新当前风格显示
         */
        _updateCurrentStyleDisplay: function(style) {
            const nameEl = this.window.querySelector('#current-style-name');
            const descEl = this.window.querySelector('#current-style-description');
            
            if (nameEl) {
                const nameText = style.name || style.id;
                nameEl.textContent = nameText;
                nameEl.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            }
            if (descEl) {
                const descText = style.description || '无描述';
                descEl.textContent = descText;
                descEl.title = descText; // 添加 title 属性
            }
        },
        
        /**
         * 更新主题列表
         */
        _updateThemesList: function() {
            const container = this.window.querySelector('#themes-list');
            if (container) {
                this._loadThemesList(container);
            }
        },
        
        /**
         * 更新风格列表
         */
        _updateStylesList: function() {
            const container = this.window.querySelector('#styles-list');
            if (container) {
                this._loadStylesList(container);
            }
        },
        
        /**
         * 加载背景图列表
         */
        _loadBackgroundsList: async function(container) {
            if (typeof ProcessManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">ProcessManager 不可用</p>';
                return;
            }
            
            try {
                const backgrounds = ProcessManager.getAllDesktopBackgrounds(this.pid);
                if (!backgrounds || backgrounds.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的背景</p>';
                    return;
                }
                
                // 检查每个背景文件是否存在，过滤掉已删除的文件
                const validBackgrounds = [];
                for (const background of backgrounds) {
                    // 检查是否是本地文件路径
                    const isLocalPath = background.path && (
                        background.path.startsWith('C:') || 
                        background.path.startsWith('D:') || 
                        background.path.includes('/system/service/DISK/')
                    );
                    
                    if (isLocalPath) {
                        // 检查文件是否存在
                        const exists = await this._checkFileExists(background.path);
                        if (!exists) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `背景文件不存在，已过滤: ${background.path}`);
                            }
                            continue; // 跳过不存在的文件
                        }
                    }
                    
                    // 文件存在或者是非本地路径（如内置背景），添加到列表
                    validBackgrounds.push(background);
                }
                
                if (validBackgrounds.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的背景</p>';
                    return;
                }
                
                container.innerHTML = '';
                validBackgrounds.forEach(background => {
                    const backgroundCard = this._createBackgroundCard(background);
                    container.appendChild(backgroundCard);
                });
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载背景列表失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 检查文件是否存在
         * @param {string} filePath 文件路径
         * @returns {Promise<boolean>} 文件是否存在
         */
        _checkFileExists: async function(filePath) {
            try {
                // 转换为 PHP 服务路径
                let phpPath = filePath;
                if (filePath.startsWith('C:')) {
                    phpPath = 'C:' + filePath.substring(2).replace(/\\/g, '/');
                } else if (filePath.startsWith('D:')) {
                    phpPath = 'D:' + filePath.substring(2).replace(/\\/g, '/');
                } else if (filePath.includes('/system/service/DISK/')) {
                    // 已经是服务路径，提取实际路径
                    const match = filePath.match(/\/service\/DISK\/([CD])\/(.+)/);
                    if (match) {
                        phpPath = `${match[1]}:/${match[2]}`;
                    }
                }
                
                // 确保路径格式正确
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                // 使用 PHP 服务检查文件是否存在
                const url = new URL('/system/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'exists');
                url.searchParams.set('path', phpPath);
                
                const response = await fetch(url.toString());
                if (!response.ok) {
                    return false;
                }
                
                const result = await response.json();
                if (result.status === 'success' && result.data && result.data.exists && result.data.type === 'file') {
                    // 检查文件扩展名，支持常见图片格式和视频格式
                    const extension = filePath.toLowerCase().split('.').pop() || '';
                    const supportedImageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
                    const supportedVideoFormats = ['mp4', 'webm', 'ogg'];
                    if (supportedImageFormats.includes(extension) || supportedVideoFormats.includes(extension)) {
                        return true;
                    }
                }
                return false;
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('ThemeAnimator', `检查文件存在性失败: ${e.message}`);
                }
                return false;
            }
        },
        
        /**
         * 创建背景图卡片
         */
        _createBackgroundCard: function(background) {
            const card = document.createElement('div');
            card.className = 'background-card';
            const currentBackgroundId = ProcessManager.getCurrentDesktopBackground(this.pid);
            const isActive = background.id === currentBackgroundId;
            
            card.style.cssText = `
                padding: 16px;
                background: ${isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.05)'};
                border: 2px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.2)'};
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 背景预览（支持图片和视频）
            const preview = document.createElement('div');
            
            // 处理本地文件路径（转换为 PHP 服务 URL）
            let previewUrl = background.path;
            const isLocalPath = background.path.startsWith('C:') || 
                               background.path.startsWith('D:') || 
                               background.path.includes('/system/service/DISK/');
            
            if (isLocalPath) {
                // 转换为 PHP 服务 URL
                if (background.path.startsWith('C:')) {
                    previewUrl = '/system/service/DISK/C' + background.path.substring(2).replace(/\\/g, '/');
                } else if (background.path.startsWith('D:')) {
                    previewUrl = '/system/service/DISK/D' + background.path.substring(2).replace(/\\/g, '/');
                } else if (background.path.includes('/system/service/DISK/')) {
                    previewUrl = background.path;
                }
            }
            
            // 检测文件类型
            const fileExtension = background.path.toLowerCase().split('.').pop() || '';
            const isVideo = fileExtension === 'mp4' || fileExtension === 'webm' || fileExtension === 'ogg';
            
            preview.style.cssText = `
                width: 100%;
                height: 100px;
                border-radius: 6px;
                margin-bottom: 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                overflow: hidden;
                position: relative;
                background: rgba(0, 0, 0, 0.3);
            `;
            
            if (isVideo) {
                // 视频预览：使用 video 元素
                const video = document.createElement('video');
                video.src = previewUrl;
                video.muted = true;
                video.loop = true;
                video.autoplay = true;
                video.playsInline = true;
                video.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                `;
                preview.appendChild(video);
                
                // 添加视频图标标记
                const videoBadge = document.createElement('div');
                videoBadge.textContent = '🎬';
                videoBadge.style.cssText = `
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    background: rgba(0, 0, 0, 0.6);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 12px;
                `;
                preview.appendChild(videoBadge);
            } else {
                // 图片预览：使用背景图片
                preview.style.backgroundImage = `url('${previewUrl}')`;
                preview.style.backgroundSize = 'cover';
                preview.style.backgroundPosition = 'center';
                preview.style.backgroundRepeat = 'no-repeat';
            }
            
            card.appendChild(preview);
            
            // 背景名称
            const name = document.createElement('div');
            name.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            name.textContent = background.name || background.id;
            name.title = background.name || background.id; // 添加 title 属性，鼠标悬停时显示完整文本
            card.appendChild(name);
            
            // 如果是本地文件，显示文件路径信息
            if (isLocalPath && background.path) {
                // 提取文件名
                const fileName = background.path.split(/[/\\]/).pop() || background.path;
                const fileLabel = document.createElement('div');
                fileLabel.style.cssText = `
                    font-size: 11px;
                    color: rgba(215, 224, 221, 0.5);
                    margin-bottom: 2px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    word-break: break-all;
                `;
                fileLabel.textContent = fileName;
                fileLabel.title = fileName; // 添加 title 属性
                card.appendChild(fileLabel);
                
                // 显示文件路径标签和路径
                const pathContainer = document.createElement('div');
                pathContainer.style.cssText = `
                    font-size: 10px;
                    color: rgba(215, 224, 221, 0.4);
                    margin-bottom: 4px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    word-break: break-all;
                `;
                const isVideoFile = isVideo;
                pathContainer.textContent = `${isVideoFile ? '本地视频' : '本地图片'}: ${background.path}`;
                pathContainer.title = `${isVideoFile ? '本地视频' : '本地图片'}: ${background.path}`; // 添加 title 属性
                card.appendChild(pathContainer);
            }
            
            // 背景描述
            if (background.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                `;
                desc.textContent = background.description;
                desc.title = background.description; // 添加 title 属性
                card.appendChild(desc);
            }
            
            // 激活标记
            if (isActive) {
                const badge = document.createElement('div');
                badge.style.cssText = `
                    margin-top: 8px;
                    padding: 4px 8px;
                    background: rgba(139, 92, 246, 0.3);
                    color: rgba(139, 92, 246, 1);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                `;
                badge.textContent = '当前背景';
                card.appendChild(badge);
            }
            
            // 判断是否是预设背景（内置背景）
            const builtinBackgroundIds = ['default', 'cyberpunk', 'minimalist', 'nature', 'cosmic', 'warm'];
            const isBuiltinBackground = builtinBackgroundIds.includes(background.id);
            
            // 判断是否是本地背景（非预设背景）
            const isLocalBackground = isLocalPath && !isBuiltinBackground;
            
            // 判断是否是随机二次元背景图
            const isRandomAnimeBg = background.path && (
                background.path.includes('random_anime_bg') || 
                background.path.includes('D:/cache/random_anime_bg')
            );
            
            // 为本地背景添加 data 属性，用于右键菜单识别
            if (isLocalBackground) {
                card.dataset.backgroundId = background.id;
                card.dataset.isRandomAnimeBg = isRandomAnimeBg ? 'true' : 'false';
                card.classList.add('local-background-card');
            }
            
            // 点击切换背景
            if (!isActive) {
                card.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `切换桌面背景: ${background.id}`);
                        }
                        const result = await ProcessManager.setDesktopBackground(background.id, this.pid);
                        if (!result) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `切换桌面背景失败: 背景 ${background.id} 不存在或无法应用`);
                            }
                            alert(`切换桌面背景失败: 背景 ${background.id} 不存在或无法应用`);
                        } else {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `桌面背景切换成功: ${background.id}`);
                            }
                            // 更新当前背景显示
                            this._updateCurrentBackgroundDisplay(background);
                            // 更新背景列表
                            this._updateBackgroundsList();
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '切换桌面背景失败', e);
                        }
                        alert(`切换桌面背景失败: ${e.message}`);
                    }
                });
                
                card.addEventListener('mouseenter', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.1)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.05)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                });
            }
            
            return card;
        },
        
        /**
         * 更新当前背景显示
         */
        _updateCurrentBackgroundDisplay: function(background) {
            const nameEl = this.window.querySelector('#current-background-name');
            const descEl = this.window.querySelector('#current-background-description');
            
            if (nameEl) {
                const nameText = background.name || background.id;
                nameEl.textContent = nameText;
                nameEl.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            }
            if (descEl) {
                const descText = background.description || '无描述';
                descEl.textContent = descText;
                descEl.title = descText; // 添加 title 属性
            }
        },
        
        /**
         * 注册本地背景卡片的右键菜单（删除功能）
         */
        _registerBackgroundContextMenu: function() {
            if (typeof ContextMenuManager === 'undefined' || !this.pid) {
                return;
            }
            
            const self = this;
            
            // 注册右键菜单，使用选择器匹配所有本地背景卡片
            // 使用函数形式的 items，在运行时获取目标元素
            ContextMenuManager.registerContextMenu(this.pid, {
                context: '*',
                selector: '.local-background-card',
                priority: 100,
                items: (target) => {
                    // 从目标元素获取背景卡片
                    const card = target.closest('.local-background-card');
                    if (!card || !card.dataset.backgroundId) {
                        return []; // 如果找不到卡片，返回空数组
                    }
                    
                    const backgroundId = card.dataset.backgroundId;
                    const isRandomAnimeBg = card.dataset.isRandomAnimeBg === 'true';
                    
                    // 返回菜单项数组
                    return [
                        {
                            label: '删除',
                            action: async () => {
                                // 获取背景对象
                                if (typeof ProcessManager === 'undefined') {
                                    return;
                                }
                                
                                const background = ProcessManager.getDesktopBackground(backgroundId, self.pid);
                                if (!background) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ThemeAnimator', `找不到背景对象: ${backgroundId}`);
                                    }
                                    return;
                                }
                                
                                // 执行删除
                                await self._deleteBackground(background, isRandomAnimeBg);
                            }
                        }
                    ];
                }
            });
        },
        
        /**
         * 更新背景列表
         */
        _updateBackgroundsList: async function() {
            const container = this.window.querySelector('#backgrounds-list');
            if (container) {
                await this._loadBackgroundsList(container);
            }
        },
        
        /**
         * 打开文件选择器（用于选择本地图片作为背景）
         */
        _openFileSelector: async function() {
            if (typeof ProcessManager === 'undefined') {
                // ProcessManager 不可用，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '主题管理器',
                            content: 'ProcessManager 不可用',
                            duration: 3000
                        });
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', `ProcessManager 不可用，且创建通知失败: ${e.message}`);
                        }
                    }
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ThemeAnimator', 'ProcessManager 不可用');
                    }
                }
                return;
            }
            
            try {
                // 启动文件管理器作为文件选择器
                const fileManagerPid = await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'file-selector',  // 文件选择器模式
                    onFileSelected: async (selectedFile) => {
                        // 检查文件类型是否为图片或视频
                        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'];
                        const videoExtensions = ['mp4', 'webm', 'ogg'];
                        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || '';
                        const isImage = imageExtensions.includes(extension);
                        const isVideo = videoExtensions.includes(extension);
                        
                        if (!isImage && !isVideo) {
                            // 文件类型不正确，使用通知提示（不打断用户）
                            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                try {
                                    await NotificationManager.createNotification(this.pid, {
                                        type: 'snapshot',
                                        title: '主题管理器',
                                        content: '请选择图片文件（jpg, png, gif, bmp, svg, webp, ico）或视频文件（mp4, webm, ogg）',
                                        duration: 4000
                                    });
                                } catch (e) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ThemeAnimator', `创建通知失败: ${e.message}`);
                                    }
                                }
                            }
                            return;
                        }
                        
                        // 使用 ThemeManager 设置本地图片或视频作为背景
                        if (typeof ThemeManager !== 'undefined') {
                            try {
                                let result = false;
                                if (isVideo) {
                                    // 设置视频背景
                                    result = await ThemeManager.setLocalVideoAsBackground(selectedFile.path, true);
                                } else {
                                    // 设置图片背景
                                    result = await ThemeManager.setLocalImageAsBackground(selectedFile.path, true);
                                }
                                
                                if (result) {
                                    // 更新背景列表
                                    this._updateBackgroundsList();
                                    
                                    // 更新当前背景显示
                                    const currentBackgroundId = ThemeManager.getCurrentDesktopBackground();
                                    if (currentBackgroundId) {
                                        const currentBackground = ThemeManager.getDesktopBackground(currentBackgroundId);
                                        if (currentBackground) {
                                            this._updateCurrentBackgroundDisplay(currentBackground);
                                        }
                                    }
                                    
                                    // 背景设置成功，使用通知提示（不打断用户）
                                    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                        try {
                                            await NotificationManager.createNotification(this.pid, {
                                                type: 'snapshot',
                                                title: '设置成功',
                                                content: `背景设置成功！${isVideo ? '（视频将静音循环播放）' : ''}`,
                                                duration: 3000
                                            });
                                        } catch (e) {
                                            if (typeof KernelLogger !== 'undefined') {
                                                KernelLogger.warn('ThemeAnimator', `创建通知失败: ${e.message}`);
                                            }
                                        }
                                    }
                                } else {
                                    // 设置背景失败，使用通知提示（不打断用户）
                                    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                        try {
                                            await NotificationManager.createNotification(this.pid, {
                                                type: 'snapshot',
                                                title: '设置失败',
                                                content: `设置背景失败：${isVideo ? '视频' : '图片'}不存在或无法访问`,
                                                duration: 4000
                                            });
                                        } catch (e) {
                                            if (typeof KernelLogger !== 'undefined') {
                                                KernelLogger.warn('ThemeAnimator', `创建通知失败: ${e.message}`);
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('ThemeAnimator', '设置本地背景失败', e);
                                }
                                // 设置背景失败，使用通知提示（不打断用户）
                                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                    try {
                                        await NotificationManager.createNotification(this.pid, {
                                            type: 'snapshot',
                                            title: '设置失败',
                                            content: `设置背景失败: ${e.message}`,
                                            duration: 4000
                                        });
                                    } catch (notifError) {
                                        if (typeof KernelLogger !== 'undefined') {
                                            KernelLogger.warn('ThemeAnimator', `创建通知失败: ${notifError.message}`);
                                        }
                                    }
                                }
                            }
                        } else {
                            // ThemeManager 不可用，使用通知提示（不打断用户）
                            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                try {
                                    await NotificationManager.createNotification(this.pid, {
                                        type: 'snapshot',
                                        title: '主题管理器',
                                        content: 'ThemeManager 不可用',
                                        duration: 3000
                                    });
                                } catch (e) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.error('ThemeAnimator', `ThemeManager 不可用，且创建通知失败: ${e.message}`);
                                    }
                                }
                            } else {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('ThemeAnimator', 'ThemeManager 不可用');
                                }
                            }
                        }
                    }
                });
                
                if (!fileManagerPid) {
                    // 无法启动文件管理器，使用通知提示（不打断用户）
                    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                        try {
                            await NotificationManager.createNotification(this.pid, {
                                type: 'snapshot',
                                title: '主题管理器',
                                content: '无法启动文件管理器',
                                duration: 3000
                            });
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `无法启动文件管理器，且创建通知失败: ${e.message}`);
                            }
                        }
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '无法启动文件管理器');
                        }
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '打开文件选择器失败', e);
                }
                // 打开文件选择器失败，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '错误',
                            content: `打开文件选择器失败: ${e.message}`,
                            duration: 4000
                        });
                    } catch (notifError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `创建通知失败: ${notifError.message}`);
                        }
                    }
                }
            }
        },
        
        /**
         * 加载动画预设列表
         */
        _loadAnimationPresetsList: async function(container) {
            if (typeof ThemeManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">ThemeManager 不可用</p>';
                return;
            }
            
            try {
                const presets = ThemeManager.getAllAnimationPresets();
                if (!presets || presets.length === 0) {
                    container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">没有可用的动画预设</p>';
                    return;
                }
                
                container.innerHTML = '';
                presets.forEach(preset => {
                    const presetCard = this._createAnimationPresetCard(preset);
                    container.appendChild(presetCard);
                });
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载动画预设列表失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 创建动画预设卡片
         */
        _createAnimationPresetCard: function(preset) {
            const card = document.createElement('div');
            card.className = 'animation-preset-card';
            const isActive = preset.id === this.currentAnimationPresetId;
            
            card.style.cssText = `
                padding: 16px;
                background: ${isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.05)'};
                border: 2px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.2)'};
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 预设图标（根据预设类型显示不同图标）
            const icon = document.createElement('div');
            icon.style.cssText = `
                width: 100%;
                height: 60px;
                border-radius: 6px;
                margin-bottom: 12px;
                background: rgba(139, 92, 246, 0.1);
                border: 1px solid rgba(139, 92, 246, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
            `;
            icon.textContent = preset.id === 'smooth' ? '🌊' : 
                              preset.id === 'fast' ? '⚡' : 
                              preset.id === 'elegant' ? '✨' : 
                              preset.id === 'bouncy' ? '🎈' : '🎨';
            card.appendChild(icon);
            
            // 预设名称
            const name = document.createElement('div');
            name.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.9);
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                word-break: break-all;
            `;
            const nameText = preset.name || preset.id;
            name.textContent = nameText;
            name.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            card.appendChild(name);
            
            // 预设描述
            if (preset.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                `;
                desc.textContent = preset.description;
                desc.title = preset.description; // 添加 title 属性
                card.appendChild(desc);
            }
            
            // 激活标记
            if (isActive) {
                const badge = document.createElement('div');
                badge.style.cssText = `
                    margin-top: 8px;
                    padding: 4px 8px;
                    background: rgba(139, 92, 246, 0.3);
                    color: rgba(139, 92, 246, 1);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                `;
                badge.textContent = '当前预设';
                card.appendChild(badge);
            }
            
            // 点击切换预设
            if (!isActive) {
                card.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `切换动画预设: ${preset.id}`);
                        }
                        const result = await ThemeManager.setAnimationPreset(preset.id, true);
                        if (!result) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ThemeAnimator', `切换动画预设失败: 预设 ${preset.id} 不存在或无法应用`);
                            }
                            alert(`切换动画预设失败: 预设 ${preset.id} 不存在或无法应用`);
                        } else {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `动画预设切换成功: ${preset.id}`);
                            }
                            // 成功时，监听器会自动更新UI
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('ThemeAnimator', '切换动画预设失败', e);
                        }
                        alert(`切换动画预设失败: ${e.message}`);
                    }
                });
                
                card.addEventListener('mouseenter', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.1)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                });
                
                card.addEventListener('mouseleave', () => {
                    card.style.background = 'rgba(139, 92, 246, 0.05)';
                    card.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                });
            }
            
            return card;
        },
        
        /**
         * 更新当前动画预设显示
         */
        _updateCurrentAnimationPresetDisplay: function(preset) {
            if (!preset) {
                return;
            }
            
            const nameEl = this.window.querySelector('#current-animation-preset-name');
            const descEl = this.window.querySelector('#current-animation-preset-description');
            
            if (nameEl) {
                const nameText = preset.name || preset.id || '未知';
                nameEl.textContent = nameText;
                nameEl.title = nameText; // 添加 title 属性，鼠标悬停时显示完整文本
            }
            if (descEl) {
                const descText = preset.description || '无描述';
                descEl.textContent = descText;
                descEl.title = descText; // 添加 title 属性
            }
        },
        
        /**
         * 更新动画预设列表
         */
        _updateAnimationPresetsList: function() {
            const container = this.window.querySelector('#animation-presets-list');
            if (container) {
                this._loadAnimationPresetsList(container);
            }
        },
        
        /**
         * 加载动画信息
         */
        _loadAnimationInfo: function(container) {
            if (typeof AnimateManager === 'undefined') {
                container.innerHTML = '<p style="color: rgba(215, 224, 221, 0.7);">AnimateManager 不可用</p>';
                return;
            }
            
            try {
                const presets = AnimateManager.ANIMATION_PRESETS || {};
                const keyframes = AnimateManager.KEYFRAMES || {};
                
                let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
                
                // 动画类别数量
                const presetCount = Object.keys(presets).length;
                html += `<div style="padding: 12px; background: rgba(139, 92, 246, 0.05); border-radius: 6px;">
                    <strong style="color: rgba(215, 224, 221, 0.9);">动画类别:</strong> 
                    <span style="color: rgba(139, 92, 246, 1);">${presetCount} 个</span>
                </div>`;
                
                // Keyframes数量
                const keyframeCount = Object.keys(keyframes).length;
                html += `<div style="padding: 12px; background: rgba(139, 92, 246, 0.05); border-radius: 6px;">
                    <strong style="color: rgba(215, 224, 221, 0.9);">关键帧动画:</strong> 
                    <span style="color: rgba(139, 92, 246, 1);">${keyframeCount} 个</span>
                </div>`;
                
                html += '</div>';
                container.innerHTML = html;
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载动画信息失败: ${e.message}</p>`;
            }
        },
        
        /**
         * 加载随机二次元背景
         */
        _loadRandomAnimeBackground: async function() {
            const btn = this.window.querySelector('#random-anime-bg-btn');
            if (!btn) return;
            
            // 防止重复请求
            if (this._loadingRandomAnimeBg) {
                // 正在加载中，静默处理（不打断用户）
                return;
            }
            
            // 设置加载标志
            this._loadingRandomAnimeBg = true;
            
            // 禁用按钮并显示加载状态
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '⏳ 正在加载...';
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
            
            try {
                // 通过 PHP 代理请求随机二次元背景图片（避免 CORS 问题）
                const proxyUrl = new URL('/system/service/ImageProxy.php', window.location.origin);
                proxyUrl.searchParams.set('url', 'https://api-v1.cenguigui.cn/api/pic/');
                const response = await fetch(proxyUrl.toString());
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // 检查响应类型
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('image/')) {
                    throw new Error('响应不是图片类型');
                }
                
                // 获取图片 blob
                const blob = await response.blob();
                
                // 将 blob 转换为 base64
                const reader = new FileReader();
                const base64Promise = new Promise((resolve, reject) => {
                    reader.onloadend = () => {
                        const base64 = reader.result;
                        resolve(base64);
                    };
                    reader.onerror = reject;
                });
                reader.readAsDataURL(blob);
                const base64 = await base64Promise;
                
                // 生成文件名（使用时间戳）
                const timestamp = Date.now();
                const fileName = `random_anime_bg_${timestamp}.jpg`;
                const filePath = `D:/cache/${fileName}`;
                
                // 确保目录存在（直接尝试创建，409 表示已存在，忽略即可）
                const createDirUrl = new URL('/system/service/FSDirve.php', window.location.origin);
                createDirUrl.searchParams.set('action', 'create_dir');
                createDirUrl.searchParams.set('path', 'D:/');
                createDirUrl.searchParams.set('name', 'cache');
                
                try {
                    const createDirResponse = await fetch(createDirUrl.toString());
                    // 409 表示目录已存在，这是正常情况，完全忽略
                    // 其他错误才记录警告
                    if (!createDirResponse.ok && createDirResponse.status !== 409) {
                        const errorResult = await createDirResponse.json().catch(() => ({}));
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `创建目录失败: ${errorResult.message || `HTTP ${createDirResponse.status}`}`);
                        }
                    }
                } catch (e) {
                    // 网络错误，忽略（目录可能已存在）
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', '创建目录时出错', e);
                    }
                }
                
                // 清理旧的随机二次元背景图（通过 CacheDrive 管理）
                try {
                    await this._cleanupOldRandomAnimeBackgrounds();
                } catch (e) {
                    // 清理失败不影响新图片的保存
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ThemeAnimator', '清理旧背景图失败', e);
                    }
                }
                
                // 保存图片到本地（使用 FileSystem API）
                if (typeof ProcessManager === 'undefined') {
                    throw new Error('ProcessManager 不可用');
                }
                
                // 提取 base64 数据部分（去掉 data:image/jpeg;base64, 前缀）
                const base64Data = base64.split(',')[1] || base64;
                
                // 使用 FileSystem.write 保存图片文件（通过 PHP 服务，支持 base64）
                const url = new URL('/system/service/FSDirve.php', window.location.origin);
                url.searchParams.set('action', 'write_file');
                url.searchParams.set('path', 'D:/cache/');
                url.searchParams.set('fileName', fileName);
                url.searchParams.set('writeMod', 'overwrite');
                
                const saveResponse = await fetch(url.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        content: base64Data,
                        isBase64: true  // 告诉 FSDirve.php 这是 base64 编码，需要解码
                    })
                });
                
                if (!saveResponse.ok) {
                    throw new Error(`保存文件失败: HTTP ${saveResponse.status}`);
                }
                
                const saveResult = await saveResponse.json();
                if (saveResult.status !== 'success') {
                    throw new Error(`保存文件失败: ${saveResult.message || '未知错误'}`);
                }
                
                // 使用 CacheDrive 保存图片元数据（永不过期，除非功能被禁用）
                const cacheKey = `random_anime_bg:${fileName}`;
                const cacheValue = {
                    filePath: filePath,
                    fileName: fileName,
                    timestamp: timestamp,
                    source: 'api-v1.cenguigui.cn'
                };
                
                try {
                    await ProcessManager.callKernelAPI(
                        this.pid,
                        'Cache.set',
                        [cacheKey, cacheValue, { ttl: 0 }] // 永不过期（ttl: 0）
                    );
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', `已保存背景图缓存元数据: ${cacheKey}（永不过期）`);
                    }
                } catch (cacheError) {
                    // 缓存保存失败不影响图片保存，只记录警告
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ThemeAnimator', '保存背景图缓存元数据失败', cacheError);
                    }
                }
                
                // 使用 ThemeManager 设置背景
                if (typeof ThemeManager !== 'undefined') {
                    const result = await ThemeManager.setLocalImageAsBackground(filePath, true);
                    
                    if (result) {
                        // 保存请求状态为成功
                        if (typeof LStorage !== 'undefined') {
                            try {
                                await LStorage.setSystemStorage('system.randomAnimeBgStatus', 'success');
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ThemeAnimator', '保存请求状态失败', e);
                                }
                            }
                        }
                        
                        // 更新当前背景显示
                        const currentBackground = ThemeManager._desktopBackgrounds.get(ThemeManager._currentDesktopBackgroundId);
                        if (currentBackground) {
                            this._updateCurrentBackgroundDisplay({
                                id: currentBackground.id,
                                name: '随机二次元背景',
                                description: '来自 api-v1.cenguigui.cn 的随机二次元图片'
                            });
                        }
                        
                        // 刷新背景图卡片列表，确保新加载的背景图显示在列表中
                        this._updateBackgroundsList();
                        
                        // 成功时不显示弹窗，静默完成
                    } else {
                        throw new Error('设置背景失败');
                    }
                } else {
                    throw new Error('ThemeManager 不可用');
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '加载随机二次元背景失败', e);
                }
                
                // 保存请求状态为失败
                if (typeof LStorage !== 'undefined') {
                    try {
                        await LStorage.setSystemStorage('system.randomAnimeBgStatus', 'failed');
                    } catch (storageError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', '保存请求状态失败', storageError);
                        }
                    }
                }
                
                // 显示错误消息，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '加载失败',
                            content: `加载随机二次元背景失败: ${e.message}`,
                            duration: 4000
                        });
                    } catch (notifError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `创建通知失败: ${notifError.message}`);
                        }
                    }
                }
            } finally {
                // 恢复按钮状态
                btn.disabled = false;
                btn.textContent = originalText;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                
                // 清除加载标志
                this._loadingRandomAnimeBg = false;
            }
        },
        
        /**
         * 取消随机二次元背景功能
         */
        _cancelRandomAnimeBackground: async function() {
            // 清除请求状态，禁用自动请求
            if (typeof LStorage !== 'undefined') {
                try {
                    await LStorage.setSystemStorage('system.randomAnimeBgStatus', 'disabled');
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', '已禁用随机二次元背景功能');
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ThemeAnimator', '保存禁用状态失败', e);
                    }
                }
            }
            
            // 更新所有随机背景图缓存的过期时间为30分钟
            try {
                await this._updateRandomAnimeBgCacheExpiration(30 * 60 * 1000); // 30分钟
            } catch (e) {
                // 更新缓存过期时间失败不影响功能禁用，只记录警告
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('ThemeAnimator', '更新背景图缓存过期时间失败', e);
                }
            }
            
            // 显示提示消息，使用通知提示（不打断用户）
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                try {
                    await NotificationManager.createNotification(this.pid, {
                        type: 'snapshot',
                        title: '主题管理器',
                        content: '已取消随机二次元背景功能。刷新时将不再自动请求。背景图将在30分钟后自动清理。',
                        duration: 4000
                    });
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ThemeAnimator', `创建通知失败: ${e.message}`);
                    }
                }
            }
        },
        
        /**
         * 更新所有随机二次元背景图缓存的过期时间
         * @param {number} ttl 过期时间（毫秒）
         */
        _updateRandomAnimeBgCacheExpiration: async function(ttl) {
            if (typeof ProcessManager === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('ThemeAnimator', 'ProcessManager 不可用，跳过更新缓存过期时间');
                }
                return;
            }
            
            try {
                // 直接读取缓存元数据文件，获取所有缓存键
                const cacheMetadataPath = 'D:/LocalCache.json';
                let cacheMetadata = null;
                
                try {
                    const readResult = await ProcessManager.callKernelAPI(
                        this.pid,
                        'FileSystem.read',
                        [cacheMetadataPath]
                    );
                    
                    if (readResult && readResult.status === 'success' && readResult.data && readResult.data.content) {
                        try {
                            cacheMetadata = JSON.parse(readResult.data.content);
                        } catch (parseError) {
                            // JSON 解析失败
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ThemeAnimator', '解析缓存元数据文件失败', parseError);
                            }
                            return;
                        }
                    } else {
                        // 文件不存在或读取失败，这是正常情况（可能还没有缓存）
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', '缓存元数据文件不存在，可能还没有缓存');
                        }
                        return;
                    }
                } catch (readError) {
                    // 文件不存在或读取失败，这是正常情况（可能还没有缓存）
                    // 检查错误消息，如果是文件不存在，只记录调试信息
                    const errorMessage = readError?.message || readError?.toString() || '';
                    const isFileNotFound = errorMessage.includes('文件不存在') || 
                                         errorMessage.includes('不存在') ||
                                         errorMessage.includes('404') ||
                                         errorMessage.includes('Not Found');
                    
                    if (isFileNotFound) {
                        // 文件不存在是正常情况，只记录调试信息
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', '缓存元数据文件不存在，可能还没有缓存');
                        }
                    } else {
                        // 其他错误，记录警告
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', '读取缓存元数据文件失败', readError);
                        }
                    }
                    return;
                }
                
                if (!cacheMetadata || !cacheMetadata.system || typeof cacheMetadata.system !== 'object') {
                    return;
                }
                
                // 查找所有 random_anime_bg 相关的缓存键
                const cacheKeys = Object.keys(cacheMetadata.system).filter(key => 
                    key.startsWith('random_anime_bg:')
                );
                
                if (cacheKeys.length === 0) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', '没有找到需要更新的背景图缓存');
                    }
                    return;
                }
                
                let updatedCount = 0;
                
                // 更新每个缓存条目的过期时间
                for (const cacheKey of cacheKeys) {
                    try {
                        // 获取当前缓存值
                        const cacheValue = await ProcessManager.callKernelAPI(
                            this.pid,
                            'Cache.get',
                            [cacheKey, null]
                        );
                        
                        if (cacheValue) {
                            // 使用相同的值重新设置缓存，但更新过期时间
                            await ProcessManager.callKernelAPI(
                                this.pid,
                                'Cache.set',
                                [cacheKey, cacheValue, { ttl: ttl }]
                            );
                            updatedCount++;
                            
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `已更新缓存过期时间: ${cacheKey}，过期时间: ${ttl}ms`);
                            }
                        }
                    } catch (e) {
                        // 单个缓存条目更新失败不影响其他条目
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `更新缓存条目 ${cacheKey} 失败`, e);
                        }
                    }
                }
                
                if (updatedCount > 0) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('ThemeAnimator', `已更新 ${updatedCount} 个背景图缓存的过期时间为 ${ttl}ms`);
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '更新背景图缓存过期时间时出错', e);
                }
                throw e;
            }
        },
        
        /**
         * 清理旧的随机二次元背景图（通过 CacheDrive 管理）
         */
        _cleanupOldRandomAnimeBackgrounds: async function() {
            try {
                if (typeof ProcessManager === 'undefined') {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', 'ProcessManager 不可用，跳过清理');
                    }
                    return;
                }
                
                // 直接读取缓存元数据文件，获取所有缓存键
                const cacheMetadataPath = 'D:/LocalCache.json';
                let cacheMetadata = null;
                
                try {
                    const readResult = await ProcessManager.callKernelAPI(
                        this.pid,
                        'FileSystem.read',
                        [cacheMetadataPath]
                    );
                    
                    if (readResult && readResult.status === 'success' && readResult.data && readResult.data.content) {
                        try {
                            cacheMetadata = JSON.parse(readResult.data.content);
                        } catch (parseError) {
                            // JSON 解析失败
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ThemeAnimator', '解析缓存元数据文件失败', parseError);
                            }
                            return;
                        }
                    } else {
                        // 文件不存在或读取失败，这是正常情况（可能还没有缓存）
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', '缓存元数据文件不存在，可能还没有缓存');
                        }
                        return;
                    }
                } catch (readError) {
                    // 文件不存在或读取失败，这是正常情况（可能还没有缓存）
                    // 检查错误消息，如果是文件不存在，只记录调试信息
                    const errorMessage = readError?.message || readError?.toString() || '';
                    const isFileNotFound = errorMessage.includes('文件不存在') || 
                                         errorMessage.includes('不存在') ||
                                         errorMessage.includes('404') ||
                                         errorMessage.includes('Not Found');
                    
                    if (isFileNotFound) {
                        // 文件不存在是正常情况，只记录调试信息
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', '缓存元数据文件不存在，可能还没有缓存');
                        }
                    } else {
                        // 其他错误，记录警告
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', '读取缓存元数据文件失败', readError);
                        }
                    }
                    return;
                }
                
                if (!cacheMetadata || !cacheMetadata.system || typeof cacheMetadata.system !== 'object') {
                    return;
                }
                
                // 查找所有 random_anime_bg 相关的缓存键
                const cacheKeys = Object.keys(cacheMetadata.system).filter(key => 
                    key.startsWith('random_anime_bg:')
                );
                
                if (cacheKeys.length === 0) {
                    return;
                }
                
                let cleanedCount = 0;
                
                // 检查每个缓存条目是否过期，如果过期则删除对应的文件
                for (const cacheKey of cacheKeys) {
                    try {
                        const cacheEntry = cacheMetadata.system[cacheKey];
                        if (!cacheEntry || !cacheEntry.value) {
                            // 缓存条目无效，直接删除
                            await ProcessManager.callKernelAPI(
                                this.pid,
                                'Cache.delete',
                                [cacheKey]
                            ).catch(() => {});
                            continue;
                        }
                        
                        const cacheValue = cacheEntry.value;
                        
                        // 检查缓存是否过期（使用 Cache.has 检查，它会自动检查过期时间）
                        const hasCache = await ProcessManager.callKernelAPI(
                            this.pid,
                            'Cache.has',
                            [cacheKey]
                        );
                        
                        if (!hasCache) {
                            // 缓存已过期或不存在，删除对应的文件
                            if (cacheValue && cacheValue.filePath) {
                                // 尝试删除文件
                                try {
                                    const deleteResult = await ProcessManager.callKernelAPI(
                                        this.pid,
                                        'FileSystem.delete',
                                        [cacheValue.filePath]
                                    );
                                    
                                    if (deleteResult && deleteResult.status === 'success') {
                                        // 删除缓存元数据
                                        await ProcessManager.callKernelAPI(
                                            this.pid,
                                            'Cache.delete',
                                            [cacheKey]
                                        );
                                        cleanedCount++;
                                        
                                        if (typeof KernelLogger !== 'undefined') {
                                            KernelLogger.debug('ThemeAnimator', `已删除过期背景图: ${cacheValue.fileName || cacheKey}`);
                                        }
                                    }
                                } catch (deleteError) {
                                    // 文件删除失败，但删除缓存元数据
                                    await ProcessManager.callKernelAPI(
                                        this.pid,
                                        'Cache.delete',
                                        [cacheKey]
                                    ).catch(() => {});
                                    
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ThemeAnimator', `删除文件失败: ${cacheValue.filePath}`, deleteError);
                                    }
                                }
                            } else {
                                // 缓存值无效，直接删除缓存元数据
                                await ProcessManager.callKernelAPI(
                                    this.pid,
                                    'Cache.delete',
                                    [cacheKey]
                                ).catch(() => {});
                                
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug('ThemeAnimator', `缓存值无效，已删除缓存元数据: ${cacheKey}`);
                                }
                            }
                        }
                    } catch (e) {
                        // 单个缓存条目处理失败不影响其他条目
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `处理缓存条目 ${cacheKey} 失败`, e);
                        }
                    }
                }
                
                if (cleanedCount > 0) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', `已清理 ${cleanedCount} 个过期背景图文件`);
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('ThemeAnimator', '清理旧背景图时出错', e);
                }
                // 不抛出错误，允许继续执行
            }
        },
        
        /**
         * 删除背景（包括文件、缓存和注册表）
         * @param {Object} background 背景对象
         * @param {boolean} isRandomAnimeBg 是否是随机二次元背景图
         */
        _deleteBackground: async function(background, isRandomAnimeBg) {
            try {
                // 确认删除
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                    const confirmed = await GUIManager.showConfirm(
                        `确定要删除背景 "${background.name || background.id}" 吗？\n此操作将删除文件、缓存和注册表中的相关数据，且无法恢复。`,
                        '确认删除',
                        'danger'
                    );
                    if (!confirmed) {
                        return;
                    }
                } else {
                    if (!confirm(`确定要删除背景 "${background.name || background.id}" 吗？\n此操作将删除文件、缓存和注册表中的相关数据，且无法恢复。`)) {
                        return;
                    }
                }
                
                // 1. 如果当前正在使用该背景，先切换到默认背景
                const currentBackgroundId = ProcessManager.getCurrentDesktopBackground(this.pid);
                if (currentBackgroundId === background.id) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', `当前正在使用该背景，切换到默认背景`);
                    }
                    await ProcessManager.setDesktopBackground('default', this.pid);
                }
                
                // 2. 删除文件
                if (background.path && (background.path.startsWith('C:') || background.path.startsWith('D:'))) {
                    try {
                        // 解析路径：分离父目录路径和文件名
                        const pathParts = background.path.split('/');
                        const fileName = pathParts[pathParts.length - 1];
                        const parentPath = pathParts.slice(0, -1).join('/') || (background.path.split(':')[0] + ':');
                        
                        // 确保路径格式正确
                        let phpPath = parentPath;
                        if (/^[CD]:$/.test(phpPath)) {
                            phpPath = phpPath + '/';
                        }
                        
                        const url = new URL('/system/service/FSDirve.php', window.location.origin);
                        url.searchParams.set('action', 'delete_file');
                        url.searchParams.set('path', phpPath);
                        url.searchParams.set('fileName', fileName);
                        
                        const response = await fetch(url.toString());
                        if (!response.ok) {
                            const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                            throw new Error(errorResult.message || `HTTP ${response.status}`);
                        }
                        
                        const result = await response.json();
                        if (result.status !== 'success') {
                            throw new Error(result.message || '删除文件失败');
                        }
                        
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `已删除背景文件: ${background.path}`);
                        }
                    } catch (fileError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `删除背景文件失败: ${fileError.message}`);
                        }
                        // 文件删除失败不影响后续操作，继续执行
                    }
                }
                
                // 3. 如果是随机二次元背景图，从 CacheDrive 删除缓存
                if (isRandomAnimeBg && background.path) {
                    try {
                        // 提取文件名
                        const fileName = background.path.split('/').pop() || '';
                        if (fileName) {
                            const cacheKey = `random_anime_bg:${fileName}`;
                            
                            if (typeof ProcessManager !== 'undefined') {
                                try {
                                    await ProcessManager.callKernelAPI(
                                        this.pid,
                                        'Cache.delete',
                                        [cacheKey]
                                    );
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.debug('ThemeAnimator', `已删除缓存: ${cacheKey}`);
                                    }
                                } catch (cacheError) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('ThemeAnimator', `删除缓存失败: ${cacheError.message}`);
                                    }
                                    // 缓存删除失败不影响后续操作，继续执行
                                }
                            }
                        }
                    } catch (cacheError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `删除缓存时出错: ${cacheError.message}`);
                        }
                        // 缓存删除失败不影响后续操作，继续执行
                    }
                }
                
                // 4. 从 system.localDesktopBackgrounds 中删除
                if (typeof LStorage !== 'undefined') {
                    try {
                        let localBackgrounds = await LStorage.getSystemStorage('system.localDesktopBackgrounds');
                        if (Array.isArray(localBackgrounds)) {
                            const index = localBackgrounds.findIndex(bg => bg && bg.id === background.id);
                            if (index >= 0) {
                                localBackgrounds.splice(index, 1);
                                await LStorage.setSystemStorage('system.localDesktopBackgrounds', localBackgrounds);
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug('ThemeAnimator', `已从注册表删除背景: ${background.id}`);
                                }
                            }
                        }
                    } catch (storageError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `从注册表删除背景失败: ${storageError.message}`);
                        }
                        // 注册表删除失败不影响后续操作，继续执行
                    }
                }
                
                // 5. 从 ThemeManager 的注册表中删除
                if (typeof ThemeManager !== 'undefined' && ThemeManager._desktopBackgrounds) {
                    try {
                        ThemeManager._desktopBackgrounds.delete(background.id);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('ThemeAnimator', `已从 ThemeManager 注册表删除背景: ${background.id}`);
                        }
                    } catch (themeError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `从 ThemeManager 注册表删除背景失败: ${themeError.message}`);
                        }
                        // ThemeManager 删除失败不影响后续操作，继续执行
                    }
                }
                
                // 6. 刷新背景列表
                this._updateBackgroundsList();
                
                // 7. 更新当前背景显示
                const newCurrentBackgroundId = ProcessManager.getCurrentDesktopBackground(this.pid);
                if (newCurrentBackgroundId) {
                    const newCurrentBackground = ProcessManager.getDesktopBackground(newCurrentBackgroundId, this.pid);
                    if (newCurrentBackground) {
                        this._updateCurrentBackgroundDisplay(newCurrentBackground);
                    }
                }
                
                // 删除成功，静默完成（不显示弹窗）
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ThemeAnimator', '删除背景失败', error);
                }
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`删除背景失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`删除背景失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 清理旧的随机二次元背景图（降级方案：直接操作文件系统）
         */
        _cleanupOldRandomAnimeBackgroundsFallback: async function() {
            try {
                if (typeof ProcessManager === 'undefined') {
                    return;
                }
                
                // 列出 D:/cache/ 目录下的所有文件
                const listResult = await ProcessManager.callKernelAPI(
                    this.pid,
                    'FileSystem.list',
                    ['D:/cache/']
                );
                
                if (!listResult || listResult.status !== 'success' || !Array.isArray(listResult.data)) {
                    return;
                }
                
                // 查找所有 random_anime_bg_*.jpg 文件
                const oldBackgroundFiles = listResult.data.filter(item => 
                    item.type === 'file' && 
                    item.name.startsWith('random_anime_bg_') && 
                    item.name.endsWith('.jpg')
                );
                
                // 删除所有旧的背景图文件
                for (const file of oldBackgroundFiles) {
                    try {
                        const filePath = `D:/cache/${file.name}`;
                        const deleteResult = await ProcessManager.callKernelAPI(
                            this.pid,
                            'FileSystem.delete',
                            [filePath]
                        );
                        
                        if (deleteResult && deleteResult.status === 'success') {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('ThemeAnimator', `已删除旧背景图: ${file.name}`);
                            }
                        }
                    } catch (e) {
                        // 单个文件删除失败不影响其他文件的删除
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ThemeAnimator', `删除文件 ${file.name} 失败`, e);
                        }
                    }
                }
                
                if (oldBackgroundFiles.length > 0) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('ThemeAnimator', `已清理 ${oldBackgroundFiles.length} 个旧背景图文件`);
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('ThemeAnimator', '降级清理旧背景图时出错', e);
                }
            }
        }
    };
    
    // 导出到全局（通过POOL管理）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_POOL")) {
                POOL.__INIT__("APPLICATION_POOL");
            }
            POOL.__ADD__("APPLICATION_POOL", "THEMEANIMATOR", THEMEANIMATOR);
        } catch (e) {
            // 降级方案
            if (typeof window !== 'undefined') {
                window.THEMEANIMATOR = THEMEANIMATOR;
            }
        }
    } else {
        if (typeof window !== 'undefined') {
            window.THEMEANIMATOR = THEMEANIMATOR;
        }
    }
    
})(window);

