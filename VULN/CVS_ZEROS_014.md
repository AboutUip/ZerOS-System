# CVS-ZEROS-014: 程序权限注册后端信任前端声明的全部权限导致程序提权

**漏洞编号**: CVS-ZEROS-014  
**发现日期**: 2026-03-09  
**修复日期**: 2026-03-09  
**严重程度**: 高 (CVSS 8.1)  
**CWE分类**: CWE-287 (不恰当的认证), CWE-602 (客户端可篡改的服务器端状态)  
**状态**: 已修复

---

## 漏洞概述

程序启动时，内核将**程序在 `__info__.permissions` 中声明的全部权限**原样发送给 `programPermissions.php` 的 `register` 接口，后端**未校验这些权限是否已被当前用户或管理员实际授予**，直接写入 `BootSecurityToken.json` 的 `programPermissionsMap`。因此恶意程序可在 `__info__` 中声明任意危险权限（如 `SYSTEM_STORAGE_WRITE_USER_CONTROL`、`PROCESS_MANAGE`），在后端获得与声明一致的 upid 权限映射，从而在调用 FSDirve 等依赖 `programPermissionsMap` 的服务时实现**程序提权**（后端认为该 upid 具备未授权的高权限）。

---

## 漏洞描述

### 预期 vs 实际

- **预期**：后端 `programPermissionsMap` 中每个 upid 对应的权限集合，应等于“前端 PermissionManager 实际授予该进程的权限”（即仅包含已授予的普通/特殊/危险权限）。
- **实际**：后端接收并存储的是“程序在 `__info__.permissions` 中声明的权限”的**未过滤副本**。前端 PermissionManager 的授予逻辑（需管理员授权危险权限、isAdminProgram 等）**未在注册请求中体现**，后端也不做二次校验。

### 调用顺序（关键）

1. **ProcessManager.startProgram** 加载程序并取 `programInfo = __info__`。
2. **先**向 `programPermissions.php` 发送 `register`，请求体为：
   - `permissions: programInfo.permissions`（即 **__info__ 中声明的完整列表**，未过滤）。
3. **后**调用 `PermissionManager.registerProgramPermissions(pid, programInfo, { isAdminProgram })`，按策略授予权限（危险权限仅管理员或 isAdminProgram 可获），**但该结果未回写给后端**。

因此后端与前端权限状态不一致：后端可能为某 upid 保存了危险权限，而该进程在前端并未被授予这些权限。

### 攻击方式

恶意程序在 `__info__` 中声明本不应被普通用户授予的权限，例如：

```javascript
__info__: {
    name: 'MaliciousApp',
    permissions: [
        'KERNEL_DISK_READ',
        'KERNEL_DISK_WRITE',
        'SYSTEM_STORAGE_WRITE_USER_CONTROL',  // 仅管理员可授予
        'SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL',
        'PROCESS_MANAGE'
    ]
}
```

当该程序被任意用户启动时：

1. 内核用上述 `programInfo.permissions` 调用 `programPermissions.php` 的 `register`。
2. 后端将上述列表写入 `programPermissionsMap[upid]`。
3. 前端 PermissionManager 仅授予普通权限及已保存的权限，**不会**授予未授权的危险权限。
4. 后续该程序使用同一 upid 调用 FSDirve 等需 JWT+upid 校验的服务时，后端仅根据 `programPermissionsMap[upid]` 判断是否包含该 action 所需权限；若后端新增了依赖“危险权限”的 action，或其它服务根据同一 map 做校验，则该程序会以**未实际授予的高权限**通过校验，形成**程序提权**。

### 与 CVS-ZEROS-012 的关系

