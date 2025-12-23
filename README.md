# ZerOS - 浏览器虚拟操作系统

<div align="center">

**一个基于浏览器实现的完整虚拟操作系统内核**

[![License](https://img.shields.io/badge/license-GPL--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Browser-lightgrey.svg)](https://developer.mozilla.org/zh-CN/docs/Web/API)
[![Language](https://img.shields.io/badge/language-JavaScript-yellow.svg)](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)

</div>

---

## 📋 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [系统架构](#系统架构)
- [文档导航](#文档导航)
- [项目结构](#项目结构)
- [系统要求](#系统要求)
- [开发指南](#开发指南)
- [重要注意事项](#重要注意事项)
- [许可证](#许可证)
- [联系我们](#联系我们)

---

## 🎯 项目简介

**ZerOS** 是一个基于浏览器实现的虚拟操作系统内核，提供完整的文件系统、内存管理、进程管理、GUI 界面和丰富的应用程序生态。它模拟了真实操作系统的核心功能，为开发者提供了一个完整的虚拟操作系统开发平台。

### 项目用途

ZerOS 系统用于教学目的的浏览器虚拟内核开发项目，仅供学习、娱乐和交流使用。

### 设计理念

- **模块化架构**：内核采用模块化设计，各模块职责清晰，易于扩展和维护
- **统一管理**：所有系统资源（事件、日志、窗口、权限等）由内核统一管理
- **安全隔离**：进程间资源隔离，权限系统确保系统安全
- **开发者友好**：提供完整的 API 文档和开发指南，降低开发门槛

---

## ✨ 核心特性

### 🗂️ 文件系统
- **虚拟磁盘分区**：支持多磁盘分区（C:、D: 等），完整的目录树结构
- **PHP 后端存储**：使用 PHP 服务端实现文件持久化存储
- **文件操作 API**：完整的文件读写、目录管理、路径操作 API
- **ZIP 文件支持**：自动识别 ZIP 文件，支持压缩/解压缩操作

### 💾 内存管理
- **堆栈分离**：堆内存（Heap）和栈内存（Shed）独立管理
- **多进程隔离**：每个进程拥有独立的内存空间
- **NaN 值安全检查**：防止内存污染和安全漏洞
- **内存引用管理**：自动跟踪和清理内存引用

### 🔄 进程管理
- **完整生命周期**：进程启动、运行、终止的完整管理
- **PID 分配**：自动分配和管理进程 ID
- **资源清理**：进程退出时自动清理所有资源
- **多实例支持**：支持程序多实例运行

### 🎨 GUI 系统
- **窗口管理**：完整的窗口创建、拖动、拉伸、最小化、最大化功能
- **任务栏**：程序固定、多任务切换、通知徽章
- **通知系统**：系统级通知管理，支持多种通知类型
- **主题系统**：主题（颜色）和风格（GUI样式）独立管理
- **桌面管理**：桌面图标、组件拖拽、背景管理

### 🔐 安全系统
- **权限管理**：完整的内核操作权限控制，支持权限级别（普通/特殊/危险）
- **权限审计**：完整的权限操作审计日志和违规记录
- **权限统计**：详细的权限使用统计（授予、拒绝、检查次数）
- **黑名单/白名单**：程序黑名单和白名单管理，支持自动授予设置
- **进程隔离**：进程间资源隔离，防止相互干扰
- **加密驱动**：RSA 加密/解密、MD5 哈希、随机数生成
- **密钥管理**：密钥生命周期管理和有效期跟踪
- **用户控制系统**：多用户管理，支持三种用户级别（普通用户、管理员、默认管理员）
- **锁屏界面**：Windows 11 风格登录界面，支持密码验证、用户切换、随机背景、自定义背景、时间组件、每日一言组件

### 🛠️ 开发工具
- **终端界面**：Bash 风格的命令行终端，支持多标签页
- **内核自检**：全面的系统健康检查功能
- **日志系统**：统一的日志管理，支持多级别日志
- **事件管理**：统一的事件处理系统，支持优先级和传播控制

### 🎤 语音识别
- **Web Speech API**：基于浏览器原生语音识别功能
- **多语言支持**：支持中文、英文、日文等多种语言识别
- **持续识别**：支持持续语音识别，实时结果反馈
- **按需启用**：只在有程序使用时才启用语音识别，节省系统资源

### 🔒 锁屏系统
- **Windows 11 风格**：现代化的锁屏界面设计
- **随机背景**：支持从默认背景库随机选择锁屏背景
- **自定义背景**：支持用户选择固定锁屏背景，独立于桌面背景
- **时间组件**：可开关的时间显示组件
- **每日一言**：可开关的每日励志语句组件，智能缓存管理
- **用户切换**：支持多用户切换和密码验证

---

## 🚀 快速开始

### 环境要求

- **浏览器**：Chrome（推荐）、Edge、Firefox 等现代浏览器
- **PHP 服务**：PHP 7.0+（用于文件系统持久化）
- **Web 服务器**：Apache2（推荐）或 Nginx
- **分辨率**：推荐最小 800x600，最佳 1920x1080

### 部署步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd ZerOS
   ```

2. **配置服务器**
   - 将 `ZerOS/` 整个文件夹设置为网站根目录
   - 确保 PHP 服务正常运行（PHP 7.0+）
   - **重要**：PHP 服务端口必须使用 **8898**
   - **重要**：Web 服务端口应该为 **8089**

3. **访问系统**
   - 使用浏览器访问：`http://localhost:8089/test/index.html`
   - 首次加载可能需要几秒钟来初始化内核

4. **验证安装**
   - 打开浏览器控制台（F12），检查是否有错误
   - 系统启动后，应该能看到桌面和任务栏

5. **登录系统**
   - 管理员账号:root
   - 管理员密码(默认):200714
   - 测试用户账号:TestUser
   - 测试用户密码:无

### 注意事项

- 浏览器应该支持 localStorage API（非必须，但推荐）
- 建议使用 Chrome 浏览器以获得最佳体验
- 如果遇到问题，请检查浏览器控制台的错误信息
- 确保 PHP 服务正常运行，文件系统功能依赖 PHP 后端

---

## 🏗️ 系统架构

ZerOS Kernel 采用模块化架构，主要包含以下核心模块：

### 核心层
- **日志系统**：`KernelLogger` - 统一的日志管理
- **启动引导**：`Starter` - 内核启动器，`Pool` - 全局对象池
- **信号系统**：`DependencyConfig` - 依赖管理和模块加载

### 资源管理层
- **内存管理**：`Heap`、`Shed`、`MemoryManager`、`KernelMemory`
- **进程管理**：`ProcessManager`、`PermissionManager`、`ApplicationAssetManager`
- **文件系统**：`Disk`、`NodeTree`、`FileFormwork`

### GUI 层
- **窗口管理**：`GUIManager` - 窗口创建、拖动、拉伸、焦点管理
- **任务栏**：`TaskbarManager` - 程序固定、多任务切换、通知徽章
- **通知系统**：`NotificationManager` - 系统级通知管理
- **主题系统**：`ThemeManager` - 主题和风格管理
- **事件管理**：`EventManager` - 统一的事件处理系统
- **上下文菜单**：`ContextMenuManager` - 右键菜单管理
- **桌面管理**：`DesktopManager` - 桌面图标和组件管理
- **锁屏界面**：`LockScreen` - Windows 11 风格登录界面，支持密码验证、用户切换、随机背景、自定义背景、时间组件、每日一言组件

### 驱动层
- **动画管理**：`AnimateManager` - 动画效果管理
- **网络管理**：`NetworkManager` - 网络请求管理
- **本地存储**：`LStorage` - 本地数据持久化
- **缓存驱动**：`CacheDrive` - 统一缓存管理，生命周期管控
- **拖拽驱动**：`DragDrive` - 拖拽功能支持
- **地理位置**：`GeographyDrive` - 地理位置服务
- **语音识别**：`SpeechDrive` - 基于 Web Speech API 的语音识别功能
- **加密驱动**：`CryptDrive` - 加密功能支持
- **多线程驱动**：`MultithreadingDrive` - 多线程支持

### 服务层
- **PHP 服务**：`FSDirve.php`（文件系统驱动）、`CompressionDirve.php`（压缩驱动）

详细架构说明请参考 [内核架构文档](docs/ZEROS_KERNEL.md)

---

## 📚 文档导航

### 开发者文档
- **[开发者指南](docs/DEVELOPER_GUIDE.md)** - 完整的开发指南，包括：
  - 开发思维和核心概念
  - 快速开始教程
  - 程序结构说明
  - GUI/CLI 程序开发
  - 最佳实践和常见问题

### 架构文档
- **[内核架构](docs/ZEROS_KERNEL.md)** - 系统架构和模块设计详解

### API 文档
- **[API 文档索引](docs/API/README.md)** - 完整的 API 参考文档
  - 核心模块 API
  - GUI 管理 API
  - 文件系统 API
  - 驱动层 API

### 安全文档
- **[安全漏洞报告中心](VULN/README.md)** - 系统安全漏洞报告和修复状态
  - 漏洞统计和列表
  - 漏洞详细报告（CVS-ZEROS 编号）
  - 修复优先级和状态
  - 安全建议和最佳实践

---

## ⚙️ 系统要求

### 浏览器要求
- **推荐**：Chrome 90+、Edge 90+、Firefox 88+
- **最低**：支持 ES6+、localStorage、Fetch API 的现代浏览器
- **分辨率**：推荐最小 800x600，最佳 1920x1080

### 服务端要求
- **PHP**：PHP 7.0+（必须，用于文件系统持久化）
- **Web 服务器**：Apache2（推荐）或 Nginx
- **端口配置**：
  - PHP 服务端口：**8898**（必须）
  - Web 服务端口：**8089**（推荐）

### 存储要求
- **浏览器 localStorage**：用于系统配置和缓存（非必须，但推荐）
- **服务端存储**：PHP 文件系统用于文件持久化（必须）

---

## 👨‍💻 开发指南

### 快速开始开发

1. **阅读开发者指南**：查看 [开发者指南](docs/DEVELOPER_GUIDE.md) 了解开发流程
2. **查看示例程序**：参考 `service/DISK/D/application/` 目录下的示例程序
3. **查阅 API 文档**：查看 [API 文档索引](docs/API/README.md) 了解可用 API

### 开发工具

- **终端**：使用系统内置终端进行命令行操作
- **内核自检**：使用 `check` 命令进行系统健康检查
- **日志查看**：使用浏览器控制台（F12）查看系统日志

### 推荐阅读顺序

1. [文档中心](docs/README.md) - 了解文档结构
2. [开发者指南](docs/DEVELOPER_GUIDE.md) - 学习开发流程
3. [API 文档](docs/API/README.md) - 查阅具体 API

---

## ⚠️ 重要注意事项

### 必须遵守的开发规范

#### 1. 事件管理
**所有事件处理必须通过内核的 `EventManager` 进行统一管理**

```javascript
// ✅ 正确：使用 EventManager
EventManager.registerEventHandler(this.pid, 'click', handler, {
    priority: 100,
    selector: '.my-button'
});

// ❌ 错误：直接使用 addEventListener（会被警告）
element.addEventListener('click', handler);
```

**原因**：
- 统一管理所有事件，支持事件优先级和传播控制
- 进程退出时自动清理事件监听器，防止内存泄漏
- 提供统一的事件传播控制 API

**详细说明**：请参考 [EventManager API 文档](docs/API/EventManager.md)

#### 2. 日志记录
**所有日志输出必须通过内核的 `KernelLogger` 进行统一管理**

```javascript
// ✅ 正确：使用 KernelLogger
KernelLogger.info('MYAPP', '程序启动');
KernelLogger.warn('MYAPP', '警告信息');
KernelLogger.error('MYAPP', '错误信息', error);

// ❌ 错误：直接使用 console.log（不推荐）
console.log('程序启动');
```

**原因**：
- 统一的日志格式，便于调试和问题排查
- 支持日志级别过滤，控制日志输出
- 结构化日志，包含模块名、时间戳等信息

**详细说明**：请参考 [KernelLogger API 文档](docs/API/KernelLogger.md)

#### 3. 窗口管理
**GUI 程序必须使用 `GUIManager` 进行窗口管理**

```javascript
// ✅ 正确：使用 GUIManager
GUIManager.registerWindow(this.pid, this.window, {
    title: '我的应用',
    icon: 'application/myapp/myapp.svg',
    onClose: () => {
        ProcessManager.killProgram(this.pid);
    }
});

// ❌ 错误：手动管理窗口（不推荐）
this.window.style.position = 'fixed';
this.window.style.left = '100px';
this.window.style.top = '100px';
```

**原因**：
- 自动处理窗口拖动、拉伸、最小化、最大化
- 统一的窗口样式和主题支持
- 自动管理窗口焦点和 z-index

**详细说明**：请参考 [GUIManager API 文档](docs/API/GUIManager.md)

#### 4. 权限管理
**所有内核 API 调用都需要相应权限，程序必须在 `__info__` 中声明所需权限**

```javascript
// ✅ 正确：在 __info__ 中声明权限
__info__: function() {
    return {
        // ...
        permissions: [
            PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
            PermissionManager.PERMISSION.EVENT_LISTENER,
            PermissionManager.PERMISSION.KERNEL_DISK_READ
        ]
    };
}
```

**原因**：
- 确保系统安全，防止恶意程序滥用系统资源
- 用户可以在首次使用时授权或拒绝权限
- 权限系统会记录所有权限使用情况

**详细说明**：请参考 [PermissionManager API 文档](docs/API/PermissionManager.md)

#### 5. 资源清理
**程序必须在 `__exit__` 中清理所有资源**

```javascript
// ✅ 正确：完整清理所有资源
__exit__: async function() {
    // 1. 取消注册 GUI 窗口
    if (typeof GUIManager !== 'undefined') {
        GUIManager.unregisterWindow(this.pid);
    }
    
    // 2. 取消注册事件监听器（EventManager 会自动清理）
    // 但如果有直接使用 addEventListener 的，需要手动清理
    
    // 3. 清理 DOM 元素
    if (this.window && this.window.parentElement) {
        this.window.parentElement.removeChild(this.window);
    }
    
    // 4. 释放内存引用
    this.window = null;
}
```

**原因**：
- 防止内存泄漏
- 确保进程退出时所有资源都被正确释放
- 保持系统稳定运行

**详细说明**：请参考 [开发者指南 - 资源清理](docs/DEVELOPER_GUIDE.md#资源清理)

### 其他重要规范

- **禁止自动初始化**：程序必须禁止自动初始化，等待 `ProcessManager` 调用
- **DOM 元素标记**：所有程序创建的 DOM 元素必须标记 `data-pid` 属性
- **错误处理**：始终使用 try-catch 处理异步操作
- **异步方法**：`__init__` 和 `__exit__` 必须是异步函数

**详细说明**：请参考 [开发者指南](docs/DEVELOPER_GUIDE.md)

---

## 📝 更新日志

### 最新版本特性

#### 核心功能
- ✅ **事件管理系统**：统一的事件处理系统，支持事件优先级、传播控制和自动清理
- ✅ **日志管理系统**：统一的日志管理，支持多级别日志和结构化输出
- ✅ **权限管理系统**：完整的内核操作权限控制，确保系统安全
- ✅ **用户控制系统**：多用户管理，支持三种用户级别（普通用户、管理员、默认管理员），密码管理，头像管理
- ✅ **锁屏界面**：Windows 11 风格登录界面，支持密码验证、用户切换、随机背景、自定义背景、时间组件、每日一言组件

#### GUI 增强
- ✅ **窗口管理增强**：窗口标题栏保护、窗口四角拉伸、多实例程序管理
- ✅ **任务栏增强**：程序固定、多任务切换、通知徽章、天气组件
- ✅ **主题系统增强**：支持本地图片作为桌面背景，GIF 动图背景支持，随机二次元背景功能
- ✅ **通知管理系统**：完整的通知创建、显示、管理功能，支持快照和依赖类型通知
- ✅ **上下文菜单系统**：完整的右键菜单管理，支持程序注册自定义菜单
- ✅ **多任务切换器**：Ctrl + 鼠标左键打开全屏多任务选择器

#### 系统服务
- ✅ **语音识别驱动**：基于 Web Speech API 的语音识别功能，支持多语言识别、持续识别、实时结果反馈
- ✅ **加密驱动系统**：完整的加密功能支持，包括 RSA 加密/解密、MD5 哈希、随机数生成，密钥生命周期管理
- ✅ **缓存驱动系统**：统一缓存管理，生命周期管控，支持系统级、内核级、应用级缓存

#### 文件系统
- ✅ **ZIP 文件支持**：文件管理器自动识别 ZIP 文件，支持 ZIP 内容查看和导航
- ✅ **Ziper 压缩工具**：完整的 ZIP 压缩/解压缩工具，支持多文件/多目录处理
- ✅ **文件管理器多选**：支持多文件和多目录同时选择

#### 开发工具
- ✅ **内核自检功能**：全面的系统健康检查功能

更多特性请查看 [更新日志](docs/ZEROS_KERNEL.md#更新日志)

---

## 📄 许可证

GNU GENERAL PUBLIC LICENSE VERSION 2.0

详见 [LICENSE](LICENSE) 文件

---

## 📧 联系我们

- **Email**: hacker200714@outlook.com

---

## 📢 声明

1. 本系统内所有的音乐 API 均由笒鬼鬼提供，由此涉及的所有问题，与 ZerOS 开发组和笒鬼鬼无关，如有侵权，请联系删除
2. 本系统的开发由 Gemini 3 Pro 提供支持，仅供学习参考
3. 本系统不与其他项目进行对标，请勿恶意评价
4. 本系统涉及的 SVG 矢量图均由 Gemini 3 Pro 生成，非互联网采集而来

---

<div align="center">

**ZerOS** - 一个强大的虚拟操作系统内核，在浏览器中体验完整的系统操作。

Made with ❤️ by ZerOS Team

</div>
