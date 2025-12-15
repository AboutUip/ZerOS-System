# GeographyDrive API 文档

## 概述

`GeographyDrive` 是 ZerOS 内核的地理位置驱动管理器，负责管理系统级的地理位置功能，包括高精度定位、低精度定位、地址信息获取等。提供统一的地理位置 API 供程序使用，支持原生 Geolocation API 和第三方 API 的混合定位策略。实现了智能缓存机制和并发控制，确保即使多个程序同时请求位置信息，也只会发起一次第三方 API 请求，避免重复调用。

## 依赖

- `ProcessManager` - 进程管理器（用于进程 ID 管理和权限检查）
- `PermissionManager` - 权限管理器（用于地理位置权限验证）
- `KernelLogger` - 内核日志（用于日志记录）

## 常量

### 定位精度

```javascript
GeographyDrive.ACCURACY = {
    HIGH: 'HIGH',           // 高精度（使用原生 API）
    LOW: 'LOW'              // 低精度（使用第三方 API）
};
```

### 定位状态

```javascript
GeographyDrive.STATUS = {
    IDLE: 'IDLE',           // 空闲
    LOCATING: 'LOCATING',   // 定位中
    SUCCESS: 'SUCCESS',     // 成功
    FAILED: 'FAILED'        // 失败
};
```

## 权限要求

所有地理位置 API 调用都需要相应的权限：

- **GEOGRAPHY_LOCATION** (特殊权限): 获取地理位置信息相关操作

特殊权限需要用户确认，首次使用时弹出权限请求对话框。

## 通过 ProcessManager 调用

所有地理位置功能都通过 `ProcessManager.callKernelAPI` 调用：

```javascript
// 获取 ProcessManager
const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");

// 调用地理位置 API
const location = await ProcessManager.callKernelAPI(
    this.pid,
    'Geography.getCurrentPosition',
    [{ enableHighAccuracy: true, timeout: 10000 }]
);
```

## API 方法

### 位置获取

#### `Geography.getCurrentPosition(pid, options)`

获取当前位置信息。优先使用原生 API 获取高精度位置，失败时使用第三方 API 进行低精度定位。

**参数**:
- `options` (Object, 可选): 定位选项
  - `enableHighAccuracy` (boolean, 默认 `false`): 是否启用高精度定位
    - `false`（默认）: 不启用高精度定位，仅使用第三方 API 进行低精度定位，不会触发浏览器权限请求
    - `true`: 启用高精度定位，会尝试使用原生 Geolocation API，需要用户确认浏览器权限
  - `timeout` (number, 默认 `10000`): 超时时间（毫秒）
  - `maximumAge` (number, 默认 `0`): 最大缓存时间（毫秒）
    - `0`（默认）: 不限制缓存时间，只要在缓存过期时间内（5分钟）即可使用
    - `> 0`: 指定最大缓存时间，超过此时间即使缓存未过期也不使用

**返回值**: `Promise<Object>` - 位置信息对象

**位置信息对象结构**:
```javascript
{
    // 基础位置信息
    latitude: number,           // 纬度
    longitude: number,          // 经度
    accuracy: number,           // 精度（米，仅高精度定位时可用）
    source: string,            // 定位来源：'HIGH' 或 'LOW'
    
    // 扩展信息（来自第三方 API）
    name: string,               // 城市名称（如 "晋城市"）
    address: {                  // 地址信息
        addressRegion: string,   // 省份（如 "山西省"）
        addressCountry: string,  // 国家（如 "中华人民共和国"）
        countryIso: string,     // 国家代码（如 "cn"）
        addressSubregion: string, // 子区域（如 "晋城市"）
        text: string            // 地址文本
    },
    
    // 高精度信息（仅高精度定位时可用）
    altitude: number,            // 海拔（米）
    altitudeAccuracy: number,   // 海拔精度（米）
    heading: number,            // 方向（度，0-360）
    speed: number,              // 速度（米/秒）
    timestamp: number           // 时间戳
}
```

**示例**:
```javascript
// 示例 1: 默认低精度定位（不触发浏览器权限请求）
try {
    const location = await ProcessManager.callKernelAPI(
        this.pid,
        'Geography.getCurrentPosition',
        []  // 使用默认选项，不启用高精度定位
    );
    console.log('位置信息:', location);
    console.log('城市:', location.name);
    console.log('地址:', location.address.text);
    console.log('定位来源:', location.source); // 'LOW'
} catch (error) {
    console.error('获取位置失败:', error.message);
}

// 示例 2: 明确请求高精度定位（会触发浏览器权限请求）
try {
    const location = await ProcessManager.callKernelAPI(
        this.pid,
        'Geography.getCurrentPosition',
        [{
            enableHighAccuracy: true,  // 明确启用高精度定位
            timeout: 10000,
            maximumAge: 60000  // 使用 1 分钟内的缓存
        }]
    );
    console.log('位置信息:', location);
    console.log('纬度:', location.latitude);
    console.log('经度:', location.longitude);
    console.log('精度:', location.accuracy, '米');
    console.log('城市:', location.name);
    console.log('地址:', location.address.text);
    console.log('定位来源:', location.source); // 'HIGH'
} catch (error) {
    console.error('获取位置失败:', error.message);
}

// 示例 3: 使用缓存（如果存在且未过期）
try {
    const location = await ProcessManager.callKernelAPI(
        this.pid,
        'Geography.getCurrentPosition',
        [{
            maximumAge: 300000  // 使用 5 分钟内的缓存
        }]
    );
    // 如果有缓存且未过期，会直接返回，不进行网络请求
    console.log('位置信息（可能来自缓存）:', location);
} catch (error) {
    console.error('获取位置失败:', error.message);
}
```

