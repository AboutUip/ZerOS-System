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
- `GeographyDrive` - 地理位置驱动（用于天气组件的城市名称获取，可选依赖）

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
- 城市信息：优先使用 `GeographyDrive` 低精度定位获取城市名称（不触发浏览器权限请求），失败时降级到直接调用 API
- 天气信息：`https://api-v1.cenguigui.cn/api/WeatherInfo/?city={城市名}`

**城市名称获取策略**：
1. **优先使用 GeographyDrive**：使用低精度定位（`enableHighAccuracy: false`）获取城市名称，不会触发浏览器权限请求
2. **降级方案**：如果 GeographyDrive 未加载或获取失败，自动降级到直接调用 `https://api-v1.cenguigui.cn/api/UserInfo/apilet.php` API

**并发请求处理**：
- 天气组件实现了并发控制机制，防止多个同时请求导致重复的 API 调用
- 如果多个地方同时请求天气数据（如用户快速点击刷新），只有第一个请求会发起网络调用
- 其他并发请求会等待第一个请求完成，并共享其结果
- 这确保了即使响应时间有差异，也不会导致重复请求第三方定位 API

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

### 自定义图标管理

#### `addCustomIcon(options)`

添加自定义图标到任务栏。

**参数**:
- `options` (Object): 图标配置对象
  - `iconId` (string, 可选): 图标唯一标识符（如果未提供，将自动生成）
  - `icon` (string, 必需): 图标路径或URL
  - `title` (string, 必需): 图标标题/工具提示
  - `onClick` (Function, 可选): 点击事件处理函数
  - `pid` (number, 可选): 关联的进程ID（用于权限检查和自动清理）
  - `metadata` (Object, 可选): 元数据

**返回值**: `Promise<string>` - 图标ID

**示例**:
```javascript
// 直接调用
const iconId = await TaskbarManager.addCustomIcon({
    icon: 'D:/application/myapp/icon.png',
    title: '我的应用',
    onClick: (e, iconData) => {
        console.log('图标被点击', iconData);
    },
    metadata: {
        // 自定义元数据
    }
});

// 通过 ProcessManager 调用
const iconId = await ProcessManager.callKernelAPI(pid, 'Taskbar.addIcon', [{
    icon: 'D:/application/myapp/icon.png',
    title: '我的应用',
    onClick: (e, iconData) => {
        console.log('图标被点击', iconData);
    }
}]);
```

#### `removeCustomIcon(iconId)`

移除自定义图标。

**参数**:
- `iconId` (string): 图标ID

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
// 直接调用
await TaskbarManager.removeCustomIcon(iconId);

// 通过 ProcessManager 调用
await ProcessManager.callKernelAPI(pid, 'Taskbar.removeIcon', [iconId]);
```

**权限要求**: 需要 `DESKTOP_MANAGE` 权限，且只能删除自己创建的图标（通过 PID 验证）

#### `updateCustomIcon(iconId, updates)`

更新自定义图标。

**参数**:
- `iconId` (string): 图标ID
- `updates` (Object): 更新内容
  - `icon` (string, 可选): 新的图标路径
  - `title` (string, 可选): 新的标题
  - `onClick` (Function|null, 可选): 新的点击事件处理函数
  - `metadata` (Object, 可选): 新的元数据（会合并到现有元数据）

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
// 直接调用
await TaskbarManager.updateCustomIcon(iconId, {
    title: '新标题',
    icon: 'D:/application/myapp/new-icon.png'
});

// 通过 ProcessManager 调用
await ProcessManager.callKernelAPI(pid, 'Taskbar.updateIcon', [iconId, {
    title: '新标题',
    icon: 'D:/application/myapp/new-icon.png'
}]);
```

**权限要求**: 需要 `DESKTOP_MANAGE` 权限，且只能更新自己创建的图标（通过 PID 验证）

#### `getCustomIcons()`

获取所有自定义图标列表。

**返回值**: `Promise<Array<Object>>` - 自定义图标列表，每个对象包含：
- `iconId` (string): 图标ID
- `icon` (string): 图标路径
- `title` (string): 图标标题
- `pid` (number|null): 关联的进程ID
- `metadata` (Object): 元数据
- `createdAt` (number): 创建时间戳

**示例**:
```javascript
// 直接调用
const icons = await TaskbarManager.getCustomIcons();

// 通过 ProcessManager 调用
const icons = await ProcessManager.callKernelAPI(pid, 'Taskbar.getCustomIcons', []);
```

