# EventManager API 文档

## ⚠️ 重要提示

**所有事件处理必须通过 `EventManager` 进行统一管理**。这是 ZerOS 系统的强制要求。

- ✅ **必须使用**：`EventManager.registerEventHandler()` 注册全局事件
- ✅ **必须使用**：`EventManager.registerElementEvent()` 注册元素特定事件（如 `mouseenter`, `mouseleave`, `load`, `error`）
- ❌ **禁止直接使用**：`addEventListener`（会被警告，不推荐）

**原因**：
- 统一管理所有事件，支持事件优先级和传播控制
- 进程退出时自动清理事件监听器，防止内存泄漏
- 提供统一的事件传播控制 API
- 支持多程序注册同一事件，按优先级执行

## 概述

`EventManager` 是 ZerOS 内核的事件管理器，统一管理所有事件处理。它提供了：
- 统一的事件注册和管理
- 事件优先级控制
- 事件传播控制（stopPropagation, stopImmediatePropagation, preventDefault）
- 自动清理机制（进程退出时自动清理所有事件监听器）
- 多程序事件支持（多个程序可以注册同一事件，按优先级执行）

## 依赖

- `KernelLogger` - 内核日志系统（用于日志输出）
- `PermissionManager` - 权限管理系统（用于权限检查）
- `ProcessManager` - 进程管理系统（用于获取当前 PID）

## 初始化

事件管理器在首次使用时自动初始化：

```javascript
EventManager.init();
```

## API 方法

### 事件处理程序注册（核心API）

#### `registerEventHandler(pid, eventType, handler, options)`

注册事件处理程序。这是事件管理器的核心API，所有事件处理都应该通过此API注册。

**参数**:
- `pid` (number): 程序PID
- `eventType` (string): 事件类型（如 'click', 'contextmenu', 'keydown', 'mousedown' 等）
- `handler` (Function): 事件处理函数 `(event, eventContext) => { ... }`
  - `event`: 原生事件对象
  - `eventContext`: 事件上下文对象，提供以下方法：
    - `eventContext.stopPropagation()`: 停止事件传播
    - `eventContext.stopImmediatePropagation()`: 立即停止事件传播
    - `eventContext.preventDefault()`: 阻止默认行为
    - `eventContext.stopped`: 是否已停止传播（只读）
    - `eventContext.prevented`: 是否已阻止默认行为（只读）
    - `eventContext.currentHandler`: 当前处理程序信息（只读）
  - 返回值：
    - `false`: 阻止默认行为
    - `'stop'` 或 `'stopPropagation'`: 停止事件传播
    - `'stopImmediate'` 或 `'stopImmediatePropagation'`: 立即停止事件传播
- `options` (Object): 选项对象
  - `priority` (number): 优先级（数字越小优先级越高，默认100）
  - `selector` (string): CSS选择器（可选，只在匹配的元素上触发）
  - `stopPropagation` (boolean): 是否阻止事件传播（默认false）
  - `once` (boolean): 是否只触发一次（默认false）
  - `passive` (boolean): 是否被动监听（默认false）
  - `useCapture` (boolean): 是否使用捕获阶段（默认false）

**返回**: `number` - 处理程序ID，用于注销

**权限要求**: 需要 `PermissionManager.PERMISSION.EVENT_LISTENER` 权限

**示例**:
```javascript
// 基本用法
const handlerId = EventManager.registerEventHandler(pid, 'click', (e) => {
    console.log('点击事件', e.target);
});

// 使用优先级和选择器
const handlerId2 = EventManager.registerEventHandler(pid, 'click', (e) => {
    console.log('按钮点击', e.target);
}, {
    priority: 50,  // 高优先级
    selector: '.my-button'  // 只在 .my-button 元素上触发
});

// 使用事件上下文控制传播
const handlerId3 = EventManager.registerEventHandler(pid, 'click', (e, ctx) => {
    // 阻止事件传播
    ctx.stopPropagation();
    // 或返回 'stop' 来停止传播
    return 'stop';
}, {
    priority: 10  // 最高优先级
});

// 只触发一次
const handlerId4 = EventManager.registerEventHandler(pid, 'keydown', (e) => {
    console.log('按键:', e.key);
}, {
    once: true
});
```

#### `unregisterEventHandler(handlerId)`

