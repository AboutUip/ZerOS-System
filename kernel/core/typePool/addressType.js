// 寻址类型枚举定义
// 使用 EnumManager 统一管理寻址相关的枚举常量
// 注意：初始化时不使用 KernelLogger，避免循环依赖

// 检查 EnumManager 是否已加载
if (typeof EnumManager === 'undefined') {
    console.error("[内核][AddressType] EnumManager 未加载，请确保 enumManager.js 在 addressType.js 之前加载");
    throw new Error("EnumManager is required but not loaded");
}

// 寻址类型枚举
// 注意：这些值需要保持特定的数值，所以使用显式数值
const ADDRESS_TYPE = EnumManager.createEnum("AddressType.TYPE", {
    // 十六进制字符串格式（如 "0x1a2b"）
    HEX: 16,
    // 十进制数字格式（返回数字类型）
    DECIMAL: 10,
});

// 导出 AddressType 对象
const AddressType = Object.freeze({
    TYPE: ADDRESS_TYPE,
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
        POOL.__ADD__("TYPE_POOL", "AddressType", AddressType);
    } catch (e) {
        // POOL 可能还未完全初始化，忽略错误
    }
}

// 发布信号
DependencyConfig.publishSignal("../kernel/core/typePool/addressType.js");

// 初始化完成后，如果 KernelLogger 已加载，记录日志
if (typeof KernelLogger !== 'undefined') {
    KernelLogger.info("AddressType", "模块初始化完成");
} else {
    console.log("[内核][AddressType] 模块初始化完成");
}

