// ZerOS 手势跟踪器
// 使用 MediaPipe 实时跟踪用户手部并绘制手势骨架
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const HANDTRACKER = {
        pid: null,
        window: null,
        canvas: null,
        video: null,
        ctx: null,
        handLandmarker: null,
        gestureRecognizer: null,
        faceLandmarker: null,
        vision: null,
        stream: null,
        animationFrameId: null,
        isRunning: false,
        useMultithreading: true,
        lastResults: null,
        lastGestureResults: null,
        lastFaceResults: null,
        _lastUpdateTime: 0,
        _frameSkip: 0,  // 帧跳过计数器，用于性能优化
        currentPage: 'tracking',  // 当前页面：'tracking' 或 'interactive'
        trackingMode: 'cube',  // 跟踪模式：'cube'（方块模式）或 'circle'（圆形跟随手指模式）
        threeScene: null,  // Three.js 场景
        threeRenderer: null,  // Three.js 渲染器
        threeCamera: null,  // Three.js 相机
        particles: null,  // 粒子系统（保留用于向后兼容）
        heartShape: null,  // 爱心形状
        particleState: 'scattered',  // 粒子状态：'scattered' 或 'heart'（保留用于向后兼容）
        heartRotation: 0,  // 爱心旋转角度（保留用于向后兼容）
        THREE: null,  // Three.js 库引用
        particleCount: 2000,  // 减少粒子数量以提升性能
        targetPositions: [],  // 目标位置数组（保留用于向后兼容）
        currentPositions: [],  // 当前位置数组（保留用于向后兼容）
        _lastGestureCheck: 0,  // 上次手势检测时间
        _lastFaceCheck: 0,  // 上次面部检测时间
        _threeAnimationFrameId: null,  // Three.js 动画帧 ID
        _gestureHistory: [],  // 手势历史记录（用于稳定性检查）
        _gestureStabilityThreshold: 3,  // 需要连续检测到相同手势的次数
        _currentStableGesture: null,  // 当前稳定的手势
        _gestureConfidenceThreshold: 0.7,  // 手势置信度阈值
        _particleVelocities: null,  // 粒子速度（用于漫游）
        _fistClosureDegree: 0,  // 握拳程度（0-1，0=完全张开，1=完全握拳）
        _scatteredPositions: [],  // 散开时的粒子位置（用于插值）
        _heartLocked: false,  // 爱心锁定状态（防止轻微波动导致散开）
        _heartLockThreshold: 0.85,  // 锁定阈值（达到此值后锁定）
        _heartUnlockThreshold: 0.3,  // 解锁阈值（低于此值才解锁）
        _particleGroups: [],  // 粒子组数组（每个手部一个粒子组）
        _hasContractedOnce: false,  // 是否已经收缩过一次（用于禁用漫游）
        _particleGroupIdCounter: 0,  // 粒子组ID计数器
        _handDetectionHistory: [],  // 手部检测历史（用于稳定性检查）
        _handDetectionStabilityFrames: 3,  // 需要连续检测到/检测不到多少帧才确认
        _trackingCube: null,  // 跟踪页面的太阳系系统容器（保留名称以兼容现有代码）
        _solarSystem: null,  // 太阳系系统容器
        _sun: null,  // 太阳对象
        _planets: [],  // 行星数组
        _planetOrbits: [],  // 行星轨道数组
        _particleSystem: null,  // 粒子系统
        _particleCount: 500,  // 粒子数量
        _trackingCircles: [],  // 跟踪页面的圆形div元素数组（跟随手指）
        _fingerTipStates: [],  // 手指状态数组（用于检测点击和拖动）
        _isGestureMode: false,  // 是否启用手势控制模式
        _trackingThreeScene: null,  // 跟踪页面的Three.js场景
        _trackingThreeRenderer: null,  // 跟踪页面的Three.js渲染器
        _trackingThreeCamera: null,  // 跟踪页面的Three.js相机
        _trackingThreeAnimationFrameId: null,  // 跟踪页面的动画帧ID
        _cubeRotationEnabled: false,  // 立方体旋转是否启用
        _cubePosition: { x: 0, y: 0, z: 0 },  // 立方体位置
        _cubeScale: 1.0,  // 立方体缩放
        _lastTwoFingerDistance: null,  // 上次两指距离（用于缩放）
        _lastTwoFingerCenter: null,  // 上次两指中心点（用于移动）
        _lastTwoFingerCenter3D: null,  // 上次两指中心点的3D位置
        _twoFingerVelocity: { x: 0, y: 0, z: 0 },  // 两指移动速度
        _twoFingerMoveHistory: [],  // 两指移动历史（用于平滑）
        _isTwoFingerActive: false,  // 是否正在使用两指手势（移动或缩放）
        _twoFingerReleaseThreshold: 0.15,  // 两指松开阈值（距离超过此值认为松开）
        _lastTwoHandDistance: null,  // 上次两只手的距离（用于缩放）
        _lastTwoHandCenter: null,  // 上次两只手的中心点（用于移动）
        _isTwoHandActive: false,  // 是否正在使用两只手手势
        _lastFiveFingerPinchTime: 0,  // 上次五指捏合时间（防抖）
        _lastSingleFingerClickTime: 0,  // 上次单指点击时间（防抖）
        _fiveFingerPinchDebounce: 1000,  // 五指捏合防抖时间（毫秒）- 增加到1秒避免误触发
        _singleFingerClickDebounce: 300,  // 单指点击防抖时间（毫秒）
        _raycaster: null,  // 射线检测器（用于检测点击立方体）
        _fiveFingerPinchHistory: [],  // 五指捏合历史记录（用于稳定性检查）
        _fiveFingerPinchStabilityFrames: 5,  // 需要连续检测到五指捏合多少帧才确认
        _victoryGestureHistory: [],  // 比耶手势历史记录（用于稳定性检查）
        _victoryGestureStabilityFrames: 5,  // 需要连续检测到比耶手势多少帧才确认
        _lastVictoryGestureTime: 0,  // 上次比耶手势时间（防抖）
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            try {
                // 获取 GUI 容器
                const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
                
                // 创建主窗口
                this.window = document.createElement('div');
                this.window.className = 'handtracker-window zos-gui-window';
                this.window.dataset.pid = pid.toString();
                
                // 使用GUIManager注册窗口
                if (typeof GUIManager !== 'undefined') {
                    let icon = null;
                    if (typeof ApplicationAssetManager !== 'undefined') {
                        icon = ApplicationAssetManager.getIcon('handtracker');
                    }
                    
                    const windowInfo = GUIManager.registerWindow(pid, this.window, {
                        title: '手势跟踪器',
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
                
                // 创建UI
                this._createUI();
                
                // 添加到GUI容器
                guiContainer.appendChild(this.window);
                
                // 加载依赖库
                await this._loadDependencies();
                
                // 初始化MediaPipe
                await this._initMediaPipe();
                
                // 请求摄像头权限并启动
                await this._startCamera();
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('HANDTRACKER', '初始化失败', error);
                }
                this._showError('初始化失败: ' + error.message);
            }
        },
        
        /**
         * 创建UI界面
         */
        _createUI: function() {
            // 创建页面切换标签
            const tabContainer = document.createElement('div');
            tabContainer.className = 'handtracker-tabs';
            
            const trackingTab = document.createElement('button');
            trackingTab.className = 'handtracker-tab active';
            trackingTab.textContent = '跟踪展示';
            trackingTab.onclick = () => this._switchPage('tracking');
            
            const interactiveTab = document.createElement('button');
            interactiveTab.className = 'handtracker-tab';
            interactiveTab.textContent = '交互效果';
            interactiveTab.onclick = () => this._switchPage('interactive');
            
            tabContainer.appendChild(trackingTab);
            tabContainer.appendChild(interactiveTab);
            this.window.appendChild(tabContainer);
            
            // 创建工具栏
            const toolbar = document.createElement('div');
            toolbar.className = 'handtracker-toolbar';
            
            // 开始/停止按钮
            this.startStopBtn = document.createElement('button');
            this.startStopBtn.className = 'handtracker-btn handtracker-btn-primary';
            this.startStopBtn.textContent = '开始跟踪';
            this.startStopBtn.onclick = () => this._toggleTracking();
            toolbar.appendChild(this.startStopBtn);
            
            // 多线程开关
            const multithreadingLabel = document.createElement('label');
            multithreadingLabel.className = 'handtracker-checkbox-label';
            multithreadingLabel.innerHTML = `
                <input type="checkbox" class="handtracker-checkbox" checked>
                <span>使用多线程加速</span>
            `;
            const checkbox = multithreadingLabel.querySelector('input');
            checkbox.checked = this.useMultithreading;
            checkbox.onchange = (e) => {
                this.useMultithreading = e.target.checked;
            };
            toolbar.appendChild(multithreadingLabel);
            
            // 模式切换按钮
            const modeButtonContainer = document.createElement('div');
            modeButtonContainer.className = 'handtracker-mode-buttons';
            modeButtonContainer.style.display = 'flex';
            modeButtonContainer.style.gap = '8px';
            modeButtonContainer.style.marginLeft = '10px';
            
            const cubeModeBtn = document.createElement('button');
            cubeModeBtn.textContent = '方块模式';
            cubeModeBtn.className = 'handtracker-mode-btn active';
            cubeModeBtn.style.padding = '6px 12px';
            cubeModeBtn.style.border = '2px solid #8b5cf6';
            cubeModeBtn.style.borderRadius = '4px';
            cubeModeBtn.style.backgroundColor = '#8b5cf6';
            cubeModeBtn.style.color = '#fff';
            cubeModeBtn.style.cursor = 'pointer';
            cubeModeBtn.style.fontSize = '13px';
            cubeModeBtn.onclick = () => {
                this.trackingMode = 'cube';
                cubeModeBtn.classList.add('active');
                circleModeBtn.classList.remove('active');
                cubeModeBtn.style.backgroundColor = '#8b5cf6';
                circleModeBtn.style.backgroundColor = 'transparent';
                circleModeBtn.style.color = '#8b5cf6';
                cubeModeBtn.style.color = '#fff';
                this._clearTrackingCircles();
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('HANDTRACKER', '切换到方块模式');
                }
            };
            
            const circleModeBtn = document.createElement('button');
            circleModeBtn.textContent = '圆形跟随';
            circleModeBtn.className = 'handtracker-mode-btn';
            circleModeBtn.style.padding = '6px 12px';
            circleModeBtn.style.border = '2px solid #8b5cf6';
            circleModeBtn.style.borderRadius = '4px';
            circleModeBtn.style.backgroundColor = 'transparent';
            circleModeBtn.style.color = '#8b5cf6';
            circleModeBtn.style.cursor = 'pointer';
            circleModeBtn.style.fontSize = '13px';
            circleModeBtn.onclick = () => {
                this.trackingMode = 'circle';
                circleModeBtn.classList.add('active');
                cubeModeBtn.classList.remove('active');
                circleModeBtn.style.backgroundColor = '#8b5cf6';
                cubeModeBtn.style.backgroundColor = 'transparent';
                cubeModeBtn.style.color = '#8b5cf6';
                circleModeBtn.style.color = '#fff';
                this._removeTrackingCube();
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('HANDTRACKER', '切换到圆形跟随模式');
                }
            };
            
            modeButtonContainer.appendChild(cubeModeBtn);
            modeButtonContainer.appendChild(circleModeBtn);
            toolbar.appendChild(modeButtonContainer);
            
            // 状态显示
            this.statusDisplay = document.createElement('div');
            this.statusDisplay.className = 'handtracker-status';
            this._updateStatus('准备就绪');
            toolbar.appendChild(this.statusDisplay);
            
            this.window.appendChild(toolbar);
            
            // 创建页面容器
            this.pageContainer = document.createElement('div');
            this.pageContainer.className = 'handtracker-page-container';
            
            // 创建跟踪展示页面
            this.trackingPage = this._createTrackingPage();
            this.trackingPage.classList.add('active'); // 默认显示跟踪页面
            this.pageContainer.appendChild(this.trackingPage);
            
            // 创建交互效果页面
            this.interactivePage = this._createInteractivePage();
            this.pageContainer.appendChild(this.interactivePage);
            
            this.window.appendChild(this.pageContainer);
            
            // 创建信息面板
            const infoPanel = document.createElement('div');
            infoPanel.className = 'handtracker-info';
            infoPanel.innerHTML = `
                <div class="handtracker-info-item">
                    <span class="handtracker-info-label">检测到的手:</span>
                    <span class="handtracker-info-value" id="hand-count">0</span>
                </div>
                <div class="handtracker-info-item">
                    <span class="handtracker-info-label">手势:</span>
                    <span class="handtracker-info-value" id="gesture-display">无</span>
                </div>
                <div class="handtracker-info-item">
                    <span class="handtracker-info-label">检测到的面部:</span>
                    <span class="handtracker-info-value" id="face-count">0</span>
                </div>
                <div class="handtracker-info-item">
                    <span class="handtracker-info-label">FPS:</span>
                    <span class="handtracker-info-value" id="fps">0</span>
                </div>
            `;
            this.window.appendChild(infoPanel);
            
            this.handCountDisplay = infoPanel.querySelector('#hand-count');
            this.gestureDisplay = infoPanel.querySelector('#gesture-display');
            this.faceCountDisplay = infoPanel.querySelector('#face-count');
            this.fpsDisplay = infoPanel.querySelector('#fps');
        },
        
        /**
         * 创建跟踪展示页面
         */
        _createTrackingPage: function() {
            const page = document.createElement('div');
            page.className = 'handtracker-page tracking-page';
            
            // 创建视频容器
            const videoContainer = document.createElement('div');
            videoContainer.className = 'handtracker-video-container';
            
            // 创建video元素（隐藏，用于捕获）
            this.video = document.createElement('video');
            this.video.autoplay = true;
            this.video.playsInline = true;
            this.video.style.display = 'none';
            videoContainer.appendChild(this.video);
            
            // 创建canvas元素（用于显示和绘制）
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'handtracker-canvas';
            this.ctx = this.canvas.getContext('2d');
            videoContainer.appendChild(this.canvas);
            
            // 创建Three.js容器（用于立方体交互，覆盖在canvas上）
            const threeContainer = document.createElement('div');
            threeContainer.className = 'handtracker-tracking-three-container';
            threeContainer.id = 'tracking-three-container';
            threeContainer.style.position = 'absolute';
            threeContainer.style.top = '0';
            threeContainer.style.left = '0';
            threeContainer.style.width = '100%';
            threeContainer.style.height = '100%';
            threeContainer.style.pointerEvents = 'none';  // 允许点击穿透到canvas
            videoContainer.appendChild(threeContainer);
            
            // 创建圆形容器（用于显示跟随手指的圆形div）
            const circleContainer = document.createElement('div');
            circleContainer.className = 'handtracker-circle-container';
            circleContainer.id = 'handtracker-circle-container';
            circleContainer.style.position = 'fixed';
            circleContainer.style.top = '0';
            circleContainer.style.left = '0';
            circleContainer.style.width = '100%';
            circleContainer.style.height = '100%';
            circleContainer.style.pointerEvents = 'none';  // 不阻挡鼠标事件
            circleContainer.style.zIndex = '999999';  // 确保在最上层
            // 添加到body，确保即使窗口最小化也显示
            if (document.body) {
                document.body.appendChild(circleContainer);
            } else {
                // 如果body还没准备好，延迟添加
                setTimeout(() => {
                    if (document.body) {
                        document.body.appendChild(circleContainer);
                    }
                }, 100);
            }
            
            page.appendChild(videoContainer);
            return page;
        },
        
        /**
         * 创建交互效果页面
         */
        _createInteractivePage: function() {
            const page = document.createElement('div');
            page.className = 'handtracker-page interactive-page';
            
            // 创建 Three.js canvas 容器
            const threeContainer = document.createElement('div');
            threeContainer.className = 'handtracker-three-container';
            threeContainer.id = 'three-container';
            page.appendChild(threeContainer);
            
            return page;
        },
        
        /**
         * 切换页面
         */
        _switchPage: function(pageName) {
            if (this.currentPage === pageName) return;
            
            // 更新标签状态
            const tabs = this.window.querySelectorAll('.handtracker-tab');
            tabs.forEach(tab => tab.classList.remove('active'));
            if (pageName === 'tracking') {
                tabs[0].classList.add('active');
            } else {
                tabs[1].classList.add('active');
            }
            
            // 切换页面显示（使用 CSS 类而不是内联样式）
            if (pageName === 'tracking') {
                this.trackingPage.classList.add('active');
                this.interactivePage.classList.remove('active');
                if (this.threeRenderer && this._threeAnimationFrameId) {
                    cancelAnimationFrame(this._threeAnimationFrameId);
                    this._threeAnimationFrameId = null;
                }
                // 切换到跟踪页面时初始化跟踪页面的Three.js
                if (!this._trackingThreeRenderer) {
                    this._initTrackingThreeJS();
                }
            } else {
                this.trackingPage.classList.remove('active');
                this.interactivePage.classList.add('active');
                if (this._trackingThreeAnimationFrameId) {
                    cancelAnimationFrame(this._trackingThreeAnimationFrameId);
                    this._trackingThreeAnimationFrameId = null;
                }
                this._initThreeJS();
            }
            
            this.currentPage = pageName;
        },
        
        /**
         * 加载依赖库
         */
        _loadDependencies: async function() {
            try {
                // 加载 MediaPipe
                if (typeof DynamicManager !== 'undefined') {
                    this._updateStatus('正在加载 MediaPipe...');
                    this.vision = await DynamicManager.loadModule('mediapipe');
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('HANDTRACKER', 'MediaPipe 加载成功');
                    }
                } else {
                    throw new Error('DynamicManager 不可用');
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('HANDTRACKER', '加载依赖失败', error);
                }
                throw new Error('加载依赖库失败: ' + error.message);
            }
        },
        
        /**
         * 设置 MediaPipe 警告过滤器
         * 过滤掉不影响功能的常见警告信息
         */
        _setupMediaPipeWarningFilter: function() {
            // MediaPipe 的常见警告信息（不影响功能）
            const ignoredWarnings = [
                'OpenGL error checking is disabled',
                'Hand Gesture Recognizer contains CPU only ops',
                'Sets HandGestureRecognizerGraph acceleration to Xnnpack',
                'Sets FaceBlendshapesGraph acceleration to xnnpack',
                'Using NORM_RECT without IMAGE_DIMENSIONS',
                'Feedback manager requires a model with a single signature inference',
                'Disabling support for feedback tensors',
                'Created TensorFlow Lite XNNPACK delegate for CPU'
            ];
            
            // 保存原始的 console.warn 和 console.error
            if (!this._originalConsoleWarn) {
                this._originalConsoleWarn = console.warn;
                this._originalConsoleError = console.error;
            }
            
            // 重写 console.warn 来过滤 MediaPipe 警告
            const self = this;
            console.warn = function(...args) {
                const message = args.join(' ');
                // 检查是否是 MediaPipe 的警告
                const isMediaPipeWarning = ignoredWarnings.some(warning => 
                    message.includes(warning)
                );
                
                // 如果是 MediaPipe 警告，不输出
                if (!isMediaPipeWarning) {
                    self._originalConsoleWarn.apply(console, args);
                }
            };
            
            // 重写 console.error 来过滤 MediaPipe 错误（实际上这些是警告级别的）
            console.error = function(...args) {
                const message = args.join(' ');
                // 检查是否是 MediaPipe 的警告（被标记为错误）
                const isMediaPipeWarning = ignoredWarnings.some(warning => 
                    message.includes(warning)
                );
                
                // 如果是 MediaPipe 警告，不输出
                if (!isMediaPipeWarning) {
                    self._originalConsoleError.apply(console, args);
                }
            };
        },
        
        /**
         * 恢复原始 console 方法
         */
        _restoreConsole: function() {
            if (this._originalConsoleWarn) {
                console.warn = this._originalConsoleWarn;
                console.error = this._originalConsoleError;
                this._originalConsoleWarn = null;
                this._originalConsoleError = null;
            }
        },
        
        /**
         * 初始化 MediaPipe
         */
        _initMediaPipe: async function() {
            try {
                // 设置警告过滤器（过滤 MediaPipe 的常见警告）
                this._setupMediaPipeWarningFilter();
                
                this._updateStatus('正在初始化 MediaPipe...');
                
                const { HandLandmarker, GestureRecognizer, FaceLandmarker, FilesetResolver } = this.vision;
                
                // 创建 FilesetResolver（使用本地WASM文件，使用绝对路径）
                const wasmPath = '/kernel/dynamicModule/libs/mediapipe/wasm';
                const filesetResolver = await FilesetResolver.forVisionTasks(wasmPath);
                
                // 创建 HandLandmarker（优化配置以支持双手识别）
                this.handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: '/kernel/dynamicModule/libs/mediapipe/models/hand_landmarker.task',
                        delegate: 'GPU'  // 使用GPU加速
                    },
                    numHands: 2,  // 支持最多2只手
                    minHandDetectionConfidence: 0.3,  // 降低检测阈值以提高双手识别率
                    minHandPresenceConfidence: 0.3,   // 降低存在阈值
                    minTrackingConfidence: 0.3        // 降低跟踪阈值
                });
                
                // 创建 GestureRecognizer（手势识别器，优化配置）
                this.gestureRecognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: '/kernel/dynamicModule/libs/mediapipe/models/gesture_recognizer.task',
                        delegate: 'GPU'  // 使用GPU加速
                    },
                    numHands: 2,  // 支持最多2只手
                    minHandDetectionConfidence: 0.3,  // 降低检测阈值
                    minHandPresenceConfidence: 0.3,   // 降低存在阈值
                    minTrackingConfidence: 0.3        // 降低跟踪阈值
                });
                
                // 创建 FaceLandmarker（面部识别器）
                // 注意：使用 IMAGE 模式，因为 VIDEO 模式需要时间戳管理，而我们的实时处理更适合 IMAGE 模式
                this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: '/kernel/dynamicModule/libs/mediapipe/models/face_landmarker.task',
                        delegate: 'GPU'  // 使用GPU加速
                    },
                    outputFaceBlendshapes: false,  // 不输出面部混合形状（提高性能）
                    runningMode: 'IMAGE',  // 图像模式（每帧独立处理）
                    numFaces: 1,  // 最多检测1张脸（可根据需要调整）
                    minFaceDetectionConfidence: 0.5,
                    minFacePresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('HANDTRACKER', 'MediaPipe 初始化成功（手部检测 + 手势识别 + 面部识别）');
                }
                this._updateStatus('MediaPipe 初始化完成');
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('HANDTRACKER', 'MediaPipe 初始化失败', error);
                }
                throw new Error('MediaPipe 初始化失败: ' + error.message);
            }
        },
        
        /**
         * 启动摄像头
         */
        /**
         * 诊断摄像头状态
         * @returns {Promise<Object>} 诊断信息
         */
        _diagnoseCamera: async function() {
            const diagnosis = {
                browserSupport: false,
                mediaDevicesSupport: false,
                devicesAvailable: false,
                permissionStatus: 'unknown',
                deviceCount: 0,
                deviceList: [],
                currentStreamActive: false,
                currentStreamTracks: 0,
                errors: []
            };
            
            try {
                // 检查浏览器支持
                diagnosis.browserSupport = !!(navigator && navigator.mediaDevices);
                diagnosis.mediaDevicesSupport = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
                
                if (!diagnosis.mediaDevicesSupport) {
                    diagnosis.errors.push('浏览器不支持 MediaDevices API');
                    return diagnosis;
                }
                
                // 检查当前是否有活动的摄像头流
                if (this.stream) {
                    diagnosis.currentStreamActive = true;
                    diagnosis.currentStreamTracks = this.stream.getVideoTracks().length;
                }
                
                // 尝试检测是否有其他标签页在使用摄像头
                // 注意：由于浏览器安全限制，无法直接检测其他标签页，但可以尝试获取所有设备
                // 如果设备存在但无法访问，可能是被占用
                diagnosis.possibleConflict = false;
                if (diagnosis.deviceCount > 0 && diagnosis.permissionStatus === 'granted') {
                    // 尝试快速测试摄像头是否可用（不实际启动流）
                    try {
                        // 创建一个临时的测试约束
                        const testConstraints = { video: { facingMode: 'user' } };
                        // 注意：这里不实际调用 getUserMedia，只是检查约束是否有效
                        diagnosis.possibleConflict = false; // 无法直接检测，标记为未知
                    } catch (e) {
                        diagnosis.errors.push(`摄像头可用性测试失败: ${e.message}`);
                    }
                }
                
                // 检查权限状态
                try {
                    if (navigator.permissions && navigator.permissions.query) {
                        const permissionResult = await navigator.permissions.query({ name: 'camera' });
                        diagnosis.permissionStatus = permissionResult.state; // 'granted', 'denied', 'prompt'
                    }
                } catch (e) {
                    diagnosis.errors.push(`无法检查权限状态: ${e.message}`);
                }
                
                // 枚举可用设备（这会列出系统中所有可用的视频输入设备，不仅仅是当前程序使用的）
                // 包括物理摄像头（如笔记本前置/后置摄像头、USB摄像头）和虚拟摄像头（如OBS虚拟摄像头等）
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const videoDevices = devices.filter(device => device.kind === 'videoinput');
                    diagnosis.deviceCount = videoDevices.length;
                    diagnosis.devicesAvailable = videoDevices.length > 0;
                    diagnosis.deviceList = videoDevices.map(device => ({
                        deviceId: device.deviceId,
                        label: device.label || '未命名摄像头',
                        groupId: device.groupId
                    }));
                    
                    if (videoDevices.length === 0) {
                        diagnosis.errors.push('未检测到任何摄像头设备');
                    }
                } catch (e) {
                    diagnosis.errors.push(`无法枚举设备: ${e.message}`);
                }
                
            } catch (error) {
                diagnosis.errors.push(`诊断过程出错: ${error.message}`);
            }
            
            return diagnosis;
        },
        
        _startCamera: async function() {
            try {
                // 先检查 ZerOS 权限系统
                if (typeof PermissionManager !== 'undefined' && this.pid) {
                    this._updateStatus('正在检查权限...');
                    const hasPermission = await PermissionManager.checkAndRequestPermission(
                        this.pid,
                        PermissionManager.PERMISSION.MEDIA_ACCESS
                    );
                    
                    if (!hasPermission) {
                        throw new Error('用户拒绝了摄像头访问权限');
                    }
                }
                
                this._updateStatus('正在请求摄像头权限...');
                
                // 检查浏览器是否支持 getUserMedia
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error('浏览器不支持摄像头访问，请使用现代浏览器（Chrome、Firefox、Edge 等）');
                }
                
                // 请求摄像头权限（先尝试高质量配置）
                let constraints = {
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    }
                };
                
                try {
                    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                } catch (constraintError) {
                    // 如果配置错误，尝试使用默认配置
                    if (constraintError.name === 'OverconstrainedError' || constraintError.name === 'ConstraintNotSatisfiedError') {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('HANDTRACKER', '高质量配置失败，尝试使用默认配置', constraintError);
                        }
                        constraints = {
                            video: {
                                facingMode: 'user'
                            }
                        };
                        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                    } else {
                        throw constraintError; // 重新抛出其他错误
                    }
                }
                
                // 设置video源
                this.video.srcObject = this.stream;
                
                // 等待video加载
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('视频加载超时'));
                    }, 10000);  // 10秒超时
                    
                    this.video.onloadedmetadata = () => {
                        clearTimeout(timeout);
                        // 检查视频尺寸是否有效
                        if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                            // 设置canvas尺寸
                            this.canvas.width = this.video.videoWidth;
                            this.canvas.height = this.video.videoHeight;
                            resolve();
                        } else {
                            reject(new Error('视频尺寸无效'));
                        }
                    };
                    this.video.onerror = (event) => {
                        clearTimeout(timeout);
                        // video 元素的错误事件可能不包含标准的 Error 对象
                        const videoError = new Error('视频元素加载失败');
                        videoError.name = 'VideoLoadError';
                        videoError.originalEvent = event;
                        videoError.videoError = this.video.error;
                        reject(videoError);
                    };
                    
                    // 如果视频已经加载，立即检查
                    if (this.video.readyState >= 2) {
                        this.video.onloadedmetadata();
                    }
                });
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('HANDTRACKER', '摄像头启动成功');
                }
                this._updateStatus('摄像头已就绪，点击"开始跟踪"开始');
                
            } catch (error) {
                // 记录详细的错误信息
                if (typeof KernelLogger !== 'undefined') {
                    // 构建详细的错误信息对象
                    const errorDetails = {};
                    
                    // 尝试提取所有可能的错误属性
                    if (error) {
                        if (error.name) errorDetails.name = error.name;
                        if (error.message) errorDetails.message = error.message;
                        if (error.stack) errorDetails.stack = error.stack;
                        if (error.constraint) errorDetails.constraint = error.constraint;
                        if (error.constraintName) errorDetails.constraintName = error.constraintName;
                        if (error.videoError) errorDetails.videoError = error.videoError;
                        if (error.originalEvent) errorDetails.originalEvent = 'Video element error event';
                        
                        // 如果错误对象有可枚举属性，也包含它们
                        try {
                            for (const key in error) {
                                if (!errorDetails[key] && typeof error[key] !== 'function') {
                                    try {
                                        errorDetails[key] = String(error[key]);
                                    } catch (e) {
                                        errorDetails[key] = '[无法序列化]';
                                    }
                                }
                            }
                        } catch (e) {
                            // 忽略枚举错误
                        }
                    }
                    
                    // 确保至少有一些信息
                    if (Object.keys(errorDetails).length === 0) {
                        errorDetails.rawError = String(error || '未知错误');
                        errorDetails.errorType = typeof error;
                    }
                    
                    // 构建错误消息
                    const errorName = errorDetails.name || error?.name || 'UnknownError';
                    const errorMessage = errorDetails.message || error?.message || String(error) || '未知错误';
                    
                    KernelLogger.error('HANDTRACKER', `摄像头启动失败: ${errorName} - ${errorMessage}`, errorDetails);
                }
                
                // 提供更友好的错误信息
                let errorMessage = '无法访问摄像头';
                let showRetry = false; // 是否显示重试按钮
                
                // 确保 error 对象有基本属性
                if (!error || typeof error !== 'object') {
                    error = { name: 'UnknownError', message: String(error || '未知错误') };
                }
                
                if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    errorMessage = '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问';
                    showRetry = true; // 用户可能已经允许权限，可以重试
                } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                    errorMessage = '未检测到摄像头设备，请检查摄像头是否已连接';
                    showRetry = true; // 用户可能已经连接摄像头，可以重试
                } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                    // 执行诊断以获取更详细的信息
                    this._updateStatus('正在诊断摄像头问题...');
                    const diagnosis = await this._diagnoseCamera();
                    
                    let detailedMessage = '摄像头被其他程序占用';
                    if (diagnosis.deviceCount === 0) {
                        detailedMessage = '未检测到摄像头设备';
                    } else if (diagnosis.permissionStatus === 'denied') {
                        detailedMessage = '摄像头权限被拒绝，请在浏览器设置中允许';
                    } else if (diagnosis.permissionStatus === 'prompt') {
                        detailedMessage = '需要授权摄像头访问权限';
                    } else {
                        // 提供更详细的解决建议
                        detailedMessage = '摄像头无法启动，可能原因：\n';
                        detailedMessage += '1. 其他浏览器标签页正在使用摄像头\n';
                        detailedMessage += '2. 其他应用程序（如视频会议软件）占用摄像头\n';
                        detailedMessage += '3. 摄像头硬件或驱动程序问题\n';
                        detailedMessage += '\n建议：\n';
                        detailedMessage += '- 关闭其他使用摄像头的浏览器标签页\n';
                        detailedMessage += '- 关闭其他使用摄像头的应用程序\n';
                        detailedMessage += '- 检查摄像头是否正常工作\n';
                        detailedMessage += '- 尝试刷新页面后重试';
                    }
                    
                    errorMessage = detailedMessage;
                    showRetry = true; // 用户可能已经关闭其他程序，可以重试
                    
                    // 输出详细诊断信息到日志
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('HANDTRACKER', `摄像头诊断 - 权限状态: ${diagnosis.permissionStatus}, 检测到的摄像头数量: ${diagnosis.deviceCount}`);
                        if (diagnosis.deviceList.length > 0) {
                            KernelLogger.debug('HANDTRACKER', `可用摄像头: ${JSON.stringify(diagnosis.deviceList)}`);
                        }
                        if (diagnosis.errors.length > 0) {
                            KernelLogger.warn('HANDTRACKER', `诊断错误: ${diagnosis.errors.join(', ')}`);
                        }
                    }
                    
                    // 显示诊断按钮，让用户可以查看详细信息
                    this._showError(errorMessage, showRetry, true);
                    return; // 提前返回，避免重复显示错误
                } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
                    errorMessage = '摄像头不支持请求的配置，尝试使用默认设置';
                    showRetry = true; // 可以尝试使用默认配置重试
                } else {
                    // 对于其他未知错误，显示错误消息
                    errorMessage = error.message || error.toString() || '未知错误，请查看控制台获取详细信息';
                    showRetry = true; // 提供重试选项
                    
                    // 记录未知错误类型
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('HANDTRACKER', `未知的摄像头错误类型: ${error.name || 'Unknown'}`, {
                            error: error.message || String(error),
                            name: error.name,
                            stack: error.stack,
                            fullError: error
                        });
                    }
                }
                
                // 对于 NotReadableError，已经在上面处理并返回了
                if (error.name !== 'NotReadableError' && error.name !== 'TrackStartError') {
                    this._showError(errorMessage, showRetry);
                }
            }
        },
        
        /**
         * 切换跟踪状态
         */
        _toggleTracking: function() {
            if (this.isRunning) {
                this._stopTracking();
            } else {
                this._startTracking();
            }
        },
        
        /**
         * 开始跟踪
         */
        _startTracking: function() {
            if (!this.handLandmarker || !this.video || !this.stream) {
                this._showError('请等待初始化完成');
                return;
            }
            
            // 检查视频是否准备好
            if (!this.video.videoWidth || 
                !this.video.videoHeight || 
                this.video.videoWidth === 0 || 
                this.video.videoHeight === 0 ||
                this.video.readyState < 2) {
                this._showError('视频未准备好，请稍候...');
                // 等待视频准备好后再开始
                const checkVideo = () => {
                    if (this.video.videoWidth > 0 && 
                        this.video.videoHeight > 0 && 
                        this.video.readyState >= 2) {
                        this.isRunning = true;
                        this.startStopBtn.textContent = '停止跟踪';
                        this._updateStatus('正在跟踪...');
                        this._processFrame();
                    } else {
                        setTimeout(checkVideo, 100);
                    }
                };
                checkVideo();
                return;
            }
            
            this.isRunning = true;
            this.startStopBtn.textContent = '停止跟踪';
            this._updateStatus('正在跟踪...');
            
            // 开始处理循环
            this._processFrame();
        },
        
        /**
         * 停止跟踪
         */
        _stopTracking: function() {
            this.isRunning = false;
            this._isGestureMode = false;  // 禁用手势控制模式
            this.startStopBtn.textContent = '开始跟踪';
            this._updateStatus('已停止跟踪');
            
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            
            // 注意：不清除圆形，让它们保持显示（即使程序最小化）
        },
        
        /**
         * 处理视频帧（优化性能版本）
         */
        _processFrame: async function() {
            if (!this.isRunning) return;
            
            const startTime = performance.now();
            
            try {
                // 检查视频是否准备好
                if (!this.video || 
                    !this.video.videoWidth || 
                    !this.video.videoHeight || 
                    this.video.videoWidth === 0 || 
                    this.video.videoHeight === 0 ||
                    this.video.readyState < 2) {  // HAVE_CURRENT_DATA = 2
                    // 视频未准备好，等待下一帧
                    this.animationFrameId = requestAnimationFrame(() => this._processFrame());
                    return;
                }
                
                // 优化：只在 tracking 页面绘制 video 到 canvas
                // interactive 页面由 Three.js 接管，不需要 background canvas
                if (this.currentPage === 'tracking') {
                    this.ctx.save();
                    this.ctx.translate(this.canvas.width, 0);
                    this.ctx.scale(-1, 1);
                    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
                    this.ctx.restore();
                }
                
                // 检测手部（使用video元素，MediaPipe会自动处理镜像）
                // 优化：只在需要时进行检测
                let results = null;
                // interactive 模式下降低检测频率到每 100ms 一次 (原 200ms 可能太慢影响交互，改为 100ms 平衡)
                const needsHandDetection = this.currentPage === 'tracking' || 
                                         (this.currentPage === 'interactive' && (!this._lastGestureCheck || (Date.now() - this._lastGestureCheck) > 100));
                
                if (needsHandDetection) {
                    // 再次检查视频尺寸（防止在处理过程中视频尺寸变为0）
                    if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                        try {
                            // 使用异步处理，避免阻塞主线程
                            results = await Promise.resolve().then(() => {
                                return this.handLandmarker.detect(this.video);
                            });
                        } catch (detectError) {
                            // 如果检测失败，记录错误但不中断流程
                            if (detectError.message && !detectError.message.includes('ROI width and height must be > 0')) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('HANDTRACKER', '手部检测失败', detectError);
                                }
                            }
                            results = null;
                        }
                    } else {
                        // 视频尺寸无效，使用上次的结果
                        results = this.lastResults;
                    }
                } else {
                    // 使用上次的结果
                    results = this.lastResults;
                }
                
                // 检测手势（降低频率，只在需要时检测）
                let gestureResults = null;
                if (this.gestureRecognizer && results && results.landmarks && results.landmarks.length > 0) {
                    // 检查视频是否仍然有效
                    if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                        // 优化：手势检测频率与手部检测保持一致
                        if (needsHandDetection) {
                            try {
                                gestureResults = await this.gestureRecognizer.recognize(this.video);
                            } catch (error) {
                                // 忽略 ROI 错误，这是 MediaPipe 的内部错误
                                if (error.message && !error.message.includes('ROI width and height must be > 0')) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('HANDTRACKER', '手势识别失败', error);
                                    }
                                }
                            }
                        }
                    }
                }
                
                // 检测面部（降低频率，每 500ms 检测一次，仅在 tracking 页面）
                let faceResults = null;
                if (this.faceLandmarker && this.currentPage === 'tracking' && (!this._lastFaceCheck || (Date.now() - this._lastFaceCheck) > 500)) {
                    // 检查视频是否仍然有效
                    if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                        try {
                            faceResults = await this.faceLandmarker.detect(this.video);
                            this._lastFaceCheck = Date.now();
                        } catch (error) {
                            // 忽略 ROI 错误
                            if (error.message && !error.message.includes('ROI width and height must be > 0')) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('HANDTRACKER', '面部识别失败', error);
                                }
                            }
                        }
                    } else {
                        faceResults = this.lastFaceResults;
                    }
                } else {
                    faceResults = this.lastFaceResults;
                }
                
                // 根据当前页面绘制结果或更新交互
                if (this.currentPage === 'tracking') {
                    // 绘制结果（需要镜像坐标）
                    this._drawResults(results, gestureResults, faceResults);
                    // 处理跟踪页面的手势交互（立方体控制）
                    if (needsHandDetection && results) {
                        this._handleTrackingGesture(results, gestureResults);
                        this._lastGestureCheck = Date.now();
                    }
                } else if (this.currentPage === 'interactive') {
                    // 交互页面：检测手势并控制粒子流
                    if (needsHandDetection && results) {
                        this._handleInteractiveGesture(gestureResults, results);
                        this._lastGestureCheck = Date.now();
                    }
                }
                
                // 更新信息（降低更新频率以提高性能，500ms 更新一次 UI）
                const processingTime = performance.now() - startTime;
                if (!this._lastUpdateTime || (Date.now() - this._lastUpdateTime) > 500) {
                    this._updateInfo(results, gestureResults, faceResults, processingTime);
                    this._lastUpdateTime = Date.now();
                }
                
                this.lastResults = results;
                this.lastGestureResults = gestureResults;
                this.lastFaceResults = faceResults;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('HANDTRACKER', '处理帧失败', error);
                }
            }
            
            // 性能优化：动态调整帧率
            // 如果处于 interactive 页面，由于有 Three.js 循环，这里可以适当降低频率
            // 如果处于 tracking 页面，需要较高帧率保证流畅
            
            if (this.currentPage === 'interactive') {
                 // 交互模式下，_processFrame 主要负责检测，绘制由 Three.js 负责
                 // 限制检测频率在 30fps 左右即可，给 Three.js 留出更多 GPU 时间
                 setTimeout(() => {
                     if (this.isRunning) this.animationFrameId = requestAnimationFrame(() => this._processFrame());
                 }, 30);
            } else {
                // Tracking 模式全力渲染
                this.animationFrameId = requestAnimationFrame(() => this._processFrame());
            }
        },
        
        /**
         * 使用多线程处理（实验性）
         */
        _processWithMultithreading: async function(imageData) {
            // 注意：MediaPipe的HandLandmarker需要在主线程中使用
            // 这里我们只是演示多线程API的使用，实际处理仍在主线程
            // 可以将图像预处理等操作放到多线程中
            
            // 直接在主线程处理（因为MediaPipe需要访问DOM和GPU）
            return await this.handLandmarker.detect(this.video);
        },
        
        /**
         * 绘制检测结果
         */
        _drawResults: function(results, gestureResults, faceResults) {
            // 绘制手部
            if (results && results.landmarks && results.landmarks.length > 0) {
                // 获取手势信息（如果有）
                const gestures = gestureResults && gestureResults.gestures ? gestureResults.gestures : [];
                
                // 绘制每个检测到的手
                for (let i = 0; i < results.landmarks.length; i++) {
                    const landmarks = results.landmarks[i];
                    const gesture = gestures[i] && gestures[i].length > 0 ? gestures[i][0] : null;
                    this._drawHand(landmarks, gesture);
                }
            }
            
            // 绘制面部
            if (faceResults && faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
                for (let i = 0; i < faceResults.faceLandmarks.length; i++) {
                    const faceLandmarks = faceResults.faceLandmarks[i];
                    this._drawFace(faceLandmarks);
                }
            }
        },
        
        /**
         * 绘制单只手
         */
        _drawHand: function(landmarks, gesture) {
            if (!landmarks || landmarks.length === 0) return;
            
            const ctx = this.ctx;
            const canvas = this.canvas;
            
            // 保存上下文状态
            ctx.save();
            
            // 水平镜像绘制（因为video已经镜像，所以关键点坐标也需要镜像）
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            
            // 手部连接点定义（MediaPipe Hand Landmarks）
            // 根据MediaPipe Hand Landmark模型，21个关键点
            const connections = [
                // 拇指
                [0, 1], [1, 2], [2, 3], [3, 4],
                // 食指
                [0, 5], [5, 6], [6, 7], [7, 8],
                // 中指
                [5, 9], [9, 10], [10, 11], [11, 12],
                // 无名指
                [9, 13], [13, 14], [14, 15], [15, 16],
                // 小指
                [13, 17], [17, 18], [18, 19], [19, 20],
                // 手掌连接
                [0, 17]
            ];
            
            // 手指分组（用于不同颜色）
            const fingerGroups = {
                thumb: [[0, 1], [1, 2], [2, 3], [3, 4]],
                index: [[0, 5], [5, 6], [6, 7], [7, 8]],
                middle: [[5, 9], [9, 10], [10, 11], [11, 12]],
                ring: [[9, 13], [13, 14], [14, 15], [15, 16]],
                pinky: [[13, 17], [17, 18], [18, 19], [19, 20]],
                palm: [[0, 17]]
            };
            
            const colors = {
                thumb: '#ff6b6b',
                index: '#4ecdc4',
                middle: '#45b7d1',
                ring: '#f9ca24',
                pinky: '#6c5ce7',
                palm: '#a29bfe'
            };
            
            // 绘制连接线（按手指分组，使用不同颜色）
            for (const [groupName, groupConnections] of Object.entries(fingerGroups)) {
                ctx.strokeStyle = colors[groupName];
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                
                for (const [start, end] of groupConnections) {
                    if (landmarks[start] && landmarks[end]) {
                        const startPoint = landmarks[start];
                        const endPoint = landmarks[end];
                        
                        // 坐标已经镜像，直接使用
                        const x1 = startPoint.x * canvas.width;
                        const y1 = startPoint.y * canvas.height;
                        const x2 = endPoint.x * canvas.width;
                        const y2 = endPoint.y * canvas.height;
                        
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                    }
                }
                
                ctx.stroke();
            }
            
            // 绘制关键点（使用渐变效果）
            for (let i = 0; i < landmarks.length; i++) {
                const landmark = landmarks[i];
                const x = landmark.x * canvas.width;
                const y = landmark.y * canvas.height;
                
                // 根据关键点类型选择颜色
                let color = '#ffffff';
                if (i === 0) color = '#ff6b6b';  // 手腕
                else if (i >= 1 && i <= 4) color = '#ff6b6b';  // 拇指
                else if (i >= 5 && i <= 8) color = '#4ecdc4';  // 食指
                else if (i >= 9 && i <= 12) color = '#45b7d1';  // 中指
                else if (i >= 13 && i <= 16) color = '#f9ca24';  // 无名指
                else if (i >= 17 && i <= 20) color = '#6c5ce7';  // 小指
                
                // 绘制外圈（发光效果）
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, 2 * Math.PI);
                ctx.fill();
                
                // 绘制内圈（实心点）
                ctx.globalAlpha = 1.0;
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, 2 * Math.PI);
                ctx.fill();
                
                // 绘制中心点
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // 绘制手势标签（如果有）
            if (gesture && gesture.categoryName) {
                const wrist = landmarks[0];
                // 标签坐标（已经在镜像坐标系中）
                const labelX = wrist.x * canvas.width;
                const labelY = wrist.y * canvas.height - 30;
                const confidence = gesture.score ? (gesture.score * 100).toFixed(1) : '0';
                const labelText = `${gesture.categoryName} (${confidence}%)`;
                
                // 绘制背景框（在镜像坐标系中）
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.font = 'bold 16px Arial';
                const textMetrics = ctx.measureText(labelText);
                const padding = 8;
                ctx.fillRect(
                    labelX - textMetrics.width / 2 - padding,
                    labelY - 20,
                    textMetrics.width + padding * 2,
                    24
                );
                
                // 绘制文字（需要再次镜像文字以正确显示）
                ctx.scale(-1, 1);  // 再次镜像以正确显示文字
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, -labelX, labelY - 8);
                ctx.textAlign = 'left';  // 恢复默认对齐
                ctx.scale(-1, 1);  // 恢复镜像
            }
            
            ctx.globalAlpha = 1.0;  // 恢复透明度
            ctx.restore();  // 恢复上下文状态
        },
        
        /**
         * 绘制面部骨架
         */
        _drawFace: function(faceLandmarks) {
            if (!faceLandmarks || faceLandmarks.length === 0) return;
            
            const ctx = this.ctx;
            const canvas = this.canvas;
            
            // 保存上下文状态
            ctx.save();
            
            // 水平镜像绘制（因为video已经镜像，所以关键点坐标也需要镜像）
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            
            // MediaPipe Face Landmarks 有 468 个关键点
            // 定义面部轮廓连接（简化版，只绘制主要特征）
            const faceConnections = [
                // 面部轮廓（外圈）
                [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389], [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397], [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152], [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172], [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162], [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10],
                // 左眉毛
                [107, 55], [55, 65], [65, 52], [52, 53], [53, 46],
                // 右眉毛
                [336, 296], [296, 334], [334, 293], [293, 300], [300, 276],
                // 左眼
                [33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154], [154, 155], [155, 133], [133, 173], [173, 157], [157, 158], [158, 159], [159, 160], [160, 161], [161, 246], [246, 33],
                // 右眼
                [263, 249], [249, 390], [390, 373], [373, 374], [374, 380], [380, 381], [381, 382], [382, 362], [362, 398], [398, 384], [384, 385], [385, 386], [386, 387], [387, 388], [388, 466], [466, 263],
                // 鼻子
                [1, 2], [2, 5], [5, 4], [4, 6], [6, 19], [19, 20], [20, 94], [94, 2],
                [168, 8], [8, 9], [9, 10], [10, 151], [151, 337], [337, 299], [299, 333], [333, 298], [298, 301], [301, 168],
                // 嘴巴外圈
                [61, 146], [146, 91], [91, 181], [181, 84], [84, 17], [17, 314], [314, 405], [405, 320], [320, 307], [307, 375], [375, 321], [321, 308], [308, 324], [324, 318], [318, 61],
                // 嘴巴内圈
                [78, 95], [95, 88], [88, 178], [178, 87], [87, 14], [14, 317], [317, 402], [402, 318], [318, 324], [324, 308], [308, 78]
            ];
            
            // 绘制面部连接线
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            for (const [start, end] of faceConnections) {
                if (faceLandmarks[start] && faceLandmarks[end]) {
                    const startPoint = faceLandmarks[start];
                    const endPoint = faceLandmarks[end];
                    
                    const x1 = startPoint.x * canvas.width;
                    const y1 = startPoint.y * canvas.height;
                    const x2 = endPoint.x * canvas.width;
                    const y2 = endPoint.y * canvas.height;
                    
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            }
            
            // 绘制关键点（只绘制重要特征点）
            const importantPoints = [
                // 眼睛关键点
                33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,  // 左眼
                263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,  // 右眼
                // 鼻子关键点
                1, 2, 5, 4, 6, 19, 20, 94, 168, 8, 9, 10, 151, 337, 299, 333, 298, 301,
                // 嘴巴关键点
                61, 146, 91, 181, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318,
                78, 95, 88, 178, 87, 14, 317, 402
            ];
            
            for (const pointIndex of importantPoints) {
                if (faceLandmarks[pointIndex]) {
                    const landmark = faceLandmarks[pointIndex];
                    const x = landmark.x * canvas.width;
                    const y = landmark.y * canvas.height;
                    
                    // 绘制关键点
                    ctx.fillStyle = '#00ff88';
                    ctx.globalAlpha = 0.8;
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
            
            ctx.globalAlpha = 1.0;  // 恢复透明度
            ctx.restore();  // 恢复上下文状态
        },
        
        /**
         * 更新信息显示
         */
        _updateInfo: function(results, gestureResults, faceResults, processingTime) {
            // 更新手部数量
            const handCount = results && results.landmarks ? results.landmarks.length : 0;
            if (this.handCountDisplay) {
                this.handCountDisplay.textContent = handCount;
            }
            
            // 更新面部数量
            const faceCount = faceResults && faceResults.faceLandmarks ? faceResults.faceLandmarks.length : 0;
            if (this.faceCountDisplay) {
                this.faceCountDisplay.textContent = faceCount;
            }
            
            // 更新手势信息
            if (this.gestureDisplay) {
                if (gestureResults && gestureResults.gestures && gestureResults.gestures.length > 0) {
                    // 获取所有检测到的手势
                    const gestureNames = [];
                    for (const handGestures of gestureResults.gestures) {
                        if (handGestures && handGestures.length > 0) {
                            const topGesture = handGestures[0];
                            if (topGesture && topGesture.categoryName) {
                                const confidence = topGesture.score ? (topGesture.score * 100).toFixed(0) : '0';
                                gestureNames.push(`${topGesture.categoryName} (${confidence}%)`);
                            }
                        }
                    }
                    this.gestureDisplay.textContent = gestureNames.length > 0 ? gestureNames.join(', ') : '无';
                } else {
                    this.gestureDisplay.textContent = '无';
                }
            }
            
            // 计算FPS
            const fps = processingTime > 0 ? Math.round(1000 / processingTime) : 0;
            if (this.fpsDisplay) {
                this.fpsDisplay.textContent = fps;
            }
        },
        
        /**
         * 更新状态显示（清除错误状态）
         */
        _updateStatus: function(text) {
            if (this.statusDisplay) {
                this.statusDisplay.textContent = text;
                this.statusDisplay.classList.remove('error');
            }
        },
        
        /**
         * 显示错误信息
         * @param {string} message 错误消息
         * @param {boolean} showRetry 是否显示重试按钮（对于可恢复的错误）
         * @param {boolean} showDiagnose 是否显示诊断按钮
         */
        _showError: function(message, showRetry = false, showDiagnose = false) {
            if (this.statusDisplay) {
                // 清除之前可能存在的按钮
                const toolbar = this.statusDisplay.parentElement;
                if (toolbar) {
                    const existingRetryBtn = toolbar.querySelector('.handtracker-retry-btn');
                    if (existingRetryBtn) {
                        existingRetryBtn.remove();
                    }
                    const existingDiagnoseBtn = toolbar.querySelector('.handtracker-diagnose-btn');
                    if (existingDiagnoseBtn) {
                        existingDiagnoseBtn.remove();
                    }
                }
                
                this.statusDisplay.textContent = '错误: ' + message;
                this.statusDisplay.classList.add('error');
                
                // 如果需要显示重试按钮
                if (showRetry && toolbar) {
                    const retryBtn = document.createElement('button');
                    retryBtn.className = 'handtracker-retry-btn handtracker-btn';
                    retryBtn.textContent = '重试';
                    retryBtn.style.marginLeft = '10px';
                    retryBtn.style.padding = '4px 12px';
                    retryBtn.style.fontSize = '12px';
                    retryBtn.onclick = () => this._retryCamera();
                    toolbar.appendChild(retryBtn);
                }
                
                // 如果需要显示诊断按钮
                if (showDiagnose && toolbar) {
                    const diagnoseBtn = document.createElement('button');
                    diagnoseBtn.className = 'handtracker-diagnose-btn handtracker-btn';
                    diagnoseBtn.textContent = '诊断';
                    diagnoseBtn.style.marginLeft = '10px';
                    diagnoseBtn.style.padding = '4px 12px';
                    diagnoseBtn.style.fontSize = '12px';
                    diagnoseBtn.onclick = async () => {
                        this._updateStatus('正在诊断...');
                        const diagnosis = await this._diagnoseCamera();
                        this._showDiagnosisResult(diagnosis);
                    };
                    toolbar.appendChild(diagnoseBtn);
                }
            }
        },
        
        /**
         * 显示诊断结果
         * @param {Object} diagnosis 诊断信息
         */
        _showDiagnosisResult: function(diagnosis) {
            let message = '诊断结果:\n';
            message += `- 浏览器支持: ${diagnosis.browserSupport ? '是' : '否'}\n`;
            message += `- MediaDevices API: ${diagnosis.mediaDevicesSupport ? '支持' : '不支持'}\n`;
            message += `- 权限状态: ${diagnosis.permissionStatus}\n`;
            message += `- 系统可用摄像头设备: ${diagnosis.deviceCount} 个（包括物理和虚拟设备）\n`;
            message += `- 当前程序摄像头流: ${diagnosis.currentStreamActive ? `活动 (${diagnosis.currentStreamTracks} 个轨道)` : '未活动'}\n`;
            
            if (diagnosis.deviceList.length > 0) {
                message += '\n系统检测到的所有可用摄像头设备:\n';
                message += '（注意：这包括所有物理摄像头和虚拟摄像头，不仅仅是当前程序使用的）\n';
                diagnosis.deviceList.forEach((device, index) => {
                    message += `  ${index + 1}. ${device.label}\n`;
                });
            }
            
            if (diagnosis.errors.length > 0) {
                message += '\n错误信息:\n';
                diagnosis.errors.forEach(error => {
                    message += `  - ${error}\n`;
                });
            }
            
            // 输出诊断结果到日志
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('HANDTRACKER', '摄像头诊断结果', { 
                    deviceCount: diagnosis.deviceCount,
                    currentStreamActive: diagnosis.currentStreamActive,
                    permissionStatus: diagnosis.permissionStatus,
                    deviceList: diagnosis.deviceList
                });
            }
            
            // 显示在状态栏（说明这是系统检测到的所有可用设备）
            let statusText = '';
            if (diagnosis.deviceCount > 0) {
                statusText = `诊断完成: 系统检测到 ${diagnosis.deviceCount} 个可用摄像头设备`;
                if (diagnosis.currentStreamActive) {
                    statusText += `, 当前程序正在使用 ${diagnosis.currentStreamTracks} 个摄像头`;
                } else {
                    statusText += `, 但无法启动（可能被占用）`;
                }
                statusText += `, 权限: ${diagnosis.permissionStatus}`;
            } else {
                statusText = `诊断完成: 未检测到摄像头设备, 权限: ${diagnosis.permissionStatus}`;
            }
            this._updateStatus(statusText);
            
            // 如果检测到问题，提供建议
            if (diagnosis.deviceCount === 0) {
                this._showError('未检测到摄像头设备，请检查硬件连接', true, false);
            } else if (diagnosis.permissionStatus === 'denied') {
                this._showError('摄像头权限被拒绝，请在浏览器设置中允许', true, false);
            } else if (diagnosis.errors.length > 0) {
                this._showError('检测到问题，请查看控制台获取详细信息', true, false);
            }
        },
        
        /**
         * 重试启动摄像头
         */
        _retryCamera: async function() {
            // 清理之前的流（如果存在）
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            
            // 重置视频元素
            if (this.video) {
                this.video.srcObject = null;
            }
            
            // 重新启动摄像头
            try {
                await this._startCamera();
            } catch (error) {
                // 错误已经在 _startCamera 中处理
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('HANDTRACKER', '重试启动摄像头失败', error);
                }
            }
        },
        
        /**
         * 程序退出
         */
        __exit__: async function() {
            // 清理事件处理器
            if (this._resizeHandlerId && typeof EventManager !== 'undefined') {
                EventManager.unregisterEventHandler(this._resizeHandlerId);
                this._resizeHandlerId = null;
            }
            if (this._trackingResizeHandlerId && typeof EventManager !== 'undefined') {
                EventManager.unregisterEventHandler(this._trackingResizeHandlerId);
                this._trackingResizeHandlerId = null;
            }
            
            // 清理所有事件处理器（通过 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.unregisterAllHandlersForPid(this.pid);
            }
            
            // 停止跟踪
            this._stopTracking();
            
            // 停止摄像头流
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            
            // 恢复原始 console 方法
            this._restoreConsole();
            
            // 清理MediaPipe资源
            if (this.handLandmarker) {
                try {
                    this.handLandmarker.close();
                } catch (e) {
                    if (this._originalConsoleWarn) {
                        this._originalConsoleWarn('[HandTracker] 清理MediaPipe资源失败:', e);
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('HANDTRACKER', '清理MediaPipe资源失败', e);
                        }
                    }
                }
                this.handLandmarker = null;
            }
            
            if (this.gestureRecognizer) {
                try {
                    this.gestureRecognizer.close();
                } catch (e) {
                    if (this._originalConsoleWarn) {
                        this._originalConsoleWarn('[HandTracker] 清理MediaPipe资源失败:', e);
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('HANDTRACKER', '清理MediaPipe资源失败', e);
                        }
                    }
                }
                this.gestureRecognizer = null;
            }
            
            if (this.faceLandmarker) {
                try {
                    this.faceLandmarker.close();
                } catch (e) {
                    if (this._originalConsoleWarn) {
                        this._originalConsoleWarn('[HandTracker] 清理MediaPipe资源失败:', e);
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('HANDTRACKER', '清理MediaPipe资源失败', e);
                        }
                    }
                }
                this.faceLandmarker = null;
            }
            
            // 清理 Three.js 资源
            if (this._threeAnimationFrameId) {
                cancelAnimationFrame(this._threeAnimationFrameId);
                this._threeAnimationFrameId = null;
            }
            if (this.threeRenderer) {
                try {
                    this.threeRenderer.setAnimationLoop(null);
                    if (this.threeRenderer.domElement && this.threeRenderer.domElement.parentNode) {
                        this.threeRenderer.domElement.parentNode.removeChild(this.threeRenderer.domElement);
                    }
                    this.threeRenderer.dispose();
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('HANDTRACKER', '清理Three.js资源失败', e);
                    }
                }
                this.threeRenderer = null;
            }
            
            // 清理所有粒子组
            this._cleanupAllParticleGroups();
            
            // 清理旧的粒子系统（向后兼容）
            if (this.particles) {
                try {
                    if (this.particles.geometry) {
                        this.particles.geometry.dispose();
                    }
                    if (this.particles.material) {
                        this.particles.material.dispose();
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('HANDTRACKER', '清理粒子系统失败', e);
                    }
                }
                this.particles = null;
            }
            
            this.threeScene = null;
            this.threeCamera = null;
            this.heartShape = null;
            
            // 移除窗口大小监听
            if (this._resizeHandler) {
                window.removeEventListener('resize', this._resizeHandler);
                this._resizeHandler = null;
            }
            
            // 注销窗口
            if (typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
        },
        
        _particleWorker: null, // Web Worker 实例
        
        /**
         * 初始化 Web Worker
         */
        _initWorker: function() {
            if (this._particleWorker) return;
            
            const workerCode = `
                self.particleGroups = {};
                
                // 原子模型参数
                const ATOM_CONFIG = {
                    coreRadius: 0.15,       // 原子核半径（缩小）
                    minOrbitRadius: 0.3,    // 最小轨道半径（收缩状态，缩小）
                    maxOrbitRadius: 2.5,    // 最大轨道半径（扩展状态，缩小）
                    orbitLayers: 3,         // 轨道层数
                    rotationSpeed: 0.01,    // 基础旋转速度
                    boundary: 3.0           // 可见范围边界（缩小，确保粒子不超出）
                };

                self.onmessage = function(e) {
                    const { type, data } = e.data;
                    
                    if (type === 'createGroup') {
                        const { id, particleCount, handOffsetX } = data;
                        initGroup(id, particleCount, handOffsetX);
                    } else if (type === 'update') {
                        const { groupsData, time } = data;
                        updatePhysics(groupsData, time);
                    } else if (type === 'destroyGroup') {
                         delete self.particleGroups[data.id];
                    }
                };
                
                function initGroup(id, count, offsetX) {
                    const positions = new Float32Array(count * 3);
                    const colors = new Float32Array(count * 3);
                    const velocities = new Float32Array(count * 3);
                    const baseState = new Float32Array(count * 5); // x, y, z, orbitRadius, angle
                    
                    // 将粒子分配到不同的轨道层
                    const particlesPerLayer = Math.floor(count / ATOM_CONFIG.orbitLayers);
                    
                    for(let i=0; i<count; i++) {
                        const i3 = i * 3;
                        const i5 = i * 5;
                        
                        // 确定轨道层 (0 到 orbitLayers-1)
                        const layer = Math.min(Math.floor(i / particlesPerLayer), ATOM_CONFIG.orbitLayers - 1);
                        const layerProgress = (i % particlesPerLayer) / particlesPerLayer;
                        
                        // 轨道半径（从内到外递增）
                        const baseOrbitRadius = ATOM_CONFIG.minOrbitRadius + 
                            (ATOM_CONFIG.maxOrbitRadius - ATOM_CONFIG.minOrbitRadius) * 
                            (layer / (ATOM_CONFIG.orbitLayers - 1));
                        
                        // 在轨道上的角度（均匀分布，水平镜像：角度取反）
                        const angle = -(layerProgress * Math.PI * 2 + (layer * Math.PI / ATOM_CONFIG.orbitLayers));
                        
                        // 初始位置（扩展状态，水平镜像：X坐标取反）
                        const bx = -Math.cos(angle) * baseOrbitRadius; // X坐标取反实现水平镜像
                        const by = Math.sin(angle) * baseOrbitRadius;
                        const bz = (Math.random() - 0.5) * 0.2; // 轻微的Z轴偏移（缩小）
                        
                        // 存储基础状态
                        baseState[i5] = 0; // 中心X（相对）
                        baseState[i5+1] = 0; // 中心Y
                        baseState[i5+2] = bz; // Z轴偏移
                        baseState[i5+3] = baseOrbitRadius; // 目标轨道半径
                        baseState[i5+4] = angle; // 初始角度（已镜像）
                        
                        positions[i3] = bx + offsetX;
                        positions[i3+1] = by;
                        positions[i3+2] = bz;
                        
                        // 原子配色：根据轨道层设置颜色
                        // 内层：亮白/蓝，外层：深蓝/紫
                        const layerT = layer / (ATOM_CONFIG.orbitLayers - 1);
                        if (layerT < 0.33) {
                            // 内层：亮白/蓝
                            colors[i3] = 0.8; colors[i3+1] = 0.9; colors[i3+2] = 1.0;
                        } else if (layerT < 0.66) {
                            // 中层：青蓝
                            colors[i3] = 0.2; colors[i3+1] = 0.6; colors[i3+2] = 1.0;
                        } else {
                            // 外层：深蓝/紫
                            colors[i3] = 0.3; colors[i3+1] = 0.1; colors[i3+2] = 0.8;
                        }
                        
                        // 初始速度（轨道速度，水平镜像：X速度取反）
                        const orbitalSpeed = ATOM_CONFIG.rotationSpeed * (1.0 / (layer + 1));
                        velocities[i3] = Math.sin(angle) * orbitalSpeed; // X速度取反
                        velocities[i3+1] = Math.cos(angle) * orbitalSpeed;
                        velocities[i3+2] = 0;
                    }
                    
                    self.particleGroups[id] = {
                        positions, colors, velocities, baseState,
                        count, offsetX, currentScale: 1.0 // 当前缩放（1.0 = 扩展，0.0 = 收缩）
                    };
                }
                
                function updatePhysics(groupsData, time) {
                    const result = {};
                    
                    for (const gData of groupsData) {
                        const group = self.particleGroups[gData.id];
                        if (!group) continue;
                        
                        // 确保数据有效
                        const mode = gData.mode || 'SCATTER';
                        const targetPoint = gData.targetPoint || null;
                        const fistDegree = gData.fistDegree || 0;
                        const handOffsetX = gData.handOffsetX || 0;
                        
                        // 调试日志（仅在非默认状态时输出）
                        // 注意：Worker 代码中不能使用 KernelLogger，因为这是字符串代码
                        // 如果需要调试，可以通过 postMessage 发送消息到主线程
                        
                        const { positions, velocities, baseState, count, colors } = group;
                        
                        // 更新偏移 (如果手部移动)
                        group.offsetX = handOffsetX;
                        
                        let targetX = 0, targetY = 0, targetZ = 0;
                        if (targetPoint) {
                            targetX = targetPoint.x * 10 - 5 + group.offsetX;
                            targetY = -(targetPoint.y * 10 - 5);
                        }
                        
                        // 根据握拳程度计算缩放（0 = 完全收缩，1 = 完全扩展）
                        // 握拳时收缩，张开时扩展
                        // 降低敏感度：只有握拳程度超过阈值才收缩
                        const effectiveFistDegree = Math.max(0, (fistDegree - 0.3) / 0.7); // 0.3以下不响应
                        const targetScale = 1.0 - effectiveFistDegree * 0.6; // 握拳时最多收缩到 40%
                        if (!group.currentScale) group.currentScale = 1.0;
                        // 更平滑的过渡，降低响应速度
                        group.currentScale = group.currentScale * 0.92 + targetScale * 0.08;
                        
                        for (let i = 0; i < count; i++) {
                            const i3 = i * 3;
                            const i5 = i * 5;
                            
                            let px = positions[i3];
                            let py = positions[i3+1];
                            let pz = positions[i3+2];
                            let vx = velocities[i3];
                            let vy = velocities[i3+1];
                            let vz = velocities[i3+2];
                            
                            // --- 原子模型物理 ---
                            
                            // 计算相对中心的距离
                            const dx = px - group.offsetX;
                            const dy = py;
                            const dz = pz;
                            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                            
                            // 目标轨道半径（根据缩放调整）
                            const baseOrbitRadius = baseState[i5+3];
                            const targetOrbitRadius = ATOM_CONFIG.minOrbitRadius + 
                                (baseOrbitRadius - ATOM_CONFIG.minOrbitRadius) * group.currentScale;
                            
                            // 目标角度（持续旋转）
                            // 降低旋转速度对握拳程度的敏感度
                            const baseAngle = baseState[i5+4];
                            const rotationSpeed = ATOM_CONFIG.rotationSpeed * (1.0 + effectiveFistDegree * 1.0); // 降低倍数
                            const currentAngle = baseAngle + time * rotationSpeed;
                            
                            // 目标位置（理想轨道位置，水平镜像：X坐标取反）
                            const targetPX = group.offsetX - Math.cos(currentAngle) * targetOrbitRadius; // X坐标取反
                            const targetPY = Math.sin(currentAngle) * targetOrbitRadius;
                            const targetPZ = baseState[i5+2]; // 保持Z轴偏移
                            
                            // 轨道力：拉向目标轨道位置
                            const dTargetX = targetPX - px;
                            const dTargetY = targetPY - py;
                            const dTargetZ = targetPZ - pz;
                            const dTarget = Math.sqrt(dTargetX*dTargetX + dTargetY*dTargetY + dTargetZ*dTargetZ);
                            
                            if (dTarget > 0.01) {
                                // 轨道恢复力（弹簧力）- 降低强度，减少抖动
                                const springForce = 0.04; // 降低一半
                                vx += (dTargetX / dTarget) * springForce * dTarget;
                                vy += (dTargetY / dTarget) * springForce * dTarget;
                                vz += (dTargetZ / dTarget) * springForce * dTarget;
                            }
                            
                            // 切向速度（维持轨道旋转，水平镜像：X速度取反）
                            const currentAngleFromCenter = Math.atan2(dy, dx);
                            const tangentialSpeed = targetOrbitRadius * rotationSpeed;
                            const idealVx = Math.sin(currentAngleFromCenter) * tangentialSpeed; // X速度取反
                            const idealVy = Math.cos(currentAngleFromCenter) * tangentialSpeed;
                            
                            // 切向力修正 - 降低频率，减少抖动
                            const tangentialCorrection = 0.05; // 降低一半
                            vx += (idealVx - vx) * tangentialCorrection;
                            vy += (idealVy - vy) * tangentialCorrection;
                            
                            // 向心力（防止粒子飞离）- 降低强度
                            if (dist > targetOrbitRadius * 1.3) { // 提高阈值
                                const centripetalForce = 0.03; // 降低强度
                                vx -= (dx / dist) * centripetalForce;
                                vy -= (dy / dist) * centripetalForce;
                            }
                            
                            // --- 交互物理叠加 ---
                            
                            if (mode === 'HEART' || effectiveFistDegree > 0.2) {
                                // 收缩模式：增强向心力（降低敏感度）
                                const intensity = Math.max(effectiveFistDegree, 0.3);
                                
                                // 强力向心（降低强度）
                                if (dist > 0.01) {
                                    const suckForce = 0.05 * intensity / (dist + 0.2); // 降低强度
                                    vx -= (dx / dist) * suckForce;
                                    vy -= (dy / dist) * suckForce;
                                    vz -= (dz / dist) * suckForce * 0.3;
                                }
                                
                                // 颜色：高能红/白（收缩时变亮，更平滑的过渡）
                                const energy = Math.min(1.2, 0.8 / (dist + 0.3));
                                colors[i3] += (Math.min(1, energy * 0.9) - colors[i3]) * 0.1;
                                colors[i3+1] += (Math.min(1, energy * 0.6) - colors[i3+1]) * 0.1;
                                colors[i3+2] += (Math.min(1, energy * 0.3) - colors[i3+2]) * 0.1;

                            } else if (mode === 'ATTRACT' && targetPoint) {
                                // 吸引模式：粒子被吸引到目标点
                                const dTargetX = targetX - px;
                                const dTargetY = targetY - py;
                                const dTargetZ = targetZ - pz;
                                const dTarget = Math.sqrt(dTargetX*dTargetX + dTargetY*dTargetY + dTargetZ*dTargetZ);
                                
                                if (dTarget > 0.1) {
                                    const force = 0.2 / (dTarget + 0.1);
                                    vx += (dTargetX / dTarget) * force;
                                    vy += (dTargetY / dTarget) * force;
                                    vz += (dTargetZ / dTarget) * force;
                                    
                                    // 颜色：高能青色
                                    colors[i3] = 0.0;
                                    colors[i3+1] = 0.8;
                                    colors[i3+2] = 1.0;
                                }

                            } else if (mode === 'REPEL' && targetPoint) {
                                // 排斥模式：粒子被排斥
                                const dTargetX = px - targetX;
                                const dTargetY = py - targetY;
                                const d2 = dTargetX*dTargetX + dTargetY*dTargetY;
                                
                                if (d2 < 20) {
                                    const force = 0.8 / (d2 + 0.5);
                                    vx += dTargetX * force;
                                    vy += dTargetY * force;
                                    
                                    // 颜色：金色
                                    colors[i3] = 1.0;
                                    colors[i3+1] = 0.8;
                                    colors[i3+2] = 0.2;
                                }
                            } else {
                                // 默认状态：根据轨道层恢复颜色
                                const baseOrbitRadius = baseState[i5+3];
                                const layerT = (baseOrbitRadius - ATOM_CONFIG.minOrbitRadius) / 
                                    (ATOM_CONFIG.maxOrbitRadius - ATOM_CONFIG.minOrbitRadius);
                                let tr, tg, tb;
                                if (layerT < 0.33) {
                                    tr=0.8; tg=0.9; tb=1.0;
                                } else if (layerT < 0.66) {
                                    tr=0.2; tg=0.6; tb=1.0;
                                } else {
                                    tr=0.3; tg=0.1; tb=0.8;
                                }
                                
                                colors[i3] += (tr - colors[i3]) * 0.1;
                                colors[i3+1] += (tg - colors[i3+1]) * 0.1;
                                colors[i3+2] += (tb - colors[i3+2]) * 0.1;
                            }
                            
                            // 边界限制：确保粒子不超出可见范围（更柔和的边界）
                            const boundary = ATOM_CONFIG.boundary;
                            const softBoundary = boundary * 0.95; // 软边界，提前减速
                            
                            if (Math.abs(px - group.offsetX) > softBoundary) {
                                const excess = Math.abs(px - group.offsetX) - softBoundary;
                                const direction = Math.sign(px - group.offsetX);
                                // 软边界：逐渐减速，而不是硬反弹
                                vx -= direction * excess * 0.1;
                                if (Math.abs(px - group.offsetX) > boundary) {
                                    px = group.offsetX + direction * boundary;
                                    vx *= -0.3; // 降低反弹强度
                                }
                            }
                            if (Math.abs(py) > softBoundary) {
                                const excess = Math.abs(py) - softBoundary;
                                const direction = Math.sign(py);
                                vy -= direction * excess * 0.1;
                                if (Math.abs(py) > boundary) {
                                    py = direction * boundary;
                                    vy *= -0.3;
                                }
                            }
                            if (Math.abs(pz) > softBoundary) {
                                const excess = Math.abs(pz) - softBoundary;
                                const direction = Math.sign(pz);
                                vz -= direction * excess * 0.1;
                                if (Math.abs(pz) > boundary) {
                                    pz = direction * boundary;
                                    vz *= -0.3;
                                }
                            }
                            
                            // 阻尼（增加阻尼，减少抖动）
                            vx *= 0.94;
                            vy *= 0.94;
                            vz *= 0.94;
                            
                            px += vx;
                            py += vy;
                            pz += vz;
                            
                            positions[i3] = px;
                            positions[i3+1] = py;
                            positions[i3+2] = pz;
                            velocities[i3] = vx;
                            velocities[i3+1] = vy;
                            velocities[i3+2] = vz;
                        }
                        
                        result[gData.id] = {
                            positions: positions, // 这里会触发复制，如果想要零拷贝需要 transfer
                            colors: colors
                        };
                        // 我们选择不 transfer positions 以保持 worker 状态，
                        // 而是发送副本。对于 600 个粒子，开销可忽略。
                        // 如果追求极致性能，可以使用 SharedArrayBuffer (需要特定头) 
                        // 或双缓冲交换 (复杂)。
                    }
                    
                    self.postMessage({ type: 'updateDone', result: result });
                }
            `;
            
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            this._particleWorker = new Worker(URL.createObjectURL(blob));
            
            this._particleWorker.onmessage = (e) => {
                if (e.data.type === 'updateDone') {
                    this._updateThreeJSMeshes(e.data.result);
                }
            };
        },

        _updateThreeJSMeshes: function(workerResult) {
            for (const groupId in workerResult) {
                const group = this._particleGroups.find(g => g.id == groupId);
                if (group && group.particles) {
                    const { positions, colors } = workerResult[groupId];
                    
                    // 更新 BufferAttribute
                    const posAttr = group.particles.geometry.attributes.position;
                    const colAttr = group.particles.geometry.attributes.color;
                    
                    posAttr.set(positions);
                    colAttr.set(colors);
                    
                    posAttr.needsUpdate = true;
                    colAttr.needsUpdate = true;
                }
            }
        },

        /**
         * 初始化 Three.js
         */
        _initThreeJS: async function() {
            if (this.threeRenderer) return;  // 已经初始化
            
            try {
                // 加载 Three.js
                if (!this.THREE) {
                    if (typeof DynamicManager !== 'undefined') {
                        // 加载模块并获取返回的对象
                        const threeModule = await DynamicManager.loadModule('three.js');
                        // 优先使用返回的对象，如果没有则从全局作用域获取
                        this.THREE = threeModule || (typeof window !== 'undefined' && window.THREE ? window.THREE : null) || (typeof globalThis !== 'undefined' && globalThis.THREE ? globalThis.THREE : null);
                        if (!this.THREE) {
                            throw new Error('Three.js 加载失败：未找到 THREE 对象');
                        }
                    } else {
                        throw new Error('DynamicManager 不可用');
                    }
                }
                
                // 使用局部变量引用，避免重复访问 this.THREE
                const THREE = this.THREE;
                const container = document.getElementById('three-container');
                if (!container) return;
                
                // 初始化 Worker
                this._initWorker();

                // 创建场景
                this.threeScene = new THREE.Scene();
                this.threeScene.background = new THREE.Color(0x000000);
                
                // 创建相机
                const width = container.clientWidth;
                const height = container.clientHeight;
                this.threeCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
                this.threeCamera.position.z = 5;
                
                // 创建渲染器
                // 尝试使用 WebGPURenderer (如果可用)，否则回退到 WebGLRenderer
                if (this.THREE.WebGPURenderer) {
                    try {
                        this.threeRenderer = new this.THREE.WebGPURenderer({ antialias: true });
                        // WebGPURenderer 需要异步初始化
                        await this.threeRenderer.init();
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('HANDTRACKER', '使用 WebGPURenderer');
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('HANDTRACKER', 'WebGPURenderer 初始化失败，回退到 WebGLRenderer', e);
                        }
                        this.threeRenderer = null;
                    }
                }
                
                if (!this.threeRenderer) {
                    this.threeRenderer = new this.THREE.WebGLRenderer({ antialias: true });
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('HANDTRACKER', '使用 WebGLRenderer');
                    }
                }
                
                this.threeRenderer.setSize(width, height);
                this.threeRenderer.setPixelRatio(window.devicePixelRatio);
                container.appendChild(this.threeRenderer.domElement);
                
                // 初始化粒子组数组
                this._particleGroups = [];
                this._particleGroupIdCounter = 0;
                this._hasContractedOnce = false;
                this._handDetectionHistory = [];  // 初始化手部检测历史
                
                // 初始化手势历史（保留用于向后兼容）
                this._gestureHistory = [];
                this._currentStableGesture = null;
                this._heartLocked = false;
                this._fistClosureDegree = 0;
                
                // 初始化 Worker
                this._initWorker();
                
                // 立即创建一个粒子组（不等待手部检测）
                if (this._particleGroups.length === 0) {
                    this._createParticleGroup(0, null, null, 1);
                }

                // 开始渲染循环
                this._threeAnimationFrameId = null;
                this._animateThreeJS();
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('HANDTRACKER', `Three.js 初始化完成，粒子组数量: ${this._particleGroups.length}`);
                }
                
                // 监听窗口大小变化（使用 EventManager）
                this._resizeHandler = () => this._onThreeJSResize();
                if (typeof EventManager !== 'undefined' && this.pid) {
                    this._resizeHandlerId = EventManager.registerEventHandler(this.pid, 'resize', this._resizeHandler, {
                        priority: 100,
                        selector: null  // 监听 window 的 resize 事件
                    });
                } else {
                    // 降级：直接使用 addEventListener（不推荐）
                    window.addEventListener('resize', this._resizeHandler);
                }
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('HANDTRACKER', 'Three.js 初始化失败', error);
                }
            }
        },
        
        /**
         * 创建粒子系统
         */
        _createParticles: function() {
            const THREE = this.THREE;
            
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(this.particleCount * 3);
            const colors = new Float32Array(this.particleCount * 3);
            
            // 初始化粒子位置和颜色
            for (let i = 0; i < this.particleCount; i++) {
                const i3 = i * 3;
                positions[i3] = (Math.random() - 0.5) * 10;
                positions[i3 + 1] = (Math.random() - 0.5) * 10;
                positions[i3 + 2] = (Math.random() - 0.5) * 10;
                
                // 红色粒子
                colors[i3] = 1.0;
                colors[i3 + 1] = 0.2;
                colors[i3 + 2] = 0.2;
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            
            const material = new THREE.PointsMaterial({
                size: 0.05,
                vertexColors: true,
                transparent: true,
                opacity: 0.8
            });
            
            this.particles = new THREE.Points(geometry, material);
            this.threeScene.add(this.particles);
            
            // 初始化位置数组
            this.currentPositions = Array.from(positions);
            this.targetPositions = Array.from(positions);
        },
        
        /**
         * 创建3D爱心形状 (已弃用，保留为空函数以兼容旧代码)
         */
        _createHeartShape: function() {
             // Galaxy Vortex Logic replaced Heart Shape
        },
        
        /**
         * 强制粒子到3D爱心位置 (已弃用)
         */
        _forceParticlesToHeart: function() {
             // Deprecated
        },
        
        /**
         * 收缩粒子为爱心 (已弃用)
         */
        _contractParticlesToHeart: function() {
             // Deprecated
        },
        
        /**
         * 计算握拳程度（基于手部关键点，改进算法）
         * @param {Array} landmarks - 手部关键点数组
         * @returns {number} 握拳程度（0-1，0=完全张开，1=完全握拳）
         */
        _calculateFistClosureDegree: function(landmarks) {
            if (!landmarks || landmarks.length < 21) return 0;
            
            // MediaPipe 手部关键点索引：
            // 0: 手腕, 4: 拇指尖, 8: 食指尖, 12: 中指尖, 16: 无名指尖, 20: 小指尖
            // 1-3: 拇指关节, 5-7: 食指关节, 9-11: 中指关节, 13-15: 无名指关节, 17-19: 小指关节
            
            const wrist = landmarks[0];  // 手腕
            const palmCenter = landmarks[9];  // 手掌中心（使用中指基部作为参考）
            
            // 手指定义：每个手指有3个关节点 + 1个指尖
            const fingers = [
                { tip: 4, mcp: 2, pip: 3 },      // 拇指（特殊处理）
                { tip: 8, mcp: 5, pip: 6 },      // 食指
                { tip: 12, mcp: 9, pip: 10 },    // 中指
                { tip: 16, mcp: 13, pip: 14 },   // 无名指
                { tip: 20, mcp: 17, pip: 18 }   // 小指
            ];
            
            let totalClosure = 0;
            let validFingers = 0;
            
            for (const finger of fingers) {
                const tip = landmarks[finger.tip];
                const mcp = landmarks[finger.mcp];  // 掌指关节
                const pip = landmarks[finger.pip];  // 近端指间关节
                
                if (!tip || !mcp || !pip) continue;
                
                // 计算指尖到掌指关节的距离（手指伸直时这个距离最大）
                const tipToMcp = Math.sqrt(
                    Math.pow(tip.x - mcp.x, 2) + 
                    Math.pow(tip.y - mcp.y, 2) + 
                    Math.pow((tip.z || 0) - (mcp.z || 0), 2)
                );
                
                // 计算近端指间关节到掌指关节的距离（作为参考长度）
                const pipToMcp = Math.sqrt(
                    Math.pow(pip.x - mcp.x, 2) + 
                    Math.pow(pip.y - mcp.y, 2) + 
                    Math.pow((pip.z || 0) - (mcp.z || 0), 2)
                );
                
                // 计算指尖到手掌中心的距离（握拳时这个距离会减小）
                const tipToPalm = Math.sqrt(
                    Math.pow(tip.x - palmCenter.x, 2) + 
                    Math.pow(tip.y - palmCenter.y, 2) + 
                    Math.pow((tip.z || 0) - (palmCenter.z || 0), 2)
                );
                
                // 使用两个指标来判断弯曲程度：
                // 1. 指尖到掌指关节的距离（相对于参考长度）
                // 2. 指尖到手掌中心的距离
                const lengthRatio = pipToMcp > 0 ? tipToMcp / (pipToMcp * 2) : 0;
                
                // 归一化：当指尖接近手掌中心且指尖到掌指关节距离短时，手指弯曲
                // 使用更敏感的算法
                const closure1 = Math.max(0, Math.min(1, 1 - lengthRatio));
                // 调整系数，使检测更敏感（降低系数值）
                const closure2 = Math.max(0, Math.min(1, 1 - tipToPalm * 3));  // 降低系数，使更敏感
                
                // 取两者的平均值，但更偏向于距离手掌中心的距离
                // 增加 closure2 的权重，使检测更敏感
                const closure = (closure1 * 0.3 + closure2 * 0.7);
                totalClosure += closure;
                validFingers++;
            }
            
            // 返回平均握拳程度，如果没有有效手指则返回0
            return validFingers > 0 ? totalClosure / validFingers : 0;
        },
        
        /**
         * 分析手部状态（增强版手势识别）
         * 结合 MediaPipe 手势结果和关键点几何计算
         */
        _analyzeHandState: function(landmarks, gestures) {
            if (!landmarks) return { type: 'NONE', strength: 0 };
            
            // 1. 获取 MediaPipe 原生手势结果
            let detectedGesture = 'Unknown';
            let confidence = 0;
            if (gestures && gestures.length > 0) {
                detectedGesture = gestures[0].categoryName;
                confidence = gestures[0].score;
            }
            
            // 2. 计算握拳程度 (0-1)
            const fistDegree = this._calculateFistClosureDegree(landmarks);
            
            // 3. 计算手掌张开程度
            // 通过计算手指尖到手掌中心的平均距离来判断
            const palmOpenDegree = this._calculatePalmOpenDegree(landmarks);
            
            // 4. 综合判定状态
            const state = {
                type: 'SCATTER', // 默认状态
                strength: 0,
                targetPoint: null // 交互目标点 (例如食指尖)
            };
            
            // 判定逻辑（提高阈值，降低敏感度）
            if (fistDegree > 0.5 || detectedGesture === 'Closed_Fist') {
                // 握拳 -> 爱心
                state.type = 'HEART';
                state.strength = Math.max(fistDegree, confidence);
            } else if (detectedGesture === 'Pointing_Up' || this._isPointing(landmarks)) {
                // 食指指向上 -> 吸引粒子
                state.type = 'ATTRACT';
                state.strength = confidence || 0.8;
                state.targetPoint = landmarks[8]; // 食指尖
            } else if (palmOpenDegree > 0.6 || detectedGesture === 'Open_Palm') {
                // 手掌张开 -> 排斥粒子（提高阈值，降低敏感度）
                state.type = 'REPEL';
                state.strength = Math.max(palmOpenDegree, confidence);
                state.targetPoint = landmarks[9]; // 手掌中心 (中指根部附近)
            } else if (detectedGesture === 'Victory') {
                 // 胜利手势 -> 旋转/特殊效果
                 state.type = 'SWIRL';
                 state.strength = confidence;
                 state.targetPoint = landmarks[9];
            }
            
            return state;
        },

        /**
         * 计算手掌张开程度
         */
        _calculatePalmOpenDegree: function(landmarks) {
            // 简单实现：计算指尖到手腕的距离总和
            const wrist = landmarks[0];
            const tips = [4, 8, 12, 16, 20];
            let totalDist = 0;
            
            for (const tip of tips) {
                const dx = landmarks[tip].x - wrist.x;
                const dy = landmarks[tip].y - wrist.y;
                const dz = (landmarks[tip].z || 0) - (wrist.z || 0);
                totalDist += Math.sqrt(dx*dx + dy*dy + dz*dz);
            }
            
            // 归一化 (经验值，可能需要根据实际调整)
            const avgDist = totalDist / 5;
            // 假设 0.3 是最大距离，0.1 是最小距离
            return Math.min(1, Math.max(0, (avgDist - 0.1) / 0.2)); 
        },

        /**
         * 检测是否为指点手势 (食指伸直，其他弯曲)
         */
        _isPointing: function(landmarks) {
             // 简单判断：食指伸直，中指、无名指、小指弯曲
             const isIndexStraight = this._isFingerStraight(landmarks, 8, 6, 5);
             const isMiddleBent = !this._isFingerStraight(landmarks, 12, 10, 9);
             const isRingBent = !this._isFingerStraight(landmarks, 16, 14, 13);
             const isPinkyBent = !this._isFingerStraight(landmarks, 20, 18, 17);
             
             return isIndexStraight && isMiddleBent && isRingBent && isPinkyBent;
        },

        /**
         * 判断手指是否伸直 (基于角度或距离)
         * tip: 指尖, pip: 近端指间关节, mcp: 掌指关节
         */
        _isFingerStraight: function(landmarks, tipIdx, pipIdx, mcpIdx) {
            const tip = landmarks[tipIdx];
            const pip = landmarks[pipIdx];
            const mcp = landmarks[mcpIdx];
            
            // 计算向量
            const v1 = {x: tip.x - pip.x, y: tip.y - pip.y, z: (tip.z||0) - (pip.z||0)};
            const v2 = {x: pip.x - mcp.x, y: pip.y - mcp.y, z: (pip.z||0) - (mcp.z||0)};
            
            // 计算点积和模长
            const dot = v1.x*v2.x + v1.y*v2.y + v1.z*v2.z;
            const mag1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y + v1.z*v1.z);
            const mag2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y + v2.z*v2.z);
            
            if (mag1 * mag2 === 0) return false;
            
            // 计算夹角余弦
            const cosTheta = dot / (mag1 * mag2);
            
            // 夹角小于约 25 度 (cos > 0.9) 视为伸直
            return cosTheta > 0.9;
        },

        /**
         * 处理交互手势（支持多手部，动态创建和销毁粒子组，添加稳定性检查）
         */
        _handleInteractiveGesture: function(gestureResults, handResults) {
            // 检查 Three.js 是否已初始化
            if (!this.threeScene || !this.THREE || !this.threeRenderer) {
                // Three.js 还未初始化，等待初始化完成
                return;
            }
            
            // 始终只维护一个粒子组
            if (this._particleGroups.length === 0) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('HANDTRACKER', '检测到手部但粒子组不存在，正在创建...');
                }
                const createdGroup = this._createParticleGroup(0, null, null, 1);
                if (!createdGroup) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('HANDTRACKER', '粒子组创建失败');
                    }
                    return;
                }
            }
            
            const group = this._particleGroups[0];
            if (!group) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('HANDTRACKER', '粒子组不存在，无法处理手势');
                }
                return;
            }
            
            // 确保 handState 存在
            if (!group.handState) {
                group.handState = { type: 'SCATTER', strength: 0, targetPoint: null };
            }

            const handCount = handResults && handResults.landmarks ? handResults.landmarks.length : 0;
            
            // 聚合所有手部的状态
            let maxFistDegree = 0;
            let combinedHandState = { type: 'SCATTER', strength: 0, targetPoint: null };
            let activeHandLandmarks = null; // 用于定位的活跃手部关键点

            if (handCount > 0) {
                // 遍历所有检测到的手部，找出最强烈的交互意图
                for (let i = 0; i < handCount; i++) {
                    const landmarks = handResults.landmarks[i];
                    const gestures = gestureResults?.gestures?.[i];
                    
                    let handState = { type: 'SCATTER', strength: 0, targetPoint: null };
                    if (this._analyzeHandState) {
                        handState = this._analyzeHandState(landmarks, gestures);
                        // 确保返回的对象包含所有必需字段
                        if (!handState.type) handState.type = 'SCATTER';
                        if (handState.strength === undefined) handState.strength = 0;
                        if (!handState.targetPoint && handState.type !== 'SCATTER') {
                            // 为需要目标点的手势提供默认目标点
                            if (handState.type === 'ATTRACT' && landmarks[8]) {
                                handState.targetPoint = landmarks[8];
                            } else if (handState.type === 'REPEL' && landmarks[9]) {
                                handState.targetPoint = landmarks[9];
                            }
                        }
                    }
                    
                    const fistClosure = this._calculateFistClosureDegree(landmarks);
                    if (fistClosure > maxFistDegree) {
                        maxFistDegree = fistClosure;
                    }

                    // 优先级逻辑：HEART > SWIRL > ATTRACT > REPEL > SCATTER
                    // 如果当前手部状态优先级更高，或者强度更大，则采纳
                    const priorityMap = { 'HEART': 5, 'SWIRL': 4, 'ATTRACT': 3, 'REPEL': 2, 'SCATTER': 1, 'NONE': 0 };
                    
                    if (priorityMap[handState.type] > priorityMap[combinedHandState.type] || 
                        (priorityMap[handState.type] === priorityMap[combinedHandState.type] && handState.strength > combinedHandState.strength)) {
                        combinedHandState = handState;
                        activeHandLandmarks = landmarks;
                    }
                }
            }

            // 更新粒子组状态（深拷贝，避免引用问题）
            group.handState = {
                type: combinedHandState.type,
                strength: combinedHandState.strength,
                targetPoint: combinedHandState.targetPoint ? {
                    x: combinedHandState.targetPoint.x,
                    y: combinedHandState.targetPoint.y,
                    z: combinedHandState.targetPoint.z || 0
                } : null
            };
            group.handOffsetX = 0; 
            
            // 平滑握拳程度（降低敏感度，更平滑的过渡）
            group.fistClosureDegree = group.fistClosureDegree * 0.75 + maxFistDegree * 0.25;
            
            // 调试日志（仅在开发时启用）
            if (combinedHandState.type !== 'SCATTER' && combinedHandState.type !== 'NONE') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('HANDTRACKER', `手势状态: ${combinedHandState.type}, 强度: ${combinedHandState.strength.toFixed(2)}, 握拳: ${group.fistClosureDegree.toFixed(2)}, 目标点: ${combinedHandState.targetPoint ? '有' : '无'}`);
                }
            }
            
            // 即使没有检测到手部，也确保粒子组存在并保持状态
            if (handCount === 0) {
                // 没有手部时，保持当前状态，但逐渐降低握拳程度
                group.fistClosureDegree = group.fistClosureDegree * 0.9;
            }
            
            // 强制触发一次更新（确保数据被发送）
            // 注意：这会在 _animateThreeJS 中处理，但我们可以确保数据是最新的
            
            // 发送更新到 Worker
            // 注意：这里我们不再调用 _updateParticleGroup（那是旧逻辑），
            // 而是依赖 _animateThreeJS 中的 update 消息发送
            
            // 如果需要触发爆发效果等逻辑，可以在这里补充，或者完全移交 Worker
            // 目前 Worker 已经处理了大部分物理逻辑
        },
        
        /**
         * 计算手部的水平偏移（使爱心均匀分布在两边）
         */
        _calculateHandOffset: function(handIndex, totalHands) {
            // 始终只使用一个居中的粒子团
            return 0;
        },
        
        /**
         * 缓动函数：ease-out-back（带轻微回弹效果）
         */
        _easeOutBack: function(t) {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        },
        
        /**
         * 缓动函数：ease-in-out-cubic（平滑过渡）
         */
        _easeInOutCubic: function(t) {
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        },
        
        /**
         * 更新所有粒子组的位置偏移（当手部数量变化时）
         */
        _updateParticleGroupPositions: function() {
            const totalHands = this._particleGroups.length;
            for (let i = 0; i < this._particleGroups.length; i++) {
                const group = this._particleGroups[i];
                if (!group) continue;
                // 重新计算偏移并更新
                const newOffset = this._calculateHandOffset(i, totalHands);
                group.handOffsetX = newOffset;
                
                // 如果粒子组处于爱心状态，立即更新目标位置
                if (group.particleState === 'heart' || group.particleState === 'focusing') {
                    this._forceParticleGroupToHeart(group);
                }
            }
        },
        
        /**
         * 创建粒子组（为每个手部创建独立的粒子系统）
         */
        _createParticleGroup: function(handIndex, landmarks, gestureResults, totalHands) {
            // 严格检查 Three.js 是否已完全初始化
            if (!this.threeScene || !this.THREE || !this.threeRenderer) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('HANDTRACKER', 'Three.js 未初始化，无法创建粒子组');
                }
                return null;
            }
            
            // 检查是否已存在粒子组（避免重复创建）
            if (this._particleGroups.length > 0) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('HANDTRACKER', '粒子组已存在，跳过创建');
                }
                return this._particleGroups[0];
            }
            
            const THREE = this.THREE;
            const groupId = this._particleGroupIdCounter++;
            
            // 计算手部的水平偏移（使爱心均匀分布在两边）
            const handOffsetX = this._calculateHandOffset(handIndex, totalHands || 1);
            
            // 创建粒子几何体
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(this.particleCount * 3);
            const colors = new Float32Array(this.particleCount * 3);
            
            // 初始化粒子位置（分散状态，使用更漂亮的球形分布）
            for (let i = 0; i < this.particleCount; i++) {
                const i3 = i * 3;
                // 使用球形分布，使初始状态更漂亮
                const theta = Math.random() * Math.PI * 2;  // 方位角
                const phi = Math.acos(2 * Math.random() - 1);  // 极角
                const radius = Math.random() * 6 + 2;  // 增加半径：从3+1改为6+2，使初始发散更广
                
                positions[i3] = radius * Math.sin(phi) * Math.cos(theta) + handOffsetX;
                positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
                positions[i3 + 2] = radius * Math.cos(phi);
                
                // 红色粒子
                colors[i3] = 1.0;
                colors[i3 + 1] = 0.2;
                colors[i3 + 2] = 0.2;
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            
            const material = new THREE.PointsMaterial({
                size: 0.12, // 增大粒子尺寸，使效果更明显
                vertexColors: true,
                transparent: true,
                opacity: 0.95, // 提高不透明度
                blending: THREE.AdditiveBlending, // 添加混合模式，使粒子重叠时更亮
                depthWrite: false // 关闭深度写入，避免遮挡问题
            });
            
            const particles = new THREE.Points(geometry, material);
            this.threeScene.add(particles);
            
            // 创建粒子组对象
            const group = {
                id: groupId,
                handIndex: 0, // 强制索引为0，所有手部共享一个粒子组
                handOffsetX: 0,  // 强制偏移为0
                particles: particles,
                particleState: 'galaxy', // 默认为 galaxy 状态
                heartRotation: 0,
                targetPositions: Array.from(positions),
                currentPositions: Array.from(positions),
                particleVelocities: new Float32Array(this.particleCount * 3),
                scatteredPositions: Array.from(positions),
                fistClosureDegree: 0,
                heartLocked: false,
                hasContractedOnce: false,  // 是否已经收缩过一次
                gestureHistory: [],
                lastGestureCheck: 0,
                scatterTime: 0,  // 散开发射时间（用于特效）
                focusTime: 0,  // 聚焦时间（用于特效）
                handState: { type: 'SCATTER', strength: 0, targetPoint: null }  // 初始化手势状态
            };
            
            // 初始化速度（如果已禁用漫游，速度设为0）
            if (this._hasContractedOnce) {
                // 已收缩过，禁用漫游，保持散发状态
                for (let i = 0; i < this.particleCount * 3; i++) {
                    group.particleVelocities[i] = 0;
                }
            } else {
                // 未收缩过，允许漫游
                for (let i = 0; i < this.particleCount; i++) {
                    const i3 = i * 3;
                    const phase = i * 0.1;
                    group.particleVelocities[i3] = Math.sin(phase) * 0.01;
                    group.particleVelocities[i3 + 1] = Math.cos(phase) * 0.01;
                    group.particleVelocities[i3 + 2] = Math.sin(phase * 1.3) * 0.01;
                }
            }
            
            this._particleGroups.push(group);
            
            // 通知 Worker 创建粒子组
            if (this._particleWorker) {
                this._particleWorker.postMessage({
                    type: 'createGroup',
                    data: {
                        id: groupId,
                        particleCount: this.particleCount,
                        handOffsetX: handOffsetX
                    }
                });
            }
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('HANDTRACKER', `粒子组已创建，ID: ${groupId}, 粒子数: ${this.particleCount}`);
            }
            return group;
        },
        
        /**
         * 销毁粒子组
         */
        _destroyParticleGroup: function(index) {
            if (index < 0 || index >= this._particleGroups.length) return;
            
            const group = this._particleGroups[index];
            if (!group) return;
            
            // 通知 Worker 销毁
            if (this._particleWorker) {
                this._particleWorker.postMessage({
                    type: 'destroyGroup',
                    data: { id: group.id }
                });
            }
            
            // 从场景中移除粒子
            if (group.particles && this.threeScene) {
                this.threeScene.remove(group.particles);
                
                // 清理资源
                if (group.particles.geometry) {
                    group.particles.geometry.dispose();
                }
                if (group.particles.material) {
                    group.particles.material.dispose();
                }
            }
            
            // 从数组中移除
            this._particleGroups.splice(index, 1);
        },
        
        /**
         * 清理所有粒子组
         */
        _cleanupAllParticleGroups: function() {
            while (this._particleGroups.length > 0) {
                this._destroyParticleGroup(0);
            }
        },
        
        /**
         * 更新粒子组状态
         */
        _updateParticleGroup: function(group, gestureResults, fistClosureDegree, handState) {
            // 记录上一帧的握拳程度
            const lastFistClosure = group.lastFistClosure || 0;
            
            // --- 状态机更新 ---
            
            // 爱心锁定机制
            if (fistClosureDegree >= this._heartLockThreshold) {
                group.heartLocked = true;
            } else if (fistClosureDegree < this._heartUnlockThreshold) {
                group.heartLocked = false;
            }
            
            const focusThreshold = 0.2;
            const fullFocusThreshold = 0.6;
            
            // 确定当前的主要交互模式
            let newMode = 'SCATTER'; // 默认
            
            // 优先爱心状态
            if (group.heartLocked || (handState && handState.type === 'HEART' && handState.strength > 0.5) || fistClosureDegree > focusThreshold) {
                newMode = 'HEART';
            } else if (handState) {
                switch (handState.type) {
                    case 'ATTRACT': newMode = 'ATTRACT'; break;
                    case 'REPEL': newMode = 'REPEL'; break;
                    case 'SWIRL': newMode = 'SWIRL'; break;
                    default: newMode = 'SCATTER';
                }
            }
            
            // 更新组的模式
            group.interactionMode = newMode;
            
            // 检测快速释放（爆发效果）- 仅当从 HEART 退出时
            if (group.particleState === 'heart' && newMode !== 'HEART') {
                const releaseSpeed = lastFistClosure - fistClosureDegree;
                if (releaseSpeed > 0.05) {
                    this._addBurstVelocity(group, releaseSpeed * 2);
                }
            }
            
            // 更新上一帧握拳程度
            group.lastFistClosure = fistClosureDegree;
            
            // --- 根据模式执行逻辑 ---
            
            if (newMode === 'HEART') {
                const effectiveFistDegree = group.heartLocked ? Math.max(fistClosureDegree, fullFocusThreshold) : fistClosureDegree;
                const focusProgress = Math.min(1, (effectiveFistDegree - focusThreshold) / (fullFocusThreshold - focusThreshold));
                
                // 确保散开位置已保存
                if (!group.scatteredPositions || group.scatteredPositions.length !== this.particleCount * 3) {
                    group.scatteredPositions = Array.from(group.currentPositions);
                }
                
                // 更新粒子目标位置 (Heart Shape)
                this._updateParticleGroupByFistDegree(group, focusProgress);
                
                // 标记已收缩过
                if (focusProgress > 0.1) {
                    group.hasContractedOnce = true;
                    this._hasContractedOnce = true;
                    // 清除速度以便精确形成形状
                    for (let i = 0; i < this.particleCount * 3; i++) {
                        group.particleVelocities[i] *= 0.8;
                    }
                }
                
                if (focusProgress >= 0.7 || group.heartLocked) {
                    group.particleState = 'heart';
                    if (focusProgress >= 0.85 || group.heartLocked) {
                        this._forceParticleGroupToHeart(group);
                    }
                } else {
                    group.particleState = 'focusing';
                }
                
            } else {
                // 非 Heart 状态
                
                // 如果之前是 Heart 状态，现在切换回 Scatter
                if (group.particleState === 'heart' || group.particleState === 'focusing') {
                     group.particleState = 'scattered';
                     group.focusTime = 0;
                     // 触发一次散开计算
                     this._scatterParticleGroup(group);
                }
            }
        },
        
        /**
         * 添加爆发速度（当快速松开手时）
         */
        _addBurstVelocity: function(group, intensity) {
            if (group.hasContractedOnce || this._hasContractedOnce) return; // 如果已收缩过禁用
            
            const handOffsetX = group.handOffsetX || 0;
            const burstStrength = intensity * 0.15; // 爆发强度
            
            for (let i = 0; i < this.particleCount; i++) {
                const i3 = i * 3;
                
                // 计算从中心向外的向量
                let dx = group.currentPositions[i3] - handOffsetX;
                let dy = group.currentPositions[i3 + 1];
                let dz = group.currentPositions[i3 + 2];
                
                // 归一化并应用爆发力
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
                
                group.particleVelocities[i3] += (dx / dist) * burstStrength;
                group.particleVelocities[i3 + 1] += (dy / dist) * burstStrength;
                group.particleVelocities[i3 + 2] += (dz / dist) * burstStrength;
            }
        },

        /**
         * 根据握拳程度更新粒子组位置（更平滑的特效）
         */
        _updateParticleGroupByFistDegree: function(group, progress) {
            // Galaxy Mode doesn't need heart shape logic here
            // It is handled by the worker
            if (group.particleState === 'galaxy') {
                return;
            }

            if (!this.heartShape || this.heartShape.length === 0) {
                this._createHeartShape();
            }
            
            // 确保散开位置已保存
            if (!group.scatteredPositions || group.scatteredPositions.length !== this.particleCount * 3) {
                group.scatteredPositions = Array.from(group.currentPositions);
            }
            
            const handOffsetX = group.handOffsetX || 0;
            
            // 使用线性插值，使收缩发散过程平滑线性
            // progress 已经是 0-1 的线性值，直接使用即可
            
            // 在散开位置和爱心位置之间线性插值
            for (let i = 0; i < this.particleCount; i++) {
                const i3 = i * 3;
                const heartIndex = i % (this.heartShape ? this.heartShape.length : 1); // Safety check
                const heartPoint = (this.heartShape && this.heartShape.length > 0) ? this.heartShape[heartIndex] : {x:0, y:0, z:0};
                
                const scatteredX = group.scatteredPositions[i3];
                const scatteredY = group.scatteredPositions[i3 + 1];
                const scatteredZ = group.scatteredPositions[i3 + 2];
                
                // 爱心位置（应用手部偏移）
                const heartX = heartPoint.x + handOffsetX;
                const heartY = heartPoint.y;
                const heartZ = heartPoint.z || 0;
                
                // 使用线性插值（直接使用 progress，不应用缓动函数）
                group.targetPositions[i3] = scatteredX + (heartX - scatteredX) * progress;
                group.targetPositions[i3 + 1] = scatteredY + (heartY - scatteredY) * progress;
                group.targetPositions[i3 + 2] = scatteredZ + (heartZ - scatteredZ) * progress;
            }
            
            // 记录聚焦时间
            if (progress > 0.1 && group.focusTime === 0) {
                group.focusTime = Date.now();
            }
            
            // 根据聚焦程度调整速度（聚焦时速度逐渐减小）
            if (group.hasContractedOnce) {
                // 已收缩过，禁用漫游
                for (let i = 0; i < this.particleCount * 3; i++) {
                    group.particleVelocities[i] = 0;
                }
            } else {
                const velocityScale = Math.max(0, 1 - progress * 2);
                for (let i = 0; i < this.particleCount * 3; i++) {
                    group.particleVelocities[i] *= velocityScale;
                }
            }
        },
        
        /**
         * 强制粒子组到爱心位置 (已弃用，保留以兼容)
         */
        _forceParticleGroupToHeart: function(group) {
            // Galaxy Mode handled by worker, skip this
            if (group.particleState === 'galaxy') return;

            // Safety check for legacy mode
            if (!this.heartShape || this.heartShape.length === 0) {
                // If heartShape is missing in legacy mode, we can't do anything
                return;
            }
            
            // ... legacy logic ...
            // (Only execute if heartShape exists)
            for (let i = 0; i < this.particleCount; i++) {
                const i3 = i * 3;
                const heartIndex = i % this.heartShape.length;
                const heartPoint = this.heartShape[heartIndex];
                
                group.targetPositions[i3] = heartPoint.x + (group.handOffsetX || 0);
                group.targetPositions[i3 + 1] = heartPoint.y;
                group.targetPositions[i3 + 2] = heartPoint.z || 0;
            }
            
            for (let i = 0; i < this.particleCount * 3; i++) {
                group.particleVelocities[i] = 0;
            }
        },
        
        /**
         * 分散粒子组（漂亮的爆炸效果，增加发散程度）
         */
        _scatterParticleGroup: function(group) {
            if (!group.particles) return;
            
            const handOffsetX = group.handOffsetX || 0;
            group.scatterTime = Date.now();  // 记录散开时间，用于特效
            
            for (let i = 0; i < this.particleCount; i++) {
                const i3 = i * 3;
                // 使用更漂亮的球形爆炸分布，增加发散范围
                const theta = (i / this.particleCount) * Math.PI * 2;  // 方位角
                const phi = Math.acos(2 * (i / this.particleCount) - 1);  // 极角（均匀分布）
                const radius = Math.random() * 6 + 2;  // 增加爆炸半径：从3.5+1.5改为6+2，使发散更广
                
                // 添加一些随机性，使分布更自然
                const randomOffset = (Math.random() - 0.5) * 1.0;  // 增加随机偏移范围
                
                group.targetPositions[i3] = radius * Math.sin(phi) * Math.cos(theta) + handOffsetX + randomOffset;
                group.targetPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta) + randomOffset;
                group.targetPositions[i3 + 2] = radius * Math.cos(phi) + randomOffset;
                
                // 为散开添加初始速度（爆炸效果）
                if (!group.hasContractedOnce && !this._hasContractedOnce) {
                    const speed = 0.03;  // 增加初始速度，使散开更快
                    group.particleVelocities[i3] = (group.targetPositions[i3] - handOffsetX) * speed;
                    group.particleVelocities[i3 + 1] = group.targetPositions[i3 + 1] * speed;
                    group.particleVelocities[i3 + 2] = group.targetPositions[i3 + 2] * speed;
                }
            }
            
            // 保存散开位置
            group.scatteredPositions = Array.from(group.targetPositions);
            
            // 如果已收缩过，禁用漫游（速度保持为0）
            if (group.hasContractedOnce || this._hasContractedOnce) {
                for (let i = 0; i < this.particleCount * 3; i++) {
                    group.particleVelocities[i] = 0;
                }
            }
        },
        
        /**
         * 根据握拳程度更新粒子位置（在散开和爱心之间插值）
         * @param {number} progress - 聚焦进度（0-1，0=完全散开，1=完全聚焦为爱心）
         */
        _updateParticlesByFistDegree: function(progress) {
            if (!this.heartShape || this.heartShape.length === 0) {
                this._createHeartShape();
            }
            
            // 确保散开位置已保存（关键：必须在聚焦开始时保存，之后不再更新）
            if (!this._scatteredPositions || this._scatteredPositions.length !== this.particleCount * 3) {
                // 如果散开位置未保存，使用当前位置作为散开位置
                this._scatteredPositions = Array.from(this.currentPositions);
            }
            
            // 在散开位置和爱心位置之间插值
            for (let i = 0; i < this.particleCount; i++) {
                const i3 = i * 3;
                const heartIndex = i % this.heartShape.length;
                
                // 散开位置（从保存的位置读取，不更新）
                const scatteredX = this._scatteredPositions[i3];
                const scatteredY = this._scatteredPositions[i3 + 1];
                const scatteredZ = this._scatteredPositions[i3 + 2];
                
                // 3D爱心位置
                const heartPoint = this.heartShape[heartIndex];
                const heartX = heartPoint.x;
                const heartY = heartPoint.y;
                const heartZ = heartPoint.z || 0;
                
                // 使用线性插值，使收缩发散过程平滑线性
                // 直接使用 progress，不应用缓动函数
                
                // 插值目标位置（线性插值）
                this.targetPositions[i3] = scatteredX + (heartX - scatteredX) * progress;
                this.targetPositions[i3 + 1] = scatteredY + (heartY - scatteredY) * progress;
                this.targetPositions[i3 + 2] = scatteredZ + (heartZ - scatteredZ) * progress;
            }
            
            // 根据聚焦程度调整漫游速度（聚焦时速度逐渐减小）
            if (this._particleVelocities) {
                const velocityScale = Math.max(0, 1 - progress * 2);  // 更快的速度衰减
                for (let i = 0; i < this.particleCount * 3; i++) {
                    this._particleVelocities[i] *= velocityScale;
                }
            }
        },
        
        /**
         * Three.js 动画循环（支持多粒子组）
         */
        _animateThreeJS: function() {
            if (!this.threeRenderer || !this.threeScene || !this.threeCamera) return;
            
            // 准备发送给 Worker 的数据
            const groupsData = [];
            
            for (const group of this._particleGroups) {
                if (!group) continue;
                
                // 确保 handState 存在
                const handState = group.handState || { type: 'SCATTER', strength: 0 };
                
                // 交互目标点坐标转换 (归一化坐标 -> ThreeJS 坐标)
                // 注意：MediaPipe 坐标是 0-1 (左上角为原点)，ThreeJS 是 -5 到 5 (中心为原点)
                // Y轴需要翻转
                let targetPoint = null;
                if (handState.targetPoint) {
                    targetPoint = {
                        x: handState.targetPoint.x, 
                        y: handState.targetPoint.y,
                        z: handState.targetPoint.z || 0
                    };
                }

                groupsData.push({
                    id: group.id,
                    mode: handState.type,  // 明确传递交互类型
                    targetPoint: targetPoint,
                    fistDegree: group.fistClosureDegree,
                    handOffsetX: group.handOffsetX
                });
            }
            
            // 发送更新请求给 Worker
            if (this._particleWorker && groupsData.length > 0) {
                // 确保数据有效
                for (const gData of groupsData) {
                    if (!gData.mode) gData.mode = 'SCATTER';
                    if (gData.fistDegree === undefined) gData.fistDegree = 0;
                    if (gData.handOffsetX === undefined) gData.handOffsetX = 0;
                }
                
                this._particleWorker.postMessage({
                    type: 'update',
                    data: {
                        groupsData: groupsData,
                        time: Date.now() * 0.001
                    }
                });
            }
            
            this.threeRenderer.render(this.threeScene, this.threeCamera);
            this._threeAnimationFrameId = requestAnimationFrame(() => this._animateThreeJS());
        },
        
        /**
         * Three.js 窗口大小调整
         */
        _onThreeJSResize: function() {
            if (!this.threeRenderer || !this.threeCamera) return;
            
            const container = document.getElementById('three-container');
            if (!container) return;
            
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            this.threeRenderer.setSize(width, height);
            this.threeCamera.aspect = width / height;
            this.threeCamera.updateProjectionMatrix();
        },
        
        /**
         * 初始化跟踪页面的Three.js场景（用于立方体交互）
         */
        _initTrackingThreeJS: async function() {
            if (this._trackingThreeRenderer) return;  // 已经初始化
            
            try {
                // 加载 Three.js（如果还没有加载）
                if (!this.THREE) {
                    if (typeof DynamicManager !== 'undefined') {
                        const threeModule = await DynamicManager.loadModule('three.js');
                        this.THREE = threeModule || (typeof window !== 'undefined' && window.THREE ? window.THREE : null) || (typeof globalThis !== 'undefined' && globalThis.THREE ? globalThis.THREE : null);
                        if (!this.THREE) {
                            throw new Error('Three.js 加载失败：未找到 THREE 对象');
                        }
                    } else {
                        throw new Error('DynamicManager 不可用');
                    }
                }
                
                const THREE = this.THREE;
                const container = document.getElementById('tracking-three-container');
                if (!container) return;
                
                // 创建场景
                this._trackingThreeScene = new THREE.Scene();
                this._trackingThreeScene.background = null;  // 透明背景
                
                // 创建相机
                const width = container.clientWidth;
                const height = container.clientHeight;
                this._trackingThreeCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
                this._trackingThreeCamera.position.z = 5;
                
                // 创建渲染器（透明背景）
                if (this.THREE.WebGPURenderer) {
                    try {
                        this._trackingThreeRenderer = new this.THREE.WebGPURenderer({ antialias: true, alpha: true });
                        await this._trackingThreeRenderer.init();
                    } catch (e) {
                        this._trackingThreeRenderer = null;
                    }
                }
                
                if (!this._trackingThreeRenderer) {
                    this._trackingThreeRenderer = new this.THREE.WebGLRenderer({ antialias: true, alpha: true });
                }
                
                this._trackingThreeRenderer.setSize(width, height);
                this._trackingThreeRenderer.setPixelRatio(window.devicePixelRatio);
                this._trackingThreeRenderer.setClearColor(0x000000, 0);  // 透明背景
                container.appendChild(this._trackingThreeRenderer.domElement);
                
                // 初始化立方体状态
                this._cubeRotationEnabled = false;
                this._cubePosition = { x: 0, y: 0, z: 0 };
                this._cubeScale = 1.0;
            this._lastTwoFingerDistance = null;
            this._lastTwoFingerCenter = null;
            this._lastTwoFingerCenter3D = null;
            this._lastTwoHandDistance = null;
            this._lastTwoHandCenter = null;
            this._isTwoFingerActive = false;
            this._isTwoHandActive = false;
            this._twoFingerVelocity = { x: 0, y: 0, z: 0 };
            this._twoFingerMoveHistory = [];
            this._lastFiveFingerPinchTime = 0;
                this._lastSingleFingerClickTime = 0;
                this._lastVictoryGestureTime = 0;
                this._fiveFingerPinchHistory = [];
                this._victoryGestureHistory = [];
                
                // 初始化射线检测器
                this._raycaster = new THREE.Raycaster();
                
                // 开始渲染循环
                this._animateTrackingThreeJS();
                
                // 监听窗口大小变化（使用 EventManager）
                const resizeHandler = () => {
                    if (!this._trackingThreeRenderer || !this._trackingThreeCamera) return;
                    const container = document.getElementById('tracking-three-container');
                    if (!container) return;
                    const width = container.clientWidth;
                    const height = container.clientHeight;
                    this._trackingThreeRenderer.setSize(width, height);
                    this._trackingThreeCamera.aspect = width / height;
                    this._trackingThreeCamera.updateProjectionMatrix();
                };
                if (typeof EventManager !== 'undefined' && this.pid) {
                    this._trackingResizeHandlerId = EventManager.registerEventHandler(this.pid, 'resize', resizeHandler, {
                        priority: 100,
                        selector: null  // 监听 window 的 resize 事件
                    });
                } else {
                    // 降级：直接使用 addEventListener（不推荐）
                    window.addEventListener('resize', resizeHandler);
                }
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('HANDTRACKER', '跟踪页面Three.js初始化完成');
                }
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('HANDTRACKER', '跟踪页面Three.js初始化失败', error);
                }
            }
        },
        
        /**
         * 跟踪页面的Three.js动画循环
         */
        _animateTrackingThreeJS: function() {
            if (!this._trackingThreeRenderer || !this._trackingThreeScene || !this._trackingThreeCamera) {
                this._trackingThreeAnimationFrameId = null;
                return;
            }
            
            // 更新太阳系动画（仅在方块模式）
            if (this.trackingMode === 'cube' && this._solarSystem) {
                if (this._cubeRotationEnabled) {
                    // 旋转整个太阳系
                    this._solarSystem.rotation.y += 0.005;
                }
                
                // 更新行星轨道运动
                this._updatePlanetOrbits();
                
                // 更新粒子系统
                this._updateParticleSystem();
            }
            
            // 圆形模式不需要Three.js更新（使用HTML div）
            
            this._trackingThreeRenderer.render(this._trackingThreeScene, this._trackingThreeCamera);
            this._trackingThreeAnimationFrameId = requestAnimationFrame(() => this._animateTrackingThreeJS());
        },
        
        /**
         * 处理跟踪页面的手势交互
         */
        _handleTrackingGesture: function(results, gestureResults) {
            if (!results || !results.landmarks || results.landmarks.length === 0) return;
            
            // 如果是圆形跟随模式，只处理圆形跟随，不处理方块模式的手势
            if (this.trackingMode === 'circle') {
                this._isGestureMode = true;  // 启用手势控制模式
                this._updateTrackingCircles(results);
                return;
            } else {
                this._isGestureMode = false;  // 禁用手势控制模式
                // 方块模式下清除圆形
                if (this._trackingCircles.length > 0) {
                    this._clearTrackingCircles();
                }
            }
            
            // 方块模式：处理原有的手势交互
            const landmarks = results.landmarks[0];  // 使用第一只手
            const currentTime = Date.now();
            
            // 检测五指捏合（只用于创建立方体）- 添加稳定性检查
            const fiveFingerPinch = this._detectFiveFingerPinch(landmarks);
            this._fiveFingerPinchHistory.push(fiveFingerPinch);
            if (this._fiveFingerPinchHistory.length > this._fiveFingerPinchStabilityFrames) {
                this._fiveFingerPinchHistory.shift();  // 保持历史记录长度
            }
            
            // 只有当连续多帧都检测到五指捏合时才触发
            const stablePinch = this._fiveFingerPinchHistory.length >= this._fiveFingerPinchStabilityFrames &&
                               this._fiveFingerPinchHistory.every(p => p === true);
            
            if (stablePinch) {
                // 防抖：避免频繁触发
                if (currentTime - this._lastFiveFingerPinchTime > this._fiveFingerPinchDebounce) {
                    this._lastFiveFingerPinchTime = currentTime;
                    if (!this._solarSystem) {
                        // 创建太阳系
                        this._createTrackingCube();
                    }
                    // 清空历史记录，避免重复触发
                    this._fiveFingerPinchHistory = [];
                }
                return;  // 避免同时触发其他手势
            } else if (!fiveFingerPinch) {
                // 如果没有检测到五指捏合，清空历史记录
                this._fiveFingerPinchHistory = [];
            }
            
            // 检测比耶手势（用于删除立方体）- 添加稳定性检查
            const victoryGesture = this._detectVictoryGesture(landmarks, gestureResults);
            this._victoryGestureHistory.push(victoryGesture);
            if (this._victoryGestureHistory.length > this._victoryGestureStabilityFrames) {
                this._victoryGestureHistory.shift();  // 保持历史记录长度
            }
            
            // 只有当连续多帧都检测到比耶手势时才触发
            const stableVictory = this._victoryGestureHistory.length >= this._victoryGestureStabilityFrames &&
                                 this._victoryGestureHistory.every(v => v === true);
            
            if (stableVictory && this._solarSystem) {
                // 防抖：避免频繁触发
                if (currentTime - this._lastVictoryGestureTime > this._fiveFingerPinchDebounce) {
                    this._lastVictoryGestureTime = currentTime;
                    // 删除立方体
                    this._removeTrackingCube();
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('HANDTRACKER', '检测到比耶手势，删除立方体');
                    }
                    // 清空历史记录，避免重复触发
                    this._victoryGestureHistory = [];
                }
                return;  // 避免同时触发其他手势
            } else if (!victoryGesture) {
                // 如果没有检测到比耶手势，清空历史记录
                this._victoryGestureHistory = [];
            }
            
            // 如果立方体不存在，不处理其他手势
            if (!this._solarSystem) {
                // 重置两指手势状态
                this._lastTwoFingerDistance = null;
                this._lastTwoFingerCenter = null;
                this._lastTwoHandDistance = null;
                this._lastTwoHandCenter = null;
                this._isTwoHandActive = false;
                return;
            }
            
            // 检测单指点击（切换旋转）- 需要检测是否点击到立方体
            const singleFingerClick = this._detectSingleFingerClick(landmarks);
            if (singleFingerClick) {
                // 防抖：避免频繁触发
                if (currentTime - this._lastSingleFingerClickTime > this._singleFingerClickDebounce) {
                    // 检测是否点击到立方体
                    if (this._checkCubeClick(landmarks[8])) {  // 使用食指尖位置
                        this._lastSingleFingerClickTime = currentTime;
                        this._cubeRotationEnabled = !this._cubeRotationEnabled;
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('HANDTRACKER', `立方体旋转 ${this._cubeRotationEnabled ? '启用' : '禁用'}`);
                        }
                    }
                }
                return;
            }
            
            // 检测两只手手势（优先处理两只手）
            let twoFingerDetected = false;
            if (results.landmarks.length >= 2) {
                // 使用两只手进行缩放和移动
                const twoHandResult = this._detectTwoHandScaleAndMove(results.landmarks[0], results.landmarks[1]);
                if (twoHandResult) {
                    twoFingerDetected = true;
                    this._isTwoHandActive = true;
                    
                    if (twoHandResult.type === 'scale') {
                        // 两只手缩放：根据距离变化缩放太阳系
                        this._scaleSolarSystemWithTwoHands(twoHandResult.distance, twoHandResult.distanceChange);
                    } else if (twoHandResult.type === 'move') {
                        // 两只手移动：移动太阳系
                        this._moveSolarSystemWithTwoHands(twoHandResult.center);
                    }
                } else {
                    // 检测两只手是否松开
                    if (this._isTwoHandActive) {
                        const hand1Center = this._getHandCenter(results.landmarks[0]);
                        const hand2Center = this._getHandCenter(results.landmarks[1]);
                        const currentDistance = Math.sqrt(
                            Math.pow(hand1Center.x - hand2Center.x, 2) + 
                            Math.pow(hand1Center.y - hand2Center.y, 2) + 
                            Math.pow((hand1Center.z || 0) - (hand2Center.z || 0), 2)
                        );
                        if (currentDistance > this._twoFingerReleaseThreshold * 2) {  // 两只手阈值更大
                            // 两只手松开，停止操作
                            this._isTwoHandActive = false;
                            this._lastTwoHandDistance = null;
                            this._lastTwoHandCenter = null;
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('HANDTRACKER', '两只手松开，停止操作');
                            }
                        }
                    }
                }
            } else {
                // 单只手的两指检测（同一只手的拇指和食指）
                const twoFingerGesture = this._detectTwoFingerGesture(landmarks);
                if (twoFingerGesture) {
                    twoFingerDetected = true;
                    this._isTwoFingerActive = true;
                    if (twoFingerGesture.type === 'pinch') {
                        // 两指捏合：移动立方体
                        this._moveCubeWithTwoFingers(twoFingerGesture.center);
                    } else if (twoFingerGesture.type === 'scale') {
                        // 两指缩放：缩放立方体
                        this._scaleCubeWithTwoFingers(twoFingerGesture.distance);
                    }
                } else {
                    // 检测两指是否松开（距离超过阈值）
                    if (this._isTwoFingerActive) {
                        const thumbTip = landmarks[4];
                        const indexTip = landmarks[8];
                        const currentDistance = Math.sqrt(
                            Math.pow(thumbTip.x - indexTip.x, 2) + 
                            Math.pow(thumbTip.y - indexTip.y, 2) + 
                            Math.pow((thumbTip.z || 0) - (indexTip.z || 0), 2)
                        );
                        // 如果两指距离超过阈值，或者之前没有记录距离，认为已松开
                        if (this._lastTwoFingerDistance === null || currentDistance > this._twoFingerReleaseThreshold) {
                            // 两指松开，停止移动
                            this._isTwoFingerActive = false;
                            this._lastTwoFingerDistance = null;
                            this._lastTwoFingerCenter = null;
                            this._lastTwoFingerCenter3D = null;
                            this._twoFingerVelocity = { x: 0, y: 0, z: 0 };
                            this._twoFingerMoveHistory = [];
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('HANDTRACKER', '两指松开，停止移动');
                            }
                        }
                    } else {
                        // 如果没有检测到两指手势且不在移动状态，重置状态
                        this._lastTwoFingerDistance = null;
                        this._lastTwoFingerCenter = null;
                    }
                }
            }
            
            // 如果没有检测到任何两指手势，且之前处于活动状态，停止移动
            if (!twoFingerDetected && this._isTwoFingerActive) {
                this._isTwoFingerActive = false;
                this._lastTwoFingerDistance = null;
                this._lastTwoFingerCenter = null;
                this._lastTwoFingerCenter3D = null;
                this._twoFingerVelocity = { x: 0, y: 0, z: 0 };
                this._twoFingerMoveHistory = [];
                if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('HANDTRACKER', '两指手势消失，停止移动');
            }
            }
        },
        
        /**
         * 检测五指捏合手势
         */
        _detectFiveFingerPinch: function(landmarks) {
            if (!landmarks || landmarks.length < 21) return false;
            
            // 获取五个指尖位置
            const thumbTip = landmarks[4];   // 拇指尖
            const indexTip = landmarks[8];    // 食指尖
            const middleTip = landmarks[12];  // 中指尖
            const ringTip = landmarks[16];    // 无名指尖
            const pinkyTip = landmarks[20];   // 小指尖
            
            // 计算五个指尖的中心点
            const centerX = (thumbTip.x + indexTip.x + middleTip.x + ringTip.x + pinkyTip.x) / 5;
            const centerY = (thumbTip.y + indexTip.y + middleTip.y + ringTip.y + pinkyTip.y) / 5;
            const centerZ = ((thumbTip.z || 0) + (indexTip.z || 0) + (middleTip.z || 0) + (ringTip.z || 0) + (pinkyTip.z || 0)) / 5;
            
            // 计算每个指尖到中心点的距离
            const distances = [
                Math.sqrt(Math.pow(thumbTip.x - centerX, 2) + Math.pow(thumbTip.y - centerY, 2) + Math.pow((thumbTip.z || 0) - centerZ, 2)),
                Math.sqrt(Math.pow(indexTip.x - centerX, 2) + Math.pow(indexTip.y - centerY, 2) + Math.pow((indexTip.z || 0) - centerZ, 2)),
                Math.sqrt(Math.pow(middleTip.x - centerX, 2) + Math.pow(middleTip.y - centerY, 2) + Math.pow((middleTip.z || 0) - centerZ, 2)),
                Math.sqrt(Math.pow(ringTip.x - centerX, 2) + Math.pow(ringTip.y - centerY, 2) + Math.pow((ringTip.z || 0) - centerZ, 2)),
                Math.sqrt(Math.pow(pinkyTip.x - centerX, 2) + Math.pow(pinkyTip.y - centerY, 2) + Math.pow((pinkyTip.z || 0) - centerZ, 2))
            ];
            
            // 计算平均距离
            const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
            
            // 如果平均距离小于阈值，认为是五指捏合
            const threshold = 0.05;  // 降低阈值，使检测更严格，避免误触发
            return avgDistance < threshold;
        },
        
        /**
         * 检测比耶手势（Victory手势：食指和中指伸直，其他手指弯曲）
         */
        _detectVictoryGesture: function(landmarks, gestureResults) {
            if (!landmarks || landmarks.length < 21) return false;
            
            // 首先检查MediaPipe的手势识别结果
            if (gestureResults && gestureResults.gestures && gestureResults.gestures.length > 0) {
                const handGestures = gestureResults.gestures[0];
                if (handGestures && handGestures.length > 0) {
                    const topGesture = handGestures[0];
                    if (topGesture.categoryName === 'Victory' && topGesture.score > 0.7) {
                        return true;
                    }
                }
            }
            
            // 如果MediaPipe没有识别到，使用landmarks进行检测
            // 比耶手势：食指和中指伸直，其他手指（拇指、无名指、小指）弯曲
            
            // 检查食指是否伸直
            const indexTip = landmarks[8];
            const indexPip = landmarks[6];
            const indexMcp = landmarks[5];
            const indexStraight = this._isFingerStraight(landmarks, 8, 6, 5);
            
            // 检查中指是否伸直
            const middleStraight = this._isFingerStraight(landmarks, 12, 10, 9);
            
            // 检查无名指是否弯曲
            const ringBent = !this._isFingerStraight(landmarks, 16, 14, 13);
            
            // 检查小指是否弯曲
            const pinkyBent = !this._isFingerStraight(landmarks, 20, 18, 17);
            
            // 检查拇指是否弯曲（拇指的判断稍微复杂一些）
            const thumbBent = !this._isFingerStraight(landmarks, 4, 3, 2);
            
            // 比耶手势：食指和中指伸直，其他手指弯曲
            return indexStraight && middleStraight && ringBent && pinkyBent && thumbBent;
        },
        
        /**
         * 检测单指点击手势
         */
        _detectSingleFingerClick: function(landmarks) {
            if (!landmarks || landmarks.length < 21) return false;
            
            // 检测食指是否伸直且指向屏幕
            const indexTip = landmarks[8];
            const indexPip = landmarks[6];
            const indexMcp = landmarks[5];
            
            // 计算食指的伸直程度
            const tipToPip = Math.sqrt(
                Math.pow(indexTip.x - indexPip.x, 2) + 
                Math.pow(indexTip.y - indexPip.y, 2) + 
                Math.pow((indexTip.z || 0) - (indexPip.z || 0), 2)
            );
            const pipToMcp = Math.sqrt(
                Math.pow(indexPip.x - indexMcp.x, 2) + 
                Math.pow(indexPip.y - indexMcp.y, 2) + 
                Math.pow((indexPip.z || 0) - (indexMcp.z || 0), 2)
            );
            
            // 如果食指伸直（tipToPip > pipToMcp * 0.8），且其他手指弯曲
            const isIndexStraight = tipToPip > pipToMcp * 0.8;
            
            // 检查其他手指是否弯曲
            const middleTip = landmarks[12];
            const middlePip = landmarks[10];
            const middleMcp = landmarks[9];
            const middleStraight = Math.sqrt(
                Math.pow(middleTip.x - middlePip.x, 2) + 
                Math.pow(middleTip.y - middlePip.y, 2) + 
                Math.pow((middleTip.z || 0) - (middlePip.z || 0), 2)
            ) > Math.sqrt(
                Math.pow(middlePip.x - middleMcp.x, 2) + 
                Math.pow(middlePip.y - middleMcp.y, 2) + 
                Math.pow((middlePip.z || 0) - (middleMcp.z || 0), 2)
            ) * 0.8;
            
            // 如果只有食指伸直，其他手指弯曲，认为是点击手势
            return isIndexStraight && !middleStraight;
        },
        
        /**
         * 检测同一只手的两个手指手势（拇指和食指）
         */
        _detectTwoFingerGesture: function(landmarks) {
            if (!landmarks || landmarks.length < 21) return null;
            
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            
            // 计算两指距离
            const distance = Math.sqrt(
                Math.pow(thumbTip.x - indexTip.x, 2) + 
                Math.pow(thumbTip.y - indexTip.y, 2) + 
                Math.pow((thumbTip.z || 0) - (indexTip.z || 0), 2)
            );
            
            // 计算中心点
            const center = {
                x: (thumbTip.x + indexTip.x) / 2,
                y: (thumbTip.y + indexTip.y) / 2,
                z: ((thumbTip.z || 0) + (indexTip.z || 0)) / 2
            };
            
            // 判断是捏合还是缩放
            if (this._lastTwoFingerDistance === null) {
                this._lastTwoFingerDistance = distance;
                this._lastTwoFingerCenter = center;
                return null;
            }
            
            const distanceChange = distance - this._lastTwoFingerDistance;
            const distanceThreshold = 0.03;  // 增加阈值，使区分更明显
            
            // 更新记录的距离和中心点
            this._lastTwoFingerDistance = distance;
            this._lastTwoFingerCenter = center;
            
            if (Math.abs(distanceChange) < distanceThreshold) {
                // 距离变化很小，认为是捏合（移动）
                return { type: 'pinch', center: center, distance: distance };
            } else {
                // 距离变化较大，认为是缩放
                return { type: 'scale', center: center, distance: distance, change: distanceChange };
            }
        },
        
        /**
         * 获取手的中心点（使用手掌中心）
         */
        _getHandCenter: function(landmarks) {
            if (!landmarks || landmarks.length < 21) return { x: 0, y: 0, z: 0 };
            
            // 使用手腕和几个关键点计算中心
            const wrist = landmarks[0];
            const middleMcp = landmarks[9];  // 中指根部
            const indexMcp = landmarks[5];   // 食指根部
            const ringMcp = landmarks[13];   // 无名指根部
            
            return {
                x: (wrist.x + middleMcp.x + indexMcp.x + ringMcp.x) / 4,
                y: (wrist.y + middleMcp.y + indexMcp.y + ringMcp.y) / 4,
                z: ((wrist.z || 0) + (middleMcp.z || 0) + (indexMcp.z || 0) + (ringMcp.z || 0)) / 4
            };
        },
        
        /**
         * 检测两只手的手势（缩放和移动）
         */
        _detectTwoHandScaleAndMove: function(landmarks1, landmarks2) {
            if (!landmarks1 || !landmarks2 || landmarks1.length < 21 || landmarks2.length < 21) return null;
            
            // 使用手掌中心点（更稳定）
            const hand1Center = this._getHandCenter(landmarks1);
            const hand2Center = this._getHandCenter(landmarks2);
            
            // 计算两只手的距离
            const distance = Math.sqrt(
                Math.pow(hand1Center.x - hand2Center.x, 2) + 
                Math.pow(hand1Center.y - hand2Center.y, 2) + 
                Math.pow((hand1Center.z || 0) - (hand2Center.z || 0), 2)
            );
            
            // 计算中心点
            const center = {
                x: (hand1Center.x + hand2Center.x) / 2,
                y: (hand1Center.y + hand2Center.y) / 2,
                z: ((hand1Center.z || 0) + (hand2Center.z || 0)) / 2
            };
            
            // 判断是缩放还是移动
            if (this._lastTwoHandDistance === null) {
                this._lastTwoHandDistance = distance;
                this._lastTwoHandCenter = center;
                return null;
            }
            
            const distanceChange = distance - this._lastTwoHandDistance;
            const distanceThreshold = 0.02;  // 缩放阈值
            
            // 更新记录的距离和中心点
            this._lastTwoHandDistance = distance;
            this._lastTwoHandCenter = center;
            
            if (Math.abs(distanceChange) > distanceThreshold) {
                // 距离变化较大，认为是缩放
                // 距离增大 = 放大，距离减小 = 缩小
                return { 
                    type: 'scale', 
                    center: center, 
                    distance: distance, 
                    distanceChange: distanceChange 
                };
            } else {
                // 距离变化很小，认为是移动
                return { 
                    type: 'move', 
                    center: center, 
                    distance: distance 
                };
            }
        },
        
        /**
         * 检测两只手的手势（保留用于兼容）
         */
        _detectTwoHandGesture: function(landmarks1, landmarks2) {
            if (!landmarks1 || !landmarks2 || landmarks1.length < 21 || landmarks2.length < 21) return null;
            
            // 使用每只手的食指指尖
            const hand1Tip = landmarks1[8];
            const hand2Tip = landmarks2[8];
            
            // 计算两指距离
            const distance = Math.sqrt(
                Math.pow(hand1Tip.x - hand2Tip.x, 2) + 
                Math.pow(hand1Tip.y - hand2Tip.y, 2) + 
                Math.pow((hand1Tip.z || 0) - (hand2Tip.z || 0), 2)
            );
            
            // 计算中心点
            const center = {
                x: (hand1Tip.x + hand2Tip.x) / 2,
                y: (hand1Tip.y + hand2Tip.y) / 2,
                z: ((hand1Tip.z || 0) + (hand2Tip.z || 0)) / 2
            };
            
            // 判断是捏合还是缩放
            if (this._lastTwoFingerDistance === null) {
                this._lastTwoFingerDistance = distance;
                this._lastTwoFingerCenter = center;
                return null;
            }
            
            const distanceChange = distance - this._lastTwoFingerDistance;
            const distanceThreshold = 0.03;  // 增加阈值，使区分更明显
            
            // 更新记录的距离和中心点
            this._lastTwoFingerDistance = distance;
            this._lastTwoFingerCenter = center;
            
            if (Math.abs(distanceChange) < distanceThreshold) {
                // 距离变化很小，认为是捏合（移动）
                return { type: 'pinch', center: center, distance: distance };
            } else {
                // 距离变化较大，认为是缩放
                return { type: 'scale', center: center, distance: distance, change: distanceChange };
            }
        },
        
        /**
         * 创建太阳系系统
         */
        _createTrackingCube: function() {
            if (!this._trackingThreeScene || !this.THREE) return;
            
            const THREE = this.THREE;
            
            // 重置状态
            this._cubePosition = { x: 0, y: 0, z: 0 };
            this._cubeScale = 1.0;
            this._cubeRotationEnabled = false;
            this._lastTwoFingerDistance = null;
            this._lastTwoFingerCenter = null;
            
            // 创建太阳系容器
            this._solarSystem = new THREE.Group();
            this._solarSystem.position.set(this._cubePosition.x, this._cubePosition.y, this._cubePosition.z);
            this._solarSystem.scale.set(this._cubeScale, this._cubeScale, this._cubeScale);
            
            // 创建太阳（中心发光球体）
            const sunGeometry = new THREE.SphereGeometry(0.3, 32, 32);
            const sunMaterial = new THREE.MeshBasicMaterial({
                color: 0xffd700,
                emissive: 0xffaa00,
                emissiveIntensity: 1.5
            });
            this._sun = new THREE.Mesh(sunGeometry, sunMaterial);
            this._solarSystem.add(this._sun);
            
            // 添加太阳光晕效果（使用粒子）
            const sunGlowGeometry = new THREE.SphereGeometry(0.35, 32, 32);
            const sunGlowMaterial = new THREE.MeshBasicMaterial({
                color: 0xffaa00,
                transparent: true,
                opacity: 0.3,
                side: THREE.BackSide
            });
            const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
            this._solarSystem.add(sunGlow);
            
            // 创建行星配置
            const planetConfigs = [
                { name: 'Mercury', radius: 0.08, distance: 0.8, color: 0x8c7853, speed: 0.02 },
                { name: 'Venus', radius: 0.1, distance: 1.1, color: 0xffc649, speed: 0.015 },
                { name: 'Earth', radius: 0.12, distance: 1.5, color: 0x6b93d6, speed: 0.012 },
                { name: 'Mars', radius: 0.09, distance: 2.0, color: 0xc1440e, speed: 0.01 },
                { name: 'Jupiter', radius: 0.2, distance: 2.8, color: 0xd8ca9d, speed: 0.006 }
            ];
            
            this._planets = [];
            this._planetOrbits = [];
            
            // 创建每个行星
            planetConfigs.forEach((config, index) => {
                // 创建行星
                const planetGeometry = new THREE.SphereGeometry(config.radius, 32, 32);
                const planetMaterial = new THREE.MeshStandardMaterial({
                    color: config.color,
                    emissive: config.color,
                    emissiveIntensity: 0.3,
                    metalness: 0.5,
                    roughness: 0.5
                });
                const planet = new THREE.Mesh(planetGeometry, planetMaterial);
                
                // 设置初始位置（在X轴上）
                planet.position.set(config.distance, 0, 0);
                planet.userData = {
                    angle: index * (Math.PI * 2 / planetConfigs.length),  // 初始角度
                    distance: config.distance,
                    speed: config.speed,
                    config: config
                };
                
                // 创建轨道线（可选，用于可视化）
                const orbitGeometry = new THREE.RingGeometry(config.distance - 0.01, config.distance + 0.01, 64);
                const orbitMaterial = new THREE.MeshBasicMaterial({
                    color: 0x444444,
                    transparent: true,
                    opacity: 0.2,
                    side: THREE.DoubleSide
                });
                const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
                orbit.rotation.x = Math.PI / 2;  // 水平放置
                this._planetOrbits.push(orbit);
                this._solarSystem.add(orbit);
                
                // 添加行星到太阳系
                this._solarSystem.add(planet);
                this._planets.push(planet);
            });
            
            // 创建粒子系统（背景星空效果）
            this._createParticleSystem();
            
            // 添加光源
            if (this._trackingThreeScene.children.find(child => child.type === 'AmbientLight') === undefined) {
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
                this._trackingThreeScene.add(ambientLight);
                
                // 太阳作为点光源
                const sunLight = new THREE.PointLight(0xffd700, 1.5, 10);
                sunLight.position.set(0, 0, 0);
                this._solarSystem.add(sunLight);
            }
            
            this._trackingThreeScene.add(this._solarSystem);
            
            // 保持兼容性：_trackingCube指向太阳系
            this._trackingCube = this._solarSystem;
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('HANDTRACKER', '太阳系已创建');
            }
        },
        
        /**
         * 创建粒子系统（背景星空效果）
         */
        _createParticleSystem: function() {
            if (!this._trackingThreeScene || !this.THREE) return;
            
            const THREE = this.THREE;
            const particles = [];
            const geometry = new THREE.BufferGeometry();
            
            // 创建粒子位置和颜色
            const positions = new Float32Array(this._particleCount * 3);
            const colors = new Float32Array(this._particleCount * 3);
            
            for (let i = 0; i < this._particleCount; i++) {
                // 随机位置（在较大范围内）
                const radius = 5 + Math.random() * 3;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                
                positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
                positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
                positions[i * 3 + 2] = radius * Math.cos(phi);
                
                // 随机颜色（偏白色和蓝色）
                const color = new THREE.Color();
                const hue = Math.random() < 0.7 ? 0.6 : Math.random();  // 70%蓝色，30%随机
                const saturation = 0.3 + Math.random() * 0.3;
                const lightness = 0.7 + Math.random() * 0.3;
                color.setHSL(hue, saturation, lightness);
                
                colors[i * 3] = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            
            // 创建粒子材质
            const material = new THREE.PointsMaterial({
                size: 0.05,
                vertexColors: true,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            });
            
            this._particleSystem = new THREE.Points(geometry, material);
            this._solarSystem.add(this._particleSystem);
        },
        
        /**
         * 更新行星轨道运动
         */
        _updatePlanetOrbits: function() {
            if (!this._planets || this._planets.length === 0) return;
            
            this._planets.forEach((planet) => {
                if (!planet.userData) return;
                
                const { angle, distance, speed } = planet.userData;
                
                // 更新角度
                planet.userData.angle += speed;
                
                // 计算新位置（椭圆轨道，稍微倾斜）
                const x = distance * Math.cos(angle);
                const y = distance * Math.sin(angle) * 0.3;  // 倾斜轨道
                const z = distance * Math.sin(angle) * 0.5;
                
                planet.position.set(x, y, z);
                
                // 行星自转
                planet.rotation.y += speed * 2;
            });
        },
        
        /**
         * 更新粒子系统
         */
        _updateParticleSystem: function() {
            if (!this._particleSystem) return;
            
            // 让粒子缓慢旋转，营造动态效果
            this._particleSystem.rotation.y += 0.0005;
            this._particleSystem.rotation.x += 0.0003;
        },
        
        /**
         * 删除立方体
         */
        _removeTrackingCube: function() {
            if (!this._solarSystem || !this._trackingThreeScene) return;
            
            // 清理太阳系
            this._trackingThreeScene.remove(this._solarSystem);
            
            // 清理太阳
            if (this._sun) {
                if (this._sun.geometry) this._sun.geometry.dispose();
                if (this._sun.material) this._sun.material.dispose();
                this._sun = null;
            }
            
            // 清理行星
            this._planets.forEach((planet) => {
                if (planet.geometry) planet.geometry.dispose();
                if (planet.material) planet.material.dispose();
            });
            this._planets = [];
            
            // 清理轨道
            this._planetOrbits.forEach((orbit) => {
                if (orbit.geometry) orbit.geometry.dispose();
                if (orbit.material) orbit.material.dispose();
            });
            this._planetOrbits = [];
            
            // 清理粒子系统
            if (this._particleSystem) {
                if (this._particleSystem.geometry) this._particleSystem.geometry.dispose();
                if (this._particleSystem.material) this._particleSystem.material.dispose();
                this._particleSystem = null;
            }
            
            this._solarSystem = null;
            this._trackingCube = null;
            this._cubeRotationEnabled = false;
            this._cubePosition = { x: 0, y: 0, z: 0 };
            this._cubeScale = 1.0;
            this._lastTwoFingerDistance = null;
            this._lastTwoFingerCenter = null;
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('HANDTRACKER', '太阳系已删除');
            }
        },
        
        /**
         * 使用两指移动立方体（增强版）
         */
        _moveCubeWithTwoFingers: function(center) {
            if (!this._solarSystem || !this._trackingThreeCamera || !this._trackingThreeRenderer || !this._isTwoFingerActive) return;
            
            const THREE = this.THREE;
            const currentTime = Date.now();
            
            // MediaPipe的坐标是归一化的(0-1)，需要转换为Three.js的NDC坐标(-1到1)
            // 注意：MediaPipe的坐标系统：x从左到右(0-1)，y从上到下(0-1)
            // Three.js的NDC坐标系统：x从左到右(-1到1)，y从下到上(-1到1)
            // 由于canvas上的视频是镜像的（scale(-1, 1)），所以需要镜像X轴来匹配屏幕显示
            const x = -(center.x * 2 - 1);  // 转换为-1到1，并镜像X轴
            const y = -((center.y * 2) - 1);  // 转换为-1到1，并翻转Y轴
            
            // 使用深度信息（Z坐标）来调整距离，使立方体更贴近手指
            // Z坐标范围大约是-0.5到0.5，负值表示更靠近相机
            const depth = center.z || 0;
            const baseDistance = 3.0;  // 基础距离
            const depthOffset = depth * 1.5;  // 深度偏移（根据Z坐标调整）
            const distance = baseDistance + depthOffset;
            
            // 使用相机的投影矩阵将2D坐标转换为3D坐标
            const vector = new THREE.Vector3(x, y, 0.5);
            vector.unproject(this._trackingThreeCamera);
            
            // 计算从相机到目标点的方向
            const dir = vector.sub(this._trackingThreeCamera.position).normalize();
            const targetPos = this._trackingThreeCamera.position.clone().add(dir.multiplyScalar(distance));
            
            // 计算移动速度（用于动态调整跟随速度）
            let lerpFactor = 0.18;  // 默认插值系数
            if (this._lastTwoFingerCenter3D) {
                const deltaTime = Math.max(16, currentTime - (this._twoFingerMoveHistory[this._twoFingerMoveHistory.length - 1]?.time || currentTime));
                const deltaX = targetPos.x - this._lastTwoFingerCenter3D.x;
                const deltaY = targetPos.y - this._lastTwoFingerCenter3D.y;
                const deltaZ = targetPos.z - this._lastTwoFingerCenter3D.z;
                
                // 计算速度（单位：单位/秒）
                const speed = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ) / (deltaTime / 1000);
                
                // 根据速度动态调整插值系数（快速移动时更敏感，慢速移动时更平滑）
                if (speed > 2.0) {
                    // 快速移动：提高响应速度
                    lerpFactor = 0.25;
                } else if (speed > 1.0) {
                    // 中速移动：标准速度
                    lerpFactor = 0.20;
                } else {
                    // 慢速移动：更平滑
                    lerpFactor = 0.15;
                }
                
                // 更新速度（用于平滑速度变化）
                this._twoFingerVelocity.x += (deltaX / (deltaTime / 1000) - this._twoFingerVelocity.x) * 0.3;
                this._twoFingerVelocity.y += (deltaY / (deltaTime / 1000) - this._twoFingerVelocity.y) * 0.3;
                this._twoFingerVelocity.z += (deltaZ / (deltaTime / 1000) - this._twoFingerVelocity.z) * 0.3;
            }
            
            // 保存移动历史（用于平滑处理）
            this._twoFingerMoveHistory.push({
                pos: targetPos.clone(),
                time: currentTime
            });
            
            // 保持历史记录在合理范围内（最近5个点）
            if (this._twoFingerMoveHistory.length > 5) {
                this._twoFingerMoveHistory.shift();
            }
            
            // 使用加权平均来平滑目标位置（最近的权重更大）
            let smoothedPos = new THREE.Vector3(0, 0, 0);
            let totalWeight = 0;
            for (let i = 0; i < this._twoFingerMoveHistory.length; i++) {
                const weight = (i + 1) / this._twoFingerMoveHistory.length;  // 越近权重越大
                smoothedPos.add(this._twoFingerMoveHistory[i].pos.clone().multiplyScalar(weight));
                totalWeight += weight;
            }
            smoothedPos.divideScalar(totalWeight);
            
            // 平滑移动（使用动态插值系数）
            this._cubePosition.x += (smoothedPos.x - this._cubePosition.x) * lerpFactor;
            this._cubePosition.y += (smoothedPos.y - this._cubePosition.y) * lerpFactor;
            this._cubePosition.z += (smoothedPos.z - this._cubePosition.z) * lerpFactor;
            
            // 限制立方体移动范围（防止移动到屏幕外太远）
            const maxRange = 8.0;
            this._cubePosition.x = Math.max(-maxRange, Math.min(maxRange, this._cubePosition.x));
            this._cubePosition.y = Math.max(-maxRange, Math.min(maxRange, this._cubePosition.y));
            this._cubePosition.z = Math.max(1.0, Math.min(8.0, this._cubePosition.z));  // Z轴范围限制
            
            if (this._solarSystem) {
                this._solarSystem.position.set(this._cubePosition.x, this._cubePosition.y, this._cubePosition.z);
            }
            
            // 更新上次位置
            this._lastTwoFingerCenter3D = targetPos.clone();
        },
        
        /**
         * 使用两只手缩放太阳系
         */
        _scaleSolarSystemWithTwoHands: function(distance, distanceChange) {
            if (!this._solarSystem || this._lastTwoHandDistance === null || !this._isTwoHandActive) return;
            
            // 根据距离变化缩放
            // distanceChange > 0 表示两只手远离（放大）
            // distanceChange < 0 表示两只手靠近（缩小）
            const scaleSensitivity = 2.0;  // 缩放敏感度
            const scaleChange = distanceChange * scaleSensitivity;
            this._cubeScale = Math.max(0.2, Math.min(6.0, this._cubeScale + scaleChange));
            
            if (this._solarSystem) {
                this._solarSystem.scale.set(this._cubeScale, this._cubeScale, this._cubeScale);
            }
            
            // 更新记录的距离
            this._lastTwoHandDistance = distance;
        },
        
        /**
         * 使用两只手移动太阳系
         */
        _moveSolarSystemWithTwoHands: function(center) {
            if (!this._solarSystem || !this._trackingThreeCamera || !this._trackingThreeRenderer || !this._isTwoHandActive) return;
            
            const THREE = this.THREE;
            
            // 将MediaPipe的归一化坐标转换为Three.js的NDC坐标
            const x = -((center.x * 2) - 1);  // 镜像X轴
            const y = -((center.y * 2) - 1);  // 翻转Y轴
            
            // 使用深度信息
            const depth = center.z || 0;
            const baseDistance = 3.0;
            const depthOffset = depth * 1.5;
            const distance = baseDistance + depthOffset;
            
            // 使用相机的投影矩阵将2D坐标转换为3D坐标
            const vector = new THREE.Vector3(x, y, 0.5);
            vector.unproject(this._trackingThreeCamera);
            
            // 计算从相机到目标点的方向
            const dir = vector.sub(this._trackingThreeCamera.position).normalize();
            const targetPos = this._trackingThreeCamera.position.clone().add(dir.multiplyScalar(distance));
            
            // 平滑移动
            const lerpFactor = 0.2;
            this._cubePosition.x += (targetPos.x - this._cubePosition.x) * lerpFactor;
            this._cubePosition.y += (targetPos.y - this._cubePosition.y) * lerpFactor;
            this._cubePosition.z += (targetPos.z - this._cubePosition.z) * lerpFactor;
            
            // 限制移动范围
            const maxRange = 8.0;
            this._cubePosition.x = Math.max(-maxRange, Math.min(maxRange, this._cubePosition.x));
            this._cubePosition.y = Math.max(-maxRange, Math.min(maxRange, this._cubePosition.y));
            this._cubePosition.z = Math.max(1.0, Math.min(8.0, this._cubePosition.z));
            
            if (this._solarSystem) {
                this._solarSystem.position.set(this._cubePosition.x, this._cubePosition.y, this._cubePosition.z);
            }
        },
        
        /**
         * 使用两指缩放立方体（保留用于单手指势）
         */
        _scaleCubeWithTwoFingers: function(distance) {
            if (!this._solarSystem || this._lastTwoFingerDistance === null || !this._isTwoFingerActive) return;
            
            // 计算缩放比例（基于距离变化）
            // 使用更大的缩放敏感度，使缩放更明显
            const scaleChange = (distance - this._lastTwoFingerDistance) * 3;
            this._cubeScale = Math.max(0.3, Math.min(5.0, this._cubeScale + scaleChange));
            
            if (this._solarSystem) {
                this._solarSystem.scale.set(this._cubeScale, this._cubeScale, this._cubeScale);
            }
            
            // 更新记录的距离
            this._lastTwoFingerDistance = distance;
        },
        
        /**
         * 更新圆形跟随手指
         */
        _updateTrackingCircles: function(results) {
            if (!this.canvas) return;
            
            const canvas = this.canvas;
            const rect = canvas.getBoundingClientRect();
            
            // 获取圆形容器
            let circleContainer = document.getElementById('handtracker-circle-container');
            if (!circleContainer) {
                // 如果容器不存在，创建它
                circleContainer = document.createElement('div');
                circleContainer.className = 'handtracker-circle-container';
                circleContainer.id = 'handtracker-circle-container';
                circleContainer.style.position = 'fixed';
                circleContainer.style.top = '0';
                circleContainer.style.left = '0';
                circleContainer.style.width = '100%';
                circleContainer.style.height = '100%';
                circleContainer.style.pointerEvents = 'none';
                circleContainer.style.zIndex = '999999';
                if (document.body) {
                    document.body.appendChild(circleContainer);
                }
            }
            
            // 收集所有手指的指尖位置（按手和手指索引组织）
            const fingerTips = [];
            for (let handIdx = 0; handIdx < results.landmarks.length; handIdx++) {
                const landmarks = results.landmarks[handIdx];
                if (!landmarks || landmarks.length < 21) continue;
                
                // 获取五个手指的指尖位置（拇指、食指、中指、无名指、小指）
                const fingerTipIndices = [4, 8, 12, 16, 20];
                for (let fingerIdx = 0; fingerIdx < fingerTipIndices.length; fingerIdx++) {
                    const tipIdx = fingerTipIndices[fingerIdx];
                    fingerTips.push({
                        landmark: landmarks[tipIdx],
                        handIndex: handIdx,
                        fingerIndex: fingerIdx,
                        uniqueId: `${handIdx}-${fingerIdx}`  // 唯一标识符
                    });
                }
            }
            
            // 确保有足够的圆形
            while (this._trackingCircles.length < fingerTips.length) {
                this._createTrackingCircle(circleContainer);
            }
            
            // 移除多余的圆形
            while (this._trackingCircles.length > fingerTips.length) {
                const circle = this._trackingCircles.pop();
                if (circle && circle.parentNode) {
                    circle.parentNode.removeChild(circle);
                }
            }
            
            // 初始化手指状态数组
            while (this._fingerTipStates.length < fingerTips.length) {
                this._fingerTipStates.push({
                    isPressed: false,
                    isDragging: false,
                    lastX: 0,
                    lastY: 0,
                    pressStartTime: 0,
                    pressStartX: 0,
                    pressStartY: 0
                });
            }
            while (this._fingerTipStates.length > fingerTips.length) {
                this._fingerTipStates.pop();
            }
            
            // 更新每个圆形的位置并处理手势
            for (let i = 0; i < fingerTips.length && i < this._trackingCircles.length; i++) {
                const tip = fingerTips[i];
                const circle = this._trackingCircles[i];
                const state = this._fingerTipStates[i];
                if (!circle || !tip || !state) continue;
                
                // 将MediaPipe的归一化坐标转换为屏幕像素坐标
                // 注意：canvas是镜像的，所以需要镜像X坐标
                const x = (1 - tip.landmark.x) * rect.width + rect.left;  // 镜像X轴
                const y = tip.landmark.y * rect.height + rect.top;
                
                // 更新圆形位置（平滑跟随）
                const lerpFactor = 0.6;  // 快速跟随
                const currentX = parseFloat(circle.style.left) || x;
                const currentY = parseFloat(circle.style.top) || y;
                const newX = currentX + (x - currentX) * lerpFactor;
                const newY = currentY + (y - currentY) * lerpFactor;
                
                circle.style.left = newX + 'px';
                circle.style.top = newY + 'px';
                
                // 检测手势（点击和拖动）
                this._handleFingerGesture(i, newX, newY, state, tip);
            }
        },
        
        /**
         * 创建跟踪圆形（HTML div）
         */
        _createTrackingCircle: function(container) {
            if (!container) return;
            
            // 创建圆形div元素
            const circle = document.createElement('div');
            circle.className = 'handtracker-finger-circle';
            circle.style.position = 'fixed';
            circle.style.width = '8px';  // 更小的圆形
            circle.style.height = '8px';
            circle.style.borderRadius = '50%';
            circle.style.backgroundColor = '#8b5cf6';
            circle.style.border = '2px solid rgba(255, 255, 255, 0.8)';
            circle.style.boxShadow = '0 0 10px rgba(139, 92, 246, 0.6)';
            circle.style.pointerEvents = 'none';
            circle.style.transform = 'translate(-50%, -50%)';
            circle.style.transition = 'none';
            circle.style.zIndex = '999999';
            circle.style.left = '0px';
            circle.style.top = '0px';
            
            container.appendChild(circle);
            this._trackingCircles.push(circle);
        },
        
        /**
         * 处理手指手势（点击和拖动）
         */
        _handleFingerGesture: function(index, x, y, state, tip) {
            if (!this._isGestureMode) return;
            
            const currentTime = Date.now();
            const moveThreshold = 5;  // 移动阈值（像素）
            const clickTimeThreshold = 300;  // 点击时间阈值（毫秒）
            
            // 计算移动距离
            const deltaX = x - state.lastX;
            const deltaY = y - state.lastY;
            const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // 检测手指是否按下（Z坐标小于阈值表示手指靠近屏幕）
            const isFingerDown = (tip.landmark.z || 0) < -0.05;  // Z坐标负值表示靠近
            
            if (isFingerDown && !state.isPressed) {
                // 手指按下
                state.isPressed = true;
                state.isDragging = false;
                state.pressStartTime = currentTime;
                state.pressStartX = x;
                state.pressStartY = y;
                state.lastX = x;
                state.lastY = y;
                
                // 模拟鼠标按下事件
                this._simulateMouseEvent('mousedown', x, y, 0);
                
            } else if (isFingerDown && state.isPressed) {
                // 手指持续按下，检查是否拖动
                if (moveDistance > moveThreshold) {
                    if (!state.isDragging) {
                        state.isDragging = true;
                    }
                    // 模拟鼠标移动事件（拖动）
                    this._simulateMouseEvent('mousemove', x, y, 0);
                }
                state.lastX = x;
                state.lastY = y;
                
            } else if (!isFingerDown && state.isPressed) {
                // 手指抬起
                const pressDuration = currentTime - state.pressStartTime;
                const totalMove = Math.sqrt(
                    Math.pow(x - state.pressStartX, 2) + 
                    Math.pow(y - state.pressStartY, 2)
                );
                
                if (state.isDragging || totalMove > moveThreshold) {
                    // 拖动结束
                    this._simulateMouseEvent('mouseup', x, y, 0);
                } else if (pressDuration < clickTimeThreshold) {
                    // 点击事件
                    this._simulateMouseEvent('mouseup', x, y, 0);
                    // 延迟触发点击事件，确保mouseup先触发
                    setTimeout(() => {
                        this._simulateMouseEvent('click', x, y, 0);
                    }, 10);
                } else {
                    // 长按后释放
                    this._simulateMouseEvent('mouseup', x, y, 0);
                }
                
                state.isPressed = false;
                state.isDragging = false;
            }
        },
        
        /**
         * 模拟鼠标事件
         */
        _simulateMouseEvent: function(type, x, y, button) {
            const event = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                button: button,
                buttons: button === 0 ? 1 : 0,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y
            });
            
            // 获取目标元素
            const target = document.elementFromPoint(x, y);
            if (target) {
                target.dispatchEvent(event);
            }
        },
        
        /**
         * 清除所有跟踪圆形
         */
        _clearTrackingCircles: function() {
            for (const circle of this._trackingCircles) {
                if (circle && circle.parentNode) {
                    circle.parentNode.removeChild(circle);
                }
            }
            
            this._trackingCircles = [];
            this._fingerTipStates = [];
        },
        
        /**
         * 检测是否点击到立方体（使用射线检测）
         */
        _checkCubeClick: function(fingerTip) {
            if (!this._solarSystem || !this._raycaster || !this._trackingThreeCamera || !this._trackingThreeRenderer) {
                return false;
            }
            
            const THREE = this.THREE;
            const canvas = this._trackingThreeRenderer.domElement;
            const rect = canvas.getBoundingClientRect();
            
            // MediaPipe的坐标是归一化的(0-1)，需要转换为canvas内的坐标
            // 注意：MediaPipe的坐标系统：x从左到右(0-1)，y从上到下(0-1)
            // Three.js的NDC坐标系统：x从左到右(-1到1)，y从下到上(-1到1)
            // 由于canvas上的视频是镜像的，需要镜像X轴
            const mouse = new THREE.Vector2();
            mouse.x = -((fingerTip.x * 2) - 1);  // 转换为-1到1，并镜像X轴
            mouse.y = -((fingerTip.y * 2) - 1);  // 转换为-1到1，并翻转Y轴
            
            // 更新射线检测器
            this._raycaster.setFromCamera(mouse, this._trackingThreeCamera);
            
            // 检测与立方体的交点
            const intersects = this._raycaster.intersectObjects([this._solarSystem, ...this._planets, this._sun].filter(Boolean));
            
            return intersects.length > 0;
        },
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: '手势跟踪器',
                type: 'GUI',
                version: '1.0.0',
                description: '手势和面部跟踪器 - 使用 MediaPipe 实时跟踪用户手部、手势和面部并绘制骨架',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: [
                    'MULTITHREADING_CREATE',
                    'MULTITHREADING_EXECUTE',
                    'EVENT_LISTENER',  // GUI 窗口需要事件监听权限
                    'MEDIA_ACCESS'     // 摄像头访问权限
                ],
                metadata: {
                    allowMultipleInstances: false  // 不支持多开
                }
            };
        }
    };
    
    // 导出到全局
    window.HANDTRACKER = HANDTRACKER;
    
})(window);


