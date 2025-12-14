# FileFramework API 文档

## 概述

`FileFormwork` 是 ZerOS 内核的文件对象模板类，用于创建和管理虚拟文件系统中的文件对象。提供文件内容读取、写入、信息刷新等功能。

## 依赖

- `FileType` - 文件类型枚举（用于文件类型和操作模式）
- `Disk` - 虚拟磁盘管理器（用于检查磁盘空间）
- `KernelLogger` - 内核日志系统（用于日志输出）

## 构造函数

#### `new FileFormwork(filetype, filename, filecontent, path, fileAttributes, linkTarget)`

创建文件对象。

**参数**:
- `filetype` (number): 文件类型（使用 `FileType.GENRE` 枚举）
- `filename` (string): 文件名称
- `filecontent` (string): 文件内容（字符串）
- `path` (string): 文件路径
- `fileAttributes` (number): 文件属性（可选，位标志）
- `linkTarget` (string): 链接目标（可选，用于创建链接文件）

**示例**:
```javascript
// 创建普通文本文件
const file = new FileFormwork(
    FileType.GENRE.TEXT,
    "readme.txt",
    "This is a readme file.",
    "D:/Documents/readme.txt"
);

// 创建只读文件
const readOnlyFile = new FileFormwork(
    FileType.GENRE.TEXT,
    "config.txt",
    "Configuration data",
    "D:/Documents/config.txt",
    FileType.FILE_ATTRIBUTES.READ_ONLY
);

// 创建链接文件
const linkFile = new FileFormwork(
    FileType.GENRE.LINK,
    "shortcut.lnk",
    "",
    "D:/Documents/shortcut.lnk",
    null,
    "D:/Target/target.txt"
);
```

## 文件属性

文件对象包含以下属性：

- `fileType` (number): 文件类型
- `fileSize` (number): 文件大小（字节）
- `fileName` (string): 文件名称
- `fileCreatTime` (number): 文件创建时间（时间戳）
- `fileModifyTime` (number): 文件修改时间（时间戳）
- `fileContent` (Array): 文件内容（按行存储的数组）
- `filePath` (string): 文件路径
- `fileBelongDisk` (string): 文件所属盘符
- `fileAttributes` (number): 文件属性（位标志）
- `linkTarget` (string|null): 链接目标（如果是链接文件）
- `inited` (boolean): 是否已初始化

## API 方法

#### `refreshInfo()`

刷新文件信息（重新计算文件大小）。

**示例**:
```javascript
file.refreshInfo();
console.log(`文件大小: ${file.fileSize} 字节`);
```

#### `readFile()`

读取文件内容。

**返回值**: `string` - 文件内容（字符串）

**示例**:
```javascript
const content = file.readFile();
console.log('文件内容:', content);
```

**注意**: 如果文件设置了 `NO_READ` 属性，会抛出错误。

#### `writeFile(newContent, writeMod)`

写入文件内容。

**参数**:
- `newContent` (string): 新内容
- `writeMod` (number): 写入模式
  - `FileType.WRITE_MODES.OVERWRITE`: 覆盖模式
  - `FileType.WRITE_MODES.APPEND`: 追加模式

**示例**:
```javascript
// 覆盖模式
file.writeFile("New content", FileType.WRITE_MODES.OVERWRITE);

// 追加模式
file.writeFile("\nAppended content", FileType.WRITE_MODES.APPEND);
```

**注意**:
- 如果文件设置了 `READ_ONLY` 属性，会抛出错误
- 写入前会检查磁盘剩余空间
- 覆盖模式会考虑当前文件占用的空间
- 追加模式需要足够的剩余空间

## 文件类型

使用 `FileType.GENRE` 枚举：

- `TEXT`: 文本文件
- `JSON`: JSON 文件
- `BINARY`: 二进制文件
- `LINK`: 链接文件
- 等等

## 文件属性标志

使用 `FileType.FILE_ATTRIBUTES` 枚举（位标志）：

- `NORMAL` (0): 正常
- `READ_ONLY` (位 1): 只读
- `NO_READ` (位 2): 不可读
- `NO_DELETE` (位 4): 不可删除
- `NO_MOVE` (位 8): 不可移动
- `NO_RENAME` (位 16): 不可重命名

可以组合使用（使用位或运算）：

```javascript
// 只读 + 不可删除
const attrs = FileType.FILE_ATTRIBUTES.READ_ONLY | FileType.FILE_ATTRIBUTES.NO_DELETE;
```

## 链接文件

链接文件会自动设置以下属性：
- `READ_ONLY`
- `NO_DELETE`
- `NO_MOVE`
- `NO_RENAME`

## 使用示例

### 示例 1: 创建和读取文件

```javascript
// 创建文件
const file = new FileFormwork(
    FileType.GENRE.TEXT,
    "readme.txt",
    "Hello, World!",
    "D:/Documents/readme.txt"
);

// 读取文件
const content = file.readFile();
console.log('文件内容:', content);

// 刷新信息
file.refreshInfo();
console.log(`文件大小: ${file.fileSize} 字节`);
```

### 示例 2: 写入文件

```javascript
const file = new FileFormwork(
    FileType.GENRE.TEXT,
    "data.txt",
    "Initial content",
    "D:/Documents/data.txt"
);

// 覆盖写入
file.writeFile("New content", FileType.WRITE_MODES.OVERWRITE);

// 追加写入
file.writeFile("\nMore content", FileType.WRITE_MODES.APPEND);

// 读取结果
const finalContent = file.readFile();
console.log('最终内容:', finalContent);
```

### 示例 3: 创建只读文件

```javascript
// 创建只读文件
const readOnlyFile = new FileFormwork(
    FileType.GENRE.TEXT,
    "config.txt",
    "Configuration data",
    "D:/Documents/config.txt",
    FileType.FILE_ATTRIBUTES.READ_ONLY
);

// 尝试写入（会抛出错误）
try {
    readOnlyFile.writeFile("New content", FileType.WRITE_MODES.OVERWRITE);
} catch (error) {
    console.error('写入失败:', error.message); // "文件 config.txt 为只读，无法修改"
}
```

### 示例 4: 创建链接文件

```javascript
// 创建链接文件
const linkFile = new FileFormwork(
    FileType.GENRE.LINK,
    "shortcut.lnk",
    "",
    "D:/Documents/shortcut.lnk",
    null,
    "D:/Target/target.txt"  // 链接目标
);

// 链接文件自动设置为只读、不可删除、不可移动、不可重命名
console.log('链接目标:', linkFile.linkTarget);
```

## 注意事项

1. **初始化**: 文件对象在创建时会等待 FileType 加载完成
2. **文件内容**: 文件内容按行存储在 `fileContent` 数组中
3. **磁盘空间**: 写入文件前会自动检查磁盘剩余空间
4. **属性检查**: 读取和写入操作会检查文件属性，如果设置了相应标志会拒绝操作
5. **链接文件**: 链接文件会自动设置保护属性，防止误操作
6. **时间戳**: 文件创建和修改时间会自动设置

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [Disk.md](./Disk.md) - 虚拟磁盘管理 API
- [NodeTree.md](./NodeTree.md) - 文件树结构 API

