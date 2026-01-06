# SystemInformation API 文档

## 概述

`SystemInformation` 是 ZerOS 内核的系统信息模块，集中管理系统版本、内核版本、构建信息、开发者信息以及**后端服务配置**。该模块提供了统一的后端服务地址管理，支持 PHP 和 SpringBoot 两种后端服务的动态切换。

## 依赖

- `LStorage` - 本地存储（用于持久化后端配置）
- `KernelLogger` - 内核日志系统

## 后端服务支持

ZerOS 支持两种后端服务实现：

- **PHP 后端**：默认后端，使用 PHP 服务（如 `FSDirve.php`），默认端口 **8089**
- **SpringBoot 后端**：使用 SpringBoot 服务（如 `FSDirve`，无 `.php` 后缀），默认端口 **8080**

两种后端提供相同的功能接口，可根据需要动态切换。

## 后端服务切换

### 方法 1：通过代码切换

```javascript
// 切换到 SpringBoot 后端
SystemInformation.setBackendType(SystemInformation.BACKEND_TYPE.SPRINGBOOT);

// 切换回 PHP 后端
SystemInformation.setBackendType(SystemInformation.BACKEND_TYPE.PHP);

// 获取当前后端类型
const currentBackend = SystemInformation.getBackendType();
console.log(currentBackend); // 'PHP' 或 'SPRINGBOOT'
```

### 方法 2：通过 URL 参数切换

在访问系统时，使用 URL 参数指定后端类型：

```
# 使用 PHP 后端（默认）
http://localhost:8089/test/index.html

# 使用 SpringBoot 后端
http://localhost:8080/test/index.html?backend=SPRINGBOOT
```

### 方法 3：通过 LStorage 配置

后端配置会自动保存到 `LStorage`，可通过以下方式配置：

```javascript
// 设置后端配置
LStorage.setSystemStorage('system.backendConfig', {
    type: 'SPRINGBOOT',
    phpPort: 8089,
    springBootPort: 8080
});
```

## API 方法

### 系统信息

#### `getSystemVersion()`

获取系统版本号。

**返回值**: `string` - 系统版本号（如 `'0.5.4'`）

**示例**:
```javascript
const version = SystemInformation.getSystemVersion();
console.log(version); // '0.5.4'
```

#### `getKernelVersion()`

获取内核版本号。

**返回值**: `string` - 内核版本号（如 `'0.5.9'`）

**示例**:
```javascript
const kernelVersion = SystemInformation.getKernelVersion();
console.log(kernelVersion); // '0.5.9'
```

#### `getBuildDate()`

获取构建日期。

**返回值**: `Date` - 构建日期对象

**示例**:
```javascript
const buildDate = SystemInformation.getBuildDate();
console.log(buildDate); // Date 对象
```

#### `getSystemName()`

获取系统名称。

**返回值**: `string` - 系统名称（`'ZerOS'`）

#### `getSystemDescription()`

获取系统描述。

**返回值**: `string` - 系统描述

#### `getDevelopers()`

获取开发团队信息。

**返回值**: `Array<Object>` - 开发团队信息数组

**示例**:
```javascript
const developers = SystemInformation.getDevelopers();
developers.forEach(dev => {
    console.log(`${dev.name} - ${dev.role} (${dev.organization})`);
});
```

### 后端服务管理

#### `getBackendType()`

获取当前后端类型。

**返回值**: `string` - 后端类型（`'PHP'` 或 `'SPRINGBOOT'`）

**示例**:
```javascript
const backendType = SystemInformation.getBackendType();
console.log(backendType); // 'PHP' 或 'SPRINGBOOT'
```

#### `setBackendType(type)`

设置后端类型。

**参数**:
- `type` (string): 后端类型，必须是 `SystemInformation.BACKEND_TYPE.PHP` 或 `SystemInformation.BACKEND_TYPE.SPRINGBOOT`

