# PermissionManager API 文档

## 概述

`PermissionManager` 是 ZerOS 内核的权限管理系统，负责管理所有程序的内核操作权限。提供权限声明、权限检查、动态权限申请和权限持久化功能。权限管理系统是 ZerOS 安全架构的核心组件，确保所有内核 API 调用都经过严格的权限验证。

## 依赖

- `ProcessManager` - 进程管理器（用于获取程序信息）
- `LStorage` - 本地存储（用于权限持久化）
- `GUIManager` - GUI 管理器（用于显示权限请求对话框）

## 权限级别

权限管理系统定义了三种权限级别：

- **NORMAL（普通权限）**：自动授予，仅记录，无需用户确认
- **SPECIAL（特殊权限）**：需要用户确认，首次使用时弹出权限请求对话框
- **DANGEROUS（危险权限）**：需要用户明确授权，每次使用时都可能弹出权限请求对话框

## 权限枚举

### 系统级权限

```javascript
PermissionManager.PERMISSION.SYSTEM_NOTIFICATION      // 发送系统通知
PermissionManager.PERMISSION.SYSTEM_STORAGE_READ      // 读取系统级本地存储
PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE     // 写入系统级本地存储
PermissionManager.PERMISSION.PROCESS_MANAGE           // 管理其他进程（启动/终止）
PermissionManager.PERMISSION.THEME_READ               // 读取系统主题配置
PermissionManager.PERMISSION.THEME_WRITE              // 更改系统主题配置
PermissionManager.PERMISSION.DESKTOP_MANAGE           // 管理桌面快捷方式和背景
```

### 文件系统权限

```javascript
PermissionManager.PERMISSION.KERNEL_DISK_READ         // 读取磁盘文件
PermissionManager.PERMISSION.KERNEL_DISK_WRITE        // 写入磁盘文件
PermissionManager.PERMISSION.KERNEL_DISK_DELETE       // 删除磁盘文件
PermissionManager.PERMISSION.KERNEL_DISK_CREATE       // 创建磁盘文件/目录
PermissionManager.PERMISSION.KERNEL_DISK_LIST         // 列出磁盘文件/目录
```

### 内存权限

```javascript
PermissionManager.PERMISSION.KERNEL_MEMORY_READ       // 读取内核内存数据
PermissionManager.PERMISSION.KERNEL_MEMORY_WRITE      // 写入内核内存数据
```

### 网络权限

```javascript
PermissionManager.PERMISSION.NETWORK_ACCESS           // 访问网络（fetch, XMLHttpRequest等）
```

### GUI权限

```javascript
PermissionManager.PERMISSION.GUI_WINDOW_CREATE        // 创建GUI窗口
PermissionManager.PERMISSION.GUI_WINDOW_MANAGE        // 管理其他程序的GUI窗口（最小化/最大化/关闭）
```

### 加密权限

```javascript
PermissionManager.PERMISSION.CRYPT_GENERATE_KEY       // 生成密钥对
PermissionManager.PERMISSION.CRYPT_IMPORT_KEY         // 导入密钥对
PermissionManager.PERMISSION.CRYPT_DELETE_KEY         // 删除密钥
PermissionManager.PERMISSION.CRYPT_ENCRYPT            // 加密数据
PermissionManager.PERMISSION.CRYPT_DECRYPT            // 解密数据
PermissionManager.PERMISSION.CRYPT_MD5                // MD5 哈希
PermissionManager.PERMISSION.CRYPT_RANDOM             // 随机数生成
```

### 地理位置权限

```javascript
PermissionManager.PERMISSION.GEOGRAPHY_LOCATION       // 获取地理位置信息
```

## 初始化

权限管理器在系统启动时自动初始化，无需手动调用。

```javascript
// 自动初始化（在 BootLoader 中）
await PermissionManager.init();
```

## API 方法

### 权限注册

#### `registerProgramPermissions(pid, programInfoOrPermissions)`

注册程序的权限声明。在程序启动时由 `ProcessManager` 自动调用。

**参数**:
- `pid` (number): 进程ID
- `programInfoOrPermissions` (Object|Array): 程序信息对象（包含 `permissions` 数组）或权限数组（向后兼容）

**返回值**: `Promise<void>`

