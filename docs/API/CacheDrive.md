# CacheDrive API 文档

## 概述

`CacheDrive` 是 ZerOS 内核的缓存驱动管理器，负责整个系统的缓存管理，统一管理内核、系统和应用程序的缓存。提供统一的缓存 API 供程序使用，支持生命周期管控（过期时间管理）、存在性检查与备用值防护等功能。

## 特性

- **统一管理**：统一管理内核、系统和应用程序的缓存
- **生命周期管控**：支持设置缓存过期时间（TTL），自动清理过期缓存
- **存在性检查**：提供 `has` 方法检查缓存是否存在且未过期
- **备用值防护**：`get` 方法支持默认值，缓存不存在或过期时返回默认值
- **隔离存储**：系统缓存和程序缓存相互隔离，互不干扰
- **自动清理**：自动清理过期缓存，保持缓存数据的新鲜度
- **程序名称标识**：程序缓存使用程序名称（而非 PID）作为标识，确保缓存在程序重启后仍然有效

## 依赖

- `ProcessManager` - 进程管理器（用于进程 ID 管理和权限检查）
- `PermissionManager` - 权限管理器（用于缓存权限验证）
- `FileSystem` - 文件系统（用于缓存目录和元数据文件管理）
- `KernelLogger` - 内核日志（用于日志记录）

## 配置

### 默认路径

- **缓存目录**：`D:/cache/`
- **缓存元数据文件**：`D:/LocalCache.json`

缓存数据存储在 `LocalCache.json` 文件中，不在 `LocalSData.json` 中存放。

## 权限要求

缓存 API 调用需要相应的权限：

- **CACHE_READ** (普通权限): 读取缓存相关操作（`get`, `has`, `getStats`）
- **CACHE_WRITE** (普通权限): 写入/删除缓存相关操作（`set`, `delete`, `clear`）

普通权限自动授予，无需用户确认。

## 通过 ProcessManager 调用

所有缓存功能都通过 `ProcessManager.callKernelAPI` 调用：

```javascript
// 获取 ProcessManager
const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");

// 设置缓存
await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.set',
    ['myKey', { data: 'value' }, { ttl: 3600000 }]  // 1小时过期
);

// 获取缓存
const value = await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.get',
    ['myKey', null]  // 默认值为 null
);
```

## API 方法

### 缓存操作

#### `Cache.set(key, value, options)`

设置缓存值。

**参数**:
- `key` (string, 必需): 缓存键
- `value` (any, 必需): 缓存值（可以是任何可序列化的数据）
- `options` (Object, 可选): 选项
  - `ttl` (number, 默认 `0`): 生存时间（毫秒），`0` 表示永不过期
  - `pid` (number, 可选): 程序 PID（会自动转换为程序名称）
  - `programName` (string, 可选): 程序名称（优先级高于 pid），不提供则为系统缓存

**返回值**: `Promise<void>`

**示例**:
```javascript
// 设置系统缓存（1小时过期）
// 注意：系统级缓存需要使用 ProcessManager.EXPLOIT_PID (10000)
await ProcessManager.callKernelAPI(
    ProcessManager.EXPLOIT_PID,
    'Cache.set',
    ['system.config', { theme: 'dark' }, { ttl: 3600000 }]
);

// 设置程序缓存（永不过期）
// ProcessManager 会自动将 this.pid 转换为程序名称
await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.set',
    ['user.data', { name: 'John' }, { ttl: 0 }]
);
```

#### `Cache.get(key, defaultValue, options)`

获取缓存值。如果缓存不存在或已过期，返回默认值。

**参数**:
- `key` (string, 必需): 缓存键
- `defaultValue` (any, 默认 `null`): 默认值（如果缓存不存在或已过期）
- `options` (Object, 可选): 选项
  - `pid` (number, 可选): 程序 PID（会自动转换为程序名称）
  - `programName` (string, 可选): 程序名称（优先级高于 pid）（会自动转换为程序名称）
  - `programName` (string, 可选): 程序名称（优先级高于 pid），不提供则从系统缓存获取

**返回值**: `Promise<any>` - 缓存值或默认值

