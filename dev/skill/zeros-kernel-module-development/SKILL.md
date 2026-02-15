---
name: zeros-kernel-module-development
description: Guide for developing kernel modules and drive extensions in ZerOS. Use when creating kernel modules, drive modules, core modules, or extending ZerOS kernel functionality in kernel/ directory.
---

# ZerOS Kernel Module and Drive Development Guide

This skill provides comprehensive guidance for developing kernel modules and drive extensions in ZerOS. Kernel modules are core system components that provide fundamental functionality to the operating system.

## Overview

### What are Kernel Modules?

Kernel modules are core system components that:
- Located in `kernel/` directory (core modules, filesystem, memory, process, drive)
- Or `system/ui/` directory (UI management modules)
- Loaded during system boot by BootLoader
- Managed by DependencyConfig (dependency management)
- Provide system-level functionality
- Run with kernel privileges (no permission checks needed)

### Key Characteristics

- **Static Class Design**: Modules use static classes with static methods
- **No Process**: Modules don't have PID, run in kernel context
- **Auto-initialization**: Automatically initialized on load
- **POOL Registration**: Registered to POOL for module access
- **Dependency Management**: Dependencies declared in `bootloader/starter.js`
- **Signal Publishing**: Must publish load signal after initialization

## Module Types

### Core Modules

**Location**: `kernel/core/`

**Purpose**: Foundation modules (logger, dependency management, type pools)

**Examples**:
- `kernel/core/logger/kernelLogger.js` - Logging system
- `kernel/core/signal/dependencyConfig.js` - Dependency management
- `kernel/core/signal/pool.js` - Object pool
- `kernel/core/typePool/` - Type pools (enum definitions)

### Filesystem Modules

**Location**: `kernel/filesystem/`

**Purpose**: File system functionality (disk, file tree, file framework)

**Examples**:
- `kernel/filesystem/disk.js` - Virtual disk management
- `kernel/filesystem/nodeTree.js` - File tree structure
- `kernel/filesystem/fileFramework.js` - File object template
- `kernel/filesystem/init.js` - Filesystem initialization

### Memory Management Modules

**Location**: `kernel/memory/`

**Purpose**: Memory allocation and management (heap, stack, memory manager)

**Examples**:
- `kernel/memory/heap.js` - Heap memory management
- `kernel/memory/shed.js` - Stack memory management
- `kernel/memory/memoryManager.js` - Unified memory manager
- `kernel/memory/kernelMemory.js` - Kernel dynamic data storage

### Process Management Modules

**Location**: `kernel/process/`

**Purpose**: Process lifecycle management (process manager, permissions)

**Examples**:
- `kernel/process/processManager.js` - Process lifecycle management
- `kernel/process/permissionManager.js` - Permission management
- `kernel/process/applicationAssetManager.js` - Application resource management

### Drive Modules

**Location**: `kernel/drive/`

**Purpose**: System drivers (network, storage, encryption, multithreading, etc.)

**Examples**:
- `kernel/drive/LStorage.js` - Local storage driver
- `kernel/drive/cacheDrive.js` - Cache driver
- `kernel/drive/cryptDrive.js` - Encryption driver
- `kernel/drive/multithreadingDrive.js` - Multithreading driver
- `kernel/drive/networkManager.js` - Network management driver
- `kernel/drive/speechDrive.js` - Speech recognition driver
- `kernel/drive/dragDrive.js` - Drag and drop driver
- `kernel/drive/geographyDrive.js` - Geography location driver

### UI Modules

**Location**: `system/ui/`

**Purpose**: User interface management (GUI manager, taskbar, notifications)

**Examples**:
- `system/ui/guiManager.js` - GUI window management
- `system/ui/taskbarManager.js` - Taskbar management
- `system/ui/notificationManager.js` - Notification management
- `system/ui/eventManager.js` - Event management

## Module Structure

### Complete Template

