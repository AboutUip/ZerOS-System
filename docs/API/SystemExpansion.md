# SystemExpansion API 文档

## 概述

`SystemExpansion` 是 ZerOS 的**系统全屏覆盖**扩展，提供全屏覆盖界面用于显示协议、补丁安装、系统配置等场景。该扩展会创建一个覆盖整个屏幕的模态界面，阻止用户与底层内容交互，直到用户完成操作。

## 主要特性

- **全屏覆盖**：创建模态界面，覆盖整个视口
- **类型支持**：SystemProtocol（协议）、SystemPatch（补丁）、SystemConfiguration（配置）
- **表单验证**：支持 check 配置验证用户输入
- **多步骤支持**：内部切换步骤，assets 支持函数形式
- **调用来源验证**：仅允许 D/server 目录下的服务调用
- **快捷键拦截**：阻止所有键盘输入和右键菜单

## 依赖

- `KernelLogger` - 内核日志（可选）
- 调用者须位于 `system/service/DISK/D/server/` 目录

## 获取扩展对象

- 全局：`window.SystemExpansion` 或 `globalThis.SystemExpansion`

## API

### enterOverlay

进入全屏覆盖模式。

```javascript
await SystemExpansion.enterOverlay(type, assets, meta)
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | string | 类型：`SystemProtocol` / `SystemPatch` / `SystemConfiguration` |
| `assets` | string / object / function | HTML 字符串、渲染器对象或函数（函数形式：`(step, meta) => string`） |
| `meta` | object | 元数据配置 |

#### meta 配置

| 属性 | 类型 | 说明 |
|------|------|------|
| `title` | string | 标题文字 |
| `step` | number | 步骤总数（默认 1） |
| `check` | array | 验证规则数组（仅 SystemConfiguration 有效） |
| `patchUrl` | string | 补丁下载 URL（仅 SystemPatch 有效） |
| `patchDescription` | string | 补丁描述（必填，显示本次更新内容） |
| `patchVersion` | string | 补丁版本号（默认 1.0.0） |

#### check 配置

| 属性 | 类型 | 说明 |
|------|------|------|
| `idName` | string | input 元素 id |
| `typeOf` | string | input 类型：`text` / `password` / `checkbox` / `radio` / `file` / `email` / `number` 等 |
| `label` | string | 显示名称（用于错误提示） |
| `required` | boolean | 是否必填 |
| `minLength` | number | 最小长度（text/textarea） |
| `maxLength` | number | 最大长度（text/textarea） |
| `min` | number | 最小值（number/range） |
| `max` | number | 最大值（number/range） |

#### 返回值

```javascript
{
    action: 'next' | 'done' | 'cancel',  // 用户操作类型
    step: 1,                    // 当前步骤
    totalSteps: 1,              // 总步骤数
    isLastStep: true,           // 是否最后一步
    type: 'SystemProtocol',     // 类型
    data: {                    // 用户填写的数据（仅 SystemConfiguration）
        username: 'admin',
        agree: true
    },
    patchResult: {              // 仅 SystemPatch 有效
        success: true,
        updatedFiles: ['kernel/...', 'system/...'],
        message: '更新安装完成'
    }
}
```

## 类型说明

### SystemProtocol（系统协议）

- **按钮**：下一步、完成、取消
- **下一步文字**：「下一份协议」
- **完成文字**：「我已阅读并同意」
- **取消文字**：「我不同意且立即卸载本系统」
- **验证**：无

### SystemPatch（系统补丁）

当提供 `patchUrl` 时，支持自动下载/解压/安装补丁流程：

- **第1步**：显示补丁描述 + 「开始安装」按钮
- **第2步**：下载补丁（显示进度）
- **第3步**：解压补丁（显示进度）
- **第4步**：安装覆盖（显示进度）
- **无 patchUrl**：使用自定义 assets（与原来相同）

**meta 字段**：
- `patchUrl`：补丁下载地址（ZIP 压缩包）
- `patchDescription`：补丁描述（必填，显示本次更新内容）
- `patchVersion`：版本号（默认 1.0.0）

**按钮**：「开始安装」/「完成」/「取消」/「重试」

### SystemConfiguration（系统配置）

- **按钮**：下一步、完成
- **下一步文字**：「我已配置完成本页」
- **完成文字**：「完成配置」
- **取消文字**：不显示
- **验证**：支持 check 配置

## 调用来源验证

扩展通过调用栈检测调用来源：

1. **允许**：调用栈包含 `system/service/DISK/D/server/`
2. **允许**：调用栈包含 `terminal` / `Terminal` / `debug`（用于调试）
3. **拒绝**：其他来源

## 使用示例

### 协议同意场景

```javascript
const html = `
    <div style="padding: 24px;">
        <h2>服务协议</h2>
        <p>请阅读以下协议条款...</p>
    </div>
`;