**示例**:
```javascript
// 在程序的 __info__ 方法中声明权限
__info__() {
    return {
        name: 'myapp',
        type: 'GUI',
        version: '1.0.0',
        permissions: [
            PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
            PermissionManager.PERMISSION.KERNEL_DISK_READ,
            PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
            PermissionManager.PERMISSION.SYSTEM_NOTIFICATION
        ]
    };
}

// ProcessManager 会自动调用
await PermissionManager.registerProgramPermissions(pid, programInfo);
```

### 权限检查

#### `hasPermission(pid, permission)`

检查程序是否已有指定权限。

**参数**:
- `pid` (number): 进程ID
- `permission` (string): 权限名称

**返回值**: `boolean` - 是否有权限

**示例**:
```javascript
const hasNotify = PermissionManager.hasPermission(pid, PermissionManager.PERMISSION.SYSTEM_NOTIFICATION);
if (hasNotify) {
    // 程序已有通知权限
}
```

#### `checkAndRequestPermission(pid, permission)`

检查并申请权限（如果未授予）。这是权限检查的核心方法，会自动处理权限请求流程。

**参数**:
- `pid` (number): 进程ID
- `permission` (string): 权限名称

**返回值**: `Promise<boolean>` - 是否获得权限

**工作流程**:
1. 检查是否已有权限（包括缓存）
2. 如果是普通权限，自动授予
3. 如果是特殊/危险权限，弹出权限请求对话框
4. 用户选择后返回结果
5. 结果会被缓存 5 秒，避免重复检查

**示例**:
```javascript
// 在创建通知前检查权限
const hasPermission = await PermissionManager.checkAndRequestPermission(
    this.pid,
    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION
);

if (hasPermission) {
    // 创建通知
    NotificationManager.createNotification(this.pid, {...});
} else {
    // 权限被拒绝
    console.error('没有通知权限');
}
```

### 权限管理

#### `revokePermission(pid, permission)`

撤销程序的指定权限。

**参数**:
- `pid` (number): 进程ID
- `permission` (string): 权限名称

**示例**:
```javascript
PermissionManager.revokePermission(pid, PermissionManager.PERMISSION.SYSTEM_NOTIFICATION);
```

#### `clearProgramPermissions(pid)`

清除程序的所有权限。在程序终止时由 `ProcessManager` 自动调用。

**参数**:
- `pid` (number): 进程ID

**示例**:
```javascript
// ProcessManager 会自动调用
PermissionManager.clearProgramPermissions(pid);
```

#### `getProgramPermissions(pid)`

获取程序的所有权限列表。

**参数**:
- `pid` (number): 进程ID

**返回值**: `Array<string>` - 权限列表

**示例**:
```javascript
const permissions = PermissionManager.getProgramPermissions(pid);
console.log('程序权限:', permissions);
```

### 缓存管理

#### `clearPermissionCache(pid)`

清除权限检查缓存。用于强制重新检查权限。

**参数**:
- `pid` (number|null): 进程ID，如果为 `null` 则清除所有缓存

**示例**:
```javascript
// 清除指定程序的缓存
PermissionManager.clearPermissionCache(pid);

// 清除所有缓存
PermissionManager.clearPermissionCache(null);
```

### 统计信息

#### `getPermissionStats()`

获取权限统计信息（用于调试和监控）。

**返回值**: `Object` - 统计信息对象
- `totalPrograms` (number): 已注册权限的程序数量
- `totalPermissions` (number): 总权限数量
- `cacheSize` (number): 缓存大小
- `pendingChecks` (number): 正在进行的权限检查数量
- `pendingRequests` (number): 待处理的权限请求数量
- `initialized` (boolean): 是否已初始化

**示例**:
```javascript
const stats = PermissionManager.getPermissionStats();
console.log('权限统计:', stats);
```

## 权限级别映射

### 普通权限（自动授予）

- `KERNEL_DISK_READ` - 读取文件
- `KERNEL_DISK_LIST` - 列出目录
- `GUI_WINDOW_CREATE` - 创建窗口
- `THEME_READ` - 读取主题

### 特殊权限（需要用户确认）

