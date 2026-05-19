# RandomSecurity API 文档

## 概述

`RandomSecurity` 是 ZerOS 内核的安全模块，负责生成和管理 JWT（JSON Web Token）鉴权。系统支持两种 JWT 类型：

- **SystemToken**：系统级 JWT，在引导阶段生成，供内核模块和 DISK/D/server/ 服务使用
- **UserToken**：用户级 JWT，在用户登录成功后生成，包含 `userLevel` 和 `permissions`（当前用户可授权的权限列表）

## 依赖

- `KernelLogger` - 内核日志系统
- 后端服务：`randomSecurity.php` - JWT 签发

## 获取实例

RandomSecurity 注册在 window 中，可以通过以下方式获取：

```javascript
// 从 window 获取
const RandomSecurity = window.RandomSecurity || globalThis.RandomSecurity;
```

**注意**：RandomSecurity 在系统引导阶段加载，可以在任何时候使用。

## JWT 注入规则（NetworkManager 拦截器）

网络管理器根据请求**调用来源**自动注入对应 JWT，严格遵守，无后备方案：

| 调用来源 | 注入 JWT |
|----------|----------|
| **DISK/ 之外**（kernel/、bootloader/、system/ui/ 等） | 自动注入 System JWT |
| **DISK/D/server/**（系统盘 D 的 server 子目录） | 自动注入 System JWT |
| **其余**（DISK/D/application/、DISK/C/ 等） | 自动注入 User JWT |

应用无需手动在请求头中传递 JWT，拦截器会自动根据调用栈判断并注入。

## API 方法

### System JWT

#### `getSystemJWT()`

获取系统级 JWT。仅系统模块可调用（非 DISK/application 来源，DISK/server 允许）。

**返回值**: `string | null` - 系统 JWT 或 `null`（获取失败或调用来源非法时）

**示例**:
```javascript
if (typeof RandomSecurity !== 'undefined') {
    const jwt = RandomSecurity.getSystemJWT();
    if (jwt) {
        // 使用 System JWT
    }
}
```

### User JWT

#### `generateUserToken(username, password?)`

用户登录成功后生成 UserToken JWT。`type` 固定为 `UserToken`；**`userLevel` 与 `permissions` 由后端 `randomSecurity.php` 根据 `LocalSData.json` 与密码生成**（CVS-ZEROS-017），请求体不再信任客户端声明的等级与权限列表。

**参数**:
- `username` (string): 已通过 `UserControl.login` 验证的用户名
- `password` (string | null | undefined, 可选): 本次登录使用的明文密码；无密码用户可省略

**返回值**: `Promise<string | null>` - JWT Token 或 `null`

**示例**:
```javascript
await RandomSecurity.generateUserToken('root', plainPassword);
// 无密码用户
await RandomSecurity.generateUserToken('GuestUser', null);
```

#### `getUserJWT()`

获取用户级 JWT。仅系统模块可调用（NetworkManager 代表 application 调用时放行）。

**返回值**: `string | null` - 用户 JWT 或 `null`

#### `clearUserToken()`

清除用户 JWT（登出时调用）。

**示例**:
```javascript
RandomSecurity.clearUserToken();
```

## 后端 JWT 校验

后端接口通过 `jwtVerify.php` 的 `requireJWTVerify()` 进行鉴权：

- **SystemToken**：直接放行
- **UserToken**：根据配置放行或拒绝（调试时可临时禁止）；**必须**在 GET 参数中携带 `upid`（用户进程 ID），否则拒绝
- **无 Token 或 Token 无效**：返回 401

**upid 传递**：应用和 bin 程序（如 zominstall、zompkg、vim）在 `__init__` 中保存 `this._upid = initArgs.upid`，构建 FSDirve、CompressionDirve、DISKMANAGER 等后端 URL 时使用 `buildServiceUrlObject(serviceName, { upid: this._upid })` 或在 `new URL(...)` 后添加 `url.searchParams.set('upid', this._upid)`。详见 [SystemInformation.md](./SystemInformation.md)。

### JWT 载荷结构

**SystemToken**:
```json
{
  "randomValue": "...",
  "type": "SystemToken",
  "generated_at": 1234567890
}
```

**UserToken**:
```json
{
  "randomValue": "...",
  "type": "UserToken",
  "userLevel": "ADMIN",
  "permissions": ["KERNEL_DISK_READ", "NETWORK_ACCESS", "GUI_WINDOW_CREATE", ...],
  "generated_at": 1234567890
}
```

## 安全文件

JWT 记录保存在 `system/service/DISK/D/BootSecurityToken.json`：

- **SystemToken**：系统启动时生成，写入时清空已有记录
- **UserToken**：登录时生成，写入时清除已有 UserToken 记录，保证注销再次登录时 JWT 一致
- **action=clear**：清空所有 JWT 记录（如关机/重启）

UserToken 记录包含 `userLevel`、`permissions`，生命周期与 JWT 一致。

## 注意事项

1. **调用来源限制**：`getSystemJWT()` 和 `getUserJWT()` 仅允许系统模块调用，DISK/application 直接调用会返回 `null`
2. **单用户会话**：每次登录覆盖旧 UserToken，安全文件中始终只有一个 UserToken
3. **后端鉴权**：需要鉴权的 PHP 接口需在入口处调用 `requireJWTVerify()`
4. **CORS**：`.htaccess` 需允许 `Authorization`、`X-Auth-Token`、`X-JWT` 请求头；Apache 需通过 `SetEnvIf` 传递 `Authorization`

## 相关文档

- [NetworkManager.md](./NetworkManager.md) - 网络管理器（JWT 自动注入）
- [UserControl.md](./UserControl.md) - 用户控制系统（userLevel、getGrantablePermissions）
- [LockScreen.md](./LockScreen.md) - 锁屏界面（登录时生成 UserToken）
- [PermissionManager.md](./PermissionManager.md) - 权限管理
