# ZerOS 开发者指南

本指南将帮助你快速上手 ZerOS 程序开发，了解 ZerOS 的开发思维和最佳实践。

## 目录

- [开发思维](#开发思维)
- [快速开始](#快速开始)
- [重要注意事项](#重要注意事项) ⚠️ **必读**
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
   - 普通权限根据"自动授予普通权限"设置决定是否自动授予
   - 特殊权限首次使用时需要用户确认，用户允许后会被持久化保存
   - 权限管理系统提供完整的审计和统计功能
   - 支持程序黑名单和白名单管理
   - **用户级别控制**: 系统支持三种用户级别（普通用户、管理员、默认管理员），普通用户无法授权高风险权限（如加密相关权限）

4. **用户控制系统**
   - 系统支持多用户管理，每个用户有独立的级别、密码和头像
   - 默认管理员 `root` 拥有系统最高权限
   - 用户密码使用 MD5 加密存储
   - 用户头像存储在 `D:/cache/` 目录
   - 通过 `UserControl` API 进行用户管理

5. **锁屏界面**
   - 系统启动时显示 Windows 11 风格的锁屏界面
   - 支持密码验证和用户切换
   - 可通过 `Ctrl + L` 快捷键手动锁定屏幕
   - 锁屏背景从 `system/assets/start/` 目录随机选择

6. **模块化设计**
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

在 `system/service/DISK/D/application/` 目录下创建你的程序目录：

```
system/service/DISK/D/application/
└── myapp/
    ├── myapp.js          # 主程序文件（必需）
    ├── myapp.css         # 样式文件（可选）
    └── myapp.svg         # 图标文件（可选）
```

### 2. 编写基本程序结构

```javascript
// system/service/DISK/D/application/myapp/myapp.js
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

## ⚠️ 重要注意事项

### 必须遵守的开发规范

ZerOS 系统要求所有程序必须遵守以下开发规范，以确保系统稳定运行和资源正确管理。

#### 1. 事件管理 - 必须使用 EventManager

**所有事件处理必须通过内核的 `EventManager` 进行统一管理**

```javascript
// ✅ 正确：使用 EventManager
EventManager.registerEventHandler(this.pid, 'click', (e, eventContext) => {
    // 处理点击事件
    // 可以使用 eventContext.stopPropagation() 控制事件传播
}, {
    priority: 100,
    selector: '.my-button'
});

// 对于非冒泡事件（如 mouseenter, mouseleave, load, error）
EventManager.registerElementEvent(this.pid, element, 'mouseenter', (e) => {
    // 处理鼠标进入事件
});

// ❌ 错误：直接使用 addEventListener（会被警告，不推荐）
element.addEventListener('click', handler);
```

**为什么必须使用 EventManager**：
- ✅ **统一管理**：所有事件由内核统一管理，支持事件优先级和传播控制
- ✅ **自动清理**：进程退出时自动清理所有事件监听器，防止内存泄漏
- ✅ **权限控制**：事件注册需要相应权限，确保系统安全
- ✅ **事件传播控制**：提供统一的 `eventContext` API 控制事件传播
- ✅ **多程序支持**：支持多个程序注册同一事件，按优先级执行

**详细说明**：请参考 [EventManager API 文档](API/EventManager.md)

#### 2. 日志记录 - 必须使用 KernelLogger

**所有日志输出必须通过内核的 `KernelLogger` 进行统一管理**

```javascript
// ✅ 正确：使用 KernelLogger
KernelLogger.info('MYAPP', '程序启动');
KernelLogger.warn('MYAPP', '警告信息');
KernelLogger.error('MYAPP', '错误信息', error);
KernelLogger.debug('MYAPP', '调试信息');

// ❌ 错误：直接使用 console.log（不推荐）
console.log('程序启动');
console.warn('警告信息');
console.error('错误信息');
```

**为什么必须使用 KernelLogger**：
- ✅ **统一格式**：所有日志使用统一格式，包含模块名、时间戳、级别等信息
- ✅ **日志过滤**：支持日志级别过滤，控制日志输出
- ✅ **结构化日志**：便于调试和问题排查
- ✅ **性能优化**：可以统一控制日志输出，避免性能问题

**详细说明**：请参考 [KernelLogger API 文档](API/KernelLogger.md)

#### 3. 窗口管理 - 必须使用 GUIManager

**GUI 程序必须使用 `GUIManager` 进行窗口管理**

```javascript
// ✅ 正确：使用 GUIManager
GUIManager.registerWindow(this.pid, this.window, {
    title: '我的应用',
    icon: 'application/myapp/myapp.svg',
    onClose: () => {
        ProcessManager.killProgram(this.pid);
    },
    onMinimize: () => {
        // 窗口最小化回调
    },
    onMaximize: () => {
        // 窗口最大化回调
    }
});

// ❌ 错误：手动管理窗口（不推荐）
this.window.style.position = 'fixed';
this.window.style.left = '100px';
this.window.style.top = '100px';
// 手动实现拖动、拉伸等功能
```

**为什么必须使用 GUIManager**：
- ✅ **自动功能**：自动处理窗口拖动、拉伸、最小化、最大化、焦点管理
- ✅ **统一样式**：统一的窗口样式和主题支持
- ✅ **标题栏保护**：自动保护窗口标题栏，防止被意外删除
- ✅ **z-index 管理**：自动管理窗口层级，确保正确的显示顺序
- ✅ **窗口状态同步**：自动同步窗口状态（最大化、最小化等）

**详细说明**：请参考 [GUIManager API 文档](API/GUIManager.md)

#### 4. 权限管理 - 必须声明权限

**所有内核 API 调用都需要相应权限，程序必须在 `__info__` 中声明所需权限**

```javascript
// ✅ 正确：在 __info__ 中声明权限
__info__: function() {
    return {
        name: 'myapp',
        type: 'GUI',
        version: '1.0.0',
        description: '我的应用程序',
        author: 'Your Name',
        copyright: '© 2024',
        permissions: typeof PermissionManager !== 'undefined' ? [
            PermissionManager.PERMISSION.GUI_WINDOW_CREATE,  // 创建窗口（普通权限，自动授予）
            PermissionManager.PERMISSION.EVENT_LISTENER,     // 注册事件（普通权限，自动授予）
            PermissionManager.PERMISSION.KERNEL_DISK_READ,   // 读取文件（普通权限，自动授予）
            PermissionManager.PERMISSION.KERNEL_DISK_WRITE,   // 写入文件（特殊权限，需要用户确认）
            PermissionManager.PERMISSION.KERNEL_DISK_CREATE,  // 创建文件/目录（特殊权限，需要用户确认）
            PermissionManager.PERMISSION.KERNEL_DISK_DELETE,  // 删除文件/目录（特殊权限，需要用户确认）
            PermissionManager.PERMISSION.KERNEL_DISK_LIST,    // 列出目录（普通权限，自动授予）
            PermissionManager.PERMISSION.SYSTEM_NOTIFICATION, // 显示通知（特殊权限，需要用户确认）
            PermissionManager.PERMISSION.SYSTEM_STORAGE_READ, // 读取系统存储
            PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE, // 写入系统存储
            PermissionManager.PERMISSION.CRYPT_GENERATE_KEY,  // 生成密钥
            PermissionManager.PERMISSION.CRYPT_ENCRYPT,        // 加密
            PermissionManager.PERMISSION.CRYPT_DECRYPT,        // 解密
            PermissionManager.PERMISSION.CRYPT_MD5,           // MD5 哈希
            PermissionManager.PERMISSION.CRYPT_RANDOM          // 随机数生成
        ] : [],
        metadata: {
            allowMultipleInstances: true
        }
    };
}
```

**为什么必须声明权限**：
- ✅ **系统安全**：确保系统安全，防止恶意程序滥用系统资源
- ✅ **用户授权**：用户可以在首次使用时授权或拒绝权限
- ✅ **权限追踪**：权限系统会记录所有权限使用情况
- ✅ **自动清理**：进程退出时自动清理所有权限

**详细说明**：请参考 [PermissionManager API 文档](API/PermissionManager.md)

#### 5. 资源清理 - 必须完整清理

**程序必须在 `__exit__` 中清理所有资源**

```javascript
// ✅ 正确：完整清理所有资源
__exit__: async function() {
    try {
        // 1. 取消注册 GUI 窗口（优先处理，确保窗口正确关闭）
        if (this.windowId && typeof GUIManager !== 'undefined') {
            await GUIManager.unregisterWindow(this.windowId);
        } else if (this.pid && typeof GUIManager !== 'undefined') {
            await GUIManager.unregisterWindow(this.pid);
        }
        
        // 2. 取消注册上下文菜单（如果注册了自定义菜单）
        if (this.pid && typeof ContextMenuManager !== 'undefined') {
            ContextMenuManager.unregisterContextMenu(this.pid);
        }
        
        // 3. EventManager 会自动清理所有事件监听器
        // 但如果有直接使用 addEventListener 的，需要手动清理
        if (this._manualEventListeners) {
            this._manualEventListeners.forEach(({element, event, handler}) => {
                if (element && typeof element.removeEventListener === 'function') {
                    element.removeEventListener(event, handler);
                }
            });
            this._manualEventListeners = null;
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
        
    } catch (error) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.error("MYAPP", `清理资源失败: ${error.message}`, error);
        } else {
            console.error('清理资源失败:', error);
        }
    }
}
```

**为什么必须清理资源**：
- ✅ **防止内存泄漏**：确保所有资源都被正确释放
- ✅ **系统稳定**：保持系统稳定运行，避免资源耗尽
- ✅ **进程隔离**：确保进程退出时不影响其他进程

**详细说明**：请参考 [最佳实践 - 资源清理](#资源清理)

### 其他重要规范

#### 禁止自动初始化

**程序必须禁止自动初始化，等待 `ProcessManager` 调用**

```javascript
// ❌ 错误：自动初始化
(function() {
    const app = new MyApp();
    app.init();  // 这会在脚本加载时立即执行
})();

// ✅ 正确：等待 ProcessManager 调用
const MYAPP = {
    __init__: async function(pid, initArgs) {
        // 初始化代码
    }
};
```

#### DOM 元素标记

**所有程序创建的 DOM 元素必须标记 `data-pid` 属性**

```javascript
// ✅ 正确：标记 data-pid
const element = document.createElement('div');
element.dataset.pid = this.pid.toString();
```

#### 错误处理

**始终使用 try-catch 处理异步操作**

```javascript
// ✅ 正确：错误处理
__init__: async function(pid, initArgs) {
    try {
        await this._initialize();
    } catch (error) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.error('MYAPP', `初始化失败: ${error.message}`, error);
        }
        // 清理已创建的资源
        await this.__exit__();
    }
}
```

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

**推荐使用 GUIManager**，窗口的拖动、拉伸、最小化、最大化等功能会自动处理。GUIManager 会自动：
- 创建统一的标题栏（包含关闭、最小化、最大化按钮）
- 自动处理窗口拖动（通过标题栏）
- 自动处理窗口拉伸（四个角和四条边）
- 自动管理窗口焦点和 z-index
- 自动保护标题栏，防止被意外删除

如果需要自定义窗口控制，可以使用 EventManager：

```javascript
// 注册拖动事件（不推荐，GUIManager 已自动处理）
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

