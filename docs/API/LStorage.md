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
        [key: string]: any
    },
    programs: {
        // 程序的本地数据
        [name: string]: {
            [key: string]: any
        }
    }
}
```

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

**示例**:
```javascript
await LStorage.setSystemStorage('system.theme', 'dark');
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

## 存储文件

- **路径**: `D:/LocalSData.json`
- **格式**: JSON
- **自动保存**: 每次写入操作后自动保存到文件

## 注意事项

1. **初始化**: 存储管理器在系统启动时自动初始化，通常不需要手动调用 `init()`
2. **异步操作**: 所有存储操作都是异步的，需要使用 `await` 或 `.then()`
3. **自动保存**: 每次写入操作后会自动保存到文件，无需手动调用保存方法
4. **延迟保存**: 如果 D: 分区尚未初始化，数据会先保存在内存中，待分区可用后自动保存
5. **错误处理**: 如果保存失败（如磁盘空间不足），操作会返回 `false`，但数据仍在内存中
6. **程序退出**: 程序退出时可以选择保留或删除其存储数据

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [Disk.md](./Disk.md) - 虚拟磁盘管理 API

