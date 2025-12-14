// 事件管理器：统一管理所有菜单、弹出层、窗口拖动、拉伸和多任务选择器事件
// 确保点击桌面/gui-container 时能正确关闭所有菜单

KernelLogger.info("EventManager", "模块初始化");

class EventManager {
    // 注册的菜单列表 Map<menuId, {menu, closeCallback, excludeSelectors}>
    static _registeredMenus = new Map();
    
    // 注册的窗口拖动 Map<windowId, {element, state, onDragStart, onDrag, onDragEnd}>
    static _registeredDrags = new Map();
    
    // 注册的窗口拉伸 Map<resizerId, {element, window, state, onResizeStart, onResize, onResizeEnd}>
    static _registeredResizers = new Map();
    
    // 注册的多任务选择器 Map<selectorId, {iconElement, selectorElement, showTimer, hideTimer}>
    static _registeredSelectors = new Map();
    
    // 全局事件监听器（只添加一次）
    static _globalClickHandler = null;
    static _globalMousedownHandler = null;
    static _globalMousemoveHandler = null;
    static _globalMouseupHandler = null;
    static _globalMouseenterHandler = null;
    static _globalMouseleaveHandler = null;
    static _initialized = false;
    
    /**
     * 初始化事件管理器
     */
    static init() {
        if (EventManager._initialized) {
            return;
        }
        
        // 创建全局事件处理器
        EventManager._globalClickHandler = (e) => {
            EventManager._handleGlobalClick(e);
        };
        
        EventManager._globalMousedownHandler = (e) => {
            EventManager._handleGlobalClick(e);
            EventManager._handleGlobalMousedown(e);
        };
        
        EventManager._globalMousemoveHandler = (e) => {
            EventManager._handleGlobalMousemove(e);
        };
        
        EventManager._globalMouseupHandler = (e) => {
            EventManager._handleGlobalMouseup(e);
        };
        
        // 注意：mouseenter/mouseleave 不会冒泡，需要直接绑定到元素上
        // 这些事件将在 registerSelector 时直接绑定到元素
        
        // 添加全局事件监听器
        document.addEventListener('click', EventManager._globalClickHandler, true);
        document.addEventListener('mousedown', EventManager._globalMousedownHandler, true);
        document.addEventListener('mousemove', EventManager._globalMousemoveHandler);
        document.addEventListener('mouseup', EventManager._globalMouseupHandler);
        
        EventManager._initialized = true;
        KernelLogger.info("EventManager", "事件管理器初始化完成");
    }
    
    /**
     * 注册一个菜单，当点击外部时自动关闭
     * @param {string} menuId 菜单唯一标识
     * @param {HTMLElement} menu 菜单元素
     * @param {Function} closeCallback 关闭回调函数
     * @param {Array<string>} excludeSelectors 排除的选择器列表（点击这些元素时不关闭菜单）
     */
    static registerMenu(menuId, menu, closeCallback, excludeSelectors = []) {
        if (!menuId || !menu || !closeCallback) {
            KernelLogger.warn("EventManager", "注册菜单失败：参数不完整");
            return;
        }
        
        // 确保已初始化
        EventManager.init();
        
        // 默认排除的选择器
        const defaultExcludeSelectors = [
            '#taskbar',
            '.taskbar-app-context-menu',
            '.context-menu'
        ];
        
        const allExcludeSelectors = [...defaultExcludeSelectors, ...excludeSelectors];
        
        EventManager._registeredMenus.set(menuId, {
            menu: menu,
            closeCallback: closeCallback,
            excludeSelectors: allExcludeSelectors
        });
        
        KernelLogger.debug("EventManager", `菜单已注册: ${menuId}`);
    }
    
    /**
     * 注销一个菜单
     * @param {string} menuId 菜单唯一标识
     */
    static unregisterMenu(menuId) {
        if (EventManager._registeredMenus.has(menuId)) {
            EventManager._registeredMenus.delete(menuId);
            KernelLogger.debug("EventManager", `菜单已注销: ${menuId}`);
        }
    }
    