**注意**：如果使用 GUIManager，通常不需要手动注册拖动和拉伸事件，GUIManager 会自动处理。

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

## 用户控制系统

ZerOS 提供了完整的用户控制系统，支持多用户管理、权限级别控制和用户认证。

### 用户级别

系统支持三种用户级别：

- **USER** (`UserControl.USER_LEVEL.USER`): 普通用户，无法授权高风险权限
- **ADMIN** (`UserControl.USER_LEVEL.ADMIN`): 管理员，拥有完全控制权限
- **DEFAULT_ADMIN** (`UserControl.USER_LEVEL.DEFAULT_ADMIN`): 默认管理员（系统最高权限），默认用户名为 `root`

### 用户管理

#### 获取当前用户信息

```javascript
// 获取当前登录的用户名
const currentUser = UserControl.getCurrentUser();

// 获取当前用户的级别
const level = UserControl.getCurrentUserLevel();

// 检查是否为管理员
if (UserControl.isAdmin()) {
    console.log('当前用户是管理员');
}
```

#### 用户登录

```javascript
// 无密码用户登录
const success = await UserControl.login('root');

// 有密码用户登录
const success = await UserControl.login('TestUser', 'password123');
```

#### 密码管理

```javascript
// 检查用户是否有密码
const hasPassword = UserControl.hasPassword('TestUser');

// 设置用户密码（管理员可以设置任何用户的密码）
await UserControl.setPassword('TestUser', 'newpassword123');

// 非管理员用户修改自己的密码（需要提供当前密码）
await UserControl.setPassword('TestUser', 'newpassword123', 'oldpassword');
```

#### 头像管理

```javascript
// 设置用户头像（头像文件应已存在于 D:/cache/ 目录）
await UserControl.setAvatar('root', 'avatar_root_1234567890.jpg');

// 获取用户头像路径
const avatarPath = UserControl.getAvatarPath('root');
```

#### 用户列表

```javascript
// 列出所有用户
const users = UserControl.listUsers();
console.log('所有用户:', users);
// [
//   { username: 'root', level: 'DEFAULT_ADMIN', hasPassword: false, avatar: null },
//   { username: 'TestUser', level: 'USER', hasPassword: true, avatar: 'avatar_TestUser_1234567890.jpg' }
// ]
```

### 权限控制

普通用户无法授权高风险权限（如加密相关权限），只有管理员可以授权所有权限：

```javascript
// 检查权限是否为高风险权限
const isHighRisk = UserControl.isHighRiskPermission('CRYPT_GENERATE_KEY');

// 检查用户级别是否可以授权指定级别的权限
const canGrant = UserControl.canGrantPermission(
    UserControl.USER_LEVEL.USER,
    'DANGEROUS'
);
```

### 锁屏界面

系统启动时会显示 Windows 11 风格的锁屏界面，用户需要登录后才能进入桌面。

#### 手动锁定屏幕

可以通过 `Ctrl + L` 快捷键手动锁定屏幕：

```javascript
// 手动锁定屏幕（内部方法，通常通过快捷键调用）
TaskbarManager._lockScreen();
```

#### 锁屏功能特性

- **锁屏背景管理**:
  - **随机锁屏壁纸**: 从 `system/assets/start/` 目录随机选择背景图片（可开关）
  - **自定义锁屏背景**: 支持用户选择固定锁屏背景，独立于桌面背景管理
  - **发送到锁屏背景**: 从桌面背景页面可以发送背景到锁屏，自动去重
  - **锁屏背景删除**: 支持删除发送过来的锁屏背景（默认背景不可删除）
- **时间组件**: 左上角显示当前时间和日期，可开关控制（默认启用）
- **每日一言组件**: 显示每日励志语句，智能缓存管理，可开关控制（默认启用）
- **用户信息**: 中央显示用户头像和用户名
- **密码验证**: 如果用户有密码，需要输入正确密码才能登录
- **用户切换**: 点击用户头像可以切换显示的用户
- **加载动画**: 在登录过程中显示加载蒙版

