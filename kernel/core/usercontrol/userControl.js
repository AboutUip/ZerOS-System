// 用户控制系统
// 负责管理用户账户、权限级别和权限授权控制
// 用户分为：用户（User）、管理员（Admin）、默认管理员（Default Admin）

KernelLogger.info("UserControl", "模块初始化");

class UserControl {
    // ==================== 用户级别枚举 ====================
    
    /**
     * 用户级别
     */
    static USER_LEVEL = {
        USER: 'USER',                    // 普通用户：无法授权高风险权限
        ADMIN: 'ADMIN',                   // 管理员：拥有完全控制权限
        DEFAULT_ADMIN: 'DEFAULT_ADMIN'    // 默认管理员：系统最高权限
    };
    
    // ==================== 高风险权限列表 ====================
    
    /**
     * 高风险权限列表
     * 普通用户无法授权这些权限给程序
     */
    static HIGH_RISK_PERMISSIONS = [
        'CRYPT_GENERATE_KEY',     // 生成密钥对
        'CRYPT_IMPORT_KEY',       // 导入密钥对
        'CRYPT_DELETE_KEY',       // 删除密钥
        'CRYPT_ENCRYPT',          // 加密数据
        'CRYPT_DECRYPT',          // 解密数据
        'PROCESS_MANAGE'          // 管理进程（危险权限）
    ];
    
    // ==================== 内部状态 ====================
    
    /**
     * 当前登录用户
     */
    static _currentUser = null;
    
    /**
     * 用户数据库
     * Map<username, {level, password?, createdAt, lastLogin}>
     */
    static _users = new Map();
    
    /**
     * 是否已初始化
     */
    static _initialized = false;
    
    /**
     * 初始化Promise（用于确保只初始化一次）
     */
    static _initPromise = null;
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化用户控制系统
     */
    static async init() {
        if (UserControl._initialized) {
            KernelLogger.warn("UserControl", "用户控制系统已初始化，跳过重复初始化");
            return;
        }
        
        // 如果正在初始化，等待初始化完成
        if (UserControl._initPromise) {
            return await UserControl._initPromise;
        }
        
        // 创建初始化Promise
        UserControl._initPromise = (async () => {
            try {
                // 等待LStorage完全初始化（如果存在）
                if (typeof LStorage !== 'undefined') {
                    // 首先等待LStorage模块加载
                    let retries = 0;
                    while (retries < 20 && typeof LStorage.init !== 'function') {
                        await new Promise(resolve => setTimeout(resolve, 50));
                        retries++;
                    }
                    
                    // 确保LStorage已初始化（这会加载数据）
                    if (typeof LStorage.init === 'function') {
                        await LStorage.init();
                        KernelLogger.debug("UserControl", "LStorage 已初始化，准备加载用户数据");
                    } else {
                        KernelLogger.warn("UserControl", "LStorage.init 不可用，可能无法加载用户数据");
                    }
                } else {
                    KernelLogger.warn("UserControl", "LStorage 未定义，无法加载用户数据");
                }
                
                // 加载用户数据（等待完成）
                await UserControl._loadUsers();
                
                // 确保默认用户存在（仅在不存在时创建，不会覆盖已存在的用户）
                // 即使已加载了用户，也要确保默认用户存在
                UserControl._createDefaultUsers();
                
                // 尝试加载保存的当前用户（但不自动登录，由锁屏界面处理）
                // 锁屏界面会显示用户，但不会自动登录
                // 这里只初始化，不设置当前用户
                
                UserControl._initialized = true;
                KernelLogger.info("UserControl", "用户控制系统初始化完成");
            } catch (e) {
                KernelLogger.error("UserControl", `初始化失败: ${e.message}`, e);
                // 即使初始化失败，也标记为已初始化，避免阻塞系统
                UserControl._initialized = true;
            } finally {
                UserControl._initPromise = null;
            }
        })();
        
        return await UserControl._initPromise;
    }
    
    /**
     * 确保用户控制系统已初始化（公共方法）
     */
    static async ensureInitialized() {
        if (!UserControl._initialized) {
            await UserControl.init();
        }
    }
    
    /**
     * 确保用户控制系统已初始化（私有方法，向后兼容）
     * @deprecated 使用 ensureInitialized() 代替
     */
    static async _ensureInitialized() {
        return await UserControl.ensureInitialized();
    }
    
