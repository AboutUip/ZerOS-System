# DesktopManager API 文档

## 概述

`DesktopManager` 是 ZerOS 内核的桌面管理器，负责沙盒环境的桌面实现，包括快捷方式、桌面图标排列、右键菜单、桌面组件等。

## 依赖

- `GUIManager` - GUI 管理器（用于窗口管理）
- `ThemeManager` - 主题管理器（用于主题和风格）
- `ApplicationAssetManager` - 应用程序资源管理器（用于获取程序信息）
- `ContextMenuManager` - 上下文菜单管理器（用于桌面右键菜单）
- `ProcessManager` - 进程管理器（用于程序启动）
- `TaskbarManager` - 任务栏管理器（用于获取任务栏位置）
- `LStorage` - 本地存储（用于保存桌面配置）

## 初始化

桌面管理器在系统启动时自动初始化：

```javascript
await DesktopManager.init();
```

## API 方法

### 桌面快捷方式管理

#### `addShortcut(options)`

添加桌面快捷方式。

**参数**:
- `options` (Object): 选项对象
  - `programName` (string): 程序名称（必需）
  - `name` (string): 显示名称（可选，默认使用 programName）
  - `icon` (string): 图标路径（可选）
  - `description` (string): 描述（可选）
  - `position` (Object): 位置 `{x, y}`（可选，默认自动排列）

**返回值**: `number` - 图标 ID

**示例**:
```javascript
const iconId = DesktopManager.addShortcut({
    programName: 'filemanager',
    name: '文件管理器',
    icon: 'application/filemanager/filemanager.svg',
    description: '管理文件和文件夹',
    position: { x: 100, y: 100 }
});
```

#### `removeShortcut(iconId)`

移除桌面快捷方式。

**参数**:
- `iconId` (number): 图标 ID

**示例**:
```javascript
DesktopManager.removeShortcut(iconId);
```

#### `getIcons()`

获取桌面图标列表。

**返回值**: `Array<Object>` - 图标数据数组

**图标数据对象结构**:
```javascript
{
    id: number,
    programName: string,
    name: string,
    icon: string|null,
    description: string,
    position: Object|null,
    createdAt: number
}
```

**示例**:
```javascript
const icons = DesktopManager.getIcons();
icons.forEach(icon => {
    console.log(`${icon.name}: ${icon.programName}`);
});
```

### 桌面配置管理

#### `getConfig()`

获取桌面配置。

**返回值**: `Object` - 配置对象
```javascript
{
    arrangementMode: string,  // 'grid' | 'list' | 'auto'
    iconSize: string,         // 'small' | 'medium' | 'large'
    autoArrange: boolean,     // 是否自动排列
    iconSpacing: number       // 图标间距（像素）
}
```

**示例**:
```javascript
const config = DesktopManager.getConfig();
console.log(`排列模式: ${config.arrangementMode}`);
console.log(`图标大小: ${config.iconSize}`);
```

#### `setArrangementMode(mode)`

设置排列模式。

**参数**:
- `mode` (string): 排列模式 `'grid'`（网格）、`'list'`（列表）、`'auto'`（自动）

**示例**:
```javascript
DesktopManager.setArrangementMode('grid');
```

#### `setIconSize(size)`

设置图标大小。

**参数**:
- `size` (string): 图标大小 `'small'`、`'medium'`、`'large'`

**示例**:
```javascript
DesktopManager.setIconSize('large');
```

#### `setAutoArrange(autoArrange)`

设置自动排列。

**参数**:
- `autoArrange` (boolean): 是否自动排列

**示例**:
```javascript
DesktopManager.setAutoArrange(true);
```

### 桌面组件管理

#### `addComponent(pid, options)`

添加桌面组件（供程序使用）。

**参数**:
- `pid` (number): 进程 ID
- `options` (Object): 选项对象
  - `element` (HTMLElement): 组件元素（必需）
  - `position` (Object): 位置 `{x, y}`（可选）
  - `size` (Object): 尺寸 `{width, height}`（可选）
  - `draggable` (boolean): 是否可拖动（可选，默认 true）
  - `persistent` (boolean): 是否持久化（可选，默认 false）

**返回值**: `string` - 组件 ID

**示例**:
```javascript
const componentElement = document.createElement('div');
componentElement.innerHTML = '<div>我的桌面组件</div>';

const componentId = DesktopManager.addComponent(pid, {
    element: componentElement,
    position: { x: 200, y: 200 },
    size: { width: 300, height: 200 },
    draggable: true,
    persistent: false
});
```

#### `removeComponent(componentId, force)`

移除桌面组件。

