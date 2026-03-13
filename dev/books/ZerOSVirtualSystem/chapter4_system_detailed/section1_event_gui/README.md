# 4.1 事件与 GUI 管理

## 大节简介

本节讲解系统层中**事件管理**与**窗口管理**的核心模块：**EventManager**（`system/ui/eventManager.js`）与 **GUIManager**（`system/ui/guiManager.js`）。EventManager 统一管理全局事件的注册、优先级、传播控制与进程退出时的自动清理；GUIManager 管理窗口的注册、z-index、焦点、最小化/最大化/关闭及与 ProcessManager、任务栏的协作。二者均依赖 ProcessManager（pid）与 POOL。

## 小节列表

- [4.1.1 EventManager 职责与事件注册](4.1.1_EventManager职责与事件注册.md)
- [4.1.2 GUIManager 职责与窗口注册](4.1.2_GUIManager职责与窗口注册.md)
- [4.1.3 _ensureGlobalListener 与事件派发算法](4.1.3_ensureGlobalListener与事件派发算法.md)

---

**[返回章节目录](../README.md)** | **[下一节：4.2 任务栏与通知](../section2_taskbar_notification/README.md)**
