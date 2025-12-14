# AnimateManager API 文档

## 概述

`AnimateManager` 是 ZerOS 内核的动画管理器，负责管理系统动画，使用 anime.js 库进行动画。提供统一的动画接口，支持多种动画类别和动作。

## 依赖

- `anime.js` - 动画库（动态加载）
- `animate.css` - CSS 动画库（仅供程序内部使用）

## 动画类别

AnimateManager 支持以下动画类别：

- `DIALOG` - 对话框动画
- `BUTTON` - 按钮动画
- `WINDOW` - 窗口动画
- `MENU` - 菜单动画
- `NOTIFICATION` - 通知动画
- `KEYFRAMES` - CSS keyframes 动画

## API 方法

### 动画管理

#### `addAnimationClasses(element, category, action, customConfig)`

为元素添加动画类。

**参数**:
- `element` (HTMLElement|string): 目标元素或选择器
- `category` (string): 动画类别（如 'DIALOG', 'BUTTON'）
- `action` (string): 动画动作（如 'OPEN', 'CLOSE', 'HOVER'）
- `customConfig` (Object): 自定义配置（可选，会覆盖默认配置）

**返回值**: `Object|null` - 动画配置对象

**示例**:
```javascript
// 为对话框添加打开动画
const dialog = document.querySelector('.dialog');
AnimateManager.addAnimationClasses(dialog, 'DIALOG', 'OPEN');

// 使用自定义配置
AnimateManager.addAnimationClasses(button, 'BUTTON', 'HOVER', {
    duration: 500,
    easing: 'easeInOutQuad'
});
```

#### `getAnimationDuration(category, action)`

获取动画时长。

**参数**:
- `category` (string): 动画类别
- `action` (string): 动画动作

**返回值**: `number` - 动画时长（毫秒）

**示例**:
```javascript
const duration = AnimateManager.getAnimationDuration('DIALOG', 'OPEN');
console.log(`对话框打开动画时长: ${duration}ms`);
```

#### `stopAnimation(element)`

停止元素的动画。

**参数**:
- `element` (HTMLElement|string): 目标元素或选择器

**示例**:
```javascript
AnimateManager.stopAnimation('.dialog');
```

#### `removeAnimationClasses(element)`

移除元素的动画类。

**参数**:
- `element` (HTMLElement|string): 目标元素或选择器

**示例**:
```javascript
AnimateManager.removeAnimationClasses('.dialog');
```

### 动画库管理

#### `ensureAnimeLoaded()`

确保 anime.js 已加载。

**返回值**: `Promise<Function>` - anime.js 函数

**示例**:
```javascript
AnimateManager.ensureAnimeLoaded().then((anime) => {
    // anime.js 已加载，可以使用
    anime('.element', {
        opacity: [0, 1],
        duration: 1000
    });
});
```

#### `getAnimeInstance()`

获取 anime.js 实例（同步）。

**返回值**: `Function|null` - anime.js 函数或 null

**示例**:
```javascript
const anime = AnimateManager.getAnimeInstance();
if (anime) {
    anime('.element', { opacity: [0, 1] });
}
```

#### `getAnimation(category, action)`

获取动画配置。

**参数**:
- `category` (string): 动画类别
- `action` (string): 动画动作

**返回值**: `Object|null` - 动画配置对象

**动画配置对象结构**:
```javascript
{
    duration: number,      // 动画时长（毫秒）
    easing: string,        // 缓动函数
    opacity: Array,        // 透明度 [from, to]
    scale: Array,          // 缩放 [from, to]
    translateX: Array,     // X 轴位移 [from, to]
    translateY: Array,    // Y 轴位移 [from, to]
    rotate: Array,        // 旋转 [from, to]
    filter: Array         // 滤镜 [from, to]
}
```

## 使用示例

### 示例 1: 对话框动画

```javascript
// 打开对话框
const dialog = document.querySelector('.dialog');
AnimateManager.addAnimationClasses(dialog, 'DIALOG', 'OPEN');

// 关闭对话框
AnimateManager.addAnimationClasses(dialog, 'DIALOG', 'CLOSE');
```

### 示例 2: 按钮悬停动画

```javascript
const button = document.querySelector('.button');
button.addEventListener('mouseenter', () => {
    AnimateManager.addAnimationClasses(button, 'BUTTON', 'HOVER');
});

button.addEventListener('mouseleave', () => {
    AnimateManager.stopAnimation(button);
});
```

### 示例 3: 窗口动画

```javascript
// 窗口打开
AnimateManager.addAnimationClasses(windowElement, 'WINDOW', 'OPEN');

// 窗口关闭
AnimateManager.addAnimationClasses(windowElement, 'WINDOW', 'CLOSE');

// 窗口最小化
AnimateManager.addAnimationClasses(windowElement, 'WINDOW', 'MINIMIZE');

// 窗口恢复
AnimateManager.addAnimationClasses(windowElement, 'WINDOW', 'RESTORE');
```

### 示例 4: 自定义动画

```javascript
// 使用自定义配置
AnimateManager.addAnimationClasses(element, 'DIALOG', 'OPEN', {
    duration: 800,
    easing: 'spring(1, 100, 8, 0)',
    opacity: [0, 1],
    scale: [0.8, 1],
    translateY: [-20, 0]
});
```

### 示例 5: 直接使用 anime.js

```javascript
// 确保 anime.js 已加载
AnimateManager.ensureAnimeLoaded().then((anime) => {
    // 直接使用 anime.js
    anime('.element', {
        opacity: [0, 1],
        scale: [0.5, 1],
        duration: 1000,
        easing: 'easeOutCubic'
    });
});
```

### 示例 6: CSS Keyframes 动画

```javascript
// 应用 CSS keyframes 动画
AnimateManager.addAnimationClasses(element, 'KEYFRAMES', 'NETWORK_PULSE');
```

## 动画预设

AnimateManager 提供了多种动画预设：

### DIALOG 类别
- `OPEN` - 打开动画
- `CLOSE` - 关闭动画

### BUTTON 类别
- `HOVER` - 悬停动画
- `CLICK` - 点击动画

### WINDOW 类别
- `OPEN` - 打开动画
- `CLOSE` - 关闭动画
- `MINIMIZE` - 最小化动画
- `RESTORE` - 恢复动画

### MENU 类别
- `OPEN` - 打开动画
- `CLOSE` - 关闭动画

### NOTIFICATION 类别
- `SHOW` - 显示动画
- `HIDE` - 隐藏动画

### KEYFRAMES 类别
- `NETWORK_PULSE` - 网络脉冲动画

## 动画时长常量

```javascript
const ANIMATE_DURATIONS = {
    FAST: 150,      // 快速
    NORMAL: 300,    // 正常
    SLOW: 500,      // 慢速
    DEFAULT: 300    // 默认
};
```

## 注意事项

1. **anime.js 加载**: anime.js 是动态加载的，首次使用时可能需要等待加载完成
2. **元素验证**: 确保元素存在且有效，否则动画会失败
3. **动画停止**: 在应用新动画前，建议先停止旧动画
4. **性能**: 大量元素同时动画可能影响性能，建议限制同时动画的元素数量
5. **CSS 变量**: 某些动画可能依赖 CSS 变量，确保主题已正确应用

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [NotificationManager.md](./NotificationManager.md) - 通知管理器 API

