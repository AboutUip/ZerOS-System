# LStorage API 文档

## 概述

`LStorage` 是 ZerOS 内核的本地存储管理器，负责本地数据的管理、注册等操作。系统依赖的本地数据和程序的本地数据存储在 `{partition}/LocalSData.json` 文件中（优先使用 D: 系统盘，如果 D: 不存在则使用第一个可用分区），而动态安装的应用程序注册表存储在 `{partition}/ApplicationTable.json` 文件中（使用相同的分区）。系统支持 A-Z 所有分区，但默认优先使用 D: 系统盘。

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

- **路径**: `{partition}/LocalSData.json`（优先使用 D: 系统盘，如果 D: 不存在则使用第一个可用分区）
- **格式**: JSON
- **自动保存**: 每次写入操作后自动保存到文件
- **多分区支持**: 系统支持 A-Z 所有分区，但默认优先使用 D: 系统盘

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

### 应用程序管理

**重要安全策略**：只有管理员用户可以安装和卸载程序。普通用户（`USER`）禁止安装和卸载程序，需要管理员用户权限（`ADMIN` 或 `DEFAULT_ADMIN`）。

#### `installApplication(programName, asset, sourceFiles)`

安装应用程序到 `ApplicationTable`（动态程序注册表）。

**参数**:
- `programName` (string): 程序名称
- `asset` (Object): 程序资源对象（格式与 `applicationAssets.js` 相同）
- `sourceFiles` (Object, 可选): 源文件 JSON 结构，用于复制文件到 `application/` 目录

**返回值**: `Promise<boolean>` - 是否成功

**权限要求**: 
- **需要管理员用户权限**：只有管理员用户（`ADMIN` 或 `DEFAULT_ADMIN`）可以安装程序，普通用户（`USER`）禁止安装程序
- 需要 `APPLICATION_INSTALL` 权限（危险权限，仅管理员可授予）

**安全策略**：
- 非管理员用户尝试安装程序时，会抛出错误：`安全策略：普通用户不允许安装应用程序，需要管理员权限`
- 该检查在多个层面进行：
  1. **UI 层**：文件管理器在启动 `zominstall` 前会检查管理员权限
  2. **程序层**：`zominstall` 程序在开始安装前会检查管理员权限
  3. **内核层**：`LStorage.installApplication()` 会验证管理员权限和 `APPLICATION_INSTALL` 权限

**存储位置**:
- `ApplicationTable` 存储在 `{partition}/ApplicationTable.json` 文件中（**不是** `LocalSData.json`）
- 使用与 `LocalSData.json` 相同的分区（优先使用 D: 系统盘，如果 D: 不存在则使用第一个可用分区）
- 该文件独立于系统存储，专门用于管理动态安装的应用程序
- 系统支持 A-Z 所有分区，但默认优先使用 D: 系统盘

**功能**:
1. 验证权限（管理员权限和 `APPLICATION_INSTALL` 权限）
2. 如果提供了 `sourceFiles`，复制文件到 `{partition}/application/<程序名>/` 目录（使用系统分区）
3. 更新 `asset` 中的路径为绝对路径
4. 注册程序到 `ApplicationTable`（写入 `{partition}/ApplicationTable.json`）
5. **自动刷新 `ApplicationAssetManager`**（使新程序立即可用）

**示例**:
```javascript
// 通过 ProcessManager 调用（用户程序）
await ProcessManager.callKernelAPI(pid, 'Application.install', [
    'myapp',
    {
        script: 'myapp.js',
        styles: ['myapp.css'],
        icon: 'icon.svg',
        metadata: {
            description: '我的应用',
            version: '1.0.0',
            type: 'GUI'
        }
    },
    {
        'myapp.js': '...文件内容...',
        'myapp.css': '...文件内容...',
        'icon.svg': '...文件内容...'
    }
]);
```

**注意**:
- **只有管理员用户可以安装程序**：普通用户（`USER`）禁止安装程序，需要管理员用户权限（`ADMIN` 或 `DEFAULT_ADMIN`）
- 安装后，`ApplicationAssetManager` 会自动刷新，新程序会立即出现在开始菜单中（需要关闭并重新打开开始菜单）
- 静态程序（注册在 `applicationAssets.js` 中）不需要通过此 API 安装
- 如果动态安装的程序与静态程序同名，动态程序会覆盖静态程序（在 `ApplicationAssetManager` 中，动态程序优先）

#### `uninstallApplication(programName)`

