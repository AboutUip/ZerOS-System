// 文件类型枚举定义
// 使用 EnumManager 统一管理所有枚举常量

// 检查 EnumManager 是否已加载
if (typeof EnumManager === 'undefined') {
    console.error("[内核][FileType] EnumManager 未加载，请确保 enumManager.js 在 fileType.js 之前加载");
    throw new Error("EnumManager is required but not loaded");
}

// 文件类型枚举
const GENRE = EnumManager.createEnum("FileType.GENRE", {
    // 文本文档
    TEXT: "文本文档",
    // 图片
    IMAGE: "图片",
    // 代码文件
    CODE: "代码文件",
    // 二进制文件
    BINARY: "二进制文件",
    // JSON 文件
    JSON: "JSON 文件",
    // XML 文件
    XML: "XML 文件",
    // Markdown 文件
    MARKDOWN: "Markdown 文件",
    // 配置文件
    CONFIG: "配置文件",
    // 数据文件
    DATA: "数据文件",
    // 链接文件（符号链接）
    LINK: "链接文件",
    // 未知类型
    UNKNOWN: "未知类型",
});

// 扩展名到文件类型的映射表
const EXTENSION_TO_TYPE = {
    // 文本文件
    'txt': GENRE.TEXT,
    'log': GENRE.TEXT,
    'md': GENRE.MARKDOWN,
    'markdown': GENRE.MARKDOWN,
    'readme': GENRE.TEXT,
    
    // 代码文件
    'js': GENRE.CODE,
    'javascript': GENRE.CODE,
    'ts': GENRE.CODE,
    'typescript': GENRE.CODE,
    'py': GENRE.CODE,
    'python': GENRE.CODE,
    'java': GENRE.CODE,
    'cpp': GENRE.CODE,
    'c': GENRE.CODE,
    'h': GENRE.CODE,
    'hpp': GENRE.CODE,
    'cs': GENRE.CODE,
    'php': GENRE.CODE,
    'rb': GENRE.CODE,
    'go': GENRE.CODE,
    'rs': GENRE.CODE,
    'swift': GENRE.CODE,
    'kt': GENRE.CODE,
    'scala': GENRE.CODE,
    'sh': GENRE.CODE,
    'bash': GENRE.CODE,
    'zsh': GENRE.CODE,
    'fish': GENRE.CODE,
    'ps1': GENRE.CODE,
    'bat': GENRE.CODE,
    'cmd': GENRE.CODE,
    'html': GENRE.CODE,
    'htm': GENRE.CODE,
    'css': GENRE.CODE,
    'scss': GENRE.CODE,
    'sass': GENRE.CODE,
    'less': GENRE.CODE,
    'vue': GENRE.CODE,
    'jsx': GENRE.CODE,
    'tsx': GENRE.CODE,
    'xml': GENRE.XML,
    'xhtml': GENRE.XML,
    
    // JSON 文件
    'json': GENRE.JSON,
    'json5': GENRE.JSON,
    
    // 配置文件
    'ini': GENRE.CONFIG,
    'conf': GENRE.CONFIG,
    'config': GENRE.CONFIG,
    'cfg': GENRE.CONFIG,
    'yaml': GENRE.CONFIG,
    'yml': GENRE.CONFIG,
    'toml': GENRE.CONFIG,
    'properties': GENRE.CONFIG,
    'env': GENRE.CONFIG,
    
    // 图片文件
    'jpg': GENRE.IMAGE,
    'jpeg': GENRE.IMAGE,
    'png': GENRE.IMAGE,
    'gif': GENRE.IMAGE,
    'bmp': GENRE.IMAGE,
    'svg': GENRE.IMAGE,
    'webp': GENRE.IMAGE,
    'ico': GENRE.IMAGE,
    'tiff': GENRE.IMAGE,
    'tif': GENRE.IMAGE,
    
    // 数据文件
    'csv': GENRE.DATA,
    'tsv': GENRE.DATA,
    'sql': GENRE.DATA,
    'db': GENRE.DATA,
    'sqlite': GENRE.DATA,
    
    // 二进制文件
    'exe': GENRE.BINARY,
    'dll': GENRE.BINARY,
    'so': GENRE.BINARY,
    'dylib': GENRE.BINARY,
    'bin': GENRE.BINARY,
    'dat': GENRE.BINARY,
    'zip': GENRE.BINARY,
    'tar': GENRE.BINARY,
    'gz': GENRE.BINARY,
    'rar': GENRE.BINARY,
    '7z': GENRE.BINARY,
};

