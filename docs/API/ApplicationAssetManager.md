# ApplicationAssetManager API 文档

## 概述

`ApplicationAssetManager` 是 ZerOS 内核的应用程序资源管理器，负责管理所有应用程序的资源信息，包括脚本路径、样式表、图标和元数据。提供统一的 API 来查询和操作程序资源。

## 依赖

- `APPLICATION_ASSETS` - 应用程序资源映射（从 `applicationAssets.js` 加载）
- `POOL` - 全局对象池（用于存储资源映射）

## 初始化

应用程序资源管理器在系统启动时自动初始化：

```javascript
await ApplicationAssetManager.init();
```

## API 方法

### 程序查询

#### `getProgramInfo(programName)`

获取程序的所有信息。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Object|null` - 程序信息对象
```javascript
{
    script: string,        // 脚本路径
    styles: Array<string>, // 样式表路径数组
    assets: Array<string>, // 资源文件路径数组
    icon: string|null,     // 图标路径
    metadata: Object       // 元数据对象
}
```

**示例**:
```javascript
const info = ApplicationAssetManager.getProgramInfo('vim');
if (info) {
    console.log(`脚本: ${info.script}`);
    console.log(`样式: ${info.styles.join(', ')}`);
    console.log(`图标: ${info.icon}`);
}
```

#### `getProgram(programName)`

获取指定程序的资源对象（原始格式）。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Object|string|null` - 程序资源对象或路径字符串

#### `hasProgram(programName)`

检查程序是否存在。

**参数**:
- `programName` (string): 程序名称

**返回值**: `boolean` - 是否存在

#### `listPrograms()`

列出所有程序名称。

**返回值**: `Array<string>` - 程序名称数组

**示例**:
```javascript
const programs = ApplicationAssetManager.listPrograms();
console.log(`共有 ${programs.length} 个程序`);
```

#### `listAllPrograms()`

获取所有程序信息。

**返回值**: `Array<Object>` - 程序信息数组
```javascript
[
    {
        name: string,
        script: string,
        styles: Array<string>,
        assets: Array<string>,
        icon: string|null,
        metadata: Object
    }
]
```

### 程序资源获取

#### `getScriptPath(programName)`

获取程序的脚本路径。

**参数**:
- `programName` (string): 程序名称

**返回值**: `string|null` - 脚本路径

#### `getStyles(programName)`

获取程序的样式表路径列表。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Array<string>` - 样式表路径数组

#### `getIcon(programName)`

获取程序的图标路径。

**参数**:
- `programName` (string): 程序名称

**返回值**: `string|null` - 图标路径

#### `getMetadata(programName)`

获取程序的元数据。

**参数**:
- `programName` (string): 程序名称

**返回值**: `Object|null` - 元数据对象

**元数据对象结构**:
```javascript
{
    autoStart: boolean,              // 是否自动启动
    priority: number,                // 启动优先级
    description: string,            // 程序描述
    version: string,                 // 版本号
    type: string,                   // 程序类型（'GUI' 或 'CLI'）
    alwaysShowInTaskbar: boolean,  // 是否常显在任务栏
    allowMultipleInstances: boolean // 是否支持多实例
}
```

### 程序列表过滤

#### `getAutoStartPrograms()`

获取需要自动启动的程序列表（按优先级排序）。

**返回值**: `Array<Object>` - 自动启动程序列表（包含 `priority` 字段）

**示例**:
```javascript
const autoStartPrograms = ApplicationAssetManager.getAutoStartPrograms();
autoStartPrograms.forEach(program => {
    console.log(`${program.name} (优先级: ${program.priority})`);
});
```

#### `getAlwaysShowPrograms()`

获取常显在任务栏的程序列表。

**返回值**: `Array<Object>` - 常显程序列表

**示例**:
```javascript
const alwaysShowPrograms = ApplicationAssetManager.getAlwaysShowPrograms();
alwaysShowPrograms.forEach(program => {
    console.log(`${program.name} - ${program.metadata.description}`);
});
```

### 程序资源管理

#### `setProgram(programName, asset)`

添加或更新程序资源。

**参数**:
- `programName` (string): 程序名称
- `asset` (string|Object): 程序资源（字符串路径或对象）

**返回值**: `boolean` - 是否成功

**示例**:
```javascript
// 简单格式（字符串路径）
ApplicationAssetManager.setProgram('myapp', 'application/myapp/myapp.js');

