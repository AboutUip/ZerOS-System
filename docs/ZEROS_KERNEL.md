# ZerOS Kernel - 内核架构详解

本文档详细说明 ZerOS Kernel 的系统架构、模块设计和实现细节。适合想要深入了解内核设计的开发者阅读。

## 目录

- [系统架构](#系统架构)
- [启动流程](#启动流程)
- [核心模块详解](#核心模块详解)
- [数据存储架构](#数据存储架构)
- [技术实现](#技术实现)
- [项目结构](#项目结构)
- [更新日志](#更新日志)

---

## 系统架构

```
ZerOS/
├── kernel/                 # 内核模块
│   ├── bootloader/        # 启动引导
│   │   └── starter.js    # 内核启动器
│   ├── fileSystem/        # 文件系统
│   │   ├── disk.js       # 虚拟磁盘管理
│   │   ├── nodeTree.js   # 文件树结构
│   │   ├── fileFramework.js # 文件对象模板
│   │   └── init.js       # 文件系统初始化
│   ├── logger/            # 日志系统
│   │   └── kernelLogger.js # 统一日志管理
│   ├── memory/            # 内存管理
│   │   ├── memoryManager.js # 统一内存管理器
│   │   ├── heap.js       # 堆内存管理
│   │   ├── shed.js       # 栈内存管理
│   │   ├── kernelMemory.js # 内核动态数据存储
│   │   └── memoryUtils.js # 内存工具函数
│   ├── process/           # 进程管理
│   │   ├── processManager.js # 进程生命周期管理
│   │   ├── permissionManager.js # 权限管理
│   │   ├── applicationAssetManager.js # 应用程序资源管理
│   │   ├── applicationAssets.js # 应用程序资源映射
│   │   ├── guiManager.js # GUI窗口管理
│   │   ├── notificationManager.js # 通知管理
│   │   ├── taskbarManager.js # 任务栏管理
│   │   ├── themeManager.js # 主题管理
│   │   ├── eventManager.js # 事件管理
│   │   ├── contextMenuManager.js # 上下文菜单管理
│   │   ├── desktop.js    # 桌面管理
│   │   └── programCategories.js # 程序分类
│   ├── drive/             # 驱动层
│   │   ├── animateManager.js # 动画管理
│   │   ├── networkManager.js # 网络管理
│   │   ├── LStorage.js   # 本地存储
│   │   └── networkServiceWorker.js # 网络服务工作者
│   ├── signal/            # 信号系统
│   │   ├── dependencyConfig.js # 依赖管理和模块加载
│   │   └── pool.js        # 全局对象池
│   ├── dynamicModule/     # 动态模块
│   │   ├── dynamicManager.js # 动态模块管理
│   │   └── libs/          # 第三方库
│   │       ├── anime-4.2.2/ # anime.js 动画库
│   │       ├── animate.min.css # animate.css
│   │       ├── html2canvas.min.js # html2canvas
│   │       └── jquery-3.7.1.min.js # jQuery
│   ├── typePool/          # 类型池
│   │   ├── fileType.js   # 文件类型枚举
│   │   ├── logLevel.js   # 日志级别枚举
│   │   ├── addressType.js # 地址类型枚举
│   │   └── enumManager.js # 枚举管理器
│   └── SystemInformation.js # 系统信息
├── service/               # 服务端
│   └── DISK/              # 虚拟磁盘存储
│       ├── C/             # C: 盘
│       └── D/              # D: 盘
│           └── application/ # 应用程序目录
├── test/                  # 测试和界面
│   ├── application/       # 应用程序
│   │   ├── terminal/     # 终端程序
│   │   ├── vim/          # Vim文本编辑器
│   │   ├── filemanager/  # 文件管理器
│   │   ├── browser/      # 浏览器
│   │   ├── musicplayer/  # 音乐播放器
│   │   └── ...          # 其他应用程序
│   ├── main.js           # 终端主程序
│   ├── index.html        # 入口页面
│   └── core.css          # 样式文件
└── docs/                 # 文档
    ├── API/              # API文档
    │   ├── README.md     # API文档索引
    │   └── ...          # 各模块API文档
    ├── DEVELOPER_GUIDE.md # 开发者指南
    └── ZEROS_KERNEL.md   # 本文档
```

### 启动流程

1. **日志系统初始化**：加载 `KernelLogger`，建立统一日志入口
2. **依赖管理器初始化**：创建 `DependencyConfig` 实例
3. **模块依赖声明**：注册所有内核模块的依赖关系
4. **模块链接**：按依赖顺序异步加载所有模块
5. **对象池初始化**：创建全局对象池 `KERNEL_GLOBAL_POOL`
6. **进程管理器初始化**：初始化 `ProcessManager`，注册 Exploit 程序（PID 10000）
7. **GUI管理器初始化**：初始化 `GUIManager`，建立窗口管理系统
8. **通知管理器初始化**：初始化 `NotificationManager`，建立通知系统
9. **任务栏管理器初始化**：初始化 `TaskbarManager`，建立任务栏界面
10. **文件系统初始化**：初始化磁盘分区（C:、D:）
11. **自动启动程序**：启动标记为 `autoStart: true` 的程序（如终端程序）
12. **终端启动**：创建终端界面，加载用户数据

---

## 核心模块详解

### 1. 日志系统 (KernelLogger)

统一的内核日志系统，提供结构化的日志输出。

**特性**：
- 多级别日志：DEBUG (3)、INFO (2)、WARN (1)、ERROR (0)
- 结构化输出：模块名、级别、时间戳、消息
- 本地化支持：支持中英文切换
- 日志过滤：可动态调整日志级别

详细 API 文档请参考 [KernelLogger API](API/KernelLogger.md)

### 2. 内存管理 (MemoryManager)

提供堆内存和栈内存的统一管理，支持多进程内存隔离。

**堆内存 (Heap)**：
- 动态内存分配和释放
- 支持多进程独立堆空间
- 地址管理和边界检查

**栈内存 (Shed)**：
- 代码区和资源链接区
- 用于存储常量和静态数据
- 支持字符串和数值存储

**Exploit 程序（PID 10000）**：
- 作为统一的数据存储中心，管理所有内核动态数据
- 存储终端输出内容（用于 vim 等全屏程序的恢复）
- 存储剪贴板数据（copy/paste 命令）
- 存储每个终端实例的环境变量、命令历史、补全状态
- 存储内核模块的动态数据（通过 KernelMemory 接口）
- 自动分配和管理 Heap 和 Shed 内存（1MB Heap，1000 Shed）

详细 API 文档请参考 [MemoryManager API](API/MemoryManager.md) 和 [KernelMemory API](API/KernelMemory.md)

### 3. 文件系统 (FileSystem)

完整的虚拟文件系统实现，支持目录树和文件操作。

**核心组件**：

- **Disk**：虚拟磁盘管理
  - 支持多个磁盘分区（C:、D: 等）
  - 磁盘容量和空间管理
  - 自动计算已用/空闲空间

- **NodeTreeCollection**：文件树集合
  - 目录节点管理（Node）
  - 文件对象管理（FileFormwork）
  - 路径解析和导航

- **FileFormwork**：文件模板
  - 文件元信息（类型、大小、时间戳）
  - 文件内容管理
  - 读写操作

**支持的操作**：
- 创建/删除文件和目录
- 重命名文件和目录
- 移动文件和目录
- 复制文件和目录（递归）
- 文件读写
- 路径解析

**持久化存储**：
- 自动保存到 localStorage
- 启动时自动恢复
- 每个磁盘分区独立存储
- **PHP 后端支持**：所有文件操作通过 `FSDirve.php` 服务进行，文件实际存储在 `service/DISK/C/` 和 `service/DISK/D/` 目录下

详细 API 文档请参考 [Disk API](API/Disk.md) 和 [NodeTree API](API/NodeTree.md)

### 4. 进程管理 (ProcessManager)

完整的进程生命周期管理系统，负责程序的启动、运行和终止。

**特性**：
- PID 自动分配和管理
- 程序资源管理（脚本、样式、元数据）
- 程序类型识别（CLI/GUI）
- CLI 程序自动启动终端环境
- DOM 元素跟踪和清理
- 程序行为记录和日志
- 共享空间管理（`APPLICATION_SHARED_POOL`）
- 自动启动程序支持（`autoStart` 和 `priority`）
- **权限检查集成**：所有内核 API 调用都经过权限验证

**CLI 程序自动启动终端**：
- 当 CLI 程序独立启动时，如果没有终端环境，ProcessManager 会自动启动终端程序
- 终端程序作为系统内置程序，在系统启动时自动启动（`autoStart: true`）
- 确保 CLI 程序始终有可用的终端环境

详细 API 文档请参考 [ProcessManager API](API/ProcessManager.md)

### 4.1 权限管理 (PermissionManager)

ZerOS 内核的安全核心组件，负责管理所有程序的内核操作权限。

**特性**：
- **权限级别系统**：普通权限（自动授予）、特殊权限（需要用户确认）、危险权限（需要明确授权）
- **权限声明**：程序在 `__info__` 中声明所需权限
- **动态权限申请**：特殊权限首次使用时弹出权限请求对话框
- **权限持久化**：已授予的权限会被保存，下次启动时自动恢复
- **权限检查缓存**：5秒 TTL 缓存，避免重复检查
- **并发请求去重**：避免同时弹出多个权限请求对话框
- **强制权限验证**：所有需要权限的内核 API 调用都必须经过验证

详细 API 文档请参考 [PermissionManager API](API/PermissionManager.md)

### 5. 应用程序资源管理 (ApplicationAssetManager)

管理所有应用程序的资源信息，包括脚本路径、样式表和元数据。

**特性**：
- 程序资源查询和验证
- 自动启动程序列表
- 程序元数据管理
- 资源路径解析

详细 API 文档请参考 [ApplicationAssetManager API](API/ApplicationAssetManager.md)

### 6. 通知管理 (NotificationManager)

统一的系统通知管理系统，负责通知的创建、显示、管理和交互。

**特性**：
- 支持两种通知类型：`snapshot`（快照）和 `dependent`（依赖）
- 水滴展开动画效果（使用 AnimateManager）
- 通知栏面板，支持点击任务栏图标打开
- 蒙版层覆盖，自动检测鼠标离开并关闭
- 任务栏通知数量徽章显示
- 自动关闭支持（可设置时长）
- 通知内容动态更新
- **权限检查集成**：创建和删除通知都需要 `SYSTEM_NOTIFICATION` 权限

**通知类型**：
- **snapshot（快照）**：独立通知，显示标题和内容，有标题栏和关闭按钮
- **dependent（依赖）**：依赖通知，紧贴在快照通知下方，从圆形展开为矩形，用于程序持续显示的内容（如音乐播放器）

详细 API 文档请参考 [NotificationManager API](API/NotificationManager.md)

### 7. 内核动态数据存储 (KernelMemory)

提供统一接口，管理所有内核模块的动态数据，存储在 Exploit 程序的内存中。

**特性**：
- 统一的数据存取接口
- 自动内存分配和管理
- 数据序列化和反序列化
- 内存使用情况监控

**存储的数据类型**：
- `APPLICATION_SOP` - 应用程序分区管理表
- `PROGRAM_NAMES` - 程序名称映射
- `PROCESS_TABLE` - 进程表
- `NEXT_PID` - 下一个PID
- `NEXT_HEAP_ID` / `NEXT_SHED_ID` - 下一个堆/栈ID
- `DISK_SEPARATE_MAP` / `DISK_SEPARATE_SIZE` - 磁盘分区信息
- `DISK_FREE_MAP` / `DISK_USED_MAP` - 磁盘使用情况
- `DISK_CAN_USED` - 磁盘可用状态

详细 API 文档请参考 [KernelMemory API](API/KernelMemory.md)

### 8. 终端系统 (Terminal)

Bash 风格的命令行终端界面，提供完整的命令处理能力和窗口管理功能。

**特性**：
- 多标签页支持
- 命令历史记录（存储在 Exploit 程序内存中）
- Tab 自动补全（状态存储在 Exploit 程序内存中）
- 富文本输出（HTML 渲染）
- 事件驱动的命令处理
- 环境变量持久化（存储在 Exploit 程序内存中）
- 终端内容恢复（vim 退出时自动恢复）
- **窗口管理功能**：
  - 关闭窗口（通过 ProcessManager）
  - 全屏/还原切换
  - 窗口拖拽移动
  - 窗口大小拉伸（响应式）
- **TerminalAPI**：暴露到共享空间，供其他程序调用

**内置命令**：
- 文件操作：`ls`, `cd`, `tree`, `cat`, `write`, `rm`, `mv`, `copy`, `paste`, `rename`
- 目录操作：`markdir`, `markfile`
- 系统管理：`ps`, `kill`, `diskmanger`, `power`, `check`
- 编辑器：`vim`
- 工具：`clear`, `help`, `eval`, `pwd`, `whoami`

### 9. GUI 管理系统

ZerOS 提供了完整的 GUI 管理系统，包括：

- **GUIManager**：窗口管理，层叠、焦点、模态提示框
- **TaskbarManager**：任务栏管理，程序启动、多任务切换
- **NotificationManager**：通知管理，系统通知的创建和显示
- **ThemeManager**：主题管理，主题和风格的独立管理，支持 GIF 动图背景
- **EventManager**：事件管理，窗口拖动、拉伸等事件
- **ContextMenuManager**：上下文菜单管理，右键菜单系统
- **DesktopManager**：桌面管理，桌面图标和快捷方式

详细 API 文档请参考：
- [GUIManager API](API/GUIManager.md)
- [TaskbarManager API](API/TaskbarManager.md)
- [ThemeManager API](API/ThemeManager.md)
- [EventManager API](API/EventManager.md)
- [ContextMenuManager API](API/ContextMenuManager.md)
- [DesktopManager API](API/DesktopManager.md)

---

## 数据存储架构

### Exploit 程序架构

Exploit 程序（PID 10000）是 ZerOS Kernel 的统一数据存储中心，负责管理所有临时数据和终端状态。

**设计目的**：
- 集中管理所有数据存储需求
- 统一使用内核内存管理系统
- 简化数据交换和持久化逻辑
- 提供统一的内存访问接口

**存储的数据类型**：

1. **终端输出内容**
   - 用于全屏程序（如 vim）退出时恢复终端显示
   - 存储格式：JSON 序列化的 HTML 元素数组

2. **剪贴板数据**
   - copy/paste 命令使用
   - 存储文件或目录的路径和元信息

3. **终端实例数据**（按 tabId 区分）
   - 环境变量（user, host, cwd）
   - 命令历史（history 数组和 historyIndex）
   - 补全状态（visible, candidates, index, beforeText, dirPart）

**内存分配**：
- Heap ID: 1
- Shed ID: 1
- Heap Size: 200KB
- 自动初始化和管理

### 数据存储键名规范

所有存储在 Exploit 程序中的数据使用统一的键名规范：

| 键名格式 | 说明 | 示例 |
|---------|------|------|
| `TERMINAL_{tabId}_ENV` | 终端环境变量 | `TERMINAL_tab-1_ENV` |
| `TERMINAL_{tabId}_HISTORY` | 命令历史 | `TERMINAL_tab-1_HISTORY` |
| `TERMINAL_{tabId}_COMPLETION` | 补全状态 | `TERMINAL_tab-1_COMPLETION` |
| `TERMINAL_CONTENT_ADDR` | 终端输出内容地址 | `TERMINAL_CONTENT_ADDR` |
| `CLIPBOARD_ADDR` | 剪贴板数据地址 | `CLIPBOARD_ADDR` |

每个键名都有对应的 `_ADDR` 和 `_SIZE` 后缀，用于存储内存地址和大小信息。

### 数据存储实现细节

**存储流程**：
1. 数据序列化为 JSON 字符串
2. 在 Heap 中分配足够的内存空间
3. 将字符串逐字符写入 Heap
4. 在 Shed 的 `resourceLinkArea` 中保存地址和大小信息
5. 使用统一的键名规范管理

**读取流程**：
1. 从 Shed 的 `resourceLinkArea` 中读取地址信息
2. 从 Heap 中按地址读取字符串数据
3. 反序列化 JSON 字符串恢复数据
4. 返回原始数据结构

**内存管理优势**：
- 统一的内存分配和释放机制
- 自动内存回收（当数据被覆盖时）
- 完整的错误处理和边界检查
- NaN 值安全检查，防止计算错误

---

## 技术实现

### 依赖管理

系统使用 `DependencyConfig` 管理模块依赖关系：

```javascript
Dependency.addDependency("../kernel/fileSystem/nodeTree.js");
Dependency.waitLoaded("../kernel/fileSystem/disk.js", {
    interval: 50,
    timeout: 1000
});
```

详细 API 文档请参考 [DependencyConfig API](API/DependencyConfig.md)

### 全局对象池

使用 `POOL` 系统管理全局对象：

```javascript
POOL.__INIT__("KERNEL_GLOBAL_POOL");
POOL.__ADD__("KERNEL_GLOBAL_POOL", "WORK_SPACE", "C:");
POOL.__GET__("KERNEL_GLOBAL_POOL", "WORK_SPACE");
```

详细 API 文档请参考 [Pool API](API/Pool.md)

### 数据持久化

**文件系统持久化**：
- 文件系统数据自动保存到浏览器 localStorage
- 存储键格式：`filesystem_<盘符>`（如 `filesystem_C:`）
- 自动序列化和反序列化
- 启动时自动恢复
- **PHP 后端支持**：所有文件操作通过 `FSDirve.php` 服务进行，文件实际存储在 `service/DISK/C/` 和 `service/DISK/D/` 目录下

**内存数据管理**：
- 所有终端数据和临时数据存储在 Exploit 程序（PID 10000）的内存中
- 包括：命令历史、补全状态、环境变量、剪贴板、终端输出内容
- 数据按终端实例（tabId）区分，互不干扰
- 使用 Heap 存储序列化的 JSON 数据
- 使用 Shed 存储数据地址和元信息

### 日志系统

统一的日志输出格式：

```
[内核][模块名] [级别] <时间戳> - <消息> [元数据]
```


## 架构设计原则

1. **模块化**：每个功能模块独立，通过依赖注入连接
2. **日志一致性**：所有内核模块使用统一的日志系统
3. **内存安全**：完整的内存管理，支持多进程隔离，NaN 值安全检查
4. **统一数据存储**：所有内核动态数据统一使用 KernelMemory 存储在 Exploit 程序的内存中
5. **持久化**：文件系统自动保存到 localStorage，内核动态数据存储在内存中
6. **可扩展性**：支持添加新命令、新模块、新程序、新功能
7. **程序名称管理**：支持为进程注册和显示程序名称
8. **进程管理**：完整的进程生命周期管理，支持 CLI/GUI 程序
9. **自动启动**：支持程序自动启动和 CLI 程序自动启动终端环境
10. **窗口管理**：所有 GUI 程序支持窗口管理功能（关闭、全屏、拖拽、拉伸）
11. **权限系统**：所有内核 API 调用都需要相应权限，确保系统安全
12. **主题系统**：支持主题和风格的独立管理，支持 GIF 动图背景

---

## 更新日志

### 最新版本特性（v2.1）

- ✅ **天气组件**：
  - 任务栏右侧显示实时天气信息（温度、天气状况、图标）
  - 支持多主题适配，自动应用主题颜色
  - 智能缓存机制：30分钟缓存有效期，刷新操作时使用缓存数据，避免等待API响应
  - 支持点击查看详细天气信息面板
  - 自动适配任务栏位置（水平/垂直布局）
  - API失败时自动使用缓存数据作为降级方案

- ✅ **任务栏程序固定功能**：
  - 支持将程序固定到任务栏，持久化存储
  - 右键菜单快速固定/取消固定程序
  - 开始菜单和任务栏图标都支持固定操作
  - 提供完整的API：`pinProgram`、`unpinProgram`、`getPinnedPrograms`、`isPinned`、`setPinnedPrograms`
  - 固定程序列表自动保存到系统存储

- ✅ **窗口管理优化**：
  - 修复右上角拉伸窗口时的位置计算问题
  - 优化窗口拉伸逻辑，使用初始位置计算边界，避免累积误差
  - 支持精确的窗口大小调整，确保窗口不会无限位移
  - 改进多实例程序的窗口关闭逻辑

- ✅ **上下文菜单增强**：
  - 支持异步菜单项生成（动态检查程序固定状态）
  - 开始菜单程序右键菜单支持"固定到任务栏"/"取消任务栏固定"
  - 任务栏图标右键菜单支持"固定到任务栏"/"取消任务栏固定"
  - 修复多实例程序导致的菜单重复问题

- ✅ **GUI资源清理优化**：
  - 改进程序退出时的GUI资源清理逻辑
  - 确保所有DOM元素、事件监听器、对象引用正确清理
  - 修复文件管理器拖拽事件重复注册问题

### 历史版本特性

- ✅ **GIF 动图背景支持**：支持使用 GIF 动图作为桌面背景，自动循环播放
- ✅ **主题系统增强**：支持本地图片（JPG、PNG、GIF、WebP 等）作为桌面背景，自动持久化保存
- ✅ **check 命令**：全面的内核自检功能，检查核心模块、文件系统、内存管理、进程管理、GUI 管理、主题系统等
- ✅ **多任务切换器**：Ctrl + 鼠标左键打开全屏多任务选择器，支持鼠标滚轮选择
- ✅ **上下文菜单系统**：完整的右键菜单管理，支持程序注册自定义菜单
- ✅ **事件管理系统**：统一的窗口拖动、拉伸事件管理
- ✅ **通知管理系统**：完整的通知创建、显示、管理功能，支持快照和依赖类型通知
- ✅ **通知栏面板**：点击任务栏图标打开，支持水滴展开动画
- ✅ **任务栏通知徽章**：实时显示通知数量
- ✅ **权限管理系统**：完整的内核操作权限管理，确保系统安全
- ✅ **PHP 文件系统驱动**：所有文件操作通过 PHP 服务进行，文件实际存储在服务端

---

**ZerOS Kernel** - 一个强大的虚拟操作系统内核，在浏览器中体验完整的系统操作。
