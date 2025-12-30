// 用户组管理系统
// 负责管理用户组和管理员组，与 UserControl 兼容
// 支持创建组、添加/移除成员、查询组成员等操作

KernelLogger.info("UserGroup", "模块初始化");

class UserGroup {
    // ==================== 组类型枚举 ====================
    
    /**
     * 组类型
     */
    static GROUP_TYPE = {
        USER_GROUP: 'USER_GROUP',         // 普通用户组
        ADMIN_GROUP: 'ADMIN_GROUP'        // 管理员组
    };
    
    // ==================== 内部状态 ====================
    
    /**
     * 是否已初始化
     */
    static _initialized = false;
    
    /**
     * 初始化Promise（用于避免重复初始化）
     */
    static _initPromise = null;
    
    /**
     * 组数据库
     * Map<groupName, {type, members: Set<string>, createdAt, description?}>
     */
    static _groups = new Map();
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化用户组系统
     */
    static async init() {
        if (UserGroup._initialized) {
            return;
        }
        
        if (UserGroup._initPromise) {
            return await UserGroup._initPromise;
        }
        
        UserGroup._initPromise = (async () => {
            try {
                // 等待LStorage完全初始化（如果存在）
                if (typeof LStorage !== 'undefined') {
                    let retries = 0;
                    while (retries < 20 && typeof LStorage.init !== 'function') {
                        await new Promise(resolve => setTimeout(resolve, 50));
                        retries++;
                    }
                    
                    if (typeof LStorage.init === 'function') {
                        await LStorage.init();
                        KernelLogger.debug("UserGroup", "LStorage 已初始化，准备加载用户组数据");
                    } else {
                        KernelLogger.warn("UserGroup", "LStorage.init 不可用，可能无法加载用户组数据");
                    }
                } else {
                    KernelLogger.warn("UserGroup", "LStorage 未定义，无法加载用户组数据");
                }
                
                // 加载组数据
                await UserGroup._loadGroups();
                
                // 创建默认组（如果不存在）
                await UserGroup._createDefaultGroups();
                
                UserGroup._initialized = true;
                KernelLogger.info("UserGroup", "用户组系统初始化完成");
            } catch (e) {
                KernelLogger.error("UserGroup", `初始化失败: ${e.message}`, e);
                UserGroup._initialized = true;
            } finally {
                UserGroup._initPromise = null;
            }
        })();
        
        return await UserGroup._initPromise;
    }
    
    /**
     * 确保用户组系统已初始化
     */
    static async ensureInitialized() {
        if (!UserGroup._initialized) {
            await UserGroup.init();
        }
    }
    
    /**
     * 创建默认组
     * 注意：此方法不应调用 ensureInitialized，因为它只应在 init() 中被调用
     */
    static async _createDefaultGroups() {
        // 不调用 ensureInitialized，因为此方法只在 init() 中被调用
        
        let createdCount = 0;
        
        // 创建默认管理员组（包含所有管理员用户）
        if (!UserGroup._groups.has('admins')) {
            const adminMembers = new Set();
            // 从 UserControl 获取所有管理员用户
            if (typeof UserControl !== 'undefined') {
                try {
                    await UserControl.ensureInitialized();
                    if (UserControl._users) {
                        for (const [username, userData] of UserControl._users) {
                            if (userData.level === UserControl.USER_LEVEL.ADMIN || 
                                userData.level === UserControl.USER_LEVEL.DEFAULT_ADMIN) {
                                adminMembers.add(username);
                            }
                        }
                    }
                } catch (e) {
                    KernelLogger.warn("UserGroup", `获取管理员用户失败: ${e.message}`);
                }
            }
            
            UserGroup._groups.set('admins', {
                type: UserGroup.GROUP_TYPE.ADMIN_GROUP,
                members: adminMembers,
                createdAt: Date.now(),
                description: '系统管理员组，包含所有管理员用户'
            });
            createdCount++;
            KernelLogger.info("UserGroup", "已创建默认管理员组：admins");
        }
        
        // 创建默认用户组（包含所有普通用户）
        if (!UserGroup._groups.has('users')) {
            const userMembers = new Set();
            // 从 UserControl 获取所有普通用户
            if (typeof UserControl !== 'undefined') {
                try {
                    await UserControl.ensureInitialized();
                    if (UserControl._users) {
                        for (const [username, userData] of UserControl._users) {
                            if (userData.level === UserControl.USER_LEVEL.USER) {
                                userMembers.add(username);
                            }
                        }
                    }
                } catch (e) {
                    KernelLogger.warn("UserGroup", `获取普通用户失败: ${e.message}`);
                }
            }
            
            UserGroup._groups.set('users', {
                type: UserGroup.GROUP_TYPE.USER_GROUP,
                members: userMembers,
                createdAt: Date.now(),
                description: '普通用户组，包含所有普通用户'
            });
            createdCount++;
            KernelLogger.info("UserGroup", "已创建默认用户组：users");
        }
        
        // 只有在创建了新组时才保存
        if (createdCount > 0) {
            UserGroup._saveGroups();
            KernelLogger.info("UserGroup", `已创建 ${createdCount} 个默认组`);
        } else {
            KernelLogger.debug("UserGroup", "所有默认组已存在，无需创建");
        }
    }
    
