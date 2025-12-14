// DependencyConfig: 依赖管理器
// 依赖: KernelLogger（在 HTML 中已加载）
// 自成一体，可在 HTML 中直接加载

(function() {
    'use strict';
    
    // 检查 KernelLogger 是否已加载
    if (typeof KernelLogger === 'undefined') {
        console.error("[内核][DependencyConfig] KernelLogger 未加载，请确保在 HTML 中先加载 kernelLogger.js");
        throw new Error("KernelLogger is required for DependencyConfig");
    }

class DependencyConfig {
    // dependencies = [];  // 依赖项
    // dependencyMap = new Map();  // 依赖项映射

    /*
     * 依赖映射对象
     * value = {
     *     linked : [bool]    是否被link
     *     inited : [bool]    是否已初始化完成
     *     loaded : [bool]    是否完全加载
     *     expansion : {      扩展项
     *         linktime : [Date]    开始link的时间
     *         inittime : [Date]    完全加载的时间
     *         inde : [int]    依赖索引
     *         name : [String] 依赖项名
     *     }
     * }
     */

    // 依赖映射生成方法
    static generate(name) {
        // 返回默认模板
        return {
            linked: false,
            inited: false,
            loaded: false,
            expansion: {
                name: name,
            },
        };
    }

    // 异步等待指定依赖的 `loaded` 字段变为 true
    // 参数：
    //  - name: 依赖名
    //  - options: { interval(ms) 默认50, timeout(ms) 默认5000 }
    waitLoaded(name, options = {}) {
        const interval =
            typeof options.interval === "number" ? options.interval : 50;
        const timeout =
            typeof options.timeout === "number" ? options.timeout : 5000;
        KernelLogger.info("DependencyConfig", `等待加载: ${name}`);

        return new Promise((resolve, reject) => {
            // 已经加载
            const entry = this.dependencyMap.get(name);
            if (entry && entry.loaded) {
                KernelLogger.info("DependencyConfig", `等待完成: ${name}`);
                return resolve(true);
            }

            // 未加载
            const start = Date.now();
            const timer = setInterval(() => {
                const e = this.dependencyMap.get(name);
                if (e && e.loaded) {
                    clearInterval(timer);
                    KernelLogger.info("DependencyConfig", `等待完成: ${name}`);
                    return resolve(true);
                }
                if (Date.now() - start >= timeout) {
                    clearInterval(timer);
                    KernelLogger.error("DependencyConfig", `等待超时: ${name} 加载失败`);
                    return reject(new Error(`waitLoaded: timeout waiting for "${name}"`));
                }
            }, interval);
        });
    }

    // 同步等待指定依赖的 `loaded` 字段变为 true（阻塞式）
    // 参数：
    //  - name: 依赖名
    //  - options: { interval(ms) 默认10, timeout(ms) 默认5000 }
    // 返回: boolean - true 表示加载成功，false 表示超时
    waitLoadedSync(name, options = {}) {
        const interval = typeof options.interval === "number" ? options.interval : 10;
        const timeout = typeof options.timeout === "number" ? options.timeout : 5000;
        
        KernelLogger.info("DependencyConfig", `同步等待加载: ${name}`);
        
        // 检查是否已经加载
        const entry = this.dependencyMap.get(name);
        if (entry && entry.loaded) {
            KernelLogger.info("DependencyConfig", `同步等待完成: ${name}`);
            return true;
        }
        
        // 同步阻塞等待
        const start = Date.now();
        while (true) {
            const e = this.dependencyMap.get(name);
            if (e && e.loaded) {
                KernelLogger.info("DependencyConfig", `同步等待完成: ${name}`);
                return true;
            }
            
            if (Date.now() - start >= timeout) {
                KernelLogger.error("DependencyConfig", `同步等待超时: ${name} 加载失败`);
                return false;
            }
            
            // 短暂阻塞（使用同步延迟）
            // 注意：这会阻塞主线程，只用于关键模块
            const endTime = Date.now() + interval;
            while (Date.now() < endTime) {
                // busy-wait
            }
        }
    }

    // 发布信号
    static publishSignal(name) {
        document.body.dispatchEvent(
            new CustomEvent("dependencyLoaded", {
                detail: {
                    name: name,
                },
            })
        );
        KernelLogger.info("DependencyConfig", `${name} 已初始化`);
    }

    // 检查某个依赖是否完全初始化
    checkDependency(name) {
        const entry = this.dependencyMap.get(name);
        if (!entry) {
            KernelLogger.debug("DependencyConfig", `检查依赖 ${name} 状态=不存在`);
            return false;
        }
        const loaded = entry.loaded;
        KernelLogger.debug("DependencyConfig", `检查依赖 ${name} 状态=${loaded}`);
        return loaded;
    }

    // 添加依赖项
    addDependency(name) {
        this.dependencies.push(name);
        KernelLogger.info("DependencyConfig", `添加依赖: ${name}`);
    }

    // link操作
    linkerAll() {
        KernelLogger.info("DependencyConfig", "开始链接所有依赖项");
        // 迭代所有依赖项
        this.dependencies.forEach((name, index) => {
            // 生成模板
            this.dependencyMap.set(name, DependencyConfig.generate(name));
            // 加载文件
            this.RootElement.appendChild(
                document.createElement("script")
            ).setAttribute("src", name);
            // link完成
            this.dependencyMap.get(name).linked = true;
            // 记录link时间
            const linktimer = new Date().getTime();
            this.dependencyMap.get(name).expansion.linktime = linktimer;
            // 记录索引
            this.dependencyMap.get(name).expansion.inde = index;
            KernelLogger.info("DependencyConfig", `已链接 ${name}`, {
                linktime: linktimer,
                index,
            });
        });
        KernelLogger.info("DependencyConfig", "所有依赖项已链接完成");
    }

    // 构造函数
    constructor() {
        KernelLogger.info("DependencyConfig", "初始化开始");
        // 依赖项
        this.dependencies = [];
        // 依赖项映射
        this.dependencyMap = new Map();
        // body元素
        this.RootElement = document.body;
        // 监听依赖项加载完成事件
        const eventHandler = (event) => {
            const name = event.detail.name;
            // 如果条目不存在，先创建它（支持动态加载的模块）
            if (!this.dependencyMap.has(name)) {
                this.dependencyMap.set(name, DependencyConfig.generate(name));
                this.dependencyMap.get(name).linked = true; // 假设已经链接
            }
            // 标记为已初始化
            const entry = this.dependencyMap.get(name);
            entry.inited = true;
            entry.loaded = true;
            // 记录初始化时间
            const inittimer = new Date().getTime();
            entry.expansion.inittime = inittimer;
            KernelLogger.info("DependencyConfig", `标记已初始化: ${name}`, { inittime: inittimer });
        };
        document.body.addEventListener("dependencyLoaded", eventHandler);
        
        // 保存事件处理器引用，以便后续可能需要移除
        this._dependencyLoadedHandler = eventHandler;
        
        KernelLogger.info("DependencyConfig", "初始化完成");
    }
}

// 暴露同步等待 API 到全局（如果可用）
if (typeof window !== 'undefined') {
    // 创建一个辅助函数，用于同步等待依赖
    window.waitDependencySync = function(name, options) {
        try {
            // 尝试从 POOL 获取 Dependency 实例
            let Dependency = null;
            if (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function') {
                Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
            }
            
            if (Dependency && typeof Dependency.waitLoadedSync === 'function') {
                return Dependency.waitLoadedSync(name, options);
            } else {
                // 如果 Dependency 不可用，创建一个临时实例
                if (typeof DependencyConfig !== 'undefined') {
                    const tempDependency = new DependencyConfig();
                    return tempDependency.waitLoadedSync(name, options);
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("DependencyConfig", "无法同步等待依赖，DependencyConfig 未加载");
                    } else {
                        console.warn("[内核][DependencyConfig] 无法同步等待依赖，DependencyConfig 未加载");
                    }
                    return false;
                }
            }
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("DependencyConfig", `同步等待依赖失败: ${name}`, String(e));
            } else {
                console.error(`[内核][DependencyConfig] 同步等待依赖失败: ${name}`, e);
            }
            return false;
        }
    };
}

// 发布初始化信号（如果 document.body 已就绪）
if (typeof document !== 'undefined' && document.body) {
    DependencyConfig.publishSignal("../kernel/signal/dependencyConfig.js");
} else {
    // 延迟发布信号
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            DependencyConfig.publishSignal("../kernel/signal/dependencyConfig.js");
        });
    } else {
        setTimeout(() => {
            if (document.body) {
                DependencyConfig.publishSignal("../kernel/signal/dependencyConfig.js");
            }
        }, 0);
    }
}

// 暴露到全局
if (typeof window !== 'undefined') {
    // 不导出到全局作用域，交由POOL管理
    // 通过POOL注册（如果POOL已加载）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            // 确保 KERNEL_GLOBAL_POOL 类别存在
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "DependencyConfig", DependencyConfig);
        } catch (e) {
            // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
            window.DependencyConfig = DependencyConfig;
        }
    } else {
        // POOL不可用，降级到全局对象
        window.DependencyConfig = DependencyConfig;
    }
}

})();
