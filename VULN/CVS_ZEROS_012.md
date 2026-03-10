# CVS-ZEROS-012: FSDirve 未限制敏感文件写入导致用户提权

**漏洞编号**: CVS-ZEROS-012  
**发现日期**: 2026-03-09  
**修复日期**: 2026-03-09  
**严重程度**: 严重 (CVSS 9.0)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-732 (敏感信息写入权限过宽)  
**状态**: 已修复

---

## 漏洞概述

ZerOS 的 FSDirve 服务对 `write_file` 操作仅做路径格式与 JWT/upid 权限校验，**未禁止对系统关键文件（如 `LocalSData.json`）的覆盖写入**。具备 `KERNEL_DISK_WRITE` 的任意程序（普通用户即可获得）可通过 FSDirve 覆盖 `D:/LocalSData.json`，注入篡改后的 `userControl.users`、`userControl.currentUser`、`permissionControl.*` 等数据，在下次登录或刷新后实现**用户提权**（普通用户→管理员/root）或**权限伪造**。

---

## 漏洞描述

### 攻击链

1. **前置条件**：攻击者以普通用户身份登录，并运行任意声明了 `KERNEL_DISK_WRITE` 的程序（多数应用默认具备该权限）。
2. **读取当前存储**：通过 FSDirve `read_file`（需 `KERNEL_DISK_READ`）读取 `D:/LocalSData.json`，获得当前完整系统存储 JSON。
3. **篡改内容**：
   - 在 `userControl.users` 中为 `root`（或目标管理员）设置已知密码的哈希（如使用 CryptDrive 变体 MD5 生成）。
   - 可选：将 `userControl.currentUser` 设为 `root`，或修改 `permissionControl.*` / 用户组使当前用户加入 `admins`。
4. **写回磁盘**：通过 FSDirve `write_file` 将篡改后的 JSON 写回 `path=D:`、`fileName=LocalSData.json`，直接覆盖原文件。
5. **提权生效**：用户刷新页面或重新登录时，LStorage 从 `LocalSData.json` 加载数据，UserControl 使用被篡改的 `userControl.users`；攻击者在锁屏选择 root 并输入预设密码即可以管理员/root 身份登录，完成**用户提权**与**权限伪造**。

### 根本原因

- **FSDirve.php**：`write_file` 仅做路径格式校验（如 `validatePath`、禁止 `..`），未对敏感文件名或路径（如 `LocalSData.json`、`ApplicationTable.json`、`D:/application/` 下系统应用）做禁止或限制。
- **权限模型**：`write_file` 对应权限为 `KERNEL_DISK_WRITE`，该权限为“特殊权限”但可由管理员授予，且许多预装/常见应用已声明，普通用户会话下即可通过合法程序触发 FSDirve 写盘。
- **数据权威性**：系统信任从 `LocalSData.json` 加载的 `userControl.*`、`permissionControl.*` 等数据，未在加载时做完整性或来源校验，一旦文件被覆盖即生效。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `system/service/FSDirve.php` | `writeFile()` 及 `write_file` 分支无敏感文件/路径限制 |
| `kernel/drive/LStorage.js` | 使用 FSDirve 读写 `LocalSData.json`，未在调用前对写入目标做服务端白名单 |
| JWT/upid 校验 | 仅校验“是否有权执行 write_file”，不校验“是否可写该路径/文件名” |

### 相关代码（FSDirve）

```php
// FSDirve.php - write_file 分支仅校验 path 格式与文件名不含路径字符
function writeFile($path, $fileName, $content, $writeMod = 'overwrite', $isBase64 = false) {
    $dirPath = getDirPath($path);
    // ...
    $filePath = $dirPath . '/' . $fileName;  // 未禁止 LocalSData.json 等
    if (file_put_contents($filePath, $content, LOCK_EX) !== false) {
        sendResponse(true, '文件写入成功', [...]);
    }
}
```

### 攻击示例（概念）

```javascript
// 在具备 KERNEL_DISK_READ + KERNEL_DISK_WRITE 的程序中（如恶意应用）
const url = SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid });
// 1. 读取当前 LocalSData.json
const readUrl = `${url}&action=read_file&path=D:&fileName=LocalSData.json`;
const res = await fetch(readUrl);
const data = await res.json();
let storage = JSON.parse(data.data.content);

// 2. 篡改：为 root 设置已知密码（需与 CryptDrive 变体一致）
storage.system['userControl.users'].root.password = '<known_md5_hash>';
storage.system['userControl.currentUser'] = 'root';

// 3. 写回
const writeUrl = `${url}&action=write_file&path=D:&fileName=LocalSData.json&writeMod=overwrite`;
await fetch(writeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: JSON.stringify(storage) }) });
// 刷新页面后使用预设密码登录 root 即可提权
```

