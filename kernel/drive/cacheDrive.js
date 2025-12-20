// 缓存驱动
// 负责整个 ZerOS 系统的缓存管理
// 统一管理内核、系统和应用程序的缓存
// 默认缓存目录：D:/cache/
// 默认缓存管理文件：D:/LocalCache.json

KernelLogger.info("CacheDrive", "模块初始化");

class CacheDrive {
    // 缓存目录路径
    static CACHE_DIR = "D:/cache/";
    
    // 缓存管理文件路径
    static CACHE_METADATA_FILE = "D:/LocalCache.json";
    
    // PHP 服务地址
    static PHP_SERVICE_URL = "/system/service/FSDirve.php";
    
    // 缓存元数据结构
    // {
    //     system: {
    //         [key: string]: {
    //             value: any,
    //             expiresAt: number,  // 过期时间戳（毫秒），0 表示永不过期
    //             createdAt: number,  // 创建时间戳（毫秒）
    //             updatedAt: number,  // 更新时间戳（毫秒）
    //             size: number        // 缓存大小（字节，估算）
    //         }
    //     },
    //     programs: {
    //         [programName: string]: {
    //             [key: string]: {
    //                 value: any,
    //                 expiresAt: number,
    //                 createdAt: number,
    //                 updatedAt: number,
    //                 size: number
    //             }
    //         }
    //     }
    // }
    static _cacheMetadata = null;
    static _initialized = false;
    static _initializing = false;
    
    // 请求缓存（避免频繁读取文件）
    static _requestCache = {
        metadata: null,
        timestamp: 0,
        cacheTTL: 1000 // 1秒缓存
    };
    
    /**
     * 从 PID 获取程序名称
     * @param {number} pid 程序 PID
     * @returns {string|null} 程序名称，如果找不到则返回 null
     */
    static _getProgramNameFromPid(pid) {
        if (typeof ProcessManager === 'undefined' || !ProcessManager.PROCESS_TABLE) {
            return null;
        }
        
        const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
        if (processInfo && processInfo.programName) {
            return processInfo.programName;
        }
        
        return null;
    }
    
    /**
     * 初始化缓存驱动
     * @returns {Promise<void>}
     */
    static async init() {
        if (CacheDrive._initialized) {
            KernelLogger.debug("CacheDrive", "已初始化，跳过");
            return;
        }
        if (CacheDrive._initializing) {
            KernelLogger.debug("CacheDrive", "正在初始化，跳过重复调用");
            return;
        }
        CacheDrive._initializing = true;
        
        KernelLogger.info("CacheDrive", "初始化缓存驱动");
        
        try {
            // 确保缓存目录存在
            await CacheDrive._ensureCacheDirectory();
            
            // 加载缓存元数据（可能触发过期清理），允许在初始化阶段保存
            await CacheDrive._loadCacheMetadata();
            
            CacheDrive._initialized = true;
            KernelLogger.info("CacheDrive", "缓存驱动初始化完成");
        } catch (error) {
            KernelLogger.error("CacheDrive", `初始化失败: ${error.message}`, error);
            // 初始化失败时使用空数据结构
            CacheDrive._cacheMetadata = {
                system: {},
                programs: {}
            };
            CacheDrive._initialized = true;
        } finally {
            CacheDrive._initializing = false;
        }
    }
    
    /**
     * 确保缓存目录存在
     * @returns {Promise<void>}
     */
    static async _ensureCacheDirectory() {
        try {
            // 检查目录是否存在
            const exists = await CacheDrive._checkDirectoryExists(CacheDrive.CACHE_DIR);
            if (!exists) {
                // 创建目录
                await CacheDrive._createDirectory(CacheDrive.CACHE_DIR);
                KernelLogger.info("CacheDrive", `缓存目录已创建: ${CacheDrive.CACHE_DIR}`);
            }
        } catch (error) {
            KernelLogger.warn("CacheDrive", `确保缓存目录存在失败: ${error.message}`);
            // 不抛出错误，允许继续执行
        }
    }
    
    /**
     * 检查目录是否存在
     * @param {string} path 目录路径
     * @returns {Promise<boolean>}
     */
    static async _checkDirectoryExists(path) {
        try {
            if (typeof ProcessManager === 'undefined') {
                KernelLogger.warn("CacheDrive", "ProcessManager 未加载，无法检查目录是否存在");
                return false;
            }
            
            const pid = ProcessManager.EXPLOIT_PID || 10000;
            const result = await ProcessManager.callKernelAPI(pid, 'FileSystem.list', [path]);
            return result !== null && result !== undefined;
        } catch (error) {
            KernelLogger.debug("CacheDrive", `检查目录是否存在失败: ${path}, 错误: ${error.message}`);
            return false;
        }
    }
    
