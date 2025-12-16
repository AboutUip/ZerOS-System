# ProcessManager API 文档

## 概述

`ProcessManager` 是 ZerOS 内核的进程管理器，负责程序的启动、运行、终止和资源管理。提供完整的进程生命周期管理，包括 PID 分配、内存分配、DOM 元素跟踪、程序资源管理等。

## 依赖

- `MemoryManager` - 内存管理器（用于内存分配）
- `ApplicationAssetManager` - 应用程序资源管理器（用于获取程序资源）
- `PermissionManager` - 权限管理器（用于权限检查和验证）
- `GUIManager` - GUI 管理器（用于窗口管理）
- `NotificationManager` - 通知管理器（用于清理通知）
- `ContextMenuManager` - 上下文菜单管理器（用于清理上下文菜单）
- `DesktopManager` - 桌面管理器（用于清理桌面组件）
- `TaskbarManager` - 任务栏管理器（用于更新任务栏）
- `KernelMemory` - 内核内存（用于存储进程表）

## 常量

```javascript
ProcessManager.EXPLOIT_PID = 10000;  // Exploit 程序固定 PID
```

## API 方法

### 程序启动

#### `startProgram(programName, initArgs)`

启动程序。

**参数**:
- `programName` (string): 程序名称（小写，如 `"vim"`）
- `initArgs` (Object): 初始化参数（可选）
  - `args` (Array): 命令行参数（如文件名）
  - `env` (Object): 环境变量
  - `cwd` (string): 当前工作目录（如 `"C:"`）
  - `terminal` (Object): 终端实例（CLI 程序，可选）
  - `metadata` (Object): 元数据
  - `autoStart` (boolean): 是否自动启动（内部使用）
  - `forCLI` (boolean): 是否为 CLI 程序专用终端（内部使用）
  - `cliProgramName` (string): 关联的 CLI 程序名称（内部使用）
  - `cliProgramPid` (number): 关联的 CLI 程序 PID（内部使用）
  - `disableTabs` (boolean): 禁用标签页功能（内部使用）

**返回值**: `Promise<number>` - 进程 ID

**示例**:
```javascript
// 启动 GUI 程序
const pid = await ProcessManager.startProgram('filemanager', {
    args: [],
    env: {},
    cwd: 'C:'
});

// 启动 CLI 程序（从终端内）
const pid = await ProcessManager.startProgram('vim', {
    args: ['file.txt'],
    env: {},
    cwd: 'C:/Users',
    terminal: terminalInstance
});
```

**程序启动流程**:
1. 分配 PID
2. 从 ApplicationAssetManager 获取程序资源
3. 加载样式表
4. 加载资源文件
5. 加载程序脚本
6. 等待程序对象出现
7. 检查程序类型（CLI/GUI）
8. 如果是 CLI 程序且没有终端，自动启动终端
9. 调用程序的 `__init__` 方法
10. 标记程序创建的 DOM 元素
11. 更新进程状态为 `running`

### 程序终止

#### `killProgram(pid, force)`

终止程序。

**参数**:
- `pid` (number): 进程 ID
- `force` (boolean): 是否强制终止（默认 `false`）

**返回值**: `Promise<boolean>` - 是否成功终止

**示例**:
```javascript
// 正常终止
await ProcessManager.killProgram(pid);

// 强制终止
await ProcessManager.killProgram(pid, true);
```

**程序终止流程**:
1. 调用程序的 `__exit__` 方法
2. 如果是 CLI 程序，关闭关联的终端
3. 清理 GUI 元素
4. 清理上下文菜单
5. 清理桌面组件
6. 清理通知（仅依赖类型）
7. 释放内存
8. 清理 DOM 元素
9. 停止 DOM 观察器
10. 更新进程状态为 `exited`
11. 更新任务栏

### 内存管理

#### `allocateMemory(pid, heapSize, shedSize, refId)`

为程序分配内存。

**参数**:
- `pid` (number): 进程 ID
- `heapSize` (number): 堆内存大小（字节，-1 表示使用默认值）
- `shedSize` (number): 栈内存大小（字节，-1 表示使用默认值）
- `refId` (string): 内存引用 ID（可选）

