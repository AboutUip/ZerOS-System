# 4.3 权限与锁屏

## 大节简介

本节讲解 **PermissionManager**（`kernel/process/permissionManager.js`）与 **LockScreen**（`system/ui/lockscreen.js`）。权限管理器负责权限枚举、级别、声明、hasPermission 检查、与 LStorage 敏感键的配合及持久化；锁屏负责用户认证、密码校验、安全模式跳过及与 LanguagesExpansion 的多语言。

## 小节列表

- [4.3.1 PermissionManager 权限声明与检查](4.3.1_PermissionManager权限声明与检查.md)
- [4.3.2 LockScreen 与用户认证](4.3.2_LockScreen与用户认证.md)
- [4.3.3 hasPermission 的完整分支与缓存策略](4.3.3_hasPermission的完整分支与缓存策略.md)

---

**[返回章节目录](../README.md)** | **[上一节：4.2 任务栏与通知](../section2_taskbar_notification/README.md)** | **[下一节：4.4 系统扩展](../section4_expansion/README.md)**
