// 通知管理器
// 负责系统通知的显示、管理和交互
// 依赖：TaskbarManager, ProcessManager, GUIManager

KernelLogger.info("NotificationManager", "模块初始化");

class NotificationManager {
    // ==================== 常量配置 ====================
    static CONFIG = {
        // 容器配置
        CONTAINER_WIDTH: 380,
        CONTAINER_TOP: 60,  // 增加顶部距离，避免通知溢出
        CONTAINER_SIDE: 20,
        CONTAINER_MIN_HEIGHT: 100,
        CONTAINER_Z_INDEX: 10000,
        
        // 蒙版层配置
        OVERLAY_WIDTH: '45vw',
        OVERLAY_Z_INDEX: 9998,
        
        // 动画配置
        ANIMATION: {
            SHOW_DURATION: 250,
            HIDE_DURATION: 200,
            OVERLAY_FADE: 150,
            DEPENDENT_EXPAND: 300,
            DEPENDENT_REMOVE: 200,
            SNAPSHOT_REMOVE: 150,
            GLOBAL_CHECK_DELAY: 150,
            MOUSE_LEAVE_DELAY: 100
        },
        
        // 样式配置
        STYLES: {
            NOTIFICATION_PADDING_SNAPSHOT: '16px',
            NOTIFICATION_PADDING_DEPENDENT: '12px',
            NOTIFICATION_GAP_SNAPSHOT: '12px',
            NOTIFICATION_GAP_DEPENDENT: '0',
            CLOSE_BUTTON_SIZE: 24,
            CLOSE_BUTTON_SIZE_CONTAINER: 32,
            BORDER_RADIUS: '16px',
            BLUR_AMOUNT: 20
        },
        
        // 水滴动画初始状态
        WATER_DROP: {
            INITIAL_SIZE: 50,
            INITIAL_SCALE: 0.2,
            INITIAL_TRANSLATE_X: 80,
            TARGET_BORDER_RADIUS: '16px'
        }
    };
    
    // ==================== 私有属性 ====================
    // DOM元素
    static _notificationContainer = null;
    static _notificationOverlay = null;
    static _emptyStateElement = null;
    static _hoverZone = null;
    
    // 数据存储
    static _notifications = new Map();
    static _notificationIdCounter = 0;
    
    // 状态标志
    static _initialized = false;
    static _isShowing = false;
    
    // 事件监听器
    static _hoverListeners = [];
    static _taskbarPositionListener = null;
    
    // 鼠标跟踪
    static _triggerThreshold = 15;
    static _lastMouseX = -1;
    static _lastMouseY = -1;
    
    // 动画定时器
    static _showAnimationTimer = null;
    static _hideAnimationTimer = null;
    
    // ==================== 工具方法 ====================
    
    /**
     * 获取任务栏位置
     * @returns {string} 任务栏位置 ('bottom', 'right', 'left', 'top')
     */
    static _getTaskbarPosition() {
        if (typeof TaskbarManager !== 'undefined' && TaskbarManager._taskbarPosition) {
            return TaskbarManager._taskbarPosition;
        }
        return 'bottom';
    }
    
    /**
     * 检查鼠标是否在元素内
     * @param {number} x - 鼠标X坐标
     * @param {number} y - 鼠标Y坐标
     * @param {DOMRect} rect - 元素边界矩形
     * @returns {boolean}
     */
    static _isPointInRect(x, y, rect) {
        if (!rect) return false;
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }
    
    /**
     * 创建关闭按钮
     * @param {string} notificationId - 通知ID（可选）
     * @param {Object} options - 选项
     * @returns {HTMLElement} 关闭按钮元素
     */
    static _createCloseButton(notificationId = null, options = {}) {
        const {
            size = NotificationManager.CONFIG.STYLES.CLOSE_BUTTON_SIZE,
            className = '',
            position = 'relative'
        } = options;
        
        const button = document.createElement('button');
        button.innerHTML = '✕';
        button.className = className || 'notification-close-button';
        
        const isAbsolute = position === 'absolute';
        button.style.cssText = `
            position: ${position};
            ${isAbsolute ? 'top: 8px; right: 8px;' : ''}
            width: ${size}px;
            height: ${size}px;
            border: none;
            background: rgba(255, 255, 255, 0.1);
            color: #e0e0e0;
            border-radius: 50%;
            cursor: pointer;
            font-size: ${size * 0.6}px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            flex-shrink: 0;
            z-index: ${isAbsolute ? 100 : 'auto'};
            pointer-events: auto;
        `;
        
        button.onmouseenter = () => {
            button.style.background = 'rgba(255, 255, 255, 0.2)';
            button.style.transform = 'scale(1.1)';
        };
        button.onmouseleave = () => {
            button.style.background = 'rgba(255, 255, 255, 0.1)';
            button.style.transform = 'scale(1)';
        };
        button.onclick = (e) => {
            e.stopPropagation();
            if (notificationId) {
                NotificationManager.removeNotification(notificationId);
            } else {
                NotificationManager._hideNotificationContainer();
            }
        };
        
        return button;
    }
    
    /**
     * 设置元素样式
     * @param {HTMLElement} element - 元素
     * @param {string|Object} styles - 样式字符串或对象
     */
    static _setStyles(element, styles) {
        if (typeof styles === 'string') {
            element.style.cssText = styles;
        } else if (typeof styles === 'object') {
            Object.assign(element.style, styles);
        }
    }
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化通知管理器
     * @returns {Promise<void>}
     */
    static async init() {
        if (NotificationManager._initialized) {
            KernelLogger.debug("NotificationManager", "已初始化，跳过");
            return;
        }
        
        if (typeof document === 'undefined') {
            KernelLogger.warn("NotificationManager", "document 不可用，跳过通知管理器初始化");
            return;
        }
        
        KernelLogger.info("NotificationManager", "初始化通知管理器");
        
        try {
            NotificationManager._createNotificationContainer();
            NotificationManager._setupTaskbarPositionListener();
            NotificationManager._registerToPOOL();
            
            NotificationManager._initialized = true;
            KernelLogger.info("NotificationManager", "通知管理器初始化完成");
            
            if (!NotificationManager._notificationContainer) {
                KernelLogger.error("NotificationManager", "通知容器创建失败");
            }
        } catch (e) {
            KernelLogger.error("NotificationManager", `初始化失败: ${e.message}`, e);
            throw e;
        }
    }
    
    /**
     * 处理容器点击事件
     * @param {MouseEvent} e - 点击事件
     */
    static _handleContainerClick(e) {
        const clickedElement = e.target;
        const shouldIgnore = 
            clickedElement.closest('.notification-item') ||
            clickedElement.closest('.notification-container-close') ||
            clickedElement.closest('.notification-dependent-close') ||
            clickedElement.closest('.notification-empty-state') ||
            clickedElement.closest('.notification-dependent-wrapper') ||
            clickedElement.id === 'notification-empty-state';
        
        if (shouldIgnore) {
            return;
        }
        
        e.stopPropagation();
        NotificationManager._hideNotificationContainer();
    }
    
    /**
     * 处理蒙版层点击事件
     * @param {MouseEvent} e - 点击事件
     */
    static _handleOverlayClick(e) {
        const container = NotificationManager._notificationContainer;
        if (container && container.contains(e.target)) {
            return;
        }
        
        e.stopPropagation();
        NotificationManager._hideNotificationContainer();
    }
    
