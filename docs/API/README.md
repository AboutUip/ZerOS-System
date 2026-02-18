# ZerOS 内核 API 文档索引

本文档提供了 ZerOS 内核所有模块的 API 文档索引。

## 核心模块

### 日志系统
- [KernelLogger.md](./KernelLogger.md) - 统一的内核日志系统 ✅

### 进程管理
- [ProcessManager.md](./ProcessManager.md) - 进程生命周期管理 ✅
- [PermissionManager.md](./PermissionManager.md) - 权限管理 ✅

### 异常处理
- [ExceptionHandler.md](./ExceptionHandler.md) - 异常处理管理器（结构化异常处理SEH） ✅

### 用户控制
- [UserControl.md](./UserControl.md) - 用户控制系统 ✅
- [UserGroup.md](./UserGroup.md) - 用户组管理系统 ✅

### 安全与鉴权
- [RandomSecurity.md](./RandomSecurity.md) - 安全模块（SystemToken/UserToken JWT、后端 jwtVerify） ✅

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
- [LockScreen.md](./LockScreen.md) - 锁屏界面 ✅
- [TerminalAPI.md](./TerminalAPI.md) - 终端 API（CLI 程序使用） ✅

### 文件系统
- [Disk.md](./Disk.md) - 虚拟磁盘管理 ✅
- [NodeTree.md](./NodeTree.md) - 文件树结构 ✅
- [FileFramework.md](./FileFramework.md) - 文件对象模板 ✅

### 驱动层
- [AnimateManager.md](./AnimateManager.md) - 动画管理 ✅
- [NetworkManager.md](./NetworkManager.md) - 网络管理 ✅
- [NetworkPort.md](./NetworkPort.md) - TCP 端口监听和管理 ✅
- [LStorage.md](./LStorage.md) - 本地存储 ✅
- [CacheDrive.md](./CacheDrive.md) - 缓存驱动（统一缓存管理、生命周期管控） ✅
- [DragDrive.md](./DragDrive.md) - 拖拽驱动 ✅
- [GeographyDrive.md](./GeographyDrive.md) - 地理位置驱动 ✅
- [SpeechDrive.md](./SpeechDrive.md) - 语音识别驱动（基于 Web Speech API） ✅
- [CryptDrive.md](./CryptDrive.md) - 加密驱动 ✅
- [MultithreadingDrive.md](./MultithreadingDrive.md) - 多线程驱动 ✅
- [ScheduleTaskManager.md](./ScheduleTaskManager.md) - 计划任务管理器 ✅

### 后端服务管理
- [SystemInformation.md](./SystemInformation.md) - 系统信息和后端服务 URL 构建 ✅

**后端 HTTP 接口文档**（FSDirve、CompressionDirve、DISKMANAGER、BrowserProxy、ImageProxy）见 [docs/INTERFACE/](../INTERFACE/README.md)

### 信号系统
- [Pool.md](./Pool.md) - 全局对象池 ✅
- [DependencyConfig.md](./DependencyConfig.md) - 依赖管理和模块加载 ✅

### 启动引导
- [Starter.md](./Starter.md) - 内核启动器 ✅

### 应用程序资源
- [ApplicationAssetManager.md](./ApplicationAssetManager.md) - 应用程序资源管理 ✅

### 系统扩展
- [LanguagesExpansion.md](./LanguagesExpansion.md) - 语言包管理器（加载/设置语言、按常量名获取文本） ✅
- [ServerExpansion.md](./ServerExpansion.md) - 服务扩展（D/server 服务模块管理、start/stop 生命周期） ✅

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

**异常处理**
- ExceptionHandler

**用户界面**
- GUIManager
- NotificationManager
- TaskbarManager
- ThemeManager
- EventManager
- ContextMenuManager
- DesktopManager
- LockScreen
- TerminalAPI

**用户控制**
- UserControl
- UserGroup

**安全与鉴权**
- RandomSecurity（JWT 生成、后端 jwtVerify、NetworkManager JWT 注入规则、User JWT 必须携带 upid）

**文件系统**
- Disk
- NodeTree
- FileFramework

**系统服务**
- AnimateManager
- NetworkManager
- NetworkPort (TCP 端口监听和管理)
- LStorage
- CacheDrive
- PermissionManager
- DragDrive
- GeographyDrive
- SpeechDrive
- CryptDrive
- MultithreadingDrive
- ScheduleTaskManager
- SystemInformation (系统信息和后端服务管理)
- 后端接口（含 JWT、文件、磁盘、代理、网络、权限等）→ [INTERFACE/](../INTERFACE/README.md)

**基础设施**
- Pool
- DependencyConfig
- Starter
- ApplicationAssetManager
- ExceptionHandler

**系统扩展**
- LanguagesExpansion（语言包管理器）
- ServerExpansion（D/server 服务模块管理）

## 文档状态

- ✅ API 文档索引已覆盖当前 docs/API 目录内的模块；如发现断链或与实现不一致，请提交修订

## 其他文档

- [ZOMInstall.md](./ZOMInstall.md) - ZOM 程序包格式、zompkg 打包、zominstall 安装（本地开发可用 dev/toolkit/zompkg.ps1）
- [PLUGINS/README.md](../PLUGINS/README.md) - 扩展与插件索引（语言包等）
- [PLUGINS/LanguagePack.md](../PLUGINS/LanguagePack.md) - 语言包格式说明（存放位置与 JSON 格式）
- [SERVER/README.md](../SERVER/README.md) - 服务文档索引（D/server 服务模块与各服务说明）
- [SERVER/ServiceModule.md](../SERVER/ServiceModule.md) - 服务模块编写指南（D/server）
- [TERMINAL_COMMANDS.md](../TERMINAL_COMMANDS.md) - 终端命令参考（完整的命令列表和使用说明）

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [RandomSecurity.md](./RandomSecurity.md) - JWT 鉴权与注入规则