卸载应用程序（从 `ApplicationTable` 中删除并删除所有文件）。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Promise<boolean>` - 是否成功

**权限要求**: 
- **需要管理员用户权限**：只有管理员用户（`ADMIN` 或 `DEFAULT_ADMIN`）可以卸载程序，普通用户（`USER`）禁止卸载程序
- 需要 `APPLICATION_UNINSTALL` 权限（危险权限，仅管理员可授予）

**安全策略**：
- 非管理员用户尝试卸载程序时，会抛出错误：`安全策略：普通用户不允许卸载应用程序，需要管理员权限`
- 该检查在多个层面进行：
  1. **UI 层**：设置程序在调用卸载前会检查管理员权限
  2. **内核层**：`LStorage.uninstallApplication()` 会验证管理员权限和 `APPLICATION_UNINSTALL` 权限

**功能**:
1. 验证权限（管理员权限和 `APPLICATION_UNINSTALL` 权限）
2. 检查是否为静态程序（静态程序不允许卸载）
3. 删除桌面图标和任务栏固定（如果存在）
4. **执行 `uninstall.js`（如果存在）**：在删除文件之前，尝试执行 `D:/application/<程序名>/uninstall.js`
5. 删除 `D:/application/<程序名>/` 目录下的所有文件
6. 从 `ApplicationTable` 中删除程序
7. **自动刷新 `ApplicationAssetManager`**（使卸载的程序立即从列表中移除）

**uninstall.js 执行**：

如果程序目录中存在 `uninstall.js` 文件，卸载流程会在删除文件之前执行它。`uninstall.js` 必须遵守 ZerOS 程序开发约定，作为标准的 ZerOS GUI 程序执行。

**uninstall.js 职责**：

`uninstall.js` 应该负责以下任务：

1. **清理注册表数据**：删除程序在注册表中注册的数据（如配置、缓存键等）
2. **删除缓存文件**：删除程序创建的缓存文件（如 `{partition}/cache/<程序名>/` 目录下的文件，使用缓存分区）
3. **清理其他残留数据**：删除程序创建的其他数据文件（但不包括程序资源文件，因为系统会自动处理）

**重要**：`uninstall.js` **不应该**删除程序资源文件（如脚本、样式、图标等），因为这些文件会在 `uninstall.js` 执行完成后由系统自动删除。

**注意**:
- **只有管理员用户可以卸载程序**：普通用户（`USER`）禁止卸载程序，需要管理员用户权限（`ADMIN` 或 `DEFAULT_ADMIN`）

**uninstall.js 程序结构**：

`uninstall.js` 必须实现以下必需方法：

```javascript
(function(window) {
    'use strict';
    
    const UNINSTALL = {
        pid: null,
        _uninstallContext: null,
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'Uninstall',
                type: 'GUI',
                version: '1.0.0',
                description: '卸载脚本',
                author: 'Your Name',
                copyright: '© 2025',
                permissions: [
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE
                ],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        },
        
        /**
         * 初始化方法
         */
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 从 initArgs.metadata.uninstallContext 获取卸载上下文
            if (initArgs && initArgs.metadata && initArgs.metadata.uninstallContext) {
                this._uninstallContext = initArgs.metadata.uninstallContext;
            }
            
            const programName = this._uninstallContext ? this._uninstallContext.programName : 'unknown';
            const appDirPath = this._uninstallContext ? this._uninstallContext.appDirPath : null;
            
            // 执行清理操作
            // 1. 删除注册表数据
            // 2. 删除缓存文件
            // 3. 清理其他残留数据
            
            // 完成后，程序会自动退出
        },
        
        /**
         * 退出方法
         */
        __exit__: async function() {
            // 清理资源
        }
    };
    
    // 重要：必须导出到 window.UNINSTALL，不能使用其他名称
    if (typeof window !== 'undefined') {
        window.UNINSTALL = UNINSTALL;
    }
    
})(window);
```

**卸载上下文**：

`uninstall.js` 通过 `initArgs.metadata.uninstallContext` 获取卸载上下文：

```javascript
{
    programName: "myapp",              // 程序名称
    appDirPath: "D:/application/myapp", // 程序目录路径
    asset: { ... }                      // 程序资源对象
}
```

**重要提示**：

- **程序对象名称必须为 `UNINSTALL`**：`uninstall.js` 中的程序对象必须命名为 `UNINSTALL`，并导出到 `window.UNINSTALL`
- **不能使用其他名称**：如 `PIANO_UNINSTALL`、`MYAPP_UNINSTALL` 等都是错误的，必须使用 `UNINSTALL`
- **原因**：`LStorage.uninstallApplication()` 使用 `ProcessManager.startProgram()` 启动 `uninstall.js` 时，会查找 `window.UNINSTALL` 来注册程序对象
- **如果使用错误的名称**：程序将无法正确注册，导致加载超时错误
- **执行时机**：`uninstall.js` 在删除程序文件**之前**执行，因此可以访问程序的所有资源文件
- **执行超时**：如果 `uninstall.js` 在 30 秒内未完成，卸载流程会继续，但会记录警告信息
- **错误处理**：如果 `uninstall.js` 执行失败或加载超时，卸载过程会继续，但会记录警告信息

**示例**:
```javascript
// 通过 ProcessManager 调用（用户程序）
await ProcessManager.callKernelAPI(pid, 'Application.uninstall', ['myapp']);
```

**注意**:
- 卸载后，`ApplicationAssetManager` 会自动刷新，程序会立即从开始菜单中消失（需要关闭并重新打开开始菜单）
- 静态程序（注册在 `applicationAssets.js` 中）不允许卸载
- 卸载会删除程序的所有文件，包括脚本、样式、图标和资源文件

#### `getInstalledApplication(programName)`

获取动态安装的应用程序信息。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Promise<Object|null>` - 程序资源对象，如果不存在返回 `null`

