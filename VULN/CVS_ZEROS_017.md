# CVS-ZEROS-017: RandomSecurity 信任客户端声明 UserToken 权限导致权限伪造

**漏洞编号**: CVS-ZEROS-017  
**发现日期**: 2026-05-04  
**修复日期**: 2026-05-06  
**严重程度**: 严重 (CVSS 9.8)  
**CWE分类**: CWE-287 (身份验证不当), CWE-284 (不恰当的访问控制), CWE-863 (授权不正确)  
**状态**: 已修复

---

## 漏洞概述

`system/service/randomSecurity.php` 在签发 `UserToken` 时信任客户端传入的 `userLevel` 和 `permissions` 字段，并生成永不过期 JWT。攻击者可以直接构造请求签发带 `DEFAULT_ADMIN` 或任意权限列表的 `UserToken`。同时 `system/service/programPermissions.php` 仅调用 `requireJWTVerify()`，没有传入服务名进行 action 到权限映射校验，持有伪造 `UserToken` 的请求可注册任意程序权限，进而调用 `FSDirve.php` 等受保护接口。

---

## 修复说明（2026-05-06）

1. **`randomSecurity.php`（PHP）**  
   - 签发 **UserToken** 时**不再**采用请求中的 `userLevel` / `permissions`。  
   - **必须 POST JSON**，且含 `username`；`password` 按用户是否有密码校验（与 `UserControl.login` 一致，密码为 **MD5(明文)** 与 `LocalSData.json` 中 `system["userControl.users"]` 比对）。  
   - `userLevel` 取自存储中的 `level`；`permissions` 由服务端按 `UserControl.getGrantablePermissions` 语义生成（与 `jwtVerify` 高风险列表一致）。  
   - **`type` 为 UserToken 时大小写不敏感**（`strcasecmp`），均走同一认证分支，避免变体类型绕过。  
   - UserToken **仍不设 `exp`**（与产品要求一致）。

2. **`programPermissions.php`（PHP）**  
   - 改为 **`requireSystemTokenOnly()`**，禁止用 UserToken 写入 `programPermissionsMap`（与内核 `NetworkManager` 对 `/system/service/` 注入 SystemToken 的路径一致）。

3. **前端对齐**  
   - `kernel/core/safemode/randomSecurity.js`：`generateUserToken(username, password)`。  
   - `system/ui/lockscreen.js`：登录成功后传入 `LockScreen.currentUser` 与密码。

4. **残余风险（非本编号范围）**  
   - **`jwtVerify.php`** 在其它接口上「服务名为空仍跳过映射」的行为未在本条一并改造；**021**（SystemToken 两步绕过）若存在，攻击者仍可能持 SystemToken 调用已放行接口。  
   - **Python/Java 等其它后端**若仍按旧协议签发 UserToken，部署到这些端口时仍存在同类风险，需单独对齐实现。

---

## 漏洞描述（历史）

### 攻击链

1. 攻击者向 `randomSecurity.php` 提交任意 32 位十六进制 `randomValue`，并指定 `type=UserToken`、`userLevel=DEFAULT_ADMIN`、`permissions=["KERNEL_DISK_READ","KERNEL_DISK_WRITE","KERNEL_DISK_DELETE", ...]`。
2. 后端将这些客户端字段原样写入 JWT payload，并返回 `data.token`。
3. 攻击者携带该 token 请求 `programPermissions.php?action=register&upid=<任意值>`，由于该接口未传服务名，`requireJWTVerify()` 只检查 UserToken 是否携带 `upid`，不会校验 `programPermissions` 的具体权限。
4. 攻击者获得新注册的 upid 后，即可用该 upid 调用 `FSDirve.php` 等已接入权限映射的服务，满足 `programPermissionsMap` 与用户可授权权限的双重校验。

### 根本原因

- `randomSecurity.php` 将用户身份等级与可授权权限交给客户端声明，缺少服务端可信用户会话校验。
- `JWT.php` 默认生成的 token 可设置为永不过期，扩大令牌泄露和伪造后的影响窗口。
- `programPermissions.php` 使用 `requireJWTVerify()` 而非更严格的服务级权限检查或 SystemToken-only 策略。

---

## 技术细节（历史）

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `system/service/randomSecurity.php` | 从 GET/POST 读取 `userLevel`、`permissions` 并写入 UserToken |
| `system/service/programPermissions.php` | `requireJWTVerify()` 未传服务名，UserToken 只需提供 upid |
| `system/service/jwtVerify.php` | 服务名为空时跳过 action 到权限映射校验 |
| `system/service/JWT.php` | 默认密钥硬编码，且支持永不过期 token |

---

## 影响评估

- **权限伪造**: 未认证或低权限攻击者可伪造管理员级 UserToken。
- **程序提权**: 可注册任意 `programPermissionsMap` 权限，绕过正常授权流程。
- **文件系统控制**: 与 FSDirve 权限映射组合后，可获得虚拟磁盘读写、删除、复制、移动等能力。
- **持久化风险**: token 永不过期，且权限映射写入 `BootSecurityToken.json`。

### CVSS 3.1 评分建议

- **AV**: Network (N)
- **AC**: Low (L)
- **PR**: None (N)
- **UI**: None (N)
- **S**: Changed (C)
- **C/I/A**: High (H)
- **向量**: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H -> **9.8（严重）**

---

## 修复建议（历史记录；已实现项见上文「修复说明」）

1. `randomSecurity.php` 不应接收客户端声明的 `userLevel`、`permissions`；应由服务端根据已认证用户会话、登录结果或可信用户数据库生成。
2. `UserToken` 应设置较短有效期，并支持撤销/刷新；避免默认永不过期。（**产品决策**：当前版本仍保留永不过期 UserToken。）
3. `programPermissions.php` 应改为 SystemToken-only，或新增独立服务权限映射并要求当前用户、程序、授权记录三方一致。
4. `jwtVerify.php` 对未知服务名或空服务名不应静默跳过高风险 action 的权限校验。
5. `JWT.php` 默认密钥应迁移到部署配置，并要求生产环境强制覆盖。

---

## 相关文件

- `system/service/randomSecurity.php`
- `system/service/programPermissions.php`
- `system/service/jwtVerify.php`
- `system/service/JWT.php`
- `kernel/core/safemode/randomSecurity.js`
- `system/ui/lockscreen.js`

---

**修复状态**: 已修复
