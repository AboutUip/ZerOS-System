# CVS-ZEROS-015: FSDirve rename_file 未限制 D 盘根敏感文件名导致敏感文件写入限制被绕过

**漏洞编号**: CVS-ZEROS-015  
**发现日期**: 2026-03-15  
**修复日期**: 2026-03-16  
**严重程度**: 严重 (CVSS 9.0)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-863 (错误的授权)  
**状态**: 已修复

---

## 漏洞概述

FSDirve 在 CVS-ZEROS-012 修复中对 **write_file** 增加了 D 盘根目录敏感文件名单校验，使用 UserToken 时禁止写入 `LocalSData.json`、`ApplicationTable.json` 等敏感文件名。**rename_file**、**move_file**、**copy_file** 未施加相同策略：未对 D 盘根下敏感文件名做任何校验。攻击者可先以 write_file 在 D 盘根写入非敏感文件名（如 `evil.json`）的任意内容，再通过 rename_file 将现有 `LocalSData.json` 重命名移走，并将该文件重命名为 `LocalSData.json`，从而绕过 012 的写入限制，达到覆盖系统敏感文件的效果，导致用户提权或权限伪造（与 012 等价）。

---

## 漏洞描述

### 攻击链（须以 UserToken 直接请求 FSDirve）

以下步骤**必须**由前端以 **UserToken + upid** 直接请求 FSDirve HTTP 接口（如 `fetch`）完成；若改为通过内核 `FileSystem.read`/`FileSystem.write`，请求会带 SystemToken，012/015 限制不适用，本漏洞链不成立。

1. 攻击者以普通用户身份登录，并运行具备 `KERNEL_DISK_READ`、`KERNEL_DISK_WRITE` 的程序（且该程序在 programPermissionsMap 中登记，以便带 upid 请求 FSDirve）。
2. 通过 FSDirve **read_file**（UserToken+upid）读取 `D:/LocalSData.json`，获得完整系统存储 JSON。
3. 篡改内容（如修改 `userControl.users` 中某用户密码或级别、或 `userControl.currentUser`、`permissionControl.*` 等）。
4. 通过 FSDirve **write_file**（UserToken+upid）将篡改后的 JSON 写入 `path=D:`、`fileName=evil.json`（非敏感名）。此步骤受 012 约束仅针对敏感文件名，故不被拒绝。
5. 通过 FSDirve **rename_file**（UserToken+upid）：`path=D:`，`oldFileName=LocalSData.json`，`newFileName=LocalSData_old.json`。`renameFile()` 无 D 根敏感文件校验，操作被允许。
6. 通过 FSDirve **rename_file**（UserToken+upid）：`path=D:`，`oldFileName=evil.json`，`newFileName=LocalSData.json`。恶意内容被重命名为敏感文件名，同样无校验。
7. 刷新或重新登录后，系统从被替换的 `LocalSData.json` 加载数据，篡改生效，实现用户提权或权限伪造。

### 根本原因

- CVS-ZEROS-012 的修复仅作用于 `writeFile()`：仅在目标为 D 盘根且 `fileName` 属于敏感名单时对 UserToken 拒绝写入。
- **rename_file**、**move_file**、**copy_file** 未对 D 盘根敏感文件名做任何校验：  
  - `renameFile()` 未校验 `oldFileName`、`newFileName` 是否属于敏感名单；  
  - `moveFile()`、`copyFile()` 未校验目标路径为 D 根且目标文件名为敏感名单时的 UserToken 写入。  
- 因此“禁止 UserToken 向 D 根敏感文件写入”的策略可通过“写入非敏感名 + 重命名为敏感名”被完全绕过。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `system/service/FSDirve.php` | `renameFile()`、`moveFile()`、`copyFile()` 未对 D 根敏感文件名做 UserToken 校验 |
| 与 012 共用 | `getSensitiveFileNamesOnDRoot()` 已定义敏感名单，仅被 `writeFile()` 使用 |

### 相关代码

