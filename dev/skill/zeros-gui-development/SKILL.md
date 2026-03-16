---
name: zeros-gui-development
description: Guide for developing GUI (Graphical User Interface) programs in ZerOS. Use when creating GUI applications, managing windows with GUIManager, handling events with EventManager, developing graphical interfaces in ZerOS. Covers singleton pattern issues, event cleanup, responsive layout with ResizeObserver, touch support for mobile devices, window lifecycle, theme compatibility, and resource management.
---

# ZerOS GUI Program Development Guide

## Overview

GUI programs in ZerOS are graphical applications that create windows managed by `GUIManager`, handle user interactions through `EventManager`, and integrate with the system's theme system. GUI programs run in the browser-based ZerOS environment and must follow specific patterns for window lifecycle, event handling, and resource cleanup.

**Key Characteristics:**
- GUI programs create windows that are managed by `GUIManager`
- All event handling must go through `EventManager` (mandatory requirement)
- Must use CSS theme variables for consistent styling
- Support background mode (optional but recommended)
- Must properly clean up resources in `__exit__()`

**File Location:**
- GUI programs are located in `system/service/DISK/D/application/<app-name>/<app-name>.js`
- Each application should have its own directory

## Program Structure

### Basic Template

```javascript
(function(window) {
    'use strict';

    const MYAPP = {
        pid: null,
        window: null,
        windowId: null,
        _kernelAPI: null,
        eventHandlers: [], // Store event handler IDs for cleanup

        __info__: function() {
            return {
                name: 'My Application',
                type: 'GUI',
                version: '1.0.0',
                description: 'Description of my application',
                author: 'Your Name',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    // Add other required permissions
                ] : [],
                metadata: {
                    allowMultipleInstances: false, // or true
                    category: 'system', // or 'utility', 'entertainment', etc.
                    showOnDesktop: true // Whether to show icon on desktop
                }
            };
        },

        __init__: async function(pid, initArgs) {
            // Re-initialize all instance properties (required for singleton programs)
            this.pid = null;
            this.window = null;
            this.windowId = null;
            this._kernelAPI = null;
            this.eventHandlers = [];
            this._resizeObserver = null;
            
            this.pid = pid;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

            // Get GUI container
            const guiContainer = (initArgs && initArgs.guiContainer) || 
                document.getElementById('gui-container');
            if (!guiContainer) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('MYAPP', '未找到 gui-container');
                }
                return;
            }

            // Create window element
            this.window = document.createElement('div');
            this.window.className = 'myapp-window zos-gui-window';
            this.window.dataset.pid = String(pid);
            this.window.style.cssText = `
                width: 600px;
                height: 400px;
                min-width: 400px;
                min-height: 300px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;

            // Register window with GUIManager
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('myapp');
                }
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: 'My Application',
                    icon: icon,
                    onClose: () => this._onCloseRequest()
                });
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }

            // Build UI
            this._buildUI();

            // Add window to container
            guiContainer.appendChild(this.window);

            // Register event handlers
            this._registerEventHandlers();
        },

        __exit__: async function() {
            // Clean up event handlers
            if (typeof EventManager !== 'undefined') {
                for (let i = 0; i < this.eventHandlers.length; i++) {
                    try {
                        EventManager.unregisterEventHandler(this.eventHandlers[i]);
                    } catch (e) {}
                }
            }
            this.eventHandlers = [];

            // Unregister window
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                GUIManager.unregisterWindow(this.windowId);
            } else if (this.pid && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            }

            // Remove window from DOM
            if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }

            // Clear references
            this.window = null;
            this.windowId = null;
            this._kernelAPI = null;
        },

        _buildUI: function() {
            // Build your UI here
            const content = document.createElement('div');
            content.className = 'myapp-content';
            content.textContent = 'Hello, World!';
            this.window.appendChild(content);
        },

        _registerEventHandlers: function() {
            // Register event handlers using EventManager
            if (typeof EventManager === 'undefined') return;

            const button = this.window.querySelector('.myapp-button');
            if (button) {
                const handlerId = EventManager.registerElementEvent(
                    this.pid,
                    button,
                    'click',
                    (e) => {
                        this._handleButtonClick(e);
                    }
                );
                this.eventHandlers.push(handlerId);
            }
        },

        _handleButtonClick: function(e) {
            // Handle button click
        },

        _onCloseRequest: function() {
            // Handle close request
            // Option 1: Exit immediately
            this._exit();

            // Option 2: Go to background (recommended for some apps)
            // this._goToBackground();
        },

        _exit: function() {
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                this._kernelAPI.call('Process.requestSelfTermination', []).catch(e => {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('MYAPP', 'requestSelfTermination 失败: ' + (e && e.message));
                    }
                });
            }
        }
    };

    if (typeof window !== 'undefined') {
        window.MYAPP = MYAPP;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.MYAPP = MYAPP;
    }
})(typeof window !== 'undefined' ? window : globalThis);
```

### Required Methods

#### `__info__()`

Returns program metadata including name, type, version, permissions, and metadata.

**Required Fields:**
- `name` (string): Program name
- `type` (string): Must be `'GUI'`
- `version` (string): Version number
- `description` (string): Program description
- `author` (string): Author name
- `copyright` (string): Copyright information

**Optional Fields:**
- `permissions` (Array): Required permissions (see Permissions section)
- `metadata` (Object):
  - `allowMultipleInstances` (boolean): Whether to allow multiple instances (default: `false`)
  - `category` (string): Application category (`'system'`, `'utility'`, `'entertainment'`, etc.)
  - `showOnDesktop` (boolean): Whether to show icon on desktop

**Example:**
```javascript
__info__: function() {
    return {
        name: 'My Application',
        type: 'GUI',
        version: '1.0.0',
        description: 'Description of my application',
        author: 'Your Name',
        copyright: '© 2025 ZerOS',
        permissions: typeof PermissionManager !== 'undefined' ? [
            PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
            PermissionManager.PERMISSION.EVENT_LISTENER,
            PermissionManager.PERMISSION.FILE_READ,
            PermissionManager.PERMISSION.FILE_WRITE
        ] : [],
        metadata: {
            allowMultipleInstances: false,
            category: 'utility',
            showOnDesktop: true
        }
    };
}
```

#### `__init__(pid, initArgs)`

Initializes the GUI program. Must create the window element, register it with `GUIManager`, build the UI, and register event handlers.

**Parameters:**
- `pid` (number): Process ID assigned by ProcessManager
- `initArgs` (Object): Initialization arguments
  - `guiContainer` (HTMLElement): Container element for GUI windows
  - `kernelAPI` (Object): Process-bound kernel API (recommended for kernel calls)

**Key Steps:**
1. Store `pid` and `kernelAPI`
2. Get `guiContainer` from `initArgs.guiContainer` or `document.getElementById('gui-container')`
3. Create window element with class `zos-gui-window` and `dataset.pid`
4. Register window with `GUIManager.registerWindow()`
5. Build UI content
6. Append window to `guiContainer`
7. Register event handlers using `EventManager`

**Example:**
```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

    const guiContainer = (initArgs && initArgs.guiContainer) || 
        document.getElementById('gui-container');
    if (!guiContainer) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.warn('MYAPP', '未找到 gui-container');
        }
        return;
    }

    // Create window
    this.window = document.createElement('div');
    this.window.className = 'myapp-window zos-gui-window';
    this.window.dataset.pid = String(pid);

    // Register with GUIManager
    if (typeof GUIManager !== 'undefined') {
        const windowInfo = GUIManager.registerWindow(pid, this.window, {
            title: 'My Application',
            icon: ApplicationAssetManager?.getIcon('myapp'),
            onClose: () => this._onCloseRequest()
        });
        if (windowInfo && windowInfo.windowId) {
            this.windowId = windowInfo.windowId;
        }
    }

    // Build UI
    this._buildUI();

    // Add to container
    guiContainer.appendChild(this.window);

    // Register events
    this._registerEventHandlers();
}
```

#### `__exit__()`

Cleans up resources when the program exits. Must unregister event handlers, unregister window, and remove DOM elements.

**Key Steps:**
1. Unregister all event handlers using `EventManager.unregisterEventHandler()`
2. Unregister window using `GUIManager.unregisterWindow()`
3. Remove window from DOM
4. Clear all references (set to `null`)

**Example:**
```javascript
__exit__: async function() {
    // Clean up event handlers
    if (typeof EventManager !== 'undefined') {
        for (let i = 0; i < this.eventHandlers.length; i++) {
            try {
                EventManager.unregisterEventHandler(this.eventHandlers[i]);
            } catch (e) {}
        }
    }
    this.eventHandlers = [];

    // Unregister window
    if (typeof GUIManager !== 'undefined' && this.windowId) {
        GUIManager.unregisterWindow(this.windowId);
    }

    // Remove from DOM
    if (this.window && this.window.parentElement) {
        this.window.parentElement.removeChild(this.window);
    }

    // Clear references
    this.window = null;
    this.windowId = null;
    this._kernelAPI = null;
}
```

## Window Management

### GUIManager API

`GUIManager` manages all GUI windows, providing unified window controls (minimize, maximize, close), drag and resize functionality, focus management, and z-index management.

#### Registering a Window

```javascript
const windowInfo = GUIManager.registerWindow(pid, windowElement, {
    title: 'Window Title',
    icon: 'application/myapp/myapp.svg', // Optional
    onClose: () => {
        // Called when window is closed
        // Do NOT call unregisterWindow() here
        // GUIManager handles window cleanup automatically
    },
    onMinimize: () => {
        // Optional: Called when window is minimized
    },
    onMaximize: (isMaximized) => {
        // Optional: Called when window is maximized/restored
        // isMaximized: true if maximized, false if restored
    },
    windowId: 'custom-window-id' // Optional: Auto-generated if not provided
});
```

**Window Info Object:**
```javascript
{
    windowId: string,
    window: HTMLElement,
    pid: number,
    zIndex: number,
    isFocused: boolean,
    isMinimized: boolean,
    isMaximized: boolean,
    isMainWindow: boolean,
    title: string,
    icon: string|null,
    createdAt: number
}
```

#### Window Operations

```javascript
// Focus window
GUIManager.focusWindow(this.windowId);

