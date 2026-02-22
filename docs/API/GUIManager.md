# GUIManager API 文档

## 概述

`GUIManager` 是 ZerOS 内核的 GUI 窗口管理器，统一管理所有 GUI 程序的窗口层叠显示和焦点管理。提供统一的窗口样式和控件（最小化、最大化、关闭），以及模态对话框功能。

## 依赖

- `ThemeManager` - 主题管理器（用于窗口样式和图标）
- `ProcessManager` - 进程管理器（用于获取程序信息）
- `TaskbarManager` - 任务栏管理器（用于更新任务栏）

## 获取实例

GUIManager 注册在 POOL 中，可以通过以下方式获取：

```javascript
// 从 POOL 获取
const GUIManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");
```

**注意**：在内核初始化完成后，GUIManager 已加载，可以直接使用。

## 初始化

GUI 管理器在系统启动时自动初始化，也可以手动调用：

```javascript
GUIManager.init();
```

## API 方法

### 窗口注册

#### `registerWindow(pid, windowElement, options)`

注册窗口到 GUIManager。

**参数**:
- `pid` (number): 进程 ID
- `windowElement` (HTMLElement): 窗口元素
- `options` (Object): 选项对象
  - `title` (string): 窗口标题
  - `icon` (string): 窗口图标路径（可选）
  - `onClose` (Function): 关闭回调 `() => {}`。**重要**：此回调在窗口关闭时被调用，用于执行清理工作。回调不应调用 `GUIManager.unregisterWindow()` 或 `GUIManager._closeWindow()`，因为窗口关闭流程由 GUIManager 统一管理。如果回调中已经关闭了窗口（通过 `unregisterWindow`），GUIManager 会检测到并跳过后续关闭流程。GUIManager 会在窗口关闭后自动检查该 PID 是否还有其他窗口，如果没有且不是 Exploit 程序（PID 10000），会自动 kill 进程。**支持「关闭转后台」**：若程序支持「点击关闭时转为后台」而不真正退出，可在 onClose 中设置 `GUIManager.getWindowInfo(windowId)._backgroundRequested = true`、隐藏窗口并调用 `Process.requestBackground`；GUIManager 检测到 `_backgroundRequested` 后将只隐藏窗口、不注销不 kill 进程，用户可从托盘单击该后台进程再次恢复窗口并转为前台。
  - `onMinimize` (Function): 最小化回调（可选）`() => {}`
  - `onMaximize` (Function): 最大化回调（可选）`(isMaximized: boolean) => {}`。参数 `isMaximized` 表示窗口是否最大化（`true` 为最大化，`false` 为还原）
  - `windowId` (string): 窗口 ID（可选，如果不提供则自动生成）
  - `noTitleBar` (boolean): 是否不使用系统标题栏；为 `true` 时由应用自行绘制标题栏，需同时提供 `dragHandle` 以支持拖拽
  - `dragHandle` (HTMLElement): 当 `noTitleBar` 为 `true` 时，用于拖拽窗口的 DOM 元素（如自定义标题栏容器）
  - `borderless` (boolean): 是否使用无边框样式（无可见边框、默认无阴影，仅焦点时极轻阴影；最大化时无阴影）
  - `titleBarHeight` (number): 系统标题栏高度（像素），仅在不使用 `noTitleBar` 时生效，默认 40
  - `titleBarPadding` (string): 系统标题栏内边距（CSS 值），仅在不使用 `noTitleBar` 时生效，默认 `'0 16px'`

**返回值**: `Object|null` - 窗口信息对象
```javascript
{
    windowId: string,
    window: HTMLElement,
    pid: number,
    zIndex: number,
    isFocused: boolean,
    isMinimized: boolean,
    isMaximized: boolean,
    isMainWindow: boolean,
    title: string,
    icon: string|null,
    createdAt: number
}
```

**示例**:
```javascript
GUIManager.registerWindow(pid, windowElement, {
    title: '我的应用',
    icon: 'application/myapp/myapp.svg',
    onClose: () => {
        // onClose 回调只用于执行清理工作，不应调用 unregisterWindow 或 _closeWindow
        // 窗口关闭流程由 GUIManager 统一管理
        // GUIManager 会在窗口关闭后自动检查该 PID 是否还有其他窗口
        // 如果没有且不是 Exploit 程序（PID 10000），会自动 kill 进程
    },
    onMinimize: () => {
        console.log('窗口已最小化');
    },
    onMaximize: (isMaximized) => {
        console.log('窗口已最大化:', isMaximized);
    }
});
```

