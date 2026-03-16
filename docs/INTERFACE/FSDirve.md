# FSDirve API 文档

## 概述

`FSDirve` 是 ZerOS 内核的文件系统驱动服务，提供文件和目录操作接口。系统支持 **PHP** 和 **SpringBoot** 两种后端实现，可通过 `SystemInformation` 动态切换。

**鉴权**：所有请求需通过 JWT 校验（`jwtVerify.php`），NetworkManager 会根据调用来源自动注入 System JWT 或 User JWT。

**User JWT 必须携带 upid**：当请求使用 UserToken（即由应用或 bin 程序发起）时，必须在 GET 参数中传入 `upid`（用户进程 ID），否则后端拒绝请求。应用在 `__init__` 中保存 `this._upid = initArgs.upid`，构建 URL 时使用 `buildServiceUrlObject(serviceName, { upid: this._upid })`，或手动 `url.searchParams.set('upid', this._upid)`。

所有文件实际存储在 `system/service/DISK/{分区字母}/` 目录下（支持 A-Z 共 26 个分区），与 `kernel/filesystem/` 协同工作。

## 后端服务支持

- **PHP 后端**（默认）：服务路径为 `/system/service/FSDirve.php`，默认端口 **8089**
- **SpringBoot 后端**：服务路径为 `/system/service/FSDirve`（无 `.php` 后缀），默认端口 **8080**

两种后端提供相同的功能接口，可根据需要选择。

## 服务地址

**推荐使用 `SystemInformation` 构建服务URL**：

```javascript
// 应用/CLI 程序必须传入 upid
const url = SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid });

// 内核上下文（SystemToken）可省略 upid
const urlKernel = SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE);

// 或直接获取URL（无 upid，仅适用于 SystemToken 场景）
const serviceUrl = SystemInformation.getFSDirveUrl();
```

**手动构建URL**：

- PHP 后端：`http://localhost:8089/system/service/FSDirve.php`
- SpringBoot 后端：`http://localhost:8080/system/service/FSDirve`

详细说明请参考 [SystemInformation API 文档](../API/SystemInformation.md)。

## 请求格式

所有请求通过 GET 或 POST 方法发送，使用 `action` 参数指定操作类型：

```
GET /system/service/FSDirve[.php]?action=<操作名>&<参数1>=<值1>&<参数2>=<值2>
POST /system/service/FSDirve[.php]?action=<操作名>&<参数1>=<值1>
Content-Type: application/json
Body: { "content": "..." }
```

**注意**：`[.php]` 表示 PHP 后端需要 `.php` 后缀，SpringBoot 后端不需要。

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

## 路径格式

所有路径使用虚拟路径格式，**根路径必须为 `A:` 或 `A:/` 形式**（PHP 后端会校验 `/^[A-Z]:(\/|$)/`）：

- 磁盘根目录：`A:` 到 `Z:` 或 `A:/` 到 `Z:/`（支持 A-Z 共 26 个分区）
- 子目录：`C:/path/to/dir` 或 `D:/path/to/dir` 等
- 路径会自动转换为实际文件系统路径：
  - `C:` / `C:/` → `system/service/DISK/C/`
  - `D:` / `D:/` → `system/service/DISK/D/`（D: 是系统盘）
  - `E:` / `E:/` → `system/service/DISK/E/`
  - `D:/application` → `system/service/DISK/D/application/`

**说明**：NodeTree 在从 PHP 重建目录树（`_rebuildFromPHP`）时会使用 `list_dir`，并会将无冒号盘符（如 `D`）规范为 `D:/` 再请求，以保证与 FSDirve 路径校验一致。

## 目录操作

### 创建目录

**操作名**: `create_dir`

**参数**:
- `path` (string, 必需): 父目录路径（如 `D:/application`）
- `name` (string, 必需): 目录名称

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'create_dir');
url.searchParams.set('path', 'D:/application');
url.searchParams.set('name', 'mydir');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "目录创建成功",
    "data": {
        "path": "D:/application/mydir",
        "name": "mydir"
    }
}
```

### 删除目录

**操作名**: `delete_dir`

**参数**:
- `path` (string, 必需): 要删除的目录路径（如 `D:/application/mydir`）

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'delete_dir');
url.searchParams.set('path', 'D:/application/mydir');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "目录删除成功"
}
```

