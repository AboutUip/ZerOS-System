# 音频代理服务（audio-proxy）

## 概述

`audio-proxy.php` 用于代理外部音频请求，规避 CORS 限制。支持 HTTP Range 请求，适用于音频流式播放。增强了对网易云音乐等平台的反盗链措施的绕过能力。

- **类型**：PHP 后端服务
- **位置**：`system/service/audio-proxy.php`
- **调用方**：sparkai、音乐播放器等需要加载外部音频的应用

## 访问方式

```
GET /system/service/audio-proxy.php?url=<目标音频URL>
```

## 参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| url | string | 是 | 目标音频 URL，支持 http/https，需 URL 编码 |

## 请求限制

- 仅支持 GET
- 支持 `Range` 请求头（用于断点续传、流式播放）

## 支持格式

根据扩展名设置 Content-Type：wav、mp3、ogg、m4a、aac、flac、webm、opus。

## 反盗链增强

音频代理服务增强了以下特性以更好地绕过反盗链措施：

- **浏览器模拟**：添加了更完整的浏览器like头信息，包括 User-Agent、Accept、Accept-Language 等
- **Referer 模拟**：为不同平台设置合适的 Referer 头
- **Origin 头**：特别为网易云音乐请求添加了 Origin 头
- **Cache 控制**：合理设置缓存头以提高性能

## 错误码

| HTTP | 说明 |
|------|------|
| 200 | 成功，返回音频流 |
| 400 | 缺少 url、URL 无效或协议不允许 |
| 405 | 非 GET 请求 |
| 500 | cURL 不可用 |
| 502 | 转发失败 |

## 使用示例

```text
/system/service/audio-proxy.php?url=https%3A%2F%2Fexample.com%2Faudio.mp3
```

使用 SystemInformation 构建 URL：

```javascript
const url = SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.AUDIO_PROXY);
url.searchParams.set('url', encodeURIComponent('https://example.com/audio.mp3'));
const response = await fetch(url.toString());
```

## 相关文档

- [ImageProxy](./ImageProxy.md) - 图片代理
- [SystemInformation API](../API/SystemInformation.md)
