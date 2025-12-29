// 任务栏管理器
// 负责渲染任务栏，显示常显程序和正在运行的程序

KernelLogger.info("TaskbarManager", "模块初始化");

class TaskbarManager {
    // 静态标志，防止重复显示选择器
    static _showingSelector = false
    
    // 最近使用程序的存储键名
    static RECENT_PROGRAMS_KEY = 'taskbar_recent_programs'
    // 最近使用程序的最大数量
    static MAX_RECENT_PROGRAMS = 10;
    static _showingSelectorProgramName = null;
    // 更新定时器引用
    static _updateTimer = null;
    // 观察器定时器引用
    static _observerInterval = null;
    // 观察器是否已初始化
    static _observerInitialized = false;
    // 任务栏位置（默认底部）
    static _taskbarPosition = 'bottom';
    // 是否正在加载任务栏位置（防止重复调用）
    static _loadingPosition = false;
    // 电池事件是否已注册
    static _batteryEventRegistered = false;
    // WIN键监听是否已注册
    static _winKeyListenerRegistered = false;
    // 全屏多任务选择器相关
    static _taskSwitcherActive = false;
    static _taskSwitcherContainer = null;
    static _taskSwitcherItems = [];
    static _selectedTaskIndex = -1;
    static _ctrlMouseListenerRegistered = false;
    static _ctrlMouseHandler = null;
    // 全局快捷键监听是否已注册
    static _globalShortcutsRegistered = false;
    
    // 天气缓存键前缀
    static WEATHER_CACHE_PREFIX = 'weather:';
    
    // 天气缓存生命周期（12小时）
    static WEATHER_CACHE_TTL = 12 * 60 * 60 * 1000;
    
    // 进程内短期缓存（默认 5 分钟，减少频繁命中 CacheDrive/网络）
    static _weatherMemoryCache = new Map(); // key -> { data, city, expiresAt }
    
    // 正在进行的天气数据加载请求（用于防止并发重复请求）
    static _pendingWeatherRequest = null;
    
    // 自定义任务栏图标管理
    static _customIcons = new Map(); // Map<iconId, CustomIconData>
    static _customIconIdCounter = 0; // 自定义图标ID计数器
    
    /**
     * 初始化任务栏
     */
    static init() {
        if (typeof document === 'undefined') {
            KernelLogger.warn("TaskbarManager", "document 不可用，跳过任务栏初始化");
            return;
        }
        
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) {
            KernelLogger.warn("TaskbarManager", "任务栏元素不存在");
            return;
        }
        
        // 监听风格变更，更新系统图标
        if (typeof ThemeManager !== 'undefined') {
            ThemeManager.onStyleChange((styleId, style) => {
                KernelLogger.info("TaskbarManager", `风格已切换: ${styleId}，更新系统图标`);
                TaskbarManager._updateSystemIcons().catch(e => {
                    KernelLogger.warn("TaskbarManager", `更新系统图标失败: ${e.message}`);
                });
            });
        }
        
        // 如果已经初始化过，先清理旧的定时器
        if (TaskbarManager._observerInitialized) {
            if (TaskbarManager._updateTimer) {
                clearTimeout(TaskbarManager._updateTimer);
                TaskbarManager._updateTimer = null;
            }
            if (TaskbarManager._observerInterval) {
                clearInterval(TaskbarManager._observerInterval);
                TaskbarManager._observerInterval = null;
            }
        }
        
        // 清空任务栏
        taskbar.innerHTML = '';
        
        // 立即尝试同步加载任务栏位置（如果 LStorage 已初始化）
        TaskbarManager._tryLoadTaskbarPositionSync();
        
        // 加载自定义图标
        TaskbarManager._loadCustomIcons().catch(e => {
            KernelLogger.warn("TaskbarManager", `加载自定义图标失败: ${e.message}`);
        });
        
        // 立即应用任务栏位置（使用已加载的位置或默认位置）
        TaskbarManager._applyTaskbarPosition(taskbar);
        
        // 渲染任务栏（异步）
        TaskbarManager._renderTaskbar(taskbar).catch(e => {
            KernelLogger.error("TaskbarManager", `渲染任务栏失败: ${e.message}`, e);
        });
        
        // 然后异步加载任务栏位置（如果之前同步加载失败，会更新位置）
        TaskbarManager._loadTaskbarPosition().then(() => {
            // 如果位置发生变化，重新应用和渲染
            const currentPosition = TaskbarManager._taskbarPosition || 'bottom';
            TaskbarManager._applyTaskbarPosition(taskbar);
            TaskbarManager._renderTaskbar(taskbar).catch(e => {
                KernelLogger.error("TaskbarManager", `重新渲染任务栏失败: ${e.message}`, e);
            });
        }).catch(() => {
            // 加载失败，保持当前位置
            KernelLogger.debug("TaskbarManager", "异步加载任务栏位置失败，保持当前位置");
        });
        
        // 监听进程变化，更新任务栏（只初始化一次）
        if (!TaskbarManager._observerInitialized) {
            TaskbarManager._observeProcessChanges();
            TaskbarManager._observerInitialized = true;
        }
        
        // 注册WIN键监听（只注册一次）
        if (!TaskbarManager._winKeyListenerRegistered) {
            TaskbarManager._registerWinKeyListener();
            TaskbarManager._winKeyListenerRegistered = true;
        }
        
        // 注册Ctrl+鼠标左键监听（全屏多任务选择器）
        if (!TaskbarManager._ctrlMouseListenerRegistered) {
            TaskbarManager._registerCtrlMouseListener();
            TaskbarManager._ctrlMouseListenerRegistered = true;
        }
        
        // 注册全局快捷键监听（Ctrl+R 启动运行程序）
        if (!TaskbarManager._globalShortcutsRegistered) {
            TaskbarManager._registerGlobalShortcuts();
            TaskbarManager._globalShortcutsRegistered = true;
        }
        
        KernelLogger.info("TaskbarManager", "任务栏初始化完成");
    }
    
    /**
     * 注册Ctrl键监听器（用于切换开始菜单）
     * 使用Ctrl键而非WIN键，避免系统级快捷键可能渗透到浏览器外部
     */
    static _registerWinKeyListener() {
        // 防止重复注册
        if (TaskbarManager._winKeyListenerRegistered) {
            return;
        }
        
        if (typeof EventManager === 'undefined') {
            KernelLogger.warn("TaskbarManager", "EventManager 不可用，无法注册 Ctrl 键监听");
            return;
        }
        
        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
        
        // 用于跟踪Ctrl键是否被单独按下（不与其他键组合）
        let ctrlKeyDownTime = 0;
        let otherKeyPressed = false;
        
        // 注册 keydown 事件处理程序
        EventManager.registerEventHandler(exploitPid, 'keydown', (e) => {
            // 检查是否按下了Ctrl键
            if (e.key === 'Control' || e.key === 'Ctrl') {
                // 确保没有同时按下其他修饰键（Alt、Shift、Meta）
                if (e.altKey || e.shiftKey || e.metaKey) {
                    return;
                }
                
                // 检查是否在输入框中（如果是，则不处理）
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                )) {
                    return;
                }
                
                // 记录Ctrl键按下时间
                ctrlKeyDownTime = Date.now();
                otherKeyPressed = false;
                
                // 阻止默认行为
                e.preventDefault();
                e.stopPropagation();
                
            } else if (e.ctrlKey && ctrlKeyDownTime > 0) {
                // 如果Ctrl键已按下，但随后按下了其他键，则取消操作
                otherKeyPressed = true;
                ctrlKeyDownTime = 0;
            }
        }, {
            priority: 5,  // 高优先级
            useCapture: true
        });
        
        // 注册 keyup 事件处理程序
        EventManager.registerEventHandler(exploitPid, 'keyup', (e) => {
            if (e.key === 'Control' || e.key === 'Ctrl') {
                // 检查是否只按下了Ctrl键（没有其他键被按下）
                if (ctrlKeyDownTime > 0 && !otherKeyPressed) {
                    const pressDuration = Date.now() - ctrlKeyDownTime;
                    // 如果按下时间在合理范围内（50-1000ms），则触发
                    if (pressDuration >= 50 && pressDuration <= 1000) {
                        // 切换开始菜单
                        const launcherIcon = document.querySelector('.taskbar-app-launcher');
                        if (launcherIcon) {
                            TaskbarManager._toggleAppLauncher(launcherIcon);
                        }
                    }
                }
                
                // 重置状态
                ctrlKeyDownTime = 0;
                otherKeyPressed = false;
            }
        }, {
            priority: 5,  // 高优先级
            useCapture: true,
            passive: true
        });
        
        TaskbarManager._winKeyListenerRegistered = true;
        KernelLogger.info("TaskbarManager", "Ctrl键监听已注册（用于切换开始菜单）");
    }
    
    /**
     * 注册全局快捷键监听器
     * 包括 Ctrl+R 启动运行程序
     */
    static _registerGlobalShortcuts() {
        // 防止重复注册
        if (TaskbarManager._globalShortcutsRegistered) {
            return;
        }
        
        if (typeof EventManager === 'undefined') {
            KernelLogger.warn("TaskbarManager", "EventManager 不可用，无法注册全局快捷键");
            return;
        }
        
        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
        
        EventManager.registerEventHandler(exploitPid, 'keydown', (e) => {
            // Ctrl+R: 启动运行程序（完全禁用刷新页面）
            if (e.ctrlKey && (e.key === 'r' || e.key === 'R') && !e.shiftKey && !e.altKey && !e.metaKey) {
                // 始终阻止默认行为（防止浏览器刷新页面）
                e.preventDefault();
                e.stopPropagation();
                
                // 检查是否在输入框中（如果是，则不启动运行程序，只阻止刷新）
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                )) {
                    // 在输入框中，只阻止刷新，不启动运行程序
                    return;
                }
                
                // 启动运行程序
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.startProgram === 'function') {
                    ProcessManager.startProgram('run', {})
                        .then((pid) => {
                            KernelLogger.info("TaskbarManager", `运行程序已启动 (PID: ${pid})`);
                        })
                        .catch((error) => {
                            KernelLogger.error("TaskbarManager", `启动运行程序失败: ${error.message}`, error);
                        });
                } else {
                    KernelLogger.warn("TaskbarManager", "ProcessManager 不可用，无法启动运行程序");
                }
            }
            
            // Ctrl+X: 启动设置程序（如果已运行则聚焦）
            if (e.ctrlKey && (e.key === 'x' || e.key === 'X') && !e.shiftKey && !e.altKey && !e.metaKey) {
                // 检查是否在输入框中（如果是，则不启动设置程序）
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                )) {
                    // 在输入框中，不处理（让用户正常输入）
                    return;
                }
                
                // 始终阻止默认行为（防止浏览器默认行为）
                e.preventDefault();
                e.stopPropagation();
                
                // 检查设置程序是否已在运行
                let settingsPid = null;
                if (typeof ProcessManager !== 'undefined' && ProcessManager.PROCESS_TABLE) {
                    for (const [pid, processInfo] of ProcessManager.PROCESS_TABLE) {
                        if (processInfo.programName === 'settings' && processInfo.status === 'running') {
                            settingsPid = pid;
                            break;
                        }
                    }
                }
                
                if (settingsPid !== null) {
                    // 设置程序已在运行，聚焦窗口
                    TaskbarManager._restoreProgram(settingsPid);
                    KernelLogger.info("TaskbarManager", `设置程序已在运行 (PID: ${settingsPid})，聚焦窗口`);
                } else {
                    // 设置程序未运行，启动程序
                    if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.startProgram === 'function') {
                        ProcessManager.startProgram('settings', {})
                            .then((pid) => {
                                KernelLogger.info("TaskbarManager", `设置程序已启动 (PID: ${pid})`);
                            })
                            .catch((error) => {
                                KernelLogger.error("TaskbarManager", `启动设置程序失败: ${error.message}`, error);
                            });
                    } else {
                        KernelLogger.warn("TaskbarManager", "ProcessManager 不可用，无法启动设置程序");
                    }
                }
            }
            
            // Ctrl+L: 锁定屏幕
            if (e.ctrlKey && (e.key === 'l' || e.key === 'L') && !e.shiftKey && !e.altKey && !e.metaKey) {
                // 检查是否在输入框中（如果是，则不锁定屏幕）
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                )) {
                    // 在输入框中，不处理（让用户正常输入）
                    return;
                }
                
                // 始终阻止默认行为（防止浏览器默认行为）
                e.preventDefault();
                e.stopPropagation();
                
                // 锁定屏幕
                TaskbarManager._lockScreen();
            }
            
            // Ctrl+E: 关闭当前焦点窗口（仅在多任务选择器未激活时）
            if (e.ctrlKey && (e.key === 'e' || e.key === 'E') && !e.shiftKey && !e.altKey && !e.metaKey) {
                // 如果多任务选择器已激活，不处理此快捷键（由多任务选择器的 Ctrl+E 处理）
                if (TaskbarManager._taskSwitcherActive) {
                    // 多任务选择器会处理这个快捷键，这里不做任何处理
                    return;
                }
                
                // 检查当前活动元素，如果在输入框、任务栏或桌面上，不处理
                const activeElement = document.activeElement;
                if (activeElement) {
                    // 如果在输入框中，不处理（让用户正常输入）
                    if (activeElement.tagName === 'INPUT' || 
                        activeElement.tagName === 'TEXTAREA' || 
                        activeElement.isContentEditable) {
                        return;
                    }
                    
                    // 如果在任务栏或桌面上，不处理（避免误关闭）
                    const isOnTaskbar = activeElement.closest('#taskbar') !== null;
                    const isOnDesktop = activeElement.closest('#desktop') !== null || 
                                        activeElement.id === 'desktop';
                    if (isOnTaskbar || isOnDesktop) {
                        KernelLogger.debug("TaskbarManager", "在任务栏或桌面上按 Ctrl+E，不关闭窗口");
                        return;
                    }
                }
                
                // 始终阻止默认行为（防止浏览器默认行为）
                e.preventDefault();
                e.stopPropagation();
                
                // 检查是否有焦点窗口
                let focusedPid = null;
                let focusedWindow = null;
                if (typeof GUIManager !== 'undefined') {
                    if (typeof GUIManager.getFocusedWindow === 'function') {
                        focusedWindow = GUIManager.getFocusedWindow();
                        if (focusedWindow) {
                            focusedPid = focusedWindow.pid;
                        }
                    } else if (typeof GUIManager.getFocusedPid === 'function') {
                        focusedPid = GUIManager.getFocusedPid();
                    }
                }
                
                // 验证焦点窗口是否真的存在且有效
                if (focusedPid !== null && focusedPid !== undefined) {
                    // 必须要有焦点窗口信息才能关闭
                    if (!focusedWindow) {
                        KernelLogger.debug("TaskbarManager", "没有焦点窗口信息，Ctrl+E 不执行任何操作");
                        return;
                    }
                    
                    // 检查窗口元素是否还在 DOM 中
                    if (!focusedWindow.window || !focusedWindow.window.parentElement || 
                        !document.body.contains(focusedWindow.window)) {
                        KernelLogger.debug("TaskbarManager", "焦点窗口已从 DOM 中移除，不关闭");
                        return;
                    }
                    
                    // 验证窗口是否真的有焦点
                    if (!focusedWindow.isFocused) {
                        KernelLogger.debug("TaskbarManager", "窗口没有焦点状态，不关闭");
                        return;
                    }
                    
                    // 验证 PID 是否匹配
                    if (focusedWindow.pid !== focusedPid) {
                        KernelLogger.warn("TaskbarManager", `焦点窗口 PID (${focusedWindow.pid}) 与获取的 PID (${focusedPid}) 不匹配，不关闭`);
                        return;
                    }
                    
                    // 检查是否是Exploit程序（PID 10000），不应该关闭
                    if (focusedPid === ProcessManager.EXPLOIT_PID) {
                        KernelLogger.debug("TaskbarManager", "不能关闭Exploit程序");
                        return;
                    }
                    
                    // 验证进程是否真的存在且运行中
                    if (typeof ProcessManager !== 'undefined') {
                        const processInfo = ProcessManager.getProcessInfo(focusedPid);
                        if (!processInfo) {
                            KernelLogger.debug("TaskbarManager", `进程 PID ${focusedPid} 不存在，不关闭`);
                            return;
                        }
                        if (processInfo.status !== 'running') {
                            KernelLogger.debug("TaskbarManager", `进程 PID ${focusedPid} 状态为 ${processInfo.status}，不关闭`);
                            return;
                        }
                        
                        // 记录要关闭的程序信息，用于调试
                        const programName = processInfo.programName || '未知程序';
                        KernelLogger.debug("TaskbarManager", `准备关闭程序: ${programName} (PID: ${focusedPid}, WindowID: ${focusedWindow.windowId})`);
                        
                        // 验证该 PID 是否只有这一个窗口（如果是多窗口程序，只关闭当前窗口）
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.getWindowsByPid === 'function') {
                            const windowsByPid = GUIManager.getWindowsByPid(focusedPid);
                            if (windowsByPid.length > 1) {
                                // 如果该 PID 有多个窗口，只关闭当前焦点窗口，而不是整个进程
                                // 使用 _closeWindow 确保正确关闭窗口，它会自动检查是否需要 kill 进程
                                KernelLogger.info("TaskbarManager", `程序 PID ${focusedPid} 有 ${windowsByPid.length} 个窗口，只关闭焦点窗口 ${focusedWindow.windowId}`);
                                try {
                                    GUIManager._closeWindow(focusedWindow.windowId, false);
                                    KernelLogger.info("TaskbarManager", `已关闭焦点窗口 (WindowID: ${focusedWindow.windowId}, PID: ${focusedPid})`);
                                } catch (error) {
                                    KernelLogger.error("TaskbarManager", `关闭窗口失败: ${error.message}`, error);
                                }
                                return;
                            }
                        }
                    }
                    
                    // 关闭程序（整个进程）
                    if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                        try {
                            ProcessManager.killProgram(focusedPid);
                            KernelLogger.info("TaskbarManager", `已关闭程序进程 (PID: ${focusedPid})`);
                        } catch (error) {
                            KernelLogger.error("TaskbarManager", `关闭程序失败: ${error.message}`, error);
                        }
                    } else {
                        KernelLogger.warn("TaskbarManager", "ProcessManager 不可用，无法关闭程序");
                    }
                } else {
                    // 如果没有焦点窗口，记录调试信息
                    KernelLogger.debug("TaskbarManager", "没有焦点窗口，Ctrl+E 不执行任何操作");
                }
            }
            
            // Ctrl+Q: 切换最大化/最小化当前焦点窗口
            if (e.ctrlKey && (e.key === 'q' || e.key === 'Q') && !e.shiftKey && !e.altKey && !e.metaKey) {
                // 始终阻止默认行为（防止浏览器默认行为）
                e.preventDefault();
                e.stopPropagation();
                
                // 检查是否有焦点窗口
                let focusedWindow = null;
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.getFocusedWindow === 'function') {
                    focusedWindow = GUIManager.getFocusedWindow();
                }
                
                // 如果有焦点窗口，切换最大化/最小化状态
                if (focusedWindow && focusedWindow.windowId) {
                    // 检查是否是Exploit程序（PID 10000），不应该操作
                    if (focusedWindow.pid === ProcessManager.EXPLOIT_PID) {
                        KernelLogger.debug("TaskbarManager", "不能操作Exploit程序");
                        return;
                    }
                    
                    // 如果窗口已最大化，则最小化
                    if (focusedWindow.isMaximized) {
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.minimizeWindow === 'function') {
                            try {
                                GUIManager.minimizeWindow(focusedWindow.windowId);
                                KernelLogger.info("TaskbarManager", `已最小化焦点窗口 (WindowID: ${focusedWindow.windowId}, PID: ${focusedWindow.pid})`);
                            } catch (error) {
                                KernelLogger.error("TaskbarManager", `最小化窗口失败: ${error.message}`, error);
                            }
                        } else {
                            KernelLogger.warn("TaskbarManager", "GUIManager 不可用，无法最小化窗口");
                        }
                    } else {
                        // 如果窗口未最大化（包括已最小化），则最大化
                        // 如果窗口已最小化，先恢复再最大化
                        if (focusedWindow.isMinimized) {
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.restoreWindow === 'function') {
                                try {
                                    GUIManager.restoreWindow(focusedWindow.windowId, true);
                                } catch (error) {
                                    KernelLogger.error("TaskbarManager", `恢复窗口失败: ${error.message}`, error);
                                    return;
                                }
                            }
                        }
                        
                        // 最大化窗口
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.maximizeWindow === 'function') {
                            try {
                                GUIManager.maximizeWindow(focusedWindow.windowId);
                                KernelLogger.info("TaskbarManager", `已最大化焦点窗口 (WindowID: ${focusedWindow.windowId}, PID: ${focusedWindow.pid})`);
                            } catch (error) {
                                KernelLogger.error("TaskbarManager", `最大化窗口失败: ${error.message}`, error);
                            }
                        } else {
                            KernelLogger.warn("TaskbarManager", "GUIManager 不可用，无法最大化窗口");
                        }
                    }
                }
                // 如果没有焦点窗口，不做任何事情（已阻止默认行为）
            }
            
            // Shift+E: 启动新的文件管理器实例
            if (e.shiftKey && (e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // 始终阻止默认行为
                e.preventDefault();
                e.stopPropagation();
                
                // 检查是否在输入框中（如果是，则不启动文件管理器）
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                )) {
                    // 在输入框中，不启动文件管理器
                    return;
                }
                
                // 启动文件管理器程序
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.startProgram === 'function') {
                    ProcessManager.startProgram('filemanager', {})
                        .then((pid) => {
                            KernelLogger.info("TaskbarManager", `文件管理器已启动 (PID: ${pid})`);
                        })
                        .catch((error) => {
                            KernelLogger.error("TaskbarManager", `启动文件管理器失败: ${error.message}`, error);
                        });
                } else {
                    KernelLogger.warn("TaskbarManager", "ProcessManager 不可用，无法启动文件管理器");
                }
            }
        }, {
            priority: 5,  // 高优先级
            useCapture: true
        });
        
        TaskbarManager._globalShortcutsRegistered = true;
        KernelLogger.info("TaskbarManager", "全局快捷键监听已注册（Ctrl+R 启动运行程序，Ctrl+E 关闭窗口，Ctrl+Q 切换最大化/最小化，Shift+E 启动文件管理器，Ctrl+L 锁定屏幕）");
    }
    
    /**
     * 锁定屏幕
     */
    static async _lockScreen() {
        try {
            // 隐藏桌面内容
            const kernelContent = document.getElementById('kernel-content');
            if (kernelContent) {
                kernelContent.style.display = 'none';
            }
            
            // 关闭开始菜单和其他弹窗
            const appMenu = document.getElementById('taskbar-app-menu');
            if (appMenu) {
                appMenu.classList.remove('visible');
            }
            
            // 关闭通知栏
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager._hideNotificationContainer === 'function') {
                NotificationManager._hideNotificationContainer();
            }
            
            // 显示锁屏界面
            if (typeof LockScreen === 'undefined') {
                KernelLogger.warn("TaskbarManager", "LockScreen 未加载，无法锁定屏幕");
                return;
            }
            
            // 如果锁屏已初始化且容器存在，直接显示；否则重新初始化
            if (LockScreen._initialized && LockScreen.container && LockScreen.container.parentElement) {
                // 锁屏已存在且已添加到DOM，显示它
                LockScreen.container.style.display = 'flex';
                LockScreen.container.style.opacity = '1';
                LockScreen.container.style.visibility = 'visible';
                LockScreen.container.classList.remove('lockscreen-fade-out');
                
                // 更新用户信息和时间
                LockScreen._updateTime();
                LockScreen._updateUserInfo().catch(err => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('TaskbarManager', `更新锁屏用户信息失败: ${err.message}`);
                    }
                });
                
                // 刷新每日一言
                if (typeof LockScreen._loadDailyQuote === 'function') {
                    LockScreen._loadDailyQuote().catch(err => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('TaskbarManager', `刷新每日一言失败: ${err.message}`);
                        }
                    });
                }
                
                // 重新设置背景（根据设置决定是否随机）
                LockScreen._setBackground();
                
                // 重置密码输入状态
                if (LockScreen.passwordInput) {
                    LockScreen.passwordInput.value = '';
                    LockScreen.passwordInput.classList.remove('error');
                }
                
                // 隐藏密码输入区域，显示提示文字
                const passwordContainer = document.getElementById('lockscreen-password-container');
                const hintText = document.getElementById('lockscreen-hint');
                if (passwordContainer) {
                    passwordContainer.style.display = 'none';
                }
                if (hintText) {
                    hintText.style.display = 'block';
                }
                
                KernelLogger.info("TaskbarManager", "屏幕已锁定");
            } else {
                // 锁屏未初始化或容器已被删除，重新初始化
                // 如果容器存在但不在DOM中，先清理
                if (LockScreen.container && !LockScreen.container.parentElement) {
                    // 容器已从DOM移除，重置初始化状态以允许重新初始化
                    LockScreen._initialized = false;
                }
                await LockScreen.init();
                KernelLogger.info("TaskbarManager", "锁屏界面已初始化并显示");
            }
        } catch (error) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("TaskbarManager", `锁定屏幕失败: ${error.message}`, error);
            }
        }
    }
    
    /**
     * 渲染任务栏
     * @param {HTMLElement} taskbar 任务栏元素
     */
    static async _renderTaskbar(taskbar) {
        // 确保任务栏已清空（防止重复添加）
        if (taskbar) {
            taskbar.innerHTML = '';
        }
        
        // 获取固定程序列表
        let pinnedPrograms = [];
        if (typeof LStorage !== 'undefined' && typeof LStorage.getSystemStorage === 'function') {
            try {
                const pinned = await LStorage.getSystemStorage('taskbar.pinnedPrograms');
                if (Array.isArray(pinned)) {
                    pinnedPrograms = pinned;
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `获取固定程序列表失败: ${e.message}`);
            }
        }
        
        // 获取正在运行的程序（包括最小化的程序）
        let runningPrograms = [];
        // 按程序名分组，收集所有实例的PID
        const programInstancesMap = new Map(); // Map<programName, Array<{pid, isMinimized}>>
        
        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.PROCESS_TABLE !== 'undefined') {
            try {
                const processTable = ProcessManager.PROCESS_TABLE;
                for (const [pid, processInfo] of processTable) {
                    // Exploit程序：只有在有GUI窗口时才显示在任务栏
                    if (processInfo.isExploit) {
                        // 检查Exploit程序是否有GUI窗口
                        if (typeof GUIManager !== 'undefined') {
                            const windows = GUIManager.getWindowsByPid(pid);
                            // 如果有窗口，显示在任务栏（简化检查：只要有窗口就显示）
                            if (windows.length > 0 && processInfo.status === 'running') {
                                // 检查窗口是否有效（在DOM中且可见）
                                const validWindows = windows.filter(w => 
                                    w.window && 
                                    w.window.parentElement && 
                                    document.body.contains(w.window)
                                );
                                
                                if (validWindows.length > 0) {
                                    // 使用"exploit"作为程序名，但显示为"系统工具"或类似名称
                                    runningPrograms.push({
                                        pid: pid,
                                        programName: 'exploit',
                                        metadata: {
                                            description: '系统工具',
                                            alwaysShowInTaskbar: false
                                        },
                                        isMinimized: processInfo.isMinimized || false
                                    });
                                    
                                    // 收集所有实例
                                    if (!programInstancesMap.has('exploit')) {
                                        programInstancesMap.set('exploit', []);
                                    }
                                    programInstancesMap.get('exploit').push({
                                        pid: pid,
                                        isMinimized: processInfo.isMinimized || false
                                    });
                                }
                            }
                        }
                        continue;
                    }
                    // 排除从终端内启动的CLI程序（它们不需要在任务栏显示）
                    if (processInfo.isCLI && processInfo.launchedFromTerminal) {
                        continue;
                    }
                    // 排除CLI程序创建的独立终端（它们不应该在任务栏显示为"terminal"程序）
                    if (processInfo.isCLITerminal) {
                        continue;
                    }
                    // 只显示运行中的程序（不包括已退出的）
                    if (processInfo.status === 'running') {
                        runningPrograms.push({
                            pid: pid,
                            programName: processInfo.programName,
                            metadata: processInfo.metadata || {},
                            isMinimized: processInfo.isMinimized || false
                        });
                        
                        // 收集所有实例
                        if (!programInstancesMap.has(processInfo.programName)) {
                            programInstancesMap.set(processInfo.programName, []);
                        }
                        programInstancesMap.get(processInfo.programName).push({
                            pid: pid,
                            isMinimized: processInfo.isMinimized || false
                        });
                    }
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `获取运行程序列表失败: ${e.message}`);
            }
        }
        
        // 合并程序列表（去重，优先使用运行中的程序信息）
        const programMap = new Map();
        
        // 检查Exploit程序是否有GUI窗口（程序详情窗口等）
        // 注意：这个检查是为了确保即使上面的循环没有捕获到，也能正确显示
        if (typeof ProcessManager !== 'undefined' && typeof GUIManager !== 'undefined') {
            const exploitPid = ProcessManager.EXPLOIT_PID;
            const exploitProcess = ProcessManager.PROCESS_TABLE.get(exploitPid);
            if (exploitProcess && exploitProcess.status === 'running') {
                const exploitWindows = GUIManager.getWindowsByPid(exploitPid);
                // 如果有GUI窗口，添加到运行程序列表（简化检查：只要有有效窗口就显示）
                if (exploitWindows.length > 0) {
                    // 检查窗口是否有效（在DOM中）
                    const validWindows = exploitWindows.filter(w => 
                        w.window && 
                        w.window.parentElement && 
                        document.body.contains(w.window)
                    );
                    
                    if (validWindows.length > 0) {
                        // 检查是否已经在 programMap 中（避免重复）
                        if (!programMap.has('exploit')) {
                            // 为Exploit程序创建特殊的数据结构
                            programMap.set('exploit', {
                                name: 'exploit',
                                pid: exploitPid,
                                programName: 'exploit',
                                icon: null, // 使用默认图标或系统图标
                                metadata: {
                                    description: '系统工具',
                                    alwaysShowInTaskbar: false
                                },
                                isRunning: true,
                                isMinimized: exploitProcess.isMinimized || false,
                                instances: [{
                                    pid: exploitPid,
                                    isMinimized: exploitProcess.isMinimized || false
                                }]
                            });
                        } else {
                            // 如果已存在，更新状态
                            const existing = programMap.get('exploit');
                            existing.isRunning = true;
                            existing.isMinimized = exploitProcess.isMinimized || false;
                            existing.pid = exploitPid;
                        }
                    }
                }
            }
        }
        
        // 先添加固定程序（无论是否运行都显示）
        for (const programName of pinnedPrograms) {
            // 获取程序信息
            let programInfo = null;
            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.getProgramInfo === 'function') {
                try {
                    programInfo = ApplicationAssetManager.getProgramInfo(programName);
                } catch (e) {
                    // 忽略错误
                }
            }
            
            if (programInfo) {
                programMap.set(programName, {
                    name: programName,
                    icon: programInfo.icon,
                    metadata: programInfo.metadata || {},
                    isRunning: false,
                    isMinimized: false,
                    pid: null,
                    instances: [] // 实例列表
                });
            } else {
                // 即使没有程序信息，也添加到映射中（使用默认图标）
                programMap.set(programName, {
                    name: programName,
                    icon: null,
                    metadata: {},
                    isRunning: false,
                    isMinimized: false,
                    pid: null,
                    instances: []
                });
            }
        }
        
        // 更新运行中的程序状态
        for (const runningProgram of runningPrograms) {
            const existing = programMap.get(runningProgram.programName);
            if (existing) {
                existing.isRunning = true;
                // 对于多实例程序，不设置单个pid，而是使用instances数组
                let instances = programInstancesMap.get(runningProgram.programName) || [];
                
                // 检查是否有多个窗口（包括子窗口）需要显示为实例
                if (typeof GUIManager !== 'undefined') {
                    // 对于每个PID，检查是否有多个窗口（主窗口+子窗口）
                    const pidWindowsMap = new Map(); // Map<pid, windows[]>
                    for (const instance of instances) {
                        if (instance.pid) {
                            const windows = GUIManager.getWindowsByPid(instance.pid);
                            if (windows.length > 0) {
                                // 记录该PID的所有窗口
                                pidWindowsMap.set(instance.pid, windows);
                            }
                        }
                    }
                    
                    // 如果有窗口，扩展instances数组
                    if (pidWindowsMap.size > 0) {
                        const expandedInstances = [];
                        for (const instance of instances) {
                            const windows = pidWindowsMap.get(instance.pid);
                            if (windows && windows.length > 1) {
                                // 有多个窗口，为每个窗口创建一个实例条目
                                windows.forEach((win, index) => {
                                    expandedInstances.push({
                                        pid: instance.pid,
                                        windowId: win.windowId,
                                        isMainWindow: win.isMainWindow || false,
                                        title: win.title || `${runningProgram.programName} (${index + 1})`,
                                        isMinimized: win.isMinimized || instance.isMinimized || false
                                    });
                                });
                            } else if (windows && windows.length === 1) {
                                // 只有一个窗口，包含windowId信息
                                expandedInstances.push({
                                    pid: instance.pid,
                                    windowId: windows[0].windowId,
                                    isMainWindow: windows[0].isMainWindow || false,
                                    title: windows[0].title || runningProgram.programName,
                                    isMinimized: windows[0].isMinimized || instance.isMinimized || false
                                });
                            } else {
                                // 没有窗口，保持原样
                                expandedInstances.push(instance);
                            }
                        }
                        instances = expandedInstances;
                    }
                }
                
                existing.instances = instances;
                // 如果只有一个实例，保持向后兼容
                if (instances.length === 1) {
                    existing.isMinimized = instances[0].isMinimized;
                    existing.pid = instances[0].pid;
                } else if (instances.length > 1) {
                    // 有多个实例，设置第一个实例的PID作为主PID（用于向后兼容）
                    existing.pid = instances[0].pid;
                    // 检查是否有未最小化的实例
                    existing.isMinimized = instances.every(inst => inst.isMinimized);
                } else {
                    // 没有实例（理论上不应该发生，因为程序正在运行）
                    // 保持现有状态，不更新
                    KernelLogger.debug("TaskbarManager", `程序 ${runningProgram.programName} 标记为运行中但没有实例`);
                }
            } else {
                // 如果程序不在固定列表中，也添加到任务栏（仅在运行时显示）
                let programInfo = null;
                if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.getProgramInfo === 'function') {
                    try {
                        programInfo = ApplicationAssetManager.getProgramInfo(runningProgram.programName);
                    } catch (e) {
                        // 忽略错误
                    }
                }
                
                if (programInfo) {
                    const instances = programInstancesMap.get(runningProgram.programName) || [];
                    programMap.set(runningProgram.programName, {
                        name: runningProgram.programName,
                        icon: programInfo.icon,
                        metadata: programInfo.metadata || {},
                        isRunning: true,
                        isMinimized: instances.length === 1 ? instances[0].isMinimized : instances.every(inst => inst.isMinimized),
                        pid: instances.length > 0 ? instances[0].pid : null,
                        instances: instances
                    });
                }
            }
        }
        
        // 创建左侧容器（应用程序图标）
        const leftContainer = document.createElement('div');
        leftContainer.className = 'taskbar-left-container';
        
        // 根据任务栏位置调整左侧容器样式
        const taskbarPosition = TaskbarManager._taskbarPosition || 'bottom';
        if (taskbarPosition === 'left' || taskbarPosition === 'right') {
            // 侧边任务栏：垂直布局
            leftContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                flex: 1;
                width: 100%;
            `;
        } else {
            // 顶部/底部任务栏：水平布局
            leftContainer.style.cssText = `
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 10px;
                flex: 1;
            `;
        }
        
        // 添加"所有应用程序"收纳图标（在最左侧）
        const appLauncherIcon = TaskbarManager._createAppLauncherIcon();
        leftContainer.appendChild(appLauncherIcon);
        
        // 渲染程序图标
        for (const [programName, programData] of programMap) {
            const iconElement = TaskbarManager._createTaskbarIcon(programName, programData);
            leftContainer.appendChild(iconElement);
        }
        
        // 渲染自定义图标
        for (const [iconId, iconData] of TaskbarManager._customIcons.entries()) {
            const customIconElement = TaskbarManager._createCustomTaskbarIcon(iconData);
            leftContainer.appendChild(customIconElement);
        }
        
        taskbar.appendChild(leftContainer);
        
        // 创建右侧容器（系统组件：网络、时间、电源）
        const rightContainer = document.createElement('div');
        rightContainer.className = 'taskbar-right-container';
        
        // 根据任务栏位置调整右侧容器样式
        const position = taskbarPosition;
        if (position === 'left' || position === 'right') {
            // 侧边任务栏：垂直布局
            rightContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                width: 100%;
                margin-left: 0;
                margin-top: auto;
            `;
        } else {
            // 顶部/底部任务栏：水平布局
            rightContainer.style.cssText = `
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 8px;
                margin-left: auto;
            `;
        }
        
        // 添加右侧系统组件（从左到右：网络、电池、天气、时间、通知、电源）
        const networkDisplay = TaskbarManager._createNetworkDisplay();
        rightContainer.appendChild(networkDisplay);
        
        const batteryDisplay = TaskbarManager._createBatteryDisplay();
        rightContainer.appendChild(batteryDisplay);
        
        // 添加天气组件（在时间之前）
        const weatherDisplay = TaskbarManager._createWeatherDisplay();
        rightContainer.appendChild(weatherDisplay);
        
        const timeDisplay = TaskbarManager._createTimeDisplay();
        rightContainer.appendChild(timeDisplay);
        
        // 添加通知按钮（在电源按钮之前）
        const notificationButton = TaskbarManager._createNotificationButton();
        rightContainer.appendChild(notificationButton);
        
        // 电源选项已集成到开始菜单中，不再需要单独的电源按钮
        // const powerButton = TaskbarManager._createPowerButton();
        // rightContainer.appendChild(powerButton);
        
        taskbar.appendChild(rightContainer);
    }
    
    /**
     * 创建"所有应用程序"收纳图标
     * @returns {HTMLElement} 图标元素
     */
    static _createAppLauncherIcon() {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'taskbar-icon taskbar-app-launcher';
        iconContainer.dataset.appLauncher = 'true';
        
        // 创建图标（使用网格图标）
        const icon = document.createElement('div');
        icon.className = 'app-launcher-icon';
        icon.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.8"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.8"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.8"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.8"/>
            </svg>
        `;
        iconContainer.appendChild(icon);
        
        // 添加工具提示
        const tooltip = document.createElement('div');
        tooltip.className = 'taskbar-icon-tooltip';
        tooltip.textContent = '所有应用程序';
        iconContainer.appendChild(tooltip);
        
        // 点击事件：展开/收起应用程序菜单
        iconContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            TaskbarManager._toggleAppLauncher(iconContainer);
        });
        
        return iconContainer;
    }
    
    /**
     * 关闭所有任务栏弹出组件
     * @param {string} excludeId 要排除的组件ID（不关闭此组件）
     */
    static _closeAllTaskbarPopups(excludeId = null) {
        // 立即停止所有动画并关闭，确保快速切换
        const panels = [
            { id: 'taskbar-app-menu', method: '_hideAppMenu', hasParam: true },
            { id: 'taskbar-time-wheel', method: '_hideTimeWheel', hasParam: false },
            { id: 'taskbar-weather-panel', method: '_hideWeatherPanel', hasParam: false },
            { id: 'taskbar-network-panel', method: '_hideNetworkPanel', hasParam: false },
            { id: 'taskbar-battery-panel', method: '_hideBatteryPanel', hasParam: false },
            { id: 'taskbar-power-menu', method: '_hidePowerMenu', hasParam: true }
        ];
        
        panels.forEach(({ id, method, hasParam }) => {
            // 跳过要排除的组件
            if (excludeId && id === excludeId) {
                return;
            }
            
            const element = document.getElementById(id);
            if (element) {
                // 清除待执行的隐藏定时器
                if (element._hideTimeout) {
                    clearTimeout(element._hideTimeout);
                    element._hideTimeout = null;
                }
                
                // 检查元素是否可见（通过 visible 类或计算样式）
                const computedStyle = getComputedStyle(element);
                const isVisible = element.classList.contains('visible') || 
                                 computedStyle.display !== 'none' ||
                                 (computedStyle.visibility !== 'hidden' && computedStyle.opacity !== '0');
                
                // 如果元素可见，立即隐藏
                if (isVisible) {
                    // 立即停止动画
                    if (typeof AnimateManager !== 'undefined') {
                        AnimateManager.stopAnimation(element);
                        AnimateManager.removeAnimationClasses(element);
                    }
                    // 立即移除 visible 类
                    element.classList.remove('visible');
                    // 立即隐藏元素（强制）
                    element.style.display = 'none';
                    element.style.opacity = '0';
                    element.style.visibility = 'hidden';
                    // 调用关闭方法（用于清理事件监听器等）
                    if (hasParam) {
                        TaskbarManager[method](element, null, true); // 第三个参数表示立即关闭
                    } else {
                        TaskbarManager[method](element, true); // 第二个参数表示立即关闭
                    }
                }
            }
        });
    }
    
    /**
     * 切换应用程序启动器（展开/收起）
     * @param {HTMLElement} launcherIcon 启动器图标元素
     */
    static _toggleAppLauncher(launcherIcon) {
        // 检查是否已存在应用程序菜单
        let appMenu = document.getElementById('taskbar-app-menu');
        
        if (appMenu && appMenu.classList.contains('visible')) {
            // 如果已展开，则收起
            TaskbarManager._hideAppMenu(appMenu, launcherIcon);
        } else {
            // 如果未展开，先关闭其他所有弹出组件，然后展开
            TaskbarManager._closeAllTaskbarPopups('taskbar-app-menu');
            if (!appMenu) {
                appMenu = TaskbarManager._createAppMenu();
            }
            TaskbarManager._showAppMenu(appMenu, launcherIcon);
        }
    }
    
    /**
     * 创建开始菜单，左右分栏布局）
     * @returns {HTMLElement} 菜单元素
     */
    static _createAppMenu() {
        const menu = document.createElement('div');
        menu.id = 'taskbar-app-menu';
        menu.className = 'taskbar-start-menu-win10';
        
        // 应用主题和风格背景色
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                const currentStyle = themeManager.getCurrentStyle();
                
                // 优先使用风格系统中的开始菜单样式
                if (currentStyle && currentStyle.styles && currentStyle.styles.startMenu) {
                    const startMenuStyle = currentStyle.styles.startMenu;
                    // 检查风格ID或主题ID是否为'glass'
                    const isGlassStyle = currentStyle.id === 'glass' || (currentTheme && currentTheme.id === 'glass');
                    KernelLogger.debug("TaskbarManager", `应用开始菜单样式 - 风格: ${currentStyle.id}, isGlassStyle: ${isGlassStyle}, backdropFilter: ${startMenuStyle.backdropFilter}, background: ${startMenuStyle.background}`);
                    // 使用 setProperty 并设置 important 标志，确保样式优先级高于CSS
                    // 玻璃风格必须使用透明背景以确保 backdrop-filter 生效
                    // 即使配置中有 background 值，也要强制设置为 transparent
                    if (isGlassStyle) {
                        // 玻璃风格：如果有 backdrop-filter 配置，使用它；否则使用默认值
                        const backdropFilter = startMenuStyle.backdropFilter && startMenuStyle.backdropFilter !== 'none' 
                            ? startMenuStyle.backdropFilter 
                            : 'blur(60px) saturate(180%)';
                        KernelLogger.debug("TaskbarManager", `应用玻璃风格开始菜单 - backdrop-filter: ${backdropFilter}, background: transparent`);
                        menu.style.setProperty('backdrop-filter', backdropFilter, 'important');
                        menu.style.setProperty('-webkit-backdrop-filter', backdropFilter, 'important');
                        // 强制设置为透明，忽略配置中的 background 值
                        menu.style.setProperty('background', 'transparent', 'important');
                        menu.style.setProperty('background-color', 'transparent', 'important');
                    } else {
                        // 非玻璃风格：删除 backdrop-filter，使用配置的背景
                        KernelLogger.debug("TaskbarManager", `应用非玻璃风格开始菜单 - backdrop-filter: none, background: ${startMenuStyle.background || '主题背景'}`);
                        menu.style.setProperty('backdrop-filter', 'none', 'important');
                        menu.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                        // 可以正常设置背景
                        if (startMenuStyle.background) {
                            menu.style.setProperty('background', startMenuStyle.background, 'important');
                        }
                    }
                    if (startMenuStyle.borderRadius) {
                        menu.style.setProperty('border-radius', startMenuStyle.borderRadius, 'important');
                    }
                    if (startMenuStyle.borderWidth) {
                        menu.style.setProperty('border-width', startMenuStyle.borderWidth, 'important');
                    }
                    if (startMenuStyle.borderColor) {
                        menu.style.setProperty('border-color', startMenuStyle.borderColor, 'important');
                    }
                    if (startMenuStyle.boxShadow) {
                        menu.style.setProperty('box-shadow', startMenuStyle.boxShadow, 'important');
                    }
                } else if (currentTheme && currentTheme.colors) {
                    // 回退到主题背景色
                    // 检查风格ID或主题ID是否为'glass'
                    const isGlassStyle = (currentStyle && currentStyle.id === 'glass') || (currentTheme && currentTheme.id === 'glass');
                    if (isGlassStyle) {
                        // 玻璃风格：设置 backdrop-filter 和透明背景
                        menu.style.setProperty('backdrop-filter', 'blur(60px) saturate(180%)', 'important');
                        menu.style.setProperty('-webkit-backdrop-filter', 'blur(60px) saturate(180%)', 'important');
                        menu.style.setProperty('background', 'transparent', 'important');
                    } else {
                        // 非玻璃风格：删除 backdrop-filter 并设置背景色
                        menu.style.setProperty('backdrop-filter', 'none', 'important');
                        menu.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                        const panelBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                        menu.style.setProperty('background-color', panelBg, 'important');
                    }
                    menu.style.setProperty('border-color', currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(108, 142, 255, 0.2)'), 'important');
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `应用主题到开始菜单失败: ${e.message}`);
            }
        }
        
        // ========== 搜索栏区域 ==========
        const searchBar = document.createElement('div');
        searchBar.className = 'taskbar-start-menu-search';
        searchBar.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            flex-shrink: 0;
        `;
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '搜索程序...';
        searchInput.className = 'taskbar-start-menu-search-input';
        searchInput.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            color: rgba(215, 224, 221, 0.9);
            font-size: 14px;
            outline: none;
            transition: all 0.2s;
        `;
        searchInput.addEventListener('input', (e) => {
            TaskbarManager._handleSearchInput(e.target.value);
        });
        searchInput.addEventListener('focus', () => {
            searchInput.style.background = 'rgba(255, 255, 255, 0.08)';
            searchInput.style.borderColor = 'rgba(139, 92, 246, 0.5)';
        });
        searchInput.addEventListener('blur', () => {
            searchInput.style.background = 'rgba(255, 255, 255, 0.05)';
            searchInput.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        });
        searchBar.appendChild(searchInput);
        
        // 创建主容器（左右分栏）
        const mainContainer = document.createElement('div');
        mainContainer.className = 'taskbar-start-menu-main';
        
        // ========== 左侧：程序列表区域 ==========
        const leftPanel = document.createElement('div');
        leftPanel.className = 'taskbar-start-menu-left';
        
        // 左侧程序列表容器（可滚动）
        const programListContainer = document.createElement('div');
        programListContainer.className = 'taskbar-start-menu-program-list';
        leftPanel.appendChild(programListContainer);
        
        mainContainer.appendChild(leftPanel);
        
        // ========== 右侧：动态磁贴区域 ==========
        const rightPanel = document.createElement('div');
        rightPanel.className = 'taskbar-start-menu-right';
        
        // 右侧标题
        const rightTitle = document.createElement('div');
        rightTitle.className = 'taskbar-start-menu-right-title';
        rightTitle.textContent = '最近使用';
        rightPanel.appendChild(rightTitle);
        
        // 右侧内容区域（最近使用的应用）
        const rightContent = document.createElement('div');
        rightContent.className = 'taskbar-start-menu-right-content';
        rightPanel.appendChild(rightContent);
        
        mainContainer.appendChild(rightPanel);
        
        // ========== 底部：用户信息和电源选项 ==========
        const bottomBar = document.createElement('div');
        bottomBar.className = 'taskbar-start-menu-bottom';
        
        // 用户信息区域（左侧）
        const userSection = document.createElement('div');
        userSection.className = 'taskbar-start-menu-user';
        
        // 用户头像（动态加载）
        const userAvatar = document.createElement('div');
        userAvatar.className = 'taskbar-start-menu-user-avatar';
        userAvatar.id = 'taskbar-start-menu-user-avatar';
        // 默认SVG
        userAvatar.innerHTML = `
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.8"/>
                <path d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="2" fill="none" opacity="0.8"/>
            </svg>
        `;
        userSection.appendChild(userAvatar);
        
        // 用户名
        const userName = document.createElement('div');
        userName.className = 'taskbar-start-menu-user-name';
        userName.id = 'taskbar-start-menu-user-name';
        userName.textContent = '用户';
        userSection.appendChild(userName);
        
        bottomBar.appendChild(userSection);
        
        // 更新用户信息（异步）
        TaskbarManager._updateStartMenuUserInfo();
        
        // 电源选项区域（右侧）
        const powerSection = document.createElement('div');
        powerSection.className = 'taskbar-start-menu-power-section';
        
        // 电源按钮（Windows 10风格：单个按钮，点击展开菜单）
        const powerButton = document.createElement('div');
        powerButton.className = 'taskbar-start-menu-power-button';
        powerButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2V7z" fill="currentColor"/>
            </svg>
        `;
        
        // 电源菜单（悬停或点击时显示）
        const powerMenu = document.createElement('div');
        powerMenu.className = 'taskbar-start-menu-power-menu';
        powerMenu.style.display = 'none';
        
        // 重启选项
        const restartOption = TaskbarManager._createPowerOptionWin10('restart', '重启', () => {
            TaskbarManager._restartSystem();
        });
        powerMenu.appendChild(restartOption);
        
        // 关机选项
        const shutdownOption = TaskbarManager._createPowerOptionWin10('shutdown', '关机', () => {
            TaskbarManager._shutdownSystem();
        }, true); // 危险操作
        powerMenu.appendChild(shutdownOption);
        
        powerSection.appendChild(powerButton);
        powerSection.appendChild(powerMenu);
        
        // 电源按钮点击事件（只响应点击，不响应悬停）
        powerButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = powerMenu.style.display !== 'none' && powerMenu.style.display !== '';
            if (isVisible) {
                powerMenu.style.display = 'none';
                powerMenu.classList.remove('visible');
            } else {
                powerMenu.style.display = 'block';
                powerMenu.classList.add('visible');
            }
        });
        
        // 点击外部区域关闭电源菜单
        document.addEventListener('click', (e) => {
            if (!powerSection.contains(e.target) && !powerMenu.contains(e.target)) {
                powerMenu.style.display = 'none';
                powerMenu.classList.remove('visible');
            }
        });
        
        bottomBar.appendChild(powerSection);
        
        // 组装菜单
        const menuContent = document.createElement('div');
        menuContent.className = 'taskbar-start-menu-content';
        menuContent.appendChild(searchBar);
        menuContent.appendChild(mainContainer);
        menuContent.appendChild(bottomBar);
        
        menu.appendChild(menuContent);
        
        // 添加到任务栏容器（或body）
        const taskbar = document.getElementById('taskbar');
        if (taskbar && taskbar.parentElement) {
            taskbar.parentElement.appendChild(menu);
        } else {
            document.body.appendChild(menu);
        }
        
        // 使用 EventManager 统一管理菜单关闭事件
        if (typeof EventManager !== 'undefined' && typeof EventManager.registerMenu === 'function') {
            EventManager.registerMenu(
                'app-menu',
                menu,
                () => {
                    TaskbarManager._hideAppMenu(menu, null);
                },
                ['.taskbar-app-launcher'] // 排除启动器图标
            );
        } else {
            // 降级方案：使用原有逻辑
            let closeOnClickOutside = null;
            closeOnClickOutside = (e) => {
                const clickedInMenu = menu.contains(e.target);
                const clickedOnLauncher = e.target.closest('.taskbar-app-launcher');
                const clickedInContextMenu = e.target.closest('.taskbar-app-context-menu');
                const clickedOnTaskbar = e.target.closest('#taskbar');
                
                if (clickedInMenu || clickedOnLauncher || clickedInContextMenu || clickedOnTaskbar) {
                    return;
                }
                
                TaskbarManager._hideAppMenu(menu, null);
                if (closeOnClickOutside) {
                    document.removeEventListener('click', closeOnClickOutside, true);
                    document.removeEventListener('mousedown', closeOnClickOutside, true);
                }
            };
            
            menu._closeOnClickOutside = closeOnClickOutside;
            setTimeout(() => {
                document.addEventListener('click', closeOnClickOutside);
                document.addEventListener('mousedown', closeOnClickOutside);
            }, 100);
        }
        
        return menu;
    }
    
    /**
     * 更新开始菜单的用户信息（头像和用户名）
     */
    static async _updateStartMenuUserInfo() {
        if (typeof UserControl === 'undefined') {
            // 如果UserControl未加载，稍后重试
            setTimeout(() => TaskbarManager._updateStartMenuUserInfo(), 500);
            return;
        }
        
        try {
            await UserControl.ensureInitialized();
            
            const currentUser = UserControl.getCurrentUser();
            if (!currentUser) {
                return;
            }
            
            // 更新用户名
            const userNameEl = document.getElementById('taskbar-start-menu-user-name');
            if (userNameEl) {
                userNameEl.textContent = currentUser;
            }
            
            // 更新用户头像
            const userAvatarEl = document.getElementById('taskbar-start-menu-user-avatar');
            if (!userAvatarEl) {
                return;
            }
            
            // 获取最新的用户数据（直接从UserControl获取）
            const userData = UserControl._users && UserControl._users.get ? UserControl._users.get(currentUser) : null;
            const avatarFileName = userData && userData.avatar ? userData.avatar : null;
            
            // 默认SVG
            const defaultSvg = `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.8"/>
                    <path d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="2" fill="none" opacity="0.8"/>
                </svg>
            `;
            
            if (avatarFileName) {
                // 使用FSDirve读取本地文件并转换为base64 data URL
                try {
                    const url = new URL('/system/service/FSDirve.php', window.location.origin);
                    url.searchParams.set('action', 'read_file');
                    url.searchParams.set('path', 'D:/cache/');
                    url.searchParams.set('fileName', avatarFileName);
                    url.searchParams.set('asBase64', 'true');
                    
                    const response = await fetch(url.toString());
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const result = await response.json();
                    if (result.status === 'success' && result.data && result.data.content) {
                        // 确定MIME类型
                        const fileExt = avatarFileName.split('.').pop()?.toLowerCase() || 'jpg';
                        const mimeType = fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' :
                                        fileExt === 'png' ? 'image/png' :
                                        fileExt === 'gif' ? 'image/gif' :
                                        fileExt === 'webp' ? 'image/webp' :
                                        fileExt === 'svg' ? 'image/svg+xml' :
                                        fileExt === 'bmp' ? 'image/bmp' : 'image/jpeg';
                        
                        // 使用图片作为头像
                        userAvatarEl.innerHTML = '';
                        const img = document.createElement('img');
                        img.src = `data:${mimeType};base64,${result.data.content}`;
                        img.style.cssText = `
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                            border-radius: 50%;
                        `;
                        img.onerror = () => {
                            // 如果图片加载失败，使用默认SVG
                            userAvatarEl.innerHTML = defaultSvg;
                        };
                        userAvatarEl.appendChild(img);
                        return;
                    } else {
                        throw new Error(result.message || '读取文件失败');
                    }
                } catch (error) {
                    // 如果读取失败，使用默认SVG
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('TaskbarManager', `开始菜单头像加载失败: ${avatarFileName}, 错误: ${error.message}`);
                    }
                    userAvatarEl.innerHTML = defaultSvg;
                }
            } else {
                // 使用默认SVG
                userAvatarEl.innerHTML = defaultSvg;
            }
        } catch (error) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('TaskbarManager', `更新开始菜单用户信息失败: ${error.message}`, error);
            }
        }
    }
    
    /**
     * 创建电源选项（Windows 10风格）
     * @param {string} iconType 图标类型（'restart', 'shutdown'）
     * @param {string} label 标签文本
     * @param {Function} onClick 点击回调
     * @param {boolean} isDanger 是否为危险操作
     * @returns {HTMLElement} 选项元素
     */
    static _createPowerOptionWin10(iconType, label, onClick, isDanger = false) {
        const option = document.createElement('div');
        option.className = `taskbar-start-menu-power-menu-item${isDanger ? ' danger' : ''}`;
        
        // 创建图标容器
        const iconContainer = document.createElement('div');
        iconContainer.className = 'taskbar-start-menu-power-menu-icon';
        
        // 加载图标（异步）
        TaskbarManager._loadSystemIcon(iconType, iconContainer).catch(e => {
            KernelLogger.warn("TaskbarManager", `加载电源选项图标失败: ${e.message}`);
        });
        
        option.appendChild(iconContainer);
        
        // 创建标签
        const labelElement = document.createElement('div');
        labelElement.className = 'taskbar-start-menu-power-menu-label';
        labelElement.textContent = label;
        option.appendChild(labelElement);
        
        // 添加点击事件
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
            // 点击后关闭菜单
            const menu = document.getElementById('taskbar-app-menu');
            if (menu) {
                TaskbarManager._hideAppMenu(menu, null);
            }
        });
        
        return option;
    }
    
    /**
     * 创建电源选项（旧版，保留兼容性）
     * @param {string} iconType 图标类型（'restart', 'shutdown'）
     * @param {string} label 标签文本
     * @param {Function} onClick 点击回调
     * @param {boolean} isDanger 是否为危险操作
     * @returns {HTMLElement} 选项元素
     */
    static _createPowerOption(iconType, label, onClick, isDanger = false) {
        return TaskbarManager._createPowerOptionWin10(iconType, label, onClick, isDanger);
    }
    
    /**
     * 显示应用程序菜单
     * @param {HTMLElement} menu 菜单元素
     * @param {HTMLElement} launcherIcon 启动器图标元素
     */
    static _showAppMenu(menu, launcherIcon) {
        // 关闭通知栏（互斥显示）
        if (typeof NotificationManager !== 'undefined' && typeof NotificationManager._hideNotificationContainer === 'function') {
            NotificationManager._hideNotificationContainer();
        }
        
        // 如果菜单正在关闭或被强制关闭，不显示
        if (menu && (menu._isClosing || menu._forceClosed)) {
            KernelLogger.debug("TaskbarManager", "开始菜单被强制关闭，阻止显示");
            return;
        }
        
        // 清除之前的隐藏定时器（如果存在）
        if (menu && menu._hideTimeout) {
            clearTimeout(menu._hideTimeout);
            menu._hideTimeout = null;
        }
        
        // 清除关闭标志（但保留强制关闭标志，直到多任务选择器关闭）
        if (menu) {
            menu._isClosing = false;
            // 重置内联样式（确保之前强制隐藏的样式被清除）
            menu.style.display = '';
            menu.style.opacity = '';
            menu.style.visibility = '';
            menu.style.transform = '';
            menu.style.pointerEvents = '';
            menu.style.zIndex = '';
            
            // 重新应用主题样式（确保磨砂玻璃效果等样式不被重置）
            const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
                ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
                : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
            if (themeManager) {
                try {
                    const currentStyle = themeManager.getCurrentStyle();
                    const currentTheme = themeManager.getCurrentTheme();
                    if (currentStyle && currentStyle.styles && currentStyle.styles.startMenu) {
                        const startMenuStyle = currentStyle.styles.startMenu;
                        // 检查风格ID或主题ID是否为'glass'
                        const isGlassStyle = currentStyle.id === 'glass' || (currentTheme && currentTheme.id === 'glass');
                        KernelLogger.debug("TaskbarManager", `重新应用开始菜单样式 - 风格: ${currentStyle.id}, isGlassStyle: ${isGlassStyle}, backdropFilter: ${startMenuStyle.backdropFilter}, background: ${startMenuStyle.background}`);
                        // 使用 setProperty 并设置 important 标志，确保样式优先级高于CSS
                        // 玻璃风格必须使用透明背景以确保 backdrop-filter 生效
                        // 即使配置中有 background 值，也要强制设置为 transparent
                        if (isGlassStyle) {
                            // 玻璃风格：如果有 backdrop-filter 配置，使用它；否则使用默认值
                            const backdropFilter = startMenuStyle.backdropFilter && startMenuStyle.backdropFilter !== 'none' 
                                ? startMenuStyle.backdropFilter 
                                : 'blur(60px) saturate(180%)';
                            KernelLogger.debug("TaskbarManager", `重新应用玻璃风格开始菜单 - backdrop-filter: ${backdropFilter}, background: transparent`);
                            menu.style.setProperty('backdrop-filter', backdropFilter, 'important');
                            menu.style.setProperty('-webkit-backdrop-filter', backdropFilter, 'important');
                            // 强制设置为透明，忽略配置中的 background 值
                            menu.style.setProperty('background', 'transparent', 'important');
                            menu.style.setProperty('background-color', 'transparent', 'important');
                        } else {
                            // 非玻璃风格：删除 backdrop-filter，使用配置的背景
                            KernelLogger.debug("TaskbarManager", `重新应用非玻璃风格开始菜单 - backdrop-filter: none, background: ${startMenuStyle.background || '主题背景'}`);
                            menu.style.setProperty('backdrop-filter', 'none', 'important');
                            menu.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                            // 可以正常设置背景
                            if (startMenuStyle.background) {
                                menu.style.setProperty('background', startMenuStyle.background, 'important');
                            }
                        }
                        if (startMenuStyle.borderRadius) {
                            menu.style.setProperty('border-radius', startMenuStyle.borderRadius, 'important');
                        }
                        if (startMenuStyle.borderWidth) {
                            menu.style.setProperty('border-width', startMenuStyle.borderWidth, 'important');
                        }
                        if (startMenuStyle.borderColor) {
                            menu.style.setProperty('border-color', startMenuStyle.borderColor, 'important');
                        }
                        if (startMenuStyle.boxShadow) {
                            menu.style.setProperty('box-shadow', startMenuStyle.boxShadow, 'important');
                        }
                    } else if (currentTheme && currentTheme.colors) {
                        // 回退到主题背景色
                        const isGlassStyle = currentStyle && currentStyle.id === 'glass';
                        if (isGlassStyle) {
                            // 玻璃风格：设置 backdrop-filter 和透明背景
                            menu.style.setProperty('backdrop-filter', 'blur(60px) saturate(180%)', 'important');
                            menu.style.setProperty('-webkit-backdrop-filter', 'blur(60px) saturate(180%)', 'important');
                            menu.style.setProperty('background', 'transparent', 'important');
                        } else {
                            // 非玻璃风格：删除 backdrop-filter 并设置背景色
                            menu.style.setProperty('backdrop-filter', 'none', 'important');
                            menu.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
                            const panelBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                            menu.style.setProperty('background-color', panelBg, 'important');
                        }
                        menu.style.setProperty('border-color', currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(108, 142, 255, 0.2)'), 'important');
                    }
                } catch (e) {
                    KernelLogger.warn("TaskbarManager", `重新应用主题到开始菜单失败: ${e.message}`);
                }
            }
        }
        
        // 获取所有注册的程序
        let allPrograms = [];
        if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.listAllPrograms === 'function') {
            try {
                allPrograms = ApplicationAssetManager.listAllPrograms();
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `获取所有程序列表失败: ${e.message}`);
            }
        }
        
        // 获取正在运行的程序
        const runningPrograms = new Set();
        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.PROCESS_TABLE !== 'undefined') {
            try {
                const processTable = ProcessManager.PROCESS_TABLE;
                for (const [pid, processInfo] of processTable) {
                    if (!processInfo.isExploit && processInfo.status === 'running') {
                        runningPrograms.add(processInfo.programName);
                    }
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        // 渲染程序列表（Windows 10风格：左侧程序列表）
        const programListContainer = menu.querySelector('.taskbar-start-menu-program-list');
        if (programListContainer) {
            // 清空现有内容
            programListContainer.innerHTML = '';
            // 渲染Windows 10风格的程序列表
            TaskbarManager._renderProgramListWin10(programListContainer, allPrograms, runningPrograms);
        } else {
            // 降级方案：使用旧的渲染方式
            const fallbackList = menu.querySelector('.taskbar-start-menu-list') || menu.querySelector('.taskbar-app-menu-list');
            if (fallbackList) {
                fallbackList.innerHTML = '';
                TaskbarManager._renderCollapsibleCategories(fallbackList, allPrograms, runningPrograms);
            }
        }
        
        // 渲染最近使用的应用（Windows 10风格：右侧磁贴区域）
        const rightContent = menu.querySelector('.taskbar-start-menu-right-content');
        if (rightContent) {
            TaskbarManager._renderRecentApps(rightContent, allPrograms, runningPrograms);
        }
        
        // 保存搜索输入框引用，供搜索功能使用
        const searchInput = menu.querySelector('.taskbar-start-menu-search-input');
        if (searchInput) {
            menu._searchInput = searchInput;
            menu._allPrograms = allPrograms;
            menu._runningPrograms = runningPrograms;
        }
        
        // 计算菜单位置（在启动器图标上方）
        if (launcherIcon) {
            const iconRect = launcherIcon.getBoundingClientRect();
            const taskbar = document.getElementById('taskbar');
            const taskbarRect = taskbar ? taskbar.getBoundingClientRect() : { top: window.innerHeight - 48, left: 0, width: 0 };
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const padding = 10;
            const taskbarWidth = taskbarRect.width || 60; // 默认任务栏宽度
            
            // 根据任务栏位置计算菜单位置
            const position = TaskbarManager._taskbarPosition || 'bottom';
            
            // 更新用户信息（确保显示最新的头像和用户名）
            TaskbarManager._updateStartMenuUserInfo().catch(err => {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('TaskbarManager', `更新开始菜单用户信息失败: ${err.message}`);
                }
            });
            
            // 先显示菜单以获取实际尺寸
            menu.classList.add('visible');
            
            // Windows 10风格菜单的默认尺寸
            const win10MenuWidth = 400;
            const win10MenuHeight = 600;
            
            // 等待DOM更新后获取实际尺寸并调整位置
            setTimeout(() => {
                const menuRect = menu.getBoundingClientRect();
                const actualWidth = menuRect.width || win10MenuWidth;
                const actualHeight = menuRect.height || win10MenuHeight;
                
                let menuLeft;
                let menuTop;
                let menuBottom;
                
                switch (position) {
                    case 'top':
                        // 任务栏在顶部，菜单显示在下方
                        menuLeft = iconRect.left;
                        
                        // 检查左边界
                        if (menuLeft < padding) {
                            menuLeft = padding;
                        }
                        
                        // 检查右边界
                        if (menuLeft + actualWidth > viewportWidth - padding) {
                            menuLeft = viewportWidth - actualWidth - padding;
                        }
                        
                        // 检查下边界（确保不溢出屏幕）
                        menuTop = taskbarRect.bottom + 10;
                        if (menuTop + actualHeight > viewportHeight - padding) {
                            menuTop = Math.max(padding, viewportHeight - actualHeight - padding);
                        }
                        
                        menu.style.left = `${menuLeft}px`;
                        menu.style.top = `${menuTop}px`;
                        menu.style.bottom = '';
                        break;
                        
                    case 'bottom':
                        // 任务栏在底部，菜单显示在上方（默认）
                        menuLeft = iconRect.left;
                        
                        // 检查左边界
                        if (menuLeft < padding) {
                            menuLeft = padding;
                        }
                        
                        // 检查右边界
                        if (menuLeft + actualWidth > viewportWidth - padding) {
                            menuLeft = viewportWidth - actualWidth - padding;
                        }
                        
                        menu.style.left = `${menuLeft}px`;
                        menu.style.bottom = `${viewportHeight - taskbarRect.top + 8}px`;
                        menu.style.top = '';
                        break;
                        
                    case 'left':
                        // 任务栏在左侧，菜单显示在右侧
                        menuTop = iconRect.top;
                        
                        // 检查上边界
                        if (menuTop < padding) {
                            menuTop = padding;
                        }
                        
                        // 检查下边界（确保不溢出屏幕）
                        if (menuTop + actualHeight > viewportHeight - padding) {
                            menuTop = Math.max(padding, viewportHeight - actualHeight - padding);
                        }
                        
                        // 检查右边界（确保不溢出屏幕）
                        menuLeft = taskbarRect.right + 10;
                        if (menuLeft + actualWidth > viewportWidth - padding) {
                            menuLeft = viewportWidth - actualWidth - padding;
                        }
                        
                        menu.style.left = `${menuLeft}px`;
                        menu.style.top = `${menuTop}px`;
                        menu.style.bottom = '';
                        break;
                        
                    case 'right':
                        // 任务栏在右侧，菜单显示在左侧
                        menuTop = iconRect.top;
                        
                        // 检查上边界
                        if (menuTop < padding) {
                            menuTop = padding;
                        }
                        
                        // 检查下边界（确保不溢出屏幕）
                        if (menuTop + actualHeight > viewportHeight - padding) {
                            menuTop = Math.max(padding, viewportHeight - actualHeight - padding);
                        }
                        
                        // 检查左边界（确保不溢出屏幕）
                        menuLeft = taskbarRect.left - actualWidth - 10;
                        if (menuLeft < padding) {
                            menuLeft = padding;
                        }
                        
                        menu.style.left = `${menuLeft}px`;
                        menu.style.top = `${menuTop}px`;
                        menu.style.bottom = '';
                        break;
                }
            }, 0);
        }
        
        // 显示菜单（使用 AnimateManager 添加打开动画）
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.addAnimationClasses(menu, 'MENU', 'OPEN');
        }
        menu.classList.add('visible');
        
        // 如果使用 EventManager，确保菜单已注册（菜单在 _createAppMenu 中已注册）
        if (typeof EventManager !== 'undefined' && typeof EventManager.registerMenu === 'function') {
            // 如果菜单未注册，重新注册
            if (!EventManager._registeredMenus || !EventManager._registeredMenus.has('app-menu')) {
                EventManager.registerMenu(
                    'app-menu',
                    menu,
                    () => {
                        TaskbarManager._hideAppMenu(menu, null);
                    },
                    ['.taskbar-app-launcher']
                );
            }
        }
    }
    
    /**
     * 隐藏应用程序菜单
     * @param {HTMLElement} menu 菜单元素
     * @param {HTMLElement} launcherIcon 启动器图标元素
     */
    static _hideAppMenu(menu, launcherIcon, immediate = false) {
        if (!menu) return;
        
        // 设置关闭标志
        menu._isClosing = true;
        
        // 清除之前的隐藏定时器
        if (menu._hideTimeout) {
            clearTimeout(menu._hideTimeout);
            menu._hideTimeout = null;
        }
        
        // 如果立即关闭，跳过动画
        if (immediate) {
            // 立即停止动画并清理
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.stopAnimation(menu);
                AnimateManager.removeAnimationClasses(menu);
            }
            // 清理可能残留的样式属性
            menu.style.transform = '';
            menu.style.opacity = '';
            menu.style.scale = '';
            menu.style.translateX = '';
            menu.style.translateY = '';
            menu.classList.remove('visible');
            menu._isClosing = false;
        } else {
            // 使用 AnimateManager 添加关闭动画
            let closeDuration = 200; // 默认时长
            if (typeof AnimateManager !== 'undefined') {
                const config = AnimateManager.addAnimationClasses(menu, 'MENU', 'CLOSE');
                closeDuration = config ? config.duration : 200;
            }
            
            menu._hideTimeout = setTimeout(() => {
                menu.classList.remove('visible');
                if (typeof AnimateManager !== 'undefined') {
                    AnimateManager.removeAnimationClasses(menu);
                }
                // 清理可能残留的样式属性
                menu.style.transform = '';
                menu.style.opacity = '';
                menu.style.scale = '';
                menu.style.translateX = '';
                menu.style.translateY = '';
                menu._hideTimeout = null;
                menu._isClosing = false;
            }, closeDuration);
        }
        
        // 从 EventManager 注销菜单
        if (typeof EventManager !== 'undefined' && typeof EventManager.unregisterMenu === 'function') {
            EventManager.unregisterMenu('app-menu');
        } else {
            // 降级方案：清理事件监听器
            if (menu._closeOnClickOutside) {
                document.removeEventListener('click', menu._closeOnClickOutside, true);
                document.removeEventListener('mousedown', menu._closeOnClickOutside, true);
                menu._closeOnClickOutside = null;
            }
        }
    }
    
    /**
     * 渲染折叠式类别列表（类似Ubuntu风格）
     * @param {HTMLElement} menu 菜单元素
     * @param {Array} allPrograms 所有程序列表
     * @param {Set} runningPrograms 正在运行的程序集合
     */
    static _renderCollapsibleCategories(container, allPrograms, runningPrograms) {
        // container 可以是程序列表容器元素，也可以是菜单元素（向后兼容）
        let programList = container;
        
        // 如果传入的是菜单元素，查找程序列表容器
        if (container && container.classList && !container.classList.contains('taskbar-start-menu-list') && !container.classList.contains('taskbar-app-menu-list')) {
            programList = container.querySelector('.taskbar-start-menu-list') || container.querySelector('.taskbar-app-menu-list');
        }
        
        if (!programList) return;
        
        programList.innerHTML = '';
        
        // 获取所有类别（排除"全部程序"）
        let categories = [];
        if (typeof getAllCategories === 'function') {
            categories = getAllCategories().filter(cat => cat.id !== 'all');
        } else {
            // 降级方案：使用默认类别
            categories = [
                { id: 'system', name: '系统应用' },
                { id: 'utility', name: '轻松使用' },
                { id: 'other', name: '其他程序' }
            ];
        }
        
        // 按类别分组程序
        const programsByCategory = {};
        for (const category of categories) {
            programsByCategory[category.id] = [];
        }
        
        // 将程序分配到对应类别
        for (const program of allPrograms) {
            const metadata = program.metadata || {};
            let categoryId = 'other';
            if (typeof getProgramCategory === 'function') {
                categoryId = getProgramCategory(program.name, metadata);
            }
            // 如果类别不在列表中，归类到"其他程序"
            if (!programsByCategory.hasOwnProperty(categoryId)) {
                categoryId = 'other';
            }
            programsByCategory[categoryId].push(program);
        }
        
        // 为每个类别创建折叠式区块
        for (const category of categories) {
            const programs = programsByCategory[category.id] || [];
            if (programs.length === 0) continue; // 跳过空类别
            
            // 创建类别容器
            const categorySection = document.createElement('div');
            categorySection.className = 'taskbar-app-menu-category-section';
            categorySection.dataset.categoryId = category.id;
            
            // 创建类别标题（可点击展开/折叠）
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'taskbar-app-menu-category-header';
            categoryHeader.dataset.categoryId = category.id;
            
            // 展开/折叠图标
            const expandIcon = document.createElement('div');
            expandIcon.className = 'taskbar-app-menu-category-icon';
            expandIcon.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            categoryHeader.appendChild(expandIcon);
            
            // 类别名称和数量
            const categoryName = document.createElement('span');
            categoryName.className = 'taskbar-app-menu-category-name';
            categoryName.textContent = category.name;
            categoryHeader.appendChild(categoryName);
            
            const categoryCount = document.createElement('span');
            categoryCount.className = 'taskbar-app-menu-category-count';
            categoryCount.textContent = `(${programs.length})`;
            categoryHeader.appendChild(categoryCount);
            
            // 创建程序列表容器（默认折叠）
            const categoryPrograms = document.createElement('div');
            categoryPrograms.className = 'taskbar-app-menu-category-programs';
            
            // 创建内容包装器（用于 grid 布局）
            const programsWrapper = document.createElement('div');
            programsWrapper.className = 'taskbar-app-menu-category-programs-wrapper';
            programsWrapper.style.cssText = 'min-height: 0; overflow: hidden;';
            
            // 渲染该类别下的程序
            for (const program of programs) {
                const isRunning = runningPrograms.has(program.name);
                const programItem = TaskbarManager._createAppMenuItem(program, isRunning);
                programsWrapper.appendChild(programItem);
            }
            
            categoryPrograms.appendChild(programsWrapper);
            
            // 点击标题展开/折叠
            categoryHeader.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // 确保元素仍然存在
                if (!categoryHeader || !categoryPrograms || !expandIcon) {
                    return;
                }
                
                const isExpanded = categoryHeader.classList.contains('expanded');
                if (isExpanded) {
                    // 折叠当前类别
                    categoryPrograms.classList.remove('show');
                    // 等待动画完成（300ms）
                    setTimeout(() => {
                        if (typeof AnimateManager !== 'undefined') {
                            AnimateManager.removeAnimationClasses(categoryPrograms);
                        }
                    }, 300);
                    categoryHeader.classList.remove('expanded');
                    expandIcon.style.transform = 'rotate(0deg)';
                } else {
                    // 展开当前类别前，先收起其他所有已展开的类别（手风琴行为）
                    const allCategorySections = programList.querySelectorAll('.taskbar-app-menu-category-section');
                    const collapsePromises = [];
                    
                    allCategorySections.forEach(section => {
                        const otherHeader = section.querySelector('.taskbar-app-menu-category-header');
                        const otherPrograms = section.querySelector('.taskbar-app-menu-category-programs');
                        const otherIcon = otherHeader ? otherHeader.querySelector('.taskbar-app-menu-category-icon') : null;
                        
                        // 跳过当前类别
                        if (otherHeader === categoryHeader || !otherHeader || !otherPrograms) {
                            return;
                        }
                        
                        // 如果其他类别已展开，则收起
                        if (otherHeader.classList.contains('expanded')) {
                            // 立即更新状态，避免重复点击
                            otherHeader.classList.remove('expanded');
                            otherPrograms.classList.remove('show');
                            if (otherIcon) {
                                otherIcon.style.transform = 'rotate(0deg)';
                            }
                            
                            // 等待动画完成（300ms）
                            const collapsePromise = new Promise(resolve => {
                                setTimeout(() => {
                                    if (typeof AnimateManager !== 'undefined') {
                                        AnimateManager.removeAnimationClasses(otherPrograms);
                                    }
                                    resolve();
                                }, 300);
                            });
                            collapsePromises.push(collapsePromise);
                        }
                    });
                    
                    // 等待所有折叠动画完成后再展开当前类别
                    Promise.all(collapsePromises).then(() => {
                        // 使用 requestAnimationFrame 确保 DOM 更新完成
                        requestAnimationFrame(() => {
                            // 展开当前类别
                            categoryPrograms.classList.add('show');
                            categoryHeader.classList.add('expanded');
                            expandIcon.style.transform = 'rotate(90deg)';
                        });
                    }).catch(() => {
                        // 如果 Promise.all 失败，直接展开（降级方案）
                        categoryPrograms.classList.add('show');
                        categoryHeader.classList.add('expanded');
                        expandIcon.style.transform = 'rotate(90deg)';
                    });
                }
            });
            
            categorySection.appendChild(categoryHeader);
            categorySection.appendChild(categoryPrograms);
            programList.appendChild(categorySection);
        }
        
        // 默认展开第一个非空类别（使用动画）
        const firstSection = programList.querySelector('.taskbar-app-menu-category-section');
        if (firstSection) {
            const firstHeader = firstSection.querySelector('.taskbar-app-menu-category-header');
            const firstPrograms = firstSection.querySelector('.taskbar-app-menu-category-programs');
            if (firstHeader && firstPrograms) {
                // 使用 requestAnimationFrame 确保 DOM 更新完成
                requestAnimationFrame(() => {
                    // 展开第一个类别
                    firstPrograms.classList.add('show');
                    firstHeader.classList.add('expanded');
                    const firstIcon = firstHeader.querySelector('.taskbar-app-menu-category-icon');
                    if (firstIcon) {
                        firstIcon.style.transform = 'rotate(90deg)';
                    }
                });
            }
        }
    }
    
    /**
     * 创建应用程序菜单项
     * @param {Object} program 程序信息
     * @param {boolean} isRunning 是否正在运行
     * @returns {HTMLElement} 菜单项元素
     */
    static _createAppMenuItem(program, isRunning) {
        const item = document.createElement('div');
        item.className = 'taskbar-app-menu-item';
        item.dataset.programName = program.name; // 添加程序名称，供 ContextMenuManager 使用
        if (isRunning) {
            item.classList.add('running');
        }
        
        // 创建图标
        const icon = document.createElement('div');
        icon.className = 'taskbar-app-menu-item-icon';
        if (program.icon) {
            const img = document.createElement('img');
            // 转换虚拟路径为实际 URL
            const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                ? ProcessManager.convertVirtualPathToUrl(program.icon)
                : program.icon;
            img.src = iconUrl;
            img.alt = program.metadata?.description || program.name;
            icon.appendChild(img);
        } else {
            const textIcon = document.createElement('div');
            textIcon.className = 'taskbar-app-menu-item-text-icon';
            textIcon.textContent = program.name.charAt(0).toUpperCase();
            icon.appendChild(textIcon);
        }
        item.appendChild(icon);
        
        // 创建信息
        const info = document.createElement('div');
        info.className = 'taskbar-app-menu-item-info';
        
        const name = document.createElement('div');
        name.className = 'taskbar-app-menu-item-name';
        name.textContent = program.metadata?.description || program.name;
        info.appendChild(name);
        
        if (program.metadata?.version) {
            const version = document.createElement('div');
            version.className = 'taskbar-app-menu-item-version';
            version.textContent = `v${program.metadata.version}`;
            info.appendChild(version);
        }
        
        item.appendChild(info);
        
        // 运行状态指示器
        if (isRunning) {
            const indicator = document.createElement('div');
            indicator.className = 'taskbar-app-menu-item-indicator';
            item.appendChild(indicator);
        }
        
        // 点击事件：启动或切换程序
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // 立即获取菜单引用并标记为正在关闭
            const menu = document.getElementById('taskbar-app-menu');
            if (menu) {
                // 设置标志，防止刷新时重新显示菜单
                menu._isClosing = true;
                // 立即开始隐藏动画
                TaskbarManager._hideAppMenu(menu, null);
            }
            
            // 检查程序是否支持多开
            const allowMultipleInstances = program.metadata && program.metadata.allowMultipleInstances === true;
            
            if (isRunning && !allowMultipleInstances) {
                // 如果正在运行且不支持多开，切换最小化/恢复状态
                const processTable = ProcessManager.PROCESS_TABLE;
                for (const [pid, processInfo] of processTable) {
                    if (processInfo.programName === program.name && processInfo.status === 'running') {
                        if (processInfo.isMinimized) {
                            // 如果已最小化，恢复窗口
                            TaskbarManager._restoreProgram(pid);
                        } else {
                            // 如果未最小化，最小化窗口
                            TaskbarManager._minimizeProgram(pid);
                        }
                        break;
                    }
                }
            } else {
                // 如果未运行，或者支持多开（即使已运行也启动新实例），启动程序
                ProcessManager.startProgram(program.name, {})
                    .then((pid) => {
                        KernelLogger.info("TaskbarManager", `程序 ${program.name} 已启动 (PID: ${pid})`);
                        // 记录程序使用
                        TaskbarManager._recordProgramUsage(program.name);
                        // 更新任务栏（确保新启动的程序图标显示）
                        TaskbarManager.update();
                        // 不刷新菜单，因为菜单已经在关闭过程中
                    })
                    .catch((error) => {
                        KernelLogger.error("TaskbarManager", `启动程序 ${program.name} 失败: ${error.message}`);
                        // 如果是单例程序且已在运行，ProcessManager 会抛出错误，这里可以忽略或显示提示
                        if (error.message && error.message.includes('already running') && !allowMultipleInstances) {
                            // 单例程序已在运行，尝试聚焦窗口
                            const processTable = ProcessManager.PROCESS_TABLE;
                            for (const [pid, processInfo] of processTable) {
                                if (processInfo.programName === program.name && processInfo.status === 'running') {
                                    TaskbarManager._restoreProgram(pid);
                                    break;
                                }
                            }
                        }
                    });
            }
        });
        
        // 右键菜单已由全局 ContextMenuManager 接管
        // 确保事件能够正确传播，让 ContextMenuManager 处理
        item.addEventListener('contextmenu', (e) => {
            // 不阻止事件传播，让 ContextMenuManager 处理
            // 只阻止默认的浏览器右键菜单
            e.preventDefault();
        });
        
        return item;
    }
    
    /**
     * 渲染Windows 10风格的程序列表（按字母顺序或类别分组）
     * @param {HTMLElement} container 容器元素
     * @param {Array} allPrograms 所有程序列表
     * @param {Set} runningPrograms 正在运行的程序集合
     */
    static _renderProgramListWin10(container, allPrograms, runningPrograms) {
        if (!container) return;
        
        // 按字母顺序排序程序（使用程序名称，而不是描述）
        const sortedPrograms = [...allPrograms].sort((a, b) => {
            // 优先使用程序名称进行排序
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            return nameA.localeCompare(nameB, 'zh-CN', { numeric: true, sensitivity: 'base' });
        });
        
        // 按首字母分组
        const programsByLetter = {};
        for (const program of sortedPrograms) {
            // 使用程序名称的首字母进行分组
            const programName = program.name;
            const firstChar = programName.charAt(0);
            const firstLetter = firstChar.toUpperCase();
            
            // 判断首字符类型
            let letter;
            if (/[A-Za-z]/.test(firstLetter)) {
                // 英文字母
                letter = firstLetter;
            } else if (/[\u4e00-\u9fa5]/.test(firstChar)) {
                // 中文字符，使用"#"
                letter = '#';
            } else if (/[0-9]/.test(firstChar)) {
                // 数字，使用"#"
                letter = '#';
            } else {
                // 其他字符，使用"#"
                letter = '#';
            }
            
            if (!programsByLetter[letter]) {
                programsByLetter[letter] = [];
            }
            programsByLetter[letter].push(program);
        }
        
        // 渲染每个字母分组（字母顺序：A-Z，然后#）
        const letters = Object.keys(programsByLetter).sort((a, b) => {
            if (a === '#') return 1;  // # 放在最后
            if (b === '#') return -1;
            return a.localeCompare(b);
        });
        
        let itemIndex = 0;
        for (const letter of letters) {
            const programs = programsByLetter[letter];
            const letterStartIndex = itemIndex;
            
            // 创建字母分组标题
            const letterHeader = document.createElement('div');
            letterHeader.className = 'taskbar-start-menu-letter-header';
            letterHeader.textContent = letter;
            letterHeader.style.opacity = '0';
            letterHeader.style.transform = 'translateX(-20px)';
            container.appendChild(letterHeader);
            
            // 为字母标题添加延迟动画（在程序项之前显示）
            setTimeout(() => {
                letterHeader.style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                letterHeader.style.opacity = '1';
                letterHeader.style.transform = 'translateX(0)';
            }, letterStartIndex * 30);
            
            // 创建该字母下的程序列表（添加抽屉动画）
            for (const program of programs) {
                const isRunning = runningPrograms.has(program.name);
                const programItem = TaskbarManager._createAppMenuItemWin10(program, isRunning);
                programItem.style.opacity = '0';
                programItem.style.transform = 'translateX(-30px)';
                container.appendChild(programItem);
                
                // 为每个程序项添加延迟动画（抽屉效果）
                setTimeout(() => {
                    programItem.style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    programItem.style.opacity = '1';
                    programItem.style.transform = 'translateX(0)';
                }, 50 + itemIndex * 30); // 50ms基础延迟 + 每个程序项延迟30ms
                
                itemIndex++;
            }
        }
    }
    
    /**
     * 创建Windows 10风格的应用程序菜单项
     * @param {Object} program 程序信息
     * @param {boolean} isRunning 是否正在运行
     * @returns {HTMLElement} 菜单项元素
     */
    static _createAppMenuItemWin10(program, isRunning) {
        const item = document.createElement('div');
        // 同时添加新旧类名，确保 ContextMenuManager 能够识别
        item.className = 'taskbar-start-menu-program-item taskbar-app-menu-item';
        item.dataset.programName = program.name;
        if (isRunning) {
            item.classList.add('running');
        }
        
        // 创建图标
        const icon = document.createElement('div');
        icon.className = 'taskbar-start-menu-program-icon';
        if (program.icon) {
            const img = document.createElement('img');
            const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                ? ProcessManager.convertVirtualPathToUrl(program.icon)
                : program.icon;
            img.src = iconUrl;
            img.alt = program.metadata?.description || program.name;
            img.onerror = () => {
                // 图标加载失败，使用文字图标
                icon.innerHTML = `<div class="taskbar-start-menu-program-text-icon">${(program.metadata?.description || program.name).charAt(0).toUpperCase()}</div>`;
            };
            icon.appendChild(img);
        } else {
            const textIcon = document.createElement('div');
            textIcon.className = 'taskbar-start-menu-program-text-icon';
            textIcon.textContent = (program.metadata?.description || program.name).charAt(0).toUpperCase();
            icon.appendChild(textIcon);
        }
        item.appendChild(icon);
        
        // 创建程序名称
        const name = document.createElement('div');
        name.className = 'taskbar-start-menu-program-name';
        name.textContent = program.metadata?.description || program.name;
        item.appendChild(name);
        
        // 点击事件：启动或切换程序
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // 立即获取菜单引用并标记为正在关闭
            const menu = document.getElementById('taskbar-app-menu');
            if (menu) {
                menu._isClosing = true;
                TaskbarManager._hideAppMenu(menu, null);
            }
            
            // 检查程序是否支持多开
            const allowMultipleInstances = program.metadata && program.metadata.allowMultipleInstances === true;
            
            if (isRunning && !allowMultipleInstances) {
                // 如果正在运行且不支持多开，切换最小化/恢复状态
                const processTable = ProcessManager.PROCESS_TABLE;
                for (const [pid, processInfo] of processTable) {
                    if (processInfo.programName === program.name && processInfo.status === 'running') {
                        if (processInfo.isMinimized) {
                            TaskbarManager._restoreProgram(pid);
                        } else {
                            TaskbarManager._minimizeProgram(pid);
                        }
                        break;
                    }
                }
            } else {
                // 如果未运行，或者支持多开（即使已运行也启动新实例），启动程序
                const allowMultipleInstances = program.metadata && program.metadata.allowMultipleInstances === true;
                ProcessManager.startProgram(program.name, {})
                    .then((pid) => {
                        KernelLogger.info("TaskbarManager", `程序 ${program.name} 已启动 (PID: ${pid})`);
                        // 记录程序使用
                        TaskbarManager._recordProgramUsage(program.name);
                        TaskbarManager.update();
                    })
                    .catch((error) => {
                        KernelLogger.error("TaskbarManager", `启动程序 ${program.name} 失败: ${error.message}`);
                        // 如果是单例程序且已在运行，ProcessManager 会抛出错误，这里可以忽略或显示提示
                        if (error.message && error.message.includes('already running') && !allowMultipleInstances) {
                            // 单例程序已在运行，尝试聚焦窗口
                            const processTable = ProcessManager.PROCESS_TABLE;
                            for (const [pid, processInfo] of processTable) {
                                if (processInfo.programName === program.name && processInfo.status === 'running') {
                                    TaskbarManager._restoreProgram(pid);
                                    break;
                                }
                            }
                        }
                    });
            }
        });
        
        // 悬停效果
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = '';
        });
        
        return item;
    }
    
    /**
     * 记录程序使用（添加到最近使用列表）
     * @param {string} programName 程序名称
     */
    static _recordProgramUsage(programName) {
        try {
            let recentPrograms = [];
            const stored = localStorage.getItem(TaskbarManager.RECENT_PROGRAMS_KEY);
            if (stored) {
                try {
                    recentPrograms = JSON.parse(stored);
                } catch (e) {
                    KernelLogger.warn("TaskbarManager", `解析最近使用程序列表失败: ${e.message}`);
                }
            }
            
            // 移除已存在的同名程序
            recentPrograms = recentPrograms.filter(p => p.name !== programName);
            
            // 添加到开头
            recentPrograms.unshift({
                name: programName,
                timestamp: Date.now()
            });
            
            // 限制数量
            recentPrograms = recentPrograms.slice(0, TaskbarManager.MAX_RECENT_PROGRAMS);
            
            // 保存到 localStorage
            localStorage.setItem(TaskbarManager.RECENT_PROGRAMS_KEY, JSON.stringify(recentPrograms));
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `记录程序使用失败: ${e.message}`);
        }
    }
    
    /**
     * 获取最近使用的程序列表
     * @returns {Array} 最近使用的程序列表 [{ name, timestamp }]
     */
    static _getRecentPrograms() {
        try {
            const stored = localStorage.getItem(TaskbarManager.RECENT_PROGRAMS_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `获取最近使用程序列表失败: ${e.message}`);
        }
        return [];
    }
    
    /**
     * 处理搜索输入
     * @param {string} searchText 搜索文本
     */
    static _handleSearchInput(searchText) {
        const menu = document.getElementById('taskbar-app-menu');
        if (!menu) return;
        
        const allPrograms = menu._allPrograms || [];
        const runningPrograms = menu._runningPrograms || new Set();
        const programListContainer = menu.querySelector('.taskbar-start-menu-program-list');
        
        if (!programListContainer) return;
        
        if (!searchText || searchText.trim() === '') {
            // 清空搜索，恢复原始列表
            programListContainer.innerHTML = '';
            TaskbarManager._renderProgramListWin10(programListContainer, allPrograms, runningPrograms);
            return;
        }
        
        // 搜索程序（根据程序名称和描述）
        const searchLower = searchText.toLowerCase().trim();
        const filteredPrograms = allPrograms.filter(program => {
            const name = program.name.toLowerCase();
            const description = (program.metadata?.description || '').toLowerCase();
            return name.includes(searchLower) || description.includes(searchLower);
        });
        
        // 清空并渲染搜索结果
        programListContainer.innerHTML = '';
        if (filteredPrograms.length === 0) {
            const noResults = document.createElement('div');
            noResults.style.cssText = `
                padding: 40px 20px;
                text-align: center;
                color: rgba(255, 255, 255, 0.6);
                font-size: 14px;
            `;
            noResults.textContent = `未找到匹配的程序: "${searchText}"`;
            programListContainer.appendChild(noResults);
        } else {
            TaskbarManager._renderProgramListWin10(programListContainer, filteredPrograms, runningPrograms);
        }
    }
    
    /**
     * 渲染最近使用的应用（Windows 10风格：右侧磁贴区域）
     * @param {HTMLElement} container 容器元素
     * @param {Array} allPrograms 所有程序列表
     * @param {Set} runningPrograms 正在运行的程序集合
     */
    static _renderRecentApps(container, allPrograms, runningPrograms) {
        if (!container) return;
        
        // 获取最近使用的程序记录
        const recentRecords = TaskbarManager._getRecentPrograms();
        
        // 创建程序名称到程序对象的映射
        const programMap = new Map();
        for (const program of allPrograms) {
            programMap.set(program.name, program);
        }
        
        // 根据最近使用记录获取程序对象
        const recentPrograms = [];
        for (const record of recentRecords) {
            const program = programMap.get(record.name);
            if (program) {
                recentPrograms.push(program);
            }
        }
        
        // 如果最近使用的程序少于6个，优先添加正在运行的程序
        if (recentPrograms.length < 6) {
            for (const program of allPrograms) {
                if (runningPrograms.has(program.name) && !recentPrograms.find(p => p.name === program.name)) {
                    recentPrograms.push(program);
                    if (recentPrograms.length >= 6) break;
                }
            }
        }
        
        // 如果还是少于6个，添加其他程序
        if (recentPrograms.length < 6) {
            for (const program of allPrograms) {
                if (!recentPrograms.find(p => p.name === program.name)) {
                    recentPrograms.push(program);
                    if (recentPrograms.length >= 6) break;
                }
            }
        }
        
        if (recentPrograms.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: rgba(255, 255, 255, 0.6); font-size: 14px;">
                    暂无最近使用的应用
                </div>
            `;
            return;
        }
        
        // 创建磁贴网格（使用CSS中定义的3列布局，不覆盖样式）
        container.innerHTML = '';
        // 不设置 display 和 gridTemplateColumns，使用 CSS 中定义的样式
        // container.style.display = 'grid';  // 已在 CSS 中定义
        // container.style.gridTemplateColumns = 'repeat(3, 1fr)';  // 已在 CSS 中定义
        // container.style.gap = '14px';  // 已在 CSS 中定义
        // container.style.padding = '20px';  // 已在 CSS 中定义
        
        // 渲染每个磁贴（添加渐显动画）
        let tileIndex = 0;
        for (const program of recentPrograms.slice(0, 6)) {
            const tile = TaskbarManager._createAppTileWin10(program, runningPrograms.has(program.name));
            tile.style.opacity = '0';
            tile.style.transform = 'scale(0.8)';
            container.appendChild(tile);
            
            // 为每个磁贴添加延迟渐显动画
            setTimeout(() => {
                tile.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                tile.style.opacity = '1';
                tile.style.transform = 'scale(1)';
            }, 200 + tileIndex * 80); // 200ms基础延迟 + 每个磁贴80ms间隔
            
            tileIndex++;
        }
    }
    
    /**
     * 创建Windows 10风格的应用程序磁贴
     * @param {Object} program 程序信息
     * @param {boolean} isRunning 是否正在运行
     * @returns {HTMLElement} 磁贴元素
     */
    static _createAppTileWin10(program, isRunning) {
        const tile = document.createElement('div');
        // 同时添加 app-menu-item 类名，确保 ContextMenuManager 能够识别
        tile.className = 'taskbar-start-menu-tile taskbar-app-menu-item';
        tile.dataset.programName = program.name;
        if (isRunning) {
            tile.classList.add('running');
        }
        
        // 创建磁贴图标
        const icon = document.createElement('div');
        icon.className = 'taskbar-start-menu-tile-icon';
        if (program.icon) {
            const img = document.createElement('img');
            const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                ? ProcessManager.convertVirtualPathToUrl(program.icon)
                : program.icon;
            img.src = iconUrl;
            img.alt = program.metadata?.description || program.name;
            img.onerror = () => {
                icon.innerHTML = `<div class="taskbar-start-menu-tile-text-icon">${(program.metadata?.description || program.name).charAt(0).toUpperCase()}</div>`;
            };
            icon.appendChild(img);
        } else {
            const textIcon = document.createElement('div');
            textIcon.className = 'taskbar-start-menu-tile-text-icon';
            textIcon.textContent = (program.metadata?.description || program.name).charAt(0).toUpperCase();
            icon.appendChild(textIcon);
        }
        tile.appendChild(icon);
        
        // 创建程序名称
        const name = document.createElement('div');
        name.className = 'taskbar-start-menu-tile-name';
        name.textContent = program.metadata?.description || program.name;
        tile.appendChild(name);
        
        // 点击事件
        tile.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const menu = document.getElementById('taskbar-app-menu');
            if (menu) {
                menu._isClosing = true;
                TaskbarManager._hideAppMenu(menu, null);
            }
            
            if (isRunning) {
                const processTable = ProcessManager.PROCESS_TABLE;
                for (const [pid, processInfo] of processTable) {
                    if (processInfo.programName === program.name && processInfo.status === 'running') {
                        if (processInfo.isMinimized) {
                            TaskbarManager._restoreProgram(pid);
                        } else {
                            TaskbarManager._minimizeProgram(pid);
                        }
                        break;
                    }
                }
            } else {
                const allowMultipleInstances = program.metadata && program.metadata.allowMultipleInstances === true;
                ProcessManager.startProgram(program.name, {})
                    .then((pid) => {
                        KernelLogger.info("TaskbarManager", `程序 ${program.name} 已启动 (PID: ${pid})`);
                        // 记录程序使用
                        TaskbarManager._recordProgramUsage(program.name);
                        TaskbarManager.update();
                    })
                    .catch((error) => {
                        KernelLogger.error("TaskbarManager", `启动程序 ${program.name} 失败: ${error.message}`);
                        if (error.message && error.message.includes('already running') && !allowMultipleInstances) {
                            const processTable = ProcessManager.PROCESS_TABLE;
                            for (const [pid, processInfo] of processTable) {
                                if (processInfo.programName === program.name && processInfo.status === 'running') {
                                    TaskbarManager._restoreProgram(pid);
                                    break;
                                }
                            }
                        }
                    });
            }
        });
        
        // 右键菜单已由全局 ContextMenuManager 接管
        // 确保事件能够正确传播，让 ContextMenuManager 处理
        tile.addEventListener('contextmenu', (e) => {
            // 不阻止事件传播，让 ContextMenuManager 处理
            // 只阻止默认的浏览器右键菜单
            e.preventDefault();
        });
        
        return tile;
    }
    
    /**
     * 创建程序右键菜单
     * @param {Object} program 程序信息
     * @param {HTMLElement} item 菜单项元素
     * @returns {HTMLElement} 右键菜单元素
     */
    static _createProgramContextMenu(program, item) {
        if (typeof ProcessManager === 'undefined') {
            return null;
        }
        
        // 查找程序的进程信息
        let processInfo = null;
        let pid = null;
        const processTable = ProcessManager.PROCESS_TABLE;
        for (const [p, info] of processTable) {
            if (info.programName === program.name && info.status === 'running') {
                processInfo = info;
                pid = p;
                break;
            }
        }
        
        if (!processInfo || !pid) {
            return null;
        }
        
        const contextMenu = document.createElement('div');
        contextMenu.className = 'taskbar-app-context-menu';
        
        // 恢复/最小化选项
        if (processInfo.isMinimized) {
            const restoreItem = document.createElement('div');
            restoreItem.className = 'taskbar-app-context-menu-item';
            restoreItem.textContent = '恢复';
            restoreItem.addEventListener('click', (e) => {
                e.stopPropagation();
                TaskbarManager._restoreProgram(pid);
                contextMenu.remove();
                // 关闭应用程序菜单
                const appMenu = document.getElementById('taskbar-app-menu');
                if (appMenu) {
                    TaskbarManager._hideAppMenu(appMenu, null);
                }
            });
            contextMenu.appendChild(restoreItem);
        } else {
            const minimizeItem = document.createElement('div');
            minimizeItem.className = 'taskbar-app-context-menu-item';
            minimizeItem.textContent = '最小化';
            minimizeItem.addEventListener('click', (e) => {
                e.stopPropagation();
                TaskbarManager._minimizeProgram(pid);
                contextMenu.remove();
            });
            contextMenu.appendChild(minimizeItem);
        }
        
        // 分隔线
        const separator = document.createElement('div');
        separator.className = 'taskbar-app-context-menu-separator';
        contextMenu.appendChild(separator);
        
        // 关闭选项
        const closeItem = document.createElement('div');
        closeItem.className = 'taskbar-app-context-menu-item taskbar-app-context-menu-item-danger';
        closeItem.textContent = '关闭';
        closeItem.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 特殊处理：Exploit程序只关闭窗口，不kill进程
            if (processInfo.isExploit) {
                // 关闭所有Exploit程序的GUI窗口（包括所有程序详情窗口）
                // 使用 GUIManager._closeWindow 确保正确调用 onClose 回调
                if (typeof GUIManager !== 'undefined') {
                    const windows = GUIManager.getWindowsByPid(pid);
                    // 复制数组，避免迭代时修改
                    const windowsToClose = Array.from(windows);
                    let closedCount = 0;
                    for (const windowInfo of windowsToClose) {
                        // 检查窗口是否有效（在DOM中）
                        if (windowInfo.window && windowInfo.window.parentElement && 
                            document.body.contains(windowInfo.window)) {
                            // 使用 _closeWindow 方法（不强制关闭），它会正确调用 onClose 回调
                            // onClose 回调会处理窗口清理和任务栏更新
                            if (windowInfo.windowId) {
                                GUIManager._closeWindow(windowInfo.windowId, false);
                                closedCount++;
                            }
                        }
                    }
                    // 确保任务栏更新（关闭所有窗口后）
                    setTimeout(() => {
                        if (typeof TaskbarManager !== 'undefined') {
                            TaskbarManager.update();
                        }
                    }, 300);
                    
                    if (typeof KernelLogger !== 'undefined' && closedCount > 0) {
                        KernelLogger.debug("TaskbarManager", `已关闭 ${closedCount} 个 Exploit 程序窗口`);
                    }
                }
            } else {
                // 其他程序：正常kill进程
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                    ProcessManager.killProgram(pid);
                }
            }
            
            contextMenu.remove();
            // 关闭应用程序菜单
            const appMenu = document.getElementById('taskbar-app-menu');
            if (appMenu) {
                TaskbarManager._hideAppMenu(appMenu, null);
            }
        });
        contextMenu.appendChild(closeItem);
        
        return contextMenu;
    }
    
    /**
     * 创建任务栏图标元素
     * @param {string} programName 程序名称
     * @param {Object} programData 程序数据 { name, icon, metadata, isRunning, pid }
     * @returns {HTMLElement} 图标元素
     */
    static _createTaskbarIcon(programName, programData) {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'taskbar-icon';
        iconContainer.dataset.programName = programName;
        if (programData.pid) {
            iconContainer.dataset.pid = programData.pid.toString();
        }
        
        // 如果程序正在运行，添加运行状态类
        if (programData.isRunning) {
            iconContainer.classList.add('running');
            // 如果程序已最小化，添加最小化状态类
            if (programData.isMinimized) {
                iconContainer.classList.add('minimized');
            }
        }
        
        // 创建图标
        const icon = document.createElement('img');
        // 特殊处理：Exploit程序使用专门的图标文件
        if (programName === 'exploit') {
            icon.src = 'exploit.svg';
            icon.alt = '系统工具';
            icon.className = 'taskbar-icon-image';
            iconContainer.appendChild(icon);
        } else if (programData.icon) {
            // 转换虚拟路径为实际 URL
            const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                ? ProcessManager.convertVirtualPathToUrl(programData.icon)
                : programData.icon;
            icon.src = iconUrl;
            icon.alt = programData.metadata.description || programName;
            icon.className = 'taskbar-icon-image';
            iconContainer.appendChild(icon);
        } else {
            // 如果没有图标，尝试从ApplicationAssetManager获取
            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.getIcon === 'function') {
                const programIcon = ApplicationAssetManager.getIcon(programName);
                if (programIcon) {
                    // 转换虚拟路径为实际 URL
                    const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                        ? ProcessManager.convertVirtualPathToUrl(programIcon)
                        : programIcon;
                    icon.src = iconUrl;
                    icon.alt = programData.metadata.description || programName;
                    icon.className = 'taskbar-icon-image';
                    iconContainer.appendChild(icon);
                } else {
                    // 如果仍然没有图标，使用风格相关的默认程序图标
                    icon.style.display = 'none';
                    const defaultIconContainer = document.createElement('div');
                    defaultIconContainer.className = 'taskbar-icon-image';
                    defaultIconContainer.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
                    TaskbarManager._loadSystemIconWithRetry('app-default', defaultIconContainer).catch(e => {
                        KernelLogger.warn("TaskbarManager", `加载默认程序图标失败: ${e.message}，使用文字图标`);
                        // 降级：使用文字图标
                        const textIcon = document.createElement('div');
                        textIcon.className = 'taskbar-icon-text';
                        textIcon.textContent = programName.charAt(0).toUpperCase();
                        iconContainer.appendChild(textIcon);
                    });
                    iconContainer.appendChild(defaultIconContainer);
                }
            } else {
                // 如果ApplicationAssetManager不可用，使用风格相关的默认程序图标
                icon.style.display = 'none';
                const defaultIconContainer = document.createElement('div');
                defaultIconContainer.className = 'taskbar-icon-image';
                defaultIconContainer.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
                TaskbarManager._loadSystemIconWithRetry('app-default', defaultIconContainer).catch(e => {
                    KernelLogger.warn("TaskbarManager", `加载默认程序图标失败: ${e.message}，使用文字图标`);
                    // 降级：使用文字图标
                    const textIcon = document.createElement('div');
                    textIcon.className = 'taskbar-icon-text';
                    textIcon.textContent = programName.charAt(0).toUpperCase();
                    iconContainer.appendChild(textIcon);
                });
                iconContainer.appendChild(defaultIconContainer);
            }
        }
        
        // 添加工具提示
        const tooltip = document.createElement('div');
        tooltip.className = 'taskbar-icon-tooltip';
        tooltip.textContent = programData.metadata.description || programName;
        iconContainer.appendChild(tooltip);
        
        // 动态调整工具提示位置，确保不超出屏幕
        iconContainer.addEventListener('mouseenter', () => {
            // 延迟计算，确保tooltip已渲染
            setTimeout(() => {
                const iconRect = iconContainer.getBoundingClientRect();
                const tooltipRect = tooltip.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const padding = 10;
                
                // 重置transform和位置
                tooltip.style.transform = '';
                tooltip.style.left = '';
                tooltip.style.right = '';
                tooltip.style.top = '';
                tooltip.style.bottom = '';
                
                // 计算tooltip的理想位置（图标上方居中）
                let tooltipLeft = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
                let tooltipTop = iconRect.top - tooltipRect.height - padding;
                
                // 检查左边界
                if (tooltipLeft < padding) {
                    tooltip.style.left = `${padding}px`;
                    tooltip.style.transform = 'translateY(-100%)';
                } else if (tooltipLeft + tooltipRect.width > viewportWidth - padding) {
                    // 检查右边界
                    tooltip.style.right = `${padding}px`;
                    tooltip.style.transform = 'translateY(-100%)';
                } else {
                    // 居中显示
                    tooltip.style.left = '50%';
                    tooltip.style.transform = 'translateX(-50%) translateY(-100%)';
                }
                
                // 检查上边界（如果tooltip在屏幕上方，显示在图标下方）
                if (tooltipTop < padding) {
                    tooltip.style.top = 'auto';
                    tooltip.style.bottom = 'calc(100% + 10px)';
                    // 调整transform，移除translateY(-100%)
                    const currentTransform = tooltip.style.transform || '';
                    tooltip.style.transform = currentTransform.replace('translateY(-100%)', 'translateY(0)');
                } else {
                    tooltip.style.bottom = 'calc(100% + 10px)';
                    tooltip.style.top = 'auto';
                }
            }, 10);
        });
        
        // 检查是否支持多实例且有多个实例
        // 注意：如果instances中包含windowId（子窗口），也应该视为多实例
        const allowMultipleInstances = programData.metadata && programData.metadata.allowMultipleInstances === true;
        // 检查是否有多个窗口（包括子窗口）
        let hasMultipleInstances = false;
        
        // 首先检查instances数组是否已经包含多个窗口（包括子窗口）
        if (programData.instances && programData.instances.length > 1) {
            hasMultipleInstances = true;
        } else if (typeof GUIManager !== 'undefined') {
            // 如果instances数组只有一个或没有，检查所有相关的PID是否有多个窗口
            if (programData.pid) {
                const windows = GUIManager.getWindowsByPid(programData.pid);
                hasMultipleInstances = windows.length > 1;
            } else if (programData.instances && programData.instances.length > 0) {
                // 检查所有instances的PID
                let totalWindows = 0;
                for (const instance of programData.instances) {
                    if (instance.pid) {
                        const windows = GUIManager.getWindowsByPid(instance.pid);
                        totalWindows += windows.length;
                    }
                }
                hasMultipleInstances = totalWindows > 1;
            }
        } else {
            // GUIManager不可用，使用instances数组
            hasMultipleInstances = programData.instances && programData.instances.length > 1;
        }
        
        // 鼠标悬停事件：显示多任务选择器（如果有多个窗口，包括子窗口）
        // 注意：即使程序不支持多实例，如果有多个窗口（主窗口+子窗口），也应该显示实例选择器
        if (hasMultipleInstances) {
            if (typeof EventManager !== 'undefined' && typeof EventManager.registerSelector === 'function') {
                const selectorId = `taskbar-selector-${programName}`;
                
                // 注册选择器（选择器元素会在 _showInstanceSelector 中动态创建并更新）
                EventManager.registerSelector(
                    selectorId,
                    iconContainer,
                    null, // 初始时选择器元素还不存在
                    // onShow
                    () => {
                        const existingSelector = document.getElementById(`instance-selector-${programName}`);
                        if (existingSelector && existingSelector.classList.contains('visible')) {
                            return;
                        }
                        
                        if (TaskbarManager._showingSelector && TaskbarManager._showingSelectorProgramName === programName) {
                            return;
                        }
                        
                        // 实时获取最新的程序数据，包括所有窗口（主窗口+子窗口）
                        const updatedData = TaskbarManager._getUpdatedProgramData(programName) || programData;
                        
                        // 如果instances中没有windowId，尝试从GUIManager获取所有窗口
                        let instances = updatedData.instances || [];
                        if (instances.length > 0 && !instances.some(inst => inst.windowId) && typeof GUIManager !== 'undefined' && updatedData.pid) {
                            const windows = GUIManager.getWindowsByPid(updatedData.pid);
                            if (windows.length > 1) {
                                // 有多个窗口，为每个窗口创建一个实例条目
                                instances = windows.map((win, index) => ({
                                    pid: updatedData.pid,
                                    windowId: win.windowId,
                                    isMainWindow: win.isMainWindow || false,
                                    title: win.title || `${programName} (${index + 1})`,
                                    isMinimized: win.isMinimized || false
                                }));
                            }
                        }
                        
                        if (instances.length > 1) {
                            TaskbarManager._showInstanceSelector(iconContainer, programName, {
                                ...updatedData,
                                instances: instances
                            });
                        }
                    },
                    // onHide
                    () => {
                        TaskbarManager._hideInstanceSelector();
                    },
                    // onClickOutside
                    (e) => {
                        TaskbarManager._hideInstanceSelector();
                    },
                    300,  // showDelay
                    200   // hideDelay
                );
            } else {
                // 降级方案：使用原有逻辑
                let hoverTimer = null;
                
                iconContainer.addEventListener('mouseenter', () => {
                    const existingSelector = document.getElementById(`instance-selector-${programName}`);
                    if (existingSelector && existingSelector.classList.contains('visible')) {
                        return;
                    }
                    
                    if (hoverTimer) {
                        clearTimeout(hoverTimer);
                        hoverTimer = null;
                    }
                    
                    hoverTimer = setTimeout(() => {
                        const existingSelector2 = document.getElementById(`instance-selector-${programName}`);
                        if (existingSelector2 && existingSelector2.classList.contains('visible')) {
                            return;
                        }
                        
                        if (TaskbarManager._showingSelector && TaskbarManager._showingSelectorProgramName === programName) {
                            return;
                        }
                        
                        // 实时获取最新的程序数据，包括所有窗口（主窗口+子窗口）
                        const updatedData = TaskbarManager._getUpdatedProgramData(programName) || programData;
                        
                        // 如果instances中没有windowId，尝试从GUIManager获取所有窗口
                        let instances = updatedData.instances || [];
                        if (instances.length > 0 && !instances.some(inst => inst.windowId) && typeof GUIManager !== 'undefined' && updatedData.pid) {
                            const windows = GUIManager.getWindowsByPid(updatedData.pid);
                            if (windows.length > 1) {
                                // 有多个窗口，为每个窗口创建一个实例条目
                                instances = windows.map((win, index) => ({
                                    pid: updatedData.pid,
                                    windowId: win.windowId,
                                    isMainWindow: win.isMainWindow || false,
                                    title: win.title || `${programName} (${index + 1})`,
                                    isMinimized: win.isMinimized || false
                                }));
                            }
                        }
                        
                        if (instances.length > 1) {
                            TaskbarManager._showInstanceSelector(iconContainer, programName, {
                                ...updatedData,
                                instances: instances
                            });
                        }
                    }, 300);
                });
                
                iconContainer.addEventListener('mouseleave', () => {
                    if (hoverTimer) {
                        clearTimeout(hoverTimer);
                        hoverTimer = null;
                    }
                });
                
                iconContainer._hoverTimer = hoverTimer;
            }
        }
        
        // 点击事件：启动或切换程序
        iconContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 如果有多实例选择器显示，点击图标时关闭选择器并执行默认操作
            if (hasMultipleInstances) {
                TaskbarManager._hideInstanceSelector();
            }
            
            // 隐藏预览窗口（如果存在）
            if (programData.isRunning && programData.pid) {
                const previewId = `taskbar-preview-${programData.pid}`;
                const multiPreviewId = `taskbar-preview-multi-${programData.pid}`;
                const preview = document.getElementById(previewId) || document.getElementById(multiPreviewId);
                if (preview) {
                    TaskbarManager._hideWindowPreview(preview);
                }
            }
            
            // 单实例或非多实例程序，使用原有逻辑
            TaskbarManager._handleIconClick(programName, programData);
        });
        
        // 中键点击事件：关闭所有窗口（包括程序详情窗口）
        iconContainer.addEventListener('auxclick', (e) => {
            // 中键是 button === 1
            if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                
                if (!programData.isRunning || !programData.pid) {
                    return;
                }
                
                // 检查是否是 Exploit 程序（程序详情窗口）
                const processInfo = ProcessManager.PROCESS_TABLE.get(programData.pid);
                if (processInfo && processInfo.isExploit) {
                    // 关闭所有 Exploit 程序的窗口（包括所有程序详情窗口）
                    if (typeof GUIManager !== 'undefined') {
                        const windows = GUIManager.getWindowsByPid(programData.pid);
                        // 复制数组，避免迭代时修改
                        const windowsToClose = Array.from(windows);
                        for (const windowInfo of windowsToClose) {
                            // 使用 _closeWindow 方法（不强制关闭），它会正确调用 onClose 回调
                            if (windowInfo.windowId) {
                                GUIManager._closeWindow(windowInfo.windowId, false);
                            }
                        }
                        // 确保任务栏更新（关闭所有窗口后）
                        setTimeout(() => {
                            if (typeof TaskbarManager !== 'undefined') {
                                TaskbarManager.update();
                            }
                        }, 300);
                    }
                } else {
                    // 其他程序：正常关闭（kill进程）
                    if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                        ProcessManager.killProgram(programData.pid);
                    }
                }
            }
        });
        
        // 添加窗口预览功能（悬停时显示窗口预览）
        // 支持多窗口预览（类似Windows的任务预览）
        if (programData.isRunning && programData.pid) {
            let previewTimer = null;
            let previewElement = null;
            
            iconContainer.addEventListener('mouseenter', () => {
                // 如果支持多开且有多个实例，不显示预览（使用实例选择器）
                // 重新检查是否有多个窗口（因为窗口可能已经变化）
                let currentHasMultipleInstances = hasMultipleInstances;
                if (typeof GUIManager !== 'undefined' && programData.pid) {
                    const windows = GUIManager.getWindowsByPid(programData.pid);
                    currentHasMultipleInstances = windows.length > 1;
                } else if (programData.instances && programData.instances.length > 1) {
                    currentHasMultipleInstances = true;
                }
                
                if (currentHasMultipleInstances) {
                    return;
                }
                
                // 延迟显示预览，避免快速移动时闪烁
                previewTimer = setTimeout(() => {
                    // 检查程序是否支持预览
                    const supportsPreview = TaskbarManager._getProgramSupportsPreview(programData.pid);
                    
                    // 如果支持预览，只在单例运行时显示预览
                    if (supportsPreview) {
                        // 检查是否有多个窗口（通过GUIManager）
                        if (typeof GUIManager !== 'undefined') {
                            const windows = GUIManager.getWindowsByPid(programData.pid);
                            if (windows.length === 1) {
                                // 单个窗口，显示单窗口预览（使用真实快照）
                                const windowElement = windows[0].window;
                                if (windowElement) {
                                    previewElement = TaskbarManager._showWindowPreview(iconContainer, windowElement, programData.pid);
                                }
                            } else if (windows.length > 1) {
                                // 多个窗口（包括子窗口），不显示预览，应该显示实例选择器
                                // 但这里已经检查了hasMultipleInstances，所以不会到这里
                                // 如果到了这里，说明判断逻辑有问题，不显示预览
                            } else {
                                // 没有窗口，尝试通过PID获取
                                const windowElement = TaskbarManager._getWindowElement(programData.pid);
                                if (windowElement) {
                                    previewElement = TaskbarManager._showWindowPreview(iconContainer, windowElement, programData.pid);
                                }
                            }
                        } else {
                            // 降级方案：使用原有逻辑
                            const windowElement = TaskbarManager._getWindowElement(programData.pid);
                            if (windowElement) {
                                previewElement = TaskbarManager._showWindowPreview(iconContainer, windowElement, programData.pid);
                            }
                        }
                    } else {
                        // 不支持预览，如果有多个窗口，不显示预览（应该显示实例选择器）
                        // 单个窗口时显示单窗口预览
                        if (typeof GUIManager !== 'undefined') {
                            const windows = GUIManager.getWindowsByPid(programData.pid);
                            if (windows.length === 1) {
                                // 单个窗口，显示单窗口预览
                                const windowElement = windows[0].window;
                                if (windowElement) {
                                    previewElement = TaskbarManager._showWindowPreview(iconContainer, windowElement, programData.pid);
                                }
                            }
                            // 多个窗口时不显示预览，应该显示实例选择器
                        } else {
                            // 降级方案：使用原有逻辑
                            const windowElement = TaskbarManager._getWindowElement(programData.pid);
                            if (windowElement) {
                                previewElement = TaskbarManager._showWindowPreview(iconContainer, windowElement, programData.pid);
                            }
                        }
                    }
                }, 500); // 500ms延迟，避免快速移动时显示预览
            });
            
            iconContainer.addEventListener('mouseleave', (e) => {
                // 检查鼠标是否移动到预览窗口
                const previewId = `taskbar-preview-${programData.pid}`;
                const preview = document.getElementById(previewId);
                
                // 如果鼠标移动到预览窗口，不隐藏预览
                if (preview && preview.contains(e.relatedTarget)) {
                    return;
                }
                
                if (previewTimer) {
                    clearTimeout(previewTimer);
                    previewTimer = null;
                }
                if (previewElement) {
                    // 延迟隐藏，给用户时间移动到预览窗口
                    setTimeout(() => {
                        // 再次检查鼠标是否在预览窗口或图标上
                        const currentPreview = document.getElementById(previewId);
                        if (currentPreview && !currentPreview.matches(':hover') && !iconContainer.matches(':hover')) {
                            TaskbarManager._hideWindowPreview(previewElement);
                            previewElement = null;
                        }
                    }, 100);
                }
            });
        }
        
        return iconContainer;
    }
    
    /**
     * 处理图标点击事件
     * @param {string} programName 程序名称
     * @param {Object} programData 程序数据
     */
    static _handleIconClick(programName, programData) {
        if (typeof ProcessManager === 'undefined') {
            KernelLogger.warn("TaskbarManager", "ProcessManager 不可用，无法启动程序");
            return;
        }
        
        // 特殊处理：Exploit程序
        if (programName === 'exploit') {
            if (programData.isRunning && programData.pid) {
                // Exploit程序：切换窗口最小化/恢复状态
                const processInfo = ProcessManager.PROCESS_TABLE.get(programData.pid);
                if (processInfo) {
                    if (processInfo.isMinimized) {
                        // 如果已最小化，恢复窗口
                        TaskbarManager._restoreProgram(programData.pid);
                    } else {
                        // 如果未最小化，最小化窗口
                        TaskbarManager._minimizeProgram(programData.pid);
                    }
                } else {
                    // 如果找不到进程信息，尝试聚焦窗口
                    TaskbarManager._focusProgram(programData.pid);
                }
            }
            // Exploit程序不能通过任务栏启动，它总是运行的
            return;
        }
        
        if (programData.isRunning && programData.pid) {
            // 如果程序正在运行，切换最小化/恢复状态
            const processInfo = ProcessManager.PROCESS_TABLE.get(programData.pid);
            if (processInfo) {
                if (processInfo.isMinimized) {
                    // 如果已最小化，恢复窗口
                    TaskbarManager._restoreProgram(programData.pid);
                } else {
                    // 如果未最小化，最小化窗口
                    TaskbarManager._minimizeProgram(programData.pid);
                }
            } else {
                // 如果找不到进程信息，尝试聚焦窗口
                TaskbarManager._focusProgram(programData.pid);
            }
        } else {
            // 如果程序未运行，启动程序
            ProcessManager.startProgram(programName, {})
                .then((pid) => {
                    KernelLogger.info("TaskbarManager", `程序 ${programName} 已启动 (PID: ${pid})`);
                    // 延迟更新任务栏，确保程序已完全启动并注册到进程表
                    setTimeout(() => {
                        TaskbarManager.update();
                    }, 100);
                })
                .catch((error) => {
                    KernelLogger.error("TaskbarManager", `启动程序 ${programName} 失败: ${error.message}`);
                });
        }
    }
    
    /**
     * 最小化程序窗口
     * @param {number} pid 进程ID
     */
    static _minimizeProgram(pid) {
        if (typeof ProcessManager === 'undefined') {
            return;
        }
        
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            return;
        }
        
        // 优先使用GUIManager进行最小化（如果可用）
        if (typeof GUIManager !== 'undefined' && typeof GUIManager.minimizeWindow === 'function') {
            try {
                GUIManager.minimizeWindow(pid);
                // 更新ProcessManager中的状态
                processInfo.isMinimized = true;
                ProcessManager._saveProcessTable(ProcessManager.PROCESS_TABLE);
                KernelLogger.debug("TaskbarManager", `通过GUIManager最小化程序 ${pid}`);
                TaskbarManager.update();
                return;
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `通过GUIManager最小化失败: ${e.message}，使用降级方案`);
            }
        }
        
        // 降级方案：手动处理最小化
        // 获取程序的GUI元素
        const guiElements = ProcessManager.getProgramGUIElements(pid);
        if (guiElements && guiElements.length > 0) {
            // 查找窗口元素（bash-window 或其他窗口容器）
            for (const element of guiElements) {
                if (element.classList && (element.classList.contains('bash-window') || element.classList.contains('zos-gui-window'))) {
                    // 保存窗口位置和大小（保存原始样式，避免累积偏移）
                    const rect = element.getBoundingClientRect();
                    const computedStyle = window.getComputedStyle(element);
                    
                    if (!processInfo.windowState) {
                        processInfo.windowState = {};
                    }
                    
                    // 保存实际显示位置（相对于视口）- 仅用于参考
                    processInfo.windowState.savedLeft = rect.left;
                    processInfo.windowState.savedTop = rect.top;
                    processInfo.windowState.savedWidth = rect.width;
                    processInfo.windowState.savedHeight = rect.height;
                    
                    // 保存当前的样式属性（关键：保存内联样式，而不是计算后的样式）
                    // 这样可以避免累积偏移
                    processInfo.windowState.position = element.style.position || computedStyle.position;
                    processInfo.windowState.left = element.style.left || '';
                    processInfo.windowState.top = element.style.top || '';
                    processInfo.windowState.transform = element.style.transform || '';
                    processInfo.windowState.width = element.style.width || '';
                    processInfo.windowState.height = element.style.height || '';
                    
                    // 标记是否使用默认居中（如果没有任何内联样式，则使用默认居中）
                    const hasCustomPosition = element.style.left || element.style.top || element.style.transform;
                    processInfo.windowState.useDefaultCenter = !hasCustomPosition;
                    
                    // 添加最小化动画类
                    element.classList.add('minimizing');
                    
                    // 使用动画隐藏窗口（使用visibility和opacity，而不是display:none，以保持交互能力）
                    setTimeout(() => {
                        element.style.visibility = 'hidden';
                        element.style.opacity = '0';
                        element.style.pointerEvents = 'none';
                        element.classList.remove('minimizing');
                        element.classList.add('minimized');
                    }, 300);  // 动画持续时间
                    
                    // 标记为最小化
                    processInfo.isMinimized = true;
                    
                    // 保存到 ProcessManager
                    ProcessManager._saveProcessTable(ProcessManager.PROCESS_TABLE);
                    
                    KernelLogger.info("TaskbarManager", `程序 ${pid} 已最小化`);
                    break;
                }
            }
        }
        
        // 更新任务栏
        TaskbarManager.update();
    }
    
    /**
     * 恢复程序窗口
     * @param {number} pid 进程ID
     */
    static _restoreProgram(pid) {
        if (typeof ProcessManager === 'undefined') {
            return;
        }
        
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            return;
        }
        
        // 优先使用GUIManager进行恢复（如果可用）
        if (typeof GUIManager !== 'undefined' && typeof GUIManager.restoreWindow === 'function') {
            try {
                GUIManager.restoreWindow(pid);
                // 更新ProcessManager中的状态
                processInfo.isMinimized = false;
                ProcessManager._saveProcessTable(ProcessManager.PROCESS_TABLE);
                KernelLogger.debug("TaskbarManager", `通过GUIManager恢复程序 ${pid}`);
                TaskbarManager.update();
                return;
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `通过GUIManager恢复失败: ${e.message}，使用降级方案`);
            }
        }
        
        // 降级方案：手动处理恢复
        // 获取程序的GUI元素
        const guiElements = ProcessManager.getProgramGUIElements(pid);
        if (guiElements && guiElements.length > 0) {
            // 查找窗口元素（bash-window 或其他窗口容器）
            for (const element of guiElements) {
                if (element.classList && (element.classList.contains('bash-window') || element.classList.contains('zos-gui-window'))) {
                    // 恢复窗口显示（先显示，但保持最小化状态用于动画）
                    element.style.visibility = '';
                    element.style.opacity = '';
                    element.style.pointerEvents = '';
                    element.style.display = '';
                    element.classList.remove('minimized');
                    element.classList.add('restoring');
                    
                    // 恢复窗口位置和大小（如果有保存的状态）
                    if (processInfo.windowState) {
                        // 如果使用默认居中，恢复默认居中样式
                        if (processInfo.windowState.useDefaultCenter) {
                            element.style.position = 'fixed';
                            element.style.top = '50%';
                            element.style.left = '50%';
                            element.style.transform = 'translate(-50%, -50%)';
                            element.style.width = '';
                            element.style.height = '';
                        } else {
                            // 恢复保存的样式（精确恢复，避免累积偏移）
                            element.style.position = processInfo.windowState.position || 'fixed';
                            element.style.left = processInfo.windowState.left || '';
                            element.style.top = processInfo.windowState.top || '';
                            element.style.transform = processInfo.windowState.transform || '';
                            element.style.width = processInfo.windowState.width || '';
                            element.style.height = processInfo.windowState.height || '';
                        }
                    } else {
                        // 如果没有保存的状态，使用默认居中
                        element.style.position = 'fixed';
                        element.style.top = '50%';
                        element.style.left = '50%';
                        element.style.transform = 'translate(-50%, -50%)';
                        element.style.width = '';
                        element.style.height = '';
                    }
                    
                    // 等待动画完成后移除恢复类
                    setTimeout(() => {
                        element.classList.remove('restoring');
                    }, 300);
                    
                    // 移除最小化标记
                    processInfo.isMinimized = false;
                    
                    // 保存到 ProcessManager
                    ProcessManager._saveProcessTable(ProcessManager.PROCESS_TABLE);
                    
                    // 聚焦窗口
                    setTimeout(() => {
                        TaskbarManager._focusProgram(pid);
                    }, 100);
                    
                    KernelLogger.info("TaskbarManager", `程序 ${pid} 已恢复`);
                    break;
                }
            }
        }
        
        // 延迟更新任务栏，确保窗口状态已恢复
        setTimeout(() => {
            TaskbarManager.update();
        }, 350);  // 等待动画完成（300ms）后再更新
    }
    
    /**
     * 聚焦程序窗口
     * @param {number} pid 进程ID
     */
    static _focusProgram(pid) {
        // 优先使用GUIManager进行聚焦（如果可用）
        if (typeof GUIManager !== 'undefined' && typeof GUIManager.focusWindow === 'function') {
            try {
                GUIManager.focusWindow(pid);
                KernelLogger.debug("TaskbarManager", `通过GUIManager聚焦程序 ${pid}`);
                
                // 如果是终端程序，尝试聚焦输入框
                setTimeout(() => {
                    const windowElement = TaskbarManager._getWindowElement(pid);
                    if (windowElement) {
                        const cmdEl = windowElement.querySelector('.cmd[contenteditable="true"]');
                        if (cmdEl && typeof cmdEl.focus === 'function') {
                            cmdEl.focus();
                        }
                    }
                }, 100);
                return;
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `通过GUIManager聚焦失败: ${e.message}，使用降级方案`);
            }
        }
        
        // 降级方案：手动处理聚焦
        // 查找程序的GUI元素并聚焦
        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getProgramGUIElements === 'function') {
            try {
                const guiElements = ProcessManager.getProgramGUIElements(pid);
                if (guiElements && guiElements.length > 0) {
                    // 查找窗口元素（bash-window 或其他窗口容器）
                    for (const element of guiElements) {
                        if (element.classList && (element.classList.contains('bash-window') || element.classList.contains('zos-gui-window'))) {
                            // 移除所有窗口的焦点状态
                            const allWindows = document.querySelectorAll('.bash-window, .zos-gui-window');
                            allWindows.forEach(win => {
                                win.classList.remove('focused', 'zos-window-focused');
                            });
                            // 添加焦点状态
                            element.classList.add('focused');
                            if (element.classList.contains('zos-gui-window')) {
                                element.classList.add('zos-window-focused');
                            }
                            // 滚动到可见区域
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            
                            // 如果是终端程序，尝试聚焦输入框
                            const cmdEl = element.querySelector('.cmd[contenteditable="true"]');
                            if (cmdEl && typeof cmdEl.focus === 'function') {
                                setTimeout(() => {
                                    cmdEl.focus();
                                }, 100);
                            }
                            break;
                        }
                    }
                } else {
                    // 如果找不到GUI元素，尝试通过 data-pid 查找
                    const programElements = document.querySelectorAll(`[data-pid="${pid}"]`);
                    for (const element of programElements) {
                        if (element.classList && (element.classList.contains('bash-window') || element.classList.contains('zos-gui-window'))) {
                            const allWindows = document.querySelectorAll('.bash-window, .zos-gui-window');
                            allWindows.forEach(win => {
                                win.classList.remove('focused', 'zos-window-focused');
                            });
                            element.classList.add('focused');
                            if (element.classList.contains('zos-gui-window')) {
                                element.classList.add('zos-window-focused');
                            }
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            
                            // 如果是终端程序，尝试聚焦输入框
                            const cmdEl = element.querySelector('.cmd[contenteditable="true"]');
                            if (cmdEl && typeof cmdEl.focus === 'function') {
                                setTimeout(() => {
                                    cmdEl.focus();
                                }, 100);
                            }
                            break;
                        }
                    }
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `聚焦程序 ${pid} 失败: ${e.message}`);
            }
        }
    }
    
    /**
     * 更新任务栏
     */
    static update() {
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            // 清空任务栏，避免重复渲染
            taskbar.innerHTML = '';
            TaskbarManager._renderTaskbar(taskbar).catch(e => {
                KernelLogger.error("TaskbarManager", `更新任务栏失败: ${e.message}`, e);
            });
        }
    }
    
    /**
     * 监听进程变化
     */
    static _observeProcessChanges() {
        // 使用防抖机制，避免频繁更新
        const debouncedUpdate = () => {
            if (TaskbarManager._updateTimer) {
                clearTimeout(TaskbarManager._updateTimer);
            }
            TaskbarManager._updateTimer = setTimeout(() => {
                TaskbarManager.update();
                TaskbarManager._updateTimer = null;
            }, 500);  // 防抖延迟 500ms
        };
        
        // 定期更新任务栏（使用防抖）
        TaskbarManager._observerInterval = setInterval(() => {
            debouncedUpdate();
        }, 2000);  // 每2秒检查一次（实际更新会延迟500ms）
        
        // 监听内核引导完成事件
        if (typeof document !== 'undefined' && document.body) {
            document.body.addEventListener('kernelBootComplete', () => {
                // 延迟一下，确保所有程序都已启动
                setTimeout(() => {
                    TaskbarManager.update();
                }, 500);
            });
        }
    }
    
    /**
     * 显示多任务选择器（用于多实例程序）
     * @param {HTMLElement} iconContainer 任务栏图标容器
     * @param {string} programName 程序名称
     * @param {Object} programData 程序数据
     */
    static _showInstanceSelector(iconContainer, programName, programData) {
        // 如果已经显示了同一个程序的选择器，不重复创建
        const existingSelector = document.getElementById(`instance-selector-${programName}`);
        if (existingSelector && existingSelector.classList.contains('visible')) {
            return;  // 已经显示，不需要重复创建
        }
        
        // 如果正在显示选择器，防止重复调用
        if (TaskbarManager._showingSelector) {
            // 如果是同一个程序，直接返回
            if (TaskbarManager._showingSelectorProgramName === programName) {
                return;
            }
            // 如果是不同程序，等待当前显示完成
            setTimeout(() => {
                TaskbarManager._showInstanceSelector(iconContainer, programName, programData);
            }, 400);
            return;
        }
        
        // 检查是否有任何选择器正在显示（包括正在动画中的）
        const allSelectors = document.querySelectorAll('.taskbar-instance-selector');
        let hasVisibleSelector = false;
        for (const sel of allSelectors) {
            // 如果选择器存在且可见（或正在显示），标记需要关闭
            if (sel && (sel.classList.contains('visible') || sel.style.opacity !== '0')) {
                hasVisibleSelector = true;
                break;
            }
        }
        
        // 如果存在可见的选择器，先关闭它，然后延迟显示新的
        if (hasVisibleSelector) {
            // 只关闭其他程序的选择器，不重置标志
            const oldSelectors = document.querySelectorAll('.taskbar-instance-selector');
            for (const oldSel of oldSelectors) {
                // 如果是要显示的新选择器，跳过
                if (oldSel.id === `instance-selector-${programName}`) {
                    continue;
                }
                oldSel.classList.remove('visible');
                // 如果使用 EventManager，通过 EventManager 更新选择器元素为 null
                if (typeof EventManager !== 'undefined' && typeof EventManager.updateSelectorElement === 'function') {
                    const oldProgramName = oldSel.id.replace('instance-selector-', '');
                    const oldSelectorId = `taskbar-selector-${oldProgramName}`;
                    EventManager.updateSelectorElement(oldSelectorId, null);
                }
                // 延迟移除DOM元素
                setTimeout(() => {
                    if (oldSel.parentElement) {
                        oldSel.parentElement.removeChild(oldSel);
                    }
                }, 300);
            }
            // 等待关闭动画完成后再显示新的
            setTimeout(() => {
                TaskbarManager._showInstanceSelector(iconContainer, programName, programData);
            }, 350);
            return;
        }
        
        // 设置标志，防止重复调用
        TaskbarManager._showingSelector = true;
        TaskbarManager._showingSelectorProgramName = programName;
        
        // 关闭之前的选择器（清理残留的，但不重置标志，因为我们要显示新的）
        const oldSelectors = document.querySelectorAll('.taskbar-instance-selector');
        for (const oldSel of oldSelectors) {
            // 如果是要显示的新选择器，跳过
            if (oldSel.id === `instance-selector-${programName}`) {
                continue;
            }
            oldSel.classList.remove('visible');
            // 如果使用 EventManager，通过 EventManager 更新选择器元素为 null
            if (typeof EventManager !== 'undefined' && typeof EventManager.updateSelectorElement === 'function') {
                const oldProgramName = oldSel.id.replace('instance-selector-', '');
                const oldSelectorId = `taskbar-selector-${oldProgramName}`;
                EventManager.updateSelectorElement(oldSelectorId, null);
            }
            // 延迟移除DOM元素
            setTimeout(() => {
                if (oldSel.parentElement) {
                    oldSel.parentElement.removeChild(oldSel);
                }
            }, 300);
        }
        
        // 创建选择器容器
        const selector = document.createElement('div');
        selector.className = 'taskbar-instance-selector';
        selector.id = `instance-selector-${programName}`;
        
        // 创建标题
        const header = document.createElement('div');
        header.className = 'taskbar-instance-selector-header';
        const programInfo = programData.metadata || {};
        header.textContent = programInfo.description || programName;
        selector.appendChild(header);
        
        // 创建实例列表
        const list = document.createElement('div');
        list.className = 'taskbar-instance-selector-list';
        
        // 重新获取最新的实例信息（确保状态是最新的）
        // 如果instances中已经有windowId（说明是子窗口），直接使用
        // 否则，从进程表获取
        let instances = programData.instances || [];
        
        // 检查instances是否包含windowId（子窗口）
        const hasWindowIds = instances.some(inst => inst.windowId);
        
        if (!hasWindowIds && typeof ProcessManager !== 'undefined' && typeof ProcessManager.PROCESS_TABLE !== 'undefined') {
            // 没有windowId，从进程表获取
            const updatedInstances = [];
            try {
                const processTable = ProcessManager.PROCESS_TABLE;
                for (const [pid, processInfo] of processTable) {
                    if (processInfo.isExploit || 
                        (processInfo.isCLI && processInfo.launchedFromTerminal) ||
                        processInfo.isCLITerminal ||
                        processInfo.status !== 'running' ||
                        processInfo.programName !== programName) {
                        continue;
                    }
                    
                    // 检查该PID是否有多个窗口（包括子窗口）
                    if (typeof GUIManager !== 'undefined') {
                        const windows = GUIManager.getWindowsByPid(pid);
                        if (windows.length > 1) {
                            // 有多个窗口，为每个窗口创建一个实例条目
                            windows.forEach((win) => {
                                updatedInstances.push({
                                    pid: pid,
                                    windowId: win.windowId,
                                    isMainWindow: win.isMainWindow || false,
                                    title: win.title || `${programName} (${updatedInstances.length + 1})`,
                                    isMinimized: win.isMinimized || processInfo.isMinimized || false
                                });
                            });
                        } else {
                            // 只有一个窗口
                            updatedInstances.push({
                                pid: pid,
                                isMinimized: processInfo.isMinimized || false
                            });
                        }
                    } else {
                        // GUIManager不可用，使用基本信息
                        updatedInstances.push({
                            pid: pid,
                            isMinimized: processInfo.isMinimized || false
                        });
                    }
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `获取实例信息失败: ${e.message}`);
            }
            
            if (updatedInstances.length > 0) {
                instances = updatedInstances;
            }
        }
        for (let i = 0; i < instances.length; i++) {
            const instance = instances[i];
            // 实时获取最新的窗口/进程信息，确保 isMinimized 状态是最新的
            let currentIsMinimized = instance.isMinimized;
            if (instance.windowId && typeof GUIManager !== 'undefined') {
                const windowInfo = GUIManager.getWindowInfo(instance.windowId);
                if (windowInfo) {
                    currentIsMinimized = windowInfo.isMinimized || false;
                }
            } else if (typeof ProcessManager !== 'undefined') {
                const processInfo = ProcessManager.PROCESS_TABLE.get(instance.pid);
                if (processInfo) {
                    currentIsMinimized = processInfo.isMinimized || false;
                }
            }
            
            // 创建实例项
            const item = document.createElement('div');
            item.className = 'taskbar-instance-selector-item';
            if (currentIsMinimized) {
                item.classList.add('minimized');
            }
            item.dataset.pid = instance.pid.toString();
            if (instance.windowId) {
                item.dataset.windowId = instance.windowId;
            }
            
            // 创建实例预览容器
            const itemPreview = document.createElement('div');
            itemPreview.className = 'taskbar-instance-selector-item-preview';
            
            // 尝试获取窗口元素并创建预览
            // 如果有windowId，通过windowId获取；否则通过PID获取
            let windowElement = null;
            if (instance.windowId && typeof GUIManager !== 'undefined') {
                const windowInfo = GUIManager.getWindowInfo(instance.windowId);
                if (windowInfo && windowInfo.window) {
                    windowElement = windowInfo.window;
                }
            }
            if (!windowElement) {
                windowElement = TaskbarManager._getWindowElement(instance.pid);
            }
            if (windowElement) {
                // 创建预览缩略图
                const previewThumbnail = TaskbarManager._createWindowThumbnail(windowElement, instance.pid);
                if (previewThumbnail) {
                    itemPreview.appendChild(previewThumbnail);
                } else {
                    // 如果无法创建缩略图，使用图标作为后备
                    const fallbackIcon = document.createElement('div');
                    fallbackIcon.className = 'taskbar-instance-selector-item-icon';
                    if (programData.icon) {
                        const img = document.createElement('img');
                        // 转换虚拟路径为实际 URL
                        const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                            ? ProcessManager.convertVirtualPathToUrl(programData.icon)
                            : programData.icon;
                        img.src = iconUrl;
                        img.alt = programName;
                        fallbackIcon.appendChild(img);
                    } else {
                        fallbackIcon.textContent = programName.charAt(0).toUpperCase();
                    }
                    itemPreview.appendChild(fallbackIcon);
                }
            } else {
                // 如果没有窗口元素，使用图标
                const itemIcon = document.createElement('div');
                itemIcon.className = 'taskbar-instance-selector-item-icon';
                if (programData.icon) {
                    const img = document.createElement('img');
                    // 转换虚拟路径为实际 URL
                    const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                        ? ProcessManager.convertVirtualPathToUrl(programData.icon)
                        : programData.icon;
                    img.src = iconUrl;
                    img.alt = programName;
                    itemIcon.appendChild(img);
                } else {
                    itemIcon.textContent = programName.charAt(0).toUpperCase();
                }
                itemPreview.appendChild(itemIcon);
            }
            item.appendChild(itemPreview);
            
            // 创建实例信息
            const itemInfo = document.createElement('div');
            itemInfo.className = 'taskbar-instance-selector-item-info';
            
            const itemTitle = document.createElement('div');
            itemTitle.className = 'taskbar-instance-selector-item-title';
            // 如果有title（子窗口），使用title；否则使用程序名+序号
            if (instance.title) {
                itemTitle.textContent = instance.title;
            } else {
                itemTitle.textContent = `${programInfo.description || programName} (${i + 1})`;
            }
            itemInfo.appendChild(itemTitle);
            
            const itemSubtitle = document.createElement('div');
            itemSubtitle.className = 'taskbar-instance-selector-item-subtitle';
            // 如果是子窗口，显示窗口类型；否则显示PID
            if (instance.isMainWindow === false) {
                itemSubtitle.textContent = `子窗口 - PID: ${instance.pid}`;
            } else if (instance.isMainWindow === true) {
                itemSubtitle.textContent = `主窗口 - PID: ${instance.pid}`;
            } else {
                itemSubtitle.textContent = `PID: ${instance.pid}`;
            }
            itemInfo.appendChild(itemSubtitle);
            
            item.appendChild(itemInfo);
            
            // 创建关闭按钮
            const closeBtn = document.createElement('div');
            closeBtn.className = 'taskbar-instance-selector-item-close';
            closeBtn.innerHTML = '×';
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // 检查是否是 Exploit 程序（程序详情窗口）
                const processInfo = instance.pid ? ProcessManager.PROCESS_TABLE.get(instance.pid) : null;
                if (processInfo && processInfo.isExploit) {
                    // Exploit 程序：关闭所有窗口（包括所有程序详情窗口）
                    if (typeof GUIManager !== 'undefined') {
                        const windows = GUIManager.getWindowsByPid(instance.pid);
                        // 复制数组，避免迭代时修改
                        const windowsToClose = Array.from(windows);
                        for (const windowInfo of windowsToClose) {
                            // 检查窗口是否有效（在DOM中）
                            if (windowInfo.window && windowInfo.window.parentElement && 
                                document.body.contains(windowInfo.window)) {
                                // 使用 _closeWindow 方法（不强制关闭），它会正确调用 onClose 回调
                                if (windowInfo.windowId) {
                                    GUIManager._closeWindow(windowInfo.windowId, false);
                                }
                            }
                        }
                    }
                } else {
                    // 其他程序：使用 _closeWindow 关闭窗口，它会自动检查是否需要 kill 进程
                    // 这样可以确保窗口正确关闭，并且如果这是最后一个窗口，会自动 kill 进程
                    if (instance.windowId && typeof GUIManager !== 'undefined' && typeof GUIManager._closeWindow === 'function') {
                        GUIManager._closeWindow(instance.windowId, false);
                    } else if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                        // 如果没有 windowId，直接 kill 进程
                        ProcessManager.killProgram(instance.pid);
                    }
                }
                
                TaskbarManager._hideInstanceSelector();
                setTimeout(() => {
                    TaskbarManager.update();
                }, 100);
            });
            item.appendChild(closeBtn);
            
            // 点击实例项：激活或切换最小化状态
            // 点击实例项：激活或切换最小化状态
            // 使用捕获阶段，确保在其他处理程序之前执行
            item.addEventListener('click', (e) => {
                // 阻止事件传播，避免被 onClickOutside 关闭
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // 阻止默认行为
                e.preventDefault();
                
                if (e.target === closeBtn || closeBtn.contains(e.target)) {
                    return; // 如果点击的是关闭按钮，不处理
                }
                
                // 如果是子窗口（有windowId），通过GUIManager聚焦窗口
                if (instance.windowId && typeof GUIManager !== 'undefined') {
                    const windowInfo = GUIManager.getWindowInfo(instance.windowId);
                    if (windowInfo) {
                        if (windowInfo.isMinimized) {
                            GUIManager.restoreWindow(instance.windowId);
                        } else {
                            GUIManager.focusWindow(instance.windowId);
                        }
                    }
                } else {
                    // 主窗口，使用原有逻辑
                    const currentProcessInfo = ProcessManager.PROCESS_TABLE.get(instance.pid);
                    const currentIsMinimized = currentProcessInfo ? (currentProcessInfo.isMinimized || false) : instance.isMinimized;
                    
                    if (currentIsMinimized) {
                        TaskbarManager._restoreProgram(instance.pid);
                    } else {
                        TaskbarManager._minimizeProgram(instance.pid);
                    }
                    TaskbarManager._focusProgram(instance.pid);
                }
                
                // 延迟关闭选择器，等待任务栏更新完成后再重新显示以反映最新状态
                setTimeout(() => {
                    TaskbarManager._hideInstanceSelector();
                    // 重新显示选择器以反映最新状态（延迟更长时间，确保状态已更新）
                    setTimeout(() => {
                        // 重新获取最新的程序数据
                        const updatedProgramData = TaskbarManager._getUpdatedProgramData(programName);
                        if (updatedProgramData && updatedProgramData.instances && updatedProgramData.instances.length > 1) {
                            // 检查是否已经有可见的选择器，避免重复显示
                            const existingSelector = document.getElementById(`instance-selector-${programName}`);
                            if (!existingSelector || !existingSelector.classList.contains('visible')) {
                                TaskbarManager._showInstanceSelector(iconContainer, programName, updatedProgramData);
                            }
                        }
                    }, 450);  // 延迟更长时间，确保最小化/恢复动画和状态更新完成
                }, 100);
            }, true); // 使用捕获阶段，确保在其他处理程序之前执行
            
            list.appendChild(item);
        }
        
        selector.appendChild(list);
        
        // 获取图标位置（在添加到DOM之前）
        const iconRect = iconContainer.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 10;
        
        // 添加到文档
        document.body.appendChild(selector);
        
        // 立即设置初始位置（避免出现在左上角）
        // 先设置一个粗略的位置，后续会精确调整
        selector.style.position = 'fixed';
        selector.style.left = `${iconRect.left}px`;
        selector.style.bottom = `${window.innerHeight - iconRect.top + 8}px`;
        selector.style.top = 'auto';
        selector.style.right = 'auto';
        
        // 等待DOM更新后获取实际尺寸并精确计算位置
        setTimeout(() => {
            const selectorRect = selector.getBoundingClientRect();
            
            // 计算水平位置：图标中心对齐选择器中心
            let selectorLeft = iconRect.left + (iconRect.width / 2) - (selectorRect.width / 2);
            
            // 计算垂直位置：在图标上方（使用 bottom，因为任务栏在底部）
            let selectorBottom = window.innerHeight - iconRect.top + padding;
            
            // 检查右边界
            if (selectorLeft + selectorRect.width > viewportWidth - padding) {
                selectorLeft = viewportWidth - selectorRect.width - padding;
            }
            // 检查左边界
            if (selectorLeft < padding) {
                selectorLeft = padding;
            }
            
            // 检查上边界（如果选择器超出屏幕上方，调整到图标下方）
            const selectorTop = viewportHeight - selectorBottom - selectorRect.height;
            if (selectorTop < padding) {
                // 显示在图标下方
                selectorBottom = window.innerHeight - iconRect.bottom - padding;
            }
            
            // 应用计算后的位置
            selector.style.left = `${selectorLeft}px`;
            selector.style.bottom = `${selectorBottom}px`;
        }, 0);
        
        // 显示选择器
        setTimeout(() => {
            selector.classList.add('visible');
            // 标记图标容器正在显示选择器
            if (iconContainer._isShowingSelector !== undefined) {
                iconContainer._isShowingSelector = true;
            }
            // 重置静态标志（选择器已显示）
            TaskbarManager._showingSelector = false;
            TaskbarManager._showingSelectorProgramName = null;
        }, 10);
        
        // 使用 EventManager 更新选择器元素，让 EventManager 管理所有事件
        if (typeof EventManager !== 'undefined' && typeof EventManager.updateSelectorElement === 'function') {
            const selectorId = `taskbar-selector-${programName}`;
            EventManager.updateSelectorElement(selectorId, selector);
        }
    }
    
    /**
     * 隐藏多任务选择器
     */
    static _hideInstanceSelector() {
        // 重置静态标志
        TaskbarManager._showingSelector = false;
        TaskbarManager._showingSelectorProgramName = null;
        
        const selectors = document.querySelectorAll('.taskbar-instance-selector');
        for (const selector of selectors) {
            selector.classList.remove('visible');
            
            // 重置图标容器的显示标志
            const programName = selector.id.replace('instance-selector-', '');
            const iconContainers = document.querySelectorAll(`[data-program-name="${programName}"]`);
            for (const iconContainer of iconContainers) {
                if (iconContainer._isShowingSelector !== undefined) {
                    iconContainer._isShowingSelector = false;
                }
                if (iconContainer._hoverIsShowing !== undefined) {
                    iconContainer._hoverIsShowing = false;
                }
            }
            
            // 如果使用 EventManager，更新选择器元素为 null（但保留注册，以便下次显示）
            if (typeof EventManager !== 'undefined' && typeof EventManager.updateSelectorElement === 'function') {
                const selectorId = `taskbar-selector-${programName}`;
                // 不注销，只更新元素为 null，这样下次显示时会重新绑定
                EventManager.updateSelectorElement(selectorId, null);
            }
            
            // 延迟移除DOM元素
            setTimeout(() => {
                if (selector.parentElement) {
                    selector.parentElement.removeChild(selector);
                }
            }, 300);
        }
    }
    
    /**
     * 创建时间显示
     * @returns {HTMLElement} 时间显示元素
     */
    static _createTimeDisplay() {
        const timeContainer = document.createElement('div');
        timeContainer.className = 'taskbar-time-display';
        
        // 获取任务栏位置，根据位置调整样式
        const position = TaskbarManager._taskbarPosition || 'bottom';
        
        // 基础样式
        let baseStyle = `
            display: flex;
            justify-content: center;
            padding: 8px 12px;
            min-width: 120px;
            border-radius: 10px;
            cursor: default;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
        `;
        
        // 根据任务栏位置调整样式
        if (position === 'left' || position === 'right') {
            // 侧边任务栏：只显示微型圆形时钟
            baseStyle += `
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 48px;
                width: 48px;
                min-width: 48px;
                margin-right: 0;
                margin-left: 0;
                margin-bottom: 4px;
                padding: 0;
            `;
        } else {
            // 顶部/底部任务栏：水平布局，右对齐
            baseStyle += `
                flex-direction: column;
                align-items: flex-end;
                height: 48px;
                width: auto;
                margin-right: 8px;
                margin-left: auto;
            `;
        }
        
        timeContainer.style.cssText = baseStyle;
        
        // 时间文本
        const timeText = document.createElement('div');
        timeText.className = 'taskbar-time-text';
        
        // 根据任务栏位置调整时间文本样式
        if (position === 'left' || position === 'right') {
            // 侧边任务栏：垂直排列时间数字
            timeText.style.cssText = `
                font-size: 14px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.95);
                line-height: 1.4;
                letter-spacing: 0.5px;
                writing-mode: vertical-lr;
                text-orientation: upright;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            `;
        } else {
            // 顶部/底部任务栏：水平排列
            timeText.style.cssText = `
                font-size: 14px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.95);
                line-height: 1.2;
                letter-spacing: 0.5px;
            `;
        }
        
        // 日期文本
        const dateText = document.createElement('div');
        dateText.className = 'taskbar-date-text';
        
        // 根据任务栏位置调整日期文本样式
        if (position === 'left' || position === 'right') {
            // 侧边任务栏：垂直排列日期
            dateText.style.cssText = `
                font-size: 11px;
                font-weight: 400;
                color: rgba(215, 224, 221, 0.7);
                line-height: 1.4;
                margin-top: 4px;
                writing-mode: vertical-lr;
                text-orientation: upright;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            `;
        } else {
            // 顶部/底部任务栏：水平排列
            dateText.style.cssText = `
                font-size: 11px;
                font-weight: 400;
                color: rgba(215, 224, 221, 0.7);
                line-height: 1.2;
                margin-top: 2px;
            `;
        }
        
        // 根据任务栏位置决定显示内容
        if (position === 'left' || position === 'right') {
            // 侧边任务栏：只显示微型圆形时钟
            const clockSvg = document.createElement('div');
            clockSvg.className = 'taskbar-mini-clock';
            clockSvg.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="1.5" opacity="0.9"/>
                    <line id="mini-clock-hour" x1="16" y1="16" x2="16" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/>
                    <line id="mini-clock-minute" x1="16" y1="16" x2="16" y2="6" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
                </svg>
            `;
            clockSvg.style.cssText = `
                width: 24px;
                height: 24px;
                color: rgba(215, 224, 221, 0.95);
            `;
            timeContainer.appendChild(clockSvg);
            
            // 更新时间的函数（只更新时钟指针）
            const updateTime = () => {
                const now = new Date();
                const hours = now.getHours() % 12;
                const minutes = now.getMinutes();
                
                const hourAngle = (hours * 30 + minutes * 0.5) * Math.PI / 180;
                const minuteAngle = minutes * 6 * Math.PI / 180;
                
                const hourHand = clockSvg.querySelector('#mini-clock-hour');
                const minuteHand = clockSvg.querySelector('#mini-clock-minute');
                
                if (hourHand) {
                    hourHand.setAttribute('x2', (16 + 6 * Math.sin(hourAngle)).toFixed(2));
                    hourHand.setAttribute('y2', (16 - 6 * Math.cos(hourAngle)).toFixed(2));
                }
                if (minuteHand) {
                    minuteHand.setAttribute('x2', (16 + 8 * Math.sin(minuteAngle)).toFixed(2));
                    minuteHand.setAttribute('y2', (16 - 8 * Math.cos(minuteAngle)).toFixed(2));
                }
            };
            
            // 立即更新一次
            updateTime();
            
            // 每秒更新一次
            const timeInterval = setInterval(updateTime, 1000);
            
            // 保存定时器引用以便清理
            timeContainer._timeInterval = timeInterval;
        } else {
            // 顶部/底部任务栏：显示时间文本和日期
            timeContainer.appendChild(timeText);
            timeContainer.appendChild(dateText);
            
            // 更新时间的函数
            const updateTime = () => {
                const now = new Date();
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                
                timeText.textContent = `${hours}:${minutes}:${seconds}`;
                
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
                const weekday = weekdays[now.getDay()];
                
                dateText.textContent = `${year}-${month}-${day} ${weekday}`;
            };
            
            // 立即更新一次
            updateTime();
            
            // 每秒更新一次
            const timeInterval = setInterval(updateTime, 1000);
            
            // 保存定时器引用以便清理
            timeContainer._timeInterval = timeInterval;
        }
        
        // 悬停效果
        timeContainer.addEventListener('mouseenter', () => {
            timeContainer.style.background = 'rgba(139, 92, 246, 0.15)';
        });
        
        timeContainer.addEventListener('mouseleave', () => {
            timeContainer.style.background = 'transparent';
        });
        
        // 点击事件：显示时间轮盘
        timeContainer.style.cursor = 'pointer';
        timeContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            TaskbarManager._toggleTimeWheel(timeContainer);
        });
        
        return timeContainer;
    }
    
    /**
     * 切换时间轮盘（显示/隐藏）
     * @param {HTMLElement} timeContainer 时间显示容器
     */
    static _toggleTimeWheel(timeContainer) {
        // 检查是否已存在时间轮盘
        let timeWheel = document.getElementById('taskbar-time-wheel');
        
        if (timeWheel && timeWheel.classList.contains('visible')) {
            // 如果已显示，则隐藏
            TaskbarManager._hideTimeWheel(timeWheel);
        } else {
            // 如果未显示，先关闭其他所有弹出组件，然后显示
            TaskbarManager._closeAllTaskbarPopups('taskbar-time-wheel');
            if (!timeWheel) {
                timeWheel = TaskbarManager._createTimeWheel();
            }
            TaskbarManager._showTimeWheel(timeWheel, timeContainer);
        }
    }
    
    /**
     * 创建天气显示组件
     * @returns {HTMLElement} 天气显示元素
     */
    static _createWeatherDisplay() {
        const weatherContainer = document.createElement('div');
        weatherContainer.className = 'taskbar-weather-display';
        weatherContainer.id = 'taskbar-weather-display';
        
        // 获取任务栏位置，根据位置调整样式
        const position = TaskbarManager._taskbarPosition || 'bottom';
        
        // 基础样式
        let baseStyle = `
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 8px 12px;
            min-width: 80px;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            gap: 8px;
        `;
        
        // 根据任务栏位置调整样式
        const isVertical = position === 'left' || position === 'right';
        
        if (isVertical) {
            // 侧边任务栏：垂直布局，紧凑显示
            baseStyle += `
                flex-direction: column;
                height: 48px;
                width: 48px;
                min-width: 48px;
                padding: 4px;
                gap: 2px;
            `;
        } else {
            // 顶部/底部任务栏：水平布局，完整显示
            baseStyle += `
                flex-direction: row;
                height: 48px;
                width: auto;
                min-width: 70px;
            `;
        }
        
        weatherContainer.style.cssText = baseStyle;
        
        // 天气图标
        const weatherIcon = document.createElement('div');
        weatherIcon.className = 'taskbar-weather-icon';
        if (isVertical) {
            // 侧边任务栏：图标稍小
            weatherIcon.style.cssText = `
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: rgba(215, 224, 221, 0.95);
                font-size: 18px;
            `;
        } else {
            // 顶部/底部任务栏：正常大小
            weatherIcon.style.cssText = `
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: rgba(215, 224, 221, 0.95);
                font-size: 20px;
            `;
        }
        weatherIcon.textContent = '☁️';
        weatherContainer.appendChild(weatherIcon);
        
        // 天气信息容器（仅在水平布局时显示）
        if (!isVertical) {
            const weatherInfo = document.createElement('div');
            weatherInfo.className = 'taskbar-weather-info';
            weatherInfo.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                justify-content: center;
                gap: 2px;
            `;
            
            // 温度文本
            const tempText = document.createElement('div');
            tempText.className = 'taskbar-weather-temp';
            tempText.style.cssText = `
                font-size: 14px;
                font-weight: 600;
                color: rgba(215, 224, 221, 0.95);
                line-height: 1.2;
            `;
            tempText.textContent = '--℃';
            weatherInfo.appendChild(tempText);
            
            // 天气描述
            const descText = document.createElement('div');
            descText.className = 'taskbar-weather-desc';
            descText.style.cssText = `
                font-size: 11px;
                font-weight: 400;
                color: rgba(215, 224, 221, 0.7);
                line-height: 1.2;
            `;
            descText.textContent = '加载中...';
            weatherInfo.appendChild(descText);
            
            weatherContainer.appendChild(weatherInfo);
            
            // 初始化天气数据（水平布局）
            TaskbarManager._loadWeatherData(weatherContainer, tempText, descText, weatherIcon);
        } else {
            // 侧边任务栏：只显示图标，温度显示在图标下方或作为工具提示
            // 初始化天气数据（垂直布局，不显示描述）
            TaskbarManager._loadWeatherData(weatherContainer, null, null, weatherIcon);
        }
        
        // 添加工具提示
        const tooltip = document.createElement('div');
        tooltip.className = 'taskbar-icon-tooltip';
        tooltip.textContent = '天气';
        weatherContainer.appendChild(tooltip);
        
        // 刷新按钮
        const refreshButton = document.createElement('div');
        refreshButton.className = 'taskbar-weather-refresh';
        refreshButton.innerHTML = '🔄';
        refreshButton.style.cssText = `
            position: absolute;
            top: 2px;
            right: 2px;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s ease;
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.3);
            z-index: 10;
        `;
        
        // 鼠标悬停时显示刷新按钮
        weatherContainer.addEventListener('mouseenter', () => {
            weatherContainer.style.background = 'rgba(255, 255, 255, 0.08)';
            refreshButton.style.opacity = '0.7';
        });
        weatherContainer.addEventListener('mouseleave', () => {
            weatherContainer.style.background = 'transparent';
            refreshButton.style.opacity = '0';
        });
        
        // 刷新按钮悬停效果
        refreshButton.addEventListener('mouseenter', (e) => {
            e.stopPropagation();
            refreshButton.style.opacity = '1';
            refreshButton.style.background = 'rgba(0, 0, 0, 0.5)';
        });
        refreshButton.addEventListener('mouseleave', (e) => {
            e.stopPropagation();
            refreshButton.style.opacity = '0.7';
            refreshButton.style.background = 'rgba(0, 0, 0, 0.3)';
        });
        
        // 刷新按钮点击事件：强制刷新天气数据
        refreshButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // 添加旋转动画
            refreshButton.style.transition = 'transform 0.5s ease';
            refreshButton.style.transform = 'rotate(360deg)';
            
            // 获取天气相关的元素
            const tempText = weatherContainer.querySelector('.taskbar-weather-temp');
            const descText = weatherContainer.querySelector('.taskbar-weather-desc');
            const iconElement = weatherContainer.querySelector('.taskbar-weather-icon');
            
            try {
                // 强制刷新天气数据
                await TaskbarManager._loadWeatherData(weatherContainer, tempText, descText, iconElement, true);
                KernelLogger.debug("TaskbarManager", "天气数据已强制刷新");
            } catch (error) {
                KernelLogger.warn("TaskbarManager", `强制刷新天气数据失败: ${error.message}`);
            } finally {
                // 重置旋转动画
                setTimeout(() => {
                    refreshButton.style.transform = 'rotate(0deg)';
                }, 500);
            }
        });
        
        // 设置容器为相对定位，以便刷新按钮绝对定位
        weatherContainer.style.position = 'relative';
        weatherContainer.appendChild(refreshButton);
        
        // 点击事件：显示天气详情面板（点击刷新按钮时不触发）
        weatherContainer.addEventListener('click', (e) => {
            // 如果点击的是刷新按钮，不显示面板
            if (e.target === refreshButton || refreshButton.contains(e.target)) {
                return;
            }
            e.stopPropagation();
            TaskbarManager._toggleWeatherPanel(weatherContainer);
        });
        
        return weatherContainer;
    }
    
    /**
     * 更新天气组件主题样式
     * @param {HTMLElement} container 天气容器
     */
    static _updateWeatherDisplayTheme(container) {
        if (!container) return;
        
        // 获取当前主题
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        
        if (!themeManager) return;
        
        try {
            const currentTheme = themeManager.getCurrentTheme();
            if (!currentTheme || !currentTheme.colors) return;
            
            // 更新文本颜色（使用主题的文本颜色）
            const textColor = currentTheme.colors.text || currentTheme.colors.textPrimary || 'rgba(215, 224, 221, 0.95)';
            const textColorSecondary = currentTheme.colors.textSecondary || currentTheme.colors.textLight || 'rgba(215, 224, 221, 0.7)';
            
            const tempText = container.querySelector('.taskbar-weather-temp');
            if (tempText) {
                tempText.style.color = textColor;
            }
            
            const descText = container.querySelector('.taskbar-weather-desc');
            if (descText) {
                descText.style.color = textColorSecondary;
            }
            
            const iconElement = container.querySelector('.taskbar-weather-icon');
            if (iconElement) {
                iconElement.style.color = textColor;
            }
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `更新天气组件主题失败: ${e.message}`);
        }
    }
    
    /**
     * 更新天气UI
     * @param {HTMLElement} container - 天气容器元素
     * @param {HTMLElement} tempText - 温度文本元素
     * @param {HTMLElement} descText - 描述文本元素
     * @param {HTMLElement} iconElement - 图标元素
     * @param {Object} weatherData - 天气数据
     */
    static _updateWeatherUI(container, tempText, descText, iconElement, weatherData) {
        if (!weatherData || !weatherData.data) {
            return;
        }
        
        const today = weatherData.data.today;
        
        // 更新温度文本（如果存在）
        if (tempText) {
            if (today && today.current_temp) {
                tempText.textContent = today.current_temp;
            } else if (weatherData.data.low_temperature !== undefined) {
                tempText.textContent = `${weatherData.data.low_temperature}℃`;
            } else {
                tempText.textContent = '--℃';
            }
        }
        
        // 更新描述文本（如果存在）
        if (descText && today && today.current_cond) {
            descText.textContent = today.current_cond;
        }
        
        // 根据天气条件更新图标
        if (iconElement && today && today.current_cond) {
            const condition = today.current_cond.toLowerCase();
            if (condition.includes('晴')) {
                iconElement.textContent = '☀️';
            } else if (condition.includes('云')) {
                iconElement.textContent = '☁️';
            } else if (condition.includes('雨')) {
                iconElement.textContent = '🌧️';
            } else if (condition.includes('雪')) {
                iconElement.textContent = '❄️';
            } else if (condition.includes('雾') || condition.includes('霾')) {
                iconElement.textContent = '🌫️';
            } else {
                iconElement.textContent = '🌤️';
            }
        }
        
        // 更新工具提示（包含温度信息，特别是垂直布局时）
        const tooltip = container.querySelector('.taskbar-icon-tooltip');
        if (tooltip && weatherData.data.city) {
            const tempInfo = today && today.current_temp ? today.current_temp : (weatherData.data.low_temperature !== undefined ? `${weatherData.data.low_temperature}℃` : '');
            const condInfo = today && today.current_cond ? today.current_cond : '天气';
            tooltip.textContent = `${weatherData.data.city} ${tempInfo} ${condInfo}`;
        }
        
        // 保存天气数据到容器，以便在面板中显示
        container._weatherData = weatherData.data;
    }
    
    /**
     * 加载天气数据
     * 工作流程：
     * 1. 实时获取地理位置（不缓存）
     * 2. 检查该城市的天气缓存（CacheDrive，12小时生命周期）
     * 3. 如果缓存存在且未过期，使用缓存
     * 4. 如果缓存不存在或过期，实时请求天气并更新缓存
     * 
     * @param {HTMLElement} container - 天气容器元素
     * @param {HTMLElement} tempText - 温度文本元素
     * @param {HTMLElement} descText - 描述文本元素（可选）
     * @param {HTMLElement} iconElement - 图标元素
     * @param {boolean} forceRefresh - 是否强制刷新（忽略缓存）
     */
    static async _loadWeatherData(container, tempText, descText, iconElement, forceRefresh = false) {
        try {
                // 检查是否有正在进行的请求，如果有则等待该请求完成（防止并发重复请求）
                if (TaskbarManager._pendingWeatherRequest) {
                    KernelLogger.debug("TaskbarManager", "检测到正在进行的天气数据请求，等待其完成");
                    try {
                        const result = await TaskbarManager._pendingWeatherRequest;
                    const weatherData = result.weatherData;
                    const cityName = result.cityName;
                    
                    // 更新UI
                    TaskbarManager._updateWeatherUI(container, tempText, descText, iconElement, weatherData);
                    return;
                    } catch (error) {
                        // 如果之前的请求失败，继续执行新的请求
                        KernelLogger.debug("TaskbarManager", "之前的天气数据请求失败，继续执行新请求");
                    }
                }
                
                    // 创建新的请求 Promise
                    const requestPromise = (async () => {
                // 1. 实时获取地理位置（不缓存）
                KernelLogger.debug("TaskbarManager", "实时获取地理位置");
                        
                        let requestCityName = null;
                        
                        // 使用 GeographyDrive 获取城市名称（低精度定位，不触发浏览器权限请求）
                        try {
                            if (typeof GeographyDrive !== 'undefined') {
                                KernelLogger.debug("TaskbarManager", "使用 GeographyDrive 获取城市名称");
                                const location = await GeographyDrive.getCurrentPosition({
                                    enableHighAccuracy: false  // 使用低精度定位，不触发浏览器权限请求
                                });
                                
                                if (location && location.name) {
                                    requestCityName = location.name;
                                    KernelLogger.info("TaskbarManager", `从 GeographyDrive 获取城市名称: ${requestCityName}`);
                                } else {
                                    throw new Error('GeographyDrive 返回的城市名称为空');
                                }
                            } else {
                                throw new Error('GeographyDrive 未加载');
                            }
                        } catch (geoError) {
                    // GeographyDrive 失败，尝试使用 BOM 方法作为后备（静默降级，只记录调试日志）
                    KernelLogger.debug("TaskbarManager", `GeographyDrive 获取城市名称失败: ${geoError.message}，尝试使用 BOM 方法作为后备`);
                    
                    try {
                        // 尝试使用原生地理位置 API + 反向地理编码
                        if (typeof GeographyDrive !== 'undefined' && navigator.geolocation) {
                            KernelLogger.debug("TaskbarManager", "尝试使用原生地理位置 API 作为后备（需要浏览器权限）");
                            
                            // 使用 GeographyDrive 的高精度定位（会触发浏览器权限请求，但这是后备方案）
                            const location = await GeographyDrive.getCurrentPosition({
                                enableHighAccuracy: true,  // 启用高精度定位
                                timeout: 10000,
                                maximumAge: 0
                            });
                            
                            if (location && location.name) {
                                requestCityName = location.name;
                                KernelLogger.debug("TaskbarManager", `通过 BOM 方法获取城市名称: ${requestCityName}`);
                            } else {
                                throw new Error('BOM 方法未返回城市名称');
                            }
                        } else {
                            throw new Error('浏览器不支持地理位置 API');
                        }
                    } catch (bomError) {
                        // BOM 方法也失败，降级到直接调用 API（静默降级，只记录调试日志）
                        KernelLogger.debug("TaskbarManager", `BOM 方法失败: ${bomError.message}，降级到直接调用 API`);
                            
                        try {
                            const cityResponse = await fetch('https://api-v1.cenguigui.cn/api/UserInfo/apilet.php');
                            if (!cityResponse.ok) {
                                throw new Error(`获取城市信息失败: ${cityResponse.status}`);
                            }
                            
                            // 先读取文本内容（避免响应流被重复读取）
                            const cityText = await cityResponse.text();
                            
                            // 检查响应类型
                            const contentType = cityResponse.headers.get('content-type') || '';
                            const isJson = contentType.includes('application/json');
                            
                            let cityData;
                            if (isJson) {
                                try {
                                    // 尝试解析 JSON
                                    cityData = JSON.parse(cityText);
                                } catch (jsonError) {
                                    // JSON 解析失败
                                    KernelLogger.error("TaskbarManager", `城市信息 API JSON 解析失败，响应内容: ${cityText.substring(0, 500)}`);
                                    throw new Error(`城市信息 API 返回了无效的 JSON 响应`);
                                }
                            } else {
                                // 响应不是 JSON，可能是 HTML 错误页面
                                KernelLogger.error("TaskbarManager", `城市信息 API 返回了非 JSON 响应 (Content-Type: ${contentType})，响应内容: ${cityText.substring(0, 500)}`);
                                throw new Error(`城市信息 API 返回了非 JSON 响应 (可能是服务器错误)`);
                            }
                            
                            if (!cityData || cityData.code !== '200' || !cityData.data || cityData.data.length === 0) {
                                throw new Error('城市信息数据无效');
                            }
                            
                            // 获取城市名称（使用第一个结果）
                            requestCityName = cityData.data[0].name;
                        } catch (cityApiError) {
                            // 城市信息 API 也失败，使用默认城市
                            requestCityName = '晋城'; // 默认城市
                            KernelLogger.warn("TaskbarManager", `所有获取城市名称的方法都失败，使用默认城市: ${requestCityName}`);
                        }
                    }
                }
                
                // 确保有城市名称
                if (!requestCityName) {
                    // 最后的后备方案：使用默认城市
                    requestCityName = '晋城';
                    KernelLogger.warn("TaskbarManager", `城市名称为空，使用默认城市: ${requestCityName}`);
                }
                
                // 2. 先查进程内短期缓存，再查 CacheDrive（避免不必要的磁盘/网络请求）
                const cacheKey = `${TaskbarManager.WEATHER_CACHE_PREFIX}${requestCityName}`;
                let weatherData = null;
                const nowTs = Date.now();
                
                // 优先使用进程内缓存（5 分钟）
                const memCached = TaskbarManager._weatherMemoryCache.get(cacheKey);
                if (!forceRefresh && memCached && memCached.expiresAt > nowTs) {
                    KernelLogger.debug("TaskbarManager", `使用内存缓存的天气数据: ${requestCityName}`);
                    weatherData = memCached.data;
                    TaskbarManager._pendingWeatherRequest = null;
                    return { weatherData, cityName: requestCityName };
                }
                
                if (!forceRefresh && typeof CacheDrive !== 'undefined') {
                    try {
                        await CacheDrive.init();
                        // 直接读取（内部处理过期），避免 has/get 双重调用
                        weatherData = await CacheDrive.get(cacheKey, null, { programName: 'TaskbarManager' });
                        
                        if (weatherData) {
                            KernelLogger.debug("TaskbarManager", `使用缓存的天气数据: ${requestCityName}`);
                            // 写入进程内短期缓存（5 分钟）
                            TaskbarManager._weatherMemoryCache.set(cacheKey, {
                                data: weatherData,
                                city: requestCityName,
                                expiresAt: nowTs + 5 * 60 * 1000
                            });
                            TaskbarManager._pendingWeatherRequest = null;
                            return { weatherData, cityName: requestCityName };
                        }
                    } catch (cacheError) {
                        KernelLogger.debug("TaskbarManager", `检查缓存失败: ${cacheError.message}，将请求新数据`);
                    }
                }
                
                // 3. 缓存不存在或过期，实时请求天气
                KernelLogger.debug("TaskbarManager", `从API获取天气数据: ${requestCityName}`);
                
                        const weatherResponse = await fetch(`https://api-v1.cenguigui.cn/api/WeatherInfo/?city=${encodeURIComponent(requestCityName)}`);
                        if (!weatherResponse.ok) {
                            throw new Error(`获取天气信息失败: ${weatherResponse.status}`);
                        }
                        
                // 先读取文本内容（避免响应流被重复读取）
                const weatherText = await weatherResponse.text();
                
                // 检查响应类型
                const weatherContentType = weatherResponse.headers.get('content-type') || '';
                const isWeatherJson = weatherContentType.includes('application/json');
                
                let requestWeatherData;
                if (isWeatherJson) {
                    try {
                        // 尝试解析 JSON
                        requestWeatherData = JSON.parse(weatherText);
                    } catch (jsonError) {
                        // JSON 解析失败
                        KernelLogger.error("TaskbarManager", `天气 API JSON 解析失败，响应内容: ${weatherText.substring(0, 500)}`);
                        throw new Error(`天气 API 返回了无效的 JSON 响应`);
                    }
                } else {
                    // 响应不是 JSON，可能是 HTML 错误页面
                    KernelLogger.error("TaskbarManager", `天气 API 返回了非 JSON 响应 (Content-Type: ${weatherContentType})，响应内容: ${weatherText.substring(0, 500)}`);
                    throw new Error(`天气 API 返回了非 JSON 响应 (可能是服务器错误)`);
                }
                
                        if (!requestWeatherData || requestWeatherData.code !== 200 || !requestWeatherData.data) {
                            throw new Error('天气数据无效');
                        }
                        
                // 4. 将天气响应加入缓存（12小时生命周期）
                if (typeof CacheDrive !== 'undefined') {
                    try {
                        await CacheDrive.set(cacheKey, requestWeatherData, {
                            programName: 'TaskbarManager',
                            ttl: TaskbarManager.WEATHER_CACHE_TTL
                        });
                        KernelLogger.debug("TaskbarManager", `天气数据已缓存: ${requestCityName}，生命周期12小时`);
                    } catch (cacheError) {
                        KernelLogger.warn("TaskbarManager", `保存天气缓存失败: ${cacheError.message}`);
                    }
                }
                
                // 写入进程内短期缓存（5 分钟）
                TaskbarManager._weatherMemoryCache.set(cacheKey, {
                    data: requestWeatherData,
                    city: requestCityName,
                    expiresAt: Date.now() + 5 * 60 * 1000
                });
                        
                        return { weatherData: requestWeatherData, cityName: requestCityName };
                    })();
                    
                    // 保存请求 Promise，以便并发调用可以等待
                    TaskbarManager._pendingWeatherRequest = requestPromise;
            
            let weatherData;
            let cityName;
                    
                    try {
                        const result = await requestPromise;
                        weatherData = result.weatherData;
                        cityName = result.cityName;
                        // 请求成功，清除 pending 状态
                        TaskbarManager._pendingWeatherRequest = null;
                    } catch (error) {
                        // 请求失败，清除 pending 状态
                        TaskbarManager._pendingWeatherRequest = null;
                        throw error;
            }
            
            // 更新UI
            TaskbarManager._updateWeatherUI(container, tempText, descText, iconElement, weatherData);
            
            // 设置自动刷新（每30分钟，重新检查缓存）
            setTimeout(() => {
                TaskbarManager._loadWeatherData(container, tempText, descText, iconElement, false);
            }, 30 * 60 * 1000);
            
        } catch (error) {
            KernelLogger.warn("TaskbarManager", `加载天气数据失败: ${error.message}`);
            
            // 如果缓存也不可用，显示错误信息
            if (tempText) {
                tempText.textContent = '--℃';
            }
            if (descText) {
                descText.textContent = '加载失败';
            }
            if (iconElement) {
                iconElement.textContent = '☁️';
            }
            container._weatherData = null;
        }
    }
    
    /**
     * 切换天气面板（显示/隐藏）
     * @param {HTMLElement} weatherContainer 天气显示容器
     */
    static _toggleWeatherPanel(weatherContainer) {
        // 检查是否已存在天气面板
        let weatherPanel = document.getElementById('taskbar-weather-panel');
        
        if (weatherPanel && weatherPanel.classList.contains('visible')) {
            // 如果已显示，则隐藏
            TaskbarManager._hideWeatherPanel(weatherPanel);
        } else {
            // 如果未显示，先关闭其他所有弹出组件，然后显示
            TaskbarManager._closeAllTaskbarPopups('taskbar-weather-panel');
            if (!weatherPanel) {
                weatherPanel = TaskbarManager._createWeatherPanel();
            }
            TaskbarManager._showWeatherPanel(weatherPanel, weatherContainer);
        }
    }
    
    /**
     * 创建天气详情面板
     * @returns {HTMLElement} 天气面板元素
     */
    static _createWeatherPanel() {
        const panel = document.createElement('div');
        panel.id = 'taskbar-weather-panel';
        panel.className = 'taskbar-weather-panel';
        
        // 应用主题背景色（根据当前主题动态设置）
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        
        let panelBg = 'rgba(30, 30, 40, 0.95)';
        let borderColor = 'rgba(108, 142, 255, 0.2)';
        let backdropFilter = 'none';
        let isGlassStyle = false;
        
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                const currentStyle = themeManager.getCurrentStyle();
                
                // 检查是否是玻璃风格
                isGlassStyle = (currentStyle && currentStyle.id === 'glass') || (currentTheme && currentTheme.id === 'glass');
                
                if (currentTheme && currentTheme.colors) {
                    panelBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background || panelBg;
                    borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : borderColor);
                }
                
                // 如果是玻璃风格，使用玻璃效果
                if (isGlassStyle) {
                    backdropFilter = 'blur(20px) saturate(180%)';
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `应用主题到天气面板失败: ${e.message}`);
            }
        }
        
        // 基础样式
        panel.style.cssText = `
            position: fixed;
            width: 360px;
            max-height: 500px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border: 1px solid ${borderColor};
            padding: 20px;
            overflow-y: auto;
            z-index: 10000;
            display: none;
        `;
        
        // 根据主题设置背景和backdrop-filter
        if (isGlassStyle) {
            panel.style.setProperty('backdrop-filter', backdropFilter, 'important');
            panel.style.setProperty('-webkit-backdrop-filter', backdropFilter, 'important');
            panel.style.setProperty('background', 'transparent', 'important');
            panel.style.setProperty('background-color', 'transparent', 'important');
        } else {
            panel.style.setProperty('backdrop-filter', 'none', 'important');
            panel.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
            panel.style.setProperty('background-color', panelBg, 'important');
        }
        
        // 创建内容容器
        const content = document.createElement('div');
        content.className = 'taskbar-weather-panel-content';
        content.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 16px;
        `;
        
        // 当前天气区域（占位，将在显示时更新）
        const currentWeather = document.createElement('div');
        currentWeather.className = 'weather-panel-current';
        currentWeather.id = 'weather-panel-current';
        content.appendChild(currentWeather);
        
        // 未来7天天气预报区域（占位，将在显示时更新）
        const forecast = document.createElement('div');
        forecast.className = 'weather-panel-forecast';
        forecast.id = 'weather-panel-forecast';
        content.appendChild(forecast);
        
        panel.appendChild(content);
        
        // 添加到body
        document.body.appendChild(panel);
        
        return panel;
    }
    
    /**
     * 显示天气面板
     * @param {HTMLElement} panel 天气面板元素
     * @param {HTMLElement} weatherContainer 天气显示容器
     */
    static _showWeatherPanel(panel, weatherContainer) {
        if (!panel || !weatherContainer) return;
        
        // 关闭通知栏（互斥显示）
        if (typeof NotificationManager !== 'undefined' && typeof NotificationManager._hideNotificationContainer === 'function') {
            NotificationManager._hideNotificationContainer();
        }
        
        // 清除之前的隐藏定时器（如果存在）
        if (panel._hideTimeout) {
            clearTimeout(panel._hideTimeout);
            panel._hideTimeout = null;
        }
        
        // 重置内联样式
        panel.style.display = '';
        panel.style.opacity = '';
        panel.style.visibility = '';
        
        // 获取任务栏位置
        const position = TaskbarManager._taskbarPosition || 'bottom';
        const containerRect = weatherContainer.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 20;
        const panelWidth = 360;
        const panelHeight = 500;
        
        // 重置所有位置样式
        panel.style.left = '';
        panel.style.right = '';
        panel.style.top = '';
        panel.style.bottom = '';
        
        // 先更新面板内容（在显示之前）
        TaskbarManager._updateWeatherPanelContent(panel, weatherContainer._weatherData);
        
        // 先显示元素以获取实际尺寸（但先设置为不可见，以便计算位置）
        panel.style.display = 'block';
        panel.style.visibility = 'hidden';
        panel.style.opacity = '0';
        
        // 等待DOM更新后获取实际尺寸并调整位置
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const panelRect = panel.getBoundingClientRect();
                const actualWidth = panelRect.width || panelWidth;
                const actualHeight = panelRect.height || panelHeight;
                
                let panelLeft;
                let panelTop;
                
                switch (position) {
                    case 'top':
                        // 任务栏在顶部，面板显示在下方
                        panelLeft = containerRect.right - actualWidth;
                        
                        // 检查左边界
                        if (panelLeft < padding) {
                            panelLeft = padding;
                        }
                        
                        // 检查右边界
                        if (panelLeft + actualWidth > viewportWidth - padding) {
                            panelLeft = viewportWidth - actualWidth - padding;
                        }
                        
                        // 检查下边界（确保不溢出屏幕）
                        panelTop = containerRect.bottom + 10;
                        if (panelTop + actualHeight > viewportHeight - padding) {
                            panelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                        }
                        
                        panel.style.left = `${panelLeft}px`;
                        panel.style.top = `${panelTop}px`;
                        break;
                        
                    case 'bottom':
                        // 任务栏在底部，面板显示在上方（默认）
                        panelLeft = containerRect.right - actualWidth;
                        
                        // 检查左边界
                        if (panelLeft < padding) {
                            panelLeft = padding;
                        }
                        
                        // 检查右边界
                        if (panelLeft + actualWidth > viewportWidth - padding) {
                            panelLeft = viewportWidth - actualWidth - padding;
                        }
                        
                        // 检查上边界（确保不溢出屏幕）
                        panelTop = containerRect.top - actualHeight - 10;
                        if (panelTop < padding) {
                            panelTop = padding;
                        }
                        
                        panel.style.left = `${panelLeft}px`;
                        panel.style.top = `${panelTop}px`;
                        break;
                        
                    case 'left':
                        // 任务栏在左侧，面板显示在右侧
                        panelTop = containerRect.top;
                        
                        // 检查上边界
                        if (panelTop < padding) {
                            panelTop = padding;
                        }
                        
                        // 检查下边界（确保不溢出屏幕）
                        if (panelTop + actualHeight > viewportHeight - padding) {
                            panelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                        }
                        
                        // 检查右边界
                        panelLeft = containerRect.right + 10;
                        if (panelLeft + actualWidth > viewportWidth - padding) {
                            panelLeft = viewportWidth - actualWidth - padding;
                        }
                        
                        panel.style.left = `${panelLeft}px`;
                        panel.style.top = `${panelTop}px`;
                        break;
                        
                    case 'right':
                        // 任务栏在右侧，面板显示在左侧
                        panelTop = containerRect.top;
                        
                        // 检查上边界
                        if (panelTop < padding) {
                            panelTop = padding;
                        }
                        
                        // 检查下边界（确保不溢出屏幕）
                        if (panelTop + actualHeight > viewportHeight - padding) {
                            panelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                        }
                        
                        // 检查左边界
                        panelLeft = containerRect.left - actualWidth - 10;
                        if (panelLeft < padding) {
                            panelLeft = padding;
                        }
                        
                        panel.style.left = `${panelLeft}px`;
                        panel.style.top = `${panelTop}px`;
                        break;
                }
                
                // 设置位置后，显示面板并添加动画
                panel.style.visibility = '';
                panel.style.opacity = '';
                panel.classList.add('visible');
                
                // 使用 AnimateManager 添加打开动画（在位置设置完成后）
                if (typeof AnimateManager !== 'undefined') {
                    AnimateManager.addAnimationClasses(panel, 'PANEL', 'OPEN');
                }
            });
        });
        
        // 注册点击外部关闭
        if (typeof EventManager !== 'undefined' && typeof EventManager.registerMenu === 'function') {
            EventManager.registerMenu(
                'weather-panel',
                panel,
                () => {
                    TaskbarManager._hideWeatherPanel(panel);
                },
                ['.taskbar-weather-display']
            );
        } else {
            // 降级方案
            const closeOnClickOutside = (e) => {
                if (!panel.contains(e.target) && !weatherContainer.contains(e.target)) {
                    TaskbarManager._hideWeatherPanel(panel);
                    document.removeEventListener('click', closeOnClickOutside, true);
                    document.removeEventListener('mousedown', closeOnClickOutside, true);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeOnClickOutside, true);
                document.addEventListener('mousedown', closeOnClickOutside, true);
            }, 0);
            panel._closeOnClickOutside = closeOnClickOutside;
        }
    }
    
    /**
     * 隐藏天气面板
     * @param {HTMLElement} panel 天气面板元素
     */
    static _hideWeatherPanel(panel, immediate = false) {
        if (!panel) return;
        
        // 清除之前的隐藏定时器
        if (panel._hideTimeout) {
            clearTimeout(panel._hideTimeout);
            panel._hideTimeout = null;
        }
        
        // 如果立即关闭，跳过动画
        if (immediate) {
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.stopAnimation(panel);
                AnimateManager.removeAnimationClasses(panel);
            }
            panel.style.transform = '';
            panel.style.opacity = '';
            panel.style.scale = '';
            panel.classList.remove('visible');
        } else {
            // 使用 AnimateManager 添加关闭动画
            let closeDuration = 150;
            if (typeof AnimateManager !== 'undefined') {
                const config = AnimateManager.addAnimationClasses(panel, 'PANEL', 'CLOSE');
                closeDuration = config ? config.duration : 150;
            }
            
            // 延迟隐藏
            panel._hideTimeout = setTimeout(() => {
                panel.classList.remove('visible');
                panel._hideTimeout = null;
            }, closeDuration);
        }
        
        // 清理事件监听器
        if (panel._closeOnClickOutside) {
            document.removeEventListener('click', panel._closeOnClickOutside, true);
            document.removeEventListener('mousedown', panel._closeOnClickOutside, true);
            panel._closeOnClickOutside = null;
        }
        
        // 注销 EventManager 菜单
        if (typeof EventManager !== 'undefined' && typeof EventManager.unregisterMenu === 'function') {
            EventManager.unregisterMenu('weather-panel');
        }
    }
    
    /**
     * 更新天气面板内容
     * @param {HTMLElement} panel 天气面板元素
     * @param {Object} weatherData 天气数据
     */
    static _updateWeatherPanelContent(panel, weatherData) {
        if (!panel || !weatherData) {
            // 如果没有数据，显示加载中
            const currentWeather = panel.querySelector('#weather-panel-current');
            const forecast = panel.querySelector('#weather-panel-forecast');
            if (currentWeather) {
                currentWeather.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(215, 224, 221, 0.7);">加载中...</div>';
            }
            if (forecast) {
                forecast.innerHTML = '';
            }
            return;
        }
        
        const today = weatherData.today || {};
        const sevenDay = weatherData.seven_day || [];
        
        // 更新当前天气区域
        const currentWeather = panel.querySelector('#weather-panel-current');
        if (currentWeather) {
            const cityName = weatherData.city || '未知城市';
            const currentTemp = today.current_temp || '--℃';
            const currentCond = today.current_cond || '未知';
            const low = today.low || '--℃';
            const quality = today.quality || '--';
            const tips = weatherData.tips || '';
            
            currentWeather.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 18px; font-weight: 600; color: rgba(215, 224, 221, 0.95); margin-bottom: 4px;">${cityName}</div>
                            <div style="font-size: 12px; color: rgba(215, 224, 221, 0.7);">${currentCond}</div>
                        </div>
                        <div style="font-size: 32px; font-weight: 600; color: rgba(215, 224, 221, 0.95);">${currentTemp}</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 12px; color: rgba(215, 224, 221, 0.7);">
                        <span>最低: ${low}</span>
                        <span>空气质量: ${quality}</span>
                    </div>
                    ${tips ? `<div style="font-size: 11px; color: rgba(215, 224, 221, 0.6); margin-top: 4px;">${tips}</div>` : ''}
                </div>
            `;
        }
        
        // 更新未来7天天气预报
        const forecast = panel.querySelector('#weather-panel-forecast');
        if (forecast && sevenDay.length > 0) {
            // 只显示未来7天（跳过今天）
            const futureDays = sevenDay.slice(1, 8);
            
            forecast.innerHTML = `
                <div style="font-size: 14px; font-weight: 600; color: rgba(215, 224, 221, 0.95); margin-bottom: 12px;">未来7天</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${futureDays.map(day => {
                        const date = new Date(day.date);
                        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
                        const weekday = weekdays[date.getDay()];
                        const month = date.getMonth() + 1;
                        const dayNum = date.getDate();
                        
                        return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.05);">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div style="font-size: 12px; color: rgba(215, 224, 221, 0.7); min-width: 60px;">${month}/${dayNum} 周${weekday}</div>
                                    <div style="font-size: 13px; color: rgba(215, 224, 221, 0.9);">${day.cond || '--'}</div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(215, 224, 221, 0.9);">
                                    <span>${day.high || '--'}</span>
                                    <span style="color: rgba(215, 224, 221, 0.6);">${day.low || '--'}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
    }
    
    /**
     * 创建时间轮盘组件
     * @returns {HTMLElement} 时间轮盘元素
     */
    static _createTimeWheel() {
        const wheel = document.createElement('div');
        wheel.id = 'taskbar-time-wheel';
        wheel.className = 'taskbar-time-wheel';
        
        // 应用主题背景色
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    const panelBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                    wheel.style.backgroundColor = panelBg;
                    wheel.style.borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(108, 142, 255, 0.2)');
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `应用主题到时间轮盘失败: ${e.message}`);
            }
        }
        
        // 创建内容容器
        const content = document.createElement('div');
        content.className = 'taskbar-time-wheel-content';
        
        // 创建时钟部分
        const clockSection = document.createElement('div');
        clockSection.className = 'taskbar-time-wheel-clock';
        
        // 创建模拟时钟
        const analogClock = document.createElement('div');
        analogClock.className = 'taskbar-analog-clock';
        
        // 时钟表盘
        const clockFace = document.createElement('div');
        clockFace.className = 'clock-face';
        
        // 创建12个刻度
        for (let i = 1; i <= 12; i++) {
            const mark = document.createElement('div');
            mark.className = 'clock-mark';
            mark.style.transform = `rotate(${i * 30}deg)`;
            mark.style.transformOrigin = 'center';
            clockFace.appendChild(mark);
        }
        
        // 时针
        const hourHand = document.createElement('div');
        hourHand.className = 'clock-hand hour-hand';
        hourHand.id = 'time-wheel-hour-hand';
        
        // 分针
        const minuteHand = document.createElement('div');
        minuteHand.className = 'clock-hand minute-hand';
        minuteHand.id = 'time-wheel-minute-hand';
        
        // 秒针
        const secondHand = document.createElement('div');
        secondHand.className = 'clock-hand second-hand';
        secondHand.id = 'time-wheel-second-hand';
        
        // 中心点
        const centerDot = document.createElement('div');
        centerDot.className = 'clock-center';
        
        clockFace.appendChild(hourHand);
        clockFace.appendChild(minuteHand);
        clockFace.appendChild(secondHand);
        clockFace.appendChild(centerDot);
        analogClock.appendChild(clockFace);
        
        // 数字时钟
        const digitalClock = document.createElement('div');
        digitalClock.className = 'taskbar-digital-clock';
        digitalClock.id = 'time-wheel-digital';
        
        clockSection.appendChild(analogClock);
        clockSection.appendChild(digitalClock);
        
        // 创建日历部分
        const calendarSection = document.createElement('div');
        calendarSection.className = 'taskbar-time-wheel-calendar';
        
        // 日历标题（年月）
        const calendarHeader = document.createElement('div');
        calendarHeader.className = 'calendar-header';
        calendarHeader.id = 'time-wheel-calendar-header';
        
        // 上一月/下一月按钮
        const prevMonthBtn = document.createElement('button');
        prevMonthBtn.className = 'calendar-nav-btn';
        prevMonthBtn.innerHTML = '‹';
        prevMonthBtn.addEventListener('click', () => {
            TaskbarManager._changeCalendarMonth(-1);
        });
        
        const nextMonthBtn = document.createElement('button');
        nextMonthBtn.className = 'calendar-nav-btn';
        nextMonthBtn.innerHTML = '›';
        nextMonthBtn.addEventListener('click', () => {
            TaskbarManager._changeCalendarMonth(1);
        });
        
        // 创建标题（在按钮之间）
        const titleEl = document.createElement('div');
        titleEl.className = 'calendar-title';
        titleEl.textContent = ''; // 将在 _renderCalendar 中设置
        
        calendarHeader.appendChild(prevMonthBtn);
        calendarHeader.appendChild(titleEl);
        calendarHeader.appendChild(nextMonthBtn);
        
        // 星期标题
        const weekdays = document.createElement('div');
        weekdays.className = 'calendar-weekdays';
        const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
        weekdayNames.forEach(day => {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-weekday';
            dayEl.textContent = day;
            weekdays.appendChild(dayEl);
        });
        
        // 日期网格
        const dateGrid = document.createElement('div');
        dateGrid.className = 'calendar-grid';
        dateGrid.id = 'time-wheel-calendar-grid';
        
        calendarSection.appendChild(calendarHeader);
        calendarSection.appendChild(weekdays);
        calendarSection.appendChild(dateGrid);
        
        content.appendChild(clockSection);
        content.appendChild(calendarSection);
        wheel.appendChild(content);
        
        // 添加到body
        document.body.appendChild(wheel);
        
        // 初始化日历（显示当前月份）
        const now = new Date();
        TaskbarManager._renderCalendar(now.getFullYear(), now.getMonth());
        
        // 初始化时钟
        TaskbarManager._updateTimeWheel();
        
        // 启动时钟更新
        TaskbarManager._timeWheelUpdateInterval = setInterval(() => {
            TaskbarManager._updateTimeWheel();
        }, 1000);
        
        return wheel;
    }
    
    /**
     * 显示时间轮盘
     * @param {HTMLElement} wheel 时间轮盘元素
     * @param {HTMLElement} timeContainer 时间显示容器
     */
    static _showTimeWheel(wheel, timeContainer) {
        if (!wheel || !timeContainer) return;
        
        // 关闭通知栏（互斥显示）
        if (typeof NotificationManager !== 'undefined' && typeof NotificationManager._hideNotificationContainer === 'function') {
            NotificationManager._hideNotificationContainer();
        }
        
        // 清除之前的隐藏定时器（如果存在）
        if (wheel._hideTimeout) {
            clearTimeout(wheel._hideTimeout);
            wheel._hideTimeout = null;
        }
        
        // 重置内联样式（确保之前强制隐藏的样式被清除）
        wheel.style.display = '';
        wheel.style.opacity = '';
        wheel.style.visibility = '';
        
        // 获取任务栏位置
        const position = TaskbarManager._taskbarPosition || 'bottom';
        const containerRect = timeContainer.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 20;
        const wheelWidth = 360; // 时间轮盘宽度
        const wheelHeight = 400; // 估算高度
        
        // 重置所有位置样式
        wheel.style.left = '';
        wheel.style.right = '';
        wheel.style.top = '';
        wheel.style.bottom = '';
        
        // 先显示元素以获取实际尺寸
        wheel.classList.add('visible');
        
        // 等待DOM更新后获取实际尺寸并调整位置
        setTimeout(() => {
            const wheelRect = wheel.getBoundingClientRect();
            const actualWidth = wheelRect.width || wheelWidth;
            const actualHeight = wheelRect.height || wheelHeight;
            
            // 声明变量
            let wheelLeft;
            let wheelTop;
            
            switch (position) {
                case 'top':
                    // 任务栏在顶部，面板显示在下方
                    wheelLeft = containerRect.right - actualWidth;
                    
                    // 检查左边界
                    if (wheelLeft < padding) {
                        wheelLeft = padding;
                    }
                    
                    // 检查右边界
                    if (wheelLeft + actualWidth > viewportWidth - padding) {
                        wheelLeft = viewportWidth - actualWidth - padding;
                    }
                    
                    // 检查下边界（确保不溢出屏幕）
                    wheelTop = containerRect.bottom + 10;
                    if (wheelTop + actualHeight > viewportHeight - padding) {
                        wheelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                    }
                    
                    wheel.style.left = `${wheelLeft}px`;
                    wheel.style.top = `${wheelTop}px`;
                    break;
                    
                case 'bottom':
                    // 任务栏在底部，面板显示在上方（默认）
                    wheelLeft = containerRect.right - actualWidth;
                    
                    // 检查左边界
                    if (wheelLeft < padding) {
                        wheelLeft = padding;
                    }
                    
                    // 检查右边界
                    if (wheelLeft + actualWidth > viewportWidth - padding) {
                        wheelLeft = viewportWidth - actualWidth - padding;
                    }
                    
                    wheel.style.left = `${wheelLeft}px`;
                    wheel.style.bottom = `${viewportHeight - containerRect.top + 10}px`;
                    break;
                    
                case 'left':
                    // 任务栏在左侧，面板显示在右侧
                    wheelTop = containerRect.top;
                    
                    // 检查上边界
                    if (wheelTop < padding) {
                        wheelTop = padding;
                    }
                    
                    // 检查下边界（确保不溢出屏幕）
                    if (wheelTop + actualHeight > viewportHeight - padding) {
                        wheelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                    }
                    
                    // 检查右边界（确保不溢出屏幕）
                    wheelLeft = containerRect.right + 10;
                    if (wheelLeft + actualWidth > viewportWidth - padding) {
                        wheelLeft = viewportWidth - actualWidth - padding;
                    }
                    
                    wheel.style.left = `${wheelLeft}px`;
                    wheel.style.top = `${wheelTop}px`;
                    break;
                    
                case 'right':
                    // 任务栏在右侧，面板显示在左侧
                    wheelTop = containerRect.top;
                    
                    // 检查上边界
                    if (wheelTop < padding) {
                        wheelTop = padding;
                    }
                    
                    // 检查下边界（确保不溢出屏幕）
                    if (wheelTop + actualHeight > viewportHeight - padding) {
                        wheelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                    }
                    
                    // 检查左边界（确保不溢出屏幕）
                    wheelLeft = containerRect.left - actualWidth - 10;
                    if (wheelLeft < padding) {
                        wheelLeft = padding;
                    }
                    
                    wheel.style.left = `${wheelLeft}px`;
                    wheel.style.top = `${wheelTop}px`;
                    break;
            }
        }, 0);
        
        // 使用 AnimateManager 添加打开动画
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.addAnimationClasses(wheel, 'PANEL', 'OPEN');
        }
        
        // 注册点击外部关闭
        if (typeof EventManager !== 'undefined' && typeof EventManager.registerMenu === 'function') {
            EventManager.registerMenu(
                'time-wheel',
                wheel,
                () => {
                    TaskbarManager._hideTimeWheel(wheel);
                },
                ['.taskbar-time-display']
            );
        } else {
            // 降级方案
            const closeOnClickOutside = (e) => {
                if (!wheel.contains(e.target) && !timeContainer.contains(e.target)) {
                    TaskbarManager._hideTimeWheel(wheel);
                    document.removeEventListener('click', closeOnClickOutside, true);
                    document.removeEventListener('mousedown', closeOnClickOutside, true);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeOnClickOutside, true);
                document.addEventListener('mousedown', closeOnClickOutside, true);
            }, 0);
            wheel._closeOnClickOutside = closeOnClickOutside;
        }
    }
    
    /**
     * 隐藏时间轮盘
     * @param {HTMLElement} wheel 时间轮盘元素
     */
    static _hideTimeWheel(wheel, immediate = false) {
        if (!wheel) return;
        
        // 清除之前的隐藏定时器
        if (wheel._hideTimeout) {
            clearTimeout(wheel._hideTimeout);
            wheel._hideTimeout = null;
        }
        
        // 如果立即关闭，跳过动画
        if (immediate) {
            // 立即停止动画并清理
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.stopAnimation(wheel);
                AnimateManager.removeAnimationClasses(wheel);
            }
            // 清理可能残留的样式属性
            wheel.style.transform = '';
            wheel.style.opacity = '';
            wheel.style.scale = '';
            wheel.style.translateX = '';
            wheel.style.translateY = '';
            wheel.classList.remove('visible');
        } else {
            // 使用 AnimateManager 添加关闭动画（快速关闭）
            let closeDuration = 150; // 默认时长（加快）
            if (typeof AnimateManager !== 'undefined') {
                const config = AnimateManager.addAnimationClasses(wheel, 'PANEL', 'CLOSE');
                closeDuration = config ? config.duration : 150;
            }
            
            wheel._hideTimeout = setTimeout(() => {
                wheel.classList.remove('visible');
                if (typeof AnimateManager !== 'undefined') {
                    AnimateManager.removeAnimationClasses(wheel);
                }
                // 清理可能残留的样式属性
                wheel.style.transform = '';
                wheel.style.opacity = '';
                wheel.style.scale = '';
                wheel.style.translateX = '';
                wheel.style.translateY = '';
                wheel._hideTimeout = null;
            }, closeDuration);
        }
        
        // 从 EventManager 注销菜单
        if (typeof EventManager !== 'undefined' && typeof EventManager.unregisterMenu === 'function') {
            EventManager.unregisterMenu('time-wheel');
        } else {
            // 降级方案：清理事件监听器
            if (wheel._closeOnClickOutside) {
                document.removeEventListener('click', wheel._closeOnClickOutside, true);
                document.removeEventListener('mousedown', wheel._closeOnClickOutside, true);
                wheel._closeOnClickOutside = null;
            }
        }
    }
    
    /**
     * 更新时间轮盘（时钟和日历）
     */
    static _updateTimeWheel() {
        const now = new Date();
        
        // 更新数字时钟
        const digitalClock = document.getElementById('time-wheel-digital');
        if (digitalClock) {
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            digitalClock.textContent = `${hours}:${minutes}:${seconds}`;
        }
        
        // 更新模拟时钟指针
        const hourHand = document.getElementById('time-wheel-hour-hand');
        const minuteHand = document.getElementById('time-wheel-minute-hand');
        const secondHand = document.getElementById('time-wheel-second-hand');
        
        if (hourHand && minuteHand && secondHand) {
            const hours = now.getHours() % 12;
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();
            
            // 计算角度（12点为0度，顺时针）
            const hourAngle = (hours * 30) + (minutes * 0.5); // 每小时30度，每分钟0.5度
            const minuteAngle = minutes * 6; // 每分钟6度
            const secondAngle = seconds * 6; // 每秒6度
            
            hourHand.style.transform = `rotate(${hourAngle}deg)`;
            minuteHand.style.transform = `rotate(${minuteAngle}deg)`;
            secondHand.style.transform = `rotate(${secondAngle}deg)`;
        }
        
        // 更新日历（如果当前显示的是当前月份）
        const calendarGrid = document.getElementById('time-wheel-calendar-grid');
        if (calendarGrid && calendarGrid.dataset.currentMonth) {
            const currentMonth = parseInt(calendarGrid.dataset.currentMonth);
            const currentYear = parseInt(calendarGrid.dataset.currentYear);
            if (currentMonth === now.getMonth() && currentYear === now.getFullYear()) {
                TaskbarManager._renderCalendar(currentYear, currentMonth);
            }
        }
    }
    
    /**
     * 更改日历月份
     * @param {number} delta 月份变化量（-1为上一月，1为下一月）
     */
    static _changeCalendarMonth(delta) {
        const calendarGrid = document.getElementById('time-wheel-calendar-grid');
        if (!calendarGrid) return;
        
        let currentYear = parseInt(calendarGrid.dataset.currentYear || new Date().getFullYear());
        let currentMonth = parseInt(calendarGrid.dataset.currentMonth || new Date().getMonth());
        
        currentMonth += delta;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        } else if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        
        TaskbarManager._renderCalendar(currentYear, currentMonth);
    }
    
    /**
     * 渲染日历
     * @param {number} year 年份
     * @param {number} month 月份（0-11）
     */
    static _renderCalendar(year, month) {
        const calendarHeader = document.getElementById('time-wheel-calendar-header');
        const calendarGrid = document.getElementById('time-wheel-calendar-grid');
        
        if (!calendarGrid) return;
        
        // 更新标题
        if (calendarHeader) {
            const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                              '七月', '八月', '九月', '十月', '十一月', '十二月'];
            const title = calendarHeader.querySelector('.calendar-title');
            if (title) {
                title.textContent = `${year}年 ${monthNames[month]}`;
            } else {
                const titleEl = document.createElement('div');
                titleEl.className = 'calendar-title';
                titleEl.textContent = `${year}年 ${monthNames[month]}`;
                const prevBtn = calendarHeader.querySelector('.calendar-nav-btn:first-child');
                const nextBtn = calendarHeader.querySelector('.calendar-nav-btn:last-child');
                if (prevBtn && nextBtn) {
                    calendarHeader.insertBefore(titleEl, nextBtn);
                }
            }
        }
        
        // 保存当前年月
        calendarGrid.dataset.currentYear = year;
        calendarGrid.dataset.currentMonth = month;
        
        // 清空网格
        calendarGrid.innerHTML = '';
        
        // 获取月份第一天是星期几（0=星期日）
        const firstDay = new Date(year, month, 1).getDay();
        
        // 获取月份天数
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // 获取今天
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
        const todayDate = today.getDate();
        
        // 填充空白（上个月的日期）
        for (let i = 0; i < firstDay; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day other-month';
            calendarGrid.appendChild(cell);
        }
        
        // 填充当前月的日期
        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            cell.textContent = day;
            
            // 标记今天
            if (isCurrentMonth && day === todayDate) {
                cell.classList.add('today');
            }
            
            calendarGrid.appendChild(cell);
        }
    }
    
    /**
     * 创建网络显示组件
     * @returns {HTMLElement} 网络显示元素
     */
    static _createNetworkDisplay() {
        const networkContainer = document.createElement('div');
        networkContainer.className = 'taskbar-network-display';
        
        // 获取任务栏位置，根据位置调整样式
        const position = TaskbarManager._taskbarPosition || 'bottom';
        
        // 基础样式
        let baseStyle = `
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            position: relative;
            flex-shrink: 0;
        `;
        
        // 根据任务栏位置调整样式
        if (position === 'left' || position === 'right') {
            // 侧边任务栏：垂直布局，全宽
            baseStyle += `
                padding: 8px 4px;
                min-width: 48px;
                width: 100%;
                height: 48px;
            `;
        } else {
            // 顶部/底部任务栏：水平布局
            baseStyle += `
                padding: 0 12px;
                min-width: 48px;
                height: 48px;
            `;
        }
        
        networkContainer.style.cssText = baseStyle;
        
        // 网络图标（使用风格相关的图标）
        const networkIcon = document.createElement('div');
        networkIcon.className = 'taskbar-network-icon';
        // 延迟加载风格相关的图标（等待ThemeManager初始化）
        TaskbarManager._loadSystemIconWithRetry('network', networkIcon).catch(e => {
            KernelLogger.warn("TaskbarManager", `加载网络图标失败: ${e.message}，使用默认图标`);
            // 降级：使用内联SVG
            networkIcon.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" 
                          fill="currentColor" 
                          opacity="0.9"/>
                </svg>
            `;
        });
        networkIcon.style.cssText = `
            width: var(--style-icon-size-medium, 24px);
            height: var(--style-icon-size-medium, 24px);
            color: rgba(215, 224, 221, 0.9);
            transition: var(--style-icon-transition, all 0.3s ease);
        `;
        
        // 网络状态指示器
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'network-status-indicator';
        statusIndicator.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #4ade80;
            box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
        `;
        
        // 使用 AnimateManager 应用脉冲动画
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.applyKeyframeAnimation(statusIndicator, 'KEYFRAMES', 'NETWORK_PULSE');
        } else {
            // 降级方案：直接使用内联样式
            statusIndicator.style.animation = 'networkPulse 2s ease-in-out infinite';
        }
        
        networkContainer.appendChild(networkIcon);
        networkContainer.appendChild(statusIndicator);
        
        // 悬停效果
        networkContainer.addEventListener('mouseenter', () => {
            networkContainer.style.background = 'rgba(139, 92, 246, 0.15)';
            networkIcon.style.color = 'rgba(139, 92, 246, 1)';
            networkIcon.style.transform = 'scale(1.1)';
        });
        
        networkContainer.addEventListener('mouseleave', () => {
            networkContainer.style.background = 'transparent';
            networkIcon.style.color = 'rgba(215, 224, 221, 0.9)';
            networkIcon.style.transform = 'scale(1)';
        });
        
        // 点击事件：显示网络组件
        networkContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            TaskbarManager._toggleNetworkPanel(networkContainer);
        });
        
        // 初始化网络状态
        TaskbarManager._updateNetworkStatus(networkContainer);
        
        // 定期更新网络状态（每5秒）
        networkContainer._networkUpdateInterval = setInterval(() => {
            TaskbarManager._updateNetworkStatus(networkContainer);
        }, 5000);
        
        return networkContainer;
    }
    
    /**
     * 获取 NetworkManager 实例
     * @returns {Object|null} NetworkManager 实例
     */
    static _getNetworkManager() {
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                return POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
            } catch (e) {
                // 忽略错误
            }
        }
        // 降级：尝试从全局对象获取
        if (typeof window !== 'undefined' && window.NetworkManager) {
            return window.NetworkManager;
        } else if (typeof globalThis !== 'undefined' && globalThis.NetworkManager) {
            return globalThis.NetworkManager;
        }
        return null;
    }
    
    /**
     * 更新网络状态显示
     * @param {HTMLElement} networkContainer 网络容器元素
     */
    static _updateNetworkStatus(networkContainer) {
        if (!networkContainer) return;
        
        const statusIndicator = networkContainer.querySelector('.network-status-indicator');
        if (!statusIndicator) return;
        
        // 尝试从 NetworkManager 获取网络状态
        const networkManager = TaskbarManager._getNetworkManager();
        let isOnline = false;
        let isEnabled = true;
        
        if (networkManager) {
            isOnline = typeof networkManager.isOnline === 'function' ? networkManager.isOnline() : (typeof navigator !== 'undefined' && navigator.onLine);
            isEnabled = typeof networkManager.isNetworkEnabled === 'function' ? networkManager.isNetworkEnabled() : true;
        } else {
            // 降级：使用 navigator.onLine
            isOnline = typeof navigator !== 'undefined' && navigator.onLine;
        }
        
        // 如果网络被禁用，显示禁用状态
        if (!isEnabled) {
            statusIndicator.style.background = '#9ca3af';
            statusIndicator.style.boxShadow = '0 0 8px rgba(156, 163, 175, 0.6)';
            statusIndicator.title = '网络已禁用';
        } else if (isOnline) {
            statusIndicator.style.background = '#4ade80';
            statusIndicator.style.boxShadow = '0 0 8px rgba(74, 222, 128, 0.6)';
            statusIndicator.title = '网络已连接';
        } else {
            statusIndicator.style.background = '#ff5f57';
            statusIndicator.style.boxShadow = '0 0 8px rgba(255, 95, 87, 0.6)';
            statusIndicator.title = '网络未连接';
        }
    }
    
    /**
     * 创建电池显示组件
     * @returns {HTMLElement} 电池显示元素
     */
    static _createBatteryDisplay() {
        const batteryContainer = document.createElement('div');
        batteryContainer.className = 'taskbar-battery-display';
        
        // 获取任务栏位置，根据位置调整样式
        const position = TaskbarManager._taskbarPosition || 'bottom';
        
        // 基础样式
        let baseStyle = `
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            position: relative;
            flex-shrink: 0;
        `;
        
        // 根据任务栏位置调整样式
        if (position === 'left' || position === 'right') {
            // 侧边任务栏：垂直布局，全宽
            baseStyle += `
                padding: 8px 4px;
                min-width: 48px;
                width: 100%;
                height: 48px;
            `;
        } else {
            // 顶部/底部任务栏：水平布局
            baseStyle += `
                padding: 0 12px;
                min-width: 48px;
                height: 48px;
            `;
        }
        
        batteryContainer.style.cssText = baseStyle;
        
        // 电池图标
        const batteryIcon = document.createElement('div');
        batteryIcon.className = 'taskbar-battery-icon';
        batteryIcon.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="6" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.9"/>
                <rect x="18" y="9" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.9"/>
            </svg>
        `;
        batteryIcon.style.cssText = `
            width: 24px;
            height: 24px;
            color: rgba(215, 224, 221, 0.9);
            transition: all 0.3s ease;
        `;
        
        // 电池电量指示器（覆盖在图标上）
        const batteryLevel = document.createElement('div');
        batteryLevel.className = 'battery-level-indicator';
        batteryLevel.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 16px;
            height: 10px;
            border-radius: 2px;
            background: #4ade80;
            transition: all 0.3s ease;
            z-index: 1;
        `;
        
        // 充电指示器
        const chargingIndicator = document.createElement('div');
        chargingIndicator.className = 'battery-charging-indicator';
        chargingIndicator.style.cssText = `
            position: absolute;
            top: 6px;
            right: 6px;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #4ade80;
            box-shadow: 0 0 6px rgba(74, 222, 128, 0.6);
            opacity: 0;
            transition: all 0.3s ease;
        `;
        
        // 使用 AnimateManager 应用脉冲动画
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.applyKeyframeAnimation(chargingIndicator, 'KEYFRAMES', 'BATTERY_PULSE');
        } else {
            // 降级方案：直接使用内联样式
            chargingIndicator.style.animation = 'batteryPulse 2s ease-in-out infinite';
        }
        
        batteryContainer.appendChild(batteryIcon);
        batteryContainer.appendChild(batteryLevel);
        batteryContainer.appendChild(chargingIndicator);
        
        // 悬停效果
        batteryContainer.addEventListener('mouseenter', () => {
            batteryContainer.style.background = 'rgba(139, 92, 246, 0.15)';
            batteryIcon.style.color = 'rgba(139, 92, 246, 1)';
            batteryIcon.style.transform = 'scale(1.1)';
        });
        
        batteryContainer.addEventListener('mouseleave', () => {
            batteryContainer.style.background = 'transparent';
            batteryIcon.style.color = 'rgba(215, 224, 221, 0.9)';
            batteryIcon.style.transform = 'scale(1)';
        });
        
        // 点击事件：显示电池面板
        batteryContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            TaskbarManager._toggleBatteryPanel(batteryContainer);
        });
        
        // 初始化电池状态
        TaskbarManager._updateBatteryStatus(batteryContainer);
        
        // 注册电池事件监听（不再使用定期更新）
        TaskbarManager._registerBatteryEventListeners();
        
        return batteryContainer;
    }
    
    /**
     * 更新电池状态显示
     * @param {HTMLElement} batteryContainer 电池容器元素
     */
    static async _updateBatteryStatus(batteryContainer) {
        if (!batteryContainer) return;
        
        const batteryLevel = batteryContainer.querySelector('.battery-level-indicator');
        const chargingIndicator = batteryContainer.querySelector('.battery-charging-indicator');
        if (!batteryLevel) return;
        
        // 尝试从 NetworkManager 获取电池信息
        const networkManager = TaskbarManager._getNetworkManager();
        let batteryInfo = null;
        
        if (networkManager && typeof networkManager.getBatteryInfo === 'function') {
            try {
                batteryInfo = await networkManager.getBatteryInfo();
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `从 NetworkManager 获取电池信息失败: ${e.message}`);
            }
        }
        
        // 如果 NetworkManager 获取失败，尝试直接使用 navigator.getBattery
        if (!batteryInfo && typeof navigator !== 'undefined' && navigator.getBattery) {
            try {
                const battery = await navigator.getBattery();
                batteryInfo = {
                    charging: battery.charging,
                    chargingTime: battery.chargingTime,
                    dischargingTime: battery.dischargingTime,
                    level: battery.level
                };
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `直接获取电池信息失败: ${e.message}`);
            }
        }
        
        if (!batteryInfo) {
            // 降级：电池信息不可用
            batteryLevel.style.width = '0px';
            batteryLevel.style.opacity = '0';
            if (chargingIndicator) {
                chargingIndicator.style.opacity = '0';
            }
            batteryContainer.title = '电池信息不可用';
            return;
        }
        
        const { level, charging } = batteryInfo;
        const percentage = Math.round(level * 100);
        
        // 更新电量显示（16px 宽度，根据百分比调整）
        const levelWidth = Math.max(2, (percentage / 100) * 16);
        batteryLevel.style.width = `${levelWidth}px`;
        batteryLevel.style.opacity = '1';
        
        // 根据电量百分比设置颜色
        if (percentage > 50) {
            batteryLevel.style.background = '#4ade80'; // 绿色
        } else if (percentage > 20) {
            batteryLevel.style.background = '#fbbf24'; // 黄色
        } else {
            batteryLevel.style.background = '#ff5f57'; // 红色
        }
        
        // 更新充电指示器
        if (chargingIndicator) {
            if (charging) {
                chargingIndicator.style.opacity = '1';
                chargingIndicator.style.background = '#4ade80';
                batteryContainer.title = `正在充电 (${percentage}%)`;
            } else {
                chargingIndicator.style.opacity = '0';
                batteryContainer.title = `电池电量: ${percentage}%`;
            }
        }
    }
    
    /**
     * 切换电池面板（显示/隐藏）
     * @param {HTMLElement} batteryContainer 电池显示容器
     */
    static _toggleBatteryPanel(batteryContainer) {
        // 检查是否已存在电池面板
        let batteryPanel = document.getElementById('taskbar-battery-panel');
        
        if (batteryPanel && batteryPanel.classList.contains('visible')) {
            // 如果已显示，则隐藏
            TaskbarManager._hideBatteryPanel(batteryPanel);
        } else {
            // 如果未显示，先关闭其他所有弹出组件，然后显示
            TaskbarManager._closeAllTaskbarPopups('taskbar-battery-panel');
            if (!batteryPanel) {
                batteryPanel = TaskbarManager._createBatteryPanel();
            }
            TaskbarManager._showBatteryPanel(batteryPanel, batteryContainer);
        }
    }

    
    
    /**
     * 创建电池面板
     * @returns {HTMLElement} 电池面板元素
     */
    static _createBatteryPanel() {
        const panel = document.createElement('div');
        panel.id = 'taskbar-battery-panel';
        panel.className = 'taskbar-battery-panel';
        
        // 应用主题背景色
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    const panelBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                    panel.style.backgroundColor = panelBg;
                    panel.style.borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(108, 142, 255, 0.2)');
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `应用主题到电池面板失败: ${e.message}`);
            }
        }
        
        // 创建内容容器
        const content = document.createElement('div');
        content.className = 'taskbar-battery-panel-content';
        
        // 创建电池状态部分
        const statusSection = document.createElement('div');
        statusSection.className = 'battery-panel-section';
        
        const statusTitle = document.createElement('div');
        statusTitle.className = 'battery-panel-title';
        statusTitle.textContent = '电池状态';
        statusSection.appendChild(statusTitle);
        
        const statusCard = document.createElement('div');
        statusCard.className = 'battery-status-card';
        
        // 电池图标和电量
        const batteryDisplay = document.createElement('div');
        batteryDisplay.className = 'battery-display-large';
        batteryDisplay.id = 'battery-display-large';
        
        const batteryIcon = document.createElement('div');
        batteryIcon.className = 'battery-icon-large';
        // 延迟加载风格相关的图标，并添加动态内容（电量填充和充电动画）
        TaskbarManager._loadSystemIconWithRetry('battery', batteryIcon, true).then(svgContent => {
            // 如果加载成功，添加动态元素（电量填充和充电动画）
            if (svgContent && batteryIcon.querySelector('svg')) {
                const svg = batteryIcon.querySelector('svg');
                // 添加clipPath和动态元素
                const defs = svg.querySelector('defs') || document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                if (!svg.querySelector('defs')) {
                    svg.insertBefore(defs, svg.firstChild);
                }
                const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
                clipPath.setAttribute('id', 'battery-clip-large');
                const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                clipRect.setAttribute('x', '2');
                clipRect.setAttribute('y', '3');
                clipRect.setAttribute('width', '16');
                clipRect.setAttribute('height', '6');
                clipRect.setAttribute('rx', '0.5');
                clipPath.appendChild(clipRect);
                defs.appendChild(clipPath);
                
                // 添加电量填充矩形
                const fillRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                fillRect.setAttribute('id', 'battery-fill-large');
                fillRect.setAttribute('x', '2');
                fillRect.setAttribute('y', '3');
                fillRect.setAttribute('width', '0');
                fillRect.setAttribute('height', '6');
                fillRect.setAttribute('rx', '0.5');
                fillRect.setAttribute('fill', 'currentColor');
                fillRect.setAttribute('opacity', '0.9');
                fillRect.setAttribute('clip-path', 'url(#battery-clip-large)');
                svg.appendChild(fillRect);
                
                // 添加充电动画圆圈
                const chargingCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                chargingCircle.setAttribute('id', 'battery-charging-icon-large');
                chargingCircle.setAttribute('cx', '12');
                chargingCircle.setAttribute('cy', '6');
                chargingCircle.setAttribute('r', '3');
                chargingCircle.setAttribute('fill', 'none');
                chargingCircle.setAttribute('stroke', 'currentColor');
                chargingCircle.setAttribute('stroke-width', '1.5');
                chargingCircle.setAttribute('opacity', '0');
                chargingCircle.setAttribute('stroke-dasharray', '4 2');
                const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
                animate.setAttribute('attributeName', 'opacity');
                animate.setAttribute('values', '0;1;0');
                animate.setAttribute('dur', '2s');
                animate.setAttribute('repeatCount', 'indefinite');
                animate.setAttribute('begin', '0s');
                chargingCircle.appendChild(animate);
                svg.appendChild(chargingCircle);
            }
        }).catch(e => {
            KernelLogger.warn("TaskbarManager", `加载电池图标失败: ${e.message}，使用默认图标`);
            // 降级：使用内联SVG
            batteryIcon.innerHTML = `
                <svg width="100" height="50" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <clipPath id="battery-clip-large">
                            <rect x="2" y="3" width="16" height="6" rx="0.5"/>
                        </clipPath>
                    </defs>
                    <rect x="1" y="2" width="18" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
                    <rect x="19" y="4" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.5"/>
                    <rect id="battery-fill-large" x="2" y="3" width="0" height="6" rx="0.5" fill="currentColor" opacity="0.9" clip-path="url(#battery-clip-large)"/>
                    <circle id="battery-charging-icon-large" cx="12" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0" stroke-dasharray="4 2">
                        <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" begin="0s"/>
                    </circle>
                </svg>
            `;
        });
        
        const batteryPercentage = document.createElement('div');
        batteryPercentage.className = 'battery-percentage';
        batteryPercentage.id = 'battery-percentage';
        batteryPercentage.textContent = '--%';
        
        batteryDisplay.appendChild(batteryIcon);
        batteryDisplay.appendChild(batteryPercentage);
        statusCard.appendChild(batteryDisplay);
        
        // 电池信息
        const batteryInfo = document.createElement('div');
        batteryInfo.className = 'battery-info';
        batteryInfo.id = 'battery-info';
        
        statusCard.appendChild(batteryInfo);
        statusSection.appendChild(statusCard);
        
        // 创建操作按钮部分
        const actionsSection = document.createElement('div');
        actionsSection.className = 'battery-panel-actions';
        
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'battery-action-btn';
        refreshBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
            </svg>
            <span>刷新</span>
        `;
        refreshBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            // 添加加载状态
            const originalHTML = refreshBtn.innerHTML;
            refreshBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation: spin 1s linear infinite;">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
                </svg>
                <span>刷新中...</span>
            `;
            refreshBtn.disabled = true;
            
            try {
                await TaskbarManager._updateBatteryPanel();
                // 同时更新任务栏上的电池显示
                const batteryContainer = document.querySelector('.taskbar-battery-display');
                if (batteryContainer) {
                    await TaskbarManager._updateBatteryStatus(batteryContainer);
                }
            } catch (error) {
                KernelLogger.warn("TaskbarManager", `刷新电池信息失败: ${error.message}`);
            } finally {
                // 恢复按钮状态
                refreshBtn.innerHTML = originalHTML;
                refreshBtn.disabled = false;
            }
        });
        
        actionsSection.appendChild(refreshBtn);
        
        content.appendChild(statusSection);
        content.appendChild(actionsSection);
        panel.appendChild(content);
        
        // 添加到body
        document.body.appendChild(panel);
        
        // 初始化电池信息
        TaskbarManager._updateBatteryPanel();
        
        // 注册电池事件监听（不再使用定期更新）
        TaskbarManager._registerBatteryEventListeners();
        
        return panel;
    }
    
    /**
     * 显示电池面板
     * @param {HTMLElement} panel 电池面板元素
     * @param {HTMLElement} batteryContainer 电池显示容器
     */
    static _showBatteryPanel(panel, batteryContainer) {
        if (!panel || !batteryContainer) return;
        
        // 关闭通知栏（互斥显示）
        if (typeof NotificationManager !== 'undefined' && typeof NotificationManager._hideNotificationContainer === 'function') {
            NotificationManager._hideNotificationContainer();
        }
        
        // 清除之前的隐藏定时器（如果存在）
        if (panel._hideTimeout) {
            clearTimeout(panel._hideTimeout);
            panel._hideTimeout = null;
        }
        
        // 重置内联样式（确保之前强制隐藏的样式被清除）
        panel.style.display = '';
        panel.style.opacity = '';
        panel.style.visibility = '';
        
        // 获取任务栏位置
        const position = TaskbarManager._taskbarPosition || 'bottom';
        const containerRect = batteryContainer.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 20;
        const panelWidth = 360;
        const panelHeight = 400; // 估算高度
        
        // 重置所有位置样式
        panel.style.left = '';
        panel.style.right = '';
        panel.style.top = '';
        panel.style.bottom = '';
        
        // 先显示元素以获取实际尺寸
        panel.classList.add('visible');
        
        // 等待DOM更新后获取实际尺寸并调整位置
        setTimeout(() => {
            const panelRect = panel.getBoundingClientRect();
            const actualWidth = panelRect.width || panelWidth;
            const actualHeight = panelRect.height || panelHeight;
            
            // 声明变量
            let panelLeft;
            let panelTop;
            
            switch (position) {
                case 'top':
                    // 任务栏在顶部，面板显示在下方
                    panelLeft = containerRect.right - actualWidth;
                    
                    // 检查左边界
                    if (panelLeft < padding) {
                        panelLeft = padding;
                    }
                    
                    // 检查右边界
                    if (panelLeft + actualWidth > viewportWidth - padding) {
                        panelLeft = viewportWidth - actualWidth - padding;
                    }
                    
                    // 检查下边界（确保不溢出屏幕）
                    panelTop = containerRect.bottom + 10;
                    if (panelTop + actualHeight > viewportHeight - padding) {
                        panelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                    }
                    
                    panel.style.left = `${panelLeft}px`;
                    panel.style.top = `${panelTop}px`;
                    break;
                    
                case 'bottom':
                    // 任务栏在底部，面板显示在上方（默认）
                    panelLeft = containerRect.right - actualWidth;
                    
                    // 检查左边界
                    if (panelLeft < padding) {
                        panelLeft = padding;
                    }
                    
                    // 检查右边界
                    if (panelLeft + actualWidth > viewportWidth - padding) {
                        panelLeft = viewportWidth - actualWidth - padding;
                    }
                    
                    panel.style.left = `${panelLeft}px`;
                    panel.style.bottom = `${viewportHeight - containerRect.top + 10}px`;
                    break;
                    
                case 'left':
                    // 任务栏在左侧，面板显示在右侧
                    panelTop = containerRect.top;
                    
                    // 检查上边界
                    if (panelTop < padding) {
                        panelTop = padding;
                    }
                    
                    // 检查下边界（确保不溢出屏幕）
                    if (panelTop + actualHeight > viewportHeight - padding) {
                        panelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                    }
                    
                    // 检查右边界（确保不溢出屏幕）
                    panelLeft = containerRect.right + 10;
                    if (panelLeft + actualWidth > viewportWidth - padding) {
                        panelLeft = viewportWidth - actualWidth - padding;
                    }
                    
                    panel.style.left = `${panelLeft}px`;
                    panel.style.top = `${panelTop}px`;
                    break;
                    
                case 'right':
                    // 任务栏在右侧，面板显示在左侧
                    panelTop = containerRect.top;
                    
                    // 检查上边界
                    if (panelTop < padding) {
                        panelTop = padding;
                    }
                    
                    // 检查下边界（确保不溢出屏幕）
                    if (panelTop + actualHeight > viewportHeight - padding) {
                        panelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                    }
                    
                    // 检查左边界（确保不溢出屏幕）
                    panelLeft = containerRect.left - actualWidth - 10;
                    if (panelLeft < padding) {
                        panelLeft = padding;
                    }
                    
                    panel.style.left = `${panelLeft}px`;
                    panel.style.top = `${panelTop}px`;
                    break;
            }
        }, 0);
        
        // 使用 AnimateManager 添加打开动画
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.addAnimationClasses(panel, 'PANEL', 'OPEN');
        }
        
        // 更新电池信息
        TaskbarManager._updateBatteryPanel();
        
        // 注册点击外部关闭
        if (typeof EventManager !== 'undefined' && typeof EventManager.registerMenu === 'function') {
            EventManager.registerMenu(
                'battery-panel',
                panel,
                () => {
                    TaskbarManager._hideBatteryPanel(panel);
                },
                ['.taskbar-battery-display']
            );
        } else {
            // 降级方案
            const closeOnClickOutside = (e) => {
                if (!panel.contains(e.target) && !batteryContainer.contains(e.target)) {
                    TaskbarManager._hideBatteryPanel(panel);
                    document.removeEventListener('click', closeOnClickOutside, true);
                    document.removeEventListener('mousedown', closeOnClickOutside, true);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeOnClickOutside, true);
                document.addEventListener('mousedown', closeOnClickOutside, true);
            }, 0);
            panel._closeOnClickOutside = closeOnClickOutside;
        }
    }
    
    /**
     * 隐藏电池面板
     * @param {HTMLElement} panel 电池面板元素
     */
    static _hideBatteryPanel(panel, immediate = false) {
        if (!panel) return;
        
        // 清除之前的隐藏定时器
        if (panel._hideTimeout) {
            clearTimeout(panel._hideTimeout);
            panel._hideTimeout = null;
        }
        
        // 如果立即关闭，跳过动画
        if (immediate) {
            // 立即停止动画并清理
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.stopAnimation(panel);
                AnimateManager.removeAnimationClasses(panel);
            }
            // 清理可能残留的样式属性
            panel.style.transform = '';
            panel.style.opacity = '';
            panel.style.scale = '';
            panel.style.translateX = '';
            panel.style.translateY = '';
            panel.classList.remove('visible');
        } else {
            // 使用 AnimateManager 添加关闭动画（快速关闭）
            let closeDuration = 150; // 默认时长（加快）
            if (typeof AnimateManager !== 'undefined') {
                const config = AnimateManager.addAnimationClasses(panel, 'PANEL', 'CLOSE');
                closeDuration = config ? config.duration : 150;
            }
            
            panel._hideTimeout = setTimeout(() => {
                panel.classList.remove('visible');
                if (typeof AnimateManager !== 'undefined') {
                    AnimateManager.removeAnimationClasses(panel);
                }
                // 清理可能残留的样式属性
                panel.style.transform = '';
                panel.style.opacity = '';
                panel.style.scale = '';
                panel.style.translateX = '';
                panel.style.translateY = '';
                panel._hideTimeout = null;
            }, closeDuration);
        }
        
        // 从 EventManager 注销菜单
        if (typeof EventManager !== 'undefined' && typeof EventManager.unregisterMenu === 'function') {
            EventManager.unregisterMenu('battery-panel');
        } else {
            // 降级方案：清理事件监听器
            if (panel._closeOnClickOutside) {
                document.removeEventListener('click', panel._closeOnClickOutside, true);
                document.removeEventListener('mousedown', panel._closeOnClickOutside, true);
                panel._closeOnClickOutside = null;
            }
        }
    }
    
    /**
     * 更新电池面板信息
     */
    static async _updateBatteryPanel() {
        const networkManager = TaskbarManager._getNetworkManager();
        
        // 获取电池信息
        let batteryInfo = null;
        let errorMessage = null;
        
        // 检查 navigator.getBattery API 是否可用
        const hasBatteryAPI = typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function';
        
        if (!hasBatteryAPI) {
            KernelLogger.warn("TaskbarManager", "navigator.getBattery API 不可用（可能需要 HTTPS 或浏览器不支持）");
            errorMessage = "电池 API 不可用（可能需要 HTTPS 或浏览器不支持）";
        } else {
            // 首先尝试通过 NetworkManager 获取
            if (networkManager && typeof networkManager.getBatteryInfo === 'function') {
                try {
                    batteryInfo = await networkManager.getBatteryInfo();
                } catch (e) {
                    errorMessage = e.message;
                }
            }
            
            // 如果 NetworkManager 获取失败，尝试直接使用 navigator.getBattery
            if (!batteryInfo && hasBatteryAPI) {
                try {
                    const battery = await navigator.getBattery();
                    if (battery) {
                        batteryInfo = {
                            charging: battery.charging,
                            chargingTime: battery.chargingTime,
                            dischargingTime: battery.dischargingTime,
                            level: battery.level
                        };
                    } else {
                        errorMessage = "无法获取电池对象";
                    }
                } catch (e) {
                    errorMessage = e.message;
                }
            }
        }
        
        // 更新电池显示
        const batteryDisplay = document.getElementById('battery-display-large');
        const batteryPercentage = document.getElementById('battery-percentage');
        const batteryInfoEl = document.getElementById('battery-info');
        
        if (!batteryDisplay || !batteryPercentage || !batteryInfoEl) {
            KernelLogger.warn("TaskbarManager", `电池面板元素未找到: batteryDisplay=${!!batteryDisplay}, batteryPercentage=${!!batteryPercentage}, batteryInfoEl=${!!batteryInfoEl}`);
            return;
        }
        
        // 查找 SVG 内的填充元素
        let batteryIconContainer = batteryDisplay.querySelector('.battery-icon-large');
        let batteryIcon = batteryIconContainer ? batteryIconContainer.querySelector('svg') : null;
        let batteryFill = batteryIcon ? batteryIcon.querySelector('#battery-fill-large') : null;
        let batteryChargingIcon = batteryIcon ? batteryIcon.querySelector('#battery-charging-icon-large') : null;
        
        // 如果 SVG 元素还没有加载完成，等待一小段时间后重试
        if (!batteryIcon || !batteryFill) {
            // 等待最多 500ms，每 50ms 检查一次
            let retries = 10;
            while (retries > 0 && (!batteryIcon || !batteryFill)) {
                await new Promise(resolve => setTimeout(resolve, 50));
                batteryIconContainer = batteryDisplay.querySelector('.battery-icon-large');
                batteryIcon = batteryIconContainer ? batteryIconContainer.querySelector('svg') : null;
                if (batteryIcon) {
                    batteryFill = batteryIcon.querySelector('#battery-fill-large');
                    batteryChargingIcon = batteryIcon.querySelector('#battery-charging-icon-large');
                }
                retries--;
            }
            
            // 如果仍然找不到，尝试创建 SVG 元素
            if (!batteryIcon || !batteryFill) {
                // 确保容器存在
                if (!batteryIconContainer) {
                    batteryIconContainer = document.createElement('div');
                    batteryIconContainer.className = 'battery-icon-large';
                    batteryDisplay.insertBefore(batteryIconContainer, batteryPercentage);
                }
                
                // 如果 SVG 不存在，创建默认 SVG
                if (!batteryIcon) {
                    batteryIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    batteryIcon.setAttribute('width', '100');
                    batteryIcon.setAttribute('height', '50');
                    batteryIcon.setAttribute('viewBox', '0 0 24 12');
                    batteryIcon.setAttribute('fill', 'none');
                    batteryIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                    
                    // 创建 defs 和 clipPath
                    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
                    clipPath.setAttribute('id', 'battery-clip-large');
                    const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    clipRect.setAttribute('x', '2');
                    clipRect.setAttribute('y', '3');
                    clipRect.setAttribute('width', '16');
                    clipRect.setAttribute('height', '6');
                    clipRect.setAttribute('rx', '0.5');
                    clipPath.appendChild(clipRect);
                    defs.appendChild(clipPath);
                    batteryIcon.appendChild(defs);
                    
                    // 创建电池外框
                    const batteryRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    batteryRect.setAttribute('x', '1');
                    batteryRect.setAttribute('y', '2');
                    batteryRect.setAttribute('width', '18');
                    batteryRect.setAttribute('height', '8');
                    batteryRect.setAttribute('rx', '1');
                    batteryRect.setAttribute('fill', 'none');
                    batteryRect.setAttribute('stroke', 'currentColor');
                    batteryRect.setAttribute('stroke-width', '1.5');
                    batteryRect.setAttribute('opacity', '0.5');
                    batteryIcon.appendChild(batteryRect);
                    
                    // 创建电池正极
                    const batteryTip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    batteryTip.setAttribute('x', '19');
                    batteryTip.setAttribute('y', '4');
                    batteryTip.setAttribute('width', '2');
                    batteryTip.setAttribute('height', '4');
                    batteryTip.setAttribute('rx', '0.5');
                    batteryTip.setAttribute('fill', 'currentColor');
                    batteryTip.setAttribute('opacity', '0.5');
                    batteryIcon.appendChild(batteryTip);
                    
                    batteryIconContainer.appendChild(batteryIcon);
                }
                
                // 创建填充元素
                if (!batteryFill) {
                    batteryFill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    batteryFill.setAttribute('id', 'battery-fill-large');
                    batteryFill.setAttribute('x', '2');
                    batteryFill.setAttribute('y', '3');
                    batteryFill.setAttribute('width', '0');
                    batteryFill.setAttribute('height', '6');
                    batteryFill.setAttribute('rx', '0.5');
                    batteryFill.setAttribute('fill', 'currentColor');
                    batteryFill.setAttribute('opacity', '0.9');
                    batteryFill.setAttribute('clip-path', 'url(#battery-clip-large)');
                    batteryIcon.appendChild(batteryFill);
                }
                
                // 创建充电指示器
                if (!batteryChargingIcon) {
                    batteryChargingIcon = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    batteryChargingIcon.setAttribute('id', 'battery-charging-icon-large');
                    batteryChargingIcon.setAttribute('cx', '12');
                    batteryChargingIcon.setAttribute('cy', '6');
                    batteryChargingIcon.setAttribute('r', '3');
                    batteryChargingIcon.setAttribute('fill', 'none');
                    batteryChargingIcon.setAttribute('stroke', 'currentColor');
                    batteryChargingIcon.setAttribute('stroke-width', '1.5');
                    batteryChargingIcon.setAttribute('opacity', '0');
                    batteryChargingIcon.setAttribute('stroke-dasharray', '4 2');
                    const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
                    animate.setAttribute('attributeName', 'opacity');
                    animate.setAttribute('values', '0;1;0');
                    animate.setAttribute('dur', '2s');
                    animate.setAttribute('repeatCount', 'indefinite');
                    animate.setAttribute('begin', '0s');
                    batteryChargingIcon.appendChild(animate);
                    batteryIcon.appendChild(batteryChargingIcon);
                }
                
                // 创建后重新查找元素，确保引用正确
                if (batteryIcon) {
                    batteryFill = batteryIcon.querySelector('#battery-fill-large');
                    batteryChargingIcon = batteryIcon.querySelector('#battery-charging-icon-large');
                }
            }
        }
        
        if (!batteryInfo) {
            // 电池信息不可用
            batteryPercentage.textContent = '--%';
            if (batteryFill) {
                batteryFill.setAttribute('width', '0');
                batteryFill.setAttribute('fill', 'rgba(215, 224, 221, 0.5)');
            }
            if (batteryChargingIcon) {
                batteryChargingIcon.setAttribute('opacity', '0');
            }
            
            // 显示详细的错误信息
            let errorText = '电池信息不可用';
            if (errorMessage) {
                errorText += ` (${errorMessage})`;
            } else if (!hasBatteryAPI) {
                errorText += ' (浏览器不支持或需要 HTTPS)';
            }
            
            batteryInfoEl.innerHTML = `
                <div class="battery-info-item">
                    <span class="battery-info-label">状态:</span>
                    <span class="battery-info-value">${errorText}</span>
                </div>
            `;
            return;
        }
        
        const { level, charging, chargingTime, dischargingTime } = batteryInfo;
        const percentage = Math.round(level * 100);
        
        // 更新百分比
        batteryPercentage.textContent = `${percentage}%`;
        
        // 更新电池填充（16px是电池内部宽度）
        if (batteryFill) {
            const fillWidth = Math.max(0, Math.min(16, (percentage / 100) * 16));
            batteryFill.setAttribute('width', fillWidth.toString());
            
            // 根据电量百分比设置颜色
            if (percentage > 50) {
                batteryFill.setAttribute('fill', '#4ade80'); // 绿色
            } else if (percentage > 20) {
                batteryFill.setAttribute('fill', '#fbbf24'); // 黄色
            } else {
                batteryFill.setAttribute('fill', '#ff5f57'); // 红色
            }
        }
        
        // 更新充电指示器
        if (batteryChargingIcon) {
            if (charging) {
                batteryChargingIcon.setAttribute('opacity', '1');
                batteryChargingIcon.setAttribute('stroke', '#4ade80');
            } else {
                batteryChargingIcon.setAttribute('opacity', '0');
            }
        }
        
        // 更新电池信息
        let infoHTML = `
            <div class="battery-info-item">
                <span class="battery-info-label">状态:</span>
                <span class="battery-info-value">${charging ? '正在充电' : '未充电'}</span>
            </div>
        `;
        
        if (charging && chargingTime !== Infinity && chargingTime > 0) {
            const hours = Math.floor(chargingTime / 3600);
            const minutes = Math.floor((chargingTime % 3600) / 60);
            const timeText = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
            infoHTML += `
                <div class="battery-info-item">
                    <span class="battery-info-label">预计充满:</span>
                    <span class="battery-info-value">${timeText}</span>
                </div>
            `;
        } else if (!charging && dischargingTime !== Infinity && dischargingTime > 0) {
            const hours = Math.floor(dischargingTime / 3600);
            const minutes = Math.floor((dischargingTime % 3600) / 60);
            const timeText = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
            infoHTML += `
                <div class="battery-info-item">
                    <span class="battery-info-label">预计剩余:</span>
                    <span class="battery-info-value">${timeText}</span>
                </div>
            `;
        }
        
        batteryInfoEl.innerHTML = infoHTML;
        
        // 更新任务栏电池状态
        const batteryContainer = document.querySelector('.taskbar-battery-display');
        if (batteryContainer) {
            TaskbarManager._updateBatteryStatus(batteryContainer);
        }
    }
    
    /**
     * 注册电池事件监听器（只注册一次）
     */
    static _registerBatteryEventListeners() {
        // 避免重复注册
        if (TaskbarManager._batteryEventRegistered) {
            return;
        }
        
        if (typeof navigator === 'undefined' || !navigator.getBattery) {
            return;
        }
        
        // 异步注册事件监听器
        navigator.getBattery().then(battery => {
            if (!battery) return;
            
            // 电池状态变化时更新 UI
            const updateBatteryUI = () => {
                // 更新任务栏电池显示
                const batteryContainer = document.querySelector('.taskbar-battery-display');
                if (batteryContainer) {
                    TaskbarManager._updateBatteryStatus(batteryContainer);
                }
                
                // 如果电池面板已打开，也更新面板
                const batteryPanel = document.getElementById('taskbar-battery-panel');
                if (batteryPanel && batteryPanel.classList.contains('visible')) {
                    TaskbarManager._updateBatteryPanel();
                }
            };
            
            battery.addEventListener('chargingchange', updateBatteryUI);
            battery.addEventListener('levelchange', updateBatteryUI);
            battery.addEventListener('chargingtimechange', updateBatteryUI);
            battery.addEventListener('dischargingtimechange', updateBatteryUI);
            
            TaskbarManager._batteryEventRegistered = true;
        }).catch(e => {
            // 静默失败，不影响功能
        });
    }
    
    /**
     * 切换网络面板（显示/隐藏）
     * @param {HTMLElement} networkContainer 网络显示容器
     */
    static _toggleNetworkPanel(networkContainer) {
        // 检查是否已存在网络面板
        let networkPanel = document.getElementById('taskbar-network-panel');
        
        if (networkPanel && networkPanel.classList.contains('visible')) {
            // 如果已显示，则隐藏
            TaskbarManager._hideNetworkPanel(networkPanel);
        } else {
            // 如果未显示，先关闭其他所有弹出组件，然后显示
            TaskbarManager._closeAllTaskbarPopups('taskbar-network-panel');
            if (!networkPanel) {
                networkPanel = TaskbarManager._createNetworkPanel();
            }
            TaskbarManager._showNetworkPanel(networkPanel, networkContainer);
        }
    }
    
    /**
     * 创建网络面板组件
     * @returns {HTMLElement} 网络面板元素
     */
    static _createNetworkPanel() {
        const panel = document.createElement('div');
        panel.id = 'taskbar-network-panel';
        panel.className = 'taskbar-network-panel';
        
        // 应用主题背景色
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    const panelBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                    panel.style.backgroundColor = panelBg;
                    panel.style.borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(108, 142, 255, 0.2)');
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `应用主题到网络面板失败: ${e.message}`);
            }
        }
        
        // 创建内容容器
        const content = document.createElement('div');
        content.className = 'taskbar-network-panel-content';
        
        // 创建网络状态部分
        const statusSection = document.createElement('div');
        statusSection.className = 'network-panel-section';
        
        const statusTitle = document.createElement('div');
        statusTitle.className = 'network-panel-title';
        statusTitle.textContent = '网络状态';
        statusSection.appendChild(statusTitle);
        
        const statusCard = document.createElement('div');
        statusCard.className = 'network-status-card';
        
        // 连接状态
        const connectionStatus = document.createElement('div');
        connectionStatus.className = 'network-connection-status';
        connectionStatus.id = 'network-connection-status';
        
        const statusIcon = document.createElement('div');
        statusIcon.className = 'network-status-icon-large';
        statusIcon.id = 'network-status-icon-large';
        
        const statusText = document.createElement('div');
        statusText.className = 'network-status-text';
        statusText.id = 'network-status-text';
        
        connectionStatus.appendChild(statusIcon);
        connectionStatus.appendChild(statusText);
        statusCard.appendChild(connectionStatus);
        
        // 网络信息
        const networkInfo = document.createElement('div');
        networkInfo.className = 'network-info';
        networkInfo.id = 'network-info';
        
        statusCard.appendChild(networkInfo);
        statusSection.appendChild(statusCard);
        
        // 创建网络控制部分（启用/禁用）
        const controlSection = document.createElement('div');
        controlSection.className = 'network-panel-section';
        
        const controlTitle = document.createElement('div');
        controlTitle.className = 'network-panel-title';
        controlTitle.textContent = '网络控制';
        controlSection.appendChild(controlTitle);
        
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'network-toggle-container';
        // 获取主题颜色（重用已存在的themeManager）
        let toggleBg = 'rgba(139, 92, 246, 0.1)';
        let toggleTextColor = 'rgba(215, 224, 221, 0.9)';
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    toggleBg = currentTheme.colors.backgroundSecondary || currentTheme.colors.backgroundTertiary || toggleBg;
                    toggleTextColor = currentTheme.colors.text || toggleTextColor;
                }
            } catch (e) {
                // 忽略错误，使用默认值
            }
        }
        toggleContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px;
            background: ${toggleBg};
            border-radius: 8px;
            margin-top: 8px;
        `;
        
        const toggleLabel = document.createElement('div');
        toggleLabel.textContent = '启用网络';
        toggleLabel.style.cssText = `
            font-size: 14px;
            color: ${toggleTextColor};
            font-weight: 500;
        `;
        
        const toggleSwitch = document.createElement('div');
        toggleSwitch.className = 'network-toggle-switch';
        toggleSwitch.id = 'network-toggle-switch';
        toggleSwitch.style.cssText = `
            width: 48px;
            height: 24px;
            background: rgba(255, 95, 87, 0.5);
            border-radius: 12px;
            position: relative;
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        
        const toggleThumb = document.createElement('div');
        // 获取主题颜色
        let thumbBg = '#ffffff';
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    thumbBg = currentTheme.colors.backgroundElevated || currentTheme.colors.background || thumbBg;
                }
            } catch (e) {
                // 忽略错误，使用默认值
            }
        }
        toggleThumb.style.cssText = `
            width: 20px;
            height: 20px;
            background: ${thumbBg};
            border-radius: 50%;
            position: absolute;
            top: 2px;
            left: 2px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        `;
        
        toggleSwitch.appendChild(toggleThumb);
        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggleSwitch);
        
        // 更新开关状态
        const updateToggleState = () => {
            const networkManager = TaskbarManager._getNetworkManager();
            const isEnabled = networkManager && typeof networkManager.isNetworkEnabled === 'function' 
                ? networkManager.isNetworkEnabled() 
                : true;
            
            // 获取主题颜色
            let enabledBg = 'rgba(74, 222, 128, 0.5)';
            let disabledBg = 'rgba(255, 95, 87, 0.5)';
            if (themeManager) {
                try {
                    const currentTheme = themeManager.getCurrentTheme();
                    if (currentTheme && currentTheme.colors) {
                        enabledBg = currentTheme.colors.success ? currentTheme.colors.success + '80' : enabledBg;
                        disabledBg = currentTheme.colors.error ? currentTheme.colors.error + '80' : disabledBg;
                    }
                } catch (e) {
                    // 忽略错误，使用默认值
                }
            }
            
            if (isEnabled) {
                toggleSwitch.style.background = enabledBg;
                toggleThumb.style.left = '26px';
                toggleLabel.textContent = '启用网络';
            } else {
                toggleSwitch.style.background = disabledBg;
                toggleThumb.style.left = '2px';
                toggleLabel.textContent = '禁用网络';
            }
        };
        
        // 切换网络状态
        toggleSwitch.addEventListener('click', () => {
            const networkManager = TaskbarManager._getNetworkManager();
            if (networkManager && typeof networkManager.toggleNetwork === 'function') {
                networkManager.toggleNetwork();
                updateToggleState();
                // 更新网络面板
                TaskbarManager._updateNetworkPanel();
                // 更新任务栏网络状态
                const networkContainer = document.querySelector('.taskbar-network-display');
                if (networkContainer) {
                    TaskbarManager._updateNetworkStatus(networkContainer);
                }
            }
        });
        
        // 初始化开关状态
        updateToggleState();
        
        // 监听网络启用状态变化
        const networkManager = TaskbarManager._getNetworkManager();
        if (networkManager && typeof networkManager.addNetworkEnabledListener === 'function') {
            networkManager.addNetworkEnabledListener(() => {
                updateToggleState();
                TaskbarManager._updateNetworkPanel();
                const networkContainer = document.querySelector('.taskbar-network-display');
                if (networkContainer) {
                    TaskbarManager._updateNetworkStatus(networkContainer);
                }
            });
        }
        
        controlSection.appendChild(toggleContainer);
        
        // 创建操作按钮部分
        const actionsSection = document.createElement('div');
        actionsSection.className = 'network-panel-actions';
        
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'network-action-btn';
        refreshBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
            </svg>
            <span>刷新</span>
        `;
        refreshBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            // 添加加载状态
            const originalHTML = refreshBtn.innerHTML;
            refreshBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation: spin 1s linear infinite;">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
                </svg>
                <span>刷新中...</span>
            `;
            refreshBtn.disabled = true;
            
            try {
                TaskbarManager._updateNetworkPanel();
                // 同时更新任务栏上的网络显示
                const networkContainer = document.querySelector('.taskbar-network-display');
                if (networkContainer) {
                    TaskbarManager._updateNetworkStatus(networkContainer);
                }
            } catch (error) {
                KernelLogger.warn("TaskbarManager", `刷新网络信息失败: ${error.message}`);
            } finally {
                // 恢复按钮状态
                refreshBtn.innerHTML = originalHTML;
                refreshBtn.disabled = false;
            }
        });
        
        actionsSection.appendChild(refreshBtn);
        
        content.appendChild(statusSection);
        content.appendChild(controlSection);
        content.appendChild(actionsSection);
        panel.appendChild(content);
        
        // 添加到body
        document.body.appendChild(panel);
        
        // 初始化网络信息
        TaskbarManager._updateNetworkPanel();
        
        // 启动定期更新（每5秒）
        panel._networkPanelUpdateInterval = setInterval(() => {
            TaskbarManager._updateNetworkPanel();
        }, 5000);
        
        return panel;
    }
    
    /**
     * 显示网络面板
     * @param {HTMLElement} panel 网络面板元素
     * @param {HTMLElement} networkContainer 网络显示容器
     */
    static _showNetworkPanel(panel, networkContainer) {
        if (!panel || !networkContainer) return;
        
        // 关闭通知栏（互斥显示）
        if (typeof NotificationManager !== 'undefined' && typeof NotificationManager._hideNotificationContainer === 'function') {
            NotificationManager._hideNotificationContainer();
        }
        
        // 清除之前的隐藏定时器（如果存在）
        if (panel._hideTimeout) {
            clearTimeout(panel._hideTimeout);
            panel._hideTimeout = null;
        }
        
        // 重置内联样式（确保之前强制隐藏的样式被清除）
        panel.style.display = '';
        panel.style.opacity = '';
        panel.style.visibility = '';
        
        // 获取任务栏位置
        const position = TaskbarManager._taskbarPosition || 'bottom';
        const containerRect = networkContainer.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 20;
        const panelWidth = 360;
        const panelHeight = 400; // 估算高度
        
        // 重置所有位置样式
        panel.style.left = '';
        panel.style.right = '';
        panel.style.top = '';
        panel.style.bottom = '';
        
        // 先显示元素以获取实际尺寸
        panel.classList.add('visible');
        
        // 等待DOM更新后获取实际尺寸并调整位置
        setTimeout(() => {
            const panelRect = panel.getBoundingClientRect();
            const actualWidth = panelRect.width || panelWidth;
            const actualHeight = panelRect.height || panelHeight;
            
            // 声明变量
            let panelLeft;
            let panelTop;
            
            switch (position) {
                case 'top':
                    // 任务栏在顶部，面板显示在下方
                    panelLeft = containerRect.right - actualWidth;
                    
                    // 检查左边界
                    if (panelLeft < padding) {
                        panelLeft = padding;
                    }
                    
                    // 检查右边界
                    if (panelLeft + actualWidth > viewportWidth - padding) {
                        panelLeft = viewportWidth - actualWidth - padding;
                    }
                    
                    // 检查下边界（确保不溢出屏幕）
                    panelTop = containerRect.bottom + 10;
                    if (panelTop + actualHeight > viewportHeight - padding) {
                        panelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                    }
                    
                    panel.style.left = `${panelLeft}px`;
                    panel.style.top = `${panelTop}px`;
                    break;
                    
                case 'bottom':
                    // 任务栏在底部，面板显示在上方（默认）
                    panelLeft = containerRect.right - actualWidth;
                    
                    // 检查左边界
                    if (panelLeft < padding) {
                        panelLeft = padding;
                    }
                    
                    // 检查右边界
                    if (panelLeft + actualWidth > viewportWidth - padding) {
                        panelLeft = viewportWidth - actualWidth - padding;
                    }
                    
                    panel.style.left = `${panelLeft}px`;
                    panel.style.bottom = `${viewportHeight - containerRect.top + 10}px`;
                    break;
                    
                case 'left':
                    // 任务栏在左侧，面板显示在右侧
                    panelTop = containerRect.top;
                    
                    // 检查上边界
                    if (panelTop < padding) {
                        panelTop = padding;
                    }
                    
                    // 检查下边界（确保不溢出屏幕）
                    if (panelTop + actualHeight > viewportHeight - padding) {
                        panelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                    }
                    
                    // 检查右边界（确保不溢出屏幕）
                    panelLeft = containerRect.right + 10;
                    if (panelLeft + actualWidth > viewportWidth - padding) {
                        panelLeft = viewportWidth - actualWidth - padding;
                    }
                    
                    panel.style.left = `${panelLeft}px`;
                    panel.style.top = `${panelTop}px`;
                    break;
                    
                case 'right':
                    // 任务栏在右侧，面板显示在左侧
                    panelTop = containerRect.top;
                    
                    // 检查上边界
                    if (panelTop < padding) {
                        panelTop = padding;
                    }
                    
                    // 检查下边界（确保不溢出屏幕）
                    if (panelTop + actualHeight > viewportHeight - padding) {
                        panelTop = Math.max(padding, viewportHeight - actualHeight - padding);
                    }
                    
                    // 检查左边界（确保不溢出屏幕）
                    panelLeft = containerRect.left - actualWidth - 10;
                    if (panelLeft < padding) {
                        panelLeft = padding;
                    }
                    
                    panel.style.left = `${panelLeft}px`;
                    panel.style.top = `${panelTop}px`;
                    break;
            }
        }, 0);
        
        // 使用 AnimateManager 添加打开动画
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.addAnimationClasses(panel, 'PANEL', 'OPEN');
        }
        
        // 更新网络信息
        TaskbarManager._updateNetworkPanel();
        
        // 注册点击外部关闭
        if (typeof EventManager !== 'undefined' && typeof EventManager.registerMenu === 'function') {
            EventManager.registerMenu(
                'network-panel',
                panel,
                () => {
                    TaskbarManager._hideNetworkPanel(panel);
                },
                ['.taskbar-network-display']
            );
        } else {
            // 降级方案
            const closeOnClickOutside = (e) => {
                if (!panel.contains(e.target) && !networkContainer.contains(e.target)) {
                    TaskbarManager._hideNetworkPanel(panel);
                    document.removeEventListener('click', closeOnClickOutside, true);
                    document.removeEventListener('mousedown', closeOnClickOutside, true);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeOnClickOutside, true);
                document.addEventListener('mousedown', closeOnClickOutside, true);
            }, 0);
            panel._closeOnClickOutside = closeOnClickOutside;
        }
    }
    
    /**
     * 隐藏网络面板
     * @param {HTMLElement} panel 网络面板元素
     */
    static _hideNetworkPanel(panel, immediate = false) {
        if (!panel) return;
        
        // 清除之前的隐藏定时器
        if (panel._hideTimeout) {
            clearTimeout(panel._hideTimeout);
            panel._hideTimeout = null;
        }
        
        // 如果立即关闭，跳过动画
        if (immediate) {
            // 立即停止动画并清理
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.stopAnimation(panel);
                AnimateManager.removeAnimationClasses(panel);
            }
            // 清理可能残留的样式属性
            panel.style.transform = '';
            panel.style.opacity = '';
            panel.style.scale = '';
            panel.style.translateX = '';
            panel.style.translateY = '';
            panel.classList.remove('visible');
        } else {
            // 使用 AnimateManager 添加关闭动画（快速关闭）
            let closeDuration = 150; // 默认时长（加快）
            if (typeof AnimateManager !== 'undefined') {
                const config = AnimateManager.addAnimationClasses(panel, 'PANEL', 'CLOSE');
                closeDuration = config ? config.duration : 150;
            }
            
            panel._hideTimeout = setTimeout(() => {
                panel.classList.remove('visible');
                if (typeof AnimateManager !== 'undefined') {
                    AnimateManager.removeAnimationClasses(panel);
                }
                // 清理可能残留的样式属性
                panel.style.transform = '';
                panel.style.opacity = '';
                panel.style.scale = '';
                panel.style.translateX = '';
                panel.style.translateY = '';
                panel._hideTimeout = null;
            }, closeDuration);
        }
        
        // 从 EventManager 注销菜单
        if (typeof EventManager !== 'undefined' && typeof EventManager.unregisterMenu === 'function') {
            EventManager.unregisterMenu('network-panel');
        } else {
            // 降级方案：清理事件监听器
            if (panel._closeOnClickOutside) {
                document.removeEventListener('click', panel._closeOnClickOutside, true);
                document.removeEventListener('mousedown', panel._closeOnClickOutside, true);
                panel._closeOnClickOutside = null;
            }
        }
    }
    
    /**
     * 更新网络面板信息
     */
    static _updateNetworkPanel() {
        const networkManager = TaskbarManager._getNetworkManager();
        
        // 获取网络状态（强制刷新）
        let isOnline = false;
        let isEnabled = true;
        let connectionInfo = null;
        let navigatorData = null;
        
        if (networkManager) {
            // 强制重新获取网络状态
            isOnline = typeof networkManager.isOnline === 'function' ? networkManager.isOnline() : (typeof navigator !== 'undefined' && navigator.onLine);
            isEnabled = typeof networkManager.isNetworkEnabled === 'function' ? networkManager.isNetworkEnabled() : true;
            connectionInfo = typeof networkManager.getConnectionInfo === 'function' ? networkManager.getConnectionInfo() : null;
            navigatorData = typeof networkManager.getAllNavigatorNetworkData === 'function' ? networkManager.getAllNavigatorNetworkData() : null;
        } else {
            // 降级：使用 navigator.onLine
            isOnline = typeof navigator !== 'undefined' && navigator.onLine;
        }
        
        // 如果 NetworkManager 不可用，尝试从 navigator.connection 获取连接信息
        if (!connectionInfo && typeof navigator !== 'undefined' && navigator.connection) {
            const conn = navigator.connection;
            connectionInfo = {
                effectiveType: conn.effectiveType || null,
                downlink: conn.downlink || null,
                rtt: conn.rtt || null,
                saveData: conn.saveData || false,
                type: conn.type || null,
                downlinkMax: conn.downlinkMax || null
            };
        }
        
        // 更新连接状态
        const statusIcon = document.getElementById('network-status-icon-large');
        const statusText = document.getElementById('network-status-text');
        const networkInfo = document.getElementById('network-info');
        
        // 获取主题颜色
        const themeManagerForStatus = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        let disabledColor = '#9ca3af';
        let successColor = '#4ade80';
        let errorColor = '#ff5f57';
        if (themeManagerForStatus) {
            try {
                const currentTheme = themeManagerForStatus.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    disabledColor = currentTheme.colors.textMuted || currentTheme.colors.textDisabled || disabledColor;
                    successColor = currentTheme.colors.success || successColor;
                    errorColor = currentTheme.colors.error || errorColor;
                }
            } catch (e) {
                // 忽略错误，使用默认值
            }
        }
        
        if (statusIcon && statusText) {
            if (!isEnabled) {
                // 网络被禁用
                statusIcon.innerHTML = `
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" 
                              fill="${disabledColor}"/>
                    </svg>
                `;
                statusText.textContent = '网络已禁用';
                statusText.style.color = disabledColor;
            } else if (isOnline) {
                statusIcon.innerHTML = `
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" 
                              fill="${successColor}"/>
                    </svg>
                `;
                statusText.textContent = '已连接';
                statusText.style.color = successColor;
            } else {
                statusIcon.innerHTML = `
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 1l-8.59 8.59L21 18.18V1zM3 23l8.59-8.59L3 5.82V23z" fill="${errorColor}"/>
                    </svg>
                `;
                statusText.textContent = '未连接';
                statusText.style.color = errorColor;
            }
        }
        
        // 更新网络信息
        if (networkInfo) {
            if (!isEnabled) {
                networkInfo.innerHTML = `
                    <div class="network-info-item">
                        <span class="network-info-label">状态:</span>
                        <span class="network-info-value">网络已禁用</span>
                    </div>
                `;
            } else if (isOnline) {
                // 使用 NetworkManager 获取的网络信息
                if (connectionInfo) {
                    const infoItems = [
                        { label: '类型', value: connectionInfo.effectiveType || connectionInfo.type || '未知' },
                        { label: '下行速度', value: connectionInfo.downlink ? `${connectionInfo.downlink} Mbps` : '未知' },
                        { label: 'RTT', value: connectionInfo.rtt ? `${connectionInfo.rtt} ms` : '未知' },
                        { label: '节省数据', value: connectionInfo.saveData ? '是' : '否' }
                    ];
                    
                    if (connectionInfo.downlinkMax) {
                        infoItems.push({ label: '最大下行', value: `${connectionInfo.downlinkMax} Mbps` });
                    }
                    
                    networkInfo.innerHTML = infoItems.map(item => `
                        <div class="network-info-item">
                            <span class="network-info-label">${item.label}:</span>
                            <span class="network-info-value">${item.value}</span>
                        </div>
                    `).join('');
                } else if (navigatorData) {
                    // 使用 navigator 数据
                    networkInfo.innerHTML = `
                        <div class="network-info-item">
                            <span class="network-info-label">状态:</span>
                            <span class="network-info-value">已连接到互联网</span>
                        </div>
                        ${navigatorData.hardwareConcurrency ? `
                        <div class="network-info-item">
                            <span class="network-info-label">CPU核心:</span>
                            <span class="network-info-value">${navigatorData.hardwareConcurrency}</span>
                        </div>
                        ` : ''}
                        ${navigatorData.deviceMemory ? `
                        <div class="network-info-item">
                            <span class="network-info-label">设备内存:</span>
                            <span class="network-info-value">${navigatorData.deviceMemory} GB</span>
                        </div>
                        ` : ''}
                    `;
                } else {
                    networkInfo.innerHTML = `
                        <div class="network-info-item">
                            <span class="network-info-label">状态:</span>
                            <span class="network-info-value">已连接到互联网</span>
                        </div>
                    `;
                }
            } else {
                networkInfo.innerHTML = `
                    <div class="network-info-item">
                        <span class="network-info-label">状态:</span>
                        <span class="network-info-value">未连接到互联网</span>
                    </div>
                `;
            }
        }
    }
    
    /**
     * 创建通知按钮
     * @returns {HTMLElement} 按钮元素
     */
    static _createNotificationButton() {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'taskbar-icon taskbar-notification-button';
        iconContainer.dataset.notificationButton = 'true';
        iconContainer.style.position = 'relative';
        
        // 创建图标
        const icon = document.createElement('div');
        icon.className = 'notification-button-icon';
        icon.innerHTML = '🔔';
        icon.style.cssText = `
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
        `;
        iconContainer.appendChild(icon);
        
        // 创建通知数量徽章
        const badge = document.createElement('div');
        badge.className = 'notification-badge';
        badge.style.cssText = `
            position: absolute;
            top: 4px;
            right: 4px;
            background: #ec4141;
            color: #ffffff;
            font-size: 10px;
            font-weight: bold;
            min-width: 16px;
            height: 16px;
            border-radius: 8px;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 0 4px;
            box-sizing: border-box;
            z-index: 10;
        `;
        iconContainer.appendChild(badge);
        
        // 添加工具提示
        const tooltip = document.createElement('div');
        tooltip.className = 'taskbar-icon-tooltip';
        tooltip.textContent = '通知';
        iconContainer.appendChild(tooltip);
        
        // 更新通知数量
        const updateBadge = () => {
            if (typeof NotificationManager !== 'undefined') {
                const count = NotificationManager.getNotificationCount();
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count.toString();
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        };
        
        // 初始更新
        updateBadge();
        
        // 定期更新通知数量
        const badgeUpdateInterval = setInterval(updateBadge, 1000);
        
        // 点击事件：切换通知栏
        iconContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            KernelLogger.debug("TaskbarManager", "通知按钮被点击");
            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.toggleNotificationContainer();
                KernelLogger.debug("TaskbarManager", "已调用 NotificationManager.toggleNotificationContainer()");
            } else {
                KernelLogger.warn("TaskbarManager", "NotificationManager 不可用");
            }
        });
        
        // 添加鼠标悬停效果
        iconContainer.addEventListener('mouseenter', () => {
            iconContainer.style.cursor = 'pointer';
        });
        
        // 保存更新函数引用，以便在按钮被移除时清理
        iconContainer._badgeUpdateInterval = badgeUpdateInterval;
        iconContainer._updateBadge = updateBadge;
        
        return iconContainer;
    }
    
    /**
     * 创建电源按钮
     * @returns {HTMLElement} 电源按钮元素
     */
    static _createPowerButton() {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'taskbar-icon taskbar-power-button';
        iconContainer.dataset.powerButton = 'true';
        
        // 创建图标（使用风格相关的电源图标）
        const icon = document.createElement('div');
        icon.className = 'power-button-icon';
        // 延迟加载风格相关的图标（等待ThemeManager初始化）
        TaskbarManager._loadSystemIconWithRetry('power', icon).catch(e => {
            KernelLogger.warn("TaskbarManager", `加载电源图标失败: ${e.message}，使用默认图标`);
            // 降级：使用内联SVG
            icon.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2V7z" fill="currentColor" opacity="0.9"/>
                </svg>
            `;
        });
        iconContainer.appendChild(icon);
        
        // 添加工具提示
        const tooltip = document.createElement('div');
        tooltip.className = 'taskbar-icon-tooltip';
        tooltip.textContent = '电源';
        iconContainer.appendChild(tooltip);
        
        // 点击事件：显示电源菜单
        iconContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            TaskbarManager._togglePowerMenu(iconContainer);
        });
        
        return iconContainer;
    }
    
    /**
     * 切换电源菜单（展开/收起）
     * @param {HTMLElement} powerButton 电源按钮元素
     */
    static _togglePowerMenu(powerButton) {
        // 检查是否已存在电源菜单
        let powerMenu = document.getElementById('taskbar-power-menu');
        
        if (powerMenu && powerMenu.classList.contains('visible')) {
            // 如果已展开，则收起
            TaskbarManager._hidePowerMenu(powerMenu, powerButton);
        } else {
            // 如果未展开，先关闭其他所有弹出组件，然后展开
            TaskbarManager._closeAllTaskbarPopups('taskbar-power-menu');
            if (!powerMenu) {
                powerMenu = TaskbarManager._createPowerMenu();
            }
            TaskbarManager._showPowerMenu(powerMenu, powerButton);
        }
    }
    
    /**
     * 创建电源菜单
     * @returns {HTMLElement} 菜单元素
     */
    static _createPowerMenu() {
        const menu = document.createElement('div');
        menu.id = 'taskbar-power-menu';
        menu.className = 'taskbar-power-menu';
        
        // 应用主题背景色
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    const panelBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                    menu.style.backgroundColor = panelBg;
                    menu.style.borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(108, 142, 255, 0.2)');
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `应用主题到电源菜单失败: ${e.message}`);
            }
        }
        
        // 创建菜单项容器
        const menuList = document.createElement('div');
        menuList.className = 'taskbar-power-menu-list';
        
        // 重启选项
        const restartItem = document.createElement('div');
        restartItem.className = 'taskbar-power-menu-item';
        const restartIcon = document.createElement('div');
        restartIcon.style.cssText = 'width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;';
        // 延迟加载风格相关的重启图标（等待ThemeManager初始化）
        TaskbarManager._loadSystemIconWithRetry('restart', restartIcon).catch(e => {
            KernelLogger.warn("TaskbarManager", `加载重启图标失败: ${e.message}，使用默认图标`);
            restartIcon.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
                </svg>
            `;
        });
        const restartText = document.createElement('span');
        restartText.textContent = '重启系统';
        restartItem.appendChild(restartIcon);
        restartItem.appendChild(restartText);
        restartItem.addEventListener('click', () => {
            TaskbarManager._restartSystem();
        });
        menuList.appendChild(restartItem);
        
        // 关闭选项
        const shutdownItem = document.createElement('div');
        shutdownItem.className = 'taskbar-power-menu-item taskbar-power-menu-item-danger';
        const shutdownIcon = document.createElement('div');
        shutdownIcon.style.cssText = 'width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;';
        // 延迟加载风格相关的关闭图标（等待ThemeManager初始化）
        TaskbarManager._loadSystemIconWithRetry('shutdown', shutdownIcon).catch(e => {
            KernelLogger.warn("TaskbarManager", `加载关闭图标失败: ${e.message}，使用默认图标`);
            shutdownIcon.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.59-5.41L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z" fill="currentColor"/>
                </svg>
            `;
        });
        const shutdownText = document.createElement('span');
        shutdownText.textContent = '关闭系统';
        shutdownItem.appendChild(shutdownIcon);
        shutdownItem.appendChild(shutdownText);
        shutdownItem.addEventListener('click', () => {
            TaskbarManager._shutdownSystem();
        });
        menuList.appendChild(shutdownItem);
        
        menu.appendChild(menuList);
        
        // 添加到任务栏容器（或body）
        const taskbar = document.getElementById('taskbar');
        if (taskbar && taskbar.parentElement) {
            taskbar.parentElement.appendChild(menu);
        } else {
            document.body.appendChild(menu);
        }
        
        // 使用 EventManager 统一管理菜单关闭事件
        if (typeof EventManager !== 'undefined' && typeof EventManager.registerMenu === 'function') {
            EventManager.registerMenu(
                'power-menu',
                menu,
                () => {
                    TaskbarManager._hidePowerMenu(menu, null);
                },
                ['.taskbar-power-button'] // 排除电源按钮
            );
        } else {
            // 降级方案：使用原有逻辑
            let closeOnClickOutside = null;
            closeOnClickOutside = (e) => {
                const clickedInMenu = menu.contains(e.target);
                const clickedOnPowerButton = e.target.closest('.taskbar-power-button');
                const clickedInContextMenu = e.target.closest('.taskbar-app-context-menu');
                const clickedOnTaskbar = e.target.closest('#taskbar');
                
                if (clickedInMenu || clickedOnPowerButton || clickedInContextMenu || clickedOnTaskbar) {
                    return;
                }
                
                TaskbarManager._hidePowerMenu(menu, null);
                if (closeOnClickOutside) {
                    document.removeEventListener('click', closeOnClickOutside);
                    document.removeEventListener('mousedown', closeOnClickOutside);
                }
            };
            
            menu._closeOnClickOutside = closeOnClickOutside;
            setTimeout(() => {
                document.addEventListener('click', closeOnClickOutside);
                document.addEventListener('mousedown', closeOnClickOutside);
            }, 100);
        }
        
        return menu;
    }
    
    /**
     * 显示电源菜单
     * @param {HTMLElement} menu 菜单元素
     * @param {HTMLElement} powerButton 电源按钮元素
     */
    static _showPowerMenu(menu, powerButton) {
        if (!menu || !powerButton) return;
        
        // 关闭通知栏（互斥显示）
        if (typeof NotificationManager !== 'undefined' && typeof NotificationManager._hideNotificationContainer === 'function') {
            NotificationManager._hideNotificationContainer();
        }
        
        // 清除之前的隐藏定时器（如果存在）
        if (menu._hideTimeout) {
            clearTimeout(menu._hideTimeout);
            menu._hideTimeout = null;
        }
        
        // 重置内联样式（确保之前强制隐藏的样式被清除）
        menu.style.display = '';
        menu.style.opacity = '';
        menu.style.visibility = '';
        
        // 先隐藏其他菜单
        const appMenu = document.getElementById('taskbar-app-menu');
        if (appMenu && appMenu.classList.contains('visible')) {
            TaskbarManager._hideAppMenu(appMenu, null);
        }
        
        // 计算菜单位置（在电源按钮上方）
        const buttonRect = powerButton.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 10;
        
        // 获取任务栏位置和尺寸
        const position = TaskbarManager._taskbarPosition || 'bottom';
        const taskbar = document.getElementById('taskbar');
        const taskbarRect = taskbar ? taskbar.getBoundingClientRect() : { width: 0, height: 0 };
        const taskbarWidth = taskbarRect.width || 60; // 默认任务栏宽度
        
        // 初始位置：在按钮上方，右对齐（菜单宽度180px）
        let menuLeft = buttonRect.right - 180; // 菜单右边缘对齐按钮右边缘
        let menuBottom = window.innerHeight - buttonRect.top + padding;
        
        // 等待DOM更新后获取实际尺寸并调整位置
        setTimeout(() => {
            const menuRect = menu.getBoundingClientRect();
            
            // 根据任务栏位置调整
            if (position === 'left') {
                // 任务栏在左侧，菜单显示在右侧
                menuLeft = taskbarRect.right + 10;
                menuBottom = window.innerHeight - buttonRect.top + padding;
                
                // 检查右边界
                if (menuLeft + menuRect.width > viewportWidth - padding) {
                    menuLeft = viewportWidth - menuRect.width - padding;
                }
                // 检查左边界（确保不被任务栏遮挡）
                if (menuLeft < taskbarRect.right + padding) {
                    menuLeft = taskbarRect.right + padding;
                }
            } else if (position === 'right') {
                // 任务栏在右侧，菜单显示在左侧
                menuLeft = taskbarRect.left - menuRect.width - 10;
                menuBottom = window.innerHeight - buttonRect.top + padding;
                
                // 检查左边界
                if (menuLeft < padding) {
                    menuLeft = padding;
                }
                // 检查右边界（确保不被任务栏遮挡）
                if (menuLeft + menuRect.width > taskbarRect.left - padding) {
                    menuLeft = taskbarRect.left - menuRect.width - padding;
                }
            } else {
                // 顶部/底部任务栏：菜单右对齐按钮
                menuLeft = buttonRect.right - menuRect.width;
                
                // 检查右边界
                if (menuLeft + menuRect.width > viewportWidth - padding) {
                    menuLeft = viewportWidth - menuRect.width - padding;
                }
                // 检查左边界
                if (menuLeft < padding) {
                    menuLeft = padding;
                }
            }
            
            // 检查上边界
            const menuTop = viewportHeight - menuBottom - menuRect.height;
            if (menuTop < padding) {
                menuBottom = Math.max(padding, viewportHeight - menuRect.height - padding);
            }
            
            // 应用计算后的位置
            menu.style.left = `${menuLeft}px`;
            menu.style.bottom = `${menuBottom}px`;
        }, 0);
        
        // 先设置初始位置
        if (position === 'left') {
            menu.style.left = `${taskbarRect.right + 10}px`;
        } else if (position === 'right') {
            menu.style.left = `${taskbarRect.left - 180 - 10}px`;
        } else {
            menu.style.left = `${buttonRect.right - 180}px`;
        }
        menu.style.bottom = `${window.innerHeight - buttonRect.top + 8}px`;
        
        // 使用 AnimateManager 添加打开动画
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.addAnimationClasses(menu, 'MENU', 'OPEN');
        }
        
        // 显示菜单（确保菜单已注册到 EventManager）
        setTimeout(() => {
            menu.classList.add('visible');
            // 如果使用 EventManager，确保菜单已注册（菜单在 _createPowerMenu 中已注册）
            if (typeof EventManager !== 'undefined' && typeof EventManager.registerMenu === 'function') {
                // 如果菜单未注册，重新注册
                if (!EventManager._registeredMenus || !EventManager._registeredMenus.has('power-menu')) {
                    EventManager.registerMenu(
                        'power-menu',
                        menu,
                        () => {
                            TaskbarManager._hidePowerMenu(menu, null);
                        },
                        ['.taskbar-power-button']
                    );
                }
            }
        }, 10);
    }
    
    /**
     * 隐藏电源菜单
     * @param {HTMLElement} menu 菜单元素
     * @param {HTMLElement} powerButton 电源按钮元素（可选）
     */
    static _hidePowerMenu(menu, powerButton, immediate = false) {
        if (!menu) return;
        
        // 清除之前的隐藏定时器
        if (menu._hideTimeout) {
            clearTimeout(menu._hideTimeout);
            menu._hideTimeout = null;
        }
        
        // 如果立即关闭，跳过动画
        if (immediate) {
            // 立即停止动画并清理
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.stopAnimation(menu);
                AnimateManager.removeAnimationClasses(menu);
            }
            // 清理可能残留的样式属性
            menu.style.transform = '';
            menu.style.opacity = '';
            menu.style.scale = '';
            menu.style.translateX = '';
            menu.style.translateY = '';
            menu.classList.remove('visible');
        } else {
            // 使用 AnimateManager 添加关闭动画
            let closeDuration = 200; // 默认时长
            if (typeof AnimateManager !== 'undefined') {
                const config = AnimateManager.addAnimationClasses(menu, 'MENU', 'CLOSE');
                closeDuration = config ? config.duration : 200;
            }
            
            menu._hideTimeout = setTimeout(() => {
                menu.classList.remove('visible');
                if (typeof AnimateManager !== 'undefined') {
                    AnimateManager.removeAnimationClasses(menu);
                }
                // 清理可能残留的样式属性
                menu.style.transform = '';
                menu.style.opacity = '';
                menu.style.scale = '';
                menu.style.translateX = '';
                menu.style.translateY = '';
                menu._hideTimeout = null;
            }, closeDuration);
        }
        
        // 从 EventManager 注销菜单
        if (typeof EventManager !== 'undefined' && typeof EventManager.unregisterMenu === 'function') {
            EventManager.unregisterMenu('power-menu');
        } else {
            // 降级方案：清理事件监听器
            if (menu._closeOnClickOutside) {
                document.removeEventListener('click', menu._closeOnClickOutside);
                document.removeEventListener('mousedown', menu._closeOnClickOutside);
                menu._closeOnClickOutside = null;
            }
        }
    }
    
    /**
     * 重启系统
     */
    static async _restartSystem() {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("TaskbarManager", "系统重启请求");
        }
        
        // 隐藏电源菜单
        const powerMenu = document.getElementById('taskbar-power-menu');
        if (powerMenu) {
            TaskbarManager._hidePowerMenu(powerMenu, null);
        }
        
        // 显示确认对话框
        // 使用GUIManager的确认对话框
        let confirmed = false;
        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
            confirmed = await GUIManager.showConfirm(
                '确定要重启系统吗？所有未保存的数据将丢失。',
                '确认重启',
                'danger'
            );
        } else {
            confirmed = confirm('确定要重启系统吗？所有未保存的数据将丢失。');
        }
        if (!confirmed) {
            return;
        }
        
        // 执行重启（重新加载页面）
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("TaskbarManager", "正在重启系统...");
        }
        
        // 延迟一下，让日志输出
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }
    
    /**
     * 关闭系统
     */
    static async _shutdownSystem() {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("TaskbarManager", "系统关闭请求");
        }
        
        // 隐藏电源菜单
        const powerMenu = document.getElementById('taskbar-power-menu');
        if (powerMenu) {
            TaskbarManager._hidePowerMenu(powerMenu, null);
        }
        
        // 显示确认对话框
        // 使用GUIManager的确认对话框
        let confirmed = false;
        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
            confirmed = await GUIManager.showConfirm(
                '确定要关闭系统吗？所有未保存的数据将丢失。',
                '确认关闭',
                'danger'
            );
        } else {
            confirmed = confirm('确定要关闭系统吗？所有未保存的数据将丢失。');
        }
        if (!confirmed) {
            return;
        }
        
        // 执行关闭（关闭窗口/标签页）
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("TaskbarManager", "正在关闭系统...");
        }
        
        // 延迟一下，让日志输出
        setTimeout(async () => {
            // 尝试关闭窗口
            if (window.opener) {
                window.close();
            } else {
                // 如果无法关闭窗口，使用通知提示（不打断用户）
                // 注意：系统关闭后，通知可能无法显示，但这是最后的提示
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        // 使用 Exploit PID (10000) 创建通知
                        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
                        await NotificationManager.createNotification(exploitPid, {
                            type: 'snapshot',
                            title: '系统关闭',
                            content: '系统已关闭。请手动关闭浏览器标签页。',
                            duration: 0  // 不自动关闭
                        });
                    } catch (e) {
                        // 通知创建失败，静默处理（系统已关闭）
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("TaskbarManager", `创建通知失败: ${e.message}`);
                        }
                    }
                }
            }
        }, 500);
    }
    
    /**
     * 获取更新的程序数据（用于刷新多任务选择器）
     * @param {string} programName 程序名称
     * @returns {Object|null} 更新的程序数据
     */
    static _getUpdatedProgramData(programName) {
        // 重新获取程序信息
        let programInfo = null;
        if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.getProgramInfo === 'function') {
            try {
                programInfo = ApplicationAssetManager.getProgramInfo(programName);
            } catch (e) {
                // 忽略错误
            }
        }
        
        if (!programInfo) {
            return null;
        }
        
        // 重新收集实例信息
        const programInstancesMap = new Map();
        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.PROCESS_TABLE !== 'undefined') {
            try {
                const processTable = ProcessManager.PROCESS_TABLE;
                for (const [pid, processInfo] of processTable) {
                    if (processInfo.isExploit || 
                        (processInfo.isCLI && processInfo.launchedFromTerminal) ||
                        processInfo.isCLITerminal ||
                        processInfo.status !== 'running' ||
                        processInfo.programName !== programName) {
                        continue;
                    }
                    
                    if (!programInstancesMap.has(processInfo.programName)) {
                        programInstancesMap.set(processInfo.programName, []);
                    }
                    
                    // 检查该PID是否有多个窗口（包括子窗口）
                    if (typeof GUIManager !== 'undefined') {
                        const windows = GUIManager.getWindowsByPid(pid);
                        if (windows.length > 1) {
                            // 有多个窗口，为每个窗口创建一个实例条目
                            windows.forEach((win, index) => {
                                programInstancesMap.get(processInfo.programName).push({
                                    pid: pid,
                                    windowId: win.windowId,
                                    isMainWindow: win.isMainWindow || false,
                                    title: win.title || `${programName} (${index + 1})`,
                                    isMinimized: win.isMinimized || processInfo.isMinimized || false
                                });
                            });
                        } else if (windows.length === 1) {
                            // 只有一个窗口，包含windowId
                            programInstancesMap.get(processInfo.programName).push({
                                pid: pid,
                                windowId: windows[0].windowId,
                                isMainWindow: windows[0].isMainWindow || false,
                                title: windows[0].title || programName,
                                isMinimized: windows[0].isMinimized || processInfo.isMinimized || false
                            });
                        } else {
                            // 没有窗口，使用基本信息
                            programInstancesMap.get(processInfo.programName).push({
                                pid: pid,
                                isMinimized: processInfo.isMinimized || false
                            });
                        }
                    } else {
                        // GUIManager不可用，使用基本信息
                        programInstancesMap.get(processInfo.programName).push({
                            pid: pid,
                            isMinimized: processInfo.isMinimized || false
                        });
                    }
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        const instances = programInstancesMap.get(programName) || [];
        const isRunning = instances.length > 0;
        const isMinimized = instances.length === 1 ? instances[0].isMinimized : instances.every(inst => inst.isMinimized);
        
        return {
            name: programName,
            icon: programInfo.icon,
            metadata: programInfo.metadata || {},
            isRunning: isRunning,
            isMinimized: isMinimized,
            pid: instances.length > 0 ? instances[0].pid : null,
            instances: instances
        };
    }
    
    /**
     * 获取窗口元素
     * @param {number} pid 进程ID
     * @returns {HTMLElement|null} 窗口元素
     */
    static _getWindowElement(pid) {
        if (typeof ProcessManager === 'undefined') {
            return null;
        }
        
        // 尝试通过GUIManager获取窗口
        if (typeof GUIManager !== 'undefined' && typeof GUIManager._windows !== 'undefined') {
            const windowInfo = GUIManager._windows.get(pid);
            if (windowInfo && windowInfo.window) {
                return windowInfo.window;
            }
        }
        
        // 降级方案：通过data-pid查找
        const windowElement = document.querySelector(`[data-pid="${pid}"].zos-gui-window, [data-pid="${pid}"].bash-window`);
        if (windowElement) {
            return windowElement;
        }
        
        // 尝试通过ProcessManager获取GUI元素
        if (typeof ProcessManager.getProgramGUIElements === 'function') {
            const guiElements = ProcessManager.getProgramGUIElements(pid);
            if (guiElements && guiElements.length > 0) {
                // 查找窗口元素
                for (const element of guiElements) {
                    if (element.classList && (element.classList.contains('zos-gui-window') || element.classList.contains('bash-window'))) {
                        return element;
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * 获取程序是否支持预览
     * @param {number} pid 进程ID
     * @returns {boolean} 是否支持预览
     */
    static _getProgramSupportsPreview(pid) {
        if (typeof ProcessManager === 'undefined' || !ProcessManager.PROCESS_TABLE) {
            return false;
        }
        
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo || !processInfo.metadata) {
            return false;
        }
        
        // 检查元数据中的supportsPreview字段
        return processInfo.metadata.supportsPreview === true;
    }
    
    /**
     * 创建窗口缩略图预览（简化为只显示虚化的程序图标）
     * @param {HTMLElement} windowElement 窗口元素
     * @param {number} pid 进程ID
     * @returns {HTMLElement|null} 缩略图元素
     */
    static _createWindowThumbnail(windowElement, pid) {
        if (!windowElement) {
            return null;
        }
        
        try {
            // 创建缩略图容器
            const thumbnail = document.createElement('div');
            thumbnail.className = 'taskbar-window-thumbnail';
            thumbnail.dataset.pid = pid.toString();
            
            // 固定缩略图尺寸
            const thumbnailWidth = 200;
            const thumbnailHeight = 150;
            
            // 获取程序信息以获取图标
            let programName = null;
            if (typeof ProcessManager !== 'undefined' && ProcessManager.PROCESS_TABLE) {
                const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
                if (processInfo) {
                    programName = processInfo.programName;
                }
            }
            
            // 获取程序图标路径
            let iconPath = null;
            // 特殊处理：Exploit程序使用专门的图标文件
            if (programName === 'exploit') {
                iconPath = 'exploit.svg';
            } else if (programName && typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.getProgramInfo === 'function') {
                try {
                    const programInfo = ApplicationAssetManager.getProgramInfo(programName);
                    if (programInfo && programInfo.icon) {
                        iconPath = programInfo.icon;
                    }
                } catch (e) {
                    KernelLogger.debug("TaskbarManager", `获取程序图标失败: ${e.message}`);
                }
            }
            
            // 创建图标预览
            TaskbarManager._createIconThumbnail(thumbnail, iconPath, programName, thumbnailWidth, thumbnailHeight);
            
            // 设置缩略图样式
            thumbnail.style.width = `${thumbnailWidth}px`;
            thumbnail.style.height = `${thumbnailHeight}px`;
            thumbnail.style.borderRadius = '8px';
            thumbnail.style.overflow = 'hidden';
            thumbnail.style.border = '1px solid rgba(108, 142, 255, 0.2)';
            thumbnail.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
            thumbnail.style.background = 'linear-gradient(135deg, rgba(26, 31, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 100%)';
            thumbnail.style.display = 'flex';
            thumbnail.style.alignItems = 'center';
            thumbnail.style.justifyContent = 'center';
            thumbnail.style.position = 'relative';
            
            return thumbnail;
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `创建窗口缩略图失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 创建图标缩略图（虚化、稍大的程序图标）
     * @param {HTMLElement} thumbnail 缩略图容器
     * @param {string|null} iconPath 图标路径
     * @param {string|null} programName 程序名称
     * @param {number} width 容器宽度
     * @param {number} height 容器高度
     */
    static _createIconThumbnail(thumbnail, iconPath, programName, width, height) {
        // 清空容器
        thumbnail.innerHTML = '';
        
        // 创建图标容器
        const iconContainer = document.createElement('div');
        iconContainer.className = 'taskbar-thumbnail-icon-container';
        iconContainer.style.cssText = `
            width: ${Math.min(width * 0.6, 120)}px;
            height: ${Math.min(height * 0.6, 120)}px;
            display: flex;
            align-items: center;
            justify-content: center;
            filter: blur(8px);
            opacity: 0.7;
            transition: all 0.3s ease;
        `;
        
        if (iconPath) {
            // 如果有图标路径，使用图标
            const iconImg = document.createElement('img');
            // 转换虚拟路径为实际 URL
            const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                ? ProcessManager.convertVirtualPathToUrl(iconPath)
                : iconPath;
            iconImg.src = iconUrl;
            iconImg.alt = programName || '程序图标';
            iconImg.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: contain;
            `;
            iconImg.onerror = () => {
                // 图标加载失败，使用默认图标
                TaskbarManager._createDefaultIcon(iconContainer, programName);
            };
            iconContainer.appendChild(iconImg);
        } else {
            // 没有图标路径，使用默认图标
            TaskbarManager._createDefaultIcon(iconContainer, programName);
        }
        
        thumbnail.appendChild(iconContainer);
        
        // 添加程序名称标签（可选，在底部显示）
        if (programName) {
            const nameLabel = document.createElement('div');
            nameLabel.className = 'taskbar-thumbnail-name';
            nameLabel.textContent = programName;
            nameLabel.style.cssText = `
                position: absolute;
                bottom: 8px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 11px;
                color: rgba(215, 224, 221, 0.6);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 90%;
                text-align: center;
            `;
            thumbnail.appendChild(nameLabel);
        }
    }
    
    /**
     * 创建默认图标（当没有图标路径时）
     * @param {HTMLElement} container 图标容器
     * @param {string|null} programName 程序名称
     */
    static _createDefaultIcon(container, programName) {
        // 使用风格相关的默认程序图标（带重试机制）
        TaskbarManager._loadSystemIconWithRetry('app-default', container).catch(e => {
            KernelLogger.warn("TaskbarManager", `加载默认程序图标失败: ${e.message}，使用降级图标`);
            // 降级：创建简单的默认图标 SVG
            const defaultIcon = document.createElement('div');
            defaultIcon.innerHTML = `
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.6"/>
                    <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.6"/>
                    <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.6"/>
                    <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.6"/>
                </svg>
            `;
            defaultIcon.style.cssText = `
                width: 100%;
                height: 100%;
                color: rgba(108, 142, 255, 0.5);
            `;
            container.appendChild(defaultIcon);
        });
    }
    
    /**
     * 使用html2canvas捕获窗口（带错误处理和重试）
     * @param {Function} html2canvas html2canvas函数
     * @param {HTMLElement} windowElement 窗口元素
     * @param {HTMLElement} thumbnail 缩略图容器
     * @param {number} windowWidth 窗口宽度
     * @param {number} windowHeight 窗口高度
     * @param {number} thumbnailWidth 缩略图宽度
     * @param {number} thumbnailHeight 缩略图高度
     */
    static _captureWindowWithHtml2Canvas(html2canvas, windowElement, thumbnail, windowWidth, windowHeight, thumbnailWidth, thumbnailHeight) {
        // 保存原始样式
        const originalStyles = {
            visibility: windowElement.style.visibility || '',
            display: windowElement.style.display || '',
            opacity: windowElement.style.opacity || '',
            transform: windowElement.style.transform || '',
            position: windowElement.style.position || '',
            zIndex: windowElement.style.zIndex || ''
        };
        
        // 确保窗口元素在DOM中
        if (!windowElement.parentElement) {
            KernelLogger.warn("TaskbarManager", "窗口元素不在DOM中，无法捕获");
            TaskbarManager._createSimpleThumbnail(thumbnail, windowElement, thumbnailWidth, thumbnailHeight);
            return;
        }
        
        // 获取计算样式
        const computedStyle = getComputedStyle(windowElement);
        const isMinimized = windowElement.classList.contains('zos-window-minimized');
        const isHidden = computedStyle.visibility === 'hidden' || 
                        computedStyle.display === 'none' ||
                        computedStyle.opacity === '0' ||
                        isMinimized;
        
        // 如果窗口被隐藏或最小化，临时显示它
        if (isHidden) {
            // 临时显示窗口（但保持在屏幕外，避免闪烁）
            windowElement.style.visibility = 'visible';
            windowElement.style.display = 'block';
            windowElement.style.opacity = '1';
            windowElement.classList.remove('zos-window-minimized');
            
            // 如果窗口被最小化，临时设置位置（在屏幕外）
            const originalLeft = windowElement.style.left;
            const originalTop = windowElement.style.top;
            const wasOffScreen = windowElement.style.left === '' && windowElement.style.top === '';
            
            if (wasOffScreen || isMinimized) {
                // 临时将窗口移到屏幕外但可见的位置（用于捕获）
                windowElement.style.position = 'fixed';
                windowElement.style.left = '-9999px';
                windowElement.style.top = '0px';
                windowElement.style.zIndex = '999999'; // 确保在最上层
            }
            
            // 等待样式应用
            setTimeout(() => {
                TaskbarManager._executeCapture(html2canvas, windowElement, thumbnail, windowWidth, windowHeight, thumbnailWidth, thumbnailHeight, originalStyles, originalLeft, originalTop, wasOffScreen || isMinimized);
            }, 50);
        } else {
            // 窗口已可见，直接捕获
            TaskbarManager._executeCapture(html2canvas, windowElement, thumbnail, windowWidth, windowHeight, thumbnailWidth, thumbnailHeight, originalStyles, null, null, false);
        }
    }
    
    /**
     * 执行实际的捕获操作
     * @param {Function} html2canvas html2canvas函数
     * @param {HTMLElement} windowElement 窗口元素
     * @param {HTMLElement} thumbnail 缩略图容器
     * @param {number} windowWidth 窗口宽度
     * @param {number} windowHeight 窗口高度
     * @param {number} thumbnailWidth 缩略图宽度
     * @param {number} thumbnailHeight 缩略图高度
     * @param {Object} originalStyles 原始样式
     * @param {string} originalLeft 原始left值
     * @param {string} originalTop 原始top值
     * @param {boolean} needsRestore 是否需要恢复位置
     */
    static _executeCapture(html2canvas, windowElement, thumbnail, windowWidth, windowHeight, thumbnailWidth, thumbnailHeight, originalStyles, originalLeft, originalTop, needsRestore) {
        
        // 确保窗口元素已附加到 DOM（html2canvas 要求）
        if (!windowElement.parentElement || !document.body.contains(windowElement)) {
            KernelLogger.warn("TaskbarManager", "窗口元素未附加到 DOM，无法捕获");
            TaskbarManager._restoreWindowStyles(windowElement, originalStyles, originalLeft, originalTop, needsRestore);
            TaskbarManager._createSimpleThumbnail(thumbnail, windowElement, thumbnailWidth, thumbnailHeight);
            return;
        }
        
        // 获取窗口的实际位置和尺寸
        const rect = windowElement.getBoundingClientRect();
        const actualWidth = rect.width || windowWidth;
        const actualHeight = rect.height || windowHeight;
        
        // 检查窗口是否包含 iframe（可能导致捕获失败）
        const hasIframe = windowElement.querySelector('iframe') !== null;
        if (hasIframe) {
            KernelLogger.debug("TaskbarManager", "窗口包含 iframe，html2canvas 可能无法正确捕获，使用简化预览");
            TaskbarManager._restoreWindowStyles(windowElement, originalStyles, originalLeft, originalTop, needsRestore);
            TaskbarManager._createSimpleThumbnail(thumbnail, windowElement, thumbnailWidth, thumbnailHeight);
            return;
        }
        
        // 创建临时容器用于克隆窗口
        const tempContainer = document.createElement('div');
        tempContainer.id = 'taskbar-preview-temp-container';
        tempContainer.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: ${actualWidth}px;
            height: ${actualHeight}px;
            z-index: 999999;
            visibility: visible;
            opacity: 1;
            pointer-events: none;
        `;
        
        // 深度克隆窗口元素（包括所有子节点和属性）
        const clonedWindow = windowElement.cloneNode(true);
        
        // 复制内联样式
        if (windowElement.style.cssText) {
            clonedWindow.style.cssText = windowElement.style.cssText;
        }
        
        // 复制所有计算样式（通过逐个设置）
        const computedStyle = getComputedStyle(windowElement);
        const importantStyles = [
            'background', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
            'color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
            'border', 'borderRadius', 'boxShadow', 'padding', 'margin',
            'overflow', 'overflowX', 'overflowY'
        ];
        
        importantStyles.forEach(prop => {
            try {
                const value = computedStyle.getPropertyValue(prop);
                if (value) {
                    clonedWindow.style.setProperty(prop, value);
                }
            } catch (e) {
                // 忽略无法设置的样式
            }
        });
        
        // 确保克隆的元素有正确的尺寸和位置
        clonedWindow.style.position = 'relative';
        clonedWindow.style.left = '0';
        clonedWindow.style.top = '0';
        clonedWindow.style.width = `${actualWidth}px`;
        clonedWindow.style.height = `${actualHeight}px`;
        clonedWindow.style.visibility = 'visible';
        clonedWindow.style.display = 'block';
        clonedWindow.style.opacity = '1';
        clonedWindow.style.transform = 'none';
        clonedWindow.style.zIndex = '1';
        clonedWindow.style.margin = '0';
        clonedWindow.style.padding = computedStyle.padding || '0';
        
        // 复制所有 data 属性
        Array.from(windowElement.attributes).forEach(attr => {
            if (attr.name.startsWith('data-')) {
                clonedWindow.setAttribute(attr.name, attr.value);
            }
        });
        
        // 移除可能导致问题的属性
        clonedWindow.removeAttribute('data-html2canvas-ignore');
        const allIgnored = clonedWindow.querySelectorAll('[data-html2canvas-ignore]');
        allIgnored.forEach(el => el.removeAttribute('data-html2canvas-ignore'));
        
        // 复制类名
        clonedWindow.className = windowElement.className;
        
        // 将克隆的元素添加到临时容器
        tempContainer.appendChild(clonedWindow);
        
        // 将临时容器添加到 body（html2canvas 需要元素在 DOM 中）
        document.body.appendChild(tempContainer);
        
        // 等待 DOM 更新
        setTimeout(() => {
        
            // 尝试多种捕获策略（使用克隆的元素）
            const captureStrategies = [
                // 策略1: 使用最简单的配置捕获克隆的元素
                () => {
                    return html2canvas(clonedWindow, {
                        scale: 0.15,
                        useCORS: false,
                        logging: false,
                        backgroundColor: '#1a1f2e',
                        allowTaint: false,
                        foreignObjectRendering: false,
                        removeContainer: true,
                        ignoreElements: (element) => {
                            // 忽略 iframe 和其他可能导致问题的元素
                            return element.tagName === 'IFRAME' || 
                                   element.tagName === 'OBJECT' || 
                                   element.tagName === 'EMBED';
                        }
                    });
                },
                // 策略2: 捕获克隆窗口的内容区域（排除标题栏）
                () => {
                    const contentArea = clonedWindow.querySelector('.zos-window-content') || 
                                      clonedWindow.querySelector('[class*="content"]');
                    const targetElement = contentArea && contentArea.offsetHeight > 0 ? contentArea : clonedWindow;
                    
                    return html2canvas(targetElement, {
                        scale: 0.15,
                        useCORS: false,
                        logging: false,
                        backgroundColor: '#1a1f2e',
                        allowTaint: false,
                        foreignObjectRendering: false,
                        removeContainer: true,
                        ignoreElements: (element) => {
                            return element.tagName === 'IFRAME' || 
                                   element.tagName === 'OBJECT' || 
                                   element.tagName === 'EMBED';
                        }
                    });
                },
                // 策略3: 使用最保守的配置
                () => {
                    return html2canvas(clonedWindow, {
                        scale: 0.1,
                        useCORS: false,
                        logging: false,
                        backgroundColor: '#1a1f2e',
                        allowTaint: false,
                        foreignObjectRendering: false,
                        removeContainer: true,
                        proxy: undefined,
                        imageTimeout: 0,
                        ignoreElements: (element) => {
                            // 忽略所有可能导致问题的元素
                            const tagName = element.tagName;
                            return tagName === 'IFRAME' || 
                                   tagName === 'OBJECT' || 
                                   tagName === 'EMBED' ||
                                   tagName === 'VIDEO' ||
                                   tagName === 'AUDIO' ||
                                   tagName === 'CANVAS';
                        }
                    });
                }
            ];
        
            // 尝试每个策略
            let currentStrategy = 0;
            const tryCapture = () => {
                if (currentStrategy >= captureStrategies.length) {
                    // 所有策略都失败，清理临时容器并恢复样式
                    TaskbarManager._cleanupTempContainer(tempContainer);
                    TaskbarManager._restoreWindowStyles(windowElement, originalStyles, originalLeft, originalTop, needsRestore);
                    KernelLogger.warn("TaskbarManager", "所有捕获策略都失败，使用简化预览");
                    TaskbarManager._createSimpleThumbnail(thumbnail, windowElement, thumbnailWidth, thumbnailHeight);
                    return;
                }
                
                const strategy = captureStrategies[currentStrategy];
                currentStrategy++;
                
                strategy()
                    .then(canvas => {
                        // 清理临时容器
                        TaskbarManager._cleanupTempContainer(tempContainer);
                        
                        // 恢复样式
                        TaskbarManager._restoreWindowStyles(windowElement, originalStyles, originalLeft, originalTop, needsRestore);
                        
                        if (canvas && canvas.toDataURL) {
                            thumbnail.style.backgroundImage = `url(${canvas.toDataURL('image/png')})`;
                            thumbnail.style.backgroundSize = 'cover';
                            thumbnail.style.backgroundPosition = 'center';
                            thumbnail.style.backgroundRepeat = 'no-repeat';
                        } else {
                            throw new Error('html2canvas 返回的 canvas 对象无效');
                        }
                    })
                    .catch((error) => {
                        const errorMessage = error && error.message ? error.message : (error ? String(error) : '未知错误');
                        KernelLogger.debug("TaskbarManager", `捕获策略 ${currentStrategy} 失败: ${errorMessage}，尝试下一个策略`);
                        // 尝试下一个策略
                        tryCapture();
                    });
            };
            
            // 开始尝试捕获
            tryCapture();
        }, 50); // 等待 DOM 更新
    }
    
    /**
     * 清理临时容器
     * @param {HTMLElement} tempContainer 临时容器
     */
    static _cleanupTempContainer(tempContainer) {
        try {
            if (tempContainer && tempContainer.parentElement) {
                tempContainer.parentElement.removeChild(tempContainer);
            }
        } catch (error) {
            KernelLogger.warn("TaskbarManager", `清理临时容器失败: ${error.message}`);
        }
    }
    
    /**
     * 恢复窗口样式
     * @param {HTMLElement} windowElement 窗口元素
     * @param {Object} originalStyles 原始样式
     * @param {string} originalLeft 原始left值
     * @param {string} originalTop 原始top值
     * @param {boolean} needsRestore 是否需要恢复位置
     */
    static _restoreWindowStyles(windowElement, originalStyles, originalLeft, originalTop, needsRestore) {
        // 恢复样式
        if (originalStyles.visibility !== undefined) {
            windowElement.style.visibility = originalStyles.visibility;
        }
        if (originalStyles.display !== undefined) {
            windowElement.style.display = originalStyles.display;
        }
        if (originalStyles.opacity !== undefined) {
            windowElement.style.opacity = originalStyles.opacity;
        }
        if (originalStyles.transform !== undefined) {
            windowElement.style.transform = originalStyles.transform;
        }
        if (originalStyles.position !== undefined) {
            windowElement.style.position = originalStyles.position;
        }
        if (originalStyles.zIndex !== undefined) {
            windowElement.style.zIndex = originalStyles.zIndex;
        }
        
        // 恢复位置（如果需要）
        if (needsRestore) {
            if (originalLeft !== null) {
                windowElement.style.left = originalLeft;
            }
            if (originalTop !== null) {
                windowElement.style.top = originalTop;
            }
            // 如果窗口被最小化，恢复最小化状态
            if (windowElement.classList.contains('zos-window-minimized') === false && 
                (originalStyles.visibility === 'hidden' || originalStyles.display === 'none')) {
                windowElement.classList.add('zos-window-minimized');
            }
        }
    }
    
    /**
     * 加载html2canvas模块（通过DynamicManager）
     * @returns {Promise<Function|null>} html2canvas函数或null
     */
    static async _loadHtml2Canvas() {
        // 首先检查全局作用域是否已有html2canvas
        if (typeof html2canvas !== 'undefined') {
            // 确保 html2canvas 是一个函数
            if (typeof html2canvas === 'function') {
                return html2canvas;
            } else if (html2canvas && typeof html2canvas.default === 'function') {
                // 可能是 ES6 模块导出，尝试使用 default
                return html2canvas.default;
            } else if (html2canvas && typeof html2canvas.html2canvas === 'function') {
                // 可能是命名导出
                return html2canvas.html2canvas;
            }
        }
        
        // 尝试通过DynamicManager加载
        if (typeof DynamicManager !== 'undefined' && typeof DynamicManager.loadModule === 'function') {
            try {
                const html2canvasModule = await DynamicManager.loadModule('html2canvas');
                
                // 检查返回的模块类型
                if (html2canvasModule) {
                    if (typeof html2canvasModule === 'function') {
                        return html2canvasModule;
                    } else if (typeof html2canvasModule.default === 'function') {
                        // ES6 模块导出
                        return html2canvasModule.default;
                    } else if (typeof html2canvasModule.html2canvas === 'function') {
                        // 命名导出
                        return html2canvasModule.html2canvas;
                    } else {
                        KernelLogger.warn("TaskbarManager", `html2canvas 模块加载成功但格式不正确 (类型: ${typeof html2canvasModule})`);
                        // 再次检查全局作用域（模块可能已经注册到全局）
                        if (typeof window !== 'undefined' && typeof window.html2canvas === 'function') {
                            return window.html2canvas;
                        }
                    }
                }
                
                return null;
            } catch (error) {
                const errorMessage = error && error.message ? error.message : (error ? String(error) : '未知错误');
                KernelLogger.warn("TaskbarManager", `通过DynamicManager加载html2canvas失败: ${errorMessage}`, error);
                return null;
            }
        }
        
        // DynamicManager不可用，返回null
        return null;
    }
    
    /**
     * 创建简化的窗口缩略图（不使用html2canvas）
     * @param {HTMLElement} thumbnail 缩略图容器
     * @param {HTMLElement} windowElement 窗口元素
     * @param {number} width 缩略图宽度
     * @param {number} height 缩略图高度
     */
    static _createSimpleThumbnail(thumbnail, windowElement, width, height) {
        // 获取窗口的计算样式
        const computedStyle = getComputedStyle(windowElement);
        const bgColor = computedStyle.backgroundColor || 'rgba(20, 25, 35, 0.95)';
        const borderColor = computedStyle.borderColor || 'rgba(108, 142, 255, 0.15)';
        
        // 创建简化的预览
        thumbnail.style.backgroundColor = bgColor;
        thumbnail.style.borderColor = borderColor;
        
        // 添加窗口标题（如果有）
        const titleBar = windowElement.querySelector('.zos-window-titlebar');
        if (titleBar) {
            const title = titleBar.querySelector('.zos-window-title');
            if (title) {
                const titleText = document.createElement('div');
                titleText.className = 'taskbar-thumbnail-title';
                titleText.textContent = title.textContent || '';
                titleText.style.cssText = `
                    position: absolute;
                    top: 4px;
                    left: 4px;
                    right: 4px;
                    font-size: 10px;
                    color: rgba(215, 224, 221, 0.8);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    background: rgba(0, 0, 0, 0.3);
                    padding: 2px 6px;
                    border-radius: 2px;
                `;
                thumbnail.appendChild(titleText);
            }
        }
        
        // 添加窗口状态指示器
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'taskbar-thumbnail-status';
        if (windowElement.classList.contains('zos-window-focused')) {
            statusIndicator.style.cssText = `
                position: absolute;
                top: 4px;
                right: 4px;
                width: 8px;
                height: 8px;
                background: rgba(108, 142, 255, 0.8);
                border-radius: 50%;
                box-shadow: 0 0 4px rgba(108, 142, 255, 0.6);
            `;
        } else {
            statusIndicator.style.cssText = `
                position: absolute;
                top: 4px;
                right: 4px;
                width: 8px;
                height: 8px;
                background: rgba(215, 224, 221, 0.3);
                border-radius: 50%;
            `;
        }
        thumbnail.appendChild(statusIndicator);
    }
    
    /**
     * 显示窗口预览（悬停在任务栏图标上时）
     * @param {HTMLElement} iconContainer 任务栏图标容器
     * @param {HTMLElement} windowElement 窗口元素
     * @param {number} pid 进程ID
     * @returns {HTMLElement|null} 预览元素
     */
    static _showWindowPreview(iconContainer, windowElement, pid) {
        // 如果已经有预览，不重复创建
        const existingPreview = document.getElementById(`taskbar-preview-${pid}`);
        if (existingPreview) {
            existingPreview.classList.add('visible');
            return existingPreview;
        }
        
        try {
            // 创建预览容器
            const preview = document.createElement('div');
            preview.id = `taskbar-preview-${pid}`;
            preview.className = 'taskbar-window-preview';
            preview.dataset.pid = pid.toString();
            
            // 创建预览缩略图
            const thumbnail = TaskbarManager._createWindowThumbnail(windowElement, pid);
            if (thumbnail) {
                preview.appendChild(thumbnail);
            }
            
            // 添加窗口标题
            const titleBar = windowElement.querySelector('.zos-window-titlebar');
            if (titleBar) {
                const title = titleBar.querySelector('.zos-window-title');
                if (title) {
                    const previewTitle = document.createElement('div');
                    previewTitle.className = 'taskbar-preview-title';
                    previewTitle.textContent = title.textContent || '';
                    preview.appendChild(previewTitle);
                }
            }
            
            // 添加到body
            document.body.appendChild(preview);
            
            // 定位预览（在任务栏图标上方）
            const iconRect = iconContainer.getBoundingClientRect();
            const previewRect = preview.getBoundingClientRect();
            const taskbarHeight = 60; // 任务栏高度
            const padding = 10;
            
            preview.style.left = `${iconRect.left + (iconRect.width / 2) - (previewRect.width / 2)}px`;
            preview.style.bottom = `${window.innerHeight - iconRect.top + padding}px`;
            
            // 确保预览不超出屏幕
            const maxLeft = window.innerWidth - previewRect.width - padding;
            const minLeft = padding;
            const currentLeft = parseFloat(preview.style.left);
            if (currentLeft < minLeft) {
                preview.style.left = `${minLeft}px`;
            } else if (currentLeft > maxLeft) {
                preview.style.left = `${maxLeft}px`;
            }
            
            // 显示动画
            setTimeout(() => {
                preview.classList.add('visible');
            }, 10);
            
            // 添加鼠标事件：当鼠标离开预览窗口时隐藏
            let previewLeaveTimer = null;
            preview.addEventListener('mouseenter', () => {
                // 鼠标进入预览窗口，取消隐藏定时器
                if (previewLeaveTimer) {
                    clearTimeout(previewLeaveTimer);
                    previewLeaveTimer = null;
                }
            });
            
            preview.addEventListener('mouseleave', (e) => {
                // 检查鼠标是否移动到图标容器
                if (iconContainer && iconContainer.contains(e.relatedTarget)) {
                    // 鼠标移动到图标，不隐藏预览
                    return;
                }
                
                // 鼠标离开预览窗口，延迟隐藏（给用户时间移回图标）
                previewLeaveTimer = setTimeout(() => {
                    // 再次检查鼠标是否在图标上
                    if (!iconContainer || !iconContainer.matches(':hover')) {
                        TaskbarManager._hideWindowPreview(preview);
                    }
                }, 200);
            });
            
            // 添加全局点击事件：点击其他地方时隐藏预览
            const hidePreviewOnClick = (e) => {
                // 如果点击的不是图标容器或预览窗口，隐藏预览
                if (!iconContainer.contains(e.target) && !preview.contains(e.target)) {
                    TaskbarManager._hideWindowPreview(preview);
                    document.removeEventListener('click', hidePreviewOnClick, true);
                    document.removeEventListener('mousedown', hidePreviewOnClick, true);
                }
            };
            
            // 延迟添加全局事件监听器，避免立即触发
            setTimeout(() => {
                document.addEventListener('click', hidePreviewOnClick, true);
                document.addEventListener('mousedown', hidePreviewOnClick, true);
            }, 100);
            
            // 监听窗口状态变化：窗口关闭或最小化时隐藏预览
            const checkWindowState = () => {
                if (!windowElement || !windowElement.parentElement) {
                    // 窗口已关闭
                    TaskbarManager._hideWindowPreview(preview);
                    return;
                }
                
                // 检查窗口是否最小化
                if (typeof GUIManager !== 'undefined') {
                    const windowInfo = GUIManager.getWindowInfoByPid(pid);
                    if (windowInfo && windowInfo.isMinimized) {
                        // 窗口已最小化，隐藏预览
                        TaskbarManager._hideWindowPreview(preview);
                    }
                }
            };
            
            // 使用MutationObserver监听窗口元素的变化
            const observer = new MutationObserver(checkWindowState);
            if (windowElement) {
                observer.observe(windowElement, {
                    attributes: true,
                    attributeFilter: ['class', 'style'],
                    childList: false,
                    subtree: false
                });
            }
            
            // 存储清理函数，以便在隐藏时调用
            preview._cleanupListeners = () => {
                document.removeEventListener('click', hidePreviewOnClick, true);
                document.removeEventListener('mousedown', hidePreviewOnClick, true);
                if (previewLeaveTimer) {
                    clearTimeout(previewLeaveTimer);
                }
                if (observer) {
                    observer.disconnect();
                }
            };
            
            return preview;
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `显示窗口预览失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 隐藏窗口预览
     * @param {HTMLElement} previewElement 预览元素
     */
    static _hideWindowPreview(previewElement) {
        if (!previewElement) {
            return;
        }
        
        // 清理事件监听器
        if (previewElement._cleanupListeners && typeof previewElement._cleanupListeners === 'function') {
            previewElement._cleanupListeners();
            delete previewElement._cleanupListeners;
        }
        
        previewElement.classList.remove('visible');
        
        // 延迟移除DOM元素
        setTimeout(() => {
            if (previewElement.parentElement) {
                previewElement.parentElement.removeChild(previewElement);
            }
        }, 300); // 等待淡出动画完成
    }
    
    /**
     * 显示多窗口预览（类似Windows的任务预览）
     * @param {HTMLElement} iconContainer 任务栏图标容器
     * @param {Array<Object>} windows 窗口信息数组
     * @param {number} pid 进程ID
     * @returns {HTMLElement|null} 预览元素
     */
    static _showMultiWindowPreview(iconContainer, windows, pid) {
        const existingPreview = document.getElementById(`taskbar-preview-multi-${pid}`);
        if (existingPreview) {
            existingPreview.classList.add('visible');
            return existingPreview;
        }
        
        try {
            // 创建多窗口预览容器
            const preview = document.createElement('div');
            preview.id = `taskbar-preview-multi-${pid}`;
            preview.className = 'taskbar-window-preview taskbar-multi-window-preview';
            preview.dataset.pid = pid.toString();
            
            // 创建标题
            const header = document.createElement('div');
            header.className = 'taskbar-preview-header';
            const programName = windows[0]?.title || '窗口';
            header.textContent = `${programName} (${windows.length} 个窗口)`;
            preview.appendChild(header);
            
            // 创建窗口列表容器
            const windowsList = document.createElement('div');
            windowsList.className = 'taskbar-preview-windows-list';
            
            // 为每个窗口创建预览项
            windows.forEach((windowInfo, index) => {
                const windowItem = document.createElement('div');
                windowItem.className = 'taskbar-preview-window-item';
                windowItem.dataset.windowId = windowInfo.windowId;
                if (windowInfo.isMainWindow) {
                    windowItem.classList.add('main-window');
                }
                if (windowInfo.isMinimized) {
                    windowItem.classList.add('minimized');
                }
                if (windowInfo.isFocused) {
                    windowItem.classList.add('focused');
                }
                
                // 创建缩略图
                const thumbnail = TaskbarManager._createWindowThumbnail(windowInfo.window, pid);
                if (thumbnail) {
                    thumbnail.className = 'taskbar-preview-window-thumbnail';
                    windowItem.appendChild(thumbnail);
                }
                
                // 创建窗口标题
                const title = document.createElement('div');
                title.className = 'taskbar-preview-window-title';
                title.textContent = windowInfo.title || `窗口 ${index + 1}`;
                if (windowInfo.isMainWindow) {
                    title.textContent += ' (主窗口)';
                }
                windowItem.appendChild(title);
                
                // 点击预览项，聚焦对应窗口
                windowItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.focusWindow === 'function') {
                        GUIManager.focusWindow(windowInfo.windowId);
                    }
                    TaskbarManager._hideWindowPreview(preview);
                });
                
                // 悬停高亮
                windowItem.addEventListener('mouseenter', () => {
                    windowItem.classList.add('hover');
                });
                windowItem.addEventListener('mouseleave', () => {
                    windowItem.classList.remove('hover');
                });
                
                windowsList.appendChild(windowItem);
            });
            
            preview.appendChild(windowsList);
            
            // 添加到body
            document.body.appendChild(preview);
            
            // 定位预览（在任务栏图标上方）
            const iconRect = iconContainer.getBoundingClientRect();
            const previewRect = preview.getBoundingClientRect();
            const padding = 10;
            
            preview.style.left = `${iconRect.left + (iconRect.width / 2) - (previewRect.width / 2)}px`;
            preview.style.bottom = `${window.innerHeight - iconRect.top + padding}px`;
            
            // 确保预览不超出屏幕
            const maxLeft = window.innerWidth - previewRect.width - padding;
            const minLeft = padding;
            const currentLeft = parseFloat(preview.style.left);
            if (currentLeft < minLeft) {
                preview.style.left = `${minLeft}px`;
            } else if (currentLeft > maxLeft) {
                preview.style.left = `${maxLeft}px`;
            }
            
            // 显示动画
            setTimeout(() => {
                preview.classList.add('visible');
            }, 10);
            
            // 添加鼠标事件：当鼠标离开预览窗口时隐藏
            let previewLeaveTimer = null;
            preview.addEventListener('mouseenter', () => {
                // 鼠标进入预览窗口，取消隐藏定时器
                if (previewLeaveTimer) {
                    clearTimeout(previewLeaveTimer);
                    previewLeaveTimer = null;
                }
            });
            
            preview.addEventListener('mouseleave', (e) => {
                // 检查鼠标是否移动到图标容器
                if (iconContainer && iconContainer.contains(e.relatedTarget)) {
                    // 鼠标移动到图标，不隐藏预览
                    return;
                }
                
                // 鼠标离开预览窗口，延迟隐藏（给用户时间移回图标）
                previewLeaveTimer = setTimeout(() => {
                    // 再次检查鼠标是否在图标上
                    if (!iconContainer || !iconContainer.matches(':hover')) {
                        TaskbarManager._hideWindowPreview(preview);
                    }
                }, 200);
            });
            
            // 添加全局点击事件：点击其他地方时隐藏预览
            const hidePreviewOnClick = (e) => {
                // 如果点击的不是图标容器或预览窗口，隐藏预览
                if (!iconContainer.contains(e.target) && !preview.contains(e.target)) {
                    TaskbarManager._hideWindowPreview(preview);
                    document.removeEventListener('click', hidePreviewOnClick, true);
                    document.removeEventListener('mousedown', hidePreviewOnClick, true);
                }
            };
            
            // 延迟添加全局事件监听器，避免立即触发
            setTimeout(() => {
                document.addEventListener('click', hidePreviewOnClick, true);
                document.addEventListener('mousedown', hidePreviewOnClick, true);
            }, 100);
            
            // 监听窗口状态变化：所有窗口关闭或最小化时隐藏预览
            const checkWindowsState = () => {
                if (typeof GUIManager !== 'undefined') {
                    const currentWindows = GUIManager.getWindowsByPid(pid);
                    // 如果所有窗口都关闭或最小化，隐藏预览
                    if (currentWindows.length === 0 || currentWindows.every(w => w.isMinimized || !w.window || !w.window.parentElement)) {
                        TaskbarManager._hideWindowPreview(preview);
                    }
                }
            };
            
            // 使用定时器定期检查窗口状态（因为窗口状态变化可能不触发DOM变化）
            const stateCheckInterval = setInterval(() => {
                checkWindowsState();
            }, 500);
            
            // 存储清理函数，以便在隐藏时调用
            preview._cleanupListeners = () => {
                document.removeEventListener('click', hidePreviewOnClick, true);
                document.removeEventListener('mousedown', hidePreviewOnClick, true);
                if (previewLeaveTimer) {
                    clearTimeout(previewLeaveTimer);
                }
                if (stateCheckInterval) {
                    clearInterval(stateCheckInterval);
                }
            };
            
            return preview;
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `显示多窗口预览失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 尝试同步加载任务栏位置（如果 LStorage 已初始化）
     * @returns {boolean} 是否成功加载
     */
    static _tryLoadTaskbarPositionSync() {
        try {
            // 获取 LStorage
            let LStorageRef = null;
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    LStorageRef = POOL.__GET__("KERNEL_GLOBAL_POOL", "LStorage");
                } catch (e) {
                    // 忽略错误
                }
            }
            
            if (!LStorageRef && typeof LStorage !== 'undefined') {
                LStorageRef = LStorage;
            }
            
            // 如果 LStorage 已初始化，尝试同步读取
            if (LStorageRef && LStorageRef._initialized && LStorageRef._storageData) {
                const position = LStorageRef._storageData.system?.taskbarPosition;
                if (position && ['top', 'bottom', 'left', 'right'].includes(position)) {
                    TaskbarManager._taskbarPosition = position;
                    KernelLogger.info("TaskbarManager", `同步加载任务栏位置成功: ${position}`);
                    return true;
                }
            }
            
            // 如果无法同步加载，使用默认位置
            if (!TaskbarManager._taskbarPosition) {
                TaskbarManager._taskbarPosition = 'bottom';
            }
            return false;
        } catch (error) {
            KernelLogger.debug("TaskbarManager", `同步加载任务栏位置失败: ${error.message}`);
            // 使用默认位置
            if (!TaskbarManager._taskbarPosition) {
                TaskbarManager._taskbarPosition = 'bottom';
            }
            return false;
        }
    }
    
    /**
     * 异步加载任务栏位置设置
     * @returns {Promise<void>}
     */
    static async _loadTaskbarPosition() {
        // 防止重复加载
        if (TaskbarManager._loadingPosition) {
            KernelLogger.debug("TaskbarManager", "任务栏位置正在加载中，跳过重复调用");
            return;
        }
        
        TaskbarManager._loadingPosition = true;
        
        try {
            // 获取 LStorage
            let LStorageRef = null;
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    LStorageRef = POOL.__GET__("KERNEL_GLOBAL_POOL", "LStorage");
                } catch (e) {
                    KernelLogger.debug("TaskbarManager", `无法从POOL获取LStorage: ${e.message}`);
                }
            }
            
            if (!LStorageRef && typeof LStorage !== 'undefined') {
                LStorageRef = LStorage;
            }
            
            if (LStorageRef) {
                // 确保 LStorage 已初始化（等待初始化完成）
                if (!LStorageRef._initialized) {
                    await LStorageRef.init();
                }
                
                // 等待一小段时间确保数据已加载
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // 读取任务栏位置
                const position = await LStorageRef.getSystemStorage('taskbarPosition');
                KernelLogger.debug("TaskbarManager", `从存储读取任务栏位置: ${position}`);
                
                if (position && ['top', 'bottom', 'left', 'right'].includes(position)) {
                    TaskbarManager._taskbarPosition = position;
                    KernelLogger.info("TaskbarManager", `加载任务栏位置成功: ${position}`);
                } else {
                    // 默认位置为底部
                    TaskbarManager._taskbarPosition = 'bottom';
                    KernelLogger.debug("TaskbarManager", "使用默认任务栏位置: bottom");
                }
            } else {
                // LStorage 不可用，使用默认位置
                TaskbarManager._taskbarPosition = 'bottom';
                KernelLogger.warn("TaskbarManager", "LStorage 不可用，使用默认任务栏位置");
            }
        } catch (error) {
            KernelLogger.error("TaskbarManager", `加载任务栏位置失败: ${error.message}`, error);
            TaskbarManager._taskbarPosition = 'bottom';
        } finally {
            TaskbarManager._loadingPosition = false;
        }
    }
    
    /**
     * 保存任务栏位置设置
     * @param {string} position 位置（'top', 'bottom', 'left', 'right'）
     * @returns {Promise<void>}
     */
    static async _saveTaskbarPosition(position) {
        try {
            // 获取 LStorage
            let LStorageRef = null;
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    LStorageRef = POOL.__GET__("KERNEL_GLOBAL_POOL", "LStorage");
                } catch (e) {
                    KernelLogger.debug("TaskbarManager", `无法从POOL获取LStorage: ${e.message}`);
                }
            }
            
            if (!LStorageRef && typeof LStorage !== 'undefined') {
                LStorageRef = LStorage;
            }
            
            if (LStorageRef) {
                // 确保 LStorage 已初始化
                if (!LStorageRef._initialized) {
                    await LStorageRef.init();
                }
                
                // 保存任务栏位置
                const success = await LStorageRef.setSystemStorage('taskbarPosition', position);
                if (success) {
                    KernelLogger.info("TaskbarManager", `保存任务栏位置成功: ${position}`);
                } else {
                    KernelLogger.warn("TaskbarManager", `保存任务栏位置失败: ${position}`);
                }
            } else {
                KernelLogger.warn("TaskbarManager", "LStorage 不可用，无法保存任务栏位置");
            }
        } catch (error) {
            KernelLogger.error("TaskbarManager", `保存任务栏位置失败: ${error.message}`, error);
        }
    }
    
    /**
     * 应用任务栏位置
     * @param {HTMLElement} taskbar 任务栏元素
     */
    static _applyTaskbarPosition(taskbar) {
        if (!taskbar) {
            return;
        }
        
        const position = TaskbarManager._taskbarPosition || 'bottom';
        
        // 重置所有位置样式和类名
        taskbar.style.top = '';
        taskbar.style.bottom = '';
        taskbar.style.left = '';
        taskbar.style.right = '';
        taskbar.style.width = '';
        taskbar.style.height = '';
        taskbar.style.flexDirection = '';
        taskbar.style.borderTop = '';
        taskbar.style.borderBottom = '';
        taskbar.style.borderLeft = '';
        taskbar.style.borderRight = '';
        
        // 移除所有位置类名
        taskbar.classList.remove('taskbar-top', 'taskbar-bottom', 'taskbar-left', 'taskbar-right');
        // 添加当前位置类名
        taskbar.classList.add(`taskbar-${position}`);
        
        switch (position) {
            case 'top':
                taskbar.style.top = '0';
                taskbar.style.left = '0';
                taskbar.style.right = '0';
                taskbar.style.width = '100%';
                taskbar.style.height = '60px';
                taskbar.style.flexDirection = 'row';
                taskbar.style.borderTop = 'none';
                taskbar.style.borderBottom = '1px solid rgba(139, 92, 246, 0.3)';
                taskbar.style.borderLeft = 'none';
                taskbar.style.borderRight = 'none';
                break;
            case 'bottom':
                taskbar.style.bottom = '0';
                taskbar.style.left = '0';
                taskbar.style.right = '0';
                taskbar.style.width = '100%';
                taskbar.style.height = '60px';
                taskbar.style.flexDirection = 'row';
                taskbar.style.borderTop = '1px solid rgba(139, 92, 246, 0.3)';
                taskbar.style.borderBottom = 'none';
                taskbar.style.borderLeft = 'none';
                taskbar.style.borderRight = 'none';
                break;
            case 'left':
                taskbar.style.top = '0';
                taskbar.style.bottom = '0';
                taskbar.style.left = '0';
                taskbar.style.width = '60px';
                taskbar.style.height = '100%';
                taskbar.style.flexDirection = 'column';
                taskbar.style.borderTop = 'none';
                taskbar.style.borderBottom = 'none';
                taskbar.style.borderRight = '1px solid rgba(139, 92, 246, 0.3)';
                taskbar.style.borderLeft = 'none';
                break;
            case 'right':
                taskbar.style.top = '0';
                taskbar.style.bottom = '0';
                taskbar.style.left = 'auto';
                taskbar.style.right = '0';
                taskbar.style.width = '60px';
                taskbar.style.height = '100%';
                taskbar.style.flexDirection = 'column';
                taskbar.style.borderTop = 'none';
                taskbar.style.borderBottom = 'none';
                taskbar.style.borderLeft = '1px solid rgba(139, 92, 246, 0.3)';
                taskbar.style.borderRight = 'none';
                break;
        }
        
        KernelLogger.debug("TaskbarManager", `应用任务栏位置: ${position}`);
    }
    
    /**
     * 设置任务栏位置
     * @param {string} position 位置（'top', 'bottom', 'left', 'right'）
     * @returns {Promise<void>}
     */
    static async setTaskbarPosition(position) {
        if (!['top', 'bottom', 'left', 'right'].includes(position)) {
            KernelLogger.warn("TaskbarManager", `无效的任务栏位置: ${position}`);
            return;
        }
        
        TaskbarManager._taskbarPosition = position;
        
        // 保存到本地存储
        await TaskbarManager._saveTaskbarPosition(position);
        
        // 应用位置
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            TaskbarManager._applyTaskbarPosition(taskbar);
            
            // 更新任务栏布局（如果是左右位置，需要调整容器方向）
            TaskbarManager._updateTaskbarLayout(taskbar, position);
            
            // 重新渲染任务栏以应用新的样式（特别是时间显示的样式）
            TaskbarManager._renderTaskbar(taskbar).catch(e => {
                KernelLogger.error("TaskbarManager", `切换位置后重新渲染任务栏失败: ${e.message}`, e);
            });
        }
        
        KernelLogger.info("TaskbarManager", `任务栏位置已切换为: ${position}`);
    }
    
    /**
     * 更新任务栏布局（根据位置调整容器方向）
     * @param {HTMLElement} taskbar 任务栏元素
     * @param {string} position 位置
     */
    static _updateTaskbarLayout(taskbar, position) {
        const leftContainer = taskbar.querySelector('.taskbar-left-container');
        const rightContainer = taskbar.querySelector('.taskbar-right-container');
        
        if (!leftContainer || !rightContainer) {
            return;
        }
        
        // 根据位置调整容器样式
        if (position === 'left' || position === 'right') {
            // 垂直布局
            leftContainer.style.flexDirection = 'column';
            leftContainer.style.width = '100%';
            leftContainer.style.height = 'auto';
            leftContainer.style.marginLeft = '0';
            
            rightContainer.style.flexDirection = 'column';
            rightContainer.style.width = '100%';
            rightContainer.style.height = 'auto';
            rightContainer.style.marginLeft = '0';
            rightContainer.style.marginTop = 'auto';
        } else {
            // 水平布局
            leftContainer.style.flexDirection = 'row';
            leftContainer.style.width = 'auto';
            leftContainer.style.height = 'auto';
            leftContainer.style.marginLeft = '0';
            
            rightContainer.style.flexDirection = 'row';
            rightContainer.style.width = 'auto';
            rightContainer.style.height = 'auto';
            rightContainer.style.marginLeft = 'auto';
            rightContainer.style.marginTop = '0';
        }
    }
    
    /**
     * 加载系统图标（根据当前风格）
     * @param {string} iconName 图标名称（如 'network', 'battery', 'power', 'minimize', 'maximize', 'close', 'restart', 'shutdown', 'app-default'）
     * @param {HTMLElement} container 容器元素
     * @param {boolean} preserveSize 是否保留原始尺寸（用于大图标）
     * @returns {Promise<void>}
     */
    static async _loadSystemIcon(iconName, container, preserveSize = false) {
        if (typeof ThemeManager === 'undefined') {
            throw new Error('ThemeManager 不可用');
        }
        
        try {
            const svgContent = await ThemeManager.getSystemIconSVG(iconName);
            if (svgContent) {
                container.innerHTML = svgContent;
                // 如果不是保留尺寸，应用风格变量
                if (!preserveSize) {
                    const svg = container.querySelector('svg');
                    if (svg) {
                        svg.style.width = 'var(--style-icon-size-medium, 24px)';
                        svg.style.height = 'var(--style-icon-size-medium, 24px)';
                    }
                }
            } else {
                throw new Error('图标内容为空');
            }
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `加载系统图标失败: ${iconName}, ${e.message}`);
            throw e;
        }
    }
    
    /**
     * 加载系统图标（带重试机制，等待ThemeManager初始化）
     * @param {string} iconName 图标名称
     * @param {HTMLElement} container 容器元素
     * @param {boolean} preserveSize 是否保留原始尺寸
     * @param {number} maxRetries 最大重试次数
     * @param {number} retryDelay 重试延迟（毫秒）
     * @returns {Promise<void>}
     */
    static async _loadSystemIconWithRetry(iconName, container, preserveSize = false, maxRetries = 50, retryDelay = 100) {
        // 首先尝试从 POOL 获取 ThemeManager（如果已注册）
        let themeManager = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                themeManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager");
            } catch (e) {
                // POOL 中没有，继续使用全局 ThemeManager
            }
        }
        
        // 如果 POOL 中没有，使用全局 ThemeManager
        if (!themeManager && typeof ThemeManager !== 'undefined') {
            themeManager = ThemeManager;
        }
        
        // 如果 ThemeManager 已初始化，直接加载
        if (themeManager && themeManager._initialized) {
            try {
                await TaskbarManager._loadSystemIcon(iconName, container, preserveSize);
                return;
            } catch (e) {
                throw e;
            }
        }
        
        // 如果 ThemeManager 存在但未初始化，尝试初始化
        if (themeManager && typeof themeManager.init === 'function' && !themeManager._initialized) {
            try {
                await themeManager.init();
                // 初始化后立即尝试加载
                await TaskbarManager._loadSystemIcon(iconName, container, preserveSize);
                return;
            } catch (e) {
                // 初始化失败，继续重试逻辑
            }
        }
        
        // 如果 ThemeManager 不存在，尝试等待 DependencyConfig 信号
        if (!themeManager && typeof DependencyConfig !== 'undefined') {
            try {
                const Dependency = new DependencyConfig();
                // 等待 ThemeManager 模块加载完成
                await Dependency.waitLoaded("../system/ui/themeManager.js", 5000); // 最多等待 5 秒
                // 重新检查 ThemeManager
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
                // 如果找到了 ThemeManager，尝试初始化
                if (themeManager && typeof themeManager.init === 'function' && !themeManager._initialized) {
                    try {
                        await themeManager.init();
                        await TaskbarManager._loadSystemIcon(iconName, container, preserveSize);
                        return;
                    } catch (e) {
                        // 初始化失败，继续重试
                    }
                }
            } catch (e) {
                // 等待失败，继续轮询
            }
        }
        
        // 轮询等待 ThemeManager 初始化（增加重试次数）
        for (let i = 0; i < maxRetries; i++) {
            // 重新检查 ThemeManager（可能刚加载完成）
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
            
            // 检查是否已初始化
            if (themeManager && themeManager._initialized) {
                try {
                    await TaskbarManager._loadSystemIcon(iconName, container, preserveSize);
                    return; // 成功加载，退出
                } catch (e) {
                    throw e;
                }
            }
            
            // 如果 ThemeManager 存在但未初始化，尝试初始化
            if (themeManager && typeof themeManager.init === 'function' && !themeManager._initialized) {
                try {
                    await themeManager.init();
                    await TaskbarManager._loadSystemIcon(iconName, container, preserveSize);
                    return;
                } catch (e) {
                    // 初始化失败，继续重试
                }
            }
            
            // 等待一段时间后重试
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
        
        // 所有重试都失败，抛出错误
        throw new Error('ThemeManager 初始化超时');
    }
    
    /**
     * 更新所有系统图标（当风格切换时调用）
     */
    static async _updateSystemIcons() {
        // 更新天气组件样式（响应主题切换）
        const weatherDisplay = document.getElementById('taskbar-weather-display');
        if (weatherDisplay) {
            try {
                TaskbarManager._updateWeatherDisplayTheme(weatherDisplay);
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `更新天气组件样式失败: ${e.message}`);
            }
        }
        
        // 更新网络图标
        const networkIcon = document.querySelector('.taskbar-network-icon');
        if (networkIcon) {
            try {
                await TaskbarManager._loadSystemIcon('network', networkIcon);
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `更新网络图标失败: ${e.message}`);
            }
        }
        
        // 更新电池图标（大图标）
        const batteryIconLarge = document.querySelector('.battery-icon-large');
        if (batteryIconLarge) {
            try {
                await TaskbarManager._loadSystemIcon('battery', batteryIconLarge, true);
                // 重新添加动态元素
                const svg = batteryIconLarge.querySelector('svg');
                if (svg) {
                    // 检查是否已有动态元素，如果没有则添加
                    if (!svg.querySelector('#battery-fill-large')) {
                        const defs = svg.querySelector('defs') || document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                        if (!svg.querySelector('defs')) {
                            svg.insertBefore(defs, svg.firstChild);
                        }
                        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
                        clipPath.setAttribute('id', 'battery-clip-large');
                        const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        clipRect.setAttribute('x', '2');
                        clipRect.setAttribute('y', '3');
                        clipRect.setAttribute('width', '16');
                        clipRect.setAttribute('height', '6');
                        clipRect.setAttribute('rx', '0.5');
                        clipPath.appendChild(clipRect);
                        defs.appendChild(clipPath);
                        
                        const fillRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        fillRect.setAttribute('id', 'battery-fill-large');
                        fillRect.setAttribute('x', '2');
                        fillRect.setAttribute('y', '3');
                        fillRect.setAttribute('width', '0');
                        fillRect.setAttribute('height', '6');
                        fillRect.setAttribute('rx', '0.5');
                        fillRect.setAttribute('fill', 'currentColor');
                        fillRect.setAttribute('opacity', '0.9');
                        fillRect.setAttribute('clip-path', 'url(#battery-clip-large)');
                        svg.appendChild(fillRect);
                        
                        const chargingCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        chargingCircle.setAttribute('id', 'battery-charging-icon-large');
                        chargingCircle.setAttribute('cx', '12');
                        chargingCircle.setAttribute('cy', '6');
                        chargingCircle.setAttribute('r', '3');
                        chargingCircle.setAttribute('fill', 'none');
                        chargingCircle.setAttribute('stroke', 'currentColor');
                        chargingCircle.setAttribute('stroke-width', '1.5');
                        chargingCircle.setAttribute('opacity', '0');
                        chargingCircle.setAttribute('stroke-dasharray', '4 2');
                        const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
                        animate.setAttribute('attributeName', 'opacity');
                        animate.setAttribute('values', '0;1;0');
                        animate.setAttribute('dur', '2s');
                        animate.setAttribute('repeatCount', 'indefinite');
                        animate.setAttribute('begin', '0s');
                        chargingCircle.appendChild(animate);
                        svg.appendChild(chargingCircle);
                    }
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `更新电池图标失败: ${e.message}`);
            }
        }
        
        // 更新电源图标
        const powerIcon = document.querySelector('.power-button-icon');
        if (powerIcon) {
            try {
                await TaskbarManager._loadSystemIcon('power', powerIcon);
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `更新电源图标失败: ${e.message}`);
            }
        }
        
        // 更新电源菜单中的图标
        const restartIcon = document.querySelector('.taskbar-power-menu-item:first-child > div');
        if (restartIcon && restartIcon.parentElement) {
            try {
                await TaskbarManager._loadSystemIcon('restart', restartIcon);
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `更新重启图标失败: ${e.message}`);
            }
        }
        
        const shutdownIcon = document.querySelector('.taskbar-power-menu-item-danger > div');
        if (shutdownIcon && shutdownIcon.parentElement) {
            try {
                await TaskbarManager._loadSystemIcon('shutdown', shutdownIcon);
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `更新关闭图标失败: ${e.message}`);
            }
        }
    }
    
    /**
     * 注册Ctrl+鼠标左键监听器（全屏多任务选择器）
     */
    static _registerCtrlMouseListener() {
        KernelLogger.info("TaskbarManager", "注册Ctrl+鼠标左键监听器（全屏多任务选择器）");
        
        if (typeof EventManager === 'undefined') {
            KernelLogger.warn("TaskbarManager", "EventManager 不可用，无法注册 Ctrl+鼠标左键监听");
            return;
        }
        
        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
        
        // 定义鼠标事件处理程序
        const mouseHandler = (e, eventContext) => {
            // 检查是否是 Ctrl + 鼠标左键
            if (e.ctrlKey && e.button === 0 && !TaskbarManager._taskSwitcherActive) {
                KernelLogger.debug("TaskbarManager", `检测到Ctrl+鼠标左键，目标: ${e.target?.tagName || 'unknown'}`);
                
                // 检查是否在输入框中
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                )) {
                    KernelLogger.debug("TaskbarManager", "在输入框中，忽略");
                    return;
                }
                
                // 检查是否点击在窗口标题栏等特殊区域（避免与窗口拖动冲突）
                const target = e.target;
                if (target && (
                    target.closest('.zos-window-title-bar') ||
                    target.closest('.zos-window-controls') ||
                    target.closest('.zos-window-titlebar') ||
                    target.closest('.window-resizer') ||
                    target.closest('.zos-window-resizer') ||
                    target.closest('.taskbar') ||
                    target.closest('#task-switcher-container')
                )) {
                    KernelLogger.debug("TaskbarManager", "点击在特殊区域，忽略");
                    return;
                }
                
                // 使用 eventContext 阻止事件传播（如果可用）
                if (eventContext) {
                    eventContext.preventDefault();
                    eventContext.stopImmediatePropagation();
                } else {
                e.preventDefault();
                e.stopPropagation();
                    e.stopImmediatePropagation();
                }
                
                KernelLogger.info("TaskbarManager", "触发全屏多任务选择器");
                TaskbarManager._showTaskSwitcher();
                
                return 'stopImmediate'; // 立即停止事件传播
            }
            // 如果不是 Ctrl+鼠标左键，不阻止事件传播，让其他处理程序继续处理
        };
        
        // 监听鼠标左键点击（当Ctrl键按下时）
        // 直接使用事件对象的 ctrlKey 属性，更可靠
        // 使用捕获阶段并设置更高的优先级（在EventManager之前处理）
        EventManager.registerEventHandler(exploitPid, 'mousedown', mouseHandler, {
            priority: 5,  // 高优先级，在窗口拖动之前处理
            useCapture: true
        });
        
        // 保存处理器引用以便调试
        TaskbarManager._ctrlMouseHandler = mouseHandler;
        
        KernelLogger.info("TaskbarManager", "Ctrl+鼠标左键监听器注册完成");
    }
    
    /**
     * 显示全屏多任务选择器
     */
    static _showTaskSwitcher() {
        if (TaskbarManager._taskSwitcherActive) {
            KernelLogger.debug("TaskbarManager", "多任务选择器已激活，忽略重复调用");
            return;
        }
        
        // 先检查是否有有效窗口，如果没有窗口，直接返回，不执行关闭操作
        let allWindows = typeof GUIManager !== 'undefined' ? GUIManager.getAllWindows() : [];
        
        // 过滤无效窗口：只保留仍在DOM中且进程仍在运行的窗口
        const validWindows = allWindows.filter(windowInfo => {
            // 检查窗口元素是否有效且仍在DOM中
            if (!windowInfo.window || !windowInfo.window.parentElement || !document.body.contains(windowInfo.window)) {
                KernelLogger.debug("TaskbarManager", `窗口 ${windowInfo.windowId} 已从DOM中移除，跳过`);
                return false;
            }
            
            // 检查进程是否仍在运行
            if (typeof ProcessManager !== 'undefined' && windowInfo.pid) {
                const processInfo = ProcessManager.getProcessInfo(windowInfo.pid);
                if (!processInfo || processInfo.status !== 'running') {
                    KernelLogger.debug("TaskbarManager", `窗口 ${windowInfo.windowId} 的进程 ${windowInfo.pid} 已退出，跳过`);
                    return false;
                }
            }
            
            return true;
        });
        
        KernelLogger.debug("TaskbarManager", `显示多任务选择器，找到 ${allWindows.length} 个窗口，其中 ${validWindows.length} 个有效`);
        
        // 如果没有有效窗口，直接返回，不执行任何关闭操作
        if (validWindows.length === 0) {
            KernelLogger.warn("TaskbarManager", "没有运行中的窗口，无法显示多任务选择器");
            return;
        }
        
        // 有窗口时才执行关闭操作
        // 强制关闭开始菜单和其他任务栏弹窗
        TaskbarManager._closeAllTaskbarPopups();
        
        // 额外确保开始菜单被关闭（直接检查并关闭，使用更强制的方式）
        const appMenu = document.getElementById('taskbar-app-menu');
        if (appMenu) {
            KernelLogger.debug("TaskbarManager", "检测到开始菜单，强制关闭（多任务选择器打开）");
            
            // 设置关闭标志，防止被重新打开
            appMenu._isClosing = true;
            appMenu._forceClosed = true; // 添加强制关闭标志
            
            // 立即停止动画并清理
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.stopAnimation(appMenu);
                AnimateManager.removeAnimationClasses(appMenu);
            }
            
            // 清除隐藏定时器
            if (appMenu._hideTimeout) {
                clearTimeout(appMenu._hideTimeout);
                appMenu._hideTimeout = null;
            }
            
            // 强制移除所有可能显示菜单的类和样式
            appMenu.classList.remove('visible');
            appMenu.classList.remove('show');
            appMenu.classList.remove('expanded');
            
            // 强制设置隐藏样式（使用 !important 级别的内联样式）
            appMenu.style.setProperty('display', 'none', 'important');
            appMenu.style.setProperty('opacity', '0', 'important');
            appMenu.style.setProperty('visibility', 'hidden', 'important');
            appMenu.style.setProperty('transform', 'scale(0.95) translateY(-10px)', 'important');
            appMenu.style.setProperty('pointer-events', 'none', 'important');
            appMenu.style.setProperty('z-index', '-1', 'important');
            
            // 清理可能残留的样式属性
            appMenu.style.transform = '';
            appMenu.style.scale = '';
            appMenu.style.translateX = '';
            appMenu.style.translateY = '';
            
            // 调用关闭方法（用于清理事件监听器等）
            TaskbarManager._hideAppMenu(appMenu, null, true);
            
            KernelLogger.debug("TaskbarManager", "开始菜单已强制关闭");
        }
        
        TaskbarManager._taskSwitcherActive = true;
        
        // 创建全屏容器
        const container = document.createElement('div');
        container.id = 'task-switcher-container';
        container.className = 'task-switcher-container';
        // 应用风格系统中的多任务选择器样式
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        
        let background = 'rgba(0, 0, 0, 0.85)';
        let backdropFilter = 'blur(20px)';
        
        if (themeManager) {
            try {
                const currentStyle = themeManager.getCurrentStyle();
                if (currentStyle && currentStyle.styles && currentStyle.styles.taskSwitcher) {
                    const taskSwitcherStyle = currentStyle.styles.taskSwitcher;
                    background = taskSwitcherStyle.background || background;
                    backdropFilter = taskSwitcherStyle.backdropFilter || backdropFilter;
                }
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `应用风格到多任务选择器失败: ${e.message}`);
            }
        }
        
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: ${background};
            backdrop-filter: ${backdropFilter};
            -webkit-backdrop-filter: ${backdropFilter};
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 20px;
            padding: 40px;
            box-sizing: border-box;
            animation: taskSwitcherFadeIn 0.3s ease-out;
        `;
        
        // 创建标题
        const title = document.createElement('div');
        title.className = 'task-switcher-title';
        title.textContent = '选择任务';
        title.style.cssText = `
            font-size: 24px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
            margin-bottom: 20px;
        `;
        container.appendChild(title);
        
        // 创建任务列表容器
        const tasksContainer = document.createElement('div');
        tasksContainer.className = 'task-switcher-tasks';
        tasksContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
            width: 100%;
            max-width: 1200px;
            max-height: calc(100vh - 200px);
            overflow-y: auto;
            padding: 20px;
            box-sizing: border-box;
        `;
        
        // 按程序名称分组窗口，以便更好地处理多开程序
        const windowsByProgram = new Map();
        validWindows.forEach(windowInfo => {
            const processInfo = typeof ProcessManager !== 'undefined' && windowInfo.pid ? 
                ProcessManager.getProcessInfo(windowInfo.pid) : null;
            const programName = processInfo?.programName || windowInfo.programName || '未知程序';
            
            if (!windowsByProgram.has(programName)) {
                windowsByProgram.set(programName, []);
            }
            windowsByProgram.get(programName).push(windowInfo);
        });
        
        // 创建任务项（按程序分组，同一程序的多个窗口显示在一起）
        TaskbarManager._taskSwitcherItems = [];
        let globalIndex = 0;
        
        // 按程序名称排序，确保顺序一致
        const sortedProgramNames = Array.from(windowsByProgram.keys()).sort();
        
        sortedProgramNames.forEach(programName => {
            const windows = windowsByProgram.get(programName);
            
            // 如果同一程序有多个窗口，为每个窗口添加标识
            windows.forEach((windowInfo, windowIndex) => {
                // 为窗口信息添加程序名称和窗口索引
                windowInfo._programName = programName;
                windowInfo._windowIndex = windowIndex;
                windowInfo._totalWindows = windows.length;
                
                const taskItem = TaskbarManager._createTaskSwitcherItem(windowInfo, globalIndex);
                tasksContainer.appendChild(taskItem);
                TaskbarManager._taskSwitcherItems.push(taskItem);
                globalIndex++;
            });
        });
        
        container.appendChild(tasksContainer);
        
        // 创建提示文本
        const hint = document.createElement('div');
        hint.className = 'task-switcher-hint';
        hint.textContent = '使用鼠标滚轮选择，左键确认，Ctrl+E关闭选中程序，ESC退出';
        hint.style.cssText = `
            font-size: 14px;
            color: rgba(255, 255, 255, 0.6);
            margin-top: 20px;
        `;
        container.appendChild(hint);
        
        document.body.appendChild(container);
        TaskbarManager._taskSwitcherContainer = container;
        
        // 初始化选中索引
        TaskbarManager._selectedTaskIndex = 0;
        if (TaskbarManager._taskSwitcherItems.length > 0) {
            TaskbarManager._taskSwitcherItems[0].classList.add('selected');
        }
        
        // 监听滚轮事件（优化流畅度，降低灵敏度）
        let lastWheelTime = 0;
        let wheelDeltaAccumulator = 0; // 累积滚轮增量
        const WHEEL_THROTTLE_MS = 32; // 降低灵敏度：从16ms增加到32ms（降低一半）
        const WHEEL_DELTA_THRESHOLD = 50; // 需要累积的滚轮增量阈值（降低灵敏度）
        
        const wheelHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (TaskbarManager._taskSwitcherItems.length === 0) {
                return;
            }
            
            const now = Date.now();
            const timeSinceLastWheel = now - lastWheelTime;
            
            // 累积滚轮增量（降低灵敏度）
            wheelDeltaAccumulator += Math.abs(e.deltaY);
            
            // 节流处理，确保流畅度
            if (timeSinceLastWheel < WHEEL_THROTTLE_MS) {
                return;
            }
            
            // 只有当累积的增量超过阈值时才切换选择（降低灵敏度）
            if (wheelDeltaAccumulator < WHEEL_DELTA_THRESHOLD) {
                return;
            }
            
            lastWheelTime = now;
            wheelDeltaAccumulator = 0; // 重置累积器
            
            // 使用 requestAnimationFrame 确保动画流畅
            if (container._wheelTimeout) {
                cancelAnimationFrame(container._wheelTimeout);
            }
            
            container._wheelTimeout = requestAnimationFrame(() => {
                // 移除当前选中状态
                TaskbarManager._taskSwitcherItems[TaskbarManager._selectedTaskIndex]?.classList.remove('selected');
                
                // 计算滚动方向
                const scrollDirection = e.deltaY > 0 ? 1 : -1;
                
                // 计算新的选中索引
                if (scrollDirection > 0) {
                    // 向下滚动
                    TaskbarManager._selectedTaskIndex = (TaskbarManager._selectedTaskIndex + 1) % TaskbarManager._taskSwitcherItems.length;
                } else {
                    // 向上滚动
                    TaskbarManager._selectedTaskIndex = (TaskbarManager._selectedTaskIndex - 1 + TaskbarManager._taskSwitcherItems.length) % TaskbarManager._taskSwitcherItems.length;
                }
                
                // 添加新的选中状态
                const selectedItem = TaskbarManager._taskSwitcherItems[TaskbarManager._selectedTaskIndex];
                if (selectedItem) {
                    selectedItem.classList.add('selected');
                    
                    // 使用更平滑的滚动方式
                    selectedItem.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'nearest'
                    });
                }
                
                container._wheelTimeout = null;
            });
        };
        
        container.addEventListener('wheel', wheelHandler, { passive: false });
        
        // 保存处理器引用以便清理
        container._wheelHandler = wheelHandler;
        
        // 监听鼠标左键点击（确认选择）
        const clickHandler = (e) => {
            if (e.button === 0 && TaskbarManager._selectedTaskIndex >= 0) {
                e.preventDefault();
                e.stopPropagation();
                TaskbarManager._confirmTaskSelection();
            }
        };
        
        container.addEventListener('mousedown', clickHandler, { passive: false });
        
        // 监听ESC键退出
        const escHandler = (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault();
                e.stopPropagation();
                TaskbarManager._hideTaskSwitcher();
            }
        };
        
        // 监听Ctrl+E关闭当前选中的程序
        const ctrlEHandler = (e) => {
            if (e.ctrlKey && (e.key === 'e' || e.key === 'E') && !e.shiftKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                
                // 检查是否有选中的任务项
                if (TaskbarManager._selectedTaskIndex < 0 || 
                    TaskbarManager._selectedTaskIndex >= TaskbarManager._taskSwitcherItems.length) {
                    return;
                }
                
                const selectedItem = TaskbarManager._taskSwitcherItems[TaskbarManager._selectedTaskIndex];
                const windowId = selectedItem.dataset.windowId;
                
                if (!windowId || typeof GUIManager === 'undefined') {
                    return;
                }
                
                // 获取窗口信息
                const windowInfo = GUIManager.getWindowInfo(windowId);
                if (!windowInfo) {
                    return;
                }
                
                // 检查是否是Exploit程序（PID 10000），不应该关闭
                if (windowInfo.pid === ProcessManager.EXPLOIT_PID) {
                    KernelLogger.debug("TaskbarManager", "不能关闭Exploit程序");
                    return;
                }
                
                // 关闭程序
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                    try {
                        const pidToKill = windowInfo.pid;
                        const programName = windowInfo.programName || (typeof ProcessManager !== 'undefined' ? 
                            (ProcessManager.getProcessInfo(pidToKill)?.programName || '') : '');
                        
                        ProcessManager.killProgram(pidToKill);
                        KernelLogger.info("TaskbarManager", `在多任务选择器中关闭程序 (WindowID: ${windowId}, PID: ${pidToKill}, Program: ${programName})`);
                        
                        // 从任务项列表中移除已关闭的项
                        const removedIndex = TaskbarManager._selectedTaskIndex;
                        selectedItem.remove();
                        TaskbarManager._taskSwitcherItems.splice(removedIndex, 1);
                        
                        // 更新任务栏图标（延迟更新，确保进程已完全关闭）
                        setTimeout(() => {
                            if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.update === 'function') {
                                TaskbarManager.update();
                            }
                        }, 100);
                        
                        // 检查是否还有其他窗口需要从选择器中移除（同一PID的所有窗口）
                        if (typeof GUIManager !== 'undefined') {
                            const remainingWindows = GUIManager.getWindowsByPid(pidToKill);
                            if (remainingWindows.length === 0) {
                                // 该PID的所有窗口都已关闭，从validWindows中移除
                                // 重新验证所有窗口，移除无效的
                                const tasksContainer = TaskbarManager._taskSwitcherContainer?.querySelector('.task-switcher-tasks');
                                if (tasksContainer) {
                                    // 重新获取所有有效窗口
                                    let allWindows = GUIManager.getAllWindows();
                                    const stillValidWindows = allWindows.filter(win => {
                                        if (!win.window || !win.window.parentElement || !document.body.contains(win.window)) {
                                            return false;
                                        }
                                        if (typeof ProcessManager !== 'undefined' && win.pid) {
                                            const processInfo = ProcessManager.getProcessInfo(win.pid);
                                            if (!processInfo || processInfo.status !== 'running') {
                                                return false;
                                            }
                                        }
                                        return true;
                                    });
                                    
                                    // 如果有效窗口数量发生变化，重新渲染选择器
                                    if (stillValidWindows.length !== TaskbarManager._taskSwitcherItems.length) {
                                        // 移除所有现有项
                                        TaskbarManager._taskSwitcherItems.forEach(item => item.remove());
                                        TaskbarManager._taskSwitcherItems = [];
                                        
                                        // 重新创建任务项
                                        stillValidWindows.forEach((winInfo, idx) => {
                                            const taskItem = TaskbarManager._createTaskSwitcherItem(winInfo, idx);
                                            tasksContainer.appendChild(taskItem);
                                            TaskbarManager._taskSwitcherItems.push(taskItem);
                                        });
                                        
                                        // 重置选中索引
                                        if (TaskbarManager._taskSwitcherItems.length > 0) {
                                            TaskbarManager._selectedTaskIndex = Math.min(TaskbarManager._selectedTaskIndex, TaskbarManager._taskSwitcherItems.length - 1);
                                            if (TaskbarManager._selectedTaskIndex < 0) {
                                                TaskbarManager._selectedTaskIndex = 0;
                                            }
                                            TaskbarManager._taskSwitcherItems.forEach((item, idx) => {
                                                if (idx === TaskbarManager._selectedTaskIndex) {
                                                    item.classList.add('selected');
                                                } else {
                                                    item.classList.remove('selected');
                                                }
                                            });
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 更新选中索引
                        if (TaskbarManager._taskSwitcherItems.length === 0) {
                            // 如果没有任务项了，关闭选择器
                            TaskbarManager._hideTaskSwitcher();
                        } else {
                            // 调整选中索引（如果删除的是最后一个，选择前一个）
                            if (TaskbarManager._selectedTaskIndex >= TaskbarManager._taskSwitcherItems.length) {
                                TaskbarManager._selectedTaskIndex = TaskbarManager._taskSwitcherItems.length - 1;
                            }
                            
                            // 更新选中状态
                            TaskbarManager._taskSwitcherItems.forEach((item, index) => {
                                if (index === TaskbarManager._selectedTaskIndex) {
                                    item.classList.add('selected');
                                } else {
                                    item.classList.remove('selected');
                                }
                            });
                            
                            // 滚动到新的选中项
                            const newSelectedItem = TaskbarManager._taskSwitcherItems[TaskbarManager._selectedTaskIndex];
                            if (newSelectedItem) {
                                newSelectedItem.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'nearest',
                                    inline: 'nearest'
                                });
                            }
                        }
                    } catch (error) {
                        KernelLogger.error("TaskbarManager", `在多任务选择器中关闭程序失败: ${error.message}`, error);
                    }
                } else {
                    KernelLogger.warn("TaskbarManager", "ProcessManager 不可用，无法关闭程序");
                }
            }
        };
        
        document.addEventListener('keydown', escHandler, { passive: false, capture: true });
        document.addEventListener('keydown', ctrlEHandler, { passive: false, capture: true });
        
        // 保存事件处理器引用，以便后续清理
        container._wheelHandler = wheelHandler;
        container._clickHandler = clickHandler;
        container._escHandler = escHandler;
        container._ctrlEHandler = ctrlEHandler;
    }
    
    /**
     * 创建任务选择器项
     */
    static _createTaskSwitcherItem(windowInfo, index) {
        const item = document.createElement('div');
        item.className = 'task-switcher-item';
        item.dataset.windowId = windowInfo.windowId;
        item.dataset.index = index;
        
        // 获取程序图标
        let iconUrl = windowInfo.icon || '';
        if (!iconUrl && typeof ApplicationAssetManager !== 'undefined') {
            const processInfo = typeof ProcessManager !== 'undefined' ? ProcessManager.getProcessInfo(windowInfo.pid) : null;
            if (processInfo && processInfo.programName) {
                const virtualIconPath = ApplicationAssetManager.getIcon(processInfo.programName) || '';
                // 转换虚拟路径为实际 URL
                iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                    ? ProcessManager.convertVirtualPathToUrl(virtualIconPath)
                    : virtualIconPath;
            }
        } else if (iconUrl) {
            // 如果 windowInfo.icon 存在，也需要转换
            iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                ? ProcessManager.convertVirtualPathToUrl(iconUrl)
                : iconUrl;
        }
        
        // 创建图标
        const icon = document.createElement('div');
        icon.className = 'task-switcher-item-icon';
        if (iconUrl) {
            icon.style.cssText = `
                width: 64px;
                height: 64px;
                background-image: url(${iconUrl});
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                margin-bottom: 12px;
            `;
        } else {
            icon.style.cssText = `
                width: 64px;
                height: 64px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
                margin-bottom: 12px;
            `;
            icon.textContent = '📱';
        }
        
        // 创建标题（显示程序名称和窗口标题，如果是多开则显示编号）
        const title = document.createElement('div');
        title.className = 'task-switcher-item-title';
        
        // 获取程序名称
        const processInfo = typeof ProcessManager !== 'undefined' && windowInfo.pid ? 
            ProcessManager.getProcessInfo(windowInfo.pid) : null;
        const programName = windowInfo._programName || processInfo?.programName || windowInfo.programName || '';
        const windowTitle = windowInfo.title || '未命名窗口';
        
        // 如果是多开程序，显示程序名称和窗口编号
        let displayTitle = windowTitle;
        if (windowInfo._totalWindows && windowInfo._totalWindows > 1) {
            // 获取程序显示名称
            let programDisplayName = programName;
            if (typeof ApplicationAssetManager !== 'undefined') {
                const programInfo = ApplicationAssetManager.getProgramInfo(programName);
                if (programInfo && programInfo.metadata && programInfo.metadata.description) {
                    programDisplayName = programInfo.metadata.description;
                }
            }
            displayTitle = `${programDisplayName} (${windowInfo._windowIndex + 1}/${windowInfo._totalWindows})`;
            if (windowTitle && windowTitle !== programDisplayName) {
                displayTitle += `\n${windowTitle}`;
            }
        } else if (programName && windowTitle !== programName) {
            // 单窗口程序，如果窗口标题与程序名不同，显示程序名
            let programDisplayName = programName;
            if (typeof ApplicationAssetManager !== 'undefined') {
                const programInfo = ApplicationAssetManager.getProgramInfo(programName);
                if (programInfo && programInfo.metadata && programInfo.metadata.description) {
                    programDisplayName = programInfo.metadata.description;
                }
            }
            displayTitle = `${programDisplayName}\n${windowTitle}`;
        }
        
        title.textContent = displayTitle;
        title.style.cssText = `
            font-size: 14px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.9);
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: pre-line;
            max-width: 180px;
            line-height: 1.4;
            max-height: 3em;
        `;
        
        // 创建状态指示
        const status = document.createElement('div');
        status.className = 'task-switcher-item-status';
        if (windowInfo.isMinimized) {
            status.textContent = '最小化';
            status.style.color = 'rgba(255, 255, 255, 0.5)';
        } else if (windowInfo.isFocused) {
            status.textContent = '当前焦点';
            status.style.color = 'rgba(108, 142, 255, 0.9)';
        } else {
            status.textContent = '运行中';
            status.style.color = 'rgba(255, 255, 255, 0.7)';
        }
        status.style.cssText += `
            font-size: 12px;
            margin-top: 4px;
            text-align: center;
        `;
        
        item.appendChild(icon);
        item.appendChild(title);
        item.appendChild(status);
        
        item.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(255, 255, 255, 0.05);
            border: 2px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            cursor: pointer;
            transition: all 0.2s ease;
            min-width: 180px;
            min-height: 180px;
            box-sizing: border-box;
        `;
        
        // 悬停效果
        item.addEventListener('mouseenter', () => {
            if (!item.classList.contains('selected')) {
                item.style.background = 'rgba(255, 255, 255, 0.08)';
                item.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }
        });
        
        item.addEventListener('mouseleave', () => {
            if (!item.classList.contains('selected')) {
                item.style.background = 'rgba(255, 255, 255, 0.05)';
                item.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }
        });
        
        return item;
    }
    
    /**
     * 确认任务选择
     */
    static _confirmTaskSelection() {
        if (TaskbarManager._selectedTaskIndex < 0 || 
            TaskbarManager._selectedTaskIndex >= TaskbarManager._taskSwitcherItems.length) {
            TaskbarManager._hideTaskSwitcher();
            return;
        }
        
        const selectedItem = TaskbarManager._taskSwitcherItems[TaskbarManager._selectedTaskIndex];
        const windowId = selectedItem.dataset.windowId;
        
        if (!windowId || typeof GUIManager === 'undefined') {
            TaskbarManager._hideTaskSwitcher();
            return;
        }
        
        // 获取窗口信息
        const windowInfo = GUIManager.getWindowInfo(windowId);
        if (!windowInfo) {
            TaskbarManager._hideTaskSwitcher();
            return;
        }
        
        // 如果窗口最小化，先恢复
        if (windowInfo.isMinimized) {
            GUIManager.restoreWindow(windowId, false);
        }
        
        // 设置窗口焦点（会自动移到最上层）
        GUIManager.focusWindow(windowId);
        
        // 隐藏选择器
        TaskbarManager._hideTaskSwitcher();
    }
    
    /**
     * 隐藏全屏多任务选择器
     */
    static _hideTaskSwitcher() {
        if (!TaskbarManager._taskSwitcherActive || !TaskbarManager._taskSwitcherContainer) {
            return;
        }
        
        TaskbarManager._taskSwitcherActive = false;
        
        // 清理滚轮节流定时器
        if (TaskbarManager._taskSwitcherContainer._wheelTimeout) {
            cancelAnimationFrame(TaskbarManager._taskSwitcherContainer._wheelTimeout);
            TaskbarManager._taskSwitcherContainer._wheelTimeout = null;
        }
        
        // 移除事件监听器
        if (TaskbarManager._taskSwitcherContainer._wheelHandler) {
            TaskbarManager._taskSwitcherContainer.removeEventListener('wheel', TaskbarManager._taskSwitcherContainer._wheelHandler);
            TaskbarManager._taskSwitcherContainer._wheelHandler = null;
        }
        if (TaskbarManager._taskSwitcherContainer._clickHandler) {
            TaskbarManager._taskSwitcherContainer.removeEventListener('mousedown', TaskbarManager._taskSwitcherContainer._clickHandler);
            TaskbarManager._taskSwitcherContainer._clickHandler = null;
        }
        if (TaskbarManager._taskSwitcherContainer._escHandler) {
            document.removeEventListener('keydown', TaskbarManager._taskSwitcherContainer._escHandler, { capture: true });
            TaskbarManager._taskSwitcherContainer._escHandler = null;
        }
        if (TaskbarManager._taskSwitcherContainer._ctrlEHandler) {
            document.removeEventListener('keydown', TaskbarManager._taskSwitcherContainer._ctrlEHandler, { capture: true });
            TaskbarManager._taskSwitcherContainer._ctrlEHandler = null;
        }
        
        // 清除开始菜单的强制关闭标志，允许重新打开
        const appMenu = document.getElementById('taskbar-app-menu');
        if (appMenu && appMenu._forceClosed) {
            appMenu._forceClosed = false;
            KernelLogger.debug("TaskbarManager", "清除开始菜单的强制关闭标志");
        }
        
        // 添加淡出动画
        TaskbarManager._taskSwitcherContainer.style.animation = 'taskSwitcherFadeOut 0.2s ease-in';
        
        // 延迟移除DOM元素
        setTimeout(() => {
            if (TaskbarManager._taskSwitcherContainer && TaskbarManager._taskSwitcherContainer.parentNode) {
                TaskbarManager._taskSwitcherContainer.parentNode.removeChild(TaskbarManager._taskSwitcherContainer);
            }
            TaskbarManager._taskSwitcherContainer = null;
            TaskbarManager._taskSwitcherItems = [];
            TaskbarManager._selectedTaskIndex = -1;
        }, 200);
    }
    
    // ========== 固定程序管理 API ==========
    
    /**
     * 固定程序到任务栏
     * @param {string} programName 程序名称
     * @returns {Promise<boolean>} 是否成功
     */
    static async pinProgram(programName) {
        if (!programName || typeof programName !== 'string') {
            throw new Error('程序名称必须是字符串');
        }
        
        try {
            // 获取当前固定程序列表
            let pinnedPrograms = [];
            if (typeof LStorage !== 'undefined' && typeof LStorage.getSystemStorage === 'function') {
                const pinned = await LStorage.getSystemStorage('taskbar.pinnedPrograms');
                if (Array.isArray(pinned)) {
                    pinnedPrograms = pinned;
                }
            }
            
            // 检查是否已固定
            if (pinnedPrograms.includes(programName)) {
                KernelLogger.debug("TaskbarManager", `程序 ${programName} 已经固定在任务栏`);
                return true;
            }
            
            // 添加到固定列表
            pinnedPrograms.push(programName);
            
            // 保存到存储
            if (typeof LStorage !== 'undefined' && typeof LStorage.setSystemStorage === 'function') {
                await LStorage.setSystemStorage('taskbar.pinnedPrograms', pinnedPrograms);
                KernelLogger.info("TaskbarManager", `程序 ${programName} 已固定到任务栏`);
                
                // 更新任务栏
                const taskbar = document.getElementById('taskbar');
                if (taskbar) {
                    await TaskbarManager._renderTaskbar(taskbar);
                }
                
                return true;
            } else {
                throw new Error('LStorage 不可用');
            }
        } catch (error) {
            KernelLogger.error("TaskbarManager", `固定程序失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 从任务栏取消固定程序
     * @param {string} programName 程序名称
     * @returns {Promise<boolean>} 是否成功
     */
    static async unpinProgram(programName) {
        if (!programName || typeof programName !== 'string') {
            throw new Error('程序名称必须是字符串');
        }
        
        try {
            // 获取当前固定程序列表
            let pinnedPrograms = [];
            if (typeof LStorage !== 'undefined' && typeof LStorage.getSystemStorage === 'function') {
                const pinned = await LStorage.getSystemStorage('taskbar.pinnedPrograms');
                if (Array.isArray(pinned)) {
                    pinnedPrograms = pinned;
                }
            }
            
            // 检查是否已固定
            const index = pinnedPrograms.indexOf(programName);
            if (index === -1) {
                KernelLogger.debug("TaskbarManager", `程序 ${programName} 未固定在任务栏`);
                return true;
            }
            
            // 从固定列表移除
            pinnedPrograms.splice(index, 1);
            
            // 保存到存储
            if (typeof LStorage !== 'undefined' && typeof LStorage.setSystemStorage === 'function') {
                await LStorage.setSystemStorage('taskbar.pinnedPrograms', pinnedPrograms);
                KernelLogger.info("TaskbarManager", `程序 ${programName} 已从任务栏取消固定`);
                
                // 更新任务栏
                const taskbar = document.getElementById('taskbar');
                if (taskbar) {
                    await TaskbarManager._renderTaskbar(taskbar);
                }
                
                return true;
            } else {
                throw new Error('LStorage 不可用');
            }
        } catch (error) {
            KernelLogger.error("TaskbarManager", `取消固定程序失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 获取所有固定在任务栏的程序列表
     * @returns {Promise<Array<string>>} 固定程序名称列表
     */
    static async getPinnedPrograms() {
        try {
            if (typeof LStorage !== 'undefined' && typeof LStorage.getSystemStorage === 'function') {
                const pinned = await LStorage.getSystemStorage('taskbar.pinnedPrograms');
                if (Array.isArray(pinned)) {
                    return pinned;
                }
            }
            return [];
        } catch (error) {
            KernelLogger.error("TaskbarManager", `获取固定程序列表失败: ${error.message}`, error);
            return [];
        }
    }
    
    /**
     * 检查程序是否固定在任务栏
     * @param {string} programName 程序名称
     * @returns {Promise<boolean>} 是否固定
     */
    static async isPinned(programName) {
        if (!programName || typeof programName !== 'string') {
            return false;
        }
        
        try {
            const pinnedPrograms = await TaskbarManager.getPinnedPrograms();
            return pinnedPrograms.includes(programName);
        } catch (error) {
            KernelLogger.error("TaskbarManager", `检查程序固定状态失败: ${error.message}`, error);
            return false;
        }
    }
    
    /**
     * 设置固定程序列表（批量操作）
     * @param {Array<string>} programNames 程序名称列表
     * @returns {Promise<boolean>} 是否成功
     */
    static async setPinnedPrograms(programNames) {
        if (!Array.isArray(programNames)) {
            throw new Error('程序名称列表必须是数组');
        }
        
        // 验证所有元素都是字符串
        for (const name of programNames) {
            if (typeof name !== 'string') {
                throw new Error('程序名称列表中的所有元素必须是字符串');
            }
        }
        
        try {
            // 去重
            const uniquePrograms = [...new Set(programNames)];
            
            // 保存到存储
            if (typeof LStorage !== 'undefined' && typeof LStorage.setSystemStorage === 'function') {
                await LStorage.setSystemStorage('taskbar.pinnedPrograms', uniquePrograms);
                KernelLogger.info("TaskbarManager", `已设置固定程序列表: ${uniquePrograms.join(', ')}`);
                
                // 更新任务栏
                const taskbar = document.getElementById('taskbar');
                if (taskbar) {
                    await TaskbarManager._renderTaskbar(taskbar);
                }
                
                return true;
            } else {
                throw new Error('LStorage 不可用');
            }
        } catch (error) {
            KernelLogger.error("TaskbarManager", `设置固定程序列表失败: ${error.message}`, error);
            throw error;
        }
    }
    
    // ========== 自定义图标管理 API ==========
    
    /**
     * 添加自定义图标到任务栏
     * @param {Object} options 图标配置
     * @param {string} options.iconId 图标唯一标识符（如果未提供，将自动生成）
     * @param {string} options.icon 图标路径或URL
     * @param {string} options.title 图标标题/工具提示
     * @param {Function} options.onClick 点击事件处理函数
     * @param {number} options.pid 关联的进程ID（用于权限检查和自动清理）
     * @param {Object} options.metadata 元数据（可选）
     * @returns {Promise<string>} 返回图标ID
     */
    static async addCustomIcon(options) {
        if (!options || typeof options !== 'object') {
            throw new Error('图标配置必须是对象');
        }
        
        const { iconId, icon, title, onClick, pid, metadata = {} } = options;
        
        // 验证必需参数
        if (!icon || typeof icon !== 'string') {
            throw new Error('图标路径或URL是必需的');
        }
        
        if (!title || typeof title !== 'string') {
            throw new Error('图标标题是必需的');
        }
        
        if (onClick && typeof onClick !== 'function') {
            throw new Error('点击事件处理函数必须是函数');
        }
        
        // 生成图标ID（如果未提供）
        const finalIconId = iconId || `custom-icon-${TaskbarManager._customIconIdCounter++}`;
        
        // 检查图标ID是否已存在
        if (TaskbarManager._customIcons.has(finalIconId)) {
            throw new Error(`图标ID已存在: ${finalIconId}`);
        }
        
        // 创建图标数据
        const iconData = {
            iconId: finalIconId,
            icon: icon,
            title: title,
            onClick: onClick || null,
            pid: pid || null,
            metadata: metadata,
            createdAt: Date.now()
        };
        
        // 保存到内存
        TaskbarManager._customIcons.set(finalIconId, iconData);
        
        // 保存到存储（持久化）
        try {
            await TaskbarManager._saveCustomIcons();
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `保存自定义图标失败: ${e.message}`);
        }
        
        // 重新渲染任务栏
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            await TaskbarManager._renderTaskbar(taskbar);
        }
        
        KernelLogger.info("TaskbarManager", `已添加自定义图标到任务栏: ${finalIconId} (${title})`);
        
        return finalIconId;
    }
    
    /**
     * 移除自定义图标
     * @param {string} iconId 图标ID
     * @returns {Promise<boolean>} 是否成功
     */
    static async removeCustomIcon(iconId) {
        if (!iconId || typeof iconId !== 'string') {
            throw new Error('图标ID必须是字符串');
        }
        
        if (!TaskbarManager._customIcons.has(iconId)) {
            KernelLogger.debug("TaskbarManager", `图标不存在: ${iconId}`);
            return false;
        }
        
        // 从内存中移除
        TaskbarManager._customIcons.delete(iconId);
        
        // 保存到存储
        try {
            await TaskbarManager._saveCustomIcons();
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `保存自定义图标失败: ${e.message}`);
        }
        
        // 重新渲染任务栏
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            await TaskbarManager._renderTaskbar(taskbar);
        }
        
        KernelLogger.info("TaskbarManager", `已移除自定义图标: ${iconId}`);
        
        return true;
    }
    
    /**
     * 更新自定义图标
     * @param {string} iconId 图标ID
     * @param {Object} updates 更新内容
     * @returns {Promise<boolean>} 是否成功
     */
    static async updateCustomIcon(iconId, updates) {
        if (!iconId || typeof iconId !== 'string') {
            throw new Error('图标ID必须是字符串');
        }
        
        if (!updates || typeof updates !== 'object') {
            throw new Error('更新内容必须是对象');
        }
        
        const iconData = TaskbarManager._customIcons.get(iconId);
        if (!iconData) {
            throw new Error(`图标不存在: ${iconId}`);
        }
        
        // 更新图标数据
        if (updates.icon !== undefined) {
            if (typeof updates.icon !== 'string') {
                throw new Error('图标路径必须是字符串');
            }
            iconData.icon = updates.icon;
        }
        
        if (updates.title !== undefined) {
            if (typeof updates.title !== 'string') {
                throw new Error('图标标题必须是字符串');
            }
            iconData.title = updates.title;
        }
        
        if (updates.onClick !== undefined) {
            if (updates.onClick !== null && typeof updates.onClick !== 'function') {
                throw new Error('点击事件处理函数必须是函数或null');
            }
            iconData.onClick = updates.onClick;
        }
        
        if (updates.metadata !== undefined) {
            if (typeof updates.metadata !== 'object') {
                throw new Error('元数据必须是对象');
            }
            iconData.metadata = { ...iconData.metadata, ...updates.metadata };
        }
        
        // 保存到存储
        try {
            await TaskbarManager._saveCustomIcons();
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `保存自定义图标失败: ${e.message}`);
        }
        
        // 重新渲染任务栏
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            await TaskbarManager._renderTaskbar(taskbar);
        }
        
        KernelLogger.info("TaskbarManager", `已更新自定义图标: ${iconId}`);
        
        return true;
    }
    
    /**
     * 获取自定义图标列表
     * @returns {Promise<Array<Object>>} 自定义图标列表
     */
    static async getCustomIcons() {
        return Array.from(TaskbarManager._customIcons.values()).map(iconData => ({
            iconId: iconData.iconId,
            icon: iconData.icon,
            title: iconData.title,
            pid: iconData.pid,
            metadata: iconData.metadata,
            createdAt: iconData.createdAt
        }));
    }
    
    /**
     * 根据PID获取自定义图标列表
     * @param {number} pid 进程ID
     * @returns {Promise<Array<Object>>} 自定义图标列表
     */
    static async getCustomIconsByPid(pid) {
        if (typeof pid !== 'number') {
            throw new Error('进程ID必须是数字');
        }
        
        return Array.from(TaskbarManager._customIcons.values())
            .filter(iconData => iconData.pid === pid)
            .map(iconData => ({
                iconId: iconData.iconId,
                icon: iconData.icon,
                title: iconData.title,
                pid: iconData.pid,
                metadata: iconData.metadata,
                createdAt: iconData.createdAt
            }));
    }
    
    /**
     * 清理指定PID的所有自定义图标（进程退出时调用）
     * @param {number} pid 进程ID
     * @returns {Promise<number>} 清理的图标数量
     */
    static async cleanupCustomIconsByPid(pid) {
        if (typeof pid !== 'number') {
            return 0;
        }
        
        let cleanedCount = 0;
        const iconsToRemove = [];
        
        for (const [iconId, iconData] of TaskbarManager._customIcons.entries()) {
            if (iconData.pid === pid) {
                iconsToRemove.push(iconId);
            }
        }
        
        for (const iconId of iconsToRemove) {
            TaskbarManager._customIcons.delete(iconId);
            cleanedCount++;
        }
        
        if (cleanedCount > 0) {
            // 保存到存储
            try {
                await TaskbarManager._saveCustomIcons();
            } catch (e) {
                KernelLogger.warn("TaskbarManager", `保存自定义图标失败: ${e.message}`);
            }
            
            // 重新渲染任务栏
            const taskbar = document.getElementById('taskbar');
            if (taskbar) {
                await TaskbarManager._renderTaskbar(taskbar);
            }
            
            KernelLogger.info("TaskbarManager", `已清理进程 ${pid} 的 ${cleanedCount} 个自定义图标`);
        }
        
        return cleanedCount;
    }
    
    /**
     * 保存自定义图标到存储
     * @private
     */
    static async _saveCustomIcons() {
        if (typeof LStorage === 'undefined' || typeof LStorage.setSystemStorage !== 'function') {
            return;
        }
        
        // 转换为可序列化的格式（移除函数）
        const serializableIcons = Array.from(TaskbarManager._customIcons.values()).map(iconData => ({
            iconId: iconData.iconId,
            icon: iconData.icon,
            title: iconData.title,
            pid: iconData.pid,
            metadata: iconData.metadata,
            createdAt: iconData.createdAt
            // 注意：onClick 函数不会被保存，需要在加载时重新注册
        }));
        
        await LStorage.setSystemStorage('taskbar.customIcons', serializableIcons);
    }
    
    /**
     * 从存储加载自定义图标
     * @private
     */
    static async _loadCustomIcons() {
        if (typeof LStorage === 'undefined' || typeof LStorage.getSystemStorage !== 'function') {
            return;
        }
        
        try {
            const savedIcons = await LStorage.getSystemStorage('taskbar.customIcons');
            if (!Array.isArray(savedIcons)) {
                return;
            }
            
            for (const savedIcon of savedIcons) {
                // 验证数据格式
                if (!savedIcon.iconId || !savedIcon.icon || !savedIcon.title) {
                    KernelLogger.warn("TaskbarManager", `跳过无效的自定义图标数据: ${JSON.stringify(savedIcon)}`);
                    continue;
                }
                
                // 恢复图标数据（onClick 需要在程序重新注册）
                TaskbarManager._customIcons.set(savedIcon.iconId, {
                    iconId: savedIcon.iconId,
                    icon: savedIcon.icon,
                    title: savedIcon.title,
                    onClick: null, // 函数无法序列化，需要程序重新注册
                    pid: savedIcon.pid || null,
                    metadata: savedIcon.metadata || {},
                    createdAt: savedIcon.createdAt || Date.now()
                });
            }
            
            KernelLogger.debug("TaskbarManager", `已加载 ${TaskbarManager._customIcons.size} 个自定义图标`);
        } catch (e) {
            KernelLogger.warn("TaskbarManager", `加载自定义图标失败: ${e.message}`);
        }
    }
    
    /**
     * 创建自定义任务栏图标元素
     * @param {Object} iconData 图标数据
     * @returns {HTMLElement} 图标元素
     * @private
     */
    static _createCustomTaskbarIcon(iconData) {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'taskbar-icon taskbar-custom-icon';
        iconContainer.dataset.iconId = iconData.iconId;
        if (iconData.pid) {
            iconContainer.dataset.pid = iconData.pid.toString();
        }
        
        // 创建图标
        const icon = document.createElement('img');
        // 转换虚拟路径为实际 URL
        const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
            ? ProcessManager.convertVirtualPathToUrl(iconData.icon)
            : iconData.icon;
        icon.src = iconUrl;
        icon.alt = iconData.title;
        icon.className = 'taskbar-icon-image';
        icon.onerror = () => {
            // 图标加载失败，使用默认图标
            icon.style.display = 'none';
            const defaultIconContainer = document.createElement('div');
            defaultIconContainer.className = 'taskbar-icon-image';
            defaultIconContainer.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
            TaskbarManager._loadSystemIconWithRetry('app-default', defaultIconContainer).catch(e => {
                KernelLogger.warn("TaskbarManager", `加载默认图标失败: ${e.message}，使用文字图标`);
                const textIcon = document.createElement('div');
                textIcon.className = 'taskbar-icon-text';
                textIcon.textContent = iconData.title.charAt(0).toUpperCase();
                iconContainer.appendChild(textIcon);
            });
            iconContainer.appendChild(defaultIconContainer);
        };
        iconContainer.appendChild(icon);
        
        // 添加工具提示
        const tooltip = document.createElement('div');
        tooltip.className = 'taskbar-icon-tooltip';
        tooltip.textContent = iconData.title;
        iconContainer.appendChild(tooltip);
        
        // 点击事件
        if (iconData.onClick && typeof iconData.onClick === 'function') {
            iconContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                try {
                    iconData.onClick(e, iconData);
                } catch (error) {
                    KernelLogger.error("TaskbarManager", `自定义图标点击事件处理失败: ${error.message}`, error);
                }
            });
        }
        
        return iconContainer;
    }
}

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "TaskbarManager", TaskbarManager);
    } catch (e) {
        // 忽略错误
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../system/ui/taskbarManager.js");
}

// 自动初始化（当 DOM 就绪时）
// 注意：任务栏初始化由 BootLoader 在引导完成后触发，这里只作为降级方案
if (typeof document !== 'undefined' && typeof document.body !== 'undefined' && document.body) {
    const initTaskbar = () => {
        if (typeof ApplicationAssetManager !== 'undefined' && typeof ProcessManager !== 'undefined') {
            // 延迟初始化，确保所有程序都已启动
            setTimeout(() => {
                TaskbarManager.init();
            }, 500);
        } else {
            setTimeout(initTaskbar, 100);
        }
    };
    
    // 如果内核已经引导完成，立即初始化
    const kernelContent = document.getElementById('kernel-content');
    if (kernelContent && kernelContent.style.display !== 'none') {
        initTaskbar();
    } else {
        // 否则等待引导完成事件
        document.body.addEventListener('kernelBootComplete', () => {
            initTaskbar();
        }, { once: true });
    }
}

