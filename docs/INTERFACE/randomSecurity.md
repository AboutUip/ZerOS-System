# JWT 签发服务（randomSecurity）

## 概述

`randomSecurity.php` 是 ZerOS 的**后端 JWT 签发服务**，接收前端传入的随机字符串、类型、用户级别等，生成 JWT Token 并返回。与内核 `RandomSecurity` 模块配合使用。

- **类型**：PHP 后端服务
- **位置**：`system/service/randomSecurity.php`
- **调用方**：内核 RandomSecurity（引导时签发 SystemToken、登录时签发 UserToken）

## 访问方式

```
GET  /system/service/randomSecurity.php?randomValue=xxx&type=xxx&...
POST /system/service/randomSecurity.php
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
| action | string | 否 | `clear`：清空所有 JWT（关机/重启时调用） |

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

### 2. 清空 JWT（action=clear）

**请求**：GET 或 POST，`action=clear`。

**响应**：
```json
{
  "status": "success",
  "message": "JWT 已清空",
  "data": { "cleared": true }
}
```

## 相关文档

- [RandomSecurity API](../API/RandomSecurity.md) - 内核 JWT 模块
- [jwtVerify](./jwtVerify.md) - 后端 JWT 校验规范