---

## 影响评估

- **用户提权**：普通用户可获取管理员/root 权限，完全突破用户与权限边界。
- **权限伪造**：可伪造 `userControl.currentUser`、用户组、`permissionControl.*` 等，使系统误判身份与权限。
- **持久化**：篡改写入磁盘，刷新或重启后仍有效，无需持续运行恶意进程。
- **利用门槛**：仅需能运行一个声明了 `KERNEL_DISK_READ`/`KERNEL_DISK_WRITE` 的程序（常见于多种应用），无需物理或管理员权限。

### CVSS 3.1 评分建议

- **攻击向量 (AV)**: Network (N)  
- **攻击复杂度 (AC)**: Low (L)  
- **权限要求 (PR)**: Low (L) — 普通用户即可  
- **用户交互 (UI)**: Required (R) — 需用户启动某应用或访问恶意页面  
- **范围 (S)**: Changed (C) — 从用户层提升到系统/管理员  
- **机密性 (C)**: High (H)  
- **完整性 (I)**: High (H)  
- **可用性 (A)**: Low (L)  

**CVSS 向量**: CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:L → **约 9.0（严重）**

---

## 修复方案（已实施）

采用 **Token 类型 + D 盘根目录敏感文件收紧**：

1. **仅对 D 分区根目录收紧**  
   D 分区为系统盘且一定存在，仅对 `path` 为 D 盘根（如 `D:` 或 `D:/`）的写入做敏感文件校验，其他分区及 D 盘任意子目录不受影响。

2. **SystemToken 一律放行**  
   请求携带 SystemToken 时，不进行敏感文件限制，保证 LStorage 等内核模块的持久化正常。

3. **UserToken 禁止写 D 盘根下系统关键文件**  
   当 JWT 类型为 UserToken 且目标为 D 盘根目录时，若 `fileName` 属于以下名单则返回 **403**，拒绝写入：
   - `LocalSData.json`
   - `LocalSData_backup.json`
   - `ApplicationTable.json`
   - `LocalCache.json`
   - `BootSecurityToken.json`

4. **实现位置**  
   `system/service/FSDirve.php`：在 `writeFile()` 中增加 `getSensitiveFileNamesOnDRoot()` 及上述校验逻辑。

---

## 影响说明

| 场景 | 是否受影响 |
|------|------------|
| LStorage / 内核写回 LocalSData.json、ApplicationTable 等 | **不受影响**（调用来自 kernel，注入 SystemToken，放行） |
| Regedit、Settings 等通过 LStorage.setSystemStorage 修改系统存储 | **不受影响**（持久化由 LStorage 发起，SystemToken） |
| 第三方文件管理器或任意程序直接请求写 **非 D 根** 或 **非敏感文件名** | **不受影响**（仅 D 根 + 敏感文件名才校验） |
| 任意程序以 **UserToken** 直接请求写 **D:/LocalSData.json** 等 | **被拒绝**（403），需改为通过前端系统模块（如 LStorage）操作 |
| 备份/还原写 `D:/backup/LocalSData.json` 等子目录下同名文件 | **不受影响**（仅 D 盘根目录收紧） |

---

## 修复验证建议

- 使用具备 `KERNEL_DISK_WRITE` 的普通用户程序、带 UserToken 调用 FSDirve `write_file` 写入 `path=D:`、`fileName=LocalSData.json`，应返回 403。
- 确认 LStorage 正常保存（内核路径注入 SystemToken）仍可成功。
- 确认对 D 盘根以外路径及非敏感文件名的写入行为与修复前一致。

---

## 相关文件

- `system/service/FSDirve.php` — 文件写入入口与路径校验
- `system/service/jwtVerify.php` — JWT/upid 与 write_file 权限映射
- `kernel/drive/LStorage.js` — LocalSData.json 读写与持久化
- `kernel/core/usercontrol/userControl.js` — 用户数据加载与登录

---

## 参考

- [CWE-284: Improper Access Control](https://cwe.mitre.org/data/definitions/284.html)
- [CWE-732: Incorrect Permission Assignment for Critical Resource](https://cwe.mitre.org/data/definitions/732.html)
- [CVS-ZEROS-008](CVS_ZEROS_008.md) — FSDirve 未授权远程文件操作（已修复，本漏洞为“已鉴权但可写敏感文件”的提权扩展）

---

**修复状态**: ✅ 已修复（2026-03-09，FSDirve.php UserToken + D 盘根敏感文件收紧）
