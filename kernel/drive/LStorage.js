// 本地存储管理器
// 负责本地数据的管理、注册等操作
// 所有系统依赖的本地数据和程序的本地数据都存储在 D:/LocalSData.json 文件中
// 通过 PHP 服务 (FSDirve.php) 进行文件读写操作

KernelLogger.info("LStorage", "模块初始化");

class LStorage {
    // 存储文件路径
    static STORAGE_FILE_PATH = "D:/";
    static STORAGE_FILE_NAME = "LocalSData.json";
    
    // PHP 服务地址
    static PHP_SERVICE_URL = "/service/FSDirve.php";
    
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
            const url = new URL(LStorage.PHP_SERVICE_URL, window.location.origin);
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
            const url = new URL(LStorage.PHP_SERVICE_URL, window.location.origin);
            url.searchParams.set('action', 'write_file');
            url.searchParams.set('path', path);
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
            const url = new URL(LStorage.PHP_SERVICE_URL, window.location.origin);
            url.searchParams.set('action', 'exists');
            url.searchParams.set('path', `${path}/${fileName}`);
            
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
            const url = new URL(LStorage.PHP_SERVICE_URL, window.location.origin);
            url.searchParams.set('action', 'create_file');
            url.searchParams.set('path', path);
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
            const filePath = LStorage.STORAGE_FILE_PATH;
            const fileName = LStorage.STORAGE_FILE_NAME;
            
            // 将数据转换为 JSON 字符串
            const jsonString = JSON.stringify(LStorage._storageData, null, 2);
            KernelLogger.debug("LStorage", `准备保存存储数据: ${filePath}/${fileName}, JSON 大小: ${jsonString.length} 字节`);
            
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
            
            if (!fileExists) {
                // 文件不存在，创建文件
                KernelLogger.info("LStorage", `创建存储文件: ${filePath}/${fileName}`);
                await LStorage._createFileInPHP(filePath, fileName, jsonString);
            } else {
                // 文件存在，写入文件（覆盖模式）
                await LStorage._writeFileToPHP(filePath, fileName, jsonString, 'overwrite');
            }
            
            // 验证保存是否真的成功（读取文件验证）
            try {
                KernelLogger.debug("LStorage", `验证文件是否保存成功: ${filePath}/${fileName}`);
                const savedContent = await LStorage._readFileFromPHP(filePath, fileName);
                if (savedContent) {
                    const savedData = JSON.parse(savedContent);
                    const savedSystemKeys = Object.keys(savedData.system || {});
                    KernelLogger.info("LStorage", `文件保存验证成功: 系统键数量=${savedSystemKeys.length}`);
                    
                    // 特别验证 desktop.icons
                    if (savedData.system && savedData.system['desktop.icons']) {
                        const savedIcons = savedData.system['desktop.icons'];
                        const savedIconCount = Array.isArray(savedIcons) ? savedIcons.length : 0;
                        KernelLogger.info("LStorage", `桌面图标保存验证成功: ${savedIconCount} 个图标已确认保存到文件`);
                    } else {
                        KernelLogger.warn("LStorage", "桌面图标保存验证失败: 文件中没有 desktop.icons 数据");
                    }
                } else {
                    KernelLogger.warn("LStorage", "文件保存验证失败: 无法读取保存的文件");
                }
            } catch (verifyError) {
                KernelLogger.warn("LStorage", `文件保存验证失败: ${verifyError.message}`, verifyError);
            }
            
            // 更新缓存
            LStorage._requestCache.readCache = LStorage._storageData;
            LStorage._requestCache.readCacheTime = Date.now();
            
            // 记录保存的数据摘要（用于调试）
            const systemKeys = Object.keys(LStorage._storageData.system || {});
            const savedDataSize = jsonString.length;
            KernelLogger.info("LStorage", `存储数据保存成功 (大小: ${savedDataSize} 字节, 系统键: ${systemKeys.length})`);
            if (systemKeys.length > 0) {
                KernelLogger.debug("LStorage", `保存的系统存储键: ${systemKeys.join(', ')}`);
            }
            if (systemKeys.includes('desktop.icons')) {
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
        
        try {
            return LStorage._storageData.system[key] ?? null;
        } catch (error) {
            KernelLogger.error("LStorage", `读取系统存储失败: ${error.message}`, error);
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
        
        KernelLogger.info("LStorage", `写入系统存储: Key=${key}, Value类型=${typeof value}, 是否为数组=${Array.isArray(value)}`);
        if (Array.isArray(value)) {
            KernelLogger.debug("LStorage", `数组长度: ${value.length}`);
        }
        
        try {
            // 先更新内存中的数据
            LStorage._storageData.system[key] = value;
            KernelLogger.debug("LStorage", `内存数据已更新: Key=${key}`);
            
            // 尝试保存到文件系统
            try {
                await LStorage._saveStorageData();
                KernelLogger.info("LStorage", `系统存储写入成功: Key=${key}`);
                
                // 验证保存是否真的成功（读取文件验证）
                try {
                    const savedValue = LStorage._storageData.system[key];
                    if (savedValue === undefined || savedValue === null) {
                        KernelLogger.warn("LStorage", `保存后验证失败: Key=${key} 在内存中不存在`);
                        return false;
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
    static getAllSystemStorage() {
        if (!LStorage._initialized) {
            return {};
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
