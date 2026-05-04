# CVS-ZEROS-021: RandomSecurity commit_for_system 无认证导致 SystemToken 仍可被未认证获取

**漏洞编号**: CVS-ZEROS-021  
**发现日期**: 2026-05-04  
**修复日期**: 待修复  
**严重程度**: 严重 (CVSS 9.8)  
**CWE分类**: CWE-306 (缺少身份验证), CWE-284 (不恰当的访问控制), CWE-287 (身份验证不当)  
**状态**: 待修复

---

## 漏洞概述

`CVS-ZEROS-016` 为阻止单请求直接签发 `SystemToken`，在 `randomSecurity.php` 中增加了 `action=commit_for_system` 预提交流程。但该预提交接口本身没有认证、没有引导态密钥、没有一次性服务端 secret，攻击者可以先提交任意 `randomValue`，再用同一个 `randomValue` 请求 `type=SystemToken`，仍能获得系统级 JWT。

该问题等价于 `CVS-ZEROS-016` 的修复不完整：直接单请求变为两步请求，但安全边界仍由攻击者完全控制。

## 漏洞描述

### 攻击链

1. 攻击者生成任意 32 位十六进制字符串，例如 `0123456789abcdef0123456789abcdef`。
2. 请求 `randomSecurity.php`，提交：
   - `action=commit_for_system`
   - `randomValue=<攻击者生成值>`
3. 后端仅按 `REMOTE_ADDR` 存储该提交，不要求 JWT 或引导态证明。
4. 攻击者再次请求 `randomSecurity.php`，提交：
   - `type=SystemToken`
   - `randomValue=<同一值>`
5. 后端发现同 IP、同 randomValue、未过期提交后签发 `SystemToken`。
6. 攻击者携带该 token 调用 `requireSystemTokenOnly()` 保护的接口，或绕过 `UserToken` 权限体系。

### 根本原因

- `commit_for_system` 将“能提交 randomValue”误当作“处于可信引导流程”。
- 提交流程只绑定 IP 和短 TTL，没有绑定服务端生成的秘密、浏览器引导上下文或已存在的可信状态。
- SystemToken 签发仍由客户端提供的 `randomValue` 和 `type` 驱动。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `system/service/randomSecurity.php` | `action=commit_for_system` 无认证写入提交记录 |
| `system/service/randomSecurity.php` | `type=SystemToken` 仅检查同 IP 未消费提交 |
| `system/service/jwtVerify.php` | `SystemToken` 在受保护接口中直接放行 |

### 相关代码

```php
// randomSecurity.php - 任意客户端均可提交
if ($action === 'commit_for_system') {
    $commitRv = $inputData['randomValue'] ?? null;
    // 仅校验格式与 IP
    $commits[$commitRv] = ['ip' => $clientIp, 'created_at' => $now];
    file_put_contents(BOOT_COMMIT_FILE, json_encode(['commits' => $commits]), LOCK_EX);
    sendResponse(true, '已提交，可用于本次引导签发 SystemToken', ['committed' => true]);
}
```

```php
// randomSecurity.php - 签发 SystemToken 时只检查同 IP 提交
if ($resolvedType === 'SystemToken') {
    foreach ($commits as $rv => $info) {
        if ($rv === $randomValue && ($info['ip'] ?? '') === $clientIp) {
            $found = true;
            unset($commits[$rv]);
            break;
        }
    }
    if (!$found) {
        sendResponse(false, 'SystemToken 仅允许在引导流程中签发...', null, 403);
    }
}
```

## 影响评估

- **完全提权**: 攻击者可获得 SystemToken，等价于系统最高权限。
- **后端命令/安装接口风险**: 可调用 `nodeLibExec.php`、`nodeLibInit.php` 等 SystemToken-only 接口。
- **绕过 UserToken 权限模型**: `jwtVerify.php` 对 SystemToken 直接放行，不再检查 upid 和权限映射。
- **持久化与破坏**: 可配合 FSDirve、programPermissions、D/server 服务加载等路径进行持久化或系统破坏。

### CVSS 3.1 评分建议

- **AV**: Network (N)
- **AC**: Low (L)
- **PR**: None (N)
- **UI**: None (N)
- **S**: Changed (C)
- **C/I/A**: High (H)
- **向量**: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H -> **9.8（严重）**

---

## 修复建议

1. `SystemToken` 不应由公开 HTTP 接口根据客户端参数签发；应由服务端在启动阶段生成并通过不可被应用脚本读取的通道注入内核。
2. 若必须保留提交流程，`commit_for_system` 需要服务端先生成一次性 challenge/secret，且该 secret 只能由引导 HTML/内核代码在受信上下文中获得，不能由任意请求生成。
3. 限制 `SystemToken` 签发次数、时间窗口与调用来源，并记录审计日志。
4. 删除或鉴权 `action=clear`，避免攻击者清空已有 token 状态后重新走签发流程。
5. 对所有 `requireSystemTokenOnly()` 接口增加二次防护，例如本机来源、启动态标识或服务端会话校验。

---

## 相关文件

- `system/service/randomSecurity.php`
- `system/service/jwtVerify.php`
- `system/service/nodeLibExec.php`
- `system/service/nodeLibInit.php`

---

**修复状态**: 待修复
