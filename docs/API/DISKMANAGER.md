# DISKMANAGER API 文档

## 概述

`DISKMANAGER` 是 ZerOS 内核的磁盘分区管理服务，提供分区的创建、检查、删除、合并等管理功能。所有分区实际存储在 `system/service/DISK/` 目录下，支持 A-Z 共 26 个分区。

分区元数据存储在 `system/service/DISK/D/DiskData.json` 文件中（D: 是系统盘，如果 D: 不存在则使用第一个可用分区），包含分区数量、分区名称、分区大小和磁盘总大小等信息。

## 服务地址

**PHP 后端**（默认）：`http://localhost:8089/system/service/DISKMANAGER.php`

**推荐使用 `SystemInformation` 构建服务URL**：

```javascript
// 使用 SystemInformation 构建URL（推荐，自动适配后端类型）
const url = SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.DISKMANAGER);

// 或直接构建URL
const serviceUrl = new URL('/system/service/DISKMANAGER.php', window.location.origin);
```

## 请求格式

所有请求通过 GET 方法发送，使用 `action` 参数指定操作类型：

```
GET /system/service/DISKMANAGER.php?action=<操作名>&<参数1>=<值1>&<参数2>=<值2>
```

## 响应格式

所有响应均为 JSON 格式：

```json
{
    "status": "success" | "error",
    "message": "操作结果消息",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        // 操作返回的数据（成功时）
    }
}
```

## 分区名称格式

所有分区名称使用以下格式：
- 单个大写字母 + 冒号，如 `C:`, `D:`, `E:`
- 支持 A-Z 共 26 个分区
- 分区字母对应物理目录：`system/service/DISK/{字母}/`

## 特殊分区说明

### D: 系统分区

- **保护机制**：D: 分区是系统盘，不允许删除
- **创建方式**：创建 D: 分区时，会自动从 `test/assets/SYSTEMRESOURCE.zip` 解压系统资源
- **默认大小**：2GB (2147483648 字节)
- **位置**：`system/service/DISK/D/`

## API 操作

### 1. 检查分区

检查指定分区是否存在，并返回分区详细信息。

**操作名**: `check`

**参数**:
- `partition` (string, 必需): 分区名称（如 `C:`, `D:`）

**示例**:
```javascript
const url = new URL('/system/service/DISKMANAGER.php', window.location.origin);
url.searchParams.set('action', 'check');
url.searchParams.set('partition', 'C:');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**（成功）:
```json
{
    "status": "success",
    "message": "分区存在",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "partition": "C:",
        "letter": "C",
        "path": "/path/to/system/service/DISK/C",
        "exists": true,
        "size": 1073741824,
        "fileCount": 150,
        "dirCount": 20,
        "diskTotalSize": 500107862016,
        "diskFreeSpace": 495107862016,
        "diskUsedSpace": 5000000000,
        "diskUsagePercent": 1.0
    }
}
```

**响应**（分区不存在）:
```json
{
    "status": "success",
    "message": "分区不存在",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "partition": "E:",
        "letter": "E",
        "path": "/path/to/system/service/DISK/E",
        "exists": false
    }
}
```

**错误响应**:
```json
{
    "status": "error",
    "message": "无效的分区名称格式: X (格式应为单个大写字母+冒号，如 C:)",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200
}
```

---

### 2. 创建分区

创建新的磁盘分区。

**操作名**: `create`

**参数**:
- `partition` (string, 必需): 分区名称（如 `C:`, `D:`, `E:`）

**特殊说明**:
- 如果分区已存在，将返回 409 错误
- 创建 D: 分区时，会自动从 `test/assets/SYSTEMRESOURCE.zip` 解压系统资源
- 创建其他分区时，会创建一个空目录
- 创建成功后会自动同步到 `DiskData.json`

**示例**:
```javascript
const url = new URL('/system/service/DISKMANAGER.php', window.location.origin);
url.searchParams.set('action', 'create');
url.searchParams.set('partition', 'E:');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**（成功 - 普通分区）:
```json
{
    "status": "success",
    "message": "分区创建成功: E:",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "partition": "E:",
        "letter": "E",
        "path": "/path/to/system/service/DISK/E",
        "created": "2024-12-10 12:00:00"
    }
}
```

**响应**（成功 - D: 系统分区）:
```json
{
    "status": "success",
    "message": "系统分区 D: 创建成功（从系统资源文件解压）",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "partition": "D:",
        "letter": "D",
        "path": "/path/to/system/service/DISK/D",
        "created": "2024-12-10 12:00:00",
        "source": "SYSTEMRESOURCE.zip",
        "fileCount": 1250,
        "totalSize": 2147483648
    }
}
```

