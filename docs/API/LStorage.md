# LStorage API 文档

## 概述

`LStorage` 是 ZerOS 内核的本地存储管理器，负责本地数据的管理、注册等操作。所有系统依赖的本地数据和程序的本地数据都存储在 `D:/LocalSData.json` 文件中。

## 依赖

- `Disk` - 虚拟磁盘管理器（用于文件读写）
- `KernelLogger` - 内核日志系统（用于日志输出）

## 存储结构

```javascript
{
    system: {
        // 系统依赖的本地数据
        [key: string]: any,
        // 注册表（k/v 对象）
        registry: {
            // 环境变量（键值对对象）
            environment: {
                [name: string]: string
            },
            // 其他注册表数据...
        }
    },
    programs: {
        // 程序的本地数据
        [name: string]: {
            [key: string]: any
        }
    }
}
```

**注意**: 环境变量保存在 `system.registry.environment` 中，是一个键值对对象。同时支持 `registry.environment` 和 `registry.env` 两种键名（向后兼容）。

## 初始化

本地存储管理器在系统启动时自动初始化：

```javascript
await LStorage.init();
```

## API 方法

### 系统存储

#### `getSystemStorage(key)`

读取系统本地存储数据。

**参数**:
- `key` (string): 存储键

**返回值**: `Promise<any>` - 存储的值，如果不存在返回 `null`

**示例**:
```javascript
const theme = await LStorage.getSystemStorage('system.theme');
console.log(`当前主题: ${theme}`);
```

#### `setSystemStorage(key, value)`

写入系统本地存储数据。

**参数**:
- `key` (string): 存储键
- `value` (any): 存储的值

**返回值**: `Promise<boolean>` - 是否成功

**权限检查**:
写入系统存储时会根据存储键的重要程度进行权限检查：

1. **危险键（DANGEROUS）** - 需要管理员授权的高风险权限：
   - `userControl.users` - **仅允许内核模块写入**，用户程序绝对禁止写入
   - `userControl.settings` - 需要 `SYSTEM_STORAGE_WRITE_USER_CONTROL` 权限（危险权限）
   - `permissionControl.*` - 需要 `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL` 权限（危险权限）
   - `permissionManager.permissions` - 需要 `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL` 权限（危险权限）

2. **特殊键（SPECIAL）** - 需要用户确认的特殊权限：
   - `desktop.icons` - 需要 `SYSTEM_STORAGE_WRITE_DESKTOP` 权限（特殊权限）
   - `desktop.background` - 需要 `SYSTEM_STORAGE_WRITE_DESKTOP` 权限（特殊权限）
   - `desktop.settings` - 需要 `SYSTEM_STORAGE_WRITE_DESKTOP` 权限（特殊权限）

3. **普通键** - 需要基础权限：
   - 其他系统存储键 - 需要 `SYSTEM_STORAGE_WRITE` 权限（普通权限，自动授予）

**安全策略**:
- `userControl.users` 键只能由 `UserControl` 内核模块写入，任何用户程序都无法直接修改，即使获得相关权限也不行
- 危险权限（如 `SYSTEM_STORAGE_WRITE_USER_CONTROL`）只能由管理员用户授权，普通用户无法授权
- 如果无法获取调用程序的 PID，对于危险键会直接拒绝写入

**示例**:
```javascript
// 写入普通系统存储键（需要 SYSTEM_STORAGE_WRITE 权限）
await LStorage.setSystemStorage('system.theme', 'dark');

// 写入桌面图标（需要 SYSTEM_STORAGE_WRITE_DESKTOP 权限）
await LStorage.setSystemStorage('desktop.icons', iconsArray);

// ⚠️ 警告：用户程序无法直接写入 userControl.users 键
// 该键只能由 UserControl 内核模块操作
```

#### `deleteSystemStorage(key)`

删除系统本地存储数据。

**参数**:
- `key` (string): 存储键

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await LStorage.deleteSystemStorage('system.theme');
```

### 程序存储

#### `getProgramStorage(pid, key)`

读取程序的本地存储数据。

**参数**:
- `pid` (number): 进程 ID
- `key` (string): 存储键

**返回值**: `Promise<any>` - 存储的值，如果不存在返回 `null`

**示例**:
```javascript
const settings = await LStorage.getProgramStorage(pid, 'settings');
if (settings) {
    console.log(`程序设置: ${JSON.stringify(settings)}`);
}
```

#### `setProgramStorage(pid, key, value)`

写入程序的本地存储数据。

**参数**:
- `pid` (number): 进程 ID
- `key` (string): 存储键
- `value` (any): 存储的值

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await LStorage.setProgramStorage(pid, 'settings', {
    theme: 'dark',
    fontSize: 14
});
```

