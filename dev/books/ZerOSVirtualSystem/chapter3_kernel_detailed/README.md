# 第3章：Kernel 内核层实现

## 章节简介

本章深入讲解 Kernel 内核层的实现，对应第 1 章中“阶段三：模块加载”的内核层部分。内核层管理进程生命周期、内存分配与回收、文件系统与磁盘抽象、以及安全与权限的底层数据。本章**深入到核心代码与数据结构**：进程表与 KernelMemory 的持久化、内存管理中的 APPLICATION_SOP 与 Heap/Shed、Disk 与 NodeTree 的配合、以及各模块与 POOL/KernelMemory 的协作方式。

本章配合 `kernel/` 目录下的真实代码讲解，关键处给出文件路径与行号范围。

## 章节结构

### [3.1 内核架构与 KernelMemory](section1_architecture/README.md)

内核层在引导后的位置、KernelMemory 的职责与 loadData/saveData、与 POOL 的分工。

### [3.2 进程管理详解](section2_process/README.md)

ProcessManager 的进程表（_getProcessTable / _saveProcessTable）、ProcessInfo 结构、PID 分配与 KernelMemory 持久化、受保护进程表代理。

### [3.3 内存管理详解](section3_memory/README.md)

MemoryManager 的 APPLICATION_SOP、_getApplicationSOP / _saveApplicationSOP、Heap 与 Shed 的职责、与 KernelMemory 的配合。

### [3.4 文件系统详解](section4_filesystem/README.md)

Disk 的分区映射与 KernelMemory、NodeTree 与 POOL 的配合、FileFramework 的角色。

### [3.5 KernelMemory 实现](section5_kernel_memory/README.md)

_ensureMemory 与 Exploit 内存分配、loadData/saveData 的地址映射与两轮分配及碎片清理算法。

### [3.6 内核内部 API 使用情景](section6_api_usage/README.md)

通过 POOL 在内核内部查找并调用模块、使用 KernelMemory 在模块间共享状态、以及通过 dependencyLoaded 等事件向其它模块广播“就绪信号”。

## 本章小节速览（链接跳转）

**3.1 内核架构**  
[3.1.1 内核层位置与依赖关系](section1_architecture/3.1.1_内核层位置与依赖关系.md) · [3.1.2 KernelMemory 职责与接口](section1_architecture/3.1.2_KernelMemory职责与接口.md)

**3.2 进程管理**  
[3.2.1 进程表与 KernelMemory](section2_process/3.2.1_进程表与KernelMemory.md) · [3.2.2 PID 与进程生命周期](section2_process/3.2.2_PID与进程生命周期.md) · [3.2.3 进程启动的完整调用链](section2_process/3.2.3_进程启动的完整调用链.md) · [3.2.4 进程退出与资源回收](section2_process/3.2.4_进程退出与资源回收.md)

**3.3 内存管理**  
[3.3.1 APPLICATION_SOP 与 Heap/Shed](section3_memory/3.3.1_APPLICATION_SOP与HeapShed.md) · [3.3.2 内存分配与回收接口](section3_memory/3.3.2_内存分配与回收接口.md)

**3.4 文件系统**  
[3.4.1 Disk 与分区映射](section4_filesystem/3.4.1_Disk与分区映射.md) · [3.4.2 NodeTree 与 FileFramework 的角色](section4_filesystem/3.4.2_NodeTree与FileFramework的角色.md)

**3.5 KernelMemory 实现**  
[3.5.1 _ensureMemory 与 Exploit 内存分配](section5_kernel_memory/3.5.1_ensureMemory与Exploit内存分配.md) · [3.5.2 loadData 与 saveData 的地址映射与分配算法](section5_kernel_memory/3.5.2_loadData与saveData的地址映射与分配算法.md)

**3.6 内核内部 API 使用情景**  
[3.6.1 情景：通过 POOL 查找并调用模块](section6_api_usage/3.6.1_情景_通过POOL查找并调用模块.md) · [3.6.2 情景：使用 KernelMemory 在模块间共享状态](section6_api_usage/3.6.2_情景_使用KernelMemory在模块间共享状态.md) · [3.6.3 情景：内核模块发出 dependencyLoaded 事件](section6_api_usage/3.6.3_情景_内核模块发出dependencyLoaded事件.md)

## 学习目标

1. 理解 KernelMemory 在内核层中的中心地位及与进程表、内存分区、磁盘元数据的存储关系
2. 理解 ProcessManager 的进程表结构与序列化、PID 与进程生命周期在代码中的实现
3. 理解 MemoryManager 的 per-pid 分区、Heap/Shed 与持久化策略
4. 理解 Disk/NodeTree 与 POOL、KernelMemory 的协作及分区元数据的存储方式

---

**[返回书籍目录](../README.md)** | **[上一章：Boot 引导层](../chapter2_boot_detailed/README.md)** | **[下一章：System 系统层](../chapter4_system_detailed/README.md)**
