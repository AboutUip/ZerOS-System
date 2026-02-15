---
name: zeros-kernel-interaction
description: Guide for interacting with ZerOS kernel and system APIs. Use when working with ZerOS kernel modules, calling kernel APIs from programs, accessing system services, or understanding how programs communicate with the ZerOS kernel.
---

# ZerOS Kernel and System Interaction Guide

This skill provides guidance on how to interact with ZerOS kernel and system APIs, including kernel module development, program-to-kernel communication, and system service access.

## Core Concepts

### ZerOS Architecture

ZerOS is a browser-based virtual operating system kernel with:
- **Kernel modules**: Core system functionality (process management, memory, filesystem, etc.)
- **POOL**: Object pool for module data sharing and communication
- **ProcessManager**: Manages program lifecycle and kernel API calls
- **Permission system**: Controls access to kernel APIs

### Module Communication

Kernel modules communicate through:
- **POOL**: `POOL.__GET__("KERNEL_GLOBAL_POOL", "ModuleName")` to access modules
- **Direct access**: Modules registered globally via `window.ModuleName` or `globalThis.ModuleName`
- **Dependency management**: Modules declared in `bootloader/starter.js`

## Program-to-Kernel API Calls

### Method 1: Process-Bound API (Recommended)

Use `initArgs.kernelAPI.call()` for secure, process-bound API calls:

```javascript
async __init__(pid, initArgs) {
    this.pid = pid;
    this.kernelAPI = initArgs.kernelAPI;  // Save bound API
    
    // Call kernel API without passing pid
    const content = await this.kernelAPI.call('Disk.read', ['D:/myfile.txt']);
    await this.kernelAPI.call('Notification.create', [{
        title: 'Success',
        content: 'File read successfully'
    }]);
}
```

**Advantages**:
- No PID parameter needed (bound to process)
- Prevents PID spoofing (CVS_ZEROS_009 mitigation)
- Recommended for sensitive or multi-instance programs

### Method 2: Standard API Call

Use `ProcessManager.callKernelAPI()` for standard calls:

```javascript
// Call kernel API with explicit PID
const result = await ProcessManager.callKernelAPI(this.pid, 'Disk.read', ['D:/myfile.txt']);

// Example: Create notification
await ProcessManager.callKernelAPI(this.pid, 'Notification.create', [{
    title: 'Info',
    content: 'Operation completed',
    type: 'info',
    duration: 3000
}]);
```

**API Format**: `'ModuleName.methodName'`
- Module name: e.g., `Disk`, `GUIManager`, `LStorage`
- Method name: e.g., `read`, `write`, `registerWindow`

## Common Kernel APIs

### File System Operations

**API Namespace**: `FileSystem.*`

```javascript
// Read file (requires KERNEL_DISK_READ)
const content = await this.kernelAPI.call('FileSystem.read', ['D:/path/to/file.txt']);

// Write file (requires KERNEL_DISK_WRITE)
await this.kernelAPI.call('FileSystem.write', ['D:/path/to/file.txt', content]);

// Delete file (requires KERNEL_DISK_DELETE)
await this.kernelAPI.call('FileSystem.delete', ['D:/path/to/file.txt']);

// Create file/directory (requires KERNEL_DISK_CREATE)
await this.kernelAPI.call('FileSystem.create', ['D:/path/to/newfile.txt', 'file']);
await this.kernelAPI.call('FileSystem.create', ['D:/path/to/newdir', 'directory']);

// List directory (requires KERNEL_DISK_LIST)
const files = await this.kernelAPI.call('FileSystem.list', ['D:/path/to/dir']);

// Note: Path format is "Disk:/path/to/file" (e.g., "C:/Users/file.txt", "D:/system/app.js")
// Supports A-Z partitions (C:, D:, E:, etc.)
```

### GUI Operations

**API Namespace**: `GUI.*`, `Notification.*`