```javascript
// kernel/drive/myDrive.js
// My Drive Module
// Dependencies: KernelLogger (loaded in HTML), LStorage

KernelLogger.info("MyDrive", "模块初始化");

class MyDrive {
    // ==================== Initialization Flag ====================
    static _initialized = false;
    static _initializing = false;  // Prevent concurrent initialization
    
    // ==================== Internal State ====================
    static _state = {
        config: null,
        cache: new Map(),
        // Add other state properties
    };
    
    // ==================== Constants ====================
    static DEFAULT_CONFIG = {
        enabled: true,
        timeout: 5000
    };
    
    // ==================== Initialization ====================
    
    /**
     * Initialize module
     */
    static init() {
        if (MyDrive._initialized) {
            KernelLogger.warn("MyDrive", "模块已初始化，跳过重复初始化");
            return;
        }
        
        if (MyDrive._initializing) {
            KernelLogger.warn("MyDrive", "模块正在初始化中，跳过重复初始化");
            return;
        }
        
        MyDrive._initializing = true;
        
        try {
            // 1. Load configuration
            MyDrive._loadConfig();
            
            // 2. Initialize internal state
            MyDrive._initState();
            
            // 3. Register to POOL
            MyDrive._registerToPool();
            
            // 4. Mark as initialized
            MyDrive._initialized = true;
            
            KernelLogger.info("MyDrive", "模块初始化完成");
        } catch (error) {
            KernelLogger.error("MyDrive", "模块初始化失败", error);
            // Don't throw error, allow system to continue
            // Or throw based on criticality
        } finally {
            MyDrive._initializing = false;
        }
    }
    
    // ==================== Signal Publishing ====================
    
    /**
     * Publish load signal (call after initialization)
     * Notifies dependency manager that module has loaded
     */
    static _publishLoadSignal() {
        // Prefer DependencyConfig.publishSignal
        if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
            DependencyConfig.publishSignal("../kernel/drive/myDrive.js");
        } else if (typeof document !== 'undefined' && document.body) {
            // Fallback: dispatch event directly
            document.body.dispatchEvent(
                new CustomEvent("dependencyLoaded", {
                    detail: {
                        name: "../kernel/drive/myDrive.js",
                    },
                })
            );
            KernelLogger.debug("MyDrive", "已发布依赖加载信号（降级方案）");
        } else {
            // Delay signal publishing
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
    
    // ==================== Configuration Management ====================
    
    /**
     * Load configuration from LStorage
     */
    static _loadConfig() {
        try {
            if (typeof LStorage !== 'undefined') {
                const config = LStorage.getSystemStorage('system.myDriveConfig');
                if (config) {
                    MyDrive._state.config = Object.assign({}, MyDrive.DEFAULT_CONFIG, config);
                    KernelLogger.debug("MyDrive", "已加载配置", MyDrive._state.config);
                } else {
                    MyDrive._state.config = Object.assign({}, MyDrive.DEFAULT_CONFIG);
                }
            } else {
                MyDrive._state.config = Object.assign({}, MyDrive.DEFAULT_CONFIG);
            }
        } catch (error) {
            KernelLogger.warn("MyDrive", "加载配置失败，使用默认配置", error);
            MyDrive._state.config = Object.assign({}, MyDrive.DEFAULT_CONFIG);
        }
    }
    
    /**
     * Save configuration to LStorage
     */
    static _saveConfig() {
        try {
            if (typeof LStorage !== 'undefined') {
                LStorage.setSystemStorage('system.myDriveConfig', MyDrive._state.config);
                KernelLogger.debug("MyDrive", "已保存配置");
            }
        } catch (error) {
            KernelLogger.warn("MyDrive", "保存配置失败", error);
        }
    }
    
    // ==================== State Management ====================
    
    /**
     * Initialize internal state
     */
    static _initState() {
        // Initialize internal state
        MyDrive._state.cache.clear();
        // Add other initialization logic
    }
    
    // ==================== POOL Registration ====================
    
    /**
     * Register module to POOL
     */
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            try {
                // Ensure pool category exists
                if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                    POOL.__INIT__("KERNEL_GLOBAL_POOL");
                }
                POOL.__SET__("KERNEL_GLOBAL_POOL", "MyDrive", MyDrive);
                KernelLogger.debug("MyDrive", "已注册到 POOL");
            } catch (e) {
                KernelLogger.warn("MyDrive", `注册到 POOL 失败: ${e.message}`);
            }
        }
    }
    
    // ==================== Public API ====================
    
    /**
     * Execute operation
     * @param {string} param Parameter
     * @returns {Promise<any>} Result
     */
    static async doSomething(param) {
        if (!MyDrive._initialized) {
            KernelLogger.warn("MyDrive", "模块未初始化，无法执行操作");
            throw new Error("MyDrive 模块未初始化");
        }
        
        try {
            KernelLogger.debug("MyDrive", `执行操作: ${param}`);
            
            // Implementation logic
            const result = await MyDrive._executeOperation(param);
            
            KernelLogger.info("MyDrive", "操作执行成功");
            return result;
        } catch (error) {
            KernelLogger.error("MyDrive", "操作执行失败", error);
            throw error;
        }
    }
    
    /**
     * Execute operation (private method)
     */
    static async _executeOperation(param) {
        // Implementation logic
        return { success: true, data: param };
    }
    
    /**
     * Get configuration
     * @returns {Object} Configuration object (copy)
     */
    static getConfig() {
        return Object.assign({}, MyDrive._state.config);
    }
    
    /**
     * Set configuration
     * @param {Object} newConfig New configuration
     */
    static setConfig(newConfig) {
        if (!newConfig || typeof newConfig !== 'object') {
            throw new Error("Configuration must be an object");
        }
        
        MyDrive._state.config = Object.assign({}, MyDrive._state.config, newConfig);
        MyDrive._saveConfig();
        
        KernelLogger.info("MyDrive", "配置已更新", MyDrive._state.config);
    }
    
    /**
     * Cleanup resources
     */
    static cleanup() {
        if (!MyDrive._initialized) {
            return;
        }
        
        try {
            // Clear cache
            MyDrive._state.cache.clear();
            
            KernelLogger.info("MyDrive", "资源清理完成");
        } catch (error) {
            KernelLogger.error("MyDrive", "资源清理失败", error);
        }
    }
}

// Auto-initialize (if module is loaded)
if (typeof KernelLogger !== 'undefined') {
    // Delay initialization to ensure dependencies are loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            MyDrive.init();
            MyDrive._publishLoadSignal();
        });
    } else {
        // DOM already loaded, initialize directly
        MyDrive.init();
        MyDrive._publishLoadSignal();
    }
}

// Export to global scope (if POOL unavailable)
if (typeof window !== 'undefined') {
    window.MyDrive = MyDrive;
} else if (typeof globalThis !== 'undefined') {
    globalThis.MyDrive = MyDrive;
}
```

