# KernelLogger API 文档

## 概述

`KernelLogger` 是 ZerOS 内核的统一日志系统，提供结构化的日志输出。完全独立，不依赖任何外部模块，确保日志系统稳定运行。

## 特性

- 多级别日志：DEBUG (3)、INFO (2)、WARN (1)、ERROR (0)
- 结构化输出：模块名、级别、时间戳、消息
- 本地化支持：支持中英文切换
- 日志过滤：可动态调整日志级别
- 错误抑制机制：防止无限循环报错
- 源文件追踪：可显示日志来源文件

## 日志级别

```javascript
const LOG_LEVEL = {
    NONE: 0,   // 不显示任何日志
    ERROR: 1,  // 仅显示错误
    INFO: 2,   // 显示信息和错误
    DEBUG: 3   // 显示所有日志（默认）
};
```

## API 方法

### 配置方法

#### `setLevel(level)`

设置日志级别。

**参数**:
- `level` (number): 日志级别（0-3）

**示例**:
```javascript
KernelLogger.setLevel(3);  // DEBUG 级别（显示所有日志）
KernelLogger.setLevel(2);  // INFO 级别（显示信息和错误）
KernelLogger.setLevel(1);  // ERROR 级别（仅显示错误）
KernelLogger.setLevel(0);  // NONE（不显示任何日志）
```

#### `setLocale(locale)`

设置语言。

**参数**:
- `locale` (string): 语言代码，如 `'zh-CN'` 或 `'en'`

**示例**:
```javascript
KernelLogger.setLocale('zh-CN');  // 中文
KernelLogger.setLocale('en');     // 英文
```

#### `setIncludeStack(flag)`

设置是否在调试日志中包含调用栈。

**参数**:
- `flag` (boolean): 是否包含调用栈

#### `setIncludeSourceFile(flag)`

设置是否在日志中包含源文件名。

**参数**:
- `flag` (boolean): 是否包含源文件名

#### `setMaxMetaLength(length)`

设置元数据最大长度（用于截断过长的 JSON）。

**参数**:
- `length` (number): 最大长度（默认 2000）

### 日志输出方法

#### `debug(subsystem, message, meta)`

输出调试日志。

**参数**:
- `subsystem` (string): 子系统/模块名称
- `message` (string): 日志消息
- `meta` (any): 可选的元数据对象

**示例**:
```javascript
KernelLogger.debug("MyModule", "调试信息", { key: 'value' });
```

#### `info(subsystem, message, meta)`

输出信息日志。

**参数**:
- `subsystem` (string): 子系统/模块名称
- `message` (string): 日志消息
- `meta` (any): 可选的元数据对象

**示例**:
```javascript
KernelLogger.info("MyModule", "操作成功");
```

#### `warn(subsystem, message, meta)`

输出警告日志。

**参数**:
- `subsystem` (string): 子系统/模块名称
- `message` (string): 日志消息
- `meta` (any): 可选的元数据对象

**示例**:
```javascript
KernelLogger.warn("MyModule", "警告信息", { reason: 'xxx' });
```

#### `error(subsystem, message, meta)`

输出错误日志。

**参数**:
- `subsystem` (string): 子系统/模块名称
- `message` (string): 日志消息
- `meta` (any): 可选的元数据对象（通常是 Error 对象）

**示例**:
```javascript
try {
    // 代码
} catch (error) {
    KernelLogger.error("MyModule", "操作失败", error);
}
```

#### `log(levelName, subsystem, message, meta)`

通用日志方法（内部使用）。

**参数**:
- `levelName` (string): 级别名称（'DEBUG', 'INFO', 'WARN', 'ERROR'）
- `subsystem` (string): 子系统/模块名称
- `message` (string): 日志消息
- `meta` (any): 可选的元数据对象

## 日志格式

日志输出格式：

```
[内核][子系统名] [级别] <时间戳> - <消息> [元数据]
```

**示例输出**:
```
[内核][ProcessManager] [信息] 2024-12-05 16:10:39.226 - 程序启动成功
[内核][MemoryManager] [调试] 2024-12-05 16:10:40.123 - 分配内存 { heapId: 1, size: 1024 }
[内核][NotificationManager] [错误] 2024-12-05 16:10:41.456 - 通知创建失败 Error: ...
```

## 使用示例

### 基本使用

```javascript
// 设置日志级别
KernelLogger.setLevel(3);  // DEBUG

// 输出不同级别的日志
KernelLogger.debug("MyApp", "调试信息");
KernelLogger.info("MyApp", "操作成功");
KernelLogger.warn("MyApp", "警告信息");
KernelLogger.error("MyApp", "错误信息", error);
```

### 在程序中使用

```javascript
// 在程序初始化时
__init__: async function(pid, initArgs) {
    KernelLogger.info("MyApp", `程序启动，PID: ${pid}`);
    
    try {
        // 初始化逻辑
        KernelLogger.debug("MyApp", "初始化完成");
    } catch (error) {
        KernelLogger.error("MyApp", "初始化失败", error);
        throw error;
    }
}
```

### 错误处理

```javascript
try {
    // 可能出错的代码
    await someAsyncOperation();
} catch (error) {
    KernelLogger.error("MyApp", "操作失败", {
        error: error.message,
        stack: error.stack,
        context: { /* 上下文信息 */ }
    });
}
```

## 错误抑制机制

为了防止无限循环报错，KernelLogger 实现了错误抑制机制：

- 最多显示 50 个错误
- 超过限制后，错误会被抑制
- 10 秒后重置错误计数

## 注意事项

1. **日志级别**: 默认级别是 DEBUG (3)，生产环境建议设置为 INFO (2) 或 ERROR (1)
2. **性能影响**: 日志输出会影响性能，建议在生产环境中降低日志级别
3. **元数据大小**: 过大的元数据会被截断（默认最大 2000 字符）
4. **源文件追踪**: 源文件追踪功能会增加性能开销，可在生产环境中关闭

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述