**返回值**: `Promise<Object>` - 内存引用对象
```javascript
{
    refId: string,
    heap: Heap,
    heapId: number,
    shed: Shed,
    shedId: number
}
```

**示例**:
```javascript
const memoryRef = await ProcessManager.allocateMemory(this.pid, 1024, 512, 'myData');
// 使用内存
memoryRef.heap.writeData(addr, 'Hello');
```

#### `freeMemoryRef(pid, refId)`

释放内存引用。

**参数**:
- `pid` (number): 进程 ID
- `refId` (string): 内存引用 ID

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
ProcessManager.freeMemoryRef(this.pid, 'myData');
```

### 进程查询

#### `getProcessInfo(pid)`

获取进程信息。

**参数**:
- `pid` (number|null): 进程 ID，如果为 `null` 则返回所有进程信息

**返回值**: `Object|Array<Object>|null` - 进程信息对象或数组

**进程信息对象结构**:
```javascript
{
    pid: number,
    programName: string,
    programNameUpper: string,
    scriptPath: string,
    styles: Array<string>,
    assets: Array<string>,
    metadata: Object,
    status: 'loading' | 'running' | 'exiting' | 'exited',
    startTime: number,
    exitTime: number | null,
    memoryInfo: Object,  // 内存信息（如果 pid 不为 null）
    isCLI: boolean,
    terminalPid: number | null,
    launchedFromTerminal: boolean,
    isCLITerminal: boolean,
    isMinimized: boolean,
    windowState: Object | null
}
```

**示例**:
```javascript
// 获取单个进程信息
const info = ProcessManager.getProcessInfo(pid);

// 获取所有进程信息
const allProcesses = ProcessManager.getProcessInfo();
```

#### `hasProcess(pid)`

检查进程是否存在。

**参数**:
- `pid` (number): 进程 ID

**返回值**: `boolean` - 是否存在

#### `getRunningProcesses()`

获取所有运行中的进程。

**返回值**: `Array<Object>` - 运行中的进程信息数组

#### `listProcesses()`

列出所有进程（包含内存信息）。

**返回值**: `Array<Object>` - 进程信息数组

### 程序行为记录

#### `getProgramActions(pid, limit)`

获取程序行为记录。

**参数**:
- `pid` (number): 进程 ID
- `limit` (number|null): 限制返回数量（可选）

**返回值**: `Array<Object>` - 行为记录数组

**行为记录对象结构**:
```javascript
{
    action: string,      // 行为名称
    timestamp: number,  // 时间戳
    details: Object     // 详细信息
}
```

### 主题和样式管理

#### `getCurrentTheme(pid)`

获取当前主题。

**参数**:
- `pid` (number|null): 进程 ID（可选，用于权限检查）

**返回值**: `Object|null` - 当前主题配置

#### `getCurrentThemeId(pid)`

获取当前主题 ID。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `string` - 当前主题 ID

#### `getAllThemes(pid)`

获取所有主题列表。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Array<Object>` - 主题列表

#### `getTheme(themeId, pid)`

获取指定主题。

**参数**:
- `themeId` (string): 主题 ID
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Object|null` - 主题配置

#### `onThemeChange(listener, pid)`

监听主题变更。

**参数**:
- `listener` (Function): 回调函数 `(themeId, theme) => {}`
- `pid` (number|null): 进程 ID（可选）

#### `getCurrentStyleId(pid)`

获取当前样式 ID。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `string` - 当前样式 ID

#### `getCurrentStyle(pid)`

获取当前样式。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Object|null` - 当前样式配置

#### `getAllStyles(pid)`

获取所有样式列表。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Array<Object>` - 样式列表

#### `getStyle(styleId, pid)`

获取指定样式。

**参数**:
- `styleId` (string): 样式 ID
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Object|null` - 样式配置

#### `onStyleChange(listener, pid)`

监听样式变更。

**参数**:
- `listener` (Function): 回调函数 `(styleId, style) => {}`
- `pid` (number|null): 进程 ID（可选）

