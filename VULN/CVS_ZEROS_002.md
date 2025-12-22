# CVS-ZEROS-002: MultithreadingDrive 任意代码执行漏洞

**漏洞编号**: CVS-ZEROS-002  
**发现日期**: 2025-12-23  
**修复日期**: 待修复  
**严重程度**: 严重 (CVSS 9.8)  
**CWE分类**: CWE-94 (代码注入)  
**状态**: 待修复

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

## 修复建议

1. **移除 eval 和 new Function**: 使用安全的脚本执行机制
2. **实现沙箱隔离**: 在 Worker 中限制可访问的全局对象
3. **添加权限检查**: 在执行任务前检查进程是否有 `MULTITHREADING_EXECUTE` 权限
4. **输入验证**: 验证脚本字符串格式，只允许预定义的安全函数
5. **使用 WebAssembly**: 考虑使用 WebAssembly 替代 JavaScript 执行

## 相关文件

- `kernel/drive/multithreadingDrive.js`
- `VULN/exploit-validator.js` (验证程序)

---

**修复状态**: ⚠️ 待修复