#### `deleteProgramStorage(pid, key)`

删除程序的本地存储数据。

**参数**:
- `pid` (number): 进程 ID
- `key` (string): 存储键（可选，如果不提供则删除整个程序的数据）

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
// 删除指定键
await LStorage.deleteProgramStorage(pid, 'settings');

// 删除整个程序的数据
await LStorage.deleteProgramStorage(pid);
```

#### `registerProgramStorage(pid, key, defaultValue)`

注册程序的本地存储申请（设置默认值）。

**参数**:
- `pid` (number): 进程 ID
- `key` (string): 存储键
- `defaultValue` (any): 默认值（可选）

**返回值**: `Promise<boolean>` - 是否成功

**示例**:
```javascript
await LStorage.registerProgramStorage(pid, 'settings', {
    theme: 'default',
    fontSize: 12
});
```

### 环境变量管理

环境变量保存在注册表中（`system.registry.environment`），是一个键值对对象。环境变量可以在系统级别使用，供所有程序访问。

**权限要求**:
- **读取操作**（`getEnvironmentVariable`、`listEnvironmentVariables`、`getAllEnvironmentVariables`）：需要 `SYSTEM_STORAGE_READ` 权限（普通权限，自动授予）
- **写入操作**（`setEnvironmentVariable`、`deleteEnvironmentVariable`）：需要 `SYSTEM_STORAGE_WRITE` 权限（普通权限，自动授予）

**注意**: 内核模块调用不受权限限制，可以直接访问环境变量。

#### `getEnvironmentVariable(name)`

获取环境变量的值。

**参数**:
- `name` (string): 环境变量名称

**返回值**: `Promise<string|null>` - 环境变量的值，如果不存在返回 `null`

**权限**: 需要 `SYSTEM_STORAGE_READ` 权限

**示例**:
```javascript
// 直接调用（内核模块）
const path = await LStorage.getEnvironmentVariable('PATH');

// 通过 ProcessManager 调用（用户程序）
const path = await ProcessManager.callKernelAPI(pid, 'Environment.get', ['PATH']);
```

#### `setEnvironmentVariable(name, value)`

设置环境变量。如果值为 `null` 或 `undefined`，会自动删除该环境变量。

**参数**:
- `name` (string): 环境变量名称
- `value` (string): 环境变量值（必须是字符串）

**返回值**: `Promise<boolean>` - 是否成功

**权限**: 需要 `SYSTEM_STORAGE_WRITE` 权限

**示例**:
```javascript
// 直接调用（内核模块）
await LStorage.setEnvironmentVariable('PATH', '/usr/bin:/usr/local/bin');

// 通过 ProcessManager 调用（用户程序）
await ProcessManager.callKernelAPI(pid, 'Environment.set', ['PATH', '/usr/bin:/usr/local/bin']);

// 删除环境变量（通过设置 null）
await LStorage.setEnvironmentVariable('TEMP', null);
```

#### `deleteEnvironmentVariable(name)`

删除环境变量。

**参数**:
- `name` (string): 环境变量名称

**返回值**: `Promise<boolean>` - 是否成功（如果环境变量不存在，返回 `false`）

**权限**: 需要 `SYSTEM_STORAGE_WRITE` 权限

**示例**:
```javascript
// 直接调用（内核模块）
const deleted = await LStorage.deleteEnvironmentVariable('TEMP');

// 通过 ProcessManager 调用（用户程序）
const deleted = await ProcessManager.callKernelAPI(pid, 'Environment.delete', ['TEMP']);
```

#### `listEnvironmentVariables()`

列出所有环境变量名称。

**返回值**: `Promise<string[]>` - 环境变量名称数组

**权限**: 需要 `SYSTEM_STORAGE_READ` 权限

**示例**:
```javascript
// 直接调用（内核模块）
const envNames = await LStorage.listEnvironmentVariables();

// 通过 ProcessManager 调用（用户程序）
const envNames = await ProcessManager.callKernelAPI(pid, 'Environment.list', []);
```

#### `getAllEnvironmentVariables()`

获取所有环境变量（返回键值对对象）。

**返回值**: `Promise<Object>` - 环境变量对象 `{ [name: string]: string }`

**权限**: 需要 `SYSTEM_STORAGE_READ` 权限

**注意**: 返回的是对象的副本，修改返回值不会影响实际存储的环境变量。

**示例**:
```javascript
// 直接调用（内核模块）
const allEnv = await LStorage.getAllEnvironmentVariables();

// 通过 ProcessManager 调用（用户程序）
const allEnv = await ProcessManager.callKernelAPI(pid, 'Environment.getAll', []);

