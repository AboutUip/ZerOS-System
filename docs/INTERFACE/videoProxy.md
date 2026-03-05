# 视频代理服务（video-proxy）

## 概述

`video-proxy.php` 用于代理外部视频请求，绕过 CORS/Referer 限制（如第三方短视频 API 返回的 CDN 链接）。支持 HTTP Range 请求，适用于视频流式播放。

- **类型**：PHP 后端服务
- **位置**：`system/service/video-proxy.php`
- **调用方**：短视频、播放器等需要加载外部视频的应用

## 访问方式

```
GET /system/service/video-proxy.php?url=<目标视频URL>
```

## 参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| url | string | 是 | 目标视频 URL，支持 http/https，需 URL 编码 |

## 请求限制

- 仅支持 GET
- 支持 `Range` 请求头（用于断点续传、拖拽进度）

## 支持格式

根据扩展名设置 Content-Type：mp4、webm、ogg、m3u8（HLS）。默认回退为 `video/mp4`。

## 错误码

| HTTP | 说明 |
|------|------|
| 200 | 成功，返回视频流 |
| 400 | 缺少 url、URL 无效、或协议非 http/https |
| 405 | 非 GET 请求 |
| 500 | cURL 不可用或初始化失败 |
| 502 | 转发失败（上游不可达等） |
| 4xx | 上游返回错误时原样透传 |

## 使用示例

```text
/system/service/video-proxy.php?url=https%3A%2F%2Fexample.com%2Fvideo.mp4
```

使用 SystemInformation 构建 URL：

```javascript
const url = SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.VIDEO_PROXY);
url.searchParams.set('url', encodeURIComponent('https://example.com/video.mp4'));
const response = await fetch(url.toString());
```

## 相关文档

- [audioProxy](./audioProxy.md) - 音频代理
- [ImageProxy](./ImageProxy.md) - 图片代理
- [SystemInformation API](../API/SystemInformation.md)