### 桌面背景管理

#### `getCurrentDesktopBackground(pid)`

获取当前桌面背景。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Object|null` - 桌面背景配置

#### `getAllDesktopBackgrounds(pid)`

获取所有桌面背景列表。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Array<Object>` - 桌面背景列表

#### `getDesktopBackground(backgroundId, pid)`

获取指定桌面背景。

**参数**:
- `backgroundId` (string): 背景 ID
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Object|null` - 桌面背景配置

### 网络管理

#### `getNetworkState(pid)`

获取网络状态。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Promise<Object>` - 网络状态对象

#### `isNetworkOnline(pid)`

检查网络是否在线。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Promise<boolean>` - 是否在线

#### `getNetworkConnectionInfo(pid)`

获取网络连接信息。

**参数**:
- `pid` (number|null): 进程 ID（可选）

**返回值**: `Promise<Object>` - 网络连接信息对象

### 内核 API 调用

#### `callKernelAPI(pid, apiName, args)`

调用内核 API。所有内核 API 调用都会自动进行权限检查。

**参数**:
- `pid` (number): 进程 ID
- `apiName` (string): API 名称（如 `'FileSystem.read'`, `'Notification.create'`）
- `args` (Array): 参数数组

**返回值**: `Promise<any>` - API 调用结果

**权限检查**:
- 所有内核 API 调用都会自动检查程序是否有相应权限
- 如果程序没有权限，API 调用会被拒绝并抛出错误
- 权限检查是强制性的，不能绕过
- Exploit 程序（PID 10000）享有直接通信权限，无需权限检查

**可用 API**:
- `FileSystem.read` - 读取文件（需要 `KERNEL_DISK_READ` 权限）
- `FileSystem.write` - 写入文件（需要 `KERNEL_DISK_WRITE` 权限）
- `FileSystem.delete` - 删除文件（需要 `KERNEL_DISK_DELETE` 权限）
- `FileSystem.create` - 创建文件/目录（需要 `KERNEL_DISK_CREATE` 权限）
- `FileSystem.list` - 列出目录（需要 `KERNEL_DISK_LIST` 权限）
- `Notification.create` - 创建通知（需要 `SYSTEM_NOTIFICATION` 权限）
- `Notification.remove` - 移除通知（需要 `SYSTEM_NOTIFICATION` 权限）
- `Network.request` - 网络请求（需要 `NETWORK_ACCESS` 权限）
- `Network.fetch` - 网络获取（需要 `NETWORK_ACCESS` 权限）
- `GUI.createWindow` - 创建窗口（需要 `GUI_WINDOW_CREATE` 权限）
- `GUI.manageWindow` - 管理窗口（需要 `GUI_WINDOW_MANAGE` 权限）
- `Storage.read` - 读取系统存储（需要 `SYSTEM_STORAGE_READ` 权限）
- `Storage.write` - 写入系统存储（需要 `SYSTEM_STORAGE_WRITE` 权限）
- `Theme.read` - 读取主题（需要 `THEME_READ` 权限）
- `Theme.write` - 修改主题（需要 `THEME_WRITE` 权限）
- `Desktop.manage` - 管理桌面（需要 `DESKTOP_MANAGE` 权限）
- `Process.manage` - 管理进程（需要 `PROCESS_MANAGE` 权限）
- `Drag.createSession` - 创建拖拽会话（需要 `DRAG_ELEMENT` 权限）
- `Drag.enable` - 启用拖拽（需要 `DRAG_ELEMENT` 权限）
- `Drag.disable` - 禁用拖拽（需要 `DRAG_ELEMENT` 权限）
- `Drag.destroySession` - 销毁拖拽会话（需要 `DRAG_ELEMENT` 权限）
- `Drag.getSession` - 获取拖拽会话（需要 `DRAG_ELEMENT` 权限）
- `Drag.registerDropZone` - 注册放置区域（需要 `DRAG_ELEMENT` 权限）
- `Drag.unregisterDropZone` - 注销放置区域（需要 `DRAG_ELEMENT` 权限）
- `Drag.createFileDrag` - 创建文件拖拽（需要 `DRAG_FILE` 权限）
- `Drag.createWindowDrag` - 创建窗口拖拽（需要 `DRAG_WINDOW` 权限）
- `Drag.getProcessDrags` - 获取进程拖拽会话（需要 `DRAG_ELEMENT` 权限）
- `Geography.getCurrentPosition` - 获取当前位置（需要 `GEOGRAPHY_LOCATION` 权限）
- `Geography.clearCache` - 清除位置缓存（需要 `GEOGRAPHY_LOCATION` 权限）
- `Geography.isSupported` - 检查是否支持地理位置（需要 `GEOGRAPHY_LOCATION` 权限）
- `Geography.getCachedLocation` - 获取缓存的位置（需要 `GEOGRAPHY_LOCATION` 权限）
- `Crypt.generateKeyPair` - 生成密钥对（需要 `CRYPT_GENERATE_KEY` 权限）
- `Crypt.importKeyPair` - 导入密钥对（需要 `CRYPT_IMPORT_KEY` 权限）
- `Crypt.getKeyInfo` - 获取密钥信息（无需权限）
- `Crypt.listKeys` - 列出所有密钥（无需权限）
- `Crypt.deleteKey` - 删除密钥（需要 `CRYPT_DELETE_KEY` 权限）
- `Crypt.setDefaultKey` - 设置默认密钥（需要 `CRYPT_DELETE_KEY` 权限）
- `Crypt.encrypt` - 加密数据（需要 `CRYPT_ENCRYPT` 权限）
- `Crypt.decrypt` - 解密数据（需要 `CRYPT_DECRYPT` 权限）
- `Crypt.md5` - MD5 哈希（需要 `CRYPT_MD5` 权限）
- `Crypt.randomInt` - 生成随机整数（需要 `CRYPT_RANDOM` 权限）
- `Crypt.randomFloat` - 生成随机浮点数（需要 `CRYPT_RANDOM` 权限）
- `Crypt.randomBoolean` - 生成随机布尔值（需要 `CRYPT_RANDOM` 权限）
- `Crypt.randomString` - 生成随机字符串（需要 `CRYPT_RANDOM` 权限）
- `Crypt.randomChoice` - 从数组随机选择（需要 `CRYPT_RANDOM` 权限）
- `Crypt.shuffle` - 打乱数组（需要 `CRYPT_RANDOM` 权限）

**示例**:
```javascript
// 读取文件（自动权限检查）
try {
    const content = await ProcessManager.callKernelAPI(
        this.pid,
        'FileSystem.read',
        ['D:/myfile.txt']
    );
    console.log('文件内容:', content);
} catch (e) {
    if (e.message.includes('没有权限')) {
        console.error('权限被拒绝:', e.message);
    } else {
        console.error('读取文件失败:', e.message);
    }
}

