# JWT 校验规范（jwtVerify）

## 概述

`jwtVerify.php` 是 ZerOS 后端的 **JWT 校验模块**，供需要鉴权的 PHP 接口引用。不是独立的 HTTP 服务，而是通过 `requireJWTVerify()` 在被保护接口入口处调用。

- **类型**：PHP 库模块
- **位置**：`system/service/jwtVerify.php`
- **使用方**：FSDirve.php、CompressionDirve.php、DISKMANAGER.php 等

## 鉴权规则

| Token 类型 | 行为 |
|------------|------|
| **SystemToken** | 直接放行 |
| **UserToken** | 必须在 GET 参数中携带 `upid`，否则 401；**且** 会根据 action 校验程序权限与用户授权能力 |
| 无 Token / 无效 | 返回 401 |

### UserToken + upid 时的权限校验流程

当请求携带 UserToken 且 URL 中有 `upid` 时，会执行以下校验：

1. **分析请求意图**：从 `$_GET['action']` 解析本次操作（不读取 POST body，避免消耗 `php://input` 导致后续无法获取文件内容）
2. **映射到所需权限**：根据服务名与 action 映射到所需权限（如 `read_file` → `KERNEL_DISK_READ`）
3. **程序权限检查**：从 `BootSecurityToken.json` 的 `programPermissionsMap[upid]` 读取该 upid 对应的**已授予权限**（由前端 register/update 同步，与 PermissionManager 一致）
   - 若 upid 未注册或已失效 → 拒绝
   - 若该 upid 的权限列表中不包含本次所需权限 → 拒绝
4. **用户授权检查**：检查当前用户是否有权授予该权限
   - ADMIN / DEFAULT_ADMIN：可授予所有权限
   - USER：不能授予高风险权限（如 `PROCESS_MANAGE`、`CRYPT_*` 等）；可授予的权限需在 UserToken 的 `permissions` 列表中

## 调用方式

```php
<?php
require_once __DIR__ . '/jwtVerify.php';

// 在业务逻辑前调用
// 传入服务名时，对 UserToken+upid 执行 action→权限 校验
requireJWTVerify('FSDirve');      // FSDirve、CompressionDirve、DISKMANAGER
requireJWTVerify();               // 不传服务名时仅校验 Token 和 upid 存在，不做权限映射校验

// 仅允许 SystemToken（UserToken 一律 401），用于 nodeLibExec 等仅内核可调用的接口
requireSystemTokenOnly();

// 通过后继续处理请求
// ...
```

## Token 提取

支持以下请求头（任一即可）：
- `Authorization: Bearer <token>`
- `X-Auth-Token: <token>`
- `X-JWT: <token>`

## upid 提取

- **来源**：仅从 `$_GET['upid']` 读取
- **UserToken 必须**：应用/bin 程序调用时，URL 必须包含 `?upid=xxx`

## 401 与内核行为

当后端对某请求返回 **HTTP 401** 时，若该请求**携带了 JWT**（SystemToken 或 UserToken，由内核 NetworkManager 注入或请求自带），内核会将其视为「身份被服务器拒绝」的严重安全事件，并**触发系统级异常（蓝屏）**：停止所有程序、显示蓝屏、自检后自动重启。同一会话内只触发一次。详见 [NetworkManager API](../API/NetworkManager.md)（401 响应处理）。因此后端仅在「未认证/令牌无效」等情况下返回 401；**403** 表示「已认证但无权限」，不会触发蓝屏。

## 401 响应格式

**缺少/无效 Token**：
```json
{
  "status": "error",
  "message": "缺少或无效的 JWT 鉴权",
  "timestamp": "...",
  "timestamp_unix": ...
}
```

**UserToken 未传 upid**：
```json
{
  "status": "error",
  "message": "UserToken 需在 URL 中传入 upid 参数",
  "timestamp": "...",
  "timestamp_unix": ...
}
```

**程序未声明所需权限**（upid 存在时）：
```json
{
  "status": "error",
  "message": "程序未声明该操作所需的权限: KERNEL_DISK_READ",
  "timestamp": "...",
  "timestamp_unix": ...
}
```

**当前用户无法授权该权限**（如普通用户尝试授予高风险权限）：
```json
{
  "status": "error",
  "message": "当前用户无法授权该权限: PROCESS_MANAGE",
  "timestamp": "...",
  "timestamp_unix": ...
}
```

**upid 未注册或已失效**：
```json
{
  "status": "error",
  "message": "upid 未在程序权限映射中注册或已失效",
  "timestamp": "...",
  "timestamp_unix": ...
}
```

## 排除接口

以下接口**不**使用 jwtVerify（由实现排除）：
- randomSecurity.php、JWT_example.php
- *proxy*.php（BrowserProxy、ImageProxy 等）

## 相关文档

- [randomSecurity](./randomSecurity.md) - JWT 签发服务
- [RandomSecurity API](../API/RandomSecurity.md) - 内核 JWT 与 upid 传递
- [NetworkManager API](../API/NetworkManager.md) - 内核请求拦截与 401 触发系统异常
- [FSDirve](./FSDirve.md) - 使用本校验的文件服务
- [nodeLibExec](./nodeLibExec.md) - 使用 requireSystemTokenOnly 的 Node 扩展执行接口
