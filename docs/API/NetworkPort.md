# 网络端口管理 API 文档

## 概述

ZerOS 提供了完整的 TCP 端口监听和管理功能，允许程序注册端口、监听连接、接收和发送数据。该功能由以下组件协同工作：

- **前端模块**：`kernel/drive/networkManager.js` - 提供 JavaScript API
- **后端服务**：`system/service/networkDirve.php` - 处理端口注册和管理
- **守护进程**：`system/service/networkDirveDaemon.php` - 管理持久化套接字监听（可选）

## 架构说明

### 工作模式

系统支持两种工作模式：

1. **守护进程模式**（推荐）：
   - 使用 `networkDirveDaemon.php` 守护进程管理真正的 TCP 套接字
   - 套接字在守护进程中保持打开状态
   - 支持真正的实时数据接收和连接管理
   - 守护进程通过文件系统与主脚本通信

2. **简化模式**（降级）：
   - 当守护进程不可用时自动启用
   - 每次检查时重新创建套接字
   - 功能完整，但性能较低

### 数据流

```
程序 → NetworkManager → networkDirve.php → networkDirveDaemon.php
                                    ↓
                            文件系统（JSON）
                                    ↓
程序 ← NetworkManager ← networkDirve.php ← networkDirveDaemon.php
```

## 权限要求

所有端口管理操作需要 `NETWORK_ACCESS` 权限。该权限为**普通权限**，会自动授予，无需用户确认。程序必须在 `__info__` 中声明此权限：

```javascript
__info__() {
    return {
        name: "我的程序",
        permissions: ['NETWORK_ACCESS'],
        // ...
    };
}
```

**注意**：
- 虽然 `NETWORK_ACCESS` 是普通权限（自动授予），但仍需要在 `__info__` 中声明，以便系统记录和审计
- **管理员权限要求**：使用 `netport` CLI 命令需要管理员权限，只有管理员用户才能使用该命令。通过 API 调用端口管理功能时，只需要 `NETWORK_ACCESS` 权限（普通权限）

## API 参考

### 通过 ProcessManager 调用（推荐）

所有端口管理 API 都通过 `ProcessManager.callKernelAPI` 暴露，这是推荐的使用方式。

#### 1. 注册端口监听

注册一个 TCP 端口用于监听连接。

**API**: `Network.Port.register`

**参数**:
- `port` (number): 端口号，范围 1-65535
- `pid` (number): 进程 ID
- `programName` (string): 程序名称
- `options` (Object, 可选): 选项对象
  - `onData` (Function, 可选): 数据接收回调函数
  - `onConnection` (Function, 可选): 新连接回调函数

**返回值**: `Promise<Object>`
```javascript
{
    success: true,
    port: 8080,
    message: "端口 8080 注册成功"
}
```

**示例**:
```javascript
const pid = ProcessManager.getCurrentPID();
const result = await ProcessManager.callKernelAPI('Network.Port.register', [
    8080,           // 端口号
    pid,            // 进程 ID
    'MyServer',     // 程序名称
    {               // 选项
        onData: (data) => {
            console.log('收到数据:', data);
        },
        onConnection: (connection) => {
            console.log('新连接:', connection);
        }
    }
]);
```

#### 2. 取消端口监听

取消已注册的端口监听。

**API**: `Network.Port.unregister`

**参数**:
- `port` (number): 端口号

**返回值**: `Promise<Object>`
```javascript
{
    success: true,
    message: "端口 8080 已取消注册"
}
```

**示例**:
```javascript
await ProcessManager.callKernelAPI('Network.Port.unregister', [8080]);
```

#### 3. 获取端口状态

获取指定端口的详细状态信息。

**API**: `Network.Port.getStatus`

**参数**:
- `port` (number): 端口号

