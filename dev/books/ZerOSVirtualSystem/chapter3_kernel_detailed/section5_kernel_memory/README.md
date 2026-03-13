# 3.5 KernelMemory 实现

## 大节简介

本节**深入到 KernelMemory 的算法与实现**：Exploit 内存（PID 10000）的分配、_ensureMemory 的防递归与 _memoryCache、loadData/saveData 如何通过 Heap 与 Shed 的地址映射实现键值持久化、以及 _allocatedRanges 与线性分配/碎片回收策略。学完后能完完全全参透“内核数据存在哪里、如何存、如何取”。源码：`kernel/memory/kernelMemory.js`。

## 小节内容

### [3.5.1 _ensureMemory 与 Exploit 内存分配](3.5.1_ensureMemory与Exploit内存分配.md)

_ensureMemory 的防递归、_memoryCache、与 MemoryManager.APPLICATION_SOP 的配合、为 EXPLOIT_PID 分配 Heap/Shed 的时机与参数。

### [3.5.2 loadData 与 saveData 的地址映射与分配算法](3.5.2_loadData与saveData的地址映射与分配算法.md)

key_ADDR/key_SIZE 在 Shed 的 resourceLinkArea 中的存储、Heap 上按字符存储 JSON、_allocatedRanges 与两轮线性分配及碎片清理。

## 学习目标

- 能说明 KernelMemory 的数据实际存在哪个进程的 Heap/Shed 中、如何通过 key 定位
- 能解释 saveData 的分配流程与 loadData 的读取流程、以及为何需要 APPLICATION_SOP 防循环

---

**[返回章节目录](../README.md)** | **[上一节：3.4 文件系统详解](../section4_filesystem/README.md)** | **[下一章：System 系统层](../chapter4_system_detailed/README.md)**
