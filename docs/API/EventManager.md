# EventManager API 文档

## 概述

`EventManager` 是 ZerOS 内核的事件管理器，统一管理所有菜单、弹出层、窗口拖动、拉伸和多任务选择器事件。确保点击桌面/gui-container 时能正确关闭所有菜单。

## 依赖

- `KernelLogger` - 内核日志系统（用于日志输出）

## 初始化

事件管理器在首次使用时自动初始化：

```javascript
EventManager.init();
```

## API 方法

### 菜单管理

#### `registerMenu(menuId, menu, closeCallback, excludeSelectors)`

注册一个菜单，当点击外部时自动关闭。

**参数**:
- `menuId` (string): 菜单唯一标识
- `menu` (HTMLElement): 菜单元素
- `closeCallback` (Function): 关闭回调函数
- `excludeSelectors` (Array<string>): 排除的选择器列表（可选，点击这些元素时不关闭菜单）

**示例**:
```javascript
const menu = document.querySelector('.context-menu');
EventManager.registerMenu('my-menu', menu, () => {
    menu.classList.remove('visible');
}, ['.menu-trigger']);
```

#### `unregisterMenu(menuId)`

注销一个菜单。

**参数**:
- `menuId` (string): 菜单唯一标识

**示例**:
```javascript
EventManager.unregisterMenu('my-menu');
```

### 窗口拖动

#### `registerDrag(windowId, element, window, state, onDragStart, onDrag, onDragEnd, excludeSelectors)`

注册窗口拖动。

**参数**:
- `windowId` (string): 窗口唯一标识
- `element` (HTMLElement): 可拖动元素（通常是窗口标题栏）
- `window` (HTMLElement): 窗口元素
- `state` (Object): 状态对象（用于存储拖动状态）
- `onDragStart` (Function): 拖动开始回调 `(e) => {}`
- `onDrag` (Function): 拖动中回调 `(e) => {}`
- `onDragEnd` (Function): 拖动结束回调 `(e) => {}`
- `excludeSelectors` (Array<string>): 排除的选择器列表（可选）

**示例**:
```javascript
const state = { isDragging: false, startX: 0, startY: 0 };
EventManager.registerDrag(
    'window-1',
    titleBar,
    windowElement,
    state,
    (e) => {
        state.isDragging = true;
        state.startX = e.clientX - windowElement.offsetLeft;
        state.startY = e.clientY - windowElement.offsetTop;
    },
    (e) => {
        if (state.isDragging) {
            windowElement.style.left = (e.clientX - state.startX) + 'px';
            windowElement.style.top = (e.clientY - state.startY) + 'px';
        }
    },
    (e) => {
        state.isDragging = false;
    }
);
```

#### `unregisterDrag(windowId)`

注销窗口拖动。

**参数**:
- `windowId` (string): 窗口唯一标识

**示例**:
```javascript
EventManager.unregisterDrag('window-1');
```

### 窗口拉伸

#### `registerResizer(resizerId, resizerElement, window, state, onResizeStart, onResize, onResizeEnd)`

注册窗口拉伸。

**参数**:
- `resizerId` (string): 拉伸器唯一标识
- `resizerElement` (HTMLElement): 拉伸元素（通常是窗口边缘）
- `window` (HTMLElement): 窗口元素
- `state` (Object): 状态对象（用于存储拉伸状态）
- `onResizeStart` (Function): 拉伸开始回调 `(e) => {}`
- `onResize` (Function): 拉伸中回调 `(e) => {}`
- `onResizeEnd` (Function): 拉伸结束回调 `(e) => {}`

**示例**:
```javascript
const state = { isResizing: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0 };
EventManager.registerResizer(
    'resizer-1',
    resizerElement,
    windowElement,
    state,
    (e) => {
        state.isResizing = true;
        state.startX = e.clientX;
        state.startY = e.clientY;
        state.startWidth = windowElement.offsetWidth;
        state.startHeight = windowElement.offsetHeight;
    },
    (e) => {
        if (state.isResizing) {
            const deltaX = e.clientX - state.startX;
            const deltaY = e.clientY - state.startY;
            windowElement.style.width = (state.startWidth + deltaX) + 'px';
            windowElement.style.height = (state.startHeight + deltaY) + 'px';
        }
    },
    (e) => {
        state.isResizing = false;
    }
);
```

#### `unregisterResizer(resizerId)`

注销窗口拉伸。

**参数**:
- `resizerId` (string): 拉伸器唯一标识

**示例**:
```javascript
EventManager.unregisterResizer('resizer-1');
```

