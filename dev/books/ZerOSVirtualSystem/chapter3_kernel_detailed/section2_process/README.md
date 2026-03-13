# 3.2 进程管理详解

## 大节简介

本节深入到 **ProcessManager**（`kernel/process/processManager.js`）的核心实现：进程表（Map<pid, ProcessInfo>）的存储与加载、与 KernelMemory 的配合、ProcessInfo 的字段含义、以及 _saveProcessTable / _getProcessTable 中的序列化与反序列化逻辑；并说明受保护进程表代理（_createProtectedProcessTable）的设计目的与实现要点。

## 小节内容

### [3.2.1 进程表与 KernelMemory](3.2.1_进程表与KernelMemory.md)

_getProcessTable、_saveProcessTable 的源码逻辑；ProcessInfo 结构（pid、status、memoryRefs、domElements、requestedModules 等）；Map/Set 的序列化与反序列化；降级与 fallback 表。

### [3.2.2 PID 与进程生命周期](3.2.2_PID与进程生命周期.md)

PID 分配、进程创建与状态（loading/running/exited）、进程表代理与防篡改、与 MemoryManager 的协作（per-pid 内存分区）。

### [3.2.3 进程启动的完整调用链](3.2.3_进程启动的完整调用链.md)

从 startProgram 到 PID 分配、进程表写入、allocateMemory、registerWindow、updateProcessInfo 的完整调用链与断点排查。

### [3.2.4 进程退出与资源回收](3.2.4_进程退出与资源回收.md)

退出触发点、ProcessManager/GUIManager/EventManager/MemoryManager 的回收顺序与职责、排查“退出后窗口仍在”或“事件仍触发”。

## 学习目标

- 能对照源码说明进程表如何从 KernelMemory 加载与保存
- 能解释 ProcessInfo 中关键字段的含义及序列化时的处理方式

---

**[返回章节目录](../README.md)** | **[上一节：3.1 内核架构与 KernelMemory](../section1_architecture/README.md)** | **[下一节：3.3 内存管理详解](../section3_memory/README.md)**