    /**
     * 创建默认用户（仅在用户不存在时创建，不会覆盖已存在的用户）
     */
    static _createDefaultUsers() {
        let createdCount = 0;
        
        // 创建默认管理员 root（无密码）- 仅在不存在时创建
        if (!UserControl._users.has('root')) {
            UserControl._users.set('root', {
                level: UserControl.USER_LEVEL.DEFAULT_ADMIN,
                password: null, // 默认无密码（MD5加密后存储）
                avatar: null, // 用户头像路径（相对于cache目录）
                createdAt: Date.now(),
                lastLogin: Date.now()
            });
            createdCount++;
            KernelLogger.info("UserControl", "已创建默认管理员：root");
        } else {
            const existingRoot = UserControl._users.get('root');
            KernelLogger.debug("UserControl", `root 用户已存在，跳过创建。当前数据: level=${existingRoot?.level}, password=${existingRoot?.password ? existingRoot.password.substring(0, 8) + '...' : 'null'}`);
        }
        
        // 创建测试用户 TestUser（无密码）- 仅在不存在时创建
        if (!UserControl._users.has('TestUser')) {
            UserControl._users.set('TestUser', {
                level: UserControl.USER_LEVEL.USER,
                password: null, // 默认无密码（MD5加密后存储）
                avatar: null, // 用户头像路径（相对于cache目录）
                createdAt: Date.now(),
                lastLogin: null
            });
            createdCount++;
            KernelLogger.info("UserControl", "已创建测试用户：TestUser");
        } else {
            const existingTestUser = UserControl._users.get('TestUser');
            KernelLogger.debug("UserControl", `TestUser 用户已存在，跳过创建。当前数据: level=${existingTestUser?.level}, password=${existingTestUser?.password ? existingTestUser.password.substring(0, 8) + '...' : 'null'}`);
        }
        
        // 只有在创建了新用户时才保存
        if (createdCount > 0) {
            UserControl._saveUsers();
            KernelLogger.info("UserControl", `已创建 ${createdCount} 个默认用户`);
        } else {
            KernelLogger.debug("UserControl", "所有默认用户已存在，无需创建");
        }
    }
    
