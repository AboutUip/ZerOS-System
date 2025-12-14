# DependencyConfig API 文档

## 概述

`DependencyConfig` 是 ZerOS 内核的依赖管理器，负责模块依赖管理和异步加载。提供依赖声明、等待加载、信号发布等功能。

## 依赖

- `KernelLogger` - 内核日志系统（用于日志输出）

## 初始化

依赖管理器通过构造函数创建实例：

```javascript
const Dependency = new DependencyConfig();
```

## API 方法

### 依赖管理

#### `addDependency(name)`

添加依赖项。

**参数**:
- `name` (string): 依赖项路径（如 `"../kernel/process/processManager.js"`）

**示例**:
```javascript
const Dependency = new DependencyConfig();
Dependency.addDependency("../kernel/process/processManager.js");
Dependency.addDependency("../kernel/memory/memoryManager.js");
```

#### `linkerAll()`

链接所有依赖项（加载所有脚本）。

**示例**:
```javascript
const Dependency = new DependencyConfig();
Dependency.addDependency("../kernel/process/processManager.js");
Dependency.addDependency("../kernel/memory/memoryManager.js");
Dependency.linkerAll(); // 开始加载所有依赖项
```

### 等待加载

#### `waitLoaded(name, options)`

异步等待指定依赖加载完成。

**参数**:
- `name` (string): 依赖项路径
- `options` (Object): 选项对象（可选）
  - `interval` (number): 检查间隔（毫秒，默认 50）
  - `timeout` (number): 超时时间（毫秒，默认 5000）

**返回值**: `Promise<boolean>` - 是否加载成功

**示例**:
```javascript
const Dependency = new DependencyConfig();
await Dependency.waitLoaded("../kernel/process/processManager.js", {
    interval: 50,
    timeout: 5000
});
```

#### `waitLoadedSync(name, options)`

同步等待指定依赖加载完成（阻塞式）。

**参数**:
- `name` (string): 依赖项路径
- `options` (Object): 选项对象（可选）
  - `interval` (number): 检查间隔（毫秒，默认 10）
  - `timeout` (number): 超时时间（毫秒，默认 5000）

**返回值**: `boolean` - 是否加载成功

**示例**:
```javascript
const Dependency = new DependencyConfig();
const loaded = Dependency.waitLoadedSync("../kernel/process/processManager.js");
if (loaded) {
    console.log("依赖已加载");
}
```

**注意**: 同步等待会阻塞主线程，只用于关键模块。

### 信号发布

#### `publishSignal(name)`

发布依赖加载完成信号（静态方法）。

**参数**:
- `name` (string): 依赖项路径

**示例**:
```javascript
// 在模块加载完成后发布信号
DependencyConfig.publishSignal("../kernel/process/processManager.js");
```

### 依赖检查

#### `checkDependency(name)`

检查某个依赖是否完全初始化。

**参数**:
- `name` (string): 依赖项路径

**返回值**: `boolean` - 是否已加载

**示例**:
```javascript
const Dependency = new DependencyConfig();
if (Dependency.checkDependency("../kernel/process/processManager.js")) {
    console.log("依赖已加载");
}
```

## 使用示例

### 示例 1: 基本依赖管理

```javascript
// 创建依赖管理器实例
const Dependency = new DependencyConfig();

// 添加依赖
Dependency.addDependency("../kernel/process/processManager.js");
Dependency.addDependency("../kernel/memory/memoryManager.js");

// 开始加载
Dependency.linkerAll();

// 等待加载完成
await Dependency.waitLoaded("../kernel/process/processManager.js");
```

### 示例 2: 等待多个依赖

```javascript
const Dependency = new DependencyConfig();

// 添加并加载依赖
Dependency.addDependency("../kernel/process/processManager.js");
Dependency.addDependency("../kernel/memory/memoryManager.js");
Dependency.linkerAll();

// 等待所有依赖加载完成
await Promise.all([
    Dependency.waitLoaded("../kernel/process/processManager.js"),
    Dependency.waitLoaded("../kernel/memory/memoryManager.js")
]);

console.log("所有依赖已加载");
```

### 示例 3: 模块中发布信号

```javascript
// 在模块加载完成后发布信号
// 例如：在 processManager.js 的末尾
DependencyConfig.publishSignal("../kernel/process/processManager.js");
```

### 示例 4: 同步等待（关键模块）

```javascript
// 同步等待关键模块（会阻塞主线程）
const Dependency = new DependencyConfig();
const loaded = Dependency.waitLoadedSync("../kernel/process/processManager.js", {
    interval: 10,
    timeout: 5000
});

if (loaded) {
    // 使用 ProcessManager
    ProcessManager.startProgram('myapp');
}
```

## 依赖状态

每个依赖项有以下状态：

- `linked`: 是否已链接（脚本标签已创建）
- `inited`: 是否已初始化（模块已执行）
- `loaded`: 是否完全加载（已发布信号）

## 注意事项

1. **信号发布**: 模块加载完成后必须调用 `publishSignal()` 通知依赖管理器
2. **异步加载**: 依赖项是异步加载的，使用 `waitLoaded()` 等待加载完成
3. **同步等待**: `waitLoadedSync()` 会阻塞主线程，只用于关键模块
4. **超时处理**: 如果依赖加载超时，`waitLoaded()` 会 reject，`waitLoadedSync()` 会返回 false
5. **实例管理**: 通常使用全局 Dependency 实例（从 POOL 获取）

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [Pool.md](./Pool.md) - 全局对象池 API

