# GUIManager API 文档

## 概述

`GUIManager` 是 ZerOS 内核的 GUI 窗口管理器，统一管理所有 GUI 程序的窗口层叠显示和焦点管理。提供统一的窗口样式和控件（最小化、最大化、关闭），以及模态对话框功能。

## 依赖

- `ThemeManager` - 主题管理器（用于窗口样式和图标）
- `ProcessManager` - 进程管理器（用于获取程序信息）
- `TaskbarManager` - 任务栏管理器（用于更新任务栏）

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
  - `onClose` (Function): 关闭回调 `() => {}`
  - `onMinimize` (Function): 最小化回调（可选）`() => {}`
  - `onMaximize` (Function): 最大化回调（可选）`() => {}`
  - `windowId` (string): 窗口 ID（可选，如果不提供则自动生成）

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
        ProcessManager.killProgram(pid);
    },
    onMinimize: () => {
        console.log('窗口已最小化');
    },
    onMaximize: () => {
        console.log('窗口已最大化');
    }
});
```

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
            ProcessManager.killProgram(pid);
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

## 注意事项

1. **窗口元素**: 窗口元素必须具有 `position: fixed` 或 `position: absolute`
2. **窗口 ID**: 如果不提供 `windowId`，GUIManager 会自动生成唯一 ID
3. **多窗口**: 一个进程可以注册多个窗口，第一个窗口会被标记为主窗口
4. **模态对话框**: 模态对话框会阻止用户与其他窗口交互，直到对话框关闭
5. **窗口清理**: 程序退出时，GUIManager 会自动清理所有窗口

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API
- [ThemeManager.md](./ThemeManager.md) - 主题管理器 API