    /**
     * 从存储加载组数据
     */
    static async _loadGroups() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("UserGroup", "LStorage 未加载，跳过用户组数据加载");
            return;
        }
        
        // 确保LStorage已初始化
        if (!LStorage._initialized) {
            KernelLogger.warn("UserGroup", "LStorage 未初始化，尝试初始化");
            await LStorage.init();
        }
        
        try {
            const saved = await LStorage.getSystemStorage('userControl.groups');
            if (saved && typeof saved === 'object') {
                KernelLogger.info("UserGroup", `开始加载用户组数据，存储中的组数: ${Object.keys(saved).length}`);
                let loadedCount = 0;
                for (const [groupName, groupData] of Object.entries(saved)) {
                    if (groupData && typeof groupData === 'object') {
                        // 确保所有必需字段都存在
                        const loadedGroupData = {
                            type: groupData.type || UserGroup.GROUP_TYPE.USER_GROUP,
                            members: new Set(Array.isArray(groupData.members) ? groupData.members : []),
                            createdAt: groupData.createdAt || Date.now(),
                            description: groupData.description || null
                        };
                        
                        UserGroup._groups.set(groupName, loadedGroupData);
                        loadedCount++;
                        
                        KernelLogger.debug("UserGroup", `加载组: ${groupName}, 类型: ${loadedGroupData.type}, 成员数: ${loadedGroupData.members.size}`);
                    } else {
                        KernelLogger.warn("UserGroup", `跳过无效的组数据: ${groupName}, 类型: ${typeof groupData}`);
                    }
                }
                KernelLogger.info("UserGroup", `已加载 ${loadedCount} 个组，内存中的组数: ${UserGroup._groups.size}`);
            } else {
                KernelLogger.debug("UserGroup", `没有保存的用户组数据或数据格式不正确: ${saved ? typeof saved : 'null/undefined'}`);
            }
        } catch (e) {
            KernelLogger.error("UserGroup", `加载用户组数据失败: ${e.message}`, e);
        }
    }
    
    /**
     * 保存组数据到存储
     */
    static _saveGroups() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.debug("UserGroup", "LStorage 未加载，跳过用户组数据保存");
            return;
        }
        
        // 检查权限（_saveGroups 由 UserGroup 内部调用，应该是安全的）
        // 权限检查已在各个公共 API 方法中完成，这里只检查是否为内核模块调用
        const stack = new Error().stack || '';
        const isKernelModuleCall = stack.includes('kernel/core/usercontrol/userGroup.js') || 
                                  stack.includes('kernel\\core\\usercontrol\\userGroup.js') ||
                                  stack.includes('kernel/core/usercontrol/userControl.js') ||
                                  stack.includes('kernel\\core\\usercontrol\\userControl.js');
        
        // 如果不是内核模块调用，尝试获取当前 PID 进行权限检查
        if (!isKernelModuleCall && typeof PermissionManager !== 'undefined') {
            const currentPid = UserGroup._getCurrentPid();
            if (currentPid && !PermissionManager.hasPermission(currentPid, PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL)) {
                KernelLogger.warn("UserGroup", `进程 ${currentPid} 缺少权限 SYSTEM_STORAGE_WRITE_USER_CONTROL，无法保存组数据`);
                return;
            }
        }
        
        // 使用异步保存，避免阻塞主线程
        Promise.resolve().then(async () => {
            try {
                const serialized = {};
                for (const [groupName, groupData] of UserGroup._groups) {
                    serialized[groupName] = {
                        type: groupData.type,
                        members: Array.from(groupData.members),
                        createdAt: groupData.createdAt,
                        description: groupData.description || null
                    };
                }
                
                // 保存到 LStorage（需要 SYSTEM_STORAGE_WRITE_USER_CONTROL 权限）
                const success = await LStorage.setSystemStorage('userControl.groups', serialized);
                if (success) {
                    KernelLogger.debug("UserGroup", `用户组数据已保存 (${Object.keys(serialized).length} 个组)`);
                } else {
                    KernelLogger.warn("UserGroup", `用户组数据保存可能失败，但会重试`);
                }
            } catch (e) {
                KernelLogger.error("UserGroup", `保存用户组数据失败: ${e.message}`, e);
            }
        }).catch(e => {
            KernelLogger.error("UserGroup", `异步保存用户组数据失败: ${e.message}`, e);
        });
    }
    
    // ==================== 组管理 API ====================
    
    /**
     * 创建组
     * @param {string} groupName 组名
     * @param {string} type 组类型（USER_GROUP 或 ADMIN_GROUP）
     * @param {string} description 组描述（可选）
     * @returns {boolean} 是否创建成功
     */
    static async createGroup(groupName, type = UserGroup.GROUP_TYPE.USER_GROUP, description = null) {
        await UserGroup.ensureInitialized();
        
        // 检查进程权限
        const accessCheck = UserGroup._checkAccessPermission('createGroup');
        if (!accessCheck.allowed) {
            KernelLogger.warn("UserGroup", `拒绝创建组操作（原因: ${accessCheck.reason}）`);
            return false;
        }
        
        // 检查权限：只有管理员可以创建组
        if (typeof UserControl !== 'undefined') {
            if (!UserControl.isAdmin()) {
                KernelLogger.warn("UserGroup", "只有管理员可以创建组");
                return false;
            }
            
            // 只有默认管理员可以创建管理员组
            if (type === UserGroup.GROUP_TYPE.ADMIN_GROUP && !UserControl.isDefaultAdmin()) {
                KernelLogger.warn("UserGroup", "只有默认管理员可以创建管理员组");
                return false;
            }
        }
        
        // 验证组名
        if (!groupName || typeof groupName !== 'string' || groupName.trim() === '') {
            KernelLogger.warn("UserGroup", "组名无效");
            return false;
        }
        
        groupName = groupName.trim();
        
        // 检查组是否已存在
        if (UserGroup._groups.has(groupName)) {
            KernelLogger.warn("UserGroup", `组 ${groupName} 已存在`);
            return false;
        }
        
        // 验证组类型
        if (type !== UserGroup.GROUP_TYPE.USER_GROUP && type !== UserGroup.GROUP_TYPE.ADMIN_GROUP) {
            KernelLogger.warn("UserGroup", `无效的组类型: ${type}`);
            return false;
        }
        
        // 创建组
        UserGroup._groups.set(groupName, {
            type: type,
            members: new Set(),
            createdAt: Date.now(),
            description: description || null
        });
        
        // 保存
        UserGroup._saveGroups();
        
        KernelLogger.info("UserGroup", `组 ${groupName} 已创建，类型: ${type}`);
        return true;
    }
    
    /**
     * 删除组
     * @param {string} groupName 组名
     * @returns {boolean} 是否删除成功
     */
    static async deleteGroup(groupName) {
        await UserGroup.ensureInitialized();
        
        // 检查进程权限
        const accessCheck = UserGroup._checkAccessPermission('deleteGroup');
        if (!accessCheck.allowed) {
            KernelLogger.warn("UserGroup", `拒绝删除组操作（原因: ${accessCheck.reason}）`);
            return false;
        }
        
        // 检查权限：只有默认管理员可以删除组
        if (typeof UserControl !== 'undefined') {
            if (!UserControl.isDefaultAdmin()) {
                KernelLogger.warn("UserGroup", "只有默认管理员可以删除组");
                return false;
            }
        }
        
        // 不能删除默认组
        if (groupName === 'admins' || groupName === 'users') {
            KernelLogger.warn("UserGroup", `不能删除默认组: ${groupName}`);
            return false;
        }
        
        // 检查组是否存在
        if (!UserGroup._groups.has(groupName)) {
            KernelLogger.warn("UserGroup", `组 ${groupName} 不存在`);
            return false;
        }
        
        // 删除组
        UserGroup._groups.delete(groupName);
        
        // 保存
        UserGroup._saveGroups();
        
        KernelLogger.info("UserGroup", `组 ${groupName} 已删除`);
        return true;
    }
    
    /**
     * 获取当前调用进程的PID
     * @returns {number|null} 进程ID，如果无法获取返回 null
     */
    static _getCurrentPid() {
        try {
            if (typeof ProcessManager === 'undefined') {
                return null;
            }
            
            // 尝试从调用栈中获取程序路径，然后查找对应的 PID
            const stack = new Error().stack;
            if (!stack) return null;
            
            // 查找程序路径（匹配 application/ 目录下的程序）
            const programPathMatch = stack.match(/service[\/\\]DISK[\/\\][CD][\/\\]application[\/\\]([^\/\\\s]+)/);
            if (programPathMatch) {
                const programName = programPathMatch[1].toLowerCase();
                // 查找对应的 PID（取第一个匹配的）
                if (ProcessManager.PROCESS_TABLE) {
                    for (const [pid, info] of ProcessManager.PROCESS_TABLE) {
                        if (info.programName && info.programName.toLowerCase() === programName) {
                            return pid;
                        }
                    }
                }
            }
            
            // 如果无法从调用栈获取，尝试使用 ProcessManager.getCurrentPid
            if (typeof ProcessManager.getCurrentPid === 'function') {
                try {
                    const pid = ProcessManager.getCurrentPid();
                    if (pid && pid > 0) {
                        return pid;
                    }
                } catch (e) {
                    KernelLogger.debug("UserGroup", `ProcessManager.getCurrentPid 失败: ${e.message}`);
                }
            }
            
            return null;
        } catch (e) {
            KernelLogger.debug("UserGroup", `获取当前PID失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 检查访问权限（用于写入操作）
     * @param {string} operation 操作名称
     * @returns {Object} {allowed: boolean, reason?: string}
     */
    static _checkAccessPermission(operation) {
        // 获取当前进程ID
        const currentPid = UserGroup._getCurrentPid();
        
        // 检查是否为内核模块调用（通过调用栈）
        const stack = new Error().stack || '';
        const isKernelModuleCall = stack.includes('kernel/core/usercontrol/userGroup.js') || 
                                  stack.includes('kernel\\core\\usercontrol\\userGroup.js') ||
                                  stack.includes('kernel/core/usercontrol/userControl.js') ||
                                  stack.includes('kernel\\core\\usercontrol\\userControl.js');
        
        // 内核模块调用：允许
        if (isKernelModuleCall) {
            return { allowed: true };
        }
        
        // 用户程序调用：需要写入权限
        if (currentPid && typeof PermissionManager !== 'undefined') {
            const hasPermission = PermissionManager.hasPermission(
                currentPid, 
                PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL
            );
            
            if (!hasPermission) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("UserGroup", `权限检查失败 - PID: ${currentPid}, 操作: ${operation}, 调用栈: ${stack.substring(0, 500)}`);
                }
                return {
                    allowed: false,
                    reason: `进程 ${currentPid} 缺少 SYSTEM_STORAGE_WRITE_USER_CONTROL 权限`
                };
            }
            
            return { allowed: true };
        }
        
        // 无法获取PID且不是内核模块调用
        if (!currentPid) {
            // 尝试从调用栈中查找程序信息
            const programMatch = stack.match(/application[\/\\]([^\/\\\s]+)/);
            const programName = programMatch ? programMatch[1] : '未知程序';
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug("UserGroup", `无法获取PID - 操作: ${operation}, 程序: ${programName}, 调用栈: ${stack.substring(0, 500)}`);
            }
            
            // 如果 PermissionManager 可用，尝试通过程序名查找 PID
            if (typeof PermissionManager !== 'undefined' && typeof ProcessManager !== 'undefined' && ProcessManager.PROCESS_TABLE) {
                // 尝试查找匹配的程序
                for (const [pid, info] of ProcessManager.PROCESS_TABLE) {
                    if (info.programName && info.programName.toLowerCase() === programName.toLowerCase()) {
                        const hasPermission = PermissionManager.hasPermission(
                            pid, 
                            PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL
                        );
                        
                        if (!hasPermission) {
                            return {
                                allowed: false,
                                reason: `进程 ${pid} (${programName}) 缺少 SYSTEM_STORAGE_WRITE_USER_CONTROL 权限`
                            };
                        }
                        
                        return { allowed: true };
                    }
                }
            }
            
            return {
                allowed: false,
                reason: `无法获取进程ID (程序: ${programName})`
            };
        }
        
        // PermissionManager 不可用：允许（降级方案）
        return { allowed: true };
    }
    
    /**
     * 检查读取权限（用于查询操作）
     * @param {string} operation 操作名称
     * @returns {boolean} 是否有权限
     */
    static _checkReadPermission(operation) {
        // 获取当前进程ID
        const currentPid = UserGroup._getCurrentPid();
        
        // 检查是否为内核模块调用（通过调用栈）
        const stack = new Error().stack || '';
        const isKernelModuleCall = stack.includes('kernel/core/usercontrol/userGroup.js') || 
                                  stack.includes('kernel\\core\\usercontrol\\userGroup.js') ||
                                  stack.includes('kernel/core/usercontrol/userControl.js') ||
                                  stack.includes('kernel\\core\\usercontrol\\userControl.js');
        
        // 内核模块调用：允许
        if (isKernelModuleCall) {
            return true;
        }
        
        // 用户程序调用：需要读取权限
        if (currentPid && typeof PermissionManager !== 'undefined') {
            const hasPermission = PermissionManager.hasPermission(
                currentPid, 
                PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL
            );
            
            if (!hasPermission) {
                KernelLogger.warn("UserGroup", `进程 ${currentPid} 尝试执行读取操作 "${operation}" 但缺少 SYSTEM_STORAGE_READ_USER_CONTROL 权限`);
                return false;
            }
            
            return true;
        }
        
        // 无法获取PID且不是内核模块调用：拒绝
        if (!currentPid) {
            KernelLogger.warn("UserGroup", `无法获取进程ID，拒绝读取操作 "${operation}"`);
            return false;
        }
        
        // PermissionManager 不可用：允许（降级方案）
        return true;
    }
    
    /**
     * 获取组信息
     * @param {string} groupName 组名
     * @returns {Object|null} 组信息，如果不存在返回 null
     */
    static async getGroup(groupName) {
        await UserGroup.ensureInitialized();
        
        // 检查读取权限
        if (!UserGroup._checkReadPermission('getGroup')) {
            return null;
        }
        
        if (!UserGroup._groups.has(groupName)) {
            return null;
        }
        
        const groupData = UserGroup._groups.get(groupName);
        return {
            name: groupName,
            type: groupData.type,
            members: Array.from(groupData.members),
            createdAt: groupData.createdAt,
            description: groupData.description
        };
    }
    
    /**
     * 获取所有组
     * @returns {Array} 所有组的列表
     */
    static async getAllGroups() {
        await UserGroup.ensureInitialized();
        
        // 检查读取权限
        if (!UserGroup._checkReadPermission('getAllGroups')) {
            return [];
        }
        
        const groups = [];
        for (const [groupName, groupData] of UserGroup._groups) {
            groups.push({
                name: groupName,
                type: groupData.type,
                members: Array.from(groupData.members),
                createdAt: groupData.createdAt,
                description: groupData.description
            });
        }
        
        return groups;
    }
    
    /**
     * 检查组是否存在
     * @param {string} groupName 组名
     * @returns {boolean} 是否存在
     */
    static async hasGroup(groupName) {
        await UserGroup.ensureInitialized();
        
        // 检查读取权限
        if (!UserGroup._checkReadPermission('hasGroup')) {
            return false;
        }
        
        return UserGroup._groups.has(groupName);
    }
    
    /**
     * 获取组类型
     * @param {string} groupName 组名
     * @returns {string|null} 组类型，如果不存在返回 null
     */
    static async getGroupType(groupName) {
        await UserGroup.ensureInitialized();
        
        // 检查读取权限
        if (!UserGroup._checkReadPermission('getGroupType')) {
            return null;
        }
        
        const group = UserGroup._groups.get(groupName);
        return group ? group.type : null;
    }
    
    // ==================== 成员管理 API ====================
    
    /**
     * 添加成员到组
     * @param {string} groupName 组名
     * @param {string} username 用户名
     * @returns {boolean} 是否添加成功
     */
    static async addMember(groupName, username) {
        await UserGroup.ensureInitialized();
        
        // 检查进程权限
        const accessCheck = UserGroup._checkAccessPermission('addMember');
        if (!accessCheck.allowed) {
            KernelLogger.warn("UserGroup", `拒绝添加成员操作（原因: ${accessCheck.reason}）`);
            return false;
        }
        
        // 检查权限：只有管理员可以管理组成员
        if (typeof UserControl !== 'undefined') {
            if (!UserControl.isAdmin()) {
                KernelLogger.warn("UserGroup", "只有管理员可以管理组成员");
                return false;
            }
        }
        
        // 验证用户名
        if (!username || typeof username !== 'string' || username.trim() === '') {
            KernelLogger.warn("UserGroup", "用户名无效");
            return false;
        }
        
        username = username.trim();
        
        // 检查用户是否存在（如果 UserControl 可用）
        if (typeof UserControl !== 'undefined') {
            await UserControl.ensureInitialized();
            if (!UserControl._users.has(username)) {
                KernelLogger.warn("UserGroup", `用户 ${username} 不存在`);
                return false;
            }
        }
        
        // 检查组是否存在
        if (!UserGroup._groups.has(groupName)) {
            KernelLogger.warn("UserGroup", `组 ${groupName} 不存在`);
            return false;
        }
        
        const group = UserGroup._groups.get(groupName);
        
        // 添加成员
        if (group.members.has(username)) {
            KernelLogger.debug("UserGroup", `用户 ${username} 已在组 ${groupName} 中`);
            return true; // 已存在，视为成功
        }
        
        group.members.add(username);
        
        // 保存
        UserGroup._saveGroups();
        
        KernelLogger.info("UserGroup", `用户 ${username} 已添加到组 ${groupName}`);
        return true;
    }
    
    /**
     * 从组中移除成员
     * @param {string} groupName 组名
     * @param {string} username 用户名
     * @returns {boolean} 是否移除成功
     */
    static async removeMember(groupName, username) {
        await UserGroup.ensureInitialized();
        
        // 检查进程权限
        const accessCheck = UserGroup._checkAccessPermission('removeMember');
        if (!accessCheck.allowed) {
            KernelLogger.warn("UserGroup", `拒绝移除成员操作（原因: ${accessCheck.reason}）`);
            return false;
        }
        
        // 检查权限：只有管理员可以管理组成员
        if (typeof UserControl !== 'undefined') {
            if (!UserControl.isAdmin()) {
                KernelLogger.warn("UserGroup", "只有管理员可以管理组成员");
                return false;
            }
        }
        
        // 检查组是否存在
        if (!UserGroup._groups.has(groupName)) {
            KernelLogger.warn("UserGroup", `组 ${groupName} 不存在`);
            return false;
        }
        
        const group = UserGroup._groups.get(groupName);
        
        // 移除成员
        if (!group.members.has(username)) {
            KernelLogger.debug("UserGroup", `用户 ${username} 不在组 ${groupName} 中`);
            return true; // 不存在，视为成功
        }
        
        group.members.delete(username);
        
        // 保存
        UserGroup._saveGroups();
        
        KernelLogger.info("UserGroup", `用户 ${username} 已从组 ${groupName} 中移除`);
        return true;
    }
    
    /**
     * 获取组成员列表
     * @param {string} groupName 组名
     * @returns {Array} 成员列表
     */
    static async getMembers(groupName) {
        await UserGroup.ensureInitialized();
        
        // 检查读取权限
        if (!UserGroup._checkReadPermission('getMembers')) {
            return [];
        }
        
        if (!UserGroup._groups.has(groupName)) {
            return [];
        }
        
        const group = UserGroup._groups.get(groupName);
        return Array.from(group.members);
    }
    
    /**
     * 检查用户是否在组中
     * @param {string} groupName 组名
     * @param {string} username 用户名
     * @returns {boolean} 是否在组中
     */
    static async isMember(groupName, username) {
        await UserGroup.ensureInitialized();
        
        // 检查读取权限
        if (!UserGroup._checkReadPermission('isMember')) {
            return false;
        }
        
        if (!UserGroup._groups.has(groupName)) {
            return false;
        }
        
        const group = UserGroup._groups.get(groupName);
        return group.members.has(username);
    }
    
    /**
     * 获取用户所在的所有组
     * @param {string} username 用户名
     * @returns {Array} 组名列表
     */
    static async getUserGroups(username) {
        await UserGroup.ensureInitialized();
        
        // 检查读取权限
        if (!UserGroup._checkReadPermission('getUserGroups')) {
            return [];
        }
        
        const groups = [];
        for (const [groupName, groupData] of UserGroup._groups) {
            if (groupData.members.has(username)) {
                groups.push(groupName);
            }
        }
        
        return groups;
    }
    
    /**
     * 获取组中的成员数量
     * @param {string} groupName 组名
     * @returns {number} 成员数量
     */
    static async getMemberCount(groupName) {
        await UserGroup.ensureInitialized();
        
        // 检查读取权限
        if (!UserGroup._checkReadPermission('getMemberCount')) {
            return 0;
        }
        
        if (!UserGroup._groups.has(groupName)) {
            return 0;
        }
        
        const group = UserGroup._groups.get(groupName);
        return group.members.size;
    }
    
    // ==================== 批量操作 API ====================
    
    /**
     * 批量添加成员到组
     * @param {string} groupName 组名
     * @param {Array<string>} usernames 用户名列表
     * @returns {Object} 操作结果 {success: number, failed: number, errors: Array}
     */
    static async addMembers(groupName, usernames) {
        await UserGroup.ensureInitialized();
        
        // 检查进程权限（批量操作也需要权限）
        const accessCheck = UserGroup._checkAccessPermission('addMembers');
        if (!accessCheck.allowed) {
            KernelLogger.warn("UserGroup", `拒绝批量添加成员操作（原因: ${accessCheck.reason}）`);
            return {
                success: 0,
                failed: usernames.length,
                errors: [`批量操作被拒绝: ${accessCheck.reason}`]
            };
        }
        
        const result = {
            success: 0,
            failed: 0,
            errors: []
        };
        
        for (const username of usernames) {
            try {
                const success = await UserGroup.addMember(groupName, username);
                if (success) {
                    result.success++;
                } else {
                    result.failed++;
                    result.errors.push(`添加 ${username} 失败`);
                }
            } catch (e) {
                result.failed++;
                result.errors.push(`添加 ${username} 失败: ${e.message}`);
            }
        }
        
        return result;
    }
    
    /**
     * 批量从组中移除成员
     * @param {string} groupName 组名
     * @param {Array<string>} usernames 用户名列表
     * @returns {Object} 操作结果 {success: number, failed: number, errors: Array}
     */
    static async removeMembers(groupName, usernames) {
        await UserGroup.ensureInitialized();
        
        // 检查进程权限（批量操作也需要权限）
        const accessCheck = UserGroup._checkAccessPermission('removeMembers');
        if (!accessCheck.allowed) {
            KernelLogger.warn("UserGroup", `拒绝批量移除成员操作（原因: ${accessCheck.reason}）`);
            return {
                success: 0,
                failed: usernames.length,
                errors: [`批量操作被拒绝: ${accessCheck.reason}`]
            };
        }
        
        const result = {
            success: 0,
            failed: 0,
            errors: []
        };
        
        for (const username of usernames) {
            try {
                const success = await UserGroup.removeMember(groupName, username);
                if (success) {
                    result.success++;
                } else {
                    result.failed++;
                    result.errors.push(`移除 ${username} 失败`);
                }
            } catch (e) {
                result.failed++;
                result.errors.push(`移除 ${username} 失败: ${e.message}`);
            }
        }
        
        return result;
    }
    
    // ==================== 同步 API ====================
    
    /**
     * 同步默认组（根据 UserControl 中的用户级别更新默认组）
     * 将管理员用户添加到 admins 组，将普通用户添加到 users 组
     * @returns {boolean} 是否同步成功
     */
    static async syncDefaultGroups() {
        await UserGroup.ensureInitialized();
        
        // 检查进程权限
        const accessCheck = UserGroup._checkAccessPermission('syncDefaultGroups');
        if (!accessCheck.allowed) {
            KernelLogger.warn("UserGroup", `拒绝同步默认组操作（原因: ${accessCheck.reason}）`);
            return false;
        }
        
        // 检查权限：只有管理员可以同步默认组
        if (typeof UserControl !== 'undefined') {
            if (!UserControl.isAdmin()) {
                KernelLogger.warn("UserGroup", "只有管理员可以同步默认组");
                return false;
            }
        }
        
        if (typeof UserControl === 'undefined' || !UserControl._users) {
            KernelLogger.warn("UserGroup", "UserControl 不可用，无法同步默认组");
            return false;
        }
        
        await UserControl.ensureInitialized();
        
        // 更新 admins 组
        const adminsGroup = UserGroup._groups.get('admins');
        if (adminsGroup) {
            adminsGroup.members.clear();
            for (const [username, userData] of UserControl._users) {
                if (userData.level === UserControl.USER_LEVEL.ADMIN || 
                    userData.level === UserControl.USER_LEVEL.DEFAULT_ADMIN) {
                    adminsGroup.members.add(username);
                }
            }
        }
        
        // 更新 users 组
        const usersGroup = UserGroup._groups.get('users');
        if (usersGroup) {
            usersGroup.members.clear();
            for (const [username, userData] of UserControl._users) {
                if (userData.level === UserControl.USER_LEVEL.USER) {
                    usersGroup.members.add(username);
                }
            }
        }
        
        // 保存
        UserGroup._saveGroups();
        
        KernelLogger.info("UserGroup", "默认组已同步");
        return true;
    }
    
    /**
     * 更新组描述
     * @param {string} groupName 组名
     * @param {string} description 新描述
     * @returns {boolean} 是否更新成功
     */
    static async updateGroupDescription(groupName, description) {
        await UserGroup.ensureInitialized();
        
        // 检查进程权限
        const accessCheck = UserGroup._checkAccessPermission('updateGroupDescription');
        if (!accessCheck.allowed) {
            KernelLogger.warn("UserGroup", `拒绝更新组描述操作（原因: ${accessCheck.reason}）`);
            return false;
        }
        
        // 检查权限：只有管理员可以更新组描述
        if (typeof UserControl !== 'undefined') {
            if (!UserControl.isAdmin()) {
                KernelLogger.warn("UserGroup", "只有管理员可以更新组描述");
                return false;
            }
        }
        
        // 检查组是否存在
        if (!UserGroup._groups.has(groupName)) {
            KernelLogger.warn("UserGroup", `组 ${groupName} 不存在`);
            return false;
        }
        
        const group = UserGroup._groups.get(groupName);
        group.description = description || null;
        
        // 保存
        UserGroup._saveGroups();
        
        KernelLogger.info("UserGroup", `组 ${groupName} 的描述已更新`);
        return true;
    }
}

// 导出类
if (typeof window !== 'undefined') {
    window.UserGroup = UserGroup;
}
if (typeof globalThis !== 'undefined') {
    globalThis.UserGroup = UserGroup;
}

// 注册到POOL（如果可用）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "UserGroup", UserGroup);
    } catch (e) {
        KernelLogger.warn("UserGroup", `注册到POOL失败: ${e.message}`);
    }
}

// 发布依赖配置信号（通知依赖系统模块已加载）
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/core/usercontrol/userGroup.js");
} else {
    const publishWhenReady = () => {
        if (typeof DependencyConfig !== 'undefined') {
            DependencyConfig.publishSignal("../kernel/core/usercontrol/userGroup.js");
        } else {
            setTimeout(publishWhenReady, 10);
        }
    };
    publishWhenReady();
}

// 自动初始化（异步，不阻塞模块加载）
if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        UserGroup.init().catch(e => {
            KernelLogger.error("UserGroup", `自动初始化失败: ${e.message}`, e);
        });
    });
} else {
    // 异步初始化，不阻塞
    UserGroup.init().catch(e => {
        KernelLogger.error("UserGroup", `自动初始化失败: ${e.message}`, e);
    });
}