    /**
     * 处理全局点击事件
     * @param {Event} e 事件对象
     */
    static _handleGlobalClick(e) {
        // 遍历所有注册的菜单
        for (const [menuId, menuInfo] of EventManager._registeredMenus) {
            const { menu, closeCallback, excludeSelectors } = menuInfo;
            
            // 如果菜单不存在或不可见，跳过
            if (!menu || !menu.parentElement || !menu.classList.contains('visible')) {
                continue;
            }
            
            // 检查点击是否在菜单内
            if (menu.contains(e.target)) {
                continue;
            }
            
            // 检查点击是否在排除的选择器内
            let shouldExclude = false;
            for (const selector of excludeSelectors) {
                const excludedElement = e.target.closest(selector);
                if (excludedElement) {
                    shouldExclude = true;
                    break;
                }
            }
            
            if (shouldExclude) {
                continue;
            }
            
            // 检查点击是否在 gui-container 或桌面区域
            const guiContainer = document.getElementById('gui-container');
            const clickedInGuiContainer = guiContainer && (guiContainer === e.target || guiContainer.contains(e.target));
            const clickedOnBody = e.target === document.body || e.target === document.documentElement;
            const clickedOnSandboxContainer = e.target.closest('.sandbox-container') && !e.target.closest('#taskbar') && !e.target.closest('.taskbar-app-menu') && !e.target.closest('.taskbar-power-menu');
            
            // 检查点击是否在任务栏上（如果不是在任务栏上，且不在菜单内，则认为是外部点击）
            const clickedOnTaskbar = e.target.closest('#taskbar');
            
            // 如果点击在外部（gui-container、桌面、sandbox-container等，且不在任务栏上），关闭菜单
            if ((clickedInGuiContainer || clickedOnBody || clickedOnSandboxContainer) && !clickedOnTaskbar) {
                KernelLogger.debug("EventManager", `点击外部，关闭菜单: ${menuId}`);
                closeCallback();
                EventManager.unregisterMenu(menuId);
            }
        }
    }
    
    /**
     * 注册窗口拖动
     * @param {string} windowId 窗口唯一标识
     * @param {HTMLElement} element 可拖动的元素（通常是标题栏）
     * @param {HTMLElement} window 窗口元素
     * @param {Object} state 窗口状态对象（包含 isFullscreen, isDragging 等）
     * @param {Function} onDragStart 拖动开始回调
     * @param {Function} onDrag 拖动中回调
     * @param {Function} onDragEnd 拖动结束回调
     * @param {Array<string>} excludeSelectors 排除的选择器（点击这些元素时不触发拖动）
     */
    static registerDrag(windowId, element, window, state, onDragStart, onDrag, onDragEnd, excludeSelectors = []) {
        if (!windowId || !element || !window || !state) {
            KernelLogger.warn("EventManager", "注册拖动失败：参数不完整");
            return;
        }
        
        EventManager.init();
        
        const defaultExcludeSelectors = ['.dot', '.controls', '.window-resizer'];
        const allExcludeSelectors = [...defaultExcludeSelectors, ...excludeSelectors];
        
        EventManager._registeredDrags.set(windowId, {
            element: element,
            window: window,
            state: state,
            onDragStart: onDragStart || (() => {}),
            onDrag: onDrag || (() => {}),
            onDragEnd: onDragEnd || (() => {}),
            excludeSelectors: allExcludeSelectors
        });
        
        KernelLogger.debug("EventManager", `窗口拖动已注册: ${windowId}`);
    }
    
    /**
     * 注销窗口拖动
     * @param {string} windowId 窗口唯一标识
     */
    static unregisterDrag(windowId) {
        if (EventManager._registeredDrags.has(windowId)) {
            EventManager._registeredDrags.delete(windowId);
            KernelLogger.debug("EventManager", `窗口拖动已注销: ${windowId}`);
        }
    }
    
