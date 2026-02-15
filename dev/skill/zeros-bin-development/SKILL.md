---
name: zeros-bin-development
description: Guide for developing bin programs (CLI commands) in ZerOS. Use when creating command-line tools, terminal commands, or CLI programs that run in D:/bin/ directory.
---

# ZerOS Bin Program Development Guide

This skill provides comprehensive guidance for developing bin programs (CLI commands) in ZerOS. Bin programs are command-line tools that run in the terminal and are located in the `D:/bin/` directory.

## Overview

### What are Bin Programs?

Bin programs are CLI (Command-Line Interface) programs that:
- Located in `D:/bin/` directory (virtual path)
- Actual path: `system/service/DISK/D/bin/`
- Executed directly from terminal by command name
- Automatically terminate after execution
- Interact with users through terminal I/O

### Key Characteristics

- **Type**: CLI (Command-Line Interface)
- **Location**: `D:/bin/<command-name>.js`
- **Execution**: Automatically executed when user types command name in terminal
- **Lifecycle**: Initialize → Execute → Auto-terminate
- **Terminal Access**: Via `initArgs.terminal` or `TerminalAPI`

## Program Structure

### Basic Template

```javascript
(function(window) {
    'use strict';

    const COMMAND_NAME = {
        pid: null,
        terminal: null,
        _kernelAPI: null,
        _closing: false,  // Prevent duplicate termination

        /**
         * Program information
         */
        __info__: function() {
            return {
                name: 'COMMAND_NAME',
                type: 'CLI',
                version: '1.0.0',
                description: 'Command description',
                author: 'Your Name',
                copyright: '© 2025',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    // Add other required permissions
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: true
                }
            };
        },

        /**
         * Initialization
         */
        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;
            this.terminal = initArgs.terminal;
            this._kernelAPI = initArgs.kernelAPI || null;

            if (!this.terminal) {
                throw new Error('CLI program requires terminal environment');
            }

            // Save arguments
            const args = initArgs.args || [];

            // Use setTimeout to delay execution
            // This ensures __init__ returns immediately and process state is set to 'running'
            setTimeout(async () => {
                try {
                    // Parse command-line arguments
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    // Execute command logic
                    await this._executeCommand(args);

                    // Auto-terminate after execution
                    setTimeout(() => this._selfClose(), 300);
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('COMMAND_NAME', `Execution failed: ${error.message}`, error);
                    }
                    this.terminal.write(`Error: ${error.message}\n`);
                    setTimeout(() => this._selfClose(), 300);
                }
            }, 0);
        },

        /**
         * Execute command logic
         */
        _executeCommand: async function(args) {
            // Your command implementation here
            this.terminal.write('Command executed\n');
        },

        /**
         * Show usage information
         */
        _showUsage: function() {
            this.terminal.write('Usage: command [options] [arguments]\n');
            this.terminal.write('\n');
            this.terminal.write('Options:\n');
            this.terminal.write('  -h, --help    Show this help message\n');
            this.terminal.write('\n');
            this.terminal.write('Examples:\n');
            this.terminal.write('  command arg1 arg2\n');
        },

        /**
         * Self-terminate (recommended method)
         */
        _selfClose: async function() {
            if (this._closing) return;
            this._closing = true;

            // Small delay to ensure all output is complete
            await new Promise(resolve => setTimeout(resolve, 200));

            if (!this.pid) return;

            try {
                // Prefer bound API (skips call stack validation)
                if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                    await this._kernelAPI.call('Process.requestSelfTermination', []);
                } else if (typeof ProcessManager !== 'undefined') {
                    await ProcessManager.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
                }
            } catch (error) {
                // Fallback: force termination
                if (typeof ProcessManager !== 'undefined' && ProcessManager.killProgram) {
                    try {
                        await ProcessManager.killProgram(this.pid, true);
                    } catch (e) {
                        // Ignore errors
                    }
                }
            }
        },

        /**
         * Cleanup on exit
         */
        __exit__: async function() {
            this.terminal = null;
            this._kernelAPI = null;
        }
    };

    // Export to global scope
    if (typeof window !== 'undefined') {
        window.COMMAND_NAME = COMMAND_NAME;
    }

    // Register to POOL (optional)
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
                POOL.__INIT__("APPLICATION_SHARED_POOL");
            }
            POOL.__ADD__("APPLICATION_SHARED_POOL", "COMMAND_NAME", COMMAND_NAME);
        } catch (e) {
            // Ignore registration errors
        }
    }

})(window);
```