// Minimize window
GUIManager.minimizeWindow(this.windowId);

// Restore window
GUIManager.restoreWindow(this.windowId, true); // true = auto focus

// Toggle maximize
GUIManager.toggleMaximize(this.windowId);

// Get window info
const winInfo = GUIManager.getWindowInfo(this.windowId);

// Get all windows for this PID
const windows = GUIManager.getWindowsByPid(this.pid);

// Unregister window (usually done in __exit__)
GUIManager.unregisterWindow(this.windowId);
```

#### Window Close Flow

When a window is closed (user clicks close button or `unregisterWindow` is called), `GUIManager` executes:

1. **Calls `onClose` callback** (if exists):
   - Callback executes before window close animation
   - `GUIManager` clears `onClose` reference to prevent recursion
   - If callback already called `unregisterWindow`, `GUIManager` skips subsequent steps

2. **Executes close animation**:
   - Uses `AnimateManager` for smooth close animation
   - Waits for animation to complete before removing element

3. **Unregisters window**:
   - Removes window from registry
   - Cleans up event listeners (drag, resize, etc.)
   - Updates taskbar visibility

4. **Checks process termination**:
   - If PID has no other windows and is not Exploit program (PID 10000), automatically calls `ProcessManager.killProgram(pid)`

**Important:**
- `onClose` callback should only perform cleanup work
- Do NOT call `unregisterWindow()` or `_closeWindow()` in `onClose`
- Window close flow is managed by `GUIManager` to ensure proper resource cleanup

### Background Mode Support

GUI programs can support background mode, allowing them to continue running when the window is closed, and be restored from the system tray.

#### Implementing Background Mode

```javascript
_onCloseRequest: function() {
    // Go to background instead of exiting
    this._goToBackground();
},