注销事件处理程序。

**参数**:
- `handlerId` (number): 处理程序ID（由 `registerEventHandler` 返回）

**示例**:
```javascript
const handlerId = EventManager.registerEventHandler(pid, 'click', handler);
// ... 使用后注销
EventManager.unregisterEventHandler(handlerId);
```

#### `unregisterAllHandlersForPid(pid)`

注销程序的所有事件处理程序。**通常不需要手动调用**，`ProcessManager` 会在程序退出时自动调用。

**参数**:
- `pid` (number): 程序PID

**注意**: 此方法会自动清理通过 `registerEventHandler` 和 `registerElementEvent` 注册的所有事件处理程序。

**示例**:
```javascript
// 通常不需要手动调用，ProcessManager 会自动清理
// 但如果需要提前清理，可以手动调用：
EventManager.unregisterAllHandlersForPid(this.pid);
```

### 元素特定事件管理

#### `registerElementEvent(pid, element, eventType, handler, options)`

注册元素特定的事件（不会冒泡的事件，如 `mouseenter`, `mouseleave`, `load`, `error`）。这些事件需要直接绑定到元素上，但通过 EventManager 统一管理。

**参数**:
- `pid` (number): 程序PID
- `element` (HTMLElement): 元素对象
- `eventType` (string): 事件类型（如 'mouseenter', 'mouseleave', 'load', 'error'）
- `handler` (Function): 事件处理函数 `(event, eventContext) => { ... }`
  - `event`: 原生事件对象
  - `eventContext`: 事件上下文对象（可选，提供 stopPropagation 等方法）
- `options` (Object): 选项对象（可选）
  - `once` (boolean): 是否只触发一次（默认false）
  - `passive` (boolean): 是否被动监听（默认false）

**返回**: `number` - 处理程序ID，用于注销

**权限要求**: 需要 `PermissionManager.PERMISSION.EVENT_LISTENER` 权限

**示例**:
```javascript
// 注册 mouseenter 事件（不会冒泡）
const handlerId = EventManager.registerElementEvent(
    this.pid,
    buttonElement,
    'mouseenter',
    (e) => {
        buttonElement.style.backgroundColor = 'blue';
    }
);

// 注册 load 事件
const loadHandlerId = EventManager.registerElementEvent(
    this.pid,
    imageElement,
    'load',
    (e) => {
        console.log('图片加载完成');
    },
    { once: true }  // 只触发一次
);

// 注册 error 事件
const errorHandlerId = EventManager.registerElementEvent(
    this.pid,
    imageElement,
    'error',
    (e) => {
        console.error('图片加载失败');
    }
);
```

#### `unregisterElementEvent(handlerId)`

注销元素特定的事件。

**参数**:
- `handlerId` (number): 处理程序ID（由 `registerElementEvent` 返回）

**示例**:
```javascript
const handlerId = EventManager.registerElementEvent(pid, element, 'mouseenter', handler);
// ... 使用后注销
EventManager.unregisterElementEvent(handlerId);
```

**注意**: 程序退出时，`ProcessManager` 会自动调用 `unregisterAllHandlersForPid` 清理所有事件处理程序，包括元素特定事件。

### 事件传播控制API

#### `stopPropagation(event, eventContext)`

阻止事件传播。

**参数**:
- `event` (Event): 事件对象
- `eventContext` (Object): 事件上下文对象（可选，如果提供则使用上下文）

**示例**:
```javascript
EventManager.registerEventHandler(pid, 'click', (e, ctx) => {
    EventManager.stopPropagation(e, ctx);
});
```

#### `stopImmediatePropagation(event, eventContext)`

立即阻止事件传播。

**参数**:
- `event` (Event): 事件对象
- `eventContext` (Object): 事件上下文对象（可选）

**示例**:
```javascript
EventManager.registerEventHandler(pid, 'click', (e, ctx) => {
    EventManager.stopImmediatePropagation(e, ctx);
});
```

#### `preventDefault(event, eventContext)`

阻止默认行为。

**参数**:
- `event` (Event): 事件对象
- `eventContext` (Object): 事件上下文对象（可选）

**示例**:
```javascript
EventManager.registerEventHandler(pid, 'contextmenu', (e, ctx) => {
    EventManager.preventDefault(e, ctx);
});
```

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

## 事件传播优先级