const result = await SystemExpansion.enterOverlay('SystemProtocol', html, {
    title: '服务协议',
    step: 1
});

if (result.action === 'done') {
    console.log('用户已同意协议');
} else if (result.action === 'cancel') {
    console.log('用户不同意协议');
}
```

### 带验证的配置场景

```javascript
const html = `
    <div style="padding: 24px;">
        <label>用户名：<input type="text" id="username"></label>
        <label>密码：<input type="password" id="password"></label>
        <label><input type="checkbox" id="agree"> 我同意</label>
    </div>
`;

const result = await SystemExpansion.enterOverlay('SystemConfiguration', html, {
    title: '用户配置',
    step: 1,
    check: [
        { idName: 'username', typeOf: 'text', label: '用户名', required: true, minLength: 3 },
        { idName: 'password', typeOf: 'password', label: '密码', required: true },
        { idName: 'agree', typeOf: 'checkbox', label: '同意', required: true }
    ]
});

console.log(result.data);
// { username: 'admin', password: '123456', agree: true }
```

### 多步骤场景

```javascript
// 使用函数形式，根据 step 返回不同内容
const result = await SystemExpansion.enterOverlay('SystemPatch', function(step, meta) {
    if (step === 1) {
        return `
            <div style="padding: 24px;">
                <h2>步骤 1/2：下载补丁</h2>
                <p>正在下载补丁文件...</p>
            </div>
        `;
    } else {
        return `
            <div style="padding: 24px;">
                <h2>步骤 2/2：安装补丁</h2>
                <p>正在安装补丁...</p>
            </div>
        `;
    }
}, {
    title: '安装补丁',
    step: 2
});

console.log(result.action);  // 'done'
console.log(result.step);    // 2
console.log(result.data);    // 表单数据
```

### 补丁更新场景

```javascript
// 使用 SystemPatch 自动下载安装补丁
const result = await SystemExpansion.enterOverlay('SystemPatch', null, {
    title: '系统更新',
    patchUrl: 'https://example.com/patch-v1.2.0.zip',
    patchDescription: '- 修复了登录页面的显示问题\n- 优化了系统启动速度\n- 新增了深色主题支持',
    patchVersion: '1.2.0'
});

console.log(result.action);  // 'done'
console.log(result.patchResult);
// {
//     success: true,
//     updatedFiles: ['kernel/core/...', 'system/expansion/...'],
//     message: '更新安装完成'
// }
```

#### 补丁更新流程

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 下载 | `FileFramework.download(url, 'D/cache/temp', fileName)` |
| 2 | 解压 | 尝试 `ziper` → `zipService` → `compression` |
| 3 | 覆盖 | `copyDirectoryToPhysical(sourceDir, '/', true)` |

#### 补丁包结构要求

ZIP 压缩包必须从最外层开始包含文件：

```
patch.zip
├── kernel/
│   └── ...
├── system/
│   └── ...
└── ...
```

解压后直接覆盖到项目根目录 `/`。

**多步骤说明**：
- 点击"下一步"时，内部切换步骤并重新渲染内容
- 只有点击"完成"或"取消"时才会退出覆盖
- `assets` 函数形式会在每步切换时调用，接收 `step` 和 `meta` 参数

## 终端调试命令

```bash
# 查看帮助
debug systemexpansion
debug se

# 进入全屏覆盖
debug systemexpansion enter SystemProtocol "测试协议" 1
debug systemexpansion enter SystemPatch "补丁" 2
debug systemexpansion enter SystemConfiguration "配置" 1

# 查看状态
debug systemexpansion status
```

## 样式

扩展使用浅色模式（Microsoft Fluent Design 风格）：

- **背景**：`#fafafa`
- **头部/底部**：`#fff` + 边框 `#e5e5e5`
- **主按钮**：`#0078d4`（Microsoft Blue）
- **取消按钮**：透明背景 + 边框
- **遮罩**：`rgba(0, 0, 0, 0.35)` + `backdrop-filter: blur(4px)`

## 注意事项

1. **异步调用**：`enterOverlay` 返回 Promise，需要使用 `await` 或 `.then()` 处理
2. **用户操作**：点击按钮后覆盖层自动退出，结果通过 Promise 返回
3. **取消操作**：点击取消按钮同样退出覆盖，`action` 为 `cancel`
4. **外部调用**：非 D/server 目录调用会被拒绝