## Terminal Interaction

### Accessing Terminal

**Method 1: Via initArgs (Recommended)**

```javascript
__init__: async function(pid, initArgs) {
    this.terminal = initArgs.terminal;
    
    if (!this.terminal) {
        throw new Error('CLI program requires terminal environment');
    }
    
    // Use terminal directly
    this.terminal.write('Hello from CLI\n');
}
```

**Method 2: Via TerminalAPI**

```javascript
__init__: async function(pid, initArgs) {
    // Get TerminalAPI from POOL
    const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");
    
    if (TerminalAPI) {
        TerminalAPI.write('Hello from CLI\n');
    }
}
```

### Terminal Output

```javascript
// Simple text output
this.terminal.write('Hello World\n');

// Styled output (if terminal supports)
this.terminal.write({
    text: 'Error: File not found\n',
    color: 'red',
    bold: true
});

this.terminal.write({
    text: 'Success: Operation completed\n',
    color: 'green'
});

// Clear terminal
this.terminal.write('\x1B[2J\x1B[H');  // ANSI escape codes
```

### TerminalAPI Methods

```javascript
const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");

if (TerminalAPI) {
    // Write output
    TerminalAPI.write('Text\n');
    TerminalAPI.write({ text: 'Styled', color: 'red', bold: true });
    
    // Clear screen
    TerminalAPI.clear();
    
    // Set working directory
    TerminalAPI.setCwd('D:/project');
    
    // Get/set environment variables
    const env = TerminalAPI.getEnv();
    TerminalAPI.setEnv({ KEY: 'value' });
    
    // Focus terminal
    TerminalAPI.focus();
    
    // Tab management
    const tabId = TerminalAPI.createTab('My Tab');
    TerminalAPI.switchTab(tabId);
    TerminalAPI.closeTab(tabId);
    const tabs = TerminalAPI.getTabs();
}
```

## Command-Line Arguments

### Parsing Arguments

```javascript
__init__: async function(pid, initArgs) {
    const args = initArgs.args || [];
    
    // Check for help flag
    if (args.includes('-h') || args.includes('--help')) {
        this._showUsage();
        return;
    }
    
    // Parse options
    let verbose = false;
    let outputFile = null;
    const positionalArgs = [];
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '-v' || arg === '--verbose') {
            verbose = true;
        } else if (arg === '-o' || arg === '--output') {
            outputFile = args[++i];
        } else if (arg.startsWith('-')) {
            this.terminal.write(`Unknown option: ${arg}\n`);
            this._showUsage();
            return;
        } else {
            positionalArgs.push(arg);
        }
    }
    
    // Execute with parsed arguments
    await this._executeCommand(positionalArgs, { verbose, outputFile });
}
```

### Argument Validation

```javascript
_validateArgs: function(args) {
    if (args.length === 0) {
        this.terminal.write('Error: Missing required arguments\n');
        this._showUsage();
        return false;
    }
    
    if (args.length > 10) {
        this.terminal.write('Error: Too many arguments\n');
        return false;
    }
    
    return true;
}
```

## Kernel API Calls

### Using Bound API (Recommended)

```javascript
__init__: async function(pid, initArgs) {
    this._kernelAPI = initArgs.kernelAPI;
    
    // Call kernel API without passing PID
    const content = await this._kernelAPI.call('FileSystem.read', ['D:/file.txt']);
    
    // Create notification
    await this._kernelAPI.call('Notification.create', [{
        title: 'Info',
        content: 'Operation completed',
        type: 'info'
    }]);
}
```

### Common Kernel APIs for Bin Programs