**错误响应**（分区已存在）:
```json
{
    "status": "error",
    "message": "分区已存在: C:",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "partition": "C:",
        "path": "/path/to/system/service/DISK/C"
    }
}
```
*HTTP 状态码: 409*

**错误响应**（系统资源文件不存在）:
```json
{
    "status": "error",
    "message": "系统资源文件不存在: /path/to/test/assets/SYSTEMRESOURCE.zip",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200
}
```
*HTTP 状态码: 404*

---

### 3. 删除分区

删除指定的磁盘分区。

**操作名**: `delete`

**参数**:
- `partition` (string, 必需): 分区名称（如 `C:`, `E:`）
- `force` (boolean, 可选): 是否强制删除（即使分区不为空），默认 `false`

**特殊说明**:
- **D: 系统分区不允许删除**，尝试删除会返回 403 错误
- 默认情况下，只能删除空分区
- 使用 `force=true` 可以强制删除非空分区（递归删除所有内容）
- 删除成功后会自动同步到 `DiskData.json`

**示例**:
```javascript
// 删除空分区
const url = new URL('/system/service/DISKMANAGER.php', window.location.origin);
url.searchParams.set('action', 'delete');
url.searchParams.set('partition', 'E:');

const response = await fetch(url.toString());
const result = await response.json();

// 强制删除非空分区
url.searchParams.set('force', 'true');
const response2 = await fetch(url.toString());
const result2 = await response2.json();
```

**响应**（成功）:
```json
{
    "status": "success",
    "message": "分区已删除: E:",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "partition": "E:",
        "force": false,
        "deleted": "2024-12-10 12:00:00"
    }
}
```

**错误响应**（尝试删除 D: 系统分区）:
```json
{
    "status": "error",
    "message": "系统分区 D: 不允许删除",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "partition": "D:",
        "reason": "D: 是系统盘，受保护"
    }
}
```
*HTTP 状态码: 403*

**错误响应**（分区不为空）:
```json
{
    "status": "error",
    "message": "分区不为空，无法删除: E: (包含 150 个文件/目录，使用 force=true 强制删除)",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "partition": "E:",
        "fileCount": 150
    }
}
```
*HTTP 状态码: 400*

**错误响应**（分区不存在）:
```json
{
    "status": "error",
    "message": "分区不存在: E:",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200
}
```
*HTTP 状态码: 404*

---

### 4. 合并分区

将源分区的内容复制到目标分区。

**操作名**: `merge`

**参数**:
- `source` (string, 必需): 源分区名称（如 `C:`）
- `target` (string, 必需): 目标分区名称（如 `D:`）
- `deleteSource` (boolean, 可选): 合并后是否删除源分区，默认 `false`

**特殊说明**:
- 源分区和目标分区不能相同
- 如果目标分区中已存在同名文件，会跳过（不覆盖）
- 合并成功后会自动同步到 `DiskData.json`
- 如果 `deleteSource=true`，合并后会删除源分区（但 D: 系统分区仍然受保护）

**示例**:
```javascript
const url = new URL('/system/service/DISKMANAGER.php', window.location.origin);
url.searchParams.set('action', 'merge');
url.searchParams.set('source', 'E:');
url.searchParams.set('target', 'C:');
url.searchParams.set('deleteSource', 'true'); // 合并后删除源分区

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**（成功）:
```json
{
    "status": "success",
    "message": "分区合并成功，源分区已删除",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "source": "E:",
        "target": "C:",
        "mergedCount": 150,
        "mergedSize": 1073741824,
        "sourceFileCount": 150,
        "sourceSize": 1073741824,
        "sourceDeleted": true,
        "merged": "2024-12-10 12:00:00"
    }
}
```

**响应**（成功，但源分区删除失败）:
```json
{
    "status": "success",
    "message": "分区合并成功，但源分区删除失败",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "source": "E:",
        "target": "C:",
        "mergedCount": 150,
        "mergedSize": 1073741824,
        "sourceFileCount": 150,
        "sourceSize": 1073741824,
        "sourceDeleted": false,
        "warning": "分区合并成功，但源分区删除失败",
        "merged": "2024-12-10 12:00:00"
    }
}
```

**错误响应**（源分区和目标分区相同）:
```json
{
    "status": "error",
    "message": "源分区和目标分区不能相同",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200
}
```
*HTTP 状态码: 400*

**错误响应**（分区不存在）:
```json
{
    "status": "error",
    "message": "源分区不存在: E:",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200
}
```
*HTTP 状态码: 404*

---

### 5. 列出所有分区

列出所有已存在的分区及其详细信息。

**操作名**: `list`

**参数**: 无

**示例**:
```javascript
const url = new URL('/system/service/DISKMANAGER.php', window.location.origin);
url.searchParams.set('action', 'list');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**（成功）:
```json
{
    "status": "success",
    "message": "分区列表获取成功",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "partitions": [
            {
                "partition": "C:",
                "letter": "C",
                "path": "/path/to/system/service/DISK/C",
                "size": 1073741824,
                "fileCount": 150,
                "dirCount": 20,
                "created": "2024-12-10 10:00:00",
                "modified": "2024-12-10 11:30:00",
                "diskTotalSize": 500107862016,
                "diskFreeSpace": 495107862016,
                "diskUsedSpace": 5000000000,
                "diskUsagePercent": 1.0
            },
            {
                "partition": "D:",
                "letter": "D",
                "path": "/path/to/system/service/DISK/D",
                "size": 2147483648,
                "fileCount": 1250,
                "dirCount": 150,
                "created": "2024-12-10 09:00:00",
                "modified": "2024-12-10 12:00:00",
                "diskTotalSize": 500107862016,
                "diskFreeSpace": 490107862016,
                "diskUsedSpace": 10000000000,
                "diskUsagePercent": 2.0
            }
        ],
        "count": 2
    }
}
```

