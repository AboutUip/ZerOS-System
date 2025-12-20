// 多线程驱动器
// 基于 Web Workers 的线程池管理系统
// 提供线程创建、分配、回收等功能

KernelLogger.info("MultithreadingDrive", "模块初始化");

class MultithreadingDrive {
    // ==================== 配置 ====================
    
    /**
     * 默认线程池大小
     */
    static DEFAULT_POOL_SIZE = 4;
    
    /**
     * 最大线程池大小
     */
    static MAX_POOL_SIZE = 16;
    
    /**
     * 线程空闲超时时间（毫秒），超过此时间未使用的线程将被回收
     */
    static THREAD_IDLE_TIMEOUT = 60000; // 60秒
    
    // ==================== 内部状态 ====================
    
    /**
     * 线程池
     * Map<threadId, ThreadInfo>
     * ThreadInfo: {
     *     id: string,              // 线程ID
     *     worker: Worker,          // Worker实例
     *     pid: number,             // 所属进程ID
     *     status: 'idle' | 'busy' | 'terminated',  // 线程状态
     *     createdAt: number,       // 创建时间
     *     lastUsedAt: number,      // 最后使用时间
     *     taskCount: number,       // 执行的任务数
     *     currentTask: string | null  // 当前任务ID
     * }
     */
    static _threadPool = new Map();
    
    /**
     * 线程ID计数器
     */
    static _threadIdCounter = 0;
    
    /**
     * 进程到线程的映射
     * Map<pid, Set<threadId>>
     */
    static _processThreads = new Map();
    
    /**
     * 任务队列
     * Array<{taskId, pid, script, args, resolve, reject, timestamp}>
     */
    static _taskQueue = [];
    
    /**
     * 任务ID计数器
     */
    static _taskIdCounter = 0;
    
    /**
     * 任务映射
     * Map<taskId, {threadId, pid, resolve, reject}>
     */
    static _tasks = new Map();
    
    /**
     * 空闲线程回收定时器
     */
    static _idleCleanupTimer = null;
    
    /**
     * 是否已初始化
     */
    static _initialized = false;
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化多线程驱动器
     */
    static init() {
        if (MultithreadingDrive._initialized) {
            KernelLogger.debug("MultithreadingDrive", "已初始化，跳过");
            return;
        }
        
        KernelLogger.info("MultithreadingDrive", "初始化多线程驱动器");
        
        // 启动空闲线程回收定时器
        MultithreadingDrive._startIdleCleanup();
        
        MultithreadingDrive._initialized = true;
        KernelLogger.info("MultithreadingDrive", "多线程驱动器初始化完成");
    }
    
    /**
     * 启动空闲线程回收定时器
     */
    static _startIdleCleanup() {
        if (MultithreadingDrive._idleCleanupTimer) {
            clearInterval(MultithreadingDrive._idleCleanupTimer);
        }
        
        MultithreadingDrive._idleCleanupTimer = setInterval(() => {
            MultithreadingDrive._cleanupIdleThreads();
        }, 30000); // 每30秒检查一次
    }
    
    /**
     * 清理空闲线程
     */
    static _cleanupIdleThreads() {
        const now = Date.now();
        const threadsToTerminate = [];
        
        MultithreadingDrive._threadPool.forEach((threadInfo, threadId) => {
            if (threadInfo.status === 'idle' && 
                (now - threadInfo.lastUsedAt) > MultithreadingDrive.THREAD_IDLE_TIMEOUT) {
                threadsToTerminate.push(threadId);
            }
        });
        
        threadsToTerminate.forEach(threadId => {
            KernelLogger.debug("MultithreadingDrive", `回收空闲线程: ${threadId}`);
            MultithreadingDrive._terminateThread(threadId);
        });
    }
    
    // ==================== 线程管理 ====================
    
