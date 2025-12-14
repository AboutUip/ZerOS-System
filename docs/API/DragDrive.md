# DragDrive API 文档

## 概述

`DragDrive` 是 ZerOS 内核的拖拽驱动管理器，负责管理系统级的拖拽功能，包括元素拖拽、文件拖拽、窗口拖拽等。提供统一的拖拽 API 供程序使用，支持跨窗口拖拽、自定义拖拽图像、放置区域管理等高级功能。

## 依赖

- `ProcessManager` - 进程管理器（用于进程 ID 管理和权限检查）
- `PermissionManager` - 权限管理器（用于拖拽权限验证）
- `KernelLogger` - 内核日志（用于日志记录）

## 常量

### 拖拽类型

```javascript
DragDrive.DRAG_TYPE = {
    ELEMENT: 'ELEMENT',           // 元素拖拽
    FILE: 'FILE',                 // 文件拖拽
    WINDOW: 'WINDOW',             // 窗口拖拽
    CUSTOM: 'CUSTOM'              // 自定义拖拽
};
```

### 拖拽状态

```javascript
DragDrive.DRAG_STATE = {
    IDLE: 'IDLE',                // 空闲
    STARTING: 'STARTING',         // 开始拖拽
    DRAGGING: 'DRAGGING',         // 拖拽中
    DROPPING: 'DROPPING',         // 放置中
    COMPLETED: 'COMPLETED',       // 完成
    CANCELLED: 'CANCELLED'        // 取消
};
```

## 权限要求

所有拖拽 API 调用都需要相应的权限：

- **DRAG_ELEMENT** (普通权限): 元素拖拽相关操作
- **DRAG_FILE** (普通权限): 文件拖拽相关操作
- **DRAG_WINDOW** (普通权限): 窗口拖拽相关操作

普通权限会自动授予，无需用户确认。

## 通过 ProcessManager 调用

所有拖拽功能都通过 `ProcessManager.callKernelAPI` 调用：

```javascript
// 获取 ProcessManager
const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");

// 调用拖拽 API
const result = await ProcessManager.callKernelAPI(
    this.pid,
    'Drag.createSession',
    ['#myElement', 'ELEMENT', { data: 'value' }, { onDragStart: callback }]
);
```

## API 方法

### 拖拽会话管理

#### `Drag.createSession(pid, sourceElementSelector, dragType, dragData, options)`

创建拖拽会话。

**参数**:
- `pid` (number): 进程 ID（由 ProcessManager 自动传入）
- `sourceElementSelector` (string): 源元素选择器（如 `"#myElement"` 或 `".draggable"`）
- `dragType` (string): 拖拽类型（`DragDrive.DRAG_TYPE` 的值）
- `dragData` (Object): 拖拽数据（可选，默认 `{}`）
- `options` (Object): 拖拽选项（可选）
  - `onDragStart` (Function): 拖拽开始回调 `(event, session) => {}`
  - `onDrag` (Function): 拖拽中回调 `(event, session) => {}`
  - `onDragEnd` (Function): 拖拽结束回调 `(event, session) => {}`
  - `onDrop` (Function): 放置回调 `(event, session, dropTarget) => {}`
  - `cloneOnDrag` (boolean): 是否在拖拽时克隆元素（默认 `false`）
  - `dragImage` (HTMLElement): 自定义拖拽图像（可选）
  - `dragImageOffset` (Object): 拖拽图像偏移 `{ x: 0, y: 0 }`（可选）
  - `allowDrop` (Function): 允许放置检查函数 `(element, session) => boolean`（可选）

**返回值**: `Promise<string>` - 拖拽会话 ID

**示例**:
```javascript
const dragId = await ProcessManager.callKernelAPI(
    this.pid,
    'Drag.createSession',
    [
        '#myDraggableElement',
        DragDrive.DRAG_TYPE.ELEMENT,
        { itemId: 123, itemName: 'My Item' },
        {
            onDragStart: (e, session) => {
                console.log('拖拽开始', session.dragId);
            },
            onDrop: (e, session, target) => {
                console.log('放置到', target);
            }
        }
    ]
);

// 启用拖拽
await ProcessManager.callKernelAPI(this.pid, 'Drag.enable', [dragId]);
```

#### `Drag.enable(dragId)`

启用拖拽功能。

**参数**:
- `dragId` (string): 拖拽会话 ID

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await ProcessManager.callKernelAPI(this.pid, 'Drag.enable', [dragId]);
```

#### `Drag.disable(dragId)`

禁用拖拽功能。

**参数**:
- `dragId` (string): 拖拽会话 ID

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await ProcessManager.callKernelAPI(this.pid, 'Drag.disable', [dragId]);
```

#### `Drag.destroySession(dragId)`

销毁拖拽会话。

