// 事件管理器：统一管理所有事件处理，支持多程序注册、优先级和事件传播控制
// 提供统一的事件处理API，支持事件传播优先级和打断事件传播

KernelLogger.info("EventManager", "模块初始化");

class EventManager {
    // ==================== 常量 ====================
    
    /**
     * 事件处理程序ID计数器
     */
    static _handlerIdCounter = 0;;
    
    /**
     * 事件处理程序注册表
     * Map<eventType, Array<{handlerId, pid, handler, priority, selector, stopPropagation, once, passive}>>
     * 按优先级排序（数字越小优先级越高）
     */
    static _eventHandlers = new Map();
    
    /**
     * PID到处理程序ID的映射（用于快速清理）
     * Map<pid, Set<handlerId>>
     */
    static _pidToHandlers = new Map();
    
    /**
     * 注册的菜单列表 Map<menuId, {menu, closeCallback, excludeSelectors, handlerIds}>
     */
    static _registeredMenus = new Map();
    
    /**
     * 注册的拖动列表 Map<windowId, {handlerIds}>
     */
    static _registeredDrags = new Map();
    
    /**
     * 注册的拉伸列表 Map<resizerId, {handlerIds}>
     */
    static _registeredResizers = new Map();
    
    /**
     * 注册的选择器列表 Map<selectorId, {iconElement, selectorElement, onShow, onHide, onClickOutside, showDelay, hideDelay, showTimer, hideTimer, handlerIds}>
     */
    static _registeredSelectors = new Map();
    
    /**
     * 元素特定事件处理程序 Map<handlerId, {handlerId, pid, element, eventType, handler, options}>
     */
    static _elementEventHandlers = new Map();
    
    /**
     * 全局事件监听器（每个事件类型只添加一次）
     * Map<eventType, {listener, useCapture}>
     */
    static _globalListeners = new Map();
    
    /**
     * 是否已初始化
     */
    static _initialized = false;
    
    /**
     * 是否已拦截 addEventListener
     */
    static _addEventListenerIntercepted = false;
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化事件管理器
     */
    static init() {
        if (EventManager._initialized) {
            return;
        }
        
        if (typeof document === 'undefined') {
            KernelLogger.warn("EventManager", "document 不可用，跳过事件管理器初始化");
            return;
        }
        
        // 监控 document 和 window 的 addEventListener，记录使用情况并建议使用 EventManager
        EventManager._interceptAddEventListener();
        
        EventManager._initialized = true;
        KernelLogger.info("EventManager", "事件管理器初始化完成");
    }
    
    /**
     * 拦截 addEventListener，允许使用但记录警告日志
     * 建议程序使用 EventManager.registerEventHandler() 进行统一管理
     */
    static _interceptAddEventListener() {
        // 保存原始的 addEventListener
        const originalDocumentAddEventListener = document.addEventListener;
        const originalWindowAddEventListener = typeof window !== 'undefined' ? window.addEventListener : null;
        const originalElementAddEventListener = Element.prototype.addEventListener;
        
        // 如果已经拦截过，不再重复拦截
        if (EventManager._addEventListenerIntercepted) {
            return;
        }
        EventManager._addEventListenerIntercepted = true;
        
        // 检查调用者是否是内核模块
        const isKernelModule = () => {
            try {
                const stack = new Error().stack;
                if (!stack) return false;
                
                // 检查调用栈中是否包含内核模块路径
                const kernelPaths = [
                    'kernel/',
                    'kernel\\',
                    'eventManager.js',
                    'taskbarManager.js',
                    'desktop.js',
                    'notificationManager.js',
                    'contextMenuManager.js',
                    'permissionManager.js',
                    'guiManager.js',
                    'bootloader/',
                    'bootloader\\'
                ];
                
                return kernelPaths.some(path => stack.includes(path));
            } catch (e) {
                return false;
            }
        };
        
        // 检查调用者是否是程序代码
        const isProgramCode = () => {
            try {
                const stack = new Error().stack;
                if (!stack) return false;
                
                // 检查调用栈中是否包含程序路径
                const programPaths = [
                    'service/DISK/D/application/',
                    'service\\DISK\\D\\application\\',
                    'service/DISK/C/',
                    'service\\DISK\\C\\'
                ];
                
                return programPaths.some(path => stack.includes(path));
            } catch (e) {
                return false;
            }
        };
        
        // 拦截 document.addEventListener（允许使用但记录警告）
        document.addEventListener = function(type, listener, options) {
            // 如果是内核模块调用，允许直接使用（不记录日志）
            if (isKernelModule()) {
                return originalDocumentAddEventListener.call(this, type, listener, options);
            }
            
            // 如果是程序代码调用，允许使用但记录警告
            if (isProgramCode()) {
                const currentPid = typeof ProcessManager !== 'undefined' ? EventManager._getCurrentPid() : null;
                const pidInfo = currentPid ? ` (PID: ${currentPid})` : '';
                
                KernelLogger.warn("EventManager", 
                    `程序${pidInfo}直接使用 document.addEventListener 注册事件 "${type}"。` +
                    `建议使用 EventManager.registerEventHandler() 进行统一管理，以便支持事件优先级、传播控制和自动清理。`
                );
                
                // 允许执行，但记录日志
                return originalDocumentAddEventListener.call(this, type, listener, options);
            }
            
            // 其他情况（可能是第三方库），允许但记录警告
            KernelLogger.warn("EventManager", `检测到非内核代码使用 document.addEventListener，事件类型: ${type}`);
            return originalDocumentAddEventListener.call(this, type, listener, options);
        };
        
        // 拦截 window.addEventListener（允许使用但记录警告）
        if (originalWindowAddEventListener && typeof window !== 'undefined') {
            window.addEventListener = function(type, listener, options) {
                // 如果是内核模块调用，允许直接使用（不记录日志）
                if (isKernelModule()) {
                    return originalWindowAddEventListener.call(this, type, listener, options);
                }
                
                // 如果是程序代码调用，允许使用但记录警告
                if (isProgramCode()) {
                    const currentPid = typeof ProcessManager !== 'undefined' ? EventManager._getCurrentPid() : null;
                    const pidInfo = currentPid ? ` (PID: ${currentPid})` : '';
                    
                    KernelLogger.warn("EventManager", 
                        `程序${pidInfo}直接使用 window.addEventListener 注册事件 "${type}"。` +
                        `建议使用 EventManager.registerEventHandler() 进行统一管理，以便支持事件优先级、传播控制和自动清理。`
                    );
                    
                    // 允许执行，但记录日志
                    return originalWindowAddEventListener.call(this, type, listener, options);
                }
                
                // 其他情况，允许但记录警告
                KernelLogger.warn("EventManager", `检测到非内核代码使用 window.addEventListener，事件类型: ${type}`);
                return originalWindowAddEventListener.call(this, type, listener, options);
            };
        }
        
        // 拦截 Element.prototype.addEventListener（允许使用但记录警告）
        Element.prototype.addEventListener = function(type, listener, options) {
            // 如果是内核模块调用，允许直接使用（不记录日志）
            if (isKernelModule()) {
                return originalElementAddEventListener.call(this, type, listener, options);
            }
            
            // 如果是程序代码调用，检查是否是全局事件类型
            if (isProgramCode()) {
                const currentPid = typeof ProcessManager !== 'undefined' ? EventManager._getCurrentPid() : null;
                const pidInfo = currentPid ? ` (PID: ${currentPid})` : '';
                const elementInfo = this.tagName ? `元素: ${this.tagName}` : '未知元素';
                
                // 对于可冒泡的全局事件类型，建议使用 EventManager.registerEventHandler 并指定 selector
                const globalEventTypes = ['click', 'keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 
                                         'contextmenu', 'resize', 'scroll', 'focus', 'blur', 'input', 'change'];
                
                if (globalEventTypes.includes(type)) {
                    KernelLogger.warn("EventManager", 
                        `程序${pidInfo}在${elementInfo}上注册全局事件类型 "${type}"。` +
                        `建议使用 EventManager.registerEventHandler() 并指定 selector 进行统一管理。`
                    );
                }
                
                // 对于不会冒泡的事件（mouseenter, mouseleave, load, error），建议使用 EventManager.registerElementEvent
                const nonBubblingEvents = ['mouseenter', 'mouseleave', 'load', 'error', 'focusin', 'focusout'];
                if (nonBubblingEvents.includes(type)) {
                    KernelLogger.warn("EventManager", 
                        `程序${pidInfo}在${elementInfo}上注册非冒泡事件类型 "${type}"。` +
                        `建议使用 EventManager.registerElementEvent() 进行统一管理。`
                    );
                }
            }
            
            // 允许所有事件类型（包括第三方库）
            return originalElementAddEventListener.call(this, type, listener, options);
        };
        
        KernelLogger.info("EventManager", "已监控 addEventListener，程序可以使用但建议使用 EventManager.registerEventHandler() 或 EventManager.registerElementEvent() 进行统一管理");
    }
    
