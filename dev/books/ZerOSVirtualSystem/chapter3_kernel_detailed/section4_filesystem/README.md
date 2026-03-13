# 3.4 文件系统详解

## 大节简介

本节深入到 **Disk**（`kernel/fileSystem/disk.js`）与 **NodeTree**、**FileFramework** 的协作：Disk 如何通过 KernelMemory 存储分区名列表（DISK_SEPARATE_MAP）、如何从 POOL 按分区名获取 NodeTreeCollection、以及 NodeTree 与 FileFramework 在目录树与文件读写中的角色；并说明分区元数据与分区对象“分离存储”（KernelMemory 存名、POOL 存对象）的原因。

## 小节内容

### [3.4.1 Disk 与分区映射](3.4.1_Disk与分区映射.md)

_getDiskSeparateMap、_saveDiskSeparateMap 的源码逻辑；分区名列表在 KernelMemory 中的存储；从 POOL 按名获取 NodeTreeCollection；降级与 fallback。

### [3.4.2 NodeTree 与 FileFramework 的角色](3.4.2_NodeTree与FileFramework的角色.md)

NodeTree 的目录树与节点结构、与 POOL 的配合；FileFramework 在文件读写与路径解析中的职责；与 Disk 的分工（Disk = 分区与元数据，NodeTree = 树结构，FileFramework = 文件 API）。

## 学习目标

- 能说明 Disk 为何只在 KernelMemory 存分区名、而将 NodeTreeCollection 放在 POOL
- 能区分 Disk、NodeTree、FileFramework 三者在内核文件系统中的职责

---

**[返回章节目录](../README.md)** | **[上一节：3.3 内存管理详解](../section3_memory/README.md)** | **[下一节：3.5 KernelMemory 实现](../section5_kernel_memory/README.md)**