```javascript
// File system operations
const content = await this._kernelAPI.call('FileSystem.read', ['D:/path/to/file.txt']);
await this._kernelAPI.call('FileSystem.write', ['D:/path/to/file.txt', content]);
const files = await this._kernelAPI.call('FileSystem.list', ['D:/path/to/dir']);

// Process management
const processes = ProcessManager.listProcesses();
const processInfo = ProcessManager.getProcessInfo(pid);

// System information
const sysInfo = SystemInformation.getSystemInfo();

// Network operations
const response = await this._kernelAPI.call('Network.request', [url, options]);

// Storage operations
const value = await this._kernelAPI.call('Storage.read', ['key']);
await this._kernelAPI.call('Storage.write', ['key', value]);
```

## Error Handling

### Standard Error Handling Pattern

```javascript
__init__: async function(pid, initArgs) {
    setTimeout(async () => {
        try {
            await this._executeCommand(initArgs.args || []);
            setTimeout(() => this._selfClose(), 300);
        } catch (error) {
            // Log error
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error('COMMAND_NAME', `Error: ${error.message}`, error);
            }
            
            // Show user-friendly error message
            this.terminal.write({
                text: `Error: ${error.message}\n`,
                color: 'red',
                bold: true
            });
            
            // Show usage if argument error
            if (error.message.includes('argument') || error.message.includes('option')) {
                this._showUsage();
            }
            
            // Terminate after error
            setTimeout(() => this._selfClose(), 300);
        }
    }, 0);
}
```

### Error Types

```javascript
// Permission errors
if (error.message.includes('没有权限') || error.message.includes('permission')) {
    this.terminal.write('Error: Permission denied\n');
    this.terminal.write('This command requires additional permissions.\n');
}

// File not found errors
if (error.message.includes('不存在') || error.message.includes('not found')) {
    this.terminal.write('Error: File or directory not found\n');
}

// Invalid argument errors
if (error.message.includes('invalid') || error.message.includes('无效')) {
    this.terminal.write('Error: Invalid argument\n');
    this._showUsage();
}
```

## Self-Termination

### Why Auto-Terminate?

Bin programs should automatically terminate after execution because:
- They are one-shot commands (like `ls`, `ps`, `cat`)
- They don't maintain interactive state
- Terminal expects them to complete and return control

### Termination Methods

**Method 1: Bound API (Recommended)**

```javascript
_selfClose: async function() {
    if (this._closing) return;
    this._closing = true;
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
        await this._kernelAPI.call('Process.requestSelfTermination', []);
    }
}
```

**Method 2: Standard API**

```javascript
_selfClose: async function() {
    if (this._closing) return;
    this._closing = true;
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (typeof ProcessManager !== 'undefined') {
        await ProcessManager.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
    }
}
```

**Method 3: Force Termination (Fallback)**

```javascript
_selfClose: async function() {
    if (this._closing) return;
    this._closing = true;
    
    try {
        // Try normal termination first
        if (this._kernelAPI) {
            await this._kernelAPI.call('Process.requestSelfTermination', []);
        }
    } catch (error) {
        // Fallback to force termination
        if (typeof ProcessManager !== 'undefined' && ProcessManager.killProgram) {
            await ProcessManager.killProgram(this.pid, true);
        }
    }
}
```

## Common Patterns

### Pattern 1: Simple Command (No Arguments)

```javascript
_executeCommand: async function() {
    // Simple command that just outputs information
    this.terminal.write('System Information:\n');
    this.terminal.write(`Version: ${SystemInformation.getSystemVersion()}\n`);
    this.terminal.write(`Kernel: ${SystemInformation.getKernelVersion()}\n`);
}
```

### Pattern 2: Command with Options

```javascript
_executeCommand: async function(args) {
    const options = this._parseOptions(args);
    
    if (options.verbose) {
        this.terminal.write('Verbose mode enabled\n');
    }
    
    // Execute with options
    await this._doWork(options);
}
```

### Pattern 3: File Processing Command