    /**
     * 获取当前程序的 PID（通过调用栈分析）
     */
    static _getCurrentPid() {
        try {
            if (typeof ProcessManager === 'undefined') {
                return null;
            }
            
            // 尝试从调用栈中获取程序路径，然后查找对应的 PID
            const stack = new Error().stack;
            if (!stack) return null;
            
            // 查找程序路径
            const programPathMatch = stack.match(/service[\/\\]DISK[\/\\][CD][\/\\]application[\/\\]([^\/\\\s]+)/);
            if (programPathMatch) {
                const programName = programPathMatch[1];
                // 查找对应的 PID
                if (ProcessManager.PROCESS_TABLE) {
                    for (const [pid, info] of ProcessManager.PROCESS_TABLE) {
                        if (info.programName === programName) {
                            return pid;
                        }
                    }
                }
            }
            
            return null;
        } catch (e) {
            return null;
        }
    }
    
    // ==================== 事件注册 ====================
    
    /**
     * 注册事件处理程序
     * @param {number} pid 程序PID
     * @param {string} eventType 事件类型（如 'click', 'contextmenu', 'keydown'）
     * @param {Function} handler 事件处理函数 (event, eventContext) => { ... }
     *                           返回值可以是：
     *                           - false: 阻止默认行为
     *                           - 'stop' 或 'stopPropagation': 停止事件传播
     *                           - 'stopImmediate' 或 'stopImmediatePropagation': 立即停止事件传播
     * @param {Object} options 选项
     * @param {number} options.priority 优先级（数字越小优先级越高，默认100）
     * @param {string} options.selector CSS选择器（可选，只在匹配的元素上触发）
     * @param {boolean} options.stopPropagation 是否阻止事件传播（默认false）
     * @param {boolean} options.once 是否只触发一次（默认false）
     * @param {boolean} options.passive 是否被动监听（默认false）
     * @param {boolean} options.useCapture 是否使用捕获阶段（默认false）
     * @returns {number} 处理程序ID，用于注销
     */
    static registerEventHandler(pid, eventType, handler, options = {}) {
        // 参数验证
        if (!pid || typeof pid !== 'number' || pid <= 0) {
            KernelLogger.warn("EventManager", `注册事件处理程序失败：无效的 PID: ${pid}`);
            return null;
        }
        
        if (!eventType || typeof eventType !== 'string' || eventType.trim() === '') {
            KernelLogger.warn("EventManager", `注册事件处理程序失败：无效的事件类型: ${eventType}`);
            return null;
        }
        
        if (typeof handler !== 'function') {
            KernelLogger.warn("EventManager", `注册事件处理程序失败：处理程序必须是函数，PID: ${pid}, 事件类型: ${eventType}`);
            return null;
        }
        
        // 权限检查（EXPLOIT_PID 是系统级 PID，自动拥有所有权限）
        if (typeof PermissionManager !== 'undefined') {
            const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
            // EXPLOIT_PID 是系统级 PID，跳过权限检查
            if (pid !== exploitPid) {
                const requiredPermission = PermissionManager.PERMISSION.EVENT_LISTENER;
                if (!PermissionManager.hasPermission(pid, requiredPermission)) {
                    KernelLogger.warn("EventManager", `程序 ${pid} 没有权限注册事件处理程序`);
                    return null;
                }
            }
        }
        
        EventManager.init();
        
        const {
            priority = 100,
            selector = null,
            stopPropagation = false,
            once = false,
            passive = false,
            useCapture = false
        } = options;
        
        // 验证优先级（确保是数字）
        const validatedPriority = typeof priority === 'number' && !isNaN(priority) ? priority : 100;
        
        // 验证选择器（如果提供）
        let validatedSelector = selector;
        if (selector !== null && selector !== undefined && selector !== '') {
            if (typeof selector !== 'string') {
                KernelLogger.warn("EventManager", `选择器必须是字符串，PID: ${pid}, 事件类型: ${eventType}`);
                validatedSelector = null;
            } else {
                // 尝试验证选择器是否有效（简单检查）
                try {
                    if (typeof document !== 'undefined') {
                        // 使用 querySelector 验证选择器语法（不实际查询）
                        document.querySelector(selector);
                    }
                } catch (err) {
                    KernelLogger.warn("EventManager", `选择器语法可能无效: ${selector}, PID: ${pid}, 事件类型: ${eventType}`);
                    // 仍然允许注册，但会在运行时检查
                }
            }
        }
        
        const handlerId = ++EventManager._handlerIdCounter;
        
        // 创建处理程序信息
        const handlerInfo = {
            handlerId,
            pid,
            handler,
            priority: validatedPriority,
            selector: validatedSelector,
            stopPropagation: !!stopPropagation,
            once: !!once,
            passive: !!passive,
            useCapture: !!useCapture
        };
        
        // 添加到事件处理程序列表
        if (!EventManager._eventHandlers.has(eventType)) {
            EventManager._eventHandlers.set(eventType, []);
        }
        
        const handlers = EventManager._eventHandlers.get(eventType);
        handlers.push(handlerInfo);
        
        // 按优先级排序（数字越小优先级越高）
        handlers.sort((a, b) => a.priority - b.priority);
        
        // 添加到PID映射
        if (!EventManager._pidToHandlers.has(pid)) {
            EventManager._pidToHandlers.set(pid, new Set());
        }
        EventManager._pidToHandlers.get(pid).add(handlerId);
        
        // 确保全局事件监听器已添加
        EventManager._ensureGlobalListener(eventType, useCapture);
        
        KernelLogger.debug("EventManager", 
            `事件处理程序已注册: PID ${pid}, 事件类型 ${eventType}, 优先级 ${validatedPriority}, 处理程序ID ${handlerId}` +
            (validatedSelector ? `, 选择器: ${validatedSelector}` : '')
        );
        
        return handlerId;
    }
    
    /**
     * 注销事件处理程序
     * @param {number} handlerId 处理程序ID
     */
    static unregisterEventHandler(handlerId) {
        if (!handlerId || typeof handlerId !== 'number') {
            KernelLogger.warn("EventManager", `注销事件处理程序失败：无效的 handlerId: ${handlerId}`);
            return;
        }
        
        // 查找并移除处理程序
        for (const [eventType, handlers] of EventManager._eventHandlers) {
            const index = handlers.findIndex(h => h.handlerId === handlerId);
            if (index !== -1) {
                const handlerInfo = handlers[index];
                handlers.splice(index, 1);
                
                // 从PID映射中移除
                if (EventManager._pidToHandlers.has(handlerInfo.pid)) {
                    EventManager._pidToHandlers.get(handlerInfo.pid).delete(handlerId);
                    
                    // 如果该 PID 没有其他处理程序了，清理映射
                    if (EventManager._pidToHandlers.get(handlerInfo.pid).size === 0) {
                        EventManager._pidToHandlers.delete(handlerInfo.pid);
                    }
                }
                
                KernelLogger.debug("EventManager", 
                    `事件处理程序已注销: 处理程序ID ${handlerId}, PID ${handlerInfo.pid}, 事件类型 ${eventType}`
                );
                return;
            }
        }
        
        KernelLogger.debug("EventManager", `未找到要注销的事件处理程序: handlerId ${handlerId}`);
    }
    