## Dependency Management

### Declaring Dependencies

All module dependencies must be declared in `bootloader/starter.js`:

```javascript
// bootloader/starter.js
const MODULE_DEPENDENCIES = {
    // Your module
    "../kernel/drive/myDrive.js": [
        "../kernel/core/logger/kernelLogger.js",  // Dependency: KernelLogger
        "../kernel/drive/LStorage.js",            // Dependency: LStorage
        "../kernel/process/processManager.js"     // Dependency: ProcessManager
    ],
};
```

**Rules**:
- Key: Module file path (relative to `test/index.html`)
- Value: Array of dependency module paths
- Empty array `[]` means no dependencies (or only depends on modules loaded in HTML)

### Waiting for Dependencies

If module needs to wait for dependencies:

```javascript
static async init() {
    if (MyDrive._initialized) return;
    
    // Wait for dependency module to load
    const Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
    if (Dependency && typeof Dependency.waitLoaded === 'function') {
        try {
            await Dependency.waitLoaded("../kernel/drive/LStorage.js", {
                interval: 50,
                timeout: 5000
            });
        } catch (error) {
            KernelLogger.error("MyDrive", "等待依赖加载失败", error);
            // Decide whether to continue or fail
        }
    }
    
    // Check if dependency is available
    if (typeof LStorage === 'undefined') {
        KernelLogger.warn("MyDrive", "LStorage 不可用，使用降级方案");
        // Use fallback or fail initialization
    }
    
    // Continue initialization
    MyDrive._initialized = true;
}
```

### Checking Dependencies

Check dependency availability in methods:

```javascript
static doSomething() {
    // Check dependency
    if (typeof LStorage === 'undefined') {
        KernelLogger.warn("MyDrive", "LStorage 不可用，无法执行操作");
        return;
    }
    
    // Use dependency
    const data = LStorage.getSystemStorage('key');
}
```

## POOL Registration

### Registering to POOL

Modules should register to POOL for access by other modules:

```javascript
static _registerToPool() {
    if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
        try {
            // Ensure pool category exists
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__SET__("KERNEL_GLOBAL_POOL", "MyDrive", MyDrive);
            KernelLogger.debug("MyDrive", "已注册到 POOL");
        } catch (e) {
            KernelLogger.warn("MyDrive", `注册到 POOL 失败: ${e.message}`);
        }
    }
}
```

### Accessing Other Modules from POOL

```javascript
// Get module from POOL
const LStorage = POOL.__GET__("KERNEL_GLOBAL_POOL", "LStorage");
if (LStorage) {
    const data = LStorage.getSystemStorage('key');
}

// Get ProcessManager
const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");
if (ProcessManager) {
    const processes = ProcessManager.listProcesses();
}
```

### POOL Key Naming

- Use module class name as POOL key (e.g., `"MyDrive"`)
- Keep naming consistent
- Avoid generic names (e.g., `"Manager"`, `"Service"`)

## Logging

### Using KernelLogger

**CRITICAL**: All kernel modules must use KernelLogger, never use `console.log`:

```javascript
// ✅ Correct: Use KernelLogger
KernelLogger.info("MyDrive", "模块初始化");
KernelLogger.warn("MyDrive", "警告信息");
KernelLogger.error("MyDrive", "错误信息", error);
KernelLogger.debug("MyDrive", "调试信息");

// ❌ Wrong: Never use console.log
console.log("模块初始化");
console.warn("警告信息");
console.error("错误信息");
```

### Log Levels

Use appropriate log levels:

```javascript
// DEBUG - Detailed debugging information
KernelLogger.debug("MyDrive", "调试信息");

// INFO - General information (module initialization, operation completion)
KernelLogger.info("MyDrive", "模块初始化完成");

// WARN - Warning information (non-fatal errors)
KernelLogger.warn("MyDrive", "配置未找到，使用默认值");

// ERROR - Error information (fatal errors)
KernelLogger.error("MyDrive", "初始化失败", error);
```

### Logging Best Practices

- **Initialization**: Use `info` level for module initialization
- **Operation completion**: Use `info` level for important operations
- **Warnings**: Use `warn` level for recoverable errors
- **Fatal errors**: Use `error` level for fatal errors, include error object
- **Debugging**: Use `debug` level for detailed debugging information

## Signal Publishing

### Why Publish Signals?

Modules must publish load signals to notify dependency manager:

```javascript
// After initialization
MyDrive._publishLoadSignal();
```

**Why**:
- Notifies DependencyConfig that module has loaded
- Allows dependent modules to proceed
- Required for proper dependency resolution

### Publishing Signal

```javascript
static _publishLoadSignal() {
    // Prefer DependencyConfig.publishSignal
    if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
        DependencyConfig.publishSignal("../kernel/drive/myDrive.js");
    } else if (typeof document !== 'undefined' && document.body) {
        // Fallback: dispatch event
        document.body.dispatchEvent(
            new CustomEvent("dependencyLoaded", {
                detail: {
                    name: "../kernel/drive/myDrive.js",
                },
            })
        );
    } else {
        // Delay signal publishing
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
```

**Important**: Module path must exactly match path in `bootloader/starter.js`

## Memory Management

### Using KernelMemory

For persistent kernel data:

```javascript
// Save data
KernelMemory.saveData('MYDRIVE_CONFIG', config);

// Load data
const config = KernelMemory.loadData('MYDRIVE_CONFIG');

// Check if data exists
if (KernelMemory.hasData('MYDRIVE_CONFIG')) {
    const config = KernelMemory.loadData('MYDRIVE_CONFIG');
}

// Delete data
KernelMemory.deleteData('MYDRIVE_CONFIG');
```

### Using LStorage

For system storage (registry-like):