**定位策略**:

1. **缓存检查（优先）**:
   - 首先检查是否有缓存且未过期（5分钟内）
   - 如果缓存有效且满足 `maximumAge` 要求，直接返回缓存数据，不进行网络请求
   - 这样可以避免不必要的 API 调用，提升响应速度

2. **并发控制（防止重复请求）**:
   - 如果检测到有正在进行的定位请求，会等待该请求完成，而不是发起新的请求
   - 多个并发调用会共享同一个请求结果，避免重复的 API 调用
   - 这确保了即使多个程序同时请求位置信息，也只会发起一次第三方 API 请求
   - 如果正在进行的请求失败，后续调用会继续执行新的请求

3. **第三方 API（自动调用）**:
   - 第三方 API **始终自动调用**，无论是否启用高精度定位
   - 如果原生 API 成功，第三方 API 数据作为补充信息（城市名称、地址等）
   - 如果原生 API 失败或未启用，第三方 API 提供低精度定位（城市级别）

4. **高精度定位（可选）**:
   - 只有当 `enableHighAccuracy` 为 `true` 时，才会尝试使用原生 Geolocation API
   - 原生 API 会触发浏览器权限请求，需要用户确认
   - 成功时返回包含完整位置信息（经纬度、精度、海拔等）的对象
   - 失败时不影响第三方 API 的调用，系统会自动降级到低精度定位

5. **数据合并**:
   - 高精度定位成功时：使用原生 API 的经纬度和精度，第三方 API 的地址信息
   - 高精度定位失败或未启用时：使用第三方 API 的经纬度和地址信息

**错误处理**:
- 如果原生 API 和第三方 API 都失败，抛出错误
- 错误信息包含失败原因（权限拒绝、超时、网络错误等）

#### `Geography.getCachedLocation(pid)`

获取缓存的位置信息（如果存在且未过期）。

**参数**: 无

**返回值**: `Promise<Object|null>` - 缓存的位置信息，如果不存在或已过期则返回 `null`

**示例**:
```javascript
const cachedLocation = await ProcessManager.callKernelAPI(
    this.pid,
    'Geography.getCachedLocation',
    []
);

if (cachedLocation) {
    console.log('使用缓存的位置:', cachedLocation);
} else {
    console.log('缓存不存在或已过期');
}
```

**缓存机制**:
- 位置信息会自动缓存 5 分钟
- 如果缓存存在且未过期，直接返回缓存数据，不进行网络请求
- 可以通过 `maximumAge` 参数控制是否使用缓存
- 缓存检查在并发控制之前执行，确保有缓存时不会触发任何请求

### 缓存管理

#### `Geography.clearCache(pid)`

清除位置缓存。

**参数**: 无

**返回值**: `Promise<boolean>` - 始终返回 `true`

**示例**:
```javascript
await ProcessManager.callKernelAPI(
    this.pid,
    'Geography.clearCache',
    []
);
console.log('位置缓存已清除');
```

### 功能检查

#### `Geography.isSupported(pid)`

检查浏览器是否支持地理位置 API。

**参数**: 无

**返回值**: `Promise<boolean>` - 是否支持地理位置 API

**注意**: 此 API 不需要权限，可以直接调用。

**示例**:
```javascript
const supported = await ProcessManager.callKernelAPI(
    this.pid,
    'Geography.isSupported',
    []
);

if (supported) {
    console.log('浏览器支持地理位置 API');
} else {
    console.log('浏览器不支持地理位置 API，将使用第三方 API');
}
```

## 使用示例

### 基本使用

```javascript
// 在程序的 __init__ 方法中
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 获取 ProcessManager
    const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
    
    try {
        // 获取当前位置
        const location = await ProcessManager.callKernelAPI(
            this.pid,
            'Geography.getCurrentPosition',
            [{ enableHighAccuracy: true }]
        );
        
        console.log('当前位置:', location);
        console.log('城市:', location.name);
        console.log('地址:', location.address?.text);
    } catch (error) {
        console.error('获取位置失败:', error.message);
    }
}
```

### 带错误处理的完整示例