```javascript
// Create window (requires GUI_WINDOW_CREATE)
const windowId = await this.kernelAPI.call('GUI.createWindow', [this.pid, windowElement, {
    title: 'My Window',
    icon: 'icon.svg',
    resizable: true,
    minimizable: true,
    onClose: () => {
        // Cleanup logic (don't call unregisterWindow here)
    }
}]);

// Manage window (requires GUI_WINDOW_MANAGE)
await this.kernelAPI.call('GUI.manageWindow', [windowId, 'minimize']);
await this.kernelAPI.call('GUI.manageWindow', [windowId, 'maximize']);
await this.kernelAPI.call('GUI.manageWindow', [windowId, 'close']);

// Create notification (requires SYSTEM_NOTIFICATION)
await this.kernelAPI.call('Notification.create', [{
    title: 'Title',
    content: 'Message',
    type: 'info',  // 'info', 'success', 'warning', 'error', 'snapshot'
    duration: 5000
}]);

// Remove notification
await this.kernelAPI.call('Notification.remove', [notificationId]);
```

### Storage Operations

**API Namespace**: `Storage.*`

```javascript
// Read system storage (requires SYSTEM_STORAGE_READ)
const value = await this.kernelAPI.call('Storage.read', ['key']);

// Write system storage (requires SYSTEM_STORAGE_WRITE)
// Note: Sensitive keys (userControl.*, permissionControl.*) require special permissions
await this.kernelAPI.call('Storage.write', ['key', value]);

// Program storage (no special API, use LStorage directly if available)
// Or use Storage.read/write with program-specific keys
```

### Cache Operations

```javascript
// Set cache
await this.kernelAPI.call('Cache.set', ['key', value, {
    ttl: 3600000,  // Time to live in milliseconds
    pid: this.pid
}]);

// Get cache
const value = await this.kernelAPI.call('Cache.get', ['key', defaultValue, {
    pid: this.pid
}]);

// Delete cache
await this.kernelAPI.call('Cache.delete', ['key', { pid: this.pid }]);
```

### Network Operations

**API Namespace**: `Network.*`, `Network.Port.*`

```javascript
// Network request (requires NETWORK_ACCESS, NORMAL permission)
const response = await this.kernelAPI.call('Network.request', [url, {
    method: 'GET',
    headers: {},
    body: null
}]);

// Network fetch (requires NETWORK_ACCESS)
const response = await this.kernelAPI.call('Network.fetch', [url, options]);

// TCP Port Management (requires NETWORK_ACCESS)
// Register port listener
await this.kernelAPI.call('Network.Port.register', [port, {
    onMessage: (data) => { /* handle message */ },
    onConnect: () => { /* handle connect */ },
    onDisconnect: () => { /* handle disconnect */ }
}]);

// Unregister port
await this.kernelAPI.call('Network.Port.unregister', [port]);

// Get port status
const status = await this.kernelAPI.call('Network.Port.getStatus', [port]);

// List all registered ports
const ports = await this.kernelAPI.call('Network.Port.list', []);

// Send data to port
await this.kernelAPI.call('Network.Port.send', [port, data]);
```

### Memory Operations

```javascript
// Allocate memory for process
const memoryInfo = await this.kernelAPI.call('MemoryManager.allocateMemory', [
    heapSize,  // Heap size in bytes
    shedSize   // Stack size in bytes
]);

// Free memory
await this.kernelAPI.call('MemoryManager.freeMemory', [this.pid]);
```

### Desktop Management

**API Namespace**: `Desktop.*`

