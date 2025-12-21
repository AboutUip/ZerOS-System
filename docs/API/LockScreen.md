# LockScreen API 文档

## 概述

`LockScreen` 是 ZerOS 内核的锁屏界面驱动，提供 Windows 11 风格的登录界面。负责在系统启动时显示锁屏界面，用户登录后进入系统桌面。支持密码验证、用户切换、随机背景、自定义锁屏背景、时间组件、每日一言组件等功能。

## 依赖

- `UserControl` - 用户控制系统（用于用户认证）
- `LStorage` - 本地存储（用于保存用户数据和锁屏设置）
- `TaskbarManager` - 任务栏管理器（登录后初始化）
- `NotificationManager` - 通知管理器（登录后初始化）
- `CacheDrive` - 缓存驱动（用于每日一言缓存管理）
- `ProcessManager` - 进程管理器（用于调用内核API）

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

#### `_setBackground()`

设置锁屏背景图片。支持随机背景和自定义背景。

**功能说明**:
- 如果启用了随机锁屏壁纸（`system.lockscreenRandomBg` 为 `true`），从 `system/assets/start/` 目录随机选择背景
- 如果禁用了随机锁屏壁纸，使用用户选择的锁屏背景（`system.lockscreenBackground`）
- 支持本地路径（如 `D:/cache/lockscreen/xxx.png`）和网络路径
- 自动将本地路径转换为 PHP 服务路径

**示例**:
```javascript
LockScreen._setBackground();
```

#### `_setRandomBackground()`

设置随机背景图片（从 `system/assets/start/` 目录随机选择）。此方法已被 `_setBackground()` 替代，保留用于向后兼容。

**示例**:
```javascript
LockScreen._setRandomBackground();
```

#### `_loadDailyQuote()`

加载并显示每日一言。优先从缓存读取，如果缓存不存在则从API获取。

**功能说明**:
- 优先读取缓存：`Cache.get('system.dailyQuote')`
- 如果缓存不存在，从API获取：`https://api-v1.cenguigui.cn/api/yiyan2/`
- 显示后自动预加载下一句每日一言到缓存
- 使用后删除缓存中的每日一言

**返回值**: `Promise<void>`

**示例**:
```javascript
await LockScreen._loadDailyQuote();
```

#### `_preloadNextDailyQuote()`

预加载下一句每日一言到缓存。

**功能说明**:
- 检查缓存中是否已存在 `system.dailyQuote`
- 如果不存在，从API获取并保存到缓存
- 缓存使用 `Cache.set('system.dailyQuote', quote, { ttl: 0 })` 永久存储

**返回值**: `Promise<void>`

**示例**:
```javascript
await LockScreen._preloadNextDailyQuote();
```

#### `_createLockScreenContent()`

创建锁屏内容（时间组件、每日一言组件等）。

**功能说明**:
- 根据 `system.lockscreenTimeComponent` 设置显示/隐藏时间组件
- 根据 `system.lockscreenDailyQuote` 设置显示/隐藏每日一言组件
- 自动调用 `_loadDailyQuote()` 加载每日一言

**返回值**: `Promise<void>`

**示例**:
```javascript
await LockScreen._createLockScreenContent();
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

### 1. 锁屏背景管理

锁屏界面支持两种背景模式：

#### 随机锁屏壁纸（默认启用）
- 从 `system/assets/start/` 目录随机选择背景图片：
  - `bg1.jpg`
  - `bg2.jpg`
  - `bg3.jpg`
- 设置键：`system.lockscreenRandomBg`（boolean，默认 `true`）

#### 自定义锁屏背景
- 用户可以通过主题管理器程序选择固定锁屏背景
- 支持从桌面背景发送到锁屏背景
- 锁屏背景独立存储，删除桌面背景不影响锁屏背景
- 设置键：`system.lockscreenBackground`（string，背景路径）
- 存储位置：`D:/cache/lockscreen/` 目录

**背景路径转换**：
- 本地路径（如 `D:/cache/lockscreen/file.png`）会自动转换为 PHP 服务路径（`/system/service/DISK/D/cache/lockscreen/file.png`）
- 支持静态图片（JPG、PNG、GIF、WebP等）和动态壁纸（MP4）

### 2. 时间组件

锁屏界面左上角显示当前时间和日期，每秒自动更新。

**控制开关**：
- 设置键：`system.lockscreenTimeComponent`（boolean，默认 `true`）
- 可通过主题管理器程序的锁屏页面进行开关控制

### 3. 每日一言组件

锁屏界面支持显示每日一言，提供每日励志语句。

**功能特性**：
- 自动从API获取每日一言：`https://api-v1.cenguigui.cn/api/yiyan2/`
- 智能缓存管理：
  - 系统启动时自动预加载下一句每日一言到缓存
  - 显示时优先使用缓存，使用后删除缓存
  - 自动预加载下一句，确保每次显示都有内容