    /**
     * 创建新线程
     * @param {number} pid 进程ID
     * @returns {string} 线程ID
     */
    static createThread(pid) {
        const threadId = `thread_${++MultithreadingDrive._threadIdCounter}`;
        
        try {
            // 创建 Worker（使用内联脚本）
            const workerScript = `
                // Worker 脚本
                self.onmessage = function(e) {
                    const { taskId, script, args } = e.data;
                    
                    try {
                        // 在 Worker 中执行脚本
                        // script 应该是一个函数字符串，例如: "(function(a, b) { return a + b; })"
                        let func;
                        if (typeof script === 'string') {
                            // 尝试解析函数字符串
                            try {
                                func = eval('(' + script + ')');
                            } catch (e1) {
                                // 如果失败，尝试直接执行
                                try {
                                    func = new Function('return ' + script)();
                                } catch (e2) {
                                    throw new Error('无法解析脚本: ' + e2.message);
                                }
                            }
                        } else {
                            throw new Error('脚本必须是字符串');
                        }
                        
                        if (typeof func !== 'function') {
                            throw new Error('脚本必须是一个函数');
                        }
                        
                        // 执行函数
                        const result = func.apply(null, args || []);
                        
                        // 如果结果是 Promise，等待它完成
                        if (result && typeof result.then === 'function') {
                            result
                                .then(data => {
                                    // 序列化结果（确保可以传递）
                                    try {
                                        const serialized = JSON.parse(JSON.stringify(data));
                                        self.postMessage({
                                            taskId: taskId,
                                            success: true,
                                            data: serialized
                                        });
                                    } catch (serializeError) {
                                        // 如果无法序列化，尝试传递原始数据
                                        self.postMessage({
                                            taskId: taskId,
                                            success: true,
                                            data: data
                                        });
                                    }
                                })
                                .catch(error => {
                                    self.postMessage({
                                        taskId: taskId,
                                        success: false,
                                        error: {
                                            message: error.message || '未知错误',
                                            stack: error.stack || ''
                                        }
                                    });
                                });
                        } else {
                            // 同步结果，尝试序列化
                            try {
                                const serialized = JSON.parse(JSON.stringify(result));
                                self.postMessage({
                                    taskId: taskId,
                                    success: true,
                                    data: serialized
                                });
                            } catch (serializeError) {
                                // 如果无法序列化，尝试传递原始数据
                                self.postMessage({
                                    taskId: taskId,
                                    success: true,
                                    data: result
                                });
                            }
                        }
                    } catch (error) {
                        self.postMessage({
                            taskId: taskId,
                            success: false,
                            error: {
                                message: error.message || '未知错误',
                                stack: error.stack || ''
                            }
                        });
                    }
                };
            `;
            
            const blob = new Blob([workerScript], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            const worker = new Worker(workerUrl);
            
            // 监听 Worker 消息
            worker.onmessage = (e) => {
                MultithreadingDrive._handleWorkerMessage(threadId, e.data);
            };
            
            // 监听 Worker 错误
            worker.onerror = (error) => {
                KernelLogger.error("MultithreadingDrive", `线程 ${threadId} 发生错误:`, error);
                MultithreadingDrive._handleWorkerError(threadId, error);
            };
            
            // 创建线程信息
            const threadInfo = {
                id: threadId,
                worker: worker,
                pid: pid,
                status: 'idle',
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                taskCount: 0,
                currentTask: null
            };
            
            MultithreadingDrive._threadPool.set(threadId, threadInfo);
            
            // 记录到进程映射
            if (!MultithreadingDrive._processThreads.has(pid)) {
                MultithreadingDrive._processThreads.set(pid, new Set());
            }
            MultithreadingDrive._processThreads.get(pid).add(threadId);
            
            KernelLogger.info("MultithreadingDrive", `创建线程: ${threadId} (PID: ${pid})`);
            
            return threadId;
        } catch (e) {
            KernelLogger.error("MultithreadingDrive", `创建线程失败: ${e.message}`, e);
            throw new Error(`创建线程失败: ${e.message}`);
        }
    }
    
    /**
     * 获取或创建空闲线程
     * @param {number} pid 进程ID
     * @returns {string|null} 线程ID，如果没有可用线程则返回null
     */
    static _getOrCreateIdleThread(pid) {
        // 首先查找该进程的空闲线程
        const processThreads = MultithreadingDrive._processThreads.get(pid);
        if (processThreads) {
            for (const threadId of processThreads) {
                const threadInfo = MultithreadingDrive._threadPool.get(threadId);
                if (threadInfo && threadInfo.status === 'idle') {
                    return threadId;
                }
            }
        }
        
        // 查找全局空闲线程
        for (const [threadId, threadInfo] of MultithreadingDrive._threadPool) {
            if (threadInfo.status === 'idle') {
                // 将线程分配给该进程
                threadInfo.pid = pid;
                if (!MultithreadingDrive._processThreads.has(pid)) {
                    MultithreadingDrive._processThreads.set(pid, new Set());
                }
                MultithreadingDrive._processThreads.get(pid).add(threadId);
                return threadId;
            }
        }
        
        // 检查是否可以创建新线程
        if (MultithreadingDrive._threadPool.size < MultithreadingDrive.MAX_POOL_SIZE) {
            return MultithreadingDrive.createThread(pid);
        }
        
        return null;
    }
    
    /**
     * 终止线程
     * @param {string} threadId 线程ID
     */
    static _terminateThread(threadId) {
        const threadInfo = MultithreadingDrive._threadPool.get(threadId);
        if (!threadInfo) {
            return;
        }
        
        try {
            // 终止 Worker
            threadInfo.worker.terminate();
            
            // 清理任务
            if (threadInfo.currentTask) {
                const task = MultithreadingDrive._tasks.get(threadInfo.currentTask);
                if (task) {
                    task.reject(new Error('线程已终止'));
                    MultithreadingDrive._tasks.delete(threadInfo.currentTask);
                }
            }
            
            // 从进程映射中移除
            const processThreads = MultithreadingDrive._processThreads.get(threadInfo.pid);
            if (processThreads) {
                processThreads.delete(threadId);
                if (processThreads.size === 0) {
                    MultithreadingDrive._processThreads.delete(threadInfo.pid);
                }
            }
            
            // 从线程池中移除
            MultithreadingDrive._threadPool.delete(threadId);
            
            KernelLogger.info("MultithreadingDrive", `终止线程: ${threadId}`);
        } catch (e) {
            KernelLogger.error("MultithreadingDrive", `终止线程失败: ${e.message}`, e);
        }
    }
    
    /**
     * 处理 Worker 消息
     * @param {string} threadId 线程ID
     * @param {Object} data 消息数据
     */
    static _handleWorkerMessage(threadId, data) {
        const { taskId, success, data: result, error } = data;
        
        const task = MultithreadingDrive._tasks.get(taskId);
        if (!task) {
            KernelLogger.warn("MultithreadingDrive", `收到未知任务的消息: ${taskId}`);
            return;
        }
        
        const threadInfo = MultithreadingDrive._threadPool.get(threadId);
        if (threadInfo) {
            threadInfo.status = 'idle';
            threadInfo.lastUsedAt = Date.now();
            threadInfo.currentTask = null;
        }
        
        if (success) {
            task.resolve(result);
        } else {
            const errorObj = new Error(error.message || '任务执行失败');
            if (error.stack) {
                errorObj.stack = error.stack;
            }
            task.reject(errorObj);
        }
        
        MultithreadingDrive._tasks.delete(taskId);
        
        // 处理队列中的下一个任务
        MultithreadingDrive._processTaskQueue();
    }
    
    /**
     * 处理 Worker 错误
     * @param {string} threadId 线程ID
     * @param {Error} error 错误对象
     */
    static _handleWorkerError(threadId, error) {
        const threadInfo = MultithreadingDrive._threadPool.get(threadId);
        if (threadInfo && threadInfo.currentTask) {
            const task = MultithreadingDrive._tasks.get(threadInfo.currentTask);
            if (task) {
                task.reject(new Error(`线程错误: ${error.message || '未知错误'}`));
                MultithreadingDrive._tasks.delete(threadInfo.currentTask);
            }
            threadInfo.status = 'idle';
            threadInfo.currentTask = null;
        }
    }
    
    // ==================== 任务管理 ====================
    
    /**
     * 执行任务
     * @param {number} pid 进程ID
     * @param {string|Function} script 要执行的脚本（函数字符串或函数对象）
     * @param {Array} args 参数数组（必须是可序列化的）
     * @returns {Promise<any>} 任务结果
     */
    static async executeTask(pid, script, args = []) {
        const taskId = `task_${++MultithreadingDrive._taskIdCounter}`;
        
        // 将函数转换为字符串
        let scriptString;
        if (typeof script === 'function') {
            // 如果是函数对象，转换为字符串
            scriptString = script.toString();
        } else if (typeof script === 'string') {
            scriptString = script;
        } else {
            throw new Error('script 必须是函数或函数字符串');
        }
        
        // 验证参数是否可序列化
        try {
            JSON.stringify(args);
        } catch (e) {
            throw new Error('参数必须是可序列化的（不能包含函数、循环引用等）');
        }
        
        return new Promise((resolve, reject) => {
            // 添加到任务映射
            MultithreadingDrive._tasks.set(taskId, {
                threadId: null,
                pid: pid,
                resolve: resolve,
                reject: reject
            });
            
            // 添加到队列
            MultithreadingDrive._taskQueue.push({
                taskId: taskId,
                pid: pid,
                script: scriptString,
                args: args,
                resolve: resolve,
                reject: reject,
                timestamp: Date.now()
            });
            
            // 尝试处理队列
            MultithreadingDrive._processTaskQueue();
        });
    }
    
    /**
     * 处理任务队列
     */
    static _processTaskQueue() {
        while (MultithreadingDrive._taskQueue.length > 0) {
            const task = MultithreadingDrive._taskQueue[0];
            
            // 获取空闲线程
            const threadId = MultithreadingDrive._getOrCreateIdleThread(task.pid);
            if (!threadId) {
                // 没有可用线程，等待
                break;
            }
            
            // 从队列中移除
            MultithreadingDrive._taskQueue.shift();
            
            // 更新任务信息
            const taskInfo = MultithreadingDrive._tasks.get(task.taskId);
            if (taskInfo) {
                taskInfo.threadId = threadId;
            }
            
            // 更新线程信息
            const threadInfo = MultithreadingDrive._threadPool.get(threadId);
            if (threadInfo) {
                threadInfo.status = 'busy';
                threadInfo.lastUsedAt = Date.now();
                threadInfo.taskCount++;
                threadInfo.currentTask = task.taskId;
            }
            
            // 发送任务到 Worker
            try {
                threadInfo.worker.postMessage({
                    taskId: task.taskId,
                    script: task.script,
                    args: task.args
                });
            } catch (e) {
                KernelLogger.error("MultithreadingDrive", `发送任务到线程失败: ${e.message}`, e);
                task.reject(new Error(`发送任务失败: ${e.message}`));
                MultithreadingDrive._tasks.delete(task.taskId);
                if (threadInfo) {
                    threadInfo.status = 'idle';
                    threadInfo.currentTask = null;
                }
            }
        }
    }
    
    // ==================== 公共API ====================
    
    /**
     * 获取线程池状态
     * @returns {Object} 线程池状态信息
     */
    static getPoolStatus() {
        const threads = Array.from(MultithreadingDrive._threadPool.values());
        const idleCount = threads.filter(t => t.status === 'idle').length;
        const busyCount = threads.filter(t => t.status === 'busy').length;
        
        return {
            total: threads.length,
            idle: idleCount,
            busy: busyCount,
            queueLength: MultithreadingDrive._taskQueue.length,
            threads: threads.map(t => ({
                id: t.id,
                pid: t.pid,
                status: t.status,
                taskCount: t.taskCount,
                createdAt: t.createdAt,
                lastUsedAt: t.lastUsedAt
            }))
        };
    }
    
    /**
     * 清理进程的所有线程
     * @param {number} pid 进程ID
     */
    static cleanupProcessThreads(pid) {
        const processThreads = MultithreadingDrive._processThreads.get(pid);
        if (!processThreads) {
            return;
        }
        
        const threadIds = Array.from(processThreads);
        threadIds.forEach(threadId => {
            MultithreadingDrive._terminateThread(threadId);
        });
        
        KernelLogger.info("MultithreadingDrive", `清理进程 ${pid} 的所有线程 (${threadIds.length} 个)`);
    }
    
    /**
     * 终止所有线程
     */
    static terminateAll() {
        const threadIds = Array.from(MultithreadingDrive._threadPool.keys());
        threadIds.forEach(threadId => {
            MultithreadingDrive._terminateThread(threadId);
        });
        
        // 清理任务队列
        MultithreadingDrive._taskQueue.forEach(task => {
            task.reject(new Error('线程池已终止'));
        });
        MultithreadingDrive._taskQueue = [];
        MultithreadingDrive._tasks.clear();
        
        // 停止清理定时器
        if (MultithreadingDrive._idleCleanupTimer) {
            clearInterval(MultithreadingDrive._idleCleanupTimer);
            MultithreadingDrive._idleCleanupTimer = null;
        }
        
        KernelLogger.info("MultithreadingDrive", "已终止所有线程");
    }
}

// 自动初始化
if (typeof document !== 'undefined' || typeof window !== 'undefined') {
    // 在浏览器环境中自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            MultithreadingDrive.init();
        });
    } else {
        MultithreadingDrive.init();
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/drive/multithreadingDrive.js");
}

