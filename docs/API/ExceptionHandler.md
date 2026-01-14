# ExceptionHandler API 文档

异常处理管理器（Exception Handler Manager）提供结构化异常处理（SEH）机制，支持4种异常等级，用于处理系统、内核、程序和服务异常。

## 模块概述

**位置**：`kernel/core/exceptionHM/exceptionHandler.js`

**功能**：
- 提供统一的异常报告接口
- 支持4种异常等级（内核异常、系统异常、程序异常、服务异常）
- 自动处理不同等级的异常（BIOS安全模式、蓝屏、进程终止、日志记录）
- 与BIOS管理器集成，支持清除内核异常标志

**依赖**：
- `KernelLogger` - 日志记录
- `LStorage` - 持久化存储（用于保存内核异常标志）
- `SafeModeManager` - 安全模式管理
- `BIOSManager` - BIOS管理器（用于清除内核异常标志）
- `ProcessManager` - 进程管理（用于终止异常程序）
- `NotificationManager` - 通知管理（用于报告程序异常）

## 异常等级

### ExceptionLevel 枚举

```javascript
ExceptionHandler.ExceptionLevel = {
    KERNEL: 'KERNEL',   // 内核异常：严重不可修复，进入BIOS安全模式
    SYSTEM: 'SYSTEM',   // 系统异常：蓝屏，强制停止所有程序，自检后重启
    PROGRAM: 'PROGRAM', // 程序异常：强制停止该程序，kill进程
    SERVICE: 'SERVICE'  // 服务异常：仅记录日志
}
```

### 异常等级说明

#### 1. 内核异常 (KERNEL)
- **严重程度**：最高
- **处理方式**：
  - 设置持久化标志，阻止正常启动
  - 自动进入BIOS安全模式
  - 系统重启后必须进入BIOS，直到用户在BIOS中选择"立即全面自检并强制进入系统"
- **使用场景**：内核模块严重错误、系统核心组件损坏

#### 2. 系统异常 (SYSTEM)
- **严重程度**：高
- **处理方式**：
  - 强制停止所有正在运行的程序（除Exploit程序）
  - 显示蓝屏界面，报告异常信息
  - 执行系统自检（内存、文件系统、进程管理器）
  - 等待15-60秒后自动重启系统
- **使用场景**：系统资源耗尽、关键服务崩溃

#### 3. 程序异常 (PROGRAM)
- **严重程度**：中
- **处理方式**：
  - 强制终止异常程序进程
  - 通过通知管理器向用户报告
  - 记录异常日志
- **使用场景**：程序崩溃、未捕获异常、资源泄漏

#### 4. 服务异常 (SERVICE)
- **严重程度**：低
- **处理方式**：
  - 仅记录日志（使用内核日志模块）
  - 不影响系统运行
- **使用场景**：服务连接失败、非关键服务错误

## API 方法

### reportException(level, message, details, pid)

报告异常（公共API，供程序调用）

**参数**：
- `level` (string, 必需) - 异常等级，必须是 `ExceptionLevel` 枚举值之一
- `message` (string, 必需) - 异常消息描述
- `details` (Object, 可选) - 异常详情对象，默认为 `{}`
- `pid` (number, 可选) - 进程ID，用于程序异常，默认为 `null`（使用当前调用者PID）

**返回值**：`Promise<void>`

**异常**：
- 如果 `level` 不是有效的异常等级，抛出 `Error`

**使用示例**：

```javascript
// 报告程序异常
await KernelAPI.call('Exception.report', [
    'PROGRAM',
    '程序发生严重错误',
    { errorCode: 'ERR_001', stack: error.stack },
    null  // 使用当前进程PID
]);

// 报告系统异常
await KernelAPI.call('Exception.report', [
    'SYSTEM',
    '系统资源耗尽',
    { memoryUsage: '95%', cpuUsage: '100%' }
]);

// 报告内核异常
await KernelAPI.call('Exception.report', [
    'KERNEL',
    '内核模块严重错误',
    { module: 'MemoryManager', error: '内存分配失败' }
]);

// 报告服务异常
await KernelAPI.call('Exception.report', [
    'SERVICE',
    '服务连接失败',
    { service: 'NetworkService', endpoint: 'https://api.example.com' }
]);
```

### canNormalBoot()

检查是否可以正常启动（用于启动时检查内核异常标志）

**返回值**：`boolean` - 如果可以正常启动返回 `true`，否则返回 `false`

**说明**：
- 检查内存中的内核异常标志
- 检查持久化的 `exceptionHandler.blockNormalBoot` 标志
- 如果任一标志为 `true`，返回 `false`

**使用示例**：

```javascript
// 在启动流程中检查
if (typeof ExceptionHandler !== 'undefined') {
    if (!ExceptionHandler.canNormalBoot()) {
        // 强制进入BIOS安全模式
        SafeModeManager.enableSafeMode();
        return; // 中断启动流程
    }
}
```

### clearKernelExceptionFlag()

清除内核异常标志（在BIOS中选择立即全面自检并强制进入系统时调用）

