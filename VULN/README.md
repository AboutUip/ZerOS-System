# ZerOS 安全漏洞报告

本目录包含 ZerOS 系统的所有安全漏洞报告，使用统一的 CVS-ZEROS 编号格式。

---

## 漏洞统计

- **总计**: 26 个漏洞/测试程序
- **已修复**: 17 个
- **待修复**: 8 个
- **安全测试程序**: 1 个
- **严重漏洞**: 16 个
- **高/中高危漏洞**: 5 个
- **低危漏洞**: 1 个

---

## 漏洞列表

### 已修复漏洞

| 编号 | 漏洞名称 | 严重程度 | 发现日期 | 修复日期 |
|------|---------|---------|---------|---------|
| [CVS-ZEROS-001](CVS_ZEROS_001.md) | ProcessManager/PermissionManager/UserControl 权限提升漏洞 | 严重 (9.1) | 2025-12-22 | 2025-12-22 |
| [CVS-ZEROS-003](CVS_ZEROS_003.md) | 终端命令处理权限绕过漏洞 | 严重 (8.5) | 2025-12-23 | 2025-12-23 |
| [CVS-ZEROS-004](CVS_ZEROS_004.md) | ProcessManager PID分配可预测性漏洞 | 中等 (5.3) | 2025-12-23 | 2025-12-23 |
| [CVS-ZEROS-005](CVS_ZEROS_005.md) | LStorage 系统存储写入权限检查缺失漏洞 | 严重 (8.8) | 2025-12-23 | 2025-12-23 |
| [CVS-ZEROS-006](CVS_ZEROS_006.md) | LStorage 内核模块调用验证绕过与 UserControl Proxy 保护机制绕过漏洞 | 严重 (8.5) | 2025-12-24 | 2025-12-24 |
| [CVS-ZEROS-002](CVS_ZEROS_002.md) | MultithreadingDrive 任意代码执行漏洞 | 严重 (9.8) | 2025-12-23 | 2025-12-24 |
| [CVS-ZEROS-009](CVS_ZEROS_009.md) | ProcessManager 内核 API 调用 PID 欺骗导致权限提升 | 严重 (9.3) | 2026-02-06 | 2026-02-06 |
| [CVS-ZEROS-008](CVS_ZEROS_008.md) | FSDirve 未授权远程文件操作漏洞 | 严重 (9.1) | 2026-01-06 | 2026-02-18 |
| [CVS-ZEROS-010](CVS_ZEROS_010.md) | 进程绑定内核 API 令牌可读导致权限提升漏洞 | 严重 (9.8) | 2026-02-15 | 2026-02-28 |
| [CVS-ZEROS-012](CVS_ZEROS_012.md) | FSDirve 未限制敏感文件写入导致用户提权 | 严重 (9.0) | 2026-03-09 | 2026-03-09 |
| [CVS-ZEROS-014](CVS_ZEROS_014.md) | 程序权限注册后端信任前端声明导致程序提权 | 高 (8.1) | 2026-03-09 | 2026-03-09 |
| [CVS-ZEROS-013](CVS_ZEROS_013.md) | LStorage 未将 userControl.currentUser 列为危险键 | 中高 (5.5) | 2026-03-09 | 2026-03-16 |
| [CVS-ZEROS-015](CVS_ZEROS_015.md) | FSDirve rename/move/copy/delete 未限制 D 根敏感文件名导致 012 被绕过 | 严重 (9.0) | 2026-03-15 | 2026-03-16 |
| [CVS-ZEROS-016](CVS_ZEROS_016.md) | RandomSecurity 未校验来源即签发 SystemToken | 严重 (9.8) | 2026-03-15 | 2026-03-16 |
| [CVS-ZEROS-017](CVS_ZEROS_017.md) | RandomSecurity 信任客户端声明 UserToken 权限导致权限伪造 | 严重 (9.8) | 2026-05-04 | 2026-05-06 |
| [CVS-ZEROS-018](CVS_ZEROS_018.md) | FSDirve 文件名参数未校验导致路径穿越 | 严重 (9.1) | 2026-05-04 | 2026-05-06 |
| [CVS-ZEROS-023](CVS_ZEROS_023.md) | Cache API 命名空间可控导致锁屏缓存投毒与系统上下文提权 | 严重 (9.0) | 2026-05-04 | 2026-07-21 |

### 待修复漏洞

