# Pool API 文档

## 概述

`POOL` 是 ZerOS 内核的全局对象池，用于存储和共享内核对象。提供统一的全局对象管理接口，支持类别管理和命名元素管理。

## 特性

- 类别管理：支持按类别组织对象
- 命名元素：每个类别下可以有多个命名元素
- 枚举支持：支持伪枚举对象作为类别
- 类型规范化：自动规范化类别键，支持多种类型

## API 方法

### 初始化

#### `__INIT__(datas)`

初始化池（可传入预定义的 type 列表）。

**参数**:
- `datas` (Array|Object|*): 预定义的类别列表（可选）

**示例**:
```javascript
// 初始化单个类别
POOL.__INIT__("KERNEL_GLOBAL_POOL");

// 初始化多个类别
POOL.__INIT__(["KERNEL_GLOBAL_POOL", "APPLICATION_POOL"]);

// 使用枚举对象初始化
POOL.__INIT__(GroupEnum.POOL);
```

### 添加元素

#### `__ADD__(type, name, elem)`

向类别添加元素。

**参数**:
- `type` (string|Object): 类别名称或枚举对象
- `name` (string): 元素名称
- `elem` (*): 元素值

**返回值**: `void`

**示例**:
```javascript
// 添加元素到类别
POOL.__ADD__("KERNEL_GLOBAL_POOL", "GUIManager", GUIManager);
POOL.__ADD__("KERNEL_GLOBAL_POOL", "ProcessManager", ProcessManager);

// 使用枚举对象
POOL.__ADD__(GroupEnum.POOL, "GUIManager", GUIManager);
```

### 获取元素

#### `__GET__(type, name)`

从类别获取元素。

**参数**:
- `type` (string|Object): 类别名称或枚举对象
- `name` (string): 元素名称（可选，如果不提供则返回整个类别对象）

**返回值**: `*` - 元素值或类别对象，如果不存在返回 `{ isInit: false }`

**示例**:
```javascript
// 获取元素
const guiManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");

// 获取整个类别对象
const kernelPool = POOL.__GET__("KERNEL_GLOBAL_POOL");

// 使用枚举对象
const guiManager = POOL.__GET__(GroupEnum.POOL, "GUIManager");
```

#### `__GET_ALL__(type)`

获取类别的所有项的浅拷贝。

**参数**:
- `type` (string|Object): 类别名称或枚举对象

**返回值**: `Object` - 类别所有项的浅拷贝对象

**示例**:
```javascript
const allItems = POOL.__GET_ALL__("KERNEL_GLOBAL_POOL");
Object.keys(allItems).forEach(name => {
    console.log(`${name}: ${allItems[name]}`);
});
```

### 检查存在

#### `__HAS__(type, name)`

检查类别或元素是否存在。

**参数**:
- `type` (string|Object): 类别名称或枚举对象
- `name` (string): 元素名称（可选）

**返回值**: `boolean` - 是否存在

**示例**:
```javascript
// 检查类别是否存在
if (POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
    console.log("类别存在");
}

// 检查元素是否存在
if (POOL.__HAS__("KERNEL_GLOBAL_POOL", "GUIManager")) {
    console.log("元素存在");
}
```

### 删除元素

#### `__REMOVE__(type, name)`

删除类别或元素。

**参数**:
- `type` (string|Object): 类别名称或枚举对象
- `name` (string): 元素名称（可选，如果不提供则删除整个类别）

**返回值**: `void`

**示例**:
```javascript
// 删除元素
POOL.__REMOVE__("KERNEL_GLOBAL_POOL", "GUIManager");

// 删除整个类别
POOL.__REMOVE__("KERNEL_GLOBAL_POOL");
```

### 清空

#### `__CLEAR__(type)`

清空整个池或指定类别的内容。

**参数**:
- `type` (string|Object): 类别名称（可选，如果不提供则清空整个池）

**返回值**: `void`

**示例**:
```javascript
// 清空指定类别
POOL.__CLEAR__("KERNEL_GLOBAL_POOL");

// 清空整个池
POOL.__CLEAR__();
```

## 常用类别

### KERNEL_GLOBAL_POOL

内核全局对象池，存储内核核心对象：

- `GUIManager` - GUI 管理器
- `ProcessManager` - 进程管理器
- `MemoryManager` - 内存管理器
- `ThemeManager` - 主题管理器
- `TaskbarManager` - 任务栏管理器
- `NotificationManager` - 通知管理器
- `Disk` - 磁盘管理器
- `Dependency` - 依赖管理器
- 等等

### APPLICATION_POOL

应用程序对象池，存储应用程序对象。

### APPLICATION_SHARED_POOL

应用程序共享空间，存储应用程序共享的 API：

- `TerminalAPI` - 终端 API

### TYPE_POOL

类型池，存储类型定义：

- `FileType` - 文件类型枚举
- `LogLevel` - 日志级别枚举
- `AddressType` - 地址类型枚举

## 使用示例

### 示例 1: 基本使用

```javascript
// 初始化类别
POOL.__INIT__("KERNEL_GLOBAL_POOL");

// 添加对象
POOL.__ADD__("KERNEL_GLOBAL_POOL", "MyManager", MyManager);

// 获取对象
const myManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "MyManager");

// 检查是否存在
if (POOL.__HAS__("KERNEL_GLOBAL_POOL", "MyManager")) {
    console.log("MyManager 已注册");
}

// 删除对象
POOL.__REMOVE__("KERNEL_GLOBAL_POOL", "MyManager");
```

### 示例 2: 获取内核对象

```javascript
// 获取 GUI 管理器
const guiManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "GUIManager");
if (guiManager) {
    guiManager.registerWindow(pid, windowElement, options);
}

// 获取进程管理器
const processManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
if (processManager) {
    const pid = await processManager.startProgram('myapp');
}

// 获取主题管理器
const themeManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ThemeManager");
if (themeManager) {
    const theme = themeManager.getCurrentTheme();
}
```

### 示例 3: 获取所有对象

```javascript
// 获取内核全局池的所有对象
const kernelPool = POOL.__GET_ALL__("KERNEL_GLOBAL_POOL");
Object.keys(kernelPool).forEach(name => {
    console.log(`${name}: ${typeof kernelPool[name]}`);
});
```

### 示例 4: 注册应用程序对象

```javascript
// 在程序初始化时注册到应用程序池
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 注册到应用程序池
    if (typeof POOL !== 'undefined') {
        POOL.__INIT__("APPLICATION_POOL");
        POOL.__ADD__("APPLICATION_POOL", "MYAPP", this);
    }
}
```

### 示例 5: 使用枚举对象

```javascript
// 定义枚举对象
const GroupEnum = {
    POOL: "KERNEL_GLOBAL_POOL",
    APP: "APPLICATION_POOL"
};

// 使用枚举对象
POOL.__INIT__(GroupEnum.POOL);
POOL.__ADD__(GroupEnum.POOL, "MyManager", MyManager);
const manager = POOL.__GET__(GroupEnum.POOL, "MyManager");
```

## 注意事项

1. **初始化**: 使用类别前需要先初始化（`__INIT__`）
2. **键名规范**: 元素名称不能为空或空字符串
3. **类型规范化**: POOL 会自动规范化类别键，支持多种类型（string, number, symbol, object）
4. **浅拷贝**: `__GET_ALL__` 返回的是浅拷贝，修改不会影响原始对象
5. **枚举支持**: 支持伪枚举对象作为类别，可以传入枚举对象和字段名的组合

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [DependencyConfig.md](./DependencyConfig.md) - 依赖管理 API