```javascript
_executeCommand: async function(args) {
    if (args.length === 0) {
        this.terminal.write('Error: No file specified\n');
        this._showUsage();
        return;
    }
    
    const filePath = args[0];
    
    try {
        const content = await this._kernelAPI.call('FileSystem.read', [filePath]);
        this.terminal.write(content);
    } catch (error) {
        this.terminal.write(`Error reading file: ${error.message}\n`);
    }
}
```

### Pattern 4: Interactive Command

```javascript
_executeCommand: async function(args) {
    // Show prompt
    this.terminal.write('Enter value: ');
    
    // Note: Terminal input handling depends on terminal implementation
    // Most bin programs are non-interactive and process arguments only
}
```

### Pattern 5: Command with Subcommands

```javascript
_executeCommand: async function(args) {
    const subcommand = args[0];
    
    switch (subcommand) {
        case 'list':
            await this._cmdList(args.slice(1));
            break;
        case 'start':
            await this._cmdStart(args.slice(1));
            break;
        case 'stop':
            await this._cmdStop(args.slice(1));
            break;
        default:
            this.terminal.write(`Unknown subcommand: ${subcommand}\n`);
            this._showUsage();
    }
}
```

## Best Practices

### 1. Always Check Terminal Availability

```javascript
__init__: async function(pid, initArgs) {
    if (!initArgs.terminal) {
        throw new Error('CLI program requires terminal environment');
    }
    this.terminal = initArgs.terminal;
}
```

### 2. Use setTimeout for Execution

```javascript
__init__: async function(pid, initArgs) {
    // Use setTimeout to ensure process state is 'running' before execution
    setTimeout(async () => {
        await this._executeCommand(initArgs.args || []);
        setTimeout(() => this._selfClose(), 300);
    }, 0);
}
```

### 3. Always Auto-Terminate

```javascript
// After command execution completes
setTimeout(() => this._selfClose(), 300);
```

### 4. Provide Help Information

```javascript
_showUsage: function() {
    this.terminal.write('Usage: command [options] [arguments]\n');
    this.terminal.write('\n');
    this.terminal.write('Options:\n');
    this.terminal.write('  -h, --help    Show help\n');
    this.terminal.write('\n');
    this.terminal.write('Examples:\n');
    this.terminal.write('  command arg1\n');
}
```

### 5. Handle Errors Gracefully

```javascript
try {
    await this._executeCommand(args);
} catch (error) {
    this.terminal.write(`Error: ${error.message}\n`);
    if (error.message.includes('argument')) {
        this._showUsage();
    }
} finally {
    setTimeout(() => this._selfClose(), 300);
}
```

### 6. Use Bound API for Kernel Calls

```javascript
// Prefer bound API (prevents PID spoofing)
await this._kernelAPI.call('Process.requestSelfTermination', []);

// Instead of
await ProcessManager.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
```

### 7. Prevent Duplicate Termination

```javascript
_closing: false,

_selfClose: async function() {
    if (this._closing) return;
    this._closing = true;
    // ... termination logic
}
```

### 8. Clean Up Resources

```javascript
__exit__: async function() {
    this.terminal = null;
    this._kernelAPI = null;
    // Clear any other references
}
```

## File Location and Naming

### File Structure

```
system/service/DISK/D/bin/
├── ps.js           # Process list command
├── service.js      # Service management command
├── vim.js          # Text editor
├── netport.js      # Network port command
└── mycommand.js    # Your new command
```

### Naming Convention

- **File name**: Lowercase, matches command name
- **Program name**: Uppercase constant (e.g., `PS`, `SERVICE`)
- **Command name**: Same as file name (without `.js`)

**Example**:
- File: `ps.js`
- Program object: `PS`
- Command: `ps`

## Permissions

### Common Permissions for Bin Programs

```javascript
permissions: typeof PermissionManager !== 'undefined' ? [
    PermissionManager.PERMISSION.EVENT_LISTENER,      // Always needed
    PermissionManager.PERMISSION.KERNEL_DISK_READ,     // For file reading
    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,   // For file writing
    PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE, // For service commands (DANGEROUS)
    // Add other permissions as needed
] : []
```

## Complete Example: Simple List Command

