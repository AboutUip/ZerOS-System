// 动画管理器
// 负责管理系统动画，使用 anime.js 库进行动画
// animate.css 仅提供给程序内部使用

KernelLogger.info("AnimateManager", "模块初始化");

/**
 * Animate.css 动画类名常量（仅供程序内部使用）
 * 系统动画应使用 anime.js，不直接使用这些类名
 */
const ANIMATE_CLASSES = {
    // 基础类
    BASE: 'animate__animated',
    
    // 速度控制
    SPEED: {
        SLOW: 'animate__slow',      // 2s
        SLOWER: 'animate__slower',  // 3s
        FAST: 'animate__fast',      // 0.8s
        FASTER: 'animate__faster', // 0.5s
        DEFAULT: ''                  // 1s (默认)
    },
    
    // 延迟控制
    DELAY: {
        DELAY_1S: 'animate__delay-1s',
        DELAY_2S: 'animate__delay-2s',
        DELAY_3S: 'animate__delay-3s',
        DELAY_4S: 'animate__delay-4s',
        DELAY_5S: 'animate__delay-5s'
    },
    
    // 重复控制
    REPEAT: {
        REPEAT_1: 'animate__repeat-1',
        REPEAT_2: 'animate__repeat-2',
        REPEAT_3: 'animate__repeat-3',
        INFINITE: 'animate__infinite'
    },
    
    // 淡入动画
    FADE_IN: 'animate__fadeIn',
    FADE_IN_UP: 'animate__fadeInUp',
    FADE_IN_DOWN: 'animate__fadeInDown',
    FADE_IN_LEFT: 'animate__fadeInLeft',
    FADE_IN_RIGHT: 'animate__fadeInRight',
    FADE_IN_TOP_LEFT: 'animate__fadeInTopLeft',
    FADE_IN_TOP_RIGHT: 'animate__fadeInTopRight',
    FADE_IN_BOTTOM_LEFT: 'animate__fadeInBottomLeft',
    FADE_IN_BOTTOM_RIGHT: 'animate__fadeInBottomRight',
    
    // 淡出动画
    FADE_OUT: 'animate__fadeOut',
    FADE_OUT_UP: 'animate__fadeOutUp',
    FADE_OUT_DOWN: 'animate__fadeOutDown',
    FADE_OUT_LEFT: 'animate__fadeOutLeft',
    FADE_OUT_RIGHT: 'animate__fadeOutRight',
    FADE_OUT_TOP_LEFT: 'animate__fadeOutTopLeft',
    FADE_OUT_TOP_RIGHT: 'animate__fadeOutTopRight',
    FADE_OUT_BOTTOM_LEFT: 'animate__fadeOutBottomLeft',
    FADE_OUT_BOTTOM_RIGHT: 'animate__fadeOutBottomRight',
    
    // 缩放动画
    ZOOM_IN: 'animate__zoomIn',
    ZOOM_IN_UP: 'animate__zoomInUp',
    ZOOM_IN_DOWN: 'animate__zoomInDown',
    ZOOM_IN_LEFT: 'animate__zoomInLeft',
    ZOOM_IN_RIGHT: 'animate__zoomInRight',
    ZOOM_OUT: 'animate__zoomOut',
    ZOOM_OUT_UP: 'animate__zoomOutUp',
    ZOOM_OUT_DOWN: 'animate__zoomOutDown',
    ZOOM_OUT_LEFT: 'animate__zoomOutLeft',
    ZOOM_OUT_RIGHT: 'animate__zoomOutRight',
    
    // 滑动动画
    SLIDE_IN_UP: 'animate__slideInUp',
    SLIDE_IN_DOWN: 'animate__slideInDown',
    SLIDE_IN_LEFT: 'animate__slideInLeft',
    SLIDE_IN_RIGHT: 'animate__slideInRight',
    SLIDE_OUT_UP: 'animate__slideOutUp',
    SLIDE_OUT_DOWN: 'animate__slideOutDown',
    SLIDE_OUT_LEFT: 'animate__slideOutLeft',
    SLIDE_OUT_RIGHT: 'animate__slideOutRight',
    
    // 弹跳动画
    BOUNCE_IN: 'animate__bounceIn',
    BOUNCE_IN_UP: 'animate__bounceInUp',
    BOUNCE_IN_DOWN: 'animate__bounceInDown',
    BOUNCE_IN_LEFT: 'animate__bounceInLeft',
    BOUNCE_IN_RIGHT: 'animate__bounceInRight',
    BOUNCE_OUT: 'animate__bounceOut',
    BOUNCE_OUT_UP: 'animate__bounceOutUp',
    BOUNCE_OUT_DOWN: 'animate__bounceOutDown',
    BOUNCE_OUT_LEFT: 'animate__bounceOutLeft',
    BOUNCE_OUT_RIGHT: 'animate__bounceOutRight',
    
    // 旋转动画
    ROTATE_IN: 'animate__rotateIn',
    ROTATE_IN_DOWN_LEFT: 'animate__rotateInDownLeft',
    ROTATE_IN_DOWN_RIGHT: 'animate__rotateInDownRight',
    ROTATE_IN_UP_LEFT: 'animate__rotateInUpLeft',
    ROTATE_IN_UP_RIGHT: 'animate__rotateInUpRight',
    ROTATE_OUT: 'animate__rotateOut',
    ROTATE_OUT_DOWN_LEFT: 'animate__rotateOutDownLeft',
    ROTATE_OUT_DOWN_RIGHT: 'animate__rotateOutDownRight',
    ROTATE_OUT_UP_LEFT: 'animate__rotateOutUpLeft',
    ROTATE_OUT_UP_RIGHT: 'animate__rotateOutUpRight',
    
    // 翻转动画
    FLIP_IN_X: 'animate__flipInX',
    FLIP_IN_Y: 'animate__flipInY',
    FLIP_OUT_X: 'animate__flipOutX',
    FLIP_OUT_Y: 'animate__flipOutY',
    
    // 其他动画
    LIGHT_SPEED_IN: 'animate__lightSpeedInRight',
    LIGHT_SPEED_OUT: 'animate__lightSpeedOutRight',
    BACK_IN_UP: 'animate__backInUp',
    BACK_IN_DOWN: 'animate__backInDown',
    BACK_IN_LEFT: 'animate__backInLeft',
    BACK_IN_RIGHT: 'animate__backInRight',
    BACK_OUT_UP: 'animate__backOutUp',
    BACK_OUT_DOWN: 'animate__backOutDown',
    BACK_OUT_LEFT: 'animate__backOutLeft',
    BACK_OUT_RIGHT: 'animate__backOutRight'
};

