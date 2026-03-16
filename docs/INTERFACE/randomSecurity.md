# JWT 签发服务（randomSecurity）

## 概述

RandomSecurity 是 ZerOS 的**后端 JWT 签发服务**，接收前端传入的随机字符串、类型、用户级别等，生成 JWT Token 并返回。与内核 `RandomSecurity` 模块配合使用。**支持多后端**：本文档以 PHP 实现为准；若使用 Java 后端，路径为 `/system/service/randomSecurity`（无 `.php`），端口由 SystemInformation 的 SpringBoot 配置决定。

- **类型**：后端服务（PHP 实现：`system/service/randomSecurity.php`；Java 实现：SpringBoot `/randomSecurity`）
- **调用方**：内核 RandomSecurity（引导时签发 SystemToken、登录时签发 UserToken）
- **前端多后端**：所有请求 RandomSecurity 的 JS 优先使用 `SystemInformation.getRandomSecurityPath()` + `getOrigin()` 或 `buildServiceUrl(SERVICE_NAMES.RANDOM_SECURITY, …)`；无 SystemInformation 时**降级为默认 PHP 路径 + 当前页 origin**（与 FSDirve/LStorage 一致，**不按端口推断**）。后端类型与端口仅由 SystemInformation 配置决定。

## 访问方式

```
# PHP 后端（默认端口 8089）
GET  /system/service/randomSecurity.php?randomValue=xxx&type=xxx&...
POST /system/service/randomSecurity.php

# Java 后端（默认端口 8080，无 .php 后缀）
GET  /system/service/randomSecurity?randomValue=xxx&type=xxx&...
POST /system/service/randomSecurity

Content-Type: application/json
Body: { "randomValue": "xxx", "type": "xxx", ... }
```

## 参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| randomValue | string | 是 | 32 位十六进制字符（128 位），前端生成的随机特征符 |
| type | string | 否 | `SystemToken` / `UserToken`，未传则为 Unknown |
| userLevel | string | UserToken 时 | 用户级别（USER、ADMIN、DEFAULT_ADMIN） |
| permissions | array | UserToken 时 | 当前用户可授权的权限列表 |
| action | string | 否 | `clear`：清空所有 JWT；`commit_for_system`：提交 randomValue 用于本次引导签发 SystemToken（CVS-ZEROS-016） |

## 操作

### 1. 签发 JWT

**请求**：POST 或 GET，携带 `randomValue`（`type`、`userLevel`、`permissions` 可选）。

**响应**（成功）：
```json
{
  "status": "success",
  "message": "JWT Token 生成成功",
  "data": {
    "token": "eyJ...",
    "randomValue": "xxx",
    "expiration": 0,
    "recorded": true,
    "current_count": 1,
    "max_count": 2
  }
}
```

**限制**：
- JWT 数量上限为 2（SystemToken + UserToken）
- SystemToken 请求会清空现有 JWT 后重新签发
- UserToken 请求会覆盖已有 UserToken（单用户会话）

**SystemToken 签发约束（CVS-ZEROS-016 已修复）**：仅当该 `randomValue` 已通过 **action=commit_for_system** 在同一 IP 下提交且未消费时，才允许签发 SystemToken；否则 403。引导脚本会先调用 commit_for_system 再请求签发。

### 2. 提交 randomValue 用于 SystemToken（action=commit_for_system）

**请求**：POST，`action=commit_for_system`，Body：`{ "randomValue": "32位十六进制" }`。无需 JWT。

**响应**（成功）：
```json
{
  "status": "success",
  "message": "已提交，可用于本次引导签发 SystemToken",
  "data": { "committed": true }
}
```

**约束**：每 IP 仅允许一笔未消费的提交；提交有效 30 秒，超时 5 秒可被同 IP 新提交覆盖（便于刷新恢复）。引导流程须先调用本接口再请求签发 SystemToken。

### 3. 清空 JWT（action=clear）

**请求**：GET 或 POST，`action=clear`。

**响应**：
```json
{
  "status": "success",
  "message": "JWT 已清空",
  "data": { "cleared": true }
}
```

## 相关漏洞与修复

- **CVS-ZEROS-016**：未认证签发 SystemToken 导致提权。修复为「先 commit_for_system 再签发」；详见 `VULN/CVS_ZEROS_016.md`。

## 相关文档

- [RandomSecurity API](../API/RandomSecurity.md) - 内核 JWT 模块（含 commitRandomValueForSystem）
- [jwtVerify](./jwtVerify.md) - 后端 JWT 校验规范与 401 蓝屏
- [VULN/CVS_ZEROS_016](../../VULN/CVS_ZEROS_016.md) - 016 漏洞说明与修复