```javascript
// Add shortcut (requires DESKTOP_SHORTCUT, NORMAL permission)
await this.kernelAPI.call('Desktop.addShortcut', [{
    name: 'My App',
    icon: 'icon.svg',
    programName: 'myapp',
    args: []
}]);

// Remove shortcut
await this.kernelAPI.call('Desktop.removeShortcut', ['shortcutId']);

// Get desktop icons (no permission required)
const icons = await this.kernelAPI.call('Desktop.getIcons', []);

// Get desktop config (no permission required)
const config = await this.kernelAPI.call('Desktop.getConfig', []);

// Manage desktop (requires DESKTOP_MANAGE)
await this.kernelAPI.call('Desktop.setArrangementMode', ['grid']);
await this.kernelAPI.call('Desktop.setIconSize', [48]);
await this.kernelAPI.call('Desktop.setAutoArrange', [true]);
await this.kernelAPI.call('Desktop.refresh', []);
```

### Taskbar Operations

**API Namespace**: `Taskbar.*`

```javascript
// Pin program to taskbar (requires DESKTOP_MANAGE)
await this.kernelAPI.call('Taskbar.pinProgram', ['programName']);

// Unpin program
await this.kernelAPI.call('Taskbar.unpinProgram', ['programName']);

// Get pinned programs (no permission required)
const pinned = await this.kernelAPI.call('Taskbar.getPinnedPrograms', []);

// Check if pinned
const isPinned = await this.kernelAPI.call('Taskbar.isPinned', ['programName']);

// Add custom icon to taskbar (requires DESKTOP_MANAGE)
const iconId = await this.kernelAPI.call('Taskbar.addIcon', [{
    icon: 'icon.svg',
    tooltip: 'My Tooltip',
    onClick: () => { /* handle click */ }
}]);

// Update custom icon
await this.kernelAPI.call('Taskbar.updateIcon', [iconId, {
    icon: 'new-icon.svg',
    tooltip: 'New Tooltip'
}]);

// Remove custom icon
await this.kernelAPI.call('Taskbar.removeIcon', [iconId]);
```

### Process Management

**API Namespace**: `Process.*`

```javascript
// Request background mode (requires PROCESS_BACKGROUND, NORMAL, self only)
await this.kernelAPI.call('Process.requestBackground', []);

// Register background tray click handler
await this.kernelAPI.call('Process.registerBackgroundTrayClick', [() => {
    // Restore window when tray icon clicked
}]);

// Register background tray context menu
await this.kernelAPI.call('Process.registerBackgroundTrayContextMenu', [[
    { label: 'Show', action: () => { /* show window */ } },
    { label: 'Settings', action: () => { /* open settings */ } }
    // System automatically adds 'Close' option
]]);

// Request self termination (no permission required, self only)
// Recommended: Use kernelAPI.call to avoid PID validation issues in VM/CLI programs
await this.kernelAPI.call('Process.requestSelfTermination', []);

// Manage other processes (requires PROCESS_MANAGE, DANGEROUS)
await this.kernelAPI.call('Process.manage', ['start', 'programName', initArgs]);
await this.kernelAPI.call('Process.manage', ['kill', pid]);
```

### Drag and Drop

**API Namespace**: `Drag.*`

```javascript
// Create drag session (requires DRAG_ELEMENT)
const sessionId = await this.kernelAPI.call('Drag.createSession', [element]);

// Enable/disable drag
await this.kernelAPI.call('Drag.enable', [sessionId]);
await this.kernelAPI.call('Drag.disable', [sessionId]);

// Register drop zone
await this.kernelAPI.call('Drag.registerDropZone', [element, {
    onDrop: (data) => { /* handle drop */ }
}]);

// Create file drag (requires DRAG_FILE)
await this.kernelAPI.call('Drag.createFileDrag', [element, filePath]);

// Create window drag (requires DRAG_WINDOW)
await this.kernelAPI.call('Drag.createWindowDrag', [element, windowId]);

// Get process drags
const drags = await this.kernelAPI.call('Drag.getProcessDrags', [this.pid]);
```

### Geography (Location)

**API Namespace**: `Geography.*`

