# 2.3 模块加载器

## 大节简介

本节讲解 Starter 中“按依赖顺序加载模块”的实现：MODULE_DEPENDENCIES 的结构、拓扑排序算法、以及按层分组与 loadScript 的配合。源码位置：`bootloader/starter.js`。

## 小节内容

### [2.3.1 MODULE_DEPENDENCIES 与拓扑排序](2.3.1_MODULE_DEPENDENCIES与拓扑排序.md)

依赖图结构、拓扑排序算法（DFS + 循环检测）、排序结果与“层”的关系。

### [2.3.2 按层加载与 loadScript](2.3.2_按层加载与loadScript.md)

按层分组、同层并行 Promise.all(loadScript)、loadScript 的实现及与 DependencyConfig 的衔接。

### [2.3.3 拓扑排序 DFS 递归树与环检测](2.3.3_拓扑排序DFS递归树与环检测.md)

DFS 后序与“被依赖者在前”的等价性、递归树与 visiting/visited 的逐步变化、为何必须用 visiting 检测环、手推示例。

### [2.3.4 单模块加载的完整时序](2.3.4_单模块加载的完整时序.md)

单模块从 loadScript 到 waitLoaded 的完整时间线、先 Promise.all(deps) 再 loadScript 的必要性、超时继续的影响。

## 学习目标

- 能根据 MODULE_DEPENDENCIES 说出任意模块的大致加载层级
- 能解释拓扑排序如何保证“被依赖者先于依赖者”
- 能说明 loadScript 如何与 POOL/Dependency 配合

---

**[返回章节目录](../README.md)** | **[上一节：2.2 依赖配置详解](../section2_dependency/README.md)** | **[下一节：2.4 对象池](../section4_pool/README.md)**
