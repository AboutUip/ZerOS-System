// 权限管理器
// 负责管理所有程序的内核操作权限
// 支持权限声明、权限检查、动态权限申请

KernelLogger.info("PermissionManager", "模块初始化");

class PermissionManager {
    // ==================== 权限枚举 ====================
    
    /**
     * 权限类型枚举
     * 所有程序必须在其 __info__ 中声明所需权限
     */
    static PERMISSION = {
        // 通知权限
        SYSTEM_NOTIFICATION: 'SYSTEM_NOTIFICATION',
        
        // 文件系统权限
        KERNEL_DISK_READ: 'KERNEL_DISK_READ',           // 读取文件
        KERNEL_DISK_WRITE: 'KERNEL_DISK_WRITE',         // 写入文件
        KERNEL_DISK_DELETE: 'KERNEL_DISK_DELETE',       // 删除文件
        KERNEL_DISK_CREATE: 'KERNEL_DISK_CREATE',       // 创建文件/目录
        KERNEL_DISK_LIST: 'KERNEL_DISK_LIST',           // 列出目录
        
        // 内存操作权限
        KERNEL_MEMORY_READ: 'KERNEL_MEMORY_READ',       // 读取内存
        KERNEL_MEMORY_WRITE: 'KERNEL_MEMORY_WRITE',     // 写入内存
        
        // 网络权限
        NETWORK_ACCESS: 'NETWORK_ACCESS',               // 网络访问
        
        // GUI权限
        GUI_WINDOW_CREATE: 'GUI_WINDOW_CREATE',         // 创建窗口
        GUI_WINDOW_MANAGE: 'GUI_WINDOW_MANAGE',         // 管理窗口
        
        // 系统存储权限
        SYSTEM_STORAGE_READ: 'SYSTEM_STORAGE_READ',     // 读取系统存储
        SYSTEM_STORAGE_WRITE: 'SYSTEM_STORAGE_WRITE',   // 写入系统存储
        
        // 程序管理权限
        PROCESS_MANAGE: 'PROCESS_MANAGE',               // 管理其他进程
        
        // 主题权限
        THEME_READ: 'THEME_READ',                       // 读取主题
        THEME_WRITE: 'THEME_WRITE',                     // 修改主题
        
        // 桌面权限
        DESKTOP_MANAGE: 'DESKTOP_MANAGE',               // 管理桌面图标
        
        // 多线程权限
        MULTITHREADING_CREATE: 'MULTITHREADING_CREATE', // 创建线程
        MULTITHREADING_EXECUTE: 'MULTITHREADING_EXECUTE', // 执行多线程任务
        
        // 拖拽权限
        DRAG_ELEMENT: 'DRAG_ELEMENT',                   // 元素拖拽
        DRAG_FILE: 'DRAG_FILE',                         // 文件拖拽
        DRAG_WINDOW: 'DRAG_WINDOW',                     // 窗口拖拽
        
        // 地理位置权限
        GEOGRAPHY_LOCATION: 'GEOGRAPHY_LOCATION',       // 获取地理位置信息
        
        // 加密权限
        CRYPT_GENERATE_KEY: 'CRYPT_GENERATE_KEY',           // 生成密钥对
        CRYPT_IMPORT_KEY: 'CRYPT_IMPORT_KEY',               // 导入密钥对
        CRYPT_DELETE_KEY: 'CRYPT_DELETE_KEY',               // 删除密钥
        CRYPT_ENCRYPT: 'CRYPT_ENCRYPT',                     // 加密数据
        CRYPT_DECRYPT: 'CRYPT_DECRYPT',                     // 解密数据
        CRYPT_MD5: 'CRYPT_MD5',                             // MD5 哈希
        CRYPT_RANDOM: 'CRYPT_RANDOM',                       // 随机数生成
        
        // 事件权限
        EVENT_LISTENER: 'EVENT_LISTENER',                   // 注册事件监听器
        
        // 缓存权限
        CACHE_READ: 'CACHE_READ',                           // 读取缓存
        CACHE_WRITE: 'CACHE_WRITE'                          // 写入/删除缓存
    };
    
    /**
     * 权限级别
     */
    static PERMISSION_LEVEL = {
        NORMAL: 'NORMAL',       // 普通权限：自动授予，仅记录
        SPECIAL: 'SPECIAL',     // 特殊权限：需要用户确认
        DANGEROUS: 'DANGEROUS'  // 危险权限：需要用户明确授权
    };
    
