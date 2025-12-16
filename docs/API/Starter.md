# Starter (BootLoader) API 文档

## 概述

`Starter`（BootLoader）是 ZerOS 内核的启动引导程序，负责管理模块依赖关系，按正确顺序异步加载所有内核模块。提供模块加载、依赖解析、内核自检等功能。

## 依赖

- `KernelLogger` - 内核日志系统（用于日志输出）
- `DependencyConfig` - 依赖管理器（用于依赖管理）
- `POOL` - 全局对象池（用于对象管理）

## 模块依赖关系

BootLoader 定义了完整的模块依赖关系图，确保模块按正确顺序加载：

```javascript
const MODULE_DEPENDENCIES = {
    // 第一层：基础枚举管理器
    "../kernel/typePool/enumManager.js": [],
    
    // 第三层：依赖 enumManager 的枚举
    "../kernel/typePool/logLevel.js": ["../kernel/typePool/enumManager.js"],
    "../kernel/typePool/addressType.js": ["../kernel/typePool/enumManager.js"],
    "../kernel/typePool/fileType.js": ["../kernel/typePool/enumManager.js"],
    
    // 第四层：文件系统模块
    "../kernel/fileSystem/fileFramework.js": ["../kernel/typePool/fileType.js"],
    "../kernel/fileSystem/disk.js": [],
    "../kernel/fileSystem/nodeTree.js": ["../kernel/typePool/fileType.js"],
    
    // 第五层：内存管理模块
    "../kernel/memory/memoryManager.js": ["../kernel/typePool/logLevel.js", ...],
    
    // 第六层：进程管理模块
    "../kernel/process/processManager.js": ["../kernel/memory/memoryManager.js", ...],
    
    // ... 更多模块
};
```

## 启动流程

BootLoader 的启动流程：

1. **加载模块依赖图**: 解析所有模块的依赖关系
2. **拓扑排序**: 计算模块加载顺序
3. **按层级加载**: 同一层级的模块并行加载
4. **等待依赖**: 确保所有依赖已加载完成
5. **等待初始化**: 等待模块初始化完成（通过 DependencyConfig 信号）
6. **内核自检**: 执行内核自检（可选）

## API 方法

### 模块加载

#### `loadModules(dependencies)`

异步加载所有模块（按依赖顺序，支持并行加载）。

**参数**:
- `dependencies` (Object): 依赖关系图

**返回值**: `Promise<void>`

**示例**:
```javascript
// BootLoader 内部使用，通常不需要直接调用
await loadModules(MODULE_DEPENDENCIES);
```

#### `loadScript(src)`

异步加载单个脚本文件。

**参数**:
- `src` (string): 脚本路径

**返回值**: `Promise<void>`

**示例**:
```javascript
// BootLoader 内部使用，通常不需要直接调用
await loadScript("../kernel/process/processManager.js");
```

#### `topologicalSort(dependencies)`

拓扑排序：计算模块加载顺序。

**参数**:
- `dependencies` (Object): 依赖关系图

**返回值**: `Array<string>` - 排序后的模块列表

**示例**:
```javascript
// BootLoader 内部使用，通常不需要直接调用
const sortedModules = topologicalSort(MODULE_DEPENDENCIES);
```

### 内核自检

#### `performKernelSelfCheck(progressCallback)`

执行内核自检。

**参数**:
- `progressCallback` (Function): 进度回调函数 `(step, message, percent) => void`（可选）

**返回值**: `Promise<Object>` - 自检结果
```javascript
{
    passed: number,        // 通过的检查数
    failed: number,        // 失败的检查数
    warnings: number,      // 警告数
    criticalErrors: number, // 严重错误数
    totalChecks: number   // 总检查数
}
```

**示例**:
```javascript
const result = await performKernelSelfCheck((step, message, percent) => {
    console.log(`[${percent}%] ${step}: ${message}`);
});

console.log(`自检结果: 通过 ${result.passed}, 失败 ${result.failed}, 警告 ${result.warnings}`);
if (result.criticalErrors > 0) {
    console.error(`严重错误: ${result.criticalErrors}`);
}
```

## 自检项目

内核自检包括以下项目：

1. **核心模块检查**
   - KernelLogger
   - DependencyConfig
   - POOL

2. **文件系统模块检查**
   - Disk
   - NodeTree
   - FileFormwork

3. **内存管理模块检查**
   - MemoryManager
   - KernelMemory

4. **进程管理模块检查**
   - ProcessManager
   - ApplicationAssetManager

5. **GUI 管理模块检查**
   - GUIManager
   - TaskbarManager
   - ThemeManager
   - NotificationManager
   - DesktopManager

6. **GUI 管理模块检查**
   - GUIManager
   - TaskbarManager
   - ThemeManager
   - NotificationManager
   - DesktopManager
   - ContextMenuManager
   - EventManager
   - PermissionManager

7. **驱动层检查**
   - LStorage
   - NetworkManager
   - DynamicManager
   - MultithreadingDrive
   - DragDrive
   - GeographyDrive
   - CryptDrive（加密驱动）
     - RSA 加密/解密功能
     - MD5 哈希功能
     - 随机数生成功能
     - 密钥管理功能

8. **系统信息检查**
   - SystemInformation
   - 浏览器环境（localStorage、document.body、window）

## 使用示例

### 示例 1: 启动内核

```javascript
// BootLoader 在 HTML 中自动启动
// 通常不需要手动调用

// 如果需要手动启动（不推荐）
if (typeof BootLoader !== 'undefined') {
    await BootLoader.start();
}
```

### 示例 2: 执行内核自检

```javascript
// 在系统启动后执行自检
const result = await performKernelSelfCheck((step, message, percent) => {
    console.log(`[${percent}%] ${step}: ${message}`);
});

if (result.criticalErrors > 0) {
    console.error('内核自检发现严重错误，系统可能无法正常运行');
} else if (result.failed > 0) {
    console.warn('内核自检发现一些问题，但系统可以继续运行');
} else {
    console.log('内核自检通过，所有模块正常');
}
```

### 示例 3: 添加自定义模块

```javascript
// 在 MODULE_DEPENDENCIES 中添加模块
const MODULE_DEPENDENCIES = {
    // ... 现有模块
    
    // 添加自定义模块
    "../kernel/custom/myModule.js": [
        "../kernel/process/processManager.js"
    ]
};
```

## 模块加载策略

1. **拓扑排序**: 使用拓扑排序确保依赖顺序
2. **层级加载**: 同一层级的模块并行加载，提高效率
3. **依赖等待**: 确保所有依赖已加载完成
4. **初始化等待**: 等待模块初始化完成（通过 DependencyConfig 信号）
5. **错误处理**: 加载失败时记录错误并继续（或中断）

## 注意事项

1. **自动启动**: BootLoader 在 HTML 中自动启动，通常不需要手动调用
2. **依赖顺序**: 模块必须按依赖顺序加载，否则可能导致错误
3. **初始化信号**: 模块加载完成后必须发布初始化信号（通过 `DependencyConfig.publishSignal()`）
4. **自检可选**: 内核自检是可选的，但建议在开发时执行
5. **错误处理**: 加载失败时会记录错误，严重错误可能导致系统无法启动

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [DependencyConfig.md](./DependencyConfig.md) - 依赖管理 API
- [Pool.md](./Pool.md) - 全局对象池 API

