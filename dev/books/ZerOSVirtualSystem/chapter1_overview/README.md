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

## 本章小节速览（链接跳转）

以下为本章所有小节的直达链接，便于快速定位。

**1.1 内核的概念与歧义**  
[1.1.1 什么是内核](section1_concept/1.1.1_什么是内核.md) · [1.1.2 内核的绝对化理解](section1_concept/1.1.2_内核的绝对化理解.md) · [1.1.3 为什么是 BootLoader 而非 Boot](section1_concept/1.1.3_为什么是BootLoader而非Boot.md) · [1.1.4 为什么内核结构与常见操作系统不一致](section1_concept/1.1.4_为什么内核结构与常见操作系统不一致.md) · [1.1.5 内核的多样形态](section1_concept/1.1.5_内核的多样形态.md) · [1.1.6 本书的定位](section1_concept/1.1.6_本书的定位.md) · [1.1.7 系统分层与启动机制](section1_concept/1.1.7_系统分层与启动机制.md)

**1.2 日志系统**  
[1.2.1 日志系统的作用](section2_logger/1.2.1_日志系统的作用.md) · [1.2.2 日志系统的核心能力](section2_logger/1.2.2_日志系统的核心能力.md) · [1.2.3 KernelLogger 实现](section2_logger/1.2.3_KernelLogger实现.md)

**1.3 依赖配置**  
[1.3.1 依赖配置的作用](section3_dependency/1.3.1_依赖配置的作用.md) · [1.3.2 依赖配置的核心概念](section3_dependency/1.3.2_依赖配置的核心概念.md) · [1.3.3 DependencyConfig 实现](section3_dependency/1.3.3_DependencyConfig实现.md)

**1.4 对象池**  
[1.4.1 对象池的作用](section4_pool/1.4.1_对象池的作用.md) · [1.4.2 对象池的核心概念](section4_pool/1.4.2_对象池的核心概念.md)

**1.5 模块加载器**  
[1.5.1 模块加载器的作用](section5_loader/1.5.1_模块加载器的作用.md) · [1.5.2 模块加载的核心概念](section5_loader/1.5.2_模块加载的核心概念.md) · [1.5.3 Starter 实现](section5_loader/1.5.3_Starter实现.md)

**1.6 进程管理**  
[1.6.1 进程管理的作用](section6_process/1.6.1_进程管理的作用.md) · [1.6.2 进程管理的核心概念](section6_process/1.6.2_进程管理的核心概念.md) · [1.6.3 ProcessManager 实现](section6_process/1.6.3_ProcessManager实现.md)

**1.7 内存管理**  
[1.7.1 内存管理的作用](section7_memory/1.7.1_内存管理的作用.md) · [1.7.2 内存管理的核心概念](section7_memory/1.7.2_内存管理的核心概念.md) · [1.7.3 MemoryManager 实现](section7_memory/1.7.3_MemoryManager实现.md)

**1.8 文件系统**  
[1.8.1 文件系统的作用](section8_filesystem/1.8.1_文件系统的作用.md) · [1.8.2 文件系统的核心概念](section8_filesystem/1.8.2_文件系统的核心概念.md) · [1.8.3 Disk 实现](section8_filesystem/1.8.3_Disk实现.md)

**1.9 安全控制**  
[1.9.1 安全控制的作用](section9_security/1.9.1_安全控制的作用.md) · [1.9.2 安全控制的核心概念](section9_security/1.9.2_安全控制的核心概念.md) · [1.9.3 PermissionManager 实现](section9_security/1.9.3_PermissionManager实现.md)

**1.10 GUI 窗口管理**  
[1.10.1 GUI 窗口管理的作用](section10_guimanager/1.10.1_GUI窗口管理的作用.md) · [1.10.2 GUI 窗口管理的核心概念](section10_guimanager/1.10.2_GUI窗口管理的核心概念.md) · [1.10.3 GUIManager 实现](section10_guimanager/1.10.3_GUIManager实现.md)

**1.11 事件系统**  
[1.11.1 事件系统的作用](section11_event/1.11.1_事件系统的作用.md) · [1.11.2 事件系统的核心概念](section11_event/1.11.2_事件系统的核心概念.md) · [1.11.3 EventManager 实现](section11_event/1.11.3_EventManager实现.md)

**1.12 启动流程总结**  
[1.12.1 启动流程概览](section12_summary/1.12.1_启动流程概览.md) · [1.12.2 模块协作关系](section12_summary/1.12.2_模块协作关系.md) · [1.12.3 流程图解析](section12_summary/1.12.3_流程图解析.md)

## 学习目标

完成本章学习后，读者应能够：
1. 理解内核的概念，消除绝对化理解
2. 掌握 ZerOS 启动流程的核心模块
3. 理解各模块的职责、能力和协作方式
4. 理解为什么要引导每个模块，以及每个模块在引导流程中的作用
5. 为后续深入学习建立知识框架

---

**[返回书籍目录](../README.md)** | **[下一章：Boot 引导层实现](../chapter2_boot_detailed/README.md)**
