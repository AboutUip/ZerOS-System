// 计划任务管理器
// 负责管理系统的计划任务，支持在特定情况（系统启动完成、系统关闭前等）或特定时间运行程序
// 计划任务数据持久化存储在 LocalSData.json 中

KernelLogger.info("ScheduleTaskManager", "模块初始化");

class ScheduleTaskManager {
    // ==================== 任务触发类型枚举 ====================
    
    /**
     * 任务触发类型
     */
    static TRIGGER_TYPE = {
        SYSTEM_STARTUP: 'SYSTEM_STARTUP',      // 系统启动完成
        SYSTEM_SHUTDOWN: 'SYSTEM_SHUTDOWN',    // 系统关闭前
        SPECIFIC_TIME: 'SPECIFIC_TIME',         // 特定时间
        TIME_RANGE: 'TIME_RANGE',              // 时间区间
        INTERVAL: 'INTERVAL'                   // 间隔时间（周期性任务）
    };
    
    // ==================== 初始化标志 ====================
    
    static _initialized = false;
    static _initializing = false;
    
    // ==================== 内部状态 ====================
    
    /**
     * 计划任务列表
     * Map<taskId, taskInfo>
     * taskInfo: {
     *     id: string,                    // 任务ID
     *     taskType: string,               // 任务类型：'program' | 'command' | 'service'
     *     programName: string,            // 程序名称（taskType === 'program' 时必需）
     *     command: string,                // 命令（taskType === 'command' 时必需）
     *     serviceId: string,              // 服务 ID（taskType === 'service' 时必需）
     *     serviceAction: string,          // 服务操作：'start' | 'stop'（taskType === 'service' 时，默认 'start'）
     *     triggerType: string,            // 触发类型
     *     triggerConfig: Object,          // 触发配置
     *     enabled: boolean,               // 是否启用
     *     createdAt: number,              // 创建时间戳
     *     updatedAt: number,              // 更新时间戳
     *     lastRunAt: number,              // 最后运行时间戳
     *     runCount: number,               // 运行次数
     *     createdBy: string,               // 创建者（程序名称或PID）
     *     requiresStartupPermission: boolean  // 是否需要系统启动权限
     * }
     */
    static _tasks = new Map();
    
    /**
     * 任务类型枚举
     */
    static TASK_TYPE = {
        PROGRAM: 'program',    // 执行程序
        COMMAND: 'command',    // 执行命令
        SERVICE: 'service'     // 服务（ServerExpansion 服务：启动/停止及暴露的 API）
    };

    /**
     * 服务任务操作类型
     */
    static SERVICE_ACTION = {
        START: 'start',
        STOP: 'stop'
    };
    
    /**
     * 定时器ID映射
     * Map<taskId, timerId>
     */
    static _timers = new Map();
    
    /**
     * 系统启动完成标志
     */
    static _systemStarted = false;
    