```php
// FSDirve.php - renameFile() 仅做路径与文件名格式校验，无敏感文件名单校验
function renameFile($path, $oldFileName, $newFileName) {
    $dirPath = getDirPath($path);
    // ... 存在性检查 ...
    if (rename($oldFilePath, $newFilePath)) {
        sendResponse(true, '文件重命名成功', [...]);
    }
}
```

`moveFile()`、`copyFile()` 同样未在目标为 D 根且目标文件名为敏感名单时进行校验。

### 利用要点

- 使用 UserToken + upid 调用 FSDirve；  
- `write_file` 目标文件名为非敏感名（如 `evil.json`）；  
- 两次 `rename_file` 将原敏感文件移走并将非敏感名改为敏感名。

---

## 使用条件（前置条件）

本漏洞**并非任意环境均可利用**，需同时满足以下条件：

| 条件 | 说明 |
|------|------|
| **可执行带权程序** | 能运行具备 `KERNEL_DISK_READ`、`KERNEL_DISK_WRITE` 的程序（如置于 `D:/bin/` 的脚本或受信任可执行文件）。 |
| **有效 UserToken** | 调用 FSDirve 时需携带有效 UserToken（即已登录任意账号，由前端/NetworkManager 注入）。 |
| **可写 D 盘根** | 该 UserToken 对应的 upid/权限允许在 D 盘根目录创建、重命名文件（与 012 的 write 策略一致，仅敏感**文件名**被 write 限制，rename 未限制）。 |

因此：未登录用户、或无法执行具备磁盘读写权限程序的场景下，无法直接利用 015；已登录且能跑 bin 脚本（或等价能力）时，方可完成“写非敏感名 + rename 成敏感名”的绕过链。

### 利用可行性说明（为何可能无法利用）

在实际代码与调用链下，015 的完整攻击链**可能无法走通**，原因如下：

| 环节 | 说明 |
|------|------|
| **内核未暴露 rename** | 应用层可见的 kernel API 仅有 `FileSystem.read`、`FileSystem.write`、`FileSystem.delete`、`FileSystem.create`、`FileSystem.list`，**没有** `FileSystem.rename`（或 move/copy）。因此无法通过「脚本只调 kernel API」完成“写非敏感名 + 两次 rename”的链，必须由前端**直接请求 FSDirve HTTP 接口**（如 `fetch`）才能发起 `rename_file`。 |
| **走 kernel 时用的是 SystemToken** | 当脚本调用 `kernelAPI.call('FileSystem.read'/'FileSystem.write')` 时，实际发往 FSDirve 的请求由 **ProcessManager（内核）** 发起。NetworkManager 的 `_getJWTTypeForCaller()` 根据调用栈判断：栈中出现的是 `kernel/` 等非 DISK 路径，故注入的是 **SystemToken**，不是 UserToken。012/015 的「禁止 UserToken 写 D 根敏感文件」只约束 UserToken，对 SystemToken 不生效。因此通过 kernel 读写的脚本**不会**触发 015 的绕过链，也不会被 012 限制。 |
| **015 依赖 UserToken 路径** | 015 的利用前提是：**UserToken** 向 FSDirve 发起 `write_file`（非敏感名）和两次 `rename_file`。只有当前端代码（如 DISK/D/application 或 D:/bin 脚本）**自己**对 FSDirve 做 `fetch` 时，调用栈才会落在 DISK 下，此时才会注入 UserToken。 |
| **直接 fetch 需 upid 且需在 programPermissionsMap** | UserToken 请求必须在 URL 中带 **upid**，且该 upid 须出现在 `BootSecurityToken.json` 的 `programPermissionsMap` 中并声明 `KERNEL_DISK_READ`、`KERNEL_DISK_WRITE`。若脚本在终端中运行，需能从运行环境（如 `initArgs.upid`）拿到终端对应的 upid 并传给 FSDirve；若拿不到 upid 或该 upid 未在 programPermissionsMap 中登记，服务端会 401，015 链无法完成。 |

