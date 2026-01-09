# ZOM 程序安装包文档

## 概述

ZOM (ZerOS Object Module) 是 ZerOS 系统的程序安装包格式，实际上是 ZIP 压缩包的另一种扩展名（`.zom`）。ZOM 安装包用于分发和安装 ZerOS 应用程序，包含程序的所有资源文件、配置信息和安装脚本。

## ZOMInstall 安装程序

`zominstall` 是 ZerOS 系统的 CLI 程序安装工具，位于 `D:/bin/zominstall.js`。该程序负责解压、安装和注册 ZOM 程序包。

### 使用方法

```bash
# 安装 ZOM 程序包
zominstall <zom文件路径>

# 查看帮助
zominstall -h
```

**重要**：只有管理员用户可以安装程序。非管理员用户尝试安装程序时，`zominstall` 会显示权限不足错误并退出。

### 安装流程

1. **解压文件**：将 `.zom` 文件解压到 `D:/cache/temp/` 临时目录
2. **读取配置**：读取 `application.json` 获取程序信息
3. **复制并注册**：复制所有文件（排除 `application.json` 和 `setup.js`）到 `D:/application/<程序名>/` 并注册程序
4. **执行安装脚本**：如果存在 `setup.js`，自动执行
5. **清理临时文件**：删除解压后的所有临时文件

### 权限要求

**用户权限**：
- **需要管理员用户权限**：只有管理员用户（`ADMIN` 或 `DEFAULT_ADMIN`）可以安装程序，普通用户（`USER`）禁止安装程序
- 非管理员用户尝试安装程序时，`zominstall` 会显示错误并退出

**程序权限**：
安装程序需要以下权限：
- `APPLICATION_INSTALL`：安装应用程序（危险权限，需要管理员授权）
- `KERNEL_DISK_READ`：读取文件
- `KERNEL_DISK_WRITE`：写入文件
- `KERNEL_DISK_CREATE`：创建文件/目录
- `KERNEL_DISK_DELETE`：删除文件

**安全策略**：
- 权限检查在多个层面进行：
  1. **UI 层**：文件管理器在启动 `zominstall` 前会检查管理员权限，非管理员用户会看到权限不足提示
  2. **程序层**：`zominstall` 程序在开始安装前会检查管理员权限，非管理员用户会看到错误提示并退出
  3. **内核层**：`LStorage.installApplication()` 会验证管理员权限和 `APPLICATION_INSTALL` 权限

### 特性

- 不支持多实例（`allowMultipleInstances: false`）
- 自动处理文件路径转换（相对路径 → 绝对路径）
- 支持递归目录结构
- 自动清理临时文件（即使安装失败）
- 详细的安装进度提示

## ZOM 文件结构

### 目录结构示例

```
myapp.zom (ZIP 压缩包)
├── application.json          # 程序配置文件（必需，不会被复制到 application/）
├── setup.js                  # 安装脚本（可选，不会被复制到 application/）
├── myapp.js                  # 主程序脚本
├── myapp.css                 # 样式文件
├── icon.svg                  # 程序图标
└── assets/                   # 资源文件目录
    ├── data.json
    ├── images/
    │   ├── logo.png
    │   └── background.jpg
    └── fonts/
        └── custom.woff2
```

### 文件说明

#### 1. application.json（必需）

程序配置文件，包含程序的所有元数据和资源路径信息。该文件**不会被复制**到 `D:/application/` 目录，仅用于安装时读取配置。

**格式**：

```json
{
    "name": "myapp",
    "version": "1.0.0",
    "description": "我的应用程序",
    "script": "myapp.js",
    "styles": ["myapp.css"],
    "icon": "icon.svg",
    "assets": [
        "assets/data.json",
        "assets/images/logo.png"
    ],
    "type": "GUI",
    "autoStart": false,
    "priority": 5,
    "alwaysShowInTaskbar": false,
    "allowMultipleInstances": true,
    "supportsPreview": true,
    "category": "utility"
}
```

