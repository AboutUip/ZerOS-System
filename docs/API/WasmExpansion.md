# WasmExpansion API 文档

## 概述

`WasmExpansion` 是 ZerOS 内核的 **WebAssembly 模块管理器**扩展，负责加载、管理和执行 WebAssembly 模块。该扩展仅允许 `D/server` 目录下的服务调用（通过调用栈检查验证调用者来源）。

## 依赖

- `Disk` / `NodeTreeCollection` - 文件系统（用于读取 D/wasm 下的 WASM 文件）

## 获取实例

WasmExpansion 注册在全局，可以通过以下方式获取：

```javascript
// 全局对象
const WasmExpansion = window.WasmExpansion;
```

**注意**：
- WasmExpansion 主要通过直接调用 `WasmExpansion.xxx()` 使用
- 权限检查在每个 API 方法内部自动进行

## WASM 文件存放位置

- **路径**：`D/wasm`（或 `D:/wasm`，取决于分区名）
- **格式**：`.wasm` 二进制文件

## 初始化

Wasm 扩展在 BootLoader 中按依赖顺序加载（依赖 `kernel/filesystem/init.js`），无需在程序中手动初始化。

## 权限验证

每个 API 方法都会调用 `_checkCaller()` 进行权限检查：

1. 允许 **terminal** / **Terminal** / **debug** 调用
2. 允许 **system/service/DISK/D/server/** 路径下的调用
3. 其他调用来源抛出 `Error: 权限不足：仅允许 server 目录下的服务调用`

## API 参考

### WasmExpansion.listModules()

列出当前已加载的 WASM 模块名称。

**返回值**：`string[]` - 已加载模块名称数组

**示例**：
```javascript
const modules = WasmExpansion.listModules();
console.log(modules); // ['math', 'fib']
```

---

### WasmExpansion.getModuleInfo(moduleName)

获取指定模块的元信息。

**参数**：
- `moduleName` (string): 模块名称

**返回值**：`Object | null` - 模块信息对象，包含 `name`、`module`、`loadedAt`，若未加载则返回 `null`

**示例**：
```javascript
const info = WasmExpansion.getModuleInfo('math');
if (info) {
    console.log('加载时间:', new Date(info.loadedAt));
}
```

---

### WasmExpansion.isLoaded(moduleName)

检查指定模块是否已加载。

**参数**：
- `moduleName` (string): 模块名称

**返回值**：`boolean` - 是否已加载

**示例**：
```javascript
if (WasmExpansion.isLoaded('math')) {
    console.log('math 模块已加载');
}
```

---

### WasmExpansion.loadModule(moduleName, wasmPath)

加载 WASM 模块。

**参数**：
- `moduleName` (string): 模块名称（用于标识）
- `wasmPath` (string, 可选): WASM 文件路径
  - 若为 `http://` 或 `https://` 开头，则从网络加载
  - 若为相对路径，则从 `D/wasm/` 目录加载
  - 若不传，则默认使用 `{moduleName}.wasm`

**返回值**：`Promise<Object>` - 加载结果

```javascript
{
    success: boolean,      // 是否成功
    message: string,      // 结果描述
    alreadyLoaded?: boolean, // 是否已加载过
    exports?: string[]    // 导出的函数列表
}
```

**示例**：
```javascript
// 从 D/wasm/math.wasm 加载
const result = await WasmExpansion.loadModule('math');
console.log(result); // { success: true, exports: ['add', 'sub'] }

// 从网络加载
const result = await WasmExpansion.loadModule('remote', 'https://example.com/lib.wasm');

// 指定文件路径
const result = await WasmExpansion.loadModule('math', 'math-optimized.wasm');
```

---

### WasmExpansion.unloadModule(moduleName)

卸载指定的 WASM 模块。

**参数**：
- `moduleName` (string): 模块名称

**返回值**：`Object` - 卸载结果

```javascript
{
    success: boolean,
    message: string
}
```

**示例**：
```javascript
const result = WasmExpansion.unloadModule('math');
console.log(result); // { success: true, message: '模块已卸载' }
```

---

### WasmExpansion.callFunction(moduleName, functionName, ...args)

调用 WASM 模块导出的函数。

**参数**：
- `moduleName` (string): 模块名称
- `functionName` (string): 函数名称
- `...args`: 传递给 WASM 函数的参数

**返回值**：任意 - WASM 函数返回的值

**示例**：
```javascript
// 加载模块
await WasmExpansion.loadModule('math');

// 调用函数
const sum = WasmExpansion.callFunction('math', 'add', 1, 2);
console.log(sum); // 3

const result = WasmExpansion.callFunction('math', 'fib', 10);
console.log(result); // 55
```

---

### WasmExpansion.getExports(moduleName)

获取指定模块导出的所有函数/对象列表。

**参数**：
- `moduleName` (string): 模块名称

**返回值**：`string[] | null` - 导出项名称数组，若模块未加载则返回 `null`

**示例**：
```javascript
const exports = WasmExpansion.getExports('math');
console.log(exports); // ['add', 'sub', 'mul', 'div', 'memory']
```

---

### WasmExpansion.listAvailable()

列出 D/wasm 目录下所有可用的 WASM 文件。

**返回值**：`string[]` - WASM 文件名数组

**示例**：
```javascript
const files = WasmExpansion.listAvailable();
console.log(files); // ['math.wasm', 'fib.wasm', 'image-processor.wasm']
```

---

### WasmExpansion.getMemory(moduleName)

获取指定模块导出的内存对象（若存在）。

**参数**：
- `moduleName` (string): 模块名称

**返回值**：`WebAssembly.Memory | null` - 内存对象，若不存在则返回 `null`

**示例**：
```javascript
const memory = WasmExpansion.getMemory('math');
if (memory) {
    console.log('内存页数:', memory.buffer.byteLength / 65536);
}
```

---

### WasmExpansion.readMemory(moduleName, offset, length)

从指定模块的内存中读取数据。

**参数**：
- `moduleName` (string): 模块名称
- `offset` (number): 内存偏移量（字节）
- `length` (number): 读取长度（字节）

**返回值**：`number[]` - 字节数组

**示例**：
```javascript
// 假设 WASM 导出了字符串，需要手动解析
const bytes = WasmExpansion.readMemory('mystring', 0, 100);
const str = String.fromCharCode(...bytes);
console.log(str);
```

---

### WasmExpansion.writeMemory(moduleName, offset, data)

向指定模块的内存中写入数据。

**参数**：
- `moduleName` (string): 模块名称
- `offset` (number): 内存偏移量（字节）
- `data` (number[] | Uint8Array): 要写入的字节数据

**返回值**：`boolean` - 是否写入成功

**示例**：
```javascript
const data = [72, 101, 108, 108, 111]; // "Hello"
WasmExpansion.writeMemory('buffer', 0, data);
```

---

## 完整使用示例

```javascript
// 1. 查看可用模块
const available = WasmExpansion.listAvailable();
console.log('可用:', available);

// 2. 加载模块
const loadResult = await WasmExpansion.loadModule('math');
if (!loadResult.success) {
    console.error('加载失败:', loadResult.message);
    return;
}

// 3. 查看导出
const exports = WasmExpansion.getExports('math');
console.log('导出函数:', exports);

// 4. 调用函数
const result = WasmExpansion.callFunction('math', 'add', 100, 200);
console.log('100 + 200 =', result);

// 5. 使用内存操作（如果需要）
const memory = WasmExpansion.getMemory('math');
if (memory) {
    // 写入数据到偏移量 0
    WasmExpansion.writeMemory('math', 0, [1, 2, 3, 4]);
    // 读取数据
    const data = WasmExpansion.readMemory('math', 0, 4);
    console.log('读取:', data);
}

// 6. 卸载模块
WasmExpansion.unloadModule('math');
```

## 错误处理

所有 API 方法在权限不足时会抛出异常：

```javascript
try {
    // 非 server 目录调用会失败
    WasmExpansion.loadModule('test');
} catch (e) {
    console.error(e.message); // "权限不足：仅允许 server 目录下的服务调用"
}
```

加载失败时 `loadModule` 返回失败对象而非抛出异常：

```javascript
const result = await WasmExpansion.loadModule('nonexistent');
if (!result.success) {
    console.error(result.message); // "WASM 文件不存在: nonexistent.wasm"
}
```