### 列出目录内容

**操作名**: `list_dir`

**参数**:
- `path` (string, 必需): 目录路径（如 `D:/application`）

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'list_dir');
url.searchParams.set('path', 'D:/application');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "目录列表获取成功",
    "data": {
        "path": "D:/application",
        "items": [
            {
                "name": "terminal",
                "type": "directory",
                "path": "D:/application/terminal",
                "size": 0,
                "modified": "2024-12-10 12:00:00",
                "created": "2024-12-10 12:00:00"
            },
            {
                "name": "test.js",
                "type": "file",
                "path": "D:/application/test.js",
                "size": 1024,
                "extension": "js",
                "modified": "2024-12-10 12:00:00",
                "created": "2024-12-10 12:00:00"
            }
        ],
        "count": 2
    }
}
```

### 重命名目录

**操作名**: `rename_dir`

**参数**:
- `path` (string, 必需): 父目录路径
- `oldName` (string, 必需): 旧目录名
- `newName` (string, 必需): 新目录名

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'rename_dir');
url.searchParams.set('path', 'D:/application');
url.searchParams.set('oldName', 'mydir');
url.searchParams.set('newName', 'newdir');

const response = await fetch(url.toString());
const result = await response.json();
```

### 移动目录

**操作名**: `move_dir`

**参数**:
- `sourcePath` (string, 必需): 源目录路径
- `targetPath` (string, 必需): 目标目录路径

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'move_dir');
url.searchParams.set('sourcePath', 'D:/application/mydir');
url.searchParams.set('targetPath', 'D:/application/other/mydir');

const response = await fetch(url.toString());
const result = await response.json();
```

### 复制目录

**操作名**: `copy_dir`

**参数**:
- `sourcePath` (string, 必需): 源目录路径
- `targetPath` (string, 必需): 目标目录路径

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'copy_dir');
url.searchParams.set('sourcePath', 'D:/application/mydir');
url.searchParams.set('targetPath', 'D:/application/backup/mydir');

const response = await fetch(url.toString());
const result = await response.json();
```

### 递归删除目录

**操作名**: `delete_dir_recursive`

**参数**:
- `path` (string, 必需): 要删除的目录路径

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'delete_dir_recursive');
url.searchParams.set('path', 'D:/application/mydir');

const response = await fetch(url.toString());
const result = await response.json();
```

## 文件操作

### 创建文件

**操作名**: `create_file`

**参数**:
- `path` (string, 必需): 父目录路径
- `fileName` (string, 必需): 文件名
- `content` (string, 可选): 文件内容（可通过 GET 参数或 POST Body 传递）

**示例** (GET):
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'create_file');
url.searchParams.set('path', 'D:/application');
url.searchParams.set('fileName', 'test.txt');
url.searchParams.set('content', 'Hello World');

const response = await fetch(url.toString());
const result = await response.json();
```

**示例** (POST):
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'create_file');
url.searchParams.set('path', 'D:/application');
url.searchParams.set('fileName', 'test.txt');

const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content: 'Hello World' })
});
const result = await response.json();
```

**响应**（创建成功）:
```json
{
    "status": "success",
    "message": "文件创建成功",
    "data": {
        "path": "D:/application/test.txt",
        "fileName": "test.txt",
        "size": 11
    }
}
```

**文件已存在时**（PHP 后端）：若目标文件已存在，返回 `200` 且 `status: "success"`、`message: "文件已存在"`，不覆盖内容；便于与后续 `write_file` 配合（如壁纸保存配置），避免 409 导致保存失败。

### 读取文件

**操作名**: `read_file`

**参数**:
- `path` (string, 必需): 父目录路径
- `fileName` (string, 必需): 文件名

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'read_file');
url.searchParams.set('path', 'D:/application');
url.searchParams.set('fileName', 'test.txt');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "文件读取成功",
    "data": {
        "path": "D:/application/test.txt",
        "fileName": "test.txt",
        "size": 11,
        "content": "Hello World",
        "modified": "2024-12-10 12:00:00",
        "created": "2024-12-10 12:00:00"
    }
}
```