- **012**：FSDirve 未限制写入敏感文件，具备 `KERNEL_DISK_WRITE` 即可覆盖 `LocalSData.json` 等，实现用户提权。
- **014**：后端对 upid 的权限列表来源于“程序自报”，未与前端授权结果对齐；即使 012 修复后，仍存在“后端信任前端声明”的提权面：一旦有接口或后续逻辑根据 `programPermissionsMap` 校验危险权限，恶意程序可通过在 `__info__` 中声明该权限而在后端获得通过。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `kernel/process/processManager.js` | 约 1776–1796 行：使用 `programInfo.permissions` 调用 register，未使用 PermissionManager 实际授予的权限集合 |
| `system/service/programPermissions.php` | `action=register` 接收 `permissions` 数组并直接写入 `programPermissionsMap`，未校验是否与用户授权一致 |

### 相关代码（修复前 ProcessManager）

```javascript
// 修复前：使用 programInfo.permissions 声明列表
const permissions = Array.isArray(programInfo.permissions) ? programInfo.permissions : [];
body: JSON.stringify({ action: 'register', programName: programName, permissions: permissions })
```
修复后：先执行 `PermissionManager.registerProgramPermissions(pid, programInfo, options)`，再以 `PermissionManager.getGrantedPermissions(pid)` 作为 `permissions` 调用 register。

### 相关代码（programPermissions.php）

```php
// programPermissions.php action=register
$permissions = $postData['permissions'] ?? null;
$programName = $postData['programName'] ?? null;
if (!is_array($permissions)) {
    sendResponse(false, 'permissions 必须为数组', null, 400);
}
// 无校验：未检查 $permissions 是否与当前用户可授予的权限一致
loadModifySaveBootSecurity(function (array &$data) use ($programName, $permissions, &$upid) {
    $map = &$data['programPermissionsMap'];
    $upid = generateUpid($programName, $map);
    $map[$upid] = $permissions;  // 直接存储前端传来的列表
});
```

---

## 影响评估

- **程序提权**：恶意程序可在后端获得其未在前端被授予的危险权限，一旦有服务或 action 依赖这些权限做校验，即可越权操作。
- **权限不一致**：同一进程在前端“实际权限”与后端“记录权限”不一致，违反最小权限与一致性原则。
- **利用门槛**：仅需能安装并启动一个在 `__info__.permissions` 中声明高权限的恶意程序（普通用户即可），无需管理员或已有高权限。

### CVSS 3.1 建议

- **攻击向量 (AV)**: Network (N)  
- **攻击复杂度 (AC)**: Low (L)  
- **权限要求 (PR)**: Low (L)  
- **用户交互 (UI)**: Required (R) — 需用户启动恶意程序  
- **范围 (S)**: Changed (C) — 程序权限边界被突破  
- **机密性 (C)**: High (H)  
- **完整性 (I)**: High (H)  
- **可用性 (A)**: Low (L)  

**CVSS 向量**: CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:L → **约 8.1（高）**

---

## 修复建议

1. **以“实际授予的权限”注册到后端（推荐）**
   - 将“向后端 register”的调用移动到 **PermissionManager.registerProgramPermissions(pid, programInfo, options)** **之后**。
   - 注册时发送的 `permissions` 使用 **PermissionManager 实际授予该 pid 的集合**，例如：
     - `PermissionManager._permissions.get(pid)` 转成数组，或
     - 由 PermissionManager 提供 `getGrantedPermissions(pid)` 返回当前已授予权限列表。
   - 这样后端 `programPermissionsMap[upid]` 与前端权限状态一致，且不信任程序自报的完整声明。

2. **后端校验（可选增强）**
   - 对 `register` 收到的 `permissions` 与 JWT 中的用户身份做校验：若包含高风险权限（与 `jwtVerifyGetHighRiskPermissions()` 一致），则要求 JWT 为管理员或拒绝写入该部分权限。
   - 仍建议以“前端只传已授予权限”为主，后端校验为辅。

3. **审计与测试**
   - 启动一恶意程序（声明危险权限但未获管理员授权），确认其 upid 在 `BootSecurityToken.json` 的 `programPermissionsMap` 中**不**包含未授予的危险权限。
   - 确认正常程序（含管理员授权危险权限）仍能正确使用 FSDirve 等依赖 upid 的服务。

---

## 实现要点（落地步骤）