**无边框 + 自定义标题栏示例**（如磁盘管理程序）:
```javascript
var titleBar = windowElement.querySelector('.my-custom-titlebar');
GUIManager.registerWindow(pid, windowElement, {
    title: '磁盘管理',
    noTitleBar: true,
    dragHandle: titleBar,
    borderless: true,
    onClose: () => {},
    onMinimize: () => { /* 自定义最小化 */ },
    onMaximize: (isMaximized) => { /* 自定义最大化/还原 */ }
});
```
此时窗口会添加类 `zos-window-borderless`，无系统标题栏，拖拽由 `dragHandle` 提供。

#### `unregisterWindow(windowIdOrPid)`

注销窗口。

**参数**:
- `windowIdOrPid` (string|number): 窗口 ID 或进程 ID

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
// 通过窗口 ID 注销
GUIManager.unregisterWindow('window_1234_1234567890_abc');

// 通过进程 ID 注销（会注销该进程的所有窗口）
GUIManager.unregisterWindow(pid);
```

### 窗口焦点管理

#### `focusWindow(windowIdOrPid)`

将窗口置于最前并获得焦点。

**参数**:
- `windowIdOrPid` (string|number): 窗口 ID 或进程 ID

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
GUIManager.focusWindow('window_1234_1234567890_abc');
// 或
GUIManager.focusWindow(pid);
```

#### `showWindowsForPid(pid)`

显示某进程的所有窗口并聚焦第一个窗口。用于从后台恢复：将该 PID 下所有被设为 `display:none` 的窗口恢复显示，并将焦点给该进程的第一个窗口。任务栏在用户点击后台进程托盘项时会调用此方法，确保点击后 GUI 窗口一定会出现。

**参数**:
- `pid` (number): 进程 ID

**返回值**: 无

**示例**:
```javascript
GUIManager.showWindowsForPid(pid);
```

### 窗口状态管理

#### `minimizeWindow(windowIdOrPid)`

最小化窗口。

**参数**:
- `windowIdOrPid` (string|number): 窗口 ID 或进程 ID

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
GUIManager.minimizeWindow(pid);
```

#### `restoreWindow(windowIdOrPid, autoFocus)`

恢复窗口。

**参数**:
- `windowIdOrPid` (string|number): 窗口 ID 或进程 ID
- `autoFocus` (boolean): 是否自动获得焦点（默认 `true`）

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
GUIManager.restoreWindow(pid, true);
```

#### `toggleMaximize(windowIdOrPid)`

切换最大化状态。

**参数**:
- `windowIdOrPid` (string|number): 窗口 ID 或进程 ID

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
GUIManager.toggleMaximize(pid);
```

### 窗口查询

#### `getWindowsByPid(pid)`

获取进程的所有窗口。

**参数**:
- `pid` (number): 进程 ID

**返回值**: `Array<Object>` - 窗口信息数组

**示例**:
```javascript
const windows = GUIManager.getWindowsByPid(pid);
windows.forEach(win => {
    console.log(`窗口: ${win.title}, ID: ${win.windowId}`);
});
```

#### `getWindowLogs(windowId, options)`

获取窗口日志。

**参数**:
- `windowId` (string): 窗口 ID
- `options` (Object): 选项对象
  - `limit` (number): 限制返回数量（可选）
  - `action` (string): 按操作类型过滤（可选）

**返回值**: `Array<Object>` - 日志条目数组

**示例**:
```javascript
// 获取所有日志
const logs = GUIManager.getWindowLogs(windowId);

// 获取最近 10 条日志
const recentLogs = GUIManager.getWindowLogs(windowId, { limit: 10 });

