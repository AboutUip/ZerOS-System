# ZerOS 开发者指南

本指南将帮助你快速上手 ZerOS 程序开发，了解 ZerOS 的开发思维和最佳实践。

## 目录

- [开发思维](#开发思维)
- [快速开始](#快速开始)
- [开发约定](#开发约定)
- [程序结构](#程序结构)
- [GUI 程序开发](#gui-程序开发)
- [CLI 程序开发](#cli-程序开发)
- [主题与样式](#主题与样式)
- [最佳实践](#最佳实践)
- [示例代码](#示例代码)
- [常见问题](#常见问题)

---

## 开发思维

### ZerOS 程序开发的核心概念

ZerOS 程序开发遵循以下核心思维：

1. **进程生命周期管理**
   - 所有程序通过 `ProcessManager` 进行生命周期管理
   - 程序必须实现 `__init__`、`__exit__`、`__info__` 三个必需方法
   - 程序不能自动初始化，必须等待 `ProcessManager` 调用

2. **资源管理**
   - 所有资源（内存、窗口、事件监听器）必须在 `__exit__` 中清理
   - 使用 `ProcessManager.allocateMemory` 分配内存
   - 使用 `GUIManager` 管理窗口（推荐）

3. **权限系统**
   - 所有内核 API 调用都需要相应权限
   - 程序在 `__info__` 中声明所需权限
   - 特殊权限首次使用时需要用户确认

4. **模块化设计**
   - 程序应该独立、可复用
   - 通过 POOL 共享空间进行程序间通信
   - 使用主题变量确保 UI 一致性

### 程序类型

ZerOS 支持两种程序类型：

- **GUI 程序**：图形界面程序，需要窗口管理
- **CLI 程序**：命令行程序，通过终端交互

### 开发流程

1. **创建程序文件** → 2. **实现程序结构** → 3. **注册程序** → 4. **测试运行**

---

## 快速开始

### 1. 创建程序文件

在 `service/DISK/D/application/` 目录下创建你的程序目录：

```
service/DISK/D/application/
└── myapp/
    ├── myapp.js          # 主程序文件（必需）
    ├── myapp.css         # 样式文件（可选）
    └── myapp.svg         # 图标文件（可选）
```

### 2. 编写基本程序结构

```javascript
// service/DISK/D/application/myapp/myapp.js
(function(window) {
    'use strict';
    
    const PROGRAM_NAME = 'MYAPP';
    
    const MYAPP = {
        pid: null,
        window: null,
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建窗口
            this.window = document.createElement('div');
            this.window.className = 'myapp-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            
            // 注册到 GUIManager
            if (typeof GUIManager !== 'undefined') {
                GUIManager.registerWindow(pid, this.window, {
                    title: '我的应用',
                    icon: 'application/myapp/myapp.svg',
                    onClose: () => {
                        ProcessManager.killProgram(pid);
                    }
                });
            }
            
            // 添加到容器
            guiContainer.appendChild(this.window);
        },
        
        __exit__: async function() {
            if (typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
        },
        
        __info__: function() {
            return {
                name: 'myapp',
                type: 'GUI',
                version: '1.0.0',
                description: '我的应用程序',
                author: 'Your Name',
                copyright: '© 2024',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window[PROGRAM_NAME] = MYAPP;
    } else if (typeof globalThis !== 'undefined') {
        globalThis[PROGRAM_NAME] = MYAPP;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);
```

### 3. 注册程序

在 `kernel/process/applicationAssets.js` 中注册你的程序：

```javascript
const APPLICATION_ASSETS = {
    "myapp": {
        script: "application/myapp/myapp.js",
        styles: ["application/myapp/myapp.css"],
        icon: "application/myapp/myapp.svg",
        metadata: {
            autoStart: false,
            priority: 1,
            description: "我的应用程序",
            version: "1.0.0",
            type: "GUI",
            allowMultipleInstances: true
        }
    }
};
```

### 4. 运行程序

程序可以通过以下方式启动：

- 从任务栏的"所有程序"菜单启动
- 通过 `ProcessManager.startProgram('myapp', {})` 启动
- 如果设置了 `autoStart: true`，系统启动时自动运行

---

## 开发约定

### 1. 禁止自动初始化

**重要**: 程序必须禁止自动初始化，包括：

- ❌ 禁止使用立即调用函数表达式（IIFE）执行初始化代码
- ❌ 禁止在脚本顶层执行初始化代码
- ❌ 禁止自动创建 DOM 元素
- ❌ 禁止自动注册事件监听器

**正确做法**:

```javascript
// ❌ 错误：自动初始化
(function() {
    const app = new MyApp();
    app.init();
})();

// ✅ 正确：等待 ProcessManager 调用
const MYAPP = {
    __init__: async function(pid, initArgs) {
        // 初始化代码
    }
};
```

### 2. 程序导出格式

程序必须导出为全局对象，命名规则：**程序名全大写**。

```javascript
// 程序名: myapp
// 导出对象名: MYAPP
const MYAPP = {
    __init__: async function(pid, initArgs) { /* ... */ },
    __exit__: async function() { /* ... */ },
    __info__: function() { /* ... */ }
};
```

### 3. DOM 元素标记

所有程序创建的 DOM 元素必须标记 `data-pid` 属性：

```javascript
const element = document.createElement('div');
element.dataset.pid = this.pid.toString();
```

### 4. 错误处理

始终使用 try-catch 处理异步操作：

```javascript
__init__: async function(pid, initArgs) {
    try {
        await this._initialize();
    } catch (error) {
        console.error('初始化失败:', error);
        // 清理已创建的资源
    }
}
```

---

## 程序结构

### 必需方法

#### `__init__(pid, initArgs)`

程序初始化方法，由 ProcessManager 在程序启动时调用。

**参数**:
- `pid` (number): 进程 ID，由 ProcessManager 分配
- `initArgs` (Object): 初始化参数对象
  ```javascript
  {
      pid: number,              // 进程 ID
      args: Array,              // 命令行参数
      env: Object,              // 环境变量
      cwd: string,              // 当前工作目录（如 "C:"）
      terminal: Object,         // 终端实例（仅 CLI 程序）
      guiContainer: HTMLElement, // GUI 容器（仅 GUI 程序）
      metadata: Object,         // 元数据
  }
  ```

**返回值**: `Promise<void>`

#### `__exit__()`

程序退出方法，由 ProcessManager 在程序关闭时调用。

**职责**:
- 清理 DOM 元素（从 DOM 中移除所有程序创建的元素）
- 取消事件监听器（移除所有注册的事件监听器）
- 释放内存引用（将对象引用设置为 null）
- 保存用户数据（如果需要持久化）
- 取消注册 GUI 窗口（如果使用了 GUIManager）
- 取消注册上下文菜单（如果注册了自定义菜单）
- 清理定时器和异步操作

**返回值**: `Promise<void>`

**重要提示**:
- 必须确保所有资源都被正确清理，避免内存泄漏
- GUI 程序必须调用 `GUIManager.unregisterWindow()` 取消注册窗口
- 如果注册了上下文菜单，必须调用 `ContextMenuManager.unregisterContextMenu()` 取消注册
- 所有 DOM 元素引用应该设置为 null，帮助垃圾回收

#### `__info__()`

程序信息方法，返回程序的元数据。

**返回值**: `Object`

**必需字段**:
- `name` (string): 程序名称
- `type` (string): 程序类型，`'GUI'` 或 `'CLI'`
- `version` (string): 版本号
- `description` (string): 程序描述
- `author` (string): 作者
- `copyright` (string): 版权信息

**可选字段**:
- `permissions` (Array): 所需权限列表
- `metadata` (Object): 额外元数据
  - `allowMultipleInstances` (boolean): 是否支持多实例

---

## GUI 程序开发

### 基本结构

GUI 程序必须将 UI 渲染到指定的容器中：

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 获取 GUI 容器
    const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
    
    // 创建窗口元素
    this.window = document.createElement('div');
    this.window.className = 'myapp-window zos-gui-window';
    this.window.dataset.pid = pid.toString();
    
    // 注册到 GUIManager（推荐）
    if (typeof GUIManager !== 'undefined') {
        GUIManager.registerWindow(pid, this.window, {
            title: '我的应用',
            icon: 'application/myapp/myapp.svg',
            onClose: () => {
                ProcessManager.killProgram(pid);
            }
        });
    }
    
    // 添加到容器
    guiContainer.appendChild(this.window);
}
```

### 使用主题变量

在 CSS 中使用主题变量，确保程序能够响应主题切换：

```css
.myapp-window {
    background: var(--theme-background-elevated, rgba(37, 43, 53, 0.98));
    border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
    color: var(--theme-text, #d7e0dd);
}

.myapp-button {
    background: var(--theme-primary, #8b5cf6);
    color: var(--theme-text-on-primary, #ffffff);
}

.myapp-button:hover {
    background: var(--theme-primary-hover, #7c3aed);
}
```

### 窗口控制

如果使用 GUIManager，窗口的拖动、拉伸、最小化、最大化等功能会自动处理。如果需要自定义，可以使用 EventManager：

```javascript
// 注册拖动事件
EventManager.registerDrag(
    `myapp-window-${this.pid}`,
    titleBar,
    this.window,
    this.windowState,
    (e) => { /* 拖动开始 */ },
    (e) => { /* 拖动中 */ },
    (e) => { /* 拖动结束 */ },
    ['.button', '.controls']
);
```

详细 API 文档请参考 [EventManager API](API/EventManager.md) 和 [GUIManager API](API/GUIManager.md)

---

## CLI 程序开发

### 基本结构

CLI 程序通过 `initArgs.terminal` 获取终端实例：

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    this.terminal = initArgs.terminal;
    
    if (!this.terminal) {
        throw new Error('CLI程序需要终端环境');
    }
    
    // 使用终端 API
    this.terminal.write('Hello from CLI program\n');
    this.terminal.setCwd('C:/Users');
}
```

### 终端 API

通过共享空间访问终端 API：

```javascript
// 获取终端 API
const terminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");

if (terminalAPI) {
    // 写入输出
    terminalAPI.write('Hello\n');
    
    // 清空输出
    terminalAPI.clear();
    
    // 设置工作目录
    terminalAPI.setCwd('C:/Users');
    
    // 获取环境变量
    const env = terminalAPI.getEnv();
    
    // 设置环境变量
    terminalAPI.setEnv({ KEY: 'value' });
}
```

### 命令行参数解析

```javascript
__init__: async function(pid, initArgs) {
    const args = initArgs.args || [];
    
    // 解析参数
    if (args.length > 0) {
        const filename = args[0];
        // 处理文件
    }
}
```

---

## 主题与样式

### 使用主题变量

ZerOS 提供了丰富的 CSS 变量，用于主题和样式管理。详细变量列表请参考 [ThemeManager API](API/ThemeManager.md)

**背景颜色**:
- `--theme-background`: 主背景色
- `--theme-background-secondary`: 次要背景色
- `--theme-background-elevated`: 提升的背景色（用于窗口）

**文本颜色**:
- `--theme-text`: 主文本色
- `--theme-text-secondary`: 次要文本色
- `--theme-text-muted`: 弱化文本色

**主题色**:
- `--theme-primary`: 主色调
- `--theme-primary-light`: 浅主色调
- `--theme-primary-dark`: 深主色调
- `--theme-primary-hover`: 悬停主色调

### 监听主题变更

程序可以监听主题变更，动态更新 UI：

```javascript
// 监听主题变更
if (typeof ThemeManager !== 'undefined') {
    ThemeManager.onThemeChange((themeId, theme) => {
        // 更新程序 UI
        this._updateTheme(theme);
    });
    
    ThemeManager.onStyleChange((styleId, style) => {
        // 更新程序样式
        this._updateStyle(style);
    });
}
```

### 设置本地图片背景

```javascript
// 设置本地 GIF 动图作为背景
await ThemeManager.setLocalImageAsBackground('D:/images/background.gif');

// 设置本地静态图片作为背景
await ThemeManager.setLocalImageAsBackground('D:/images/wallpaper.jpg');
```

详细 API 文档请参考 [ThemeManager API](API/ThemeManager.md)

---

## 最佳实践

### 1. 禁止自动初始化

**重要**: 程序绝对不能自动初始化。所有初始化代码必须在 `__init__` 方法中执行。

### 2. DOM 元素标记

所有程序创建的 DOM 元素必须标记 `data-pid` 属性。

### 3. 错误处理

始终使用 try-catch 处理异步操作。

### 4. 资源清理

在 `__exit__` 中清理所有资源，确保没有内存泄漏：

```javascript
__exit__: async function() {
    try {
        // 1. 取消注册 GUI 窗口（优先处理，确保窗口正确关闭）
        if (this.windowId && typeof GUIManager !== 'undefined') {
            await GUIManager.unregisterWindow(this.windowId);
        } else if (this.pid && typeof GUIManager !== 'undefined') {
            // 如果没有 windowId，尝试使用 pid
            await GUIManager.unregisterWindow(this.pid);
        }
        
        // 2. 取消注册上下文菜单（如果注册了自定义菜单）
        if (this.pid && typeof ContextMenuManager !== 'undefined') {
            ContextMenuManager.unregisterContextMenu(this.pid);
        }
        
        // 3. 移除所有事件监听器
        if (this._eventHandlers && Array.isArray(this._eventHandlers)) {
            this._eventHandlers.forEach(({ element, event, handler }) => {
                if (element && typeof element.removeEventListener === 'function') {
                    element.removeEventListener(event, handler);
                }
            });
            this._eventHandlers = null;
        }
        
        // 4. 清理 DOM 元素（从 DOM 中移除）
        if (this.window && this.window.parentElement) {
            this.window.parentElement.removeChild(this.window);
        }
        
        // 5. 清理定时器和异步操作
        if (this._timers) {
            this._timers.forEach(timer => clearTimeout(timer));
            this._timers = null;
        }
        
        // 6. 释放内存引用
        if (this.memoryRefs) {
            for (const [refId, ref] of this.memoryRefs) {
                if (typeof ProcessManager !== 'undefined') {
                    await ProcessManager.freeMemoryRef(this.pid, refId);
                }
            }
            this.memoryRefs.clear();
            this.memoryRefs = null;
        }
        
        // 7. 清理所有对象引用（帮助垃圾回收）
        this.window = null;
        this.windowId = null;
        this._eventHandlers = null;
        this._timers = null;
        this.memoryRefs = null;
        // ... 清理其他引用
        
    } catch (error) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.error("MYAPP", `清理资源失败: ${error.message}`, error);
        } else {
            console.error('清理资源失败:', error);
        }
    }
}
```

**关键要点**：
- **优先取消注册 GUI 窗口**：使用 `GUIManager.unregisterWindow()` 确保窗口正确关闭
- **必须移除所有事件监听器**：避免内存泄漏和事件重复触发
- **必须从 DOM 中移除元素**：确保 DOM 树干净
- **清理定时器**：避免定时器在程序退出后继续运行
- **释放内存引用**：调用 `ProcessManager.freeMemoryRef()` 释放分配的内存
- **将所有引用设置为 null**：帮助 JavaScript 垃圾回收器回收内存
- **使用 try-catch**：确保清理过程不会因错误而中断

在 `__exit__` 中清理所有资源：

```javascript
__exit__: async function() {
    // 清理 DOM
    if (this.window && this.window.parentElement) {
        this.window.parentElement.removeChild(this.window);
    }
    
    // 取消事件监听器
    if (this.eventListeners) {
        this.eventListeners.forEach(({element, event, handler}) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];
    }
    
    // 释放内存
    if (this.memoryRefs) {
        for (const [refId, ref] of this.memoryRefs) {
            await ProcessManager.freeMemoryRef(this.pid, refId);
        }
        this.memoryRefs.clear();
    }
    
    // 注销窗口
    if (typeof GUIManager !== 'undefined') {
        GUIManager.unregisterWindow(this.pid);
    }
}
```

### 5. 使用主题变量

在 CSS 中使用主题变量，确保程序能够响应主题切换。

### 6. 使用 GUIManager

推荐使用 GUIManager 管理窗口，获得统一的窗口管理功能。

### 7. 异步操作

`__init__` 和 `__exit__` 必须是异步函数。

### 8. 多实例支持

如果程序支持多实例，在 `__info__` 中声明：

```javascript
__info__: function() {
    return {
        // ...
        metadata: {
            allowMultipleInstances: true
        }
    };
}
```

### 9. GUI 容器

GUI 程序必须将 UI 渲染到 `initArgs.guiContainer` 中。

### 10. 共享空间使用

程序间通信应使用共享空间：

```javascript
// 设置共享数据
const sharedSpace = ProcessManager.getSharedSpace();
sharedSpace.setData('myKey', { data: 'value' });

// 获取共享数据
const data = sharedSpace.getData('myKey');
```

---

## 示例代码

### 完整的 GUI 程序示例

```javascript
// service/DISK/D/application/myapp/myapp.js
(function(window) {
    'use strict';
    
    const PROGRAM_NAME = 'MYAPP';
    
    const MYAPP = {
        pid: null,
        window: null,
        windowState: null,
        eventListeners: [],
        memoryRefs: new Map(),
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            try {
                // 获取 GUI 容器
                const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
                
                // 创建窗口元素
                this.window = document.createElement('div');
                this.window.className = 'myapp-window zos-gui-window';
                this.window.dataset.pid = pid.toString();
                this.window.style.cssText = `
                    position: fixed;
                    width: 800px;
                    height: 600px;
                    background: var(--theme-background-elevated, rgba(37, 43, 53, 0.98));
                    border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
                    border-radius: var(--style-window-border-radius, 12px);
                    box-shadow: var(--style-window-box-shadow-focused, 0 12px 40px rgba(0, 0, 0, 0.5));
                    backdrop-filter: var(--style-window-backdrop-filter, blur(30px) saturate(180%));
                    color: var(--theme-text, #d7e0dd);
                `;
                
                // 注册到 GUIManager
                if (typeof GUIManager !== 'undefined') {
                    GUIManager.registerWindow(pid, this.window, {
                        title: '我的应用',
                        icon: 'application/myapp/myapp.svg',
                        onClose: () => {
                            ProcessManager.killProgram(pid);
                        }
                    });
                }
                
                // 创建内容
                const content = document.createElement('div');
                content.textContent = 'Hello, ZerOS!';
                content.style.cssText = 'padding: 20px;';
                this.window.appendChild(content);
                
                // 添加到容器
                guiContainer.appendChild(this.window);
                
                // 初始化窗口状态
                this.windowState = {
                    isFullscreen: false,
                    isDragging: false,
                    isResizing: false
                };
                
            } catch (error) {
                console.error('初始化失败:', error);
                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                throw error;
            }
        },
        
        __exit__: async function() {
            // 清理事件监听器
            if (this.eventListeners) {
                this.eventListeners.forEach(({element, event, handler}) => {
                    element.removeEventListener(event, handler);
                });
                this.eventListeners = [];
            }
            
            // 释放内存
            if (this.memoryRefs) {
                for (const [refId, ref] of this.memoryRefs) {
                    await ProcessManager.freeMemoryRef(this.pid, refId);
                }
                this.memoryRefs.clear();
            }
            
            // 注销窗口
            if (typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
        },
        
        __info__: function() {
            return {
                name: 'myapp',
                type: 'GUI',
                version: '1.0.0',
                description: '我的应用程序示例',
                author: 'Your Name',
                copyright: '© 2024',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window[PROGRAM_NAME] = MYAPP;
    } else if (typeof globalThis !== 'undefined') {
        globalThis[PROGRAM_NAME] = MYAPP;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);
```

### 完整的 CLI 程序示例

```javascript
// service/DISK/D/application/mycli/mycli.js
(function(window) {
    'use strict';
    
    const PROGRAM_NAME = 'MYCLI';
    
    const MYCLI = {
        pid: null,
        terminal: null,
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            this.terminal = initArgs.terminal;
            
            if (!this.terminal) {
                throw new Error('CLI程序需要终端环境');
            }
            
            // 获取命令行参数
            const args = initArgs.args || [];
            
            // 输出欢迎信息
            this.terminal.write('MyCLI v1.0.0\n');
            this.terminal.write('Type "help" for help\n');
            
            // 处理参数
            if (args.length > 0) {
                const filename = args[0];
                this.terminal.write(`Processing file: ${filename}\n`);
                // 处理文件
            }
        },
        
        __exit__: async function() {
            // CLI 程序清理
            if (this.terminal) {
                this.terminal.write('MyCLI exited\n');
            }
        },
        
        __info__: function() {
            return {
                name: 'mycli',
                type: 'CLI',
                version: '1.0.0',
                description: '我的CLI程序示例',
                author: 'Your Name',
                copyright: '© 2024',
                metadata: {
                    allowMultipleInstances: false
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window[PROGRAM_NAME] = MYCLI;
    } else if (typeof globalThis !== 'undefined') {
        globalThis[PROGRAM_NAME] = MYCLI;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## 常见问题

### Q: 如何调试程序？

A: 使用浏览器开发者工具（F12）查看控制台日志。ZerOS 使用 `KernelLogger` 记录日志，可以通过 `ProcessManager.setLogLevel()` 设置日志级别。

### Q: 程序启动失败怎么办？

A: 检查以下几点：
1. 程序是否正确导出为全局对象（程序名全大写）
2. 是否实现了 `__init__`, `__exit__`, `__info__` 方法
3. 是否在 `applicationAssets.js` 中注册了程序
4. 查看浏览器控制台的错误信息

### Q: 如何获取其他程序的 API？

A: 通过 POOL 共享空间获取：

```javascript
const otherProgramAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "OtherProgramAPI");
if (otherProgramAPI) {
    otherProgramAPI.someMethod();
}
```

### Q: 如何监听系统事件？

A: 通过 EventManager 或直接使用 DOM 事件。对于窗口事件，推荐使用 GUIManager。

### Q: 如何保存用户数据？

A: 使用 Disk API 保存到文件系统，或使用 LStorage API：

```javascript
// 使用 Disk API
await Disk.writeFile('C:/Users/username/data.json', JSON.stringify(data));

// 使用 LStorage API
await LStorage.setProgramStorage(this.pid, 'settings', { theme: 'dark' });
```

### Q: 程序支持多实例吗？

A: 在 `__info__` 的 `metadata` 中设置 `allowMultipleInstances: true`。注意：每个实例都有独立的 PID。

---

## 参考资源

- **示例程序**: 查看 `service/DISK/D/application/` 目录下的示例程序
  - `terminal/`: 终端程序示例
  - `vim/`: 文本编辑器示例
  - `filemanager/`: 文件管理器示例
  - `browser/`: 浏览器示例

- **内核模块**: 查看 `kernel/` 目录下的内核模块实现

- **API 文档**: 查看 [API 文档索引](API/README.md) 获取完整的 API 参考

- **内核架构**: 查看 [内核架构文档](ZEROS_KERNEL.md) 了解系统设计

---

**祝开发愉快！**

如有问题，请参考现有程序的实现或查看内核模块的源代码。