```javascript
// Save system storage
LStorage.setSystemStorage('system.myDriveConfig', config);

// Load system storage
const config = LStorage.getSystemStorage('system.myDriveConfig');
```

### Process Memory

If module needs to allocate memory for processes (rare):

```javascript
// Allocate heap memory for process
const heapId = MemoryManager.allocateHeap(pid, size);

// Allocate stack memory for process
const shedId = MemoryManager.allocateShed(pid, size);
```

**Note**: Kernel modules usually don't allocate process memory; this is ProcessManager's responsibility.

## Common Patterns

### Pattern 1: Simple Drive Module

```javascript
// kernel/drive/simpleDrive.js
KernelLogger.info("SimpleDrive", "模块初始化");

class SimpleDrive {
    static _initialized = false;
    
    static init() {
        if (SimpleDrive._initialized) return;
        
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

// Auto-initialize
if (typeof KernelLogger !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            SimpleDrive.init();
            SimpleDrive._publishLoadSignal();
        });
    } else {
        SimpleDrive.init();
        SimpleDrive._publishLoadSignal();
    }
}
```

### Pattern 2: Drive with Configuration

```javascript
// kernel/drive/configDrive.js
KernelLogger.info("ConfigDrive", "模块初始化");

class ConfigDrive {
    static _initialized = false;
    static _config = {
        enabled: true,
        timeout: 5000
    };
    
    static init() {
        if (ConfigDrive._initialized) return;
        
        try {
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
                ConfigDrive._config = Object.assign({}, ConfigDrive._config, savedConfig);
            }
        }
    }
    
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            POOL.__SET__("KERNEL_GLOBAL_POOL", "ConfigDrive", ConfigDrive);
        }
    }
    
    static getConfig() {
        return Object.assign({}, ConfigDrive._config);
    }
    
    static setConfig(newConfig) {
        ConfigDrive._config = Object.assign({}, ConfigDrive._config, newConfig);
        if (typeof LStorage !== 'undefined') {
            LStorage.setSystemStorage('system.configDriveConfig', ConfigDrive._config);
        }
    }
}

// Auto-initialize
if (typeof KernelLogger !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ConfigDrive.init();
            ConfigDrive._publishLoadSignal();
        });
    } else {
        ConfigDrive.init();
        ConfigDrive._publishLoadSignal();
    }
}
```

### Pattern 3: Drive with Dependencies

```javascript
// kernel/drive/dependentDrive.js
KernelLogger.info("DependentDrive", "模块初始化");

class DependentDrive {
    static _initialized = false;
    
    static async init() {
        if (DependentDrive._initialized) return;
        
        try {
            // Wait for dependency
            const Dependency = POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency");
            if (Dependency && typeof Dependency.waitLoaded === 'function') {
                await Dependency.waitLoaded("../kernel/drive/LStorage.js", {
                    interval: 50,
                    timeout: 5000
                });
            }
            
            // Check dependency availability
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
        
        // Check dependency
        if (typeof LStorage === 'undefined') {
            KernelLogger.warn("DependentDrive", "LStorage 不可用");
            return;
        }
        
        // Use dependency
        const data = LStorage.getSystemStorage('key');
        KernelLogger.info("DependentDrive", "执行工作", data);
    }
}

// Auto-initialize
if (typeof KernelLogger !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            DependentDrive.init().then(() => {
                DependentDrive._publishLoadSignal();
            });
        });
    } else {
        DependentDrive.init().then(() => {
            DependentDrive._publishLoadSignal();
        });
    }
}
```

### Pattern 4: Drive with Process Cleanup

