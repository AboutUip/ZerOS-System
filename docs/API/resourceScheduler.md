# ResourceScheduler API 文档

## 概述

ResourceScheduler 是 ZerOS 的资源调度核心组件，负责 CPU 和网络资源的统一调度、限流和统计。

**文件路径**: `kernel/process/resourceScheduler.js`

**更新日期**: 2026-03-14

---

## 目录

1. [类结构](#类结构)
2. [配置属性](#配置属性)
3. [静态方法](#静态方法)
4. [CPU 调度 API](#cpu-调度-api)
5. [网络调度 API](#网络调度-api)
6. [统计信息 API](#统计信息-api)
7. [使用示例](#使用示例)
8. [事件和信号](#事件和信号)

---

## 类结构

```javascript
class ResourceScheduler {
    // CPU 调度相关
    static _tokens: number          // 当前 CPU 令牌数
    static _lastRefillTime: number  // 上次令牌补充时间
    static _queue: Array            // CPU 请求队列
    static _stats: Object           // CPU 调度统计
    static _history: Array          // CPU 调度历史
    
    // 网络调度相关
    static _netTokens: number       // 当前网络令牌数
    static _netLastRefillTime: number
    static _netQueue: Array         // 网络请求队列
    static _netStats: Object        // 网络调度统计
    static _netHistory: Array       // 网络调度历史
    
    // 配置
    static CONFIG: Object           // CPU 配置
    static NET_CONFIG: Object       // 网络配置
    static PRIORITY: Object         // 优先级常量
    static API_PRIORITY: Map        // API 优先级映射
}
```

---

## 配置属性

### CONFIG (CPU 配置)

从 `SystemInformation.CPU_CONFIG` 读取，默认值：

```javascript
{
    tokensPerSecond: 20,      // 每秒 CPU 调度令牌数
    maxQueueSize: 100,        // CPU 队列最大长度
    enableScheduling: true,   // 是否启用 CPU 调度
    refillInterval: 1000,     // 令牌补充间隔 (ms)
    netTokensPerSecond: 35,   // 网络令牌/秒 (2026-03-14 更新)
    netMaxQueueSize: 100,     // 网络队列最大长度
    enableNetScheduling: true // 是否启用网络调度
}
```

### NET_CONFIG (网络配置)

```javascript
{
    tokensPerSecond: 35,      // 每秒网络令牌数 (已优化)
    maxQueueSize: 100,        // 队列最大长度
    enableScheduling: true,   // 是否启用调度
    refillInterval: 1000      // 补充间隔 (ms)
}
```

### PRIORITY (优先级常量)

```javascript
{
    CRITICAL: 0,  // 关键优先级（窗口操作）
    HIGH: 1,      // 高优先级（桌面、任务栏）
    NORMAL: 2,    // 普通优先级（文件系统）
    LOW: 3        // 低优先级（本地存储）
}
```

---

## 静态方法

### 初始化方法

#### `static _init()`
初始化资源调度器，启动令牌补充定时器。

**调用时机**: 系统启动时自动调用

#### `static _initNetworkScheduler()`
初始化网络调度器，启动网络令牌补充定时器。

**调用时机**: 系统启动时自动调用

#### `static _startNetRefillTimer()`
启动网络令牌补充定时器（1 秒间隔）。

---

### CPU 调度方法

#### `static schedule(task, pid, apiName)`
调度一个 CPU 任务。

**参数**:
- `task`: Function - 要执行的任务函数
- `pid`: number - 进程 ID
- `apiName`: string - API 名称

**返回**:
- `Object | Promise`: 调度结果或 Promise

**示例**:
```javascript
const result = ResourceScheduler.schedule(
    () => { /* 任务代码 */ },
    1001,
    'Window.setTitle'
);
```

#### `static _refillTokens()`
补充 CPU 令牌（每秒调用）。

#### `static _processQueue()`
处理 CPU 等待队列。

#### `static _recordToHistory(pid, apiName)`
记录 CPU 调用到历史。

---

### 网络调度方法

#### `static scheduleNetwork(task, pid, apiName)`
调度一个网络请求。

**参数**:
- `task`: Function - 网络请求函数
- `pid`: number - 进程 ID
- `apiName`: string - API 名称（通常为 'fetch'）

**返回**:
- `Object | Promise`: 调度结果或 Promise

**内部流程**:
1. 检查令牌是否充足
2. 有令牌：立即执行，消耗令牌
3. 无令牌：进入队列等待
4. 队列满：拒绝请求

**示例**:
```javascript
const result = ResourceScheduler.scheduleNetwork(
    async () => await fetch(url),
    1001,
    'fetch'
);
```

#### `static _refillNetTokens()`
补充网络令牌（每秒调用）。

**逻辑**:
```javascript
if (elapsed >= 1000ms) {
    _netTokens = NET_CONFIG.tokensPerSecond; // 35
    _netLastRefillTime = Date.now();
}
```

#### `static _processNetQueue()`
处理网络等待队列。

**逻辑**:
```javascript
while (_netQueue.length > 0 && _netTokens > 0) {
    const item = _netQueue.shift();
    _netTokens--;
    item.resolve(executeRequest(item.request));
}
```

#### `static _recordToNetHistory(pid, apiName)`
记录网络调用到历史。

---

### 统计信息方法

#### `static getStats()`
获取 CPU 调度统计信息。

**返回**:
```javascript
{
    totalCalls: number,      // 总调用次数
    queuedCalls: number,     // 队列中的调用
    rejectedCalls: number,   // 被拒绝的调用
    queueLength: number,     // 当前队列长度
    tokens: number,          // 当前令牌数
    byProcess: Object        // 按进程统计
}
```

#### `static getNetStats()`
获取网络调度统计信息。

**返回**:
```javascript
{
    totalCalls: number,      // 总网络请求数
    queuedCalls: number,     // 队列中的请求
    rejectedCalls: number,   // 被拒绝的请求
    queueLength: number,     // 当前队列长度
    tokens: number,          // 当前网络令牌数
    byProcess: Object        // 按进程统计
}
```

#### `static getHistory()`
获取 CPU 调度历史（最近 120 条记录）。

**返回**:
```javascript
Array<{
    timestamp: number,
    pid: number,
    apiName: string,
    tokens: number
}>
```

#### `static getNetUsage()`
获取网络使用情况（按进程）。

**返回**:
```javascript
{
    [pid]: {
        percentage: number,  // 使用百分比
        calls: number        // 调用次数
    }
}
```

#### `static getCpuUsage()`
获取 CPU 使用情况（按进程）。

---

### 状态查询方法

#### `static isSchedulingEnabled()`
检查 CPU 调度是否启用。

**返回**: `boolean`

#### `static isNetSchedulingEnabled()`
检查网络调度是否启用。

**返回**: `boolean`

---

## CPU 调度 API

### 调度流程

```
任务提交
    ↓
检查调度是否启用
    ↓
是 → 检查令牌
    ├─ 有令牌 → 立即执行 → 记录历史 → 返回结果
    └─ 无令牌 → 检查队列
        ├─ 队列未满 → 加入队列 → 等待执行
        └─ 队列已满 → 拒绝请求 → 记录统计
    ↓
否 → 直接执行任务
```

### 优先级处理

API 优先级从 `API_PRIORITY` 映射表获取，影响队列中的执行顺序。

**高优先级 API**（CRITICAL）:
- 所有 Window.* API
- 窗口操作相关

**中优先级 API**（HIGH）:
- Desktop.* API
- Taskbar.* API
- Notification.* API

**普通优先级 API**（NORMAL）:
- FileSystem.* API

**低优先级 API**（LOW）:
- LocalStorage.* API
- Process.* API

---

## 网络调度 API

### 全局 Fetch 拦截

ResourceScheduler 自动包装 `window.fetch`：

```javascript
// 在 resourceScheduler.js 加载时自动执行
const originalFetch = window.fetch;
window.fetch = function(input, init) {
    const rs = ResourceScheduler;
    if (rs && rs.isNetSchedulingEnabled()) {
        return rs.scheduleNetwork(
            async () => await originalFetch(input, init),
            pid,
            'fetch'
        );
    }
    return originalFetch(input, init);
};
```

### 网络限流配置

**当前配置** (2026-03-14 更新):
- **令牌数**: 35 次/秒
- **队列大小**: 100 个请求
- **历史长度**: 120 个数据点

### Service Worker 集成

网络请求同时通过 Service Worker 进行限流：

**文件**: `kernel/drive/networkServiceWorker.js`

```javascript
// Service Worker 中的独立限流
let netTokens = 35;
const netTokensPerSecond = 35;

// 请求拦截
self.addEventListener('fetch', (event) => {
    refillTokens();
    if (netTokens > 0) {
        netTokens--;
        event.respondWith(executeRequest(request));
    } else if (netQueue.length < netQueueMaxSize) {
        // 进入队列
    } else {
        // 拒绝请求
    }
});
```

---

## 统计信息 API

### 实时监控

任务管理器通过以下 API 获取实时数据：

```javascript
// CPU 统计
const cpuStats = ResourceScheduler.getStats();
const cpuHistory = ResourceScheduler.getHistory();
const cpuUsage = ResourceScheduler.getCpuUsage();

// 网络统计
const netStats = ResourceScheduler.getNetStats();
const netUsage = ResourceScheduler.getNetUsage();
const netHistory = ResourceScheduler._netHistory;
```

### 数据可视化

任务管理器使用这些数据进行可视化：

```javascript
// 计算过去 1 秒内的调用次数
const now = Date.now();
const history = ResourceScheduler.getHistory();
const recentCalls = history.filter(h => now - h.timestamp < 1000).length;

// 计算 CPU 使用率百分比
const cpuPercent = (recentCalls / ResourceScheduler.CONFIG.tokensPerSecond) * 100;

// 绘制曲线图
_drawSimpleChart(canvas, history, '#8da6ff', 60);
```

---

## 使用示例

### 基本使用

```javascript
// 1. 系统自动初始化（无需手动调用）
// ResourceScheduler._init();

// 2. 调度 CPU 任务
const result = ResourceScheduler.schedule(
    () => {
        // 执行一些计算密集型任务
        return computeSomething();
    },
    ProcessManager.currentPid,
    'Custom.compute'
);

// 3. 调度网络请求（自动通过 fetch 拦截）
fetch('https://api.example.com/data')
    .then(response => response.json())
    .then(data => console.log(data));

// 4. 获取统计信息
const stats = ResourceScheduler.getStats();
console.log(`CPU 令牌：${stats.tokens}/${ResourceScheduler.CONFIG.tokensPerSecond}`);
console.log(`队列长度：${stats.queueLength}`);

const netStats = ResourceScheduler.getNetStats();
console.log(`网络令牌：${netStats.tokens}/${ResourceScheduler.NET_CONFIG.tokensPerSecond}`);
```

### 高级使用

```javascript
// 检查调度状态
if (ResourceScheduler.isSchedulingEnabled()) {
    console.log('CPU 调度已启用');
}

if (ResourceScheduler.isNetSchedulingEnabled()) {
    console.log('网络调度已启用');
}

// 获取按进程统计
const stats = ResourceScheduler.getStats();
Object.keys(stats.byProcess).forEach(pid => {
    console.log(`进程 ${pid}: ${stats.byProcess[pid].calls} 次调用`);
});

// 获取网络历史
const netHistory = ResourceScheduler._netHistory;
const recentCalls = netHistory.filter(h => Date.now() - h.timestamp < 1000);
console.log(`过去 1 秒内 ${recentCalls.length} 个网络请求`);
```

---

## 事件和信号

### 依赖信号

ResourceScheduler 加载完成后发布信号：

```javascript
DependencyConfig.publishSignal("../kernel/process/resourceScheduler.js");
```

### 内部事件

**令牌补充事件** (每秒):
- `_refillTokens()` - CPU 令牌补充
- `_refillNetTokens()` - 网络令牌补充

**队列处理事件** (持续):
- `_processQueue()` - 处理 CPU 队列
- `_processNetQueue()` - 处理网络队列

**历史记录事件**:
- `_recordToHistory()` - 记录 CPU 调用
- `_recordToNetHistory()` - 记录网络调用

---

## 性能优化

### 已实施优化

1. **历史数据限制**: 最多保留 120 条记录（约 2 分钟）
2. **令牌桶算法**: O(1) 时间复杂度的限流
3. **队列优先级**: 高优先级任务优先执行
4. **自动清理**: 超出队列大小的请求自动拒绝

### 配置优化建议

**高性能场景**:
```javascript
{
    tokensPerSecond: 50,      // 增加 CPU 令牌
    netTokensPerSecond: 100,  // 增加网络令牌
    maxQueueSize: 200         // 增加队列大小
}
```

**低资源场景**:
```javascript
{
    tokensPerSecond: 10,      // 减少 CPU 令牌
    netTokensPerSecond: 20,   // 减少网络令牌
    maxQueueSize: 50          // 减少队列大小
}
```

---

## 故障排除

### 常见问题

#### Q: 网络曲线一直为 0？
**A**: 检查以下几点：
1. `ResourceScheduler.isNetSchedulingEnabled()` 是否返回 true
2. `window.fetch` 是否被正确拦截
3. `_netHistory` 是否有数据

#### Q: CPU 使用率一直为 0%？
**A**: 检查：
1. `ResourceScheduler.isSchedulingEnabled()` 是否启用
2. 任务是否通过 `schedule()` 提交
3. `_history` 数组是否有记录

#### Q: 队列一直增长？
**A**: 可能原因：
1. 令牌数太少，处理速度跟不上
2. 增加 `tokensPerSecond` 配置
3. 检查是否有任务卡住

### 调试技巧

```javascript
// 1. 查看调度器状态
console.log('CPU 调度:', ResourceScheduler.isSchedulingEnabled());
console.log('网络调度:', ResourceScheduler.isNetSchedulingEnabled());

// 2. 查看统计信息
console.log('CPU 统计:', ResourceScheduler.getStats());
console.log('网络统计:', ResourceScheduler.getNetStats());

// 3. 查看历史数据
console.log('CPU 历史:', ResourceScheduler.getHistory().length);
console.log('网络历史:', ResourceScheduler._netHistory.length);

// 4. 查看配置
console.log('CPU 配置:', ResourceScheduler.CONFIG);
console.log('网络配置:', ResourceScheduler.NET_CONFIG);
```

---

## 相关文件

- `kernel/SystemInformation.js` - 系统配置（包含 CPU_CONFIG）
- `kernel/process/processManager.js` - 进程管理器
- `kernel/drive/networkServiceWorker.js` - 网络 Service Worker
- `system/service/DISK/D/application/taskmanager/taskmanager.js` - 任务管理器

---

## 更新日志

### 2026-03-14
- ✅ 网络令牌从 20 次/秒提升到 35 次/秒
- ✅ 历史数据长度从 60 增加到 120
- ✅ 添加全局 fetch 拦截
- ✅ 优化任务管理器性能页面
- ✅ 添加详细的 API 文档

### 之前的版本
- 初始实现 CPU 和网络调度
- 添加优先级系统
- 实现队列机制

---

**文档维护**: ZerOS 开发团队  
**最后更新**: 2026-03-14
