// 全局暂存区（对象池）
// 注意：初始化时不使用 KernelLogger，避免循环依赖
const POOL = {
    // 是否已初始化（通过 __IS_INITED__）
    __IS_INITED__: false,
    // 私有池：Map<normalizedKey, Object>
    __KEY_POOL__: new Map(),
    // 系统加载标志位：标识系统是否正在加载中
    // 一旦系统加载完成，此标志位将被删除，且拒绝后续添加（不进行持久化保存）
    __SYSTEM_LOADING_FLAG__: 'SYSTEM_LOADING',
    // 系统加载标志位是否已被删除（一旦删除，永久拒绝添加）
    __SYSTEM_LOADING_REMOVED__: false,

    /**
     * 将任意 type 规范化为字符串键，保证一致性。
     * 支持：number/string/symbol/object/null/undefined 等。
     * 对象会尝试 JSON.stringify，失败时退回到 String(type)。
     * @param {*} type
     * @returns {string}
     */
    __normalizeKey__(type) {
        // 移除调试日志，这是高频调用的内部方法
        if (typeof type === "symbol") return type.toString();
        if (typeof type === "undefined") return "undefined";
        if (type === null) return "null";
        if (typeof type === "object") {
            // 回退处理
            try {
                return JSON.stringify(type);
            } catch (e) {
                return String(type);
            }
        }
        // 兼容type
        return String(type);
    },

    /**
     * 判断是否为对象（非 null）且可能为枚举容器
     * @param {*} v
     * @returns {boolean}
     */
    __isObject__(v) {
        // 移除调试日志，这是高频调用的内部方法
        return typeof v === "object" && v !== null;
    },

    /**
     * 从伪枚举对象中提取所有可作为类别键的原始值（number/string/symbol）
     * 支持一层或两层嵌套，例如 GroupEnum 或 GroupEnum.POOL。
     * 返回一个扁平化数组，若对象中没有原始值则返回空数组。
     * @param {object} obj
     * @returns {Array<*>}
     */
    __extractEnumValues__(obj) {
        // 移除调试日志，这是高频调用的内部方法
        const results = [];
        if (!this.__isObject__(obj)) return results;
        Object.keys(obj).forEach((k) => {
            const v = obj[k];
            const t = typeof v;
            if (t === "number" || t === "string" || t === "symbol") {
                results.push(v);
            } else if (this.__isObject__(v)) {
                // 支持一层嵌套枚举对象
                Object.keys(v).forEach((k2) => {
                    const v2 = v[k2];
                    const t2 = typeof v2;
                    if (t2 === "number" || t2 === "string" || t2 === "symbol") {
                        results.push(v2);
                    }
                });
            }
        });
        return results;
    },

    /**
     * 确保类别存在（若不存在则创建并标记 isInit）
     * @param {*} type
     */
    __UPDATE__(type) {
        // 移除调试日志，这是高频调用的内部方法
        // 若传入的是一个伪枚举对象（或含嵌套的枚举对象），则为其中每个枚举值创建类别
        if (this.__isObject__(type)) {
            const vals = this.__extractEnumValues__(type);
            vals.forEach((v) => {
                const k = this.__normalizeKey__(v);
                if (!this.__KEY_POOL__.has(k))
                    this.__KEY_POOL__.set(k, { isInit: true });
            });
            return;
        }
        const key = this.__normalizeKey__(type);
        if (!this.__KEY_POOL__.has(key)) {
            this.__KEY_POOL__.set(key, { isInit: true });
        }
    },

    /**
     * 添加或覆盖某个类别下的命名元素
     * 若 name 为空将打印警告并忽略。
     * 特殊处理：系统加载标志位一旦被删除，永久拒绝添加（不进行持久化保存）。
     * @param {*} type
     * @param {string} name
     * @param {*} elem
     */
    __ADD__(type, name, elem) {
        // 移除调试日志，这是高频调用的内部方法
        if (typeof name === "undefined" || name === null || name === "") {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("POOL", "__ADD__: name 不能为空或空字符串", { type, name });
            } else {
                console.warn("[内核][POOL] __ADD__: name 不能为空或空字符串", { type, name });
            }
            return;
        }
        // 如果 type 是伪枚举对象且 name 对应其中某个枚举字段，则将该枚举字段的值作为真实类型
        let realType = type;
        if (
            this.__isObject__(type) &&
            typeof name === "string" &&
            Object.prototype.hasOwnProperty.call(type, name)
        ) {
            realType = type[name];
            // 为避免混淆，保留 name 作为元素名（这里认为调用者传入的是 enumObject + memberName 的简写用法）
        }
        const key = this.__normalizeKey__(realType);
        
        // 检查是否尝试添加系统加载标志位
        // 如果标志位已被删除，永久拒绝添加（安全策略）
        if (name === this.__SYSTEM_LOADING_FLAG__ && this.__SYSTEM_LOADING_REMOVED__) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("POOL", `拒绝添加系统加载标志位 ${name}：系统加载已完成，标志位已被永久删除（安全策略）`);
            } else {
                console.warn(`[内核][POOL] 拒绝添加系统加载标志位 ${name}：系统加载已完成，标志位已被永久删除（安全策略）`);
            }
            return; // 拒绝添加
        }
        
        if (!this.__KEY_POOL__.has(key)) this.__UPDATE__(realType);
        const obj = this.__KEY_POOL__.get(key);
        obj[name] = elem;
    },

    /**
     * 获取类别对象或类别下某个命名元素
     * - __GET__(type) => 返回类别对象（引用）或 {isInit:false} 表示不存在
     * - __GET__(type, name) => 返回具体元素（可能为 undefined）
     * @param {*} type
     * @param {string} [name]
     * @returns {*}
     */
    __GET__(type, name) {
        // 移除调试日志，这是高频调用的内部方法
        let realType = type;
        // 允许传入伪枚举对象和字段名的组合：__GET__(GroupEnum.POOL, 'DOM_ELEMENT')
        if (
            this.__isObject__(type) &&
            typeof name === "string" &&
            Object.prototype.hasOwnProperty.call(type, name)
        ) {
            realType = type[name];
        }
        const key = this.__normalizeKey__(realType);
        if (!this.__KEY_POOL__.has(key)) return { isInit: false };
        const obj = this.__KEY_POOL__.get(key);
        if (typeof name === "undefined") return obj;
        return obj[name];
    },

    /**
     * 判断类别或类别下某个键是否存在
     * - __HAS__(type) => bool (类别是否存在)
     * - __HAS__(type, name) => bool (某个名称是否在该类别下)
     * @param {*} type
     * @param {string} [name]
     * @returns {boolean}
     */
    __HAS__(type, name) {
        // 移除调试日志，这是高频调用的内部方法
        let realType = type;
        if (
            this.__isObject__(type) &&
            typeof name === "string" &&
            Object.prototype.hasOwnProperty.call(type, name)
        ) {
            realType = type[name];
        }
        const key = this.__normalizeKey__(realType);
        if (!this.__KEY_POOL__.has(key)) return false;
        if (typeof name === "undefined") return true;
        const obj = this.__KEY_POOL__.get(key);
        return Object.prototype.hasOwnProperty.call(obj, name);
    },

    /**
     * 删除类别或类别下的某个名称
     * - __REMOVE__(type) => 删除整个类别（从 Map 中删除）
     * - __REMOVE__(type, name) => 删除该类别下的单项
     * 特殊处理：删除系统加载标志位时，标记为永久删除，拒绝后续添加。
     * @param {*} type
     * @param {string} [name]
     */
    __REMOVE__(type, name) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug("POOL", "__REMOVE__ called", { type, name });
        }
        let realType = type;
        if (
            this.__isObject__(type) &&
            typeof name === "string" &&
            Object.prototype.hasOwnProperty.call(type, name)
        ) {
            realType = type[name];
        }
        const key = this.__normalizeKey__(realType);
        if (!this.__KEY_POOL__.has(key)) return;
        if (typeof name === "undefined") {
            this.__KEY_POOL__.delete(key);
            return;
        }
        const obj = this.__KEY_POOL__.get(key);
        if (Object.prototype.hasOwnProperty.call(obj, name)) {
            // 特殊处理：如果删除的是系统加载标志位，标记为永久删除
            if (name === this.__SYSTEM_LOADING_FLAG__) {
                this.__SYSTEM_LOADING_REMOVED__ = true;
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("POOL", `系统加载标志位已删除，系统加载完成。此后永久拒绝添加该标志位（安全策略）`);
                } else {
                    console.log("[内核][POOL] 系统加载标志位已删除，系统加载完成。此后永久拒绝添加该标志位（安全策略）");
                }
            }
            delete obj[name];
        }
    },
    
    /**
     * 检查系统是否正在加载中
     * @returns {boolean} 如果系统正在加载中返回 true，否则返回 false
     */
    __IS_SYSTEM_LOADING__() {
        // 如果标志位已被删除，直接返回 false
        if (this.__SYSTEM_LOADING_REMOVED__) {
            return false;
        }
        // 检查标志位是否存在
        const flag = this.__GET__("KERNEL_GLOBAL_POOL", this.__SYSTEM_LOADING_FLAG__);
        return flag === true;
    },

    /**
     * 返回某个类别的所有项的浅拷贝，避免外部篡改内部引用
     * @param {*} type
     * @returns {object}
     */
    __GET_ALL__(type) {
        // 移除调试日志，这是高频调用的内部方法
        let realType = type;
        if (this.__isObject__(type)) {
            // 如果传入伪枚举对象，则尝试提取其中的值并返回所有对应类别的合并浅拷贝
            const vals = this.__extractEnumValues__(type);
            if (vals.length > 0) {
                const merged = {};
                vals.forEach((v) => {
                    const k = this.__normalizeKey__(v);
                    if (this.__KEY_POOL__.has(k)) {
                        const obj = this.__KEY_POOL__.get(k);
                        Object.keys(obj).forEach((kk) => {
                            merged[kk] = obj[kk];
                        });
                    }
                });
                return merged;
            }
        }
        const key = this.__normalizeKey__(realType);
        if (!this.__KEY_POOL__.has(key)) return { isInit: false };
        const obj = this.__KEY_POOL__.get(key);
        const copy = {};
        Object.keys(obj).forEach((k) => {
            copy[k] = obj[k];
        });
        return copy;
    },

    /**
     * 清空整个池或指定类别的内容
     * - __CLEAR__() => 清空整个 Map 并将 __IS_INITED__ 设为 false，同时重置系统加载标志位状态
     * - __CLEAR__(type) => 删除指定类别
     * @param {*} [type]
     */
    __CLEAR__(type) {
        // 移除调试日志，这是高频调用的内部方法
        if (typeof type === "undefined") {
            this.__KEY_POOL__.clear();
            this.__IS_INITED__ = false;
            // 重置系统加载标志位状态（系统完全重置时，允许重新设置标志位）
            this.__SYSTEM_LOADING_REMOVED__ = false;
            return;
        }
        const key = this.__normalizeKey__(type);
        if (this.__KEY_POOL__.has(key)) this.__KEY_POOL__.delete(key);
    },

    /**
     * 初始化池（可传入预定义的 type 列表）
     * @param {Array<*>} [datas]
     */
    __INIT__(datas) {
        // 只保留INFO级别的初始化日志，移除DEBUG日志
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("POOL", "pool init start");
        } else {
            console.log("[内核][POOL] pool init start");
        }
        // 支持传入：数组、单个伪枚举对象、或单个值
        if (typeof datas === "undefined" || datas === null) {
            datas = [];
        }
        if (!Array.isArray(datas)) {
            // 单个对象或值
            if (this.__isObject__(datas)) {
                const vals = this.__extractEnumValues__(datas);
                if (vals.length > 0) {
                    vals.forEach((v) => this.__UPDATE__(v));
                } else {
                    // 不是典型的枚举容器，直接把对象的每个属性值作为 type 处理
                    Object.keys(datas).forEach((k) =>
                        this.__UPDATE__(datas[k])
                    );
                }
            } else {
                this.__UPDATE__(datas);
            }
        } else {
            datas.forEach((init_type) => {
                if (this.__isObject__(init_type)) {
                    const vals = this.__extractEnumValues__(init_type);
                    if (vals.length > 0)
                        vals.forEach((v) => this.__UPDATE__(v));
                    else
                        Object.keys(init_type).forEach((k) =>
                            this.__UPDATE__(init_type[k])
                        );
                } else {
                    this.__UPDATE__(init_type);
                }
            });
        }
        this.__IS_INITED__ = true;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info("POOL", "pool init complete");
        } else {
            console.log("[内核][POOL] pool init complete");
        }
    },
};

