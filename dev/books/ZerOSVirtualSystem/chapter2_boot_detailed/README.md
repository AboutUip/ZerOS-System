# 第2章：Boot 引导层实现

## 章节简介

本章深入讲解 Boot 引导层的完整实现，对应第 1 章中“阶段一：HTML 加载”与“阶段二：BootLoader 初始化”及后续按序加载的入口逻辑。引导层负责：在 HTML 中加载日志、依赖配置与对象池，再由 BootLoader（starter.js）根据依赖图按序加载所有内核与系统模块，为 Kernel 与 System 层奠定基础。

本章配合真实代码讲解，关键处给出源码路径与行号范围，便于读者对照阅读。

## 章节结构

### [2.1 BootLoader 启动器](section1_bootloader/README.md)

引导层入口、HTML 与脚本加载顺序、BootLoader 的执行阶段（安全校验 → 依赖图 → 按序加载）。

### [2.2 依赖配置详解](section2_dependency/README.md)

DependencyConfig 的职责、依赖状态（linked / inited / loaded）、waitLoaded 与拓扑排序的配合。

### [2.3 模块加载器](section3_loader/README.md)

Starter 中的 MODULE_DEPENDENCIES、拓扑排序算法、按层并行加载与 loadScript 实现。

### [2.4 对象池](section4_pool/README.md)

POOL（KERNEL_GLOBAL_POOL）的初始化、类别与键、__SET__/__GET__、系统加载标志与引导期的使用方式。

## 本章小节速览（链接跳转）

**2.1 BootLoader 启动器**  
[2.1.1 引导层入口与 HTML 加载顺序](section1_bootloader/2.1.1_引导层入口与HTML加载顺序.md) · [2.1.2 BootLoader 执行阶段](section1_bootloader/2.1.2_BootLoader执行阶段.md) · [2.1.3 HTML 脚本阻塞语义与 async/defer](section1_bootloader/2.1.3_HTML脚本阻塞语义与async_defer.md)

**2.2 依赖配置详解**  
[2.2.1 DependencyConfig 职责与状态](section2_dependency/2.2.1_DependencyConfig职责与状态.md) · [2.2.2 等待与就绪接口](section2_dependency/2.2.2_等待与就绪接口.md) · [2.2.3 dependencyMap 状态机与 dependencyLoaded 事件](section2_dependency/2.2.3_dependencyMap状态机与dependencyLoaded事件.md)

**2.3 模块加载器**  
[2.3.1 MODULE_DEPENDENCIES 与拓扑排序](section3_loader/2.3.1_MODULE_DEPENDENCIES与拓扑排序.md) · [2.3.2 按层加载与 loadScript](section3_loader/2.3.2_按层加载与loadScript.md) · [2.3.3 拓扑排序 DFS 递归树与环检测](section3_loader/2.3.3_拓扑排序DFS递归树与环检测.md) · [2.3.4 单模块加载的完整时序](section3_loader/2.3.4_单模块加载的完整时序.md)

**2.4 对象池**  
[2.4.1 POOL 结构与类别管理](section4_pool/2.4.1_POOL结构与类别管理.md) · [2.4.2 注册、获取与系统加载标志](section4_pool/2.4.2_注册获取与系统加载标志.md) · [2.4.3 __GET_ALL__ 与 __CLEAR__ 的语义](section4_pool/2.4.3_GET_ALL与CLEAR的语义与使用场景.md)

## 学习目标

完成本章学习后，读者应能够：

1. 完整描述 Boot 引导层从 HTML 到模块加载完成的工作流程
2. 理解 DependencyConfig 的依赖状态与等待接口，并能对照 dependencyConfig.js 阅读
3. 理解 Starter 的 MODULE_DEPENDENCIES、拓扑排序与按层加载逻辑，并能对照 starter.js 阅读
4. 理解 POOL 的类别、键、注册/获取及系统加载标志，并能对照 pool.js 阅读

---

**[返回书籍目录](../README.md)** | **[上一章：第1章 启动流程概述](../chapter1_overview/README.md)** | **[下一章：Kernel 内核层（待编写）](../chapter3_kernel_detailed/README.md)**
