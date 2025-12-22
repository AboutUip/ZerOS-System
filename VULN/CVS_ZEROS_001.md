# CVS-ZEROS-001: ProcessManager/PermissionManager/UserControl 权限提升漏洞

**漏洞编号**: CVS-ZEROS-001  
**发现日期**: 2025-12-22  
**修复日期**: 2025-12-22  
**严重程度**: 严重 (CVSS 9.1)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-639 (授权绕过)  
**状态**: 已修复

---

## 漏洞概述

ZerOS 系统存在严重的权限绕过漏洞，普通用户可以通过修改进程表中的 `isExploit` 字段获取管理员权限，甚至直接免密码登录 root 账户。

## 漏洞描述

修复前的系统存在以下安全缺陷：

1. **ProcessManager.PROCESS_TABLE 可被直接修改**
2. **PermissionManager 权限检查依赖可被篡改的 isExploit 标志**
3. **UserControl 内部状态缺乏保护**

## 技术细节

### 漏洞点 1: ProcessManager.PROCESS_TABLE

**文件**: `kernel/process/processManager.js`  
**问题**: `PROCESS_TABLE` 直接返回可修改的 `Map` 对象

**攻击代码**:
```javascript
const processTable = ProcessManager.PROCESS_TABLE;
const processInfo = processTable.get(currentPid);
processInfo.isExploit = true; // 直接修改
processTable.set(currentPid, processInfo);
```

### 漏洞点 2: PermissionManager 权限检查

**文件**: `kernel/process/permissionManager.js`  
**问题**: 权限检查仅依赖 `isExploit` 标志，未验证 PID

**修复前代码**:
```javascript
static hasPermission(pid, permission) {
    const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
    if (processInfo?.isExploit) {
        return true; // 任意进程设置isExploit=true即可获取所有权限
    }
}
```

### 漏洞点 3: UserControl 状态保护缺失

**文件**: `kernel/core/usercontrol/userControl.js`  
**问题**: 内部状态可直接修改

**攻击代码**:
```javascript
UserControl._currentUser = 'root'; // 直接切换到root用户
```

## 修复方案

### 1. ProcessManager 修复

- 创建受保护的进程表（使用 Proxy）
- 创建受保护的进程信息（isExploit 字段仅 EXPLOIT_PID 可修改）
- 提供安全的 `updateProcessInfo()` 方法

### 2. PermissionManager 修复

- 严格的 PID 验证（仅 `pid === EXPLOIT_PID` 时授予所有权限）
- 检测并记录可疑的 isExploit 标志设置
- 实现三级权限体系（NORMAL/SPECIAL/DANGEROUS）

### 3. UserControl 修复

- 使用 Proxy 和 Object.defineProperty 保护内部状态
- 调用栈检查，仅允许特定方法修改状态
- 普通用户无法授权高风险权限

## 影响评估

- **权限提升**: 普通用户可获取管理员权限
- **系统控制**: 可完全控制系统
- **数据泄露**: 可访问所有系统数据

## 修复验证

✅ 普通用户无法修改进程表  
✅ 无法通过修改 isExploit 字段获取权限  
✅ 无法直接修改用户状态  
✅ login 方法需要正确密码

## 相关文件

- `kernel/process/processManager.js`
- `kernel/process/permissionManager.js`
- `kernel/core/usercontrol/userControl.js`

---

**修复状态**: ✅ 已修复