### 前端：processManager.js

- **调整顺序**：先执行 `PermissionManager.registerProgramPermissions(pid, programInfo, { isAdminProgram })`，再向后端发起 `register` 请求（当前是先 register 再 registerProgramPermissions，需对调）。
- **注册 payload**：`register` 请求体中的 `permissions` 改为 **PermissionManager 实际授予该 pid 的列表**，不再使用 `programInfo.permissions`。
- **具体位置**：约 1776–1796 行的“先 register、拿 upid”整块逻辑，移动到约 1896 行 `registerProgramPermissions` 调用**之后**；且在构造 `body` 时使用：
  - `permissions: PermissionManager.getGrantedPermissions(pid)`（见下），或
  - `permissions: Array.from(PermissionManager._permissions.get(pid) || new Set())`（若暂不新增 API）。

### 前端：permissionManager.js

- **新增接口（推荐）**：增加 `PermissionManager.getGrantedPermissions(pid)`，返回 `Array.from(PermissionManager._permissions.get(pid) || new Set())`，供 ProcessManager 在 register 时使用，避免多处直接依赖 `_permissions`。

### 后端：programPermissions.php（可选增强）

- 在 `action === 'register'` 分支中，对 `$permissions` 做一次**过滤**：若 JWT 为普通用户（非 ADMIN/DEFAULT_ADMIN），则调用 `jwtVerifyGetHighRiskPermissions()`，从待写入的权限列表中**剔除**所有高风险权限后再写入 `programPermissionsMap`；或对“包含高风险且非管理员”的请求直接 403。这样即使前端被篡改，后端也不会为普通用户写入危险权限。
- 与“前端只传已授予权限”同时实施时，后端校验可作为纵深防御。

---

## 修复验证

- 恶意程序在 `__info__` 中声明 `SYSTEM_STORAGE_WRITE_USER_CONTROL`，以前台普通用户启动后，检查 `BootSecurityToken.json` 中该程序对应 upid 的权限列表，应**不包含** `SYSTEM_STORAGE_WRITE_USER_CONTROL`。
- 同一程序由管理员授权该危险权限后，对应 upid 的权限列表中应**包含**该权限，且 FSDirve 等行为符合预期。

---

## 相关文件

- `kernel/process/processManager.js` — 启动流程与 register 调用、payload 构造
- `kernel/process/permissionManager.js` — 实际权限授予与 _permissions
- `system/service/programPermissions.php` — register/reclaim 与 programPermissionsMap 写入
- `system/service/jwtVerify.php` — programPermissionsMap 的读取与 upid 权限校验

---

## 参考

- [CWE-287: Improper Authentication](https://cwe.mitre.org/data/definitions/287.html)
- [CWE-602: Client-Side Enforcement of Server-Side Security](https://cwe.mitre.org/data/definitions/602.html)

---

## 修复记录

- **2026-03-09**：前端修复。ProcessManager 先调用 `PermissionManager.registerProgramPermissions(pid, programInfo, options)`，再向后端 `register`；注册时 `permissions` 改为 `PermissionManager.getGrantedPermissions(pid)`，不再使用 `programInfo.permissions`。PermissionManager 新增 `getGrantedPermissions(pid)`。后端 `programPermissionsMap[upid]` 仅保存实际授予的权限，恶意程序在 `__info__` 中声明的未授权危险权限不再写入。
- **2026-03-09**：用户授权后同步与持久化兼容。后端新增 `action=update`（参数 `upid`、`permissions`），用于更新已注册 upid 的权限列表。PermissionManager 在 `_grantPermission` 中，若该 pid 已有关联 upid，则异步调用 `update` 将当前 `getGrantedPermissions(pid)` 同步到后端，保证同会话内用户新授权的权限在后端生效；持久化权限在下次启动时通过 register 携带，与现有「仅请求一次、允许后持久化放行」逻辑兼容。详见 [programPermissions.md](../docs/INTERFACE/programPermissions.md)。

---

**修复状态**: ✅ 已修复
