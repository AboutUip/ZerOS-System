// 拖拽驱动管理器
// 负责管理系统级的拖拽功能，包括元素拖拽、文件拖拽、窗口拖拽等
// 提供统一的拖拽 API 供程序使用

KernelLogger.info("DragDrive", "模块初始化");

class DragDrive {
    // ==================== 常量定义 ====================
    
    /**
     * 拖拽类型枚举
     */
    static DRAG_TYPE = {
        ELEMENT: 'ELEMENT',           // 元素拖拽
        FILE: 'FILE',                 // 文件拖拽
        WINDOW: 'WINDOW',             // 窗口拖拽
        CUSTOM: 'CUSTOM'              // 自定义拖拽
    };
    
    /**
     * 拖拽状态枚举
     */
    static DRAG_STATE = {
        IDLE: 'IDLE',                // 空闲
        STARTING: 'STARTING',         // 开始拖拽
        DRAGGING: 'DRAGGING',         // 拖拽中
        DROPPING: 'DROPPING',         // 放置中
        COMPLETED: 'COMPLETED',       // 完成
        CANCELLED: 'CANCELLED'        // 取消
    };
    
    // ==================== 内部状态 ====================
    
    /**
     * 当前活动的拖拽会话
     * Map<dragId, DragSession>
     */
    static _activeDrags = new Map();
    
    /**
     * 拖拽 ID 计数器
     */
    static _dragIdCounter = 0;
    
    /**
     * 全局拖拽事件监听器状态
     */
    static _globalListenersRegistered = false;
    
    /**
     * 拖拽会话数据结构
     * @typedef {Object} DragSession
     * @property {string} dragId - 拖拽会话 ID
     * @property {number} pid - 发起拖拽的进程 ID
     * @property {string} dragType - 拖拽类型
     * @property {HTMLElement} sourceElement - 源元素
     * @property {Object} dragData - 拖拽数据
     * @property {string} state - 当前状态
     * @property {HTMLElement|null} dropTarget - 当前放置目标
     * @property {Function|null} onDragStart - 拖拽开始回调
     * @property {Function|null} onDrag - 拖拽中回调
     * @property {Function|null} onDragEnd - 拖拽结束回调
     * @property {Function|null} onDrop - 放置回调
     * @property {Object} options - 拖拽选项
     */
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化拖拽驱动
     */
    static init() {
        if (DragDrive._globalListenersRegistered) {
            KernelLogger.debug("DragDrive", "全局拖拽监听器已注册，跳过初始化");
            return;
        }
        
        KernelLogger.info("DragDrive", "初始化拖拽驱动");
        
        // 注册全局拖拽事件监听器
        DragDrive._registerGlobalListeners();
        
        DragDrive._globalListenersRegistered = true;
        KernelLogger.info("DragDrive", "拖拽驱动初始化完成");
    }
    
    /**
     * 注册全局拖拽事件监听器
     */
    static _registerGlobalListeners() {
        // 监听全局拖拽事件，用于处理跨窗口拖拽
        document.addEventListener('dragover', (e) => {
            // 允许放置
            e.preventDefault();
        }, { passive: false });
        
        document.addEventListener('drop', (e) => {
            // 防止默认行为
            e.preventDefault();
        }, { passive: false });
        
        KernelLogger.debug("DragDrive", "全局拖拽事件监听器已注册");
    }
    
    // ==================== 拖拽会话管理 ====================
    
    /**
     * 生成唯一的拖拽 ID
     * @returns {string} 拖拽 ID
     */
    static _generateDragId() {
        DragDrive._dragIdCounter++;
        return `drag_${Date.now()}_${DragDrive._dragIdCounter}`;
    }
    
    /**
     * 创建拖拽会话
     * @param {number} pid - 进程 ID
     * @param {HTMLElement} sourceElement - 源元素
     * @param {string} dragType - 拖拽类型
     * @param {Object} dragData - 拖拽数据
     * @param {Object} options - 拖拽选项
     * @returns {string} 拖拽会话 ID
     */
    static createDragSession(pid, sourceElement, dragType, dragData = {}, options = {}) {
        if (!sourceElement || !(sourceElement instanceof HTMLElement)) {
            throw new Error('DragDrive.createDragSession: sourceElement 必须是 HTMLElement');
        }
        
        if (!Object.values(DragDrive.DRAG_TYPE).includes(dragType)) {
            throw new Error(`DragDrive.createDragSession: 无效的拖拽类型: ${dragType}`);
        }
        
        const dragId = DragDrive._generateDragId();
        
        const session = {
            dragId: dragId,
            pid: pid,
            dragType: dragType,
            sourceElement: sourceElement,
            dragData: dragData,
            state: DragDrive.DRAG_STATE.IDLE,
            dropTarget: null,
            onDragStart: options.onDragStart || null,
            onDrag: options.onDrag || null,
            onDragEnd: options.onDragEnd || null,
            onDrop: options.onDrop || null,
            options: {
                cloneOnDrag: options.cloneOnDrag !== undefined ? options.cloneOnDrag : false,
                dragImage: options.dragImage || null,
                dragImageOffset: options.dragImageOffset || { x: 0, y: 0 },
                allowDrop: options.allowDrop || null,
                ...options
            }
        };
        
        DragDrive._activeDrags.set(dragId, session);
        
        KernelLogger.debug("DragDrive", `创建拖拽会话: ${dragId} (PID: ${pid}, 类型: ${dragType})`);
        
        return dragId;
    }
    