**返回值**: `Promise<Object>`
```javascript
{
    port: 8080,
    pid: 12345,
    programName: 'MyServer',
    status: 'listening',
    created: 1234567890,
    address: '0.0.0.0',
    connectionCount: 2,
    connections: [
        {
            id: 'conn_123',
            connectionId: 'conn_123',
            remote_address: '127.0.0.1',
            remoteAddress: '127.0.0.1',
            remote_port: 54321,
            remotePort: 54321,
            connected_at: 1234567890,
            connectedAt: 1234567890
        }
    ]
}
```

**示例**:
```javascript
const status = await ProcessManager.callKernelAPI('Network.Port.getStatus', [8080]);
console.log('端口状态:', status);
```

#### 4. 列出所有端口

获取所有已注册的端口列表。

**API**: `Network.Port.list`

**参数**: 无

**返回值**: `Promise<Array>`
```javascript
[
    {
        port: 8080,
        pid: 12345,
        programName: 'MyServer',
        status: 'listening',
        created: 1234567890,
        address: '0.0.0.0'
    }
]
```

**示例**:
```javascript
const ports = await ProcessManager.callKernelAPI('Network.Port.list', []);
console.log('已注册的端口:', ports);
```

#### 5. 向端口发送数据

作为客户端向指定端口发送数据。

**API**: `Network.Port.send`

**参数**:
- `host` (string): 主机地址（默认 '127.0.0.1'）
- `port` (number): 端口号
- `data` (string|ArrayBuffer|Blob): 要发送的数据

**返回值**: `Promise<Object>`
```javascript
{
    bytesWritten: 1024
}
```

**示例**:
```javascript
const result = await ProcessManager.callKernelAPI('Network.Port.send', [
    '127.0.0.1',    // 主机地址
    8080,           // 端口号
    'Hello Server'  // 数据
]);
console.log('发送字节数:', result.bytesWritten);
```

### 直接使用 NetworkManager（高级用法）

如果程序需要更细粒度的控制，可以直接使用 `NetworkManager` 实例。

#### 获取 NetworkManager 实例

```javascript
const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
// 或
const networkManager = window.NetworkManager;
```

#### 方法列表

- `registerPort(port, pid, programName, options)` - 注册端口
- `unregisterPort(port)` - 取消端口
- `getPortStatus(port)` - 获取端口状态
- `listPorts()` - 列出所有端口
- `sendDataToPort(host, port, data)` - 发送数据
- `addPortDataListener(port, listener)` - 添加数据监听器
- `removePortDataListener(port, listener)` - 移除数据监听器
- `addPortConnectionListener(port, listener)` - 添加连接监听器
- `removePortConnectionListener(port, listener)` - 移除连接监听器

## 数据格式

### 连接对象

连接对象包含以下字段（同时提供 `snake_case` 和 `camelCase` 格式以保持兼容性）：

```javascript
{
    id: 'conn_123',                    // 连接 ID
    connectionId: 'conn_123',           // 连接 ID（别名）
    remote_address: '127.0.0.1',        // 远程地址（snake_case）
    remoteAddress: '127.0.0.1',         // 远程地址（camelCase）
    remote_port: 54321,                 // 远程端口（snake_case）
    remotePort: 54321,                  // 远程端口（camelCase）
    connected_at: 1234567890,           // 连接时间戳（snake_case）
    connectedAt: 1234567890             // 连接时间戳（camelCase）
}
```

### 数据对象

数据对象包含以下字段：

```javascript
{
    connectionId: 'conn_123',           // 连接 ID
    data: 'Hello World',                // 数据内容（字符串）
    received_at: 1234567890,            // 接收时间戳（snake_case）
    receivedAt: 1234567890,             // 接收时间戳（camelCase）
    size: 11,                           // 数据大小（字节）
    from_host: '127.0.0.1',             // 来源主机
    from_port: 54321                    // 来源端口
}
```

## 监听器

### 数据监听器

数据监听器在接收到数据时被调用：

```javascript
const removeListener = networkManager.addPortDataListener(8080, (data) => {
    console.log('收到数据:', data.data);
    console.log('来自连接:', data.connectionId);
    console.log('数据大小:', data.size);
});

// 稍后移除监听器
removeListener();
// 或
networkManager.removePortDataListener(8080, listener);
```