// 创建通知（自动权限检查）
try {
    await ProcessManager.callKernelAPI(
        this.pid,
        'Notification.create',
        [{
            type: 'snapshot',
            title: '通知标题',
            content: '通知内容'
        }]
    );
} catch (e) {
    console.error('创建通知失败:', e.message);
}
```

**注意事项**:
- 程序必须在 `__info__` 中声明所需权限
- 普通权限会自动授予，特殊权限需要用户确认
- 权限被拒绝时，API 调用会立即抛出错误
- 详细权限列表请参考 [PermissionManager API 文档](./PermissionManager.md)

### 其他方法

#### `getProgramInfo(programName)`

获取程序信息（从 ApplicationAssetManager）。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Object|null` - 程序信息对象

#### `getAssetManager()`

获取应用程序资源管理器。

**返回值**: `ApplicationAssetManager|null` - 资源管理器实例

#### `getSharedSpace()`

获取共享空间。

**返回值**: `Object` - 共享空间对象

#### `getProgramGUIElements(pid)`

获取程序创建的 GUI 元素。

**参数**:
- `pid` (number): 进程 ID

**返回值**: `Array<HTMLElement>` - DOM 元素数组

#### `getRequestedModules(pid)`

获取程序请求的动态模块。

**参数**:
- `pid` (number): 进程 ID

