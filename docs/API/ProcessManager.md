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

## 获取实例

ProcessManager 注册在 POOL 中，可以通过以下方式获取：

```javascript
// 从 POOL 获取
const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
```

**注意**：
- 在内核初始化完成后，ProcessManager 已加载，可以直接使用
- 进程内部可以通过 `this.pid` 获取当前进程 PID
- 使用 `initArgs.kernelAPI` 可以安全调用内核 API，无需手动传 PID

## 依赖

- `TaskbarManager` - 任务栏管理器（用于更新任务栏）
- `KernelMemory` - 内核内存（用于存储进程表）

## 常量

```javascript
ProcessManager.EXPLOIT_PID = 10000;        // Exploit 程序固定 PID
ProcessManager.SERVER_SERVICE_PID = 10000; // D/server 目录下服务调用内核 API 时使用的 PID
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
  - `scheduledTask` (boolean): 是否由计划任务启动（内部使用，计划任务启动时传递此标志）
  - `taskId` (string): 计划任务ID（内部使用，计划任务启动时传递）
  - `forCLI` (boolean): 是否为 CLI 程序专用终端（内部使用）
  - `cliProgramName` (string): 关联的 CLI 程序名称（内部使用）
  - `cliProgramPid` (number): 关联的 CLI 程序 PID（内部使用）
  - `disableTabs` (boolean): 禁用标签页功能（内部使用）
  - `runInBackground` (boolean): 是否以后台进程方式启动；为 `true` 时进程信息中 `isBackground` 为 `true`，可供任务管理器等区分展示

**说明**：内核在调用 `__init__(pid, initArgs)` 时会在 `initArgs` 中注入 `kernelAPI`（见下方「进程绑定 API」），程序可保存为 `this.kernelAPI` 后使用 `this.kernelAPI.call(apiName, args)` 调用内核 API，无需传 pid，可防 PID 伪造（CVS_ZEROS_009 方案三）。

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
2. 从 ApplicationAssetManager 获取程序资源（或使用 `tempAsset`）
3. 加载样式表
4. 加载资源文件
5. 加载程序脚本（如果 `tempAsset.script` 是文件内容，直接执行；如果是路径，从路径加载）
6. 等待程序对象出现
7. 检查程序类型（CLI/GUI）
8. 如果是 CLI 程序且没有终端，自动启动终端
9. 调用程序的 `__init__` 方法
10. 标记程序创建的 DOM 元素
11. 更新进程状态为 `running`

**临时程序资产（tempAsset）**:
- 当使用 `tempAsset` 参数时，`ProcessManager` 会使用临时程序配置而不是从 `ApplicationAssetManager` 查找
- `tempAsset` 对象包含：
  - `script` (string): 程序脚本内容（文件内容）或路径
  - `styles` (Array): 样式表路径列表（可选）
  - `icon` (string|null): 图标路径（可选，为 `null` 时使用默认图标）
  - `metadata` (Object): 程序元数据
    - `name` (string): 程序名称
    - `type` (string): 程序类型（'CLI' 或 'GUI'）
    - `allowMultipleInstances` (boolean): 是否允许多实例
- 如果 `script` 是文件内容（包含换行符或长度超过 500 字符），会直接执行；如果是路径，会从路径加载

**autoStart 程序权限限制**:
- 如果程序设置了 `autoStart=true`，普通用户无法手动启动该程序
- 只有管理员用户可以手动启动 `autoStart=true` 的程序
- 系统启动时，只有管理员才会自动启动 `autoStart=true` 的程序
- 计划任务可以启动 `autoStart=true` 的程序（通过传递 `scheduledTask: true` 标志绕过权限检查）

**计划任务兼容性**:
- 计划任务启动程序时，会传递 `scheduledTask: true` 和 `taskId` 参数
- 计划任务启动的程序可以绕过 `autoStart` 权限检查
- 计划任务可以启动任何程序，包括设置了 `autoStart=true` 的程序

### 程序终止

#### `killProgram(pid, force)`

终止程序。**前台与后台进程均会被强制终止**，不做区分。kill 命令、任务管理器的「关闭程序」/「强制退出」均走此逻辑。

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
3. 清理 GUI 元素（后台进程同样按此流程清理）

### 后台进程

#### `getBackgroundProcesses()`

获取所有运行中的后台进程（`status === 'running'` 且 `isBackground === true`）。

**返回值**: `Array<Object>` - 后台进程信息数组（与 `getRunningProcesses()` 元素结构一致，每项含 `isBackground: true`）

**示例**:
```javascript
const background = ProcessManager.getBackgroundProcesses();
```

**说明**：进程信息中的 `isBackground` 由 `startProgram(..., { runInBackground: true })` 设置；旧数据或未传该参数时默认为 `false`，兼容已有行为。

#### 前端转后台 / 后台转前台

##### `setProcessBackground(pid, isBackground)`

设置指定进程的前台/后台状态（供内核 API 或直接调用）。

**参数**:
- `pid` (number): 进程 ID
- `isBackground` (boolean): 是否为后台（`true` = 后台，`false` = 前台）

**返回值**: `boolean` - 是否设置成功（进程不存在或非 `running` 时返回 `false`）

**示例**:
```javascript
ProcessManager.setProcessBackground(pid, true);   // 转为后台
ProcessManager.setProcessBackground(pid, false);  // 转为前台
```

##### 内核 API：`Process.requestBackground` / `Process.requestForeground`

程序通过 `kernelAPI.call` 将**自身**由前台转为后台或由后台转为前台（不清理进程资源，仅改变前后台状态）。

| API | 参数 | 权限 | 说明 |
|-----|------|------|------|
| `Process.requestBackground` | 无 | **`PROCESS_BACKGROUND`（普通权限）** | 当前进程申请由前台转为后台（从任务栏、多任务选择器中隐藏，仍在运行） |
| `Process.requestForeground` | 无 | 不需权限 | 当前进程转为前台（重新在任务栏、多任务选择器中显示） |

**示例**（在程序内部）:
```javascript
// 申请由前台转后台（如“最小化到后台”），需 PROCESS_BACKGROUND 权限
await this.kernelAPI.call('Process.requestBackground', []);

