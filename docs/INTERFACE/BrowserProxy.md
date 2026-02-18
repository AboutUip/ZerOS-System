# 浏览器网页代理（BrowserProxy）

## 概述

`BrowserProxy` 是 ZerOS 内置浏览器的**后端代理服务**，用于代理外部网页请求，绕过 X-Frame-Options、CSP frame-ancestors 等 iframe 限制，使 ZerOS 内置浏览器能够加载各类网站。

- **类型**：PHP 后端服务（非 D/server 模块）
- **位置**：`system/service/BrowserProxy.php`
- **调用方**：`D:/application/browser/` 内置浏览器应用、x-frame-bypass

## 访问方式

```
GET  /system/service/BrowserProxy.php?url=<目标URL>
POST /system/service/BrowserProxy.php?url=<目标URL>
```

## 参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 目标站点 URL，仅允许 http/https。支持被多次编码的 URL（服务端会尝试解码） |

## 请求与响应行为

### 请求转发

- 支持 `GET` 与 `POST` 请求转发
- `POST` 将转发请求体，并尽量保持原始 `Content-Type`
- 代理请求会设置常见浏览器请求头（如 `User-Agent`、`Accept`、`Accept-Language` 与部分 Client Hints），降低目标站因请求头过少而返回 `400` 的概率

### 响应处理

- 尽量透传目标站响应状态码与 `Content-Type`
- 当响应内容为 HTML 时，会对页面内常见资源引用做重写（`href`、`src`、`action`、CSS 的 `url()` 等），使后续资源继续通过代理加载
- 会注入 `<base href="目标站 origin/">`，便于相对路径解析

## 功能说明

| 功能 | 说明 |
|------|------|
| GET/POST 代理 | 支持 GET 与 POST，转发请求体与 Content-Type |
| HTML 重写 | 对 HTML 中的 href、src、action、url() 等重写为代理 URL |
| base 注入 | 注入 `<base href="目标站 origin/">` 便于相对路径解析 |
| CSP 修正 | 将 body 中的 CSP meta 移至 head，消除控制台警告 |
| data: 过滤 | 拒绝含 data:、javascript: 的 URL，避免无效代理 |

## URL 限制

- 仅允许 `http://`、`https://` 协议
- 拒绝 `data:`、`javascript:` 等非 HTTP(S)  scheme
- 支持多次编码的 URL 自动解码

## 请求头

代理请求会附带常见浏览器头，包括 User-Agent、Accept、Accept-Language 及 Sec-CH-UA 等 Client Hints，以降低目标站返回 400 的概率。

## 状态码与错误

- `200`：代理成功返回
- `400`：参数错误（缺少 `url`、URL 不合法或协议不被允许）
- `502`：目标站请求失败（网络错误、超时、目标站拒绝连接等）

## 使用示例

### 示例 1：GET 代理

```text
/system/service/BrowserProxy.php?url=https%3A%2F%2Fexample.com%2F
```

### 示例 2：POST 代理（转发表单/JSON）

```text
POST /system/service/BrowserProxy.php?url=https%3A%2F%2Fexample.com%2Fapi%2Flogin
Content-Type: application/json

{"username":"demo","password":"demo"}
```

## 与浏览器的配合

1. **主框架导航**：浏览器通过 x-frame-bypass 或直接 `iframe.src` 使用代理 URL 加载页面
2. **资源重写**：代理返回的 HTML 中，静态资源链接已被重写为代理 URL
3. **链接拦截**：浏览器仅拦截会“离开当前视图”的链接（target=_blank/_top/_parent、Ctrl+点击、中键）

## 安全注意事项

- BrowserProxy 本质是“通用网页代理”，在不受控部署下可能被滥用为开放代理或触发 SSRF 风险。上线环境建议限制其可访问目标（域名白名单/网段限制）、增加鉴权与审计日志，并对请求频率做限制。
- 若允许访问内网地址，需额外防护对 `localhost`、`127.0.0.1`、私有网段与云元数据地址的请求。

## SystemInformation API

```javascript
SystemInformation.getBrowserProxyPath()  // 代理路径，如 '/system/service/BrowserProxy.php'
SystemInformation.getBrowserProxyUrl()   // 代理完整 URL
SystemInformation.SERVICE_NAMES.BROWSER_PROXY  // 'BrowserProxy'
```

## 相关文档

- [SystemInformation API](../API/SystemInformation.md) - 服务路径与 URL 构建
- [服务模块编写](../SERVER/ServiceModule.md) - D/server 服务约定