    /**
     * 注册窗口拉伸
     * @param {string} resizerId 拉伸器唯一标识
     * @param {HTMLElement} resizerElement 拉伸器元素
     * @param {HTMLElement} window 窗口元素
     * @param {Object} state 窗口状态对象
     * @param {Function} onResizeStart 拉伸开始回调
     * @param {Function} onResize 拉伸中回调
     * @param {Function} onResizeEnd 拉伸结束回调
     */
    static registerResizer(resizerId, resizerElement, window, state, onResizeStart, onResize, onResizeEnd) {
        if (!resizerId || !resizerElement || !window || !state) {
            KernelLogger.warn("EventManager", "注册拉伸失败：参数不完整");
            return;
        }
        
        EventManager.init();
        
        EventManager._registeredResizers.set(resizerId, {
            element: resizerElement,
            window: window,
            state: state,
            onResizeStart: onResizeStart || (() => {}),
            onResize: onResize || (() => {}),
            onResizeEnd: onResizeEnd || (() => {})
        });
        
        KernelLogger.debug("EventManager", `窗口拉伸已注册: ${resizerId}`);
    }
    
    /**
     * 注销窗口拉伸
     * @param {string} resizerId 拉伸器唯一标识
     */
    static unregisterResizer(resizerId) {
        if (EventManager._registeredResizers.has(resizerId)) {
            EventManager._registeredResizers.delete(resizerId);
            KernelLogger.debug("EventManager", `窗口拉伸已注销: ${resizerId}`);
        }
    }
    