**返回值**：`void`

**说明**：
- 清除内存中的内核异常标志
- 清除持久化的 `exceptionHandler.kernelExceptionFlag` 标志
- 清除持久化的 `exceptionHandler.blockNormalBoot` 标志
- 系统可以正常启动

**使用示例**：

```javascript
// 在BIOS管理器中调用
if (typeof ExceptionHandler !== 'undefined') {
    ExceptionHandler.clearKernelExceptionFlag();
    // 系统将在下次启动时正常启动
}
```

### init()

初始化异常处理管理器

**返回值**：`void`

**说明**：
- 检查是否有未处理的内核异常标志（从LStorage读取）
- 如果检测到内核异常标志，设置内存标志并记录日志
- 通常由模块自动调用，无需手动调用

## 权限要求

**API权限**：`SYSTEM_NOTIFICATION`（普通权限，自动授予）

所有程序都可以报告异常，无需特殊权限。

## 使用场景

### 场景1：程序崩溃处理

```javascript
try {
    // 程序逻辑
    await someCriticalOperation();
} catch (error) {
    // 报告程序异常
    await KernelAPI.call('Exception.report', [
        'PROGRAM',
        `程序崩溃: ${error.message}`,
        {
            errorCode: 'CRASH_001',
            stack: error.stack,
            timestamp: Date.now()
        }
    ]);
    // 程序将被自动终止
}
```

### 场景2：系统资源监控

```javascript
// 监控系统资源
const memoryUsage = getMemoryUsage();
if (memoryUsage > 0.95) {
    await KernelAPI.call('Exception.report', [
        'SYSTEM',
        '系统内存耗尽',
        {
            memoryUsage: `${(memoryUsage * 100).toFixed(1)}%`,
            availableMemory: getAvailableMemory()
        }
    ]);
    // 系统将显示蓝屏，执行自检后重启
}
```

### 场景3：内核模块错误

```javascript
// 内核模块检测到严重错误
if (criticalError) {
    await KernelAPI.call('Exception.report', [
        'KERNEL',
        '内核模块严重错误',
        {
            module: 'MemoryManager',
            error: '内存分配失败',
            details: errorDetails
        }
    ]);
    // 系统将进入BIOS安全模式
}
```

### 场景4：服务错误记录

```javascript
// 非关键服务错误
try {
    await networkService.connect();
} catch (error) {
    // 仅记录日志，不影响系统运行
    await KernelAPI.call('Exception.report', [
        'SERVICE',
        '网络服务连接失败',
        {
            service: 'NetworkService',
            endpoint: endpoint,
            error: error.message
        }
    ]);
}
```

## 异常处理流程

### 内核异常处理流程

```
1. 程序调用 Exception.report('KERNEL', ...)
   ↓
2. 设置内核异常标志（持久化到LStorage）
   ↓
3. 启用安全模式（SafeModeManager.enableSafeMode()）
   ↓
4. 设置阻止正常启动标志
   ↓
5. 跳转到BIOS（如果BIOSManager可用）或刷新页面
   ↓
6. 系统重启后，bootloader检查内核异常标志
   ↓
7. 如果检测到标志，强制进入BIOS安全模式
   ↓
8. 用户在BIOS中选择"清除内核异常标志并强制进入系统"
   ↓
9. 清除标志，系统可以正常启动
```

### 系统异常处理流程

```
1. 程序调用 Exception.report('SYSTEM', ...)
   ↓
2. 强制停止所有正在运行的程序（除Exploit）
   ↓
3. 显示蓝屏界面，展示错误信息
   ↓
4. 执行系统自检（内存、文件系统、进程管理器）
   ↓
5. 等待15-60秒（随机）
   ↓
6. 自动重启系统
```

### 程序异常处理流程

```
1. 程序调用 Exception.report('PROGRAM', ..., pid)
   ↓
2. 获取进程信息
   ↓
3. 强制终止进程（ProcessManager.terminateProcess(pid)）
   ↓
4. 显示通知给用户（NotificationManager.create()）
   ↓
5. 记录异常日志
```

### 服务异常处理流程

```
1. 程序调用 Exception.report('SERVICE', ...)
   ↓
2. 记录日志（KernelLogger.error()）
   ↓
3. 完成（不影响系统运行）
```

## 注意事项

1. **内核异常**：一旦触发，系统将无法正常启动，必须通过BIOS清除标志
2. **系统异常**：会强制停止所有程序并重启系统，请谨慎使用
3. **程序异常**：会自动终止程序，确保程序状态已保存
4. **服务异常**：仅记录日志，适合非关键错误
5. **权限**：所有程序都可以报告异常，使用普通权限（自动授予）

## 相关文档

- [ProcessManager API](./ProcessManager.md) - 进程管理
- [KernelLogger API](./KernelLogger.md) - 日志系统
- [Starter API](./Starter.md) - 系统启动
- [BIOSManager](../bootloader/BIOS/biosManager.js) - BIOS管理器（源码）

## 更新日志

- **2024** - 初始版本，实现4种异常等级处理机制