事件管理器按照优先级顺序执行处理程序（数字越小优先级越高）：

1. **优先级 1-10**: 系统核心事件（如右键菜单、窗口控制）
2. **优先级 11-30**: 窗口管理事件（如拖动、拉伸）
3. **优先级 31-50**: 菜单和弹出层事件
4. **优先级 51-100**: 应用程序事件（默认优先级）
5. **优先级 101+**: 低优先级事件

## 事件传播控制

事件管理器提供了多种方式来控制事件传播：

1. **注册时设置**: 在注册时设置 `stopPropagation: true`
2. **返回值控制**: 处理程序返回 `'stop'` 或 `'stopImmediate'`
3. **上下文API**: 在处理程序中使用 `eventContext.stopPropagation()`
4. **静态方法**: 使用 `EventManager.stopPropagation(e, ctx)`

## addEventListener 拦截机制

EventManager 会拦截 `document.addEventListener`、`window.addEventListener` 和 `Element.prototype.addEventListener` 调用：

- **内核模块**：可以直接使用 `addEventListener`，不会记录警告
- **程序代码**：可以使用 `addEventListener`，但会记录警告日志，建议使用 EventManager API
- **第三方库**：可以使用 `addEventListener`，但会记录警告日志

**警告信息示例**：
```
[内核][EventManager] [警告] 程序 (PID: 10002) 直接使用 document.addEventListener 注册事件 "click"。
建议使用 EventManager.registerEventHandler() 进行统一管理，以便支持事件优先级、传播控制和自动清理。
```

**为什么建议使用 EventManager**：
- ✅ 统一管理所有事件，支持事件优先级和传播控制
- ✅ 进程退出时自动清理事件监听器，防止内存泄漏
- ✅ 提供统一的事件传播控制 API
- ✅ 支持多程序注册同一事件，按优先级执行

## 注意事项

1. **必须使用 EventManager**：所有事件处理必须通过 EventManager 进行统一管理
2. **自动初始化**: 事件管理器在首次使用时自动初始化
3. **全局事件**: 事件管理器使用全局事件监听器，避免重复注册
4. **权限检查**: 注册事件处理程序需要 `EVENT_LISTENER` 权限（在 `__info__` 中声明）
5. **程序清理**: 程序退出时，`ProcessManager` 会自动调用 `unregisterAllHandlersForPid` 清理事件处理程序
6. **事件传播**: 事件按照优先级顺序执行，高优先级的处理程序可以阻止低优先级的处理程序执行
7. **捕获和冒泡**: 支持捕获阶段和冒泡阶段的事件处理，通过 `useCapture` 选项控制
8. **选择器匹配**: 使用 `selector` 选项可以限制事件只在匹配的元素上触发
9. **菜单关闭**: 点击桌面或 gui-container 时会自动关闭所有可见菜单
10. **状态对象**: 拖动和拉伸需要使用状态对象来存储中间状态
11. **注销**: 程序退出或元素销毁时应该注销相关事件，避免内存泄漏
12. **排除选择器**: 可以指定排除的选择器，避免误触发关闭
13. **元素特定事件**: 对于非冒泡事件（如 `mouseenter`, `mouseleave`, `load`, `error`），使用 `registerElementEvent` 方法
14. **addEventListener 警告**: 程序使用 `addEventListener` 会被警告，建议迁移到 EventManager API

## 调试和统计

#### `getStats()`

获取事件统计信息（用于调试）。

**返回**: `Object` - 统计信息对象

**示例**:
```javascript
const stats = EventManager.getStats();
console.log('事件类型数:', stats.totalEventTypes);
console.log('处理程序总数:', stats.totalHandlers);
console.log('按事件类型分组:', stats.handlersByEventType);
console.log('按PID分组:', stats.handlersByPid);
```

#### `getHandlersForEvent(eventType)`

获取指定事件类型的所有处理程序信息（用于调试）。

**参数**:
- `eventType` (string): 事件类型

**返回**: `Array` - 处理程序信息数组

**示例**:
```javascript
const handlers = EventManager.getHandlersForEvent('click');
console.log('click事件的处理程序:', handlers);
```

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [GUIManager.md](./GUIManager.md) - GUI 管理器 API
- [PermissionManager.md](./PermissionManager.md) - 权限管理器 API