### 多任务选择器

#### `registerSelector(selectorId, iconElement, selectorElement, onShow, onHide, onClickOutside, showDelay, hideDelay)`

注册多任务选择器（任务栏程序图标悬停显示）。

**参数**:
- `selectorId` (string): 选择器唯一标识
- `iconElement` (HTMLElement): 图标元素（触发元素）
- `selectorElement` (HTMLElement): 选择器元素（显示的元素）
- `onShow` (Function): 显示回调 `() => {}`
- `onHide` (Function): 隐藏回调 `() => {}`
- `onClickOutside` (Function): 点击外部回调 `() => {}`（可选）
- `showDelay` (number): 显示延迟（毫秒，默认 300）
- `hideDelay` (number): 隐藏延迟（毫秒，默认 200）

**示例**:
```javascript
EventManager.registerSelector(
    'selector-1',
    iconElement,
    selectorElement,
    () => {
        selectorElement.style.display = 'block';
    },
    () => {
        selectorElement.style.display = 'none';
    },
    null,
    300,
    200
);
```

#### `unregisterSelector(selectorId)`

注销多任务选择器。

**参数**:
- `selectorId` (string): 选择器唯一标识

**示例**:
```javascript
EventManager.unregisterSelector('selector-1');
```

## 使用示例

### 示例 1: 上下文菜单

```javascript
// 创建上下文菜单
const contextMenu = document.createElement('div');
contextMenu.className = 'context-menu';
contextMenu.innerHTML = `
    <div class="menu-item">复制</div>
    <div class="menu-item">粘贴</div>
    <div class="menu-item">删除</div>
`;
document.body.appendChild(contextMenu);

// 注册菜单
EventManager.registerMenu('context-menu', contextMenu, () => {
    contextMenu.classList.remove('visible');
}, ['.menu-trigger']);

// 显示菜单
function showContextMenu(x, y) {
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('visible');
}

// 程序退出时注销
__exit__: function() {
    EventManager.unregisterMenu('context-menu');
}
```

### 示例 2: 窗口拖动

```javascript
// 在窗口创建时注册拖动
function createWindow(pid, title) {
    const window = document.createElement('div');
    window.className = 'window';
    
    const titleBar = document.createElement('div');
    titleBar.className = 'window-title-bar';
    titleBar.textContent = title;
    window.appendChild(titleBar);
    
    const state = { isDragging: false, startX: 0, startY: 0 };
    
    EventManager.registerDrag(
        `window-${pid}`,
        titleBar,
        window,
        state,
        (e) => {
            state.isDragging = true;
            state.startX = e.clientX - window.offsetLeft;
            state.startY = e.clientY - window.offsetTop;
        },
        (e) => {
            if (state.isDragging) {
                window.style.left = (e.clientX - state.startX) + 'px';
                window.style.top = (e.clientY - state.startY) + 'px';
            }
        },
        (e) => {
            state.isDragging = false;
        }
    );
    
    return window;
}

// 窗口关闭时注销
function closeWindow(pid) {
    EventManager.unregisterDrag(`window-${pid}`);
}
```

### 示例 3: 窗口拉伸

```javascript
// 注册窗口拉伸
function registerWindowResize(window, resizerElement) {
    const state = { isResizing: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0 };
    
    EventManager.registerResizer(
        `resizer-${window.id}`,
        resizerElement,
        window,
        state,
        (e) => {
            state.isResizing = true;
            state.startX = e.clientX;
            state.startY = e.clientY;
            state.startWidth = window.offsetWidth;
            state.startHeight = window.offsetHeight;
        },
        (e) => {
            if (state.isResizing) {
                const deltaX = e.clientX - state.startX;
                const deltaY = e.clientY - state.startY;
                window.style.width = (state.startWidth + deltaX) + 'px';
                window.style.height = (state.startHeight + deltaY) + 'px';
            }
        },
        (e) => {
            state.isResizing = false;
        }
    );
}
```

## 注意事项

1. **自动初始化**: 事件管理器在首次使用时自动初始化
2. **全局事件**: 事件管理器使用全局事件监听器，避免重复注册
3. **菜单关闭**: 点击桌面或 gui-container 时会自动关闭所有可见菜单
4. **状态对象**: 拖动和拉伸需要使用状态对象来存储中间状态
5. **注销**: 程序退出或元素销毁时应该注销相关事件，避免内存泄漏
6. **排除选择器**: 可以指定排除的选择器，避免误触发关闭

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [GUIManager.md](./GUIManager.md) - GUI 管理器 API

