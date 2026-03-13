# 第4章：System 系统层实现

## 章节简介

本章深入讲解 ZerOS **系统层**的完整实现。系统层是用户直接感知的一层：将内核层的进程、内存、文件系统等能力转化为可操作的窗口、事件、通知、任务栏、锁屏与权限控制。读者将理解 **EventManager**（事件统一注册与传播）、**GUIManager**（窗口 z-index、焦点、最小化/最大化）、**TaskbarManager**、**NotificationManager**、**PermissionManager**（权限声明与检查）、**LockScreen** 以及 **系统扩展**（LanguagesExpansion、SystemExpansion、ServerExpansion 等）的源码、行为流程与维护要点。学完后可 100% 理解系统层每一处代码的作用，并能接手增量更新或修补漏洞。

## 本章小节速览

### [4.1 事件与 GUI 管理](section1_event_gui/README.md)
- [4.1.1 EventManager 职责与事件注册](section1_event_gui/4.1.1_EventManager职责与事件注册.md)
- [4.1.2 GUIManager 职责与窗口注册](section1_event_gui/4.1.2_GUIManager职责与窗口注册.md)
- [4.1.3 _ensureGlobalListener 与事件派发算法](section1_event_gui/4.1.3_ensureGlobalListener与事件派发算法.md)

### [4.2 任务栏与通知](section2_taskbar_notification/README.md)
- [4.2.1 TaskbarManager 与进程图标](section2_taskbar_notification/4.2.1_TaskbarManager与进程图标.md)
- [4.2.2 NotificationManager 与通知显示](section2_taskbar_notification/4.2.2_NotificationManager与通知显示.md)

### [4.3 权限与锁屏](section3_permission_lockscreen/README.md)
- [4.3.1 PermissionManager 权限声明与检查](section3_permission_lockscreen/4.3.1_PermissionManager权限声明与检查.md)
- [4.3.2 LockScreen 与用户认证](section3_permission_lockscreen/4.3.2_LockScreen与用户认证.md)
- [4.3.3 hasPermission 的完整分支与缓存策略](section3_permission_lockscreen/4.3.3_hasPermission的完整分支与缓存策略.md)

### [4.4 系统扩展](section4_expansion/README.md)
- [4.4.1 系统扩展概述与加载顺序](section4_expansion/4.4.1_系统扩展概述与加载顺序.md)
- [4.4.2 LanguagesExpansion 与 SystemExpansion](section4_expansion/4.4.2_LanguagesExpansion与SystemExpansion.md)

### [4.5 系统 API 使用情景（应用层）](section5_api_usage/README.md)
- [4.5.1 情景：发送系统通知](section5_api_usage/4.5.1_情景_发送系统通知.md)
- [4.5.2 情景：读写本地数据（LocalStorage 与 FileSystem）](section5_api_usage/4.5.2_情景_读写本地数据.md)
- [4.5.3 情景：程序退出前保存与自退](section5_api_usage/4.5.3_情景_退出前保存与自退.md)
- [4.5.4 情景：事件订阅与跨窗口通信](section5_api_usage/4.5.4_情景_事件订阅与跨窗口通信.md)
- [4.5.5 情景：任务栏图标与前后台切换](section5_api_usage/4.5.5_情景_任务栏图标与前后台切换.md)

## 学习目标

- 理解事件管理器对 addEventListener 的拦截、registerEventHandler 的优先级与进程绑定、进程退出时的自动清理
- 理解 GUI 管理器的窗口注册表、z-index 分配与回收、焦点与模态对话框、任务栏预览提供者
- 理解任务栏与进程图标的对应、通知的显示与队列
- 理解权限枚举、级别、声明与 hasPermission 检查、LStorage 敏感键与权限的配合
- 理解锁屏与用户认证流程
- 理解系统扩展的 _ready、与 init 的依赖关系及 LanguagesExpansion/SystemExpansion 的职责

---

**[返回章节目录](../README.md)** | **[上一章：第3章 内核层](../chapter3_kernel_detailed/README.md)**