    /**
     * 从存储加载用户数据
     */
    static async _loadUsers() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("UserControl", "LStorage 未加载，跳过用户数据加载");
            return;
        }
        
        // 确保LStorage已初始化（这会从文件加载数据）
        if (!LStorage._initialized) {
            KernelLogger.warn("UserControl", "LStorage 未初始化，尝试初始化");
            await LStorage.init();
        }
        
        try {
            // 等待数据加载完成（getSystemStorage 是异步的）
            const saved = await LStorage.getSystemStorage('userControl.users');
            if (saved && typeof saved === 'object') {
                KernelLogger.info("UserControl", `开始加载用户数据，存储中的用户数: ${Object.keys(saved).length}`);
                let loadedCount = 0;
                for (const [username, userData] of Object.entries(saved)) {
                    if (userData && typeof userData === 'object') {
                        // 记录原始数据中的密码状态
                        const originalPassword = userData.password;
                        const originalPasswordType = typeof originalPassword;
                        const originalPasswordValue = originalPassword !== null && originalPassword !== undefined ? 
                                                     (typeof originalPassword === 'string' ? originalPassword.substring(0, 8) + '...' : String(originalPassword)) : 
                                                     'null/undefined';
                        
                        // 确保所有必需字段都存在，如果缺失则使用默认值
                        // 重要：保留原始密码值，不要随意修改
                        const loadedUserData = {
                            level: userData.level || UserControl.USER_LEVEL.USER,
                            password: userData.hasOwnProperty('password') ? userData.password : null, // 使用 hasOwnProperty 检查字段是否存在
                            avatar: userData.hasOwnProperty('avatar') ? userData.avatar : null,
                            createdAt: userData.createdAt || Date.now(),
                            lastLogin: userData.lastLogin || null
                        };
                        
                        // 调试日志：记录详细的加载信息
                        if (typeof KernelLogger !== 'undefined') {
                            const passwordStatus = loadedUserData.password !== null && 
                                                 loadedUserData.password !== undefined && 
                                                 loadedUserData.password !== '' ? 
                                                 `有密码 (${loadedUserData.password.substring(0, 8)}...)` : '无密码';
                            KernelLogger.info("UserControl", `加载用户: ${username}, 级别: ${loadedUserData.level}, 密码: ${passwordStatus}, 原始密码类型: ${originalPasswordType}, 原始密码值: ${originalPasswordValue}`);
                        }
                        
                        UserControl._users.set(username, loadedUserData);
                        loadedCount++;
                    } else {
                        KernelLogger.warn("UserControl", `跳过无效的用户数据: ${username}, 类型: ${typeof userData}`);
                    }
                }
                KernelLogger.info("UserControl", `已加载 ${loadedCount} 个用户，内存中的用户数: ${UserControl._users.size}`);
            } else {
                KernelLogger.warn("UserControl", `没有保存的用户数据或数据格式不正确: ${saved ? typeof saved : 'null/undefined'}`);
            }
        } catch (e) {
            KernelLogger.error("UserControl", `加载用户数据失败: ${e.message}`, e);
        }
    }
    
    /**
     * 保存用户数据到存储
     */
    static _saveUsers() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("UserControl", "LStorage 未加载，跳过用户数据保存");
            return;
        }
        
        // 使用异步保存，避免阻塞主线程
        Promise.resolve().then(async () => {
            try {
                const serialized = {};
                for (const [username, userData] of UserControl._users) {
                    // 在保存前，如果密码字段缺失，尝试从存储中重新加载
                    if (userData.password === undefined) {
                        KernelLogger.warn("UserControl", `用户 ${username} 的密码字段缺失，尝试从存储中恢复`);
                        try {
                            const saved = LStorage.getSystemStorage('userControl.users');
                            if (saved && saved[username] && saved[username].password !== undefined) {
                                userData.password = saved[username].password;
                                KernelLogger.debug("UserControl", `已从存储中恢复用户 ${username} 的密码字段`);
                            } else {
                                userData.password = null;
                                KernelLogger.debug("UserControl", `存储中也没有用户 ${username} 的密码，设置为 null`);
                            }
                        } catch (e) {
                            KernelLogger.error("UserControl", `恢复用户 ${username} 的密码字段失败: ${e.message}`, e);
                            userData.password = null;
                        }
                    }
                    
                    // 保存所有数据，包括MD5加密后的密码
                    // 确保所有字段都被保存，包括 null 值
                    serialized[username] = {
                        level: userData.level,
                        password: userData.password !== undefined ? userData.password : null, // 明确保存 null 而不是 undefined
                        avatar: userData.avatar !== undefined ? userData.avatar : null,
                        createdAt: userData.createdAt || Date.now(),
                        lastLogin: userData.lastLogin || null
                    };
                    
                    // 调试日志：记录保存的密码状态
                    if (typeof KernelLogger !== 'undefined') {
                        const passwordStatus = serialized[username].password !== null && 
                                             serialized[username].password !== undefined && 
                                             serialized[username].password !== '' ? 
                                             `有密码 (${serialized[username].password.substring(0, 8)}...)` : '无密码';
                        KernelLogger.debug("UserControl", `保存用户: ${username}, 级别: ${serialized[username].level}, 密码: ${passwordStatus}, 内存中密码: ${userData.password !== undefined ? (userData.password ? userData.password.substring(0, 8) + '...' : 'null') : 'undefined'}`);
                    }
                }
                // 等待保存完成
                const success = await LStorage.setSystemStorage('userControl.users', serialized);
                if (success) {
                    KernelLogger.debug("UserControl", `用户数据已保存 (${Object.keys(serialized).length} 个用户)`);
                } else {
                    KernelLogger.warn("UserControl", `用户数据保存可能失败，但会重试`);
                }
            } catch (e) {
                KernelLogger.error("UserControl", `保存用户数据失败: ${e.message}`, e);
            }
        }).catch(e => {
            KernelLogger.error("UserControl", `异步保存用户数据失败: ${e.message}`, e);
        });
    }
    
    /**
     * 更新当前用户的级别信息
     */
    static _updateCurrentUserLevel() {
        if (UserControl._currentUser) {
            const userData = UserControl._users.get(UserControl._currentUser);
            if (userData) {
                // 在更新 lastLogin 之前，确保密码字段存在
                // 如果密码字段缺失，从存储中重新加载
                if (userData.password === undefined) {
                    KernelLogger.warn("UserControl", `用户 ${UserControl._currentUser} 的密码字段缺失，尝试重新加载`);
                    // 尝试从存储中重新加载用户数据
                    try {
                        const saved = LStorage.getSystemStorage('userControl.users');
                        if (saved && saved[UserControl._currentUser]) {
                            const savedUserData = saved[UserControl._currentUser];
                            if (savedUserData.password !== undefined) {
                                userData.password = savedUserData.password;
                                KernelLogger.debug("UserControl", `已从存储中恢复用户 ${UserControl._currentUser} 的密码字段`);
                            }
                        }
                    } catch (e) {
                        KernelLogger.error("UserControl", `重新加载用户数据失败: ${e.message}`, e);
                    }
                }
                
                userData.lastLogin = Date.now();
                UserControl._saveUsers();
            }
        }
    }
    
    // ==================== 用户管理 ====================
    
    /**
     * 登录用户
     * @param {string} username 用户名
     * @param {string} password 密码（可选，如果用户有密码则必须提供）
     * @returns {boolean} 是否登录成功
     */
    static async login(username, password = null) {
        await UserControl._ensureInitialized();
        
        if (!username || typeof username !== 'string') {
            KernelLogger.warn("UserControl", "无效的用户名");
            return false;
        }
        
        const userData = UserControl._users.get(username);
        if (!userData) {
            KernelLogger.warn("UserControl", `用户不存在: ${username}`);
            return false;
        }
        
        // 检查密码（包括空字符串检查）
        const hasPassword = userData.password !== null && 
                           userData.password !== undefined && 
                           userData.password !== '';
        
        if (hasPassword) {
            // 用户有密码，必须提供正确的密码
            if (password === null || password === undefined || password === '') {
                KernelLogger.warn("UserControl", `用户 ${username} 需要密码`);
                return false;
            }
            
            // 使用MD5加密密码后比较
            try {
                let encryptedPassword = password;
                if (typeof CryptDrive !== 'undefined') {
                    encryptedPassword = await CryptDrive.md5(password);
                } else {
                    KernelLogger.warn("UserControl", "CryptDrive 未加载，无法验证密码");
                    return false;
                }
                
                // 比较MD5哈希值
                if (userData.password !== encryptedPassword) {
                    KernelLogger.warn("UserControl", `用户 ${username} 密码错误`);
                    return false;
                }
            } catch (e) {
                KernelLogger.error("UserControl", `密码验证失败: ${e.message}`, e);
                return false;
            }
        } else {
            // 用户无密码，可以无密码登录
            if (password !== null && password !== undefined && password !== '') {
                KernelLogger.warn("UserControl", `用户 ${username} 无密码，但提供了密码`);
                // 仍然允许登录（向后兼容）
            }
        }
        
        UserControl._currentUser = username;
        UserControl._updateCurrentUserLevel();
        
        // 保存当前用户到 LStorage
        if (typeof LStorage !== 'undefined') {
            try {
                await LStorage.setSystemStorage('userControl.currentUser', username);
            } catch (e) {
                KernelLogger.warn("UserControl", `保存当前用户失败: ${e.message}`);
            }
        }
        
        KernelLogger.info("UserControl", `用户已登录: ${username} (级别: ${userData.level})`);
        return true;
    }
    
    /**
     * 检查用户是否有密码
     * @param {string} username 用户名
     * @returns {boolean} 是否有密码
     */
    static hasPassword(username) {
        const userData = UserControl._users.get(username);
        if (!userData) {
            return false;
        }
        // 检查密码是否存在且不为空字符串
        return userData.password !== null && 
               userData.password !== undefined && 
               userData.password !== '';
    }
    
    /**
     * 设置用户密码
     * @param {string} username 用户名
     * @param {string} password 新密码（null 表示移除密码）
     * @param {string} currentPassword 当前密码（非管理员用户修改自己密码时必须提供）
     * @returns {Promise<boolean>} 是否设置成功
     */
    static async setPassword(username, password, currentPassword = null) {
        await UserControl._ensureInitialized();
        
        // 只有管理员可以设置密码，或者用户自己可以设置自己的密码
        if (!UserControl.isAdmin() && username !== UserControl._currentUser) {
            KernelLogger.warn("UserControl", "只有管理员可以设置其他用户的密码");
            return false;
        }
        
        const userData = UserControl._users.get(username);
        if (!userData) {
            KernelLogger.warn("UserControl", `用户不存在: ${username}`);
            return false;
        }
        
        // 如果是非管理员用户修改自己的密码，且用户已有密码，必须验证当前密码
        const isCurrentUser = username === UserControl._currentUser;
        const hasPassword = userData.password !== null && 
                           userData.password !== undefined && 
                           userData.password !== '';
        
        if (isCurrentUser && hasPassword && !UserControl.isAdmin()) {
            // 必须提供当前密码
            if (!currentPassword) {
                KernelLogger.warn("UserControl", "修改密码需要提供当前密码");
                return false;
            }
            
            // 验证当前密码
            try {
                let encryptedCurrentPassword = currentPassword;
                if (typeof CryptDrive !== 'undefined') {
                    encryptedCurrentPassword = await CryptDrive.md5(currentPassword);
                } else {
                    KernelLogger.warn("UserControl", "CryptDrive 未加载，无法验证密码");
                    return false;
                }
                
                // 比较MD5哈希值
                if (userData.password !== encryptedCurrentPassword) {
                    KernelLogger.warn("UserControl", "当前密码错误");
                    return false;
                }
            } catch (e) {
                KernelLogger.error("UserControl", `密码验证失败: ${e.message}`, e);
                return false;
            }
        }
        
        // 如果提供了密码，使用MD5加密
        let encryptedPassword = null;
        if (password) {
            try {
                // 使用CryptDrive进行MD5加密
                if (typeof CryptDrive !== 'undefined') {
                    encryptedPassword = await CryptDrive.md5(password);
                } else {
                    KernelLogger.warn("UserControl", "CryptDrive 未加载，无法加密密码");
                    return false;
                }
            } catch (e) {
                KernelLogger.error("UserControl", `密码加密失败: ${e.message}`, e);
                return false;
            }
        }
        
        userData.password = encryptedPassword;
        UserControl._saveUsers();
        
        // 验证密码是否已正确保存
        const savedPassword = UserControl._users.get(username)?.password;
        const passwordSaved = savedPassword !== null && savedPassword !== undefined && savedPassword !== '';
        KernelLogger.info("UserControl", `已${password ? '设置' : '移除'}用户 ${username} 的密码 (保存状态: ${passwordSaved}, 密码哈希: ${savedPassword ? savedPassword.substring(0, 8) + '...' : 'null'})`);
        
        if (password && !passwordSaved) {
            KernelLogger.error("UserControl", `警告：密码可能未正确保存到内存中`);
        }
        
        return true;
    }
    
    /**
     * 设置用户头像
     * @param {string} username 用户名
     * @param {string} avatarPath 头像路径（相对于cache目录，如 "avatar_user_123.png"）
     * @returns {boolean} 是否设置成功
     */
    static async setAvatar(username, avatarPath) {
        await UserControl._ensureInitialized();
        
        // 只有管理员可以设置其他用户的头像，或者用户自己可以设置自己的头像
        if (!UserControl.isAdmin() && username !== UserControl._currentUser) {
            KernelLogger.warn("UserControl", "只有管理员可以设置其他用户的头像");
            return false;
        }
        
        const userData = UserControl._users.get(username);
        if (!userData) {
            KernelLogger.warn("UserControl", `用户不存在: ${username}`);
            return false;
        }
        
        userData.avatar = avatarPath;
        UserControl._saveUsers();
        
        KernelLogger.info("UserControl", `已设置用户 ${username} 的头像: ${avatarPath}`);
        return true;
    }
    
    /**
     * 获取用户头像路径
     * @param {string} username 用户名
     * @returns {string|null} 头像路径（完整路径），如果不存在则返回null
     */
    static getAvatarPath(username) {
        const userData = UserControl._users.get(username);
        if (!userData || !userData.avatar) {
            return null;
        }
        
        // 返回完整路径（相对于cache目录）
        return `D:/cache/${userData.avatar}`;
    }
    
    /**
     * 重命名用户
     * @param {string} oldUsername 旧用户名
     * @param {string} newUsername 新用户名
     * @returns {boolean} 是否重命名成功
     */
    static async renameUser(oldUsername, newUsername) {
        await UserControl._ensureInitialized();
        
        // 只有管理员可以重命名用户
        if (!UserControl.isAdmin()) {
            KernelLogger.warn("UserControl", "只有管理员可以重命名用户");
            return false;
        }
        
        if (!oldUsername || !newUsername || typeof oldUsername !== 'string' || typeof newUsername !== 'string') {
            KernelLogger.warn("UserControl", "无效的用户名");
            return false;
        }
        
        if (oldUsername === newUsername) {
            KernelLogger.warn("UserControl", "新旧用户名相同");
            return false;
        }
        
        if (!UserControl._users.has(oldUsername)) {
            KernelLogger.warn("UserControl", `用户不存在: ${oldUsername}`);
            return false;
        }
        
        if (UserControl._users.has(newUsername)) {
            KernelLogger.warn("UserControl", `用户名已存在: ${newUsername}`);
            return false;
        }
        
        // 不能重命名 root 用户
        if (oldUsername === 'root') {
            KernelLogger.warn("UserControl", "不能重命名 root 用户");
            return false;
        }
        
        // 获取用户数据
        const userData = UserControl._users.get(oldUsername);
        
        // 创建新用户条目
        UserControl._users.set(newUsername, {
            level: userData.level,
            password: userData.password,
            avatar: userData.avatar,
            createdAt: userData.createdAt,
            lastLogin: userData.lastLogin
        });
        
        // 删除旧用户条目
        UserControl._users.delete(oldUsername);
        
        // 如果重命名的是当前登录用户，更新当前用户
        if (UserControl._currentUser === oldUsername) {
            UserControl._currentUser = newUsername;
        }
        
        // 保存更改
        UserControl._saveUsers();
        
        KernelLogger.info("UserControl", `已将用户 ${oldUsername} 重命名为 ${newUsername}`);
        return true;
    }
    
    /**
     * 获取当前登录用户
     * @returns {string|null} 当前用户名
     */
    static getCurrentUser() {
        return UserControl._currentUser;
    }
    
    /**
     * 获取当前用户的级别
     * @returns {string|null} 用户级别
     */
    static getCurrentUserLevel() {
        if (!UserControl._currentUser) {
            return null;
        }
        
        const userData = UserControl._users.get(UserControl._currentUser);
        return userData ? userData.level : null;
    }
    
    /**
     * 检查当前用户是否为管理员
     * @returns {boolean} 是否为管理员
     */
    static isAdmin() {
        const level = UserControl.getCurrentUserLevel();
        return level === UserControl.USER_LEVEL.ADMIN || 
               level === UserControl.USER_LEVEL.DEFAULT_ADMIN;
    }
    
    /**
     * 检查当前用户是否为默认管理员
     * @returns {boolean} 是否为默认管理员
     */
    static isDefaultAdmin() {
        const level = UserControl.getCurrentUserLevel();
        return level === UserControl.USER_LEVEL.DEFAULT_ADMIN;
    }
    
    /**
     * 创建新用户
     * @param {string} username 用户名
     * @param {string} level 用户级别
     * @returns {boolean} 是否创建成功
     */
    static async createUser(username, level = UserControl.USER_LEVEL.USER) {
        await UserControl._ensureInitialized();
        
        // 只有管理员可以创建用户
        if (!UserControl.isAdmin()) {
            KernelLogger.warn("UserControl", "只有管理员可以创建用户");
            return false;
        }
        
        if (!username || typeof username !== 'string') {
            KernelLogger.warn("UserControl", "无效的用户名");
            return false;
        }
        
        if (UserControl._users.has(username)) {
            KernelLogger.warn("UserControl", `用户已存在: ${username}`);
            return false;
        }
        
        // 验证用户级别
        if (!Object.values(UserControl.USER_LEVEL).includes(level)) {
            KernelLogger.warn("UserControl", `无效的用户级别: ${level}`);
            return false;
        }
        
        // 只有默认管理员可以创建管理员
        if (level === UserControl.USER_LEVEL.ADMIN && !UserControl.isDefaultAdmin()) {
            KernelLogger.warn("UserControl", "只有默认管理员可以创建管理员");
            return false;
        }
        
        UserControl._users.set(username, {
            level: level,
            password: null, // 默认无密码（MD5加密后存储）
            avatar: null, // 用户头像路径（相对于cache目录）
            createdAt: Date.now(),
            lastLogin: null
        });
        
        UserControl._saveUsers();
        KernelLogger.info("UserControl", `已创建用户: ${username} (级别: ${level})`);
        return true;
    }
    
    /**
     * 删除用户
     * @param {string} username 用户名
     * @returns {boolean} 是否删除成功
     */
    static async deleteUser(username) {
        await UserControl._ensureInitialized();
        
        // 只有管理员可以删除用户
        if (!UserControl.isAdmin()) {
            KernelLogger.warn("UserControl", "只有管理员可以删除用户");
            return false;
        }
        
        if (!username || typeof username !== 'string') {
            KernelLogger.warn("UserControl", "无效的用户名");
            return false;
        }
        
        // 不能删除 root 用户
        if (username === 'root') {
            KernelLogger.warn("UserControl", "不能删除 root 用户");
            return false;
        }
        
        // 不能删除当前登录用户
        if (username === UserControl._currentUser) {
            KernelLogger.warn("UserControl", "不能删除当前登录用户");
            return false;
        }
        
        if (!UserControl._users.has(username)) {
            KernelLogger.warn("UserControl", `用户不存在: ${username}`);
            return false;
        }
        
        UserControl._users.delete(username);
        UserControl._saveUsers();
        KernelLogger.info("UserControl", `已删除用户: ${username}`);
        return true;
    }
    
    /**
     * 列出所有用户
     * @returns {Array<{username, level, createdAt, lastLogin}>} 用户列表
     */
    static listUsers() {
        const users = [];
        for (const [username, userData] of UserControl._users) {
            users.push({
                username,
                level: userData.level,
                avatar: userData.avatar || null,
                hasPassword: userData.password !== null && userData.password !== undefined && userData.password !== '',
                createdAt: userData.createdAt,
                lastLogin: userData.lastLogin
            });
        }
        return users;
    }
    
    /**
     * 获取用户信息
     * @param {string} username 用户名
     * @returns {Object|null} 用户信息
     */
    static getUserInfo(username) {
        const userData = UserControl._users.get(username);
        if (!userData) {
            return null;
        }
        
        return {
            username,
            level: userData.level,
            avatar: userData.avatar || null,
            hasPassword: userData.password !== null && userData.password !== undefined && userData.password !== '',
            createdAt: userData.createdAt,
            lastLogin: userData.lastLogin
        };
    }
    
    // ==================== 权限检查 ====================
    
    /**
     * 检查权限是否为高风险权限
     * @param {string} permission 权限名称
     * @returns {boolean} 是否为高风险权限
     */
    static isHighRiskPermission(permission) {
        return UserControl.HIGH_RISK_PERMISSIONS.includes(permission);
    }
    
    /**
     * 检查当前用户是否可以授权指定权限
     * @param {string} permission 权限名称
     * @returns {boolean} 是否可以授权
     */
    static canGrantPermission(permission) {
        // 管理员可以授权所有权限
        if (UserControl.isAdmin()) {
            return true;
        }
        
        // 普通用户无法授权高风险权限
        if (UserControl.isHighRiskPermission(permission)) {
            return false;
        }
        
        // 普通用户可以授权低风险权限
        return true;
    }
    
    /**
     * 获取权限授权提示信息
     * @param {string} permission 权限名称
     * @returns {string} 提示信息
     */
    static getPermissionGrantMessage(permission) {
        if (UserControl.isAdmin()) {
            return `管理员可以授权此权限`;
        }
        
        if (UserControl.isHighRiskPermission(permission)) {
            return `此权限需要管理员授权，当前用户（${UserControl._currentUser || '未知'}）无法授权`;
        }
        
        return `当前用户（${UserControl._currentUser || '未知'}）可以授权此权限`;
    }
}

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "UserControl", UserControl);
    } catch (e) {
        KernelLogger.error("UserControl", `注册到 POOL 失败: ${e.message}`);
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/core/usercontrol/userControl.js");
} else {
    const publishWhenReady = () => {
        if (typeof DependencyConfig !== 'undefined') {
            DependencyConfig.publishSignal("../kernel/core/usercontrol/userControl.js");
        } else {
            setTimeout(publishWhenReady, 10);
        }
    };
    publishWhenReady();
}

// 自动初始化（异步，不阻塞模块加载）
if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        UserControl.init().catch(e => {
            KernelLogger.error("UserControl", `自动初始化失败: ${e.message}`, e);
        });
    });
} else {
    // 异步初始化，不阻塞
    UserControl.init().catch(e => {
        KernelLogger.error("UserControl", `自动初始化失败: ${e.message}`, e);
    });
}

