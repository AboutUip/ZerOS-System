KernelLogger.info("NodeTree", "module init");

// 辅助函数：从 POOL 或全局对象获取 FileType
function getFileType() {
    // 优先从 POOL 获取
    if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
        try {
            const fileType = POOL.__GET__("TYPE_POOL", "FileType");
            if (fileType !== undefined && fileType !== null) {
                const poolCategory = POOL.__GET__("TYPE_POOL");
                if (poolCategory && (typeof poolCategory !== 'object' || poolCategory.isInit !== false)) {
                    return fileType;
                }
            }
        } catch (e) {
            // 忽略错误，继续尝试全局对象
        }
    }
    
    // 降级到全局对象
    if (typeof FileType !== 'undefined') {
        return FileType;
    }
    
    return null;
}

// 文件树节点类(目录)
class Node {
    // 序列化路径(按/分隔)
    path() {
        if (this.parent === null) {
            return this.name;
        } else {
            return this.parent + "/" + this.name;
        }
    }

    // 构造函数
    constructor(name, parent) {
        KernelLogger.debug("Node", `init ${name}`);
        if (parent.parent === null) {
            // 节点名(单纯的目录名)
            this.parent = null;
            // 节点名(单纯的目录名)
            this.name = parent.name;
        } else {
            // 父节点(路径)
            this.parent = parent.parent;
            // 节点名(单纯的目录名)
            this.name = name;
        }
        // 子节点列表
        this.children = new Map();
        // 文件列表
        this.attributes = {};
        // 目录元数据（包含目录属性）
        this.__meta = this.__meta || {};
        // 目录属性（默认为正常，使用位标志）
        let FileTypeRef = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                FileTypeRef = POOL.__GET__("TYPE_POOL", "FileType");
            } catch (e) {}
        }
        if (!FileTypeRef && typeof FileType !== 'undefined') {
            FileTypeRef = FileType;
        }
        if (FileTypeRef && FileTypeRef.DIR_ATTRIBUTES) {
            this.__meta.dirAttributes = FileTypeRef.DIR_ATTRIBUTES.NORMAL;
        } else {
            this.__meta.dirAttributes = 0; // 降级：使用 0 表示正常
        }
        // 日志
        KernelLogger.debug("Node", `init complete ${name}`);
    }

    // 文件操作
    // optFile 支持四个参数：type, file, newContent, writeMod
    // writeMod 会被透传到底层文件对象的 writeFile 方法（如果实现支持）
    optFile(type, file, newContent, writeMod) {
        const fname = file && file.fileName ? file.fileName : String(file);
        KernelLogger.debug(
            "Node",
            `file op ${this.name} ${fname} type=${type} writeMod=${String(writeMod)}`
        );
        const FileTypeRef = getFileType();
        if (!FileTypeRef) {
            KernelLogger.error("Node", `FileType not available for file operation ${fname}`);
            return null;
        }
        
        switch (type) {
            case FileTypeRef.FILE_OPS.CREATE:
                KernelLogger.info("Node", `create file ${this.name}/${fname}`);
                // 确保文件对象包含创建时间
                try {
                    if (file && !file.fileCreatTime)
                        file.fileCreatTime = new Date().getTime();
                    if (file && !file.fileModifyTime)
                        file.fileModifyTime = file.fileCreatTime;
                } catch (e) {}
                this.attributes[fname] = file;
                // 更新当前目录的修改时间
                try {
                    this.__meta = this.__meta || {};
                    this.__meta.mtime = new Date().getTime();
                } catch (e) {}
                KernelLogger.info("Node", `created file ${this.name}/${fname}`);
                break;
            case FileTypeRef.FILE_OPS.DELETE:
                KernelLogger.info("Node", `delete file ${this.name}/${fname}`);
                // 检查文件属性：如果文件设置了 NO_DELETE 或 READ_ONLY 标志，则拒绝删除
                if (file && FileTypeRef.FILE_ATTRIBUTES && file.fileAttributes !== undefined) {
                    const attrs = FileTypeRef.FILE_ATTRIBUTES;
                    // 检查 NO_DELETE 标志位（位 4）或 READ_ONLY 标志位（位 1）
                    if ((file.fileAttributes & attrs.NO_DELETE) !== 0 || 
                        (file.fileAttributes & attrs.READ_ONLY) !== 0) {
                        KernelLogger.warn("Node", `删除被拒绝: 文件 ${this.name}/${fname} 不可删除 (属性: ${file.fileAttributes})`);
                        throw new Error(`文件 ${fname} 不可删除`);
                    }
                }
                delete this.attributes[fname];
                try {
                    this.__meta = this.__meta || {};
                    this.__meta.mtime = new Date().getTime();
                } catch (e) {}
                KernelLogger.info("Node", `deleted file ${this.name}/${fname}`);
                break;
            case FileTypeRef.FILE_OPS.READ:
                KernelLogger.info("Node", `read file ${this.name}/${fname}`);
                if (!file || typeof file.readFile !== "function") {
                    KernelLogger.error("Node", `read failed ${this.name}/${fname} no readFile`);
                    return null;
                }
                // 检查文件属性：如果文件设置了 NO_READ 标志，则拒绝读取
                if (FileTypeRef.FILE_ATTRIBUTES && file.fileAttributes !== undefined) {
                    const attrs = FileTypeRef.FILE_ATTRIBUTES;
                    // 检查 NO_READ 标志位（位 2）
                    if ((file.fileAttributes & attrs.NO_READ) !== 0) {
                        KernelLogger.warn("Node", `读取被拒绝: 文件 ${this.name}/${fname} 不可读 (属性: ${file.fileAttributes})`);
                        throw new Error(`文件 ${fname} 不可读`);
                    }
                }
                const content = file.readFile();
                KernelLogger.info("Node", `read complete ${this.name}/${fname}`, { length: String(content ? content.length : 0) });
                return content;
            case FileTypeRef.FILE_OPS.WRITE:
                KernelLogger.info("Node", `write file ${this.name}/${fname} writeMod=${String(writeMod)}`);
                if (!file) {
                    KernelLogger.error("Node", `write failed no target ${this.name}/${fname}`);
                    break;
                }
                // 检查文件属性：如果文件设置了 READ_ONLY 标志，则拒绝写入
                if (FileTypeRef.FILE_ATTRIBUTES && file.fileAttributes !== undefined) {
                    const attrs = FileTypeRef.FILE_ATTRIBUTES;
                    // 检查 READ_ONLY 标志位（位 1）
                    if ((file.fileAttributes & attrs.READ_ONLY) !== 0) {
                        KernelLogger.warn("Node", `写入被拒绝: 文件 ${this.name}/${fname} 为只读 (属性: ${file.fileAttributes})`);
                        throw new Error(`文件 ${fname} 为只读，无法修改`);
                    }
                }
                try {
                    if (typeof file.writeFile === "function") {
                        // 将写模式传入，file.writeFile 应按实现支持覆盖或追加
                        file.writeFile(newContent, writeMod);
                    } else {
                        // 降级处理：直接替换内容数组
                        file.fileContent = [];
                        for (const line of (newContent || "").split(/\n/))
                            file.fileContent.push(line);
                        file.fileSize = (newContent || "").length;
                    }
                    // 设置文件修改时间并更新目录 mtime
                    try {
                        file.fileModifyTime = new Date().getTime();
                        this.__meta = this.__meta || {};
                        this.__meta.mtime = new Date().getTime();
                    } catch (e) {}
                    KernelLogger.info("Node", `write complete ${this.name}/${fname}`);
                } catch (e) {
                    KernelLogger.error("Node", `write exception ${this.name}/${fname}`, String(e));
                    throw e; // 重新抛出异常，让调用者知道写入失败
                }
                break;
            case FileTypeRef.FILE_OPS.RENAME:
                // 重命名文件：更新attributes中的键
                const oldFileName = file.oldFileName || fname;
                const newFileName = file.newFileName;
                if (this.attributes[oldFileName]) {
                    const fileObj = this.attributes[oldFileName];
                    // 检查文件属性：如果文件设置了 NO_RENAME 或 NO_MOVE 标志，则拒绝重命名
                    if (FileTypeRef.FILE_ATTRIBUTES && fileObj.fileAttributes !== undefined) {
                        const attrs = FileTypeRef.FILE_ATTRIBUTES;
                        // 检查 NO_RENAME 标志位（位 16）或 NO_MOVE 标志位（位 8）
                        if ((fileObj.fileAttributes & attrs.NO_RENAME) !== 0 || 
                            (fileObj.fileAttributes & attrs.NO_MOVE) !== 0) {
                            KernelLogger.warn("Node", `重命名被拒绝: 文件 ${this.name}/${oldFileName} 不可重命名 (属性: ${fileObj.fileAttributes})`);
                            throw new Error(`文件 ${oldFileName} 不可重命名`);
                        }
                    }
                    delete this.attributes[oldFileName];
                    fileObj.fileName = newFileName;
                    this.attributes[newFileName] = fileObj;
                    // 更新目录修改时间
                    try {
                        this.__meta = this.__meta || {};
                        this.__meta.mtime = new Date().getTime();
                    } catch (e) {}
                    KernelLogger.info("Node", `renamed file ${this.name}/${oldFileName} to ${this.name}/${newFileName}`);
                }
                break;
        }
    }

    // 子节点操作
    optChild(type, node) {
        // 日志：记录本次对子节点的操作（便于调试）
        KernelLogger.debug("Node", `child op parent:${this.parent} target:${node.name} parent:${node.parent}`);
        let result = null;
        const FileTypeRef = getFileType();
        if (!FileTypeRef) {
            KernelLogger.error("Node", `FileType not available for directory operation ${node.name}`);
            return null;
        }
        
        switch (type) {
            case FileTypeRef.DIR_OPS.CREATE:
                // 存储子节点对象引用（而非仅存路径字符串），便于后续直接访问子节点属性/方法
                // 兼容处理：如果传入的是字符串路径，则保留原样，否则保存对象引用
                if (
                    node &&
                    typeof node === "object" &&
                    typeof node.path === "function"
                ) {
                    this.children.set(node.name, node);
                } else {
                    this.children.set(
                        node.name,
                        node.path ? node.path() : node
                    );
                }
                KernelLogger.info("Node", `added child ${this.name}/${node.name}`);
                // 转接操作
                KernelLogger.debug("Node", `handoff add ${this.name}/${node.name}`);
                result = {
                    operation: FileTypeRef.DIR_OPS.CREATE,
                    node: node,
                };
                break;
            case FileType.DIR_OPS.DELETE:
                // 检查目录属性：如果目录设置了 NO_DELETE 标志，则拒绝删除
                if (node && typeof node === "object" && node.__meta && node.__meta.dirAttributes !== undefined) {
                    const attrs = FileTypeRef.DIR_ATTRIBUTES || FileTypeRef.FILE_ATTRIBUTES;
                    if (attrs) {
                        // 检查 NO_DELETE 标志位（位 4）
                        if ((node.__meta.dirAttributes & attrs.NO_DELETE) !== 0) {
                            KernelLogger.warn("Node", `删除被拒绝: 目录 ${this.name}/${node.name} 不可删除 (属性: ${node.__meta.dirAttributes})`);
                            throw new Error(`目录 ${node.name} 不可删除`);
                        }
                    }
                }
                this.children.delete(node.name);
                KernelLogger.info("Node", `deleted child ${this.name}/${node.name}`);
                // 转接操作
                KernelLogger.debug("Node", `handoff delete ${this.name}/${node.name}`);
                result = {
                    operation: FileTypeRef.DIR_OPS.DELETE,
                    node: node,
                };
                break;
            case FileType.DIR_OPS.RENAME:
                // 重命名目录：更新children中的键
                const oldName = node.oldName || node.name;
                const newName = node.newName;
                if (this.children.has(oldName)) {
                    const childNode = this.children.get(oldName);
                    // 检查目录属性：如果目录设置了 NO_RENAME 或 NO_MOVE 标志，则拒绝重命名
                    if (childNode && typeof childNode === "object" && childNode.__meta && childNode.__meta.dirAttributes !== undefined) {
                        const attrs = FileTypeRef.DIR_ATTRIBUTES || FileTypeRef.FILE_ATTRIBUTES;
                        if (attrs) {
                            // 检查 NO_RENAME 标志位（位 16）或 NO_MOVE 标志位（位 8）
                            if ((childNode.__meta.dirAttributes & attrs.NO_RENAME) !== 0 || 
                                (childNode.__meta.dirAttributes & attrs.NO_MOVE) !== 0) {
                                KernelLogger.warn("Node", `重命名被拒绝: 目录 ${this.name}/${oldName} 不可重命名 (属性: ${childNode.__meta.dirAttributes})`);
                                throw new Error(`目录 ${oldName} 不可重命名`);
                            }
                        }
                    }
                    this.children.delete(oldName);
                    childNode.name = newName;
                    this.children.set(newName, childNode);
                    // 更新目录修改时间
                    try {
                        this.__meta = this.__meta || {};
                        this.__meta.mtime = new Date().getTime();
                    } catch (e) {}
                    KernelLogger.info("Node", `renamed child ${this.name}/${oldName} to ${this.name}/${newName}`);
                }
                result = {
                    operation: FileTypeRef.DIR_OPS.RENAME,
                    node: node,
                };
                break;
        }
        return result;
    }
}