#### 锁屏设置存储

锁屏相关设置存储在 LStorage 中：

```javascript
// 随机锁屏壁纸开关
system.lockscreenRandomBg: boolean  // 默认 true

// 自定义锁屏背景路径
system.lockscreenBackground: string  // 当随机壁纸关闭时使用

// 时间组件开关
system.lockscreenTimeComponent: boolean  // 默认 true

// 每日一言组件开关
system.lockscreenDailyQuote: boolean  // 默认 true
```

#### 每日一言缓存管理

每日一言使用 `CacheDrive` 进行缓存管理：

```javascript
// 缓存键
const cacheKey = 'system.dailyQuote';

// 读取缓存
const cachedQuote = await ProcessManager.callKernelAPI(
    ProcessManager.EXPLOIT_PID,
    'Cache.get',
    [{ key: cacheKey }]
);

// 保存到缓存
await ProcessManager.callKernelAPI(
    ProcessManager.EXPLOIT_PID,
    'Cache.set',
    [{ key: cacheKey, value: quote, options: { ttl: 0 } }]
);

// 删除缓存
await ProcessManager.callKernelAPI(
    ProcessManager.EXPLOIT_PID,
    'Cache.delete',
    [{ key: cacheKey }]
);
```

**缓存策略**：
- 系统启动时自动预加载下一句每日一言到缓存
- 显示时优先使用缓存，使用后删除缓存
- 自动预加载下一句，确保每次显示都有内容

### 设置程序

系统提供了内置的"设置"程序（可通过 `Ctrl + X` 快捷键启动），支持：

- **用户管理**: 更新用户头像、重命名用户、设置用户密码
- **主题管理**: 切换系统主题和桌面背景
- **扩展性**: 支持动态注册设置分类和设置项

设置程序使用 Windows 10 风格的 UI，并自动适配主题切换。

## 系统服务

### 语音识别

ZerOS 提供了基于 Web Speech API 的语音识别功能，支持多语言识别、持续识别和实时结果反馈。

#### 权限要求

使用语音识别功能需要 `SPEECH_RECOGNITION` 权限（特殊权限，需要用户确认）：

```javascript
__info__: function() {
    return {
        // ...
        permissions: ['SPEECH_RECOGNITION']
    };
}
```

#### 基本使用

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 1. 检查浏览器支持
    const supported = await Process.callKernelAPI('Speech.isSupported');
    if (!supported) {
        alert('浏览器不支持语音识别');
        return;
    }
    
    // 2. 创建识别会话
    await Process.callKernelAPI('Speech.createSession', [{
        language: 'zh-CN',  // 简体中文
        continuous: true,   // 持续识别
        interimResults: true,  // 返回临时结果
        onResult: (text, isFinal) => {
            if (isFinal) {
                console.log('最终结果:', text);
                this.handleFinalResult(text);
            } else {
                console.log('临时结果:', text);
                this.updateTemporaryResult(text);
            }
        },
        onError: (error) => {
            console.error('识别错误:', error);
            alert('识别出错: ' + error.message);
        },
        onEnd: () => {
            console.log('识别已结束');
        }
    }]);
    
    // 3. 启动识别
    await Process.callKernelAPI('Speech.startRecognition');
}

// 处理最终结果
handleFinalResult: function(text) {
    // 更新 UI 显示最终结果
    const resultElement = document.getElementById('result');
    if (resultElement) {
        resultElement.textContent = text;
    }
}

// 更新临时结果
updateTemporaryResult: function(text) {
    // 更新 UI 显示临时结果（灰色、斜体等）
    const tempElement = document.getElementById('temp-result');
    if (tempElement) {
        tempElement.textContent = text;
        tempElement.style.opacity = '0.6';
        tempElement.style.fontStyle = 'italic';
    }
}

__exit__: async function() {
    // 停止并销毁识别会话
    try {
        await Process.callKernelAPI('Speech.stopSession');
    } catch (error) {
        console.error('停止识别失败:', error);
    }
}
```

#### 控制识别

```javascript
// 停止识别（但保留会话）
await Process.callKernelAPI('Speech.stopRecognition');

// 重新启动识别
await Process.callKernelAPI('Speech.startRecognition');

// 获取会话状态
const status = await Process.callKernelAPI('Speech.getSessionStatus');
console.log('识别状态:', status.status);
console.log('识别语言:', status.language);
console.log('结果数量:', status.resultsCount);

// 获取所有最终结果
const results = await Process.callKernelAPI('Speech.getSessionResults');
console.log('所有结果:', results);
```

#### 支持的语言

语音识别支持多种语言，默认使用简体中文（`zh-CN`）：

- `zh-CN` - 简体中文（默认）
- `zh-TW` - 繁体中文
- `en-US` - 美式英语
- `en-GB` - 英式英语
- `ja-JP` - 日语
- `ko-KR` - 韩语
- `fr-FR` - 法语
- `de-DE` - 德语
- `es-ES` - 西班牙语
- `ru-RU` - 俄语

#### 注意事项

1. **浏览器支持**: 建议使用 Chrome 或 Edge 浏览器
2. **HTTPS 要求**: 需要 HTTPS 环境（localhost 可用）
3. **权限要求**: 首次使用需要用户授权麦克风权限
4. **自动清理**: 进程退出时会自动清理识别会话
5. **持续识别**: 如果设置了 `continuous: true`，识别停止后会自动重启
6. **临时结果**: 临时结果会实时更新，最终结果会被保存到会话中

#### 完整示例

```javascript
class VoiceAssistant {
    async __init__(pid, initArgs) {
        this.pid = pid;
        this.isListening = false;
        this.results = [];
        
        // 检查支持
        const supported = await Process.callKernelAPI('Speech.isSupported');
        if (!supported) {
            this.showError('浏览器不支持语音识别');
            return;
        }
        
        // 创建 UI
        this.createUI();
        
        // 创建识别会话
        await this.setupRecognition();
    }
    
    createUI() {
        const container = document.getElementById('gui-container');
        this.window = document.createElement('div');
        this.window.className = 'voice-assistant zos-gui-window';
        this.window.innerHTML = `
            <div class="status">未开始</div>
            <div class="temp-result" style="opacity: 0.6; font-style: italic;"></div>
            <div class="final-results"></div>
            <button class="start-btn">开始识别</button>
            <button class="stop-btn" disabled>停止识别</button>
        `;
        container.appendChild(this.window);
        
        // 绑定事件
        this.window.querySelector('.start-btn').addEventListener('click', () => this.start());
        this.window.querySelector('.stop-btn').addEventListener('click', () => this.stop());
    }
    
    async setupRecognition() {
        await Process.callKernelAPI('Speech.createSession', [{
            language: 'zh-CN',
            continuous: true,
            interimResults: true,
            onResult: (text, isFinal) => {
                if (isFinal) {
                    this.results.push(text);
                    this.updateFinalResults();
                } else {
                    this.updateTemporaryResult(text);
                }
            },
            onError: (error) => {
                this.showError('识别错误: ' + error.message);
                this.stop();
            }
        }]);
    }
    
    async start() {
        try {
            await Process.callKernelAPI('Speech.startRecognition');
            this.isListening = true;
            this.window.querySelector('.status').textContent = '正在识别...';
            this.window.querySelector('.start-btn').disabled = true;
            this.window.querySelector('.stop-btn').disabled = false;
        } catch (error) {
            this.showError('启动识别失败: ' + error.message);
        }
    }
    
