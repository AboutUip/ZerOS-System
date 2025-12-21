# SpeechDrive API 文档

## 概述

`SpeechDrive` 是 ZerOS 内核的语音识别驱动管理器，负责管理系统级的语音识别功能，基于 Web Speech API。提供统一的语音识别 API 供程序使用，支持多语言识别、持续识别和实时结果反馈。该驱动采用按需启用策略，只在有程序使用时才启用语音识别，其余情况不识别，以节省系统资源。

## 依赖

- `ProcessManager` - 进程管理器（用于进程 ID 管理和会话清理）
- `PermissionManager` - 权限管理器（用于语音识别权限验证）
- `KernelLogger` - 内核日志（用于日志记录）

## 浏览器支持

语音识别功能依赖于浏览器的 Web Speech API 支持：

- ✅ **Chrome/Edge**: 完全支持
- ✅ **Safari**: 部分支持（需要 macOS/iOS）
- ❌ **Firefox**: 不支持

**注意**: 语音识别功能需要 HTTPS 环境（localhost 可用）。

## 常量

### 识别状态

```javascript
SpeechDrive.STATUS = {
    IDLE: 'IDLE',              // 空闲（未启动）
    STARTING: 'STARTING',       // 启动中
    LISTENING: 'LISTENING',     // 正在识别
    STOPPED: 'STOPPED',         // 已停止
    ERROR: 'ERROR'              // 错误
};
```

### 支持的语言

```javascript
SpeechDrive.SUPPORTED_LANGUAGES = [
    'zh-CN',    // 简体中文（默认）
    'zh-TW',    // 繁体中文
    'en-US',    // 美式英语
    'en-GB',    // 英式英语
    'ja-JP',    // 日语
    'ko-KR',    // 韩语
    'fr-FR',    // 法语
    'de-DE',    // 德语
    'es-ES',    // 西班牙语
    'ru-RU'     // 俄语
];
```

### 默认语言

```javascript
SpeechDrive.DEFAULT_LANGUAGE = 'zh-CN';  // 简体中文
```

## 权限要求

所有语音识别 API 调用都需要相应的权限：

- **SPEECH_RECOGNITION** (特殊权限): 语音识别相关操作

特殊权限需要用户确认，首次使用时弹出权限请求对话框。

## 通过 ProcessManager 调用

所有语音识别功能都通过 `ProcessManager.callKernelAPI` 调用：

```javascript
// 获取 ProcessManager
const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");

// 调用语音识别 API
const supported = await ProcessManager.callKernelAPI(
    this.pid,
    'Speech.isSupported'
);
```

## API 方法

### 支持性检查

#### `Speech.isSupported`

检查浏览器是否支持 Web Speech API。

**参数**: 无

**返回值**: `Promise<boolean>` - 是否支持

**示例**:
```javascript
const supported = await Process.callKernelAPI('Speech.isSupported');
if (!supported) {
    console.error('浏览器不支持语音识别');
}
```

### 会话管理

#### `Speech.createSession(options)`

创建语音识别会话。每个程序可以有独立的识别会话。

**参数**:
- `options` (Object, 可选): 识别选项
  - `language` (string, 默认 `'zh-CN'`): 识别语言
  - `continuous` (boolean, 默认 `true`): 是否持续识别
  - `interimResults` (boolean, 默认 `true`): 是否返回临时结果
  - `onResult` (Function, 可选): 识别结果回调
    - `(result: string, isFinal: boolean) => void`
    - `result`: 识别到的文本
    - `isFinal`: 是否为最终结果（`false` 为临时结果）
  - `onError` (Function, 可选): 错误回调
    - `(error: Error) => void`
  - `onEnd` (Function, 可选): 结束回调
    - `() => void`

**返回值**: `Promise<string>` - 会话 ID（即进程 ID 的字符串形式）

**示例**:
```javascript
// 创建识别会话
await Process.callKernelAPI('Speech.createSession', [{
    language: 'zh-CN',
    continuous: true,
    interimResults: true,
    onResult: (text, isFinal) => {
        if (isFinal) {
            console.log('最终结果:', text);
        } else {
            console.log('临时结果:', text);
        }
    },
    onError: (error) => {
        console.error('识别错误:', error.message);
    },
    onEnd: () => {
        console.log('识别已结束');
    }
}]);
```

**注意**:
- 如果程序已有识别会话，会先停止旧会话再创建新会话
- 回调函数在识别过程中会被多次调用
- 临时结果（`isFinal: false`）会实时更新，最终结果（`isFinal: true`）会被保存

### 识别控制

#### `Speech.startRecognition`

启动语音识别。必须在创建会话后调用。

**参数**: 无