- 缓存键：`system.dailyQuote`
- 控制开关：`system.lockscreenDailyQuote`（boolean，默认 `true`）

**控制开关**：
- 设置键：`system.lockscreenDailyQuote`（boolean，默认 `true`）
- 可通过主题管理器程序的锁屏页面进行开关控制

### 4. 用户信息显示

锁屏界面中央显示：
- 用户头像（如果用户设置了头像，否则显示默认 SVG 图标）
- 用户名
- 密码输入框（如果用户有密码）或登录按钮（如果用户无密码）

### 5. 用户切换

点击用户头像或用户名区域可以切换显示的用户，支持：
- 显示所有可用用户列表
- 显示用户头像和级别
- 显示密码锁定图标（如果用户有密码）

### 6. 密码验证

- 如果用户有密码，需要输入正确密码才能登录
- 如果用户无密码，点击登录按钮或按 Enter 键即可登录
- 密码错误时会显示错误提示

### 7. 加载动画

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

## 存储键说明

锁屏界面使用以下 LStorage 键存储设置：

- `system.lockscreenRandomBg` (boolean): 是否启用随机锁屏壁纸（默认 `true`）
- `system.lockscreenBackground` (string): 自定义锁屏背景路径（当随机壁纸关闭时使用）
- `system.lockscreenTimeComponent` (boolean): 是否显示时间组件（默认 `true`）
- `system.lockscreenDailyQuote` (boolean): 是否显示每日一言组件（默认 `true`）

## 注意事项

1. **初始化顺序**: 锁屏界面依赖 `UserControl`、`LStorage`、`CacheDrive` 和 `ProcessManager`，确保这些模块已加载
2. **背景图片**: 
   - 默认背景图片存放在 `system/assets/start/` 目录
   - 自定义锁屏背景存放在 `D:/cache/lockscreen/` 目录
   - 本地路径会自动转换为 PHP 服务路径
3. **用户头像**: 用户头像通过 `UserControl.getAvatarPath()` 获取，存储在 `D:/cache/` 目录
4. **密码验证**: 密码验证通过 `UserControl.login()` 进行，使用 MD5 加密
5. **登录后初始化**: 登录成功后会初始化 `TaskbarManager` 和 `NotificationManager`
6. **每日一言缓存**: 使用 `CacheDrive` 进行缓存管理，缓存键为 `system.dailyQuote`
7. **组件显示控制**: 时间组件和每日一言组件的显示状态通过 LStorage 设置控制
8. **背景路径转换**: 所有本地文件路径（如 `D:/cache/...`）在显示前会自动转换为 PHP 服务路径（`/system/service/DISK/D/cache/...`）

## 相关文档

- [UserControl.md](./UserControl.md) - 用户控制系统 API
- [TaskbarManager.md](./TaskbarManager.md) - 任务栏管理器 API
- [LStorage.md](./LStorage.md) - 本地存储 API
- [CacheDrive.md](./CacheDrive.md) - 缓存驱动 API（用于每日一言缓存）
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API（用于调用内核API）
- [ThemeManager.md](./ThemeManager.md) - 主题管理器 API（锁屏背景管理通过主题管理器程序进行）