    /**
     * 创建依赖类型通知的包装容器
     * @param {HTMLElement} notificationElement - 通知元素
     * @param {string} notificationId - 通知ID
     * @returns {HTMLElement} 包装容器元素
     */
    static _createDependentWrapper(notificationElement, notificationId) {
        const wrapperElement = document.createElement('div');
        wrapperElement.className = 'notification-dependent-wrapper';
        wrapperElement.dataset.notificationId = notificationId;
        
        NotificationManager._setStyles(wrapperElement, {
            position: 'relative',
            marginTop: '-12px',
            marginLeft: '0',
            marginRight: '0',
            marginBottom: '12px',
            padding: '0',
            overflow: 'hidden',
            zIndex: '1'
        });
        
        // 初始状态：圆形小尺寸，从右侧滑入
        const waterDrop = NotificationManager.CONFIG.WATER_DROP;
        NotificationManager._setStyles(wrapperElement, {
            width: `${waterDrop.INITIAL_SIZE}px`,
            height: `${waterDrop.INITIAL_SIZE}px`,
            borderRadius: '50%',
            opacity: '0',
            transform: `translateX(${waterDrop.INITIAL_TRANSLATE_X}px) scale(${waterDrop.INITIAL_SCALE})`,
            transition: 'none',
            overflow: 'hidden',
            background: 'rgba(30, 30, 30, 0.95)',
            backdropFilter: `blur(${NotificationManager.CONFIG.STYLES.BLUR_AMOUNT}px)`,
            webkitBackdropFilter: `blur(${NotificationManager.CONFIG.STYLES.BLUR_AMOUNT}px)`
        });
        
        // 将通知元素添加到包装容器
        wrapperElement.appendChild(notificationElement);
        
        // 调整通知元素样式以适应包装容器
        NotificationManager._setStyles(notificationElement, {
            margin: '0',
            borderRadius: 'inherit',
            width: '100%',
            minWidth: '0',
            maxWidth: '100%',
            height: 'auto',
            boxSizing: 'border-box'
        });
        
        // 添加到容器
        NotificationManager._notificationContainer.appendChild(wrapperElement);
        
        // 触发水滴动画
        NotificationManager._triggerDependentAnimation(wrapperElement, notificationElement);
        
        return wrapperElement;
    }
    
    /**
     * 触发依赖类型通知的水滴动画
     * @param {HTMLElement} wrapperElement - 包装容器元素
     * @param {HTMLElement} notificationElement - 通知元素
     */
    static _triggerDependentAnimation(wrapperElement, notificationElement) {
        requestAnimationFrame(() => {
            const config = NotificationManager.CONFIG;
            let containerWidth = config.CONTAINER_WIDTH;
            
            if (NotificationManager._notificationContainer) {
                const containerRect = NotificationManager._notificationContainer.getBoundingClientRect();
                if (containerRect.width > 0) {
                    containerWidth = containerRect.width;
                } else {
                    const computedStyle = window.getComputedStyle(NotificationManager._notificationContainer);
                    containerWidth = parseInt(computedStyle.width) || config.CONTAINER_WIDTH;
                }
            }
            
            // 创建测量容器
            const measureContainer = document.createElement('div');
            NotificationManager._setStyles(measureContainer, {
                position: 'absolute',
                top: '-9999px',
                left: '-9999px',
                width: `${containerWidth}px`,
                visibility: 'hidden',
                pointerEvents: 'none',
                boxSizing: 'border-box'
            });
            
            const measureElement = notificationElement.cloneNode(true);
            NotificationManager._setStyles(measureElement, {
                width: '100%',
                height: 'auto',
                position: 'static',
                boxSizing: 'border-box'
            });
            
            measureContainer.appendChild(measureElement);
            document.body.appendChild(measureContainer);
            
            // 强制重排
            void measureContainer.offsetHeight;
            void measureElement.offsetHeight;
            
            requestAnimationFrame(() => {
                const rect = measureElement.getBoundingClientRect();
                const minWidth = 300;
                const minHeight = 60;
                const targetWidth = Math.max(rect.width || containerWidth, minWidth);
                const targetHeight = Math.max(rect.height || minHeight, minHeight);
                
                if (measureContainer.parentNode) {
                    document.body.removeChild(measureContainer);
                }
                
                NotificationManager._applyDependentWaterDropAnimation(wrapperElement, targetWidth, targetHeight);
            });
        });
    }
    
    /**
     * 创建通知标题栏
     * @param {HTMLElement} notificationElement - 通知元素
     * @param {string} notificationId - 通知ID
     * @param {string} title - 标题
     */
    static _createNotificationHeader(notificationElement, notificationId, title) {
        const header = document.createElement('div');
        NotificationManager._setStyles(header, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
        });
        
        if (title) {
            const titleElement = document.createElement('div');
            NotificationManager._setStyles(titleElement, {
                fontSize: '14px',
                fontWeight: '600',
                color: '#e0e0e0',
                flex: '1',
                minWidth: '0'
            });
            titleElement.textContent = title;
            header.appendChild(titleElement);
        }
        