    /**
     * 注册多任务选择器
     * @param {string} selectorId 选择器唯一标识
     * @param {HTMLElement} iconElement 图标元素
     * @param {HTMLElement} selectorElement 选择器元素（可以为null，后续通过updateSelectorElement更新）
     * @param {Function} onShow 显示回调
     * @param {Function} onHide 隐藏回调
     * @param {Function} onClickOutside 点击外部关闭回调（可选）
     * @param {number} showDelay 显示延迟（毫秒，默认300）
     * @param {number} hideDelay 隐藏延迟（毫秒，默认200）
     */
    static registerSelector(selectorId, iconElement, selectorElement, onShow, onHide, onClickOutside = null, showDelay = 300, hideDelay = 200) {
        if (!selectorId || !iconElement) {
            KernelLogger.warn("EventManager", "注册多任务选择器失败：参数不完整");
            return;
        }
        
        EventManager.init();
        
        // 如果已经注册过，先注销旧的
        if (EventManager._registeredSelectors.has(selectorId)) {
            EventManager.unregisterSelector(selectorId);
        }
        
        const selectorInfo = {
            iconElement: iconElement,
            selectorElement: selectorElement,
            onShow: onShow || (() => {}),
            onHide: onHide || (() => {}),
            onClickOutside: onClickOutside,
            showDelay: showDelay,
            hideDelay: hideDelay,
            showTimer: null,
            hideTimer: null,
            isShowing: false,
            clickOutsideHandler: null
        };
        
        // 直接绑定 mouseenter 和 mouseleave 事件到图标元素（因为这些事件不会冒泡）
        const handleMouseEnter = () => {
            // 清除隐藏定时器
            if (selectorInfo.hideTimer) {
                clearTimeout(selectorInfo.hideTimer);
                selectorInfo.hideTimer = null;
            }
            
            // 如果已经在显示，不需要重复显示
            if (selectorInfo.isShowing) {
                return;
            }
            
            // 清除之前的显示定时器
            if (selectorInfo.showTimer) {
                clearTimeout(selectorInfo.showTimer);
            }
            
            // 延迟显示
            selectorInfo.showTimer = setTimeout(() => {
                if (!selectorInfo.isShowing) {
                    selectorInfo.isShowing = true;
                    selectorInfo.onShow();
                }
            }, selectorInfo.showDelay);
        };
        
        const handleMouseLeave = (e) => {
            // 获取当前的选择器元素（可能是动态更新的）
            const currentSelector = selectorInfo.selectorElement || document.getElementById(`instance-selector-${selectorId.replace('taskbar-selector-', '')}`);
            
            // 检查鼠标是否移动到选择器上
            const relatedTarget = e.relatedTarget;
            const movedToSelector = currentSelector && (
                currentSelector.contains(relatedTarget) || 
                relatedTarget === currentSelector ||
                (relatedTarget && relatedTarget.closest && relatedTarget.closest('.taskbar-instance-selector') === currentSelector)
            );
            
            // 如果鼠标移动到选择器上，不清除定时器
            if (movedToSelector) {
                return;
            }
            
            // 清除显示定时器
            if (selectorInfo.showTimer) {
                clearTimeout(selectorInfo.showTimer);
                selectorInfo.showTimer = null;
            }
            
            // 如果正在显示，延迟隐藏
            if (selectorInfo.isShowing) {
                // 清除之前的隐藏定时器
                if (selectorInfo.hideTimer) {
                    clearTimeout(selectorInfo.hideTimer);
                }
                
                // 延迟隐藏
                selectorInfo.hideTimer = setTimeout(() => {
                    // 再次检查鼠标是否在选择器或图标上
                    const x = e.clientX || 0;
                    const y = e.clientY || 0;
                    const elementUnderMouse = document.elementFromPoint(x, y);
                    const isOnSelector = currentSelector && (
                        currentSelector.contains(elementUnderMouse) || 
                        elementUnderMouse === currentSelector ||
                        (elementUnderMouse && elementUnderMouse.closest && elementUnderMouse.closest('.taskbar-instance-selector') === currentSelector)
                    );
                    const isOnIcon = iconElement.contains(elementUnderMouse) || elementUnderMouse === iconElement;
                    
                    if (!isOnSelector && !isOnIcon && selectorInfo.isShowing) {
                        selectorInfo.isShowing = false;
                        selectorInfo.onHide();
                    }
                }, selectorInfo.hideDelay);
            }
        };
        
        // 绑定选择器元素的 mouseenter 和 mouseleave（如果存在）
        const bindSelectorEvents = (selElement) => {
            if (!selElement) return;
            
            // 移除旧的事件监听器（如果存在）
            if (selectorInfo.handleSelectorMouseEnter) {
                selElement.removeEventListener('mouseenter', selectorInfo.handleSelectorMouseEnter);
            }
            if (selectorInfo.handleSelectorMouseLeave) {
                selElement.removeEventListener('mouseleave', selectorInfo.handleSelectorMouseLeave);
            }
            
            // 鼠标进入选择器时，清除隐藏定时器
            const handleSelectorMouseEnter = () => {
                // 清除所有定时器
                if (selectorInfo.hideTimer) {
                    clearTimeout(selectorInfo.hideTimer);
                    selectorInfo.hideTimer = null;
                }
                if (selectorInfo.showTimer) {
                    clearTimeout(selectorInfo.showTimer);
                    selectorInfo.showTimer = null;
                }
                // 确保标记为显示状态
                selectorInfo.isShowing = true;
            };
            
            // 鼠标离开选择器时，检查是否移动到图标上
            const handleSelectorMouseLeave = (e) => {
                const relatedTarget = e.relatedTarget;
                const movedToIcon = iconElement.contains(relatedTarget) || relatedTarget === iconElement;
                
                // 如果移动到图标上，不清除定时器
                if (movedToIcon) {
                    return;
                }
                
                // 清除之前的隐藏定时器
                if (selectorInfo.hideTimer) {
                    clearTimeout(selectorInfo.hideTimer);
                }
                
                // 延迟隐藏
                selectorInfo.hideTimer = setTimeout(() => {
                    // 再次检查鼠标位置（使用更精确的方法）
                    const x = e.clientX || 0;
                    const y = e.clientY || 0;
                    const elementUnderMouse = document.elementFromPoint(x, y);
                    const isOnIcon = iconElement.contains(elementUnderMouse) || elementUnderMouse === iconElement;
                    const isOnSelector = selElement && (
                        selElement.contains(elementUnderMouse) || 
                        elementUnderMouse === selElement ||
                        (elementUnderMouse && elementUnderMouse.closest && elementUnderMouse.closest('.taskbar-instance-selector') === selElement)
                    );
                    
                    // 只有当鼠标既不在图标上也不在选择器上时，才隐藏
                    if (!isOnIcon && !isOnSelector && selectorInfo.isShowing) {
                        selectorInfo.isShowing = false;
                        selectorInfo.onHide();
                    }
                }, selectorInfo.hideDelay);
            };
            
            selectorInfo.handleSelectorMouseEnter = handleSelectorMouseEnter;
            selectorInfo.handleSelectorMouseLeave = handleSelectorMouseLeave;
            
            selElement.addEventListener('mouseenter', handleSelectorMouseEnter);
            selElement.addEventListener('mouseleave', handleSelectorMouseLeave);
        };
        
        // 如果选择器元素已存在，立即绑定事件
        if (selectorElement) {
            bindSelectorEvents(selectorElement);
        }
        
        selectorInfo.handleMouseEnter = handleMouseEnter;
        selectorInfo.handleMouseLeave = handleMouseLeave;
        selectorInfo.bindSelectorEvents = bindSelectorEvents;
        
        iconElement.addEventListener('mouseenter', handleMouseEnter);
        iconElement.addEventListener('mouseleave', handleMouseLeave);
        
        EventManager._registeredSelectors.set(selectorId, selectorInfo);
        
        KernelLogger.debug("EventManager", `多任务选择器已注册: ${selectorId}`);
    }
    
