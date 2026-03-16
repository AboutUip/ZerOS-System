# CVS-ZEROS-016: RandomSecurity 未校验请求来源即签发 SystemToken 导致未认证获取系统令牌

**漏洞编号**: CVS-ZEROS-016  
**发现日期**: 2026-03-15  
**修复日期**: 2026-03-16  
**严重程度**: 严重 (CVSS 9.8)  
**CWE分类**: CWE-306 (缺少身份验证), CWE-284 (不恰当的访问控制)  
**状态**: 已修复

---

## 漏洞概述

RandomSecurity 接口（PHP `randomSecurity.php` 与 Java `RandomSecurityController`）用于系统启动时签发 SystemToken、用户登录时签发 UserToken。该接口被配置为**无需 JWT 认证**（白名单），但**未校验请求是否来自系统引导或可信上下文**，仅根据客户端传入的 `type` 参数决定签发类型。任意能访问该接口的客户端在未认证前提下，只要提供合法格式的 `randomValue`（32 位十六进制）并传入 `type=SystemToken`，即可获得 SystemToken。持有 SystemToken 的请求可访问所有仅允许 SystemToken 的后端接口（如 FSDirve 写 D 根敏感文件、programPermissions、nodeLibExec 等），等价于获得系统级权限，可导致完全提权。

---

## 漏洞描述

### 设计意图与实际行为

- **设计意图**：SystemToken 仅应在**系统启动**时由内核 RandomSecurity 模块调用后端签发；UserToken 在**用户登录**时由 UserControl 调用签发。RandomSecurity 不要求携带 JWT（因签发前尚无有效令牌），但应仅允许“引导上下文”签发 SystemToken。
- **实际行为**：后端仅校验 `randomValue` 格式（32 位十六进制），不校验请求来源、不校验是否处于系统引导、不校验是否已登录。客户端传 `type=SystemToken` 即签发 SystemToken 并清空已有令牌；传 `type=UserToken` 即签发 UserToken。因此任意能访问该 URL 的客户端均可请求并获签 SystemToken。

### 攻击链

1. 攻击者能够向系统后端发起 HTTP 请求（同源页面内脚本、控制台、或可访问该 URL 的客户端）。
2. 生成或使用任意 32 位十六进制字符串作为 `randomValue`。
3. 向 RandomSecurity 接口发送 GET 或 POST，参数包含 `randomValue`、`type=SystemToken`。  
   - Java：`/randomSecurity` 在 JWT excludePaths 中，不校验 JWT。  
   - PHP：`randomSecurity.php` 未调用 requireJWTVerify。
4. 响应中 `data.token` 即为 SystemToken（JWT）。
5. 使用该 token 调用仅允许 SystemToken 的接口（如 FSDirve `write_file` 写 `D:/LocalSData.json`、programPermissions、nodeLibExec 等），实现系统级操作与提权。

### 根本原因

- RandomSecurity 作为“签发服务”被加入 JWT 排除列表，但**未对签发类型做来源或上下文约束**。
- 后端仅根据客户端传入的 `type` 签发对应令牌，未区分“引导时 SystemToken 请求”与“任意客户端的 SystemToken 请求”，导致未认证即可获取系统最高权限令牌。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `system/service/randomSecurity.php` | 从 GET/POST 读取 `type`，无来源校验即签发 |
| `system/service/backend-java/.../RandomSecurityController.java` | 同上；`/randomSecurity` 在 JwtProperties.excludePaths |
| `system/service/backend-java/.../JwtProperties.java` | excludePaths 含 `/randomSecurity`、`/randomSecurity/**` |

### 相关代码（Java）

```java
// RandomSecurityController.java - 未校验 type=SystemToken 的请求是否来自引导
@RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
public ResponseEntity<...> handleRequest(
    @RequestParam(required = false) String type, ...) {
    return handleGenerate(randomValue, type, userLevel, permissions);
}
// handleGenerate 中：
String resolvedType = (type != null && !type.isBlank()) ? type : "Unknown";
if ("SystemToken".equals(resolvedType) && !existingTokens.isEmpty()) {
    bootSecurityTokenService.clearTokens();
    // ...
}
String token = jwtUtil.generateSecurityToken(randomValue, resolvedType, ...);
// 写入 BootSecurityToken.json 并返回 token 给客户端
```

### 利用要点

