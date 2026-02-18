// ZerOS 音频播放器
// 支持播放 mp3, wav, flac 等音频格式
// 依赖 howler.js 动态库
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const AUDIOPLAYER = {
        pid: null,
        window: null,
        windowId: null,
        
        // 播放器状态
        currentSound: null,  // Howl 实例
        currentAudioPath: null,
        currentAudioUrl: null,
        isPlaying: false,
        isLoading: false,
        volume: 0.7,
        duration: 0,
        currentTime: 0,
        cwd: 'C:',  // 当前工作目录
        useHtml5Audio: false,  // 是否使用 HTML5 Audio（降级方案）
        loopMode: false,  // 循环播放模式
        keyboardHandler: null,  // 键盘事件处理器引用
        
        // UI元素引用
        audioInfo: null,
        playPauseBtn: null,
        stopBtn: null,
        loopBtn: null,
        progressBar: null,
        progressSlider: null,
        currentTimeDisplay: null,
        durationDisplay: null,
        volumeSlider: null,
        volumeDisplay: null,
        fileInfo: null,
        
        // 定时器
        progressUpdateTimer: null,

        /**
         * 获取当前语言下的本地化文本
         * @param {string} key 常量名
         * @param {string} fallback 回退文案
         * @returns {string}
         */
        _getText: function(key, fallback) {
            if (!key) return (fallback != null ? fallback : '');
            try {
                const LanguagesExpansion = (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function')
                    ? POOL.__GET__('KERNEL_GLOBAL_POOL', 'LanguagesExpansion')
                    : (typeof window !== 'undefined' ? window.LanguagesExpansion : null);
                if (LanguagesExpansion && typeof LanguagesExpansion.getText === 'function') {
                    const value = LanguagesExpansion.getText(key);
                    if (value && value !== key) return value;
                }
            } catch (e) {}
            return (fallback != null ? fallback : '');
        },

        /**
         * 初始化方法
         */
        __init__: async function(pid, initArgs) {
            try {
                this.pid = pid;
                
                // 保存当前工作目录
                this.cwd = initArgs.cwd || 'C:';
                
                // 加载 howler 动态库
                // 注意：在 __init__ 期间，进程状态可能还是 initializing，所以直接使用 DynamicManager
                try {
                    let Howl = null;
                    
                    // 优先直接使用 DynamicManager（避免进程状态检查问题）
                    if (typeof DynamicManager !== 'undefined' && DynamicManager.loadModule) {
                        Howl = await DynamicManager.loadModule('howler', {
                            force: false,
                            checkDependencies: true
                        });
                    } else if (typeof ProcessManager !== 'undefined' && ProcessManager.requestDynamicModule) {
                        // 降级方案：尝试通过 ProcessManager 请求
                        try {
                            Howl = await ProcessManager.requestDynamicModule(pid, 'howler');
                        } catch (pmError) {
                            // ProcessManager 请求失败，继续尝试从全局作用域获取
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('AudioPlayer', `ProcessManager.requestDynamicModule 失败，将从全局作用域获取: ${pmError.message}`);
                            }
                        }
                    }
                    
                    // 检查 Howl 是否可用（可能在全局作用域）
                    if (!Howl) {
                        // 尝试从全局作用域获取
                        if (typeof window !== 'undefined' && typeof window.Howl !== 'undefined') {
                            Howl = window.Howl;
                        } else if (typeof globalThis !== 'undefined' && typeof globalThis.Howl !== 'undefined') {
                            Howl = globalThis.Howl;
                        }
                    }
                    
                    if (!Howl) {
                        throw new Error('Howler 库加载失败：无法找到 Howl 类');
                    }
                    
            } catch (error) {
                // 记录错误日志
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('AudioPlayer', `加载 Howler 库失败: ${error.message}`, error);
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('AudioPlayer', '加载 Howler 库失败', error);
                    }
                }
                // 加载音频库失败，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '音频播放器',
                            content: `加载音频库失败: ${error.message}`,
                            duration: 4000
                        });
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('AudioPlayer', `创建通知失败: ${e.message}`);
                        }
                    }
                }
                throw error;
            }
                
                // 获取 GUI 容器
                const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
                
                // 创建主窗口
                this.window = document.createElement('div');
                this.window.className = 'audioplayer-window zos-gui-window';
                this.window.dataset.pid = pid.toString();
                
                // 设置窗口样式
                if (typeof GUIManager === 'undefined') {
                    this.window.style.cssText = `
                        width: 600px;
                        height: 400px;
                        display: flex;
                        flex-direction: column;
                        background: linear-gradient(180deg, rgba(26, 31, 46, 0.98) 0%, rgba(22, 33, 62, 0.98) 100%);
                        border: 1px solid rgba(108, 142, 255, 0.3);
                        border-radius: 12px;
                        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
                        backdrop-filter: blur(30px) saturate(180%);
                        -webkit-backdrop-filter: blur(30px) saturate(180%);
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
                        icon = ApplicationAssetManager.getIcon('audioplayer');
                    }
                    
                    const windowInfo = GUIManager.registerWindow(pid, this.window, {
                        title: this._getText('AUDIO_TITLE', '音频播放器'),
                        icon: icon,
                        onClose: () => {
                            // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                            // 窗口关闭由 GUIManager._closeWindow 统一处理
                            // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                            // 这样可以确保程序多实例（不同 PID）互不影响
                        }
                    });
                    
                    if (windowInfo && windowInfo.windowId) {
                        this.windowId = windowInfo.windowId;
                    }
                }
                
                // 创建播放器界面
                this._createPlayerUI();
                
                // 绑定键盘事件
                this._bindKeyboardEvents();
                
                // 绑定拖拽事件
                this._bindDragEvents();
                
                // 添加到容器
                guiContainer.appendChild(this.window);
                
                // 如果提供了音频路径参数，加载音频
                if (initArgs && initArgs.args && initArgs.args.length > 0) {
                    const audioPath = initArgs.args[0];
                    // 重置 HTML5 Audio 标志（首次加载使用 Web Audio API）
                    this.useHtml5Audio = false;
                    await this._loadAudio(audioPath);
                }
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('AudioPlayer', '音频播放器初始化失败', error);
                }
                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                throw error;
            }
        },
        
        /**
         * 创建播放器界面
         */
        _createPlayerUI: function() {
            // 创建主内容区域
            const content = document.createElement('div');
            content.className = 'audioplayer-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                padding: 20px;
                gap: 20px;
                overflow: hidden;
            `;
            content.dataset.pid = this.pid.toString();
            
            // 文件信息区域
            this.fileInfo = document.createElement('div');
            this.fileInfo.className = 'audioplayer-file-info';
            this.fileInfo.style.cssText = `
                padding: 16px;
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.6));
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.2));
                border-radius: 8px;
                text-align: center;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));
                font-size: 14px;
            `;
            this.fileInfo.textContent = this._getText('AUDIO_NO_FILE', '未加载音频文件');
            content.appendChild(this.fileInfo);
            
            // 音频信息区域
            this.audioInfo = document.createElement('div');
            this.audioInfo.className = 'audioplayer-audio-info';
            this.audioInfo.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
                align-items: center;
            `;
            
            // 文件名
            const fileName = document.createElement('div');
            fileName.className = 'audioplayer-file-name';
            fileName.style.cssText = `
                font-size: 16px;
                font-weight: 600;
                color: var(--theme-text, #d7e0dd);
                text-align: center;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 100%;
            `;
            fileName.textContent = this._getText('AUDIO_NOT_LOADED', '未加载');
            this.audioInfo.appendChild(fileName);
            
            // 时间显示
            const timeDisplay = document.createElement('div');
            timeDisplay.className = 'audioplayer-time-display';
            timeDisplay.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));
            `;
            
            this.currentTimeDisplay = document.createElement('span');
            this.currentTimeDisplay.textContent = '00:00';
            timeDisplay.appendChild(this.currentTimeDisplay);
            
            timeDisplay.appendChild(document.createTextNode(' / '));
            
            this.durationDisplay = document.createElement('span');
            this.durationDisplay.textContent = '00:00';
            timeDisplay.appendChild(this.durationDisplay);
            
            this.audioInfo.appendChild(timeDisplay);
            content.appendChild(this.audioInfo);
            
            // 进度条
            const progressContainer = document.createElement('div');
            progressContainer.className = 'audioplayer-progress-container';
            progressContainer.style.cssText = `
                width: 100%;
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            
            this.progressBar = document.createElement('div');
            this.progressBar.className = 'audioplayer-progress-bar';
            this.progressBar.style.cssText = `
                flex: 1;
                height: 6px;
                background: var(--theme-background-secondary, rgba(20, 25, 40, 0.5));
                border-radius: 3px;
                position: relative;
                cursor: pointer;
                overflow: hidden;
            `;
            
            this.progressSlider = document.createElement('div');
            this.progressSlider.className = 'audioplayer-progress-slider';
            this.progressSlider.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                height: 100%;
                width: 0%;
                background: var(--theme-primary, #6C8EFF);
                border-radius: 3px;
                transition: width 0.1s linear;
            `;
            this.progressBar.appendChild(this.progressSlider);
            
            // 进度条点击和拖拽事件
            let isDragging = false;
            this.progressBar.addEventListener('mousedown', (e) => {
                if (!this.currentSound || this.duration === 0) return;
                isDragging = true;
                const rect = this.progressBar.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                const seekTime = this.duration * percentage;
                this._seek(seekTime);
                
                // 使用 EventManager 注册临时拖动事件
                if (typeof EventManager !== 'undefined' && this.pid) {
                    const onMouseMove = (moveEvent) => {
                        if (isDragging && this.currentSound && this.duration > 0) {
                            const rect = this.progressBar.getBoundingClientRect();
                            const mouseX = moveEvent.clientX - rect.left;
                            const percentage = Math.max(0, Math.min(1, mouseX / rect.width));
                            const seekTime = this.duration * percentage;
                            this._seek(seekTime);
                        }
                    };
                    
                    const onMouseUp = () => {
                        isDragging = false;
                        // 注销临时事件
                        if (this._progressDragHandlers) {
                            if (this._progressDragHandlers.mousemoveHandlerId) {
                                EventManager.unregisterEventHandler(this._progressDragHandlers.mousemoveHandlerId);
                            }
                            if (this._progressDragHandlers.mouseupHandlerId) {
                                EventManager.unregisterEventHandler(this._progressDragHandlers.mouseupHandlerId);
                            }
                            this._progressDragHandlers = null;
                        }
                    };
                    
                    // 注册临时事件（拖动时）
                    const mousemoveHandlerId = EventManager.registerEventHandler(this.pid, 'mousemove', onMouseMove, {
                        priority: 50,
                        once: false
                    });
                    
                    const mouseupHandlerId = EventManager.registerEventHandler(this.pid, 'mouseup', onMouseUp, {
                        priority: 50,
                        once: true
                    });
                    
                    // 保存 handlerId 以便在 mouseup 时注销
                    this._progressDragHandlers = { mousemoveHandlerId, mouseupHandlerId };
                } else {
                    // 降级：直接使用 addEventListener（不推荐）
                    const onMouseMove = (e) => {
                        if (isDragging && this.currentSound && this.duration > 0) {
                            const rect = this.progressBar.getBoundingClientRect();
                            const mouseX = e.clientX - rect.left;
                            const percentage = Math.max(0, Math.min(1, mouseX / rect.width));
                            const seekTime = this.duration * percentage;
                            this._seek(seekTime);
                        }
                    };
                    
                    const onMouseUp = () => {
                        isDragging = false;
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    };
                    
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                }
            });
            
            // 进度条点击事件（兼容性）
            this.progressBar.addEventListener('click', (e) => {
                if (!isDragging && this.currentSound && this.duration > 0) {
                    const rect = this.progressBar.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                    const seekTime = this.duration * percentage;
                    this._seek(seekTime);
                }
            });
            
            progressContainer.appendChild(this.progressBar);
            content.appendChild(progressContainer);
            
            // 控制按钮区域
            const controls = document.createElement('div');
            controls.className = 'audioplayer-controls';
            controls.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 16px;
            `;
            
            // 循环播放按钮（移到控制按钮区域）
            this.loopBtn = document.createElement('button');
            this.loopBtn.className = 'audioplayer-btn-loop';
            this.loopBtn.innerHTML = '🔁';
            this.loopBtn.title = '循环播放 (关闭)';
            this.loopBtn.style.cssText = `
                width: 40px;
                height: 40px;
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.3));
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.6));
                color: var(--theme-text, #d7e0dd);
                border-radius: 50%;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                opacity: 0.5;
            `;
            this.loopBtn.addEventListener('click', () => {
                this.loopMode = !this.loopMode;
                if (this.currentSound) {
                    this.currentSound.loop(this.loopMode);
                }
                this.loopBtn.style.opacity = this.loopMode ? '1' : '0.5';
                this.loopBtn.title = this.loopMode ? '循环播放 (开启)' : '循环播放 (关闭)';
            });
            this.loopBtn.addEventListener('mouseenter', () => {
                this.loopBtn.style.background = 'var(--theme-primary-hover, rgba(108, 142, 255, 0.2))';
            });
            this.loopBtn.addEventListener('mouseleave', () => {
                this.loopBtn.style.background = 'var(--theme-background-elevated, rgba(37, 43, 53, 0.6))';
            });
            controls.appendChild(this.loopBtn);
            
            // 停止按钮
            this.stopBtn = document.createElement('button');
            this.stopBtn.className = 'audioplayer-btn-stop';
            this.stopBtn.innerHTML = '⏹';
            this.stopBtn.style.cssText = `
                width: 40px;
                height: 40px;
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.3));
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.6));
                color: var(--theme-text, #d7e0dd);
                border-radius: 50%;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            `;
            this.stopBtn.addEventListener('click', () => {
                this._stop();
            });
            this.stopBtn.addEventListener('mouseenter', () => {
                this.stopBtn.style.background = 'var(--theme-primary-hover, rgba(108, 142, 255, 0.2))';
            });
            this.stopBtn.addEventListener('mouseleave', () => {
                this.stopBtn.style.background = 'var(--theme-background-elevated, rgba(37, 43, 53, 0.6))';
            });
            controls.appendChild(this.stopBtn);
            
            // 播放/暂停按钮
            this.playPauseBtn = document.createElement('button');
            this.playPauseBtn.className = 'audioplayer-btn-play-pause';
            this.playPauseBtn.innerHTML = '▶';
            this.playPauseBtn.style.cssText = `
                width: 56px;
                height: 56px;
                border: 2px solid var(--theme-primary, #6C8EFF);
                background: var(--theme-primary, rgba(108, 142, 255, 0.2));
                color: var(--theme-primary, #6C8EFF);
                border-radius: 50%;
                cursor: pointer;
                font-size: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            `;
            this.playPauseBtn.addEventListener('click', () => {
                this._togglePlayPause();
            });
            this.playPauseBtn.addEventListener('mouseenter', () => {
                this.playPauseBtn.style.background = 'var(--theme-primary-hover, rgba(108, 142, 255, 0.3))';
            });
            this.playPauseBtn.addEventListener('mouseleave', () => {
                this.playPauseBtn.style.background = 'var(--theme-primary, rgba(108, 142, 255, 0.2))';
            });
            controls.appendChild(this.playPauseBtn);
            
            content.appendChild(controls);
            
            // 音量控制区域
            const volumeContainer = document.createElement('div');
            volumeContainer.className = 'audioplayer-volume-container';
            volumeContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                margin-top: 8px;
            `;
            
            const volumeLabel = document.createElement('span');
            volumeLabel.textContent = '🔊';
            volumeLabel.style.cssText = `
                font-size: 16px;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));
            `;
            volumeContainer.appendChild(volumeLabel);
            
            const volumeSliderContainer = document.createElement('div');
            volumeSliderContainer.style.cssText = `
                flex: 1;
                height: 4px;
                background: var(--theme-background-secondary, rgba(20, 25, 40, 0.5));
                border-radius: 2px;
                position: relative;
                cursor: pointer;
            `;
            
            this.volumeSlider = document.createElement('div');
            this.volumeSlider.className = 'audioplayer-volume-slider';
            this.volumeSlider.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                height: 100%;
                width: ${this.volume * 100}%;
                background: var(--theme-primary, #6C8EFF);
                border-radius: 2px;
                transition: width 0.1s;
            `;
            
            // 音量滑块点击事件
            volumeSliderContainer.addEventListener('click', (e) => {
                const rect = volumeSliderContainer.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                this._setVolume(percentage);
            });
            
            volumeSliderContainer.appendChild(this.volumeSlider);
            volumeContainer.appendChild(volumeSliderContainer);
            
            this.volumeDisplay = document.createElement('span');
            this.volumeDisplay.style.cssText = `
                font-size: 12px;
                color: var(--theme-text-secondary, rgba(215, 224, 221, 0.6));
                min-width: 40px;
                text-align: right;
            `;
            this.volumeDisplay.textContent = `${Math.round(this.volume * 100)}%`;
            volumeContainer.appendChild(this.volumeDisplay);
            
            content.appendChild(volumeContainer);
            
            // 添加打开文件按钮
            const openFileBtn = document.createElement('button');
            openFileBtn.className = 'audioplayer-btn-open';
            openFileBtn.textContent = this._getText('AUDIO_OPEN_FILE', '打开文件');
            openFileBtn.style.cssText = `
                margin-top: 12px;
                padding: 8px 16px;
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.3));
                background: var(--theme-background-elevated, rgba(37, 43, 53, 0.6));
                color: var(--theme-text, #d7e0dd);
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            `;
            openFileBtn.addEventListener('click', () => {
                this._openFileDialog();
            });
            openFileBtn.addEventListener('mouseenter', () => {
                openFileBtn.style.background = 'var(--theme-primary-hover, rgba(108, 142, 255, 0.2))';
            });
            openFileBtn.addEventListener('mouseleave', () => {
                openFileBtn.style.background = 'var(--theme-background-elevated, rgba(37, 43, 53, 0.6))';
            });
            content.appendChild(openFileBtn);
            
            this.window.appendChild(content);
        },
        
        /**
         * 解析路径（将相对路径转换为绝对路径）
         */
        _resolvePath: function(cwd, inputPath) {
            if (!inputPath) return cwd;
            
            // 如果已经是绝对盘符路径（如 C: 或 C:/...），直接返回
            if (/^[A-Za-z]:/.test(inputPath)) {
                // 统一反斜杠为斜杠，去重连续的斜杠，并移除末尾斜杠
                return inputPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
            }
            
            const root = String(cwd).split('/')[0];
            let baseParts = String(cwd).split('/');
            
            // 如果以 / 开头，表示相对于当前盘符根
            if (inputPath.startsWith('/')) {
                baseParts = [root];
                inputPath = inputPath.replace(/^\/+/, '');
            }
            
            const parts = inputPath.split('/').filter(Boolean);
            for (const p of parts) {
                if (p === '.') continue;
                if (p === '..') {
                    if (baseParts.length > 1) baseParts.pop();
                    // 若已到盘符根则保持不变
                } else {
                    baseParts.push(p);
                }
            }
            
            return baseParts.join('/');
        },
        
        /**
         * 加载音频文件
         */
        _loadAudio: async function(audioPath, retryWithHtml5 = false) {
            try {
                if (!audioPath) {
                    throw new Error('音频路径不能为空');
                }
                
                // 如果是重试，重置 HTML5 Audio 标志
                if (retryWithHtml5) {
                    this.useHtml5Audio = true;
                }
                
                // 停止当前播放
                if (this.currentSound) {
                    this._stop();
                }
                
                // 解析路径（如果是相对路径，基于 cwd 解析为绝对路径）
                let resolvedPath = audioPath;
                if (!audioPath.startsWith('http://') && !audioPath.startsWith('https://') && !audioPath.startsWith('data:')) {
                    // 如果不是 URL，需要解析路径
                    if (!/^[A-Za-z]:/.test(audioPath)) {
                        // 相对路径，需要解析
                        resolvedPath = this._resolvePath(this.cwd, audioPath);
                    } else {
                        // 已经是绝对路径，规范化
                        resolvedPath = audioPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
                    }
                }
                
                // 转换虚拟路径为实际URL
                let audioUrl = resolvedPath;
                
                if (resolvedPath.startsWith('http://') || resolvedPath.startsWith('https://') || resolvedPath.startsWith('data:')) {
                    audioUrl = resolvedPath;
                } else if (typeof ProcessManager !== 'undefined' && ProcessManager.convertVirtualPathToUrl) {
                    audioUrl = ProcessManager.convertVirtualPathToUrl(resolvedPath);
                } else if (resolvedPath.startsWith('/')) {
                    audioUrl = resolvedPath;
                }else{
                    // 支持所有分区 A-Z
                    const partitionMatch = resolvedPath.match(/^([A-Z]):\//);
                    if (partitionMatch) {
                        const disk = partitionMatch[1];
                        const relativePath = resolvedPath.substring(3);
                        audioUrl = `/system/service/DISK/${disk}/${relativePath}`;
                    }
                }
                
                this.currentAudioPath = resolvedPath;
                this.currentAudioUrl = audioUrl;
                
                // 获取文件名（用于显示和格式检测）
                // 支持 / 和 \ 路径分隔符
                const fileName = resolvedPath.split(/[/\\]/).pop() || resolvedPath;
                
                // 更新文件信息
                if (this.fileInfo) {
                    const loadingText = this._getText('AUDIO_LOADING', '加载中: {0}');
                    this.fileInfo.textContent = loadingText.replace('{0}', fileName);
                }
                
                // 检查 Howl 是否可用
                const HowlClass = typeof Howl !== 'undefined' ? Howl : (typeof window.Howl !== 'undefined' ? window.Howl : null);
                if (!HowlClass) {
                    throw new Error('Howler 库未加载');
                }
                
                // 获取文件扩展名以确定格式
                const extension = fileName.split('.').pop()?.toLowerCase() || '';
                const format = extension || undefined;  // Howler 会根据扩展名自动检测格式
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('AudioPlayer', `加载音频: ${fileName} (${extension})`, { resolvedPath, audioUrl, fileName, extension, format });
                }
                
                // 创建 Howl 实例
                // 如果之前使用 HTML5 Audio 失败，或者这是重试，使用 HTML5 Audio
                const useHtml5 = this.useHtml5Audio;
                
                this.currentSound = new HowlClass({
                    src: [audioUrl],
                    html5: useHtml5,  // 如果 Web Audio API 解码失败，使用 HTML5 Audio
                    format: format ? [format] : undefined,  // 指定格式（可选，Howler会自动检测）
                    preload: true,  // 预加载
                    volume: this.volume,
                    loop: this.loopMode,  // 设置循环播放
                    onload: () => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('AudioPlayer', `音频加载成功 ${useHtml5 ? '(HTML5 Audio)' : '(Web Audio API)'}`);
                        }
                        this._onAudioLoaded();
                    },
                    onloaderror: (id, error) => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('AudioPlayer', `音频加载错误: ${id}`, error);
                        }
                        
                        // 如果是解码错误且当前使用的是 Web Audio API，尝试切换到 HTML5 Audio
                        if (!useHtml5 && error && (typeof error === 'string' && (error.includes('Decoding') || error.includes('decode')))) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.info('AudioPlayer', 'Web Audio API 解码失败，尝试使用 HTML5 Audio');
                            }
                            this.useHtml5Audio = true;
                            
                            // 清理当前实例
                            if (this.currentSound) {
                                try {
                                    this.currentSound.unload();
                                } catch (e) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('AudioPlayer', '清理音频实例失败', e);
                                    }
                                }
                                this.currentSound = null;
                            }
                            
                            // 使用 HTML5 Audio 重试（使用保存的原始路径）
                            const originalPath = this.currentAudioPath || resolvedPath;
                            setTimeout(() => {
                                this._loadAudio(originalPath, true);  // 重新加载，标记为重试
                            }, 100);
                            return;
                        }
                        
                        // 其他错误，正常处理
                        this._onAudioLoadError(error);
                    },
                    onplay: () => {
                        this._onAudioPlay();
                    },
                    onpause: () => {
                        this._onAudioPause();
                    },
                    onstop: () => {
                        this._onAudioStop();
                    },
                    onend: () => {
                        this._onAudioEnd();
                    }
                });
                
                // 开始加载
                this.isLoading = true;
                this.currentSound.load();
                
            } catch (error) {
                // _onAudioLoadError 已经记录了日志并显示通知，这里不需要重复
                this._onAudioLoadError(error);
            }
        },
        
        /**
         * 音频加载完成
         */
        _onAudioLoaded: function() {
            if (!this.currentSound) return;
            
            this.isLoading = false;
            this.duration = this.currentSound.duration();
            
            // 应用循环播放设置
            if (this.currentSound) {
                this.currentSound.loop(this.loopMode);
            }
            
            // 更新循环播放按钮状态
            if (this.loopBtn) {
                this.loopBtn.style.opacity = this.loopMode ? '1' : '0.5';
                this.loopBtn.title = this.loopMode ? '循环播放 (开启)' : '循环播放 (关闭)';
            }
            
            // 更新文件信息
            if (this.fileInfo) {
                const fileName = this.currentAudioPath ? this.currentAudioPath.split('/').pop() : '未知';
                this.fileInfo.textContent = fileName;
            }
            
            // 更新时长显示
            this._updateTimeDisplay();
            
            // 开始更新进度
            this._startProgressUpdate();
        },
        
        /**
         * 音频加载错误
         */
        _onAudioLoadError: function(error) {
            this.isLoading = false;
            const errorMsg = error || '未知错误';
            const errorInfo = {
                error: errorMsg,
                path: this.currentAudioPath,
                url: this.currentAudioUrl
            };
            
            // 记录错误日志
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('AudioPlayer', `音频加载失败: ${errorMsg}`, errorInfo);
            } else {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('AudioPlayer', '音频加载失败', errorInfo);
                }
            }
            
            if (this.fileInfo) {
                const failedText = this._getText('AUDIO_LOAD_FAILED', '加载失败: {0}');
                this.fileInfo.textContent = failedText.replace('{0}', errorMsg);
            }
            
            // 清理失败的音频实例
            if (this.currentSound) {
                try {
                    this.currentSound.unload();
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('AudioPlayer', `清理音频实例失败: ${e.message}`, e);
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('AudioPlayer', '清理音频实例失败', e);
                        }
                    }
                }
                this.currentSound = null;
            }
            
            this.duration = 0;
            this.currentTime = 0;
            this._updateTimeDisplay();
            
            // 显示详细错误信息，使用通知提示（不打断用户）
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                try {
                    NotificationManager.createNotification(this.pid, {
                        type: 'snapshot',
                        title: '加载失败',
                        content: `音频加载失败: ${errorMsg}\n\n路径: ${this.currentAudioPath}\nURL: ${this.currentAudioUrl}`,
                        duration: 5000
                    }).catch(e => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('AudioPlayer', `创建通知失败: ${e.message}`);
                        }
                    });
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('AudioPlayer', `创建通知失败: ${e.message}`);
                    }
                }
            }
        },
        
        /**
         * 音频开始播放
         */
        _onAudioPlay: function() {
            this.isPlaying = true;
            if (this.playPauseBtn) {
                this.playPauseBtn.innerHTML = '⏸';
            }
            this._startProgressUpdate();
        },
        
        /**
         * 音频暂停
         */
        _onAudioPause: function() {
            this.isPlaying = false;
            if (this.playPauseBtn) {
                this.playPauseBtn.innerHTML = '▶';
            }
            this._stopProgressUpdate();
        },
        
        /**
         * 音频停止
         */
        _onAudioStop: function() {
            this.isPlaying = false;
            this.currentTime = 0;
            if (this.playPauseBtn) {
                this.playPauseBtn.innerHTML = '▶';
            }
            this._updateProgress();
            this._stopProgressUpdate();
        },
        
        /**
         * 音频播放结束
         */
        _onAudioEnd: function() {
            this.isPlaying = false;
            
            // 如果开启了循环播放，自动重新播放
            if (this.loopMode && this.currentSound) {
                this.currentSound.play();
                return;
            }
            
            this.currentTime = 0;
            if (this.playPauseBtn) {
                this.playPauseBtn.innerHTML = '▶';
            }
            this._updateProgress();
            this._stopProgressUpdate();
        },
        
        /**
         * 切换播放/暂停
         */
        _togglePlayPause: function() {
            if (!this.currentSound) return;
            
            if (this.isPlaying) {
                this.currentSound.pause();
            } else {
                this.currentSound.play();
            }
        },
        
        /**
         * 停止播放
         */
        _stop: function() {
            if (!this.currentSound) return;
            
            this.currentSound.stop();
        },
        
        /**
         * 跳转到指定时间
         */
        _seek: function(time) {
            if (!this.currentSound || this.duration === 0) return;
            
            const seekTime = Math.max(0, Math.min(this.duration, time));
            this.currentSound.seek(seekTime);
            this.currentTime = seekTime;
            this._updateProgress();
        },
        
        /**
         * 设置音量
         */
        _setVolume: function(volume) {
            this.volume = Math.max(0, Math.min(1, volume));
            
            if (this.currentSound) {
                this.currentSound.volume(this.volume);
            }
            
            // 更新UI
            if (this.volumeSlider) {
                this.volumeSlider.style.width = `${this.volume * 100}%`;
            }
            if (this.volumeDisplay) {
                this.volumeDisplay.textContent = `${Math.round(this.volume * 100)}%`;
            }
        },
        
        /**
         * 开始更新进度
         */
        _startProgressUpdate: function() {
            this._stopProgressUpdate();
            this.progressUpdateTimer = setInterval(() => {
                this._updateProgress();
            }, 100);
        },
        
        /**
         * 停止更新进度
         */
        _stopProgressUpdate: function() {
            if (this.progressUpdateTimer) {
                clearInterval(this.progressUpdateTimer);
                this.progressUpdateTimer = null;
            }
        },
        
        /**
         * 更新进度
         */
        _updateProgress: function() {
            if (!this.currentSound) {
                this.currentTime = 0;
                if (this.progressSlider) {
                    this.progressSlider.style.width = '0%';
                }
                this._updateTimeDisplay();
                return;
            }
            
            if (this.isPlaying) {
                this.currentTime = this.currentSound.seek() || 0;
            }
            
            // 更新进度条
            if (this.progressSlider) {
                if (this.duration > 0) {
                    const percentage = (this.currentTime / this.duration) * 100;
                    this.progressSlider.style.width = `${percentage}%`;
                } else {
                    this.progressSlider.style.width = '0%';
                }
            }
            
            this._updateTimeDisplay();
        },
        
        /**
         * 更新时间显示
         */
        _updateTimeDisplay: function() {
            if (this.currentTimeDisplay) {
                this.currentTimeDisplay.textContent = this._formatTime(this.currentTime);
            }
            if (this.durationDisplay) {
                this.durationDisplay.textContent = this._formatTime(this.duration);
            }
        },
        
        /**
         * 格式化时间
         */
        _formatTime: function(seconds) {
            if (!isFinite(seconds) || isNaN(seconds)) {
                return '00:00';
            }
            
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        },
        
        /**
         * 绑定键盘事件
         */
        _bindKeyboardEvents: function() {
            // 移除旧的事件监听器（如果存在）
            if (this.keyboardHandler) {
                document.removeEventListener('keydown', this.keyboardHandler);
            }
            
            this.keyboardHandler = (e) => {
                // 只在窗口获得焦点时处理
                if (!this.window || !this.window.classList.contains('zos-window-focused')) {
                    return;
                }
                
                // 检查是否在输入框中
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                )) {
                    return;
                }
                
                // 空格键：播放/暂停
                if (e.key === ' ' || e.key === 'Space') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._togglePlayPause();
                }
                // 左箭头：快退5秒
                else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.currentSound && this.duration > 0) {
                        const newTime = Math.max(0, this.currentTime - 5);
                        this._seek(newTime);
                    }
                }
                // 右箭头：快进5秒
                else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.currentSound && this.duration > 0) {
                        const newTime = Math.min(this.duration, this.currentTime + 5);
                        this._seek(newTime);
                    }
                }
                // 上箭头：增加音量
                else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    const newVolume = Math.min(1, this.volume + 0.1);
                    this._setVolume(newVolume);
                }
                // 下箭头：减少音量
                else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    const newVolume = Math.max(0, this.volume - 0.1);
                    this._setVolume(newVolume);
                }
                // S键：停止
                else if (e.key === 's' || e.key === 'S') {
                    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        this._stop();
                    }
                }
                // O键：打开文件
                else if (e.key === 'o' || e.key === 'O') {
                    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        this._openFileDialog();
                    }
                }
            };
            
            // 使用 EventManager 注册键盘事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                this._keyboardHandlerId = EventManager.registerEventHandler(this.pid, 'keydown', this.keyboardHandler, {
                    priority: 100,
                    useCapture: false
                });
            } else {
                // 降级：直接使用 addEventListener（不推荐）
                document.addEventListener('keydown', this.keyboardHandler, { passive: false });
            }
        },
        
        /**
         * 绑定拖拽事件
         */
        _bindDragEvents: function() {
            if (!this.window) return;
            
            this.window.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 不再修改窗口透明度，防止虚化
                // this.window.style.opacity = '0.8';
            });
            
            this.window.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 不再修改窗口透明度，防止虚化
                // this.window.style.opacity = '1';
            });
            
            this.window.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 不再修改窗口透明度，防止虚化
                // this.window.style.opacity = '1';
                
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    // 检查是否是音频文件
                    const audioExtensions = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'wma'];
                    const extension = file.name.split('.').pop()?.toLowerCase() || '';
                    
                    if (audioExtensions.includes(extension)) {
                        // 创建临时URL
                        const fileUrl = URL.createObjectURL(file);
                        await this._loadAudio(fileUrl);
                    } else {
                        // 请拖拽音频文件，静默处理（不打断用户）
                    }
                }
            });
        },
        
        /**
         * 打开文件对话框（使用文件管理器的选择模式）
         */
        _openFileDialog: async function() {
            try {
                if (typeof ProcessManager === 'undefined' || typeof ProcessManager.startProgram !== 'function') {
                    // ProcessManager 不可用，使用通知提示（不打断用户）
                    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                        try {
                            await NotificationManager.createNotification(this.pid, {
                                type: 'snapshot',
                                title: '音频播放器',
                                content: 'ProcessManager 不可用',
                                duration: 3000
                            });
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('AudioPlayer', `ProcessManager 不可用，且创建通知失败: ${e.message}`);
                            }
                        }
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('AudioPlayer', 'ProcessManager 不可用');
                        }
                    }
                    return;
                }
                
                // 启动文件管理器，设置为文件选择模式
                await ProcessManager.startProgram('filemanager', {
                    args: [this.cwd || 'C:'],
                    mode: 'file-selector',  // 文件选择器模式
                    onFileSelected: async (fileItem) => {
                        // 文件选择回调
                        if (fileItem && fileItem.path) {
                            try {
                                await this._loadAudio(fileItem.path);
                            } catch (error) {
                                // 记录错误日志
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('AudioPlayer', `加载音频文件失败: ${error.message}`, error);
                                } else {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.error('AudioPlayer', '加载音频文件失败', error);
                                    }
                                }
                                // 调用 _onAudioLoadError 显示通知
                                this._onAudioLoadError(error);
                            }
                        }
                    }
                });
            } catch (error) {
                // 记录错误日志
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('AudioPlayer', `打开文件对话框失败: ${error.message}`, error);
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('AudioPlayer', '打开文件对话框失败', error);
                    }
                }
                // 打开文件对话框失败，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '音频播放器',
                            content: `打开文件对话框失败: ${error.message}`,
                            duration: 4000
                        });
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('AudioPlayer', `创建通知失败: ${e.message}`);
                        }
                    }
                }
            }
        },
        
        /**
         * 退出方法
         */
        __exit__: async function() {
            try {
                // 清理临时拖动事件处理器
                if (this._progressDragHandlers) {
                    if (this._progressDragHandlers.mousemoveHandlerId && typeof EventManager !== 'undefined') {
                        EventManager.unregisterEventHandler(this._progressDragHandlers.mousemoveHandlerId);
                    }
                    if (this._progressDragHandlers.mouseupHandlerId && typeof EventManager !== 'undefined') {
                        EventManager.unregisterEventHandler(this._progressDragHandlers.mouseupHandlerId);
                    }
                    this._progressDragHandlers = null;
                }
                
                // 清理键盘事件处理器
                if (this._keyboardHandlerId && typeof EventManager !== 'undefined') {
                    EventManager.unregisterEventHandler(this._keyboardHandlerId);
                    this._keyboardHandlerId = null;
                }
                
                // 清理所有事件处理器（通过 EventManager）
                if (typeof EventManager !== 'undefined' && this.pid) {
                    EventManager.unregisterAllHandlersForPid(this.pid);
                }
                
                // 停止播放
                if (this.currentSound) {
                    try {
                        this.currentSound.stop();
                        this.currentSound.unload();
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('AudioPlayer', '停止音频失败', e);
                        }
                    }
                    this.currentSound = null;
                }
                
                // 停止进度更新
                this._stopProgressUpdate();
                
                // 移除键盘事件监听器
                if (this.keyboardHandler) {
                    document.removeEventListener('keydown', this.keyboardHandler);
                    this.keyboardHandler = null;
                }
                
                // 注销窗口（从 GUIManager 的内部映射中移除）
                if (typeof GUIManager !== 'undefined' && GUIManager.unregisterWindow) {
                    try {
                        if (this.windowId) {
                            GUIManager.unregisterWindow(this.windowId);
                        } else if (this.pid) {
                            GUIManager.unregisterWindow(this.pid);
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('AudioPlayer', '注销 GUIManager 窗口失败', e);
                        }
                        // 如果注销失败，手动移除 DOM
                        if (this.window && this.window.parentElement) {
                            try {
                                this.window.parentElement.removeChild(this.window);
                            } catch (domError) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('AudioPlayer', '手动移除窗口 DOM 失败', domError);
                                }
                            }
                        }
                    }
                } else {
                    // GUIManager 不可用，手动移除 DOM
                    if (this.window && this.window.parentElement) {
                        try {
                            this.window.parentElement.removeChild(this.window);
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('AudioPlayer', '移除窗口 DOM 失败', e);
                            }
                        }
                    }
                }
                
                // 清理所有引用
                this.window = null;
                this.fileInfo = null;
                this.audioInfo = null;
                this.playPauseBtn = null;
                this.stopBtn = null;
                this.progressBar = null;
                this.progressSlider = null;
                this.currentTimeDisplay = null;
                this.durationDisplay = null;
                this.volumeSlider = null;
                this.volumeDisplay = null;
                this.currentAudioPath = null;
                this.currentAudioUrl = null;
                this.windowId = null;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('AudioPlayer', '退出时发生错误', error);
                }
                // 即使出错，也尝试强制清理
                try {
                    if (this.currentSound) {
                        try {
                            this.currentSound.stop();
                            this.currentSound.unload();
                        } catch (e) {}
                        this.currentSound = null;
                    }
                    
                    this._stopProgressUpdate();
                    
                    if (this.window) {
                        try {
                            if (this.window.parentElement) {
                                this.window.parentElement.removeChild(this.window);
                            } else if (this.window.parentNode) {
                                this.window.parentNode.removeChild(this.window);
                            }
                        } catch (e) {}
                    }
                    
                    if (typeof GUIManager !== 'undefined' && GUIManager.unregisterWindow && this.pid) {
                        try {
                            GUIManager.unregisterWindow(this.pid);
                        } catch (e) {}
                    }
                } catch (cleanupError) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('AudioPlayer', '清理资源时发生错误', cleanupError);
                    }
                }
            }
        },
        
        /**
         * 信息方法
         */
        __info__: function() {
            return {
                name: '音频播放器',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS 音频播放器 - 支持播放 mp3, wav, flac 等音频格式',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    category: 'system',  // 系统应用
                    allowMultipleInstances: true,
                    supportsPreview: true,
                    dependencies: ['howler']  // 依赖 howler 动态库
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.AUDIOPLAYER = AUDIOPLAYER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.AUDIOPLAYER = AUDIOPLAYER;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