    /**
     * 权限级别映射
     * 定义每个权限的级别
     */
    static PERMISSION_LEVEL_MAP = {
        // 普通权限（自动授予）
        [PermissionManager.PERMISSION.KERNEL_DISK_READ]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        [PermissionManager.PERMISSION.KERNEL_DISK_LIST]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        [PermissionManager.PERMISSION.GUI_WINDOW_CREATE]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        [PermissionManager.PERMISSION.THEME_READ]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        
        // 特殊权限（需要用户确认）
        [PermissionManager.PERMISSION.SYSTEM_NOTIFICATION]: PermissionManager.PERMISSION_LEVEL.SPECIAL, // 通知权限需要用户确认
        [PermissionManager.PERMISSION.KERNEL_DISK_WRITE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.KERNEL_DISK_CREATE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.KERNEL_DISK_DELETE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.KERNEL_MEMORY_READ]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.KERNEL_MEMORY_WRITE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.NETWORK_ACCESS]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.GUI_WINDOW_MANAGE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.SYSTEM_STORAGE_READ]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.THEME_WRITE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.DESKTOP_MANAGE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.MULTITHREADING_CREATE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.MULTITHREADING_EXECUTE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        
        // 拖拽权限（普通权限，自动授予）
        [PermissionManager.PERMISSION.DRAG_ELEMENT]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        [PermissionManager.PERMISSION.DRAG_FILE]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        [PermissionManager.PERMISSION.DRAG_WINDOW]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        
        // 地理位置权限（特殊权限，需要用户确认）
        [PermissionManager.PERMISSION.GEOGRAPHY_LOCATION]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        
        // 加密权限（特殊权限，需要用户确认）
        [PermissionManager.PERMISSION.CRYPT_GENERATE_KEY]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.CRYPT_IMPORT_KEY]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.CRYPT_DELETE_KEY]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.CRYPT_ENCRYPT]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.CRYPT_DECRYPT]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        [PermissionManager.PERMISSION.CRYPT_MD5]: PermissionManager.PERMISSION_LEVEL.NORMAL,  // MD5 哈希是普通权限
        [PermissionManager.PERMISSION.CRYPT_RANDOM]: PermissionManager.PERMISSION_LEVEL.NORMAL,  // 随机数生成是普通权限
        
        // 事件权限（普通权限，自动授予）
        [PermissionManager.PERMISSION.EVENT_LISTENER]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        
        // 缓存权限（普通权限，自动授予）
        [PermissionManager.PERMISSION.CACHE_READ]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        [PermissionManager.PERMISSION.CACHE_WRITE]: PermissionManager.PERMISSION_LEVEL.NORMAL,
        
        // 危险权限（需要明确授权）
        [PermissionManager.PERMISSION.PROCESS_MANAGE]: PermissionManager.PERMISSION_LEVEL.DANGEROUS,
    };
    
    // ==================== 内部状态 ====================
    
    /**
     * 权限存储
     * Map<pid, Set<permission>>
     */
    static _permissions = new Map();
    
    /**
     * 权限申请队列
     * Map<requestId, {pid, permission, resolve, reject, timestamp}>
     */
    static _pendingRequests = new Map();
    
    /**
     * 请求ID计数器
     */
    static _requestIdCounter = 0;
    
    /**
     * 是否已初始化
     */
    static _initialized = false;
    
    /**
     * 初始化Promise（用于确保只初始化一次）
     */
    static _initPromise = null;
    
    /**
     * 权限检查缓存（避免重复检查）
     * Map<`${pid}_${permission}`, {result: boolean, timestamp: number}>
     */
    static _permissionCache = new Map();
    
    /**
     * 权限缓存有效期（毫秒）
     */
    static CACHE_TTL = 5000; // 5秒
    
    /**
     * 并发权限请求去重
     * Map<`${pid}_${permission}`, Promise<boolean>>
     */
    static _pendingPermissionChecks = new Map();
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化权限管理器（异步，确保依赖就绪）
     */
    static async init() {
        if (PermissionManager._initialized) {
            KernelLogger.warn("PermissionManager", "权限管理器已初始化，跳过重复初始化");
            return;
        }
        
        // 如果正在初始化，等待初始化完成
        if (PermissionManager._initPromise) {
            return await PermissionManager._initPromise;
        }
        
        // 创建初始化Promise
        PermissionManager._initPromise = (async () => {
            try {
                // 等待LStorage就绪（如果存在）
                if (typeof LStorage !== 'undefined') {
                    // 等待LStorage初始化完成
                    let retries = 0;
                    while (retries < 10 && typeof LStorage.getSystemStorage !== 'function') {
                        await new Promise(resolve => setTimeout(resolve, 50));
                        retries++;
                    }
                }
                
                PermissionManager._initialized = true;
                
                // 从存储加载权限记录（如果有）
                PermissionManager._loadPermissions();
                
                KernelLogger.info("PermissionManager", "权限管理器初始化完成");
            } catch (e) {
                KernelLogger.error("PermissionManager", `初始化失败: ${e.message}`, e);
                // 即使初始化失败，也标记为已初始化，避免阻塞系统
                PermissionManager._initialized = true;
            } finally {
                PermissionManager._initPromise = null;
            }
        })();
        
        return await PermissionManager._initPromise;
    }
    
    /**
     * 确保权限管理器已初始化
     */
    static async _ensureInitialized() {
        if (!PermissionManager._initialized) {
            await PermissionManager.init();
        }
    }
    
    /**
     * 从存储加载权限记录
     */
    static _loadPermissions() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("PermissionManager", "LStorage 未加载，跳过权限记录加载");
            return;
        }
        
        try {
            const saved = LStorage.getSystemStorage('permissionManager.permissions');
            if (saved && typeof saved === 'object') {
                // 恢复权限记录
                let loadedCount = 0;
                for (const [pidStr, permissions] of Object.entries(saved)) {
                    const pid = parseInt(pidStr);
                    if (!isNaN(pid) && Array.isArray(permissions)) {
                        PermissionManager._permissions.set(pid, new Set(permissions));
                        loadedCount++;
                    }
                }
                KernelLogger.debug("PermissionManager", `已加载 ${loadedCount} 个程序的权限记录`);
            } else {
                KernelLogger.debug("PermissionManager", "没有保存的权限记录");
            }
        } catch (e) {
            KernelLogger.error("PermissionManager", `加载权限记录失败: ${e.message}`, e);
            // 加载失败不影响系统运行，继续使用空权限记录
        }
    }
    
    /**
     * 保存权限记录到存储（异步，避免阻塞）
     */
    static _savePermissions() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("PermissionManager", "LStorage 未加载，跳过权限记录保存");
            return;
        }
        
        // 使用异步保存，避免阻塞主线程
        Promise.resolve().then(() => {
            try {
                const serialized = {};
                for (const [pid, permissions] of PermissionManager._permissions) {
                    if (permissions && permissions.size > 0) {
                        serialized[pid] = Array.from(permissions);
                    }
                }
                LStorage.setSystemStorage('permissionManager.permissions', serialized);
                KernelLogger.debug("PermissionManager", `权限记录已保存 (${Object.keys(serialized).length} 个程序)`);
            } catch (e) {
                KernelLogger.error("PermissionManager", `保存权限记录失败: ${e.message}`, e);
            }
        }).catch(e => {
            KernelLogger.error("PermissionManager", `异步保存权限记录失败: ${e.message}`, e);
        });
    }
    
    // ==================== 权限注册 ====================
    
    /**
     * 注册程序权限（从 __info__ 中读取）
     * @param {number} pid 进程ID
     * @param {Object|Array} programInfoOrPermissions 程序信息（从 __info__ 获取）或权限数组（向后兼容）
     */
    static async registerProgramPermissions(pid, programInfoOrPermissions) {
        // 确保已初始化
        await PermissionManager._ensureInitialized();
        
        let permissions = [];
        
        // 兼容两种调用方式：直接传入权限数组，或传入程序信息对象
        if (Array.isArray(programInfoOrPermissions)) {
            permissions = programInfoOrPermissions;
        } else if (programInfoOrPermissions && programInfoOrPermissions.permissions) {
            permissions = Array.isArray(programInfoOrPermissions.permissions) 
                ? programInfoOrPermissions.permissions 
                : [programInfoOrPermissions.permissions];
        } else {
            KernelLogger.debug("PermissionManager", `程序 ${pid} 未声明权限`);
            return;
        }
        
        const permissionSet = PermissionManager._permissions.get(pid) || new Set();
        let grantedCount = 0;
        
        for (const perm of permissions) {
            // 验证权限是否有效
            if (!Object.values(PermissionManager.PERMISSION).includes(perm)) {
                KernelLogger.warn("PermissionManager", `程序 ${pid} 声明了无效权限: ${perm}`);
                continue;
            }
            
            const level = PermissionManager.PERMISSION_LEVEL_MAP[perm] || PermissionManager.PERMISSION_LEVEL.NORMAL;
            
            if (level === PermissionManager.PERMISSION_LEVEL.NORMAL) {
                // 普通权限：自动授予
                permissionSet.add(perm);
                grantedCount++;
                KernelLogger.debug("PermissionManager", `程序 ${pid} 自动获得普通权限: ${perm}`);
            } else {
                // 特殊权限：仅记录，等待使用时申请
                KernelLogger.debug("PermissionManager", `程序 ${pid} 声明了特殊权限: ${perm}（待申请）`);
            }
        }
        
        if (permissionSet.size > 0) {
            PermissionManager._permissions.set(pid, permissionSet);
            PermissionManager._savePermissions();
            KernelLogger.info("PermissionManager", `程序 ${pid} 已注册 ${grantedCount} 个普通权限`);
        }
    }
    
    // ==================== 权限检查 ====================
    
    /**
     * 检查程序是否有指定权限
     * @param {number} pid 进程ID
     * @param {string} permission 权限名称
     * @returns {boolean} 是否有权限
     */
    static hasPermission(pid, permission) {
        const permissions = PermissionManager._permissions.get(pid);
        if (!permissions) {
            return false;
        }
        return permissions.has(permission);
    }
    
    /**
     * 检查并申请权限（如果未授予）
     * @param {number} pid 进程ID
     * @param {string} permission 权限名称
     * @returns {Promise<boolean>} 是否获得权限
     */
    static async checkAndRequestPermission(pid, permission) {
        // 确保已初始化
        await PermissionManager._ensureInitialized();
        
        // 验证权限是否有效
        if (!Object.values(PermissionManager.PERMISSION).includes(permission)) {
            KernelLogger.error("PermissionManager", `无效的权限: ${permission}`);
            return false;
        }
        
        // 检查缓存（避免重复检查）
        const cacheKey = `${pid}_${permission}`;
        const cached = PermissionManager._permissionCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < PermissionManager.CACHE_TTL) {
            KernelLogger.debug("PermissionManager", `使用缓存权限检查结果: PID ${pid}, 权限 ${permission}, 结果 ${cached.result}`);
            return cached.result;
        }
        
        // 检查并发请求去重（避免同时弹出多个对话框）
        if (PermissionManager._pendingPermissionChecks.has(cacheKey)) {
            KernelLogger.debug("PermissionManager", `等待并发权限检查: PID ${pid}, 权限 ${permission}`);
            return await PermissionManager._pendingPermissionChecks.get(cacheKey);
        }
        
        // 创建权限检查Promise
        const checkPromise = (async () => {
            try {
                // 检查是否已有权限
                if (PermissionManager.hasPermission(pid, permission)) {
                    // 更新缓存
                    PermissionManager._permissionCache.set(cacheKey, {
                        result: true,
                        timestamp: Date.now()
                    });
                    return true;
                }
                
                // 获取权限级别
                const level = PermissionManager.PERMISSION_LEVEL_MAP[permission] || PermissionManager.PERMISSION_LEVEL.NORMAL;
                
                let result;
                if (level === PermissionManager.PERMISSION_LEVEL.NORMAL) {
                    // 普通权限：自动授予
                    PermissionManager._grantPermission(pid, permission);
                    result = true;
                } else {
                    // 特殊权限：需要用户确认
                    result = await PermissionManager._requestPermission(pid, permission, level);
                }
                
                // 更新缓存
                PermissionManager._permissionCache.set(cacheKey, {
                    result: result,
                    timestamp: Date.now()
                });
                
                return result;
            } finally {
                // 移除并发检查记录
                PermissionManager._pendingPermissionChecks.delete(cacheKey);
            }
        })();
        
        // 记录并发检查
        PermissionManager._pendingPermissionChecks.set(cacheKey, checkPromise);
        
        return await checkPromise;
    }
    
    /**
     * 授予权限
     * @param {number} pid 进程ID
     * @param {string} permission 权限名称
     */
    static _grantPermission(pid, permission) {
        if (!PermissionManager._permissions.has(pid)) {
            PermissionManager._permissions.set(pid, new Set());
        }
        PermissionManager._permissions.get(pid).add(permission);
        
        // 清除相关缓存
        const cacheKey = `${pid}_${permission}`;
        PermissionManager._permissionCache.delete(cacheKey);
        
        // 异步保存（避免阻塞）
        PermissionManager._savePermissions();
        KernelLogger.info("PermissionManager", `程序 ${pid} 获得权限: ${permission}`);
    }
    
    /**
     * 请求权限（显示拟态弹窗）
     * @param {number} pid 进程ID
     * @param {string} permission 权限名称
     * @param {string} level 权限级别
     * @returns {Promise<boolean>} 是否获得权限
     */
    static async _requestPermission(pid, permission, level) {
        // 获取程序信息
        const processInfo = typeof ProcessManager !== 'undefined' 
            ? ProcessManager.PROCESS_TABLE.get(pid) 
            : null;
        
        const programName = processInfo?.programName || `PID ${pid}`;
        
        // 创建请求ID
        const requestId = `perm_${++PermissionManager._requestIdCounter}_${Date.now()}`;
        
        // 创建Promise
        return new Promise((resolve, reject) => {
            PermissionManager._pendingRequests.set(requestId, {
                pid,
                permission,
                level,
                programName,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            // 显示拟态弹窗
            PermissionManager._showPermissionDialog(requestId, pid, permission, level, programName)
                .catch(e => {
                    KernelLogger.error("PermissionManager", `显示权限申请弹窗失败: ${e.message}`);
                    PermissionManager._pendingRequests.delete(requestId);
                    reject(e);
                });
        });
    }
    
    // ==================== 拟态弹窗UI ====================
    
    /**
     * 显示权限申请弹窗
     * @param {string} requestId 请求ID
     * @param {number} pid 进程ID
     * @param {string} permission 权限名称
     * @param {string} level 权限级别
     * @param {string} programName 程序名称
     */
    static async _showPermissionDialog(requestId, pid, permission, level, programName) {
        // 创建弹窗容器
        const dialog = document.createElement('div');
        dialog.className = 'permission-dialog';
        dialog.id = `permission-dialog-${requestId}`;
        
        // 获取权限描述
        const permissionInfo = PermissionManager._getPermissionInfo(permission);
        
        // 设置样式
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 480px;
            max-width: 90vw;
            background: rgba(20, 25, 35, 0.95);
            backdrop-filter: blur(30px) saturate(200%);
            -webkit-backdrop-filter: blur(30px) saturate(200%);
            border: 1px solid rgba(139, 92, 246, 0.3);
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5),
                        0 0 0 1px rgba(139, 92, 246, 0.1) inset;
            z-index: 20000;
            padding: 32px;
            display: flex;
            flex-direction: column;
            gap: 24px;
            animation: permissionDialogSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        
        // 创建标题
        const title = document.createElement('div');
        title.className = 'permission-dialog-title';
        title.textContent = '权限申请';
        title.style.cssText = `
            font-size: 24px;
            font-weight: 600;
            color: var(--theme-text, #d7e0dd);
            margin: 0;
        `;
        
        // 创建程序信息
        const programInfo = document.createElement('div');
        programInfo.className = 'permission-dialog-program';
        programInfo.innerHTML = `
            <div style="font-size: 14px; color: rgba(215, 224, 221, 0.6); margin-bottom: 8px;">程序</div>
            <div style="font-size: 18px; color: var(--theme-text, #d7e0dd); font-weight: 500;">${programName}</div>
        `;
        
        // 创建权限信息
        const permInfo = document.createElement('div');
        permInfo.className = 'permission-dialog-permission';
        permInfo.innerHTML = `
            <div style="font-size: 14px; color: rgba(215, 224, 221, 0.6); margin-bottom: 8px;">请求权限</div>
            <div style="font-size: 16px; color: var(--theme-text, #d7e0dd); font-weight: 500;">${permissionInfo.name}</div>
            <div style="font-size: 13px; color: rgba(215, 224, 221, 0.5); margin-top: 8px; line-height: 1.5;">${permissionInfo.description}</div>
        `;
        
        // 创建级别标签
        const levelTag = document.createElement('div');
        levelTag.className = 'permission-dialog-level';
        const levelColor = level === PermissionManager.PERMISSION_LEVEL.DANGEROUS 
            ? '#ff5f57' 
            : level === PermissionManager.PERMISSION_LEVEL.SPECIAL 
            ? '#ffbd44' 
            : '#4CAF50';
        const levelText = level === PermissionManager.PERMISSION_LEVEL.DANGEROUS 
            ? '危险权限' 
            : level === PermissionManager.PERMISSION_LEVEL.SPECIAL 
            ? '特殊权限' 
            : '普通权限';
        levelTag.innerHTML = `
            <span style="
                display: inline-block;
                padding: 4px 12px;
                background: ${levelColor}20;
                color: ${levelColor};
                border: 1px solid ${levelColor}40;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 500;
            ">${levelText}</span>
        `;
        
        // 创建按钮容器
        const buttons = document.createElement('div');
        buttons.className = 'permission-dialog-buttons';
        buttons.style.cssText = `
            display: flex;
            gap: 12px;
            margin-top: 8px;
        `;
        
        // 拒绝按钮
        const denyBtn = document.createElement('button');
        denyBtn.textContent = '拒绝';
        denyBtn.className = 'permission-dialog-btn permission-dialog-btn-deny';
        denyBtn.style.cssText = `
            flex: 1;
            padding: 12px 24px;
            background: rgba(255, 95, 87, 0.1);
            color: #ff5f57;
            border: 1px solid rgba(255, 95, 87, 0.3);
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        `;
        denyBtn.addEventListener('mouseenter', () => {
            denyBtn.style.background = 'rgba(255, 95, 87, 0.2)';
        });
        denyBtn.addEventListener('mouseleave', () => {
            denyBtn.style.background = 'rgba(255, 95, 87, 0.1)';
        });
        denyBtn.addEventListener('click', () => {
            PermissionManager._handlePermissionResponse(requestId, false);
        });
        
        // 允许按钮
        const allowBtn = document.createElement('button');
        allowBtn.textContent = '允许';
        allowBtn.className = 'permission-dialog-btn permission-dialog-btn-allow';
        allowBtn.style.cssText = `
            flex: 1;
            padding: 12px 24px;
            background: rgba(76, 175, 80, 0.2);
            color: #4CAF50;
            border: 1px solid rgba(76, 175, 80, 0.3);
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        `;
        allowBtn.addEventListener('mouseenter', () => {
            allowBtn.style.background = 'rgba(76, 175, 80, 0.3)';
        });
        allowBtn.addEventListener('mouseleave', () => {
            allowBtn.style.background = 'rgba(76, 175, 80, 0.2)';
        });
        allowBtn.addEventListener('click', () => {
            PermissionManager._handlePermissionResponse(requestId, true);
        });
        
        buttons.appendChild(denyBtn);
        buttons.appendChild(allowBtn);
        
        // 组装弹窗
        dialog.appendChild(title);
        dialog.appendChild(programInfo);
        dialog.appendChild(permInfo);
        dialog.appendChild(levelTag);
        dialog.appendChild(buttons);
        
        // 创建蒙版
        const overlay = document.createElement('div');
        overlay.className = 'permission-dialog-overlay';
        overlay.id = `permission-dialog-overlay-${requestId}`;
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 19999;
            animation: permissionDialogFadeIn 0.2s ease-out;
        `;
        overlay.addEventListener('click', () => {
            PermissionManager._handlePermissionResponse(requestId, false);
        });
        
        // 添加到DOM
        document.body.appendChild(overlay);
        document.body.appendChild(dialog);
        
        // 添加动画样式（如果不存在）
        if (!document.getElementById('permission-dialog-styles')) {
            const style = document.createElement('style');
            style.id = 'permission-dialog-styles';
            style.textContent = `
                @keyframes permissionDialogSlideIn {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1);
                    }
                }
                @keyframes permissionDialogFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    /**
     * 处理权限申请响应
     * @param {string} requestId 请求ID
     * @param {boolean} granted 是否授予
     */
    static _handlePermissionResponse(requestId, granted) {
        const request = PermissionManager._pendingRequests.get(requestId);
        if (!request) {
            KernelLogger.warn("PermissionManager", `权限请求 ${requestId} 不存在`);
            return;
        }
        
        // 移除弹窗
        const dialog = document.getElementById(`permission-dialog-${requestId}`);
        const overlay = document.getElementById(`permission-dialog-overlay-${requestId}`);
        if (dialog) {
            dialog.style.animation = 'permissionDialogSlideIn 0.2s ease-out reverse';
            setTimeout(() => dialog.remove(), 200);
        }
        if (overlay) {
            overlay.style.animation = 'permissionDialogFadeIn 0.2s ease-out reverse';
            setTimeout(() => overlay.remove(), 200);
        }
        
        // 处理响应
        if (granted) {
            PermissionManager._grantPermission(request.pid, request.permission);
            KernelLogger.info("PermissionManager", `用户授予程序 ${request.pid} 权限: ${request.permission}`);
            request.resolve(true);
        } else {
            KernelLogger.info("PermissionManager", `用户拒绝程序 ${request.pid} 权限: ${request.permission}`);
            request.resolve(false);
        }
        
        PermissionManager._pendingRequests.delete(requestId);
    }
    
    /**
     * 获取权限信息
     * @param {string} permission 权限名称
     * @returns {Object} 权限信息 {name, description}
     */
    static _getPermissionInfo(permission) {
        const infoMap = {
            [PermissionManager.PERMISSION.SYSTEM_NOTIFICATION]: {
                name: '系统通知',
                description: '允许程序显示系统通知'
            },
            [PermissionManager.PERMISSION.KERNEL_DISK_READ]: {
                name: '读取文件',
                description: '允许程序读取文件系统中的文件'
            },
            [PermissionManager.PERMISSION.KERNEL_DISK_WRITE]: {
                name: '写入文件',
                description: '允许程序修改或创建文件'
            },
            [PermissionManager.PERMISSION.KERNEL_DISK_DELETE]: {
                name: '删除文件',
                description: '允许程序删除文件或目录'
            },
            [PermissionManager.PERMISSION.KERNEL_DISK_CREATE]: {
                name: '创建文件',
                description: '允许程序创建新文件或目录'
            },
            [PermissionManager.PERMISSION.KERNEL_DISK_LIST]: {
                name: '列出目录',
                description: '允许程序查看目录内容'
            },
            [PermissionManager.PERMISSION.KERNEL_MEMORY_READ]: {
                name: '读取内存',
                description: '允许程序读取系统内存数据'
            },
            [PermissionManager.PERMISSION.KERNEL_MEMORY_WRITE]: {
                name: '写入内存',
                description: '允许程序修改系统内存数据'
            },
            [PermissionManager.PERMISSION.NETWORK_ACCESS]: {
                name: '网络访问',
                description: '允许程序访问网络资源'
            },
            [PermissionManager.PERMISSION.GUI_WINDOW_CREATE]: {
                name: '创建窗口',
                description: '允许程序创建GUI窗口'
            },
            [PermissionManager.PERMISSION.GUI_WINDOW_MANAGE]: {
                name: '管理窗口',
                description: '允许程序管理其他窗口'
            },
            [PermissionManager.PERMISSION.SYSTEM_STORAGE_READ]: {
                name: '读取系统存储',
                description: '允许程序读取系统存储数据'
            },
            [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE]: {
                name: '写入系统存储',
                description: '允许程序修改系统存储数据'
            },
            [PermissionManager.PERMISSION.PROCESS_MANAGE]: {
                name: '管理进程',
                description: '允许程序管理其他进程（危险操作）'
            },
            [PermissionManager.PERMISSION.THEME_READ]: {
                name: '读取主题',
                description: '允许程序读取系统主题设置'
            },
            [PermissionManager.PERMISSION.THEME_WRITE]: {
                name: '修改主题',
                description: '允许程序修改系统主题设置'
            },
            [PermissionManager.PERMISSION.DESKTOP_MANAGE]: {
                name: '管理桌面',
                description: '允许程序管理桌面图标'
            },
            [PermissionManager.PERMISSION.MULTITHREADING_CREATE]: {
                name: '创建线程',
                description: '允许程序创建多线程工作线程'
            },
            [PermissionManager.PERMISSION.MULTITHREADING_EXECUTE]: {
                name: '执行多线程任务',
                description: '允许程序在多线程环境中执行任务'
            },
            [PermissionManager.PERMISSION.EVENT_LISTENER]: {
                name: '事件监听',
                description: '允许程序注册事件监听器，监听用户交互和系统事件'
            }
        };
        
        return infoMap[permission] || {
            name: permission,
            description: '未知权限'
        };
    }
    
    // ==================== 公共API ====================
    
    /**
     * 获取程序的所有权限
     * @param {number} pid 进程ID
     * @returns {Array<string>} 权限列表
     */
    static getProgramPermissions(pid) {
        const permissions = PermissionManager._permissions.get(pid);
        return permissions ? Array.from(permissions) : [];
    }
    
    /**
     * 撤销程序权限
     * @param {number} pid 进程ID
     * @param {string} permission 权限名称
     */
    static revokePermission(pid, permission) {
        const permissions = PermissionManager._permissions.get(pid);
        if (permissions && permissions.has(permission)) {
            permissions.delete(permission);
            
            // 清除相关缓存
            const cacheKey = `${pid}_${permission}`;
            PermissionManager._permissionCache.delete(cacheKey);
            
            PermissionManager._savePermissions();
            KernelLogger.info("PermissionManager", `程序 ${pid} 的权限已撤销: ${permission}`);
        }
    }
    
    /**
     * 清除程序的所有权限
     * @param {number} pid 进程ID
     */
    static clearProgramPermissions(pid) {
        PermissionManager._permissions.delete(pid);
        
        // 清除该程序的所有权限缓存
        for (const [cacheKey] of PermissionManager._permissionCache) {
            if (cacheKey.startsWith(`${pid}_`)) {
                PermissionManager._permissionCache.delete(cacheKey);
            }
        }
        
        // 清除该程序的并发检查记录
        for (const [cacheKey] of PermissionManager._pendingPermissionChecks) {
            if (cacheKey.startsWith(`${pid}_`)) {
                PermissionManager._pendingPermissionChecks.delete(cacheKey);
            }
        }
        
        PermissionManager._savePermissions();
        KernelLogger.info("PermissionManager", `程序 ${pid} 的所有权限已清除`);
    }
    
    /**
     * 清除权限缓存（用于强制重新检查）
     */
    static clearPermissionCache(pid = null) {
        if (pid === null) {
            // 清除所有缓存
            PermissionManager._permissionCache.clear();
            KernelLogger.debug("PermissionManager", "已清除所有权限缓存");
        } else {
            // 清除指定程序的缓存
            for (const [cacheKey] of PermissionManager._permissionCache) {
                if (cacheKey.startsWith(`${pid}_`)) {
                    PermissionManager._permissionCache.delete(cacheKey);
                }
            }
            KernelLogger.debug("PermissionManager", `已清除程序 ${pid} 的权限缓存`);
        }
    }
    
    /**
     * 获取权限统计信息（用于调试和监控）
     * @returns {Object} 统计信息
     */
    static getPermissionStats() {
        return {
            totalPrograms: PermissionManager._permissions.size,
            totalPermissions: Array.from(PermissionManager._permissions.values())
                .reduce((sum, perms) => sum + perms.size, 0),
            cacheSize: PermissionManager._permissionCache.size,
            pendingChecks: PermissionManager._pendingPermissionChecks.size,
            pendingRequests: PermissionManager._pendingRequests.size,
            initialized: PermissionManager._initialized
        };
    }
}

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "PermissionManager", PermissionManager);
    } catch (e) {
        KernelLogger.error("PermissionManager", `注册到 POOL 失败: ${e.message}`);
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/process/permissionManager.js");
} else {
    const publishWhenReady = () => {
        if (typeof DependencyConfig !== 'undefined') {
            DependencyConfig.publishSignal("../kernel/process/permissionManager.js");
        } else {
            setTimeout(publishWhenReady, 10);
        }
    };
    publishWhenReady();
}

// 自动初始化（异步，不阻塞模块加载）
if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        PermissionManager.init().catch(e => {
            KernelLogger.error("PermissionManager", `自动初始化失败: ${e.message}`, e);
        });
    });
} else {
    // 异步初始化，不阻塞
    PermissionManager.init().catch(e => {
        KernelLogger.error("PermissionManager", `自动初始化失败: ${e.message}`, e);
    });
}