```javascript
// Get current position (requires GEOGRAPHY_LOCATION)
const position = await this.kernelAPI.call('Geography.getCurrentPosition', []);

// Get cached location
const cached = await this.kernelAPI.call('Geography.getCachedLocation', []);

// Clear cache
await this.kernelAPI.call('Geography.clearCache', []);

// Check if supported (no permission required)
const supported = await this.kernelAPI.call('Geography.isSupported', []);
```

### Cryptography

**API Namespace**: `Crypt.*`

```javascript
// Generate key pair (requires CRYPT_GENERATE_KEY)
const keyPair = await this.kernelAPI.call('Crypt.generateKeyPair', []);

// Import key pair (requires CRYPT_IMPORT_KEY)
await this.kernelAPI.call('Crypt.importKeyPair', [privateKey, publicKey]);

// Get key info (no permission required)
const info = await this.kernelAPI.call('Crypt.getKeyInfo', [keyId]);

// List all keys (no permission required)
const keys = await this.kernelAPI.call('Crypt.listKeys', []);

// Delete key (requires CRYPT_DELETE_KEY)
await this.kernelAPI.call('Crypt.deleteKey', [keyId]);

// Set default key (requires CRYPT_DELETE_KEY)
await this.kernelAPI.call('Crypt.setDefaultKey', [keyId]);

// Encrypt data (requires CRYPT_ENCRYPT)
const encrypted = await this.kernelAPI.call('Crypt.encrypt', [data, keyId]);

// Decrypt data (requires CRYPT_DECRYPT)
const decrypted = await this.kernelAPI.call('Crypt.decrypt', [encrypted, keyId]);

// MD5 hash (requires CRYPT_MD5)
const hash = await this.kernelAPI.call('Crypt.md5', [data]);

// Random number generation (requires CRYPT_RANDOM)
const randomInt = await this.kernelAPI.call('Crypt.randomInt', [min, max]);
const randomFloat = await this.kernelAPI.call('Crypt.randomFloat', []);
const randomBool = await this.kernelAPI.call('Crypt.randomBoolean', []);
const randomString = await this.kernelAPI.call('Crypt.randomString', [length]);
const randomChoice = await this.kernelAPI.call('Crypt.randomChoice', [array]);
const shuffled = await this.kernelAPI.call('Crypt.shuffle', [array]);
```

### Speech Recognition

**API Namespace**: `Speech.*`

```javascript
// Check if supported (no permission required)
const supported = await this.kernelAPI.call('Speech.isSupported', []);

// Create session (requires SPEECH_RECOGNITION)
const sessionId = await this.kernelAPI.call('Speech.createSession', [{
    language: 'zh-CN',
    continuous: true,
    interimResults: true,
    onResult: (results) => { /* handle results */ },
    onError: (error) => { /* handle error */ }
}]);

// Start recognition
await this.kernelAPI.call('Speech.startRecognition', [sessionId]);

// Stop recognition
await this.kernelAPI.call('Speech.stopRecognition', [sessionId]);

// Stop session
await this.kernelAPI.call('Speech.stopSession', [sessionId]);

// Get session status
const status = await this.kernelAPI.call('Speech.getSessionStatus', [sessionId]);

// Get results
const results = await this.kernelAPI.call('Speech.getSessionResults', [sessionId]);
```

### Schedule Tasks

**API Namespace**: `ScheduleTask.*`

```javascript
// Create task (requires SCHEDULE_TASK_CREATE or SCHEDULE_TASK_STARTUP)
const taskId = await this.kernelAPI.call('ScheduleTask.create', [{
    name: 'My Task',
    type: 'program',  // 'program', 'service', 'script'
    schedule: '0 0 * * *',  // Cron expression
    enabled: true,
    config: { programName: 'myapp', args: [] }
}]);

// Get task
const task = await this.kernelAPI.call('ScheduleTask.get', [taskId]);

// Get all tasks (no permission required)
const tasks = await this.kernelAPI.call('ScheduleTask.getAll', []);

// Update task (requires SCHEDULE_TASK_MANAGE)
await this.kernelAPI.call('ScheduleTask.update', [taskId, { enabled: false }]);

// Delete task (requires SCHEDULE_TASK_MANAGE)
await this.kernelAPI.call('ScheduleTask.delete', [taskId]);

// Set enabled/disabled (requires SCHEDULE_TASK_MANAGE)
await this.kernelAPI.call('ScheduleTask.setEnabled', [taskId, true]);
```

