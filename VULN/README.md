# ZerOS 安全漏洞报告

本目录包含 ZerOS 系统的所有安全漏洞报告，使用统一的 CVS-ZEROS 编号格式。

---

## 漏洞统计

- **总计**: 14 个漏洞/测试程序
- **已修复**: 11 个
- **待修复**: 2 个
- **安全测试程序**: 1 个
- **严重漏洞**: 9 个
- **高/中高危漏洞**: 2 个
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

### 待修复漏洞

| 编号 | 漏洞名称 | 严重程度 | 发现日期 | 说明 |
|------|---------|---------|---------|------|
| [CVS-ZEROS-011](CVS_ZEROS_011.md) | 密码使用弱哈希算法漏洞 | 低危 (3.5) | 2026-03-09 | 变体 MD5 无法使用标准彩虹表，需1年以上建立新彩虹表 |
| [CVS-ZEROS-013](CVS_ZEROS_013.md) | LStorage 未将 userControl.currentUser 列为危险键 | 中高 (5.5) | 2026-03-09 | 任意 SYSTEM_STORAGE_WRITE 程序可写当前用户键，导致权限伪造/持久化 |

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

### P1 - 高优先级（已完成）
- [CVS-ZEROS-001](CVS_ZEROS_001.md): 权限提升漏洞
- [CVS-ZEROS-003](CVS_ZEROS_003.md): 终端命令权限绕过漏洞
- [CVS-ZEROS-005](CVS_ZEROS_005.md): LStorage 系统存储写入权限检查缺失漏洞
- [CVS-ZEROS-006](CVS_ZEROS_006.md): LStorage 内核模块调用验证绕过与 UserControl Proxy 保护机制绕过漏洞

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
6. **定期安全审计**: 建议每季度进行一次全面的安全审计
7. **代码审查**: 对所有涉及用户输入和权限检查的代码进行审查
8. **安全测试**: 在发布新版本前进行渗透测试
9. **最小权限原则**: 所有操作都应该检查用户权限
10. **输入验证**: 对所有用户输入进行严格验证
11. **沙箱隔离**: 对不可信代码执行环境进行隔离
12. **安全审计日志**: 记录所有敏感操作的审计日志

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
| 权限伪造 | CVS-ZEROS-013 | LStorage 未保护 userControl.currentUser 写入，可伪造持久化“当前用户” |
| **程序提权** | **CVS-ZEROS-014** | **✅ 已修复：后端 register 仅接收前端实际授予的权限（getGrantedPermissions），不再信任 __info__.permissions** |
| 程序/注入提权 | 见 CVS-ZEROS-001/009/010 | 已修复的进程表/PID/令牌相关提权 |

---

**最后更新**: 2026-03-09  
**维护者**: ZerOS 安全团队