// 后台转前台（不需权限）
await this.kernelAPI.call('Process.requestForeground', []);
```

##### 内核 API：后台进程托盘事件回调（`Process.registerBackgroundTrayClick` / `Process.registerBackgroundTrayContextMenu`）

系统托盘（后台进程容器）中每个后台进程项支持**单击**与**右键**事件，程序可为自身注册回调（需 `PROCESS_BACKGROUND` 普通权限）。

| API | 参数 | 权限 | 说明 |
|-----|------|------|------|
| `Process.registerBackgroundTrayClick` | `callback`（无参函数） | **`PROCESS_BACKGROUND`** | 注册单击回调：用户单击该进程项时调用；未注册时默认行为为「转为前台」并关闭面板 |
| `Process.registerBackgroundTrayContextMenu` | `getItems`（函数，返回 `Array<{ label: string, onClick: function }>`） | **`PROCESS_BACKGROUND`** | 注册右键菜单项提供者：用户右键该进程项时展示菜单，先显示程序返回的菜单项，系统**自动追加「退出程序」项**（结束进程） |

**说明**：
- 右击后台进程图标**始终**会弹出右键菜单；菜单中**必须**包含系统自动添加的「退出程序」项，程序可通过 `getItems` 在该菜单中增加自定义项（如「打开」「设置」等）。
- 程序可在转为后台前或转为后台后通过 `kernelAPI.call('Process.registerBackgroundTrayClick', [callback])` 和 `kernelAPI.call('Process.registerBackgroundTrayContextMenu', [getItems])` 注册回调；仅对**当前进程**生效（由内核按调用者 PID 绑定），进程退出时自动清理。

**示例**（在程序内部，转为后台前或转为后台后调用）:
```javascript
// 注册单击：点击托盘项时执行自定义逻辑（如打开主窗口）
await this.kernelAPI.call('Process.registerBackgroundTrayClick', [() => {
    this.showMainWindow(); // 程序内部方法
}]);

