# SystemExpansion API 文档

## 概述

`SystemExpansion` 是 ZerOS 的**系统全屏覆盖**扩展，提供全屏覆盖界面用于显示协议、补丁安装、系统配置等场景。该扩展会创建一个覆盖整个屏幕的模态界面，阻止用户与底层内容交互，直到用户完成操作。

## 主要特性

- **全屏覆盖**：创建模态界面，覆盖整个视口
- **类型支持**：SystemProtocol（协议）、SystemPatch（补丁）、SystemConfiguration（配置）
- **表单验证**：支持 check 配置验证用户输入
- **调用来源验证**：仅允许 D/server 目录下的服务调用
- **快捷键拦截**：阻止 Ctrl/Alt/Shift/Meta + 任意键、Tab、右键菜单

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
| `assets` | string / object | HTML 字符串或渲染器对象 |
| `meta` | object | 元数据配置 |

#### meta 配置

| 属性 | 类型 | 说明 |
|------|------|------|
| `title` | string | 标题文字 |
| `step` | number | 步骤总数（默认 1） |
| `check` | array | 验证规则数组（仅 SystemConfiguration 有效） |

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
    action: 'next' | 'done',  // 用户操作类型
    step: 1,                    // 当前步骤
    totalSteps: 1,              // 总步骤数
    isLastStep: true,          // 是否最后一步
    type: 'SystemProtocol',    // 类型
    data: {                    // 用户填写的数据（仅 SystemConfiguration）
        username: 'admin',
        agree: true
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

- **按钮**：下一步、完成、取消
- **下一步文字**：「我已了解本次补丁的重要性」
- **完成文字**：「完成安装」
- **取消文字**：「取消」
- **验证**：无

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
// 第一步
const result1 = await SystemExpansion.enterOverlay('SystemPatch', step1Html, {
    title: '安装补丁 (1/2)',
    step: 2
});

// 用户点击下一步后，再次调用
const result2 = await SystemExpansion.enterOverlay('SystemPatch', step2Html, {
    title: '安装补丁 (2/2)',
    step: 2
});
```

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