    /**
     * 创建目录
     * @param {string} path 目录路径
     * @returns {Promise<void>}
     */
    static async _createDirectory(path) {
        try {
            if (typeof ProcessManager === 'undefined') {
                throw new Error('ProcessManager 未加载');
            }
            
            const pid = ProcessManager.EXPLOIT_PID || 10000;
            await ProcessManager.callKernelAPI(pid, 'FileSystem.create', [path, 'directory']);
        } catch (error) {
            KernelLogger.warn("CacheDrive", `创建目录失败: ${path}, 错误: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 通过 PHP 服务读取文件
     * @param {string} path 文件路径
     * @param {string} fileName 文件名
     * @returns {Promise<string|null>} 文件内容，失败返回 null
     */
    static async _readFileFromPHP(path, fileName) {
        try {
            const url = new URL(CacheDrive.PHP_SERVICE_URL, window.location.origin);
            url.searchParams.set('action', 'read_file');
            url.searchParams.set('path', path);
            url.searchParams.set('fileName', fileName);
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    KernelLogger.debug("CacheDrive", `文件不存在: ${path}/${fileName}`);
                    return null;
                }
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
                KernelLogger.debug("CacheDrive", `PHP 返回空响应: ${path}/${fileName}`);
                return null;
            }
            
            // 尝试解析 JSON
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (jsonError) {
                // JSON 解析失败，可能是 PHP 错误或空响应
                KernelLogger.warn("CacheDrive", `PHP 返回的 JSON 无效: ${responseText.substring(0, 200)}`);
                // 如果是空响应或无效 JSON，返回 null（表示文件不存在或无法读取）
                if (jsonError.message && jsonError.message.includes('Unexpected end of JSON input')) {
                    KernelLogger.debug("CacheDrive", `PHP 返回空 JSON，文件可能不存在: ${path}/${fileName}`);
                    return null;
                }
                throw new Error(`JSON 解析失败: ${jsonError.message}`);
            }
            
            if (result.status === 'success' && result.data && result.data.content !== undefined) {
                const fileContent = result.data.content;
                // 检查内容是否为空
                if (fileContent === null || fileContent === undefined || 
                    (typeof fileContent === 'string' && fileContent.trim() === '')) {
                    KernelLogger.debug("CacheDrive", `文件内容为空: ${path}/${fileName}`);
                    return null;
                }
                return fileContent;
            } else if (result.status === 'error' && result.message && result.message.includes('不存在')) {
                // 文件不存在
                return null;
            } else {
                throw new Error(result.message || '读取文件失败');
            }
        } catch (error) {
            // 网络错误或文件不存在
            if (error.message && (error.message.includes('不存在') || error.message.includes('Unexpected end of JSON input'))) {
                KernelLogger.debug("CacheDrive", `文件不存在或响应为空: ${path}/${fileName}`);
                return null;
            }
            KernelLogger.error("CacheDrive", `通过 PHP 读取文件失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 通过 PHP 服务写入文件
     * @param {string} path 文件路径
     * @param {string} fileName 文件名
     * @param {string} content 文件内容
     * @returns {Promise<boolean>} 是否成功
     */
    static async _writeFileToPHP(path, fileName, content) {
        try {
            const url = new URL(CacheDrive.PHP_SERVICE_URL, window.location.origin);
            url.searchParams.set('action', 'write_file');
            url.searchParams.set('path', path);
            url.searchParams.set('fileName', fileName);
            url.searchParams.set('writeMod', 'overwrite');
            
            const contentSize = typeof content === 'string' ? content.length : JSON.stringify(content).length;
            KernelLogger.debug("CacheDrive", `准备写入文件: ${path}/${fileName}, 内容大小: ${contentSize} 字节`);
            
            // 使用 POST 请求传递内容（避免 URL 过长）
            const requestBody = JSON.stringify({ content: content });
            
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: requestBody
            });
            
            KernelLogger.debug("CacheDrive", `PHP 响应状态: ${response.status} ${response.statusText}`);
            
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
                KernelLogger.error("CacheDrive", `PHP 写入文件失败: ${errorText}`);
                throw new Error(errorText);
            }
            
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                KernelLogger.error("CacheDrive", `PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
                throw new Error(`PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
            }
            
            // 读取响应内容
            const responseText = await response.text();
            if (!responseText || responseText.trim() === '') {
                KernelLogger.warn("CacheDrive", `PHP 返回空响应: ${path}/${fileName}`);
                // 空响应可能表示写入失败，但某些情况下也可能是成功
                return true;
            }
            
            // 尝试解析 JSON
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (jsonError) {
                KernelLogger.warn("CacheDrive", `PHP 返回的 JSON 无效: ${responseText.substring(0, 200)}`);
                // JSON 解析失败，但可能是写入成功（某些 PHP 实现可能返回非标准响应）
                return true;
            }
            
            if (result.status === 'success') {
                return true;
            } else {
                const errorMsg = result.message || '写入文件失败';
                KernelLogger.error("CacheDrive", `PHP 写入文件失败: ${errorMsg}`);
                throw new Error(errorMsg);
            }
        } catch (error) {
            KernelLogger.error("CacheDrive", `通过 PHP 写入文件失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 加载缓存元数据
     * @param {boolean} forceReload 是否强制重新加载
     * @returns {Promise<void>}
     */
    static async _loadCacheMetadata(forceReload = false) {
        // 检查请求缓存
        const now = Date.now();
        if (!forceReload && CacheDrive._requestCache.metadata && 
            (now - CacheDrive._requestCache.timestamp) < CacheDrive._requestCache.cacheTTL) {
            CacheDrive._cacheMetadata = CacheDrive._requestCache.metadata;
            return;
        }
        
        try {
            const path = CacheDrive.CACHE_METADATA_FILE.substring(0, CacheDrive.CACHE_METADATA_FILE.lastIndexOf('/') + 1);
            const fileName = CacheDrive.CACHE_METADATA_FILE.substring(CacheDrive.CACHE_METADATA_FILE.lastIndexOf('/') + 1);
            
            const content = await CacheDrive._readFileFromPHP(path, fileName);
            
            if (content === null || content === undefined) {
                // 文件不存在，使用空数据结构
                CacheDrive._cacheMetadata = {
                    system: {},
                    programs: {}
                };
                KernelLogger.debug("CacheDrive", "缓存元数据文件不存在，使用空数据结构");
                
                // 文件不存在时，清理缓存目录中可能存在的过期文件
                await CacheDrive._cleanOrphanedCacheFiles();
            } else {
                // 检查内容是否为空或无效
                if (typeof content === 'string' && (content.trim() === '' || content.trim() === '{}')) {
                    // 内容为空，使用空数据结构
                    CacheDrive._cacheMetadata = {
                        system: {},
                        programs: {}
                    };
                    KernelLogger.debug("CacheDrive", "缓存元数据文件内容为空，使用空数据结构");
                    return;
                }
                
                // 解析 JSON
                let parsedContent;
                if (typeof content === 'string') {
                    try {
                        parsedContent = JSON.parse(content);
                    } catch (parseError) {
                        // JSON 解析失败，可能是文件损坏或内容不完整
                        // 检查是否是空内容导致的错误
                        if (parseError.message && parseError.message.includes('Unexpected end of JSON input')) {
                            KernelLogger.debug("CacheDrive", `缓存元数据文件内容不完整，使用空数据结构: ${parseError.message}`);
                        } else {
                            KernelLogger.warn("CacheDrive", `解析缓存元数据失败: ${parseError.message}，使用空数据结构`);
                        }
                        CacheDrive._cacheMetadata = {
                            system: {},
                            programs: {}
                        };
                        return;
                    }
                } else {
                    parsedContent = content;
                }
                
                // 验证数据结构
                if (parsedContent && typeof parsedContent === 'object') {
                    if (!parsedContent.system) parsedContent.system = {};
                    if (!parsedContent.programs) parsedContent.programs = {};
                    CacheDrive._cacheMetadata = parsedContent;
                } else {
                    KernelLogger.warn("CacheDrive", "缓存元数据格式无效，使用空数据结构");
                    CacheDrive._cacheMetadata = {
                        system: {},
                        programs: {}
                    };
                }
            }
            
            // 更新请求缓存
            CacheDrive._requestCache.metadata = CacheDrive._cacheMetadata;
            CacheDrive._requestCache.timestamp = now;
            
            // 清理过期缓存（只有在成功加载元数据时才清理）
            if (CacheDrive._cacheMetadata && typeof CacheDrive._cacheMetadata === 'object') {
                await CacheDrive._cleanExpiredCache();
            }
        } catch (error) {
            KernelLogger.error("CacheDrive", `加载缓存元数据失败: ${error.message}`, error);
            CacheDrive._cacheMetadata = {
                system: {},
                programs: {}
            };
        }
    }
    
    /**
     * 保存缓存元数据
     * @returns {Promise<void>}
     */
    static async _saveCacheMetadata() {
        if (!CacheDrive._initialized && !CacheDrive._initializing) {
            KernelLogger.warn("CacheDrive", "未初始化，无法保存");
            throw new Error("CacheDrive 未初始化");
        }
        
        try {
            // 数据完整性检查：防止保存空数据或无效数据
            if (!CacheDrive._cacheMetadata || typeof CacheDrive._cacheMetadata !== 'object') {
                KernelLogger.error("CacheDrive", "缓存元数据无效或为空，拒绝保存以防止数据丢失");
                throw new Error("缓存元数据无效或为空，无法保存");
            }
            
            // 确保 system 和 programs 存在
            if (!CacheDrive._cacheMetadata.system || typeof CacheDrive._cacheMetadata.system !== 'object') {
                KernelLogger.warn("CacheDrive", "system 数据无效，使用空对象");
                CacheDrive._cacheMetadata.system = {};
            }
            if (!CacheDrive._cacheMetadata.programs || typeof CacheDrive._cacheMetadata.programs !== 'object') {
                KernelLogger.warn("CacheDrive", "programs 数据无效，使用空对象");
                CacheDrive._cacheMetadata.programs = {};
            }
            
            const path = CacheDrive.CACHE_METADATA_FILE.substring(0, CacheDrive.CACHE_METADATA_FILE.lastIndexOf('/') + 1);
            const fileName = CacheDrive.CACHE_METADATA_FILE.substring(CacheDrive.CACHE_METADATA_FILE.lastIndexOf('/') + 1);
            
            const content = JSON.stringify(CacheDrive._cacheMetadata, null, 2);
            KernelLogger.debug("CacheDrive", `准备保存缓存元数据: ${path}/${fileName}, JSON 大小: ${content.length} 字节`);
            
            await CacheDrive._writeFileToPHP(path, fileName, content);
            
            // 更新请求缓存
            CacheDrive._requestCache.metadata = CacheDrive._cacheMetadata;
            CacheDrive._requestCache.timestamp = Date.now();
            
            KernelLogger.debug("CacheDrive", "缓存元数据已保存");
        } catch (error) {
            KernelLogger.error("CacheDrive", `保存缓存元数据失败: ${error.message}`, error);
            throw error;
        }
    }
    
    /**
     * 估算值的大小（字节）
     * @param {any} value 值
     * @returns {number} 估算大小（字节）
     */
    static _estimateSize(value) {
        try {
            const jsonString = JSON.stringify(value);
            return new Blob([jsonString]).size;
        } catch (error) {
            // 如果无法序列化，返回一个估算值
            return 1024; // 默认 1KB
        }
    }
    
    /**
     * 检查缓存是否过期
     * @param {Object} cacheEntry 缓存条目
     * @returns {boolean} 是否过期
     */
    static _isExpired(cacheEntry) {
        if (!cacheEntry || !cacheEntry.expiresAt) {
            return false; // 没有过期时间，永不过期
        }
        
        if (cacheEntry.expiresAt === 0) {
            return false; // 0 表示永不过期
        }
        
        return Date.now() > cacheEntry.expiresAt;
    }
    
    /**
     * 清理缓存目录中的孤立文件（元数据文件不存在时的清理）
     * @returns {Promise<void>}
     */
    static async _cleanOrphanedCacheFiles() {
        try {
            // 检查缓存目录是否存在
            const dirExists = await CacheDrive._checkDirectoryExists(CacheDrive.CACHE_DIR);
            if (!dirExists) {
                KernelLogger.debug("CacheDrive", "缓存目录不存在，跳过清理孤立文件");
                return;
            }
            
            // 使用 FileSystem API 列出缓存目录中的文件
            if (typeof ProcessManager === 'undefined') {
                KernelLogger.debug("CacheDrive", "ProcessManager 不可用，跳过清理孤立文件");
                return;
            }
            
            try {
                const pid = ProcessManager.EXPLOIT_PID || 10000;
                const listResult = await ProcessManager.callKernelAPI(pid, 'FileSystem.list', [CacheDrive.CACHE_DIR]);
                
                if (!listResult || !Array.isArray(listResult)) {
                    KernelLogger.debug("CacheDrive", "无法列出缓存目录文件，跳过清理");
                    return;
                }
                
                let cleanedCount = 0;
                
                for (const fileInfo of listResult) {
                    if (!fileInfo || fileInfo.type !== 'file') {
                        continue;
                    }
                    
                    const fileName = fileInfo.name;
                    const filePath = `${CacheDrive.CACHE_DIR}${fileName}`;
                    
                    // 跳过元数据文件本身
                    if (fileName === 'LocalCache.json' || fileName.startsWith('LocalCache_')) {
                        continue;
                    }
                    
                    // 如果元数据文件不存在，说明所有缓存文件都是孤立的，可以全部清理
                    try {
                        KernelLogger.debug("CacheDrive", `清理孤立缓存文件: ${fileName}`);
                        await ProcessManager.callKernelAPI(pid, 'FileSystem.delete', [filePath]);
                        cleanedCount++;
                    } catch (deleteError) {
                        KernelLogger.debug("CacheDrive", `删除孤立文件失败: ${fileName}, 错误: ${deleteError.message}`);
                    }
                }
                
                if (cleanedCount > 0) {
                    KernelLogger.info("CacheDrive", `已清理 ${cleanedCount} 个孤立缓存文件（元数据文件不存在）`);
                } else {
                    KernelLogger.debug("CacheDrive", "未发现需要清理的孤立缓存文件");
                }
            } catch (listError) {
                KernelLogger.debug("CacheDrive", `列出缓存目录文件失败: ${listError.message}`);
            }
        } catch (error) {
            KernelLogger.warn("CacheDrive", `清理孤立缓存文件失败: ${error.message}`);
            // 不抛出错误，允许继续执行
        }
    }
    
    /**
     * 清理过期缓存
     * @returns {Promise<void>}
     */
    static async _cleanExpiredCache() {
        if (!CacheDrive._cacheMetadata || typeof CacheDrive._cacheMetadata !== 'object') {
            return;
        }
        
        // 确保数据结构正确
        if (!CacheDrive._cacheMetadata.system) {
            CacheDrive._cacheMetadata.system = {};
        }
        if (!CacheDrive._cacheMetadata.programs) {
            CacheDrive._cacheMetadata.programs = {};
        }
        
        let cleanedCount = 0;
        
        // 清理系统缓存
        if (CacheDrive._cacheMetadata.system) {
            for (const key in CacheDrive._cacheMetadata.system) {
                const entry = CacheDrive._cacheMetadata.system[key];
                if (entry && typeof entry === 'object' && CacheDrive._isExpired(entry)) {
                    delete CacheDrive._cacheMetadata.system[key];
                    cleanedCount++;
                }
            }
        }
        
        // 清理程序缓存
        if (CacheDrive._cacheMetadata.programs) {
            for (const programName in CacheDrive._cacheMetadata.programs) {
                const programCache = CacheDrive._cacheMetadata.programs[programName];
                if (programCache && typeof programCache === 'object') {
                    for (const key in programCache) {
                        const entry = programCache[key];
                        if (entry && typeof entry === 'object' && CacheDrive._isExpired(entry)) {
                            delete programCache[key];
                            cleanedCount++;
                        }
                    }
                    
                    // 如果程序缓存为空，删除程序缓存对象
                    if (Object.keys(programCache).length === 0) {
                        delete CacheDrive._cacheMetadata.programs[programName];
                    }
                }
            }
        }
        
        if (cleanedCount > 0) {
            KernelLogger.debug("CacheDrive", `已清理 ${cleanedCount} 个过期缓存条目`);
            try {
                await CacheDrive._saveCacheMetadata();
            } catch (error) {
                KernelLogger.warn("CacheDrive", `清理过期缓存后保存失败: ${error.message}`);
                // 不抛出错误，允许继续执行
            }
        }
    }
    
    /**
     * 设置缓存值
     * @param {string} key 缓存键
     * @param {any} value 缓存值
     * @param {Object} options 选项
     * @param {number} options.ttl 生存时间（毫秒），0 表示永不过期，默认 0
     * @param {number} options.pid 程序 PID（可选，会自动转换为程序名称）
     * @param {string} options.programName 程序名称（可选，优先级高于 pid）
     * @returns {Promise<void>}
     */
    static async set(key, value, options = {}) {
        await CacheDrive._ensureInitialized();
        
        if (!key || typeof key !== 'string') {
            throw new Error('缓存键必须是字符串');
        }
        
        // 确保 _cacheMetadata 已初始化
        if (!CacheDrive._cacheMetadata) {
            await CacheDrive._loadCacheMetadata(true);
        }
        
        // 再次检查（防止加载失败）
        if (!CacheDrive._cacheMetadata || typeof CacheDrive._cacheMetadata !== 'object') {
            CacheDrive._cacheMetadata = {
                system: {},
                programs: {}
            };
        }
        
        const { ttl = 0, pid = null, programName = null } = options;
        
        // 确定程序名称：优先使用 programName，如果没有则从 pid 获取
        let finalProgramName = null;
        if (programName && typeof programName === 'string') {
            finalProgramName = programName;
        } else if (pid !== null && typeof pid === 'number') {
            finalProgramName = CacheDrive._getProgramNameFromPid(pid);
            if (!finalProgramName) {
                KernelLogger.warn("CacheDrive", `无法从 PID ${pid} 获取程序名称，将使用系统缓存`);
            }
        }
        
        const now = Date.now();
        const expiresAt = ttl > 0 ? now + ttl : 0;
        const size = CacheDrive._estimateSize(value);
        
        const cacheEntry = {
            value,
            expiresAt,
            createdAt: now,
            updatedAt: now,
            size
        };
        
        // 重新加载元数据（确保使用最新数据）
        await CacheDrive._loadCacheMetadata(true);
        
        // 确保数据结构正确
        if (!CacheDrive._cacheMetadata.system) {
            CacheDrive._cacheMetadata.system = {};
        }
        if (!CacheDrive._cacheMetadata.programs) {
            CacheDrive._cacheMetadata.programs = {};
        }
        
        if (finalProgramName) {
            // 程序缓存
            if (!CacheDrive._cacheMetadata.programs[finalProgramName]) {
                CacheDrive._cacheMetadata.programs[finalProgramName] = {};
            }
            CacheDrive._cacheMetadata.programs[finalProgramName][key] = cacheEntry;
        } else {
            // 系统缓存
            CacheDrive._cacheMetadata.system[key] = cacheEntry;
        }
        
        await CacheDrive._saveCacheMetadata();
        KernelLogger.debug("CacheDrive", `缓存已设置: ${key}${finalProgramName ? ` (程序: ${finalProgramName})` : ' (系统)'}`);
    }
    
    /**
     * 获取缓存值
     * @param {string} key 缓存键
     * @param {any} defaultValue 默认值（如果缓存不存在或已过期）
     * @param {Object} options 选项
     * @param {number} options.pid 程序 PID（可选，会自动转换为程序名称）
     * @param {string} options.programName 程序名称（可选，优先级高于 pid）
     * @returns {Promise<any>} 缓存值或默认值
     */
    static async get(key, defaultValue = null, options = {}) {
        await CacheDrive._ensureInitialized();
        
        if (!key || typeof key !== 'string') {
            throw new Error('缓存键必须是字符串');
        }
        
        // 确保 _cacheMetadata 已初始化
        if (!CacheDrive._cacheMetadata) {
            await CacheDrive._loadCacheMetadata(true);
        }
        
        // 再次检查（防止加载失败）
        if (!CacheDrive._cacheMetadata || typeof CacheDrive._cacheMetadata !== 'object') {
            KernelLogger.debug("CacheDrive", `缓存元数据未初始化，返回默认值: ${key}`);
            return defaultValue;
        }
        
        const { pid = null, programName = null } = options;
        
        // 确定程序名称：优先使用 programName，如果没有则从 pid 获取
        let finalProgramName = null;
        if (programName && typeof programName === 'string') {
            finalProgramName = programName;
        } else if (pid !== null && typeof pid === 'number') {
            finalProgramName = CacheDrive._getProgramNameFromPid(pid);
        }
        
        // 重新加载元数据（确保使用最新数据）
        await CacheDrive._loadCacheMetadata(true);
        
        // 确保数据结构正确
        if (!CacheDrive._cacheMetadata.system) {
            CacheDrive._cacheMetadata.system = {};
        }
        if (!CacheDrive._cacheMetadata.programs) {
            CacheDrive._cacheMetadata.programs = {};
        }
        
        let cacheEntry = null;
        
        if (finalProgramName) {
            // 程序缓存
            if (CacheDrive._cacheMetadata.programs[finalProgramName] && 
                CacheDrive._cacheMetadata.programs[finalProgramName][key]) {
                cacheEntry = CacheDrive._cacheMetadata.programs[finalProgramName][key];
            }
        } else {
            // 系统缓存
            if (CacheDrive._cacheMetadata.system && CacheDrive._cacheMetadata.system[key]) {
                cacheEntry = CacheDrive._cacheMetadata.system[key];
            }
        }
        
        if (!cacheEntry) {
            KernelLogger.debug("CacheDrive", `缓存不存在: ${key}${finalProgramName ? ` (程序: ${finalProgramName})` : ' (系统)'}`);
            return defaultValue;
        }
        
        // 检查是否过期
        if (CacheDrive._isExpired(cacheEntry)) {
            KernelLogger.debug("CacheDrive", `缓存已过期: ${key}${finalProgramName ? ` (程序: ${finalProgramName})` : ' (系统)'}`);
            // 删除过期缓存
            if (finalProgramName) {
                if (CacheDrive._cacheMetadata.programs[finalProgramName]) {
                    delete CacheDrive._cacheMetadata.programs[finalProgramName][key];
                }
            } else {
                if (CacheDrive._cacheMetadata.system) {
                    delete CacheDrive._cacheMetadata.system[key];
                }
            }
            await CacheDrive._saveCacheMetadata();
            return defaultValue;
        }
        
        return cacheEntry.value;
    }
    
    /**
     * 检查缓存是否存在且未过期
     * @param {string} key 缓存键
     * @param {Object} options 选项
     * @param {number} options.pid 程序 PID（可选，会自动转换为程序名称）
     * @param {string} options.programName 程序名称（可选，优先级高于 pid）
     * @returns {Promise<boolean>} 是否存在且未过期
     */
    static async has(key, options = {}) {
        await CacheDrive._ensureInitialized();
        
        if (!key || typeof key !== 'string') {
            return false;
        }
        
        // 确保 _cacheMetadata 已初始化
        if (!CacheDrive._cacheMetadata) {
            await CacheDrive._loadCacheMetadata(true);
        }
        
        // 再次检查（防止加载失败）
        if (!CacheDrive._cacheMetadata || typeof CacheDrive._cacheMetadata !== 'object') {
            return false;
        }
        
        const { pid = null, programName = null } = options;
        
        // 确定程序名称：优先使用 programName，如果没有则从 pid 获取
        let finalProgramName = null;
        if (programName && typeof programName === 'string') {
            finalProgramName = programName;
        } else if (pid !== null && typeof pid === 'number') {
            finalProgramName = CacheDrive._getProgramNameFromPid(pid);
        }
        
        // 重新加载元数据
        await CacheDrive._loadCacheMetadata(true);
        
        // 确保数据结构正确
        if (!CacheDrive._cacheMetadata.system) {
            CacheDrive._cacheMetadata.system = {};
        }
        if (!CacheDrive._cacheMetadata.programs) {
            CacheDrive._cacheMetadata.programs = {};
        }
        
        let cacheEntry = null;
        
        if (finalProgramName) {
            if (CacheDrive._cacheMetadata.programs[finalProgramName] && 
                CacheDrive._cacheMetadata.programs[finalProgramName][key]) {
                cacheEntry = CacheDrive._cacheMetadata.programs[finalProgramName][key];
            }
        } else {
            if (CacheDrive._cacheMetadata.system && CacheDrive._cacheMetadata.system[key]) {
                cacheEntry = CacheDrive._cacheMetadata.system[key];
            }
        }
        
        if (!cacheEntry) {
            return false;
        }
        
        // 检查是否过期
        if (CacheDrive._isExpired(cacheEntry)) {
            // 删除过期缓存
            if (finalProgramName) {
                if (CacheDrive._cacheMetadata.programs[finalProgramName]) {
                    delete CacheDrive._cacheMetadata.programs[finalProgramName][key];
                }
            } else {
                if (CacheDrive._cacheMetadata.system) {
                    delete CacheDrive._cacheMetadata.system[key];
                }
            }
            await CacheDrive._saveCacheMetadata();
            return false;
        }
        
        return true;
    }
    
    /**
     * 删除缓存
     * @param {string} key 缓存键
     * @param {Object} options 选项
     * @param {number} options.pid 程序 PID（可选，会自动转换为程序名称）
     * @param {string} options.programName 程序名称（可选，优先级高于 pid）
     * @returns {Promise<boolean>} 是否成功删除
     */
    static async delete(key, options = {}) {
        await CacheDrive._ensureInitialized();
        
        if (!key || typeof key !== 'string') {
            return false;
        }
        
        // 确保 _cacheMetadata 已初始化
        if (!CacheDrive._cacheMetadata) {
            await CacheDrive._loadCacheMetadata(true);
        }
        
        // 再次检查（防止加载失败）
        if (!CacheDrive._cacheMetadata || typeof CacheDrive._cacheMetadata !== 'object') {
            return false;
        }
        
        const { pid = null, programName = null } = options;
        
        // 确定程序名称：优先使用 programName，如果没有则从 pid 获取
        let finalProgramName = null;
        if (programName && typeof programName === 'string') {
            finalProgramName = programName;
        } else if (pid !== null && typeof pid === 'number') {
            finalProgramName = CacheDrive._getProgramNameFromPid(pid);
        }
        
        // 重新加载元数据
        await CacheDrive._loadCacheMetadata(true);
        
        // 确保数据结构正确
        if (!CacheDrive._cacheMetadata.system) {
            CacheDrive._cacheMetadata.system = {};
        }
        if (!CacheDrive._cacheMetadata.programs) {
            CacheDrive._cacheMetadata.programs = {};
        }
        
        let deleted = false;
        
        if (finalProgramName) {
            if (CacheDrive._cacheMetadata.programs[finalProgramName] && 
                CacheDrive._cacheMetadata.programs[finalProgramName][key]) {
                delete CacheDrive._cacheMetadata.programs[finalProgramName][key];
                deleted = true;
                
                // 如果程序缓存为空，删除程序缓存对象
                if (Object.keys(CacheDrive._cacheMetadata.programs[finalProgramName]).length === 0) {
                    delete CacheDrive._cacheMetadata.programs[finalProgramName];
                }
            }
        } else {
            if (CacheDrive._cacheMetadata.system && CacheDrive._cacheMetadata.system[key]) {
                delete CacheDrive._cacheMetadata.system[key];
                deleted = true;
            }
        }
        
        if (deleted) {
            await CacheDrive._saveCacheMetadata();
            KernelLogger.debug("CacheDrive", `缓存已删除: ${key}${finalProgramName ? ` (程序: ${finalProgramName})` : ' (系统)'}`);
        }
        
        return deleted;
    }
    
    /**
     * 清空缓存
     * @param {Object} options 选项
     * @param {number} options.pid 程序 PID（可选，会自动转换为程序名称）
     * @param {string} options.programName 程序名称（可选，优先级高于 pid）
     * @param {boolean} options.expiredOnly 是否只清空过期缓存，默认 false
     * @returns {Promise<number>} 清空的缓存数量
     */
    static async clear(options = {}) {
        await CacheDrive._ensureInitialized();
        
        // 确保 _cacheMetadata 已初始化
        if (!CacheDrive._cacheMetadata) {
            await CacheDrive._loadCacheMetadata(true);
        }
        
        // 再次检查（防止加载失败）
        if (!CacheDrive._cacheMetadata || typeof CacheDrive._cacheMetadata !== 'object') {
            return 0;
        }
        
        const { pid = null, programName = null, expiredOnly = false } = options;
        
        // 确定程序名称：优先使用 programName，如果没有则从 pid 获取
        let finalProgramName = null;
        if (programName && typeof programName === 'string') {
            finalProgramName = programName;
        } else if (pid !== null && typeof pid === 'number') {
            finalProgramName = CacheDrive._getProgramNameFromPid(pid);
        }
        
        // 重新加载元数据
        await CacheDrive._loadCacheMetadata(true);
        
        // 确保数据结构正确
        if (!CacheDrive._cacheMetadata.system) {
            CacheDrive._cacheMetadata.system = {};
        }
        if (!CacheDrive._cacheMetadata.programs) {
            CacheDrive._cacheMetadata.programs = {};
        }
        
        let clearedCount = 0;
        
        if (finalProgramName) {
            // 清空程序缓存
            if (CacheDrive._cacheMetadata.programs[finalProgramName]) {
                if (expiredOnly) {
                    for (const key in CacheDrive._cacheMetadata.programs[finalProgramName]) {
                        if (CacheDrive._isExpired(CacheDrive._cacheMetadata.programs[finalProgramName][key])) {
                            delete CacheDrive._cacheMetadata.programs[finalProgramName][key];
                            clearedCount++;
                        }
                    }
                } else {
                    clearedCount = Object.keys(CacheDrive._cacheMetadata.programs[finalProgramName]).length;
                    delete CacheDrive._cacheMetadata.programs[finalProgramName];
                }
            }
        } else {
            // 清空系统缓存
            if (expiredOnly) {
                if (CacheDrive._cacheMetadata.system) {
                    for (const key in CacheDrive._cacheMetadata.system) {
                        if (CacheDrive._isExpired(CacheDrive._cacheMetadata.system[key])) {
                            delete CacheDrive._cacheMetadata.system[key];
                            clearedCount++;
                        }
                    }
                }
            } else {
                if (CacheDrive._cacheMetadata.system) {
                    clearedCount = Object.keys(CacheDrive._cacheMetadata.system).length;
                    CacheDrive._cacheMetadata.system = {};
                }
            }
        }
        
        if (clearedCount > 0) {
            await CacheDrive._saveCacheMetadata();
            KernelLogger.info("CacheDrive", `已清空 ${clearedCount} 个缓存${expiredOnly ? '（仅过期）' : ''}${finalProgramName ? ` (程序: ${finalProgramName})` : ' (系统)'}`);
        }
        
        return clearedCount;
    }
    
    /**
     * 获取缓存统计信息
     * @param {Object} options 选项
     * @param {number} options.pid 程序 PID（可选）
     * @returns {Promise<Object>} 统计信息
     */
    static async getStats(options = {}) {
        await CacheDrive._ensureInitialized();
        
        // 确保 _cacheMetadata 已初始化
        if (!CacheDrive._cacheMetadata) {
            await CacheDrive._loadCacheMetadata(true);
        }
        
        // 再次检查（防止加载失败）
        if (!CacheDrive._cacheMetadata || typeof CacheDrive._cacheMetadata !== 'object') {
            return {
                totalCount: 0,
                totalSize: 0,
                expiredCount: 0,
                expiredSize: 0,
                validCount: 0,
                validSize: 0
            };
        }
        
        const { pid = null } = options;
        
        // 重新加载元数据
        await CacheDrive._loadCacheMetadata(true);
        
        // 清理过期缓存
        await CacheDrive._cleanExpiredCache();
        
        // 确保数据结构正确
        if (!CacheDrive._cacheMetadata.system) {
            CacheDrive._cacheMetadata.system = {};
        }
        if (!CacheDrive._cacheMetadata.programs) {
            CacheDrive._cacheMetadata.programs = {};
        }
        
        let totalCount = 0;
        let totalSize = 0;
        let expiredCount = 0;
        let expiredSize = 0;
        
        if (finalProgramName) {
            // 程序缓存统计
            if (CacheDrive._cacheMetadata.programs[finalProgramName]) {
                for (const key in CacheDrive._cacheMetadata.programs[finalProgramName]) {
                    const entry = CacheDrive._cacheMetadata.programs[finalProgramName][key];
                    if (entry && typeof entry === 'object') {
                        totalCount++;
                        totalSize += entry.size || 0;
                        
                        if (CacheDrive._isExpired(entry)) {
                            expiredCount++;
                            expiredSize += entry.size || 0;
                        }
                    }
                }
            }
        } else {
            // 系统缓存统计
            if (CacheDrive._cacheMetadata.system) {
                for (const key in CacheDrive._cacheMetadata.system) {
                    const entry = CacheDrive._cacheMetadata.system[key];
                    if (entry && typeof entry === 'object') {
                        totalCount++;
                        totalSize += entry.size || 0;
                        
                        if (CacheDrive._isExpired(entry)) {
                            expiredCount++;
                            expiredSize += entry.size || 0;
                        }
                    }
                }
            }
        }
        
        return {
            totalCount,
            totalSize,
            expiredCount,
            expiredSize,
            validCount: totalCount - expiredCount,
            validSize: totalSize - expiredSize
        };
    }
    
    /**
     * 确保已初始化
     * @returns {Promise<void>}
     */
    static async _ensureInitialized() {
        if (!CacheDrive._initialized) {
            await CacheDrive.init();
        }
    }
}

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "CacheDrive", CacheDrive);
    } catch (e) {
        // 忽略错误
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/drive/cacheDrive.js");
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.CacheDrive = CacheDrive;
} else if (typeof globalThis !== 'undefined') {
    globalThis.CacheDrive = CacheDrive;
}