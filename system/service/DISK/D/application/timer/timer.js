// ZerOS Timer - 3D Time Compass
// Cool 3D digital clock

(function(window) {
    'use strict';
    
    const TIMER = {
        pid: null,
        window: null,
        canvas: null,
        scene: null,
        camera: null,
        renderer: null,
        clock: null,
        animationId: null,
        
        // 3D对象引用
        compassGroup: null,
        timeTexts: [],
        stars: [],
        ambientLight: null,
        pointLights: [],
        
        // 配置
        starCount: 100,
        textSize: 4,
        
        // 鼠标交互控制
        isMouseDown: false,
        mouseX: 0,
        mouseY: 0,
        cameraRotationX: 0,
        cameraRotationY: 0,
        cameraDistance: 25,
        minDistance: 10,
        maxDistance: 50,
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 加载Three.js库（完全使用DynamicManager，参考handtracker）
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
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'timer-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            
            // 设置窗口样式
            if (typeof GUIManager === 'undefined') {
                this.window.style.cssText = `
                    width: 800px;
                    height: 800px;
                    display: flex;
                    flex-direction: column;
                    background: transparent;
                    border: 1px solid rgba(139, 92, 246, 0.3);
                    border-radius: 12px;
                    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(30px) saturate(180%);
                    -webkit-backdrop-filter: blur(30px) saturate(180%);
                    overflow: hidden;
                `;
            } else {
                this.window.style.cssText = `
                    width: 800px;
                    height: 800px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                `;
            }
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('timer');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '3D Time Compass',
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
            
            // 创建3D场景（异步）
            await this._create3DScene();
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 开始动画循环
            this._animate();
            
            // 如果使用GUIManager，窗口已自动居中并获得焦点
            if (typeof GUIManager !== 'undefined') {
                GUIManager.focusWindow(pid);
            }
        },
        
        
        /**
         * 创建3D场景
         */
        _create3DScene: async function() {
            if (!this.THREE) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Timer', 'Three.js未加载');
                }
                return;
            }
            
            // 使用局部变量引用，避免重复访问 this.THREE（参考handtracker）
            const THREE = this.THREE;
            
            // 创建canvas容器
            const container = document.createElement('div');
            container.className = 'timer-canvas-container';
            container.style.cssText = `
                flex: 1;
                position: relative;
                overflow: hidden;
                background: radial-gradient(ellipse at center, #0a0a1a 0%, #050510 100%);
            `;
            this.window.appendChild(container);
            
            // 创建canvas
            this.canvas = document.createElement('canvas');
            container.appendChild(this.canvas);
            
            // 初始化Three.js场景 - 更深邃的星空背景
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x030308);
            this.scene.fog = new THREE.FogExp2(0x030308, 0.0008);
            
            // 创建相机（从斜上方观察螺旋）
            const width = 800;
            const height = 800;
            this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
            // 初始化相机位置和距离
            this.cameraDistance = 20;
            this.cameraRotationX = 0.5; // 初始俯视角度
            this.cameraRotationY = 0;
            this._updateCameraPosition();
            
            // 创建渲染器（尝试WebGPU，回退到WebGL，参考handtracker）
            if (this.THREE.WebGPURenderer) {
                try {
                    this.renderer = new this.THREE.WebGPURenderer({ 
                        canvas: this.canvas,
                        antialias: true,
                        alpha: true
                    });
                    // WebGPURenderer 需要异步初始化
                    await this.renderer.init();
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('Timer', '使用 WebGPURenderer');
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('Timer', 'WebGPURenderer 初始化失败，回退到 WebGLRenderer', e);
                    }
                    this.renderer = null;
                }
            }
            
            if (!this.renderer) {
                this.renderer = new this.THREE.WebGLRenderer({ 
                    canvas: this.canvas,
                    antialias: true,
                    alpha: true
                });
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('Timer', '使用 WebGLRenderer');
                }
            }
            
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            if (this.renderer.shadowMap) {
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            }
            
            // 创建时钟
            this.clock = new THREE.Clock();
            
            // 创建光源
            this._createLights();
            
            // 创建时间罗盘
            this._createCompass();
            
            // 创建星空背景
            this._createStars();
            
            // 添加鼠标交互控制
            this._setupMouseControls();
            
            // 处理窗口大小变化
            this._handleResize();
        },
        
        /**
         * 创建光源
         */
        _createLights: function() {
            const THREE = this.THREE;
            
            // 环境光 - 更柔和
            this.ambientLight = new THREE.AmbientLight(0x8888ff, 0.2);
            this.scene.add(this.ambientLight);
            
            // 主光源 - 温暖的蓝紫色
            const mainLight = new THREE.DirectionalLight(0xa78bfa, 0.8);
            mainLight.position.set(5, 15, 10);
            mainLight.castShadow = true;
            mainLight.shadow.mapSize.width = 1024;
            mainLight.shadow.mapSize.height = 1024;
            this.scene.add(mainLight);
            
            // 点光源1 - 紫色光晕
            const pointLight1 = new THREE.PointLight(0xa855f7, 1.2, 60);
            pointLight1.position.set(10, 8, 10);
            this.scene.add(pointLight1);
            this.pointLights.push(pointLight1);
            
            // 点光源2 - 粉色星光
            const pointLight2 = new THREE.PointLight(0xec4899, 0.8, 60);
            pointLight2.position.set(-10, -5, 8);
            this.scene.add(pointLight2);
            this.pointLights.push(pointLight2);
            
            // 点光源3 - 蓝色氛围
            const pointLight3 = new THREE.PointLight(0x3b82f6, 0.6, 80);
            pointLight3.position.set(0, -15, 15);
            this.scene.add(pointLight3);
            this.pointLights.push(pointLight3);
        },
        
        /**
         * 创建文字纹理 - 带发光效果
         */
        _createTextTexture: function(text, isHighlight = false) {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const size = 512;
            canvas.width = size;
            canvas.height = size;
            
            // 高亮文字：蓝紫色渐变发光
            if (isHighlight) {
                // 外发光
                context.shadowColor = '#a855f7';
                context.shadowBlur = 30;
                
                // 渐变填充
                const gradient = context.createLinearGradient(0, 0, size, size);
                gradient.addColorStop(0, '#e9d5ff');
                gradient.addColorStop(0.5, '#c084fc');
                gradient.addColorStop(1, '#a855f7');
                context.fillStyle = gradient;
            } else {
                // 普通文字：柔和白色发光
                context.shadowColor = '#6366f1';
                context.shadowBlur = 15;
                context.fillStyle = '#e0e7ff';
            }
            
            const fontSize = isHighlight ? size * 0.28 : size * 0.22;
            context.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", "Arial", sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            
            // 绘制文字
            context.fillText(text, size / 2, size / 2);
            
            const texture = new this.THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        },
        
        /**
         * 创建文字精灵
         */
        _createTextSprite: function(text, position, isHighlight = false) {
            const THREE = this.THREE;
            const texture = this._createTextTexture(text, isHighlight);
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: isHighlight ? 1 : 0.95, // 提高不透明度，移除呼吸效果
                depthTest: false,
                depthWrite: false
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            const scale = this.textSize * (isHighlight ? 1.3 : 1); // 高亮文字稍大，但无动画
            sprite.scale.set(scale, scale, 1);
            sprite.position.copy(position);
            return sprite;
        },
        
        /**
         * 创建时间罗盘 - 简洁的当前时间显示
         */
        _createCompass: function() {
            const THREE = this.THREE;
            
            // 创建罗盘组
            this.compassGroup = new THREE.Group();
            
            // 生成当前时间字符串 "HH:MM:SS"
            const timeStr = this._getCurrentTimeString();
            
            // 分割时间字符
            const chars = timeStr.split('');
            
            // 计算总宽度来居中
            const charWidth = 4;
            const totalWidth = chars.length * charWidth;
            const startX = -totalWidth / 2 + charWidth / 2;
            
            // 为每个字符创建3D文字
            chars.forEach((char, i) => {
                const x = startX + i * charWidth;
                const position = new THREE.Vector3(x, 0, 0);
                
                // 创建文字精灵
                const textSprite = this._createTextSprite(char, position, true);
                
                // 存储信息
                textSprite.userData = {
                    char: char,
                    originalPosition: position.clone()
                };
                
                this.timeTexts.push(textSprite);
                this.compassGroup.add(textSprite);
            });
            
            this.scene.add(this.compassGroup);
        },
        
        /**
         * 获取当前时间字符串
         */
        _getCurrentTimeString: function() {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            return `${hours}:${minutes}:${seconds}`;
        },
        
        /**
         * 创建星空背景
         */
        _createStars: function() {
            const THREE = this.THREE;
            
            // 创建星空粒子系统
            const starGeometry = new THREE.BufferGeometry();
            const positions = [];
            const colors = [];
            const sizes = [];
            
            // 星空颜色：蓝紫色系
            const starColors = [
                new THREE.Color(0xa855f7), // 紫色
                new THREE.Color(0x6366f1), // 靛蓝
                new THREE.Color(0x3b82f6), // 蓝色
                new THREE.Color(0xe879f9), // 粉色
                new THREE.Color(0x22d3ee), // 青色
            ];
            
            for (let i = 0; i < this.starCount; i++) {
                // 分布在更大的球形范围内
                const radius = 40 + Math.random() * 60;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                
                const x = radius * Math.sin(phi) * Math.cos(theta);
                const y = radius * Math.sin(phi) * Math.sin(theta);
                const z = radius * Math.cos(phi);
                
                positions.push(x, y, z);
                
                // 随机颜色
                const color = starColors[Math.floor(Math.random() * starColors.length)];
                colors.push(color.r, color.g, color.b);
                
                // 随机大小
                sizes.push(0.5 + Math.random() * 1.5);
            }
            
            starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            starGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
            
            // 星空材质 - 点发光效果
            const starMaterial = new THREE.PointsMaterial({
                size: 1.5,
                vertexColors: true,
                transparent: true,
                opacity: 0.8,
                sizeAttenuation: true,
                blending: THREE.AdditiveBlending
            });
            
            this.stars = new THREE.Points(starGeometry, starMaterial);
            this.scene.add(this.stars);
        },
        
        /**
         * 更新时间 - 每秒更新时间显示
         */
        _updateTime: function() {
            if (!this.compassGroup) return;
            
            const now = new Date();
            const newTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            
            // 更新每个字符
            this.compassGroup.children.forEach((sprite, index) => {
                if (!sprite.userData.char) return;
                
                const newChar = newTimeStr[index];
                if (newChar && newChar !== sprite.userData.char) {
                    sprite.userData.char = newChar;
                    const texture = this._createTextTexture(newChar, true);
                    sprite.material.map = texture;
                    sprite.material.needsUpdate = true;
                }
            });
        },
        
        /**
         * 更新罗盘动画 - 简洁优雅的旋转
         */
        _updateCompass: function() {
            if (!this.compassGroup) return;
            
            // 缓慢优雅的Y轴旋转
            this.compassGroup.rotation.y += 0.002;
        },
        
        /**
         * 更新相机位置（基于旋转和距离）
         */
        _updateCameraPosition: function() {
            const THREE = this.THREE;
            const x = Math.sin(this.cameraRotationY) * Math.cos(this.cameraRotationX) * this.cameraDistance;
            const y = Math.sin(this.cameraRotationX) * this.cameraDistance;
            const z = Math.cos(this.cameraRotationY) * Math.cos(this.cameraRotationX) * this.cameraDistance;
            
            this.camera.position.set(x, y, z);
            this.camera.lookAt(0, 0, 0);
        },
        
        /**
         * 设置鼠标交互控制
         */
        _setupMouseControls: function() {
            if (!this.canvas) return;
            
            const canvas = this.canvas;
            
            // 使用 EventManager 注册事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                // 鼠标按下（绑定到 canvas）
                EventManager.registerElementEvent(this.pid, canvas, 'mousedown', (e) => {
                    // 只处理鼠标左键
                    if (e.button !== 0) return;
                    
                    this.isMouseDown = true;
                    this.mouseX = e.clientX;
                    this.mouseY = e.clientY;
                    canvas.style.cursor = 'grabbing';
                    e.preventDefault();
                });
                
                // 鼠标移动（旋转）- 使用全局事件，因为需要在鼠标离开 canvas 后也能响应
                EventManager.registerEventHandler(this.pid, 'mousemove', (e) => {
                    if (this.isMouseDown) {
                        const deltaX = e.clientX - this.mouseX;
                        const deltaY = e.clientY - this.mouseY;
                        
                        // 旋转相机（反转水平方向）
                        this.cameraRotationY -= deltaX * 0.01;
                        this.cameraRotationX += deltaY * 0.01;
                        
                        // 限制X旋转角度（防止翻转）
                        this.cameraRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraRotationX));
                        
                        this._updateCameraPosition();
                        
                        this.mouseX = e.clientX;
                        this.mouseY = e.clientY;
                    }
                }, {
                    priority: 100,
                    selector: null  // 不使用选择器，让处理程序自己检查 isMouseDown 状态
                });
                
                // 鼠标释放 - 使用全局事件，因为需要在鼠标离开 canvas 后也能响应
                EventManager.registerEventHandler(this.pid, 'mouseup', (e) => {
                    // 只处理鼠标左键
                    if (e.button !== 0) return;
                    
                    if (this.isMouseDown) {
                        this.isMouseDown = false;
                        canvas.style.cursor = 'grab';
                    }
                }, {
                    priority: 100,
                    selector: null  // 不使用选择器，让处理程序自己检查 isMouseDown 状态
                });
                
                // 鼠标离开画布
                EventManager.registerElementEvent(this.pid, canvas, 'mouseleave', () => {
                    // 注意：不在这里重置 isMouseDown，因为用户可能还在拖动
                    // 只有在 mouseup 时才重置
                    canvas.style.cursor = 'default';
                });
                
                // 鼠标进入画布
                EventManager.registerElementEvent(this.pid, canvas, 'mouseenter', () => {
                    if (!this.isMouseDown) {
                        canvas.style.cursor = 'grab';
                    }
                });
                
                // 鼠标滚轮（缩放）
                EventManager.registerElementEvent(this.pid, canvas, 'wheel', (e) => {
                    e.preventDefault();
                    
                    const delta = e.deltaY > 0 ? 1.1 : 0.9;
                    this.cameraDistance *= delta;
                    
                    // 限制缩放范围
                    this.cameraDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.cameraDistance));
                    
                    this._updateCameraPosition();
                });
            } else {
                // 降级方案
                // 鼠标按下
                canvas.addEventListener('mousedown', (e) => {
                    this.isMouseDown = true;
                    this.mouseX = e.clientX;
                    this.mouseY = e.clientY;
                    canvas.style.cursor = 'grabbing';
                });
                
                // 鼠标移动（旋转）
                canvas.addEventListener('mousemove', (e) => {
                    if (this.isMouseDown) {
                        const deltaX = e.clientX - this.mouseX;
                        const deltaY = e.clientY - this.mouseY;
                        
                        // 旋转相机（反转水平方向）
                        this.cameraRotationY -= deltaX * 0.01;
                        this.cameraRotationX += deltaY * 0.01;
                        
                        // 限制X旋转角度（防止翻转）
                        this.cameraRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraRotationX));
                        
                        this._updateCameraPosition();
                        
                        this.mouseX = e.clientX;
                        this.mouseY = e.clientY;
                    }
                });
                
                // 鼠标释放
                canvas.addEventListener('mouseup', () => {
                    this.isMouseDown = false;
                    canvas.style.cursor = 'grab';
                });
                
                // 鼠标离开画布
                canvas.addEventListener('mouseleave', () => {
                    this.isMouseDown = false;
                    canvas.style.cursor = 'default';
                });
                
                // 鼠标滚轮（缩放）
                canvas.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    
                    const delta = e.deltaY > 0 ? 1.1 : 0.9;
                    this.cameraDistance *= delta;
                    
                    // 限制缩放范围
                    this.cameraDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.cameraDistance));
                    
                    this._updateCameraPosition();
                });
            }
            
            // 设置初始光标样式
            canvas.style.cursor = 'grab';
        },
        
        /**
         * 动画循环
         */
        _animate: function() {
            this.animationId = requestAnimationFrame(() => this._animate());
            
            // 更新时间
            this._updateTime();
            
            // 更新星空旋转
            if (this.stars) {
                this.stars.rotation.y += 0.0002;
                this.stars.rotation.x += 0.0001;
            }
            
            // 更新罗盘
            this._updateCompass();
            
            // 渲染
            this.renderer.render(this.scene, this.camera);
        },
        
        /**
         * 处理窗口大小变化
         */
        _handleResize: function() {
            const resizeObserver = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (this.camera && this.renderer) {
                        this.camera.aspect = width / height;
                        this.camera.updateProjectionMatrix();
                        this.renderer.setSize(width, height);
                    }
                }
            });
            
            if (this.canvas && this.canvas.parentElement) {
                resizeObserver.observe(this.canvas.parentElement);
            }
        },
        
        /**
         * 退出
         */
        __exit__: async function() {
            try {
                // 停止动画
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }
                
                // EventManager 会自动清理所有事件监听器，但如果有直接使用 addEventListener 的，需要手动清理
                // 这里不需要手动清理，因为 EventManager 会自动处理
                
                // 清理Three.js资源
                if (this.scene) {
                    this.scene.traverse((object) => {
                        if (object.geometry) object.geometry.dispose();
                        if (object.material) {
                            if (Array.isArray(object.material)) {
                                object.material.forEach(material => material.dispose());
                            } else {
                                object.material.dispose();
                            }
                        }
                    });
                    this.scene = null;
                }
                
                if (this.renderer) {
                    this.renderer.dispose();
                    this.renderer = null;
                }
                
                // 注销窗口（优先使用 windowId）
                if (typeof GUIManager !== 'undefined') {
                    if (this.windowId) {
                        await GUIManager.unregisterWindow(this.windowId);
                    } else if (this.pid) {
                        await GUIManager.unregisterWindow(this.pid);
                    }
                } else if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                
                // 清理所有对象引用
                this.canvas = null;
                this.camera = null;
                this.clock = null;
                this.compassGroup = null;
                this.timeTexts = [];
                this.stars = [];
                this.ambientLight = null;
                this.pointLights = [];
                this.window = null;
                this.windowId = null;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('TIMER', `清理资源失败: ${error.message}`, error);
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('Timer', '清理资源失败', error);
                    }
                }
            }
        },
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'Timer',
                type: 'GUI',
                version: '1.0.0',
                description: '3D Time Compass - Cool 3D digital clock',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        }
    };
    
    // 注册到全局
    if (typeof window !== 'undefined' && window.TIMER === undefined) {
        window.TIMER = TIMER;
    }
    
})(window);

