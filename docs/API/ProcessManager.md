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
5. 加载程序脚本：
   - 如果 `tempAsset.script` 是文件内容，直接执行
   - 如果是路径，从路径加载
   - **注意**：如果脚本已存在，会先移除旧的 script 元素再重新加载，确保程序对象被正确注册
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

1. 调用程序的 `__exit__` 方法（程序自定义清理）
2. 如果是 CLI 程序，关闭关联的终端
3. 清理 GUI 元素（窗口、DOM）
4. 清理任务栏/托盘图标
5. 清理内核资源：
   - 拖拽会话 (DragDrive)
   - 通知 (NotificationManager)
   - 事件处理器 (EventManager)
   - 权限 (PermissionManager)
   - 多线程资源 (MultithreadingDrive)
   - 语音识别会话 (SpeechDrive)
6. 清理全局引用：
   - 删除 `window[programNameUpper]`
   - 删除 `globalThis[programNameUpper]`
   - 从 POOL 移除 (`APPLICATION_POOL`, `APPLICATION_SHARED_POOL`)
7. 回收 upid（后端权限映射）
8. 从进程表移除

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

**可用 API**（快速索引）：以下按模块分组；**详细参数、返回值与示例**见各模块文档（[GUIManager](./GUIManager.md)、[TaskbarManager](./TaskbarManager.md)、[NotificationManager](./NotificationManager.md)、[LStorage](./LStorage.md)、[PermissionManager](./PermissionManager.md) 等）。

