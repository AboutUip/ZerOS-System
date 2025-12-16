// GUI管理器：统一管理所有GUI程序的窗口层叠显示和焦点管理
// 提供统一的窗口样式和控件（最小化、最大化、关闭）

KernelLogger.info("GUIManager", "模块初始化");

class GUIManager {
    // 窗口z-index管理
    static _baseZIndex = 1000;
    static _currentZIndex = 1000;
    static _maxZIndex = 99999;  // 最大z-index（任务栏是99999，确保窗口在任务栏下方）
    
    // 窗口注册表 Map<windowId, WindowInfo>
    // WindowInfo: { windowId: string, window: HTMLElement, pid: number, zIndex: number, isFocused: boolean, isMinimized: boolean, isMaximized: boolean, title: string, icon: string, createdAt: number, logs: Array }
    static _windows = new Map();
    
    // PID到窗口ID的映射 Map<pid, Set<windowId>>
    static _pidToWindows = new Map();
    
    // 焦点窗口ID
    static _focusedWindowId = null;
    
    // 模态对话框管理
    static _modalDialogs = new Set(); // 存储所有活动的模态对话框
    
    // 窗口日志记录
    static _windowLogs = new Map(); // Map<windowId, Array<LogEntry>>
    
    // 下一个窗口ID计数器
    static _nextWindowId = 1;
    