    /**
     * 注销程序的所有事件处理程序
     * @param {number} pid 程序PID
     */
    static unregisterAllHandlersForPid(pid) {
        if (!pid || typeof pid !== 'number' || pid <= 0) {
            KernelLogger.warn("EventManager", `注销所有事件处理程序失败：无效的 PID: ${pid}`);
            return;
        }
        
        if (!EventManager._pidToHandlers.has(pid)) {
            KernelLogger.debug("EventManager", `程序 ${pid} 没有注册的事件处理程序`);
            return;
        }
        
        const handlerIds = EventManager._pidToHandlers.get(pid);
        const handlerCount = handlerIds.size;
        
        // 创建副本以避免迭代时修改 Set
        const handlerIdsCopy = new Set(handlerIds);
        for (const handlerId of handlerIdsCopy) {
            // 检查是否是元素特定事件
            if (EventManager._elementEventHandlers && EventManager._elementEventHandlers.has(handlerId)) {
                EventManager.unregisterElementEvent(handlerId);
            } else {
                EventManager.unregisterEventHandler(handlerId);
            }
        }
        
        // 确保清理 PID 映射（即使有些处理程序可能已经被移除）
        EventManager._pidToHandlers.delete(pid);
        
        KernelLogger.debug("EventManager", `程序 ${pid} 的所有事件处理程序已注销 (共 ${handlerCount} 个)`);
    }
    
    // ==================== 元素特定事件管理 ====================
    
    /**
     * 注册元素特定的事件（不会冒泡的事件，如 mouseenter, mouseleave, load, error）
     * 这些事件需要直接绑定到元素上，但通过 EventManager 统一管理
     * @param {number} pid 程序PID
     * @param {HTMLElement} element 元素
     * @param {string} eventType 事件类型（如 'mouseenter', 'mouseleave', 'load', 'error'）
     * @param {Function} handler 事件处理函数
     * @param {Object} options 选项（可选）
     * @returns {number} 处理程序ID，用于注销
     */
    static registerElementEvent(pid, element, eventType, handler, options = {}) {
        if (!pid || typeof pid !== 'number' || pid <= 0) {
            KernelLogger.warn("EventManager", `注册元素事件失败：无效的 PID: ${pid}`);
            return null;
        }
        
        if (!element || !(element instanceof Element)) {
            KernelLogger.warn("EventManager", `注册元素事件失败：无效的元素`);
            return null;
        }
        
        if (!eventType || typeof eventType !== 'string') {
            KernelLogger.warn("EventManager", `注册元素事件失败：无效的事件类型: ${eventType}`);
            return null;
        }
        
        if (typeof handler !== 'function') {
            KernelLogger.warn("EventManager", `注册元素事件失败：处理程序必须是函数`);
            return null;
        }
        
        // 权限检查（EXPLOIT_PID 是系统级 PID，自动拥有所有权限）
        if (typeof PermissionManager !== 'undefined') {
            const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
            if (pid !== exploitPid) {
                const requiredPermission = PermissionManager.PERMISSION.EVENT_LISTENER;
                if (!PermissionManager.hasPermission(pid, requiredPermission)) {
                    KernelLogger.warn("EventManager", `程序 ${pid} 没有权限注册事件处理程序`);
                    return null;
                }
            }
        }
        
        EventManager.init();
        
        const handlerId = ++EventManager._handlerIdCounter;
        
        // 使用原生 addEventListener（因为这是内核允许的）
        const originalAddEventListener = Element.prototype.addEventListener;
        originalAddEventListener.call(element, eventType, handler, options);
        
        // 保存处理程序信息以便清理
        if (!EventManager._elementEventHandlers) {
            EventManager._elementEventHandlers = new Map();
        }
        EventManager._elementEventHandlers.set(handlerId, {
            handlerId,
            pid,
            element,
            eventType,
            handler,
            options
        });
        
        // 添加到PID映射
        if (!EventManager._pidToHandlers.has(pid)) {
            EventManager._pidToHandlers.set(pid, new Set());
        }
        EventManager._pidToHandlers.get(pid).add(handlerId);
        
        KernelLogger.debug("EventManager", 
            `元素事件已注册: PID ${pid}, 元素 ${element.tagName}, 事件类型 ${eventType}, 处理程序ID ${handlerId}`
        );
        
        return handlerId;
    }
    
    /**
     * 注销元素特定的事件
     * @param {number} handlerId 处理程序ID
     */
    static unregisterElementEvent(handlerId) {
        if (!handlerId || typeof handlerId !== 'number') {
            KernelLogger.warn("EventManager", `注销元素事件失败：无效的 handlerId: ${handlerId}`);
            return;
        }
        
        if (!EventManager._elementEventHandlers || !EventManager._elementEventHandlers.has(handlerId)) {
            KernelLogger.debug("EventManager", `未找到要注销的元素事件: handlerId ${handlerId}`);
            return;
        }
        
        const handlerInfo = EventManager._elementEventHandlers.get(handlerId);
        const { element, eventType, handler, options, pid } = handlerInfo;
        
        // 使用原生 removeEventListener
        const originalRemoveEventListener = Element.prototype.removeEventListener;
        originalRemoveEventListener.call(element, eventType, handler, options);
        
        // 从映射中移除
        EventManager._elementEventHandlers.delete(handlerId);
        
        if (EventManager._pidToHandlers.has(pid)) {
            EventManager._pidToHandlers.get(pid).delete(handlerId);
            if (EventManager._pidToHandlers.get(pid).size === 0) {
                EventManager._pidToHandlers.delete(pid);
            }
        }
        
        KernelLogger.debug("EventManager", 
            `元素事件已注销: 处理程序ID ${handlerId}, PID ${pid}, 事件类型 ${eventType}`
        );
    }
    
    // ==================== 全局事件监听 ====================
    
    /**
     * 确保全局事件监听器已添加
     * @param {string} eventType 事件类型
     * @param {boolean} useCapture 是否使用捕获阶段
     */
    static _ensureGlobalListener(eventType, useCapture) {
        const listenerKey = `${eventType}_${useCapture}`;
        
        if (EventManager._globalListeners.has(listenerKey)) {
            return;
        }
        
        const globalHandler = (e) => {
            // 验证事件对象
            if (!e || typeof e !== 'object') {
                KernelLogger.warn("EventManager", `收到无效的事件对象，事件类型: ${eventType}`);
                return;
            }
            
            // 处理对应 useCapture 阶段的处理程序
            EventManager._handleGlobalEvent(eventType, e, useCapture);
        };
        
        // 使用 passive 选项优化性能（对于某些事件类型）
        const passiveEvents = ['touchstart', 'touchmove', 'wheel', 'mousewheel', 'scroll'];
        
        // 确定目标对象（resize 事件在 window 上，其他在 document 上）
        const target = (eventType === 'resize' || eventType === 'focus' || eventType === 'blur') && typeof window !== 'undefined' 
            ? window 
            : document;
        
        // 检查是否有处理程序需要 passive 选项
        // 注意：如果任何处理程序需要非 passive（需要 preventDefault），则不能使用 passive
        const handlers = EventManager._eventHandlers.get(eventType);
        const hasNonPassiveHandler = handlers && handlers.some(h => h.passive === false);
        const needsPassive = handlers && handlers.some(h => h.passive === true);
        
        // 如果事件类型本身需要 passive，或者所有处理程序都是 passive，则使用 passive
        // 但如果任何处理程序明确设置为非 passive，则不使用 passive
        const shouldBePassive = !hasNonPassiveHandler && (passiveEvents.includes(eventType) || needsPassive);
        
        const options = {
            capture: useCapture,
            passive: shouldBePassive
        };
        
        try {
            target.addEventListener(eventType, globalHandler, options);
            
            EventManager._globalListeners.set(listenerKey, {
                listener: globalHandler,
                useCapture,
                options,
                target: target === window ? 'window' : 'document'
            });
            
            KernelLogger.debug("EventManager", `全局事件监听器已添加: ${eventType}, useCapture: ${useCapture}, target: ${target === window ? 'window' : 'document'}`);
        } catch (error) {
            KernelLogger.error("EventManager", `添加全局事件监听器失败: ${eventType}`, error);
        }
    }
    