_goToBackground: function() {
    if (!this.windowId || !this.window) return;

    // Mark window as background-requested
    const winInfo = typeof GUIManager !== 'undefined' ? 
        GUIManager.getWindowInfo(this.windowId) : null;
    if (winInfo) {
        winInfo._backgroundRequested = true;
    }

    // Hide window
    if (this.window.style) {
        this.window.style.display = 'none';
    }

    // Request background mode
    if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
        this._kernelAPI.call('Process.requestBackground', []).catch(e => {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('MYAPP', 'requestBackground 失败: ' + (e && e.message));
            }
        });
    }
},

// Register tray click handler to restore window
_registerBackgroundTray: async function() {
    if (!this._kernelAPI || typeof this._kernelAPI.call !== 'function') return;

    const windowId = this.windowId;
    const kernelAPI = this._kernelAPI;

    try {
        // Register tray click handler
        await this._kernelAPI.call('Process.registerBackgroundTrayClick', [
            function() {
                if (typeof GUIManager === 'undefined') return;
                
                // Show window
                const winInfo = GUIManager.getWindowInfo(windowId);
                if (winInfo && winInfo.window) {
                    winInfo.window.style.display = '';
                    GUIManager.focusWindow(windowId);
                }

                // Request foreground
                if (kernelAPI && typeof kernelAPI.call === 'function') {
                    kernelAPI.call('Process.requestForeground', []).catch(() => {});
                }
            }
        ]);

        // Register context menu (optional)
        await this._kernelAPI.call('Process.registerBackgroundTrayContextMenu', [
            function() {
                return [
                    { label: 'Restore', action: () => { /* restore */ } },
                    { label: 'Exit', action: () => { /* exit */ } }
                ];
            }
        ]);
    } catch (e) {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.warn('MYAPP', '注册后台托盘失败: ' + (e && e.message));
        }
    }
}
```

**How Background Mode Works:**
1. When user clicks close button, `onClose` callback is called
2. Set `winInfo._backgroundRequested = true` and hide window
3. Call `Process.requestBackground` via kernel API
4. `GUIManager` detects `_backgroundRequested` and only hides window (doesn't unregister or kill process)
5. Program continues running in background
6. User can click tray icon to restore window
7. Call `Process.requestForeground` to bring program back to foreground

## Event Handling

### EventManager API (Mandatory)

**All event handling must go through `EventManager`**. This is a mandatory requirement in ZerOS.

**Why EventManager:**
- Unified event management with priority and propagation control
- Automatic cleanup when process exits (prevents memory leaks)
- Supports multiple programs registering the same event (executed by priority)
- Provides unified event propagation control API

#### Registering Event Handlers

```javascript
// Register global event handler
const handlerId = EventManager.registerEventHandler(
    this.pid,
    'click', // Event type
    (event, eventContext) => {
        // Handler function
        // event: Native event object
        // eventContext: Event context with stopPropagation, preventDefault, etc.
        
        // Return values:
        // - false: Prevent default behavior
        // - 'stop' or 'stopPropagation': Stop event propagation
        // - 'stopImmediate' or 'stopImmediatePropagation': Stop immediate propagation
    },
    {
        priority: 100, // Lower number = higher priority (default: 100)
        selector: '.my-button', // Optional: CSS selector (only trigger on matching elements)
        stopPropagation: false, // Optional: Stop propagation
        once: false, // Optional: Trigger only once
        passive: false, // Optional: Passive listener
        useCapture: false // Optional: Use capture phase
    }
);

