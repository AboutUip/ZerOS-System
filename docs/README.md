# 📚 ZerOS 文档中心

<div align="center">

**欢迎来到 ZerOS 文档中心**

一个完整的虚拟操作系统开发文档集合

[![Documentation](https://img.shields.io/badge/docs-complete-brightgreen.svg)](./README.md)
[![API](https://img.shields.io/badge/API-30+-blue.svg)](./API/README.md)
[![Guide](https://img.shields.io/badge/guide-complete-yellow.svg)](./DEVELOPER_GUIDE.md)

</div>

---

## 🚀 快速导航

### 📖 入门文档

| 文档 | 描述 | 推荐度 |
|------|------|--------|
| [项目 README](../README.md) | 项目概览、快速开始、系统架构 | ⭐⭐⭐⭐⭐ |
| [开发者指南](./DEVELOPER_GUIDE.md) | 完整的程序开发指南，从入门到精通 | ⭐⭐⭐⭐⭐ |
| [内核文档](./ZEROS_KERNEL.md) | 深入理解 ZerOS 内核架构和设计原理 | ⭐⭐⭐⭐ |

### 🔧 API 参考文档

所有内核 API 的详细文档位于 [`docs/API/`](./API/) 目录，按功能分类如下：

#### ⚡ 核心系统 API（必读）

| API | 描述 | 状态 |
|-----|------|------|
| [ProcessManager](./API/ProcessManager.md) | 进程生命周期管理 | ✅ |
| [EventManager](./API/EventManager.md) | 统一的事件处理系统 | ⚠️ **必读** |
| [GUIManager](./API/GUIManager.md) | GUI 窗口管理 | ⚠️ **必读** |
| [PermissionManager](./API/PermissionManager.md) | 权限管理、审计、统计 | ⚠️ **必读** |
| [KernelLogger](./API/KernelLogger.md) | 统一的日志记录 | ⚠️ **必读** |

#### 💾 存储与内存 API

| API | 描述 | 状态 |
|-----|------|------|
| [LStorage](./API/LStorage.md) | 系统注册表和程序数据存储 | ✅ |
| [KernelMemory](./API/KernelMemory.md) | 内核数据持久化 | ✅ |
| [MemoryManager](./API/MemoryManager.md) | 进程内存分配和监控 | ✅ |
| [CacheDrive](./API/CacheDrive.md) | 统一缓存管理、生命周期管控 | ✅ |

#### 🗂️ 文件系统 API

| API | 描述 | 状态 |
|-----|------|------|
| [FileFramework](./API/FileFramework.md) | 文件操作基础 API | ✅ |
| [FSDirve](./API/FSDirve.md) | PHP 服务端文件操作 | ✅ |
| [Disk](./API/Disk.md) | 虚拟磁盘管理 | ✅ |
| [NodeTree](./API/NodeTree.md) | 内存文件系统结构 | ✅ |

#### 🎨 用户界面 API

| API | 描述 | 状态 |
|-----|------|------|
| [DesktopManager](./API/DesktopManager.md) | 桌面图标、组件、背景管理 | ✅ |
| [TaskbarManager](./API/TaskbarManager.md) | 任务栏管理、程序固定、多任务切换 | ✅ |
| [ContextMenuManager](./API/ContextMenuManager.md) | 右键菜单管理 | ✅ |
| [NotificationManager](./API/NotificationManager.md) | 系统通知管理 | ✅ |
| [ThemeManager](./API/ThemeManager.md) | 主题和风格系统 | ✅ |
| [LockScreen](./API/LockScreen.md) | 锁屏界面（Windows 11 风格登录界面） | ✅ |

#### 🔐 安全与加密 API

| API | 描述 | 状态 |
|-----|------|------|
| [PermissionManager](./API/PermissionManager.md) | 权限管理、审计、统计 | ⚠️ **必读** |
| [CryptDrive](./API/CryptDrive.md) | RSA 加密、MD5 哈希、随机数 | ✅ |

#### 🌐 网络与通信 API

| API | 描述 | 状态 |
|-----|------|------|
| [NetworkManager](./API/NetworkManager.md) | HTTP 请求、WebSocket | ✅ |

#### 🛠️ 工具与辅助 API

| API | 描述 | 状态 |
|-----|------|------|
| [ApplicationAssetManager](./API/ApplicationAssetManager.md) | 应用资源管理 | ✅ |
| [AnimateManager](./API/AnimateManager.md) | 窗口和 UI 动画 | ✅ |
| [Pool](./API/Pool.md) | 程序间数据共享 | ✅ |
| [DependencyConfig](./API/DependencyConfig.md) | 模块依赖管理 | ✅ |
| [Starter](./API/Starter.md) | 系统启动和初始化 | ✅ |
| [UserControl](./API/UserControl.md) | 用户控制系统（多用户管理、权限控制） | ✅ |

#### 🚀 高级驱动 API

| API | 描述 | 状态 |
|-----|------|------|
| [CompressionDrive](./API/CompressionDrive.md) | ZIP/RAR 压缩解压缩 | ✅ |
| [DragDrive](./API/DragDrive.md) | 文件拖拽处理 | ✅ |
| [GeographyDrive](./API/GeographyDrive.md) | 地理位置相关功能 | ✅ |
| [SpeechDrive](./API/SpeechDrive.md) | 语音识别驱动（基于 Web Speech API） | ✅ |
| [MultithreadingDrive](./API/MultithreadingDrive.md) | 并发处理 | ✅ |

---

## 🎯 使用指南

### 📚 新手入门路径

1. **第一步**：阅读 [项目 README](../README.md)，了解 ZerOS 的基本概念和快速开始
2. **第二步**：阅读 [开发者指南](./DEVELOPER_GUIDE.md) 的"快速开始"部分，创建你的第一个程序
3. **第三步**：参考 [开发者指南](./DEVELOPER_GUIDE.md) 的"重要注意事项"，了解开发规范
4. **第四步**：根据你的需求，查阅相应的 API 文档

### 💻 开发程序时

| 开发场景 | 推荐阅读 |
|---------|---------|
| **GUI 程序开发** | [GUIManager](./API/GUIManager.md) + [EventManager](./API/EventManager.md) |
| **文件操作** | [FileFramework](./API/FileFramework.md) + [FSDirve](./API/FSDirve.md) |
| **数据存储** | [LStorage](./API/LStorage.md) + [CacheDrive](./API/CacheDrive.md) |
| **权限管理** | [PermissionManager](./API/PermissionManager.md) |

### ❓ 遇到问题时

1. 查看 [开发者指南](./DEVELOPER_GUIDE.md) 的"常见问题"部分
2. 查阅相关 API 文档的"注意事项"和"示例代码"
3. 使用浏览器开发者工具（F12）查看控制台日志
4. 检查程序是否正确实现了必需的方法（`__init__`、`__exit__`、`__info__`）

---

## ⚠️ 重要提示

### 🔒 开发规范（必须遵守）

| 规范 | 说明 | 详细文档 |
|------|------|---------|
| **事件处理** | 必须使用 `EventManager`，不要直接使用 `addEventListener` | [EventManager](./API/EventManager.md) |
| **日志记录** | 必须使用 `KernelLogger`，不要直接使用 `console.log` | [KernelLogger](./API/KernelLogger.md) |
| **窗口管理** | 必须使用 `GUIManager` 创建和管理窗口 | [GUIManager](./API/GUIManager.md) |
| **权限声明** | 必须在 `__info__` 方法中声明所需权限 | [PermissionManager](./API/PermissionManager.md) |
| **资源清理** | 必须在 `__exit__` 方法中清理所有资源 | [开发者指南](./DEVELOPER_GUIDE.md#资源清理) |

### ❌ 常见错误

- ❌ 直接使用 `addEventListener`（应使用 `EventManager`）
- ❌ 直接使用 `console.log`（应使用 `KernelLogger`）
- ❌ 忘记在 `__exit__` 中清理事件监听器
- ❌ 忘记在 `__info__` 中声明权限
- ❌ 使用 `alert`、`confirm`、`prompt`（应使用 `GUIManager.showAlert` 等）

---

## 📝 文档更新

文档会随着系统更新而持续改进。如果你发现文档有误或需要补充，欢迎提交 Issue 或 Pull Request（更推荐发送邮件）。

---

## 🔗 相关链接

- [项目主页](../README.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [内核文档](./ZEROS_KERNEL.md)
- [API 文档索引](./API/README.md)

---

<div align="center">

**祝你开发愉快！** 🎉

Made with ❤️ by ZerOS Team

</div>