**参数**:
- `dragId` (string): 拖拽会话 ID

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await ProcessManager.callKernelAPI(this.pid, 'Drag.destroySession', [dragId]);
```

#### `Drag.getSession(dragId)`

获取拖拽会话信息。

**参数**:
- `dragId` (string): 拖拽会话 ID

**返回值**: `Promise<Object|null>` - 拖拽会话对象或 `null`

**会话对象结构**:
```javascript
{
    dragId: string,              // 拖拽会话 ID
    pid: number,                 // 进程 ID
    dragType: string,            // 拖拽类型
    sourceElement: HTMLElement,  // 源元素
    dragData: Object,            // 拖拽数据
    state: string,               // 当前状态
    dropTarget: HTMLElement|null, // 当前放置目标
    options: Object              // 拖拽选项
}
```

**示例**:
```javascript
const session = await ProcessManager.callKernelAPI(this.pid, 'Drag.getSession', [dragId]);
if (session) {
    console.log('拖拽状态:', session.state);
    console.log('拖拽数据:', session.dragData);
}
```

#### `Drag.getProcessDrags(pid)`

获取进程的所有拖拽会话。

**参数**:
- `pid` (number): 进程 ID（由 ProcessManager 自动传入）

**返回值**: `Promise<Array<Object>>` - 拖拽会话列表

**示例**:
```javascript
const drags = await ProcessManager.callKernelAPI(this.pid, 'Drag.getProcessDrags', [this.pid]);
console.log(`当前有 ${drags.length} 个活动的拖拽会话`);
```

### 放置区域管理

#### `Drag.registerDropZone(dropZoneSelector, options)`

注册放置区域。

**参数**:
- `dropZoneSelector` (string): 放置区域元素选择器
- `options` (Object): 选项（可选，当前未使用）

**返回值**: `Promise<boolean>` - 是否成功

**注意**: 放置区域元素需要添加 `data-drop-zone="true"` 属性，或通过此方法自动添加。

**示例**:
```javascript
// 注册放置区域
await ProcessManager.callKernelAPI(
    this.pid,
    'Drag.registerDropZone',
    ['#myDropZone']
);

// 监听放置事件
document.getElementById('myDropZone').addEventListener('zeros-drop', (e) => {
    const { session, dragData, dropTarget } = e.detail;
    console.log('放置事件', dragData);
});
```

#### `Drag.unregisterDropZone(dropZoneSelector)`

注销放置区域。

**参数**:
- `dropZoneSelector` (string): 放置区域元素选择器

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await ProcessManager.callKernelAPI(
    this.pid,
    'Drag.unregisterDropZone',
    ['#myDropZone']
);
```

### 文件拖拽

#### `Drag.createFileDrag(pid, sourceElementSelector, filePaths, options)`

创建文件拖拽会话。

**参数**:
- `pid` (number): 进程 ID（由 ProcessManager 自动传入）
- `sourceElementSelector` (string): 源元素选择器
- `filePaths` (Array<string>): 文件路径数组（如 `["D:/file1.txt", "D:/file2.txt"]`）
- `options` (Object): 拖拽选项（可选，同 `createSession`）

**返回值**: `Promise<string>` - 拖拽会话 ID

**示例**:
```javascript
const dragId = await ProcessManager.callKernelAPI(
    this.pid,
    'Drag.createFileDrag',
    [
        '#fileItem',
        ['D:/documents/file1.txt', 'D:/documents/file2.txt'],
        {
            onDrop: async (e, session, target) => {
                // 处理文件放置
                const filePaths = session.dragData.filePaths;
                console.log('放置文件:', filePaths);
            }
        }
    ]
);

await ProcessManager.callKernelAPI(this.pid, 'Drag.enable', [dragId]);
```

### 窗口拖拽

#### `Drag.createWindowDrag(pid, sourceElementSelector, windowId, options)`

创建窗口拖拽会话。

**参数**:
- `pid` (number): 进程 ID（由 ProcessManager 自动传入）
- `sourceElementSelector` (string): 源元素选择器（通常是窗口标题栏）
- `windowId` (string): 窗口 ID
- `options` (Object): 拖拽选项（可选，同 `createSession`）

**返回值**: `Promise<string>` - 拖拽会话 ID

**示例**:
```javascript
const dragId = await ProcessManager.callKernelAPI(
    this.pid,
    'Drag.createWindowDrag',
    [
        '.window-titlebar',
        'window_10001',
        {
            onDrag: (e, session) => {
                // 更新窗口位置
                const windowElement = document.querySelector(`[data-window-id="${session.dragData.windowId}"]`);
                if (windowElement) {
                    windowElement.style.left = e.clientX + 'px';
                    windowElement.style.top = e.clientY + 'px';
                }
            }
        }
    ]
);

await ProcessManager.callKernelAPI(this.pid, 'Drag.enable', [dragId]);
```