**返回值**: `Set<string>` - 模块名称集合

#### `isExploitProcess(pid)`

检查是否为 Exploit 进程。

**参数**:
- `pid` (number): 进程 ID

**返回值**: `boolean` - 是否为 Exploit 进程

#### `setLogLevel(level)`

设置日志级别。

**参数**:
- `level` (number): 日志级别（0-3）

## 使用示例

### 示例 1: 启动 GUI 程序

```javascript
const pid = await ProcessManager.startProgram('filemanager', {
    args: [],
    env: { USER: 'admin' },
    cwd: 'C:/Users'
});

console.log(`程序已启动，PID: ${pid}`);
```

### 示例 2: 启动 CLI 程序

```javascript
// 从终端内启动
const pid = await ProcessManager.startProgram('vim', {
    args: ['file.txt'],
    terminal: terminalInstance,
    cwd: 'C:/Users'
});

// 从 GUI 启动（会自动创建终端）
const pid = await ProcessManager.startProgram('vim', {
    args: ['file.txt'],
    cwd: 'C:/Users'
});
```

### 示例 3: 分配和使用内存

```javascript
// 分配内存
const memoryRef = await ProcessManager.allocateMemory(this.pid, 1024, 512, 'myData');

// 使用堆内存
const addr = memoryRef.heap.allocate(100, 'myKey');
memoryRef.heap.writeData(addr, 'Hello World');
const data = memoryRef.heap.readString(addr, 11);

// 释放内存引用
ProcessManager.freeMemoryRef(this.pid, 'myData');
```

### 示例 4: 查询进程信息

```javascript
// 获取所有进程
const processes = ProcessManager.listProcesses();
processes.forEach(proc => {
    console.log(`PID: ${proc.pid}, 程序: ${proc.programName}, 状态: ${proc.status}`);
});

// 获取单个进程信息
const info = ProcessManager.getProcessInfo(pid);
if (info) {
    console.log(`程序: ${info.programName}`);
    console.log(`内存: ${JSON.stringify(info.memoryInfo)}`);
}
```

### 示例 5: 监听主题变更

```javascript
ProcessManager.onThemeChange((themeId, theme) => {
    console.log(`主题已切换为: ${themeId}`);
    // 更新程序 UI
    updateUI(theme);
}, this.pid);
```

## 进程状态

进程有以下状态：

- `loading`: 正在加载（脚本加载中）
- `running`: 运行中
- `exiting`: 正在退出（调用 `__exit__` 中）
- `exited`: 已退出

## CLI 程序自动启动终端

当 CLI 程序从 GUI 启动时（没有提供 `terminal` 参数），ProcessManager 会自动：

1. 创建独立的终端程序实例
2. 禁用标签页功能
3. 关联 CLI 程序和终端
4. 终端退出时自动关闭关联的 CLI 程序

## DOM 元素跟踪

ProcessManager 会自动跟踪程序创建的 DOM 元素：

- 通过 `data-pid` 属性标记元素
- 使用 MutationObserver 监控 DOM 变化
- 程序退出时自动清理所有标记的元素

## 注意事项

1. **PID 分配**: PID 从 1 开始自动递增，但会跳过 Exploit 程序的 PID (10000)
2. **程序对象**: 程序必须导出为全局对象，命名规则为程序名全大写
3. **必需方法**: 程序必须实现 `__init__` 和 `__exit__` 方法
4. **内存管理**: 程序退出时会自动释放所有内存，但建议在 `__exit__` 中手动释放内存引用
5. **DOM 清理**: 程序退出时会自动清理所有标记的 DOM 元素
6. **CLI 终端**: CLI 程序从 GUI 启动时会自动创建终端，无需手动处理

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [MemoryManager.md](./MemoryManager.md) - 内存管理器 API
- [ApplicationAssetManager.md](./ApplicationAssetManager.md) - 应用程序资源管理器 API

