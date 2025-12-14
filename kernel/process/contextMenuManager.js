// 全局右键菜单管理器
// 由 Exploit 程序管理，负责在沙盒环境中显示上下文相关的右键菜单

KernelLogger.info("ContextMenuManager", "模块初始化");

class ContextMenuManager {
    // 当前显示的菜单
    static _currentMenu = null;
    // 菜单配置映射（系统默认菜单）
    static _menuConfigs = new Map();
    // 程序注册的菜单映射 Map<pid, Map<menuId, menuConfig>>
    static _programMenus = new Map();
    // 菜单ID计数器（用于生成唯一ID）
    static _menuIdCounter = 0;
    
    /**
     * 初始化全局右键菜单系统
     */
    static init() {
        if (typeof document === 'undefined') {
            KernelLogger.warn("ContextMenuManager", "document 不可用，跳过右键菜单初始化");
            return;
        }
        
        // 监听全局右键事件
        document.addEventListener('contextmenu', (e) => {
            ContextMenuManager._handleContextMenu(e);
        }, true); // 使用捕获阶段，确保优先处理
        
        // 监听点击事件，关闭菜单
        document.addEventListener('click', (e) => {
            ContextMenuManager._handleClick(e);
        }, true);
        
        // 监听鼠标按下事件，确保菜单能及时关闭
        document.addEventListener('mousedown', (e) => {
            // 如果点击不在菜单内，立即关闭菜单
            const clickedInMenu = ContextMenuManager._currentMenu && ContextMenuManager._currentMenu.contains(e.target);
            const clickedInSubmenu = e.target.closest('.context-menu-submenu');
            
            if (!clickedInMenu && !clickedInSubmenu) {
                ContextMenuManager._hideMenu(true); // 立即关闭
            }
        }, true);
        
        // 监听 ESC 键，关闭菜单
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && ContextMenuManager._currentMenu) {
                ContextMenuManager._hideMenu(true); // 立即关闭
            }
        }, true);
        
        KernelLogger.info("ContextMenuManager", "全局右键菜单系统初始化完成");
    }
    
    /**
     * 处理右键菜单事件
     * @param {Event} e 事件对象
     */
    static async _handleContextMenu(e) {
        // 检查是否点击在扫雷窗口中（扫雷游戏需要拦截右键菜单）
        const minesweeperWindow = e.target.closest && e.target.closest('.minesweeper-window');
        if (minesweeperWindow) {
            // 如果点击在扫雷窗口中，不处理菜单，直接返回
            // 扫雷游戏会在自己的事件处理中处理右键点击
            return;
        }
        
        // 阻止默认右键菜单
        e.preventDefault();
        e.stopPropagation();
        
        // 确定上下文
        const context = ContextMenuManager._determineContext(e.target);
        
        // 获取对应的菜单配置（可能是 Promise）
        const menuConfigResult = ContextMenuManager._getMenuConfig(context, e.target);
        
        // 如果返回的是 Promise，等待它完成
        const menuConfig = menuConfigResult instanceof Promise 
            ? await menuConfigResult 
            : menuConfigResult;
        
        if (menuConfig && menuConfig.items && menuConfig.items.length > 0) {
            // 显示菜单
            ContextMenuManager._showMenu(menuConfig, e);
        }
    }
    
    /**
     * 确定右键点击的上下文
     * @param {HTMLElement} target 目标元素
     * @returns {string} 上下文类型
     */
    static _determineContext(target) {
        // 检查是否在任务栏上
        if (target.closest('#taskbar')) {
            const taskbarIcon = target.closest('.taskbar-icon');
            if (taskbarIcon) {
                return 'taskbar-icon';
            }
            const appLauncher = target.closest('.taskbar-app-launcher');
            if (appLauncher) {
                return 'taskbar-launcher';
            }
            return 'taskbar';
        }
        
        // 检查是否在应用程序菜单中
        if (target.closest('#taskbar-app-menu')) {
            const menuItem = target.closest('.taskbar-app-menu-item');
            if (menuItem) {
                return 'app-menu-item';
            }
            return 'app-menu';
        }
        
        // 检查是否在文件管理器窗口中
        const fileManagerItem = target.closest('.filemanager-item');
        if (fileManagerItem) {
            return 'filemanager-item';
        }
        
        // 检查是否在程序窗口中
        const bashWindow = target.closest('.bash-window');
        if (bashWindow) {
            const bar = target.closest('.bar');
            if (bar) {
                return 'window-titlebar';
            }
            return 'window-content';
        }
        
        // 检查是否在 GUI 容器中（桌面）
        if (target.closest('#gui-container')) {
            return 'desktop';
        }
        
        // 默认上下文
        return 'default';
    }
    
    /**
     * 获取菜单配置
     * @param {string} context 上下文类型
     * @param {HTMLElement} target 目标元素
     * @returns {Object} 菜单配置
     */
    static _getMenuConfig(context, target) {
        // 1. 首先检查程序注册的菜单（按优先级排序）
        const programMenus = ContextMenuManager._getProgramMenusForContext(context, target);
        if (programMenus.length > 0) {
            // 合并所有匹配的程序菜单
            const mergedItems = [];
            programMenus.forEach(({ config: menuConfig }) => {
                if (menuConfig && menuConfig.items) {
                    // 如果 items 是函数，调用它获取动态菜单项
                    if (typeof menuConfig.items === 'function') {
                        try {
                            const dynamicItems = menuConfig.items(target);
                            if (Array.isArray(dynamicItems)) {
                                mergedItems.push(...dynamicItems);
                            }
                        } catch (e) {
                            KernelLogger.warn("ContextMenuManager", `菜单项函数执行失败: ${e.message}`, e);
                        }
                    } else if (Array.isArray(menuConfig.items)) {
                        mergedItems.push(...menuConfig.items);
                    }
                }
            });
            if (mergedItems.length > 0) {
                return { items: mergedItems };
            }
        }
        
        // 2. 检查系统注册的菜单配置
        if (ContextMenuManager._menuConfigs.has(context)) {
            const config = ContextMenuManager._menuConfigs.get(context);
            // 如果配置是函数，调用它获取动态配置（可能是异步的）
            if (typeof config === 'function') {
                const result = config(target);
                // 如果返回的是 Promise，直接返回它
                if (result instanceof Promise) {
                    return result;
                }
                return result;
            }
            return config;
        }
        
        // 3. 默认菜单配置
        switch (context) {
            case 'desktop':
                return ContextMenuManager._getDesktopMenu(target);
            case 'taskbar-icon':
                return ContextMenuManager._getTaskbarIconMenu(target);
            case 'taskbar-launcher':
                return ContextMenuManager._getTaskbarLauncherMenu(target);
            case 'taskbar':
                return ContextMenuManager._getTaskbarMenu(target);
            case 'app-menu-item':
                return ContextMenuManager._getAppMenuItemMenu(target);
            case 'window-titlebar':
                return ContextMenuManager._getWindowTitlebarMenu(target);
            case 'window-content':
                return ContextMenuManager._getWindowContentMenu(target);
            default:
                return null;
        }
    }
    
    /**
     * 获取指定上下文和元素匹配的程序菜单
     * @param {string} context 上下文类型
     * @param {HTMLElement} target 目标元素
     * @returns {Array} 匹配的菜单配置数组（按优先级排序）
     */
    static _getProgramMenusForContext(context, target) {
        const matchedMenus = [];
        
        // 查找目标元素所属的窗口和PID（用于过滤多开程序的菜单）
        let targetPid = null;
        if (typeof GUIManager !== 'undefined') {
            // 查找目标元素所在的窗口
            const windowElement = target.closest && target.closest('.bash-window, .zos-gui-window');
            if (windowElement) {
                // 尝试从窗口元素获取PID
                if (windowElement.dataset && windowElement.dataset.pid) {
                    targetPid = parseInt(windowElement.dataset.pid, 10);
                } else {
                    // 通过GUIManager查找窗口信息
                    for (const [windowId, windowInfo] of GUIManager._windows || []) {
                        if (windowInfo.window === windowElement || windowElement.contains(windowInfo.window) || windowInfo.window.contains(windowElement)) {
                            targetPid = windowInfo.pid;
                            break;
                        }
                    }
                }
            }
        }
        
        // 遍历所有程序的菜单
        for (const [pid, menus] of ContextMenuManager._programMenus) {
            // 检查程序是否还在运行
            if (typeof ProcessManager !== 'undefined') {
                const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
                if (!processInfo || processInfo.status !== 'running') {
                    // 程序已退出，跳过（但保留菜单，由 ProcessManager 清理）
                    continue;
                }
            }
            
            // 如果找到了目标元素的PID，只处理该PID的菜单（避免多开程序菜单重复）
            // 对于桌面等全局上下文，不进行PID过滤
            if (targetPid !== null && context !== 'desktop' && context !== 'default') {
                if (pid !== targetPid) {
                    continue;
                }
            }
            
            // 遍历该程序的所有菜单
            for (const [menuId, menuConfig] of menus) {
                // 检查上下文是否匹配
                if (menuConfig.context === context || menuConfig.context === '*') {
                    // 检查选择器是否匹配（如果有）
                    if (menuConfig.selector) {
                        try {
                            // 优先使用 closest 查找匹配的元素（因为通常点击的是子元素）
                            const closestMatch = target.closest && target.closest(menuConfig.selector);
                            if (closestMatch) {
                                // 如果找到了目标PID，进一步检查匹配的元素是否在该PID的窗口内
                                if (targetPid !== null && context !== 'desktop' && context !== 'default') {
                                    const matchWindow = closestMatch.closest('.bash-window, .zos-gui-window');
                                    if (matchWindow) {
                                        const matchPid = matchWindow.dataset && matchWindow.dataset.pid ? parseInt(matchWindow.dataset.pid, 10) : null;
                                        if (matchPid !== null && matchPid !== targetPid) {
                                            continue; // 匹配的元素不在目标窗口内，跳过
                                        }
                                    }
                                }
                                matchedMenus.push({ pid, menuId, config: menuConfig });
                            } else if (target.matches && target.matches(menuConfig.selector)) {
                                matchedMenus.push({ pid, menuId, config: menuConfig });
                            }
                        } catch (e) {
                            // 选择器无效，忽略
                            KernelLogger.warn("ContextMenuManager", `菜单选择器无效 (PID: ${pid}, menuId: ${menuId}): ${e.message}`);
                        }
                    } else {
                        // 没有选择器，直接匹配
                        matchedMenus.push({ pid, menuId, config: menuConfig });
                    }
                }
            }
        }
        
        // 按优先级排序（优先级高的在前）
        matchedMenus.sort((a, b) => {
            const priorityA = a.config.priority || 0;
            const priorityB = b.config.priority || 0;
            return priorityB - priorityA;
        });
        
        return matchedMenus;
    }
    
    /**
     * 获取桌面右键菜单
     * @param {HTMLElement} target 目标元素
     * @returns {Object} 菜单配置
     */
    static _getDesktopMenu(target) {
        const items = [];
        
        // 检查是否点击在桌面图标上
        const desktopIcon = target.closest('.desktop-icon');
        if (desktopIcon) {
            const iconIdStr = desktopIcon.getAttribute('data-icon-id');
            if (iconIdStr) {
                // 获取图标数据（iconId 可能是字符串或数字，需要转换）
                // 将 iconId 定义在外层作用域，以便在 action 函数中使用
                const iconId = isNaN(iconIdStr) ? iconIdStr : Number(iconIdStr);
                let iconData = null;
                if (typeof DesktopManager !== 'undefined' && DesktopManager._icons) {
                    // 尝试将 iconId 转换为数字（因为 DesktopManager._icons 的 key 可能是数字）
                    iconData = DesktopManager._icons.get(iconId);
                    
                    // 如果数字类型找不到，尝试字符串类型
                    if (!iconData && typeof iconId === 'number') {
                        iconData = DesktopManager._icons.get(iconIdStr);
                    }
                    
                    // 如果还是找不到，尝试遍历所有图标
                    if (!iconData) {
                        for (const [id, data] of DesktopManager._icons) {
                            if (String(id) === iconIdStr || id === iconId) {
                                iconData = data;
                                break;
                            }
                        }
                    }
                    
                    // 调试日志
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("ContextMenuManager", `桌面图标右键菜单 - iconId: ${iconIdStr}, 找到图标数据: ${!!iconData}, programName: ${iconData?.programName || '无'}, 图标总数: ${DesktopManager._icons?.size || 0}`);
                    }
                } else {
                    // 如果 DesktopManager 不可用，记录警告
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("ContextMenuManager", `DesktopManager 不可用或 _icons 未初始化`);
                    }
                }
                
                // 如果是文件/文件夹图标，构建文件/文件夹专用菜单
                if (iconData && iconData.type && (iconData.type === 'file' || iconData.type === 'directory')) {
                    // 打开选项
                    items.push({
                        label: '打开',
                        icon: iconData.type === 'directory' ? '📂' : '📄',
                        action: () => {
                            if (typeof DesktopManager !== 'undefined' && typeof DesktopManager._handleFileOrFolderIconClick === 'function') {
                                DesktopManager._handleFileOrFolderIconClick(iconData);
                            }
                            ContextMenuManager._hideMenu();
                        }
                    });
                    
                    items.push({ type: 'separator' });
                    
                    // 重命名选项
                    items.push({
                        label: '重命名',
                        icon: '✏️',
                        action: () => {
                            if (typeof DesktopManager !== 'undefined' && typeof DesktopManager._renameIcon === 'function') {
                                DesktopManager._renameIcon(iconData);
                            }
                            ContextMenuManager._hideMenu();
                        }
                    });
                    
                    // 删除选项
                    items.push({
                        label: '删除',
                        icon: '🗑️',
                        danger: true,
                        action: async () => {
                            let confirmed = false;
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                                confirmed = await GUIManager.showConfirm(
                                    `确定要从桌面删除 "${iconData.name}" 吗？`,
                                    '确认删除',
                                    'danger'
                                );
                            } else {
                                confirmed = confirm(`确定要从桌面删除 "${iconData.name}" 吗？`);
                            }
                            
                            if (confirmed) {
                                if (typeof DesktopManager !== 'undefined' && typeof DesktopManager.removeShortcut === 'function') {
                                    DesktopManager.removeShortcut(iconData.id);
                                }
                                ContextMenuManager._hideMenu();
                            }
                        }
                    });
                    
                    items.push({ type: 'separator' });
                    
                    // 文件属性选项
                    items.push({
                        label: '文件属性',
                        icon: '📋',
                        action: async () => {
                            ContextMenuManager._hideMenu();
                            if (typeof DesktopManager !== 'undefined' && typeof DesktopManager._showFileOrFolderIconProperties === 'function') {
                                await DesktopManager._showFileOrFolderIconProperties(iconData);
                            }
                        }
                    });
                    
                    // 返回文件/文件夹菜单
                    return { items: items };
                }
                
                // 如果图标关联了程序，添加程序相关功能
                if (iconData && iconData.programName) {
                    const programName = iconData.programName;
                    
                    // 查找程序的进程信息
                    let pid = null;
                    if (typeof ProcessManager !== 'undefined') {
                        for (const [p, info] of ProcessManager.PROCESS_TABLE) {
                            if (info.programName === programName && info.status === 'running') {
                                pid = p;
                                break;
                            }
                        }
                    }
                    
                    // 程序详情
                    items.push({
                        label: '程序详情',
                        icon: 'ℹ',
                        action: () => {
                            ContextMenuManager._showProgramDetails(programName, pid);
                            ContextMenuManager._hideMenu();
                        }
                    });
                    
                    // 打开程序源地址（使用文件管理器打开目录）
                    items.push({
                        label: '打开程序源地址',
                        icon: '📁',
                        action: async () => {
                            try {
                                // 获取程序的脚本路径
                                let scriptPath = null;
                                if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.getScriptPath === 'function') {
                                    scriptPath = ApplicationAssetManager.getScriptPath(programName);
                                }
                                
                                if (!scriptPath) {
                                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                        await GUIManager.showAlert(`无法获取程序 ${programName} 的源文件路径`, '错误', 'error');
                                    } else {
                                        alert(`无法获取程序 ${programName} 的源文件路径`);
                                    }
                                    ContextMenuManager._hideMenu();
                                    return;
                                }
                                
                                // 规范化路径（确保使用正确的路径格式）
                                scriptPath = scriptPath.replace(/\\/g, '/');
                                
                                // 提取目录路径（去掉文件名）
                                const scriptDir = scriptPath.substring(0, scriptPath.lastIndexOf('/'));
                                
                                if (!scriptDir) {
                                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                        await GUIManager.showAlert(`无法提取程序 ${programName} 的源目录路径`, '错误', 'error');
                                    } else {
                                        alert(`无法提取程序 ${programName} 的源目录路径`);
                                    }
                                    ContextMenuManager._hideMenu();
                                    return;
                                }
                                
                                // 检查文件管理器是否已运行
                                let fileManagerPid = null;
                                if (typeof ProcessManager !== 'undefined') {
                                    for (const [p, info] of ProcessManager.PROCESS_TABLE) {
                                        if (info.programName === 'filemanager' && info.status === 'running') {
                                            fileManagerPid = p;
                                            break;
                                        }
                                    }
                                }
                                
                                // 如果文件管理器未运行，启动它并导航到目录
                                if (!fileManagerPid && typeof ProcessManager !== 'undefined') {
                                    await ProcessManager.startProgram('filemanager', {
                                        args: [scriptDir], // 传递目录路径作为初始路径
                                        cwd: scriptDir // 也设置 cwd 以确保正确导航
                                    });
                                } else if (fileManagerPid && typeof ProcessManager !== 'undefined') {
                                    // 如果文件管理器已运行，导航到新路径并聚焦窗口
                                    if (typeof GUIManager !== 'undefined') {
                                        GUIManager.focusWindow(fileManagerPid);
                                        
                                        // 尝试通过文件管理器实例导航到新路径
                                        const processInfo = ProcessManager.PROCESS_TABLE.get(fileManagerPid);
                                        if (processInfo && processInfo.programModule) {
                                            const fileManager = processInfo.programModule;
                                            // 使用文件管理器的导航方法
                                            if (typeof fileManager._navigateToPath === 'function') {
                                                await fileManager._navigateToPath(scriptDir);
                                            } else if (typeof fileManager._loadDirectory === 'function') {
                                                await fileManager._loadDirectory(scriptDir);
                                            } else if (typeof fileManager._setCurrentPath === 'function') {
                                                fileManager._setCurrentPath(scriptDir);
                                                // 重新加载目录
                                                if (typeof fileManager._loadDirectory === 'function') {
                                                    await fileManager._loadDirectory(scriptDir);
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                ContextMenuManager._hideMenu();
                            } catch (error) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error("ContextMenuManager", `打开程序源地址失败: ${error.message}`, error);
                                }
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                    await GUIManager.showAlert(`打开程序源地址失败: ${error.message}`, '错误', 'error');
                                } else {
                                    alert(`打开程序源地址失败: ${error.message}`);
                                }
                                ContextMenuManager._hideMenu();
                            }
                        }
                    });
                    
                    // 打开程序源文件
                    items.push({
                        label: '打开程序源文件',
                        icon: '📝',
                        action: async () => {
                            try {
                                // 获取程序的脚本路径
                                let scriptPath = null;
                                if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.getScriptPath === 'function') {
                                    scriptPath = ApplicationAssetManager.getScriptPath(programName);
                                }
                                
                                if (!scriptPath) {
                                    if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                        await GUIManager.showAlert(`无法获取程序 ${programName} 的源文件路径`, '错误', 'error');
                                    } else {
                                        alert(`无法获取程序 ${programName} 的源文件路径`);
                                    }
                                    ContextMenuManager._hideMenu();
                                    return;
                                }
                                
                                // 规范化路径（确保使用正确的路径格式）
                                scriptPath = scriptPath.replace(/\\/g, '/');
                                
                                // 检查 zeroide 是否已运行
                                let zeroidePid = null;
                                let zeroide = null;
                                if (typeof ProcessManager !== 'undefined') {
                                    for (const [p, info] of ProcessManager.PROCESS_TABLE) {
                                        if (info.programName === 'zeroide' && info.status === 'running') {
                                            zeroidePid = p;
                                            zeroide = info.programModule;
                                            break;
                                        }
                                    }
                                }
                                
                                // 如果 zeroide 未运行，启动它
                                if (!zeroidePid && typeof ProcessManager !== 'undefined') {
                                    // 获取文件所在目录作为工作空间
                                    const scriptDir = scriptPath.substring(0, scriptPath.lastIndexOf('/'));
                                    
                                    zeroidePid = await ProcessManager.startProgram('zeroide', {
                                        args: [],
                                        workspacePath: scriptDir // 设置工作空间为文件所在目录
                                    });
                                    
                                    // 等待 zeroide 初始化完成
                                    let retries = 0;
                                    while (retries < 20) { // 最多等待 2 秒
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                        const processInfo = ProcessManager.PROCESS_TABLE.get(zeroidePid);
                                        if (processInfo && processInfo.programModule && processInfo.programModule._openFile) {
                                            zeroide = processInfo.programModule;
                                            break;
                                        }
                                        retries++;
                                    }
                                }
                                
                                // 如果 zeroide 已运行或刚启动，打开文件
                                if (zeroidePid && typeof ProcessManager !== 'undefined') {
                                    // 如果还没有获取到 zeroide 实例，再次尝试
                                    if (!zeroide) {
                                        const processInfo = ProcessManager.PROCESS_TABLE.get(zeroidePid);
                                        if (processInfo && processInfo.programModule) {
                                            zeroide = processInfo.programModule;
                                        }
                                    }
                                    
                                    if (zeroide && typeof zeroide._openFile === 'function') {
                                        // 等待一下，确保 zeroide 完全初始化
                                        await new Promise(resolve => setTimeout(resolve, 300));
                                        // 打开文件
                                        await zeroide._openFile(scriptPath);
                                    } else {
                                        // 如果无法直接打开文件，至少确保 zeroide 已启动并聚焦
                                        if (typeof GUIManager !== 'undefined') {
                                            GUIManager.focusWindow(zeroidePid);
                                        }
                                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                            await GUIManager.showAlert('ZeroIDE 已启动，请在 ZeroIDE 中手动打开文件', '提示', 'info');
                                        }
                                    }
                                }
                                
                                ContextMenuManager._hideMenu();
                            } catch (error) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error("ContextMenuManager", `打开程序源文件失败: ${error.message}`, error);
                                }
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                    await GUIManager.showAlert(`打开程序源文件失败: ${error.message}`, '错误', 'error');
                                } else {
                                    alert(`打开程序源文件失败: ${error.message}`);
                                }
                                ContextMenuManager._hideMenu();
                            }
                        }
                    });
                    
                    items.push({ type: 'separator' });
                }
                
                // 添加"删除该快捷方式"功能
                items.push({
                    label: '删除该快捷方式',
                    icon: '🗑',
                    danger: true,
                    action: () => {
                        ContextMenuManager._removeDesktopShortcut(iconId);
                    }
                });
                items.push({ type: 'separator' });
            }
        }
        
        // 桌面菜单项
        items.push({
            label: '刷新',
            icon: '↻',
            action: () => {
                ContextMenuManager.refreshDesktop();
            }
        });
        items.push({
            label: '主题管理',
            icon: '🎨',
            action: () => {
                // 启动主题管理器程序
                if (typeof ProcessManager !== 'undefined') {
                    try {
                        ProcessManager.startProgram('themeanimator', {});
                        KernelLogger.info("ContextMenuManager", "启动主题管理器程序");
                    } catch (e) {
                        KernelLogger.error("ContextMenuManager", `启动主题管理器失败: ${e.message}`);
                    }
                } else {
                    KernelLogger.warn("ContextMenuManager", "ProcessManager 不可用，无法启动主题管理器");
                }
                // 关闭菜单
                ContextMenuManager._hideMenu();
            }
        });
        items.push({
            label: '查看',
            icon: '👁',
            submenu: () => {
                // 动态获取当前状态
                const currentIconSize = typeof DesktopManager !== 'undefined' ? DesktopManager._iconSize : 'medium';
                const currentArrangementMode = typeof DesktopManager !== 'undefined' ? DesktopManager._arrangementMode : 'grid';
                const currentAutoArrange = typeof DesktopManager !== 'undefined' ? DesktopManager._autoArrange : true;
                
                return [
                    {
                        label: '大图标',
                        checked: currentIconSize === 'large',
                        action: () => {
                            if (typeof DesktopManager !== 'undefined') {
                                DesktopManager.setIconSize('large');
                            }
                        }
                    },
                    {
                        label: '中等图标',
                        checked: currentIconSize === 'medium',
                        action: () => {
                            if (typeof DesktopManager !== 'undefined') {
                                DesktopManager.setIconSize('medium');
                            }
                        }
                    },
                    {
                        label: '小图标',
                        checked: currentIconSize === 'small',
                        action: () => {
                            if (typeof DesktopManager !== 'undefined') {
                                DesktopManager.setIconSize('small');
                            }
                        }
                    },
                    { type: 'separator' },
                    {
                        label: '自动排列',
                        checked: currentAutoArrange && currentArrangementMode === 'grid',
                        action: () => {
                            if (typeof DesktopManager !== 'undefined') {
                                DesktopManager.setAutoArrange(true);
                                DesktopManager.setArrangementMode('grid');
                            }
                        }
                    },
                    {
                        label: '列表排列',
                        checked: currentArrangementMode === 'list',
                        action: () => {
                            if (typeof DesktopManager !== 'undefined') {
                                DesktopManager.setAutoArrange(true);
                                DesktopManager.setArrangementMode('list');
                            }
                        }
                    },
                    {
                        label: '自由排列',
                        checked: currentArrangementMode === 'auto' && !currentAutoArrange,
                        action: () => {
                            if (typeof DesktopManager !== 'undefined') {
                                DesktopManager.setAutoArrange(false);
                                DesktopManager.setArrangementMode('auto');
                            }
                        }
                    }
                ];
            }
        });
        
        return { items };
    }
    
    /**
     * 获取任务栏图标右键菜单
     * @param {HTMLElement} target 目标元素
     * @returns {Promise<Object>} 菜单配置
     */
    static async _getTaskbarIconMenu(target) {
        const icon = target.closest('.taskbar-icon');
        if (!icon) {
            return null;
        }
        
        const programName = icon.dataset.programName;
        const pid = icon.dataset.pid ? parseInt(icon.dataset.pid) : null;
        
        if (!programName) {
            return null;
        }
        
        // 检查是否已固定在任务栏
        let isPinned = false;
        if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.isPinned === 'function') {
            try {
                isPinned = await TaskbarManager.isPinned(programName);
            } catch (e) {
                isPinned = false;
            }
        }
        
        const items = [];
        
        // 程序详情（始终显示）
        items.push({
            label: '程序详情',
            icon: 'ℹ',
            action: () => {
                ContextMenuManager._showProgramDetails(programName, pid);
            }
        });
        
        items.push({ type: 'separator' });
        
        // 如果程序正在运行
        if (pid && typeof ProcessManager !== 'undefined') {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (processInfo && processInfo.status === 'running') {
                if (processInfo.isMinimized) {
                    items.push({
                        label: '恢复',
                        action: () => {
                            if (typeof TaskbarManager !== 'undefined') {
                                TaskbarManager._restoreProgram(pid);
                            }
                        }
                    });
                } else {
                    items.push({
                        label: '最小化',
                        action: () => {
                            if (typeof TaskbarManager !== 'undefined') {
                                TaskbarManager._minimizeProgram(pid);
                            }
                        }
                    });
                }
                
                items.push({ type: 'separator' });
                
                items.push({
                    label: '关闭',
                    danger: true,
                    action: () => {
                        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                            ProcessManager.killProgram(pid);
                        }
                    }
                });
            } else {
                items.push({
                    label: '启动',
                    action: () => {
                        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.startProgram === 'function') {
                            ProcessManager.startProgram(programName, {});
                        }
                    }
                });
            }
        } else {
            items.push({
                label: '启动',
                action: () => {
                    if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.startProgram === 'function') {
                        ProcessManager.startProgram(programName, {});
                    }
                }
            });
        }
        
        // 根据固定状态添加"取消任务栏固定"或"固定到任务栏"功能
        items.push({ type: 'separator' });
        if (isPinned) {
            items.push({
                label: '取消任务栏固定',
                icon: '📌',
                action: async () => {
                    if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.unpinProgram === 'function') {
                        try {
                            await TaskbarManager.unpinProgram(programName);
                        } catch (error) {
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert(`取消固定失败: ${error.message}`, '错误', 'error');
                            }
                        }
                    }
                    // 关闭菜单
                    ContextMenuManager._hideMenu();
                }
            });
        } else {
            items.push({
                label: '固定到任务栏',
                icon: '📌',
                action: async () => {
                    if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.pinProgram === 'function') {
                        try {
                            await TaskbarManager.pinProgram(programName);
                        } catch (error) {
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert(`固定程序失败: ${error.message}`, '错误', 'error');
                            }
                        }
                    }
                    // 关闭菜单
                    ContextMenuManager._hideMenu();
                }
            });
        }
        
        // 添加"发送到桌面"功能
        items.push({
            label: '发送到桌面',
            icon: '📌',
            action: () => {
                ContextMenuManager._addToDesktop(programName);
            }
        });
        
        return { items };
    }
    
    /**
     * 获取任务栏启动器右键菜单
     * @param {HTMLElement} target 目标元素
     * @returns {Object} 菜单配置
     */
    static _getTaskbarLauncherMenu(target) {
        return {
            items: [
                {
                    label: '所有程序',
                    action: () => {
                        // 切换应用程序菜单
                        if (typeof TaskbarManager !== 'undefined') {
                            const launcherIcon = target.closest('.taskbar-app-launcher');
                            if (launcherIcon) {
                                TaskbarManager._toggleAppLauncher(launcherIcon);
                            }
                        }
                    }
                }
            ]
        };
    }
    
    /**
     * 获取任务栏右键菜单
     * @param {HTMLElement} target 目标元素
     * @returns {Object} 菜单配置
     */
    static _getTaskbarMenu(target) {
        const items = [];
        
        // 切换任务栏位置
        items.push({
            label: '切换任务栏位置',
            icon: '⇄',
            submenu: [
                {
                    label: '顶部',
                    icon: '↑',
                    action: () => {
                        if (typeof TaskbarManager !== 'undefined') {
                            TaskbarManager.setTaskbarPosition('top');
                        }
                    }
                },
                {
                    label: '底部',
                    icon: '↓',
                    action: () => {
                        if (typeof TaskbarManager !== 'undefined') {
                            TaskbarManager.setTaskbarPosition('bottom');
                        }
                    }
                },
                {
                    label: '左侧',
                    icon: '←',
                    action: () => {
                        if (typeof TaskbarManager !== 'undefined') {
                            TaskbarManager.setTaskbarPosition('left');
                        }
                    }
                },
                {
                    label: '右侧',
                    icon: '→',
                    action: () => {
                        if (typeof TaskbarManager !== 'undefined') {
                            TaskbarManager.setTaskbarPosition('right');
                        }
                    }
                }
            ]
        });
        
        // 分隔线
        items.push({ type: 'separator' });
        
        // 打开任务管理器
        items.push({
            label: '打开任务管理器',
            icon: '⚙',
            action: async () => {
                if (typeof ProcessManager !== 'undefined') {
                    try {
                        // 检查任务管理器是否已经在运行
                        let taskManagerPid = null;
                        for (const [pid, info] of ProcessManager.PROCESS_TABLE) {
                            if (info.programName === 'taskmanager' && info.status === 'running') {
                                taskManagerPid = pid;
                                break;
                            }
                        }
                        
                        if (taskManagerPid) {
                            // 如果已经在运行，聚焦到任务管理器窗口
                            if (typeof GUIManager !== 'undefined') {
                                GUIManager.focusWindow(taskManagerPid);
                            }
                        } else {
                            // 如果未运行，启动任务管理器
                            await ProcessManager.startProgram('taskmanager');
                        }
                    } catch (error) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error("ContextMenuManager", `打开任务管理器失败: ${error.message}`, error);
                        }
                        if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                            await GUIManager.showAlert(`打开任务管理器失败: ${error.message}`, '错误', 'error');
                        }
                    }
                }
            }
        });
        
        return { items };
    }
    
    /**
     * 获取应用程序菜单项右键菜单
     * @param {HTMLElement} target 目标元素
     * @returns {Promise<Object>} 菜单配置
     */
    static async _getAppMenuItemMenu(target) {
        const menuItem = target.closest('.taskbar-app-menu-item');
        if (!menuItem) {
            return null;
        }
        
        // 获取程序名称（从菜单项中查找）
        const programName = menuItem.dataset.programName;
        if (!programName) {
            return null;
        }
        
        // 查找程序的进程信息
        let processInfo = null;
        let pid = null;
        if (typeof ProcessManager !== 'undefined') {
            const processTable = ProcessManager.PROCESS_TABLE;
            for (const [p, info] of processTable) {
                if (info.programName === programName && info.status === 'running') {
                    processInfo = info;
                    pid = p;
                    break;
                }
            }
        }
        
        // 检查是否已固定在任务栏
        let isPinned = false;
        if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.isPinned === 'function') {
            try {
                isPinned = await TaskbarManager.isPinned(programName);
            } catch (e) {
                isPinned = false;
            }
        }
        
        const items = [];
        
        // 程序详情（始终显示，无论是否运行）
        items.push({
            label: '程序详情',
            icon: 'ℹ',
            action: () => {
                ContextMenuManager._showProgramDetails(programName, pid);
                // 关闭应用程序菜单
                const appMenu = document.getElementById('taskbar-app-menu');
                if (appMenu && typeof TaskbarManager !== 'undefined') {
                    TaskbarManager._hideAppMenu(appMenu, null);
                }
            }
        });
        
        // 如果程序未运行，只显示详情和启动
        if (!processInfo || !pid) {
            items.push({ type: 'separator' });
            items.push({
                label: '启动',
                action: () => {
                    if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.startProgram === 'function') {
                        ProcessManager.startProgram(programName, {});
                    }
                    // 关闭应用程序菜单
                    const appMenu = document.getElementById('taskbar-app-menu');
                    if (appMenu && typeof TaskbarManager !== 'undefined') {
                        TaskbarManager._hideAppMenu(appMenu, null);
                    }
                }
            });
            
            // 添加"固定到任务栏"或"取消任务栏固定"功能
            items.push({ type: 'separator' });
            if (isPinned) {
                items.push({
                    label: '取消任务栏固定',
                    icon: '📌',
                    action: async () => {
                        if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.unpinProgram === 'function') {
                            try {
                                await TaskbarManager.unpinProgram(programName);
                            } catch (error) {
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                    await GUIManager.showAlert(`取消固定失败: ${error.message}`, '错误', 'error');
                                }
                            }
                        }
                        // 关闭应用程序菜单
                        const appMenu = document.getElementById('taskbar-app-menu');
                        if (appMenu && typeof TaskbarManager !== 'undefined') {
                            TaskbarManager._hideAppMenu(appMenu, null);
                        }
                    }
                });
            } else {
                items.push({
                    label: '固定到任务栏',
                    icon: '📌',
                    action: async () => {
                        if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.pinProgram === 'function') {
                            try {
                                await TaskbarManager.pinProgram(programName);
                            } catch (error) {
                                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                    await GUIManager.showAlert(`固定程序失败: ${error.message}`, '错误', 'error');
                                }
                            }
                        }
                        // 关闭应用程序菜单
                        const appMenu = document.getElementById('taskbar-app-menu');
                        if (appMenu && typeof TaskbarManager !== 'undefined') {
                            TaskbarManager._hideAppMenu(appMenu, null);
                        }
                    }
                });
            }
            
            // 添加"发送到桌面"功能
            items.push({
                label: '发送到桌面',
                icon: '📌',
                action: () => {
                    ContextMenuManager._addToDesktop(programName);
                    // 关闭应用程序菜单
                    const appMenu = document.getElementById('taskbar-app-menu');
                    if (appMenu && typeof TaskbarManager !== 'undefined') {
                        TaskbarManager._hideAppMenu(appMenu, null);
                    }
                }
            });
            return { items };
        }
        
        items.push({ type: 'separator' });
        
        if (processInfo.isMinimized) {
            items.push({
                label: '恢复',
                action: () => {
                    if (typeof TaskbarManager !== 'undefined') {
                        TaskbarManager._restoreProgram(pid);
                    }
                }
            });
        } else {
            items.push({
                label: '最小化',
                action: () => {
                    if (typeof TaskbarManager !== 'undefined') {
                        TaskbarManager._minimizeProgram(pid);
                    }
                }
            });
        } 
        
        items.push({ type: 'separator' });
        
        items.push({
            label: '关闭',
            danger: true,
            action: () => {
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                    ProcessManager.killProgram(pid);
                }
                // 关闭应用程序菜单
                const appMenu = document.getElementById('taskbar-app-menu');
                if (appMenu && typeof TaskbarManager !== 'undefined') {
                    TaskbarManager._hideAppMenu(appMenu, null);
                }
            }
        });
        
        // 添加"固定到任务栏"或"取消任务栏固定"功能
        items.push({ type: 'separator' });
        if (isPinned) {
            items.push({
                label: '取消任务栏固定',
                icon: '📌',
                action: async () => {
                    if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.unpinProgram === 'function') {
                        try {
                            await TaskbarManager.unpinProgram(programName);
                        } catch (error) {
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert(`取消固定失败: ${error.message}`, '错误', 'error');
                            }
                        }
                    }
                    // 关闭应用程序菜单
                    const appMenu = document.getElementById('taskbar-app-menu');
                    if (appMenu && typeof TaskbarManager !== 'undefined') {
                        TaskbarManager._hideAppMenu(appMenu, null);
                    }
                }
            });
        } else {
            items.push({
                label: '固定到任务栏',
                icon: '📌',
                action: async () => {
                    if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.pinProgram === 'function') {
                        try {
                            await TaskbarManager.pinProgram(programName);
                        } catch (error) {
                            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                                await GUIManager.showAlert(`固定程序失败: ${error.message}`, '错误', 'error');
                            }
                        }
                    }
                    // 关闭应用程序菜单
                    const appMenu = document.getElementById('taskbar-app-menu');
                    if (appMenu && typeof TaskbarManager !== 'undefined') {
                        TaskbarManager._hideAppMenu(appMenu, null);
                    }
                }
            });
        }
        
        // 添加"发送到桌面"功能
        items.push({
            label: '发送到桌面',
            icon: '📌',
            action: () => {
                ContextMenuManager._addToDesktop(programName);
                // 关闭应用程序菜单
                const appMenu = document.getElementById('taskbar-app-menu');
                if (appMenu && typeof TaskbarManager !== 'undefined') {
                    TaskbarManager._hideAppMenu(appMenu, null);
                }
            }
        });
        
        return { items };
    }
    
    /**
     * 获取窗口标题栏右键菜单
     * @param {HTMLElement} target 目标元素
     * @returns {Object} 菜单配置
     */
    static _getWindowTitlebarMenu(target) {
        const window = target.closest('.bash-window');
        if (!window) {
            return null;
        }
        
        const pid = window.dataset.pid ? parseInt(window.dataset.pid) : null;
        if (!pid || typeof ProcessManager === 'undefined') {
            return null;
        }
        
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (!processInfo) {
            return null;
        }
        
        const programName = processInfo.programName;
        const items = [];
        
        // 程序详情
        items.push({
            label: '程序详情',
            icon: 'ℹ',
            action: () => {
                ContextMenuManager._showProgramDetails(programName, pid);
            }
        });
        
        items.push({ type: 'separator' });
        
        if (processInfo.isMinimized) {
            items.push({
                label: '恢复',
                action: () => {
                    if (typeof TaskbarManager !== 'undefined') {
                        TaskbarManager._restoreProgram(pid);
                    }
                }
            });
        } else {
            items.push({
                label: '最小化',
                action: () => {
                    if (typeof TaskbarManager !== 'undefined') {
                        TaskbarManager._minimizeProgram(pid);
                    }
                }
            });
        }
        
        items.push({
            label: '最大化',
            action: () => {
                // TODO: 实现最大化功能
            }
        });
        
        items.push({ type: 'separator' });
        
        items.push({
            label: '关闭',
            danger: true,
            action: () => {
                // 检查是否是Exploit程序（PID 10000），如果是，只关闭窗口，不kill进程
                const isExploit = pid === (typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000);
                
                if (isExploit) {
                    // Exploit程序：只关闭窗口，不kill进程
                    if (typeof GUIManager !== 'undefined') {
                        const windows = GUIManager.getWindowsByPid(pid);
                        for (const windowInfo of windows) {
                            if (windowInfo.windowId) {
                                GUIManager._closeWindow(windowInfo.windowId, false);
                            }
                        }
                    }
                } else {
                    // 其他程序：正常kill进程
                    if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                        ProcessManager.killProgram(pid);
                    }
                }
            }
        });
        
        return { items };
    }
    
    /**
     * 获取窗口内容右键菜单
     * @param {HTMLElement} target 目标元素
     * @returns {Object} 菜单配置
     */
    static _getWindowContentMenu(target) {
        // 窗口内容的右键菜单可以由程序自己定义
        // 这里返回 null，让程序自己处理
        return null;
    }
    
    /**
     * 显示菜单
     * @param {Object} config 菜单配置
     * @param {Event} e 事件对象
     */
    static _showMenu(config, e) {
        // 立即关闭之前的菜单（包括所有子菜单）
        ContextMenuManager._hideMenu(true); // 立即关闭，不等待动画
        
        // 创建菜单元素
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.id = 'global-context-menu';
        
        // 应用主题背景色
        const themeManager = typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function' 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager")
            : (typeof ThemeManager !== 'undefined' ? ThemeManager : null);
        if (themeManager) {
            try {
                const currentTheme = themeManager.getCurrentTheme();
                if (currentTheme && currentTheme.colors) {
                    const menuBg = currentTheme.colors.backgroundElevated || currentTheme.colors.backgroundSecondary || currentTheme.colors.background;
                    menu.style.backgroundColor = menuBg;
                    menu.style.borderColor = currentTheme.colors.border || (currentTheme.colors.primary ? currentTheme.colors.primary + '33' : 'rgba(108, 142, 255, 0.2)');
                }
            } catch (e) {
                KernelLogger.warn("ContextMenuManager", `应用主题到上下文菜单失败: ${e.message}`);
            }
        }
        
        // 渲染菜单项
        for (const item of config.items) {
            if (item.type === 'separator') {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                menu.appendChild(separator);
            } else if (item.submenu) {
                // 子菜单（可能是函数，需要动态生成）
                const submenuItems = typeof item.submenu === 'function' ? item.submenu() : item.submenu;
                const menuItem = ContextMenuManager._createMenuItem({
                    ...item,
                    submenu: submenuItems
                });
                menu.appendChild(menuItem);
            } else {
                const menuItem = ContextMenuManager._createMenuItem(item);
                menu.appendChild(menuItem);
            }
        }
        
        // 添加到文档
        document.body.appendChild(menu);
        
        // 获取任务栏位置
        const taskbar = document.getElementById('taskbar');
        const taskbarPosition = taskbar ? (taskbar.classList.contains('taskbar-left') ? 'left' : 
                                          taskbar.classList.contains('taskbar-right') ? 'right' :
                                          taskbar.classList.contains('taskbar-top') ? 'top' : 'bottom') : 'bottom';
        
        // 设置位置（先设置初始位置，然后调整）
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        
        // 等待DOM更新后获取实际尺寸
        setTimeout(() => {
            const rect = menu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const menuWidth = rect.width;
            const menuHeight = rect.height;
            const padding = 10; // 边距
            
            let finalLeft = e.clientX;
            let finalTop = e.clientY;
            
            // 根据任务栏位置调整菜单位置
            if (taskbarPosition === 'left') {
                // 任务栏在左侧，菜单显示在右侧
                const targetRect = e.target.closest('.taskbar-icon, .taskbar-app-launcher')?.getBoundingClientRect();
                if (targetRect) {
                    finalLeft = targetRect.right + 10;
                    finalTop = targetRect.top;
                    
                    // 检查下边界
                    if (finalTop + menuHeight > viewportHeight - padding) {
                        finalTop = viewportHeight - menuHeight - padding;
                    }
                    // 检查上边界
                    if (finalTop < padding) {
                        finalTop = padding;
                    }
                }
            } else if (taskbarPosition === 'right') {
                // 任务栏在右侧，菜单显示在左侧
                const targetRect = e.target.closest('.taskbar-icon, .taskbar-app-launcher')?.getBoundingClientRect();
                if (targetRect) {
                    finalLeft = targetRect.left - menuWidth - 10;
                    finalTop = targetRect.top;
                    
                    // 检查下边界
                    if (finalTop + menuHeight > viewportHeight - padding) {
                        finalTop = viewportHeight - menuHeight - padding;
                    }
                    // 检查上边界
                    if (finalTop < padding) {
                        finalTop = padding;
                    }
                    // 检查左边界
                    if (finalLeft < padding) {
                        finalLeft = padding;
                    }
                }
            } else if (taskbarPosition === 'top') {
                // 任务栏在顶部，菜单显示在下方
                const targetRect = e.target.closest('.taskbar-icon, .taskbar-app-launcher')?.getBoundingClientRect();
                if (targetRect) {
                    finalLeft = targetRect.left;
                    finalTop = targetRect.bottom + 10;
                    
                    // 检查右边界
                    if (finalLeft + menuWidth > viewportWidth - padding) {
                        finalLeft = viewportWidth - menuWidth - padding;
                    }
                    // 检查左边界
                    if (finalLeft < padding) {
                        finalLeft = padding;
                    }
                }
            } else {
                // 任务栏在底部（默认），菜单显示在上方
                const targetRect = e.target.closest('.taskbar-icon, .taskbar-app-launcher')?.getBoundingClientRect();
                if (targetRect) {
                    finalLeft = targetRect.left;
                    finalTop = targetRect.top - menuHeight - 10;
                    
                    // 检查右边界
                    if (finalLeft + menuWidth > viewportWidth - padding) {
                        finalLeft = viewportWidth - menuWidth - padding;
                    }
                    // 检查左边界
                    if (finalLeft < padding) {
                        finalLeft = padding;
                    }
                    // 检查上边界
                    if (finalTop < padding) {
                        finalTop = targetRect.bottom + 10; // 如果上方空间不足，显示在下方
                    }
                }
            }
            
            // 通用边界检查（作为后备）
            // 检查右边界
            if (finalLeft + menuWidth > viewportWidth - padding) {
                finalLeft = viewportWidth - menuWidth - padding;
            }
            // 检查左边界
            if (finalLeft < padding) {
                finalLeft = padding;
            }
            
            // 检查下边界
            if (finalTop + menuHeight > viewportHeight - padding) {
                finalTop = viewportHeight - menuHeight - padding;
            }
            // 检查上边界
            if (finalTop < padding) {
                finalTop = padding;
            }
            
            // 应用调整后的位置
            menu.style.left = `${finalLeft}px`;
            menu.style.top = `${finalTop}px`;
        }, 0);
        
        // 使用 AnimateManager 添加打开动画
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.addAnimationClasses(menu, 'MENU', 'OPEN');
        }
        
        // 显示菜单
        menu.classList.add('visible');
        
        ContextMenuManager._currentMenu = menu;
    }
    
    /**
     * 创建菜单项
     * @param {Object} item 菜单项配置
     * @returns {HTMLElement} 菜单项元素
     */
    static _createMenuItem(item) {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        if (item.danger) {
            menuItem.classList.add('danger');
        }
        if (item.disabled) {
            menuItem.classList.add('disabled');
        }
        
        if (item.icon) {
            const icon = document.createElement('span');
            icon.className = 'context-menu-item-icon';
            
            // 检查是否是图片路径（以 .svg, .png, .jpg 等结尾）
            const isImagePath = /\.(svg|png|jpg|jpeg|gif|webp|ico)$/i.test(item.icon);
            
            if (isImagePath) {
                // 使用 img 元素加载图片
                const iconImg = document.createElement('img');
                // 转换虚拟路径为实际 URL
                const iconUrl = typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function'
                    ? ProcessManager.convertVirtualPathToUrl(item.icon)
                    : item.icon;
                iconImg.src = iconUrl;
                iconImg.style.cssText = 'width: 16px; height: 16px; object-fit: contain;';
                iconImg.onerror = () => {
                    // 如果图片加载失败，使用文本作为降级方案
                    icon.textContent = '•';
                };
                icon.appendChild(iconImg);
            } else {
                // 使用文本图标（emoji 或符号）
                icon.textContent = item.icon;
            }
            
            menuItem.appendChild(icon);
        }
        
        const label = document.createElement('span');
        label.className = 'context-menu-item-label';
        label.textContent = item.label;
        menuItem.appendChild(label);
        
        // 显示 checked 状态
        if (item.checked) {
            menuItem.classList.add('checked');
            const checkmark = document.createElement('span');
            checkmark.className = 'context-menu-item-checkmark';
            checkmark.textContent = '✓';
            checkmark.style.cssText = 'margin-left: auto; margin-right: 8px; color: var(--theme-accent, #7c3aed); font-weight: bold;';
            menuItem.appendChild(checkmark);
        }
        
        if (item.submenu) {
            const arrow = document.createElement('span');
            arrow.className = 'context-menu-item-arrow';
            arrow.textContent = '▶';
            menuItem.appendChild(arrow);
            
            // 创建子菜单
            const submenu = document.createElement('div');
            submenu.className = 'context-menu-submenu';
            submenu.style.display = 'none';
            submenu.style.position = 'fixed';
            submenu.style.zIndex = '100001';
            
            // 渲染子菜单项
            for (const subItem of item.submenu) {
                if (subItem.type === 'separator') {
                    const separator = document.createElement('div');
                    separator.className = 'context-menu-separator';
                    submenu.appendChild(separator);
                } else {
                    const subMenuItem = ContextMenuManager._createMenuItem(subItem);
                    submenu.appendChild(subMenuItem);
                }
            }
            
            // 添加到文档body（而不是菜单项），以便正确定位
            document.body.appendChild(submenu);
            
            // 鼠标悬停显示子菜单
            let submenuTimeout = null;
            menuItem.addEventListener('mouseenter', () => {
                if (submenuTimeout) {
                    clearTimeout(submenuTimeout);
                }
                submenuTimeout = setTimeout(() => {
                    ContextMenuManager._showSubmenu(menuItem, submenu);
                }, 150);
            });
            
            menuItem.addEventListener('mouseleave', (e) => {
                // 检查鼠标是否移动到子菜单
                const relatedTarget = e.relatedTarget;
                if (relatedTarget && (submenu.contains(relatedTarget) || relatedTarget.closest('.context-menu-submenu') === submenu)) {
                    return;
                }
                if (submenuTimeout) {
                    clearTimeout(submenuTimeout);
                }
                submenuTimeout = setTimeout(() => {
                    if (!submenu.matches(':hover') && !menuItem.matches(':hover')) {
                        submenu.style.display = 'none';
                        submenu.classList.remove('showing');
                    }
                }, 200);
            });
            
            // 子菜单的鼠标事件
            submenu.addEventListener('mouseenter', () => {
                if (submenuTimeout) {
                    clearTimeout(submenuTimeout);
                }
            });
            
            submenu.addEventListener('mouseleave', (e) => {
                // 检查鼠标是否移动到父菜单项
                const relatedTarget = e.relatedTarget;
                if (relatedTarget && (menuItem.contains(relatedTarget) || relatedTarget === menuItem)) {
                    return;
                }
                if (submenuTimeout) {
                    clearTimeout(submenuTimeout);
                }
                submenuTimeout = setTimeout(() => {
                    submenu.style.display = 'none';
                    submenu.classList.remove('showing');
                }, 200);
            });
        }
        
        if (item.action && !item.disabled && !item.submenu) {
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                item.action();
                ContextMenuManager._hideMenu();
            });
        }
        
        return menuItem;
    }
    
    /**
     * 显示子菜单
     * @param {HTMLElement} parentItem 父菜单项
     * @param {HTMLElement} submenu 子菜单元素
     */
    static _showSubmenu(parentItem, submenu) {
        // 立即隐藏所有其他子菜单（确保只有一个子菜单存在）
        const allSubmenus = document.querySelectorAll('.context-menu-submenu');
        allSubmenus.forEach(sm => {
            if (sm !== submenu) {
                if (typeof AnimateManager !== 'undefined') {
                    AnimateManager.stopAnimation(sm);
                    AnimateManager.removeAnimationClasses(sm);
                }
                sm.style.display = 'none';
                sm.style.visibility = 'hidden';
                sm.classList.remove('showing');
            }
        });
        
        // 确保子菜单已添加到文档中（如果还没有）
        if (!submenu.parentElement || !document.body.contains(submenu)) {
            // 子菜单应该已经在父菜单项中，但为了安全，确保它在文档中
            if (!submenu.parentElement) {
                document.body.appendChild(submenu);
            }
        }
        
        // 先计算位置（在显示之前）
        const parentRect = parentItem.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 10;
        
        // 默认显示在右侧
        let left = parentRect.right + 5;
        let top = parentRect.top;
        
        // 临时显示以获取尺寸
        submenu.style.display = 'block';
        submenu.style.visibility = 'hidden';
        submenu.style.position = 'fixed';
        submenu.style.zIndex = '100001';
        
        // 获取子菜单尺寸
        const submenuRect = submenu.getBoundingClientRect();
        const submenuWidth = submenuRect.width || 160; // 默认宽度
        const submenuHeight = submenuRect.height || 200; // 默认高度
        
        // 检查右边界
        if (left + submenuWidth > viewportWidth - padding) {
            // 显示在左侧
            left = parentRect.left - submenuWidth - 5;
        }
        
        // 检查下边界
        if (top + submenuHeight > viewportHeight - padding) {
            top = viewportHeight - submenuHeight - padding;
        }
        
        // 检查上边界
        if (top < padding) {
            top = padding;
        }
        
        // 设置位置
        submenu.style.left = `${left}px`;
        submenu.style.top = `${top}px`;
        
        // 使用 AnimateManager 添加打开动画
        if (typeof AnimateManager !== 'undefined') {
            AnimateManager.addAnimationClasses(submenu, 'MENU', 'OPEN');
        }
        
        // 显示子菜单
        submenu.style.visibility = 'visible';
        submenu.classList.add('showing');
    }
    
    /**
     * 隐藏菜单
     * @param {boolean} immediate 是否立即关闭（不等待动画）
     */
    /**
     * 刷新桌面
     * 收回所有弹出组件和右击菜单，重绘任务栏，给所有程序派发刷新事件
     */
    static refreshDesktop() {
        KernelLogger.info("ContextMenuManager", "开始刷新桌面");
        
        // 1. 关闭所有右击菜单（立即关闭）
        ContextMenuManager._hideMenu(true);
        
        // 2. 关闭所有任务栏弹出组件
        if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager._closeAllTaskbarPopups === 'function') {
            TaskbarManager._closeAllTaskbarPopups();
        }
        
        // 3. 强制重新加载背景视频（如果当前背景是视频）
        if (typeof ThemeManager !== 'undefined') {
            try {
                const currentBackgroundId = ThemeManager.getCurrentDesktopBackground();
                if (currentBackgroundId) {
                    // 获取背景信息
                    const background = ThemeManager._desktopBackgrounds.get(currentBackgroundId);
                    if (background && background.path) {
                        // 检查文件扩展名，判断是否为视频
                        const fileExtension = background.path.toLowerCase().split('.').pop() || '';
                        const isVideo = fileExtension === 'mp4' || fileExtension === 'webm' || fileExtension === 'ogg';
                        
                        if (isVideo) {
                            // 如果是视频，强制重新加载
                            KernelLogger.debug("ContextMenuManager", `检测到视频背景，强制重新加载: ${currentBackgroundId}`);
                            // 重新应用背景以强制重新加载视频（不保存，因为背景ID没有改变）
                            ThemeManager.setDesktopBackground(currentBackgroundId, false).catch(e => {
                                KernelLogger.warn("ContextMenuManager", `重新加载背景视频失败: ${e.message}`);
                            });
                        }
                    }
                }
            } catch (e) {
                KernelLogger.warn("ContextMenuManager", `检查并重新加载背景视频失败: ${e.message}`);
            }
        }
        
        // 4. 强制显示任务栏并重绘任务栏和其他系统UI
        if (typeof GUIManager !== 'undefined' && typeof GUIManager._showTaskbar === 'function') {
            GUIManager._showTaskbar();
            KernelLogger.debug("ContextMenuManager", "桌面刷新：强制显示任务栏");
        }
        if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager.update === 'function') {
            TaskbarManager.update();
        }
        
        // 重绘GUI窗口（如果需要）
        // 注意：窗口本身不需要重绘，但可以触发窗口更新事件
        if (typeof GUIManager !== 'undefined') {
            // GUIManager 的窗口由程序自己管理，不需要系统重绘
            // 但可以通过事件通知窗口需要刷新
        }
        
        // 5. 给所有正在运行的程序派发刷新事件
        if (typeof ProcessManager !== 'undefined' && ProcessManager.PROCESS_TABLE) {
            const refreshEvent = new CustomEvent('systemRefresh', {
                detail: {
                    timestamp: Date.now(),
                    source: 'desktop',
                    type: 'refresh'
                },
                bubbles: true,
                cancelable: true
            });
            
            // 遍历所有运行的程序
            for (const [pid, processInfo] of ProcessManager.PROCESS_TABLE) {
                if (processInfo.status === 'running' && pid !== ProcessManager.EXPLOIT_PID) {
                    try {
                        // 尝试获取程序对象并派发事件
                        const programName = processInfo.programName;
                        if (programName) {
                            const programNameUpper = programName.toUpperCase();
                            let programInstance = null;
                            
                            // 尝试从全局对象获取程序实例
                            if (typeof window !== 'undefined' && window[programNameUpper]) {
                                programInstance = window[programNameUpper];
                            } else if (typeof globalThis !== 'undefined' && globalThis[programNameUpper]) {
                                programInstance = globalThis[programNameUpper];
                            }
                            
                            // 如果程序有 onSystemRefresh 方法，调用它
                            if (programInstance && typeof programInstance.onSystemRefresh === 'function') {
                                try {
                                    programInstance.onSystemRefresh(refreshEvent.detail);
                                    KernelLogger.debug("ContextMenuManager", `程序 ${programName} (PID: ${pid}) 已处理刷新事件`);
                                } catch (e) {
                                    KernelLogger.warn("ContextMenuManager", `程序 ${programName} (PID: ${pid}) 处理刷新事件失败: ${e.message}`);
                                }
                            }
                            
                            // 同时派发 DOM 事件到程序的窗口元素（如果存在）
                            if (processInfo.domElements && processInfo.domElements.size > 0) {
                                processInfo.domElements.forEach(element => {
                                    if (element && element.dispatchEvent) {
                                        try {
                                            element.dispatchEvent(refreshEvent);
                                        } catch (e) {
                                            // 忽略事件派发错误
                                        }
                                    }
                                });
                            }
                        }
                    } catch (e) {
                        KernelLogger.warn("ContextMenuManager", `给程序 PID ${pid} 派发刷新事件失败: ${e.message}`);
                    }
                }
            }
            
            // 也在 document 上派发全局刷新事件
            if (typeof document !== 'undefined') {
                document.dispatchEvent(refreshEvent);
            }
        }
        
        KernelLogger.info("ContextMenuManager", "桌面刷新完成");
    }
    
    static _hideMenu(immediate = false) {
        // 隐藏所有子菜单（立即移除，不等待动画）
        const allSubmenus = document.querySelectorAll('.context-menu-submenu');
        allSubmenus.forEach(sm => {
            if (typeof AnimateManager !== 'undefined') {
                AnimateManager.stopAnimation(sm);
                AnimateManager.removeAnimationClasses(sm);
            }
            sm.style.display = 'none';
            sm.style.visibility = 'hidden';
            sm.classList.remove('showing');
            // 立即移除子菜单
            if (sm.parentElement) {
                sm.remove();
            }
        });
        
        // 隐藏所有其他菜单（确保只有一个菜单存在）
        const allMenus = document.querySelectorAll('.context-menu');
        allMenus.forEach(menu => {
            if (menu !== ContextMenuManager._currentMenu) {
                if (typeof AnimateManager !== 'undefined') {
                    AnimateManager.stopAnimation(menu);
                    AnimateManager.removeAnimationClasses(menu);
                }
                menu.remove();
            }
        });
        
        if (ContextMenuManager._currentMenu) {
            if (immediate) {
                // 立即移除，不等待动画
                if (typeof AnimateManager !== 'undefined') {
                    AnimateManager.stopAnimation(ContextMenuManager._currentMenu);
                    AnimateManager.removeAnimationClasses(ContextMenuManager._currentMenu);
                }
                ContextMenuManager._currentMenu.remove();
                ContextMenuManager._currentMenu = null;
            } else {
                // 使用 AnimateManager 添加关闭动画
                let closeDuration = 200; // 默认时长
                if (typeof AnimateManager !== 'undefined') {
                    const config = AnimateManager.addAnimationClasses(ContextMenuManager._currentMenu, 'MENU', 'CLOSE');
                    closeDuration = config ? config.duration : 200;
                }
                
                setTimeout(() => {
                    if (ContextMenuManager._currentMenu) {
                        ContextMenuManager._currentMenu.remove();
                        ContextMenuManager._currentMenu = null;
                    }
                }, closeDuration);
            }
        }
    }
    
    /**
     * 处理点击事件
     * @param {Event} e 事件对象
     */
    static _handleClick(e) {
        // 检查点击是否在任何菜单或子菜单内
        const clickedInMenu = ContextMenuManager._currentMenu && ContextMenuManager._currentMenu.contains(e.target);
        const clickedInSubmenu = e.target.closest('.context-menu-submenu');
        
        // 如果点击不在任何菜单内，立即关闭所有菜单
        if (!clickedInMenu && !clickedInSubmenu) {
            ContextMenuManager._hideMenu(true); // 立即关闭
        }
    }
    
    /**
     * 获取程序摘要信息
     * @param {string} programName 程序名称
     * @returns {Promise<Object|null>} 程序摘要信息
     */
    static async _getProgramSummary(programName) {
        if (!programName) return null;
        
        try {
            // 尝试从全局对象获取程序模块
            const programModuleName = programName.toUpperCase();
            let programModule = null;
            
            // 尝试从window或globalThis获取
            if (typeof window !== 'undefined' && window[programModuleName]) {
                programModule = window[programModuleName];
            } else if (typeof globalThis !== 'undefined' && globalThis[programModuleName]) {
                programModule = globalThis[programModuleName];
            }
            
            // 如果程序模块存在且有__info__方法
            if (programModule && typeof programModule.__info__ === 'function') {
                try {
                    const info = await programModule.__info__();
                    return info;
                } catch (e) {
                    KernelLogger.warn("ContextMenuManager", `获取程序 ${programName} 的摘要信息失败: ${e.message}`);
                }
            }
        } catch (e) {
            KernelLogger.warn("ContextMenuManager", `获取程序摘要时出错: ${e.message}`);
        }
        
        return null;
    }
    
    /**
     * 显示程序详情窗口
     * @param {string} programName 程序名称
     * @param {number|null} pid 进程ID（可选）
     */
    static async _showProgramDetails(programName, pid = null) {
        // 检查是否已有程序详情窗口（使用Exploit PID）
        const exploitPid = typeof ProcessManager !== 'undefined' ? ProcessManager.EXPLOIT_PID : 10000;
        
        // 如果已有程序详情窗口，先关闭它
        if (typeof GUIManager !== 'undefined') {
            const existingWindows = GUIManager.getWindowsByPid(exploitPid);
            for (const existingWindowInfo of existingWindows) {
                const existingWindow = existingWindowInfo.window;
                if (existingWindow && existingWindow.dataset.programDetailsWindow === 'true') {
                    // 只关闭程序详情窗口，不kill Exploit进程
                    GUIManager.unregisterWindow(existingWindowInfo.windowId);
                    if (existingWindow.parentElement) {
                        existingWindow.remove();
                    }
                }
            }
        }
        
        // 获取程序信息
        let programInfo = null;
        if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.getProgramInfo === 'function') {
            programInfo = ApplicationAssetManager.getProgramInfo(programName);
        }
        
        // 获取程序摘要
        const programSummary = await ContextMenuManager._getProgramSummary(programName);
        
        // 获取进程信息
        let processInfo = null;
        if (pid && typeof ProcessManager !== 'undefined') {
            processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        }
        
        // 创建窗口容器
        const windowElement = document.createElement('div');
        windowElement.className = 'program-details-window';
        windowElement.dataset.programDetailsWindow = 'true';
        windowElement.style.cssText = `
            width: 700px;
            height: 600px;
            min-width: 500px;
            min-height: 400px;
            background: transparent;
            border: 1px solid rgba(139, 92, 246, 0.3);
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(60px) saturate(180%);
            -webkit-backdrop-filter: blur(60px) saturate(180%);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;
        
        // 创建窗口内容
        const content = document.createElement('div');
        content.className = 'program-details-content';
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 20px 24px;
            display: flex;
            flex-direction: column;
            gap: 24px;
        `;
        
        // 基本信息部分
        const basicInfoSection = document.createElement('div');
        basicInfoSection.className = 'program-details-section';
        
        const basicInfoTitle = document.createElement('div');
        basicInfoTitle.className = 'program-details-section-title';
        basicInfoTitle.textContent = '基本信息';
        basicInfoSection.appendChild(basicInfoTitle);
        
        const basicInfoList = document.createElement('div');
        basicInfoList.className = 'program-details-info-list';
        
        // 程序名称
        basicInfoList.appendChild(ContextMenuManager._createInfoItem('程序名称', programName));
        
        // 描述
        if (programInfo?.metadata?.description) {
            basicInfoList.appendChild(ContextMenuManager._createInfoItem('描述', programInfo.metadata.description));
        }
        
        // 脚本路径
        if (programInfo?.script) {
            basicInfoList.appendChild(ContextMenuManager._createInfoItem('脚本路径', programInfo.script));
        }
        
        // 图标路径
        if (programInfo?.icon) {
            basicInfoList.appendChild(ContextMenuManager._createInfoItem('图标', programInfo.icon));
        }
        
        // 样式文件
        if (programInfo?.styles && programInfo.styles.length > 0) {
            basicInfoList.appendChild(ContextMenuManager._createInfoItem('样式文件', programInfo.styles.join(', ')));
        }
        
        basicInfoSection.appendChild(basicInfoList);
        content.appendChild(basicInfoSection);
        
        // 程序摘要部分
        if (programSummary) {
            const summarySection = document.createElement('div');
            summarySection.className = 'program-details-section';
            
            const summaryTitle = document.createElement('div');
            summaryTitle.className = 'program-details-section-title';
            summaryTitle.textContent = '程序摘要';
            summarySection.appendChild(summaryTitle);
            
            const summaryContent = document.createElement('div');
            summaryContent.className = 'program-details-summary';
            
            if (typeof programSummary === 'string') {
                summaryContent.textContent = programSummary;
            } else if (typeof programSummary === 'object' && programSummary !== null) {
                // 如果是对象，格式化显示
                if (programSummary.description) {
                    const desc = document.createElement('div');
                    desc.className = 'program-summary-description';
                    desc.textContent = programSummary.description;
                    summaryContent.appendChild(desc);
                }
                
                if (programSummary.version) {
                    summaryContent.appendChild(ContextMenuManager._createInfoItem('版本', programSummary.version));
                }
                
                if (programSummary.author) {
                    summaryContent.appendChild(ContextMenuManager._createInfoItem('作者', programSummary.author));
                }
                
                if (programSummary.license) {
                    summaryContent.appendChild(ContextMenuManager._createInfoItem('许可证', programSummary.license));
                }
            }
            
            summarySection.appendChild(summaryContent);
            content.appendChild(summarySection);
        }
        
        // 进程信息部分
        if (processInfo && pid) {
            const processSection = document.createElement('div');
            processSection.className = 'program-details-section';
            
            const processTitle = document.createElement('div');
            processTitle.className = 'program-details-section-title';
            processTitle.textContent = '进程信息';
            processSection.appendChild(processTitle);
            
            const processList = document.createElement('div');
            processList.className = 'program-details-info-list';
            
            processList.appendChild(ContextMenuManager._createInfoItem('进程ID', pid.toString()));
            processList.appendChild(ContextMenuManager._createInfoItem('状态', processInfo.status || 'unknown'));
            processList.appendChild(ContextMenuManager._createInfoItem('是否最小化', processInfo.isMinimized ? '是' : '否'));
            
            if (processInfo.startTime) {
                const startDate = new Date(processInfo.startTime);
                processList.appendChild(ContextMenuManager._createInfoItem('启动时间', startDate.toLocaleString()));
            }
            
            // 内存信息
            if (typeof MemoryManager !== 'undefined' && typeof MemoryManager.checkMemory === 'function') {
                try {
                    const memoryInfo = MemoryManager.checkMemory(pid);
                    if (memoryInfo && memoryInfo.programs && memoryInfo.programs.length > 0) {
                        const memData = memoryInfo.programs[0];
                        if (memData.heapSize) {
                            processList.appendChild(ContextMenuManager._createInfoItem('堆内存', `${(memData.heapSize / 1024).toFixed(2)} KB`));
                        }
                        if (memData.shedSize) {
                            processList.appendChild(ContextMenuManager._createInfoItem('栈内存', `${memData.shedSize} items`));
                        }
                    }
                } catch (e) {
                    // 忽略内存信息获取错误
                }
            }
            
            processSection.appendChild(processList);
            content.appendChild(processSection);
        }
        
        // 元数据部分
        if (programInfo?.metadata && Object.keys(programInfo.metadata).length > 0) {
            const metadataSection = document.createElement('div');
            metadataSection.className = 'program-details-section';
            
            const metadataTitle = document.createElement('div');
            metadataTitle.className = 'program-details-section-title';
            metadataTitle.textContent = '元数据';
            metadataSection.appendChild(metadataTitle);
            
            const metadataList = document.createElement('div');
            metadataList.className = 'program-details-info-list';
            
            for (const [key, value] of Object.entries(programInfo.metadata)) {
                if (key !== 'name' && key !== 'description') {
                    const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
                    const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
                    metadataList.appendChild(ContextMenuManager._createInfoItem(displayKey, displayValue));
                }
            }
            
            metadataSection.appendChild(metadataList);
            content.appendChild(metadataSection);
        }
        
        // 权限信息部分
        if (typeof PermissionManager !== 'undefined') {
            const permissionSection = document.createElement('div');
            permissionSection.className = 'program-details-section';
            
            const permissionTitle = document.createElement('div');
            permissionTitle.className = 'program-details-section-title';
            permissionTitle.textContent = '权限信息';
            permissionSection.appendChild(permissionTitle);
            
            const permissionList = document.createElement('div');
            permissionList.className = 'program-details-info-list';
            
            // 获取程序声明的权限（从 __info__ 中）
            let declaredPermissions = [];
            if (programInfo?.metadata?.permissions) {
                declaredPermissions = Array.isArray(programInfo.metadata.permissions) 
                    ? programInfo.metadata.permissions 
                    : [programInfo.metadata.permissions];
            } else {
                // 尝试从程序对象获取
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
                        if (info && info.permissions) {
                            declaredPermissions = Array.isArray(info.permissions) 
                                ? info.permissions 
                                : [info.permissions];
                        }
                    } catch (e) {
                        // 静默处理
                    }
                }
            }
            
            // 获取已授予的权限（如果有运行中的进程）
            let grantedPermissions = [];
            if (pid && typeof PermissionManager.getProgramPermissions === 'function') {
                try {
                    grantedPermissions = PermissionManager.getProgramPermissions(pid) || [];
                } catch (e) {
                    // 静默处理
                }
            }
            
            // 权限名称映射
            const permNameMap = {
                'SYSTEM_NOTIFICATION': '系统通知',
                'KERNEL_DISK_READ': '读取文件',
                'KERNEL_DISK_WRITE': '写入文件',
                'KERNEL_DISK_DELETE': '删除文件',
                'KERNEL_DISK_CREATE': '创建文件',
                'KERNEL_DISK_LIST': '列出目录',
                'KERNEL_MEMORY_READ': '读取内存',
                'KERNEL_MEMORY_WRITE': '写入内存',
                'NETWORK_ACCESS': '网络访问',
                'GUI_WINDOW_CREATE': '创建窗口',
                'GUI_WINDOW_MANAGE': '管理窗口',
                'SYSTEM_STORAGE_READ': '读取系统存储',
                'SYSTEM_STORAGE_WRITE': '写入系统存储',
                'PROCESS_MANAGE': '管理进程',
                'THEME_READ': '读取主题',
                'THEME_WRITE': '修改主题',
                'DESKTOP_MANAGE': '管理桌面',
                'MULTITHREADING_CREATE': '创建线程',
                'MULTITHREADING_EXECUTE': '执行多线程任务'
            };
            
            if (declaredPermissions.length > 0 || grantedPermissions.length > 0) {
                // 显示已声明的权限
                if (declaredPermissions.length > 0) {
                    const declaredTitle = document.createElement('div');
                    declaredTitle.textContent = '已声明权限:';
                    declaredTitle.style.cssText = `
                        color: #aab2c0;
                        font-size: 13px;
                        font-weight: 600;
                        margin-top: 12px;
                        margin-bottom: 8px;
                    `;
                    permissionList.appendChild(declaredTitle);
                    
                    declaredPermissions.forEach(perm => {
                        const level = PermissionManager.PERMISSION_LEVEL_MAP[perm] || PermissionManager.PERMISSION_LEVEL.NORMAL;
                        const levelText = level === PermissionManager.PERMISSION_LEVEL.NORMAL ? '普通' :
                                        level === PermissionManager.PERMISSION_LEVEL.SPECIAL ? '特殊' : '危险';
                        const levelColor = level === PermissionManager.PERMISSION_LEVEL.NORMAL ? '#4caf50' :
                                         level === PermissionManager.PERMISSION_LEVEL.SPECIAL ? '#ff9800' : '#f44336';
                        const permName = permNameMap[perm] || perm;
                        const isGranted = grantedPermissions.includes(perm);
                        
                        const permItem = document.createElement('div');
                        permItem.style.cssText = `
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 8px 0;
                            border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                        `;
                        
                        const permLeft = document.createElement('div');
                        permLeft.style.cssText = `
                            display: flex;
                            flex-direction: column;
                            gap: 4px;
                            flex: 1;
                        `;
                        
                        const permNameEl = document.createElement('span');
                        permNameEl.textContent = permName;
                        permNameEl.style.cssText = `
                            color: ${isGranted ? '#e8ecf0' : '#aab2c0'};
                            font-size: 13px;
                            font-weight: ${isGranted ? '500' : '400'};
                        `;
                        
                        const permCodeEl = document.createElement('span');
                        permCodeEl.textContent = perm;
                        permCodeEl.style.cssText = `
                            color: #6c8eff;
                            font-size: 11px;
                            font-family: monospace;
                        `;
                        
                        permLeft.appendChild(permNameEl);
                        permLeft.appendChild(permCodeEl);
                        
                        const permRight = document.createElement('div');
                        permRight.style.cssText = `
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        `;
                        
                        if (isGranted) {
                            const grantedBadge = document.createElement('span');
                            grantedBadge.textContent = '已授予';
                            grantedBadge.style.cssText = `
                                padding: 4px 8px;
                                border-radius: 4px;
                                font-size: 11px;
                                font-weight: 600;
                                background: rgba(76, 175, 80, 0.2);
                                color: #4caf50;
                                border: 1px solid rgba(76, 175, 80, 0.4);
                            `;
                            permRight.appendChild(grantedBadge);
                        }
                        
                        const levelBadge = document.createElement('span');
                        levelBadge.textContent = levelText;
                        levelBadge.style.cssText = `
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: 600;
                            background: ${levelColor}33;
                            color: ${levelColor};
                            border: 1px solid ${levelColor}66;
                        `;
                        permRight.appendChild(levelBadge);
                        
                        permItem.appendChild(permLeft);
                        permItem.appendChild(permRight);
                        permissionList.appendChild(permItem);
                    });
                }
                
                // 显示已授予但未声明的权限（可能通过其他方式获得）
                const extraPermissions = grantedPermissions.filter(p => !declaredPermissions.includes(p));
                if (extraPermissions.length > 0) {
                    const extraTitle = document.createElement('div');
                    extraTitle.textContent = '额外授予权限:';
                    extraTitle.style.cssText = `
                        color: #aab2c0;
                        font-size: 13px;
                        font-weight: 600;
                        margin-top: 12px;
                        margin-bottom: 8px;
                    `;
                    permissionList.appendChild(extraTitle);
                    
                    extraPermissions.forEach(perm => {
                        const level = PermissionManager.PERMISSION_LEVEL_MAP[perm] || PermissionManager.PERMISSION_LEVEL.NORMAL;
                        const levelText = level === PermissionManager.PERMISSION_LEVEL.NORMAL ? '普通' :
                                        level === PermissionManager.PERMISSION_LEVEL.SPECIAL ? '特殊' : '危险';
                        const levelColor = level === PermissionManager.PERMISSION_LEVEL.NORMAL ? '#4caf50' :
                                         level === PermissionManager.PERMISSION_LEVEL.SPECIAL ? '#ff9800' : '#f44336';
                        const permName = permNameMap[perm] || perm;
                        
                        const permItem = document.createElement('div');
                        permItem.style.cssText = `
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 8px 0;
                            border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                        `;
                        
                        const permLeft = document.createElement('div');
                        permLeft.style.cssText = `
                            display: flex;
                            flex-direction: column;
                            gap: 4px;
                            flex: 1;
                        `;
                        
                        const permNameEl = document.createElement('span');
                        permNameEl.textContent = permName;
                        permNameEl.style.cssText = `
                            color: #e8ecf0;
                            font-size: 13px;
                            font-weight: 500;
                        `;
                        
                        const permCodeEl = document.createElement('span');
                        permCodeEl.textContent = perm;
                        permCodeEl.style.cssText = `
                            color: #6c8eff;
                            font-size: 11px;
                            font-family: monospace;
                        `;
                        
                        permLeft.appendChild(permNameEl);
                        permLeft.appendChild(permCodeEl);
                        
                        const permRight = document.createElement('div');
                        permRight.style.cssText = `
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        `;
                        
                        const grantedBadge = document.createElement('span');
                        grantedBadge.textContent = '已授予';
                        grantedBadge.style.cssText = `
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: 600;
                            background: rgba(76, 175, 80, 0.2);
                            color: #4caf50;
                            border: 1px solid rgba(76, 175, 80, 0.4);
                        `;
                        
                        const levelBadge = document.createElement('span');
                        levelBadge.textContent = levelText;
                        levelBadge.style.cssText = `
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: 600;
                            background: ${levelColor}33;
                            color: ${levelColor};
                            border: 1px solid ${levelColor}66;
                        `;
                        
                        permRight.appendChild(grantedBadge);
                        permRight.appendChild(levelBadge);
                        
                        permItem.appendChild(permLeft);
                        permItem.appendChild(permRight);
                        permissionList.appendChild(permItem);
                    });
                }
            } else {
                const noPerms = document.createElement('div');
                noPerms.textContent = '该程序未声明任何权限';
                noPerms.style.cssText = `
                    color: #aab2c0;
                    font-size: 13px;
                    padding: 12px;
                    text-align: center;
                    font-style: italic;
                `;
                permissionList.appendChild(noPerms);
            }
            
            permissionSection.appendChild(permissionList);
            content.appendChild(permissionSection);
        }
        
        windowElement.appendChild(content);
        
        // 添加到GUI容器
        const guiContainer = document.getElementById('gui-container');
        if (guiContainer) {
            guiContainer.appendChild(windowElement);
        } else {
            document.body.appendChild(windowElement);
        }
        
        // 注册到GUIManager（使用Exploit PID）
        // 注意：程序详情窗口由Exploit程序管理，关闭时只关闭UI，不kill进程
        if (typeof GUIManager !== 'undefined') {
            const programIcon = programInfo?.icon || null;
            const programTitle = programInfo?.metadata?.name || programName;
            
            const windowInfo = GUIManager.registerWindow(exploitPid, windowElement, {
                title: `程序详情 - ${programTitle}`,
                icon: programIcon,
                onClose: () => {
                    // 只关闭窗口，不kill Exploit进程
                    // 这是Exploit程序管理的特殊窗口，关闭时只移除UI
                    // 注意：onClose 回调在 _closeWindow 中被调用（在动画开始前）
                    // _closeWindow 会在动画完成后自动调用 unregisterWindow 并移除窗口
                    // 但为了确保窗口立即关闭（不等待动画），这里也立即移除窗口
                    // 如果窗口还在DOM中，立即移除它
                    if (windowElement && windowElement.parentElement) {
                        windowElement.remove();
                    }
                    // 更新任务栏（移除Exploit程序图标，如果没有其他窗口）
                    // 延迟更新，确保窗口已完全清理
                    if (typeof TaskbarManager !== 'undefined') {
                        setTimeout(() => {
                            TaskbarManager.update();
                        }, 100);
                    }
                },
                onMinimize: () => {
                    // 最小化处理
                    if (typeof TaskbarManager !== 'undefined') {
                        TaskbarManager.update();
                    }
                },
                onMaximize: () => {
                    // 最大化处理
                }
            });
            
            // 窗口注册后，更新任务栏以显示Exploit程序
            if (typeof TaskbarManager !== 'undefined') {
                setTimeout(() => {
                    TaskbarManager.update();
                }, 100);
            }
        }
    }
    
    /**
     * 创建信息项
     * @param {string} label 标签
     * @param {string} value 值
     * @returns {HTMLElement} 信息项元素
     */
    static _createInfoItem(label, value) {
        const item = document.createElement('div');
        item.className = 'program-details-info-item';
        
        const labelEl = document.createElement('span');
        labelEl.className = 'program-details-info-label';
        labelEl.textContent = label + ':';
        item.appendChild(labelEl);
        
        const valueEl = document.createElement('span');
        valueEl.className = 'program-details-info-value';
        valueEl.textContent = value;
        item.appendChild(valueEl);
        
        return item;
    }
    
    /**
     * 注册菜单配置（系统菜单，不绑定PID）
     * @param {string} context 上下文类型
     * @param {Object|Function} config 菜单配置或配置函数
     */
    static registerMenu(context, config) {
        ContextMenuManager._menuConfigs.set(context, config);
    }
    
    /**
     * 取消注册菜单配置（系统菜单）
     * @param {string} context 上下文类型
     */
    static unregisterMenu(context) {
        ContextMenuManager._menuConfigs.delete(context);
    }
    
    /**
     * 注册程序上下文菜单（由程序调用，绑定到PID）
     * @param {number} pid 进程ID
     * @param {Object} options 菜单选项
     * @param {string} options.context 上下文类型（如 'desktop', 'window-content', '*' 等）
     * @param {string} [options.selector] CSS选择器（可选，用于匹配特定元素）
     * @param {number} [options.priority=0] 优先级（可选，数字越大越优先，默认0）
     * @param {Array} options.items 菜单项数组
     * @param {string} [options.id] 菜单ID（可选，不提供则自动生成）
     * @returns {string} 菜单ID
     */
    static registerContextMenu(pid, options) {
        if (!pid || typeof pid !== 'number') {
            KernelLogger.warn("ContextMenuManager", "registerContextMenu: pid 无效");
            return null;
        }
        
        if (!options || (!options.items || (!Array.isArray(options.items) && typeof options.items !== 'function'))) {
            KernelLogger.warn("ContextMenuManager", "registerContextMenu: 菜单项无效（必须是数组或函数）");
            return null;
        }
        
        // 生成菜单ID
        const menuId = options.id || `menu_${pid}_${++ContextMenuManager._menuIdCounter}`;
        
        // 确保程序菜单映射存在
        if (!ContextMenuManager._programMenus.has(pid)) {
            ContextMenuManager._programMenus.set(pid, new Map());
        }
        
        const programMenus = ContextMenuManager._programMenus.get(pid);
        
        // 构建菜单配置
        const menuConfig = {
            context: options.context || '*',
            selector: options.selector || null,
            priority: options.priority || 0,
            items: options.items,
            id: menuId,
            pid: pid
        };
        
        // 注册菜单
        programMenus.set(menuId, menuConfig);
        
        KernelLogger.debug("ContextMenuManager", `程序 PID ${pid} 注册上下文菜单`, {
            menuId: menuId,
            context: menuConfig.context,
            selector: menuConfig.selector,
            priority: menuConfig.priority,
            itemType: typeof menuConfig.items,
            itemCount: Array.isArray(menuConfig.items) ? menuConfig.items.length : 'function'
        });
        
        return menuId;
    }
    
    /**
     * 更新程序上下文菜单
     * @param {number} pid 进程ID
     * @param {string} menuId 菜单ID
     * @param {Object} updates 更新内容（可以更新 items, priority, selector 等）
     * @returns {boolean} 是否成功
     */
    static updateContextMenu(pid, menuId, updates) {
        if (!pid || typeof pid !== 'number' || !menuId) {
            KernelLogger.warn("ContextMenuManager", "updateContextMenu: 参数无效");
            return false;
        }
        
        const programMenus = ContextMenuManager._programMenus.get(pid);
        if (!programMenus || !programMenus.has(menuId)) {
            KernelLogger.warn("ContextMenuManager", `updateContextMenu: 菜单不存在 (PID: ${pid}, menuId: ${menuId})`);
            return false;
        }
        
        const menuConfig = programMenus.get(menuId);
        
        // 更新配置
        if (updates.items !== undefined) {
            menuConfig.items = updates.items;
        }
        if (updates.priority !== undefined) {
            menuConfig.priority = updates.priority;
        }
        if (updates.selector !== undefined) {
            menuConfig.selector = updates.selector;
        }
        if (updates.context !== undefined) {
            menuConfig.context = updates.context;
        }
        
        KernelLogger.debug("ContextMenuManager", `程序 PID ${pid} 更新上下文菜单`, {
            menuId: menuId,
            updates: updates
        });
        
        return true;
    }
    
    /**
     * 注销程序上下文菜单
     * @param {number} pid 进程ID
     * @param {string} menuId 菜单ID（可选，不提供则注销该程序的所有菜单）
     * @returns {boolean} 是否成功
     */
    static unregisterContextMenu(pid, menuId = null) {
        if (!pid || typeof pid !== 'number') {
            KernelLogger.warn("ContextMenuManager", "unregisterContextMenu: pid 无效");
            return false;
        }
        
        const programMenus = ContextMenuManager._programMenus.get(pid);
        if (!programMenus) {
            return false;
        }
        
        if (menuId) {
            // 注销指定菜单
            const removed = programMenus.delete(menuId);
            if (removed) {
                KernelLogger.debug("ContextMenuManager", `程序 PID ${pid} 注销上下文菜单`, { menuId: menuId });
            }
            
            // 如果该程序没有其他菜单了，删除映射
            if (programMenus.size === 0) {
                ContextMenuManager._programMenus.delete(pid);
            }
            
            return removed;
        } else {
            // 注销该程序的所有菜单
            const menuCount = programMenus.size;
            ContextMenuManager._programMenus.delete(pid);
            KernelLogger.debug("ContextMenuManager", `程序 PID ${pid} 注销所有上下文菜单`, { menuCount: menuCount });
            return menuCount > 0;
        }
    }
    
    /**
     * 获取程序注册的所有菜单
     * @param {number} pid 进程ID
     * @returns {Array} 菜单配置数组
     */
    static getProgramMenus(pid) {
        if (!pid || typeof pid !== 'number') {
            return [];
        }
        
        const programMenus = ContextMenuManager._programMenus.get(pid);
        if (!programMenus) {
            return [];
        }
        
        return Array.from(programMenus.entries()).map(([menuId, config]) => ({
            id: menuId,
            ...config
        }));
    }
    
    /**
     * 添加程序到桌面
     * @param {string} programName 程序名称
     */
    static _addToDesktop(programName) {
        if (typeof DesktopManager === 'undefined') {
            KernelLogger.warn("ContextMenuManager", "DesktopManager 不可用，无法添加到桌面");
            return;
        }
        
        if (typeof ApplicationAssetManager === 'undefined') {
            KernelLogger.warn("ContextMenuManager", "ApplicationAssetManager 不可用，无法获取程序信息");
            return;
        }
        
        try {
            // 检查是否已经存在
            const existingIcons = DesktopManager.getIcons();
            const alreadyExists = existingIcons.some(icon => icon.programName === programName);
            
            if (alreadyExists) {
                KernelLogger.info("ContextMenuManager", `程序 ${programName} 已在桌面存在`);
                // 可以显示提示，但为了用户体验，静默处理
                return;
            }
            
            // 获取程序信息
            const programInfo = ApplicationAssetManager.getProgramInfo(programName);
            if (!programInfo) {
                KernelLogger.warn("ContextMenuManager", `程序 ${programName} 不存在`);
                return;
            }
            
            // 添加到桌面
            DesktopManager.addShortcut({
                programName: programName,
                name: programInfo.metadata?.description || programInfo.metadata?.name || programName,
                icon: programInfo.icon || null,
                description: programInfo.metadata?.description || '',
                position: null // 使用自动排列
            });
            
            KernelLogger.info("ContextMenuManager", `已添加程序 ${programName} 到桌面`);
        } catch (e) {
            KernelLogger.error("ContextMenuManager", `添加程序到桌面失败: ${e.message}`, e);
        }
    }
    
    /**
     * 从桌面删除快捷方式
     * @param {string} iconId 图标ID
     */
    static _removeDesktopShortcut(iconId) {
        if (typeof DesktopManager === 'undefined') {
            KernelLogger.warn("ContextMenuManager", "DesktopManager 不可用，无法删除桌面快捷方式");
            return;
        }
        
        try {
            const iconIdNum = parseInt(iconId);
            if (isNaN(iconIdNum)) {
                KernelLogger.warn("ContextMenuManager", `无效的图标ID: ${iconId}`);
                return;
            }
            
            DesktopManager.removeShortcut(iconIdNum);
            KernelLogger.info("ContextMenuManager", `已删除桌面快捷方式: ${iconId}`);
        } catch (e) {
            KernelLogger.error("ContextMenuManager", `删除桌面快捷方式失败: ${e.message}`, e);
        }
    }
}

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "ContextMenuManager", ContextMenuManager);
    } catch (e) {
        // 忽略错误
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/process/contextMenuManager.js");
}

// 自动初始化（当 DOM 就绪时）
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ContextMenuManager.init();
        });
    } else {
        ContextMenuManager.init();
    }
}