// 根据文件名获取文件类型
const getFileTypeByExtension = (filename) => {
    if (!filename || typeof filename !== 'string') {
        return GENRE.UNKNOWN;
    }
    
    // 提取扩展名（不区分大小写）
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === filename.length - 1) {
        // 没有扩展名，默认为文本文件
        return GENRE.TEXT;
    }
    
    const ext = filename.substring(lastDot + 1).toLowerCase();
    return EXTENSION_TO_TYPE[ext] || GENRE.UNKNOWN;
};

// 目录操作枚举
const DIR_OPERATION = EnumManager.createEnum("FileType.DIR_OPS", {
    // 创建目录
    CREATE: "创建目录",
    // 删除目录
    DELETE: "删除目录",
    // 重命名目录
    RENAME: "重命名目录"
});

// 文件操作枚举
const FILE_OPERATION = EnumManager.createEnum("FileType.FILE_OPS", {
    // 创建文件
    CREATE: "创建文件",
    // 删除文件
    DELETE: "删除文件",
    // 读取文件
    READ: "读取文件",
    // 写入文件
    WRITE: "写入文件",
    // 重命名文件
    RENAME: "重命名文件"
});

// 数据写入模式枚举
const WRITE_MODE = EnumManager.createEnum("FileType.WRITE_MODES", {
    // 覆盖写入
    OVERWRITE: "覆盖写入",
    // 追加写入
    APPEND: "追加写入",
});

// 文件/目录属性标志位（位标志，可以组合使用）
const FILE_ATTRIBUTES = EnumManager.createEnum("FileType.FILE_ATTRIBUTES", {
    // 基础属性
    NORMAL: 0,                    // 正常，所有操作都允许
    
    // 读取相关
    READ_ONLY: 1,                 // 只读，可以读取，但不能修改或删除
    NO_READ: 2,                   // 不可读，不能读取，但可以修改或删除
    
    // 删除相关
    NO_DELETE: 4,                  // 不可删除，可以读取和修改，但不能删除
    
    // 移动/重命名相关
    NO_MOVE: 8,                   // 不可移动，可以读取、修改、删除，但不能移动或重命名
    NO_RENAME: 16,                // 不可重命名，可以读取、修改、删除、移动，但不能重命名
});

// 目录属性枚举（与文件属性使用相同的标志位）
const DIR_ATTRIBUTES = FILE_ATTRIBUTES;

// 导出 FileType 对象（保持向后兼容）
const FileType = Object.freeze({
    GENRE: GENRE,
    DIR_OPS: DIR_OPERATION,
    FILE_OPS: FILE_OPERATION,
    WRITE_MODES: WRITE_MODE,
    FILE_ATTRIBUTES: FILE_ATTRIBUTES,
    DIR_ATTRIBUTES: DIR_ATTRIBUTES,  // 目录属性（与文件属性使用相同的标志位）
    // 导出扩展名映射表（只读）
    getFileTypeByExtension: getFileTypeByExtension,
});

// 不导出到全局作用域，交由 EnumManager 和 POOL 管理
// 通过 EnumManager 注册
if (typeof EnumManager !== 'undefined') {
    // EnumManager 已经通过 createEnum 注册了枚举，这里不需要额外操作
}

// 通过 POOL 注册（如果 POOL 已加载）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        // 确保 TYPE_POOL 类别存在
        if (!POOL.__HAS__("TYPE_POOL")) {
            POOL.__INIT__("TYPE_POOL");
        }
        POOL.__ADD__("TYPE_POOL", "FileType", FileType);
    } catch (e) {
        // POOL 可能还未完全初始化，忽略错误
    }
}

// 发布信号
DependencyConfig.publishSignal("../kernel/typePool/fileType.js");

// 初始化完成后，如果 KernelLogger 已加载，记录日志
if (typeof KernelLogger !== 'undefined') {
    KernelLogger.info("FileType", "模块初始化完成");
} else {
    console.log("[内核][FileType] 模块初始化完成");
}