    /**
     * 获取拖拽会话
     * @param {string} dragId - 拖拽会话 ID
     * @returns {Object|null} 拖拽会话
     */
    static getDragSession(dragId) {
        return DragDrive._activeDrags.get(dragId) || null;
    }
    
    /**
     * 销毁拖拽会话
     * @param {string} dragId - 拖拽会话 ID
     */
    static destroyDragSession(dragId) {
        const session = DragDrive._activeDrags.get(dragId);
        if (session) {
            // 清理事件监听器
            if (session.sourceElement) {
                DragDrive._removeDragListeners(session.sourceElement, dragId);
            }
            
            DragDrive._activeDrags.delete(dragId);
            KernelLogger.debug("DragDrive", `销毁拖拽会话: ${dragId}`);
        }
    }
    
    /**
     * 清理进程的所有拖拽会话
     * @param {number} pid - 进程 ID
     */
    static cleanupProcessDrags(pid) {
        const dragsToRemove = [];
        for (const [dragId, session] of DragDrive._activeDrags) {
            if (session.pid === pid) {
                dragsToRemove.push(dragId);
            }
        }
        
        for (const dragId of dragsToRemove) {
            DragDrive.destroyDragSession(dragId);
        }
        
        if (dragsToRemove.length > 0) {
            KernelLogger.info("DragDrive", `清理进程 ${pid} 的 ${dragsToRemove.length} 个拖拽会话`);
        }
    }
    
    // ==================== 拖拽事件处理 ====================
    
    /**
     * 为元素启用拖拽
     * @param {string} dragId - 拖拽会话 ID
     * @returns {boolean} 是否成功
     */
    static enableDrag(dragId) {
        const session = DragDrive.getDragSession(dragId);
        if (!session) {
            KernelLogger.warn("DragDrive", `拖拽会话不存在: ${dragId}`);
            return false;
        }
        
        if (session.state !== DragDrive.DRAG_STATE.IDLE) {
            KernelLogger.warn("DragDrive", `拖拽会话状态不正确: ${dragId}, 状态: ${session.state}`);
            return false;
        }
        
        const element = session.sourceElement;
        
        // 设置可拖拽属性
        element.draggable = true;
        element.dataset.dragId = dragId;
        
        // 添加拖拽事件监听器
        DragDrive._addDragListeners(element, dragId);
        
        KernelLogger.debug("DragDrive", `为元素启用拖拽: ${dragId}`);
        return true;
    }
    
    /**
     * 为元素禁用拖拽
     * @param {string} dragId - 拖拽会话 ID
     */
    static disableDrag(dragId) {
        const session = DragDrive.getDragSession(dragId);
        if (!session) {
            return;
        }
        
        const element = session.sourceElement;
        if (element) {
            element.draggable = false;
            delete element.dataset.dragId;
            DragDrive._removeDragListeners(element, dragId);
        }
        
        KernelLogger.debug("DragDrive", `为元素禁用拖拽: ${dragId}`);
    }
    