/**
 * 动画时长配置（毫秒）
 */
const ANIMATE_DURATIONS = {
    DEFAULT: 1000,  // 默认 1s
    SLOW: 2000,     // slow: 2s
    SLOWER: 3000,   // slower: 3s
    FAST: 800,      // fast: 0.8s
    FASTER: 500     // faster: 0.5s
};

/**
 * 系统动画预设配置（使用 anime.js）
 * 定义不同操作应该使用什么动画效果
 */
const ANIMATION_PRESETS = {
    // 窗口操作
    WINDOW: {
        // 窗口打开（更迅速的动画，更大的缩放和位移）
        OPEN: {
            duration: 150,
            easing: 'easeOutCubic',
            opacity: [0, 1],
            scale: [0.75, 1],
            translateY: [30, 0]
        },
        // 窗口关闭（更迅速的动画，更大的缩放和位移）
        CLOSE: {
            duration: 120,
            easing: 'easeInCubic',
            opacity: [1, 0],
            scale: [1, 0.8],
            translateY: [0, 30]
        },
        // 窗口最小化（更迅速的动画，更大的缩放和位移，方向由任务栏位置决定）
        // 注意：实际方向在代码中根据任务栏位置动态调整
        MINIMIZE: {
            duration: 150,
            easing: 'easeInCubic',
            opacity: [1, 0.05],
            scale: [1, 0.2],
            translateY: [0, 200],  // 默认向下，会根据任务栏位置调整
            translateX: [0, 0]     // 默认不横向移动，会根据任务栏位置调整
        },
        // 窗口恢复（从最小化，更迅速的动画，更大的缩放和位移，方向由任务栏位置决定）
        RESTORE: {
            duration: 150,
            easing: 'easeOutCubic',
            opacity: [0.05, 1],
            scale: [0.2, 1],
            translateY: [200, 0],  // 默认从下向上，会根据任务栏位置调整
            translateX: [0, 0]     // 默认不横向移动，会根据任务栏位置调整
        },
        // 窗口最大化（明显缩放，快速流畅）
        MAXIMIZE: {
            duration: 200,
            easing: 'easeOutCubic',
            scale: [1, 1.05, 1],
            opacity: [1, 0.95, 1]
        },
        // 窗口还原（从最大化，明显缩放，快速流畅）
        RESTORE_MAXIMIZE: {
            duration: 200,
            easing: 'easeInCubic',
            scale: [1, 0.95, 1],
            opacity: [1, 0.95, 1]
        },
        // 窗口获得焦点
        FOCUS: {
            duration: 250,
            easing: 'easeOutCubic',
            scale: [1, 1.01, 1]
        },
        // 窗口失去焦点
        BLUR: {
            duration: 200,
            easing: 'easeInCubic',
            scale: [1.01, 1]
        }
    },
    
    // 菜单操作
    MENU: {
        // 菜单打开（更迅速）
        OPEN: {
            duration: 100,
            easing: 'easeOutCubic',
            opacity: [0, 1],
            translateY: [-10, 0]
        },
        // 菜单关闭（更迅速）
        CLOSE: {
            duration: 100,
            easing: 'easeInCubic',
            opacity: [1, 0],
            translateY: [0, -10]
        },
        // 菜单项出现
        ITEM_APPEAR: {
            duration: 200,
            easing: 'easeOutCubic',
            opacity: [0, 1],
            translateY: [5, 0]
        }
    },
    
    // 对话框操作
    DIALOG: {
        // 对话框打开
        OPEN: {
            duration: 300,
            easing: 'easeOutCubic',
            opacity: [0, 1],
            scale: [0.9, 1],
            translateY: [-20, 0]
        },
        // 对话框关闭
        CLOSE: {
            duration: 300,
            easing: 'easeInCubic',
            opacity: [1, 0],
            scale: [1, 0.9],
            translateY: [0, -20]
        }
    },
    
    // 通知操作
    NOTIFICATION: {
        // 通知出现
        SHOW: {
            duration: 400,
            easing: 'easeOutCubic',
            opacity: [0, 1],
            translateX: [100, 0]
        },
        // 通知消失
        HIDE: {
            duration: 400,
            easing: 'easeInCubic',
            opacity: [1, 0],
            translateX: [0, 100]
        }
    },
    
    // 列表项操作
    LIST_ITEM: {
        // 列表项添加
        ADD: {
            duration: 300,
            easing: 'easeOutCubic',
            opacity: [0, 1],
            translateY: [-10, 0],
            scale: [0.95, 1]
        },
        // 列表项删除
        REMOVE: {
            duration: 300,
            easing: 'easeInCubic',
            opacity: [1, 0],
            translateY: [0, 10],
            scale: [1, 0.95]
        }
    },
    
    // 按钮操作
    BUTTON: {
        // 按钮点击反馈
        CLICK: {
            duration: 150,
            easing: 'easeOutCubic',
            scale: [1, 0.95, 1]
        },
        // 按钮悬停
        HOVER: {
            duration: 200,
            easing: 'easeOutCubic',
            scale: [1, 1.05]
        }
    },
    
    // 面板操作（网络、电池、时间等弹出面板）
    PANEL: {
        // 面板打开（加快速度，提升响应性）
        OPEN: {
            duration: 150,
            easing: 'easeOutCubic',
            opacity: [0, 1],
            translateY: [-10, 0],
            scale: [0.95, 1]
        },
        // 面板关闭（加快速度，确保快速收回）
        CLOSE: {
            duration: 80,
            easing: 'easeInCubic',
            opacity: [1, 0],
            translateY: [0, -5],
            scale: [1, 0.98]
        },
        // 面板立即关闭（用于快速切换时）
        CLOSE_IMMEDIATE: {
            duration: 50,
            easing: 'easeInCubic',
            opacity: [1, 0],
            translateY: [0, -3],
            scale: [1, 0.99]
        }
    },
    
    // 类别折叠操作（已优化为更流畅的动画）
    CATEGORY: {
        // 类别展开（使用更平滑的缓动函数）
        EXPAND: {
            duration: 250,
            easing: 'easeOutCubic',
            opacity: [0, 1],
            translateY: [-8, 0],
            scale: [0.98, 1]
        },
        // 类别折叠（快速收回，保持流畅）
        COLLAPSE: {
            duration: 250,
            easing: 'easeInCubic',
            opacity: [1, 0],
            translateY: [0, -8],
            scale: [1, 0.98]
        }
    },
    
    // 图标和按钮交互
    ICON: {
        // 图标悬停
        HOVER: {
            duration: 200,
            easing: 'easeOutCubic',
            scale: [1, 1.1],
            rotate: [0, 5]
        },
        // 图标点击
        CLICK: {
            duration: 150,
            easing: 'easeOutCubic',
            scale: [1, 0.9, 1]
        },
        // 图标离开
        LEAVE: {
            duration: 200,
            easing: 'easeInCubic',
            scale: [1.1, 1],
            rotate: [5, 0]
        }
    },
    
    // SVG 动画
    SVG: {
        // SVG 路径绘制
        DRAW: {
            duration: 1000,
            easing: 'easeOutCubic',
            strokeDashoffset: ['100%', '0%']
        },
        // SVG 缩放
        SCALE: {
            duration: 300,
            easing: 'easeOutCubic',
            scale: [0, 1],
            opacity: [0, 1]
        },
        // SVG 旋转
        ROTATE: {
            duration: 500,
            easing: 'easeInOutCubic',
            rotate: [0, 360]
        }
    },
    
    // 图标和按钮交互
    ICON: {
        // 图标悬停
        HOVER: {
            duration: 200,
            easing: 'easeOutCubic',
            scale: [1, 1.1],
            rotate: [0, 5]
        },
        // 图标点击
        CLICK: {
            duration: 150,
            easing: 'easeOutCubic',
            scale: [1, 0.9, 1]
        },
        // 图标离开
        LEAVE: {
            duration: 200,
            easing: 'easeInCubic',
            scale: [1.1, 1],
            rotate: [5, 0]
        }
    },
    
    // SVG 动画
    SVG: {
        // SVG 路径绘制
        DRAW: {
            duration: 1000,
            easing: 'easeOutCubic',
            strokeDashoffset: ['100%', '0%']
        },
        // SVG 缩放
        SCALE: {
            duration: 300,
            easing: 'easeOutCubic',
            scale: [0, 1],
            opacity: [0, 1]
        },
        // SVG 旋转
        ROTATE: {
            duration: 500,
            easing: 'easeInOutCubic',
            rotate: [0, 360]
        }
    },
    
    // CSS Keyframes 动画（非 anime.js，用于特殊效果）
    KEYFRAMES: {
        // 网络脉冲动画
        NETWORK_PULSE: {
            animation: 'networkPulse 2s ease-in-out infinite',
            duration: 0 // 无限循环，不需要等待完成
        },
        // 电池脉冲动画
        BATTERY_PULSE: {
            animation: 'batteryPulse 2s ease-in-out infinite',
            duration: 0 // 无限循环，不需要等待完成
        }
    }
};