- **文件系统**：`FileSystem.read`（读文件，需 `KERNEL_DISK_READ`）、`FileSystem.write`（写文件，需 `KERNEL_DISK_WRITE`）、`FileSystem.delete`、`FileSystem.create`、`FileSystem.list`。路径格式为 `盘符:/路径`，如 `D:/app/data.txt`。详见 [NodeTree.md - 程序用文件 API（FileSystem.*）](./NodeTree.md#程序用文件-apifilesystem)。
- **文件关联**：`FileAssoc.get`（按扩展名查默认打开程序，不需权限）、`FileAssoc.list`（列出全部关联，不需权限）、`FileAssoc.set`（设置扩展名默认打开程序，需 `FILE_ASSOC_MANAGE`）、`FileAssoc.clear`（清除扩展名关联，需 `FILE_ASSOC_MANAGE`）。数据持久化在系统存储 `system.fileAssoc`（LocalSData.json）。扩展名需带前导点（如 `.zom`）。文件管理器「打开方式」子窗口会据此优先用默认程序打开文件。
- **通知**：`Notification.create`（需 `SYSTEM_NOTIFICATION`，参数 `[{ type, title, content }]`）、`Notification.remove`。详见 [NotificationManager](./NotificationManager.md)。
- **网络**：`Network.request`、`Network.fetch`（需 `NETWORK_ACCESS`，普通权限）；`Network.Port.register` / `unregister` / `getStatus` / `list` / `send`。详见 [NetworkPort](./NetworkPort.md)。
- **GUI 与窗口**：`GUI.createWindow`、`GUI.manageWindow`（需 `GUI_WINDOW_MANAGE`）；`GUI.registerTaskbarPreviewProvider`（需 `GUI_WINDOW_CREATE`，**pid 由内核注入**，程序仅传 `[provider]`，详见 [GUIManager - 任务栏单窗口预览提供者](./GUIManager.md#任务栏单窗口预览提供者)）、`GUI.unregisterTaskbarPreviewProvider`（不需权限，**pid 由内核注入**，程序传 `[]`）。详见 [GUIManager](./GUIManager.md)。
- **存储与主题**：`Storage.read` / `Storage.write`（系统存储）；`Theme.read` / `Theme.write`。
- **桌面**：`Desktop.manage`、`Desktop.addShortcut`、`Desktop.addFileOrFolderIcon`、`Desktop.removeShortcut`、`Desktop.getIcons`、`Desktop.getConfig`、`Desktop.setArrangementMode`、`Desktop.setIconSize`、`Desktop.setAutoArrange`、`Desktop.refresh`。详见 [DesktopManager](./DesktopManager.md)。
- **进程与后台**：`Process.manage`（需 `PROCESS_MANAGE`）；`Process.requestBackground`、`Process.registerBackgroundTrayClick`、`Process.registerBackgroundTrayContextMenu`（需 `PROCESS_BACKGROUND`，仅自身）；`Process.requestSelfTermination`（不需权限，仅自身，推荐 `kernelAPI.call`）。详见上文「内核 API：Process.requestBackground / 后台进程托盘事件回调」。
- **多线程**：`Multithreading.createThread`（需 `MULTITHREADING_CREATE`）；`Multithreading.executeTask`（需 `MULTITHREADING_EXECUTE`）；`Multithreading.getPoolStatus`、`Multithreading.getProcessThreads`、`Multithreading.getProcessesWithThreads`（需 `MULTITHREADING_EXECUTE`）。详见 [MultithreadingDrive](./MultithreadingDrive.md)。
- **拖拽**：`Drag.createSession`、`Drag.enable`、`Drag.disable`、`Drag.destroySession`、`Drag.getSession`、`Drag.registerDropZone`、`Drag.unregisterDropZone`、`Drag.createFileDrag`、`Drag.createWindowDrag`、`Drag.getProcessDrags`。详见 [DragDrive](./DragDrive.md)。
- **地理**：`Geography.getCurrentPosition`、`Geography.clearCache`、`Geography.isSupported`、`Geography.getCachedLocation`。详见 [GeographyDrive](./GeographyDrive.md)。
- **加密**：`Crypt.generateKeyPair`、`Crypt.importKeyPair`、`Crypt.getKeyInfo`、`Crypt.listKeys`、`Crypt.deleteKey`、`Crypt.setDefaultKey`、`Crypt.encrypt`、`Crypt.decrypt`、`Crypt.md5` 及 `Crypt.random*` / `randomChoice` / `shuffle`。详见 [CryptDrive](./CryptDrive.md)。
- **缓存**：`Cache.set`、`Cache.get`、`Cache.has`、`Cache.delete`、`Cache.clear`、`Cache.getStats`。详见 [CacheDrive](./CacheDrive.md)。
- **任务栏**：`Taskbar.pinProgram`、`Taskbar.unpinProgram`、`Taskbar.getPinnedPrograms`、`Taskbar.isPinned`、`Taskbar.setPinnedPrograms`、`Taskbar.addIcon`、`Taskbar.removeIcon`、`Taskbar.updateIcon`、`Taskbar.getCustomIcons`、`Taskbar.getCustomIconsByPid`。详见 [TaskbarManager](./TaskbarManager.md)。
- **语音**：`Speech.isSupported`、`Speech.createSession`、`Speech.startRecognition`、`Speech.stopRecognition`、`Speech.stopSession`、`Speech.getSessionStatus`、`Speech.getSessionResults`。详见 [SpeechDrive](./SpeechDrive.md)。
- **计划任务**：`ScheduleTask.create`（需 `SCHEDULE_TASK_CREATE` 或 `SCHEDULE_TASK_STARTUP`）、`ScheduleTask.delete`、`ScheduleTask.update`、`ScheduleTask.get`、`ScheduleTask.getAll`、`ScheduleTask.setEnabled`。**pid 由内核注入**的 API 之一，程序调用时 args 不包含 pid。详见 [ScheduleTaskManager](./ScheduleTaskManager.md)。
- **语言**：`Languages.loadPack`、`Languages.setCurrent`、`Languages.getText`、`Languages.listPacks`、`Languages.getCurrentLocale`、`Languages.getLoadedLocales`。详见 [LanguagesExpansion](./LanguagesExpansion.md)。

##### 文件关联 API（FileAssoc.*）

| API | 参数 | 权限 | 说明 |
|-----|------|------|------|
| `FileAssoc.get` | `ext`（字符串，如 `'.zom'`） | 不需权限 | 返回该扩展名的默认打开程序名，无则返回 `null`。扩展名会规范为小写且带前导点。 |
| `FileAssoc.list` | 无 | 不需权限 | 返回 `{ ".zom": "strawberry-security", ... }` 形式的全部关联（只读）。 |
| `FileAssoc.set` | `ext`, `programName` | **`FILE_ASSOC_MANAGE`** | 设置扩展名 `ext` 的默认打开程序为 `programName`，持久化到 `system.fileAssoc`。 |
| `FileAssoc.clear` | `ext` | **`FILE_ASSOC_MANAGE`** | 清除该扩展名的默认打开程序。 |

**示例**：
```javascript
// 读取 .zom 的默认打开程序（不需权限）
const program = await ProcessManager.callKernelAPI(this.pid, 'FileAssoc.get', ['.zom']);

// 将 .zom 设为草莓安全打开（需 FILE_ASSOC_MANAGE）
await ProcessManager.callKernelAPI(this.pid, 'FileAssoc.set', ['.zom', 'strawberry-security']);
```

**部分 API 调用约定**：
- **pid 由内核注入**：以下 API 调用时，内核会把当前调用进程的 pid 作为第一个参数注入，程序传参**不要**包含 pid。例如：`kernelAPI.call('GUI.registerTaskbarPreviewProvider', [provider])`、`kernelAPI.call('GUI.unregisterTaskbarPreviewProvider', [])`、`kernelAPI.call('ScheduleTask.create', [taskConfig])`、`Notification.create` / `Notification.remove`、`Event.register` / `Event.unregister` / `Event.unregisterAll` 等。使用 `callKernelAPI(pid, apiName, args)` 时由调用方传入 pid，通常用于管理其他进程（需相应权限）。
- **权限**：每项所需权限见上或 [PermissionManager](./PermissionManager.md)；未授权调用会抛错。

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

