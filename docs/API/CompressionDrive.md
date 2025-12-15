# CompressionDrive API 文档

## 概述

`CompressionDirve.php` 是 ZerOS 内核的压缩驱动服务，提供基于 PHP 的 ZIP 和 RAR 格式压缩与解压缩操作接口。支持文件或目录的压缩、解压缩、列表查看等功能。

## 服务地址

```
http://localhost:8089/service/CompressionDirve.php
```

## 请求格式

所有请求通过 GET 或 POST 方法发送，使用 `action` 参数指定操作类型：

```
GET /service/CompressionDirve.php?action=<操作名>&<参数1>=<值1>&<参数2>=<值2>
POST /service/CompressionDirve.php?action=<操作名>&<参数1>=<值1>
Content-Type: application/json
Body: { "options": { ... } }
```

## 响应格式

所有响应均为 JSON 格式：

```json
{
    "status": "success" | "error",
    "message": "操作结果消息",
    "timestamp": "2024-12-15 12:00:00",
    "timestamp_unix": 1702195200,
    "data": {
        // 操作返回的数据（成功时）
    }
}
```

## 路径格式

所有路径使用虚拟路径格式：
- 磁盘根目录：`C:` 或 `D:`
- 子目录：`C:/path/to/dir` 或 `D:/path/to/dir`
- 路径会自动转换为实际文件系统路径：
  - `C:` → `service/DISK/C/`
  - `D:` → `service/DISK/D/`
  - `D:/application` → `service/DISK/D/application/`

## ZIP 操作

### ZIP 压缩

**操作名**: `compress_zip`

**参数**:
- `sourcePath` (string, 可选): 单个源路径（文件或目录，如 `D:/application/mydir`）
- `sourcePaths` (array, 可选): 多个源路径（文件或目录数组，如 `['D:/file1.txt', 'D:/dir1']`）
  - **注意**: `sourcePath` 和 `sourcePaths` 二选一，如果同时提供，优先使用 `sourcePaths`
  - 当使用多个源路径时，每个文件/目录会以其基本名称作为前缀添加到 ZIP 中，避免路径冲突
- `targetPath` (string, 必需): 目标压缩文件路径（如 `D:/backup/archive.zip`）
- `options` (object, 可选): 压缩选项
  - `exclude` (array, 可选): 排除的文件/目录列表
  - `compressionLevel` (number, 可选): 压缩级别 (0-9, 默认 6)
    - **注意**: PHP ZipArchive 不支持直接设置压缩级别，此参数仅用于记录，实际压缩级别由系统默认值决定

**示例** (GET):
```javascript
const url = new URL('/service/CompressionDirve.php', window.location.origin);
url.searchParams.set('action', 'compress_zip');
url.searchParams.set('sourcePath', 'D:/application/mydir');
url.searchParams.set('targetPath', 'D:/backup/archive.zip');
url.searchParams.set('compressionLevel', '9');

const response = await fetch(url.toString());
const result = await response.json();
```

**示例** (POST - 单个路径):
```javascript
const url = new URL('/service/CompressionDirve.php', window.location.origin);
url.searchParams.set('action', 'compress_zip');
url.searchParams.set('targetPath', 'D:/backup/archive.zip');

const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        sourcePath: 'D:/application/mydir',
        options: {
            exclude: ['node_modules', '.git'],
            compressionLevel: 9
        }
    })
});
const result = await response.json();
```

**示例** (POST - 多个路径):
```javascript
const url = new URL('/service/CompressionDirve.php', window.location.origin);
url.searchParams.set('action', 'compress_zip');
url.searchParams.set('targetPath', 'D:/backup/archive.zip');

const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        sourcePaths: [
            'D:/application/file1.txt',
            'D:/application/dir1',
            'D:/application/dir2'
        ],
        options: {
            exclude: ['node_modules', '.git'],
            compressionLevel: 9
        }
    })
});
const result = await response.json();
```

**响应** (单个路径):
```json
{
    "status": "success",
    "message": "ZIP 压缩成功",
    "data": {
        "sourcePath": "D:/application/mydir",
        "targetPath": "D:/backup/archive.zip",
        "size": 1048576,
        "compressionLevel": 9
    }
}
```

