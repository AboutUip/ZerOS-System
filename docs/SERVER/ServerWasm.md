# WASM 总控服务（server-wasm）

## 概述

`server-wasm` 是 ZerOS 内置的 **WebAssembly 模块总控服务**，由 ServerExpansion 从 `D/server` 加载。服务启动后自动检测 `D/wasm` 目录下的所有 WASM 模块并加载，同时提供完整的模块管理 API。

- **服务 ID**：`wasm`（对应文件 `server-wasm.js`）
- **位置**：`D/server/server-wasm.js`（项目内 `system/service/DISK/D/server/server-wasm.js`）
- **依赖**：WasmExpansion 扩展（随 BootLoader 加载）、LStorage（持久化模块状态）

## 功能说明

| 行为 | 说明 |
|------|------|
| 自动检测 | 启动时扫描 `D/wasm` 目录下所有 `.wasm` 文件 |
| 自动加载 | 检测到的所有模块自动加载并跟踪状态 |
| 状态跟踪 | 记录每个模块的加载状态、导出函数、错误信息 |
| 持久化 | 模块状态保存到 LStorage，重启后保持 |
| 手动管理 | 支持手动加载、卸载、重新加载指定模块 |

## WASM 文件存放位置

- **路径**：`D/wasm`（或 `D:/wasm`）
- **格式**：`.wasm` 二进制文件
- **命名**：文件名（不含扩展名）作为模块名，如 `math.wasm` → 模块名 `math`

## 服务 API

通过 `kernelAPI.call('Wasm.xxx', ...)` 调用：

### 状态查询

```javascript
// 获取所有模块状态
kernelAPI.call('Wasm.status');

// 返回格式
{
    running: true,
    totalModules: 5,
    loadedCount: 5,
    modules: [
        {
            name: "math",
            fileName: "math.wasm",
            loaded: true,
            exports: ["add", "sub", "mul", "div"],
            status: "loaded",
            autoLoad: true,
            error: null,
            loadedAt: 1700000000000,
            lastUpdate: 1700000000000
        },
        ...
    ]
}
```

### 模块操作

```javascript
// 列出可用模块（不含 .wasm 后缀）
kernelAPI.call('Wasm.listAvailable');

// 列出已加载模块
kernelAPI.call('Wasm.listLoaded');

// 获取单个模块状态
kernelAPI.call('Wasm.getModuleStatus', 'math');

// 获取所有模块详细状态
kernelAPI.call('Wasm.getAllModulesStatus');

// 检查模块是否已加载
kernelAPI.call('Wasm.isModuleLoaded', 'math');
```

### 加载/卸载

```javascript
// 加载模块（自动从 D/wasm/{name}.wasm 加载）
kernelAPI.call('Wasm.load', 'math');

// 指定路径加载
kernelAPI.call('Wasm.load', 'custom', 'custom.wasm');
// 或从网络加载
kernelAPI.call('Wasm.load', 'remote', 'https://example.com/lib.wasm');

// 卸载模块
kernelAPI.call('Wasm.unload', 'math');

// 重新加载模块
kernelAPI.call('Wasm.reload', 'math');
```

### 函数调用

```javascript
// 调用 WASM 函数
kernelAPI.call('Wasm.call', 'math', 'add', 1, 2);
// 返回: 3

// 获取模块导出的函数列表
kernelAPI.call('Wasm.getExports', 'math');
// 返回: ["add", "sub", "mul", "div"]
```

### 自动加载配置

```javascript
// 设置模块是否开机自动加载
kernelAPI.call('Wasm.setAutoLoad', 'math', true);   // 开启
kernelAPI.call('Wasm.setAutoLoad', 'math', false);  // 关闭

// 获取自动加载列表
kernelAPI.call('Wasm.getAutoLoad');
// 返回: ["math", "fib", ...]
```

## 生命周期与状态

- **__init__**：从 LStorage 加载模块状态
- **__start__**：扫描 `D/wasm` 目录，加载所有检测到的模块
- **__stop__**：标记服务停止（模块保持加载状态）
- **__status__**：返回所有模块的详细状态
- **__info__**：返回服务信息

## 模块状态说明

| status | 说明 |
|--------|------|
| `available` | 模块文件存在，尚未加载 |
| `loading` | 正在加载中 |
| `loaded` | 加载成功 |
| `error` | 加载失败 |
| `unloaded` | 已卸载 |

## ZerOS API 使用

服务可使用的 API：

| 使用的 API | 用途 |
|------------|------|
| `WasmExpansion.*` | 底层 WASM 模块操作 |
| `LStorage` | 持久化模块状态 |
| `KernelLogger` | 日志输出 |

## 相关文档

- [WasmExpansion API](../API/WasmExpansion.md) - WASM 扩展底层 API
- [ServerExpansion API](../API/ServerExpansion.md) - 服务扩展加载与启停
- [服务模块编写 (ServiceModule.md)](./ServiceModule.md) - D/server 服务约定与示例
