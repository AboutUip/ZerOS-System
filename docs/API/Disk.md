# Disk API 文档

## 概述

`Disk` 是 ZerOS 内核的虚拟磁盘管理接口，提供磁盘分区管理、格式化、使用情况统计等功能。所有磁盘数据存储在 Exploit 程序（PID 10000）的内存中，文件系统数据持久化到 localStorage。

## 依赖

- `NodeTreeCollection` - 文件树集合（用于文件系统操作）
- `KernelMemory` - 内核内存（用于存储磁盘元数据）

## 常量

```javascript
Disk.diskSize = 3 * 1024 * 1024 * 1024; // 3GB 总磁盘大小
```

## 初始化

磁盘在系统启动时自动初始化，创建默认分区：

```javascript
Disk.init(); // 自动创建 C: (1GB) 和 D: (2GB) 分区
```

## API 方法

### 磁盘管理

#### `init()`

初始化磁盘分区（自动创建 C: 和 D: 分区）。

**示例**:
```javascript
Disk.init(); // 创建 C: (1GB) 和 D: (2GB)
```

#### `format(separateName, size)`

格式化磁盘分区。

**参数**:
- `separateName` (string): 分区名称（如 `"C:"`, `"D:"`）
- `size` (number): 分区大小（字节）

**示例**:
```javascript
// 格式化 C: 分区，大小为 1GB
Disk.format("C:", 1024 * 1024 * 1024);

// 格式化 D: 分区，大小为 2GB
Disk.format("D:", 2 * 1024 * 1024 * 1024);
```

#### `update()`

更新磁盘使用情况（计算已用和空闲空间）。

**示例**:
```javascript
Disk.update(); // 更新所有分区的使用情况
```

### 磁盘信息

#### `diskSeparateMap` (getter)

获取磁盘分区映射表。

**返回值**: `Map<string, NodeTreeCollection>` - 分区名称到文件树集合的映射

**示例**:
```javascript
const partitions = Disk.diskSeparateMap;
partitions.forEach((nodeTree, partitionName) => {
    console.log(`分区: ${partitionName}`);
});
```

#### `diskSeparateSize` (getter)

获取磁盘分区大小映射表。

**返回值**: `Map<string, number>` - 分区名称到大小的映射

**示例**:
```javascript
const sizes = Disk.diskSeparateSize;
sizes.forEach((size, partitionName) => {
    console.log(`${partitionName}: ${size} 字节`);
});
```

#### `diskFreeMap` (getter)

获取磁盘空闲区映射表。

**返回值**: `Map<string, number>` - 分区名称到空闲空间的映射

**示例**:
```javascript
const free = Disk.diskFreeMap;
free.forEach((freeSize, partitionName) => {
    console.log(`${partitionName} 空闲: ${freeSize} 字节`);
});
```

#### `diskUsedMap` (getter)

获取磁盘已用区映射表。

**返回值**: `Map<string, number>` - 分区名称到已用空间的映射

**示例**:
```javascript
const used = Disk.diskUsedMap;
used.forEach((usedSize, partitionName) => {
    console.log(`${partitionName} 已用: ${usedSize} 字节`);
});
```

#### `canUsed` (getter/setter)

获取或设置磁盘可用状态。

**返回值**: `boolean` - 磁盘是否可用

**示例**:
```javascript
// 检查磁盘是否可用
if (Disk.canUsed) {
    // 执行磁盘操作
}

// 设置磁盘可用状态
Disk.canUsed = true;
```

### Map 操作

#### `getMap(mapName, key)`

从指定的 Map 中获取值。

**参数**:
- `mapName` (string): Map 名称（`'diskSeparateMap'`, `'diskSeparateSize'`, `'diskFreeMap'`, `'diskUsedMap'`）
- `key` (string): 键名

**返回值**: `*` - Map 中的值

**示例**:
```javascript
// 获取 C: 分区的大小
const cSize = Disk.getMap('diskSeparateSize', 'C:');

// 获取 C: 分区的文件树
const cTree = Disk.getMap('diskSeparateMap', 'C:');
```

#### `setMap(mapName, key, value)`

设置 Map 中的值。

**参数**:
- `mapName` (string): Map 名称
- `key` (string): 键名
- `value` (*): 值