**示例**:
```javascript
// 切换到 SpringBoot 后端
SystemInformation.setBackendType(SystemInformation.BACKEND_TYPE.SPRINGBOOT);

// 切换回 PHP 后端
SystemInformation.setBackendType(SystemInformation.BACKEND_TYPE.PHP);
```

#### `getOrigin()`

获取系统基础URL（origin）。

**返回值**: `string` - 系统基础URL（如 `'http://localhost:8089'` 或 `'http://localhost:8080'`）

**说明**:
- 优先使用 `window.location.origin`（运行时动态获取）
- 如果 `window.location.origin` 不可用，根据后端类型自动选择端口作为降级方案

**示例**:
```javascript
const origin = SystemInformation.getOrigin();
console.log(origin); // 'http://localhost:8089' 或 'http://localhost:8080'
```

### 服务路径管理

#### `getServicePath(serviceName)`

获取服务完整路径（根据后端类型自动添加后缀）。

**参数**:
- `serviceName` (string): 服务名称（如 `'FSDirve'`）

**返回值**: `string` - 完整服务路径（如 `'/system/service/FSDirve.php'` 或 `'/system/service/FSDirve'`）

**说明**:
- PHP 后端：自动添加 `.php` 后缀
- SpringBoot 后端：不添加后缀

**示例**:
```javascript
// PHP 后端
SystemInformation.setBackendType(SystemInformation.BACKEND_TYPE.PHP);
const phpPath = SystemInformation.getServicePath('FSDirve');
console.log(phpPath); // '/system/service/FSDirve.php'

// SpringBoot 后端
SystemInformation.setBackendType(SystemInformation.BACKEND_TYPE.SPRINGBOOT);
const springBootPath = SystemInformation.getServicePath('FSDirve');
console.log(springBootPath); // '/system/service/FSDirve'
```

#### `getFSDirvePath()`

获取文件系统驱动服务路径。

**返回值**: `string` - FSDirve 服务路径

**示例**:
```javascript
const fsPath = SystemInformation.getFSDirvePath();
console.log(fsPath); // '/system/service/FSDirve.php' 或 '/system/service/FSDirve'
```

#### `getFSDirveUrl()`

获取文件系统驱动服务完整URL。

**返回值**: `string` - FSDirve 服务完整URL

**示例**:
```javascript
const fsUrl = SystemInformation.getFSDirveUrl();
console.log(fsUrl); // 'http://localhost:8089/system/service/FSDirve.php'
```

#### `getCompressionDirvePath()`

获取压缩驱动服务路径。

**返回值**: `string` - CompressionDirve 服务路径

#### `getCompressionDirveUrl()`

获取压缩驱动服务完整URL。

**返回值**: `string` - CompressionDirve 服务完整URL

#### `getImageProxyPath()`

获取图片代理服务路径。

**返回值**: `string` - ImageProxy 服务路径

#### `getImageProxyUrl()`

获取图片代理服务完整URL。

**返回值**: `string` - ImageProxy 服务完整URL

#### `getAudioProxyPath()`

获取音频代理服务路径。

**返回值**: `string` - AudioProxy 服务路径

#### `getAudioProxyUrl()`

获取音频代理服务完整URL。

**返回值**: `string` - AudioProxy 服务完整URL

#### `getModuleProxyPath()`

获取模块代理服务路径。

**返回值**: `string` - ModuleProxy 服务路径

#### `getModuleProxyUrl()`

获取模块代理服务完整URL。

**返回值**: `string` - ModuleProxy 服务完整URL

### URL 构建方法

#### `buildServiceUrl(serviceName, params)`

构建完整的服务URL。

**参数**:
- `serviceName` (string): 服务名称（如 `'FSDirve'`）或完整路径
- `params` (Object, 可选): 查询参数对象

**返回值**: `string` - 完整的服务URL

**示例**:
```javascript
// 构建 FSDirve URL
const url = SystemInformation.buildServiceUrl('FSDirve', {
    action: 'read_file',
    path: 'D:/',
    fileName: 'test.txt'
});
console.log(url); // 'http://localhost:8089/system/service/FSDirve.php?action=read_file&path=D%3A%2F&fileName=test.txt'
```