// 文件树集合类
class NodeTreeCollection {
    // 构造函数
    constructor(separateName) {
        KernelLogger.info("NodeTree", `collection init ${separateName}`);
        // 确定初始化程度
        this.initialized = false;
        // 保存所有的Node节点
        this.nodes = new Map();
        // 盘符
        this.separateName = separateName;
        // Root节点
        this.nodes.set(
            separateName,
            new Node(separateName, {
                parent: null,
                name: separateName,
            })
        );
        KernelLogger.info("NodeTree", `collection init complete ${separateName}`);
        // 等待依赖项加载完成
        KernelLogger.info("NodeTree", `collection wait deps ${separateName}`);
        try {
            // 尝试获取 Dependency 实例
            // 优先从 POOL 中获取，如果不可用，则创建新实例
            let Dependency = null;
            
            // 首先尝试从 POOL 中获取
            if (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function') {
                try {
                    Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
                } catch (e) {
                    // POOL 可能还未初始化，忽略错误
                }
            }
            
            // 如果从 POOL 中获取失败，直接创建新实例（DependencyConfig 已在 HTML 中加载）
            if (!Dependency && typeof DependencyConfig !== 'undefined') {
                try {
                    Dependency = new DependencyConfig();
                } catch (e) {
                    // 创建实例失败，忽略错误
                }
            }
            
            if (Dependency && typeof Dependency.waitLoaded === 'function') {
                // 先检查 fileType 是否已经加载（通过 POOL 或全局对象）
                let fileTypeLoaded = false;
                if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    try {
                        const fileType = POOL.__GET__("TYPE_POOL", "FileType");
                        fileTypeLoaded = fileType !== undefined && fileType !== null && 
                                       (typeof fileType.GENRE !== 'undefined' || 
                                        typeof fileType.DIR_OPS !== 'undefined' ||
                                        typeof fileType.FILE_OPS !== 'undefined');
                    } catch (e) {
                        // 忽略错误
                    }
                }
                if (!fileTypeLoaded) {
                    fileTypeLoaded = typeof FileType !== 'undefined' && 
                                   (typeof FileType.GENRE !== 'undefined' || 
                                    typeof FileType.DIR_OPS !== 'undefined' ||
                                    typeof FileType.FILE_OPS !== 'undefined');
                }
                
                if (fileTypeLoaded) {
                    // 如果已加载，直接标记为已加载
                    if (!Dependency.dependencyMap.has("../kernel/typePool/fileType.js")) {
                        Dependency.dependencyMap.set("../kernel/typePool/fileType.js", DependencyConfig.generate("../kernel/typePool/fileType.js"));
                        Dependency.dependencyMap.get("../kernel/typePool/fileType.js").linked = true;
                    }
                    const entry = Dependency.dependencyMap.get("../kernel/typePool/fileType.js");
                    entry.inited = true;
                    entry.loaded = true;
                    KernelLogger.debug("NodeTree", `fileType 已加载，直接初始化 ${separateName}`);
                    this.initialized = true;
                    this._loadFromLocalStorage().catch(e => {
                        KernelLogger.warn("NodeTree", `加载文件系统数据失败: ${e.message}`);
                    });
                } else {
                    // 如果未加载，等待加载
                    Dependency.waitLoaded("../kernel/typePool/fileType.js", {
                        interval: 50,
                        timeout: 2000,
                    })
                    .then(() => {
                        this.initialized = true;
                        KernelLogger.info("NodeTree", `collection deps loaded ${separateName}`);
                        // 从 PHP 文件系统加载数据
                        this._loadFromLocalStorage().catch(e => {
                            KernelLogger.warn("NodeTree", `加载文件系统数据失败: ${e.message}`);
                        });
                    })
                    .catch((e) => {
                        KernelLogger.warn("NodeTree", `等待 fileType 超时，直接初始化 ${separateName}`, String(e));
                        // 即使失败也标记为已初始化，避免阻塞
                        this.initialized = true;
                        this._loadFromLocalStorage().catch(e => {
                            KernelLogger.warn("NodeTree", `加载文件系统数据失败: ${e.message}`);
                        });
                    });
                }
            } else {
                // 如果 Dependency 不可用，检查 fileType 是否已加载（通过 POOL 或全局对象）
                let fileTypeLoaded = false;
                if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    try {
                        const fileType = POOL.__GET__("TYPE_POOL", "FileType");
                        fileTypeLoaded = fileType !== undefined && fileType !== null && 
                                       (typeof fileType.GENRE !== 'undefined' || 
                                        typeof fileType.DIR_OPS !== 'undefined' ||
                                        typeof fileType.FILE_OPS !== 'undefined');
                    } catch (e) {
                        // 忽略错误
                    }
                }
                if (!fileTypeLoaded) {
                    fileTypeLoaded = typeof FileType !== 'undefined' && 
                                   (typeof FileType.GENRE !== 'undefined' || 
                                    typeof FileType.DIR_OPS !== 'undefined' ||
                                    typeof FileType.FILE_OPS !== 'undefined');
                }
                if (fileTypeLoaded) {
                    KernelLogger.debug("NodeTree", `fileType 已加载，直接初始化 ${separateName}`);
                } else {
                    KernelLogger.debug("NodeTree", `Dependency 不可用，直接初始化 ${separateName}`);
                }
                this.initialized = true;
                this._loadFromLocalStorage().catch(e => {
                    KernelLogger.warn("NodeTree", `加载文件系统数据失败: ${e.message}`);
                });
            }
        } catch (e) {
            KernelLogger.error("NodeTree", `等待依赖失败 ${separateName}`, String(e));
            this.initialized = true;
            this._loadFromLocalStorage().catch(e => {
                KernelLogger.warn("NodeTree", `加载文件系统数据失败: ${e.message}`);
            });
        }
    }
    
    // 保存到 PHP 文件系统（通过 FSDirve.php）
    async _saveToLocalStorage() {
        try {
            // 将 separateName 中的冒号替换为下划线，避免文件名中的冒号问题
            const safeName = this.separateName.replace(':', '_');
            const fileName = `filesystem_${safeName}.json`;
            // 根据 separateName 决定存储路径（C: 或 D:）
            const filePath = `${this.separateName}/`;
            const serialized = this._serialize();
            
            // 使用 PHP 服务保存文件
            const phpServiceUrl = "/system/service/FSDirve.php";
            const url = new URL(phpServiceUrl, window.location.origin);
            url.searchParams.set('action', 'write_file');
            url.searchParams.set('path', filePath);
            url.searchParams.set('fileName', fileName);
            url.searchParams.set('writeMod', 'overwrite');
            
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: serialized })
            });
            
            if (!response.ok) {
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
                KernelLogger.info("NodeTree", `saved to PHP file system: ${filePath}/${fileName}`);
            } else {
                throw new Error(result.message || '保存文件失败');
            }
        } catch (e) {
            KernelLogger.error("NodeTree", `failed to save to PHP file system: ${String(e)}`);
        }
    }
    
    // 从 PHP 文件系统加载（通过 FSDirve.php）
    async _loadFromLocalStorage() {
        try {
            // 将 separateName 中的冒号替换为下划线，避免文件名中的冒号问题
            const safeName = this.separateName.replace(':', '_');
            const fileName = `filesystem_${safeName}.json`;
            // 根据 separateName 决定存储路径（C: 或 D:）
            const filePath = `${this.separateName}/`;
            
            // 先检查文件是否存在，避免 404 错误
            const phpServiceUrl = "/system/service/FSDirve.php";
            const checkUrl = new URL(phpServiceUrl, window.location.origin);
            checkUrl.searchParams.set('action', 'exists');
            checkUrl.searchParams.set('path', `${filePath}${fileName}`);
            
            const checkResponse = await fetch(checkUrl.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            // 如果检查请求失败，直接返回（不记录错误）
            if (!checkResponse.ok) {
                return;
            }
            
            const checkContentType = checkResponse.headers.get('content-type');
            if (!checkContentType || !checkContentType.includes('application/json')) {
                return;
            }
            
            const checkResult = await checkResponse.json();
            
            // 如果文件不存在，直接返回（不发送 read_file 请求，避免 404）
            if (checkResult.status !== 'success' || !checkResult.data || !checkResult.data.exists || checkResult.data.type !== 'file') {
                KernelLogger.debug("NodeTree", `文件不存在，跳过加载: ${this.separateName}`);
                return;
            }
            
            // 文件存在，读取文件内容
            const readUrl = new URL(phpServiceUrl, window.location.origin);
            readUrl.searchParams.set('action', 'read_file');
            readUrl.searchParams.set('path', filePath);
            readUrl.searchParams.set('fileName', fileName);
            
            const response = await fetch(readUrl.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                // 如果读取失败，记录警告但不抛出错误
                KernelLogger.warn("NodeTree", `读取文件失败: ${filePath}/${fileName}`);
                return;
            }
            
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                KernelLogger.warn("NodeTree", `PHP 返回了非 JSON 响应`);
                return;
            }
            
            const result = await response.json();
            
            if (result.status === 'success' && result.data && result.data.content) {
                KernelLogger.info("NodeTree", `loading from PHP file system: ${filePath}/${fileName}`);
                this._deserialize(result.data.content);
            } else if (result.status === 'error' && result.message && result.message.includes('不存在')) {
                KernelLogger.debug("NodeTree", `no saved data in PHP file system: ${filePath}/${fileName}`);
            }
        } catch (e) {
            // 静默处理所有错误（文件不存在是正常的）
            KernelLogger.debug("NodeTree", `加载文件系统数据失败（已忽略）: ${this.separateName}`);
        }
    }
    
    // 通过 PHP 服务创建真实目录
    async _createRealDirectoryInPHP(virtualPath, dirName) {
        try {
            const phpServiceUrl = "/system/service/FSDirve.php";
            const url = new URL(phpServiceUrl, window.location.origin);
            url.searchParams.set('action', 'create_dir');
            url.searchParams.set('path', virtualPath);
            url.searchParams.set('name', dirName);
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                // 409 表示目录已存在，这是正常的
                if (response.status === 409) {
                    KernelLogger.debug("NodeTree", `目录已存在: ${virtualPath}/${dirName}`);
                    return true;
                }
                const contentType = response.headers.get('content-type');
                let errorText = `HTTP ${response.status}: ${response.statusText}`;
                if (contentType && contentType.includes('text/html')) {
                    const htmlText = await response.text();
                    errorText += `\nPHP 错误响应: ${htmlText.substring(0, 500)}`;
                }
                throw new Error(errorText);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
            }
            
            const result = await response.json();
            if (result.status === 'success') {
                KernelLogger.debug("NodeTree", `PHP 目录创建成功: ${virtualPath}/${dirName}`);
                return true;
            } else if (result.status === 'error' && result.message && result.message.includes('已存在')) {
                KernelLogger.debug("NodeTree", `目录已存在: ${virtualPath}/${dirName}`);
                return true;
            } else {
                throw new Error(result.message || '创建目录失败');
            }
        } catch (e) {
            KernelLogger.warn("NodeTree", `通过 PHP 创建目录失败: ${virtualPath}/${dirName}, ${String(e)}`);
            // 不抛出错误，允许继续执行（降级处理）
            return false;
        }
    }
    
    // 通过 PHP 服务创建真实文件
    async _createRealFileInPHP(virtualPath, fileName, content = '') {
        try {
            const phpServiceUrl = "/system/service/FSDirve.php";
            const url = new URL(phpServiceUrl, window.location.origin);
            url.searchParams.set('action', 'create_file');
            url.searchParams.set('path', virtualPath);
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
                    KernelLogger.debug("NodeTree", `文件已存在: ${virtualPath}/${fileName}`);
                    return true;
                }
                const contentType = response.headers.get('content-type');
                let errorText = `HTTP ${response.status}: ${response.statusText}`;
                if (contentType && contentType.includes('text/html')) {
                    const htmlText = await response.text();
                    errorText += `\nPHP 错误响应: ${htmlText.substring(0, 500)}`;
                }
                throw new Error(errorText);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
            }
            
            const result = await response.json();
            if (result.status === 'success') {
                KernelLogger.debug("NodeTree", `PHP 文件创建成功: ${virtualPath}/${fileName}`);
                return true;
            } else if (result.status === 'error' && result.message && result.message.includes('已存在')) {
                KernelLogger.debug("NodeTree", `文件已存在: ${virtualPath}/${fileName}`);
                return true;
            } else {
                throw new Error(result.message || '创建文件失败');
            }
        } catch (e) {
            KernelLogger.warn("NodeTree", `通过 PHP 创建文件失败: ${virtualPath}/${fileName}, ${String(e)}`);
            // 不抛出错误，允许继续执行（降级处理）
            return false;
        }
    }
    
    // 通过 PHP 服务写入真实文件
    async _writeRealFileInPHP(virtualPath, fileName, content, writeMod = 'overwrite') {
        try {
            const phpServiceUrl = "/system/service/FSDirve.php";
            const url = new URL(phpServiceUrl, window.location.origin);
            url.searchParams.set('action', 'write_file');
            url.searchParams.set('path', virtualPath);
            url.searchParams.set('fileName', fileName);
            url.searchParams.set('writeMod', writeMod);
            
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: content })
            });
            
            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                let errorText = `HTTP ${response.status}: ${response.statusText}`;
                if (contentType && contentType.includes('text/html')) {
                    const htmlText = await response.text();
                    errorText += `\nPHP 错误响应: ${htmlText.substring(0, 500)}`;
                }
                throw new Error(errorText);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
            }
            
            const result = await response.json();
            if (result.status === 'success') {
                KernelLogger.debug("NodeTree", `PHP 文件写入成功: ${virtualPath}/${fileName}`);
                return true;
            } else {
                throw new Error(result.message || '写入文件失败');
            }
        } catch (e) {
            KernelLogger.warn("NodeTree", `通过 PHP 写入文件失败: ${virtualPath}/${fileName}, ${String(e)}`);
            // 不抛出错误，允许继续执行（降级处理）
            return false;
        }
    }
    
    // 通过 PHP 服务删除真实文件
    async _deleteRealFileInPHP(virtualPath, fileName) {
        try {
            const phpServiceUrl = "/system/service/FSDirve.php";
            const url = new URL(phpServiceUrl, window.location.origin);
            url.searchParams.set('action', 'delete_file');
            url.searchParams.set('path', virtualPath);
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
                    KernelLogger.debug("NodeTree", `文件不存在: ${virtualPath}/${fileName}`);
                    return true;
                }
                const contentType = response.headers.get('content-type');
                let errorText = `HTTP ${response.status}: ${response.statusText}`;
                if (contentType && contentType.includes('text/html')) {
                    const htmlText = await response.text();
                    errorText += `\nPHP 错误响应: ${htmlText.substring(0, 500)}`;
                }
                throw new Error(errorText);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
            }
            
            const result = await response.json();
            if (result.status === 'success') {
                KernelLogger.debug("NodeTree", `PHP 文件删除成功: ${virtualPath}/${fileName}`);
                return true;
            } else if (result.status === 'error' && result.message && result.message.includes('不存在')) {
                KernelLogger.debug("NodeTree", `文件不存在: ${virtualPath}/${fileName}`);
                return true;
            } else {
                throw new Error(result.message || '删除文件失败');
            }
        } catch (e) {
            KernelLogger.warn("NodeTree", `通过 PHP 删除文件失败: ${virtualPath}/${fileName}, ${String(e)}`);
            // 不抛出错误，允许继续执行（降级处理）
            return false;
        }
    }
    
    // 通过 PHP 服务删除真实目录
    async _deleteRealDirectoryInPHP(virtualPath) {
        try {
            const phpServiceUrl = "/system/service/FSDirve.php";
            const url = new URL(phpServiceUrl, window.location.origin);
            url.searchParams.set('action', 'delete_dir');
            url.searchParams.set('path', virtualPath);
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                // 404 表示目录不存在，这是正常的
                if (response.status === 404) {
                    KernelLogger.debug("NodeTree", `目录不存在: ${virtualPath}`);
                    return true;
                }
                const contentType = response.headers.get('content-type');
                let errorText = `HTTP ${response.status}: ${response.statusText}`;
                if (contentType && contentType.includes('text/html')) {
                    const htmlText = await response.text();
                    errorText += `\nPHP 错误响应: ${htmlText.substring(0, 500)}`;
                }
                throw new Error(errorText);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`PHP 返回了非 JSON 响应: ${text.substring(0, 500)}`);
            }
            
            const result = await response.json();
            if (result.status === 'success') {
                KernelLogger.debug("NodeTree", `PHP 目录删除成功: ${virtualPath}`);
                return true;
            } else if (result.status === 'error' && result.message && result.message.includes('不存在')) {
                KernelLogger.debug("NodeTree", `目录不存在: ${virtualPath}`);
                return true;
            } else {
                throw new Error(result.message || '删除目录失败');
            }
        } catch (e) {
            KernelLogger.warn("NodeTree", `通过 PHP 删除目录失败: ${virtualPath}, ${String(e)}`);
            // 不抛出错误，允许继续执行（降级处理）
            return false;
        }
    }
    
    // 序列化整个文件系统
    _serialize() {
        const data = {
            separateName: this.separateName,
            nodes: []
        };
        
        // 序列化所有节点
        this.nodes.forEach((node, path) => {
            const nodeData = {
                path: path,
                name: node.name,
                parent: node.parent,
                attributes: {},
                children: [],
                meta: node.__meta || {}
            };
            
            // 序列化文件
            if (node.attributes) {
                for (const fileName in node.attributes) {
                    const file = node.attributes[fileName];
                    const fileData = {
                        fileName: file.fileName,
                        fileSize: file.fileSize || 0,
                        fileContent: file.fileContent || [],
                        fileType: file.fileType,
                        fileCreatTime: file.fileCreatTime,
                        fileModifyTime: file.fileModifyTime,
                        filePath: file.filePath || path,
                        fileBelongDisk: file.fileBelongDisk || this.separateName,
                        inited: file.inited !== undefined ? file.inited : true
                    };
                    nodeData.attributes[fileName] = fileData;
                }
            }
            
            // 序列化子节点引用（只保存路径）
            if (node.children) {
                node.children.forEach((childValue, childKey) => {
                    let childPath;
                    if (typeof childValue === 'object' && typeof childValue.path === 'function') {
                        childPath = childValue.path();
                    } else if (typeof childValue === 'string') {
                        childPath = childValue;
                    } else {
                        return;
                    }
                    nodeData.children.push({
                        name: childKey,
                        path: childPath
                    });
                });
            }
            
            data.nodes.push(nodeData);
        });
        
        return JSON.stringify(data);
    }
    
    // 反序列化并恢复文件系统
    _deserialize(serialized) {
        try {
            const data = JSON.parse(serialized);
            
            if (data.separateName !== this.separateName) {
                KernelLogger.warn("NodeTree", `separateName mismatch: expected ${this.separateName}, got ${data.separateName}`);
                return;
            }
            
            // 先创建所有节点（第一遍）
            const nodeMap = new Map();
            
            for (const nodeData of data.nodes) {
                // 如果是根节点，使用现有的
                let node;
                if (nodeData.path === this.separateName && this.nodes.has(this.separateName)) {
                    node = this.nodes.get(this.separateName);
                } else {
                    node = new Node(nodeData.name, {
                        parent: nodeData.parent,
                        name: nodeData.name
                    });
                }
                
                // 恢复元信息
                if (nodeData.meta) {
                    node.__meta = nodeData.meta;
                }
                
                nodeMap.set(nodeData.path, {
                    node: node,
                    data: nodeData
                });
            }
            
            // 恢复节点关系（第二遍）
            for (const [path, { node, data: nodeData }] of nodeMap) {
                // 恢复文件
                if (nodeData.attributes) {
                    for (const fileName in nodeData.attributes) {
                        const fileData = nodeData.attributes[fileName];
                        let fileObj;
                        
                        // 尝试使用 FileFormwork 创建文件对象
                        if (typeof FileFormwork !== "undefined" && typeof FileType !== "undefined") {
                            const FileTypeRef = getFileType();
                            const fileType = fileData.fileType || (FileTypeRef && FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0);
                            const content = (fileData.fileContent || []).join('\n');
                            // 恢复文件属性（如果存在）
                            const fileAttributes = fileData.fileAttributes !== undefined ? fileData.fileAttributes : null;
                            fileObj = new FileFormwork(
                                fileType,
                                fileData.fileName,
                                content,
                                fileData.filePath || path,
                                fileAttributes
                            );
                            // 恢复时间戳
                            if (fileData.fileCreatTime) {
                                fileObj.fileCreatTime = fileData.fileCreatTime;
                            }
                            if (fileData.fileModifyTime) {
                                fileObj.fileModifyTime = fileData.fileModifyTime;
                            }
                        } else {
                            // 降级：创建简单文件对象
                            fileObj = {
                                fileName: fileData.fileName,
                                fileSize: fileData.fileSize || 0,
                                fileContent: fileData.fileContent || [],
                                fileType: fileData.fileType,
                                fileCreatTime: fileData.fileCreatTime,
                                fileModifyTime: fileData.fileModifyTime,
                                filePath: fileData.filePath || path,
                                fileBelongDisk: fileData.fileBelongDisk || this.separateName,
                                inited: fileData.inited !== undefined ? fileData.inited : true
                            };
                        }
                        
                        node.attributes[fileName] = fileObj;
                    }
                }
                
                // 恢复子节点关系
                if (nodeData.children) {
                    for (const childData of nodeData.children) {
                        const childNodeInfo = nodeMap.get(childData.path);
                        if (childNodeInfo) {
                            node.children.set(childData.name, childNodeInfo.node);
                        } else {
                            // 如果子节点不存在，保存路径字符串
                            node.children.set(childData.name, childData.path);
                        }
                    }
                }
            }
            
            // 替换 nodes Map（保留根节点引用）
            const rootNode = this.nodes.get(this.separateName);
            this.nodes.clear();
            if (rootNode) {
                this.nodes.set(this.separateName, rootNode);
            }
            for (const [path, { node }] of nodeMap) {
                if (path !== this.separateName) {
                    this.nodes.set(path, node);
                } else if (!rootNode) {
                    // 如果根节点不存在，使用加载的节点
                    this.nodes.set(path, node);
                }
            }
            
            KernelLogger.info("NodeTree", `deserialized ${data.nodes.length} nodes from localStorage`);
            
            // 更新磁盘使用情况
            try {
                if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                    Disk.update();
                }
            } catch (e) {}
        } catch (e) {
            KernelLogger.error("NodeTree", `deserialization failed: ${String(e)}`);
        }
    }

    // 从 PHP 服务重建 NodeTree（递归遍历目录结构）
    async _rebuildFromPHP(rootPath = null) {
        try {
            KernelLogger.info("NodeTree", `开始从 PHP 服务重建 NodeTree: ${this.separateName}`);
            
            // 清空现有节点（保留根节点）
            const rootNode = this.nodes.get(this.separateName);
            this.nodes.clear();
            if (rootNode) {
                this.nodes.set(this.separateName, rootNode);
            } else {
                // 如果根节点不存在，创建它
                const newRootNode = new Node(this.separateName, {
                    parent: null,
                    name: this.separateName
                });
                this.nodes.set(this.separateName, newRootNode);
            }
            
            // 从根目录开始递归构建
            const startPath = rootPath || this.separateName;
            await this._rebuildDirectoryFromPHP(startPath, this.separateName);
            
            // 标记为已初始化
            this.initialized = true;
            
            // 更新磁盘使用情况
            try {
                if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                    Disk.update();
                }
            } catch (e) {
                KernelLogger.warn("NodeTree", `更新磁盘使用情况失败: ${String(e)}`);
            }
            
            KernelLogger.info("NodeTree", `从 PHP 服务重建 NodeTree 完成: ${this.separateName}`);
        } catch (e) {
            KernelLogger.error("NodeTree", `从 PHP 服务重建 NodeTree 失败: ${this.separateName}`, e);
            throw e;
        }
    }
    
    // 递归从 PHP 服务构建目录结构
    async _rebuildDirectoryFromPHP(dirPath, parentPath) {
        try {
            const phpServiceUrl = "/system/service/FSDirve.php";
            const url = new URL(phpServiceUrl, window.location.origin);
            url.searchParams.set('action', 'list_dir');
            url.searchParams.set('path', dirPath);
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                KernelLogger.warn("NodeTree", `获取目录列表失败: ${dirPath}, HTTP ${response.status}`);
                return;
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                KernelLogger.warn("NodeTree", `PHP 返回了非 JSON 响应: ${dirPath}`);
                return;
            }
            
            const result = await response.json();
            if (result.status !== 'success' || !result.data || !result.data.items) {
                KernelLogger.debug("NodeTree", `目录列表为空或失败: ${dirPath}`);
                return;
            }
            
            const items = result.data.items || [];
            
            // 确保当前目录节点存在
            let currentNode = this.nodes.get(dirPath);
            if (!currentNode) {
                // 创建目录节点
                const dirName = dirPath === this.separateName ? this.separateName : dirPath.split('/').pop();
                currentNode = new Node(dirName, {
                    parent: parentPath,
                    name: dirName
                });
                this.nodes.set(dirPath, currentNode);
                
                // 添加到父节点的子节点列表
                const parentNode = this.nodes.get(parentPath);
                if (parentNode) {
                    parentNode.children.set(dirName, currentNode);
                }
            }
            
            // 处理子目录和文件
            for (const item of items) {
                if (item.type === 'directory') {
                    const childDirPath = dirPath === this.separateName 
                        ? `${this.separateName}/${item.name}` 
                        : `${dirPath}/${item.name}`;
                    // 递归处理子目录
                    await this._rebuildDirectoryFromPHP(childDirPath, dirPath);
                } else if (item.type === 'file') {
                    // 创建文件节点（简化版本，不读取文件内容）
                    const FileTypeRef = getFileType();
                    const fileType = FileTypeRef && FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0;
                    
                    let fileObj;
                    if (typeof FileFormwork !== "undefined") {
                        fileObj = new FileFormwork(
                            fileType,
                            item.name,
                            '', // 不读取文件内容，只重建结构
                            dirPath,
                            null
                        );
                        fileObj.fileSize = item.size || 0;
                    } else {
                        // 降级：创建简单文件对象
                        fileObj = {
                            fileName: item.name,
                            fileSize: item.size || 0,
                            fileContent: [],
                            fileType: fileType,
                            fileCreatTime: Date.now(),
                            fileModifyTime: Date.now(),
                            filePath: dirPath,
                            fileBelongDisk: this.separateName,
                            inited: true
                        };
                    }
                    
                    currentNode.attributes[item.name] = fileObj;
                }
            }
        } catch (e) {
            KernelLogger.warn("NodeTree", `重建目录失败: ${dirPath}`, e);
            // 不抛出错误，允许继续处理其他目录
        }
    }
    
    // 是否存在某个节点
    hasNode(path) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized checkNode");
            return false;
        }
        KernelLogger.debug("NodeTree", `check node ${path}`);
        let end = this.nodes.has(path);
        KernelLogger.debug("NodeTree", `node exists ${path}=${end}`);
        return end;
    }

    // 获得某个节点
    getNode(path) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized getNode");
            return null;
        }
        KernelLogger.debug("NodeTree", `get node ${path}`);
        return this.nodes.get(path);
    }

    // 调试方法
    ronderNodeTree() {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized render");
            return;
        }
        KernelLogger.debug("NodeTree", "render nodes");
        this.nodes.forEach((value, key) => {
            KernelLogger.debug("NodeTree", `node ${key}`);
            KernelLogger.debug("NodeTree", `children of ${key}`);
            value.children.forEach((childValue, childKey) => {
                KernelLogger.debug("NodeTree", ` - ${childKey}`);
            });
            KernelLogger.debug("NodeTree", `files of ${key}`);
            for (const fileName in value.attributes) {
                KernelLogger.debug("NodeTree", ` - ${fileName}`);
            }
        });
    }

    // 节点操作(封装)
    // 创建目录（异步，等待 PHP 操作完成）
    async create_dir(path, name) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized create_dir");
            return;
        }
        KernelLogger.info("NodeTree", `create dir ${path}/${name}`);
        const node = new Node(name, {
            parent: path,
            name: name,
        });
        this.optNode(FileType.DIR_OPS.CREATE, path, node);
        KernelLogger.info("NodeTree", `created dir ${path}/${name}`);
        
        // 通过 PHP 创建真实目录（等待完成）
        try {
            await this._createRealDirectoryInPHP(path, name);
            KernelLogger.debug("NodeTree", `PHP 目录创建成功: ${path}/${name}`);
        } catch (e) {
            KernelLogger.warn("NodeTree", `通过 PHP 创建目录失败: ${path}/${name}, ${e.message}`);
        }
        
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
    }
    // 删除目录
    delete_dir(path) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized delete_dir");
            return;
        }
        KernelLogger.info("NodeTree", `delete dir ${path}`);
        
        // 获取要删除的目录节点
        const targetNode = this.nodes.get(path);
        if (!targetNode) {
            KernelLogger.error("NodeTree", `directory not found ${path}`);
            throw new Error(`目录 ${path} 不存在`);
        }
        
        // 检查目录属性：如果目录设置了 NO_DELETE 标志，则拒绝删除
        const FileTypeRef = getFileType();
        if (FileTypeRef && targetNode.__meta && targetNode.__meta.dirAttributes !== undefined) {
            const attrs = FileTypeRef.DIR_ATTRIBUTES || FileTypeRef.FILE_ATTRIBUTES;
            if (attrs) {
                // 检查 NO_DELETE 标志位（位 4）
                if ((targetNode.__meta.dirAttributes & attrs.NO_DELETE) !== 0) {
                    KernelLogger.warn("NodeTree", `删除被拒绝: 目录 ${path} 不可删除 (属性: ${targetNode.__meta.dirAttributes})`);
                    throw new Error(`目录 ${path} 不可删除`);
                }
            }
        }
        
        const nodeInfo = path.split(/\//);
        const nodeName = nodeInfo[nodeInfo.length - 1];
        const parentPath = nodeInfo.slice(0, nodeInfo.length - 1).join("/");
        const node = new Node(nodeName, {
            parent: parentPath,
            name: nodeName,
        });
        this.optNode(FileType.DIR_OPS.DELETE, parentPath, node);
        KernelLogger.info("NodeTree", `deleted dir ${path}`);
        
        // 通过 PHP 删除真实目录（异步，不阻塞）
        this._deleteRealDirectoryInPHP(path).catch(e => {
            KernelLogger.warn("NodeTree", `通过 PHP 删除目录失败: ${path}, ${e.message}`);
        });
        
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
    }

    // 文件操作(封装)
    // 读取文件
    read_file(path, fileName) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized read_file");
            return null;
        }
        KernelLogger.debug("NodeTree", `read file ${fileName} at ${path}`);
        const target = this.nodes.get(path);
        if (!target) {
            KernelLogger.error("NodeTree", `read_file: 目录节点不存在: ${path}`);
            return null;
        }
        const fileObj = target.attributes[fileName];
        if (!fileObj) {
            KernelLogger.error("NodeTree", `read_file: 文件不存在: ${path}/${fileName}`);
            return null;
        }
        return target.optFile(
            FileType.FILE_OPS.READ,
            fileObj
        );
    }
    // 写入文件（异步，等待 PHP 操作完成）
    // 支持可选的 writeMod 参数，会传递给底层文件对象的 writeFile 方法
    async write_file(path, fileName, newContent, writeMod) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized write_file");
            return;
        }
        KernelLogger.info("NodeTree", `write file ${fileName} at ${path} writeMod=${String(writeMod)}`);
        const target = this.nodes.get(path);
        if (!target) {
            KernelLogger.error("NodeTree", `write_file: 目录节点不存在: ${path}`);
            throw new Error(`目录 ${path} 不存在`);
        }
        const fileObj = target.attributes[fileName];
        if (!fileObj) {
            KernelLogger.error("NodeTree", `write_file: 文件不存在: ${path}/${fileName}`);
            throw new Error(`文件 ${path}/${fileName} 不存在，请先创建文件`);
        }
        
        // 将写模式透传到 Node.optFile -> FileFormwork.writeFile
        target.optFile(
            FileType.FILE_OPS.WRITE,
            fileObj,
            newContent,
            writeMod
        );
        KernelLogger.info("NodeTree", `wrote file ${fileName} at ${path}`);
        
        // 获取文件内容（用于 PHP 写入）
        let fileContent = '';
        if (fileObj && fileObj.fileContent) {
            if (Array.isArray(fileObj.fileContent)) {
                fileContent = fileObj.fileContent.join('\n');
            } else {
                fileContent = String(fileObj.fileContent);
            }
        } else if (newContent !== undefined) {
            fileContent = typeof newContent === 'string' ? newContent : String(newContent);
        }
        
        // 通过 PHP 写入真实文件（等待完成）
        try {
            // 将 writeMod 转换为字符串格式（'overwrite' 或 'append'）
            let writeModStr = 'overwrite';
            const FileTypeRef = getFileType();
            if (FileTypeRef && FileTypeRef.WRITE_MODES) {
                if (writeMod === FileTypeRef.WRITE_MODES.APPEND) {
                    writeModStr = 'append';
                }
            }
            await this._writeRealFileInPHP(path, fileName, fileContent, writeModStr);
            KernelLogger.debug("NodeTree", `PHP 文件写入成功: ${path}/${fileName}`);
        } catch (e) {
            KernelLogger.warn("NodeTree", `通过 PHP 写入文件失败: ${path}/${fileName}, ${e.message}`);
        }
        
        // 写入后更新磁盘使用统计（如果 Disk 可用）
        try {
            if (
                typeof Disk !== "undefined" &&
                typeof Disk.update === "function"
            )
                Disk.update();
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
    }
    // 创建文件（异步，等待 PHP 操作完成）
    async create_file(path, file) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized create_file");
            return;
        }
        KernelLogger.info("NodeTree", `create file at ${path} checking args`);
        let fileObj = file;
        // 支持传入字符串（文件名）或文件对象
        if (typeof file === "string") {
            try {
                if (
                    typeof FileFormwork !== "undefined" &&
                    typeof FileType !== "undefined"
                ) {
                    const FileTypeRef = getFileType();
                    const fileType = FileTypeRef && FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0;
                    // 默认使用正常属性
                    const fileAttributes = FileTypeRef && FileTypeRef.FILE_ATTRIBUTES ? FileTypeRef.FILE_ATTRIBUTES.NORMAL : null;
                    fileObj = new FileFormwork(
                        fileType,
                        file,
                        "",
                        path,
                        fileAttributes
                    );
                    KernelLogger.debug("NodeTree", `created FileFormwork ${file} at ${path}`);
                } else {
                    fileObj = {
                        fileName: file,
                        fileSize: 0,
                        fileContent: [],
                        filePath: path,
                        fileBelongDisk: path.split("/")[0],
                        inited: true,
                    };
                    KernelLogger.debug("NodeTree", `fallback created file object ${file} at ${path}`);
                }
            } catch (e) {
                KernelLogger.error("NodeTree", `fileformwork create failed ${file}`, String(e));
                fileObj = {
                    fileName: file,
                    fileSize: 0,
                    fileContent: [],
                    filePath: path,
                    fileBelongDisk: path.split("/")[0],
                    inited: true,
                };
            }
        }
        if (!fileObj || !fileObj.fileName) {
            KernelLogger.error("NodeTree", `create_file: invalid file object, canceling`);
            return;
        }
        KernelLogger.info("NodeTree", `create file ${fileObj.fileName} at ${path} calling optFile`);
        const targetNode = this.nodes.get(path);
        if (!targetNode) {
            KernelLogger.error("NodeTree", `create_file: 目录节点不存在: ${path}`);
            throw new Error(`目录 ${path} 不存在`);
        }
        targetNode.optFile(FileType.FILE_OPS.CREATE, fileObj);
        KernelLogger.info("NodeTree", `created file ${fileObj.fileName} at ${path}`);
        
        // 获取文件内容（用于 PHP 创建）
        let fileContent = '';
        if (fileObj.fileContent) {
            if (Array.isArray(fileObj.fileContent)) {
                fileContent = fileObj.fileContent.join('\n');
            } else {
                fileContent = String(fileObj.fileContent);
            }
        }
        
        // 通过 PHP 创建真实文件（等待完成）
        try {
            await this._createRealFileInPHP(path, fileObj.fileName, fileContent);
            KernelLogger.debug("NodeTree", `PHP 文件创建成功: ${path}/${fileObj.fileName}`);
        } catch (e) {
            KernelLogger.warn("NodeTree", `通过 PHP 创建文件失败: ${path}/${fileObj.fileName}, ${e.message}`);
        }
        
        // 创建文件后刷新磁盘使用情况
        try {
            if (
                typeof Disk !== "undefined" &&
                typeof Disk.update === "function"
            )
                Disk.update();
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
    }
    // 删除文件
    delete_file(path, fileName) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized delete_file");
            return;
        }
        KernelLogger.info("NodeTree", `delete file ${fileName} at ${path}`);
        this.nodes.get(path).optFile(FileType.FILE_OPS.DELETE, {
            fileName: fileName,
        });
        KernelLogger.info("NodeTree", `deleted file ${fileName} at ${path}`);
        
        // 通过 PHP 删除真实文件（异步，不阻塞）
        this._deleteRealFileInPHP(path, fileName).catch(e => {
            KernelLogger.warn("NodeTree", `通过 PHP 删除文件失败: ${path}/${fileName}, ${e.message}`);
        });
        
        // 删除文件后刷新磁盘使用情况
        try {
            if (
                typeof Disk !== "undefined" &&
                typeof Disk.update === "function"
            )
                Disk.update();
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
    }
    
    // 创建链接文件
    create_link(path, linkName, targetPath) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized create_link");
            return;
        }
        KernelLogger.info("NodeTree", `create link ${linkName} at ${path} -> ${targetPath}`);
        
        const FileTypeRef = getFileType();
        if (!FileTypeRef) {
            KernelLogger.error("NodeTree", `FileType not available for creating link ${linkName}`);
            return;
        }
        
        // 创建链接文件对象
        let linkFile = null;
        try {
            if (typeof FileFormwork !== "undefined") {
                // 链接文件类型为 LINK，内容为目标路径
                const linkType = FileTypeRef.GENRE ? FileTypeRef.GENRE.LINK : "链接文件";
                linkFile = new FileFormwork(
                    linkType,
                    linkName,
                    targetPath,  // 链接内容为目标路径
                    path,
                    null,  // fileAttributes 将在构造函数中自动设置为只读等
                    targetPath   // linkTarget 参数
                );
                KernelLogger.debug("NodeTree", `created link FileFormwork ${linkName} at ${path} -> ${targetPath}`);
            } else {
                // 降级处理
                linkFile = {
                    fileName: linkName,
                    fileType: "链接文件",
                    fileSize: targetPath.length,
                    fileContent: [targetPath],
                    filePath: path,
                    fileBelongDisk: path.split("/")[0],
                    linkTarget: targetPath,
                    fileAttributes: 1 | 4 | 8 | 16,  // 只读 + 不可删除 + 不可移动 + 不可重命名
                    inited: true,
                };
                KernelLogger.debug("NodeTree", `fallback created link file object ${linkName} at ${path} -> ${targetPath}`);
            }
        } catch (e) {
            KernelLogger.error("NodeTree", `link file create failed ${linkName}`, String(e));
            return;
        }
        
        if (!linkFile || !linkFile.fileName) {
            KernelLogger.error("NodeTree", `create_link: invalid link file object, canceling`);
            return;
        }
        
        KernelLogger.info("NodeTree", `create link file ${linkFile.fileName} at ${path} calling optFile`);
        this.nodes.get(path).optFile(FileTypeRef.FILE_OPS.CREATE, linkFile);
        KernelLogger.info("NodeTree", `created link file ${linkFile.fileName} at ${path} -> ${targetPath}`);
        
        // 创建链接后刷新磁盘使用情况
        try {
            if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                Disk.update();
            }
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
    }
    
    // 创建链接目录
    create_link_dir(path, linkName, targetPath) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized create_link_dir");
            return;
        }
        KernelLogger.info("NodeTree", `create link dir ${linkName} at ${path} -> ${targetPath}`);
        
        const FileTypeRef = getFileType();
        if (!FileTypeRef) {
            KernelLogger.error("NodeTree", `FileType not available for creating link dir ${linkName}`);
            return;
        }
        
        // 创建链接目录节点
        const linkNode = new Node(linkName, {
            parent: path,
            name: linkName,
        });
        
        // 设置链接目标
        linkNode.__meta = linkNode.__meta || {};
        linkNode.__meta.linkTarget = targetPath;
        
        // 设置目录属性：只读 + 不可删除 + 不可移动 + 不可重命名
        if (FileTypeRef.DIR_ATTRIBUTES) {
            linkNode.__meta.dirAttributes = FileTypeRef.DIR_ATTRIBUTES.READ_ONLY | 
                                           FileTypeRef.DIR_ATTRIBUTES.NO_DELETE | 
                                           FileTypeRef.DIR_ATTRIBUTES.NO_MOVE | 
                                           FileTypeRef.DIR_ATTRIBUTES.NO_RENAME;
        } else {
            linkNode.__meta.dirAttributes = 1 | 4 | 8 | 16;  // 降级：使用位标志值
        }
        
        KernelLogger.info("NodeTree", `create link dir ${linkName} at ${path} calling optChild`);
        
        // 确保父目录存在
        const parentNode = this.nodes.get(path);
        if (!parentNode) {
            KernelLogger.error("NodeTree", `父目录不存在: ${path}，无法创建链接目录 ${linkName}`);
            throw new Error(`父目录 ${path} 不存在`);
        }
        
        parentNode.optChild(FileTypeRef.DIR_OPS.CREATE, linkNode);
        
        // 构建链接目录的完整路径
        // 注意：如果 path 是根目录（separateName），则 linkPath 应该是 separateName + "/" + linkName
        // 而不是单独的 linkName，以保持路径一致性
        const linkPath = path === this.separateName ? `${this.separateName}/${linkName}` : `${path}/${linkName}`;
        this.nodes.set(linkPath, linkNode);
        
        KernelLogger.debug("NodeTree", `链接目录已注册到 nodes Map: ${linkPath}`);
        
        KernelLogger.info("NodeTree", `created link dir ${linkName} at ${path} -> ${targetPath}`);
        
        // 创建链接后刷新磁盘使用情况
        try {
            if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                Disk.update();
            }
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
    }

    // 重命名文件
    rename_file(path, oldFileName, newFileName) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized rename_file");
            return false;
        }
        KernelLogger.info("NodeTree", `rename file ${oldFileName} to ${newFileName} at ${path}`);
        const node = this.nodes.get(path);
        if (!node || !node.attributes || !node.attributes[oldFileName]) {
            KernelLogger.error("NodeTree", `file not found ${path}/${oldFileName}`);
            return false;
        }
        // 检查新文件名是否已存在
        if (node.attributes[newFileName]) {
            KernelLogger.error("NodeTree", `file already exists ${path}/${newFileName}`);
            return false;
        }
        node.optFile(FileType.FILE_OPS.RENAME, {
            oldFileName: oldFileName,
            newFileName: newFileName,
        });
        KernelLogger.info("NodeTree", `renamed file ${oldFileName} to ${newFileName} at ${path}`);
        // 重命名文件后刷新磁盘使用情况
        try {
            if (
                typeof Disk !== "undefined" &&
                typeof Disk.update === "function"
            )
                Disk.update();
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
        return true;
    }

    // 重命名目录
    rename_dir(oldPath, newName) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized rename_dir");
            return false;
        }
        KernelLogger.info("NodeTree", `rename dir ${oldPath} to ${newName}`);
        const node = this.nodes.get(oldPath);
        if (!node) {
            KernelLogger.error("NodeTree", `directory not found ${oldPath}`);
            return false;
        }
        
        // 检查目录属性：如果目录设置了 NO_RENAME 或 NO_MOVE 标志，则拒绝重命名
        const FileTypeRef = getFileType();
        if (FileTypeRef && node.__meta && node.__meta.dirAttributes !== undefined) {
            const attrs = FileTypeRef.DIR_ATTRIBUTES || FileTypeRef.FILE_ATTRIBUTES;
            if (attrs) {
                // 检查 NO_RENAME 标志位（位 16）或 NO_MOVE 标志位（位 8）
                if ((node.__meta.dirAttributes & attrs.NO_RENAME) !== 0 || 
                    (node.__meta.dirAttributes & attrs.NO_MOVE) !== 0) {
                    KernelLogger.warn("NodeTree", `重命名被拒绝: 目录 ${oldPath} 不可重命名 (属性: ${node.__meta.dirAttributes})`);
                    throw new Error(`目录 ${oldPath} 不可重命名`);
                }
            }
        }
        // 构建新路径 - 从旧路径推断父路径
        const pathParts = oldPath.split('/');
        if (pathParts.length === 0 || pathParts[0] !== this.separateName) {
            KernelLogger.error("NodeTree", `invalid path format ${oldPath}`);
            return false;
        }
        // 获取父路径
        const parentPathParts = pathParts.slice(0, -1);
        const parentPath = parentPathParts.length === 1 ? this.separateName : parentPathParts.join('/');
        // 构建新路径
        const newPath = parentPath === this.separateName ? newName : `${parentPath}/${newName}`;
        // 检查新路径是否已存在
        if (this.nodes.has(newPath)) {
            KernelLogger.error("NodeTree", `directory already exists ${newPath}`);
            return false;
        }
        // 获取父节点
        const parentNode = this.nodes.get(parentPath);
        if (!parentNode) {
            KernelLogger.error("NodeTree", `parent directory not found ${parentPath}`);
            return false;
        }
        // 执行重命名操作：更新父节点的children映射
        parentNode.optChild(FileType.DIR_OPS.RENAME, {
            oldName: node.name,
            newName: newName,
            oldPath: oldPath,
            newPath: newPath,
            path: newPath,
        });
        // 更新nodes映射：从旧路径删除，添加到新路径
        this.nodes.delete(oldPath);
        node.name = newName;
        this.nodes.set(newPath, node);
        // 更新所有子节点的路径（如果需要，可以递归更新，这里简化处理）
        KernelLogger.info("NodeTree", `renamed dir ${oldPath} to ${newPath}`);
        // 重命名目录后刷新磁盘使用情况
        try {
            if (
                typeof Disk !== "undefined" &&
                typeof Disk.update === "function"
            )
                Disk.update();
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
        return true;
    }

    // 移动文件
    move_file(sourcePath, sourceFileName, targetPath, targetFileName) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized move_file");
            return false;
        }
        KernelLogger.info("NodeTree", `move file ${sourcePath}/${sourceFileName} to ${targetPath}/${targetFileName}`);
        
        // 获取源文件
        const sourceNode = this.nodes.get(sourcePath);
        if (!sourceNode || !sourceNode.attributes || !sourceNode.attributes[sourceFileName]) {
            KernelLogger.error("NodeTree", `source file not found ${sourcePath}/${sourceFileName}`);
            return false;
        }
        
        // 获取目标目录
        const targetNode = this.nodes.get(targetPath);
        if (!targetNode) {
            KernelLogger.error("NodeTree", `target directory not found ${targetPath}`);
            return false;
        }
        
        // 检查目标文件是否已存在
        if (targetNode.attributes && targetNode.attributes[targetFileName]) {
            KernelLogger.error("NodeTree", `target file already exists ${targetPath}/${targetFileName}`);
            return false;
        }
        
        // 检查文件属性：如果文件设置了 NO_MOVE 标志，则拒绝移动
        const sourceFile = sourceNode.attributes[sourceFileName];
        const FileTypeRef = getFileType();
        if (FileTypeRef && FileTypeRef.FILE_ATTRIBUTES && sourceFile.fileAttributes !== undefined) {
            const attrs = FileTypeRef.FILE_ATTRIBUTES;
            // 检查 NO_MOVE 标志位（位 8）
            if ((sourceFile.fileAttributes & attrs.NO_MOVE) !== 0) {
                KernelLogger.warn("NodeTree", `移动被拒绝: 文件 ${sourcePath}/${sourceFileName} 不可移动 (属性: ${sourceFile.fileAttributes})`);
                throw new Error(`文件 ${sourceFileName} 不可移动`);
            }
        }
        
        // 读取源文件内容
        const fileContent = sourceNode.optFile(FileType.FILE_OPS.READ, sourceFile);
        
        // 创建新文件对象（使用FileFormwork或降级方式）
        let newFile;
        if (typeof FileFormwork !== "undefined" && typeof FileType !== "undefined") {
            // 使用FileFormwork创建新文件
            const fileType = sourceFile.fileType || (FileTypeRef && FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0);
            // 保留源文件的属性（如果存在）
            const fileAttributes = sourceFile.fileAttributes !== undefined ? sourceFile.fileAttributes : 
                                 (FileTypeRef && FileTypeRef.FILE_ATTRIBUTES ? FileTypeRef.FILE_ATTRIBUTES.NORMAL : null);
            newFile = new FileFormwork(
                fileType,
                targetFileName,
                fileContent || '',
                targetPath,
                fileAttributes
            );
        } else {
            // 降级：创建简单文件对象
            newFile = {
                fileName: targetFileName,
                fileSize: sourceFile.fileSize || 0,
                fileContent: sourceFile.fileContent ? [...sourceFile.fileContent] : [],
                fileType: sourceFile.fileType,
                fileCreatTime: sourceFile.fileCreatTime,
                fileModifyTime: new Date().getTime(),
                filePath: targetPath,
                fileBelongDisk: targetPath.split('/')[0],
                inited: true,
            };
            
            // 如果内容是通过readFile读取的，设置内容
            if (fileContent !== null && fileContent !== undefined) {
                newFile.fileContent = fileContent.split('\n');
                newFile.fileSize = fileContent.length;
            }
        }
        
        // 在目标目录创建文件
        targetNode.optFile(FileType.FILE_OPS.CREATE, newFile);
        
        // 删除源文件
        sourceNode.optFile(FileType.FILE_OPS.DELETE, { fileName: sourceFileName });
        
        KernelLogger.info("NodeTree", `moved file ${sourcePath}/${sourceFileName} to ${targetPath}/${targetFileName}`);
        
        // 刷新磁盘使用情况
        try {
            if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                Disk.update();
            }
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
        return true;
    }

    // 移动目录
    move_dir(sourcePath, targetParentPath, targetName) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized move_dir");
            return false;
        }
        KernelLogger.info("NodeTree", `move dir ${sourcePath} to ${targetParentPath}/${targetName}`);
        
        // 获取源目录
        const sourceNode = this.nodes.get(sourcePath);
        if (!sourceNode) {
            KernelLogger.error("NodeTree", `source directory not found ${sourcePath}`);
            return false;
        }
        
        // 检查目录属性：如果目录设置了 NO_MOVE 标志，则拒绝移动
        const FileTypeRef = getFileType();
        if (FileTypeRef && sourceNode.__meta && sourceNode.__meta.dirAttributes !== undefined) {
            const attrs = FileTypeRef.DIR_ATTRIBUTES || FileTypeRef.FILE_ATTRIBUTES;
            if (attrs) {
                // 检查 NO_MOVE 标志位（位 8）
                if ((sourceNode.__meta.dirAttributes & attrs.NO_MOVE) !== 0) {
                    KernelLogger.warn("NodeTree", `移动被拒绝: 目录 ${sourcePath} 不可移动 (属性: ${sourceNode.__meta.dirAttributes})`);
                    throw new Error(`目录 ${sourcePath} 不可移动`);
                }
            }
        }
        
        // 获取目标父目录
        const targetParentNode = this.nodes.get(targetParentPath);
        if (!targetParentNode) {
            KernelLogger.error("NodeTree", `target parent directory not found ${targetParentPath}`);
            return false;
        }
        
        // 构建新路径
        const newPath = targetParentPath === this.separateName ? targetName : `${targetParentPath}/${targetName}`;
        
        // 检查目标路径是否已存在
        if (this.nodes.has(newPath)) {
            KernelLogger.error("NodeTree", `target directory already exists ${newPath}`);
            return false;
        }
        
        // 获取源目录的父路径和名称
        const sourcePathParts = sourcePath.split('/');
        const sourceName = sourcePathParts[sourcePathParts.length - 1];
        const sourceParentPathParts = sourcePathParts.slice(0, -1);
        const sourceParentPath = sourceParentPathParts.length === 1 ? this.separateName : sourceParentPathParts.join('/');
        const sourceParentNode = this.nodes.get(sourceParentPath);
        
        if (!sourceParentNode) {
            KernelLogger.error("NodeTree", `source parent directory not found ${sourceParentPath}`);
            return false;
        }
        
        // 从源父目录删除
        sourceParentNode.optChild(FileType.DIR_OPS.DELETE, { name: sourceName });
        
        // 添加到目标父目录
        sourceNode.name = targetName;
        targetParentNode.optChild(FileType.DIR_OPS.CREATE, sourceNode);
        
        // 更新nodes映射
        this.nodes.delete(sourcePath);
        this.nodes.set(newPath, sourceNode);
        
        KernelLogger.info("NodeTree", `moved dir ${sourcePath} to ${newPath}`);
        
        // 刷新磁盘使用情况
        try {
            if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                Disk.update();
            }
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
        return true;
    }

    // 复制文件
    copy_file(sourcePath, sourceFileName, targetPath, targetFileName) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized copy_file");
            return false;
        }
        KernelLogger.info("NodeTree", `copy file ${sourcePath}/${sourceFileName} to ${targetPath}/${targetFileName}`);
        
        // 获取源文件
        const sourceNode = this.nodes.get(sourcePath);
        if (!sourceNode || !sourceNode.attributes || !sourceNode.attributes[sourceFileName]) {
            KernelLogger.error("NodeTree", `source file not found ${sourcePath}/${sourceFileName}`);
            return false;
        }
        
        // 获取目标目录
        const targetNode = this.nodes.get(targetPath);
        if (!targetNode) {
            KernelLogger.error("NodeTree", `target directory not found ${targetPath}`);
            return false;
        }
        
        // 检查目标文件是否已存在
        if (targetNode.attributes && targetNode.attributes[targetFileName]) {
            KernelLogger.error("NodeTree", `target file already exists ${targetPath}/${targetFileName}`);
            return false;
        }
        
        // 读取源文件内容
        const sourceFile = sourceNode.attributes[sourceFileName];
        const fileContent = sourceNode.optFile(FileType.FILE_OPS.READ, sourceFile);
        
        // 创建新文件对象（复制文件属性）
        let newFile;
        if (typeof FileFormwork !== "undefined" && typeof FileType !== "undefined") {
            // 使用FileFormwork创建新文件
            const FileTypeRef = getFileType();
            const fileType = sourceFile.fileType || (FileTypeRef && FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0);
            // 保留源文件的属性（如果存在）
            const fileAttributes = sourceFile.fileAttributes !== undefined ? sourceFile.fileAttributes : 
                                 (FileTypeRef && FileTypeRef.FILE_ATTRIBUTES ? FileTypeRef.FILE_ATTRIBUTES.NORMAL : null);
            newFile = new FileFormwork(
                fileType,
                targetFileName,
                fileContent || '',
                targetPath,
                fileAttributes
            );
        } else {
            // 降级：创建简单文件对象
            newFile = {
                fileName: targetFileName,
                fileSize: sourceFile.fileSize || 0,
                fileContent: sourceFile.fileContent ? [...sourceFile.fileContent] : [],
                fileType: sourceFile.fileType,
                fileAttributes: sourceFile.fileAttributes !== undefined ? sourceFile.fileAttributes : 0,
                fileCreatTime: new Date().getTime(),
                fileModifyTime: new Date().getTime(),
                filePath: targetPath,
                fileBelongDisk: targetPath.split('/')[0],
                inited: true,
            };
            
            // 如果内容是通过readFile读取的，设置内容
            if (fileContent !== null && fileContent !== undefined) {
                newFile.fileContent = fileContent.split('\n');
                newFile.fileSize = fileContent.length;
            }
        }
        
        // 在目标目录创建文件
        targetNode.optFile(FileType.FILE_OPS.CREATE, newFile);
        
        KernelLogger.info("NodeTree", `copied file ${sourcePath}/${sourceFileName} to ${targetPath}/${targetFileName}`);
        
        // 刷新磁盘使用情况
        try {
            if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                Disk.update();
            }
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
        return true;
    }

    // 复制目录（递归）
    copy_dir(sourcePath, targetParentPath, targetName) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized copy_dir");
            return false;
        }
        KernelLogger.info("NodeTree", `copy dir ${sourcePath} to ${targetParentPath}/${targetName}`);
        
        // 获取源目录
        const sourceNode = this.nodes.get(sourcePath);
        if (!sourceNode) {
            KernelLogger.error("NodeTree", `source directory not found ${sourcePath}`);
            return false;
        }
        
        // 获取目标父目录
        const targetParentNode = this.nodes.get(targetParentPath);
        if (!targetParentNode) {
            KernelLogger.error("NodeTree", `target parent directory not found ${targetParentPath}`);
            return false;
        }
        
        // 构建新路径
        const newPath = targetParentPath === this.separateName ? targetName : `${targetParentPath}/${targetName}`;
        
        // 检查目标路径是否已存在
        if (this.nodes.has(newPath)) {
            KernelLogger.error("NodeTree", `target directory already exists ${newPath}`);
            return false;
        }
        
        // 创建新目录
        this.create_dir(targetParentPath, targetName);
        const newDirNode = this.nodes.get(newPath);
        
        if (!newDirNode) {
            KernelLogger.error("NodeTree", `failed to create target directory ${newPath}`);
            return false;
        }
        
        // 复制所有文件
        if (sourceNode.attributes) {
            for (const fileName in sourceNode.attributes) {
                const sourceFile = sourceNode.attributes[fileName];
                const FileTypeRef = getFileType();
                if (!FileTypeRef) {
                    KernelLogger.error("NodeTree", "FileType not available for file read operation");
                    return;
                }
                const fileContent = sourceNode.optFile(FileTypeRef.FILE_OPS.READ, sourceFile);
                
                // 创建新文件对象
                let newFile;
                if (typeof FileFormwork !== "undefined" && typeof FileType !== "undefined") {
                    const FileTypeRef = getFileType();
                    const fileType = sourceFile.fileType || (FileTypeRef && FileTypeRef.GENRE ? FileTypeRef.GENRE.TEXT : 0);
                    // 保留源文件的属性（如果存在）
                    const fileAttributes = sourceFile.fileAttributes !== undefined ? sourceFile.fileAttributes : 
                                         (FileTypeRef && FileTypeRef.FILE_ATTRIBUTES ? FileTypeRef.FILE_ATTRIBUTES.NORMAL : null);
                    newFile = new FileFormwork(fileType, fileName, fileContent || '', newPath, fileAttributes);
                } else {
                    newFile = {
                        fileName: fileName,
                        fileSize: sourceFile.fileSize || 0,
                        fileContent: sourceFile.fileContent ? [...sourceFile.fileContent] : [],
                        fileType: sourceFile.fileType,
                        fileAttributes: sourceFile.fileAttributes !== undefined ? sourceFile.fileAttributes : 0,
                        fileCreatTime: new Date().getTime(),
                        fileModifyTime: new Date().getTime(),
                        filePath: newPath,
                        fileBelongDisk: newPath.split('/')[0],
                        inited: true,
                    };
                    if (fileContent !== null && fileContent !== undefined) {
                        newFile.fileContent = fileContent.split('\n');
                        newFile.fileSize = fileContent.length;
                    }
                }
                
                newDirNode.optFile(FileType.FILE_OPS.CREATE, newFile);
            }
        }
        
        // 递归复制所有子目录
        if (sourceNode.children) {
            sourceNode.children.forEach((childValue, childKey) => {
                let childPath;
                if (typeof childValue === 'object' && typeof childValue.path === 'function') {
                    childPath = childValue.path();
                } else if (typeof childValue === 'string') {
                    childPath = childValue;
                } else {
                    return; // 跳过无效的子节点
                }
                
                // 递归复制子目录
                this.copy_dir(childPath, newPath, childKey);
            });
        }
        
        KernelLogger.info("NodeTree", `copied dir ${sourcePath} to ${newPath}`);
        
        // 刷新磁盘使用情况
        try {
            if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                Disk.update();
            }
        } catch (e) {}
        // 自动保存到 PHP 文件系统（异步，不阻塞）
        this._saveToLocalStorage().catch(e => {
            KernelLogger.warn("NodeTree", `保存文件系统数据失败: ${e.message}`);
        });
        return true;
    }

    // 操作节点
    optNode(type, path, node) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized optNode");
            return;
        }
        KernelLogger.debug("NodeTree", `optNode ${path}`);
        const parentNode = this.nodes.get(path);
        if (!parentNode) {
            KernelLogger.warn("NodeTree", `optNode: 父节点不存在: ${path}`);
            return;
        }
        const endCall = parentNode.optChild(type, node);
        if (!endCall) {
            KernelLogger.warn("NodeTree", `optNode: optChild 返回 null，操作失败`);
            return;
        }
        switch (endCall.operation) {
            case FileType.DIR_OPS.CREATE:
                this.nodes.set(node.path(), node);
                // 为新创建的目录节点设置元信息（创建时间/修改时间）
                try {
                    node.__meta = node.__meta || {};
                    node.__meta.ctime =
                        node.__meta.ctime || new Date().getTime();
                    node.__meta.mtime =
                        node.__meta.mtime || new Date().getTime();
                } catch (e) {}
                    KernelLogger.info("NodeTree", `added node ${node.path()} initialized meta`);
                try {
                    if (
                        typeof Disk !== "undefined" &&
                        typeof Disk.update === "function"
                    )
                        Disk.update();
                } catch (e) {}
                // 自动保存到 localStorage
                this._saveToLocalStorage();
                break;
            case FileType.DIR_OPS.DELETE:
                this.nodes.delete(node.path());
                KernelLogger.info("NodeTree", `deleted node ${node.path()}`);
                try {
                    if (
                        typeof Disk !== "undefined" &&
                        typeof Disk.update === "function"
                    )
                        Disk.update();
                } catch (e) {}
                // 自动保存到 localStorage
                this._saveToLocalStorage();
                break;
            case FileType.DIR_OPS.RENAME:
                // 重命名目录：更新nodes中的键
                const oldPath = node.oldPath || node.path();
                const newPath = node.newPath || node.path();
                if (this.nodes.has(oldPath)) {
                    const nodeObj = this.nodes.get(oldPath);
                    this.nodes.delete(oldPath);
                    // 更新节点的路径信息
                    nodeObj.name = node.newName;
                    this.nodes.set(newPath, nodeObj);
                    // 更新目录修改时间
                    try {
                        nodeObj.__meta = nodeObj.__meta || {};
                        nodeObj.__meta.mtime = new Date().getTime();
                    } catch (e) {}
                    KernelLogger.info("NodeTree", `renamed node ${oldPath} to ${newPath}`);
                }
                try {
                    if (
                        typeof Disk !== "undefined" &&
                        typeof Disk.update === "function"
                    )
                        Disk.update();
                } catch (e) {}
                // 自动保存到 localStorage
                this._saveToLocalStorage();
                break;
        }
    }

    // 遍历迭代
    list_dir(path) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized list_dir");
            return;
        }
        KernelLogger.debug("NodeTree", `list_dir ${path}`);
        const target = this.nodes.get(path);
        if (!target) {
            KernelLogger.warn("NodeTree", `list_dir: 节点不存在 ${path}`);
            return [];
        }
        const result = [];
        // children 现在可能保存 node 对象或路径字符串（兼容旧数据），需兼容处理
        target.children.forEach((childValue, childKey) => {
            if (
                childValue &&
                typeof childValue === "object" &&
                typeof childValue.path === "function"
            ) {
                result.push({
                    name: childKey,
                    path: childValue.path(),
                    type: "dir",
                    node: childValue,
                });
            } else if (typeof childValue === "string") {
                // 通过集合查找对应节点以获取更多信息
                const childNode = this.nodes.get(childValue);
                if (childNode) {
                    result.push({
                        name: childKey,
                        path: childValue,
                        type: "dir",
                        node: childNode,
                    });
                } else {
                    result.push({
                        name: childKey,
                        path: childValue,
                        type: "dir",
                        node: null,
                    });
                }
            } else {
                result.push({
                    name: childKey,
                    path: path + "/" + childKey,
                    type: "dir",
                    node: null,
                });
            }
        });
        KernelLogger.debug("NodeTree", `list_dir returned ${result.length} dirs for ${path}`);
        return result;
    }
    list_file(path) {
        if (!this.initialized) {
            KernelLogger.warn("NodeTree", "not initialized list_file");
            return;
        }
        KernelLogger.debug("NodeTree", `list_file ${path}`);
        const target = this.nodes.get(path);
        if (!target) {
            KernelLogger.warn("NodeTree", `list_file: 节点不存在 ${path}`);
            return [];
        }
        const result = [];
        for (const fileName in target.attributes) {
            const f = target.attributes[fileName];
            result.push({
                name: fileName,
                size: f && f.fileSize ? f.fileSize : 0,
                path: path + "/" + fileName,
                file: f,
            });
        }
        KernelLogger.debug("NodeTree", `list_file returned ${result.length} files for ${path}`);
        return result;
    }

    // 计算已使用空间
    usedSpace() {
        KernelLogger.debug("NodeTree", "compute usedSpace");
        let usedSize = 0;
        this.nodes.forEach((value, key) => {
            // 计算文件大小（排除链接文件，链接文件不占用磁盘空间）
            for (const fileName in value.attributes) {
                const file = value.attributes[fileName];
                // 跳过链接文件（linkTarget 不为 null 或 undefined 的文件）
                if (file && (file.linkTarget === null || file.linkTarget === undefined)) {
                    usedSize += file.fileSize || 0;
                } else {
                    // 链接文件不占用空间，但记录日志用于调试
                    KernelLogger.debug("NodeTree", `跳过链接文件 ${key}/${fileName} (linkTarget: ${file?.linkTarget})`);
                }
            }
        });
        KernelLogger.info("NodeTree", `usedSpace ${usedSize} (已排除链接文件)`);
        return usedSize;
    }
}

// 不导出到全局作用域，交由POOL管理
// 通过POOL注册（如果POOL已加载）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        // 确保 KERNEL_GLOBAL_POOL 类别存在
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "NodeTreeCollection", NodeTreeCollection);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.NodeTreeCollection = NodeTreeCollection;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.NodeTreeCollection = NodeTreeCollection;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.NodeTreeCollection = NodeTreeCollection;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.NodeTreeCollection = NodeTreeCollection;
    }
}

DependencyConfig.publishSignal("../kernel/filesystem/nodeTree.js");
