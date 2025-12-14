# NodeTree API 文档

## 概述

`NodeTree` 是 ZerOS 内核的文件树结构，用于管理虚拟文件系统的目录和文件。提供目录和文件的创建、删除、读取、写入、重命名等操作。

## 依赖

- `FileType` - 文件类型枚举（用于文件操作类型）
- `FileFormwork` - 文件对象模板（用于创建文件对象）
- `KernelLogger` - 内核日志系统（用于日志输出）

## 类结构

### Node 类

文件树节点类（目录）。

**属性**:
- `name` (string): 节点名称
- `parent` (string|null): 父节点路径
- `children` (Map): 子节点映射
- `attributes` (Object): 文件属性映射
- `__meta` (Object): 目录元数据

**方法**:
- `path()`: 返回节点的完整路径

### NodeTreeCollection 类

文件树集合类（磁盘分区）。

**属性**:
- `separateName` (string): 盘符名称（如 `"C:"`, `"D:"`）
- `nodes` (Map): 节点映射
- `initialized` (boolean): 是否已初始化

## API 方法

### 节点操作

#### `hasNode(path)`

检查节点是否存在。

**参数**:
- `path` (string): 节点路径

**返回值**: `boolean` - 是否存在

**示例**:
```javascript
const dPartition = Disk.diskSeparateMap.get("D:");
if (dPartition.hasNode("D:/Documents")) {
    console.log('目录存在');
}
```

#### `getNode(path)`

获取节点。

**参数**:
- `path` (string): 节点路径

**返回值**: `Node|null` - 节点对象

**示例**:
```javascript
const node = dPartition.getNode("D:/Documents");
if (node) {
    console.log(`目录名: ${node.name}`);
}
```

### 目录操作

#### `create_dir(path, name)`

创建目录。

**参数**:
- `path` (string): 父目录路径
- `name` (string): 目录名称

**示例**:
```javascript
dPartition.create_dir("D:", "Documents");
```

#### `delete_dir(path)`

删除目录。

**参数**:
- `path` (string): 目录路径

**示例**:
```javascript
dPartition.delete_dir("D:/Documents");
```

### 文件操作

#### `create_file(path, file)`

创建文件。

**参数**:
- `path` (string): 目录路径
- `file` (FileFormwork): 文件对象

**示例**:
```javascript
const file = new FileFormwork(
    FileType.GENRE.TEXT,
    "test.txt",
    "Hello, World!",
    "D:/Documents/test.txt"
);
dPartition.create_file("D:/Documents", file);
```

#### `delete_file(path, fileName)`

删除文件。

**参数**:
- `path` (string): 目录路径
- `fileName` (string): 文件名称

**示例**:
```javascript
dPartition.delete_file("D:/Documents", "test.txt");
```

#### `read_file(path, fileName)`

读取文件。

**参数**:
- `path` (string): 目录路径
- `fileName` (string): 文件名称

**返回值**: `string|Array|null` - 文件内容

**示例**:
```javascript
const content = dPartition.read_file("D:/Documents", "test.txt");
console.log('文件内容:', content);
```

#### `write_file(path, fileName, newContent, writeMod)`

写入文件。

**参数**:
- `path` (string): 目录路径
- `fileName` (string): 文件名称
- `newContent` (string): 新内容
- `writeMod` (number): 写入模式（`FileType.WRITE_MODES.OVERWRITE` 或 `FileType.WRITE_MODES.APPEND`）

**示例**:
```javascript
// 覆盖模式
dPartition.write_file("D:/Documents", "test.txt", "New content", FileType.WRITE_MODES.OVERWRITE);

// 追加模式
dPartition.write_file("D:/Documents", "test.txt", "\nAppended content", FileType.WRITE_MODES.APPEND);
```

## 使用示例

### 示例 1: 创建目录和文件

```javascript
const dPartition = Disk.diskSeparateMap.get("D:");

// 创建目录
dPartition.create_dir("D:", "Documents");
dPartition.create_dir("D:/Documents", "Projects");

// 创建文件
const file = new FileFormwork(
    FileType.GENRE.TEXT,
    "readme.txt",
    "This is a readme file.",
    "D:/Documents/Projects/readme.txt"
);
dPartition.create_file("D:/Documents/Projects", file);
```

### 示例 2: 读取和写入文件

```javascript
const dPartition = Disk.diskSeparateMap.get("D:");

// 读取文件
const content = dPartition.read_file("D:/Documents/Projects", "readme.txt");
console.log('文件内容:', content);

// 写入文件（覆盖）
dPartition.write_file("D:/Documents/Projects", "readme.txt", "Updated content", FileType.WRITE_MODES.OVERWRITE);

// 追加内容
dPartition.write_file("D:/Documents/Projects", "readme.txt", "\nMore content", FileType.WRITE_MODES.APPEND);
```

### 示例 3: 删除文件和目录

```javascript
const dPartition = Disk.diskSeparateMap.get("D:");

// 删除文件
dPartition.delete_file("D:/Documents/Projects", "readme.txt");

// 删除目录（需要先删除目录内的所有文件和子目录）
dPartition.delete_dir("D:/Documents/Projects");
dPartition.delete_dir("D:/Documents");
```

### 示例 4: 检查节点存在

```javascript
const dPartition = Disk.diskSeparateMap.get("D:");

// 检查目录是否存在
if (dPartition.hasNode("D:/Documents")) {
    const node = dPartition.getNode("D:/Documents");
    console.log(`目录名: ${node.name}`);
    console.log(`子节点数: ${node.children.size}`);
    console.log(`文件数: ${Object.keys(node.attributes).length}`);
}
```

## 文件属性

文件对象支持以下属性：

- `fileAttributes` (number): 文件属性（位标志）
  - `READ_ONLY` (位 1): 只读
  - `NO_READ` (位 2): 不可读
  - `NO_DELETE` (位 4): 不可删除
  - `NO_MOVE` (位 8): 不可移动
  - `NO_RENAME` (位 16): 不可重命名

## 目录属性

目录节点支持以下属性：

- `dirAttributes` (number): 目录属性（位标志）
  - `NO_DELETE` (位 4): 不可删除
  - `NO_MOVE` (位 8): 不可移动
  - `NO_RENAME` (位 16): 不可重命名

## 持久化

NodeTreeCollection 会自动将文件系统保存到 localStorage，并在下次启动时恢复。

**存储键**: `filesystem_{separateName}`

例如：
- `filesystem_C:`
- `filesystem_D:`

## 注意事项

1. **初始化**: NodeTreeCollection 在创建时会自动初始化，等待 FileType 加载完成
2. **路径格式**: 路径使用 `/` 分隔，根路径为盘符（如 `"D:"`）
3. **文件对象**: 创建文件时必须使用 `FileFormwork` 创建文件对象
4. **写入模式**: 写入文件时需指定写入模式（覆盖或追加）
5. **属性检查**: 删除、重命名等操作会检查文件/目录属性，如果设置了相应标志会拒绝操作
6. **持久化**: 文件系统会自动保存到 localStorage，无需手动保存

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [Disk.md](./Disk.md) - 虚拟磁盘管理 API
- [FileFramework.md](./FileFramework.md) - 文件对象模板 API

