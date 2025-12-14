# NetworkManager API 文档

## 概述

`NetworkManager` 是 ZerOS 内核的全局网络管理器，使用 Service Worker 截取所有网络请求进行统一处理与管理。提供网络状态监控、请求拦截、缓存管理、电池信息等功能。

## 依赖

- `KernelLogger` - 内核日志系统（用于日志输出）

## 初始化

网络管理器在系统启动时自动初始化（通过构造函数）：

```javascript
// 网络管理器是单例，通过 POOL 获取
const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
```

## API 方法

### 网络状态管理

#### `isOnline()`

检查网络连接状态。

**返回值**: `boolean` - 是否在线

**示例**:
```javascript
const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
if (networkManager.isOnline()) {
    console.log('网络已连接');
} else {
    console.log('网络已断开');
}
```

#### `getConnectionInfo()`

获取网络连接信息（如果支持）。

**返回值**: `Object|null` - 连接信息对象
```javascript
{
    effectiveType: string,    // 有效连接类型（如 '4g', '3g'）
    downlink: number,         // 下行速度（Mbps）
    rtt: number,             // 往返时间（ms）
    saveData: boolean,        // 是否启用数据节省模式
    type: string,            // 连接类型
    downlinkMax: number      // 最大下行速度（Mbps）
}
```

**示例**:
```javascript
const connectionInfo = networkManager.getConnectionInfo();
if (connectionInfo) {
    console.log(`连接类型: ${connectionInfo.effectiveType}`);
    console.log(`下行速度: ${connectionInfo.downlink} Mbps`);
}
```

#### `getAllNavigatorNetworkData()`

获取所有 navigator 网络相关数据。

**返回值**: `Object` - 所有网络相关数据

**示例**:
```javascript
const networkData = networkManager.getAllNavigatorNetworkData();
console.log('网络数据:', networkData);
```

#### `getNetworkStateSnapshot()`

获取当前网络状态快照。

**返回值**: `Object` - 网络状态快照
```javascript
{
    online: boolean,
    timestamp: number,
    connectionInfo: Object|null,
    navigatorData: Object,
    batteryInfo: Object|null,
    stats: Object
}
```

**示例**:
```javascript
const snapshot = networkManager.getNetworkStateSnapshot();
console.log('网络状态快照:', snapshot);
```

### 网络启用/禁用

#### `enableNetwork()`

启用网络。

**示例**:
```javascript
networkManager.enableNetwork();
```

#### `disableNetwork()`

禁用网络。

**示例**:
```javascript
networkManager.disableNetwork();
```

#### `toggleNetwork()`

切换网络启用状态。

**返回值**: `boolean` - 切换后的状态

**示例**:
```javascript
const enabled = networkManager.toggleNetwork();
console.log(`网络已${enabled ? '启用' : '禁用'}`);
```

#### `isNetworkEnabled()`

检查网络是否启用。

**返回值**: `boolean` - 网络是否启用

**示例**:
```javascript
if (networkManager.isNetworkEnabled()) {
    console.log('网络已启用');
}
```

### 网络请求

#### `fetch(url, options)`

发送网络请求（通过 Service Worker）。

**参数**:
- `url` (string): 请求 URL
- `options` (Object): 请求选项（可选）

**返回值**: `Promise<Response>` - 响应 Promise

**示例**:
```javascript
try {
    const response = await networkManager.fetch('https://api.example.com/data');
    const data = await response.json();
    console.log('数据:', data);
} catch (error) {
    console.error('请求失败:', error);
}
```

### 请求缓存

#### `setCache(url, response, ttl)`

设置请求缓存。

**参数**:
- `url` (string): 请求 URL
- `response` (Object): 响应数据
- `ttl` (number): 缓存时间（毫秒，默认 60000）

**示例**:
```javascript
networkManager.setCache('https://api.example.com/data', {
    status: 200,
    body: JSON.stringify({ data: 'cached' }),
    headers: {}
}, 300000); // 缓存 5 分钟
```

#### `getCache(url)`

获取请求缓存。

**参数**:
- `url` (string): 请求 URL

**返回值**: `Object|null` - 缓存的响应数据

**示例**:
```javascript
const cached = networkManager.getCache('https://api.example.com/data');
if (cached) {
    console.log('使用缓存:', cached);
}
```

#### `clearCache(url)`

清除请求缓存。

**参数**:
- `url` (string): 可选的 URL，如果提供则只清除该 URL 的缓存，否则清除所有缓存

**示例**:
```javascript
// 清除指定 URL 的缓存
networkManager.clearCache('https://api.example.com/data');

// 清除所有缓存
networkManager.clearCache();
```

### 电池信息

#### `getBatteryInfo()`

获取电池信息（如果支持）。

**返回值**: `Promise<Object|null>` - 电池信息对象
```javascript
{
    charging: boolean,        // 是否正在充电
    chargingTime: number,    // 充电时间（秒）
    dischargingTime: number, // 放电时间（秒）
    level: number           // 电池电量（0-1）
}
```

**示例**:
```javascript
const batteryInfo = await networkManager.getBatteryInfo();
if (batteryInfo) {
    console.log(`电池电量: ${(batteryInfo.level * 100).toFixed(0)}%`);
    console.log(`正在充电: ${batteryInfo.charging}`);
}
```

### 事件监听

#### `addNetworkStateListener(listener)`