    async stop() {
        try {
            await Process.callKernelAPI('Speech.stopRecognition');
            this.isListening = false;
            this.window.querySelector('.status').textContent = '已停止';
            this.window.querySelector('.start-btn').disabled = false;
            this.window.querySelector('.stop-btn').disabled = true;
        } catch (error) {
            this.showError('停止识别失败: ' + error.message);
        }
    }
    
    updateTemporaryResult(text) {
        const tempElement = this.window.querySelector('.temp-result');
        tempElement.textContent = text;
    }
    
    updateFinalResults() {
        const resultsElement = this.window.querySelector('.final-results');
        resultsElement.innerHTML = this.results.map((r, i) => 
            `<div class="result-item">${i + 1}. ${r}</div>`
        ).join('');
    }
    
    showError(message) {
        alert(message);
    }
    
    async __exit__() {
        if (this.isListening) {
            await this.stop();
        }
        await Process.callKernelAPI('Speech.stopSession');
        if (this.window && this.window.parentElement) {
            this.window.parentElement.removeChild(this.window);
        }
    }
}
```

更多详细信息请参考 [SpeechDrive API 文档](./API/SpeechDrive.md)。

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
// system/service/DISK/D/application/myapp/myapp.js
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
                
                // 注册事件处理程序（必须使用 EventManager）
                if (typeof EventManager !== 'undefined') {
                    EventManager.registerEventHandler(this.pid, 'click', (e, eventContext) => {
                        if (e.target.classList.contains('my-button')) {
                            // 处理按钮点击
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.info('MYAPP', '按钮被点击');
                            }
                        }
                    }, {
                        priority: 100,
                        selector: '.my-button'
                    });
                }
                
                // 添加到容器
                guiContainer.appendChild(this.window);
                
                // 初始化窗口状态
                this.windowState = {
                    isFullscreen: false,
                    isDragging: false,
                    isResizing: false
                };
                
            } catch (error) {
                // 使用 KernelLogger 记录错误（必须使用）
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MYAPP', `初始化失败: ${error.message}`, error);
                } else {
                    console.error('初始化失败:', error);
                }
                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                throw error;
            }
        },
        
        __exit__: async function() {
            try {
                // 1. 注销窗口（优先处理，确保窗口正确关闭）
                if (typeof GUIManager !== 'undefined') {
                    await GUIManager.unregisterWindow(this.pid);
                } else if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                
                // 2. EventManager 会自动清理所有通过它注册的事件监听器
                // 但如果有直接使用 addEventListener 的，需要手动清理
                if (this._manualEventListeners) {
                    this._manualEventListeners.forEach(({element, event, handler}) => {
                        if (element && typeof element.removeEventListener === 'function') {
                            element.removeEventListener(event, handler);
                        }
                    });
                    this._manualEventListeners = null;
                }
                
                // 3. 释放内存
                if (this.memoryRefs) {
                    for (const [refId, ref] of this.memoryRefs) {
                        if (typeof ProcessManager !== 'undefined') {
                            await ProcessManager.freeMemoryRef(this.pid, refId);
                        }
                    }
                    this.memoryRefs.clear();
                    this.memoryRefs = null;
                }
                
                // 4. 清理所有对象引用
                this.window = null;
                this.windowId = null;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('MYAPP', `清理资源失败: ${error.message}`, error);
                } else {
                    console.error('清理资源失败:', error);
                }
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
// system/service/DISK/D/application/mycli/mycli.js
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

A: **必须使用 EventManager**。所有事件处理都应该通过 EventManager 进行统一管理：

```javascript
// ✅ 正确：使用 EventManager
EventManager.registerEventHandler(this.pid, 'click', (e, eventContext) => {
    // 处理点击事件
}, {
    priority: 100,
    selector: '.my-button'
});

// ❌ 错误：直接使用 addEventListener（会被警告）
element.addEventListener('click', handler);
```

详细说明请参考 [EventManager API 文档](API/EventManager.md)

### Q: 如何保存用户数据？

A: 使用 Disk API 保存到文件系统，或使用 LStorage API：

```javascript
// 使用 Disk API
await Disk.writeFile('C:/Users/username/data.json', JSON.stringify(data));

// 使用 LStorage API
await LStorage.setProgramStorage(this.pid, 'settings', { theme: 'dark' });
```

### Q: 如何在程序中使用文件管理器选择文件或文件夹？

A: 使用 `ProcessManager.startProgram` 启动文件管理器，并传入选择器模式参数：

```javascript
// 选择单个文件
await ProcessManager.startProgram('filemanager', {
    args: [],
    mode: 'file-selector',
    onFileSelected: async (fileItem) => {
        if (fileItem && fileItem.path) {
            console.log('选择的文件:', fileItem.path);
            // 处理选择的文件
        }
    }
});

// 选择单个文件夹
await ProcessManager.startProgram('filemanager', {
    args: [],
    mode: 'folder-selector',
    onFolderSelected: async (folderItem) => {
        if (folderItem && folderItem.path) {
            console.log('选择的文件夹:', folderItem.path);
            // 处理选择的文件夹
        }
    }
});

// 多选文件/文件夹（支持同时选择多个文件和文件夹）
await ProcessManager.startProgram('filemanager', {
    args: [],
    mode: 'file-selector', // 或 'folder-selector'
    multiSelect: true, // 启用多选
    onMultipleSelected: async (selectedItems) => {
        // selectedItems 是一个数组，包含所有选中的项目
        console.log('选择了', selectedItems.length, '个项目');
        selectedItems.forEach(item => {
            console.log('-', item.path, item.type); // type: 'file' 或 'directory'
        });
        // 处理选中的多个项目
    }
});
```

**注意事项**：
- 在 `file-selector` 模式下，多选时可以选择文件和文件夹
- 在 `folder-selector` 模式下，多选时只能选择文件夹
- 选择完成后，文件管理器会自动关闭
- 如果用户取消选择，回调函数不会被调用

### Q: 程序支持多实例吗？

A: 在 `__info__` 的 `metadata` 中设置 `allowMultipleInstances: true`。注意：每个实例都有独立的 PID。

### Q: 如何获取程序的 PID？

A: PID 在 `__init__` 方法中作为第一个参数传入，应该保存到 `this.pid`：

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid; // 保存 PID
    // ...
}
```

### Q: 如何检查某个内核模块是否可用？

A: 使用 `typeof` 检查：

```javascript
if (typeof GUIManager !== 'undefined') {
    // GUIManager 可用
    await GUIManager.registerWindow(this.pid, this.window);
} else {
    console.warn('GUIManager 不可用');
}
```

### Q: 如何处理异步操作的错误？

A: 始终使用 try-catch 包裹异步操作：

```javascript
try {
    const result = await Disk.readFile('C:/data.txt');
    console.log(result);
} catch (error) {
    console.error('读取文件失败:', error);
    // 显示用户友好的错误提示
    if (typeof GUIManager !== 'undefined') {
        await GUIManager.showAlert('读取文件失败: ' + error.message, '错误', 'error');
    }
}
```

### Q: 如何创建自定义主题变量？

A: 使用 CSS 变量，并在主题切换时更新：

```css
.my-element {
    background: var(--theme-bg-primary);
    color: var(--theme-text-primary);
    border: 1px solid var(--theme-border-color);
}
```

主题变量由 ThemeManager 管理，程序无需手动设置。

### Q: 如何实现窗口拖拽功能？

A: 使用 GUIManager 的窗口管理功能，窗口标题栏自动支持拖拽。如果需要自定义拖拽区域，可以监听鼠标事件：