**响应字段说明**:
- `partitions`: 分区数组，按分区字母排序
- `count`: 分区数量
- 每个分区对象包含：
  - `partition`: 分区名称（如 `C:`）
  - `letter`: 分区字母（如 `C`）
  - `path`: 分区物理路径
  - `size`: 分区实际使用大小（字节）
  - `fileCount`: 文件数量
  - `dirCount`: 目录数量
  - `created`: 创建时间
  - `modified`: 最后修改时间
  - `diskTotalSize`: 磁盘总大小（字节）
  - `diskFreeSpace`: 磁盘剩余空间（字节）
  - `diskUsedSpace`: 磁盘已用空间（字节）
  - `diskUsagePercent`: 磁盘使用百分比

---

### 6. 读取磁盘数据

从 `DiskData.json` 读取磁盘元数据。

**操作名**: `read_data`

**参数**: 无

**示例**:
```javascript
const url = new URL('/system/service/DISKMANAGER.php', window.location.origin);
url.searchParams.set('action', 'read_data');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**（成功）:
```json
{
    "status": "success",
    "message": "磁盘数据读取成功",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "totalSize": 3221225472,
        "partitionCount": 2,
        "partitions": {
            "C:": 1073741824,
            "D:": 2147483648
        }
    }
}
```

**响应字段说明**:
- `totalSize`: 磁盘总大小（字节），默认 3GB
- `partitionCount`: 分区数量
- `partitions`: 分区对象，键为分区名称（如 `C:`），值为分区大小（字节）

---

### 7. 同步磁盘数据

同步磁盘数据到 `DiskData.json`（根据实际分区目录）。

**操作名**: `sync_data`

**参数**: 无

**说明**:
- 扫描 `system/service/DISK/` 目录下的所有分区
- 更新 `DiskData.json` 文件，使其与实际分区一致

**示例**:
```javascript
const url = new URL('/system/service/DISKMANAGER.php', window.location.origin);
url.searchParams.set('action', 'sync_data');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**（成功）:
```json
{
    "status": "success",
    "message": "磁盘数据同步成功",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        "totalSize": 3221225472,
        "partitionCount": 2,
        "partitions": {
            "C:": 1073741824,
            "D:": 2147483648
        },
        "synced": "2024-12-10 12:00:00"
    }
}
```

---

## DiskData.json 文件格式

磁盘元数据文件优先存储在系统盘 `system/service/DISK/D/DiskData.json`（如果 D: 不存在则使用第一个可用分区），格式如下：

```json
{
    "totalSize": 3221225472,
    "partitionCount": 2,
    "partitions": {
        "C:": 1073741824,
        "D:": 2147483648
    }
}
```

**字段说明**:
- `totalSize`: 磁盘总大小（字节），默认 3GB (3221225472)
- `partitionCount`: 分区数量
- `partitions`: 分区对象
  - 键：分区名称（如 `C:`, `D:`）
  - 值：分区大小（字节）

**自动同步**:
- 创建分区时自动更新
- 删除分区时自动更新
- 合并分区时自动更新
- 可通过 `sync_data` 操作手动同步

---

## 错误处理

### HTTP 状态码

- `200`: 操作成功
- `400`: 请求参数错误（如无效的分区名称格式、分区不为空等）
- `403`: 禁止操作（如尝试删除 D: 系统分区）
- `404`: 资源不存在（如分区不存在、系统资源文件不存在）
- `409`: 冲突（如分区已存在）
- `500`: 服务器内部错误（如创建分区失败、解压失败等）

### 错误响应格式

所有错误响应遵循统一的 JSON 格式：

```json
{
    "status": "error",
    "message": "错误描述信息",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        // 可选的错误详情
    }
}
```

---

## 使用示例

