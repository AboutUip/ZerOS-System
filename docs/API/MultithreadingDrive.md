# MultithreadingDrive API 文档

## 概述

`MultithreadingDrive` 是 ZerOS 内核的多线程驱动器，基于 Web Workers 实现线程池管理系统。它提供了线程创建、任务分配、线程回收等功能，允许应用程序在后台线程中执行计算密集型任务，避免阻塞主线程。

## 特性

- **线程池管理**：自动管理线程池，支持动态创建和回收线程
- **任务队列**：支持任务排队，自动分配空闲线程执行
- **进程隔离**：每个进程可以拥有独立的线程，支持进程级别的线程管理
- **自动回收**：空闲线程自动回收，节省系统资源
- **错误处理**：完整的错误处理和日志记录
- **状态监控**：提供线程池状态查询接口

## 依赖

- `KernelLogger` - 内核日志系统（用于日志输出）

## 初始化

多线程驱动器在浏览器环境中自动初始化：

```javascript
// 自动初始化（无需手动调用）
MultithreadingDrive.init();
```

## 配置

### 默认配置

```javascript
// 默认线程池大小
MultithreadingDrive.DEFAULT_POOL_SIZE = 4;

// 最大线程池大小
MultithreadingDrive.MAX_POOL_SIZE = 16;

// 线程空闲超时时间（毫秒）
MultithreadingDrive.THREAD_IDLE_TIMEOUT = 60000; // 60秒
```

## API 方法

### 线程管理

#### `createThread(pid)`

创建新线程。

**参数**:
- `pid` (number): 进程ID

**返回**:
- `string`: 线程ID

**示例**:
```javascript
const threadId = MultithreadingDrive.createThread(1234);
console.log(`线程已创建: ${threadId}`);
```

**说明**:
- 创建的线程会自动分配给指定的进程
- 线程ID格式：`thread_<序号>`
- 如果线程池已达到最大大小，将抛出错误

---

#### `executeTask(pid, script, args)`

在后台线程中执行任务。

**参数**:
- `pid` (number): 进程ID
- `script` (string|Function): 要执行的脚本（函数字符串或函数对象）
- `args` (Array): 参数数组（必须是可序列化的）

**返回**:
- `Promise<any>`: 任务执行结果

**示例**:
```javascript
// 使用函数对象
const result = await MultithreadingDrive.executeTask(
    this.pid,
    function(a, b) {
        // 在 Worker 中执行的计算
        let sum = 0;
        for (let i = a; i <= b; i++) {
            sum += i;
        }
        return sum;
    },
    [1, 1000000]
);
console.log(`计算结果: ${result}`);

// 使用函数字符串
const result2 = await MultithreadingDrive.executeTask(
    this.pid,
    "(function(x) { return x * x; })",
    [5]
);
console.log(`平方: ${result2}`);
```

**说明**:
- 脚本必须是函数或函数字符串
- 参数必须是可序列化的（不能包含函数、循环引用等）
- 如果函数返回 Promise，会自动等待 Promise 完成
- 结果会自动序列化，但某些复杂对象可能无法完全序列化

**限制**:
- Worker 中无法访问主线程的变量和函数
- 无法使用 `document`、`window` 等浏览器 API
- 无法直接访问 DOM
- 参数和返回值必须可序列化

---

#### `getPoolStatus()`

获取线程池状态信息。

**返回**:
- `Object`: 线程池状态
  ```javascript
  {
      total: number,        // 总线程数
      idle: number,         // 空闲线程数
      busy: number,         // 忙碌线程数
      queueLength: number, // 等待队列长度
      threads: Array<{      // 线程详细信息
          id: string,       // 线程ID
          pid: number,      // 所属进程ID
          status: string,   // 线程状态: 'idle' | 'busy' | 'terminated'
          taskCount: number,// 执行的任务数
          createdAt: number,// 创建时间戳
          lastUsedAt: number// 最后使用时间戳
      }>
  }
  ```