| 编号 | 漏洞名称 | 严重程度 | 发现日期 | 说明 |
|------|---------|---------|---------|------|
| [CVS-ZEROS-011](CVS_ZEROS_011.md) | 密码使用弱哈希算法漏洞 | 低危 (3.5) | 2026-03-09 | 变体 MD5 无法使用标准彩虹表，需1年以上建立新彩虹表 |
| [CVS-ZEROS-019](CVS_ZEROS_019.md) | 多个开放代理接口缺少目标限制导致 SSRF | 高 (8.8) | 2026-05-04 | Browser/Audio/Video/Image 代理可访问内网目标且关闭 TLS 校验 |
| [CVS-ZEROS-020](CVS_ZEROS_020.md) | NetworkDirve 未接入服务级权限映射导致网络能力越权 | 高 (8.1) | 2026-05-04 | UserToken 只需携带 upid 即可调用端口监听和 TCP 发送能力 |
| [CVS-ZEROS-021](CVS_ZEROS_021.md) | RandomSecurity commit_for_system 无认证导致 SystemToken 仍可被未认证获取 | 严重 (9.8) | 2026-05-04 | 016 修复不完整，攻击者两步请求仍可获得 SystemToken |
| [CVS-ZEROS-022](CVS_ZEROS_022.md) | D/server 服务脚本可写入并自动加载导致持久化提权 | 严重 (9.0) | 2026-05-04 | KERNEL_DISK_WRITE 可写入自加载服务脚本并借 SERVER_SERVICE_PID 获得内核权限 |
| [CVS-ZEROS-024](CVS_ZEROS_024.md) | 终端 tempAsset 程序名冲突导致缓存命名空间劫持 | 高 (7.7) | 2026-07-27 | tempAsset 加载同名文件获得系统程序缓存空间读写权 |
| [CVS-ZEROS-025](CVS_ZEROS_025.md) | POOL.__ADD__ 零访问控制导致内核模块全局劫持 | 严重 (9.3) | 2026-07-27 | 任意代码可覆盖 KERNEL_GLOBAL_POOL 中全部 50+ 内核模块 |
| [CVS-ZEROS-026](CVS_ZEROS_026.md) | 完整攻击链: 浏览器沙箱→宿主机Shell→内网横向 | 严重 (9.8) | 2026-07-27 | 023+024+025+NetworkManager 组合链实现宿主机完全控制 |

### 安全测试程序

| 编号 | 程序名称 | 类型 | 创建日期 | 说明 |
|------|---------|------|---------|------|
| [CVS-ZEROS-007](CVS_ZEROS_007.md) | 勒索病毒模拟程序 | 安全测试 | 2025-12-24 | 用于测试系统安全防护能力的勒索病毒模拟程序 |

---

## 漏洞报告格式

所有漏洞报告遵循以下统一格式：

- **编号**: CVS-ZEROS-XXX
- **标题**: 漏洞名称
- **发现日期**: YYYY-MM-DD
- **修复日期**: YYYY-MM-DD 或 "待修复"
- **严重程度**: 严重/中等/低 (CVSS 评分)
- **CWE分类**: CWE-XXX
- **状态**: 已修复/待修复

---

## 修复优先级

### P0 - 立即修复（已完成）

- [CVS-ZEROS-002](CVS_ZEROS_002.md): MultithreadingDrive 任意代码执行漏洞 ✅ (已完成)
- [CVS-ZEROS-008](CVS_ZEROS_008.md): FSDirve 未授权远程文件操作漏洞 ✅ (已完成)
- [CVS-ZEROS-009](CVS_ZEROS_009.md): ProcessManager 内核 API 调用 PID 欺骗导致权限提升 ✅ (已完成)
- [CVS-ZEROS-010](CVS_ZEROS_010.md): 进程绑定内核 API 令牌可读导致权限提升漏洞 ✅ (已完成)
- [CVS-ZEROS-017](CVS_ZEROS_017.md): RandomSecurity 信任客户端声明 UserToken 权限导致权限伪造 ✅ (已完成)
- [CVS-ZEROS-018](CVS_ZEROS_018.md): FSDirve 文件名参数未校验导致路径穿越 ✅ (已完成)
- [CVS-ZEROS-023](CVS_ZEROS_023.md): Cache API 命名空间可控导致锁屏缓存投毒与系统上下文提权 ✅ (已完成)

### P0 - 立即修复（待处理）

- [CVS-ZEROS-021](CVS_ZEROS_021.md): RandomSecurity commit_for_system 无认证导致 SystemToken 仍可被未认证获取
- [CVS-ZEROS-022](CVS_ZEROS_022.md): D/server 服务脚本可写入并自动加载导致持久化提权
- [CVS-ZEROS-024](CVS_ZEROS_024.md): 终端 tempAsset 程序名冲突导致缓存命名空间劫持
- [CVS-ZEROS-025](CVS_ZEROS_025.md): POOL.__ADD__ 零访问控制导致内核模块全局劫持
- [CVS-ZEROS-026](CVS_ZEROS_026.md): 完整攻击链: 浏览器沙箱→宿主机Shell→内网横向移动

