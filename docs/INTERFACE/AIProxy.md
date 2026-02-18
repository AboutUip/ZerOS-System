# AI 代理服务（AI Proxy）

## 概述

ZerOS 提供两种 **AI 代理服务**，用于将前端 AI 请求转发至第三方 API，绕过浏览器 CORS 限制。鉴权信息（API Key 等）由前端在请求体 `_auth` 中传入，不暴露在 URL 中。

| 服务 | 文件 | 目标 API |
|------|------|----------|
| 讯飞星火 | spark-ai-proxy.php | 讯飞星火开放平台 |
| 通义千问（DashScope） | dashscope-ai-proxy.php | 阿里云 DashScope（兼容 OpenAI 格式） |

**调用方**：`D/server/server-aiassistant.js`（AI 助手服务）

---

## spark-ai-proxy（讯飞星火）

### 访问方式

```
POST /system/service/spark-ai-proxy.php
Content-Type: application/json
```

### 请求体

将讯飞 API 的请求体原样传入，并增加 `_auth` 对象：

```json
{
  "_auth": {
    "appId": "讯飞应用 ID",
    "apiPassword": "讯飞 API 密钥"
  },
  "model": "spark-v3.5",
  "messages": [...],
  "temperature": 0.7
}
```

- `_auth` 会被代理剥离后用于请求头鉴权
- 其余字段按讯飞 `chat/completions` 格式透传

### 鉴权头

代理将 `appId` 作为 `X-App-Id`，`apiPassword` 作为 `Authorization: Bearer xxx` 转发至讯飞 API。

### 目标地址

`https://spark-api-open.xf-yun.com/x2/chat/completions`

---

## dashscope-ai-proxy（通义千问）

### 访问方式

```
POST /system/service/dashscope-ai-proxy.php
Content-Type: application/json
```

### 请求体

使用 OpenAI 兼容格式，并增加 `_auth`：

```json
{
  "_auth": {
    "apiKey": "阿里云 DashScope API Key"
  },
  "model": "qwen-plus",
  "messages": [
    { "role": "user", "content": "你好" }
  ],
  "stream": false
}
```

- `_auth` 会被代理剥离，`apiKey` 用于 `Authorization: Bearer xxx`
- 其余字段按 OpenAI 兼容格式透传

### 目标地址

`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`

---

## 通用说明

| 项目 | 说明 |
|------|------|
| 方法 | 仅支持 POST |
| CORS | 允许 `*` |
| 超时 | 60 秒 |
| 响应 | 透传目标 API 的 JSON 响应，状态码保持一致 |
| 错误 | 400（非法 JSON）、405（非 POST）、500（cURL 不可用）、502（转发失败） |

## 配置来源

AI 助手服务从 `ZEROS_SERVER_AIA_CONFIG`（LStorage）读取 `sparkAppId`、`sparkApiPassword`、`dashscopeApiKey` 等，在调用代理时注入到 `_auth`。

## 相关文档

- [ServerAIAssistant](../SERVER/ServerAIAssistant.md) - AI 助手服务
- [SystemInformation API](../API/SystemInformation.md) - SERVICE_NAMES.SPARK_AI_PROXY、DASHSCOPE_AI_PROXY
