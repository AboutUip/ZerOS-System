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
        
        __init__: async function(pid, initArgs) {
            console.log('[themeanimator] __init__ 被调用, PID:', pid);
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
                
                GUIManager.registerWindow(pid, this.window, {
                    title: '主题与动画管理器',
                    icon: icon,
                    onClose: () => {
                        // 调用 ProcessManager.killProgram 来终止程序
                        // 这会触发 __exit__ 方法并清理所有资源
                        if (typeof ProcessManager !== 'undefined' && this.pid) {
                            ProcessManager.killProgram(this.pid).catch(e => {
                                console.error('[themeanimator] 关闭程序失败:', e);
                            });
                        } else {
                            // 降级：直接调用 __exit__
                            this.__exit__();
                        }
                    }
                });
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
            console.log('[themeanimator] 准备创建背景面板');
            const backgroundPanel = this._createBackgroundPanel();
            console.log('[themeanimator] 背景面板创建完成:', backgroundPanel);
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
        },
        
        __info__: function() {
            return {
                name: '主题管理器',
                type: 'GUI',
                description: '系统主题与动画的调控与管理',
                version: '1.0.0',
                author: 'ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.THEME_READ,
                    PermissionManager.PERMISSION.THEME_WRITE
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
                            console.log('[themeanimator] 背景面板显示，按钮状态:', {
                                insideBtn: insideBtn ? '存在且可见' : '不存在'
                            });
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
            console.log('[themeanimator] 开始创建背景面板');
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
            nameElement.style.cssText = 'font-size: 18px; font-weight: 600; color: rgba(139, 92, 246, 1); margin-bottom: 8px;';
            nameElement.textContent = '加载中...';
            currentBackgroundDisplay.appendChild(nameElement);
            
            // 创建描述元素
            const descElement = document.createElement('div');
            descElement.id = 'current-background-description';
            descElement.style.cssText = 'font-size: 13px; color: rgba(215, 224, 221, 0.7); margin-bottom: 12px;';
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
                console.log('[themeanimator] 点击内部按钮');
                this._openFileSelector();
            });
            currentBackgroundDisplay.appendChild(selectLocalImageBtnInside);
            console.log('[themeanimator] 内部按钮已添加到DOM:', selectLocalImageBtnInside, '父元素:', currentBackgroundDisplay);
            
            currentSection.appendChild(currentBackgroundDisplay);
            
            panel.appendChild(currentSection);
            
            // 验证按钮是否已添加到DOM
            setTimeout(() => {
                const insideBtn = panel.querySelector('#select-local-image-btn-inside');
                const currentDisplay = panel.querySelector('.current-background-display');
                console.log('[themeanimator] 面板创建完成，检查按钮:', {
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
                    <div id="current-animation-preset-name" style="font-size: 18px; font-weight: 600; color: rgba(139, 92, 246, 1); margin-bottom: 8px;">加载中...</div>
                    <div id="current-animation-preset-description" style="font-size: 13px; color: rgba(215, 224, 221, 0.7);">正在加载动画预设信息...</div>
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
            } catch (e) {
                console.error('加载当前设置失败:', e);
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
                console.error('注册主题变更监听器失败:', e);
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
                console.error('注册风格变更监听器失败:', e);
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
                    console.error('注册动画预设变更监听器失败:', e);
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
            `;
            name.textContent = theme.name || theme.id;
            card.appendChild(name);
            
            // 主题描述
            if (theme.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                `;
                desc.textContent = theme.description;
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
                        console.log(`[themeanimator] 切换主题: ${theme.id}`);
                        const result = await ProcessManager.setTheme(theme.id, this.pid);
                        if (!result) {
                            console.error(`[themeanimator] 切换主题失败: 主题 ${theme.id} 不存在或无法应用`);
                            alert(`切换主题失败: 主题 ${theme.id} 不存在或无法应用`);
                        } else {
                            console.log(`[themeanimator] 主题切换成功: ${theme.id}`);
                            // 成功时，监听器会自动更新UI
                        }
                    } catch (e) {
                        console.error('[themeanimator] 切换主题失败:', e);
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
            `;
            name.textContent = style.name || style.id;
            card.appendChild(name);
            
            // 风格描述
            if (style.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                `;
                desc.textContent = style.description;
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
                        console.log(`[themeanimator] 切换风格: ${style.id}`);
                        const result = await ProcessManager.setStyle(style.id, this.pid);
                        if (!result) {
                            console.error(`[themeanimator] 切换风格失败: 风格 ${style.id} 不存在或无法应用`);
                            alert(`切换风格失败: 风格 ${style.id} 不存在或无法应用`);
                        } else {
                            console.log(`[themeanimator] 风格切换成功: ${style.id}`);
                            // 成功时，监听器会自动更新UI
                        }
                    } catch (e) {
                        console.error('[themeanimator] 切换风格失败:', e);
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
                nameEl.textContent = style.name || style.id;
            }
            if (descEl) {
                descEl.textContent = style.description || '无描述';
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
                
                container.innerHTML = '';
                backgrounds.forEach(background => {
                    const backgroundCard = this._createBackgroundCard(background);
                    container.appendChild(backgroundCard);
                });
            } catch (e) {
                container.innerHTML = `<p style="color: rgba(255, 95, 87, 0.8);">加载背景列表失败: ${e.message}</p>`;
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
                               background.path.includes('/service/DISK/');
            
            if (isLocalPath) {
                // 转换为 PHP 服务 URL
                if (background.path.startsWith('C:')) {
                    previewUrl = '/service/DISK/C' + background.path.substring(2).replace(/\\/g, '/');
                } else if (background.path.startsWith('D:')) {
                    previewUrl = '/service/DISK/D' + background.path.substring(2).replace(/\\/g, '/');
                } else if (background.path.includes('/service/DISK/')) {
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
            `;
            name.textContent = background.name || background.id;
            card.appendChild(name);
            
            // 背景描述
            if (background.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                `;
                desc.textContent = background.description;
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
            
            // 点击切换背景
            if (!isActive) {
                card.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        console.log(`[themeanimator] 切换桌面背景: ${background.id}`);
                        const result = await ProcessManager.setDesktopBackground(background.id, this.pid);
                        if (!result) {
                            console.error(`[themeanimator] 切换桌面背景失败: 背景 ${background.id} 不存在或无法应用`);
                            alert(`切换桌面背景失败: 背景 ${background.id} 不存在或无法应用`);
                        } else {
                            console.log(`[themeanimator] 桌面背景切换成功: ${background.id}`);
                            // 更新当前背景显示
                            this._updateCurrentBackgroundDisplay(background);
                            // 更新背景列表
                            this._updateBackgroundsList();
                        }
                    } catch (e) {
                        console.error('[themeanimator] 切换桌面背景失败:', e);
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
                nameEl.textContent = background.name || background.id;
            }
            if (descEl) {
                descEl.textContent = background.description || '无描述';
            }
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
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert('ProcessManager 不可用', '错误', 'error');
                } else {
                    alert('ProcessManager 不可用');
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
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert('请选择图片文件（jpg, png, gif, bmp, svg, webp, ico）或视频文件（mp4, webm, ogg）', '提示', 'info');
                            } else {
                                alert('请选择图片文件（jpg, png, gif, bmp, svg, webp, ico）或视频文件（mp4, webm, ogg）');
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
                                    
                                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                        await GUIManager.showAlert(`背景设置成功！${isVideo ? '（视频将静音循环播放）' : ''}`, '成功', 'success');
                                    } else {
                                        alert(`背景设置成功！${isVideo ? '（视频将静音循环播放）' : ''}`);
                                    }
                                } else {
                                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                        await GUIManager.showAlert(`设置背景失败：${isVideo ? '视频' : '图片'}不存在或无法访问`, '错误', 'error');
                                    } else {
                                        alert(`设置背景失败：${isVideo ? '视频' : '图片'}不存在或无法访问`);
                                    }
                                }
                            } catch (e) {
                                console.error('[themeanimator] 设置本地背景失败:', e);
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                    await GUIManager.showAlert(`设置背景失败: ${e.message}`, '错误', 'error');
                                } else {
                                    alert(`设置背景失败: ${e.message}`);
                                }
                            }
                        } else {
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert('ThemeManager 不可用', '错误', 'error');
                            } else {
                                alert('ThemeManager 不可用');
                            }
                        }
                    }
                });
                
                if (!fileManagerPid) {
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        await GUIManager.showAlert('无法启动文件管理器', '错误', 'error');
                    } else {
                        alert('无法启动文件管理器');
                    }
                }
            } catch (e) {
                console.error('[themeanimator] 打开文件选择器失败:', e);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`打开文件选择器失败: ${e.message}`, '错误', 'error');
                } else {
                    alert(`打开文件选择器失败: ${e.message}`);
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
            `;
            name.textContent = preset.name || preset.id;
            card.appendChild(name);
            
            // 预设描述
            if (preset.description) {
                const desc = document.createElement('div');
                desc.style.cssText = `
                    font-size: 12px;
                    color: rgba(215, 224, 221, 0.6);
                    line-height: 1.4;
                `;
                desc.textContent = preset.description;
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
                        console.log(`[themeanimator] 切换动画预设: ${preset.id}`);
                        const result = await ThemeManager.setAnimationPreset(preset.id, true);
                        if (!result) {
                            console.error(`[themeanimator] 切换动画预设失败: 预设 ${preset.id} 不存在或无法应用`);
                            alert(`切换动画预设失败: 预设 ${preset.id} 不存在或无法应用`);
                        } else {
                            console.log(`[themeanimator] 动画预设切换成功: ${preset.id}`);
                            // 成功时，监听器会自动更新UI
                        }
                    } catch (e) {
                        console.error('[themeanimator] 切换动画预设失败:', e);
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
                nameEl.textContent = preset.name || preset.id || '未知';
            }
            if (descEl) {
                descEl.textContent = preset.description || '无描述';
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

