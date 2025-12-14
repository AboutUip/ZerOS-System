# MemoryManager API 文档

## 概述

`MemoryManager` 是 ZerOS 内核的内存管理器，提供堆内存（Heap）和栈内存（Shed）的统一管理，支持多进程内存隔离。所有内存数据存储在 Exploit 程序（PID 10000）的内存中。

## 依赖

- `Heap` - 堆内存实现
- `Shed` - 栈内存实现
- `KernelMemory` - 内核内存（用于存储内存管理数据）

## 内存类型

### 堆内存 (Heap)

动态内存分配和释放，用于存储可变数据。

**特性**:
- 动态分配和释放
- 支持多进程独立堆空间
- 地址管理和边界检查
- 字符串和 JSON 数据存储

### 栈内存 (Shed)

代码区和资源链接区，用于存储常量和静态数据。

**特性**:
- 代码区存储
- 资源链接和地址映射
- 字符串管理
- 常量存储

## API 方法

### 内存分配

#### `allocateMemory(pid, heapSize, shedSize, heapId, shedId)`

为程序分配内存。

**参数**:
- `pid` (number): 进程 ID
- `heapSize` (number): 堆内存大小（字节，-1 表示不需要堆）
- `shedSize` (number): 栈内存大小（字节，-1 表示不需要栈，实际不使用）
- `heapId` (number|null): 堆 ID（可选，如果不提供则自动生成）
- `shedId` (number|null): 栈 ID（可选，如果不提供则自动生成）

**返回值**: `Object` - 内存分配结果
```javascript
{
    heapId: number,
    shedId: number,
    heap: Heap|null,
    shed: Shed|null
}
```

**示例**:
```javascript
// 分配堆和栈内存
const memory = MemoryManager.allocateMemory(this.pid, 1024, 512);

// 使用堆内存
if (memory.heap) {
    const addr = memory.heap.allocate(100, 'myKey');
    memory.heap.writeData(addr, 'Hello World');
}

// 使用栈内存
if (memory.shed) {
    memory.shed.writeCode(0, 'function code');
}
```

### 内存释放

#### `freeMemory(pid)`

释放程序的所有内存。

**参数**:
- `pid` (number): 进程 ID

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
MemoryManager.freeMemory(this.pid);
```

### 内存检查

#### `checkMemory(pid)`

检查内存使用情况。

**参数**:
- `pid` (number): 进程 ID，-1 表示检查所有程序

**返回值**: `Object|null` - 内存信息对象
```javascript
{
    totalPrograms: number,
    programs: [
        {
            pid: number,
            programName: string,
            heaps: [
                {
                    heapId: number,
                    heapSize: number,
                    heapUsed: number,
                    heapFree: number
                }
            ],
            sheds: [
                {
                    shedId: number,
                    shedSize: number
                }
            ],
            totalHeapSize: number,
            totalHeapUsed: number,
            totalHeapFree: number,
            totalShedSize: number
        }
    ]
}
```

**示例**:
```javascript
// 检查所有程序的内存
const allMemory = MemoryManager.checkMemory(-1);

// 检查特定程序的内存
const programMemory = MemoryManager.checkMemory(this.pid);
```

### 程序名称管理

#### `registerProgramName(pid, programName)`

注册程序名称。

**参数**:
- `pid` (number): 进程 ID
- `programName` (string): 程序名称

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
MemoryManager.registerProgramName(this.pid, 'MyApp');
```

#### `getProgramName(pid)`

获取程序名称。

**参数**:
- `pid` (number): 进程 ID

**返回值**: `string` - 程序名称（如果未注册则返回 `Program-{pid}`）

**示例**:
```javascript
const name = MemoryManager.getProgramName(this.pid);
console.log(name);  // "MyApp" 或 "Program-1234"
```

### 日志配置

#### `setLogLevel(level)`

设置日志级别。

**参数**:
- `level` (number): 日志级别（0-3）

## 使用示例

### 示例 1: 基本内存分配

```javascript
// 在程序初始化时分配内存
__init__: async function(pid, initArgs) {
    this.pid = pid;
    
    // 分配内存（1KB 堆，512B 栈）
    const memory = MemoryManager.allocateMemory(this.pid, 1024, 512);
    this.heap = memory.heap;
    this.shed = memory.shed;
    
    // 使用堆内存
    const addr = this.heap.allocate(100, 'myData');
    this.heap.writeData(addr, 'Hello World');
}
```

### 示例 2: 内存使用和检查

```javascript
// 写入数据
const addr = this.heap.allocate(50, 'userData');
this.heap.writeData(addr, JSON.stringify({ name: 'John', age: 30 }));

// 读取数据
const data = this.heap.readString(addr, 50);
const user = JSON.parse(data);

// 检查内存使用
const memoryInfo = MemoryManager.checkMemory(this.pid);
console.log(`堆使用: ${memoryInfo.programs[0].totalHeapUsed} / ${memoryInfo.programs[0].totalHeapSize}`);
```

### 示例 3: 程序退出时释放内存

```javascript
__exit__: async function() {
    // 释放内存
    MemoryManager.freeMemory(this.pid);
}
```

## 内存管理数据存储

所有内存管理数据存储在 Exploit 程序（PID 10000）的内存中：

- `APPLICATION_SOP` - 应用程序分区管理表
- `PROGRAM_NAMES` - 程序名称映射
- `NEXT_HEAP_ID` - 下一个堆 ID
- `NEXT_SHED_ID` - 下一个栈 ID

## 注意事项

1. **内存分配**: 每个进程可以分配多个堆和栈，通过 `heapId` 和 `shedId` 区分
2. **内存释放**: 程序退出时会自动释放所有内存，但建议在 `__exit__` 中手动释放
3. **程序名称**: 程序名称注册后会在 `ps` 命令中显示
4. **内存检查**: `checkMemory(-1)` 会检查所有程序的内存使用情况
5. **Exploit 程序**: Exploit 程序（PID 10000）的内存由 KernelMemory 管理

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API
- [KernelMemory.md](./KernelMemory.md) - 内核内存 API
- [Heap.md](./Heap.md) - 堆内存 API
- [Shed.md](./Shed.md) - 栈内存 API

