# CVS-ZEROS-013: LStorage 未将 userControl.currentUser 列为危险键导致权限伪造/持久化

**漏洞编号**: CVS-ZEROS-013  
**发现日期**: 2026-03-09  
**修复日期**: 2026-03-16  
**严重程度**: 中高 (CVSS 5.5)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-863 (错误的授权)  
**状态**: 已修复

---

## 漏洞概述

在 LStorage 的 `setSystemStorage()` 中，**`userControl.currentUser` 未被列入 `DANGEROUS_KEYS`**，仅受“非敏感键”路径校验，即仅需 **`SYSTEM_STORAGE_WRITE`**（基础权限、多数程序自动授予）即可写入。攻击者可在持久化存储中伪造“当前用户”为 root 或任意用户，用于锁屏默认用户显示混淆、与其它漏洞组合实现提权或权限伪造。

---

## 漏洞描述

### 设计意图 vs 实际行为

- **设计意图**：`userControl.currentUser` 应由 UserControl 在登录/登出时唯一写入，且仅内核模块应能修改。
- **实际行为**：`DANGEROUS_KEYS` 仅包含 `userControl.users`、`userControl.groups`、`userControl.settings` 等，**不包含 `userControl.currentUser`**。因此对 `setSystemStorage('userControl.currentUser', 'root')` 会走“非敏感键”分支，只检查 `SYSTEM_STORAGE_WRITE`，任意具备该权限的程序均可写入。

### 代码依据

**文件**: `kernel/drive/LStorage.js`

```javascript
// 约 1844-1853 行：DANGEROUS_KEYS 未包含 userControl.currentUser
const DANGEROUS_KEYS = {
    'userControl.users': true,
    'userControl.groups': true,
    'userControl.settings': true,
    'permissionControl.blacklist': true,
    'permissionControl.whitelist': true,
    'permissionControl.settings': true,
    'permissionManager.permissions': true,
    'applicationTable': true,
};
// userControl.currentUser 缺失

// 约 2035-2058 行：非敏感键仅需 SYSTEM_STORAGE_WRITE
} else {
    // 非敏感键，检查基础权限（SYSTEM_STORAGE_WRITE）
    if (currentPid && typeof PermissionManager !== 'undefined') {
        const hasBasePermission = PermissionManager.hasPermission(currentPid, PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE);
        // ...
    }
}
```

读取侧：`userControl.currentUser` 在 `getSystemStorage` 中被视为敏感键（需 `SYSTEM_STORAGE_READ_USER_CONTROL`），但**写入侧未对称保护**。

### 影响

- **权限伪造/持久化**：持久化存储中的“当前用户”可被任意具备 `SYSTEM_STORAGE_WRITE` 的程序改为 root 或其他用户，影响锁屏默认显示与 `UserControl.getSavedCurrentUser()` 的返回值。
- **与 CVS-ZEROS-012 组合**：若结合 FSDirve 覆盖 `LocalSData.json` 或本漏洞单独使用，可强化“默认以 root 显示”等社会工程或与密码篡改组合完成完整提权。
- **会话内**：`UserControl._currentUser` 受 defineProperty 保护，仅通过 `login`/`logout` 等修改，故**仅写存储不会直接改变当前会话的 isAdmin()**，主要影响为持久化与下次启动/锁屏行为。

---

## 真实危害（审查结论）

经对代码与数据流的完整追踪，结论如下。

### 013 单独利用时的真实危害

| 项目 | 结论 |
|------|------|
| **是否改变当前会话身份/权限** | **否**。`UserControl.getCurrentUser()` 与 `UserControl.isAdmin()` 均依赖运行时 `UserControl._currentUser`，该变量由 `defineProperty` 保护，仅能通过 `UserControl.login()`/`logout()` 修改。写入 LStorage 的 `userControl.currentUser` **不会**影响当前会话。 |
| **是否导致自动登录** | **否**。系统启动与锁屏流程中**没有**基于 `getSavedCurrentUser()` 的自动登录逻辑；登录仅在用户于锁屏输入密码并调用 `UserControl.login(username, password)` 后发生。 |
| **持久化值的唯一致用点** | **仅锁屏界面**。`UserControl.getSavedCurrentUser()` 的唯一调用方为 `system/ui/lockscreen.js`：在展示锁屏时用该值设置**默认选中的用户索引**（`LockScreen._currentUserIndex`），即“下次锁屏/重启后，锁屏上**默认高亮显示哪个用户名**”。 |
| **实际可达效果（013 单独）** | 攻击者可将持久化中的“当前用户”改为任意字符串（如 `root` 或任意用户名）。效果仅为：**下次锁屏或重启后，锁屏界面默认显示/选中该用户名**。用户仍必须输入**该账号的密码**才能登录，故**不构成直接提权**。可被利用为：社会工程（混淆“默认显示为用户 A”与“已以用户 A 登录”）、或与弱口令/其它漏洞组合时预先“指向”目标账号。 |

