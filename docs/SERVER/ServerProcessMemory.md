# 进程堆内存服务（server-processmemory）

## 概述

`server-processmemory` 是 ZerOS 内置的**进程堆内存读写服务**，由 ServerExpansion 从 `D/server` 加载。服务启动后在 **POOL > SERVER** 中暴露 `ProcessMemory` 对象，供内存编辑器等工具读取/写入任意进程的堆内存。

- **服务 ID**：`processmemory`（对应文件 `server-processmemory.js`）
- **位置**：`D/server/server-processmemory.js`（项目内 `system/service/DISK/D/server/server-processmemory.js`）
- **依赖**：ServerExpansion 已随 BootLoader 加载；服务运行在主窗口，可访问内核全局对象（MemoryManager、Heap、AddressType 等）。

## 暴露的 API（POOL > SERVER）

服务**启动后**，其他模块可通过 `POOL.__GET__('SERVER', 'ProcessMemory')` 获取 API：

| 方法 | 说明 |
|------|------|
| `getProcessMemoryInfo(targetPid)` | 获取指定进程的内存信息（堆列表等）。返回 checkMemory 单进程结果（programs[0]）或 null。 |
| `readProcessHeap(targetPid, heapId, start, length)` | 读取指定进程指定堆的区间。heapId 可为数字或十六进制字符串（如 "0x1"）；start 为十进制偏移；length 默认 256。返回 `[{ addr, data }, ...]`。 |
| `writeProcessHeap(targetPid, heapId, offset, data)` | 向指定进程指定堆的偏移处写入一个单元。data 可为数字或单字符等。返回 boolean。 |

### 调用示例

```javascript
var PM = POOL.__GET__('SERVER', 'ProcessMemory');
if (!PM) return; // 服务未启动

var info = PM.getProcessMemoryInfo(10001);
var rows = PM.readProcessHeap(10001, '0x1', 0, 256);
var ok = PM.writeProcessHeap(10001, '0x1', 10, 0x41);
```

## 与进程管理器、内存编辑器的关系

- **进程管理器（ProcessManager）不包含也不委托**这些危险 API；getProcessMemoryInfo / readProcessHeap / writeProcessHeap **仅由本服务在 POOL > SERVER 动态提供**。
- **服务列表自动加载**：ServerExpansion 在加载时会自动执行 `init()` 扫描 D/server 并加载所有 `server-*.js`（含本服务），不依赖「是否打开系统服务管理程序」。程序调用 `Server.start('processmemory')` 时，内核会先等待服务列表加载完成再执行，因此不会出现「未知服务 processmemory」。
- **内存编辑器（MemoryEditer）** 必须使用本服务：通过 `POOL.__GET__('SERVER', 'ProcessMemory')` 获取 API；若服务未启动，会提示「请先在服务管理器中启动 ProcessMemory 服务」，并可在用户确认后通过 `kernelAPI.call('Server.start', ['processmemory'])` 由程序拉起服务；退出时若本实例曾拉起服务，会通过 `kernelAPI.call('Server.stop', ['processmemory'])` 关闭。程序需声明 **SERVER_SERVICE_MANAGE** 权限。

## 生命周期与状态

- **__init__**：仅首次通过进程管理器 `Server.start('processmemory')` 启动时调用一次，打日志。
- **__start__**：向 POOL 注册 `SERVER > ProcessMemory`，打日志。
- **__stop__**：从 POOL 移除 `SERVER > ProcessMemory`，打日志。
- **__status__**：返回 `serviceId`、`serviceName`、`version`、`running`、`poolExposed`、`poolCategory`、`poolKey`、`poolPath`、`usage`。
- **__info__**：返回 `{ name: 'ProcessMemory', version: '1.0', description: '...' }`。

## 相关文档

- [ServerExpansion API](../API/ServerExpansion.md) - 服务扩展加载与启停
- [服务模块编写 (ServiceModule.md)](./ServiceModule.md) - D/server 服务约定