### Language Packs

**API Namespace**: `Languages.*`

```javascript
// Load language pack (requires LANGUAGES_WRITE)
await this.kernelAPI.call('Languages.loadPack', ['zh-CN', packData]);

// Set current language (requires LANGUAGES_WRITE)
await this.kernelAPI.call('Languages.setCurrent', ['zh-CN']);

// Get text by constant name (requires LANGUAGES_READ)
const text = await this.kernelAPI.call('Languages.getText', ['CONSTANT_NAME']);

// List language packs (requires LANGUAGES_READ)
const packs = await this.kernelAPI.call('Languages.listPacks', []);

// Get current locale (requires LANGUAGES_READ)
const locale = await this.kernelAPI.call('Languages.getCurrentLocale', []);

// Get loaded locales (requires LANGUAGES_READ)
const locales = await this.kernelAPI.call('Languages.getLoadedLocales', []);
```

### Server Management

**API Namespace**: `Server.*`

**Important**: Requires `SERVER_SERVICE_MANAGE` permission (DANGEROUS level, highest priority). Programs must NOT directly call `ServerExpansion` methods.

```javascript
// List all loaded services (requires SERVER_SERVICE_MANAGE)
const services = await this.kernelAPI.call('Server.listServices', []);

// Reload all services from D/server
const loaded = await this.kernelAPI.call('Server.loadAll', []);

// Start service (calls __init__ first time, then __start__)
const success = await this.kernelAPI.call('Server.start', ['serviceId']);

// Stop service (calls __stop__)
const success = await this.kernelAPI.call('Server.stop', ['serviceId']);

// Get service status
const status = await this.kernelAPI.call('Server.status', ['serviceId']);

// Get service info
const info = await this.kernelAPI.call('Server.info', ['serviceId']);

// Check if initialized
const isInited = await this.kernelAPI.call('Server.isInited', ['serviceId']);

// Check if started
const isStarted = await this.kernelAPI.call('Server.isStarted', ['serviceId']);

// List service config options (for service management UI)
const configOptions = await this.kernelAPI.call('Server.listConfig', ['serviceId']);

// Set service config
await this.kernelAPI.call('Server.setConfig', ['serviceId', config]);
```

### Theme Management

**API Namespace**: `Theme.*`

```javascript
// Read theme (requires THEME_READ)
const theme = await this.kernelAPI.call('Theme.read', []);

// Write theme (requires THEME_WRITE)
await this.kernelAPI.call('Theme.write', [themeConfig]);
```

### Exception Handling

**API Namespace**: `Exception.*`

```javascript
// Report exception (requires SYSTEM_NOTIFICATION, NORMAL permission)
await this.kernelAPI.call('Exception.report', [
    'PROGRAM',  // Level: 'KERNEL', 'SYSTEM', 'PROGRAM', 'SERVICE'
    'Error message',
    { details: 'Additional info' },
    this.pid
]);
```

## Permission System

### Permission Levels

- **NORMAL**: Automatically granted, no user confirmation, only logged
- **SPECIAL**: First-time user confirmation, decision saved for future use
- **DANGEROUS**: Requires admin approval, may prompt each time

### Permission Declaration

Programs declare permissions in `__info__()`:

```javascript
static __info__() {
    return {
        name: 'MyProgram',
        type: 'GUI',
        permissions: [
            PermissionManager.PERMISSION.KERNEL_DISK_READ,
            PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
            PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
            PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
            PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE  // DANGEROUS
        ]
    };
}
```

### Common Permissions