// 获取特定操作的日志
const focusLogs = GUIManager.getWindowLogs(windowId, { action: 'focus' });
```

### 任务栏单窗口预览提供者

程序可注册「任务栏单窗口预览提供者」，使悬停任务栏图标时的预览使用程序提供的 HTML 片段渲染，点击预览时由程序的回调处理。未注册时保持系统默认预览（缩略图 + 窗口标题）。**仅对单窗口预览生效**，多窗口预览不在此增强范围内。

程序应通过内核 API 调用（pid 由内核自动注入），见 [ProcessManager.md - 可用 API](./ProcessManager.md)。

#### `registerTaskbarPreviewProvider(pid, provider)`

注册任务栏单窗口预览提供者。由内核或 TaskbarManager 使用；程序侧请使用内核 API `GUI.registerTaskbarPreviewProvider`。

**参数**:
- `pid` (number): 进程 ID
- `provider` (Object): 提供者对象
  - `getPreviewContent` (Function): `() => string | HTMLElement`，返回预览内容：字符串将作为 HTML 插入，HTMLElement 将直接挂载
  - `onPreviewClick` (Function，可选): `(e: Event) => void`，预览区域内的点击事件由该回调处理

**说明**:
- 注册后，该进程在**单窗口**且任务栏显示预览时，将使用 `getPreviewContent()` 的返回值渲染预览区域
- 预览区域内的点击会调用 `onPreviewClick(e)`，由程序自行决定行为（如聚焦窗口、执行操作等）
- 进程退出或窗口被清理时，内核会自动调用 `unregisterTaskbarPreviewProvider(pid)`，无需程序显式注销

#### `unregisterTaskbarPreviewProvider(pid)`

注销任务栏单窗口预览提供者。程序侧请使用内核 API `GUI.unregisterTaskbarPreviewProvider`；进程退出时内核会自动调用，一般无需程序显式调用。

**参数**:
- `pid` (number): 进程 ID

#### `getTaskbarPreviewProvider(pid)`

获取指定进程的预览提供者（供 TaskbarManager 等内部使用，程序无需调用）。

**参数**:
- `pid` (number): 进程 ID

**返回值**: `Object | null` - `{ getPreviewContent, onPreviewClick }` 或 `null`

**程序侧调用示例**（在 `__init__(pid, initArgs)` 中，使用进程绑定 API，pid 由内核注入）:
```javascript
// 注册自定义预览：悬停任务栏图标时显示自定义 HTML，点击预览时聚焦窗口
initArgs.kernelAPI.call('GUI.registerTaskbarPreviewProvider', [{
    getPreviewContent: () => {
        return '<div class="my-preview">当前文档: ' + (this.docTitle || '未命名') + '</div>';
    },
    onPreviewClick: (e) => {
        if (typeof GUIManager !== 'undefined') GUIManager.focusWindow(this.pid);
    }
}]);
// 进程退出时内核会自动注销，无需手动调用 GUI.unregisterTaskbarPreviewProvider
```

### 模态对话框

#### `showAlert(message, title, type)`

显示提示框（替代 `alert()`）。

**参数**:
- `message` (string): 提示消息
- `title` (string): 标题（可选，默认：'提示'）
- `type` (string): 类型（可选，默认：'info'）
  - `'info'`: 信息提示
  - `'success'`: 成功提示
  - `'warning'`: 警告提示
  - `'error'`: 错误提示

**返回值**: `Promise<void>`

**示例**:
```javascript
await GUIManager.showAlert('操作成功', '提示', 'success');
```

#### `showConfirm(message, title, type)`

显示确认对话框（替代 `confirm()`）。

**参数**:
- `message` (string): 确认消息
- `title` (string): 标题（可选，默认：'确认'）
- `type` (string): 类型（可选，默认：'warning'）

**返回值**: `Promise<boolean>` - `true` 表示确认，`false` 表示取消

**示例**:
```javascript
const confirmed = await GUIManager.showConfirm('确定要删除吗？', '确认删除', 'warning');
if (confirmed) {
    // 执行删除操作
}
```

#### `showPrompt(message, title, defaultValue)`

显示输入对话框（替代 `prompt()`）。

**参数**:
- `message` (string): 提示消息
- `title` (string): 标题（可选，默认：'输入'）
- `defaultValue` (string): 默认值（可选，默认：''）

**返回值**: `Promise<string|null>` - 用户输入的值，取消返回 `null`

**示例**:
```javascript
const input = await GUIManager.showPrompt('请输入文件名：', '新建文件', 'untitled.txt');
if (input) {
    console.log(`文件名: ${input}`);
}
```

## 使用示例

### 示例 1: 注册窗口

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 创建窗口元素
    const window = document.createElement('div');
    window.className = 'myapp-window zos-gui-window';
    window.dataset.pid = pid.toString();
    
    // 注册到 GUIManager
    const windowInfo = GUIManager.registerWindow(pid, window, {
        title: '我的应用',
        icon: 'application/myapp/myapp.svg',
        onClose: () => {
            // onClose 回调只用于执行清理工作，不应调用 unregisterWindow 或 _closeWindow
            // 窗口关闭流程由 GUIManager 统一管理
            // GUIManager 会在窗口关闭后自动检查该 PID 是否还有其他窗口
            // 如果没有且不是 Exploit 程序（PID 10000），会自动 kill 进程
        }
    });
    
    // 保存窗口信息
    this.windowId = windowInfo.windowId;
    this.window = window;
}
```