// 遍历环境变量
for (const [name, value] of Object.entries(allEnv)) {
    console.log(`${name} = ${value}`);
}
```

## 使用示例

### 示例 1: 系统存储

```javascript
// 保存系统主题
await LStorage.setSystemStorage('system.theme', 'dark');

// 读取系统主题
const theme = await LStorage.getSystemStorage('system.theme');
console.log(`当前主题: ${theme}`);

// 删除系统主题
await LStorage.deleteSystemStorage('system.theme');
```

### 示例 2: 程序存储

```javascript
// 在程序初始化时注册存储
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 注册程序存储（设置默认值）
    await LStorage.registerProgramStorage(pid, 'settings', {
        theme: 'default',
        fontSize: 12,
        autoSave: true
    });
    
    // 读取程序设置
    const settings = await LStorage.getProgramStorage(pid, 'settings');
    if (settings) {
        this.settings = settings;
    }
}

// 保存程序设置
async saveSettings() {
    await LStorage.setProgramStorage(this.pid, 'settings', this.settings);
}

// 程序退出时清理存储（可选）
__exit__: async function() {
    // 保留设置，不删除
    // await LStorage.deleteProgramStorage(this.pid);
}
```

### 示例 3: 程序配置管理

```javascript
class MyApp {
    constructor(pid) {
        this.pid = pid;
        this.config = {};
    }
    
    async init() {
        // 注册配置存储
        await LStorage.registerProgramStorage(this.pid, 'config', {
            windowWidth: 800,
            windowHeight: 600,
            theme: 'default'
        });
        
        // 加载配置
        this.config = await LStorage.getProgramStorage(this.pid, 'config') || {};
    }
    
    async updateConfig(key, value) {
        this.config[key] = value;
        await LStorage.setProgramStorage(this.pid, 'config', this.config);
    }
    
    async resetConfig() {
        await LStorage.deleteProgramStorage(this.pid, 'config');
        await this.init(); // 重新加载默认配置
    }
}
```

### 示例 4: 环境变量管理（内核模块）

内核模块可以直接调用环境变量 API（无需权限检查）：

```javascript
// 设置环境变量
await LStorage.setEnvironmentVariable('PATH', '/usr/bin:/usr/local/bin');
await LStorage.setEnvironmentVariable('HOME', '/home/user');
await LStorage.setEnvironmentVariable('TEMP', '/tmp');

// 获取环境变量
const path = await LStorage.getEnvironmentVariable('PATH');
console.log(`PATH: ${path}`);

// 列出所有环境变量名称
const envNames = await LStorage.listEnvironmentVariables();
console.log('环境变量列表:', envNames);

// 获取所有环境变量
const allEnv = await LStorage.getAllEnvironmentVariables();
console.log('所有环境变量:', allEnv);

// 删除环境变量
await LStorage.deleteEnvironmentVariable('TEMP');

// 在程序中使用环境变量
async function getProgramPath() {
    const path = await LStorage.getEnvironmentVariable('PATH');
    if (path) {
        return path.split(':');
    }
    return [];
}
```

### 示例 5: 环境变量管理（用户程序）

用户程序需要通过 `ProcessManager.callKernelAPI` 调用环境变量 API：

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 获取环境变量（需要 SYSTEM_STORAGE_READ 权限）
    const path = await ProcessManager.callKernelAPI(pid, 'Environment.get', ['PATH']);
    if (path) {
        console.log(`PATH 环境变量: ${path}`);
    }
    
    // 设置环境变量（需要 SYSTEM_STORAGE_WRITE 权限）
    await ProcessManager.callKernelAPI(pid, 'Environment.set', ['CUSTOM_VAR', 'custom_value']);
    
    // 列出所有环境变量
    const envNames = await ProcessManager.callKernelAPI(pid, 'Environment.list', []);
    console.log('环境变量列表:', envNames);
    
    // 获取所有环境变量
    const allEnv = await ProcessManager.callKernelAPI(pid, 'Environment.getAll', []);
    console.log('所有环境变量:', allEnv);
    
    // 删除环境变量
    await ProcessManager.callKernelAPI(pid, 'Environment.delete', ['CUSTOM_VAR']);
}
```

### 示例 6: 环境变量与注册表

环境变量保存在注册表中，可以通过注册表 API 直接访问（不推荐，建议使用专用 API）：

```javascript
// 通过注册表 API 访问环境变量（需要 SYSTEM_STORAGE_READ/WRITE 权限）
const registry = await LStorage.getSystemStorage('registry');
if (registry && registry.environment) {
    console.log('环境变量对象:', registry.environment);
    // 直接修改环境变量（不推荐，建议使用专用 API）
    registry.environment['CUSTOM_VAR'] = 'custom_value';
    await LStorage.setSystemStorage('registry', registry);
}

// 推荐方式：使用环境变量专用 API
await LStorage.setEnvironmentVariable('CUSTOM_VAR', 'custom_value');
```