**响应** (多个路径):
```json
{
    "status": "success",
    "message": "ZIP 压缩成功",
    "data": {
        "sourcePaths": [
            "D:/application/file1.txt",
            "D:/application/dir1",
            "D:/application/dir2"
        ],
        "sourceCount": 3,
        "targetPath": "D:/backup/archive.zip",
        "size": 1048576,
        "compressionLevel": 9
    }
}
```

### ZIP 解压缩

**操作名**: `extract_zip`

**参数**:
- `sourcePath` (string, 必需): 压缩文件路径（如 `D:/backup/archive.zip`）
- `targetPath` (string, 必需): 解压目标目录路径（如 `D:/extracted`）
- `options` (object, 可选): 解压选项
  - `files` (array, 可选): 要解压的特定文件列表（为空则解压所有）
  - `overwrite` (boolean, 可选): 是否覆盖已存在的文件（默认 false）

**示例**:
```javascript
const url = new URL('/service/CompressionDirve.php', window.location.origin);
url.searchParams.set('action', 'extract_zip');
url.searchParams.set('sourcePath', 'D:/backup/archive.zip');
url.searchParams.set('targetPath', 'D:/extracted');
url.searchParams.set('overwrite', 'true');

const response = await fetch(url.toString());
const result = await response.json();
```

**示例** (解压特定文件):
```javascript
const url = new URL('/service/CompressionDirve.php', window.location.origin);
url.searchParams.set('action', 'extract_zip');
url.searchParams.set('sourcePath', 'D:/backup/archive.zip');
url.searchParams.set('targetPath', 'D:/extracted');

const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        options: {
            files: ['file1.txt', 'subdir/file2.txt'],
            overwrite: true
        }
    })
});
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "ZIP 解压缩成功",
    "data": {
        "sourcePath": "D:/backup/archive.zip",
        "targetPath": "D:/extracted",
        "extractedCount": 15,
        "extractedFiles": [
            "file1.txt",
            "file2.txt",
            "subdir/file3.txt"
        ]
    }
}
```

### 列出 ZIP 文件内容

**操作名**: `list_zip`

**参数**:
- `sourcePath` (string, 必需): 压缩文件路径（如 `D:/backup/archive.zip`）

**示例**:
```javascript
const url = new URL('/service/CompressionDirve.php', window.location.origin);
url.searchParams.set('action', 'list_zip');
url.searchParams.set('sourcePath', 'D:/backup/archive.zip');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "ZIP 文件列表获取成功",
    "data": {
        "sourcePath": "D:/backup/archive.zip",
        "fileCount": 15,
        "files": [
            {
                "name": "file1.txt",
                "size": 1024,
                "compressedSize": 512,
                "isDir": false,
                "modified": "2024-12-15 12:00:00"
            },
            {
                "name": "subdir/",
                "size": 0,
                "compressedSize": 0,
                "isDir": true,
                "modified": "2024-12-15 12:00:00"
            }
        ]
    }
}
```

## RAR 操作

### RAR 压缩

**操作名**: `compress_rar`

**注意**: PHP 的 RAR 扩展主要用于读取，不支持创建 RAR 文件。此功能需要外部工具（如 WinRAR 命令行）支持，当前版本暂不支持 RAR 压缩。请使用 ZIP 格式。

**参数**:
- `sourcePath` (string, 必需): 源路径（文件或目录）
- `targetPath` (string, 必需): 目标压缩文件路径

**响应**:
```json
{
    "status": "error",
    "message": "RAR 压缩功能需要外部工具支持，当前版本暂不支持 RAR 压缩。请使用 ZIP 格式或安装 WinRAR 命令行工具",
    "timestamp": "2024-12-15 12:00:00"
}
```

### RAR 解压缩

**操作名**: `extract_rar`

**参数**:
- `sourcePath` (string, 必需): 压缩文件路径（如 `D:/backup/archive.rar`）
- `targetPath` (string, 必需): 解压目标目录路径（如 `D:/extracted`）
- `options` (object, 可选): 解压选项
  - `files` (array, 可选): 要解压的特定文件列表（为空则解压所有）
  - `overwrite` (boolean, 可选): 是否覆盖已存在的文件（默认 false）

**前置条件**: 需要安装 PHP RAR 扩展（`php-rar`）