**示例**:
```javascript
const status = MultithreadingDrive.getPoolStatus();
console.log(`线程池状态: ${status.idle} 空闲, ${status.busy} 忙碌, ${status.queueLength} 等待`);
```

---

#### `cleanupProcessThreads(pid)`

清理指定进程的所有线程。

**参数**:
- `pid` (number): 进程ID

**示例**:
```javascript
// 进程退出时清理线程
MultithreadingDrive.cleanupProcessThreads(this.pid);
```

**说明**:
- 会终止该进程的所有线程
- 正在执行的任务会被取消并拒绝 Promise

---

#### `terminateAll()`

终止所有线程。

**示例**:
```javascript
// 系统关闭时清理所有线程
MultithreadingDrive.terminateAll();
```

**说明**:
- 终止所有线程
- 清空任务队列
- 停止空闲线程回收定时器

## 使用示例

### 基础使用

```javascript
// 在应用程序中使用多线程
class MyApp {
    constructor(pid) {
        this.pid = pid;
    }
    
    async processLargeData(data) {
        // 将计算密集型任务放到后台线程
        const result = await MultithreadingDrive.executeTask(
            this.pid,
            function(data) {
                // 在 Worker 中处理数据
                return data.map(item => item * 2).filter(x => x > 100);
            },
            [data]
        );
        return result;
    }
}
```

### 复杂计算示例

```javascript
// 计算斐波那契数列
async function calculateFibonacci(n) {
    const result = await MultithreadingDrive.executeTask(
        this.pid,
        function(n) {
            function fib(n) {
                if (n <= 1) return n;
                return fib(n - 1) + fib(n - 2);
            }
            return fib(n);
        },
        [n]
    );
    return result;
}
```

### 批量处理示例

```javascript
// 批量处理数据
async function processBatch(items) {
    const promises = items.map(item => 
        MultithreadingDrive.executeTask(
            this.pid,
            function(item) {
                // 处理单个项目
                return processItem(item);
            },
            [item]
        )
    );
    
    const results = await Promise.all(promises);
    return results;
}
```

### 监控线程池状态

```javascript
// 定期检查线程池状态
setInterval(() => {
    const status = MultithreadingDrive.getPoolStatus();
    if (status.queueLength > 10) {
        console.warn('任务队列过长，可能需要增加线程池大小');
    }
    if (status.busy === status.total && status.total < MultithreadingDrive.MAX_POOL_SIZE) {
        console.info('所有线程忙碌，考虑创建更多线程');
    }
}, 5000);
```

## 通过 ProcessManager 使用

应用程序可以通过 `ProcessManager` 的内核 API 使用多线程功能：

```javascript
// 创建线程
const threadId = await ProcessManager.requestKernelAPI(
    this.pid,
    'Multithreading.createThread',
    [this.pid]
);

// 执行任务
const result = await ProcessManager.requestKernelAPI(
    this.pid,
    'Multithreading.executeTask',
    [
        this.pid,
        "(function(a, b) { return a + b; })",
        [1, 2]
    ]
);

// 获取线程池状态
const status = await ProcessManager.requestKernelAPI(
    this.pid,
    'Multithreading.getPoolStatus',
    []
);
```

## 线程生命周期

1. **创建**：调用 `createThread()` 创建新线程
2. **空闲**：线程创建后处于 `idle` 状态，等待任务
3. **忙碌**：接收到任务后进入 `busy` 状态
4. **完成**：任务完成后返回 `idle` 状态
5. **回收**：空闲超过 `THREAD_IDLE_TIMEOUT` 后自动终止
6. **终止**：调用 `terminateThread()` 或进程退出时终止

## 任务执行流程

1. **提交任务**：调用 `executeTask()` 提交任务
2. **加入队列**：任务加入等待队列
3. **分配线程**：系统查找空闲线程或创建新线程
4. **执行任务**：线程执行任务
5. **返回结果**：任务完成后返回结果
6. **处理队列**：自动处理队列中的下一个任务

## 最佳实践

### 1. 合理使用多线程

