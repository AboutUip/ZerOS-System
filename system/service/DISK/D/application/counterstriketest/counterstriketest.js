(function(window) {
    'use strict';
    
    const COUNTERSTRIKETEST = {
        pid: null,
        window: null,
        windowId: null,
        guiContainer: null,
        
        THREE: null,
        scene: null,
        camera: null,
        renderer: null,
        
        gameState: 'loading',
        
        _eventHandlers: [],
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            this._eventHandlers = [];
            this.guiContainer = null;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

            try {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('CounterStrikeTest', '程序初始化');
                }
                
                this.guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
                
                this.window = document.createElement('div');
                this.window.className = 'counterstriketest-window zos-gui-window';
                this.window.dataset.pid = pid.toString();
                
                this.window.style.cssText = `
                    width: 800px;
                    height: 600px;
                    min-width: 800px;
                    min-height: 600px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                `;
                
                if (typeof GUIManager !== 'undefined') {
                    let icon = null;
                    if (typeof ApplicationAssetManager !== 'undefined') {
                        icon = ApplicationAssetManager.getIcon('counterstriketest');
                    }
                    
                    const windowInfo = GUIManager.registerWindow(pid, this.window, {
                        title: 'Counter-Strike Test',
                        icon: icon,
                        borderless: true,
                        noTitleBar: true,
                        dragHandle: this.window,
                        onClose: () => {
                        }
                    });
                    
                    if (windowInfo && windowInfo.windowId) {
                        this.windowId = windowInfo.windowId;
                    }
                }
                
                this.guiContainer.appendChild(this.window);
                
                this._createLoadingScreen();
                
                await this._waitMinLoadingTime();
                
                await this._loadThreeJS();
                
                this._showMainWindow();
                
                // 检查是否需要自动全屏（异步加载设置）
                (async () => {
                    const windowMode = await this._getSetting('windowMode', '窗口');
                    if (windowMode === '全屏') {
                        this._enterFullscreen();
                    }
                })();
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('CounterStrikeTest', '等待进入游戏...');
                }
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('CounterStrikeTest', `初始化失败: ${error.message}`, error);
                }
            }
        },
        
        _waitMinLoadingTime: function() {
            return new Promise((resolve) => {
                setTimeout(resolve, 3000);
            });
        },
        
        _createLoadingScreen: function() {
            const loadingScreen = document.createElement('div');
            loadingScreen.className = 'cst-loading';
            loadingScreen.style.cssText = `
                flex: 1;
                display: flex;
                justify-content: center;
                align-items: center;
                background: linear-gradient(135deg, #D4A017 0%, #B8860B 50%, #8B6914 100%);
                position: relative;
                overflow: hidden;
            `;
            
            loadingScreen.innerHTML = `
                <div class="cst-title-container">
                    <div class="cst-title">COUNTER-STRIKE</div>
                    <div class="cst-subtitle">TEST</div>
                    <div class="cst-glitch" data-text="COUNTER-STRIKE">COUNTER-STRIKE</div>
                </div>
                <div class="cst-scanlines"></div>
                <div class="cst-particles"></div>
            `;
            
            this.window.appendChild(loadingScreen);
            this.loadingScreen = loadingScreen;
            
            this._addParticles();
        },
        
        _addParticles: function() {
            const particlesContainer = this.loadingScreen.querySelector('.cst-particles');
            if (!particlesContainer) return;
            
            for (let i = 0; i < 30; i++) {
                const particle = document.createElement('div');
                particle.className = 'cst-particle';
                particle.style.cssText = `
                    position: absolute;
                    width: ${Math.random() * 3 + 1}px;
                    height: ${Math.random() * 3 + 1}px;
                    background: rgba(0, 0, 0, ${Math.random() * 0.5 + 0.2});
                    left: ${Math.random() * 100}%;
                    top: ${Math.random() * 100}%;
                    animation: cst-float ${Math.random() * 3 + 2}s ease-in-out infinite;
                    animation-delay: ${Math.random() * 2}s;
                `;
                particlesContainer.appendChild(particle);
            }
        },
        
        _showMainWindow: function() {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('CounterStrikeTest', '切换到游戏主窗口');
            }
            
            if (this.loadingScreen && this.loadingScreen.parentElement) {
                this.loadingScreen.parentElement.removeChild(this.loadingScreen);
            }
            
            this._createGameUI();
            this._setupResizeHandler();
        },
        
        _setupResizeHandler: function() {
            if (typeof EventManager !== 'undefined') {
                const resizeHandler = EventManager.registerEventHandler(this.pid, 'resize', () => {
                    this._handleResize();
                });
            } else {
                window.addEventListener('resize', () => this._handleResize());
                this._eventHandlers.push({
                    element: window,
                    event: 'resize',
                    handler: () => this._handleResize()
                });
            }
        },
        
        _handleResize: function() {
            if (!this.renderer || !this.camera || !this.canvasContainer) {
                return;
            }
            
            const width = this.canvasContainer.clientWidth;
            const height = this.canvasContainer.clientHeight;
            
            if (width > 0 && height > 0) {
                this.camera.aspect = width / height;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(width, height);
            }
        },
        
        _getAssetUrl: function(relativePath) {
            let url = 'D:/application/counterstriketest/assets/' + relativePath;
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
                url = ProcessManager.convertVirtualPathToUrl(url);
            }
            return url;
        },
        
        _getRandomBackgroundImage: function() {
            const backgroundImages = [
                'bg1.jpg',
                'bg2.jpg'
            ];
            const randomIndex = Math.floor(Math.random() * backgroundImages.length);
            return this._getAssetUrl(backgroundImages[randomIndex]);
        },
        
        _createGameUI: function() {
            const style = document.createElement('style');
            style.textContent = `
                @keyframes cst-float {
                    0%, 100% {
                        transform: translateY(0);
                    }
                    50% {
                        transform: translateY(-10px);
                    }
                }
            `;
            this.window.appendChild(style);
            
            const gameContainer = document.createElement('div');
            gameContainer.className = 'cst-game-container';
            gameContainer.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                position: relative;
                overflow: hidden;
                background: #1a1a1a;
            `;
            
            const bgImage = document.createElement('div');
            bgImage.className = 'cst-bg-image';
            bgImage.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-image: url('${this._getRandomBackgroundImage()}');
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                z-index: 0;
            `;
            gameContainer.appendChild(bgImage);
            
            const navBar = document.createElement('div');
            navBar.className = 'cst-nav-bar';
            navBar.style.cssText = `
                height: 60px;
                min-height: 60px;
                display: flex;
                justify-content: center;
                align-items: center;
                background: rgba(20, 20, 20, 0.6);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                z-index: 100;
            `;
            
            const navButtons = ['设置', '商店', '主页', '地图', '个人'];
            navButtons.forEach((text, index) => {
                const button = document.createElement('button');
                button.className = 'cst-nav-button';
                button.textContent = text;
                button.dataset.tab = text;
                button.style.cssText = `
                    flex: 1;
                    max-width: 150px;
                    height: 100%;
                    background: transparent;
                    border: none;
                    color: ${text === '主页' ? '#D4A017' : '#888'};
                    font-family: 'Arial Black', sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    position: relative;
                `;
                
                if (text === '主页') {
                    button.classList.add('active');
                    button.style.cssText += `
                        background: linear-gradient(180deg, rgba(212, 160, 23, 0.2) 0%, transparent 100%);
                    `;
                }
                
                button.addEventListener('mouseenter', () => {
                    if (!button.classList.contains('active')) {
                        button.style.color = '#fff';
                        button.style.background = 'rgba(255, 255, 255, 0.05)';
                    }
                });
                
                button.addEventListener('mouseleave', () => {
                    if (!button.classList.contains('active')) {
                        button.style.color = '#888';
                        button.style.background = 'transparent';
                    }
                });
                
                button.addEventListener('click', () => {
                    this._switchTab(text);
                });
                
                navBar.appendChild(button);
            });
            
            const contentArea = document.createElement('div');
            contentArea.className = 'cst-content-area';
            contentArea.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                background: rgba(10, 10, 10, 0.3);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                position: relative;
                overflow: hidden;
                z-index: 1;
            `;
            
            const homeContent = this._createHomeContent();
            contentArea.appendChild(homeContent);
            this.currentContent = homeContent;
            this.currentTabName = '主页';
            
            gameContainer.appendChild(navBar);
            gameContainer.appendChild(contentArea);
            
            this.window.appendChild(gameContainer);
            this.navBar = navBar;
            this.contentArea = contentArea;
        },
        
        _createHomeContent: function() {
            const container = document.createElement('div');
            container.className = 'cst-home-content';
            container.style.cssText = `
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                width: 100%;
                height: 100%;
            `;
            
            const capsule = document.createElement('div');
            capsule.className = 'cst-capsule';
            capsule.style.cssText = `
                width: 80px;
                height: 200px;
                background: linear-gradient(180deg, #D4A017 0%, #B8860B 50%, #8B6914 100%);
                border-radius: 40px;
                box-shadow: 
                    0 0 30px rgba(212, 160, 23, 0.5),
                    0 0 60px rgba(212, 160, 23, 0.3),
                    inset 0 0 20px rgba(255, 255, 255, 0.2);
                margin-bottom: 30px;
                animation: cst-float 3s ease-in-out infinite;
            `;
            
            const label = document.createElement('div');
            label.className = 'cst-home-label';
            label.textContent = '主页';
            label.style.cssText = `
                font-family: 'Arial Black', sans-serif;
                font-size: 24px;
                color: #D4A017;
                text-shadow: 0 0 10px rgba(212, 160, 23, 0.5);
            `;
            
            container.appendChild(capsule);
            container.appendChild(label);
            
            return container;
        },
        
        // ==================== 设置持久化方法 ====================
        
        /**
         * 保存设置到 LStorage
         */
        _saveSetting: async function(key, value) {
            try {
                if (typeof LStorage !== 'undefined') {
                    if (!LStorage._initialized) {
                        await LStorage.init();
                    }
                    
                    const settingsKey = 'counterstriketest.settings';
                    let settings = LStorage.getSystemStorage(settingsKey);
                    if (!settings) {
                        settings = {};
                    }
                    
                    const oldValue = settings[key];
                    settings[key] = value;
                    await LStorage.setSystemStorage(settingsKey, settings);
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('CounterStrikeTest', `设置已保存：${key} = ${value} (旧值：${oldValue || '无'})`);
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('CounterStrikeTest', `保存设置失败：${key}`, error);
                }
            }
        },
        
        /**
         * 从 LStorage 加载设置
         */
        _loadSettings: async function() {
            try {
                if (typeof LStorage !== 'undefined') {
                    if (!LStorage._initialized) {
                        await LStorage.init();
                    }
                    
                    const settingsKey = 'counterstriketest.settings';
                    const settings = LStorage.getSystemStorage(settingsKey);
                    
                    if (settings && typeof settings === 'object') {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('CounterStrikeTest', `加载设置成功：${JSON.stringify(settings)}`);
                        }
                        return settings;
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('CounterStrikeTest', '加载设置失败', error);
                }
            }
            return {};
        },
        
        /**
         * 获取设置值
         */
        _getSetting: async function(key, defaultValue) {
            const settings = await this._loadSettings();
            return settings.hasOwnProperty(key) ? settings[key] : defaultValue;
        },
        
        /**
         * 应用窗口模式
         */
        _applyWindowMode: async function(mode) {
            if (!this.window) return;
            
            if (mode === '全屏') {
                // 全屏模式
                this._enterFullscreen();
            } else {
                // 窗口模式 - 保持当前状态
                this._exitFullscreen();
            }
            
            // 保存设置（异步）
            await this._saveSetting('windowMode', mode);
        },
        
        /**
         * 进入全屏模式
         */
        _enterFullscreen: function() {
            if (!this.window || !this.windowId) return;
            
            // 使用 GUIManager 的 maximizeWindow API
            if (typeof GUIManager !== 'undefined') {
                GUIManager.maximizeWindow(this.windowId);
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('CounterStrikeTest', '已进入全屏模式');
                }
            }
        },
        
        /**
         * 退出全屏模式
         */
        _exitFullscreen: function() {
            if (!this.window || !this.windowId) return;
            
            // 使用 GUIManager 的 restoreMaximize API
            if (typeof GUIManager !== 'undefined') {
                GUIManager.restoreMaximize(this.windowId);
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('CounterStrikeTest', '已退出全屏模式');
                }
            }
        },
        
        /**
         * 退出游戏
         */
        _exitGame: function() {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('CounterStrikeTest', '用户请求退出游戏');
            }
            
            // 调用内核 API 退出进程
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                this._kernelAPI.call('Process.requestSelfTermination', []).catch(e => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('CounterStrikeTest', 'requestSelfTermination 失败：' + (e && e.message));
                    }
                });
            } else if (typeof ProcessManager !== 'undefined' && this.pid) {
                ProcessManager.killProgram(this.pid);
            }
        },
        
        /**
         * 最小化窗口
         */
        _minimizeWindow: function() {
            if (!this.windowId) return;
            
            if (typeof GUIManager !== 'undefined') {
                GUIManager.minimizeWindow(this.windowId);
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('CounterStrikeTest', '窗口已最小化');
                }
            }
        },
        
        _createSettingsContent: function() {
            const container = document.createElement('div');
            container.className = 'cst-settings-container';
            container.style.cssText = `
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%;
                overflow: hidden;
            `;
            
            // 设置子标签（游戏、画面、音频、按键）
            const subTabBar = document.createElement('div');
            subTabBar.className = 'cst-settings-subtab-bar';
            subTabBar.style.cssText = `
                display: flex;
                height: 50px;
                min-height: 50px;
                background: rgba(20, 20, 20, 0.8);
                border-bottom: 1px solid rgba(212, 160, 23, 0.3);
            `;
            
            const subTabs = ['游戏', '画面', '音频', '按键'];
            subTabs.forEach((subTab, index) => {
                const btn = document.createElement('button');
                btn.className = 'cst-settings-subtab-button';
                btn.textContent = subTab;
                btn.dataset.subtab = subTab;
                btn.style.cssText = `
                    flex: 1;
                    background: transparent;
                    border: none;
                    border-bottom: 3px solid ${index === 0 ? '#D4A017' : 'transparent'};
                    color: ${index === 0 ? '#D4A017' : '#888'};
                    font-family: 'Arial Black', sans-serif;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.2s ease;
                `;
                
                btn.addEventListener('mouseenter', () => {
                    if (!btn.classList.contains('active')) {
                        btn.style.color = '#fff';
                        btn.style.background = 'rgba(255, 255, 255, 0.05)';
                    }
                });
                
                btn.addEventListener('mouseleave', () => {
                    if (!btn.classList.contains('active')) {
                        btn.style.color = '#888';
                        btn.style.background = 'transparent';
                    }
                });
                
                btn.addEventListener('click', async () => {
                    await this._switchSettingsSubTab(subTab);
                });
                
                subTabBar.appendChild(btn);
            });
            
            container.appendChild(subTabBar);
            this.settingsSubTabBar = subTabBar;
            
            // 设置内容区域
            const contentContainer = document.createElement('div');
            contentContainer.className = 'cst-settings-content-container';
            contentContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                background: rgba(10, 10, 10, 0.5);
            `;
            
            container.appendChild(contentContainer);
            this.settingsContentContainer = contentContainer;
            
            // 初始化默认显示游戏设置（异步）
            (async () => {
                await this._switchSettingsSubTab('游戏');
            })();
            
            return container;
        },
        
        _switchSettingsSubTab: async function(subTabName) {
            if (!this.settingsSubTabBar || !this.settingsContentContainer) {
                return;
            }
            
            // 更新子标签样式
            const buttons = this.settingsSubTabBar.querySelectorAll('.cst-settings-subtab-button');
            buttons.forEach(button => {
                if (button.dataset.subtab === subTabName) {
                    button.classList.add('active');
                    button.style.color = '#D4A017';
                    button.style.borderBottomColor = '#D4A017';
                    button.style.background = 'rgba(212, 160, 23, 0.1)';
                } else {
                    button.classList.remove('active');
                    button.style.color = '#888';
                    button.style.borderBottomColor = 'transparent';
                    button.style.background = 'transparent';
                }
            });
            
            // 创建对应的设置内容
            let content;
            switch(subTabName) {
                case '游戏':
                    content = await this._createGameSettings();
                    break;
                case '画面':
                    content = this._createGraphicsSettings();
                    break;
                case '音频':
                    content = this._createAudioSettings();
                    break;
                case '按键':
                    content = this._createKeyBindingsSettings();
                    break;
            }
            
            // 清空并添加新内容
            this.settingsContentContainer.innerHTML = '';
            this.settingsContentContainer.appendChild(content);
        },
        
        _createGameSettings: async function() {
            const container = document.createElement('div');
            container.className = 'cst-settings-section';
            container.style.cssText = `
                max-width: 600px;
                margin: 0 auto;
            `;
            
            const title = document.createElement('div');
            title.textContent = '游戏设置';
            title.style.cssText = `
                font-family: 'Arial Black', sans-serif;
                font-size: 28px;
                color: #D4A017;
                margin-bottom: 30px;
                text-shadow: 0 0 10px rgba(212, 160, 23, 0.5);
            `;
            container.appendChild(title);
            
            // 预先加载窗口模式设置
            const windowMode = await this._getSetting('windowMode', '窗口');
            
            // 游戏窗口模式
            const windowModeSection = this._createSettingSection('游戏窗口模式', [
                { 
                    type: 'toggle', 
                    key: 'windowMode', 
                    label: '显示模式', 
                    options: ['窗口', '全屏'],
                    value: windowMode
                }
            ]);
            container.appendChild(windowModeSection);
            
            // 游戏操作按钮
            const actionsSection = document.createElement('div');
            actionsSection.className = 'cst-setting-section';
            actionsSection.style.cssText = `
                margin-bottom: 30px;
                padding: 20px;
                background: rgba(20, 20, 20, 0.6);
                border-radius: 8px;
                border: 1px solid rgba(212, 160, 23, 0.2);
            `;
            
            const actionsTitle = document.createElement('div');
            actionsTitle.textContent = '游戏操作';
            actionsTitle.style.cssText = `
                font-family: 'Arial Black', sans-serif;
                font-size: 18px;
                color: #D4A017;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid rgba(212, 160, 23, 0.3);
            `;
            actionsSection.appendChild(actionsTitle);
            
            const buttonsContainer = document.createElement('div');
            buttonsContainer.style.cssText = `
                display: flex;
                gap: 15px;
                flex-wrap: wrap;
            `;
            
            // 退出游戏按钮
            const exitBtn = document.createElement('button');
            exitBtn.textContent = '退出游戏';
            exitBtn.className = 'cst-settings-btn cst-settings-btn-danger';
            exitBtn.style.cssText = `
                padding: 12px 24px;
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                border: none;
                border-radius: 8px;
                color: #fff;
                font-family: 'Arial Black', sans-serif;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            exitBtn.addEventListener('mouseenter', () => {
                exitBtn.style.transform = 'scale(1.05)';
                exitBtn.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.6)';
            });
            exitBtn.addEventListener('mouseleave', () => {
                exitBtn.style.transform = 'scale(1)';
                exitBtn.style.boxShadow = 'none';
            });
            exitBtn.addEventListener('click', () => {
                this._exitGame();
            });
            buttonsContainer.appendChild(exitBtn);
            
            // 最小化窗口按钮
            const minimizeBtn = document.createElement('button');
            minimizeBtn.textContent = '最小化窗口';
            minimizeBtn.className = 'cst-settings-btn';
            minimizeBtn.style.cssText = `
                padding: 12px 24px;
                background: linear-gradient(135deg, #D4A017 0%, #B8860B 100%);
                border: none;
                border-radius: 8px;
                color: #000;
                font-family: 'Arial Black', sans-serif;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            minimizeBtn.addEventListener('mouseenter', () => {
                minimizeBtn.style.transform = 'scale(1.05)';
                minimizeBtn.style.boxShadow = '0 0 20px rgba(212, 160, 23, 0.6)';
            });
            minimizeBtn.addEventListener('mouseleave', () => {
                minimizeBtn.style.transform = 'scale(1)';
                minimizeBtn.style.boxShadow = 'none';
            });
            minimizeBtn.addEventListener('click', () => {
                this._minimizeWindow();
            });
            buttonsContainer.appendChild(minimizeBtn);
            
            actionsSection.appendChild(buttonsContainer);
            container.appendChild(actionsSection);
            
            return container;
        },
        
        _createGraphicsSettings: function() {
            const container = document.createElement('div');
            container.className = 'cst-settings-section';
            container.style.cssText = `
                max-width: 600px;
                margin: 0 auto;
            `;
            
            const title = document.createElement('div');
            title.textContent = '画面设置';
            title.style.cssText = `
                font-family: 'Arial Black', sans-serif;
                font-size: 28px;
                color: #D4A017;
                margin-bottom: 30px;
                text-shadow: 0 0 10px rgba(212, 160, 23, 0.5);
            `;
            container.appendChild(title);
            
            // 画质预设
            const presetSection = this._createSettingSection('画质预设', [
                { type: 'select', key: 'graphicsPreset', label: '预设', options: ['低', '中', '高', '超高', '极致'] }
            ]);
            container.appendChild(presetSection);
            
            // 分辨率设置
            const resolutionSection = this._createSettingSection('显示设置', [
                { type: 'select', key: 'resolution', label: '分辨率', options: ['1920x1080', '1600x900', '1280x720', '窗口化'] },
                { type: 'checkbox', key: 'fullscreen', label: '全屏模式', checked: false },
                { type: 'checkbox', key: 'vsync', label: '垂直同步', checked: true }
            ]);
            container.appendChild(resolutionSection);
            
            // 高级图形设置
            const advancedSection = this._createSettingSection('高级设置', [
                { type: 'slider', key: 'renderDistance', label: '渲染距离', min: 50, max: 100, value: 80 },
                { type: 'slider', key: 'textureQuality', label: '纹理质量', min: 0, max: 100, value: 70 },
                { type: 'slider', key: 'shadowQuality', label: '阴影质量', min: 0, max: 100, value: 50 },
                { type: 'slider', key: 'antiAliasing', label: '抗锯齿', min: 0, max: 100, value: 60 },
                { type: 'checkbox', key: 'motionBlur', label: '动态模糊', checked: false },
                { type: 'checkbox', key: 'bloom', label: '泛光效果', checked: true }
            ]);
            container.appendChild(advancedSection);
            
            return container;
        },
        
        _createAudioSettings: function() {
            const container = document.createElement('div');
            container.className = 'cst-settings-section';
            container.style.cssText = `
                max-width: 600px;
                margin: 0 auto;
            `;
            
            const title = document.createElement('div');
            title.textContent = '音频设置';
            title.style.cssText = `
                font-family: 'Arial Black', sans-serif;
                font-size: 28px;
                color: #D4A017;
                margin-bottom: 30px;
                text-shadow: 0 0 10px rgba(212, 160, 23, 0.5);
            `;
            container.appendChild(title);
            
            // 主音量
            const masterVolumeSection = this._createSettingSection('主音量', [
                { type: 'slider', key: 'masterVolume', label: '主音量', min: 0, max: 100, value: 80 }
            ]);
            container.appendChild(masterVolumeSection);
            
            // 分类音量
            const volumeSection = this._createSettingSection('音量控制', [
                { type: 'slider', key: 'musicVolume', label: '背景音乐', min: 0, max: 100, value: 70 },
                { type: 'slider', key: 'sfxVolume', label: '音效', min: 0, max: 100, value: 80 },
                { type: 'slider', key: 'voiceVolume', label: '语音', min: 0, max: 100, value: 90 },
                { type: 'slider', key: 'ambientVolume', label: '环境音', min: 0, max: 100, value: 60 }
            ]);
            container.appendChild(volumeSection);
            
            // 音频设备
            const deviceSection = this._createSettingSection('音频设备', [
                { type: 'select', key: 'audioDevice', label: '输出设备', options: ['默认设备', '扬声器', '耳机', 'HDMI'] }
            ]);
            container.appendChild(deviceSection);
            
            return container;
        },
        
        _createKeyBindingsSettings: function() {
            const container = document.createElement('div');
            container.className = 'cst-settings-section';
            container.style.cssText = `
                max-width: 800px;
                margin: 0 auto;
            `;
            
            const title = document.createElement('div');
            title.textContent = '按键绑定';
            title.style.cssText = `
                font-family: 'Arial Black', sans-serif;
                font-size: 28px;
                color: #D4A017;
                margin-bottom: 30px;
                text-shadow: 0 0 10px rgba(212, 160, 23, 0.5);
            `;
            container.appendChild(title);
            
            // 移动控制
            const movementSection = this._createSettingSection('移动控制', [
                { type: 'keybind', key: 'moveForward', label: '前进', defaultKey: 'W' },
                { type: 'keybind', key: 'moveBackward', label: '后退', defaultKey: 'S' },
                { type: 'keybind', key: 'moveLeft', label: '左移', defaultKey: 'A' },
                { type: 'keybind', key: 'moveRight', label: '右移', defaultKey: 'D' },
                { type: 'keybind', key: 'crouch', label: '蹲下', defaultKey: 'Ctrl' },
                { type: 'keybind', key: 'jump', label: '跳跃', defaultKey: 'Space' }
            ]);
            container.appendChild(movementSection);
            
            // 战斗控制
            const combatSection = this._createSettingSection('战斗控制', [
                { type: 'keybind', key: 'fire', label: '射击', defaultKey: '鼠标左键' },
                { type: 'keybind', key: 'aim', label: '瞄准', defaultKey: '鼠标右键' },
                { type: 'keybind', key: 'reload', label: '换弹', defaultKey: 'R' },
                { type: 'keybind', key: 'grenade', label: '投掷物', defaultKey: 'G' },
                { type: 'keybind', key: 'knife', label: '近战武器', defaultKey: 'V' }
            ]);
            container.appendChild(combatSection);
            
            // 其他控制
            const miscSection = this._createSettingSection('其他控制', [
                { type: 'keybind', key: 'interact', label: '互动', defaultKey: 'E' },
                { type: 'keybind', key: 'buy', label: '购买菜单', defaultKey: 'B' },
                { type: 'keybind', key: 'scoreboard', label: '计分板', defaultKey: 'Tab' },
                { type: 'keybind', key: 'chat', label: '聊天', defaultKey: 'Y' }
            ]);
            container.appendChild(miscSection);
            
            // 重置按钮
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '重置为默认';
            resetBtn.className = 'cst-settings-btn';
            resetBtn.style.cssText = `
                margin-top: 20px;
                padding: 12px 24px;
                background: linear-gradient(135deg, #D4A017 0%, #B8860B 100%);
                border: none;
                border-radius: 8px;
                color: #000;
                font-family: 'Arial Black', sans-serif;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            resetBtn.addEventListener('mouseenter', () => {
                resetBtn.style.transform = 'scale(1.05)';
                resetBtn.style.boxShadow = '0 0 20px rgba(212, 160, 23, 0.6)';
            });
            resetBtn.addEventListener('mouseleave', () => {
                resetBtn.style.transform = 'scale(1)';
                resetBtn.style.boxShadow = 'none';
            });
            container.appendChild(resetBtn);
            
            return container;
        },
        
        _createSettingSection: function(title, settings) {
            const section = document.createElement('div');
            section.className = 'cst-setting-section';
            section.style.cssText = `
                margin-bottom: 30px;
                padding: 20px;
                background: rgba(20, 20, 20, 0.6);
                border-radius: 8px;
                border: 1px solid rgba(212, 160, 23, 0.2);
            `;
            
            const sectionTitle = document.createElement('div');
            sectionTitle.textContent = title;
            sectionTitle.style.cssText = `
                font-family: 'Arial Black', sans-serif;
                font-size: 18px;
                color: #D4A017;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid rgba(212, 160, 23, 0.3);
            `;
            section.appendChild(sectionTitle);
            
            const content = document.createElement('div');
            content.className = 'cst-setting-section-content';
            content.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 15px;
            `;
            
            settings.forEach(setting => {
                const row = document.createElement('div');
                row.className = 'cst-setting-row';
                row.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 0;
                `;
                
                const label = document.createElement('span');
                label.textContent = setting.label;
                label.style.cssText = `
                    font-family: 'Arial', sans-serif;
                    font-size: 14px;
                    color: #d7e0dd;
                `;
                row.appendChild(label);
                
                const control = this._createSettingControl(setting);
                if (control) {
                    row.appendChild(control);
                }
                
                content.appendChild(row);
            });
            
            section.appendChild(content);
            return section;
        },
        
        _createSettingControl: function(setting) {
            switch(setting.type) {
                case 'toggle':
                    const toggleContainer = document.createElement('div');
                    toggleContainer.style.cssText = `
                        display: flex;
                        gap: 10px;
                    `;
                    
                    const toggleOptions = setting.options || [];
                    const currentValue = setting.value || toggleOptions[0];
                    
                    toggleOptions.forEach((opt, index) => {
                        const btn = document.createElement('button');
                        btn.textContent = opt;
                        btn.className = 'cst-toggle-btn';
                        const isActive = opt === currentValue;
                        btn.style.cssText = `
                            padding: 8px 20px;
                            background: ${isActive ? 'linear-gradient(135deg, #D4A017 0%, #B8860B 100%)' : 'rgba(212, 160, 23, 0.1)'};
                            border: 1px solid ${isActive ? 'rgba(212, 160, 23, 0.8)' : 'rgba(212, 160, 23, 0.3)'};
                            border-radius: 4px;
                            color: ${isActive ? '#000' : '#D4A017'};
                            font-family: 'Arial', sans-serif;
                            font-size: 14px;
                            font-weight: bold;
                            cursor: pointer;
                            transition: all 0.2s ease;
                        `;
                        
                        btn.addEventListener('mouseenter', () => {
                            if (!isActive) {
                                btn.style.background = 'rgba(212, 160, 23, 0.2)';
                            } else {
                                btn.style.transform = 'scale(1.05)';
                            }
                        });
                        
                        btn.addEventListener('mouseleave', () => {
                            if (!isActive) {
                                btn.style.background = 'rgba(212, 160, 23, 0.1)';
                            } else {
                                btn.style.transform = 'scale(1)';
                            }
                        });
                        
                        btn.addEventListener('click', async () => {
                            // 更新所有按钮状态
                            const siblings = toggleContainer.querySelectorAll('.cst-toggle-btn');
                            siblings.forEach(sib => {
                                sib.style.background = 'rgba(212, 160, 23, 0.1)';
                                sib.style.borderColor = 'rgba(212, 160, 23, 0.3)';
                                sib.style.color = '#D4A017';
                                sib.style.transform = 'scale(1)';
                            });
                            
                            // 设置当前按钮为激活状态
                            btn.style.background = 'linear-gradient(135deg, #D4A017 0%, #B8860B 100%)';
                            btn.style.borderColor = 'rgba(212, 160, 23, 0.8)';
                            btn.style.color = '#000';
                            
                            // 保存设置（异步，确保保存到文件）
                            await this._saveSetting(setting.key, opt);
                            
                            // 如果是窗口模式切换，执行相应操作
                            if (setting.key === 'windowMode') {
                                await this._applyWindowMode(opt);
                            }
                            
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.info('CounterStrikeTest', `设置已更新：${setting.key} = ${opt}`);
                            }
                        });
                        
                        toggleContainer.appendChild(btn);
                    });
                    
                    return toggleContainer;
                    
                case 'slider':
                    const sliderContainer = document.createElement('div');
                    sliderContainer.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        width: 300px;
                    `;
                    
                    const slider = document.createElement('input');
                    slider.type = 'range';
                    slider.min = setting.min || 0;
                    slider.max = setting.max || 100;
                    slider.value = setting.value || 50;
                    slider.style.cssText = `
                        flex: 1;
                        height: 6px;
                        -webkit-appearance: none;
                        background: rgba(212, 160, 23, 0.3);
                        border-radius: 3px;
                        outline: none;
                    `;
                    
                    const value = document.createElement('span');
                    value.textContent = slider.value;
                    value.style.cssText = `
                        font-size: 14px;
                        color: #D4A017;
                        min-width: 30px;
                        text-align: right;
                    `;
                    
                    slider.addEventListener('input', () => {
                        value.textContent = slider.value;
                    });
                    
                    sliderContainer.appendChild(slider);
                    sliderContainer.appendChild(value);
                    return sliderContainer;
                    
                case 'select':
                    const select = document.createElement('select');
                    select.style.cssText = `
                        padding: 8px 12px;
                        background: rgba(20, 20, 20, 0.8);
                        border: 1px solid rgba(212, 160, 23, 0.3);
                        border-radius: 4px;
                        color: #d7e0dd;
                        font-size: 14px;
                        cursor: pointer;
                        min-width: 150px;
                    `;
                    
                    setting.options.forEach(opt => {
                        const option = document.createElement('option');
                        option.textContent = opt;
                        option.value = opt;
                        select.appendChild(option);
                    });
                    
                    return select;
                    
                case 'checkbox':
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = setting.checked || false;
                    checkbox.style.cssText = `
                        width: 18px;
                        height: 18px;
                        cursor: pointer;
                        accent-color: #D4A017;
                    `;
                    return checkbox;
                    
                case 'color':
                    const colorPicker = document.createElement('input');
                    colorPicker.type = 'color';
                    colorPicker.value = setting.value || '#00FF00';
                    colorPicker.style.cssText = `
                        width: 50px;
                        height: 30px;
                        border: none;
                        cursor: pointer;
                        background: transparent;
                    `;
                    return colorPicker;
                    
                case 'keybind':
                    const keybindBtn = document.createElement('button');
                    keybindBtn.textContent = setting.defaultKey;
                    keybindBtn.className = 'cst-keybind-btn';
                    keybindBtn.style.cssText = `
                        padding: 8px 16px;
                        background: rgba(212, 160, 23, 0.2);
                        border: 1px solid rgba(212, 160, 23, 0.5);
                        border-radius: 4px;
                        color: #D4A017;
                        font-family: 'Arial', sans-serif;
                        font-size: 14px;
                        font-weight: bold;
                        cursor: pointer;
                        min-width: 120px;
                        transition: all 0.2s ease;
                    `;
                    
                    keybindBtn.addEventListener('click', () => {
                        keybindBtn.textContent = '按下按键...';
                        keybindBtn.style.background = 'rgba(212, 160, 23, 0.4)';
                        
                        const handleKeyDown = (e) => {
                            keybindBtn.textContent = e.key.toUpperCase();
                            keybindBtn.style.background = 'rgba(212, 160, 23, 0.2)';
                            document.removeEventListener('keydown', handleKeyDown);
                        };
                        
                        setTimeout(() => {
                            document.addEventListener('keydown', handleKeyDown, { once: true });
                        }, 100);
                    });
                    
                    return keybindBtn;
                    
                default:
                    return null;
            }
        },
        
        _createTabContent: function(tabName) {
            if (tabName === '设置') {
                return this._createSettingsContent();
            }
            
            const container = document.createElement('div');
            container.className = `cst-${tabName}-content`;
            container.style.cssText = `
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                width: 100%;
                height: 100%;
            `;
            
            const text = document.createElement('div');
            text.className = 'cst-tab-text';
            text.textContent = tabName;
            text.style.cssText = `
                font-family: 'Arial Black', sans-serif;
                font-size: 48px;
                color: #D4A017;
                text-shadow: 0 0 20px rgba(212, 160, 23, 0.5);
            `;
            
            container.appendChild(text);
            
            return container;
        },
        
        _switchTab: function(tabName) {
            const buttons = this.navBar.querySelectorAll('.cst-nav-button');
            buttons.forEach(button => {
                if (button.dataset.tab === tabName) {
                    button.classList.add('active');
                    button.style.color = '#D4A017';
                    button.style.background = 'linear-gradient(180deg, rgba(212, 160, 23, 0.2) 0%, transparent 100%)';
                } else {
                    button.classList.remove('active');
                    button.style.color = '#888';
                    button.style.background = 'transparent';
                }
            });
            
            if (this.currentContent && this.currentContent.parentElement) {
                this.currentContent.parentElement.removeChild(this.currentContent);
            }
            
            let newContent;
            if (tabName === '主页') {
                newContent = this._createHomeContent();
            } else {
                newContent = this._createTabContent(tabName);
            }
            
            this.contentArea.appendChild(newContent);
            this.currentContent = newContent;
            this.currentTabName = tabName;
        },
        
        _loadThreeJS: async function() {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('CounterStrikeTest', '正在加载 three.js...');
            }
            
            try {
                this.THREE = await DynamicManager.loadModule('three.webgl');
                
                if (this.THREE) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('CounterStrikeTest', `three.js 加载成功`);
                    }
                } else {
                    throw new Error('three.js 加载失败');
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('CounterStrikeTest', `加载 three.js 失败: ${error.message}`, error);
                }
                throw error;
            }
        },
        
        _initThreeJS: function() {
            if (!this.THREE || !this.canvasContainer) {
                return;
            }
            
            const container = this.canvasContainer;
            const width = container.clientWidth || 800;
            const height = container.clientHeight || 600;
            
            this.scene = new this.THREE.Scene();
            this.scene.background = new this.THREE.Color(0x1a1a1a);
            
            this.camera = new this.THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
            this.camera.position.set(0, 2, 5);
            this.camera.lookAt(0, 0, 0);
            
            this.renderer = new this.THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(this.renderer.domElement);
            
            const ambientLight = new this.THREE.AmbientLight(0xffffff, 0.6);
            this.scene.add(ambientLight);
            
            const directionalLight = new this.THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(5, 10, 7);
            this.scene.add(directionalLight);
            
            this.gameState = 'ready';
            this._animate();
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('CounterStrikeTest', '3D 场景初始化完成');
            }
        },
        
        _animate: function() {
            if (this.gameState === 'loading') {
                return;
            }
            
            this.animationId = requestAnimationFrame(() => this._animate());
            
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        },
        
        _addEventHandler: function(element, event, handler, useCapture = false) {
            element.addEventListener(event, handler, useCapture);
            this._eventHandlers.push({ element, event, handler, useCapture });
        },
        
        __exit__: async function() {
            try {
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }
                
                if (this.renderer) {
                    this.renderer.dispose();
                    if (this.renderer.domElement && this.renderer.domElement.parentElement) {
                        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
                    }
                    this.renderer = null;
                }
                
                if (this._eventHandlers && Array.isArray(this._eventHandlers)) {
                    this._eventHandlers.forEach(({ element, event, handler, useCapture }) => {
                        if (element && typeof element.removeEventListener === 'function') {
                            element.removeEventListener(event, handler, useCapture || false);
                        }
                    });
                    this._eventHandlers = null;
                }
                
                if (typeof GUIManager !== 'undefined') {
                    if (this.windowId) {
                        GUIManager.unregisterWindow(this.windowId);
                    } else if (this.pid) {
                        GUIManager.unregisterWindow(this.pid);
                    }
                }
                
                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                
                this.THREE = null;
                this.scene = null;
                this.camera = null;
                this.window = null;
                this.windowId = null;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('CounterStrikeTest', '清理失败', error);
                }
            }
        },
        
        __info__: function() {
            return {
                name: 'counterstriketest',
                type: 'GUI',
                version: '1.0.0',
                description: 'Counter-Strike Test 3D',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        }
    };
    
    if (typeof window !== 'undefined') {
        window.COUNTERSTRIKETEST = COUNTERSTRIKETEST;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.COUNTERSTRIKETEST = COUNTERSTRIKETEST;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);