    /**
     * 处理全局事件
     * @param {string} eventType 事件类型
     * @param {Event} e 事件对象
     * @param {boolean} useCapture 是否使用捕获阶段
     */
    static _handleGlobalEvent(eventType, e, useCapture = false) {
        // 验证事件对象
        if (!e || typeof e !== 'object') {
            KernelLogger.warn("EventManager", `处理全局事件时收到无效的事件对象，事件类型: ${eventType}`);
            return;
        }
        
        const handlers = EventManager._eventHandlers.get(eventType);
        if (!handlers || handlers.length === 0) {
            return;
        }
        
        // 过滤出匹配当前 useCapture 阶段的处理程序
        const matchingHandlers = handlers.filter(h => h.useCapture === useCapture);
        if (matchingHandlers.length === 0) {
            return;
        }
        
        // 调试日志：对于 mousedown 事件，记录处理程序数量
        if (eventType === 'mousedown' && e.button === 0) {
            KernelLogger.debug("EventManager", 
                `处理 mousedown 事件，useCapture: ${useCapture}, 匹配的处理程序数: ${matchingHandlers.length}, target: ${e.target?.tagName || 'unknown'}, className: ${e.target?.className || 'none'}`
            );
        }
        
        // 创建事件上下文对象，用于在处理程序间传递信息
        // 使用箭头函数确保 this 绑定正确
        const eventContext = {
            stopped: false,  // 是否已停止传播
            prevented: false,  // 是否已阻止默认行为
            currentHandler: null,  // 当前执行的处理程序信息
            eventType: eventType,  // 事件类型
            useCapture: useCapture,  // 是否使用捕获阶段
            stopPropagation: function() {
                this.stopped = true;
                if (e && typeof e.stopPropagation === 'function') {
                    try {
                        e.stopPropagation();
                    } catch (err) {
                        KernelLogger.warn("EventManager", `调用 stopPropagation 失败: ${err.message}`);
                    }
                }
            },
            stopImmediatePropagation: function() {
                this.stopped = true;
                if (e && typeof e.stopImmediatePropagation === 'function') {
                    try {
                        e.stopImmediatePropagation();
                    } catch (err) {
                        KernelLogger.warn("EventManager", `调用 stopImmediatePropagation 失败: ${err.message}`);
                    }
                }
            },
            preventDefault: function() {
                this.prevented = true;
                if (e && typeof e.preventDefault === 'function') {
                    try {
                        e.preventDefault();
                    } catch (err) {
                        KernelLogger.warn("EventManager", `调用 preventDefault 失败: ${err.message}`);
                    }
                }
            }
        };
        
        // 按优先级顺序执行处理程序
        // 使用数组副本，避免在执行过程中修改原数组导致的问题
        const handlersToExecute = [...matchingHandlers];
        
        for (const handlerInfo of handlersToExecute) {
            // 如果事件传播已被停止，不再执行后续处理程序
            if (eventContext.stopped) {
                break;
            }
            
            // 检查处理程序是否已被标记为移除（once 选项）
            if (handlerInfo._markedForRemoval) {
                continue;
            }
            
            // 检查处理程序是否仍然存在（可能在 once 选项中被移除）
            const currentHandlers = EventManager._eventHandlers.get(eventType);
            if (!currentHandlers || !currentHandlers.some(h => h.handlerId === handlerInfo.handlerId && !h._markedForRemoval)) {
                continue;
            }
            
            const { handler, selector, stopPropagation, once, pid } = handlerInfo;
            
            // 验证处理程序函数
            if (typeof handler !== 'function') {
                KernelLogger.warn("EventManager", `处理程序不是函数: PID ${pid}, 事件类型 ${eventType}, handlerId ${handlerInfo.handlerId}`);
                continue;
            }
            
            // 检查选择器匹配（对于有 target 的事件）
            if (selector && selector !== '') {
                // 对于某些事件（如 resize、focus、blur），可能没有 target 或 target 是 window
                if (e.target && typeof e.target.closest === 'function') {
                    try {
                        const matchedElement = e.target.closest(selector);
                        if (!matchedElement) {
                            // 调试日志：对于 mousedown 事件，记录选择器不匹配
                            if (eventType === 'mousedown' && e.button === 0) {
                                KernelLogger.debug("EventManager", 
                                    `处理程序 ${handlerInfo.handlerId} (priority: ${handlerInfo.priority}) 被跳过：选择器不匹配，selector: ${selector}, target: ${e.target?.tagName || 'unknown'}`
                                );
                            }
                            continue; // 选择器不匹配，跳过此处理程序
                        }
                    } catch (err) {
                        // 选择器无效，记录警告但跳过此处理程序
                        KernelLogger.warn("EventManager", 
                            `选择器匹配失败: ${selector}, PID: ${pid}, 事件类型: ${eventType}, 错误: ${err.message}`
                        );
                        continue;
                    }
                } else if (e.target === null || e.target === undefined || e.target === window || e.target === document) {
                    // 对于没有 target 的事件（如 resize、focus、blur），如果指定了选择器，跳过
                    // 这些事件通常不应该使用选择器，除非是特殊情况
                    continue;
                }
            }
            
            // 调试日志：对于 mousedown 事件，记录处理程序即将执行
            if (eventType === 'mousedown' && e.button === 0) {
                KernelLogger.debug("EventManager", 
                    `执行处理程序 ${handlerInfo.handlerId} (priority: ${handlerInfo.priority}, useCapture: ${handlerInfo.useCapture}, selector: ${selector || 'null'})`
                );
            }
            
            // 更新当前处理程序信息
            eventContext.currentHandler = handlerInfo;
            
            try {
                // 执行处理程序，传入事件对象和上下文
                // 为了向后兼容，如果处理程序不接受第二个参数，只传入事件对象
                let result;
                if (handler.length >= 2) {
                    result = handler(e, eventContext);
                } else {
                    result = handler(e);
                }
                
                // 处理返回值（按优先级处理）
                // 1. 首先检查是否返回了停止传播的指令
                if (result === 'stopImmediate' || result === 'stopImmediatePropagation') {
                    eventContext.stopImmediatePropagation();
                    break; // 立即停止，不再执行后续处理程序
                }
                
                if (result === 'stop' || result === 'stopPropagation') {
                    eventContext.stopPropagation();
                    break; // 停止传播，不再执行后续处理程序
                }
                
                // 2. 检查是否返回 false（阻止默认行为）
                if (result === false) {
                    eventContext.preventDefault();
                }
                
                // 3. 如果注册时设置了 stopPropagation，阻止事件传播
                if (stopPropagation) {
                    eventContext.stopPropagation();
                    break; // 不再执行后续处理程序
                }
                
                // 4. 如果设置了 once，标记为待移除（在最后处理，避免影响当前执行）
                if (once) {
                    // 立即从当前列表中移除，避免重复执行
                    // 但使用标记方式，避免在循环中直接修改数组
                    handlerInfo._markedForRemoval = true;
                    // 延迟实际移除，确保当前执行完成
                    setTimeout(() => {
                        EventManager.unregisterEventHandler(handlerInfo.handlerId);
                    }, 0);
                }
            } catch (error) {
                // 记录错误但继续执行其他处理程序
                KernelLogger.error("EventManager", 
                    `事件处理程序执行失败: PID ${pid}, 事件类型 ${eventType}, handlerId ${handlerInfo.handlerId}`, 
                    error
                );
                // 不中断其他处理程序的执行
            }
        }
    }
    
    // ==================== 事件传播控制 ====================
    
    /**
     * 阻止事件传播（在事件处理程序中调用）
     * 注意：在 EventManager 注册的处理程序中，应该使用传入的 eventContext 参数来控制传播
     * @param {Event} e 事件对象
     * @param {Object} eventContext 事件上下文对象（可选，如果提供则使用上下文）
     */
    static stopPropagation(e, eventContext = null) {
        if (eventContext && typeof eventContext.stopPropagation === 'function') {
            eventContext.stopPropagation();
        } else if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
    }
    
