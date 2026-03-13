# 3.3 内存管理详解

## 大节简介

本节深入到 **MemoryManager**（`kernel/memory/memoryManager.js`）的核心实现：**APPLICATION_SOP**（per-pid 应用程序分区管理表）的加载与保存、与 KernelMemory 的配合、Heap 与 Shed 的职责划分、以及 _getApplicationSOP / _saveApplicationSOP 中只保存元数据（nextHeapId、nextShedId）而不保存 Heap/Shed 对象本身的原因与恢复策略。

## 小节内容

### [3.3.1 APPLICATION_SOP 与 Heap/Shed](3.3.1_APPLICATION_SOP与HeapShed.md)

_getApplicationSOP、_saveApplicationSOP 的源码逻辑；per-pid 对象结构（heaps、sheds、nextHeapId、nextShedId）；为何不序列化 Heap/Shed；与 KernelMemory 的 key APPLICATION_SOP 的约定。

### [3.3.2 内存分配与回收接口](3.3.2_内存分配与回收接口.md)

MemoryManager 对外提供的分配/回收接口（若存在）、与 ProcessManager 在进程退出时的协作、以及 _canAllocateMemory 与 BIOS 设置的配合。

## 学习目标

- 能说明 APPLICATION_SOP 在 KernelMemory 中的存储形式及反序列化后如何与运行时 Heap/Shed 关联
- 能解释为何只持久化 nextHeapId/nextShedId 而不持久化 Heap/Shed 对象

---

**[返回章节目录](../README.md)** | **[上一节：3.2 进程管理详解](../section2_process/README.md)** | **[下一节：3.4 文件系统详解](../section4_filesystem/README.md)**
