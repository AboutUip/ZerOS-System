# 翻译服务（server-translate）

## 概述

`server-translate` 是 ZerOS 内置的**AI 智能翻译 + 普通机器翻译**服务，由 ServerExpansion 从 `D/server` 加载。服务启动后在 **POOL > SERVER** 中暴露 `Translate` 对象，提供普通机器翻译接口与 AI 智能翻译接口（单条/批量、风格、上下文等）。

- **服务 ID**：`translate`（对应文件 `server-translate.js`）
- **位置**：`D/server/server-translate.js`（项目内 `system/service/DISK/D/server/server-translate.js`）
- **依赖**：ServerExpansion 已随 BootLoader 加载；服务运行在主窗口，可访问内核全局对象及 POOL。

## 暴露的 API（POOL > SERVER）

服务**启动后**，其他模块可通过 `POOL.__GET__('SERVER', 'Translate')` 获取翻译 API：

| 方法/属性 | 说明 |
|-----------|------|
| `translateSimple(text, toLang)` | 普通机器翻译。单条文本，目标语言。返回 `Promise<{ text, translate }>`。接口：POST `https://uapis.cn/api/v1/translate/text?to_lang=<toLang>`，请求体 `{ text }`，响应 `{ text, translate }`。 |
| `translate(textOrTexts, optionsOrTargetLang)` | AI 智能翻译。单条（string）或批量（string[]，最多 50 条）；第二参可为目标语言字符串或选项对象。返回单条 `{ is_batch: false, data, performance }` 或批量 `{ is_batch: true, batch_data, batch_summary, performance }`。接口：POST `https://uapis.cn/api/v1/ai/translate?target_lang=...`。 |
| `STYLE` | 翻译风格常量：`casual`、`professional`、`academic`、`literary`。 |
| `CONTEXT` | 翻译上下文常量：`general`、`business`、`technical`、`medical`、`legal`、`marketing`、`entertainment`、`education`、`news`。 |

### 调用示例

```javascript
var T = POOL.__GET__('SERVER', 'Translate');
if (!T) return; // 服务未启动

// 普通机器翻译
T.translateSimple('明天', 'en').then(function (r) {
    console.log(r.text, r.translate); // "明天" "tomorrow"
});

// AI 智能翻译（单条，仅目标语言）
T.translate('Hello', 'zh-CHS').then(function (res) {
    console.log(res.data.translated_text);
});

// AI 智能翻译（单条，完整选项）
T.translate('Hello', {
    target_lang: 'zh-CHS',
    style: 'professional',
    context: 'business',
    fast_mode: true
}).then(console.log);

// AI 智能翻译（批量）
T.translate(['Hello', 'World'], { target_lang: 'zh-CHS' }).then(console.log);
```

## 接口说明

### 普通机器翻译

- **地址**：`https://uapis.cn/api/v1/translate/text`
- **方法**：POST
- **查询**：`to_lang`（目标语言代码，如 `en`、`zh`）
- **请求体**：`application/json`，`{ "text": "待翻译文本" }`
- **响应**：`{ "text": "原文", "translate": "译文" }`

### AI 智能翻译

- **地址**：`https://uapis.cn/api/v1/ai/translate`
- **方法**：POST
- **查询**：`target_lang`（目标语言代码，支持如 `zh-CHS`、`en` 等）
- **请求体**：`application/json`，支持字段：
  - `text` 或 `texts`（二选一）：单条文本或文本数组（批量最多 50 条，总计 10 万字符内）
  - `source_lang`（可选）、`style`（可选，默认 `professional`）、`context`（可选，默认 `general`）
  - `preserve_format`（可选，默认 `true`）、`fast_mode`（可选，默认 `false`）、`max_concurrency`（可选，批量时 1–10，默认 3）
- **响应**：单条含 `data`（original_text、translated_text、detected_lang、confidence_score、alternatives、explanation、quality_metrics 等）；批量含 `batch_data`、`batch_summary`；均含 `performance`。

## 生命周期与状态

- **__init__**：仅首次 `ServerExpansion.start('translate')` 时调用一次，打日志。
- **__start__**：向 POOL 注册 `SERVER > Translate`，打日志。
- **__stop__**：从 POOL 移除 `SERVER > Translate`，打日志。
- **__status__**：返回服务与统计信息，包括：
  - `serviceId`、`serviceName`、`version`、`running`、`poolExposed`、`poolCategory`、`poolKey`、`poolPath`
  - `simpleApi`、`aiApi`、`defaultTargetLang`、`styles`、`contexts`、`fetchAvailable`、`usage`
  - `stats`：`requestCount`、`successCount`、`errorCount`、`lastRequestAt`、`lastSuccessAt`、`lastErrorAt`、`lastError`
- **__info__**：返回 `{ name: 'Translate', version: '2.0', description: '...' }`。

## 终端调试命令

在终端中可使用 **debug** 命令查看或测试翻译服务（需管理员权限）：

- **debug translate** 或 **debug translate --status**：显示 POOL > SERVER Translate 是否已注册、服务状态及统计（请求/成功/失败次数等）。
- **debug translate --simple "文本" &lt;to_lang&gt;**：调用普通机器翻译并输出原文与译文（需翻译服务已启动）。
- **debug services**：列出 D/server 已加载的服务 id。
- **debug services --status**：列出各服务并显示运行状态、名称、版本。
- **debug services --status translate**：仅显示 translate 服务的状态。

详见 [终端命令 - debug](../TERMINAL_COMMANDS.md#debug-action-args)。

## 相关文档

- [ServerExpansion API](../API/ServerExpansion.md) - 服务扩展加载与启停
- [服务模块编写 (ServiceModule.md)](./ServiceModule.md) - D/server 服务约定与示例
- [终端命令 - debug](../TERMINAL_COMMANDS.md#debug-action-args) - debug 子命令 translate、services