### 写入文件

**操作名**: `write_file`

**参数**:
- `path` (string, 必需): 父目录路径
- `fileName` (string, 必需): 文件名
- `writeMod` (string, 可选): 写入模式，可选值：
  - `overwrite` (默认): 覆盖模式
  - `append`: 追加模式
  - `prepend`: 前置模式
- `content` (string, 必需): 文件内容（可通过 GET 参数或 POST Body 传递）

**D 盘根敏感文件策略（CVS-ZEROS-012/015）**：以下系统关键文件在 **D 盘根目录**（`path` 为 `D:` 或 `D:/`）下受保护，**UserToken 禁止写入/重命名/移动/复制/删除**，否则返回 **403**；**SystemToken** 不受限。
- 敏感文件名：`LocalSData.json`、`LocalSData_backup.json`、`ApplicationTable.json`、`LocalCache.json`、`BootSecurityToken.json`
- **write_file**：UserToken 写 D 根且文件名为上述之一 → 403。
- **rename_file**：UserToken 在 D 根下对 `oldFileName` 或 `newFileName` 为上述之一 → 403。
- **move_file**：UserToken 源路径或目标路径为 D 根且对应文件名为上述之一 → 403。
- **copy_file**：UserToken 目标路径为 D 根且目标文件名为上述之一 → 403。
- **delete_file**：UserToken 在 D 根下删除上述之一 → 403。
- 其他路径（含 D 盘任意子目录、其他分区）及非敏感文件名不受限制。若程序需要修改上述系统存储，请通过前端系统模块（如 LStorage）操作，由内核路径发起请求以使用 SystemToken。

**示例** (POST):
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'write_file');
url.searchParams.set('path', 'D:/application');
url.searchParams.set('fileName', 'test.txt');
url.searchParams.set('writeMod', 'overwrite');

const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content: 'New Content' })
});
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "文件写入成功",
    "data": {
        "path": "D:/application/test.txt",
        "fileName": "test.txt",
        "size": 11,
        "writeMod": "overwrite",
        "created": false
    }
}
```

### 删除文件

**操作名**: `delete_file`

**参数**:
- `path` (string, 必需): 父目录路径
- `fileName` (string, 必需): 文件名

**安全策略**：若 `path` 为 D 根且 `fileName` 为上述 D 根敏感文件名，UserToken 请求返回 **403**。

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'delete_file');
url.searchParams.set('path', 'D:/application');
url.searchParams.set('fileName', 'test.txt');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "文件删除成功"
}
```

**说明**: 删除不存在的文件时，仍然返回成功响应，而不是 404 错误。这是为了简化缓存清理等操作，避免因文件不存在而导致的错误。

### 重命名文件

**操作名**: `rename_file`

**参数**:
- `path` (string, 必需): 父目录路径
- `oldFileName` (string, 必需): 旧文件名
- `newFileName` (string, 必需): 新文件名

**安全策略**：若 `path` 为 D 根且 `oldFileName` 或 `newFileName` 为 D 根敏感文件名之一，UserToken 请求返回 **403**。

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'rename_file');
url.searchParams.set('path', 'D:/application');
url.searchParams.set('oldFileName', 'test.txt');
url.searchParams.set('newFileName', 'renamed.txt');

const response = await fetch(url.toString());
const result = await response.json();
```

### 移动文件

**操作名**: `move_file`

**参数**:
- `sourcePath` (string, 必需): 源文件父目录路径
- `sourceFileName` (string, 必需): 源文件名
- `targetPath` (string, 必需): 目标文件父目录路径
- `targetFileName` (string, 可选): 目标文件名（如果省略，使用源文件名）

**安全策略**：若源或目标为 D 根且对应文件名为 D 根敏感文件名之一，UserToken 请求返回 **403**。

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'move_file');
url.searchParams.set('sourcePath', 'D:/application');
url.searchParams.set('sourceFileName', 'test.txt');
url.searchParams.set('targetPath', 'D:/application/backup');
url.searchParams.set('targetFileName', 'test.txt');

const response = await fetch(url.toString());
const result = await response.json();
```

