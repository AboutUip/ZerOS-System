// 本地存储管理器
// 负责本地数据的管理、注册等操作
// 所有系统依赖的本地数据和程序的本地数据都存储在 {partition}/LocalSData.json 文件中（支持A-Z所有分区）
// 通过 PHP 服务 (FSDirve.php) 进行文件读写操作

KernelLogger.info("LStorage", "模块初始化");

class LStorage {
    // 存储文件路径（支持A-Z所有分区，默认D:，如果D:不存在则使用第一个可用分区）
    static _storagePartition = "D:";
    static STORAGE_FILE_PATH = "D:/"; // 向后兼容，通过 getter 动态获取
    
    // 当前调用上下文 PID（由 ProcessManager 设置）
    static _currentContextPid = null;;
    static STORAGE_FILE_NAME = "LocalSData.json";
    
    // ApplicationTable 文件路径（独立文件，使用相同的分区）
    static APPLICATION_TABLE_FILE_PATH = "D:/"; // 向后兼容，通过 getter 动态获取
    static APPLICATION_TABLE_FILE_NAME = "ApplicationTable.json";
    
    /**
     * 获取存储分区路径（支持A-Z所有分区）
     * 优先使用D:，如果D:不存在则使用第一个可用分区
     * @returns {string} 分区路径（如 "D:"）
     */
    static _getStoragePartition() {
        return LStorage._storagePartition;
    }
    
