# ThemeManager API 文档

## 概述

`ThemeManager` 是 ZerOS 内核的主题管理器，负责统一管理整个系统的 GUI 主题与风格。支持主题（颜色）和风格（GUI 样式）的独立管理，以及桌面背景图管理。

## 依赖

- `LStorage` - 本地存储（用于保存主题设置）

## 初始化

主题管理器在系统启动时自动初始化：

```javascript
await ThemeManager.init();
```

## 存储键

```javascript
ThemeManager.STORAGE_KEY_THEME = 'system.theme';
ThemeManager.STORAGE_KEY_STYLE = 'system.style';
ThemeManager.STORAGE_KEY_DESKTOP_BACKGROUND = 'system.desktopBackground';
```

## API 方法

### 主题管理

#### `getCurrentTheme()`

获取当前主题。

**返回值**: `Object|null` - 当前主题配置对象

**主题对象结构**:
```javascript
{
    id: string,
    name: string,
    description: string,
    colors: {
        background: string,
        backgroundSecondary: string,
        backgroundTertiary: string,
        backgroundElevated: string,
        text: string,
        textSecondary: string,
        textMuted: string,
        primary: string,
        primaryLight: string,
        primaryDark: string,
        secondary: string,
        success: string,
        warning: string,
        error: string,
        // ... 更多颜色
    }
}
```

#### `getCurrentThemeId()`

获取当前主题 ID。

**返回值**: `string` - 当前主题 ID（默认：'default'）

#### `getAllThemes()`

获取所有主题列表。

**返回值**: `Array<Object>` - 主题列表（包含 id, name, description）

#### `registerTheme(themeId, theme)`

注册自定义主题。

**参数**:
- `themeId` (string): 主题 ID
- `theme` (Object): 主题配置对象

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
ThemeManager.registerTheme('my-theme', {
    id: 'my-theme',
    name: '我的主题',
    description: '自定义主题描述',
    colors: {
        background: '#000000',
        text: '#ffffff',
        primary: '#ff0000',
        // ... 更多颜色
    }
});
```

#### `onThemeChange(listener)`

监听主题变更。

**参数**:
- `listener` (Function): 回调函数 `(themeId, theme) => {}`

**返回值**: `Function` - 取消监听的函数

**示例**:
```javascript
const unsubscribe = ThemeManager.onThemeChange((themeId, theme) => {
    console.log(`主题已切换为: ${themeId}`);
    // 更新程序 UI
    updateUI(theme);
});

// 取消监听
unsubscribe();
```

### 风格管理

#### `getCurrentStyle()`

获取当前风格。

**返回值**: `Object|null` - 当前风格配置对象

**风格对象结构**:
```javascript
{
    id: string,
    name: string,
    description: string,
    styles: {
        windowBorderRadius: string,
        windowBackdropFilter: string,
        windowBoxShadowFocused: string,
        taskbarBackdropFilter: string,
        taskbarBoxShadow: string,
        // ... 更多样式
    }
}
```

#### `getCurrentStyleId()`

获取当前风格 ID。

**返回值**: `string` - 当前风格 ID（默认：'ubuntu'）

#### `getAllStyles()`

获取所有风格列表。

**返回值**: `Array<Object>` - 风格列表（包含 id, name, description）

#### `registerStyle(styleId, style)`

注册自定义风格。

**参数**:
- `styleId` (string): 风格 ID
- `style` (Object): 风格配置对象

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
ThemeManager.registerStyle('my-style', {
    id: 'my-style',
    name: '我的风格',
    description: '自定义风格描述',
    styles: {
        windowBorderRadius: '8px',
        windowBackdropFilter: 'blur(20px)',
        // ... 更多样式
    }
});
```

#### `onStyleChange(listener)`

监听风格变更。

**参数**:
- `listener` (Function): 回调函数 `(styleId, style) => {}`

**返回值**: `Function` - 取消监听的函数

**示例**:
```javascript
const unsubscribe = ThemeManager.onStyleChange((styleId, style) => {
    console.log(`风格已切换为: ${styleId}`);
    // 更新程序样式
    updateStyles(style);
});
```

### 桌面背景管理

#### `getCurrentDesktopBackground()`

获取当前桌面背景图 ID。

**返回值**: `string|null` - 当前桌面背景图 ID

#### `getAllDesktopBackgrounds()`

获取所有桌面背景图列表。

**返回值**: `Array<Object>` - 桌面背景图列表

**桌面背景图对象结构**:
```javascript
{
    id: string,
    name: string,
    description: string,
    path: string  // 背景图路径（相对路径或本地路径）
}
```

#### `getDesktopBackground(backgroundId)`

获取指定桌面背景图信息。

**参数**:
- `backgroundId` (string): 桌面背景图 ID

**返回值**: `Object|null` - 桌面背景图信息对象

#### `setDesktopBackground(backgroundId, save)`

设置桌面背景图。

**参数**:
- `backgroundId` (string): 桌面背景图 ID
- `save` (boolean, 可选): 是否保存到 LStorage（默认 true）

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await ThemeManager.setDesktopBackground('nature');
```

#### `setLocalImageAsBackground(imagePath, save)`

设置本地图片作为桌面背景（支持 JPG、PNG、GIF、WebP、SVG 等格式）。

**参数**:
- `imagePath` (string): 图片路径（C: 或 D: 开头的路径）
- `save` (boolean, 可选): 是否保存到 LStorage（默认 true）

**返回值**: `Promise<boolean>` - 是否成功

**支持的格式**:
- 静态图片：JPG、JPEG、PNG、WebP、SVG、BMP、ICO
- 动图：GIF（自动循环播放）

**示例**:
```javascript
// 设置本地 GIF 动图作为背景
await ThemeManager.setLocalImageAsBackground('D:/images/background.gif');