**示例**:
```javascript
// 获取系统缓存
// 注意：系统级缓存需要使用 ProcessManager.EXPLOIT_PID (10000)
const config = await ProcessManager.callKernelAPI(
    ProcessManager.EXPLOIT_PID,
    'Cache.get',
    ['system.config', { theme: 'light' }]  // 默认主题为 'light'
);

// 获取程序缓存（ProcessManager 会自动将 this.pid 转换为程序名称）
const userData = await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.get',
    ['user.data', null]
);
```

#### `Cache.has(key, options)`

检查缓存是否存在且未过期。

**参数**:
- `key` (string, 必需): 缓存键
- `options` (Object, 可选): 选项
  - `pid` (number, 可选): 程序 PID（会自动转换为程序名称）
  - `programName` (string, 可选): 程序名称（优先级高于 pid）

**返回值**: `Promise<boolean>` - 是否存在且未过期

**示例**:
```javascript
// 检查系统缓存是否存在
// 注意：系统级缓存需要使用 ProcessManager.EXPLOIT_PID (10000)
const exists = await ProcessManager.callKernelAPI(
    ProcessManager.EXPLOIT_PID,
    'Cache.has',
    ['system.config']
);

if (exists) {
    // 缓存存在，可以直接使用
    const config = await ProcessManager.callKernelAPI(
        ProcessManager.EXPLOIT_PID,
        'Cache.get',
        ['system.config']
    );
}
```

#### `Cache.delete(key, options)`

删除缓存。

**参数**:
- `key` (string, 必需): 缓存键
- `options` (Object, 可选): 选项
  - `pid` (number, 可选): 程序 PID（会自动转换为程序名称）
  - `programName` (string, 可选): 程序名称（优先级高于 pid）

**返回值**: `Promise<boolean>` - 是否成功删除

**示例**:
```javascript
// 删除系统缓存
// 注意：系统级缓存需要使用 ProcessManager.EXPLOIT_PID (10000)
await ProcessManager.callKernelAPI(
    ProcessManager.EXPLOIT_PID,
    'Cache.delete',
    ['system.config']
);

// 删除程序缓存
await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.delete',
    ['user.data']
);
```

#### `Cache.clear(options)`

清空缓存。

**参数**:
- `options` (Object, 可选): 选项
  - `pid` (number, 可选): 程序 PID（会自动转换为程序名称）
  - `programName` (string, 可选): 程序名称（优先级高于 pid），不提供则清空系统缓存
  - `expiredOnly` (boolean, 默认 `false`): 是否只清空过期缓存

**返回值**: `Promise<number>` - 清空的缓存数量

**示例**:
```javascript
// 清空所有系统缓存
// 注意：系统级缓存需要使用 ProcessManager.EXPLOIT_PID (10000)
const count = await ProcessManager.callKernelAPI(
    ProcessManager.EXPLOIT_PID,
    'Cache.clear',
    [{}]
);

// 只清空过期的程序缓存
const expiredCount = await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.clear',
    [{ expiredOnly: true }]
);
```

#### `Cache.getStats(options)`

获取缓存统计信息。

**参数**:
- `options` (Object, 可选): 选项
  - `pid` (number, 可选): 程序 PID（会自动转换为程序名称）
  - `programName` (string, 可选): 程序名称（优先级高于 pid）

**返回值**: `Promise<Object>` - 统计信息对象

**统计信息对象结构**:
```javascript
{
    totalCount: number,      // 总缓存数量（包括过期）
    totalSize: number,        // 总缓存大小（字节，包括过期）
    expiredCount: number,     // 过期缓存数量
    expiredSize: number,      // 过期缓存大小（字节）
    validCount: number,       // 有效缓存数量
    validSize: number         // 有效缓存大小（字节）
}
```

**示例**:
```javascript
// 获取系统缓存统计
// 注意：系统级缓存需要使用 ProcessManager.EXPLOIT_PID (10000)
const stats = await ProcessManager.callKernelAPI(
    ProcessManager.EXPLOIT_PID,
    'Cache.getStats',
    [{}]
);

console.log(`有效缓存: ${stats.validCount} 个，总大小: ${stats.validSize} 字节`);
```

## 使用示例

### 示例 1: 基本缓存操作