### P1 - 高优先级（已完成）
- [CVS-ZEROS-001](CVS_ZEROS_001.md): 权限提升漏洞
- [CVS-ZEROS-003](CVS_ZEROS_003.md): 终端命令权限绕过漏洞
- [CVS-ZEROS-005](CVS_ZEROS_005.md): LStorage 系统存储写入权限检查缺失漏洞
- [CVS-ZEROS-006](CVS_ZEROS_006.md): LStorage 内核模块调用验证绕过与 UserControl Proxy 保护机制绕过漏洞

### P1 - 高优先级（待处理）

- [CVS-ZEROS-019](CVS_ZEROS_019.md): 多个开放代理接口缺少目标限制导致 SSRF
- [CVS-ZEROS-020](CVS_ZEROS_020.md): NetworkDirve 未接入服务级权限映射导致网络能力越权

### P2 - 中优先级（已完成）
- [CVS-ZEROS-004](CVS_ZEROS_004.md): PID分配可预测性漏洞

---

## 提交漏洞

- 感谢匿名漏洞提交者,如果存在发现漏洞,欢迎发送邮件到hacker200714@outlook.com

---

## 安全建议

1. ✅ **CVS-ZEROS-002 已修复**: MultithreadingDrive 任意代码执行漏洞已修复，已添加权限检查、沙箱隔离和输入验证
2. ✅ **CVS-ZEROS-008 已修复**: FSDirve 未授权远程文件操作漏洞已修复，已集成 JWT 校验与 upid 权限映射（jwtVerify.php）
3. ✅ **CVS-ZEROS-009 已修复**: ProcessManager PID 欺骗漏洞已修复，已增加调用栈与 PID 一致性校验、Exploit PID 严格校验及进程绑定 API（initArgs.kernelAPI）
4. ✅ **CVS-ZEROS-010 已修复**: 进程绑定内核 API 令牌可读导致权限提升漏洞已修复，已移除暴露的 `_boundCallSymbol` 和 `_internalCallKernelAPI`，将 kernelAPI.call 内联实现消除内部入口暴露
5. ✅ **CVS-ZEROS-012 已修复**: FSDirve 敏感文件写入导致用户提权已修复，对 UserToken 收紧 D 盘根目录下系统关键文件（LocalSData.json、ApplicationTable.json 等）的写入，仅 SystemToken 可写；LStorage/Regedit 等通过内核路径注入 SystemToken，不受影响
6. ✅ **CVS-ZEROS-013 已修复**: LStorage 未将 userControl.currentUser 列为危险键已修复，已将该键列入 DANGEROUS_KEYS、要求 SYSTEM_STORAGE_WRITE_USER_CONTROL，并仅允许 UserControl 模块通过调用栈校验写入
7. ✅ **CVS-ZEROS-015 已修复**: FSDirve rename/move/copy/delete 未限制 D 根敏感文件名已修复，对 D 根敏感名单（与 012 一致）在 rename/move/copy/delete 时施加 UserToken 403，禁止“写非敏感名+重命名”绕过
8. ✅ **CVS-ZEROS-016 已修复**: RandomSecurity 未校验即签发 SystemToken 已修复，后端要求先通过 action=commit_for_system 提交 randomValue（每 IP 仅一笔未消费），再签发 SystemToken；401 触发蓝屏补充防护保留
9. ✅ **CVS-ZEROS-017 已修复**: UserToken 由 `randomSecurity.php` 根据 `LocalSData.json` 与 username/password 签发 userLevel/permissions；`programPermissions.php` 仅允许 SystemToken；前端 `randomSecurity.js` / `lockscreen.js` 已对齐
10. ✅ **CVS-ZEROS-018 已修复**: FSDirve 已统一 `fsDirveJoinUnderDir` 拼接，并以 `realpath` + 分区根断言（`fsDirveAssertWithinPartitionRoot`）约束最终物理路径，防止 `../` 穿越；012/015 敏感文件判定结合解析后真实路径
11. ⚠️ **CVS-ZEROS-019 待修复**: 代理接口应增加鉴权、目标域名白名单、私网 IP 禁止、重定向后复验并开启 TLS 校验
12. ⚠️ **CVS-ZEROS-020 待修复**: NetworkDirve 应加入 jwtVerify 服务级权限映射，并将端口资源绑定到创建者 upid
13. ⚠️ **CVS-ZEROS-021 待修复**: commit_for_system 不能作为 SystemToken 签发凭据，应改为服务端可信引导 secret 或彻底移除公开签发
14. ⚠️ **CVS-ZEROS-022 待修复**: D/server 应作为系统关键执行目录，禁止 UserToken 写入并要求服务签名/白名单
15. ✅ **CVS-ZEROS-023 已修复**: Cache API 已将命名空间绑定到真实调用者 PID；锁屏每日一言已改用 textContent 渲染
16. **定期安全审计**: 建议每季度进行一次全面的安全审计

