// 日志级别枚举定义
// 使用 EnumManager 统一管理日志相关的枚举常量
// 注意：初始化时不使用 KernelLogger，避免循环依赖

// 检查 EnumManager 是否已加载
if (typeof EnumManager === 'undefined') {
    console.error("[内核][LogLevel] EnumManager 未加载，请确保 enumManager.js 在 logLevel.js 之前加载");
    throw new Error("EnumManager is required but not loaded");
}

// 日志级别数值枚举（用于比较和设置）
// 注意：这些值需要保持特定的数值顺序，所以使用显式数值
const LOG_LEVEL = EnumManager.createEnum("LogLevel.LEVEL", {
    // 无日志
    NONE: 0,
    // 仅错误
    ERROR: 1,
    // 信息和错误
    INFO: 2,
    // 调试、信息和错误
    DEBUG: 3,
});

// 日志级别名称枚举（用于日志输出）
const LOG_LEVEL_NAME = EnumManager.createEnum("LogLevel.NAME", {
    // 调试级别
    DEBUG: "DEBUG",
    // 信息级别
    INFO: "INFO",
    // 警告级别
    WARN: "WARN",
    // 错误级别
    ERROR: "ERROR",
});

// 导出 LogLevel 对象
const LogLevel = Object.freeze({
    LEVEL: LOG_LEVEL,
    NAME: LOG_LEVEL_NAME,
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
        POOL.__ADD__("TYPE_POOL", "LogLevel", LogLevel);
    } catch (e) {
        // POOL 可能还未完全初始化，忽略错误
    }
}

// 发布信号
DependencyConfig.publishSignal("../kernel/typePool/logLevel.js");

// 初始化完成后，如果 KernelLogger 已加载，记录日志
if (typeof KernelLogger !== 'undefined') {
    KernelLogger.info("LogLevel", "模块初始化完成");
} else {
    console.log("[内核][LogLevel] 模块初始化完成");
}