#### `buildServiceUrlObject(serviceName)`

构建URL对象（用于需要修改查询参数的场景）。

**参数**:
- `serviceName` (string): 服务名称（如 `'FSDirve'`）或完整路径

**返回值**: `URL` - URL对象

**示例**:
```javascript
const url = SystemInformation.buildServiceUrlObject('FSDirve');
url.searchParams.set('action', 'read_file');
url.searchParams.set('path', 'D:/');
url.searchParams.set('fileName', 'test.txt');
console.log(url.toString()); // 'http://localhost:8089/system/service/FSDirve.php?action=read_file&path=D%3A%2F&fileName=test.txt'
```

## 服务名称常量

系统定义了以下服务名称常量（不含后缀，根据后端类型自动添加）：

```javascript
SystemInformation.SERVICE_NAMES = {
    FSDIRVE: 'FSDirve',              // 文件系统驱动
    COMPRESSION_DIRVE: 'CompressionDirve',  // 压缩驱动
    IMAGE_PROXY: 'ImageProxy',        // 图片代理
    AUDIO_PROXY: 'audio-proxy',      // 音频代理
    MODULE_PROXY: 'module-proxy'      // 模块代理
};
```

## 后端类型常量

```javascript
SystemInformation.BACKEND_TYPE = {
    PHP: 'PHP',           // PHP 后端
    SPRINGBOOT: 'SPRINGBOOT'  // SpringBoot 后端
};
```

## 使用示例

### 示例 1：动态切换后端

```javascript
// 检查当前后端类型
const currentBackend = SystemInformation.getBackendType();
console.log(`当前后端: ${currentBackend}`);

// 切换到 SpringBoot 后端
SystemInformation.setBackendType(SystemInformation.BACKEND_TYPE.SPRINGBOOT);

// 构建服务URL（自动使用 SpringBoot 路径）
const url = SystemInformation.buildServiceUrl('FSDirve', {
    action: 'list_dir',
    path: 'D:/'
});
console.log(url); // 'http://localhost:8080/system/service/FSDirve?action=list_dir&path=D%3A%2F'
```

### 示例 2：使用服务路径构建URL

```javascript
// 获取服务路径
const servicePath = SystemInformation.getFSDirvePath();

// 构建完整URL
const url = new URL(servicePath, SystemInformation.getOrigin());
url.searchParams.set('action', 'read_file');
url.searchParams.set('path', 'D:/');
url.searchParams.set('fileName', 'test.txt');

// 发送请求
const response = await fetch(url.toString());
```

### 示例 3：使用 buildServiceUrlObject

```javascript
// 构建URL对象
const url = SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE);

// 添加查询参数
url.searchParams.set('action', 'write_file');
url.searchParams.set('path', 'D:/');
url.searchParams.set('fileName', 'test.txt');

// 发送POST请求
const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        content: 'Hello, ZerOS!',
        isBase64: false
    })
});
```

## 注意事项

1. **后端切换时机**：建议在系统启动时或初始化阶段切换后端类型，避免在运行时频繁切换
2. **配置持久化**：后端配置会自动保存到 `LStorage`，下次启动时会自动恢复
3. **URL 参数优先级**：URL 参数 `?backend=PHP` 或 `?backend=SPRINGBOOT` 的优先级高于 `LStorage` 中的配置
4. **服务路径自动处理**：使用 `SystemInformation` 的方法构建服务路径时，会自动根据后端类型添加或省略 `.php` 后缀
5. **降级方案**：如果 `SystemInformation` 不可用，代码应提供降级方案，使用 `window.location.origin` 和硬编码路径

## 相关文档

- [FSDirve API](./FSDirve.md) - 文件系统驱动服务
- [CompressionDrive API](./CompressionDrive.md) - 压缩驱动服务
- [LStorage API](./LStorage.md) - 本地存储API

