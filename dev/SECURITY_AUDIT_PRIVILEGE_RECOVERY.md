# ZerOS 提权漏洞审计与 root 控制权恢复指南（dev 环境）

**文档目的**：在系统被入侵、root 密码被篡改且仅剩 testuser 可用时，作为项目开发者在 **dev 工作环境** 下进行安全审计，利用已发现的提权路径夺回 root 控制权，并记录漏洞与修复建议。  
**适用场景**：你是该项目开发者，拥有 testuser 账号，系统部署于公共环境后被渗透，root 密码被更改，需在合规前提下恢复控制权。

---

## 1. 审计结论摘要

| 项目 | 说明 |
|------|------|
| **推荐恢复路径（仅 bin、不装 zom）** | [CVS-ZEROS-016](../VULN/CVS_ZEROS_016.md)：RandomSecurity 接口未校验请求来源即根据 `type=SystemToken` 签发系统令牌。**仅需**在终端或 D:/bin 脚本中发起一次 HTTP 请求即可获得 SystemToken，再用该 token 直接写回 `D:/LocalSData.json`（SystemToken 不受 012 限制）。**无需安装 zom、无需 KERNEL_DISK_WRITE 授权、无需 rename，风险最低。** |
| **备选路径（需磁盘写+rename）** | [CVS-ZEROS-015](../VULN/CVS_ZEROS_015.md)：通过 write_file 写非敏感名 + rename_file 替换 `LocalSData.json`，需具备 `KERNEL_DISK_READ`/`KERNEL_DISK_WRITE` 的程序（见方案 A/B）。 |
| **其他发现** | 见下文「其他审计发现」。 |

---

## 2. 漏洞详情（CVS-ZEROS-015）

- **位置**：`system/service/FSDirve.php` 中 `renameFile()`、`moveFile()`、`copyFile()` 未对 D 盘根目录敏感文件名做 UserToken 校验。
- **与 012 关系**：012 仅限制了 **write_file** 对 D 根敏感文件名的写入，未限制 **rename_file**。因此可先 `write_file` 到 `D:/evil.json`（非敏感名），再两次 `rename_file` 将 `LocalSData.json` 换走并把 `evil.json` 改名为 `LocalSData.json`。
- **完整技术说明与修复建议**：见 [VULN/CVS_ZEROS_015.md](../VULN/CVS_ZEROS_015.md)。

---

## 3. 恢复步骤（dev 环境下夺回 root）

**前提**：你能以 **testuser** 登录 ZerOS 前端，并能打开**终端**或运行 **D:/bin 下脚本**（或浏览器控制台）。若账号不允许安装 zom、仅能运行 bin 类脚本，请优先使用 **方案 C**。

### 方案 C：仅用 bin 脚本获取 SystemToken 后写回 LocalSData（推荐，无需 zom、风险最低）※ CVS-ZEROS-016

1. **以 testuser 登录**，打开终端（或能执行 D:/bin/xxx.js 的环境）。
2. **获取 SystemToken**：向 RandomSecurity 接口发送请求，携带 `randomValue`（32 位十六进制）和 `type=SystemToken`。接口**无需 JWT**，会直接签发并返回 SystemToken。
   - 若使用 **PHP 后端**：`POST` 到 `{origin}/system/service/randomSecurity.php`，body：`JSON.stringify({ randomValue: "<32位hex>", type: "SystemToken" })`。
   - 若使用 **Java 后端**：`GET` 或 `POST` 到 `{origin}/randomSecurity?randomValue=<32位hex>&type=SystemToken`（具体路径以实际部署为准，如 `/api/randomSecurity` 等）。
   - `randomValue` 可用页面内 `crypto.getRandomValues(new Uint8Array(16))` 转 32 位 hex，或任意合法 32 位十六进制串。
3. **从响应中取出 `data.token`**，即为 SystemToken。
4. **用 SystemToken 读取并篡改 LocalSData.json**：
   - 使用该 token 调用 FSDirve `read_file`（Header：`Authorization: Bearer <token>`，无需 upid），读取 `path=D:`、`fileName=LocalSData.json`。
   - 在内存中修改 JSON：将 `system["userControl.users"]["root"]["password"]` 设为已知密码的 MD5 或 `null`，或将 `TestUser` 的 `level` 改为 `DEFAULT_ADMIN`。
   - 使用同一 token 调用 FSDirve `write_file`，`path=D:`、`fileName=LocalSData.json`、`content=篡改后的 JSON 字符串`。**SystemToken 允许写 D 根敏感文件**，因此会成功。
5. **刷新页面**，用 root（新密码或无密码）或 testuser（已是管理员）登录，夺回控制权。

**优点**：不需安装任何 zom、不需对程序授予 KERNEL_DISK_WRITE、不需 rename 操作；仅需能发起 HTTP 的 bin 脚本或控制台即可，适合“账号等级不允许安装 zom、只能运行 bin 程序”的场景。

### 方案 A：将 root 密码重置为已知密码（需 KERNEL_DISK_READ/WRITE，或先按方案 C 取 SystemToken）