**示例**:
```javascript
const url = new URL('/service/CompressionDirve.php', window.location.origin);
url.searchParams.set('action', 'extract_rar');
url.searchParams.set('sourcePath', 'D:/backup/archive.rar');
url.searchParams.set('targetPath', 'D:/extracted');
url.searchParams.set('overwrite', 'true');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "RAR 解压缩成功",
    "data": {
        "sourcePath": "D:/backup/archive.rar",
        "targetPath": "D:/extracted",
        "extractedCount": 15,
        "extractedFiles": [
            "file1.txt",
            "file2.txt",
            "subdir/file3.txt"
        ]
    }
}
```

### 列出 RAR 文件内容

**操作名**: `list_rar`

**参数**:
- `sourcePath` (string, 必需): 压缩文件路径（如 `D:/backup/archive.rar`）

**前置条件**: 需要安装 PHP RAR 扩展（`php-rar`）

**示例**:
```javascript
const url = new URL('/service/CompressionDirve.php', window.location.origin);
url.searchParams.set('action', 'list_rar');
url.searchParams.set('sourcePath', 'D:/backup/archive.rar');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "RAR 文件列表获取成功",
    "data": {
        "sourcePath": "D:/backup/archive.rar",
        "fileCount": 15,
        "files": [
            {
                "name": "file1.txt",
                "size": 1024,
                "compressedSize": 512,
                "isDir": false,
                "modified": "2024-12-15 12:00:00"
            }
        ]
    }
}
```

## 工具操作

### 检查压缩格式支持

**操作名**: `check_support`

**参数**: 无

**示例**:
```javascript
const url = new URL('/service/CompressionDirve.php', window.location.origin);
url.searchParams.set('action', 'check_support');

const response = await fetch(url.toString());
const result = await response.json();
```

**响应**:
```json
{
    "status": "success",
    "message": "压缩格式支持检查完成",
    "data": {
        "zip": true,
        "rar": false
    }
}
```

## 错误处理

所有错误响应都遵循统一的格式：

```json
{
    "status": "error",
    "message": "错误描述",
    "timestamp": "2024-12-15 12:00:00",
    "timestamp_unix": 1702195200
}
```

**常见错误码**:
- `400`: 请求参数错误（缺少参数、路径格式错误等）
- `404`: 文件或目录不存在
- `409`: 目标文件已存在
- `500`: 服务器内部错误（扩展未安装、操作失败等）
- `501`: 功能未实现（RAR 压缩）

**示例错误响应**:
```json
{
    "status": "error",
    "message": "ZIP 扩展未安装，无法进行 ZIP 压缩",
    "timestamp": "2024-12-15 12:00:00"
}
```

## 安全特性

1. **路径验证**: 所有路径都经过验证，只允许 `C:` 和 `D:` 盘符
2. **目录遍历防护**: 自动过滤 `..` 路径，防止目录遍历攻击
3. **文件存在检查**: 压缩操作前检查源路径是否存在
4. **目标文件检查**: 压缩操作前检查目标文件是否已存在（避免覆盖）
5. **CORS 支持**: 支持跨域请求（开发环境）

## 使用示例

### JavaScript 封装类

```javascript
class CompressionDrive {
    static BASE_URL = '/service/CompressionDirve.php';
    
    /**
     * 发送请求
     */
    static async request(action, params = {}, options = {}) {
        const url = new URL(this.BASE_URL, window.location.origin);
        url.searchParams.set('action', action);
        
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined) {
                url.searchParams.set(key, value);
            }
        }
        
        const requestOptions = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };
        
        if (options.body) {
            requestOptions.body = JSON.stringify(options.body);
        }
        
        const response = await fetch(url.toString(), requestOptions);
        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || '操作失败');
        }
        
        return result.data;
    }
    
    /**
     * ZIP 压缩
     * @param {string|string[]} sourcePath - 单个源路径或源路径数组
     * @param {string} targetPath - 目标压缩文件路径
     * @param {object} options - 压缩选项
     */
    static async compressZip(sourcePath, targetPath, options = {}) {
        const params = { targetPath };
        const body = { options };
        
        // 支持单个路径或路径数组
        if (Array.isArray(sourcePath)) {
            body.sourcePaths = sourcePath;
        } else {
            body.sourcePath = sourcePath;
        }
        
        return await this.request('compress_zip', params, {
            method: 'POST',
            body
        });
    }
    
    /**
     * ZIP 解压缩
     */
    static async extractZip(sourcePath, targetPath, options = {}) {
        return await this.request('extract_zip', {
            sourcePath,
            targetPath
        }, {
            method: 'POST',
            body: { options }
        });
    }
    
    /**
     * 列出 ZIP 文件内容
     */
    static async listZip(sourcePath) {
        return await this.request('list_zip', { sourcePath });
    }
    
    /**
     * RAR 解压缩
     */
    static async extractRar(sourcePath, targetPath, options = {}) {
        return await this.request('extract_rar', {
            sourcePath,
            targetPath
        }, {
            method: 'POST',
            body: { options }
        });
    }
    
    /**
     * 列出 RAR 文件内容
     */
    static async listRar(sourcePath) {
        return await this.request('list_rar', { sourcePath });
    }
    
    /**
     * 检查压缩格式支持
     */
    static async checkSupport() {
        return await this.request('check_support');
    }
}
```