### 示例 2: 窗口操作

```javascript
// 最小化窗口
GUIManager.minimizeWindow(this.windowId);

// 恢复窗口
GUIManager.restoreWindow(this.windowId);

// 最大化/还原窗口
GUIManager.toggleMaximize(this.windowId);

// 获得焦点
GUIManager.focusWindow(this.windowId);
```

### 示例 3: 使用模态对话框

```javascript
// 显示提示
await GUIManager.showAlert('文件已保存', '成功', 'success');

// 显示确认
const confirmed = await GUIManager.showConfirm('确定要退出吗？');
if (confirmed) {
    ProcessManager.killProgram(this.pid);
}

// 显示输入
const filename = await GUIManager.showPrompt('请输入文件名：', '新建文件');
if (filename) {
    await Disk.createFile(`C:/${filename}`, '');
}
```

## 窗口状态

窗口有以下状态：

- `isFocused`: 是否获得焦点
- `isMinimized`: 是否最小化
- `isMaximized`: 是否最大化
- `isMainWindow`: 是否为主窗口（进程的第一个窗口）

## Z-Index 管理

GUIManager 自动管理窗口的 z-index：

- 新窗口的 z-index 比当前最大 z-index 大 1
- 获得焦点的窗口 z-index 会提升到最前
- 当 z-index 接近最大值时，会重新分配所有窗口的 z-index

## 窗口控制按钮

GUIManager 自动为每个窗口创建统一的控制按钮：

- **关闭按钮**（红色）：调用 `onClose` 回调
- **最小化按钮**（黄色）：最小化窗口
- **最大化按钮**（绿色）：最大化/还原窗口

按钮图标会根据当前主题样式自动更新。

## 窗口关闭流程

当窗口关闭时（用户点击关闭按钮或调用 `unregisterWindow`），GUIManager 会执行以下流程：

1. **调用 `onClose` 回调**（如果存在）：
   - 回调在窗口关闭动画之前执行
   - GUIManager 会在调用前清除 `onClose` 引用，避免递归调用
   - 如果回调中已经调用了 `unregisterWindow`，GUIManager 会检测到并跳过后续关闭流程

2. **执行关闭动画**：
   - 使用 AnimateManager 添加关闭动画
   - 等待动画完成后移除窗口元素

3. **注销窗口**：
   - 从窗口注册表中移除窗口信息
   - 清理事件监听器（拖动、拉伸等）
   - 更新任务栏可见性

4. **检查进程终止**：
   - 如果该 PID 没有其他窗口了，且不是 Exploit 程序（PID 10000），会自动调用 `ProcessManager.killProgram(pid)` 终止进程
   - 这样可以确保程序多实例（不同 PID）互不影响

**重要提示**：
- `onClose` 回调只用于执行清理工作，不应调用 `unregisterWindow` 或 `_closeWindow`
- 窗口关闭流程由 GUIManager 统一管理，确保资源正确清理
- 程序多窗口（同一 PID 的多个窗口）应该由程序自己管理
- 程序多实例（不同 PID）应该独立管理，互不影响

## 注意事项

1. **窗口元素**: 窗口元素必须具有 `position: fixed` 或 `position: absolute`
2. **窗口 ID**: 如果不提供 `windowId`，GUIManager 会自动生成唯一 ID
3. **多窗口**: 一个进程可以注册多个窗口，第一个窗口会被标记为主窗口
4. **模态对话框**: 模态对话框会阻止用户与其他窗口交互，直到对话框关闭
5. **窗口清理**: 程序退出时，GUIManager 会自动清理所有窗口
6. **关闭回调**: `onClose` 回调不应调用 `unregisterWindow` 或 `_closeWindow`，窗口关闭由 GUIManager 统一管理

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API
- [ThemeManager.md](./ThemeManager.md) - 主题管理器 API