```javascript
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

element.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragOffset.x = e.clientX - element.offsetLeft;
    dragOffset.y = e.clientY - element.offsetTop;
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        element.style.left = (e.clientX - dragOffset.x) + 'px';
        element.style.top = (e.clientY - dragOffset.y) + 'px';
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});
```

### Q: 如何读取和写入文件？

A: 使用 Disk API 或 FSDirve.php 服务：

```javascript
// 使用 Disk API（推荐）
const content = await Disk.readFile('D:/data.txt');
await Disk.writeFile('D:/data.txt', '新内容');

// 使用 FSDirve.php 服务
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'read_file');
url.searchParams.set('path', 'D:/');
url.searchParams.set('fileName', 'data.txt');

const response = await fetch(url.toString());
const result = await response.json();
if (result.status === 'success') {
    console.log(result.data.content);
}
```

### Q: 如何压缩和解压缩文件？

A: 使用 CompressionDrive API：

```javascript
// 压缩单个文件或目录
await CompressionDrive.compressZip(
    'D:/source/file.txt',
    'D:/backup/archive.zip'
);

// 压缩多个文件/目录
await CompressionDrive.compressZip(
    ['D:/file1.txt', 'D:/dir1', 'D:/dir2'],
    'D:/backup/multi.zip'
);

// 解压缩
await CompressionDrive.extractZip(
    'D:/backup/archive.zip',
    'D:/extracted',
    { overwrite: true }
);

// 查看 ZIP 内容
const list = await CompressionDrive.listZip('D:/backup/archive.zip');
console.log(`包含 ${list.fileCount} 个文件`);
```

### Q: 如何检查文件是否存在？

A: 使用 FSDirve.php 的 `check_path_exists` 操作：

```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'check_path_exists');
url.searchParams.set('path', 'D:/data.txt');

const response = await fetch(url.toString());
const result = await response.json();
if (result.status === 'success' && result.data.exists) {
    console.log('文件存在');
}
```

### Q: 如何创建和删除目录？

A: 使用 FSDirve.php 服务：

```javascript
// 创建目录
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'create_dir');
url.searchParams.set('path', 'D:/newdir');

await fetch(url.toString());

// 删除目录
url.searchParams.set('action', 'delete_dir');
url.searchParams.set('path', 'D:/newdir');
await fetch(url.toString());
```

### Q: 如何列出目录内容？

A: 使用 FSDirve.php 的 `list_dir` 操作：

```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'list_dir');
url.searchParams.set('path', 'D:/application');

const response = await fetch(url.toString());
const result = await response.json();
if (result.status === 'success') {
    result.data.files.forEach(file => {
        console.log(file.name, file.type); // type: 'file' 或 'directory'
    });
}
```

### Q: 如何处理 ZIP 文件打开？

A: 文件管理器会自动识别 ZIP 文件，双击会使用 ziper 程序打开。在程序中也可以手动启动：

```javascript
await ProcessManager.startProgram('ziper', {
    args: ['D:/archive.zip'] // ZIP 文件路径
});
```

### Q: 如何显示通知？

A: 使用 NotificationManager：

```javascript
if (typeof NotificationManager !== 'undefined') {
    await NotificationManager.show({
        title: '操作完成',
        message: '文件已成功保存',
        type: 'success', // 'info', 'success', 'warning', 'error'
        duration: 3000
    });
}
```

### Q: 如何显示确认对话框？

A: 使用 GUIManager：

```javascript
if (typeof GUIManager !== 'undefined') {
    const confirmed = await GUIManager.showConfirm(
        '确定要删除这个文件吗？',
        '确认删除',
        'warning'
    );
    if (confirmed) {
        // 执行删除操作
    }
}
```

### Q: 如何获取当前主题信息？

A: 使用 ThemeManager：

```javascript
if (typeof ThemeManager !== 'undefined') {
    const theme = ThemeManager.getCurrentTheme();
    console.log('当前主题:', theme.name);
    console.log('主题变量:', theme.variables);
}
```

### Q: 如何处理大文件操作？

A: 对于大文件，建议：

1. 显示进度提示
2. 使用异步操作，避免阻塞 UI
3. 考虑分块处理

```javascript
// 显示加载状态
button.disabled = true;
button.textContent = '处理中...';

try {
    // 执行大文件操作
    await processLargeFile('D:/largefile.zip');
    
    button.textContent = '完成';
} catch (error) {
    button.textContent = '失败';
    console.error(error);
} finally {
    button.disabled = false;
}
```

### Q: 如何实现文件拖拽上传？

A: 监听拖拽事件：

```javascript
element.addEventListener('dragover', (e) => {
    e.preventDefault();
    element.classList.add('drag-over');
});

element.addEventListener('drop', async (e) => {
    e.preventDefault();
    element.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    for (const file of files) {
        // 读取文件内容
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target.result;
            // 保存到虚拟文件系统
            await Disk.writeFile(`D:/uploads/${file.name}`, content);
        };
        reader.readAsText(file);
    }
});
```

### Q: 如何实现程序间的数据共享？

A: 使用 POOL 共享空间：

```javascript
// 程序 A：设置共享数据
const sharedSpace = ProcessManager.getSharedSpace();
sharedSpace.setData('MYAPP_DATA', { key: 'value' });

// 程序 B：获取共享数据
const sharedSpace = ProcessManager.getSharedSpace();
const data = sharedSpace.getData('MYAPP_DATA');
```

### Q: 如何处理网络请求错误？

A: 检查响应状态和内容类型：

```javascript
try {
    const response = await fetch(url.toString());
    
    // 检查响应类型
    const contentType = response.headers.get('content-type') || '';
    let result;
    
    if (contentType.includes('application/json')) {
        result = await response.json();
    } else {
        const text = await response.text();
        throw new Error(`服务端返回非 JSON 响应: ${text.substring(0, 100)}`);
    }
    
    // 检查 HTTP 状态码
    if (!response.ok) {
        throw new Error(result.message || `HTTP ${response.status}`);
    }
    
    if (result.status === 'success') {
        // 处理成功响应
    } else {
        throw new Error(result.message || '操作失败');
    }
} catch (error) {
    console.error('请求失败:', error);
    // 显示错误提示
}
```

### Q: 如何优化程序性能？

A: 建议：

1. **延迟加载**：只在需要时加载资源
2. **事件委托**：使用事件委托减少事件监听器数量
3. **防抖节流**：对频繁触发的操作使用防抖或节流
4. **虚拟滚动**：对于长列表使用虚拟滚动
5. **内存管理**：及时清理不需要的引用

```javascript
// 防抖示例
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedSearch = debounce((query) => {
    performSearch(query);
}, 300);
```

### Q: 如何调试内存泄漏？

A: 检查以下几点：

1. 确保所有事件监听器在 `__exit__` 中被移除
2. 确保所有定时器被清除
3. 确保所有 DOM 元素引用被设置为 null
4. 使用浏览器开发者工具的 Memory 面板检查内存使用

```javascript
__exit__: async function() {
    // 清理事件监听器
    this._eventHandlers.forEach(({element, event, handler}) => {
        element.removeEventListener(event, handler);
    });
    
    // 清理定时器
    if (this._timers) {
        this._timers.forEach(timer => clearTimeout(timer));
    }
    
    // 清理引用
    this.window = null;
    this._eventHandlers = null;
    this._timers = null;
}
```

### Q: 如何处理路径转换？

A: 使用 ProcessManager 的路径转换功能：

```javascript
// 虚拟路径转实际 URL
if (typeof ProcessManager !== 'undefined' && 
    typeof ProcessManager.convertVirtualPathToUrl === 'function') {
    const url = ProcessManager.convertVirtualPathToUrl('D:/application/icon.svg');
    // 返回: http://localhost:8089/system/service/DISK/D/application/icon.svg
}
```