class AnimateManager {
    // anime.js 实例缓存
    static _animeInstance = null;
    // 当前运行的动画 Map<element, animation>
    static _activeAnimations = new Map();
    
    /**
     * 初始化动画管理器
     */
    static async init() {
        if (AnimateManager._initialized) {
            return;
        }
        
        AnimateManager._initialized = true;
        
        // 注册到POOL（先注册，即使 anime.js 未加载也能使用）
        AnimateManager._registerToPool();
        
        // 加载 anime.js 模块（异步，不阻塞初始化）
        AnimateManager._loadAnime().catch(error => {
            KernelLogger.error("AnimateManager", `加载 anime.js 失败: ${error.message}`);
        });
        
        // 尝试立即从全局获取（如果已经加载）
        if (typeof window !== 'undefined' && window.anime) {
            const animeFunc = AnimateManager._extractAnimeFunction(window.anime);
            if (animeFunc) {
                AnimateManager._animeInstance = animeFunc;
                KernelLogger.info("AnimateManager", "从全局作用域获取 anime.js（初始化时）");
            }
        }
        
        KernelLogger.info("AnimateManager", "动画管理器初始化完成");
    }
    
    /**
     * 加载 anime.js 模块（内部方法）
     * @returns {Promise<void>}
     */
    static async _loadAnime() {
        try {
            if (typeof DynamicManager !== 'undefined') {
                const loadedAnime = await DynamicManager.loadModule('anime');
                // 尝试提取函数
                const animeFunc = AnimateManager._extractAnimeFunction(loadedAnime);
                if (animeFunc) {
                    AnimateManager._animeInstance = animeFunc;
                    KernelLogger.info("AnimateManager", "anime.js 模块加载成功");
                } else {
                    // 如果从加载结果无法提取，尝试从全局获取
                    if (typeof window !== 'undefined' && window.anime) {
                        const globalAnimeFunc = AnimateManager._extractAnimeFunction(window.anime);
                        if (globalAnimeFunc) {
                            AnimateManager._animeInstance = globalAnimeFunc;
                            KernelLogger.info("AnimateManager", "从全局作用域获取 anime.js（加载后）");
                        } else {
                            KernelLogger.warn("AnimateManager", "无法从加载的 anime.js 中提取函数");
                        }
                    }
                }
            } else {
                // 如果 DynamicManager 不可用，尝试从全局获取
                if (typeof window !== 'undefined' && window.anime) {
                    const animeFunc = AnimateManager._extractAnimeFunction(window.anime);
                    if (animeFunc) {
                        AnimateManager._animeInstance = animeFunc;
                        KernelLogger.info("AnimateManager", "从全局作用域获取 anime.js");
                    } else {
                        KernelLogger.warn("AnimateManager", "无法从全局 anime.js 中提取函数");
                    }
                } else {
                    KernelLogger.warn("AnimateManager", "DynamicManager 不可用，且全局作用域中未找到 anime.js");
                }
            }
        } catch (error) {
            KernelLogger.error("AnimateManager", `加载 anime.js 失败: ${error.message}`);
            // 尝试从全局获取作为降级方案
            if (typeof window !== 'undefined' && window.anime) {
                const animeFunc = AnimateManager._extractAnimeFunction(window.anime);
                if (animeFunc) {
                    AnimateManager._animeInstance = animeFunc;
                    KernelLogger.info("AnimateManager", "使用全局 anime.js 作为降级方案");
                }
            }
        }
    }
    
