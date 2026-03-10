# 第1章：ZerOS 启动流程概述

## 章节简介

本章作为全书的开篇，将带领读者建立对 ZerOS 系统的整体认知。我们将从宏观视角俯瞰整个系统的启动过程，理解各核心模块的职责、角色与协作方式。

本章采用"问题驱动"的讲解方式：首先提出每个模块需要解决的问题，然后给出通用的解决方案，最后展示 ZerOS 的具体实现。通过这种方式，读者不仅能了解"是什么"，更能理解"为什么"。

**本章核心问题**：为什么要引导这个模块？这个模块在引导流程中起什么作用？

## 章节结构

### [1.1 内核的概念与歧义](section1_concept/README.md)

消除对"内核"的绝对化理解，认识到内核概念的多样性，理解 ZerOS 的三层架构，明确本书的学习定位。

### [1.2 日志系统——调试的基础](section2_logger/README.md)

为什么需要日志系统，日志系统的职责与能力，ZerOS 实现：KernelLogger。

### [1.3 依赖配置——模块关系的定义](section3_dependency/README.md)

为什么需要依赖配置，依赖配置的职责与能力，ZerOS 实现：DependencyConfig。

### [1.4 对象池——模块间的数据共享](section4_pool/README.md)

为什么需要对象池，对象池的职责与能力，ZerOS 实现：KERNEL_GLOBAL_POOL。

### [1.5 模块加载器——按序初始化](section5_loader/README.md)

为什么需要模块加载器，模块加载的职责与能力，ZerOS 实现：异步加载机制。

### [1.6 进程管理——程序的运行管理](section6_process/README.md)

为什么需要进程管理，进程管理的职责与能力，ZerOS 实现：ProcessManager。

### [1.7 内存管理——内存资源的分配](section7_memory/README.md)

为什么需要内存管理，内存管理的职责与能力，ZerOS 实现：MemoryManager + Heap + Shed。

### [1.8 文件系统——数据的持久化](section8_filesystem/README.md)

为什么需要文件系统，文件系统的职责与能力，ZerOS 实现：Disk + NodeTree + FileFramework。

### [1.9 安全控制——权限与用户](section9_security/README.md)

为什么需要安全控制，安全控制的职责与能力，ZerOS 实现：PermissionManager + UserControl。

### [1.10 GUI窗口管理——用户界面的呈现](section10_guimanager/README.md)

为什么需要 GUI 窗口管理，GUI 窗口管理的职责与能力，ZerOS 实现：GUIManager。

### [1.11 事件系统——用户交互的处理](section11_event/README.md)

为什么需要事件系统，事件系统的职责与能力，ZerOS 实现：EventManager。

### [1.12 启动流程总结](section12_summary/README.md)

完整启动流程图，本章要点回顾。

## 学习目标

完成本章学习后，读者应能够：
1. 理解内核的概念，消除绝对化理解
2. 掌握 ZerOS 启动流程的核心模块
3. 理解各模块的职责、能力和协作方式
4. 理解为什么要引导每个模块，以及每个模块在引导流程中的作用
5. 为后续深入学习建立知识框架

---

**[返回书籍目录](../README.md)** | **[下一章：Boot 引导层（待编写）](../chapter2_boot/README.md)**
