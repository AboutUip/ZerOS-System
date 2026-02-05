// 该文件用于存放所有应用程序的启动文件和元数据
// 注意：程序必须禁止自动初始化（包括立即调用函数）
// 程序只能调用依赖管理器去注册自己的加载
// 程序必须导出 [程序名(大写全拼)] 对象，并实现 __init__ , __info__ 和 __exit__ 方法
//
// 资源文件支持：
// - script: 主脚本文件路径（必需）
// - styles: 样式文件路径数组（可选）
// - icon: 程序图标路径（可选）
// - assets: 程序资源文件（可选）
//   - 支持字符串（单个资源）或数组（多个资源）
//   - 支持图片（svg, png, jpg, gif, webp, ico）
//   - 支持字体（woff, woff2, ttf, otf, eot）
//   - 支持其他数据文件（JSON等）
//   - 示例: assets: ["D:/application/myapp/assets/icon.svg", "D:/application/myapp/assets/font.woff2"]
// - metadata: 程序元数据（可选）
//   - supportsPreview: boolean (可选) - 是否支持窗口预览快照，如果为true，当程序只有单例运行时，会使用html2canvas生成真实的窗口快照

/**
 * APPLICATION_ASSETS — 系统应用/程序资源清单
 *
 * 描述 (Description):
 * 映射每个应用 ID 到其运行所需的资源路径与元数据。路径为磁盘上实际的 D: 盘绝对路径，
 * 每个条目定义脚本、样式、图标、可选的额外资源以及应用的配置/行为元信息。
 *
 * @typedef {Object} AppMetadata
 * @property {boolean} [autoStart=false] - 是否开机或系统启动时自动启动该应用。是否自动启动。
 * @property {number} [priority] - 应用优先级（数值，可用于窗口/启动/任务栏排序或权限决策）。
 * @property {string} description - 应用简要描述。
 * @property {string} version - 应用版本号（例如 "1.0.0"）。
 * @property {string} [type] - 应用类型/子类（例如 "GUI"、"game"、"utility" 等）。
 * @property {boolean} [alwaysShowInTaskbar=false] - 即使未运行也是否在任务栏显示快捷方式。
 * @property {boolean} [allowMultipleInstances=true] - 是否允许多开多个实例。
 * @property {boolean} [supportsPreview=false] - 是否支持窗口缩略/预览快照。
 * @property {string} [category] - 应用分类（例如 "system"、"utility"、"game"、"security" 等）。
 * @property {boolean} [showOnDesktop] - 是否在桌面显示快捷方式（可选）。
 *
 * @typedef {Object} ApplicationAsset
 * @property {string} script - 应用主脚本的绝对路径（D: 盘上的真实路径）。
 * @property {string[]} [styles] - 一个或多个样式表文件的绝对路径数组。
 * @property {string} [icon] - 图标文件的绝对路径。
 * @property {string|string[]} [assets] - 可选的额外资源（单个路径或路径数组），例如图片、字体或数据文件。
 * @property {AppMetadata} metadata - 应用的行为与展示元数据。
 *
 * @typedef {Object.<string, ApplicationAsset>} ApplicationAssetsMap
 *
 * 使用示例 (Usage):
 * - 键（string）是应用标识符（如 "terminal", "browser"）。
 * - 值为 ApplicationAsset，提供运行该应用所需的所有静态文件路径与配置。
 *
 * 这个字段代表什么（中文）:
 * - 它是操作系统内核/桌面环境用于注册与管理内置或可用应用的中央清单，供启动器、任务栏、设置与权限系统查询与使用。
 */
