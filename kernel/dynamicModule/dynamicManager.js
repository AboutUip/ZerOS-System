// 动态模块管理器
// 负责管理内核动态加载的模块（如 html2canvas 等第三方库）
// 提供统一的模块注册、加载和管理接口

KernelLogger.info("DynamicManager", "模块初始化");

// 动态模块资源定义
// 格式：
// 对于 JavaScript 模块：
// - script: 脚本文件路径（必需）
// - styles: 样式文件路径数组（可选）
// - metadata: 模块元数据（可选）
//   - name: 模块名称
//   - version: 版本号
//   - description: 描述
//   - globalName: 全局变量名（模块加载后在全局作用域中的名称，如 'html2canvas'）
//   - autoLoad: boolean - 是否自动加载（默认 false）
//   - dependencies: Array<string> - 依赖的其他模块名称（可选）
//   - type: 'js' (默认) - 模块类型
//
// 对于纯 CSS 模块：
// - styles: 样式文件路径（字符串）或样式文件路径数组（必需）
// - metadata: 模块元数据（可选）
//   - name: 模块名称
//   - version: 版本号
//   - description: 描述
//   - autoLoad: boolean - 是否自动加载（默认 false）
//   - dependencies: Array<string> - 依赖的其他模块名称（可选）
//   - type: 'css' - 模块类型（必需，标识为纯 CSS 模块）
const DYNAMIC_MODULES = {
    // html2canvas - 用于生成窗口快照
    "html2canvas": {
        script: "../kernel/dynamicModule/libs/html2canvas.min.js",
        // 也可以使用本地路径: "lib/html2canvas/html2canvas.min.js"
        metadata: {
            name: "html2canvas",
            version: "1.4.1",
            description: "将DOM元素渲染为Canvas的JavaScript库",
            globalName: "html2canvas", // 加载后在 window.html2canvas
            autoLoad: false, // 按需加载
            dependencies: [] // 无依赖
        }
    },
    "jquery": {
        script: "../kernel/dynamicModule/libs/jquery-3.7.1.min.js",
        metadata: {
            name: "jquery",
            version: "3.6.0",
            description: "jQuery JavaScript库",
            globalName: "jQuery",
            autoLoad: true,
            dependencies: []
        }
    },
    
    // anime.js - 轻量级JavaScript动画库
    "anime": {
        script: "../kernel/dynamicModule/libs/anime-4.2.2/dist/bundles/anime.umd.min.js",
        metadata: {
            name: "anime",
            version: "4.2.2",
            description: "anime.js - 轻量级JavaScript动画库",
            globalName: "anime", // 加载后在 window.anime
            autoLoad: false, // 按需加载
            dependencies: [] // 无依赖
        }
    },
    
    // Animate.css - CSS动画库
    "animate-css": {
        styles: "../kernel/dynamicModule/libs/animate.min.css",
        metadata: {
            name: "animate-css",
            version: "4.1.1",
            description: "Animate.css - 跨浏览器的CSS动画库",
            type: "css",
            autoLoad: true, // 自动加载，用于窗口动画
            dependencies: []
        }
    },

    // pixi.js
    "pixi.js": {
        script: "../kernel/dynamicModule/libs/pixi.min.js",
        metadata: {
            name: "pixi.js",
            version: "8.14.3",
            description: "Pixi.js - 2D游戏引擎",
            globalName: "PIXI",
            autoLoad: false,
            dependencies: []
        }
    },

    // three.js
    "three.js": {
        script: "../kernel/dynamicModule/libs/threejs/three.webgpu.min.js",
        metadata: {
            name: "three.js",
            version: "0.172.0",
            description: "Three.js - 3D渲染引擎 (WebGPU)",
            globalName: "THREE",
            autoLoad: false,
            dependencies: [],
            moduleType: "esm"  // ES 模块格式
        }
    },

    // konva.js
    "konva.js": {
        script: "../kernel/dynamicModule/libs/konva.min.js",
        metadata: {
            name: "konva.js",
            version: "10.0.12",
            description: "Konva.js - canvas绘图引擎",
            globalName: "Konva",
            autoLoad: false,
            dependencies: []
        }
    },

    // howler.js - 音频播放库
    "howler": {
        script: "../kernel/dynamicModule/libs/howler/howler.min.js",
        metadata: {
            name: "howler",
            version: "2.2.4",
            description: "Howler.js - 现代Web音频库，支持多种音频格式",
            globalName: "Howl",
            autoLoad: false,
            dependencies: []
        }
    },

    // jsencrypt.js - 加密库
    "jsencrypt": {
        script: "../kernel/dynamicModule/libs/jsencrypt-3.5.4/bin/jsencrypt.min.js",
        metadata: {
            name: "jsencrypt",
            version: "3.5.4",
            description: "jsencrypt.js - 加密库",
            globalName: "JSEncrypt",
            autoLoad: false,
            dependencies: []
        }
    },

    // mediapipe (vision tasks) - 手势识别和视觉任务
    // 使用示例（本地文件）：
    // const vision = await DynamicManager.loadModule('mediapipe');
    // const { HandLandmarker, FilesetResolver } = vision;
    // const filesetResolver = await FilesetResolver.forVisionTasks('../kernel/dynamicModule/libs/mediapipe/wasm');
    // const handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
    //     baseOptions: { modelAssetPath: '../kernel/dynamicModule/libs/mediapipe/models/hand_landmarker.task' },
    //     numHands: 2
    // });
    "mediapipe": {
        script: "/kernel/dynamicModule/libs/mediapipe/vision_bundle.mjs",
        metadata: {
            name: "mediapipe",
            version: "0.10.3",
            description: "Mediapipe Vision Tasks - 手势识别和视觉任务库（支持HandLandmarker、GestureRecognizer、PoseLandmarker等）",
            globalName: "vision", // MediaPipe Vision Tasks 导出的是 vision 对象
            moduleType: "esm", // ES 模块格式（.mjs 文件）
            autoLoad: false,
            dependencies: []
        }
    },

    // Ace Editor - 功能强大的代码编辑器（预构建 src-min-noconflict 版本）
    // 使用示例：
    // const ace = await DynamicManager.loadModule('ace');
    // const editor = ace.edit('editor-container');
    // editor.setTheme('ace/theme/monokai');
    // editor.session.setMode('ace/mode/javascript');
    // 注意：使用预构建版本，直接暴露到 window.ace，无需 CommonJS 环境
    "ace": {
        script: "../kernel/dynamicModule/libs/ace/ace.js",
        styles: null, // 预构建版本的 CSS 已包含在 JS 中或需要单独加载
        metadata: {
            name: "ace",
            version: "1.43.5",
            description: "Ace Editor - 功能强大的代码编辑器，支持语法高亮、代码补全、多光标编辑等",
            globalName: "ace", // 预构建版本直接暴露到 window.ace
            autoLoad: false, // 按需加载
            dependencies: [] // 无依赖
        }
    },

    // Highlight.js - 语法高亮库
    // 使用示例：
    // const hljs = await DynamicManager.loadModule('highlight');
    // hljs.highlightAll(); // 自动高亮页面中所有 <pre><code> 标签
    // 或
    // const highlighted = hljs.highlight('const x = 1;', { language: 'javascript' });
    "highlight": {
        script: "../kernel/dynamicModule/libs/highligth/highlight.min.js",
        metadata: {
            name: "highlight",
            version: "11.9.0",
            description: "Highlight.js - 语法高亮库，支持200+种编程语言的语法高亮",
            globalName: "hljs", // 加载后在 window.hljs
            autoLoad: false, // 按需加载
            dependencies: [] // 无依赖
        }
    }
    
    // 纯 CSS 模块示例
    // "bootstrap-css": {
    //     styles: "../kernel/dynamicModule/libs/bootstrap.min.css",
    //     metadata: {
    //         name: "bootstrap-css",
    //         version: "5.3.0",
    //         description: "Bootstrap CSS框架",
    //         type: "css", // 标识为纯 CSS 模块
    //         autoLoad: false,
    //         dependencies: []
    //     }
    // },
    // 
    // 多个 CSS 文件的示例
    // "theme-pack": {
    //     styles: [
    //         "../kernel/dynamicModule/libs/theme-base.css",
    //         "../kernel/dynamicModule/libs/theme-components.css"
    //     ],
    //     metadata: {
    //         name: "theme-pack",
    //         version: "1.0.0",
    //         description: "主题样式包",
    //         type: "css",
    //         autoLoad: false,
    //         dependencies: []
    //     }
    // }
    
    // 可以在这里添加更多动态模块
    // 例如：
    // "lodash": {
    //     script: "https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js",
    //     metadata: {
    //         name: "lodash",
    //         version: "4.17.21",
    //         description: "JavaScript实用工具库",
    //         globalName: "_",
    //         autoLoad: false,
    //         dependencies: []
    //     }
    // }
};