## 使用示例

### 基本元素拖拽

```javascript
class MyProgram {
    async __init__(pid, initArgs) {
        this.pid = pid;
        this.dragId = null;
    }
    
    async init() {
        const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
        
        // 创建拖拽会话
        this.dragId = await ProcessManager.callKernelAPI(
            this.pid,
            'Drag.createSession',
            [
                '#myDraggableItem',
                DragDrive.DRAG_TYPE.ELEMENT,
                { itemId: 123 },
                {
                    onDragStart: (e, session) => {
                        console.log('开始拖拽');
                    },
                    onDrop: (e, session, target) => {
                        console.log('放置到:', target);
                    }
                }
            ]
        );
        
        // 启用拖拽
        await ProcessManager.callKernelAPI(this.pid, 'Drag.enable', [this.dragId]);
        
        // 注册放置区域
        await ProcessManager.callKernelAPI(
            this.pid,
            'Drag.registerDropZone',
            ['#myDropZone']
        );
        
        // 监听放置事件
        document.getElementById('myDropZone').addEventListener('zeros-drop', (e) => {
            const { dragData } = e.detail;
            console.log('接收到拖拽数据:', dragData);
        });
    }
    
    async __exit__(pid, force) {
        if (this.dragId) {
            const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
            await ProcessManager.callKernelAPI(this.pid, 'Drag.destroySession', [this.dragId]);
        }
    }
}
```

### 文件拖拽

```javascript
async initFileDrag() {
    const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
    
    // 创建文件拖拽
    const dragId = await ProcessManager.callKernelAPI(
        this.pid,
        'Drag.createFileDrag',
        [
            '#fileListItem',
            ['D:/documents/myfile.txt'],
            {
                onDrop: async (e, session, target) => {
                    const filePaths = session.dragData.filePaths;
                    // 处理文件
                    for (const filePath of filePaths) {
                        console.log('处理文件:', filePath);
                    }
                }
            }
        ]
    );
    
    await ProcessManager.callKernelAPI(this.pid, 'Drag.enable', [dragId]);
}
```

### 自定义拖拽图像

```javascript
async initCustomDragImage() {
    const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
    
    // 创建自定义拖拽图像
    const dragImage = document.createElement('div');
    dragImage.textContent = '拖拽中...';
    dragImage.style.cssText = 'background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 4px;';
    
    const dragId = await ProcessManager.callKernelAPI(
        this.pid,
        'Drag.createSession',
        [
            '#myElement',
            DragDrive.DRAG_TYPE.ELEMENT,
            { data: 'value' },
            {
                dragImage: dragImage,
                dragImageOffset: { x: 10, y: 10 }
            }
        ]
    );
    
    await ProcessManager.callKernelAPI(this.pid, 'Drag.enable', [dragId]);
}
```

## 事件

### 自定义事件

拖拽驱动会在元素上触发以下自定义事件：

- **`zeros-dragenter`**: 拖拽进入放置区域
  ```javascript
  element.addEventListener('zeros-dragenter', (e) => {
      const { session } = e.detail;
      console.log('拖拽进入', session.dragId);
  });
  ```

- **`zeros-dragleave`**: 拖拽离开放置区域
  ```javascript
  element.addEventListener('zeros-dragleave', (e) => {
      const { session } = e.detail;
      console.log('拖拽离开', session.dragId);
  });
  ```

- **`zeros-drop`**: 放置到放置区域
  ```javascript
  element.addEventListener('zeros-drop', (e) => {
      const { session, dragData, dropTarget } = e.detail;
      console.log('放置', dragData);
  });
  ```

## CSS 类

拖拽驱动会自动添加以下 CSS 类：

- **`drag-over`**: 当元素作为放置目标且拖拽悬停时添加

**示例 CSS**:
```css
.drag-over {
    background-color: rgba(108, 142, 255, 0.2);
    border: 2px dashed rgba(108, 142, 255, 0.5);
}
```

## 注意事项

1. **权限检查**: 所有拖拽 API 调用都会自动进行权限检查，确保程序有相应的拖拽权限。

2. **进程清理**: 当程序退出时，ProcessManager 会自动清理该程序创建的所有拖拽会话。

3. **元素选择器**: 使用选择器时，确保元素在调用 API 时已经存在于 DOM 中。

4. **跨窗口拖拽**: 拖拽驱动支持跨窗口拖拽，但需要确保目标窗口已注册为放置区域。

5. **拖拽图像**: 自定义拖拽图像会在拖拽开始时创建，拖拽结束后自动清理。

6. **放置区域**: 放置区域需要显式注册，未注册的元素不会接收放置事件。

## 相关文档

- [ProcessManager API](ProcessManager.md) - 进程管理器和内核 API 调用
- [PermissionManager API](PermissionManager.md) - 权限管理系统

