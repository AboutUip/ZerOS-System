# ScheduleTaskManager API 文档

## 概述

`ScheduleTaskManager` 是 ZerOS 内核的计划任务管理器，负责管理系统级的计划任务。支持在特定情况（系统启动完成、系统关闭前等）或特定时间（或时间区间）运行特定程序。计划任务数据持久化存储在 `LocalSData.json` 中。

## 特性

- **多种触发类型**：支持系统启动、系统关闭、特定时间、时间区间、间隔时间等触发方式
- **权限管控**：普通计划任务需要特殊权限，系统启动后的计划任务需要危险权限（仅管理员可授予）
- **持久化存储**：计划任务数据自动保存到 `LocalSData.json`，系统重启后自动恢复
- **自动执行**：系统启动/关闭时自动执行对应任务，时间任务自动调度
- **兼容 autoStart**：计划任务可以启动设置了 `autoStart=true` 的程序（普通用户无法手动启动这些程序）

## 依赖

- `ProcessManager` - 进程管理器（用于启动程序）
- `LStorage` - 本地存储（用于持久化计划任务数据）
- `ApplicationAssetManager` - 应用程序资源管理器（用于验证程序是否存在）
- `PermissionManager` - 权限管理器（用于权限验证）
- `KernelLogger` - 内核日志（用于日志记录）

## 数据存储

计划任务数据存储在 `LocalSData.json` 文件的 `scheduleTaskManager.tasks` 键中：

```json
{
  "system": {
    "scheduleTaskManager.tasks": [
      {
        "id": "task_1234567890_abc123",
        "programName": "terminal",
        "triggerType": "SYSTEM_STARTUP",
        "triggerConfig": {},
        "enabled": true,
        "createdAt": 1234567890000,
        "updatedAt": 1234567890000,
        "lastRunAt": 0,
        "runCount": 0,
        "createdBy": "myapp",
        "requiresStartupPermission": false
      }
    ]
  }
}
```

## 触发类型

### TRIGGER_TYPE 枚举

```javascript
ScheduleTaskManager.TRIGGER_TYPE = {
    SYSTEM_STARTUP: 'SYSTEM_STARTUP',      // 系统启动完成
    SYSTEM_SHUTDOWN: 'SYSTEM_SHUTDOWN',    // 系统关闭前
    SPECIFIC_TIME: 'SPECIFIC_TIME',         // 特定时间（如每天 09:30）
    TIME_RANGE: 'TIME_RANGE',              // 时间区间（如 09:00-18:00，每 30 分钟）
    INTERVAL: 'INTERVAL'                   // 间隔时间（周期性任务，如每 60 分钟）
};
```

### 触发配置说明

#### SYSTEM_STARTUP / SYSTEM_SHUTDOWN
不需要额外配置，`triggerConfig` 可以为空对象 `{}`。

#### SPECIFIC_TIME（特定时间）
```javascript
{
    time: '09:30'  // 格式：HH:mm（24小时制）
}
```
- 每天在指定时间执行一次
- 如果目标时间已过，会在第二天执行

#### TIME_RANGE（时间区间）
```javascript
{
    startTime: '09:00',   // 开始时间（格式：HH:mm）
    endTime: '18:00',      // 结束时间（格式：HH:mm）
    interval: 30           // 执行间隔（分钟数，至少1分钟）
}
```
- 在指定时间区间内，每隔 `interval` 分钟执行一次
- 每分钟检查一次是否到达执行时间

#### INTERVAL（间隔时间）
```javascript
{
    interval: 60  // 执行间隔（分钟数，至少1分钟）
}
```
- 每隔指定分钟数执行一次
- 创建后立即执行一次，然后按间隔重复执行

## 权限要求

计划任务 API 调用需要相应的权限：

- **SCHEDULE_TASK_CREATE** (特殊权限): 创建计划任务
- **SCHEDULE_TASK_MANAGE** (特殊权限): 管理计划任务（更新、删除、启用/禁用）
- **SCHEDULE_TASK_STARTUP** (危险权限): 创建系统启动后的计划任务（仅管理员可授予）