### 复制文件

**操作名**: `copy_file`

**参数**:
- `sourcePath` (string, 必需): 源文件父目录路径
- `sourceFileName` (string, 必需): 源文件名
- `targetPath` (string, 必需): 目标文件父目录路径
- `targetFileName` (string, 可选): 目标文件名（如果省略，使用源文件名）

**安全策略**：若目标路径为 D 根且目标文件名为 D 根敏感文件名之一，UserToken 请求返回 **403**。

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'copy_file');
url.searchParams.set('sourcePath', 'D:/application');
url.searchParams.set('sourceFileName', 'test.txt');
url.searchParams.set('targetPath', 'D:/application/backup');
url.searchParams.set('targetFileName', 'test_backup.txt');

const response = await fetch(url.toString());
const result = await response.json();
```

### 获取文件信息

**操作名**: `get_file_info`

**参数**:
- `path` (string, 必需): 父目录路径
- `fileName` (string, 必需): 文件名

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'get_file_info');
url.searchParams.set('path', 'D:/application');
url.searchParams.set('fileName', 'test.txt');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "文件信息获取成功",
    "data": {
        "path": "D:/application/test.txt",
        "fileName": "test.txt",
        "size": 11,
        "extension": "txt",
        "modified": "2024-12-10 12:00:00",
        "created": "2024-12-10 12:00:00"
    }
}
```

## 工具操作

### 检查路径是否存在

**操作名**: `exists`

**参数**:
- `path` (string, 必需): 要检查的路径（可以是文件或目录）

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'exists');
url.searchParams.set('path', 'D:/application/test.txt');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "路径检查完成",
    "data": {
        "exists": true,
        "type": "file",
        "path": "D:/application/test.txt"
    }
}
```

### 获取磁盘信息

**操作名**: `get_disk_info`

**参数**:
- `disk` (string, 必需): 磁盘名称，支持 A-Z 所有分区

**示例**:
```javascript
const url = new URL('/system/service/FSDirve.php', window.location.origin);
url.searchParams.set('action', 'get_disk_info');
url.searchParams.set('disk', 'D'); // D: 是系统盘

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "磁盘信息获取成功",
    "data": {
        "disk": "D",
        "path": "D:\\Project\\Algorithm\\ZerOS\\system\\service\\DISK\\D",
        "totalSize": 2147483648,
        "usedSize": 1048576,
        "freeSize": 2146435072,
        "itemCount": 150
    }
}
```

## 错误处理

所有错误响应都遵循统一的格式：

```json
{
    "status": "error",
    "message": "错误描述",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200
}
```

**常见错误码**:
- `400`: 请求参数错误（缺少参数、路径格式错误等）
- `403`: 禁止操作（如 UserToken 对 D 盘根敏感文件的写入/重命名/移动/复制/删除）
- `404`: 文件或目录不存在
- `409`: 文件或目录已存在（创建操作时）
- `500`: 服务器内部错误（文件操作失败等）

**示例错误响应**:
```json
{
    "status": "error",
    "message": "文件不存在: test.txt",
    "timestamp": "2024-12-10 12:00:00",
    "timestamp_unix": 1702195200
}
```

## 安全特性

1. **User JWT 与 upid**: 应用和 bin 程序调用时必须传递 `upid` 参数，详见 [SystemInformation](../API/SystemInformation.md#buildserviceurlobjectservicename-options)
2. **路径验证**: 所有路径都经过验证，支持 A-Z 所有分区盘符
3. **目录遍历防护**: 自动过滤 `..` 路径，防止目录遍历攻击
4. **文件名验证**: 文件名不能包含 `/` 或 `\` 字符
5. **CORS 支持**: 支持跨域请求（开发环境）
6. **系统盘保护**: D: 是系统盘，优先使用，但系统支持使用其他分区

## 使用示例

### JavaScript 封装函数

```javascript
class FSDirve {
    static BASE_URL = '/system/service/FSDirve.php';
    