// 设置本地静态图片作为背景
await ThemeManager.setLocalImageAsBackground('D:/images/wallpaper.jpg');
```

**注意**:
- GIF 动图会自动循环播放，无需额外设置
- 本地背景信息会自动保存，系统重启后自动恢复
- 支持的图片格式会在设置前进行验证

## 使用示例

### 示例 1: 获取当前主题和风格

```javascript
// 获取当前主题
const theme = ThemeManager.getCurrentTheme();
if (theme) {
    console.log(`当前主题: ${theme.name}`);
    console.log(`主色调: ${theme.colors.primary}`);
}

// 获取当前风格
const style = ThemeManager.getCurrentStyle();
if (style) {
    console.log(`当前风格: ${style.name}`);
    console.log(`窗口圆角: ${style.styles.windowBorderRadius}`);
}
```

### 示例 2: 监听主题变更

```javascript
// 监听主题变更
ThemeManager.onThemeChange((themeId, theme) => {
    console.log(`主题已切换为: ${themeId}`);
    
    // 更新程序 UI
    const window = document.querySelector('.myapp-window');
    if (window) {
        window.style.backgroundColor = theme.colors.backgroundElevated;
        window.style.color = theme.colors.text;
        window.style.borderColor = theme.colors.border;
    }
});
```

### 示例 3: 注册自定义主题

```javascript
// 注册自定义主题
ThemeManager.registerTheme('dark-blue', {
    id: 'dark-blue',
    name: '深蓝主题',
    description: '深蓝色调主题',
    colors: {
        background: '#0a0e27',
        backgroundSecondary: '#141b3d',
        backgroundElevated: '#1e274d',
        text: '#e0e8ff',
        textSecondary: '#b8c5ff',
        primary: '#4a90e2',
        primaryLight: '#6ba3e8',
        primaryDark: '#2d7bd1',
        // ... 更多颜色
    }
});

// 应用主题（需要手动调用 _applyTheme，通常通过设置系统主题来应用）
// 注意：_applyTheme 是内部方法，通常通过系统设置来切换主题
```

### 示例 4: 在 CSS 中使用主题变量

```css
.myapp-window {
    background: var(--theme-background-elevated, rgba(37, 43, 53, 0.98));
    border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
    color: var(--theme-text, #d7e0dd);
}

.myapp-button {
    background: var(--theme-primary, #8b5cf6);
    color: var(--theme-text-on-primary, #ffffff);
}

.myapp-button:hover {
    background: var(--theme-primary-hover, #7c3aed);
}
```

## CSS 变量

ThemeManager 会在 `:root` 上设置 CSS 变量，程序可以通过这些变量使用主题颜色：

**背景颜色**:
- `--theme-background`
- `--theme-background-secondary`
- `--theme-background-tertiary`
- `--theme-background-elevated`

**文本颜色**:
- `--theme-text`
- `--theme-text-secondary`
- `--theme-text-muted`

**主题色**:
- `--theme-primary`
- `--theme-primary-light`
- `--theme-primary-dark`
- `--theme-primary-hover`
- `--theme-secondary`

**状态色**:
- `--theme-success`
- `--theme-warning`
- `--theme-error`
- `--theme-info`

**样式变量**:
- `--style-window-border-radius`
- `--style-window-backdrop-filter`
- `--style-window-box-shadow-focused`
- `--style-taskbar-backdrop-filter`
- `--style-taskbar-box-shadow`

## 内置主题和风格

### 内置主题

- `default` - 默认主题（深色科技风格）

### 内置风格

- `ubuntu` - Ubuntu 风格（默认）
- `windows` - Windows 风格
- `macos` - macOS 风格

## 锁屏背景管理

锁屏背景管理功能通过主题管理器程序（ThemeAnimator）提供，支持以下功能：

- **随机锁屏壁纸开关**：启用/禁用随机背景功能
- **自定义锁屏背景**：用户可以选择固定锁屏背景，独立于桌面背景管理
- **发送到锁屏背景**：从桌面背景页面可以发送背景到锁屏，自动去重
- **锁屏背景删除**：支持删除发送过来的锁屏背景（默认背景不可删除）

**存储键**：
- `system.lockscreenRandomBg`：是否启用随机锁屏壁纸（默认 `true`）
- `system.lockscreenBackground`：自定义锁屏背景路径
- `system.lockscreenTimeComponent`：是否显示时间组件（默认 `true`）
- `system.lockscreenDailyQuote`：是否显示每日一言组件（默认 `true`）

**相关文档**：
- [LockScreen.md](./LockScreen.md) - 锁屏界面 API

## 注意事项

1. **初始化**: 主题管理器在系统启动时自动初始化，通常不需要手动调用 `init()`
2. **持久化**: 主题和风格设置会自动保存到 LStorage
3. **CSS 变量**: 主题变更时会自动更新 CSS 变量，程序无需手动处理
4. **自定义主题**: 注册自定义主题后，需要通过系统设置来应用
5. **桌面背景**: 桌面背景图设置会自动保存和应用
6. **锁屏背景**: 锁屏背景管理通过主题管理器程序进行，锁屏背景独立于桌面背景存储

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [LockScreen.md](./LockScreen.md) - 锁屏界面 API
- [LStorage.md](./LStorage.md) - 本地存储 API