**注意**：
- 普通计划任务（非系统启动任务）需要 `SCHEDULE_TASK_CREATE` 权限
- 系统启动后的计划任务需要 `SCHEDULE_TASK_STARTUP` 权限（危险权限）
- 特殊权限需要用户确认，首次使用时弹出权限请求对话框
- 危险权限需要管理员用户才能授予

## 通过 ProcessManager 调用

所有计划任务功能都通过 `ProcessManager.callKernelAPI` 调用：

```javascript
// 创建计划任务
const taskId = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.create',
    [{
        programName: 'terminal',
        triggerType: 'SYSTEM_STARTUP',
        triggerConfig: {},
        enabled: true
    }, false]  // requiresStartupPermission = false
);

// 获取所有任务
const tasks = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.getAll',
    []
);
```

## API 方法

### 任务管理

#### `ScheduleTask.create(taskConfig, requiresStartupPermission)`

创建计划任务。

**参数**:
- `taskConfig` (Object, 必需): 任务配置
  - `programName` (string, 必需): 程序名称
  - `triggerType` (string, 必需): 触发类型（`SYSTEM_STARTUP`、`SYSTEM_SHUTDOWN`、`SPECIFIC_TIME`、`TIME_RANGE`、`INTERVAL`）
  - `triggerConfig` (Object, 必需): 触发配置（根据触发类型不同而不同）
  - `enabled` (boolean, 可选): 是否启用（默认 `true`）
- `requiresStartupPermission` (boolean, 可选): 是否需要系统启动权限（默认 `false`）
  - `true`: 系统启动后的计划任务，需要 `SCHEDULE_TASK_STARTUP` 权限（危险权限）
  - `false`: 普通计划任务，需要 `SCHEDULE_TASK_CREATE` 权限（特殊权限）

**返回值**: `Promise<string>` - 任务ID

**示例**:
```javascript
// 创建系统启动后的计划任务（需要危险权限）
const taskId = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.create',
    [{
        programName: 'filemanager',
        triggerType: 'SYSTEM_STARTUP',
        triggerConfig: {},
        enabled: true
    }, true]  // requiresStartupPermission = true
);

// 创建特定时间任务（每天 09:30 运行）
const taskId2 = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.create',
    [{
        programName: 'terminal',
        triggerType: 'SPECIFIC_TIME',
        triggerConfig: {
            time: '09:30'
        },
        enabled: true
    }, false]  // requiresStartupPermission = false
);

// 创建时间区间任务（09:00-18:00，每 30 分钟运行一次）
const taskId3 = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.create',
    [{
        programName: 'musicplayer',
        triggerType: 'TIME_RANGE',
        triggerConfig: {
            startTime: '09:00',
            endTime: '18:00',
            interval: 30
        },
        enabled: true
    }, false]
);

// 创建间隔任务（每 60 分钟运行一次）
const taskId4 = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.create',
    [{
        programName: 'timer',
        triggerType: 'INTERVAL',
        triggerConfig: {
            interval: 60
        },
        enabled: true
    }, false]
);
```

#### `ScheduleTask.delete(taskId)`

删除计划任务。

**参数**:
- `taskId` (string, 必需): 任务ID

**返回值**: `Promise<boolean>` - 是否成功

**权限**: 需要 `SCHEDULE_TASK_MANAGE` 权限

**示例**:
```javascript
await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.delete',
    ['task_1234567890_abc123']
);
```

#### `ScheduleTask.update(taskId, updates)`

更新计划任务。

**参数**:
- `taskId` (string, 必需): 任务ID
- `updates` (Object, 必需): 更新内容
  - `enabled` (boolean, 可选): 是否启用
  - `triggerConfig` (Object, 可选): 触发配置

**返回值**: `Promise<boolean>` - 是否成功

**权限**: 需要 `SCHEDULE_TASK_MANAGE` 权限

**示例**:
```javascript
// 禁用任务
await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.update',
    ['task_1234567890_abc123', { enabled: false }]
);

// 更新触发配置
await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.update',
    ['task_1234567890_abc123', {
        triggerConfig: {
            time: '10:00'  // 改为 10:00 执行
        }
    }]
);
```