**字段说明**：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 程序名称（用于注册和标识） |
| `version` | string | 否 | 程序版本号（默认：`"1.0.0"`） |
| `description` | string | 否 | 程序描述（默认：`""`） |
| `script` | string | 否 | 主脚本文件路径（相对路径，默认：`"<程序名>.js"`） |
| `styles` | string[] | 否 | 样式文件路径数组（相对路径，默认：`[]`） |
| `icon` | string | 否 | 图标文件路径（相对路径，默认：`null`） |
| `assets` | string[] | 否 | 资源文件路径数组（相对路径，默认：`[]`） |
| `type` | string | 否 | 程序类型：`"GUI"` 或 `"CLI"`（默认：`"GUI"`） |
| `autoStart` | boolean | 否 | 是否自动启动（默认：`false`） |
| `priority` | number | 否 | 启动优先级（默认：`5`） |
| `alwaysShowInTaskbar` | boolean | 否 | 是否常显在任务栏（默认：`false`） |
| `allowMultipleInstances` | boolean | 否 | 是否支持多实例（默认：`true`） |
| `supportsPreview` | boolean | 否 | 是否支持窗口预览快照（默认：`true`） |
| `category` | string | 否 | 程序分类：`"system"`, `"utility"`, `"game"`, `"other"`（默认：`"other"`） |

**路径说明**：

- 所有路径（`script`, `styles`, `icon`, `assets`）都应该是**相对路径**，相对于 ZOM 文件解压后的根目录
- 安装程序会自动将这些相对路径转换为绝对路径（`D:/application/<程序名>/<路径>`）
- 例如：`"script": "myapp.js"` → `"D:/application/myapp/myapp.js"`

#### 2. setup.js（可选）

安装脚本，在程序文件复制完成后、注册之后执行。该文件**不会被复制**到 `D:/application/` 目录。

**重要**：`setup.js` 必须遵守 ZerOS 程序开发约定，作为标准的 ZerOS GUI 程序执行。

**程序结构要求**：

`setup.js` 必须实现以下必需方法：

```javascript
(function(window) {
    'use strict';
    
    const SETUP = {
        pid: null,
        window: null,
        
        // 安装上下文（从 initArgs 获取）
        _installContext: null,
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'Setup',
                type: 'GUI',
                version: '1.0.0',
                description: '安装脚本',
                author: 'Your Name',
                copyright: '© 2025',
                permissions: [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.DESKTOP_MANAGE
                ],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        },
        
        /**
         * 初始化方法
         */
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 从 initArgs.metadata.installContext 获取安装上下文
            if (initArgs && initArgs.metadata && initArgs.metadata.installContext) {
                this._installContext = initArgs.metadata.installContext;
            }
            
            // 创建 GUI 窗口（使用 GUIManager）
            // ... 实现安装选项界面 ...
        },
        
        /**
         * 退出方法
         */
        __exit__: async function() {
            // 清理资源
        }
    };
    
    // 重要：必须导出到 window.SETUP，不能使用其他名称
    // ProcessManager 会查找 window.SETUP 来注册程序对象
    if (typeof window !== 'undefined') {
        window.SETUP = SETUP;
    }
    
})(window);
```

**重要提示**：

- **程序对象名称必须为 `SETUP`**：`setup.js` 中的程序对象必须命名为 `SETUP`，并导出到 `window.SETUP`
- **不能使用其他名称**：如 `PIANO_SETUP`、`MYAPP_SETUP` 等都是错误的，必须使用 `SETUP`
- **原因**：`zominstall` 使用 `ProcessManager.startProgram()` 启动 `setup.js` 时，会查找 `window.SETUP` 来注册程序对象
- **如果使用错误的名称**：程序将无法正确注册，导致加载超时错误

**安装上下文**：

`setup.js` 通过 `initArgs.metadata.installContext` 获取安装上下文：

```javascript
{
    programName: "myapp",      // 程序名称（从 application.json 读取）
    tempDir: "D:/cache/temp",  // 临时目录路径
    terminal: terminal,        // 终端对象（用于输出信息）
    installerPid: 12345        // 安装程序的进程 ID
}
```

**示例**：

