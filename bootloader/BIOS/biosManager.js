// BIOS管理器
// 安全模式下的BIOS界面系统，用于修改内核、系统等核心数据
// 享有最高权限（高于exploit）

KernelLogger.info("BIOSManager", "模块初始化");

(function(window) {
    'use strict';
    
    class BIOSManager {
        // BIOS状态
        static _initialized = false;
        static _isActive = false;
        static _currentPage = 'main'; // 当前页面
        static _currentItemIndex = 0; // 当前选中项索引
        static _pages = {}; // 页面数据
        static _container = null; // BIOS容器
        static _pageStack = []; // 页面导航栈（用于Back功能）
        static _registryPathStack = []; // 注册表路径栈（用于嵌套导航，存储路径数组，如 ['key1', 'key2']）
        
        // 权限标志（BIOS享有最高权限）
        static _hasBIOSPermission = false;
        
        /**
         * 检查是否处于BIOS模式（安全模式）
         */
        static isBIOSMode() {
            try {
                if (typeof sessionStorage !== 'undefined') {
                    const safeModeFlag = sessionStorage.getItem('__ZEROS_SAFE_MODE__');
                    return safeModeFlag === 'true';
                }
            } catch (e) {
                // sessionStorage可能不可用，忽略错误
            }
            return false;
        }
        
        /**
         * 获取BIOS权限（最高权限，高于exploit）
         */
        static _acquireBIOSPermission() {
            BIOSManager._hasBIOSPermission = true;
            
            // 标记BIOS权限（可以通过POOL存储）
            if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
                try {
                    if (!POOL.__HAS__ || !POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                        POOL.__INIT__("KERNEL_GLOBAL_POOL");
                    }
                    POOL.__ADD__("KERNEL_GLOBAL_POOL", "__BIOS_MODE__", true);
                } catch (e) {
                    // 忽略错误
                }
            }
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("BIOSManager", "BIOS权限已获取（最高权限）");
            }
        }
        
        /**
         * 检查是否有BIOS权限
         */
        static hasBIOSPermission() {
            return BIOSManager._hasBIOSPermission;
        }
        
        /**
         * 初始化BIOS管理器
         */
        static async init() {
            if (BIOSManager._initialized) {
                return;
            }
            
            BIOSManager._initialized = true;
            
            // 检查是否处于BIOS模式
            if (!BIOSManager.isBIOSMode()) {
                return;
            }
            
            // 获取BIOS权限
            BIOSManager._acquireBIOSPermission();
            
            // 初始化BIOS界面
            BIOSManager._initBIOSInterface();
            
            // 设置键盘监听
            BIOSManager._setupKeyboardListeners();
            
            BIOSManager._isActive = true;
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("BIOSManager", "BIOS管理器初始化完成");
            }
        }
        
        /**
         * 初始化BIOS界面
         */
        static _initBIOSInterface() {
            if (typeof document === 'undefined') {
                return;
            }
            
            // 隐藏BIOS加载动画
            const biosLoading = document.getElementById('bios-loading');
            if (biosLoading) {
                biosLoading.style.display = 'none';
            }
            
            // 创建BIOS容器
            BIOSManager._container = document.createElement('div');
            BIOSManager._container.id = 'bios-container';
            BIOSManager._container.className = 'bios-container';
            
            // 初始化页面数据
            BIOSManager._initPages();
            
            // 渲染当前页面（异步）
            BIOSManager._renderPage(BIOSManager._currentPage).catch(err => {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("BIOSManager", `渲染页面失败: ${err.message}`, err);
                }
            });
            
            // 隐藏整个页面的鼠标光标（BIOS模式）
            // 必须在添加到页面之前设置，确保cursor样式在容器添加时立即生效
            if (document.body) {
                document.body.style.cursor = 'none';
            }
            if (document.documentElement) {
                document.documentElement.style.cursor = 'none';
            }
            
            // 添加到页面
            document.body.appendChild(BIOSManager._container);
        }
        
        /**
         * 初始化页面数据
         */
        static _initPages() {
            BIOSManager._pages = {
                main: {
                    title: 'BIOS Setup Utility',
                    items: [
                        { id: 'log-level', label: 'Log Level Settings', page: 'log-level' },
                        { id: 'system-info', label: 'System Information', page: 'system-info' },
                        { id: 'kernel-config', label: 'Kernel Configuration', page: 'kernel-config' },
                        { id: 'advanced', label: 'Advanced Settings', page: 'advanced' },
                        { id: 'testing', label: 'Testing', page: 'testing' },
                        { id: 'exit', label: 'Exit', action: 'exit' }
                    ]
                },
                'log-level': {
                    title: 'Log Level Settings',
                    items: [
                        { id: 'level-debug', label: 'DEBUG', value: 3, type: 'radio', group: 'log-level' },
                        { id: 'level-info', label: 'INFO', value: 2, type: 'radio', group: 'log-level' },
                        { id: 'level-warn', label: 'WARN', value: 1, type: 'radio', group: 'log-level' },
                        { id: 'level-error', label: 'ERROR', value: 0, type: 'radio', group: 'log-level' },
                        { id: 'level-none', label: 'NONE', value: -1, type: 'radio', group: 'log-level' },
                        { id: 'back', label: 'Back', action: 'back' }
                    ]
                },
                'system-info': {
                    title: 'System Information',
                    items: [
                        { id: 'info-system-name', label: 'System Name', type: 'info', value: null },
                        { id: 'info-system-version', label: 'System Version', type: 'info', value: null },
                        { id: 'info-kernel-version', label: 'Kernel Version', type: 'info', value: null },
                        { id: 'info-build-date', label: 'Build Date', type: 'info', value: null },
                        { id: 'info-system-description', label: 'Description', type: 'info', value: null },
                        { id: 'back', label: 'Back', action: 'back' }
                    ]
                },
                'kernel-config': {
                    title: 'Kernel Configuration',
                    items: [
                        { id: 'config-memory', label: 'Memory Settings', page: 'memory-config' },
                        { id: 'config-process', label: 'Process Settings', page: 'process-config' },
                        { id: 'back', label: 'Back', action: 'back' }
                    ]
                },
                'advanced': {
                    title: 'Advanced Settings',
                    items: [
                        { id: 'advanced-registry', label: 'Registry Editor', page: 'registry' },
                        { id: 'advanced-security', label: 'Security Settings', page: 'security' },
                        { id: 'back', label: 'Back', action: 'back' }
                    ]
                },
                'memory-config': {
                    title: 'Memory Configuration',
                    items: [
                        { id: 'back', label: 'Back', action: 'back' }
                    ]
                },
                'process-config': {
                    title: 'Process Configuration',
                    items: [
                        { id: 'back', label: 'Back', action: 'back' }
                    ]
                },
                'registry': {
                    title: 'Registry Editor',
                    items: [
                        { id: 'back', label: 'Back', action: 'back' }
                    ]
                },
                'security': {
                    title: 'Security Settings',
                    items: [
                        { id: 'back', label: 'Back', action: 'back' }
                    ]
                },
                'testing': {
                    title: 'Testing',
                    items: [
                        { id: 'test-kernel', label: 'Test Kernel Self-Check', action: 'test-kernel' },
                        { id: 'test-backend-php', label: 'Test Backend Service (PHP)', action: 'test-backend-php' },
                        { id: 'test-backend-spring', label: 'Test Backend Service (Spring)', action: 'test-backend-spring' },
                        { id: 'back', label: 'Back', action: 'back' }
                    ]
                }
            };
        }
        
        /**
         * 渲染页面
         * @param {string} pageId 页面ID
         * @param {boolean} skipStack 是否跳过栈操作（用于Back操作）
         */
        static async _renderPage(pageId, skipStack = false) {
            if (!BIOSManager._container) {
                return;
            }
            
            const page = BIOSManager._pages[pageId];
            if (!page) {
                return;
            }
            
            // 如果不是通过Back操作，将当前页推入栈（用于Back功能）
            if (!skipStack && BIOSManager._currentPage && BIOSManager._currentPage !== pageId) {
                // 如果当前页已经在栈顶，不重复添加
                if (BIOSManager._pageStack.length === 0 || BIOSManager._pageStack[BIOSManager._pageStack.length - 1] !== BIOSManager._currentPage) {
                    BIOSManager._pageStack.push(BIOSManager._currentPage);
                }
            }
            
            BIOSManager._currentPage = pageId;
            BIOSManager._currentItemIndex = 0;
            
            // 清空容器
            BIOSManager._container.innerHTML = '';
            
            // 创建页面结构
            const header = document.createElement('div');
            header.className = 'bios-header';
            header.textContent = page.title;
            
            // 如果是注册表页面，添加路径显示
            let pathDisplay = null;
            if (pageId === 'registry') {
                const pathString = BIOSManager._getRegistryPathString(BIOSManager._registryPathStack);
                pathDisplay = document.createElement('div');
                pathDisplay.className = 'bios-registry-path';
                pathDisplay.textContent = `Path: ${pathString}`;
                pathDisplay.style.cssText = `
                    color: rgba(0, 255, 0, 0.7);
                    font-size: 14px;
                    padding: 8px 20px;
                    border-bottom: 1px solid rgba(0, 255, 0, 0.2);
                    margin-bottom: 10px;
                `;
            }
            
            const menu = document.createElement('div');
            menu.className = 'bios-menu';
            
            // 获取当前日志级别（如果是日志级别页面）
            let currentLogLevel = null;
            if (pageId === 'log-level') {
                currentLogLevel = await BIOSManager._getLogLevel();
            }
            
            // 获取系统信息（如果是系统信息页面）
            let systemInfo = null;
            if (pageId === 'system-info') {
                systemInfo = await BIOSManager._getSystemInfo();
            }
            
            // 获取注册表项（如果是注册表页面）
            let registryKeys = [];
            let registryData = {};
            let registryPathString = 'registry';
            if (pageId === 'registry') {
                try {
                    // 根据当前路径获取注册表数据
                    registryData = await BIOSManager._getRegistryDataByPath(BIOSManager._registryPathStack);
                    registryKeys = Object.keys(registryData);
                    // 智能排序：如果是数组索引（数字字符串），按数值排序；否则按字典序排序
                    registryKeys.sort((a, b) => {
                        const numA = parseInt(a, 10);
                        const numB = parseInt(b, 10);
                        if (!isNaN(numA) && !isNaN(numB) && String(numA) === a && String(numB) === b) {
                            // 都是纯数字字符串，按数值排序
                            return numA - numB;
                        }
                        // 否则按字典序排序
                        return a.localeCompare(b);
                    });
                    registryPathString = BIOSManager._getRegistryPathString(BIOSManager._registryPathStack);
                    
                    // 动态更新页面items
                    page.items = registryKeys.map(key => {
                        const value = registryData[key];
                        const isObject = BIOSManager._isRegistryObject(value);
                        return {
                            id: `registry-${key}`,
                            label: key,
                            type: 'registry-item',
                            key: key,
                            value: value,
                            isObject: isObject,
                            path: [...BIOSManager._registryPathStack, key]
                        };
                    });
                    
                    // 如果不是根路径，添加Back项
                    if (BIOSManager._registryPathStack.length > 0) {
                        page.items.unshift({ id: 'registry-back', label: '< Back', action: 'registry-back' });
                    }
                    
                    // 添加Exit项（退出注册表编辑器）
                    page.items.push({ id: 'registry-exit', label: 'Exit Registry', action: 'registry-exit' });
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("BIOSManager", `获取注册表项失败: ${e.message}`);
                    }
                    page.items = [
                        { id: 'error', label: `Error: ${e.message}`, type: 'info' },
                        { id: 'registry-exit', label: 'Exit Registry', action: 'registry-exit' }
                    ];
                }
            }
            
            // 渲染菜单项
            page.items.forEach((item, index) => {
                const menuItem = document.createElement('div');
                menuItem.className = 'bios-menu-item';
                menuItem.dataset.index = index;
                menuItem.dataset.itemId = item.id;
                
                if (index === BIOSManager._currentItemIndex) {
                    menuItem.classList.add('selected');
                }
                
                let label = item.label;
                if (item.type === 'info') {
                    // 如果value为null，尝试从systemInfo获取
                    let value = item.value;
                    if (value === null && systemInfo) {
                        value = systemInfo[item.id] || 'N/A';
                    }
                    if (value) {
                        label += `: ${value}`;
                    }
                } else if (item.type === 'radio') {
                    if (currentLogLevel !== null && item.value === currentLogLevel) {
                        menuItem.classList.add('checked');
                        label = `[•] ${label} (Current)`;
                    } else {
                        label = `[ ] ${label}`;
                    }
                } else if (item.type === 'registry-item') {
                    // 注册表项：显示键名和值的预览
                    if (item.isObject) {
                        // 如果是对象或数组，显示为可进入的目录
                        const keys = Object.keys(item.value);
                        const keyCount = keys.length;
                        // 判断是否为数组：如果所有键都是连续的数字字符串（0, 1, 2, ...），则可能是数组
                        const isArrayLike = keys.length > 0 && keys.every((k, idx) => k === String(idx));
                        const typeLabel = isArrayLike ? 'array' : 'object';
                        label = `> ${label} [${typeLabel}, ${keyCount} items]`;
                    } else {
                        // 如果是普通值，显示值的预览
                        let valuePreview = BIOSManager._formatRegistryValue(item.value);
                        if (valuePreview.length > 40) {
                            valuePreview = valuePreview.substring(0, 37) + '...';
                        }
                        label = `${label}: ${valuePreview}`;
                    }
                }
                
                menuItem.textContent = label;
                menu.appendChild(menuItem);
            });
            
            BIOSManager._container.appendChild(header);
            if (pathDisplay) {
                BIOSManager._container.appendChild(pathDisplay);
            }
            BIOSManager._container.appendChild(menu);
            
            // 添加帮助信息
            const help = document.createElement('div');
            help.className = 'bios-help';
            help.innerHTML = '↑↓: Navigate  Enter: Select  Esc: Back  F10: Save & Exit';
            BIOSManager._container.appendChild(help);
        }
        
        /**
         * 获取所有注册表项
         * @returns {Promise<Object>} 所有注册表项的键值对
         */
        static async _getAllRegistryKeys() {
            if (typeof LStorage !== 'undefined' && typeof LStorage.getAllSystemStorage === 'function') {
                try {
                    const allStorage = LStorage.getAllSystemStorage();
                    return allStorage || {};
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("BIOSManager", `获取所有注册表项失败: ${e.message}`);
                    }
                    throw e;
                }
            }
            return {};
        }
        
        /**
         * 格式化注册表值用于显示
         * @param {*} value 注册表值
         * @returns {string} 格式化后的字符串
         */
        static _formatRegistryValue(value) {
            if (value === null || value === undefined) {
                return '(null)';
            }
            if (typeof value === 'object') {
                return JSON.stringify(value);
            }
            return String(value);
        }
        
        /**
         * 将数组或对象转换为可遍历的对象格式
         * @param {*} data 数组或对象
         * @returns {Object} 对象格式（如果是数组，转换为 {0: item0, 1: item1, ...}）
         */
        static _normalizeRegistryData(data) {
            if (Array.isArray(data)) {
                // 将数组转换为对象，使用索引作为键
                const obj = {};
                for (let i = 0; i < data.length; i++) {
                    obj[String(i)] = data[i];
                }
                return obj;
            } else if (data !== null && typeof data === 'object') {
                return data;
            }
            return {};
        }
        
        /**
         * 根据路径获取注册表数据
         * @param {Array<string>} path 路径数组，如 ['key1', 'key2'] 或 ['key1', '0']（数组索引）
         * @returns {Promise<Object>} 该路径下的注册表数据（标准化为对象格式）
         */
        static async _getRegistryDataByPath(path) {
            try {
                const allStorage = await BIOSManager._getAllRegistryKeys();
                if (!path || path.length === 0) {
                    return BIOSManager._normalizeRegistryData(allStorage);
                }
                
                let current = allStorage;
                for (const key of path) {
                    if (current === null || typeof current !== 'object') {
                        return {};
                    }
                    
                    if (Array.isArray(current)) {
                        // 如果是数组，使用数字索引访问
                        const index = parseInt(key, 10);
                        if (!isNaN(index) && index >= 0 && index < current.length) {
                            current = current[index];
                        } else {
                            return {};
                        }
                    } else if (key in current) {
                        // 如果是对象，使用键访问
                        current = current[key];
                    } else {
                        return {};
                    }
                }
                
                // 将最终结果标准化为对象格式（支持数组）
                return BIOSManager._normalizeRegistryData(current);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("BIOSManager", `根据路径获取注册表数据失败: ${e.message}`);
                }
                return {};
            }
        }
        
        /**
         * 获取注册表路径字符串（用于显示）
         * @param {Array<string>} path 路径数组
         * @returns {string} 路径字符串，如 "registry > key1 > key2"
         */
        static _getRegistryPathString(path) {
            if (!path || path.length === 0) {
                return 'registry';
            }
            return 'registry > ' + path.join(' > ');
        }
        
        /**
         * 判断值是否为可展开的结构（对象或数组）
         * @param {*} value 值
         * @returns {boolean} 是否为可展开的结构
         */
        static _isRegistryObject(value) {
            return value !== null && typeof value === 'object';
        }
        
        /**
         * 获取系统信息
         * @returns {Promise<Object>} 系统信息对象
         */
        static async _getSystemInfo() {
            const info = {};
            
            if (typeof SystemInformation !== 'undefined') {
                try {
                    // 系统名称
                    info['info-system-name'] = SystemInformation.getSystemName ? SystemInformation.getSystemName() : (SystemInformation.SYSTEM_NAME || 'ZerOS');
                    
                    // 系统版本
                    info['info-system-version'] = SystemInformation.getSystemVersion ? SystemInformation.getSystemVersion() : (SystemInformation.SYSTEM_VERSION || 'Unknown');
                    
                    // 内核版本
                    info['info-kernel-version'] = SystemInformation.getKernelVersion ? SystemInformation.getKernelVersion() : (SystemInformation.KERNEL_VERSION || 'Unknown');
                    
                    // 构建日期
                    if (SystemInformation.getBuildDate) {
                        info['info-build-date'] = SystemInformation.getBuildDate('en-US');
                    } else if (SystemInformation.BUILD_DATE) {
                        const buildDate = SystemInformation.BUILD_DATE instanceof Date ? SystemInformation.BUILD_DATE : new Date(SystemInformation.BUILD_DATE);
                        info['info-build-date'] = buildDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    } else {
                        info['info-build-date'] = 'Unknown';
                    }
                    
                    // 系统描述
                    info['info-system-description'] = SystemInformation.getSystemDescription ? SystemInformation.getSystemDescription() : (SystemInformation.SYSTEM_DESCRIPTION || 'Unknown');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("BIOSManager", `获取系统信息失败: ${e.message}`);
                    }
                    // 使用默认值
                    info['info-system-name'] = 'ZerOS';
                    info['info-system-version'] = 'Unknown';
                    info['info-kernel-version'] = 'Unknown';
                    info['info-build-date'] = 'Unknown';
                    info['info-system-description'] = 'Unknown';
                }
            } else {
                // SystemInformation未加载，使用默认值
                info['info-system-name'] = 'ZerOS';
                info['info-system-version'] = 'Unknown';
                info['info-kernel-version'] = 'Unknown';
                info['info-build-date'] = 'Unknown';
                info['info-system-description'] = 'Unknown';
            }
            
            return info;
        }
        
        /**
         * 获取当前日志级别
         * @returns {Promise<number>} 日志级别
         */
        static async _getLogLevel() {
            // 从注册表获取日志级别（如果LStorage可用）
            if (typeof LStorage !== 'undefined' && typeof LStorage.getSystemStorage === 'function') {
                try {
                    const level = await LStorage.getSystemStorage('bios.logLevel');
                    if (level !== undefined && level !== null) {
                        const levelNum = parseInt(level, 10);
                        if (!isNaN(levelNum) && levelNum >= -1 && levelNum <= 3) {
                            return levelNum;
                        }
                    }
                } catch (e) {
                    // 忽略错误，继续使用默认值
                }
            }
            
            // 默认从KernelLogger获取
            if (typeof KernelLogger !== 'undefined' && KernelLogger.level !== undefined) {
                return KernelLogger.level;
            }
            
            return 1; // 默认WARN级别
        }
        
        /**
         * 设置日志级别
         */
        static async _setLogLevel(level) {
            // 保存到注册表
            if (typeof LStorage !== 'undefined' && typeof LStorage.setSystemStorage === 'function') {
                try {
                    await LStorage.setSystemStorage('bios.logLevel', level);
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("BIOSManager", `保存日志级别到注册表失败: ${e.message}`);
                    }
                }
            }
            
            // 设置KernelLogger级别
            if (typeof KernelLogger !== 'undefined' && typeof KernelLogger.setLevel === 'function') {
                KernelLogger.setLevel(level);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("BIOSManager", `日志级别已设置为: ${level}`);
                }
            }
        }
        
        /**
         * 处理菜单项选择
         */
        static async _handleItemSelect(item) {
            if (item.action === 'back') {
                // 从页面栈中弹出上一页，如果栈为空则返回main
                if (BIOSManager._pageStack.length > 0) {
                    const previousPage = BIOSManager._pageStack.pop();
                    await BIOSManager._renderPage(previousPage, true); // 使用skipStack标志，避免重复推入栈
                } else {
                    await BIOSManager._renderPage('main', true); // 栈为空，返回main
                }
                return;
            }
            
            if (item.action === 'exit') {
                BIOSManager._exitBIOS();
                return;
            }
            
            if (item.page) {
                // 如果进入注册表页面，重置路径栈（从根目录开始）
                if (item.page === 'registry') {
                    BIOSManager._registryPathStack = [];
                }
                await BIOSManager._renderPage(item.page);
                return;
            }
            
            if (item.type === 'radio' && item.group === 'log-level') {
                await BIOSManager._setLogLevel(item.value);
                await BIOSManager._renderPage(BIOSManager._currentPage); // 刷新页面，显示更新后的值
                return;
            }
            
            if (item.type === 'registry-item' && item.key) {
                // 注册表项被选中
                if (item.isObject && item.path) {
                    // 如果是对象，进入子项
                    BIOSManager._registryPathStack = item.path;
                    BIOSManager._currentItemIndex = 0;
                    await BIOSManager._renderPage('registry');
                } else {
                    // 如果是普通值，暂时只刷新页面（后续可以添加编辑功能）
                    await BIOSManager._renderPage(BIOSManager._currentPage);
                }
                return;
            }
            
            if (item.action === 'registry-back') {
                // 注册表Back：返回上一级
                if (BIOSManager._registryPathStack.length > 0) {
                    BIOSManager._registryPathStack.pop();
                    BIOSManager._currentItemIndex = 0;
                    await BIOSManager._renderPage('registry');
                } else {
                    // 如果已经在根目录，退出注册表编辑器
                    BIOSManager._registryPathStack = [];
                    await BIOSManager._renderPage('advanced', true);
                }
                return;
            }
            
            if (item.action === 'registry-exit') {
                // 退出注册表编辑器，返回Advanced Settings
                BIOSManager._registryPathStack = [];
                await BIOSManager._renderPage('advanced', true);
                return;
            }
            
            // 测试操作
            if (item.action === 'test-kernel') {
                await BIOSManager._testKernelSelfCheck();
                return;
            }
            
            if (item.action === 'test-backend-php') {
                await BIOSManager._testBackendService('php');
                return;
            }
            
            if (item.action === 'test-backend-spring') {
                await BIOSManager._testBackendService('spring');
                return;
            }
        }
        
        /**
         * 退出BIOS
         */
        static _exitBIOS() {
            // 清除安全模式标志
            try {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.removeItem('__ZEROS_SAFE_MODE__');
                }
            } catch (e) {
                // 忽略错误
            }
            
            // 刷新页面
            if (typeof window !== 'undefined' && window.location) {
                window.location.reload();
            }
        }
        
        /**
         * 设置键盘监听
         */
        static _setupKeyboardListeners() {
            if (typeof document === 'undefined') {
                return;
            }
            
            document.addEventListener('keydown', BIOSManager._handleKeyDown, { capture: true });
        }
        
        /**
         * 处理按键事件
         */
        static _handleKeyDown(e) {
            if (!BIOSManager._isActive) {
                return;
            }
            
            const page = BIOSManager._pages[BIOSManager._currentPage];
            if (!page) {
                return;
            }
            
            const key = e.key;
            const code = e.code;
            const keyCode = e.keyCode;
            
            // 上下左右导航（支持小键盘）
            if (key === 'ArrowUp' || code === 'ArrowUp' || keyCode === 38 || 
                code === 'Numpad8' || keyCode === 104) {
                e.preventDefault();
                e.stopPropagation();
                BIOSManager._navigateUp();
            } else if (key === 'ArrowDown' || code === 'ArrowDown' || keyCode === 40 ||
                       code === 'Numpad2' || keyCode === 98) {
                e.preventDefault();
                e.stopPropagation();
                BIOSManager._navigateDown();
            } else if (key === 'ArrowLeft' || code === 'ArrowLeft' || keyCode === 37 ||
                       code === 'Numpad4' || keyCode === 100) {
                e.preventDefault();
                e.stopPropagation();
                BIOSManager._navigateLeft();
            } else if (key === 'ArrowRight' || code === 'ArrowRight' || keyCode === 39 ||
                       code === 'Numpad6' || keyCode === 102) {
                e.preventDefault();
                e.stopPropagation();
                BIOSManager._navigateRight();
            } else if (key === 'Enter' || keyCode === 13 || code === 'NumpadEnter') {
                e.preventDefault();
                e.stopPropagation();
                const item = page.items[BIOSManager._currentItemIndex];
                if (item) {
                    BIOSManager._handleItemSelect(item).catch(err => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error("BIOSManager", `处理菜单项选择失败: ${err.message}`, err);
                        }
                    });
                }
            } else if (key === 'Escape' || keyCode === 27) {
                e.preventDefault();
                e.stopPropagation();
                // Esc键也使用Back逻辑（退出一层）
                if (BIOSManager._pageStack.length > 0) {
                    const previousPage = BIOSManager._pageStack.pop();
                    BIOSManager._renderPage(previousPage, true).catch(err => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error("BIOSManager", `渲染页面失败: ${err.message}`, err);
                        }
                    });
                } else if (BIOSManager._currentPage !== 'main') {
                    BIOSManager._renderPage('main', true).catch(err => {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error("BIOSManager", `渲染页面失败: ${err.message}`, err);
                        }
                    });
                }
            } else if (key === 'F10' || keyCode === 121) {
                e.preventDefault();
                e.stopPropagation();
                BIOSManager._exitBIOS();
            }
        }
        
        /**
         * 导航：向上
         */
        static _navigateUp() {
            const page = BIOSManager._pages[BIOSManager._currentPage];
            if (!page || page.items.length === 0) {
                return;
            }
            
            BIOSManager._currentItemIndex = (BIOSManager._currentItemIndex - 1 + page.items.length) % page.items.length;
            BIOSManager._updateSelection();
        }
        
        /**
         * 导航：向下
         */
        static _navigateDown() {
            const page = BIOSManager._pages[BIOSManager._currentPage];
            if (!page || page.items.length === 0) {
                return;
            }
            
            BIOSManager._currentItemIndex = (BIOSManager._currentItemIndex + 1) % page.items.length;
            BIOSManager._updateSelection();
        }
        
        /**
         * 导航：向左（预留）
         */
        static _navigateLeft() {
            // 预留功能
        }
        
        /**
         * 导航：向右（预留）
         */
        static _navigateRight() {
            // 预留功能
        }
        
        /**
         * 更新选择状态
         */
        static _updateSelection() {
            if (!BIOSManager._container) {
                return;
            }
            
            const menuItems = BIOSManager._container.querySelectorAll('.bios-menu-item');
            let selectedItem = null;
            menuItems.forEach((item, index) => {
                if (index === BIOSManager._currentItemIndex) {
                    item.classList.add('selected');
                    selectedItem = item;
                } else {
                    item.classList.remove('selected');
                }
            });
            
            // 自动滚动到选中的项
            if (selectedItem) {
                selectedItem.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'nearest'
                });
            }
        }
        
        /**
         * 测试内核自检
         */
        static async _testKernelSelfCheck() {
            // 显示测试结果页面
            BIOSManager._pages['test-kernel-result'] = {
                title: 'Kernel Self-Check Test',
                items: [
                    { id: 'test-status', label: 'Status: Running...', type: 'info' },
                    { id: 'back', label: 'Back', action: 'back' }
                ]
            };
            
            // 切换到测试结果页面
            BIOSManager._pageStack.push(BIOSManager._currentPage);
            await BIOSManager._renderPage('test-kernel-result');
            
            try {
                // 尝试获取performKernelSelfCheck函数
                // 由于performKernelSelfCheck在starter.js中未导出，我们需要通过其他方式调用
                let selfCheckResult = null;
                
                // 方法1: 尝试从BootLoader获取（如果已导出）
                if (typeof window !== 'undefined' && window.BootLoader && typeof window.BootLoader.performKernelSelfCheck === 'function') {
                    selfCheckResult = await window.BootLoader.performKernelSelfCheck((step, message, percent) => {
                        BIOSManager._updateTestStatus(`[${percent}%] ${step}: ${message}`);
                    });
                } else {
                    // 方法2: 尝试从POOL获取
                    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                        try {
                            const performKernelSelfCheck = POOL.__GET__("KERNEL_GLOBAL_POOL", "performKernelSelfCheck");
                            if (typeof performKernelSelfCheck === 'function') {
                                selfCheckResult = await performKernelSelfCheck((step, message, percent) => {
                                    BIOSManager._updateTestStatus(`[${percent}%] ${step}: ${message}`);
                                });
                            }
                        } catch (e) {
                            // POOL中没有，继续尝试其他方法
                        }
                    }
                }
                
                // 如果仍然无法获取，显示错误信息
                if (!selfCheckResult) {
                    BIOSManager._updateTestStatus('Error: performKernelSelfCheck function not available. Kernel may not be fully loaded.');
                    return;
                }
                
                // 显示测试结果
                const successRate = selfCheckResult.totalChecks > 0 
                    ? ((selfCheckResult.passed / selfCheckResult.totalChecks) * 100).toFixed(1)
                    : 0;
                
                const resultText = `Test Complete!\n` +
                    `Total Checks: ${selfCheckResult.totalChecks}\n` +
                    `Passed: ${selfCheckResult.passed}\n` +
                    `Failed: ${selfCheckResult.failed}\n` +
                    `Warnings: ${selfCheckResult.warnings}\n` +
                    `Critical Errors: ${selfCheckResult.criticalErrors}\n` +
                    `Success Rate: ${successRate}%`;
                
                BIOSManager._updateTestStatus(resultText);
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("BIOSManager", `内核自检完成: ${selfCheckResult.passed}/${selfCheckResult.totalChecks} 通过`);
                }
            } catch (error) {
                BIOSManager._updateTestStatus(`Error: ${error.message}`);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("BIOSManager", `内核自检失败: ${error.message}`, error);
                }
            }
        }
        
        /**
         * 测试后端服务
         */
        static async _testBackendService(backendType) {
            // 显示测试结果页面
            const pageId = `test-backend-${backendType}-result`;
            BIOSManager._pages[pageId] = {
                title: `Backend Service Test (${backendType.toUpperCase()})`,
                items: [
                    { id: 'test-status', label: 'Status: Testing...', type: 'info' },
                    { id: 'back', label: 'Back', action: 'back' }
                ]
            };
            
            // 切换到测试结果页面
            BIOSManager._pageStack.push(BIOSManager._currentPage);
            await BIOSManager._renderPage(pageId);
            
            try {
                // 获取基础URL
                const origin = typeof window !== 'undefined' && window.location 
                    ? window.location.origin 
                    : 'http://localhost:8089';
                
                // 构建测试URL
                let testUrl;
                if (backendType === 'php') {
                    testUrl = `${origin}/system/service/test.php`;
                } else if (backendType === 'spring') {
                    testUrl = `${origin}/system/service/test`;
                } else {
                    throw new Error(`Unknown backend type: ${backendType}`);
                }
                
                BIOSManager._updateTestStatus(`Testing ${backendType.toUpperCase()} backend...\nURL: ${testUrl}`);
                
                // 发送测试请求
                let response;
                try {
                    // 尝试使用NetworkManager（如果可用）
                    if (typeof NetworkManager !== 'undefined' && typeof NetworkManager.fetch === 'function') {
                        response = await NetworkManager.fetch(testUrl, {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        });
                    } else {
                        // 降级到原生fetch
                        response = await fetch(testUrl, {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        });
                    }
                } catch (fetchError) {
                    throw new Error(`Network request failed: ${fetchError.message}`);
                }
                
                // 检查响应状态
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // 解析响应
                const data = await response.json();
                
                // 格式化结果显示
                const resultText = `Test Complete!\n` +
                    `Status: ${data.status || 'success'}\n` +
                    `Message: ${data.message || 'N/A'}\n` +
                    `Timestamp: ${data.timestamp || 'N/A'}\n` +
                    `Server: ${data.server?.php_version || data.server?.server_software || 'N/A'}`;
                
                BIOSManager._updateTestStatus(resultText);
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("BIOSManager", `${backendType.toUpperCase()}后端测试成功: ${data.message || 'OK'}`);
                }
            } catch (error) {
                BIOSManager._updateTestStatus(`Error: ${error.message}`);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("BIOSManager", `${backendType.toUpperCase()}后端测试失败: ${error.message}`, error);
                }
            }
        }
        
        /**
         * 更新测试状态显示
         */
        static _updateTestStatus(statusText) {
            if (!BIOSManager._container) {
                return;
            }
            
            const statusItem = BIOSManager._container.querySelector('[data-item-id="test-status"]');
            if (statusItem) {
                // 将多行文本转换为显示格式
                const lines = statusText.split('\n');
                statusItem.textContent = lines[0]; // 第一行作为主标签
                if (lines.length > 1) {
                    // 如果有更多行，创建一个详细信息的显示
                    const oldDetail = statusItem.parentElement.querySelector('.test-detail');
                    if (oldDetail) {
                        oldDetail.remove();
                    }
                    
                    const detailDiv = document.createElement('div');
                    detailDiv.className = 'test-detail';
                    detailDiv.style.cssText = `
                        margin-top: 10px;
                        padding: 10px;
                        background: rgba(0, 255, 0, 0.05);
                        border: 1px solid rgba(0, 255, 0, 0.2);
                        font-size: 14px;
                        line-height: 1.6;
                        white-space: pre-wrap;
                        color: rgba(0, 255, 0, 0.8);
                    `;
                    detailDiv.textContent = lines.slice(1).join('\n');
                    statusItem.parentElement.insertBefore(detailDiv, statusItem.nextSibling);
                }
            }
        }
    }
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.BIOSManager = BIOSManager;
    }
    
    // 注册到 POOL
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__ || !POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "BIOSManager", BIOSManager);
        } catch (e) {
            // POOL 可能还未完全初始化，忽略错误
        }
    }
    
    // 发布模块加载信号
    if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
        try {
            DependencyConfig.publishSignal("../bootloader/BIOS/biosManager.js");
        } catch (e) {
            // 忽略错误
        }
    }
    
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);