## 存储文件

- **路径**: `D:/LocalSData.json`
- **格式**: JSON
- **自动保存**: 每次写入操作后自动保存到文件

## 权限与安全

### 系统存储权限分级

系统存储键根据其重要性分为三个级别：

1. **危险键（DANGEROUS）** - 影响系统核心功能，需要管理员授权：
   - `userControl.users` - 用户账户数据（**仅内核模块可写入**）
   - `userControl.settings` - 用户控制设置
   - `permissionControl.*` - 权限控制相关
   - `permissionManager.permissions` - 权限管理器数据

2. **特殊键（SPECIAL）** - 需要用户确认，普通用户可以授权：
   - `desktop.icons` - 桌面图标配置
   - `desktop.background` - 桌面背景配置
   - `desktop.settings` - 桌面设置

3. **普通键** - 基础权限即可操作，自动授予
   - `registry.environment` - 环境变量（通过环境变量 API 访问，需要相应权限）

### 环境变量权限

环境变量 API 的权限要求：

- **读取操作**（`getEnvironmentVariable`、`listEnvironmentVariables`、`getAllEnvironmentVariables`）：
  - 需要 `SYSTEM_STORAGE_READ` 权限（普通权限，自动授予）
  - 内核模块调用不受限制

- **写入操作**（`setEnvironmentVariable`、`deleteEnvironmentVariable`）：
  - 需要 `SYSTEM_STORAGE_WRITE` 权限（普通权限，自动授予）
  - 内核模块调用不受限制

**注意**: 环境变量保存在注册表中，属于系统存储的一部分。用户程序需要通过 `ProcessManager.callKernelAPI` 调用环境变量 API，系统会自动进行权限检查。

### 细粒度权限

系统提供了细粒度的权限控制：

- `SYSTEM_STORAGE_WRITE` - 基础写入权限（普通权限，自动授予）
- `SYSTEM_STORAGE_WRITE_USER_CONTROL` - 写入用户控制相关存储（危险权限，仅管理员可授予）
- `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL` - 写入权限控制相关存储（危险权限，仅管理员可授予）
- `SYSTEM_STORAGE_WRITE_DESKTOP` - 写入桌面相关存储（特殊权限，普通用户可授权）

### 安全策略

1. **`userControl.users` 键的特殊保护**：
   - 该键绝对不允许用户程序直接写入，即使获得 `SYSTEM_STORAGE_WRITE_USER_CONTROL` 权限也不行
   - 只有 `UserControl` 内核模块可以写入此键
   - 这防止了权限提升攻击

2. **权限授权限制**：
   - 危险权限只能由管理员用户授权，普通用户无法授权
   - 普通用户只能授权普通权限和特殊权限

3. **调用来源验证**：
   - 系统会通过调用栈分析验证调用来源
   - 无法验证调用来源时，对于危险键会直接拒绝

## 注意事项

1. **初始化**: 存储管理器在系统启动时自动初始化，通常不需要手动调用 `init()`
2. **异步操作**: 所有存储操作都是异步的，需要使用 `await` 或 `.then()`
3. **自动保存**: 每次写入操作后会自动保存到文件，无需手动调用保存方法
4. **延迟保存**: 如果 D: 分区尚未初始化，数据会先保存在内存中，待分区可用后自动保存
5. **错误处理**: 如果保存失败（如磁盘空间不足），操作会返回 `false`，但数据仍在内存中
6. **程序退出**: 程序退出时可以选择保留或删除其存储数据
7. **权限检查**: 写入系统存储时会自动进行权限检查，缺少权限时会抛出错误
8. **安全限制**: 某些敏感键（如 `userControl.users`）对用户程序完全禁止写入，只能由内核模块操作
9. **环境变量访问**: 
   - 内核模块可以直接调用 `LStorage` 的环境变量 API
   - 用户程序需要通过 `ProcessManager.callKernelAPI` 调用环境变量 API（`Environment.get`、`Environment.set` 等）
   - 环境变量操作需要相应的权限（读取需要 `SYSTEM_STORAGE_READ`，写入需要 `SYSTEM_STORAGE_WRITE`）
10. **环境变量存储**: 环境变量保存在注册表中（`system.registry.environment`），是一个键值对对象

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [Disk.md](./Disk.md) - 虚拟磁盘管理 API
- [PermissionManager.md](./PermissionManager.md) - 权限管理 API（了解权限系统）
- [UserControl.md](./UserControl.md) - 用户控制 API（了解用户级别和权限授权）