#### `ScheduleTask.get(taskId)`

获取计划任务信息。

**参数**:
- `taskId` (string, 必需): 任务ID

**返回值**: `Promise<Object|null>` - 任务信息对象，如果不存在则返回 `null`

**权限**: 无需权限（读取操作）

**示例**:
```javascript
const task = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.get',
    ['task_1234567890_abc123']
);

if (task) {
    console.log('任务信息:', task);
    console.log('程序名称:', task.programName);
    console.log('触发类型:', task.triggerType);
    console.log('是否启用:', task.enabled);
    console.log('运行次数:', task.runCount);
}
```

#### `ScheduleTask.getAll()`

获取所有计划任务。

**参数**: 无

**返回值**: `Promise<Array>` - 任务列表

**权限**: 无需权限（读取操作）

**示例**:
```javascript
const tasks = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.getAll',
    []
);

console.log(`共有 ${tasks.length} 个计划任务`);
tasks.forEach(task => {
    console.log(`- ${task.id}: ${task.programName} (${task.triggerType})`);
});
```

#### `ScheduleTask.setEnabled(taskId, enabled)`

启用/禁用计划任务。

**参数**:
- `taskId` (string, 必需): 任务ID
- `enabled` (boolean, 必需): 是否启用

**返回值**: `Promise<boolean>` - 是否成功

**权限**: 需要 `SCHEDULE_TASK_MANAGE` 权限

**示例**:
```javascript
// 启用任务
await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.setEnabled',
    ['task_1234567890_abc123', true]
);

// 禁用任务
await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.setEnabled',
    ['task_1234567890_abc123', false]
);
```

## 任务信息对象

任务信息对象包含以下字段：

```javascript
{
    id: string,                    // 任务ID（自动生成）
    programName: string,            // 程序名称
    triggerType: string,            // 触发类型
    triggerConfig: Object,          // 触发配置
    enabled: boolean,               // 是否启用
    createdAt: number,              // 创建时间戳（毫秒）
    updatedAt: number,              // 更新时间戳（毫秒）
    lastRunAt: number,              // 最后运行时间戳（毫秒），0 表示未运行
    runCount: number,               // 运行次数
    createdBy: string,              // 创建者（程序名称或PID）
    requiresStartupPermission: boolean  // 是否需要系统启动权限
}
```

## 使用示例

### 示例 1: 系统启动后自动打开文件管理器

```javascript
// 在程序的 __init__ 方法中
async __init__(pid, initArgs) {
    this.pid = pid;
    
    try {
        // 创建系统启动后的计划任务（需要危险权限）
        const taskId = await ProcessManager.callKernelAPI(
            this.pid,
            'ScheduleTask.create',
            [{
                programName: 'filemanager',
                triggerType: 'SYSTEM_STARTUP',
                triggerConfig: {},
                enabled: true
            }, true]  // requiresStartupPermission = true
        );
        
        console.log('计划任务创建成功:', taskId);
    } catch (error) {
        if (error.message.includes('没有权限')) {
            console.error('权限不足，无法创建系统启动后的计划任务');
        } else {
            console.error('创建计划任务失败:', error.message);
        }
    }
}
```

### 示例 2: 每天定时执行任务

```javascript
// 创建每天 09:30 运行的任务
const taskId = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.create',
    [{
        programName: 'terminal',
        triggerType: 'SPECIFIC_TIME',
        triggerConfig: {
            time: '09:30'
        },
        enabled: true
    }, false]
);
```

### 示例 3: 工作时间定期执行任务

```javascript
// 创建工作时间（09:00-18:00）每 30 分钟运行一次的任务
const taskId = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.create',
    [{
        programName: 'musicplayer',
        triggerType: 'TIME_RANGE',
        triggerConfig: {
            startTime: '09:00',
            endTime: '18:00',
            interval: 30
        },
        enabled: true
    }, false]
);
```

### 示例 4: 周期性任务

```javascript
// 创建每 60 分钟运行一次的任务
const taskId = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.create',
    [{
        programName: 'timer',
        triggerType: 'INTERVAL',
        triggerConfig: {
            interval: 60
        },
        enabled: true
    }, false]
);
```