```javascript
// setup.js - 提供 GUI 安装选项界面
(function(window) {
    'use strict';
    
    // 重要：程序对象必须命名为 SETUP，不能使用其他名称（如 PIANO_SETUP）
    const SETUP = {
        pid: null,
        window: null,
        _installContext: null,
        
        __info__: function() {
            return {
                name: 'Setup',
                type: 'GUI',
                version: '1.0.0',
                description: '安装脚本',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.DESKTOP_MANAGE,
                    PermissionManager.PERMISSION.DESKTOP_SHORTCUT
                ],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        },
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 获取安装上下文
            if (initArgs && initArgs.metadata && initArgs.metadata.installContext) {
                this._installContext = initArgs.metadata.installContext;
            }
            
            const programName = this._installContext ? this._installContext.programName : 'unknown';
            
            // 创建 GUI 窗口，提供安装选项（创建桌面图标、固定到任务栏、自启动等）
            // 使用 GUIManager 创建窗口
            if (typeof GUIManager === 'undefined') {
                throw new Error('GUIManager 不可用');
            }
            
            const guiContainer = ProcessManager.getGUIContainer();
            this.window = document.createElement('div');
            this.window.className = 'setup-window zos-gui-window';
            
            const windowInfo = GUIManager.registerWindow(pid, this.window, {
                title: `安装 ${programName}`,
                icon: null,
                onClose: () => {
                    // 窗口关闭处理
                }
            });
            
            // 创建安装选项界面
            // ... 实现 GUI 界面（复选框：创建桌面图标、固定到任务栏、自启动等）...
            
            // 用户确认后，执行相应的操作
            // 例如：创建桌面图标、固定到任务栏、设置自启动等
        },
        
        __exit__: async function() {
            // 清理资源
            if (this.window && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            }
        }
    };
    
    // 重要：必须导出到 window.SETUP，不能使用其他名称
    if (typeof window !== 'undefined') {
        window.SETUP = SETUP;
    }
    
})(window);
```

**注意事项**：

- **程序对象名称**：`setup.js` 中的程序对象**必须命名为 `SETUP`**，并导出到 `window.SETUP`。不能使用其他名称（如 `PIANO_SETUP`、`MYAPP_SETUP` 等）
- **程序注册**：`ProcessManager.startProgram()` 会查找 `window.SETUP` 来注册程序对象。如果使用错误的名称，程序将无法正确注册，导致加载超时错误
- **ZerOS 程序约定**：`setup.js` 必须遵守 ZerOS 程序开发约定（IIFE 模式、`__init__`、`__exit__`、`__info__` 方法）
- **执行方式**：`setup.js` 作为标准的 ZerOS GUI 程序执行，享有完整的进程管理和权限控制
- **启动方式**：`setup.js` 通过 `ProcessManager.startProgram()` 启动，使用 `tempAsset` 参数传入脚本内容
- **错误处理**：如果 `setup.js` 执行失败或加载超时，安装过程会继续，但会记录警告信息
- **安装上下文**：`setup.js` 中可以使用 `_installContext.terminal.write()` 输出安装信息
- **内核 API**：`setup.js` 可以通过 `ProcessManager.callKernelAPI()` 调用内核 API（如 `Desktop.addShortcut`、`Taskbar.pinProgram`、`Application.install` 等）

#### 3. 程序资源文件

所有其他文件（除了 `application.json` 和 `setup.js`）都会被复制到 `D:/application/<程序名>/` 目录下，保持原有的目录结构。

**示例**：

如果 ZOM 文件包含以下结构：
```
myapp.zom
├── application.json
├── setup.js
├── myapp.js
├── myapp.css
├── icon.svg
└── assets/
    └── data.json
```

安装后，`D:/application/myapp/` 目录结构为：
```
D:/application/myapp/
├── myapp.js
├── myapp.css
├── icon.svg
└── assets/
    └── data.json
```

## 完整示例

### 示例 1：简单的 GUI 程序

**目录结构**：
```
calculator.zom
├── application.json
├── calculator.js
├── calculator.css
└── icon.svg
```

**application.json**：
```json
{
    "name": "calculator",
    "version": "1.0.0",
    "description": "简单计算器",
    "script": "calculator.js",
    "styles": ["calculator.css"],
    "icon": "icon.svg",
    "type": "GUI",
    "category": "utility"
}
```

### 示例 2：带资源文件的程序

