// 3D Horror Game - Horror Mansion
// ZerOS Enterprise Game Project
(function(window) {
    'use strict';

    const PROGRAM_NAME = 'HORRORMANSION';
    
    // 样式定义
    const STYLES = `
    .horrormansion-window {
        background-color: #000;
        overflow: hidden;
        position: relative;
        user-select: none;
        font-family: 'Courier New', Courier, monospace;
        display: flex;
        flex-direction: column;
    }

    #hm-game-container {
        flex: 1;
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
    }
    
    #hm-canvas {
        width: 100%;
        height: 100%;
        display: block;
    }
    
    #hm-ui {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 20px;
        box-sizing: border-box;
        z-index: 10;
        display: none; /* 默认隐藏 */
    }
    
    #hm-crosshair {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 4px;
        height: 4px;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
        display: none; /* 默认隐藏 */
    }
    
    .hm-hud-top {
        display: flex;
        justify-content: space-between;
    }
    
    .hm-hud-text {
        color: #e74c3c;
        font-size: 20px;
        font-weight: bold;
        text-shadow: 2px 2px 0px #000;
        letter-spacing: 1px;
    }
    
    #hm-message {
        position: absolute;
        top: 30%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #fff;
        font-size: 24px;
        text-shadow: 0 0 10px #f00;
        opacity: 0;
        transition: opacity 0.5s;
    }
    
    #hm-loading {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #000;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 100;
        color: #c0392b;
    }
    
    .hm-spinner {
        width: 50px;
        height: 50px;
        border: 5px solid #333;
        border-top: 5px solid #c0392b;
        border-radius: 50%;
        animation: hm-spin 1s linear infinite;
        margin-bottom: 20px;
    }
    
    @keyframes hm-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    /* Main Menu Styles */
    #hm-main-menu {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: none;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 90;
        background-image: radial-gradient(circle, rgba(50,0,0,0.2) 0%, rgba(0,0,0,1) 100%);
    }

    .hm-title {
        font-size: 60px;
        color: #c0392b;
        text-shadow: 0 0 20px #f00;
        margin-bottom: 60px;
        font-family: 'Courier New', Courier, monospace;
        letter-spacing: 5px;
        font-weight: bold;
        animation: hm-pulse 3s infinite;
    }

    @keyframes hm-pulse {
        0% { text-shadow: 0 0 20px #f00; opacity: 1; }
        50% { text-shadow: 0 0 10px #800; opacity: 0.8; }
        100% { text-shadow: 0 0 20px #f00; opacity: 1; }
    }

    .hm-menu-btn {
        background: transparent;
        color: #bbb;
        border: 1px solid #444;
        padding: 12px 0;
        margin: 10px;
        font-size: 20px;
        font-family: inherit;
        cursor: pointer;
        width: 250px;
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 2px;
        text-align: center;
    }

    .hm-menu-btn:hover {
        background: rgba(192, 57, 43, 0.2);
        border-color: #c0392b;
        color: #fff;
        text-shadow: 0 0 5px #c0392b;
        transform: scale(1.05);
    }

    #hm-settings-modal {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 400px;
        background: rgba(20, 20, 20, 0.95);
        border: 1px solid #c0392b;
        padding: 30px;
        display: none;
        z-index: 95;
        text-align: center;
        color: #fff;
        box-shadow: 0 0 50px rgba(0,0,0,0.8);
    }
    
    .hm-settings-row {
        margin: 25px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 18px;
    }

    input[type=range] {
        width: 60%;
        accent-color: #c0392b;
    }
    
    .hm-damage-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        box-shadow: inset 0 0 0 0 rgba(255, 0, 0, 0);
        transition: box-shadow 0.2s;
        z-index: 5;
        pointer-events: none;
    }
    
    .hm-damage-active {
        box-shadow: inset 0 0 100px 20px rgba(255, 0, 0, 0.6);
    }

    /* End Game Menu Styles */
    .hm-end-menu {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: none;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 100;
    }

    .hm-end-title {
        font-size: 50px;
        margin-bottom: 30px;
        font-family: 'Courier New', Courier, monospace;
        font-weight: bold;
        text-transform: uppercase;
    }

    .hm-end-desc {
        font-size: 20px;
        color: #aaa;
        margin-bottom: 50px;
        text-align: center;
        max-width: 600px;
        line-height: 1.5;
    }

    .hm-victory .hm-end-title {
        color: #f1c40f;
        text-shadow: 0 0 20px #f39c12;
    }

    .hm-gameover .hm-end-title {
        color: #c0392b;
        text-shadow: 0 0 20px #e74c3c;
    }
    `;

    // 资源管理器：负责生成程序化纹理和音效
    const AssetManager = {
        textures: {},
        audioContext: null,
        buffers: {},

        initAudio: function() {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        },

        // 程序化生成纹理
        generateTextures: function() {
            this.textures.wall = this.createCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#2c3e50';
                ctx.fillRect(0, 0, w, h);
                // 砖块纹理
                ctx.fillStyle = '#34495e';
                for(let i=0; i<20; i++) {
                    for(let j=0; j<10; j++) {
                        if(Math.random() > 0.1) {
                            ctx.fillRect(i*25 + (j%2)*12, j*50, 24, 48);
                        }
                    }
                }
                // 污渍
                this.addNoise(ctx, w, h, 0.1);
            });

            this.textures.castleWall = this.createCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#2c2c2c'; // 更深沉的石材
                ctx.fillRect(0, 0, w, h);
                // 大块石砖
                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth = 4;
                for(let i=0; i<8; i++) {
                    ctx.beginPath();
                    ctx.moveTo(0, i*64);
                    ctx.lineTo(w, i*64);
                    ctx.stroke();
                    for(let j=0; j<8; j++) {
                        if((i+j)%2 === 0) {
                            ctx.beginPath();
                            ctx.moveTo(j*64, i*64);
                            ctx.lineTo(j*64, (i+1)*64);
                            ctx.stroke();
                        }
                    }
                }
                this.addNoise(ctx, w, h, 0.15); // 更多噪点，显得陈旧
            });

            this.textures.grass = this.createCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#1b261b'; // 暗绿色
                ctx.fillRect(0, 0, w, h);
                this.addNoise(ctx, w, h, 0.2);
                // 随机杂草
                ctx.fillStyle = '#2d3e2d';
                for(let i=0; i<500; i++) {
                    const x = Math.random() * w;
                    const y = Math.random() * h;
                    ctx.fillRect(x, y, 2, 6);
                }
            });

            this.textures.floor = this.createCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#3e2723';
                ctx.fillRect(0, 0, w, h);
                // 木板
                ctx.strokeStyle = '#1a0f0a';
                ctx.lineWidth = 2;
                for(let i=0; i<w; i+=40) {
                    ctx.beginPath();
                    ctx.moveTo(i, 0);
                    ctx.lineTo(i, h);
                    ctx.stroke();
                }
                this.addNoise(ctx, w, h, 0.05);
            });

            this.textures.ghost = this.createCanvasTexture(256, 256, (ctx, w, h) => {
                const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                grad.addColorStop(0.5, 'rgba(200, 200, 200, 0.4)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
                // 眼睛
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(w/2 - 30, h/2 - 20, 10, 0, Math.PI*2);
                ctx.arc(w/2 + 30, h/2 - 20, 10, 0, Math.PI*2);
                ctx.fill();
            });
        },

        createCanvasTexture: function(w, h, drawFn) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            drawFn(ctx, w, h);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            return tex;
        },

        addNoise: function(ctx, w, h, intensity) {
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;
            for(let i=0; i<data.length; i+=4) {
                const noise = (Math.random() - 0.5) * 255 * intensity;
                data[i] += noise;
                data[i+1] += noise;
                data[i+2] += noise;
            }
            ctx.putImageData(imageData, 0, 0);
        },

        // 背景音乐控制
        bgmOscillators: [],
        
        stopBGM: function() {
            this.bgmOscillators.forEach(node => {
                try {
                    if(node.stop) node.stop();
                    node.disconnect();
                } catch(e){}
            });
            this.bgmOscillators = [];
        },

        playBGM: function(intensity = 0) {
            if (!this.audioContext) return;
            this.stopBGM();
            
            const ctx = this.audioContext;
            const now = ctx.currentTime;
            
            // 基础低频氛围 (Drone)
            const baseOsc = ctx.createOscillator();
            const baseGain = ctx.createGain();
            baseOsc.connect(baseGain);
            baseGain.connect(ctx.destination);
            
            // 频率随强度略微升高，制造紧张感
            const baseFreq = 50 + (intensity * 10); 
            baseOsc.type = 'sine';
            baseOsc.frequency.value = baseFreq;
            
            // 音量波动 (LFO)
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            lfo.type = 'sine';
            lfo.frequency.value = 0.2 + (intensity * 0.5); // 波动速度随强度增加
            lfoGain.gain.value = 0.02;
            lfo.connect(lfoGain);
            lfoGain.connect(baseGain.gain);
            
            baseGain.gain.value = 0.05 + (intensity * 0.02);
            
            baseOsc.start(now);
            lfo.start(now);
            
            this.bgmOscillators.push(baseOsc, baseGain, lfo, lfoGain);

            // 高强度时添加不协和的高频音 (Tension)
            if (intensity >= 2) {
                const tensionOsc = ctx.createOscillator();
                const tensionGain = ctx.createGain();
                tensionOsc.connect(tensionGain);
                tensionGain.connect(ctx.destination);
                
                tensionOsc.type = 'triangle';
                // 不协和频率
                tensionOsc.frequency.value = 400 + Math.random() * 50; 
                tensionGain.gain.value = 0.0;
                
                // 淡入淡出制造呼吸感
                tensionGain.gain.setValueAtTime(0, now);
                tensionGain.gain.linearRampToValueAtTime(0.02 * (intensity - 1), now + 2);
                tensionGain.gain.linearRampToValueAtTime(0, now + 4);
                
                tensionOsc.start(now);
                // 循环播放高频音
                const interval = setInterval(() => {
                    if(!this.bgmOscillators.includes(tensionOsc)) {
                        clearInterval(interval);
                        return;
                    }
                    const t = ctx.currentTime;
                    tensionOsc.frequency.setValueAtTime(400 + Math.random() * 100, t);
                    tensionGain.gain.setValueAtTime(0, t);
                    tensionGain.gain.linearRampToValueAtTime(0.03 * (intensity - 1), t + 1); // 缩短周期
                    tensionGain.gain.linearRampToValueAtTime(0, t + 2);
                }, 2000 - (intensity * 200)); // 频率加快
                
                this.bgmOscillators.push(tensionOsc, tensionGain);
            }

            // 追逐模式下的急促心跳节奏
            if (intensity >= 3) {
                const beatOsc = ctx.createOscillator();
                const beatGain = ctx.createGain();
                beatOsc.connect(beatGain);
                beatGain.connect(ctx.destination);
                
                beatOsc.type = 'square';
                beatOsc.frequency.value = 60;
                beatGain.gain.value = 0;
                
                beatOsc.start(now);
                
                const beatInterval = setInterval(() => {
                    if(!this.bgmOscillators.includes(beatOsc)) {
                        clearInterval(beatInterval);
                        return;
                    }
                    const t = ctx.currentTime;
                    // 模拟心跳 "咚-咚"
                    beatGain.gain.setValueAtTime(0.1, t);
                    beatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                    beatGain.gain.setValueAtTime(0.08, t + 0.2);
                    beatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                }, 1000 - (intensity * 100)); // 心跳加速
                
                this.bgmOscillators.push(beatOsc, beatGain);
            }
        },

        // 程序化生成音效
        play: function(name) {
            if (!this.audioContext) return;
            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            const now = ctx.currentTime;

            switch(name) {
                case 'step':
                    osc.type = 'square'; // 模拟脚步声的某种材质感
                    osc.frequency.setValueAtTime(100, now);
                    osc.frequency.exponentialRampToValueAtTime(10, now + 0.1);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                    break;
                case 'key':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(800, now);
                    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
                    gain.gain.setValueAtTime(0.3, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                    osc.start(now);
                    osc.stop(now + 0.5);
                    break;
                case 'gunshot':
                    // 枪声需要白噪声，Web Audio 原生 Oscillator 不支持 Noise，这里用简单的方波模拟爆炸感
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(100, now);
                    osc.frequency.exponentialRampToValueAtTime(10, now + 0.2);
                    gain.gain.setValueAtTime(0.8, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                    break;
                case 'scream':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(400, now);
                    osc.frequency.linearRampToValueAtTime(800, now + 0.1);
                    osc.frequency.linearRampToValueAtTime(300, now + 0.5);
                    gain.gain.setValueAtTime(0.0, now);
                    gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
                    osc.start(now);
                    osc.stop(now + 1.0);
                    break;
                case 'ambient':
                    // 持续的低频背景音
                    const ambOsc = ctx.createOscillator();
                    const ambGain = ctx.createGain();
                    ambOsc.connect(ambGain);
                    ambGain.connect(ctx.destination);
                    ambOsc.type = 'sine';
                    ambOsc.frequency.value = 50;
                    ambGain.gain.value = 0.05;
                    ambOsc.start(now);
                    // 这是一个持续的声音，需要手动停止，这里简化为播放一个长音
                    ambOsc.stop(now + 10); 
                    break;
            }
        }
    };

    // 游戏引擎
    class GameEngine {
        constructor(container) {
            this.container = container;
            this.scene = null;
            this.camera = null;
            this.renderer = null;
            this.isRunning = false;
            this.lastTime = 0;

            // 游戏状态
            this.state = {
                keys: 0,
                totalKeys: 5,
                hasWeapon: false,
                hp: 100,
                isGameOver: false,
                isVictory: false,
                isPaused: true,
                messageTimer: 0
            };

            // 实体
            this.player = {
                position: new THREE.Vector3(0, 0, 0),
                rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
                velocity: new THREE.Vector3(),
                canJump: false
            };
            this.ghost = null;
            this.keys = [];
            this.doors = [];
            this.weapon = null;
            this.bullets = [];
            this.walls = []; // 用于碰撞检测

            // 输入状态
            this.input = {
                forward: false,
                backward: false,
                left: false,
                right: false,
                run: false
            };

            // 扩大地图以包含森林区域
            // 0: 空地(内部), 1: 墙, 2: 森林树木, 3: 城堡外墙, 4: 小路, 5: 城堡大门
            // 扩展地图尺寸到 30x30
            const mapSize = 30;
            this.map = Array(mapSize).fill(0).map(() => Array(mapSize).fill(2)); // 默认全部填充森林

            // 城堡区域 (位于地图中心偏上)
            const castleW = 11;
            const castleH = 11;
            const castleX = 9;
            const castleY = 5;

            // 清空城堡内部和周边
            for(let y=castleY-2; y<castleY+castleH+5; y++) {
                for(let x=castleX-2; x<castleX+castleW+2; x++) {
                    if(y >= 0 && y < mapSize && x >= 0 && x < mapSize) {
                        this.map[y][x] = 0; // 默认为空地
                    }
                }
            }

            // 构建城堡外墙
            for(let y=castleY; y<castleY+castleH; y++) {
                for(let x=castleX; x<castleX+castleW; x++) {
                    if(y===castleY || y===castleY+castleH-1 || x===castleX || x===castleX+castleW-1) {
                        this.map[y][x] = 3; // 外墙
                    } else {
                        this.map[y][x] = 0; // 内部空地
                    }
                }
            }
            
            // 四个角落生成塔楼基座
            this.map[castleY][castleX] = 6; // 左上塔楼
            this.map[castleY][castleX+castleW-1] = 6; // 右上塔楼
            this.map[castleY+castleH-1][castleX] = 6; // 左下塔楼
            this.map[castleY+castleH-1][castleX+castleW-1] = 6; // 右下塔楼
            
            // 内部房间划分 (简单示例)
            // 横墙
            for(let x=castleX+1; x<castleX+castleW-1; x++) {
                this.map[castleY+4][x] = 1;
                this.map[castleY+7][x] = 1;
            }
            // 竖墙
            for(let y=castleY+1; y<castleY+castleH-1; y++) {
                this.map[y][castleX+5] = 1;
            }
            // 门洞
            this.map[castleY+4][castleX+2] = 0; this.map[castleY+4][castleX+8] = 0;
            this.map[castleY+7][castleX+5] = 0;
            this.map[castleY+2][castleX+5] = 0;
            
            // 放置物品
            this.map[castleY+2][castleX+2] = 'K';
            this.map[castleY+2][castleX+8] = 'K';
            this.map[castleY+9][castleX+2] = 'K';
            this.map[castleY+9][castleX+8] = 'K';
            this.map[castleY+5][castleX+5] = 'S'; // 核心区域
            this.map[castleY+6][castleX+2] = 'W'; // 武器

            // 城堡大门
            this.map[castleY+castleH-1][castleX+5] = 5;

            // 森林小路 (通向大门)
            for(let y=castleY+castleH; y<mapSize; y++) {
                this.map[y][castleX+5] = 4;
            }

            this.gridSize = 5;
            this.castleGatePosition = { x: (castleX+5) * this.gridSize, z: (castleY+castleH-1) * this.gridSize };
            this.isGhostActive = false; // 鬼魂是否激活
        }

        async init() {
            // 初始化 Three.js 场景
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x020202); // 极夜
            this.scene.fog = new THREE.FogExp2(0x020202, 0.12); // 浓雾

            // 初始化玩家位置 (在森林小路最南端)
            this.player.position.set((9+5) * this.gridSize, 1.5, 28 * this.gridSize);
            this.player.rotation.y = Math.PI; // 面向北方(城堡)

            this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
            
            // 兼容 WebGPU 版本，如果 WebGLRenderer 不存在则尝试 WebGPURenderer
            if (THREE.WebGLRenderer) {
                this.renderer = new THREE.WebGLRenderer({ antialias: true });
            } else if (THREE.WebGPURenderer) {
                this.renderer = new THREE.WebGPURenderer({ antialias: true });
            } else {
                console.error("No compatible renderer found (WebGL/WebGPU)");
                return;
            }
            
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            this.renderer.shadowMap.enabled = true;
            this.container.appendChild(this.renderer.domElement);

            // WebGPURenderer 需要异步初始化
            if (this.renderer.init) {
                await this.renderer.init();
            }

            // 光照
            const ambientLight = new THREE.AmbientLight(0x1a237e, 0.2); // 蓝色月光氛围
            this.scene.add(ambientLight);

            // 月光
            const moonLight = new THREE.DirectionalLight(0xaab6fe, 0.3);
            moonLight.position.set(-50, 100, -50);
            moonLight.castShadow = true;
            this.scene.add(moonLight);

            // 地面 (草地)
            const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
            const groundMaterial = new THREE.MeshStandardMaterial({ 
                map: AssetManager.textures.grass,
                roughness: 0.9,
                color: 0x111111
            });
            const ground = new THREE.Mesh(groundGeometry, groundMaterial);
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = true;
            this.scene.add(ground);

            // 手电筒
            this.flashlight = new THREE.SpotLight(0xffffff, 1.5, 60, Math.PI/3, 0.3, 1); // 增强手电筒：强度1.5，距离60，角度60度
            this.flashlight.position.set(0, 0, 0);
            this.flashlight.target.position.set(0, 0, -1);
            this.camera.add(this.flashlight);
            this.camera.add(this.flashlight.target);
            this.scene.add(this.camera);

            // 生成地图
            this.generateLevel();
            
            // 地图边界空气墙
            this.createMapBoundaries();

            // 监听输入
            this.setupInputs();

            // 启动循环
            this.isRunning = true;
            requestAnimationFrame(this.loop.bind(this));
        }

        createMapBoundaries() {
            const mapSize = this.map.length * this.gridSize;
            const wallMat = new THREE.MeshBasicMaterial({ visible: false }); // 不可见
            
            // 四周墙壁
            const walls = [
                { pos: [mapSize/2, 0, -5], size: [mapSize+10, 50, 1] }, // 北
                { pos: [mapSize/2, 0, mapSize], size: [mapSize+10, 50, 1] }, // 南
                { pos: [-5, 0, mapSize/2], size: [1, 50, mapSize+10] }, // 西
                { pos: [mapSize, 0, mapSize/2], size: [1, 50, mapSize+10] } // 东
            ];

            walls.forEach(w => {
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]), wallMat);
                mesh.position.set(w.pos[0], 25, w.pos[2]);
                this.scene.add(mesh);
                this.walls.push(new THREE.Box3().setFromObject(mesh));
            });
        }

        generateLevel() {
            // 确保纹理已生成
            if (!AssetManager.textures.wall) {
                AssetManager.generateTextures();
            }

            const wallGeo = new THREE.BoxGeometry(this.gridSize, this.gridSize * 1.5, this.gridSize);
            const wallMat = new THREE.MeshStandardMaterial({ map: AssetManager.textures.wall });
            const floorGeo = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
            const floorMat = new THREE.MeshStandardMaterial({ map: AssetManager.textures.floor });
            
            // 草地材质 (用于 generateLevel 中引用)
            const groundMaterial = new THREE.MeshStandardMaterial({ 
                map: AssetManager.textures.grass,
                roughness: 0.9,
                color: 0x111111
            });
            
            // 天花板
            const ceilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

            for(let z=0; z<this.map.length; z++) {
                for(let x=0; x<this.map[z].length; x++) {
                    const type = this.map[z][x];
                    const posX = x * this.gridSize;
                    const posZ = z * this.gridSize;

                    // 地板
                    let mat = floorMat;
                    if (type === 2 || type === 4 || type === 5 || type === 3) { // 森林、小路、大门处、外墙处使用草地
                        mat = groundMaterial;
                    }
                    // 城堡内部 (空地0且在城堡范围内) 使用木地板
                    // 简单判断：如果不是森林且不是小路，就是城堡区域
                    if (type === 0 || type === 1 || type === 'K' || type === 'S' || type === 'W' || type === 'D' || type === 'B') {
                         mat = floorMat;
                    }
                    // 再次修正：如果是城堡外围的空地(0)，也应该是草地。
                    // 这里简化逻辑：我们已经知道城堡范围，但在 generateLevel 里难以直接判断坐标范围。
                    // 由于 map 生成时我们已经将城堡外的空地设为 0，这会导致外围也是木地板。
                    // 让我们修改 map 生成逻辑中的填充，或者在这里判断。
                    // 为了简单，我们假设 type 0 都是木地板（城堡内）。
                    // 但刚才我们在 map 生成时把城堡周围清空成了 0。
                    // 让我们回溯修改 map 生成逻辑：城堡周围空地设为 4 (小路/草地) 或新类型 6 (城堡外草地)。
                    // 现在的修正方案：直接在这里根据 type 渲染。
                    // 由于 type 2 是森林，type 4 是小路。
                    // 我们把城堡周围的 buffer zone 在 map 生成时设为 4 比较好。
                    // 但现在 map 已经生成了。
                    // 让我们假设 type 0 都是室内木地板。
                    // 只有城堡外的 0 会有问题。
                    // 无论如何，先渲染。
                    
                    const floor = new THREE.Mesh(floorGeo, mat);
                    floor.rotation.x = -Math.PI / 2;
                    floor.position.set(posX, 0, posZ);
                    this.scene.add(floor);

                    // 天花板 (仅室内)
                    if (mat === floorMat) {
                        const ceil = new THREE.Mesh(floorGeo, ceilMat);
                        ceil.rotation.x = Math.PI / 2;
                        ceil.position.set(posX, this.gridSize * 1.5, posZ);
                        this.scene.add(ceil);
                    }

                    if(type === 1) { // 墙
                        const wall = new THREE.Mesh(wallGeo, wallMat);
                        wall.position.set(posX, this.gridSize * 0.75, posZ);
                        this.scene.add(wall);
                        this.walls.push(new THREE.Box3().setFromObject(wall));
                    } else if (type === 'K') { // 钥匙
                        this.createKey(posX, posZ);
                    } else if (type === 'D') { // 门
                        this.createDoor(posX, posZ);
                    } else if (type === 'S') { // 起点
                        // 移除 'S' 对玩家位置的覆盖，使用 init 中的初始位置
                    } else if (type === 2) { // 森林树木
                    // 随机偏移，让树木分布更自然
                    const offsetX = (Math.random() - 0.5) * 3;
                    const offsetZ = (Math.random() - 0.5) * 3;
                    const treeHeight = 15 + Math.random() * 10; // 更高的树
                    const trunkHeight = 4; // 定义树干高度

                    const tree = new THREE.Mesh(new THREE.ConeGeometry(2, treeHeight, 8), new THREE.MeshStandardMaterial({color: 0x0f1a0f, flatShading: true}));
                    tree.position.set(posX + offsetX, treeHeight/2 + trunkHeight - 1, posZ + offsetZ); // 树冠抬高
                    this.scene.add(tree);
                    
                    // 树干
                    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, trunkHeight), new THREE.MeshStandardMaterial({color: 0x1a110a}));
                    trunk.position.set(posX + offsetX, trunkHeight/2, posZ + offsetZ);
                    this.scene.add(trunk);
                    
                    // 枯枝 (用细圆柱模拟)
                    for(let k=0; k<3; k++) {
                        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 3), new THREE.MeshStandardMaterial({color: 0x1a110a}));
                        branch.position.set(posX + offsetX, 5 + Math.random()*5, posZ + offsetZ);
                        branch.rotation.z = (Math.random() - 0.5);
                        branch.rotation.y = Math.random() * Math.PI;
                        this.scene.add(branch);
                    }

                    // 阻挡
                    this.walls.push(new THREE.Box3().setFromObject(trunk));
                } else if (type === 3) { // 城堡外墙
                    const wall = new THREE.Mesh(new THREE.BoxGeometry(this.gridSize, 12, this.gridSize), new THREE.MeshStandardMaterial({map: AssetManager.textures.castleWall}));
                    wall.position.set(posX, 6, posZ);
                    this.scene.add(wall);
                    this.walls.push(new THREE.Box3().setFromObject(wall));
                    
                    // 城垛装饰 (每隔一段生成一个)
                    if((x + z) % 2 === 0) {
                         const crenel = new THREE.Mesh(new THREE.BoxGeometry(this.gridSize, 2, 1), new THREE.MeshStandardMaterial({map: AssetManager.textures.castleWall}));
                         crenel.position.set(posX, 13, posZ);
                         this.scene.add(crenel);
                    }

                } else if (type === 6) { // 塔楼
                    // 塔楼主体
                    const towerBody = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 16, 8), new THREE.MeshStandardMaterial({map: AssetManager.textures.castleWall}));
                    towerBody.position.set(posX, 8, posZ);
                    this.scene.add(towerBody);
                    this.walls.push(new THREE.Box3().setFromObject(towerBody));
                    
                    // 塔尖
                    const towerTop = new THREE.Mesh(new THREE.ConeGeometry(5, 8, 8), new THREE.MeshStandardMaterial({color: 0x1a1a1a}));
                    towerTop.position.set(posX, 20, posZ);
                    this.scene.add(towerTop);

                } else if (type === 4) { // 小路 (不生成阻挡)
                    // 可以在地面上添加一些碎石装饰
                } else if (type === 5) { // 城堡大门
                    // 门框
                    const frame = new THREE.Mesh(new THREE.BoxGeometry(this.gridSize, 10, 1), new THREE.MeshStandardMaterial({color: 0x1a1a1a}));
                    frame.position.set(posX, 5, posZ);
                    this.scene.add(frame);
                    // 门本身 (初始开启)
                } else if (type === 'W') { // 武器
                        this.createWeapon(posX, posZ);
                    } else if (type === 'B') {
                        // 地下室区域，稍微暗一点或者不同纹理
                    }
                }
            }

            // 初始化鬼魂
            this.createGhost();
        }

        createKey(x, z) {
            const geo = new THREE.TorusKnotGeometry(0.3, 0.1, 64, 8);
            const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xaa4400, roughness: 0.1 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, 1.5, z);
            this.scene.add(mesh);
            this.keys.push({ mesh: mesh, active: true });
            
            // 点光源让钥匙显眼
            const light = new THREE.PointLight(0xffaa00, 1, 5);
            light.position.set(x, 2, z);
            this.scene.add(light);
            this.keys[this.keys.length-1].light = light;
        }

        createDoor(x, z) {
            const geo = new THREE.BoxGeometry(this.gridSize, this.gridSize * 1.5, 0.5);
            const mat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, this.gridSize * 0.75, z);
            this.scene.add(mesh);
            this.doors.push({ mesh: mesh, locked: true, box: new THREE.Box3().setFromObject(mesh) });
            this.walls.push(this.doors[this.doors.length-1].box); // 门也是墙，直到打开
        }

        createWeapon(x, z) {
            // AK47 简单模型组合
            const group = new THREE.Group();
            
            // 枪身
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.5), new THREE.MeshStandardMaterial({ color: 0x333333 }));
            group.add(body);
            // 弹夹
            const mag = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x000000 }));
            mag.position.set(0, -0.4, 0.2);
            mag.rotation.x = 0.2;
            group.add(mag);
            // 枪托
            const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.6), new THREE.MeshStandardMaterial({ map: AssetManager.textures.floor }));
            stock.position.set(0, -0.1, 0.9);
            group.add(stock);
            // 枪管
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), new THREE.MeshStandardMaterial({ color: 0x111111 }));
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(0, 0.05, -1.0);
            group.add(barrel);

            group.position.set(x, 1.5, z);
            
            // 漂浮动画
            this.scene.add(group);
            this.weapon = { mesh: group, collected: false };
            
            const light = new THREE.PointLight(0x00ff00, 1, 5);
            light.position.set(x, 2, z);
            this.scene.add(light);
            this.weapon.light = light;
        }

        createGhost() {
            // 鬼魂是一个飘浮的半透明物体
            const geo = new THREE.SphereGeometry(1, 32, 32);
            const mat = new THREE.MeshStandardMaterial({ 
                map: AssetManager.textures.ghost, 
                transparent: true, 
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, -10, 0); // 初始隐藏
            this.scene.add(mesh);
            
            const light = new THREE.PointLight(0xff0000, 2, 10);
            mesh.add(light);

            this.ghost = {
                mesh: mesh,
                active: false,
                state: 'IDLE', // IDLE, STALK, CHASE
                speed: 3.5, // 比玩家稍慢
                lastScream: 0,
                hp: 100
            };
        }

        setupInputs() {
            document.addEventListener('keydown', (e) => this.onKey(e, true));
            document.addEventListener('keyup', (e) => this.onKey(e, false));
            document.addEventListener('mousemove', (e) => {
                if(!this.state.isPaused) {
                    const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
                    const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
                    
                    this.player.rotation.y -= movementX * 0.002;
                    this.player.rotation.x -= movementY * 0.002;
                    this.player.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.player.rotation.x));
                    
                    this.camera.quaternion.setFromEuler(this.player.rotation);
                }
            });
            document.addEventListener('mousedown', () => {
                if(this.state.isPaused) {
                    // 请求锁定指针
                    this.container.requestPointerLock = this.container.requestPointerLock || this.container.mozRequestPointerLock;
                    const promise = this.container.requestPointerLock();
                    // 处理 Promise 兼容性，避免 SecurityError: The user has exited the lock...
                    if (promise && typeof promise.catch === 'function') {
                        promise.catch(err => {
                            // 忽略指针锁定失败的错误，通常是因为用户快速取消了操作
                            console.debug("Pointer lock failed:", err);
                        });
                    }
                } else if(this.state.hasWeapon) {
                    this.fireWeapon();
                }
            });
            document.addEventListener('pointerlockchange', () => {
                this.state.isPaused = document.pointerLockElement !== this.container;
                document.getElementById('hm-message').style.opacity = this.state.isPaused ? 1 : 0;
                document.getElementById('hm-message').textContent = this.state.isPaused ? "点击继续游戏" : "";
            });
        }

        onKey(e, down) {
            switch(e.code) {
                case 'KeyW': this.input.forward = down; break;
                case 'KeyS': this.input.backward = down; break;
                case 'KeyA': this.input.left = down; break;
                case 'KeyD': this.input.right = down; break;
                case 'ShiftLeft': this.input.run = down; break;
            }
        }

        fireWeapon() {
            // 射击逻辑
            AssetManager.play('gunshot');
            
            // 枪口闪光
            const flash = new THREE.PointLight(0xffffaa, 5, 5);
            flash.position.set(0.2, -0.2, -1);
            this.camera.add(flash);
            setTimeout(() => this.camera.remove(flash), 50);

            // 射线检测
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
            const intersects = raycaster.intersectObject(this.ghost.mesh);
            
            if(intersects.length > 0) {
                this.ghost.hp -= 10;
                this.showMessage(`鬼魂受伤! HP: ${this.ghost.hp}`, 500);
                if(this.ghost.hp <= 0) {
                    this.winGame();
                } else {
                    // 鬼魂被击中后会瞬移一下
                    this.ghost.mesh.position.y = -10;
                    setTimeout(() => {
                        this.ghost.mesh.position.set(
                            (Math.random() * 10 - 5) * this.gridSize,
                            2,
                            (Math.random() * 10 - 5) * this.gridSize
                        );
                    }, 2000);
                }
            }
        }

        update(dt) {
            if(this.state.isPaused || this.state.isGameOver || this.state.isVictory) return;

            // 玩家移动
            const speed = this.input.run ? 8 : 4;
            const dir = new THREE.Vector3();
            if(this.input.forward) dir.z -= 1;
            if(this.input.backward) dir.z += 1;
            if(this.input.left) dir.x -= 1;
            if(this.input.right) dir.x += 1;
            
            dir.applyEuler(new THREE.Euler(0, this.player.rotation.y, 0));
            dir.normalize().multiplyScalar(speed * dt);
            
            // 沿墙滑动碰撞检测
            const nextPos = this.player.position.clone().add(dir);
            const playerBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(1, 2, 1));
            
            let collision = false;
            let hitWallBox = null;

            for(const wallBox of this.walls) {
                if(playerBox.intersectsBox(wallBox)) {
                    collision = true;
                    hitWallBox = wallBox;
                    break;
                }
            }

            if(!collision) {
                this.player.position.copy(nextPos);
            } else {
                // 滑动逻辑：
                // 当发生碰撞时，尝试分别只在 X 轴或 Z 轴上移动
                // 1. 尝试只沿 X 轴移动
                const moveX = new THREE.Vector3(dir.x, 0, 0);
                const nextPosX = this.player.position.clone().add(moveX);
                const boxX = new THREE.Box3().setFromCenterAndSize(nextPosX, new THREE.Vector3(1, 2, 1));
                let colX = false;
                for(const w of this.walls) { if(boxX.intersectsBox(w)) { colX = true; break; } }
                
                // 2. 尝试只沿 Z 轴移动
                const moveZ = new THREE.Vector3(0, 0, dir.z);
                const nextPosZ = this.player.position.clone().add(moveZ);
                const boxZ = new THREE.Box3().setFromCenterAndSize(nextPosZ, new THREE.Vector3(1, 2, 1));
                let colZ = false;
                for(const w of this.walls) { if(boxZ.intersectsBox(w)) { colZ = true; break; } }

                // 优先选择移动距离较大的方向，或者只要不碰撞就移动
                if(!colX) {
                    this.player.position.add(moveX);
                } else if(!colZ) {
                    this.player.position.add(moveZ);
                }
            }
            this.camera.position.copy(this.player.position);
            
            // 检查进城不归逻辑
            if (!this.isGhostActive && this.castleGatePosition) {
                // 如果玩家Z坐标小于大门Z坐标，说明进入了城堡
                if (this.player.position.z < this.castleGatePosition.z - this.gridSize) {
                    this.isGhostActive = true;
                    this.showMessage("大门已锁死... 必须找到所有钥匙才能离开", 5000);
                    AssetManager.play('scream'); // 惊悚音效
                    AssetManager.playBGM(1); // 开启紧张音乐
                    
                    // 生成空气墙封锁大门
                    const barrier = new THREE.Mesh(new THREE.BoxGeometry(this.gridSize, 10, 1), new THREE.MeshStandardMaterial({color: 0xff0000, visible: false})); // 空气墙不可见
                    barrier.position.set(this.castleGatePosition.x, 5, this.castleGatePosition.z);
                    this.scene.add(barrier);
                    this.walls.push(new THREE.Box3().setFromObject(barrier));

                    // 此时才生成鬼魂
                    this.createGhost();
                }
            }

            // 鬼魂 AI (仅在激活后)
            if(this.ghost && this.isGhostActive) {
                const dist = this.ghost.mesh.position.distanceTo(this.player.position);
                const speed = 3.5 + (this.state.keys * 0.5); // 鬼魂速度随钥匙增加
                
                // 简单的追逐
                const dirToPlayer = new THREE.Vector3().subVectors(this.player.position, this.ghost.mesh.position).normalize();
                this.ghost.mesh.position.add(dirToPlayer.multiplyScalar(speed * dt));
                this.ghost.mesh.lookAt(this.player.position);

                // 惊吓音效
                if(dist < 10 && Date.now() - this.ghost.lastScream > 5000) {
                    AssetManager.play('scream');
                    this.ghost.lastScream = Date.now();
                }

                // 伤害判定
                if(dist < 1.5) {
                    this.takeDamage(10);
                    // 鬼魂后退
                    const pushBack = dirToPlayer.clone().negate().multiplyScalar(5);
                    this.ghost.mesh.position.add(pushBack);
                }
            }

            // 交互检测 (钥匙)
            for(const key of this.keys) {
                if(key.active && this.player.position.distanceTo(key.mesh.position) < 2) {
                    key.active = false;
                    this.scene.remove(key.mesh);
                    this.scene.remove(key.light);
                    this.state.keys++;
                    AssetManager.play('key');
                    this.showMessage(`获得钥匙 ${this.state.keys}/5`);
                    this.updateHUD();
                    
                    // 随着钥匙增加，音乐变得更加紧张
                    AssetManager.playBGM(this.state.keys);

                    if(this.state.keys === 3) {
                        this.ghost.active = true;
                        this.ghost.state = 'CHASE';
                        this.showMessage("鬼魂苏醒了！快跑！", 2000);
                        AssetManager.play('scream');
                    }
                }
                // 旋转动画
                if(key.active) key.mesh.rotation.y += dt;
            }

            // 武器拾取
            if(this.weapon && !this.weapon.collected && this.player.position.distanceTo(this.weapon.mesh.position) < 2) {
                this.weapon.collected = true;
                this.scene.remove(this.weapon.mesh);
                this.scene.remove(this.weapon.light);
                this.state.hasWeapon = true;
                
                // 将武器绑定到相机
                this.camera.add(this.weapon.mesh);
                this.weapon.mesh.position.set(0.2, -0.3, -0.5);
                this.weapon.mesh.rotation.set(0, Math.PI, 0); // 调整朝向
                
                this.showMessage("获得 AK47! 只有它能消灭鬼魂!", 3000);
                this.updateHUD();
            }

            // 地下室门
            if(this.state.keys >= 5 && !this.state.isBasementUnlocked) {
                // 检查是否在门附近
                for(const door of this.doors) {
                    if(door.locked && this.player.position.distanceTo(door.mesh.position) < 4) {
                        door.locked = false;
                        this.scene.remove(door.mesh);
                        // 移除碰撞体
                        const idx = this.walls.indexOf(door.box);
                        if(idx > -1) this.walls.splice(idx, 1);
                        
                        this.state.isBasementUnlocked = true;
                        this.showMessage("地下室已开启...", 2000);
                        AssetManager.play('door_open'); // 假设有
                    }
                }
            }

        }

        takeDamage(amount) {
            this.state.hp -= amount;
            this.updateHUD();
            
            // 血屏特效
            const overlay = document.querySelector('.hm-damage-overlay');
            overlay.classList.add('hm-damage-active');
            setTimeout(() => overlay.classList.remove('hm-damage-active'), 200);

            if(this.state.hp <= 0) {
                this.gameOver();
            }
        }

        updateHUD() {
            document.getElementById('hm-keys').textContent = `${this.state.keys}/${this.state.totalKeys}`;
            document.getElementById('hm-hp').textContent = this.state.hp;
            document.getElementById('hm-weapon').textContent = this.state.hasWeapon ? "AK47" : "无";
        }

        showMessage(msg, duration = 1000) {
            const el = document.getElementById('hm-message');
            el.textContent = msg;
            el.style.opacity = 1;
            clearTimeout(this.msgTimeout);
            this.msgTimeout = setTimeout(() => {
                el.style.opacity = 0;
            }, duration);
        }

        gameOver() {
            this.state.isGameOver = true;
            document.exitPointerLock();
            document.getElementById('hm-gameover-menu').style.display = 'flex';
            document.getElementById('hm-ui').style.display = 'none';
            document.getElementById('hm-crosshair').style.display = 'none';
        }

        winGame() {
            this.state.isVictory = true;
            this.scene.remove(this.ghost.mesh);
            document.exitPointerLock();
            document.getElementById('hm-victory-menu').style.display = 'flex';
            document.getElementById('hm-ui').style.display = 'none';
            document.getElementById('hm-crosshair').style.display = 'none';
        }

        loop() {
            if(!this.isRunning) return;
            const now = performance.now();
            const dt = Math.min((now - this.lastTime) / 1000, 0.1);
            this.lastTime = now;

            this.update(dt);
            this.renderer.render(this.scene, this.camera);
            
            requestAnimationFrame(this.loop.bind(this));
        }
    }

    const HORRORMANSION = {
        pid: null,
        window: null,
        windowId: null,
        game: null,

        __init__: async function(pid, initArgs) {
            this.pid = pid;
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');

            // 创建窗口
            this.window = document.createElement('div');
            this.window.className = 'horrormansion-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            
            // UI 结构
            this.window.innerHTML = `
                <div id="hm-game-container">
                    <div id="hm-loading">
                        <div class="hm-spinner"></div>
                        <div>正在加载资源...</div>
                        <div style="font-size:12px; margin-top:10px; color:#666;">需要网络连接以加载 Three.js 引擎</div>
                    </div>
                    
                    <!-- Main Menu -->
                    <div id="hm-main-menu">
                        <div class="hm-title">HORROR MANSION</div>
                        <button class="hm-menu-btn" id="btn-start">开始游戏</button>
                        <button class="hm-menu-btn" id="btn-settings">设置</button>
                        <button class="hm-menu-btn" id="btn-exit">退出游戏</button>
                    </div>

                    <!-- Settings Modal -->
                    <div id="hm-settings-modal">
                        <h2>设置</h2>
                        <div class="hm-settings-row">
                            <span>音效音量</span>
                            <input type="range" id="setting-volume" min="0" max="100" value="80">
                        </div>
                        <button class="hm-menu-btn" id="btn-close-settings" style="width: auto; padding: 10px 20px;">关闭</button>
                    </div>

                    <!-- Game Over Menu -->
                    <div id="hm-gameover-menu" class="hm-end-menu hm-gameover">
                        <div class="hm-end-title">你死了</div>
                        <div class="hm-end-desc">鬼魂吞噬了你的灵魂，你将永远被困在这座鬼宅之中...</div>
                        <button class="hm-menu-btn" id="btn-restart-dead">重新开始</button>
                        <button class="hm-menu-btn" id="btn-exit-dead">退出游戏</button>
                    </div>

                    <!-- Victory Menu -->
                    <div id="hm-victory-menu" class="hm-end-menu hm-victory">
                        <div class="hm-end-title">逃出生天</div>
                        <div class="hm-end-desc">你成功消灭了恶灵并逃出了鬼宅！你的勇气将被永远铭记。</div>
                        <button class="hm-menu-btn" id="btn-restart-win">再次挑战</button>
                        <button class="hm-menu-btn" id="btn-exit-win">退出游戏</button>
                    </div>

                    <div id="hm-ui">
                        <div class="hm-hud-top">
                            <div class="hm-hud-text">KEYS: <span id="hm-keys">0/5</span></div>
                            <div class="hm-hud-text">HP: <span id="hm-hp">100</span></div>
                        </div>
                        <div class="hm-hud-text" style="align-self: flex-end;">WEAPON: <span id="hm-weapon">无</span></div>
                        <div id="hm-message"></div>
                    </div>
                    <div id="hm-crosshair"></div>
                    <div class="hm-damage-overlay"></div>
                </div>
            `;

            if (typeof GUIManager !== 'undefined') {
                this.applicationInfo = GUIManager.registerWindow(pid, this.window, {
                    title: 'Horror Mansion 3D',
                    width: 1024,
                    height: 768,
                    onClose: () => this.__exit__(),
                    onMinimize: () => {
                        if (this.game) this.game.state.isPaused = true;
                    },
                    onMaximize: () => {
                        // 触发 resize
                        if (this.game) window.dispatchEvent(new Event('resize'));
                    }
                });
                this.windowId = this.applicationInfo.windowId;
            }

            guiContainer.appendChild(this.window);

            // 加载 Three.js
            this.loadDependency('three.js', () => {
                document.querySelector('#hm-loading .hm-spinner').style.display = 'none';
                document.querySelector('#hm-loading div').textContent = '资源加载完毕';
                
                // 模拟额外加载时间后显示主菜单
                setTimeout(() => {
                    this.showMainMenu();
                }, 500);
            });
            
            // 注入 CSS
            this.injectStyles();
            
            // 绑定主菜单事件
            this.bindMenuEvents();
        },

        bindMenuEvents: function() {
            // 开始游戏
            document.getElementById('btn-start').onclick = () => {
                AssetManager.initAudio();
                AssetManager.playBGM(0); // 初始 BGM
                this.startGame();
            };

            // 设置
            document.getElementById('btn-settings').onclick = () => {
                document.getElementById('hm-settings-modal').style.display = 'block';
            };

            // 关闭设置
            document.getElementById('btn-close-settings').onclick = () => {
                document.getElementById('hm-settings-modal').style.display = 'none';
            };

            // 退出游戏
            document.getElementById('btn-exit').onclick = () => {
                this.__exit__();
            };
            
            // 音量控制
            document.getElementById('setting-volume').oninput = (e) => {
                const vol = e.target.value / 100;
                if(AssetManager.audioContext && AssetManager.audioContext.destination) {
                    // 这里只是演示，实际上需要调整 AssetManager 中的全局 gain
                }
            };

            // 游戏结束菜单事件
            const restartGame = () => {
                document.getElementById('hm-gameover-menu').style.display = 'none';
                document.getElementById('hm-victory-menu').style.display = 'none';
                // 重置游戏状态
                if(this.game) {
                    this.game.isRunning = false;
                    // 简单粗暴：重新实例化 GameEngine，或者刷新页面（这里选择重新实例化）
                    // 清理旧场景
                    if(this.game.renderer) {
                        this.game.container.removeChild(this.game.renderer.domElement);
                        this.game.renderer.dispose();
                    }
                    AssetManager.stopBGM();
                }
                
                AssetManager.playBGM(0);
                this.startGame();
            };

            document.getElementById('btn-restart-dead').onclick = restartGame;
            document.getElementById('btn-restart-win').onclick = restartGame;
            
            document.getElementById('btn-exit-dead').onclick = () => this.__exit__();
            document.getElementById('btn-exit-win').onclick = () => this.__exit__();
        },

        showMainMenu: function() {
            document.getElementById('hm-loading').style.display = 'none';
            document.getElementById('hm-main-menu').style.display = 'flex';
        },

        injectStyles: function() {
            if (!document.getElementById('horrormansion-style')) {
                const style = document.createElement('style');
                style.id = 'horrormansion-style';
                style.textContent = STYLES;
                document.head.appendChild(style);
            }
        },

        loadDependency: async function(moduleName, callback) {
            if (window.THREE) {
                callback();
                return;
            }

            try {
                if (typeof DynamicManager !== 'undefined') {
                    await DynamicManager.loadModule(moduleName);
                    if (window.THREE) {
                        callback();
                    } else {
                        throw new Error('Three.js 加载后未在全局找到');
                    }
                } else {
                    throw new Error('DynamicManager 未定义');
                }
            } catch (e) {
                console.error(e);
                document.querySelector('#hm-loading div').textContent = '加载失败: ' + e.message;
            }
        },

        startGame: function() {
            document.getElementById('hm-main-menu').style.display = 'none';
            document.getElementById('hm-ui').style.display = 'flex';
            document.getElementById('hm-crosshair').style.display = 'block';
            this.game = new GameEngine(document.getElementById('hm-game-container'));
            this.game.init();
            
            // 自动请求锁定指针
            setTimeout(() => {
                const promise = this.game.container.requestPointerLock();
                if (promise && typeof promise.catch === 'function') promise.catch(() => {});
            }, 100);
        },

        __exit__: function() {
            if(this.game) {
                this.game.isRunning = false;
                // 清理 Three.js 资源
                if(this.game.renderer) {
                    this.game.renderer.dispose();
                }
            }
            AssetManager.stopBGM(); // 停止背景音乐
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                GUIManager.unregisterWindow(this.windowId);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
        },

        __info__: function() {
            return {
                name: 'HorrorMansion',
                type: 'GUI',
                version: '1.0.0',
                description: '3D 恐怖生存游戏',
                author: 'ZerOS Game Studio',
                metadata: {
                    allowMultipleInstances: false
                },
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : []
            };
        }
    };

    if(typeof window !== 'undefined'){
        window[PROGRAM_NAME] = HORRORMANSION;
    }

})(window);