**权限要求**: 不需要权限（读取操作）

**示例**:
```javascript
// 通过 ProcessManager 调用（用户程序）
const app = await ProcessManager.callKernelAPI(pid, 'Application.get', ['myapp']);
if (app) {
    console.log(`脚本: ${app.script}`);
    console.log(`图标: ${app.icon}`);
}
```

#### `isApplicationInstalled(programName)`

检查程序是否已动态安装。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Promise<boolean>` - 是否已安装

**权限要求**: 不需要权限（读取操作）

**示例**:
```javascript
// 通过 ProcessManager 调用（用户程序）
const isInstalled = await ProcessManager.callKernelAPI(pid, 'Application.isInstalled', ['myapp']);
if (isInstalled) {
    console.log('程序已安装');
}
```

#### `listInstalledApplications()`

列出所有动态安装的应用程序。

**返回值**: `Promise<Object>` - 应用程序对象 `{ [programName: string]: asset }`

**权限要求**: 不需要权限（读取操作）

**示例**:
```javascript
// 通过 ProcessManager 调用（用户程序）
const apps = await ProcessManager.callKernelAPI(pid, 'Application.list', []);
console.log(`已安装 ${Object.keys(apps).length} 个动态程序`);
```

#### `listInstalledApplicationNames()`

列出所有动态安装的应用程序名称。

**返回值**: `Promise<Array<string>>` - 程序名称数组

**权限要求**: 不需要权限（读取操作）

**示例**:
```javascript
// 通过 ProcessManager 调用（用户程序）
const names = await ProcessManager.callKernelAPI(pid, 'Application.listNames', []);
console.log('已安装的程序:', names);
```

### 应用程序管理注意事项

1. **自动刷新机制**：
   - `installApplication()` 和 `uninstallApplication()` 会自动刷新 `ApplicationAssetManager`
   - 新安装的程序会立即出现在开始菜单中（需要关闭并重新打开开始菜单）
   - 卸载的程序会立即从开始菜单中消失（需要关闭并重新打开开始菜单）

2. **静态程序保护**：
   - 静态程序（注册在 `applicationAssets.js` 中）不允许通过 `uninstallApplication()` 卸载
   - 如果尝试卸载静态程序，会抛出错误

3. **路径处理**：
   - 安装时，相对路径会自动转换为绝对路径（`D:/application/<程序名>/<路径>`）
   - 图标路径会被正确转换，可以在开始菜单中正确显示

4. **权限控制**：
   - `ApplicationTable` 存储在独立的文件 `{partition}/ApplicationTable.json` 中（**不是** `LocalSData.json`）
   - 使用与 `LocalSData.json` 相同的分区（优先使用 D: 系统盘，如果 D: 不存在则使用第一个可用分区）
   - `applicationTable` 键受到特殊保护，只能通过 `installApplication()` 和 `uninstallApplication()` 修改
   - 直接调用 `setSystemStorage('applicationTable', ...)` 会被拒绝
   - 读取 `ApplicationTable` 使用 `getSystemStorage('applicationTable')`，会从 `{partition}/ApplicationTable.json` 读取
   - 写入 `ApplicationTable` 使用 `setSystemStorage('applicationTable', ...)`，会写入到 `{partition}/ApplicationTable.json`

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [Disk.md](./Disk.md) - 虚拟磁盘管理 API
- [PermissionManager.md](./PermissionManager.md) - 权限管理 API（了解权限系统）
- [UserControl.md](./UserControl.md) - 用户控制 API（了解用户级别和权限授权）
- [ApplicationAssetManager.md](./ApplicationAssetManager.md) - 应用程序资源管理器 API
- [ZOMInstall.md](./ZOMInstall.md) - ZOM 程序安装包文档

