# 2.2 依赖配置详解

## 大节简介

本节讲解 DependencyConfig 的实现：其在引导层中的职责、依赖项的状态（linked / inited / loaded）、以及如何通过 waitLoaded / waitLoadedSync 与 BootLoader 的按序加载配合。源码位置：`kernel/core/signal/dependencyConfig.js`。

## 小节内容

### [2.2.1 DependencyConfig 职责与状态](2.2.1_DependencyConfig职责与状态.md)

DependencyConfig 的定位、dependencyMap 与 DependencyConfig.generate、linked / inited / loaded 三态含义。

### [2.2.2 等待与就绪接口](2.2.2_等待与就绪接口.md)

waitLoaded（异步）与 waitLoadedSync（同步）、超时与 interval、以及 BootLoader 中如何调用。

### [2.2.3 dependencyMap 状态机与 dependencyLoaded 事件链路](2.2.3_dependencyMap状态机与dependencyLoaded事件.md)

linked / inited / loaded 三态转换、publishSignal 派发与 constructor 内事件监听、从模块执行到 waitLoaded resolve 的完整事件链路。

## 学习目标

- 能解释 dependencyMap 中一项的 linked / inited / loaded 分别表示什么
- 能说明 waitLoaded 在引导流程中的使用场景

---

**[返回章节目录](../README.md)** | **[上一节：2.1 BootLoader 启动器](../section1_bootloader/README.md)** | **[下一节：2.3 模块加载器](../section3_loader/README.md)**