```javascript
// kernel/drive/processAwareDrive.js
KernelLogger.info("ProcessAwareDrive", "模块初始化");

class ProcessAwareDrive {
    static _initialized = false;
    static _processSessions = new Map();  // Map<pid, session>
    
    static init() {
        if (ProcessAwareDrive._initialized) return;
        
        try {
            // Register cleanup handler with ProcessManager
            if (typeof ProcessManager !== 'undefined') {
                // ProcessManager will call cleanup on process exit
                // Implementation depends on ProcessManager API
            }
            
            ProcessAwareDrive._initialized = true;
            ProcessAwareDrive._registerToPool();
            KernelLogger.info("ProcessAwareDrive", "模块初始化完成");
        } catch (error) {
            KernelLogger.error("ProcessAwareDrive", "模块初始化失败", error);
        }
    }
    
    static createSession(pid, options) {
        if (!ProcessAwareDrive._initialized) {
            throw new Error("模块未初始化");
        }
        
        const session = {
            pid: pid,
            options: options,
            createdAt: Date.now()
        };
        
        ProcessAwareDrive._processSessions.set(pid, session);
        KernelLogger.debug("ProcessAwareDrive", `创建会话 PID: ${pid}`);
        
        return session;
    }
    
    static cleanupProcess(pid) {
        if (ProcessAwareDrive._processSessions.has(pid)) {
            ProcessAwareDrive._processSessions.delete(pid);
            KernelLogger.debug("ProcessAwareDrive", `清理进程会话 PID: ${pid}`);
        }
    }
    
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            POOL.__SET__("KERNEL_GLOBAL_POOL", "ProcessAwareDrive", ProcessAwareDrive);
        }
    }
}

// Auto-initialize
if (typeof KernelLogger !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ProcessAwareDrive.init();
            ProcessAwareDrive._publishLoadSignal();
        });
    } else {
        ProcessAwareDrive.init();
        ProcessAwareDrive._publishLoadSignal();
    }
}
```

## Best Practices

### 1. Always Use KernelLogger

```javascript
// ✅ Correct
KernelLogger.info("MyDrive", "模块初始化");

// ❌ Wrong
console.log("模块初始化");
```

### 2. Check Initialization State

```javascript
static doSomething() {
    if (!MyDrive._initialized) {
        KernelLogger.warn("MyDrive", "模块未初始化，无法执行操作");
        throw new Error("MyDrive 模块未初始化");
    }
    // Implementation
}
```

### 3. Handle Errors Gracefully

```javascript
static init() {
    try {
        // Initialization logic
        MyDrive._initialized = true;
        KernelLogger.info("MyDrive", "模块初始化完成");
    } catch (error) {
        KernelLogger.error("MyDrive", "模块初始化失败", error);
        // Don't throw error, allow system to continue
        // Or throw based on criticality
    }
}
```

### 4. Register to POOL

```javascript
static _registerToPool() {
    if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
        try {
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__SET__("KERNEL_GLOBAL_POOL", "MyDrive", MyDrive);
        } catch (e) {
            KernelLogger.warn("MyDrive", `注册到 POOL 失败: ${e.message}`);
        }
    }
}
```

### 5. Publish Load Signal

```javascript
// After initialization
MyDrive._publishLoadSignal();
```

### 6. Declare Dependencies

```javascript
// bootloader/starter.js
const MODULE_DEPENDENCIES = {
    "../kernel/drive/myDrive.js": [
        "../kernel/core/logger/kernelLogger.js",
        "../kernel/drive/LStorage.js"
    ],
};
```

### 7. Use Static Class Design

```javascript
// ✅ Correct: Static class
class MyDrive {
    static _initialized = false;
    static init() { /* ... */ }
    static doSomething() { /* ... */ }
}

// ❌ Wrong: Instance class (for kernel modules)
class MyDrive {
    constructor() { /* ... */ }
    init() { /* ... */ }
}
```

### 8. Prevent Duplicate Initialization

```javascript
static _initialized = false;
static _initializing = false;

static init() {
    if (MyDrive._initialized) return;
    if (MyDrive._initializing) return;
    
    MyDrive._initializing = true;
    try {
        // Initialization logic
        MyDrive._initialized = true;
    } finally {
        MyDrive._initializing = false;
    }
}
```

### 9. Check Module Availability

```javascript
static doSomething() {
    // Check if dependency is available
    if (typeof LStorage === 'undefined') {
        KernelLogger.warn("MyDrive", "LStorage 不可用");
        return;
    }
    
    // Use dependency
    const data = LStorage.getSystemStorage('key');
}
```

### 10. Clean Up Resources

```javascript
static cleanup() {
    if (!MyDrive._initialized) return;
    
    try {
        // Clear cache
        MyDrive._state.cache.clear();
        
        // Remove event listeners
        // Clear timers
        // etc.
        
        KernelLogger.info("MyDrive", "资源清理完成");
    } catch (error) {
        KernelLogger.error("MyDrive", "资源清理失败", error);
    }
}
```

