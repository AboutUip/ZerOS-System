# ZerOS 内核开发指南

本指南将帮助你快速上手 ZerOS 内核模块开发，了解内核模块的设计思维和最佳实践。

## 目录

- [开发思维](#开发思维)
- [快速开始](#快速开始)
- [重要注意事项](#重要注意事项) ⚠️ **必读**
- [内核模块结构](#内核模块结构)
- [模块类型](#模块类型)
- [依赖管理](#依赖管理)
- [POOL 注册](#pool-注册)
- [内存管理](#内存管理)
- [日志记录](#日志记录)
- [最佳实践](#最佳实践)
- [示例代码](#示例代码)
- [常见问题](#常见问题)

---

## 开发思维

### ZerOS 内核开发的核心概念

ZerOS 内核开发遵循以下核心思维：

1. **模块化架构**
   - 内核采用模块化设计，每个模块职责清晰
   - 模块之间通过依赖关系进行解耦
   - 模块通过 POOL 进行数据共享和通信

2. **依赖管理**
   - 所有模块依赖关系在 `bootloader/starter.js` 中声明
   - 使用 `DependencyConfig` 管理模块加载顺序
   - 模块加载按依赖顺序异步进行

3. **统一日志系统**
   - 所有内核模块必须使用 `KernelLogger` 进行日志记录
   - 禁止直接使用 `console.log`、`console.warn`、`console.error`
   - 日志系统是第一个加载的模块，确保其他模块可以安全使用

4. **POOL 对象池**
   - 内核模块通过 POOL 进行数据共享
   - 模块可以注册到 POOL，供其他模块访问
   - POOL 提供统一的键值存储和对象管理

5. **静态类设计**
   - 内核模块通常使用静态类（static class）
   - 静态方法便于全局访问和调用
   - 内部状态使用静态属性管理

6. **初始化模式**
   - 内核模块通常有 `init()` 静态方法进行初始化
   - 初始化应该在模块加载后立即执行
   - 初始化失败应该记录错误但不阻止系统启动

### 内核模块类型

ZerOS 内核包含以下类型的模块：

- **核心模块**：基础功能模块（日志、依赖管理、类型池等）
- **文件系统模块**：文件系统相关功能（磁盘、文件树、文件框架等）
- **内存管理模块**：内存分配和管理（堆、栈、内存管理器等）
- **进程管理模块**：进程生命周期管理（进程管理器、权限管理器等）
- **驱动模块**：系统驱动（网络、存储、加密、多线程等）
- **UI 模块**：用户界面管理（GUI管理器、任务栏、通知等）

### 开发流程

1. **创建模块文件** → 2. **实现模块结构** → 3. **声明依赖关系** → 4. **注册到 POOL** → 5. **测试运行**

---

## 快速开始

### 1. 创建模块文件

在 `kernel/` 目录下创建你的模块文件：

```
kernel/
└── drive/
    └── myDrive.js          # 你的驱动模块
```

**目录选择**：
- `kernel/core/` - 核心模块（如日志、依赖管理）
- `kernel/filesystem/` - 文件系统模块
- `kernel/memory/` - 内存管理模块
- `kernel/process/` - 进程管理模块
- `kernel/drive/` - 驱动模块
- `kernel/dynamicModule/` - 动态模块管理
- `kernel/typePool/` - 类型池（枚举定义）

### 2. 编写基本模块结构

```javascript
// kernel/drive/myDrive.js
// 我的驱动模块
// 依赖: KernelLogger（在 HTML 中已加载）

KernelLogger.info("MyDrive", "模块初始化");

class MyDrive {
    // 模块初始化标志
    static _initialized = false;
    
    // 模块内部状态
    static _state = {
        // 模块状态数据
    };
    
    /**
     * 初始化模块
     */
    static init() {
        if (MyDrive._initialized) {
            KernelLogger.warn("MyDrive", "模块已初始化，跳过重复初始化");
            return;
        }
        
        try {
            // 初始化逻辑
            MyDrive._initialized = true;
            
            // 注册到 POOL（如果需要）
            MyDrive._registerToPool();
            
            KernelLogger.info("MyDrive", "模块初始化完成");
        } catch (error) {
            KernelLogger.error("MyDrive", "模块初始化失败", error);
            throw error;
        }
    }
    
    /**
     * 注册到 POOL
     */
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            POOL.__SET__("KERNEL_GLOBAL_POOL", "MyDrive", MyDrive);
            KernelLogger.debug("MyDrive", "已注册到 POOL");
        }
    }
    
    /**
     * 模块公共方法示例
     */
    static doSomething() {
        if (!MyDrive._initialized) {
            KernelLogger.warn("MyDrive", "模块未初始化，无法执行操作");
            return;
        }
        
        KernelLogger.info("MyDrive", "执行操作");
        // 实现逻辑
    }
}

// 自动初始化（如果模块已加载）
if (typeof KernelLogger !== 'undefined') {
    // 延迟初始化，确保依赖已加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            MyDrive.init();
        });
    } else {
        // DOM 已加载，直接初始化
        MyDrive.init();
    }
}
```

### 3. 声明依赖关系

在 `bootloader/starter.js` 中的 `MODULE_DEPENDENCIES` 对象中声明模块依赖：

```javascript
// bootloader/starter.js
const MODULE_DEPENDENCIES = {
    // ... 其他模块依赖 ...
    
    // 你的模块依赖声明
    "../kernel/drive/myDrive.js": [
        "../kernel/core/logger/kernelLogger.js",  // 依赖 KernelLogger
        // 其他依赖...
    ],
    
    // ... 其他模块依赖 ...
};
```

**依赖声明规则**：
- 键为模块文件路径（相对于 `test/index.html`）
- 值为依赖模块路径数组
- 依赖数组为空 `[]` 表示无依赖（或只依赖在 HTML 中已加载的模块）

### 4. 测试模块

模块加载后，可以通过以下方式测试：

```javascript
// 在浏览器控制台中测试
if (typeof MyDrive !== 'undefined') {
    MyDrive.doSomething();
}
```

---

## ⚠️ 重要注意事项

### 必须遵守的开发规范

ZerOS 内核要求所有模块必须遵守以下开发规范，以确保系统稳定运行。

#### 1. 日志记录 - 必须使用 KernelLogger

**所有日志输出必须通过内核的 `KernelLogger` 进行统一管理**

```javascript
// ✅ 正确：使用 KernelLogger
KernelLogger.info("MyDrive", "模块初始化");
KernelLogger.warn("MyDrive", "警告信息");
KernelLogger.error("MyDrive", "错误信息", error);
KernelLogger.debug("MyDrive", "调试信息");

// ❌ 错误：直接使用 console.log（禁止）
console.log("模块初始化");
console.warn("警告信息");
console.error("错误信息");
```

**为什么必须使用 KernelLogger**：
- ✅ **统一格式**：所有日志使用统一格式，包含模块名、时间戳、级别等信息
- ✅ **日志过滤**：支持日志级别过滤，控制日志输出
- ✅ **结构化日志**：便于调试和问题排查
- ✅ **性能优化**：可以统一控制日志输出，避免性能问题
- ✅ **错误抑制**：防止无限循环报错

**详细说明**：请参考 [KernelLogger API 文档](API/KernelLogger.md)

#### 2. 依赖管理 - 必须声明依赖

**所有模块依赖必须在 `bootloader/starter.js` 中声明**

```javascript
// bootloader/starter.js
const MODULE_DEPENDENCIES = {
    "../kernel/drive/myDrive.js": [
        "../kernel/core/logger/kernelLogger.js",  // 依赖 KernelLogger
        "../kernel/drive/LStorage.js",            // 依赖 LStorage
    ],
};
```

**为什么必须声明依赖**：
- ✅ **加载顺序**：确保依赖模块在目标模块之前加载
- ✅ **避免错误**：防止访问未定义的模块
- ✅ **系统稳定性**：确保模块按正确顺序初始化

**详细说明**：请参考 [DependencyConfig API 文档](API/DependencyConfig.md)

#### 3. POOL 注册 - 推荐注册到 POOL

**内核模块应该注册到 POOL，便于其他模块访问**

```javascript
// ✅ 正确：注册到 POOL
static _registerToPool() {
    if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
        POOL.__SET__("KERNEL_GLOBAL_POOL", "MyDrive", MyDrive);
        KernelLogger.debug("MyDrive", "已注册到 POOL");
    }
}

// 其他模块访问
const MyDrive = POOL.__GET__("KERNEL_GLOBAL_POOL", "MyDrive");
```

**为什么推荐注册到 POOL**：
- ✅ **统一访问**：提供统一的模块访问接口
- ✅ **解耦设计**：模块之间通过 POOL 通信，降低耦合
- ✅ **动态加载**：支持模块动态加载和卸载

**详细说明**：请参考 [Pool API 文档](API/Pool.md)

#### 4. 初始化检查 - 必须检查初始化状态

**模块方法应该检查模块是否已初始化**

```javascript
// ✅ 正确：检查初始化状态
static doSomething() {
    if (!MyDrive._initialized) {
        KernelLogger.warn("MyDrive", "模块未初始化，无法执行操作");
        return;
    }
    // 执行操作
}

// ❌ 错误：不检查初始化状态
static doSomething() {
    // 直接执行，可能导致错误
}
```

**为什么必须检查初始化状态**：
- ✅ **防止错误**：避免在模块未初始化时调用方法
- ✅ **提供反馈**：给开发者明确的错误提示
- ✅ **系统稳定性**：确保模块在正确状态下运行

#### 5. 错误处理 - 必须处理错误

**所有可能失败的操作都应该使用 try-catch 处理**

```javascript
// ✅ 正确：处理错误
static init() {
    try {
        // 初始化逻辑
        MyDrive._initialized = true;
        KernelLogger.info("MyDrive", "模块初始化完成");
    } catch (error) {
        KernelLogger.error("MyDrive", "模块初始化失败", error);
        // 不抛出错误，允许系统继续启动
        // 或者根据情况决定是否抛出
    }
}

// ❌ 错误：不处理错误
static init() {
    // 初始化逻辑，如果失败会导致系统崩溃
}
```

**为什么必须处理错误**：
- ✅ **系统稳定性**：防止单个模块错误导致整个系统崩溃
- ✅ **错误追踪**：记录错误信息，便于问题排查
- ✅ **优雅降级**：允许系统在部分模块失败时继续运行

### 其他重要规范

- **禁止全局污染**：模块应该使用 IIFE（立即执行函数表达式）或类封装，避免污染全局作用域
- **静态类设计**：内核模块通常使用静态类，便于全局访问
- **初始化标志**：使用 `_initialized` 标志防止重复初始化
- **私有方法命名**：私有方法使用下划线前缀（如 `_registerToPool`）

**详细说明**：请参考 [内核架构文档](ZEROS_KERNEL.md)

---

## 内核模块结构

### 基本结构

内核模块通常包含以下部分：

1. **模块头部注释**：说明模块用途和依赖
2. **日志初始化**：使用 `KernelLogger.info` 记录模块初始化
3. **类定义**：定义模块类（通常为静态类）
4. **初始化标志**：`_initialized` 静态属性
5. **内部状态**：`_state` 静态属性或私有静态属性
6. **初始化方法**：`init()` 静态方法
7. **POOL 注册**：`_registerToPool()` 私有方法
8. **公共方法**：模块提供的公共 API
9. **自动初始化**：模块加载后自动调用 `init()`
10. **事件派发**：模块加载完成后使用 `DependencyConfig.publishSignal()` 派发加载完成事件 ⚠️ **重要**

### 完整示例

```javascript
// kernel/drive/myDrive.js
// 我的驱动模块
// 依赖: KernelLogger（在 HTML 中已加载）、LStorage

KernelLogger.info("MyDrive", "模块初始化");

class MyDrive {
    // ==================== 初始化标志 ====================
    static _initialized = false;
    
    // ==================== 内部状态 ====================
    static _state = {
        config: null,
        cache: new Map()
    };
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化模块
     */
    static init() {
        if (MyDrive._initialized) {
            KernelLogger.warn("MyDrive", "模块已初始化，跳过重复初始化");
            return;
        }
        
        try {
            // 1. 加载配置
            MyDrive._loadConfig();
            
            // 2. 初始化内部状态
            MyDrive._initState();
            
            // 3. 注册到 POOL
            MyDrive._registerToPool();
            
            // 4. 标记为已初始化
            MyDrive._initialized = true;
            
            KernelLogger.info("MyDrive", "模块初始化完成");
        } catch (error) {
            KernelLogger.error("MyDrive", "模块初始化失败", error);
            // 根据情况决定是否抛出错误
            // throw error;
        }
    }
    
    // ==================== 事件派发 ====================
    
    /**
     * 派发模块加载完成事件
     * 通知依赖管理器模块已加载完成
     */
    static _publishLoadSignal() {
        // 优先使用 DependencyConfig.publishSignal
        if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
            DependencyConfig.publishSignal("../kernel/drive/myDrive.js");
        } else if (typeof document !== 'undefined' && document.body) {
            // 降级方案：直接派发事件
            document.body.dispatchEvent(
                new CustomEvent("dependencyLoaded", {
                    detail: {
                        name: "../kernel/drive/myDrive.js",
                    },
                })
            );
            KernelLogger.debug("MyDrive", "已发布依赖加载信号（降级方案）");
        } else {
            // 延迟派发事件
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    MyDrive._publishLoadSignal();
                });
            } else {
                setTimeout(() => {
                    MyDrive._publishLoadSignal();
                }, 0);
            }
        }
    }
    
    /**
     * 加载配置
     */
    static _loadConfig() {
        try {
            if (typeof LStorage !== 'undefined') {
                const config = LStorage.getSystemStorage('system.myDriveConfig');
                if (config) {
                    MyDrive._state.config = config;
                    KernelLogger.debug("MyDrive", "已加载配置");
                }
            }
        } catch (error) {
            KernelLogger.warn("MyDrive", "加载配置失败", error);
        }
    }
    
    /**
     * 初始化内部状态
     */
    static _initState() {
        // 初始化内部状态
        MyDrive._state.cache.clear();
    }
    
    /**
     * 注册到 POOL
     */
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            POOL.__SET__("KERNEL_GLOBAL_POOL", "MyDrive", MyDrive);
            KernelLogger.debug("MyDrive", "已注册到 POOL");
        }
    }
    
    // ==================== 公共 API ====================
    
    /**
     * 执行操作
     * @param {string} param 参数
     * @returns {Promise<any>} 结果
     */
    static async doSomething(param) {
        if (!MyDrive._initialized) {
            KernelLogger.warn("MyDrive", "模块未初始化，无法执行操作");
            throw new Error("MyDrive 模块未初始化");
        }
        
        try {
            KernelLogger.debug("MyDrive", `执行操作: ${param}`);
            
            // 实现逻辑
            const result = await MyDrive._executeOperation(param);
            
            KernelLogger.info("MyDrive", "操作执行成功");
            return result;
        } catch (error) {
            KernelLogger.error("MyDrive", "操作执行失败", error);
            throw error;
        }
    }
    
    /**
     * 执行操作（私有方法）
     */
    static async _executeOperation(param) {
        // 实现逻辑
        return { success: true, data: param };
    }
    
    /**
     * 清理资源
     */
    static cleanup() {
        if (!MyDrive._initialized) {
            return;
        }
        
        try {
            // 清理缓存
            MyDrive._state.cache.clear();
            
            KernelLogger.info("MyDrive", "资源清理完成");
        } catch (error) {
            KernelLogger.error("MyDrive", "资源清理失败", error);
        }
    }
}

// 自动初始化（如果模块已加载）
if (typeof KernelLogger !== 'undefined') {
    // 延迟初始化，确保依赖已加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            MyDrive.init();
        });
    } else {
        // DOM 已加载，直接初始化
        MyDrive.init();
    }
}
```

---

## 模块类型

### 核心模块

核心模块是系统的基础模块，通常没有依赖或只依赖 KernelLogger。

**特点**：
- 在 HTML 中直接加载或最早加载
- 提供基础功能（日志、依赖管理、对象池等）
- 其他模块依赖核心模块

**示例**：
- `kernel/core/logger/kernelLogger.js` - 日志系统
- `kernel/core/signal/dependencyConfig.js` - 依赖管理
- `kernel/core/signal/pool.js` - 对象池
- `kernel/core/typePool/` - 类型池（枚举定义）

### 文件系统模块

文件系统模块提供文件操作功能。

**特点**：
- 依赖文件类型枚举
- 与后端服务（PHP/SpringBoot）交互
- 提供虚拟文件系统接口

**示例**：
- `kernel/filesystem/disk.js` - 虚拟磁盘管理
- `kernel/filesystem/nodeTree.js` - 文件树结构
- `kernel/filesystem/fileFramework.js` - 文件对象模板
- `kernel/filesystem/init.js` - 文件系统初始化

### 内存管理模块

内存管理模块提供内存分配和管理功能。

**特点**：
- 管理进程内存（堆、栈）
- 提供内存分配和释放接口
- 跟踪内存使用情况

**示例**：
- `kernel/memory/heap.js` - 堆内存管理
- `kernel/memory/shed.js` - 栈内存管理
- `kernel/memory/memoryManager.js` - 统一内存管理器
- `kernel/memory/kernelMemory.js` - 内核动态数据存储

### 进程管理模块

进程管理模块提供进程生命周期管理功能。

**特点**：
- 管理程序启动、运行、终止
- 分配和管理 PID
- 权限管理和审计

**示例**：
- `kernel/process/processManager.js` - 进程生命周期管理
- `kernel/process/permissionManager.js` - 权限管理
- `kernel/process/applicationAssetManager.js` - 应用程序资源管理

### 驱动模块

驱动模块提供系统驱动功能。

**特点**：
- 提供特定功能（网络、存储、加密等）
- 通常依赖进程管理器或其他核心模块
- 可以被程序调用

**示例**：
- `kernel/drive/LStorage.js` - 本地存储驱动
- `kernel/drive/cacheDrive.js` - 缓存驱动
- `kernel/drive/cryptDrive.js` - 加密驱动
- `kernel/drive/multithreadingDrive.js` - 多线程驱动
- `kernel/drive/networkManager.js` - 网络管理驱动

### UI 模块

UI 模块提供用户界面管理功能。

**特点**：
- 管理窗口、任务栏、通知等 UI 组件
- 依赖进程管理器和事件管理器
- 提供 GUI 程序使用的 API

**示例**：
- `system/ui/guiManager.js` - GUI 窗口管理
- `system/ui/taskbarManager.js` - 任务栏管理
- `system/ui/notificationManager.js` - 通知管理
- `system/ui/eventManager.js` - 事件管理

---

## 依赖管理

### 依赖声明

在 `bootloader/starter.js` 中的 `MODULE_DEPENDENCIES` 对象中声明模块依赖：

```javascript
// bootloader/starter.js
const MODULE_DEPENDENCIES = {
    // 你的模块
    "../kernel/drive/myDrive.js": [
        "../kernel/core/logger/kernelLogger.js",  // 依赖 KernelLogger
        "../kernel/drive/LStorage.js",            // 依赖 LStorage
    ],
};
```

### 依赖等待

如果模块需要等待依赖模块加载完成，可以使用 `DependencyConfig.waitLoaded`：

```javascript
static async init() {
    // 等待依赖模块加载
    const Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
    if (Dependency && typeof Dependency.waitLoaded === 'function') {
        try {
            await Dependency.waitLoaded("../kernel/drive/LStorage.js", {
                interval: 50,
                timeout: 5000
            });
        } catch (error) {
            KernelLogger.error("MyDrive", "等待依赖加载失败", error);
            // 根据情况决定是否继续初始化
        }
    }
    
    // 继续初始化
    MyDrive._initialized = true;
}
```

### 依赖检查

在方法中检查依赖是否可用：

```javascript
static doSomething() {
    // 检查依赖
    if (typeof LStorage === 'undefined') {
        KernelLogger.warn("MyDrive", "LStorage 不可用，无法执行操作");
        return;
    }
    
    // 使用依赖
    const data = LStorage.getSystemStorage('key');
}
```

---

## POOL 注册

### 注册到 POOL

内核模块应该注册到 POOL，便于其他模块访问：

```javascript
static _registerToPool() {
    if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
        POOL.__SET__("KERNEL_GLOBAL_POOL", "MyDrive", MyDrive);
        KernelLogger.debug("MyDrive", "已注册到 POOL");
    }
}
```

### 从 POOL 获取模块

其他模块可以从 POOL 获取你的模块：

```javascript
// 获取模块
const MyDrive = POOL.__GET__("KERNEL_GLOBAL_POOL", "MyDrive");
if (MyDrive) {
    MyDrive.doSomething();
}
```

### POOL 键命名规范

- 使用模块类名作为 POOL 键（如 `"MyDrive"`）
- 保持命名一致性，便于查找
- 避免使用通用名称（如 `"Manager"`、`"Service"`）

---

## 内存管理

### 使用 KernelMemory

内核模块可以使用 `KernelMemory` 存储持久化数据：

```javascript
// 保存数据
KernelMemory.saveData('MYDRIVE_CONFIG', config);

// 加载数据
const config = KernelMemory.loadData('MYDRIVE_CONFIG');
```

### 使用进程内存

如果模块需要为进程分配内存，使用 `MemoryManager`：

```javascript
// 为进程分配堆内存
const heapId = MemoryManager.allocateHeap(pid, size);

// 为进程分配栈内存
const shedId = MemoryManager.allocateShed(pid, size);
```

**注意**：内核模块通常不需要为进程分配内存，这是 `ProcessManager` 的职责。

---

## 日志记录

### 日志级别

使用适当的日志级别：

```javascript
// DEBUG - 详细的调试信息
KernelLogger.debug("MyDrive", "调试信息");

// INFO - 一般信息（模块初始化、操作完成等）
KernelLogger.info("MyDrive", "模块初始化完成");

// WARN - 警告信息（非致命错误）
KernelLogger.warn("MyDrive", "配置未找到，使用默认值");

// ERROR - 错误信息（致命错误）
KernelLogger.error("MyDrive", "初始化失败", error);
```

### 日志格式

KernelLogger 会自动格式化日志，包含：
- 时间戳
- 日志级别
- 模块名
- 消息内容
- 附加数据（可选）

### 日志最佳实践

- **初始化时**：使用 `info` 级别记录模块初始化
- **操作完成**：使用 `info` 级别记录重要操作完成
- **警告情况**：使用 `warn` 级别记录可恢复的错误
- **致命错误**：使用 `error` 级别记录致命错误，并包含错误对象
- **调试信息**：使用 `debug` 级别记录详细的调试信息

---

## 最佳实践

### 1. 模块设计原则

- **单一职责**：每个模块只负责一个功能领域
- **低耦合**：模块之间通过 POOL 或明确的接口通信
- **高内聚**：模块内部功能紧密相关
- **可扩展**：设计时考虑未来扩展需求

### 2. 错误处理

- **优雅降级**：模块初始化失败不应阻止系统启动
- **错误记录**：所有错误都应该记录到日志
- **错误恢复**：尽可能提供错误恢复机制

### 3. 性能优化

- **延迟初始化**：只在需要时初始化资源
- **缓存机制**：合理使用缓存减少重复计算
- **异步操作**：耗时操作使用异步方式

### 4. 代码组织

- **清晰的注释**：模块头部说明模块用途和依赖
- **方法分组**：使用注释分组相关方法
- **命名规范**：使用清晰的命名，私有方法使用下划线前缀

---

## 示例代码

### 示例 1：简单驱动模块

```javascript
// kernel/drive/simpleDrive.js
// 简单驱动模块示例
// 依赖: KernelLogger

KernelLogger.info("SimpleDrive", "模块初始化");

class SimpleDrive {
    static _initialized = false;
    
    static init() {
        if (SimpleDrive._initialized) {
            return;
        }
        
        SimpleDrive._initialized = true;
        SimpleDrive._registerToPool();
        KernelLogger.info("SimpleDrive", "模块初始化完成");
    }
    
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            POOL.__SET__("KERNEL_GLOBAL_POOL", "SimpleDrive", SimpleDrive);
        }
    }
    
    static doWork() {
        if (!SimpleDrive._initialized) {
            KernelLogger.warn("SimpleDrive", "模块未初始化");
            return;
        }
        
        KernelLogger.info("SimpleDrive", "执行工作");
    }
}

// 自动初始化
if (typeof KernelLogger !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            SimpleDrive.init();
        });
    } else {
        SimpleDrive.init();
    }
}

// 派发加载完成事件
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/drive/simpleDrive.js");
} else if (typeof document !== 'undefined' && document.body) {
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/drive/simpleDrive.js",
            },
        })
    );
}
```

### 示例 2：带配置的驱动模块

```javascript
// kernel/drive/configDrive.js
// 带配置的驱动模块示例
// 依赖: KernelLogger、LStorage

KernelLogger.info("ConfigDrive", "模块初始化");

class ConfigDrive {
    static _initialized = false;
    static _config = {
        enabled: true,
        timeout: 5000
    };
    
    static init() {
        if (ConfigDrive._initialized) {
            return;
        }
        
        try {
            // 加载配置
            ConfigDrive._loadConfig();
            
            ConfigDrive._initialized = true;
            ConfigDrive._registerToPool();
            KernelLogger.info("ConfigDrive", "模块初始化完成");
        } catch (error) {
            KernelLogger.error("ConfigDrive", "模块初始化失败", error);
        }
    }
    
    static _loadConfig() {
        if (typeof LStorage !== 'undefined') {
            const savedConfig = LStorage.getSystemStorage('system.configDriveConfig');
            if (savedConfig) {
                ConfigDrive._config = { ...ConfigDrive._config, ...savedConfig };
                KernelLogger.debug("ConfigDrive", "已加载配置", ConfigDrive._config);
            }
        }
    }
    
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            POOL.__SET__("KERNEL_GLOBAL_POOL", "ConfigDrive", ConfigDrive);
        }
    }
    
    static getConfig() {
        return { ...ConfigDrive._config };
    }
    
    static setConfig(newConfig) {
        ConfigDrive._config = { ...ConfigDrive._config, ...newConfig };
        
        // 保存配置
        if (typeof LStorage !== 'undefined') {
            LStorage.setSystemStorage('system.configDriveConfig', ConfigDrive._config);
        }
        
        KernelLogger.info("ConfigDrive", "配置已更新", ConfigDrive._config);
    }
}

// 自动初始化
if (typeof KernelLogger !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ConfigDrive.init();
        });
    } else {
        ConfigDrive.init();
    }
}

// 派发加载完成事件
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/drive/configDrive.js");
} else if (typeof document !== 'undefined' && document.body) {
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/drive/configDrive.js",
            },
        })
    );
}
```

### 示例 3：依赖其他模块的驱动

```javascript
// kernel/drive/dependentDrive.js
// 依赖其他模块的驱动示例
// 依赖: KernelLogger、LStorage、ProcessManager

KernelLogger.info("DependentDrive", "模块初始化");

class DependentDrive {
    static _initialized = false;
    
    static async init() {
        if (DependentDrive._initialized) {
            return;
        }
        
        try {
            // 等待依赖模块加载
            const Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
            if (Dependency && typeof Dependency.waitLoaded === 'function') {
                await Dependency.waitLoaded("../kernel/drive/LStorage.js", {
                    interval: 50,
                    timeout: 5000
                });
            }
            
            // 检查依赖是否可用
            if (typeof LStorage === 'undefined') {
                throw new Error("LStorage 不可用");
            }
            
            DependentDrive._initialized = true;
            DependentDrive._registerToPool();
            KernelLogger.info("DependentDrive", "模块初始化完成");
        } catch (error) {
            KernelLogger.error("DependentDrive", "模块初始化失败", error);
        }
    }
    
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            POOL.__SET__("KERNEL_GLOBAL_POOL", "DependentDrive", DependentDrive);
        }
    }
    
    static async doWork() {
        if (!DependentDrive._initialized) {
            KernelLogger.warn("DependentDrive", "模块未初始化");
            return;
        }
        
        // 检查依赖
        if (typeof LStorage === 'undefined') {
            KernelLogger.warn("DependentDrive", "LStorage 不可用");
            return;
        }
        
        // 使用依赖
        const data = LStorage.getSystemStorage('key');
        KernelLogger.info("DependentDrive", "执行工作", data);
    }
}

// 自动初始化
if (typeof KernelLogger !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            DependentDrive.init();
        });
    } else {
        DependentDrive.init();
    }
}

// 派发加载完成事件
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/drive/dependentDrive.js");
} else if (typeof document !== 'undefined' && document.body) {
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/drive/dependentDrive.js",
            },
        })
    );
}
```

---

## 常见问题

### Q: 模块初始化失败怎么办？

A: 模块初始化失败应该记录错误，但不应该阻止系统启动：

```javascript
static init() {
    try {
        // 初始化逻辑
        MyDrive._initialized = true;
        KernelLogger.info("MyDrive", "模块初始化完成");
    } catch (error) {
        KernelLogger.error("MyDrive", "模块初始化失败", error);
        // 不抛出错误，允许系统继续启动
        // 或者根据情况决定是否抛出
    }
}
```

### Q: 如何等待依赖模块加载？

A: 使用 `DependencyConfig.waitLoaded`：

```javascript
static async init() {
    const Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
    if (Dependency && typeof Dependency.waitLoaded === 'function') {
        await Dependency.waitLoaded("../kernel/drive/LStorage.js", {
            interval: 50,
            timeout: 5000
        });
    }
    
    // 继续初始化
}
```

### Q: 如何从 POOL 获取其他模块？

A: 使用 `POOL.__GET__`：

```javascript
const LStorage = POOL.__GET__("KERNEL_GLOBAL_POOL", "LStorage");
if (LStorage) {
    const data = LStorage.getSystemStorage('key');
}
```

### Q: 模块应该在哪里声明依赖？

A: 在 `bootloader/starter.js` 中的 `MODULE_DEPENDENCIES` 对象中声明：

```javascript
// bootloader/starter.js
const MODULE_DEPENDENCIES = {
    "../kernel/drive/myDrive.js": [
        "../kernel/core/logger/kernelLogger.js",
        "../kernel/drive/LStorage.js"
    ],
};
```

### Q: 如何测试内核模块？

A: 在浏览器控制台中测试：

```javascript
// 检查模块是否加载
if (typeof MyDrive !== 'undefined') {
    // 检查是否已初始化
    if (MyDrive._initialized) {
        // 调用模块方法
        MyDrive.doSomething();
    } else {
        // 手动初始化
        MyDrive.init();
    }
}
```

### Q: 模块初始化时机是什么？

A: 模块在以下时机初始化：

1. **自动初始化**：模块加载后，如果 DOM 已加载，立即初始化；如果 DOM 未加载，等待 `DOMContentLoaded` 事件
2. **手动初始化**：可以手动调用 `init()` 方法
3. **依赖加载后**：如果模块依赖其他模块，会在依赖加载后初始化

### Q: 如何确保模块只初始化一次？

A: 使用 `_initialized` 标志：

```javascript
static _initialized = false;

static init() {
    if (MyDrive._initialized) {
        KernelLogger.warn("MyDrive", "模块已初始化，跳过重复初始化");
        return;
    }
    
    // 初始化逻辑
    MyDrive._initialized = true;
}
```

### Q: 模块加载完成后需要做什么？

A: 必须派发加载完成事件，通知依赖管理器：

```javascript
// 在模块文件末尾，初始化完成后
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/drive/myDrive.js");
} else if (typeof document !== 'undefined' && document.body) {
    // 降级方案
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/drive/myDrive.js",
            },
        })
    );
}
```

**注意**：模块路径必须与 `bootloader/starter.js` 中声明的路径完全一致。

### Q: 内核模块和程序的区别是什么？

A: 

| 特性 | 内核模块 | 程序 |
|------|---------|------|
| **位置** | `kernel/` 或 `system/ui/` | `system/service/DISK/D/application/` |
| **生命周期** | 系统启动时加载，系统关闭时卸载 | 由用户或系统启动，可以随时启动和关闭 |
| **管理方式** | 由 `DependencyConfig` 管理 | 由 `ProcessManager` 管理 |
| **初始化** | `init()` 静态方法 | `__init__()` 实例方法 |
| **PID** | 无 PID | 有 PID |
| **权限** | 不需要权限（内核特权） | 需要声明权限 |
| **用途** | 提供系统功能 | 提供用户功能 |

### Q: 如何调试内核模块？

A: 

1. **使用 KernelLogger**：添加详细的日志记录
2. **浏览器控制台**：查看日志输出
3. **断点调试**：在浏览器开发者工具中设置断点
4. **检查 POOL**：查看模块是否已注册到 POOL
5. **检查依赖**：确认依赖模块已加载

### Q: 内核模块可以访问 DOM 吗？

A: 可以，但需要注意：

- **UI 模块**：`system/ui/` 下的模块可以访问 DOM
- **内核模块**：`kernel/` 下的模块通常不直接访问 DOM，但可以通过 POOL 访问 UI 模块
- **最佳实践**：内核模块应该通过 UI 模块操作 DOM，保持职责分离

---

## 相关文档

- [内核架构文档](./ZEROS_KERNEL.md) - 深入了解内核架构和设计原理
- [系统流程文档](./SYSTEM_FLOW.md) - 系统启动、模块加载等核心流程
- [API 文档](./API/README.md) - 各模块的详细 API 文档
- [开发者指南](./DEVELOPER_GUIDE.md) - ZerOS 程序开发指南

---

<div align="center">

**祝你内核开发愉快！** 🎉

Made with ❤️ by ZerOS Team

</div>

