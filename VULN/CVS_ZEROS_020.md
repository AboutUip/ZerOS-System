# CVS-ZEROS-020: NetworkDirve 未接入服务级权限映射导致网络能力越权

**漏洞编号**: CVS-ZEROS-020  
**发现日期**: 2026-05-04  
**修复日期**: 待修复  
**严重程度**: 高 (CVSS 8.1)  
**CWE分类**: CWE-862 (缺少授权), CWE-863 (授权不正确)  
**状态**: 待修复

---

## 漏洞概述

`system/service/networkDirve.php` 是 ZerOS 网络驱动后端，支持注册监听端口、发送 TCP 数据、列出端口状态等高风险能力。该接口只调用 `requireJWTVerify()`，没有传入服务名，因此 `jwtVerify.php` 不会执行 action 到权限的映射校验。任意持有合法或伪造 UserToken 且能提供 upid 的请求，都可调用网络驱动的高风险操作。

## 漏洞描述

### 可越权调用的能力

- `register`: 在 `0.0.0.0` 注册端口监听，并通知守护进程。
- `unregister`: 取消任意已注册端口。
- `check`: 读取连接队列与接收数据。
- `status`: 获取端口连接状态。
- `send`: 向指定 host/port 发送数据。
- `list`: 枚举已注册端口。

### 攻击链

1. 攻击者获得任意 UserToken，或结合 CVS-ZEROS-017 伪造 UserToken。
2. 请求 `networkDirve.php?action=send&host=127.0.0.1&port=...&data=...&upid=...`。
3. 后端仅验证 JWT 有效和 upid 非空，不校验该 upid 是否声明网络权限。
4. 攻击者可探测本机/内网端口、向内网服务发送数据，或干扰其他程序已注册的网络端口。

### 根本原因

- `networkDirve.php` 调用 `requireJWTVerify()` 时未传入服务名。
- `jwtVerifyGetActionPermissionMap()` 没有定义 `NetworkDirve` 的 action 权限映射。
- 网络能力属于高风险系统资源，但没有对应的最小权限授权模型。

---

## 技术细节

### 漏洞位置

```php
// networkDirve.php
require_once __DIR__ . '/jwtVerify.php';
requireJWTVerify();
```

对比 FSDirve：

```php
// FSDirve.php
require_once __DIR__ . '/jwtVerify.php';
requireJWTVerify('FSDirve');
```

`requireJWTVerify($serviceName)` 仅在 `$serviceName` 非空时调用 `jwtVerifyCheckUpidPermission()`：

```php
if ($serviceName !== null && $serviceName !== '') {
    jwtVerifyCheckUpidPermission($serviceName, $upid, $payload);
}
```

## 影响评估

- **内网探测**: `send` 可作为简易 TCP 探测器连接本机或局域网服务。
- **网络能力越权**: 未声明网络权限的程序也可注册、取消、检查端口。
- **服务干扰**: 可取消其他程序端口注册或清空数据队列，影响可用性。
- **与 SSRF 组合**: 与开放代理漏洞组合后，可扩大本机与内网攻击面。

### CVSS 3.1 评分建议

- **AV**: Network (N)
- **AC**: Low (L)
- **PR**: Low (L)
- **UI**: None (N)
- **S**: Changed (C)
- **C**: High (H)
- **I**: High (H)
- **A**: Low (L)
- **向量**: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:L -> **8.1（高）**

---

## 修复建议

1. 在 `jwtVerifyGetActionPermissionMap()` 中新增 `NetworkDirve` 映射，例如：
   - `register` -> `KERNEL_NETWORK_LISTEN`
   - `unregister` -> `KERNEL_NETWORK_MANAGE`
   - `check` / `status` / `list` -> `KERNEL_NETWORK_READ`
   - `send` -> `KERNEL_NETWORK_SEND`
2. 将 `networkDirve.php` 改为 `requireJWTVerify('NetworkDirve')`。
3. 限制 `send` 的目标 host，默认禁止私网/回环以外的场景按业务显式授权；或反过来仅允许 127.0.0.1，依据产品定位选择。
4. 端口注册与取消应绑定创建者 upid，禁止程序操作其他 upid 创建的端口。
5. 对 `programName`、`data`、队列大小和连接频率增加限制，避免资源滥用。

---

## 相关文件

- `system/service/networkDirve.php`
- `system/service/jwtVerify.php`
- `kernel/drive/networkManager.js`

---

**修复状态**: 待修复