this.eventHandlers.push(handlerId);
```

#### Registering Element-Specific Events

For events that don't bubble (e.g., `mouseenter`, `mouseleave`, `load`, `error`):

```javascript
// Register element-specific event
const handlerId = EventManager.registerElementEvent(
    this.pid,
    element, // HTMLElement
    'mouseenter', // Event type
    (event, eventContext) => {
        // Handler function
        element.style.backgroundColor = 'blue';
    },
    {
        once: false, // Optional
        passive: false // Optional
    }
);

this.eventHandlers.push(handlerId);
```

#### Event Context API

```javascript
EventManager.registerEventHandler(this.pid, 'click', (e, ctx) => {
    // Stop event propagation
    ctx.stopPropagation();
    
    // Stop immediate propagation
    ctx.stopImmediatePropagation();
    
    // Prevent default behavior
    ctx.preventDefault();
    
    // Check if propagation was stopped
    if (ctx.stopped) {
        // Event propagation was stopped
    }
    
    // Check if default was prevented
    if (ctx.prevented) {
        // Default behavior was prevented
    }
    
    // Get current handler info
    const handlerInfo = ctx.currentHandler;
});
```

#### Unregistering Event Handlers

```javascript
// Unregister specific handler
EventManager.unregisterEventHandler(handlerId);