// 注册右键菜单：增加「打开」「设置」等项，系统会自动追加「退出程序」
await this.kernelAPI.call('Process.registerBackgroundTrayContextMenu', [() => [
    { label: '打开', onClick: () => this.showMainWindow() },
    { label: '设置', onClick: () => this.openSettings() }
]]);
```

### 进程管理内核 API（供任务管理器等调用）

以下 API 通过 `kernelAPI.call(apiName, args)` 调用，**均需 `PROCESS_MANAGE` 权限**（危险权限，仅管理员可授予），除下表注明“不需权限”的 API 外：

| API | 参数 | 说明 |
|-----|------|------|
| `Process.getRunningProcesses` | 无 | 返回所有运行中进程（含 `isBackground` 等字段） |
| `Process.getBackgroundProcesses` | 无 | 返回所有运行中的后台进程 |
| `Process.getProcessInfo` | `targetPid`（可选，数字或省略） | 省略时返回所有进程信息；传 PID 时返回该进程信息（含 `memoryInfo`） |
| `Process.manage` | `targetPid`, `force`（可选，默认 false） | 终止指定进程，等同 `ProcessManager.killProgram(targetPid, force)`；**前台与后台进程均会被强制终止** |
| `Process.requestBackground` | 无 | 当前进程转为后台（需 **`PROCESS_BACKGROUND` 普通权限**，仅自身） |
| `Process.requestForeground` | 无 | 当前进程转为前台（不需权限，仅自身） |
| `Process.registerBackgroundTrayClick` | `callback` | 注册后台托盘单击回调（需 **`PROCESS_BACKGROUND`**，仅自身） |
| `Process.registerBackgroundTrayContextMenu` | `getItems` | 注册后台托盘右键菜单项（需 **`PROCESS_BACKGROUND`**，仅自身；系统自动追加「退出程序」） |

**示例**（在已获得 PROCESS_MANAGE 权限的程序中）:
```javascript
const running = await this.kernelAPI.call('Process.getRunningProcesses', []);
const background = await this.kernelAPI.call('Process.getBackgroundProcesses', []);
const info = await this.kernelAPI.call('Process.getProcessInfo', [pid]);
await this.kernelAPI.call('Process.manage', [targetPid, true]);
```

`Process.manage` 的终止流程与上方 `killProgram` 一致。

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
    isBackground: boolean,  // 是否为后台进程（前台转后台后为 true，供任务管理器等区分）
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

#### 进程绑定 API（`initArgs.kernelAPI`）

内核在程序 `__init__(pid, initArgs)` 时注入 `initArgs.kernelAPI`，提供**进程绑定**的内核 API 调用方式，无需传入 pid，由闭包绑定本进程 pid，可防止 PID 伪造（CVS_ZEROS_009 方案三）。推荐敏感或多实例程序使用。

**用法**:
- `initArgs.kernelAPI.call(apiName, args)` — 使用本进程 pid 调用内核 API，`args` 为参数数组（可选，默认 `[]`）

**示例**:
```javascript
async __init__(pid, initArgs) {
    this.pid = pid;
    this.kernelAPI = initArgs.kernelAPI;  // 保存绑定 API
    // 使用绑定 API 调用（无需传 pid）
    const content = await this.kernelAPI.call('FileSystem.read', ['D:/myfile.txt']);
}
```

**与 `callKernelAPI(pid, apiName, args)` 的关系**：两者都会做权限检查与执行；绑定 API 跳过「调用栈 vs pid」校验，仅能通过内核注入的令牌调用，不可伪造。现有 `callKernelAPI(this.pid, ...)` 用法仍可使用，无需强制迁移。

**自终止与 VM/CLI 程序**：在 VM 或沙箱中运行的程序（如从终端启动的 bin 下 CLI 程序 ps、netport、vim 等）调用 `callKernelAPI(this.pid, 'Process.requestSelfTermination', [])` 时，内核会根据调用栈校验调用者 PID；VM 栈无法匹配 `bin/xxx.js` 等路径，会导致「API调用拒绝(PID校验)」。此类程序应优先使用 `initArgs.kernelAPI.call('Process.requestSelfTermination', [])` 进行自终止，绑定 API 会跳过调用栈校验。

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

**安全说明（CVS-ZEROS-009 已修复）**:
- 传入的 `pid` 会与调用栈解析出的调用者身份校验一致，否则拒绝（防止 PID 欺骗）
- 应用层禁止使用 Exploit 进程 PID (10000) 调用内核 API（调用栈含 application 等应用目录时拒绝）
- 推荐使用进程绑定 API `initArgs.kernelAPI.call(apiName, args)` 以绑定本进程，无需传 pid

**可用 API**:
- `FileSystem.read` - 读取文件（需要 `KERNEL_DISK_READ` 权限）
- `FileSystem.write` - 写入文件（需要 `KERNEL_DISK_WRITE` 权限）
- `FileSystem.delete` - 删除文件（需要 `KERNEL_DISK_DELETE` 权限）
- `FileSystem.create` - 创建文件/目录（需要 `KERNEL_DISK_CREATE` 权限）
- `FileSystem.list` - 列出目录（需要 `KERNEL_DISK_LIST` 权限）
- `Notification.create` - 创建通知（需要 `SYSTEM_NOTIFICATION` 权限）
- `Notification.remove` - 移除通知（需要 `SYSTEM_NOTIFICATION` 权限）
- `Network.request` - 网络请求（需要 `NETWORK_ACCESS` 权限，普通权限，自动授予）
- `Network.fetch` - 网络获取（需要 `NETWORK_ACCESS` 权限，普通权限，自动授予）
- `Network.Port.register` - 注册 TCP 端口监听（需要 `NETWORK_ACCESS` 权限，普通权限，自动授予）
- `Network.Port.unregister` - 取消 TCP 端口监听（需要 `NETWORK_ACCESS` 权限，普通权限，自动授予）
- `Network.Port.getStatus` - 获取端口状态（需要 `NETWORK_ACCESS` 权限，普通权限，自动授予）
- `Network.Port.list` - 列出所有已注册的端口（需要 `NETWORK_ACCESS` 权限，普通权限，自动授予）
- `Network.Port.send` - 向端口发送数据（需要 `NETWORK_ACCESS` 权限，普通权限，自动授予）
- `GUI.createWindow` - 创建窗口（需要 `GUI_WINDOW_CREATE` 权限）
- `GUI.manageWindow` - 管理窗口（需要 `GUI_WINDOW_MANAGE` 权限）
- `Storage.read` - 读取系统存储（需要 `SYSTEM_STORAGE_READ` 权限）
- `Storage.write` - 写入系统存储（需要 `SYSTEM_STORAGE_WRITE` 权限）
- `Theme.read` - 读取主题（需要 `THEME_READ` 权限）
- `Theme.write` - 修改主题（需要 `THEME_WRITE` 权限）
- `Desktop.manage` - 管理桌面（需要 `DESKTOP_MANAGE` 权限）
- `Desktop.addShortcut` - 添加桌面快捷方式（需要 `DESKTOP_SHORTCUT` 权限，普通权限）
- `Desktop.addFileOrFolderIcon` - 添加文件/文件夹图标到桌面（需要 `DESKTOP_MANAGE` 权限）
- `Desktop.removeShortcut` - 移除桌面快捷方式（需要 `DESKTOP_SHORTCUT` 权限，普通权限）
- `Desktop.getIcons` - 获取桌面图标列表（无需权限）
- `Desktop.getConfig` - 获取桌面配置（无需权限）
- `Desktop.setArrangementMode` - 设置排列模式（需要 `DESKTOP_MANAGE` 权限）
- `Desktop.setIconSize` - 设置图标大小（需要 `DESKTOP_MANAGE` 权限）
- `Desktop.setAutoArrange` - 设置自动排列（需要 `DESKTOP_MANAGE` 权限）
- `Desktop.refresh` - 刷新桌面（需要 `DESKTOP_MANAGE` 权限）
- `Process.manage` - 管理进程（需要 `PROCESS_MANAGE` 权限）
- `Process.requestBackground` - 申请由前台转后台（需要 `PROCESS_BACKGROUND` 普通权限，仅自身）
- `Process.registerBackgroundTrayClick` - 注册后台托盘单击回调（需要 `PROCESS_BACKGROUND`，仅自身）
- `Process.registerBackgroundTrayContextMenu` - 注册后台托盘右键菜单项（需要 `PROCESS_BACKGROUND`，仅自身；系统自动追加「关闭」）
- `Process.requestSelfTermination` - 当前进程请求自终止（不需权限，仅自身；推荐使用 `kernelAPI.call` 避免 VM 中 PID 校验失败）
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
- `Geography.isSupported` - 检查是否支持地理位置（无需权限）
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
- `Cache.set` - 设置缓存（需要 `CACHE_WRITE` 权限）
- `Cache.get` - 获取缓存（需要 `CACHE_READ` 权限）
- `Cache.has` - 检查缓存是否存在（需要 `CACHE_READ` 权限）
- `Cache.delete` - 删除缓存（需要 `CACHE_WRITE` 权限）
- `Cache.clear` - 清空缓存（需要 `CACHE_WRITE` 权限）
- `Cache.getStats` - 获取缓存统计（需要 `CACHE_READ` 权限）
- `Taskbar.pinProgram` - 固定程序到任务栏（需要 `DESKTOP_MANAGE` 权限）
- `Taskbar.unpinProgram` - 从任务栏取消固定程序（需要 `DESKTOP_MANAGE` 权限）
- `Taskbar.getPinnedPrograms` - 获取固定程序列表（无需权限）
- `Taskbar.isPinned` - 检查程序是否固定（无需权限）
- `Taskbar.setPinnedPrograms` - 批量设置固定程序（需要 `DESKTOP_MANAGE` 权限）
- `Taskbar.addIcon` - 添加自定义图标到任务栏（需要 `DESKTOP_MANAGE` 权限）
- `Taskbar.removeIcon` - 移除任务栏自定义图标（需要 `DESKTOP_MANAGE` 权限，且只能删除自己创建的图标）
- `Taskbar.updateIcon` - 更新任务栏自定义图标（需要 `DESKTOP_MANAGE` 权限，且只能更新自己创建的图标）
- `Taskbar.getCustomIcons` - 获取所有自定义图标（无需权限）
- `Taskbar.getCustomIconsByPid` - 根据 PID 获取自定义图标（无需权限）
- `Speech.isSupported` - 检查是否支持语音识别（无需权限）
- `Speech.createSession` - 创建语音识别会话（需要 `SPEECH_RECOGNITION` 权限）
- `Speech.startRecognition` - 开始语音识别（需要 `SPEECH_RECOGNITION` 权限）
- `Speech.stopRecognition` - 停止语音识别（需要 `SPEECH_RECOGNITION` 权限）
- `Speech.stopSession` - 停止语音识别会话（需要 `SPEECH_RECOGNITION` 权限）
- `Speech.getSessionStatus` - 获取会话状态（需要 `SPEECH_RECOGNITION` 权限）
- `Speech.getSessionResults` - 获取识别结果（需要 `SPEECH_RECOGNITION` 权限）
- `ScheduleTask.create` - 创建计划任务（需要 `SCHEDULE_TASK_CREATE` 或 `SCHEDULE_TASK_STARTUP` 权限）
- `ScheduleTask.delete` - 删除计划任务（需要 `SCHEDULE_TASK_MANAGE` 权限）
- `ScheduleTask.update` - 更新计划任务（需要 `SCHEDULE_TASK_MANAGE` 权限）
- `ScheduleTask.get` - 获取计划任务信息（无需权限）
- `ScheduleTask.getAll` - 获取所有计划任务（无需权限）
- `ScheduleTask.setEnabled` - 启用/禁用计划任务（需要 `SCHEDULE_TASK_MANAGE` 权限）
- `Languages.loadPack` - 加载语言包（需要 `LANGUAGES_WRITE` 权限）
- `Languages.setCurrent` - 设置当前语言（需要 `LANGUAGES_WRITE` 权限）
- `Languages.getText` - 按常量名获取本地化文本（需要 `LANGUAGES_READ` 权限）
- `Languages.listPacks` - 列出语言包文件（需要 `LANGUAGES_READ` 权限）
- `Languages.getCurrentLocale` - 获取当前语言（需要 `LANGUAGES_READ` 权限）
- `Languages.getLoadedLocales` - 获取已加载语言列表（需要 `LANGUAGES_READ` 权限）

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
- `FileSystem.*` 依赖各分区的 NodeTree；当某分区 NodeTree 未初始化时，ProcessManager 会尝试从 FSDirve 重建该分区树，详见 [NodeTree.md](./NodeTree.md)。语言包相关 API 见 [LanguagesExpansion.md](./LanguagesExpansion.md)。

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

1. **PID 分配**: PID 使用加密安全的随机数分配（范围：10001-99999），确保不会与 Exploit 程序的 PID (10000) 冲突
2. **程序对象**: 程序必须导出为全局对象，命名规则为程序名全大写
3. **必需方法**: 程序必须实现 `__init__` 和 `__exit__` 方法
4. **内存管理**: 程序退出时会自动释放所有内存，但建议在 `__exit__` 中手动释放内存引用
5. **DOM 清理**: 程序退出时会自动清理所有标记的 DOM 元素
6. **CLI 终端**: CLI 程序从 GUI 启动时会自动创建终端，无需手动处理
7. **CVS-ZEROS-009 已修复**: ProcessManager 内核 API 调用已增加调用栈与 PID 一致性校验、Exploit PID 使用严格校验，并提供进程绑定 API（`initArgs.kernelAPI.call`）。禁止应用层传入伪造或他人 PID 提权；推荐敏感/多实例程序使用 `initArgs.kernelAPI.call(apiName, args)`。详见 [VULN/CVS_ZEROS_009.md](../../VULN/CVS_ZEROS_009.md)
8. **任务管理器**：任务管理器（taskmanager）支持后台进程的识别与管理：进程列表按「运行模式」筛选（全部/前台/后台）、运行中后台进程显示「后台」徽章、进程详情中展示「运行模式」并提供「转为前台」「转为后台」操作；右键菜单中也可对后台/前台进程执行「转为前台」「转为后台」。

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [MemoryManager.md](./MemoryManager.md) - 内存管理器 API
- [ApplicationAssetManager.md](./ApplicationAssetManager.md) - 应用程序资源管理器 API

