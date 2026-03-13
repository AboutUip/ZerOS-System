# 5.3 典型协作模式

## 大节简介

本节归纳 ZerOS 中**内核模块之间、系统层与内核层之间**的典型协作模式：**ProcessManager 与 MemoryManager**（进程生命周期与内存分配/释放、PROCESS_TABLE 与 APPLICATION_SOP 的配合）；**GUIManager 与 EventManager**（窗口按 pid 注册/注销与事件按 pid 清理）；**PermissionManager 与 LStorage**（敏感键与权限检查）；以及 **BootLoader 与 DependencyConfig/POOL**（引导顺序与模块发现）。学完后能画出协作关系图并在修改时保持一致性。

## 小节列表

- [5.3.1 ProcessManager 与 MemoryManager](5.3.1_ProcessManager与MemoryManager.md)
- [5.3.2 系统层与内核层的协作](5.3.2_系统层与内核层的协作.md)

---

**[返回本章目录](../../README.md)** | **[上一节：5.2 应用与内核的边界](../section2_app_kernel_boundary/README.md)** | **[下一节：5.4 完整调用链示例](../section4_callchains/README.md)**
