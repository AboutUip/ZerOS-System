---
name: zeros-server-development
description: Guide for developing system services in ZerOS D/server directory. Use when creating background services, system services, or server modules that run in D/server/ directory and are managed by ServerExpansion.
---

# ZerOS System Service Development Guide

This skill provides comprehensive guidance for developing system services in ZerOS. System services are background modules located in the `D/server/` directory and managed by ServerExpansion.

## Overview

### What are System Services?

System services are background modules that:
- Located in `D/server/` directory (virtual path)
- Actual path: `system/service/DISK/D/server/`
- Named as `server-<id>.js` (e.g., `server-myservice.js`, id is `myservice`)
- Automatically loaded by ServerExpansion on system startup
- Managed through Server.* API (requires SERVER_SERVICE_MANAGE permission)
- Run in main window context (no separate process)
- Use PID 10000 (SERVER_SERVICE_PID) for kernel API calls

### Key Characteristics

- **Location**: `D/server/server-<id>.js`
- **Auto-loading**: Automatically scanned and loaded by ServerExpansion on boot
- **Lifecycle**: `__init__` (first start only) → `__start__` → `__stop__`
- **No Process**: Services run in main window, not as separate processes
- **PID Convention**: Use `ProcessManager.SERVER_SERVICE_PID` (10000) for kernel API calls

## Service Structure

### Required Methods

Every service module must provide these **five methods** (all must be functions):

| Method | Description | When Called |
|--------|-------------|-------------|
| `__init__` | Initialize (called only once on first start) | First time `Server.start(id)` is called |
| `__start__` | Start service | Every time `Server.start(id)` is called |
| `__stop__` | Stop service | When `Server.stop(id)` is called |
| `__status__` | Return current status (any value) | When `Server.status(id)` is called |
| `__info__` | Return service information (any value) | When `Server.info(id)` is called |

### Optional Methods

| Method | Description | When Called |
|--------|-------------|-------------|
| `__list__` | Return configurable items list | When `Server.listConfig(id)` is called |
| `__set__` | Receive and persist configuration | When `Server.setConfig(id, config)` is called |

**Note**: If `__set__` is implemented, `__list__` must also be implemented.

### Basic Template

```javascript
(function () {
    'use strict';

    /** Service PID (kernel allows this PID) */
    var _pid = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;

    var _running = false;
    var _initialized = false;

    /**
     * Initialize (called only once on first start)
     */
    function __init__() {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-myservice', 'Service initialized');
        }
        _initialized = true;
    }

    /**
     * Start service
     */
    function __start__() {
        if (_running) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-myservice', 'Service already running');
            }
            return;
        }

        _running = true;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-myservice', 'Service started');
        }

        // Start your service logic here
        // e.g., start polling, set up event listeners, etc.
    }

    /**
     * Stop service
     */
    function __stop__() {
        if (!_running) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-myservice', 'Service not running');
            }
            return;
        }

        _running = false;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-myservice', 'Service stopped');
        }

        // Clean up resources here
        // e.g., clear timers, remove event listeners, etc.
    }

    /**
     * Get service status
     */
    function __status__() {
        return {
            running: _running,
            initialized: _initialized
        };
    }

    /**
     * Get service information
     */
    function __info__() {
        return {
            name: 'MyService',
            version: '1.0.0',
            description: 'My service description'
        };
    }

    // Register service
    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__({
            __init__: __init__,
            __start__: __start__,
            __stop__: __stop__,
            __status__: __status__,
            __info__: __info__
        });
    }
})();
```

## Registration

### Registration Function

Services must register themselves using the global registration function:

```javascript
if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
    window.__ZerOS_ServerExpansion_Register__({
        __init__: __init__,
        __start__: __start__,
        __stop__: __stop__,
        __status__: __status__,
        __info__: __info__
    });
}
```

**Important**:
- Registration function: `window.__ZerOS_ServerExpansion_Register__`
- Must be called at script execution end
- All five methods must be functions
- If registration fails or methods are missing, service won't be recognized

## Service Lifecycle

### Loading Phase

1. **System Boot**: ServerExpansion automatically scans `D/server/` directory
2. **Load Scripts**: All `server-*.js` files are loaded
3. **Check Compliance**: Verify registration and required methods
4. **No Method Calls**: No service methods are called during loading

