// ZerOS 电子钢琴
// 基于 Tone.js 实现的完整电子钢琴模拟器

(function(window) {
    'use strict';
    
    const PIANO = {
        pid: null,
        window: null,
        Tone: null,
        
        // 钢琴状态
        _synths: {},              // 每个键对应的合成器
        _activeKeys: new Set(),   // 当前按下的键
        _volume: 0.7,            // 音量 (0-1)
        _octave: 4,               // 当前八度 (0-8)
        _sustain: false,          // 延音踏板状态
        
        // UI元素引用
        _keyboardContainer: null,
        _whiteKeys: [],
        _blackKeys: [],
        _volumeSlider: null,
        _octaveDisplay: null,
        _sustainButton: null,
        
        // 键盘映射 (QWERTY布局映射到钢琴键)
        // 格式: { 键盘按键: { note: '音符', octaveOffset: 八度偏移 } }
        _keyboardMap: {
            // 第一组白键 (C4-B4)
            'z': { note: 'C', octaveOffset: 0 },
            'x': { note: 'D', octaveOffset: 0 },
            'c': { note: 'E', octaveOffset: 0 },
            'v': { note: 'F', octaveOffset: 0 },
            'b': { note: 'G', octaveOffset: 0 },
            'n': { note: 'A', octaveOffset: 0 },
            'm': { note: 'B', octaveOffset: 0 },
            // 第一组黑键
            's': { note: 'C#', octaveOffset: 0 },
            'd': { note: 'D#', octaveOffset: 0 },
            'g': { note: 'F#', octaveOffset: 0 },
            'h': { note: 'G#', octaveOffset: 0 },
            'j': { note: 'A#', octaveOffset: 0 },
            // 第二组白键 (C5-B5)
            'q': { note: 'C', octaveOffset: 1 },
            'w': { note: 'D', octaveOffset: 1 },
            'e': { note: 'E', octaveOffset: 1 },
            'r': { note: 'F', octaveOffset: 1 },
            't': { note: 'G', octaveOffset: 1 },
            'y': { note: 'A', octaveOffset: 1 },
            'u': { note: 'B', octaveOffset: 1 },
            // 第二组黑键
            '2': { note: 'C#', octaveOffset: 1 },
            '3': { note: 'D#', octaveOffset: 1 },
            '5': { note: 'F#', octaveOffset: 1 },
            '6': { note: 'G#', octaveOffset: 1 },
            '7': { note: 'A#', octaveOffset: 1 },
        },
        
        // 反向映射：从音符到键盘按键（用于显示提示）
        _noteToKeyMap: null, // 将在初始化时生成
        
        // 音符频率映射 (A4 = 440Hz)
        _noteFrequencies: {
            'C': 261.63,   // C4
            'C#': 277.18,
            'D': 293.66,
            'D#': 311.13,
            'E': 329.63,
            'F': 349.23,
            'F#': 369.99,
            'G': 392.00,
            'G#': 415.30,
            'A': 440.00,
            'A#': 466.16,
            'B': 493.88
        },
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 加载 Tone.js 库
            try {
                if (typeof DynamicManager !== 'undefined') {
                    this.Tone = await DynamicManager.loadModule('tone');
                } else if (typeof ProcessManager !== 'undefined' && ProcessManager.requestDynamicModule) {
                    this.Tone = await ProcessManager.requestDynamicModule(pid, 'tone');
                } else if (typeof window !== 'undefined' && window.Tone) {
                    this.Tone = window.Tone;
                } else {
                    throw new Error('Tone.js 未找到');
                }
                
                if (!this.Tone) {
                    throw new Error('Tone.js 加载失败');
                }
                
                // 启动 Tone.js 音频上下文
                await this.Tone.start();
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("Piano", "Tone.js 加载成功");
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("Piano", `Tone.js 加载失败: ${error.message}`, error);
                }
                throw error;
            }
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'piano-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 1000px;
                height: 600px;
                min-width: 600px;
                min-height: 400px;
                max-width: 100vw;
                max-height: 100vh;
                display: flex;
                flex-direction: column;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('piano');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '电子钢琴',
                    icon: icon,
                    onClose: () => {
                        // 清理资源
                        this._cleanup();
                    }
                });
                
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 创建UI
            this._createUI();
            
            // 添加到容器
            guiContainer.appendChild(this.window);
            
            // 注册事件监听器
            this._registerEventListeners();
            
            // 如果使用GUIManager，窗口已自动居中并获得焦点
            if (typeof GUIManager !== 'undefined') {
                GUIManager.focusWindow(pid);
            }
        },
        
        /**
         * 创建UI界面
         */
        _createUI: function() {
            // 创建控制面板
            const controlPanel = document.createElement('div');
            controlPanel.className = 'piano-control-panel';
            controlPanel.innerHTML = `
                <div class="piano-control-group">
                    <label>音量:</label>
                    <input type="range" class="piano-volume-slider" min="0" max="100" value="70">
                    <span class="piano-volume-value">70%</span>
                </div>
                <div class="piano-control-group">
                    <label>八度:</label>
                    <button class="piano-octave-btn" data-action="decrease">-</button>
                    <span class="piano-octave-display">4</span>
                    <button class="piano-octave-btn" data-action="increase">+</button>
                </div>
                <div class="piano-control-group">
                    <button class="piano-sustain-btn">延音踏板</button>
                </div>
            `;
            this.window.appendChild(controlPanel);
            
            // 保存控制元素引用
            this._volumeSlider = controlPanel.querySelector('.piano-volume-slider');
            this._volumeValue = controlPanel.querySelector('.piano-volume-value');
            this._octaveDisplay = controlPanel.querySelector('.piano-octave-display');
            this._sustainButton = controlPanel.querySelector('.piano-sustain-btn');
            
            // 创建键盘容器
            this._keyboardContainer = document.createElement('div');
            this._keyboardContainer.className = 'piano-keyboard';
            this.window.appendChild(this._keyboardContainer);
            
            // 生成反向映射
            this._generateNoteToKeyMap();
            
            // 创建钢琴键
            this._createKeys();
            
            // 初始计算键的位置
            setTimeout(() => {
                this._updateKeyPositions();
            }, 0);
            
            // 监听窗口大小变化，重新计算键的位置
            this._setupResizeObserver();
            
            // 绑定控制事件
            this._volumeSlider.addEventListener('input', (e) => {
                this._volume = parseInt(e.target.value) / 100;
                this._volumeValue.textContent = `${e.target.value}%`;
            });
            
            const octaveButtons = controlPanel.querySelectorAll('.piano-octave-btn');
            octaveButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const action = e.target.dataset.action;
                    if (action === 'increase' && this._octave < 8) {
                        this._octave++;
                    } else if (action === 'decrease' && this._octave > 0) {
                        this._octave--;
                    }
                    this._octaveDisplay.textContent = this._octave;
                    
                    // 更新反向映射并刷新键的提示
                    this._generateNoteToKeyMap();
                    this._updateKeyHints();
                });
            });
            
            this._sustainButton.addEventListener('click', () => {
                this._sustain = !this._sustain;
                this._sustainButton.classList.toggle('active', this._sustain);
                
                // 如果关闭延音，释放所有待释放的键
                if (!this._sustain) {
                    this._activeKeys.forEach(fullNote => {
                        if (this._synths[fullNote]) {
                            this._synths[fullNote].triggerRelease();
                            setTimeout(() => {
                                if (this._synths[fullNote]) {
                                    this._synths[fullNote].dispose();
                                    delete this._synths[fullNote];
                                }
                            }, 100);
                        }
                    });
                    this._activeKeys.clear();
                    // 移除所有键的 active 状态
                    [...this._whiteKeys, ...this._blackKeys].forEach(k => {
                        k.element.classList.remove('active');
                    });
                }
            });
        },
        
        /**
         * 创建钢琴键
         */
        _createKeys: function() {
            // 标准88键钢琴布局：从A0到C8
            // 简化版：显示3个八度（C4到C6），共21个白键 + 15个黑键
            const startOctave = 4;
            const endOctave = 6;
            
            // 白键顺序
            const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
            // 黑键位置（相对于白键索引）
            const blackKeyPositions = {
                'C#': 0, 'D#': 1, 'F#': 3, 'G#': 4, 'A#': 5
            };
            
            // 先创建白键（位置由 _updateKeyPositions 统一计算）
            for (let octave = startOctave; octave <= endOctave; octave++) {
                whiteKeys.forEach((note, index) => {
                    const key = this._createKey(note, octave, 'white', index);
                    this._keyboardContainer.appendChild(key);
                    this._whiteKeys.push({ element: key, note, octave, index });
                });
            }
            
            // 再创建黑键（位置由 _updateKeyPositions 统一计算）
            for (let octave = startOctave; octave <= endOctave; octave++) {
                Object.entries(blackKeyPositions).forEach(([note, whiteIndex]) => {
                    const key = this._createKey(note, octave, 'black', whiteIndex);
                    this._keyboardContainer.appendChild(key);
                    this._blackKeys.push({ element: key, note, octave, whiteIndex });
                });
            }
        },
        
        /**
         * 生成反向映射（从音符到键盘按键）
         */
        _generateNoteToKeyMap: function() {
            this._noteToKeyMap = {};
            Object.entries(this._keyboardMap).forEach(([key, value]) => {
                const note = value.note;
                const octave = this._octave + value.octaveOffset;
                const fullNote = `${note}${octave}`;
                if (!this._noteToKeyMap[fullNote]) {
                    this._noteToKeyMap[fullNote] = [];
                }
                this._noteToKeyMap[fullNote].push(key.toUpperCase());
            });
        },
        
        /**
         * 创建单个键
         */
        _createKey: function(note, octave, type, position) {
            const key = document.createElement('div');
            key.className = `piano-key piano-key-${type}`;
            key.dataset.note = note;
            key.dataset.octave = octave;
            key.dataset.fullNote = `${note}${octave}`;
            
            // 添加标签
            if (type === 'white') {
                // 白键：显示音符和键盘按键提示
                const label = document.createElement('div');
                label.className = 'piano-key-label';
                label.textContent = `${note}${octave}`;
                key.appendChild(label);
                
                // 添加键盘按键提示
                const keyHint = document.createElement('div');
                keyHint.className = 'piano-key-hint';
                const fullNote = `${note}${octave}`;
                if (this._noteToKeyMap && this._noteToKeyMap[fullNote]) {
                    keyHint.textContent = this._noteToKeyMap[fullNote].join(' / ');
                }
                key.appendChild(keyHint);
            } else {
                // 黑键：只显示键盘按键提示
                const keyHint = document.createElement('div');
                keyHint.className = 'piano-key-hint piano-key-hint-black';
                const fullNote = `${note}${octave}`;
                if (this._noteToKeyMap && this._noteToKeyMap[fullNote]) {
                    keyHint.textContent = this._noteToKeyMap[fullNote].join(' / ');
                }
                key.appendChild(keyHint);
            }
            
            return key;
        },
        
        /**
         * 设置窗口大小监听器
         */
        _setupResizeObserver: function() {
            // 使用 ResizeObserver 监听窗口大小变化
            if (typeof ResizeObserver !== 'undefined') {
                this._resizeObserver = new ResizeObserver(() => {
                    this._updateKeyPositions();
                });
                this._resizeObserver.observe(this.window);
            } else {
                // 降级方案：使用 window resize 事件
                if (typeof EventManager !== 'undefined') {
                    EventManager.registerEventHandler(this.pid, 'resize', () => {
                        this._updateKeyPositions();
                    }, { priority: 1 });
                } else {
                    window.addEventListener('resize', () => {
                        this._updateKeyPositions();
                    });
                }
            }
        },
        
        /**
         * 更新键的位置（响应窗口大小变化）
         */
        _updateKeyPositions: function() {
            if (!this._keyboardContainer) {
                return;
            }
            
            // 获取键盘容器的实际宽度
            const containerWidth = this._keyboardContainer.clientWidth;
            
            // 计算白键宽度（自适应）
            const whiteKeyCount = this._whiteKeys.length;
            const whiteKeyGap = 2;
            const minWhiteKeyWidth = 30; // 最小宽度
            const maxWhiteKeyWidth = 60; // 最大宽度
            
            // 计算每个白键的宽度
            let whiteKeyWidth = (containerWidth - (whiteKeyCount - 1) * whiteKeyGap) / whiteKeyCount;
            whiteKeyWidth = Math.max(minWhiteKeyWidth, Math.min(maxWhiteKeyWidth, whiteKeyWidth));
            
            // 更新白键宽度和位置
            this._whiteKeys.forEach((keyData, index) => {
                keyData.element.style.width = `${whiteKeyWidth}px`;
                // 计算白键的绝对位置（从左到右）
                const octaveOffset = (keyData.octave - 4) * 7; // 每个八度7个白键
                const totalWhiteIndex = octaveOffset + keyData.index;
                const leftPosition = totalWhiteIndex * (whiteKeyWidth + whiteKeyGap);
                keyData.element.style.left = `${leftPosition}px`;
                keyData.element.style.position = 'absolute';
            });
            
            // 更新黑键位置（黑键位于对应白键的右侧，居中）
            this._blackKeys.forEach(keyData => {
                const octaveOffset = (keyData.octave - 4) * 7; // 每个八度7个白键
                const totalWhiteIndex = octaveOffset + keyData.whiteIndex;
                // 黑键位于对应白键的右侧，居中位置
                const leftPosition = totalWhiteIndex * (whiteKeyWidth + whiteKeyGap) + whiteKeyWidth - 16; // 16是黑键宽度的一半（32/2）
                keyData.element.style.left = `${leftPosition}px`;
                keyData.element.style.position = 'absolute';
            });
        },
        
        /**
         * 更新键的提示（当八度改变时）
         */
        _updateKeyHints: function() {
            // 更新所有键的键盘提示
            [...this._whiteKeys, ...this._blackKeys].forEach(keyData => {
                const fullNote = `${keyData.note}${keyData.octave}`;
                const keyHint = keyData.element.querySelector('.piano-key-hint');
                if (keyHint && this._noteToKeyMap && this._noteToKeyMap[fullNote]) {
                    keyHint.textContent = this._noteToKeyMap[fullNote].join(' / ');
                }
            });
        },
        
        /**
         * 注册事件监听器
         */
        _registerEventListeners: function() {
            // 鼠标事件
            if (typeof EventManager !== 'undefined') {
                // 使用 EventManager 注册事件（使用 selector 限制在键盘容器内）
                EventManager.registerEventHandler(this.pid, 'mousedown', (e) => {
                    if (this._keyboardContainer && (this._keyboardContainer === e.target || this._keyboardContainer.contains(e.target))) {
                        this._handleKeyPress(e.target);
                    }
                }, { priority: 1, selector: '.piano-keyboard, .piano-key' });
                
                EventManager.registerEventHandler(this.pid, 'mouseup', (e) => {
                    if (this._keyboardContainer && (this._keyboardContainer === e.target || this._keyboardContainer.contains(e.target))) {
                        this._handleKeyRelease(e.target);
                    }
                }, { priority: 1, selector: '.piano-keyboard, .piano-key' });
                
                // mouseleave 需要使用 registerElementEvent
                if (typeof EventManager.registerElementEvent === 'function') {
                    EventManager.registerElementEvent(this.pid, this._keyboardContainer, 'mouseleave', () => {
                        // 鼠标离开时释放所有键
                        this._releaseAllKeys();
                    }, { priority: 1 });
                }
                
                // 键盘事件（全局事件）
                EventManager.registerEventHandler(this.pid, 'keydown', (e) => {
                    try {
                        if (!e || !e.key) {
                            return;
                        }
                        if (!e.repeat) {
                            this._handleKeyboardPress(e.key.toLowerCase());
                        }
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error("Piano", `键盘按下事件处理失败: ${error.message}`, error);
                        }
                    }
                }, { priority: 1 });
                
                EventManager.registerEventHandler(this.pid, 'keyup', (e) => {
                    try {
                        if (!e || !e.key) {
                            return;
                        }
                        this._handleKeyboardRelease(e.key.toLowerCase());
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error("Piano", `键盘释放事件处理失败: ${error.message}`, error);
                        }
                    }
                }, { priority: 1 });
            } else {
                // 降级方案：直接使用 addEventListener
                this._keyboardContainer.addEventListener('mousedown', (e) => {
                    this._handleKeyPress(e.target);
                });
                
                this._keyboardContainer.addEventListener('mouseup', (e) => {
                    this._handleKeyRelease(e.target);
                });
                
                this._keyboardContainer.addEventListener('mouseleave', () => {
                    this._releaseAllKeys();
                });
                
                window.addEventListener('keydown', (e) => {
                    if (!e.repeat) {
                        this._handleKeyboardPress(e.key.toLowerCase());
                    }
                });
                
                window.addEventListener('keyup', (e) => {
                    this._handleKeyboardRelease(e.key.toLowerCase());
                });
            }
        },
        
        /**
         * 处理鼠标按下
         */
        _handleKeyPress: function(target) {
            try {
                // 找到最近的键元素
                let keyElement = target;
                while (keyElement && !keyElement.classList.contains('piano-key')) {
                    keyElement = keyElement.parentElement;
                }
                
                if (!keyElement || !keyElement.dataset || !keyElement.dataset.fullNote) {
                    return;
                }
                
                const fullNote = keyElement.dataset.fullNote;
                if (!this._activeKeys || this._activeKeys.has(fullNote)) {
                    return; // 已经按下或 _activeKeys 未初始化
                }
                
                this._playNote(fullNote, keyElement);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("Piano", `处理鼠标按下失败: ${error.message}`, error);
                }
            }
        },
        
        /**
         * 处理鼠标释放
         */
        _handleKeyRelease: function(target) {
            try {
                let keyElement = target;
                while (keyElement && !keyElement.classList.contains('piano-key')) {
                    keyElement = keyElement.parentElement;
                }
                
                if (!keyElement || !keyElement.dataset || !keyElement.dataset.fullNote) {
                    return;
                }
                
                const fullNote = keyElement.dataset.fullNote;
                this._stopNote(fullNote, keyElement);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("Piano", `处理鼠标释放失败: ${error.message}`, error);
                }
            }
        },
        
        /**
         * 处理键盘按下
         */
        _handleKeyboardPress: function(key) {
            if (!key || typeof key !== 'string') {
                return;
            }
            
            const keyMapping = this._keyboardMap[key];
            if (!keyMapping) {
                return;
            }
            
            try {
                const note = keyMapping.note;
                const octave = (this._octave || 4) + (keyMapping.octaveOffset || 0);
                const fullNote = `${note}${octave}`;
                
                // 找到对应的键元素
                const keyElement = this._findKeyElement(fullNote);
                if (keyElement && this._activeKeys && !this._activeKeys.has(fullNote)) {
                    this._playNote(fullNote, keyElement);
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("Piano", `处理键盘按下失败: ${error.message}`, error);
                }
            }
        },
        
        /**
         * 处理键盘释放
         */
        _handleKeyboardRelease: function(key) {
            if (!key || typeof key !== 'string') {
                return;
            }
            
            const keyMapping = this._keyboardMap[key];
            if (!keyMapping) {
                return;
            }
            
            try {
                const note = keyMapping.note;
                const octave = (this._octave || 4) + (keyMapping.octaveOffset || 0);
                const fullNote = `${note}${octave}`;
                
                const keyElement = this._findKeyElement(fullNote);
                if (keyElement) {
                    this._stopNote(fullNote, keyElement);
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("Piano", `处理键盘释放失败: ${error.message}`, error);
                }
            }
        },
        
        /**
         * 查找键元素
         */
        _findKeyElement: function(fullNote) {
            const allKeys = [...this._whiteKeys, ...this._blackKeys];
            const keyData = allKeys.find(k => k.element.dataset.fullNote === fullNote);
            return keyData ? keyData.element : null;
        },
        
        /**
         * 播放音符
         */
        _playNote: function(fullNote, keyElement) {
            if (!this.Tone) {
                return;
            }
            
            this._activeKeys.add(fullNote);
            keyElement.classList.add('active');
            
            // 解析音符
            const match = fullNote.match(/^([A-G]#?)(\d+)$/);
            if (!match) {
                return;
            }
            
            const noteName = match[1];
            const octave = parseInt(match[2]);
            
            // 使用 Tone.js 的音符字符串格式（如 "C4", "C#4"）
            const toneNote = `${noteName}${octave}`;
            
            // 如果已存在合成器，先释放
            if (this._synths[fullNote]) {
                try {
                    if (typeof this._synths[fullNote].triggerRelease === 'function') {
                        this._synths[fullNote].triggerRelease();
                    } else if (typeof this._synths[fullNote].releaseAll === 'function') {
                        this._synths[fullNote].releaseAll();
                    }
                    setTimeout(() => {
                        if (this._synths[fullNote] && typeof this._synths[fullNote].dispose === 'function') {
                            this._synths[fullNote].dispose();
                        }
                        delete this._synths[fullNote];
                    }, 50);
                } catch (error) {
                    // 忽略释放错误，直接删除
                    delete this._synths[fullNote];
                }
            }
            
            // 创建合成器（使用更真实的钢琴音色）
            const synth = new this.Tone.Synth({
                oscillator: {
                    type: 'triangle'
                },
                envelope: {
                    attack: 0.005,
                    decay: 0.1,
                    sustain: 0.3,
                    release: this._sustain ? 1.5 : 0.5
                }
            }).toDestination();
            
            // 设置音量
            synth.volume.value = this.Tone.gainToDb(this._volume);
            
            // 播放音符（使用音符字符串，Tone.js 会自动计算频率）
            synth.triggerAttack(toneNote);
            
            // 保存合成器引用（用于延音控制）
            this._synths[fullNote] = synth;
        },
        
        /**
         * 停止音符
         */
        _stopNote: function(fullNote, keyElement) {
            if (!this._sustain) {
                // 如果不使用延音，立即停止
                if (this._synths[fullNote]) {
                    this._synths[fullNote].triggerRelease();
                    // 延迟删除，确保释放完成
                    setTimeout(() => {
                        if (this._synths[fullNote]) {
                            this._synths[fullNote].dispose();
                            delete this._synths[fullNote];
                        }
                    }, 100);
                }
                
                this._activeKeys.delete(fullNote);
                if (keyElement) {
                    keyElement.classList.remove('active');
                }
            } else {
                // 延音模式下，只移除视觉反馈，但保持音符播放
                if (keyElement) {
                    keyElement.classList.remove('active');
                }
                // 延音模式下不立即释放，等待延音踏板释放或自动释放
            }
        },
        
        /**
         * 释放所有键
         */
        _releaseAllKeys: function() {
            if (!this._activeKeys) {
                return;
            }
            
            try {
                this._activeKeys.forEach(fullNote => {
                    try {
                        const keyElement = this._findKeyElement(fullNote);
                        this._stopNote(fullNote, keyElement);
                    } catch (error) {
                        // 忽略单个键释放错误，继续处理其他键
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("Piano", `释放键 ${fullNote} 失败: ${error.message}`);
                        }
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("Piano", `释放所有键失败: ${error.message}`, error);
                }
            }
        },
        
        /**
         * 清理资源
         */
        _cleanup: function() {
            // 释放所有键
            this._releaseAllKeys();
            
            // 释放所有合成器
            Object.values(this._synths).forEach(synth => {
                if (synth && typeof synth.dispose === 'function') {
                    synth.dispose();
                }
            });
            this._synths = {};
            
            // 清理 ResizeObserver
            if (this._resizeObserver) {
                this._resizeObserver.disconnect();
                this._resizeObserver = null;
            }
            
            // 清理 Tone.js 上下文
            if (this.Tone && typeof this.Tone.context !== 'undefined' && this.Tone.context.state !== 'closed') {
                this.Tone.context.close();
            }
        },
        
        __exit__: async function() {
            try {
                this._cleanup();
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("Piano", "电子钢琴程序退出");
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("Piano", `退出时发生错误: ${error.message}`, error);
                }
            }
        },
        
        __info__: function() {
            return {
                name: 'Piano',
                type: 'GUI',
                version: '1.0.0',
                description: '电子钢琴模拟器 - 基于 Tone.js 实现的完整电子钢琴',
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
    
    // 注册到全局
    if (typeof window !== 'undefined' && window.PIANO === undefined) {
        window.PIANO = PIANO;
    }
    
    // 禁止自动初始化
    // 程序必须通过 ProcessManager 启动
})(window);