        const closeButton = NotificationManager._createCloseButton(notificationId);
        header.appendChild(closeButton);
        notificationElement.appendChild(header);
    }
    
    /**
     * 创建通知容器
     */
    static _createNotificationContainer() {
        if (NotificationManager._notificationContainer) {
            return;
        }
        
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        
        const config = NotificationManager.CONFIG;
        NotificationManager._setStyles(container, `
            position: fixed;
            top: ${config.CONTAINER_TOP}px;
            right: ${config.CONTAINER_SIDE}px;
            width: ${config.CONTAINER_WIDTH}px;
            max-width: calc(100vw - ${config.CONTAINER_SIDE * 2}px);
            height: auto;
            max-height: calc(100vh - ${config.CONTAINER_TOP}px - 20px);
            z-index: ${config.CONTAINER_Z_INDEX};
            display: none;
            flex-direction: column;
            gap: 12px;
            padding: 48px 0 0 0;
            pointer-events: none;
            min-height: ${config.CONTAINER_MIN_HEIGHT}px;
            overflow-y: auto;
            overflow-x: hidden;
            box-sizing: border-box;
        `);
        
        // 创建关闭按钮（放在容器顶部，避免与通知的关闭按钮重叠）
        const closeButton = NotificationManager._createCloseButton(null, {
            size: config.STYLES.CLOSE_BUTTON_SIZE_CONTAINER,
            className: 'notification-container-close',
            position: 'absolute'
        });
        closeButton.id = 'notification-container-close';
        // 调整位置，避免与通知的关闭按钮重叠
        // 通知的关闭按钮在 top: 8px, right: 8px（相对于通知元素）
        // 容器关闭按钮放在更靠上的位置，避免重叠
        closeButton.style.top = '4px';
        closeButton.style.right = '8px';
        closeButton.style.zIndex = '10001';
        container.appendChild(closeButton);
        
        NotificationManager._notificationContainer = container;
        document.body.appendChild(container);
        
        // 添加点击事件：点击通知容器的空白区域时关闭通知栏
        container.addEventListener('click', NotificationManager._handleContainerClick.bind(NotificationManager));
        
        // 创建蒙版层
        NotificationManager._createNotificationOverlay();
        
        // 创建空状态元素
        NotificationManager._createEmptyState();
        
        KernelLogger.debug("NotificationManager", "通知容器已创建");
    }
    
    /**
     * 创建通知蒙版层
     */
    static _createNotificationOverlay() {
        if (NotificationManager._notificationOverlay) {
            return;
        }
        
        const overlay = document.createElement('div');
        overlay.id = 'notification-overlay';
        overlay.className = 'notification-overlay';
        const config = NotificationManager.CONFIG;
        NotificationManager._setStyles(overlay, `
            position: fixed;
            top: 0;
            bottom: 0;
            width: ${config.OVERLAY_WIDTH};
            height: 100vh;
            background: rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            z-index: ${config.OVERLAY_Z_INDEX};
            display: none;
            pointer-events: auto;
            opacity: 0;
            transition: opacity ${config.ANIMATION.OVERLAY_FADE}ms ease-out;
        `);
        
        NotificationManager._notificationOverlay = overlay;
        document.body.appendChild(overlay);
        
        // 更新蒙版层位置
        NotificationManager._updateNotificationOverlayPosition();
        
        KernelLogger.debug("NotificationManager", "通知蒙版层已创建");
    }
    
    /**
     * 创建空状态元素
     */
    static _createEmptyState() {
        if (NotificationManager._emptyStateElement) {
            return;
        }
        
        const emptyState = document.createElement('div');
        emptyState.id = 'notification-empty-state';
        emptyState.className = 'notification-empty-state';
        emptyState.style.cssText = `
            background: rgba(30, 30, 30, 0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            padding: 40px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            pointer-events: auto;
            min-height: 120px;
        `;
        
        const icon = document.createElement('div');
        icon.style.cssText = `
            font-size: 48px;
            opacity: 0.5;
            margin-bottom: 8px;
        `;
        icon.textContent = '🔔';
        emptyState.appendChild(icon);
        
        const text = document.createElement('div');
        text.style.cssText = `
            font-size: 14px;
            color: #b3b3b3;
            text-align: center;
        `;
        text.textContent = '暂时没有通知';
        emptyState.appendChild(text);
        
        NotificationManager._emptyStateElement = emptyState;
        
        // 初始隐藏
        emptyState.style.display = 'none';
        
        // 添加点击事件：点击空状态区域时关闭通知栏
        emptyState.addEventListener('click', (e) => {
            e.stopPropagation();
            NotificationManager._hideNotificationContainer();
        });
        
        if (NotificationManager._notificationContainer) {
            // 将空状态元素插入到容器的最前面，这样在没有通知时会显示在顶部
            NotificationManager._notificationContainer.insertBefore(
                emptyState,
                NotificationManager._notificationContainer.firstChild
            );
        }
        
        KernelLogger.debug("NotificationManager", "空状态元素已创建");
    }
    
    /**
     * 更新空状态显示
     */
    static _updateEmptyState() {
        if (!NotificationManager._emptyStateElement) {
            NotificationManager._createEmptyState();
            if (!NotificationManager._emptyStateElement) {
                return;
            }
        }
        
        const hasNotifications = NotificationManager._notifications.size > 0;
        NotificationManager._emptyStateElement.style.display = hasNotifications ? 'none' : 'flex';
    }
    
    // ==================== 悬浮区域相关（已废弃，保留代码以备将来使用） ====================
    
    /**
     * 创建鼠标悬浮监听区域（已废弃：现在使用任务栏按钮触发）
     * @deprecated 不再使用，保留代码以备将来需要
     */
    static _createHoverZone() {
        // 已废弃：现在使用任务栏按钮触发通知栏
        // 保留代码以备将来需要
    }
    
    /**
     * 更新悬浮区域位置（已废弃）
     * @deprecated 不再使用，保留代码以备将来需要
     */
    static _updateHoverZonePosition() {
        if (!NotificationManager._hoverZone) {
            return;
        }
        // 已废弃：现在使用任务栏按钮触发通知栏
        // 保留代码以备将来需要
    }
    
    /**
     * 设置鼠标悬浮监听（已废弃）
     * @deprecated 不再使用，保留代码以备将来需要
     */
    static _setupHoverListeners() {
        if (!NotificationManager._hoverZone) {
            KernelLogger.error("NotificationManager", "悬浮区域不存在，无法设置事件监听器");
            return;
        }
        
        KernelLogger.debug("NotificationManager", "开始设置事件监听器");
        
        // 鼠标进入悬浮区域（即时触发）
        const mouseEnterHandler = () => {
            KernelLogger.debug("NotificationManager", "鼠标进入悬浮区域");
            // 立即显示，不延迟
            if (!NotificationManager._isShowing) {
                NotificationManager._showNotificationContainer();
            }
        };
        NotificationManager._hoverZone.addEventListener('mouseenter', mouseEnterHandler);
        KernelLogger.debug("NotificationManager", "已绑定 mouseenter 事件");
        
        // 鼠标离开悬浮区域
        const mouseLeaveHandler = (e) => {
            KernelLogger.debug("NotificationManager", "鼠标离开悬浮区域");
            // 检查鼠标是否移动到通知容器或蒙版层
            const container = NotificationManager._notificationContainer;
            const overlay = NotificationManager._notificationOverlay;
            const relatedTarget = e.relatedTarget;
            
            if (relatedTarget) {
                if (container && container.contains(relatedTarget)) {
                    KernelLogger.debug("NotificationManager", "鼠标移动到通知容器，不隐藏");
                    return;
                }
                if (overlay && overlay.contains(relatedTarget)) {
                    KernelLogger.debug("NotificationManager", "鼠标移动到蒙版层，不隐藏");
                    return;
                }
            }
            
            // 如果有通知内容，只有在鼠标真正离开通知栏区域时才隐藏
            if (NotificationManager._notifications.size > 0) {
                // 延迟检查，确保鼠标确实离开了
                setTimeout(() => {
                    const containerRect = container ? container.getBoundingClientRect() : null;
                    const hoverZoneRect = NotificationManager._hoverZone.getBoundingClientRect();
                    const mouseX = NotificationManager._lastMouseX;
                    const mouseY = NotificationManager._lastMouseY;
                    
                    // 检查鼠标是否在通知容器或悬浮区域内
                    const isInContainer = containerRect && 
                        mouseX >= containerRect.left && 
                        mouseX <= containerRect.right &&
                        mouseY >= containerRect.top && 
                        mouseY <= containerRect.bottom;
                    
                    const isInHoverZone = mouseX >= hoverZoneRect.left && 
                        mouseX <= hoverZoneRect.right &&
                        mouseY >= hoverZoneRect.top && 
                        mouseY <= hoverZoneRect.bottom;
                    
                    if (!isInContainer && !isInHoverZone && NotificationManager._isShowing) {
                        NotificationManager._hideNotificationContainer();
                    }
                }, 100);
            } else {
                // 没有通知内容时，立即隐藏
                if (NotificationManager._isShowing) {
                    NotificationManager._hideNotificationContainer();
                }
            }
        };
        NotificationManager._hoverZone.addEventListener('mouseleave', mouseLeaveHandler);
        KernelLogger.debug("NotificationManager", "已绑定 mouseleave 事件");
        
        // 鼠标进入通知容器
        if (NotificationManager._notificationContainer) {
            const containerEnterHandler = () => {
                KernelLogger.debug("NotificationManager", "鼠标进入通知容器");
                // 立即显示，不延迟
                if (!NotificationManager._isShowing) {
                    NotificationManager._showNotificationContainer();
                }
            };
            NotificationManager._notificationContainer.addEventListener('mouseenter', containerEnterHandler);
            KernelLogger.debug("NotificationManager", "已绑定通知容器 mouseenter 事件");
            
            const containerLeaveHandler = (e) => {
                KernelLogger.debug("NotificationManager", "鼠标离开通知容器");
                // 检查鼠标是否移动到悬浮区域或蒙版层
                const hoverZone = NotificationManager._hoverZone;
                const overlay = NotificationManager._notificationOverlay;
                const relatedTarget = e.relatedTarget;
                
                if (relatedTarget) {
                    if (hoverZone && hoverZone.contains(relatedTarget)) {
                        KernelLogger.debug("NotificationManager", "鼠标移动到悬浮区域，不隐藏");
                        return;
                    }
                    if (overlay && overlay.contains(relatedTarget)) {
                        KernelLogger.debug("NotificationManager", "鼠标移动到蒙版层，不隐藏");
                        return;
                    }
                }
                
                // 如果有通知内容，延迟检查鼠标是否真的离开了
                if (NotificationManager._notifications.size > 0) {
                    setTimeout(() => {
                        const containerRect = NotificationManager._notificationContainer.getBoundingClientRect();
                        const hoverZoneRect = hoverZone.getBoundingClientRect();
                        const mouseX = NotificationManager._lastMouseX;
                        const mouseY = NotificationManager._lastMouseY;
                        
                        const isInContainer = mouseX >= containerRect.left && 
                            mouseX <= containerRect.right &&
                            mouseY >= containerRect.top && 
                            mouseY <= containerRect.bottom;
                        
                        const isInHoverZone = mouseX >= hoverZoneRect.left && 
                            mouseX <= hoverZoneRect.right &&
                            mouseY >= hoverZoneRect.top && 
                            mouseY <= hoverZoneRect.bottom;
                        
                        if (!isInContainer && !isInHoverZone && NotificationManager._isShowing) {
                            NotificationManager._hideNotificationContainer();
                        }
                    }, 100);
                } else {
                    // 没有通知内容时，立即隐藏
                    if (NotificationManager._isShowing) {
                        NotificationManager._hideNotificationContainer();
                    }
                }
            };
            NotificationManager._notificationContainer.addEventListener('mouseleave', containerLeaveHandler);
            KernelLogger.debug("NotificationManager", "已绑定通知容器 mouseleave 事件");
        } else {
            KernelLogger.warn("NotificationManager", "通知容器不存在，无法绑定容器事件");
        }
        
        // 蒙版层鼠标事件
        if (NotificationManager._notificationOverlay) {
            // 添加点击事件：点击蒙版层时关闭通知栏
            NotificationManager._notificationOverlay.addEventListener('click', NotificationManager._handleOverlayClick.bind(NotificationManager));
            
            const overlayEnterHandler = () => {
                // 鼠标进入蒙版层，保持显示
                KernelLogger.debug("NotificationManager", "鼠标进入蒙版层");
            };
            NotificationManager._notificationOverlay.addEventListener('mouseenter', overlayEnterHandler);
            
            // 注意：蒙版层的 mousemove 事件只在鼠标在蒙版层内时触发
            // 真正的鼠标离开检测由全局 mousemove 事件处理
            
            // 同时监听 mouseleave 事件作为备用
            const overlayLeaveHandler = (e) => {
                KernelLogger.debug("NotificationManager", "鼠标离开蒙版层");
                // 检查鼠标是否移动到通知容器
                const container = NotificationManager._notificationContainer;
                const relatedTarget = e.relatedTarget;
                
                if (relatedTarget && container && container.contains(relatedTarget)) {
                    // 鼠标移动到通知容器，不隐藏
                    KernelLogger.debug("NotificationManager", "鼠标移动到通知容器，不隐藏");
                    return;
                }
                
                // 延迟检查，确保鼠标确实离开了蒙版层和通知容器
                setTimeout(() => {
                    if (!NotificationManager._isShowing) {
                        return;
                    }
                    
                    const overlayRect = NotificationManager._notificationOverlay.getBoundingClientRect();
                    const containerRect = container ? container.getBoundingClientRect() : null;
                    const mouseX = NotificationManager._lastMouseX;
                    const mouseY = NotificationManager._lastMouseY;
                    
                    const isInOverlay = NotificationManager._isPointInRect(mouseX, mouseY, overlayRect);
                    const isInContainer = NotificationManager._isPointInRect(mouseX, mouseY, containerRect);
                    
                    if (!isInOverlay && !isInContainer) {
                        NotificationManager._hideNotificationContainer();
                    }
                }, NotificationManager.CONFIG.ANIMATION.MOUSE_LEAVE_DELAY);
            };
            NotificationManager._notificationOverlay.addEventListener('mouseleave', overlayLeaveHandler);
        }
        
        // 添加全局鼠标移动跟踪和位置检测
        let globalCheckTimer = null;
        
        if (typeof EventManager !== 'undefined') {
            const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
            
            EventManager.registerEventHandler(exploitPid, 'mousemove', (e) => {
                NotificationManager._lastMouseX = e.clientX;
                NotificationManager._lastMouseY = e.clientY;
                
                // 如果通知栏正在显示，持续检测鼠标是否在蒙版层或通知容器内
                if (NotificationManager._isShowing) {
                    // 清除之前的检查定时器
                    if (globalCheckTimer) {
                        clearTimeout(globalCheckTimer);
                    }
                    
                    // 延迟检查，避免频繁触发
                    globalCheckTimer = setTimeout(() => {
                        if (!NotificationManager._isShowing) {
                            return;
                        }
                        
                        const overlay = NotificationManager._notificationOverlay;
                        const container = NotificationManager._notificationContainer;
                        
                        if (!overlay) {
                            return;
                        }
                        
                        const mouseX = NotificationManager._lastMouseX;
                    const mouseY = NotificationManager._lastMouseY;
                    const overlayRect = overlay.getBoundingClientRect();
                    const containerRect = container ? container.getBoundingClientRect() : null;
                    
                    const isInOverlay = NotificationManager._isPointInRect(mouseX, mouseY, overlayRect);
                    const isInContainer = NotificationManager._isPointInRect(mouseX, mouseY, containerRect);
                    
                    if (!isInOverlay && !isInContainer) {
                        NotificationManager._hideNotificationContainer();
                    }
                }, NotificationManager.CONFIG.ANIMATION.GLOBAL_CHECK_DELAY);
            }
        }, {
            priority: 100,  // 普通优先级
            passive: true
        });
        } else {
            // 降级：直接使用 addEventListener
            document.addEventListener('mousemove', (e) => {
                NotificationManager._lastMouseX = e.clientX;
                NotificationManager._lastMouseY = e.clientY;
                
                // 如果通知栏正在显示，持续检测鼠标是否在蒙版层或通知容器内
                if (NotificationManager._isShowing) {
                    // 清除之前的检查定时器
                    if (globalCheckTimer) {
                        clearTimeout(globalCheckTimer);
                    }
                    
                    // 延迟检查，避免频繁触发
                    globalCheckTimer = setTimeout(() => {
                        if (!NotificationManager._isShowing) {
                            return;
                        }
                        
                        const overlay = NotificationManager._notificationOverlay;
                        const container = NotificationManager._notificationContainer;
                        
                        if (!overlay) {
                            return;
                        }
                        
                        const mouseX = NotificationManager._lastMouseX;
                        const mouseY = NotificationManager._lastMouseY;
                        const overlayRect = overlay.getBoundingClientRect();
                        const containerRect = container ? container.getBoundingClientRect() : null;
                        
                        const isInOverlay = NotificationManager._isPointInRect(mouseX, mouseY, overlayRect);
                        const isInContainer = NotificationManager._isPointInRect(mouseX, mouseY, containerRect);
                        
                        if (!isInOverlay && !isInContainer) {
                            NotificationManager._hideNotificationContainer();
                        }
                    }, NotificationManager.CONFIG.ANIMATION.GLOBAL_CHECK_DELAY);
                }
            }, { passive: true });
        }
        
        KernelLogger.debug("NotificationManager", "事件监听器设置完成");
    }
    
    /**
     * 监听任务栏位置变化
     */
    static _setupTaskbarPositionListener() {
        // 监听任务栏位置变化（通过轮询或事件）
        // 由于任务栏位置可能动态变化，我们需要定期检查
        setInterval(() => {
            // 只在悬浮区域存在时更新其位置（现在不再使用悬浮区域，但保留代码以防将来需要）
            if (NotificationManager._hoverZone) {
                NotificationManager._updateHoverZonePosition();
            }
            NotificationManager._updateNotificationContainerPosition();
        }, 1000);
    }
    
    /**
     * 更新通知容器位置（根据任务栏位置）
     */
    static _updateNotificationContainerPosition() {
        if (!NotificationManager._notificationContainer) {
            return;
        }
        
        const taskbarPosition = NotificationManager._getTaskbarPosition();
        const config = NotificationManager.CONFIG;
        
        if (taskbarPosition === 'right') {
            NotificationManager._notificationContainer.style.left = `${config.CONTAINER_SIDE}px`;
            NotificationManager._notificationContainer.style.right = 'auto';
        } else {
            NotificationManager._notificationContainer.style.right = `${config.CONTAINER_SIDE}px`;
            NotificationManager._notificationContainer.style.left = 'auto';
        }
        
        NotificationManager._updateNotificationOverlayPosition();
    }
    
    /**
     * 更新通知蒙版层位置（根据任务栏位置）
     */
    static _updateNotificationOverlayPosition() {
        if (!NotificationManager._notificationOverlay) {
            return;
        }
        
        const taskbarPosition = NotificationManager._getTaskbarPosition();
        
        if (taskbarPosition === 'right') {
            NotificationManager._notificationOverlay.style.left = '0';
            NotificationManager._notificationOverlay.style.right = 'auto';
            NotificationManager._notificationOverlay.style.background = 
                'linear-gradient(to right, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.3) 50%, rgba(0, 0, 0, 0) 100%)';
        } else {
            NotificationManager._notificationOverlay.style.right = '0';
            NotificationManager._notificationOverlay.style.left = 'auto';
            NotificationManager._notificationOverlay.style.background = 
                'linear-gradient(to left, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.3) 50%, rgba(0, 0, 0, 0) 100%)';
        }
    }
    
    /**
     * 显示通知容器（灵动岛吸附动画）
     */
    static _showNotificationContainer() {
        if (!NotificationManager._notificationContainer) {
            KernelLogger.error("NotificationManager", "通知容器不存在，无法显示");
            return;
        }
        
        // 清除隐藏动画定时器
        if (NotificationManager._hideAnimationTimer) {
            clearTimeout(NotificationManager._hideAnimationTimer);
            NotificationManager._hideAnimationTimer = null;
        }
        
        if (NotificationManager._isShowing) {
            KernelLogger.debug("NotificationManager", "通知容器已在显示中，跳过");
            return;
        }
        
        KernelLogger.debug("NotificationManager", "开始显示通知容器");
        
        // 关闭所有任务栏弹出组件（互斥显示）
        if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager._closeAllTaskbarPopups === 'function') {
            TaskbarManager._closeAllTaskbarPopups();
            KernelLogger.debug("NotificationManager", "已关闭所有任务栏弹出组件");
        }
        
        NotificationManager._isShowing = true;
        NotificationManager._updateNotificationContainerPosition();
        
        // 更新空状态显示
        NotificationManager._updateEmptyState();
        
        const container = NotificationManager._notificationContainer;
        const overlay = NotificationManager._notificationOverlay;
        
        // 显示蒙版层
        if (overlay) {
            overlay.style.display = 'block';
            overlay.style.pointerEvents = 'auto';
            overlay.style.opacity = '0';
            requestAnimationFrame(() => {
                const config = NotificationManager.CONFIG;
                overlay.style.transition = `opacity ${config.ANIMATION.OVERLAY_FADE}ms ease-out`;
                overlay.style.opacity = '1';
            });
        }
        
        container.style.display = 'flex';
        container.style.pointerEvents = 'auto'; // 确保容器可以接收点击事件
        KernelLogger.debug("NotificationManager", "通知容器 pointer-events 已设置为 auto");
        
        // 灵动岛水滴吸附动画 - 使用 animateManager
        const isRight = container.style.right !== 'auto';
        KernelLogger.debug("NotificationManager", `通知容器位置: ${isRight ? '右侧' : '左侧'}`);
        
        // 设置初始状态（从屏幕边缘滑入，带缩放和透明度）
        container.style.transition = 'none';
        container.style.opacity = '0';
        container.style.filter = 'blur(8px)';
        if (isRight) {
            container.style.transform = 'translateX(60px) scale(0.85) translateY(-10px)';
        } else {
            container.style.transform = 'translateX(-60px) scale(0.85) translateY(-10px)';
        }
        
        // 强制重排
        void container.offsetHeight;
        
        // 使用 animateManager 实现水滴展开动画
        NotificationManager._applyWaterDropAnimation(container, isRight);
        
        KernelLogger.info("NotificationManager", "通知容器显示完成");
    }
    
    /**
     * 应用水滴展开动画（使用 animateManager）
     */
    static _applyWaterDropAnimation(container, isRight) {
        // 尝试使用 animateManager
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.ensureAnimeLoaded().then((anime) => {
                if (anime && typeof anime === 'function') {
                    // 第一阶段：从边缘滑入并展开（水滴效果）
                    const initialX = isRight ? 60 : -60;
                    const bounceX = isRight ? -8 : 8;
                    
                    // anime.js v4 API: animate(targets, parameters)
                    try {
                        const config = NotificationManager.CONFIG;
                        const animation = anime(container, {
                            translateX: [initialX, bounceX, 0],
                            translateY: [-10, 0, 0],
                            scale: [0.85, 1.02, 1],
                            opacity: [0, 1, 1],
                            duration: config.ANIMATION.SHOW_DURATION,
                            easing: 'spring(1, 100, 8, 0)',
                            delay: 0
                        });
                        
                        // 同时处理 filter（anime.js 可能不支持，使用 CSS transition）
                        requestAnimationFrame(() => {
                            container.style.transition = 'filter 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
                            container.style.filter = 'blur(0px)';
                        });
                    } catch (e) {
                        KernelLogger.warn("NotificationManager", `anime.js 动画失败: ${e.message}`);
                        NotificationManager._applyWaterDropAnimationFallback(container, isRight);
                    }
                } else {
                    // 降级方案
                    NotificationManager._applyWaterDropAnimationFallback(container, isRight);
                }
            }).catch(() => {
                // 降级方案
                NotificationManager._applyWaterDropAnimationFallback(container, isRight);
            });
        } else {
            // 降级方案
            NotificationManager._applyWaterDropAnimationFallback(container, isRight);
        }
    }
    
    /**
     * 应用依赖类型通知的水滴展开动画（使用 animateManager）
     */
    static _applyDependentWaterDropAnimation(wrapperElement, targetWidth, targetHeight) {
        // 尝试使用 animateManager
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.ensureAnimeLoaded().then((anime) => {
                if (anime && typeof anime === 'function') {
                    try {
                        // 使用 anime.js 实现水滴展开：从圆形小尺寸变为正常矩形
                        // 注意：anime.js 可能不支持 width/height/borderRadius，需要分别处理
                        const config = NotificationManager.CONFIG;
                        const animation = anime(wrapperElement, {
                            opacity: [0, 1],
                            translateX: [config.WATER_DROP.INITIAL_TRANSLATE_X, 0],
                            scale: [config.WATER_DROP.INITIAL_SCALE, 1],
                            duration: config.ANIMATION.DEPENDENT_EXPAND,
                            easing: 'spring(1, 100, 8, 0)',
                            delay: 0
                        });
                        
                        // 使用 CSS transition 处理 width, height, borderRadius
                        requestAnimationFrame(() => {
                            const config = NotificationManager.CONFIG;
                            const duration = config.ANIMATION.DEPENDENT_EXPAND;
                            wrapperElement.style.transition = `width ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1), height ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1), border-radius ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
                            wrapperElement.style.width = `${targetWidth}px`;
                            wrapperElement.style.height = `${targetHeight}px`;
                            wrapperElement.style.borderRadius = config.STYLES.BORDER_RADIUS;
                        });
                    } catch (e) {
                        KernelLogger.warn("NotificationManager", `依赖通知水滴动画失败: ${e.message}`);
                        NotificationManager._applyDependentWaterDropAnimationFallback(wrapperElement, targetWidth, targetHeight);
                    }
                } else {
                    NotificationManager._applyDependentWaterDropAnimationFallback(wrapperElement, targetWidth, targetHeight);
                }
            }).catch(() => {
                NotificationManager._applyDependentWaterDropAnimationFallback(wrapperElement, targetWidth, targetHeight);
            });
        } else {
            NotificationManager._applyDependentWaterDropAnimationFallback(wrapperElement, targetWidth, targetHeight);
        }
    }
    
    /**
     * 依赖类型通知水滴展开动画降级方案（CSS 动画）
     */
    static _applyDependentWaterDropAnimationFallback(wrapperElement, targetWidth, targetHeight) {
        const config = NotificationManager.CONFIG;
        const duration = config.ANIMATION.DEPENDENT_EXPAND;
        
        NotificationManager._setStyles(wrapperElement, {
            transition: `all ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
            width: `${targetWidth}px`,
            height: `${targetHeight}px`,
            borderRadius: config.STYLES.BORDER_RADIUS,
            opacity: '1',
            transform: 'translateX(0) scale(1)'
        });
    }
    
    /**
     * 水滴展开动画降级方案（CSS 动画）
     */
    static _applyWaterDropAnimationFallback(container, isRight) {
        requestAnimationFrame(() => {
            // 第一阶段：快速滑入（0.15s）
            container.style.transition = 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1), filter 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
            container.style.opacity = '1';
            container.style.filter = 'blur(0px)';
            if (isRight) {
                container.style.transform = 'translateX(-8px) scale(1.02) translateY(0px)';
            } else {
                container.style.transform = 'translateX(8px) scale(1.02) translateY(0px)';
            }
            
            // 第二阶段：弹性回弹（0.1s）
            NotificationManager._showAnimationTimer = setTimeout(() => {
                container.style.transition = 'transform 0.1s cubic-bezier(0.34, 1.56, 0.64, 1)';
                container.style.transform = 'translateX(0) scale(1) translateY(0)';
                NotificationManager._showAnimationTimer = null;
            }, 150);
        });
    }
    
    /**
     * 隐藏通知容器
     */
    static _hideNotificationContainer() {
        if (!NotificationManager._notificationContainer || !NotificationManager._isShowing) {
            return;
        }
        
        // 清除显示动画定时器
        if (NotificationManager._showAnimationTimer) {
            clearTimeout(NotificationManager._showAnimationTimer);
            NotificationManager._showAnimationTimer = null;
        }
        
        const container = NotificationManager._notificationContainer;
        const overlay = NotificationManager._notificationOverlay;
        
        // 隐藏蒙版层
        if (overlay) {
            const config = NotificationManager.CONFIG;
            overlay.style.transition = `opacity ${config.ANIMATION.OVERLAY_FADE}ms ease-out`;
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay && NotificationManager._isShowing) {
                    overlay.style.display = 'none';
                    overlay.style.pointerEvents = 'none';
                }
            }, config.ANIMATION.OVERLAY_FADE);
        }
        
        // 灵动岛收回动画 - 流畅的滑出效果
        const isRight = container.style.right !== 'auto';
        
        // 第一阶段：轻微收缩（0.08s）
        container.style.transition = 'transform 0.08s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.08s cubic-bezier(0.4, 0, 0.2, 1)';
        container.style.transform = 'translateX(0) scale(0.98) translateY(0)';
        container.style.opacity = '0.8';
        
        // 第二阶段：滑出并消失（0.15s）
        const timer1 = setTimeout(() => {
            container.style.transition = 'transform 0.12s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1), filter 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
            container.style.filter = 'blur(4px)';
            if (isRight) {
                container.style.transform = 'translateX(50px) scale(0.9) translateY(0)';
            } else {
                container.style.transform = 'translateX(-50px) scale(0.9) translateY(0)';
            }
            container.style.opacity = '0';
        }, 80);
        
        const config = NotificationManager.CONFIG;
        NotificationManager._hideAnimationTimer = setTimeout(() => {
            if (NotificationManager._isShowing) {
                container.style.display = 'none';
                container.style.pointerEvents = 'none';
                container.style.filter = 'blur(0px)';
                NotificationManager._isShowing = false;
                NotificationManager._hideAnimationTimer = null;
            }
        }, config.ANIMATION.HIDE_DURATION);
    }
    
    /**
     * 创建通知
     * @param {number} pid - 程序PID
     * @param {Object} options - 通知选项
     * @param {string} options.type - 通知类型：'snapshot'（快照）或 'dependent'（依赖）
     * @param {string} options.title - 通知标题（可选）
     * @param {HTMLElement|string} options.content - 通知内容（HTML元素或HTML字符串）
     * @param {number} options.duration - 自动关闭时长（毫秒，0表示不自动关闭，可选）
     * @param {Function} options.onClose - 关闭回调（仅用于依赖类型，可选）
     * @returns {string} 通知ID
     */
    static async createNotification(pid, options = {}) {
        const {
            type = 'snapshot', // 'snapshot' 或 'dependent'
            title = '',
            content = '',
            duration = 0,
            onClose = null
        } = options;
        
        // 权限检查 - 根据通知类型决定处理方式
        if (typeof PermissionManager !== 'undefined') {
            try {
                if (type === 'snapshot') {
                    // 快照通知：检查黑名单后自动授予权限
                    const isBlacklisted = await PermissionManager._checkBlacklist(pid);
                    if (!isBlacklisted && !PermissionManager.hasPermission(pid, PermissionManager.PERMISSION.SYSTEM_NOTIFICATION)) {
                        PermissionManager._grantPermission(pid, PermissionManager.PERMISSION.SYSTEM_NOTIFICATION, 'snapshot_auto');
                        KernelLogger.debug("NotificationManager", `程序 ${pid} 自动获得快照通知权限`);
                    } else if (isBlacklisted) {
                        KernelLogger.warn("NotificationManager", `程序 ${pid} 在黑名单中，拒绝快照通知权限`);
                        throw new Error(`程序 ${pid} 在黑名单中，无法创建通知`);
                    }
                } else if (type === 'dependent') {
                    // 依赖通知：询问用户是否授予权限
                    const hasPermission = await PermissionManager.checkAndRequestPermission(
                        pid, 
                        PermissionManager.PERMISSION.SYSTEM_NOTIFICATION
                    );
                    if (!hasPermission) {
                        // 权限被拒绝，立即拒绝创建通知，不继续执行
                        const error = new Error(`程序 ${pid} 没有权限创建依赖通知。权限已被用户拒绝。`);
                        KernelLogger.error("NotificationManager", `依赖通知创建被拒绝: PID ${pid}, 权限: SYSTEM_NOTIFICATION`);
                        throw error;
                    }
                    KernelLogger.debug("NotificationManager", `程序 ${pid} 已获得依赖通知权限，允许创建通知`);
                }
            } catch (e) {
                // 权限检查过程中发生错误，也拒绝创建通知
                KernelLogger.error("NotificationManager", `权限检查失败，拒绝创建通知: PID ${pid}`, e);
                throw new Error(`权限检查失败: ${e.message}`);
            }
        } else {
            // 权限管理器未加载，记录警告但允许继续（向后兼容）
            KernelLogger.warn("NotificationManager", `警告: 权限管理器未加载，跳过权限检查: PID ${pid}`);
        }
        
        if (!NotificationManager._notificationContainer) {
            NotificationManager._createNotificationContainer();
            if (!NotificationManager._notificationContainer) {
                KernelLogger.error("NotificationManager", "无法创建通知：通知容器不存在");
                throw new Error("通知容器未初始化");
            }
        }
        
        const notificationId = `notification-${++NotificationManager._notificationIdCounter}`;
        
        if (type !== 'snapshot' && type !== 'dependent') {
            KernelLogger.warn("NotificationManager", `无效的通知类型: ${type}，使用默认类型 'snapshot'`);
        }
        
        // 创建通知元素
        const notificationElement = document.createElement('div');
        notificationElement.id = notificationId;
        notificationElement.className = 'notification-item';
        notificationElement.dataset.pid = pid.toString();
        notificationElement.dataset.type = type;
        
        // 根据类型设置不同的样式
        const config = NotificationManager.CONFIG;
        const styles = config.STYLES;
        const padding = type === 'dependent' ? styles.NOTIFICATION_PADDING_DEPENDENT : styles.NOTIFICATION_PADDING_SNAPSHOT;
        const gap = type === 'dependent' ? styles.NOTIFICATION_GAP_DEPENDENT : styles.NOTIFICATION_GAP_SNAPSHOT;
        const animation = type === 'dependent' ? 'none' : `notificationSlideIn ${config.ANIMATION.SHOW_DURATION}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
        
        NotificationManager._setStyles(notificationElement, `
            background: rgba(30, 30, 30, 0.95);
            backdrop-filter: blur(${styles.BLUR_AMOUNT}px);
            border-radius: ${styles.BORDER_RADIUS};
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            padding: ${padding};
            min-height: 60px;
            display: flex;
            flex-direction: column;
            gap: ${gap};
            position: relative;
            animation: ${animation};
            pointer-events: auto;
        `);
        
        // 标题栏（包含标题和关闭按钮）- 依赖类型通知不显示标题栏
        if (type !== 'dependent') {
            NotificationManager._createNotificationHeader(notificationElement, notificationId, title);
        }
        
        // 内容容器
        const contentContainer = document.createElement('div');
        contentContainer.className = 'notification-content';
        
        // 依赖类型通知的内容容器不需要额外的样式，直接使用传入的内容
        if (type === 'dependent') {
            contentContainer.style.cssText = `
                flex: 1;
                min-height: 0;
                width: 100%;
                display: flex;
                flex-direction: column;
            `;
        } else {
            contentContainer.style.cssText = `
                flex: 1;
                min-height: 0;
                color: #b3b3b3;
                font-size: 13px;
                line-height: 1.5;
            `;
        }
        
        // 如果内容是HTML元素，直接添加；否则作为HTML字符串
        if (typeof content === 'string') {
            contentContainer.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            contentContainer.appendChild(content);
        }
        
        notificationElement.appendChild(contentContainer);
        
        // 依赖类型通知也需要关闭按钮（添加到通知元素右上角）
        // 注意：如果通知位于容器顶部，需要调整位置避免与容器关闭按钮重叠
        if (type === 'dependent') {
            const closeButton = NotificationManager._createCloseButton(notificationId, {
                className: 'notification-dependent-close',
                position: 'absolute'
            });
            // 调整依赖类型通知关闭按钮的位置，避免与容器关闭按钮重叠
            // 容器关闭按钮在 top: 8px, right: 8px（相对于容器）
            // 通知关闭按钮也在 top: 8px, right: 8px（相对于通知元素），但通知元素在容器内，所以实际位置会下移
            closeButton.style.top = '8px';
            closeButton.style.right = '8px';
            closeButton.style.zIndex = '100';
            notificationElement.appendChild(closeButton);
        }
        
        // 如果是依赖类型，创建水滴包装容器
        let wrapperElement = null;
        if (type === 'dependent') {
            wrapperElement = NotificationManager._createDependentWrapper(notificationElement, notificationId);
        } else {
            // 快照类型，直接添加到容器
            NotificationManager._notificationContainer.appendChild(notificationElement);
        }
        
        // 保存通知数据（在创建包装容器之后）
        const notificationData = {
            id: notificationId,
            pid: pid,
            type: type,
            title: title,
            element: notificationElement,
            wrapperElement: wrapperElement, // 依赖类型的包装容器
            contentContainer: contentContainer,
            duration: duration,
            onClose: onClose,
            createdAt: Date.now(),
            timeoutId: null
        };
        
        NotificationManager._notifications.set(notificationId, notificationData);
        
        // 如果有自动关闭时长，设置定时器
        if (duration > 0) {
            notificationData.timeoutId = setTimeout(() => {
                NotificationManager.removeNotification(notificationId);
            }, duration);
        }
        
        // 更新空状态显示
        NotificationManager._updateEmptyState();
        
        // 触发任务栏通知数量更新（立即更新，不等待定时器）
        NotificationManager._triggerBadgeUpdate();
        
        // 如果通知容器未显示且有通知，显示容器
        if (!NotificationManager._isShowing && NotificationManager._notifications.size > 0) {
            // 不自动显示，等待鼠标悬浮
        }
        
        KernelLogger.debug("NotificationManager", `创建通知: ${notificationId} (PID: ${pid}, 类型: ${type})`);
        
        return notificationId;
    }
    
    /**
     * 移除通知
     * @param {string} notificationId - 通知ID
     * @param {boolean} silent - 是否静默移除（不触发回调）
     */
    static async removeNotification(notificationId, silent = false) {
        const notificationData = NotificationManager._notifications.get(notificationId);
        if (!notificationData) {
            KernelLogger.warn("NotificationManager", `通知不存在: ${notificationId}`);
            return false;
        }
        
        // 权限检查 - 删除通知也需要权限验证（确保只有有权限的程序才能删除通知）
        const pid = notificationData.pid;
        if (typeof PermissionManager !== 'undefined') {
            try {
                const hasPermission = await PermissionManager.checkAndRequestPermission(
                    pid, 
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION
                );
                if (!hasPermission) {
                    const error = new Error(`程序 ${pid} 没有权限删除通知。权限已被用户拒绝。`);
                    KernelLogger.error("NotificationManager", `通知删除被拒绝: PID ${pid}, 通知ID: ${notificationId}`);
                    throw error;
                }
            } catch (e) {
                KernelLogger.error("NotificationManager", `权限检查失败，拒绝删除通知: PID ${pid}, 通知ID: ${notificationId}`, e);
                throw new Error(`权限检查失败: ${e.message}`);
            }
        }
        
        // 清除定时器
        if (notificationData.timeoutId) {
            clearTimeout(notificationData.timeoutId);
            notificationData.timeoutId = null;
        }
        
        // 如果是依赖类型，触发关闭回调
        if (notificationData.type === 'dependent' && notificationData.onClose && !silent) {
            try {
                notificationData.onClose(notificationId, notificationData.pid);
            } catch (e) {
                KernelLogger.error("NotificationManager", `通知关闭回调执行失败: ${e.message}`, e);
            }
        }
        
        // 从DOM移除
        if (notificationData.type === 'dependent' && notificationData.wrapperElement) {
            // 依赖类型：移除包装容器（带动画，从矩形变回圆形）
            const wrapper = notificationData.wrapperElement;
            const config = NotificationManager.CONFIG;
            const waterDrop = config.WATER_DROP;
            const removeDuration = config.ANIMATION.DEPENDENT_REMOVE;
            
            NotificationManager._setStyles(wrapper, {
                transition: `all ${removeDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                opacity: '0',
                transform: `translateX(${waterDrop.INITIAL_TRANSLATE_X}px) scale(${waterDrop.INITIAL_SCALE})`,
                borderRadius: '50%',
                width: `${waterDrop.INITIAL_SIZE}px`,
                height: `${waterDrop.INITIAL_SIZE}px`
            });
            
            setTimeout(() => {
                if (wrapper && wrapper.parentNode) {
                    wrapper.parentNode.removeChild(wrapper);
                }
            }, removeDuration);
        } else if (notificationData.element && notificationData.element.parentNode) {
            // 快照类型：直接移除通知元素
            const config = NotificationManager.CONFIG;
            const removeDuration = config.ANIMATION.SNAPSHOT_REMOVE;
            
            NotificationManager._setStyles(notificationData.element, {
                transition: `all ${removeDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                opacity: '0',
                transform: 'translateX(20px) scale(0.9)'
            });
            
            setTimeout(() => {
                if (notificationData.element && notificationData.element.parentNode) {
                    notificationData.element.parentNode.removeChild(notificationData.element);
                }
            }, removeDuration);
        }
        
        // 从映射中移除
        NotificationManager._notifications.delete(notificationId);
        
        // 更新空状态显示
        NotificationManager._updateEmptyState();
        
        // 触发任务栏通知数量更新（立即更新，不等待定时器）
        NotificationManager._triggerBadgeUpdate();
        
        // 如果没有通知了且容器正在显示，保持显示（显示空状态）
        // 如果容器未显示，则不需要做任何操作（等待鼠标悬浮时再显示）
        
        KernelLogger.debug("NotificationManager", `移除通知: ${notificationId}`);
        return true;
    }
    
    /**
     * 获取程序的所有通知ID
     * @param {number} pid - 程序PID
     * @returns {Array<string>} 通知ID数组
     */
    static getNotificationsByPid(pid) {
        const notificationIds = [];
        NotificationManager._notifications.forEach((data, id) => {
            if (data.pid === pid) {
                notificationIds.push(id);
            }
        });
        return notificationIds;
    }
    
    /**
     * 获取通知信息
     * @param {string} notificationId - 通知ID
     * @returns {Object|null} 通知数据
     */
    static getNotificationInfo(notificationId) {
        const notificationData = NotificationManager._notifications.get(notificationId);
        if (!notificationData) {
            return null;
        }
        
        return {
            id: notificationData.id,
            pid: notificationData.pid,
            type: notificationData.type,
            title: notificationData.title,
            duration: notificationData.duration,
            createdAt: notificationData.createdAt
        };
    }
    
    /**
     * 获取所有通知信息
     * @param {number|null} pid - 可选，如果提供则只返回该程序的通知
     * @returns {Array<Object>} 通知信息数组
     */
    static getAllNotifications(pid = null) {
        const notifications = [];
        NotificationManager._notifications.forEach((data, id) => {
            if (pid === null || data.pid === pid) {
                notifications.push({
                    id: data.id,
                    pid: data.pid,
                    type: data.type,
                    title: data.title,
                    duration: data.duration,
                    createdAt: data.createdAt
                });
            }
        });
        return notifications;
    }
    
    /**
     * 清理程序的所有通知
     * @param {number} pid - 程序PID
     * @param {boolean} triggerCallbacks - 是否触发依赖类型的关闭回调
     * @param {boolean} onlyDependent - 是否只清理依赖类型的通知（默认true，快照类型保留）
     */
    static cleanupProgramNotifications(pid, triggerCallbacks = false, onlyDependent = true) {
        const notificationIds = NotificationManager.getNotificationsByPid(pid);
        if (notificationIds.length === 0) {
            return;
        }
        
        KernelLogger.debug("NotificationManager", `清理程序 PID ${pid} 的通知 (${notificationIds.length} 个, 只清理依赖类型: ${onlyDependent})`);
        
        let removedCount = 0;
        notificationIds.forEach(notificationId => {
            const notificationData = NotificationManager._notifications.get(notificationId);
            if (notificationData) {
                // 如果只清理依赖类型，跳过快照类型
                if (onlyDependent && notificationData.type !== 'dependent') {
                    return;
                }
                
                // 如果是依赖类型且需要触发回调，则触发
                if (notificationData.type === 'dependent' && triggerCallbacks && notificationData.onClose) {
                    try {
                        notificationData.onClose(notificationId, pid);
                    } catch (e) {
                        KernelLogger.error("NotificationManager", `通知关闭回调执行失败: ${e.message}`, e);
                    }
                }
                
                if (NotificationManager.removeNotification(notificationId, true)) {
                    removedCount++;
                }
            }
        });
        
        KernelLogger.info("NotificationManager", `已清理程序 PID ${pid} 的 ${removedCount} 个通知`);
    }
    
    /**
     * 检查通知是否存在
     * @param {string} notificationId - 通知ID
     * @returns {boolean}
     */
    static hasNotification(notificationId) {
        return NotificationManager._notifications.has(notificationId);
    }
    
    /**
     * 获取通知内容容器（供程序使用）
     * @param {string} notificationId - 通知ID
     * @returns {HTMLElement|null} 内容容器元素
     */
    static getNotificationContentContainer(notificationId) {
        const notificationData = NotificationManager._notifications.get(notificationId);
        if (!notificationData) {
            KernelLogger.warn("NotificationManager", `通知不存在: ${notificationId}`);
            return null;
        }
        return notificationData.contentContainer;
    }
    
    /**
     * 获取通知数量
     * @returns {number} 通知数量
     */
    static getNotificationCount() {
        return NotificationManager._notifications.size;
    }
    
    /**
     * 更新通知内容
     * @param {string} notificationId - 通知ID
     * @param {HTMLElement|string} content - 新内容
     */
    static updateNotificationContent(notificationId, content) {
        const notificationData = NotificationManager._notifications.get(notificationId);
        if (!notificationData) {
            KernelLogger.warn("NotificationManager", `通知不存在: ${notificationId}`);
            return;
        }
        
        const container = notificationData.contentContainer;
        if (!container) {
            return;
        }
        
        // 清空容器
        container.innerHTML = '';
        
        // 添加新内容
        if (typeof content === 'string') {
            container.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            container.appendChild(content);
        }
        
        KernelLogger.debug("NotificationManager", `更新通知内容: ${notificationId}`);
    }
    
    /**
     * 注册到POOL
     */
    static _registerToPOOL() {
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                POOL.__ADD__('KERNEL_GLOBAL_POOL', 'NotificationManager', NotificationManager);
                KernelLogger.debug("NotificationManager", "已注册到 POOL");
            } catch (e) {
                KernelLogger.warn("NotificationManager", `注册到 POOL 失败: ${e.message}`);
            }
        }
    }
    
    /**
     * 检查初始化状态（用于调试）
     * @returns {Object} 初始化状态信息
     */
    static checkStatus() {
        const status = {
            initialized: NotificationManager._initialized,
            containerExists: !!NotificationManager._notificationContainer,
            hoverZoneExists: !!NotificationManager._hoverZone,
            emptyStateExists: !!NotificationManager._emptyStateElement,
            notificationCount: NotificationManager._notifications.size,
            isShowing: NotificationManager._isShowing
        };
        
        if (NotificationManager._hoverZone) {
            const rect = NotificationManager._hoverZone.getBoundingClientRect();
            status.hoverZonePosition = {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height
            };
        }
        
        if (NotificationManager._notificationContainer) {
            const rect = NotificationManager._notificationContainer.getBoundingClientRect();
            status.containerPosition = {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                display: NotificationManager._notificationContainer.style.display,
                opacity: NotificationManager._notificationContainer.style.opacity
            };
        }
        
        // 获取任务栏位置
        let taskbarPosition = 'bottom';
        if (typeof TaskbarManager !== 'undefined' && TaskbarManager._taskbarPosition) {
            taskbarPosition = TaskbarManager._taskbarPosition;
        }
        status.taskbarPosition = taskbarPosition;
        
        KernelLogger.info("NotificationManager", "状态检查:", status);
        return status;
    }
    
    /**
     * 手动触发显示（用于测试）
     */
    static testShow() {
        KernelLogger.info("NotificationManager", "手动触发显示通知容器");
        NotificationManager._showNotificationContainer();
    }
    
    /**
     * 手动触发隐藏（用于测试）
     */
    static testHide() {
        KernelLogger.info("NotificationManager", "手动触发隐藏通知容器");
        NotificationManager._hideNotificationContainer();
    }
    
    /**
     * 切换通知栏显示状态（公开方法）
     */
    static toggleNotificationContainer() {
        if (NotificationManager._isShowing) {
            NotificationManager._hideNotificationContainer();
        } else {
            NotificationManager._showNotificationContainer();
        }
    }
    
    /**
     * 获取通知栏显示状态（公开方法）
     */
    static isShowing() {
        return NotificationManager._isShowing;
    }
    
    /**
     * 触发任务栏徽章更新（立即更新所有通知按钮的徽章）
     */
    static _triggerBadgeUpdate() {
        // 查找所有任务栏通知按钮并更新徽章
        const notificationButtons = document.querySelectorAll('[data-notification-button="true"]');
        notificationButtons.forEach(button => {
            if (button._updateBadge && typeof button._updateBadge === 'function') {
                button._updateBadge();
            }
        });
    }
}

// 自动初始化（延迟，等待其他模块加载）
if (typeof document !== 'undefined') {
    KernelLogger.debug("NotificationManager", "开始自动初始化流程");
    
    const initNotificationManager = () => {
        KernelLogger.debug("NotificationManager", "执行自动初始化");
        NotificationManager.init().catch(e => {
            KernelLogger.error("NotificationManager", `自动初始化失败: ${e.message}`, e);
        });
    };
    
    // 等待DOM和依赖模块加载
    if (document.readyState === 'loading') {
        KernelLogger.debug("NotificationManager", "DOM 正在加载，等待 DOMContentLoaded 事件");
        document.addEventListener('DOMContentLoaded', () => {
            KernelLogger.debug("NotificationManager", "DOMContentLoaded 事件触发，延迟初始化");
            setTimeout(initNotificationManager, 1000);
        });
    } else {
        KernelLogger.debug("NotificationManager", "DOM 已加载，延迟初始化");
        setTimeout(initNotificationManager, 1000);
    }
} else {
    KernelLogger.warn("NotificationManager", "document 不可用，跳过自动初始化");
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../system/ui/notificationManager.js");
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.NotificationManager = NotificationManager;
} else if (typeof globalThis !== 'undefined') {
    globalThis.NotificationManager = NotificationManager;
}
