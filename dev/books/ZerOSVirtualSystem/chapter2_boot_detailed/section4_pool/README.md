# 2.4 对象池

## 大节简介

本节讲解引导层中使用的全局对象池 **POOL**（与 KERNEL_GLOBAL_POOL 类别）：其数据结构、类别与键的管理、__SET__/__GET__/__ADD__ 等接口，以及系统加载标志 __SYSTEM_LOADING_FLAG__ 在引导期的含义与删除策略。源码位置：`kernel/core/signal/pool.js`。

## 小节内容

### [2.4.1 POOL 结构与类别管理](2.4.1_POOL结构与类别管理.md)

POOL 的单例形态、__KEY_POOL__、类别（type）与键的规范化、__UPDATE__ 与 __INIT__。

### [2.4.2 注册、获取与系统加载标志](2.4.2_注册获取与系统加载标志.md)

__ADD__ / __GET__ / __HAS__ / __REMOVE__、系统加载标志的添加与“一旦删除永久拒绝再添加”的策略、与 BootLoader 的配合。

### [2.4.3 __GET_ALL__ 与 __CLEAR__ 的语义与使用场景](2.4.3_GET_ALL与CLEAR的语义与使用场景.md)

__GET_ALL__ 的浅拷贝与枚举合并、__CLEAR__() 全量重置与 __SYSTEM_LOADING_REMOVED__ 重置、使用场景与注意点。

## 学习目标

- 能说明 POOL 中“类别”与“命名元素”的关系，以及 __GET__(type, name) 的用法
- 能解释 __SYSTEM_LOADING_FLAG__ 在引导期的用途及删除后的安全策略

---

**[返回章节目录](../README.md)** | **[上一节：2.3 模块加载器](../section3_loader/README.md)**