### Q: 如何实现右键菜单？

A: 使用 ContextMenuManager：

```javascript
if (typeof ContextMenuManager !== 'undefined') {
    ContextMenuManager.registerContextMenu(this.pid, {
        selector: '.my-element',
        items: [
            {
                label: '复制',
                icon: 'copy.svg',
                action: () => {
                    console.log('复制');
                }
            },
            {
                label: '删除',
                icon: 'trash.svg',
                action: () => {
                    console.log('删除');
                }
            }
        ]
    });
}
```

### Q: 如何实现窗口最小化/最大化？

A: 使用 GUIManager 的窗口管理功能：

```javascript
// 注册窗口时设置回调
GUIManager.registerWindow(this.pid, this.window, {
    onMinimize: () => {
        console.log('窗口已最小化');
    },
    onMaximize: (isMaximized) => {
        console.log('窗口状态:', isMaximized ? '最大化' : '还原');
    }
});
```

### Q: 如何处理程序崩溃？

A: 使用 try-catch 和错误边界：

```javascript
__init__: async function(pid, initArgs) {
    try {
        // 初始化代码
        await this._initialize();
    } catch (error) {
        console.error('初始化失败:', error);
        
        // 显示错误提示
        if (typeof GUIManager !== 'undefined') {
            await GUIManager.showAlert(
                `程序初始化失败: ${error.message}`,
                '错误',
                'error'
            );
        }
        
        // 清理已创建的资源
        await this.__exit__();
        
        // 退出程序
        if (typeof ProcessManager !== 'undefined') {
            ProcessManager.killProgram(this.pid);
        }
    }
}
```

### Q: 如何实现程序更新检查？

A: 可以通过网络请求检查版本：

```javascript
async function checkUpdate() {
    try {
        const response = await fetch('https://api.example.com/version');
        const latestVersion = await response.json();
        const currentVersion = this.__info__().version;
        
        if (latestVersion > currentVersion) {
            if (typeof GUIManager !== 'undefined') {
                const update = await GUIManager.showConfirm(
                    `发现新版本 ${latestVersion}，是否更新？`,
                    '更新提示',
                    'info'
                );
                if (update) {
                    // 执行更新逻辑
                }
            }
        }
    } catch (error) {
        console.error('检查更新失败:', error);
    }
}
```

### Q: 如何使用加密功能？

A: 通过 ProcessManager 调用加密 API，需要相应权限：

```javascript
// 在 __info__ 中声明权限
__info__() {
    return {
        // ...
        permissions: [
            PermissionManager.PERMISSION.CRYPT_GENERATE_KEY,
            PermissionManager.PERMISSION.CRYPT_ENCRYPT,
            PermissionManager.PERMISSION.CRYPT_DECRYPT,
            PermissionManager.PERMISSION.CRYPT_MD5,
            PermissionManager.PERMISSION.CRYPT_RANDOM
        ]
    };
}

// 生成密钥对
const keyPair = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.generateKeyPair',
    [{ keySize: 2048, setAsDefault: true }]
);

// 加密数据
const encrypted = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.encrypt',
    ['敏感数据']
);

// 解密数据
const decrypted = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.decrypt',
    [encrypted]
);

// MD5 哈希
const hash = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.md5',
    ['数据']
);

// 生成随机数
const randomInt = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.randomInt',
    [1, 100]
);

const randomString = await ProcessManager.callKernelAPI(
    this.pid,
    'Crypt.randomString',
    [16]
);
```

详细文档请参考 [CryptDrive API](API/CryptDrive.md)。

### Q: 如何实现程序设置持久化？

A: 使用 LStorage API：

```javascript
// 保存设置
await LStorage.setProgramStorage(this.pid, 'settings', {
    theme: 'dark',
    language: 'zh-CN',
    autoSave: true
});

// 读取设置
const settings = await LStorage.getProgramStorage(this.pid, 'settings') || {
    theme: 'light',
    language: 'zh-CN',
    autoSave: false
};
```

### Q: 如何处理文件类型识别？

A: 文件管理器会根据扩展名自动识别文件类型。在程序中也可以手动识别：

```javascript
function getFileType(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg'];
    const codeExts = ['js', 'ts', 'html', 'css', 'json'];
    
    if (imageExts.includes(ext)) return 'IMAGE';
    if (codeExts.includes(ext)) return 'CODE';
    if (ext === 'zip' || ext === 'rar') return 'ZIP';
    return 'BINARY';
}
```

### Q: 如何实现程序日志记录？

A: **必须使用 KernelLogger**。所有日志输出都应该通过 KernelLogger 进行统一管理：

```javascript
// ✅ 正确：使用 KernelLogger
if (typeof KernelLogger !== 'undefined') {
    KernelLogger.info('MYAPP', '程序启动');
    KernelLogger.warn('MYAPP', '警告信息');
    KernelLogger.error('MYAPP', '错误信息', error);
    KernelLogger.debug('MYAPP', '调试信息');
}

// ❌ 错误：直接使用 console.log（不推荐）
console.log('程序启动');
```

详细说明请参考 [KernelLogger API 文档](API/KernelLogger.md)

### Q: 如何处理程序权限请求？

A: 权限系统会自动处理。首次使用需要权限的 API 时，系统会提示用户授权：

```javascript
// 使用需要权限的 API
try {
    await Disk.writeFile('C:/system/file.txt', 'content');
} catch (error) {
    if (error.message.includes('权限')) {
        // 权限被拒绝
        console.log('用户拒绝了权限请求');
    }
}
```

### Q: 为什么我的程序无法注册事件处理程序？

A: 检查以下几点：

1. **是否声明了 EVENT_LISTENER 权限**：
```javascript
__info__() {
    return {
        permissions: [
            PermissionManager.PERMISSION.EVENT_LISTENER
        ]
    };
}
```

2. **是否使用了 EventManager**：
```javascript
// ✅ 正确
EventManager.registerEventHandler(this.pid, 'click', handler);

// ❌ 错误（会被警告）
element.addEventListener('click', handler);
```

3. **检查控制台日志**：查看是否有权限相关的警告信息

### Q: 如何正确清理事件监听器？

A: 在 `__exit__` 方法中使用 `EventManager.unregisterAllHandlersForPid`：

```javascript
__exit__: async function() {
    // 清理所有事件监听器
    if (typeof EventManager !== 'undefined') {
        EventManager.unregisterAllHandlersForPid(this.pid);
    }
    
    // 清理窗口
    if (this.windowId && typeof GUIManager !== 'undefined') {
        GUIManager.unregisterWindow(this.windowId);
    }
}
```

### Q: 窗口拖动和拉伸功能不工作怎么办？

A: 确保使用 `GUIManager.registerWindow` 注册窗口，窗口会自动获得拖动和拉伸功能：

```javascript
// GUIManager 会自动处理窗口拖动和拉伸
const windowInfo = GUIManager.registerWindow(this.pid, this.window, {
    title: '我的程序',
    icon: icon
});
```

如果窗口已经注册但拖动不工作，检查：
1. 窗口是否被最大化或最小化（最大化/最小化时无法拖动）
2. 是否点击在标题栏上（只有标题栏可以拖动）
3. 是否有其他元素遮挡了标题栏

### Q: 如何实现窗口内的元素拖动（非窗口拖动）？

A: 使用 `EventManager.registerDrag`：

