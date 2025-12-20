// 应用程序资源管理器
// 负责管理 APPLICATION_ASSETS，提供统一的 API 来操作程序资源
// 由进程管理器管控

KernelLogger.info("ApplicationAssetManager", "模块初始化");

class ApplicationAssetManager {
    /**
     * 初始化应用程序资源管理器
     * @returns {Promise<void>}
     */
    static async init() {
        ApplicationAssetManager._log(2, "初始化应用程序资源管理器");
        
        // 从 POOL 获取 APPLICATION_ASSETS
        let applicationAssets = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                applicationAssets = POOL.__GET__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS");
            } catch (e) {
                ApplicationAssetManager._log(1, `获取APPLICATION_ASSETS失败: ${e.message}`);
            }
        }
        
        // 如果 POOL 中没有，尝试从全局对象获取
        if (!applicationAssets && typeof APPLICATION_ASSETS !== 'undefined') {
            applicationAssets = APPLICATION_ASSETS;
        }
        
        // 如果仍然没有，创建空对象
        if (!applicationAssets) {
            applicationAssets = {};
        }
        
        // 存储到内部
        ApplicationAssetManager._assets = applicationAssets;
        
        // 注册到 POOL
        ApplicationAssetManager._registerToPool();
        
        ApplicationAssetManager._log(2, "应用程序资源管理器初始化完成", {
            programCount: Object.keys(applicationAssets).length
        });
    }
    
    /**
     * 注册到 POOL
     */
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                    POOL.__INIT__("KERNEL_GLOBAL_POOL");
                }
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "ApplicationAssetManager", ApplicationAssetManager);
            } catch (e) {
                ApplicationAssetManager._log(1, `注册到POOL失败: ${e.message}`);
            }
        }
    }
    
    /**
     * 获取内部资源对象（只读）
     * @returns {Object} 应用程序资源对象
     */
    static getAssets() {
        return ApplicationAssetManager._assets || {};
    }
    
    /**
     * 获取指定程序的资源
     * @param {string} programName 程序名称
     * @returns {Object|null} 程序资源对象，如果不存在则返回 null
     */
    static getProgram(programName) {
        if (!programName || typeof programName !== 'string') {
            return null;
        }
        
        const assets = ApplicationAssetManager.getAssets();
        return assets[programName] || null;
    }
    
    /**
     * 检查程序是否存在
     * @param {string} programName 程序名称
     * @returns {boolean} 是否存在
     */
    static hasProgram(programName) {
        if (!programName || typeof programName !== 'string') {
            return false;
        }
        
        const assets = ApplicationAssetManager.getAssets();
        return programName in assets;
    }
    
    /**
     * 获取程序的脚本路径
     * @param {string} programName 程序名称
     * @returns {string|null} 脚本路径
     */
    static getScriptPath(programName) {
        const program = ApplicationAssetManager.getProgram(programName);
        if (!program) {
            return null;
        }
        
        // 支持简单格式（字符串）和完整格式（对象）
        if (typeof program === 'string') {
            return program;
        } else if (typeof program === 'object' && program !== null) {
            return program.script || program.path || null;
        }
        
        return null;
    }
    
    /**
     * 获取程序的样式表路径列表
     * @param {string} programName 程序名称
     * @returns {Array<string>} 样式表路径数组
     */
    static getStyles(programName) {
        const program = ApplicationAssetManager.getProgram(programName);
        if (!program || typeof program !== 'object') {
            return [];
        }
        
        return Array.isArray(program.styles) ? program.styles : [];
    }
    
    /**
     * 获取程序的图标路径
     * @param {string} programName 程序名称
     * @returns {string|null} 图标路径
     */
    static getIcon(programName) {
        const program = ApplicationAssetManager.getProgram(programName);
        if (!program || typeof program !== 'object') {
            return null;
        }
        
        return program.icon || null;
    }
    
    /**
     * 获取程序的元数据
     * @param {string} programName 程序名称
     * @returns {Object|null} 元数据对象
     */
    static getMetadata(programName) {
        const program = ApplicationAssetManager.getProgram(programName);
        if (!program || typeof program !== 'object') {
            return null;
        }
        
        return program.metadata || null;
    }
    
    /**
     * 获取程序的所有信息（脚本、样式、图标、元数据）
     * @param {string} programName 程序名称
     * @returns {Object|null} 程序信息对象 { script, styles, icon, metadata }
     */
    static getProgramInfo(programName) {
        const program = ApplicationAssetManager.getProgram(programName);
        if (!program) {
            return null;
        }
        
        // 解析资源（支持简单格式和完整格式）
        if (typeof program === 'string') {
            return {
                script: program,
                styles: [],
                assets: [],
                icon: null,
                metadata: {}
            };
        } else if (typeof program === 'object' && program !== null) {
            // assets 支持字符串（单个资源）或数组（多个资源）
            let assets = [];
            if (program.assets) {
                if (typeof program.assets === 'string') {
                    assets = [program.assets];
                } else if (Array.isArray(program.assets)) {
                    assets = program.assets;
                }
            }
            
            return {
                script: program.script || program.path || '',
                styles: Array.isArray(program.styles) ? program.styles : [],
                assets: assets,
                icon: program.icon || null,
                metadata: program.metadata || {}
            };
        }
        
        return null;
    }
    
    /**
     * 列出所有程序名称
     * @returns {Array<string>} 程序名称数组
     */
    static listPrograms() {
        const assets = ApplicationAssetManager.getAssets();
        return Object.keys(assets);
    }
    
    /**
     * 获取所有程序信息
     * @returns {Array<Object>} 程序信息数组 [{ name, script, styles, icon, metadata }]
     */
    static listAllPrograms() {
        const programs = ApplicationAssetManager.listPrograms();
        return programs.map(name => {
            const info = ApplicationAssetManager.getProgramInfo(name);
            return {
                name: name,
                ...info
            };
        });
    }
    
    /**
     * 获取需要自动启动的程序列表（按优先级排序）
     * @returns {Array<Object>} 自动启动程序列表 [{ name, script, styles, icon, metadata, priority }]
     */
    static getAutoStartPrograms() {
        const allPrograms = ApplicationAssetManager.listAllPrograms();
        const autoStartPrograms = allPrograms
            .filter(program => {
                const metadata = program.metadata || {};
                return metadata.autoStart === true;
            })
            .map(program => {
                const metadata = program.metadata || {};
                return {
                    ...program,
                    priority: metadata.priority !== undefined ? metadata.priority : 999
                };
            })
            .sort((a, b) => a.priority - b.priority);  // 按优先级升序排序
        
        return autoStartPrograms;
    }
    
    /**
     * 获取常显在任务栏的程序列表
     * @returns {Array<Object>} 常显程序列表 [{ name, script, styles, icon, metadata }]
     */
    static getAlwaysShowPrograms() {
        const allPrograms = ApplicationAssetManager.listAllPrograms();
        return allPrograms.filter(program => {
            const metadata = program.metadata || {};
            return metadata.alwaysShowInTaskbar === true;
        });
    }
    
    /**
     * 添加或更新程序资源
     * @param {string} programName 程序名称
     * @param {string|Object} asset 程序资源（字符串路径或对象）
     * @returns {boolean} 是否成功
     */
    static setProgram(programName, asset) {
        if (!programName || typeof programName !== 'string') {
            ApplicationAssetManager._log(1, "程序名称无效");
            return false;
        }
        
        if (!asset) {
            ApplicationAssetManager._log(1, "程序资源无效");
            return false;
        }
        
        // 验证资源格式
        if (typeof asset !== 'string' && (typeof asset !== 'object' || asset === null)) {
            ApplicationAssetManager._log(1, "程序资源格式无效");
            return false;
        }
        
        // 获取资源对象
        let assets = ApplicationAssetManager.getAssets();
        if (!assets) {
            assets = {};
            ApplicationAssetManager._assets = assets;
        }
        
        // 添加或更新
        assets[programName] = asset;
        
        // 同步到 POOL
        ApplicationAssetManager._syncToPool();
        
        ApplicationAssetManager._log(2, `程序资源已更新: ${programName}`);
        return true;
    }
    
    /**
     * 删除程序资源
     * @param {string} programName 程序名称
     * @returns {boolean} 是否成功
     */
    static removeProgram(programName) {
        if (!programName || typeof programName !== 'string') {
            ApplicationAssetManager._log(1, "程序名称无效");
            return false;
        }
        
        const assets = ApplicationAssetManager.getAssets();
        if (!assets || !(programName in assets)) {
            ApplicationAssetManager._log(1, `程序不存在: ${programName}`);
            return false;
        }
        
        delete assets[programName];
        
        // 同步到 POOL
        ApplicationAssetManager._syncToPool();
        
        ApplicationAssetManager._log(2, `程序资源已删除: ${programName}`);
        return true;
    }
    
    /**
     * 验证程序资源格式
     * @param {string|Object} asset 程序资源
     * @returns {Object} 验证结果 { valid: boolean, errors: Array<string> }
     */
    static validateAsset(asset) {
        const errors = [];
        
        if (!asset) {
            errors.push("资源不能为空");
            return { valid: false, errors };
        }
        
        // 简单格式：字符串路径
        if (typeof asset === 'string') {
            if (!asset.trim()) {
                errors.push("脚本路径不能为空");
            }
            return { valid: errors.length === 0, errors };
        }
        
        // 完整格式：对象
        if (typeof asset !== 'object' || asset === null) {
            errors.push("资源格式无效（必须是字符串或对象）");
            return { valid: false, errors };
        }
        
        // 检查 script 或 path
        if (!asset.script && !asset.path) {
            errors.push("缺少脚本路径（script 或 path）");
        }
        
        // 检查 styles（如果存在，必须是数组）
        if (asset.styles !== undefined && !Array.isArray(asset.styles)) {
            errors.push("styles 必须是数组");
        }
        
        // 检查 icon（如果存在，必须是字符串）
        if (asset.icon !== undefined && typeof asset.icon !== 'string') {
            errors.push("icon 必须是字符串");
        }
        
        // 检查 metadata（如果存在，必须是对象）
        if (asset.metadata !== undefined && (typeof asset.metadata !== 'object' || asset.metadata === null)) {
            errors.push("metadata 必须是对象");
        }
        
        return { valid: errors.length === 0, errors };
    }
    
    /**
     * 验证并添加程序资源
     * @param {string} programName 程序名称
     * @param {string|Object} asset 程序资源
     * @returns {Object} 结果 { success: boolean, errors: Array<string> }
     */
    static validateAndSetProgram(programName, asset) {
        const validation = ApplicationAssetManager.validateAsset(asset);
        if (!validation.valid) {
            return { success: false, errors: validation.errors };
        }
        
        const success = ApplicationAssetManager.setProgram(programName, asset);
        return { success, errors: [] };
    }
    
    /**
     * 同步资源到 POOL
     */
    static _syncToPool() {
        const assets = ApplicationAssetManager.getAssets();
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                    POOL.__INIT__("KERNEL_GLOBAL_POOL");
                }
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS", assets);
            } catch (e) {
                ApplicationAssetManager._log(1, `同步到POOL失败: ${e.message}`);
            }
        }
    }
    
    /**
     * 刷新资源（从 POOL 重新加载）
     * @returns {boolean} 是否成功
     */
    static refresh() {
        ApplicationAssetManager._log(2, "刷新应用程序资源");
        
        let applicationAssets = null;
        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
            try {
                applicationAssets = POOL.__GET__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS");
            } catch (e) {
                ApplicationAssetManager._log(1, `刷新失败: ${e.message}`);
                return false;
            }
        }
        
        if (!applicationAssets && typeof APPLICATION_ASSETS !== 'undefined') {
            applicationAssets = APPLICATION_ASSETS;
        }
        
        if (applicationAssets) {
            ApplicationAssetManager._assets = applicationAssets;
            ApplicationAssetManager._log(2, "资源刷新成功");
            return true;
        }
        
        ApplicationAssetManager._log(1, "资源刷新失败：未找到资源");
        return false;
    }
    
    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    static getStats() {
        const programs = ApplicationAssetManager.listAllPrograms();
        const autoStartPrograms = ApplicationAssetManager.getAutoStartPrograms();
        
        return {
            totalPrograms: programs.length,
            autoStartPrograms: autoStartPrograms.length,
            programs: programs.map(p => p.name),
            autoStart: autoStartPrograms.map(p => p.name)
        };
    }
    
    /**
     * 日志记录
     */
    static _log(level, message, meta = undefined) {
        if (typeof KernelLogger !== 'undefined') {
            const debugLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.DEBUG) ? LogLevel.LEVEL.DEBUG : 3;
            const infoLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.INFO) ? LogLevel.LEVEL.INFO : 2;
            const errorLevel = (typeof LogLevel !== 'undefined' && LogLevel.LEVEL.ERROR) ? LogLevel.LEVEL.ERROR : 1;
            const debugName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.DEBUG) ? LogLevel.NAME.DEBUG : "DEBUG";
            const infoName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.INFO) ? LogLevel.NAME.INFO : "INFO";
            const errorName = (typeof LogLevel !== 'undefined' && LogLevel.NAME.ERROR) ? LogLevel.NAME.ERROR : "ERROR";
            const lvlName = level >= debugLevel ? debugName : level >= infoLevel ? infoName : errorName;
            KernelLogger.log(lvlName, "ApplicationAssetManager", message, meta);
        }
    }
}

// 内部资源存储
ApplicationAssetManager._assets = null;

// 不导出到全局作用域，交由POOL管理
// 通过POOL注册（如果POOL已加载）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        // 确保 KERNEL_GLOBAL_POOL 类别存在
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "ApplicationAssetManager", ApplicationAssetManager);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.ApplicationAssetManager = ApplicationAssetManager;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.ApplicationAssetManager = ApplicationAssetManager;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.ApplicationAssetManager = ApplicationAssetManager;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.ApplicationAssetManager = ApplicationAssetManager;
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/process/applicationAssetManager.js");
}