```javascript
// ✅ 适合多线程：计算密集型任务
await MultithreadingDrive.executeTask(pid, function(data) {
    // 大量计算
    return heavyComputation(data);
}, [data]);

// ❌ 不适合多线程：简单操作
// 简单操作的开销可能大于多线程带来的收益
const result = data.map(x => x * 2); // 直接在主线程执行
```

### 2. 避免频繁创建线程

```javascript
// ✅ 重用线程池
// 系统会自动管理线程，无需手动创建

// ❌ 不要为每个任务创建新线程
// 让系统自动分配线程
```

### 3. 处理错误

```javascript
try {
    const result = await MultithreadingDrive.executeTask(pid, script, args);
    // 处理结果
} catch (error) {
    console.error('任务执行失败:', error);
    // 错误处理
}
```

### 4. 监控性能

```javascript
const startTime = Date.now();
const result = await MultithreadingDrive.executeTask(pid, script, args);
const duration = Date.now() - startTime;
console.log(`任务执行耗时: ${duration}ms`);
```

### 5. 清理资源

```javascript
// 进程退出时清理线程
__cleanup__: function() {
    MultithreadingDrive.cleanupProcessThreads(this.pid);
}
```

## 限制和注意事项

### 1. 序列化限制

- 参数和返回值必须可序列化
- 不能传递函数、循环引用、DOM 元素等
- 某些复杂对象可能无法完全序列化

### 2. Worker 环境限制

- 无法访问 `document`、`window` 等浏览器 API
- 无法直接操作 DOM
- 无法使用某些浏览器特性（如 localStorage）

### 3. 性能考虑

- 线程创建有开销，适合长时间运行的任务
- 简单任务可能不适合多线程
- 需要考虑数据序列化的开销

### 4. 错误处理

- Worker 中的错误会被捕获并传递回主线程
- 任务超时需要自行实现
- 线程崩溃会导致任务失败

## 实际应用案例

### HandTracker 应用

HandTracker 应用使用 Web Worker 进行粒子物理计算：

```javascript
// 初始化 Worker
_initWorker: function() {
    const workerCode = `
        // Worker 中的物理计算代码
        self.onmessage = function(e) {
            const { type, data } = e.data;
            if (type === 'update') {
                // 计算粒子物理
                const result = updatePhysics(data);
                self.postMessage({ type: 'updateDone', result: result });
            }
        };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    this._particleWorker = new Worker(workerUrl);
    
    this._particleWorker.onmessage = (e) => {
        // 处理计算结果
        this._handleWorkerResult(e.data);
    };
}
```

这种方式适合需要持续计算的应用场景。

## 故障排查

### 线程创建失败

```javascript
try {
    const threadId = MultithreadingDrive.createThread(pid);
} catch (error) {
    console.error('线程创建失败:', error);
    // 检查是否达到最大线程数
    const status = MultithreadingDrive.getPoolStatus();
    if (status.total >= MultithreadingDrive.MAX_POOL_SIZE) {
        console.warn('线程池已满');
    }
}
```

### 任务执行失败

```javascript
try {
    const result = await MultithreadingDrive.executeTask(pid, script, args);
} catch (error) {
    console.error('任务执行失败:', error);
    // 检查脚本格式
    // 检查参数是否可序列化
    // 检查 Worker 环境限制
}
```

### 性能问题

```javascript
// 检查线程池状态
const status = MultithreadingDrive.getPoolStatus();
if (status.queueLength > 0) {
    console.warn('任务队列积压，考虑增加线程数');
}

// 检查线程利用率
const utilization = status.busy / status.total;
if (utilization > 0.8) {
    console.info('线程利用率高，考虑增加线程数');
}
```

## 相关文档

- [ProcessManager API](ProcessManager.md) - 进程管理
- [KernelLogger API](KernelLogger.md) - 日志系统

## 更新日志

### v1.0.0
- 初始版本
- 支持线程池管理
- 支持任务队列
- 支持自动回收空闲线程

