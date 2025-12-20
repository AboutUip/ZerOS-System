// ZerOS 愤怒的小鸟游戏
// 使用PixiJS实现，1:1还原愤怒的小鸟玩法

(function(window) {
    'use strict';
    
    const ANGRYBIRDS = {
        pid: null,
        window: null,
        app: null,
        stage: null,
        
        // 游戏状态
        currentLevel: 1,
        maxLevel: 20,
        score: 0,
        birds: [],
        currentBirdIndex: 0,
        pigs: [],
        blocks: [],
        gameState: 'menu', // menu, playing, paused, gameover, levelComplete
        
        // 物理引擎
        gravity: 0.5,
        friction: 0.98,
        
        // 弹弓
        slingshot: { x: 0, y: 0 }, // 将在创建场景时计算
        slingshotBand: null,
        slingshotGraphics: null, // 弹弓图形对象
        birdInSlingshot: null,
        isDragging: false,
        dragStart: null,
        
        // 小鸟类型
        birdTypes: {
            red: { color: 0xFF6B6B, radius: 15, special: null },
            blue: { color: 0x4ECDC4, radius: 12, special: 'split' },
            yellow: { color: 0xFFE66D, radius: 14, special: 'speed' },
            black: { color: 0x2C3E50, radius: 16, special: 'bomb' },
            white: { color: 0xECF0F1, radius: 13, special: 'egg' }
        },
        
        // 关卡数据
        levels: [],
        
        // 纹理缓存
        textures: {},
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'angrybirds-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            
            if (typeof GUIManager === 'undefined') {
                this.window.style.cssText = `
                    width: 900px;
                    height: 600px;
                    display: flex;
                    flex-direction: column;
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
                    icon = ApplicationAssetManager.getIcon('angrybirds');
                }
                
                // 设置窗口默认尺寸
                this.window.style.width = '900px';
                this.window.style.height = '600px';
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '愤怒的小鸟',
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
            
            // 创建游戏界面
            this._createGameUI();
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 加载PixiJS
            await this._loadPixiJS();
            
            // 初始化游戏
            this._initGame();
            
            // 如果使用GUIManager，窗口已自动居中并获得焦点
            if (typeof GUIManager !== 'undefined') {
                GUIManager.focusWindow(pid);
            }
        },
        
        /**
         * 加载PixiJS库
         */
        _loadPixiJS: async function() {
            if (typeof PIXI !== 'undefined') {
                return;
            }
            
            if (typeof DynamicManager !== 'undefined') {
                try {
                    await DynamicManager.loadModule('pixi.js');
                } catch (e) {
                    console.error('加载PixiJS失败:', e);
                    throw new Error('无法加载PixiJS库');
                }
            } else {
                throw new Error('DynamicManager不可用');
            }
        },
        
        /**
         * 创建游戏UI
         */
        _createGameUI: function() {
            // 创建容器
            const container = document.createElement('div');
            container.className = 'angrybirds-container';
            this.window.appendChild(container);
            
            // 创建UI栏
            const uiBar = document.createElement('div');
            uiBar.className = 'angrybirds-ui';
            
            // 关卡显示
            const levelContainer = document.createElement('div');
            levelContainer.className = 'angrybirds-ui-item';
            levelContainer.innerHTML = `
                <span class="angrybirds-ui-label">关卡</span>
                <span class="angrybirds-ui-value" id="level-display">1</span>
            `;
            uiBar.appendChild(levelContainer);
            
            // 分数显示
            const scoreContainer = document.createElement('div');
            scoreContainer.className = 'angrybirds-ui-item';
            scoreContainer.innerHTML = `
                <span class="angrybirds-ui-label">分数</span>
                <span class="angrybirds-ui-value" id="score-display">0</span>
            `;
            uiBar.appendChild(scoreContainer);
            
            // 小鸟数量显示
            const birdsContainer = document.createElement('div');
            birdsContainer.className = 'angrybirds-ui-item';
            birdsContainer.innerHTML = `
                <span class="angrybirds-ui-label">剩余</span>
                <span class="angrybirds-ui-value" id="birds-display">0</span>
            `;
            uiBar.appendChild(birdsContainer);
            
            container.appendChild(uiBar);
            
            // 创建游戏区域
            const gameArea = document.createElement('div');
            gameArea.className = 'angrybirds-game-area';
            gameArea.id = 'angrybirds-game-area';
            container.appendChild(gameArea);
            
            // 创建关卡选择器
            this._createLevelSelector();
            
            // 创建游戏结束界面
            this._createGameOverUI();
        },
        
        /**
         * 创建关卡选择器
         */
        _createLevelSelector: function() {
            const selector = document.createElement('div');
            selector.className = 'angrybirds-level-selector';
            selector.id = 'level-selector';
            
            const title = document.createElement('div');
            title.className = 'angrybirds-level-title';
            title.textContent = '选择关卡';
            selector.appendChild(title);
            
            const grid = document.createElement('div');
            grid.className = 'angrybirds-level-grid';
            
            for (let i = 1; i <= this.maxLevel; i++) {
                const btn = document.createElement('button');
                btn.className = 'angrybirds-level-btn';
                btn.textContent = i;
                btn.dataset.level = i;
                
                if (i === 1) {
                    btn.classList.add('completed');
                } else {
                    btn.classList.add('locked');
                }
                
                // 使用 EventManager 注册事件
                if (typeof EventManager !== 'undefined' && this.pid) {
                    const btnId = `angrybirds-level-btn-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    btn.dataset.eventId = btnId;
                    EventManager.registerEventHandler(this.pid, 'click', () => {
                        if (!btn.classList.contains('locked')) {
                            this.currentLevel = i;
                            this._startLevel(i);
                        }
                    }, {
                        priority: 100,
                        selector: `[data-event-id="${btnId}"]`
                    });
                } else {
                    // 降级方案
                    btn.addEventListener('click', () => {
                        if (!btn.classList.contains('locked')) {
                            this.currentLevel = i;
                            this._startLevel(i);
                        }
                    });
                }
                
                grid.appendChild(btn);
            }
            
            selector.appendChild(grid);
            this.window.appendChild(selector);
        },
        
        /**
         * 创建游戏结束界面
         */
        _createGameOverUI: function() {
            const gameOver = document.createElement('div');
            gameOver.className = 'angrybirds-game-over';
            gameOver.id = 'game-over';
            
            const title = document.createElement('div');
            title.className = 'angrybirds-game-over-title';
            title.id = 'game-over-title';
            gameOver.appendChild(title);
            
            const message = document.createElement('div');
            message.className = 'angrybirds-game-over-message';
            message.id = 'game-over-message';
            gameOver.appendChild(message);
            
            const buttons = document.createElement('div');
            buttons.className = 'angrybirds-game-over-buttons';
            
            const retryBtn = document.createElement('button');
            retryBtn.className = 'angrybirds-btn primary';
            retryBtn.textContent = '重试';
            // 使用 EventManager 注册事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                const retryBtnId = `angrybirds-retry-btn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                retryBtn.dataset.eventId = retryBtnId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    this._startLevel(this.currentLevel);
                }, {
                    priority: 100,
                    selector: `[data-event-id="${retryBtnId}"]`
                });
            } else {
                // 降级方案
                retryBtn.addEventListener('click', () => {
                    this._startLevel(this.currentLevel);
                });
            }
            buttons.appendChild(retryBtn);
            
            const nextBtn = document.createElement('button');
            nextBtn.className = 'angrybirds-btn';
            nextBtn.textContent = '下一关';
            nextBtn.id = 'next-level-btn';
            nextBtn.style.display = 'none';
            if (typeof EventManager !== 'undefined' && this.pid) {
                const nextBtnId = `angrybirds-next-btn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                nextBtn.dataset.eventId = nextBtnId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    if (this.currentLevel < this.maxLevel) {
                        this.currentLevel++;
                        this._startLevel(this.currentLevel);
                    }
                }, {
                    priority: 100,
                    selector: `[data-event-id="${nextBtnId}"]`
                });
            } else {
                // 降级方案
                nextBtn.addEventListener('click', () => {
                    if (this.currentLevel < this.maxLevel) {
                        this.currentLevel++;
                        this._startLevel(this.currentLevel);
                    }
                });
            }
            buttons.appendChild(nextBtn);
            
            const menuBtn = document.createElement('button');
            menuBtn.className = 'angrybirds-btn';
            menuBtn.textContent = '返回菜单';
            if (typeof EventManager !== 'undefined' && this.pid) {
                const menuBtnId = `angrybirds-menu-btn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                menuBtn.dataset.eventId = menuBtnId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    this._showLevelSelector();
                }, {
                    priority: 100,
                    selector: `[data-event-id="${menuBtnId}"]`
                });
            } else {
                // 降级方案
                menuBtn.addEventListener('click', () => {
                    this._showLevelSelector();
                });
            }
            buttons.appendChild(menuBtn);
            
            gameOver.appendChild(buttons);
            this.window.appendChild(gameOver);
        },
        
        /**
         * 初始化游戏
         */
        _initGame: function() {
            // 初始化关卡数据
            this._initLevels();
            
            // 显示关卡选择器
            this._showLevelSelector();
        },
        
        /**
         * 初始化关卡数据
         */
        _initLevels: function() {
            this.levels = [];
            
            for (let i = 1; i <= this.maxLevel; i++) {
                const level = {
                    pigs: [],
                    blocks: [],
                    birds: []
                };
                
                // 根据关卡编号生成不同的布局
                const pigCount = Math.min(3 + Math.floor(i / 3), 8);
                const blockCount = Math.min(5 + Math.floor(i / 2), 15);
                
                // 生成猪
                for (let j = 0; j < pigCount; j++) {
                    level.pigs.push({
                        x: 600 + (j % 4) * 80,
                        y: 300 + Math.floor(j / 4) * 60,
                        radius: 20,
                        health: 1
                    });
                }
                
                // 生成方块
                for (let j = 0; j < blockCount; j++) {
                    level.blocks.push({
                        x: 550 + (j % 5) * 60,
                        y: 200 + Math.floor(j / 5) * 50,
                        width: 40,
                        height: 40,
                        health: 1
                    });
                }
                
                // 生成小鸟（每关3-5只）
                const birdCount = 3 + Math.floor(i / 5);
                const birdTypes = ['red', 'blue', 'yellow', 'black', 'white'];
                for (let j = 0; j < birdCount; j++) {
                    level.birds.push(birdTypes[j % birdTypes.length]);
                }
                
                this.levels.push(level);
            }
        },
        
        /**
         * 显示关卡选择器
         */
        _showLevelSelector: function() {
            const selector = document.getElementById('level-selector');
            if (selector) {
                selector.classList.add('show');
            }
            
            const gameOver = document.getElementById('game-over');
            if (gameOver) {
                gameOver.classList.remove('show');
            }
            
            if (this.app) {
                this.app.destroy(true, { children: true, texture: true });
                this.app = null;
            }
            
            this.gameState = 'menu';
        },
        
        /**
         * 开始关卡
         */
        _startLevel: async function(levelNum) {
            this.currentLevel = levelNum;
            this.gameState = 'playing';
            this.score = 0;
            this.currentBirdIndex = 0;
            
            // 隐藏关卡选择器和游戏结束界面
            const selector = document.getElementById('level-selector');
            if (selector) {
                selector.classList.remove('show');
            }
            
            const gameOver = document.getElementById('game-over');
            if (gameOver) {
                gameOver.classList.remove('show');
            }
            
            // 创建PixiJS应用
            await this._createPixiApp();
            
            // 加载SVG纹理（需要在app创建后）
            await this._loadTextures();
            
            // 加载关卡数据
            const level = this.levels[levelNum - 1];
            
            // 先创建游戏场景（这样弹弓位置会被计算）
            // 注意：这里先创建场景是为了获取弹弓位置，但小鸟会在_createBirdQueue中设置
            // 临时设置弹弓位置
            this.slingshot.x = 150;
            this.slingshot.y = this.app.screen.height - 150;
            
            this.birds = level.birds.map((type, index) => ({
                type: type,
                x: this.slingshot.x, // 初始位置在弹弓上
                y: this.slingshot.y,
                vx: 0,
                vy: 0,
                active: false,
                used: false
            }));
            
            this.pigs = level.pigs.map(pig => ({ ...pig, active: true }));
            this.blocks = level.blocks.map(block => ({ ...block, active: true }));
            
            // 创建游戏场景
            this._createGameScene();
            
            // 更新UI
            this._updateUI();
        },
        
        /**
         * 加载SVG纹理
         */
        _loadTextures: async function() {
            if (Object.keys(this.textures).length > 0) {
                return; // 已经加载过
            }
            
            // 定义纹理路径（使用虚拟路径格式）
            const texturePaths = {
                'bird-red': 'D:/application/angrybirds/assets/bird-red.svg',
                'bird-blue': 'D:/application/angrybirds/assets/bird-blue.svg',
                'bird-yellow': 'D:/application/angrybirds/assets/bird-yellow.svg',
                'bird-black': 'D:/application/angrybirds/assets/bird-black.svg',
                'bird-white': 'D:/application/angrybirds/assets/bird-white.svg',
                'pig': 'D:/application/angrybirds/assets/pig.svg',
                'block-wood': 'D:/application/angrybirds/assets/block-wood.svg',
                'block-stone': 'D:/application/angrybirds/assets/block-stone.svg',
                'slingshot': 'D:/application/angrybirds/assets/slingshot.svg',
                'ground': 'D:/application/angrybirds/assets/ground.svg',
                'egg': 'D:/application/angrybirds/assets/egg.svg',
                'explosion': 'D:/application/angrybirds/assets/explosion.svg'
            };
            
            // 转换路径为实际URL
            const convertPathToUrl = (path) => {
                if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
                    return path;
                } else if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
                    return ProcessManager.convertVirtualPathToUrl(path);
                } else if (path.startsWith('D:/') || path.startsWith('C:/')) {
                    const relativePath = path.substring(3);
                    const disk = path.startsWith('D:/') ? 'D' : 'C';
                    return `/system/service/DISK/${disk}/${relativePath}`;
                } else if (path.startsWith('/')) {
                    return path;
                } else {
                    // 相对路径，尝试添加 /service/DISK/D/ 前缀
                    return `/service/DISK/D/${path}`;
                }
            };
            
            try {
                // PixiJS v8 使用 Assets.load
                if (PIXI.Assets && typeof PIXI.Assets.load === 'function') {
                    for (const [key, path] of Object.entries(texturePaths)) {
                        try {
                            const url = convertPathToUrl(path);
                            this.textures[key] = await PIXI.Assets.load(url);
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ANGRYBIRDS', `加载纹理失败 ${key}: ${path}`, e);
                            } else {
                                console.warn(`加载纹理失败 ${key}: ${path}`, e);
                            }
                            // 如果加载失败，创建一个占位纹理
                            const graphics = new PIXI.Graphics();
                            graphics.beginFill(0xFF0000);
                            graphics.drawRect(0, 0, 48, 48);
                            graphics.endFill();
                            this.textures[key] = this.app.renderer.generateTexture(graphics);
                        }
                    }
                } else {
                    // 降级方案：使用 Texture.from (同步加载)
                    for (const [key, path] of Object.entries(texturePaths)) {
                        try {
                            const url = convertPathToUrl(path);
                            this.textures[key] = PIXI.Texture.from(url);
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ANGRYBIRDS', `加载纹理失败 ${key}: ${path}`, e);
                            } else {
                                console.warn(`加载纹理失败 ${key}: ${path}`, e);
                            }
                            // 如果加载失败，创建一个占位纹理
                            const graphics = new PIXI.Graphics();
                            graphics.beginFill(0xFF0000);
                            graphics.drawRect(0, 0, 48, 48);
                            graphics.endFill();
                            this.textures[key] = this.app.renderer.generateTexture(graphics);
                        }
                    }
                }
            } catch (error) {
                console.error('加载纹理时出错:', error);
            }
        },
        
        /**
         * 创建PixiJS应用
         */
        _createPixiApp: async function() {
            const gameArea = document.getElementById('angrybirds-game-area');
            if (!gameArea) {
                throw new Error('游戏区域不存在');
            }
            
            // 销毁旧应用
            if (this.app) {
                this.app.destroy(true, { children: true, texture: true });
            }
            
            // 等待DOM更新，确保游戏区域有正确的尺寸
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(resolve);
                });
            });
            
            // 获取游戏区域尺寸，如果为0则使用默认值
            let width = gameArea.clientWidth;
            let height = gameArea.clientHeight;
            
            if (width === 0 || height === 0) {
                // 如果尺寸为0，使用默认值或从窗口计算
                const windowRect = this.window.getBoundingClientRect();
                if (windowRect.width > 0 && windowRect.height > 0) {
                    // 减去UI栏的高度（约50px）
                    width = windowRect.width || 900;
                    height = (windowRect.height || 600) - 50;
                } else {
                    width = 900;
                    height = 550;
                }
            }
            
            // 创建新应用
            // PixiJS v8.14.3: 需要先创建实例，然后调用 init() 方法
            try {
                // 检查 PIXI 是否可用
                if (typeof PIXI === 'undefined' || !PIXI.Application) {
                    throw new Error('PIXI 对象未定义或 Application 不可用');
                }
                
                // 创建应用配置（PixiJS v8 格式）
                const appOptions = {
                    width: width,
                    height: height,
                    backgroundColor: 0x87CEEB,
                    antialias: true,
                    resolution: window.devicePixelRatio || 1,
                    autoDensity: true
                };
                
                // PixiJS v8: 创建实例后需要调用 init() 方法
                this.app = new PIXI.Application();
                
                // 异步初始化（v8 必需）
                if (this.app.init && typeof this.app.init === 'function') {
                    await this.app.init(appOptions);
                } else {
                    // 如果没有 init 方法，可能是旧版本，尝试直接创建
                    this.app = new PIXI.Application(appOptions);
                    // 如果返回 Promise，等待它
                    if (this.app && typeof this.app.then === 'function') {
                        this.app = await this.app;
                    }
                }
                
                // 确保 app 已创建
                if (!this.app) {
                    throw new Error('PIXI.Application 创建失败：返回值为空');
                }
                
                // PixiJS v8 使用 canvas 属性（v7 及以下使用 view）
                const canvasElement = this.app.canvas || this.app.view;
                
                if (!canvasElement) {
                    throw new Error('PIXI.Application canvas/view 未创建');
                }
                
                // 添加到DOM
                gameArea.appendChild(canvasElement);
            } catch (error) {
                console.error('创建 PixiJS 应用失败:', error);
                throw error;
            }
            
            this.stage = this.app.stage;
            
            // 保存resize处理函数以便清理
            this._resizeHandler = () => {
                if (this.app && gameArea) {
                    const newWidth = gameArea.clientWidth || width;
                    const newHeight = gameArea.clientHeight || height;
                    if (newWidth > 0 && newHeight > 0) {
                        this.app.renderer.resize(newWidth, newHeight);
                    }
                }
            };
            
            // 监听窗口大小变化（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                this._resizeHandlerId = EventManager.registerEventHandler(this.pid, 'resize', this._resizeHandler, {
                    priority: 100,
                    selector: null  // 监听 window 的 resize 事件
                });
            } else {
                // 降级：直接使用 addEventListener（不推荐）
                window.addEventListener('resize', this._resizeHandler);
            }
        },
        
        /**
         * 创建游戏场景
         */
        _createGameScene: function() {
            // 清空场景
            this.stage.removeChildren();
            
            // 计算弹弓位置（左下角）
            this.slingshot.x = 150;
            this.slingshot.y = this.app.screen.height - 150;
            
            // 创建背景
            const bg = new PIXI.Graphics();
            bg.beginFill(0x87CEEB);
            bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
            bg.endFill();
            this.stage.addChild(bg);
            
            // 创建地面
            const ground = new PIXI.Graphics();
            ground.beginFill(0x8B7355);
            ground.drawRect(0, this.app.screen.height - 50, this.app.screen.width, 50);
            ground.endFill();
            this.stage.addChild(ground);
            
            // 创建弹弓
            this._createSlingshot();
            
            // 创建小鸟队列
            this._createBirdQueue();
            
            // 创建猪和方块
            this._createPigs();
            this._createBlocks();
            
            // 设置交互
            this._setupInteraction();
            
            // 开始游戏循环（确保只添加一次）
            if (this.app && this.app.ticker) {
                this.app.ticker.remove(this._gameLoop, this); // 先移除，避免重复添加
                this.app.ticker.add(this._gameLoop, this);
            }
        },
        
        /**
         * 创建弹弓
         */
        _createSlingshot: function() {
            // 移除旧的弹弓图形
            if (this.slingshotGraphics && this.slingshotGraphics.parent) {
                this.stage.removeChild(this.slingshotGraphics);
            }
            
            const sx = this.slingshot.x;
            const sy = this.slingshot.y;
            
            // 使用SVG纹理创建弹弓
            if (this.textures['slingshot']) {
                this.slingshotGraphics = new PIXI.Sprite(this.textures['slingshot']);
                this.slingshotGraphics.anchor.set(0.5, 1); // 底部中心对齐
                this.slingshotGraphics.x = sx;
                this.slingshotGraphics.y = this.app.screen.height - 50;
                this.slingshotGraphics.scale.set(1.5, 1.5); // 放大一点
            } else {
                // 降级方案：使用Graphics绘制
                this.slingshotGraphics = new PIXI.Graphics();
                this.slingshotGraphics.lineStyle(5, 0x654321);
                
                const baseY = this.app.screen.height - 50; // 地面位置
                
                // 左支架（Y形）
                this.slingshotGraphics.moveTo(sx - 20, sy);
                this.slingshotGraphics.lineTo(sx - 20, baseY);
                this.slingshotGraphics.moveTo(sx - 20, sy);
                this.slingshotGraphics.lineTo(sx - 30, sy - 15);
                
                // 右支架（Y形）
                this.slingshotGraphics.moveTo(sx + 20, sy);
                this.slingshotGraphics.lineTo(sx + 20, baseY);
                this.slingshotGraphics.moveTo(sx + 20, sy);
                this.slingshotGraphics.lineTo(sx + 30, sy - 15);
                
                // 弹弓底座
                this.slingshotGraphics.lineStyle(6, 0x5D4037);
                this.slingshotGraphics.moveTo(sx - 25, baseY);
                this.slingshotGraphics.lineTo(sx + 25, baseY);
            }
            
            this.stage.addChild(this.slingshotGraphics);
            
            // 弹弓带（动态，用于显示小鸟位置）
            if (!this.slingshotBand) {
                this.slingshotBand = new PIXI.Graphics();
                this.stage.addChild(this.slingshotBand);
            } else {
                this.slingshotBand.clear();
            }
        },
        
        /**
         * 创建小鸟队列
         */
        _createBirdQueue: function() {
            this.birdSprites = [];
            
            for (let i = 0; i < this.birds.length; i++) {
                const bird = this.birds[i];
                const birdType = this.birdTypes[bird.type];
                
                // 使用SVG纹理创建小鸟
                const textureKey = `bird-${bird.type}`;
                let sprite;
                
                if (this.textures[textureKey]) {
                    sprite = new PIXI.Sprite(this.textures[textureKey]);
                    sprite.anchor.set(0.5, 0.5); // 中心对齐
                    // 根据小鸟类型调整大小
                    const scale = (birdType.radius * 2) / 48; // 48是SVG的viewBox大小
                    sprite.scale.set(scale, scale);
                } else {
                    // 降级方案：使用Graphics绘制
                    sprite = new PIXI.Graphics();
                    sprite.beginFill(birdType.color);
                    sprite.drawCircle(0, 0, birdType.radius);
                    sprite.endFill();
                }
                
                sprite.x = bird.x;
                sprite.y = bird.y;
                sprite.visible = i === 0;
                
                sprite.interactive = true;
                sprite.buttonMode = true;
                
                this.birdSprites.push(sprite);
                this.stage.addChild(sprite);
            }
        },
        
        /**
         * 创建猪
         */
        _createPigs: function() {
            this.pigSprites = [];
            
            for (let i = 0; i < this.pigs.length; i++) {
                const pig = this.pigs[i];
                
                // 使用SVG纹理创建猪
                let sprite;
                
                if (this.textures['pig']) {
                    sprite = new PIXI.Sprite(this.textures['pig']);
                    sprite.anchor.set(0.5, 0.5); // 中心对齐
                    // 根据猪的半径调整大小
                    const scale = (pig.radius * 2) / 48; // 48是SVG的viewBox大小
                    sprite.scale.set(scale, scale);
                } else {
                    // 降级方案：使用Graphics绘制
                    sprite = new PIXI.Graphics();
                    sprite.beginFill(0x90EE90);
                    sprite.drawCircle(0, 0, pig.radius);
                    sprite.endFill();
                    
                    // 眼睛
                    sprite.beginFill(0x000000);
                    sprite.drawCircle(-5, -5, 3);
                    sprite.drawCircle(5, -5, 3);
                    sprite.endFill();
                }
                
                sprite.x = pig.x;
                sprite.y = pig.y;
                sprite.pigData = pig;
                
                this.pigSprites.push(sprite);
                this.stage.addChild(sprite);
            }
        },
        
        /**
         * 创建方块
         */
        _createBlocks: function() {
            this.blockSprites = [];
            
            for (let i = 0; i < this.blocks.length; i++) {
                const block = this.blocks[i];
                
                // 使用SVG纹理创建方块
                let sprite;
                const textureKey = block.type === 'stone' ? 'block-stone' : 'block-wood';
                
                if (this.textures[textureKey]) {
                    sprite = new PIXI.Sprite(this.textures[textureKey]);
                    sprite.anchor.set(0.5, 0.5); // 中心对齐
                    // 根据方块尺寸调整大小
                    const scaleX = block.width / 48; // 48是SVG的viewBox宽度
                    const scaleY = block.height / 48; // 48是SVG的viewBox高度
                    sprite.scale.set(scaleX, scaleY);
                } else {
                    // 降级方案：使用Graphics绘制
                    sprite = new PIXI.Graphics();
                    sprite.beginFill(block.type === 'stone' ? 0x757575 : 0x8B4513);
                    sprite.drawRect(-block.width / 2, -block.height / 2, block.width, block.height);
                    sprite.endFill();
                }
                
                sprite.x = block.x;
                sprite.y = block.y;
                sprite.blockData = block;
                
                this.blockSprites.push(sprite);
                this.stage.addChild(sprite);
            }
        },
        
        /**
         * 设置交互
         */
        _setupInteraction: function() {
            this.app.stage.interactive = true;
            
            this.app.stage.on('pointerdown', (e) => {
                if (this.gameState !== 'playing') return;
                if (this.currentBirdIndex >= this.birds.length) return;
                if (this.birds[this.currentBirdIndex].active) return;
                
                const pos = e.data.getLocalPosition(this.app.stage);
                const bird = this.birds[this.currentBirdIndex];
                const birdSprite = this.birdSprites[this.currentBirdIndex];
                
                // 检查是否点击在小鸟上
                const dx = pos.x - birdSprite.x;
                const dy = pos.y - birdSprite.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < this.birdTypes[bird.type].radius + 10) {
                    this.isDragging = true;
                    this.dragStart = { x: pos.x, y: pos.y };
                    this.birdInSlingshot = this.currentBirdIndex;
                }
            });
            
            this.app.stage.on('pointermove', (e) => {
                if (!this.isDragging || this.birdInSlingshot === null) return;
                
                const pos = e.data.getLocalPosition(this.app.stage);
                const bird = this.birds[this.birdInSlingshot];
                const birdSprite = this.birdSprites[this.birdInSlingshot];
                
                // 限制拖拽距离（增加最大拖拽距离）
                const dx = pos.x - this.slingshot.x;
                const dy = pos.y - this.slingshot.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = 150; // 从100增加到150
                
                if (dist > maxDist) {
                    const angle = Math.atan2(dy, dx);
                    birdSprite.x = this.slingshot.x + Math.cos(angle) * maxDist;
                    birdSprite.y = this.slingshot.y + Math.sin(angle) * maxDist;
                } else {
                    birdSprite.x = pos.x;
                    birdSprite.y = pos.y;
                }
                
                this._updateSlingshotBand();
            });
            
            this.app.stage.on('pointerup', (e) => {
                if (!this.isDragging || this.birdInSlingshot === null) return;
                
                this.isDragging = false;
                
                const bird = this.birds[this.birdInSlingshot];
                const birdSprite = this.birdSprites[this.birdInSlingshot];
                
                // 计算发射速度（增加力度）
                const dx = this.slingshot.x - birdSprite.x;
                const dy = this.slingshot.y - birdSprite.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                // 增加力度：最大力度从15增加到30，最大拖拽距离从100增加到150
                const maxDist = 150;
                const maxPower = 30;
                const power = Math.min(dist / maxDist, 1) * maxPower;
                
                bird.vx = (dx / dist) * power;
                bird.vy = (dy / dist) * power;
                bird.active = true;
                bird.used = true;
                
                // 更新小鸟位置数据
                bird.x = birdSprite.x;
                bird.y = birdSprite.y;
                
                // 保存当前小鸟索引
                const currentBirdIndex = this.birdInSlingshot;
                
                // 激活小鸟
                this._activateBird(currentBirdIndex);
                
                this.birdInSlingshot = null;
                this.slingshotBand.clear();
                
                // 等待小鸟停止或飞出屏幕后再准备下一只小鸟
                this._waitForBirdStop(currentBirdIndex);
            });
        },
        
        /**
         * 更新弹弓带
         */
                _updateSlingshotBand: function() {
                    if (this.birdInSlingshot === null) {
                        this.slingshotBand.clear();
                        return;
                    }
                    
                    const birdSprite = this.birdSprites[this.birdInSlingshot];
                    
                    this.slingshotBand.clear();
                    this.slingshotBand.lineStyle(3, 0x654321);
                    
                    // 左带
                    this.slingshotBand.moveTo(this.slingshot.x - 20, this.slingshot.y);
                    this.slingshotBand.lineTo(birdSprite.x, birdSprite.y);
                    
                    // 右带
                    this.slingshotBand.moveTo(this.slingshot.x + 20, this.slingshot.y);
                    this.slingshotBand.lineTo(birdSprite.x, birdSprite.y);
                },
                
                /**
                 * 激活小鸟
                 */
                _activateBird: function(index) {
                    const bird = this.birds[index];
                    const birdSprite = this.birdSprites[index];
                    
                    bird.active = true;
                    birdSprite.visible = true;
                    
                    // 根据小鸟类型执行特殊能力
                    const birdType = this.birdTypes[bird.type];
                    if (birdType.special) {
                        setTimeout(() => {
                            this._useBirdSpecial(index, birdType.special);
                        }, 500);
                    }
                },
                
                /**
                 * 使用小鸟特殊能力
                 */
                _useBirdSpecial: function(index, special) {
                    const bird = this.birds[index];
                    const birdSprite = this.birdSprites[index];
                    
                    if (!bird.active) return;
                    
                    switch (special) {
                        case 'split':
                            // 蓝色小鸟：分裂成三只
                            this._splitBird(index);
                            break;
                        case 'speed':
                            // 黄色小鸟：加速
                            bird.vx *= 1.5;
                            bird.vy *= 1.5;
                            break;
                        case 'bomb':
                            // 黑色小鸟：爆炸
                            this._explodeBird(index);
                            break;
                        case 'egg':
                            // 白色小鸟：下蛋
                            this._dropEgg(index);
                            break;
                    }
                },
                
                /**
                 * 分裂小鸟（蓝色）
                 */
                _splitBird: function(index) {
                    const bird = this.birds[index];
                    const birdSprite = this.birdSprites[index];
                    
                    // 创建三只小鸟
                    for (let i = 0; i < 3; i++) {
                        const angle = (i - 1) * 0.3;
                        const newBird = {
                            type: 'blue',
                            x: birdSprite.x,
                            y: birdSprite.y,
                            vx: bird.vx + Math.cos(angle) * 5,
                            vy: bird.vy + Math.sin(angle) * 5,
                            active: true,
                            used: true
                        };
                        
                        const newSprite = new PIXI.Graphics();
                        newSprite.beginFill(0x4ECDC4);
                        newSprite.drawCircle(0, 0, 12);
                        newSprite.endFill();
                        newSprite.x = newBird.x;
                        newSprite.y = newBird.y;
                        
                        this.birds.push(newBird);
                        this.birdSprites.push(newSprite);
                        this.stage.addChild(newSprite);
                    }
                    
                    // 隐藏原小鸟
                    birdSprite.visible = false;
                    bird.active = false;
                },
                
                /**
                 * 爆炸小鸟（黑色）
                 */
                _explodeBird: function(index) {
                    const bird = this.birds[index];
                    const birdSprite = this.birdSprites[index];
                    
                    // 创建爆炸效果
                    const explosion = new PIXI.Graphics();
                    explosion.beginFill(0xFF4500);
                    explosion.drawCircle(0, 0, 50);
                    explosion.endFill();
                    explosion.x = birdSprite.x;
                    explosion.y = birdSprite.y;
                    explosion.alpha = 0.8;
                    this.stage.addChild(explosion);
                    
                    // 对周围物体造成伤害
                    const explosionRadius = 80;
                    this._damageInRadius(birdSprite.x, birdSprite.y, explosionRadius, 3);
                    
                    // 动画移除
                    this.app.ticker.addOnce(() => {
                        explosion.alpha -= 0.1;
                        if (explosion.alpha <= 0) {
                            this.stage.removeChild(explosion);
                        }
                    });
                    
                    // 隐藏小鸟
                    birdSprite.visible = false;
                    bird.active = false;
                },
                
                /**
                 * 下蛋（白色）
                 */
                _dropEgg: function(index) {
                    const bird = this.birds[index];
                    const birdSprite = this.birdSprites[index];
                    
                    // 创建蛋
                    const egg = {
                        x: birdSprite.x,
                        y: birdSprite.y,
                        vx: bird.vx * 0.5,
                        vy: bird.vy * 0.5,
                        active: true
                    };
                    
                    const eggSprite = new PIXI.Graphics();
                    eggSprite.beginFill(0xFFFFFF);
                    eggSprite.drawEllipse(0, 0, 8, 10);
                    eggSprite.endFill();
                    eggSprite.x = egg.x;
                    eggSprite.y = egg.y;
                    
                    this.eggs = this.eggs || [];
                    this.eggSprites = this.eggSprites || [];
                    this.eggs.push(egg);
                    this.eggSprites.push(eggSprite);
                    this.stage.addChild(eggSprite);
                    
                    // 小鸟继续飞行
                    bird.vx *= 0.7;
                    bird.vy *= 0.7;
                },
                
                /**
                 * 等待小鸟停止
                 */
                _waitForBirdStop: function(birdIndex) {
                    if (birdIndex === null || birdIndex >= this.birds.length) return;
                    
                    // 清除之前的定时器
                    if (this._waitForBirdStopInterval) {
                        clearInterval(this._waitForBirdStopInterval);
                    }
                    
                    this._waitForBirdStopInterval = setInterval(() => {
                        const bird = this.birds[birdIndex];
                        if (!bird) {
                            clearInterval(this._waitForBirdStopInterval);
                            this._waitForBirdStopInterval = null;
                            return;
                        }
                        
                        const birdSprite = this.birdSprites[birdIndex];
                        if (!birdSprite) {
                            clearInterval(this._waitForBirdStopInterval);
                            this._waitForBirdStopInterval = null;
                            return;
                        }
                        
                        // 检查小鸟是否停止或飞出屏幕
                        const isStopped = Math.abs(bird.vx) < 0.1 && Math.abs(bird.vy) < 0.1 && bird.y >= this.app.screen.height - 50;
                        const isOutOfBounds = bird.x < -50 || bird.x > this.app.screen.width + 50 || bird.y < -50 || bird.y > this.app.screen.height + 50;
                        
                        if (isStopped || isOutOfBounds || !bird.active) {
                            clearInterval(this._waitForBirdStopInterval);
                            this._waitForBirdStopInterval = null;
                            
                            // 等待一小段时间确保所有碰撞都处理完毕
                            setTimeout(() => {
                                this._prepareNextBird();
                            }, 500);
                        }
                    }, 100);
                },
                
                /**
                 * 准备下一只小鸟
                 */
                _prepareNextBird: function() {
                    this.currentBirdIndex++;
                    
                    if (this.currentBirdIndex < this.birds.length) {
                        const bird = this.birds[this.currentBirdIndex];
                        const birdSprite = this.birdSprites[this.currentBirdIndex];
                        
                        bird.x = this.slingshot.x;
                        bird.y = this.slingshot.y;
                        bird.vx = 0;
                        bird.vy = 0;
                        bird.active = false;
                        bird.used = false;
                        
                        birdSprite.visible = true;
                        birdSprite.x = this.slingshot.x;
                        birdSprite.y = this.slingshot.y;
                    } else {
                        // 没有更多小鸟，等待所有物体静止后检查是否还有猪
                        setTimeout(() => {
                            this._checkLevelComplete();
                        }, 2000);
                    }
                    
                    this._updateUI();
                },
                
                /**
                 * 游戏循环
                 */
                _gameLoop: function() {
                    if (!this.app || !this.stage) return;
                    if (this.gameState !== 'playing') return;
                    
                    // 更新小鸟
                    for (let i = 0; i < this.birds.length; i++) {
                        const bird = this.birds[i];
                        const birdSprite = this.birdSprites[i];
                        
                        if (!bird.active || !birdSprite.visible) continue;
                        
                        // 应用重力
                        bird.vy += this.gravity;
                        
                        // 应用摩擦力
                        bird.vx *= this.friction;
                        bird.vy *= this.friction;
                        
                        // 更新位置
                        bird.x += bird.vx;
                        bird.y += bird.vy;
                        birdSprite.x = bird.x;
                        birdSprite.y = bird.y;
                        
                        // 边界检测
                        if (bird.y > this.app.screen.height - 50) {
                            bird.y = this.app.screen.height - 50;
                            bird.vy *= -0.5;
                            bird.vx *= 0.8;
                            
                            // 如果速度很小，停止小鸟
                            if (Math.abs(bird.vx) < 0.5 && Math.abs(bird.vy) < 0.5) {
                                bird.vx = 0;
                                bird.vy = 0;
                            }
                        }
                        
                        // 飞出屏幕检测
                        if (bird.x < -100 || bird.x > this.app.screen.width + 100 || bird.y < -100) {
                            birdSprite.visible = false;
                            bird.active = false;
                        }
                        
                        // 碰撞检测
                        this._checkBirdCollisions(i);
                    }
                    
                    // 更新蛋
                    if (this.eggs) {
                        for (let i = this.eggs.length - 1; i >= 0; i--) {
                            const egg = this.eggs[i];
                            const eggSprite = this.eggSprites[i];
                            
                            if (!egg.active) continue;
                            
                            egg.vy += this.gravity;
                            egg.x += egg.vx;
                            egg.y += egg.vy;
                            eggSprite.x = egg.x;
                            eggSprite.y = egg.y;
                            
                            // 碰撞检测
                            if (egg.y > this.app.screen.height - 50) {
                                this._damageInRadius(egg.x, egg.y, 40, 2);
                                eggSprite.visible = false;
                                egg.active = false;
                                this.stage.removeChild(eggSprite);
                                this.eggs.splice(i, 1);
                                this.eggSprites.splice(i, 1);
                            }
                        }
                    }
                    
                    // 清理不活跃的物体
                    this._cleanupInactiveObjects();
                },
                
                /**
                 * 检查小鸟碰撞
                 */
                _checkBirdCollisions: function(birdIndex) {
                    const bird = this.birds[birdIndex];
                    const birdSprite = this.birdSprites[birdIndex];
                    const birdType = this.birdTypes[bird.type];
                    const birdRadius = birdType.radius;
                    
                    // 与猪碰撞
                    for (let i = 0; i < this.pigs.length; i++) {
                        const pig = this.pigs[i];
                        const pigSprite = this.pigSprites[i];
                        
                        if (!pig.active) continue;
                        
                        const dx = bird.x - pig.x;
                        const dy = bird.y - pig.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        
                        if (dist < birdRadius + pig.radius) {
                            // 碰撞
                            pig.health--;
                            if (pig.health <= 0) {
                                pig.active = false;
                                pigSprite.visible = false;
                                this.score += 1000;
                                this._updateUI();
                            }
                            
                            // 小鸟反弹
                            const angle = Math.atan2(dy, dx);
                            bird.vx = Math.cos(angle) * 3;
                            bird.vy = Math.sin(angle) * 3;
                        }
                    }
                    
                    // 与方块碰撞
                    for (let i = 0; i < this.blocks.length; i++) {
                        const block = this.blocks[i];
                        const blockSprite = this.blockSprites[i];
                        
                        if (!block.active) continue;
                        
                        const dx = bird.x - block.x;
                        const dy = bird.y - block.y;
                        const distX = Math.abs(dx);
                        const distY = Math.abs(dy);
                        
                        if (distX < birdRadius + block.width / 2 && distY < birdRadius + block.height / 2) {
                            // 碰撞
                            block.health--;
                            if (block.health <= 0) {
                                block.active = false;
                                blockSprite.visible = false;
                                this.score += 100;
                                this._updateUI();
                            }
                            
                            // 计算碰撞方向并反弹
                            if (distX > distY) {
                                bird.vx *= -0.5;
                            } else {
                                bird.vy *= -0.5;
                            }
                        }
                    }
                },
                
                /**
                 * 在范围内造成伤害
                 */
                _damageInRadius: function(x, y, radius, damage) {
                    // 伤害猪
                    for (let i = 0; i < this.pigs.length; i++) {
                        const pig = this.pigs[i];
                        if (!pig.active) continue;
                        
                        const dx = x - pig.x;
                        const dy = y - pig.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        
                        if (dist < radius) {
                            pig.health -= damage;
                            if (pig.health <= 0) {
                                pig.active = false;
                                this.pigSprites[i].visible = false;
                                this.score += 1000;
                            }
                        }
                    }
                    
                    // 伤害方块
                    for (let i = 0; i < this.blocks.length; i++) {
                        const block = this.blocks[i];
                        if (!block.active) continue;
                        
                        const dx = x - block.x;
                        const dy = y - block.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        
                        if (dist < radius) {
                            block.health -= damage;
                            if (block.health <= 0) {
                                block.active = false;
                                this.blockSprites[i].visible = false;
                                this.score += 100;
                            }
                        }
                    }
                    
                    this._updateUI();
                },
                
                /**
                 * 清理不活跃的物体
                 */
                _cleanupInactiveObjects: function() {
                    // 清理不活跃的小鸟
                    for (let i = this.birds.length - 1; i >= 0; i--) {
                        const bird = this.birds[i];
                        if (!bird.active && bird.used && bird.y > this.app.screen.height + 100) {
                            if (this.birdSprites[i] && this.birdSprites[i].parent) {
                                this.stage.removeChild(this.birdSprites[i]);
                            }
                        }
                    }
                },
                
                /**
                 * 检查关卡完成
                 */
                _checkLevelComplete: function() {
                    // 检查是否还有活跃的猪
                    const activePigs = this.pigs.filter(pig => pig.active);
                    
                    if (activePigs.length === 0) {
                        // 关卡完成
                        this.gameState = 'levelComplete';
                        this._showLevelComplete();
                    } else {
                        // 游戏失败
                        this.gameState = 'gameover';
                        this._showGameOver(false);
                    }
                },
                
                /**
                 * 显示关卡完成
                 */
                _showLevelComplete: function() {
                    const gameOver = document.getElementById('game-over');
                    const title = document.getElementById('game-over-title');
                    const message = document.getElementById('game-over-message');
                    const nextBtn = document.getElementById('next-level-btn');
                    
                    if (gameOver && title && message) {
                        title.textContent = '关卡完成！';
                        message.textContent = `得分: ${this.score}`;
                        nextBtn.style.display = this.currentLevel < this.maxLevel ? 'block' : 'none';
                        gameOver.classList.add('show');
                    }
                    
                    // 解锁下一关
                    if (this.currentLevel < this.maxLevel) {
                        const nextLevelBtn = document.querySelector(`[data-level="${this.currentLevel + 1}"]`);
                        if (nextLevelBtn) {
                            nextLevelBtn.classList.remove('locked');
                            nextLevelBtn.classList.add('completed');
                        }
                    }
                },
                
                /**
                 * 显示游戏结束
                 */
                _showGameOver: function(won) {
                    const gameOver = document.getElementById('game-over');
                    const title = document.getElementById('game-over-title');
                    const message = document.getElementById('game-over-message');
                    const nextBtn = document.getElementById('next-level-btn');
                    
                    if (gameOver && title && message) {
                        title.textContent = won ? '胜利！' : '游戏结束';
                        message.textContent = `得分: ${this.score}`;
                        nextBtn.style.display = 'none';
                        gameOver.classList.add('show');
                    }
                },
                
                /**
                 * 更新UI
                 */
                _updateUI: function() {
                    const levelDisplay = document.getElementById('level-display');
                    const scoreDisplay = document.getElementById('score-display');
                    const birdsDisplay = document.getElementById('birds-display');
                    
                    if (levelDisplay) {
                        levelDisplay.textContent = this.currentLevel;
                    }
                    
                    if (scoreDisplay) {
                        scoreDisplay.textContent = this.score;
                    }
                    
                    if (birdsDisplay) {
                        const remainingBirds = this.birds.length - this.currentBirdIndex;
                        birdsDisplay.textContent = remainingBirds;
                    }
                },
                
                /**
                 * 程序信息
                 */
                __info__: function() {
                    return {
                        name: '愤怒的小鸟',
                        version: '1.0.0',
                        description: '使用PixiJS实现的愤怒的小鸟游戏，1:1还原经典玩法',
                        type: 'GUI',
                        author: 'ZerOS Team',
                        copyright: '© 2025 ZerOS',
                        permissions: typeof PermissionManager !== 'undefined' ? [
                            PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                            PermissionManager.PERMISSION.EVENT_LISTENER
                        ] : []
                    };
                },
                
                /**
                 * 程序退出
                 */
                __exit__: function(pid, force) {
                    try {
                        // 清理事件处理器
                        if (this._resizeHandlerId && typeof EventManager !== 'undefined') {
                            EventManager.unregisterEventHandler(this._resizeHandlerId);
                            this._resizeHandlerId = null;
                        }
                        
                        // 清理所有事件处理器（通过 EventManager）
                        if (typeof EventManager !== 'undefined' && this.pid) {
                            EventManager.unregisterAllHandlersForPid(this.pid);
                        }
                        
                        // 停止游戏循环
                        if (this.app && this.app.ticker && typeof this._gameLoop === 'function') {
                            try {
                                this.app.ticker.remove(this._gameLoop, this);
                            } catch (e) {
                                console.warn('移除游戏循环失败:', e);
                            }
                        }
                        
                        // 清理等待定时器
                        if (this._waitForBirdStopInterval) {
                            clearInterval(this._waitForBirdStopInterval);
                            this._waitForBirdStopInterval = null;
                        }
                        
                        // 销毁PixiJS应用
                        if (this.app) {
                            try {
                                // 移除canvas元素（PixiJS v8 使用 canvas，v7 使用 view）
                                const canvasElement = this.app.canvas || this.app.view;
                                if (canvasElement && canvasElement.parentNode) {
                                    canvasElement.parentNode.removeChild(canvasElement);
                                }
                                // 销毁应用（PixiJS v8 使用 destroy() 方法）
                                if (typeof this.app.destroy === 'function') {
                                    this.app.destroy(true, { children: true, texture: true });
                                }
                            } catch (e) {
                                console.warn('销毁PixiJS应用失败:', e);
                            }
                            this.app = null;
                        }
                        
                        // 清理事件监听
                        if (this._resizeHandler) {
                            try {
                                window.removeEventListener('resize', this._resizeHandler);
                            } catch (e) {
                                console.warn('移除resize监听器失败:', e);
                            }
                            this._resizeHandler = null;
                        }
                        
                        // 移除窗口
                        if (this.window && this.window.parentElement) {
                            try {
                                this.window.parentElement.removeChild(this.window);
                            } catch (e) {
                                console.warn('移除窗口失败:', e);
                            }
                        }
                        
                        this.window = null;
                        this.stage = null;
                    } catch (error) {
                        console.error('程序退出时发生错误:', error);
                    }
                }
            };
            
            // 导出到全局
            if (typeof window !== 'undefined') {
                window.ANGRYBIRDS = ANGRYBIRDS;
            }
            
            // 如果POOL可用，也注册到POOL
            if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                try {
                    if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                        POOL.__INIT__("KERNEL_GLOBAL_POOL");
                    }
                    POOL.__ADD__("KERNEL_GLOBAL_POOL", "ANGRYBIRDS", ANGRYBIRDS);
                } catch (e) {
                    console.warn('注册ANGRYBIRDS到POOL失败:', e);
                }
            }
        })(window);
  