    /**
     * 立即阻止事件传播（在事件处理程序中调用）
     * 注意：在 EventManager 注册的处理程序中，应该使用传入的 eventContext 参数来控制传播
     * @param {Event} e 事件对象
     * @param {Object} eventContext 事件上下文对象（可选，如果提供则使用上下文）
     */
    static stopImmediatePropagation(e, eventContext = null) {
        if (eventContext && typeof eventContext.stopImmediatePropagation === 'function') {
            eventContext.stopImmediatePropagation();
        } else if (e && typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
        }
    }
    
    /**
     * 阻止默认行为（在事件处理程序中调用）
     * 注意：在 EventManager 注册的处理程序中，应该使用传入的 eventContext 参数来控制传播
     * @param {Event} e 事件对象
     * @param {Object} eventContext 事件上下文对象（可选，如果提供则使用上下文）
     */
    static preventDefault(e, eventContext = null) {
        if (eventContext && typeof eventContext.preventDefault === 'function') {
            eventContext.preventDefault();
        } else if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
    }
    
    /**
     * 检查事件是否已被停止传播
     * @param {Object} eventContext 事件上下文对象
     * @returns {boolean} 是否已停止传播
     */
    static isPropagationStopped(eventContext) {
        return eventContext && eventContext.stopped === true;
    }
    
    /**
     * 检查默认行为是否已被阻止
     * @param {Object} eventContext 事件上下文对象
     * @returns {boolean} 是否已阻止默认行为
     */
    static isDefaultPrevented(eventContext) {
        return eventContext && eventContext.prevented === true;
    }
    
    // ==================== 元素特定事件管理 ====================
    
    /**
     * 注册元素特定的事件（不会冒泡的事件，如 mouseenter, mouseleave, load, error）
     * 这些事件需要直接绑定到元素上，但通过 EventManager 统一管理
     * @param {number} pid 程序PID
     * @param {HTMLElement} element 元素
     * @param {string} eventType 事件类型（如 'mouseenter', 'mouseleave', 'load', 'error'）
     * @param {Function} handler 事件处理函数
     * @param {Object} options 选项（可选）
     * @returns {number} 处理程序ID，用于注销
     */
    static registerElementEvent(pid, element, eventType, handler, options = {}) {
        if (!pid || typeof pid !== 'number' || pid <= 0) {
            KernelLogger.warn("EventManager", `注册元素事件失败：无效的 PID: ${pid}`);
            return null;
        }
        
        if (!element || !(element instanceof Element)) {
            KernelLogger.warn("EventManager", `注册元素事件失败：无效的元素`);
            return null;
        }
        
        if (!eventType || typeof eventType !== 'string') {
            KernelLogger.warn("EventManager", `注册元素事件失败：无效的事件类型: ${eventType}`);
            return null;
        }
        
        if (typeof handler !== 'function') {
            KernelLogger.warn("EventManager", `注册元素事件失败：处理程序必须是函数`);
            return null;
        }
        
        // 权限检查（EXPLOIT_PID 是系统级 PID，自动拥有所有权限）
        if (typeof PermissionManager !== 'undefined') {
            const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
            if (pid !== exploitPid) {
                const requiredPermission = PermissionManager.PERMISSION.EVENT_LISTENER;
                if (!PermissionManager.hasPermission(pid, requiredPermission)) {
                    KernelLogger.warn("EventManager", `程序 ${pid} 没有权限注册事件处理程序`);
                    return null;
                }
            }
        }
        
        EventManager.init();
        
        const handlerId = ++EventManager._handlerIdCounter;
        
        // 使用原生 addEventListener（因为这是内核允许的）
        const originalAddEventListener = Element.prototype.addEventListener;
        originalAddEventListener.call(element, eventType, handler, options);
        
        // 保存处理程序信息以便清理
        if (!EventManager._elementEventHandlers) {
            EventManager._elementEventHandlers = new Map();
        }
        if (!EventManager._elementEventHandlers.has(handlerId)) {
            EventManager._elementEventHandlers.set(handlerId, {
                handlerId,
                pid,
                element,
                eventType,
                handler,
                options
            });
        }
        
        // 添加到PID映射
        if (!EventManager._pidToHandlers.has(pid)) {
            EventManager._pidToHandlers.set(pid, new Set());
        }
        EventManager._pidToHandlers.get(pid).add(handlerId);
        
        KernelLogger.debug("EventManager", 
            `元素事件已注册: PID ${pid}, 元素 ${element.tagName}, 事件类型 ${eventType}, 处理程序ID ${handlerId}`
        );
        
        return handlerId;
    }
    
    /**
     * 注销元素特定的事件
     * @param {number} handlerId 处理程序ID
     */
    static unregisterElementEvent(handlerId) {
        if (!handlerId || typeof handlerId !== 'number') {
            KernelLogger.warn("EventManager", `注销元素事件失败：无效的 handlerId: ${handlerId}`);
            return;
        }
        
        if (!EventManager._elementEventHandlers || !EventManager._elementEventHandlers.has(handlerId)) {
            KernelLogger.debug("EventManager", `未找到要注销的元素事件: handlerId ${handlerId}`);
            return;
        }
        
        const handlerInfo = EventManager._elementEventHandlers.get(handlerId);
        const { element, eventType, handler, options, pid } = handlerInfo;
        
        // 使用原生 removeEventListener
        const originalRemoveEventListener = Element.prototype.removeEventListener;
        originalRemoveEventListener.call(element, eventType, handler, options);
        
        // 从映射中移除
        EventManager._elementEventHandlers.delete(handlerId);
        
        if (EventManager._pidToHandlers.has(pid)) {
            EventManager._pidToHandlers.get(pid).delete(handlerId);
            if (EventManager._pidToHandlers.get(pid).size === 0) {
                EventManager._pidToHandlers.delete(pid);
            }
        }
        
        KernelLogger.debug("EventManager", 
            `元素事件已注销: 处理程序ID ${handlerId}, PID ${pid}, 事件类型 ${eventType}`
        );
    }
    
    // ==================== 兼容性方法（保留原有API） ====================
    
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
        
        EventManager.init();
        
        // 使用系统PID（Exploit PID）注册菜单关闭事件
        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
        
        // 注册点击事件处理程序
        const clickHandler = (e) => {
            // 如果菜单不存在或不可见，跳过
            if (!menu || !menu.parentElement || !menu.classList.contains('visible')) {
                return;
            }
            
            // 检查点击是否在菜单内
            if (menu.contains(e.target)) {
                return;
            }
            
            // 检查点击是否在排除的选择器内
            let shouldExclude = false;
            const defaultExcludeSelectors = [
                '#taskbar',
                '.taskbar-app-context-menu',
                '.context-menu'
            ];
            const allExcludeSelectors = [...defaultExcludeSelectors, ...excludeSelectors];
            
            for (const selector of allExcludeSelectors) {
                const excludedElement = e.target.closest(selector);
                if (excludedElement) {
                    shouldExclude = true;
                    break;
                }
            }
            
            if (shouldExclude) {
                return;
            }
            
            // 检查点击是否在 gui-container 或桌面区域
            const guiContainer = document.getElementById('gui-container');
            const clickedInGuiContainer = guiContainer && (guiContainer === e.target || guiContainer.contains(e.target));
            const clickedOnBody = e.target === document.body || e.target === document.documentElement;
            const clickedOnSandboxContainer = e.target.closest('.sandbox-container') && !e.target.closest('#taskbar') && !e.target.closest('.taskbar-app-menu') && !e.target.closest('.taskbar-power-menu');
            const clickedOnTaskbar = e.target.closest('#taskbar');
            
            // 如果点击在外部，关闭菜单
            if ((clickedInGuiContainer || clickedOnBody || clickedOnSandboxContainer) && !clickedOnTaskbar) {
                KernelLogger.debug("EventManager", `点击外部，关闭菜单: ${menuId}`);
                closeCallback();
            }
        };
        
        // 注册 mousedown 事件处理程序（优先级更高）
        const mousedownHandler = (e) => {
            clickHandler(e);
        };
        