```javascript
if (typeof EventManager !== 'undefined') {
    EventManager.registerDrag(
        `my-drag-${this.pid}`,
        draggableElement,  // 可拖动的元素
        containerElement,  // 容器元素
        { isDragging: false },  // 状态对象
        (e) => {
            // 拖动开始
            state.isDragging = true;
        },
        (e) => {
            // 拖动中
            if (state.isDragging) {
                // 更新元素位置
            }
        },
        (e) => {
            // 拖动结束
            state.isDragging = false;
        }
    );
}
```

### Q: 如何实现窗口拉伸功能？

A: 对于窗口，`GUIManager` 会自动创建拉伸器。对于自定义元素，使用 `EventManager.registerResizer`：

```javascript
if (typeof EventManager !== 'undefined') {
    EventManager.registerResizer(
        `my-resizer-${this.pid}`,
        resizerElement,  // 拉伸器元素
        targetElement,   // 目标元素
        { isResizing: false },  // 状态对象
        (e) => {
            // 拉伸开始
            state.isResizing = true;
        },
        (e) => {
            // 拉伸中
            if (state.isResizing) {
                // 更新元素大小
            }
        },
        (e) => {
            // 拉伸结束
            state.isResizing = false;
        }
    );
}
```

### Q: 如何获取当前窗口信息？

A: 使用 `GUIManager.getWindowInfo`：

```javascript
if (typeof GUIManager !== 'undefined' && this.windowId) {
    const windowInfo = GUIManager.getWindowInfo(this.windowId);
    if (windowInfo) {
        console.log('窗口标题:', windowInfo.title);
        console.log('是否最大化:', windowInfo.isMaximized);
        console.log('是否最小化:', windowInfo.isMinimized);
        console.log('z-index:', windowInfo.zIndex);
    }
}
```

### Q: 如何检查窗口是否获得焦点？

A: 使用 `GUIManager.getFocusedWindowId`：

```javascript
if (typeof GUIManager !== 'undefined') {
    const focusedWindowId = GUIManager.getFocusedWindowId();
    if (focusedWindowId === this.windowId) {
        console.log('当前窗口已获得焦点');
    }
}
```

### Q: 如何监听窗口焦点变化？

A: 使用 `EventManager.registerEventHandler` 监听 `focus` 和 `blur` 事件：

```javascript
if (typeof EventManager !== 'undefined') {
    EventManager.registerEventHandler(this.pid, 'focus', (e) => {
        if (e.target === this.window) {
            console.log('窗口获得焦点');
        }
    });
    
    EventManager.registerEventHandler(this.pid, 'blur', (e) => {
        if (e.target === this.window) {
            console.log('窗口失去焦点');
        }
    });
}
```

### Q: 如何实现模态对话框？

A: 使用 `GUIManager.showAlert`、`GUIManager.showConfirm` 或 `GUIManager.showPrompt`：

```javascript
// 提示框
await GUIManager.showAlert('操作完成', '提示', 'success');

// 确认框
const confirmed = await GUIManager.showConfirm(
    '确定要删除吗？',
    '确认删除',
    'warning'
);

// 输入框
const input = await GUIManager.showPrompt(
    '请输入文件名',
    '输入',
    'default.txt'
);
```

### Q: 如何创建自定义模态窗口？

A: 使用 `GUIManager.registerWindow` 创建窗口，并设置合适的 z-index：

```javascript
const dialogWindow = document.createElement('div');
dialogWindow.className = 'my-dialog zos-gui-window';
dialogWindow.style.cssText = `
    width: 500px;
    height: 400px;
    display: flex;
    flex-direction: column;
`;

const windowInfo = GUIManager.registerWindow(this.pid, dialogWindow, {
    title: '自定义对话框',
    icon: icon,
    onClose: () => {
        GUIManager.unregisterWindow(windowInfo.windowId);
    }
});

// 聚焦窗口
GUIManager.focusWindow(windowInfo.windowId);
```

### Q: 如何实现多窗口程序？

A: 使用 `childWindows` 数组管理多个窗口：

```javascript
const MYAPP = {
    pid: null,
    window: null,
    childWindows: [],  // 子窗口列表
    
    _openChildWindow: function(data) {
        const childWindow = document.createElement('div');
        childWindow.className = 'myapp-child-window zos-gui-window';
        
        const windowInfo = GUIManager.registerWindow(this.pid, childWindow, {
            title: '子窗口',
            onClose: () => {
                // 从列表中移除
                const index = this.childWindows.findIndex(w => w.windowId === windowInfo.windowId);
                if (index !== -1) {
                    this.childWindows.splice(index, 1);
                }
                GUIManager.unregisterWindow(windowInfo.windowId);
            }
        });
        
        // 保存到列表
        this.childWindows.push({
            windowId: windowInfo.windowId,
            window: childWindow,
            windowInfo: windowInfo
        });
        
        GUIManager.focusWindow(windowInfo.windowId);
    },
    
    __exit__: async function() {
        // 关闭所有子窗口
        this.childWindows.forEach(child => {
            if (child.windowId && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(child.windowId);
            }
        });
        this.childWindows = [];
        
        // 关闭主窗口
        if (this.windowId && typeof GUIManager !== 'undefined') {
            GUIManager.unregisterWindow(this.windowId);
        }
    }
};
```

### Q: 如何实现程序间的通信？

A: 使用 POOL 共享空间：

```javascript
// 程序 A：发布数据
if (typeof POOL !== 'undefined') {
    if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
        POOL.__INIT__("APPLICATION_SHARED_POOL");
    }
    POOL.__ADD__("APPLICATION_SHARED_POOL", "MyAppData", {
        value: 'some data',
        update: (newValue) => {
            // 更新数据
        }
    });
}

// 程序 B：获取数据
if (typeof POOL !== 'undefined') {
    const myAppData = POOL.__GET__("APPLICATION_SHARED_POOL", "MyAppData");
    if (myAppData) {
        console.log(myAppData.value);
    }
}
```

### Q: 如何处理文件路径中的特殊字符？

A: 使用 `ProcessManager.callKernelAPI` 调用 `FileSystem` API，它会自动处理路径规范化：

```javascript
// ✅ 正确：使用 FileSystem API
const content = await ProcessManager.callKernelAPI(
    this.pid,
    'FileSystem.read',
    ['D:/path with spaces/file.txt']
);

// ❌ 错误：直接使用路径可能有问题
const url = `/system/service/FSDirve.php?path=D:/path with spaces/file.txt`;
```

### Q: 如何检查文件或目录是否存在？

A: 使用 `FileSystem.list` 或 `FileSystem.read`：

```javascript
try {
    // 尝试读取文件
    await ProcessManager.callKernelAPI(
        this.pid,
        'FileSystem.read',
        ['D:/file.txt']
    );
    console.log('文件存在');
} catch (error) {
    if (error.message.includes('不存在') || error.message.includes('not found')) {
        console.log('文件不存在');
    }
}

// 或者列出目录内容
try {
    const list = await ProcessManager.callKernelAPI(
        this.pid,
        'FileSystem.list',
        ['D:/directory']
    );
    console.log('目录存在，包含', list.length, '个项目');
} catch (error) {
    console.log('目录不存在');
}
```

### Q: 如何实现文件上传功能？

A: 使用 HTML5 File API 和 FileSystem API：

```javascript
// 创建文件输入元素
const input = document.createElement('input');
input.type = 'file';
input.multiple = true;  // 支持多选

input.addEventListener('change', async (e) => {
    const files = e.target.files;
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target.result;
            // 保存到虚拟文件系统
            await ProcessManager.callKernelAPI(
                this.pid,
                'FileSystem.write',
                [`D:/uploads/${file.name}`, content]
            );
            console.log(`文件 ${file.name} 已上传`);
        };
        reader.readAsText(file);  // 或 readAsArrayBuffer 用于二进制文件
    }
});

input.click();
```

