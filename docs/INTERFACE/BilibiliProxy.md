# BilibiliProxy

`BilibiliProxy.php` 是 ZerOS Bilibili 原生客户端使用的后端代理服务，用于绕过浏览器 CORS 与受限请求头问题。接口只代理白名单内的 Bilibili API，不接受任意 URL。

## 基本信息

- 路径：`/system/service/BilibiliProxy.php`
- 方法：`GET`
- 返回：`application/json`
- 成功格式：`{ "status": "success", "data": ... }`
- 失败格式：`{ "status": "error", "message": "..." }`

## 公共参数

| 参数 | 说明 |
|------|------|
| `action` | 要调用的白名单动作 |

## Actions

| action | 参数 | 说明 |
|--------|------|------|
| `view` | `bvid` 或 `aid` | 获取视频详情 |
| `search` | `keyword`, `page?`, `pageSize?` | 搜索视频 |
| `popular` | `page?`, `pageSize?` | 热门视频 |
| `weekly` | `number?` | 每周必看 |
| `precious` | `page?`, `pageSize?` | 入站必刷 |
| `movieRanking` | 无 | 影视热播榜 |
| `userVideos` | `uid`, `page?`, `pageSize?` | UP 主最近投稿 |
| `liveStatus` | `uid` | UP 主直播状态 |
| `tags` | `bvid` 或 `aid` | 视频标签 |
| `comments` | `aid` | 视频评论 |
| `danmaku` | `cid` | 弹幕 XML，返回在 `data.raw_xml` |

## 示例

```text
/system/service/BilibiliProxy.php?action=search&keyword=ZerOS&pageSize=12
```

```json
{
  "status": "success",
  "data": {
    "code": 0,
    "data": {}
  }
}
```

## 说明

- 代理内部使用 Bilibili Referer、Origin 和浏览器 User-Agent 请求头。
- 本接口不需要 `upid`，不读写用户磁盘数据。
- 原生客户端路径：`D:/application/bilibili/bilibili.js`。