```javascript
async function getLocation() {
    const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
    
    try {
        // 先检查是否支持
        const supported = await ProcessManager.callKernelAPI(
            this.pid,
            'Geography.isSupported',
            []
        );
        
        if (!supported) {
            console.warn('浏览器不支持地理位置 API，将使用第三方 API');
        }
        
        // 尝试使用缓存
        const cached = await ProcessManager.callKernelAPI(
            this.pid,
            'Geography.getCachedLocation',
            []
        );
        
        if (cached) {
            console.log('使用缓存的位置:', cached);
            return cached;
        }
        
        // 获取新位置
        const location = await ProcessManager.callKernelAPI(
            this.pid,
            'Geography.getCurrentPosition',
            [{
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000  // 5 分钟内的缓存
            }]
        );
        
        console.log('位置获取成功:', location);
        return location;
        
    } catch (error) {
        if (error.message.includes('没有权限')) {
            console.error('权限被拒绝:', error.message);
        } else if (error.message.includes('超时')) {
            console.error('定位超时:', error.message);
        } else {
            console.error('获取位置失败:', error.message);
        }
        throw error;
    }
}
```

### 在程序信息中声明权限

```javascript
__info__: function() {
    return {
        name: "我的程序",
        version: "1.0.0",
        description: "使用地理位置功能的程序",
        permissions: [
            "GEOGRAPHY_LOCATION"  // 声明需要地理位置权限
        ]
    };
}
```

## 第三方 API 说明

### API 地址

```
https://api-v1.cenguigui.cn/api/UserInfo/apilet.php
```

### 请求参数

- `latitude` (可选): 纬度（如果提供，用于获取该位置的地址信息）
- `longitude` (可选): 经度（如果提供，用于获取该位置的地址信息）

### 响应格式

```json
{
    "code": "200",
    "msg": "请求成功",
    "data": [
        {
            "name": "晋城市",
            "geo": {
                "latitude": 35.4908303,
                "longitude": 112.8517578
            },
            "address": {
                "addressRegion": "山西省",
                "addressCountry": "中华人民共和国",
                "countryIso": "cn",
                "text": "山西省"
            }
        },
        // ... 更多城市数据
    ]
}
```

### 数据使用

- 仅使用 `data[0]`（市区）作为数据源
- 如果原生 API 成功，第三方 API 数据作为补充（城市名称、地址等）
- 如果原生 API 失败，使用第三方 API 的经纬度进行低精度定位

## 注意事项

1. **权限要求**: 所有地理位置 API（除 `isSupported`）都需要 `GEOGRAPHY_LOCATION` 权限，需要在程序的 `__info__` 中声明

2. **浏览器兼容性**: 
   - 高精度定位需要浏览器支持 Geolocation API（现代浏览器均支持）
   - 低精度定位通过第三方 API 实现，不依赖浏览器功能

3. **定位精度和权限**:
   - **高精度定位**：使用 GPS、WiFi、基站等多种方式，精度可达数米
     - 需要用户明确启用（`enableHighAccuracy: true`）
     - 会触发浏览器权限请求，需要用户确认
     - 默认不启用，避免不必要的权限请求
   - **低精度定位**：基于第三方 API，精度为城市级别
     - 默认启用，自动调用，无需用户确认
     - 不会触发浏览器权限请求

4. **缓存机制**:
   - 位置信息自动缓存 5 分钟
   - 有缓存且未过期时，优先使用缓存，不进行网络请求
   - 可以通过 `maximumAge` 参数进一步限制缓存使用时间
   - `maximumAge` 为 `0`（默认）表示不限制，只要在 5 分钟缓存过期时间内即可使用
   - 使用 `clearCache` 可以手动清除缓存

5. **错误处理**:
   - 原生 API 失败时会自动降级到第三方 API
   - 如果两者都失败，会抛出错误
   - 建议始终使用 try-catch 处理错误

6. **隐私保护**:
   - 地理位置信息属于敏感信息，需要用户明确授权
   - 权限级别为 SPECIAL，首次使用需要用户确认
   - 建议在获取位置前向用户说明用途

7. **性能优化**:
   - 使用缓存机制减少网络请求
   - 合理设置 `timeout` 和 `maximumAge` 参数
   - 避免频繁调用 `getCurrentPosition`

8. **网络依赖**:
   - 第三方 API 需要网络连接
   - 如果网络不可用，低精度定位会失败
   - 建议在网络可用时获取位置并缓存

9. **并发请求处理**:
   - 系统实现了并发控制机制，防止多个同时请求导致重复的 API 调用
   - 如果多个程序同时请求位置信息，只有第一个请求会发起网络调用
   - 其他并发请求会等待第一个请求完成，并共享其结果
   - 这确保了即使响应时间有差异，也不会导致重复请求第三方定位 API
   - 如果正在进行的请求失败，后续调用会继续执行新的请求

## 相关文档

- [ProcessManager API 文档](./ProcessManager.md) - 进程管理和 API 调用
- [PermissionManager API 文档](./PermissionManager.md) - 权限管理