class DynamicManager {
    // 已加载的模块集合 Set<moduleName>
    static _loadedModules = new Set();
    
    // 加载中的模块 Map<moduleName, Promise>
    static _loadingModules = new Map();
    
    // 模块加载状态 Map<moduleName, { loaded: boolean, error: Error|null, loadTime: number }>
    static _moduleStatus = new Map();
    
    /**
     * 初始化动态模块管理器
     */
    static init() {
        if (DynamicManager._initialized) {
            return;
        }
        
        DynamicManager._initialized = true;
        
        // 注册到POOL
        DynamicManager._registerToPool();
        
        // 自动加载需要自动加载的模块
        DynamicManager._loadAutoLoadModules();
        
        KernelLogger.info("DynamicManager", "动态模块管理器初始化完成");
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
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "DynamicManager", DynamicManager);
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "DYNAMIC_MODULES", DYNAMIC_MODULES);
            } catch (e) {
                KernelLogger.warn("DynamicManager", `注册到POOL失败: ${e.message}`);
            }
        }
    }
    
    /**
     * 获取模块定义
     * @param {string} moduleName 模块名称
     * @returns {Object|null} 模块定义
     */
    static getModule(moduleName) {
        if (!moduleName || typeof moduleName !== 'string') {
            return null;
        }
        
        return DYNAMIC_MODULES[moduleName] || null;
    }
    
    /**
     * 检查模块是否存在
     * @param {string} moduleName 模块名称
     * @returns {boolean} 是否存在
     */
    static hasModule(moduleName) {
        return moduleName in DYNAMIC_MODULES;
    }
    
    /**
     * 检查模块是否已加载
     * @param {string} moduleName 模块名称
     * @returns {boolean} 是否已加载
     */
    static isModuleLoaded(moduleName) {
        return DynamicManager._loadedModules.has(moduleName);
    }
    
    /**
     * 获取模块的全局对象
     * @param {string} moduleName 模块名称
     * @returns {Object|Function|null} 模块的全局对象（CSS模块返回null）
     */
    static getModuleGlobal(moduleName) {
        const module = DynamicManager.getModule(moduleName);
        if (!module) {
            return null;
        }
        
        // CSS 模块没有全局对象
        const moduleType = module.metadata?.type || (module.script ? 'js' : 'css');
        if (moduleType === 'css') {
            return null;
        }
        
        if (!module.metadata || !module.metadata.globalName) {
            return null;
        }
        
        const globalName = module.metadata.globalName;
        
        // 尝试从 window 获取
        if (typeof window !== 'undefined' && window[globalName]) {
            return window[globalName];
        }
        
        // 尝试从 globalThis 获取
        if (typeof globalThis !== 'undefined' && globalThis[globalName]) {
            return globalThis[globalName];
        }
        
        return null;
    }
    
    /**
     * 加载动态模块
     * @param {string} moduleName 模块名称
     * @param {Object} options 选项 { force: boolean, checkDependencies: boolean }
     * @returns {Promise<Object|null>} 返回模块的全局对象（CSS模块返回null）
     */
    static async loadModule(moduleName, options = {}) {
        const { force = false, checkDependencies = true } = options;
        
        // 检查模块是否存在
        const module = DynamicManager.getModule(moduleName);
        if (!module) {
            throw new Error(`模块 ${moduleName} 不存在`);
        }
        
        const moduleType = module.metadata?.type || (module.script ? 'js' : 'css');
        
        // 如果已加载且不强制重新加载，直接返回
        if (DynamicManager.isModuleLoaded(moduleName) && !force) {
            // CSS 模块直接返回 null
            if (moduleType === 'css') {
                return null;
            }
            
            const globalObj = DynamicManager.getModuleGlobal(moduleName);
            if (globalObj) {
                return globalObj;
            } else {
                // 如果全局对象不存在，可能需要重新加载
                DynamicManager._loadedModules.delete(moduleName);
            }
        }
        
        // 如果正在加载，等待加载完成
        if (DynamicManager._loadingModules.has(moduleName)) {
            await DynamicManager._loadingModules.get(moduleName);
            return DynamicManager.getModuleGlobal(moduleName);
        }
        
        // 开始加载
        const loadPromise = DynamicManager._doLoadModule(moduleName, module, checkDependencies);
        DynamicManager._loadingModules.set(moduleName, loadPromise);
        
        try {
            const result = await loadPromise;
            DynamicManager._loadingModules.delete(moduleName);
            return result;
        } catch (error) {
            DynamicManager._loadingModules.delete(moduleName);
            throw error;
        }
    }
    
    /**
     * 执行模块加载（内部方法）
     * @param {string} moduleName 模块名称
     * @param {Object} module 模块定义
     * @param {boolean} checkDependencies 是否检查依赖
     * @returns {Promise<Object|null>} 返回模块的全局对象（CSS模块返回null）
     */
    static async _doLoadModule(moduleName, module, checkDependencies) {
        const startTime = Date.now();
        const moduleType = module.metadata?.type || (module.script ? 'js' : 'css');
        
        try {
            // 检查并加载依赖
            if (checkDependencies && module.metadata && module.metadata.dependencies) {
                const dependencies = module.metadata.dependencies;
                for (const depName of dependencies) {
                    if (!DynamicManager.isModuleLoaded(depName)) {
                        KernelLogger.debug("DynamicManager", `加载模块 ${moduleName} 的依赖: ${depName}`);
                        await DynamicManager.loadModule(depName, { checkDependencies: true });
                    }
                }
            }
            
            // 处理纯 CSS 模块
            if (moduleType === 'css') {
                // 验证 CSS 模块定义
                if (!module.styles) {
                    throw new Error(`CSS模块 ${moduleName} 必须提供 styles 字段`);
                }
                
                // 加载样式表
                const stylePaths = Array.isArray(module.styles) ? module.styles : [module.styles];
                for (const stylePath of stylePaths) {
                    await DynamicManager._loadStylesheet(stylePath);
                }
                
                // 标记为已加载
                DynamicManager._loadedModules.add(moduleName);
                const loadTime = Date.now() - startTime;
                
                DynamicManager._moduleStatus.set(moduleName, {
                    loaded: true,
                    error: null,
                    loadTime: loadTime
                });
                
                KernelLogger.info("DynamicManager", `CSS模块 ${moduleName} 加载成功`, {
                    loadTime: `${loadTime}ms`,
                    styles: stylePaths
                });
                
                // CSS 模块不返回全局对象
                return null;
            }
            
            // 处理 JavaScript 模块
            // 加载样式表（如果有）
            if (module.styles && Array.isArray(module.styles)) {
                for (const stylePath of module.styles) {
                    await DynamicManager._loadStylesheet(stylePath);
                }
            }
            
            // 验证脚本路径
            if (!module.script) {
                throw new Error(`JavaScript模块 ${moduleName} 必须提供 script 字段`);
            }
            
            // 检查是否是 ES 模块
           const isESModule = module.script.endsWith('.mjs') || 
                              (module.metadata && module.metadata.moduleType === 'esm') ||
                              module.metadata?.moduleType === 'esm';
           const isCommonJS = module.script.endsWith('.cjs') || 
                              (module.metadata && module.metadata.moduleType === 'cjs');
           
           let globalObj = null;
           
           if (isESModule) {
                // ES 模块使用动态导入
                // 将 fullUrl 定义在 try 块外，以便在 catch 块中访问
                let fullUrl = null;
                try {
                    // 将相对路径转换为绝对 URL
                    let moduleUrl = module.script;
                    if (!moduleUrl.startsWith('http://') && !moduleUrl.startsWith('https://') && !moduleUrl.startsWith('/')) {
                        // 相对路径，需要转换为绝对路径
                        // 对于以 ../ 开头的路径，直接手动处理（不依赖 new URL()，因为它会基于当前页面路径解析）
                        if (moduleUrl.startsWith('../')) {
                            // 移除开头的 ../
                            const relativePath = moduleUrl.replace(/^\.\.\//, '');
                            // 如果 relativePath 以 kernel/ 开头，直接使用
                            if (relativePath.startsWith('kernel/')) {
                                moduleUrl = '/' + relativePath;
                            } else {
                                // 否则使用默认路径
                                moduleUrl = '/kernel/dynamicModule/' + relativePath;
                            }
                        } else if (moduleUrl.startsWith('./')) {
                            // 以 ./ 开头的相对路径
                            moduleUrl = '/kernel/dynamicModule/' + moduleUrl.substring(2);
                        } else {
                            // 其他相对路径，尝试使用 new URL() 解析
                            try {
                                const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/' : 'http://localhost/';
                                const resolvedUrl = new URL(moduleUrl, baseUrl);
                                moduleUrl = resolvedUrl.pathname;
                            } catch (urlError) {
                                // 如果 URL 解析失败，使用默认路径
                                moduleUrl = '/kernel/dynamicModule/' + moduleUrl;
                            }
                        }
                    }
                    
                    // 构建完整 URL
                    // 对于 ES 模块，直接使用原始路径，不使用代理
                    // 原因：ES 模块内部的相对路径导入会基于当前模块 URL 解析
                    // 如果使用代理 URL，相对路径会被错误解析
                    if (moduleUrl.startsWith('http')) {
                        fullUrl = moduleUrl;
                    } else {
                        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8089';
                        // ES 模块直接使用原始路径，确保相对导入能正确解析
                        // 服务器应该已经配置了正确的 MIME 类型（通过 .htaccess 或 router.php）
                        fullUrl = `${origin}${moduleUrl.startsWith('/') ? '' : '/'}${moduleUrl}`;
                    }
                    
                    KernelLogger.debug("DynamicManager", `ES 模块动态导入: ${fullUrl}`);
                    
                    // 直接使用 import() 动态导入 ES 模块
                    const moduleExports = await import(fullUrl);
                    const globalName = module.metadata?.globalName;
                    if (globalName) {
                        // 处理不同类型的 ES 模块导出
                        let exportObj = null;
                        
                        // 检查是否有默认导出（如 mediapipe 的 vision 对象）
                        if (moduleExports.default) {
                            exportObj = moduleExports.default;
                        } else if (moduleExports[globalName]) {
                            // 检查是否有与 globalName 同名的导出
                            exportObj = moduleExports[globalName];
                        } else {
                            // 如果没有默认导出，将所有命名导出组合成一个对象
                            // 这样可以通过 THREE.Scene, THREE.Mesh 等方式访问（Three.js 的情况）
                            // 或者通过 vision.HandLandmarker 等方式访问（MediaPipe 的情况）
                            exportObj = moduleExports;
                        }
                        
                        // 将对象挂载到全局作用域
                        if (typeof window !== 'undefined') {
                            window[globalName] = exportObj;
                        }
                        if (typeof globalThis !== 'undefined') {
                            globalThis[globalName] = exportObj;
                        }
                        globalObj = exportObj;
                    } else {
                        // 没有指定 globalName，直接返回模块导出
                        globalObj = moduleExports.default || moduleExports;
                    }
                } catch (importError) {
                    // 记录详细的错误信息，包括请求的 URL
                    KernelLogger.warn("DynamicManager", `ES 模块动态导入失败: ${importError.message}`, {
                        stack: importError.stack,
                        moduleUrl: module.script,
                        fullUrl: fullUrl || 'not set',
                        errorName: importError.name,
                        errorMessage: importError.message
                    });
                    
                    // 尝试获取更详细的错误信息
                    let errorDetails = importError.message;
                    if (importError.stack) {
                        errorDetails += '\n' + importError.stack;
                    }
                    
                    // 如果 fullUrl 未设置，说明路径处理阶段就出错了
                    if (!fullUrl) {
                        errorDetails = `路径处理失败: ${module.script}\n${errorDetails}`;
                    }
                    
                    throw new Error(`ES 模块 ${moduleName} 加载失败: ${errorDetails}`);
                }
            } else {
                // 传统脚本使用 script 标签加载
                // 对于 ace 模块（预构建版本），直接加载即可
                if (moduleName === 'ace') {
                    // 预构建版本直接暴露到 window.ace，无需 CommonJS 环境
                    let scriptUrl = module.script;
                        
                        // 处理相对路径
                        if (!scriptUrl.startsWith('http://') && !scriptUrl.startsWith('https://')) {
                            if (scriptUrl.startsWith('../')) {
                                const relativePath = scriptUrl.replace(/^\.\.\//, '');
                                if (relativePath.startsWith('kernel/')) {
                                    scriptUrl = '/' + relativePath;
                                } else {
                                    scriptUrl = '/kernel/dynamicModule/' + relativePath;
                                }
                            } else if (scriptUrl.startsWith('./')) {
                                scriptUrl = '/kernel/dynamicModule/' + scriptUrl.substring(2);
                            } else if (!scriptUrl.startsWith('/')) {
                                scriptUrl = '/kernel/dynamicModule/' + scriptUrl;
                            }
                            
                            // 构建完整 URL
                            if (typeof window !== 'undefined') {
                                const origin = window.location.origin;
                                scriptUrl = origin + scriptUrl;
                            } else {
                                scriptUrl = 'http://localhost:8089' + scriptUrl;
                            }
                        }
                        
                    KernelLogger.debug("DynamicManager", `加载 Ace Editor 预构建版本: ${scriptUrl}`);
                    
                    // 预构建版本直接暴露到 window.ace，无需 CommonJS 环境
                    const script = document.createElement('script');
                    script.src = scriptUrl;
                    script.async = false; // 同步加载，确保顺序
                    
                    const loadPromise = new Promise((resolve, reject) => {
                        script.onload = () => {
                            // 等待脚本执行完成
                            setTimeout(() => {
                                // 预构建版本直接暴露到 window.ace
                                if (typeof window !== 'undefined' && window.ace) {
                                    // 验证关键方法是否存在
                                    if (typeof window.ace.edit === 'function' && 
                                        typeof window.ace.createEditSession === 'function') {
                                        resolve();
                                    } else {
                                        // 再等待一下，可能还在加载中
                                        setTimeout(() => {
                                            if (window.ace && 
                                                typeof window.ace.edit === 'function' && 
                                                typeof window.ace.createEditSession === 'function') {
                                                resolve();
                                            } else {
                                                reject(new Error('Ace Editor 加载完成，但关键方法缺失'));
                                            }
                                        }, 500);
                                    }
                                } else {
                                    reject(new Error('Ace Editor 加载失败：无法在 window.ace 找到对象'));
                                }
                            }, 200);
                        };
                        script.onerror = () => {
                            reject(new Error('加载 ace.js 失败'));
                        };
                    });
                    
                    document.head.appendChild(script);
                    await loadPromise;
                    
                    // 从 window.ace 获取对象
                    if (typeof window !== 'undefined' && window.ace) {
                        // 同时设置到 globalThis
                        if (typeof globalThis !== 'undefined') {
                            globalThis.ace = window.ace;
                        }
                        globalObj = window.ace;
                    } else {
                        throw new Error('Ace Editor 加载失败：无法在 window.ace 找到对象');
                    }
                } else {
                    // 其他 CommonJS 或传统脚本
                    await DynamicManager._loadScript(module.script, module.metadata);
                    
                    // 等待一小段时间，让脚本完全执行
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // 验证模块是否已加载到全局作用域
                    globalObj = DynamicManager.getModuleGlobal(moduleName);
                    
                    // 如果直接获取失败，尝试多种方式
                    if (!globalObj) {
                        const globalName = module.metadata?.globalName;
                        if (globalName) {
                            // 尝试从 window 直接获取
                            if (typeof window !== 'undefined') {
                                globalObj = window[globalName];
                            }
                            // 尝试从 globalThis 获取
                            if (!globalObj && typeof globalThis !== 'undefined') {
                                globalObj = globalThis[globalName];
                            }
                        }
                    }
                }
            }
            
            if (!globalObj) {
                throw new Error(`模块 ${moduleName} 加载后未在全局作用域中找到 (globalName: ${module.metadata?.globalName || 'unknown'})`);
            }
            
            // 标记为已加载
            DynamicManager._loadedModules.add(moduleName);
            const loadTime = Date.now() - startTime;
            
            DynamicManager._moduleStatus.set(moduleName, {
                loaded: true,
                error: null,
                loadTime: loadTime
            });
            
            KernelLogger.info("DynamicManager", `模块 ${moduleName} 加载成功`, {
                loadTime: `${loadTime}ms`,
                globalName: module.metadata?.globalName
            });
            
            return globalObj;
        } catch (error) {
            const loadTime = Date.now() - startTime;
            DynamicManager._moduleStatus.set(moduleName, {
                loaded: false,
                error: error,
                loadTime: loadTime
            });
            
            KernelLogger.error("DynamicManager", `模块 ${moduleName} 加载失败: ${error.message}`, {
                loadTime: `${loadTime}ms`
            });
            
            throw error;
        }
    }
    
    /**
     * 加载脚本文件
     * @param {string} path 脚本路径
     * @returns {Promise<void>}
     */
    static _loadScript(path, moduleMetadata = null) {
        return new Promise((resolve, reject) => {
            // 检查是否已经加载过
            const existingScript = document.querySelector(`script[src="${path}"]`);
            if (existingScript) {
                KernelLogger.debug("DynamicManager", `脚本已加载: ${path}`);
                resolve();
                return;
            }
            
            // 检查是否是 ES 模块
            const isESModule = path.endsWith('.mjs') || 
                              (moduleMetadata && moduleMetadata.moduleType === 'esm') ||
                              (path.endsWith('.js') && moduleMetadata && moduleMetadata.moduleType === 'esm');
            
            const script = document.createElement('script');
            script.src = path;
            script.async = true;
            script.crossOrigin = 'anonymous'; // 支持跨域加载
            
            // 如果是 ES 模块，设置 type="module"
            if (isESModule) {
                script.type = 'module';
            }
            
            script.onload = () => {
                KernelLogger.debug("DynamicManager", `脚本加载成功: ${path} (${isESModule ? 'ES Module' : 'Script'})`);
                resolve();
            };
            
            script.onerror = () => {
                KernelLogger.error("DynamicManager", `脚本加载失败: ${path}`);
                reject(new Error(`Failed to load script: ${path}`));
            };
            
            document.head.appendChild(script);
        });
    }
    
    /**
     * 加载样式表
     * @param {string} path 样式表路径
     * @returns {Promise<void>}
     */
    static _loadStylesheet(path) {
        return new Promise((resolve, reject) => {
            // 检查是否已经加载过
            const existingLink = document.querySelector(`link[href="${path}"]`);
            if (existingLink) {
                KernelLogger.debug("DynamicManager", `样式表已加载: ${path}`);
                resolve();
                return;
            }
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = path;
            link.crossOrigin = 'anonymous';
            
            link.onload = () => {
                KernelLogger.debug("DynamicManager", `样式表加载成功: ${path}`);
                resolve();
            };
            
            link.onerror = () => {
                KernelLogger.warn("DynamicManager", `样式表加载失败: ${path}（非致命错误）`);
                // 样式表加载失败不影响模块加载
                resolve();
            };
            
            document.head.appendChild(link);
        });
    }
    
    /**
     * 自动加载需要自动加载的模块
     */
    static async _loadAutoLoadModules() {
        const autoLoadModules = [];
        
        for (const [moduleName, module] of Object.entries(DYNAMIC_MODULES)) {
            if (module.metadata && module.metadata.autoLoad === true) {
                autoLoadModules.push(moduleName);
            }
        }
        
        if (autoLoadModules.length > 0) {
            KernelLogger.info("DynamicManager", `发现 ${autoLoadModules.length} 个需要自动加载的模块`, {
                modules: autoLoadModules
            });
            
            // 并行加载所有自动加载的模块
            const loadPromises = autoLoadModules.map(moduleName => 
                DynamicManager.loadModule(moduleName).catch(error => {
                    KernelLogger.warn("DynamicManager", `自动加载模块 ${moduleName} 失败: ${error.message}`);
                })
            );
            
            await Promise.all(loadPromises);
        }
    }
    
    /**
     * 获取模块加载状态
     * @param {string} moduleName 模块名称
     * @returns {Object|null} 加载状态 { loaded: boolean, error: Error|null, loadTime: number }
     */
    static getModuleStatus(moduleName) {
        return DynamicManager._moduleStatus.get(moduleName) || null;
    }
    
    /**
     * 列出所有模块
     * @returns {Array<string>} 模块名称数组
     */
    static listModules() {
        return Object.keys(DYNAMIC_MODULES);
    }
    
    /**
     * 列出已加载的模块
     * @returns {Array<string>} 已加载的模块名称数组
     */
    static listLoadedModules() {
        return Array.from(DynamicManager._loadedModules);
    }
    
    /**
     * 获取所有模块信息
     * @returns {Array<Object>} 模块信息数组
     */
    static getAllModules() {
        return Object.entries(DYNAMIC_MODULES).map(([name, module]) => {
            const moduleType = module.metadata?.type || (module.script ? 'js' : 'css');
            return {
                name: name,
                type: moduleType,
                script: module.script || null,
                styles: module.styles || (moduleType === 'css' ? [] : []),
                metadata: module.metadata || {},
                loaded: DynamicManager.isModuleLoaded(name),
                status: DynamicManager.getModuleStatus(name)
            };
        });
    }
    
    /**
     * 卸载模块（从内存中移除，但脚本仍在DOM中）
     * @param {string} moduleName 模块名称
     */
    static unloadModule(moduleName) {
        if (!DynamicManager.isModuleLoaded(moduleName)) {
            return;
        }
        
        DynamicManager._loadedModules.delete(moduleName);
        DynamicManager._moduleStatus.delete(moduleName);
        
        KernelLogger.info("DynamicManager", `模块 ${moduleName} 已卸载（从内存中移除）`);
    }
    
    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    static getStats() {
        const allModules = DynamicManager.listModules();
        const loadedModules = DynamicManager.listLoadedModules();
        
        return {
            totalModules: allModules.length,
            loadedModules: loadedModules.length,
            modules: allModules,
            loaded: loadedModules
        };
    }
    
    // 初始化标志
    static _initialized = false;
}

// 自动初始化
DynamicManager.init();

// 发布依赖加载完成信号
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/dynamicModule/dynamicManager.js");
} else if (typeof document !== 'undefined' && document.body) {
    // 降级方案：直接发布事件
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/dynamicModule/dynamicManager.js",
            },
        })
    );
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("DynamicManager", "已发布依赖加载信号（降级方案）");
    }
} else {
    // 延迟发布信号
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                DependencyConfig.publishSignal("../kernel/dynamicModule/dynamicManager.js");
            } else {
                document.body.dispatchEvent(
                    new CustomEvent("dependencyLoaded", {
                        detail: {
                            name: "../kernel/dynamicModule/dynamicManager.js",
                        },
                    })
                );
            }
        });
    } else {
        setTimeout(() => {
            if (document.body) {
                if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                    DependencyConfig.publishSignal("../kernel/dynamicModule/dynamicManager.js");
                } else {
                    document.body.dispatchEvent(
                        new CustomEvent("dependencyLoaded", {
                            detail: {
                                name: "../kernel/dynamicModule/dynamicManager.js",
                            },
                        })
                    );
                }
            }
        }, 0);
    }
}

