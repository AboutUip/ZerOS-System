// 文件模板类
KernelLogger.info("FileFormwork", "module init");
class FileFormwork {
    // fileType = [enum]   描述文件类型
    // fileSize = [long]   描述文件大小
    // fileName = [String] 描述文件名字
    // fileCreatTime = [int] 描述文件创建时间
    // fileContent = []    描述文件内容
    // filePath = [String]  描述文件路径
    // fileBelongDisk = [String] 描述文件所属盘符
    // fileAttributes = [enum] 描述文件属性（只读、不可读等）
    constructor(filetype, filename, filecontent, path, fileAttributes = null, linkTarget = null) {
        KernelLogger.info("FileFormwork", `init ${filename}`);
        // 文件类型
        this.fileType = filetype;
        // 文件大小
        this.fileSize = filecontent.length;
        // 文件名称
        this.fileName = filename;
        // 文件创建时间
        this.fileCreatTime = new Date().getTime();
        // 文件内容
        this.fileContent = [];
        // 从属于哪个盘符
        this.fileBelongDisk = path.split("/")[0];
        for (let content of filecontent.split(/\n/)) {
            this.fileContent.push(content);
        }
        // 文件路径
        this.filePath = path;
        // 链接目标（如果是链接文件）
        this.linkTarget = linkTarget || null;
        // 文件属性（默认为正常，使用位标志）
        // 尝试从 FileType 获取 FILE_ATTRIBUTES，如果不可用则使用默认值
        let FileTypeRef = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                FileTypeRef = POOL.__GET__("TYPE_POOL", "FileType");
            } catch (e) {}
        }
        if (!FileTypeRef && typeof FileType !== 'undefined') {
            FileTypeRef = FileType;
        }
        // 如果是链接文件，自动设置为只读、不可删除、不可移动、不可重命名
        if (linkTarget !== null && linkTarget !== undefined) {
            // 链接文件：只读 + 不可删除 + 不可移动 + 不可重命名
            if (FileTypeRef && FileTypeRef.FILE_ATTRIBUTES) {
                this.fileAttributes = FileTypeRef.FILE_ATTRIBUTES.READ_ONLY | 
                                     FileTypeRef.FILE_ATTRIBUTES.NO_DELETE | 
                                     FileTypeRef.FILE_ATTRIBUTES.NO_MOVE | 
                                     FileTypeRef.FILE_ATTRIBUTES.NO_RENAME;
            } else {
                this.fileAttributes = 1 | 4 | 8 | 16; // 降级：使用位标志值
            }
        } else if (fileAttributes !== null && fileAttributes !== undefined) {
            this.fileAttributes = fileAttributes;
        } else if (FileTypeRef && FileTypeRef.FILE_ATTRIBUTES) {
            this.fileAttributes = FileTypeRef.FILE_ATTRIBUTES.NORMAL;
        } else {
            this.fileAttributes = 0; // 降级：使用 0 表示正常
        }
        // 是否被初始化
        this.inited = false;
        // 等待依赖项初始化
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
                    KernelLogger.debug("FileFormwork", `fileType 已加载，直接初始化 ${filename}`);
                    this.inited = true;
                } else {
                    // 如果未加载，等待加载
                    Dependency.waitLoaded("../kernel/typePool/fileType.js", {
                        interval: 50,
                        timeout: 2000,
                    })
                    .then(() => {
                        this.inited = true;
                        KernelLogger.info("FileFormwork", `deps loaded ${filename}`);
                    })
                    .catch((e) => {
                        KernelLogger.warn("FileFormwork", `等待 fileType 超时，直接初始化 ${filename}`, String(e));
                        // 即使失败也标记为已初始化，避免阻塞
                        this.inited = true;
                    });
                }
            } else {
                // 如果 Dependency 不可用，检查 fileType 是否已加载
                // 通过 POOL 或全局对象检查 FileType
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
                    KernelLogger.debug("FileFormwork", `fileType 已加载，直接初始化 ${filename}`);
                } else {
                    KernelLogger.debug("FileFormwork", `Dependency 不可用，直接初始化 ${filename}`);
                }
                this.inited = true;
            }
        } catch (e) {
            KernelLogger.error("FileFormwork", `等待依赖失败 ${filename}`, String(e));
            this.inited = true;
        }
        KernelLogger.info("FileFormwork", `init complete ${filename}`);
    }

    // 刷新信息
    refreshInfo() {
        KernelLogger.debug("FileFormwork", `refresh ${this.fileName} start`);
        this.fileSize = 0;
        for (let line of this.fileContent) {
            this.fileSize += line.length;
        }
        KernelLogger.debug("FileFormwork", `refresh ${this.fileName} complete`);
    }

    // 读取文件
    readFile() {
        // 检查文件属性：如果文件不可读，则拒绝读取
        let FileTypeRef = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                FileTypeRef = POOL.__GET__("TYPE_POOL", "FileType");
            } catch (e) {}
        }
        if (!FileTypeRef && typeof FileType !== 'undefined') {
            FileTypeRef = FileType;
        }
        
        if (FileTypeRef && FileTypeRef.FILE_ATTRIBUTES) {
            const attrs = FileTypeRef.FILE_ATTRIBUTES;
            // 检查 NO_READ 标志位（位 2）
            if ((this.fileAttributes & attrs.NO_READ) !== 0) {
                KernelLogger.warn("FileFormwork", `读取被拒绝: 文件 ${this.fileName} 不可读 (属性: ${this.fileAttributes})`);
                throw new Error(`文件 ${this.fileName} 不可读`);
            }
        }
        
        KernelLogger.debug("FileFormwork", `read ${this.fileName} start`);
        let content = "";
        for (let line of this.fileContent) {
            content += line + "\n";
        }
        KernelLogger.debug("FileFormwork", `read ${this.fileName} complete`);
        return content;
    }

    // 写入文件
    writeFile(newContent, writeMod) {
        // 检查依赖加载情况
        if (!this.inited) {
            KernelLogger.warn("FileFormwork", `write cancelled deps not loaded ${this.fileName}`);
            return;
        }
        
        // 检查文件属性：如果文件只读，则拒绝写入
        let FileTypeRef = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                FileTypeRef = POOL.__GET__("TYPE_POOL", "FileType");
            } catch (e) {}
        }
        if (!FileTypeRef && typeof FileType !== 'undefined') {
            FileTypeRef = FileType;
        }
        
        if (FileTypeRef && FileTypeRef.FILE_ATTRIBUTES) {
            const attrs = FileTypeRef.FILE_ATTRIBUTES;
            // 检查 READ_ONLY 标志位（位 1）
            if ((this.fileAttributes & attrs.READ_ONLY) !== 0) {
                KernelLogger.warn("FileFormwork", `写入被拒绝: 文件 ${this.fileName} 为只读 (属性: ${this.fileAttributes})`);
                throw new Error(`文件 ${this.fileName} 为只读，无法修改`);
            }
        }
        
        KernelLogger.info("FileFormwork", `write start ${this.fileName}`);
        // 在检查空间之前，先更新磁盘使用情况（确保数据是最新的）
        try {
            if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                Disk.update();
            }
        } catch (e) {
            KernelLogger.debug("FileFormwork", `更新磁盘使用情况失败: ${e.message}`);
        }
        // 计算写入内容是否超出该盘符剩余空间
        // 确保 diskFreeMap 是最新的（强制刷新缓存）
        let diskFreeMap = Disk.diskFreeMap;
        if (!diskFreeMap || !(diskFreeMap instanceof Map)) {
            KernelLogger.warn("FileFormwork", `diskFreeMap 不可用，无法检查空间: ${this.fileBelongDisk}`);
            throw new Error(`diskFreeMap 不可用，无法检查空间`);
        }
        let finalFreeSize = diskFreeMap.get(this.fileBelongDisk);
        if (finalFreeSize === undefined || finalFreeSize === null) {
            KernelLogger.warn("FileFormwork", `分区 ${this.fileBelongDisk} 不在 diskFreeMap 中，当前 Map 键: ${Array.from(diskFreeMap.keys()).join(', ')}`);
            // 如果分区不在 diskFreeMap 中，尝试再次更新
            try {
                if (typeof Disk !== "undefined" && typeof Disk.update === "function") {
                    Disk.update();
                    // 重新获取 diskFreeMap（因为 update 可能更新了缓存）
                    diskFreeMap = Disk.diskFreeMap;
                    finalFreeSize = diskFreeMap.get(this.fileBelongDisk);
                    if (finalFreeSize === undefined || finalFreeSize === null) {
                        throw new Error(`分区 ${this.fileBelongDisk} 在更新后仍不在 diskFreeMap 中`);
                    }
                    KernelLogger.debug("FileFormwork", `分区 ${this.fileBelongDisk} 在更新后找到，剩余空间: ${finalFreeSize}`);
                } else {
                    throw new Error(`分区 ${this.fileBelongDisk} 不在 diskFreeMap 中，且 Disk.update 不可用`);
                }
            } catch (e) {
                KernelLogger.error("FileFormwork", `无法获取分区 ${this.fileBelongDisk} 的剩余空间: ${e.message}`);
                throw new Error(`无法获取分区 ${this.fileBelongDisk} 的剩余空间: ${e.message}`);
            }
        }
        // 确保 finalFreeSize 是数字
        finalFreeSize = finalFreeSize || 0;
        // 计算当前文件大小
        const currentFileSize = this.fileSize || 0;
        // 计算新内容大小
        const newContentSize = newContent.length;
        switch (writeMod) {
            // 覆盖
            case FileType.WRITE_MODES.OVERWRITE:
                // 覆盖模式：考虑当前文件占用的空间会被释放
                // 实际需要的额外空间 = 新内容大小 - 当前文件大小
                // 如果新内容比当前文件小，甚至不需要额外空间（可能为负数，表示会释放空间）
                const additionalSpaceNeeded = newContentSize - currentFileSize;
                if (additionalSpaceNeeded <= finalFreeSize) {
                    KernelLogger.debug("FileFormwork", `write space ok ${this.fileName} (current: ${currentFileSize}, new: ${newContentSize}, free: ${finalFreeSize}, needed: ${additionalSpaceNeeded})`);
                    this.fileContent = [];
                    for (let content of newContent.split(/\n/)) {
                        this.fileContent.push(content);
                    }
                    this.fileSize = newContent.length;
                    KernelLogger.info("FileFormwork", `write complete ${this.fileName}`);
                    this.refreshInfo();
                } else {
                    KernelLogger.warn("FileFormwork", `write space insufficient ${this.fileName} (current: ${currentFileSize}, new: ${newContentSize}, free: ${finalFreeSize}, needed: ${additionalSpaceNeeded})`);
                    throw new Error(`写入空间不足: 需要额外 ${additionalSpaceNeeded} 字节，但只有 ${finalFreeSize} 字节可用`);
                }
                break;
            // 追加
            case FileType.WRITE_MODES.APPEND:
                // 追加模式：新内容大小不能超过剩余空间
                if (newContentSize <= finalFreeSize) {
                    KernelLogger.debug("FileFormwork", `append space ok ${this.fileName} (current: ${currentFileSize}, append: ${newContentSize}, free: ${finalFreeSize})`);
                    for (let content of newContent.split(/\n/)) {
                        this.fileContent.push(content);
                    }
                    this.fileSize += newContent.length;
                    KernelLogger.info("FileFormwork", `append complete ${this.fileName}`);
                    this.refreshInfo();
                } else {
                    KernelLogger.warn("FileFormwork", `append space insufficient ${this.fileName} (current: ${currentFileSize}, append: ${newContentSize}, free: ${finalFreeSize})`);
                    throw new Error(`追加空间不足: 需要 ${newContentSize} 字节，但只有 ${finalFreeSize} 字节可用`);
                }
                break;
        }
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
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "FileFormwork", FileFormwork);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.FileFormwork = FileFormwork;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.FileFormwork = FileFormwork;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.FileFormwork = FileFormwork;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.FileFormwork = FileFormwork;
    }
}

DependencyConfig.publishSignal("../kernel/filesystem/fileFramework.js");
