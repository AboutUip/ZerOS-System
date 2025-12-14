# NotificationManager API 文档

## 概述

`NotificationManager` 是 ZerOS 内核的通知管理系统，负责系统通知的创建、显示、管理和交互。支持两种通知类型：快照（snapshot）和依赖（dependent），并提供水滴展开动画效果。

## 依赖

- `TaskbarManager` - 任务栏管理器（用于获取任务栏位置和显示通知图标）
- `ProcessManager` - 进程管理器（用于获取程序信息）
- `PermissionManager` - 权限管理器（用于权限检查和验证）
- `GUIManager` - GUI 管理器（用于窗口管理）
- `AnimateManager` - 动画管理器（用于水滴动画效果）

## 初始化

通知管理器在系统启动时自动初始化，无需手动调用。

```javascript
// 自动初始化（在 BootLoader 中）
await NotificationManager.init();
```

## 配置常量

通知管理器提供了 `CONFIG` 常量对象，包含所有配置项：

```javascript
NotificationManager.CONFIG = {
    // 容器配置
    CONTAINER_WIDTH: 380,
    CONTAINER_TOP: 20,
    CONTAINER_SIDE: 20,
    CONTAINER_MIN_HEIGHT: 100,
    CONTAINER_Z_INDEX: 10000,
    
    // 蒙版层配置
    OVERLAY_WIDTH: '45vw',
    OVERLAY_Z_INDEX: 9998,
    
    // 动画配置
    ANIMATION: {
        SHOW_DURATION: 250,
        HIDE_DURATION: 200,
        OVERLAY_FADE: 150,
        DEPENDENT_EXPAND: 300,
        DEPENDENT_REMOVE: 200,
        SNAPSHOT_REMOVE: 150,
        GLOBAL_CHECK_DELAY: 150,
        MOUSE_LEAVE_DELAY: 100
    },
    
    // 样式配置
    STYLES: {
        NOTIFICATION_PADDING_SNAPSHOT: '16px',
        NOTIFICATION_PADDING_DEPENDENT: '12px',
        NOTIFICATION_GAP_SNAPSHOT: '12px',
        NOTIFICATION_GAP_DEPENDENT: '0',
        CLOSE_BUTTON_SIZE: 24,
        CLOSE_BUTTON_SIZE_CONTAINER: 32,
        BORDER_RADIUS: '16px',
        BLUR_AMOUNT: 20
    },
    
    // 水滴动画初始状态
    WATER_DROP: {
        INITIAL_SIZE: 50,
        INITIAL_SCALE: 0.2,
        INITIAL_TRANSLATE_X: 80,
        TARGET_BORDER_RADIUS: '16px'
    }
};
```

## 通知类型

### snapshot（快照）

独立通知，显示标题和内容，有标题栏和关闭按钮。适用于一次性通知消息。

**特点**：
- 显示标题栏（包含标题和关闭按钮）
- 支持自动关闭（可设置时长）
- 使用滑入动画

### dependent（依赖）

依赖通知，紧贴在快照通知下方，从圆形展开为矩形。适用于程序持续显示的内容（如音乐播放器）。

**特点**：
- 不显示标题栏
- 从圆形小尺寸展开为正常矩形
- 支持关闭回调
- 使用水滴展开动画

## API 方法

### 创建通知

#### `createNotification(pid, options)`

创建通知。**需要 `SYSTEM_NOTIFICATION` 权限**，会自动进行权限检查。

**参数**:
- `pid` (number): 程序 PID
- `options` (Object): 通知选项
  - `type` (string): 通知类型，`'snapshot'` 或 `'dependent'`，默认 `'snapshot'`
  - `title` (string): 通知标题（可选，仅 snapshot 类型）
  - `content` (string|HTMLElement): 通知内容，可以是 HTML 字符串或 HTMLElement
  - `duration` (number): 自动关闭时长（毫秒，0 表示不自动关闭，可选）
  - `onClose` (Function): 关闭回调（可选，仅 dependent 类型），`(notificationId, pid) => {}`

**返回值**: `Promise<string>` - 通知 ID

**权限检查**:
- 创建通知需要 `SYSTEM_NOTIFICATION` 权限
- 如果程序没有权限，会弹出权限请求对话框
- 如果用户拒绝权限，方法会抛出错误
- 程序必须在 `__info__` 中声明 `SYSTEM_NOTIFICATION` 权限