        const clickHandlerId = EventManager.registerEventHandler(exploitPid, 'click', clickHandler, {
            priority: 50,
            useCapture: true
        });
        
        const mousedownHandlerId = EventManager.registerEventHandler(exploitPid, 'mousedown', mousedownHandler, {
            priority: 50,
            useCapture: true
        });
        
        // 保存菜单信息和 handlerId
        EventManager._registeredMenus.set(menuId, {
            menu,
            closeCallback,
            excludeSelectors,
            handlerIds: [clickHandlerId, mousedownHandlerId].filter(id => id !== null)
        });
        
        KernelLogger.debug("EventManager", `菜单已注册: ${menuId}`);
    }
    
    /**
     * 注销一个菜单
     * @param {string} menuId 菜单唯一标识
     */
    static unregisterMenu(menuId) {
        const menuInfo = EventManager._registeredMenus.get(menuId);
        if (menuInfo && menuInfo.handlerIds) {
            // 注销所有相关的事件处理程序
            for (const handlerId of menuInfo.handlerIds) {
                EventManager.unregisterEventHandler(handlerId);
            }
            EventManager._registeredMenus.delete(menuId);
            KernelLogger.debug("EventManager", `菜单已注销: ${menuId}`);
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
        
        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
        
        // 注册 mousedown 事件处理程序
        const mousedownHandler = (e, eventContext) => {
            KernelLogger.debug("EventManager", `拖动处理程序被调用，windowId: ${windowId}, target: ${e.target?.tagName || 'unknown'}, button: ${e.button}, ctrlKey: ${e.ctrlKey}, stopped: ${eventContext?.stopped || false}`);
            
            // 只处理鼠标左键
            if (e.button !== 0) {
                KernelLogger.debug("EventManager", `拖动被跳过：不是鼠标左键，windowId: ${windowId}`);
                return;
            }
            
            // 检查是否点击在拖动元素上（包括子元素）
            // 注意：element.contains(e.target) 会检查 e.target 是否是 element 的子元素或 element 本身
            // 所以如果 e.target 是 element 的子元素，element.contains(e.target) 会返回 true
            const isClickOnElement = element === e.target || element.contains(e.target);
            if (!isClickOnElement) {
                KernelLogger.debug("EventManager", `拖动被跳过：点击不在拖动元素上，windowId: ${windowId}, element: ${element?.tagName || 'unknown'}, target: ${e.target?.tagName || 'unknown'}`);
                return;
            }
            
            // 检查是否在排除的选择器内
            const defaultExcludeSelectors = ['.dot', '.controls', '.window-resizer'];
            const allExcludeSelectors = [...defaultExcludeSelectors, ...excludeSelectors];
            
            for (const selector of allExcludeSelectors) {
                if (e.target.closest(selector)) {
                    KernelLogger.debug("EventManager", `拖动被跳过：点击在排除的选择器内，windowId: ${windowId}, selector: ${selector}`);
                    return;
                }
            }
            
            // 检查是否全屏或最大化（兼容不同的状态对象结构）
            // 注意：state 可能是 windowState 对象，需要检查 isMaximized 和 isFullscreen
            if (state && typeof state === 'object') {
                if (state.isFullscreen || state.isMaximized) {
                    KernelLogger.debug("EventManager", `拖动被跳过：窗口全屏或最大化，windowId: ${windowId}, isFullscreen: ${state.isFullscreen}, isMaximized: ${state.isMaximized}`);
                    return;
                }
            }
            
            // 如果事件传播已被停止（例如 Ctrl+鼠标左键），不处理拖动
            // 但只有在明确是 Ctrl+鼠标左键时才跳过
            // 注意：对于桌面组件拖动，不应该被 Ctrl+鼠标左键阻止
            if (eventContext && eventContext.stopped && e.ctrlKey) {
                // 检查是否是桌面组件（通过检查元素是否在桌面组件容器内）
                const isDesktopComponent = element.closest && element.closest('#desktop-components-container');
                if (!isDesktopComponent) {
                    KernelLogger.debug("EventManager", `拖动被跳过：事件已停止且是 Ctrl+鼠标左键，windowId: ${windowId}`);
                    return;
                }
            }
            
            // 触发拖动开始
            KernelLogger.debug("EventManager", `触发拖动开始，windowId: ${windowId}`);
            if (onDragStart) {
                onDragStart(e);
            }
        };
        
        // 注册 mousemove 事件处理程序
        const mousemoveHandler = (e) => {
            if (state.isDragging && onDrag) {
                onDrag(e);
            }
        };
        
        // 注册 mouseup 事件处理程序
        const mouseupHandler = (e) => {
            if (state.isDragging && onDragEnd) {
                onDragEnd(e);
            }
        };
        
        const mousedownHandlerId = EventManager.registerEventHandler(exploitPid, 'mousedown', mousedownHandler, {
            priority: 30,
            useCapture: true,
            selector: null // 不使用选择器，让处理程序自己检查元素
        });
        
        const mousemoveHandlerId = EventManager.registerEventHandler(exploitPid, 'mousemove', mousemoveHandler, {
            priority: 30,
            selector: null
        });
        
        const mouseupHandlerId = EventManager.registerEventHandler(exploitPid, 'mouseup', mouseupHandler, {
            priority: 30,
            selector: null
        });
        
        // 保存 handlerId 以便后续注销
        EventManager._registeredDrags.set(windowId, {
            handlerIds: [mousedownHandlerId, mousemoveHandlerId, mouseupHandlerId].filter(id => id !== null)
        });
        
        KernelLogger.debug("EventManager", `窗口拖动已注册: ${windowId}`);
    }
    
    /**
     * 注销窗口拖动
     * @param {string} windowId 窗口唯一标识
     */
    static unregisterDrag(windowId) {
        const dragInfo = EventManager._registeredDrags.get(windowId);
        if (dragInfo && dragInfo.handlerIds) {
            // 注销所有相关的事件处理程序
            for (const handlerId of dragInfo.handlerIds) {
                EventManager.unregisterEventHandler(handlerId);
            }
            EventManager._registeredDrags.delete(windowId);
            KernelLogger.debug("EventManager", `窗口拖动已注销: ${windowId}`);
        } else {
            KernelLogger.debug("EventManager", `未找到要注销的窗口拖动: ${windowId}`);
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
        
        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
        
        // 注册 mousedown 事件处理程序（优先级高于拖动）
        const mousedownHandler = (e, eventContext) => {
            KernelLogger.debug("EventManager", `拉伸处理程序被调用，resizerId: ${resizerId}, target: ${e.target?.tagName || 'unknown'}, button: ${e.button}, ctrlKey: ${e.ctrlKey}, stopped: ${eventContext?.stopped || false}`);
            
            // 只处理鼠标左键
            if (e.button !== 0) {
                KernelLogger.debug("EventManager", `拉伸被跳过：不是鼠标左键，resizerId: ${resizerId}`);
                return;
            }
            
            // 如果事件传播已被停止（例如 Ctrl+鼠标左键），不处理拉伸
            // 但只有在明确是 Ctrl+鼠标左键时才跳过
            if (eventContext && eventContext.stopped && e.ctrlKey) {
                KernelLogger.debug("EventManager", `拉伸被跳过：事件已停止且是 Ctrl+鼠标左键，resizerId: ${resizerId}`);
                return;
            }
            
            // 使用坐标检查，而不是元素检查，避免被其他元素遮挡的问题
            const rect = resizerElement.getBoundingClientRect();
            const clickX = e.clientX;
            const clickY = e.clientY;
            
            // 检查点击坐标是否在拉伸器范围内（使用更宽松的边界检查）
            const isInResizerBounds = clickX >= rect.left - 2 && 
                                     clickX <= rect.right + 2 && 
                                     clickY >= rect.top - 2 && 
                                     clickY <= rect.bottom + 2;
            
            if (!isInResizerBounds) {
                KernelLogger.debug("EventManager", `拉伸被跳过：点击不在拉伸器范围内，resizerId: ${resizerId}, click: (${clickX}, ${clickY}), rect: (${rect.left}, ${rect.top}, ${rect.right}, ${rect.bottom})`);
                return;
            }
            
            // 额外检查：如果点击的元素是拉伸器本身或其子元素，或者点击的元素在窗口内但不是控制按钮
            const clickedElement = e.target;
            const isResizerElement = clickedElement === resizerElement || resizerElement.contains(clickedElement);
            const isWindowControl = clickedElement && (
                clickedElement.closest('.zos-window-btn') ||
                clickedElement.closest('.zos-window-controls') ||
                clickedElement.closest('.zos-window-titlebar')
            );
            
            // 如果点击的是窗口控制按钮，不处理（让控制按钮优先）
            if (isWindowControl && !isResizerElement) {
                KernelLogger.debug("EventManager", `拉伸被跳过：点击在窗口控制按钮上，resizerId: ${resizerId}`);
                return;
            }
            
            // 检查是否全屏或最大化（兼容不同的状态对象结构）
            // 注意：state 可能是 windowState 对象，需要检查 isMaximized 和 isFullscreen
            if (state && typeof state === 'object') {
                if (state.isFullscreen || state.isMaximized) {
                    KernelLogger.debug("EventManager", `拉伸被跳过：窗口全屏或最大化，resizerId: ${resizerId}, isFullscreen: ${state.isFullscreen}, isMaximized: ${state.isMaximized}`);
                    return;
                }
            }
            
            // 触发拉伸开始
            KernelLogger.debug("EventManager", `触发拉伸开始，resizerId: ${resizerId}`);
            if (onResizeStart) {
                onResizeStart(e);
            }
            
            // 使用 eventContext 阻止事件传播（如果可用）
            if (eventContext) {
                eventContext.stopPropagation();
                eventContext.preventDefault();
            } else {
                EventManager.stopPropagation(e);
                EventManager.preventDefault(e);
            }
        };
        
        // 注册 mousemove 事件处理程序
        const mousemoveHandler = (e) => {
            if (state.isResizing && onResize) {
                onResize(e);
            }
        };
        
        // 注册 mouseup 事件处理程序
        const mouseupHandler = (e) => {
            if (state.isResizing && onResizeEnd) {
                onResizeEnd(e);
            }
        };
        
        const mousedownHandlerId = EventManager.registerEventHandler(exploitPid, 'mousedown', mousedownHandler, {
            priority: 20, // 优先级高于拖动
            useCapture: true,
            stopPropagation: false, // 不自动停止传播，让处理程序自己决定
            selector: null // 不使用选择器，让处理程序自己检查坐标
        });
        
        const mousemoveHandlerId = EventManager.registerEventHandler(exploitPid, 'mousemove', mousemoveHandler, {
            priority: 20,
            selector: null
        });
        
        const mouseupHandlerId = EventManager.registerEventHandler(exploitPid, 'mouseup', mouseupHandler, {
            priority: 20,
            selector: null
        });
        
        // 保存 handlerId 以便后续注销
        EventManager._registeredResizers.set(resizerId, {
            handlerIds: [mousedownHandlerId, mousemoveHandlerId, mouseupHandlerId].filter(id => id !== null)
        });
        
        KernelLogger.debug("EventManager", `窗口拉伸已注册: ${resizerId}`);
    }
    
    /**
     * 注销窗口拉伸
     * @param {string} resizerId 拉伸器唯一标识
     */
    static unregisterResizer(resizerId) {
        const resizerInfo = EventManager._registeredResizers.get(resizerId);
        if (resizerInfo && resizerInfo.handlerIds) {
            // 注销所有相关的事件处理程序
            for (const handlerId of resizerInfo.handlerIds) {
                EventManager.unregisterEventHandler(handlerId);
            }
            EventManager._registeredResizers.delete(resizerId);
            KernelLogger.debug("EventManager", `窗口拉伸已注销: ${resizerId}`);
        } else {
            KernelLogger.debug("EventManager", `未找到要注销的窗口拉伸: ${resizerId}`);
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
        
        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
        
        // 清理之前的注册（如果存在）
        EventManager.unregisterSelector(selectorId);
        
        let showTimer = null;
        let hideTimer = null;
        
        // mouseenter 和 mouseleave 不会冒泡，需要直接绑定到元素上
        const mouseenterHandler = () => {
            // 清除隐藏定时器
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            
            // 设置显示定时器
            if (showTimer) {
                clearTimeout(showTimer);
            }
            
            showTimer = setTimeout(() => {
                if (onShow && typeof onShow === 'function') {
                    try {
                        onShow();
                    } catch (error) {
                        KernelLogger.error("EventManager", `多任务选择器显示回调执行失败: ${selectorId}`, error);
                    }
                }
                showTimer = null;
            }, showDelay);
        };
        
        const mouseleaveHandler = () => {
            // 清除显示定时器
            if (showTimer) {
                clearTimeout(showTimer);
                showTimer = null;
            }
            
            // 设置隐藏定时器
            if (hideTimer) {
                clearTimeout(hideTimer);
            }
            
            hideTimer = setTimeout(() => {
                if (onHide && typeof onHide === 'function') {
                    try {
                        onHide();
                    } catch (error) {
                        KernelLogger.error("EventManager", `多任务选择器隐藏回调执行失败: ${selectorId}`, error);
                    }
                }
                hideTimer = null;
            }, hideDelay);
        };
        
        // 直接绑定到元素上（因为 mouseenter/mouseleave 不会冒泡）
        iconElement.addEventListener('mouseenter', mouseenterHandler);
        iconElement.addEventListener('mouseleave', mouseleaveHandler);
        
        // 如果提供了点击外部关闭回调，注册点击事件
        let clickOutsideHandlerId = null;
        if (onClickOutside && typeof onClickOutside === 'function') {
            const clickHandler = (e, eventContext) => {
                // 检查点击是否在图标或选择器内
                const selectorInfo = EventManager._registeredSelectors.get(selectorId);
                if (!selectorInfo) {
                    return;
                }
                
                const { iconElement: icon, selectorElement: selector } = selectorInfo;
                const clickedInIcon = icon && (icon === e.target || icon.contains(e.target));
                const clickedInSelector = selector && (selector === e.target || selector.contains(e.target));
                
                // 如果点击在选择器内，不触发 onClickOutside
                // 注意：选择器内的点击事件应该已经使用了 stopImmediatePropagation，但这里作为双重保险
                if (clickedInSelector) {
                    // 如果事件已经被停止（可能是选择器内的点击处理程序），不处理
                    if (eventContext && eventContext.stopped) {
                        return;
                    }
                }
                
                if (!clickedInIcon && !clickedInSelector) {
                    try {
                        onClickOutside(e);
                    } catch (error) {
                        KernelLogger.error("EventManager", `多任务选择器点击外部回调执行失败: ${selectorId}`, error);
                    }
                }
            };
            
            clickOutsideHandlerId = EventManager.registerEventHandler(exploitPid, 'click', clickHandler, {
                priority: 50,
                useCapture: true
            });
        }
        
        // 保存选择器信息
        EventManager._registeredSelectors.set(selectorId, {
            iconElement,
            selectorElement,
            onShow,
            onHide,
            onClickOutside,
            showDelay,
            hideDelay,
            showTimer,
            hideTimer,
            mouseenterHandler,
            mouseleaveHandler,
            handlerIds: clickOutsideHandlerId ? [clickOutsideHandlerId] : []
        });
        
        KernelLogger.debug("EventManager", `多任务选择器已注册: ${selectorId}`);
    }
    
    /**
     * 更新多任务选择器的选择器元素
     * @param {string} selectorId 选择器唯一标识
     * @param {HTMLElement} selectorElement 新的选择器元素
     */
    static updateSelectorElement(selectorId, selectorElement) {
        const selectorInfo = EventManager._registeredSelectors.get(selectorId);
        if (selectorInfo) {
            // 清理旧的选择器元素上的事件监听器
            if (selectorInfo.selectorElement && selectorInfo.selectorElement !== selectorElement) {
                if (selectorInfo.selectorMouseenterHandler) {
                    selectorInfo.selectorElement.removeEventListener('mouseenter', selectorInfo.selectorMouseenterHandler);
                }
                if (selectorInfo.selectorMouseleaveHandler) {
                    selectorInfo.selectorElement.removeEventListener('mouseleave', selectorInfo.selectorMouseleaveHandler);
                }
            }
            
            selectorInfo.selectorElement = selectorElement;
            
            // 如果选择器元素存在，也需要绑定 mouseenter/mouseleave
            if (selectorElement) {
                // 清除之前的定时器
                if (selectorInfo.showTimer) {
                    clearTimeout(selectorInfo.showTimer);
                    selectorInfo.showTimer = null;
                }
                if (selectorInfo.hideTimer) {
                    clearTimeout(selectorInfo.hideTimer);
                    selectorInfo.hideTimer = null;
                }
                
                // 在选择器元素上也绑定 mouseenter/mouseleave，防止鼠标移动到选择器上时隐藏
                const mouseenterOnSelector = () => {
                    // 清除隐藏定时器
                    if (selectorInfo.hideTimer) {
                        clearTimeout(selectorInfo.hideTimer);
                        selectorInfo.hideTimer = null;
                    }
                };
                
                const mouseleaveOnSelector = () => {
                    // 设置隐藏定时器
                    if (selectorInfo.hideTimer) {
                        clearTimeout(selectorInfo.hideTimer);
                    }
                    
                    selectorInfo.hideTimer = setTimeout(() => {
                        if (selectorInfo.onHide && typeof selectorInfo.onHide === 'function') {
                            try {
                                selectorInfo.onHide();
                            } catch (error) {
                                KernelLogger.error("EventManager", `多任务选择器隐藏回调执行失败: ${selectorId}`, error);
                            }
                        }
                        selectorInfo.hideTimer = null;
                    }, selectorInfo.hideDelay);
                };
                
                selectorElement.addEventListener('mouseenter', mouseenterOnSelector);
                selectorElement.addEventListener('mouseleave', mouseleaveOnSelector);
                
                // 保存处理器引用以便后续清理
                selectorInfo.selectorMouseenterHandler = mouseenterOnSelector;
                selectorInfo.selectorMouseleaveHandler = mouseleaveOnSelector;
            } else {
                // 如果选择器元素为 null，清理处理器引用
                selectorInfo.selectorMouseenterHandler = null;
                selectorInfo.selectorMouseleaveHandler = null;
            }
            
            KernelLogger.debug("EventManager", `选择器元素已更新: ${selectorId}`);
        } else {
            KernelLogger.warn("EventManager", `未找到要更新的多任务选择器: ${selectorId}`);
        }
    }
    
    /**
     * 注销多任务选择器
     * @param {string} selectorId 选择器唯一标识
     */
    static unregisterSelector(selectorId) {
        const selectorInfo = EventManager._registeredSelectors.get(selectorId);
        if (selectorInfo) {
            // 清除定时器
            if (selectorInfo.showTimer) {
                clearTimeout(selectorInfo.showTimer);
            }
            if (selectorInfo.hideTimer) {
                clearTimeout(selectorInfo.hideTimer);
            }
            
            // 移除事件监听器
            if (selectorInfo.iconElement && selectorInfo.mouseenterHandler) {
                selectorInfo.iconElement.removeEventListener('mouseenter', selectorInfo.mouseenterHandler);
            }
            if (selectorInfo.iconElement && selectorInfo.mouseleaveHandler) {
                selectorInfo.iconElement.removeEventListener('mouseleave', selectorInfo.mouseleaveHandler);
            }
            
            if (selectorInfo.selectorElement && selectorInfo.selectorMouseenterHandler) {
                selectorInfo.selectorElement.removeEventListener('mouseenter', selectorInfo.selectorMouseenterHandler);
            }
            if (selectorInfo.selectorElement && selectorInfo.selectorMouseleaveHandler) {
                selectorInfo.selectorElement.removeEventListener('mouseleave', selectorInfo.selectorMouseleaveHandler);
            }
            
            // 注销点击外部事件处理程序
            if (selectorInfo.handlerIds && selectorInfo.handlerIds.length > 0) {
                for (const handlerId of selectorInfo.handlerIds) {
                    EventManager.unregisterEventHandler(handlerId);
                }
            }
            
            EventManager._registeredSelectors.delete(selectorId);
            KernelLogger.debug("EventManager", `多任务选择器已注销: ${selectorId}`);
        } else {
            KernelLogger.debug("EventManager", `未找到要注销的多任务选择器: ${selectorId}`);
        }
    }
    
    // ==================== 清理 ====================
    
    /**
     * 清理所有注册的事件
     */
    static clearAll() {
        // 注销所有选择器
        for (const selectorId of EventManager._registeredSelectors.keys()) {
            EventManager.unregisterSelector(selectorId);
        }
        
        EventManager._eventHandlers.clear();
        EventManager._pidToHandlers.clear();
        EventManager._registeredMenus.clear();
        EventManager._registeredDrags.clear();
        EventManager._registeredResizers.clear();
        EventManager._registeredSelectors.clear();
        
        // 清理所有元素特定事件
        if (EventManager._elementEventHandlers) {
            const handlerIds = Array.from(EventManager._elementEventHandlers.keys());
            for (const handlerId of handlerIds) {
                EventManager.unregisterElementEvent(handlerId);
            }
            EventManager._elementEventHandlers.clear();
        }
        
        KernelLogger.debug("EventManager", "所有事件已清理");
    }
    
    /**
     * 销毁事件管理器
     */
    static destroy() {
        // 移除所有全局事件监听器
        for (const [listenerKey, listenerInfo] of EventManager._globalListeners) {
            const { listener, options, target } = listenerInfo;
            const eventType = listenerKey.split('_')[0];
            
            try {
                // 确定目标对象
                const targetObj = (target === 'window' && typeof window !== 'undefined') 
                    ? window 
                    : document;
                
                if (options && typeof options === 'object') {
                    targetObj.removeEventListener(eventType, listener, options);
                } else {
                    const useCapture = listenerKey.includes('_true');
                    targetObj.removeEventListener(eventType, listener, useCapture);
                }
            } catch (error) {
                KernelLogger.warn("EventManager", `移除全局事件监听器失败: ${eventType}`, error);
            }
        }
        EventManager._globalListeners.clear();
        
        EventManager.clearAll();
        EventManager._initialized = false;
        EventManager._addEventListenerIntercepted = false;
        KernelLogger.info("EventManager", "事件管理器已销毁");
    }
    
    // ==================== 调试和统计 ====================
    
    /**
     * 获取事件统计信息（用于调试）
     * @returns {Object} 统计信息
     */
    static getStats() {
        const stats = {
            totalEventTypes: EventManager._eventHandlers.size,
            totalHandlers: 0,
            handlersByEventType: {},
            handlersByPid: {},
            globalListeners: EventManager._globalListeners.size
        };
        
        for (const [eventType, handlers] of EventManager._eventHandlers) {
            stats.totalHandlers += handlers.length;
            stats.handlersByEventType[eventType] = handlers.length;
            
            for (const handler of handlers) {
                const pid = handler.pid;
                if (!stats.handlersByPid[pid]) {
                    stats.handlersByPid[pid] = 0;
                }
                stats.handlersByPid[pid]++;
            }
        }
        
        return stats;
    }
    
    /**
     * 获取指定事件类型的所有处理程序信息（用于调试）
     * @param {string} eventType 事件类型
     * @returns {Array} 处理程序信息数组
     */
    static getHandlersForEvent(eventType) {
        const handlers = EventManager._eventHandlers.get(eventType);
        if (!handlers) {
            return [];
        }
        
        return handlers.map(h => ({
            handlerId: h.handlerId,
            pid: h.pid,
            priority: h.priority,
            selector: h.selector,
            stopPropagation: h.stopPropagation,
            once: h.once,
            passive: h.passive,
            useCapture: h.useCapture
        }));
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

// 导出到全局
if (typeof window !== 'undefined') {
    window.EventManager = EventManager;
} else if (typeof globalThis !== 'undefined') {
    globalThis.EventManager = EventManager;
}