- `SYSTEM_NOTIFICATION` - 系统通知
- `KERNEL_DISK_WRITE` - 写入文件
- `KERNEL_DISK_CREATE` - 创建文件/目录
- `KERNEL_DISK_DELETE` - 删除文件
- `KERNEL_MEMORY_READ` - 读取内存
- `KERNEL_MEMORY_WRITE` - 写入内存
- `NETWORK_ACCESS` - 网络访问
- `GUI_WINDOW_MANAGE` - 管理窗口
- `SYSTEM_STORAGE_READ` - 读取系统存储
- `SYSTEM_STORAGE_WRITE` - 写入系统存储
- `THEME_WRITE` - 修改主题
- `DESKTOP_MANAGE` - 管理桌面

### 危险权限（需要明确授权）

- `PROCESS_MANAGE` - 管理进程

## 使用示例

### 示例 1: 在程序中声明权限

```javascript
// test/application/myapp/myapp.js
__info__() {
    return {
        name: 'myapp',
        type: 'GUI',
        version: '1.0.0',
        permissions: [
            PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
            PermissionManager.PERMISSION.KERNEL_DISK_READ,
            PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
            PermissionManager.PERMISSION.SYSTEM_NOTIFICATION
        ]
    };
}
```

### 示例 2: 检查权限后调用 API

```javascript
// 在创建通知前检查权限
async function createNotification() {
    const hasPermission = await PermissionManager.checkAndRequestPermission(
        this.pid,
        PermissionManager.PERMISSION.SYSTEM_NOTIFICATION
    );
    
    if (!hasPermission) {
        console.error('没有通知权限');
        return;
    }
    
    // 创建通知
    await NotificationManager.createNotification(this.pid, {
        type: 'snapshot',
        title: '通知标题',
        content: '通知内容'
    });
}
```

### 示例 3: 通过 ProcessManager 调用内核 API（自动权限检查）

```javascript
// ProcessManager 会自动检查权限
try {
    const content = await ProcessManager.callKernelAPI(
        this.pid,
        'FileSystem.read',
        ['D:/myfile.txt']
    );
    console.log('文件内容:', content);
} catch (e) {
    if (e.message.includes('没有权限')) {
        console.error('权限被拒绝:', e.message);
    } else {
        console.error('读取文件失败:', e.message);
    }
}
```

## 权限请求对话框

当程序请求特殊或危险权限时，系统会自动弹出权限请求对话框：

- **程序信息**：显示请求权限的程序名称
- **权限信息**：显示权限名称和详细描述
- **权限级别**：显示权限级别（特殊权限/危险权限）
- **用户选择**：用户可以选择"允许"或"拒绝"

权限请求对话框使用拟态设计，提供良好的用户体验。

## 权限持久化

权限管理器使用 `LStorage` 持久化权限记录：

- 权限记录保存在 `permissionManager.permissions` 键中
- 程序关闭后，已授予的权限会被保存
- 下次启动时，已授予的权限会自动恢复
- 普通权限会在程序启动时自动授予

## 性能优化

### 权限检查缓存

- 权限检查结果会被缓存 5 秒（`CACHE_TTL`）
- 避免短时间内重复检查同一权限
- 权限授予/撤销时自动清除相关缓存

### 并发请求去重

- 同一程序同时请求同一权限时，会共享同一个 Promise
- 避免同时弹出多个权限请求对话框
- 提高用户体验和系统性能

### 异步持久化

- 权限保存使用异步操作，不阻塞主线程
- 初始化时异步等待依赖就绪

## 注意事项

1. **权限检查是强制性的**：所有需要权限的内核 API 调用都必须经过权限检查
2. **权限被拒绝时 API 调用会被拒绝**：如果权限被拒绝，相应的 API 调用会立即抛出错误
3. **Exploit 程序享有特权**：Exploit 程序（PID 10000）享有直接通信权限，无需权限检查
4. **权限声明是必需的**：程序必须在 `__info__` 中声明所需权限
5. **普通权限自动授予**：普通权限会在程序启动时自动授予，无需用户确认
6. **特殊权限需要用户确认**：特殊权限首次使用时需要用户确认
7. **权限持久化**：已授予的权限会被持久化保存，下次启动时自动恢复

## 相关文档

- [ProcessManager.md](./ProcessManager.md) - 进程管理器（权限检查集成）
- [NotificationManager.md](./NotificationManager.md) - 通知管理器（权限检查集成）
- [LStorage.md](./LStorage.md) - 本地存储（权限持久化）
- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南