### 连接监听器

连接监听器在新连接建立时被调用：

```javascript
const removeListener = networkManager.addPortConnectionListener(8080, (connection) => {
    console.log('新连接:', connection.remoteAddress, ':', connection.remotePort);
});

// 稍后移除监听器
removeListener();
// 或
networkManager.removePortConnectionListener(8080, listener);
```

## 完整示例

### 简单的 TCP 服务器

```javascript
async function startServer() {
    const pid = ProcessManager.getCurrentPID();
    
    // 注册端口
    await ProcessManager.callKernelAPI('Network.Port.register', [
        8080,
        pid,
        'MyServer',
        {
            onData: (data) => {
                console.log('收到数据:', data.data);
                // 处理数据...
            },
            onConnection: (connection) => {
                console.log('新连接:', connection.remoteAddress);
            }
        }
    ]);
    
    console.log('服务器已启动，监听端口 8080');
}

// 启动服务器
startServer().catch(console.error);
```

### 使用 NetworkManager 直接管理

```javascript
async function advancedServer() {
    const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
    const pid = ProcessManager.getCurrentPID();
    
    // 注册端口
    await networkManager.registerPort(8080, pid, 'MyServer');
    
    // 添加数据监听器
    networkManager.addPortDataListener(8080, (data) => {
        console.log('收到数据:', data.data);
        
        // 回复数据
        networkManager.sendDataToPort(
            data.from_host,
            data.from_port,
            'Echo: ' + data.data
        ).catch(console.error);
    });
    
    // 添加连接监听器
    networkManager.addPortConnectionListener(8080, (connection) => {
        console.log('新连接:', connection.remoteAddress);
    });
    
    // 定期检查端口状态
    setInterval(async () => {
        const status = await networkManager.getPortStatus(8080);
        console.log('端口状态:', status);
    }, 5000);
    
    // 程序退出时取消端口
    window.addEventListener('beforeunload', async () => {
        await networkManager.unregisterPort(8080);
    });
}

advancedServer().catch(console.error);
```

## 错误处理

所有 API 调用都可能抛出错误，应该使用 try-catch 处理：

```javascript
try {
    await ProcessManager.callKernelAPI('Network.Port.register', [8080, pid, 'MyServer']);
} catch (error) {
    if (error.message.includes('已被注册')) {
        console.error('端口已被占用');
    } else if (error.message.includes('无效的端口号')) {
        console.error('端口号无效');
    } else {
        console.error('注册失败:', error.message);
    }
}
```

## 注意事项

1. **端口范围**: 端口号必须在 1-65535 之间
2. **权限声明**: 确保程序已在 `__info__` 中声明 `NETWORK_ACCESS` 权限（该权限为普通权限，会自动授予）
3. **端口占用**: 如果端口已被占用，注册会失败
4. **资源清理**: 程序退出时应取消所有已注册的端口
5. **数据格式**: 数据以字符串形式传输，二进制数据会被自动转换
6. **守护进程**: 守护进程模式需要 `networkDirveDaemon.php` 文件存在且可执行
7. **跨平台**: 系统支持 Windows 和 Linux/Unix 平台

## 技术细节

### 端口检查机制

- 前端每 500ms 轮询一次端口状态
- 检查新连接和接收到的数据
- 数据通过监听器回调传递给程序

### 文件系统存储

端口配置和连接信息存储在：
- `system/service/DISK/D/cache/network/port_{port}.json` - 端口配置
- `system/service/DISK/D/cache/network/port_{port}_connections.json` - 连接信息
- `system/service/DISK/D/cache/network/port_{port}_data_queue.json` - 数据队列

### 守护进程通信

守护进程通过以下文件与主脚本通信：
- `daemon.pid` - 守护进程 PID
- `daemon_control.json` - 控制命令队列

## 相关文档

- [ProcessManager API](./ProcessManager.md) - 进程管理 API
- [权限管理](./PermissionManager.md) - 权限系统文档
- [网络管理](./NetworkManager.md) - 网络管理器文档（如果存在）