### JavaScript 封装函数

```javascript
/**
 * 磁盘分区管理 API 封装
 */
class DiskManagerAPI {
    constructor() {
        this.baseUrl = SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.DISKMANAGER);
    }
    
    /**
     * 检查分区
     */
    async checkPartition(partition) {
        const url = new URL(this.baseUrl);
        url.searchParams.set('action', 'check');
        url.searchParams.set('partition', partition);
        
        const response = await fetch(url.toString());
        return await response.json();
    }
    
    /**
     * 创建分区
     */
    async createPartition(partition) {
        const url = new URL(this.baseUrl);
        url.searchParams.set('action', 'create');
        url.searchParams.set('partition', partition);
        
        const response = await fetch(url.toString());
        return await response.json();
    }
    
    /**
     * 删除分区
     */
    async deletePartition(partition, force = false) {
        const url = new URL(this.baseUrl);
        url.searchParams.set('action', 'delete');
        url.searchParams.set('partition', partition);
        if (force) {
            url.searchParams.set('force', 'true');
        }
        
        const response = await fetch(url.toString());
        return await response.json();
    }
    
    /**
     * 合并分区
     */
    async mergePartitions(source, target, deleteSource = false) {
        const url = new URL(this.baseUrl);
        url.searchParams.set('action', 'merge');
        url.searchParams.set('source', source);
        url.searchParams.set('target', target);
        if (deleteSource) {
            url.searchParams.set('deleteSource', 'true');
        }
        
        const response = await fetch(url.toString());
        return await response.json();
    }
    
    /**
     * 列出所有分区
     */
    async listPartitions() {
        const url = new URL(this.baseUrl);
        url.searchParams.set('action', 'list');
        
        const response = await fetch(url.toString());
        return await response.json();
    }
    
    /**
     * 读取磁盘数据
     */
    async readDiskData() {
        const url = new URL(this.baseUrl);
        url.searchParams.set('action', 'read_data');
        
        const response = await fetch(url.toString());
        return await response.json();
    }
    
    /**
     * 同步磁盘数据
     */
    async syncDiskData() {
        const url = new URL(this.baseUrl);
        url.searchParams.set('action', 'sync_data');
        
        const response = await fetch(url.toString());
        return await response.json();
    }
}

// 使用示例
const diskManager = new DiskManagerAPI();

// 列出所有分区
const listResult = await diskManager.listPartitions();
console.log('分区列表:', listResult.data.partitions);

// 创建新分区
const createResult = await diskManager.createPartition('E:');
console.log('创建结果:', createResult);

// 检查分区
const checkResult = await diskManager.checkPartition('C:');
console.log('分区信息:', checkResult.data);
```

---

## 注意事项

1. **D: 系统分区保护**
   - D: 分区是系统盘，不允许删除
   - 创建 D: 分区需要 `test/assets/SYSTEMRESOURCE.zip` 文件存在
   - 创建 D: 分区需要 PHP ZipArchive 扩展支持

2. **分区名称格式**
   - 必须使用单个大写字母 + 冒号格式（如 `C:`, `D:`）
   - 不支持小写字母（如 `c:`, `d:`）

3. **分区创建**
   - 如果分区目录不存在，创建操作会创建新目录
   - 如果分区已存在，创建操作会返回 409 错误

4. **分区删除**
   - 默认只能删除空分区
   - 使用 `force=true` 可以强制删除非空分区（会递归删除所有内容）
   - D: 系统分区不允许删除

5. **分区合并**
   - 如果目标分区中已存在同名文件，会跳过（不覆盖）
   - 合并操作不会检查磁盘空间是否足够

6. **数据同步**
   - `create`、`delete`、`merge` 操作会自动同步到 `DiskData.json`
   - 如果分区已存在于 `DiskData.json` 中，创建分区时不会覆盖已有的大小配置（保留用户配置）
   - 可以使用 `sync_data` 操作手动同步数据

7. **系统资源文件**
   - 创建 D: 分区需要 `test/assets/SYSTEMRESOURCE.zip` 文件
   - ZIP 文件解压后应包含名为 `D` 的目录
   - 如果解压目录结构不同，系统会尝试自动查找

---

## 相关文档

- [Disk.md](./Disk.md) - 虚拟磁盘管理接口（前端 JavaScript API）
- [FSDirve.md](./FSDirve.md) - 文件系统驱动服务（文件操作 API）
- [SystemInformation.md](./SystemInformation.md) - 系统信息和后端服务管理

---

## 更新日志

- **2024-12-10**: 初始版本
  - 支持分区的创建、检查、删除、合并
  - 支持列出所有分区
  - 支持读取和同步磁盘数据
  - D: 系统分区保护机制
  - 自动从 SYSTEMRESOURCE.zip 解压创建 D: 分区