### 使用示例

```javascript
// 检查支持
const support = await CompressionDrive.checkSupport();
console.log('ZIP 支持:', support.zip);
console.log('RAR 支持:', support.rar);

// ZIP 压缩目录
await CompressionDrive.compressZip(
    'D:/application/mydir',
    'D:/backup/archive.zip',
    {
        exclude: ['node_modules', '.git'],
        compressionLevel: 9
    }
);

// ZIP 压缩单个文件
await CompressionDrive.compressZip(
    'D:/application/file.txt',
    'D:/backup/file.zip'
);

// ZIP 压缩多个文件/目录
await CompressionDrive.compressZip(
    [
        'D:/application/file1.txt',
        'D:/application/dir1',
        'D:/application/dir2'
    ],
    'D:/backup/multi-archive.zip',
    {
        exclude: ['node_modules', '.git'],
        compressionLevel: 9
    }
);

// ZIP 解压缩
const result = await CompressionDrive.extractZip(
    'D:/backup/archive.zip',
    'D:/extracted',
    {
        overwrite: true
    }
);
console.log(`解压了 ${result.extractedCount} 个文件`);

// 列出 ZIP 文件内容
const list = await CompressionDrive.listZip('D:/backup/archive.zip');
console.log(`ZIP 文件包含 ${list.fileCount} 个文件/目录`);
list.files.forEach(file => {
    console.log(`${file.isDir ? '[DIR]' : '[FILE]'} ${file.name} (${file.size} 字节)`);
});

// RAR 解压缩（需要 PHP RAR 扩展）
try {
    await CompressionDrive.extractRar(
        'D:/backup/archive.rar',
        'D:/extracted',
        { overwrite: true }
    );
} catch (error) {
    console.error('RAR 解压缩失败:', error.message);
}
```

## 系统要求

### ZIP 支持

- **必需**: PHP `ZipArchive` 类（PHP 5.2.0+ 内置）
- **检查方法**: `class_exists('ZipArchive')`

### RAR 支持

- **必需**: PHP RAR 扩展（`php-rar`）
- **安装方法**:
  - Windows: 下载 `php_rar.dll`，放入 PHP 扩展目录，在 `php.ini` 中添加 `extension=rar`
  - Linux: `pecl install rar` 或 `apt-get install php-rar`
- **检查方法**: `extension_loaded('rar')`
- **注意**: RAR 扩展主要用于读取，不支持创建 RAR 文件

## 注意事项

1. **路径格式**: 所有路径必须使用虚拟路径格式（`C:`、`D:` 等），不要使用实际文件系统路径
2. **异步操作**: 所有操作都是异步的，需要使用 `await` 或 `.then()`
3. **错误处理**: 始终检查响应中的 `status` 字段，处理可能的错误
4. **大文件**: 对于大文件或目录，压缩/解压缩操作可能需要较长时间
5. **RAR 限制**: RAR 压缩功能当前不支持，请使用 ZIP 格式
6. **扩展检查**: 使用前建议先调用 `check_support` 检查格式支持情况
7. **路径验证**: 根路径（`C:` 或 `D:`）会自动转换为 `C:/` 或 `D:/` 格式
8. **多路径压缩**: 当使用 `sourcePaths` 压缩多个文件/目录时，每个项目会以其基本名称作为前缀添加到 ZIP 中，避免路径冲突
9. **错误响应**: 服务端已增强错误处理，所有错误都会返回 JSON 格式，包括 PHP 错误和异常

## 相关文档

- [FSDirve.md](./FSDirve.md) - 文件系统驱动服务（文件操作）
- [ProcessManager.md](./ProcessManager.md) - 进程管理器（路径转换）