    /**
     * 添加拖拽事件监听器
     * @param {HTMLElement} element - 元素
     * @param {string} dragId - 拖拽会话 ID
     */
    static _addDragListeners(element, dragId) {
        // 使用命名空间避免冲突
        const namespace = `dragdrive_${dragId}`;
        
        // 拖拽开始
        const handleDragStart = (e) => {
            const session = DragDrive.getDragSession(dragId);
            if (!session) {
                e.preventDefault();
                return;
            }
            
            session.state = DragDrive.DRAG_STATE.STARTING;
            
            // 设置拖拽数据
            const dataTransfer = e.dataTransfer;
            dataTransfer.effectAllowed = 'move';
            dataTransfer.setData('application/x-zeros-drag', JSON.stringify({
                dragId: dragId,
                dragType: session.dragType,
                pid: session.pid,
                data: session.dragData
            }));
            
            // 设置拖拽图像
            if (session.options.dragImage) {
                const img = session.options.dragImage;
                const offset = session.options.dragImageOffset;
                dataTransfer.setDragImage(img, offset.x, offset.y);
            } else if (session.options.cloneOnDrag) {
                // 克隆元素作为拖拽图像
                const clone = element.cloneNode(true);
                clone.style.position = 'absolute';
                clone.style.top = '-9999px';
                document.body.appendChild(clone);
                dataTransfer.setDragImage(clone, 0, 0);
                setTimeout(() => document.body.removeChild(clone), 0);
            }
            
            // 调用回调
            if (session.onDragStart) {
                try {
                    session.onDragStart(e, session);
                } catch (error) {
                    KernelLogger.error("DragDrive", `onDragStart 回调执行失败: ${error.message}`, error);
                }
            }
            
            session.state = DragDrive.DRAG_STATE.DRAGGING;
            KernelLogger.debug("DragDrive", `拖拽开始: ${dragId}`);
        };
        
        // 拖拽中
        const handleDrag = (e) => {
            const session = DragDrive.getDragSession(dragId);
            if (!session || session.state !== DragDrive.DRAG_STATE.DRAGGING) {
                return;
            }
            
            // 查找放置目标
            const dropTarget = DragDrive._findDropTarget(e, session);
            if (dropTarget !== session.dropTarget) {
                // 目标改变
                if (session.dropTarget) {
                    DragDrive._handleDragLeave(session.dropTarget, session);
                }
                session.dropTarget = dropTarget;
                if (dropTarget) {
                    DragDrive._handleDragEnter(dropTarget, session);
                }
            }
            
            // 调用回调
            if (session.onDrag) {
                try {
                    session.onDrag(e, session);
                } catch (error) {
                    KernelLogger.error("DragDrive", `onDrag 回调执行失败: ${error.message}`, error);
                }
            }
        };
        
        // 拖拽结束
        const handleDragEnd = (e) => {
            const session = DragDrive.getDragSession(dragId);
            if (!session) {
                return;
            }
            
            session.state = DragDrive.DRAG_STATE.DROPPING;
            
            // 清理放置目标
            if (session.dropTarget) {
                DragDrive._handleDragLeave(session.dropTarget, session);
                session.dropTarget = null;
            }
            
            // 调用回调
            if (session.onDragEnd) {
                try {
                    session.onDragEnd(e, session);
                } catch (error) {
                    KernelLogger.error("DragDrive", `onDragEnd 回调执行失败: ${error.message}`, error);
                }
            }
            
            // 根据是否成功放置决定状态
            if (e.dataTransfer.dropEffect === 'move' || e.dataTransfer.dropEffect === 'copy') {
                session.state = DragDrive.DRAG_STATE.COMPLETED;
            } else {
                session.state = DragDrive.DRAG_STATE.CANCELLED;
            }
            
            KernelLogger.debug("DragDrive", `拖拽结束: ${dragId}, 状态: ${session.state}`);
        };
        
        // 绑定事件（使用命名空间存储引用，便于移除）
        element[`_${namespace}_dragstart`] = handleDragStart;
        element[`_${namespace}_drag`] = handleDrag;
        element[`_${namespace}_dragend`] = handleDragEnd;
        
        element.addEventListener('dragstart', handleDragStart);
        element.addEventListener('drag', handleDrag);
        element.addEventListener('dragend', handleDragEnd);
    }
    
    /**
     * 移除拖拽事件监听器
     * @param {HTMLElement} element - 元素
     * @param {string} dragId - 拖拽会话 ID
     */
    static _removeDragListeners(element, dragId) {
        const namespace = `dragdrive_${dragId}`;
        
        const dragstart = element[`_${namespace}_dragstart`];
        const drag = element[`_${namespace}_drag`];
        const dragend = element[`_${namespace}_dragend`];
        
        if (dragstart) {
            element.removeEventListener('dragstart', dragstart);
            delete element[`_${namespace}_dragstart`];
        }
        if (drag) {
            element.removeEventListener('drag', drag);
            delete element[`_${namespace}_drag`];
        }
        if (dragend) {
            element.removeEventListener('dragend', dragend);
            delete element[`_${namespace}_dragend`];
        }
    }
    
    /**
     * 查找放置目标
     * @param {DragEvent} e - 拖拽事件
     * @param {Object} session - 拖拽会话
     * @returns {HTMLElement|null} 放置目标元素
     */
    static _findDropTarget(e, session) {
        // 从事件目标向上查找带有 data-drop-zone 属性的元素
        let element = e.target;
        while (element && element !== document.body) {
            if (element.dataset && element.dataset.dropZone) {
                // 检查是否允许放置
                if (session.options.allowDrop) {
                    try {
                        if (session.options.allowDrop(element, session)) {
                            return element;
                        }
                    } catch (error) {
                        KernelLogger.error("DragDrive", `allowDrop 回调执行失败: ${error.message}`, error);
                    }
                } else {
                    return element;
                }
            }
            element = element.parentElement;
        }
        return null;
    }
    
