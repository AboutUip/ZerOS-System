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
        static level = LOG_LEVEL.ERROR;
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
        
        // ==================== 日志收集和分类功能 ====================
        
        // 日志存储（内存中，不进行文件备份和永久存储）
        static _logBuffer = [];
        static _maxBufferSize = 100000;  // 最多存储10000条日志
        static _enableCollection = true;  // 是否启用日志收集
        
        // 日志分类索引（内存中）
        static _logIndex = {
            byLevel: { DEBUG: [], INFO: [], WARN: [], ERROR: [] },
            bySubsystem: {},  // { subsystem: [logEntry, ...] }
            byTime: [],  // 按时间排序的日志
            byDate: {},  // { 'YYYY-MM-DD': [logEntry, ...] }
            bySourceFile: {}  // { 'filename.js': [logEntry, ...] }
        };
        
        // 统计信息
        static _statistics = {
            total: 0,
            byLevel: { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 },
            bySubsystem: {},
            oldestTimestamp: null,
            newestTimestamp: null
        };

        static setLevel(lvl) {
            KernelLogger.level = lvl;
            // 同时保存到注册表（如果LStorage可用）
            KernelLogger._saveLevelToRegistry(lvl);
        }
        
        /**
         * 从注册表加载日志级别
         */
        static async _loadLevelFromRegistry() {
            // 等待LStorage初始化（如果可用）
            if (typeof LStorage === 'undefined') {
                return; // LStorage未加载，使用默认级别
            }
            
            try {
                // 等待LStorage初始化完成
                let retries = 0;
                while (retries < 20 && (!LStorage._initialized || typeof LStorage.getSystemStorage !== 'function')) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    retries++;
                }
                
                if (typeof LStorage.getSystemStorage === 'function') {
                    const level = await LStorage.getSystemStorage('bios.logLevel');
                    if (level !== undefined && level !== null) {
                        const levelNum = parseInt(level, 10);
                        if (!isNaN(levelNum) && levelNum >= -1 && levelNum <= 3) {
                            KernelLogger.level = levelNum;
                        }
                    }
                }
            } catch (e) {
                // 忽略错误，使用默认级别
            }
        }
        
        /**
         * 保存日志级别到注册表
         */
        static async _saveLevelToRegistry(level) {
            if (typeof LStorage === 'undefined' || typeof LStorage.setSystemStorage !== 'function') {
                return; // LStorage不可用，跳过保存
            }
            
            try {
                await LStorage.setSystemStorage('bios.logLevel', level);
            } catch (e) {
                // 忽略错误
            }
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
         * 生成时间戳字符串（本地时间格式：YYYY-MM-DD HH:mm:ss.SSS）
         * @returns {string} 格式化的时间戳
         */
        static _ts() {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
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
            // 总是收集日志，但只在级别足够时才输出到控制台
            KernelLogger.log(LOG_LEVEL_NAME.DEBUG, subsystem, message, meta);
        }
        static info(subsystem, message, meta) {
            // 总是收集日志，但只在级别足够时才输出到控制台
            KernelLogger.log(LOG_LEVEL_NAME.INFO, subsystem, message, meta);
        }
        static warn(subsystem, message, meta) {
            // 总是收集日志，但只在级别足够时才输出到控制台
            KernelLogger.log(LOG_LEVEL_NAME.WARN, subsystem, message, meta);
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

        /**
         * 解析日志格式，提取结构化信息
         * @param {string} levelName 日志级别
         * @param {string} subsystem 子系统名称
         * @param {string} message 日志消息
         * @param {any} meta 元数据
         * @returns {Object} 解析后的日志条目
         */
        static _parseLogEntry(levelName, subsystem, message, meta) {
            const timestamp = KernelLogger._ts();
            const timestampMs = Date.now();
            const sourceFile = KernelLogger._getSourceFile();
            const date = timestamp.split(' ')[0];  // 提取日期部分
            
            return {
                id: `log_${timestampMs}_${Math.random().toString(36).substr(2, 9)}`,  // 唯一ID
                level: levelName,
                subsystem: subsystem || 'Unknown',
                message: typeof message === 'string' ? message : KernelLogger._safeStringify(message),
                meta: meta,
                timestamp: timestamp,
                timestampMs: timestampMs,
                date: date,
                sourceFile: sourceFile,
                formatted: null  // 将在 _format 中填充
            };
        }
        
        /**
         * 将日志条目添加到索引
         * @param {Object} entry 日志条目
         */
        static _addToIndex(entry) {
            if (!entry || !entry.id) return;
            
            // 按级别索引
            if (KernelLogger._logIndex.byLevel[entry.level]) {
                KernelLogger._logIndex.byLevel[entry.level].push(entry);
            }
            
            // 按子系统索引
            if (!KernelLogger._logIndex.bySubsystem[entry.subsystem]) {
                KernelLogger._logIndex.bySubsystem[entry.subsystem] = [];
            }
            KernelLogger._logIndex.bySubsystem[entry.subsystem].push(entry);
            
            // 按时间索引（已排序）
            const timeIndex = KernelLogger._logIndex.byTime;
            // 使用二分查找插入位置，保持时间顺序
            let insertIndex = timeIndex.length;
            for (let i = timeIndex.length - 1; i >= 0; i--) {
                if (timeIndex[i].timestampMs <= entry.timestampMs) {
                    insertIndex = i + 1;
                    break;
                }
            }
            timeIndex.splice(insertIndex, 0, entry);
            
            // 按日期索引
            if (!KernelLogger._logIndex.byDate[entry.date]) {
                KernelLogger._logIndex.byDate[entry.date] = [];
            }
            KernelLogger._logIndex.byDate[entry.date].push(entry);
            
            // 按源文件索引
            if (entry.sourceFile) {
                if (!KernelLogger._logIndex.bySourceFile[entry.sourceFile]) {
                    KernelLogger._logIndex.bySourceFile[entry.sourceFile] = [];
                }
                KernelLogger._logIndex.bySourceFile[entry.sourceFile].push(entry);
            }
            
            // 更新统计信息
            KernelLogger._statistics.total++;
            KernelLogger._statistics.byLevel[entry.level] = (KernelLogger._statistics.byLevel[entry.level] || 0) + 1;
            KernelLogger._statistics.bySubsystem[entry.subsystem] = (KernelLogger._statistics.bySubsystem[entry.subsystem] || 0) + 1;
            
            if (!KernelLogger._statistics.oldestTimestamp || entry.timestampMs < KernelLogger._statistics.oldestTimestamp) {
                KernelLogger._statistics.oldestTimestamp = entry.timestampMs;
            }
            if (!KernelLogger._statistics.newestTimestamp || entry.timestampMs > KernelLogger._statistics.newestTimestamp) {
                KernelLogger._statistics.newestTimestamp = entry.timestampMs;
            }
        }
        
        /**
         * 清理旧日志（当缓冲区满时）
         */
        static _cleanupOldLogs() {
            if (KernelLogger._logBuffer.length <= KernelLogger._maxBufferSize) {
                return;
            }
            
            // 删除最旧的 10% 的日志
            const removeCount = Math.floor(KernelLogger._maxBufferSize * 0.1);
            const removedEntries = KernelLogger._logBuffer.splice(0, removeCount);
            
            // 从索引中移除
            for (const entry of removedEntries) {
                // 从级别索引中移除
                const levelIndex = KernelLogger._logIndex.byLevel[entry.level];
                if (levelIndex) {
                    const idx = levelIndex.findIndex(e => e.id === entry.id);
                    if (idx >= 0) levelIndex.splice(idx, 1);
                }
                
                // 从子系统索引中移除
                const subsystemIndex = KernelLogger._logIndex.bySubsystem[entry.subsystem];
                if (subsystemIndex) {
                    const idx = subsystemIndex.findIndex(e => e.id === entry.id);
                    if (idx >= 0) subsystemIndex.splice(idx, 1);
                }
                
                // 从时间索引中移除
                const timeIdx = KernelLogger._logIndex.byTime.findIndex(e => e.id === entry.id);
                if (timeIdx >= 0) KernelLogger._logIndex.byTime.splice(timeIdx, 1);
                
                // 从日期索引中移除
                const dateIndex = KernelLogger._logIndex.byDate[entry.date];
                if (dateIndex) {
                    const idx = dateIndex.findIndex(e => e.id === entry.id);
                    if (idx >= 0) dateIndex.splice(idx, 1);
                }
                
                // 从源文件索引中移除
                if (entry.sourceFile) {
                    const fileIndex = KernelLogger._logIndex.bySourceFile[entry.sourceFile];
                    if (fileIndex) {
                        const idx = fileIndex.findIndex(e => e.id === entry.id);
                        if (idx >= 0) fileIndex.splice(idx, 1);
                    }
                }
            }
        }

        static log(levelName, subsystem, message, meta) {
            // 直接调用内部格式化方法，避免递归调用
            const level = LOG_LEVEL[levelName] || LOG_LEVEL.INFO;
            
            // 错误抑制检查（仅针对 ERROR 级别）
            let shouldOutput = true;  // 是否应该输出到控制台
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
                    shouldOutput = false;  // 不输出错误，但仍收集
                }
                
                KernelLogger._errorCount++;
            }
            
            try {
                const formatted = KernelLogger._format(levelName, subsystem, message, meta);
                
                // 收集日志（如果启用）- 总是收集，不受级别限制
                if (KernelLogger._enableCollection) {
                    try {
                        const entry = KernelLogger._parseLogEntry(levelName, subsystem, message, meta);
                        entry.formatted = formatted;
                        
                        // 添加到缓冲区
                        KernelLogger._logBuffer.push(entry);
                        
                        // 添加到索引
                        KernelLogger._addToIndex(entry);
                        
                        // 清理旧日志
                        KernelLogger._cleanupOldLogs();
                    } catch (e) {
                        // 日志收集失败不应该影响正常日志输出
                        // 静默失败，避免循环依赖
                    }
                }
                
                // 输出到控制台（受级别限制和错误抑制影响）
                // 检查级别：只有级别足够时才输出
                if (shouldOutput && level <= KernelLogger.level) {
                    // 根据级别选择输出方式
                    if (levelName === LOG_LEVEL_NAME.ERROR) {
                        console.error(formatted);
                    } else if (levelName === LOG_LEVEL_NAME.WARN) {
                        console.warn(formatted);
                    } else {
                        console.log(formatted);
                    }
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
        
        // ==================== 日志查询API ====================
        
        /**
         * 获取日志统计信息
         * @returns {Object} 统计信息
         */
        static getStatistics() {
            return {
                total: KernelLogger._statistics.total,
                byLevel: { ...KernelLogger._statistics.byLevel },
                bySubsystem: { ...KernelLogger._statistics.bySubsystem },
                oldestTimestamp: KernelLogger._statistics.oldestTimestamp,
                newestTimestamp: KernelLogger._statistics.newestTimestamp,
                bufferSize: KernelLogger._logBuffer.length,
                maxBufferSize: KernelLogger._maxBufferSize
            };
        }
        
        /**
         * 查询日志（支持多种过滤条件）
         * @param {Object} options 查询选项
         * @param {string|Array<string>} options.level 日志级别（可选：'DEBUG', 'INFO', 'WARN', 'ERROR'）
         * @param {string|Array<string>} options.subsystem 子系统名称（可选）
         * @param {string} options.sourceFile 源文件名（可选）
         * @param {number} options.startTime 开始时间戳（毫秒，可选）
         * @param {number} options.endTime 结束时间戳（毫秒，可选）
         * @param {string} options.date 日期（格式：'YYYY-MM-DD'，可选）
         * @param {string} options.keyword 关键词搜索（在消息中搜索，可选）
         * @param {number} options.limit 返回数量限制（默认：100，最大：1000）
         * @param {number} options.offset 偏移量（用于分页，默认：0）
         * @param {boolean} options.reverse 是否反向排序（默认：false，从旧到新）
         * @returns {Array<Object>} 日志条目数组
         */
        static queryLogs(options = {}) {
            if (!KernelLogger._enableCollection) {
                return [];
            }
            
            const {
                level = null,
                subsystem = null,
                sourceFile = null,
                startTime = null,
                endTime = null,
                date = null,
                keyword = null,
                limit = 100,
                offset = 0,
                reverse = false
            } = options;
            
            // 限制查询数量
            const maxLimit = Math.min(limit, 1000);
            const actualOffset = Math.max(0, offset);
            
            // 确定查询的起始集合
            let candidates = [];
            
            // 如果指定了日期，使用日期索引
            if (date) {
                candidates = KernelLogger._logIndex.byDate[date] || [];
            } else {
                // 否则使用时间索引（已排序）
                candidates = KernelLogger._logIndex.byTime;
            }
            
            // 如果指定了级别，过滤
            if (level) {
                const levels = Array.isArray(level) ? level : [level];
                candidates = candidates.filter(entry => levels.includes(entry.level));
            }
            
            // 如果指定了子系统，过滤
            if (subsystem) {
                const subsystems = Array.isArray(subsystem) ? subsystem : [subsystem];
                candidates = candidates.filter(entry => subsystems.includes(entry.subsystem));
            }
            
            // 如果指定了源文件，过滤
            if (sourceFile) {
                candidates = candidates.filter(entry => entry.sourceFile === sourceFile);
            }
            
            // 如果指定了时间范围，过滤
            if (startTime !== null) {
                candidates = candidates.filter(entry => entry.timestampMs >= startTime);
            }
            if (endTime !== null) {
                candidates = candidates.filter(entry => entry.timestampMs <= endTime);
            }
            
            // 如果指定了关键词，过滤
            if (keyword) {
                const keywordLower = keyword.toLowerCase();
                candidates = candidates.filter(entry => {
                    const messageLower = entry.message.toLowerCase();
                    const subsystemLower = entry.subsystem.toLowerCase();
                    return messageLower.includes(keywordLower) || subsystemLower.includes(keywordLower);
                });
            }
            
            // 排序（如果需要反向）
            if (reverse) {
                candidates = candidates.slice().reverse();
            }
            
            // 分页
            const result = candidates.slice(actualOffset, actualOffset + maxLimit);
            
            return result;
        }
        
        /**
         * 按级别获取日志
         * @param {string} level 日志级别
         * @param {number} limit 返回数量限制
         * @param {number} offset 偏移量
         * @returns {Array<Object>} 日志条目数组
         */
        static getLogsByLevel(level, limit = 100, offset = 0) {
            return KernelLogger.queryLogs({ level, limit, offset });
        }
        
        /**
         * 按子系统获取日志
         * @param {string} subsystem 子系统名称
         * @param {number} limit 返回数量限制
         * @param {number} offset 偏移量
         * @returns {Array<Object>} 日志条目数组
         */
        static getLogsBySubsystem(subsystem, limit = 100, offset = 0) {
            return KernelLogger.queryLogs({ subsystem, limit, offset });
        }
        
        /**
         * 按日期获取日志
         * @param {string} date 日期（格式：'YYYY-MM-DD'）
         * @param {number} limit 返回数量限制
         * @param {number} offset 偏移量
         * @returns {Array<Object>} 日志条目数组
         */
        static getLogsByDate(date, limit = 100, offset = 0) {
            return KernelLogger.queryLogs({ date, limit, offset });
        }
        
        /**
         * 按时间范围获取日志
         * @param {number} startTime 开始时间戳（毫秒）
         * @param {number} endTime 结束时间戳（毫秒）
         * @param {number} limit 返回数量限制
         * @param {number} offset 偏移量
         * @returns {Array<Object>} 日志条目数组
         */
        static getLogsByTimeRange(startTime, endTime, limit = 100, offset = 0) {
            return KernelLogger.queryLogs({ startTime, endTime, limit, offset });
        }
        
        /**
         * 搜索日志（关键词搜索）
         * @param {string} keyword 关键词
         * @param {number} limit 返回数量限制
         * @param {number} offset 偏移量
         * @returns {Array<Object>} 日志条目数组
         */
        static searchLogs(keyword, limit = 100, offset = 0) {
            return KernelLogger.queryLogs({ keyword, limit, offset });
        }
        
        /**
         * 获取最近的日志
         * @param {number} count 数量（默认：100）
         * @returns {Array<Object>} 日志条目数组
         */
        static getRecentLogs(count = 100) {
            return KernelLogger.queryLogs({ limit: count, reverse: true });
        }
        
        /**
         * 获取所有可用的子系统列表
         * @returns {Array<string>} 子系统名称数组
         */
        static getSubsystems() {
            return Object.keys(KernelLogger._logIndex.bySubsystem);
        }
        
        /**
         * 获取所有可用的日期列表
         * @returns {Array<string>} 日期数组
         */
        static getDates() {
            return Object.keys(KernelLogger._logIndex.byDate).sort().reverse();
        }
        
        /**
         * 清空日志缓冲区（谨慎使用）
         */
        static clearLogs() {
            KernelLogger._logBuffer = [];
            KernelLogger._logIndex = {
                byLevel: { DEBUG: [], INFO: [], WARN: [], ERROR: [] },
                bySubsystem: {},
                byTime: [],
                byDate: {},
                bySourceFile: {}
            };
            KernelLogger._statistics = {
                total: 0,
                byLevel: { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 },
                bySubsystem: {},
                oldestTimestamp: null,
                newestTimestamp: null
            };
        }
        
        /**
         * 设置日志收集是否启用
         * @param {boolean} enabled 是否启用
         */
        static setCollectionEnabled(enabled) {
            KernelLogger._enableCollection = !!enabled;
        }
        
        /**
         * 设置日志缓冲区大小
         * @param {number} size 缓冲区大小
         */
        static setMaxBufferSize(size) {
            KernelLogger._maxBufferSize = Math.max(100, Math.min(100000, size));
            // 如果当前缓冲区超过新的大小，清理旧日志
            if (KernelLogger._logBuffer.length > KernelLogger._maxBufferSize) {
                KernelLogger._cleanupOldLogs();
            }
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
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SERVICE,
                    `KernelLogger.POOL注册失败: ${e.message}`,
                    { error: e.message, stack: e.stack }
                ).catch(() => { });
            }
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
})(typeof window !== 'undefined' ? window : globalThis);