1. **以 testuser 登录**，打开终端（或具备 FSDirve 读写的应用）。
2. **读取当前 LocalSData.json**（通过 FSDirve `read_file`，需在能发起带 UserToken + upid 请求的前端环境中，例如终端内调用或小脚本）。
3. **在内存中修改 JSON**：
   - 找到 `system["userControl.users"]["root"]`，将 `password` 设为已知密码的 **MD5 哈希**（须与内核 CryptDrive 使用的算法一致，见 `kernel/drive/cryptDrive.js` 中的变体），或暂时设为 `null` 以便无密码登录。
   - 保存完整 JSON 为字符串。
4. **写入非敏感文件名**：调用 FSDirve `write_file`，`path=D:`，`fileName=recovery.json`（或任意非敏感名），`content=` 上一步的 JSON 字符串。
5. **两次 rename_file**（均需带 UserToken + upid）：
   - `path=D:`, `oldFileName=LocalSData.json`, `newFileName=LocalSData.json.bak`
   - `path=D:`, `oldFileName=recovery.json`, `newFileName=LocalSData.json`
6. **刷新页面**，在锁屏选择 **root**，用你设定的新密码（或无密码）登录，即可夺回 root。

### 方案 B：将 TestUser 提升为 DEFAULT_ADMIN

若你更希望保留 root 账户不动、仅提升 testuser 权限：

1. 以 testuser 登录，同上读取 `D:/LocalSData.json`。
2. 修改 JSON：
   - `system["userControl.users"]["TestUser"]["level"]` 改为 `"DEFAULT_ADMIN"`；
   - 如需，将 `system["userControl.groups"]["admins"]["members"]` 中加入 `"TestUser"`。
3. 同上：write_file 到 `D:/recovery.json`，再两次 rename_file 将 `LocalSData.json` 替换为 `recovery.json` 的内容。
4. 刷新后继续使用 testuser 登录，此时已具备管理员权限，可再通过设置界面或 UserControl 修改 root 密码。

### 注意事项

- **密码哈希**：root 的 `password` 必须与 `UserControl.login` 中使用的算法一致（当前为 CryptDrive 的 MD5 变体）。若设为 `null`，则 root 可无密码登录。
- **备份**：第一步 rename 会把原 `LocalSData.json` 改名为 `LocalSData.json.bak`，恢复后可从备份还原或对比。
- **仅限合法用途**：本流程仅用于你作为系统所有者/开发者在自有或授权环境中恢复控制权，请勿用于未授权系统。

---

## 4. 其他审计发现（建议后续加固）

- **Java 后端 GET 请求不校验 JWT**（`JwtAuthInterceptor`）：所有 GET 请求直接放行。若存在通过 GET 修改状态或返回敏感数据（如 BootSecurityToken、用户数据）的接口，存在未授权访问风险。建议对敏感接口统一要求鉴权，或至少对变更类操作禁止仅 GET。
- **CVS-ZEROS-013**：LStorage 未将 `userControl.currentUser` 列为危险键，具备 `SYSTEM_STORAGE_WRITE` 的程序可写该键，导致权限伪造/持久化。恢复后建议一并修复。
- **终端 login/su**：`login` 与 `su` 仅传用户名、不传密码；对有密码用户会验证失败。非直接提权漏洞，但若与 013 或存储篡改结合可能放大风险，建议 su 时增加密码输入或明确提示需密码。

---

## 5. 恢复后的建议操作

1. **立即修改 root 密码**：通过锁屏或设置界面将 root 改为强密码。
2. **优先修复 CVS-ZEROS-016**：RandomSecurity 仅允许“系统引导”上下文签发 SystemToken，拒绝未认证或非引导的 `type=SystemToken` 请求（详见 [CVS_ZEROS_016.md](../VULN/CVS_ZEROS_016.md)）。
3. **修复 CVS-ZEROS-015**：在 FSDirve 的 `renameFile()`、`moveFile()`、`copyFile()` 中对 D 根敏感文件名施加与 `writeFile()` 相同的 UserToken 限制（详见 [CVS_ZEROS_015.md](../VULN/CVS_ZEROS_015.md)）。
4. **审计 Java 后端**：检查所有 GET 接口是否应要求 JWT，避免敏感操作或数据通过 GET 未鉴权暴露。
5. **考虑修复 013**：将 `userControl.currentUser` 纳入危险键或仅允许内核/UserControl 写入，避免任意程序伪造当前用户。

---

## 6. 相关文件索引

| 文件 | 说明 |
|------|------|
| [VULN/CVS_ZEROS_016.md](../VULN/CVS_ZEROS_016.md) | RandomSecurity 未校验即签发 SystemToken（推荐恢复路径，仅需 bin 脚本） |
| [VULN/CVS_ZEROS_015.md](../VULN/CVS_ZEROS_015.md) | FSDirve rename 绕过 012 的完整漏洞报告与修复建议 |
| [VULN/CVS_ZEROS_012.md](../VULN/CVS_ZEROS_012.md) | FSDirve write_file 敏感文件限制（已修复） |
| [VULN/README.md](../VULN/README.md) | 漏洞列表与统计 |
| `system/service/FSDirve.php` | write_file 已加固；rename_file/move_file/copy_file 待加固 |
| `kernel/core/usercontrol/userControl.js` | 用户数据加载、登录与密码校验 |
| `kernel/drive/LStorage.js` | LocalSData.json 读写与 setSystemStorage 权限逻辑 |

---

**文档版本**: 1.0  
**日期**: 2026-03-15  
**适用范围**: ZerOS dev 环境，项目开发者夺回 root 控制权及后续加固参考。
