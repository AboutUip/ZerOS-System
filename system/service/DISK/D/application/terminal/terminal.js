/* 简易 Bash 风格终端框架
 * - 黑白高对比 UI（见 terminal.css）
 * - 暴露接口：Terminal.env / Terminal.setCwd / setUser / setHost / clear / write / focus
 * - 命令处理委托到可替换的 handler（默认使用 switch skeleton）
 * - 不实现真实命令，仅提供可扩展的框架
 * 
 * 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理
 */

// 禁止自动初始化，等待 ProcessManager 调用 __init__
(function(window){
    // 安全的 POOL 访问辅助函数
    function safeGetPool() {
        try {
            // 尝试通过多种方式访问 POOL，避免直接引用导致 ReferenceError
            if (typeof window !== 'undefined' && window.POOL) {
                return window.POOL;
            }
            if (typeof globalThis !== 'undefined' && globalThis.POOL) {
                return globalThis.POOL;
            }
            // 最后尝试直接访问（在 try-catch 中）
            try {
                if (typeof POOL !== 'undefined' && POOL) {
                    return POOL;
                }
            } catch (e) {
                // 如果直接访问失败，忽略
            }
            return null;
        } catch (e) {
            return null;
        }
    }
    
    // 安全的 POOL.__GET__ 包装
    function safePoolGet(type, name) {
        const pool = safeGetPool();
        if (!pool || typeof pool.__GET__ !== 'function') {
            return undefined;
        }
        try {
            const result = pool.__GET__(type, name);
            // 如果返回的是 { isInit: false }，说明类别不存在，返回 undefined
            if (result && typeof result === 'object' && result.isInit === false) {
                return undefined;
            }
            // 确保返回的是字符串（对于 WORK_SPACE）
            if (name === 'WORK_SPACE' && result && typeof result !== 'string') {
                // 如果返回的不是字符串，尝试转换为字符串
                if (typeof result === 'object' && result.toString) {
                    const str = result.toString();
                    // 如果 toString 返回的是 [object Object]，说明不是我们想要的
                    if (str === '[object Object]') {
                        return undefined;
                    }
                    return str;
                }
                return undefined;
            }
            return result;
        } catch (e) {
            return undefined;
        }
    }
    
    // 安全的 POOL.__ADD__ 包装
    function safePoolAdd(type, name, value) {
        const pool = safeGetPool();
        if (!pool || typeof pool.__ADD__ !== 'function') {
            return false;
        }
        try {
            pool.__ADD__(type, name, value);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    // 安全获取类型定义（从 POOL 或全局对象）
    function safeGetType(typeName) {
        // 优先从 POOL 获取
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                const type = POOL.__GET__("TYPE_POOL", typeName);
                if (type !== undefined && type !== null) {
                    const poolCategory = POOL.__GET__("TYPE_POOL");
                    if (poolCategory && (typeof poolCategory !== 'object' || poolCategory.isInit !== false)) {
                        return type;
                    }
                }
            } catch (e) {
                // 忽略错误，继续尝试全局对象
            }
        }
        
        // 降级到全局对象
        if (typeof window !== 'undefined' && window[typeName]) {
            return window[typeName];
        }
        if (typeof globalThis !== 'undefined' && globalThis[typeName]) {
            return globalThis[typeName];
        }
        
        return undefined;
    }
    
    // 路径解析工具：支持绝对盘符路径 (e.g. C:/a/b)、以 / 开头的相对盘符路径 (/dir -> C:/dir)、以及相对路径（包含 . 和 ..）
    function resolvePath(cwd, inputPath){
        if(!inputPath) return cwd;
        // 已是绝对盘符路径，如 C: 或 C:/...
            if(/^[A-Za-z]:/.test(inputPath)){
                // 统一反斜杠为斜杠，去重连续的斜杠，并移除末尾斜杠
                return inputPath.replace(/\\/g,'/').replace(/\/+/g,'/').replace(/\/$/,'');
        }
        const root = String(cwd).split('/')[0];
        let baseParts = String(cwd).split('/');
        // 如果以 / 开头，表示相对于当前盘符根
        if(inputPath.startsWith('/')){
            baseParts = [root];
            inputPath = inputPath.replace(/^\/+/, '');
        }
        const parts = inputPath.split('/').filter(Boolean);
        for(const p of parts){
            if(p === '.') continue;
            if(p === '..'){
                if(baseParts.length > 1) baseParts.pop();
                // 若已到盘符根则保持不变
            }else{
                baseParts.push(p);
            }
        }
        return baseParts.join('/');
    }

    // 标签页管理器
    class TabManager {
        constructor(pid = null) {
            this.tabs = [];
            this.activeTabId = null;
            this.tabCounter = 0;
            this.pid = pid;  // 存储进程ID，用于标记DOM元素
            
            // 为每个实例生成唯一的类名前缀（基于pid）
            // 这样每个实例的DOM元素都有唯一的类名，避免CSS选择器冲突
            // 使用 this.pid 而不是直接使用 pid 参数，确保在闭包中也能访问
            this.classPrefix = this.pid ? `terminal-pid-${this.pid}` : 'terminal-default';
            
            // 确保每个实例的tabCounter是独立的
            // 注意：tabCounter从0开始，第一个标签页会是Terminal 1
            // 使用pid作为种子，确保不同实例的tab ID不会冲突
            // 总是从0开始，这样第一个标签页会是Terminal 1
            this.tabCounter = 0;
            
            // 为每个实例创建独立的DOM容器（使用pid区分）
            let terminalContainer = null;
            if (this.pid) {
                // 尝试获取该实例的容器
                terminalContainer = document.getElementById(`terminal-${this.pid}`);
            }
            
            // 如果没有找到，尝试获取默认容器（向后兼容）
            if (!terminalContainer) {
                terminalContainer = document.getElementById('terminal');
            }
            
            // 获取 GUI 容器（从 initArgs 或默认位置）
            let guiContainer = null;
            if (typeof window !== 'undefined' && window._currentInitArgs && window._currentInitArgs.guiContainer) {
                guiContainer = window._currentInitArgs.guiContainer;
            } else if (typeof document !== 'undefined') {
                // 降级方案：尝试从 DOM 获取
                guiContainer = document.getElementById('gui-container');
            }
            
            // 如果 GUI 容器不存在，使用 document.body（向后兼容）
            const parentContainer = guiContainer || document.body;
            
            if (!terminalContainer) {
                // 创建终端容器（使用pid作为ID的一部分，支持多实例）
                terminalContainer = document.createElement('div');
                terminalContainer.id = this.pid ? `terminal-${this.pid}` : 'terminal';
                terminalContainer.className = 'terminal-container';
                terminalContainer.setAttribute('role', 'application');
                terminalContainer.setAttribute('aria-label', 'Bash-like terminal');
                if (this.pid && terminalContainer.dataset) {
                    terminalContainer.dataset.pid = this.pid.toString();
                }
                // 将容器添加到 GUI 容器中，而不是直接添加到 document.body
                parentContainer.appendChild(terminalContainer);
            } else {
                // 确保容器有正确的pid标记
                if (this.pid && terminalContainer.dataset) {
                    terminalContainer.dataset.pid = this.pid.toString();
                }
                // 确保容器在正确的父容器中
                if (terminalContainer.parentElement !== parentContainer) {
                    parentContainer.appendChild(terminalContainer);
                }
            }
            
            // 创建bash-window容器（每个实例独立，通过pid区分）
            let bashWindow = null;
            if (this.pid) {
                bashWindow = terminalContainer.querySelector(`.bash-window[data-pid="${this.pid}"]`);
            } else {
                bashWindow = terminalContainer.querySelector('.bash-window');
            }
            
            if (!bashWindow) {
                bashWindow = document.createElement('div');
                // 使用唯一的类名前缀，避免多实例冲突
                bashWindow.className = `bash-window ${this.classPrefix}-bash-window`;
                if (this.pid && bashWindow.dataset) {
                    bashWindow.dataset.pid = this.pid.toString();
                }
                
                // 初始化 _windowState 对象
                bashWindow._windowState = {
                    isFullscreen: false
                };
                
                // 为每个实例设置不同的位置偏移和z-index，避免重叠
                // 计算实例索引（基于pid）
                let instanceIndex = 0;
                if (this.pid) {
                    // 尝试从ProcessManager获取实例索引
                    try {
                        const pool = safeGetPool();
                        if (pool && typeof pool.__GET__ === 'function') {
                            const ProcessManager = pool.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
                            if (ProcessManager && typeof ProcessManager.listProcesses === 'function') {
                                const processes = ProcessManager.listProcesses();
                                const terminalProcesses = processes.filter(p => {
                                    const programName = p.programName || '';
                                    return programName.toLowerCase() === 'terminal';
                                }).sort((a, b) => (a.pid || 0) - (b.pid || 0));
                                instanceIndex = terminalProcesses.findIndex(p => p.pid === this.pid);
                                if (instanceIndex === -1) {
                                    instanceIndex = terminalProcesses.length;
                                }
                            }
                        }
                    } catch (e) {
                        // 如果获取失败，使用pid作为索引
                        instanceIndex = (this.pid % 1000) || 0;
                    }
                }
                
                // 设置位置偏移（每个实例偏移30px）
                // 注意：如果使用GUIManager，位置和z-index将由GUIManager管理
                // 这里只设置初始位置，GUIManager会覆盖这些设置
                const offsetX = instanceIndex * 30;
                const offsetY = instanceIndex * 30;
                bashWindow.style.left = `calc(50% + ${offsetX}px)`;
                bashWindow.style.top = `calc(50% + ${offsetY}px)`;
                
                // 初始z-index（如果使用GUIManager，会被GUIManager覆盖）
                // 注意：如果使用GUIManager，z-index由GUIManager统一管理，不应在这里设置
                // 只有在未使用GUIManager时才设置z-index
                // 使用安全的方式检查GUIManager是否存在，避免在声明前访问
                let hasGUIManager = false;
                try {
                    const pool = safeGetPool();
                    if (pool && typeof pool.__GET__ === 'function') {
                        const guiMgr = pool.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");
                        hasGUIManager = (guiMgr && typeof guiMgr.registerWindow === 'function');
                    }
                } catch (e) {
                    // 忽略错误
                }
                if (!hasGUIManager && typeof window !== 'undefined' && window.GUIManager) {
                    hasGUIManager = (typeof window.GUIManager.registerWindow === 'function');
                }
                
                if (!hasGUIManager || !this.pid) {
                bashWindow.style.zIndex = 1000 + instanceIndex;
                }
                
                // 为窗口添加点击事件，激活终端实例（使用 EventManager）
                // 注意：窗口焦点管理由GUIManager统一处理，这里只处理终端实例的激活
                if (typeof EventManager !== 'undefined' && this.pid) {
                    const bashWindowId = `terminal-bash-window-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    bashWindow.dataset.eventId = bashWindowId;
                    EventManager.registerEventHandler(this.pid, 'mousedown', (e) => {
                        // 如果点击的是窗口本身或窗口内的元素（但不是其他窗口的元素）
                        if (bashWindow === e.target || bashWindow.contains(e.target)) {
                            if (e.target.closest('.bash-window') === bashWindow) {
                                // 找到该窗口对应的TabManager实例并激活输入框
                                if (this.pid) {
                                    if (typeof TERMINAL !== 'undefined' && TERMINAL._instances && TERMINAL._instances.has(this.pid)) {
                                        const instance = TERMINAL._instances.get(this.pid);
                                        if (instance && instance.tabManager) {
                                            const activeTerminal = instance.tabManager.getActiveTerminal();
                                            if (activeTerminal) {
                                                if (!activeTerminal.isActive) {
                                                    activeTerminal._setActive(true);
                                                }
                                                setTimeout(() => {
                                                    if (activeTerminal.isActive && !activeTerminal.busy) {
                                                        activeTerminal.focus();
                                                    }
                                                }, 50);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }, {
                        priority: 100,
                        selector: `[data-event-id="${bashWindowId}"]`
                    });
                } else {
                    // 降级方案
                    bashWindow.addEventListener('mousedown', (e) => {
                        if (e.target.closest('.bash-window') === bashWindow) {
                            if (this.pid) {
                                if (typeof TERMINAL !== 'undefined' && TERMINAL._instances && TERMINAL._instances.has(this.pid)) {
                                    const instance = TERMINAL._instances.get(this.pid);
                                    if (instance && instance.tabManager) {
                                        const activeTerminal = instance.tabManager.getActiveTerminal();
                                        if (activeTerminal) {
                                            if (!activeTerminal.isActive) {
                                                activeTerminal._setActive(true);
                                            }
                                            setTimeout(() => {
                                                if (activeTerminal.isActive && !activeTerminal.busy) {
                                                    activeTerminal.focus();
                                                }
                                            }, 50);
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
                
                terminalContainer.appendChild(bashWindow);
            }
                
                // 使用GUIManager注册窗口（如果可用）
            // 优先从POOL获取GUIManager，如果POOL中没有，再尝试全局对象
            let GUIManager = null;
            try {
                const pool = safeGetPool();
                if (pool && typeof pool.__GET__ === 'function') {
                    GUIManager = pool.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");
                }
            } catch (e) {
                // 忽略错误
            }
            
            // 如果POOL中没有，尝试全局对象
            if (!GUIManager && typeof window !== 'undefined' && window.GUIManager) {
                GUIManager = window.GUIManager;
            } else if (!GUIManager && typeof globalThis !== 'undefined' && globalThis.GUIManager) {
                GUIManager = globalThis.GUIManager;
            } else if (!GUIManager && typeof GUIManager !== 'undefined') {
                GUIManager = GUIManager;
            }
            
            if (GUIManager && typeof GUIManager.registerWindow === 'function' && this.pid) {
                    // 获取程序图标
                    let icon = null;
                    try {
                        const pool = safeGetPool();
                        if (pool && typeof pool.__GET__ === 'function') {
                            const ApplicationAssetManager = pool.__GET__("KERNEL_GLOBAL_POOL", "ApplicationAssetManager");
                            if (ApplicationAssetManager && typeof ApplicationAssetManager.getIcon === 'function') {
                                icon = ApplicationAssetManager.getIcon('terminal');
                            }
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                    
                    // 获取窗口标题
                    let windowTitle = 'Terminal';
                // 从 window._currentInitArgs 获取 initArgs（与构造函数中获取 guiContainer 的方式一致）
                let initArgs = null;
                if (typeof window !== 'undefined' && window._currentInitArgs) {
                    initArgs = window._currentInitArgs;
                }
                    if (initArgs && initArgs.cliProgramName) {
                        windowTitle = initArgs.cliProgramName;
                    }
                    
                    const windowInfo = GUIManager.registerWindow(this.pid, bashWindow, {
                        title: windowTitle,
                        icon: icon,
                        onClose: () => {
                            // 终端特殊处理：如果是 CLI 程序专用终端，需要同时关闭关联的 CLI 程序
                            // 注意：ProcessManager.killProgram 中已经有处理逻辑，但为了确保在窗口关闭时立即关闭 CLI 程序，
                            // 我们在这里提前处理，避免窗口关闭动画期间 CLI 程序仍在运行
                            const pool = safeGetPool();
                            if (pool && typeof pool.__GET__ === 'function') {
                                try {
                                    const ProcessManager = pool.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
                                    if (ProcessManager && this.pid) {
                                        const processInfo = ProcessManager.PROCESS_TABLE.get(this.pid);
                                        // 检查是否是 CLI 程序专用终端
                                        if (processInfo && processInfo.isCLITerminal) {
                                            // 查找关联的 CLI 程序
                                            let cliProgramPid = null;
                                            for (const [p, info] of ProcessManager.PROCESS_TABLE) {
                                                if (info.terminalPid === this.pid && info.isCLI && info.status === 'running') {
                                                    cliProgramPid = p;
                                                    break;
                                                }
                                            }
                                            // 先关闭关联的 CLI 程序（异步，不阻塞窗口关闭）
                                            if (cliProgramPid) {
                                                ProcessManager.killProgram(cliProgramPid, false).catch(e => {
                                                    console.error('关闭关联 CLI 程序失败:', e);
                                                });
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error('获取 ProcessManager 失败:', e);
                                }
                            }
                            // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                            // 窗口关闭由 GUIManager._closeWindow 统一处理
                            // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                            // 这样可以确保程序多实例（不同 PID）互不影响
                        },
                        onMinimize: () => {
                            // 最小化回调
                        },
                        onMaximize: (isMaximized) => {
                            // 最大化回调
                            if (bashWindow && !bashWindow._windowState) {
                                bashWindow._windowState = {};
                            }
                            if (bashWindow && bashWindow._windowState) {
                                bashWindow._windowState.isFullscreen = isMaximized;
                            }
                        }
                    });
                    // 保存窗口ID，用于精确清理
                    if (windowInfo && windowInfo.windowId) {
                        this.windowId = windowInfo.windowId;
                    }
                } else {
                    // 降级方案：手动创建标题栏（保持原有逻辑）
                    const bar = document.createElement('div');
                    bar.className = `bar ${this.classPrefix}-bar`;
                    if (this.pid && bar.dataset) {
                        bar.dataset.pid = this.pid.toString();
                    }
                    
                    const controls = document.createElement('div');
                    controls.className = `controls ${this.classPrefix}-controls`;
                    controls.setAttribute('aria-hidden', 'true');
                    if (this.pid && controls.dataset) {
                        controls.dataset.pid = this.pid.toString();
                    }
                    
                    const closeDot = document.createElement('span');
                    closeDot.className = `dot close ${this.classPrefix}-dot ${this.classPrefix}-dot-close`;
                    closeDot.title = '关闭';
                    closeDot.setAttribute('aria-label', '关闭窗口');
                    closeDot.setAttribute('role', 'button');
                    closeDot.setAttribute('tabindex', '0');
                    if (this.pid && closeDot.dataset) {
                        closeDot.dataset.pid = this.pid.toString();
                    }
                    // 使用 EventManager 注册事件
                    if (typeof EventManager !== 'undefined' && this.pid) {
                        const closeDotId = `terminal-close-dot-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                        closeDot.dataset.eventId = closeDotId;
                        EventManager.registerEventHandler(this.pid, 'click', () => {
                            const pool = safeGetPool();
                            if (pool && typeof pool.__GET__ === 'function') {
                                try {
                                    const ProcessManager = pool.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
                                    if (ProcessManager && typeof ProcessManager.killProgram === 'function' && this.pid) {
                                        ProcessManager.killProgram(this.pid);
                                    }
                                } catch (e) {
                                    console.error('Failed to close terminal:', e);
                                }
                            }
                        }, {
                            priority: 100,
                            selector: `[data-event-id="${closeDotId}"]`
                        });
                    } else {
                        // 降级方案
                        closeDot.addEventListener('click', () => {
                            const pool = safeGetPool();
                            if (pool && typeof pool.__GET__ === 'function') {
                                try {
                                    const ProcessManager = pool.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
                                    if (ProcessManager && typeof ProcessManager.killProgram === 'function' && this.pid) {
                                        ProcessManager.killProgram(this.pid);
                                    }
                                } catch (e) {
                                    console.error('Failed to close terminal:', e);
                                }
                            }
                        });
                    }
                    
                    const minDot = document.createElement('span');
                    minDot.className = `dot minimize ${this.classPrefix}-dot ${this.classPrefix}-dot-minimize`;
                    minDot.title = '最小化';
                    minDot.setAttribute('aria-label', '最小化窗口');
                    minDot.setAttribute('role', 'button');
                    minDot.setAttribute('tabindex', '0');
                    if (this.pid && minDot.dataset) {
                        minDot.dataset.pid = this.pid.toString();
                    }
                    // 使用 EventManager 注册事件
                    if (typeof EventManager !== 'undefined' && this.pid) {
                        const minDotId = `terminal-min-dot-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                        minDot.dataset.eventId = minDotId;
                        EventManager.registerEventHandler(this.pid, 'click', () => {
                            let GUIManager = null;
                            try {
                                const pool = safeGetPool();
                                if (pool && typeof pool.__GET__ === 'function') {
                                    GUIManager = pool.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");
                                }
                        } catch (e) {
                            // 忽略错误
                        }
                        if (!GUIManager && typeof window !== 'undefined' && window.GUIManager) {
                            GUIManager = window.GUIManager;
                        } else if (!GUIManager && typeof globalThis !== 'undefined' && globalThis.GUIManager) {
                            GUIManager = globalThis.GUIManager;
                        }
                        
                        if (bashWindow && GUIManager && typeof GUIManager.minimizeWindow === 'function' && this.pid) {
                            GUIManager.minimizeWindow(this.pid);
                        } else if (bashWindow) {
                            bashWindow.style.display = 'none';
                        }
                    }, {
                        priority: 100,
                        selector: `[data-event-id="${minDotId}"]`
                    });
                    } else {
                        // 降级方案
                        minDot.addEventListener('click', () => {
                            let GUIManager = null;
                            try {
                                const pool = safeGetPool();
                                if (pool && typeof pool.__GET__ === 'function') {
                                    GUIManager = pool.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");
                                }
                            } catch (e) {
                                // 忽略错误
                            }
                            if (!GUIManager && typeof window !== 'undefined' && window.GUIManager) {
                                GUIManager = window.GUIManager;
                            } else if (!GUIManager && typeof globalThis !== 'undefined' && globalThis.GUIManager) {
                                GUIManager = globalThis.GUIManager;
                            }
                            
                            if (bashWindow && GUIManager && typeof GUIManager.minimizeWindow === 'function' && this.pid) {
                                GUIManager.minimizeWindow(this.pid);
                            } else if (bashWindow) {
                                bashWindow.style.display = 'none';
                            }
                        });
                    }
                    
                    const maxDot = document.createElement('span');
                    maxDot.className = `dot maximize ${this.classPrefix}-dot ${this.classPrefix}-dot-maximize`;
                    maxDot.title = '全屏/还原';
                    maxDot.setAttribute('aria-label', '全屏/还原窗口');
                    maxDot.setAttribute('role', 'button');
                    maxDot.setAttribute('tabindex', '0');
                    if (this.pid && maxDot.dataset) {
                        maxDot.dataset.pid = this.pid.toString();
                    }
                    // 使用 EventManager 注册事件
                    if (typeof EventManager !== 'undefined' && this.pid) {
                        const maxDotId = `terminal-max-dot-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                        maxDot.dataset.eventId = maxDotId;
                        EventManager.registerEventHandler(this.pid, 'click', () => {
                        if (!bashWindow) return;
                        
                        let GUIManager = null;
                        try {
                            const pool = safeGetPool();
                            if (pool && typeof pool.__GET__ === 'function') {
                                GUIManager = pool.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");
                            }
                        } catch (e) {
                            // 忽略错误
                        }
                        if (!GUIManager && typeof window !== 'undefined' && window.GUIManager) {
                            GUIManager = window.GUIManager;
                        } else if (!GUIManager && typeof globalThis !== 'undefined' && globalThis.GUIManager) {
                            GUIManager = globalThis.GUIManager;
                        }
                        
                        if (GUIManager && typeof GUIManager.toggleMaximize === 'function' && this.pid) {
                            GUIManager.toggleMaximize(this.pid);
                        } else {
                            // 降级方案：原有逻辑
                            const state = bashWindow._windowState;
                            
                            if (!state.isFullscreen) {
                                const rect = bashWindow.getBoundingClientRect();
                                state.savedStyle = {
                                    top: bashWindow.style.top || (rect.top + 'px'),
                                    left: bashWindow.style.left || (rect.left + 'px'),
                                    width: bashWindow.style.width || (rect.width + 'px'),
                                    height: bashWindow.style.height || (rect.height + 'px'),
                                    transform: bashWindow.style.transform || '',
                                    maxWidth: bashWindow.style.maxWidth || '',
                                    maxHeight: bashWindow.style.maxHeight || '',
                                    borderRadius: bashWindow.style.borderRadius || ''
                                };
                                
                                bashWindow.style.position = 'fixed';
                                bashWindow.style.top = '0';
                                bashWindow.style.left = '0';
                                bashWindow.style.width = '100vw';
                                bashWindow.style.height = '100vh';
                                bashWindow.style.transform = 'none';
                                bashWindow.style.maxWidth = 'none';
                                bashWindow.style.maxHeight = 'none';
                                bashWindow.style.borderRadius = '0';
                                bashWindow.classList.add('fullscreen');
                                state.isFullscreen = true;
                                maxDot.title = '还原';
                                bar.style.cursor = 'default';
                                bar.style.pointerEvents = 'auto';
                            } else {
                                if (state.savedStyle) {
                                    bashWindow.style.top = state.savedStyle.top || '';
                                    bashWindow.style.left = state.savedStyle.left || '';
                                    bashWindow.style.width = state.savedStyle.width || '';
                                    bashWindow.style.height = state.savedStyle.height || '';
                                    bashWindow.style.transform = state.savedStyle.transform || '';
                                    bashWindow.style.maxWidth = state.savedStyle.maxWidth || '';
                                    bashWindow.style.maxHeight = state.savedStyle.maxHeight || '';
                                    bashWindow.style.borderRadius = state.savedStyle.borderRadius || '';
                                } else {
                                    bashWindow.style.top = '';
                                    bashWindow.style.left = '';
                                    bashWindow.style.width = '';
                                    bashWindow.style.height = '';
                                    bashWindow.style.transform = 'translate(-50%, -50%)';
                                    bashWindow.style.maxWidth = '';
                                    bashWindow.style.maxHeight = '';
                                    bashWindow.style.borderRadius = '';
                                }
                                bashWindow.classList.remove('fullscreen');
                                state.isFullscreen = false;
                                maxDot.title = '全屏/还原';
                                bar.style.cursor = 'move';
                            }
                        }
                    });
                    
                    controls.appendChild(closeDot);
                    controls.appendChild(minDot);
                    controls.appendChild(maxDot);
                
                    // 存储窗口管理状态
                    bashWindow._windowState = {
                        isFullscreen: false,
                        savedStyle: null,
                        isDragging: false,
                        dragStartX: 0,
                        dragStartY: 0,
                        dragStartLeft: 0,
                        dragStartTop: 0,
                        isResizing: false,
                        resizeStartX: 0,
                        resizeStartY: 0,
                        resizeStartWidth: 0,
                        resizeStartHeight: 0,
                        resizeStartTop: 0,
                        resizeAnchor: null  // 'bottom-right' 或 'top-right'
                    };
                    // 降级方案：手动创建标题栏和拖拽功能
                    bar.style.cursor = 'move';
                    
                    // 使用 EventManager 注册拖动事件
                    if (typeof EventManager !== 'undefined' && typeof EventManager.registerDrag === 'function') {
                        const windowId = `terminal-window-${this.pid || 'default'}`;
                        
                        EventManager.registerDrag(
                            windowId,
                            bar,
                            bashWindow,
                            bashWindow._windowState,
                            // onDragStart
                            (e) => {
                                const state = bashWindow._windowState;
                                if (state.isFullscreen) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                }
                                
                                // 拖拽开始时，将窗口置于最上层
                                const allWindows = document.querySelectorAll('.bash-window');
                                allWindows.forEach(win => {
                                    win.classList.remove('focused');
                                });
                                bashWindow.classList.add('focused');
                                
                                state.isDragging = true;
                                state.dragStartX = e.clientX;
                                state.dragStartY = e.clientY;
                                const rect = bashWindow.getBoundingClientRect();
                                state.dragStartLeft = rect.left;
                                state.dragStartTop = rect.top;
                                
                                bashWindow.style.position = 'fixed';
                                bashWindow.style.transform = 'none';
                                bashWindow.style.left = state.dragStartLeft + 'px';
                                bashWindow.style.top = state.dragStartTop + 'px';
                                bashWindow.classList.add('floating');
                                
                                e.preventDefault();
                            },
                            // onDrag
                            (e) => {
                                const state = bashWindow._windowState;
                                if (state.isFullscreen) {
                                    state.isDragging = false;
                                    return;
                                }
                                
                                if (state.isDragging) {
                                    const deltaX = e.clientX - state.dragStartX;
                                    const deltaY = e.clientY - state.dragStartY;
                                    
                                    // 边界检查：确保窗口不超出 gui-container
                                    const guiContainer = document.getElementById('gui-container');
                                    if (guiContainer) {
                                        const containerRect = guiContainer.getBoundingClientRect();
                                        const winWidth = bashWindow.offsetWidth;
                                        const winHeight = bashWindow.offsetHeight;
                                        
                                        let newLeft = state.dragStartLeft + deltaX;
                                        let newTop = state.dragStartTop + deltaY;
                                        
                                        // 限制在容器内
                                        newLeft = Math.max(containerRect.left, Math.min(newLeft, containerRect.right - winWidth));
                                        newTop = Math.max(containerRect.top, Math.min(newTop, containerRect.bottom - winHeight));
                                        
                                        bashWindow.style.left = newLeft + 'px';
                                        bashWindow.style.top = newTop + 'px';
                                    } else {
                                        bashWindow.style.left = (state.dragStartLeft + deltaX) + 'px';
                                        bashWindow.style.top = (state.dragStartTop + deltaY) + 'px';
                                    }
                                }
                            },
                            // onDragEnd
                            (e) => {
                                const state = bashWindow._windowState;
                                state.isDragging = false;
                            },
                            ['.dot', '.controls'] // 排除的选择器
                        );
                    } else {
                        // 降级方案：使用原有逻辑
                        bar.addEventListener('mousedown', (e) => {
                            if (e.target.classList.contains('dot') || e.target.closest('.controls')) {
                                return;
                            }
                            
                            if (e.target === bar || bar.contains(e.target)) {
                                const state = bashWindow._windowState;
                                if (state.isFullscreen) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                }
                                
                                const allWindows = document.querySelectorAll('.bash-window');
                                allWindows.forEach(win => {
                                    win.classList.remove('focused');
                                });
                                bashWindow.classList.add('focused');
                                
                                state.isDragging = true;
                                state.dragStartX = e.clientX;
                                state.dragStartY = e.clientY;
                                const rect = bashWindow.getBoundingClientRect();
                                state.dragStartLeft = rect.left;
                                state.dragStartTop = rect.top;
                                
                                bashWindow.style.position = 'fixed';
                                bashWindow.style.transform = 'none';
                                bashWindow.style.left = state.dragStartLeft + 'px';
                                bashWindow.style.top = state.dragStartTop + 'px';
                                bashWindow.classList.add('floating');
                                
                                e.preventDefault();
                            }
                        });
                        
                        // 降级方案：处理拖动和拉伸的 mousemove 和 mouseup
                        const handleMousemove = (e) => {
                            const state = bashWindow._windowState;
                            if (state.isFullscreen) {
                                if (state.isDragging) {
                                    state.isDragging = false;
                                }
                                if (state.isResizing) {
                                    state.isResizing = false;
                                }
                                return;
                            }
                            
                            if (state.isDragging) {
                                const deltaX = e.clientX - state.dragStartX;
                                const deltaY = e.clientY - state.dragStartY;
                                bashWindow.style.left = (state.dragStartLeft + deltaX) + 'px';
                                bashWindow.style.top = (state.dragStartTop + deltaY) + 'px';
                            }
                            
                            if (state.isResizing) {
                                const deltaX = e.clientX - state.resizeStartX;
                                const deltaY = e.clientY - state.resizeStartY;
                                const newWidth = Math.max(480, state.resizeStartWidth + deltaX);
                                
                                if (state.resizeAnchor === 'top-right') {
                                    const newHeight = Math.max(320, state.resizeStartHeight - deltaY);
                                    const newTop = state.resizeStartTop + (state.resizeStartHeight - newHeight);
                                    bashWindow.style.width = newWidth + 'px';
                                    bashWindow.style.height = newHeight + 'px';
                                    bashWindow.style.top = newTop + 'px';
                                } else {
                                    const newHeight = Math.max(320, state.resizeStartHeight + deltaY);
                                    bashWindow.style.width = newWidth + 'px';
                                    bashWindow.style.height = newHeight + 'px';
                                }
                            }
                        };
                        
                        const handleMouseup = () => {
                            const state = bashWindow._windowState;
                            state.isDragging = false;
                            state.isResizing = false;
                        };
                        
                        // 使用 EventManager 注册临时拖动事件
                        if (typeof EventManager !== 'undefined' && this.pid) {
                            const mousemoveHandlerId = EventManager.registerEventHandler(this.pid, 'mousemove', handleMousemove, {
                                priority: 50,
                                once: false
                            });
                            
                            const mouseupHandlerId = EventManager.registerEventHandler(this.pid, 'mouseup', handleMouseup, {
                                priority: 50,
                                once: true
                            });
                            
                            // 存储事件处理器ID，以便后续清理
                            if (!bashWindow._dragEventHandlers) {
                                bashWindow._dragEventHandlers = [];
                            }
                            bashWindow._dragEventHandlers.push(mousemoveHandlerId, mouseupHandlerId);
                        } else {
                            // 降级：直接使用 addEventListener（不推荐）
                            document.addEventListener('mousemove', handleMousemove);
                            document.addEventListener('mouseup', handleMouseup);
                            bashWindow._fallbackMousemove = handleMousemove;
                            bashWindow._fallbackMouseup = handleMouseup;
                        }
                    }
                    
                    // 拉伸功能：在窗口右下角和右上角添加resizer
                    // 右下角resizer（右下角拉伸）
                    let resizer = bashWindow.querySelector(`.window-resizer.bottom-right[data-pid="${this.pid}"]`);
                    if (!resizer) {
                    resizer = document.createElement('div');
                    resizer.className = `window-resizer bottom-right ${this.classPrefix}-resizer ${this.classPrefix}-resizer-bottom-right`;
                    resizer.style.cssText = `
                        position: absolute;
                        right: 0;
                        bottom: 0;
                        width: 20px;
                        height: 20px;
                        cursor: se-resize;
                        background: transparent;
                        z-index: 1000;
                    `;
                    if (this.pid && resizer.dataset) {
                        resizer.dataset.pid = this.pid.toString();
                    }
                    bashWindow.appendChild(resizer);
                    
                    // 使用 EventManager 注册拉伸事件（右下角）
                    if (typeof EventManager !== 'undefined' && typeof EventManager.registerResizer === 'function') {
                        const resizerId = `terminal-resizer-bottom-right-${this.pid || 'default'}`;
                        
                        EventManager.registerResizer(
                            resizerId,
                            resizer,
                            bashWindow,
                            bashWindow._windowState,
                            // onResizeStart
                            (e) => {
                                const state = bashWindow._windowState;
                                if (state.isFullscreen) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                }
                                
                                const allWindows = document.querySelectorAll('.bash-window');
                                allWindows.forEach(win => {
                                    win.classList.remove('focused');
                                });
                                bashWindow.classList.add('focused');
                                
                                state.isResizing = true;
                                state.resizeStartX = e.clientX;
                                state.resizeStartY = e.clientY;
                                const rect = bashWindow.getBoundingClientRect();
                                state.resizeStartWidth = rect.width;
                                state.resizeStartHeight = rect.height;
                                state.resizeAnchor = 'bottom-right';
                                
                                bashWindow.style.position = 'fixed';
                                bashWindow.style.transform = 'none';
                                const currentRect = bashWindow.getBoundingClientRect();
                                bashWindow.style.left = currentRect.left + 'px';
                                bashWindow.style.top = currentRect.top + 'px';
                                bashWindow.classList.add('floating');
                                
                                e.preventDefault();
                                e.stopPropagation();
                            },
                            // onResize
                            (e) => {
                                const state = bashWindow._windowState;
                                if (state.isFullscreen) {
                                    state.isResizing = false;
                                    return;
                                }
                                
                                if (state.isResizing && state.resizeAnchor === 'bottom-right') {
                                    const deltaX = e.clientX - state.resizeStartX;
                                    const deltaY = e.clientY - state.resizeStartY;
                                    const newWidth = Math.max(480, state.resizeStartWidth + deltaX);
                                    const newHeight = Math.max(320, state.resizeStartHeight + deltaY);
                                    
                                    // 边界检查
                                    const guiContainer = document.getElementById('gui-container');
                                    if (guiContainer) {
                                        const containerRect = guiContainer.getBoundingClientRect();
                                        const rect = bashWindow.getBoundingClientRect();
                                        
                                        const maxWidth = containerRect.right - rect.left;
                                        const maxHeight = containerRect.bottom - rect.top;
                                        
                                        bashWindow.style.width = Math.min(newWidth, maxWidth) + 'px';
                                        bashWindow.style.height = Math.min(newHeight, maxHeight) + 'px';
                                    } else {
                                        bashWindow.style.width = newWidth + 'px';
                                        bashWindow.style.height = newHeight + 'px';
                                    }
                                }
                            },
                            // onResizeEnd
                            (e) => {
                                const state = bashWindow._windowState;
                                state.isResizing = false;
                            }
                        );
                    } else {
                        // 降级方案
                        resizer.addEventListener('mousedown', (e) => {
                            const state = bashWindow._windowState;
                            if (state.isFullscreen) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                            }
                            
                            const allWindows = document.querySelectorAll('.bash-window');
                            allWindows.forEach(win => {
                                win.classList.remove('focused');
                            });
                            bashWindow.classList.add('focused');
                            
                            state.isResizing = true;
                            state.resizeStartX = e.clientX;
                            state.resizeStartY = e.clientY;
                            const rect = bashWindow.getBoundingClientRect();
                            state.resizeStartWidth = rect.width;
                            state.resizeStartHeight = rect.height;
                            state.resizeAnchor = 'bottom-right';
                            
                            bashWindow.style.position = 'fixed';
                            bashWindow.style.transform = 'none';
                            const currentRect = bashWindow.getBoundingClientRect();
                            bashWindow.style.left = currentRect.left + 'px';
                            bashWindow.style.top = currentRect.top + 'px';
                            bashWindow.classList.add('floating');
                            
                            e.preventDefault();
                            e.stopPropagation();
                        });
                    }
                }
                
                // 右上角resizer（右上角拉伸）
                let resizerTopRight = bashWindow.querySelector(`.window-resizer.top-right[data-pid="${this.pid}"]`);
                if (!resizerTopRight) {
                    resizerTopRight = document.createElement('div');
                    resizerTopRight.className = `window-resizer top-right ${this.classPrefix}-resizer ${this.classPrefix}-resizer-top-right`;
                    resizerTopRight.style.cssText = `
                        position: absolute;
                        right: 0;
                        top: 0;
                        width: 20px;
                        height: 20px;
                        cursor: ne-resize;
                        background: transparent;
                        z-index: 1000;
                    `;
                    if (this.pid && resizerTopRight.dataset) {
                        resizerTopRight.dataset.pid = this.pid.toString();
                    }
                    bashWindow.appendChild(resizerTopRight);
                    
                    // 使用 EventManager 注册拉伸事件（右上角）
                    if (typeof EventManager !== 'undefined' && typeof EventManager.registerResizer === 'function') {
                        const resizerId = `terminal-resizer-top-right-${this.pid || 'default'}`;
                        
                        EventManager.registerResizer(
                            resizerId,
                            resizerTopRight,
                            bashWindow,
                            bashWindow._windowState,
                            // onResizeStart
                            (e) => {
                                const state = bashWindow._windowState;
                                if (state.isFullscreen) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                }
                                
                                const allWindows = document.querySelectorAll('.bash-window');
                                allWindows.forEach(win => {
                                    win.classList.remove('focused');
                                });
                                bashWindow.classList.add('focused');
                                
                                state.isResizing = true;
                                state.resizeStartX = e.clientX;
                                state.resizeStartY = e.clientY;
                                const rect = bashWindow.getBoundingClientRect();
                                state.resizeStartWidth = rect.width;
                                state.resizeStartHeight = rect.height;
                                state.resizeStartTop = rect.top;
                                state.resizeAnchor = 'top-right';
                                
                                bashWindow.style.position = 'fixed';
                                bashWindow.style.transform = 'none';
                                const currentRect = bashWindow.getBoundingClientRect();
                                bashWindow.style.left = currentRect.left + 'px';
                                bashWindow.style.top = currentRect.top + 'px';
                                bashWindow.classList.add('floating');
                                
                                e.preventDefault();
                                e.stopPropagation();
                            },
                            // onResize
                            (e) => {
                                const state = bashWindow._windowState;
                                if (state.isFullscreen) {
                                    state.isResizing = false;
                                    return;
                                }
                                
                                if (state.isResizing && state.resizeAnchor === 'top-right') {
                                    const deltaX = e.clientX - state.resizeStartX;
                                    const deltaY = e.clientY - state.resizeStartY;
                                    const newWidth = Math.max(480, state.resizeStartWidth + deltaX);
                                    const newHeight = Math.max(320, state.resizeStartHeight - deltaY);
                                    const newTop = state.resizeStartTop + (state.resizeStartHeight - newHeight);
                                    
                                    // 边界检查
                                    const guiContainer = document.getElementById('gui-container');
                                    if (guiContainer) {
                                        const containerRect = guiContainer.getBoundingClientRect();
                                        const rect = bashWindow.getBoundingClientRect();
                                        
                                        const maxWidth = containerRect.right - rect.left;
                                        const maxHeight = rect.bottom - containerRect.top;
                                        
                                        bashWindow.style.width = Math.min(newWidth, maxWidth) + 'px';
                                        bashWindow.style.height = Math.min(newHeight, maxHeight) + 'px';
                                        bashWindow.style.top = Math.max(containerRect.top, newTop) + 'px';
                                    } else {
                                        bashWindow.style.width = newWidth + 'px';
                                        bashWindow.style.height = newHeight + 'px';
                                        bashWindow.style.top = newTop + 'px';
                                    }
                                }
                            },
                            // onResizeEnd
                            (e) => {
                                const state = bashWindow._windowState;
                                state.isResizing = false;
                            }
                        );
                    } else {
                        // 降级方案
                        resizerTopRight.addEventListener('mousedown', (e) => {
                            const state = bashWindow._windowState;
                            if (state.isFullscreen) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                            }
                            
                            const allWindows = document.querySelectorAll('.bash-window');
                            allWindows.forEach(win => {
                                win.classList.remove('focused');
                            });
                            bashWindow.classList.add('focused');
                            
                            state.isResizing = true;
                            state.resizeStartX = e.clientX;
                            state.resizeStartY = e.clientY;
                            const rect = bashWindow.getBoundingClientRect();
                            state.resizeStartWidth = rect.width;
                            state.resizeStartHeight = rect.height;
                            state.resizeStartTop = rect.top;
                            state.resizeAnchor = 'top-right';
                            
                            bashWindow.style.position = 'fixed';
                            bashWindow.style.transform = 'none';
                            const currentRect = bashWindow.getBoundingClientRect();
                            bashWindow.style.left = currentRect.left + 'px';
                            bashWindow.style.top = currentRect.top + 'px';
                            bashWindow.classList.add('floating');
                            
                            e.preventDefault();
                            e.stopPropagation();
                        });
                    }
                }
                
                // 创建标题并添加到bar（仅在降级方案中）
                const title = document.createElement('div');
                title.className = `title ${this.classPrefix}-title`;
                title.textContent = 'bash — ZerOS Kernel';
                if (this.pid && title.dataset) {
                    title.dataset.pid = this.pid.toString();
                }
                
                bar.appendChild(controls);
                bar.appendChild(title);
                bashWindow.appendChild(bar);
                }
            }
            
            // 获取或创建标签页容器（使用pid特定的选择器）
            this.tabsContainer = bashWindow.querySelector(`.tabs-container[data-pid="${this.pid}"]`);
            if (!this.tabsContainer) {
                this.tabsContainer = document.createElement('div');
                this.tabsContainer.className = `tabs-container ${this.classPrefix}-tabs-container`;
                if (this.pid && this.tabsContainer.dataset) {
                    this.tabsContainer.dataset.pid = this.pid.toString();
                }
                
                // 如果使用GUIManager，标签页栏应该在标题栏之后
                // 查找标题栏，如果存在则插入到标题栏之后，否则添加到开头
                const titleBar = bashWindow.querySelector('.zos-window-titlebar');
                if (titleBar && titleBar.nextSibling) {
                    bashWindow.insertBefore(this.tabsContainer, titleBar.nextSibling);
                } else if (titleBar) {
                    bashWindow.appendChild(this.tabsContainer);
                } else {
                    // 如果没有标题栏，添加到开头
                    bashWindow.insertBefore(this.tabsContainer, bashWindow.firstChild);
                }
            }
            
            // 使用pid特定的ID，避免多实例冲突
            const tabsBarId = this.pid ? `tabs-bar-${this.pid}` : 'tabs-bar';
            this.tabsBar = document.getElementById(tabsBarId);
            if (!this.tabsBar) {
                this.tabsBar = document.createElement('div');
                this.tabsBar.className = `tabs-bar ${this.classPrefix}-tabs-bar`;
                this.tabsBar.id = tabsBarId;
                if (this.pid && this.tabsBar.dataset) {
                    this.tabsBar.dataset.pid = this.pid.toString();
                }
                this.tabsContainer.appendChild(this.tabsBar);
            }
            
            // 使用pid特定的ID，避免多实例冲突
            const tabAddBtnId = this.pid ? `tab-add-btn-${this.pid}` : 'tab-add-btn';
            this.tabAddBtn = document.getElementById(tabAddBtnId);
            if (!this.tabAddBtn) {
                this.tabAddBtn = document.createElement('button');
                this.tabAddBtn.className = `tab-add-btn ${this.classPrefix}-tab-add-btn`;
                this.tabAddBtn.id = tabAddBtnId;
                this.tabAddBtn.textContent = '+';
                this.tabAddBtn.title = '新建标签页';
                if (this.pid && this.tabAddBtn.dataset) {
                    this.tabAddBtn.dataset.pid = this.pid.toString();
                }
                this.tabsContainer.appendChild(this.tabAddBtn);
            }
            
            // 使用pid特定的ID，避免多实例冲突
            const terminalsContainerId = this.pid ? `terminals-container-${this.pid}` : 'terminals-container';
            this.terminalsContainer = document.getElementById(terminalsContainerId);
            if (!this.terminalsContainer) {
                this.terminalsContainer = document.createElement('div');
                this.terminalsContainer.className = `terminals-container ${this.classPrefix}-terminals-container`;
                this.terminalsContainer.id = terminalsContainerId;
                if (this.pid && this.terminalsContainer.dataset) {
                    this.terminalsContainer.dataset.pid = this.pid.toString();
                }
                bashWindow.appendChild(this.terminalsContainer);
            }
            
            // 检查是否禁用标签页功能（用于CLI程序专用终端）
            this.disableTabs = false;
            if (typeof window !== 'undefined' && window._currentInitArgs && window._currentInitArgs.disableTabs) {
                this.disableTabs = true;
            }
            
            // 如果禁用标签页，隐藏标签页相关UI
            if (this.disableTabs) {
                if (this.tabsBar) {
                    this.tabsBar.style.display = 'none';
                }
                if (this.tabAddBtn) {
                    this.tabAddBtn.style.display = 'none';
                }
            } else {
                // 绑定添加标签页按钮（使用 EventManager）
                if (typeof EventManager !== 'undefined' && this.pid) {
                    const tabAddBtnId = `terminal-tab-add-btn-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    this.tabAddBtn.dataset.eventId = tabAddBtnId;
                    EventManager.registerEventHandler(this.pid, 'click', () => {
                        this.createTab();
                    }, {
                        priority: 100,
                        selector: `[data-event-id="${tabAddBtnId}"]`
                    });
                } else {
                    // 降级方案
                    this.tabAddBtn.addEventListener('click', () => this.createTab());
                }
            }
            
            // 创建第一个标签页（即使禁用标签页，也需要一个终端实例）
            this.createTab();
        }
        
        createTab(title = null) {
            // 先递增计数器
            ++this.tabCounter;
            // 确保tabId是唯一的（包含pid以避免不同实例间的冲突）
            const tabId = this.pid ? `tab-${this.pid}-${this.tabCounter}` : `tab-${this.tabCounter}`;
            const tabTitle = title || `Terminal ${this.tabCounter}`;
            
            // 标记DOM元素的辅助函数
            const markElement = (element) => {
                if (this.pid && element && element.dataset) {
                    element.dataset.pid = this.pid.toString();
                }
            };
            
            // 创建标签页 DOM（使用唯一的类名）
            const tabEl = document.createElement('div');
            tabEl.className = `tab ${this.classPrefix}-tab`;
            tabEl.dataset.tabId = tabId;
            markElement(tabEl);
            
            const tabTitleEl = document.createElement('span');
            tabTitleEl.className = `tab-title ${this.classPrefix}-tab-title`;
            tabTitleEl.textContent = tabTitle;
            markElement(tabTitleEl);
            
            const tabCloseEl = document.createElement('button');
            tabCloseEl.className = `tab-close ${this.classPrefix}-tab-close`;
            tabCloseEl.textContent = '×';
            tabCloseEl.title = '关闭标签页';
            markElement(tabCloseEl);
            // 使用 EventManager 注册事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                const tabCloseElId = `terminal-tab-close-${tabId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                tabCloseEl.dataset.eventId = tabCloseElId;
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (tabCloseEl === e.target || tabCloseEl.contains(e.target)) {
                        e.stopPropagation();
                        this.closeTab(tabId);
                    }
                }, {
                    priority: 100,
                    selector: `[data-event-id="${tabCloseElId}"]`
                });
                
                const tabElId = `terminal-tab-${tabId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                tabEl.dataset.eventId = tabElId;
                EventManager.registerEventHandler(this.pid, 'click', () => {
                    this.switchTab(tabId);
                }, {
                    priority: 100,
                    selector: `[data-event-id="${tabElId}"]`
                });
            } else {
                // 降级方案
                tabCloseEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeTab(tabId);
                });
                tabEl.addEventListener('click', () => this.switchTab(tabId));
            }
            
            tabEl.appendChild(tabTitleEl);
            tabEl.appendChild(tabCloseEl);
            
            this.tabsBar.appendChild(tabEl);
            
            // 创建终端实例容器（使用唯一的类名）
            const terminalInstanceEl = document.createElement('div');
            terminalInstanceEl.className = `terminal-instance ${this.classPrefix}-terminal-instance`;
            terminalInstanceEl.dataset.tabId = tabId;
            markElement(terminalInstanceEl);
            
            const outputEl = document.createElement('div');
            outputEl.className = `output ${this.classPrefix}-output`;
            outputEl.setAttribute('aria-live', 'polite');
            markElement(outputEl);
            
            const inputLineEl = document.createElement('div');
            inputLineEl.className = `line input-area ${this.classPrefix}-input-area`;
            markElement(inputLineEl);
            
            const promptEl = document.createElement('span');
            promptEl.className = `prompt ${this.classPrefix}-prompt`;
            markElement(promptEl);
            
            const cmdEl = document.createElement('span');
            cmdEl.className = `cmd ${this.classPrefix}-cmd`;
            cmdEl.setAttribute('contenteditable', 'true');
            cmdEl.setAttribute('spellcheck', 'false');
            cmdEl.setAttribute('aria-label', '命令输入');
            cmdEl.setAttribute('tabindex', '0');
            markElement(cmdEl);
            
            inputLineEl.appendChild(promptEl);
            inputLineEl.appendChild(cmdEl);
            
            terminalInstanceEl.appendChild(outputEl);
            terminalInstanceEl.appendChild(inputLineEl);
            
            this.terminalsContainer.appendChild(terminalInstanceEl);
            
            // 创建终端实例（传入终端容器元素引用和pid）
            const terminalInstance = new TerminalInstance(tabId, outputEl, promptEl, cmdEl, terminalInstanceEl, this.pid);
            
            // 保存标签页信息
            const tab = {
                id: tabId,
                title: tabTitle,
                element: tabEl,
                terminalInstance: terminalInstance,
                terminalElement: terminalInstanceEl
            };
            
            this.tabs.push(tab);
            
            // 为新标签页注册命令处理器
            if (typeof registerCommandHandlers === 'function') {
                registerCommandHandlers(terminalInstance);
            }
            
            this.switchTab(tabId);
            
            return tab;
        }

        switchTab(tabId) {
            if (this.activeTabId === tabId) return;
            
            // 隐藏当前活动标签页
            if (this.activeTabId) {
                const activeTab = this.tabs.find(t => t.id === this.activeTabId);
                if (activeTab) {
                    activeTab.element.classList.remove('active');
                    activeTab.terminalElement.classList.remove('active');
                    activeTab.terminalInstance._setActive(false);
                }
            }
            
            // 显示新标签页
            const tab = this.tabs.find(t => t.id === tabId);
            if (tab) {
                tab.element.classList.add('active');
                tab.terminalElement.classList.add('active');
                this.activeTabId = tabId;
                // 先设置 activeTabId，再调用 _setActive，确保焦点正确
                tab.terminalInstance._setActive(true);
                
                // 确保窗口获得焦点（提升z-index）
                const bashWindow = tab.terminalElement ? tab.terminalElement.closest('.bash-window') : null;
                if (bashWindow) {
                    // 移除所有其他窗口的焦点状态
                    const allWindows = document.querySelectorAll('.bash-window');
                    allWindows.forEach(win => {
                        if (win !== bashWindow) {
                            win.classList.remove('focused');
                        }
                    });
                    // 为当前窗口添加焦点状态
                    bashWindow.classList.add('focused');
                }
            }
        }
        
        closeTab(tabId) {
            if (this.tabs.length <= 1) {
                // 至少保留一个标签页
                return;
            }
            
            const tabIndex = this.tabs.findIndex(t => t.id === tabId);
            if (tabIndex === -1) return;
            
            const tab = this.tabs[tabIndex];
            
            // 移除 DOM 元素
            tab.element.remove();
            tab.terminalElement.remove();
            
            // 从数组中移除
            this.tabs.splice(tabIndex, 1);
            
            // 如果关闭的是活动标签页，切换到其他标签页
            if (this.activeTabId === tabId) {
                const newActiveIndex = Math.min(tabIndex, this.tabs.length - 1);
                if (newActiveIndex >= 0) {
                    this.switchTab(this.tabs[newActiveIndex].id);
                }
            }
        }
        
        getActiveTerminal() {
            const activeTab = this.tabs.find(t => t.id === this.activeTabId);
            return activeTab ? activeTab.terminalInstance : null;
        }
    }
    
    // 全局标签页管理器
    let tabManager = null;
    
    // 为终端实例注册命令处理器的函数（需要在 TabManager 之前定义，但需要 TerminalInstance 类）
    // 这个函数将在 TerminalInstance 类定义后，TabManager 初始化前定义
    let registerCommandHandlers = null;

function escapeHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

    // Markdown渲染函数
    function renderMarkdown(markdown) {
        if (!markdown) return '';
        
        let html = '<div class="markdown-content" style="font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #d4d4d4; padding: 10px; background: #1e1e1e;">';
        
        const lines = markdown.split('\n');
        let inCodeBlock = false;
        let codeBlockLang = '';
        let codeBlockContent = [];
        let inList = false;
        let listType = null; // 'ul' or 'ol'
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 代码块处理
            if (trimmedLine.startsWith('```')) {
                if (inCodeBlock) {
                    // 结束代码块
                    const codeContent = codeBlockContent.join('\n');
                    html += `<pre style="background: #252526; padding: 12px; border-radius: 4px; overflow-x: auto; border-left: 3px solid #007acc; margin: 10px 0;"><code style="font-family: 'Consolas', 'Monaco', monospace; color: #d4d4d4;">${escapeHtml(codeContent)}</code></pre>`;
                    codeBlockContent = [];
                    inCodeBlock = false;
                    codeBlockLang = '';
                } else {
                    // 开始代码块
                    inCodeBlock = true;
                    codeBlockLang = trimmedLine.substring(3).trim();
                }
                continue;
            }
            
            if (inCodeBlock) {
                codeBlockContent.push(line);
                continue;
            }
            
            // 标题处理
            if (trimmedLine.startsWith('# ')) {
                if (inList) { html += `</${listType}>`; inList = false; listType = null; }
                html += `<h1 style="color: #4EC9B0; font-size: 2em; margin: 20px 0 10px 0; border-bottom: 2px solid #3c3c3c; padding-bottom: 5px;">${escapeHtml(trimmedLine.substring(2))}</h1>`;
                continue;
            }
            if (trimmedLine.startsWith('## ')) {
                if (inList) { html += `</${listType}>`; inList = false; listType = null; }
                html += `<h2 style="color: #4EC9B0; font-size: 1.5em; margin: 18px 0 8px 0; border-bottom: 1px solid #3c3c3c; padding-bottom: 3px;">${escapeHtml(trimmedLine.substring(3))}</h2>`;
                continue;
            }
            if (trimmedLine.startsWith('### ')) {
                if (inList) { html += `</${listType}>`; inList = false; listType = null; }
                html += `<h3 style="color: #4EC9B0; font-size: 1.2em; margin: 15px 0 6px 0;">${escapeHtml(trimmedLine.substring(4))}</h3>`;
                continue;
            }
            if (trimmedLine.startsWith('#### ')) {
                if (inList) { html += `</${listType}>`; inList = false; listType = null; }
                html += `<h4 style="color: #4EC9B0; font-size: 1.1em; margin: 12px 0 5px 0;">${escapeHtml(trimmedLine.substring(5))}</h4>`;
                continue;
            }
            
            // 分隔线
            if (trimmedLine.match(/^[\-\*_]{3,}$/)) {
                if (inList) { html += `</${listType}>`; inList = false; listType = null; }
                html += '<hr style="border: none; border-top: 1px solid #3c3c3c; margin: 15px 0;">';
                continue;
            }
            
            // 无序列表
            if (trimmedLine.match(/^[\*\-\+]\s/)) {
                if (inList && listType !== 'ul') {
                    html += `</${listType}>`;
                    inList = false;
                }
                if (!inList) {
                    html += '<ul style="margin: 10px 0; padding-left: 25px;">';
                    inList = true;
                    listType = 'ul';
                }
                const listItem = trimmedLine.substring(2);
                html += `<li style="margin: 5px 0;">${processInlineMarkdown(listItem)}</li>`;
                continue;
            }
            
            // 有序列表
            if (trimmedLine.match(/^\d+\.\s/)) {
                if (inList && listType !== 'ol') {
                    html += `</${listType}>`;
                    inList = false;
                }
                if (!inList) {
                    html += '<ol style="margin: 10px 0; padding-left: 25px;">';
                    inList = true;
                    listType = 'ol';
                }
                const listItem = trimmedLine.replace(/^\d+\.\s/, '');
                html += `<li style="margin: 5px 0;">${processInlineMarkdown(listItem)}</li>`;
                continue;
            }
            
            // 列表结束
            if (inList && !trimmedLine) {
                html += `</${listType}>`;
                inList = false;
                listType = null;
            }
            
            // 引用
            if (trimmedLine.startsWith('> ')) {
                if (inList) { html += `</${listType}>`; inList = false; listType = null; }
                html += `<blockquote style="border-left: 3px solid #007acc; padding-left: 15px; margin: 10px 0; color: #858585; font-style: italic;">${processInlineMarkdown(trimmedLine.substring(2))}</blockquote>`;
                continue;
            }
            
            // 普通段落
            if (trimmedLine) {
                if (inList) { html += `</${listType}>`; inList = false; listType = null; }
                html += `<p style="margin: 8px 0;">${processInlineMarkdown(trimmedLine)}</p>`;
            } else if (!inList) {
                html += '<br>';
            }
        }
        
        if (inList) {
            html += `</${listType}>`;
        }
        
        html += '</div>';
        return html;
    }
    
    // 处理行内Markdown（粗体、斜体、代码、链接）
    function processInlineMarkdown(text) {
        if (!text) return '';
        
        // 先转义HTML，防止XSS
        text = escapeHtml(text);
        
        // 代码（使用不同的转义策略）
        text = text.replace(/`([^`]+)`/g, (match, code) => {
            return `<code style="background: #252526; padding: 2px 6px; border-radius: 3px; color: #CE9178; font-family: monospace;">${code}</code>`;
        });
        
        // 粗体
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight: bold; color: #ffffff;">$1</strong>');
        text = text.replace(/__([^_]+)__/g, '<strong style="font-weight: bold; color: #ffffff;">$1</strong>');
        
        // 斜体（避免与粗体冲突）
        text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em style="font-style: italic;">$1</em>');
        text = text.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em style="font-style: italic;">$1</em>');
        
        // 链接
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #4EC9B0; text-decoration: none; border-bottom: 1px solid #4EC9B0;">$1</a>');
        
        return text;
    }

    class TerminalInstance {
        constructor(tabId, outputEl, promptEl, cmdEl, terminalElement = null, pid = null){
            this.tabId = tabId;
            this.outputEl = outputEl;
            this.promptEl = promptEl;
            this.cmdEl = cmdEl;
            this.terminalElement = terminalElement; // 保存终端容器元素引用
            this.pid = pid;  // 存储进程ID，用于标记DOM元素
            this.isActive = false;
            
            this.env = {
                user: 'root',
                host: 'test',
                cwd: '~',
            };

            // 更新工作环境（在加载内存数据后，_loadTerminalDataFromMemory 会处理）

            // 可配置项（可由外部修改）
            this.config = {
                fontFamily: "'DejaVu Sans Mono', 'Hack', monospace",
                fontSize: 16,
                resizable: true,
                minWidth: 580,
                minHeight: 340,
                maxWidth: null, // null 表示根据视口计算
                maxHeight: null,
                scrollbarStyle: 'overlay', // 'overlay' or 'native'
                promptTemplate: '\\u@\\h:\\w', // simple PS1-like template
            };

            // newest on top flag (Kali uses newest at bottom)
            this.newestOnTop = false;

            // 命令历史 - 现在存储在 Exploit 内存中
            // this.history 和 this.historyIndex 将通过 getter/setter 访问内存

            // 事件监听器 map: eventName -> [fn]
            this._listeners = new Map();
            
            // 标记是否已注册命令处理器
            this._commandHandlerRegistered = false;

            // 向后兼容：可被外部替换的命令处理器（仍然保留）
            // 推荐使用事件监听：Terminal.on('command', handler)
            this.commandHandler = this._defaultHandler.bind(this);
            // 用于 Tab 补全的已知命令列表（可由外部修改）
            this._completionCommands = ['clear','pwd','whoami','echo','demo','toggleview','cd','markdir','markfile','ls','tree','cat','write','rm','ps','kill','help','check','diskmanger','vim','rename','mv','copy','paste','power','exit','login','su','users'];
            
            // CLI程序补全缓存（从ApplicationAssetManager获取）
            this._cliProgramsCache = null;
            this._cliProgramsCacheTime = 0;
            this._cliProgramsCacheTTL = 5000; // 缓存5秒
            
            // 剪贴板现在存储在 Exploit 内存中（PID 10000）
            
            // Vim模式标记
            this._vimMode = false;
            this._vimInstance = null;
            // completion 状态：{ visible, candidates, index, beforeText, dirPart } - 现在存储在 Exploit 内存中
            
            // 从内存初始化终端数据
            this._loadTerminalDataFromMemory();
            
            // 同步用户控制系统的当前用户
            (async () => {
                try {
                    if (typeof UserControl !== 'undefined') {
                        await UserControl.ensureInitialized();
                        const currentUser = UserControl.getCurrentUser();
                        if (currentUser && currentUser !== this.env.user) {
                            this.env.user = currentUser;
                            this.setUser(currentUser);
                        } else if (this.env.user && !currentUser) {
                            // 如果用户控制系统没有当前用户，使用终端的用户
                            await UserControl.login(this.env.user);
                        }
                    }
                } catch (e) {
                    // 如果初始化失败，至少确保终端有默认用户
                    if (!this.env.user) {
                        this.env.user = 'root';
                        this.setUser('root');
                    }
                    // 忽略错误，不影响终端初始化
                    KernelLogger.debug("Terminal", `同步用户控制系统失败: ${e.message}`);
                }
            })();
            
            // 为了保持向后兼容，创建 history 的 getter/setter
            // 这些方法会将数据存储在 Exploit 内存中

            // 初始化 UI
            this._updatePrompt();
            this._bindEvents();
            // 初始化控制点绑定与拖拽（每个实例都需要绑定自己的窗口控制）
            this._bindWindowControls();
            this._bindResizer();
            
            // 显示欢迎词（仅在第一个标签页时显示）
            // tabId格式为: tab-${pid}-${counter} 或 tab-${counter}
            // 第一个标签页的counter是1，所以检查tabId是否以"-1"结尾或以"tab-1"开头
            const isFirstTab = tabId.endsWith('-1') || tabId === 'tab-1' || /^tab-\d+-1$/.test(tabId);
            if (isFirstTab) {
                setTimeout(() => {
                    this._showWelcomeMessage();
                }, 100);
            }
        }
        
        // 显示欢迎消息（纯文本版本信息）
        _showWelcomeMessage() {
            // 获取终端程序信息
            let terminalInfo = null;
            if (typeof TERMINAL !== 'undefined' && typeof TERMINAL.__info__ === 'function') {
                try {
                    terminalInfo = TERMINAL.__info__();
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 默认信息
            const version = terminalInfo?.version || '1.0.0';
            const description = terminalInfo?.description || 'ZerOS Bash风格终端';
            const author = terminalInfo?.author || 'ZerOS Team';
            const copyright = terminalInfo?.copyright || '© 2025 ZerOS';
            
            // 简单的纯文本欢迎信息
            const welcomeText = [
                `ZerOS Terminal ${version}`,
                description,
                `${author} - ${copyright}`,
                '',
                'Type "help" for command list.'
            ];
            
            welcomeText.forEach(line => {
                this.write(line);
            });
        }
        
        _setActive(active) {
            const wasActive = this.isActive;
            this.isActive = active;
            
            if (active) {
                // 获取bash-window元素
                const bashWindow = this.terminalElement ? this.terminalElement.closest('.bash-window') : null;
                
                // 移除所有其他窗口的焦点状态
                if (bashWindow) {
                    // 找到所有bash-window，移除它们的focused类
                    const allWindows = document.querySelectorAll('.bash-window');
                    allWindows.forEach(win => {
                        if (win !== bashWindow) {
                            win.classList.remove('focused');
                        }
                    });
                    
                    // 为当前窗口添加focused类
                    bashWindow.classList.add('focused');
                }
                
                // 更新终端元素的 active 类
                if (this.terminalElement) {
                    this.terminalElement.classList.add('active');
                }
                
                // 延迟获取焦点，确保 DOM 已更新且元素可见
                requestAnimationFrame(() => {
                    if (this.isActive && this.terminalElement && this.terminalElement.classList.contains('active')) {
                        // 再次延迟，确保 CSS 过渡完成
                        setTimeout(() => {
                            if (this.isActive && !this.busy) {
                                // 确保输入框可见且可聚焦
                                if (this.cmdEl && this.cmdEl.offsetParent !== null) {
                                    this.focus();
                                } else {
                                    // 如果不可见，再延迟一次
                                    setTimeout(() => {
                                        if (this.isActive && !this.busy && this.cmdEl && this.cmdEl.offsetParent !== null) {
                                            this.focus();
                                        }
                                    }, 100);
                                }
                            }
                        }, 50);
                    }
                });
            } else {
                // 获取bash-window元素
                const bashWindow = this.terminalElement ? this.terminalElement.closest('.bash-window') : null;
                
                // 移除焦点状态
                if (bashWindow) {
                    bashWindow.classList.remove('focused');
                }
                
                // 更新终端元素的 active 类
                if (this.terminalElement) {
                    this.terminalElement.classList.remove('active');
                }
                
                // 失去焦点时，移除焦点
                this.blur();
            }
        }

        _updatePrompt(){
            // Kali style: root prompt ends with '#', 管理员也使用 '#'
            // 检查用户级别（如果 UserControl 可用）
            let isAdmin = false;
            if (typeof UserControl !== 'undefined' && this.env.user) {
                try {
                    const userLevel = UserControl.getCurrentUserLevel();
                    isAdmin = userLevel === UserControl.USER_LEVEL.ADMIN || 
                             userLevel === UserControl.USER_LEVEL.DEFAULT_ADMIN;
                } catch (e) {
                    // 忽略错误，使用默认逻辑
                }
            }
            const suffix = (this.env.user === 'root' || isAdmin) ? '#' : '$';
            // support simple promptTemplate \u= user, \h=host, \w=cwd
            let tmpl = this.config && this.config.promptTemplate ? this.config.promptTemplate : '\\u@\\h:\\w';
            tmpl = tmpl.replace('\\u', this.env.user || 'root').replace('\\h', this.env.host || 'test').replace('\\w', this.env.cwd || '~');
            this.promptEl.textContent = tmpl + suffix;
        }

        _bindEvents(){
            // 使用 EventManager 注册事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                // 将焦点放到可编辑元素
                const cmdElId = `terminal-cmd-el-${this.tabId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                this.cmdEl.dataset.eventId = cmdElId;
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (this.cmdEl === e.target || this.cmdEl.contains(e.target)) {
                        e.stopPropagation();
                        // 如果点击的是非活动标签页，先切换到该标签页
                        if (!this.isActive) {
                            if (typeof tabManager !== 'undefined' && tabManager) {
                                tabManager.switchTab(this.tabId);
                                return;
                            }
                        }
                        // 如果是活动标签页，直接获取焦点
                        this.focus();
                    }
                }, {
                    priority: 100,
                    selector: `[data-event-id="${cmdElId}"]`
                });
                
                // 监听焦点事件（使用 registerElementEvent）
                EventManager.registerElementEvent(this.pid, this.cmdEl, 'focus', () => {
                    this.cmdEl.classList.add('focused');
                });
                EventManager.registerElementEvent(this.pid, this.cmdEl, 'blur', () => {
                    this.cmdEl.classList.remove('focused');
                });
            } else {
                // 降级方案
                // 将焦点放到可编辑元素
                this.cmdEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!this.isActive) {
                        if (typeof tabManager !== 'undefined' && tabManager) {
                            tabManager.switchTab(this.tabId);
                            return;
                        }
                    }
                    this.focus();
                });
                
                // 监听焦点事件
                this.cmdEl.addEventListener('focus', () => {
                    this.cmdEl.classList.add('focused');
                });
                this.cmdEl.addEventListener('blur', () => {
                    this.cmdEl.classList.remove('focused');
                });
            }
            
            // 当终端实例变为可见时，如果是活动标签页，自动获取焦点
            if (this.terminalElement) {
                const observer = new MutationObserver(() => {
                    if (this.isActive && this.terminalElement && this.terminalElement.classList.contains('active')) {
                        // 延迟获取焦点，确保动画完成
                        setTimeout(() => {
                            if (this.isActive && document.activeElement !== this.cmdEl && !this.busy) {
                                this.focus();
                            }
                        }, 100);
                    }
                });
                
                // 观察终端实例的 class 变化
                observer.observe(this.terminalElement, {
                    attributes: true,
                    attributeFilter: ['class']
                });
            }
            
            // 添加全局点击事件，点击终端窗口时聚焦到活动标签页
            // 为每个实例注册（支持多实例）
            const bashWindow = this.terminalElement ? this.terminalElement.closest('.bash-window') : null;
            
            // 为bash-window添加点击事件（每个实例独立，使用 EventManager）
            if (bashWindow && !bashWindow._terminalClickHandlerRegistered) {
                bashWindow._terminalClickHandlerRegistered = true;
                if (typeof EventManager !== 'undefined' && this.pid) {
                    const bashWindowClickId = `terminal-bash-window-click-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    bashWindow.dataset.eventId = bashWindowClickId;
                    EventManager.registerEventHandler(this.pid, 'click', (e) => {
                        if (bashWindow === e.target || bashWindow.contains(e.target)) {
                            // 如果点击的不是输入框、按钮、链接、标签页或窗口控制按钮，聚焦到活动标签页
                            const target = e.target;
                            if (!target.closest('.cmd') && 
                                !target.closest('button') && 
                                !target.closest('a') &&
                                !target.closest('.dot') &&
                                !target.closest('.window-resizer') &&
                                !target.closest('.tab')) {
                                // 确保窗口获得焦点状态
                                const allWindows = document.querySelectorAll('.bash-window');
                                allWindows.forEach(win => {
                                    win.classList.remove('focused');
                                });
                                bashWindow.classList.add('focused');
                                
                                if (!this.isActive) {
                                    // 逻辑已在 cmdEl 的 click 事件中处理
                                }
                                
                                setTimeout(() => {
                                    if (this.isActive && !this.busy) {
                                        this.focus();
                                    }
                                }, 50);
                            }
                        }
                    }, {
                        priority: 100,
                        selector: `[data-event-id="${bashWindowClickId}"]`,
                        useCapture: true
                    });
                } else {
                    // 降级方案
                    bashWindow.addEventListener('click', (e) => {
                        const target = e.target;
                        if (!target.closest('.cmd') && 
                            !target.closest('button') && 
                            !target.closest('a') &&
                            !target.closest('.dot') &&
                            !target.closest('.window-resizer') &&
                            !target.closest('.tab')) {
                            const allWindows = document.querySelectorAll('.bash-window');
                            allWindows.forEach(win => {
                                win.classList.remove('focused');
                            });
                            bashWindow.classList.add('focused');
                            
                            if (!this.isActive) {
                                // 逻辑已在 cmdEl 的 click 事件中处理
                            }
                            
                            setTimeout(() => {
                                if (this.isActive && !this.busy) {
                                    this.focus();
                                }
                            }, 50);
                        }
                    }, true);
                }
            }
            
            // 监听窗口焦点事件（当浏览器窗口重新获得焦点时）
            // 使用 EventManager 注册窗口焦点事件（全局只注册一次）
            if (!window._terminalWindowFocusHandler && typeof EventManager !== 'undefined') {
                const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
                window._terminalWindowFocusHandler = EventManager.registerEventHandler(exploitPid, 'focus', () => {
                    // 延迟检查，确保窗口完全获得焦点
                    setTimeout(() => {
                        const activeTerminal = tabManager ? tabManager.getActiveTerminal() : null;
                        if (activeTerminal && activeTerminal.isActive && !activeTerminal.busy) {
                            // 如果当前没有焦点在输入框上，自动聚焦
                            if (document.activeElement !== activeTerminal.cmdEl) {
                                activeTerminal.focus();
                            }
                        }
                    }, 100);
                }, {
                    priority: 100,
                    selector: null  // 监听 window 的 focus 事件
                });
            }

            // 使用 EventManager 注册键盘事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'keydown', (ev) => {
                    // 检查事件是否发生在 cmdEl 内
                    if (this.cmdEl !== ev.target && !this.cmdEl.contains(ev.target)) {
                        return;
                    }
                    
                    // 只在活动标签页时处理键盘事件
                    if (!this.isActive) return;
                    
                    // Vim模式：拦截所有键盘事件
                    if (this._vimMode && this._vimInstance) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        
                        // 清空输入框内容（防止显示输入的字符）
                        if (this.cmdEl && this.cmdEl.textContent) {
                            this.cmdEl.textContent = '';
                        }
                        
                        // 获取键盘按键信息
                        let key = ev.key;
                        const ctrlKey = ev.ctrlKey;
                        const shiftKey = ev.shiftKey;
                        
                        // 调试信息（仅在开发模式下）
                        if (this._vimInstance.mode === 1 && window._debugVim) { // MODE_INSERT
                            console.log(`Terminal: Vim Insert Mode - key: ${key}, ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`);
                        }
                        
                        // ev.key已经自动处理了Shift键组合
                        // 直接传递给vim处理
                        if (this._vimInstance && typeof this._vimInstance.handleKey === 'function') {
                            try {
                                this._vimInstance.handleKey(key, ctrlKey, shiftKey);
                            } catch (error) {
                                console.error('Terminal: Vim handleKey error:', error);
                            }
                        } else {
                            console.error('Terminal: _vimInstance.handleKey is not a function', this._vimInstance);
                        }
                        return;
                    }
                
                // 键盘快捷键支持
                if (ev.ctrlKey || ev.metaKey) {
                    // Ctrl+L 或 Cmd+L: 清屏
                    if (ev.key === 'l' || ev.key === 'L') {
                        ev.preventDefault();
                        this.clear();
                        this.focus();
                        return;
                    }
                    // Ctrl+C: 取消当前命令（如果正在执行）
                    if (ev.key === 'c' || ev.key === 'C') {
                        if (this.busy) {
                            ev.preventDefault();
                            this.cancelCurrent();
                            this.write('\n^C');
                            this.focus();
                            return;
                        }
                    }
                    // Ctrl+U: 清空当前输入
                    if (ev.key === 'u' || ev.key === 'U') {
                        ev.preventDefault();
                        this.cmdEl.textContent = '';
                        this.focus();
                        return;
                    }
                    // Ctrl+K: 删除光标到行尾
                    if (ev.key === 'k' || ev.key === 'K') {
                        ev.preventDefault();
                        const text = this.cmdEl.textContent;
                        const selection = window.getSelection();
                        if (selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            const startOffset = range.startOffset;
                            this.cmdEl.textContent = text.substring(0, startOffset);
                            this.focus();
                        }
                        return;
                    }
                    // Ctrl+A: 全选（移动到行首）
                    if (ev.key === 'a' || ev.key === 'A') {
                        ev.preventDefault();
                        const range = document.createRange();
                        range.selectNodeContents(this.cmdEl);
                        range.collapse(true); // 移动到开头
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                        return;
                    }
                    // Ctrl+E: 执行 exit 命令
                    if (ev.key === 'e' || ev.key === 'E') {
                        ev.preventDefault();
                        ev.stopPropagation();
                        // 执行 exit 命令
                        const payload = {
                            cmdString: 'exit',
                            args: ['exit'],
                            env: this.env,
                            write: this.write.bind(this),
                            done: () => {}
                        };
                        this._handleCommand(payload).catch((err) => {
                            this.write('Error while handling exit command: ' + (err && err.message ? err.message : String(err)));
                        });
                        return;
                    }
                }
                
                // 历史导航
                if(ev.key === 'ArrowUp'){
                    ev.preventDefault();
                    if(this.history.length === 0) return;
                    if(this.historyIndex === -1) this.historyIndex = this.history.length - 1;
                    else this.historyIndex = Math.max(0, this.historyIndex - 1);
                    this.cmdEl.textContent = this.history[this.historyIndex] || '';
                    this.focus();
                    return;
                }
                if(ev.key === 'ArrowDown'){
                    ev.preventDefault();
                    if(this.history.length === 0) return;
                    if(this.historyIndex === -1) return;
                    this.historyIndex = this.historyIndex + 1;
                    if(this.historyIndex >= this.history.length){
                        this.historyIndex = -1;
                        this.cmdEl.textContent = '';
                    }else{
                        this.cmdEl.textContent = this.history[this.historyIndex] || '';
                    }
                    this.focus();
                    return;
                }

                if(ev.key === 'Enter'){
                    ev.preventDefault();
                    // 只在活动标签页处理 Enter 键
                    if (!this.isActive) return;
                    
                    if(this.busy){
                        this.write('Previous command still running - please wait...');
                        return;
                    }
                    const raw = this.cmdEl.textContent.replace(/\u00A0/g,' ');
                    const input = raw.replace(/\n/g,'').trim();
                    // 如果输入非空，加入历史
                    if(input){
                        const hist = this.history;
                        hist.push(input);
                        this.history = hist; // 触发保存
                    }
                    this.historyIndex = -1;
                    // 回显
                    this._echoCommand(input);
                    // 清空输入
                    this.cmdEl.textContent = '';
                    // 标记为忙，禁止输入
                    this._setBusy(true);
                    // 处理命令（事件驱动或向后兼容 handler），支持异步 Promise
                    const payload = {
                        cmdString: input,
                        args: this._argsFrom(input),
                        env: this.env,
                        write: this.write.bind(this),
                        done: () => {}
                    };
                    this._handleCommand(payload).then(() => {
                        this._setBusy(false);
                    }).catch((err) => {
                        this.write('Error while handling command: ' + (err && err.message ? err.message : String(err)));
                        this._setBusy(false);
                    });
                }
                // Ctrl shortcuts
                if(ev.ctrlKey && ev.key === 'c'){
                    ev.preventDefault();
                    // cancel
                    this.cancelCurrent();
                    return;
                }
                if(ev.ctrlKey && ev.key === 'l'){
                    ev.preventDefault();
                    this.clear();
                    return;
                }
                if(ev.ctrlKey && ev.key === 'd'){
                    ev.preventDefault();
                    // emulate EOF: if input empty, maybe close; here just write message
                    const raw = this.cmdEl.textContent.replace(/\u00A0/g,' ');
                    const input = raw.replace(/\n/g,'').trim();
                    if(!input) this.write('logout');
                    return;
                }
                // Tab 补全和候选选择支持
                if(ev.key === 'Tab'){
                    ev.preventDefault();
                    // 如果补全面板已经可见，Tab/Shift+Tab 在候选之间循环并更新输入
                    if(this._completionState && this._completionState.visible){
                        if(ev.shiftKey) this._moveCompletion(-1);
                        else this._moveCompletion(1);
                        const cand = this._completionState.candidates[this._completionState.index];
                        if(typeof cand !== 'undefined'){
                            const before = this._completionState.beforeText || '';
                            let newText = before;
                            if(newText.length && !/\s$/.test(newText)) newText += ' ';
                            newText += cand;
                            this.cmdEl.textContent = newText;
                            this._renderCompletions();
                            this.focus();
                        }
                        return;
                    }

                    const raw = this.cmdEl.textContent.replace(/\u00A0/g,' ').replace(/\n/g,'');
                    const m = raw.match(/(?:^|\s)(\S*)$/);
                    const token = (m && m[1]) ? m[1] : '';
                    const before = raw.slice(0, raw.length - token.length);
                    const isFirstToken = before.trim().length === 0;

                    // 异步获取候选（因为需要从 PHP 服务获取目录列表）
                    (async () => {
                        let candidates = [];
                        let dirPart = '';
                        try{
                            if(isFirstToken){
                                // 从内置命令列表获取候选
                                candidates = this._completionCommands.filter(c => c.indexOf(token) === 0);
                                
                                // 从ApplicationAssetManager获取所有程序（包括CLI和GUI）并添加到候选列表
                                try {
                                    let AssetManager = null;
                                    if (typeof ApplicationAssetManager !== 'undefined') {
                                        AssetManager = ApplicationAssetManager;
                                    } else if (typeof safePoolGet === 'function') {
                                        AssetManager = safePoolGet('KERNEL_GLOBAL_POOL', 'ApplicationAssetManager');
                                    } else if (typeof safeGetPool === 'function') {
                                        const pool = safeGetPool();
                                        if (pool && typeof pool.__GET__ === 'function') {
                                            AssetManager = pool.__GET__('KERNEL_GLOBAL_POOL', 'ApplicationAssetManager');
                                        }
                                    }
                                    
                                    if (AssetManager && typeof AssetManager.listPrograms === 'function') {
                                        const allPrograms = AssetManager.listPrograms();
                                        
                                        // 过滤匹配token的所有程序（包括CLI和GUI）
                                        const matchingPrograms = allPrograms.filter(p => {
                                            // 检查程序名是否匹配token（不区分大小写）
                                            const programNameLower = p.toLowerCase();
                                            const tokenLower = token.toLowerCase();
                                            if (programNameLower.indexOf(tokenLower) !== 0) return false;
                                            
                                            // 对于terminal程序，总是包含（即使它是GUI程序）
                                            if (programNameLower === 'terminal') return true;
                                            
                                            // 对于其他程序，检查是否为CLI程序
                                            try {
                                                const programInfo = AssetManager.getProgramInfo(p);
                                                if (programInfo) {
                                                    // 检查metadata中的type
                                                    if (programInfo.metadata && programInfo.metadata.type === 'CLI') {
                                                        return true;
                                                    }
                                                    // 检查顶层type
                                                    if (programInfo.type === 'CLI') {
                                                        return true;
                                                    }
                                                }
                                                
                                                // 如果ApplicationAssetManager没有类型信息，尝试从程序对象获取
                                                const programNameUpper = p.toUpperCase();
                                                let programClass = null;
                                                if (typeof window !== 'undefined' && window[programNameUpper]) {
                                                    programClass = window[programNameUpper];
                                                } else if (typeof globalThis !== 'undefined' && globalThis[programNameUpper]) {
                                                    programClass = globalThis[programNameUpper];
                                                }
                                                
                                                if (programClass && typeof programClass.__info__ === 'function') {
                                                    try {
                                                        const info = programClass.__info__();
                                                        if (info && (info.type === 'CLI' || (info.metadata && info.metadata.type === 'CLI'))) {
                                                            return true;
                                                        }
                                                    } catch (e) {
                                                        // 忽略错误
                                                    }
                                                }
                                            } catch (e) {
                                                // 忽略单个程序的错误
                                            }
                                            
                                            return false;
                                        });
                                        
                                        // 合并到候选列表（去重）
                                        const existingSet = new Set(candidates);
                                        matchingPrograms.forEach(p => {
                                            if (!existingSet.has(p)) {
                                                candidates.push(p);
                                                existingSet.add(p);
                                            }
                                        });
                                        
                                        // 按字母顺序排序
                                        candidates.sort();
                                    }
                                } catch (e) {
                                    // 如果获取程序失败，忽略错误，继续使用内置命令列表
                                    console.warn('Terminal: Failed to get programs for completion:', e);
                                }
                            }else{
                                // 异步从 PHP 服务获取目录列表
                                const idx = token.lastIndexOf('/');
                                dirPart = idx >= 0 ? token.slice(0, idx + 1) : '';
                                const namePrefix = idx >= 0 ? token.slice(idx + 1) : token;
                                const dirToList = resolvePath(this.env.cwd, dirPart || '.');
                                
                                // 确保路径格式正确
                                let phpPath = dirToList;
                                if (/^[CD]:$/.test(phpPath)) {
                                    phpPath = phpPath + '/';
                                }
                                
                                // 从 PHP 服务获取目录列表
                                const url = new URL('/system/service/FSDirve.php', window.location.origin);
                                url.searchParams.set('action', 'list_dir');
                                url.searchParams.set('path', phpPath);
                                
                                try {
                                    const response = await fetch(url.toString());
                                    if (response.ok) {
                                        const result = await response.json();
                                        if (result.status === 'success' && result.data && result.data.items) {
                                            const items = result.data.items;
                                            const nodes = items.filter(item => item.type === 'directory').map(item => item.name + '/');
                                            const files = items.filter(item => item.type === 'file').map(item => item.name);
                                            candidates = nodes.concat(files).filter(n => n.indexOf(namePrefix) === 0).map(n => dirPart + n);
                                        }
                                    }
                                } catch (e) {
                                    candidates = [];
                                }
                            }
                        }catch(e){ candidates = []; }

                        if(candidates.length === 0){
                            // 清除任何已显示的面板
                            this._clearCompletions();
                            return;
                        }

                        if(candidates.length === 1){
                            // 单候选：直接替换输入
                            const completion = candidates[0];
                            let newText = before;
                            if(newText.length && !/\s$/.test(newText)) newText += ' ';
                            newText += completion;
                            this.cmdEl.textContent = newText;
                            this.focus();
                            this._clearCompletions();
                            return;
                        }

                        // 多候选：显示面板并进入选择模式
                        this._showCompletions(candidates, before, dirPart);
                    })();
                    return;
                }

                // 在候选面板可见时，拦截上下/Enter/Escape
                if(this._completionState.visible){
                    if(ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Enter' || ev.key === 'Escape'){
                        ev.preventDefault();
                        // 处理选择导航
                        if(ev.key === 'ArrowDown'){
                            this._moveCompletion(1);
                        }else if(ev.key === 'ArrowUp'){
                            this._moveCompletion(-1);
                        }else if(ev.key === 'Enter'){
                            this._acceptCompletion();
                        }else if(ev.key === 'Escape'){
                            this._clearCompletions();
                        }
                        return;
                    }
                    // 若用户继续输入其他字符，则关闭面板
                    // Allow normal typing to proceed — but clear completions
                    if(ev.key.length === 1 || ev.key === 'Backspace' || ev.key === 'Delete'){ this._clearCompletions(); }
                }
                // Allow simple navigation keys normally (no extra features)
                }, {
                    priority: 100,
                    selector: null  // 全局键盘事件
                });
            } else {
                // 降级方案：使用原生 addEventListener
                // 注意：降级方案需要包含完整的键盘事件处理逻辑
                // 为了代码简洁，这里直接使用原有的 addEventListener
                // 如果 EventManager 不可用，终端仍可正常工作
                this.cmdEl.addEventListener('keydown', (ev) => {
                    // 只在活动标签页时处理键盘事件
                    if (!this.isActive) return;
                    
                    // Vim模式：拦截所有键盘事件
                    if (this._vimMode && this._vimInstance) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        
                        // 清空输入框内容（防止显示输入的字符）
                        if (this.cmdEl && this.cmdEl.textContent) {
                            this.cmdEl.textContent = '';
                        }
                        
                        // 获取键盘按键信息
                        let key = ev.key;
                        const ctrlKey = ev.ctrlKey;
                        const shiftKey = ev.shiftKey;
                        
                        // 调试信息
                        if (this._vimInstance.mode === 1) { // MODE_INSERT
                            console.log(`Terminal: Vim Insert Mode - key: ${key}, ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}`);
                        }
                        
                        // ev.key已经自动处理了Shift键组合
                        // 直接传递给vim处理
                        if (this._vimInstance && typeof this._vimInstance.handleKey === 'function') {
                            this._vimInstance.handleKey(key, ctrlKey, shiftKey);
                        } else {
                            console.error('Terminal: _vimInstance.handleKey is not a function', this._vimInstance);
                        }
                        return;
                    }
                    
                    // 键盘快捷键支持
                    if (ev.ctrlKey || ev.metaKey) {
                        // Ctrl+L 或 Cmd+L: 清屏
                        if (ev.key === 'l' || ev.key === 'L') {
                            ev.preventDefault();
                            this.clear();
                            this.focus();
                            return;
                        }
                        // Ctrl+C: 取消当前命令（如果正在执行）
                        if (ev.key === 'c' || ev.key === 'C') {
                            if (this.busy) {
                                ev.preventDefault();
                                this.cancelCurrent();
                                this.write('\n^C');
                                this.focus();
                                return;
                            }
                        }
                        // Ctrl+U: 清空当前输入
                        if (ev.key === 'u' || ev.key === 'U') {
                            ev.preventDefault();
                            this.cmdEl.textContent = '';
                            this.focus();
                            return;
                        }
                        // Ctrl+K: 删除光标到行尾
                        if (ev.key === 'k' || ev.key === 'K') {
                            ev.preventDefault();
                            const text = this.cmdEl.textContent;
                            const selection = window.getSelection();
                            if (selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                const startOffset = range.startOffset;
                                this.cmdEl.textContent = text.substring(0, startOffset);
                                this.focus();
                            }
                            return;
                        }
                        // Ctrl+A: 全选（移动到行首）
                        if (ev.key === 'a' || ev.key === 'A') {
                            ev.preventDefault();
                            const range = document.createRange();
                            range.selectNodeContents(this.cmdEl);
                            range.collapse(true); // 移动到开头
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                            return;
                        }
                        // Ctrl+E: 执行 exit 命令
                        if (ev.key === 'e' || ev.key === 'E') {
                            ev.preventDefault();
                            ev.stopPropagation();
                            // 执行 exit 命令
                            const payload = {
                                cmdString: 'exit',
                                args: ['exit'],
                                env: this.env,
                                write: this.write.bind(this),
                                done: () => {}
                            };
                            this._handleCommand(payload).catch((err) => {
                                this.write('Error while handling exit command: ' + (err && err.message ? err.message : String(err)));
                            });
                            return;
                        }
                    }
                    
                    // 历史导航
                    if(ev.key === 'ArrowUp'){
                        ev.preventDefault();
                        if(this.history.length === 0) return;
                        if(this.historyIndex === -1) this.historyIndex = this.history.length - 1;
                        else this.historyIndex = Math.max(0, this.historyIndex - 1);
                        this.cmdEl.textContent = this.history[this.historyIndex] || '';
                        this.focus();
                        return;
                    }
                    if(ev.key === 'ArrowDown'){
                        ev.preventDefault();
                        if(this.history.length === 0) return;
                        if(this.historyIndex === -1) return;
                        this.historyIndex = this.historyIndex + 1;
                        if(this.historyIndex >= this.history.length){
                            this.historyIndex = -1;
                            this.cmdEl.textContent = '';
                        }else{
                            this.cmdEl.textContent = this.history[this.historyIndex] || '';
                        }
                        this.focus();
                        return;
                    }

                    if(ev.key === 'Enter'){
                        ev.preventDefault();
                        // 只在活动标签页处理 Enter 键
                        if (!this.isActive) return;
                        
                        if(this.busy){
                            this.write('Previous command still running - please wait...');
                            return;
                        }
                        const raw = this.cmdEl.textContent.replace(/\u00A0/g,' ');
                        const input = raw.replace(/\n/g,'').trim();
                        // 如果输入非空，加入历史
                        if(input){
                            const hist = this.history;
                            hist.push(input);
                            this.history = hist; // 触发保存
                        }
                        this.historyIndex = -1;
                        // 回显
                        this._echoCommand(input);
                        // 清空输入
                        this.cmdEl.textContent = '';
                        // 标记为忙，禁止输入
                        this._setBusy(true);
                        // 处理命令（事件驱动或向后兼容 handler），支持异步 Promise
                        const payload = {
                            cmdString: input,
                            args: this._argsFrom(input),
                            env: this.env,
                            write: this.write.bind(this),
                            done: () => {}
                        };
                        this._handleCommand(payload).then(() => {
                            this._setBusy(false);
                        }).catch((err) => {
                            this.write('Error while handling command: ' + (err && err.message ? err.message : String(err)));
                            this._setBusy(false);
                        });
                    }
                    // Ctrl shortcuts
                    if(ev.ctrlKey && ev.key === 'c'){
                        ev.preventDefault();
                        // cancel
                        this.cancelCurrent();
                        return;
                    }
                    if(ev.ctrlKey && ev.key === 'l'){
                        ev.preventDefault();
                        this.clear();
                        return;
                    }
                    if(ev.ctrlKey && ev.key === 'd'){
                        ev.preventDefault();
                        // emulate EOF: if input empty, maybe close; here just write message
                        const raw = this.cmdEl.textContent.replace(/\u00A0/g,' ');
                        const input = raw.replace(/\n/g,'').trim();
                        if(!input) this.write('logout');
                        return;
                    }
                    // Tab 补全和候选选择支持（简化版本，完整逻辑在 EventManager 版本中）
                    if(ev.key === 'Tab'){
                        ev.preventDefault();
                        // 如果补全面板已经可见，Tab/Shift+Tab 在候选之间循环并更新输入
                        if(this._completionState && this._completionState.visible){
                            if(ev.shiftKey) this._moveCompletion(-1);
                            else this._moveCompletion(1);
                            const cand = this._completionState.candidates[this._completionState.index];
                            if(typeof cand !== 'undefined'){
                                const before = this._completionState.beforeText || '';
                                let newText = before;
                                if(newText.length && !/\s$/.test(newText)) newText += ' ';
                                newText += cand;
                                this.cmdEl.textContent = newText;
                                this._renderCompletions();
                                this.focus();
                            }
                            return;
                        }
                        // 简化版 Tab 补全（完整逻辑在 EventManager 版本中）
                        // 这里只处理基本的补全逻辑
                        const raw = this.cmdEl.textContent.replace(/\u00A0/g,' ').replace(/\n/g,'');
                        const m = raw.match(/(?:^|\s)(\S*)$/);
                        const token = (m && m[1]) ? m[1] : '';
                        const before = raw.slice(0, raw.length - token.length);
                        const isFirstToken = before.trim().length === 0;

                        // 异步获取候选（简化版）
                        (async () => {
                            let candidates = [];
                            try{
                                if(isFirstToken){
                                    // 从内置命令列表获取候选
                                    candidates = this._completionCommands.filter(c => c.indexOf(token) === 0);
                                }else{
                                    // 文件路径补全（简化版，使用 FileSystem.list）
                                    const idx = token.lastIndexOf('/');
                                    const dirPart = idx >= 0 ? token.slice(0, idx + 1) : '';
                                    const namePrefix = idx >= 0 ? token.slice(idx + 1) : token;
                                    const dirToList = resolvePath(this.env.cwd, dirPart || '.');
                                    
                                    let phpPath = dirToList;
                                    if (/^[CD]:$/.test(phpPath)) {
                                        phpPath = phpPath + '/';
                                    }
                                    
                                    const url = new URL('/system/service/FSDirve.php', window.location.origin);
                                    url.searchParams.set('action', 'list_dir');
                                    url.searchParams.set('path', phpPath);
                                    
                                    try {
                                        const response = await fetch(url.toString());
                                        if (response.ok) {
                                            const result = await response.json();
                                            if (result.status === 'success' && result.data && result.data.items) {
                                                const items = result.data.items;
                                                const nodes = items.filter(item => item.type === 'directory').map(item => item.name + '/');
                                                const files = items.filter(item => item.type === 'file').map(item => item.name);
                                                candidates = nodes.concat(files).filter(n => n.indexOf(namePrefix) === 0).map(n => dirPart + n);
                                            }
                                        }
                                    } catch (e) {
                                        candidates = [];
                                    }
                                }
                            }catch(e){ candidates = []; }

                            if(candidates.length === 0){
                                this._clearCompletions();
                                return;
                            }

                            if(candidates.length === 1){
                                const completion = candidates[0];
                                let newText = before;
                                if(newText.length && !/\s$/.test(newText)) newText += ' ';
                                newText += completion;
                                this.cmdEl.textContent = newText;
                                this.focus();
                                this._clearCompletions();
                                return;
                            }

                            this._showCompletions(candidates, before, '');
                        })();
                        return;
                    }

                    // 在候选面板可见时，拦截上下/Enter/Escape
                    if(this._completionState && this._completionState.visible){
                        if(ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Enter' || ev.key === 'Escape'){
                            ev.preventDefault();
                            if(ev.key === 'ArrowDown'){
                                this._moveCompletion(1);
                            }else if(ev.key === 'ArrowUp'){
                                this._moveCompletion(-1);
                            }else if(ev.key === 'Enter'){
                                this._acceptCompletion();
                            }else if(ev.key === 'Escape'){
                                this._clearCompletions();
                            }
                            return;
                        }
                        if(ev.key.length === 1 || ev.key === 'Backspace' || ev.key === 'Delete'){ 
                            this._clearCompletions(); 
                        }
                    }
                });
            }

            // 处理粘贴事件（使用 EventManager registerElementEvent，因为 paste 不冒泡）
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerElementEvent(this.pid, this.cmdEl, 'paste', async (ev) => {
                if (!this.isActive) return;
                
                // Vim模式：将粘贴内容传递给vim（插入模式下）
                if (this._vimMode && this._vimInstance) {
                    // 检查是否为插入模式（MODE_INSERT = 1）
                    if (this._vimInstance.mode === 1) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        
                        try {
                            const text = (ev.clipboardData || window.clipboardData).getData('text');
                            if (text) {
                                this._vimInstance._pasteText(text);
                            }
                        } catch (e) {
                            console.error('Vim: Failed to paste', e);
                        }
                        return;
                    }
                }
                
                // 普通模式：防止粘贴样式内容
                ev.preventDefault();
                const text = (ev.clipboardData || window.clipboardData).getData('text');
                document.execCommand('insertText', false, text);
                });
            } else {
                // 降级方案
                this.cmdEl.addEventListener('paste', async (ev) => {
                    if (!this.isActive) return;
                    
                    // Vim模式：将粘贴内容传递给vim（插入模式下）
                    if (this._vimMode && this._vimInstance) {
                        // 检查是否为插入模式（MODE_INSERT = 1）
                        if (this._vimInstance.mode === 1) {
                            ev.preventDefault();
                            ev.stopPropagation();
                            
                            try {
                                const text = (ev.clipboardData || window.clipboardData).getData('text');
                                if (text) {
                                    this._vimInstance._pasteText(text);
                                }
                            } catch (e) {
                                console.error('Vim: Failed to paste', e);
                            }
                            return;
                        }
                    }
                    
                    // 普通模式：防止粘贴样式内容
                    ev.preventDefault();
                    const text = (ev.clipboardData || window.clipboardData).getData('text');
                    document.execCommand('insertText', false, text);
                });
            }
            
            // 处理鼠标滚轮事件 - 在Vim模式下需要拦截，普通模式让浏览器自然滚动
            // 注意：wheel 事件需要 passive 选项以优化性能，因此保持使用原生 addEventListener
            // 使用 passive: true 以优化性能，在普通模式下不影响滚动
            this._wheelHandler = (ev) => {
                if (!this.isActive) return;
                
                // Vim模式：将滚轮事件传递给vim
                // 注意：在 passive: true 模式下无法阻止默认行为
                // 因此需要在Vim模式下动态切换监听器
                if (this._vimMode && this._vimInstance) {
                    this._vimInstance._handleWheel(ev);
                }
                
                // 普通模式：完全不做任何处理，让浏览器自然处理滚动
            };
            
            // 初始使用 passive: true 以优化性能，不影响普通模式下的滚动
            this.outputEl.addEventListener('wheel', this._wheelHandler, { passive: true });
            
            // 用于Vim模式的滚轮处理（需要阻止默认行为）
            this._wheelHandlerVim = (ev) => {
                if (!this.isActive) return;
                
                // Vim模式：将滚轮事件传递给vim并阻止默认滚动
                if (this._vimMode && this._vimInstance) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    this._vimInstance._handleWheel(ev);
                    return;
                }
            };
        }

        _bindWindowControls(){
            // 使用基于pid的选择器，确保每个实例绑定自己的窗口控制
            const pidSelector = this.pid ? `[data-pid="${this.pid}"]` : '';
            const bashWindow = this.terminalElement ? this.terminalElement.closest('.bash-window') : null;
            
            if (!bashWindow) {
                console.warn('Terminal: bash-window not found for window controls');
                return;
            }
            
            // 检查是否使用了 GUIManager（如果使用了，拖动和拉伸由 GUIManager 自动处理）
            let hasGUIManager = false;
            try {
                const pool = safeGetPool();
                if (pool && typeof pool.__GET__ === 'function') {
                    const guiMgr = pool.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");
                    hasGUIManager = (guiMgr && typeof guiMgr.registerWindow === 'function');
                }
            } catch (e) {
                // 忽略错误
            }
            if (!hasGUIManager && typeof window !== 'undefined' && window.GUIManager) {
                hasGUIManager = (typeof window.GUIManager.registerWindow === 'function');
            }
            
            // 查找该实例的窗口控制元素
            const closeDot = bashWindow.querySelector(`.dot.close${pidSelector}`);
            const minDot = bashWindow.querySelector(`.dot.minimize${pidSelector}`);
            const maxDot = bashWindow.querySelector(`.dot.maximize${pidSelector}`);
            const bar = bashWindow.querySelector(`.bar${pidSelector}`);
            const win = bashWindow;
            
            // 移除可能存在的旧事件监听器（通过克隆节点）
            if (closeDot && !closeDot._controlBound) {
                closeDot._controlBound = true;
                // 使用 EventManager 注册事件
                if (typeof EventManager !== 'undefined' && this.pid) {
                    const closeDotId = `terminal-close-dot-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    closeDot.dataset.eventId = closeDotId;
                    EventManager.registerEventHandler(this.pid, 'click', (e) => {
                        e.stopPropagation();
                        this.minimize();
                    }, {
                        priority: 100,
                        selector: `[data-event-id="${closeDotId}"]`
                    });
                } else {
                    // 降级方案
                    closeDot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.minimize();
                    });
                }
            }
            if (minDot && !minDot._controlBound) {
                minDot._controlBound = true;
                // 使用 EventManager 注册事件
                if (typeof EventManager !== 'undefined' && this.pid) {
                    const minDotId = `terminal-min-dot-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    minDot.dataset.eventId = minDotId;
                    EventManager.registerEventHandler(this.pid, 'click', (e) => {
                        e.stopPropagation();
                        this.centerOrRestore();
                    }, {
                        priority: 100,
                        selector: `[data-event-id="${minDotId}"]`
                    });
                } else {
                    // 降级方案
                    minDot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.centerOrRestore();
                    });
                }
            }
            if (maxDot && !maxDot._controlBound) {
                maxDot._controlBound = true;
                // maxDot 的事件已经在 TabManager 构造函数中绑定，这里不再重复绑定
            }

            // 拖拽实现（仅在较大屏幕启用，且未使用 GUIManager 时）
            // 如果使用了 GUIManager，拖动功能由 GUIManager 自动处理，这里跳过
            if (!hasGUIManager) {
                // 为每个实例创建独立的拖拽状态
                if (!this._dragState) {
                    this._dragState = {
                        dragging: false,
                        startX: 0,
                        startY: 0,
                        startLeft: 0,
                        startTop: 0,
                        containerLeft: 0,
                        containerTop: 0,
                        containerRight: 0,
                        containerBottom: 0
                    };
                }
                
                const dragState = this._dragState;
                function isSmall(){ return window.matchMedia('(max-width:760px)').matches; }
                
                if(bar && win && !bar._dragBound){
                bar._dragBound = true;
                // 使用 EventManager 注册拖动事件
                if (typeof EventManager !== 'undefined' && typeof EventManager.registerDrag === 'function' && this.pid) {
                    const windowId = `terminal-window-drag-${this.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    EventManager.registerDrag(
                        windowId,
                        bar,
                        win,
                        win._windowState,
                        // onDragStart
                        (ev) => {
                            // 如果点击的是控制按钮，不触发拖拽
                            if (ev.target.closest('.dot') || ev.target.closest('.controls')) {
                                return;
                            }
                            
                            if(isSmall()) return;
                            
                            // 检查窗口状态（全屏时不能拖拽）
                            const state = win._windowState;
                            if (state && state.isFullscreen) {
                                return;
                            }
                            
                            // 拖拽开始时，将窗口置于最上层
                            const allWindows = document.querySelectorAll('.bash-window');
                            allWindows.forEach(w => {
                                w.classList.remove('focused');
                            });
                            win.classList.add('focused');
                            
                            // 获取窗口当前的实际位置
                            const rect = win.getBoundingClientRect();
                            const computedStyle = window.getComputedStyle(win);
                            const currentLeft = computedStyle.left;
                            const currentTop = computedStyle.top;
                            const currentTransform = computedStyle.transform;
                            
                            // 如果窗口使用百分比定位（如 left: 50%, top: 50%），需要先转换为像素值
                            // 否则当移除 transform 时，窗口会突然跳到百分比位置
                            let actualLeft = rect.left;
                            let actualTop = rect.top;
                            
                            // 检查是否使用百分比定位
                            if (currentLeft.includes('%') || currentTop.includes('%')) {
                                // 使用 getBoundingClientRect() 获取的实际像素位置
                                actualLeft = rect.left;
                                actualTop = rect.top;
                            } else if (currentLeft && currentTop && currentLeft !== 'auto' && currentTop !== 'auto') {
                                // 如果已经有像素值，直接使用（但需要考虑 transform）
                                // 如果使用 transform 居中，getBoundingClientRect() 已经给出了实际位置
                                actualLeft = rect.left;
                                actualTop = rect.top;
                            } else {
                                // 默认使用 getBoundingClientRect() 的位置
                                actualLeft = rect.left;
                                actualTop = rect.top;
                            }
                            
                            // 保存拖动开始时的鼠标位置和窗口位置
                            dragState.dragging = true;
                            dragState.startX = ev.clientX;
                            dragState.startY = ev.clientY;
                            dragState.startLeft = actualLeft;
                            dragState.startTop = actualTop;
                            
                            // 获取容器边界（用于边界检查）
                            const guiContainer = document.getElementById('gui-container') || document.body;
                            const containerRect = guiContainer.getBoundingClientRect();
                            dragState.containerLeft = containerRect.left;
                            dragState.containerTop = containerRect.top;
                            dragState.containerRight = containerRect.right;
                            dragState.containerBottom = containerRect.bottom;
                            
                            bar.classList.add('dragging');
                            // make window floating
                            win.classList.add('floating');
                            // set explicit left/top so we can move (使用计算后的实际位置)
                            win.style.left = actualLeft + 'px';
                            win.style.top = actualTop + 'px';
                            win.style.transform = 'none';
                            win.style.position = 'fixed';
                            ev.preventDefault();
                            ev.stopPropagation();
                        },
                        // onDrag
                        (ev) => {
                            if(!dragState.dragging) return;
                            const dx = ev.clientX - dragState.startX;
                            const dy = ev.clientY - dragState.startY;
                            
                            // 计算新位置
                            let newLeft = dragState.startLeft + dx;
                            let newTop = dragState.startTop + dy;
                            
                            // 获取窗口尺寸
                            const winRect = win.getBoundingClientRect();
                            const winWidth = winRect.width;
                            const winHeight = winRect.height;
                            
                            // 边界检查：确保窗口左上角不超出容器范围
                            // 获取容器边界（如果拖动过程中容器位置改变，重新获取）
                            const guiContainer = document.getElementById('gui-container') || document.body;
                            const containerRect = guiContainer.getBoundingClientRect();
                            const containerLeft = containerRect.left;
                            const containerTop = containerRect.top;
                            const containerRight = containerRect.right;
                            const containerBottom = containerRect.bottom;
                            
                            // 限制左上角位置：不能小于容器左上角
                            newLeft = Math.max(containerLeft, newLeft);
                            newTop = Math.max(containerTop, newTop);
                            
                            // 限制右下角位置：窗口右下角不能超出容器右下角
                            // 即：newLeft + winWidth <= containerRight
                            //     newTop + winHeight <= containerBottom
                            newLeft = Math.min(newLeft, containerRight - winWidth);
                            newTop = Math.min(newTop, containerBottom - winHeight);
                            
                            // 应用新位置
                            win.style.left = newLeft + 'px';
                            win.style.top = newTop + 'px';
                        },
                        // onDragEnd
                        (ev) => {
                            if(!dragState.dragging) return;
                            dragState.dragging = false;
                            bar.classList.remove('dragging');
                        },
                        ['.dot', '.controls'] // 排除的选择器
                    );
                } else {
                    // 降级方案
                    bar.addEventListener('mousedown', (ev) => {
                        // 如果点击的是控制按钮，不触发拖拽
                        if (ev.target.closest('.dot') || ev.target.closest('.controls')) {
                            return;
                        }
                        
                        if(isSmall()) return;
                        
                        // 检查窗口状态（全屏时不能拖拽）
                        const state = win._windowState;
                        if (state && state.isFullscreen) {
                            return;
                        }
                        
                        // 拖拽开始时，将窗口置于最上层
                        const allWindows = document.querySelectorAll('.bash-window');
                        allWindows.forEach(w => {
                            w.classList.remove('focused');
                        });
                        win.classList.add('focused');
                        
                        // 获取窗口当前的实际位置
                        const rect = win.getBoundingClientRect();
                        const computedStyle = window.getComputedStyle(win);
                        const currentLeft = computedStyle.left;
                        const currentTop = computedStyle.top;
                        const currentTransform = computedStyle.transform;
                        
                        // 如果窗口使用百分比定位（如 left: 50%, top: 50%），需要先转换为像素值
                        // 否则当移除 transform 时，窗口会突然跳到百分比位置
                        let actualLeft = rect.left;
                        let actualTop = rect.top;
                        
                        // 检查是否使用百分比定位
                        if (currentLeft.includes('%') || currentTop.includes('%')) {
                            // 使用 getBoundingClientRect() 获取的实际像素位置
                            actualLeft = rect.left;
                            actualTop = rect.top;
                        } else if (currentLeft && currentTop && currentLeft !== 'auto' && currentTop !== 'auto') {
                            // 如果已经有像素值，直接使用（但需要考虑 transform）
                            // 如果使用 transform 居中，getBoundingClientRect() 已经给出了实际位置
                            actualLeft = rect.left;
                            actualTop = rect.top;
                        } else {
                            // 默认使用 getBoundingClientRect() 的位置
                            actualLeft = rect.left;
                            actualTop = rect.top;
                        }
                        
                        // 保存拖动开始时的鼠标位置和窗口位置
                        dragState.dragging = true;
                        dragState.startX = ev.clientX;
                        dragState.startY = ev.clientY;
                        dragState.startLeft = actualLeft;
                        dragState.startTop = actualTop;
                        
                        // 获取容器边界（用于边界检查）
                        const guiContainer = document.getElementById('gui-container') || document.body;
                        const containerRect = guiContainer.getBoundingClientRect();
                        dragState.containerLeft = containerRect.left;
                        dragState.containerTop = containerRect.top;
                        dragState.containerRight = containerRect.right;
                        dragState.containerBottom = containerRect.bottom;
                        
                        bar.classList.add('dragging');
                        // make window floating
                        win.classList.add('floating');
                        // set explicit left/top so we can move (使用计算后的实际位置)
                        win.style.left = actualLeft + 'px';
                        win.style.top = actualTop + 'px';
                        win.style.transform = 'none';
                        win.style.position = 'fixed';
                        ev.preventDefault();
                        ev.stopPropagation();
                    });
                    
                    // 使用命名空间事件，避免多个实例冲突
                    const mousemoveHandler = (ev) => {
                        if(!dragState.dragging) return;
                        const dx = ev.clientX - dragState.startX;
                        const dy = ev.clientY - dragState.startY;
                        
                        // 计算新位置
                        let newLeft = dragState.startLeft + dx;
                        let newTop = dragState.startTop + dy;
                        
                        // 获取窗口尺寸
                        const winRect = win.getBoundingClientRect();
                        const winWidth = winRect.width;
                        const winHeight = winRect.height;
                        
                        // 边界检查：确保窗口左上角不超出容器范围
                        // 获取容器边界（如果拖动过程中容器位置改变，重新获取）
                        const guiContainer = document.getElementById('gui-container') || document.body;
                        const containerRect = guiContainer.getBoundingClientRect();
                        const containerLeft = containerRect.left;
                        const containerTop = containerRect.top;
                        const containerRight = containerRect.right;
                        const containerBottom = containerRect.bottom;
                        
                        // 限制左上角位置：不能小于容器左上角
                        newLeft = Math.max(containerLeft, newLeft);
                        newTop = Math.max(containerTop, newTop);
                        
                        // 限制右下角位置：窗口右下角不能超出容器右下角
                        // 即：newLeft + winWidth <= containerRight
                        //     newTop + winHeight <= containerBottom
                        newLeft = Math.min(newLeft, containerRight - winWidth);
                        newTop = Math.min(newTop, containerBottom - winHeight);
                        
                        // 应用新位置
                        win.style.left = newLeft + 'px';
                        win.style.top = newTop + 'px';
                    };
                    
                    const mouseupHandler = (ev) => {
                        if(!dragState.dragging) return;
                        dragState.dragging = false;
                        bar.classList.remove('dragging');
                    };
                    
                    // 使用 EventManager 注册临时拖动事件
                    if (typeof EventManager !== 'undefined' && this.pid) {
                        const mousemoveHandlerId = EventManager.registerEventHandler(this.pid, 'mousemove', mousemoveHandler, {
                            priority: 50,
                            once: false
                        });
                        
                        const mouseupHandlerId = EventManager.registerEventHandler(this.pid, 'mouseup', mouseupHandler, {
                            priority: 50,
                            once: true
                        });
                        
                        // 存储事件处理器ID，以便后续清理
                        if (!this._dragEventHandlers) {
                            this._dragEventHandlers = [];
                        }
                        this._dragEventHandlers.push(mousemoveHandlerId, mouseupHandlerId);
                    } else {
                        // 降级：直接使用 addEventListener（不推荐）
                        document.addEventListener('mousemove', mousemoveHandler);
                        document.addEventListener('mouseup', mouseupHandler);
                    }
                }
            }
            } // 结束 if (!hasGUIManager) 块
        }

        // Window control APIs
        minimize(){
            const win = this.terminalElement ? this.terminalElement.closest('.bash-window') : null;
            if(!win) return;
            if(this.minimized){
                // restore
                win.style.display = '';
                this.minimized = false;
            }else{
                win.style.display = 'none';
                this.minimized = true;
            }
        }

        maximize(){
            const win = this.terminalElement ? this.terminalElement.closest('.bash-window') : null;
            if(!win) return;
            const isMax = !!this._maximized;
            if(isMax){
                // restore
                if(this._prevRect){
                    win.style.position = this._prevRect.position || '';
                    win.style.left = this._prevRect.left;
                    win.style.top = this._prevRect.top;
                    win.style.width = this._prevRect.width;
                    win.style.height = this._prevRect.height;
                    win.style.transform = this._prevRect.transform || '';
                }
                this._maximized = false;
            }else{
                // store prev
                const rect = win.getBoundingClientRect();
                this._prevRect = { left: win.style.left || rect.left + 'px', top: win.style.top || rect.top + 'px', width: win.style.width || rect.width + 'px', height: win.style.height || rect.height + 'px', transform: win.style.transform, position: win.style.position };
                win.style.position = 'fixed';
                win.style.left = '0px';
                win.style.top = '0px';
                win.style.width = window.innerWidth + 'px';
                win.style.height = window.innerHeight + 'px';
                win.style.transform = 'none';
                this._maximized = true;
            }
        }

        centerOrRestore(){
            const win = this.terminalElement ? this.terminalElement.closest('.bash-window') : null;
            if(!win) return;
            if(win.classList.contains('floating')){
                // restore to centered
                win.classList.remove('floating');
                win.style.transform = 'translate(-50%,-50%)';
                win.style.left = '50%';
                win.style.top = '50%';
                this._maximized = false;
            }else{
                // make sure centered
                win.classList.remove('floating');
                win.style.position = 'fixed';
                win.style.left = '50%';
                win.style.top = '50%';
                win.style.transform = 'translate(-50%,-50%)';
            }
        }

        _bindResizer(){
            // 使用基于pid的选择器，确保每个实例绑定自己的resizer
            const bashWindow = this.terminalElement ? this.terminalElement.closest('.bash-window') : null;
            if (!bashWindow) {
                return;
            }
            
            // 检查是否使用了 GUIManager（如果使用了，拉伸由 GUIManager 自动处理）
            let hasGUIManager = false;
            try {
                const pool = safeGetPool();
                if (pool && typeof pool.__GET__ === 'function') {
                    const guiMgr = pool.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");
                    hasGUIManager = (guiMgr && typeof guiMgr.registerWindow === 'function');
                }
            } catch (e) {
                // 忽略错误
            }
            if (!hasGUIManager && typeof window !== 'undefined' && window.GUIManager) {
                hasGUIManager = (typeof window.GUIManager.registerWindow === 'function');
            }
            
            // 如果使用了 GUIManager，拉伸功能由 GUIManager 自动处理，这里跳过
            if (hasGUIManager) {
                return;
            }
            
            // 查找该实例的resizer（右下角和右上角）
            const resizerBottomRight = bashWindow.querySelector(`.window-resizer.bottom-right[data-pid="${this.pid}"]`);
            const resizerTopRight = bashWindow.querySelector(`.window-resizer.top-right[data-pid="${this.pid}"]`);
            const win = bashWindow;
            
            if(!resizerBottomRight && !resizerTopRight) return;
            
            // 为每个实例创建独立的resize状态
            if (!this._resizeState) {
                this._resizeState = {
                    resizing: false,
                    startX: 0,
                    startY: 0,
                    startW: 0,
                    startH: 0,
                    startTop: 0,
                    anchor: null
                };
            }
            
            const resizeState = this._resizeState;
            const minW = (this.config && this.config.minWidth) ? this.config.minWidth : 480;
            const minH = (this.config && this.config.minHeight) ? this.config.minHeight : 240;
            function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
            
            // 绑定右下角resizer
            if (resizerBottomRight && !resizerBottomRight._resizeBound) {
                resizerBottomRight._resizeBound = true;
                resizerBottomRight.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    
                    // 检查窗口状态（全屏时不能调整大小）
                    const state = win._windowState;
                    if (state && state.isFullscreen) {
                        return;
                    }
                    
                    if(!this.config || !this.config.resizable) return;
                    
                    // 拉伸开始时，将窗口置于最上层
                    const allWindows = document.querySelectorAll('.bash-window');
                    allWindows.forEach(w => {
                        w.classList.remove('focused');
                    });
                    win.classList.add('focused');
                    
                    resizeState.resizing = true;
                    resizeState.startX = ev.clientX;
                    resizeState.startY = ev.clientY;
                    const rect = win.getBoundingClientRect();
                    resizeState.startW = rect.width;
                    resizeState.startH = rect.height;
                    resizeState.anchor = 'bottom-right';
                    // make floating so left/top work
                    win.classList.add('floating');
                    win.style.position = 'fixed';
                });
            }
            
            // 绑定右上角resizer
            if (resizerTopRight && !resizerTopRight._resizeBound) {
                resizerTopRight._resizeBound = true;
                resizerTopRight.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    
                    // 检查窗口状态（全屏时不能调整大小）
                    const state = win._windowState;
                    if (state && state.isFullscreen) {
                        return;
                    }
                    
                    if(!this.config || !this.config.resizable) return;
                    
                    // 拉伸开始时，将窗口置于最上层
                    const allWindows = document.querySelectorAll('.bash-window');
                    allWindows.forEach(w => {
                        w.classList.remove('focused');
                    });
                    win.classList.add('focused');
                    
                    resizeState.resizing = true;
                    resizeState.startX = ev.clientX;
                    resizeState.startY = ev.clientY;
                    const rect = win.getBoundingClientRect();
                    resizeState.startW = rect.width;
                    resizeState.startH = rect.height;
                    resizeState.startTop = rect.top;
                    resizeState.anchor = 'top-right';
                    // make floating so left/top work
                    win.classList.add('floating');
                    win.style.position = 'fixed';
                });
            }
            
            // 使用命名空间事件，避免多个实例冲突
            const mousemoveHandler = (ev) => {
                if(!resizeState.resizing) return;
                const dx = ev.clientX - resizeState.startX;
                const dy = ev.clientY - resizeState.startY;
                const vw = window.innerWidth, vh = window.innerHeight;
                const maxW = (this.config && this.config.maxWidth) ? this.config.maxWidth : Math.max(300, vw - 40);
                const maxH = (this.config && this.config.maxHeight) ? this.config.maxHeight : Math.max(200, vh - 40);
                const newW = clamp(resizeState.startW + dx, minW, maxW);
                
                if (resizeState.anchor === 'top-right') {
                    const newH = clamp(resizeState.startH - dy, minH, maxH);
                    const newTop = resizeState.startTop + (resizeState.startH - newH);
                    win.style.width = newW + 'px';
                    win.style.height = newH + 'px';
                    win.style.top = newTop + 'px';
                } else {
                    const newH = clamp(resizeState.startH + dy, minH, maxH);
                    win.style.width = newW + 'px';
                    win.style.height = newH + 'px';
                }
            };
            
            const mouseupHandler = () => {
                if(!resizeState.resizing) return;
                resizeState.resizing = false;
                resizeState.anchor = null;
            };
            
            // 使用 EventManager 注册临时拉伸事件
            if (typeof EventManager !== 'undefined' && this.pid) {
                const mousemoveHandlerId = EventManager.registerEventHandler(this.pid, 'mousemove', mousemoveHandler, {
                    priority: 50,
                    once: false
                });
                
                const mouseupHandlerId = EventManager.registerEventHandler(this.pid, 'mouseup', mouseupHandler, {
                    priority: 50,
                    once: true
                });
                
                // 存储事件处理器ID，以便后续清理
                if (!this._resizeEventHandlers) {
                    this._resizeEventHandlers = [];
                }
                this._resizeEventHandlers.push(mousemoveHandlerId, mouseupHandlerId);
            } else {
                // 降级：直接使用 addEventListener（不推荐）
                document.addEventListener('mousemove', mousemoveHandler);
                document.addEventListener('mouseup', mouseupHandler);
            }
        }

        // apply config at runtime
        setConfig(obj){
            if(!obj || typeof obj !== 'object') return;
            this.config = Object.assign({}, this.config, obj);
            // apply font and size
            const win = this.terminalElement ? this.terminalElement.closest('.bash-window') : null;
            if(win){
                win.style.fontFamily = this.config.fontFamily;
                win.style.fontSize = (this.config.fontSize || 16) + 'px';
            }
            // scrollbar style
            if(this.config.scrollbarStyle === 'overlay') document.body.classList.add('scrollbar-overlay');
            else document.body.classList.remove('scrollbar-overlay');
        }

        _setBusy(flag){
            this.busy = !!flag;
            if(this.busy){
                this.cmdEl.setAttribute('contenteditable','false');
                this.cmdEl.classList.add('disabled');
                this.promptEl.textContent = `${this.env.user}@${this.env.host}:${this.env.cwd}# [running]`;
            }else{
                this.cmdEl.setAttribute('contenteditable','true');
                this.cmdEl.classList.remove('disabled');
                this._updatePrompt();
                if (this.isActive) {
                this.focus();
                }
            }
        }

        // cancel current command (sets cancel token and attempts to notify listeners)
        cancelCurrent(){
            if(!this.busy) return;
            if(this._currentCancel){
                this._currentCancel.cancelled = true;
                if(typeof this._currentCancel.fn === 'function'){
                    try{ this._currentCancel.fn(); }catch(e){}
                }
            }
            // visually emulate Ctrl+C
            this.write('^C');
            this._setBusy(false);
        }

        // 处理命令，支持事件监听器返回 Promise，或 handler 返回 Promise
        _handleCommand(payload){
            // 只在活动标签页处理命令
            if (!this.isActive) {
                return Promise.resolve();
            }
            
            // 尝试事件驱动处理（支持 cancelToken）
            const listeners = this._listeners.get('command');
            // prepare cancel token
            const cancelToken = { cancelled: false };
            this._currentCancel = cancelToken;
            if(listeners && listeners.length){
                try{
                    const results = listeners.map(fn => {
                        try{ return fn(Object.assign({}, payload, { cancelToken })); }catch(e){ return Promise.reject(e); }
                    });
                    // 如果有任何异步结果，则等待全部完成
                    const hasPromise = results.some(r => r && typeof r.then === 'function');
                    if(hasPromise){
                        return Promise.all(results.map(r => (r && typeof r.then === 'function') ? r : Promise.resolve(r))).finally(()=>{ this._currentCancel = null });
                    }
                    this._currentCancel = null;
                    return Promise.resolve(results);
                }catch(e){
                    this._currentCancel = null;
                    return Promise.reject(e);
                }
            }
            // 向后兼容：调用 commandHandler
            try{
                // pass cancelToken to handler if it accepts
                const res = this.commandHandler(payload.cmdString, payload.args, payload.env, payload.write, payload.done, cancelToken);
                if(res && typeof res.then === 'function') return res.finally(()=>{ this._currentCancel = null });
                this._currentCancel = null;
                return Promise.resolve(res);
            }catch(e){
                this._currentCancel = null;
                return Promise.reject(e);
            }
        }

        // 切换 newestOnTop 视图
        toggleView(){
            this.newestOnTop = !this.newestOnTop;
            // 使用实例的输出元素，而不是全局的
            const out = this.outputEl;
            if(!out) return;
            // 翻转现有输出顺序
            const nodes = Array.from(out.childNodes);
            nodes.reverse().forEach(n => out.appendChild(n));
            this.write(`View: newestOnTop=${this.newestOnTop}`);
        }

        // 简单演示脚本
        demo(){
            const seq = [
                {cmd:'echo Hello from demo'},
                {out:'Hello from demo'},
                {cmd:'pwd'},
                {out:this.env.cwd},
                {cmd:'whoami'},
                {out:this.env.user}
            ];
            let i=0;
            const runNext = () => {
                if(i>=seq.length) return;
                const item = seq[i++];
                if(item.cmd){
                    this._echoCommand(item.cmd);
                    setTimeout(runNext, 250);
                }else if(item.out){
                    this.write(item.out);
                    setTimeout(runNext, 250);
                }
            };
            runNext();
        }

        _argsFrom(input){
            if(!input) return [];
            // simple split, user may replace handler with custom parser
            return input.split(/\s+/).filter(Boolean);
        }

        _echoCommand(input){
            const line = document.createElement('div');
            line.className = 'line cmd-line out-line';
            const p = document.createElement('span');
            p.className = 'prompt';
            p.textContent = this.promptEl.textContent + ' ';
            const cmdSpan = document.createElement('span');
            cmdSpan.className = 'cmd';
            cmdSpan.textContent = input;
            line.appendChild(p);
            line.appendChild(cmdSpan);
            // 插入到底部（与 Kali/大多数终端一致）
            this.outputEl.appendChild(line);
            // 强制触发入场动画并滚动到底部
            requestAnimationFrame(() => line.classList.add('visible'));
            this._scrollToBottom();
        }

        _scrollToBottom(){
            this.outputEl.scrollTop = this.outputEl.scrollHeight;
        }

        // 展示补全面板
        _showCompletions(candidates, beforeText, dirPart){
            // 初始化状态
            this._completionState = {
                visible: true,
                candidates: candidates.slice(),
                index: 0,
                beforeText: beforeText || '',
                dirPart: dirPart || ''
            }; // 触发保存

            // 准备 DOM 容器
            if(!this._completionBox){
                this._completionBox = document.createElement('div');
                this._completionBox.className = 'completion-box';
                // 标记DOM元素（如果知道PID）
                if (this.pid && this._completionBox.dataset) {
                    this._completionBox.dataset.pid = this.pid.toString();
                }
                // 基本样式
                Object.assign(this._completionBox.style, {
                    position: 'absolute',
                    background: '#0b0b0b',
                    color: '#e6e6e6',
                    border: '1px solid #2e2e2e',
                    padding: '6px',
                    fontFamily: this.config.fontFamily,
                    fontSize: (this.config.fontSize || 14) + 'px',
                    zIndex: 9999,
                    maxHeight: '240px',
                    overflowY: 'auto',
                    whiteSpace: 'pre',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.6)'
                });
                document.body.appendChild(this._completionBox);
            }

            // 渲染候选项
            this._renderCompletions();
            // 定位到输入框右下方
            this._positionCompletionBox();
        }

        _renderCompletions(){
            if(!this._completionBox) return;
            this._completionBox.innerHTML = '';
            const ul = document.createElement('div');
            ul.style.display = 'block';
            // 标记DOM元素（如果知道PID）
            if (this.pid && ul.dataset) {
                ul.dataset.pid = this.pid.toString();
            }
            const max = this._completionState.candidates.length;
            for(let i=0;i<max;i++){
                const item = document.createElement('div');
                // 标记DOM元素（如果知道PID）
                if (this.pid && item.dataset) {
                    item.dataset.pid = this.pid.toString();
                }
                item.className = 'completion-item';
                item.textContent = this._completionState.candidates[i];
                item.style.padding = '2px 8px';
                item.style.cursor = 'default';
                if(i === this._completionState.index){
                    item.style.background = '#2a2a2a';
                }
                // 点击选择（使用 EventManager）
                if (typeof EventManager !== 'undefined' && this.pid) {
                    const itemId = `terminal-completion-item-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    item.dataset.eventId = itemId;
                    EventManager.registerEventHandler(this.pid, 'mousedown', (ev) => {
                        if (item === ev.target || item.contains(ev.target)) {
                            ev.preventDefault();
                            const state = this._completionState;
                            state.index = i;
                            this._completionState = state; // 触发保存
                            this._acceptCompletion();
                        }
                    }, {
                        priority: 100,
                        selector: `[data-event-id="${itemId}"]`
                    });
                } else {
                    // 降级方案
                    item.addEventListener('mousedown', (ev) => {
                        ev.preventDefault();
                        const state = this._completionState;
                        state.index = i;
                        this._completionState = state; // 触发保存
                        this._acceptCompletion();
                    });
                }
                ul.appendChild(item);
            }
            this._completionBox.appendChild(ul);
            this._ensureCompletionVisible();
        }

        _positionCompletionBox(){
            if(!this._completionBox) return;
            const rect = this.cmdEl.getBoundingClientRect();
            // 放在输入框下方，稍微左移以对齐
            const left = rect.left;
            let top = rect.bottom + 6;
            // 保证不超出视口底部
            const boxRect = this._completionBox.getBoundingClientRect();
            if(top + boxRect.height > window.innerHeight){
                top = rect.top - boxRect.height - 6;
            }
            this._completionBox.style.left = (left) + 'px';
            this._completionBox.style.top = (top) + 'px';
            // 宽度至少与输入框一致
            this._completionBox.style.minWidth = Math.max(180, rect.width) + 'px';
        }

        _ensureCompletionVisible(){
            if(!this._completionBox) return;
            const items = Array.from(this._completionBox.querySelectorAll('.completion-item'));
            const idx = this._completionState.index;
            if(idx < 0 || idx >= items.length) return;
            const el = items[idx];
            const box = this._completionBox;
            const er = el.getBoundingClientRect();
            const br = box.getBoundingClientRect();
            if(er.top < br.top) box.scrollTop -= (br.top - er.top) + 4;
            else if(er.bottom > br.bottom) box.scrollTop += (er.bottom - br.bottom) + 4;
        }

        _clearCompletions(){
            const state = this._completionState;
            state.visible = false;
            state.candidates = [];
            state.index = -1;
            state.beforeText = '';
            state.dirPart = '';
            this._completionState = state; // 触发保存
            if(this._completionBox){
                this._completionBox.parentNode && this._completionBox.parentNode.removeChild(this._completionBox);
                this._completionBox = null;
            }
        }

        _moveCompletion(delta){
            const state = this._completionState;
            if(!state.visible) return;
            const n = state.candidates.length;
            if(n === 0) return;
            let idx = state.index + delta;
            // wrap-around 模式：超出尾部从头开始，向前同理
            idx = ((idx % n) + n) % n;
            state.index = idx;
            this._completionState = state; // 触发保存
            this._renderCompletions();
        }

        _acceptCompletion(){
            if(!this._completionState.visible) return;
            const idx = this._completionState.index;
            const cand = this._completionState.candidates[idx];
            if(typeof cand === 'undefined') return;
            const cmdElTextBefore = this._completionState.beforeText || '';
            let newText = cmdElTextBefore;
            if(newText.length && !/\s$/.test(newText)) newText += ' ';
            newText += cand;
            this.cmdEl.textContent = newText;
            this.focus();
            this._clearCompletions();
        }

        // 默认的 switch 框架（可被覆盖）
        _defaultHandler(cmdString, args, env, write){
            if(!cmdString){
                write('');
                return;
            }
            const cmd = args[0];
            switch(cmd){
                case 'clear':
                    this.clear();
                    break;
                case 'pwd':
                    write(env.cwd);
                    break;
                case 'whoami':
                    write(env.user);
                    break;
                default:
                    write(`${cmd}: command not found`);
            }
        }

        // 事件 API: on/off/emit
        on(eventName, fn){
            if(typeof fn !== 'function') return;
            const list = this._listeners.get(eventName) || [];
            list.push(fn);
            this._listeners.set(eventName, list);
            return () => this.off(eventName, fn);
        }

        off(eventName, fn){
            const list = this._listeners.get(eventName);
            if(!list) return;
            const idx = list.indexOf(fn);
            if(idx >= 0) list.splice(idx,1);
            if(list.length === 0) this._listeners.delete(eventName);
        }

        // emit 支持传入单个对象参数（事件负载），返回是否存在 listener
        emit(eventName, payload){
            const list = this._listeners.get(eventName);
            if(!list || list.length === 0) return false;
            // 调用所有监听器（不阻塞）
            list.forEach(fn => {
                try{ fn(payload); }catch(e){ console.error('Terminal listener errored', e); }
            });
            return true;
        }

        // API: 写入输出区域
        // 支持多种调用方式：
        // - write(text) - 纯文本（自动转义，向后兼容）
        // - write({text: '...'}) - 纯文本（显式指定）
        // - write({html: '...'}) - HTML 片段（不转义，直接渲染）
        // - write({text: '...', className: '...'}) - 带 CSS 类的文本
        // - write({html: '...', className: '...'}) - 带 CSS 类的 HTML
        write(textOrOptions){
            const line = document.createElement('div');
            line.className = 'out-line';
            // 标记DOM元素（如果知道PID）
            if (this.pid && line.dataset) {
                line.dataset.pid = this.pid.toString();
            }
            
            // 向后兼容：如果传入字符串，按原方式处理
            if (typeof textOrOptions === 'string') {
                line.textContent = textOrOptions;
            } else if (typeof textOrOptions === 'object' && textOrOptions !== null) {
                // 新 API：支持对象参数
                if (textOrOptions.html !== undefined) {
                    // HTML 模式：直接设置 innerHTML（注意安全性）
                    line.innerHTML = textOrOptions.html;
                } else if (textOrOptions.text !== undefined) {
                    // 文本模式：使用 textContent（自动转义）
                    line.textContent = textOrOptions.text;
                } else {
                    // 降级：尝试转换为字符串
                    line.textContent = String(textOrOptions);
                }
                
                // 添加自定义 CSS 类
                if (textOrOptions.className) {
                    line.className += ' ' + textOrOptions.className;
                }
                
                // 添加自定义样式
                if (textOrOptions.style && typeof textOrOptions.style === 'object') {
                    Object.assign(line.style, textOrOptions.style);
                }
            } else {
                // 其他类型：转换为字符串
                line.textContent = String(textOrOptions);
            }
            
            this.outputEl.appendChild(line);
            requestAnimationFrame(() => line.classList.add('visible'));
            this._scrollToBottom();
        }

        clear(){
            this.outputEl.innerHTML = '';
        }

        // Exploit 内存管理工具 - 统一的临时数据存储
        _ensureExploitMemory() {
            const EXPLOIT_PID = 10000;
            const HEAP_ID = 1;
            const SHED_ID = 1;
            const HEAP_SIZE = 200000; // 200KB 用于存储所有临时数据
            
            try {
                if (typeof MemoryManager === 'undefined' || typeof Heap === 'undefined') {
                    return null;
                }
                
                // 分配内存（如果还没有分配）
                const appSpace = MemoryManager.APPLICATION_SOP.get(EXPLOIT_PID);
                if (!appSpace || !appSpace.heaps.has(HEAP_ID)) {
                    MemoryManager.allocateMemory(HEAP_ID, SHED_ID, HEAP_SIZE, EXPLOIT_PID);
                    // 注册程序名称
                    if (typeof MemoryManager.registerProgramName === 'function') {
                        MemoryManager.registerProgramName(EXPLOIT_PID, 'Exploit');
                    }
                }
                
                const appMem = MemoryManager.APPLICATION_SOP.get(EXPLOIT_PID);
                if (!appMem || !appMem.heaps.has(HEAP_ID) || !appMem.sheds.has(SHED_ID)) {
                    return null;
                }
                
                return {
                    pid: EXPLOIT_PID,
                    heap: appMem.heaps.get(HEAP_ID),
                    shed: appMem.sheds.get(SHED_ID)
                };
            } catch (e) {
                console.error('Failed to ensure Exploit memory:', e);
                return null;
            }
        }

        // 保存终端输出内容到内存系统（使用Exploit程序PID 10000）
        _saveTerminalContent() {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return null;
            try {
                const heap = exploit.heap;
                const shed = exploit.shed;
                
                // 收集所有输出行的内容
                const lines = Array.from(this.outputEl.children).map(child => {
                    return {
                        html: child.innerHTML,
                        className: child.className,
                        style: child.style.cssText
                    };
                });
                
                // 将内容序列化为 JSON 字符串
                const serialized = JSON.stringify(lines);
                
                // 使用类似 Vim 的方法将字符串写入 Heap
                const length = serialized.length;
                const addr = heap.alloc(length + 1);
                if (!addr) {
                    console.error('Failed to allocate heap memory for terminal content');
                    return null;
                }
                
                const startIdx = Heap.addressing(addr, 10);
                if (startIdx < 0 || startIdx >= heap.heapSize) {
                    return null;
                }
                
                // 写入字符串字符
                for (let i = 0; i < length; i++) {
                    if (startIdx + i < heap.heapSize) {
                        heap.writeData(Heap.addressing(startIdx + i, 16), serialized[i]);
                    }
                }
                
                // 写入结束符
                if (startIdx + length < heap.heapSize) {
                    heap.writeData(Heap.addressing(startIdx + length, 16), '\0');
                }
                
                // 在 Shed 中保存地址信息
                shed.writeResourceLink('TERMINAL_CONTENT_ADDR', addr);
                shed.writeResourceLink('TERMINAL_CONTENT_SIZE', length);
                
                return { pid: exploit.pid, addr: addr, size: length };
            } catch (e) {
                console.error('Failed to save terminal content:', e);
            }
            return null;
        }

        // 从内存系统恢复终端输出内容
        _restoreTerminalContent() {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return false;
            
            try {
                const heap = exploit.heap;
                const shed = exploit.shed;
                
                // 从 Shed 中读取地址信息
                const addr = shed.readResourceLink('TERMINAL_CONTENT_ADDR');
                
                if (!addr) return false;
                
                // 从 Heap 中读取字符串（类似 Vim 的方法）
                const startIdx = Heap.addressing(addr, 10);
                if (startIdx < 0 || startIdx >= heap.heapSize) return false;
                
                // 读取字符串直到遇到结束符
                let serialized = '';
                let i = startIdx;
                while (i < heap.heapSize) {
                    const char = heap.readData(Heap.addressing(i, 16));
                    if (char === '\0' || char === null || (typeof char === 'object' && char.__reserved)) {
                        break;
                    }
                    if (typeof char === 'string' && char.length === 1) {
                        serialized += char;
                    } else {
                        break;
                    }
                    i++;
                }
                
                if (!serialized) return false;
                
                // 反序列化
                const lines = JSON.parse(serialized);
                
                // 恢复输出内容
                this.outputEl.innerHTML = ''; // 先清空
                
                lines.forEach(lineData => {
                    const line = document.createElement('div');
                    line.className = lineData.className || 'out-line';
                    line.innerHTML = lineData.html || '';
                    if (lineData.style) {
                        line.style.cssText = lineData.style;
                    }
                    this.outputEl.appendChild(line);
                });
                
                // 恢复可见性动画
                requestAnimationFrame(() => {
                    this.outputEl.querySelectorAll('.out-line').forEach(line => {
                        line.classList.add('visible');
                    });
                });
                
                // 滚动到底部
                this._scrollToBottom();
                
                return true;
            } catch (e) {
                console.error('Failed to restore terminal content:', e);
            }
            return false;
        }

        // 保存剪贴板数据到 Exploit 内存
        _saveClipboardToMemory(clipboardData) {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return false;
            
            try {
                const heap = exploit.heap;
                const shed = exploit.shed;
                
                // 序列化剪贴板数据
                const serialized = JSON.stringify(clipboardData);
                const length = serialized.length;
                
                // 释放旧的剪贴板内存（如果存在）
                const oldAddr = shed.readResourceLink('CLIPBOARD_ADDR');
                if (oldAddr) {
                    const oldSize = shed.readResourceLink('CLIPBOARD_SIZE') || 0;
                    const oldStartIdx = Heap.addressing(oldAddr, 10);
                    if (oldStartIdx >= 0 && oldStartIdx < heap.heapSize) {
                        heap.free(oldAddr, oldSize + 1);
                    }
                }
                
                // 分配新内存
                const addr = heap.alloc(length + 1);
                if (!addr) {
                    console.error('Failed to allocate heap memory for clipboard');
                    return false;
                }
                
                const startIdx = Heap.addressing(addr, 10);
                if (startIdx < 0 || startIdx >= heap.heapSize) {
                    return false;
                }
                
                // 写入字符串字符
                for (let i = 0; i < length; i++) {
                    if (startIdx + i < heap.heapSize) {
                        heap.writeData(Heap.addressing(startIdx + i, 16), serialized[i]);
                    }
                }
                
                // 写入结束符
                if (startIdx + length < heap.heapSize) {
                    heap.writeData(Heap.addressing(startIdx + length, 16), '\0');
                }
                
                // 在 Shed 中保存地址信息
                shed.writeResourceLink('CLIPBOARD_ADDR', addr);
                shed.writeResourceLink('CLIPBOARD_SIZE', length);
                
                return true;
            } catch (e) {
                console.error('Failed to save clipboard to memory:', e);
                return false;
            }
        }

        // 从 Exploit 内存读取剪贴板数据
        _loadClipboardFromMemory() {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return null;
            
            try {
                const heap = exploit.heap;
                const shed = exploit.shed;
                
                // 从 Shed 中读取地址信息
                const addr = shed.readResourceLink('CLIPBOARD_ADDR');
                if (!addr) return null;
                
                // 从 Heap 中读取字符串
                const startIdx = Heap.addressing(addr, 10);
                if (startIdx < 0 || startIdx >= heap.heapSize) return null;
                
                // 读取字符串直到遇到结束符
                let serialized = '';
                let i = startIdx;
                while (i < heap.heapSize) {
                    const char = heap.readData(Heap.addressing(i, 16));
                    if (char === '\0' || char === null || (typeof char === 'object' && char.__reserved)) {
                        break;
                    }
                    if (typeof char === 'string' && char.length === 1) {
                        serialized += char;
                    } else {
                        break;
                    }
                    i++;
                }
                
                if (!serialized) return null;
                
                // 反序列化
                return JSON.parse(serialized);
            } catch (e) {
                console.error('Failed to load clipboard from memory:', e);
                return null;
            }
        }

        // ========== 终端数据内存管理方法 ==========
        
        // 从内存初始化终端数据
        _loadTerminalDataFromMemory() {
            // 初始化环境变量（从内存或使用默认值）
            const savedEnv = this._loadEnvFromMemory();
            if (savedEnv) {
                this.env = savedEnv;
            }
            // 确保 cwd 从全局池获取（优先使用全局池的值）
            const workspaceCwd = safePoolGet("KERNEL_GLOBAL_POOL","WORK_SPACE");
            // 优先使用 POOL 中的值，如果 POOL 中没有值，使用默认值 "C:"
            if (workspaceCwd && typeof workspaceCwd === 'string') {
                // POOL 中有值，使用它
                this.env.cwd = workspaceCwd;
                this._saveEnvToMemory(); // 保存更新后的值
            } else {
                // POOL 中没有值或值无效，使用默认值 "C:"
                // 如果当前值是 '~' 或无效值，替换为 "C:"
                if (!this.env.cwd || typeof this.env.cwd !== 'string' || 
                    this.env.cwd === '[object Object]' || this.env.cwd === '~') {
                    this.env.cwd = "C:";
                    this._saveEnvToMemory(); // 保存默认值
                }
            }
            
            // 初始化命令历史（从内存加载）
            this._loadHistoryFromMemory();
            
            // 初始化补全状态（从内存加载）
            this._loadCompletionStateFromMemory();
        }
        
        // 保存/加载环境变量
        _saveEnvToMemory() {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return false;
            return this._saveDataToMemory(`TERMINAL_${this.tabId}_ENV`, JSON.stringify(this.env));
        }
        
        _loadEnvFromMemory() {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return null;
            const data = this._loadDataFromMemory(`TERMINAL_${this.tabId}_ENV`);
            return data ? JSON.parse(data) : null;
        }
        
        // 保存/加载命令历史
        _saveHistoryToMemory() {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return false;
            const historyData = {
                history: this._historyCache || [],
                historyIndex: this._historyIndexCache !== undefined ? this._historyIndexCache : -1
            };
            return this._saveDataToMemory(`TERMINAL_${this.tabId}_HISTORY`, JSON.stringify(historyData));
        }
        
        _loadHistoryFromMemory() {
            const exploit = this._ensureExploitMemory();
            if (!exploit) {
                this._historyCache = [];
                this._historyIndexCache = -1;
                return;
            }
            const data = this._loadDataFromMemory(`TERMINAL_${this.tabId}_HISTORY`);
            if (data) {
                try {
                    const historyData = JSON.parse(data);
                    this._historyCache = historyData.history || [];
                    this._historyIndexCache = historyData.historyIndex !== undefined ? historyData.historyIndex : -1;
                } catch (e) {
                    this._historyCache = [];
                    this._historyIndexCache = -1;
                }
            } else {
                this._historyCache = [];
                this._historyIndexCache = -1;
            }
        }
        
        // 保存/加载补全状态
        _saveCompletionStateToMemory() {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return false;
            const completionData = this._completionStateCache || { visible: false, candidates: [], index: -1, beforeText: '', dirPart: '' };
            return this._saveDataToMemory(`TERMINAL_${this.tabId}_COMPLETION`, JSON.stringify(completionData));
        }
        
        _loadCompletionStateFromMemory() {
            const exploit = this._ensureExploitMemory();
            if (!exploit) {
                this._completionStateCache = { visible: false, candidates: [], index: -1, beforeText: '', dirPart: '' };
                return;
            }
            const data = this._loadDataFromMemory(`TERMINAL_${this.tabId}_COMPLETION`);
            if (data) {
                try {
                    this._completionStateCache = JSON.parse(data);
                } catch (e) {
                    this._completionStateCache = { visible: false, candidates: [], index: -1, beforeText: '', dirPart: '' };
                }
            } else {
                this._completionStateCache = { visible: false, candidates: [], index: -1, beforeText: '', dirPart: '' };
            }
        }
        
        // 通用数据保存/加载方法
        _saveDataToMemory(key, data) {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return false;
            
            try {
                const heap = exploit.heap;
                const shed = exploit.shed;
                
                const length = data.length;
                
                // 释放旧内存
                const oldAddr = shed.readResourceLink(`${key}_ADDR`);
                if (oldAddr) {
                    const oldSize = shed.readResourceLink(`${key}_SIZE`) || 0;
                    const oldStartIdx = Heap.addressing(oldAddr, 10);
                    if (oldStartIdx >= 0 && oldStartIdx < heap.heapSize) {
                        heap.free(oldAddr, oldSize + 1);
                    }
                }
                
                // 分配新内存
                const addr = heap.alloc(length + 1);
                if (!addr) return false;
                
                const startIdx = Heap.addressing(addr, 10);
                if (startIdx < 0 || startIdx >= heap.heapSize) return false;
                
                // 写入数据
                for (let i = 0; i < length; i++) {
                    if (startIdx + i < heap.heapSize) {
                        heap.writeData(Heap.addressing(startIdx + i, 16), data[i]);
                    }
                }
                if (startIdx + length < heap.heapSize) {
                    heap.writeData(Heap.addressing(startIdx + length, 16), '\0');
                }
                
                shed.writeResourceLink(`${key}_ADDR`, addr);
                shed.writeResourceLink(`${key}_SIZE`, length);
                
                return true;
            } catch (e) {
                console.error(`Failed to save data to memory (key: ${key}):`, e);
                return false;
            }
        }
        
        _loadDataFromMemory(key) {
            const exploit = this._ensureExploitMemory();
            if (!exploit) return null;
            
            try {
                const heap = exploit.heap;
                const shed = exploit.shed;
                
                const addr = shed.readResourceLink(`${key}_ADDR`);
                if (!addr) {
                    // 调试日志：键不存在
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('Terminal', `_loadDataFromMemory: 键不存在 key=${key}`);
                    }
                    return null;
                }
                
                // 读取大小信息
                const size = shed.readResourceLink(`${key}_SIZE`);
                const maxLength = size ? parseInt(size, 10) : null;
                
                // 使用批量读取方法读取字符串
                const serialized = heap.readString(addr, maxLength);
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('Terminal', `_loadDataFromMemory: 加载完成 key=${key}`, {
                        key: key,
                        addr: addr,
                        size: size,
                        maxLength: maxLength,
                        resultLength: serialized ? serialized.length : 0,
                        preview: serialized ? (serialized.length > 50 ? serialized.substring(0, 50) + '...' : serialized) : null
                    });
                }
                
                return serialized || null;
            } catch (e) {
                console.error(`Failed to load data from memory (key: ${key}):`, e);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Terminal', `_loadDataFromMemory 异常 key=${key}`, { error: e.message, stack: e.stack });
                }
                return null;
            }
        }

        // 获取CLI程序列表（用于Tab补全，带缓存）
        _getCliProgramsForCompletion() {
            const now = Date.now();
            
            // 检查缓存是否有效
            if (this._cliProgramsCache !== null && (now - this._cliProgramsCacheTime) < this._cliProgramsCacheTTL) {
                return this._cliProgramsCache;
            }
            
            // 缓存失效或不存在，重新获取
            const cliPrograms = [];
            
            try {
                let AssetManager = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    AssetManager = ApplicationAssetManager;
                } else if (typeof safePoolGet === 'function') {
                    AssetManager = safePoolGet('KERNEL_GLOBAL_POOL', 'ApplicationAssetManager');
                } else if (typeof safeGetPool === 'function') {
                    const pool = safeGetPool();
                    if (pool && typeof pool.__GET__ === 'function') {
                        AssetManager = pool.__GET__('KERNEL_GLOBAL_POOL', 'ApplicationAssetManager');
                    }
                }
                
                if (AssetManager && typeof AssetManager.listPrograms === 'function') {
                    const allPrograms = AssetManager.listPrograms();
                    
                    // 筛选出CLI类型的程序
                    for (const programName of allPrograms) {
                        try {
                            let isCli = false;
                            
                            // 方法1：从ApplicationAssetManager获取程序信息
                            const programInfo = AssetManager.getProgramInfo(programName);
                            if (programInfo) {
                                if (programInfo.metadata && programInfo.metadata.type === 'CLI') {
                                    isCli = true;
                                } else if (programInfo.type === 'CLI') {
                                    // 兼容：如果type在顶层
                                    isCli = true;
                                }
                            }
                            
                            // 方法2：如果ApplicationAssetManager没有类型信息，尝试从程序对象获取
                            if (!isCli && (!programInfo || !programInfo.type)) {
                                const programNameUpper = programName.toUpperCase();
                                let programClass = null;
                                if (typeof window !== 'undefined' && window[programNameUpper]) {
                                    programClass = window[programNameUpper];
                                } else if (typeof globalThis !== 'undefined' && globalThis[programNameUpper]) {
                                    programClass = globalThis[programNameUpper];
                                }
                                
                                if (programClass && typeof programClass.__info__ === 'function') {
                                    try {
                                        const info = programClass.__info__();
                                        if (info && (info.type === 'CLI' || (info.metadata && info.metadata.type === 'CLI'))) {
                                            isCli = true;
                                        }
                                    } catch (e) {
                                        // 忽略错误
                                    }
                                }
                            }
                            
                            if (isCli) {
                                cliPrograms.push(programName);
                            }
                        } catch (e) {
                            // 忽略单个程序的错误，继续处理其他程序
                        }
                    }
                }
            } catch (e) {
                // 如果获取CLI程序失败，忽略错误，返回空数组
                console.warn('Terminal: Failed to get CLI programs for completion:', e);
            }
            
            // 更新缓存
            this._cliProgramsCache = cliPrograms;
            this._cliProgramsCacheTime = now;
            
            return cliPrograms;
        }
        
        focus(){
            if (!this.isActive) return;
            
            // 确保元素可见且可聚焦
            if (!this.cmdEl || this.cmdEl.offsetParent === null) {
                // 如果元素不可见，延迟重试
                setTimeout(() => {
                    if (this.isActive && this.cmdEl && this.cmdEl.offsetParent !== null) {
                        this.focus();
                    }
                }, 50);
                return;
            }
            
            // 如果元素被禁用，不聚焦
            if (this.cmdEl.getAttribute('contenteditable') === 'false' || this.busy) {
                return;
            }
            
            // 聚焦到输入框
            try {
                this.cmdEl.focus();
                
                // 将光标移动到文本末尾
                const range = document.createRange();
                range.selectNodeContents(this.cmdEl);
                range.collapse(false);
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    sel.removeAllRanges();
                }
                sel.addRange(range);
                
                // 添加焦点视觉指示（通过CSS类）
                this.cmdEl.classList.add('focused');
                
                // 滚动到输入框（如果被遮挡）
                this.cmdEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch(e) {
                // 如果选择失败，至少确保焦点
                console.warn('Terminal focus error:', e);
                try {
                    this.cmdEl.focus();
                    this.cmdEl.classList.add('focused');
                } catch(e2) {
                    // 完全失败，忽略
                }
            }
        }
        
        // 失去焦点时的处理
        blur(){
            if (this.cmdEl) {
                this.cmdEl.classList.remove('focused');
                this.cmdEl.blur();
            }
        }

        setCwd(path){ 
            this.env.cwd = path; 
            this._saveEnvToMemory();
            this._updatePrompt(); 
        }
        setUser(user){ 
            this.env.user = user; 
            this._saveEnvToMemory();
            this._updatePrompt(); 
        }
        setHost(host){ 
            this.env.host = host; 
            this._saveEnvToMemory();
            this._updatePrompt(); 
        }
        
        // 命令历史的 getter/setter（使用内存管理）
        get history() {
            if (!this._historyCache) {
                this._loadHistoryFromMemory();
            }
            return this._historyCache || [];
        }
        
        set history(value) {
            this._historyCache = value || [];
            this._saveHistoryToMemory();
        }
        
        get historyIndex() {
            if (this._historyIndexCache === undefined) {
                this._loadHistoryFromMemory();
            }
            return this._historyIndexCache !== undefined ? this._historyIndexCache : -1;
        }
        
        set historyIndex(value) {
            this._historyIndexCache = value;
            this._saveHistoryToMemory();
        }
        
        // 补全状态的 getter/setter（使用内存管理）
        get _completionState() {
            if (!this._completionStateCache) {
                this._loadCompletionStateFromMemory();
            }
            return this._completionStateCache || { visible: false, candidates: [], index: -1, beforeText: '', dirPart: '' };
        }
        
        set _completionState(value) {
            this._completionStateCache = value || { visible: false, candidates: [], index: -1, beforeText: '', dirPart: '' };
            this._saveCompletionStateToMemory();
        }

        // 替换内部处理函数（向后兼容）
        setCommandHandler(fn){
            if(typeof fn === 'function'){
                // 清除所有 'command' 事件监听并使用单一 handler 保持兼容
                this._listeners.delete('command');
                this.commandHandler = fn;
            }
        }
    }

    // 为终端实例注册命令处理器的函数（现在定义，在 TerminalInstance 类之后）
    registerCommandHandlers = function(terminalInstance) {
        // 防止重复注册：如果已注册，先移除旧的监听器
        if (terminalInstance._commandHandlerRegistered) {
            // 移除旧的命令监听器（如果有的话）
            const oldHandler = terminalInstance._commandHandler;
            if (oldHandler) {
                terminalInstance.off('command', oldHandler);
            }
        }
        terminalInstance._commandHandlerRegistered = true;
        
        // 创建命令处理器函数并保存引用，以便后续可以移除
        // 命令权限检查函数
        const checkCommandPermission = (cmd, payload) => {
            // 需要管理员权限的命令列表
            const adminOnlyCommands = [
                'power',      // 电源管理（重启/关机）
                'kill',       // 终止进程
                'rm',         // 删除文件/目录
                'mv',         // 移动文件/目录（可能覆盖系统文件）
                'write',      // 写入文件（可能修改系统文件）
                'markdir',    // 创建目录（可能在系统盘创建）
                'markfile',   // 创建文件（可能在系统盘创建）
                'users',      // 查看用户列表（敏感信息）
                'login',      // 切换用户（可能提权）
                'su'          // 切换用户（可能提权）
            ];
            
            // 检查命令是否需要管理员权限
            if (adminOnlyCommands.includes(cmd)) {
                if (typeof UserControl === 'undefined') {
                    payload.write(`${cmd}: 权限检查失败: UserControl 未加载`);
                    return false;
                }
                
                if (!UserControl.isAdmin()) {
                    payload.write(`${cmd}: 权限不足: 此命令需要管理员权限`);
                    return false;
                }
            }
            
            return true;
        };
        
        // 检查系统盘D:访问权限
        const checkSystemDiskAccess = (path, payload) => {
            // 检查路径是否在系统盘D:
            const normalizedPath = path.replace(/\\/g, '/');
            if (normalizedPath.startsWith('D:') || normalizedPath.startsWith('D:/')) {
                if (typeof UserControl === 'undefined') {
                    payload.write('权限检查失败: UserControl 未加载');
                    return false;
                }
                
                if (!UserControl.isAdmin()) {
                    payload.write('权限不足: 非管理员用户无法访问系统盘 D:');
                    return false;
                }
            }
            
            return true;
        };
        
        const commandHandler = (payload) => {
        const cmd = payload.args[0];
        
        // 首先检查命令权限
        if (!checkCommandPermission(cmd, payload)) {
            return;
        }
        
        switch(cmd){
            case 'exit':
                // exit 命令：关闭当前终端程序进程
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                    // 动态获取终端程序的 PID
                    let terminalProgramPid = null;
                    
                    // 方法1：直接从 terminalInstance.pid 获取（最可靠的方法）
                    if (terminalInstance && terminalInstance.pid) {
                        terminalProgramPid = terminalInstance.pid;
                    }
                    // 方法2：从 terminalInstance.tabManager.pid 获取
                    else if (terminalInstance && terminalInstance.tabManager && terminalInstance.tabManager.pid) {
                        terminalProgramPid = terminalInstance.tabManager.pid;
                    }
                    // 方法3：从 TERMINAL._instances 中查找当前实例对应的 PID
                    else if (typeof TERMINAL !== 'undefined' && TERMINAL._instances && TERMINAL._instances.size > 0) {
                        // 遍历所有实例，找到包含当前 terminalInstance 的实例
                        for (const [pid, instance] of TERMINAL._instances) {
                            if (instance && instance.tabManager) {
                                // 检查当前 terminalInstance 是否属于这个 tabManager
                                const tabs = instance.tabManager.tabs || [];
                                const found = tabs.some(tab => tab.terminalInstance === terminalInstance);
                                if (found) {
                                    terminalProgramPid = pid;
                                    break;
                                }
                            }
                        }
                        // 如果还是找不到，使用第一个实例的 PID（降级方案）
                        if (!terminalProgramPid) {
                            const firstInstance = TERMINAL._instances.values().next().value;
                            if (firstInstance && firstInstance.pid) {
                                terminalProgramPid = firstInstance.pid;
                            }
                        }
                    }
                    // 方法4：从 ProcessManager 中查找终端进程（最后降级方案）
                    if (!terminalProgramPid && typeof ProcessManager !== 'undefined' && typeof ProcessManager.listProcesses === 'function') {
                        try {
                            const processes = ProcessManager.listProcesses();
                            const terminalProcesses = processes.filter(p => {
                                const programName = p.programName || '';
                                return programName.toLowerCase() === 'terminal' && p.status === 'running';
                            });
                            // 如果有多个终端进程，使用第一个（无法确定是哪个）
                            if (terminalProcesses.length > 0) {
                                terminalProgramPid = terminalProcesses[0].pid;
                            }
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                    
                    if (terminalProgramPid) {
                        ProcessManager.killProgram(terminalProgramPid);
                    } else {
                        payload.write('exit: 无法获取终端进程ID');
                    }
                } else {
                    payload.write('exit: ProcessManager 不可用');
                }
                break;
            case 'clear':
                terminalInstance.clear();
                break;
            case 'pwd':
                payload.write(payload.env.cwd);
                break;
            case 'whoami':
                payload.write(payload.env.user);
                break;
            case 'login':
                // login 命令：切换用户
                (async () => {
                    try {
                        if (typeof UserControl === 'undefined') {
                            payload.write('login: UserControl 未加载');
                            return;
                        }
                        
                        await UserControl.ensureInitialized();
                        
                        if (payload.args.length < 2) {
                            payload.write('login: 用法: login <用户名>');
                            return;
                        }
                        
                        const username = payload.args[1];
                        const success = await UserControl.login(username);
                        
                        if (success) {
                            // 更新终端用户显示（setUser 会更新 env.user 并调用 _updatePrompt）
                            terminalInstance.setUser(username);
                            // payload.env 是对 terminalInstance.env 的引用，所以已经更新了
                            terminalInstance._saveEnvToMemory();
                            
                            const userLevel = UserControl.getCurrentUserLevel();
                            const levelText = userLevel === UserControl.USER_LEVEL.DEFAULT_ADMIN ? '默认管理员' :
                                             userLevel === UserControl.USER_LEVEL.ADMIN ? '管理员' : '用户';
                            payload.write(`已登录用户: ${username} (${levelText})`);
                        } else {
                            payload.write(`login: 登录失败: 用户 ${username} 不存在`);
                        }
                    } catch (error) {
                        payload.write(`login: 错误: ${error.message}`);
                    }
                })();
                break;
            case 'su':
                // su 命令：切换用户（与 login 相同）
                (async () => {
                    try {
                        if (typeof UserControl === 'undefined') {
                            payload.write('su: UserControl 未加载');
                            return;
                        }
                        
                        await UserControl.ensureInitialized();
                        
                        if (payload.args.length < 2) {
                            payload.write('su: 用法: su <用户名>');
                            return;
                        }
                        
                        const username = payload.args[1];
                        const success = await UserControl.login(username);
                        
                        if (success) {
                            // 更新终端用户显示（setUser 会更新 env.user 并调用 _updatePrompt）
                            terminalInstance.setUser(username);
                            // payload.env 是对 terminalInstance.env 的引用，所以已经更新了
                            terminalInstance._saveEnvToMemory();
                            
                            const userLevel = UserControl.getCurrentUserLevel();
                            const levelText = userLevel === UserControl.USER_LEVEL.DEFAULT_ADMIN ? '默认管理员' :
                                             userLevel === UserControl.USER_LEVEL.ADMIN ? '管理员' : '用户';
                            payload.write(`已切换用户: ${username} (${levelText})`);
                        } else {
                            payload.write(`su: 切换失败: 用户 ${username} 不存在`);
                        }
                    } catch (error) {
                        payload.write(`su: 错误: ${error.message}`);
                    }
                })();
                break;
            case 'users':
                // users 命令：列出所有用户
                (async () => {
                    try {
                        if (typeof UserControl === 'undefined') {
                            payload.write('users: UserControl 未加载');
                            return;
                        }
                        
                        await UserControl.ensureInitialized();
                        const users = UserControl.listUsers();
                        
                        if (users.length === 0) {
                            payload.write('users: 没有用户');
                            return;
                        }
                        
                        const currentUser = UserControl.getCurrentUser();
                        payload.write('用户列表:');
                        for (const user of users) {
                            const levelText = user.level === UserControl.USER_LEVEL.DEFAULT_ADMIN ? '默认管理员' :
                                             user.level === UserControl.USER_LEVEL.ADMIN ? '管理员' : '用户';
                            const current = user.username === currentUser ? ' (当前)' : '';
                            payload.write(`  ${user.username} - ${levelText}${current}`);
                        }
                    } catch (error) {
                        payload.write(`users: 错误: ${error.message}`);
                    }
                })();
                break;
            case 'echo':
                {
                    // echo 命令：输出文本
                    // 支持: echo [文本...] 或 echo -n [文本...] (不换行输出到同一行)
                    if (payload.args.length < 2) {
                        // 没有参数，只输出换行
                        payload.write('');
                        break;
                    }
                    
                    let args = payload.args.slice(1);
                    let noNewline = false;
                    
                    // 检查 -n 参数
                    if (args[0] === '-n') {
                        noNewline = true;
                        args = args.slice(1);
                    }
                    
                    if (args.length === 0) {
                        // 只有 -n 参数，不输出任何内容
                        break;
                    }
                    
                    // 合并所有参数，用空格连接
                    let output = args.join(' ');
                    
                    // 如果整个输出被引号包围，去除首尾引号
                    // 但保留内部的引号
                    if (output.length >= 2) {
                        const first = output[0];
                        const last = output[output.length - 1];
                        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
                            output = output.slice(1, -1);
                        }
                    }
                    
                    // 输出文本
                    // 注意：由于终端 write 方法总是创建新行，-n 参数的效果有限
                    // 这里我们使用内联样式来实现近似的不换行效果
                    if (noNewline) {
                        payload.write({text: output, style: {display: 'inline'}});
                    } else {
                        payload.write(output);
                    }
                }
                break;
            case 'demo':
                terminalInstance.demo();
                break;
            case 'toggleview':
                terminalInstance.toggleView();
                break;
            case 'cd':
                if(payload.args.length < 2 || payload.args.length > 3){
                    payload.write('cd: missing operand');
                }else{
                    // 异步处理，从 PHP 服务检查目录是否存在
                    (async () => {
                        try {
                            const newPath = payload.args[1];
                            
                            // 兼容..返回上级目录
                            if(newPath === '..'){
                                if(!payload.env.cwd.includes('/')){
                                    payload.write('cd: already at root directory');
                                    return;
                                }
                                const parts = payload.env.cwd.split('/');
                                parts.pop();
                                const parentPath = parts.join('/');
                                
                                // 检查系统盘D:访问权限
                                if (!checkSystemDiskAccess(parentPath, payload)) {
                                    return;
                                }
                                
                                payload.env.cwd = parentPath;
                                terminalInstance.env.cwd = payload.env.cwd;
                                terminalInstance._saveEnvToMemory(); // 保存到内存
                                safePoolAdd("KERNEL_GLOBAL_POOL","WORK_SPACE",payload.env.cwd);
                                terminalInstance._updatePrompt();
                                return;
                            }
                            
                            const resolved = resolvePath(payload.env.cwd, newPath);
                            
                            // 检查系统盘D:访问权限
                            if (!checkSystemDiskAccess(resolved, payload)) {
                                return;
                            }
                            
                            // 确保路径格式正确：如果是 D: 或 C:，转换为 D:/ 或 C:/
                            let phpPath = resolved;
                            if (/^[CD]:$/.test(phpPath)) {
                                phpPath = phpPath + '/';
                            }
                            
                            // 从 PHP 服务检查目录是否存在
                            const url = new URL('/system/service/FSDirve.php', window.location.origin);
                            url.searchParams.set('action', 'exists');
                            url.searchParams.set('path', phpPath);
                            
                            const response = await fetch(url.toString());
                            if (!response.ok) {
                                payload.write(`cd: no such file or directory: ${newPath}`);
                                return;
                            }
                            
                            const result = await response.json();
                            if (result.status !== 'success' || !result.data || !result.data.exists || result.data.type !== 'directory') {
                                payload.write(`cd: no such file or directory: ${newPath}`);
                                return;
                            }
                            
                            // 目录存在，切换工作目录
                            payload.env.cwd = resolved;
                            terminalInstance.env.cwd = payload.env.cwd;
                            terminalInstance._saveEnvToMemory(); // 保存到内存
                            safePoolAdd("KERNEL_GLOBAL_POOL","WORK_SPACE",payload.env.cwd);
                            terminalInstance._updatePrompt();
                        } catch (error) {
                            payload.write(`cd: error: ${error.message}`);
                        }
                    })();
                }
                break;
            case 'markdir':
                if(payload.args.length < 2 || payload.args.length > 3){
                    payload.write('markdir: missing operand');
                    return;
                }
                // 支持传入相对或多级路径，例如: markdir subdir 或 markdir foo/bar
                const dirArg = payload.args[1];
                const fullDirPath = resolvePath(payload.env.cwd, dirArg);
                
                // 检查系统盘D:访问权限
                if (!checkSystemDiskAccess(fullDirPath, payload)) {
                    return;
                }
                const partsDir = fullDirPath.split('/');
                const newName = partsDir.pop();
                const parentPath = partsDir.join('/') || partsDir[0];
                const COLL = safePoolGet('KERNEL_GLOBAL_POOL', fullDirPath.split('/')[0]);
                // 检查目录是否存在
                if(COLL.hasNode(fullDirPath)){
                    payload.write(`markdir: directory "${newName}" already exists`);
                    return;
                }
                // 创建（异步，等待 PHP 操作完成）
                (async () => {
                    try {
                        await COLL.create_dir(parentPath, newName);
                        payload.write(`markdir: directory "${newName}" created`);
                    } catch (e) {
                        payload.write(`markdir: failed to create directory "${newName}": ${e.message || e}`);
                    }
                })();
                break;
            case 'markfile':
                if(payload.args.length < 2 || payload.args.length > 3){
                    payload.write('markfile: missing operand');
                    return;
                }
                // 支持 markfile <name> 或 markfile path/to/name
                const fArg = payload.args[1];
                const fullFilePath = resolvePath(payload.env.cwd, fArg);
                
                // 检查系统盘D:访问权限
                if (!checkSystemDiskAccess(fullFilePath, payload)) {
                    return;
                }
                const parts = fullFilePath.split('/');
                const fname = parts.pop();
                const parent = parts.join('/') || parts[0];
                const COLL2 = safePoolGet('KERNEL_GLOBAL_POOL', fullFilePath.split('/')[0]);
                // 检查文件是否存在
                const targetNode = COLL2.getNode(parent);
                if(targetNode && targetNode.attributes && targetNode.attributes[fname]){
                    payload.write(`markfile: file "${fname}" already exists`);
                    return;
                }
                
                // 根据扩展名自动识别文件类型
                const FileTypeRef = safeGetType('FileType');
                let fileType = FileTypeRef && FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0; // 默认类型
                if(FileTypeRef && typeof FileTypeRef.getFileTypeByExtension === 'function'){
                    fileType = FileTypeRef.getFileTypeByExtension(fname);
                    // 如果识别为未知类型，使用文本类型作为默认值
                    if(FileTypeRef.GENRE && fileType === FileTypeRef.GENRE.UNKNOWN){
                        fileType = FileTypeRef.GENRE.TEXT;
                    }
                }
                
                // 创建文件对象：优先使用内核提供的 FileFormwork 构造器
                let fileObj = null;
                if(typeof FileFormwork !== 'undefined' && FileTypeRef){
                    try{ 
                        fileObj = new FileFormwork(fileType, fname, "", parent);
                        // 记录文件类型识别信息
                        const typeNames = FileTypeRef.GENRE ? {
                            [FileTypeRef.GENRE.TEXT]: 'TEXT',
                            [FileTypeRef.GENRE.IMAGE]: 'IMAGE',
                            [FileTypeRef.GENRE.CODE]: 'CODE',
                            [FileTypeRef.GENRE.BINARY]: 'BINARY',
                            [FileTypeRef.GENRE.JSON]: 'JSON',
                            [FileTypeRef.GENRE.XML]: 'XML',
                            [FileTypeRef.GENRE.MARKDOWN]: 'MARKDOWN',
                            [FileTypeRef.GENRE.CONFIG]: 'CONFIG',
                            [FileTypeRef.GENRE.DATA]: 'DATA',
                            [FileTypeRef.GENRE.UNKNOWN]: 'UNKNOWN',
                        } : {};
                        const typeName = typeNames[fileType] || 'TEXT';
                        payload.write(`markfile: 创建文件 "${fname}" (类型: ${typeName})`);
                    }catch(e){ 
                        fileObj = null;
                        payload.write(`markfile: 使用 FileFormwork 创建失败，降级为普通对象: ${e.message || e}`);
                    }
                }
                // 降级对象并设置时间戳
                if(!fileObj){
                    fileObj = {
                        fileName: fname,
                        fileSize: 0,
                        fileContent: [],
                        filePath: parent,
                        fileBelongDisk: parent.split("/")[0],
                        fileType: fileType, // 保存识别的文件类型
                        inited: true,
                        fileCreatTime: new Date().getTime(),
                        readFile(){ return this.fileContent.join("\n") + (this.fileContent.length?"\n":""); },
                        writeFile(newContent){ this.fileContent = []; for(const line of newContent.split(/\n/)) this.fileContent.push(line); this.fileSize = newContent.length; this.fileModifyTime = new Date().getTime(); }
                    };
                }
                // 调用创建（异步，等待 PHP 操作完成）
                (async () => {
                    try {
                        await COLL2.create_file(parent, fileObj);
                        payload.write(`markfile: file "${fname}" created`);
                    } catch (e) {
                        payload.write(`markfile: failed to create file "${fname}": ${e.message || e}`);
                    }
                })();
                break;
            case 'ls':
                {
                    // 异步处理，从 PHP 服务获取真实文件列表
                    (async () => {
                        try {
                            const args = payload.args.slice(1);
                            const longFlag = args.indexOf('-l') !== -1;
                            const targetArg = args.find(a => a !== '-l');
                            let targetPath = payload.env.cwd;
                            if(targetArg){
                                targetPath = resolvePath(payload.env.cwd, targetArg);
                            }
                            
                            // 检查系统盘D:访问权限
                            if (!checkSystemDiskAccess(targetPath, payload)) {
                                return;
                            }

                            // 从 PHP 服务获取目录列表
                            // 确保路径格式正确：如果是 D: 或 C:，转换为 D:/ 或 C:/
                            let phpPath = targetPath;
                            if (/^[CD]:$/.test(phpPath)) {
                                phpPath = phpPath + '/';
                            }
                            const url = new URL('/system/service/FSDirve.php', window.location.origin);
                            url.searchParams.set('action', 'list_dir');
                            url.searchParams.set('path', phpPath);
                            
                            const response = await fetch(url.toString());
                            if (!response.ok) {
                                payload.write(`ls: cannot access '${targetArg || targetPath}': ${response.statusText}`);
                                return;
                            }
                            
                            const result = await response.json();
                            if (result.status !== 'success' || !result.data || !result.data.items) {
                                payload.write(`ls: cannot access '${targetArg || targetPath}': ${result.message || 'Unknown error'}`);
                                return;
                            }
                            
                            const items = result.data.items;
                            
                            // 分离目录和文件
                            const directories = items.filter(item => item.type === 'directory');
                            const files = items.filter(item => item.type === 'file');
                            
                            // 如果没有 -l 标志，简单列出
                            if (!longFlag) {
                                if (directories.length === 0 && files.length === 0) {
                                    payload.write('');
                                    return;
                                }
                                const outParts = [];
                                for (const dir of directories) outParts.push(dir.name + '/');
                                for (const file of files) outParts.push(file.name);
                                payload.write(outParts.join('\t'));
                                return;
                            }
                            
                            // 长格式列表（带表头）
                            const owner = payload.env.user || 'root';
                            payload.write({
                                html: '<span style="color: #888;">PERMS</span> <span style="color: #888;">LINKS</span> <span style="color: #888;">OWNER</span> <span style="color: #888;">TYPE</span> <span style="color: #888;">SIZE</span> <span style="color: #888;">MODIFIED</span> <span style="color: #888;">NAME</span>',
                            });
                            
                            // 辅助函数：获取文件类型和颜色
                            const getFileTypeInfo = (filename) => {
                                let fileType = 'TEXT';
                                let typeColor = '#e6e6e6';
                                
                                const FileTypeRef = safeGetType('FileType');
                                if (FileTypeRef && typeof FileTypeRef.getFileTypeByExtension === 'function') {
                                    const typeValue = FileTypeRef.getFileTypeByExtension(filename);
                                    const typeNames = FileTypeRef.GENRE ? {
                                        [FileTypeRef.GENRE.TEXT]: 'TEXT',
                                        [FileTypeRef.GENRE.IMAGE]: 'IMAGE',
                                        [FileTypeRef.GENRE.CODE]: 'CODE',
                                        [FileTypeRef.GENRE.BINARY]: 'BINARY',
                                        [FileTypeRef.GENRE.JSON]: 'JSON',
                                        [FileTypeRef.GENRE.XML]: 'XML',
                                        [FileTypeRef.GENRE.MARKDOWN]: 'MARKDOWN',
                                        [FileTypeRef.GENRE.CONFIG]: 'CONFIG',
                                        [FileTypeRef.GENRE.DATA]: 'DATA',
                                    } : {};
                                    fileType = typeNames[typeValue] || 'TEXT';
                                    
                                    const typeColors = {
                                        'TEXT': '#e6e6e6',
                                        'IMAGE': '#4a9eff',
                                        'CODE': '#00ff00',
                                        'BINARY': '#ff6b6b',
                                        'JSON': '#ffd93d',
                                        'XML': '#6bcf7f',
                                        'MARKDOWN': '#95e1d3',
                                        'CONFIG': '#f38181',
                                        'DATA': '#aa96da',
                                    };
                                    typeColor = typeColors[fileType] || '#e6e6e6';
                                }
                                
                                return { fileType, typeColor };
                            };
                            
                            const fmtDate = (dateStr) => {
                                if (!dateStr) return '------------';
                                const d = new Date(dateStr);
                                return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                            };
                            
                            const rows = [];
                            
                            // 目录
                            for (const dir of directories) {
                                const perms = 'drwxr-xr-x';
                                const size = 0;
                                const mtime = dir.modified || null;
                                const { fileType, typeColor } = getFileTypeInfo(dir.name);
                                rows.push({
                                    html: `${perms} ${String(1).padStart(3,' ')} <span style="color: #4a9eff;">${owner}</span> <span style="color: ${typeColor};">DIR</span> ${String(size).padStart(8,' ')} ${fmtDate(mtime)} <span style="color: #00ff00;">${dir.name}/</span>`,
                                });
                            }
                            
                            // 文件
                            for (const file of files) {
                                const perms = '-rw-r--r--';
                                const size = file.size || 0;
                                const mtime = file.modified || null;
                                const { fileType, typeColor } = getFileTypeInfo(file.name);
                                rows.push({
                                    html: `${perms} ${String(1).padStart(3,' ')} <span style="color: #4a9eff;">${owner}</span> <span style="color: ${typeColor};">${fileType.padEnd(8)}</span> ${String(size).padStart(8,' ')} ${fmtDate(mtime)} ${file.name}`,
                                });
                            }
                            
                            if (rows.length === 0) {
                                payload.write('');
                                return;
                            }
                            
                            for (const r of rows) payload.write(r);
                        } catch (error) {
                            payload.write(`ls: error: ${error.message}`);
                        }
                    })();
                }
                break;
            case 'cat':
                // 异步处理，从 PHP 服务读取文件
                (async () => {
                    try {
                        // 查看文件，支持相对或绝对路径，支持 -md 参数渲染Markdown
                        if(payload.args.length < 2){ 
                            payload.write('cat: missing operand'); 
                            return; 
                        }
                        
                        const args = payload.args.slice(1);
                        let markdownMode = false;
                        let fArg = null;
                        
                        // 解析参数
                        for (const arg of args) {
                            if (arg === '-md') {
                                markdownMode = true;
                            } else if (!arg.startsWith('-')) {
                                fArg = arg;
                            }
                        }
                        
                        if (!fArg) {
                            payload.write('cat: missing file operand');
                            return;
                        }
                        
                        const full = resolvePath(payload.env.cwd, fArg);
                        
                        // 检查系统盘D:访问权限
                        if (!checkSystemDiskAccess(full, payload)) {
                            return;
                        }
                        const parts = full.split('/');
                        const fname = parts.pop();
                        const parent = parts.join('/') || parts[0];
                        
                        // 确保路径格式正确
                        let phpPath = parent;
                        if (/^[CD]:$/.test(phpPath)) {
                            phpPath = phpPath + '/';
                        }
                        
                        // 从 PHP 服务读取文件
                        const url = new URL('/system/service/FSDirve.php', window.location.origin);
                        url.searchParams.set('action', 'read_file');
                        url.searchParams.set('path', phpPath);
                        url.searchParams.set('fileName', fname);
                        
                        const response = await fetch(url.toString());
                        if (!response.ok) {
                            payload.write(`cat: ${fArg}: No such file`);
                            return;
                        }
                        
                        const result = await response.json();
                        if (result.status !== 'success' || !result.data || !result.data.content) {
                            payload.write(`cat: ${fArg}: No such file`);
                            return;
                        }
                        
                        const content = result.data.content;
                        
                        // 如果启用Markdown模式，渲染Markdown
                        if (markdownMode || (fname.endsWith('.md') || fname.endsWith('.markdown'))) {
                            const htmlContent = renderMarkdown(content);
                            payload.write({ html: htmlContent });
                        } else {
                            payload.write(content);
                        }
                    } catch (error) {
                        payload.write(`cat: error: ${error.message}`);
                    }
                })();
                break;
            case 'write':
                // 写入文件: usage `write filename content...` 或 `write -a filename content...` (append)
                if(payload.args.length < 3){ payload.write('write: missing operand'); return; }
                // 异步处理写入操作
                (async () => {
                    try {
                        const FileTypeRef = safeGetType('FileType');
                    let mode = (FileTypeRef && FileTypeRef.WRITE_MODES) ? FileTypeRef.WRITE_MODES.OVERWRITE : null;
                    let fileArg = null;
                    let content = null;
                    let append = false;
                    if(payload.args[1] === '-a'){
                        if(payload.args.length < 4){ payload.write('write: missing operand'); return; }
                        append = true;
                        fileArg = payload.args[2];
                        content = payload.args.slice(3).join(' ');
                        if(FileTypeRef && FileTypeRef.WRITE_MODES) mode = FileTypeRef.WRITE_MODES.APPEND;
                    }else{
                        fileArg = payload.args[1];
                        content = payload.args.slice(2).join(' ');
                        if(FileTypeRef && FileTypeRef.WRITE_MODES) mode = FileTypeRef.WRITE_MODES.OVERWRITE;
                    }

                    const fullPath = resolvePath(payload.env.cwd, fileArg);
                    
                    // 检查系统盘D:访问权限
                    if (!checkSystemDiskAccess(fullPath, payload)) {
                        return;
                    }
                    
                    const partsF = fullPath.split('/');
                    const fname = partsF.pop();
                    const parent = partsF.join('/') || partsF[0];
                    const COLLw = safePoolGet('KERNEL_GLOBAL_POOL', fullPath.split('/')[0]);
                    let nodeW = COLLw.getNode(parent);
                    if(!nodeW){ payload.write(`write: cannot access directory ${parent}`); return; }
                    // 如果文件不存在，先创建
                    if(!nodeW.attributes[fname]){
                        // 根据扩展名自动识别文件类型
                        const FileTypeRef = safeGetType('FileType');
                        let fileType = FileTypeRef && FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0; // 默认类型
                        if(FileTypeRef && typeof FileTypeRef.getFileTypeByExtension === 'function'){
                            fileType = FileTypeRef.getFileTypeByExtension(fname);
                            // 如果识别为未知类型，使用文本类型作为默认值
                            if(FileTypeRef.GENRE && fileType === FileTypeRef.GENRE.UNKNOWN){
                                fileType = FileTypeRef.GENRE.TEXT;
                            }
                        }
                        
                        // 尝试用内核 FileFormwork
                        let fileObj = null;
                        if(typeof FileFormwork !== 'undefined' && FileTypeRef){
                            try{ fileObj = new FileFormwork(fileType, fname, content, parent); }catch(e){ fileObj = null; }
                        }
                        if(!fileObj){
                            const appendMode = FileTypeRef && FileTypeRef.WRITE_MODES ? FileTypeRef.WRITE_MODES.APPEND : 1;
                            fileObj = {
                                fileName: fname,
                                fileSize: content.length,
                                fileContent: [],
                                filePath: parent,
                                fileBelongDisk: parent.split("/")[0],
                                fileType: fileType, // 保存识别的文件类型
                                inited: true,
                                fileCreatTime: new Date().getTime(),
                                readFile(){ return this.fileContent.join("\n") + (this.fileContent.length?"\n":""); },
                                writeFile(newContent, writeMod){ if(writeMod === appendMode){ for(const line of newContent.split(/\n/)) this.fileContent.push(line); this.fileSize += newContent.length; } else { this.fileContent = []; for(const line of newContent.split(/\n/)) this.fileContent.push(line); this.fileSize = newContent.length; } this.fileModifyTime = new Date().getTime(); }
                            };
                        }
                            // 创建文件（异步，等待 PHP 操作完成）
                            await COLLw.create_file(parent, fileObj);
                            nodeW = COLLw.getNode(parent);
                        }
                        const targetFile = nodeW.attributes[fname];
                        if(!targetFile){ payload.write(`write: cannot create or access file ${fname}`); return; }
                        try{
                            // 使用集合提供的写接口，这会调用 Node.optFile 并透传 writeMod
                            if(typeof COLLw.write_file === 'function'){
                                // 等待异步写入完成
                                await COLLw.write_file(parent, fname, content, mode);
                                payload.write(`write: file "${fname}" written`);
                            }else{
                                if(typeof targetFile.writeFile === 'function'){
                                    targetFile.writeFile(content, mode);
                                }else{
                                    targetFile.fileContent = [];
                                    for(const line of content.split(/\n/)) targetFile.fileContent.push(line);
                                    targetFile.fileSize = content.length;
                                    targetFile.fileModifyTime = new Date().getTime();
                                }
                                payload.write(`write: ${fname}`);
                            }
                        }catch(e){ payload.write(`write: failed to write ${fname}: ${e && e.message ? e.message : e}`); }
                    } catch (e) {
                        payload.write(`write: error: ${e && e.message ? e.message : e}`);
                    }
                })();
                break;
            case 'rm':
                // 删除文件或者目录，支持路径
                if(payload.args.length < 2){ payload.write('rm: missing operand'); return; }
                {
                    const targ = payload.args[1];
                    const full = resolvePath(payload.env.cwd, targ);
                    
                    // 检查系统盘D:访问权限
                    if (!checkSystemDiskAccess(full, payload)) {
                        return;
                    }
                    
                    const root = full.split('/')[0];
                    const COLLR = safePoolGet('KERNEL_GLOBAL_POOL', root);
                    try {
                        // 如果是目录
                        if(COLLR.hasNode(full)){
                            COLLR.delete_dir(full);
                            payload.write(`rm: removed directory ${targ}`);
                            return;
                        }
                        const parts = full.split('/');
                        const name = parts.pop();
                        const parent = parts.join('/') || parts[0];
                        const parentNode = COLLR.getNode(parent);
                        if(parentNode && parentNode.attributes && parentNode.attributes[name]){
                            COLLR.delete_file(parent, name);
                            payload.write(`rm: removed file ${targ}`);
                            return;
                        }
                        payload.write(`rm: cannot remove '${targ}': No such file or directory`);
                    } catch(e) {
                        // 捕获属性检查异常
                        payload.write(`rm: ${e.message || String(e)}`);
                    }
                }
                break;
            case 'rename':
                // 重命名文件或目录
                if(payload.args.length < 3){ payload.write('rename: missing operand\nUsage: rename <old_name> <new_name>'); return; }
                {
                    const oldName = payload.args[1];
                    const newName = payload.args[2];
                    const fullOld = resolvePath(payload.env.cwd, oldName);
                    const fullNew = resolvePath(payload.env.cwd, newName);
                    const root = fullOld.split('/')[0];
                    const COLLR = safePoolGet('KERNEL_GLOBAL_POOL', root);
                    
                    try {
                        // 检查新名称是否已经存在
                        if(COLLR.hasNode(fullNew) || COLLR.getNode(fullNew.split('/').slice(0, -1).join('/') || root)?.attributes?.[fullNew.split('/').pop()]){
                            payload.write(`rename: cannot rename '${oldName}': target '${newName}' already exists`);
                            return;
                        }
                        
                        // 检查是否是目录
                        if(COLLR.hasNode(fullOld)){
                            // 重命名目录
                            const success = COLLR.rename_dir(fullOld, fullNew.split('/').pop());
                            if(success){
                                payload.write(`rename: renamed directory '${oldName}' to '${newName}'`);
                            } else {
                                payload.write(`rename: cannot rename directory '${oldName}'`);
                            }
                            return;
                        }
                        
                        // 重命名文件
                        const parts = fullOld.split('/');
                        const fileName = parts.pop();
                        const parent = parts.join('/') || parts[0];
                        const parentNode = COLLR.getNode(parent);
                        if(!parentNode || !parentNode.attributes || !parentNode.attributes[fileName]){
                            payload.write(`rename: cannot rename '${oldName}': No such file or directory`);
                            return;
                        }
                        
                        const newFileName = fullNew.split('/').pop();
                        const success = COLLR.rename_file(parent, fileName, newFileName);
                        if(success){
                            payload.write(`rename: renamed file '${oldName}' to '${newName}'`);
                        } else {
                            payload.write(`rename: cannot rename file '${oldName}'`);
                        }
                    } catch(e) {
                        // 捕获属性检查异常
                        payload.write(`rename: ${e.message || String(e)}`);
                    }
                }
                break;
            case 'mv':
                // 移动文件或目录
                if(payload.args.length < 3){ payload.write('mv: missing operand\nUsage: mv <source> <destination>'); return; }
                {
                    const source = payload.args[1];
                    const dest = payload.args[2];
                    const fullSource = resolvePath(payload.env.cwd, source);
                    const fullDest = resolvePath(payload.env.cwd, dest);
                    
                    // 检查系统盘D:访问权限（源和目标）
                    if (!checkSystemDiskAccess(fullSource, payload)) {
                        return;
                    }
                    if (!checkSystemDiskAccess(fullDest, payload)) {
                        return;
                    }
                    
                    const root = fullSource.split('/')[0];
                    const COLLR = safePoolGet('KERNEL_GLOBAL_POOL', root);
                    
                    // 检查源是否存在
                    const isDir = COLLR.hasNode(fullSource);
                    const sourceParts = fullSource.split('/');
                    const sourceFileName = sourceParts.pop();
                    const sourceParent = sourceParts.join('/') || sourceParts[0];
                    const sourceNode = COLLR.getNode(sourceParent);
                    const isFile = sourceNode && sourceNode.attributes && sourceNode.attributes[sourceFileName];
                    
                    if(!isDir && !isFile){
                        payload.write(`mv: cannot stat '${source}': No such file or directory`);
                        return;
                    }
                    
                    // 解析目标路径
                    const destRoot = fullDest.split('/')[0];
                    const destParts = fullDest.split('/');
                    let destName = destParts.pop();
                    let destParent = destParts.join('/') || destParts[0];
                    
                    // 如果目标是已存在的目录，将源移动到该目录下
                    if(COLLR.hasNode(fullDest)){
                        destParent = fullDest;
                        destName = sourceFileName;
                    }
                    
                    // 检查目标目录是否存在
                    if(!COLLR.hasNode(destParent)){
                        payload.write(`mv: cannot move to '${dest}': No such directory`);
                        return;
                    }
                    
                    // 检查目标是否已存在
                    const destParentNode = COLLR.getNode(destParent);
                    if(destParentNode && destParentNode.attributes && destParentNode.attributes[destName]){
                        payload.write(`mv: cannot move to '${dest}': File already exists`);
                        return;
                    }
                    if(COLLR.hasNode(destParent === destRoot ? destName : `${destParent}/${destName}`)){
                        payload.write(`mv: cannot move to '${dest}': Directory already exists`);
                        return;
                    }
                    
                    // 执行移动
                    try {
                        if(isDir){
                            const success = COLLR.move_dir(fullSource, destParent, destName);
                            if(success){
                                payload.write(`mv: moved directory '${source}' to '${dest}'`);
                            } else {
                                payload.write(`mv: cannot move directory '${source}'`);
                            }
                        } else {
                            const success = COLLR.move_file(sourceParent, sourceFileName, destParent, destName);
                            if(success){
                                payload.write(`mv: moved file '${source}' to '${dest}'`);
                            } else {
                                payload.write(`mv: cannot move file '${source}'`);
                            }
                        }
                    } catch(e) {
                        // 捕获属性检查异常
                        payload.write(`mv: ${e.message || String(e)}`);
                    }
                }
                break;
            case 'copy':
                // 复制文件或目录到剪贴板
                if(payload.args.length < 2){ payload.write('copy: missing operand\nUsage: copy <file|dir>'); return; }
                {
                    const source = payload.args[1];
                    const fullSource = resolvePath(payload.env.cwd, source);
                    const root = fullSource.split('/')[0];
                    const COLLR = safePoolGet('KERNEL_GLOBAL_POOL', root);
                    
                    // 检查源是否存在
                    const isDir = COLLR.hasNode(fullSource);
                    const sourceParts = fullSource.split('/');
                    const sourceFileName = sourceParts.pop();
                    const sourceParent = sourceParts.join('/') || sourceParts[0];
                    const sourceNode = COLLR.getNode(sourceParent);
                    const isFile = sourceNode && sourceNode.attributes && sourceNode.attributes[sourceFileName];
                    
                    if(!isDir && !isFile){
                        payload.write(`copy: cannot stat '${source}': No such file or directory`);
                        return;
                    }
                    
                    // 存储到剪贴板（使用 Exploit 内存）
                    let name;
                    if(isDir){
                        // 对于目录，从完整路径中提取目录名
                        const dirParts = fullSource.split('/');
                        name = dirParts[dirParts.length - 1];
                    } else {
                        name = sourceFileName;
                    }
                    const clipboardData = {
                        type: isDir ? 'dir' : 'file',
                        source: fullSource,
                        sourceParent: isDir ? fullSource : sourceParent,
                        name: name,
                        root: root
                    };
                    
                    // 保存到 Exploit 内存
                    if (terminalInstance._saveClipboardToMemory(clipboardData)) {
                        payload.write(`copy: copied '${source}' to clipboard`);
                    } else {
                        payload.write(`copy: failed to save to clipboard`);
                    }
                }
                break;
            case 'paste':
                // 从剪贴板粘贴文件或目录（从 Exploit 内存读取）
                {
                    const clipboard = terminalInstance._loadClipboardFromMemory();
                    if(!clipboard){
                        payload.write('paste: clipboard is empty\nUsage: copy <file|dir> first');
                        return;
                    }
                    
                    const root = clipboard.root;
                    const COLLR = safePoolGet('KERNEL_GLOBAL_POOL', root);
                    const destPath = payload.env.cwd;
                    
                    // 检查目标目录是否存在
                    if(!COLLR.hasNode(destPath)){
                        payload.write(`paste: cannot paste to '${destPath}': No such directory`);
                        return;
                    }
                    
                    // 检查目标是否已存在
                    const destNode = COLLR.getNode(destPath);
                    try {
                        if(clipboard.type === 'file'){
                            if(destNode && destNode.attributes && destNode.attributes[clipboard.name]){
                                payload.write(`paste: cannot paste '${clipboard.name}': File already exists`);
                                return;
                            }
                            const success = COLLR.copy_file(clipboard.sourceParent, clipboard.name, destPath, clipboard.name);
                            if(success){
                                payload.write(`paste: pasted file '${clipboard.name}'`);
                            } else {
                                payload.write(`paste: cannot paste file '${clipboard.name}'`);
                            }
                        } else {
                            // 目录
                            const newPath = destPath === root ? clipboard.name : `${destPath}/${clipboard.name}`;
                            if(COLLR.hasNode(newPath)){
                                payload.write(`paste: cannot paste '${clipboard.name}': Directory already exists`);
                                return;
                            }
                            const success = COLLR.copy_dir(clipboard.source, destPath, clipboard.name);
                            if(success){
                                payload.write(`paste: pasted directory '${clipboard.name}'`);
                            } else {
                                payload.write(`paste: cannot paste directory '${clipboard.name}'`);
                            }
                        }
                    } catch(e) {
                        // 捕获属性检查异常（例如文件不可读）
                        payload.write(`paste: ${e.message || String(e)}`);
                    }
                }
                break;
            case 'kill':
                {
                    // kill 命令支持: kill [signal] <pid>
                    // - kill <pid>: 终止指定程序并释放其内存
                    // - kill -9 <pid>: 强制终止（与 kill <pid> 相同，保留接口兼容性）
                    if (payload.args.length < 2) {
                        payload.write('kill: missing operand');
                        payload.write('Usage: kill [signal] <pid>');
                        return;
                    }
                    
                    const args = payload.args.slice(1);
                    let targetPid = null;
                    let signal = null;
                    
                    // 解析参数
                    for (let i = 0; i < args.length; i++) {
                        const arg = args[i];
                        // 检查是否是信号参数（如 -9, -SIGKILL 等）
                        if (arg.startsWith('-')) {
                            signal = arg;
                            // 提取信号号（如 -9 -> 9）
                            const signalNum = arg.replace(/^-SIG?/i, '').replace(/^-/, '');
                            if (isNaN(parseInt(signalNum)) && signalNum !== 'KILL' && signalNum !== 'TERM') {
                                payload.write(`kill: invalid signal specification: ${arg}`);
                                return;
                            }
                        } else if (!isNaN(parseInt(arg))) {
                            targetPid = parseInt(arg);
                        } else {
                            payload.write(`kill: invalid argument: ${arg}`);
                            payload.write('Usage: kill [signal] <pid>');
                            return;
                        }
                    }
                    
                    if (targetPid === null) {
                        payload.write('kill: missing PID');
                        payload.write('Usage: kill [signal] <pid>');
                        return;
                    }
                    
                    // 优先使用 ProcessManager，如果不可用则降级到 MemoryManager
                    if (typeof ProcessManager !== 'undefined' && ProcessManager.hasProcess(targetPid)) {
                        // 使用 ProcessManager 终止程序
                        const processInfo = ProcessManager.getProcessInfo(targetPid);
                        if (processInfo) {
                            payload.write(`终止程序 ${targetPid} (${processInfo.programName})...`);
                            ProcessManager.killProgram(targetPid, signal === '-9' || signal === '-SIGKILL')
                                .then(success => {
                                    if (success) {
                                        payload.write(`程序 ${targetPid} 已终止`);
                                    } else {
                                        payload.write(`kill: 无法终止程序 ${targetPid}`);
                                    }
                                })
                                .catch(e => {
                                    payload.write(`kill: 终止程序 ${targetPid} 时出错: ${e.message}`);
                                });
                        } else {
                            payload.write(`kill: 程序 ${targetPid} 不存在`);
                        }
                    } else if (typeof MemoryManager !== 'undefined') {
                        // 降级到 MemoryManager（兼容旧代码）
                        const memoryInfo = MemoryManager.checkMemory(targetPid);
                        if (memoryInfo === null || memoryInfo.totalPrograms === 0) {
                            payload.write(`kill: 程序 ${targetPid} 不存在`);
                            return;
                        }
                        
                        // 显示要终止的程序信息
                        const program = memoryInfo.programs[0];
                        const heapCount = program.heaps ? program.heaps.length : 0;
                        const shedCount = program.sheds ? program.sheds.length : 0;
                        payload.write(`终止程序 ${targetPid} (${heapCount} 个堆, ${shedCount} 个栈)...`);
                        
                        // 释放内存
                        const success = MemoryManager.freeMemory(targetPid);
                        if (success) {
                            payload.write(`程序 ${targetPid} 已终止，内存已释放`);
                        } else {
                            payload.write(`kill: 无法终止程序 ${targetPid}`);
                        }
                    } else {
                        payload.write('kill: ProcessManager 和 MemoryManager 都不可用');
                    }
                }
                break;
            case 'ps':
                {
                    // ps 命令支持: ps [-l|--long] [-a|--all] [pid]
                    // - ps: 显示所有运行中的程序的简要信息（排除已退出的）
                    // - ps -l: 显示所有运行中的程序的详细信息
                    // - ps -a: 显示所有程序（包括已退出的），已退出的以树状结构显示
                    // - ps -a -l: 显示所有程序的详细信息，已退出的以树状结构显示
                    // - ps <pid>: 显示特定程序的简要信息
                    // - ps -l <pid>: 显示特定程序的详细信息
                    const args = payload.args.slice(1);
                    let longFormat = false;
                    let showAll = false;
                    let targetPid = -1;
                    
                    // 解析参数
                    for (let i = 0; i < args.length; i++) {
                        const arg = args[i];
                        if (arg === '-l' || arg === '--long') {
                            longFormat = true;
                        } else if (arg === '-a' || arg === '--all') {
                            showAll = true;
                        } else if (!isNaN(parseInt(arg))) {
                            targetPid = parseInt(arg);
                        } else if (arg.startsWith('-')) {
                            payload.write(`ps: invalid option -- ${arg}`);
                            payload.write('Usage: ps [-l|--long] [-a|--all] [pid]');
                            return;
                        }
                    }
                    
                    // 优先使用 ProcessManager，如果不可用则降级到 MemoryManager
                    let processes = [];
                    let useProcessManager = false;
                    
                    if (typeof ProcessManager !== 'undefined') {
                        useProcessManager = true;
                        if (targetPid !== -1) {
                            const processInfo = ProcessManager.getProcessInfo(targetPid);
                            if (processInfo) {
                                processes = [processInfo];
                            } else {
                                payload.write(`ps: 程序 ${targetPid} 不存在`);
                                return;
                            }
                        } else {
                            processes = ProcessManager.getProcessInfo();
                        }
                        
                        // 默认情况下，过滤掉已退出的程序
                        if (!showAll) {
                            processes = processes.filter(p => p.status !== 'exited');
                        }
                        
                        if (processes.length === 0) {
                            payload.write('ps: 没有运行的程序');
                            return;
                        }
                    } else if (typeof MemoryManager !== 'undefined') {
                        // 降级到 MemoryManager（兼容旧代码）
                        const memoryInfo = MemoryManager.checkMemory(targetPid);
                        if (memoryInfo === null) {
                            payload.write(`ps: 程序 ${targetPid} 不存在`);
                            return;
                        }
                        
                        if (memoryInfo.totalPrograms === 0) {
                            payload.write('ps: 没有运行的程序');
                            return;
                        }
                        
                        // 转换为 ProcessManager 格式
                        processes = memoryInfo.programs.map(prog => ({
                            pid: prog.pid,
                            programName: prog.programName || `Program-${prog.pid}`,
                            status: 'running',
                            memoryInfo: {
                                totalPrograms: 1,
                                programs: [prog]
                            }
                        }));
                    } else {
                        payload.write('ps: ProcessManager 和 MemoryManager 都不可用');
                        return;
                    }
                    
                    // 分离运行中的程序和已退出的程序
                    const runningProcesses = processes.filter(p => p.status !== 'exited');
                    const exitedProcesses = showAll ? processes.filter(p => p.status === 'exited') : [];
                    
                    // 显示表头（仅对运行中的程序）
                    if (runningProcesses.length > 0) {
                        if (longFormat) {
                            payload.write('PID\tNAME\t\tSTATUS\tHEAPS\tSHEDS\tHEAP_SIZE\tHEAP_USED\tHEAP_FREE\tSHED_SIZE');
                            payload.write('---\t----\t\t------\t-----\t------\t---------\t----------\t----------\t---------');
                        } else {
                            payload.write('PID\tNAME\t\tSTATUS\tHEAPS\tSHEDS\tTOTAL_HEAP\tTOTAL_SHED');
                            payload.write('---\t----\t\t------\t-----\t------\t----------\t-----------');
                        }
                    }
                    
                    // 显示运行中的程序
                    runningProcesses.forEach(processInfo => {
                        const pid = processInfo.pid;
                        const programName = processInfo.programName || `Program-${pid}`;
                        const status = processInfo.status || 'unknown';
                        const memInfo = processInfo.memoryInfo;
                        
                        let heapCount = 0;
                        let shedCount = 0;
                        let totalHeap = 0;
                        let totalShed = 0;
                        let heapUsed = 0;
                        let heapFree = 0;
                        let shedSize = 0;
                        
                        if (memInfo && memInfo.programs && memInfo.programs.length > 0) {
                            const prog = memInfo.programs[0];
                            heapCount = prog.heaps ? prog.heaps.length : 0;
                            shedCount = prog.sheds ? prog.sheds.length : 0;
                            totalHeap = prog.totalHeapSize || 0;
                            totalShed = prog.totalShedSize || 0;
                            heapUsed = prog.heapUsedSize || prog.totalHeapUsed || 0;
                            heapFree = prog.heapFreeSize || prog.totalHeapFree || 0;
                            shedSize = prog.shedSize || prog.totalShedSize || 0;
                            
                            if (longFormat) {
                                payload.write(`${pid}\t${programName.padEnd(12)}\t${status}\t${heapCount}\t${shedCount}\t${totalHeap}\t\t${heapUsed}\t\t${heapFree}\t\t${shedSize}`);
                            
                                // 显示每个堆的详细信息
                                if (prog.heaps && prog.heaps.length > 0) {
                                    payload.write(`  Heaps:`);
                                    for (const heap of prog.heaps) {
                                        payload.write(`    ${heap.heapId}: size=${heap.heapSize} used=${heap.used} free=${heap.free}`);
                                    }
                                }
                                
                                // 显示每个栈的详细信息
                                if (prog.sheds && prog.sheds.length > 0) {
                                    payload.write(`  Sheds:`);
                                    for (const shed of prog.sheds) {
                                        payload.write(`    ${shed.stackId}: size=${shed.stackSize} code=${shed.codeSize} resources=${shed.resourceLinkSize}`);
                                    }
                                }
                            } else {
                                // 简要格式
                                payload.write(`${pid}\t${programName.padEnd(12)}\t${status}\t${heapCount}\t${shedCount}\t${totalHeap}\t${totalShed}`);
                            }
                        } else {
                            // 没有内存信息，只显示基本信息
                            if (longFormat) {
                                payload.write(`${pid}\t${programName.padEnd(12)}\t${status}\t0\t0\t0\t\t0\t\t0\t\t0`);
                            } else {
                                payload.write(`${pid}\t${programName.padEnd(12)}\t${status}\t0\t0\t0\t\t0`);
                            }
                        }
                    });
                    
                    // 如果使用 -a 参数，显示已退出的程序（树状结构）
                    if (showAll && exitedProcesses.length > 0) {
                        if (runningProcesses.length > 0) {
                            payload.write(''); // 空行分隔
                        }
                        payload.write('已退出的程序:');
                        exitedProcesses.forEach(processInfo => {
                            const pid = processInfo.pid;
                            const programName = processInfo.programName || `Program-${pid}`;
                            const status = processInfo.status || 'unknown';
                            const exitTime = processInfo.exitTime ? new Date(processInfo.exitTime).toLocaleString() : '未知';
                            const startTime = processInfo.startTime ? new Date(processInfo.startTime).toLocaleString() : '未知';
                            
                            // 树状结构：使用 └─ 或 ├─ 前缀
                            const isLast = exitedProcesses.indexOf(processInfo) === exitedProcesses.length - 1;
                            const prefix = isLast ? '└─' : '├─';
                            
                            payload.write(`${prefix} ${pid}\t${programName.padEnd(12)}\t${status}`);
                            payload.write(`${isLast ? '  ' : '│ '}  启动时间: ${startTime}`);
                            payload.write(`${isLast ? '  ' : '│ '}  退出时间: ${exitTime}`);
                            
                            // 如果有内存信息，也显示
                            const memInfo = processInfo.memoryInfo;
                            if (memInfo && memInfo.programs && memInfo.programs.length > 0) {
                                const prog = memInfo.programs[0];
                                const heapCount = prog.heaps ? prog.heaps.length : 0;
                                const shedCount = prog.sheds ? prog.sheds.length : 0;
                                payload.write(`${isLast ? '  ' : '│ '}  内存: ${heapCount} 堆, ${shedCount} 栈`);
                            }
                        });
                    }
                    
                    // 显示总计（只计算运行中的程序，如果有多个）
                    if (runningProcesses.length > 1) {
                        let totalHeapSize = 0;
                        let totalHeapUsed = 0;
                        let totalHeapFree = 0;
                        let totalShedSize = 0;
                        let totalHeapCount = 0;
                        let totalShedCount = 0;
                        
                        runningProcesses.forEach(processInfo => {
                            const memInfo = processInfo.memoryInfo;
                            if (memInfo && memInfo.programs && memInfo.programs.length > 0) {
                                const prog = memInfo.programs[0];
                                const safeHeapSize = (typeof prog.totalHeapSize === 'number' && !Number.isNaN(prog.totalHeapSize)) ? prog.totalHeapSize : 0;
                                const safeHeapUsed = (typeof prog.heapUsedSize === 'number' && !Number.isNaN(prog.heapUsedSize)) ? prog.heapUsedSize : (typeof prog.totalHeapUsed === 'number' && !Number.isNaN(prog.totalHeapUsed)) ? prog.totalHeapUsed : 0;
                                const safeHeapFree = (typeof prog.heapFreeSize === 'number' && !Number.isNaN(prog.heapFreeSize)) ? prog.heapFreeSize : (typeof prog.totalHeapFree === 'number' && !Number.isNaN(prog.totalHeapFree)) ? prog.totalHeapFree : 0;
                                const safeShedSize = (typeof prog.shedSize === 'number' && !Number.isNaN(prog.shedSize)) ? prog.shedSize : (typeof prog.totalShedSize === 'number' && !Number.isNaN(prog.totalShedSize)) ? prog.totalShedSize : 0;
                                
                                totalHeapSize += safeHeapSize;
                                totalHeapUsed += safeHeapUsed;
                                totalHeapFree += safeHeapFree;
                                totalShedSize += safeShedSize;
                                totalHeapCount += (prog.heaps ? prog.heaps.length : 0);
                                totalShedCount += (prog.sheds ? prog.sheds.length : 0);
                            }
                        });
                        
                        if (longFormat) {
                            payload.write(`---\t----\t\t-----\t------\t---------\t----------\t----------\t---------`);
                            payload.write(`TOTAL\t${String('').padEnd(12)}\t${totalHeapCount}\t${totalShedCount}\t${totalHeapSize}\t${totalHeapUsed}\t${totalHeapFree}\t${totalShedSize}`);
                        } else {
                            payload.write(`---\t----\t\t-----\t------\t----------\t-----------`);
                            payload.write(`TOTAL\t${String('').padEnd(12)}\t${totalHeapCount}\t${totalShedCount}\t${totalHeapSize}\t${totalShedSize}`);
                        }
                    }
                }
                break;
            case 'tree':
                {
                    // 异步处理，从 PHP 服务获取真实文件系统树
                    (async () => {
                        try {
                            // tree 命令支持: tree [path] [-L depth]
                            // - tree: 显示当前目录的树状结构
                            // - tree <path>: 显示指定路径的树状结构
                            // - tree -L <depth>: 限制显示深度
                            const args = payload.args.slice(1);
                            let targetPath = payload.env.cwd;
                            let maxDepth = -1; // -1 表示无限制
                            
                            // 解析参数
                            for (let i = 0; i < args.length; i++) {
                                const arg = args[i];
                                if (arg === '-L' && i + 1 < args.length) {
                                    const depth = parseInt(args[i + 1]);
                                    if (!isNaN(depth) && depth > 0) {
                                        maxDepth = depth;
                                        i++; // 跳过下一个参数
                                    }
                                } else if (!arg.startsWith('-')) {
                                    targetPath = resolvePath(payload.env.cwd, arg);
                                }
                            }
                            
                            // 辅助函数：从 PHP 服务获取目录列表
                            const getDirectoryList = async (path) => {
                                // 确保路径格式正确：如果是 D: 或 C:，转换为 D:/ 或 C:/
                                let phpPath = path;
                                if (/^[CD]:$/.test(phpPath)) {
                                    phpPath = phpPath + '/';
                                }
                                const url = new URL('/system/service/FSDirve.php', window.location.origin);
                                url.searchParams.set('action', 'list_dir');
                                url.searchParams.set('path', phpPath);
                                
                                const response = await fetch(url.toString());
                                if (!response.ok) {
                                    return null;
                                }
                                
                                const result = await response.json();
                                if (result.status !== 'success' || !result.data || !result.data.items) {
                                    return null;
                                }
                                
                                return result.data.items;
                            };
                            
                            // 检查目标目录是否存在
                            const initialItems = await getDirectoryList(targetPath);
                            if (!initialItems) {
                                payload.write(`tree: cannot access '${targetPath}': No such file or directory`);
                                return;
                            }
                    
                            // 辅助函数：获取文件类型和颜色
                            const getFileTypeInfo = (filename) => {
                                let fileType = 'TEXT';
                                let typeColor = '#e6e6e6';
                                
                                const FileTypeRef = safeGetType('FileType');
                                if (FileTypeRef && typeof FileTypeRef.getFileTypeByExtension === 'function') {
                                    const typeValue = FileTypeRef.getFileTypeByExtension(filename);
                                    const typeNames = FileTypeRef.GENRE ? {
                                        [FileTypeRef.GENRE.TEXT]: 'TEXT',
                                        [FileTypeRef.GENRE.IMAGE]: 'IMAGE',
                                        [FileTypeRef.GENRE.CODE]: 'CODE',
                                        [FileTypeRef.GENRE.BINARY]: 'BINARY',
                                        [FileTypeRef.GENRE.JSON]: 'JSON',
                                        [FileTypeRef.GENRE.XML]: 'XML',
                                        [FileTypeRef.GENRE.MARKDOWN]: 'MARKDOWN',
                                        [FileTypeRef.GENRE.CONFIG]: 'CONFIG',
                                        [FileTypeRef.GENRE.DATA]: 'DATA',
                                    } : {};
                                    fileType = typeNames[typeValue] || 'TEXT';
                                    
                                    const typeColors = {
                                        'TEXT': '#e6e6e6',
                                        'IMAGE': '#4a9eff',
                                        'CODE': '#00ff00',
                                        'BINARY': '#ff6b6b',
                                        'JSON': '#ffd93d',
                                        'XML': '#6bcf7f',
                                        'MARKDOWN': '#95e1d3',
                                        'CONFIG': '#f38181',
                                        'DATA': '#aa96da',
                                    };
                                    typeColor = typeColors[fileType] || '#e6e6e6';
                                }
                                
                                return { fileType, typeColor };
                            };
                            
                            // 递归构建树结构
                            const buildTree = async (path, prefix = '', isLast = true, depth = 0) => {
                                if (maxDepth >= 0 && depth > maxDepth) {
                                    return;
                                }
                                
                                const items = await getDirectoryList(path);
                                if (!items) {
                                    return;
                                }
                                
                                // 分离目录和文件
                                const directories = items.filter(item => item.type === 'directory');
                                const files = items.filter(item => item.type === 'file');
                                const allItems = [...directories, ...files];
                                
                                // 显示当前目录名（只在第一次调用时显示）
                                if (depth === 0) {
                                    const pathParts = path.split('/');
                                    const dirName = pathParts[pathParts.length - 1] || path;
                                    payload.write({
                                        html: `<span style="color: #00ff00; font-weight: bold; font-size: 1.1em;">${dirName}</span>`,
                                    });
                                }
                                
                                // 遍历所有项目
                                for (let i = 0; i < allItems.length; i++) {
                                    const item = allItems[i];
                                    const isLastItem = i === allItems.length - 1;
                                    const connector = isLastItem ? '<span style="color: #888;">└──</span> ' : '<span style="color: #888;">├──</span> ';
                                    const nextPrefix = isLastItem ? prefix + '<span style="color: #888;">    </span>' : prefix + '<span style="color: #888;">│   </span>';
                                    
                                    if (item.type === 'directory') {
                                        // 目录
                                        const dirName = item.name;
                                        const dirPath = item.path || (path + '/' + dirName);
                                        
                                        payload.write({
                                            html: `${prefix}${connector}<span style="color: #00ff00; font-weight: bold;">${dirName}/</span> <span style="color: #00ff00; font-size: 0.85em; opacity: 0.8;">[DIR]</span>`,
                                        });
                                        
                                        // 递归处理子目录
                                        await buildTree(dirPath, nextPrefix, isLastItem, depth + 1);
                                    } else {
                                        // 文件
                                        const fileName = item.name;
                                        const { fileType, typeColor } = getFileTypeInfo(fileName);
                                        const size = item.size || 0;
                                        
                                        // 格式化文件大小
                                        let sizeStr = size.toString();
                                        if (size >= 1024 * 1024) {
                                            sizeStr = (size / (1024 * 1024)).toFixed(2) + 'M';
                                        } else if (size >= 1024) {
                                            sizeStr = (size / 1024).toFixed(2) + 'K';
                                        }
                                        
                                        payload.write({
                                            html: `${prefix}${connector}<span style="color: ${typeColor};">${fileName}</span> <span style="color: #888; font-size: 0.8em; opacity: 0.7;">(${sizeStr}, ${fileType})</span>`,
                                        });
                                    }
                                }
                            };
                            
                            // 统计信息
                            let dirCount = 0;
                            let fileCount = 0;
                            
                            const countItems = async (path, depth = 0) => {
                                if (maxDepth >= 0 && depth > maxDepth) return;
                                
                                const items = await getDirectoryList(path);
                                if (!items) return;
                                
                                const directories = items.filter(item => item.type === 'directory');
                                const files = items.filter(item => item.type === 'file');
                                
                                dirCount += directories.length;
                                fileCount += files.length;
                                
                                for (const dir of directories) {
                                    const dirPath = dir.path || (path + '/' + dir.name);
                                    await countItems(dirPath, depth + 1);
                                }
                            };
                            
                            await countItems(targetPath);
                            
                            // 显示树结构
                            await buildTree(targetPath);
                            
                            // 显示统计信息
                            payload.write('');
                            payload.write({
                                html: `<span style="color: #888;">${dirCount} directories, ${fileCount} files</span>`,
                            });
                        } catch (error) {
                            payload.write(`tree: error: ${error.message}`);
                        }
                    })();
                }
                break;
            case 'check':
                {
                    // check 命令：全面自检内核并给出详细的检查报告
                    payload.write('=== ZerOS 内核自检报告 ===');
                    payload.write('');
                    
                    const report = [];
                    let totalChecks = 0;
                    let passedChecks = 0;
                    let failedChecks = 0;
                    let warnings = 0;
                    
                    // 检查函数辅助
                    const check = (name, condition, details = '') => {
                        totalChecks++;
                        if (condition) {
                            passedChecks++;
                            report.push(`[✓] ${name}: 正常${details ? ' - ' + details : ''}`);
                        } else {
                            failedChecks++;
                            report.push(`[✗] ${name}: 失败${details ? ' - ' + details : ''}`);
                        }
                    };
                    
                    const warn = (name, message) => {
                        warnings++;
                        report.push(`[!] ${name}: 警告 - ${message}`);
                    };
                    
                    const info = (name, message) => {
                        report.push(`[i] ${name}: ${message}`);
                    };
                    
                    // ========== 1. 核心模块检查 ==========
                    report.push('');
                    report.push('--- 核心模块检查 ---');
                    
                    // KernelLogger
                    check('KernelLogger', typeof KernelLogger !== 'undefined', 
                        typeof KernelLogger !== 'undefined' ? '已加载' : '未加载');
                    if (typeof KernelLogger !== 'undefined') {
                        check('KernelLogger.info', typeof KernelLogger.info === 'function');
                        check('KernelLogger.error', typeof KernelLogger.error === 'function');
                        check('KernelLogger.warn', typeof KernelLogger.warn === 'function');
                        check('KernelLogger.debug', typeof KernelLogger.debug === 'function');
                    }
                    
                    // DependencyConfig
                    check('DependencyConfig', typeof DependencyConfig !== 'undefined',
                        typeof DependencyConfig !== 'undefined' ? '已加载' : '未加载');
                    if (typeof DependencyConfig !== 'undefined') {
                        check('DependencyConfig.generate', typeof DependencyConfig.generate === 'function');
                        check('DependencyConfig.publishSignal', typeof DependencyConfig.publishSignal === 'function');
                    }
                    
                    // POOL
                    check('POOL', typeof POOL !== 'undefined',
                        typeof POOL !== 'undefined' ? '已加载' : '未加载');
                    if (typeof POOL !== 'undefined') {
                        check('POOL.__GET__', typeof POOL.__GET__ === 'function');
                        check('POOL.__ADD__', typeof POOL.__ADD__ === 'function');
                        check('POOL.__INIT__', typeof POOL.__INIT__ === 'function');
                        check('POOL.__HAS__', typeof POOL.__HAS__ === 'function');
                        
                        // 检查 POOL 初始化状态
                        try {
                            // 使用 __HAS__ 方法检查类别是否存在（更可靠）
                            const categoryExists = typeof POOL.__HAS__ === 'function' && POOL.__HAS__("KERNEL_GLOBAL_POOL");
                            
                            if (categoryExists) {
                                const dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
                                // dependency 可能是 undefined（如果未添加），但不应该是 { isInit: false }
                                const isDependencyValid = dependency !== undefined && 
                                                         dependency !== null && 
                                                         (typeof dependency !== 'object' || 
                                                          dependency.isInit !== false);
                                check('POOL.KERNEL_GLOBAL_POOL.Dependency', isDependencyValid,
                                    isDependencyValid ? '已注册' : '未注册');
                                
                                const workspace = POOL.__GET__("KERNEL_GLOBAL_POOL", "WORK_SPACE");
                                check('POOL.KERNEL_GLOBAL_POOL.WORK_SPACE', typeof workspace === 'string' && workspace.length > 0,
                                    workspace ? `当前值: ${workspace}` : '未设置');
                            } else {
                                warn('POOL.KERNEL_GLOBAL_POOL', '类别未初始化');
                            }
                        } catch (e) {
                            warn('POOL.KERNEL_GLOBAL_POOL', `访问失败: ${e.message}`);
                        }
                    }
                    
                    // ========== 2. 枚举管理器检查 ==========
                    report.push('');
                    report.push('--- 枚举管理器检查 ---');
                    
                    check('EnumManager', typeof EnumManager !== 'undefined',
                        typeof EnumManager !== 'undefined' ? '已加载' : '未加载');
                    if (typeof EnumManager !== 'undefined') {
                        check('EnumManager.createEnum', typeof EnumManager.createEnum === 'function');
                        check('EnumManager.getEnum', typeof EnumManager.getEnum === 'function');
                        check('EnumManager.hasEnum', typeof EnumManager.hasEnum === 'function');
                    }
                    
                    // FileType（从 POOL 或全局对象获取）
                    let FileType = null;
                    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                        try {
                            FileType = POOL.__GET__("TYPE_POOL", "FileType");
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                    if (!FileType && typeof window !== 'undefined' && window.FileType) {
                        FileType = window.FileType;
                    }
                    if (!FileType && typeof globalThis !== 'undefined' && globalThis.FileType) {
                        FileType = globalThis.FileType;
                    }
                    
                    check('FileType', FileType !== null && FileType !== undefined,
                        FileType ? '已加载（从 POOL 或全局对象）' : '未加载');
                    if (FileType) {
                        check('FileType.GENRE', typeof FileType.GENRE !== 'undefined',
                            FileType.GENRE ? `${Object.keys(FileType.GENRE).length} 个类型` : '未定义');
                        check('FileType.DIR_OPS', typeof FileType.DIR_OPS !== 'undefined',
                            FileType.DIR_OPS ? `${Object.keys(FileType.DIR_OPS).length} 个操作` : '未定义');
                        check('FileType.FILE_OPS', typeof FileType.FILE_OPS !== 'undefined',
                            FileType.FILE_OPS ? `${Object.keys(FileType.FILE_OPS).length} 个操作` : '未定义');
                        check('FileType.WRITE_MODES', typeof FileType.WRITE_MODES !== 'undefined',
                            FileType.WRITE_MODES ? `${Object.keys(FileType.WRITE_MODES).length} 个模式` : '未定义');
                    }
                    
                    // LogLevel（从 POOL 或全局对象获取）
                    let LogLevel = null;
                    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                        try {
                            LogLevel = POOL.__GET__("TYPE_POOL", "LogLevel");
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                    if (!LogLevel && typeof window !== 'undefined' && window.LogLevel) {
                        LogLevel = window.LogLevel;
                    }
                    if (!LogLevel && typeof globalThis !== 'undefined' && globalThis.LogLevel) {
                        LogLevel = globalThis.LogLevel;
                    }
                    
                    check('LogLevel', LogLevel !== null && LogLevel !== undefined,
                        LogLevel ? '已加载（从 POOL 或全局对象）' : '未加载');
                    if (LogLevel) {
                        check('LogLevel.LEVEL', typeof LogLevel.LEVEL !== 'undefined',
                            LogLevel.LEVEL ? `${Object.keys(LogLevel.LEVEL).length} 个级别` : '未定义');
                    }
                    
                    // AddressType（从 POOL 或全局对象获取）
                    let AddressType = null;
                    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                        try {
                            AddressType = POOL.__GET__("TYPE_POOL", "AddressType");
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                    if (!AddressType && typeof window !== 'undefined' && window.AddressType) {
                        AddressType = window.AddressType;
                    }
                    if (!AddressType && typeof globalThis !== 'undefined' && globalThis.AddressType) {
                        AddressType = globalThis.AddressType;
                    }
                    
                    check('AddressType', AddressType !== null && AddressType !== undefined,
                        AddressType ? '已加载（从 POOL 或全局对象）' : '未加载');
                    if (AddressType) {
                        check('AddressType.TYPE', typeof AddressType.TYPE !== 'undefined',
                            AddressType.TYPE ? `${Object.keys(AddressType.TYPE).length} 个类型` : '未定义');
                    }
                    
                    // ========== 3. 文件系统检查 ==========
                    report.push('');
                    report.push('--- 文件系统检查 ---');
                    
                    check('Disk', typeof Disk !== 'undefined',
                        typeof Disk !== 'undefined' ? '已加载' : '未加载');
                    if (typeof Disk !== 'undefined') {
                        check('Disk.init', typeof Disk.init === 'function');
                        check('Disk.format', typeof Disk.format === 'function');
                        check('Disk.canUsed', Disk.canUsed === true, 
                            Disk.canUsed ? '可用' : '不可用');
                        
                        // 检查磁盘分区
                        if (Disk.diskSeparateMap) {
                            const partitions = Array.from(Disk.diskSeparateMap.keys());
                            info('磁盘分区', `${partitions.length} 个分区: ${partitions.join(', ')}`);
                            partitions.forEach(part => {
                                const size = Disk.diskSeparateSize.get(part);
                                const free = Disk.diskFreeMap.get(part);
                                if (size !== undefined && free !== undefined) {
                                    const used = size - free;
                                    const percent = ((used / size) * 100).toFixed(2);
                                    info(`  分区 ${part}`, `总大小: ${(size / 1024 / 1024).toFixed(2)} MB, 已用: ${(used / 1024 / 1024).toFixed(2)} MB (${percent}%), 可用: ${(free / 1024 / 1024).toFixed(2)} MB`);
                                }
                            });
                        }
                    }
                    
                    check('NodeTreeCollection', typeof NodeTreeCollection !== 'undefined',
                        typeof NodeTreeCollection !== 'undefined' ? '已加载' : '未加载');
                    if (typeof NodeTreeCollection !== 'undefined') {
                        check('NodeTreeCollection 构造函数', typeof NodeTreeCollection === 'function');
                    }
                    
                    // FileFramework (实际类名是 FileFormwork，拼写错误但保持兼容)
                    // 尝试从多个位置获取
                    let FileFramework = null;
                    // 1. 尝试从 POOL 获取
                    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                        try {
                            FileFramework = POOL.__GET__("KERNEL_GLOBAL_POOL", "FileFormwork");
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                    // 2. 尝试从全局对象获取（使用错误的拼写）
                    if (!FileFramework && typeof window !== 'undefined' && window.FileFormwork) {
                        FileFramework = window.FileFormwork;
                    }
                    if (!FileFramework && typeof globalThis !== 'undefined' && globalThis.FileFormwork) {
                        FileFramework = globalThis.FileFormwork;
                    }
                    // 3. 尝试使用正确的拼写（如果将来修复了）
                    if (!FileFramework && typeof window !== 'undefined' && window.FileFramework) {
                        FileFramework = window.FileFramework;
                    }
                    if (!FileFramework && typeof globalThis !== 'undefined' && globalThis.FileFramework) {
                        FileFramework = globalThis.FileFramework;
                    }
                    
                    // FileFramework 不是关键模块，失败不影响系统运行
                    check('FileFramework', FileFramework !== null && FileFramework !== undefined, false);
                    if (FileFramework) {
                        check('FileFramework 构造函数', typeof FileFramework === 'function');
                    } else {
                        // FileFramework 可能还未加载，这是正常的
                        info('FileFramework', '模块可能还未加载（非关键模块）');
                    }
                    
                    check('LStorage', typeof LStorage !== 'undefined',
                        typeof LStorage !== 'undefined' ? '已加载' : '未加载');
                    if (typeof LStorage !== 'undefined') {
                        check('LStorage.setSystemStorage', typeof LStorage.setSystemStorage === 'function');
                        check('LStorage.getSystemStorage', typeof LStorage.getSystemStorage === 'function');
                    }
                    
                    // ========== 4. 内存管理检查 ==========
                    report.push('');
                    report.push('--- 内存管理检查 ---');
                    
                    check('MemoryManager', typeof MemoryManager !== 'undefined',
                        typeof MemoryManager !== 'undefined' ? '已加载' : '未加载');
                    if (typeof MemoryManager !== 'undefined') {
                        check('MemoryManager.allocateMemory', typeof MemoryManager.allocateMemory === 'function');
                        check('MemoryManager.freeMemory', typeof MemoryManager.freeMemory === 'function');
                        check('MemoryManager.checkMemory', typeof MemoryManager.checkMemory === 'function');
                        check('MemoryManager.registerProgramName', typeof MemoryManager.registerProgramName === 'function');
                        
                        // 检查内存使用情况
                        try {
                            const memoryInfo = MemoryManager.checkMemory();
                            if (memoryInfo) {
                                const totalHeaps = memoryInfo.totalHeaps !== undefined ? memoryInfo.totalHeaps : 
                                                  (memoryInfo.programs ? memoryInfo.programs.reduce((sum, p) => sum + (p.heaps ? p.heaps.length : 0), 0) : 0);
                                const totalSheds = memoryInfo.totalSheds !== undefined ? memoryInfo.totalSheds : 
                                                  (memoryInfo.programs ? memoryInfo.programs.reduce((sum, p) => sum + (p.sheds ? p.sheds.length : 0), 0) : 0);
                                info('内存统计', `总程序数: ${memoryInfo.totalPrograms || 0}, 总堆数: ${totalHeaps}, 总栈数: ${totalSheds}`);
                                if (memoryInfo.programs && memoryInfo.programs.length > 0) {
                                    memoryInfo.programs.forEach(prog => {
                                        const progName = MemoryManager.getProgramName ? MemoryManager.getProgramName(prog.pid) : (prog.name || '未命名');
                                        info(`  程序 PID ${prog.pid}`, `${progName}: ${prog.heaps ? prog.heaps.length : 0} 个堆, ${prog.sheds ? prog.sheds.length : 0} 个栈`);
                                    });
                                }
                            }
                        } catch (e) {
                            warn('内存统计', `获取失败: ${e.message}`);
                        }
                    }
                    
                    check('Heap', typeof Heap !== 'undefined',
                        typeof Heap !== 'undefined' ? '已加载' : '未加载');
                    if (typeof Heap !== 'undefined') {
                        check('Heap 构造函数', typeof Heap === 'function');
                    }
                    
                    check('Shed', typeof Shed !== 'undefined',
                        typeof Shed !== 'undefined' ? '已加载' : '未加载');
                    if (typeof Shed !== 'undefined') {
                        check('Shed 构造函数', typeof Shed === 'function');
                    }
                    
                    // ========== 5. 进程管理检查 ==========
                    report.push('');
                    report.push('--- 进程管理检查 ---');
                    
                    check('ProcessManager', typeof ProcessManager !== 'undefined',
                        typeof ProcessManager !== 'undefined' ? '已加载' : '未加载');
                    if (typeof ProcessManager !== 'undefined') {
                        check('ProcessManager.startProgram', typeof ProcessManager.startProgram === 'function');
                        check('ProcessManager.killProgram', typeof ProcessManager.killProgram === 'function');
                        check('ProcessManager.getProcessInfo', typeof ProcessManager.getProcessInfo === 'function');
                        check('ProcessManager.listProcesses', typeof ProcessManager.listProcesses === 'function');
                        
                        // 检查进程表
                        try {
                            const processTable = ProcessManager.PROCESS_TABLE;
                            if (processTable && processTable.size > 0) {
                                info('运行中的进程', `${processTable.size} 个`);
                                processTable.forEach((processInfo, pid) => {
                                    const status = processInfo.status || 'unknown';
                                    const name = processInfo.programName || '未命名';
                                    info(`  PID ${pid}`, `${name} (${status})`);
                                });
                            } else {
                                info('运行中的进程', '无');
                            }
                        } catch (e) {
                            warn('进程表', `访问失败: ${e.message}`);
                        }
                    }
                    
                    // ApplicationAssetManager
                    check('ApplicationAssetManager', typeof ApplicationAssetManager !== 'undefined',
                        typeof ApplicationAssetManager !== 'undefined' ? '已加载' : '未加载');
                    if (typeof ApplicationAssetManager !== 'undefined') {
                        check('ApplicationAssetManager.getProgramInfo', typeof ApplicationAssetManager.getProgramInfo === 'function');
                        check('ApplicationAssetManager.listPrograms', typeof ApplicationAssetManager.listPrograms === 'function');
                        check('ApplicationAssetManager.getAutoStartPrograms', typeof ApplicationAssetManager.getAutoStartPrograms === 'function');
                        
                        // 检查已注册的程序
                        try {
                            const programs = ApplicationAssetManager.listPrograms();
                            if (programs && programs.length > 0) {
                                info('已注册的程序', `${programs.length} 个: ${programs.join(', ')}`);
                            } else {
                                info('已注册的程序', '无');
                            }
                        } catch (e) {
                            warn('程序列表', `获取失败: ${e.message}`);
                        }
                    }
                    
                    // KernelMemory
                    check('KernelMemory', typeof KernelMemory !== 'undefined',
                        typeof KernelMemory !== 'undefined' ? '已加载' : '未加载');
                    if (typeof KernelMemory !== 'undefined') {
                        check('KernelMemory.saveData', typeof KernelMemory.saveData === 'function');
                        check('KernelMemory.loadData', typeof KernelMemory.loadData === 'function');
                        check('KernelMemory.hasData', typeof KernelMemory.hasData === 'function');
                        check('KernelMemory.getMemoryUsage', typeof KernelMemory.getMemoryUsage === 'function');
                        
                        // 检查Exploit程序内存使用情况
                        try {
                            const memoryUsage = KernelMemory.getMemoryUsage();
                            if (memoryUsage) {
                                info('Exploit程序内存', `Heap: ${memoryUsage.heapUsed || 0}/${memoryUsage.heapTotal || 0} bytes, Shed: ${memoryUsage.shedUsed || 0}/${memoryUsage.shedTotal || 0} bytes`);
                            }
                        } catch (e) {
                            warn('内存使用情况', `获取失败: ${e.message}`);
                        }
                    }
                    
                    // ========== 6. GUI 管理检查 ==========
                    report.push('');
                    report.push('--- GUI 管理检查 ---');
                    
                    check('GUIManager', typeof GUIManager !== 'undefined',
                        typeof GUIManager !== 'undefined' ? '已加载' : '未加载');
                    if (typeof GUIManager !== 'undefined') {
                        check('GUIManager.registerWindow', typeof GUIManager.registerWindow === 'function');
                        check('GUIManager.unregisterWindow', typeof GUIManager.unregisterWindow === 'function');
                    }
                    
                    check('ThemeManager', typeof ThemeManager !== 'undefined',
                        typeof ThemeManager !== 'undefined' ? '已加载' : '未加载');
                    if (typeof ThemeManager !== 'undefined') {
                        check('ThemeManager.setTheme', typeof ThemeManager.setTheme === 'function');
                        check('ThemeManager.getCurrentTheme', typeof ThemeManager.getCurrentTheme === 'function');
                        check('ThemeManager.setDesktopBackground', typeof ThemeManager.setDesktopBackground === 'function');
                        check('ThemeManager.setLocalImageAsBackground', typeof ThemeManager.setLocalImageAsBackground === 'function');
                        check('ThemeManager.getCurrentDesktopBackground', typeof ThemeManager.getCurrentDesktopBackground === 'function');
                        check('ThemeManager.getAllDesktopBackgrounds', typeof ThemeManager.getAllDesktopBackgrounds === 'function');
                        try {
                            const currentTheme = ThemeManager.getCurrentTheme();
                            if (currentTheme) {
                                info('当前主题', typeof currentTheme === 'object' ? currentTheme.id || currentTheme.name || '未知' : currentTheme);
                            }
                            const currentBg = ThemeManager.getCurrentDesktopBackground ? ThemeManager.getCurrentDesktopBackground() : null;
                            if (currentBg) {
                                // 检查是否为 GIF 动图背景
                                const bgInfo = ThemeManager.getDesktopBackground ? ThemeManager.getDesktopBackground(currentBg) : null;
                                const isGif = bgInfo && bgInfo.path && bgInfo.path.toLowerCase().endsWith('.gif');
                                info('当前桌面背景', `${currentBg}${isGif ? ' (GIF动图)' : ''}`);
                            }
                            // 检查支持的背景格式
                            const allBackgrounds = ThemeManager.getAllDesktopBackgrounds ? ThemeManager.getAllDesktopBackgrounds() : [];
                            if (allBackgrounds && allBackgrounds.length > 0) {
                                const gifCount = allBackgrounds.filter(bg => bg && bg.path && bg.path.toLowerCase().endsWith('.gif')).length;
                                const staticCount = allBackgrounds.length - gifCount;
                                info('桌面背景统计', `总计: ${allBackgrounds.length} 个 (静态: ${staticCount}, GIF动图: ${gifCount})`);
                            }
                        } catch (e) {
                            warn('主题信息', `获取失败: ${e.message}`);
                        }
                    }
                    
                    check('DesktopManager', typeof DesktopManager !== 'undefined',
                        typeof DesktopManager !== 'undefined' ? '已加载' : '未加载');
                    if (typeof DesktopManager !== 'undefined') {
                        check('DesktopManager.init', typeof DesktopManager.init === 'function');
                        check('DesktopManager.addShortcut', typeof DesktopManager.addShortcut === 'function');
                    }
                    
                    check('TaskbarManager', typeof TaskbarManager !== 'undefined',
                        typeof TaskbarManager !== 'undefined' ? '已加载' : '未加载');
                    check('ContextMenuManager', typeof ContextMenuManager !== 'undefined',
                        typeof ContextMenuManager !== 'undefined' ? '已加载' : '未加载');
                    if (typeof ContextMenuManager !== 'undefined') {
                        check('ContextMenuManager.registerContextMenu', typeof ContextMenuManager.registerContextMenu === 'function');
                        check('ContextMenuManager.registerMenu', typeof ContextMenuManager.registerMenu === 'function');
                    }
                    check('EventManager', typeof EventManager !== 'undefined',
                        typeof EventManager !== 'undefined' ? '已加载' : '未加载');
                    if (typeof EventManager !== 'undefined') {
                        check('EventManager.registerDrag', typeof EventManager.registerDrag === 'function');
                        check('EventManager.registerResizer', typeof EventManager.registerResizer === 'function');
                        check('EventManager.registerMenu', typeof EventManager.registerMenu === 'function');
                    }
                    
                    // ========== 7. 系统信息检查 ==========
                    report.push('');
                    report.push('--- 系统信息检查 ---');
                    
                    check('SystemInformation', typeof SystemInformation !== 'undefined',
                        typeof SystemInformation !== 'undefined' ? '已加载' : '未加载');
                    if (typeof SystemInformation !== 'undefined') {
                        check('SystemInformation.getSystemVersion', typeof SystemInformation.getSystemVersion === 'function');
                        check('SystemInformation.getKernelVersion', typeof SystemInformation.getKernelVersion === 'function');
                        check('SystemInformation.getDevelopers', typeof SystemInformation.getDevelopers === 'function');
                        try {
                            const sysVersion = SystemInformation.getSystemVersion();
                            const kernelVersion = SystemInformation.getKernelVersion();
                            info('系统版本', sysVersion);
                            info('内核版本', kernelVersion);
                        } catch (e) {
                            warn('系统信息', `获取失败: ${e.message}`);
                        }
                    }
                    
                    // NetworkManager 是一个实例，不是类
                    let networkManager = null;
                    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                        try {
                            networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                    if (!networkManager && typeof window !== 'undefined' && window.NetworkManager) {
                        networkManager = window.NetworkManager;
                    }
                    if (!networkManager && typeof globalThis !== 'undefined' && globalThis.NetworkManager) {
                        networkManager = globalThis.NetworkManager;
                    }
                    
                    check('NetworkManager', networkManager !== null && networkManager !== undefined,
                        networkManager ? '已加载' : '未加载');
                    if (networkManager) {
                        check('NetworkManager.isOnline', typeof networkManager.isOnline === 'function');
                        check('NetworkManager.getConnectionInfo', typeof networkManager.getConnectionInfo === 'function');
                        check('NetworkManager.getNetworkStateSnapshot', typeof networkManager.getNetworkStateSnapshot === 'function');
                        try {
                            const isOnline = networkManager.isOnline();
                            const connectionInfo = networkManager.getConnectionInfo();
                            info('网络状态', isOnline ? '在线' : '离线');
                            if (connectionInfo) {
                                info('连接信息', JSON.stringify(connectionInfo));
                            }
                        } catch (e) {
                            warn('网络状态', `获取失败: ${e.message}`);
                        }
                    }
                    
                    check('DynamicManager', typeof DynamicManager !== 'undefined',
                        typeof DynamicManager !== 'undefined' ? '已加载' : '未加载');
                    
                    // ========== 8. 驱动层检查 ==========
                    report.push('');
                    report.push('--- 驱动层检查 ---');
                    
                    // MultithreadingDrive
                    check('MultithreadingDrive', typeof MultithreadingDrive !== 'undefined',
                        typeof MultithreadingDrive !== 'undefined' ? '已加载' : '未加载');
                    if (typeof MultithreadingDrive !== 'undefined') {
                        check('MultithreadingDrive.createThread', typeof MultithreadingDrive.createThread === 'function');
                        check('MultithreadingDrive.executeTask', typeof MultithreadingDrive.executeTask === 'function');
                        check('MultithreadingDrive.getPoolStatus', typeof MultithreadingDrive.getPoolStatus === 'function');
                    }
                    
                    // DragDrive
                    check('DragDrive', typeof DragDrive !== 'undefined',
                        typeof DragDrive !== 'undefined' ? '已加载' : '未加载');
                    if (typeof DragDrive !== 'undefined') {
                        check('DragDrive.createDragSession', typeof DragDrive.createDragSession === 'function');
                        check('DragDrive.enableDrag', typeof DragDrive.enableDrag === 'function');
                        check('DragDrive.registerDropZone', typeof DragDrive.registerDropZone === 'function');
                    }
                    
                    // GeographyDrive
                    check('GeographyDrive', typeof GeographyDrive !== 'undefined',
                        typeof GeographyDrive !== 'undefined' ? '已加载' : '未加载');
                    if (typeof GeographyDrive !== 'undefined') {
                        check('GeographyDrive.getCurrentPosition', typeof GeographyDrive.getCurrentPosition === 'function');
                        check('GeographyDrive.isSupported', typeof GeographyDrive.isSupported === 'function');
                    }
                    
                    // CryptDrive
                    check('CryptDrive', typeof CryptDrive !== 'undefined',
                        typeof CryptDrive !== 'undefined' ? '已加载' : '未加载');
                    if (typeof CryptDrive !== 'undefined') {
                        check('CryptDrive.generateKeyPair', typeof CryptDrive.generateKeyPair === 'function');
                        check('CryptDrive.importKeyPair', typeof CryptDrive.importKeyPair === 'function');
                        check('CryptDrive.encrypt', typeof CryptDrive.encrypt === 'function');
                        check('CryptDrive.decrypt', typeof CryptDrive.decrypt === 'function');
                        check('CryptDrive.md5', typeof CryptDrive.md5 === 'function');
                        check('CryptDrive.randomInt', typeof CryptDrive.randomInt === 'function');
                        check('CryptDrive.randomFloat', typeof CryptDrive.randomFloat === 'function');
                        check('CryptDrive.randomBoolean', typeof CryptDrive.randomBoolean === 'function');
                        check('CryptDrive.randomString', typeof CryptDrive.randomString === 'function');
                        check('CryptDrive.listKeys', typeof CryptDrive.listKeys === 'function');
                        check('CryptDrive.deleteKey', typeof CryptDrive.deleteKey === 'function');
                        check('CryptDrive.setDefaultKey', typeof CryptDrive.setDefaultKey === 'function');
                        
                        // 检查密钥列表
                        try {
                            const keys = CryptDrive.listKeys();
                            if (keys && keys.length > 0) {
                                info('已存储的密钥', `${keys.length} 个`);
                                keys.forEach(key => {
                                    const keyInfo = CryptDrive.getKeyInfo ? CryptDrive.getKeyInfo(key.id) : null;
                                    if (keyInfo) {
                                        const expired = keyInfo.expiresAt && new Date(keyInfo.expiresAt) < new Date();
                                        const status = expired ? '已过期' : (keyInfo.isDefault ? '默认' : '正常');
                                        info(`  密钥 ${key.id}`, `${status}${keyInfo.description ? ' - ' + keyInfo.description : ''}`);
                                    }
                                });
                            } else {
                                info('已存储的密钥', '无');
                            }
                        } catch (e) {
                            warn('密钥列表', `获取失败: ${e.message}`);
                        }
                    }
                    
                    // ========== 9. 终端环境检查 ==========
                    report.push('');
                    report.push('--- 终端环境检查 ---');
                    
                    check('当前工作目录', typeof payload.env.cwd === 'string' && payload.env.cwd.length > 0,
                        payload.env.cwd || '未设置');
                    check('当前用户', typeof payload.env.user === 'string' && payload.env.user.length > 0,
                        payload.env.user || '未设置');
                    check('当前主机', typeof payload.env.host === 'string' && payload.env.host.length > 0,
                        payload.env.host || '未设置');
                    
                    // 检查终端API
                    try {
                        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                            const terminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");
                            if (terminalAPI) {
                                check('TerminalAPI', true, '已注册到共享空间');
                                check('TerminalAPI.getActiveTerminal', typeof terminalAPI.getActiveTerminal === 'function');
                                check('TerminalAPI.write', typeof terminalAPI.write === 'function');
                                check('TerminalAPI.executeCommand', typeof terminalAPI.executeCommand === 'function');
                            } else {
                                check('TerminalAPI', false, '未注册到共享空间');
                            }
                        }
                    } catch (e) {
                        warn('TerminalAPI', `检查失败: ${e.message}`);
                    }
                    
                    // 检查窗口管理功能
                    try {
                        // 尝试查找终端容器（支持多实例）
                        let terminalContainer = null;
                        let bashWindow = null;
                        
                        // 先尝试通过pid查找
                        if (typeof TERMINAL !== 'undefined' && TERMINAL._instances && TERMINAL._instances.size > 0) {
                            // 查找第一个实例的容器
                            for (const [pid, instance] of TERMINAL._instances) {
                                if (instance && instance.tabManager) {
                                    const containerId = pid ? `terminal-${pid}` : 'terminal';
                                    terminalContainer = document.getElementById(containerId);
                        if (terminalContainer) {
                                        bashWindow = terminalContainer.querySelector('.bash-window');
                            if (bashWindow) {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 如果还没找到，尝试默认容器
                        if (!terminalContainer) {
                            terminalContainer = document.getElementById('terminal');
                            if (terminalContainer) {
                                bashWindow = terminalContainer.querySelector('.bash-window');
                            }
                        }
                        
                        // 如果还没找到，尝试通过class查找
                        if (!bashWindow) {
                            bashWindow = document.querySelector('.bash-window');
                            if (bashWindow && bashWindow.parentElement) {
                                terminalContainer = bashWindow.parentElement;
                            }
                        }
                        
                        if (bashWindow) {
                            // 检查是否使用GUIManager
                            const usesGUIManager = bashWindow.classList.contains('zos-gui-window');
                            
                            if (usesGUIManager) {
                                // 使用GUIManager的情况
                                const hasTitleBar = bashWindow.querySelector('.zos-window-titlebar') !== null;
                                const hasMinBtn = bashWindow.querySelector('.zos-window-btn-minimize') !== null;
                                const hasMaxBtn = bashWindow.querySelector('.zos-window-btn-maximize') !== null;
                                const hasCloseBtn = bashWindow.querySelector('.zos-window-btn-close') !== null;
                                const hasResizer = bashWindow.querySelector('.zos-window-resizer') !== null;
                                check('窗口管理 - GUIManager', true);
                                check('窗口管理 - 标题栏', hasTitleBar);
                                check('窗口管理 - 最小化按钮', hasMinBtn);
                                check('窗口管理 - 最大化按钮', hasMaxBtn);
                                check('窗口管理 - 关闭按钮', hasCloseBtn);
                                check('窗口管理 - 拉伸功能', hasResizer);
                            } else {
                                // 降级方案
                                const hasCloseBtn = bashWindow.querySelector('.dot.close') !== null;
                                const hasMaxBtn = bashWindow.querySelector('.dot.maximize') !== null;
                                const hasResizer = bashWindow.querySelector('.window-resizer') !== null;
                                check('窗口管理 - 关闭按钮', hasCloseBtn);
                                check('窗口管理 - 全屏按钮', hasMaxBtn);
                                check('窗口管理 - 拉伸功能', hasResizer);
                                check('窗口管理 - 拖拽功能', bashWindow._windowState !== undefined);
                            }
                        } else {
                            // 只在确实找不到时才警告
                            if (!terminalContainer) {
                                warn('窗口管理', 'terminal 容器未找到（可能所有实例都已关闭）');
                            } else {
                                warn('窗口管理', 'bash-window 元素未找到');
                            }
                        }
                    } catch (e) {
                        warn('窗口管理', `检查失败: ${e.message}`);
                    }
                    
                    // ========== 9. 浏览器环境检查 ==========
                    report.push('');
                    report.push('--- 浏览器环境检查 ---');
                    
                    check('localStorage', typeof Storage !== 'undefined' && typeof localStorage !== 'undefined',
                        typeof localStorage !== 'undefined' ? '可用' : '不可用');
                    check('document.body', typeof document !== 'undefined' && document.body !== null,
                        document.body ? '可用' : '不可用');
                    check('window 对象', typeof window !== 'undefined',
                        typeof window !== 'undefined' ? '可用' : '不可用');
                    
                    // ========== 10. 总结 ==========
                    report.push('');
                    report.push('=== 检查总结 ===');
                    info('总检查项', `${totalChecks} 项`);
                    info('通过', `${passedChecks} 项`);
                    info('失败', `${failedChecks} 项`);
                    info('警告', `${warnings} 项`);
                    
                    const successRate = totalChecks > 0 ? ((passedChecks / totalChecks) * 100).toFixed(2) : 0;
                    info('通过率', `${successRate}%`);
                    
                    if (failedChecks === 0 && warnings === 0) {
                        report.push('');
                        report.push('[✓] 内核状态: 完全正常');
                    } else if (failedChecks === 0) {
                        report.push('');
                        report.push('[!] 内核状态: 基本正常，但有警告');
                    } else {
                        report.push('');
                        report.push('[✗] 内核状态: 存在问题，请检查上述失败项');
                    }
                    
                    // 输出报告
                    report.forEach(line => {
                        payload.write(line);
                    });
                }
                break;
            case 'help':
                // 对于已支持的命令提供帮助信息,比如参数
                payload.write('Supported commands (detailed):');
                payload.write(' - ls [-l] [path]         : 列出目录项。可选 -l 输出长格式，支持相对或绝对盘符路径（例如 C:/dir）');
                payload.write(' - tree [-L depth] [path] : 以树状结构显示目录。可选 -L 限制显示深度，支持相对或绝对路径');
                payload.write(' - cd <dir>               : 切换目录，支持 .. 返回上级；参数可为相对或绝对路径');
                payload.write(' - markdir <path>         : 创建目录，支持多级路径，例如 markdir foo/bar');
                payload.write(' - markfile <path>        : 创建空文件（优先使用内核 FileFormwork，否则降级）');
                payload.write(' - cat [-md] <file>       : 显示文件内容，支持相对/绝对路径，可选 -md 参数渲染Markdown');
                payload.write(' - write [-a] <file> <txt>: 写入文件，默认覆盖；使用 -a 追加，支持路径');
                payload.write(' - rm <file|dir>          : 删除文件或目录，支持路径');
                payload.write(' - rename <old> <new>     : 重命名文件或目录');
                payload.write(' - mv <src> <dest>        : 移动文件或目录到目标位置');
                payload.write(' - copy <file|dir>        : 复制文件或目录到剪贴板');
                payload.write(' - paste                  : 从剪贴板粘贴文件或目录到当前目录');
                payload.write(' - ps [-l|--long] [pid]   : 显示程序内存信息。可选 -l 显示详细信息，可指定 pid 查看特定程序');
                payload.write(' - kill [signal] <pid>    : 终止指定程序并释放其内存。可选信号参数（如 -9），可指定 pid');
                payload.write(' - check                  : 全面自检内核并给出详细的检查报告');
                payload.write(' - diskmanger [-l] [disk] : 显示磁盘分区信息。可选 -l 显示详细文件和目录占用，可选指定磁盘');
                payload.write(' - echo [-n] [text...]    : 输出文本。可选 -n 参数不换行输出');
                payload.write(' - clear                  : 清除屏幕');
                payload.write(' - vim [file]             : Vim文本编辑器（支持Normal/Insert/Command模式，支持鼠标滚轮滚动）');
                payload.write(' - pwd, whoami            : 显示当前路径或当前用户');
                payload.write(' - login <username>       : 切换用户登录');
                payload.write(' - su <username>          : 切换用户（与 login 相同）');
                payload.write(' - users                  : 列出所有用户及其级别');
                payload.write(' - demo, toggleview       : 演示脚本 / 切换视图');
                payload.write(' - power <action>         : 系统电源管理（reboot/shutdown/help）');
                payload.write('Notes: 路径格式以盘符开头如 C:/path，或相对于当前工作目录使用 ../ 和 ./ 。');
                break;
            case 'diskmanger':
            case 'diskmgr':
                // 显示磁盘分区信息，读取内核 Disk 静态数据
                if(typeof Disk === 'undefined'){
                    payload.write('diskmanger: Disk information not available');
                    break;
                }
                
                // 清除所有缓存，强制从 KernelMemory 重新加载最新数据
                Disk._diskSeparateMapCache = null;
                Disk._diskSeparateSizeCache = null;
                Disk._diskFreeMapCache = null;
                Disk._diskUsedMapCache = null;
                
                // 在更新之前，确保所有分区的 NodeTreeCollection 都已正确加载到 diskSeparateMap
                // 这很重要，因为 Disk.update() 需要这些对象来计算已用空间
                if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    try {
                        // 获取所有已知的分区名称（从 diskSeparateSize）
                        const knownPartitions = Array.from(Disk.diskSeparateSize.keys());
                        for (const partitionName of knownPartitions) {
                            // 检查 diskSeparateMap 中是否有该分区
                            let coll = Disk.diskSeparateMap.get(partitionName);
                            
                            // 如果没有，尝试从 POOL 获取
                            if (!coll) {
                                try {
                                    coll = POOL.__GET__("KERNEL_GLOBAL_POOL", partitionName);
                                    if (coll) {
                                        // 更新 diskSeparateMap
                                        Disk.diskSeparateMap.set(partitionName, coll);
                                    }
                                } catch (e) {
                                    // 忽略错误，继续处理其他分区
                                }
                            }
                        }
                        // 更新缓存
                        if (Disk._diskSeparateMapCache) {
                            Disk._diskSeparateMapCache = Disk.diskSeparateMap;
                        }
                    } catch (e) {
                        // 忽略错误，继续使用现有的 diskSeparateMap
                    }
                }
                
                // 更新磁盘使用情况（这会重新计算已用和空闲空间）
                // 现在 diskSeparateMap 应该包含所有分区的 NodeTreeCollection 对象
                try {
                    Disk.update();
                } catch (e) {
                    // 如果更新失败，继续使用现有数据
                    payload.write(`警告: 无法更新磁盘使用情况: ${e.message}`);
                }
                
                // 解析参数
                const args = payload.args.slice(1);
                let listMode = false;
                let targetDisk = null;
                
                for (let i = 0; i < args.length; i++) {
                    const arg = args[i];
                    if (arg === '-l' || arg === '--list') {
                        listMode = true;
                    } else if (!arg.startsWith('-')) {
                        targetDisk = arg.replace(/[:]/g, '').toUpperCase() + ':';
                    }
                }
                
                // 如果没有指定磁盘，显示所有磁盘的摘要信息
                if (!listMode) {
                    // 异步处理，从 PHP 服务获取真实的磁盘使用情况
                    (async () => {
                        try {
                            // 从 PHP 服务获取真实的磁盘使用情况
                            const getRealDiskInfo = async (diskName) => {
                                const disk = diskName.replace(':', ''); // 移除冒号，得到 C 或 D
                                try {
                                    const url = new URL('/system/service/FSDirve.php', window.location.origin);
                                    url.searchParams.set('action', 'get_disk_info');
                                    url.searchParams.set('disk', disk);
                                    
                                    const response = await fetch(url);
                                    const result = await response.json();
                                    
                                    if (result.status === 'success' && result.data) {
                                        const data = result.data;
                                        // 使用 dirSize 作为已用空间（这是真实的目录大小）
                                        const used = data.dirSize || 0;
                                        // 使用配置的分区大小作为总大小
                                        const total = Disk.diskSeparateSize.get(diskName) || data.totalSize || 0;
                                        const free = total - used;
                                        
                                        return {
                                            name: diskName,
                                            total: total,
                                            used: used,
                                            free: free
                                        };
                                    }
                                } catch (e) {
                                    // 如果 PHP 服务不可用，回退到使用内存中的数据
                                }
                                
                                // 回退方案：使用内存中的数据
                                const total = Disk.diskSeparateSize.get(diskName) || 0;
                                const used = Disk.diskUsedMap.get(diskName) || 0;
                                const free = Disk.diskFreeMap.get(diskName) || (total - used);
                                
                                return {
                                    name: diskName,
                                    total: total,
                                    used: used,
                                    free: free
                                };
                            };
                            
                            // 获取所有分区信息
                            const partitions = Array.from(Disk.diskSeparateSize.keys());
                            const diskInfos = await Promise.all(partitions.map(diskName => getRealDiskInfo(diskName)));
                            
                            payload.write(`Disk total capacity: ${Disk.diskSize} bytes`);
                            diskInfos.forEach(info => {
                                payload.write(`${info.name} : total=${info.total} used=${info.used} free=${info.free}`);
                            });
                            payload.write('');
                            payload.write('Use "diskmanger -l [disk]" to see detailed file and directory usage');
                        } catch (e) {
                            payload.write(`错误: 无法获取磁盘信息: ${e.message}`);
                        }
                    })();
                } else {
                    // 列表模式：显示详细的文件和目录占用空间（从 PHP 服务获取真实数据）
                    (async () => {
                        try {
                            const disksToShow = targetDisk ? [targetDisk] : Array.from(Disk.diskSeparateSize.keys());
                            
                            // 辅助函数：格式化文件大小
                            const formatSize = (size) => {
                                if (size >= 1024 * 1024 * 1024) {
                                    return (size / (1024 * 1024 * 1024)).toFixed(2) + 'G';
                                } else if (size >= 1024 * 1024) {
                                    return (size / (1024 * 1024)).toFixed(2) + 'M';
                                } else if (size >= 1024) {
                                    return (size / 1024).toFixed(2) + 'K';
                                }
                                return size + 'B';
                            };
                            
                            // 递归计算目录大小（从 PHP 服务获取）
                            const calculateDirSize = async (dirPath) => {
                                let phpPath = dirPath;
                                if (/^[CD]:$/.test(phpPath)) {
                                    phpPath = phpPath + '/';
                                }
                                
                                try {
                                    const url = new URL('/system/service/FSDirve.php', window.location.origin);
                                    url.searchParams.set('action', 'list_dir');
                                    url.searchParams.set('path', phpPath);
                                    
                                    const response = await fetch(url);
                                    if (!response.ok) {
                                        return 0;
                                    }
                                    
                                    const result = await response.json();
                                    if (result.status !== 'success' || !result.data || !result.data.items) {
                                        return 0;
                                    }
                                    
                                    let size = 0;
                                    const items = result.data.items;
                                    
                                    for (const item of items) {
                                        if (item.type === 'file') {
                                            size += item.size || 0;
                                        } else if (item.type === 'directory') {
                                            const subDirPath = item.path;
                                            size += await calculateDirSize(subDirPath);
                                        }
                                    }
                                    
                                    return size;
                                } catch (e) {
                                    return 0;
                                }
                            };
                            
                            // 递归收集所有文件和目录（从 PHP 服务获取）
                            const collectItems = async (path, items) => {
                                let phpPath = path;
                                if (/^[CD]:$/.test(phpPath)) {
                                    phpPath = phpPath + '/';
                                }
                                
                                try {
                                    const url = new URL('/system/service/FSDirve.php', window.location.origin);
                                    url.searchParams.set('action', 'list_dir');
                                    url.searchParams.set('path', phpPath);
                                    
                                    const response = await fetch(url);
                                    if (!response.ok) {
                                        return;
                                    }
                                    
                                    const result = await response.json();
                                    if (result.status !== 'success' || !result.data || !result.data.items) {
                                        return;
                                    }
                                    
                                    const dirItems = result.data.items;
                                    
                                    for (const item of dirItems) {
                                        if (item.type === 'file') {
                                            items.push({
                                                path: item.path,
                                                name: item.name,
                                                type: 'file',
                                                size: item.size || 0
                                            });
                                        } else if (item.type === 'directory') {
                                            const subDirPath = item.path;
                                            const subDirSize = await calculateDirSize(subDirPath);
                                            items.push({
                                                path: subDirPath,
                                                name: item.name + '/',
                                                type: 'dir',
                                                size: subDirSize
                                            });
                                            // 递归处理子目录
                                            await collectItems(subDirPath, items);
                                        }
                                    }
                                } catch (e) {
                                    // 忽略错误
                                }
                            };
                            
                            // 处理每个磁盘
                            for (const diskName of disksToShow) {
                                // 获取磁盘信息
                                const disk = diskName.replace(':', '');
                                let totalSize = Disk.diskSeparateSize.get(diskName) || 0;
                                let usedSize = 0;
                                
                                try {
                                    const url = new URL('/system/service/FSDirve.php', window.location.origin);
                                    url.searchParams.set('action', 'get_disk_info');
                                    url.searchParams.set('disk', disk);
                                    
                                    const response = await fetch(url);
                                    if (response.ok) {
                                        const result = await response.json();
                                        if (result.status === 'success' && result.data) {
                                            usedSize = result.data.dirSize || 0;
                                            if (!totalSize) {
                                                totalSize = result.data.totalSize || 0;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // 如果 PHP 服务不可用，使用内存中的数据
                                    usedSize = Disk.diskUsedMap.get(diskName) || 0;
                                }
                                
                                const freeSize = totalSize - usedSize;
                                
                                payload.write('');
                                payload.write({ html: `<span style="color: #4a9eff; font-weight: bold;">${diskName} - Disk Usage Details</span>` });
                                payload.write(`Total: ${totalSize} bytes | Used: ${usedSize} bytes | Free: ${freeSize} bytes`);
                                payload.write('');
                                
                                // 收集所有文件和目录
                                const items = [];
                                await collectItems(diskName, items);
                                
                                // 按大小排序（从大到小）
                                items.sort((a, b) => b.size - a.size);
                                
                                // 显示标题
                                payload.write({ html: `<span style="color: #888;">${'Size'.padEnd(12)} Type    Path</span>` });
                                payload.write({ html: `<span style="color: #888;">${'-'.repeat(12)} ${'-'.repeat(6)} ${'-'.repeat(60)}</span>` });
                                
                                // 显示文件和目录列表
                                items.forEach(item => {
                                    const sizeStr = formatSize(item.size).padEnd(10);
                                    const typeStr = (item.type === 'dir' ? 'DIR' : 'FILE').padEnd(6);
                                    const pathStr = item.path.replace(diskName + '/', '') || item.name;
                                    
                                    const typeColor = item.type === 'dir' ? '#00ff00' : '#e6e6e6';
                                    payload.write({
                                        html: `<span style="color: #888;">${sizeStr.padStart(12)}</span> <span style="color: ${typeColor};">${typeStr}</span> <span style="color: #e6e6e6;">${pathStr}</span>`
                                    });
                                });
                            }
                        } catch (e) {
                            payload.write(`错误: 无法获取磁盘详细信息: ${e.message}`);
                        }
                    })();
                }
                break;
            case 'power':
                // 电源管理命令：重启或关闭系统
                {
                    if (payload.args.length < 2) {
                        payload.write('power: missing operand');
                        payload.write('Usage: power <reboot|shutdown|help>');
                        payload.write('  reboot   - Restart the system');
                        payload.write('  shutdown - Shutdown the system');
                        payload.write('  help     - Show this help message');
                        return;
                    }
                    
                    const action = payload.args[1].toLowerCase();
                    
                    switch (action) {
                        case 'reboot':
                        case 'restart':
                            payload.write('System is rebooting...');
                            payload.write('Saving all data...');
                            // 保存所有数据到 localStorage（已经在自动保存，这里只是提示）
                            setTimeout(() => {
                                window.location.reload();
                            }, 1000);
                            break;
                        case 'shutdown':
                        case 'off':
                        case 'shut':
                            payload.write('System is shutting down...');
                            payload.write('Saving all data...');
                            // 尝试关闭窗口（仅在非用户交互的情况下才可能工作）
                            setTimeout(() => {
                                // 显示关闭消息
                                document.body.innerHTML = '<div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: monospace; color: #00ff00; font-size: 24px;">System Shutdown Complete<br/><span style="font-size: 16px; color: #888;">Please close this window manually</span></div>';
                                // 尝试关闭窗口（大多数浏览器会阻止此操作）
                                window.close();
                            }, 1000);
                            break;
                        case 'help':
                            payload.write('power - System power management');
                            payload.write('');
                            payload.write('Usage: power <action>');
                            payload.write('');
                            payload.write('Actions:');
                            payload.write('  reboot, restart  - Restart the system (reload page)');
                            payload.write('  shutdown, off    - Shutdown the system');
                            payload.write('  help             - Show this help message');
                            break;
                        default:
                            payload.write(`power: unknown action '${action}'`);
                            payload.write('Available actions: reboot, shutdown, help');
                            break;
                    }
                }
                break;
            default:
                // 检查是否是CLI程序调用
                // 尝试通过ApplicationAssetManager查找程序
                let isCLIProgram = false;
                let programInfo = null;
                
                // 获取ApplicationAssetManager
                let AssetManager = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    AssetManager = ApplicationAssetManager;
                } else if (typeof safePoolGet === 'function') {
                    try {
                        AssetManager = safePoolGet('KERNEL_GLOBAL_POOL', 'ApplicationAssetManager');
                    } catch (e) {
                        console.error('[Terminal] 获取ApplicationAssetManager失败:', e);
                    }
                }
                
                // 调试信息
                if (!AssetManager) {
                    payload.write(`[调试] ApplicationAssetManager 不可用`);
                }
                
                // 检查程序是否存在
                if (AssetManager && typeof AssetManager.hasProgram === 'function') {
                    const hasProgram = AssetManager.hasProgram(cmd);
                    if (hasProgram) {
                        isCLIProgram = true;
                        programInfo = AssetManager.getProgramInfo(cmd);
                        payload.write(`[调试] 找到程序: ${cmd}, 类型: ${programInfo?.metadata?.type || 'unknown'}`);
                    } else {
                        payload.write(`[调试] 程序 ${cmd} 不存在于ApplicationAssetManager`);
                    }
                } else {
                    payload.write(`[调试] ApplicationAssetManager.hasProgram 不可用`);
                }
                
                if (isCLIProgram && programInfo) {
                    // 这是一个CLI程序，通过ProcessManager启动
                    // 获取ProcessManager
                    let ProcessMgr = null;
                    if (typeof ProcessManager !== 'undefined') {
                        ProcessMgr = ProcessManager;
                    } else if (typeof safePoolGet === 'function') {
                        try {
                            ProcessMgr = safePoolGet('KERNEL_GLOBAL_POOL', 'ProcessManager');
                        } catch (e) {
                            console.error('[Terminal] 获取ProcessManager失败:', e);
                        }
                    }
                    
                    if (!ProcessMgr) {
                        payload.write(`[CLI] ${cmd}: ProcessManager 不可用，无法启动程序`);
                        break;
                    }
                    
                    if (typeof ProcessMgr.startProgram !== 'function') {
                        payload.write(`[CLI] ${cmd}: ProcessManager.startProgram 不是函数`);
                        break;
                    }
                    
                    // 异步启动程序
                    payload.write(`[调试] 正在启动程序: ${cmd}...`);
                    ProcessMgr.startProgram(cmd, {
                        terminal: terminalInstance,
                        args: payload.args.slice(1),  // 传递剩余参数
                        env: payload.env,
                        cwd: payload.env.cwd
                    }).then((pid) => {
                        // 程序启动成功
                        payload.write(`[CLI] 程序 ${cmd} 已启动 (PID: ${pid})`);
                    }).catch((error) => {
                        // 程序启动失败
                        console.error(`[Terminal] 启动程序 ${cmd} 失败:`, error);
                        payload.write(`[CLI] 启动程序 ${cmd} 失败: ${error.message || error}`);
                        if (error.stack) {
                            payload.write(`[CLI] 错误堆栈: ${error.stack}`);
                        }
                    });
                } else {
                    // 不是CLI程序，输出命令未找到
                    payload.write(`${cmd}: command not found`);
                }
                break;
        }
        };
        
        // 保存处理器引用以便后续可以移除
        terminalInstance._commandHandler = commandHandler;
        
        // 注册命令处理器
        terminalInstance.on('command', commandHandler);
    }
    
    // 延迟初始化：tabManager 将在 TERMINAL.__init__ 中初始化
    // tabManager = new TabManager();  // 已移动到 TERMINAL.__init__ 中
    
    // 获取活动终端实例的辅助函数
    function getActiveTerminal() {
        return tabManager ? tabManager.getActiveTerminal() : null;
    }
    
    // 命令处理器已经在 createTab 时注册，这里不需要重复注册
    
    // 不直接暴露到全局，而是通过 TERMINAL 对象导出
    // 进程管理器会调用 TERMINAL.__init__() 来初始化
    const TERMINAL = {
        // 程序信息方法
        __info__() {
            return {
                name: '终端程序',
                type: 'GUI',  // GUI程序（有窗口界面）
                version: '1.0.0',
                description: 'ZerOS Bash风格终端',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                capabilities: [
                    'command_execution',
                    'tab_management',
                    'terminal_emulation',
                    'cli_program_launching',
                    'window_management'  // 窗口管理功能
                ],
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    PermissionManager.PERMISSION.PROCESS_MANAGE,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    autoStart: true,  // 终端作为系统内置程序，自动启动
                    priority: 0,
                    allowMultipleInstances: true  // 支持多开
                }
            };
        },
        
        // 初始化方法（由 ProcessManager 调用）
        __init__(pid, initArgs = {}) {
            // 保存 pid 到实例，以便在回调中使用
            const currentPid = pid;
            
            // 将 initArgs 临时存储到 window，以便 TabManager 可以访问
            if (typeof window !== 'undefined') {
                window._currentInitArgs = initArgs;
            }
            
            // 如果是CLI程序专用终端，设置窗口标题
            if (initArgs.forCLI && initArgs.cliProgramName) {
                // 延迟设置，等待窗口创建完成
                setTimeout(() => {
                    const bashWindow = document.querySelector(`.bash-window[data-pid="${currentPid}"]`);
                    if (bashWindow) {
                        const titleEl = bashWindow.querySelector('.bar-title, .title');
                        if (titleEl) {
                            titleEl.textContent = initArgs.cliProgramName;
                        }
                    }
                }, 200);
            }
            
            // 初始化标签页管理器（传入PID以标记DOM元素）
            // 为每个实例创建独立的 tabManager
            const instanceTabManager = new TabManager(currentPid);
            
            // 清理临时存储
            if (typeof window !== 'undefined' && window._currentInitArgs) {
                delete window._currentInitArgs;
            }
            
            // 存储实例的 tabManager（使用 pid 作为键）
            if (!TERMINAL._instances) {
                TERMINAL._instances = new Map();
            }
            TERMINAL._instances.set(currentPid, {
                tabManager: instanceTabManager,
                pid: currentPid
            });
            
            // 如果这是第一个实例，或者没有活动的实例，设置为默认实例
            if (!tabManager || TERMINAL._instances.size === 1) {
                tabManager = instanceTabManager;
            }
            
            // 新创建的实例应该自动获得焦点（提升z-index）
            // 延迟一下，确保DOM已经创建完成
            setTimeout(() => {
                const bashWindow = document.querySelector(`.bash-window[data-pid="${currentPid}"]`);
                if (bashWindow) {
                    // 移除所有窗口的焦点状态
                    const allWindows = document.querySelectorAll('.bash-window');
                    allWindows.forEach(win => {
                        win.classList.remove('focused');
                    });
                    // 为当前窗口添加焦点状态
                    bashWindow.classList.add('focused');
                    
                    // 获取活动终端实例并聚焦
                    const activeTerminal = instanceTabManager.getActiveTerminal();
                    if (activeTerminal) {
                        setTimeout(() => {
                            if (activeTerminal.isActive && !activeTerminal.busy) {
                                activeTerminal.focus();
                            }
                        }, 100);
                    }
                }
            }, 200);
            
            // 暴露到全局，便于外部动态修改环境（使用当前活动的实例）
            window.TabManager = tabManager;
            window.BashTerminal = getActiveTerminal;
            // 兼容命名：返回当前活动终端
            window.Terminal = getActiveTerminal;
            
            // 获取活动终端实例，用于暴露API
            const activeTerminal = getActiveTerminal();
            
            // 创建终端API对象，暴露到共享空间
            const terminalAPI = {
                // 获取活动终端实例
                getActiveTerminal: () => getActiveTerminal(),
                
                // 写入输出
                write: (textOrOptions) => {
                    const term = getActiveTerminal();
                    if (term && typeof term.write === 'function') {
                        term.write(textOrOptions);
                    }
                },
                
                // 清空输出
                clear: () => {
                    const term = getActiveTerminal();
                    if (term && typeof term.clear === 'function') {
                        term.clear();
                    }
                },
                
                // 设置当前工作目录
                setCwd: (path) => {
                    const term = getActiveTerminal();
                    if (term && typeof term.setCwd === 'function') {
                        term.setCwd(path);
                    }
                },
                
                // 设置用户
                setUser: (user) => {
                    const term = getActiveTerminal();
                    if (term && typeof term.setUser === 'function') {
                        term.setUser(user);
                    }
                },
                
                // 设置主机
                setHost: (host) => {
                    const term = getActiveTerminal();
                    if (term && typeof term.setHost === 'function') {
                        term.setHost(host);
                    }
                },
                
                // 获取环境变量
                getEnv: () => {
                    const term = getActiveTerminal();
                    if (term && term.env) {
                        return { ...term.env };  // 返回副本
                    }
                    return null;
                },
                
                // 设置环境变量
                setEnv: (env) => {
                    const term = getActiveTerminal();
                    if (term && term.env) {
                        Object.assign(term.env, env);
                        if (typeof term._updatePrompt === 'function') {
                            term._updatePrompt();
                        }
                    }
                },
                
                // 获取焦点
                focus: () => {
                    const term = getActiveTerminal();
                    if (term && typeof term.focus === 'function') {
                        term.focus();
                    }
                },
                
                // 创建新标签页
                createTab: (title = null) => {
                    if (tabManager && typeof tabManager.createTab === 'function') {
                        return tabManager.createTab(title);
                    }
                    return null;
                },
                
                // 切换标签页
                switchTab: (tabId) => {
                    if (tabManager && typeof tabManager.switchTab === 'function') {
                        tabManager.switchTab(tabId);
                    }
                },
                
                // 关闭标签页
                closeTab: (tabId) => {
                    if (tabManager && typeof tabManager.closeTab === 'function') {
                        tabManager.closeTab(tabId);
                    }
                },
                
                // 获取所有标签页
                getTabs: () => {
                    if (tabManager && tabManager.tabs) {
                        return tabManager.tabs.map(tab => ({
                            id: tab.id,
                            title: tab.title,
                            isActive: tab.id === tabManager.activeTabId
                        }));
                    }
                    return [];
                },
                
                // 注册命令处理器
                onCommand: (handler) => {
                    const term = getActiveTerminal();
                    if (term && typeof term.on === 'function') {
                        return term.on('command', handler);
                    }
                    return null;
                },
                
                // 取消命令处理器
                offCommand: (handler) => {
                    const term = getActiveTerminal();
                    if (term && typeof term.off === 'function') {
                        term.off('command', handler);
                    }
                },
                
                // 执行命令（模拟用户输入）
                executeCommand: (command) => {
                    const term = getActiveTerminal();
                    if (term && typeof term._handleInput === 'function') {
                        term._handleInput(command);
                    } else if (term && term.cmdEl) {
                        // 降级方案：直接设置命令并触发回车
                        term.cmdEl.textContent = command;
                        const enterEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true
                        });
                        term.cmdEl.dispatchEvent(enterEvent);
                    }
                }
            };
            
            // 将终端API暴露到共享空间
            if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                try {
                    if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
                        POOL.__INIT__("APPLICATION_SHARED_POOL");
                    }
                    POOL.__ADD__("APPLICATION_SHARED_POOL", "TerminalAPI", terminalAPI);
                } catch (e) {
                    console.error('Failed to expose TerminalAPI to shared space:', e);
                }
            }
            
            // 说明：外部可以使用以下接口动态修改环境：
            // window.Terminal.setCwd('/path');
            // window.Terminal.setUser('alice');
            // window.Terminal.setHost('myhost');
            // 或直接修改 window.Terminal.env 并调用 window.Terminal._updatePrompt();
            // 
            // 或者通过共享空间访问：
            // const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");
            // TerminalAPI.write("Hello World");
            // TerminalAPI.setCwd("/path/to/dir");
            
            return {
                pid: currentPid,
                tabManager: tabManager,
                getActiveTerminal: getActiveTerminal,
                api: terminalAPI  // 返回API对象引用
            };
        },
        
        // 退出方法（由 ProcessManager 调用）
        __exit__(pid, force = false) {
            // 清理所有事件处理器（通过 EventManager）
            if (typeof EventManager !== 'undefined' && pid) {
                EventManager.unregisterAllHandlersForPid(pid);
            }
            
            // 清理窗口焦点事件处理器（如果是最后一个终端实例）
            if (tabManager && tabManager.tabs.length === 0 && window._terminalWindowFocusHandler) {
                if (typeof EventManager !== 'undefined' && typeof window._terminalWindowFocusHandler === 'number') {
                    const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
                    EventManager.unregisterEventHandler(window._terminalWindowFocusHandler);
                }
                window._terminalWindowFocusHandler = null;
            }
            // 获取当前实例的 tabManager
            let instanceTabManager = null;
            if (TERMINAL._instances && TERMINAL._instances.has(pid)) {
                const instance = TERMINAL._instances.get(pid);
                instanceTabManager = instance.tabManager;
            }
            
            // 清理事件监听器（拖拽和调整大小）
            if (instanceTabManager && instanceTabManager.tabs) {
                instanceTabManager.tabs.forEach(tab => {
                    if (tab.terminalInstance) {
                        const term = tab.terminalInstance;
                        // 清理拖拽事件监听器
                        if (term._dragMousemoveHandler) {
                            document.removeEventListener('mousemove', term._dragMousemoveHandler);
                            term._dragMousemoveHandler = null;
                        }
                        if (term._dragMouseupHandler) {
                            document.removeEventListener('mouseup', term._dragMouseupHandler);
                            term._dragMouseupHandler = null;
                        }
                        // 清理调整大小事件监听器
                        if (term._resizeMousemoveHandler) {
                            document.removeEventListener('mousemove', term._resizeMousemoveHandler);
                            term._resizeMousemoveHandler = null;
                        }
                        if (term._resizeMouseupHandler) {
                            document.removeEventListener('mouseup', term._resizeMouseupHandler);
                            term._resizeMouseupHandler = null;
                        }
                    }
                });
            }
            
            // 清理资源
            if (instanceTabManager) {
                // 关闭所有标签页
                const tabs = [...instanceTabManager.tabs];
                tabs.forEach(tab => {
                    try {
                        instanceTabManager.closeTab(tab.tabId);
                    } catch (e) {
                        // 忽略错误
                    }
                });
            }
            
            // 从实例映射中移除
            if (TERMINAL._instances) {
                TERMINAL._instances.delete(pid);
                
                // 如果这是当前活动的实例，切换到另一个实例（如果有）
                if (tabManager === instanceTabManager && TERMINAL._instances.size > 0) {
                    const firstInstance = TERMINAL._instances.values().next().value;
                    if (firstInstance) {
                        tabManager = firstInstance.tabManager;
                        window.TabManager = tabManager;
                    }
                }
            }
            
            // 如果所有实例都已退出，清理全局引用
            if (!TERMINAL._instances || TERMINAL._instances.size === 0) {
                if (typeof window !== 'undefined') {
                    delete window.TabManager;
                    delete window.BashTerminal;
                    delete window.Terminal;
                }
                TERMINAL._instances = null;
            }
            
            // 先注销窗口（如果使用 GUIManager），确保标题栏保护机制被正确清理
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.getWindowsByPid === 'function') {
                const windows = GUIManager.getWindowsByPid(pid);
                for (const windowInfo of windows) {
                    if (windowInfo.windowId && typeof GUIManager.unregisterWindow === 'function') {
                        try {
                            GUIManager.unregisterWindow(windowInfo.windowId);
                        } catch (e) {
                            // 忽略错误，继续清理
                        }
                    }
                }
            }
            
            // 清理该实例的 DOM 元素（通过 pid 标记）
            // 注意：在注销窗口后，窗口元素可能已经被 GUIManager 移除，所以这里只清理其他元素
            if (typeof document !== 'undefined') {
                const elementsToRemove = document.querySelectorAll(`[data-pid="${pid}"]`);
                elementsToRemove.forEach(el => {
                    try {
                        // 检查元素是否还在 DOM 中，以及是否是窗口元素（窗口元素应该已经被 GUIManager 移除）
                        if (el.parentElement && !el.classList.contains('zos-gui-window')) {
                            el.remove();
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                });
                
                // 清理终端容器（如果为空）
                const terminalContainer = document.getElementById(`terminal-${pid}`);
                if (terminalContainer && terminalContainer.children.length === 0) {
                    try {
                        terminalContainer.remove();
                    } catch (e) {
                        // 忽略错误
                    }
                }
            }
        }
    };
    
    // 导出 TERMINAL 对象到全局（进程管理器需要访问）
    if (typeof window !== 'undefined') {
        window.TERMINAL = TERMINAL;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.TERMINAL = TERMINAL;
    }
    
    // 发布信号（如果 DependencyConfig 可用）
    // 使用虚拟路径格式，与 applicationAssets.js 中的路径保持一致
    if (typeof DependencyConfig !== 'undefined') {
        DependencyConfig.publishSignal("D:/application/terminal/terminal.js");
    }

})(window);

