# NodeTree API 文档

## 概述

`NodeTree` 是 ZerOS 内核的文件树结构，用于管理虚拟文件系统的目录和文件。提供目录和文件的创建、删除、读取、写入、重命名等操作。

**数据策略**：每次系统启动会从后端（FSDirve）重建整棵树；快照（`filesystem_*.json`）仅保存结构+元数据，**不保存文件内容**；`read_file` 时若树中无内容会从后端实时拉取并回填。

**多磁盘分区**：每个分区（C:、D:、A–Z）对应一个 `NodeTreeCollection` 实例，由 `Disk.diskSeparateMap` 管理；盘符支持 `"C:"` 或 `"C"` 形式，请求 PHP 时统一为 `A:`/`A:/` 格式；NodeTree 内部仅使用本实例的 `separateName`，无单分区假设。

注意：`NodeTreeCollection` 更偏向内核内部/系统模块使用。普通应用程序进行文件读写，优先使用 `ProcessManager.callKernelAPI` 暴露的 `FileSystem.*` 接口（会自动做权限检查与兼容处理）。

## 依赖

- `FileType` - 文件类型枚举（用于文件操作类型）
- `FileFormwork` - 文件对象模板（用于创建文件对象）
- `KernelLogger` - 内核日志系统（用于日志输出）

## 获取实例

NodeTreeCollection（NodeTree）不是通过 POOL 或 window 获取的单例，而是通过 Disk 获取文件系统实例后访问：

```javascript
// 从 Disk 获取文件系统实例
const Disk = POOL.__GET__("KERNEL_GLOBAL_POOL", "Disk");

// 获取 D: 盘的文件系统实例
const nodeTree = Disk.diskSeparateMap.get("D:");

// 或者获取 C: 盘
const nodeTreeC = Disk.diskSeparateMap.get("C:");
```

**注意**：
- 应用程序进行文件读写，应优先使用 `ProcessManager.callKernelAPI('FileSystem.*', [...])` 接口
- NodeTreeCollection 更偏向内核内部/系统模块使用

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
- `file` (FileFormwork|string): 文件对象或文件名字符串（传字符串会创建空文件）

**返回值**: `Promise<void>`

**示例**:
```javascript
const file = new FileFormwork(
    FileType.GENRE.TEXT,
    "test.txt",
    "Hello, World!",
    "D:/Documents/test.txt"
);
await dPartition.create_file("D:/Documents", file);
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

**返回值**: `Promise<string|null>` - 文件内容，不存在或未初始化返回 null（若树中仅有结构无内容会从 PHP 拉取并回填）

**示例**:
```javascript
const content = await dPartition.read_file("D:/Documents", "test.txt");
console.log('文件内容:', content);
```

#### `write_file(path, fileName, newContent, writeMod)`

写入文件。

**参数**:
- `path` (string): 目录路径
- `fileName` (string): 文件名称
- `newContent` (string): 新内容
- `writeMod` (number): 写入模式（`FileType.WRITE_MODES.OVERWRITE` 或 `FileType.WRITE_MODES.APPEND`）

**返回值**: `Promise<void>`

**示例**:
```javascript
// 覆盖模式
await dPartition.write_file("D:/Documents", "test.txt", "New content", FileType.WRITE_MODES.OVERWRITE);

// 追加模式
await dPartition.write_file("D:/Documents", "test.txt", "\nAppended content", FileType.WRITE_MODES.APPEND);
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
await dPartition.create_file("D:/Documents/Projects", file);
```

### 示例 2: 读取和写入文件

```javascript
const dPartition = Disk.diskSeparateMap.get("D:");

// 读取文件
const content = await dPartition.read_file("D:/Documents/Projects", "readme.txt");
console.log('文件内容:', content);

// 写入文件（覆盖）
await dPartition.write_file("D:/Documents/Projects", "readme.txt", "Updated content", FileType.WRITE_MODES.OVERWRITE);

// 追加内容
await dPartition.write_file("D:/Documents/Projects", "readme.txt", "\nMore content", FileType.WRITE_MODES.APPEND);
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