**File System**:
- `KERNEL_DISK_READ`, `KERNEL_DISK_WRITE`, `KERNEL_DISK_DELETE`, `KERNEL_DISK_CREATE`, `KERNEL_DISK_LIST`

**GUI**:
- `GUI_WINDOW_CREATE`, `GUI_WINDOW_MANAGE`

**System**:
- `SYSTEM_NOTIFICATION`, `SYSTEM_STORAGE_READ`, `SYSTEM_STORAGE_WRITE`
- `SYSTEM_STORAGE_WRITE_USER_CONTROL` (DANGEROUS, admin only)
- `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL` (DANGEROUS, admin only)

**Process**:
- `PROCESS_MANAGE` (DANGEROUS), `PROCESS_BACKGROUND` (NORMAL, self only)

**Network**:
- `NETWORK_ACCESS` (NORMAL)

**Server**:
- `SERVER_SERVICE_MANAGE` (DANGEROUS, highest priority)

**Other**:
- `CRYPT_*`, `DRAG_*`, `GEOGRAPHY_LOCATION`, `SPEECH_RECOGNITION`, `CACHE_*`, `LANGUAGES_*`, `SCHEDULE_TASK_*`

### Permission Checking

Permissions are automatically checked when calling kernel APIs:
- **NORMAL**: Auto-granted, logged to audit trail
- **SPECIAL**: User dialog appears on first use, decision saved
- **DANGEROUS**: Admin approval required, may prompt each time

**Important**: 
- Exploit program (PID 10000) bypasses all permission checks
- Permission decisions are cached for 5 seconds (TTL)
- Permission violations are logged to audit trail

## Kernel Module Development

### Module Structure

```javascript
// kernel/drive/myDrive.js
KernelLogger.info("MyDrive", "模块初始化");

class MyDrive {
    static _initialized = false;
    
    static init() {
        if (MyDrive._initialized) return;
        
        try {
            MyDrive._initialized = true;
            MyDrive._registerToPool();
            KernelLogger.info("MyDrive", "模块初始化完成");
        } catch (error) {
            KernelLogger.error("MyDrive", "模块初始化失败", error);
        }
    }
    
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && POOL && typeof POOL.__SET__ === 'function') {
            POOL.__SET__("KERNEL_GLOBAL_POOL", "MyDrive", MyDrive);
        }
    }
    
    static doSomething() {
        if (!MyDrive._initialized) {
            KernelLogger.warn("MyDrive", "模块未初始化");
            return;
        }
        // Implementation
    }
}

// Auto-initialize
if (typeof KernelLogger !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => MyDrive.init());
    } else {
        MyDrive.init();
    }
}

// Publish load signal
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/drive/myDrive.js");
}
```

### Key Requirements

1. **Use KernelLogger**: Never use `console.log`, always use `KernelLogger.info/warn/error/debug`
2. **Register to POOL**: Use `POOL.__SET__("KERNEL_GLOBAL_POOL", "ModuleName", ModuleClass)`
3. **Declare dependencies**: Add to `bootloader/starter.js` `MODULE_DEPENDENCIES`
4. **Publish signal**: Call `DependencyConfig.publishSignal()` after initialization
5. **Check initialization**: Always check `_initialized` flag before operations

### Accessing Other Modules

```javascript
// From POOL
const LStorage = POOL.__GET__("KERNEL_GLOBAL_POOL", "LStorage");
if (LStorage) {
    const data = LStorage.getSystemStorage('key');
}

// From global
if (typeof ProcessManager !== 'undefined') {
    ProcessManager.getProcessInfo(pid);
}
```

## System Information

### Get System Info

```javascript
// System version
const version = SystemInformation.getSystemVersion();
const kernelVersion = SystemInformation.getKernelVersion();

// Service URLs
const fsUrl = SystemInformation.getFSDirveUrl();
const origin = SystemInformation.getOrigin();

// Host environment
const env = SystemInformation.getHostEnvironment();
```

