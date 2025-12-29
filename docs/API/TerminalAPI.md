# TerminalAPI 文档

## 概述

`TerminalAPI` 是 ZerOS 终端应用程序提供的 API，供 CLI 程序通过共享空间访问终端功能。CLI 程序可以通过 `TerminalAPI` 与终端交互，包括写入输出、清空屏幕、设置工作目录、管理环境变量、管理标签页等。

## 访问方式

### 通过共享空间访问

```javascript
// 获取 TerminalAPI
const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");

if (TerminalAPI) {
    // 使用 TerminalAPI
    TerminalAPI.write('Hello World\n');
}
```

### 通过 initArgs 访问

CLI 程序在 `__init__` 方法中可以通过 `initArgs.terminal` 获取终端实例：

```javascript
__init__: async function(pid, initArgs) {
    this.pid = pid;
    this.terminal = initArgs.terminal;
    
    if (!this.terminal) {
        throw new Error('CLI程序需要终端环境');
    }
    
    // 使用终端 API
    this.terminal.write('Hello from CLI program\n');
}
```

**注意**：`initArgs.terminal` 提供的是终端实例，而 `TerminalAPI` 提供的是统一的 API 接口。推荐使用 `TerminalAPI`，因为它会自动操作当前活动的终端实例。

## API 方法

### 输出控制

#### `write(textOrOptions)`

写入输出到终端。

**参数**:
- `textOrOptions` (string|Object): 
  - 如果是字符串，直接写入文本
  - 如果是对象，支持以下选项：
    - `text` (string): 要写入的文本
    - `color` (string): 文本颜色（CSS 颜色值）
    - `background` (string): 背景颜色（CSS 颜色值）
    - `bold` (boolean): 是否加粗
    - `italic` (boolean): 是否斜体
    - `underline` (boolean): 是否下划线

**示例**:
```javascript
// 写入普通文本
TerminalAPI.write('Hello World\n');

// 写入带样式的文本
TerminalAPI.write({
    text: 'Error: File not found\n',
    color: 'red',
    bold: true
});
```

#### `clear()`

清空终端输出。

**示例**:
```javascript
TerminalAPI.clear();
```

### 工作目录管理

#### `setCwd(path)`

设置当前工作目录。

**参数**:
- `path` (string): 工作目录路径（如 `"C:/Users"` 或 `"D:/project"`）

**示例**:
```javascript
TerminalAPI.setCwd('C:/Users');
TerminalAPI.setCwd('D:/project/myapp');
```

### 用户和主机管理

#### `setUser(user)`

设置当前用户。

**参数**:
- `user` (string): 用户名

**示例**:
```javascript
TerminalAPI.setUser('alice');
```

#### `setHost(host)`

设置主机名。

**参数**:
- `host` (string): 主机名

**示例**:
```javascript
TerminalAPI.setHost('myhost');
```

### 环境变量管理

#### `getEnv()`

获取环境变量。

**返回值**: `Object|null` - 环境变量对象（副本），如果终端不可用则返回 `null`

**示例**:
```javascript
const env = TerminalAPI.getEnv();
if (env) {
    console.log('PATH:', env.PATH);
    console.log('HOME:', env.HOME);
}
```

#### `setEnv(env)`

设置环境变量。

**参数**:
- `env` (Object): 环境变量对象（键值对）

**示例**:
```javascript
// 设置单个环境变量
TerminalAPI.setEnv({ KEY: 'value' });

// 设置多个环境变量
TerminalAPI.setEnv({
    PATH: '/usr/bin:/usr/local/bin',
    HOME: '/home/user',
    EDITOR: 'vim'
});
```

**注意**：`setEnv` 会合并到现有环境变量中，不会完全替换。

### 焦点控制

#### `focus()`

使终端获得焦点。

**示例**:
```javascript
TerminalAPI.focus();
```

### 标签页管理

#### `createTab(title)`

创建新标签页。

**参数**:
- `title` (string|null): 标签页标题（可选，如果为 `null` 则使用默认标题）

**返回值**: `string|null` - 新标签页的 ID，如果创建失败则返回 `null`

**示例**:
```javascript
const tabId = TerminalAPI.createTab('My Tab');
if (tabId) {
    console.log('新标签页已创建:', tabId);
}
```

#### `switchTab(tabId)`

切换到指定标签页。

**参数**:
- `tabId` (string): 标签页 ID

**示例**:
```javascript
TerminalAPI.switchTab('tab-123');
```

#### `closeTab(tabId)`

关闭指定标签页。

**参数**:
- `tabId` (string): 标签页 ID

**示例**:
```javascript
TerminalAPI.closeTab('tab-123');
```

#### `getTabs()`

获取所有标签页列表。

**返回值**: `Array<Object>` - 标签页列表，每个对象包含：
- `id` (string): 标签页 ID
- `title` (string): 标签页标题
- `isActive` (boolean): 是否为活动标签页