## File Location and Directory Selection

### Directory Structure

```
kernel/
├── core/              # Core modules
│   ├── logger/        # Logging system
│   ├── signal/        # Dependency management, POOL
│   ├── typePool/      # Type pools (enums)
│   ├── exceptionHM/   # Exception handling
│   ├── safemode/      # Safe mode
│   └── usercontrol/   # User control
├── filesystem/        # Filesystem modules
├── memory/            # Memory management modules
├── process/           # Process management modules
├── drive/             # Drive modules
└── dynamicModule/     # Dynamic module management

system/ui/             # UI modules
├── guiManager.js
├── taskbarManager.js
├── notificationManager.js
└── eventManager.js
```

### Choosing Directory

| Module Type | Directory | Example |
|------------|-----------|---------|
| Core functionality | `kernel/core/` | Logger, dependency management |
| Filesystem | `kernel/filesystem/` | Disk, file tree |
| Memory | `kernel/memory/` | Heap, stack, memory manager |
| Process | `kernel/process/` | Process manager, permissions |
| Drive | `kernel/drive/` | Network, storage, encryption |
| UI | `system/ui/` | GUI manager, taskbar |

## Testing

### Manual Testing

1. Place module file in appropriate directory
2. Declare dependencies in `bootloader/starter.js`
3. Restart system or reload page
4. Check browser console for initialization logs
5. Test module methods in browser console

### Browser Console Testing

```javascript
// Check if module is loaded
if (typeof MyDrive !== 'undefined') {
    // Check if initialized
    if (MyDrive._initialized) {
        // Call module methods
        MyDrive.doSomething();
    } else {
        // Manually initialize
        MyDrive.init();
    }
}

// Check POOL registration
const MyDrive = POOL.__GET__("KERNEL_GLOBAL_POOL", "MyDrive");
if (MyDrive) {
    MyDrive.doSomething();
}
```

## Common Issues and Solutions

### Issue: Module not loading

**Cause**: Dependency not declared or path incorrect

**Solution**: 
1. Check dependencies in `bootloader/starter.js`
2. Verify module path matches exactly
3. Check console for loading errors

### Issue: "模块未初始化"

**Cause**: Module not initialized or initialization failed

**Solution**:
1. Check initialization logs
2. Verify dependencies are loaded
3. Check for initialization errors

### Issue: Dependency not available

**Cause**: Dependency not loaded or wrong path

**Solution**:
1. Check dependency declaration
2. Wait for dependency using `waitLoaded`
3. Check dependency availability before use

### Issue: POOL registration fails

**Cause**: POOL not available or category not initialized

**Solution**:
1. Check POOL availability
2. Initialize category if needed
3. Handle registration errors gracefully

### Issue: Signal not published

**Cause**: Forgot to call `_publishLoadSignal()`

**Solution**: Always call `_publishLoadSignal()` after initialization

## Differences: Kernel Modules vs Programs

| Feature | Kernel Module | Program |
|---------|---------------|---------|
| **Location** | `kernel/` or `system/ui/` | `system/service/DISK/D/application/` |
| **Lifecycle** | Loaded on boot, unloaded on shutdown | Started/stopped by user or system |
| **Management** | DependencyConfig | ProcessManager |
| **Initialization** | `init()` static method | `__init__()` instance method |
| **PID** | No PID | Has PID |
| **Permissions** | No permissions needed (kernel privilege) | Must declare permissions |
| **Purpose** | System functionality | User functionality |

## References

- Kernel Developer Guide: `docs/KERNEL_DEVELOPER_GUIDE.md`
- ZerOS Kernel: `docs/ZEROS_KERNEL.md`
- System Flow: `docs/SYSTEM_FLOW.md`
- DependencyConfig API: `docs/API/DependencyConfig.md`
- Pool API: `docs/API/Pool.md`
- KernelLogger API: `docs/API/KernelLogger.md`
- Kernel Interaction Skill: `dev/skill/zeros-kernel-interaction/SKILL.md`
