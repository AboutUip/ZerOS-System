# 3.1 内核架构与 KernelMemory

## 大节简介

本节说明内核层在 ZerOS 中的位置（Boot 之后、System 之前）、以及 **KernelMemory** 作为内核层“持久化与跨模块数据”中心的职责。KernelMemory 提供 loadData/saveData，进程表、内存分区元数据、磁盘分区列表等均通过其存储，与 POOL（运行时单例与共享引用）形成分工：POOL 存“谁是谁的引用”，KernelMemory 存“可序列化的状态与元数据”。

## 小节内容

### [3.1.1 内核层的位置与依赖关系](3.1.1_内核层位置与依赖关系.md)

引导完成后内核层各模块的加载顺序、与 MODULE_DEPENDENCIES 的对应、以及 ProcessManager、MemoryManager、Disk 对 KernelMemory 与 POOL 的依赖。

### [3.1.2 KernelMemory 的职责与接口](3.1.2_KernelMemory职责与接口.md)

KernelMemory.loadData(key)、saveData(key, value) 的语义、与 Exploit 内存或后端存储的关系、以及典型 key（如 PROCESS_TABLE、APPLICATION_SOP、DISK_SEPARATE_MAP）的用途。

## 学习目标

- 能说出内核层主要模块及其在依赖图中的前后关系
- 能说明 KernelMemory 与 POOL 在内核层中的分工及典型 key

---

**[返回章节目录](../README.md)** | **[下一节：3.2 进程管理详解](../section2_process/README.md)**