**示例**:
```javascript
const tabs = TerminalAPI.getTabs();
tabs.forEach(tab => {
    console.log(`${tab.title} (${tab.isActive ? '活动' : '非活动'})`);
});
```

### 命令处理

#### `onCommand(handler)`

注册命令处理器。

**参数**:
- `handler` (Function): 命令处理函数，接收命令字符串作为参数

**返回值**: `any|null` - 处理器注册结果，如果终端不可用则返回 `null`

**示例**:
```javascript
TerminalAPI.onCommand((command) => {
    if (command.startsWith('myapp ')) {
        const args = command.substring(6).trim();
        // 处理命令
        TerminalAPI.write(`执行命令: ${args}\n`);
    }
});
```

#### `offCommand(handler)`

取消命令处理器。

**参数**:
- `handler` (Function): 要取消的命令处理函数

**示例**:
```javascript
const handler = (command) => { /* ... */ };
TerminalAPI.onCommand(handler);
// 稍后取消
TerminalAPI.offCommand(handler);
```

#### `executeCommand(command)`

执行命令（模拟用户输入）。

**参数**:
- `command` (string): 要执行的命令

**示例**:
```javascript
TerminalAPI.executeCommand('ls -la');
```

### 实例管理

#### `getActiveTerminal()`

获取当前活动的终端实例。

**返回值**: `Object|null` - 终端实例对象，如果终端不可用则返回 `null`

**注意**：此方法主要用于高级用法，一般不需要直接使用。

## 使用示例

### 基本输出

```javascript
const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");

if (TerminalAPI) {
    // 写入普通文本
    TerminalAPI.write('Hello World\n');
    
    // 写入错误信息（红色加粗）
    TerminalAPI.write({
        text: 'Error: File not found\n',
        color: 'red',
        bold: true
    });
    
    // 写入成功信息（绿色）
    TerminalAPI.write({
        text: 'Success: Operation completed\n',
        color: 'green'
    });
}
```

### 工作目录和环境变量

```javascript
const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");

if (TerminalAPI) {
    // 设置工作目录
    TerminalAPI.setCwd('C:/Users/Alice');
    
    // 获取环境变量
    const env = TerminalAPI.getEnv();
    if (env) {
        TerminalAPI.write(`当前用户: ${env.USER}\n`);
        TerminalAPI.write(`主目录: ${env.HOME}\n`);
    }
    
    // 设置环境变量
    TerminalAPI.setEnv({
        MYAPP_HOME: 'C:/myapp',
        MYAPP_DEBUG: 'true'
    });
}
```

### 标签页管理

```javascript
const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");

if (TerminalAPI) {
    // 创建新标签页
    const tabId = TerminalAPI.createTab('My Application');
    
    // 切换到新标签页
    if (tabId) {
        TerminalAPI.switchTab(tabId);
        TerminalAPI.write('已切换到新标签页\n');
    }
    
    // 获取所有标签页
    const tabs = TerminalAPI.getTabs();
    TerminalAPI.write(`共有 ${tabs.length} 个标签页\n`);
}
```

### 命令处理

```javascript
const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");

if (TerminalAPI) {
    // 注册命令处理器
    TerminalAPI.onCommand((command) => {
        if (command === 'hello') {
            TerminalAPI.write('Hello from my CLI program!\n');
        } else if (command.startsWith('echo ')) {
            const text = command.substring(5);
            TerminalAPI.write(`${text}\n`);
        }
    });
    
    // 执行命令
    TerminalAPI.executeCommand('hello');
}
```

## 注意事项

1. **终端可用性检查**：在使用 `TerminalAPI` 之前，应该检查它是否可用：
   ```javascript
   const TerminalAPI = POOL.__GET__("APPLICATION_SHARED_POOL", "TerminalAPI");
   if (!TerminalAPI) {
       console.error('TerminalAPI 不可用');
       return;
   }
   ```

2. **活动终端实例**：`TerminalAPI` 会自动操作当前活动的终端实例。如果终端窗口被关闭或没有活动终端，某些操作可能会失败。

3. **环境变量**：`getEnv()` 返回的是环境变量的副本，修改返回的对象不会影响实际环境变量。要修改环境变量，必须使用 `setEnv()`。

4. **命令处理器**：命令处理器会在用户输入命令时被调用。如果多个程序注册了命令处理器，它们都会被调用。

5. **标签页管理**：标签页管理功能需要终端支持多标签页。如果终端不支持，相关方法可能无效。

6. **样式支持**：`write()` 方法的样式选项（颜色、加粗等）取决于终端的实现。某些终端可能不支持所有样式。

## 相关文档

- [ProcessManager API](./ProcessManager.md) - 进程管理，包括 CLI 程序启动
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南，包含 CLI 程序开发示例
- [Pool API](./Pool.md) - 共享空间（POOL）使用说明

