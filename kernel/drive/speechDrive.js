// 语音识别驱动管理器
// 负责管理系统级的语音识别功能，基于 Web Speech API
// 提供统一的语音识别 API 供程序使用
// 只在有程序使用时才启用语音识别，其余情况不识别

KernelLogger.info("SpeechDrive", "模块初始化");

class SpeechDrive {
    // ==================== 常量定义 ====================
    
    /**
     * 识别状态枚举
     */
    static STATUS = {
        IDLE: 'IDLE',              // 空闲（未启动）
        STARTING: 'STARTING',       // 启动中
        LISTENING: 'LISTENING',     // 正在识别
        STOPPED: 'STOPPED',         // 已停止
        ERROR: 'ERROR'              // 错误
    };
    
    /**
     * 支持的语言列表
     */
    static SUPPORTED_LANGUAGES = [
        'zh-CN',    // 简体中文
        'zh-TW',    // 繁体中文
        'en-US',    // 美式英语
        'en-GB',    // 英式英语
        'ja-JP',    // 日语
        'ko-KR',    // 韩语
        'fr-FR',    // 法语
        'de-DE',    // 德语
        'es-ES',    // 西班牙语
        'ru-RU'     // 俄语
    ];
    
    /**
     * 默认语言
     */
    static DEFAULT_LANGUAGE = 'zh-CN';
    
    // ==================== 内部状态 ====================
    
    /**
     * 当前活动的识别会话
     * Map<pid, RecognitionSession>
     */
    static _activeSessions = new Map();
    
    /**
     * 识别会话数据结构
     * @typedef {Object} RecognitionSession
     * @property {number} pid - 进程 ID
     * @property {SpeechRecognition} recognition - Web Speech API 识别对象
     * @property {string} status - 当前状态
     * @property {string} language - 识别语言
     * @property {boolean} continuous - 是否持续识别
     * @property {boolean} interimResults - 是否返回临时结果
     * @property {Function|null} onResult - 识别结果回调
     * @property {Function|null} onError - 错误回调
     * @property {Function|null} onEnd - 结束回调
     * @property {Array<string>} results - 识别结果列表
     * @property {Date} createdAt - 创建时间
     */
    
    /**
     * 浏览器支持检查
     */
    static _isSupported = null;
    
    /**
     * 是否已初始化
     */
    static _initialized = false;
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化语音识别驱动
     */
    static init() {
        if (SpeechDrive._initialized) {
            KernelLogger.debug("SpeechDrive", "已初始化，跳过");
            return;
        }
        
        KernelLogger.info("SpeechDrive", "初始化语音识别驱动");
        
        // 检查浏览器支持
        SpeechDrive._isSupported = SpeechDrive._checkSupport();
        
        if (!SpeechDrive._isSupported) {
            KernelLogger.warn("SpeechDrive", "浏览器不支持 Web Speech API，语音识别功能将不可用");
        } else {
            KernelLogger.info("SpeechDrive", "浏览器支持 Web Speech API");
        }
        
        SpeechDrive._initialized = true;
        KernelLogger.info("SpeechDrive", "语音识别驱动初始化完成");
    }
    