**结论**：后端上 rename_file 未做 D 根敏感名校验的**设计缺陷成立**，应修复。但在「仅能跑 D:/bin 脚本、且脚本仅使用 kernel API」的约束下，脚本不会发起带 UserToken 的 rename_file，015 的绕过链**在实际中可能无法复现**。若存在其他入口（如带 UserToken+upid 的 FSDirve 调用的应用）可主动发起 write_file + rename_file，则 015 仍具利用价值。

---

## 影响评估

- **用户提权/权限伪造**：在满足上述使用条件时，与 012 等价：普通用户可借具备磁盘读写权限的程序，通过“写非敏感名 + 重命名”覆盖 D 根敏感文件（如 `LocalSData.json`），从而篡改用户与权限数据，实现提权或持久化伪造。
- **持久化**：篡改落盘，刷新或重启后仍有效。

### CVSS 3.1 评分建议

- **AV**: Network (N)  
- **AC**: Low (L)  
- **PR**: Low (L)  
- **UI**: Required (R)  
- **S**: Changed (C)  
- **C/I/A**: C:H, I:H, A:L  
- **向量**: CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:L → **约 9.0（严重）**

---

## 修复建议

1. **统一 D 根敏感文件策略**  
   对 **rename_file**、**move_file**、**copy_file** 在目标为 D 盘根目录且涉及敏感文件名时，施加与 `writeFile()` 相同的 UserToken 限制：  
   - **rename_file**：当 `path` 为 D 根且 `oldFileName` 或 `newFileName` 属于 `getSensitiveFileNamesOnDRoot()` 时，若请求为 UserToken 则拒绝（403）。  
   - **move_file**：当 `targetPath` 为 D 根且 `targetFileName`（或默认源文件名）属于敏感名单时，若为 UserToken 则拒绝。  
   - **copy_file**：同上；若存在覆盖已存在文件的逻辑，目标为 D 根敏感文件时同样应拒绝 UserToken。
2. **实现方式**  
   在 `renameFile()`、`moveFile()`、`copyFile()` 中解析 path/targetPath，若为 D 根则取敏感名单，并通过 `jwtVerifyExtractToken()` 与 payload 判断是否为 UserToken；若为 UserToken 且操作会产生或覆盖 D 根下敏感文件名，则返回 403。
3. **delete_file**  
   建议对 D 根敏感文件的删除同样限制：仅 SystemToken 允许，避免 UserToken 删除后与写非敏感名 + rename 组合利用。

---

## 相关文件

- `system/service/FSDirve.php` — `writeFile()`（已加固）、`renameFile()`、`moveFile()`、`copyFile()`、`deleteFile()`（均已加固）
- `system/service/jwtVerify.php` — JWT/upid 与 action 权限映射

---

## 修复说明（2026-03-16）

- **renameFile**：当 `path` 为 D 根且 `oldFileName` 或 `newFileName` 属于 `getSensitiveFileNamesOnDRoot()` 时，UserToken 请求返回 403。
- **moveFile**：当源路径为 D 根且源文件名在敏感名单、或目标路径为 D 根且目标文件名在敏感名单时，UserToken 返回 403。
- **copyFile**：当目标路径为 D 根且目标文件名在敏感名单时，UserToken 返回 403。
- **deleteFile**：当 `path` 为 D 根且 `fileName` 在敏感名单时，UserToken 返回 403。
- 与 012 一致：仅校验 UserToken；SystemToken 不受限。403 文案统一为「禁止使用 UserToken 在 D 盘根目录对系统关键文件执行该操作，请通过前端系统模块（如 LStorage）操作」。

---

## 参考

- [CVS-ZEROS-012](CVS_ZEROS_012.md) — FSDirve write_file 敏感文件限制（已修复；本漏洞为其绕过）
- [CWE-284: Improper Access Control](https://cwe.mitre.org/data/definitions/284.html)
- [CWE-863: Incorrect Authorization](https://cwe.mitre.org/data/definitions/863.html)