**目录结构**：
```
imageviewer.zom
├── application.json
├── setup.js
├── imageviewer.js
├── imageviewer.css
├── icon.svg
└── assets/
    ├── icons/
    │   ├── open.svg
    │   ├── save.svg
    │   └── close.svg
    └── themes/
        └── dark.css
```

**application.json**：
```json
{
    "name": "imageviewer",
    "version": "2.1.0",
    "description": "图片查看器",
    "script": "imageviewer.js",
    "styles": ["imageviewer.css"],
    "icon": "icon.svg",
    "assets": [
        "assets/icons/open.svg",
        "assets/icons/save.svg",
        "assets/icons/close.svg",
        "assets/themes/dark.css"
    ],
    "type": "GUI",
    "allowMultipleInstances": true,
    "supportsPreview": true,
    "category": "system"
}
```

**setup.js**：
```javascript
// setup.js - 创建默认配置文件
context.terminal.write('正在创建默认配置...\n');

// 注意：实际实现需要使用 Process.callKernelAPI 或相应的文件系统 API
// 这里只是示例
```

### 示例 3：CLI 程序

**目录结构**：
```
mycli.zom
├── application.json
└── mycli.js
```

**application.json**：
```json
{
    "name": "mycli",
    "version": "1.0.0",
    "description": "命令行工具",
    "script": "mycli.js",
    "type": "CLI",
    "category": "utility"
}
```

## 安装后的程序注册

安装完成后，程序会被注册到 `ApplicationTable`（动态程序注册表），可以通过以下方式访问：

```javascript
// 查询已安装的程序
const app = await Process.callKernelAPI('Application.get', ['myapp']);

// 检查程序是否已安装
const isInstalled = await Process.callKernelAPI('Application.isInstalled', ['myapp']);

// 列出所有动态安装的程序
const apps = await Process.callKernelAPI('Application.list', []);
```

## 卸载程序

使用 `Application.uninstall` API 卸载程序：

```javascript
// 卸载程序（会自动删除所有文件）
await Process.callKernelAPI('Application.uninstall', ['myapp']);
```

**权限要求**：
- **需要管理员用户权限**：只有管理员用户（`ADMIN` 或 `DEFAULT_ADMIN`）可以卸载程序，普通用户（`USER`）禁止卸载程序
- 需要 `APPLICATION_UNINSTALL` 权限（危险权限，仅管理员可授予）

**安全策略**：
- 非管理员用户尝试卸载程序时，会抛出错误：`安全策略：普通用户不允许卸载应用程序，需要管理员权限`
- 权限检查在多个层面进行：
  1. **UI 层**：设置程序在调用卸载前会检查管理员权限，非管理员用户会看到权限不足提示
  2. **内核层**：`LStorage.uninstallApplication()` 会验证管理员权限和 `APPLICATION_UNINSTALL` 权限

**卸载流程**：

1. 验证权限（管理员权限和 `APPLICATION_UNINSTALL` 权限）
2. 检查是否为静态程序（静态程序不允许卸载）
3. 删除桌面图标和任务栏固定（如果存在）
4. **执行 `uninstall.js`（如果存在）**：在删除文件之前，尝试执行 `D:/application/<程序名>/uninstall.js`
5. 删除 `D:/application/<程序名>/` 目录下的所有文件
6. 从 `ApplicationTable` 中删除程序
7. 自动刷新 `ApplicationAssetManager`（使卸载的程序立即从列表中移除）

**uninstall.js（可选）**：

如果程序目录中存在 `uninstall.js` 文件，卸载流程会在删除文件之前执行它。`uninstall.js` 必须遵守 ZerOS 程序开发约定，作为标准的 ZerOS GUI 程序执行。

**uninstall.js 职责**：

`uninstall.js` 应该负责以下任务：

1. **清理注册表数据**：删除程序在注册表中注册的数据（如配置、缓存键等）
2. **删除缓存文件**：删除程序创建的缓存文件（如 `D:/cache/<程序名>/` 目录下的文件）
3. **清理其他残留数据**：删除程序创建的其他数据文件（但不包括程序资源文件，因为系统会自动处理）

**重要**：`uninstall.js` **不应该**删除程序资源文件（如脚本、样式、图标等），因为这些文件会在 `uninstall.js` 执行完成后由系统自动删除。