## 初始化与数据来源

NodeTreeCollection 在创建时会等待 FileType 等依赖加载完成，然后按以下顺序加载数据：

1. **从本地快照加载**：调用 `_loadFromLocalStorage()`，从后端（FSDirve）读取 `${separateName}/filesystem_${safeName}.json`。若文件存在且有效，则反序列化得到节点树（仅结构+元数据，不含文件内容）。
2. **每次启动从 PHP 重建**：加载完成后会调用 `_ensureTreeFromPHP()`，内部调用 `_rebuildFromPHP()`，通过 FSDirve 的 `list_dir` 递归拉取真实目录结构并写回 `nodes`，保证树与磁盘一致。重建完成后会将新结构（不含文件内容）写回 `filesystem_*.json`。

**文件内容**：快照中不保存文件内容；`read_file` 时若树中该文件无内容，会从后端（FSDirve `read_file`）实时拉取并回填内存，应用层无需关心来源。

**内部方法说明**（内核/系统模块使用，应用层无需直接调用）：

- **`_ensureTreeFromPHP()`**：在 `_loadFromLocalStorage` 完成后调用；每次启动都会从 PHP 服务重建整棵树。
- **`_rebuildFromPHP(rootPath?)`**：清空除根节点外的所有节点，从 `rootPath` 或 `separateName` 起递归调用 FSDirve `list_dir`，按返回的目录/文件重建节点并标记 `initialized = true`；完成后调用 `_saveToLocalStorage()` 将结构写回 `filesystem_*.json`。ProcessManager 在 `FileSystem.read/write/create/list` 等发现分区未初始化时也会调用此方法。
- **`_readFileContentFromPHP(path, fileName)`**：从 FSDirve `read_file` 拉取单个文件内容，供 `read_file` 在树中无内容时补全。

**请求 PHP 时的路径格式**：FSDirve 要求根路径为 `A:` 或 `A:/` 形式。`_rebuildDirectoryFromPHP` 会将 `D:` 转为 `D:/`、单字母 `D` 转为 `D:/` 再请求，以保证 PHP 校验通过。

## 持久化

NodeTreeCollection 将**仅结构+元数据**（不包含文件内容）保存到后端文件系统（通过 FSDirve）。文件内容由后端服务实时提供，不写入快照。

**存储位置**：逻辑上为 `${separateName}/filesystem_${safeName}.json`（其中 `safeName = separateName.replace(':', '_')`），例如：

- `C:/filesystem_C_.json`
- `D:/filesystem_D_.json`

**写入时机**：每次从 PHP 重建完成后会调用 `_saveToLocalStorage()` 更新对应分区的 `filesystem_*.json`；此外在创建/删除/写入文件等操作后也会异步保存结构。快照中文件的 `fileContent` 始终为空数组，读取文件内容时通过 FSDirve `read_file` 实时获取。

## 注意事项

1. **初始化**: NodeTreeCollection 在创建时会自动初始化，等待 FileType 加载完成后先加载本地快照（仅结构），然后**每次启动都会从 PHP 重建**整棵树并写回快照。
2. **文件内容**: 快照不保存文件内容；`read_file` 时若树中无内容会从后端（FSDirve）实时拉取并回填，应用层直接使用 `read_file` 即可获得完整内容。
3. **路径格式**: 路径使用 `/` 分隔，根路径为盘符（如 `"D:"`）；请求 PHP 时根路径会规范为 `D:/` 形式。
4. **文件对象**: 创建文件时必须使用 `FileFormwork` 创建文件对象。
5. **写入模式**: 写入文件时需指定写入模式（覆盖或追加）。
6. **属性检查**: 删除、重命名等操作会检查文件/目录属性，如果设置了相应标志会拒绝操作。
7. **持久化**: 仅结构通过 FSDirve 保存到 `filesystem_*.json`，文件内容由后端实时提供，无需应用层手动保存内容。

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [Disk.md](./Disk.md) - 虚拟磁盘管理 API
- [FileFramework.md](./FileFramework.md) - 文件对象模板 API
