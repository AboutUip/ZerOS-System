# KernelMemory API 文档

## 概述

`KernelMemory` 是 ZerOS 内核的动态数据存储接口，提供统一的数据存取接口，管理所有内核模块的动态数据。所有数据存储在 Exploit 程序（PID 10000）的内存中。

## 依赖

- `MemoryManager` - 内存管理器（用于内存分配）
- `Heap` - 堆内存（用于数据存储）
- `Shed` - 栈内存（用于地址映射）

## 常量

```javascript
KernelMemory.EXPLOIT_PID = 10000;        // Exploit 程序固定 PID
KernelMemory.EXPLOIT_HEAP_ID = 1;       // Exploit 堆 ID
KernelMemory.EXPLOIT_SHED_ID = 1;       // Exploit 栈 ID
KernelMemory.EXPLOIT_HEAP_SIZE = 1048576; // 1MB Heap 用于存储内核数据
```

## API 方法

### 数据存储

#### `saveData(key, data)`

保存数据到 Exploit 内存。

**参数**:
- `key` (string): 数据键名
- `data` (*): 要保存的数据（会被序列化为 JSON）

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
// 保存简单数据
KernelMemory.saveData('MY_KEY', { name: 'value' });

// 保存复杂数据
KernelMemory.saveData('CONFIG', {
    setting1: true,
    setting2: 'value',
    items: [1, 2, 3]
});
```

#### `loadData(key)`

从 Exploit 内存加载数据。

**参数**:
- `key` (string): 数据键名

**返回值**: `*|null` - 加载的数据或 `null`

**示例**:
```javascript
// 加载数据
const data = KernelMemory.loadData('MY_KEY');
if (data) {
    console.log(data.name);
}
```

#### `hasData(key)`

检查数据是否存在。

**参数**:
- `key` (string): 数据键名

**返回值**: `boolean` - 是否存在

**示例**:
```javascript
if (KernelMemory.hasData('MY_KEY')) {
    const data = KernelMemory.loadData('MY_KEY');
}
```

#### `deleteData(key)`

删除数据。

**参数**:
- `key` (string): 数据键名

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
KernelMemory.deleteData('MY_KEY');
```

### 内存使用情况

#### `getMemoryUsage()`

获取内存使用情况。

**返回值**: `Object` - 内存使用情况对象
```javascript
{
    available: boolean,    // 内存是否可用
    heapSize: number,      // 堆总大小（字节）
    heapUsed: number,      // 堆已使用（字节）
    heapFree: number       // 堆空闲（字节）
}
```

**示例**:
```javascript
const usage = KernelMemory.getMemoryUsage();
console.log(`堆使用: ${usage.heapUsed} / ${usage.heapSize}`);
console.log(`堆空闲: ${usage.heapFree}`);
```

## 内核数据存储键名规范

所有内核动态数据使用统一的键名规范：

| 键名 | 说明 | 示例 |
|------|------|------|
| `APPLICATION_SOP` | 应用程序分区管理表 | 存储所有进程的内存分区信息 |
| `PROGRAM_NAMES` | 程序名称映射 | `Map<pid, programName>` |
| `PROCESS_TABLE` | 进程表 | 存储所有进程信息 |
| `NEXT_PID` | 下一个 PID | 进程 ID 计数器 |
| `NEXT_HEAP_ID` | 下一个堆 ID | 堆 ID 计数器 |
| `NEXT_SHED_ID` | 下一个栈 ID | 栈 ID 计数器 |
| `DISK_SEPARATE_MAP` | 磁盘分区映射表 | 分区名称列表 |
| `DISK_SEPARATE_SIZE` | 磁盘分区大小映射表 | `Map<partitionName, size>` |
| `DISK_FREE_MAP` | 磁盘空闲区映射表 | `Map<partitionName, freeSize>` |
| `DISK_USED_MAP` | 磁盘已用区映射表 | `Map<partitionName, usedSize>` |
| `DISK_CAN_USED` | 磁盘可用状态 | `boolean` |

## 使用示例

### 示例 1: 基本数据存储

```javascript
// 保存配置
const config = {
    theme: 'dark',
    language: 'zh-CN',
    fontSize: 14
};
KernelMemory.saveData('USER_CONFIG', config);

// 加载配置
const loadedConfig = KernelMemory.loadData('USER_CONFIG');
if (loadedConfig) {
    console.log(`主题: ${loadedConfig.theme}`);
}
```

### 示例 2: 检查数据是否存在

```javascript
if (KernelMemory.hasData('USER_CONFIG')) {
    const config = KernelMemory.loadData('USER_CONFIG');
    // 使用配置
} else {
    // 使用默认配置
    const defaultConfig = { theme: 'light' };
    KernelMemory.saveData('USER_CONFIG', defaultConfig);
}
```

### 示例 3: 删除数据

```javascript
// 删除用户配置
KernelMemory.deleteData('USER_CONFIG');
```

### 示例 4: 监控内存使用

```javascript
// 检查内存使用情况
const usage = KernelMemory.getMemoryUsage();
if (usage.available) {
    const usagePercent = (usage.heapUsed / usage.heapSize) * 100;
    console.log(`内存使用率: ${usagePercent.toFixed(2)}%`);
    
    if (usagePercent > 80) {
        console.warn('内存使用率过高，建议清理数据');
    }
}
```

## 数据存储实现细节

### 存储流程

1. 数据序列化为 JSON 字符串
2. 在 Heap 中分配足够的内存空间
3. 将字符串逐字符写入 Heap
4. 在 Shed 的 `resourceLinkArea` 中保存地址和大小信息
5. 使用统一的键名规范管理

### 读取流程

1. 从 Shed 的 `resourceLinkArea` 中读取地址信息
2. 从 Heap 中按地址读取字符串数据
3. 反序列化 JSON 字符串恢复数据
4. 返回原始数据结构

### 内存管理

- **自动分配**: 首次使用时自动分配内存
- **地址管理**: 使用线性分配算法，记录已分配的地址范围
- **内存回收**: 覆盖数据时自动回收旧数据占用的内存
- **边界检查**: 完整的错误处理和边界检查

## 注意事项

1. **数据大小**: 单个数据不能超过 Heap 总大小（1MB）
2. **序列化**: 数据会被序列化为 JSON，不支持函数、Symbol 等不可序列化的类型
3. **键名规范**: 建议使用大写字母和下划线，遵循内核数据存储键名规范
4. **内存限制**: Exploit 程序分配 1MB Heap，所有内核数据共享此空间
5. **性能**: 频繁的保存/加载操作会影响性能，建议批量操作或使用缓存

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [MemoryManager.md](./MemoryManager.md) - 内存管理器 API
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API