**权限要求**: 不需要权限（读取操作）

#### `getCustomIconsByPid(pid)`

根据 PID 获取自定义图标列表。

**参数**:
- `pid` (number): 进程ID

**返回值**: `Promise<Array<Object>>` - 自定义图标列表

**示例**:
```javascript
// 直接调用
const icons = await TaskbarManager.getCustomIconsByPid(pid);

// 通过 ProcessManager 调用
const icons = await ProcessManager.callKernelAPI(pid, 'Taskbar.getCustomIconsByPid', [pid]);
```

**权限要求**: 不需要权限（读取操作）

**通过 ProcessManager 调用自定义图标 API**:

```javascript
// 添加自定义图标
const iconId = await ProcessManager.callKernelAPI(pid, 'Taskbar.addIcon', [{
    icon: 'D:/application/myapp/icon.png',
    title: '我的应用',
    onClick: (e, iconData) => {
        console.log('图标被点击', iconData);
    }
}]);

// 更新自定义图标
await ProcessManager.callKernelAPI(pid, 'Taskbar.updateIcon', [iconId, {
    title: '新标题'
}]);

// 移除自定义图标
await ProcessManager.callKernelAPI(pid, 'Taskbar.removeIcon', [iconId]);

// 获取所有自定义图标
const icons = await ProcessManager.callKernelAPI(pid, 'Taskbar.getCustomIcons', []);

// 根据 PID 获取自定义图标
const myIcons = await ProcessManager.callKernelAPI(pid, 'Taskbar.getCustomIconsByPid', [pid]);
```

**权限要求**:
- `Taskbar.addIcon`: 需要 `DESKTOP_MANAGE` 权限
- `Taskbar.removeIcon`: 需要 `DESKTOP_MANAGE` 权限，且只能删除自己创建的图标
- `Taskbar.updateIcon`: 需要 `DESKTOP_MANAGE` 权限，且只能更新自己创建的图标
- `Taskbar.getCustomIcons`: 不需要权限（读取操作）
- `Taskbar.getCustomIconsByPid`: 不需要权限（读取操作）

**注意事项**:
- 自定义图标会自动关联到创建它的进程 PID
- 进程退出时，该进程创建的所有自定义图标会自动清理
- `onClick` 函数无法序列化，系统重启后需要程序重新注册
- 自定义图标会与固定程序和运行中的程序一起显示在任务栏左侧

## 任务栏结构

任务栏包含以下部分：

1. **左侧容器**: 固定程序和运行中的程序
2. **右侧容器**: 系统组件（从左到右）：
   - 网络状态显示
   - 电池状态显示
   - 天气组件（温度、天气状况、图标）
   - 时间显示
   - 通知按钮（带数量徽章）

## 全局快捷键

任务栏管理器注册了以下全局快捷键：

### `Ctrl + R`

启动运行程序（如果已运行则聚焦）。

**注意**: 在输入框中按下此快捷键只会阻止浏览器刷新，不会启动运行程序。

### `Ctrl + X`

启动设置程序（如果已运行则聚焦）。

**注意**: 在输入框中按下此快捷键不会启动设置程序。

### `Ctrl + L`

锁定屏幕，显示锁屏界面。

**注意**: 
- 在输入框中按下此快捷键不会锁定屏幕
- 锁定屏幕后会隐藏桌面内容，需要重新输入密码登录

**示例**:
```javascript
// 手动锁定屏幕（内部方法）
TaskbarManager._lockScreen();
```

### `Ctrl + E`

关闭当前焦点窗口（仅在多任务选择器未激活时）。

**注意**: 如果多任务选择器已激活，此快捷键由多任务选择器处理。

### `Ctrl + Q`

切换当前焦点窗口的最大化/最小化状态。

### `Shift + E`

启动文件管理器。

**注意**: 在输入框中按下此快捷键不会启动文件管理器。

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
10. **全局快捷键**: 全局快捷键在任务栏初始化时自动注册，使用 `EventManager` 进行事件管理
11. **锁屏功能**: `Ctrl + L` 快捷键会调用 `LockScreen` 模块显示锁屏界面，需要 `LockScreen` 模块已加载

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API
- [NotificationManager.md](./NotificationManager.md) - 通知管理器 API
- [ThemeManager.md](./ThemeManager.md) - 主题管理器 API