**示例**:
```javascript
// 创建快照通知（异步，需要 await）
try {
    const notificationId = await NotificationManager.createNotification(this.pid, {
        type: 'snapshot',
        title: '系统通知',
        content: '这是一条通知消息',
        duration: 5000  // 5秒后自动关闭
    });
    console.log('通知已创建:', notificationId);
} catch (e) {
    if (e.message.includes('没有权限')) {
        console.error('权限被拒绝，无法创建通知');
    } else {
        console.error('创建通知失败:', e.message);
    }
}

// 创建依赖通知（异步，需要 await）
const contentElement = document.createElement('div');
contentElement.innerHTML = '<div>音乐播放器内容</div>';

try {
    const dependentId = await NotificationManager.createNotification(this.pid, {
        type: 'dependent',
        content: contentElement,
        onClose: (notificationId, pid) => {
            console.log('通知已关闭:', notificationId);
        }
    });
    console.log('依赖通知已创建:', dependentId);
} catch (e) {
    console.error('创建依赖通知失败:', e.message);
}
```

### 移除通知

#### `removeNotification(notificationId, silent)`

移除通知。**需要 `SYSTEM_NOTIFICATION` 权限**，会自动进行权限检查。

**参数**:
- `notificationId` (string): 通知 ID
- `silent` (boolean): 是否静默移除（不触发回调），默认 `false`

**返回值**: `Promise<boolean>` - 是否成功

**权限检查**:
- 移除通知需要 `SYSTEM_NOTIFICATION` 权限
- 如果程序没有权限，会弹出权限请求对话框
- 如果用户拒绝权限，方法会抛出错误
- 程序必须在 `__info__` 中声明 `SYSTEM_NOTIFICATION` 权限

**示例**:
```javascript
// 移除通知（触发回调）
NotificationManager.removeNotification(notificationId);

// 静默移除（不触发回调）
NotificationManager.removeNotification(notificationId, true);
```

### 更新通知内容

#### `updateNotificationContent(notificationId, content)`

更新通知内容。

**参数**:
- `notificationId` (string): 通知 ID
- `content` (string|HTMLElement): 新内容

**示例**:
```javascript
// 更新为 HTML 字符串
NotificationManager.updateNotificationContent(notificationId, '<div>新内容</div>');

// 更新为 HTMLElement
const newElement = document.createElement('div');
newElement.textContent = '新内容';
NotificationManager.updateNotificationContent(notificationId, newElement);
```

### 获取通知内容容器

#### `getNotificationContentContainer(notificationId)`

获取通知内容容器（用于动态更新内容）。

**参数**:
- `notificationId` (string): 通知 ID

**返回值**: `HTMLElement|null` - 内容容器元素

**示例**:
```javascript
const container = NotificationManager.getNotificationContentContainer(notificationId);
if (container) {
    // 动态更新内容
    const progressBar = container.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.style.width = '50%';
    }
}
```

### 查询通知

#### `getNotificationCount()`

获取通知数量。

**返回值**: `number` - 通知数量

#### `getNotificationsByPid(pid)`

获取程序的所有通知 ID。

**参数**:
- `pid` (number): 程序 PID

**返回值**: `Array<string>` - 通知 ID 数组

#### `getNotificationInfo(notificationId)`

获取通知信息。

**参数**:
- `notificationId` (string): 通知 ID

**返回值**: `Object|null` - 通知信息对象
```javascript
{
    id: string,
    pid: number,
    type: string,
    title: string,
    duration: number,
    createdAt: number
}
```

#### `getAllNotifications(pid)`

获取所有通知信息。

**参数**:
- `pid` (number|null): 可选，如果提供则只返回该程序的通知

**返回值**: `Array<Object>` - 通知信息数组

#### `hasNotification(notificationId)`

检查通知是否存在。

**参数**:
- `notificationId` (string): 通知 ID

**返回值**: `boolean` - 是否存在

### 清理通知

#### `cleanupProgramNotifications(pid, triggerCallbacks, onlyDependent)`

清理程序的所有通知。

**参数**:
- `pid` (number): 程序 PID
- `triggerCallbacks` (boolean): 是否触发依赖类型的关闭回调，默认 `false`
- `onlyDependent` (boolean): 是否只清理依赖类型的通知，默认 `true`

**示例**:
```javascript
// 只清理依赖类型通知，不触发回调
NotificationManager.cleanupProgramNotifications(this.pid, false, true);

// 清理所有通知，触发回调
NotificationManager.cleanupProgramNotifications(this.pid, true, false);
```