## Process Management

### Get Process Information

```javascript
// From program context
const processInfo = ProcessManager.getProcessInfo(this.pid);

// Check if process exists
const exists = ProcessManager.hasProcess(pid);

// List all processes
const processes = ProcessManager.listProcesses();
```

### Self-Termination

```javascript
// Recommended: Use bound API
await this.kernelAPI.call('Process.requestSelfTermination', []);

// Alternative: Standard API
await ProcessManager.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
```

## Best Practices

1. **Use bound API**: Prefer `initArgs.kernelAPI.call()` for security (prevents PID spoofing)
2. **Handle errors**: Always wrap API calls in try-catch blocks
3. **Check permissions**: Ensure program declares required permissions in `__info__()`
4. **Log operations**: Use KernelLogger for debugging (in kernel modules), never use `console.log`
5. **Clean up resources**: Unregister windows, clear caches, stop sessions on exit
6. **Follow patterns**: Use existing modules as reference for structure
7. **VM/CLI programs**: Use bound API for self-termination to avoid PID validation issues
8. **Error handling**: Provide user-friendly error messages via notifications
9. **Resource lifecycle**: Properly initialize and cleanup all resources (drag sessions, speech sessions, etc.)
10. **Security**: Never bypass permission checks, always declare required permissions

## Common Patterns

### Async API Call Pattern

```javascript
try {
    const result = await this.kernelAPI.call('Module.method', [arg1, arg2]);
    // Handle success
} catch (error) {
    // Handle error
    await this.kernelAPI.call('Notification.create', [{
        title: 'Error',
        content: error.message,
        type: 'error'
    }]);
}
```

### Resource Cleanup Pattern

```javascript
async __exit__(pid, force) {
    try {
        // Cleanup GUI windows
        if (this.windowId) {
            await this.kernelAPI.call('GUI.manageWindow', [this.windowId, 'close']);
        }
        
        // Cleanup drag sessions
        if (this.dragSessionId) {
            await this.kernelAPI.call('Drag.destroySession', [this.dragSessionId]);
        }
        
        // Cleanup speech sessions
        if (this.speechSessionId) {
            await this.kernelAPI.call('Speech.stopSession', [this.speechSessionId]);
        }
        
        // Cleanup cache
        await this.kernelAPI.call('Cache.delete', ['myCacheKey', { pid: this.pid }]);
        
        // Cleanup network ports
        if (this.registeredPorts) {
            for (const port of this.registeredPorts) {
                await this.kernelAPI.call('Network.Port.unregister', [port]);
            }
        }
        
        // Cleanup taskbar icons
        if (this.taskbarIconId) {
            await this.kernelAPI.call('Taskbar.removeIcon', [this.taskbarIconId]);
        }
        
        // Storage persists, but can clear if needed
    } catch (error) {
        // Log cleanup errors but don't throw
        console.error('Cleanup error:', error);
    }
}
```

### Error Handling Pattern

```javascript
async performOperation() {
    try {
        const result = await this.kernelAPI.call('FileSystem.read', ['D:/file.txt']);
        return result;
    } catch (error) {
        // Check error type
        if (error.message.includes('没有权限') || error.message.includes('permission')) {
            await this.kernelAPI.call('Notification.create', [{
                title: '权限不足',
                content: '程序需要文件读取权限',
                type: 'error',
                duration: 5000
            }]);
        } else if (error.message.includes('不存在') || error.message.includes('not found')) {
            await this.kernelAPI.call('Notification.create', [{
                title: '文件不存在',
                content: '无法找到指定的文件',
                type: 'warning',
                duration: 3000
            }]);
        } else {
            // Report unexpected errors
            await this.kernelAPI.call('Exception.report', [
                'PROGRAM',
                `Operation failed: ${error.message}`,
                { error: error.toString(), stack: error.stack },
                this.pid
            ]);
        }
        throw error; // Re-throw for caller handling
    }
}
```