    /**
     * 初始化GUIManager
     */
    static init() {
        if (GUIManager._initialized) {
            return;
        }
        
        GUIManager._initialized = true;
        
        // 监听风格变更，更新窗口控制按钮图标和窗口样式
        if (typeof ThemeManager !== 'undefined') {
            ThemeManager.onStyleChange((styleId, style) => {
                KernelLogger.info("GUIManager", `风格已切换: ${styleId}，更新窗口控制按钮图标和样式`);
                GUIManager._updateWindowControlIcons().catch(e => {
                    KernelLogger.warn("GUIManager", `更新窗口控制按钮图标失败: ${e.message}`);
                });
                GUIManager._updateAllWindowsStyles();
            });
            
            // 监听主题变更，更新窗口背景色
            ThemeManager.onThemeChange((themeId, theme) => {
                KernelLogger.info("GUIManager", `主题已切换: ${themeId}，更新窗口背景色`);
                GUIManager._updateAllWindowsStyles();
            });
        }
        
        // 注册到POOL
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                    POOL.__INIT__("KERNEL_GLOBAL_POOL");
                }
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "GUIManager", GUIManager);
            } catch (e) {
                KernelLogger.warn("GUIManager", `注册到POOL失败: ${e.message}`);
            }
        }
        
        KernelLogger.info("GUIManager", "GUI管理器初始化完成");
    }
    
    /**
     * 生成窗口ID
     * @param {number} pid 进程ID
     * @returns {string} 窗口ID
     */
    static _generateWindowId(pid) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `window_${pid}_${timestamp}_${random}`;
    }
    
    /**
     * 记录窗口日志
     * @param {string} windowId 窗口ID
     * @param {string} action 操作类型
     * @param {string} message 日志消息
     * @param {Object} data 附加数据
     */
    static _logWindowAction(windowId, action, message, data = null) {
        if (!GUIManager._windowLogs.has(windowId)) {
            GUIManager._windowLogs.set(windowId, []);
        }
        
        const logEntry = {
            timestamp: Date.now(),
            action: action,
            message: message,
            data: data
        };
        
        GUIManager._windowLogs.get(windowId).push(logEntry);
        
        // 限制日志数量（最多保留1000条）
        const logs = GUIManager._windowLogs.get(windowId);
        if (logs.length > 1000) {
            logs.shift();
        }
        
        // 同时输出到KernelLogger
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug("GUIManager", `[窗口 ${windowId}] ${action}: ${message}`, data);
        }
    }
    
    /**
     * 获取窗口日志
     * @param {string} windowId 窗口ID
     * @param {Object} options 选项 { limit: number, action: string }
     * @returns {Array} 日志条目数组
     */
    static getWindowLogs(windowId, options = {}) {
        if (!GUIManager._windowLogs.has(windowId)) {
            return [];
        }
        
        let logs = [...GUIManager._windowLogs.get(windowId)];
        
        // 按操作类型过滤
        if (options.action) {
            logs = logs.filter(log => log.action === options.action);
        }
        
        // 限制数量
        if (options.limit) {
            logs = logs.slice(-options.limit);
        }
        
        return logs;
    }
    
    /**
     * 注册窗口
     * @param {number} pid 进程ID
     * @param {HTMLElement} windowElement 窗口元素
     * @param {Object} options 选项 { title: string, icon: string, onClose: Function, onMinimize: Function, onMaximize: Function, windowId: string }
     * @returns {Object} 窗口信息对象
     */
    static registerWindow(pid, windowElement, options = {}) {
        GUIManager.init();
        
        if (!pid || !windowElement) {
            KernelLogger.warn("GUIManager", "注册窗口失败：参数不完整");
            return null;
        }
        
        // 生成或使用提供的窗口ID
        const windowId = options.windowId || GUIManager._generateWindowId(pid);
        
        // 如果窗口ID已存在，先注销
        if (GUIManager._windows.has(windowId)) {
            GUIManager.unregisterWindow(windowId);
        }
        
        // 分配z-index（确保新窗口在最前）
        // 查找当前所有窗口的最大z-index
        let maxZIndex = GUIManager._baseZIndex;
        for (const [existingWindowId, existingInfo] of GUIManager._windows) {
            if (existingInfo.zIndex > maxZIndex) {
                maxZIndex = existingInfo.zIndex;
            }
        }
        
        // 新窗口的z-index应该比当前最大z-index大
        GUIManager._currentZIndex = maxZIndex + 1;
        
        // 如果超过最大值，重新分配所有窗口的z-index
        if (GUIManager._currentZIndex >= GUIManager._maxZIndex) {
            // 重新分配所有窗口的z-index，保持相对顺序
            const sortedWindows = Array.from(GUIManager._windows.entries())
                .sort((a, b) => a[1].zIndex - b[1].zIndex);
            
            let newZIndex = GUIManager._baseZIndex + 1;
            for (const [wid, info] of sortedWindows) {
                info.zIndex = newZIndex;
                // 立即更新DOM中的z-index，确保立即生效
                if (info.window && info.window.style) {
                    info.window.style.zIndex = newZIndex.toString();
                }
                newZIndex++;
            }
            
            GUIManager._currentZIndex = newZIndex;
        }
        
        // 判断是否是主窗口（第一个窗口是主窗口）
        const existingWindows = GUIManager.getWindowsByPid(pid);
        const isMainWindow = existingWindows.length === 0;
        
        const windowInfo = {
            windowId: windowId,
            window: windowElement,
            pid: pid,
            zIndex: GUIManager._currentZIndex,
            isFocused: false,
            isMinimized: false,
            isMaximized: false,
            isMainWindow: isMainWindow, // 标记是否为主窗口
            title: options.title || '窗口',
            icon: options.icon || null,
            onClose: options.onClose || null,
            onMinimize: options.onMinimize || null,
            onMaximize: options.onMaximize || null,
            createdAt: Date.now(),
            logs: [],
            windowState: {
                savedLeft: null,
                savedTop: null,
                savedWidth: null,
                savedHeight: null,
                savedTransform: null
            }
        };
        
        // 设置窗口ID到元素
        windowElement.dataset.windowId = windowId;
        windowElement.dataset.pid = pid.toString();
        
        // 设置初始z-index（确保覆盖任何内联样式）
        windowElement.style.zIndex = windowInfo.zIndex.toString();
        // 确保z-index立即生效
        windowElement.style.display = windowElement.style.display || '';
        
        // 确保窗口有position属性（如果还没有）
        const computedStyle = getComputedStyle(windowElement);
        if (!computedStyle.position || computedStyle.position === 'static') {
            windowElement.style.position = 'fixed';
        }
        
        // 计算并设置窗口位置，确保窗口始终在屏幕内
        GUIManager._calculateAndSetWindowPosition(windowElement);
        
        // 设置窗口的初始背景色和样式（优先使用风格系统）
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                const currentStyle = themeManager.getCurrentStyle();
                
                // 优先使用风格系统中的窗口样式
                if (currentStyle && currentStyle.styles && currentStyle.styles.window) {
                    const windowStyle = currentStyle.styles.window;
                    // 检查风格ID或主题ID是否为'glass'
                    const isGlassStyle = currentStyle.id === 'glass' || (currentTheme && currentTheme.id === 'glass');
                    windowElement.style.borderRadius = windowStyle.borderRadius;
                    windowElement.style.borderWidth = windowStyle.borderWidth;
                    
                    // 处理 backdrop-filter（使用 !important 确保覆盖 CSS 默认值）
                    // 如果不是玻璃风格，强制删除backdrop-filter
                    if (isGlassStyle && windowStyle.backdropFilter && windowStyle.backdropFilter !== 'none') {
                        windowElement.style.setProperty('backdrop-filter', windowStyle.backdropFilter, 'important');
                        windowElement.style.setProperty('-webkit-backdrop-filter', windowStyle.backdropFilter, 'important');
                        // 有 backdrop-filter，背景设置为透明
                        windowElement.style.setProperty('background-color', 'transparent', 'important');
                    } else {
                        // 不是玻璃风格或没有 backdrop-filter，设置为 'none'（使用 !important）
                        windowElement.style.setProperty('backdrop-filter', 'none', 'important');
                        windowElement.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                        // 可以正常设置背景色
                        if (currentTheme && currentTheme.colors) {
                            const windowBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                            windowElement.style.setProperty('background-color', windowBg, 'important');
                        }
                    }
                    
                    // 根据焦点状态应用不同的阴影
                    if (windowElement.classList.contains('zos-window-focused')) {
                        windowElement.style.boxShadow = windowStyle.boxShadowFocused || windowStyle.boxShadow;
                    } else {
                        windowElement.style.boxShadow = windowStyle.boxShadowUnfocused || windowStyle.boxShadow;
                        windowElement.style.opacity = windowStyle.opacityUnfocused || '1';
                    }
                    
                    // 设置边框颜色
                    if (currentTheme && currentTheme.colors) {
                        const borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '40' : 'rgba(139, 92, 246, 0.25)');
                        windowElement.style.borderColor = borderColor;
                    }
                } else if (currentTheme && currentTheme.colors) {
                    // 回退到主题背景色（如果没有风格系统）
                    // 检查风格ID或主题ID是否为'glass'
                    const isGlassStyle = (currentStyle && currentStyle.id === 'glass') || (currentTheme && currentTheme.id === 'glass');
                    if (!isGlassStyle) {
                        windowElement.style.setProperty('backdrop-filter', 'none', 'important');
                        windowElement.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                    }
                    const windowBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                    windowElement.style.setProperty('background-color', windowBg, 'important');
                    const borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '40' : 'rgba(139, 92, 246, 0.25)');
                    windowElement.style.setProperty('border-color', borderColor, 'important');
                }
            } catch (e) {
                KernelLogger.warn("GUIManager", `设置窗口初始样式失败: ${e.message}`);
            }
        }
        
        // 如果窗口没有设置位置，使用默认居中位置（但确保在屏幕内）
        if (!windowElement.style.left && !windowElement.style.top && 
            !windowElement.style.right && !windowElement.style.bottom) {
            // 延迟计算，确保窗口尺寸已确定
            requestAnimationFrame(() => {
                GUIManager._setDefaultWindowPosition(windowElement);
            });
        }
        
        // 添加统一的窗口类
        windowElement.classList.add('zos-gui-window');
        
        // 创建统一的标题栏（如果还没有）
        if (!windowElement.querySelector('.zos-window-titlebar')) {
            GUIManager._createTitleBar(windowElement, windowInfo, options);
        }
        
        // 注册窗口（使用windowId作为key）
        GUIManager._windows.set(windowId, windowInfo);
        
        // 更新PID到窗口ID的映射
        if (!GUIManager._pidToWindows.has(pid)) {
            GUIManager._pidToWindows.set(pid, new Set());
        }
        GUIManager._pidToWindows.get(pid).add(windowId);
        
        // 如果这是第一个窗口，标记为主窗口
        if (isMainWindow) {
            // 确保主窗口标记正确
            windowInfo.isMainWindow = true;
        } else {
            // 如果有其他窗口，确保它们不是主窗口
            const allWindows = GUIManager.getWindowsByPid(pid);
            if (allWindows.length > 1) {
                // 第一个窗口是主窗口，其他都是子窗口
                const sortedWindows = allWindows.sort((a, b) => a.createdAt - b.createdAt);
                sortedWindows.forEach((win, index) => {
                    win.isMainWindow = index === 0;
                });
            }
        }
        
        // 记录日志
        GUIManager._logWindowAction(windowId, 'REGISTER', '窗口已注册', {
            pid: pid,
            title: windowInfo.title,
            zIndex: windowInfo.zIndex,
            isMainWindow: windowInfo.isMainWindow
        });
        
        // 添加窗口打开动画（使用 AnimateManager）
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.addAnimationClasses(windowElement, 'WINDOW', 'OPEN');
        } else {
            // 降级方案：直接使用类名
            windowElement.classList.add('animate__animated', 'animate__fadeIn', 'animate__faster');
        }
        
        // 自动获得焦点
        GUIManager.focusWindow(windowId);
        
        KernelLogger.debug("GUIManager", `窗口已注册: WindowID ${windowId}, PID ${pid}, z-index: ${windowInfo.zIndex}, 主窗口: ${windowInfo.isMainWindow}`);
        
        return windowInfo;
    }
    
    /**
     * 计算并设置窗口位置，确保窗口始终在屏幕内
     * @param {HTMLElement} windowElement 窗口元素
     */
    static _calculateAndSetWindowPosition(windowElement) {
        if (!windowElement) return;
        
        const computedStyle = getComputedStyle(windowElement);
        const computedTransform = computedStyle.transform;
        const hasTransformCenter = (windowElement.style.transform && 
                                   windowElement.style.transform.includes('translate(-50%, -50%)')) ||
                                  (computedTransform && computedTransform !== 'none' && 
                                   computedTransform.includes('translate(-50%, -50%)'));
        const computedLeft = computedStyle.left;
        const computedTop = computedStyle.top;
        const hasPercentCenter = (windowElement.style.left === '50%' || windowElement.style.top === '50%') ||
                                (computedLeft === '50%' || computedTop === '50%') ||
                                (windowElement.style.left && windowElement.style.left.includes('calc(50%')) ||
                                (windowElement.style.top && windowElement.style.top.includes('calc(50%'));
        
        if (hasTransformCenter || hasPercentCenter) {
            // 获取窗口当前的实际位置（考虑transform）
            const rect = windowElement.getBoundingClientRect();
            const guiContainer = document.getElementById('gui-container');
            let containerRect = null;
            if (guiContainer) {
                containerRect = guiContainer.getBoundingClientRect();
            }
            
            // 清除transform和百分比定位，改用像素定位
            windowElement.style.transform = '';
            windowElement.style.left = '';
            windowElement.style.top = '';
            windowElement.style.right = '';
            windowElement.style.bottom = '';
            
            // 如果窗口已经在屏幕上，调整位置确保在屏幕内
            if (rect.width > 0 && rect.height > 0) {
                const winWidth = rect.width;
                const winHeight = rect.height;
                
                if (containerRect) {
                    // 相对于gui-container的位置
                    let left = rect.left - containerRect.left;
                    let top = rect.top - containerRect.top;
                    
                    // 确保窗口不会超出容器边界
                    const maxLeft = Math.max(0, containerRect.width - winWidth);
                    const maxTop = Math.max(0, containerRect.height - winHeight);
                    left = Math.max(0, Math.min(left, maxLeft));
                    top = Math.max(0, Math.min(top, maxTop));
                    
                    windowElement.style.left = `${left}px`;
                    windowElement.style.top = `${top}px`;
                } else {
                    // 相对于视口的位置
                    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
                    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                    
                    let left = rect.left;
                    let top = rect.top;
                    
                    // 确保窗口不会超出视口边界
                    const maxLeft = Math.max(0, viewportWidth - winWidth);
                    const maxTop = Math.max(0, viewportHeight - winHeight);
                    left = Math.max(0, Math.min(left, maxLeft));
                    top = Math.max(0, Math.min(top, maxTop));
                    
                    windowElement.style.left = `${left}px`;
                    windowElement.style.top = `${top}px`;
                }
            }
        } else {
            // 即使不是居中定位，也要确保窗口在屏幕内
            GUIManager._ensureWindowInViewport(windowElement);
        }
    }
    
    /**
     * 设置窗口默认位置（居中，但确保在屏幕内）
     * @param {HTMLElement} windowElement 窗口元素
     */
    static _setDefaultWindowPosition(windowElement) {
        if (!windowElement) return;
        
        const guiContainer = document.getElementById('gui-container');
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        
        // 获取窗口实际尺寸
        const rect = windowElement.getBoundingClientRect();
        const winWidth = rect.width || windowElement.offsetWidth || 800;
        const winHeight = rect.height || windowElement.offsetHeight || 600;
        
        // 获取任务栏位置和尺寸
        let taskbarPosition = 'bottom';
        let taskbarHeight = 0;
        let taskbarWidth = 0;
        try {
            if (typeof TaskbarManager !== 'undefined' && TaskbarManager._taskbarPosition) {
                taskbarPosition = TaskbarManager._taskbarPosition;
            }
        } catch (e) {
            // 忽略错误
        }
        
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            const taskbarRect = taskbar.getBoundingClientRect();
            taskbarHeight = taskbarRect.height || 60;
            taskbarWidth = taskbarRect.width || 60;
        }
        
        let defaultLeft = 0;
        let defaultTop = 0;
        
        if (guiContainer) {
            const containerRect = guiContainer.getBoundingClientRect();
            const containerWidth = containerRect.width;
            const containerHeight = containerRect.height;
            
            // 根据任务栏位置调整默认位置
            if (taskbarPosition === 'top') {
                defaultTop = taskbarHeight + 20; // 任务栏下方20px
            } else if (taskbarPosition === 'left') {
                defaultLeft = taskbarWidth + 20; // 任务栏右侧20px
            } else if (taskbarPosition === 'bottom') {
                // 从顶部开始，但考虑任务栏高度
                defaultTop = 20;
            } else if (taskbarPosition === 'right') {
                // 从左侧开始
                defaultLeft = 20;
            } else {
                defaultTop = 20;
            }
            
            // 计算居中位置（但确保在容器内）
            const centerLeft = (containerWidth - winWidth) / 2;
            const centerTop = (containerHeight - winHeight) / 2;
            
            // 使用居中位置，但如果超出边界则使用默认位置
            const maxLeft = Math.max(0, containerWidth - winWidth);
            const maxTop = Math.max(0, containerHeight - winHeight);
            
            defaultLeft = Math.max(defaultLeft, Math.min(centerLeft, maxLeft));
            defaultTop = Math.max(defaultTop, Math.min(centerTop, maxTop));
            
            // 确保不超出边界
            defaultLeft = Math.max(0, Math.min(defaultLeft, maxLeft));
            defaultTop = Math.max(0, Math.min(defaultTop, maxTop));
            
            windowElement.style.left = `${defaultLeft}px`;
            windowElement.style.top = `${defaultTop}px`;
        } else {
            // 没有gui-container，使用视口
            // 根据任务栏位置调整默认位置
            if (taskbarPosition === 'top') {
                defaultTop = taskbarHeight + 20;
            } else if (taskbarPosition === 'left') {
                defaultLeft = taskbarWidth + 20;
            } else {
                defaultTop = 20;
            }
            
            // 计算居中位置
            const centerLeft = (viewportWidth - winWidth) / 2;
            const centerTop = (viewportHeight - winHeight) / 2;
            
            // 确保窗口在视口内
            const maxLeft = Math.max(0, viewportWidth - winWidth);
            const maxTop = Math.max(0, viewportHeight - winHeight);
            
            defaultLeft = Math.max(defaultLeft, Math.min(centerLeft, maxLeft));
            defaultTop = Math.max(defaultTop, Math.min(centerTop, maxTop));
            
            // 确保不超出边界
            defaultLeft = Math.max(0, Math.min(defaultLeft, maxLeft));
            defaultTop = Math.max(0, Math.min(defaultTop, maxTop));
            
            windowElement.style.left = `${defaultLeft}px`;
            windowElement.style.top = `${defaultTop}px`;
        }
    }
    
    /**
     * 确保窗口在视口内（用于已设置位置的窗口）
     * @param {HTMLElement} windowElement 窗口元素
     */
    static _ensureWindowInViewport(windowElement) {
        if (!windowElement) return;
        
        const rect = windowElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        
        const winWidth = rect.width;
        const winHeight = rect.height;
        const guiContainer = document.getElementById('gui-container');
        
        let currentLeft = parseFloat(windowElement.style.left) || rect.left;
        let currentTop = parseFloat(windowElement.style.top) || rect.top;
        
        if (guiContainer) {
            const containerRect = guiContainer.getBoundingClientRect();
            const maxLeft = Math.max(0, containerRect.width - winWidth);
            const maxTop = Math.max(0, containerRect.height - winHeight);
            
            // 如果窗口在容器内，调整相对于容器的位置
            if (rect.left >= containerRect.left && rect.top >= containerRect.top) {
                currentLeft = rect.left - containerRect.left;
                currentTop = rect.top - containerRect.top;
            }
            
            currentLeft = Math.max(0, Math.min(currentLeft, maxLeft));
            currentTop = Math.max(0, Math.min(currentTop, maxTop));
            
            windowElement.style.left = `${currentLeft}px`;
            windowElement.style.top = `${currentTop}px`;
        } else {
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const maxLeft = Math.max(0, viewportWidth - winWidth);
            const maxTop = Math.max(0, viewportHeight - winHeight);
            
            currentLeft = Math.max(0, Math.min(currentLeft, maxLeft));
            currentTop = Math.max(0, Math.min(currentTop, maxTop));
            
            windowElement.style.left = `${currentLeft}px`;
            windowElement.style.top = `${currentTop}px`;
        }
    }
    
    /**
     * 获取主窗口
     * @param {number} pid 进程ID
     * @returns {Object|null} 主窗口信息
     */
    static getMainWindow(pid) {
        const windows = GUIManager.getWindowsByPid(pid);
        return windows.find(w => w.isMainWindow) || windows[0] || null;
    }
    
    /**
     * 获取子窗口
     * @param {number} pid 进程ID
     * @returns {Array<Object>} 子窗口信息数组
     */
    static getChildWindows(pid) {
        const windows = GUIManager.getWindowsByPid(pid);
        return windows.filter(w => !w.isMainWindow);
    }
    
    /**
     * 关闭主窗口及其所有子窗口
     * @param {number} pid 进程ID
     */
    static closeMainWindowAndChildren(pid) {
        const mainWindow = GUIManager.getMainWindow(pid);
        if (!mainWindow) {
            return;
        }
        
        // 检查是否是Exploit程序（PID 10000），如果是，只关闭窗口，不kill进程
        const isExploit = pid === (typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000);
        
        // 获取所有窗口（包括主窗口和子窗口）
        const allWindows = GUIManager.getWindowsByPid(pid);
        
        // 先关闭所有子窗口
        const childWindows = GUIManager.getChildWindows(pid);
        for (const childWindow of childWindows) {
            // Exploit程序的窗口使用非强制关闭，以触发onClose回调
            GUIManager._closeWindow(childWindow.windowId, !isExploit);
        }
        
        // 最后关闭主窗口
        // Exploit程序的窗口使用非强制关闭，以触发onClose回调
        GUIManager._closeWindow(mainWindow.windowId, !isExploit);
        
        // 点击关闭按钮时，必须强制显示任务栏（无论窗口状态如何）
        GUIManager._showTaskbar();
        KernelLogger.debug("GUIManager", `关闭主窗口及所有子窗口，强制显示任务栏`);
        
        // 确保任务栏可见性已更新（在所有窗口关闭后再次检查）
        // 使用 requestAnimationFrame 确保所有窗口的状态更新和DOM操作已完成
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                GUIManager._updateTaskbarVisibility();
            });
        });
        
        // 记录日志
        GUIManager._logWindowAction(mainWindow.windowId, 'CLOSE_MAIN', '主窗口及所有子窗口已关闭', {
            pid: pid,
            totalWindows: allWindows.length
        });
    }
    
    /**
     * 关闭窗口（内部方法）
     * @param {string} windowId 窗口ID
     * @param {boolean} forceClose 是否强制关闭（不调用onClose回调）
     */
    static _closeWindow(windowId, forceClose = false) {
        if (!GUIManager._windows.has(windowId)) {
            return;
        }
        
        const windowInfo = GUIManager._windows.get(windowId);
        
        // 立即更新窗口状态，确保任务栏可见性判断准确
        // 将窗口标记为非最大化，这样任务栏可以立即恢复
        const wasMaximized = windowInfo.isMaximized;
        windowInfo.isMaximized = false;
        windowInfo.isMinimized = false; // 也清除最小化状态
        
        // 点击关闭按钮时，必须强制显示任务栏（无论窗口状态如何）
        GUIManager._showTaskbar();
        KernelLogger.debug("GUIManager", `关闭窗口 ${windowId}，强制显示任务栏`);
        
        // 立即更新任务栏可见性（在窗口关闭动画之前）
        // 这样即使窗口还在动画中，任务栏也能正确显示
        GUIManager._updateTaskbarVisibility();
        
        // 检查是否是Exploit程序（PID 10000），如果是，只关闭窗口，不kill进程
        const isExploit = windowInfo.pid === (typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000);
        
        // 如果不是强制关闭，调用onClose回调
        if (!forceClose && windowInfo.onClose) {
            try {
                windowInfo.onClose();
            } catch (e) {
                KernelLogger.warn("GUIManager", `窗口onClose回调执行失败: ${e.message}`, e);
            }
        }
        
        // 检查窗口是否还在DOM中（onClose回调可能已经移除了窗口）
        // 添加关闭动画（使用 AnimateManager）
        if (windowInfo.window && windowInfo.window.parentElement && document.body.contains(windowInfo.window)) {
            let closeDuration = 500; // 默认时长
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.removeAnimationClasses(windowInfo.window);
                const config = AnimateManager.addAnimationClasses(windowInfo.window, 'WINDOW', 'CLOSE');
                closeDuration = config ? config.duration : 500;
            } else {
                // 降级方案：直接使用类名
                windowInfo.window.classList.remove('animate__fadeIn', 'animate__zoomIn', 'animate__slideInUp', 'animate__fadeOut');
                windowInfo.window.classList.add('animate__animated', 'animate__fadeOut', 'animate__zoomOut', 'animate__faster');
            }
            
            // 等待动画完成后再移除窗口
            setTimeout(() => {
                if (windowInfo.window && windowInfo.window.parentElement) {
                    windowInfo.window.remove();
                }
                // 注销窗口（此时会再次调用 _updateTaskbarVisibility，但状态已经更新，不会有问题）
                GUIManager.unregisterWindow(windowId);
            }, closeDuration);
        } else {
            // 如果窗口已经不在DOM中，直接注销
            GUIManager.unregisterWindow(windowId);
        }
    }
    
    /**
     * 注销窗口
     * @param {string|number} windowIdOrPid 窗口ID或进程ID（如果提供PID，将注销该PID的所有窗口）
     */
    static unregisterWindow(windowIdOrPid) {
        // 判断是窗口ID还是PID
        let windowId = null;
        let pid = null;
        
        if (typeof windowIdOrPid === 'string' && windowIdOrPid.startsWith('window_')) {
            // 是窗口ID
            windowId = windowIdOrPid;
            if (!GUIManager._windows.has(windowId)) {
                return;
            }
            const windowInfo = GUIManager._windows.get(windowId);
            pid = windowInfo.pid;
        } else if (typeof windowIdOrPid === 'number') {
            // 是PID，注销该PID的所有窗口
            pid = windowIdOrPid;
            const windowIds = GUIManager._pidToWindows.get(pid);
            if (windowIds && windowIds.size > 0) {
                // 复制Set以避免迭代时修改
                const idsToRemove = Array.from(windowIds);
                for (const wid of idsToRemove) {
                    GUIManager.unregisterWindow(wid);
                }
            }
            return;
        } else {
            KernelLogger.warn("GUIManager", `注销窗口失败：无效的窗口ID或PID: ${windowIdOrPid}`);
            return;
        }
        
        if (!GUIManager._windows.has(windowId)) {
            return;
        }
        
        const windowInfo = GUIManager._windows.get(windowId);
        
        // 先调用onClose回调（如果存在），让窗口有机会清理资源
        // 注意：在移除窗口信息之前调用，确保回调可以访问窗口信息
        // 重要：先保存并清除onClose回调，避免递归调用
        const onCloseCallback = windowInfo.onClose;
        windowInfo.onClose = null; // 清除回调，避免递归
        
        if (onCloseCallback && typeof onCloseCallback === 'function') {
            try {
                onCloseCallback();
            } catch (e) {
                KernelLogger.warn("GUIManager", `窗口onClose回调执行失败: ${e.message}`, e);
            }
        }
        
        // 如果这是焦点窗口，清除焦点
        if (GUIManager._focusedWindowId === windowId) {
            GUIManager._focusedWindowId = null;
        }
        
        // 注销拖动和拉伸事件
        if (typeof EventManager !== 'undefined') {
            EventManager.unregisterDrag(`zos-window-drag-${windowId}`);
            EventManager.unregisterResizer(`zos-window-resize-bottom-right-${windowId}`);
            EventManager.unregisterResizer(`zos-window-resize-top-right-${windowId}`);
            EventManager.unregisterResizer(`zos-window-resize-top-left-${windowId}`);
            EventManager.unregisterResizer(`zos-window-resize-bottom-left-${windowId}`);
        }
        
        // 移除窗口类
        if (windowInfo.window) {
            windowInfo.window.classList.remove('zos-gui-window', 'zos-window-focused', 'zos-window-minimized', 'zos-window-maximized');
            
            // 移除DOM元素
            if (windowInfo.window.parentElement) {
                windowInfo.window.parentElement.removeChild(windowInfo.window);
            }
        }
        
        // 从PID映射中移除
        if (pid && GUIManager._pidToWindows.has(pid)) {
            GUIManager._pidToWindows.get(pid).delete(windowId);
            if (GUIManager._pidToWindows.get(pid).size === 0) {
                GUIManager._pidToWindows.delete(pid);
            }
        }
        
        // 保存窗口的状态（在删除之前，用于日志）
        // 注意：此时 windowInfo.isMaximized 可能已经被 _closeWindow 设置为 false
        // 但我们需要记录原始状态用于调试
        const wasMaximized = windowInfo.isMaximized;
        const wasMinimized = windowInfo.isMinimized;
        
        // 移除窗口（在更新任务栏可见性之前移除，确保 _updateTaskbarVisibility 不会检查到已删除的窗口）
        GUIManager._windows.delete(windowId);
        
        // 更新任务栏可见性（在窗口从 Map 中删除后立即同步调用）
        // 这样 _updateTaskbarVisibility 在检查时，已删除的窗口不会影响判断
        // 如果删除的窗口是唯一的最大化窗口，任务栏应该立即恢复显示
        // 注意：必须同步调用，不能使用异步，否则任务栏可能不会及时恢复
        GUIManager._updateTaskbarVisibility();
        
        // 双重检查：如果窗口数为0或没有最大化窗口，强制显示任务栏
        if (GUIManager._windows.size === 0) {
            GUIManager._showTaskbar();
            KernelLogger.debug("GUIManager", `所有窗口已关闭，强制显示任务栏`);
        } else {
            // 再次验证任务栏状态
            const taskbar = document.getElementById('taskbar');
            if (taskbar) {
                const computedDisplay = getComputedStyle(taskbar).display;
                if (computedDisplay === 'none') {
                    // 如果没有最大化窗口但任务栏仍然隐藏，强制显示
                    let hasMaximized = false;
                    for (const [wid, winfo] of GUIManager._windows) {
                        if (winfo.isMaximized && !winfo.isMinimized) {
                            hasMaximized = true;
                            break;
                        }
                    }
                    if (!hasMaximized) {
                        KernelLogger.warn("GUIManager", `任务栏状态不一致，强制显示任务栏`);
                        GUIManager._showTaskbar();
                    }
                }
            }
        }
        
        // 记录日志
        GUIManager._logWindowAction(windowId, 'UNREGISTER', '窗口已注销', {
            pid: pid,
            title: windowInfo.title,
            wasMaximized: wasMaximized,
            wasMinimized: wasMinimized
        });
        
        KernelLogger.debug("GUIManager", `窗口已注销: WindowID ${windowId}, PID ${pid}, 最大化状态: ${wasMaximized}, 最小化状态: ${wasMinimized}, 剩余窗口数: ${GUIManager._windows.size}`);
    }
    
    /**
     * 创建统一的标题栏
     * @param {HTMLElement} windowElement 窗口元素
     * @param {Object} windowInfo 窗口信息
     * @param {Object} options 选项
     */
    static _createTitleBar(windowElement, windowInfo, options) {
        // 检查是否已有标题栏
        let titleBar = windowElement.querySelector('.zos-window-titlebar');
        if (titleBar) {
            return titleBar;
        }
        
        // 创建标题栏容器
        titleBar = document.createElement('div');
        titleBar.className = 'zos-window-titlebar';
        
        // 获取当前风格，检查是否是玻璃风格
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        const currentStyle = themeManager ? themeManager.getCurrentStyle() : null;
        const currentTheme = themeManager ? themeManager.getCurrentTheme() : null;
        // 检查风格ID或主题ID是否为'glass'
        const isGlassStyle = (currentStyle && currentStyle.id === 'glass') || (currentTheme && currentTheme.id === 'glass');
        
        // 根据风格设置标题栏样式
        const titleBarBg = isGlassStyle ? 'transparent' : (currentTheme && currentTheme.colors ? (currentTheme.colors.backgroundSecondary || currentTheme.colors.background) : 'rgba(30, 30, 46, 0.98)');
        const backdropFilter = isGlassStyle ? 'blur(60px) saturate(180%)' : 'none';
        const borderColor = currentTheme && currentTheme.colors ? (currentTheme.colors.borderLight || currentTheme.colors.border || 'rgba(108, 142, 255, 0.1)') : 'rgba(108, 142, 255, 0.1)';
        
        // 使用 setProperty 并设置 important 标志，确保样式优先级高于CSS
        titleBar.style.setProperty('height', '40px', 'important');
        titleBar.style.setProperty('background', titleBarBg, 'important');
        titleBar.style.setProperty('background-color', titleBarBg, 'important');
        titleBar.style.setProperty('border-bottom', `1px solid ${borderColor}`, 'important');
        titleBar.style.setProperty('backdrop-filter', backdropFilter, 'important');
        titleBar.style.setProperty('-webkit-backdrop-filter', backdropFilter, 'important');
        titleBar.style.setProperty('display', 'flex', 'important');
        titleBar.style.setProperty('align-items', 'center', 'important');
        titleBar.style.setProperty('padding', '0 16px', 'important');
        titleBar.style.setProperty('cursor', 'move', 'important');
        titleBar.style.setProperty('user-select', 'none', 'important');
        titleBar.style.setProperty('flex-shrink', '0', 'important');
        
        // 左侧：图标和标题
        const leftSection = document.createElement('div');
        leftSection.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
            min-width: 0;
        `;
        
        // 图标（如果有）
        if (options.icon) {
            const icon = document.createElement('div');
            icon.className = 'zos-window-icon';
            // 转换虚拟路径为实际 URL
            const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                ? ProcessManager.convertVirtualPathToUrl(options.icon)
                : options.icon;
            icon.innerHTML = `<img src="${iconUrl}" alt="" style="width: 20px; height: 20px;" />`;
            leftSection.appendChild(icon);
        }
        
        // 标题
        const title = document.createElement('div');
        title.className = 'zos-window-title';
        title.textContent = options.title || '窗口';
        title.style.cssText = `
            font-size: 13px;
            font-weight: 500;
            color: rgba(215, 224, 221, 0.9);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        leftSection.appendChild(title);
        
        titleBar.appendChild(leftSection);
        
        // 右侧：控制按钮
        const controls = document.createElement('div');
        controls.className = 'zos-window-controls';
        controls.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center;
            flex-shrink: 0;
        `;
        
        // 最小化按钮
        const minimizeBtn = document.createElement('button');
        minimizeBtn.className = 'zos-window-btn zos-window-btn-minimize';
        minimizeBtn.title = '最小化';
        // 异步加载风格相关的图标
        GUIManager._loadWindowControlIcon('minimize', minimizeBtn).catch(e => {
            KernelLogger.warn("GUIManager", `加载最小化图标失败: ${e.message}，使用默认符号`);
            minimizeBtn.innerHTML = '−';
        });
        minimizeBtn.style.cssText = `
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            color: rgba(215, 224, 221, 0.8);
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            line-height: 1;
            transition: all 0.15s;
        `;
        minimizeBtn.addEventListener('mouseenter', () => {
            minimizeBtn.style.background = 'rgba(255, 255, 255, 0.08)';
        });
        minimizeBtn.addEventListener('mouseleave', () => {
            minimizeBtn.style.background = 'transparent';
        });
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            GUIManager.minimizeWindow(windowInfo.windowId);
        });
        controls.appendChild(minimizeBtn);
        
        // 最大化/还原按钮
        const maximizeBtn = document.createElement('button');
        maximizeBtn.className = 'zos-window-btn zos-window-btn-maximize';
        maximizeBtn.title = '最大化';
        // 异步加载风格相关的图标
        GUIManager._loadWindowControlIcon('maximize', maximizeBtn).catch(e => {
            KernelLogger.warn("GUIManager", `加载最大化图标失败: ${e.message}，使用默认符号`);
            maximizeBtn.innerHTML = '□';
        });
        maximizeBtn.style.cssText = `
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            color: rgba(215, 224, 221, 0.8);
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            transition: all 0.15s;
        `;
        maximizeBtn.addEventListener('mouseenter', () => {
            maximizeBtn.style.background = 'rgba(255, 255, 255, 0.08)';
        });
        maximizeBtn.addEventListener('mouseleave', () => {
            maximizeBtn.style.background = 'transparent';
        });
        maximizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            GUIManager.toggleMaximize(windowInfo.windowId);
        });
        controls.appendChild(maximizeBtn);
        
        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.className = 'zos-window-btn zos-window-btn-close';
        closeBtn.title = '关闭';
        // 异步加载风格相关的图标
        GUIManager._loadWindowControlIcon('close', closeBtn).catch(e => {
            KernelLogger.warn("GUIManager", `加载关闭图标失败: ${e.message}，使用默认符号`);
            closeBtn.innerHTML = '×';
        });
        closeBtn.style.cssText = `
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            color: rgba(215, 224, 221, 0.8);
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            transition: all 0.15s;
        `;
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'rgba(255, 95, 87, 0.15)';
            closeBtn.style.color = '#ff5f57';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'transparent';
            closeBtn.style.color = 'rgba(215, 224, 221, 0.8)';
        });
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 点击关闭按钮时，立即强制显示任务栏
            GUIManager._showTaskbar();
            KernelLogger.debug("GUIManager", "点击关闭按钮，强制显示任务栏");
            
            // 检查是否是Exploit程序（PID 10000），如果是，只关闭窗口，不kill进程
            const isExploit = windowInfo.pid === (typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000);
            
            // 获取该PID的所有窗口
            const allWindows = GUIManager.getWindowsByPid(windowInfo.pid);
            
            // 如果是主窗口，检查是否有子窗口
            if (windowInfo.isMainWindow) {
                // 检查是否有子窗口
                const childWindows = GUIManager.getChildWindows(windowInfo.pid);
                if (childWindows.length > 0) {
                    // 有子窗口，关闭主窗口和所有子窗口
                    GUIManager.closeMainWindowAndChildren(windowInfo.pid);
                } else {
                    // 没有子窗口，检查该PID是否只有一个窗口
                    if (allWindows.length === 1) {
                        // 只有一个窗口，关闭窗口并kill进程（如果适用）
                        if (windowInfo.onClose) {
                            // 如果有onClose回调，调用它
                            windowInfo.onClose();
                        } else if (isExploit) {
                            // Exploit程序没有onClose回调时，只关闭窗口，不kill进程
                            GUIManager._closeWindow(windowInfo.windowId, false);
                        } else if (typeof ProcessManager !== 'undefined') {
                            // 其他程序：正常kill进程
                            ProcessManager.killProgram(windowInfo.pid);
                        }
                    } else {
                        // 该PID有多个窗口（虽然不应该发生，因为只有主窗口没有子窗口），只关闭当前窗口
                        KernelLogger.warn("GUIManager", `PID ${windowInfo.pid} 有多个窗口但主窗口没有子窗口，只关闭当前窗口 ${windowInfo.windowId}`);
                        if (windowInfo.onClose) {
                            windowInfo.onClose();
                        } else {
                            GUIManager._closeWindow(windowInfo.windowId, false);
                        }
                    }
                }
            } else {
                // 子窗口关闭，只关闭自己，不影响程序运行
                if (windowInfo.onClose) {
                    windowInfo.onClose();
                } else {
                    // 如果没有onClose回调，直接移除窗口
                    GUIManager._closeWindow(windowInfo.windowId, false);
                }
            }
        });
        controls.appendChild(closeBtn);
        
        titleBar.appendChild(controls);
        
        // 插入到窗口顶部（如果窗口还没有标题栏）
        const existingTitleBar = windowElement.querySelector('.zos-window-titlebar');
        if (!existingTitleBar) {
            if (windowElement.firstChild) {
                windowElement.insertBefore(titleBar, windowElement.firstChild);
            } else {
                windowElement.appendChild(titleBar);
            }
        } else {
            // 如果已有标题栏，返回现有的
            return existingTitleBar;
        }
        
        // 自动设置拖动和拉伸功能
        GUIManager._setupWindowDragAndResize(windowInfo.windowId, windowElement, titleBar, windowInfo);
        
        return titleBar;
    }
    
    /**
     * 创建DOM元素（封装方法，用于跟踪）
     * @param {string} tagName 标签名
     * @param {Object} options 选项 { id: string, className: string, style: string|Object, attributes: Object, textContent: string, innerHTML: string }
     * @param {string} windowId 窗口ID（可选，用于日志记录）
     * @returns {HTMLElement} DOM元素
     */
    static createElement(tagName, options = {}, windowId = null) {
        const element = document.createElement(tagName);
        
        // 设置ID
        if (options.id) {
            element.id = options.id;
        }
        
        // 设置类名
        if (options.className) {
            element.className = options.className;
        }
        
        // 设置样式
        if (options.style) {
            if (typeof options.style === 'string') {
                element.style.cssText = options.style;
            } else if (typeof options.style === 'object') {
                Object.assign(element.style, options.style);
            }
        }
        
        // 设置属性
        if (options.attributes) {
            for (const [key, value] of Object.entries(options.attributes)) {
                element.setAttribute(key, value);
            }
        }
        
        // 设置文本内容
        if (options.textContent !== undefined) {
            element.textContent = options.textContent;
        }
        
        // 设置HTML内容
        if (options.innerHTML !== undefined) {
            element.innerHTML = options.innerHTML;
        }
        
        // 记录日志
        if (windowId) {
            GUIManager._logWindowAction(windowId, 'CREATE_ELEMENT', `创建元素: ${tagName}`, {
                id: options.id,
                className: options.className
            });
        }
        
        return element;
    }
    
    /**
     * 加载CSS样式
     * @param {string} cssPath CSS文件路径
     * @param {string} windowId 窗口ID（可选，用于日志记录）
     * @returns {Promise<void>}
     */
    static async loadCSS(cssPath, windowId = null) {
        // 检查是否已加载
        const existingLink = document.querySelector(`link[href="${cssPath}"]`);
        if (existingLink) {
            if (windowId) {
                GUIManager._logWindowAction(windowId, 'LOAD_CSS', `CSS已加载: ${cssPath}`);
            }
            return;
        }
        
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssPath;
            link.onload = () => {
                if (windowId) {
                    GUIManager._logWindowAction(windowId, 'LOAD_CSS', `CSS加载成功: ${cssPath}`);
                }
                resolve();
            };
            link.onerror = () => {
                if (windowId) {
                    GUIManager._logWindowAction(windowId, 'LOAD_CSS', `CSS加载失败: ${cssPath}`, { error: true });
                }
                reject(new Error(`Failed to load CSS: ${cssPath}`));
            };
            document.head.appendChild(link);
        });
    }
    
    /**
     * 为元素应用CSS样式
     * @param {HTMLElement} element DOM元素
     * @param {string|Object} styles CSS样式字符串或对象
     * @param {string} windowId 窗口ID（可选，用于日志记录）
     */
    static applyStyles(element, styles, windowId = null) {
        if (!element) {
            return;
        }
        
        if (typeof styles === 'string') {
            element.style.cssText = styles;
        } else if (typeof styles === 'object') {
            Object.assign(element.style, styles);
        }
        
        if (windowId) {
            GUIManager._logWindowAction(windowId, 'APPLY_STYLES', '应用样式', {
                elementId: element.id,
                elementTag: element.tagName
            });
        }
    }
    
    /**
     * 获取PID的所有窗口
     * @param {number} pid 进程ID
     * @returns {Array<Object>} 窗口信息数组
     */
    static getWindowsByPid(pid) {
        const windowIds = GUIManager._pidToWindows.get(pid);
        if (!windowIds || windowIds.size === 0) {
            return [];
        }
        
        return Array.from(windowIds)
            .map(windowId => GUIManager._windows.get(windowId))
            .filter(info => info !== undefined);
    }
    
    /**
     * 获取窗口信息（通过窗口ID）
     * @param {string} windowId 窗口ID
     * @returns {Object|null} 窗口信息
     */
    static getWindowInfo(windowId) {
        return GUIManager._windows.get(windowId) || null;
    }
    
    /**
     * 获取窗口信息（通过PID，返回第一个窗口）
     * @param {number} pid 进程ID
     * @returns {Object|null} 窗口信息
     */
    static getWindowInfoByPid(pid) {
        const windowIds = GUIManager._pidToWindows.get(pid);
        if (!windowIds || windowIds.size === 0) {
            return null;
        }
        
        const firstWindowId = Array.from(windowIds)[0];
        return GUIManager._windows.get(firstWindowId) || null;
    }
    
    /**
     * 获得窗口焦点
     * @param {string|number} windowIdOrPid 窗口ID或进程ID（如果提供PID，将焦点给该PID的第一个窗口）
     */
    static focusWindow(windowIdOrPid) {
        let windowId = null;
        
        // 判断是窗口ID还是PID
        if (typeof windowIdOrPid === 'string' && windowIdOrPid.startsWith('window_')) {
            windowId = windowIdOrPid;
        } else if (typeof windowIdOrPid === 'number') {
            // 是PID，获取该PID的第一个窗口
            const windowIds = GUIManager._pidToWindows.get(windowIdOrPid);
            if (windowIds && windowIds.size > 0) {
                windowId = Array.from(windowIds)[0];
            } else {
                return;
            }
        } else {
            return;
        }
        
        if (!GUIManager._windows.has(windowId)) {
            return;
        }
        
        const windowInfo = GUIManager._windows.get(windowId);
        
        // 如果窗口已最小化，先恢复（但不自动获得焦点，避免循环调用）
        if (windowInfo.isMinimized) {
            GUIManager.restoreWindow(windowId, false);
        }
        
        // 更新z-index（确保焦点窗口在最前）
        // 查找当前所有窗口的最大z-index
        let maxZIndex = GUIManager._baseZIndex;
        for (const [existingWindowId, existingInfo] of GUIManager._windows) {
            if (existingWindowId !== windowId && existingInfo.zIndex > maxZIndex) {
                maxZIndex = existingInfo.zIndex;
            }
        }
        
        // 焦点窗口的z-index应该比所有其他窗口大
        windowInfo.zIndex = maxZIndex + 1;
        
        // 如果超过最大值，重新分配所有窗口的z-index
        if (windowInfo.zIndex >= GUIManager._maxZIndex) {
            // 重新分配所有窗口的z-index，保持相对顺序，但焦点窗口在最前
            const sortedWindows = Array.from(GUIManager._windows.entries())
                .filter(([wid]) => wid !== windowId)
                .sort((a, b) => a[1].zIndex - b[1].zIndex);
            
            let newZIndex = GUIManager._baseZIndex + 1;
            for (const [wid, info] of sortedWindows) {
                info.zIndex = newZIndex;
                // 立即更新DOM中的z-index，确保立即生效
                if (info.window && info.window.style) {
                    info.window.style.zIndex = newZIndex.toString();
                }
                newZIndex++;
            }
            
            // 焦点窗口在最前
            windowInfo.zIndex = newZIndex;
        }
        
        // 立即更新DOM中的z-index，确保立即生效
        if (windowInfo.window && windowInfo.window.style) {
            // 使用!important确保覆盖任何CSS规则
            windowInfo.window.style.setProperty('z-index', windowInfo.zIndex.toString(), 'important');
            // 强制浏览器重新计算样式
            const currentDisplay = windowInfo.window.style.display || getComputedStyle(windowInfo.window).display;
            if (currentDisplay) {
                windowInfo.window.style.display = currentDisplay;
            }
        }
        
        // 移除之前焦点窗口的焦点状态
        if (GUIManager._focusedWindowId && GUIManager._windows.has(GUIManager._focusedWindowId)) {
            const prevWindowInfo = GUIManager._windows.get(GUIManager._focusedWindowId);
            prevWindowInfo.isFocused = false;
            prevWindowInfo.window.classList.remove('zos-window-focused');
            // 同时移除终端窗口自己的focused类（如果存在）
            prevWindowInfo.window.classList.remove('focused');
        }
        
        // 设置新焦点窗口
        GUIManager._focusedWindowId = windowId;
        windowInfo.isFocused = true;
        windowInfo.window.classList.add('zos-window-focused');
        // 同时添加终端窗口的focused类（如果窗口是bash-window，用于兼容）
        if (windowInfo.window.classList.contains('bash-window')) {
            windowInfo.window.classList.add('focused');
        }
        
        // 记录日志
        GUIManager._logWindowAction(windowId, 'FOCUS', '窗口获得焦点', {
            pid: windowInfo.pid,
            zIndex: windowInfo.zIndex
        });
        
        KernelLogger.debug("GUIManager", `窗口获得焦点: WindowID ${windowId}, PID ${windowInfo.pid}, z-index: ${windowInfo.zIndex}`);
    }
    
    /**
     * 显示模态提示框（替代 alert）
     * @param {string} message 提示消息
     * @param {string} title 标题（可选）
     * @param {string} type 类型：'info', 'warning', 'error', 'success'（默认：'info'）
     * @returns {Promise<void>}
     */
    static showAlert(message, title = '提示', type = 'info') {
        return new Promise((resolve) => {
            GUIManager._createModalDialog({
                title: title,
                message: message,
                type: type,
                buttons: [
                    {
                        text: '确定',
                        primary: true,
                        action: () => {
                            resolve();
                        }
                    }
                ]
            });
        });
    }
    
    /**
     * 显示确认对话框（替代 confirm）
     * @param {string} message 确认消息
     * @param {string} title 标题（可选）
     * @param {string} type 类型：'warning', 'danger', 'info'（默认：'warning'）
     * @returns {Promise<boolean>} true表示确认，false表示取消
     */
    static showConfirm(message, title = '确认', type = 'warning') {
        return new Promise((resolve) => {
            GUIManager._createModalDialog({
                title: title,
                message: message,
                type: type,
                buttons: [
                    {
                        text: '取消',
                        primary: false,
                        action: () => {
                            resolve(false);
                        }
                    },
                    {
                        text: '确定',
                        primary: true,
                        danger: type === 'danger',
                        action: () => {
                            resolve(true);
                        }
                    }
                ]
            });
        });
    }
    
    /**
     * 显示输入对话框（替代 prompt）
     * @param {string} message 提示消息
     * @param {string} title 标题（可选）
     * @param {string} defaultValue 默认值（可选）
     * @returns {Promise<string|null>} 用户输入的值，取消返回null
     */
    static showPrompt(message, title = '输入', defaultValue = '') {
        return new Promise((resolve) => {
            const dialog = GUIManager._createModalDialog({
                title: title,
                message: message,
                type: 'info',
                hasInput: true,
                inputValue: defaultValue,
                buttons: [
                    {
                        text: '取消',
                        primary: false,
                        action: () => {
                            resolve(null);
                        }
                    },
                    {
                        text: '确定',
                        primary: true,
                        action: (inputValue) => {
                            resolve(inputValue);
                        }
                    }
                ]
            });
        });
    }
    
    /**
     * 创建模态对话框（内部方法）
     * @param {Object} options 选项 { title, message, type, buttons, hasInput, inputValue }
     * @returns {HTMLElement} 对话框元素
     */
    static _createModalDialog(options) {
        GUIManager.init();
        
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'zos-modal-overlay';
        
        // 应用主题背景色（使用主题变量）
        const overlayThemeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        
        let overlayBg = 'rgba(0, 0, 0, 0.35)'; // 更透明的默认背景（35% 透明度）
        let overlayBlur = 'blur(12px) saturate(150%)'; // 更强的模糊效果
        
        if (overlayThemeManager) {
            try {
                const currentTheme = overlayThemeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    // 使用主题背景色，但更透明
                    const themeBg = currentTheme.colors.background || '#050810';
                    // 将主题背景色转换为 rgba，并降低透明度
                    overlayBg = themeBg.includes('rgba') 
                        ? themeBg.replace(/rgba\(([^)]+)\)/, (match, values) => {
                            const parts = values.split(',').map(v => v.trim());
                            const alpha = parts.length > 3 ? parseFloat(parts[3]) : 0.35;
                            return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Math.min(alpha * 0.5, 0.4)})`;
                        })
                        : `${themeBg}66`; // 40% 透明度（使用 66 十六进制）
                }
            } catch (e) {
                KernelLogger.warn("GUIManager", `应用主题到模态遮罩失败: ${e.message}`);
            }
        }
        
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: ${overlayBg};
            backdrop-filter: ${overlayBlur};
            -webkit-backdrop-filter: ${overlayBlur};
            z-index: 100001;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                        backdrop-filter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        
        // 创建对话框
        const dialog = document.createElement('div');
        dialog.className = 'zos-modal-dialog';
        
        // 应用主题背景色
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        let dialogBg = 'linear-gradient(180deg, rgba(26, 31, 46, 0.98) 0%, rgba(22, 33, 62, 0.98) 100%)';
        let dialogBorder = 'rgba(108, 142, 255, 0.3)';
        const currentStyle = themeManager ? themeManager.getCurrentStyle() : null;
        const currentTheme = themeManager ? themeManager.getCurrentTheme() : null;
        // 检查风格ID或主题ID是否为'glass'
        const isGlassStyle = (currentStyle && currentStyle.id === 'glass') || (currentTheme && currentTheme.id === 'glass');
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    dialogBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                    dialogBorder = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '4d' : 'rgba(108, 142, 255, 0.3)');
                }
            } catch (e) {
                KernelLogger.warn("GUIManager", `应用主题到模态对话框失败: ${e.message}`);
            }
        }
        
        const dialogBackdropFilter = isGlassStyle ? 'blur(30px) saturate(180%)' : 'none';
        const dialogBackground = isGlassStyle ? 'transparent' : dialogBg;
        
        dialog.style.cssText = `
            background: ${dialogBackground};
            border: 1px solid ${dialogBorder};
            border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 6px 20px rgba(0, 0, 0, 0.3);
            backdrop-filter: ${dialogBackdropFilter};
            -webkit-backdrop-filter: ${dialogBackdropFilter};
            min-width: 400px;
            max-width: 600px;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        
        // 使用 AnimateManager 添加打开动画
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.addAnimationClasses(overlay, 'DIALOG', 'OPEN');
            AnimateManager.addAnimationClasses(dialog, 'DIALOG', 'OPEN');
        }
        
        // 标题栏
        const titleBar = document.createElement('div');
        let titleBarBorder = 'rgba(108, 142, 255, 0.2)';
        const currentThemeForDialog = themeManager ? themeManager.getCurrentTheme() : null;
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    titleBarBorder = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(108, 142, 255, 0.2)');
                }
            } catch (e) {
                // 忽略错误，使用默认值
            }
        }
        const titleBarBackdropFilter = isGlassStyle ? 'blur(60px) saturate(180%)' : 'none';
        const titleBarBackground = isGlassStyle ? 'transparent' : (currentThemeForDialog && currentThemeForDialog.colors ? (currentThemeForDialog.colors.backgroundSecondary || currentThemeForDialog.colors.background) : 'rgba(30, 30, 46, 0.98)');
        titleBar.style.cssText = `
            padding: 16px 20px;
            background: ${titleBarBackground};
            border-bottom: 1px solid ${titleBarBorder};
            backdrop-filter: ${titleBarBackdropFilter};
            -webkit-backdrop-filter: ${titleBarBackdropFilter};
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        
        // 图标
        const iconMap = {
            'info': 'ℹ',
            'warning': '⚠',
            'error': '✕',
            'success': '✓',
            'danger': '⚠'
        };
        const icon = document.createElement('div');
        icon.style.cssText = `
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            flex-shrink: 0;
            background: ${options.type === 'error' || options.type === 'danger' ? 'rgba(255, 68, 68, 0.2)' : 
                        options.type === 'warning' ? 'rgba(251, 191, 36, 0.2)' : 
                        options.type === 'success' ? 'rgba(74, 222, 128, 0.2)' : 
                        'rgba(108, 142, 255, 0.2)'};
            color: ${options.type === 'error' || options.type === 'danger' ? '#ff4444' : 
                    options.type === 'warning' ? '#fbbf24' : 
                    options.type === 'success' ? '#4ade80' : 
                    '#6c8eff'};
        `;
        icon.textContent = iconMap[options.type] || iconMap['info'];
        titleBar.appendChild(icon);
        
        // 标题文本
        const titleText = document.createElement('div');
        titleText.textContent = options.title || '提示';
        titleText.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            color: #e8ecf0;
            flex: 1;
        `;
        titleBar.appendChild(titleText);
        
        dialog.appendChild(titleBar);
        
        // 内容区域
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 20px;
            flex: 1;
            overflow-y: auto;
        `;
        
        // 消息文本
        const messageText = document.createElement('div');
        messageText.textContent = options.message || '';
        messageText.style.cssText = `
            font-size: 14px;
            color: #d7e0dd;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
        `;
        content.appendChild(messageText);
        
        // 输入框（如果有）
        let inputElement = null;
        if (options.hasInput) {
            inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.value = options.inputValue || '';
            inputElement.style.cssText = `
                width: 100%;
                margin-top: 16px;
                padding: 10px 12px;
                background: rgba(108, 142, 255, 0.1);
                border: 1px solid rgba(108, 142, 255, 0.3);
                border-radius: 6px;
                color: #e8ecf0;
                font-size: 14px;
                outline: none;
                transition: all 0.2s;
            `;
            inputElement.addEventListener('focus', () => {
                inputElement.style.borderColor = '#6c8eff';
                inputElement.style.background = 'rgba(108, 142, 255, 0.15)';
            });
            inputElement.addEventListener('blur', () => {
                inputElement.style.borderColor = 'rgba(108, 142, 255, 0.3)';
                inputElement.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            inputElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const confirmBtn = dialog.querySelector('.zos-modal-btn-primary');
                    if (confirmBtn) {
                        confirmBtn.click();
                    }
                } else if (e.key === 'Escape') {
                    const cancelBtn = dialog.querySelector('.zos-modal-btn:not(.zos-modal-btn-primary)');
                    if (cancelBtn) {
                        cancelBtn.click();
                    }
                }
            });
            content.appendChild(inputElement);
        }
        
        dialog.appendChild(content);
        
        // 按钮区域
        const buttonBar = document.createElement('div');
        let buttonBarBorder = 'rgba(108, 142, 255, 0.2)';
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    buttonBarBorder = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(108, 142, 255, 0.2)');
                }
            } catch (e) {
                // 忽略错误，使用默认值
            }
        }
        buttonBar.style.cssText = `
            padding: 16px 20px;
            border-top: 1px solid ${buttonBarBorder};
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        `;
        
        // 创建按钮
        options.buttons.forEach((btnConfig, index) => {
            const button = document.createElement('button');
            button.className = 'zos-modal-btn';
            if (btnConfig.primary) {
                button.classList.add('zos-modal-btn-primary');
            }
            if (btnConfig.danger) {
                button.classList.add('zos-modal-btn-danger');
            }
            button.textContent = btnConfig.text;
            button.style.cssText = `
                padding: 10px 20px;
                border: 1px solid ${btnConfig.danger ? 'rgba(255, 68, 68, 0.5)' : 
                        btnConfig.primary ? 'rgba(108, 142, 255, 0.5)' : 
                        'rgba(108, 142, 255, 0.3)'};
                background: ${btnConfig.danger ? 'rgba(255, 68, 68, 0.1)' : 
                            btnConfig.primary ? 'rgba(108, 142, 255, 0.1)' : 
                            'rgba(108, 142, 255, 0.05)'};
                color: ${btnConfig.danger ? '#ff4444' : 
                        btnConfig.primary ? '#6c8eff' : 
                        '#e8ecf0'};
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: ${btnConfig.primary ? '500' : '400'};
                transition: all 0.2s;
                min-width: 80px;
            `;
            button.addEventListener('mouseenter', () => {
                button.style.background = btnConfig.danger ? 'rgba(255, 68, 68, 0.2)' : 
                                          btnConfig.primary ? 'rgba(108, 142, 255, 0.2)' : 
                                          'rgba(108, 142, 255, 0.1)';
                button.style.borderColor = btnConfig.danger ? '#ff4444' : 
                                           btnConfig.primary ? '#6c8eff' : 
                                           'rgba(108, 142, 255, 0.4)';
            });
            button.addEventListener('mouseleave', () => {
                button.style.background = btnConfig.danger ? 'rgba(255, 68, 68, 0.1)' : 
                                          btnConfig.primary ? 'rgba(108, 142, 255, 0.1)' : 
                                          'rgba(108, 142, 255, 0.05)';
                button.style.borderColor = btnConfig.danger ? 'rgba(255, 68, 68, 0.5)' : 
                                           btnConfig.primary ? 'rgba(108, 142, 255, 0.5)' : 
                                           'rgba(108, 142, 255, 0.3)';
            });
            button.addEventListener('click', () => {
                const inputValue = inputElement ? inputElement.value : null;
                btnConfig.action(inputValue);
                GUIManager._closeModalDialog(overlay);
            });
            buttonBar.appendChild(button);
            
            // 如果是主要按钮且是第一个，自动聚焦
            if (btnConfig.primary && index === options.buttons.length - 1) {
                setTimeout(() => {
                    if (inputElement) {
                        inputElement.focus();
                        inputElement.select();
                    } else {
                        button.focus();
                    }
                }, 100);
            }
        });
        
        dialog.appendChild(buttonBar);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // 点击遮罩层关闭（仅当没有输入框时，避免误操作）
        if (!options.hasInput) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    // 如果有取消按钮，点击取消；否则关闭对话框
                    const cancelBtn = dialog.querySelector('.zos-modal-btn:not(.zos-modal-btn-primary)');
                    if (cancelBtn) {
                        cancelBtn.click();
                    } else {
                        GUIManager._closeModalDialog(overlay);
                    }
                }
            });
        }
        
        // 记录对话框
        GUIManager._modalDialogs.add(overlay);
        
        // 添加动画样式（如果还没有）
        if (!document.getElementById('zos-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'zos-modal-styles';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                @keyframes slideDown {
                    from {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                    to {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        return dialog;
    }
    
    /**
     * 关闭模态对话框（内部方法）
     * @param {HTMLElement} overlay 遮罩层元素
     */
    static _closeModalDialog(overlay) {
        if (!overlay || !overlay.parentElement) {
            return;
        }
        
        // 使用 AnimateManager 添加关闭动画
        let closeDuration = 200; // 默认时长
        if (typeof AnimateManager !== 'undefined') {
            const config = AnimateManager.addAnimationClasses(overlay, 'DIALOG', 'CLOSE');
            const dialog = overlay.querySelector('.zos-modal-dialog');
            if (dialog) {
                AnimateManager.addAnimationClasses(dialog, 'DIALOG', 'CLOSE');
            }
            closeDuration = config ? config.duration : 200;
        } else {
            // 降级方案：使用内联样式动画
            overlay.style.animation = 'fadeOut 0.2s ease';
            const dialog = overlay.querySelector('.zos-modal-dialog');
            if (dialog) {
                dialog.style.animation = 'slideDown 0.2s ease';
            }
        }
        
        setTimeout(() => {
            if (overlay.parentElement) {
                overlay.parentElement.removeChild(overlay);
            }
            GUIManager._modalDialogs.delete(overlay);
        }, closeDuration);
    }
    
    /**
     * 关闭所有模态对话框
     */
    static closeAllModals() {
        GUIManager._modalDialogs.forEach(overlay => {
            GUIManager._closeModalDialog(overlay);
        });
    }
    
    /**
     * 最小化窗口
     * @param {string|number} windowIdOrPid 窗口ID或进程ID
     */
    static minimizeWindow(windowIdOrPid) {
        let windowId = null;
        
        // 判断是窗口ID还是PID
        if (typeof windowIdOrPid === 'string' && windowIdOrPid.startsWith('window_')) {
            windowId = windowIdOrPid;
        } else if (typeof windowIdOrPid === 'number') {
            // 是PID，最小化该PID的所有窗口
            const windows = GUIManager.getWindowsByPid(windowIdOrPid);
            for (const winInfo of windows) {
                GUIManager.minimizeWindow(winInfo.windowId);
            }
            return;
        } else {
            return;
        }
        
        if (!GUIManager._windows.has(windowId)) {
            return;
        }
        
        const windowInfo = GUIManager._windows.get(windowId);
        
        if (windowInfo.isMinimized) {
            return;
        }
        
        // 保存窗口状态
        const rect = windowInfo.window.getBoundingClientRect();
        windowInfo.windowState.savedLeft = windowInfo.window.style.left;
        windowInfo.windowState.savedTop = windowInfo.window.style.top;
        windowInfo.windowState.savedWidth = windowInfo.window.style.width;
        windowInfo.windowState.savedHeight = windowInfo.window.style.height;
        windowInfo.windowState.savedTransform = windowInfo.window.style.transform;
        
        // 添加最小化动画（使用 AnimateManager，根据任务栏位置调整方向）
        let minimizeDuration = 150; // 默认时长
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.removeAnimationClasses(windowInfo.window);
            
            // 获取任务栏位置
            let taskbarPosition = 'bottom';
            try {
                if (typeof TaskbarManager !== 'undefined' && TaskbarManager._taskbarPosition) {
                    taskbarPosition = TaskbarManager._taskbarPosition;
                }
            } catch (e) {
                // 忽略错误，使用默认值
            }
            
            // 根据任务栏位置调整动画方向
            const baseConfig = AnimateManager.getAnimation('WINDOW', 'MINIMIZE');
            if (baseConfig) {
                const customConfig = { ...baseConfig };
                
                // 获取窗口和任务栏的位置信息
                const windowRect = windowInfo.window.getBoundingClientRect();
                const taskbar = document.getElementById('taskbar');
                let taskbarRect = null;
                if (taskbar) {
                    taskbarRect = taskbar.getBoundingClientRect();
                }
                
                // 根据任务栏位置计算动画方向
                if (taskbarPosition === 'bottom') {
                    // 任务栏在底部：向下移动
                    customConfig.translateY = [0, 200];
                    customConfig.translateX = [0, 0];
                } else if (taskbarPosition === 'top') {
                    // 任务栏在顶部：向上移动
                    customConfig.translateY = [0, -200];
                    customConfig.translateX = [0, 0];
                } else if (taskbarPosition === 'left') {
                    // 任务栏在左侧：向左移动
                    customConfig.translateY = [0, 0];
                    customConfig.translateX = [0, -200];
                } else if (taskbarPosition === 'right') {
                    // 任务栏在右侧：向右移动
                    customConfig.translateY = [0, 0];
                    customConfig.translateX = [0, 200];
                }
                
                // 应用自定义配置
                const config = AnimateManager.addAnimationClasses(windowInfo.window, 'WINDOW', 'MINIMIZE', customConfig);
                minimizeDuration = config ? config.duration : 150;
            } else {
                const config = AnimateManager.addAnimationClasses(windowInfo.window, 'WINDOW', 'MINIMIZE');
                minimizeDuration = config ? config.duration : 150;
            }
        } else {
            // 降级方案：直接使用类名
            windowInfo.window.classList.remove('animate__fadeIn', 'animate__zoomIn', 'animate__slideInUp');
            windowInfo.window.classList.add('animate__animated', 'animate__fadeOut', 'animate__faster');
        }
        
        // 立即更新状态（在动画之前），确保任务栏可见性判断准确
        windowInfo.isMinimized = true;
        
        // 更新任务栏可见性（在状态更新后立即调用，确保判断准确）
        // 注意：必须在 isMinimized 设置为 true 之后调用
        GUIManager._updateTaskbarVisibility();
        
        // 等待动画完成后再隐藏窗口视觉
        setTimeout(() => {
            windowInfo.window.classList.add('zos-window-minimized');
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.removeAnimationClasses(windowInfo.window);
            } else {
                windowInfo.window.classList.remove('animate__fadeOut', 'animate__animated');
            }
            windowInfo.window.style.visibility = 'hidden';
            windowInfo.window.style.opacity = '0';
            windowInfo.window.style.pointerEvents = 'none';
        }, minimizeDuration);
        
        // 调用回调
        if (windowInfo.onMinimize) {
            windowInfo.onMinimize();
        }
        
        // 记录日志
        GUIManager._logWindowAction(windowId, 'MINIMIZE', '窗口已最小化', {
            pid: windowInfo.pid
        });
        
        // 更新ProcessManager中的状态
        if (typeof ProcessManager !== 'undefined') {
            const processInfo = ProcessManager.PROCESS_TABLE.get(windowInfo.pid);
            if (processInfo) {
                // 如果该PID的所有窗口都最小化了，才更新ProcessManager状态
                const allWindows = GUIManager.getWindowsByPid(windowInfo.pid);
                const allMinimized = allWindows.every(w => w.isMinimized);
                if (allMinimized) {
                    processInfo.isMinimized = true;
                    ProcessManager._saveProcessTable(ProcessManager.PROCESS_TABLE);
                }
            }
        }
        
        KernelLogger.debug("GUIManager", `窗口已最小化: WindowID ${windowId}, PID ${windowInfo.pid}`);
    }
    
    /**
     * 恢复窗口
     * @param {string|number} windowIdOrPid 窗口ID或进程ID
     */
    static restoreWindow(windowIdOrPid, autoFocus = true) {
        let windowId = null;
        
        // 判断是窗口ID还是PID
        if (typeof windowIdOrPid === 'string' && windowIdOrPid.startsWith('window_')) {
            windowId = windowIdOrPid;
        } else if (typeof windowIdOrPid === 'number') {
            // 是PID，恢复该PID的所有窗口
            const windows = GUIManager.getWindowsByPid(windowIdOrPid);
            for (const winInfo of windows) {
                GUIManager.restoreWindow(winInfo.windowId, autoFocus);
            }
            return;
        } else {
            return;
        }
        
        if (!GUIManager._windows.has(windowId)) {
            return;
        }
        
        const windowInfo = GUIManager._windows.get(windowId);
        
        if (!windowInfo.isMinimized) {
            return;
        }
        
        // 立即更新状态（在动画之前），避免状态不一致导致需要点击两次
        windowInfo.isMinimized = false;
        
        // 移除最小化类
        windowInfo.window.classList.remove('zos-window-minimized');
        windowInfo.window.style.visibility = '';
        windowInfo.window.style.opacity = '';
        windowInfo.window.style.pointerEvents = '';
        
        // 如果窗口之前是最大化的，重新应用最大化样式
        // 而不是恢复保存的位置和大小（因为最小化时保存的是最大化时的状态）
        if (windowInfo.isMaximized) {
            const guiContainer = document.getElementById('gui-container');
            if (guiContainer) {
                const containerRect = guiContainer.getBoundingClientRect();
                windowInfo.window.style.left = '0';
                windowInfo.window.style.top = '0';
                windowInfo.window.style.width = containerRect.width + 'px';
                windowInfo.window.style.height = '100vh';
                windowInfo.window.style.transform = 'none';
            } else {
                windowInfo.window.style.left = '0';
                windowInfo.window.style.top = '0';
                windowInfo.window.style.width = '100%';
                windowInfo.window.style.height = '100vh';
                windowInfo.window.style.transform = 'none';
            }
            
            // 确保全屏窗口的z-index高于任务栏
            const currentZIndex = windowInfo.zIndex;
            if (currentZIndex <= 99999) {
                windowInfo.zIndex = 100000;
                windowInfo.window.style.setProperty('z-index', '100000', 'important');
            }
        } else {
            // 如果窗口不是最大化的，恢复保存的状态
            if (windowInfo.windowState.savedLeft !== null) {
                windowInfo.window.style.left = windowInfo.windowState.savedLeft;
            }
            if (windowInfo.windowState.savedTop !== null) {
                windowInfo.window.style.top = windowInfo.windowState.savedTop;
            }
            if (windowInfo.windowState.savedWidth !== null) {
                windowInfo.window.style.width = windowInfo.windowState.savedWidth;
            }
            if (windowInfo.windowState.savedHeight !== null) {
                windowInfo.window.style.height = windowInfo.windowState.savedHeight;
            }
            if (windowInfo.windowState.savedTransform !== null) {
                windowInfo.window.style.transform = windowInfo.windowState.savedTransform;
            }
        }
        
        // 添加恢复动画（使用 AnimateManager，根据任务栏位置调整方向）
        let restoreDuration = 150; // 默认时长
        if (typeof AnimateManager !== 'undefined') {
            // 获取任务栏位置
            let taskbarPosition = 'bottom';
            try {
                if (typeof TaskbarManager !== 'undefined' && TaskbarManager._taskbarPosition) {
                    taskbarPosition = TaskbarManager._taskbarPosition;
                }
            } catch (e) {
                // 忽略错误，使用默认值
            }
            
            // 根据任务栏位置调整动画方向
            const baseConfig = AnimateManager.getAnimation('WINDOW', 'RESTORE');
            if (baseConfig) {
                const customConfig = { ...baseConfig };
                
                // 根据任务栏位置计算动画方向（与最小化相反）
                if (taskbarPosition === 'bottom') {
                    // 任务栏在底部：从下向上恢复
                    customConfig.translateY = [200, 0];
                    customConfig.translateX = [0, 0];
                } else if (taskbarPosition === 'top') {
                    // 任务栏在顶部：从上向下恢复
                    customConfig.translateY = [-200, 0];
                    customConfig.translateX = [0, 0];
                } else if (taskbarPosition === 'left') {
                    // 任务栏在左侧：从左向右恢复
                    customConfig.translateY = [0, 0];
                    customConfig.translateX = [-200, 0];
                } else if (taskbarPosition === 'right') {
                    // 任务栏在右侧：从右向左恢复
                    customConfig.translateY = [0, 0];
                    customConfig.translateX = [200, 0];
                }
                
                // 应用自定义配置
                const config = AnimateManager.addAnimationClasses(windowInfo.window, 'WINDOW', 'RESTORE', customConfig);
                restoreDuration = config ? config.duration : 150;
            } else {
                const config = AnimateManager.addAnimationClasses(windowInfo.window, 'WINDOW', 'RESTORE');
                restoreDuration = config ? config.duration : 150;
            }
        } else {
            // 降级方案：直接使用类名
            windowInfo.window.classList.add('animate__animated', 'animate__fadeIn', 'animate__zoomIn', 'animate__faster');
        }
        
        setTimeout(() => {
            // 动画完成后移除动画类
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.removeAnimationClasses(windowInfo.window);
            } else {
                windowInfo.window.classList.remove('animate__zoomIn');
            }
        }, restoreDuration);
        
        // 只有在 autoFocus 为 true 时才自动获得焦点（避免与 focusWindow 形成循环调用）
        if (autoFocus) {
            GUIManager.focusWindow(windowId);
        }
        
        // 记录日志
        GUIManager._logWindowAction(windowId, 'RESTORE', '窗口已恢复', {
            pid: windowInfo.pid
        });
        
        // 立即更新ProcessManager中的状态（在动画之前），避免状态不一致
        if (typeof ProcessManager !== 'undefined') {
            const processInfo = ProcessManager.PROCESS_TABLE.get(windowInfo.pid);
            if (processInfo) {
                // 立即更新状态，因为窗口已经开始恢复
                processInfo.isMinimized = false;
                ProcessManager._saveProcessTable(ProcessManager.PROCESS_TABLE);
            }
        }
        
        // 更新任务栏可见性（恢复后，如果窗口是最大化的，应该隐藏任务栏；否则显示）
        GUIManager._updateTaskbarVisibility();
        
        KernelLogger.debug("GUIManager", `窗口已恢复: WindowID ${windowId}, PID ${windowInfo.pid}`);
    }
    
    /**
     * 切换最大化状态
     * @param {string|number} windowIdOrPid 窗口ID或进程ID
     */
    static toggleMaximize(windowIdOrPid) {
        let windowId = null;
        
        // 判断是窗口ID还是PID
        if (typeof windowIdOrPid === 'string' && windowIdOrPid.startsWith('window_')) {
            windowId = windowIdOrPid;
        } else if (typeof windowIdOrPid === 'number') {
            // 是PID，切换该PID的第一个窗口
            const windowInfo = GUIManager.getWindowInfoByPid(windowIdOrPid);
            if (windowInfo) {
                windowId = windowInfo.windowId;
            } else {
                return;
            }
        } else {
            return;
        }
        
        if (!GUIManager._windows.has(windowId)) {
            return;
        }
        
        const windowInfo = GUIManager._windows.get(windowId);
        
        if (windowInfo.isMaximized) {
            GUIManager.restoreMaximize(windowId);
        } else {
            GUIManager.maximizeWindow(windowId);
        }
    }
    
    /**
     * 最大化窗口
     * @param {string|number} windowIdOrPid 窗口ID或进程ID
     */
    static maximizeWindow(windowIdOrPid) {
        let windowId = null;
        
        // 判断是窗口ID还是PID
        if (typeof windowIdOrPid === 'string' && windowIdOrPid.startsWith('window_')) {
            windowId = windowIdOrPid;
        } else if (typeof windowIdOrPid === 'number') {
            // 是PID，最大化该PID的第一个窗口
            const windowInfo = GUIManager.getWindowInfoByPid(windowIdOrPid);
            if (windowInfo) {
                windowId = windowInfo.windowId;
            } else {
                return;
            }
        } else {
            return;
        }
        
        if (!GUIManager._windows.has(windowId)) {
            return;
        }
        
        const windowInfo = GUIManager._windows.get(windowId);
        
        if (windowInfo.isMaximized) {
            return;
        }
        
        // 保存窗口状态
        const rect = windowInfo.window.getBoundingClientRect();
        windowInfo.windowState.savedLeft = windowInfo.window.style.left;
        windowInfo.windowState.savedTop = windowInfo.window.style.top;
        windowInfo.windowState.savedWidth = windowInfo.window.style.width;
        windowInfo.windowState.savedHeight = windowInfo.window.style.height;
        windowInfo.windowState.savedTransform = windowInfo.window.style.transform;
        
        // 添加最大化动画（使用 AnimateManager）
        let maximizeDuration = 200; // 默认时长
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.removeAnimationClasses(windowInfo.window);
            const config = AnimateManager.addAnimationClasses(windowInfo.window, 'WINDOW', 'MAXIMIZE');
            maximizeDuration = config ? config.duration : 200;
        }
        
        // 最大化（在动画过程中平滑过渡）
        const guiContainer = document.getElementById('gui-container');
        const taskbar = document.getElementById('taskbar');
        const taskbarHeight = taskbar ? taskbar.offsetHeight : 60; // 默认任务栏高度60px
        
        // 使用 transition 实现平滑的大小变化
        windowInfo.window.style.transition = `left ${maximizeDuration}ms cubic-bezier(0.4, 0, 0.2, 1), top ${maximizeDuration}ms cubic-bezier(0.4, 0, 0.2, 1), width ${maximizeDuration}ms cubic-bezier(0.4, 0, 0.2, 1), height ${maximizeDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        
        if (guiContainer) {
            const containerRect = guiContainer.getBoundingClientRect();
            windowInfo.window.style.left = '0';
            windowInfo.window.style.top = '0';
            windowInfo.window.style.width = containerRect.width + 'px';
            // 全屏窗口应该覆盖任务栏，所以高度应该是100vh，而不是减去任务栏高度
            // 但为了确保窗口在任务栏上方，需要设置更高的z-index
            windowInfo.window.style.height = '100vh';
            windowInfo.window.style.transform = 'none';
        } else {
            windowInfo.window.style.left = '0';
            windowInfo.window.style.top = '0';
            windowInfo.window.style.width = '100%';
            windowInfo.window.style.height = '100vh';
            windowInfo.window.style.transform = 'none';
        }
        
        // 确保全屏窗口的z-index高于任务栏（任务栏是99999）
        // 但不超过_maxZIndex
        const currentZIndex = windowInfo.zIndex;
        if (currentZIndex <= 99999) {
            // 如果窗口的z-index小于等于任务栏，设置为比任务栏大
            windowInfo.zIndex = 100000;
            windowInfo.window.style.setProperty('z-index', '100000', 'important');
        }
        
        // 等待动画完成后清理
        setTimeout(() => {
            windowInfo.window.style.transition = '';
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.removeAnimationClasses(windowInfo.window);
            }
        }, maximizeDuration);
        
        // 立即更新状态（在动画之前），确保任务栏可见性判断准确
        windowInfo.isMaximized = true;
        windowInfo.window.classList.add('zos-window-maximized');
        
        // 更新任务栏可见性（在状态更新后立即调用，确保判断准确）
        // 注意：必须在 isMaximized 设置为 true 之后调用
        GUIManager._updateTaskbarVisibility();
        
        // 更新最大化按钮（使用主题图标）
        const maximizeBtn = windowInfo.window.querySelector('.zos-window-btn-maximize');
        if (maximizeBtn) {
            // 重新加载还原图标，确保与主题样式一致
            GUIManager._loadWindowControlIcon('restore', maximizeBtn).catch(e => {
                KernelLogger.warn("GUIManager", `加载还原图标失败: ${e.message}，使用默认符号`);
                maximizeBtn.innerHTML = '❐';
            });
            maximizeBtn.title = '还原';
        }
        
        // 调用回调
        if (windowInfo.onMaximize) {
            windowInfo.onMaximize(true);
        }
        
        // 记录日志
        GUIManager._logWindowAction(windowId, 'MAXIMIZE', '窗口已最大化', {
            pid: windowInfo.pid
        });
        
        KernelLogger.debug("GUIManager", `窗口已最大化: WindowID ${windowId}, PID ${windowInfo.pid}`);
    }
    
    /**
     * 还原窗口（从最大化状态）
     * @param {string|number} windowIdOrPid 窗口ID或进程ID
     */
    static restoreMaximize(windowIdOrPid) {
        let windowId = null;
        
        // 判断是窗口ID还是PID
        if (typeof windowIdOrPid === 'string' && windowIdOrPid.startsWith('window_')) {
            windowId = windowIdOrPid;
        } else if (typeof windowIdOrPid === 'number') {
            // 是PID，还原该PID的第一个窗口
            const windowInfo = GUIManager.getWindowInfoByPid(windowIdOrPid);
            if (windowInfo) {
                windowId = windowInfo.windowId;
            } else {
                return;
            }
        } else {
            return;
        }
        
        if (!GUIManager._windows.has(windowId)) {
            return;
        }
        
        const windowInfo = GUIManager._windows.get(windowId);
        
        if (!windowInfo.isMaximized) {
            return;
        }
        
        // 添加还原动画（使用 AnimateManager）
        let restoreDuration = 200; // 默认时长
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.removeAnimationClasses(windowInfo.window);
            const config = AnimateManager.addAnimationClasses(windowInfo.window, 'WINDOW', 'RESTORE_MAXIMIZE');
            restoreDuration = config ? config.duration : 200;
        }
        
        // 恢复窗口状态（在动画过程中平滑过渡）
        // 使用 transition 实现平滑的大小变化
        windowInfo.window.style.transition = `left ${restoreDuration}ms cubic-bezier(0.4, 0, 0.2, 1), top ${restoreDuration}ms cubic-bezier(0.4, 0, 0.2, 1), width ${restoreDuration}ms cubic-bezier(0.4, 0, 0.2, 1), height ${restoreDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        
        if (windowInfo.windowState.savedLeft !== null) {
            windowInfo.window.style.left = windowInfo.windowState.savedLeft;
        }
        if (windowInfo.windowState.savedTop !== null) {
            windowInfo.window.style.top = windowInfo.windowState.savedTop;
        }
        if (windowInfo.windowState.savedWidth !== null) {
            windowInfo.window.style.width = windowInfo.windowState.savedWidth;
        }
        if (windowInfo.windowState.savedHeight !== null) {
            windowInfo.window.style.height = windowInfo.windowState.savedHeight;
        }
        if (windowInfo.windowState.savedTransform !== null) {
            windowInfo.window.style.transform = windowInfo.windowState.savedTransform;
        }
        
        // 立即更新状态（在动画之前），确保任务栏可见性判断准确
        windowInfo.isMaximized = false;
        windowInfo.window.classList.remove('zos-window-maximized');
        
        // 更新任务栏可见性（在状态更新后立即调用，确保判断准确）
        // 注意：必须在 isMaximized 设置为 false 之后调用
        GUIManager._updateTaskbarVisibility();
        
        // 恢复z-index（如果之前因为全屏而提升过）
        // 重新计算z-index，确保窗口仍然在最前（如果它是焦点窗口）
        if (GUIManager._focusedWindowId === windowId) {
            // 如果是焦点窗口，重新设置z-index（但不超过任务栏）
            let maxZIndex = GUIManager._baseZIndex;
            for (const [existingWindowId, existingInfo] of GUIManager._windows) {
                if (existingWindowId !== windowId && existingInfo.zIndex > maxZIndex && existingInfo.zIndex < 99999) {
                    maxZIndex = existingInfo.zIndex;
                }
            }
            windowInfo.zIndex = Math.min(maxZIndex + 1, 99998); // 确保不超过任务栏的z-index
            windowInfo.window.style.setProperty('z-index', windowInfo.zIndex.toString(), 'important');
        } else {
            // 如果不是焦点窗口，恢复正常的z-index（但不超过任务栏）
            if (windowInfo.zIndex >= 100000) {
                // 如果z-index是因为全屏而提升的，恢复到正常范围
                let maxZIndex = GUIManager._baseZIndex;
                for (const [existingWindowId, existingInfo] of GUIManager._windows) {
                    if (existingWindowId !== windowId && existingInfo.zIndex > maxZIndex && existingInfo.zIndex < 99999) {
                        maxZIndex = existingInfo.zIndex;
                    }
                }
                windowInfo.zIndex = Math.min(maxZIndex + 1, 99998);
                windowInfo.window.style.setProperty('z-index', windowInfo.zIndex.toString(), 'important');
            }
        }
        
        // 更新最大化按钮（使用主题图标）
        const maximizeBtn = windowInfo.window.querySelector('.zos-window-btn-maximize');
        if (maximizeBtn) {
            // 重新加载最大化图标，确保与主题样式一致
            GUIManager._loadWindowControlIcon('maximize', maximizeBtn).catch(e => {
                KernelLogger.warn("GUIManager", `加载最大化图标失败: ${e.message}，使用默认符号`);
                maximizeBtn.innerHTML = '□';
            });
            maximizeBtn.title = '最大化';
        }
        
        // 调用回调
        if (windowInfo.onMaximize) {
            windowInfo.onMaximize(false);
        }
        
        // 等待动画完成后清理
        setTimeout(() => {
            windowInfo.window.style.transition = '';
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.removeAnimationClasses(windowInfo.window);
            }
        }, restoreDuration);
        
        // 记录日志
        GUIManager._logWindowAction(windowId, 'RESTORE_MAXIMIZE', '窗口已还原', {
            pid: windowInfo.pid
        });
        
        KernelLogger.debug("GUIManager", `窗口已还原: WindowID ${windowId}, PID ${windowInfo.pid}`);
    }
    
    /**
     * 隐藏任务栏
     */
    static _hideTaskbar() {
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) {
            KernelLogger.warn("GUIManager", "任务栏元素不存在，无法隐藏");
            return;
        }
        
        const currentDisplay = taskbar.style.display || getComputedStyle(taskbar).display;
        if (currentDisplay !== 'none') {
            taskbar.style.display = 'none';
            KernelLogger.debug("GUIManager", `任务栏已隐藏（窗口最大化）(之前: ${currentDisplay})`);
        }
    }
    
    /**
     * 显示任务栏
     */
    static _showTaskbar() {
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) {
            KernelLogger.warn("GUIManager", "任务栏元素不存在，无法显示");
            return;
        }
        
        // 强制显示任务栏，清除所有可能隐藏它的样式
        // 注意：任务栏的默认 display 应该是 flex（根据 CSS）
        taskbar.style.display = 'flex';
        taskbar.style.visibility = 'visible';
        taskbar.style.opacity = '1';
        
        // 确保任务栏类名正确（如果有的话）
        taskbar.classList.remove('hidden');
        
        // 强制重新计算样式，确保显示生效
        void taskbar.offsetHeight;
        
        KernelLogger.debug("GUIManager", `任务栏已显示 (display: ${taskbar.style.display || getComputedStyle(taskbar).display})`);
    }
    
    /**
     * 更新任务栏可见性
     * 如果有任何窗口处于最大化状态且未最小化，则隐藏任务栏；否则显示任务栏
     * 
     * 逻辑说明：
     * 1. 只有当窗口处于最大化状态（isMaximized = true）且未最小化（isMinimized = false）时，才隐藏任务栏
     * 2. 如果窗口被最小化（isMinimized = true），即使它之前是最大化的，也应该显示任务栏
     * 3. 如果没有任何窗口处于最大化且未最小化状态，则显示任务栏
     */
    static _updateTaskbarVisibility() {
        // 检查是否有任何窗口处于最大化状态且未最小化
        // 注意：最小化的窗口不应该隐藏任务栏，即使它之前是最大化的
        let hasMaximizedAndNotMinimizedWindow = false;
        
        for (const [windowId, windowInfo] of GUIManager._windows) {
            // 必须同时满足：最大化 且 未最小化
            if (windowInfo.isMaximized === true && windowInfo.isMinimized === false) {
                hasMaximizedAndNotMinimizedWindow = true;
                break;
            }
        }
        
        if (hasMaximizedAndNotMinimizedWindow) {
            GUIManager._hideTaskbar();
            KernelLogger.debug("GUIManager", `任务栏已隐藏: 存在最大化且未最小化的窗口 (窗口数: ${GUIManager._windows.size})`);
        } else {
            // 确保任务栏显示
            GUIManager._showTaskbar();
            
            // 验证任务栏是否真的显示了
            const taskbar = document.getElementById('taskbar');
            if (taskbar) {
                const computedDisplay = getComputedStyle(taskbar).display;
                if (computedDisplay === 'none') {
                    KernelLogger.warn("GUIManager", `任务栏显示失败: computed display 仍然是 'none'，强制设置为 'flex'`);
                    taskbar.style.setProperty('display', 'flex', 'important');
                }
            } else {
                KernelLogger.warn("GUIManager", "任务栏元素不存在，无法验证显示状态");
            }
            
            KernelLogger.debug("GUIManager", `任务栏已显示: 没有最大化且未最小化的窗口 (窗口数: ${GUIManager._windows.size})`);
        }
    }
    
    /**
     * 获取所有窗口
     * @returns {Array<Object>} 窗口信息数组
     */
    static getAllWindows() {
        return Array.from(GUIManager._windows.values());
    }
    
    /**
     * 获取焦点窗口ID
     * @returns {string|null} 焦点窗口ID
     */
    static getFocusedWindowId() {
        return GUIManager._focusedWindowId;
    }
    
    /**
     * 获取焦点窗口信息
     * @returns {Object|null} 焦点窗口信息
     */
    static getFocusedWindow() {
        if (!GUIManager._focusedWindowId) {
            return null;
        }
        return GUIManager._windows.get(GUIManager._focusedWindowId) || null;
    }
    
    /**
     * 获取焦点窗口的PID
     * @returns {number|null} 焦点窗口的PID
     */
    static getFocusedPid() {
        const focusedWindow = GUIManager.getFocusedWindow();
        return focusedWindow ? focusedWindow.pid : null;
    }
    
    /**
     * 设置窗口的拖动和拉伸功能
     * @param {string} windowId 窗口ID
     * @param {HTMLElement} windowElement 窗口元素
     * @param {HTMLElement} titleBar 标题栏元素
     * @param {Object} windowInfo 窗口信息
     */
    static _setupWindowDragAndResize(windowId, windowElement, titleBar, windowInfo) {
        // 初始化窗口状态（如果还没有）
        if (windowInfo.windowState.isDragging === undefined) {
            windowInfo.windowState.isDragging = false;
            windowInfo.windowState.isResizing = false;
            windowInfo.windowState.dragStartX = 0;
            windowInfo.windowState.dragStartY = 0;
            windowInfo.windowState.dragStartLeft = 0;
            windowInfo.windowState.dragStartTop = 0;
            windowInfo.windowState.resizeStartX = 0;
            windowInfo.windowState.resizeStartY = 0;
            windowInfo.windowState.resizeStartWidth = 0;
            windowInfo.windowState.resizeStartHeight = 0;
            windowInfo.windowState.resizeStartTop = 0;
            windowInfo.windowState.resizeAnchor = null;
        }
        
        // 注册拖动事件（通过标题栏拖动）
        if (typeof EventManager !== 'undefined') {
            EventManager.registerDrag(
                `zos-window-drag-${windowId}`,
                titleBar,
                windowElement,
                windowInfo.windowState,
                (e) => {
                    // 拖动开始
                    if (windowInfo.isMaximized || windowInfo.isMinimized) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    
                    // 获得焦点
                    GUIManager.focusWindow(windowId);
                    
                    // 如果窗口使用了transform居中，需要先转换为固定定位
                    const rect = windowElement.getBoundingClientRect();
                    const computedStyle = window.getComputedStyle(windowElement);
                    const transform = computedStyle.transform;
                    
                    // 如果使用了transform，需要计算实际位置
                    if (transform && transform !== 'none') {
                        // 移除transform，使用固定定位
                        windowElement.style.transform = 'none';
                        windowElement.style.position = 'fixed';
                        windowElement.style.left = rect.left + 'px';
                        windowElement.style.top = rect.top + 'px';
                    }
                    
                    windowInfo.windowState.isDragging = true;
                    windowInfo.windowState.dragStartX = e.clientX;
                    windowInfo.windowState.dragStartY = e.clientY;
                    windowInfo.windowState.dragStartLeft = rect.left;
                    windowInfo.windowState.dragStartTop = rect.top;
                },
                (e) => {
                    // 拖动中
                    if (windowInfo.isMaximized || windowInfo.isMinimized || !windowInfo.windowState.isDragging) {
                        return;
                    }
                    
                    const deltaX = e.clientX - windowInfo.windowState.dragStartX;
                    const deltaY = e.clientY - windowInfo.windowState.dragStartY;
                    
                    // 获取容器边界
                    const guiContainer = document.getElementById('gui-container');
                    const rect = windowElement.getBoundingClientRect();
                    const winWidth = rect.width || windowElement.offsetWidth;
                    const winHeight = rect.height || windowElement.offsetHeight;
                    
                    let newLeft = windowInfo.windowState.dragStartLeft + deltaX;
                    let newTop = windowInfo.windowState.dragStartTop + deltaY;
                    
                    if (guiContainer) {
                        const containerRect = guiContainer.getBoundingClientRect();
                        // 相对于容器的位置
                        const relativeLeft = newLeft - containerRect.left;
                        const relativeTop = newTop - containerRect.top;
                        
                        // 限制在容器内
                        const maxLeft = Math.max(0, containerRect.width - winWidth);
                        const maxTop = Math.max(0, containerRect.height - winHeight);
                        const finalLeft = Math.max(0, Math.min(relativeLeft, maxLeft));
                        const finalTop = Math.max(0, Math.min(relativeTop, maxTop));
                        
                        windowElement.style.left = `${finalLeft}px`;
                        windowElement.style.top = `${finalTop}px`;
                    } else {
                        // 没有容器，使用视口边界
                        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
                        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                        
                        // 限制在视口内
                        const maxLeft = Math.max(0, viewportWidth - winWidth);
                        const maxTop = Math.max(0, viewportHeight - winHeight);
                        const finalLeft = Math.max(0, Math.min(newLeft, maxLeft));
                        const finalTop = Math.max(0, Math.min(newTop, maxTop));
                        
                        windowElement.style.left = `${finalLeft}px`;
                        windowElement.style.top = `${finalTop}px`;
                    }
                },
                (e) => {
                    // 拖动结束
                    windowInfo.windowState.isDragging = false;
                },
                ['.zos-window-btn', 'button', '.zos-window-resizer', '.videoplayer-controls-bar', '.videoplayer-progress-bar', '.videoplayer-progress-container', '.videoplayer-controls', 'video']
            );
        }
        
        // 创建拉伸器（右下角和右上角）
        GUIManager._createResizers(windowId, windowElement, windowInfo);
        
        // 窗口点击获得焦点
        windowElement.addEventListener('mousedown', (e) => {
            // 如果点击的是窗口本身或窗口内的元素（但不是其他窗口的元素）
            if (e.target.closest('.zos-gui-window') === windowElement) {
                // 排除拉伸器（使用更严格的检查）
                if (e.target.classList.contains('zos-window-resizer') || 
                    e.target.closest('.zos-window-resizer')) {
                    return;
                }
                // 排除控制按钮（它们有自己的点击处理）
                if (e.target.closest('.zos-window-btn')) {
                    return;
                }
                GUIManager.focusWindow(windowId);
            }
        });
    }
    
    /**
     * 创建窗口拉伸器
     * @param {string} windowId 窗口ID
     * @param {HTMLElement} windowElement 窗口元素
     * @param {Object} windowInfo 窗口信息
     */
    static _createResizers(windowId, windowElement, windowInfo) {
        // 检查是否已有拉伸器
        if (windowElement.querySelector('.zos-window-resizer')) {
            return;
        }
        
        // 确保窗口是相对定位（拉伸器需要绝对定位）
        const computedStyle = window.getComputedStyle(windowElement);
        if (computedStyle.position === 'static' || computedStyle.position === '') {
            // 如果窗口是fixed定位，拉伸器也可以工作
            // 但需要确保窗口有position属性
            if (!windowElement.style.position) {
                windowElement.style.position = 'relative';
            }
        }
        
        // 右下角拉伸器
        const resizerBottomRight = document.createElement('div');
        resizerBottomRight.className = 'zos-window-resizer zos-window-resizer-bottom-right';
        resizerBottomRight.style.cssText = `
            position: absolute;
            right: 0;
            bottom: 0;
            width: 20px;
            height: 20px;
            cursor: se-resize;
            z-index: 1000;
            background: transparent;
            pointer-events: auto;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        `;
        // 确保拉伸器可以接收鼠标事件
        resizerBottomRight.setAttribute('data-resizer', 'bottom-right');
        windowElement.appendChild(resizerBottomRight);
        
        // 右上角拉伸器
        const resizerTopRight = document.createElement('div');
        resizerTopRight.className = 'zos-window-resizer zos-window-resizer-top-right';
        resizerTopRight.style.cssText = `
            position: absolute;
            right: 0;
            top: 0;
            width: 20px;
            height: 20px;
            cursor: ne-resize;
            z-index: 1000;
            background: transparent;
            pointer-events: auto;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        `;
        // 确保拉伸器可以接收鼠标事件
        resizerTopRight.setAttribute('data-resizer', 'top-right');
        windowElement.appendChild(resizerTopRight);
        
        // 左上角拉伸器
        const resizerTopLeft = document.createElement('div');
        resizerTopLeft.className = 'zos-window-resizer zos-window-resizer-top-left';
        resizerTopLeft.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 20px;
            height: 20px;
            cursor: nw-resize;
            z-index: 1000;
            background: transparent;
            pointer-events: auto;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        `;
        // 确保拉伸器可以接收鼠标事件
        resizerTopLeft.setAttribute('data-resizer', 'top-left');
        windowElement.appendChild(resizerTopLeft);
        
        // 左下角拉伸器
        const resizerBottomLeft = document.createElement('div');
        resizerBottomLeft.className = 'zos-window-resizer zos-window-resizer-bottom-left';
        resizerBottomLeft.style.cssText = `
            position: absolute;
            left: 0;
            bottom: 0;
            width: 20px;
            height: 20px;
            cursor: sw-resize;
            z-index: 1000;
            background: transparent;
            pointer-events: auto;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        `;
        // 确保拉伸器可以接收鼠标事件
        resizerBottomLeft.setAttribute('data-resizer', 'bottom-left');
        windowElement.appendChild(resizerBottomLeft);
        
        // 注册拉伸事件
        if (typeof EventManager !== 'undefined') {
            // 右下角拉伸
            EventManager.registerResizer(
                `zos-window-resize-bottom-right-${windowId}`,
                resizerBottomRight,
                windowElement,
                windowInfo.windowState,
                (e) => {
                    // 拉伸开始
                    if (windowInfo.isMaximized || windowInfo.isMinimized) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    
                    GUIManager.focusWindow(windowId);
                    
                    const rect = windowElement.getBoundingClientRect();
                    windowInfo.windowState.isResizing = true;
                    windowInfo.windowState.resizeStartX = e.clientX;
                    windowInfo.windowState.resizeStartY = e.clientY;
                    windowInfo.windowState.resizeStartWidth = rect.width;
                    windowInfo.windowState.resizeStartHeight = rect.height;
                    windowInfo.windowState.resizeAnchor = 'bottom-right';
                    
                    // 确保使用固定定位
                    const computedStyle = window.getComputedStyle(windowElement);
                    if (computedStyle.transform && computedStyle.transform !== 'none') {
                        windowElement.style.transform = 'none';
                        windowElement.style.position = 'fixed';
                        windowElement.style.left = rect.left + 'px';
                        windowElement.style.top = rect.top + 'px';
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                },
                (e) => {
                    // 拉伸中
                    if (!windowInfo.windowState.isResizing || windowInfo.windowState.resizeAnchor !== 'bottom-right') {
                        return;
                    }
                    
                    const deltaX = e.clientX - windowInfo.windowState.resizeStartX;
                    const deltaY = e.clientY - windowInfo.windowState.resizeStartY;
                    
                    const minWidth = 300;
                    const minHeight = 200;
                    let newWidth = Math.max(minWidth, windowInfo.windowState.resizeStartWidth + deltaX);
                    let newHeight = Math.max(minHeight, windowInfo.windowState.resizeStartHeight + deltaY);
                    
                    // 获取容器边界
                    const guiContainer = document.getElementById('gui-container');
                    const rect = windowElement.getBoundingClientRect();
                    
                    if (guiContainer) {
                        const containerRect = guiContainer.getBoundingClientRect();
                        // 相对于容器的位置
                        const relativeLeft = rect.left - containerRect.left;
                        const relativeTop = rect.top - containerRect.top;
                        
                        // 计算最大尺寸（确保窗口不超出容器）
                        const maxWidth = Math.max(minWidth, containerRect.width - relativeLeft);
                        const maxHeight = Math.max(minHeight, containerRect.height - relativeTop);
                        
                        newWidth = Math.min(newWidth, maxWidth);
                        newHeight = Math.min(newHeight, maxHeight);
                        
                        windowElement.style.width = `${newWidth}px`;
                        windowElement.style.height = `${newHeight}px`;
                    } else {
                        // 没有容器，使用视口边界
                        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
                        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                        
                        // 计算最大尺寸（确保窗口不超出视口）
                        const maxWidth = Math.max(minWidth, viewportWidth - rect.left);
                        const maxHeight = Math.max(minHeight, viewportHeight - rect.top);
                        
                        newWidth = Math.min(newWidth, maxWidth);
                        newHeight = Math.min(newHeight, maxHeight);
                        
                        windowElement.style.width = `${newWidth}px`;
                        windowElement.style.height = `${newHeight}px`;
                        
                        // 调整大小后，确保窗口仍在视口内
                        GUIManager._ensureWindowInViewport(windowElement);
                    }
                },
                (e) => {
                    // 拉伸结束
                    windowInfo.windowState.isResizing = false;
                    windowInfo.windowState.resizeAnchor = null;
                }
            );
            
            // 右上角拉伸
            EventManager.registerResizer(
                `zos-window-resize-top-right-${windowId}`,
                resizerTopRight,
                windowElement,
                windowInfo.windowState,
                (e) => {
                    // 拉伸开始
                    if (windowInfo.isMaximized || windowInfo.isMinimized) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    
                    GUIManager.focusWindow(windowId);
                    
                    const rect = windowElement.getBoundingClientRect();
                    windowInfo.windowState.isResizing = true;
                    windowInfo.windowState.resizeStartX = e.clientX;
                    windowInfo.windowState.resizeStartY = e.clientY;
                    windowInfo.windowState.resizeStartWidth = rect.width;
                    windowInfo.windowState.resizeStartHeight = rect.height;
                    windowInfo.windowState.resizeStartTop = rect.top;
                    windowInfo.windowState.resizeStartLeft = rect.left;
                    windowInfo.windowState.resizeAnchor = 'top-right';
                    
                    // 确保使用固定定位
                    const computedStyle = window.getComputedStyle(windowElement);
                    if (computedStyle.transform && computedStyle.transform !== 'none') {
                        windowElement.style.transform = 'none';
                        windowElement.style.position = 'fixed';
                        windowElement.style.left = rect.left + 'px';
                        windowElement.style.top = rect.top + 'px';
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                },
                (e) => {
                    // 拉伸中
                    if (!windowInfo.windowState.isResizing || windowInfo.windowState.resizeAnchor !== 'top-right') {
                        return;
                    }
                    
                    const deltaX = e.clientX - windowInfo.windowState.resizeStartX;
                    const deltaY = e.clientY - windowInfo.windowState.resizeStartY;
                    
                    const minWidth = 300;
                    const minHeight = 200;
                    let newWidth = Math.max(minWidth, windowInfo.windowState.resizeStartWidth + deltaX);
                    let newHeight = Math.max(minHeight, windowInfo.windowState.resizeStartHeight - deltaY);
                    
                    // 计算高度变化量（向上拉伸时高度增加，top应该向上移动）
                    const heightDelta = newHeight - windowInfo.windowState.resizeStartHeight;
                    
                    // 获取容器边界（使用初始位置，避免累积误差）
                    const guiContainer = document.getElementById('gui-container');
                    const resizeStartLeftValue = windowInfo.windowState.resizeStartLeft || 0;
                    
                    if (guiContainer) {
                        const containerRect = guiContainer.getBoundingClientRect();
                        // 使用初始位置计算相对于容器的位置
                        const relativeLeft = resizeStartLeftValue - containerRect.left;
                        const relativeTop = windowInfo.windowState.resizeStartTop - containerRect.top;
                        
                        // 计算最大尺寸（确保窗口不超出容器）
                        const maxWidth = Math.max(minWidth, containerRect.width - relativeLeft);
                        const maxHeight = Math.max(minHeight, relativeTop + windowInfo.windowState.resizeStartHeight);
                        
                        newWidth = Math.min(newWidth, maxWidth);
                        newHeight = Math.min(newHeight, maxHeight);
                        
                        // 重新计算高度变化量（因为可能被maxHeight限制）
                        const actualHeightDelta = newHeight - windowInfo.windowState.resizeStartHeight;
                        
                        // 计算新的top位置（向上拉伸时，高度增加，top应该向上移动）
                        // 使用绝对位置（相对于视口），因为窗口使用 position: fixed
                        const newTop = Math.max(containerRect.top, windowInfo.windowState.resizeStartTop - actualHeightDelta);
                        
                        windowElement.style.width = `${newWidth}px`;
                        windowElement.style.height = `${newHeight}px`;
                        windowElement.style.top = `${newTop}px`;
                    } else {
                        // 没有容器，使用视口边界
                        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
                        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                        
                        // 计算最大尺寸（确保窗口不超出视口，使用初始位置）
                        const maxWidth = Math.max(minWidth, viewportWidth - resizeStartLeftValue);
                        const maxHeight = Math.max(minHeight, windowInfo.windowState.resizeStartTop + windowInfo.windowState.resizeStartHeight);
                        
                        newWidth = Math.min(newWidth, maxWidth);
                        newHeight = Math.min(newHeight, maxHeight);
                        
                        // 重新计算高度变化量（因为可能被maxHeight限制）
                        const actualHeightDelta = newHeight - windowInfo.windowState.resizeStartHeight;
                        
                        // 计算新的top位置（向上拉伸时，高度增加，top应该向上移动）
                        const newTop = Math.max(0, windowInfo.windowState.resizeStartTop - actualHeightDelta);
                        
                        windowElement.style.width = `${newWidth}px`;
                        windowElement.style.height = `${newHeight}px`;
                        windowElement.style.top = `${newTop}px`;
                    }
                },
                (e) => {
                    // 拉伸结束
                    windowInfo.windowState.isResizing = false;
                    windowInfo.windowState.resizeAnchor = null;
                }
            );
            
            // 左上角拉伸
            EventManager.registerResizer(
                `zos-window-resize-top-left-${windowId}`,
                resizerTopLeft,
                windowElement,
                windowInfo.windowState,
                (e) => {
                    // 拉伸开始
                    if (windowInfo.isMaximized || windowInfo.isMinimized) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    
                    GUIManager.focusWindow(windowId);
                    
                    const rect = windowElement.getBoundingClientRect();
                    windowInfo.windowState.isResizing = true;
                    windowInfo.windowState.resizeStartX = e.clientX;
                    windowInfo.windowState.resizeStartY = e.clientY;
                    windowInfo.windowState.resizeStartWidth = rect.width;
                    windowInfo.windowState.resizeStartHeight = rect.height;
                    windowInfo.windowState.resizeStartTop = rect.top;
                    windowInfo.windowState.resizeStartLeft = rect.left;
                    windowInfo.windowState.resizeAnchor = 'top-left';
                    
                    // 确保使用固定定位
                    const computedStyle = window.getComputedStyle(windowElement);
                    if (computedStyle.transform && computedStyle.transform !== 'none') {
                        windowElement.style.transform = 'none';
                        windowElement.style.position = 'fixed';
                        windowElement.style.left = rect.left + 'px';
                        windowElement.style.top = rect.top + 'px';
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                },
                (e) => {
                    // 拉伸中
                    if (!windowInfo.windowState.isResizing || windowInfo.windowState.resizeAnchor !== 'top-left') {
                        return;
                    }
                    
                    const deltaX = e.clientX - windowInfo.windowState.resizeStartX;
                    const deltaY = e.clientY - windowInfo.windowState.resizeStartY;
                    
                    const minWidth = 300;
                    const minHeight = 200;
                    // 向左上拉伸：宽度和高度增加，left和top减小
                    let newWidth = Math.max(minWidth, windowInfo.windowState.resizeStartWidth - deltaX);
                    let newHeight = Math.max(minHeight, windowInfo.windowState.resizeStartHeight - deltaY);
                    
                    // 计算宽度和高度变化量
                    const widthDelta = newWidth - windowInfo.windowState.resizeStartWidth;
                    const heightDelta = newHeight - windowInfo.windowState.resizeStartHeight;
                    
                    // 获取容器边界（使用初始位置，避免累积误差）
                    const guiContainer = document.getElementById('gui-container');
                    const resizeStartLeftValue = windowInfo.windowState.resizeStartLeft || 0;
                    const resizeStartTopValue = windowInfo.windowState.resizeStartTop || 0;
                    
                    if (guiContainer) {
                        const containerRect = guiContainer.getBoundingClientRect();
                        // 使用初始位置计算相对于容器的位置
                        const relativeLeft = resizeStartLeftValue - containerRect.left;
                        const relativeTop = resizeStartTopValue - containerRect.top;
                        
                        // 计算最大尺寸（确保窗口不超出容器）
                        const maxWidth = Math.max(minWidth, relativeLeft + windowInfo.windowState.resizeStartWidth);
                        const maxHeight = Math.max(minHeight, relativeTop + windowInfo.windowState.resizeStartHeight);
                        
                        newWidth = Math.min(newWidth, maxWidth);
                        newHeight = Math.min(newHeight, maxHeight);
                        
                        // 重新计算宽度和高度变化量（因为可能被限制）
                        const actualWidthDelta = newWidth - windowInfo.windowState.resizeStartWidth;
                        const actualHeightDelta = newHeight - windowInfo.windowState.resizeStartHeight;
                        
                        // 计算新的left和top位置（向左上拉伸时，宽度和高度增加，left和top应该减小）
                        // 使用绝对位置（相对于视口），因为窗口使用 position: fixed
                        const newLeft = Math.max(containerRect.left, resizeStartLeftValue - actualWidthDelta);
                        const newTop = Math.max(containerRect.top, resizeStartTopValue - actualHeightDelta);
                        
                        windowElement.style.width = `${newWidth}px`;
                        windowElement.style.height = `${newHeight}px`;
                        windowElement.style.left = `${newLeft}px`;
                        windowElement.style.top = `${newTop}px`;
                    } else {
                        // 没有容器，使用视口边界
                        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
                        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                        
                        // 计算最大尺寸（确保窗口不超出视口，使用初始位置）
                        const maxWidth = Math.max(minWidth, resizeStartLeftValue + windowInfo.windowState.resizeStartWidth);
                        const maxHeight = Math.max(minHeight, resizeStartTopValue + windowInfo.windowState.resizeStartHeight);
                        
                        newWidth = Math.min(newWidth, maxWidth);
                        newHeight = Math.min(newHeight, maxHeight);
                        
                        // 重新计算宽度和高度变化量（因为可能被限制）
                        const actualWidthDelta = newWidth - windowInfo.windowState.resizeStartWidth;
                        const actualHeightDelta = newHeight - windowInfo.windowState.resizeStartHeight;
                        
                        // 计算新的left和top位置（向左上拉伸时，宽度和高度增加，left和top应该减小）
                        const newLeft = Math.max(0, resizeStartLeftValue - actualWidthDelta);
                        const newTop = Math.max(0, resizeStartTopValue - actualHeightDelta);
                        
                        windowElement.style.width = `${newWidth}px`;
                        windowElement.style.height = `${newHeight}px`;
                        windowElement.style.left = `${newLeft}px`;
                        windowElement.style.top = `${newTop}px`;
                    }
                },
                (e) => {
                    // 拉伸结束
                    windowInfo.windowState.isResizing = false;
                    windowInfo.windowState.resizeAnchor = null;
                }
            );
            
            // 左下角拉伸
            EventManager.registerResizer(
                `zos-window-resize-bottom-left-${windowId}`,
                resizerBottomLeft,
                windowElement,
                windowInfo.windowState,
                (e) => {
                    // 拉伸开始
                    if (windowInfo.isMaximized || windowInfo.isMinimized) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    
                    GUIManager.focusWindow(windowId);
                    
                    const rect = windowElement.getBoundingClientRect();
                    windowInfo.windowState.isResizing = true;
                    windowInfo.windowState.resizeStartX = e.clientX;
                    windowInfo.windowState.resizeStartY = e.clientY;
                    windowInfo.windowState.resizeStartWidth = rect.width;
                    windowInfo.windowState.resizeStartHeight = rect.height;
                    windowInfo.windowState.resizeStartTop = rect.top;
                    windowInfo.windowState.resizeStartLeft = rect.left;
                    windowInfo.windowState.resizeAnchor = 'bottom-left';
                    
                    // 确保使用固定定位
                    const computedStyle = window.getComputedStyle(windowElement);
                    if (computedStyle.transform && computedStyle.transform !== 'none') {
                        windowElement.style.transform = 'none';
                        windowElement.style.position = 'fixed';
                        windowElement.style.left = rect.left + 'px';
                        windowElement.style.top = rect.top + 'px';
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                },
                (e) => {
                    // 拉伸中
                    if (!windowInfo.windowState.isResizing || windowInfo.windowState.resizeAnchor !== 'bottom-left') {
                        return;
                    }
                    
                    const deltaX = e.clientX - windowInfo.windowState.resizeStartX;
                    const deltaY = e.clientY - windowInfo.windowState.resizeStartY;
                    
                    const minWidth = 300;
                    const minHeight = 200;
                    // 向左下拉伸：宽度增加（left减小），高度增加（top不变）
                    let newWidth = Math.max(minWidth, windowInfo.windowState.resizeStartWidth - deltaX);
                    let newHeight = Math.max(minHeight, windowInfo.windowState.resizeStartHeight + deltaY);
                    
                    // 计算宽度变化量
                    const widthDelta = newWidth - windowInfo.windowState.resizeStartWidth;
                    
                    // 获取容器边界（使用初始位置，避免累积误差）
                    const guiContainer = document.getElementById('gui-container');
                    const resizeStartLeftValue = windowInfo.windowState.resizeStartLeft || 0;
                    
                    if (guiContainer) {
                        const containerRect = guiContainer.getBoundingClientRect();
                        // 使用初始位置计算相对于容器的位置
                        const relativeLeft = resizeStartLeftValue - containerRect.left;
                        const relativeTop = windowInfo.windowState.resizeStartTop - containerRect.top;
                        
                        // 计算最大尺寸（确保窗口不超出容器）
                        const maxWidth = Math.max(minWidth, relativeLeft + windowInfo.windowState.resizeStartWidth);
                        const maxHeight = Math.max(minHeight, containerRect.height - relativeTop);
                        
                        newWidth = Math.min(newWidth, maxWidth);
                        newHeight = Math.min(newHeight, maxHeight);
                        
                        // 重新计算宽度变化量（因为可能被maxWidth限制）
                        const actualWidthDelta = newWidth - windowInfo.windowState.resizeStartWidth;
                        
                        // 计算新的left位置（向左拉伸时，宽度增加，left应该减小）
                        // 使用绝对位置（相对于视口），因为窗口使用 position: fixed
                        const newLeft = Math.max(containerRect.left, resizeStartLeftValue - actualWidthDelta);
                        
                        windowElement.style.width = `${newWidth}px`;
                        windowElement.style.height = `${newHeight}px`;
                        windowElement.style.left = `${newLeft}px`;
                    } else {
                        // 没有容器，使用视口边界
                        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
                        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                        
                        // 计算最大尺寸（确保窗口不超出视口，使用初始位置）
                        const maxWidth = Math.max(minWidth, resizeStartLeftValue + windowInfo.windowState.resizeStartWidth);
                        const maxHeight = Math.max(minHeight, viewportHeight - windowInfo.windowState.resizeStartTop);
                        
                        newWidth = Math.min(newWidth, maxWidth);
                        newHeight = Math.min(newHeight, maxHeight);
                        
                        // 重新计算宽度变化量（因为可能被maxWidth限制）
                        const actualWidthDelta = newWidth - windowInfo.windowState.resizeStartWidth;
                        
                        // 计算新的left位置（向左拉伸时，宽度增加，left应该减小）
                        const newLeft = Math.max(0, resizeStartLeftValue - actualWidthDelta);
                        
                        windowElement.style.width = `${newWidth}px`;
                        windowElement.style.height = `${newHeight}px`;
                        windowElement.style.left = `${newLeft}px`;
                    }
                },
                (e) => {
                    // 拉伸结束
                    windowInfo.windowState.isResizing = false;
                    windowInfo.windowState.resizeAnchor = null;
                }
            );
        }
    }
    
    // 初始化标志
    static _initialized = false;
    
    /**
     * 加载窗口控制图标（根据当前风格）
     * @param {string} iconName 图标名称（'minimize', 'maximize', 'close'）
     * @param {HTMLElement} buttonElement 按钮元素
     * @returns {Promise<void>}
     */
    static async _loadWindowControlIcon(iconName, buttonElement) {
        if (!buttonElement) return;
        
        // 尝试从 ThemeManager 获取图标
        let themeManager = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                themeManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager");
            } catch (e) {
                // 忽略错误
            }
        }
        
        if (!themeManager && typeof ThemeManager !== 'undefined') {
            themeManager = ThemeManager;
        }
        
        if (themeManager && typeof themeManager.getSystemIconSVG === 'function') {
            try {
                // 确保 ThemeManager 已初始化
                if (!themeManager._initialized) {
                    await themeManager.init();
                }
                
                const svgContent = await themeManager.getSystemIconSVG(iconName);
                if (svgContent) {
                    buttonElement.innerHTML = svgContent;
                    // 应用风格变量
                    const svg = buttonElement.querySelector('svg');
                    if (svg) {
                        svg.style.width = 'var(--style-icon-size-small, 16px)';
                        svg.style.height = 'var(--style-icon-size-small, 16px)';
                    }
                    return;
                }
            } catch (e) {
                KernelLogger.warn("GUIManager", `加载窗口控制图标失败: ${iconName}, ${e.message}`);
            }
        }
        
        // 降级：使用默认符号
        throw new Error('ThemeManager 不可用或图标加载失败');
    }
    
    /**
     * 更新所有窗口的控制按钮图标（当风格切换时调用）
     */
    static async _updateWindowControlIcons() {
        for (const [windowId, windowInfo] of GUIManager._windows) {
            if (!windowInfo.window) continue;
            
            const minimizeBtn = windowInfo.window.querySelector('.zos-window-btn-minimize');
            const maximizeBtn = windowInfo.window.querySelector('.zos-window-btn-maximize');
            const closeBtn = windowInfo.window.querySelector('.zos-window-btn-close');
            
            if (minimizeBtn) {
                try {
                    await GUIManager._loadWindowControlIcon('minimize', minimizeBtn);
                } catch (e) {
                    minimizeBtn.innerHTML = '−';
                }
            }
            
            if (maximizeBtn) {
                try {
                    // 根据窗口状态加载正确的图标
                    const iconName = windowInfo.isMaximized ? 'restore' : 'maximize';
                    await GUIManager._loadWindowControlIcon(iconName, maximizeBtn);
                    maximizeBtn.title = windowInfo.isMaximized ? '还原' : '最大化';
                } catch (e) {
                    maximizeBtn.innerHTML = windowInfo.isMaximized ? '❐' : '□';
                }
            }
            
            if (closeBtn) {
                try {
                    await GUIManager._loadWindowControlIcon('close', closeBtn);
                } catch (e) {
                    closeBtn.innerHTML = '×';
                }
            }
        }
    }
    
    /**
     * 更新所有窗口的样式（当主题或风格变化时调用）
     */
    static _updateAllWindowsStyles() {
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
            
        if (!themeManager) {
            return;
        }
        
        const currentTheme = themeManager.getCurrentTheme();
        const currentStyle = themeManager.getCurrentStyle();
        
        if (!currentTheme || !currentStyle) {
            return;
        }
        
        // 检查是否是玻璃风格或玻璃主题
        const isGlassStyle = currentStyle.id === 'glass' || (currentTheme && currentTheme.id === 'glass');
        
        // 应用风格样式到窗口（先应用风格，再决定是否设置背景）
        if (currentStyle.styles && currentStyle.styles.window) {
            const windowStyles = currentStyle.styles.window;
            const allWindows = document.querySelectorAll('.zos-gui-window');
            allWindows.forEach(window => {
                window.style.borderRadius = windowStyles.borderRadius;
                window.style.borderWidth = windowStyles.borderWidth;
                
                // 处理 backdrop-filter（使用 !important 确保覆盖 CSS 默认值）
                // 如果不是玻璃风格，强制删除backdrop-filter
                if (isGlassStyle && windowStyles.backdropFilter && windowStyles.backdropFilter !== 'none') {
                    window.style.setProperty('backdrop-filter', windowStyles.backdropFilter, 'important');
                    window.style.setProperty('-webkit-backdrop-filter', windowStyles.backdropFilter, 'important');
                    // 如果设置了 backdrop-filter，背景必须透明才能确保 backdrop-filter 生效
                    window.style.setProperty('background-color', 'transparent', 'important');
                } else {
                    // 不是玻璃风格或没有 backdrop-filter，设置为 'none'（使用 !important）
                    window.style.setProperty('backdrop-filter', 'none', 'important');
                    window.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                    // 可以正常设置背景色
                    const windowBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                    window.style.setProperty('background-color', windowBg, 'important');
                }
                
                // 根据焦点状态应用不同的阴影
                if (window.classList.contains('zos-window-focused')) {
                    window.style.boxShadow = windowStyles.boxShadowFocused || windowStyles.boxShadow;
                } else {
                    window.style.boxShadow = windowStyles.boxShadowUnfocused || windowStyles.boxShadow;
                    window.style.opacity = windowStyles.opacityUnfocused || '1';
                }
                
                // 设置边框颜色
                const borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '40' : 'rgba(139, 92, 246, 0.25)');
                window.style.borderColor = borderColor;
            });
        } else {
            // 没有风格系统，使用主题背景色
            const allWindows = document.querySelectorAll('.zos-gui-window');
            allWindows.forEach(window => {
                // 如果不是玻璃风格，强制删除backdrop-filter
                if (!isGlassStyle) {
                    window.style.setProperty('backdrop-filter', 'none', 'important');
                    window.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                }
                const windowBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                window.style.setProperty('background-color', windowBg, 'important');
                const borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '40' : 'rgba(139, 92, 246, 0.25)');
                window.style.setProperty('border-color', borderColor, 'important');
            });
        }
        
        // 更新所有标题栏的样式
        const allTitleBars = document.querySelectorAll('.zos-window-titlebar');
        allTitleBars.forEach(titleBar => {
            // 标题栏应该与窗口保持一致，如果窗口有 backdrop-filter，标题栏也应该透明
            const parentWindow = titleBar.closest('.zos-gui-window');
            const windowBackdropFilter = parentWindow && currentStyle && currentStyle.styles && currentStyle.styles.window && currentStyle.styles.window.backdropFilter;
            // 检查是否是玻璃风格或玻璃主题
            const isGlassStyleForTitleBar = currentStyle.id === 'glass' || (currentTheme && currentTheme.id === 'glass');
            const hasBackdropFilter = isGlassStyleForTitleBar && parentWindow && (
                (parentWindow.style.backdropFilter && parentWindow.style.backdropFilter !== 'none') || 
                (parentWindow.style.webkitBackdropFilter && parentWindow.style.webkitBackdropFilter !== 'none') ||
                (windowBackdropFilter && windowBackdropFilter !== 'none')
            );
            
            if (hasBackdropFilter) {
                // 窗口有 backdrop-filter，标题栏背景设置为透明以确保毛玻璃效果
                titleBar.style.setProperty('background-color', 'transparent', 'important');
                titleBar.style.setProperty('backdrop-filter', 'blur(60px) saturate(180%)', 'important');
                titleBar.style.setProperty('-webkit-backdrop-filter', 'blur(60px) saturate(180%)', 'important');
            } else {
                // 窗口没有 backdrop-filter，标题栏可以设置背景色
                // 设置为 'none'（使用 !important 覆盖 CSS 硬编码值）
                titleBar.style.setProperty('backdrop-filter', 'none', 'important');
                titleBar.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                const titleBarBg = currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                titleBar.style.setProperty('background-color', titleBarBg, 'important');
            }
            const borderColor = currentTheme.colors.borderLight || currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(139, 92, 246, 0.2)');
            titleBar.style.borderBottomColor = borderColor;
        });
        
        // 应用风格样式到任务栏
        if (currentStyle.styles && currentStyle.styles.taskbar) {
            const taskbarStyles = currentStyle.styles.taskbar;
            const taskbar = document.getElementById('taskbar') || document.querySelector('.taskbar');
            if (taskbar) {
                taskbar.style.borderRadius = taskbarStyles.borderRadius;
                // 如果不是玻璃风格，强制删除backdrop-filter
                if (isGlassStyle && taskbarStyles.backdropFilter && taskbarStyles.backdropFilter !== 'none') {
                    taskbar.style.setProperty('backdrop-filter', taskbarStyles.backdropFilter, 'important');
                    taskbar.style.setProperty('-webkit-backdrop-filter', taskbarStyles.backdropFilter, 'important');
                    // 如果设置了 backdrop-filter，背景必须透明才能确保 backdrop-filter 生效
                    taskbar.style.setProperty('background-color', 'transparent', 'important');
                } else {
                    taskbar.style.setProperty('backdrop-filter', 'none', 'important');
                    taskbar.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                    // 可以正常设置背景色
                    const taskbarBg = currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                    taskbar.style.setProperty('background-color', taskbarBg, 'important');
                }
                taskbar.style.boxShadow = taskbarStyles.boxShadow;
            }
        }
        
        KernelLogger.debug("GUIManager", "已更新所有窗口和任务栏样式");
    }
}

// 自动初始化
GUIManager.init();

// 发布依赖加载完成信号
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/process/guiManager.js");
} else if (typeof document !== 'undefined' && document.body) {
    // 降级方案：直接发布事件
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/process/guiManager.js",
            },
        })
    );
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("GUIManager", "已发布依赖加载信号（降级方案）");
    }
} else {
    // 延迟发布信号
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                DependencyConfig.publishSignal("../kernel/process/guiManager.js");
            } else {
                document.body.dispatchEvent(
                    new CustomEvent("dependencyLoaded", {
                        detail: {
                            name: "../kernel/process/guiManager.js",
                        },
                    })
                );
            }
        });
    } else {
        setTimeout(() => {
            if (document.body) {
                if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                    DependencyConfig.publishSignal("../kernel/process/guiManager.js");
                } else {
                    document.body.dispatchEvent(
                        new CustomEvent("dependencyLoaded", {
                            detail: {
                                name: "../kernel/process/guiManager.js",
                            },
                        })
                    );
                }
            }
        }, 0);
    }
}