    /**
     * 检测并设置存储分区（支持A-Z所有分区）
     * 优先使用D:，如果D:不存在则使用第一个可用分区
     * @returns {Promise<string>} 检测到的分区路径
     */
    static async _detectStoragePartition() {
        try {
            // 尝试从 Disk API 获取分区列表
            if (typeof Disk !== 'undefined' && Disk.diskSeparateMap) {
                const diskMap = Disk.diskSeparateMap;
                if (diskMap && diskMap.size > 0) {
                    // 优先使用 D:
                    if (diskMap.has('D:')) {
                        LStorage._storagePartition = 'D:';
                        LStorage.STORAGE_FILE_PATH = 'D:/';
                        LStorage.APPLICATION_TABLE_FILE_PATH = 'D:/';
                        KernelLogger.info("LStorage", `检测到存储分区: D:`);
                        return 'D:';
                    }
                    
                    // 如果 D: 不存在，使用第一个可用分区
                    const partitions = Array.from(diskMap.keys()).sort();
                    if (partitions.length > 0) {
                        const firstPartition = partitions[0];
                        LStorage._storagePartition = firstPartition;
                        LStorage.STORAGE_FILE_PATH = `${firstPartition}/`;
                        LStorage.APPLICATION_TABLE_FILE_PATH = `${firstPartition}/`;
                        KernelLogger.info("LStorage", `D: 分区不存在，使用第一个可用分区: ${firstPartition}`);
                        return firstPartition;
                    }
                }
            }
            
            // 如果 Disk API 不可用，尝试通过 POOL 检测
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                // 优先检查 D:
                try {
                    const dPartition = POOL.__GET__("KERNEL_GLOBAL_POOL", "D:");
                    if (dPartition) {
                        LStorage._storagePartition = 'D:';
                        LStorage.STORAGE_FILE_PATH = 'D:/';
                        LStorage.APPLICATION_TABLE_FILE_PATH = 'D:/';
                        KernelLogger.info("LStorage", `从 POOL 检测到存储分区: D:`);
                        return 'D:';
                    }
                } catch (e) {
                    // D: 不存在，继续检测其他分区
                }
                
                // 检查所有可能的分区（A-Z）
                for (let i = 0; i < 26; i++) {
                    const partitionLetter = String.fromCharCode(65 + i); // A-Z
                    const partitionName = `${partitionLetter}:`;
                    try {
                        const partition = POOL.__GET__("KERNEL_GLOBAL_POOL", partitionName);
                        if (partition) {
                            LStorage._storagePartition = partitionName;
                            LStorage.STORAGE_FILE_PATH = `${partitionName}/`;
                            LStorage.APPLICATION_TABLE_FILE_PATH = `${partitionName}/`;
                            KernelLogger.info("LStorage", `从 POOL 检测到存储分区: ${partitionName}`);
                            return partitionName;
                        }
                    } catch (e) {
                        // 分区不存在，继续检测
                    }
                }
            }
            
            // 如果都不可用，使用默认的 D:（向后兼容）
            KernelLogger.warn("LStorage", "无法检测分区，使用默认分区: D:");
            LStorage._storagePartition = 'D:';
            LStorage.STORAGE_FILE_PATH = 'D:/';
            LStorage.APPLICATION_TABLE_FILE_PATH = 'D:/';
            return 'D:';
        } catch (error) {
            KernelLogger.warn("LStorage", `检测分区失败: ${error.message}，使用默认分区: D:`);
            LStorage._storagePartition = 'D:';
            LStorage.STORAGE_FILE_PATH = 'D:/';
            LStorage.APPLICATION_TABLE_FILE_PATH = 'D:/';
            return 'D:';
        }
    }
    
    // PHP 服务地址（已废弃，使用 SystemInformation.getFSDirvePath() 替代）
    static PHP_SERVICE_URL = "/system/service/FSDirve.php";
    
    // 存储数据结构
    // {
    //     system: {
    //         // 系统依赖的本地数据
    //         [key: string]: any
    //     },
    //     programs: {
    //         // 程序的本地数据
    //         [pid: number]: {
    //             [key: string]: any
    //         }
    //     }
    // }
    static _storageData = null;
    static _initialized = false;
    
    // 请求缓存（避免频繁请求）
    static _requestCache = {
        readCache: null,
        readCacheTime: 0,
        cacheTTL: 1000 // 1秒缓存
    };
    
    /**
     * 规范化路径（移除末尾斜杠，除非是根路径如 "D:"）
     * @param {string} path 路径
     * @returns {string} 规范化后的路径
     */
    static _normalizePath(path) {
        if (!path || typeof path !== 'string') {
            return path;
        }
        // 如果路径是 "D:" 或 "C:" 这种格式，保持不变
        if (/^[A-Z]:$/.test(path)) {
            return path;
        }
        // 去掉末尾的斜杠
        return path.replace(/\/+$/, '');
    }
    
    /**
     * 初始化本地存储管理器
     * @returns {Promise<void>}
     */
    static async init() {
        if (LStorage._initialized) {
            KernelLogger.debug("LStorage", "已初始化，跳过");
            return;
        }
        
        KernelLogger.info("LStorage", "初始化本地存储管理器");
        
        try {
            // 加载存储数据（允许在加载时保存新文件）
            await LStorage._loadStorageData(true);
            LStorage._initialized = true;
            KernelLogger.info("LStorage", "本地存储管理器初始化完成");
        } catch (error) {
            KernelLogger.error("LStorage", `初始化失败: ${error.message}`, error);
            // 初始化失败时使用空数据结构
            LStorage._storageData = {
                system: {},
                programs: {}
            };
            LStorage._initialized = true;
        }
    }
    
    /**
     * 通过 PHP 服务读取文件
     * @param {string} path 文件路径（如 "D:"）
     * @param {string} fileName 文件名（如 "LocalSData.json"）
     * @returns {Promise<string|null>} 文件内容，失败返回 null
     */
    static async _readFileFromPHP(path, fileName) {
        try {
            const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                    ? SystemInformation.getOrigin()
                    : window.location.origin);
            url.searchParams.set('action', 'read_file');
            url.searchParams.set('path', LStorage._normalizePath(path));
            url.searchParams.set('fileName', fileName);
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                // 404 表示文件不存在，这是正常的
                if (response.status === 404) {
                    KernelLogger.debug("LStorage", `文件不存在: ${path}/${fileName}`);
                    return null;
                }
                // 尝试读取错误响应内容
                const contentType = response.headers.get('content-type');
                let errorText = `HTTP ${response.status}: ${response.statusText}`;
                if (contentType && contentType.includes('text/html')) {
                    const htmlText = await response.text();
                    errorText += `\nPHP 错误响应: ${htmlText.substring(0, 500)}`;
                }
                throw new Error(errorText);
            }
            
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
            }
            
            // 先读取文本内容，检查是否为空
            const responseText = await response.text();
            if (!responseText || responseText.trim() === '') {
                KernelLogger.debug("LStorage", `PHP 返回空响应: ${path}/${fileName}`);
                return null;
            }
            
            // 尝试解析 JSON
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (jsonError) {
                // JSON 解析失败，可能是 PHP 错误或空响应
                KernelLogger.warn("LStorage", `PHP 返回的 JSON 无效: ${responseText.substring(0, 200)}`);
                // 如果是空响应或无效 JSON，返回 null（表示文件不存在或无法读取）
                if (jsonError.message && jsonError.message.includes('Unexpected end of JSON input')) {
                    KernelLogger.debug("LStorage", `PHP 返回空 JSON，文件可能不存在: ${path}/${fileName}`);
                    return null;
                }
                throw new Error(`JSON 解析失败: ${jsonError.message}`);
            }
            
            if (result.status === 'success' && result.data && result.data.content !== undefined) {
                return result.data.content;
            } else if (result.status === 'error' && result.message && result.message.includes('不存在')) {
                // 文件不存在
                return null;
            } else {
                throw new Error(result.message || '读取文件失败');
            }
        } catch (error) {
            // 网络错误或文件不存在
            if (error.message && (error.message.includes('不存在') || error.message.includes('Unexpected end of JSON input'))) {
                KernelLogger.debug("LStorage", `文件不存在或响应为空: ${path}/${fileName}`);
                return null;
            }
            KernelLogger.error("LStorage", `通过 PHP 读取文件失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 通过 PHP 服务写入文件
     * @param {string} path 文件路径（如 "D:"）
     * @param {string} fileName 文件名（如 "LocalSData.json"）
     * @param {string} content 文件内容
     * @param {string} writeMod 写入模式（'overwrite', 'append', 'prepend'）
     * @returns {Promise<boolean>} 是否成功
     */
    static async _writeFileToPHP(path, fileName, content, writeMod = 'overwrite') {
        try {
            const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                    ? SystemInformation.getOrigin()
                    : window.location.origin);
            url.searchParams.set('action', 'write_file');
            url.searchParams.set('path', LStorage._normalizePath(path));
            url.searchParams.set('fileName', fileName);
            url.searchParams.set('writeMod', writeMod);
            
            const contentSize = typeof content === 'string' ? content.length : JSON.stringify(content).length;
            KernelLogger.debug("LStorage", `准备写入文件: ${path}/${fileName}, 内容大小: ${contentSize} 字节, 模式: ${writeMod}`);
            
            // 使用 POST 请求传递内容（避免 URL 过长）
            const requestBody = JSON.stringify({ content: content });
            KernelLogger.debug("LStorage", `POST 请求体大小: ${requestBody.length} 字节`);
            
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: requestBody
            });
            
            KernelLogger.debug("LStorage", `PHP 响应状态: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                // 尝试读取错误响应内容
                const contentType = response.headers.get('content-type');
                let errorText = `HTTP ${response.status}: ${response.statusText}`;
                if (contentType && contentType.includes('text/html')) {
                    const htmlText = await response.text();
                    errorText += `\nPHP 错误响应: ${htmlText.substring(0, 500)}`;
                } else {
                    try {
                        const errorJson = await response.json();
                        errorText += `\nPHP 错误: ${JSON.stringify(errorJson)}`;
                    } catch (e) {
                        const errorText2 = await response.text();
                        errorText += `\nPHP 错误响应: ${errorText2.substring(0, 500)}`;
                    }
                }
                KernelLogger.error("LStorage", `PHP 写入文件失败: ${errorText}`);
                throw new Error(errorText);
            }
            
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                KernelLogger.error("LStorage", `PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
                throw new Error(`PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
            }
            
            const result = await response.json();
            KernelLogger.debug("LStorage", `PHP 响应结果: ${JSON.stringify(result).substring(0, 200)}`);
            
            if (result.status === 'success') {
                // 清除读取缓存
                LStorage._requestCache.readCache = null;
                LStorage._requestCache.readCacheTime = 0;
                KernelLogger.info("LStorage", `文件写入成功: ${path}/${fileName}`);
                return true;
            } else {
                const errorMsg = result.message || '写入文件失败';
                KernelLogger.error("LStorage", `PHP 写入文件失败: ${errorMsg}`);
                throw new Error(errorMsg);
            }
        } catch (error) {
            KernelLogger.error("LStorage", `通过 PHP 写入文件失败: ${error.message}`, error);
            KernelLogger.error("LStorage", `错误堆栈: ${error.stack || '无堆栈信息'}`);
            throw error;
        }
    }
    
    /**
     * 通过 PHP 服务检查文件是否存在
     * @param {string} path 文件路径（如 "D:"）
     * @param {string} fileName 文件名（如 "LocalSData.json"）
     * @returns {Promise<boolean>} 文件是否存在
     */
    static async _fileExistsInPHP(path, fileName) {
        try {
            const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                    ? SystemInformation.getOrigin()
                    : window.location.origin);
            url.searchParams.set('action', 'exists');
            // 规范化路径，避免双斜杠
            const normalizedPath = LStorage._normalizePath(path);
            url.searchParams.set('path', `${normalizedPath}/${fileName}`);
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                return false;
            }
            
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                KernelLogger.warn("LStorage", `PHP 返回了非 JSON 响应: ${text.substring(0, 200)}`);
                return false;
            }
            
            const result = await response.json();
            
            if (result.status === 'success' && result.data && result.data.exists) {
                return result.data.type === 'file';
            }
            
            return false;
        } catch (error) {
            KernelLogger.debug("LStorage", `检查文件是否存在失败: ${error.message}`);
            return false;
        }
    }
    
    /**
     * 通过 PHP 服务创建文件
     * @param {string} path 文件路径（如 "D:"）
     * @param {string} fileName 文件名（如 "LocalSData.json"）
     * @param {string} content 文件内容
     * @returns {Promise<boolean>} 是否成功
     */
    static async _createFileInPHP(path, fileName, content = '') {
        try {
            const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                    ? SystemInformation.getOrigin()
                    : window.location.origin);
            url.searchParams.set('action', 'create_file');
            url.searchParams.set('path', LStorage._normalizePath(path));
            url.searchParams.set('fileName', fileName);
            
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: content })
            });
            
            if (!response.ok) {
                // 409 表示文件已存在，这是正常的
                if (response.status === 409) {
                    KernelLogger.debug("LStorage", `文件已存在: ${path}/${fileName}`);
                    return true; // 视为成功
                }
                // 尝试读取错误响应内容
                const contentType = response.headers.get('content-type');
                let errorText = `HTTP ${response.status}: ${response.statusText}`;
                if (contentType && contentType.includes('text/html')) {
                    const htmlText = await response.text();
                    errorText += `\nPHP 错误响应: ${htmlText.substring(0, 500)}`;
                }
                throw new Error(errorText);
            }
            
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
            }
            
            const result = await response.json();
            
            if (result.status === 'success') {
                // 清除读取缓存
                LStorage._requestCache.readCache = null;
                LStorage._requestCache.readCacheTime = 0;
                return true;
            } else if (result.status === 'error' && result.message && result.message.includes('已存在')) {
                // 文件已存在，视为成功
                return true;
            } else {
                throw new Error(result.message || '创建文件失败');
            }
        } catch (error) {
            // 文件已存在视为成功
            if (error.message && error.message.includes('已存在')) {
                KernelLogger.debug("LStorage", `文件已存在: ${path}/${fileName}`);
                return true;
            }
            KernelLogger.error("LStorage", `通过 PHP 创建文件失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 从文件加载存储数据
     * @param {boolean} allowSave 是否允许保存（初始化时允许）
     * @returns {Promise<void>}
     */
    static async _loadStorageData(allowSave = false) {
        try {
            const filePath = LStorage.STORAGE_FILE_PATH;
            const fileName = LStorage.STORAGE_FILE_NAME;
            
            // 检查缓存
            const now = Date.now();
            if (LStorage._requestCache.readCache !== null && 
                (now - LStorage._requestCache.readCacheTime) < LStorage._requestCache.cacheTTL) {
                KernelLogger.debug("LStorage", "使用缓存数据");
                LStorage._storageData = LStorage._requestCache.readCache;
                return;
            }
            
            // 检查文件是否存在
            const fileExists = await LStorage._fileExistsInPHP(filePath, fileName);
            
            if (!fileExists) {
                KernelLogger.info("LStorage", "存储文件不存在，创建新文件");
                LStorage._storageData = {
                    system: {},
                    programs: {}
                };
                if (allowSave) {
                    // 临时标记为已初始化，允许保存
                    const wasInitialized = LStorage._initialized;
                    LStorage._initialized = true;
                    await LStorage._saveStorageData();
                    LStorage._initialized = wasInitialized;
                }
                return;
            }
            
            // 读取文件内容
            const fileContent = await LStorage._readFileFromPHP(filePath, fileName);
            
            if (!fileContent) {
                KernelLogger.warn("LStorage", "存储文件为空，使用空数据结构");
                LStorage._storageData = {
                    system: {},
                    programs: {}
                };
                return;
            }
            
            // 解析 JSON
            try {
                LStorage._storageData = JSON.parse(fileContent);
                
                // 验证数据结构
                if (!LStorage._storageData || typeof LStorage._storageData !== 'object') {
                    throw new Error('数据结构无效');
                }
                
                if (!LStorage._storageData.system) {
                    LStorage._storageData.system = {};
                }
                if (!LStorage._storageData.programs) {
                    LStorage._storageData.programs = {};
                }
                
                // 更新缓存
                LStorage._requestCache.readCache = LStorage._storageData;
                LStorage._requestCache.readCacheTime = now;
                
                // 记录加载的数据摘要（用于调试）
                const systemKeys = Object.keys(LStorage._storageData.system || {});
                const programCount = Object.keys(LStorage._storageData.programs || {}).length;
                KernelLogger.info("LStorage", `存储数据加载成功 (系统键: ${systemKeys.length}, 程序: ${programCount})`);
                if (systemKeys.length > 0) {
                    KernelLogger.debug("LStorage", `系统存储键: ${systemKeys.join(', ')}`);
                    // 特别检查 userControl.users
                    if (systemKeys.includes('userControl.users')) {
                        const usersData = LStorage._storageData.system['userControl.users'];
                        if (usersData && typeof usersData === 'object') {
                            const userCount = Object.keys(usersData).length;
                            KernelLogger.info("LStorage", `用户数据已加载: ${userCount} 个用户`);
                            // 记录每个用户的密码状态
                            for (const [username, userData] of Object.entries(usersData)) {
                                if (userData && typeof userData === 'object') {
                                    const hasPassword = userData.password !== null && 
                                                      userData.password !== undefined && 
                                                      userData.password !== '';
                                    KernelLogger.debug("LStorage", `用户 ${username}: 密码=${hasPassword ? '有' : '无'}`);
                                }
                            }
                        } else {
                            KernelLogger.warn("LStorage", `userControl.users 数据格式不正确: ${typeof usersData}`);
                        }
                    } else {
                        KernelLogger.warn("LStorage", "userControl.users 键不存在于存储中");
                    }
                }
                // 特别检查 desktop.icons
                if (systemKeys.includes('desktop.icons')) {
                    const iconsData = LStorage._storageData.system['desktop.icons'];
                    const iconCount = Array.isArray(iconsData) ? iconsData.length : 0;
                    KernelLogger.info("LStorage", `桌面图标已加载: ${iconCount} 个图标`);
                } else {
                    KernelLogger.debug("LStorage", "桌面图标数据不存在（首次运行或未保存）");
                }
            } catch (parseError) {
                KernelLogger.error("LStorage", `解析存储文件失败: ${parseError.message}`, parseError);
                
                // 尝试从备份恢复
                try {
                    KernelLogger.info("LStorage", "尝试从备份文件恢复数据...");
                    const backupPath = filePath;
                    const backupFileName = fileName.replace('.json', '_backup.json');
                    const backupContent = await LStorage._readFileFromPHP(backupPath, backupFileName);
                    
                    if (backupContent) {
                        try {
                            const backupData = JSON.parse(backupContent);
                            if (backupData && typeof backupData === 'object') {
                                KernelLogger.info("LStorage", "成功从备份文件恢复数据");
                                LStorage._storageData = backupData;
                                
                                // 确保数据结构正确
                                if (!LStorage._storageData.system) {
                                    LStorage._storageData.system = {};
                                }
                                if (!LStorage._storageData.programs) {
                                    LStorage._storageData.programs = {};
                                }
                                
                                // 尝试修复并保存
                                try {
                                    await LStorage._saveStorageData();
                                    KernelLogger.info("LStorage", "已从备份恢复并重新保存数据");
                                } catch (saveError) {
                                    KernelLogger.warn("LStorage", `从备份恢复后保存失败: ${saveError.message}`);
                                }
                                return;
                            }
                        } catch (backupParseError) {
                            KernelLogger.warn("LStorage", `备份文件也损坏: ${backupParseError.message}`);
                        }
                    }
                } catch (backupError) {
                    KernelLogger.debug("LStorage", `无法读取备份文件: ${backupError.message}`);
                }
                
                // 如果备份恢复失败，创建损坏文件的备份并初始化空数据
                try {
                    KernelLogger.warn("LStorage", "创建损坏文件的备份...");
                    const corruptedContent = await LStorage._readFileFromPHP(filePath, fileName);
                    if (corruptedContent) {
                        const backupFileName = fileName.replace('.json', '_corrupted_' + Date.now() + '.json');
                        await LStorage._writeFileToPHP(filePath, backupFileName, corruptedContent, 'create');
                        KernelLogger.info("LStorage", `损坏的文件已备份为: ${backupFileName}`);
                    }
                } catch (backupError) {
                    KernelLogger.warn("LStorage", `创建损坏文件备份失败: ${backupError.message}`);
                }
                
                // 使用空数据结构
                LStorage._storageData = {
                    system: {},
                    programs: {}
                };
            }
        } catch (error) {
            KernelLogger.error("LStorage", `加载存储数据失败: ${error.message}`, error);
            LStorage._storageData = {
                system: {},
                programs: {}
            };
        }
    }
    
    /**
     * 保存存储数据到文件
     * @returns {Promise<void>}
     */
    static async _saveStorageData() {
        if (!LStorage._initialized) {
            KernelLogger.warn("LStorage", "未初始化，无法保存");
            throw new Error("LStorage 未初始化");
        }
        
        try {
            // 数据完整性检查：防止保存空数据或无效数据
            if (!LStorage._storageData || typeof LStorage._storageData !== 'object') {
                KernelLogger.error("LStorage", "存储数据无效或为空，拒绝保存以防止数据丢失");
                throw new Error("存储数据无效或为空，无法保存");
            }
            
            // 确保 system 和 programs 存在（但不重置已有数据）
            // 注意：这里只检查是否存在，如果不存在才创建，不会重置已有数据
            if (!LStorage._storageData.hasOwnProperty('system') || !LStorage._storageData.system || typeof LStorage._storageData.system !== 'object') {
                if (!LStorage._storageData.hasOwnProperty('system')) {
                    // system 属性不存在，创建它
                    LStorage._storageData.system = {};
                } else if (LStorage._storageData.system === null || typeof LStorage._storageData.system !== 'object') {
                    // system 存在但类型不对，记录警告但不重置（保留原有数据）
                    KernelLogger.warn("LStorage", "system 数据类型异常，但保留现有数据");
                    // 只有在确实是 null 或非对象时才重置
                    if (LStorage._storageData.system === null) {
                        LStorage._storageData.system = {};
                    }
                }
            }
            if (!LStorage._storageData.hasOwnProperty('programs') || !LStorage._storageData.programs || typeof LStorage._storageData.programs !== 'object') {
                if (!LStorage._storageData.hasOwnProperty('programs')) {
                    LStorage._storageData.programs = {};
                } else if (LStorage._storageData.programs === null || typeof LStorage._storageData.programs !== 'object') {
                    KernelLogger.warn("LStorage", "programs 数据类型异常，但保留现有数据");
                    if (LStorage._storageData.programs === null) {
                        LStorage._storageData.programs = {};
                    }
                }
            }
            
            // 检查数据是否为空（防止意外清空文件）
            const systemKeys = Object.keys(LStorage._storageData.system);
            const programsKeys = Object.keys(LStorage._storageData.programs);
            if (systemKeys.length === 0 && programsKeys.length === 0) {
                KernelLogger.warn("LStorage", "存储数据完全为空，但允许保存（可能是新文件）");
            }
            
            const filePath = LStorage.STORAGE_FILE_PATH;
            const fileName = LStorage.STORAGE_FILE_NAME;
            
            // 将数据转换为 JSON 字符串
            let jsonString;
            try {
                jsonString = JSON.stringify(LStorage._storageData, null, 2);
            } catch (stringifyError) {
                KernelLogger.error("LStorage", `JSON 序列化失败: ${stringifyError.message}`, stringifyError);
                throw new Error(`JSON 序列化失败: ${stringifyError.message}`);
            }
            
            KernelLogger.debug("LStorage", `准备保存存储数据: ${filePath}/${fileName}, JSON 大小: ${jsonString.length} 字节`);
            
            // 验证 JSON 字符串是否有效
            if (!jsonString || jsonString === '{}' || jsonString === 'null') {
                KernelLogger.error("LStorage", "JSON 字符串无效或为空，拒绝保存");
                throw new Error("JSON 字符串无效或为空，无法保存");
            }
            
            // 验证 JSON 字符串是否可以正确解析（双重验证）
            try {
                JSON.parse(jsonString);
            } catch (parseError) {
                KernelLogger.error("LStorage", `生成的 JSON 字符串无效，无法解析: ${parseError.message}`);
                throw new Error(`生成的 JSON 字符串无效: ${parseError.message}`);
            }
            
            // 创建备份（在保存前）
            try {
                const fileExists = await LStorage._fileExistsInPHP(filePath, fileName);
                if (fileExists) {
                    const currentContent = await LStorage._readFileFromPHP(filePath, fileName);
                    if (currentContent) {
                        const backupFileName = fileName.replace('.json', '_backup.json');
                        await LStorage._writeFileToPHP(filePath, backupFileName, currentContent, 'overwrite');
                        KernelLogger.debug("LStorage", `已创建备份文件: ${backupFileName}`);
                    }
                }
            } catch (backupError) {
                KernelLogger.warn("LStorage", `创建备份文件失败: ${backupError.message}，继续保存操作`);
            }
            
            // 特别检查 desktop.icons 是否存在
            if (LStorage._storageData.system && LStorage._storageData.system['desktop.icons']) {
                const iconsData = LStorage._storageData.system['desktop.icons'];
                const iconCount = Array.isArray(iconsData) ? iconsData.length : 0;
                KernelLogger.info("LStorage", `准备保存桌面图标: ${iconCount} 个图标`);
                if (iconCount > 0) {
                    KernelLogger.debug("LStorage", `桌面图标数据: ${JSON.stringify(iconsData).substring(0, 500)}...`);
                }
            }
            
            // 检查文件是否存在
            const fileExists = await LStorage._fileExistsInPHP(filePath, fileName);
            KernelLogger.debug("LStorage", `文件存在检查: ${filePath}/${fileName} = ${fileExists}`);
            
            try {
                if (!fileExists) {
                    // 文件不存在，创建文件
                    KernelLogger.info("LStorage", `创建存储文件: ${filePath}/${fileName}`);
                    await LStorage._createFileInPHP(filePath, fileName, jsonString);
                } else {
                    // 文件存在，写入文件（覆盖模式）
                    await LStorage._writeFileToPHP(filePath, fileName, jsonString, 'overwrite');
                }
            } catch (writeError) {
                KernelLogger.error("LStorage", `写入文件失败: ${writeError.message}`, writeError);
                // 尝试从备份恢复
                try {
                    const backupFileName = fileName.replace('.json', '_backup.json');
                    const backupContent = await LStorage._readFileFromPHP(filePath, backupFileName);
                    if (backupContent) {
                        KernelLogger.info("LStorage", "写入失败，尝试从备份恢复数据...");
                        const backupData = JSON.parse(backupContent);
                        if (backupData && typeof backupData === 'object') {
                            LStorage._storageData = backupData;
                            // 确保数据结构正确
                            if (!LStorage._storageData.system) {
                                LStorage._storageData.system = {};
                            }
                            if (!LStorage._storageData.programs) {
                                LStorage._storageData.programs = {};
                            }
                            KernelLogger.info("LStorage", "已从备份恢复数据");
                        }
                    }
                } catch (recoverError) {
                    KernelLogger.error("LStorage", `从备份恢复失败: ${recoverError.message}`);
                }
                throw writeError;
            }
            
            // 验证保存是否真的成功（读取文件验证，带重试机制）
            try {
                KernelLogger.debug("LStorage", `验证文件是否保存成功: ${filePath}/${fileName}`);
                
                // 添加短暂延迟，确保文件写入完成（某些文件系统可能需要）
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // 重试读取（最多3次）
                let savedContent = null;
                let retryCount = 0;
                const maxRetries = 3;
                
                while (retryCount < maxRetries && !savedContent) {
                    try {
                        savedContent = await LStorage._readFileFromPHP(filePath, fileName);
                        if (savedContent) {
                            break;
                        }
                    } catch (readError) {
                        KernelLogger.debug("LStorage", `验证读取失败 (尝试 ${retryCount + 1}/${maxRetries}): ${readError.message}`);
                    }
                    
                    if (!savedContent && retryCount < maxRetries - 1) {
                        // 等待后重试
                        await new Promise(resolve => setTimeout(resolve, 100 * (retryCount + 1)));
                    }
                    retryCount++;
                }
                
                if (savedContent) {
                    try {
                        const savedData = JSON.parse(savedContent);
                        const savedSystemKeys = Object.keys(savedData.system || {});
                        KernelLogger.info("LStorage", `文件保存验证成功: 系统键数量=${savedSystemKeys.length}`);
                        
                        // 特别验证 desktop.icons
                        if (savedData.system && savedData.system['desktop.icons']) {
                            const savedIcons = savedData.system['desktop.icons'];
                            const savedIconCount = Array.isArray(savedIcons) ? savedIcons.length : 0;
                            KernelLogger.info("LStorage", `桌面图标保存验证成功: ${savedIconCount} 个图标已确认保存到文件`);
                        } else {
                            KernelLogger.debug("LStorage", "桌面图标保存验证: 文件中没有 desktop.icons 数据（可能是正常的）");
                        }
                        
                        // 特别验证 localDesktopBackgrounds
                        if (savedData.system && savedData.system['system.localDesktopBackgrounds']) {
                            const savedBackgrounds = savedData.system['system.localDesktopBackgrounds'];
                            const savedBgCount = Array.isArray(savedBackgrounds) ? savedBackgrounds.length : 0;
                            const memoryBgCount = Array.isArray(LStorage._storageData.system['system.localDesktopBackgrounds']) ? LStorage._storageData.system['system.localDesktopBackgrounds'].length : 0;
                            if (savedBgCount === memoryBgCount) {
                                KernelLogger.info("LStorage", `本地桌面背景保存验证成功: ${savedBgCount} 个背景已确认保存到文件`);
                            } else {
                                KernelLogger.warn("LStorage", `本地桌面背景保存验证失败: 文件中有 ${savedBgCount} 个背景，内存中有 ${memoryBgCount} 个背景`);
                            }
                        }
                    } catch (parseError) {
                        KernelLogger.warn("LStorage", `文件保存验证失败: 无法解析读取的文件内容 - ${parseError.message}`);
                    }
                } else {
                    // 验证失败，但不影响保存操作（可能是文件系统延迟）
                    KernelLogger.warn("LStorage", `文件保存验证失败: 无法读取保存的文件 (重试 ${retryCount} 次后仍失败)。文件可能已保存，但验证读取失败。`);
                }
            } catch (verifyError) {
                // 验证失败不应该影响保存操作
                KernelLogger.warn("LStorage", `文件保存验证失败: ${verifyError.message}。文件可能已保存，但验证过程出错。`, verifyError);
            }
            
            // 更新缓存
            LStorage._requestCache.readCache = LStorage._storageData;
            LStorage._requestCache.readCacheTime = Date.now();
            
            // 记录保存的数据摘要（用于调试）
            const savedSystemKeys = Object.keys(LStorage._storageData.system || {});
            const savedDataSize = jsonString.length;
            KernelLogger.info("LStorage", `存储数据保存成功 (大小: ${savedDataSize} 字节, 系统键: ${savedSystemKeys.length})`);
            if (savedSystemKeys.length > 0) {
                KernelLogger.debug("LStorage", `保存的系统存储键: ${savedSystemKeys.join(', ')}`);
            }
            if (savedSystemKeys.includes('desktop.icons')) {
                const iconsData = LStorage._storageData.system['desktop.icons'];
                const iconCount = Array.isArray(iconsData) ? iconsData.length : 0;
                KernelLogger.info("LStorage", `桌面图标已保存到文件: ${iconCount} 个图标`);
                if (iconCount > 0) {
                    KernelLogger.debug("LStorage", `桌面图标数据示例: ${JSON.stringify(iconsData[0]).substring(0, 200)}...`);
                }
            }
            if (systemKeys.includes('system.desktopBackground')) {
                KernelLogger.debug("LStorage", `桌面背景已保存到文件: ${LStorage._storageData.system['system.desktopBackground']}`);
            }
            if (systemKeys.includes('system.localDesktopBackgrounds')) {
                const backgroundsData = LStorage._storageData.system['system.localDesktopBackgrounds'];
                const bgCount = Array.isArray(backgroundsData) ? backgroundsData.length : 0;
                KernelLogger.info("LStorage", `本地桌面背景已保存到文件: ${bgCount} 个背景`);
                if (bgCount > 0) {
                    KernelLogger.debug("LStorage", `本地桌面背景数据示例: ${JSON.stringify(backgroundsData[bgCount - 1]).substring(0, 200)}...`);
                }
            }
            
            // 验证保存是否真的成功（可选：读取文件验证，但会增加性能开销）
            // 这里我们只验证内存中的数据是否正确
            KernelLogger.debug("LStorage", `保存完成，文件路径: ${filePath}/${fileName}`);
        } catch (error) {
            KernelLogger.error("LStorage", `保存存储数据失败: ${error.message}`, error);
            throw error; // 重新抛出错误，让调用者知道保存失败
        }
    }
    
    /**
     * 注册程序的本地存储申请
     * @param {number} pid 进程ID
     * @param {string} key 存储键
     * @param {any} defaultValue 默认值（可选）
     * @returns {Promise<boolean>} 是否成功
     */
    static async registerProgramStorage(pid, key, defaultValue = null) {
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        
        KernelLogger.info("LStorage", `注册程序存储: PID=${pid}, Key=${key}`);
        
        try {
            // 确保程序数据对象存在
            if (!LStorage._storageData.programs[pid]) {
                LStorage._storageData.programs[pid] = {};
            }
            
            // 如果键不存在，设置默认值
            if (!(key in LStorage._storageData.programs[pid])) {
                LStorage._storageData.programs[pid][key] = defaultValue;
            }
            
            // 保存到文件
            await LStorage._saveStorageData();
            
            KernelLogger.info("LStorage", `程序存储注册成功: PID=${pid}, Key=${key}`);
            return true;
        } catch (error) {
            KernelLogger.error("LStorage", `注册程序存储失败: ${error.message}`, error);
            return false;
        }
    }
    
    /**
     * 读取程序的本地存储数据
     * @param {number} pid 进程ID
     * @param {string} key 存储键
     * @returns {Promise<any>} 存储的值，如果不存在返回 null
     */
    static async getProgramStorage(pid, key) {
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        
        try {
            if (!LStorage._storageData.programs[pid]) {
                return null;
            }
            
            return LStorage._storageData.programs[pid][key] ?? null;
        } catch (error) {
            KernelLogger.error("LStorage", `读取程序存储失败: ${error.message}`, error);
            return null;
        }
    }
    
    /**
     * 写入程序的本地存储数据
     * @param {number} pid 进程ID
     * @param {string} key 存储键
     * @param {any} value 存储的值
     * @returns {Promise<boolean>} 是否成功
     */
    static async setProgramStorage(pid, key, value) {
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        
        KernelLogger.info("LStorage", `写入程序存储: PID=${pid}, Key=${key}`);
        
        try {
            // 确保程序数据对象存在
            if (!LStorage._storageData.programs[pid]) {
                LStorage._storageData.programs[pid] = {};
            }
            
            // 设置值
            LStorage._storageData.programs[pid][key] = value;
            
            // 保存到文件
            await LStorage._saveStorageData();
            
            KernelLogger.debug("LStorage", `程序存储写入成功: PID=${pid}, Key=${key}`);
            return true;
        } catch (error) {
            KernelLogger.error("LStorage", `写入程序存储失败: ${error.message}`, error);
            return false;
        }
    }
    
    /**
     * 删除程序的本地存储数据
     * @param {number} pid 进程ID
     * @param {string} key 存储键（可选，如果不提供则删除整个程序的数据）
     * @returns {Promise<boolean>} 是否成功
     */
    static async deleteProgramStorage(pid, key = null) {
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        
        KernelLogger.info("LStorage", `删除程序存储: PID=${pid}, Key=${key || 'all'}`);
        
        try {
            if (!LStorage._storageData.programs[pid]) {
                return true; // 不存在，视为成功
            }
            
            if (key === null) {
                // 删除整个程序的数据
                delete LStorage._storageData.programs[pid];
            } else {
                // 删除指定的键
                delete LStorage._storageData.programs[pid][key];
            }
            
            // 保存到文件
            await LStorage._saveStorageData();
            
            KernelLogger.info("LStorage", `程序存储删除成功: PID=${pid}, Key=${key || 'all'}`);
            return true;
        } catch (error) {
            KernelLogger.error("LStorage", `删除程序存储失败: ${error.message}`, error);
            return false;
        }
    }
    
    /**
     * 读取系统本地存储数据
     * @param {string} key 存储键
     * @returns {Promise<any>} 存储的值，如果不存在返回 null
     */
    static async getSystemStorage(key) {
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        
        // 特殊处理：applicationTable 存储在独立的文件中
        if (key === 'applicationTable') {
            return await LStorage._getApplicationTable();
        }
        
        // 检查是否为内核模块调用
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        // 检查是否处于BIOS模式（BIOS享有最高权限，可以访问所有系统存储）
        const isBIOSMode = LStorage._isBIOSMode();
        
        // 获取调用栈（用于系统加载期间的检查）
        let fullCallStack = '';
        try {
            const stackError = new Error();
            fullCallStack = stackError.stack || '';
        } catch (e) {
            // 忽略错误
        }
        
        // 获取当前进程PID（通过调用栈分析）
        // 注意：对于内核模块调用，PID 可能为 null，这是正常的
        const currentPid = LStorage._getCurrentPid();
        
        // 调试日志：记录调用信息（对敏感键或无法获取PID的情况）
        const isSensitiveKeyCheck = key.startsWith('userControl.') || key.startsWith('permissionControl.') || key === 'permissionManager.permissions' || key === 'permissionManager.denialCounts';
        if (isSensitiveKeyCheck || !isKernelModuleCall || !currentPid) {
            KernelLogger.debug("LStorage", `调用检测 - 键: ${key}, 内核模块: ${isKernelModuleCall}, PID: ${currentPid || 'null'}`);
        }
        
        // 定义敏感存储键及其所需权限（需要危险权限，仅管理员可授予）
        const SENSITIVE_KEY_PERMISSIONS = {};
        if (typeof PermissionManager !== 'undefined' && PermissionManager.PERMISSION) {
            // 用户控制相关键（危险权限，仅管理员可授予）
            SENSITIVE_KEY_PERMISSIONS['userControl.users'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL;
            SENSITIVE_KEY_PERMISSIONS['userControl.groups'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL;
            SENSITIVE_KEY_PERMISSIONS['userControl.settings'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL;
            SENSITIVE_KEY_PERMISSIONS['userControl.currentUser'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL;
            
            // 权限控制相关键（危险权限，仅管理员可授予）
            SENSITIVE_KEY_PERMISSIONS['permissionControl.blacklist'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_PERMISSION_CONTROL;
            SENSITIVE_KEY_PERMISSIONS['permissionControl.whitelist'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_PERMISSION_CONTROL;
            SENSITIVE_KEY_PERMISSIONS['permissionControl.settings'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_PERMISSION_CONTROL;
            SENSITIVE_KEY_PERMISSIONS['permissionManager.permissions'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_PERMISSION_CONTROL;
        }
        
        // 检查是否为敏感键
        const isSensitiveKey = key in SENSITIVE_KEY_PERMISSIONS;
        const requiredPermission = SENSITIVE_KEY_PERMISSIONS[key];
        
        // 检查系统是否正在加载中（通过POOL标志位）
        let isSystemLoading = false;
        if (typeof POOL !== 'undefined' && typeof POOL.__IS_SYSTEM_LOADING__ === 'function') {
            isSystemLoading = POOL.__IS_SYSTEM_LOADING__();
            KernelLogger.debug("LStorage", `检查系统加载状态 - 键: ${key}, isSystemLoading: ${isSystemLoading}, isSensitiveKey: ${isSensitiveKey}`);
        } else {
            KernelLogger.debug("LStorage", `POOL 或 __IS_SYSTEM_LOADING__ 不可用 - 键: ${key}`);
        }
        
        if (isSensitiveKey) {
            // 对于敏感键，即使是内核模块调用，也要进行严格验证
            const isUserControlKey = key.startsWith('userControl.');
            const isPermissionControlKey = key.startsWith('permissionControl.') || key === 'permissionManager.permissions' || key === 'permissionManager.denialCounts';
            
            KernelLogger.debug("LStorage", `敏感键检查 - 键: ${key}, isUserControlKey: ${isUserControlKey}, isPermissionControlKey: ${isPermissionControlKey}, isSystemLoading: ${isSystemLoading}`);
            
            // 如果系统正在加载中（依赖POOL标志位），允许内核模块访问敏感键
            // 只需要检查调用栈中是否包含相应的内核模块标识即可
            if (isSystemLoading) {
                KernelLogger.debug("LStorage", `系统加载中（POOL标志位），检查敏感键 ${key}，isUserControlKey: ${isUserControlKey}, isPermissionControlKey: ${isPermissionControlKey}`);
                let allowedInSystemLoading = false;
                
                // 检查 UserControl 模块
                if (isUserControlKey) {
                    const hasUserControlPath = /kernel[\/\\]core[\/\\]usercontrol[\/\\]/i.test(fullCallStack);
                    const hasUserControlName = /userControl/i.test(fullCallStack);
                    if (hasUserControlPath || hasUserControlName) {
                        allowedInSystemLoading = true;
                        KernelLogger.debug("LStorage", `系统加载中（POOL标志位），检测到 UserControl 调用，允许读取 ${key}`);
                    } else {
                        KernelLogger.debug("LStorage", `系统加载中（POOL标志位），UserControl 调用栈检查失败，调用栈片段: ${fullCallStack.substring(0, 500)}`);
                    }
                }
                // 检查 PermissionManager 模块（独立检查，不依赖 allowedInSystemLoading）
                if (isPermissionControlKey) {
                    // 更宽松的匹配：检查调用栈中是否包含 permissionManager 相关的标识
                    // 包括：permissionManager.js, permissionManager, _loadPermissions, _loadDenialCounts 等
                    const hasPermissionManagerPath = /kernel[\/\\]process[\/\\].*permissionManager/i.test(fullCallStack);
                    const hasPermissionManagerName = /permissionManager/i.test(fullCallStack);
                    const hasLoadPermissions = /_loadPermissions/i.test(fullCallStack);
                    const hasLoadDenialCounts = /_loadDenialCounts/i.test(fullCallStack);
                    const hasPermissionManagerFile = /permissionManager\.js/i.test(fullCallStack);
                    
                    KernelLogger.debug("LStorage", `系统加载中（POOL标志位），PermissionManager 检查 - hasPath: ${hasPermissionManagerPath}, hasName: ${hasPermissionManagerName}, hasLoadPermissions: ${hasLoadPermissions}, hasLoadDenialCounts: ${hasLoadDenialCounts}, hasFile: ${hasPermissionManagerFile}`);
                    
                    // 在系统加载期间，如果键是 permissionManager.permissions 或 permissionManager.denialCounts，且调用栈检查失败
                    // 我们仍然允许访问（因为这是系统初始化必需的，调用栈可能被截断）
                    if (key === 'permissionManager.permissions' || key === 'permissionManager.denialCounts') {
                        if (hasPermissionManagerPath || hasPermissionManagerName || hasLoadPermissions || hasLoadDenialCounts || hasPermissionManagerFile) {
                            allowedInSystemLoading = true;
                            KernelLogger.debug("LStorage", `系统加载中（POOL标志位），检测到 PermissionManager 调用，允许读取 ${key}`);
                        } else {
                            // 系统加载期间，permissionManager 相关键应该允许访问（系统初始化需要）
                            // 即使调用栈检查失败，也允许（因为调用栈可能被截断）
                            allowedInSystemLoading = true;
                            // 这是系统初始化时的正常情况，使用 debug 级别而不是 warn
                            KernelLogger.debug("LStorage", `系统加载中（POOL标志位），PermissionManager 调用栈检查未完全匹配，但系统加载期间允许访问 ${key}（系统初始化需要）`);
                            KernelLogger.debug("LStorage", `调用栈片段: ${fullCallStack.substring(0, 500)}`);
                        }
                    } else {
                        // 其他 permissionControl 键，需要严格匹配
                        if (hasPermissionManagerPath || hasPermissionManagerName || hasLoadPermissions || hasLoadDenialCounts || hasPermissionManagerFile) {
                            allowedInSystemLoading = true;
                            KernelLogger.debug("LStorage", `系统加载中（POOL标志位），检测到 PermissionManager 调用，允许读取 ${key}`);
                        } else {
                            KernelLogger.warn("LStorage", `系统加载中（POOL标志位），PermissionManager 调用栈检查失败，键: ${key}`);
                            KernelLogger.debug("LStorage", `调用栈片段: ${fullCallStack.substring(0, 500)}`);
                        }
                    }
                }
                
                if (allowedInSystemLoading) {
                    // 系统加载中，允许访问敏感键
                    KernelLogger.debug("LStorage", `系统加载中（POOL标志位），允许内核模块读取敏感键 ${key}`);
                    try {
                        const value = LStorage._storageData.system[key] ?? null;
                        if (value) {
                            // 记录到权限管理器审计日志，而不是输出警告日志
                            if (typeof PermissionManager !== 'undefined' && typeof PermissionManager.recordStorageAccessAudit === 'function') {
                                PermissionManager.recordStorageAccessAudit(key, null, '内核模块（系统加载中）', {
                                    systemLoading: true,
                                    poolFlag: true
                                });
                            }
                        }
                        return value;
                    } catch (error) {
                        KernelLogger.error("LStorage", `读取系统存储失败: ${error.message}`, error);
                        throw error;
                    }
                } else {
                    KernelLogger.debug("LStorage", `系统加载中（POOL标志位），但调用栈检查未通过，继续后续验证流程`);
                }
            }
            
            // 如果 _isKernelModuleCall() 返回 false，但调用栈中包含内核模块标识，可能是异步调用导致的调用栈格式问题
            // 在这种情况下，我们需要重新检查调用栈
            if (!isKernelModuleCall) {
                // 获取完整的调用栈进行二次检查
                try {
                    const fullStack = new Error().stack || '';
                    // 检查调用栈中是否包含内核模块标识
                    if (/kernel[\/\\]process[\/\\].*permissionManager/i.test(fullStack) || 
                        /permissionManager/i.test(fullStack)) {
                        // 如果调用栈中包含 permissionManager，且是 permissionManager 相关键，允许通过
                        if (isPermissionControlKey && (key === 'permissionManager.permissions' || key === 'permissionManager.denialCounts')) {
                            KernelLogger.debug("LStorage", `检测到 PermissionManager 调用（二次检查），允许读取 ${key}`);
                            isKernelModuleCall = true; // 标记为内核模块调用，继续后续验证
                        }
                    }
                } catch (e) {
                    KernelLogger.debug("LStorage", `二次检查调用栈失败: ${e.message}`);
                }
            }
            
            if (isKernelModuleCall) {
                // 内核模块调用：需要验证是否为允许的内核模块
                let allowed = false;
                try {
                    const stack = new Error().stack;
                    if (stack) {
                        // 对于 userControl.* 键，只允许 UserControl 模块读取
                        if (isUserControlKey) {
                            if (/kernel[\/\\]core[\/\\]usercontrol[\/\\]/i.test(stack)) {
                                allowed = true;
                                KernelLogger.debug("LStorage", `UserControl 模块调用，允许读取 ${key}`);
                            } else {
                                KernelLogger.error("LStorage", `安全警告：检测到疑似伪造的内核模块调用，拒绝读取 ${key}`);
                                throw new Error(`安全验证失败：只有 UserControl 模块可以读取 ${key} 键`);
                            }
                        }
                        // 对于 permissionControl.* 和 permissionManager.permissions 键，只允许 PermissionManager 模块读取
                        else if (isPermissionControlKey) {
                            // 匹配多种可能的路径格式：
                            // - kernel/process/permissionManager.js
                            // - kernel/process/permissionmanager.js
                            // - 包含 permissionManager 或 permissionmanager 的路径
                            // - 调用栈中包含 permissionManager 或 permissionmanager 字符串
                            const permissionManagerPatterns = [
                                /kernel[\/\\]process[\/\\].*permissionManager/i,
                                /kernel[\/\\]process[\/\\].*permissionmanager/i,
                                /permissionManager\.js/i,
                                /permissionmanager\.js/i,
                                /permissionManager/i,  // 更宽松的匹配
                                /permissionmanager/i   // 更宽松的匹配
                            ];
                            
                            let matched = false;
                            for (const pattern of permissionManagerPatterns) {
                                if (pattern.test(stack)) {
                                    matched = true;
                                    KernelLogger.debug("LStorage", `PermissionManager 模式匹配成功: ${pattern}`);
                                    break;
                                }
                            }
                            
                            if (matched) {
                                allowed = true;
                                KernelLogger.debug("LStorage", `PermissionManager 模块调用，允许读取 ${key}`);
                            } else {
                                // 如果无法匹配，记录详细调用栈用于调试
                                KernelLogger.debug("LStorage", `PermissionManager 调用栈验证失败，调用栈: ${stack.substring(0, 800)}`);
                                KernelLogger.error("LStorage", `安全警告：检测到疑似伪造的内核模块调用，拒绝读取 ${key}`);
                                throw new Error(`安全验证失败：只有 PermissionManager 模块可以读取 ${key} 键`);
                            }
                        }
                    } else {
                        KernelLogger.error("LStorage", `无法获取调用栈，拒绝读取敏感系统存储键 ${key}`);
                        throw new Error(`安全验证失败：无法获取调用栈`);
                    }
                } catch (e) {
                    KernelLogger.error("LStorage", `验证敏感键读取来源时出错: ${e.message}`);
                    throw new Error(`安全验证失败：${e.message}`);
                }
                
                if (!allowed) {
                    KernelLogger.error("LStorage", `内核模块调用验证失败，拒绝读取 ${key}`);
                    throw new Error(`安全验证失败：不允许的内核模块调用`);
                }
                // 继续执行读取操作
            } else {
                // 用户程序调用：需要危险权限（仅管理员可授予）
                // 但是，如果是 permissionManager.permissions 键，且调用栈中包含 permissionManager，
                // 可能是系统初始化时的调用，应该允许通过
                if (isPermissionControlKey && key === 'permissionManager.permissions') {
                    try {
                        const fullStack = new Error().stack || '';
                        // 检查调用栈中是否包含 permissionManager 标识
                        if (/permissionManager/i.test(fullStack) || 
                            /kernel[\/\\]process[\/\\].*permissionManager/i.test(fullStack)) {
                            // 如果调用栈中包含 permissionManager，且是系统初始化阶段，允许通过
                            KernelLogger.debug("LStorage", `检测到 PermissionManager 调用（用户程序分支二次检查），允许读取 ${key}`);
                            // 直接允许，跳过权限检查（因为这是系统初始化时的调用）
                            try {
                                const value = LStorage._storageData.system[key] ?? null;
                                if (value) {
                                    // 记录到权限管理器审计日志，而不是输出警告日志
                                    if (typeof PermissionManager !== 'undefined' && typeof PermissionManager.recordStorageAccessAudit === 'function') {
                                        PermissionManager.recordStorageAccessAudit(key, null, 'PermissionManager（系统初始化）', {
                                            systemInitialization: true,
                                            stackCheck: 'secondary'
                                        });
                                    }
                                }
                                return value;
                            } catch (error) {
                                KernelLogger.error("LStorage", `读取系统存储失败: ${error.message}`, error);
                                throw error;
                            }
                        }
                    } catch (e) {
                        KernelLogger.debug("LStorage", `二次检查调用栈失败: ${e.message}`);
                    }
                }
                
                if (typeof PermissionManager === 'undefined') {
                    // 降级方案：检查用户权限
                    if (typeof UserControl !== 'undefined') {
                        if (!UserControl.isAdmin()) {
                            KernelLogger.error("LStorage", `读取敏感系统存储键 ${key} 需要管理员权限`);
                            throw new Error(`读取系统存储键 ${key} 需要管理员权限`);
                        }
                    } else {
                        KernelLogger.error("LStorage", `UserControl 不可用，无法验证管理员权限`);
                        throw new Error(`无法验证权限：UserControl 不可用`);
                    }
                } else {
                    // 检查进程是否有对应的危险权限（仅管理员可授予）
                    if (!requiredPermission) {
                        // requiredPermission 未定义，说明权限配置有问题，拒绝读取
                        KernelLogger.error("LStorage", `读取敏感系统存储键 ${key} 缺少权限配置，拒绝读取`);
                        throw new Error(`无法验证权限：权限配置缺失`);
                    }
                    
                    if (!currentPid) {
                        // 无法获取 PID，无法验证调用来源，拒绝读取（安全策略：宁可拒绝也不允许）
                        KernelLogger.error("LStorage", `无法获取进程PID，拒绝读取敏感系统存储键 ${key}（安全策略）`);
                        throw new Error(`无法验证权限：无法获取进程PID`);
                    }
                    
                    // 对于危险权限，必须先检查是否已有权限，不能通过请求获得
                    // 危险权限只能由管理员在程序启动时授予，不能通过运行时请求获得
                    const hasPermission = PermissionManager.hasPermission(currentPid, requiredPermission);
                    if (!hasPermission) {
                        // 检查当前用户是否为管理员（如果是管理员，可以授权）
                        if (typeof UserControl !== 'undefined') {
                            const currentUser = UserControl.getCurrentUser();
                            const isAdmin = UserControl.isAdmin();
                            
                            if (!isAdmin) {
                                // 普通用户无法授权危险权限，直接拒绝
                                KernelLogger.error("LStorage", `进程 ${currentPid} 尝试读取敏感系统存储键 ${key}，但缺少所需权限 ${requiredPermission}，且当前用户 ${currentUser || '未知'} 不是管理员，无法授权`);
                                throw new Error(`缺少权限：${requiredPermission}（需要管理员授权，当前用户无法授权此权限）`);
                            } else {
                                // 管理员可以授权，但危险权限不应该通过运行时请求获得
                                // 为了安全，即使管理员也不允许运行时授权危险权限
                                KernelLogger.error("LStorage", `进程 ${currentPid} 尝试读取敏感系统存储键 ${key}，但缺少所需权限 ${requiredPermission}。危险权限必须在程序启动时授予，不允许运行时授权`);
                                throw new Error(`缺少权限：${requiredPermission}（危险权限必须在程序启动时授予）`);
                            }
                        } else {
                            KernelLogger.error("LStorage", `UserControl 不可用，无法验证管理员权限`);
                            throw new Error(`无法验证权限：UserControl 不可用`);
                        }
                    }
                    
                    // 权限检查通过，记录日志
                    KernelLogger.debug("LStorage", `进程 ${currentPid} 已获得权限 ${requiredPermission}，允许读取敏感系统存储键 ${key}`);
                }
            }
        } else {
            // 非敏感键
            if (isBIOSMode) {
                // BIOS模式：享有最高权限，直接允许，不需要 PID 检查和权限验证
                KernelLogger.debug("LStorage", `BIOS模式，允许读取非敏感系统存储键 ${key}（最高权限）`);
            } else if (isKernelModuleCall) {
                // 内核模块调用：直接允许，不需要 PID 检查
                KernelLogger.debug("LStorage", `内核模块调用，允许读取非敏感系统存储键 ${key}`);
            } else {
                // 用户程序调用：需要基础权限（SYSTEM_STORAGE_READ，普通权限，自动授予）
                if (typeof PermissionManager !== 'undefined' && currentPid) {
                    const hasBasePermission = PermissionManager.hasPermission(currentPid, PermissionManager.PERMISSION.SYSTEM_STORAGE_READ);
                    if (!hasBasePermission) {
                        // 基础权限可以请求（特殊权限，需要用户确认）
                        const granted = await PermissionManager.checkAndRequestPermission(currentPid, PermissionManager.PERMISSION.SYSTEM_STORAGE_READ);
                        if (!granted) {
                            KernelLogger.error("LStorage", `进程 ${currentPid} 尝试读取系统存储键 ${key}，但缺少基础权限 SYSTEM_STORAGE_READ`);
                            throw new Error(`缺少权限：SYSTEM_STORAGE_READ`);
                        }
                    }
                } else if (!currentPid) {
                    // 无法获取 PID，无法验证调用来源，拒绝读取（安全策略）
                    KernelLogger.error("LStorage", `无法获取进程PID，拒绝读取系统存储键 ${key}（安全策略）`);
                    throw new Error(`无法验证权限：无法获取进程PID`);
                }
            }
        }
        
        try {
            const value = LStorage._storageData.system[key] ?? null;
            if (isSensitiveKey && value) {
                // 记录到权限管理器审计日志，而不是输出警告日志
                if (typeof PermissionManager !== 'undefined' && typeof PermissionManager.recordStorageAccessAudit === 'function') {
                    PermissionManager.recordStorageAccessAudit(
                        key, 
                        currentPid || null, 
                        isKernelModuleCall ? '内核模块' : '用户程序',
                        {
                            hasPermission: true,
                            requiredPermission: requiredPermission || null
                        }
                    );
                }
            }
            return value;
        } catch (error) {
            KernelLogger.error("LStorage", `读取系统存储失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 检查是否处于BIOS模式（BIOS享有最高权限）
     * @returns {boolean} 是否处于BIOS模式
     * @private
     */
    static _isBIOSMode() {
        try {
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                const biosMode = POOL.__GET__("KERNEL_GLOBAL_POOL", "__BIOS_MODE__");
                return biosMode === true;
            }
        } catch (e) {
            // 忽略错误
        }
        return false;
    }
    
    /**
     * 检查调用栈是否来自内核模块
     * @returns {boolean} 是否来自内核模块
     * @private
     */
    static _isKernelModuleCall() {
        try {
            const stack = new Error().stack;
            if (!stack) {
                KernelLogger.debug("LStorage", `无法获取调用栈，返回 false`);
                return false;
            }
            
            // 将调用栈按行分割
            const stackLines = stack.split('\n');
            
            // 跳过第一行（Error 消息）和第二行（LStorage.js 本身）
            // 从第三行开始检查，找到第一个不是 LStorage.js 的调用者
            for (let i = 2; i < Math.min(stackLines.length, 15); i++) {
                const line = stackLines[i];
                
                // 跳过 LStorage.js 本身的调用栈行
                if (line.includes('LStorage.js') || line.includes('lStorage.js')) {
                    continue;
                }
                
                // 检查是否包含内核模块路径
                // 内核模块路径包括：
                // - kernel/core/, kernel/process/, kernel/filesystem/, kernel/dynamicModule/
                // - kernel/drive/ (驱动模块，如 cryptDrive.js, LStorage.js 等)
                // - system/ui/ (系统UI模块，如 themeManager.js, desktop.js, taskbarManager.js 等)
                // 但排除 kernel/drive/LStorage.js 本身的调用栈行（已在上面跳过）
                const kernelModulePatterns = [
                    /kernel[\/\\](core|process|filesystem|dynamicModule)[\/\\]/,  // 核心模块
                    /kernel[\/\\]drive[\/\\]/,                                    // 驱动模块（排除 LStorage.js 本身）
                    /system[\/\\]ui[\/\\]/                                        // 系统UI模块
                ];
                
                for (const pattern of kernelModulePatterns) {
                    if (pattern.test(line)) {
                        // 找到内核模块调用，记录详细信息用于调试
                        KernelLogger.debug("LStorage", `检测到内核模块调用，调用栈行: ${line.substring(0, 100)}`);
                        return true;
                    }
                }
                
                // 如果找到用户程序路径（application/），说明是用户程序调用
                if (/service[\/\\]DISK[\/\\][CD][\/\\]application[\/\\]/.test(line)) {
                    KernelLogger.debug("LStorage", `检测到用户程序调用，调用栈行: ${line.substring(0, 100)}`);
                    return false;
                }
            }
            
            // 如果没有找到明确的调用者，记录完整调用栈用于调试
            KernelLogger.debug("LStorage", `无法确定调用来源，完整调用栈: ${stackLines.slice(0, 20).join('\n')}`);
            KernelLogger.debug("LStorage", `无法确定调用来源，默认拒绝（安全策略）`);
            return false;
        } catch (e) {
            KernelLogger.debug("LStorage", `检查内核模块调用失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 获取当前进程PID（通过调用栈分析）
     * @returns {number|null} 进程PID，如果无法获取则返回null
     * @private
     */
    static _getCurrentPid() {
        try {
            // 首先检查是否有上下文 PID（由 ProcessManager 设置）
            if (LStorage._currentContextPid !== null) {
                KernelLogger.debug("LStorage", `使用上下文 PID: ${LStorage._currentContextPid}`);
                return LStorage._currentContextPid;
            }
            
            if (typeof ProcessManager === 'undefined') {
                return null;
            }
            
            // 尝试从调用栈中获取程序路径，然后查找对应的 PID
            const stack = new Error().stack;
            if (!stack) return null;
            
            // 查找程序路径（匹配 application/ 或 bin/ 目录下的程序）
            // 先尝试 application/ 目录
            let programPathMatch = stack.match(/service[\/\\]DISK[\/\\][CD][\/\\]application[\/\\]([^\/\\\s]+)/);
            if (!programPathMatch) {
                // 如果没找到，尝试 bin/ 目录
                programPathMatch = stack.match(/service[\/\\]DISK[\/\\][CD][\/\\]bin[\/\\]([^\/\\\s]+)/);
            }
            
            if (programPathMatch) {
                const programName = programPathMatch[1].toLowerCase();
                // 查找对应的 PID（取第一个匹配的）
                if (ProcessManager.PROCESS_TABLE) {
                    for (const [pid, info] of ProcessManager.PROCESS_TABLE) {
                        if (info.programName && info.programName.toLowerCase() === programName) {
                            KernelLogger.debug("LStorage", `通过调用栈找到 PID: ${pid}, 程序: ${programName}`);
                            return pid;
                        }
                    }
                }
            }
            
            // 如果通过调用栈无法找到，尝试从 ProcessManager._executeKernelAPI 的调用栈中获取
            // 当通过 ProcessManager.callKernelAPI 调用时，调用栈中会有 ProcessManager._executeKernelAPI
            // 我们需要查找调用 ProcessManager._executeKernelAPI 的程序
            const executeKernelAPIMatch = stack.match(/ProcessManager\._executeKernelAPI/);
            if (executeKernelAPIMatch) {
                // 找到了 ProcessManager._executeKernelAPI，说明是通过 ProcessManager 调用的
                // 查找调用 ProcessManager._executeKernelAPI 的程序路径
                // 需要向上查找调用栈，找到调用 callKernelAPI 的程序
                const stackLines = stack.split('\n');
                for (let i = 0; i < stackLines.length; i++) {
                    const line = stackLines[i];
                    // 查找调用 callKernelAPI 的程序（跳过 ProcessManager 本身的调用栈）
                    if (line.includes('callKernelAPI') && !line.includes('ProcessManager')) {
                        // 在后续行中查找程序路径
                        for (let j = i + 1; j < Math.min(i + 5, stackLines.length); j++) {
                            const callerLine = stackLines[j];
                            const callerMatch = callerLine.match(/service[\/\\]DISK[\/\\][CD][\/\\](application|bin)[\/\\]([^\/\\\s]+)/);
                            if (callerMatch) {
                                const programName = callerMatch[2].toLowerCase();
                                // 查找对应的 PID
                                if (ProcessManager.PROCESS_TABLE) {
                                    for (const [pid, info] of ProcessManager.PROCESS_TABLE) {
                                        if (info.programName && info.programName.toLowerCase() === programName) {
                                            KernelLogger.debug("LStorage", `通过 ProcessManager 调用栈找到 PID: ${pid}, 程序: ${programName}`);
                                            return pid;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            return null;
        } catch (e) {
            KernelLogger.debug("LStorage", `获取当前PID失败: ${e.message}`);
            return null;
        }
    }
    
    /**
     * 写入系统本地存储数据
     * @param {string} key 存储键
     * @param {any} value 存储的值
     * @returns {Promise<boolean>} 是否成功
     */
    static async setSystemStorage(key, value) {
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        
        // 特殊处理：applicationTable 存储在独立的文件中
        if (key === 'applicationTable') {
            // 获取当前进程PID
            const currentPid = LStorage._getCurrentPid();
            
            // 检查是否来自内核模块（内核模块是可信的，可以写入敏感键）
            const isKernelModuleCall = LStorage._isKernelModuleCall();
            
            // 检查是否通过应用程序管理API调用
            if (!isKernelModuleCall && currentPid) {
                // 检查调用栈，确保是通过应用程序管理API调用的
                try {
                    const stack = new Error().stack;
                    if (stack && !stack.includes('installApplication') && !stack.includes('uninstallApplication')) {
                        // 如果不是通过应用程序管理API调用的，拒绝写入
                        KernelLogger.error("LStorage", `安全拒绝：程序 ${currentPid} 尝试直接写入 applicationTable，必须通过 Application.install/uninstall API`);
                        throw new Error(`安全策略：不允许直接写入 applicationTable，必须使用 Application.install/uninstall API`);
                    }
                } catch (e) {
                    if (e.message && e.message.includes('安全策略')) {
                        throw e;
                    }
                    // 如果无法检查调用栈，记录警告但拒绝写入（安全策略）
                    KernelLogger.error("LStorage", `无法验证 applicationTable 写入来源，拒绝写入（安全策略）`);
                    throw new Error(`安全策略：无法验证 applicationTable 写入来源`);
                }
            }
            
            // 写入独立的 ApplicationTable.json 文件
            return await LStorage._setApplicationTable(value);
        }
        
        // 获取当前进程PID
        const currentPid = LStorage._getCurrentPid();
        
        // 检查是否来自内核模块（内核模块是可信的，可以写入敏感键）
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        // 检查是否处于BIOS模式（BIOS享有最高权限，可以写入所有系统存储）
        const isBIOSMode = LStorage._isBIOSMode();
        
        // 定义危险存储键及其所需权限（需要危险权限，仅管理员可授予）
        const DANGEROUS_KEY_PERMISSIONS = {};
        const SPECIAL_KEY_PERMISSIONS = {};
        if (typeof PermissionManager !== 'undefined' && PermissionManager.PERMISSION) {
            // 危险权限（仅管理员可授予）
            DANGEROUS_KEY_PERMISSIONS['userControl.users'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL;
            DANGEROUS_KEY_PERMISSIONS['userControl.groups'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL;
            DANGEROUS_KEY_PERMISSIONS['userControl.settings'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL;
            DANGEROUS_KEY_PERMISSIONS['permissionControl.blacklist'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL;
            DANGEROUS_KEY_PERMISSIONS['permissionControl.whitelist'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL;
            DANGEROUS_KEY_PERMISSIONS['permissionControl.settings'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL;
            DANGEROUS_KEY_PERMISSIONS['permissionManager.permissions'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL;
            
            // 特殊权限（需要用户确认，但普通用户可以授予）
            SPECIAL_KEY_PERMISSIONS['desktop.icons'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_DESKTOP;
            SPECIAL_KEY_PERMISSIONS['desktop.background'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_DESKTOP;
            SPECIAL_KEY_PERMISSIONS['desktop.settings'] = PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_DESKTOP;
        }
        
        // 定义危险键列表（用于权限检查，即使 PermissionManager 未定义也需要检查）
        const DANGEROUS_KEYS = {
            'userControl.users': true,
            'userControl.groups': true,
            'userControl.settings': true,
            'permissionControl.blacklist': true,
            'permissionControl.whitelist': true,
            'permissionControl.settings': true,
            'permissionManager.permissions': true,
            'applicationTable': true,  // 应用程序注册表（只能通过 Application.install/uninstall API 写入）
        };
        
        // 定义特殊键列表（需要特殊权限，但普通用户可以授予）
        const SPECIAL_KEYS = {
            'desktop.icons': true,
            'desktop.background': true,
            'desktop.settings': true,
        };
        
        // 检查是否写入 registry 键（包含环境变量，需要额外验证）
        // 注意：环境变量API已经进行了权限检查，但这里需要确保 registry 键的写入也受到保护
        if (key === 'registry' && value && typeof value === 'object' && value.environment) {
            // 如果写入的 registry 包含 environment 对象，需要验证调用来源
            // 环境变量API已经进行了权限检查，但这里需要确保不是直接调用 setSystemStorage
            if (!isKernelModuleCall && currentPid) {
                // 检查调用栈，确保是通过环境变量API调用的
                try {
                    const stack = new Error().stack;
                    if (stack && !stack.includes('setEnvironmentVariable') && !stack.includes('deleteEnvironmentVariable')) {
                        // 如果不是通过环境变量API调用的，拒绝写入
                        KernelLogger.error("LStorage", `安全拒绝：程序 ${currentPid} 尝试直接写入 registry.environment，必须通过环境变量API`);
                        throw new Error(`安全策略：不允许直接写入 registry.environment，必须使用环境变量API`);
                    }
                } catch (e) {
                    if (e.message && e.message.includes('安全策略')) {
                        throw e;
                    }
                    // 如果无法检查调用栈，记录警告但允许继续（环境变量API已经进行了权限检查）
                    KernelLogger.warn("LStorage", `无法验证 registry.environment 写入来源，但环境变量API已进行权限检查`);
                }
            }
        }
        
        // 注意：applicationTable 的特殊处理已经在方法开头完成，这里不再处理
        
        // 检查是否为危险键（需要危险权限，仅管理员可授予）或特殊键（需要特殊权限）
        const isDangerousKey = DANGEROUS_KEYS[key];
        const isSpecialKey = SPECIAL_KEYS[key];
        const requiredPermission = DANGEROUS_KEY_PERMISSIONS[key] || SPECIAL_KEY_PERMISSIONS[key];
        
        if (isDangerousKey) {
            // 对于危险键，即使是内核模块调用，也要进行严格验证
            // 对于 userControl.* 键，需要更严格的验证
            const isUserControlUsersKey = (key === 'userControl.users');
            const isUserControlGroupsKey = (key === 'userControl.groups');
            const isUserControlKey = isUserControlUsersKey || isUserControlGroupsKey;
            const isPermissionControlKey = key.startsWith('permissionControl.') || key === 'permissionManager.permissions';
            
            if (isKernelModuleCall) {
                // 内核模块调用：需要验证是否为允许的内核模块
                let allowed = false;
                try {
                    const stack = new Error().stack;
                    if (stack) {
                        // 对于 userControl.users 键，只允许 UserControl 模块写入
                        if (isUserControlUsersKey) {
                            if (/kernel[\/\\]core[\/\\]usercontrol[\/\\]userControl\.js/i.test(stack)) {
                                allowed = true;
                                KernelLogger.debug("LStorage", `UserControl 模块调用，允许写入 ${key}`);
                            } else {
                                KernelLogger.error("LStorage", `安全警告：检测到疑似伪造的内核模块调用，拒绝写入 ${key}`);
                                throw new Error(`安全验证失败：只有 UserControl 模块可以写入 userControl.users 键`);
                            }
                        }
                        // 对于 userControl.groups 键，只允许 UserGroup 模块写入
                        else if (isUserControlGroupsKey) {
                            if (/kernel[\/\\]core[\/\\]usercontrol[\/\\]userGroup\.js/i.test(stack)) {
                                allowed = true;
                                KernelLogger.debug("LStorage", `UserGroup 模块调用，允许写入 ${key}`);
                            } else {
                                KernelLogger.error("LStorage", `安全警告：检测到疑似伪造的内核模块调用，拒绝写入 ${key}`);
                                throw new Error(`安全验证失败：只有 UserGroup 模块可以写入 userControl.groups 键`);
                            }
                        }
                        // 对于 permissionControl.* 和 permissionManager.permissions 键，只允许 PermissionManager 模块写入
                        else if (isPermissionControlKey) {
                            if (/kernel[\/\\]process[\/\\]permissionManager\.js/i.test(stack) || 
                                /kernel[\/\\]process[\/\\]permissionmanager\.js/i.test(stack)) {
                                allowed = true;
                                KernelLogger.debug("LStorage", `PermissionManager 模块调用，允许写入 ${key}`);
                            } else {
                                KernelLogger.error("LStorage", `安全警告：检测到疑似伪造的内核模块调用，拒绝写入 ${key}`);
                                throw new Error(`安全验证失败：只有 PermissionManager 模块可以写入 ${key} 键`);
                            }
                        }
                        // 对于其他危险键，允许所有内核模块写入（但记录日志）
                        else {
                            allowed = true;
                            KernelLogger.debug("LStorage", `内核模块调用，允许写入危险系统存储键 ${key}`);
                        }
                    } else {
                        KernelLogger.error("LStorage", `无法获取调用栈，拒绝写入危险系统存储键 ${key}`);
                        throw new Error(`安全验证失败：无法获取调用栈`);
                    }
                } catch (e) {
                    KernelLogger.error("LStorage", `验证危险键写入来源时出错: ${e.message}`);
                    throw new Error(`安全验证失败：${e.message}`);
                }
                
                if (!allowed) {
                    KernelLogger.error("LStorage", `内核模块调用验证失败，拒绝写入 ${key}`);
                    throw new Error(`安全验证失败：不允许的内核模块调用`);
                }
                // 继续执行写入操作
            } else {
                // 用户程序调用：需要危险权限（仅管理员可授予）
                // 对于 userControl.* 键，绝对不允许用户程序直接写入
                if (isUserControlKey) {
                    KernelLogger.error("LStorage", `安全拒绝：用户程序尝试直接写入 ${key} 键（PID: ${currentPid || 'unknown'}）`);
                    throw new Error(`安全策略：不允许用户程序直接写入 ${key} 键`);
                }
                
                if (typeof PermissionManager === 'undefined') {
                    // 降级方案：检查用户权限
                    if (typeof UserControl !== 'undefined') {
                        if (!UserControl.isAdmin()) {
                            KernelLogger.error("LStorage", `写入危险系统存储键 ${key} 需要管理员权限`);
                            throw new Error(`写入系统存储键 ${key} 需要管理员权限`);
                        }
                    } else {
                        KernelLogger.error("LStorage", `UserControl 不可用，无法验证管理员权限`);
                        throw new Error(`无法验证权限：UserControl 不可用`);
                    }
                } else {
                    // 检查进程是否有对应的危险权限（仅管理员可授予）
                    if (!requiredPermission) {
                        // requiredPermission 未定义，说明权限配置有问题，拒绝写入
                        KernelLogger.error("LStorage", `写入危险系统存储键 ${key} 缺少权限配置，拒绝写入`);
                        throw new Error(`无法验证权限：权限配置缺失`);
                    }
                    
                    if (!currentPid) {
                        // 无法获取 PID，无法验证调用来源，拒绝写入（安全策略：宁可拒绝也不允许）
                        KernelLogger.error("LStorage", `无法获取进程PID，拒绝写入危险系统存储键 ${key}（安全策略）`);
                        throw new Error(`无法验证权限：无法获取进程PID`);
                    }
                    
                    // 对于危险权限，必须先检查是否已有权限，不能通过请求获得
                    // 危险权限只能由管理员在程序启动时授予，不能通过运行时请求获得
                    const hasPermission = PermissionManager.hasPermission(currentPid, requiredPermission);
                    if (!hasPermission) {
                        // 检查当前用户是否为管理员（如果是管理员，可以授权）
                        if (typeof UserControl !== 'undefined') {
                            const currentUser = UserControl.getCurrentUser();
                            const isAdmin = UserControl.isAdmin();
                            
                            if (!isAdmin) {
                                // 普通用户无法授权危险权限，直接拒绝
                                KernelLogger.error("LStorage", `进程 ${currentPid} 尝试写入危险系统存储键 ${key}，但缺少所需权限 ${requiredPermission}，且当前用户 ${currentUser || '未知'} 不是管理员，无法授权`);
                                throw new Error(`缺少权限：${requiredPermission}（需要管理员授权，当前用户无法授权此权限）`);
                            }
                            
                            // 管理员可以授权，但需要通过权限请求对话框
                            const granted = await PermissionManager.checkAndRequestPermission(currentPid, requiredPermission);
                            if (!granted) {
                                KernelLogger.error("LStorage", `进程 ${currentPid} 尝试写入危险系统存储键 ${key}，但权限请求被拒绝`);
                                throw new Error(`缺少权限：${requiredPermission}（权限请求被拒绝）`);
                            }
                        } else {
                            // UserControl 不可用，拒绝写入（安全策略）
                            KernelLogger.error("LStorage", `UserControl 不可用，无法验证用户权限，拒绝写入危险系统存储键 ${key}`);
                            throw new Error(`无法验证权限：UserControl 不可用`);
                        }
                    }
                }
            }
        } else if (isSpecialKey) {
            // 需要特殊权限（用户确认，普通用户可以授予）
            if (typeof PermissionManager === 'undefined') {
                // 降级方案：允许写入（特殊权限默认允许）
                KernelLogger.debug("LStorage", `PermissionManager 不可用，允许写入特殊键 ${key}`);
            } else {
                if (currentPid && requiredPermission) {
                    const hasPermission = await PermissionManager.checkAndRequestPermission(currentPid, requiredPermission);
                    if (!hasPermission) {
                        KernelLogger.warn("LStorage", `进程 ${currentPid} 尝试写入特殊系统存储键 ${key}，但缺少所需权限 ${requiredPermission}`);
                        throw new Error(`缺少权限：${requiredPermission}`);
                    }
                } else {
                    // 无法获取 PID 或 requiredPermission 未定义，允许写入（降级方案，特殊键相对安全）
                    KernelLogger.debug("LStorage", `无法获取当前PID或权限定义，允许写入特殊键 ${key}`);
                }
            }
        } else {
            // 非敏感键，检查基础权限（SYSTEM_STORAGE_WRITE）
            // 注意：由于 setSystemStorage 没有 pid 参数，我们只能通过调用栈获取
            // 如果无法获取 PID，对于非敏感键，我们仍然允许写入（降级方案）
            if (currentPid && typeof PermissionManager !== 'undefined') {
                // 检查基础权限（普通权限，自动授予）
                const hasBasePermission = PermissionManager.hasPermission(currentPid, PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE);
                if (!hasBasePermission) {
                    // 请求基础权限（如果需要）
                    const granted = await PermissionManager.checkAndRequestPermission(currentPid, PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE);
                    if (!granted) {
                        KernelLogger.warn("LStorage", `进程 ${currentPid} 尝试写入系统存储键 ${key}，但缺少基础权限 SYSTEM_STORAGE_WRITE`);
                        throw new Error(`缺少权限：SYSTEM_STORAGE_WRITE`);
                    }
                }
            } else if (currentPid) {
                // 无法获取 PermissionManager，但获取到了 PID，记录警告
                KernelLogger.debug("LStorage", `PermissionManager 不可用，允许写入非敏感键 ${key} (PID: ${currentPid})`);
            } else {
                // 无法获取 PID，对于非敏感键，允许写入（降级方案）
                KernelLogger.debug("LStorage", `无法获取当前PID，允许写入非敏感键 ${key}`);
            }
        }
        
        KernelLogger.info("LStorage", `写入系统存储: Key=${key}, Value类型=${typeof value}, 是否为数组=${Array.isArray(value)}`);
        if (Array.isArray(value)) {
            KernelLogger.debug("LStorage", `数组长度: ${value.length}`);
        }
        
        try {
            // 确保 _storageData 已初始化
            if (!LStorage._storageData || !LStorage._storageData.system) {
                KernelLogger.warn("LStorage", `存储数据结构未初始化，尝试重新初始化`);
                await LStorage.init();
            }
            
            // 先更新内存中的数据
            LStorage._storageData.system[key] = value;
            KernelLogger.debug("LStorage", `内存数据已更新: Key=${key}, Value类型=${typeof value}, 是否为对象=${typeof value === 'object' && value !== null && !Array.isArray(value)}`);
            
            // 在保存前验证数据是否在内存中
            const beforeSaveCheck = LStorage._storageData.system[key];
            if (beforeSaveCheck === undefined || beforeSaveCheck === null) {
                KernelLogger.error("LStorage", `保存前验证失败: Key=${key} 在内存中不存在（数据未正确设置）`);
                return false;
            }
            
            // 对于对象类型，创建深拷贝用于验证（避免在保存过程中数据被修改）
            let valueForVerification = value;
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                try {
                    valueForVerification = JSON.parse(JSON.stringify(value));
                } catch (e) {
                    KernelLogger.debug("LStorage", `无法创建深拷贝用于验证，将使用原始值: ${e.message}`);
                    valueForVerification = value;
                }
            }
            
            // 尝试保存到文件系统
            try {
                await LStorage._saveStorageData();
                KernelLogger.info("LStorage", `系统存储写入成功: Key=${key}`);
                
                // 验证保存是否真的成功（保存后验证内存中的数据是否仍然存在）
                // 注意：_saveStorageData 不应该修改 _storageData.system，所以数据应该还在
                try {
                    // 确保从正确的存储数据结构中读取
                    if (!LStorage._storageData || !LStorage._storageData.system) {
                        KernelLogger.warn("LStorage", `保存后验证失败: 存储数据结构不存在`);
                        return false;
                    }
                    
                    const savedValue = LStorage._storageData.system[key];
                    
                    // 添加详细的调试信息
                    KernelLogger.debug("LStorage", `验证数据: Key=${key}, savedValue存在=${savedValue !== undefined && savedValue !== null}, savedValue类型=${typeof savedValue}, value类型=${typeof value}`);
                    
                    // 对于对象类型，需要特殊处理
                    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                        // 对象类型：检查是否存在且是对象
                        if (savedValue === undefined || savedValue === null) {
                            KernelLogger.warn("LStorage", `保存后验证失败: Key=${key} 在内存中不存在 (savedValue=${savedValue})`);
                            return false;
                        }
                        if (typeof savedValue !== 'object' || Array.isArray(savedValue)) {
                            KernelLogger.warn("LStorage", `保存后验证失败: Key=${key} 类型不匹配 (期望: object, 实际: ${typeof savedValue}, 是否为数组: ${Array.isArray(savedValue)})`);
                            return false;
                        }
                        // 对于对象，检查键的数量是否匹配
                        // 使用保存时的值（valueForVerification）而不是当前内存中的值（savedValue）
                        // 因为内存中的数据可能在保存后被其他操作修改了
                        const valueKeys = Object.keys(valueForVerification);
                        const savedKeys = Object.keys(savedValue);
                        KernelLogger.debug("LStorage", `对象验证: Key=${key}, 保存时键数=${valueKeys.length}, 当前内存键数=${savedKeys.length}`);
                        
                        // 如果键数量不匹配，检查是否是数据被修改了
                        // 注意：在多进程环境中，保存后数据可能被其他操作修改（如并发写入），这是正常的
                        if (valueKeys.length !== savedKeys.length) {
                            // 键数量变化（增加或减少）都可能是正常的（并发写入、权限清除等）
                            // 只记录调试信息，不返回失败，因为数据已经成功保存
                            KernelLogger.debug("LStorage", `对象键数量变化: Key=${key}, 保存时=${valueKeys.length}, 当前=${savedKeys.length} (可能是并发写入或数据修改)`);
                        }
                    } else if (savedValue === undefined || savedValue === null) {
                        // 对于非对象类型，检查是否存在
                        KernelLogger.warn("LStorage", `保存后验证失败: Key=${key} 在内存中不存在 (savedValue=${savedValue})`);
                        return false;
                    }
                    
                    // 对于数组类型，验证数组长度和内容
                    if (Array.isArray(value) && Array.isArray(savedValue)) {
                        if (savedValue.length !== value.length) {
                            KernelLogger.warn("LStorage", `保存后验证失败: Key=${key} 数组长度不匹配 (期望: ${value.length}, 实际: ${savedValue.length})`);
                            return false;
                        }
                        // 验证关键字段是否存在（对于 localDesktopBackgrounds）
                        if (key === 'system.localDesktopBackgrounds' && value.length > 0) {
                            const lastValue = value[value.length - 1];
                            const lastSaved = savedValue[savedValue.length - 1];
                            if (!lastSaved || lastSaved.id !== lastValue.id) {
                                KernelLogger.warn("LStorage", `保存后验证失败: Key=${key} 最新项不匹配`);
                                return false;
                            }
                        }
                    }
                    
                    KernelLogger.debug("LStorage", `保存验证成功: Key=${key} 已存在于内存中`);
                } catch (verifyError) {
                    KernelLogger.warn("LStorage", `保存验证失败: ${verifyError.message}`);
                }
                
                return true;
            } catch (saveError) {
                // 如果保存失败，记录错误并返回 false
                KernelLogger.error("LStorage", `保存系统存储失败: Key=${key}, Error: ${saveError.message}`, saveError);
                KernelLogger.error("LStorage", `错误堆栈: ${saveError.stack || '无堆栈信息'}`);
                // 安排延迟保存
                LStorage._scheduleDelayedSave();
                return false; // 返回失败，让调用者知道保存未成功
            }
        } catch (error) {
            KernelLogger.error("LStorage", `写入系统存储失败: ${error.message}`, error);
            KernelLogger.error("LStorage", `错误堆栈: ${error.stack || '无堆栈信息'}`);
            return false;
        }
    }
    
    /**
     * 延迟保存定时器
     */
    static _delayedSaveTimer = null;
    
    /**
     * 延迟保存检查间隔（毫秒）
     */
    static _delayedSaveInterval = 2000; // 2秒检查一次
    
    /**
     * 最大延迟保存重试次数（避免无限重试）
     */
    static _maxDelayedSaveRetries = 150; // 最多重试150次（约5分钟）
    
    /**
     * 当前延迟保存重试次数
     */
    static _delayedSaveRetryCount = 0;
    
    /**
     * 安排延迟保存
     */
    static _scheduleDelayedSave() {
        // 清除之前的定时器
        if (LStorage._delayedSaveTimer) {
            clearTimeout(LStorage._delayedSaveTimer);
        }
        
        // 检查是否超过最大重试次数
        if (LStorage._delayedSaveRetryCount >= LStorage._maxDelayedSaveRetries) {
            KernelLogger.warn("LStorage", `延迟保存已达到最大重试次数（${LStorage._maxDelayedSaveRetries}），停止重试`);
            LStorage._delayedSaveRetryCount = 0;
            return;
        }
        
        // 设置新的延迟保存（2秒后重试）
        LStorage._delayedSaveTimer = setTimeout(async () => {
            LStorage._delayedSaveTimer = null;
            LStorage._delayedSaveRetryCount++;
            
            try {
                await LStorage._saveStorageData();
                KernelLogger.info("LStorage", "延迟保存成功");
                LStorage._delayedSaveRetryCount = 0; // 重置重试计数
            } catch (e) {
                // 如果仍然失败，再次安排延迟保存
                KernelLogger.debug("LStorage", `延迟保存失败，将继续重试（重试 ${LStorage._delayedSaveRetryCount}/${LStorage._maxDelayedSaveRetries}）: ${e.message}`);
                LStorage._scheduleDelayedSave();
            }
        }, LStorage._delayedSaveInterval);
    }
    
    /**
     * 删除系统本地存储数据
     * @param {string} key 存储键
     * @returns {Promise<boolean>} 是否成功
     */
    static async deleteSystemStorage(key) {
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        
        KernelLogger.info("LStorage", `删除系统存储: Key=${key}`);
        
        try {
            delete LStorage._storageData.system[key];
            await LStorage._saveStorageData();
            KernelLogger.info("LStorage", `系统存储删除成功: Key=${key}`);
            return true;
        } catch (error) {
            KernelLogger.error("LStorage", `删除系统存储失败: ${error.message}`, error);
            return false;
        }
    }
    
    /**
     * 获取所有程序的存储数据（用于调试）
     * @returns {Object} 所有程序的存储数据
     */
    static getAllProgramStorage() {
        if (!LStorage._initialized) {
            return {};
        }
        
        return LStorage._storageData.programs || {};
    }
    
    /**
     * 获取所有系统存储数据（用于调试）
     * @returns {Object} 所有系统存储数据
     */
    /**
     * 获取所有系统存储数据（仅内核模块可用）
     * @returns {Object} 系统存储数据对象
     */
    static getAllSystemStorage() {
        if (!LStorage._initialized) {
            return {};
        }
        
        // 检查是否处于BIOS模式（BIOS享有最高权限，可以访问所有系统存储）
        const isBIOSMode = LStorage._isBIOSMode();
        
        // 检查是否为内核模块调用
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        if (!isBIOSMode && !isKernelModuleCall) {
            // 用户程序调用：拒绝访问（安全策略）
            const currentPid = LStorage._getCurrentPid();
            KernelLogger.error("LStorage", `安全拒绝：用户程序尝试枚举所有系统存储键（PID: ${currentPid || 'unknown'}）`);
            throw new Error(`安全策略：不允许用户程序枚举所有系统存储键`);
        }
        
        // BIOS模式或内核模块调用：允许访问
        if (isBIOSMode) {
            KernelLogger.debug("LStorage", `BIOS模式调用，允许获取所有系统存储数据`);
        } else {
            KernelLogger.debug("LStorage", `内核模块调用，允许获取所有系统存储数据`);
        }
        return LStorage._storageData.system || {};
    }
    
    /**
     * 清除读取缓存（用于强制刷新）
     */
    static clearCache() {
        LStorage._requestCache.readCache = null;
        LStorage._requestCache.readCacheTime = 0;
        KernelLogger.debug("LStorage", "读取缓存已清除");
    }
    
    // ==================== 环境变量 API ====================
    
    /**
     * 获取环境变量
     * 环境变量保存在注册表中 (system.registry.environment)
     * @param {string} name 环境变量名称
     * @returns {Promise<string|null>} 环境变量的值，如果不存在返回 null
     */
    static async getEnvironmentVariable(name) {
        if (!name || typeof name !== 'string') {
            throw new Error('环境变量名称必须是字符串');
        }
        
        // 检查是否为内核模块调用
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        // 如果不是内核模块调用，需要检查权限
        if (!isKernelModuleCall) {
            const currentPid = LStorage._getCurrentPid();
            if (!currentPid) {
                KernelLogger.error("LStorage", `无法获取进程PID，拒绝读取环境变量（安全策略）`);
                throw new Error(`安全策略：无法验证调用来源，拒绝读取环境变量`);
            }
            
            // 检查读取权限（环境变量需要 ENVIRONMENT_READ 权限）
            if (typeof PermissionManager !== 'undefined' && PermissionManager.checkAndRequestPermission) {
                try {
                    const granted = await PermissionManager.checkAndRequestPermission(currentPid, PermissionManager.PERMISSION.ENVIRONMENT_READ);
                    if (!granted) {
                        KernelLogger.error("LStorage", `进程 ${currentPid} 尝试读取环境变量 ${name}，但缺少权限 ENVIRONMENT_READ`);
                        throw new Error(`缺少权限：ENVIRONMENT_READ`);
                    }
                } catch (error) {
                    if (error.message && error.message.includes('缺少权限')) {
                        throw error;
                    }
                    KernelLogger.error("LStorage", `权限检查失败: ${error.message}`, error);
                    throw new Error(`权限检查失败: ${error.message}`);
                }
            }
        }
        
        try {
            // 获取注册表
            const registry = await LStorage.getSystemStorage('registry');
            if (!registry || typeof registry !== 'object') {
                return null;
            }
            
            // 获取环境变量对象
            const environment = registry.environment || registry.env;
            if (!environment || typeof environment !== 'object') {
                return null;
            }
            
            // 返回环境变量值
            return environment[name] || null;
        } catch (error) {
            KernelLogger.error("LStorage", `获取环境变量失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 设置环境变量
     * 环境变量保存在注册表中 (system.registry.environment)
     * @param {string} name 环境变量名称
     * @param {string} value 环境变量值
     * @returns {Promise<boolean>} 是否成功
     */
    static async setEnvironmentVariable(name, value) {
        if (!name || typeof name !== 'string') {
            throw new Error('环境变量名称必须是字符串');
        }
        
        if (value === null || value === undefined) {
            // 如果值为 null 或 undefined，删除环境变量
            return await LStorage.deleteEnvironmentVariable(name);
        }
        
        if (typeof value !== 'string') {
            throw new Error('环境变量值必须是字符串');
        }
        
        // 检查是否为内核模块调用
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        // 如果不是内核模块调用，需要检查权限
        if (!isKernelModuleCall) {
            const currentPid = LStorage._getCurrentPid();
            if (!currentPid) {
                KernelLogger.error("LStorage", `无法获取进程PID，拒绝设置环境变量（安全策略）`);
                throw new Error(`安全策略：无法验证调用来源，拒绝设置环境变量`);
            }
            
            // 检查写入权限（环境变量需要 ENVIRONMENT_WRITE 权限）
            if (typeof PermissionManager !== 'undefined' && PermissionManager.checkAndRequestPermission) {
                try {
                    const granted = await PermissionManager.checkAndRequestPermission(currentPid, PermissionManager.PERMISSION.ENVIRONMENT_WRITE);
                    if (!granted) {
                        KernelLogger.error("LStorage", `进程 ${currentPid} 尝试设置环境变量 ${name}，但缺少权限 ENVIRONMENT_WRITE`);
                        throw new Error(`缺少权限：ENVIRONMENT_WRITE`);
                    }
                } catch (error) {
                    if (error.message && error.message.includes('缺少权限')) {
                        throw error;
                    }
                    KernelLogger.error("LStorage", `权限检查失败: ${error.message}`, error);
                    throw new Error(`权限检查失败: ${error.message}`);
                }
            }
            
            // 检查用户级别：普通用户不允许写入环境变量
            if (typeof UserControl !== 'undefined') {
                const isAdmin = UserControl.isAdmin();
                if (!isAdmin) {
                    KernelLogger.error("LStorage", `进程 ${currentPid} 尝试设置环境变量 ${name}，但当前用户不是管理员，普通用户不允许写入环境变量`);
                    throw new Error(`安全策略：普通用户不允许写入环境变量，需要管理员权限`);
                }
            }
        }
        
        try {
            // 获取注册表
            let registry = await LStorage.getSystemStorage('registry');
            if (!registry || typeof registry !== 'object') {
                // 如果注册表不存在，创建新的注册表
                registry = {};
            }
            
            // 确保 environment 对象存在
            if (!registry.environment || typeof registry.environment !== 'object') {
                registry.environment = {};
            }
            
            // 设置环境变量
            registry.environment[name] = value;
            
            // 保存注册表
            await LStorage.setSystemStorage('registry', registry);
            
            KernelLogger.info("LStorage", `环境变量已设置: ${name} = ${value}`);
            return true;
        } catch (error) {
            KernelLogger.error("LStorage", `设置环境变量失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 删除环境变量
     * @param {string} name 环境变量名称
     * @returns {Promise<boolean>} 是否成功
     */
    static async deleteEnvironmentVariable(name) {
        if (!name || typeof name !== 'string') {
            throw new Error('环境变量名称必须是字符串');
        }
        
        // 检查是否为内核模块调用
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        // 如果不是内核模块调用，需要检查权限
        if (!isKernelModuleCall) {
            const currentPid = LStorage._getCurrentPid();
            if (!currentPid) {
                KernelLogger.error("LStorage", `无法获取进程PID，拒绝删除环境变量（安全策略）`);
                throw new Error(`安全策略：无法验证调用来源，拒绝删除环境变量`);
            }
            
            // 检查写入权限（删除环境变量需要 ENVIRONMENT_WRITE 权限）
            if (typeof PermissionManager !== 'undefined' && PermissionManager.checkAndRequestPermission) {
                try {
                    const granted = await PermissionManager.checkAndRequestPermission(currentPid, PermissionManager.PERMISSION.ENVIRONMENT_WRITE);
                    if (!granted) {
                        KernelLogger.error("LStorage", `进程 ${currentPid} 尝试删除环境变量 ${name}，但缺少权限 ENVIRONMENT_WRITE`);
                        throw new Error(`缺少权限：ENVIRONMENT_WRITE`);
                    }
                } catch (error) {
                    if (error.message && error.message.includes('缺少权限')) {
                        throw error;
                    }
                    KernelLogger.error("LStorage", `权限检查失败: ${error.message}`, error);
                    throw new Error(`权限检查失败: ${error.message}`);
                }
            }
            
            // 检查用户级别：普通用户不允许删除环境变量
            if (typeof UserControl !== 'undefined') {
                const isAdmin = UserControl.isAdmin();
                if (!isAdmin) {
                    KernelLogger.error("LStorage", `进程 ${currentPid} 尝试删除环境变量 ${name}，但当前用户不是管理员，普通用户不允许删除环境变量`);
                    throw new Error(`安全策略：普通用户不允许删除环境变量，需要管理员权限`);
                }
            }
        }
        
        try {
            // 获取注册表
            const registry = await LStorage.getSystemStorage('registry');
            if (!registry || typeof registry !== 'object') {
                return false; // 注册表不存在，环境变量也不存在
            }
            
            // 获取环境变量对象
            const environment = registry.environment || registry.env;
            if (!environment || typeof environment !== 'object') {
                return false; // 环境变量对象不存在
            }
            
            // 检查环境变量是否存在
            if (!(name in environment)) {
                return false; // 环境变量不存在
            }
            
            // 删除环境变量
            delete environment[name];
            
            // 保存注册表
            await LStorage.setSystemStorage('registry', registry);
            
            KernelLogger.info("LStorage", `环境变量已删除: ${name}`);
            return true;
        } catch (error) {
            KernelLogger.error("LStorage", `删除环境变量失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 列出所有环境变量名称
     * @returns {Promise<string[]>} 环境变量名称数组
     */
    static async listEnvironmentVariables() {
        // 检查是否为内核模块调用
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        // 如果不是内核模块调用，需要检查权限
        if (!isKernelModuleCall) {
            const currentPid = LStorage._getCurrentPid();
            if (!currentPid) {
                KernelLogger.error("LStorage", `无法获取进程PID，拒绝列出环境变量（安全策略）`);
                throw new Error(`安全策略：无法验证调用来源，拒绝列出环境变量`);
            }
            
            // 检查读取权限（列出环境变量需要 ENVIRONMENT_READ 权限）
            if (typeof PermissionManager !== 'undefined' && PermissionManager.checkAndRequestPermission) {
                try {
                    const granted = await PermissionManager.checkAndRequestPermission(currentPid, PermissionManager.PERMISSION.ENVIRONMENT_READ);
                    if (!granted) {
                        KernelLogger.error("LStorage", `进程 ${currentPid} 尝试列出环境变量，但缺少权限 ENVIRONMENT_READ`);
                        throw new Error(`缺少权限：ENVIRONMENT_READ`);
                    }
                } catch (error) {
                    if (error.message && error.message.includes('缺少权限')) {
                        throw error;
                    }
                    KernelLogger.error("LStorage", `权限检查失败: ${error.message}`, error);
                    throw new Error(`权限检查失败: ${error.message}`);
                }
            }
        }
        
        try {
            // 获取注册表
            const registry = await LStorage.getSystemStorage('registry');
            if (!registry || typeof registry !== 'object') {
                return [];
            }
            
            // 获取环境变量对象
            const environment = registry.environment || registry.env;
            if (!environment || typeof environment !== 'object') {
                return [];
            }
            
            // 返回所有环境变量名称
            return Object.keys(environment);
        } catch (error) {
            KernelLogger.error("LStorage", `列出环境变量失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 获取所有环境变量（返回 k/v 对象）
     * @returns {Promise<Object>} 环境变量对象 { [name: string]: string }
     */
    static async getAllEnvironmentVariables() {
        // 检查是否为内核模块调用
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        // 如果不是内核模块调用，需要检查权限
        if (!isKernelModuleCall) {
            const currentPid = LStorage._getCurrentPid();
            if (!currentPid) {
                KernelLogger.error("LStorage", `无法获取进程PID，拒绝获取所有环境变量（安全策略）`);
                throw new Error(`安全策略：无法验证调用来源，拒绝获取所有环境变量`);
            }
            
            // 检查读取权限（获取所有环境变量需要 ENVIRONMENT_READ 权限）
            if (typeof PermissionManager !== 'undefined' && PermissionManager.checkAndRequestPermission) {
                try {
                    const granted = await PermissionManager.checkAndRequestPermission(currentPid, PermissionManager.PERMISSION.ENVIRONMENT_READ);
                    if (!granted) {
                        KernelLogger.error("LStorage", `进程 ${currentPid} 尝试获取所有环境变量，但缺少权限 ENVIRONMENT_READ`);
                        throw new Error(`缺少权限：ENVIRONMENT_READ`);
                    }
                } catch (error) {
                    if (error.message && error.message.includes('缺少权限')) {
                        throw error;
                    }
                    KernelLogger.error("LStorage", `权限检查失败: ${error.message}`, error);
                    throw new Error(`权限检查失败: ${error.message}`);
                }
            }
        }
        
        try {
            // 获取注册表
            const registry = await LStorage.getSystemStorage('registry');
            if (!registry || typeof registry !== 'object') {
                return {};
            }
            
            // 获取环境变量对象
            const environment = registry.environment || registry.env;
            if (!environment || typeof environment !== 'object') {
                return {};
            }
            
            // 返回环境变量对象的副本（避免直接修改原对象）
            return { ...environment };
        } catch (error) {
            KernelLogger.error("LStorage", `获取所有环境变量失败: ${error.message}`, error);
            throw error;
        }
    }
    
    // ==================== 应用程序注册表 API ====================
    
    /**
     * 检查程序是否为静态程序（注册在 applicationAssets.js 中）
     * @param {string} programName 程序名称
     * @returns {boolean} 是否为静态程序
     * @private
     */
    static _isStaticProgram(programName) {
        try {
            // 从 POOL 获取 APPLICATION_ASSETS
            let applicationAssets = null;
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    applicationAssets = POOL.__GET__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS");
                } catch (e) {
                    // 忽略错误
                }
            }
            
            // 如果 POOL 中没有，尝试从全局对象获取
            if (!applicationAssets && typeof APPLICATION_ASSETS !== 'undefined') {
                applicationAssets = APPLICATION_ASSETS;
            }
            
            // 检查程序是否存在于静态注册表中
            return applicationAssets && typeof applicationAssets === 'object' && programName in applicationAssets;
        } catch (e) {
            KernelLogger.debug("LStorage", `检查静态程序失败: ${e.message}`);
            return false;
        }
    }
    
    /**
     * 从源文件 JSON 结构复制文件到目标目录
     * @param {Object} sourceFiles JSON 结构，表示文件目录结构 { "path": "content" }
     * @param {string} targetBasePath 目标基础路径（如 "D:/application/myapp"）
     * @returns {Promise<boolean>} 是否成功
     * @private
     */
    static async _copyFilesFromJson(sourceFiles, targetBasePath) {
        if (!sourceFiles || typeof sourceFiles !== 'object') {
            throw new Error('源文件 JSON 结构无效');
        }
        
        if (!targetBasePath || typeof targetBasePath !== 'string') {
            throw new Error('目标基础路径无效');
        }
        
        // 规范化目标路径（移除末尾斜杠）
        const normalizedTargetPath = targetBasePath.replace(/\/+$/, '');
        
        /**
         * 递归创建目录（确保所有父目录都存在）
         */
        const ensureDirectoryExists = async (dirPath) => {
            if (!dirPath || dirPath.length < 3) {
                return; // 跳过根路径（如 D:）
            }
            
            const dirParts = dirPath.split('/');
            if (dirParts.length < 2) {
                return;
            }
            
            // 从根目录开始，逐级创建
            for (let i = 2; i <= dirParts.length; i++) {
                const currentPath = dirParts.slice(0, i).join('/');
                if (currentPath.length < 3) {
                    continue; // 跳过根路径
                }
                
                const parentPath = dirParts.slice(0, i - 1).join('/');
                const dirName = dirParts[i - 1];
                
                if (!parentPath || parentPath.length < 3) {
                    continue; // 跳过无效的父路径
                }
                
                try {
                    // 使用 PHP 服务创建目录
                    const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                        : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                            ? SystemInformation.getOrigin()
                            : window.location.origin);
                    url.searchParams.set('action', 'create_dir');
                    url.searchParams.set('path', parentPath);
                    url.searchParams.set('name', dirName);
                    
                    const response = await fetch(url.toString());
                    if (response.ok) {
                        const result = await response.json();
                        if (result.status === 'success') {
                            KernelLogger.debug("LStorage", `目录已创建或已存在: ${currentPath}`);
                        } else if (result.data && result.data.existed) {
                            KernelLogger.debug("LStorage", `目录已存在: ${currentPath}`);
                        } else {
                            KernelLogger.debug("LStorage", `创建目录结果: ${currentPath}, ${result.message}`);
                        }
                    } else if (response.status === 404) {
                        // 父目录不存在，继续递归创建
                        await ensureDirectoryExists(parentPath);
                        // 重试创建当前目录
                        const retryResponse = await fetch(url.toString());
                        if (retryResponse.ok) {
                            const retryResult = await retryResponse.json();
                            if (retryResult.status === 'success' || (retryResult.data && retryResult.data.existed)) {
                                KernelLogger.debug("LStorage", `目录已创建或已存在: ${currentPath}`);
                            }
                        }
                    } else {
                        const errorText = await response.text().catch(() => '');
                        KernelLogger.debug("LStorage", `创建目录失败: ${currentPath}, HTTP ${response.status}, ${errorText}`);
                    }
                } catch (e) {
                    // 忽略单个目录创建错误，继续
                    KernelLogger.debug("LStorage", `创建目录时出错（继续）: ${currentPath}, ${e.message}`);
                }
            }
        };
        
        // 收集所有需要创建的目录（去重）
        const directoriesToCreate = new Set();
        for (const filePath of Object.keys(sourceFiles)) {
            const fullTargetPath = `${normalizedTargetPath}/${filePath}`;
            const pathParts = fullTargetPath.split('/');
            if (pathParts.length >= 2) {
                // 构建所有父目录路径
                for (let i = 2; i < pathParts.length; i++) {
                    const dirPath = pathParts.slice(0, i).join('/');
                    directoriesToCreate.add(dirPath);
                }
            }
        }
        
        // 创建所有需要的目录（按路径深度排序，确保父目录先创建）
        const sortedDirs = Array.from(directoriesToCreate).sort((a, b) => {
            const depthA = a.split('/').length;
            const depthB = b.split('/').length;
            return depthA - depthB;
        });
        
        for (const dirPath of sortedDirs) {
            await ensureDirectoryExists(dirPath);
        }
        
        // 遍历所有文件并复制
        for (const [filePath, content] of Object.entries(sourceFiles)) {
            if (typeof content !== 'string') {
                KernelLogger.warn("LStorage", `跳过非字符串内容: ${filePath}`);
                continue;
            }
            
            // 构建完整的目标路径
            const fullTargetPath = `${normalizedTargetPath}/${filePath}`;
            
            // 解析路径，分离目录和文件名
            const pathParts = fullTargetPath.split('/');
            if (pathParts.length < 2) {
                throw new Error(`无效的文件路径: ${fullTargetPath}`);
            }
            
            const fileName = pathParts[pathParts.length - 1];
            const dirPath = pathParts.slice(0, -1).join('/');
            
            try {
                // 使用 FileSystem.write API（如果可用）
                // 由于 LStorage 是内核模块，可以直接调用 ProcessManager._executeKernelAPI
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager._executeKernelAPI === 'function') {
                    // 直接调用内核 API（LStorage 是内核模块）
                    await ProcessManager._executeKernelAPI('FileSystem.write', [fullTargetPath, content, 'OVERWRITE'], null);
                } else {
                    // 降级方案：直接使用 PHP 服务写入文件
                    const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                        : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                            ? SystemInformation.getOrigin()
                            : window.location.origin);
                    url.searchParams.set('action', 'write_file');
                    url.searchParams.set('path', dirPath);
                    url.searchParams.set('fileName', fileName);
                    url.searchParams.set('writeMod', 'overwrite');
                    
                    const response = await fetch(url.toString(), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ content: content })
                    });
                    
                    if (!response.ok) {
                        // 如果是 404，可能是目录不存在，尝试创建目录后重试
                        if (response.status === 404) {
                            KernelLogger.debug("LStorage", `写入文件时目录不存在，尝试创建目录: ${dirPath}`);
                            // 尝试创建目录
                            try {
                                const dirParts = dirPath.split('/');
                                if (dirParts.length >= 2) {
                                    const parentPath = dirParts.slice(0, -1).join('/');
                                    const dirName = dirParts[dirParts.length - 1];
                                    
                                    const createUrl = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                                        : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                                            ? SystemInformation.getOrigin()
                                            : window.location.origin);
                                    createUrl.searchParams.set('action', 'create_dir');
                                    createUrl.searchParams.set('path', parentPath);
                                    createUrl.searchParams.set('name', dirName);
                                    
                                    const createResponse = await fetch(createUrl.toString());
                                    if (createResponse.ok) {
                                        // 目录创建成功，重试写入文件
                                        const retryResponse = await fetch(url.toString(), {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({ content: content })
                                        });
                                        
                                        if (!retryResponse.ok) {
                                            const errorText = await retryResponse.text();
                                            throw new Error(`写入文件失败: ${errorText}`);
                                        }
                                        
                                        const retryResult = await retryResponse.json();
                                        if (retryResult.status !== 'success') {
                                            throw new Error(`写入文件失败: ${retryResult.message || '未知错误'}`);
                                        }
                                    } else {
                                        const errorText = await response.text();
                                        throw new Error(`写入文件失败: 目录创建失败, ${errorText}`);
                                    }
                                } else {
                                    const errorText = await response.text();
                                    throw new Error(`写入文件失败: ${errorText}`);
                                }
                            } catch (createError) {
                                const errorText = await response.text().catch(() => '');
                                throw new Error(`写入文件失败: ${errorText || createError.message}`);
                            }
                        } else {
                            const errorText = await response.text();
                            throw new Error(`写入文件失败: ${errorText}`);
                        }
                    } else {
                        const result = await response.json();
                        if (result.status !== 'success') {
                            throw new Error(`写入文件失败: ${result.message || '未知错误'}`);
                        }
                    }
                }
                
                KernelLogger.debug("LStorage", `文件已复制: ${fullTargetPath}`);
            } catch (error) {
                KernelLogger.error("LStorage", `复制文件失败: ${fullTargetPath}, 错误: ${error.message}`, error);
                // 提供更详细的错误信息
                const errorDetails = {
                    sourcePath: filePath,
                    targetPath: fullTargetPath,
                    dirPath: dirPath,
                    fileName: fileName,
                    error: error.message
                };
                KernelLogger.error("LStorage", `复制文件详细信息:`, errorDetails);
                throw new Error(`复制文件失败: ${filePath} -> ${fullTargetPath} - ${error.message}`);
            }
        }
        
        KernelLogger.info("LStorage", `所有文件复制完成，共 ${Object.keys(sourceFiles).length} 个文件`);
        return true;
    }
    
    /**
     * 执行 uninstall.js（如果存在）
     * @param {string} programName 程序名称
     * @param {Object} asset 应用程序资源对象
     * @returns {Promise<boolean>} 是否执行成功（文件不存在返回 true）
     * @private
     */
    static async _executeUninstall(programName, asset) {
        if (!programName || !asset) {
            return false;
        }
        
        try {
            // 从主脚本路径提取应用程序目录
            const mainScriptPath = asset.script || asset.path;
            if (!mainScriptPath) {
                KernelLogger.debug("LStorage", `无法确定应用程序目录，跳过 uninstall.js 执行`);
                return false;
            }
            
            // 提取应用程序目录路径
            const pathParts = mainScriptPath.split('/');
            if (pathParts.length < 3) {
                KernelLogger.debug("LStorage", `无效的主脚本路径，跳过 uninstall.js 执行: ${mainScriptPath}`);
                return false;
            }
            
            // 假设路径格式为 "D:/application/myapp/myapp.js"
            // 提取 "D:/application/myapp"
            const appDirPath = pathParts.slice(0, -1).join('/');
            const uninstallPath = `${appDirPath}/uninstall.js`;
            
            // 检查文件是否存在并读取
            let uninstallContent = null;
            
            // 尝试通过 ProcessManager 读取文件
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager._executeKernelAPI === 'function') {
                try {
                    const result = await ProcessManager._executeKernelAPI('FileSystem.read', [uninstallPath], null);
                    if (result && result.content) {
                        uninstallContent = result.content;
                    }
                } catch (e) {
                    // 文件不存在或其他错误
                    if (e.message && (e.message.includes('文件不存在') || e.message.includes('not found') || e.message.includes('404'))) {
                        KernelLogger.debug("LStorage", `uninstall.js 不存在，跳过执行: ${uninstallPath}`);
                        return true; // 文件不存在，返回 true（表示成功，因为没有需要执行的）
                    }
                    KernelLogger.warn("LStorage", `读取 uninstall.js 失败: ${e.message}`);
                }
            }
            
            // 如果 ProcessManager 读取失败，尝试直接使用 fetch
            if (!uninstallContent) {
                try {
                    const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                        : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                            ? SystemInformation.getOrigin()
                            : window.location.origin);
                    url.searchParams.set('action', 'read_file');
                    url.searchParams.set('path', appDirPath);
                    url.searchParams.set('fileName', 'uninstall.js');
                    
                    const response = await fetch(url.toString());
                    if (response.ok) {
                        const result = await response.json();
                        if (result.status === 'success' && result.data && result.data.content) {
                            uninstallContent = result.data.content;
                        } else if (result.status === 'error' && result.message && 
                                   (result.message.includes('文件不存在') || result.message.includes('not found'))) {
                            KernelLogger.debug("LStorage", `uninstall.js 不存在，跳过执行: ${uninstallPath}`);
                            return true; // 文件不存在，返回 true
                        }
                    } else if (response.status === 404) {
                        KernelLogger.debug("LStorage", `uninstall.js 不存在，跳过执行: ${uninstallPath}`);
                        return true; // 文件不存在，返回 true
                    }
                } catch (e) {
                    KernelLogger.warn("LStorage", `通过 fetch 读取 uninstall.js 失败: ${e.message}`);
                }
            }
            
            // 如果文件不存在，返回 true（表示成功，因为没有需要执行的）
            if (!uninstallContent) {
                return true;
            }
            
            KernelLogger.info("LStorage", `找到 uninstall.js，开始执行: ${uninstallPath}`);
            
            // 使用 ProcessManager 启动 uninstall.js 作为 ZerOS 程序
            if (typeof ProcessManager === 'undefined' || typeof ProcessManager.startProgram !== 'function') {
                KernelLogger.error("LStorage", `ProcessManager 不可用，无法执行 uninstall.js`);
                return false;
            }
            
            // 创建临时程序配置
            const tempAsset = {
                script: uninstallContent,  // 直接传入脚本内容
                styles: [],
                assets: [],
                metadata: {
                    type: 'CLI',  // uninstall.js 通常是 CLI 程序，不需要 GUI
                    autoStart: false,
                    allowMultipleInstances: false,
                    description: `${programName} 卸载脚本`
                }
            };
            
            // 启动 uninstall.js 程序
            // 注意：uninstall.js 应该是一个 IIFE 包装的程序，它会将程序对象注册到 window 或 POOL 中
            // 程序对象名称应该是 'UNINSTALL'（大写）
            try {
                const uninstallPid = await ProcessManager.startProgram('uninstall', {
                    tempAsset: tempAsset,
                    args: [programName],
                    metadata: {
                        uninstallContext: {
                            programName: programName,
                            appDirPath: appDirPath,
                            asset: asset
                        }
                    }
                });
                
                KernelLogger.info("LStorage", `uninstall.js 已启动 (PID: ${uninstallPid})`);
                
                // 等待 uninstall 程序完成（通过检查进程状态）
                // 需要等待 uninstall 程序完成后再继续删除文件
                // 对于 CLI 程序，可能执行很快，立即开始检查
                const maxWaitTime = 30000; // 最多等待 30 秒
                const checkInterval = 100; // 每 100ms 检查一次（更频繁的检查）
                const startTime = Date.now();
                let lastStatus = null;
                let runningStartTime = null; // 记录程序进入 running 状态的时间
                
                while (Date.now() - startTime < maxWaitTime) {
                    try {
                        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getProcessInfo === 'function') {
                            const processInfo = ProcessManager.getProcessInfo(uninstallPid);
                            if (!processInfo) {
                                // 进程不存在，可能已经退出
                                KernelLogger.info("LStorage", `uninstall.js 程序已退出 (PID: ${uninstallPid})`);
                                return true;
                            }
                            
                            const currentStatus = processInfo.status;
                            
                            // 如果状态发生变化，记录日志
                            if (currentStatus !== lastStatus) {
                                KernelLogger.debug("LStorage", `uninstall.js 程序状态变化: ${lastStatus || '未知'} -> ${currentStatus} (PID: ${uninstallPid})`);
                                lastStatus = currentStatus;
                                
                                // 如果程序进入 running 状态，记录时间
                                if (currentStatus === 'running' && !runningStartTime) {
                                    runningStartTime = Date.now();
                                }
                            }
                            
                            // 检查程序状态
                            if (currentStatus === 'exited' || currentStatus === 'exiting') {
                                KernelLogger.info("LStorage", `uninstall.js 程序已完成 (PID: ${uninstallPid}, 状态: ${currentStatus})`);
                                return true;
                            }
                            
                            // 对于 CLI 程序，如果状态是 running 但已经运行了一段时间（比如 5 秒），
                            // 可能是程序已经执行完成但状态没有及时更新，假设已完成
                            if (currentStatus === 'running' && runningStartTime) {
                                const runningDuration = Date.now() - runningStartTime;
                                // CLI 程序通常执行很快，如果运行超过 5 秒，假设已完成
                                if (runningDuration > 5000) {
                                    KernelLogger.info("LStorage", `uninstall.js 程序已运行 ${runningDuration}ms，假设已完成 (PID: ${uninstallPid})`);
                                    return true;
                                }
                            }
                            
                            // 如果程序状态是 loading，继续等待（程序可能还在初始化）
                            // 如果程序状态是 running，也继续等待（程序可能正在执行清理操作）
                            
                            // 进程仍在运行，继续等待
                        } else {
                            // ProcessManager 不可用，无法检查进程状态
                            // 等待一段时间后假设完成
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            return true;
                        }
                    } catch (e) {
                        // 检查失败，可能是进程已经退出
                        KernelLogger.debug("LStorage", `检查 uninstall.js 状态时出错（可能已退出）: ${e.message}`);
                        // 如果检查失败，可能是进程已经不存在，等待一小段时间后继续
                        await new Promise(resolve => setTimeout(resolve, 500));
                        // 再次尝试检查，如果仍然失败，假设程序已完成
                        try {
                            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getProcessInfo === 'function') {
                                const processInfo = ProcessManager.getProcessInfo(uninstallPid);
                                if (!processInfo || processInfo.status === 'exited' || processInfo.status === 'exiting') {
                                    KernelLogger.info("LStorage", `uninstall.js 程序已完成 (PID: ${uninstallPid})`);
                                    return true;
                                }
                            }
                        } catch (e2) {
                            // 再次检查也失败，假设程序已完成
                            KernelLogger.info("LStorage", `uninstall.js 程序可能已完成 (PID: ${uninstallPid})`);
                            return true;
                        }
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                }
                
                // 超时，但继续卸载（不中断）
                KernelLogger.warn("LStorage", `uninstall.js 程序等待超时 (PID: ${uninstallPid})，继续卸载`);
                return true;
            } catch (error) {
                // 如果是加载超时错误，可能是 uninstall.js 没有正确注册程序对象
                // 这种情况下，我们仍然允许卸载继续，但记录警告
                if (error.message && error.message.includes('failed to load within timeout')) {
                    KernelLogger.warn("LStorage", `uninstall.js 加载超时，可能未正确注册程序对象，跳过 uninstall.js 执行`);
                    return false; // 返回 false 表示未执行
                }
                KernelLogger.error("LStorage", `启动 uninstall.js 程序失败: ${error.message}`, error);
                // 即使失败也继续卸载流程，不中断
                return false;
            }
        } catch (error) {
            KernelLogger.error("LStorage", `执行 uninstall.js 时出错: ${error.message}`, error);
            // 即使出错也继续卸载流程，不中断
            return false;
        }
    }
    
    /**
     * 删除应用程序的所有文件
     * @param {Object} asset 程序资源对象
     * @returns {Promise<boolean>} 是否成功
     * @private
     */
    static async _deleteApplicationFiles(asset) {
        if (!asset || typeof asset !== 'object') {
            return true; // 没有文件需要删除
        }
        
        // 收集所有需要删除的文件路径
        const filesToDelete = [];
        
        // 主脚本文件
        if (asset.script) {
            filesToDelete.push(asset.script);
        } else if (asset.path) {
            filesToDelete.push(asset.path);
        }
        
        // 样式文件
        if (Array.isArray(asset.styles)) {
            filesToDelete.push(...asset.styles);
        }
        
        // 图标文件
        if (asset.icon) {
            filesToDelete.push(asset.icon);
        }
        
        // 资源文件
        if (Array.isArray(asset.assets)) {
            filesToDelete.push(...asset.assets);
        } else if (typeof asset.assets === 'string') {
            filesToDelete.push(asset.assets);
        }
        
        // 删除所有文件
        for (const filePath of filesToDelete) {
            try {
                // 解析路径
                const pathParts = filePath.split('/');
                if (pathParts.length < 2) {
                    KernelLogger.warn("LStorage", `无效的文件路径: ${filePath}`);
                    continue;
                }
                
                const fileName = pathParts[pathParts.length - 1];
                const dirPath = pathParts.slice(0, -1).join('/');
                
                // 使用 FileSystem.delete API
                // 由于 LStorage 是内核模块，可以直接调用 ProcessManager._executeKernelAPI
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager._executeKernelAPI === 'function') {
                    try {
                        // 直接调用内核 API（LStorage 是内核模块）
                        await ProcessManager._executeKernelAPI('FileSystem.delete', [filePath], null);
                        KernelLogger.debug("LStorage", `文件已删除: ${filePath}`);
                    } catch (error) {
                        // 如果文件不存在，这是可以接受的（可能已经被删除或从未存在）
                        if (error.message && (error.message.includes('文件不存在') || error.message.includes('not found') || error.message.includes('404'))) {
                            KernelLogger.debug("LStorage", `文件不存在，跳过删除: ${filePath}`);
                        } else {
                            throw error;  // 其他错误继续抛出
                        }
                    }
                } else {
                    // 降级方案：使用 PHP 服务删除文件
                    const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                        : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                            ? SystemInformation.getOrigin()
                            : window.location.origin);
                    url.searchParams.set('action', 'delete_file');
                    url.searchParams.set('path', dirPath);
                    url.searchParams.set('fileName', fileName);
                    
                    const response = await fetch(url.toString(), {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (!response.ok) {
                        // 404 表示文件不存在，这是可以接受的
                        if (response.status === 404) {
                            KernelLogger.debug("LStorage", `文件不存在，跳过删除: ${filePath}`);
                        } else {
                            KernelLogger.warn("LStorage", `删除文件失败: ${filePath}, HTTP ${response.status}`);
                        }
                    } else {
                        KernelLogger.debug("LStorage", `文件已删除: ${filePath}`);
                    }
                }
            } catch (error) {
                // 如果文件不存在，这是可以接受的（可能已经被删除或从未存在）
                if (error.message && (error.message.includes('文件不存在') || error.message.includes('not found') || error.message.includes('404'))) {
                    KernelLogger.debug("LStorage", `文件不存在，跳过删除: ${filePath}`);
                } else {
                    KernelLogger.warn("LStorage", `删除文件失败: ${filePath}, 错误: ${error.message}`);
                }
                // 继续删除其他文件，不中断
            }
        }
        
        // 删除应用程序目录（递归删除整个目录）
        // 注意：先删除所有文件，最后删除目录
        try {
            // 从主脚本路径提取应用程序目录
            const mainScriptPath = asset.script || asset.path;
            if (mainScriptPath) {
                const pathParts = mainScriptPath.split('/');
                if (pathParts.length >= 3) {
                    // 假设路径格式为 "D:/application/myapp/myapp.js"
                    // 提取 "D:/application/myapp"
                    const appDirPath = pathParts.slice(0, -1).join('/');
                    
                    // 使用 FileSystem.delete 递归删除整个目录
                    // FileSystem.delete 会自动检测是文件还是目录，如果是目录则使用递归删除
                    if (typeof ProcessManager !== 'undefined' && typeof ProcessManager._executeKernelAPI === 'function') {
                        try {
                            KernelLogger.info("LStorage", `删除应用程序目录: ${appDirPath}`);
                            await ProcessManager._executeKernelAPI('FileSystem.delete', [appDirPath], null);
                            KernelLogger.info("LStorage", `应用程序目录已删除: ${appDirPath}`);
                        } catch (e) {
                            // 如果目录不存在，这是可以接受的
                            if (e.message && (e.message.includes('文件不存在') || e.message.includes('not found') || e.message.includes('404'))) {
                                KernelLogger.debug("LStorage", `应用程序目录不存在，跳过删除: ${appDirPath}`);
                            } else {
                                KernelLogger.warn("LStorage", `删除应用程序目录失败: ${appDirPath}, 错误: ${e.message}`);
                                // 如果递归删除失败，尝试使用 PHP 服务直接删除目录
                                try {
                                    const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                                        : new URL(LStorage.PHP_SERVICE_URL, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) 
                                            ? SystemInformation.getOrigin()
                                            : window.location.origin);
                                    url.searchParams.set('action', 'delete_dir_recursive');
                                    url.searchParams.set('path', appDirPath);
                                    
                                    const response = await fetch(url.toString());
                                    if (response.ok) {
                                        const result = await response.json();
                                        if (result.status === 'success') {
                                            KernelLogger.info("LStorage", `通过 PHP 服务删除应用程序目录成功: ${appDirPath}`);
                                        } else {
                                            KernelLogger.warn("LStorage", `通过 PHP 服务删除应用程序目录失败: ${result.message}`);
                                        }
                                    }
                                } catch (phpError) {
                                    KernelLogger.warn("LStorage", `通过 PHP 服务删除应用程序目录失败: ${phpError.message}`);
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            // 忽略目录删除错误（不影响卸载流程）
            KernelLogger.warn("LStorage", `删除应用程序目录时出错: ${error.message}`);
        }
        
        return true;
    }
    
    /**
     * 安装应用程序到 ApplicationTable（动态程序注册表）
     * @param {string} programName 程序名称
     * @param {Object} asset 程序资源对象（格式与 applicationAssets.js 相同）
     * @param {Object} sourceFiles 源文件 JSON 结构，用于复制文件到 application/ 目录（可选）
     * @returns {Promise<boolean>} 是否成功
     */
    static async installApplication(programName, asset, sourceFiles = null) {
        if (!programName || typeof programName !== 'string') {
            throw new Error('程序名称必须是字符串');
        }
        
        if (!asset || (typeof asset !== 'string' && (typeof asset !== 'object' || asset === null))) {
            throw new Error('程序资源无效（必须是字符串路径或对象）');
        }
        
        // 检查是否为内核模块调用
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        // 如果不是内核模块调用，需要检查权限
        if (!isKernelModuleCall) {
            const currentPid = LStorage._getCurrentPid();
            if (!currentPid) {
                KernelLogger.error("LStorage", `无法获取进程PID，拒绝安装应用程序（安全策略）`);
                throw new Error(`安全策略：无法验证调用来源，拒绝安装应用程序`);
            }
            
            // 检查用户级别：普通用户不允许安装应用程序
            if (typeof UserControl !== 'undefined') {
                const isAdmin = UserControl.isAdmin();
                if (!isAdmin) {
                    KernelLogger.error("LStorage", `进程 ${currentPid} 尝试安装应用程序 ${programName}，但当前用户不是管理员，普通用户不允许安装应用程序`);
                    throw new Error(`安全策略：普通用户不允许安装应用程序，需要管理员权限`);
                }
            }
            
            // 检查应用程序安装权限
            if (typeof PermissionManager !== 'undefined' && PermissionManager.checkAndRequestPermission) {
                try {
                    const granted = await PermissionManager.checkAndRequestPermission(
                        currentPid, 
                        PermissionManager.PERMISSION.APPLICATION_INSTALL
                    );
                    if (!granted) {
                        KernelLogger.error("LStorage", `进程 ${currentPid} 尝试安装应用程序 ${programName}，但缺少权限 APPLICATION_INSTALL`);
                        throw new Error(`缺少权限：APPLICATION_INSTALL`);
                    }
                } catch (error) {
                    if (error.message && error.message.includes('缺少权限')) {
                        throw error;
                    }
                    KernelLogger.error("LStorage", `权限检查失败: ${error.message}`, error);
                    throw new Error(`权限检查失败: ${error.message}`);
                }
            }
        }
        
        try {
            // 获取 ApplicationTable
            let applicationTable = await LStorage.getSystemStorage('applicationTable');
            if (!applicationTable || typeof applicationTable !== 'object') {
                applicationTable = {};
            }
            
            // 验证资源格式
            if (typeof asset === 'string') {
                // 简单格式：字符串路径
                if (!asset.trim()) {
                    throw new Error('脚本路径不能为空');
                }
            } else if (typeof asset === 'object' && asset !== null) {
                // 完整格式：对象
                if (!asset.script && !asset.path) {
                    throw new Error('缺少脚本路径（script 或 path）');
                }
                if (asset.styles !== undefined && !Array.isArray(asset.styles)) {
                    throw new Error('styles 必须是数组');
                }
                if (asset.icon !== undefined && typeof asset.icon !== 'string') {
                    throw new Error('icon 必须是字符串');
                }
                if (asset.metadata !== undefined && (typeof asset.metadata !== 'object' || asset.metadata === null)) {
                    throw new Error('metadata 必须是对象');
                }
            }
            
            // 如果提供了源文件 JSON 结构，复制文件到 application/ 目录
            if (sourceFiles && typeof sourceFiles === 'object') {
                // 确定目标基础路径（D:/application/programName）
                const targetBasePath = `D:/application/${programName}`;
                
                KernelLogger.info("LStorage", `开始复制源文件到: ${targetBasePath}`);
                
                // 复制所有文件
                await LStorage._copyFilesFromJson(sourceFiles, targetBasePath);
                
                // 更新 asset 中的路径，使其指向 application/ 目录
                // 注意：路径应该基于源文件 JSON 结构中的实际路径
                if (typeof asset === 'object' && asset !== null) {
                    // 更新 script 路径
                    if (asset.script) {
                        // 如果 script 是相对路径，更新为绝对路径（检查是否是分区路径格式 A-Z:/）
                        if (!asset.script.match(/^[A-Z]:\//)) {
                            asset.script = `${targetBasePath}/${asset.script}`;
                        }
                    } else if (asset.path) {
                        // 检查是否是分区路径格式 A-Z:/
                        if (!asset.path.match(/^[A-Z]:\//)) {
                            asset.path = `${targetBasePath}/${asset.path}`;
                        }
                    } else {
                        // 如果没有指定 script，尝试从源文件 JSON 中找到主脚本文件
                        // 通常主脚本文件名与程序名相同
                        const mainScriptKey = Object.keys(sourceFiles).find(key => 
                            key.endsWith(`${programName}.js`) || key.endsWith('index.js') || key.endsWith('main.js')
                        );
                        if (mainScriptKey) {
                            asset.script = `${targetBasePath}/${mainScriptKey}`;
                        } else {
                            // 使用默认路径
                            asset.script = `${targetBasePath}/${programName}.js`;
                        }
                    }
                    
                    // 更新 styles 路径
                    if (Array.isArray(asset.styles)) {
                        asset.styles = asset.styles.map(style => {
                            // 检查是否是分区路径格式 A-Z:/
                            if (!style.match(/^[A-Z]:\//)) {
                                return `${targetBasePath}/${style}`;
                            }
                            return style;
                        });
                    }
                    
                    // 更新 icon 路径
                    if (asset.icon && !asset.icon.match(/^[A-Z]:\//)) {
                        // 确保路径正确拼接（避免重复斜杠）
                        const iconPath = asset.icon.startsWith('/') ? asset.icon.substring(1) : asset.icon;
                        asset.icon = `${targetBasePath}/${iconPath}`.replace(/\/+/g, '/');
                        KernelLogger.debug("LStorage", `图标路径已更新: ${asset.icon}`);
                    } else if (asset.icon && asset.icon.match(/^[A-Z]:\//)) {
                        // 如果已经是绝对路径（分区路径格式），确保格式正确
                        asset.icon = asset.icon.replace(/\/+/g, '/');
                        KernelLogger.debug("LStorage", `图标路径（绝对路径）: ${asset.icon}`);
                    }
                    
                    // 更新 assets 路径
                    if (Array.isArray(asset.assets)) {
                        asset.assets = asset.assets.map(assetPath => {
                            // 检查是否是分区路径格式 A-Z:/
                            if (!assetPath.match(/^[A-Z]:\//)) {
                                return `${targetBasePath}/${assetPath}`;
                            }
                            return assetPath;
                        });
                    } else if (typeof asset.assets === 'string' && !asset.assets.match(/^[A-Z]:\//)) {
                        asset.assets = `${targetBasePath}/${asset.assets}`;
                    }
                } else if (typeof asset === 'string' && !asset.match(/^[A-Z]:\//)) {
                    // 简单格式：更新路径
                    asset = `${targetBasePath}/${asset}`;
                }
                
                KernelLogger.info("LStorage", `源文件复制完成`);
            }
            
            // 添加或更新应用程序
            applicationTable[programName] = asset;
            
            // 记录图标路径（用于调试）
            if (asset.icon) {
                KernelLogger.info("LStorage", `程序 ${programName} 的图标路径: ${asset.icon}`);
            } else {
                KernelLogger.warn("LStorage", `程序 ${programName} 没有图标路径`);
            }
            
            // 保存到系统存储
            await LStorage.setSystemStorage('applicationTable', applicationTable);
            
            // 刷新 ApplicationAssetManager，使新安装的程序立即可用
            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.refresh === 'function') {
                try {
                    await ApplicationAssetManager.refresh();
                    KernelLogger.info("LStorage", `ApplicationAssetManager 已刷新`);
                } catch (e) {
                    KernelLogger.warn("LStorage", `刷新 ApplicationAssetManager 失败: ${e.message}`);
                }
            }
            
            KernelLogger.info("LStorage", `应用程序已安装: ${programName}`);
            return true;
        } catch (error) {
            KernelLogger.error("LStorage", `安装应用程序失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 卸载应用程序（从 ApplicationTable 中删除）
     * @param {string} programName 程序名称
     * @returns {Promise<boolean>} 是否成功
     */
    static async uninstallApplication(programName) {
        if (!programName || typeof programName !== 'string') {
            throw new Error('程序名称必须是字符串');
        }
        
        // 检查是否为内核模块调用
        const isKernelModuleCall = LStorage._isKernelModuleCall();
        
        // 如果不是内核模块调用，需要检查权限
        if (!isKernelModuleCall) {
            const currentPid = LStorage._getCurrentPid();
            if (!currentPid) {
                KernelLogger.error("LStorage", `无法获取进程PID，拒绝卸载应用程序（安全策略）`);
                throw new Error(`安全策略：无法验证调用来源，拒绝卸载应用程序`);
            }
            
            // 检查用户级别：普通用户不允许卸载应用程序
            if (typeof UserControl !== 'undefined') {
                const isAdmin = UserControl.isAdmin();
                if (!isAdmin) {
                    KernelLogger.error("LStorage", `进程 ${currentPid} 尝试卸载应用程序 ${programName}，但当前用户不是管理员，普通用户不允许卸载应用程序`);
                    throw new Error(`安全策略：普通用户不允许卸载应用程序，需要管理员权限`);
                }
            }
            
            // 检查应用程序卸载权限
            if (typeof PermissionManager !== 'undefined' && PermissionManager.checkAndRequestPermission) {
                try {
                    const granted = await PermissionManager.checkAndRequestPermission(
                        currentPid, 
                        PermissionManager.PERMISSION.APPLICATION_UNINSTALL
                    );
                    if (!granted) {
                        KernelLogger.error("LStorage", `进程 ${currentPid} 尝试卸载应用程序 ${programName}，但缺少权限 APPLICATION_UNINSTALL`);
                        throw new Error(`缺少权限：APPLICATION_UNINSTALL`);
                    }
                } catch (error) {
                    if (error.message && error.message.includes('缺少权限')) {
                        throw error;
                    }
                    KernelLogger.error("LStorage", `权限检查失败: ${error.message}`, error);
                    throw new Error(`权限检查失败: ${error.message}`);
                }
            }
        }
        
        try {
            // 检查是否为静态程序（禁止删除静态程序）
            if (LStorage._isStaticProgram(programName)) {
                KernelLogger.error("LStorage", `拒绝卸载静态程序: ${programName}（静态程序注册在 applicationAssets.js 中，不允许删除）`);
                throw new Error(`安全策略：不允许卸载静态程序 ${programName}（静态程序注册在 applicationAssets.js 中）`);
            }
            
            // 获取 ApplicationTable
            const applicationTable = await LStorage.getSystemStorage('applicationTable');
            if (!applicationTable || typeof applicationTable !== 'object') {
                KernelLogger.warn("LStorage", `ApplicationTable 不存在，无法卸载应用程序 ${programName}`);
                return false;
            }
            
            // 检查应用程序是否存在
            if (!(programName in applicationTable)) {
                KernelLogger.warn("LStorage", `应用程序 ${programName} 不存在于 ApplicationTable`);
                return false;
            }
            
            // 获取应用程序资源对象（用于删除文件）
            const asset = applicationTable[programName];
            
            // 1. 删除桌面图标（如果存在）
            try {
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager._executeKernelAPI === 'function') {
                    // 获取所有桌面图标
                    const desktopIcons = await ProcessManager._executeKernelAPI('Desktop.getIcons', [], null);
                    if (Array.isArray(desktopIcons)) {
                        // 查找匹配 programName 的图标
                        const matchingIcons = desktopIcons.filter(icon => 
                            icon && icon.programName && icon.programName.toLowerCase() === programName.toLowerCase()
                        );
                        
                        // 删除所有匹配的图标
                        for (const icon of matchingIcons) {
                            if (icon.id !== undefined) {
                                try {
                                    await ProcessManager._executeKernelAPI('Desktop.removeShortcut', [icon.id], null);
                                    KernelLogger.info("LStorage", `已删除桌面图标: ${icon.name} (ID: ${icon.id})`);
                                } catch (e) {
                                    KernelLogger.warn("LStorage", `删除桌面图标失败: ${e.message}`);
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                KernelLogger.warn("LStorage", `删除桌面图标时出错: ${e.message}`);
            }
            
            // 2. 取消任务栏固定（如果已固定）
            try {
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager._executeKernelAPI === 'function') {
                    await ProcessManager._executeKernelAPI('Taskbar.unpinProgram', [programName], null);
                    KernelLogger.info("LStorage", `已取消任务栏固定: ${programName}`);
                }
            } catch (e) {
                // 如果未固定，这是可以接受的
                if (!e.message || !e.message.includes('未固定')) {
                    KernelLogger.warn("LStorage", `取消任务栏固定时出错: ${e.message}`);
                }
            }
            
            // 3. 执行 uninstall.js（如果存在）
            KernelLogger.info("LStorage", `检查是否存在 uninstall.js: ${programName}`);
            await LStorage._executeUninstall(programName, asset);
            
            // 4. 删除应用程序的所有文件
            KernelLogger.info("LStorage", `开始删除应用程序文件: ${programName}`);
            await LStorage._deleteApplicationFiles(asset);
            
            // 从 ApplicationTable 中删除应用程序
            delete applicationTable[programName];
            
            // 保存到系统存储
            await LStorage.setSystemStorage('applicationTable', applicationTable);
            
            // 刷新 ApplicationAssetManager，使卸载的程序立即从列表中移除
            if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.refresh === 'function') {
                try {
                    await ApplicationAssetManager.refresh();
                    KernelLogger.info("LStorage", `ApplicationAssetManager 已刷新`);
                } catch (e) {
                    KernelLogger.warn("LStorage", `刷新 ApplicationAssetManager 失败: ${e.message}`);
                }
            }
            
            KernelLogger.info("LStorage", `应用程序已卸载: ${programName}`);
            return true;
        } catch (error) {
            KernelLogger.error("LStorage", `卸载应用程序失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 获取动态安装的应用程序信息
     * @param {string} programName 程序名称
     * @returns {Promise<Object|null>} 应用程序资源对象，如果不存在则返回 null
     */
    static async getInstalledApplication(programName) {
        if (!programName || typeof programName !== 'string') {
            return null;
        }
        
        try {
            // 获取 ApplicationTable
            const applicationTable = await LStorage.getSystemStorage('applicationTable');
            if (!applicationTable || typeof applicationTable !== 'object') {
                return null;
            }
            
            return applicationTable[programName] || null;
        } catch (error) {
            KernelLogger.error("LStorage", `获取应用程序信息失败: ${error.message}`, error);
            return null;
        }
    }
    
    /**
     * 检查应用程序是否已动态安装
     * @param {string} programName 程序名称
     * @returns {Promise<boolean>} 是否已安装
     */
    static async isApplicationInstalled(programName) {
        if (!programName || typeof programName !== 'string') {
            return false;
        }
        
        const app = await LStorage.getInstalledApplication(programName);
        return app !== null;
    }
    
    /**
     * 读取 ApplicationTable.json 文件
     * @returns {Promise<Object>} ApplicationTable 对象，如果文件不存在则返回 {}
     * @private
     */
    static async _getApplicationTable() {
        try {
            const content = await LStorage._readFileFromPHP(
                LStorage.APPLICATION_TABLE_FILE_PATH,
                LStorage.APPLICATION_TABLE_FILE_NAME
            );
            
            if (!content) {
                // 文件不存在，返回空对象
                KernelLogger.debug("LStorage", "ApplicationTable.json 不存在，返回空对象");
                return {};
            }
            
            // 解析 JSON
            try {
                const parsed = JSON.parse(content);
                if (typeof parsed !== 'object' || parsed === null) {
                    KernelLogger.warn("LStorage", "ApplicationTable.json 格式错误，返回空对象");
                    return {};
                }
                return parsed;
            } catch (parseError) {
                KernelLogger.error("LStorage", `解析 ApplicationTable.json 失败: ${parseError.message}`);
                return {};
            }
        } catch (error) {
            KernelLogger.error("LStorage", `读取 ApplicationTable.json 失败: ${error.message}`, error);
            return {};
        }
    }
    
    /**
     * 写入 ApplicationTable.json 文件
     * @param {Object} applicationTable ApplicationTable 对象
     * @returns {Promise<boolean>} 是否成功
     * @private
     */
    static async _setApplicationTable(applicationTable) {
        try {
            if (!applicationTable || typeof applicationTable !== 'object') {
                throw new Error('ApplicationTable 必须是对象');
            }
            
            // 序列化为 JSON
            const content = JSON.stringify(applicationTable, null, 2);
            
            // 写入文件
            const success = await LStorage._writeFileToPHP(
                LStorage.APPLICATION_TABLE_FILE_PATH,
                LStorage.APPLICATION_TABLE_FILE_NAME,
                content
            );
            
            if (success) {
                KernelLogger.debug("LStorage", "ApplicationTable.json 已保存");
            } else {
                KernelLogger.warn("LStorage", "ApplicationTable.json 保存失败");
            }
            
            return success;
        } catch (error) {
            KernelLogger.error("LStorage", `写入 ApplicationTable.json 失败: ${error.message}`, error);
            return false;
        }
    }
    
    /**
     * 列出所有动态安装的应用程序
     * @returns {Promise<Object>} 应用程序注册表对象 { [programName]: asset }
     */
    static async listInstalledApplications() {
        try {
            // 获取 ApplicationTable
            const applicationTable = await LStorage.getSystemStorage('applicationTable');
            if (!applicationTable || typeof applicationTable !== 'object') {
                return {};
            }
            
            // 返回副本（避免直接修改原对象）
            return { ...applicationTable };
        } catch (error) {
            KernelLogger.error("LStorage", `列出应用程序失败: ${error.message}`, error);
            return {};
        }
    }
    
    /**
     * 获取所有动态安装的应用程序名称列表
     * @returns {Promise<Array<string>>} 应用程序名称数组
     */
    static async listInstalledApplicationNames() {
        const applications = await LStorage.listInstalledApplications();
        return Object.keys(applications);
    }
}

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "LStorage", LStorage);
    } catch (e) {
        KernelLogger.error("LStorage", `注册到POOL失败: ${e.message}`);
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/drive/LStorage.js");
}
