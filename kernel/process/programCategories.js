// 程序类别配置表
// 用于管理所有程序的分类，支持通过元数据指定类别
// 无法解析的类别将自动归类到"其他程序"

/**
 * 程序类别定义
 * 类别ID -> 类别名称映射
 */
const PROGRAM_CATEGORIES = {
    'system': '系统应用',
    'utility': '轻松使用',
    'other': '其他程序',
    'all': '全部程序'
};

/**
 * 程序类别映射表
 * 程序名称 -> 类别ID映射
 * 如果程序在元数据中指定了category，则优先使用元数据
 * 如果元数据中没有category，则使用此表进行映射
 * 如果此表中也没有，则归类到"其他程序"
 */
const PROGRAM_CATEGORY_MAP = {
    // 系统应用
    'terminal': 'system',      // 终端
    'taskmanager': 'system',   // 任务管理器
    'filemanager': 'system',   // 文件管理器
    
    // 轻松使用
    'vim': 'utility',          // Vim编辑器
    'browser': 'utility',      // 浏览器
    
    // 其他程序（默认）
    'snake': 'other'           // 贪吃蛇游戏
};

/**
 * 获取程序的类别
 * @param {string} programName 程序名称
 * @param {Object} metadata 程序元数据（可选）
 * @returns {string} 类别ID
 */
function getProgramCategory(programName, metadata = null) {
    // 优先使用元数据中的category
    if (metadata && metadata.category) {
        const category = metadata.category;
        // 验证类别是否有效
        if (PROGRAM_CATEGORIES.hasOwnProperty(category)) {
            return category;
        }
        // 如果类别无效，归类到"其他程序"
        return 'other';
    }
    
    // 如果元数据中没有category，使用映射表
    if (PROGRAM_CATEGORY_MAP.hasOwnProperty(programName)) {
        return PROGRAM_CATEGORY_MAP[programName];
    }
    
    // 默认归类到"其他程序"
    return 'other';
}

/**
 * 获取类别名称
 * @param {string} categoryId 类别ID
 * @returns {string} 类别名称
 */
function getCategoryName(categoryId) {
    return PROGRAM_CATEGORIES[categoryId] || '其他程序';
}

/**
 * 获取所有类别
 * @returns {Array<Object>} 类别列表 [{ id, name }]
 */
function getAllCategories() {
    return Object.keys(PROGRAM_CATEGORIES).map(id => ({
        id: id,
        name: PROGRAM_CATEGORIES[id]
    }));
}

// 导出到全局作用域（如果POOL可用，也注册到POOL）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "PROGRAM_CATEGORIES", PROGRAM_CATEGORIES);
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "PROGRAM_CATEGORY_MAP", PROGRAM_CATEGORY_MAP);
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "getProgramCategory", getProgramCategory);
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "getCategoryName", getCategoryName);
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "getAllCategories", getAllCategories);
    } catch (e) {
        // 忽略错误
    }
}

// 导出到全局作用域（降级方案）
if (typeof window !== 'undefined') {
    window.PROGRAM_CATEGORIES = PROGRAM_CATEGORIES;
    window.PROGRAM_CATEGORY_MAP = PROGRAM_CATEGORY_MAP;
    window.getProgramCategory = getProgramCategory;
    window.getCategoryName = getCategoryName;
    window.getAllCategories = getAllCategories;
}

// 发布依赖加载完成信号
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/process/programCategories.js");
} else if (typeof document !== 'undefined' && document.body) {
    // 降级方案：直接发布事件
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/process/programCategories.js",
            },
        })
    );
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("ProgramCategories", "已发布依赖加载信号（降级方案）");
    }
} else {
    // 延迟发布信号
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                DependencyConfig.publishSignal("../kernel/process/programCategories.js");
            } else {
                if (document.body) {
                    document.body.dispatchEvent(
                        new CustomEvent("dependencyLoaded", {
                            detail: {
                                name: "../kernel/process/programCategories.js",
                            },
                        })
                    );
                }
            }
        });
    } else {
        setTimeout(() => {
            if (typeof document !== 'undefined' && document.body) {
                if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                    DependencyConfig.publishSignal("../kernel/process/programCategories.js");
                } else {
                    document.body.dispatchEvent(
                        new CustomEvent("dependencyLoaded", {
                            detail: {
                                name: "../kernel/process/programCategories.js",
                            },
                        })
                    );
                }
            }
        }, 0);
    }
}