const APPLICATION_ASSETS = {
    // 终端程序（ZerOS内置终端，永恒存在）
    // 注意：路径是 D: 盘下的真实路径
    "terminal": {
        script: "D:/application/terminal/terminal.js",
        styles: ["D:/application/terminal/terminal.css"],
        icon: "D:/application/terminal/terminal.svg",
        // assets: 程序资源文件（可选）
        // 支持字符串（单个资源）或数组（多个资源）
        // 资源可以是图片、字体、数据文件等
        // assets: ["D:/application/terminal/assets/icon1.svg", "D:/application/terminal/assets/icon2.png"],
        metadata: {
            autoStart: false,  // 终端应该自动启动（作为系统内置终端）
            priority: 0,  // 最高优先级
            description: "终端程序",
            version: "1.0.0",
            alwaysShowInTaskbar: true,  // 常显在任务栏（即使未运行也显示）
            allowMultipleInstances: true,  // 支持多开
            supportsPreview: true,  // 支持窗口预览快照
            category: "system"  // 系统应用
        }
    },
    
    // 任务管理器
    // 注意：路径是 D: 盘下的真实路径
    "taskmanager": {
        script: "D:/application/taskmanager/taskmanager.js",
        styles: ["D:/application/taskmanager/taskmanager.css"],
        icon: "D:/application/taskmanager/taskmanager.svg",
        metadata: {
            autoStart: false,
            priority: 2,
            description: "任务管理器",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,  // 支持窗口预览快照
            category: "system"  // 系统应用
        }
    },
    
    // 文件管理器
    // 注意：路径是 D: 盘下的真实路径
    "filemanager": {
        script: "D:/application/filemanager/filemanager.js",
        styles: ["D:/application/filemanager/filemanager.css"],
        icon: "D:/application/filemanager/filemanager.svg",
        // 程序资源文件
        assets: [
            "D:/application/filemanager/assets/folder.svg",
            "D:/application/filemanager/assets/file.svg",
            "D:/application/filemanager/assets/file-text.svg",
            "D:/application/filemanager/assets/file-code.svg",
            "D:/application/filemanager/assets/file-image.svg",
            "D:/application/filemanager/assets/info.svg",
            "D:/application/filemanager/assets/edit.svg",
            "D:/application/filemanager/assets/trash.svg",
            "D:/application/filemanager/assets/copy.svg",
            "D:/application/filemanager/assets/move.svg"
        ],
        metadata: {
            autoStart: false,
            priority: 3,
            description: "文件管理器",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: true,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "system"  // 系统应用
        }
    },
    
    // 扫雷游戏
    // 注意：路径是 D: 盘下的真实路径
    "minesweeper": {
        script: "D:/application/minesweeper/minesweeper.js",
        styles: ["D:/application/minesweeper/minesweeper.css"],
        icon: "D:/application/minesweeper/minesweeper.svg",
        metadata: {
            autoStart: false,
            priority: 4,
            description: "扫雷",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,  // 支持窗口预览快照
            category: "game"  // 游戏
        }
    },
    
    // 浏览器
    // 注意：路径是 D: 盘下的真实路径
    "browser": {
        script: "D:/application/browser/browser.js",
        styles: ["D:/application/browser/browser.css"],
        icon: "D:/application/browser/browser.svg",
        assets: [
            "D:/application/browser/assets/booklink.js"
        ],
        metadata: {
            autoStart: false,
            priority: 5,
            description: "浏览器",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "utility"  // 轻松使用
        }
    },
    
    // WebViewer - 静态网页容器
    // 注意：路径是 D: 盘下的真实路径
    "webviewer": {
        script: "D:/application/webviewer/webviewer.js",
        styles: ["D:/application/webviewer/webviewer.css"],
        icon: "D:/application/webviewer/webviewer.svg",
        metadata: {
            autoStart: false,
            priority: 5,
            description: "WebViewer",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "system"  // 系统应用
        }
    },
    
    // 手势跟踪器
    // 注意：路径是 D: 盘下的真实路径
    "handtracker": {
        script: "D:/application/handtracker/handtracker.js",
        styles: ["D:/application/handtracker/handtracker.css"],
        icon: "D:/application/handtracker/handtracker.svg",
        metadata: {
            autoStart: false,
            priority: 7,
            description: "手势跟踪器",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,  // 不支持多开
            supportsPreview: true,  // 支持窗口预览快照
            category: "utility"  // 轻松使用
        }
    },
    
    // 主题与动画管理器
    // 注意：路径是 D: 盘下的真实路径
    "themeanimator": {
        script: "D:/application/themeanimator/themeanimator.js",
        styles: ["D:/application/themeanimator/themeanimator.css"],
        icon: "D:/application/themeanimator/themeanimator.svg",
        metadata: {
            autoStart: false,
            priority: 6,
            description: "主题管理器",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,  // 支持窗口预览快照
            category: "utility"  // 轻松使用
        }
    },
    
    // 图片查看器
    // 注意：路径是 D: 盘下的真实路径
    "imageviewer": {
        script: "D:/application/imageviewer/imageviewer.js",
        styles: ["D:/application/imageviewer/imageviewer.css"],
        icon: "D:/application/imageviewer/imageviewer.svg",
        metadata: {
            autoStart: false,
            priority: 3,
            description: "图片查看器",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "system"  // 系统应用
        }
    },
    
    // 音频播放器
    // 注意：路径是 D: 盘下的真实路径
    "audioplayer": {
        script: "D:/application/audioplayer/audioplayer.js",
        styles: ["D:/application/audioplayer/audioplayer.css"],
        icon: "D:/application/audioplayer/audioplayer.svg",
        metadata: {
            autoStart: false,
            priority: 4,
            description: "音频播放器",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "system"  // 系统应用
        }
    },
    
    // 视频播放器
    // 注意：路径是 D: 盘下的真实路径
    "videoplayer": {
        script: "D:/application/videoplayer/videoplayer.js",
        styles: ["D:/application/videoplayer/videoplayer.css"],
        icon: "D:/application/videoplayer/videoplayer.svg",
        metadata: {
            autoStart: false,
            priority: 5,
            description: "视频播放器",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "system"  // 系统应用
        }
    },
    
    // ZerOS 系统信息
    // 注意：路径是 D: 盘下的真实路径
    "about": {
        script: "D:/application/about/about.js",
        styles: ["D:/application/about/about.css"],
        icon: "D:/application/about/about.svg",
        metadata: {
            autoStart: false,
            priority: 7,
            description: "关于ZerOS",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,  // 支持窗口预览快照
            category: "system",  // 系统应用
            showOnDesktop: false  // 在桌面显示快捷方式
        }
    },
    
    // 音乐播放器
    // 注意：路径是 D: 盘下的真实路径
    "musicplayer": {
        script: "D:/application/musicplayer/musicplayer.js",
        styles: ["D:/application/musicplayer/musicplayer.css"],
        icon: "D:/application/musicplayer/musicplayer.svg",
        metadata: {
            autoStart: false,
            priority: 8,
            description: "音乐Music",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,  // 支持窗口预览快照
            category: "other"  // 其他应用
        }
    },
    
    // ZeroIDE 代码编辑器
    // 注意：路径是 D: 盘下的真实路径
    "zeroide": {
        script: "D:/application/zeroide/zeroide.js",
        styles: ["D:/application/zeroide/zeroide.css"],
        icon: "D:/application/zeroide/zeroide.svg",
        metadata: {
            autoStart: false,
            priority: 2,
            description: "ZeroIDE",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "utility"  // 工具类应用
        }
    },
    
    // Ziper - Zip压缩工具
    // 注意：路径是 D: 盘下的真实路径
    "ziper": {
        script: "D:/application/ziper/ziper.js",
        styles: ["D:/application/ziper/ziper.css"],
        icon: "D:/application/ziper/ziper.svg",
        metadata: {
            autoStart: false,
            priority: 3,
            description: "Zip压缩工具",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "utility"  // 工具类应用
        }
    },
    
    // 内核检查程序
    // 注意：路径是 D: 盘下的真实路径
    "kernelchecker": {
        script: "D:/application/kernelchecker/kernelchecker.js",
        styles: ["D:/application/kernelchecker/kernelchecker.css"],
        icon: "D:/application/kernelchecker/kernelchecker.svg",
        metadata: {
            autoStart: false,
            priority: 2,
            description: "专业的内核检查程序",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "system"  // 系统应用
        }
    },
    
    // Timer - 3D时间罗盘
    // 注意：路径是 D: 盘下的真实路径
    "timer": {
        script: "D:/application/timer/timer.js",
        styles: ["D:/application/timer/timer.css"],
        icon: "D:/application/timer/timer.svg",
        metadata: {
            autoStart: false,
            priority: 5,
            description: "3D时间罗盘",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,  // 支持窗口预览快照
            category: "utility"  // 工具类应用
        }
    },
    
    // 注册表编辑器
    "regedit": {
        script: "D:/application/regedit/regedit.js",
        styles: ["D:/application/regedit/regedit.css"],
        icon: "D:/application/regedit/regedit.svg",
        metadata: {
            autoStart: false,
            priority: 5,
            description: "注册表编辑器",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,
            category: "system"  // 系统工具
        }
    },
    
    // 运行程序
    // 注意：路径是 D: 盘下的真实路径
    "run": {
        script: "D:/application/run/run.js",
        styles: ["D:/application/run/run.css"],
        icon: "D:/application/run/run.svg",
        metadata: {
            autoStart: false,
            priority: 10,
            description: "快速运行程序",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,  // 不支持多开
            supportsPreview: true,
            category: "system"  // 系统应用
        }
    },
    
    // 绘图程序
    // 仿苹果风格画板，支持绘制与导出
    "paint": {
        script: "D:/application/paint/paint.js",
        styles: ["D:/application/paint/paint.css"],
        icon: "D:/application/paint/paint.svg",
        metadata: {
            autoStart: false,
            priority: 12,
            description: "画板",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: false,
            category: "tool"
        }
    },
    
    // 密钥管理器
    "authenticator": {
        script: "D:/application/authenticator/authenticator.js",
        icon: "D:/application/authenticator/authenticator.svg",
        metadata: {
            autoStart: false,
            priority: 13,
            description: "RSA管理工具",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: false,
            category: "security"
        }
    },
    
    "settings": {
        script: "D:/application/settings/settings.js",
        styles: ["D:/application/settings/settings.css"],
        icon: "D:/application/settings/settings.svg",
        metadata: {
            autoStart: false,
            priority: 3,
            description: "系统设置管理",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,
            category: "system"
        }
    },
    
    "scheduletask": {
        script: "D:/application/scheduletask/scheduletask.js",
        styles: ["D:/application/scheduletask/scheduletask.css"],
        icon: "D:/application/scheduletask/scheduletask.svg",
        metadata: {
            autoStart: false,
            priority: 4,
            description: "计划任务管理",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,
            category: "system"
        }
    },
    
    "permissioncontrol": {
        script: "D:/application/permissioncontrol/permissioncontrol.js",
        styles: ["D:/application/permissioncontrol/permissioncontrol.css"],
        icon: "D:/application/permissioncontrol/permissioncontrol.svg",
        metadata: {
            autoStart: false,
            priority: 20,
            description: "权限管控中心",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,
            category: "system"
        }
    },
    
    // 星火AI - AI聊天程序
    // 注意：路径是 D: 盘下的真实路径
    "sparkai": {
        script: "D:/application/sparkai/sparkai.js",
        styles: ["D:/application/sparkai/sparkai.css"],
        icon: "D:/application/sparkai/sparkai.svg",
        metadata: {
            autoStart: false,
            priority: 5,
            description: "讯飞星火AI",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,
            category: "utility"  // 工具类应用
        }
    },

    // Notepad程序
    // 该程序内置为系统的笔记本
    "notepad": {
        script: "D:/application/notepad/notepad.js",
        styles: ["D:/application/notepad/notepad.css"],
        icon: "D:/application/notepad/notepad.svg",
        metadata: {
            autoStart: false,
            priority: 4,
            description: "Notepad",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,
            category: "system"  // 系统应用
        }
    },

    // Horror Mansion - 3D 恐怖游戏
    "horrormansion": {
        script: "D:/application/HorrorMansion/HorrorMansion.js",
        icon: "D:/application/HorrorMansion/HorrorMansion.svg",
        metadata: {
            autoStart: false,
            priority: 5,
            description: "Horror Mansion 3D",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: false,
            supportsPreview: true,
            category: "game"
        }
    },
};