    /**
     * 更新多任务选择器的选择器元素（用于动态创建的选择器）
     * @param {string} selectorId 选择器唯一标识
     * @param {HTMLElement} selectorElement 新的选择器元素
     */
    static updateSelectorElement(selectorId, selectorElement) {
        if (!EventManager._registeredSelectors.has(selectorId)) {
            KernelLogger.warn("EventManager", `更新选择器元素失败：选择器 ${selectorId} 未注册`);
            return;
        }
        
        const selectorInfo = EventManager._registeredSelectors.get(selectorId);
        
        // 如果之前有选择器元素，移除旧的事件监听器
        if (selectorInfo.selectorElement && selectorInfo.bindSelectorEvents) {
            // 旧的事件监听器会在 bindSelectorEvents 中移除
        }
        
        // 更新选择器元素
        selectorInfo.selectorElement = selectorElement;
        
        // 绑定新的事件
        if (selectorElement && selectorInfo.bindSelectorEvents) {
            selectorInfo.bindSelectorEvents(selectorElement);
        }
        
        // 如果提供了点击外部关闭回调，设置点击外部关闭
        if (selectorInfo.onClickOutside) {
            // 移除旧的点击外部关闭处理器
            if (selectorInfo.clickOutsideHandler) {
                document.removeEventListener('click', selectorInfo.clickOutsideHandler, true);
                document.removeEventListener('mousedown', selectorInfo.clickOutsideHandler, true);
            }
            
            // 只有当选择器元素存在时才设置点击外部关闭
            if (selectorElement) {
                // 创建新的点击外部关闭处理器
                const closeOnClickOutside = (e) => {
                    // 检查点击是否在选择器或图标上
                    const clickedOnSelector = selectorElement.contains(e.target) || e.target === selectorElement;
                    const clickedOnIcon = selectorInfo.iconElement.contains(e.target) || e.target === selectorInfo.iconElement;
                    
                    // 如果点击在外部，关闭选择器
                    if (!clickedOnSelector && !clickedOnIcon) {
                        selectorInfo.onClickOutside(e);
                    }
                };
                
                selectorInfo.clickOutsideHandler = closeOnClickOutside;
                
                setTimeout(() => {
                    document.addEventListener('click', closeOnClickOutside, true);
                    document.addEventListener('mousedown', closeOnClickOutside, true);
                }, 100);
            } else {
                // 如果选择器元素为 null，清除点击外部关闭处理器
                selectorInfo.clickOutsideHandler = null;
            }
        }
        
        KernelLogger.debug("EventManager", `选择器元素已更新: ${selectorId}`);
    }
    
