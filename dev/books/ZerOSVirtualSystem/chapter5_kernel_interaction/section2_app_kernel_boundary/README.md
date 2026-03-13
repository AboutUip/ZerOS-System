# 5.2 应用与内核的边界

## 大节简介

本节讲解**应用层如何访问内核**：统一通过 **ProcessManager.callKernelAPI(pid, apiName, args)**；内部经 _callKernelAPICore 做进程存在性、Exploit PID 严格校验、调用栈与 PID 一致性、权限检查后，由 **_executeKernelAPI** 根据 **kernelAPIs** 路由表派发到具体实现；**recordKernelModuleCall** 用于“直接调用内核模块”时的调用溯源与任务管理器展示。学完后能新增/扩展内核 API 并理解权限与调用者校验。

## 小节列表

- [5.2.1 callKernelAPI 与 _executeKernelAPI](5.2.1_callKernelAPI与_executeKernelAPI.md)
- [5.2.2 kernelAPIs 路由与权限](5.2.2_kernelAPIs路由与权限.md)
- [5.2.3 recordKernelModuleCall 与调用溯源](5.2.3_recordKernelModuleCall与调用溯源.md)

---

**[返回章节目录](../README.md)** | **[上一节：5.1 模块间通信机制](../section1_communication/README.md)** | **[下一节：5.3 典型协作模式](../section3_collaboration/README.md)**
