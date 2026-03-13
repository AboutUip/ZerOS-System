# 第5章：系统内核模块关联与交互

## 章节简介

本章在 Boot、Kernel、System 各层实现之后，**统览模块间如何通信与协作**：POOL 作为“发现与注册表”、KernelMemory 作为“共享持久化状态”、事件（dependencyLoaded 等）作为“就绪信号”、以及 **ProcessManager.callKernelAPI** 作为**应用层访问内核的统一入口**；并说明 _executeKernelAPI 与 kernelAPIs 路由表、权限与调用者校验、以及典型协作模式（ProcessManager↔MemoryManager、GUIManager↔EventManager、PermissionManager↔LStorage 等）。学完后能画出“应用→内核”与“内核模块之间”的通信路径，并能新增或扩展内核 API。源码涉及：`kernel/process/processManager.js`、`kernel/core/signal/pool.js`、各层模块。

## 本章小节速览

### [5.1 模块间通信机制](section1_communication/README.md)
- [5.1.1 POOL 与模块发现](section1_communication/5.1.1_POOL与模块发现.md)
- [5.1.2 KernelMemory 与共享状态](section1_communication/5.1.2_KernelMemory与共享状态.md)
- [5.1.3 事件与就绪信号](section1_communication/5.1.3_事件与就绪信号.md)
- [5.1.4 通信机制小结与选型](section1_communication/5.1.4_通信机制小结与选型.md)

### [5.2 应用与内核的边界](section2_app_kernel_boundary/README.md)
- [5.2.1 callKernelAPI 与 _executeKernelAPI](section2_app_kernel_boundary/5.2.1_callKernelAPI与_executeKernelAPI.md)
- [5.2.2 kernelAPIs 路由与权限](section2_app_kernel_boundary/5.2.2_kernelAPIs路由与权限.md)
- [5.2.3 recordKernelModuleCall 与调用溯源](section2_app_kernel_boundary/5.2.3_recordKernelModuleCall与调用溯源.md)

### [5.3 典型协作模式](section3_collaboration/README.md)
- [5.3.1 ProcessManager 与 MemoryManager](section3_collaboration/5.3.1_ProcessManager与MemoryManager.md)
- [5.3.2 系统层与内核层的协作](section3_collaboration/5.3.2_系统层与内核层的协作.md)

### [5.4 完整调用链示例](section4_callchains/README.md)
- [5.4.1 应用读取文件的完整调用链](section4_callchains/5.4.1_应用读取文件的完整调用链.md)
- [5.4.2 进程退出与资源回收的完整调用链](section4_callchains/5.4.2_进程退出与资源回收的完整调用链.md)

### [5.5 常见错误与排查汇总](section5_troubleshooting/README.md)
- [5.5.1 应用与内核边界相关](section5_troubleshooting/5.5.1_应用与内核边界相关.md)
- [5.5.2 模块通信与协作相关](section5_troubleshooting/5.5.2_模块通信与协作相关.md)

## 学习目标

- 能说明 POOL、KernelMemory、事件在模块间通信中的角色，以及应用如何通过 callKernelAPI 访问内核
- 能解释 _executeKernelAPI 与 kernelAPIs 路由表、权限校验与 EXPLOIT_PID 放行
- 能描述 ProcessManager↔MemoryManager、GUIManager↔EventManager、PermissionManager↔LStorage 等典型协作模式

---

**[返回章节目录](../README.md)** | **[上一章：第4章 系统层](../chapter4_system_detailed/README.md)** | **[下一章：第6章 后端实现](../chapter6_backend/README.md)**