// 完整格式（对象）
ApplicationAssetManager.setProgram('myapp', {
    script: 'application/myapp/myapp.js',
    styles: ['application/myapp/myapp.css'],
    icon: 'application/myapp/myapp.svg',
    metadata: {
        autoStart: false,
        description: '我的应用'
    }
});
```

#### `removeProgram(programName)`

删除程序资源。

**参数**:
- `programName` (string): 程序名称

**返回值**: `boolean` - 是否成功

#### `validateAsset(asset)`

验证程序资源格式。

**参数**:
- `asset` (string|Object): 程序资源

**返回值**: `Object` - 验证结果
```javascript
{
    valid: boolean,      // 是否有效
    errors: Array<string> // 错误列表
}
```

**示例**:
```javascript
const result = ApplicationAssetManager.validateAsset({
    script: 'application/myapp/myapp.js',
    styles: ['application/myapp/myapp.css']
});

if (result.valid) {
    console.log('资源格式有效');
} else {
    console.error('资源格式错误:', result.errors);
}
```

### 其他方法

#### `getAssets()`

获取内部资源对象（只读）。

**返回值**: `Object` - 应用程序资源对象

## 使用示例

### 示例 1: 查询程序信息

```javascript
// 检查程序是否存在
if (ApplicationAssetManager.hasProgram('vim')) {
    // 获取程序信息
    const info = ApplicationAssetManager.getProgramInfo('vim');
    console.log(`脚本: ${info.script}`);
    console.log(`样式: ${info.styles.join(', ')}`);
    console.log(`图标: ${info.icon}`);
    console.log(`描述: ${info.metadata.description}`);
}
```

### 示例 2: 列出所有程序

```javascript
// 列出所有程序名称
const programs = ApplicationAssetManager.listPrograms();
console.log(`共有 ${programs.length} 个程序:`);
programs.forEach(name => {
    console.log(`- ${name}`);
});

// 获取所有程序详细信息
const allPrograms = ApplicationAssetManager.listAllPrograms();
allPrograms.forEach(program => {
    console.log(`${program.name}: ${program.metadata.description}`);
});
```

### 示例 3: 获取自动启动程序

```javascript
// 获取自动启动程序（按优先级排序）
const autoStartPrograms = ApplicationAssetManager.getAutoStartPrograms();
console.log('自动启动程序:');
autoStartPrograms.forEach(program => {
    console.log(`  ${program.name} (优先级: ${program.priority})`);
});
```

### 示例 4: 动态添加程序

```javascript
// 动态添加程序资源
ApplicationAssetManager.setProgram('myapp', {
    script: 'application/myapp/myapp.js',
    styles: ['application/myapp/myapp.css'],
    icon: 'application/myapp/myapp.svg',
    metadata: {
        autoStart: false,
        priority: 1,
        description: '我的应用',
        version: '1.0.0',
        type: 'GUI',
        alwaysShowInTaskbar: false,
        allowMultipleInstances: true
    }
});

// 验证资源格式
const validation = ApplicationAssetManager.validateAsset({
    script: 'application/myapp/myapp.js'
});
if (validation.valid) {
    console.log('资源格式有效');
}
```

## 程序资源格式

### 简单格式

```javascript
"myapp": "application/myapp/myapp.js"
```

### 完整格式

```javascript
"myapp": {
    script: "application/myapp/myapp.js",
    styles: ["application/myapp/myapp.css"],
    assets: ["application/myapp/assets/icon.svg"],
    icon: "application/myapp/myapp.svg",
    metadata: {
        autoStart: false,
        priority: 1,
        description: "我的应用",
        version: "1.0.0",
        type: "GUI",
        alwaysShowInTaskbar: false,
        allowMultipleInstances: true
    }
}
```

## 注意事项

1. **初始化**: 资源管理器在系统启动时自动初始化，通常不需要手动调用 `init()`
2. **资源格式**: 支持简单格式（字符串）和完整格式（对象）
3. **元数据**: 元数据中的 `autoStart` 和 `priority` 用于控制程序自动启动顺序
4. **任务栏显示**: `alwaysShowInTaskbar` 控制程序是否常显在任务栏
5. **多实例**: `allowMultipleInstances` 控制程序是否支持多实例运行

## 相关文档

- [ZEROS_KERNEL.md](../ZEROS_KERNEL.md) - 内核概述
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南
- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API

