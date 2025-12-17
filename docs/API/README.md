# ZerOS 内核 API 文档索引

本文档提供了 ZerOS 内核所有模块的 API 文档索引。

## 核心模块

### 日志系统
- [KernelLogger.md](./KernelLogger.md) - 统一的内核日志系统 ✅

### 进程管理
- [ProcessManager.md](./ProcessManager.md) - 进程生命周期管理 ✅
- [PermissionManager.md](./PermissionManager.md) - 权限管理 ✅

### 内存管理
- [MemoryManager.md](./MemoryManager.md) - 统一内存管理器 ✅
- [KernelMemory.md](./KernelMemory.md) - 内核动态数据存储（Exploit 程序内存管理） ✅

### GUI 管理
- [GUIManager.md](./GUIManager.md) - GUI 窗口管理 ✅
- [NotificationManager.md](./NotificationManager.md) - 通知管理 ✅
- [TaskbarManager.md](./TaskbarManager.md) - 任务栏管理 ✅
- [ThemeManager.md](./ThemeManager.md) - 主题管理 ✅
- [EventManager.md](./EventManager.md) - 事件管理 ✅
- [ContextMenuManager.md](./ContextMenuManager.md) - 上下文菜单管理 ✅
- [DesktopManager.md](./DesktopManager.md) - 桌面管理 ✅

### 文件系统
- [Disk.md](./Disk.md) - 虚拟磁盘管理 ✅
- [NodeTree.md](./NodeTree.md) - 文件树结构 ✅
- [FileFramework.md](./FileFramework.md) - 文件对象模板 ✅

### 驱动层
- [AnimateManager.md](./AnimateManager.md) - 动画管理 ✅
- [NetworkManager.md](./NetworkManager.md) - 网络管理 ✅
- [LStorage.md](./LStorage.md) - 本地存储 ✅
- [CacheDrive.md](./CacheDrive.md) - 缓存驱动 ✅
- [DragDrive.md](./DragDrive.md) - 拖拽驱动 ✅
- [GeographyDrive.md](./GeographyDrive.md) - 地理位置驱动 ✅
- [CryptDrive.md](./CryptDrive.md) - 加密驱动 ✅

### PHP 服务
- [FSDirve.md](./FSDirve.md) - 文件系统驱动服务（PHP 后端） ✅
- [CompressionDrive.md](./CompressionDrive.md) - 压缩驱动服务（ZIP/RAR 压缩解压缩） ✅

### 信号系统
- [Pool.md](./Pool.md) - 全局对象池 ✅
- [DependencyConfig.md](./DependencyConfig.md) - 依赖管理和模块加载 ✅

### 启动引导
- [Starter.md](./Starter.md) - 内核启动器 ✅

### 应用程序资源
- [ApplicationAssetManager.md](./ApplicationAssetManager.md) - 应用程序资源管理 ✅

## 使用说明

每个 API 文档包含：
- 模块概述
- 依赖关系
- API 方法详细说明
- 使用示例
- 注意事项
- 相关文档链接

## 快速查找

### 按功能分类

**日志和调试**
- KernelLogger

**进程和内存**
- ProcessManager
- PermissionManager
- MemoryManager
- KernelMemory

**用户界面**
- GUIManager
- NotificationManager
- TaskbarManager
- ThemeManager
- EventManager
- ContextMenuManager
- DesktopManager

**文件系统**
- Disk
- NodeTree
- FileFramework

**系统服务**
- AnimateManager
- NetworkManager
- LStorage
- CacheDrive
- PermissionManager
- DragDrive
- GeographyDrive
- CryptDrive
- FSDirve (PHP 服务)

**基础设施**
- Pool
- DependencyConfig
- Starter
- ApplicationAssetManager

## 文档状态

- ✅ 已创建
- ⏳ 待创建

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南