**参数**:
- `componentId` (string): 组件 ID
- `force` (boolean): 是否强制删除（可选，默认 false，用于删除持久化组件）

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
DesktopManager.removeComponent(componentId);
```

#### `getComponentContentContainer(componentId)`

获取组件内容容器（供程序使用）。

**参数**:
- `componentId` (string): 组件 ID

**返回值**: `HTMLElement|null` - 内容容器元素

**示例**:
```javascript
const container = DesktopManager.getComponentContentContainer(componentId);
if (container) {
    container.innerHTML = '<div>更新后的内容</div>';
}
```

#### `updateComponentPosition(componentId, position)`

更新组件位置。

**参数**:
- `componentId` (string): 组件 ID
- `position` (Object): 新位置 `{x, y}`

**示例**:
```javascript
DesktopManager.updateComponentPosition(componentId, { x: 300, y: 300 });
```

#### `updateComponentSize(componentId, size)`

更新组件尺寸。

**参数**:
- `componentId` (string): 组件 ID
- `size` (Object): 新尺寸 `{width, height}`

**示例**:
```javascript
DesktopManager.updateComponentSize(componentId, { width: 400, height: 300 });
```

#### `updateComponentStyle(componentId, style)`

更新组件样式。

**参数**:
- `componentId` (string): 组件 ID
- `style` (Object): 样式对象

**示例**:
```javascript
DesktopManager.updateComponentStyle(componentId, {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: '8px'
});
```

### 其他方法

#### `refresh()`

刷新桌面（重新加载图标和更新样式）。

**示例**:
```javascript
DesktopManager.refresh();
```

## 使用示例

### 示例 1: 添加桌面快捷方式

```javascript
// 添加程序快捷方式
const iconId = DesktopManager.addShortcut({
    programName: 'filemanager',
    name: '文件管理器',
    icon: 'application/filemanager/filemanager.svg',
    description: '管理文件和文件夹'
});

// 稍后移除
DesktopManager.removeShortcut(iconId);
```

### 示例 2: 配置桌面

```javascript
// 获取当前配置
const config = DesktopManager.getConfig();
console.log(`当前排列模式: ${config.arrangementMode}`);

// 设置网格排列
DesktopManager.setArrangementMode('grid');

// 设置大图标
DesktopManager.setIconSize('large');

// 启用自动排列
DesktopManager.setAutoArrange(true);
```

### 示例 3: 创建桌面组件

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 创建桌面组件
    const componentElement = document.createElement('div');
    componentElement.style.cssText = `
        background: rgba(0, 0, 0, 0.5);
        border-radius: 8px;
        padding: 20px;
        color: white;
    `;
    componentElement.innerHTML = '<h3>我的桌面组件</h3><p>这是一个桌面组件示例</p>';
    
    // 添加到桌面
    this.componentId = DesktopManager.addComponent(pid, {
        element: componentElement,
        position: { x: 100, y: 100 },
        size: { width: 300, height: 200 },
        draggable: true,
        persistent: false
    });
    
    // 获取内容容器并更新内容
    const container = DesktopManager.getComponentContentContainer(this.componentId);
    if (container) {
        container.innerHTML = '<div>更新后的内容</div>';
    }
}

__exit__: function() {
    // 移除组件
    if (this.componentId) {
        DesktopManager.removeComponent(this.componentId);
    }
}
```

### 示例 4: 动态更新组件

```javascript
// 更新组件位置
DesktopManager.updateComponentPosition(componentId, { x: 200, y: 200 });

// 更新组件尺寸
DesktopManager.updateComponentSize(componentId, { width: 400, height: 300 });

// 更新组件样式
DesktopManager.updateComponentStyle(componentId, {
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
});
```

## 排列模式

### grid（网格）
- 图标按网格排列
- 自动对齐到网格
- 不支持拖拽移动

### list（列表）
- 图标按列表排列
- 自动对齐到列表
- 不支持拖拽移动

### auto（自动）
- 图标自由排列
- 支持拖拽移动
- 位置可自定义

## 存储键

```javascript
DesktopManager.STORAGE_KEY_ICONS = 'desktop.icons';
DesktopManager.STORAGE_KEY_ARRANGEMENT = 'desktop.arrangement';
DesktopManager.STORAGE_KEY_ICON_SIZE = 'desktop.iconSize';
DesktopManager.STORAGE_KEY_AUTO_ARRANGE = 'desktop.autoArrange';
```

## 注意事项

1. **初始化**: 桌面管理器在系统启动时自动初始化，通常不需要手动调用 `init()`
2. **快捷方式**: 桌面快捷方式会自动保存到 LStorage，下次启动时自动恢复
3. **组件清理**: 程序退出时，其创建的桌面组件会自动清理（除非标记为 persistent）
4. **图标位置**: 在 `auto` 模式下，图标位置可以自由拖拽；在 `grid` 或 `list` 模式下，图标自动排列
5. **组件拖动**: 桌面组件默认可拖动，可以通过 `draggable: false` 禁用
6. **避开图标**: 桌面组件会自动避开图标区域，避免重叠

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API
- [ContextMenuManager.md](./ContextMenuManager.md) - 上下文菜单管理器 API
- [ThemeManager.md](./ThemeManager.md) - 主题管理器 API

