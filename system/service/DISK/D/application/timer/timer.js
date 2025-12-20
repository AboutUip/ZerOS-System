// ZerOS Timer - 3D Time Compass
// Dynamic 3D time compass with ribbon and vortex effects using three.js

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
        compassGroup: null,        // 罗盘组
        timeTexts: [],            // 时间文字对象数组
        currentTimeText: null,    // 当前时间文字对象
        heartParticles: [],      // 爱心粒子数组
        ribbons: [],             // 丝带数组
        ambientLight: null,      // 环境光
        pointLights: [],         // 点光源数组
        fontLoader: null,        // 字体加载器
        
        // 配置
        heartCount: 50,          // 爱心数量
        heartSpeed: 0.5,         // 爱心浮动速度
        rotationSpeed: 0.01,     // 罗盘整体旋转速度
        spiralTurns: 3,          // 螺旋圈数
        baseRadius: 2,           // 起始半径
        radiusStep: 0.15,        // 半径增长步长
        textSize: 1.2,           // 文字大小
        flySpeed: 0.3,           // 飞扬速度
        flyAmplitude: 2,         // 飞扬幅度
        tiltSpeed: 0.2,          // 倾斜速度
        tiltAmplitude: 0.3,      // 倾斜幅度
        
        // 鼠标交互控制
        isMouseDown: false,       // 鼠标是否按下
        mouseX: 0,               // 鼠标X坐标
        mouseY: 0,               // 鼠标Y坐标
        cameraRotationX: 0,       // 相机旋转X
        cameraRotationY: 0,       // 相机旋转Y
        cameraDistance: 20,       // 相机距离（用于缩放）
        minDistance: 5,          // 最小缩放距离
        maxDistance: 50,         // 最大缩放距离
        
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
                console.error('Three.js未加载');
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
                background: radial-gradient(ellipse at center, rgba(15, 20, 30, 0.95) 0%, rgba(5, 10, 20, 0.98) 100%);
            `;
            this.window.appendChild(container);
            
            // 创建canvas
            this.canvas = document.createElement('canvas');
            container.appendChild(this.canvas);
            
            // 初始化Three.js场景
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x050a14);
            this.scene.fog = new THREE.FogExp2(0x050a14, 0.001);
            
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
                    console.log('[Timer] 使用 WebGPURenderer');
                } catch (e) {
                    console.warn('[Timer] WebGPURenderer 初始化失败，回退到 WebGLRenderer:', e);
                    this.renderer = null;
                }
            }
            
            if (!this.renderer) {
                this.renderer = new this.THREE.WebGLRenderer({ 
                    canvas: this.canvas,
                    antialias: true,
                    alpha: true
                });
                console.log('[Timer] 使用 WebGLRenderer');
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
            
            // 创建爱心粒子
            this._createHeartParticles();
            
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
            
            // 环境光
            this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
            this.scene.add(this.ambientLight);
            
            // 主光源（从上方）
            const mainLight = new THREE.DirectionalLight(0x8b5cf6, 1);
            mainLight.position.set(0, 10, 10);
            mainLight.castShadow = true;
            mainLight.shadow.mapSize.width = 2048;
            mainLight.shadow.mapSize.height = 2048;
            this.scene.add(mainLight);
            
            // 点光源1（紫色）
            const pointLight1 = new THREE.PointLight(0x8b5cf6, 1, 50);
            pointLight1.position.set(5, 5, 5);
            this.scene.add(pointLight1);
            this.pointLights.push(pointLight1);
            
            // 点光源2（粉色）
            const pointLight2 = new THREE.PointLight(0xff6b9d, 0.8, 50);
            pointLight2.position.set(-5, -5, 5);
            this.scene.add(pointLight2);
            this.pointLights.push(pointLight2);
            
            // 点光源3（蓝色）
            const pointLight3 = new THREE.PointLight(0x60a5fa, 0.6, 50);
            pointLight3.position.set(0, -10, 10);
            this.scene.add(pointLight3);
            this.pointLights.push(pointLight3);
        },
        
        /**
         * 创建文字纹理
         */
        _createTextTexture: function(text, isHighlight = false) {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const size = 512; // 增大canvas尺寸以获得更清晰的文字
            canvas.width = size;
            canvas.height = size;
            
            // 设置文字样式（移除发光效果）
            const fontSize = isHighlight ? size * 0.25 : size * 0.2;
            context.fillStyle = isHighlight ? '#ffffff' : '#ffffff'; // 所有文字都使用白色，提高对比度
            context.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", "Arial", sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            
            // 绘制文字（无发光效果）
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
         * 创建时间罗盘（螺旋形）
         */
        _createCompass: function() {
            const THREE = this.THREE;
            
            // 创建罗盘组
            this.compassGroup = new THREE.Group();
            
            // 生成时间数据
            const timeData = this._generateTimeData();
            
            // 创建螺旋形时间文字
            const totalItems = timeData.length;
            
            timeData.forEach((item, i) => {
                // 计算螺旋位置（从中心向外）
                const t = i / totalItems; // 0 到 1
                const angle = t * this.spiralTurns * Math.PI * 2;
                // 使用更平滑的半径增长，使文字分布更均匀
                const radius = this.baseRadius + t * this.radiusStep * totalItems * 0.5;
                const height = Math.sin(t * Math.PI * 6) * 1.5; // 增大高度变化范围
                
                // 计算3D位置（螺旋形，在XZ平面上）
                const x = Math.cos(angle) * radius;
                const y = height;
                const z = Math.sin(angle) * radius;
                
                const position = new THREE.Vector3(x, y, z);
                
                // 判断是否是当前时间
                const isCurrent = item.isCurrent;
                
                // 创建文字精灵
                const textSprite = this._createTextSprite(item.text, position, isCurrent);
                
                // 计算文字朝向（沿着螺旋切线方向）
                const nextAngle = ((i + 1) / totalItems) * this.spiralTurns * Math.PI * 2;
                const nextX = Math.cos(nextAngle) * (this.baseRadius + ((i + 1) / totalItems) * ((i + 1) / totalItems) * this.radiusStep * totalItems);
                const nextZ = Math.sin(nextAngle) * (this.baseRadius + ((i + 1) / totalItems) * ((i + 1) / totalItems) * this.radiusStep * totalItems);
                const direction = new THREE.Vector3(nextX - x, 0, nextZ - z).normalize();
                
                // 让文字沿着螺旋方向
                const lookAtPos = position.clone().add(direction);
                textSprite.lookAt(lookAtPos);
                
                // 存储文字对象信息
                textSprite.userData = {
                    timeData: item,
                    originalPosition: position.clone(),
                    isCurrent: isCurrent,
                    angle: angle
                };
                
                if (isCurrent) {
                    this.currentTimeText = textSprite;
                } else {
                    this.timeTexts.push(textSprite);
                }
                
                this.compassGroup.add(textSprite);
            });
            
            this.scene.add(this.compassGroup);
        },
        
        /**
         * 生成时间数据
         */
        _generateTimeData: function() {
            const now = new Date();
            const data = [];
            
            // 月份（1-12）
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            for (let i = 1; i <= 12; i++) {
                const month = i;
                const isCurrent = month === (now.getMonth() + 1);
                data.push({
                    text: monthNames[i - 1],
                    type: 'month',
                    value: month,
                    isCurrent: isCurrent
                });
            }
            
            // 日期（1-31）
            for (let i = 1; i <= 31; i++) {
                const day = i;
                const isCurrent = day === now.getDate();
                data.push({
                    text: day.toString(),
                    type: 'day',
                    value: day,
                    isCurrent: isCurrent
                });
            }
            
            // 星期（1-7，1=周一，7=周日）
            const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            for (let i = 0; i < 7; i++) {
                const weekday = i + 1; // 1-7
                // JavaScript的getDay()返回0-6（0=周日，1=周一...6=周六）
                // 转换为1-7格式：0->7, 1->1, 2->2, ..., 6->6
                const currentDay = now.getDay() === 0 ? 7 : now.getDay();
                const isCurrent = weekday === currentDay;
                data.push({
                    text: weekdays[i],
                    type: 'weekday',
                    value: weekday,
                    isCurrent: isCurrent
                });
            }
            
            // 小时（0-23）
            for (let i = 0; i < 24; i++) {
                const hour = i;
                const isCurrent = hour === now.getHours();
                const hourText = hour.toString().padStart(2, '0') + 'h';
                data.push({
                    text: hourText,
                    type: 'hour',
                    value: hour,
                    isCurrent: isCurrent
                });
            }
            
            // 分钟（0-59）
            for (let i = 0; i < 60; i++) {
                const minute = i;
                const isCurrent = minute === now.getMinutes();
                data.push({
                    text: minute.toString().padStart(2, '0') + 'm',
                    type: 'minute',
                    value: minute,
                    isCurrent: isCurrent
                });
            }
            
            // 秒（0-59）
            for (let i = 0; i < 60; i++) {
                const second = i;
                const isCurrent = second === now.getSeconds();
                data.push({
                    text: second.toString().padStart(2, '0') + 's',
                    type: 'second',
                    value: second,
                    isCurrent: isCurrent
                });
            }
            
            return data;
        },
        
        /**
         * 创建丝带和漩涡效果
         */
        _createRibbons: function() {
            const THREE = this.THREE;
            
            for (let i = 0; i < this.ribbonCount; i++) {
                // 创建螺旋曲线路径
                const points = [];
                const segments = 100;
                const turns = 2 + Math.random() * 2; // 2-4圈
                const radius = 3 + Math.random() * 5; // 3-8
                const height = 10 + Math.random() * 10; // 10-20
                
                for (let j = 0; j <= segments; j++) {
                    const t = j / segments;
                    const angle = t * turns * Math.PI * 2;
                    const r = radius * (1 + t * 0.5); // 半径逐渐增大
                    const x = Math.cos(angle) * r;
                    const y = (t - 0.5) * height; // 从下到上
                    const z = Math.sin(angle) * r;
                    points.push(new THREE.Vector3(x, y, z));
                }
                
                // 创建曲线
                const curve = new THREE.CatmullRomCurve3(points);
                
                // 创建管状几何体（丝带）
                const ribbonGeometry = new THREE.TubeGeometry(
                    curve,
                    segments,
                    0.1, // 半径
                    8,   // 径向分段
                    false // 不闭合
                );
                
                // 创建材质（渐变颜色）
                const colors = [
                    new THREE.Color(0xff6b9d),
                    new THREE.Color(0x8b5cf6),
                    new THREE.Color(0x60a5fa),
                    new THREE.Color(0xff9f43),
                    new THREE.Color(0xff4757)
                ];
                const color = colors[i % colors.length];
                
                const ribbonMaterial = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.3,
                    metalness: 0.5,
                    roughness: 0.3,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
                
                const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
                
                // 随机初始旋转
                ribbon.rotation.x = Math.random() * Math.PI * 2;
                ribbon.rotation.y = Math.random() * Math.PI * 2;
                ribbon.rotation.z = Math.random() * Math.PI * 2;
                
                // 存储旋转速度
                ribbon.userData = {
                    rotationSpeedX: (Math.random() - 0.5) * 0.02,
                    rotationSpeedY: (Math.random() - 0.5) * 0.02,
                    rotationSpeedZ: (Math.random() - 0.5) * 0.02,
                    baseRotationY: (i / this.ribbonCount) * Math.PI * 2 // 围绕中心旋转
                };
                
                this.ribbons.push(ribbon);
                this.scene.add(ribbon);
            }
        },
        
        /**
         * 创建爱心粒子
         */
        _createHeartParticles: function() {
            const THREE = this.THREE;
            
            const heartShape = new THREE.Shape();
            heartShape.moveTo(0, 0.25);
            heartShape.bezierCurveTo(0, 0.25, 0.1, 0.1, 0.25, 0.1);
            heartShape.bezierCurveTo(0.4, 0.1, 0.5, 0.25, 0.5, 0.25);
            heartShape.bezierCurveTo(0.5, 0.25, 0.6, 0.1, 0.75, 0.1);
            heartShape.bezierCurveTo(0.9, 0.1, 1, 0.25, 1, 0.5);
            heartShape.bezierCurveTo(1, 0.7, 0.8, 0.9, 0.5, 1.1);
            heartShape.bezierCurveTo(0.2, 0.9, 0, 0.7, 0, 0.5);
            heartShape.bezierCurveTo(0, 0.25, 0.1, 0.1, 0.25, 0.1);
            
            const heartGeometry = new THREE.ExtrudeGeometry(heartShape, {
                depth: 0.1,
                bevelEnabled: true,
                bevelThickness: 0.05,
                bevelSize: 0.05,
                bevelSegments: 8
            });
            
            // 创建多个爱心
            for (let i = 0; i < this.heartCount; i++) {
                const scale = 0.1 + Math.random() * 0.2;
                const heart = heartGeometry.clone();
                heart.scale(scale, scale, scale);
                
                const colors = [0xff6b9d, 0x8b5cf6, 0x60a5fa, 0xff9f43, 0xff4757];
                const color = colors[Math.floor(Math.random() * colors.length)];
                
                const heartMaterial = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.5,
                    metalness: 0.7,
                    roughness: 0.3,
                    transparent: true,
                    opacity: 0.8
                });
                
                const heartMesh = new THREE.Mesh(heart, heartMaterial);
                
                // 随机位置
                const radius = 20 + Math.random() * 30;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                heartMesh.position.set(
                    radius * Math.sin(phi) * Math.cos(theta),
                    radius * Math.sin(phi) * Math.sin(theta),
                    radius * Math.cos(phi)
                );
                
                // 随机旋转
                heartMesh.rotation.set(
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2
                );
                
                // 存储动画参数
                heartMesh.userData = {
                    originalPosition: heartMesh.position.clone(),
                    rotationSpeed: {
                        x: (Math.random() - 0.5) * 0.02,
                        y: (Math.random() - 0.5) * 0.02,
                        z: (Math.random() - 0.5) * 0.02
                    },
                    floatSpeed: {
                        x: (Math.random() - 0.5) * 0.01,
                        y: (Math.random() - 0.5) * 0.01,
                        z: (Math.random() - 0.5) * 0.01
                    },
                    floatAmplitude: {
                        x: Math.random() * 2 + 1,
                        y: Math.random() * 2 + 1,
                        z: Math.random() * 2 + 1
                    }
                };
                
                this.heartParticles.push(heartMesh);
                this.scene.add(heartMesh);
            }
        },
        
        /**
         * 更新时间
         */
        _updateTime: function() {
            const now = new Date();
            
            // 更新当前时间文字的高亮状态
            this.timeTexts.forEach(textSprite => {
                const item = textSprite.userData.timeData;
                let isCurrent = false;
                
                if (item.type === 'month') {
                    isCurrent = item.value === (now.getMonth() + 1);
                } else if (item.type === 'day') {
                    isCurrent = item.value === now.getDate();
                } else if (item.type === 'weekday') {
                    const currentDay = now.getDay() === 0 ? 7 : now.getDay();
                    isCurrent = item.value === currentDay;
                } else if (item.type === 'hour') {
                    isCurrent = item.value === now.getHours();
                } else if (item.type === 'minute') {
                    isCurrent = item.value === now.getMinutes();
                } else if (item.type === 'second') {
                    isCurrent = item.value === now.getSeconds();
                }
                
                // 更新高亮状态
                if (isCurrent !== textSprite.userData.isCurrent) {
                    textSprite.userData.isCurrent = isCurrent;
                    // 重新创建纹理
                    const newTexture = this._createTextTexture(item.text, isCurrent);
                    textSprite.material.map = newTexture;
                    textSprite.material.needsUpdate = true;
                    textSprite.material.opacity = isCurrent ? 1 : 0.95; // 移除呼吸效果
                    textSprite.scale.set(
                        this.textSize * (isCurrent ? 1.3 : 1), // 固定大小，无动画
                        this.textSize * (isCurrent ? 1.3 : 1),
                        1
                    );
                    
                    if (isCurrent && this.currentTimeText !== textSprite) {
                        // 取消之前的高亮
                        if (this.currentTimeText) {
                            const oldItem = this.currentTimeText.userData.timeData;
                            const oldTexture = this._createTextTexture(oldItem.text, false);
                            this.currentTimeText.material.map = oldTexture;
                            this.currentTimeText.material.needsUpdate = true;
                            this.currentTimeText.material.opacity = 0.95;
                            this.currentTimeText.scale.set(this.textSize, this.textSize, 1);
                            this.currentTimeText.userData.isCurrent = false;
                        }
                        this.currentTimeText = textSprite;
                    }
                }
            });
            
            // 更新文字朝向（保持沿着螺旋方向，但稍微面向相机）
            this.compassGroup.children.forEach((child, index) => {
                if (child instanceof this.THREE.Sprite && child.userData.angle !== undefined) {
                    const angle = child.userData.angle;
                    const nextIndex = (index + 1) % this.compassGroup.children.length;
                    const nextT = nextIndex / this.compassGroup.children.length;
                    const nextAngle = nextT * this.spiralTurns * Math.PI * 2;
                    
                    // 计算螺旋切线方向
                    const THREE = this.THREE;
                    const direction = new THREE.Vector3(
                        -Math.sin(angle),
                        0,
                        Math.cos(angle)
                    ).normalize();
                    
                    // 混合螺旋方向和相机方向，让文字更易读
                    const cameraDir = this.camera.position.clone().sub(child.position).normalize();
                    const finalDir = direction.clone().multiplyScalar(0.6).add(cameraDir.multiplyScalar(0.4)).normalize();
                    child.lookAt(child.position.clone().add(finalDir.multiplyScalar(5)));
                }
            });
        },
        
        /**
         * 更新爱心动画
         */
        _updateHeartParticles: function() {
            const time = this.clock.getElapsedTime();
            
            this.heartParticles.forEach((heart, index) => {
                // 旋转
                heart.rotation.x += heart.userData.rotationSpeed.x;
                heart.rotation.y += heart.userData.rotationSpeed.y;
                heart.rotation.z += heart.userData.rotationSpeed.z;
                
                // 浮动
                heart.position.x = heart.userData.originalPosition.x + 
                    Math.sin(time * this.heartSpeed + index) * heart.userData.floatAmplitude.x;
                heart.position.y = heart.userData.originalPosition.y + 
                    Math.cos(time * this.heartSpeed * 0.7 + index) * heart.userData.floatAmplitude.y;
                heart.position.z = heart.userData.originalPosition.z + 
                    Math.sin(time * this.heartSpeed * 1.3 + index) * heart.userData.floatAmplitude.z;
                
                // 面向相机（可选，让爱心更立体）
                heart.lookAt(this.camera.position);
            });
        },
        
        /**
         * 更新罗盘动画（整体飞扬旋转效果）
         */
        _updateCompass: function() {
            const time = this.clock.getElapsedTime();
            const THREE = this.THREE;
            
            if (!this.compassGroup) return;
            
            // 整体旋转（Y轴旋转）
            this.compassGroup.rotation.y = time * this.rotationSpeed;
            
            // 飞扬效果：上下浮动
            this.compassGroup.position.y = Math.sin(time * this.flySpeed) * this.flyAmplitude;
            
            // 倾斜效果：X轴和Z轴轻微倾斜，形成飞扬感
            this.compassGroup.rotation.x = Math.sin(time * this.tiltSpeed) * this.tiltAmplitude;
            this.compassGroup.rotation.z = Math.cos(time * this.tiltSpeed * 0.7) * this.tiltAmplitude * 0.5;
            
            // 轻微的水平摆动（X轴和Z轴位置）
            this.compassGroup.position.x = Math.sin(time * this.flySpeed * 0.5) * this.flyAmplitude * 0.3;
            this.compassGroup.position.z = Math.cos(time * this.flySpeed * 0.7) * this.flyAmplitude * 0.3;
            
            // 保持文字在原始位置（相对于罗盘组）
            this.compassGroup.children.forEach((child) => {
                if (child instanceof THREE.Sprite) {
                    child.position.y = child.userData.originalPosition.y;
                }
            });
        },
        
        /**
         * 更新丝带和漩涡动画
         */
        _updateRibbons: function() {
            const time = this.clock.getElapsedTime();
            
            this.ribbons.forEach((ribbon) => {
                // 自转
                ribbon.rotation.x += ribbon.userData.rotationSpeedX;
                ribbon.rotation.y += ribbon.userData.rotationSpeedY;
                ribbon.rotation.z += ribbon.userData.rotationSpeedZ;
                
                // 围绕中心旋转（漩涡效果）
                const orbitRadius = 8 + Math.sin(time * 0.5 + ribbon.userData.baseRotationY) * 2;
                const orbitAngle = ribbon.userData.baseRotationY + time * this.ribbonRotationSpeed;
                ribbon.position.x = Math.cos(orbitAngle) * orbitRadius;
                ribbon.position.z = Math.sin(orbitAngle) * orbitRadius;
                ribbon.position.y = Math.sin(time * 0.3 + ribbon.userData.baseRotationY) * 3;
                
                // 飞扬效果（轻微上下浮动）
                ribbon.rotation.x += Math.sin(time * 0.7) * 0.01;
                ribbon.rotation.z += Math.cos(time * 0.5) * 0.01;
            });
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
            
            // 更新爱心
            this._updateHeartParticles();
            
            // 更新罗盘（包含飞扬旋转效果）
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
                this.currentTimeText = null;
                this.heartParticles = [];
                this.ribbons = [];
                this.ambientLight = null;
                this.pointLights = [];
                this.fontLoader = null;
                this.window = null;
                this.windowId = null;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('TIMER', `清理资源失败: ${error.message}`, error);
                } else {
                    console.error('清理资源失败:', error);
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
                description: '3D Time Compass - Dynamic 3D time compass with ribbon and vortex effects',
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