    /**
     * 注销多任务选择器
     * @param {string} selectorId 选择器唯一标识
     */
    static unregisterSelector(selectorId) {
        if (EventManager._registeredSelectors.has(selectorId)) {
            const selector = EventManager._registeredSelectors.get(selectorId);
            
            // 清理定时器
            if (selector.showTimer) {
                clearTimeout(selector.showTimer);
            }
            if (selector.hideTimer) {
                clearTimeout(selector.hideTimer);
            }
            
            // 移除图标元素的事件监听器
            if (selector.handleMouseEnter && selector.iconElement) {
                selector.iconElement.removeEventListener('mouseenter', selector.handleMouseEnter);
            }
            if (selector.handleMouseLeave && selector.iconElement) {
                selector.iconElement.removeEventListener('mouseleave', selector.handleMouseLeave);
            }
            
            // 移除选择器元素的事件监听器
            if (selector.selectorElement) {
                if (selector.handleSelectorMouseEnter) {
                    selector.selectorElement.removeEventListener('mouseenter', selector.handleSelectorMouseEnter);
                }
                if (selector.handleSelectorMouseLeave) {
                    selector.selectorElement.removeEventListener('mouseleave', selector.handleSelectorMouseLeave);
                }
            }
            
            // 移除点击外部关闭处理器
            if (selector.clickOutsideHandler) {
                document.removeEventListener('click', selector.clickOutsideHandler, true);
                document.removeEventListener('mousedown', selector.clickOutsideHandler, true);
            }
            
            EventManager._registeredSelectors.delete(selectorId);
            KernelLogger.debug("EventManager", `多任务选择器已注销: ${selectorId}`);
        }
    }
    
    /**
     * 处理全局 mousedown 事件
     * @param {Event} e 事件对象
     */
    static _handleGlobalMousedown(e) {
        // 优先处理窗口拉伸（拉伸器优先级高于拖动）
        // 使用更精确的检测：检查点击位置是否在拉伸器区域内
        let resizerHandled = false;
        for (const [resizerId, resizerInfo] of EventManager._registeredResizers) {
            const { element, window, state, onResizeStart } = resizerInfo;
            
            // 检查是否点击在拉伸器上（包括拉伸器本身及其子元素）
            if (e.target === element || element.contains(e.target)) {
                // 额外检查：确保点击位置确实在拉伸器的可视区域内
                const rect = element.getBoundingClientRect();
                const clickX = e.clientX;
                const clickY = e.clientY;
                
                // 检查点击位置是否在拉伸器矩形内
                const isInResizerBounds = clickX >= rect.left && 
                                         clickX <= rect.right && 
                                         clickY >= rect.top && 
                                         clickY <= rect.bottom;
                
                if (!isInResizerBounds) {
                    continue;
                }
                
                // 检查是否全屏
                if (state.isFullscreen) {
                    continue;
                }
                
                // 触发拉伸开始
                onResizeStart(e);
                resizerHandled = true;
                e.stopPropagation(); // 阻止事件继续传播
                e.preventDefault(); // 阻止默认行为
                break; // 只处理一个拉伸器
            }
        }
        
        // 如果已经处理了拉伸，不再处理拖动
        if (resizerHandled) {
            return;
        }
        
        // 处理窗口拖动
        for (const [windowId, dragInfo] of EventManager._registeredDrags) {
            const { element, window, state, onDragStart, excludeSelectors } = dragInfo;
            
            // 检查是否点击在拖动元素上
            if (!element.contains(e.target) && e.target !== element) {
                continue;
            }
            
            // 检查是否在排除的选择器内
            let shouldExclude = false;
            for (const selector of excludeSelectors) {
                if (e.target.closest(selector)) {
                    shouldExclude = true;
                    break;
                }
            }
            
            if (shouldExclude) {
                continue;
            }
            
            // 再次检查是否点击在拉伸器上（防止拖动时误触发拉伸）
            // 使用更严格的检查：检查点击位置和元素层级
            let isOnResizer = false;
            for (const [resizerId, resizerInfo] of EventManager._registeredResizers) {
                const { element: resizerElement, window: resizerWindow } = resizerInfo;
                
                // 检查目标元素是否是拉伸器或其子元素
                if (e.target === resizerElement || resizerElement.contains(e.target)) {
                    // 额外检查：确保点击位置确实在拉伸器的可视区域内
                    const rect = resizerElement.getBoundingClientRect();
                    const clickX = e.clientX;
                    const clickY = e.clientY;
                    
                    const isInResizerBounds = clickX >= rect.left && 
                                             clickX <= rect.right && 
                                             clickY >= rect.top && 
                                             clickY <= rect.bottom;
                    
                    // 检查拉伸器是否属于同一个窗口（确保是同一个窗口的拉伸器）
                    if (isInResizerBounds && resizerWindow === window) {
                        isOnResizer = true;
                        break;
                    }
                }
            }
            
            if (isOnResizer) {
                continue;
            }
            
            // 检查是否全屏
            if (state.isFullscreen) {
                continue;
            }
            
            // 触发拖动开始
            onDragStart(e);
        }
    }
    