- 请求方法：GET 或 POST 均可；参数可置于 query 或 body。  
- 必填参数：`randomValue`（32 位十六进制）、`type=SystemToken`。  
- 获得 token 后，在后续请求头中携带 `Authorization: Bearer <token>` 调用受保护接口。

---

## 影响评估

- **完全提权**：获得 SystemToken 后，可执行所有仅允许 SystemToken 的操作（写 D 根敏感文件、调用 nodeLibExec、修改程序权限映射等），等同于系统控制权。
- **利用门槛低**：无需安装应用、无需已有高权限；仅需能向 RandomSecurity 发起 HTTP 请求即可。
- **无认证要求**：无需登录或持有有效 JWT，即可获取系统级令牌。

### CVSS 3.1 评分建议

- **AV**: Network (N)  
- **AC**: Low (L)  
- **PR**: None (N)  
- **UI**: Required (R)  
- **S**: Changed (C)  
- **C/I/A**: High (H)  
- **向量**: CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H → **约 9.8（严重）**

---

## 修复建议

1. **禁止未认证签发 SystemToken**  
   RandomSecurity 对 `type=SystemToken` 的请求，**仅**在可证明“系统引导上下文”时允许签发（例如：仅接受同源首屏加载的首次请求、或需携带仅由引导流程持有的临时 secret、或限制在启动阶段短时间窗口内且仅一次）。其他任何未认证或非引导上下文的 `type=SystemToken` 请求一律返回 403。
2. **UserToken**  
   用户登录后由前端已认证上下文调用签发，可维持现有逻辑；若后端能区分“已登录用户请求”，可仅允许已认证请求签发 UserToken。
3. **审计其他后端**  
   若存在与 RandomSecurity 等效的 PHP/Python 签发逻辑，应施加相同的“仅引导可签 SystemToken”限制。

---

## 根本修复（2026-03-16）：先提交 randomValue 再签发 SystemToken

- **约束**：后端对 `type=SystemToken` 的请求**仅**在“该 randomValue 已通过 `action=commit_for_system` 提交且来自同一 IP、未消费”时签发，否则 403。
- **流程**：引导脚本生成 randomValue 后，先 POST `action=commit_for_system` + `randomValue`；服务端按 IP 仅允许一笔未消费提交（超时 5s 可覆盖，便于刷新恢复）。再 POST 签发请求 `type=SystemToken` + 同一 randomValue；后端校验并消费该提交后签发。
- **实现**：`system/service/randomSecurity.php` 新增 `commit_for_system` 与 `BOOT_COMMIT_FILE` 存储；`kernel/core/safemode/randomSecurity.js` 在 `runSecurityCheck` 中先调用 `commitRandomValueForSystem(_randomSecurityValue)` 再 `getJWTFromBackend(..., 'SystemToken')`。
- **效果**：未认证单请求直接拿 SystemToken 不再可能；同 IP 同时仅能有一笔待消费提交，正常引导先提交则攻击者无法占位；刷新后无未消费提交，可立即再次提交并签发，无影响。
- **多后端**：前端请求 RandomSecurity 的 URL 由 SystemInformation 统一管理（`getRandomSecurityPath` + `getOrigin` 或 `buildServiceUrl(RANDOM_SECURITY, …)`）；无 SystemInformation 时降级为默认 PHP + 当前页 origin，**不按端口推断**后端类型。见 `docs/INTERFACE/randomSecurity.md`。

## 补充防护（2026-03-16）：401 触发蓝屏

NetworkManager 在**每次**发出请求时：若该请求携带 JWT（SystemToken 或 UserToken），且响应状态码为 **401 Unauthorized**，则立即触发**系统级异常（蓝屏）**。同一会话内只触发一次。详见 `kernel/drive/networkManager.js`。

---

## 相关文件

- `system/service/randomSecurity.php`
- `system/service/backend-java/.../RandomSecurityController.java`
- `system/service/backend-java/.../JwtProperties.java`
- `kernel/core/safemode/randomSecurity.js` — 合法 SystemToken 请求方
- `kernel/drive/networkManager.js` — 401 触发系统异常（补充防护）

---

## 参考

- [CWE-306: Missing Authentication for Critical Function](https://cwe.mitre.org/data/definitions/306.html)
- [CWE-284: Improper Access Control](https://cwe.mitre.org/data/definitions/284.html)