    static async request(action, params = {}) {
        const url = new URL(this.BASE_URL, window.location.origin);
        url.searchParams.set('action', action);
        
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined) {
                url.searchParams.set(key, value);
            }
        }
        
        const response = await fetch(url.toString());
        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || '操作失败');
        }
        
        return result.data;
    }
    
    static async listDir(path) {
        return await this.request('list_dir', { path });
    }
    
    static async readFile(path, fileName) {
        return await this.request('read_file', { path, fileName });
    }
    
    static async writeFile(path, fileName, content, writeMod = 'overwrite') {
        const url = new URL(this.BASE_URL, window.location.origin);
        url.searchParams.set('action', 'write_file');
        url.searchParams.set('path', path);
        url.searchParams.set('fileName', fileName);
        url.searchParams.set('writeMod', writeMod);
        
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        
        const result = await response.json();
        if (result.status !== 'success') {
            throw new Error(result.message || '操作失败');
        }
        
        return result.data;
    }
    
    static async createFile(path, fileName, content = '') {
        const url = new URL(this.BASE_URL, window.location.origin);
        url.searchParams.set('action', 'create_file');
        url.searchParams.set('path', path);
        url.searchParams.set('fileName', fileName);
        
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        
        const result = await response.json();
        if (result.status !== 'success') {
            throw new Error(result.message || '操作失败');
        }
        
        return result.data;
    }
    
    static async deleteFile(path, fileName) {
        return await this.request('delete_file', { path, fileName });
    }
    
    static async createDir(path, name) {
        return await this.request('create_dir', { path, name });
    }
    
    static async deleteDir(path) {
        return await this.request('delete_dir', { path });
    }
    
    static async exists(path) {
        return await this.request('exists', { path });
    }
}
```

### 使用示例

```javascript
// 列出目录
const dirList = await FSDirve.listDir('D:/application');
console.log(dirList.items);

// 读取文件
const fileData = await FSDirve.readFile('D:/application', 'test.txt');
console.log(fileData.content);

// 写入文件
await FSDirve.writeFile('D:/application', 'test.txt', 'Hello World');

// 创建文件
await FSDirve.createFile('D:/application', 'newfile.txt', 'Content');

// 创建目录
await FSDirve.createDir('D:/application', 'mydir');

// 检查路径是否存在
const exists = await FSDirve.exists('D:/application/test.txt');
console.log(exists.exists, exists.type);
```

## 与内核集成

FSDirve.php 与以下内核模块协同工作：

- **LStorage**: 使用 FSDirve.php 进行文件读写操作
- **NodeTree**: 使用 FSDirve.php 进行真实的文件和目录操作
- **文件管理器**: 使用 FSDirve.php 获取目录列表和文件信息
- **终端命令**: `ls`、`tree`、`cat`、`cd` 等命令使用 FSDirve.php

## 注意事项

1. **路径格式**: 所有路径必须使用虚拟路径格式（`C:`、`D:` 等），不要使用实际文件系统路径
2. **异步操作**: 所有操作都是异步的，需要使用 `await` 或 `.then()`
3. **错误处理**: 始终检查响应中的 `status` 字段，处理可能的错误
4. **大文件**: 对于大文件，建议使用 POST 方法传递内容，避免 URL 长度限制
5. **路径验证**: 根路径（`C:` 或 `D:`）会自动转换为 `C:/` 或 `D:/` 格式

## 相关文档

- [LStorage](../API/LStorage.md) - 本地存储管理器（使用 FSDirve.php）
- [NodeTree](../API/NodeTree.md) - 文件树结构（使用 FSDirve.php）
- [ProcessManager](../API/ProcessManager.md) - 进程管理器（路径转换）