### 通知栏控制

#### `toggleNotificationContainer()`

切换通知栏显示状态。

**示例**:
```javascript
// 切换显示/隐藏
NotificationManager.toggleNotificationContainer();
```

#### `isShowing()`

获取通知栏显示状态。

**返回值**: `boolean` - 是否正在显示

**示例**:
```javascript
if (NotificationManager.isShowing()) {
    console.log('通知栏正在显示');
}
```

### 调试方法

#### `checkStatus()`

检查初始化状态（用于调试）。

**返回值**: `Object` - 状态信息对象
```javascript
{
    initialized: boolean,
    containerExists: boolean,
    hoverZoneExists: boolean,
    emptyStateExists: boolean,
    notificationCount: number,
    isShowing: boolean,
    hoverZonePosition: Object,
    containerPosition: Object,
    taskbarPosition: string
}
```

#### `testShow()`

手动触发显示（用于测试）。

#### `testHide()`

手动触发隐藏（用于测试）。

## 使用示例

### 示例 1: 创建简单的快照通知

```javascript
// 在程序中使用
const notificationId = NotificationManager.createNotification(this.pid, {
    type: 'snapshot',
    title: '操作成功',
    content: '文件已保存',
    duration: 3000  // 3秒后自动关闭
});
```

### 示例 2: 创建音乐播放器通知（依赖类型）

```javascript
// 创建音乐播放器通知
const createMusicPlayerNotification = () => {
    const content = document.createElement('div');
    content.className = 'music-player-content';
    content.innerHTML = `
        <div class="cover">
            <img src="cover.jpg" alt="Cover">
        </div>
        <div class="info">
            <div class="song">歌曲名称</div>
            <div class="artist">艺术家</div>
        </div>
        <div class="controls">
            <button class="prev">⏮</button>
            <button class="play">▶</button>
            <button class="next">⏭</button>
        </div>
    `;
    
    const notificationId = NotificationManager.createNotification(this.pid, {
        type: 'dependent',
        content: content,
        onClose: (notificationId, pid) => {
            // 清理资源
            console.log('音乐播放器通知已关闭');
        }
    });
    
    // 保存通知 ID 以便后续更新
    this._notificationId = notificationId;
};

// 更新播放进度
const updateProgress = (progress) => {
    const container = NotificationManager.getNotificationContentContainer(this._notificationId);
    if (container) {
        const progressBar = container.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
    }
};
```

### 示例 3: 程序退出时清理通知

```javascript
__exit__: async function() {
    // 清理所有通知（只清理依赖类型，触发回调）
    NotificationManager.cleanupProgramNotifications(this.pid, true, true);
    
    // 其他清理逻辑...
}
```

## 动画效果

### 通知栏容器动画

通知栏容器使用水滴展开动画：
- 从屏幕边缘滑入（带缩放和透明度）
- 使用 AnimateManager（anime.js）实现
- 支持降级到 CSS 动画

### 依赖通知动画

依赖类型通知使用水滴展开动画：
- 初始状态：圆形小尺寸（50px），从右侧滑入
- 展开过程：从圆形变为矩形，从小尺寸变为正常尺寸
- 使用 AnimateManager（anime.js）实现
- 支持降级到 CSS 动画

## 任务栏集成

通知管理器与任务栏集成：
- 任务栏显示通知图标和数量徽章
- 点击图标打开/关闭通知栏
- 徽章数量实时更新（通过 `_triggerBadgeUpdate()` 方法）

## 注意事项

1. **通知 ID**: 每个通知都有唯一的 ID，格式为 `notification-{counter}`
2. **内容更新**: 使用 `getNotificationContentContainer()` 获取容器后，可以直接操作 DOM
3. **依赖通知**: 依赖类型通知的 `onClose` 回调在通知被移除时调用
4. **自动关闭**: 设置 `duration` 为 0 表示不自动关闭
5. **清理通知**: 程序退出时建议清理所有通知，避免内存泄漏

## 错误处理

通知管理器使用 `KernelLogger` 记录错误和警告：

```javascript
// 查看控制台日志
KernelLogger.setLevel(3);  // DEBUG 级别
```

常见错误：
- 通知容器未初始化：确保在系统启动后使用
- 通知不存在：检查通知 ID 是否正确
- 动画失败：自动降级到 CSS 动画

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [TaskbarManager.md](./TaskbarManager.md) - 任务栏管理器 API
- [AnimateManager.md](./AnimateManager.md) - 动画管理器 API

