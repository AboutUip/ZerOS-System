# CVS-ZEROS-003: 终端命令处理权限绕过漏洞

**漏洞编号**: CVS-ZEROS-003  
**发现日期**: 2025-12-23  
**修复日期**: 2025-12-23  
**严重程度**: 严重 (CVSS 8.5)  
**CWE分类**: CWE-284 (不恰当的访问控制)  
**状态**: 已修复

---

## 漏洞概述

终端程序的命令处理函数在执行系统命令（如 `login`、`su`、`power`、`kill`、`rm`、`mv`、`write` 等）时，没有检查当前用户的权限级别。普通用户可以通过终端执行管理员专用操作。

## 漏洞描述

终端程序 (`system/service/DISK/D/application/terminal/terminal.js`) 的命令处理函数 `commandHandler` 在执行敏感命令时缺少权限检查。

## 技术细节

### 漏洞位置

**文件**: `system/service/DISK/D/application/terminal/terminal.js`  
**受影响命令**:
- `login` / `su` - 切换用户（行号: 4631-4703）
- `power` - 电源管理（行号: 7071-7120）
- `kill` - 终止进程
- `rm` / `mv` / `write` - 文件操作
- `markdir` / `markfile` - 创建文件/目录
- 系统盘 D: 访问控制缺失

### 攻击场景

**场景1: 普通用户切换到root**
```bash
$ login root
已登录用户: root (默认管理员)
```

**场景2: 普通用户关闭系统**
```bash
$ power shutdown
System is shutting down...
```

**场景3: 普通用户访问系统盘D:**
```bash
$ cd D:
$ ls D:/system
```

## 修复方案

### 1. 命令权限检查

创建 `checkCommandPermission()` 函数，以下命令需要管理员权限：
- `power`, `kill`, `rm`, `mv`, `write`, `markdir`, `markfile`, `users`, `login`, `su`

### 2. 系统盘访问控制

创建 `checkSystemDiskAccess()` 函数，限制非管理员用户访问系统盘 D:。

在以下命令中添加检查：
- `cd`, `ls`, `cat`, `write`, `rm`, `mv`, `markdir`, `markfile`

## 修复验证

✅ 普通用户无法执行管理员专用命令  
✅ 普通用户无法访问系统盘 D:  
✅ 权限检查使用 `UserControl.isAdmin()` 验证  
✅ 错误信息清晰明确

## 相关文件

- `system/service/DISK/D/application/terminal/terminal.js`

---

**修复状态**: ✅ 已修复