### Background Process Pattern

```javascript
async __init__(pid, initArgs) {
    this.pid = pid;
    this.kernelAPI = initArgs.kernelAPI;
    this.isBackground = false;
    
    // Register background handlers
    await this.kernelAPI.call('Process.registerBackgroundTrayClick', [() => {
        this.restoreWindow();
    }]);
    
    await this.kernelAPI.call('Process.registerBackgroundTrayContextMenu', [[
        { label: 'Show', action: () => this.restoreWindow() },
        { label: 'Settings', action: () => this.openSettings() }
    ]]);
}

async onWindowClose() {
    // Request background mode instead of exiting
    await this.kernelAPI.call('Process.requestBackground', []);
    this.hideWindow();
    this.isBackground = true;
}

async restoreWindow() {
    this.showWindow();
    await this.kernelAPI.call('GUI.manageWindow', [this.windowId, 'focus']);
    this.isBackground = false;
}
```

## Security Considerations

### PID Spoofing Prevention (CVS_ZEROS_009)

- **Use bound API**: `initArgs.kernelAPI.call()` prevents PID spoofing
- **Call stack validation**: Standard API validates caller PID against call stack
- **Exploit PID protection**: Application layer cannot use Exploit PID (10000)

### Permission Security

- **Always declare permissions**: Missing permissions cause API calls to fail
- **DANGEROUS permissions**: Require admin approval, highest security level
- **Permission caching**: 5-second TTL prevents excessive checks
- **Audit trail**: All permission operations are logged

### Best Security Practices

1. Never bypass permission checks
2. Use bound API for sensitive operations
3. Validate all user inputs before API calls
4. Handle permission errors gracefully
5. Report security issues via Exception.report

## Common Issues and Solutions

### Issue: "API调用拒绝(PID校验)"

**Cause**: Call stack doesn't match provided PID (VM/CLI programs)

**Solution**: Use bound API `this.kernelAPI.call()` instead of `ProcessManager.callKernelAPI(this.pid, ...)`

### Issue: "没有权限" / "Permission denied"

**Cause**: Missing permission declaration or insufficient user level

**Solution**: 
1. Add permission to `__info__().permissions`
2. For DANGEROUS permissions, ensure admin user
3. Check permission level (NORMAL/SPECIAL/DANGEROUS)

### Issue: "磁盘分区不存在"

**Cause**: Partition not initialized or invalid path format

**Solution**: 
1. Use correct path format: `"D:/path/to/file"` (not `"D:\path\to\file"`)
2. Ensure partition exists: `Disk.diskSeparateMap.has('D:')`
3. Check NodeTree initialization

### Issue: "模块未初始化"

**Cause**: Kernel module not loaded or initialization failed

**Solution**:
1. Check module dependencies in `bootloader/starter.js`
2. Verify module registered to POOL
3. Check KernelLogger for initialization errors

## References

### Core Documentation
- Kernel Developer Guide: `docs/KERNEL_DEVELOPER_GUIDE.md`
- System Flow: `docs/SYSTEM_FLOW.md`
- ZerOS Kernel: `docs/ZEROS_KERNEL.md`
- Developer Guide: `docs/DEVELOPER_GUIDE.md`

### API Documentation
- ProcessManager API: `docs/API/ProcessManager.md`
- PermissionManager API: `docs/API/PermissionManager.md`
- GUIManager API: `docs/API/GUIManager.md`
- Disk API: `docs/API/Disk.md`
- ServerExpansion API: `docs/API/ServerExpansion.md`
- API Index: `docs/API/README.md`

### Service Documentation
- Service Module Guide: `docs/SERVER/ServiceModule.md`
- Server README: `docs/SERVER/README.md`

### Extension Documentation
- Plugins README: `docs/PLUGINS/README.md`
- Language Pack: `docs/PLUGINS/LanguagePack.md`
