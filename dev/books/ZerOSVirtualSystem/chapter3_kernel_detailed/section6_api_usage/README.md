# 3.6 内核内部 API 使用情景

## 大节简介

本节从“**内核开发者**”视角出发，展示 Kernel 层各模块在**内部如何调用彼此的 API**。不再站在应用 `callKernelAPI` 的角度，而是聚焦：在 `kernel/` 目录内部，模块如何通过 `POOL` 找到对方、如何使用 `KernelMemory` 读写共享状态、以及如何借助事件机制向系统层或其它内核模块广播状态变化。

## 小节列表

- [3.6.1 情景：通过 POOL 查找并调用模块](3.6.1_情景_通过POOL查找并调用模块.md)
- [3.6.2 情景：使用 KernelMemory 在模块间共享状态](3.6.2_情景_使用KernelMemory在模块间共享状态.md)
- [3.6.3 情景：内核模块发出 dependencyLoaded 事件](3.6.3_情景_内核模块发出dependencyLoaded事件.md)

---

**[返回本章目录](../README.md)** | **[上一节：3.5 KernelMemory 实现](../section5_kernel_memory/README.md)**