// 不导出到全局作用域，交由POOL管理
// 通过POOL注册（如果POOL已加载）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        // 确保 KERNEL_GLOBAL_POOL 类别存在
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "APPLICATION_ASSETS", APPLICATION_ASSETS);
    } catch (e) {
        // POOL 可能还未完全初始化，暂时导出到全局作为降级方案
        if (typeof window !== 'undefined') {
            window.APPLICATION_ASSETS = APPLICATION_ASSETS;
        } else if (typeof globalThis !== 'undefined') {
            globalThis.APPLICATION_ASSETS = APPLICATION_ASSETS;
        }
    }
} else {
    // POOL不可用，降级到全局对象
    if (typeof window !== 'undefined') {
        window.APPLICATION_ASSETS = APPLICATION_ASSETS;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.APPLICATION_ASSETS = APPLICATION_ASSETS;
    }
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/process/applicationAssets.js");
} else {
    // 如果 DependencyConfig 还未加载，延迟发布信号
    if (typeof document !== 'undefined' && document.body) {
        const publishWhenReady = () => {
            if (typeof DependencyConfig !== 'undefined') {
                DependencyConfig.publishSignal("../kernel/process/applicationAssets.js");
            } else {
                setTimeout(publishWhenReady, 10);
            }
        };
        publishWhenReady();
    }
}