```javascript
// 设置缓存（30分钟过期）
await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.set',
    ['api.response', { data: 'result' }, { ttl: 30 * 60 * 1000 }]
);

// 检查缓存是否存在
const exists = await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.has',
    ['api.response']
);

if (exists) {
    // 获取缓存
    const cached = await ProcessManager.callKernelAPI(
        this.pid,
        'Cache.get',
        ['api.response']
    );
    console.log('使用缓存:', cached);
} else {
    // 缓存不存在或已过期，重新获取数据
    const fresh = await fetchData();
    await ProcessManager.callKernelAPI(
        this.pid,
        'Cache.set',
        ['api.response', fresh, { ttl: 30 * 60 * 1000 }]
    );
}
```

### 示例 2: 使用默认值

```javascript
// 获取缓存，如果不存在或过期则使用默认值
const config = await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.get',
    ['user.settings', { theme: 'light', language: 'zh-CN' }]
);

// config 要么是缓存的值，要么是默认值
console.log('配置:', config);
```

### 示例 3: 程序缓存隔离

```javascript
// 程序 A 设置自己的缓存（ProcessManager 会自动将 this.pid 转换为程序名称）
await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.set',
    ['myData', { value: 'A' }, { ttl: 0 }]
);

// 程序 B 设置自己的缓存（相同的 key，但数据不同，因为使用不同的程序名称）
await ProcessManager.callKernelAPI(
    otherPid,
    'Cache.set',
    ['myData', { value: 'B' }, { ttl: 0 }]
);

// 两个程序的缓存互不干扰（使用程序名称作为标识）
const dataA = await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.get',
    ['myData', null]
);  // { value: 'A' }

const dataB = await ProcessManager.callKernelAPI(
    otherPid,
    'Cache.get',
    ['myData', null]
);  // { value: 'B' }
```

### 示例 4: 缓存统计和清理

```javascript
// 获取缓存统计
const stats = await ProcessManager.callKernelAPI(
    this.pid,
    'Cache.getStats',
    [{}]
);

console.log(`缓存统计:
  总数: ${stats.totalCount}
  有效: ${stats.validCount}
  过期: ${stats.expiredCount}
  总大小: ${(stats.totalSize / 1024).toFixed(2)} KB`);

// 如果过期缓存太多，清理过期缓存
if (stats.expiredCount > 10) {
    const cleared = await ProcessManager.callKernelAPI(
        this.pid,
        'Cache.clear',
        [{ expiredOnly: true }]
    );
    console.log(`已清理 ${cleared} 个过期缓存`);
}
```

## 缓存数据结构

缓存元数据存储在 `D:/LocalCache.json` 文件中，结构如下：

```json
{
  "system": {
    "cache.key": {
      "value": "缓存值",
      "expiresAt": 1234567890000,
      "createdAt": 1234567890000,
      "updatedAt": 1234567890000,
      "size": 1024
    }
  },
  "programs": {
    "themeanimator": {
      "cache.key": {
        "value": "程序缓存值",
        "expiresAt": 0,
        "createdAt": 1234567890000,
        "updatedAt": 1234567890000,
        "size": 512
      }
    }
  }
}
```

## 注意事项

1. **缓存隔离**：
   - 系统缓存和程序缓存相互隔离
   - 不同程序的缓存也相互隔离
   - 使用 `pid` 或 `programName` 参数指定程序缓存（`pid` 会自动转换为程序名称）

2. **过期时间**：
   - `ttl` 为 `0` 表示永不过期
   - `ttl > 0` 表示从设置时间开始计算的毫秒数
   - 过期缓存会在访问时自动删除

3. **数据序列化**：
   - 缓存值必须是可序列化的数据（可被 `JSON.stringify` 序列化）
   - 不支持函数、Symbol、undefined 等不可序列化的值

4. **性能考虑**：
   - 缓存元数据有 1 秒的请求缓存，避免频繁读取文件
   - 过期缓存会在加载元数据时自动清理
   - 建议合理设置 `ttl`，避免缓存占用过多空间

5. **错误处理**：
   - 所有方法都返回 Promise，需要使用 `try-catch` 处理错误
   - 如果缓存文件损坏或无法读取，会使用空数据结构

6. **权限要求**：
   - 读取操作需要 `CACHE_READ` 权限
   - 写入/删除操作需要 `CACHE_WRITE` 权限
   - 两种权限都是普通权限，自动授予

## 相关链接

- [ProcessManager API 文档](./ProcessManager.md) - 进程管理
- [PermissionManager API 文档](./PermissionManager.md) - 权限管理
- [FileSystem API 文档](./FileSystem.md) - 文件系统