```javascript
(function(window) {
    'use strict';

    const LS = {
        pid: null,
        terminal: null,
        _kernelAPI: null,
        _closing: false,

        __info__: function() {
            return {
                name: 'LS',
                type: 'CLI',
                version: '1.0.0',
                description: 'List directory contents',
                author: 'ZerOS Team',
                copyright: '© 2025',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: true
                }
            };
        },

        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;
            this.terminal = initArgs.terminal;
            this._kernelAPI = initArgs.kernelAPI || null;

            if (!this.terminal) {
                throw new Error('LS requires terminal environment');
            }

            const args = initArgs.args || [];

            setTimeout(async () => {
                try {
                    if (args.includes('-h') || args.includes('--help')) {
                        this._showUsage();
                        setTimeout(() => this._selfClose(), 300);
                        return;
                    }

                    const path = args[0] || 'D:';
                    await this._listDirectory(path);
                    setTimeout(() => this._selfClose(), 300);
                } catch (error) {
                    this.terminal.write(`ls: ${error.message}\n`);
                    setTimeout(() => this._selfClose(), 300);
                }
            }, 0);
        },

        _listDirectory: async function(path) {
            try {
                const files = await this._kernelAPI.call('FileSystem.list', [path]);
                
                if (files.length === 0) {
                    this.terminal.write('(empty)\n');
                    return;
                }

                for (const file of files) {
                    const type = file.type === 'directory' ? 'd' : '-';
                    const name = file.name;
                    this.terminal.write(`${type} ${name}\n`);
                }
            } catch (error) {
                throw new Error(`Cannot list directory '${path}': ${error.message}`);
            }
        },

        _showUsage: function() {
            this.terminal.write('Usage: ls [directory]\n');
            this.terminal.write('\n');
            this.terminal.write('List directory contents.\n');
            this.terminal.write('\n');
            this.terminal.write('Examples:\n');
            this.terminal.write('  ls\n');
            this.terminal.write('  ls D:/application\n');
        },

        _selfClose: async function() {
            if (this._closing) return;
            this._closing = true;
            await new Promise(resolve => setTimeout(resolve, 200));
            
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                await this._kernelAPI.call('Process.requestSelfTermination', []);
            }
        },

        __exit__: async function() {
            this.terminal = null;
            this._kernelAPI = null;
        }
    };

    if (typeof window !== 'undefined') {
        window.LS = LS;
    }
})(window);
```

## Testing

### Manual Testing

1. Place file in `system/service/DISK/D/bin/mycommand.js`
2. Open terminal
3. Type command name: `mycommand`
4. Verify output and behavior
5. Test with different arguments
6. Test error cases

### Common Test Cases

- Command without arguments
- Command with valid arguments
- Command with invalid arguments
- Command with help flag (`-h`, `--help`)
- Command with missing required arguments
- Command with permission errors
- Command with file not found errors

## Common Issues and Solutions

### Issue: "CLI程序需要终端环境"

**Cause**: Terminal not available in `initArgs`

**Solution**: Ensure program is started from terminal, not GUI

### Issue: "API调用拒绝(PID校验)"

**Cause**: PID validation fails in VM/CLI programs

**Solution**: Use bound API `this._kernelAPI.call()` instead of `ProcessManager.callKernelAPI(this.pid, ...)`

### Issue: Program doesn't terminate

**Cause**: Forgot to call `_selfClose()` or termination failed

**Solution**: 
1. Always call `_selfClose()` after execution
2. Use bound API for termination
3. Add fallback force termination

### Issue: Output not visible

**Cause**: Program terminates before output completes

**Solution**: Add delay before termination:
```javascript
setTimeout(() => this._selfClose(), 300);
```

## References

- TerminalAPI: `docs/API/TerminalAPI.md`
- ProcessManager: `docs/API/ProcessManager.md`
- Developer Guide: `docs/DEVELOPER_GUIDE.md`
- Kernel Interaction Skill: `dev/skill/zeros-kernel-interaction/SKILL.md`
- Terminal Commands: `docs/TERMINAL_COMMANDS.md`