    /**
     * 处理全局 mousemove 事件
     * @param {Event} e 事件对象
     */
    static _handleGlobalMousemove(e) {
        // 处理窗口拖动
        for (const [windowId, dragInfo] of EventManager._registeredDrags) {
            const { state, onDrag } = dragInfo;
            
            if (state.isDragging) {
                onDrag(e);
            }
        }
        
        // 处理窗口拉伸
        for (const [resizerId, resizerInfo] of EventManager._registeredResizers) {
            const { state, onResize } = resizerInfo;
            
            if (state.isResizing) {
                onResize(e);
            }
        }
    }
    
    /**
     * 处理全局 mouseup 事件
     * @param {Event} e 事件对象
     */
    static _handleGlobalMouseup(e) {
        // 处理窗口拖动
        for (const [windowId, dragInfo] of EventManager._registeredDrags) {
            const { state, onDragEnd } = dragInfo;
            
            if (state.isDragging) {
                onDragEnd(e);
            }
        }
        
        // 处理窗口拉伸
        for (const [resizerId, resizerInfo] of EventManager._registeredResizers) {
            const { state, onResizeEnd } = resizerInfo;
            
            if (state.isResizing) {
                onResizeEnd(e);
            }
        }
    }
    
    
    /**
     * 清理所有注册的事件
     */
    static clearAll() {
        EventManager._registeredMenus.clear();
        EventManager._registeredDrags.clear();
        EventManager._registeredResizers.clear();
        
        // 清理多任务选择器的定时器
        for (const [selectorId, selectorInfo] of EventManager._registeredSelectors) {
            if (selectorInfo.showTimer) {
                clearTimeout(selectorInfo.showTimer);
            }
            if (selectorInfo.hideTimer) {
                clearTimeout(selectorInfo.hideTimer);
            }
        }
        EventManager._registeredSelectors.clear();
        
        KernelLogger.debug("EventManager", "所有事件已清理");
    }
    
    /**
     * 销毁事件管理器
     */
    static destroy() {
        if (EventManager._globalClickHandler) {
            document.removeEventListener('click', EventManager._globalClickHandler, true);
            EventManager._globalClickHandler = null;
        }
        
        if (EventManager._globalMousedownHandler) {
            document.removeEventListener('mousedown', EventManager._globalMousedownHandler, true);
            EventManager._globalMousedownHandler = null;
        }
        
        if (EventManager._globalMousemoveHandler) {
            document.removeEventListener('mousemove', EventManager._globalMousemoveHandler);
            EventManager._globalMousemoveHandler = null;
        }
        
        if (EventManager._globalMouseupHandler) {
            document.removeEventListener('mouseup', EventManager._globalMouseupHandler);
            EventManager._globalMouseupHandler = null;
        }
        
        
        EventManager.clearAll();
        EventManager._initialized = false;
        KernelLogger.info("EventManager", "事件管理器已销毁");
    }
}

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "EventManager", EventManager);
    } catch (e) {
        // 忽略错误
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/process/eventManager.js");
}