### 与 CVS-ZEROS-012 的关系

- **012（FSDirve 覆盖 LocalSData.json）**：可一次性篡改整份持久化（含 `userControl.users`、密码哈希、`userControl.currentUser`、`permissionControl.*` 等），**可直接实现提权**（如设 root 密码后改 currentUser 为 root，下次登录即管理员）。
- **013 单独**：仅能改写**单一键** `userControl.currentUser`，且无法改写 `userControl.users` 或密码，故**不能仅凭 013 完成登录他人账号或提权**。013 与 012 组合时，若攻击者已能覆盖文件，则 013 的“可写 currentUser”被 012 完全覆盖；013 的价值在于**在无法利用 012 的环境下**（如仅有 Storage.write、无 FSDirve 写 D 盘根敏感文件权限），仍可滥用 LStorage API 篡改“默认显示用户”，属于**权限边界与数据一致性**问题。

---

## 可利用范围与攻击面

| 维度 | 说明 |
|------|------|
| **可利用主体** | 任意已安装程序，只要其具备 **`SYSTEM_STORAGE_WRITE`**（或通过 API 映射获得的 `Storage.write`）。该权限为**普通权限**（NORMAL），processManager 中 `Storage.write` 映射为 `SYSTEM_STORAGE_WRITE`，大量应用在声明存储写入需求时即可获得，**攻击面大**。 |
| **可写入内容** | 任意字符串。可为已存在用户名（如 `root`）、不存在的用户名、或空串等；锁屏在 `users.findIndex(u => u.username === savedCurrentUser)` 未命中时会回退到索引 0，不崩溃。 |
| **持久化与生效时机** | 写入后经 `_saveStorageData()` 落盘（通常为 D 盘 LocalSData.json 等）。生效时机：**下一次进入锁屏并刷新用户列表时**（如用户锁屏、重启、或锁屏组件重新拉取 `getSavedCurrentUser()`）。 |
| **最大可利用范围** | **仅影响锁屏默认选中/显示的用户名**；不改变任何进程的权限、不绕过登录、不读取或改写其他敏感键（如 `userControl.users` 仍受危险键保护）。 |

---

## 修复建议

1. **将 `userControl.currentUser` 列入危险键并限制写入来源**
   - 在 `DANGEROUS_KEYS` 中增加 `'userControl.currentUser': true`。
   - 在 `DANGEROUS_KEY_PERMISSIONS` 中为该键指定所需权限（建议与 `userControl.settings` 一致，如 `SYSTEM_STORAGE_WRITE_USER_CONTROL`），并确保仅管理员可授予。
   - 对“仅允许 UserControl 模块写入”的键，在 LStorage 的写危险键分支中，对 `userControl.currentUser` 做与 `userControl.users` 类似的**调用栈校验**，仅允许来自 `kernel/core/usercontrol/userControl.js` 的写入。

2. **保持读写对称**
   - 确保所有在 `getSystemStorage` 中需要 `SYSTEM_STORAGE_READ_USER_CONTROL`（或等价）的 `userControl.*` 键，在 `setSystemStorage` 中均有对应的危险键或内核模块白名单保护。

---

## 修复验证

- 使用仅具备 `SYSTEM_STORAGE_WRITE`、不具备 `SYSTEM_STORAGE_WRITE_USER_CONTROL` 的程序调用 `LStorage.setSystemStorage('userControl.currentUser', 'root')`，应被拒绝并抛出权限相关错误。
- 以管理员身份授予某程序 `SYSTEM_STORAGE_WRITE_USER_CONTROL` 后，若未实现“仅 UserControl 模块可写 currentUser”的栈校验，该程序仍不应能直接写 `userControl.currentUser`（建议仅 UserControl 可写）。
- 正常登录/登出流程下，UserControl 对 `userControl.currentUser` 的写入应仍能成功。

---

## 相关文件

- `kernel/drive/LStorage.js` — `DANGEROUS_KEYS`、`setSystemStorage` 写路径与权限校验
- `kernel/core/usercontrol/userControl.js` — 登录/登出时写入 `userControl.currentUser`

---

**修复状态**: ✅ 已修复（2026-03-16）

### 修复内容摘要
- 在 `DANGEROUS_KEYS` 中新增 `'userControl.currentUser': true`，写入该键需走危险键分支。
- 在 `DANGEROUS_KEY_PERMISSIONS` 中为 `userControl.currentUser` 指定 `SYSTEM_STORAGE_WRITE_USER_CONTROL`（仅管理员可授予）。
- 在危险键内核调用校验中新增 `userControl.currentUser` 的调用栈校验：仅允许来自 `kernel/core/usercontrol/userControl.js` 的写入（与 `userControl.users` 一致）。
- 将 `isUserControlKey` 扩展为包含 `userControl.currentUser`，用户程序（非 UserControl 模块）一律不得直接写入该键。
