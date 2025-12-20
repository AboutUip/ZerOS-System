# LockScreen API 文档

## 概述

`LockScreen` 是 ZerOS 内核的锁屏界面驱动，提供 Windows 11 风格的登录界面。负责在系统启动时显示锁屏界面，用户登录后进入系统桌面。支持密码验证、用户切换、随机背景等功能。

## 依赖

- `UserControl` - 用户控制系统（用于用户认证）
- `LStorage` - 本地存储（用于保存用户数据）
- `TaskbarManager` - 任务栏管理器（登录后初始化）
- `NotificationManager` - 通知管理器（登录后初始化）

## 初始化

锁屏界面在系统启动时自动初始化：

```javascript
LockScreen.init();
```

## API 方法

### 初始化

#### `init()`

初始化锁屏界面，创建锁屏容器并设置随机背景。

**示例**:
```javascript
LockScreen.init();
```

**注意**: 如果锁屏已初始化，此方法会跳过重复初始化。

### 内部方法（供系统调用）

以下方法主要用于系统内部调用，不建议程序直接使用：

#### `_hideLockScreen()`

隐藏锁屏界面并显示系统桌面。

**示例**:
```javascript
LockScreen._hideLockScreen();
```

#### `_updateTime()`

更新锁屏上的时间显示。

**示例**:
```javascript
LockScreen._updateTime();
```

#### `_updateUserInfo()`

更新锁屏上的用户信息（用户名、头像）。

**返回值**: `Promise<void>`

**示例**:
```javascript
await LockScreen._updateUserInfo();
```

#### `_setRandomBackground()`

设置随机背景图片（从 `system/assets/start/` 目录随机选择）。

**示例**:
```javascript
LockScreen._setRandomBackground();
```

#### `_showPasswordInput()`

显示密码输入框或登录按钮（根据用户是否有密码）。

**示例**:
```javascript
LockScreen._showPasswordInput();
```

#### `_handleLogin(password)`

处理用户登录。

**参数**:
- `password` (string, 可选): 用户密码

**返回值**: `Promise<void>`

**示例**:
```javascript
await LockScreen._handleLogin('password123');
```

#### `_showLoadingOverlay(message)`

显示加载蒙版。

**参数**:
- `message` (string, 可选): 加载提示消息（默认: '正在验证...'）

**示例**:
```javascript
LockScreen._showLoadingOverlay('正在登录...');
```

#### `_hideLoadingOverlay()`

隐藏加载蒙版。

**示例**:
```javascript
LockScreen._hideLoadingOverlay();
```

#### `_toggleUserList()`

切换用户列表显示/隐藏。

**示例**:
```javascript
LockScreen._toggleUserList();
```

#### `_switchUser(username)`

切换锁屏上显示的用户。

**参数**:
- `username` (string): 用户名

**返回值**: `Promise<void>`

**示例**:
```javascript
await LockScreen._switchUser('TestUser');
```

## 功能特性

### 1. 随机背景

锁屏界面会从 `system/assets/start/` 目录随机选择背景图片：
- `bg1.jpg`
- `bg2.jpg`
- `bg3.jpg`

### 2. 时间显示

锁屏界面左上角显示当前时间和日期，每秒自动更新。

### 3. 用户信息显示

锁屏界面中央显示：
- 用户头像（如果用户设置了头像，否则显示默认 SVG 图标）
- 用户名
- 密码输入框（如果用户有密码）或登录按钮（如果用户无密码）

### 4. 用户切换

点击用户头像或用户名区域可以切换显示的用户，支持：
- 显示所有可用用户列表
- 显示用户头像和级别
- 显示密码锁定图标（如果用户有密码）

### 5. 密码验证

- 如果用户有密码，需要输入正确密码才能登录
- 如果用户无密码，点击登录按钮或按 Enter 键即可登录
- 密码错误时会显示错误提示

### 6. 加载动画

在以下情况显示加载蒙版：
- 按下任意键显示登录界面时
- 输入密码时
- 登录过程中

## 使用场景

### 系统启动

锁屏界面在系统启动时自动显示，用户需要登录后才能进入桌面：

```javascript
// 在 bootloader/starter.js 中
if (typeof LockScreen !== 'undefined' && typeof LockScreen.init === 'function') {
    LockScreen.init();
}
```

### 手动锁定屏幕

通过 `TaskbarManager` 的 `Ctrl + L` 快捷键可以手动锁定屏幕：

```javascript
// 在 taskbarManager.js 中
TaskbarManager._lockScreen();
```

## 样式定制

锁屏界面的样式定义在 `test/core.css` 中，包括：

- `.lockscreen` - 锁屏容器
- `.lockscreen-time-container` - 时间显示容器
- `.lockscreen-login-container` - 登录区域容器
- `.lockscreen-avatar` - 用户头像
- `.lockscreen-username` - 用户名
- `.lockscreen-password-input` - 密码输入框
- `.lockscreen-login-button` - 登录按钮
- `.lockscreen-loading-overlay` - 加载蒙版

## 注意事项

1. **初始化顺序**: 锁屏界面依赖 `UserControl` 和 `LStorage`，确保这些模块已加载
2. **背景图片**: 背景图片应存放在 `system/assets/start/` 目录
3. **用户头像**: 用户头像通过 `UserControl.getAvatarPath()` 获取，存储在 `D:/cache/` 目录
4. **密码验证**: 密码验证通过 `UserControl.login()` 进行，使用 MD5 加密
5. **登录后初始化**: 登录成功后会初始化 `TaskbarManager` 和 `NotificationManager`

## 相关文档

- [UserControl.md](./UserControl.md) - 用户控制系统 API
- [TaskbarManager.md](./TaskbarManager.md) - 任务栏管理器 API
- [LStorage.md](./LStorage.md) - 本地存储 API

