// ZerOS 视频播放器
// 支持播放 mp4, webm, avi 等视频格式
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const VIDEOPLAYER = {
        pid: null,
        window: null,
        windowId: null,
        
        // 播放器状态
        videoElement: null,  // HTML5 video 元素
        currentVideoPath: null,
        currentVideoUrl: null,
        isPlaying: false,
        isLoading: false,
        volume: 0.7,
        duration: 0,
        currentTime: 0,
        cwd: 'C:',  // 当前工作目录
        
        // UI元素引用
        videoContainer: null,
        controlsBar: null,
        playPauseBtn: null,
        stopBtn: null,
        progressBar: null,
        progressSlider: null,
        currentTimeDisplay: null,
        durationDisplay: null,
        volumeSlider: null,
        volumeDisplay: null,
        fileInfo: null,
        fullscreenBtn: null,
        
        // 定时器
        progressUpdateTimer: null,
        controlsHideTimer: null,
        isControlsVisible: true,
        
        /**
         * 初始化方法
         */
        __init__: async function(pid, initArgs) {
            try {
                this.pid = pid;
                
                // 保存当前工作目录
                this.cwd = initArgs.cwd || 'C:';
                
                // 获取 GUI 容器
                const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
                
                // 创建主窗口
                this.window = document.createElement('div');
                this.window.className = 'videoplayer-window zos-gui-window';
                this.window.dataset.pid = pid.toString();
                
                // 设置窗口样式
                if (typeof GUIManager === 'undefined') {
                    this.window.style.cssText = `
                        width: 1000px;
                        height: 600px;
                        display: flex;
                        flex-direction: column;
                        background: var(--theme-background, rgba(15, 20, 35, 0.98));
                        border: 1px solid rgba(108, 142, 255, 0.3);
                        border-radius: 12px;
                        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
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
                        icon = ApplicationAssetManager.getIcon('videoplayer');
                    }
                    
                    const windowInfo = GUIManager.registerWindow(pid, this.window, {
                        title: '视频播放器',
                        icon: icon,
                        onClose: () => {
                            if (typeof ProcessManager !== 'undefined') {
                                ProcessManager.killProgram(this.pid);
                            }
                        }
                    });
                    
                    if (windowInfo && windowInfo.windowId) {
                        this.windowId = windowInfo.windowId;
                    }
                }
                
                // 创建播放器界面
                this._createPlayerUI();
                
                // 添加到容器
                guiContainer.appendChild(this.window);
                
                // 如果提供了视频路径参数，加载视频
                if (initArgs && initArgs.args && initArgs.args.length > 0) {
                    const videoPath = initArgs.args[0];
                    await this._loadVideo(videoPath);
                }
                
            } catch (error) {
                console.error('视频播放器初始化失败:', error);
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
            content.className = 'videoplayer-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                position: relative;
                overflow: hidden;
                background: #000;
            `;
            content.dataset.pid = this.pid.toString();
            
            // 视频容器
            this.videoContainer = document.createElement('div');
            this.videoContainer.className = 'videoplayer-video-container';
            this.videoContainer.style.cssText = `
                flex: 1;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #000;
                cursor: pointer;
            `;
            
            // 创建 video 元素
            this.videoElement = document.createElement('video');
            this.videoElement.className = 'videoplayer-video';
            this.videoElement.style.cssText = `
                max-width: 100%;
                max-height: 100%;
                width: auto;
                height: auto;
                outline: none;
                user-select: none;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                pointer-events: auto;
                touch-action: none;
            `;
            this.videoElement.controls = false;  // 使用自定义控件
            this.videoElement.preload = 'metadata';
            this.videoElement.dataset.pid = this.pid.toString();
            
            // 注册视频事件
            this._registerVideoEvents();
            
            this.videoContainer.appendChild(this.videoElement);
            content.appendChild(this.videoContainer);
            
            // 文件信息（显示在视频上方）
            this.fileInfo = document.createElement('div');
            this.fileInfo.className = 'videoplayer-file-info';
            this.fileInfo.style.cssText = `
                position: absolute;
                top: 10px;
                left: 10px;
                padding: 8px 12px;
                background: rgba(0, 0, 0, 0.7);
                border-radius: 4px;
                color: #fff;
                font-size: 12px;
                z-index: 10;
                pointer-events: none;
            `;
            this.fileInfo.textContent = '未加载视频文件';
            content.appendChild(this.fileInfo);
            
            // 控制栏
            this.controlsBar = document.createElement('div');
            this.controlsBar.className = 'videoplayer-controls-bar';
            this.controlsBar.style.cssText = `
                position: absolute;
                bottom: 0;
                left: 0;
                right: 20px;
                padding: 12px 16px;
                padding-right: 24px;
                background: linear-gradient(
                    180deg,
                    transparent 0%,
                    rgba(0, 0, 0, 0.8) 100%
                );
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 10;
                transition: opacity 0.3s ease;
                pointer-events: none;
            `;
            
            // 为控制栏内容添加 pointer-events: auto，确保控制按钮可以点击
            this.controlsBar.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            
            // 进度条
            const progressContainer = document.createElement('div');
            progressContainer.className = 'videoplayer-progress-container';
            progressContainer.style.cssText = `
                width: 100%;
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            
            this.progressBar = document.createElement('div');
            this.progressBar.className = 'videoplayer-progress-bar';
            this.progressBar.style.cssText = `
                flex: 1;
                height: 6px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 3px;
                position: relative;
                cursor: pointer;
                overflow: hidden;
            `;
            
            this.progressSlider = document.createElement('div');
            this.progressSlider.className = 'videoplayer-progress-slider';
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
            
            // 进度条交互事件（点击和拖动）
            let isDragging = false;
            
            const handleProgressInteraction = (e) => {
                if (!this.videoElement || this.duration === 0) return;
                
                const rect = this.progressBar.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                const seekTime = this.duration * percentage;
                
                this._seek(seekTime);
            };
            
            // 点击事件
            this.progressBar.addEventListener('click', (e) => {
                e.stopPropagation();
                handleProgressInteraction(e);
            });
            
            // 拖动事件
            this.progressBar.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                isDragging = true;
                handleProgressInteraction(e);
                
                const onMouseMove = (moveEvent) => {
                    if (!isDragging) return;
                    moveEvent.preventDefault();
                    handleProgressInteraction(moveEvent);
                };
                
                const onMouseUp = () => {
                    isDragging = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
            
            // 防止拖动时触发视频容器的点击事件
            this.progressBar.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            
            progressContainer.appendChild(this.progressBar);
            this.controlsBar.appendChild(progressContainer);
            
            // 控制按钮区域
            const controls = document.createElement('div');
            controls.className = 'videoplayer-controls';
            controls.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
            `;
            
            // 左侧：播放控制
            const leftControls = document.createElement('div');
            leftControls.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            
            // 停止按钮
            this.stopBtn = document.createElement('button');
            this.stopBtn.className = 'videoplayer-btn-stop';
            this.stopBtn.innerHTML = '⏹';
            this.stopBtn.style.cssText = `
                width: 36px;
                height: 36px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border-radius: 50%;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            `;
            this.stopBtn.addEventListener('click', () => {
                this._stop();
            });
            this.stopBtn.addEventListener('mouseenter', () => {
                this.stopBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            });
            this.stopBtn.addEventListener('mouseleave', () => {
                this.stopBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            leftControls.appendChild(this.stopBtn);
            
            // 播放/暂停按钮
            this.playPauseBtn = document.createElement('button');
            this.playPauseBtn.className = 'videoplayer-btn-play-pause';
            this.playPauseBtn.innerHTML = '▶';
            this.playPauseBtn.style.cssText = `
                width: 48px;
                height: 48px;
                border: 2px solid #fff;
                background: rgba(255, 255, 255, 0.2);
                color: #fff;
                border-radius: 50%;
                cursor: pointer;
                font-size: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            `;
            this.playPauseBtn.addEventListener('click', () => {
                this._togglePlayPause();
            });
            this.playPauseBtn.addEventListener('mouseenter', () => {
                this.playPauseBtn.style.background = 'rgba(255, 255, 255, 0.3)';
                this.playPauseBtn.style.transform = 'scale(1.1)';
            });
            this.playPauseBtn.addEventListener('mouseleave', () => {
                this.playPauseBtn.style.background = 'rgba(255, 255, 255, 0.2)';
                this.playPauseBtn.style.transform = 'scale(1)';
            });
            leftControls.appendChild(this.playPauseBtn);
            
            // 时间显示
            const timeDisplay = document.createElement('div');
            timeDisplay.className = 'videoplayer-time-display';
            timeDisplay.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                color: rgba(255, 255, 255, 0.8);
                min-width: 120px;
            `;
            
            this.currentTimeDisplay = document.createElement('span');
            this.currentTimeDisplay.textContent = '00:00';
            timeDisplay.appendChild(this.currentTimeDisplay);
            
            timeDisplay.appendChild(document.createTextNode(' / '));
            
            this.durationDisplay = document.createElement('span');
            this.durationDisplay.textContent = '00:00';
            timeDisplay.appendChild(this.durationDisplay);
            
            leftControls.appendChild(timeDisplay);
            controls.appendChild(leftControls);
            
            // 右侧：音量和其他控制
            const rightControls = document.createElement('div');
            rightControls.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            
            // 音量控制
            const volumeContainer = document.createElement('div');
            volumeContainer.className = 'videoplayer-volume-container';
            volumeContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            
            const volumeLabel = document.createElement('span');
            volumeLabel.textContent = '🔊';
            volumeLabel.style.cssText = `
                font-size: 16px;
                color: rgba(255, 255, 255, 0.8);
            `;
            volumeContainer.appendChild(volumeLabel);
            
            const volumeSliderContainer = document.createElement('div');
            volumeSliderContainer.style.cssText = `
                width: 80px;
                height: 4px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 2px;
                position: relative;
                cursor: pointer;
            `;
            
            this.volumeSlider = document.createElement('div');
            this.volumeSlider.className = 'videoplayer-volume-slider';
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
            
            // 音量滑块交互事件（点击和拖动）
            let isVolumeDragging = false;
            
            const handleVolumeInteraction = (e) => {
                const rect = volumeSliderContainer.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                this._setVolume(percentage);
            };
            
            // 点击事件
            volumeSliderContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                handleVolumeInteraction(e);
            });
            
            // 拖动事件
            volumeSliderContainer.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                isVolumeDragging = true;
                handleVolumeInteraction(e);
                
                const onMouseMove = (moveEvent) => {
                    if (!isVolumeDragging) return;
                    moveEvent.preventDefault();
                    handleVolumeInteraction(moveEvent);
                };
                
                const onMouseUp = () => {
                    isVolumeDragging = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
            
            volumeSliderContainer.appendChild(this.volumeSlider);
            volumeContainer.appendChild(volumeSliderContainer);
            
            this.volumeDisplay = document.createElement('span');
            this.volumeDisplay.style.cssText = `
                font-size: 11px;
                color: rgba(255, 255, 255, 0.8);
                min-width: 35px;
                text-align: right;
            `;
            this.volumeDisplay.textContent = `${Math.round(this.volume * 100)}%`;
            volumeContainer.appendChild(this.volumeDisplay);
            
            rightControls.appendChild(volumeContainer);
            
            // 全屏按钮
            this.fullscreenBtn = document.createElement('button');
            this.fullscreenBtn.className = 'videoplayer-btn-fullscreen';
            this.fullscreenBtn.innerHTML = '⛶';
            this.fullscreenBtn.style.cssText = `
                width: 36px;
                height: 36px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border-radius: 4px;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            `;
            this.fullscreenBtn.addEventListener('click', () => {
                this._toggleFullscreen();
            });
            this.fullscreenBtn.addEventListener('mouseenter', () => {
                this.fullscreenBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            });
            this.fullscreenBtn.addEventListener('mouseleave', () => {
                this.fullscreenBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            rightControls.appendChild(this.fullscreenBtn);
            
            controls.appendChild(rightControls);
            this.controlsBar.appendChild(controls);
            
            content.appendChild(this.controlsBar);
            this.window.appendChild(content);
            
            // 注册鼠标移动事件（用于显示/隐藏控制栏）
            this._registerMouseEvents();
        },
        
        /**
         * 注册视频事件
         */
        _registerVideoEvents: function() {
            // 加载元数据
            this.videoElement.addEventListener('loadedmetadata', () => {
                this.duration = this.videoElement.duration;
                this._updateTimeDisplay();
            });
            
            // 时间更新
            this.videoElement.addEventListener('timeupdate', () => {
                this._updateProgress();
            });
            
            // 播放
            this.videoElement.addEventListener('play', () => {
                this._onVideoPlay();
            });
            
            // 暂停
            this.videoElement.addEventListener('pause', () => {
                this._onVideoPause();
            });
            
            // 结束
            this.videoElement.addEventListener('ended', () => {
                this._onVideoEnd();
            });
            
            // 加载错误
            this.videoElement.addEventListener('error', (e) => {
                // 检查 videoElement 是否仍然存在（可能在 __exit__ 过程中被清理）
                if (!this.videoElement) {
                    return;
                }
                
                const error = this.videoElement.error;
                let errorMsg = '未知错误';
                if (error) {
                    switch (error.code) {
                        case error.MEDIA_ERR_ABORTED:
                            errorMsg = '加载被中止';
                            break;
                        case error.MEDIA_ERR_NETWORK:
                            errorMsg = '网络错误';
                            break;
                        case error.MEDIA_ERR_DECODE:
                            errorMsg = '解码错误';
                            break;
                        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                            errorMsg = '不支持的格式';
                            break;
                    }
                }
                this._onVideoLoadError(errorMsg);
            });
            
            // 点击视频切换播放/暂停
            this.videoContainer.addEventListener('click', (e) => {
                // 如果点击的是控制栏或进度条，不切换播放状态
                if (e.target.closest('.videoplayer-controls-bar') || 
                    e.target.closest('.videoplayer-progress-bar') ||
                    e.target.closest('.videoplayer-progress-container')) {
                    return;
                }
                e.stopPropagation();
                this._togglePlayPause();
            });
            
            // 防止视频元素被拖动
            this.videoElement.addEventListener('dragstart', (e) => {
                e.preventDefault();
                return false;
            });
            
            this.videoElement.setAttribute('draggable', 'false');
        },
        
        /**
         * 注册鼠标事件（用于显示/隐藏控制栏）
         */
        _registerMouseEvents: function() {
            let mouseMoveTimer = null;
            let isMouseOverControls = false;
            
            // 检查鼠标是否在控制栏上
            const checkMouseOverControls = (e) => {
                if (!this.controlsBar) return false;
                const rect = this.controlsBar.getBoundingClientRect();
                return e.clientX >= rect.left && 
                       e.clientX <= rect.right && 
                       e.clientY >= rect.top && 
                       e.clientY <= rect.bottom;
            };
            
            // 视频容器鼠标移动事件
            this.videoContainer.addEventListener('mousemove', (e) => {
                // 检查鼠标是否在控制栏上
                isMouseOverControls = checkMouseOverControls(e);
                
                // 显示控制栏
                this._showControls();
                
                // 清除之前的定时器
                if (mouseMoveTimer) {
                    clearTimeout(mouseMoveTimer);
                    mouseMoveTimer = null;
                }
                
                // 如果鼠标不在控制栏上，3秒后隐藏控制栏
                if (!isMouseOverControls) {
                    mouseMoveTimer = setTimeout(() => {
                        // 再次检查鼠标是否在控制栏上
                        if (!isMouseOverControls && this.isPlaying) {
                            this._hideControls();
                        }
                    }, 3000);
                }
            });
            
            // 视频容器鼠标离开事件
            this.videoContainer.addEventListener('mouseleave', (e) => {
                // 如果鼠标离开视频容器且不在控制栏上，隐藏控制栏
                if (!isMouseOverControls) {
                    this._hideControls();
                }
            });
            
            // 控制栏鼠标进入事件
            if (this.controlsBar) {
                this.controlsBar.addEventListener('mouseenter', () => {
                    isMouseOverControls = true;
                    // 清除隐藏定时器
                    if (mouseMoveTimer) {
                        clearTimeout(mouseMoveTimer);
                        mouseMoveTimer = null;
                    }
                    // 确保控制栏显示
                    this._showControls();
                });
                
                // 控制栏鼠标离开事件
                this.controlsBar.addEventListener('mouseleave', () => {
                    isMouseOverControls = false;
                    // 如果正在播放，3秒后隐藏控制栏
                    if (this.isPlaying) {
                        mouseMoveTimer = setTimeout(() => {
                            if (!isMouseOverControls && this.isPlaying) {
                                this._hideControls();
                            }
                        }, 3000);
                    }
                });
            }
        },
        
        /**
         * 显示控制栏
         */
        _showControls: function() {
            if (!this.controlsBar) {
                return;
            }
            if (!this.isControlsVisible) {
                this.controlsBar.style.opacity = '1';
                this.controlsBar.style.pointerEvents = 'auto';
                this.isControlsVisible = true;
            }
        },
        
        /**
         * 隐藏控制栏
         */
        _hideControls: function() {
            if (!this.controlsBar) {
                return;
            }
            if (this.isControlsVisible && this.isPlaying) {
                this.controlsBar.style.opacity = '0';
                this.controlsBar.style.pointerEvents = 'none';
                this.isControlsVisible = false;
            }
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
         * 加载视频文件
         */
        _loadVideo: async function(videoPath) {
            try {
                if (!videoPath) {
                    throw new Error('视频路径不能为空');
                }
                
                // 停止当前播放
                if (this.videoElement) {
                    this._stop();
                }
                
                // 解析路径（如果是相对路径，基于 cwd 解析为绝对路径）
                let resolvedPath = videoPath;
                if (!videoPath.startsWith('http://') && !videoPath.startsWith('https://') && !videoPath.startsWith('data:')) {
                    // 如果不是 URL，需要解析路径
                    if (!/^[A-Za-z]:/.test(videoPath)) {
                        // 相对路径，需要解析
                        resolvedPath = this._resolvePath(this.cwd, videoPath);
                    } else {
                        // 已经是绝对路径，规范化
                        resolvedPath = videoPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
                    }
                }
                
                // 转换虚拟路径为实际URL
                let videoUrl = resolvedPath;
                
                if (resolvedPath.startsWith('http://') || resolvedPath.startsWith('https://') || resolvedPath.startsWith('data:')) {
                    videoUrl = resolvedPath;
                } else if (typeof ProcessManager !== 'undefined' && ProcessManager.convertVirtualPathToUrl) {
                    videoUrl = ProcessManager.convertVirtualPathToUrl(resolvedPath);
                } else if (resolvedPath.startsWith('D:/') || resolvedPath.startsWith('C:/')) {
                    const relativePath = resolvedPath.substring(3);
                    const disk = resolvedPath.startsWith('D:/') ? 'D' : 'C';
                    videoUrl = `/service/DISK/${disk}/${relativePath}`;
                } else if (resolvedPath.startsWith('/')) {
                    videoUrl = resolvedPath;
                }
                
                this.currentVideoPath = resolvedPath;
                this.currentVideoUrl = videoUrl;
                
                // 提取文件名
                const fileName = resolvedPath.split('/').pop() || resolvedPath.split('\\').pop() || resolvedPath;
                
                // 更新文件信息
                if (this.fileInfo) {
                    this.fileInfo.textContent = `加载中: ${fileName}`;
                }
                
                console.log('[VideoPlayer] 加载视频:', {
                    resolvedPath,
                    videoUrl,
                    fileName
                });
                
                // 设置视频源
                this.videoElement.src = videoUrl;
                this.videoElement.load();
                
                this.isLoading = true;
                
            } catch (error) {
                console.error('[VideoPlayer] 加载视频失败:', error);
                this._onVideoLoadError(error.message);
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(`加载视频失败: ${error.message}`, '错误', 'error');
                } else {
                    alert(`加载视频失败: ${error.message}`);
                }
            }
        },
        
        /**
         * 视频加载完成（元数据）
         */
        _onVideoLoaded: function() {
            if (!this.videoElement) return;
            
            this.isLoading = false;
            this.duration = this.videoElement.duration;
            
            // 更新文件信息
            if (this.fileInfo) {
                const fileName = this.currentVideoPath ? this.currentVideoPath.split('/').pop() : '未知';
                this.fileInfo.textContent = fileName;
            }
            
            // 更新时长显示
            this._updateTimeDisplay();
            
            // 开始更新进度
            this._startProgressUpdate();
        },
        
        /**
         * 视频加载错误
         */
        _onVideoLoadError: function(error) {
            this.isLoading = false;
            const errorMsg = error || '未知错误';
            console.error('[VideoPlayer] 视频加载失败:', {
                error: errorMsg,
                path: this.currentVideoPath,
                url: this.currentVideoUrl
            });
            
            if (this.fileInfo) {
                this.fileInfo.textContent = `加载失败: ${errorMsg}`;
            }
            
            this.duration = 0;
            this.currentTime = 0;
            this._updateTimeDisplay();
            this._updateProgress();
            
            // 显示详细错误信息
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                GUIManager.showAlert(
                    `视频加载失败: ${errorMsg}\n\n路径: ${this.currentVideoPath}\nURL: ${this.currentVideoUrl}`,
                    '加载失败',
                    'error'
                );
            }
        },
        
        /**
         * 视频开始播放
         */
        _onVideoPlay: function() {
            this.isPlaying = true;
            if (this.playPauseBtn) {
                this.playPauseBtn.innerHTML = '⏸';
            }
            this._startProgressUpdate();
            this._hideControls();  // 播放时自动隐藏控制栏
        },
        
        /**
         * 视频暂停
         */
        _onVideoPause: function() {
            this.isPlaying = false;
            if (this.playPauseBtn) {
                this.playPauseBtn.innerHTML = '▶';
            }
            this._stopProgressUpdate();
            this._showControls();  // 暂停时显示控制栏
        },
        
        /**
         * 视频播放结束
         */
        _onVideoEnd: function() {
            this.isPlaying = false;
            this.currentTime = 0;
            if (this.playPauseBtn) {
                this.playPauseBtn.innerHTML = '▶';
            }
            this._updateProgress();
            this._stopProgressUpdate();
            this._showControls();  // 结束时显示控制栏
        },
        
        /**
         * 切换播放/暂停
         */
        _togglePlayPause: function() {
            if (!this.videoElement) return;
            
            if (this.isPlaying) {
                this.videoElement.pause();
            } else {
                this.videoElement.play().catch(error => {
                    // 忽略 AbortError（通常是因为快速切换播放/暂停导致的）
                    if (error.name === 'AbortError') {
                        return;
                    }
                    console.error('[VideoPlayer] 播放失败:', error);
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                        GUIManager.showAlert(`播放失败: ${error.message}`, '错误', 'error');
                    }
                });
            }
        },
        
        /**
         * 停止播放
         */
        _stop: function() {
            if (!this.videoElement) return;
            
            this.videoElement.pause();
            this.videoElement.currentTime = 0;
        },
        
        /**
         * 跳转到指定时间
         */
        _seek: function(time) {
            if (!this.videoElement || this.duration === 0) return;
            
            const seekTime = Math.max(0, Math.min(this.duration, time));
            
            // 暂停进度更新，避免冲突
            const wasUpdating = this.progressUpdateTimer !== null;
            if (wasUpdating) {
                this._stopProgressUpdate();
            }
            
            // 设置时间
            this.videoElement.currentTime = seekTime;
            this.currentTime = seekTime;
            this._updateProgress();
            
            // 恢复进度更新
            if (wasUpdating && this.isPlaying) {
                this._startProgressUpdate();
            }
        },
        
        /**
         * 设置音量
         */
        _setVolume: function(volume) {
            this.volume = Math.max(0, Math.min(1, volume));
            
            if (this.videoElement) {
                this.videoElement.volume = this.volume;
            }
            
            // 更新UI
            if (this.volumeSlider) {
                this.volumeSlider.style.width = `${this.volume * 100}%`;
            }
            if (this.volumeDisplay) {
                this.volumeDisplay.textContent = `${Math.round(this.volume * 100)}%`;
            }
            
            // 更新音量图标
            if (this.volumeSlider && this.volumeSlider.parentElement) {
                const volumeLabel = this.volumeSlider.parentElement.previousElementSibling;
                if (volumeLabel) {
                    if (this.volume === 0) {
                        volumeLabel.textContent = '🔇';
                    } else if (this.volume < 0.5) {
                        volumeLabel.textContent = '🔉';
                    } else {
                        volumeLabel.textContent = '🔊';
                    }
                }
            }
        },
        
        /**
         * 切换全屏
         */
        _toggleFullscreen: function() {
            if (!this.videoContainer) return;
            
            if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement) {
                // 进入全屏
                if (this.videoContainer.requestFullscreen) {
                    this.videoContainer.requestFullscreen();
                } else if (this.videoContainer.webkitRequestFullscreen) {
                    this.videoContainer.webkitRequestFullscreen();
                } else if (this.videoContainer.mozRequestFullScreen) {
                    this.videoContainer.mozRequestFullScreen();
                }
            } else {
                // 退出全屏
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                }
            }
        },
        
        /**
         * 开始更新进度
         */
        _startProgressUpdate: function() {
            this._stopProgressUpdate();
            
            // 使用 requestAnimationFrame 提高性能和响应性
            let lastTime = performance.now();
            const update = (currentTime) => {
                if (!this.videoElement || !this.isPlaying) {
                    this.progressUpdateTimer = null;
                    return;
                }
                
                const delta = currentTime - lastTime;
                if (delta >= 100) {  // 每100ms更新一次
                    this._updateProgress();
                    lastTime = currentTime;
                }
                
                this.progressUpdateTimer = requestAnimationFrame(update);
            };
            
            this.progressUpdateTimer = requestAnimationFrame(update);
        },
        
        /**
         * 停止更新进度
         */
        _stopProgressUpdate: function() {
            if (this.progressUpdateTimer) {
                cancelAnimationFrame(this.progressUpdateTimer);
                this.progressUpdateTimer = null;
            }
        },
        
        /**
         * 更新进度
         */
        _updateProgress: function() {
            if (!this.videoElement) {
                this.currentTime = 0;
                if (this.progressSlider) {
                    this.progressSlider.style.width = '0%';
                }
                this._updateTimeDisplay();
                return;
            }
            
            if (this.isPlaying) {
                this.currentTime = this.videoElement.currentTime;
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
         * 退出方法
         */
        __exit__: async function() {
            try {
                // 停止进度更新（先停止，避免在清理过程中触发更新）
                this._stopProgressUpdate();
                
                // 移除视频事件监听器（避免在清理过程中触发事件）
                if (this.videoElement) {
                    try {
                        // 克隆 video 元素以移除所有事件监听器
                        const newVideo = this.videoElement.cloneNode(false);
                        if (this.videoElement.parentNode) {
                            this.videoElement.parentNode.replaceChild(newVideo, this.videoElement);
                        }
                        this.videoElement = newVideo;
                        
                        // 停止播放
                        this.videoElement.pause();
                        this.videoElement.src = '';
                        this.videoElement.load();
                    } catch (e) {
                        console.warn('[VideoPlayer] 停止视频失败:', e);
                    }
                }
                
                // 退出全屏（如果正在全屏）
                if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
                    try {
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        } else if (document.mozCancelFullScreen) {
                            document.mozCancelFullScreen();
                        }
                    } catch (e) {
                        console.warn('[VideoPlayer] 退出全屏失败:', e);
                    }
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
                        console.warn('[VideoPlayer] 注销 GUIManager 窗口失败:', e);
                        // 如果注销失败，手动移除 DOM
                        if (this.window && this.window.parentElement) {
                            try {
                                this.window.parentElement.removeChild(this.window);
                            } catch (domError) {
                                console.warn('[VideoPlayer] 手动移除窗口 DOM 失败:', domError);
                            }
                        }
                    }
                } else {
                    // GUIManager 不可用，手动移除 DOM
                    if (this.window && this.window.parentElement) {
                        try {
                            this.window.parentElement.removeChild(this.window);
                        } catch (e) {
                            console.warn('[VideoPlayer] 移除窗口 DOM 失败:', e);
                        }
                    }
                }
                
                // 清理所有引用
                this.window = null;
                this.videoContainer = null;
                this.videoElement = null;
                this.controlsBar = null;
                this.fileInfo = null;
                this.playPauseBtn = null;
                this.stopBtn = null;
                this.progressBar = null;
                this.progressSlider = null;
                this.currentTimeDisplay = null;
                this.durationDisplay = null;
                this.volumeSlider = null;
                this.volumeDisplay = null;
                this.fullscreenBtn = null;
                this.currentVideoPath = null;
                this.currentVideoUrl = null;
                this.windowId = null;
                
            } catch (error) {
                console.error('[VideoPlayer] 退出时发生错误:', error);
                // 即使出错，也尝试强制清理
                try {
                    if (this.videoElement) {
                        try {
                            this.videoElement.pause();
                            this.videoElement.src = '';
                        } catch (e) {}
                    }
                    
                    this._stopProgressUpdate();
                    
                    if (this.window) {
                        try {
                            if (this.window.parentElement) {
                                this.window.parentElement.removeChild(this.window);
                            } else if (this.window.parentNode) {
                                this.window.parentNode.removeChild(this.window);
                            }
                        } catch (e) {
                            console.error('[VideoPlayer] 强制移除窗口失败:', e);
                        }
                    }
                    
                    if (typeof GUIManager !== 'undefined' && GUIManager.unregisterWindow && this.pid) {
                        try {
                            GUIManager.unregisterWindow(this.pid);
                        } catch (e) {
                            console.error('[VideoPlayer] 强制注销窗口失败:', e);
                        }
                    }
                } catch (cleanupError) {
                    console.error('[VideoPlayer] 清理资源时发生错误:', cleanupError);
                }
            }
        },
        
        /**
         * 信息方法
         */
        __info__: function() {
            return {
                name: '视频播放器',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS 视频播放器 - 支持播放 mp4, webm, avi 等视频格式',
                author: 'ZerOS Team',
                copyright: '© 2024',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ
                ] : [],
                metadata: {
                    category: 'system',  // 系统应用
                    allowMultipleInstances: true,
                    supportsPreview: true,
                    dependencies: []  // 不需要动态库，使用 HTML5 video
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.VIDEOPLAYER = VIDEOPLAYER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.VIDEOPLAYER = VIDEOPLAYER;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

