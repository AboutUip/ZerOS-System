# TaskbarManager API 文档

## 概述

`TaskbarManager` 是 ZerOS 内核的任务栏管理器，负责渲染任务栏，显示固定程序和正在运行的程序。提供任务栏位置管理、程序图标显示、通知徽章、固定程序管理、天气组件等功能。

## 依赖

- `ProcessManager` - 进程管理器（用于获取运行中的程序）
- `ApplicationAssetManager` - 应用程序资源管理器（用于获取程序信息）
- `GUIManager` - GUI 管理器（用于窗口管理）
- `ThemeManager` - 主题管理器（用于系统图标）
- `NotificationManager` - 通知管理器（用于通知徽章）
- `LStorage` - 本地存储（用于保存任务栏位置和固定程序列表）

## 初始化

任务栏在系统启动时自动初始化：

```javascript
TaskbarManager.init();
```

## API 方法

### 任务栏管理

#### `init()`

初始化任务栏。

**示例**:
```javascript
TaskbarManager.init();
```

#### `update()`

更新任务栏（重新渲染）。

**示例**:
```javascript
TaskbarManager.update();
```

### 固定程序管理

#### `pinProgram(programName)`

将程序固定到任务栏。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await TaskbarManager.pinProgram('filemanager');
```

#### `unpinProgram(programName)`

从任务栏取消固定程序。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await TaskbarManager.unpinProgram('filemanager');
```

#### `getPinnedPrograms()`

获取所有固定在任务栏的程序列表。

**返回值**: `Promise<Array<string>>` - 固定程序名称列表

**示例**:
```javascript
const pinned = await TaskbarManager.getPinnedPrograms();
console.log('固定程序:', pinned); // ['filemanager', 'browser', ...]
```

#### `isPinned(programName)`

检查程序是否固定在任务栏。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Promise<boolean>` - 是否固定

**示例**:
```javascript
const isPinned = await TaskbarManager.isPinned('filemanager');
if (isPinned) {
    console.log('文件管理器已固定在任务栏');
}
```

#### `setPinnedPrograms(programNames)`

设置固定程序列表（批量操作）。

**参数**:
- `programNames` (Array<string>): 程序名称列表

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await TaskbarManager.setPinnedPrograms(['filemanager', 'browser', 'musicplayer']);
```

## 任务栏功能

### 程序显示

任务栏自动显示：

1. **固定程序**: 通过 `pinProgram()` 固定的程序（无论是否运行都显示）
2. **运行中的程序**: 当前正在运行的程序（包括最小化的程序）
3. **系统组件**: 网络状态、电池状态、天气信息、时间显示、通知按钮等

### 天气组件

任务栏右侧显示天气组件，提供以下功能：

- **实时天气信息**：显示当前温度、天气状况、天气图标
- **智能缓存机制**：
  - 天气数据缓存30分钟，刷新操作时使用缓存数据，避免等待API响应
  - 缓存存储在 `TaskbarManager._weatherCache` 中
  - API失败时自动使用缓存数据作为降级方案
- **多主题适配**：自动应用当前主题颜色，支持玻璃效果主题
- **详细天气面板**：点击天气组件可查看详细天气信息
- **自动布局适配**：根据任务栏位置（水平/垂直）自动调整显示方式
  - 水平布局：显示图标、温度、描述
  - 垂直布局：仅显示图标，详细信息在工具提示中
- **自动刷新**：每30分钟自动刷新天气数据

**天气数据来源**：
- 城市信息：`https://api-v1.cenguigui.cn/api/UserInfo/apilet.php`
- 天气信息：`https://api-v1.cenguigui.cn/api/WeatherInfo/?city={城市名}`

### 程序状态指示

- **运行中**: 程序图标正常显示
- **最小化**: 程序图标可能显示为最小化状态
- **多实例**: 同一程序的多个实例会合并显示

### 通知徽章

任务栏显示通知图标和数量徽章：

- 通知图标：点击打开/关闭通知栏
- 数量徽章：实时显示通知数量

### 任务栏位置

任务栏支持四个位置：

- `bottom` - 底部（默认）
- `top` - 顶部
- `left` - 左侧
- `right` - 右侧

任务栏位置会自动保存到 LStorage，并在下次启动时恢复。

## 使用示例

### 示例 1: 手动更新任务栏

```javascript
// 在程序启动或关闭后更新任务栏
await ProcessManager.startProgram('myapp');
TaskbarManager.update();
```

### 示例 2: 获取任务栏位置

```javascript
// 任务栏位置存储在 TaskbarManager._taskbarPosition
// 注意：这是私有属性，通常不需要直接访问
```

## 通过 ProcessManager 调用

固定程序管理 API 也可以通过 `ProcessManager.callKernelAPI` 调用：

```javascript
// 固定程序
await ProcessManager.callKernelAPI(pid, 'Taskbar.pinProgram', ['filemanager']);

// 取消固定
await ProcessManager.callKernelAPI(pid, 'Taskbar.unpinProgram', ['filemanager']);

// 获取固定程序列表
const pinned = await ProcessManager.callKernelAPI(pid, 'Taskbar.getPinnedPrograms', []);

// 检查是否固定
const isPinned = await ProcessManager.callKernelAPI(pid, 'Taskbar.isPinned', ['filemanager']);

// 批量设置固定程序
await ProcessManager.callKernelAPI(pid, 'Taskbar.setPinnedPrograms', [['filemanager', 'browser']]);
```

**权限要求**:
- `Taskbar.pinProgram`: 需要 `DESKTOP_MANAGE` 权限
- `Taskbar.unpinProgram`: 需要 `DESKTOP_MANAGE` 权限
- `Taskbar.getPinnedPrograms`: 不需要权限（读取操作）
- `Taskbar.isPinned`: 不需要权限（读取操作）
- `Taskbar.setPinnedPrograms`: 需要 `DESKTOP_MANAGE` 权限

## 任务栏结构

任务栏包含以下部分：

1. **左侧容器**: 固定程序和运行中的程序
2. **右侧容器**: 系统组件（从左到右）：
   - 网络状态显示
   - 电池状态显示
   - 天气组件（温度、天气状况、图标）
   - 时间显示
   - 通知按钮（带数量徽章）

## 注意事项

1. **自动更新**: 任务栏会自动监听进程变化并更新，通常不需要手动调用 `update()`
2. **程序图标**: 程序图标从 `ApplicationAssetManager` 获取
3. **系统图标**: 系统图标根据当前主题风格自动更新
4. **通知徽章**: 通知数量由 `NotificationManager` 提供
5. **任务栏位置**: 任务栏位置设置会自动保存和应用
6. **固定程序**: 固定程序列表存储在 `LStorage` 的 `taskbar.pinnedPrograms` 键中，会自动持久化
7. **固定程序显示**: 固定程序无论是否运行都会显示在任务栏左侧，运行中的程序会显示在固定程序之后
8. **天气缓存**: 天气数据使用智能缓存机制，刷新操作时使用缓存数据，提升响应速度。缓存有效期30分钟，过期后自动从API获取新数据
9. **天气API**: 天气数据来自外部API，如果API不可用，系统会尝试使用缓存数据。如果缓存也不可用，会显示错误状态

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API
- [NotificationManager.md](./NotificationManager.md) - 通知管理器 API
- [ThemeManager.md](./ThemeManager.md) - 主题管理器 API