### Q: 如何实现文件下载功能？

A: 读取文件内容后创建下载链接：

```javascript
async function downloadFile(virtualPath, fileName) {
    try {
        // 读取文件内容
        const content = await ProcessManager.callKernelAPI(
            this.pid,
            'FileSystem.read',
            [virtualPath]
        );
        
        // 创建 Blob
        const blob = new Blob([content], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        // 创建下载链接
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || virtualPath.split('/').pop();
        a.click();
        
        // 清理
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('下载失败:', error);
        if (typeof GUIManager !== 'undefined') {
            await GUIManager.showAlert('下载失败: ' + error.message, '错误', 'error');
        }
    }
}
```

### Q: 如何实现程序自动更新？

A: 检查版本并提示用户：

```javascript
async function checkForUpdates() {
    try {
        // 获取当前版本
        const currentVersion = this.__info__().version;
        
        // 检查最新版本（从服务器或配置文件）
        const response = await fetch('/system/service/version.json');
        const versionInfo = await response.json();
        
        if (versionInfo.latestVersion > currentVersion) {
            const update = await GUIManager.showConfirm(
                `发现新版本 ${versionInfo.latestVersion}，是否更新？`,
                '更新提示',
                'info'
            );
            
            if (update) {
                // 执行更新逻辑
                // 例如：重新加载程序文件
                window.location.reload();
            }
        }
    } catch (error) {
        KernelLogger.warn('MYAPP', '检查更新失败', error);
    }
}
```

### Q: 如何处理程序崩溃和错误恢复？

A: 使用 try-catch 和错误边界：

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    try {
        await this._initialize();
    } catch (error) {
        KernelLogger.error('MYAPP', '初始化失败', error);
        
        // 显示错误提示
        if (typeof GUIManager !== 'undefined') {
            await GUIManager.showAlert(
                `程序启动失败: ${error.message}`,
                '错误',
                'error'
            );
        }
        
        // 清理资源
        await this.__exit__();
        
        // 退出程序
        if (typeof ProcessManager !== 'undefined') {
            ProcessManager.killProgram(this.pid);
        }
        return;
    }
}

_initialize: async function() {
    // 初始化代码
    // 如果出错，会抛出异常
}
```

### Q: 如何实现程序设置界面？

A: 创建设置窗口并使用 LStorage 保存：

```javascript
_openSettings: function() {
    const settingsWindow = document.createElement('div');
    settingsWindow.className = 'myapp-settings zos-gui-window';
    
    // 加载当前设置
    LStorage.getProgramStorage(this.pid, 'settings').then(settings => {
        // 填充设置表单
        const themeSelect = settingsWindow.querySelector('#theme-select');
        themeSelect.value = settings?.theme || 'dark';
    });
    
    // 保存按钮
    const saveBtn = settingsWindow.querySelector('#save-settings');
    saveBtn.addEventListener('click', async () => {
        const newSettings = {
            theme: settingsWindow.querySelector('#theme-select').value,
            // ... 其他设置
        };
        
        await LStorage.setProgramStorage(this.pid, 'settings', newSettings);
        
        // 关闭设置窗口
        GUIManager.unregisterWindow(settingsWindowInfo.windowId);
        
        // 应用新设置
        this._applySettings(newSettings);
    });
    
    const settingsWindowInfo = GUIManager.registerWindow(this.pid, settingsWindow, {
        title: '设置',
        onClose: () => {
            GUIManager.unregisterWindow(settingsWindowInfo.windowId);
        }
    });
}
```

### Q: 如何实现程序快捷键？

A: 使用 `EventManager.registerEventHandler` 监听键盘事件：

```javascript
if (typeof EventManager !== 'undefined') {
    EventManager.registerEventHandler(this.pid, 'keydown', (e, eventContext) => {
        // Ctrl+S: 保存
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            eventContext.preventDefault();
            this._save();
        }
        
        // Ctrl+N: 新建
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            eventContext.preventDefault();
            this._new();
        }
        
        // Escape: 关闭
        if (e.key === 'Escape') {
            if (this._hasUnsavedChanges()) {
                // 提示保存
            } else {
                this._close();
            }
        }
    }, {
        priority: 50,  // 较高优先级
        useCapture: true
    });
}
```

### Q: 如何实现程序状态持久化？

A: 使用 LStorage 或文件系统：

```javascript
// 保存状态
async _saveState() {
    const state = {
        windowPosition: { x: this.window.style.left, y: this.window.style.top },
        windowSize: { width: this.window.style.width, height: this.window.style.height },
        userData: this.userData
    };
    
    await LStorage.setProgramStorage(this.pid, 'state', state);
}

// 恢复状态
async _restoreState() {
    const state = await LStorage.getProgramStorage(this.pid, 'state');
    if (state) {
        if (state.windowPosition) {
            this.window.style.left = state.windowPosition.x;
            this.window.style.top = state.windowPosition.y;
        }
        if (state.windowSize) {
            this.window.style.width = state.windowSize.width;
            this.window.style.height = state.windowSize.height;
        }
        if (state.userData) {
            this.userData = state.userData;
        }
    }
}
```

### Q: 如何实现程序国际化（i18n）？

A: 使用配置文件和多语言支持：

```javascript
const i18n = {
    'zh-CN': {
        'save': '保存',
        'cancel': '取消',
        'delete': '删除'
    },
    'en-US': {
        'save': 'Save',
        'cancel': 'Cancel',
        'delete': 'Delete'
    }
};

// 获取当前语言
_getLanguage: function() {
    const settings = await LStorage.getProgramStorage(this.pid, 'settings');
    return settings?.language || 'zh-CN';
}

// 翻译文本
_t: function(key) {
    const lang = this._getLanguage();
    return i18n[lang]?.[key] || key;
}

// 使用
button.textContent = this._t('save');
```

### Q: 如何实现程序插件系统？

A: 使用 POOL 共享空间和事件系统：

```javascript
// 主程序：注册插件接口
if (typeof POOL !== 'undefined') {
    POOL.__ADD__("APPLICATION_SHARED_POOL", "MyAppPluginAPI", {
        registerPlugin: (plugin) => {
            this.plugins.push(plugin);
            plugin.init?.(this);
        },
        unregisterPlugin: (pluginId) => {
            this.plugins = this.plugins.filter(p => p.id !== pluginId);
        }
    });
}

// 插件：注册到主程序
const pluginAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "MyAppPluginAPI");
if (pluginAPI) {
    pluginAPI.registerPlugin({
        id: 'my-plugin',
        name: '我的插件',
        init: (app) => {
            // 插件初始化
        }
    });
}
```

---

## 参考资源

- **示例程序**: 查看 `system/service/DISK/D/application/` 目录下的示例程序
  - `terminal/`: 终端程序示例
  - `vim/`: 文本编辑器示例
  - `filemanager/`: 文件管理器示例（支持选择器模式、多选功能）
  - `browser/`: 浏览器示例
  - `ziper/`: ZIP 压缩工具示例（支持多文件/目录压缩、ZIP 内容查看）

- **内核模块**: 查看 `kernel/` 目录下的内核模块实现

- **API 文档**: 查看 [API 文档索引](API/README.md) 获取完整的 API 参考

- **内核架构**: 查看 [内核架构文档](ZEROS_KERNEL.md) 了解系统设计

---

**祝开发愉快！**

如有问题，请参考现有程序的实现或查看内核模块的源代码。