### First Start

1. **Call `__init__`**: Initialize service (only once)
2. **Call `__start__`**: Start service
3. **Service Running**: Service is now active

### Subsequent Starts

1. **Skip `__init__`**: Not called again
2. **Call `__start__`**: Start service again
3. **Service Running**: Service is active

### Stop

1. **Call `__stop__`**: Stop service
2. **Cleanup**: Service should clean up resources
3. **Service Stopped**: Service is inactive

## PID Convention

### Using SERVER_SERVICE_PID

Services run in main window context and use PID 10000 for kernel API calls:

```javascript
/** Service PID (kernel allows this PID) */
var _pid = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
    ? ProcessManager.SERVER_SERVICE_PID
    : 10000;
```

**Why PID 10000?**
- Kernel permissions allow this PID (hasPermission passes, blacklist doesn't block)
- Services run in main window, not as separate processes
- Consistent PID for all services

### Calling Kernel APIs

```javascript
// Direct API calls (services run in main window context)
if (typeof NotificationManager !== 'undefined') {
    NotificationManager.createNotification(_pid, {
        type: 'snapshot',
        title: 'Service Notification',
        content: 'Message from service'
    });
}

// Using ProcessManager.callKernelAPI (if needed)
if (typeof ProcessManager !== 'undefined') {
    ProcessManager.callKernelAPI(_pid, 'FileSystem.read', ['D:/file.txt']);
}
```

## Configuration Management

### Implementing Configurable Services

If your service needs configuration, implement both `__list__` and `__set__`:

```javascript
/** Configuration storage key */
var _CONFIG_KEY = 'zeros_server_myservice_config';

/** Default configuration */
var _defaultConfig = {
    enabled: true,
    interval: 3000,
    apiUrl: ''
};

/** Current configuration */
var _config = _defaultConfig;

/**
 * Load configuration from LStorage
 */
async function _loadConfig() {
    if (typeof LStorage === 'undefined') return;
    
    try {
        // CRITICAL: Check and initialize before use
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        var saved = LStorage.getSystemStorage(_CONFIG_KEY);
        if (saved && typeof saved === 'object') {
            _config = Object.assign({}, _defaultConfig, saved);
        }
    } catch (e) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.warn('server-myservice', 'Failed to load config: ' + e.message);
        }
    }
}

/**
 * Save configuration to LStorage
 */
async function _saveConfig() {
    if (typeof LStorage === 'undefined') return;
    
    try {
        // CRITICAL: Check and initialize before use
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        LStorage.setSystemStorage(_CONFIG_KEY, _config);
    } catch (e) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.warn('server-myservice', 'Failed to save config: ' + e.message);
        }
    }
}

/**
 * List configurable items (for service management UI)
 */
function __list__() {
    return [
        {
            key: 'enabled',
            label: '启用服务',
            type: 'boolean',
            value: _config.enabled
        },
        {
            key: 'interval',
            label: '轮询间隔（毫秒）',
            type: 'number',
            value: _config.interval
        },
        {
            key: 'apiUrl',
            label: 'API 地址',
            type: 'text',
            value: _config.apiUrl
        }
    ];
}

/**
 * Set configuration
 */
function __set__(config) {
    if (!config || typeof config !== 'object') return;
    
    // Validate and update configuration
    if (typeof config.enabled === 'boolean') {
        _config.enabled = config.enabled;
    }
    if (typeof config.interval === 'number' && config.interval > 0) {
        _config.interval = config.interval;
    }
    if (typeof config.apiUrl === 'string') {
        _config.apiUrl = config.apiUrl;
    }
    
    // Save configuration
    _saveConfig();
    
    // Restart service if running to apply new config
    if (_running) {
        __stop__();
        __start__();
    }
}
```

### Configuration Types

| Type | Description | UI Rendering |
|------|-------------|--------------|
| `text` | Text input | Input field |
| `number` | Number input | Number input field |
| `boolean` | Boolean toggle | Switch/checkbox |

## Common Patterns

### Pattern 1: Polling Service

```javascript
var _timerId = null;
var POLL_INTERVAL_MS = 3000;

function __start__() {
    if (_running) return;
    _running = true;
    
    // Immediate first poll
    _poll();
    
    // Set up periodic polling
    _timerId = setInterval(_poll, POLL_INTERVAL_MS);
}

function __stop__() {
    if (!_running) return;
    _running = false;
    
    if (_timerId) {
        clearInterval(_timerId);
        _timerId = null;
    }
}

function _poll() {
    // Polling logic here
    fetch('/api/data')
        .then(res => res.json())
        .then(data => {
            // Process data
        })
        .catch(err => {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('server-myservice', 'Poll failed: ' + err.message);
            }
        });
}
```

### Pattern 2: Event Listener Service

```javascript
var _listeners = [];

function __start__() {
    if (_running) return;
    _running = true;
    
    // Register event listeners
    if (typeof EventManager !== 'undefined') {
        var handler = function(e) {
            // Handle event
        };
        EventManager.registerEventHandler(_pid, 'click', handler);
        _listeners.push({ type: 'click', handler: handler });
    }
}

function __stop__() {
    if (!_running) return;
    _running = false;
    
    // Remove event listeners
    if (typeof EventManager !== 'undefined') {
        _listeners.forEach(function(item) {
            EventManager.unregisterEventHandler(_pid, item.type, item.handler);
        });
        _listeners = [];
    }
}
```

### Pattern 3: POOL API Service

Services can expose APIs through POOL:

```javascript
var _serviceAPI = {
    doSomething: function() {
        // Service API method
        return 'result';
    },
    getData: function() {
        return { data: 'value' };
    }
};

function __start__() {
    if (_running) return;
    _running = true;
    
    // Register to POOL
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("SERVER_POOL")) {
                POOL.__INIT__("SERVER_POOL");
            }
            POOL.__ADD__("SERVER_POOL", "MyService", _serviceAPI);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('server-myservice', 'Failed to register to POOL: ' + e.message);
            }
        }
    }
}

function __stop__() {
    if (!_running) return;
    _running = false;
    
    // Unregister from POOL
    if (typeof POOL !== 'undefined' && typeof POOL.__DELETE__ === 'function') {
        try {
            POOL.__DELETE__("SERVER_POOL", "MyService");
        } catch (e) {
            // Ignore errors
        }
    }
}
```

### Pattern 4: Notification Service

```javascript
function _showNotification(title, content, level) {
    if (typeof NotificationManager === 'undefined') return;
    
    var duration = 0; // 0 = no auto-close
    if (level === 1) duration = 8000; // 8 seconds
    
    var p = NotificationManager.createNotification(_pid, {
        type: 'snapshot',
        title: title,
        content: content,
        duration: duration
    });
    
    // Handle promise rejection
    if (p && typeof p.catch === 'function') {
        p.catch(function(e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-myservice', 'Notification failed: ' + (e && e.message));
            }
        });
    }
}
```

## Calling Kernel APIs

### Direct API Calls

Services run in main window context and can directly access kernel modules:

```javascript
// Notification
if (typeof NotificationManager !== 'undefined') {
    NotificationManager.createNotification(_pid, options);
}

// File System
if (typeof Disk !== 'undefined') {
    var nodeTree = Disk.diskSeparateMap.get('D:');
    // Use nodeTree
}

// Storage
// IMPORTANT: Always initialize before use!
if (typeof LStorage !== 'undefined') {
    // CRITICAL: Check and initialize first
    if (!LStorage._initialized) {
        await LStorage.init();
    }
    LStorage.setSystemStorage('key', value);
    var value = LStorage.getSystemStorage('key');
}

// Logger
if (typeof KernelLogger !== 'undefined') {
    KernelLogger.info('server-myservice', 'Message');
    KernelLogger.warn('server-myservice', 'Warning');
    KernelLogger.error('server-myservice', 'Error', error);
}
```

### Using ProcessManager.callKernelAPI

For APIs that require PID validation:

```javascript
if (typeof ProcessManager !== 'undefined') {
    ProcessManager.callKernelAPI(_pid, 'FileSystem.read', ['D:/file.txt'])
        .then(content => {
            // Process content
        })
        .catch(err => {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('server-myservice', 'API call failed: ' + err.message);
            }
        });
}
```

## Error Handling

### Standard Error Handling

```javascript
function _safeOperation() {
    try {
        // Operation that might fail
        var result = riskyOperation();
        return result;
    } catch (e) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.error('server-myservice', 'Operation failed: ' + e.message, e);
        }
        return null;
    }
}

function _asyncOperation() {
    return fetch('/api/data')
        .then(res => {
            if (!res.ok) {
                throw new Error('HTTP ' + res.status);
            }
            return res.json();
        })
        .catch(e => {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-myservice', 'Request failed: ' + e.message);
            }
            return null;
        });
}
```

### Promise Error Handling

Always handle promise rejections:

```javascript
// Good: Handle promise rejection
var p = NotificationManager.createNotification(_pid, options);
if (p && typeof p.catch === 'function') {
    p.catch(function(e) {
        KernelLogger.warn('server-myservice', 'Notification failed: ' + e.message);
    });
}

// Bad: Unhandled promise rejection
NotificationManager.createNotification(_pid, options); // May cause unhandled rejection
```

## Best Practices

### 1. Always Check Module Availability

```javascript
if (typeof KernelLogger !== 'undefined') {
    KernelLogger.info('server-myservice', 'Message');
}

if (typeof NotificationManager !== 'undefined') {
    NotificationManager.createNotification(_pid, options);
}
```

### 2. Use PID Convention

```javascript
var _pid = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
    ? ProcessManager.SERVER_SERVICE_PID
    : 10000;
```

### 3. Handle Lifecycle Properly

```javascript
function __start__() {
    if (_running) {
        // Already running, ignore
        return;
    }
    _running = true;
    // Start logic
}

function __stop__() {
    if (!_running) {
        // Not running, ignore
        return;
    }
    _running = false;
    // Cleanup logic
}
```

### 4. Clean Up Resources

```javascript
function __stop__() {
    _running = false;
    
    // Clear timers
    if (_timerId) {
        clearInterval(_timerId);
        _timerId = null;
    }
    
    // Remove event listeners
    _listeners.forEach(function(item) {
        EventManager.unregisterEventHandler(_pid, item.type, item.handler);
    });
    _listeners = [];
    
    // Unregister from POOL
    if (typeof POOL !== 'undefined') {
        POOL.__DELETE__("SERVER_POOL", "MyService");
    }
}
```

### 5. Use KernelLogger for Logging

```javascript
// Always use KernelLogger, never console.log
if (typeof KernelLogger !== 'undefined') {
    KernelLogger.info('server-myservice', 'Service started');
    KernelLogger.warn('server-myservice', 'Warning message');
    KernelLogger.error('server-myservice', 'Error message', error);
    KernelLogger.debug('server-myservice', 'Debug message');
}
```

### 6. Handle Promise Rejections

```javascript
// Always handle promise rejections
var p = asyncOperation();
if (p && typeof p.catch === 'function') {
    p.catch(function(e) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.error('server-myservice', 'Operation failed: ' + e.message);
        }
    });
}
```

### 7. Load Configuration on Init

```javascript
function __init__() {
    _loadConfig(); // Load saved configuration
    _initialized = true;
}
```

### 8. Save Configuration Properly

```javascript
function __set__(config) {
    // Validate config
    // Update _config
    // Save to LStorage
    _saveConfig();
    
    // Restart if needed
    if (_running) {
        __stop__();
        __start__();
    }
}
```

## Complete Example: Polling Notification Service

```javascript
(function () {
    'use strict';

    var _pid = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;

    var _running = false;
    var _initialized = false;
    var _timerId = null;
    
    var POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
    var API_URL = 'https://api.example.com/notifications';
    var _lastCheckTime = null;
    var _receivedIds = [];

    function __init__() {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-notifications', 'Service initialized');
        }
        _initialized = true;
    }

    function __start__() {
        if (_running) return;
        _running = true;
        
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-notifications', 'Service started');
        }
        
        // Immediate first check
        _checkNotifications();
        
        // Set up periodic checking
        _timerId = setInterval(_checkNotifications, POLL_INTERVAL_MS);
    }

    function __stop__() {
        if (!_running) return;
        _running = false;
        
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-notifications', 'Service stopped');
        }
        
        if (_timerId) {
            clearInterval(_timerId);
            _timerId = null;
        }
    }

    function __status__() {
        return {
            running: _running,
            initialized: _initialized,
            lastCheckTime: _lastCheckTime,
            apiUrl: API_URL || '(not configured)'
        };
    }

    function __info__() {
        return {
            name: 'NotificationService',
            version: '1.0.0',
            description: 'Polling notification service'
        };
    }

    function _checkNotifications() {
        if (!API_URL) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('server-notifications', 'API URL not configured');
            }
            return;
        }

        _lastCheckTime = Date.now();

        var req = typeof fetch !== 'undefined' ? fetch(API_URL) : null;
        if (!req || typeof req.then !== 'function') {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-notifications', 'fetch not available');
            }
            return;
        }

        req.then(function(res) {
            if (!res || !res.ok) {
                throw new Error('HTTP ' + (res ? res.status : 'unknown'));
            }
            return res.json();
        }).then(function(body) {
            if (!body || typeof body !== 'object') return;
            
            var notifications = Array.isArray(body.data) ? body.data : [body.data];
            
            notifications.forEach(function(notif) {
                if (!notif || !notif.id) return;
                
                // Check if already received
                if (_receivedIds.indexOf(notif.id) >= 0) return;
                
                // Mark as received
                _receivedIds.push(notif.id);
                
                // Show notification
                _showNotification(notif.title, notif.content, notif.level || 0);
            });
        }).catch(function(e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-notifications', 'Check failed: ' + (e && e.message));
            }
        });
    }

    function _showNotification(title, content, level) {
        if (typeof NotificationManager === 'undefined') return;
        
        var duration = 0;
        if (level === 1) duration = 8000;
        
        var p = NotificationManager.createNotification(_pid, {
            type: 'snapshot',
            title: title || 'Notification',
            content: content,
            duration: duration
        });
        
        if (p && typeof p.catch === 'function') {
            p.catch(function(e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-notifications', 'Notification failed: ' + (e && e.message));
                }
            });
        }
    }

    // Register service
    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__({
            __init__: __init__,
            __start__: __start__,
            __stop__: __stop__,
            __status__: __status__,
            __info__: __info__
        });
    }
})();
```

## File Location and Naming

### File Structure

```
system/service/DISK/D/server/
├── server-notice.js          # Notice service
├── server-translate.js        # Translation service
├── server-processmemory.js    # Process memory service
├── server-aiassistant.js      # AI assistant service
└── server-myservice.js        # Your new service
```

### Naming Convention

- **File name**: `server-<id>.js` (lowercase, hyphen-separated)
- **Service ID**: `<id>` part of filename (e.g., `myservice` from `server-myservice.js`)
- **Registration**: Must call `__ZerOS_ServerExpansion_Register__`

## Testing

### Manual Testing

1. Place file in `system/service/DISK/D/server/server-myservice.js`
2. Restart system or call `Server.loadAll` to reload services
3. Check service list: `Server.listServices`
4. Start service: `Server.start('myservice')`
5. Check status: `Server.status('myservice')`
6. Stop service: `Server.stop('myservice')`

### Using Terminal

```bash
# List services
service list

# Start service
service start myservice

# Stop service
service stop myservice

# Check status
service status myservice

# Reload services
service reload
```

## Common Issues and Solutions

### Issue: Service not loaded

**Cause**: Registration failed or methods missing

**Solution**: 
1. Check registration function is called
2. Verify all five methods are functions
3. Check console for errors

### Issue: "ServerExpansion 仅允许通过进程管理器 kernelAPI 调用"

**Cause**: Directly calling ServerExpansion methods

**Solution**: Use `kernelAPI.call('Server.xxx', args)` instead

### Issue: Permission denied

**Cause**: Missing SERVER_SERVICE_MANAGE permission

**Solution**: Ensure program declares `PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE`

### Issue: API calls fail

**Cause**: Using wrong PID or module not available

**Solution**: 
1. Use `ProcessManager.SERVER_SERVICE_PID` (10000)
2. Check module availability before use
3. Handle promise rejections

## References

- Service Module Guide: `docs/SERVER/ServiceModule.md`
- ServerExpansion API: `docs/API/ServerExpansion.md`
- Server README: `docs/SERVER/README.md`
- Kernel Interaction Skill: `dev/skill/zeros-kernel-interaction/SKILL.md`
- NotificationManager API: `docs/API/NotificationManager.md`
- LStorage API: `docs/API/LStorage.md`