    /**
     * 注册到POOL
     */
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                    POOL.__INIT__("KERNEL_GLOBAL_POOL");
                }
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "AnimateManager", AnimateManager);
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "ANIMATE_CLASSES", ANIMATE_CLASSES); // 仅供程序内部使用
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "ANIMATE_DURATIONS", ANIMATE_DURATIONS);
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "ANIMATION_PRESETS", ANIMATION_PRESETS);
            } catch (e) {
                KernelLogger.warn("AnimateManager", `注册到POOL失败: ${e.message}`);
            }
        }
    }
    
    /**
     * 获取 anime.js 实例（同步方法）
     * @returns {Object|null} anime.js 实例
     */
    /**
     * 从 anime 对象中提取函数
     * @param {*} animeObj anime 对象
     * @returns {Function|null} anime 函数
     */
    static _extractAnimeFunction(animeObj) {
        if (!animeObj) {
            return null;
        }
        
        // 如果直接是函数，直接返回
        if (typeof animeObj === 'function') {
            return animeObj;
        }
        
        // 如果是对象，尝试多种方式获取函数
        if (typeof animeObj === 'object') {
            // 尝试 anime.animate（anime.js v4 UMD 导出的主函数）
            if (animeObj.animate && typeof animeObj.animate === 'function') {
                return animeObj.animate;
            }
            // 尝试 anime.default（ES6 模块导出）
            if (animeObj.default && typeof animeObj.default === 'function') {
                return animeObj.default;
            }
            // 尝试 anime.anime（某些 UMD 导出）
            if (animeObj.anime && typeof animeObj.anime === 'function') {
                return animeObj.anime;
            }
            // 尝试检查对象的所有属性，查找函数
            const keys = Object.keys(animeObj);
            for (const key of keys) {
                const value = animeObj[key];
                // 如果值是函数，优先检查常见的主函数名
                if (typeof value === 'function') {
                    if (key === 'animate' || key === 'default' || key === 'anime' || key.toLowerCase().includes('anime')) {
                        return value;
                    }
                }
            }
            // 尝试直接使用对象（某些 UMD 版本可能将函数作为对象导出）
            // 检查对象是否可以直接调用（通过检查是否有函数特征）
            try {
                // 如果对象有 toString 方法，检查是否是函数
                if (animeObj.toString && typeof animeObj.toString === 'function') {
                    const str = animeObj.toString();
                    if (str.includes('function') || str.includes('[native code]')) {
                        // 可能是函数对象，尝试直接返回
                        // 但先检查是否有 call/apply/bind 等函数方法
                        if (typeof animeObj.call === 'function' || typeof animeObj.apply === 'function') {
                            return animeObj;
                        }
                    }
                }
            } catch (e) {
                // 忽略错误
            }
            // 如果对象有 call 或 apply 方法，可能是可调用的对象
            if (typeof animeObj.call === 'function' || typeof animeObj.apply === 'function') {
                // 尝试将对象本身作为函数使用
                try {
                    // 检查是否是函数对象（某些库会创建函数对象）
                    if (animeObj.toString && animeObj.toString().includes('function')) {
                        return animeObj;
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
            // 最后尝试：如果对象有 __esModule 标记，尝试 default
            if (animeObj.__esModule && animeObj.default && typeof animeObj.default === 'function') {
                return animeObj.default;
            }
            // 如果对象的所有属性都是函数，尝试返回第一个函数（可能是主函数）
            const allFunctions = keys.filter(key => typeof animeObj[key] === 'function');
            if (allFunctions.length > 0 && allFunctions.length === keys.length) {
                // 如果所有属性都是函数，返回第一个
                return animeObj[allFunctions[0]];
            }
        }
        
        // 如果所有尝试都失败，记录调试信息
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.debug("AnimateManager", `无法提取 anime 函数，对象类型: ${typeof animeObj}, 对象键: ${animeObj && typeof animeObj === 'object' ? Object.keys(animeObj).join(', ') : 'N/A'}`);
        }
        
        return null;
    }
    
    static getAnimeInstance() {
        if (!AnimateManager._animeInstance) {
            // 尝试从全局获取
            let animeObj = null;
            if (typeof window !== 'undefined' && window.anime) {
                animeObj = window.anime;
            } else if (typeof globalThis !== 'undefined' && globalThis.anime) {
                animeObj = globalThis.anime;
            }
            
            if (animeObj) {
                // 尝试提取函数
                const animeFunc = AnimateManager._extractAnimeFunction(animeObj);
                if (animeFunc) {
                    AnimateManager._animeInstance = animeFunc;
                    KernelLogger.debug("AnimateManager", "成功从 anime 对象中提取函数");
                } else {
                    // 如果无法提取，记录详细信息以便调试
                    const objInfo = animeObj && typeof animeObj === 'object' 
                        ? `对象键: [${Object.keys(animeObj).slice(0, 10).join(', ')}]` 
                        : `类型: ${typeof animeObj}`;
                    KernelLogger.warn("AnimateManager", `无法从 anime 对象中提取函数，${objInfo}`);
                }
            }
        }
        // 再次验证返回的实例是否是函数
        if (AnimateManager._animeInstance && typeof AnimateManager._animeInstance !== 'function') {
            KernelLogger.warn("AnimateManager", `_animeInstance 不是函数，类型: ${typeof AnimateManager._animeInstance}，重置为 null`);
            AnimateManager._animeInstance = null;
        }
        return AnimateManager._animeInstance;
    }
    
    /**
     * 确保 anime.js 已加载（异步方法）
     * @returns {Promise<Object|null>} anime.js 实例
     */
    static async ensureAnimeLoaded() {
        if (AnimateManager._animeInstance) {
            return AnimateManager._animeInstance;
        }
        
        // 尝试从全局获取
        if (typeof window !== 'undefined' && window.anime) {
            const globalAnimeFunc = AnimateManager._extractAnimeFunction(window.anime);
            if (globalAnimeFunc) {
                AnimateManager._animeInstance = globalAnimeFunc;
                return AnimateManager._animeInstance;
            }
        }
        
        // 尝试从 DynamicManager 加载
        if (typeof DynamicManager !== 'undefined') {
            try {
                const loadedAnime = await DynamicManager.loadModule('anime');
                // 尝试提取函数
                const animeFunc = AnimateManager._extractAnimeFunction(loadedAnime);
                if (animeFunc) {
                    AnimateManager._animeInstance = animeFunc;
                    KernelLogger.info("AnimateManager", "自动加载 anime.js 成功");
                    return AnimateManager._animeInstance;
                } else {
                    // 如果从加载结果无法提取，尝试从全局获取
                    if (typeof window !== 'undefined' && window.anime) {
                        const globalAnimeFunc = AnimateManager._extractAnimeFunction(window.anime);
                        if (globalAnimeFunc) {
                            AnimateManager._animeInstance = globalAnimeFunc;
                            KernelLogger.info("AnimateManager", "从全局作用域获取 anime.js（加载后验证）");
                            return AnimateManager._animeInstance;
                        }
                    }
                    // 记录详细信息以便调试
                    const objInfo = loadedAnime && typeof loadedAnime === 'object' 
                        ? `对象键: [${Object.keys(loadedAnime).slice(0, 10).join(', ')}]` 
                        : `类型: ${typeof loadedAnime}`;
                    KernelLogger.warn("AnimateManager", `无法从 anime.js 中提取函数，${objInfo}`);
                }
            } catch (error) {
                KernelLogger.warn("AnimateManager", `自动加载 anime.js 失败: ${error.message}`);
            }
        }
        
        return null;
    }
    
    /**
     * 获取动画配置
     * @param {string} category 类别（如 'WINDOW', 'MENU'）
     * @param {string} action 操作（如 'OPEN', 'CLOSE'）
     * @returns {Object|null} 动画配置
     */
    static getAnimation(category, action) {
        if (!ANIMATION_PRESETS[category] || !ANIMATION_PRESETS[category][action]) {
            KernelLogger.warn("AnimateManager", `未找到动画配置: ${category}.${action}`);
            return null;
        }
        
        return ANIMATION_PRESETS[category][action];
    }
    
    /**
     * 应用动画到元素（使用 anime.js）
     * @param {HTMLElement|SVGElement|string} element 目标元素（支持选择器字符串）
     * @param {string} category 类别
     * @param {string} action 操作
     * @param {Object} options 选项 { delay: number, callback: Function, complete: Function }
     * @returns {Promise<void>} 动画完成的Promise
     */
    static async applyAnimation(element, category, action, options = {}) {
        if (!element) {
            KernelLogger.warn("AnimateManager", "应用动画失败：元素不存在");
            return;
        }
        
        const config = AnimateManager.getAnimation(category, action);
        if (!config) {
            return;
        }
        
        // 如果是 KEYFRAMES 类型，使用 CSS 动画
        if (category === 'KEYFRAMES') {
            const targetElement = typeof element === 'string' ? document.querySelector(element) : element;
            if (targetElement) {
                AnimateManager.applyKeyframeAnimation(targetElement, category, action);
            }
            return;
        }
        
        const anime = AnimateManager.getAnimeInstance();
        if (!anime) {
            KernelLogger.warn("AnimateManager", "anime.js 未加载，无法应用动画");
            return;
        }
        
        const { delay = 0, callback = null, complete = null } = options;
        
        // 停止之前的动画
        AnimateManager.stopAnimation(element);
        
        // 确保 element 是有效的 DOM 元素或选择器
        let targetElement = element;
        if (typeof element === 'string') {
            targetElement = document.querySelector(element);
            if (!targetElement) {
                KernelLogger.warn("AnimateManager", `无法找到目标元素: ${element}`);
                if (callback) callback();
                if (complete) complete();
                return Promise.resolve();
            }
        } else if (!element || !(element instanceof HTMLElement || element instanceof SVGElement)) {
            KernelLogger.warn("AnimateManager", "目标元素无效", { element, type: typeof element });
            if (callback) callback();
            if (complete) complete();
            return Promise.resolve();
        }
        
        // 构建 anime.js 配置（只包含 anime.js 支持的属性）
        // 注意：anime.js v4 使用 'ease' 而不是 'easing'
        const animeConfig = {
            targets: targetElement,
            duration: config.duration || ANIMATE_DURATIONS.DEFAULT,
            ease: config.easing || config.ease || 'easeOutCubic',  // 支持 easing 和 ease 两种写法
            delay: delay
        };
        
        // 添加动画属性（opacity, scale, translateX, translateY 等）
        // 注意：不要直接展开 config，因为可能包含 anime.js 不支持的属性
        if (config.opacity !== undefined) {
            animeConfig.opacity = config.opacity;
        }
        if (config.scale !== undefined) {
            animeConfig.scale = config.scale;
        }
        if (config.translateX !== undefined) {
            animeConfig.translateX = config.translateX;
        }
        if (config.translateY !== undefined) {
            animeConfig.translateY = config.translateY;
        }
        if (config.rotate !== undefined) {
            animeConfig.rotate = config.rotate;
        }
        if (config.filter !== undefined) {
            animeConfig.filter = config.filter;
        }
        
        // 添加完成回调
        if (callback || complete) {
            animeConfig.complete = () => {
                if (callback) callback();
                if (complete) complete();
            };
        }
        
        // 验证配置中是否有动画属性（至少需要一个动画属性）
        const hasAnimationProperty = animeConfig.opacity !== undefined || 
                                    animeConfig.scale !== undefined || 
                                    animeConfig.translateX !== undefined || 
                                    animeConfig.translateY !== undefined || 
                                    animeConfig.rotate !== undefined || 
                                    animeConfig.filter !== undefined;
        
        if (!hasAnimationProperty) {
            KernelLogger.warn("AnimateManager", "动画配置中没有有效的动画属性", { config: animeConfig });
            if (callback) callback();
            if (complete) complete();
            return Promise.resolve();
        }
        
        // 执行动画
        let animation;
        try {
            // anime.js v4 API: animate(targets, parameters)
            // 需要将配置拆分为 targets 和 parameters 两个参数
            const targets = animeConfig.targets;
            // 从配置中提取 targets，其余作为 parameters
            const { targets: _, ...parameters } = animeConfig;
            
            animation = anime(targets, parameters);
        } catch (error) {
            KernelLogger.warn("AnimateManager", `执行动画失败: ${error.message}`, { 
                error: error.message,
                config: {
                    duration: animeConfig.duration,
                    ease: animeConfig.ease,
                    hasOpacity: animeConfig.opacity !== undefined,
                    hasScale: animeConfig.scale !== undefined,
                    hasTranslateY: animeConfig.translateY !== undefined,
                    targetsType: typeof animeConfig.targets
                }
            });
            // 如果动画执行失败，立即 resolve
            if (callback) callback();
            if (complete) complete();
            return Promise.resolve();
        }
        
        // 保存动画引用
        if (targetElement && animation) {
            AnimateManager._activeAnimations.set(targetElement, animation);
        }
        
        // 等待动画完成
        return new Promise((resolve) => {
            if (!animation) {
                resolve();
                return;
            }
            
            // anime.js v4 使用 finished Promise
            if (animation.finished && typeof animation.finished.then === 'function') {
                animation.finished.then(() => {
                    if (targetElement) {
                        AnimateManager._activeAnimations.delete(targetElement);
                    }
                    resolve();
                }).catch(() => {
                    // 如果 Promise 被拒绝，仍然清理
                    if (targetElement) {
                        AnimateManager._activeAnimations.delete(targetElement);
                    }
                    resolve();
                });
            } else {
                // 降级方案：使用 setTimeout
                const duration = config.duration || ANIMATE_DURATIONS.DEFAULT;
                setTimeout(() => {
                    if (targetElement) {
                        AnimateManager._activeAnimations.delete(targetElement);
                    }
                    resolve();
                }, duration + (delay || 0));
            }
        });
    }
    
    /**
     * 停止元素的动画
     * @param {HTMLElement|SVGElement|string} element 目标元素
     */
    static stopAnimation(element) {
        const targetElement = typeof element === 'string' ? document.querySelector(element) : element;
        if (!targetElement) {
            return;
        }
        
        // 停止 anime.js 动画
        const animation = AnimateManager._activeAnimations.get(targetElement);
        if (animation) {
            try {
                if (typeof animation.pause === 'function') {
                    animation.pause();
                }
                if (typeof animation.remove === 'function') {
                    animation.remove();
                }
            } catch (e) {
                // 忽略错误
            }
            AnimateManager._activeAnimations.delete(targetElement);
        }
        
        const anime = AnimateManager.getAnimeInstance();
        if (anime && typeof anime.remove === 'function') {
            try {
                anime.remove(targetElement);
            } catch (e) {
                // 忽略错误
            }
        }
    }
    
    /**
     * 添加动画类到元素（不等待动画完成，立即应用）
     * @param {HTMLElement|SVGElement|string} element 目标元素
     * @param {string} category 类别
     * @param {string} action 操作
     * @param {Object} customConfig 自定义配置（可选，会覆盖默认配置）
     * @returns {Object} 动画配置
     */
    static addAnimationClasses(element, category, action, customConfig = null) {
        if (!element) {
            KernelLogger.warn("AnimateManager", "添加动画失败：元素不存在");
            return null;
        }
        
        let config = AnimateManager.getAnimation(category, action);
        if (!config) {
            return null;
        }
        
        // 如果提供了自定义配置，合并到默认配置中
        if (customConfig) {
            config = { ...config, ...customConfig };
        }
        
        // 如果是 KEYFRAMES 类型，使用 CSS 动画
        if (category === 'KEYFRAMES') {
            const targetElement = typeof element === 'string' ? document.querySelector(element) : element;
            if (targetElement) {
                AnimateManager.applyKeyframeAnimation(targetElement, category, action);
            }
            return config;
        }
        
        // 确保 anime.js 已加载（同步获取）
        let anime = AnimateManager.getAnimeInstance();
        if (!anime || typeof anime !== 'function') {
            // 尝试异步加载
            AnimateManager.ensureAnimeLoaded().catch(() => {});
            // 再次尝试获取
            anime = AnimateManager.getAnimeInstance();
            if (!anime || typeof anime !== 'function') {
                KernelLogger.warn("AnimateManager", `anime.js 未加载或不是函数，类型: ${typeof anime}`);
                return null;
            }
        }
        
        // 停止之前的动画
        AnimateManager.stopAnimation(element);
        
        // 确保 element 是有效的 DOM 元素或选择器
        let targetElement = element;
        if (typeof element === 'string') {
            targetElement = document.querySelector(element);
            if (!targetElement) {
                KernelLogger.warn("AnimateManager", `无法找到目标元素: ${element}`);
                return null;
            }
        } else if (!element || !(element instanceof HTMLElement || element instanceof SVGElement)) {
            KernelLogger.warn("AnimateManager", "目标元素无效", { element, type: typeof element });
            return null;
        }
        
        // 构建 anime.js 配置（只包含 anime.js 支持的属性）
        // 注意：anime.js v4 使用 'ease' 而不是 'easing'
        const animeConfig = {
            targets: targetElement,
            duration: config.duration || ANIMATE_DURATIONS.DEFAULT,
            ease: config.easing || config.ease || 'easeOutCubic'  // 支持 easing 和 ease 两种写法
        };
        
        // 添加动画属性（opacity, scale, translateX, translateY 等）
        // 注意：不要直接展开 config，因为可能包含 anime.js 不支持的属性
        if (config.opacity !== undefined) {
            animeConfig.opacity = config.opacity;
        }
        if (config.scale !== undefined) {
            animeConfig.scale = config.scale;
        }
        if (config.translateX !== undefined) {
            animeConfig.translateX = config.translateX;
        }
        if (config.translateY !== undefined) {
            animeConfig.translateY = config.translateY;
        }
        if (config.rotate !== undefined) {
            animeConfig.rotate = config.rotate;
        }
        if (config.filter !== undefined) {
            animeConfig.filter = config.filter;
        }
        
        // 最终验证 targetElement 是否有效（在构建配置之后，执行动画之前）
        if (!targetElement || !(targetElement instanceof HTMLElement || targetElement instanceof SVGElement)) {
            KernelLogger.warn("AnimateManager", "targetElement 验证失败，无法执行动画", { 
                targetElement, 
                type: typeof targetElement,
                isHTMLElement: targetElement instanceof HTMLElement,
                isSVGElement: targetElement instanceof SVGElement,
                element: element
            });
            return null;
        }
        
        // 执行动画前再次验证 targets
        if (!animeConfig.targets || !(animeConfig.targets instanceof HTMLElement || animeConfig.targets instanceof SVGElement)) {
            KernelLogger.warn("AnimateManager", "animeConfig.targets 无效，无法执行动画", { 
                targets: animeConfig.targets,
                type: typeof animeConfig.targets,
                targetElement: targetElement
            });
            return null;
        }
        
        // 验证配置中是否有动画属性（至少需要一个动画属性）
        const hasAnimationProperty = animeConfig.opacity !== undefined || 
                                    animeConfig.scale !== undefined || 
                                    animeConfig.translateX !== undefined || 
                                    animeConfig.translateY !== undefined || 
                                    animeConfig.rotate !== undefined || 
                                    animeConfig.filter !== undefined;
        
        if (!hasAnimationProperty) {
            KernelLogger.warn("AnimateManager", "动画配置中没有有效的动画属性", { config: animeConfig });
            return null;
        }
        
        // 执行动画
        let animation;
        try {
            // anime.js v4 API: animate(targets, parameters)
            // 需要将配置拆分为 targets 和 parameters 两个参数
            const targets = animeConfig.targets;
            // 从配置中提取 targets，其余作为 parameters
            const { targets: _, ...parameters } = animeConfig;
            
            animation = anime(targets, parameters);
        } catch (error) {
            KernelLogger.warn("AnimateManager", `执行动画失败: ${error.message}`, { 
                error: error.message,
                stack: error.stack,
                targetElement: targetElement ? {
                    tagName: targetElement.tagName,
                    id: targetElement.id,
                    className: targetElement.className
                } : null,
                targetsType: typeof animeConfig.targets,
                targetsIsElement: animeConfig.targets instanceof HTMLElement || animeConfig.targets instanceof SVGElement,
                config: {
                    duration: animeConfig.duration,
                    ease: animeConfig.ease,
                    hasOpacity: animeConfig.opacity !== undefined,
                    hasScale: animeConfig.scale !== undefined,
                    hasTranslateY: animeConfig.translateY !== undefined
                }
            });
            return null;
        }
        
        // 保存动画引用
        if (targetElement && animation) {
            AnimateManager._activeAnimations.set(targetElement, animation);
        }
        
        return config;
    }
    
    /**
     * 获取动画时长
     * @param {string} category 类别
     * @param {string} action 操作
     * @returns {number} 动画时长（毫秒）
     */
    static getAnimationDuration(category, action) {
        const config = AnimateManager.getAnimation(category, action);
        if (!config) {
            return ANIMATE_DURATIONS.DEFAULT;
        }
        
        return config.duration || ANIMATE_DURATIONS.DEFAULT;
    }
    
    /**
     * 应用 CSS keyframes 动画（通过内联样式）
     * @param {HTMLElement|SVGElement} element 目标元素
     * @param {string} category 类别（如 'KEYFRAMES'）
     * @param {string} action 操作（如 'NETWORK_PULSE'）
     */
    static applyKeyframeAnimation(element, category, action) {
        if (!element) {
            KernelLogger.warn("AnimateManager", "应用 keyframes 动画失败：元素不存在");
            return;
        }
        
        const config = AnimateManager.getAnimation(category, action);
        if (!config || !config.animation) {
            KernelLogger.warn("AnimateManager", `未找到 keyframes 动画配置: ${category}.${action}`);
            return;
        }
        
        // 直接应用内联样式动画
        element.style.animation = config.animation;
    }
    
    /**
     * 移除 CSS keyframes 动画
     * @param {HTMLElement|SVGElement} element 目标元素
     */
    static removeKeyframeAnimation(element) {
        if (!element) {
            return;
        }
        
        element.style.animation = '';
    }
    
    /**
     * 移除元素上的所有动画类（兼容方法，用于 animate.css）
     * 注意：此方法仅供程序内部使用，系统动画不使用 animate.css
     */
    static removeAnimationClasses(element) {
        if (!element) {
            return;
        }
        
        // 停止 anime.js 动画
        AnimateManager.stopAnimation(element);
        
        // 移除所有动画效果类（通过检查类名是否以 animate__ 开头）
        const classesToRemove = [];
        element.classList.forEach(className => {
            if (className.startsWith('animate__')) {
                classesToRemove.push(className);
            }
        });
        classesToRemove.forEach(className => {
            element.classList.remove(className);
        });
    }
    
    /**
     * 应用自定义动画（使用 anime.js）
     * @param {HTMLElement|SVGElement|string} element 目标元素
     * @param {Object} config 动画配置（anime.js 配置格式）
     * @param {Object} options 选项 { delay: number, callback: Function, complete: Function }
     * @returns {Promise<void>} 动画完成的Promise
     */
    static async applyCustomAnimation(element, config, options = {}) {
        if (!element || !config) {
            KernelLogger.warn("AnimateManager", "应用自定义动画失败：参数不完整");
            return;
        }
        
        const anime = AnimateManager.getAnimeInstance();
        if (!anime) {
            KernelLogger.warn("AnimateManager", "anime.js 未加载，无法应用动画");
            return;
        }
        
        const { delay = 0, callback = null, complete = null } = options;
        
        // 停止之前的动画
        AnimateManager.stopAnimation(element);
        
        // 构建 anime.js 配置
        const animeConfig = {
            targets: element,
            delay: delay,
            ...config
        };
        
        // 添加完成回调
        if (callback || complete) {
            animeConfig.complete = () => {
                if (callback) callback();
                if (complete) complete();
            };
        }
        
        // 执行动画
        let animation;
        try {
            animation = anime(animeConfig);
        } catch (error) {
            KernelLogger.warn("AnimateManager", `执行自定义动画失败: ${error.message}`);
            if (callback) callback();
            if (complete) complete();
            return Promise.resolve();
        }
        
        // 保存动画引用
        const targetElement = typeof element === 'string' ? document.querySelector(element) : element;
        if (targetElement && animation) {
            AnimateManager._activeAnimations.set(targetElement, animation);
        }
        
        // 等待动画完成
        return new Promise((resolve) => {
            if (!animation) {
                resolve();
                return;
            }
            
            if (animation.finished && typeof animation.finished.then === 'function') {
                animation.finished.then(() => {
                    if (targetElement) {
                        AnimateManager._activeAnimations.delete(targetElement);
                    }
                    resolve();
                }).catch(() => {
                    if (targetElement) {
                        AnimateManager._activeAnimations.delete(targetElement);
                    }
                    resolve();
                });
            } else {
                const duration = config.duration || ANIMATE_DURATIONS.DEFAULT;
                setTimeout(() => {
                    if (targetElement) {
                        AnimateManager._activeAnimations.delete(targetElement);
                    }
                    resolve();
                }, duration + (delay || 0));
            }
        });
    }
    
    /**
     * 应用悬停动画（用于图标、按钮等）
     * @param {HTMLElement|SVGElement|string} element 目标元素
     */
    static applyHoverAnimation(element) {
        return AnimateManager.addAnimationClasses(element, 'ICON', 'HOVER');
    }
    
    /**
     * 移除悬停动画
     * @param {HTMLElement|SVGElement|string} element 目标元素
     */
    static removeHoverAnimation(element) {
        AnimateManager.stopAnimation(element);
        // 恢复到原始状态
        const targetElement = typeof element === 'string' ? document.querySelector(element) : element;
        if (targetElement) {
            const anime = AnimateManager.getAnimeInstance();
            if (anime) {
                anime({
                    targets: targetElement,
                    duration: 200,
                    easing: 'easeInCubic',
                    scale: 1,
                    rotate: 0
                });
            }
        }
    }
    
    /**
     * 应用点击反馈动画
     * @param {HTMLElement|SVGElement|string} element 目标元素
     */
    static applyClickAnimation(element) {
        return AnimateManager.addAnimationClasses(element, 'ICON', 'CLICK');
    }
    
    /**
     * 为程序提供 animate.css 类名（仅供程序内部使用）
     * @returns {Object} ANIMATE_CLASSES 对象
     */
    static getAnimateClasses() {
        return ANIMATE_CLASSES;
    }
    
    // 初始化标志
    static _initialized = false;
}

// 异步初始化（等待 anime.js 加载）
AnimateManager.init().catch(error => {
    KernelLogger.error("AnimateManager", `初始化失败: ${error.message}`);
});

// 发布依赖加载完成信号
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/drive/animateManager.js");
} else if (typeof document !== 'undefined' && document.body) {
    // 降级方案：直接发布事件
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/drive/animateManager.js",
            },
        })
    );
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("AnimateManager", "已发布依赖加载信号（降级方案）");
    }
} else {
    // 延迟发布信号
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                DependencyConfig.publishSignal("../kernel/drive/animateManager.js");
            } else {
                document.body.dispatchEvent(
                    new CustomEvent("dependencyLoaded", {
                        detail: {
                            name: "../kernel/drive/animateManager.js",
                        },
                    })
                );
            }
        });
    } else {
        setTimeout(() => {
            if (document.body) {
                if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                    DependencyConfig.publishSignal("../kernel/drive/animateManager.js");
                } else {
                    document.body.dispatchEvent(
                        new CustomEvent("dependencyLoaded", {
                            detail: {
                                name: "../kernel/drive/animateManager.js",
                            },
                        })
                    );
                }
            }
        }, 0);
    }
}