    /**
     * 处理拖拽进入
     * @param {HTMLElement} element - 目标元素
     * @param {Object} session - 拖拽会话
     */
    static _handleDragEnter(element, session) {
        element.classList.add('drag-over');
        
        // 触发自定义事件
        const event = new CustomEvent('zeros-dragenter', {
            detail: { session: session },
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(event);
    }
    
    /**
     * 处理拖拽离开
     * @param {HTMLElement} element - 目标元素
     * @param {Object} session - 拖拽会话
     */
    static _handleDragLeave(element, session) {
        element.classList.remove('drag-over');
        
        // 触发自定义事件
        const event = new CustomEvent('zeros-dragleave', {
            detail: { session: session },
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(event);
    }
    
    // ==================== 放置区域管理 ====================
    
    /**
     * 注册放置区域
     * @param {HTMLElement} element - 放置区域元素
     * @param {Object} options - 选项
     * @returns {boolean} 是否成功
     */
    static registerDropZone(element, options = {}) {
        if (!element || !(element instanceof HTMLElement)) {
            throw new Error('DragDrive.registerDropZone: element 必须是 HTMLElement');
        }
        
        // 标记为放置区域
        element.dataset.dropZone = 'true';
        
        // 添加放置事件监听器
        const handleDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // 获取拖拽数据
            const dragDataStr = e.dataTransfer.getData('application/x-zeros-drag');
            if (!dragDataStr) {
                return;
            }
            
            try {
                const dragData = JSON.parse(dragDataStr);
                const session = DragDrive.getDragSession(dragData.dragId);
                
                if (session && session.onDrop) {
                    session.state = DragDrive.DRAG_STATE.DROPPING;
                    try {
                        session.onDrop(e, session, element);
                    } catch (error) {
                        KernelLogger.error("DragDrive", `onDrop 回调执行失败: ${error.message}`, error);
                    }
                }
                
                // 触发自定义事件
                const event = new CustomEvent('zeros-drop', {
                    detail: { 
                        session: session,
                        dragData: dragData,
                        dropTarget: element
                    },
                    bubbles: true,
                    cancelable: true
                });
                element.dispatchEvent(event);
            } catch (error) {
                KernelLogger.error("DragDrive", `处理放置事件失败: ${error.message}`, error);
            }
        };
        
        const handleDragOver = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        };
        
        element.addEventListener('drop', handleDrop);
        element.addEventListener('dragover', handleDragOver);
        
        // 存储引用以便后续移除
        element._zerosDropHandler = handleDrop;
        element._zerosDragOverHandler = handleDragOver;
        
        KernelLogger.debug("DragDrive", `注册放置区域: ${element.tagName}#${element.id || 'unknown'}`);
        return true;
    }
    
    /**
     * 注销放置区域
     * @param {HTMLElement} element - 放置区域元素
     */
    static unregisterDropZone(element) {
        if (!element || !(element instanceof HTMLElement)) {
            return;
        }
        
        delete element.dataset.dropZone;
        
        if (element._zerosDropHandler) {
            element.removeEventListener('drop', element._zerosDropHandler);
            delete element._zerosDropHandler;
        }
        
        if (element._zerosDragOverHandler) {
            element.removeEventListener('dragover', element._zerosDragOverHandler);
            delete element._zerosDragOverHandler;
        }
        
        element.classList.remove('drag-over');
        
        KernelLogger.debug("DragDrive", `注销放置区域: ${element.tagName}#${element.id || 'unknown'}`);
    }
    
    // ==================== 工具方法 ====================
    
    /**
     * 获取进程的所有拖拽会话
     * @param {number} pid - 进程 ID
     * @returns {Array<Object>} 拖拽会话列表
     */
    static getProcessDrags(pid) {
        const drags = [];
        for (const [dragId, session] of DragDrive._activeDrags) {
            if (session.pid === pid) {
                drags.push(session);
            }
        }
        return drags;
    }
    
    /**
     * 获取所有活动的拖拽会话
     * @returns {Array<Object>} 拖拽会话列表
     */
    static getAllActiveDrags() {
        return Array.from(DragDrive._activeDrags.values());
    }
}

// 初始化拖拽驱动
if (typeof document !== 'undefined') {
    // 等待 DOM 加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            DragDrive.init();
        });
    } else {
        DragDrive.init();
    }
}

// 导出到 POOL（如果可用）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "DragDrive", DragDrive);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.DragDrive = DragDrive;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.DragDrive = DragDrive;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.DragDrive = DragDrive;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.DragDrive = DragDrive;
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/drive/dragDrive.js");
}