// Unregister all handlers for PID (usually done automatically by ProcessManager)
EventManager.unregisterAllHandlersForPid(this.pid);
```

**Note:** `ProcessManager` automatically calls `unregisterAllHandlersForPid` when a process exits, so manual cleanup in `__exit__` is optional but recommended for clarity.

#### Event Priority

Events are executed by priority (lower number = higher priority):

- **Priority 1-10**: System core events (e.g., context menu, window controls)
- **Priority 11-30**: Window management events (e.g., drag, resize)
- **Priority 31-50**: Menu and popup events
- **Priority 51-100**: Application events (default priority)
- **Priority 101+**: Low priority events

### Common Event Patterns

#### Button Click

```javascript
const button = this.window.querySelector('.my-button');
if (button) {
    const handlerId = EventManager.registerElementEvent(
        this.pid,
        button,
        'click',
        (e) => {
            e.stopPropagation();
            this._handleButtonClick();
        }
    );
    this.eventHandlers.push(handlerId);
}
```

#### Form Submission

```javascript
const form = this.window.querySelector('.my-form');
if (form) {
    const handlerId = EventManager.registerEventHandler(
        this.pid,
        'submit',
        (e, ctx) => {
            ctx.preventDefault();
            this._handleFormSubmit(e);
            return false; // Also prevent default
        },
        {
            selector: '.my-form',
            priority: 50
        }
    );
    this.eventHandlers.push(handlerId);
}
```

#### Keyboard Shortcuts

```javascript
const handlerId = EventManager.registerEventHandler(
    this.pid,
    'keydown',
    (e, ctx) => {
        // Ctrl+S: Save
        if (e.ctrlKey && e.key === 's') {
            ctx.preventDefault();
            this._save();
            return false;
        }
        // Escape: Close
        if (e.key === 'Escape') {
            this._onCloseRequest();
            return false;
        }
    },
    {
        priority: 10 // High priority
    }
);
this.eventHandlers.push(handlerId);
```

#### Context Menu

```javascript
const handlerId = EventManager.registerEventHandler(
    this.pid,
    'contextmenu',
    (e, ctx) => {
        ctx.preventDefault();
        this._showContextMenu(e.clientX, e.clientY);
        return false;
    },
    {
        selector: '.my-content',
        priority: 5 // High priority
    }
);
this.eventHandlers.push(handlerId);
```

## Theme Compatibility

### Using CSS Theme Variables

Always use CSS theme variables for colors and styles to ensure compatibility with system themes:

```css
.myapp-window {
    background: var(--theme-background-elevated, rgba(37, 43, 53, 0.98));
    border: 1px solid var(--theme-border, rgba(139, 92, 246, 0.3));
    color: var(--theme-text, #d7e0dd);
}

.myapp-button {
    background: var(--theme-primary, #8b5cf6);
    color: var(--theme-text-on-primary, #ffffff);
    border: 1px solid var(--theme-primary-dark, #7c3aed);
}

.myapp-button:hover {
    background: var(--theme-primary-hover, #7c3aed);
}

.myapp-button:active {
    background: var(--theme-primary-dark, #6d28d9);
}

.myapp-success {
    color: var(--theme-success, #10b981);
}

.myapp-warning {
    color: var(--theme-warning, #f59e0b);
}

.myapp-error {
    color: var(--theme-error, #ef4444);
}
```

### Available Theme Variables

**Background Colors:**
- `--theme-background`
- `--theme-background-secondary`
- `--theme-background-tertiary`
- `--theme-background-elevated`

**Text Colors:**
- `--theme-text`
- `--theme-text-secondary`
- `--theme-text-muted`
- `--theme-text-on-primary`

**Primary Colors:**
- `--theme-primary`
- `--theme-primary-light`
- `--theme-primary-dark`
- `--theme-primary-hover`
- `--theme-secondary`

**Status Colors:**
- `--theme-success`
- `--theme-warning`
- `--theme-error`
- `--theme-info`

**Border:**
- `--theme-border`

**Style Variables:**
- `--style-window-border-radius`
- `--style-window-backdrop-filter`
- `--style-window-box-shadow-focused`

### Listening to Theme Changes

```javascript
__init__: async function(pid, initArgs) {
    // ... initialization code ...

    // Listen to theme changes
    if (typeof ThemeManager !== 'undefined') {
        this._themeUnsubscribe = ThemeManager.onThemeChange((themeId, theme) => {
            this._updateTheme(theme);
        });
    }
},

__exit__: function() {
    // ... cleanup code ...

    // Unsubscribe from theme changes
    if (this._themeUnsubscribe && typeof this._themeUnsubscribe === 'function') {
        this._themeUnsubscribe();
        this._themeUnsubscribe = null;
    }
},

_updateTheme: function(theme) {
    // Update UI based on theme
    if (this.window) {
        // Theme variables are automatically updated, but you can also
        // manually update styles if needed
        this.window.style.backgroundColor = theme.colors.backgroundElevated;
    }
}
```

## Kernel API Calls

### Using Process-Bound Kernel API (Recommended)

The `initArgs.kernelAPI` provides a process-bound kernel API that prevents PID spoofing and is more secure:

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

    // Use kernel API
    if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
        try {
            const result = await this._kernelAPI.call('FileSystem.readFile', [
                'D:/path/to/file.txt'
            ]);
            console.log('File content:', result);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('MYAPP', '读取文件失败: ' + e.message);
            }
        }
    }
}
```

### Common Kernel APIs for GUI Programs

**File System:**
```javascript
// Read file
const content = await this._kernelAPI.call('FileSystem.readFile', ['D:/path/to/file.txt']);

// Write file
await this._kernelAPI.call('FileSystem.writeFile', ['D:/path/to/file.txt', 'content']);

// List directory
const files = await this._kernelAPI.call('FileSystem.listDirectory', ['D:/path/to/dir']);
```

**Process Management:**
```javascript
// Request self-termination
await this._kernelAPI.call('Process.requestSelfTermination', []);

// Request background mode
await this._kernelAPI.call('Process.requestBackground', []);

// Request foreground mode
await this._kernelAPI.call('Process.requestForeground', []);

// Register background tray click handler
await this._kernelAPI.call('Process.registerBackgroundTrayClick', [callback]);

// Register background tray context menu
await this._kernelAPI.call('Process.registerBackgroundTrayContextMenu', [menuCallback]);
```

**Notifications:**
```javascript
// Create notification
await this._kernelAPI.call('Notification.createNotification', [this.pid, {
    title: 'Title',
    content: 'Content',
    type: 'info', // 'info', 'success', 'warning', 'error', 'snapshot'
    duration: 5000 // milliseconds
}]);
```

**Storage:**
```javascript
// Using kernel API (recommended)
// Note: This requires LSTORAGE_READ/LSTORAGE_WRITE permissions in __info__

// Read from LStorage
const value = await this._kernelAPI.call('LStorage.read', ['myapp.setting.key']);

// Write to LStorage
await this._kernelAPI.call('LStorage.write', ['myapp.setting.key', value]);

// Alternative: Direct LStorage access (for kernel modules or when API not available)
// IMPORTANT: Always initialize before use!
async function _loadSettings(key) {
    if (typeof LStorage !== 'undefined') {
        // CRITICAL: Check and initialize before use
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        // Now you can safely use getSystemStorage/setSystemStorage
        const settings = LStorage.getSystemStorage(key);
        return settings || {};
    }
    return {};
}

async function _saveSettings(key, value) {
    if (typeof LStorage !== 'undefined') {
        if (!LStorage._initialized) {
            await LStorage.init();
        }
        LStorage.setSystemStorage(key, value);
    }
}
```

**GUI Dialogs:**
```javascript
// Show alert
await this._kernelAPI.call('GUIManager.showAlert', ['Message', 'Title', 'info']);

// Show confirm
const confirmed = await this._kernelAPI.call('GUIManager.showConfirm', [
    'Are you sure?',
    'Confirm',
    'warning'
]);

// Show prompt
const input = await this._kernelAPI.call('GUIManager.showPrompt', [
    'Enter value:',
    'Input',
    'default value'
]);
```

## Permissions

### Required Permissions

GUI programs must declare required permissions in `__info__()`:

```javascript
permissions: typeof PermissionManager !== 'undefined' ? [
    PermissionManager.PERMISSION.GUI_WINDOW_CREATE, // Required for GUI programs
    PermissionManager.PERMISSION.EVENT_LISTENER, // Required for event handling
    PermissionManager.PERMISSION.FILE_READ, // If reading files
    PermissionManager.PERMISSION.FILE_WRITE, // If writing files
    PermissionManager.PERMISSION.PROCESS_BACKGROUND, // If supporting background mode
    PermissionManager.PERMISSION.NETWORK_REQUEST, // If making network requests
    // ... other permissions as needed
] : []
```

### Permission Levels

- **NORMAL**: Auto-granted, no user confirmation
- **SPECIAL**: Requires user confirmation
- **DANGEROUS**: Requires admin approval

### Common Permissions

- `GUI_WINDOW_CREATE`: Create GUI windows (required for GUI programs)
- `EVENT_LISTENER`: Register event handlers (required for GUI programs)
- `FILE_READ`: Read files
- `FILE_WRITE`: Write files
- `PROCESS_BACKGROUND`: Run in background mode
- `NETWORK_REQUEST`: Make network requests
- `LSTORAGE_READ`: Read from LStorage
- `LSTORAGE_WRITE`: Write to LStorage
- `NOTIFICATION_CREATE`: Create notifications

## Best Practices

### 1. Window Lifecycle

- Always register window with `GUIManager` in `__init__`
- Always unregister window in `__exit__`
- Store `windowId` for later reference
- Handle `onClose` callback properly (cleanup only, don't call `unregisterWindow`)

### 2. Window CSS - Fixed Height Required

**IMPORTANT**: GUI窗口必须使用固定高度值来防止标题栏问题：

```javascript
this.window.style.cssText = `
    width: 800px;
    height: 600px;          // 必需：固定像素值
    min-width: 600px;      // 可选：最小宽度
    min-height: 600px;     // 必需：必须等于height
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;
```

**禁止使用**:
- ❌ `height: 100%` (会导致标题栏问题)
- ❌ `height: calc(100vh - xxx)` (可能导致问题)
- ❌ 单独使用 `min-height` 没有 `height` (无效)
- ❌ 父元素没有固定高度时使用 `flex: 1`

**窗口初始化顺序（关键！）**:
```javascript
// 1. 先设置样式（不含innerHTML）
this.window.style.cssText = `...`;

// 2. 注册窗口
if (typeof GUIManager !== 'undefined') {
    GUIManager.registerWindow(pid, this.window, {...});
}

// 3. 先添加到DOM
guiContainer.appendChild(this.window);

// 4. 再设置innerHTML（重要！）
this._buildUI();
```

**工具栏和状态栏必须有固定高度（必须使用min-height和max-height）**:
 ```css
 .toolbar {
     height: 46px;
     min-height: 46px;
     max-height: 46px;
     flex-shrink: 0;
 }

 .statusbar {
     height: 28px;
     min-height: 28px;
     max-height: 28px;
     flex-shrink: 0;
 }
 ```

**内容区域使用Flexbox布局**:
- 使用 `flex: 1` 和 `min-height: 0` 让子容器可以滚动

```css
.packetcap-main {
    display: flex;
    flex: 1;           /* Take remaining space */
    overflow: hidden;
    min-height: 0;     /* Required for flex child to scroll */
}

.toolbar {
    flex-shrink: 0;    /* Prevent toolbar from shrinking */
}

.scrollable-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;     /* Required for scrolling */
}
```

### 3. Event Handling

- **Always use `EventManager`** for event handling (mandatory requirement)
- Store event handler IDs in an array for cleanup
- Unregister all event handlers in `__exit__`
- Use appropriate priorities for event handlers
- Use `selector` option to limit event scope when possible

### 4. Resource Cleanup

- Clean up all event handlers in `__exit__`
- Unregister window from `GUIManager`
- Remove window from DOM
- Clear all references (set to `null`)
- Cancel any timers (`setInterval`, `setTimeout`)
- Unsubscribe from theme changes, language changes, etc.

### 5. Singleton Pattern Issue (IMPORTANT)

GUI programs that export as singletons (e.g., `window.MYAPP = MYAPP`) have a critical issue: when the program is closed and reopened, the previous instance's properties may cause errors.

**Problem:**
```javascript
// Program exports as singleton
window.MYAPP = MYAPP;

// First launch: works fine
// After close and reopen: _eventHandlers is null, push() fails
```

**Solution:** Re-initialize essential properties at the beginning of `__init__`:

```javascript
__init__: async function(pid, initArgs) {
    // Re-initialize all instance properties (required for singleton programs)
    this.pid = null;
    this.window = null;
    this.windowId = null;
    this._eventHandlers = [];
    this._resizeObserver = null;
    this._currentCellSize = 16;
    // ... other properties
    
    this.pid = pid;
    // ... rest of initialization
}
```

**Key Points:**
- Always re-initialize `_eventHandlers = []` at the start of `__init__`
- Re-initialize any other array/object properties that were set to `null` in `__exit__`
- This ensures the program works correctly even after being closed and reopened

### 6. Error Handling

- Always wrap kernel API calls in `try-catch`
- Use `KernelLogger` for logging (never use `console.log`)
- Report errors using `Exception.report()` if needed
- Handle missing dependencies gracefully

### 7. Theme Compatibility

- Always use CSS theme variables for colors
- Provide fallback values for theme variables
- Listen to theme changes if UI needs dynamic updates
- Test with different themes

### 8. Background Mode

- Consider supporting background mode for long-running applications
- Register tray click handler to restore window
- Provide context menu for background processes
- Handle window restoration properly

### 9. Performance

- Avoid blocking operations in event handlers
- Use `requestAnimationFrame` for animations
- Debounce/throttle frequent events (scroll, resize, etc.)
- Lazy load heavy content

### 10. Responsive Layout & Mobile Support

GUI programs should support responsive layout and mobile touch events.

#### ResizeObserver for Responsive Layout

Use `ResizeObserver` to detect container size changes (e.g., window maximize/restore):

```javascript
// In __init__
_setupResizeHandler: function() {
    // Use ResizeObserver to observe container size changes
    // This is important for window maximize/restore
    if (typeof ResizeObserver !== 'undefined') {
        const container = this.window.querySelector('.myapp-content');
        if (container) {
            this._resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    this._handleResize();
                    break;
                }
            });
            this._resizeObserver.observe(container);
        }
    }
    
    // Also listen to window transitionend for smooth animations
    if (this.window) {
        this._addEventHandler(this.window, 'transitionend', (e) => {
            if (e.propertyName === 'width' || e.propertyName === 'height') {
                this._handleResize();
            }
        });
    }
},

_handleResize: function() {
    // Handle resize - recalculate layouts, update cell sizes, etc.
    const container = this.window.querySelector('.myapp-content');
    if (!container) return;
    
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    
    // Update UI based on new size
    this._updateLayout(newWidth, newHeight);
},
```

#### Mobile Touch Support

For programs that need touch input (e.g., drawing apps):

```javascript
_getTouchPos: function(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX, clientY;
    
    // Handle both touch and mouse events
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
},

_bindEvents: function() {
    // Pointer events (handles both mouse and touch)
    this._addEventHandler(this.canvas, 'pointerdown', (e) => {
        e.preventDefault();
        this._handlePointerDown(e);
    });
    
    this._addEventHandler(this.canvas, 'pointermove', (e) => {
        e.preventDefault();
        this._handlePointerMove(e);
    });
    
    this._addEventHandler(this.canvas, 'pointerup', (e) => {
        this._handlePointerUp(e);
    });
    
    // Touch events for better mobile support
    this._addEventHandler(this.canvas, 'touchstart', (e) => e.preventDefault(), { passive: false });
    this._addEventHandler(this.canvas, 'touchmove', (e) => e.preventDefault(), { passive: false });
    this._addEventHandler(this.canvas, 'touchend', (e) => e.preventDefault(), { passive: false });
},

_addEventHandler: function(element, event, handler, options = {}) {
    element.addEventListener(event, handler, options);
    this._eventHandlers.push({ element, event, handler, options });
},
```

#### Cleanup in __exit__

```javascript
__exit__: async function() {
    // Clean up event handlers
    if (this._eventHandlers && Array.isArray(this._eventHandlers)) {
        this._eventHandlers.forEach(({ element, event, handler, options }) => {
            if (element && typeof element.removeEventListener === 'function') {
                element.removeEventListener(event, handler, options);
            }
        });
        this._eventHandlers = null;
    }
    
    // Clean up ResizeObserver
    if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
    }
    
    // ... other cleanup
}
```

### 11. Accessibility

- Use semantic HTML elements
- Provide keyboard shortcuts
- Support keyboard navigation
- Use ARIA attributes when appropriate

## Common Patterns

### Pattern 1: Simple Window

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

    const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
    
    this.window = document.createElement('div');
    this.window.className = 'myapp-window zos-gui-window';
    this.window.dataset.pid = String(pid);

    if (typeof GUIManager !== 'undefined') {
        const windowInfo = GUIManager.registerWindow(pid, this.window, {
            title: 'My App',
            onClose: () => this._exit()
        });
        if (windowInfo) this.windowId = windowInfo.windowId;
    }

    this.window.innerHTML = '<div>Hello, World!</div>';
    guiContainer.appendChild(this.window);
}
```

### Pattern 2: Window with Controls

```javascript
_buildUI: function() {
    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'myapp-toolbar';
    
    const btnSave = document.createElement('button');
    btnSave.textContent = 'Save';
    btnSave.className = 'myapp-btn myapp-btn-save';
    toolbar.appendChild(btnSave);

    // Content area
    const content = document.createElement('div');
    content.className = 'myapp-content';
    content.textContent = 'Content here';

    this.window.appendChild(toolbar);
    this.window.appendChild(content);

    // Register button click
    if (typeof EventManager !== 'undefined') {
        const handlerId = EventManager.registerElementEvent(
            this.pid,
            btnSave,
            'click',
            () => this._save()
        );
        this.eventHandlers.push(handlerId);
    }
}
```

### Pattern 3: Form Handling

```javascript
_buildForm: function() {
    const form = document.createElement('form');
    form.className = 'myapp-form';

    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'username';
    form.appendChild(input);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Submit';
    form.appendChild(submitBtn);

    this.window.appendChild(form);

    // Register form submit
    if (typeof EventManager !== 'undefined') {
        const handlerId = EventManager.registerEventHandler(
            this.pid,
            'submit',
            (e, ctx) => {
                ctx.preventDefault();
                this._handleSubmit(new FormData(form));
                return false;
            },
            { selector: '.myapp-form' }
        );
        this.eventHandlers.push(handlerId);
    }
}
```

### Pattern 4: Loading State

```javascript
_showLoading: function() {
    const loading = document.createElement('div');
    loading.className = 'myapp-loading';
    loading.innerHTML = '<div class="spinner"></div><div>Loading...</div>';
    this.window.appendChild(loading);
},

_hideLoading: function() {
    const loading = this.window.querySelector('.myapp-loading');
    if (loading) {
        loading.remove();
    }
},

_loadData: async function() {
    this._showLoading();
    try {
        const data = await this._kernelAPI.call('FileSystem.readFile', ['D:/data.json']);
        this._renderData(data);
    } catch (e) {
        this._showError(e.message);
    } finally {
        this._hideLoading();
    }
}
```

## File Location and Naming

### Directory Structure

```
system/service/DISK/D/application/
├── myapp/
│   ├── myapp.js          # Main program file
│   ├── myapp.css         # Styles (optional)
│   └── assets/           # Assets (optional)
│       ├── icon.svg
│       └── images/
```

### Naming Conventions

- **Directory name**: Lowercase, descriptive (e.g., `myapp`, `filemanager`)
- **Main file**: Same as directory name with `.js` extension (e.g., `myapp.js`)
- **CSS file**: Same as directory name with `.css` extension (e.g., `myapp.css`)
- **Global object**: Uppercase, same as directory name (e.g., `MYAPP`)

## Testing

### Manual Testing Checklist

1. **Window Creation:**
   - [ ] Window appears correctly
   - [ ] Window title is correct
   - [ ] Window icon is displayed (if provided)
   - [ ] Window can be dragged
   - [ ] Window can be resized
   - [ ] Window can be minimized/maximized/closed

2. **Event Handling:**
   - [ ] All buttons/links work correctly
   - [ ] Keyboard shortcuts work
   - [ ] Context menu appears (if implemented)
   - [ ] Form submission works

3. **Theme Compatibility:**
   - [ ] UI adapts to theme changes
   - [ ] Colors use theme variables
   - [ ] UI looks good in different themes

4. **Background Mode:**
   - [ ] Window can go to background
   - [ ] Tray icon appears
   - [ ] Clicking tray icon restores window
   - [ ] Context menu works (if implemented)

5. **Resource Cleanup:**
   - [ ] No memory leaks when closing window
   - [ ] Event handlers are cleaned up
   - [ ] Timers are cleared
   - [ ] No console errors

6. **Error Handling:**
   - [ ] Errors are handled gracefully
   - [ ] Error messages are displayed to user
   - [ ] Program doesn't crash on errors

## Common Issues

### Issue 1: Window Not Appearing

**Symptoms:** Window element is created but not visible.

**Solutions:**
- Check if `guiContainer` exists: `document.getElementById('gui-container')`
- Ensure window element is appended to `guiContainer`
- Check CSS: window element needs `position: fixed` or `position: absolute`
- Verify `GUIManager.registerWindow()` succeeded

### Issue 2: Events Not Working

**Symptoms:** Click handlers, keyboard shortcuts, etc. don't work.

**Solutions:**
- Ensure using `EventManager` (not `addEventListener`)
- Check if permissions include `EVENT_LISTENER`
- Verify event handler IDs are stored for cleanup
- Check event priority (might be blocked by higher priority handler)

### Issue 3: Memory Leaks

**Symptoms:** Memory usage increases over time, program slows down.

**Solutions:**
- Ensure all event handlers are unregistered in `__exit__`
- Clear all timers (`setInterval`, `setTimeout`)
- Remove all DOM references (set to `null`)
- Unsubscribe from theme/language change listeners

### Issue 4: Theme Not Applied

**Symptoms:** UI doesn't match system theme.

**Solutions:**
- Use CSS theme variables (`var(--theme-...)`)
- Provide fallback values for theme variables
- Listen to theme changes if UI needs dynamic updates
- Test with different themes

### Issue 5: Background Mode Not Working

**Symptoms:** Window closes instead of going to background.

**Solutions:**
- Set `winInfo._backgroundRequested = true` in `onClose`
- Hide window (`window.style.display = 'none'`)
- Call `Process.requestBackground` via kernel API
- Register tray click handler with `Process.registerBackgroundTrayClick`

### Issue 6: Permission Denied

**Symptoms:** Kernel API calls fail with permission error.

**Solutions:**
- Check if permission is declared in `__info__().permissions`
- Verify permission level (NORMAL/SPECIAL/DANGEROUS)
- Check if user granted permission (for SPECIAL/DANGEROUS)
- Use process-bound kernel API (`initArgs.kernelAPI`) instead of direct calls

## References

### API Documentation

- [GUIManager API](../docs/API/GUIManager.md) - Window management
- [EventManager API](../docs/API/EventManager.md) - Event handling
- [ThemeManager API](../docs/API/ThemeManager.md) - Theme management
- [ProcessManager API](../docs/API/ProcessManager.md) - Process management
- [PermissionManager API](../docs/API/PermissionManager.md) - Permission system

### Developer Guides

- [Developer Guide](../docs/DEVELOPER_GUIDE.md) - General development guide
- [System Flow](../docs/SYSTEM_FLOW.md) - System processes and flows
- [Kernel Developer Guide](../docs/KERNEL_DEVELOPER_GUIDE.md) - Kernel module development

### Example Programs

- `system/service/DISK/D/application/servicemanager/servicemanager.js` - Complex GUI application
- `system/service/DISK/D/application/hellogui/hellogui.js` - Simple GUI with background mode
- `system/service/DISK/D/application/taskmanager/taskmanager.js` - Task manager GUI
- `system/service/DISK/D/application/zeroide/zeroide.js` - IDE GUI application
