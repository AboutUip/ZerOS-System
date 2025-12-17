// KernelLogger: 统一的内核日志入口，始终使用 console.log 输出结构化信息
// 完全独立，不依赖任何外部模块，确保日志系统稳定运行
(function (global) {
    // 内部日志级别常量（不依赖外部枚举）
    const LOG_LEVEL = {
        NONE: 0,
        ERROR: 1,
        INFO: 2,
        DEBUG: 3,
    };
    
    // 日志级别名称常量
    const LOG_LEVEL_NAME = {
        DEBUG: 'DEBUG',
        INFO: 'INFO',
        WARN: 'WARN',
        ERROR: 'ERROR',
    };
    
    class KernelLogger {
        // 日志级别（默认 DEBUG，显示所有日志）
        static level = LOG_LEVEL.DEBUG;
        // locale, e.g. 'en' or 'zh-CN'
        static locale = 'zh-CN';
        // whether to include call stack in debug logs
        static includeStack = false;
        // whether to include source file name in logs
        static includeSourceFile = true;
        // limit meta JSON length for readability
        static maxMetaLength = 2000;
        
        // 错误抑制机制：防止无限循环报错
        static _errorCount = 0;
        static _errorSuppressed = false;
        static _maxErrors = 50;  // 最多显示50个错误，之后抑制
        static _errorResetTime = 0;
        static _errorResetInterval = 10000;  // 10秒后重置错误计数

        static setLevel(lvl) {
            KernelLogger.level = lvl;
        }
        static setLocale(loc) {
            KernelLogger.locale = loc || KernelLogger.locale;
        }
        static setIncludeStack(flag) {
            KernelLogger.includeStack = !!flag;
        }
        static setIncludeSourceFile(flag) {
            KernelLogger.includeSourceFile = !!flag;
        }
        static setMaxMetaLength(n) {
            KernelLogger.maxMetaLength = Number(n) || KernelLogger.maxMetaLength;
        }

        static _ts() {
            const now = new Date();
            // 统一使用本地时间格式：YYYY-MM-DD HH:mm:ss.SSS
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
        }

        static _labels() {
            const zh = {
                DEBUG: '调试',
                INFO: '信息',
                WARN: '警告',
                ERROR: '错误',
            };
            const en = { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };
            return (KernelLogger.locale && KernelLogger.locale.startsWith('zh')) ? zh : en;
        }

        static _safeStringify(obj) {
            try {
                return JSON.stringify(obj, null, 2);
            } catch (e) {
                try {
                    return String(obj);
                } catch (e2) {
                    return '[unserializable]';
                }
            }
        }

        static _truncate(str) {
            if (!str) return '';
            if (str.length <= KernelLogger.maxMetaLength) return str;
            return str.slice(0, KernelLogger.maxMetaLength) + '... <truncated>';
        }

        /**
         * 从调用栈中提取源文件名
         * @returns {string} 文件名或空字符串
         */
        static _getSourceFile() {
            if (!KernelLogger.includeSourceFile) return '';
            
            try {
                const stack = new Error().stack || '';
                const lines = stack.split('\n');
                
                // 跳过 KernelLogger 自身的调用栈帧（前3行通常是 Error、_format、log/debug/info/warn/error）
                // 查找第一个不是 kernelLogger.js 的调用者
                for (let i = 3; i < lines.length; i++) {
                    const line = lines[i];
                    
                    // 匹配多种文件名模式：
                    // 1. @filename.js:line:column (source map格式)
                    // 2. (filename.js:line:column) (标准格式)
                    // 3. at functionName (filename.js:line:column) (带函数名格式)
                    // 4. filename.js:line:column (简单格式)
                    const patterns = [
                        /(?:@|\(|at\s+[^(]*\()([^:()]+\.js)(?::\d+)?(?::\d+)?/,
                        /([^/\\:]+\.js)(?::\d+)?(?::\d+)?/,
                    ];
                    
                    for (const pattern of patterns) {
                        const match = line.match(pattern);
                        if (match && match[1]) {
                            const filePath = match[1];
                            // 跳过 kernelLogger.js 本身
                            if (filePath.includes('kernelLogger.js')) continue;
                            
                            // 提取文件名（只保留文件名，不包含路径）
                            const fileName = filePath.split('/').pop().split('\\').pop();
                            if (fileName && fileName.endsWith('.js')) {
                                return fileName;
                            }
                        }
                    }
                }
            } catch (e) {
                // 如果解析失败，返回空字符串
            }
            
            return '';
        }

        static _format(levelName, subsystem, message, meta) {
            const labels = KernelLogger._labels();
            const levelLabel = labels[levelName] || levelName;
            const ts = KernelLogger._ts();
            
            // 获取源文件名
            const sourceFile = KernelLogger._getSourceFile();
            const filePart = sourceFile ? ` [${sourceFile}]` : '';
            
            const header = `[内核][${subsystem}] [${levelLabel}]${filePart} ${ts}`;

            let msgPart = '';
            if (typeof message === 'string') msgPart = message;
            else msgPart = KernelLogger._safeStringify(message);

            let metaPart = '';
            if (typeof meta !== 'undefined') {
                const s = KernelLogger._safeStringify(meta);
                metaPart = '\n附加数据: ' + KernelLogger._truncate(s);
            }

            let stackPart = '';
            if (KernelLogger.includeStack && levelName === LOG_LEVEL_NAME.DEBUG) {
                try {
                    const st = new Error().stack || '';
                    // remove current function frames for readability
                    const lines = st.split('\n');
                    if (lines.length > 2) stackPart = '\n调用栈:\n' + lines.slice(2).join('\n');
                } catch (e) {
                    stackPart = '';
                }
            }

            return `${header} - ${msgPart}${metaPart}${stackPart}`;
        }

        static debug(subsystem, message, meta) {
            if (KernelLogger.level >= LOG_LEVEL.DEBUG) {
                const out = KernelLogger._format(LOG_LEVEL_NAME.DEBUG, subsystem, message, meta);
                console.log(out);
            }
        }
        static info(subsystem, message, meta) {
            if (KernelLogger.level >= LOG_LEVEL.INFO) {
                const out = KernelLogger._format(LOG_LEVEL_NAME.INFO, subsystem, message, meta);
                console.log(out);
            }
        }
        static warn(subsystem, message, meta) {
            if (KernelLogger.level >= LOG_LEVEL.INFO) {
                const out = KernelLogger._format(LOG_LEVEL_NAME.WARN, subsystem, message, meta);
                console.warn(out);
            }
        }
        static error(subsystem, message, meta) {
            // 使用log方法，以便应用错误抑制机制
            KernelLogger.log(LOG_LEVEL_NAME.ERROR, subsystem, message, meta);
        }

        // map-style log for Disk compatibility
        static map(op, mapName, key, value) {
            if (KernelLogger.level >= LOG_LEVEL.INFO) {
                let sval = '';
                try {
                    sval = typeof value === 'object' ? (value && value.name ? value.name : KernelLogger._safeStringify(value)) : String(value);
                } catch (e) {
                    sval = String(value);
                }
                const ts = KernelLogger._ts();
                if (KernelLogger.locale && KernelLogger.locale.startsWith('zh')) {
                    console.log(`[内核][磁盘映射] [${op}] 分区:${mapName} 键:{${key}} -> ${sval} ${ts}`);
                } else {
                    console.log(`[Kernel][Disk.Map] [${op}] ${mapName} {${key}} -> ${sval} ${ts}`);
                }
            }
        }

        static log(levelName, subsystem, message, meta) {
            // 直接调用内部格式化方法，避免递归调用
            const level = LOG_LEVEL[levelName] || LOG_LEVEL.INFO;
            if (level > KernelLogger.level) return;

            // 错误抑制检查
            if (levelName === LOG_LEVEL_NAME.ERROR) {
                const now = Date.now();
                
                // 如果超过重置时间，重置计数
                if (now > KernelLogger._errorResetTime) {
                    KernelLogger._errorCount = 0;
                    KernelLogger._errorSuppressed = false;
                    KernelLogger._errorResetTime = now + KernelLogger._errorResetInterval;
                }
                
                // 如果错误过多，抑制输出
                if (KernelLogger._errorCount >= KernelLogger._maxErrors) {
                    if (!KernelLogger._errorSuppressed) {
                        KernelLogger._errorSuppressed = true;
                        console.error(`[内核][KernelLogger] [错误] 错误过多，已抑制错误输出（已记录 ${KernelLogger._errorCount} 个错误）`);
                    }
                    return;  // 不输出错误
                }
                
                KernelLogger._errorCount++;
            }
            
            try {
                const formatted = KernelLogger._format(levelName, subsystem, message, meta);
                
                // 根据级别选择输出方式
                if (levelName === LOG_LEVEL_NAME.ERROR) {
                    console.error(formatted);
                } else if (levelName === LOG_LEVEL_NAME.WARN) {
                    console.warn(formatted);
                } else {
                    console.log(formatted);
                }
            } catch (e) {
                // 如果格式化失败，使用最简单的输出方式
                try {
                    console.error(`[内核][KernelLogger] 日志格式化失败: ${e.message}`);
                } catch (e2) {
                    // 如果连console.error都失败，完全静默
                }
            }
        }
        
        // 获取日志级别常量（供外部使用，但不强制依赖）
        static getLevel() {
            return {
                NONE: LOG_LEVEL.NONE,
                ERROR: LOG_LEVEL.ERROR,
                INFO: LOG_LEVEL.INFO,
                DEBUG: LOG_LEVEL.DEBUG,
            };
        }
        
        // 获取日志级别名称常量（供外部使用，但不强制依赖）
        static getLevelName() {
            return {
                DEBUG: LOG_LEVEL_NAME.DEBUG,
                INFO: LOG_LEVEL_NAME.INFO,
                WARN: LOG_LEVEL_NAME.WARN,
                ERROR: LOG_LEVEL_NAME.ERROR,
            };
        }
    }

    // 立即导出到全局，确保在任何地方都可以访问
    global.KernelLogger = KernelLogger;
    
    // 不导出到全局作用域，交由POOL管理
    // 通过POOL注册（如果POOL已加载）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            // 确保 KERNEL_GLOBAL_POOL 类别存在
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "KernelLogger", KernelLogger);
        } catch (e) {
            // POOL 可能还未完全初始化，已经导出到全局，无需再次导出
        }
    }
    
    // 尝试注册到 POOL（如果存在），但不强制依赖
    // 使用延迟注册，避免初始化时的循环依赖
    // 使用完全安全的方式访问 POOL，避免 ReferenceError
    if (typeof document !== 'undefined') {
        const tryRegisterToPool = () => {
            try {
                // 使用完全安全的方式检查 POOL 是否存在
                let poolExists = false;
                try {
                    // 通过 global 对象访问，避免直接引用
                    const poolRef = global.POOL || (typeof window !== 'undefined' ? window.POOL : undefined);
                    if (poolRef && typeof poolRef.__ADD__ === 'function') {
                        poolRef.__ADD__('KERNEL_GLOBAL_POOL', 'KernelLogger', KernelLogger);
                        poolExists = true;
                    }
                } catch (e) {
                    // 如果访问失败，说明 POOL 不存在或不可访问
                    poolExists = false;
                }
                
                if (!poolExists) {
                    // 如果 POOL 还未加载，延迟重试（最多重试 20 次，约 1 秒）
                    const retryCount = tryRegisterToPool._retryCount || 0;
                    if (retryCount < 20) {
                        tryRegisterToPool._retryCount = retryCount + 1;
                        setTimeout(tryRegisterToPool, 50);
                    }
                }
            } catch (e) {
                // 忽略所有错误，日志系统应该独立运行
                // 不输出错误，避免循环依赖
            }
        };
        // 延迟注册，确保不阻塞初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryRegisterToPool);
        } else {
            setTimeout(tryRegisterToPool, 0);
        }
    }
    
    // 在模块加载时立即输出一个测试日志，验证时间格式
    // 使用立即执行函数确保在模块加载时执行（在导出到全局之后）
    (function() {
        // 延迟执行，确保 KernelLogger 已经导出到全局
        setTimeout(function() {
            try {
                // 直接调用 _ts 方法测试时间格式
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
                const testTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
                
                // 输出明显的测试日志（使用多种方式确保可见）
                console.log('%c═══════════════════════════════════════════════════════════', 'color: #00ff00; font-weight: bold; font-size: 14px;');
                console.log('%c[KernelLogger] 时间格式修复验证 v2', 'color: #00ff00; font-weight: bold; font-size: 16px;');
                console.log(`%c直接格式化测试: ${testTime}`, 'color: #00ff00; font-weight: bold;');
                console.log(`%c预期格式: YYYY-MM-DD HH:mm:ss.SSS (本地时间)`, 'color: #00ff00;');
                console.log(`%c旧格式示例: 2025-12-04T09:29:05.249Z (UTC时间)`, 'color: #ff9900;');
                console.log('%c═══════════════════════════════════════════════════════════', 'color: #00ff00; font-weight: bold; font-size: 14px;');
                
                // 测试 KernelLogger._ts() 方法
                if (typeof KernelLogger !== 'undefined' && typeof KernelLogger._ts === 'function') {
                    const loggerTime = KernelLogger._ts();
                    console.log(`%c[KernelLogger._ts()] 方法测试: ${loggerTime}`, 'color: #00ff00; font-weight: bold;');
                    
                    // 验证格式是否正确
                    const isCorrectFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(loggerTime);
                    const isOldFormat = loggerTime.includes('T') && loggerTime.endsWith('Z');
                    
                    if (isCorrectFormat && !isOldFormat) {
                        console.log('%c✓ 时间格式正确！使用本地时间格式。', 'color: #00ff00; font-weight: bold; font-size: 14px;');
                    } else if (isOldFormat) {
                        console.error('%c✗ 错误：仍在使用旧的 UTC 格式！', 'color: #ff0000; font-weight: bold; font-size: 14px;');
                        console.error('%c这可能是因为浏览器缓存了旧文件。请强制刷新页面（Ctrl+Shift+R）', 'color: #ff0000; font-weight: bold;');
                    } else {
                        console.warn('%c? 时间格式异常，请检查代码。', 'color: #ff9900; font-weight: bold;');
                    }
                } else {
                    console.warn('%c[KernelLogger] KernelLogger 类尚未定义，无法测试 _ts() 方法', 'color: #ff9900;');
                }
            } catch (e) {
                console.error('%c[KernelLogger] 时间格式测试失败:', 'color: #ff0000; font-weight: bold;', e);
            }
        }, 0);
    })();
})(typeof window !== 'undefined' ? window : globalThis);