### 示例 5: 管理系统关闭前的任务

```javascript
// 创建系统关闭前执行的任务
const taskId = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.create',
    [{
        programName: 'settings',
        triggerType: 'SYSTEM_SHUTDOWN',
        triggerConfig: {},
        enabled: true
    }, false]
);
```

### 示例 6: 查询和管理任务

```javascript
// 获取所有任务
const tasks = await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.getAll',
    []
);

// 查找特定程序的任务
const fileManagerTasks = tasks.filter(task => 
    task.programName === 'filemanager'
);

// 禁用所有文件管理器任务
for (const task of fileManagerTasks) {
    await ProcessManager.callKernelAPI(
        this.pid,
        'ScheduleTask.setEnabled',
        [task.id, false]
    );
}

// 删除特定任务
await ProcessManager.callKernelAPI(
    this.pid,
    'ScheduleTask.delete',
    [taskId]
);
```

## 注意事项

### 1. 权限要求

- **普通计划任务**：需要 `SCHEDULE_TASK_CREATE` 权限（特殊权限，需要用户确认）
- **系统启动后的计划任务**：需要 `SCHEDULE_TASK_STARTUP` 权限（危险权限，仅管理员可授予）
- **管理任务**：需要 `SCHEDULE_TASK_MANAGE` 权限（特殊权限，需要用户确认）

### 2. autoStart 程序兼容性

- 计划任务可以启动设置了 `autoStart=true` 的程序
- 普通用户无法手动启动 `autoStart=true` 的程序
- 系统启动时，只有管理员才会自动启动 `autoStart=true` 的程序
- 计划任务启动程序时，会传递 `scheduledTask: true` 标志，绕过 `autoStart` 权限检查

### 3. 时间格式

- 所有时间格式必须为 `HH:mm`（24小时制）
- 例如：`'09:30'`、`'18:00'`、`'23:59'`

### 4. 间隔时间

- `TIME_RANGE` 和 `INTERVAL` 类型的 `interval` 参数必须是整数，且至少为 1 分钟
- `INTERVAL` 类型任务创建后立即执行一次，然后按间隔重复执行

### 5. 系统启动/关闭任务

- `SYSTEM_STARTUP` 任务在系统启动完成后执行
- `SYSTEM_SHUTDOWN` 任务在系统关闭前执行（页面卸载时）
- 系统关闭任务最多等待 5 秒完成

### 6. 任务持久化

- 所有计划任务自动保存到 `LocalSData.json`
- 系统重启后自动恢复所有任务
- 时间任务会在系统启动后自动重新调度

### 7. 任务执行

- 任务执行时会启动指定的程序
- 如果程序不存在，任务执行会失败并记录错误
- 任务执行失败不会影响其他任务的执行

### 8. 任务统计

- 每个任务记录运行次数（`runCount`）和最后运行时间（`lastRunAt`）
- 任务统计信息会持久化保存

## 错误处理

所有 API 调用都应该使用 try-catch 处理错误：

```javascript
try {
    const taskId = await ProcessManager.callKernelAPI(
        this.pid,
        'ScheduleTask.create',
        [taskConfig, false]
    );
    console.log('任务创建成功:', taskId);
} catch (error) {
    if (error.message.includes('没有权限')) {
        console.error('权限不足:', error.message);
    } else if (error.message.includes('程序不存在')) {
        console.error('程序不存在:', error.message);
    } else if (error.message.includes('无效的触发类型')) {
        console.error('触发类型错误:', error.message);
    } else {
        console.error('创建任务失败:', error.message);
    }
}
```

## 相关文档

- [ProcessManager API](./ProcessManager.md) - 进程管理器和内核 API 调用
- [PermissionManager API](./PermissionManager.md) - 权限管理系统
- [LStorage API](./LStorage.md) - 本地存储系统
- [ApplicationAssetManager API](./ApplicationAssetManager.md) - 应用程序资源管理

---

**最后更新**: 2026-01-06  
**维护者**: ZerOS 安全团队

