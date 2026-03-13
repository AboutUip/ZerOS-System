# 2.1 BootLoader 启动器

## 大节简介

本节说明 BootLoader 在 ZerOS 中的定位：引导层入口、HTML 中的脚本加载顺序，以及 BootLoader（starter.js）执行后经历的阶段（安全校验、依赖图构建、按序加载模块）。与第 1 章 1.12 的启动流程图对应，本节对应“阶段一：HTML 加载”与“阶段二：BootLoader 初始化”及阶段三的入口。

## 小节内容

### [2.1.1 引导层入口与 HTML 加载顺序](2.1.1_引导层入口与HTML加载顺序.md)

入口从哪里开始、HTML 中四个 script 的顺序及其含义（KernelLogger → DependencyConfig → POOL → starter.js）。

### [2.1.2 BootLoader 执行阶段](2.1.2_BootLoader执行阶段.md)

starter.js 执行后的阶段划分：SystemInformation 与 RandomSecurity → 依赖图与 loadModules → 与 DependencyConfig/POOL 的配合。

### [2.1.3 HTML 脚本阻塞语义与 async/defer](2.1.3_HTML脚本阻塞语义与async_defer.md)

默认 script 的阻塞与顺序语义、async/defer 差异、为何引导层关键脚本必须为默认阻塞、loadScript 中 async=false 的作用。

## 学习目标

- 能说出引导层在 HTML 中的加载顺序及原因
- 能描述 BootLoader 从执行到开始 loadModules 的步骤

---

**[返回章节目录](../README.md)** | **[下一节：2.2 依赖配置详解](../section2_dependency/README.md)**
