// ZerOS 图片查看器
// 提供图片查看功能，支持 jpg, png, svg, webp 等格式
// 支持鼠标滚轮放大缩小和鼠标左键拖拽移动
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const IMAGEVIEWER = {
        pid: null,
        window: null,
        
        // 图片查看器状态
        currentImagePath: null,
        currentImageUrl: null,
        scale: 1.0,  // 缩放比例
        offsetX: 0,  // X偏移
        offsetY: 0,  // Y偏移
        
        // 拖拽状态
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartOffsetX: 0,
        dragStartOffsetY: 0,
        
        // DOM 元素引用
        imageContainer: null,
        imageElement: null,
        infoBar: null,
        
        /**
         * 初始化方法
         */
        __init__: async function(pid, initArgs) {
            try {
                this.pid = pid;
                
                // 获取 GUI 容器
                const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
                
                // 创建主窗口
                this.window = document.createElement('div');
                this.window.className = 'imageviewer-window zos-gui-window';
                this.window.dataset.pid = pid.toString();
                
                // 设置窗口样式
                if (typeof GUIManager === 'undefined') {
                    this.window.style.cssText = `
                        width: 900px;
                        height: 700px;
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
                        icon = ApplicationAssetManager.getIcon('imageviewer');
                    }
                    
                    // 保存窗口ID，用于后续清理
                    const windowInfo = GUIManager.registerWindow(pid, this.window, {
                        title: '图片查看器',
                        icon: icon,
                        onClose: () => {
                            // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                            // 窗口关闭由 GUIManager._closeWindow 统一处理
                            // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                            // 这样可以确保程序多实例（不同 PID）互不影响
                        }
                    });
                    
                    // 保存窗口ID，用于后续清理
                    if (windowInfo && windowInfo.windowId) {
                        this.windowId = windowInfo.windowId;
                    }
                }
                
                // 创建图片查看区域
                this._createImageViewer();
                
                // 创建信息栏
                this._createInfoBar();
                
                // 添加到容器
                guiContainer.appendChild(this.window);
                
                // 如果提供了图片路径参数，加载图片
                if (initArgs && initArgs.args && initArgs.args.length > 0) {
                    const imagePath = initArgs.args[0];
                    await this._loadImage(imagePath);
                }
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ImageViewer', '图片查看器初始化失败', error);
                }
                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                throw error;
            }
        },
        
        /**
         * 创建图片查看区域
         */
        _createImageViewer: function() {
            // 创建图片容器
            this.imageContainer = document.createElement('div');
            this.imageContainer.className = 'imageviewer-container';
            this.imageContainer.style.cssText = `
                flex: 1;
                position: relative;
                overflow: hidden;
                background: var(--theme-background, rgba(15, 20, 35, 0.95));
                cursor: grab;
                user-select: none;
            `;
            this.imageContainer.dataset.pid = this.pid.toString();
            
            // 创建图片元素
            this.imageElement = document.createElement('img');
            this.imageElement.className = 'imageviewer-image';
            this.imageElement.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                max-width: none;
                max-height: none;
                user-select: none;
                pointer-events: none;
                transition: transform 0.1s ease-out;
                opacity: 0;
                visibility: hidden;
            `;
            this.imageElement.dataset.pid = this.pid.toString();
            
            // 图片加载完成事件（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, this.imageElement, 'load', () => {
                    this._onImageLoaded();
                });
                EventManager.registerElementEvent(this.pid, this.imageElement, 'error', () => {
                    this._onImageError();
                });
            } else {
                // 降级方案
                this.imageElement.addEventListener('load', () => {
                    this._onImageLoaded();
                });
                this.imageElement.addEventListener('error', () => {
                    this._onImageError();
                });
            }
            
            this.imageContainer.appendChild(this.imageElement);
            this.window.appendChild(this.imageContainer);
            
            // 注册事件监听器
            this._registerEvents();
            
            // 注册窗口大小变化监听
            this._registerResizeObserver();
        },
        
        /**
         * 注册窗口大小变化监听
         */
        _registerResizeObserver: function() {
            // 使用 ResizeObserver 监听容器大小变化
            if (typeof ResizeObserver !== 'undefined') {
                this.resizeObserver = new ResizeObserver(() => {
                    // 延迟更新，避免频繁触发
                    if (this.resizeTimer) {
                        clearTimeout(this.resizeTimer);
                    }
                    this.resizeTimer = setTimeout(() => {
                        if (this.currentImageUrl && this.imageElement.naturalWidth > 0) {
                            // 重新限制偏移，确保图片在容器内
                            this._updateImageTransform();
                        }
                    }, 100);
                });
                
                if (this.imageContainer) {
                    this.resizeObserver.observe(this.imageContainer);
                }
            }
            
            // 备用方案：监听窗口大小变化
            this.windowResizeHandler = () => {
                if (this.resizeTimer) {
                    clearTimeout(this.resizeTimer);
                }
                this.resizeTimer = setTimeout(() => {
                    if (this.currentImageUrl && this.imageElement.naturalWidth > 0) {
                        this._updateImageTransform();
                    }
                }, 100);
            };
            
            // 使用 EventManager 注册窗口 resize 事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                this._resizeHandlerId = EventManager.registerEventHandler(this.pid, 'resize', this.windowResizeHandler, {
                    priority: 100,
                    selector: null  // 监听 window 的 resize 事件
                });
            } else {
                // 降级：直接使用 addEventListener（不推荐）
                window.addEventListener('resize', this.windowResizeHandler);
            }
        },
        
        /**
         * 创建信息栏
         */
        _createInfoBar: function() {
            this.infoBar = document.createElement('div');
            this.infoBar.className = 'imageviewer-info-bar';
            this.infoBar.style.cssText = `
                height: 44px;
                min-height: 44px;
                max-height: 44px;
                padding: 10px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: linear-gradient(
                    180deg,
                    var(--theme-background-elevated, rgba(37, 43, 53, 0.98)) 0%,
                    var(--theme-background, rgba(30, 35, 50, 0.98)) 100%
                );
                border-top: 1px solid var(--theme-border, rgba(108, 142, 255, 0.25));
                box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.2);
                color: var(--theme-text, #d7e0dd);
                font-size: 13px;
                flex-shrink: 0;
                overflow: hidden;
                box-sizing: border-box;
            `;
            this.infoBar.dataset.pid = this.pid.toString();
            
            // 左侧：图片信息
            const infoLeft = document.createElement('div');
            infoLeft.className = 'imageviewer-info-left';
            infoLeft.style.cssText = `
                display: flex;
                align-items: center;
                gap: 16px;
            `;
            
            this.infoText = document.createElement('span');
            this.infoText.textContent = '未加载图片';
            this.infoText.style.cssText = `
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 400px;
            `;
            infoLeft.appendChild(this.infoText);
            
            // 右侧：缩放信息
            const infoRight = document.createElement('div');
            infoRight.className = 'imageviewer-info-right';
            infoRight.style.cssText = `
                display: flex;
                align-items: center;
                gap: 16px;
            `;
            
            this.scaleText = document.createElement('span');
            this.scaleText.textContent = '100%';
            infoRight.appendChild(this.scaleText);
            
            // 重置按钮
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '重置';
            resetBtn.style.cssText = `
                padding: 4px 12px;
                height: 24px;
                border: 1px solid var(--theme-border, rgba(108, 142, 255, 0.3));
                background: var(--theme-primary, rgba(108, 142, 255, 0.1));
                color: var(--theme-text, #d7e0dd);
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            `;
            // 使用 EventManager 注册事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, resetBtn, 'mouseenter', () => {
                    resetBtn.style.background = 'var(--theme-primary-hover, rgba(108, 142, 255, 0.2))';
                });
                EventManager.registerElementEvent(this.pid, resetBtn, 'mouseleave', () => {
                    resetBtn.style.background = 'var(--theme-primary, rgba(108, 142, 255, 0.1))';
                });
                const resetBtnId = `imageviewer-reset-btn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                resetBtn.dataset.eventId = resetBtnId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    this._resetView();
                }, {
                    priority: 100,
                    selector: `[data-event-id="${resetBtnId}"]`
                });
            } else {
                // 降级方案
                resetBtn.addEventListener('mouseenter', () => {
                    resetBtn.style.background = 'var(--theme-primary-hover, rgba(108, 142, 255, 0.2))';
                });
                resetBtn.addEventListener('mouseleave', () => {
                    resetBtn.style.background = 'var(--theme-primary, rgba(108, 142, 255, 0.1))';
                });
                resetBtn.addEventListener('click', () => {
                    this._resetView();
                });
            }
            infoRight.appendChild(resetBtn);
            
            this.infoBar.appendChild(infoLeft);
            this.infoBar.appendChild(infoRight);
            this.window.appendChild(this.infoBar);
        },
        
        /**
         * 注册事件监听器
         */
        _registerEvents: function() {
            // 使用 EventManager 注册事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                // 鼠标滚轮缩放
                const containerId = `imageviewer-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                this.imageContainer.dataset.eventId = containerId;
                EventManager.registerEventHandler(this.pid, 'wheel', (e) => {
                    if (this.imageContainer === e.target || this.imageContainer.contains(e.target)) {
                        e.preventDefault();
                        this._handleWheel(e);
                    }
                }, {
                    priority: 100,
                    selector: `[data-event-id="${containerId}"]`
                });
                
                // 鼠标按下（开始拖拽）
                EventManager.registerEventHandler(this.pid, 'mousedown', (e) => {
                    if (this.imageContainer === e.target || this.imageContainer.contains(e.target)) {
                        if (e.button === 0) {  // 左键
                            this._handleMouseDown(e);
                        }
                    }
                }, {
                    priority: 100,
                    selector: `[data-event-id="${containerId}"]`
                });
            } else {
                // 降级方案
                // 鼠标滚轮缩放
                this.imageContainer.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    this._handleWheel(e);
                });
                
                // 鼠标按下（开始拖拽）
                this.imageContainer.addEventListener('mousedown', (e) => {
                    if (e.button === 0) {  // 左键
                        this._handleMouseDown(e);
                    }
                });
            }
            
            // 鼠标移动（拖拽中）- 使用 EventManager 注册临时拖动事件
            // 注意：这些事件在 mousedown 时注册，在 mouseup 时注销
            // 这里先定义处理函数，在 mousedown 时注册
            this._dragMousemoveHandler = (e) => {
                if (this.isDragging) {
                    this._handleMouseMove(e);
                }
            };
            
            this._dragMouseupHandler = (e) => {
                if (e.button === 0) {
                    this._handleMouseUp(e);
                    // 拖拽结束后注销临时事件
                    if (this._dragMousemoveHandlerId && typeof EventManager !== 'undefined') {
                        EventManager.unregisterEventHandler(this._dragMousemoveHandlerId);
                        this._dragMousemoveHandlerId = null;
                    }
                    if (this._dragMouseupHandlerId && typeof EventManager !== 'undefined') {
                        EventManager.unregisterEventHandler(this._dragMouseupHandlerId);
                        this._dragMouseupHandlerId = null;
                    }
                }
            };
            
            // 注册右键菜单
            this._registerContextMenu();
        },
        
        /**
         * 注册右键菜单
         */
        _registerContextMenu: function() {
            if (typeof ContextMenuManager === 'undefined') {
                return;
            }
            
            // 注册图片容器的右键菜单
            ContextMenuManager.registerContextMenu(this.pid, {
                context: 'window-content',
                selector: '.imageviewer-container',
                priority: 10,
                items: (target) => {
                    const items = [];
                    
                    // 如果已加载图片，提供菜单项
                    if (this.currentImageUrl && this.currentImagePath) {
                        items.push({
                            label: '用图片查看器打开',
                            icon: '🖼️',
                            action: () => {
                                // 如果当前图片查看器已经打开，可以重新加载
                                // 或者在新实例中打开（如果支持多实例）
                                if (typeof ProcessManager !== 'undefined') {
                                    ProcessManager.startProgram('imageviewer', {
                                        args: [this.currentImagePath],
                                        cwd: 'C:'
                                    });
                                }
                            }
                        });
                        
                        items.push({
                            separator: true
                        });
                        
                        items.push({
                            label: '重置视图',
                            icon: '🔄',
                            action: () => {
                                this._resetView();
                            }
                        });
                        
                        items.push({
                            label: '适应窗口',
                            icon: '📐',
                            action: () => {
                                this._fitToWindow();
                            }
                        });
                    }
                    
                    return items;
                }
            });
        },
        
        /**
         * 适应窗口大小
         */
        _fitToWindow: function() {
            if (!this.imageElement || !this.currentImageUrl) return;
            
            const containerRect = this.imageContainer.getBoundingClientRect();
            const imgWidth = this.imageElement.naturalWidth;
            const imgHeight = this.imageElement.naturalHeight;
            
            if (imgWidth === 0 || imgHeight === 0 || containerRect.width === 0 || containerRect.height === 0) {
                // 如果图片尺寸或容器尺寸尚未确定，等待
                return;
            }
            
            // 计算适应窗口的缩放比例（留10%边距）
            const scaleX = (containerRect.width * 0.9) / imgWidth;
            const scaleY = (containerRect.height * 0.9) / imgHeight;
            const fitScale = Math.min(scaleX, scaleY, 1.0); // 不超过100%，确保完整显示
            
            this.scale = Math.max(0.1, fitScale); // 确保最小缩放
            this.offsetX = 0;
            this.offsetY = 0;
            this._updateImageTransform();
        },
        
        /**
         * 处理鼠标滚轮
         */
        _handleWheel: function(e) {
            if (!this.currentImageUrl) return;
            
            // 计算缩放增量（根据滚轮方向）
            const zoomFactor = 0.1; // 每次缩放10%
            const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;
            
            // 获取当前图片尺寸
            const imgWidth = this.imageElement.naturalWidth || 0;
            const imgHeight = this.imageElement.naturalHeight || 0;
            
            if (imgWidth === 0 || imgHeight === 0) return;
            
            // 计算容器尺寸
            const rect = this.imageContainer.getBoundingClientRect();
            const containerWidth = rect.width;
            const containerHeight = rect.height;
            
            if (containerWidth === 0 || containerHeight === 0) return;
            
            // 计算最小缩放比例（确保图片至少能完整显示在容器内）
            const minScaleX = containerWidth / imgWidth;
            const minScaleY = containerHeight / imgHeight;
            const minScale = Math.min(minScaleX, minScaleY);
            
            // 计算最大缩放比例（不超过5倍）
            const maxScale = 5.0;
            
            // 计算新缩放比例
            const newScale = Math.max(minScale, Math.min(maxScale, this.scale + delta));
            
            // 如果缩放比例没有变化，直接返回
            if (Math.abs(newScale - this.scale) < 0.01) return;
            
            // 计算缩放中心点（鼠标位置相对于容器）
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // 计算图片中心在容器中的位置（考虑当前偏移）
            const containerCenterX = containerWidth / 2;
            const containerCenterY = containerHeight / 2;
            
            // 计算鼠标相对于图片中心的偏移（在缩放前）
            const relativeX = mouseX - containerCenterX - this.offsetX;
            const relativeY = mouseY - containerCenterY - this.offsetY;
            
            // 计算缩放比例变化
            const scaleRatio = newScale / this.scale;
            
            // 更新偏移，使鼠标位置在缩放后仍然指向图片上的同一点
            this.offsetX = mouseX - containerCenterX - (relativeX * scaleRatio);
            this.offsetY = mouseY - containerCenterY - (relativeY * scaleRatio);
            
            this.scale = newScale;
            this._updateImageTransform();
        },
        
        /**
         * 处理鼠标按下
         */
        _handleMouseDown: function(e) {
            if (!this.currentImageUrl) return;
            
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.dragStartOffsetX = this.offsetX;
            this.dragStartOffsetY = this.offsetY;
            
            this.imageContainer.style.cursor = 'grabbing';
            
            // 注册临时拖动事件（使用 EventManager）
            if (typeof EventManager !== 'undefined' && this.pid) {
                this._dragMousemoveHandlerId = EventManager.registerEventHandler(this.pid, 'mousemove', this._dragMousemoveHandler, {
                    priority: 50,
                    once: false
                });
                
                this._dragMouseupHandlerId = EventManager.registerEventHandler(this.pid, 'mouseup', this._dragMouseupHandler, {
                    priority: 50,
                    once: true
                });
            } else {
                // 降级：直接使用 addEventListener（不推荐）
                document.addEventListener('mousemove', this._dragMousemoveHandler);
                document.addEventListener('mouseup', this._dragMouseupHandler);
            }
        },
        
        /**
         * 处理鼠标移动
         */
        _handleMouseMove: function(e) {
            if (!this.isDragging) return;
            
            const deltaX = e.clientX - this.dragStartX;
            const deltaY = e.clientY - this.dragStartY;
            
            this.offsetX = this.dragStartOffsetX + deltaX;
            this.offsetY = this.dragStartOffsetY + deltaY;
            
            this._updateImageTransform();
        },
        
        /**
         * 处理鼠标抬起
         */
        _handleMouseUp: function(e) {
            if (this.isDragging) {
                this.isDragging = false;
                this.imageContainer.style.cursor = 'grab';
            }
        },
        
        /**
         * 更新图片变换
         */
        _updateImageTransform: function() {
            if (!this.imageElement || !this.currentImageUrl) return;
            
            // 获取容器和图片尺寸
            const containerRect = this.imageContainer.getBoundingClientRect();
            const imgWidth = this.imageElement.naturalWidth || 0;
            const imgHeight = this.imageElement.naturalHeight || 0;
            
            if (imgWidth === 0 || imgHeight === 0) {
                // 图片尚未加载完成，直接应用变换
                const transform = `translate(calc(-50% + ${this.offsetX}px), calc(-50% + ${this.offsetY}px)) scale(${this.scale})`;
                this.imageElement.style.transform = transform;
                this.scaleText.textContent = `${Math.round(this.scale * 100)}%`;
                return;
            }
            
            // 计算缩放后的图片尺寸
            const scaledWidth = imgWidth * this.scale;
            const scaledHeight = imgHeight * this.scale;
            
            // 计算容器中心位置
            const containerCenterX = containerRect.width / 2;
            const containerCenterY = containerRect.height / 2;
            
            // 计算图片边界（相对于容器中心）
            const halfScaledWidth = scaledWidth / 2;
            const halfScaledHeight = scaledHeight / 2;
            
            // 限制偏移，确保图片不会移出容器范围
            // 计算允许的最大偏移量（图片边缘不能超出容器边缘）
            const maxOffsetX = Math.max(0, halfScaledWidth - containerCenterX);
            const maxOffsetY = Math.max(0, halfScaledHeight - containerCenterY);
            const minOffsetX = -maxOffsetX;
            const minOffsetY = -maxOffsetY;
            
            // 如果图片小于或等于容器，不允许偏移，居中显示
            if (scaledWidth <= containerRect.width) {
                this.offsetX = 0;
            } else {
                // 限制偏移在允许范围内
                this.offsetX = Math.max(minOffsetX, Math.min(maxOffsetX, this.offsetX));
            }
            
            if (scaledHeight <= containerRect.height) {
                this.offsetY = 0;
            } else {
                // 限制偏移在允许范围内
                this.offsetY = Math.max(minOffsetY, Math.min(maxOffsetY, this.offsetY));
            }
            
            // 额外检查：确保缩放后的图片至少有一部分在容器内
            // 如果图片完全移出容器，强制居中
            if (Math.abs(this.offsetX) > maxOffsetX * 1.1 || Math.abs(this.offsetY) > maxOffsetY * 1.1) {
                this.offsetX = 0;
                this.offsetY = 0;
            }
            
            // 应用变换
            const transform = `translate(calc(-50% + ${this.offsetX}px), calc(-50% + ${this.offsetY}px)) scale(${this.scale})`;
            this.imageElement.style.transform = transform;
            
            // 更新信息栏
            this.scaleText.textContent = `${Math.round(this.scale * 100)}%`;
        },
        
        /**
         * 重置视图
         */
        _resetView: function() {
            this.scale = 1.0;
            this.offsetX = 0;
            this.offsetY = 0;
            this._updateImageTransform();
        },
        
        /**
         * 加载图片
         */
        _loadImage: async function(imagePath) {
            try {
                if (!imagePath) {
                    throw new Error('图片路径不能为空');
                }
                
                // 转换虚拟路径为实际URL
                let imageUrl = imagePath;
                
                // 如果已经是完整URL，直接使用
                if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('data:')) {
                    imageUrl = imagePath;
                } else if (typeof ProcessManager !== 'undefined' && ProcessManager.convertVirtualPathToUrl) {
                    // 使用 ProcessManager 转换路径
                    imageUrl = ProcessManager.convertVirtualPathToUrl(imagePath);
                } else {
                    // 支持所有分区 A-Z
                    const partitionMatch = imagePath.match(/^([A-Z]):\//);
                    if (partitionMatch) {
                        const disk = partitionMatch[1];
                        const relativePath = imagePath.substring(3);
                        imageUrl = `/system/service/DISK/${disk}/${relativePath}`;
                    } else if (imagePath.startsWith('/')) {
                        // 已经是相对URL路径
                        imageUrl = imagePath;
                    } else {
                        // 相对路径，尝试从当前工作目录解析
                        imageUrl = imagePath;
                    }
                }
                
                this.currentImagePath = imagePath;
                this.currentImageUrl = imageUrl;
                
                // 更新信息栏
                const fileName = imagePath.split('/').pop() || imagePath;
                this.infoText.textContent = `加载中: ${fileName}`;
                
                // 重置视图状态
                this.scale = 1.0;
                this.offsetX = 0;
                this.offsetY = 0;
                
                // 设置图片源（这会触发load事件）
                // 先确保图片元素可见性
                this.imageElement.style.opacity = '0';
                this.imageElement.style.visibility = 'visible';
                this.imageElement.src = imageUrl;
                
                // 如果图片已经缓存，load事件可能不会触发，手动检查
                if (this.imageElement.complete && this.imageElement.naturalWidth > 0) {
                    // 延迟一点，确保DOM已更新
                    setTimeout(() => {
                        this._onImageLoaded();
                    }, 10);
                }
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ImageViewer', '加载图片失败', error);
                }
                this._onImageError();
                // 加载图片失败，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '图片查看器',
                            content: `加载图片失败: ${error.message}`,
                            duration: 4000
                        });
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ImageViewer', `创建通知失败: ${e.message}`);
                        }
                    }
                }
            }
        },
        
        /**
         * 图片加载完成
         */
        _onImageLoaded: function() {
            // 更新信息栏
            const fileName = this.currentImagePath ? this.currentImagePath.split('/').pop() : '未知';
            const imgWidth = this.imageElement.naturalWidth;
            const imgHeight = this.imageElement.naturalHeight;
            this.infoText.textContent = `${fileName} (${imgWidth} × ${imgHeight})`;
            
            // 确保图片元素可见
            if (this.imageElement) {
                this.imageElement.style.opacity = '1';
                this.imageElement.style.visibility = 'visible';
            }
            
            // 等待多帧，确保窗口大小已确定
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // 再次等待，确保容器尺寸已确定
                    setTimeout(() => {
                        // 检查容器尺寸是否有效
                        const containerRect = this.imageContainer.getBoundingClientRect();
                        if (containerRect.width > 0 && containerRect.height > 0) {
                            // 计算初始缩放比例，使图片适应窗口
                            this._fitToWindow();
                            
                            // 强制更新视图
                            this._updateImageTransform();
                        } else {
                            // 如果容器尺寸仍无效，再等待一段时间
                            setTimeout(() => {
                                this._fitToWindow();
                                this._updateImageTransform();
                            }, 100);
                        }
                    }, 50);
                });
            });
        },
        
        /**
         * 图片加载错误
         */
        _onImageError: function() {
            this.infoText.textContent = '图片加载失败';
            this.imageElement.src = '';
        },
        
        /**
         * 退出方法
         */
        __exit__: async function() {
            try {
                // 清理事件处理器
                if (this._resizeHandlerId && typeof EventManager !== 'undefined') {
                    EventManager.unregisterEventHandler(this._resizeHandlerId);
                    this._resizeHandlerId = null;
                }
                if (this._dragMousemoveHandlerId && typeof EventManager !== 'undefined') {
                    EventManager.unregisterEventHandler(this._dragMousemoveHandlerId);
                    this._dragMousemoveHandlerId = null;
                }
                if (this._dragMouseupHandlerId && typeof EventManager !== 'undefined') {
                    EventManager.unregisterEventHandler(this._dragMouseupHandlerId);
                    this._dragMouseupHandlerId = null;
                }
                
                // 清理所有事件处理器（通过 EventManager）
                if (typeof EventManager !== 'undefined' && this.pid) {
                    EventManager.unregisterAllHandlersForPid(this.pid);
                }
                
                // 先清理定时器
                if (this.resizeTimer) {
                    clearTimeout(this.resizeTimer);
                    this.resizeTimer = null;
                }
                
                // 清理 ResizeObserver
                if (this.resizeObserver) {
                    try {
                        this.resizeObserver.disconnect();
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ImageViewer', '断开 ResizeObserver 失败', e);
                        }
                    }
                    this.resizeObserver = null;
                }
                
                // 清理窗口大小变化监听
                if (this.windowResizeHandler) {
                    try {
                        window.removeEventListener('resize', this.windowResizeHandler);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ImageViewer', '移除窗口大小变化监听失败', e);
                        }
                    }
                    this.windowResizeHandler = null;
                }
                
                // 注销右键菜单（在移除DOM之前）
                if (typeof ContextMenuManager !== 'undefined') {
                    try {
                        ContextMenuManager.unregisterContextMenu(this.pid);
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ImageViewer', '注销右键菜单失败', e);
                        }
                    }
                }
                
                // 注销窗口（从 GUIManager 的内部映射中移除）
                // 注意：GUIManager.unregisterWindow 会自动移除 DOM 元素，所以这里不需要手动移除
                if (typeof GUIManager !== 'undefined' && GUIManager.unregisterWindow) {
                    try {
                        // 优先使用窗口ID注销（更精确）
                        if (this.windowId) {
                            GUIManager.unregisterWindow(this.windowId);
                        } else if (this.pid) {
                            // 降级方案：使用 PID 注销所有该进程的窗口（支持多实例）
                            GUIManager.unregisterWindow(this.pid);
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('ImageViewer', '注销 GUIManager 窗口失败', e);
                        }
                        // 如果注销失败，手动移除 DOM
                        if (this.window && this.window.parentElement) {
                            try {
                                this.window.parentElement.removeChild(this.window);
                            } catch (domError) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn('ImageViewer', '手动移除窗口 DOM 失败', domError);
                                }
                            }
                        }
                    }
                } else {
                    // GUIManager 不可用，手动移除 DOM
                    if (this.window) {
                        try {
                            if (this.window.parentElement) {
                                this.window.parentElement.removeChild(this.window);
                            } else if (this.window.parentNode) {
                                this.window.parentNode.removeChild(this.window);
                            }
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn('ImageViewer', '移除窗口 DOM 失败', e);
                            }
                        }
                    }
                }
                
                // 清理所有引用
                this.window = null;
                this.imageContainer = null;
                this.imageElement = null;
                this.infoBar = null;
                this.infoText = null;
                this.scaleText = null;
                this.currentImagePath = null;
                this.currentImageUrl = null;
                this.windowId = null;
                this.isDragging = false;
                this.scale = 1.0;
                this.offsetX = 0;
                this.offsetY = 0;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('ImageViewer', '退出时发生错误', error);
                }
                // 即使出错，也尝试强制清理
                try {
                    // 清理定时器
                    if (this.resizeTimer) {
                        clearTimeout(this.resizeTimer);
                        this.resizeTimer = null;
                    }
                    
                    // 清理 ResizeObserver
                    if (this.resizeObserver) {
                        try {
                            this.resizeObserver.disconnect();
                        } catch (e) {}
                        this.resizeObserver = null;
                    }
                    
                    // 清理窗口大小变化监听
                    if (this.windowResizeHandler) {
                        try {
                            window.removeEventListener('resize', this.windowResizeHandler);
                        } catch (e) {}
                        this.windowResizeHandler = null;
                    }
                    
                    // 尝试注销窗口
                    if (typeof GUIManager !== 'undefined' && GUIManager.unregisterWindow) {
                        if (this.windowId) {
                            try {
                                GUIManager.unregisterWindow(this.windowId);
                            } catch (e) {}
                        } else if (this.pid) {
                            try {
                                GUIManager.unregisterWindow(this.pid);
                            } catch (e) {}
                        }
                    }
                    
                    // 强制移除 DOM
                    if (this.window) {
                        try {
                            if (this.window.parentElement) {
                                this.window.parentElement.removeChild(this.window);
                            } else if (this.window.parentNode) {
                                this.window.parentNode.removeChild(this.window);
                            }
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('ImageViewer', '强制移除窗口失败', e);
                            }
                        }
                    }
                } catch (cleanupError) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('ImageViewer', '清理资源时发生错误', cleanupError);
                    }
                }
            }
        },
        
        /**
         * 信息方法
         */
        __info__: function() {
            return {
                name: '图片查看器',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS 图片查看器 - 支持 jpg, png, svg, webp 等格式，提供缩放和拖拽功能',
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
                    supportsPreview: true
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.IMAGEVIEWER = IMAGEVIEWER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.IMAGEVIEWER = IMAGEVIEWER;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