17. **代码审查**: 对所有涉及用户输入和权限检查的代码进行审查
18. **安全测试**: 在发布新版本前进行渗透测试
19. **最小权限原则**: 所有操作都应该检查用户权限
20. **输入验证**: 对所有用户输入进行严格验证
21. **沙箱隔离**: 对不可信代码执行环境进行隔离
22. **安全审计日志**: 记录所有敏感操作的审计日志

---

## 安全测试程序

### CVS-ZEROS-007: 勒索病毒模拟程序

这是一个用于测试 ZerOS 系统安全防护能力的勒索病毒模拟程序。该程序模拟真实的勒索病毒攻击行为，包括：

- 修改桌面壁纸为勒索壁纸
- 重复发出噪音干扰
- 创建无法关闭的GUI窗口
- 在桌面创建大量快捷方式填充桌面
- 尝试破坏系统数据
- 发送大量通知干扰用户

**⚠️ 重要提示**:
- 此程序**仅管理员可以运行**（普通用户无法启动）
- 启动前会显示警告对话框（使用 GUIManager API），要求用户明确确认
- **所有退出快捷键已被禁用**（Ctrl+E, Ctrl+Q, Ctrl+W, Alt+F4）
- 只能通过**强制终止进程**或**刷新页面**退出程序
- 此程序仅用于 ZerOS 系统安全测试，请勿在真实环境中使用

**相关文档**: [CVS-ZEROS-007](CVS_ZEROS_007.md)

---

---

## 提权类漏洞摘要（2026-03-09 审计）

| 类型 | 编号 | 简述 |
|------|------|------|
| 用户提权 | CVS-ZEROS-012 | ✅ 已修复：UserToken 禁止写 D 盘根敏感文件，仅 SystemToken 放行 |
| 用户提权（012 绕过） | CVS-ZEROS-015 | ✅ 已修复：rename/move/copy/delete 在 D 根涉及敏感文件名时对 UserToken 返回 403 |
| 系统令牌未校验 | CVS-ZEROS-016 | ✅ 已修复：SystemToken 须先 commit_for_system 提交 randomValue（每 IP 一笔未消费），再签发 |
| 权限伪造 | CVS-ZEROS-013 | ✅ 已修复：userControl.currentUser 列入危险键并仅允许 UserControl 模块写入 |
| **程序提权** | **CVS-ZEROS-014** | **✅ 已修复：后端 register 仅接收前端实际授予的权限（getGrantedPermissions），不再信任 __info__.permissions** |
| UserToken 权限伪造 | CVS-ZEROS-017 | ✅ 已修复：服务端校验密码后写入 claims；programPermissions 仅 SystemToken；`type=UserToken` 大小写不敏感均走同一认证分支 |
| 文件路径穿越 | CVS-ZEROS-018 | ✅ 已修复：`fsDirveJoinUnderDir` + 分区根 `realpath` 断言，文件名穿越无法越出 `DISK/{Letter}` |
| SSRF | CVS-ZEROS-019 | ⚠️ 待修复：多个代理接口缺少目标限制并关闭 TLS 校验 |
| 网络能力越权 | CVS-ZEROS-020 | ⚠️ 待修复：NetworkDirve 未接入服务级权限映射 |
| SystemToken 签发绕过 | CVS-ZEROS-021 | ⚠️ 待修复：commit_for_system 无认证，攻击者两步请求仍可获得 SystemToken |
| 持久化服务提权 | CVS-ZEROS-022 | ⚠️ 待修复：D/server 可写服务脚本会被自动加载并借 SERVER_SERVICE_PID 全权限执行 |
| 缓存投毒提权 | CVS-ZEROS-023 | ✅ 已修复：Cache API 命名空间绑定真实调用者 PID；锁屏每日一言改用 textContent 渲染 |
| 缓存命名空间劫持 | CVS-ZEROS-024 | ⚠️ 待修复：终端 tempAsset 程序名取自文件名，同名文件可冒充系统程序缓存命名空间 |
| POOL 零访问控制 | CVS-ZEROS-025 | ⚠️ 待修复：POOL.__ADD__ 无任何访问控制，任意代码可覆盖 KERNEL_GLOBAL_POOL 内核模块 |
| 全攻击链: 浏览器→宿主机 | CVS-ZEROS-026 | ⚠️ 待修复：023+024+025 + NetworkManager 0.0.0.0 端口 + D/server 自动加载 + proc_open 实现宿主机完全控制 |
| 程序/注入提权 | 见 CVS-ZEROS-001/009/010 | 已修复的进程表/PID/令牌相关提权 |

---

**最后更新**: 2026-07-27  
**维护者**: ZerOS 安全团队
