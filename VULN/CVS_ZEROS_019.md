# CVS-ZEROS-019: 多个开放代理接口缺少目标限制导致 SSRF

**漏洞编号**: CVS-ZEROS-019  
**发现日期**: 2026-05-04  
**修复日期**: 待修复  
**严重程度**: 高 (CVSS 8.8)  
**CWE分类**: CWE-918 (服务端请求伪造), CWE-295 (证书验证不当)  
**状态**: 待修复

---

## 漏洞概述

ZerOS 存在多个用于绕过 CORS 或防盗链的 PHP 代理接口，允许客户端传入任意 `http(s)` URL 并由服务端使用 cURL 请求。相关接口缺少 JWT 鉴权、目标域名白名单、私网地址过滤、重定向后地址校验，并且多处关闭 TLS 证书校验。攻击者可借助这些接口让 ZerOS 后端访问本机、局域网或云元数据服务，形成 SSRF。

## 漏洞描述

### 受影响接口

| 文件 | 风险点 |
|------|--------|
| `system/service/BrowserProxy.php` | 任意 http(s) 代理、跟随重定向、关闭 TLS 校验 |
| `system/service/DISK/D/application/browser/proxy.php` | 转发到 `BrowserProxy.php`，扩大同目录 Service Worker 管控面 |
| `system/service/video-proxy.php` | 任意视频 URL 代理、跟随重定向、关闭 TLS 校验 |
| `system/service/audio-proxy.php` | 任意音频 URL 代理、跟随重定向、关闭 TLS 校验 |
| `system/service/ImageProxy.php` | 仅限制 https，但无内网 IP 禁止且关闭 TLS 校验 |

### 攻击场景

1. 攻击者请求 `video-proxy.php?url=http://127.0.0.1:8089/system/service/JWT.php` 或局域网管理后台地址。
2. 后端 cURL 代表服务器发起请求，响应内容经代理返回给攻击者。
3. 若目标为云环境，可尝试访问 `http://169.254.169.254/` 等元数据地址。
4. 若目标通过重定向跳转到内网地址，当前逻辑不会重新校验最终落点。

### 根本原因

- 代理接口被设计为通用转发器，却没有可信调用方校验。
- 仅校验 URL scheme，不校验解析后的 IP 地址范围。
- `CURLOPT_FOLLOWLOCATION` 开启后未检查重定向链和最终地址。
- `CURLOPT_SSL_VERIFYPEER` 与 `CURLOPT_SSL_VERIFYHOST` 被关闭，可能被中间人劫持或投喂伪造内容。

---

## 技术细节

### 相关代码

```php
// BrowserProxy.php
$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
```

```php
// video-proxy.php
curl_setopt($ch, CURLOPT_URL, $videoUrl);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
```

## 影响评估

- **内网探测**: 可探测本机与局域网服务端口和 HTTP 响应。
- **敏感信息读取**: 可读取未鉴权内网接口、开发服务、云元数据。
- **同源内容投放**: `BrowserProxy.php` 会以 ZerOS 同源返回外部 HTML/JS，增加 XSS 与凭据混淆风险。
- **出站流量滥用**: 可将 ZerOS 后端作为匿名请求跳板。

### CVSS 3.1 评分建议

- **AV**: Network (N)
- **AC**: Low (L)
- **PR**: None (N)
- **UI**: None (N)
- **S**: Unchanged (U)
- **C**: High (H)
- **I**: Low (L)
- **A**: Low (L)
- **向量**: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:L -> **8.8（高）**

---

## 修复建议

1. 对所有代理接口添加 JWT 鉴权，并按应用场景限制可调用程序。
2. 引入目标 allowlist；浏览器代理、音视频代理应分别限定业务需要的域名。
3. 解析域名后拒绝私网、回环、链路本地、组播、保留地址和云元数据地址；IPv4/IPv6 均需覆盖。
4. 对每次重定向后的最终 URL 重新执行 scheme、host、IP 范围校验。
5. 开启 TLS 证书校验，移除 `CURLOPT_SSL_VERIFYPEER=false` 与 `CURLOPT_SSL_VERIFYHOST=false`。
6. 设置响应大小、超时、Content-Type 与下载类型限制，避免内存消耗和任意内容投放。

---

## 相关文件

- `system/service/BrowserProxy.php`
- `system/service/DISK/D/application/browser/proxy.php`
- `system/service/video-proxy.php`
- `system/service/audio-proxy.php`
- `system/service/ImageProxy.php`

---

**修复状态**: 待修复