添加网络状态监听器。

**参数**:
- `listener` (Function): 监听器函数 `(state) => {}`

**返回值**: `Function` - 取消监听的函数

**示例**:
```javascript
const unsubscribe = networkManager.addNetworkStateListener((state) => {
    console.log(`网络状态变化: ${state.online ? '在线' : '离线'}`);
    console.log('连接信息:', state.connectionInfo);
});

// 取消监听
unsubscribe();
```

#### `removeNetworkStateListener(listener)`

移除网络状态监听器。

**参数**:
- `listener` (Function): 要移除的监听器函数

**示例**:
```javascript
networkManager.removeNetworkStateListener(listener);
```

#### `addConnectionStateListener(listener)`

添加连接状态监听器。

**参数**:
- `listener` (Function): 监听器函数 `(state) => {}`

**返回值**: `Function` - 取消监听的函数

**示例**:
```javascript
const unsubscribe = networkManager.addConnectionStateListener((state) => {
    console.log('连接信息变化:', state.connectionInfo);
});

// 取消监听
unsubscribe();
```

#### `removeConnectionStateListener(listener)`

移除连接状态监听器。

**参数**:
- `listener` (Function): 要移除的监听器函数

**示例**:
```javascript
networkManager.removeConnectionStateListener(listener);
```

#### `addNetworkEnabledListener(listener)`

添加网络启用状态监听器。

**参数**:
- `listener` (Function): 监听器函数 `(enabled) => {}`

**返回值**: `Function` - 取消监听的函数

**示例**:
```javascript
const unsubscribe = networkManager.addNetworkEnabledListener((enabled) => {
    console.log(`网络已${enabled ? '启用' : '禁用'}`);
});

// 取消监听
unsubscribe();
```

#### `removeNetworkEnabledListener(listener)`

移除网络启用状态监听器。

**参数**:
- `listener` (Function): 要移除的监听器函数

**示例**:
```javascript
networkManager.removeNetworkEnabledListener(listener);
```

### 资源清理

#### `destroy()`

清理资源（清理定时器和监听器）。

**示例**:
```javascript
networkManager.destroy();
```

## 使用示例

### 示例 1: 检查网络状态

```javascript
const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");

// 检查是否在线
if (networkManager.isOnline()) {
    console.log('网络已连接');
    
    // 获取连接信息
    const connectionInfo = networkManager.getConnectionInfo();
    if (connectionInfo) {
        console.log(`连接类型: ${connectionInfo.effectiveType}`);
        console.log(`下行速度: ${connectionInfo.downlink} Mbps`);
    }
} else {
    console.log('网络已断开');
}
```

### 示例 2: 监听网络状态变化

```javascript
const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");

// 监听网络状态变化
const unsubscribe = networkManager.addNetworkStateListener((state) => {
    console.log(`网络状态: ${state.online ? '在线' : '离线'}`);
    console.log('连接信息:', state.connectionInfo);
    console.log('时间戳:', new Date(state.timestamp));
});

// 程序退出时取消监听
__exit__: function() {
    unsubscribe();
}
```

### 示例 3: 发送网络请求

```javascript
const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");

// 检查网络是否启用
if (!networkManager.isNetworkEnabled()) {
    console.log('网络已禁用，无法发送请求');
    return;
}

// 发送请求
try {
    const response = await networkManager.fetch('https://api.example.com/data', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    if (response.ok) {
        const data = await response.json();
        console.log('数据:', data);
    } else {
        console.error('请求失败:', response.status);
    }
} catch (error) {
    console.error('请求错误:', error);
}
```

### 示例 4: 使用缓存

```javascript
const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");

// 检查缓存
const cached = networkManager.getCache('https://api.example.com/data');
if (cached) {
    console.log('使用缓存:', cached);
} else {
    // 发送请求
    const response = await networkManager.fetch('https://api.example.com/data');
    const data = await response.json();
    
    // 缓存响应（5 分钟）
    networkManager.setCache('https://api.example.com/data', {
        status: response.status,
        body: JSON.stringify(data),
        headers: {}
    }, 300000);
}
```

### 示例 5: 获取电池信息

```javascript
const networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");

// 获取电池信息
const batteryInfo = await networkManager.getBatteryInfo();
if (batteryInfo) {
    console.log(`电池电量: ${(batteryInfo.level * 100).toFixed(0)}%`);
    console.log(`正在充电: ${batteryInfo.charging ? '是' : '否'}`);
    if (batteryInfo.charging) {
        console.log(`充电时间: ${Math.floor(batteryInfo.chargingTime / 60)} 分钟`);
    } else {
        console.log(`剩余时间: ${Math.floor(batteryInfo.dischargingTime / 60)} 分钟`);
    }
}
```

## 注意事项

1. **单例模式**: NetworkManager 是单例，通过 POOL 获取实例
2. **Service Worker**: 网络管理器使用 Service Worker 拦截请求，需要 HTTPS 或 localhost
3. **降级模式**: 如果 Service Worker 不可用，会自动降级到直接使用 fetch API
4. **网络禁用**: 禁用网络后，所有请求都会被拒绝
5. **缓存管理**: 请求缓存有 TTL（生存时间），过期后自动清除
6. **电池信息**: 电池信息需要浏览器支持 Battery API（通常需要 HTTPS）

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [Pool.md](./Pool.md) - 全局对象池 API