**uninstall.js 程序结构**：

`uninstall.js` 必须实现以下必需方法：

```javascript
(function(window) {
    'use strict';
    
    // 重要：程序对象必须命名为 UNINSTALL，不能使用其他名称
    const UNINSTALL = {
        pid: null,
        _uninstallContext: null,
        
        __info__: function() {
            return {
                name: 'Uninstall',
                type: 'GUI',
                version: '1.0.0',
                description: '卸载脚本',
                author: 'Your Name',
                copyright: '© 2025',
                permissions: [
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE
                ],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        },
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 获取卸载上下文
            if (initArgs && initArgs.metadata && initArgs.metadata.uninstallContext) {
                this._uninstallContext = initArgs.metadata.uninstallContext;
            }
            
            const programName = this._uninstallContext ? this._uninstallContext.programName : 'unknown';
            const appDirPath = this._uninstallContext ? this._uninstallContext.appDirPath : null;
            
            // 执行清理操作
            // 1. 删除注册表数据
            // 2. 删除缓存文件
            // 3. 清理其他残留数据
            
            // 完成后，程序会自动退出
        },
        
        __exit__: async function() {
            // 清理资源
        }
    };
    
    // 重要：必须导出到 window.UNINSTALL，不能使用其他名称
    if (typeof window !== 'undefined') {
        window.UNINSTALL = UNINSTALL;
    }
    
})(window);
```

**卸载上下文**：

`uninstall.js` 通过 `initArgs.metadata.uninstallContext` 获取卸载上下文：

```javascript
{
    programName: "myapp",              // 程序名称
    appDirPath: "D:/application/myapp", // 程序目录路径
    asset: { ... }                      // 程序资源对象
}
```

**重要提示**：

- **程序对象名称必须为 `UNINSTALL`**：`uninstall.js` 中的程序对象必须命名为 `UNINSTALL`，并导出到 `window.UNINSTALL`
- **不能使用其他名称**：如 `PIANO_UNINSTALL`、`MYAPP_UNINSTALL` 等都是错误的，必须使用 `UNINSTALL`
- **原因**：`LStorage.uninstallApplication()` 使用 `ProcessManager.startProgram()` 启动 `uninstall.js` 时，会查找 `window.UNINSTALL` 来注册程序对象
- **如果使用错误的名称**：程序将无法正确注册，导致加载超时错误
- **执行时机**：`uninstall.js` 在删除程序文件**之前**执行，因此可以访问程序的所有资源文件
- **执行超时**：如果 `uninstall.js` 在 30 秒内未完成，卸载流程会继续，但会记录警告信息
- **错误处理**：如果 `uninstall.js` 执行失败或加载超时，卸载过程会继续，但会记录警告信息

**注意**：
- 卸载程序会删除 `D:/application/<程序名>/` 目录下的所有文件
- 静态程序（注册在 `applicationAssets.js` 中）不允许卸载
- **只有管理员用户可以卸载程序**：普通用户（`USER`）禁止卸载程序，需要管理员用户权限（`ADMIN` 或 `DEFAULT_ADMIN`）
- 卸载需要 `APPLICATION_UNINSTALL` 权限和管理员权限

## 与 LStorage 的交互

ZOMInstall 与 LStorage 的交互流程：

1. **ZOMInstall** 解压 ZOM 文件到临时目录
2. **ZOMInstall** 读取 `application.json` 并构建 `asset` 对象
3. **ZOMInstall** 检查安装冲突（重复安装、更新安装、名称冲突）
4. **ZOMInstall** 收集所有文件（排除 `application.json` 和 `setup.js`）到 `sourceFiles` 对象
5. **ZOMInstall** 调用 `LStorage.installApplication(programName, asset, sourceFiles)`
6. **LStorage** 验证权限（需要管理员权限和 `APPLICATION_INSTALL` 权限）
7. **LStorage** 复制文件到 `D:/application/<程序名>/` 目录
8. **LStorage** 更新 `asset` 中的路径为绝对路径
9. **LStorage** 注册程序到 `ApplicationTable`
10. **LStorage** 自动刷新 `ApplicationAssetManager`（使新程序立即可用）
11. **ZOMInstall** 执行 `setup.js`（如果存在，作为 ZerOS 程序启动）
12. **ZOMInstall** 清理临时文件

