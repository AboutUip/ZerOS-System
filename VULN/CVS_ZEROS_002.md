# CVS-ZEROS-002: MultithreadingDrive 任意代码执行漏洞

**漏洞编号**: CVS-ZEROS-002  
**发现日期**: 2025-12-23  
**修复日期**: 2025-12-24  
**严重程度**: 严重 (CVSS 9.8)  
**CWE分类**: CWE-94 (代码注入)  
**状态**: 已修复

---

## 漏洞概述

`MultithreadingDrive.createThread()` 方法使用 `eval()` 和 `new Function()` 直接执行用户提供的脚本字符串，没有任何输入验证、沙箱隔离或权限检查，允许攻击者执行任意 JavaScript 代码。

## 漏洞描述

`kernel/drive/multithreadingDrive.js` 中的 `createThread` 方法在 Worker 线程中直接执行用户提供的脚本字符串，完全绕过系统的权限控制机制。

## 技术细节

### 漏洞位置

**文件**: `kernel/drive/multithreadingDrive.js`  
**行号**: 158, 162

**漏洞代码**:
```javascript
func = eval('(' + script + ')');
// 或
func = new Function('return ' + script)();
```

### 攻击场景

**场景1: 权限提升**
```javascript
const threadId = MultithreadingDrive.createThread(this.pid);
const maliciousScript = `(function() {
    const ProcessManager = window.ProcessManager;
    // 尝试修改进程表或访问敏感数据
    return 'exploit executed';
})()`;
MultithreadingDrive.executeTask(threadId, maliciousScript, []);
```

**场景2: 系统破坏**
```javascript
const maliciousScript = `(function() {
    const ProcessManager = window.ProcessManager;
    // 终止所有进程
    for (const [pid] of ProcessManager.PROCESS_TABLE) {
        ProcessManager.killProgram(pid, true);
    }
    return 'system destroyed';
})()`;
```

## 影响评估

- **任意代码执行**: 完全绕过权限系统
- **权限提升**: 可获取系统最高权限
- **数据泄露**: 可访问系统内存中的敏感数据
- **系统破坏**: 可终止进程、清空存储
- **持久化攻击**: 可修改系统配置，建立后门

## 修复方案

已实施以下安全措施：

1. **移除 eval**: 完全移除 `eval()` 调用，只使用 `Function` 构造函数
2. **实现沙箱隔离**: 在 Worker 中创建受限的全局对象环境，只允许访问安全的基础对象（Math, Date, JSON, Array 等）
3. **添加权限检查**: 
   - `createThread()` 检查 `MULTITHREADING_CREATE` 权限
   - `executeTask()` 检查 `MULTITHREADING_EXECUTE` 权限
4. **输入验证**: 
   - 验证脚本格式（必须是函数表达式或函数声明）
   - 检测并拒绝危险代码模式（eval, Function, setTimeout, fetch, Worker 等）
5. **错误信息限制**: 限制错误信息长度，不传递堆栈信息，避免泄露敏感信息

## 修复详情

### 1. 权限检查
- `createThread()` 在执行前检查 `MULTITHREADING_CREATE` 权限
- `executeTask()` 在执行前检查 `MULTITHREADING_EXECUTE` 权限
- 权限检查通过 `PermissionManager` 进行，确保只有授权程序可以使用多线程功能

### 2. 沙箱隔离
- 创建受限的全局对象环境，只包含安全的基础对象
- 使用 `Function` 构造函数时，将沙箱对象作为参数传入，限制作用域
- 在严格模式（'use strict'）下执行，进一步限制危险操作

### 3. 输入验证
- `_validateScriptSafety()` 方法检测危险代码模式
- 验证脚本格式，确保是函数表达式或函数声明
- 拒绝包含 eval, Function, setTimeout, fetch, Worker 等危险 API 的脚本

### 4. 安全改进
- 完全移除 `eval()` 调用
- 限制错误信息，避免泄露敏感信息
- 在 Worker 环境中禁用 console 输出

## 相关文件

- `kernel/drive/multithreadingDrive.js` (已修复)
- `VULN/exploit-validator.js` (验证程序)

---

**修复状态**: ✅ 已修复 (2025-12-24)

