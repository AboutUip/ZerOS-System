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
        SYSTEM_STORAGE_READ: 'SYSTEM_STORAGE_READ',     // 读取系统存储（基础权限，仅可读取非敏感键）
        SYSTEM_STORAGE_WRITE: 'SYSTEM_STORAGE_WRITE',   // 写入系统存储（基础权限，仅可写入非敏感键）
        
        // 系统存储细粒度读取权限（危险权限，仅管理员可授予）
        SYSTEM_STORAGE_READ_USER_CONTROL: 'SYSTEM_STORAGE_READ_USER_CONTROL',           // 读取用户控制相关存储（userControl.*）
        SYSTEM_STORAGE_READ_PERMISSION_CONTROL: 'SYSTEM_STORAGE_READ_PERMISSION_CONTROL', // 读取权限控制相关存储（permissionControl.*, permissionManager.*）
        
        // 系统存储细粒度写入权限（危险权限，仅管理员可授予）
        SYSTEM_STORAGE_WRITE_USER_CONTROL: 'SYSTEM_STORAGE_WRITE_USER_CONTROL',           // 写入用户控制相关存储（userControl.*）
        SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL: 'SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL', // 写入权限控制相关存储（permissionControl.*, permissionManager.*）
        SYSTEM_STORAGE_WRITE_DESKTOP: 'SYSTEM_STORAGE_WRITE_DESKTOP',                     // 写入桌面相关存储（desktop.*）
        
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
        CACHE_WRITE: 'CACHE_WRITE',                        // 写入/删除缓存
        
        // 语音识别权限
        SPEECH_RECOGNITION: 'SPEECH_RECOGNITION',          // 语音识别
        
        // 媒体访问权限
        MEDIA_ACCESS: 'MEDIA_ACCESS'                        // 访问摄像头和麦克风
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
        [PermissionManager.PERMISSION.SYSTEM_STORAGE_READ]: PermissionManager.PERMISSION_LEVEL.NORMAL, // 基础权限，自动授予，但仅可读取非敏感键
        [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE]: PermissionManager.PERMISSION_LEVEL.NORMAL, // 基础权限，自动授予，但仅可写入非敏感键
        
        // 系统存储细粒度读取权限（危险权限，仅管理员可授予）
        [PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL]: PermissionManager.PERMISSION_LEVEL.DANGEROUS,
        [PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_PERMISSION_CONTROL]: PermissionManager.PERMISSION_LEVEL.DANGEROUS,
        
        // 系统存储细粒度写入权限（危险权限，仅管理员可授予）
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
        
        // 语音识别权限（特殊权限，需要用户确认）
        [PermissionManager.PERMISSION.SPEECH_RECOGNITION]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        
        // 媒体访问权限（特殊权限，需要用户确认）
        [PermissionManager.PERMISSION.MEDIA_ACCESS]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
        
        // 危险权限（需要明确授权）
        [PermissionManager.PERMISSION.PROCESS_MANAGE]: PermissionManager.PERMISSION_LEVEL.DANGEROUS,
        
        // 系统存储细粒度权限（危险权限，仅管理员可授予）
        [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL]: PermissionManager.PERMISSION_LEVEL.DANGEROUS,
        [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL]: PermissionManager.PERMISSION_LEVEL.DANGEROUS,
        [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_DESKTOP]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
    };
    
    // ==================== 内部状态 ====================
    
    /**
     * 权限存储（运行时，按PID索引）
     * Map<pid, Set<permission>>
     */
    static _permissions = new Map();
    
    /**
     * 已保存的权限记录（按程序名称索引，用于持久化）
     * Map<programName, Set<permission>>
     * 注意：权限记录应该按程序名称保存，而不是PID，因为PID是随机分配的
     */
    static _savedPermissionsByProgramName = new Map();
    
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
    
    /**
     * 权限审计日志
     * Array<{timestamp, pid, programName, permission, action, result, level, reason?, context?}>
     */
    static _auditLog = [];
    
    /**
     * 审计日志最大条数（避免内存溢出）
     */
    static MAX_AUDIT_LOG_SIZE = 10000;
    
    /**
     * 权限使用统计
     * Map<permission, {granted: number, denied: number, checked: number}>
     */
    static _permissionStats = new Map();
    
    /**
     * 权限违规记录
     * Array<{timestamp, pid, programName, permission, context, stack?}>
     */
    static _violationLog = [];
    
    /**
     * 违规日志最大条数
     */
    static MAX_VIOLATION_LOG_SIZE = 1000;
    
    /**
     * 权限审计日志
     * Array<{timestamp, pid, programName, permission, action, result, level, reason?}>
     */
    static _auditLog = [];
    
    /**
     * 审计日志最大条数（避免内存溢出）
     */
    static MAX_AUDIT_LOG_SIZE = 10000;
    
    /**
     * 权限使用统计
     * Map<permission, {granted: number, denied: number, checked: number}>
     */
    static _permissionStats = new Map();
    
    /**
     * 权限违规记录
     * Array<{timestamp, pid, programName, permission, context, stack?}>
     */
    static _violationLog = [];
    
    /**
     * 违规日志最大条数
     */
    static MAX_VIOLATION_LOG_SIZE = 1000;
    
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
     * 注意：权限记录按程序名称保存，而不是PID，因为PID是随机分配的
     */
    static _loadPermissions() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("PermissionManager", "LStorage 未加载，跳过权限记录加载");
            return;
        }
        
        try {
            const saved = LStorage.getSystemStorage('permissionManager.permissions');
            if (saved && typeof saved === 'object') {
                // 恢复权限记录（按程序名称）
                let loadedCount = 0;
                for (const [programName, permissions] of Object.entries(saved)) {
                    // 兼容旧格式：如果键是数字（PID格式），跳过（旧数据）
                    if (/^\d+$/.test(programName)) {
                        KernelLogger.debug("PermissionManager", `跳过旧格式的权限记录（PID键）: ${programName}`);
                        continue;
                    }
                    
                    if (typeof programName === 'string' && programName.trim() !== '' && Array.isArray(permissions)) {
                        PermissionManager._savedPermissionsByProgramName.set(programName, new Set(permissions));
                        loadedCount++;
                    }
                }
                KernelLogger.debug("PermissionManager", `已加载 ${loadedCount} 个程序的权限记录（按程序名称）`);
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
     * 注意：权限记录按程序名称保存，而不是PID，因为PID是随机分配的
     */
    static _savePermissions() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("PermissionManager", "LStorage 未加载，跳过权限记录保存");
            return;
        }
        
        // 使用异步保存，避免阻塞主线程
        Promise.resolve().then(() => {
            try {
                // 从运行时权限表（按PID）转换为按程序名称保存
                const serialized = {};
                const programPermissionMap = new Map(); // 临时Map，用于合并同一程序的所有实例的权限
                
                // 遍历所有PID的权限，按程序名称分组
                for (const [pid, permissions] of PermissionManager._permissions) {
                    if (permissions && permissions.size > 0) {
                        // 从ProcessManager获取程序名称
                        let programName = null;
                        if (typeof ProcessManager !== 'undefined') {
                            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
                            if (processInfo && processInfo.programName) {
                                programName = processInfo.programName;
                            }
                        }
                        
                        // 如果无法获取程序名称，跳过（Exploit程序不需要保存权限）
                        if (!programName) {
                            // Exploit程序（PID 10000）不需要保存权限
                            if (typeof ProcessManager !== 'undefined' && pid === ProcessManager.EXPLOIT_PID) {
                                continue;
                            }
                            KernelLogger.warn("PermissionManager", `无法获取PID ${pid} 对应的程序名称，跳过权限保存`);
                            continue;
                        }
                        
                        // 合并同一程序的所有权限（如果有多个实例）
                        if (!programPermissionMap.has(programName)) {
                            programPermissionMap.set(programName, new Set());
                        }
                        const programPermissions = programPermissionMap.get(programName);
                        for (const perm of permissions) {
                            programPermissions.add(perm);
                        }
                    }
                }
                
                // 转换为序列化格式
                for (const [programName, permissions] of programPermissionMap) {
                    if (permissions.size > 0) {
                        serialized[programName] = Array.from(permissions);
                    }
                }
                
                LStorage.setSystemStorage('permissionManager.permissions', serialized);
                KernelLogger.debug("PermissionManager", `权限记录已保存 (${Object.keys(serialized).length} 个程序，按程序名称)`);
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
    static async registerProgramPermissions(pid, programInfoOrPermissions, options = {}) {
        // 确保已初始化
        await PermissionManager._ensureInitialized();
        
        // 获取程序名称（用于权限持久化）
        let programName = null;
        if (typeof ProcessManager !== 'undefined') {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (processInfo && processInfo.programName) {
                programName = processInfo.programName;
            }
        }
        
        // 如果无法获取程序名称，尝试从programInfo中获取
        if (!programName && programInfoOrPermissions && typeof programInfoOrPermissions === 'object' && !Array.isArray(programInfoOrPermissions)) {
            programName = programInfoOrPermissions.name;
        }
        
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
        
        // 检查是否为管理员专用程序（通过 options.isAdminProgram 标志）
        const isAdminProgram = options.isAdminProgram === true;
        
        // 先检查是否有已保存的权限记录（按程序名称）
        const permissionSet = PermissionManager._permissions.get(pid) || new Set();
        if (programName && PermissionManager._savedPermissionsByProgramName.has(programName)) {
            // 恢复已保存的权限
            const savedPermissions = PermissionManager._savedPermissionsByProgramName.get(programName);
            for (const perm of savedPermissions) {
                permissionSet.add(perm);
            }
            KernelLogger.debug("PermissionManager", `程序 ${programName} (PID: ${pid}) 已恢复 ${savedPermissions.size} 个已保存的权限`);
        }
        
        let grantedCount = 0;
        let dangerousGrantedCount = 0;
        
        for (const perm of permissions) {
            // 验证权限是否有效
            if (!Object.values(PermissionManager.PERMISSION).includes(perm)) {
                KernelLogger.warn("PermissionManager", `程序 ${pid} 声明了无效权限: ${perm}`);
                continue;
            }
            
            // 如果权限已存在（从已保存的记录中恢复），跳过
            if (permissionSet.has(perm)) {
                KernelLogger.debug("PermissionManager", `程序 ${pid} 的权限 ${perm} 已从保存的记录中恢复`);
                continue;
            }
            
            const level = PermissionManager.PERMISSION_LEVEL_MAP[perm] || PermissionManager.PERMISSION_LEVEL.NORMAL;
            
            if (level === PermissionManager.PERMISSION_LEVEL.NORMAL) {
                // 普通权限：自动授予
                permissionSet.add(perm);
                grantedCount++;
                KernelLogger.debug("PermissionManager", `程序 ${pid} 自动获得普通权限: ${perm}`);
            } else if (level === PermissionManager.PERMISSION_LEVEL.DANGEROUS && isAdminProgram) {
                // 危险权限：如果是管理员专用程序，自动授予（因为管理员已经授权了程序的启动）
                permissionSet.add(perm);
                grantedCount++;
                dangerousGrantedCount++;
                KernelLogger.info("PermissionManager", `程序 ${pid}（管理员专用程序）自动获得危险权限: ${perm}`);
            } else {
                // 特殊权限或非管理员程序的危险权限：等待使用时申请
                // 注意：已保存的权限已在第488-494行恢复，这里只需处理未保存的权限
                KernelLogger.debug("PermissionManager", `程序 ${pid} 声明了${level === PermissionManager.PERMISSION_LEVEL.DANGEROUS ? '危险' : '特殊'}权限: ${perm}（待申请）`);
            }
        }
        
        if (permissionSet.size > 0) {
            PermissionManager._permissions.set(pid, permissionSet);
            PermissionManager._savePermissions();
            if (dangerousGrantedCount > 0) {
                KernelLogger.info("PermissionManager", `程序 ${programName || pid} (PID: ${pid}) 已注册 ${grantedCount} 个权限（包括 ${dangerousGrantedCount} 个危险权限）`);
            } else {
                KernelLogger.info("PermissionManager", `程序 ${programName || pid} (PID: ${pid}) 已注册 ${permissionSet.size} 个权限`);
            }
        }
    }
    
    // ==================== 权限检查 ====================
    
    /**
     * 检查程序是否有指定权限
     * @param {number} pid 进程ID
     * @param {string} permission 权限名称
     * @returns {boolean} 是否有权限
     */
    static hasPermission(pid, permission, context = {}) {
        // Exploit 程序享有所有权限，但必须验证 PID 是否为合法的 EXPLOIT_PID
        if (typeof ProcessManager !== 'undefined') {
            // 首先验证 PID 是否为合法的 EXPLOIT_PID
            if (pid === ProcessManager.EXPLOIT_PID) {
                // 只有合法的 EXPLOIT_PID 才能享有所有权限
                // 即使其他进程修改了 isExploit 标志，也不会被授予权限
                return true;
            }
            
            // 对于非 EXPLOIT_PID，即使 isExploit 被设置为 true，也不授予权限
            // 这防止了通过修改进程表来绕过权限检查的攻击
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (processInfo?.isExploit && pid !== ProcessManager.EXPLOIT_PID) {
                // 检测到可疑的权限提升尝试
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("PermissionManager", 
                        `安全警告: 进程 ${pid} 的 isExploit 标志被设置为 true，但 PID 不是合法的 EXPLOIT_PID。这可能是权限提升攻击。`);
                }
                // 记录安全违规
                PermissionManager._logSecurityViolation(pid, 'suspicious_isExploit_flag', {
                    permission,
                    isExploit: processInfo.isExploit,
                    expectedExploitPid: ProcessManager.EXPLOIT_PID
                });
                // 拒绝权限，即使 isExploit 为 true
            }
        }
        
        const permissions = PermissionManager._permissions.get(pid);
        const hasPerm = permissions ? permissions.has(permission) : false;
        
        // 记录权限检查（仅记录特殊权限和拒绝的检查，避免日志过多）
        const level = PermissionManager.PERMISSION_LEVEL_MAP[permission] || PermissionManager.PERMISSION_LEVEL.NORMAL;
        if (hasPerm || level !== PermissionManager.PERMISSION_LEVEL.NORMAL) {
            PermissionManager._logAudit(pid, permission, 'check', hasPerm, level, context);
        }
        
        // 更新统计
        PermissionManager._updatePermissionStats(permission, 'checked', hasPerm);
        
        // 如果检查失败且是特殊权限，只有在明确拒绝的情况下才记录违规
        // 注意：在 checkAndRequestPermission 流程中，如果权限正在请求中，不应该记录违规
        // 违规应该只在权限被明确拒绝后再次尝试访问时记录
        if (!hasPerm && level !== PermissionManager.PERMISSION_LEVEL.NORMAL) {
            // 检查是否在权限请求流程中（通过 context 标志判断）
            // 如果 context.isRequesting 为 true，说明正在请求权限，不应该记录违规
            if (!context.isRequesting) {
                PermissionManager._logViolation(pid, permission, context);
            }
        }
        
        return hasPerm;
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
        
        // 检查黑名单（在权限检查前先检查黑名单，优先级最高）
        const isBlacklisted = await PermissionManager._checkBlacklist(pid);
        if (isBlacklisted) {
            KernelLogger.warn("PermissionManager", `程序 ${pid} 在黑名单中，拒绝权限: ${permission}`);
            PermissionManager._logAudit(pid, permission, 'deny', false, PermissionManager.PERMISSION_LEVEL_MAP[permission] || PermissionManager.PERMISSION_LEVEL.NORMAL, { reason: 'blacklisted' });
            PermissionManager._updatePermissionStats(permission, 'denied', true);
            // 黑名单程序拒绝权限，不缓存结果（每次都要检查，因为黑名单可能动态变化）
            return false;
        }
        
        // 检查缓存（避免重复检查，但黑名单检查结果不缓存）
        const cacheKey = `${pid}_${permission}`;
        const cached = PermissionManager._permissionCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < PermissionManager.CACHE_TTL) {
            KernelLogger.debug("PermissionManager", `使用缓存权限检查结果: PID ${pid}, 权限 ${permission}, 结果 ${cached.result}`);
            // 即使使用缓存，也要再次检查黑名单（因为黑名单可能动态变化）
            const stillBlacklisted = await PermissionManager._checkBlacklist(pid);
            if (stillBlacklisted) {
                KernelLogger.debug("PermissionManager", `程序 ${pid} 在黑名单中，忽略缓存结果`);
                return false;
            }
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
                // 检查是否已有权限（标记为正在请求中，避免记录违规）
                if (PermissionManager.hasPermission(pid, permission, { isRequesting: true })) {
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
                    // 普通权限：检查白名单，如果在白名单中则自动授予，否则根据设置决定
                    const isWhitelisted = await PermissionManager._checkWhitelist(pid);
                    const shouldAutoGrant = await PermissionManager._shouldAutoGrantNormal(pid);
                    if (isWhitelisted || shouldAutoGrant) {
                        PermissionManager._grantPermission(pid, permission, isWhitelisted ? 'whitelist' : 'auto');
                        result = true;
                    } else {
                        // 普通权限但不在白名单且未启用自动授予，拒绝
                        KernelLogger.debug("PermissionManager", `普通权限未自动授予: PID ${pid}, 权限 ${permission}`);
                        result = false;
                    }
                } else {
                    // 特殊权限和危险权限：必须通过用户确认，不能自动授予
                    // 在请求权限前，再次检查是否已有权限（标记为正在请求中，避免记录违规）
                    if (PermissionManager.hasPermission(pid, permission, { isRequesting: true })) {
                        result = true;
                    } else {
                        result = await PermissionManager._requestPermission(pid, permission, level);
                        // 如果权限被拒绝，现在记录违规（权限请求流程已结束）
                        if (!result) {
                            PermissionManager._logViolation(pid, permission, { 
                                reason: 'user_denied',
                                afterRequest: true 
                            });
                        }
                    }
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
     * 检查程序是否在黑名单中
     * @private
     */
    static async _checkBlacklist(pid) {
        if (typeof LStorage === 'undefined') {
            return false;
        }
        
        try {
            const processInfo = typeof ProcessManager !== 'undefined' 
                ? ProcessManager.PROCESS_TABLE.get(pid) 
                : null;
            
            // Exploit 程序不受黑名单限制
            // 但必须验证 PID 是否为合法的 EXPLOIT_PID
            if (processInfo?.isExploit && pid === ProcessManager.EXPLOIT_PID) {
                return false;
            }
            // 如果 isExploit 为 true 但 PID 不是 EXPLOIT_PID，记录安全违规
            if (processInfo?.isExploit && pid !== ProcessManager.EXPLOIT_PID) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("PermissionManager", 
                        `安全警告: 进程 ${pid} 的 isExploit 标志被设置为 true，但 PID 不是合法的 EXPLOIT_PID。在黑名单检查中忽略此标志。`);
                }
                PermissionManager._logSecurityViolation(pid, 'suspicious_isExploit_flag_in_blacklist', {
                    isExploit: processInfo.isExploit,
                    expectedExploitPid: ProcessManager.EXPLOIT_PID
                });
            }
            
            const programName = processInfo?.programName;
            
            if (!programName) {
                return false;
            }
            
            const blacklist = await LStorage.getSystemStorage('permissionControl.blacklist');
            if (Array.isArray(blacklist)) {
                return blacklist.includes(programName);
            }
        } catch (error) {
            KernelLogger.debug("PermissionManager", `检查黑名单失败: ${error.message}`);
        }
        
        return false;
    }
    
    /**
     * 检查程序是否在白名单中
     * @private
     */
    static async _checkWhitelist(pid) {
        if (typeof LStorage === 'undefined') {
            return false;
        }
        
        try {
            const processInfo = typeof ProcessManager !== 'undefined' 
                ? ProcessManager.PROCESS_TABLE.get(pid) 
                : null;
            const programName = processInfo?.programName;
            
            if (!programName) {
                return false;
            }
            
            const whitelist = await LStorage.getSystemStorage('permissionControl.whitelist');
            if (Array.isArray(whitelist)) {
                return whitelist.includes(programName);
            }
        } catch (error) {
            KernelLogger.debug("PermissionManager", `检查白名单失败: ${error.message}`);
        }
        
        return false;
    }
    
    /**
     * 判断是否应该自动授予普通权限
     * @private
     */
    static async _shouldAutoGrantNormal(pid) {
        if (typeof LStorage === 'undefined') {
            return true; // 默认允许，向后兼容
        }
        
        try {
            const settings = await LStorage.getSystemStorage('permissionControl.settings');
            if (settings && typeof settings.autoGrantEnabled === 'boolean') {
                return settings.autoGrantEnabled;
            }
        } catch (error) {
            KernelLogger.debug("PermissionManager", `检查自动授予设置失败: ${error.message}`);
        }
        
        return true; // 默认允许，向后兼容
    }
    
    /**
     * 授予权限
     * @param {number} pid 进程ID
     * @param {string} permission 权限名称
     */
    static _grantPermission(pid, permission, reason = 'auto') {
        // 安全检查：不允许授予权限给不存在的进程
        if (typeof ProcessManager !== 'undefined') {
            const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
            if (!processInfo) {
                KernelLogger.warn("PermissionManager", `尝试授予权限给不存在的进程: PID ${pid}, 权限 ${permission}`);
                return;
            }
        }
        
        if (!PermissionManager._permissions.has(pid)) {
            PermissionManager._permissions.set(pid, new Set());
        }
        PermissionManager._permissions.get(pid).add(permission);
        
        // 清除相关缓存
        const cacheKey = `${pid}_${permission}`;
        PermissionManager._permissionCache.delete(cacheKey);
        
        // 记录审计日志
        const level = PermissionManager.PERMISSION_LEVEL_MAP[permission] || PermissionManager.PERMISSION_LEVEL.NORMAL;
        PermissionManager._logAudit(pid, permission, 'grant', true, level, { reason });
        
        // 更新统计
        PermissionManager._updatePermissionStats(permission, 'granted', true);
        
        // 异步保存（避免阻塞）
        PermissionManager._savePermissions();
        KernelLogger.info("PermissionManager", `程序 ${pid} 获得权限: ${permission} (原因: ${reason})`);
    }
    
    /**
     * 请求权限（显示拟态弹窗）
     * @param {number} pid 进程ID
     * @param {string} permission 权限名称
     * @param {string} level 权限级别
     * @returns {Promise<boolean>} 是否获得权限
     */
    static async _requestPermission(pid, permission, level) {
        // 再次检查黑名单（防止在请求过程中被加入黑名单）
        const isBlacklisted = await PermissionManager._checkBlacklist(pid);
        if (isBlacklisted) {
            KernelLogger.warn("PermissionManager", `程序 ${pid} 在黑名单中，拒绝权限请求: ${permission}`);
            PermissionManager._logAudit(pid, permission, 'deny', false, level, { reason: 'blacklisted' });
            PermissionManager._updatePermissionStats(permission, 'denied', true);
            return false;
        }
        
        // 检查用户控制：如果当前用户无法授权此权限，直接拒绝
        if (typeof UserControl !== 'undefined') {
            await UserControl._ensureInitialized();
            if (!UserControl.canGrantPermission(permission)) {
                const currentUser = UserControl.getCurrentUser() || '未知';
                KernelLogger.warn("PermissionManager", 
                    `用户 ${currentUser} 无法授权高风险权限: ${permission}`);
                PermissionManager._logAudit(pid, permission, 'deny', false, level, { 
                    reason: 'user_level_insufficient',
                    currentUser: currentUser
                });
                PermissionManager._updatePermissionStats(permission, 'denied', true);
                return false;
            }
        }
        
        // 获取程序信息
        const processInfo = typeof ProcessManager !== 'undefined' 
            ? ProcessManager.PROCESS_TABLE.get(pid) 
            : null;
        
        // 检查进程是否仍然存在
        if (!processInfo) {
            KernelLogger.warn("PermissionManager", `进程 ${pid} 不存在，拒绝权限请求: ${permission}`);
            return false;
        }
        
        const programName = processInfo.programName || `PID ${pid}`;
        
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
                    // 弹窗失败时拒绝权限，而不是抛出错误
                    resolve(false);
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
        
        // 检查用户控制信息
        let userControlInfo = '';
        if (typeof UserControl !== 'undefined') {
            const currentUser = UserControl.getCurrentUser() || '未知';
            const userLevel = UserControl.getCurrentUserLevel();
            const canGrant = UserControl.canGrantPermission(permission);
            
            if (canGrant) {
                const levelText = userLevel === UserControl.USER_LEVEL.DEFAULT_ADMIN ? '默认管理员' :
                                 userLevel === UserControl.USER_LEVEL.ADMIN ? '管理员' : '用户';
                userControlInfo = `<div style="font-size: 12px; color: rgba(76, 175, 80, 0.8); margin-top: 8px;">当前用户: ${currentUser} (${levelText}) - 可以授权</div>`;
            } else {
                userControlInfo = `<div style="font-size: 12px; color: rgba(255, 95, 87, 0.8); margin-top: 8px;">⚠️ 当前用户: ${currentUser} (用户) - 无法授权高风险权限，需要管理员</div>`;
            }
        }
        
        permInfo.innerHTML = `
            <div style="font-size: 14px; color: rgba(215, 224, 221, 0.6); margin-bottom: 8px;">请求权限</div>
            <div style="font-size: 16px; color: var(--theme-text, #d7e0dd); font-weight: 500;">${permissionInfo.name}</div>
            <div style="font-size: 13px; color: rgba(215, 224, 221, 0.5); margin-top: 8px; line-height: 1.5;">${permissionInfo.description}</div>
            ${userControlInfo}
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
            PermissionManager._logAudit(request.pid, request.permission, 'grant', true, request.level, { reason: 'user_granted' });
            PermissionManager._updatePermissionStats(request.permission, 'granted', true);
            request.resolve(true);
        } else {
            KernelLogger.info("PermissionManager", `用户拒绝程序 ${request.pid} 权限: ${request.permission}`);
            PermissionManager._logAudit(request.pid, request.permission, 'deny', false, request.level, { reason: 'user_denied' });
            PermissionManager._updatePermissionStats(request.permission, 'denied', true);
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
                description: '允许程序修改非敏感的系统存储数据（基础权限）'
            },
            [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL]: {
                name: '写入用户控制存储',
                description: '允许程序修改用户控制相关存储（userControl.*），需要管理员授权'
            },
            [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL]: {
                name: '写入权限控制存储',
                description: '允许程序修改权限控制相关存储（permissionControl.*, permissionManager.*），需要管理员授权'
            },
            [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_DESKTOP]: {
                name: '写入桌面存储',
                description: '允许程序修改桌面相关存储（desktop.*）'
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
            
            // 记录审计日志
            const level = PermissionManager.PERMISSION_LEVEL_MAP[permission] || PermissionManager.PERMISSION_LEVEL.NORMAL;
            PermissionManager._logAudit(pid, permission, 'revoke', false, level, { reason: 'manual_revoke' });
            
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
    /**
     * 记录审计日志
     * @private
     */
    static _logAudit(pid, permission, action, result, level, context = {}) {
        const processInfo = typeof ProcessManager !== 'undefined' 
            ? ProcessManager.PROCESS_TABLE.get(pid) 
            : null;
        const programName = processInfo?.programName || `PID ${pid}`;
        
        const logEntry = {
            timestamp: Date.now(),
            pid,
            programName,
            permission,
            action, // 'check', 'grant', 'deny', 'revoke'
            result, // true/false
            level,
            ...context
        };
        
        PermissionManager._auditLog.push(logEntry);
        
        // 限制日志大小
        if (PermissionManager._auditLog.length > PermissionManager.MAX_AUDIT_LOG_SIZE) {
            PermissionManager._auditLog.shift(); // 移除最旧的条目
        }
    }
    
    /**
     * 记录权限违规
     * @private
     */
    static _logViolation(pid, permission, context = {}) {
        const processInfo = typeof ProcessManager !== 'undefined' 
            ? ProcessManager.PROCESS_TABLE.get(pid) 
            : null;
        const programName = processInfo?.programName || `PID ${pid}`;
        
        const violationEntry = {
            timestamp: Date.now(),
            pid,
            programName,
            permission,
            context,
            stack: context.stack || (new Error().stack)
        };
        
        PermissionManager._violationLog.push(violationEntry);
        
        // 限制日志大小
        if (PermissionManager._violationLog.length > PermissionManager.MAX_VIOLATION_LOG_SIZE) {
            PermissionManager._violationLog.shift();
        }
        
        // 记录警告日志
        KernelLogger.warn("PermissionManager", 
            `权限违规: 程序 ${programName} (PID ${pid}) 尝试访问未授权权限 ${permission}`);
    }
    
    /**
     * 记录安全违规（用于权限提升攻击等严重安全问题）
     * @private
     */
    static _logSecurityViolation(pid, violationType, details = {}) {
        const processInfo = typeof ProcessManager !== 'undefined' 
            ? ProcessManager.PROCESS_TABLE.get(pid) 
            : null;
        const programName = processInfo?.programName || `PID ${pid}`;
        
        const violationEntry = {
            timestamp: Date.now(),
            pid,
            programName,
            violationType,
            details,
            severity: 'critical',
            stack: new Error().stack
        };
        
        if (!PermissionManager._securityViolationLog) {
            PermissionManager._securityViolationLog = [];
        }
        
        PermissionManager._securityViolationLog.push(violationEntry);
        
        // 限制日志大小
        if (PermissionManager._securityViolationLog.length > 500) {
            PermissionManager._securityViolationLog.shift();
        }
        
        // 记录错误日志
        KernelLogger.error("PermissionManager", 
            `安全违规: 程序 ${programName} (PID ${pid}), 类型: ${violationType}`, details);
    }
    
    // 安全违规日志
    static _securityViolationLog = [];
    
    /**
     * 更新权限统计
     * @private
     */
    static _updatePermissionStats(permission, action, result) {
        if (!PermissionManager._permissionStats.has(permission)) {
            PermissionManager._permissionStats.set(permission, {
                granted: 0,
                denied: 0,
                checked: 0
            });
        }
        
        const stats = PermissionManager._permissionStats.get(permission);
        if (action === 'granted') {
            stats.granted++;
        } else if (action === 'denied') {
            stats.denied++;
        } else if (action === 'checked') {
            stats.checked++;
        }
    }
    
    static getPermissionStats() {
        return {
            totalPrograms: PermissionManager._permissions.size,
            totalPermissions: Array.from(PermissionManager._permissions.values())
                .reduce((sum, perms) => sum + perms.size, 0),
            cacheSize: PermissionManager._permissionCache.size,
            pendingChecks: PermissionManager._pendingPermissionChecks.size,
            pendingRequests: PermissionManager._pendingRequests.size,
            initialized: PermissionManager._initialized,
            auditLogSize: PermissionManager._auditLog.length,
            violationLogSize: PermissionManager._violationLog.length,
            permissionStats: Object.fromEntries(PermissionManager._permissionStats)
        };
    }
    
    /**
     * 获取审计日志
     * @param {Object} filters 过滤条件 {pid?, permission?, action?, startTime?, endTime?}
     * @param {number} limit 返回的最大条数
     * @returns {Array} 审计日志条目
     */
    static getAuditLog(filters = {}, limit = 1000) {
        let logs = [...PermissionManager._auditLog];
        
        // 应用过滤器
        if (filters.pid !== undefined) {
            logs = logs.filter(log => log.pid === filters.pid);
        }
        if (filters.permission) {
            logs = logs.filter(log => log.permission === filters.permission);
        }
        if (filters.action) {
            logs = logs.filter(log => log.action === filters.action);
        }
        if (filters.startTime) {
            logs = logs.filter(log => log.timestamp >= filters.startTime);
        }
        if (filters.endTime) {
            logs = logs.filter(log => log.timestamp <= filters.endTime);
        }
        
        // 按时间倒序排序（最新的在前）
        logs.sort((a, b) => b.timestamp - a.timestamp);
        
        // 限制返回数量
        return logs.slice(0, limit);
    }
    
    /**
     * 获取违规日志
     * @param {Object} filters 过滤条件 {pid?, permission?, startTime?, endTime?}
     * @param {number} limit 返回的最大条数
     * @returns {Array} 违规日志条目
     */
    static getViolationLog(filters = {}, limit = 500) {
        let logs = [...PermissionManager._violationLog];
        
        // 应用过滤器
        if (filters.pid !== undefined) {
            logs = logs.filter(log => log.pid === filters.pid);
        }
        if (filters.permission) {
            logs = logs.filter(log => log.permission === filters.permission);
        }
        if (filters.startTime) {
            logs = logs.filter(log => log.timestamp >= filters.startTime);
        }
        if (filters.endTime) {
            logs = logs.filter(log => log.timestamp <= filters.endTime);
        }
        
        // 按时间倒序排序
        logs.sort((a, b) => b.timestamp - a.timestamp);
        
        return logs.slice(0, limit);
    }
    
    /**
     * 清除审计日志
     * @param {boolean} clearViolations 是否同时清除违规日志
     */
    static clearAuditLog(clearViolations = false) {
        PermissionManager._auditLog = [];
        if (clearViolations) {
            PermissionManager._violationLog = [];
        }
        KernelLogger.info("PermissionManager", "审计日志已清除");
    }
    
    /**
     * 记录敏感系统存储访问审计日志
     * 用于 LStorage 模块记录敏感存储键的访问
     * @param {string} storageKey 存储键名
     * @param {number|null} pid 进程ID（null 表示未知或内核模块）
     * @param {string} caller 调用者描述（如 '内核模块（系统加载中）'、'PermissionManager（系统初始化）'、'用户程序'）
     * @param {Object} context 附加上下文信息
     */
    static recordStorageAccessAudit(storageKey, pid, caller, context = {}) {
        // 如果 PermissionManager 未初始化，静默跳过（避免循环依赖）
        if (!PermissionManager._initialized) {
            return;
        }
        
        // 确定权限名称（基于存储键）
        let permission = null;
        if (storageKey.startsWith('userControl.')) {
            permission = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL;
        } else if (storageKey.startsWith('permissionControl.') || storageKey === 'permissionManager.permissions') {
            permission = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_PERMISSION_CONTROL;
        }
        
        // 记录审计日志
        PermissionManager._logAudit(
            pid || 0, // 使用 0 表示未知 PID
            permission || 'STORAGE_ACCESS', // 如果没有对应权限，使用通用标识
            'storage_access', // 操作类型
            true, // 访问成功
            permission ? PermissionManager.PERMISSION_LEVEL_MAP[permission] || PermissionManager.PERMISSION_LEVEL.DANGEROUS : PermissionManager.PERMISSION_LEVEL.DANGEROUS,
            {
                storageKey: storageKey,
                caller: caller,
                ...context
            }
        );
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

