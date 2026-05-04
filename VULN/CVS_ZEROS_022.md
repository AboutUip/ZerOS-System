# CVS-ZEROS-022: D/server 服务脚本可写入并自动加载导致持久化提权

**漏洞编号**: CVS-ZEROS-022  
**发现日期**: 2026-05-04  
**修复日期**: 待修复  
**严重程度**: 严重 (CVSS 9.0)  
**CWE分类**: CWE-732 (关键资源权限过宽), CWE-284 (不恰当的访问控制), CWE-94 (代码注入)  
**状态**: 待修复

---

## 漏洞概述

`ServerExpansion` 会在系统初始化后自动扫描并加载 `D:/server/server-*.js`。服务脚本通过 `<script>` 标签直接执行，加载阶段虽不调用 `__init__` / `__start__`，但脚本顶层代码已经运行。与此同时，`KERNEL_DISK_WRITE` 只是特殊权限，普通用户可通过授权给应用获得；获得该权限的恶意应用可写入 `D:/server/server-evil.js`，等待系统重启或 `Server.loadAll` 后执行。

更严重的是，D/server 服务约定使用 `ProcessManager.SERVER_SERVICE_PID`，该 PID 与 `EXPLOIT_PID` 同为 `10000`，`PermissionManager.hasPermission()` 对该 PID 直接放行。恶意服务脚本一旦作为 D/server 路径加载，即可借该 PID 调用内核 API，形成持久化提权。

## 漏洞描述

### 攻击链

1. 攻击者诱导用户运行一个声明 `KERNEL_DISK_WRITE` 的普通应用，用户确认磁盘写入权限。
2. 恶意应用写入 `D:/server/server-evil.js`，内容包含合规的 `__ZerOS_ServerExpansion_Register__` 调用，并在顶层或生命周期函数中执行恶意逻辑。
3. 系统下次启动时，`ServerExpansion.init()` 自动扫描 `D:/server` 并通过 `<script>` 加载所有 `server-*.js`。
4. 恶意脚本顶层代码立即执行；若服务被启动，其 `__init__` / `__start__` 也会执行。
5. 恶意脚本使用 `ProcessManager.SERVER_SERVICE_PID` 调用内核 API，`PermissionManager` 对该 PID 直接返回有权限，完成权限提升和持久化。

### 根本原因

- `D:/server` 是可执行系统服务目录，但写入它只需要通用 `KERNEL_DISK_WRITE`，没有单独的危险权限或 SystemToken 限制。
- `ServerExpansion` 初始化时自动加载服务脚本，加载即执行顶层 JS。
- `SERVER_SERVICE_PID` 与 `EXPLOIT_PID` 共享 `10000`，且被权限系统无条件放行。
- 调用栈校验只重点识别 application/temp 等应用路径，对 D/server 路径属于受信服务路径。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `system/expansion/serverExpansion.js` | 初始化后自动扫描并加载 `D:/server/server-*.js` |
| `system/expansion/serverExpansion.js` | 使用 `<script src=...>` 加载服务，脚本顶层立即执行 |
| `kernel/process/permissionManager.js` | `SERVER_SERVICE_PID` 直接拥有所有权限 |
| `kernel/process/processManager.js` | `SERVER_SERVICE_PID` 与 `EXPLOIT_PID` 均为 `10000` |
| `kernel/process/processManager.js` | `FileSystem.write` 仅要求 `KERNEL_DISK_WRITE` |

### 相关代码

```javascript
// serverExpansion.js
function discoverAndLoad() {
    var fileNames = listServerFileNames();
    // ...
    return loadServerScript(fileName);
}

function loadServerScript(fileName) {
    var script = document.createElement('script');
    script.src = actualUrl;
    document.head.appendChild(script); // 加载即执行顶层代码
}

ServerExpansion._ready = ServerExpansion.init();
```

```javascript
// processManager.js
static EXPLOIT_PID = 10000;
static SERVER_SERVICE_PID = 10000;
```

```javascript
// permissionManager.js
if (ProcessManager.SERVER_SERVICE_PID !== undefined && pid === ProcessManager.SERVER_SERVICE_PID) {
    return true;
}
```

## 影响评估

- **持久化提权**: 恶意脚本写入 D/server 后，重启或重新扫描服务目录即可执行。
- **系统级权限**: 服务脚本可借 `SERVER_SERVICE_PID` 获得内核 API 全权限。
- **绕过 SERVER_SERVICE_MANAGE**: 即使没有 `SERVER_SERVICE_MANAGE`，系统初始化自动加载也会执行脚本顶层代码。
- **隐蔽性强**: 文件名符合 `server-*.js` 即可被扫描，恶意服务可伪装为正常系统服务。

### CVSS 3.1 评分建议

- **AV**: Network (N)
- **AC**: Low (L)
- **PR**: Low (L)
- **UI**: Required (R)
- **S**: Changed (C)
- **C/I/A**: High (H)
- **向量**: CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:H -> **9.0（严重）**

---

## 修复建议

1. 将 `D:/server` 设为系统关键目录，禁止 UserToken 通过 FSDirve 或内核 FileSystem 写入、修改、删除其中的 `server-*.js`。
2. 新增独立危险权限（如 `SERVER_SERVICE_INSTALL`），并仅允许管理员或 SystemToken 安装服务脚本。
3. `ServerExpansion` 不应自动加载未签名服务；服务脚本应有签名、哈希白名单或可信清单。
4. 服务加载前应校验来源、签名和安装者，并避免执行未通过校验的顶层代码。
5. 不要让 `SERVER_SERVICE_PID` 与 `EXPLOIT_PID` 共享同一 PID；服务权限应按服务 ID/安装来源细分。
6. 即使是 D/server 路径，调用内核 API 也应通过服务实例权限而非全局放行。

---

## 相关文件

- `system/expansion/serverExpansion.js`
- `kernel/process/processManager.js`
- `kernel/process/permissionManager.js`
- `system/service/FSDirve.php`
- `system/service/DISK/D/server/`

---

**修复状态**: 待修复