    /**
     * 系统关闭中标志
     */
    static _systemShuttingDown = false;
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化计划任务管理器
     * @returns {Promise<void>}
     */
    static async init() {
        if (ScheduleTaskManager._initialized) {
            KernelLogger.debug("ScheduleTaskManager", "已初始化，跳过");
            return;
        }
        if (ScheduleTaskManager._initializing) {
            KernelLogger.debug("ScheduleTaskManager", "正在初始化，跳过重复调用");
            return;
        }
        ScheduleTaskManager._initializing = true;
        
        KernelLogger.info("ScheduleTaskManager", "初始化计划任务管理器");
        
        try {
            // 等待 LStorage 初始化
            if (typeof LStorage !== 'undefined') {
                let retries = 0;
                while (retries < 10 && !LStorage._initialized) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    retries++;
                }
            }
            
            // 加载计划任务数据
            await ScheduleTaskManager._loadTasks();
            
            // 注册到 POOL
            ScheduleTaskManager._registerToPool();
            
            // 监听系统事件
            ScheduleTaskManager._setupSystemListeners();
            
            ScheduleTaskManager._initialized = true;
            KernelLogger.info("ScheduleTaskManager", "计划任务管理器初始化完成");
        } catch (error) {
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SYSTEM,
                    `ScheduleTaskManager.初始化失败: ${error.message}`,
                    { error: error.message, stack: error.stack }
                ).catch(() => { });
            } else {
                KernelLogger.error("ScheduleTaskManager", `初始化失败: ${error.message}`, error);
            }
            ScheduleTaskManager._initialized = true; // 即使失败也标记为已初始化，允许后续操作
        } finally {
            ScheduleTaskManager._initializing = false;
        }
    }
    
    /**
     * 设置系统事件监听
     */
    static _setupSystemListeners() {
        // 监听系统启动完成事件：仅当用户登录后（__IS_SYSTEM_LOADING__ 为 false）才执行 SYSTEM_STARTUP 任务，未登录不启动任何自启
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            const checkSystemStarted = () => {
                if (typeof POOL !== 'undefined' && typeof POOL.__IS_SYSTEM_LOADING__ === 'function') {
                    if (!POOL.__IS_SYSTEM_LOADING__()) {
                        ScheduleTaskManager._onSystemStartup();
                    } else {
                        setTimeout(checkSystemStarted, 500);
                    }
                } else {
                    setTimeout(() => ScheduleTaskManager._onSystemStartup(), 2000);
                }
            };
            setTimeout(checkSystemStarted, 1000);
        }
        
        // 监听页面卸载事件（系统关闭）
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                ScheduleTaskManager._onSystemShutdown();
            });
        }
    }
    
    /**
     * 系统启动完成处理
     */
    static async _onSystemStartup() {
        if (ScheduleTaskManager._systemStarted) {
            return;
        }
        
        ScheduleTaskManager._systemStarted = true;
        
        // 检查是否处于安全模式（安全模式下不执行计划任务）
        let isSafeMode = false;
        try {
            if (typeof sessionStorage !== 'undefined') {
                const safeModeFlag = sessionStorage.getItem('__ZEROS_SAFE_MODE__');
                isSafeMode = safeModeFlag === 'true';
            }
        } catch (e) {
            // sessionStorage可能不可用，忽略错误
        }
        
        if (isSafeMode) {
            KernelLogger.info("ScheduleTaskManager", "安全模式已启用，跳过计划任务执行");
            return;
        }
        
        // 执行前重新从 LStorage 加载任务列表，避免 init 时 LStorage/磁盘未就绪导致列表为空
        await ScheduleTaskManager._loadTasks();
        
        KernelLogger.info("ScheduleTaskManager", "系统启动完成，执行启动任务");
        
        // 执行所有系统启动任务
        for (const [taskId, task] of ScheduleTaskManager._tasks) {
            if (task.enabled && 
                task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.SYSTEM_STARTUP) {
                try {
                    await ScheduleTaskManager._executeTask(taskId);
                } catch (error) {
                    KernelLogger.error("ScheduleTaskManager", `执行启动任务失败: ${taskId}`, error);
                }
            }
        }
    }
    
    /**
     * 系统关闭前处理
     */
    static async _onSystemShutdown() {
        if (ScheduleTaskManager._systemShuttingDown) {
            return;
        }
        
        ScheduleTaskManager._systemShuttingDown = true;
        KernelLogger.info("ScheduleTaskManager", "系统关闭中，执行关闭任务");
        
        // 执行所有系统关闭任务
        const shutdownTasks = [];
        for (const [taskId, task] of ScheduleTaskManager._tasks) {
            if (task.enabled && 
                task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.SYSTEM_SHUTDOWN) {
                shutdownTasks.push(ScheduleTaskManager._executeTask(taskId));
            }
        }
        
        // 等待所有关闭任务完成（最多等待5秒）
        try {
            await Promise.race([
                Promise.all(shutdownTasks),
                new Promise(resolve => setTimeout(resolve, 5000))
            ]);
        } catch (error) {
            KernelLogger.error("ScheduleTaskManager", "执行关闭任务时出错", error);
        }
    }
    
    /**
     * 注册到 POOL
     */
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            POOL.__SET__("KERNEL_GLOBAL_POOL", "ScheduleTaskManager", ScheduleTaskManager);
            KernelLogger.debug("ScheduleTaskManager", "已注册到 POOL");
        }
    }
    
    // ==================== 数据持久化 ====================
    
    /**
     * 加载计划任务数据
     * @returns {Promise<void>}
     */
    static async _loadTasks() {
        try {
            if (typeof LStorage === 'undefined') {
                KernelLogger.warn("ScheduleTaskManager", "LStorage 未加载，无法加载计划任务");
                return;
            }
            
            const tasksData = await LStorage.getSystemStorage('scheduleTaskManager.tasks');
            if (!tasksData || !Array.isArray(tasksData)) {
                KernelLogger.debug("ScheduleTaskManager", "未找到计划任务数据，使用空列表");
                ScheduleTaskManager._tasks.clear();
                return;
            }
            
            // 恢复任务列表
            ScheduleTaskManager._tasks.clear();
            for (const task of tasksData) {
                // 验证任务数据完整性
                if (!task || !task.id) {
                    KernelLogger.warn("ScheduleTaskManager", "跳过无效的任务数据", task);
                    continue;
                }
                ScheduleTaskManager._tasks.set(task.id, task);
            }
            
            KernelLogger.info("ScheduleTaskManager", `已加载 ${ScheduleTaskManager._tasks.size} 个计划任务`);
            
            // 启动所有启用的时间任务
            ScheduleTaskManager._startTimeTasks();
        } catch (error) {
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SYSTEM,
                    `ScheduleTaskManager.加载计划任务失败: ${error.message}`,
                    { error: error.message, stack: error.stack }
                ).catch(() => { });
            } else {
                KernelLogger.error("ScheduleTaskManager", `加载计划任务失败: ${error.message}`, error);
            }
            ScheduleTaskManager._tasks.clear();
        }
    }
    
    /**
     * 保存计划任务数据
     * @returns {Promise<void>}
     */
    static async _saveTasks() {
        try {
            if (typeof LStorage === 'undefined') {
                KernelLogger.warn("ScheduleTaskManager", "LStorage 未加载，无法保存计划任务");
                return;
            }
            
            // 转换为数组
            const tasksArray = Array.from(ScheduleTaskManager._tasks.values());
            
            // 保存到 LStorage（异步）
            await LStorage.setSystemStorage('scheduleTaskManager.tasks', tasksArray);
            
            KernelLogger.debug("ScheduleTaskManager", `已保存 ${tasksArray.length} 个计划任务`);
        } catch (error) {
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SYSTEM,
                    `ScheduleTaskManager.保存计划任务失败: ${error.message}`,
                    { error: error.message, stack: error.stack }
                ).catch(() => { });
            } else {
                KernelLogger.error("ScheduleTaskManager", `保存计划任务失败: ${error.message}`, error);
            }
            throw error; // 重新抛出错误，让调用者知道保存失败
        }
    }
    
    // ==================== 任务管理 ====================
    
    /**
     * 创建计划任务
     * @param {Object} taskConfig 任务配置
     * @param {string} taskConfig.programName 程序名称
     * @param {string} taskConfig.triggerType 触发类型
     * @param {Object} taskConfig.triggerConfig 触发配置
     * @param {boolean} taskConfig.enabled 是否启用（默认 true）
     * @param {string} createdBy 创建者（程序名称或PID）
     * @param {boolean} requiresStartupPermission 是否需要系统启动权限
     * @returns {Promise<string>} 任务ID
     */
    static async createTask(taskConfig, createdBy = 'system', requiresStartupPermission = false) {
        if (!ScheduleTaskManager._initialized) {
            throw new Error("ScheduleTaskManager 未初始化");
        }
        
        // 参数验证
        if (!taskConfig || typeof taskConfig !== 'object') {
            throw new Error("任务配置必须是对象");
        }
        
        // 确定任务类型（默认为 'program' 以保持向后兼容）
        const taskType = taskConfig.taskType || ScheduleTaskManager.TASK_TYPE.PROGRAM;
        
        if (!Object.values(ScheduleTaskManager.TASK_TYPE).includes(taskType)) {
            throw new Error(`无效的任务类型: ${taskType}`);
        }
        
        // 根据任务类型验证必需字段
        if (taskType === ScheduleTaskManager.TASK_TYPE.PROGRAM) {
            if (!taskConfig.programName || typeof taskConfig.programName !== 'string') {
                throw new Error("程序名称必须是字符串");
            }
        } else if (taskType === ScheduleTaskManager.TASK_TYPE.COMMAND) {
            if (!taskConfig.command || typeof taskConfig.command !== 'string') {
                throw new Error("命令必须是字符串");
            }
        } else if (taskType === ScheduleTaskManager.TASK_TYPE.SERVICE) {
            if (!taskConfig.serviceId || typeof taskConfig.serviceId !== 'string') {
                throw new Error("服务 ID 必须是字符串");
            }
            const action = taskConfig.serviceAction || ScheduleTaskManager.SERVICE_ACTION.START;
            if (action !== ScheduleTaskManager.SERVICE_ACTION.START && action !== ScheduleTaskManager.SERVICE_ACTION.STOP) {
                throw new Error("服务操作必须是 'start' 或 'stop'");
            }
        }
        
        if (!taskConfig.triggerType || !Object.values(ScheduleTaskManager.TRIGGER_TYPE).includes(taskConfig.triggerType)) {
            throw new Error(`无效的触发类型: ${taskConfig.triggerType}`);
        }
        
        // 验证触发配置
        ScheduleTaskManager._validateTriggerConfig(taskConfig.triggerType, taskConfig.triggerConfig);
        
        // 生成任务ID
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 创建任务对象
        const task = {
            id: taskId,
            taskType: taskType,
            triggerType: taskConfig.triggerType,
            triggerConfig: taskConfig.triggerConfig || {},
            enabled: taskConfig.enabled !== false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastRunAt: 0,
            runCount: 0,
            createdBy: createdBy,
            requiresStartupPermission: requiresStartupPermission
        };
        
        // 根据任务类型设置相应字段
        if (taskType === ScheduleTaskManager.TASK_TYPE.PROGRAM) {
            task.programName = taskConfig.programName;
            // 是否以后台方式启动程序（默认 true：不显示在任务栏；false：前台显示）
            task.runInBackground = taskConfig.runInBackground !== false;
        } else if (taskType === ScheduleTaskManager.TASK_TYPE.COMMAND) {
            task.command = taskConfig.command;
        } else if (taskType === ScheduleTaskManager.TASK_TYPE.SERVICE) {
            task.serviceId = taskConfig.serviceId;
            task.serviceAction = taskConfig.serviceAction || ScheduleTaskManager.SERVICE_ACTION.START;
        }
        
        // 添加到任务列表
        ScheduleTaskManager._tasks.set(taskId, task);
        
        // 保存到持久化存储
        await ScheduleTaskManager._saveTasks();
        
        // 如果是时间任务，立即启动
        if (task.enabled && (
            task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.SPECIFIC_TIME ||
            task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.TIME_RANGE ||
            task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.INTERVAL
        )) {
            ScheduleTaskManager._startTimeTask(taskId);
        }
        
        KernelLogger.info("ScheduleTaskManager", `创建计划任务: ${taskId}`, task);
        
        return taskId;
    }
    
    /**
     * 验证触发配置
     * @param {string} triggerType 触发类型
     * @param {Object} triggerConfig 触发配置
     */
    static _validateTriggerConfig(triggerType, triggerConfig) {
        if (!triggerConfig || typeof triggerConfig !== 'object') {
            throw new Error("触发配置必须是对象");
        }
        
        switch (triggerType) {
            case ScheduleTaskManager.TRIGGER_TYPE.SPECIFIC_TIME:
                if (!triggerConfig.time || typeof triggerConfig.time !== 'string') {
                    throw new Error("特定时间任务必须提供 time 配置（格式: HH:mm）");
                }
                if (!/^\d{2}:\d{2}$/.test(triggerConfig.time)) {
                    throw new Error("时间格式错误，应为 HH:mm（如 09:30）");
                }
                break;
                
            case ScheduleTaskManager.TRIGGER_TYPE.TIME_RANGE:
                if (!triggerConfig.startTime || !triggerConfig.endTime) {
                    throw new Error("时间区间任务必须提供 startTime 和 endTime 配置");
                }
                if (!/^\d{2}:\d{2}$/.test(triggerConfig.startTime) || !/^\d{2}:\d{2}$/.test(triggerConfig.endTime)) {
                    throw new Error("时间格式错误，应为 HH:mm（如 09:30）");
                }
                if (!triggerConfig.interval || typeof triggerConfig.interval !== 'number' || triggerConfig.interval < 1) {
                    throw new Error("时间区间任务必须提供 interval 配置（分钟数，至少1分钟）");
                }
                break;
                
            case ScheduleTaskManager.TRIGGER_TYPE.INTERVAL:
                if (!triggerConfig.interval || typeof triggerConfig.interval !== 'number' || triggerConfig.interval < 1) {
                    throw new Error("间隔任务必须提供 interval 配置（分钟数，至少1分钟）");
                }
                break;
                
            case ScheduleTaskManager.TRIGGER_TYPE.SYSTEM_STARTUP:
            case ScheduleTaskManager.TRIGGER_TYPE.SYSTEM_SHUTDOWN:
                // 系统事件任务不需要额外配置
                break;
                
            default:
                throw new Error(`未知的触发类型: ${triggerType}`);
        }
    }
    
    /**
     * 删除计划任务
     * @param {string} taskId 任务ID
     * @returns {Promise<boolean>} 是否成功
     */
    static async deleteTask(taskId) {
        if (!ScheduleTaskManager._initialized) {
            throw new Error("ScheduleTaskManager 未初始化");
        }
        
        if (!taskId || typeof taskId !== 'string') {
            throw new Error("任务ID必须是字符串");
        }
        
        const task = ScheduleTaskManager._tasks.get(taskId);
        if (!task) {
            throw new Error(`任务不存在: ${taskId}`);
        }
        
        // 停止时间任务
        ScheduleTaskManager._stopTimeTask(taskId);
        
        // 从任务列表删除
        ScheduleTaskManager._tasks.delete(taskId);
        
        // 保存到持久化存储
        await ScheduleTaskManager._saveTasks();
        
        KernelLogger.info("ScheduleTaskManager", `删除计划任务: ${taskId}`);
        
        return true;
    }
    
    /**
     * 更新计划任务
     * @param {string} taskId 任务ID
     * @param {Object} updates 更新内容
     * @returns {Promise<boolean>} 是否成功
     */
    static async updateTask(taskId, updates) {
        if (!ScheduleTaskManager._initialized) {
            throw new Error("ScheduleTaskManager 未初始化");
        }
        
        if (!taskId || typeof taskId !== 'string') {
            throw new Error("任务ID必须是字符串");
        }
        
        const task = ScheduleTaskManager._tasks.get(taskId);
        if (!task) {
            throw new Error(`任务不存在: ${taskId}`);
        }
        
        // 更新任务属性
        if (updates.enabled !== undefined) {
            task.enabled = Boolean(updates.enabled);
        }

        if (updates.triggerConfig !== undefined) {
            ScheduleTaskManager._validateTriggerConfig(task.triggerType, updates.triggerConfig);
            task.triggerConfig = updates.triggerConfig;
        }

        if (task.taskType === ScheduleTaskManager.TASK_TYPE.PROGRAM) {
            if (updates.programName !== undefined) {
                if (typeof updates.programName !== 'string') {
                    throw new Error("程序名称必须是字符串");
                }
                task.programName = updates.programName;
            }
            if (updates.runInBackground !== undefined) {
                task.runInBackground = Boolean(updates.runInBackground);
            }
        } else if (task.taskType === ScheduleTaskManager.TASK_TYPE.SERVICE) {
            if (updates.serviceId !== undefined) {
                if (typeof updates.serviceId !== 'string') {
                    throw new Error("服务 ID 必须是字符串");
                }
                task.serviceId = updates.serviceId;
            }
            if (updates.serviceAction !== undefined) {
                if (updates.serviceAction !== ScheduleTaskManager.SERVICE_ACTION.START && updates.serviceAction !== ScheduleTaskManager.SERVICE_ACTION.STOP) {
                    throw new Error("服务操作必须是 'start' 或 'stop'");
                }
                task.serviceAction = updates.serviceAction;
            }
        }

        task.updatedAt = Date.now();
        
        // 重新启动时间任务
        ScheduleTaskManager._stopTimeTask(taskId);
        if (task.enabled && (
            task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.SPECIFIC_TIME ||
            task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.TIME_RANGE ||
            task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.INTERVAL
        )) {
            ScheduleTaskManager._startTimeTask(taskId);
        }
        
        // 保存到持久化存储
        await ScheduleTaskManager._saveTasks();
        
        KernelLogger.info("ScheduleTaskManager", `更新计划任务: ${taskId}`, updates);
        
        return true;
    }
    
    /**
     * 获取计划任务
     * @param {string} taskId 任务ID
     * @returns {Object|null} 任务信息
     */
    static getTask(taskId) {
        if (!ScheduleTaskManager._initialized) {
            return null;
        }
        
        const task = ScheduleTaskManager._tasks.get(taskId);
        if (!task) {
            return null;
        }
        
        // 返回副本，防止外部修改
        return { ...task };
    }
    
    /**
     * 获取所有计划任务
     * @returns {Array} 任务列表
     */
    static getAllTasks() {
        try {
            // 如果未初始化，尝试初始化（同步等待初始化完成）
            if (!ScheduleTaskManager._initialized && !ScheduleTaskManager._initializing) {
                // 如果初始化还未开始，返回空数组（避免阻塞）
                // 初始化是异步的，程序应该等待初始化完成后再调用
                KernelLogger.debug("ScheduleTaskManager", "未初始化，返回空任务列表");
                return [];
            }
            
            // 如果正在初始化，等待初始化完成
            if (ScheduleTaskManager._initializing) {
                KernelLogger.debug("ScheduleTaskManager", "正在初始化，返回空任务列表");
                return [];
            }
            
            // 确保返回数组
            if (!ScheduleTaskManager._tasks || typeof ScheduleTaskManager._tasks.values !== 'function') {
                KernelLogger.warn("ScheduleTaskManager", "_tasks 未正确初始化，返回空数组");
                return [];
            }
            
            const tasks = Array.from(ScheduleTaskManager._tasks.values()).map(task => {
                try {
                    return { ...task };
                } catch (e) {
                    KernelLogger.warn("ScheduleTaskManager", `序列化任务失败: ${e.message}`);
                    return null;
                }
            }).filter(task => task !== null);
            
            return tasks;
        } catch (error) {
            KernelLogger.error("ScheduleTaskManager", `getAllTasks 失败: ${error.message}`, error);
            return [];
        }
    }
    
    /**
     * 启用/禁用计划任务
     * @param {string} taskId 任务ID
     * @param {boolean} enabled 是否启用
     * @returns {Promise<boolean>} 是否成功
     */
    static async setTaskEnabled(taskId, enabled) {
        return await ScheduleTaskManager.updateTask(taskId, { enabled });
    }
    
    // ==================== 任务执行 ====================
    
    /**
     * 执行计划任务
     * @param {string} taskId 任务ID
     * @returns {Promise<void>}
     */
    static async _executeTask(taskId) {
        const task = ScheduleTaskManager._tasks.get(taskId);
        if (!task) {
            KernelLogger.warn("ScheduleTaskManager", `任务不存在: ${taskId}`);
            return;
        }
        
        if (!task.enabled) {
            KernelLogger.debug("ScheduleTaskManager", `任务已禁用，跳过执行: ${taskId}`);
            return;
        }
        
        const taskType = task.taskType || ScheduleTaskManager.TASK_TYPE.PROGRAM; // 向后兼容
        
        KernelLogger.info("ScheduleTaskManager", `执行计划任务: ${taskId}`, {
            taskType: taskType,
            programName: task.programName,
            command: task.command,
            triggerType: task.triggerType
        });
        
        try {
            if (taskType === ScheduleTaskManager.TASK_TYPE.PROGRAM) {
                // 执行程序
                if (typeof ProcessManager === 'undefined' || typeof ApplicationAssetManager === 'undefined') {
                    throw new Error("ProcessManager 或 ApplicationAssetManager 未加载");
                }
                
                const programName = task.programName;
                if (!programName) {
                    throw new Error("程序名称未定义");
                }
                
                const programInfo = ApplicationAssetManager.getProgramInfo(programName);
                if (!programInfo) {
                    throw new Error(`程序不存在: ${programName}`);
                }
                
                // 启动程序（计划任务默认以后台方式启动，不显示在任务栏；任务可配置 runInBackground: false 改为前台）
                const runInBackground = task.runInBackground !== false;
                await ProcessManager.startProgram(programName, {
                    scheduledTask: true,
                    taskId: taskId,
                    runInBackground: runInBackground
                });
            } else if (taskType === ScheduleTaskManager.TASK_TYPE.COMMAND) {
                // 执行命令
                const command = task.command;
                if (!command) {
                    throw new Error("命令未定义");
                }

                // 获取 TerminalAPI
                if (typeof POOL === 'undefined' || typeof POOL.__GET__ !== 'function') {
                    throw new Error("POOL 不可用");
                }

                const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");
                if (!TerminalAPI || typeof TerminalAPI.executeCommand !== 'function') {
                    // 如果 TerminalAPI 不可用，尝试启动终端程序并执行命令
                    if (typeof ProcessManager !== 'undefined') {
                        // 启动终端程序
                        const terminalPid = await ProcessManager.startProgram('terminal', {
                            scheduledTask: true,
                            taskId: taskId,
                            autoStart: true
                        });

                        // 等待终端初始化完成
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // 再次尝试获取 TerminalAPI
                        const terminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");
                        if (terminalAPI && typeof terminalAPI.executeCommand === 'function') {
                            terminalAPI.executeCommand(command);
                        } else {
                            KernelLogger.warn("ScheduleTaskManager", `无法执行命令: ${command}，TerminalAPI 不可用`);
                        }
                    } else {
                        throw new Error("ProcessManager 不可用，无法执行命令");
                    }
                } else {
                    // 直接执行命令
                    TerminalAPI.executeCommand(command);
                }
            } else if (taskType === ScheduleTaskManager.TASK_TYPE.SERVICE) {
                // 执行服务（启动或停止 ServerExpansion 服务）
                const serviceId = task.serviceId;
                const action = task.serviceAction || ScheduleTaskManager.SERVICE_ACTION.START;
                if (!serviceId) {
                    throw new Error("服务 ID 未定义");
                }

                if (typeof POOL === 'undefined' || typeof POOL.__GET__ !== 'function') {
                    throw new Error("POOL 不可用");
                }

                // 等待 ServerExpansion 就绪（系统启动时可能稍晚注册到 POOL）
                let ServerExpansion = POOL.__GET__("KERNEL_GLOBAL_POOL", "ServerExpansion");
                if (!ServerExpansion || typeof ServerExpansion.start !== 'function' || typeof ServerExpansion.stop !== 'function') {
                    for (let wait = 0; wait < 4; wait++) {
                        await new Promise(r => setTimeout(r, 500));
                        ServerExpansion = POOL.__GET__("KERNEL_GLOBAL_POOL", "ServerExpansion");
                        if (ServerExpansion && typeof ServerExpansion.start === 'function' && typeof ServerExpansion.stop === 'function') {
                            break;
                        }
                    }
                }
                if (!ServerExpansion || typeof ServerExpansion.start !== 'function' || typeof ServerExpansion.stop !== 'function') {
                    throw new Error("ServerExpansion 未加载或不可用");
                }

                if (action === ScheduleTaskManager.SERVICE_ACTION.START) {
                    let started = false;
                    try {
                        started = await ServerExpansion.start(serviceId);
                    } catch (startErr) {
                        const msg = (startErr && startErr.message) ? String(startErr.message) : '';
                        if (typeof ServerExpansion.loadAll === 'function' && /未知服务|未加载|not found/i.test(msg)) {
                            KernelLogger.info("ScheduleTaskManager", `服务 ${serviceId} 尚未加载，loadAll 后重试: ${msg}`);
                            await ServerExpansion.loadAll();
                            started = await ServerExpansion.start(serviceId);
                        } else {
                            throw startErr;
                        }
                    }
                    if (started === false && typeof ServerExpansion.loadAll === 'function') {
                        KernelLogger.info("ScheduleTaskManager", `服务 ${serviceId} 启动返回 false，loadAll 后重试`);
                        await ServerExpansion.loadAll();
                        await ServerExpansion.start(serviceId);
                    }
                } else {
                    await ServerExpansion.stop(serviceId);
                }
            } else {
                throw new Error(`未知的任务类型: ${taskType}`);
            }
            
            // 更新任务统计
            task.lastRunAt = Date.now();
            task.runCount = (task.runCount || 0) + 1;
            task.updatedAt = Date.now();
            
            // 保存到持久化存储
            await ScheduleTaskManager._saveTasks();
            
            KernelLogger.info("ScheduleTaskManager", `计划任务执行成功: ${taskId}`);
        } catch (error) {
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.PROGRAM,
                    `ScheduleTaskManager.执行计划任务失败: ${taskId}`,
                    { taskId, taskType: task.taskType, programName: task.programName, command: task.command, error: error.message, stack: error.stack }
                ).catch(() => { });
            } else {
                KernelLogger.error("ScheduleTaskManager", `执行计划任务失败: ${taskId}`, error);
            }
            throw error;
        }
    }
    
    // ==================== 时间任务管理 ====================
    
    /**
     * 启动所有时间任务
     */
    static _startTimeTasks() {
        for (const [taskId, task] of ScheduleTaskManager._tasks) {
            if (task.enabled && (
                task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.SPECIFIC_TIME ||
                task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.TIME_RANGE ||
                task.triggerType === ScheduleTaskManager.TRIGGER_TYPE.INTERVAL
            )) {
                ScheduleTaskManager._startTimeTask(taskId);
            }
        }
    }
    
    /**
     * 启动时间任务
     * @param {string} taskId 任务ID
     */
    static _startTimeTask(taskId) {
        const task = ScheduleTaskManager._tasks.get(taskId);
        if (!task) {
            return;
        }
        
        // 停止现有定时器
        ScheduleTaskManager._stopTimeTask(taskId);
        
        try {
            let timerId = null;
            
            switch (task.triggerType) {
                case ScheduleTaskManager.TRIGGER_TYPE.SPECIFIC_TIME:
                    timerId = ScheduleTaskManager._scheduleSpecificTimeTask(task);
                    break;
                    
                case ScheduleTaskManager.TRIGGER_TYPE.TIME_RANGE:
                    timerId = ScheduleTaskManager._scheduleTimeRangeTask(task);
                    break;
                    
                case ScheduleTaskManager.TRIGGER_TYPE.INTERVAL:
                    timerId = ScheduleTaskManager._scheduleIntervalTask(task);
                    break;
            }
            
            if (timerId !== null) {
                ScheduleTaskManager._timers.set(taskId, timerId);
            }
        } catch (error) {
            KernelLogger.error("ScheduleTaskManager", `启动时间任务失败: ${taskId}`, error);
        }
    }
    
    /**
     * 停止时间任务
     * @param {string} taskId 任务ID
     */
    static _stopTimeTask(taskId) {
        const timerId = ScheduleTaskManager._timers.get(taskId);
        if (timerId !== null) {
            if (typeof timerId === 'number') {
                clearTimeout(timerId);
                clearInterval(timerId);
            }
            ScheduleTaskManager._timers.delete(taskId);
        }
    }
    
    /**
     * 调度特定时间任务
     * @param {Object} task 任务对象
     * @returns {number|null} 定时器ID
     */
    static _scheduleSpecificTimeTask(task) {
        const [hours, minutes] = task.triggerConfig.time.split(':').map(Number);
        const now = new Date();
        const targetTime = new Date();
        targetTime.setHours(hours, minutes, 0, 0);
        
        // 如果目标时间已过，设置为明天
        if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
        }
        
        const delay = targetTime.getTime() - now.getTime();
        
        const timerId = setTimeout(async () => {
            await ScheduleTaskManager._executeTask(task.id);
            // 每天重复
            ScheduleTaskManager._startTimeTask(task.id);
        }, delay);
        
        KernelLogger.debug("ScheduleTaskManager", `调度特定时间任务: ${task.id}，将在 ${targetTime.toLocaleString()} 执行`);
        
        return timerId;
    }
    
    /**
     * 调度时间区间任务
     * @param {Object} task 任务对象
     * @returns {number|null} 定时器ID
     */
    static _scheduleTimeRangeTask(task) {
        const [startHours, startMinutes] = task.triggerConfig.startTime.split(':').map(Number);
        const [endHours, endMinutes] = task.triggerConfig.endTime.split(':').map(Number);
        const interval = task.triggerConfig.interval; // 分钟
        
        const checkAndRun = async () => {
            const now = new Date();
            const currentHours = now.getHours();
            const currentMinutes = now.getMinutes();
            const currentTime = currentHours * 60 + currentMinutes;
            const startTime = startHours * 60 + startMinutes;
            const endTime = endHours * 60 + endMinutes;
            
            // 检查是否在时间区间内
            if (currentTime >= startTime && currentTime <= endTime) {
                // 检查是否到了执行时间（基于间隔）
                const minutesSinceStart = currentTime - startTime;
                if (minutesSinceStart % interval === 0) {
                    await ScheduleTaskManager._executeTask(task.id);
                }
            }
        };
        
        // 每分钟检查一次
        const timerId = setInterval(checkAndRun, 60000);
        
        // 立即检查一次
        checkAndRun();
        
        KernelLogger.debug("ScheduleTaskManager", `调度时间区间任务: ${task.id}，区间 ${task.triggerConfig.startTime}-${task.triggerConfig.endTime}，间隔 ${interval} 分钟`);
        
        return timerId;
    }
    
    /**
     * 调度间隔任务
     * @param {Object} task 任务对象
     * @returns {number|null} 定时器ID
     */
    static _scheduleIntervalTask(task) {
        const interval = task.triggerConfig.interval; // 分钟
        const delay = interval * 60 * 1000; // 转换为毫秒
        
        const timerId = setInterval(async () => {
            await ScheduleTaskManager._executeTask(task.id);
        }, delay);
        
        // 立即执行一次
        ScheduleTaskManager._executeTask(task.id).catch(error => {
            KernelLogger.error("ScheduleTaskManager", `执行间隔任务失败: ${task.id}`, error);
        });
        
        KernelLogger.debug("ScheduleTaskManager", `调度间隔任务: ${task.id}，间隔 ${interval} 分钟`);
        
        return timerId;
    }
}

// 自动初始化（不依赖 DOMContentLoaded：本脚本由 BootLoader 动态加载，可能晚于 DOMContentLoaded，若仅监听会导致 init 永不执行、自启服务不启动）
if (typeof KernelLogger !== 'undefined') {
    const runInit = () => {
        if (ScheduleTaskManager._initialized) return;
        ScheduleTaskManager.init();
    };
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runInit);
            setTimeout(runInit, 5000);
        } else {
            setTimeout(runInit, 0);
        }
    } else {
        setTimeout(runInit, 0);
    }
}

// 派发加载完成事件
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/drive/scheduleTaskManager.js");
} else if (typeof document !== 'undefined' && document.body) {
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/drive/scheduleTaskManager.js",
            },
        })
    );
    KernelLogger.debug("ScheduleTaskManager", "已发布依赖加载信号（降级方案）");
}

