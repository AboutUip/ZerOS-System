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
    
    // Vim编辑器
    // 注意：路径是 D: 盘下的真实路径
    "vim": {
        script: "D:/application/vim/vim.js",
        styles: ["D:/application/vim/vim.css"],
        icon: "D:/application/vim/vim.svg",
        // assets: 程序资源文件（可选）
        // assets: ["D:/application/vim/assets/icon.svg"],
        metadata: {
            autoStart: false,
            priority: 1,
            description: "Vim文本编辑器",
            version: "1.0.0",
            alwaysShowInTaskbar: false,  // 不常显在任务栏（仅在运行时显示）
            supportsPreview: true,  // 支持窗口预览快照
            category: "utility"  // 轻松使用
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
    
    // 贪吃蛇游戏
    // 注意：路径是 D: 盘下的真实路径
    "snake": {
        script: "D:/application/snake/snake.js",
        styles: ["D:/application/snake/snake.css"],
        icon: "D:/application/snake/snake.svg",
        metadata: {
            autoStart: false,
            priority: 4,
            description: "贪吃蛇",
            version: "1.1.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "other"  // 其他程序
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
            allowMultipleInstances: true,
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
            allowMultipleInstances: true,
            supportsPreview: true,  // 支持窗口预览快照
            category: "other"  // 其他应用
        }
    },
    
    // 愤怒的小鸟游戏
    // 注意：路径是 D: 盘下的真实路径
    "angrybirds": {
        script: "D:/application/angrybirds/angrybirds.js",
        styles: ["D:/application/angrybirds/angrybirds.css"],
        icon: "D:/application/angrybirds/angrybirds.svg",
        metadata: {
            autoStart: false,
            priority: 9,
            description: "愤怒的小鸟",
            version: "1.0.0",
            type: "GUI",
            alwaysShowInTaskbar: false,
            allowMultipleInstances: true,
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
    }
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