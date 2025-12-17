# ZerOS 文档中心

欢迎来到 ZerOS 文档中心！这里提供了 ZerOS 虚拟操作系统的完整文档，帮助你快速了解和使用 ZerOS。

## 📚 文档导航

### 🚀 快速开始

- **[项目 README](../README.md)** - 项目概览、快速开始和系统架构介绍
- **[开发者指南](./DEVELOPER_GUIDE.md)** - 完整的程序开发指南，从入门到精通

### 📖 核心文档

- **[ZerOS 内核文档](./ZEROS_KERNEL.md)** - 深入理解 ZerOS 内核架构和设计原理

### 🔧 API 参考

所有内核 API 的详细文档位于 `docs/API/` 目录：

#### 核心系统 API

- **[ProcessManager](./API/ProcessManager.md)** - 进程管理：启动、停止、生命周期管理
- **[EventManager](./API/EventManager.md)** - 事件管理：统一的事件处理系统 ⚠️ **必读**
- **[GUIManager](./API/GUIManager.md)** - GUI 管理：窗口创建、拖动、拉伸、焦点管理 ⚠️ **必读**
- **[PermissionManager](./API/PermissionManager.md)** - 权限管理：权限声明和检查 ⚠️ **必读**
- **[KernelLogger](./API/KernelLogger.md)** - 日志系统：统一的日志记录 ⚠️ **必读**

#### 文件系统 API

- **[FileFramework](./API/FileFramework.md)** - 文件框架：文件操作基础 API
- **[FSDirve](./API/FSDirve.md)** - 文件系统驱动：PHP 服务端文件操作
- **[Disk](./API/Disk.md)** - 磁盘管理：分区、磁盘信息
- **[NodeTree](./API/NodeTree.md)** - 节点树：内存文件系统结构

#### 存储与内存 API

- **[LStorage](./API/LStorage.md)** - 本地存储：系统注册表和程序数据存储
- **[KernelMemory](./API/KernelMemory.md)** - 内核内存：内核数据持久化
- **[MemoryManager](./API/MemoryManager.md)** - 内存管理：进程内存分配和监控

#### 用户界面 API

- **[DesktopManager](./API/DesktopManager.md)** - 桌面管理：图标、组件、背景
- **[TaskbarManager](./API/TaskbarManager.md)** - 任务栏管理：程序固定、多任务切换
- **[ContextMenuManager](./API/ContextMenuManager.md)** - 右键菜单：上下文菜单管理
- **[NotificationManager](./API/NotificationManager.md)** - 通知管理：系统通知
- **[ThemeManager](./API/ThemeManager.md)** - 主题管理：主题和风格系统

#### 安全与加密 API

- **[CryptDrive](./API/CryptDrive.md)** - 加密驱动：RSA 加密、MD5 哈希、随机数

#### 网络与通信 API

- **[NetworkManager](./API/NetworkManager.md)** - 网络管理：HTTP 请求、WebSocket

#### 工具与辅助 API

- **[ApplicationAssetManager](./API/ApplicationAssetManager.md)** - 应用资源管理：程序图标、元数据
- **[AnimateManager](./API/AnimateManager.md)** - 动画管理：窗口和 UI 动画
- **[Pool](./API/Pool.md)** - 共享空间：程序间数据共享
- **[DependencyConfig](./API/DependencyConfig.md)** - 依赖配置：模块依赖管理
- **[Starter](./API/Starter.md)** - 启动器：系统启动和初始化

#### 高级驱动 API

- **[CacheDrive](./API/CacheDrive.md)** - 缓存驱动：统一缓存管理、生命周期管控
- **[CompressionDrive](./API/CompressionDrive.md)** - 压缩驱动：ZIP 文件处理
- **[DragDrive](./API/DragDrive.md)** - 拖拽驱动：文件拖拽处理
- **[GeographyDrive](./API/GeographyDrive.md)** - 地理驱动：地理位置相关功能
- **[MultithreadingDrive](./API/MultithreadingDrive.md)** - 多线程驱动：并发处理

---

## 🎯 文档使用指南

### 新手入门路径

1. **第一步**：阅读 [项目 README](../README.md)，了解 ZerOS 的基本概念和快速开始
2. **第二步**：阅读 [开发者指南](./DEVELOPER_GUIDE.md) 的"快速开始"部分，创建你的第一个程序
3. **第三步**：参考 [开发者指南](./DEVELOPER_GUIDE.md) 的"重要注意事项"，了解开发规范
4. **第四步**：根据你的需求，查阅相应的 API 文档

### 开发程序时

- **GUI 程序开发**：重点阅读 [GUIManager](./API/GUIManager.md) 和 [EventManager](./API/EventManager.md)
- **文件操作**：参考 [FileFramework](./API/FileFramework.md) 和 [FSDirve](./API/FSDirve.md)
- **数据存储**：使用 [LStorage](./API/LStorage.md) 或文件系统 API
- **权限管理**：查看 [PermissionManager](./API/PermissionManager.md)

### 遇到问题时

1. 查看 [开发者指南](./DEVELOPER_GUIDE.md) 的"常见问题"部分
2. 查阅相关 API 文档的"注意事项"和"示例代码"
3. 使用浏览器开发者工具（F12）查看控制台日志
4. 检查程序是否正确实现了必需的方法（`__init__`、`__exit__`、`__info__`）

---

## ⚠️ 重要提示

### 开发规范（必须遵守）

1. **事件处理**：必须使用 `EventManager`，不要直接使用 `addEventListener`
2. **日志记录**：必须使用 `KernelLogger`，不要直接使用 `console.log`
3. **窗口管理**：必须使用 `GUIManager` 创建和管理窗口
4. **权限声明**：必须在 `__info__` 方法中声明所需权限
5. **资源清理**：必须在 `__exit__` 方法中清理所有资源

详细说明请参考 [开发者指南 - 重要注意事项](./DEVELOPER_GUIDE.md#重要注意事项)。

### 常见错误

- ❌ 直接使用 `addEventListener`（应使用 `EventManager`）
- ❌ 直接使用 `console.log`（应使用 `KernelLogger`）
- ❌ 忘记在 `__exit__` 中清理事件监听器
- ❌ 忘记在 `__info__` 中声明权限
- ❌ 使用 `alert`、`confirm`、`prompt`（应使用 `GUIManager.showAlert` 等）

---

## 📝 文档更新

文档会随着系统更新而持续改进。如果你发现文档有误或需要补充，欢迎提交 Issue 或 Pull Request(更推荐发送邮件)。

---

## 🔗 相关链接

- [项目主页](../README.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [内核文档](./ZEROS_KERNEL.md)
- [API 文档目录](./API/README.md)

---

**祝你开发愉快！** 🎉

