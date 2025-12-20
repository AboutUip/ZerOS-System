// 伪枚举量管理器
// 提供统一的枚举量管理接口，支持创建和管理多个枚举集合
// 注意：初始化时不使用 KernelLogger，避免循环依赖

const EnumManager = (() => {
    // 全局计数器，确保所有枚举值的唯一性
    let __GLOBAL_COUNT__ = 0;
    
    // 生成下一个全局唯一常量值
    const nextGlobal = () => __GLOBAL_COUNT__++;
    
    // 枚举注册表，存储所有已注册的枚举
    const enumRegistry = new Map();
    
    /**
     * 创建枚举集合
     * @param {string} enumName - 枚举集合名称
     * @param {Object} enumDefinition - 枚举定义对象，键为枚举名，值为注释（可选）
     * @returns {Object} 冻结的枚举对象
     */
    const createEnum = (enumName, enumDefinition) => {
        if (enumRegistry.has(enumName)) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("EnumManager", `枚举 ${enumName} 已存在，将覆盖`);
            } else {
                console.warn(`[内核][EnumManager] 枚举 ${enumName} 已存在，将覆盖`);
            }
        }
        
        const enumObj = {};
        for (const [key, value] of Object.entries(enumDefinition)) {
            // 如果值是字符串（注释），则生成新值
            if (typeof value === 'string') {
                enumObj[key] = nextGlobal();
            } else if (typeof value === 'number') {
                // 如果值是数字，使用该数字，但确保计数器不小于该值（避免后续冲突）
                enumObj[key] = value;
                if (value >= __GLOBAL_COUNT__) {
                    __GLOBAL_COUNT__ = value + 1;
                }
            } else {
                // 其他情况使用下一个全局值
                enumObj[key] = value !== undefined ? value : nextGlobal();
            }
        }
        
        const frozenEnum = Object.freeze(enumObj);
        enumRegistry.set(enumName, frozenEnum);
        // 如果 KernelLogger 已加载，记录日志
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("EnumManager", `创建枚举: ${enumName}`, { keys: Object.keys(enumObj) });
        }
        return frozenEnum;
    };
    
    /**
     * 获取已注册的枚举
     * @param {string} enumName - 枚举集合名称
     * @returns {Object|null} 枚举对象，如果不存在则返回 null
     */
    const getEnum = (enumName) => {
        return enumRegistry.get(enumName) || null;
    };
    
    /**
     * 检查枚举是否存在
     * @param {string} enumName - 枚举集合名称
     * @returns {boolean}
     */
    const hasEnum = (enumName) => {
        return enumRegistry.has(enumName);
    };
    
    /**
     * 获取所有已注册的枚举名称
     * @returns {Array<string>}
     */
    const getAllEnumNames = () => {
        return Array.from(enumRegistry.keys());
    };
    
    // 导出冻结的管理器对象
    return Object.freeze({
        createEnum,
        getEnum,
        hasEnum,
        getAllEnumNames,
        // 导出 next 函数供需要独立计数器的场景使用
        next: nextGlobal,
    });
})();

// 不导出到全局作用域，交由POOL管理
// 通过POOL注册（如果POOL已加载）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        // 确保 TYPE_POOL 类别存在
        if (!POOL.__HAS__("TYPE_POOL")) {
            POOL.__INIT__("TYPE_POOL");
        }
        POOL.__ADD__("TYPE_POOL", "EnumManager", EnumManager);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.EnumManager = EnumManager;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.EnumManager = EnumManager;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.EnumManager = EnumManager;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.EnumManager = EnumManager;
    }
}

DependencyConfig.publishSignal("../kernel/core/typePool/enumManager.js");

