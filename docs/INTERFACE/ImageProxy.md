# 图片代理服务（ImageProxy）

## 概述

`ImageProxy` 是 ZerOS 的**后端代理服务**，用于代理外部图片请求，避免 CORS 问题。适用于从跨域源加载图片（如壁纸、头像等）。

- **类型**：PHP 后端服务
- **位置**：`system/service/ImageProxy.php`
- **调用方**：themeanimator、需要加载外部图片的应用

## 访问方式

```
GET /system/service/ImageProxy.php?url=<目标图片URL>
```

## 参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 目标图片 URL，**仅允许 HTTPS**，需 URL 编码 |

## 请求限制

- 仅支持 `GET` 请求
- 仅允许 `https://` 协议（安全考虑）
- 响应内容必须是图片类型（JPEG、PNG、GIF、WebP 等），否则返回 400

## 响应

- 成功：返回目标站点的图片二进制流，`Content-Type` 透传
- 失败：返回 JSON 格式错误信息

## 错误码

| HTTP 状态 | 说明 |
|-----------|------|
| 200 | 代理成功，返回图片 |
| 400 | 缺少 `url`、URL 格式无效、非 HTTPS、或响应不是图片 |
| 500 | cURL 不可用或内部错误 |

## 使用示例

```text
/system/service/ImageProxy.php?url=https%3A%2F%2Fapi.example.com%2Fimages%2Fwallpaper.jpg
```

使用 `SystemInformation` 构建 URL：

```javascript
const proxyUrl = SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.IMAGE_PROXY);
proxyUrl.searchParams.set('url', encodeURIComponent('https://example.com/image.png'));
const response = await fetch(proxyUrl.toString());
```

## 相关文档

- [SystemInformation API](../API/SystemInformation.md) - 服务 URL 构建
- [BrowserProxy](./BrowserProxy.md) - 浏览器网页代理
