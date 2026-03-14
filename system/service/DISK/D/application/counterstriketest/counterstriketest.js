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
                justify-content: center;
                align-items: center;
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
        
        _createTabContent: function(tabName) {
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
                    PermissionManager.PERMISSION.EVENT_LISTENER
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