    /**
     * 检查浏览器是否支持 Web Speech API
     * @returns {boolean} 是否支持
     */
    static _checkSupport() {
        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            return typeof SpeechRecognition !== 'undefined';
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 检查浏览器支持性（公开方法）
     * @returns {boolean} 是否支持
     */
    static isSupported() {
        if (SpeechDrive._isSupported === null) {
            SpeechDrive._isSupported = SpeechDrive._checkSupport();
        }
        return SpeechDrive._isSupported;
    }
    
    // ==================== 识别会话管理 ====================
    
    /**
     * 创建识别会话
     * @param {number} pid - 进程 ID
     * @param {Object} options - 识别选项
     * @param {string} options.language - 识别语言（默认 'zh-CN'）
     * @param {boolean} options.continuous - 是否持续识别（默认 true）
     * @param {boolean} options.interimResults - 是否返回临时结果（默认 true）
     * @param {Function} options.onResult - 识别结果回调 (result, isFinal) => {}
     * @param {Function} options.onError - 错误回调 (error) => {}
     * @param {Function} options.onEnd - 结束回调 () => {}
     * @returns {Promise<string>} 会话 ID（即 pid 的字符串形式）
     * @throws {Error} 如果浏览器不支持或创建失败
     */
    static async createSession(pid, options = {}) {
        if (!SpeechDrive.isSupported()) {
            throw new Error('浏览器不支持 Web Speech API');
        }
        
        // 检查是否已有会话
        if (SpeechDrive._activeSessions.has(pid)) {
            KernelLogger.warn("SpeechDrive", `进程 ${pid} 已有识别会话，先停止旧会话`);
            await SpeechDrive.stopSession(pid);
        }
        
        const {
            language = SpeechDrive.DEFAULT_LANGUAGE,
            continuous = true,
            interimResults = true,
            onResult = null,
            onError = null,
            onEnd = null
        } = options;
        
        // 验证语言
        if (!SpeechDrive.SUPPORTED_LANGUAGES.includes(language)) {
            KernelLogger.warn("SpeechDrive", `不支持的语言: ${language}，使用默认语言: ${SpeechDrive.DEFAULT_LANGUAGE}`);
        }
        
        KernelLogger.info("SpeechDrive", `创建识别会话: PID ${pid}, 语言: ${language}`);
        
        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            
            // 配置识别参数
            recognition.lang = language;
            recognition.continuous = continuous;
            recognition.interimResults = interimResults;
            recognition.maxAlternatives = 1;
            
            // 创建会话对象
            const session = {
                pid: pid,
                recognition: recognition,
                status: SpeechDrive.STATUS.IDLE,
                language: language,
                continuous: continuous,
                interimResults: interimResults,
                onResult: onResult,
                onError: onError,
                onEnd: onEnd,
                results: [],
                createdAt: new Date()
            };
            
            // 设置识别结果事件
            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                
                // 处理所有识别结果
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    const isFinal = event.results[i].isFinal;
                    
                    if (isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                // 调用回调
                if (onResult) {
                    if (interimTranscript) {
                        onResult(interimTranscript, false);
                    }
                    if (finalTranscript) {
                        onResult(finalTranscript, true);
                        // 保存最终结果
                        session.results.push(finalTranscript);
                    }
                }
            };
            
            // 设置错误事件
            recognition.onerror = (event) => {
                let errorMessage = '识别出错：';
                
                switch (event.error) {
                    case 'no-speech':
                        errorMessage = '未检测到语音';
                        break;
                    case 'audio-capture':
                        errorMessage = '无法访问麦克风';
                        break;
                    case 'not-allowed':
                        errorMessage = '麦克风权限被拒绝';
                        break;
                    case 'network':
                        errorMessage = '网络错误';
                        break;
                    case 'aborted':
                        errorMessage = '识别已中止';
                        break;
                    default:
                        errorMessage += event.error;
                }
                
                KernelLogger.error("SpeechDrive", `识别错误 (PID ${pid}): ${errorMessage}`);
                session.status = SpeechDrive.STATUS.ERROR;
                
                if (onError) {
                    onError(new Error(errorMessage));
                }
            };
            
            // 设置开始事件
            recognition.onstart = () => {
                KernelLogger.debug("SpeechDrive", `识别已开始 (PID ${pid})`);
                session.status = SpeechDrive.STATUS.LISTENING;
            };
            
            // 设置结束事件
            recognition.onend = () => {
                KernelLogger.debug("SpeechDrive", `识别已结束 (PID ${pid})`);
                session.status = SpeechDrive.STATUS.STOPPED;
                
                // 如果设置了持续识别且会话仍然存在，自动重启
                if (continuous && SpeechDrive._activeSessions.has(pid)) {
                    try {
                        recognition.start();
                        KernelLogger.debug("SpeechDrive", `自动重启识别 (PID ${pid})`);
                    } catch (e) {
                        KernelLogger.warn("SpeechDrive", `自动重启失败 (PID ${pid}): ${e.message}`);
                        // 如果重启失败，清理会话
                        SpeechDrive._activeSessions.delete(pid);
                        if (onEnd) {
                            onEnd();
                        }
                    }
                } else {
                    // 清理会话
                    SpeechDrive._activeSessions.delete(pid);
                    if (onEnd) {
                        onEnd();
                    }
                }
            };
            
            // 保存会话
            SpeechDrive._activeSessions.set(pid, session);
            
            KernelLogger.info("SpeechDrive", `识别会话创建成功 (PID ${pid})`);
            return pid.toString();
        } catch (error) {
            KernelLogger.error("SpeechDrive", `创建识别会话失败 (PID ${pid}): ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 启动识别
     * @param {number} pid - 进程 ID
     * @returns {Promise<void>}
     * @throws {Error} 如果会话不存在或启动失败
     */
    static async startRecognition(pid) {
        const session = SpeechDrive._activeSessions.get(pid);
        if (!session) {
            throw new Error(`识别会话不存在: PID ${pid}`);
        }
        
        if (session.status === SpeechDrive.STATUS.LISTENING) {
            KernelLogger.warn("SpeechDrive", `识别已在运行中 (PID ${pid})`);
            return;
        }
        
        KernelLogger.info("SpeechDrive", `启动识别 (PID ${pid})`);
        
        try {
            session.status = SpeechDrive.STATUS.STARTING;
            session.recognition.start();
        } catch (error) {
            session.status = SpeechDrive.STATUS.ERROR;
            KernelLogger.error("SpeechDrive", `启动识别失败 (PID ${pid}): ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 停止识别
     * @param {number} pid - 进程 ID
     * @returns {Promise<void>}
     */
    static async stopRecognition(pid) {
        const session = SpeechDrive._activeSessions.get(pid);
        if (!session) {
            KernelLogger.warn("SpeechDrive", `识别会话不存在 (PID ${pid})`);
            return;
        }
        
        KernelLogger.info("SpeechDrive", `停止识别 (PID ${pid})`);
        
        try {
            session.recognition.stop();
            session.status = SpeechDrive.STATUS.STOPPED;
        } catch (error) {
            KernelLogger.error("SpeechDrive", `停止识别失败 (PID ${pid}): ${error.message}`, error);
        }
    }
    
    /**
     * 停止并销毁会话
     * @param {number} pid - 进程 ID
     * @returns {Promise<void>}
     */
    static async stopSession(pid) {
        const session = SpeechDrive._activeSessions.get(pid);
        if (!session) {
            KernelLogger.debug("SpeechDrive", `识别会话不存在 (PID ${pid})`);
            return;
        }
        
        KernelLogger.info("SpeechDrive", `停止并销毁识别会话 (PID ${pid})`);
        
        try {
            // 停止识别
            if (session.status === SpeechDrive.STATUS.LISTENING || session.status === SpeechDrive.STATUS.STARTING) {
                session.recognition.stop();
            }
        } catch (error) {
            KernelLogger.warn("SpeechDrive", `停止识别时出错 (PID ${pid}): ${error.message}`);
        }
        
        // 清理会话
        SpeechDrive._activeSessions.delete(pid);
        KernelLogger.debug("SpeechDrive", `识别会话已销毁 (PID ${pid})`);
    }
    
    /**
     * 获取会话状态
     * @param {number} pid - 进程 ID
     * @returns {Object|null} 会话状态信息，如果会话不存在则返回 null
     */
    static getSessionStatus(pid) {
        const session = SpeechDrive._activeSessions.get(pid);
        if (!session) {
            return null;
        }
        
        return {
            pid: session.pid,
            status: session.status,
            language: session.language,
            continuous: session.continuous,
            interimResults: session.interimResults,
            resultsCount: session.results.length,
            createdAt: session.createdAt
        };
    }
    
    /**
     * 获取会话的识别结果
     * @param {number} pid - 进程 ID
     * @returns {Array<string>} 识别结果列表
     */
    static getSessionResults(pid) {
        const session = SpeechDrive._activeSessions.get(pid);
        if (!session) {
            return [];
        }
        
        return [...session.results];
    }
    
    /**
     * 清理所有会话（用于进程退出时）
     * @param {number} pid - 进程 ID
     */
    static cleanupProcess(pid) {
        if (SpeechDrive._activeSessions.has(pid)) {
            KernelLogger.info("SpeechDrive", `清理进程 ${pid} 的识别会话`);
            SpeechDrive.stopSession(pid).catch(error => {
                KernelLogger.error("SpeechDrive", `清理识别会话失败 (PID ${pid}): ${error.message}`);
            });
        }
    }
    
    /**
     * 获取所有活动会话
     * @returns {Array<Object>} 活动会话列表
     */
    static getAllActiveSessions() {
        return Array.from(SpeechDrive._activeSessions.values()).map(session => ({
            pid: session.pid,
            status: session.status,
            language: session.language,
            resultsCount: session.results.length,
            createdAt: session.createdAt
        }));
    }
}

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "SpeechDrive", SpeechDrive);
    } catch (e) {
        KernelLogger.warn("SpeechDrive", `注册到POOL失败: ${e.message}`);
    }
}

// 发布依赖加载完成信号
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/drive/speechDrive.js");
} else if (typeof document !== 'undefined' && document.body) {
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/drive/speechDrive.js",
            },
        })
    );
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("SpeechDrive", "已发布依赖加载信号（降级方案）");
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.SpeechDrive = SpeechDrive;
} else if (typeof globalThis !== 'undefined') {
    globalThis.SpeechDrive = SpeechDrive;
}