**重要**：安装完成后，`ApplicationAssetManager` 会自动刷新，新安装的程序会立即出现在开始菜单中（需要关闭并重新打开开始菜单才能看到）。

## 错误处理

### 常见错误

1. **文件格式错误**：`.zom` 文件必须是有效的 ZIP 格式
2. **缺少 application.json**：ZOM 文件必须包含 `application.json`
3. **application.json 格式错误**：JSON 格式不正确或缺少必需字段
4. **权限不足**：需要管理员权限和 `APPLICATION_INSTALL` 权限
5. **文件复制失败**：磁盘空间不足或文件系统错误
6. **setup.js 执行失败**：安装脚本执行出错

### 错误恢复

如果安装过程中发生错误：
- 已复制的文件会被保留（需要手动清理）
- 临时文件会被自动清理
- 程序不会被注册到 `ApplicationTable`

## 最佳实践

1. **文件组织**：
   - 将相关文件组织到子目录中（如 `assets/`, `styles/`）
   - 保持目录结构清晰
   - 避免在根目录放置过多文件

2. **路径配置**：
   - 使用相对路径（相对于 ZOM 根目录）
   - 路径使用正斜杠 `/` 作为分隔符
   - 避免使用绝对路径

3. **资源文件**：
   - 大文件考虑压缩或使用外部资源
   - 图片使用 SVG 格式（矢量图）或优化的 PNG/WebP
   - 字体文件使用 WOFF2 格式

4. **安装脚本**：
   - `setup.js` 应该尽可能简单
   - 避免在 `setup.js` 中执行耗时操作
   - 提供清晰的错误信息

5. **版本管理**：
   - 在 `application.json` 中正确设置版本号
   - 考虑使用语义化版本（Semantic Versioning）

## 技术细节

### 文件路径处理

- **相对路径**：ZOM 文件中的所有路径都是相对于解压后的根目录
- **路径转换**：安装时，相对路径会自动转换为绝对路径
  - `"myapp.js"` → `"D:/application/myapp/myapp.js"`
  - `"assets/icon.svg"` → `"D:/application/myapp/assets/icon.svg"`

### 文件排除规则

以下文件**不会被复制**到 `D:/application/` 目录：
- `application.json`（仅用于安装时读取配置）
- `setup.js`（仅在临时目录中执行，安装时使用）

**注意**：
- `uninstall.js` **会被复制**到程序目录，因为卸载时需要从程序目录读取并执行它
- 如果这些文件在子目录中（如 `config/application.json`），它们**会被复制**。只有根目录下的 `application.json` 和 `setup.js` 会被排除

### 与静态程序的兼容性

- 静态程序（注册在 `applicationAssets.js` 中）不会被 ZOMInstall 影响
- 如果动态安装的程序与静态程序同名，动态程序会覆盖静态程序（在 `ApplicationAssetManager` 中，动态程序优先）
- 卸载时，静态程序不允许被卸载

## 相关 API

- `LStorage.installApplication()` - 安装应用程序
- `LStorage.uninstallApplication()` - 卸载应用程序
- `LStorage.getInstalledApplication()` - 获取已安装的程序信息
- `LStorage.isApplicationInstalled()` - 检查程序是否已安装
- `LStorage.listInstalledApplications()` - 列出所有动态安装的程序
- `ApplicationAssetManager` - 应用程序资源管理器（合并静态和动态程序）

## 版本历史

- **v1.0.0** (2025-01-07): 初始版本
  - 支持 ZOM 文件解压和安装
  - 支持 `application.json` 配置
  - 支持 `setup.js` 安装脚本（作为普通脚本执行）
  - 自动文件复制和注册
  - 临时文件自动清理

- **v1.1.0** (2025-01-07): 增强版本
  - `setup.js` 现在作为标准的 ZerOS GUI 程序执行
  - 支持安装冲突检查（重复安装、更新安装、名称冲突）
  - 自动刷新 `ApplicationAssetManager`（安装/卸载后）
  - 改进的错误处理和用户提示