**返回值**: `Promise<boolean>` - 是否成功启动

**示例**:
```javascript
// 启动识别
await Process.callKernelAPI('Speech.startRecognition');
```

**注意**:
- 首次启动时会请求麦克风权限
- 如果识别已在运行中，调用此方法不会产生错误

#### `Speech.stopRecognition`

停止语音识别，但保留会话。如果设置了持续识别，会话会自动重启。

**参数**: 无

**返回值**: `Promise<boolean>` - 是否成功停止

**示例**:
```javascript
// 停止识别
await Process.callKernelAPI('Speech.stopRecognition');
```

#### `Speech.stopSession`

停止识别并销毁会话。进程退出时会自动调用此方法。

**参数**: 无

**返回值**: `Promise<boolean>` - 是否成功停止

**示例**:
```javascript
// 停止并销毁会话
await Process.callKernelAPI('Speech.stopSession');
```

### 状态查询

#### `Speech.getSessionStatus`

获取当前识别会话的状态信息。

**参数**: 无

**返回值**: `Promise<Object|null>` - 会话状态信息，如果会话不存在则返回 `null`

**状态信息对象结构**:
```javascript
{
    pid: number,              // 进程 ID
    status: string,            // 当前状态（STATUS 枚举值）
    language: string,          // 识别语言
    continuous: boolean,       // 是否持续识别
    interimResults: boolean,  // 是否返回临时结果
    resultsCount: number,     // 已保存的最终结果数量
    createdAt: Date           // 创建时间
}
```

**示例**:
```javascript
const status = await Process.callKernelAPI('Speech.getSessionStatus');
if (status) {
    console.log('识别状态:', status.status);
    console.log('识别语言:', status.language);
    console.log('结果数量:', status.resultsCount);
}
```

#### `Speech.getSessionResults`

获取当前识别会话的所有最终结果。

**参数**: 无

**返回值**: `Promise<Array<string>>` - 识别结果列表（仅包含最终结果）

**示例**:
```javascript
const results = await Process.callKernelAPI('Speech.getSessionResults');
console.log('识别结果:', results);
// 输出: ['你好', '世界', '语音识别']
```

## 完整使用示例

```javascript
class SpeechRecognitionApp {
    async __init__() {
        this.pid = Process.pid;
        this.results = [];
    }
    
    async start() {
        // 检查支持
        const supported = await Process.callKernelAPI('Speech.isSupported');
        if (!supported) {
            alert('浏览器不支持语音识别');
            return;
        }
        
        // 创建识别会话
        await Process.callKernelAPI('Speech.createSession', [{
            language: 'zh-CN',
            continuous: true,
            interimResults: true,
            onResult: (text, isFinal) => {
                if (isFinal) {
                    this.results.push(text);
                    this.updateUI(text);
                } else {
                    this.updateTemporaryResult(text);
                }
            },
            onError: (error) => {
                console.error('识别错误:', error);
                alert('识别出错: ' + error.message);
            }
        }]);
        
        // 启动识别
        await Process.callKernelAPI('Speech.startRecognition');
    }
    
    async stop() {
        // 停止识别
        await Process.callKernelAPI('Speech.stopRecognition');
    }
    
    async cleanup() {
        // 停止并销毁会话
        await Process.callKernelAPI('Speech.stopSession');
    }
    
    updateUI(text) {
        // 更新 UI 显示最终结果
        console.log('最终结果:', text);
    }
    
    updateTemporaryResult(text) {
        // 更新 UI 显示临时结果
        console.log('临时结果:', text);
    }
}
```

## 错误处理

语音识别可能出现的错误：

- **no-speech**: 未检测到语音
- **audio-capture**: 无法访问麦克风
- **not-allowed**: 麦克风权限被拒绝
- **network**: 网络错误
- **aborted**: 识别已中止

所有错误都会通过 `onError` 回调函数传递。

## 注意事项

1. **权限要求**: 首次使用需要用户授权麦克风权限
2. **HTTPS 要求**: 需要 HTTPS 环境（localhost 可用）
3. **浏览器支持**: 建议使用 Chrome 或 Edge 浏览器
4. **资源管理**: 进程退出时会自动清理识别会话
5. **并发控制**: 每个程序可以有独立的识别会话，互不干扰
6. **按需启用**: 只在有程序使用时才启用识别，节省系统资源
7. **持续识别**: 如果设置了 `continuous: true`，识别停止后会自动重启
8. **临时结果**: 临时结果会实时更新，最终结果会被保存到会话中

## 相关文档

- [ProcessManager.md](./ProcessManager.md) - 进程管理器 API
- [PermissionManager.md](./PermissionManager.md) - 权限管理 API
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) - 开发者指南

