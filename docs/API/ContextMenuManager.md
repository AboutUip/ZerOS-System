# ContextMenuManager API 文档

## 概述

`ContextMenuManager` 是 ZerOS 内核的全局右键菜单管理器，负责统一管理系统和程序的上下文菜单。支持多级菜单、动态菜单项、菜单优先级等功能。

## 依赖

- `ProcessManager` - 进程管理器（用于程序菜单管理）
- `KernelLogger` - 内核日志系统（用于日志输出）

## 初始化

上下文菜单管理器在系统启动时自动初始化：

```javascript
ContextMenuManager.init();
```

## API 方法

### 程序菜单注册

#### `registerContextMenu(pid, options)`

注册程序上下文菜单（由程序调用，绑定到 PID）。

**参数**:
- `pid` (number): 进程 ID
- `options` (Object): 菜单选项
  - `context` (string): 上下文类型（如 `'desktop'`, `'window-content'`, `'*'` 等）
  - `selector` (string): CSS 选择器（可选，用于匹配特定元素）
  - `priority` (number): 优先级（可选，数字越大越优先，默认 0）
  - `items` (Array|Function): 菜单项数组或返回菜单项的函数
  - `id` (string): 菜单 ID（可选，不提供则自动生成）

**返回值**: `string|null` - 菜单 ID

**菜单项结构**:
```javascript
{
    label: string,           // 菜单项标签
    icon: string,            // 图标路径（可选）
    action: Function,        // 点击回调函数
    disabled: boolean,       // 是否禁用（可选）
    separator: boolean,      // 是否为分隔符（可选）
    submenu: Array           // 子菜单项（可选）
}
```

**示例**:
```javascript
// 注册桌面右键菜单
const menuId = ContextMenuManager.registerContextMenu(pid, {
    context: 'desktop',
    priority: 10,
    items: [
        {
            label: '新建',
            icon: 'icon/new.svg',
            action: () => {
                console.log('新建');
            }
        },
        {
            separator: true
        },
        {
            label: '刷新',
            action: () => {
                console.log('刷新');
            }
        }
    ]
});
```

#### `updateContextMenu(pid, menuId, updates)`

更新程序上下文菜单。

**参数**:
- `pid` (number): 进程 ID
- `menuId` (string): 菜单 ID
- `updates` (Object): 更新内容（可以更新 `items`, `priority`, `selector` 等）

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
ContextMenuManager.updateContextMenu(pid, menuId, {
    items: [
        {
            label: '新菜单项',
            action: () => {
                console.log('新菜单项');
            }
        }
    ]
});
```

#### `unregisterContextMenu(pid, menuId)`

注销程序上下文菜单。

**参数**:
- `pid` (number): 进程 ID
- `menuId` (string): 菜单 ID（可选，如果不提供则注销该程序的所有菜单）

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
// 注销指定菜单
ContextMenuManager.unregisterContextMenu(pid, menuId);

// 注销程序的所有菜单
ContextMenuManager.unregisterContextMenu(pid);
```

## 使用示例

### 示例 1: 注册桌面右键菜单

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 注册桌面右键菜单
    this.menuId = ContextMenuManager.registerContextMenu(pid, {
        context: 'desktop',
        priority: 10,
        items: [
            {
                label: '新建文件',
                icon: 'icon/file.svg',
                action: () => {
                    this.createNewFile();
                }
            },
            {
                label: '新建文件夹',
                icon: 'icon/folder.svg',
                action: () => {
                    this.createNewFolder();
                }
            },
            {
                separator: true
            },
            {
                label: '刷新',
                action: () => {
                    this.refresh();
                }
            }
        ]
    });
}

__exit__: function() {
    // 注销菜单
    if (this.menuId) {
        ContextMenuManager.unregisterContextMenu(this.pid, this.menuId);
    }
}
```

### 示例 2: 动态菜单项

```javascript
// 使用函数返回动态菜单项
const menuId = ContextMenuManager.registerContextMenu(pid, {
    context: 'window-content',
    items: (targetElement) => {
        // 根据目标元素动态生成菜单项
        const items = [];
        
        if (targetElement.classList.contains('file')) {
            items.push({
                label: '打开',
                action: () => {
                    this.openFile(targetElement);
                }
            });
            items.push({
                label: '删除',
                action: () => {
                    this.deleteFile(targetElement);
                }
            });
        }
        
        return items;
    }
});
```

### 示例 3: 多级菜单

```javascript
const menuId = ContextMenuManager.registerContextMenu(pid, {
    context: 'desktop',
    items: [
        {
            label: '新建',
            submenu: [
                {
                    label: '文件',
                    action: () => {
                        this.createFile();
                    }
                },
                {
                    label: '文件夹',
                    action: () => {
                        this.createFolder();
                    }
                }
            ]
        }
    ]
});
```

### 示例 4: 更新菜单

```javascript
// 更新菜单项
ContextMenuManager.updateContextMenu(pid, menuId, {
    items: [
        {
            label: '更新后的菜单项',
            action: () => {
                console.log('更新后的菜单项');
            }
        }
    ]
});
```

## 上下文类型

支持的上下文类型：

- `'desktop'` - 桌面
- `'window-content'` - 窗口内容区域
- `'taskbar'` - 任务栏
- `'*'` - 所有上下文

## 注意事项

1. **自动清理**: 程序退出时，其注册的菜单会自动清理
2. **优先级**: 多个菜单在同一上下文时，优先级高的菜单会优先显示
3. **选择器**: 使用 `selector` 可以匹配特定元素，实现更精确的菜单显示
4. **动态菜单**: 菜单项可以是函数，根据目标元素动态生成
5. **菜单关闭**: 点击菜单外部或按 ESC 键会自动关闭菜单

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API
- [EventManager.md](./EventManager.md) - 事件管理器 API