// 冻结外层对象以防止方法被替换
Object.freeze(POOL);

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/core/signal/pool.js");
} else {
    // 如果 DependencyConfig 还未加载，延迟发布信号
    if (typeof document !== 'undefined' && document.body) {
        const publishWhenReady = () => {
            if (typeof DependencyConfig !== 'undefined') {
                DependencyConfig.publishSignal("../kernel/core/signal/pool.js");
            } else {
                setTimeout(publishWhenReady, 10);
            }
        };
        publishWhenReady();
    }
}

/* 
===== 使用示例 =====
// 初始化两个类别
POOL.__INIT__(['DOM', 'COMPONENT']);

// 添加元素
POOL.__ADD__('DOM', 'btnPrimary', document.getElementById && document.getElementById('btnPrimary'));
POOL.__ADD__('COMPONENT', 'widgetA', { id: 'widgetA', init: true });

// 读取单个元素
const btn = POOL.__GET__('DOM', 'btnPrimary');

// 读取整个类别（引用）或浅拷贝
const domRef = POOL.__GET__('DOM');
const domCopy = POOL.__GET_ALL__('DOM');

// 判断存在性
const hasWidget = POOL.__HAS__('COMPONENT', 'widgetA');

// 删除单个元素或整个类别
POOL.__REMOVE__('DOM', 'btnPrimary');
POOL.__REMOVE__('COMPONENT');

// 清空全部
POOL.__CLEAR__();
*/

