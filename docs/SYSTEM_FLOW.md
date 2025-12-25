# ZerOS 系统流程文档

本文档详细描述 ZerOS 虚拟操作系统的核心流程，包括系统启动、程序启动、程序结束、程序与内核交互以及权限控制等关键流程。

---

## 📑 目录

### 核心流程

1. [系统启动流程](#1-系统启动流程)
   - [HTML 加载阶段](#html-加载阶段)
   - [BootLoader 初始化](#bootloader-初始化)
   - [内核初始化](#内核初始化)
   - [内核自检](#内核自检)
   - [显示锁屏界面](#显示锁屏界面)
   - [进入系统](#进入系统)

2. [程序启动流程](#2-程序启动流程)
   - [接收启动请求](#接收启动请求)
   - [验证程序存在](#验证程序存在)
   - [权限检查](#权限检查)
   - [多实例检查](#多实例检查)
   - [分配 PID](#分配-pid)
   - [加载程序资源](#加载程序资源)
   - [检查程序类型](#检查程序类型)
   - [注册程序权限](#注册程序权限)
   - [调用程序初始化](#调用程序初始化)

3. [程序结束流程](#3-程序结束流程)
   - [接收终止请求](#接收终止请求)
   - [调用程序退出方法](#调用程序退出方法)
   - [清理关联资源](#清理关联资源)
   - [释放内存](#释放内存)
   - [更新进程状态](#更新进程状态)

4. [程序与内核交互流程](#4-程序与内核交互流程)
   - [程序调用内核 API](#程序调用内核-api)
   - [权限检查](#权限检查-1)
   - [路由到对应模块](#路由到对应模块)
   - [调用模块方法](#调用模块方法)

5. [权限控制流程](#5-权限控制流程)
   - [权限声明阶段](#权限声明阶段)
   - [权限注册阶段](#权限注册阶段)
   - [权限检查阶段](#权限检查阶段)
   - [权限验证阶段](#权限验证阶段)
   - [权限审计](#权限审计)

---

## 🔗 相关文档

### 📚 核心文档

- [📖 文档中心](./README.md) - ZerOS 文档索引和导航
- [🚀 项目 README](../README.md) - 项目概览、快速开始、系统架构
- [👨‍💻 开发者指南](./DEVELOPER_GUIDE.md) - 完整的程序开发指南
- [🏗️ 内核文档](./ZEROS_KERNEL.md) - 深入理解 ZerOS 内核架构

### 🔧 API 参考文档

#### 核心系统 API

- [ProcessManager](./API/ProcessManager.md) - 进程生命周期管理
- [EventManager](./API/EventManager.md) - 统一的事件处理系统
- [GUIManager](./API/GUIManager.md) - GUI 窗口管理
- [PermissionManager](./API/PermissionManager.md) - 权限管理、审计、统计
- [KernelLogger](./API/KernelLogger.md) - 统一的日志记录

#### 系统启动相关

- [Starter](./API/Starter.md) - 系统启动和初始化
- [DependencyConfig](./API/DependencyConfig.md) - 模块依赖管理
- [Pool](./API/Pool.md) - 程序间数据共享
- [LockScreen](./API/LockScreen.md) - 锁屏界面（Windows 11 风格登录界面）
- [UserControl](./API/UserControl.md) - 用户控制系统（多用户管理、权限控制）

#### 存储与内存 API

- [LStorage](./API/LStorage.md) - 系统注册表和程序数据存储
- [KernelMemory](./API/KernelMemory.md) - 内核数据持久化
- [MemoryManager](./API/MemoryManager.md) - 进程内存分配和监控
- [CacheDrive](./API/CacheDrive.md) - 统一缓存管理、生命周期管控

#### 应用程序管理

- [ApplicationAssetManager](./API/ApplicationAssetManager.md) - 应用资源管理

### 📖 完整 API 文档列表

查看 [API 文档索引](./API/README.md) 获取所有 API 的完整列表。

---

## 1. 系统启动流程

```
┌─────────────────────────────────────────────────────────────┐
│                    系统启动流程 (BootLoader)                   │
└─────────────────────────────────────────────────────────────┘

HTML 加载阶段
├─ 加载 KernelLogger (日志系统)
├─ 加载 DependencyConfig (依赖管理器)
└─ 加载 POOL (对象池)

BootLoader 初始化
├─ 等待核心模块就绪
│  ├─ 验证 KernelLogger
│  ├─ 验证 DependencyConfig
│  └─ 验证 POOL
│
├─ 初始化对象池
│  ├─ 创建 KERNEL_GLOBAL_POOL
│  ├─ 设置系统加载标志位
│  ├─ 注册 Dependency 实例
│  └─ 设置工作空间路径
│
└─ 按依赖顺序加载模块
   ├─ 第一层：枚举管理器
   │  └─ enumManager.js
   │
   ├─ 第二层：类型枚举
   │  ├─ logLevel.js
   │  ├─ addressType.js
   │  └─ fileType.js
   │
   ├─ 第三层：文件系统
   │  ├─ fileFramework.js
   │  ├─ disk.js
   │  └─ nodeTree.js
   │
   ├─ 第四层：内存管理
   │  ├─ heap.js
   │  ├─ shed.js
   │  ├─ memoryManager.js
   │  ├─ kernelMemory.js
   │  └─ memoryUtils.js
   │
   ├─ 第五层：进程管理
   │  ├─ applicationAssets.js
   │  ├─ applicationAssetManager.js
   │  ├─ programCategories.js
   │  └─ processManager.js
   │
   ├─ 第六层：事件系统
   │  └─ eventManager.js
   │
   ├─ 第七层：GUI 系统
   │  ├─ guiManager.js
   │  ├─ contextMenuManager.js
   │  ├─ taskbarManager.js
   │  ├─ notificationManager.js
   │  └─ desktop.js
   │
   ├─ 第八层：文件系统初始化
   │  └─ init.js
   │
   ├─ 第九层：网络与动态模块
   │  ├─ networkManager.js
   │  ├─ dynamicManager.js
   │  └─ SystemInformation.js
   │
   ├─ 第十层：本地存储
   │  └─ LStorage.js
   │
   ├─ 第十一层：主题与用户控制
   │  ├─ themeManager.js
   │  ├─ userControl.js
   │  └─ lockscreen.js
   │
   └─ 第十二层：权限与驱动
      ├─ permissionManager.js
      ├─ animateManager.js
      ├─ multithreadingDrive.js
      ├─ dragDrive.js
      ├─ geographyDrive.js
      ├─ cacheDrive.js
      ├─ cryptDrive.js
      └─ speechDrive.js

内核初始化
├─ 初始化事件管理器
│  └─ EventManager.init()
│
├─ 初始化进程管理器
│  ├─ ProcessManager.init()
│  ├─ 注册 Exploit 程序 (PID: 10000)
│  └─ 标记为系统进程
│
├─ 验证文件系统
│  ├─ 等待 Disk.canUsed = true
│  └─ 检查磁盘分区状态
│
└─ 验证核心模块
   ├─ 检查所有必需模块已加载
   ├─ 验证 Exploit 程序已注册
   ├─ 验证内核内存就绪
   └─ 生成初始化报告

内核自检
├─ 核心模块检查
│  ├─ KernelLogger
│  ├─ DependencyConfig
│  └─ POOL
│
├─ 枚举管理器检查
│  ├─ EnumManager
│  ├─ FileType
│  ├─ LogLevel
│  └─ AddressType
│
├─ 文件系统检查
│  ├─ Disk
│  ├─ NodeTreeCollection
│  ├─ FileFramework
│  └─ LStorage
│
├─ 内存管理检查
│  ├─ MemoryManager
│  ├─ Heap
│  ├─ Shed
│  └─ KernelMemory
│
├─ 进程管理检查
│  ├─ ProcessManager
│  └─ ApplicationAssetManager
│
├─ GUI 管理检查
│  ├─ GUIManager
│  ├─ ThemeManager
│  ├─ DesktopManager
│  ├─ TaskbarManager
│  ├─ NotificationManager
│  ├─ PermissionManager
│  ├─ ContextMenuManager
│  └─ EventManager
│
├─ 其他模块检查
│  ├─ NetworkManager
│  ├─ SystemInformation
│  ├─ DynamicManager
│  ├─ MultithreadingDrive
│  ├─ DragDrive
│  ├─ GeographyDrive
│  ├─ CacheDrive
│  └─ CryptDrive
│
└─ 浏览器环境检查
   ├─ localStorage
   ├─ document.body
   └─ window 对象

显示锁屏界面
├─ 初始化 LockScreen
│  ├─ 创建锁屏容器
│  ├─ 设置背景（随机或自定义）
│  │  ├─ 检查是否启用随机背景
│  │  │  ├─ 启用：从默认背景库随机选择
│  │  │  └─ 禁用：使用用户自定义背景
│  │  └─ 加载背景图片
│  ├─ 创建登录界面
│  │  ├─ 显示用户头像
│  │  ├─ 显示用户名
│  │  ├─ 创建密码输入框（如果用户有密码）
│  │  └─ 创建登录按钮
│  ├─ 设置键盘监听
│  │  ├─ Enter 键登录
│  │  └─ Ctrl+L 锁定屏幕
│  ├─ 初始化时间组件
│  │  ├─ 显示当前时间
│  │  └─ 每秒更新
│  └─ 初始化每日一言组件
│     ├─ 从缓存读取
│     └─ 如果缓存不存在则预加载
│
└─ 等待用户登录
   ├─ 用户选择用户（点击头像切换）
   │  └─ 显示所有可用用户列表
   │
   ├─ 用户输入密码（如果用户有密码）
   │  └─ 密码输入框显示/隐藏
   │
   ├─ 用户点击登录或按 Enter
   │  └─ 触发登录流程
   │
   └─ 验证用户凭据
      ├─ 调用 UserControl.login(username, password)
      │  ├─ 检查用户是否存在
      │  ├─ 验证密码（MD5 加密）
      │  └─ 更新最后登录时间
      │
      ├─ 登录成功
      │  ├─ 显示"登录成功"消息
      │  ├─ 删除系统加载标志位
      │  └─ 进入系统
      │
      └─ 登录失败
         ├─ 清空密码输入框
         ├─ 显示错误动画
         └─ 重新聚焦密码输入框

进入系统
├─ 隐藏锁屏界面
│  ├─ 淡出动画（500ms）
│  └─ 移除锁屏容器
│
├─ 显示桌面 (kernel-content)
│  ├─ 设置 display: flex
│  ├─ 淡入动画（500ms）
│  └─ 显示 GUI 容器和任务栏
│
├─ 更新开始菜单用户信息
│  └─ TaskbarManager._updateStartMenuUserInfo()
│
├─ 初始化任务栏
│  ├─ 延迟 500ms 初始化
│  ├─ 加载任务栏图标
│  ├─ 加载固定程序
│  └─ 显示系统托盘
│
├─ 初始化通知管理器
│  ├─ 延迟 1000ms 初始化（等待任务栏就绪）
│  ├─ 设置通知容器位置
│  └─ 加载历史通知
│
└─ 启动自动启动程序
   ├─ 从 ApplicationAssetManager 获取自动启动列表
   │  └─ 筛选 autoStart: true 的程序
   │
   ├─ 按优先级排序
   │  └─ priority 值越小优先级越高
   │
   └─ 依次启动程序
      ├─ 调用 ProcessManager.startProgram()
      ├─ 等待程序启动完成
      └─ 继续下一个程序
```

---

## 2. 程序启动流程

```
┌─────────────────────────────────────────────────────────────┐
│                   程序启动流程 (ProcessManager)                │
└─────────────────────────────────────────────────────────────┘

接收启动请求
└─ ProcessManager.startProgram(programName, initArgs)

验证程序存在
├─ 从 ApplicationAssetManager 获取程序信息
│  ├─ 获取脚本路径
│  ├─ 获取样式表列表
│  ├─ 获取资源文件列表
│  └─ 获取程序元数据
│
└─ 如果不存在，抛出错误

权限检查
├─ 检查是否为管理员专用程序
│  ├─ 如果是管理员程序
│  │  ├─ 检查当前用户是否为管理员
│  │  │  ├─ 是：继续启动
│  │  │  └─ 否：显示错误通知并拒绝启动
│  │  └─ 管理员程序列表：
│  │     ├─ regedit
│  │     ├─ kernelchecker
│  │     ├─ authenticator
│  │     └─ permissioncontrol
│  └─ 如果不是管理员程序：继续启动

多实例检查
├─ 检查程序是否支持多开
│  ├─ 从元数据获取 allowMultipleInstances
│  │
│  ├─ 如果不支持多开
│  │  ├─ 检查程序是否已在运行
│  │  │  ├─ 如果已运行
│  │  │  │  ├─ 聚焦现有窗口
│  │  │  │  └─ 返回现有 PID
│  │  │  └─ 如果未运行：继续启动
│  │  └─ 如果支持多开：继续启动

分配 PID
├─ 调用 _allocatePid()
│  ├─ 从 10001 开始分配（10000 为 Exploit 程序）
│  ├─ 检查 PID 是否已被使用
│  └─ 返回新的 PID
│
└─ 创建进程信息对象
   ├─ pid
   ├─ programName
   ├─ programNameUpper
   ├─ scriptPath
   ├─ styles
   ├─ assets
   ├─ metadata
   ├─ status: 'loading'
   ├─ startTime
   ├─ memoryRefs: Map
   ├─ domElements: Set
   ├─ isCLI: false
   └─ requestedModules: Set

注册进程
├─ 添加到进程表 (PROCESS_TABLE)
├─ 保存到 KernelMemory
├─ 清空进程表缓存
└─ 注册到 MemoryManager

加载程序资源
├─ 加载样式表
│  ├─ 遍历 styles 数组
│  ├─ 创建 <link> 标签
│  └─ 等待加载完成
│
├─ 加载资源文件
│  ├─ 遍历 assets 数组
│  ├─ 根据类型加载（图片、字体等）
│  └─ 等待加载完成
│
└─ 加载程序脚本
   ├─ 创建 <script> 标签
   ├─ 设置 src 为 scriptPath
   ├─ 添加到 document.head
   └─ 等待脚本加载完成

等待程序对象出现
├─ 检查全局对象
│  ├─ window[programNameUpper]
│  ├─ globalThis[programNameUpper]
│  └─ POOL["APPLICATION_POOL"][programNameUpper]
│
├─ 轮询检查（最多 5 秒）
│  ├─ 每 50ms 检查一次
│  └─ 最多检查 100 次
│
└─ 如果超时未找到：抛出错误

检查程序类型
├─ 调用程序的 __info__() 方法
│  ├─ 获取程序类型 (type: 'CLI' | 'GUI')
│  └─ 获取程序元数据
│
└─ 根据类型处理
   ├─ CLI 程序
   │  ├─ 标记 isCLI = true
   │  │  └─ processInfo.isCLI = true
   │  │
   │  ├─ 检查是否有终端实例
   │  │  ├─ 如果有（initArgs.terminal 存在）
   │  │  │  ├─ 使用现有终端实例
   │  │  │  ├─ 标记 launchedFromTerminal = true
   │  │  │  └─ 记录日志：从终端内启动
   │  │  │
   │  │  └─ 如果没有（从 GUI 启动）
   │  │     ├─ 创建独立终端实例
   │  │     │  ├─ 调用 ProcessManager.startProgram('terminal', {...})
   │  │     │  ├─ 设置 autoStart = true
   │  │     │  ├─ 设置 forCLI = true（标记为 CLI 程序专用终端）
   │  │     │  ├─ 设置 cliProgramName = programName
   │  │     │  ├─ 设置 cliProgramPid = pid
   │  │     │  ├─ 设置 disableTabs = true（禁用标签页功能）
   │  │     │  └─ 获取终端 PID (terminalPid)
   │  │     │
   │  │     ├─ 关联终端 PID
   │  │     │  └─ processInfo.terminalPid = terminalPid
   │  │     │
   │  │     ├─ 标记终端实例
   │  │     │  └─ 终端进程的 isCLITerminal = true
   │  │     │
   │  │     └─ 等待终端就绪（最多 3 秒）
   │  │        ├─ 检查终端进程状态
   │  │        │  └─ status === 'running'
   │  │        │
   │  │        ├─ 检查终端 API 是否可用
   │  │        │  ├─ 从 POOL 获取 TerminalAPI
   │  │        │  ├─ 调用 getActiveTerminal()
   │  │        │  └─ 获取终端实例
   │  │        │
   │  │        └─ 如果超时：记录警告但继续
   │  │
   │  └─ 保存终端实例
   │     └─ 用于传递给 __init__ 方法
   │
   └─ GUI 程序
      └─ 继续初始化（无需终端处理）

调用程序初始化
├─ 记录启动前的 DOM 快照
│  └─ _getDOMSnapshot()（用于后续跟踪程序创建的元素）
│
├─ 设置进程状态为 'starting'
│  ├─ processInfo.status = 'starting'
│  ├─ 保存进程表
│  └─ 允许在 __init__ 中调用 ProcessManager API
│
├─ 获取程序类对象
│  └─ window[programNameUpper] 或 globalThis[programNameUpper]
│
├─ 构建标准化初始化参数
│  └─ standardizedInitArgs = {
│     ├─ pid: pid
│     ├─ args: initArgs.args || []
│     ├─ env: initArgs.env || {}
│     ├─ cwd: initArgs.cwd || 'C:'
│     ├─ terminal: terminalInstance（CLI 程序）
│     ├─ metadata: initArgs.metadata || {}
│     └─ ...initArgs（保留其他自定义参数）
│  }
│
├─ 调用 __init__(pid, standardizedInitArgs)
│  ├─ 传递 PID
│  ├─ 传递标准化初始化参数
│  └─ 等待初始化完成（异步）
│
├─ 初始化成功
│  ├─ 设置 status = 'running'
│  ├─ 保存进程表
│  ├─ 清除进程表缓存
│  ├─ 标记程序创建的元素
│  │  └─ _markProgramElements(pid, domSnapshotBefore)
│  │     └─ 为新创建的 DOM 元素设置 data-pid 属性
│  ├─ 延迟更新任务栏（100ms）
│  └─ 记录日志：初始化完成
│
└─ 如果初始化失败
   ├─ 设置 status = 'exited'
   ├─ 设置 exitTime = Date.now()
   ├─ 保存进程表
   ├─ 清除进程表缓存
   ├─ 从进程表删除进程信息
   ├─ 释放内存
   └─ 抛出错误

注册程序权限（在 __init__ 之前）
├─ 获取程序信息
│  └─ 调用程序的 __info__() 方法
│
├─ 提取权限列表
│  └─ programInfo.permissions
│
└─ 调用 PermissionManager.registerProgramPermissions(pid, programInfo, options)
   ├─ 确保权限管理器已初始化
   │  └─ await PermissionManager._ensureInitialized()
   │
   ├─ 验证权限有效性
   │  └─ 检查权限是否在 PERMISSION 枚举中
   │
   ├─ 检查是否为管理员专用程序
   │  └─ options.isAdminProgram === true
   │
   ├─ 遍历权限列表
   │  └─ 对每个权限进行处理
   │
   ├─ 根据权限级别处理
   │  ├─ NORMAL（普通权限）
   │  │  ├─ 自动授予
   │  │  ├─ 添加到权限表 (_permissions)
   │  │  ├─ 记录到审计日志
   │  │  └─ 增加 granted 计数
   │  │
   │  ├─ SPECIAL（特殊权限）
   │  │  ├─ 检查是否已授予（从本地存储读取）
   │  │  │  ├─ 已授予：添加到权限表
   │  │  │  └─ 未授予：等待首次使用时请求
   │  │  ├─ 记录到审计日志
   │  │  └─ 增加 checked 计数
   │  │
   │  └─ DANGEROUS（危险权限）
   │     ├─ 如果是管理员专用程序
   │     │  ├─ 自动授予（管理员专用程序享有特权）
   │     │  ├─ 添加到权限表
   │     │  └─ 记录到审计日志（标记为管理员程序）
   │     │
   │     └─ 如果不是管理员专用程序
   │        ├─ 检查是否已授予（从本地存储读取）
   │        │  ├─ 已授予：添加到权限表
   │        │  └─ 未授予：等待首次使用时请求
   │        └─ 记录到审计日志
   │
   ├─ 保存权限到本地存储
   │  └─ LStorage.setSystemStorage('permissionManager.permissions', ...)
   │
   └─ 记录注册结果
      ├─ 记录授予的权限数量
      └─ 记录危险权限数量（如果是管理员程序）

标记 DOM 元素
├─ 创建 MutationObserver（可选）
│  └─ 监听程序创建的 DOM 元素
│
├─ 标记已存在的 DOM 元素
│  └─ 设置 data-pid 属性
│
└─ 添加到 domElements Set

更新进程状态
├─ 设置 status = 'running'
├─ 保存进程表
└─ 更新任务栏

完成启动
└─ 返回 PID
```

---

## 3. 程序结束流程

```
┌─────────────────────────────────────────────────────────────┐
│                   程序结束流程 (ProcessManager)                  │
└─────────────────────────────────────────────────────────────┘

接收终止请求
└─ ProcessManager.killProgram(pid, force)

验证进程存在
├─ 从进程表获取进程信息
│  └─ PROCESS_TABLE.get(pid)
│
└─ 如果不存在：返回 false

检查进程状态
├─ 如果状态为 'exited'
│  ├─ 检查是否还有窗口
│  │  ├─ 如果有窗口：继续清理（force = true）
│  │  └─ 如果没有窗口：返回 false
│  └─ 如果 force = false：返回 false

调用程序退出方法
├─ 设置状态为 'exiting'（防止递归调用）
│
├─ 获取程序类对象
│  └─ window[programNameUpper] 或 globalThis[programNameUpper]
│
└─ 调用 __exit__(pid, force)
   ├─ 传递 PID
   ├─ 传递 force 标志
   └─ 等待退出完成
      ├─ 如果失败且 force = false：抛出错误
      └─ 如果失败且 force = true：继续清理

清理关联资源
├─ CLI 程序处理
│  ├─ 如果创建了独立终端
│  │  └─ 关闭关联终端 (killProgram(terminalPid))
│  │
│  └─ 如果是 CLI 程序专用终端
│     └─ 关闭关联的 CLI 程序
│
├─ GUI 元素清理
│  ├─ 获取程序的所有窗口
│  │  └─ GUIManager.getWindowsByPid(pid)
│  │
│  ├─ 注销所有窗口
│  │  └─ GUIManager.unregisterWindow(windowId)
│  │
│  └─ 清理其他 GUI 元素
│     └─ _cleanupGUI(pid)
│
├─ 上下文菜单清理
│  └─ ContextMenuManager.unregisterContextMenu(pid)
│
├─ 桌面组件清理
│  └─ DesktopManager.cleanupProgramComponents(pid)
│
├─ 拖拽会话清理
│  └─ DragDrive.cleanupProcessDrags(pid)
│
├─ 通知清理
│  └─ NotificationManager.cleanupProgramNotifications(pid)
│     ├─ 清理依赖类型通知
│     └─ 保留快照类型通知（触发关闭回调）
│
├─ 事件处理器清理
│  └─ EventManager.unregisterAllHandlersForPid(pid)
│
├─ 权限清理
│  └─ PermissionManager.clearProgramPermissions(pid)
│
├─ 多线程资源清理
│  └─ MultithreadingDrive.cleanupProcessThreads(pid)
│
└─ 语音识别会话清理
   └─ SpeechDrive.cleanupProcess(pid)

释放内存
├─ 释放进程内存
│  └─ MemoryManager.freeMemory(pid)
│
├─ 清理内存引用
│  └─ processInfo.memoryRefs.clear()
│
└─ 清理动态模块
   └─ 清理 requestedModules Set

清理 DOM 元素
├─ 清理 DOM 元素集合
│  └─ processInfo.domElements.clear()
│
└─ 停止 DOM 观察器
   └─ mutationObserver.disconnect()

更新进程状态
├─ 设置 status = 'exited'
├─ 设置 exitTime = Date.now()
├─ 保存进程表到 KernelMemory
└─ 清除 PID 缓存

通知任务栏
└─ TaskbarManager.update()
   └─ 延迟 50ms 更新（确保状态已保存）

完成终止
└─ 返回 true

强制终止处理
└─ 如果发生错误且 force = true
   ├─ 跳过 __exit__ 调用
   ├─ 直接清理所有资源
   ├─ 更新进程状态
   └─ 返回 true
```

---

## 4. 程序与内核交互流程

```
┌─────────────────────────────────────────────────────────────┐
│              程序与内核交互流程 (callKernelAPI)               │
└─────────────────────────────────────────────────────────────┘

程序调用内核 API
└─ ProcessManager.callKernelAPI(pid, apiName, args)

验证进程
├─ 检查进程是否存在
│  └─ PROCESS_TABLE.get(pid)
│
└─ 如果不存在：抛出错误

检查是否为 Exploit 程序
├─ 检查 processInfo.isExploit
│  ├─ 如果是 Exploit 程序（PID = 10000）
│  │  ├─ 跳过权限检查
│  │  ├─ 直接调用 _executeKernelAPI()
│  │  └─ 返回结果
│  │
│  └─ 如果不是 Exploit 程序：继续权限检查
│
└─ 检查进程状态
   └─ 如果状态不是 'running'：抛出错误

权限检查
├─ 解析 API 名称
│  └─ 格式：'ModuleName.methodName'
│
├─ 获取所需权限
│  └─ 根据 API 名称映射到权限
│
└─ 调用 PermissionManager.checkAndRequestPermission()
   ├─ 检查是否已有权限
   │  ├─ 检查权限缓存（5 秒 TTL）
   │  └─ 检查权限表
   │
   ├─ 如果没有权限
   │  ├─ 检查权限级别
   │  │  ├─ NORMAL: 自动授予
   │  │  ├─ SPECIAL: 弹出权限请求对话框
   │  │  └─ DANGEROUS: 弹出权限请求对话框（需要管理员）
   │  │
   │  ├─ 用户选择
   │  │  ├─ 允许：授予权限并继续
   │  │  └─ 拒绝：抛出权限错误
   │  │
   │  └─ 保存权限决策
   │     └─ 持久化到本地存储
   │
   └─ 如果有权限：继续执行

路由到对应模块
├─ 调用 _executeKernelAPI(apiName, args, pid)
│
├─ 解析 API 名称
│  └─ 格式：'ModuleName.methodName'
│     ├─ 示例：'Cache.get' → 模块: 'Cache', 方法: 'get'
│     └─ 示例：'Disk.read' → 模块: 'Disk', 方法: 'read'
│
├─ 获取模块实例
│  ├─ 从 POOL 获取（优先）
│  │  └─ POOL.__GET__("KERNEL_GLOBAL_POOL", moduleName)
│  │
│  └─ 或从全局对象获取（降级）
│     ├─ window[moduleName]
│     └─ globalThis[moduleName]
│
└─ 如果模块不存在：抛出错误

调用模块方法
├─ 解析方法名称
│  └─ 从 apiName 提取方法名
│
├─ 检查方法是否存在
│  └─ typeof module[methodName] === 'function'
│
└─ 调用方法
   ├─ 传递参数
   │  └─ args 数组展开为方法参数
   │
   ├─ 传递 PID（如果需要）
   │  └─ 某些 API 需要 PID 进行权限验证或资源管理
   │
   ├─ 处理返回值
   │  ├─ 同步方法：直接返回结果
   │  └─ 异步方法：返回 Promise，等待结果
   │
   └─ 错误处理
      ├─ 捕获方法执行错误
      └─ 包装为统一的错误格式

记录程序行为
└─ ProcessManager._logProgramAction()
   ├─ 记录 API 调用
   ├─ 记录参数
   └─ 记录时间戳

返回结果
└─ 返回 API 调用结果

常见内核 API 调用示例
├─ 文件系统操作
│  ├─ callKernelAPI(pid, 'Disk.read', [path])
│  ├─ callKernelAPI(pid, 'Disk.write', [path, data])
│  └─ callKernelAPI(pid, 'Disk.list', [path])
│
├─ 内存操作
│  ├─ callKernelAPI(pid, 'MemoryManager.allocateMemory', [heapSize, shedSize])
│  └─ callKernelAPI(pid, 'MemoryManager.freeMemory', [pid])
│
├─ GUI 操作
│  ├─ callKernelAPI(pid, 'GUIManager.registerWindow', [pid, window, options])
│  └─ callKernelAPI(pid, 'GUIManager.unregisterWindow', [windowId])
│
├─ 存储操作
│  ├─ callKernelAPI(pid, 'LStorage.setSystemStorage', [key, value])
│  └─ callKernelAPI(pid, 'LStorage.getSystemStorage', [key])
│
├─ 缓存操作
│  ├─ callKernelAPI(pid, 'Cache.set', [key, value, options])
│  ├─ callKernelAPI(pid, 'Cache.get', [key, defaultValue, options])
│  └─ callKernelAPI(pid, 'Cache.delete', [key, options])
│
└─ 网络操作
   ├─ callKernelAPI(pid, 'NetworkManager.request', [url, options])
   └─ callKernelAPI(pid, 'NetworkManager.getConnectionInfo', [])
```

---

## 5. 权限控制流程

```
┌─────────────────────────────────────────────────────────────┐
│                   权限控制流程 (PermissionManager)             │
└─────────────────────────────────────────────────────────────┘

权限声明阶段
└─ 程序在 __info__() 中声明权限
   └─ 返回 { permissions: [...] }

权限注册阶段
└─ ProcessManager 调用 PermissionManager.registerProgramPermissions(pid, programInfo, options)
   ├─ 确保权限管理器已初始化
   │  └─ await PermissionManager._ensureInitialized()
   │
   ├─ 提取权限列表
   │  ├─ 从 programInfo.permissions 获取
   │  └─ 如果为空：记录日志并返回
   │
   ├─ 检查是否为管理员专用程序
   │  └─ options.isAdminProgram === true
   │     └─ 管理员专用程序享有特权，自动授予危险权限
   │
   ├─ 遍历权限列表
   │  └─ 对每个权限进行处理
   │
   ├─ 检查权限有效性
   │  └─ 验证权限名称是否在 PERMISSION 枚举中
   │     └─ 如果无效：记录警告并跳过
   │
   ├─ 根据权限级别处理
   │  ├─ NORMAL（普通权限）
   │  │  ├─ 自动授予
   │  │  ├─ 添加到权限表 (_permissions.get(pid).add(permission))
   │  │  ├─ 记录到审计日志
   │  │  └─ 增加 granted 计数
   │  │
   │  ├─ SPECIAL（特殊权限）
   │  │  ├─ 检查是否已授予（从本地存储读取）
   │  │  │  ├─ 已授予：添加到权限表
   │  │  │  └─ 未授予：等待首次使用时请求（不添加到权限表）
   │  │  ├─ 记录到审计日志
   │  │  └─ 增加 checked 计数
   │  │
   │  └─ DANGEROUS（危险权限）
   │     ├─ 如果是管理员专用程序
   │     │  ├─ 自动授予（管理员专用程序享有特权）
   │     │  ├─ 添加到权限表
   │     │  ├─ 记录到审计日志（标记为管理员程序）
   │     │  └─ 增加 dangerousGranted 计数
   │     │
   │     └─ 如果不是管理员专用程序
   │        ├─ 检查是否已授予（从本地存储读取）
   │        │  ├─ 已授予：添加到权限表
   │        │  └─ 未授予：等待首次使用时请求（不添加到权限表）
   │        └─ 记录到审计日志
   │
   ├─ 保存权限到本地存储
   │  └─ LStorage.setSystemStorage('permissionManager.permissions', ...)
   │     └─ 序列化权限表（Map<pid, Set<permission>> → Object）
   │
   └─ 记录注册结果
      ├─ 记录授予的权限数量
      ├─ 记录危险权限数量（如果是管理员程序）
      └─ 记录到内核日志

权限检查阶段
└─ 程序调用内核 API 时触发权限检查

检查流程
├─ PermissionManager.hasPermission(pid, permission)
│  ├─ 检查是否为 Exploit 程序
│  │  ├─ 如果是 PID = 10000：直接返回 true
│  │  └─ 如果不是：继续检查
│  │
│  ├─ 检查权限缓存
│  │  ├─ 查找缓存键：`${pid}_${permission}`
│  │  ├─ 检查缓存是否过期（5 秒 TTL）
│  │  │  ├─ 未过期：返回缓存结果
│  │  │  └─ 已过期：继续检查
│  │  └─ 如果缓存不存在：继续检查
│  │
│  ├─ 检查权限表
│  │  └─ _permissions.get(pid)?.has(permission)
│  │
│  └─ 返回检查结果
│
└─ PermissionManager.checkAndRequestPermission(pid, permission)
   ├─ 检查是否已有权限
   │  ├─ 调用 hasPermission()
   │  └─ 如果已有权限：返回 true
   │
   ├─ 检查并发请求去重
   │  ├─ 查找待处理的权限检查
   │  │  └─ _pendingPermissionChecks.get(`${pid}_${permission}`)
   │  │
   │  └─ 如果存在：等待现有请求完成
   │
   ├─ 获取权限级别
   │  └─ PERMISSION_LEVEL_MAP[permission]
   │
   ├─ 根据权限级别处理
   │  ├─ NORMAL（普通权限）
   │  │  ├─ 自动授予
   │  │  ├─ 添加到权限表 (_permissions)
   │  │  ├─ 更新权限缓存（5 秒 TTL）
   │  │  ├─ 记录到审计日志
   │  │  ├─ 更新统计信息（granted++, checked++）
   │  │  └─ 返回 true
   │  │
   │  ├─ SPECIAL（特殊权限）
   │  │  ├─ 检查用户级别（UserControl.isAdmin()）
   │  │  │  ├─ 普通用户：可以授权
   │  │  │  └─ 管理员：可以授权
   │  │  │
   │  │  ├─ 检查是否已授予（从本地存储读取）
   │  │  │  ├─ 已授予：添加到权限表，更新缓存，返回 true
   │  │  │  └─ 未授予：继续请求流程
   │  │  │
   │  │  ├─ 弹出权限请求对话框（GUIManager.showPermissionDialog）
   │  │  │  ├─ 显示程序名称和图标
   │  │  │  ├─ 显示权限名称和描述
   │  │  │  ├─ 显示权限级别（特殊权限）
   │  │  │  ├─ 提供"允许"和"拒绝"按钮
   │  │  │  └─ 可选："记住选择"复选框
   │  │  │
   │  │  ├─ 用户选择
   │  │  │  ├─ 允许
   │  │  │  │  ├─ 授予权限
   │  │  │  │  ├─ 添加到权限表
   │  │  │  │  ├─ 保存到本地存储（如果选择记住）
   │  │  │  │  ├─ 更新权限缓存
   │  │  │  │  ├─ 记录到审计日志
   │  │  │  │  ├─ 更新统计信息
   │  │  │  │  └─ 返回 true
   │  │  │  │
   │  │  │  └─ 拒绝
   │  │  │     ├─ 记录到审计日志
   │  │  │     ├─ 更新统计信息（denied++, checked++）
   │  │  │     └─ 返回 false
   │  │  │
   │  │  └─ 如果用户关闭对话框
   │  │     └─ 视为拒绝
   │  │
   │  └─ DANGEROUS（危险权限）
   │     ├─ 检查用户级别（UserControl.isAdmin()）
   │     │  ├─ 普通用户：拒绝授权
   │     │  │  ├─ 显示错误提示（需要管理员权限）
   │     │  │  ├─ 记录到审计日志（标记为权限不足）
   │     │  │  ├─ 更新统计信息（denied++, checked++）
   │     │  │  └─ 返回 false
   │     │  │
   │     │  └─ 管理员：可以授权
   │     │     ├─ 检查是否已授予（从本地存储读取）
   │     │     │  ├─ 已授予：添加到权限表，更新缓存，返回 true
   │     │     │  └─ 未授予：继续请求流程
   │     │     │
   │     │     ├─ 检查高风险权限列表
   │     │     │  └─ 某些权限需要额外验证
   │     │     │
   │     │     ├─ 弹出权限请求对话框（带警告）
   │     │     │  ├─ 显示警告图标和警告信息
   │     │     │  ├─ 显示程序名称和图标
   │     │     │  ├─ 显示权限名称和详细风险说明
   │     │     │  ├─ 显示权限级别（危险权限）
   │     │     │  ├─ 提供"允许"和"拒绝"按钮
   │     │     │  └─ 可选："记住选择"复选框
   │     │     │
   │     │     ├─ 用户选择
   │     │     │  ├─ 允许
   │     │     │  │  ├─ 授予权限
   │     │     │  │  ├─ 添加到权限表
   │     │     │  │  ├─ 保存到本地存储（如果选择记住）
   │     │     │  │  ├─ 更新权限缓存
   │     │     │  │  ├─ 记录到审计日志（标记为危险权限，记录管理员用户名）
   │     │     │  │  ├─ 更新统计信息
   │     │     │  │  └─ 返回 true
   │     │     │  │
   │     │     │  └─ 拒绝
   │     │     │     ├─ 记录到审计日志
   │     │     │     ├─ 更新统计信息
   │     │     │     └─ 返回 false
   │     │     │
   │     │     └─ 如果用户关闭对话框
   │     │        └─ 视为拒绝
   │     │
   │     └─ 检查高风险权限列表（UserControl.HIGH_RISK_PERMISSIONS）
   │        └─ 某些权限需要额外验证（如加密相关权限）
   │
   └─ 更新权限统计
      ├─ 增加 checked 计数
      ├─ 如果授予：增加 granted 计数
      └─ 如果拒绝：增加 denied 计数

权限验证阶段
└─ 内核 API 调用时验证权限

验证流程
├─ 解析 API 名称
│  └─ 映射到所需权限
│
├─ 调用 checkAndRequestPermission()
│  └─ 如果返回 false：抛出权限错误
│
└─ 如果返回 true：继续执行 API

权限审计
├─ 记录所有权限操作
│  ├─ 权限授予
│  ├─ 权限拒绝
│  ├─ 权限检查
│  └─ 权限违规
│
├─ 审计日志条目
│  ├─ timestamp: 时间戳
│  ├─ pid: 进程 ID
│  ├─ programName: 程序名称
│  ├─ permission: 权限名称
│  ├─ action: 操作类型（grant/deny/check/violation）
│  ├─ result: 结果（granted/denied）
│  ├─ level: 权限级别
│  ├─ reason: 原因（可选）
│  └─ context: 上下文（可选）
│
└─ 保存审计日志
   ├─ 限制日志大小（最多 10000 条）
   └─ 定期清理旧日志

权限违规处理
├─ 检测权限违规
│  ├─ 尝试使用未授予的权限
│  ├─ 尝试绕过权限检查
│  └─ 尝试修改权限系统
│
├─ 记录违规
│  ├─ 添加到违规日志
│  ├─ 记录调用栈
│  └─ 记录上下文信息
│
└─ 处理违规
   ├─ 拒绝操作
   ├─ 记录到审计日志
   └─ 可选：终止进程（严重违规）

权限持久化
├─ 保存权限决策
│  └─ LStorage.setSystemStorage('permissionManager.permissions', ...)
│
├─ 加载权限决策
│  └─ 系统启动时从本地存储加载
│
└─ 权限白名单/黑名单
   ├─ 白名单：自动授予权限的程序列表
   └─ 黑名单：禁止运行的程序列表

权限级别说明
├─ NORMAL（普通权限）
│  ├─ 自动授予，无需用户确认
│  ├─ 仅记录到审计日志
│  └─ 示例：GUI_WINDOW_CREATE, KERNEL_DISK_READ
│
├─ SPECIAL（特殊权限）
│  ├─ 首次使用时弹出权限请求对话框
│  ├─ 用户可以选择"允许"或"拒绝"
│  ├─ 决策会被保存，下次自动应用
│  └─ 示例：SYSTEM_NOTIFICATION, KERNEL_DISK_WRITE
│
└─ DANGEROUS（危险权限）
   ├─ 需要用户明确授权
   ├─ 仅管理员可以授予
   ├─ 每次使用都可能弹出权限请求对话框
   └─ 示例：PROCESS_MANAGE, SYSTEM_STORAGE_WRITE_USER_CONTROL
```

---

---

## 📝 总结

本文档详细描述了 ZerOS 虚拟操作系统的五个核心流程：

1. **系统启动流程**：从 HTML 加载到用户登录的完整启动过程
2. **程序启动流程**：从接收启动请求到程序运行的所有步骤
3. **程序结束流程**：从接收终止请求到资源清理的完整过程
4. **程序与内核交互流程**：程序如何通过 callKernelAPI 调用内核功能
5. **权限控制流程**：从权限声明到权限验证的完整权限管理流程

这些流程共同构成了 ZerOS 系统的核心运行机制，确保了系统的安全性、稳定性和可扩展性。

---

## 🔗 相关链接

### 📚 文档导航

- [📖 文档中心](./README.md) - ZerOS 文档索引和导航
- [🚀 项目 README](../README.md) - 项目概览、快速开始、系统架构
- [👨‍💻 开发者指南](./DEVELOPER_GUIDE.md) - 完整的程序开发指南
- [🏗️ 内核文档](./ZEROS_KERNEL.md) - 深入理解 ZerOS 内核架构
- [📋 API 文档索引](./API/README.md) - 所有 API 的完整列表

### 🔧 相关 API 文档

#### 核心系统

- [ProcessManager API](./API/ProcessManager.md) - 进程生命周期管理
- [PermissionManager API](./API/PermissionManager.md) - 权限管理、审计、统计
- [EventManager API](./API/EventManager.md) - 统一的事件处理系统
- [GUIManager API](./API/GUIManager.md) - GUI 窗口管理

#### 系统启动

- [Starter API](./API/Starter.md) - 系统启动和初始化
- [LockScreen API](./API/LockScreen.md) - 锁屏界面
- [UserControl API](./API/UserControl.md) - 用户控制系统

#### 存储与内存

- [LStorage API](./API/LStorage.md) - 系统注册表和程序数据存储
- [KernelMemory API](./API/KernelMemory.md) - 内核数据持久化
- [MemoryManager API](./API/MemoryManager.md) - 进程内存分配和监控

---

<div align="center">

**ZerOS 系统流程文档** - 完整描述系统核心运行机制

Made with ❤️ by ZerOS Team

</div>