**返回值**: `Map` - 更新后的 Map

**示例**:
```javascript
// 设置 C: 分区的大小
Disk.setMap('diskSeparateSize', 'C:', 1024 * 1024 * 1024);
```

#### `deleteMap(mapName, key)`

从 Map 中删除键值对。

**参数**:
- `mapName` (string): Map 名称
- `key` (string): 键名

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
Disk.deleteMap('diskSeparateSize', 'E:');
```

#### `forEachMap(mapName, fn)`

遍历 Map。

**参数**:
- `mapName` (string): Map 名称
- `fn` (Function): 回调函数 `(value, key) => {}`

**示例**:
```javascript
// 遍历所有分区
Disk.forEachMap('diskSeparateSize', (size, partitionName) => {
    console.log(`${partitionName}: ${size} 字节`);
});
```

## 文件系统操作

Disk 本身不直接提供文件操作，文件操作通过 `NodeTreeCollection` 进行：

```javascript
// 获取 C: 分区的文件树
const cTree = Disk.getMap('diskSeparateMap', 'C:');

// 使用 NodeTreeCollection 进行文件操作
// 详见 NodeTree API 文档
```

## 使用示例

### 示例 1: 检查磁盘使用情况

```javascript
// 更新磁盘使用情况
Disk.update();

// 获取所有分区信息
const partitions = Disk.diskSeparateMap;
const sizes = Disk.diskSeparateSize;
const used = Disk.diskUsedMap;
const free = Disk.diskFreeMap;

partitions.forEach((nodeTree, partitionName) => {
    const size = sizes.get(partitionName) || 0;
    const usedSize = used.get(partitionName) || 0;
    const freeSize = free.get(partitionName) || 0;
    
    console.log(`${partitionName}:`);
    console.log(`  总大小: ${size} 字节`);
    console.log(`  已用: ${usedSize} 字节`);
    console.log(`  空闲: ${freeSize} 字节`);
    console.log(`  使用率: ${((usedSize / size) * 100).toFixed(2)}%`);
});
```

### 示例 2: 格式化新分区

```javascript
// 检查是否有足够空间（假设需要 500MB）
const requiredSize = 500 * 1024 * 1024;
let availableSpace = Disk.diskSize;

// 计算已分配的空间
Disk.forEachMap('diskSeparateSize', (size) => {
    availableSpace -= size;
});

if (availableSpace >= requiredSize) {
    // 格式化新分区
    Disk.format('E:', requiredSize);
    Disk.update();
    console.log('分区 E: 格式化成功');
} else {
    console.error('空间不足，无法创建新分区');
}
```

### 示例 3: 获取分区文件树

```javascript
// 获取 C: 分区的文件树
const cTree = Disk.getMap('diskSeparateMap', 'C:');

if (cTree) {
    // 使用 NodeTreeCollection 的方法操作文件
    // 例如：列出根目录文件
    const rootNode = cTree.nodes.get('C:');
    if (rootNode) {
        // 遍历文件
        rootNode.attributes.forEach((file, fileName) => {
            console.log(`文件: ${fileName}`);
        });
        
        // 遍历子目录
        rootNode.children.forEach((child, dirName) => {
            console.log(`目录: ${dirName}`);
        });
    }
}
```

## 数据持久化

磁盘数据持久化到 localStorage：

- **文件系统数据**: 每个分区独立存储，键名为 `filesystem_{partitionName}`（如 `filesystem_C:`）
- **磁盘元数据**: 存储在 Exploit 程序内存中（通过 KernelMemory）

## 注意事项

1. **初始化**: 磁盘在系统启动时自动初始化，通常不需要手动调用 `init()`
2. **格式化**: 格式化会清空分区数据，请谨慎操作
3. **更新**: 文件操作后建议调用 `update()` 更新磁盘使用情况
4. **分区大小**: 所有分区大小之和不能超过 `Disk.diskSize`（3GB）
5. **文件操作**: 文件操作通过 `NodeTreeCollection` 进行，而不是直接通过 Disk

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [NodeTree.md](./NodeTree.md) - 文件树 API（待创建）
- [KernelMemory.md](./KernelMemory.md) - 内核内存 API

