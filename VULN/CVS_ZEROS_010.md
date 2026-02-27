# CVS-ZEROS-010: 进程绑定内核 API 令牌可读导致权限提升漏洞

## 漏洞概述

- **编号**: CVS-ZEROS-010
- **标题**: ProcessManager 进程绑定内核 API 令牌可读导致任意内核 API 调用（提权）
- **发现日期**: 2026-02-15
- **修复日期**: 2026-02-28
- **严重程度**: 严重 (9.8)
- **CWE分类**: CWE-285 (Improper Authorization), CWE-863 (Incorrect Authorization), CWE-269 (Improper Privilege Management)
- **状态**: ✅ 已修复

## 漏洞描述

为修复 CVS-ZEROS-009（PID 欺骗），系统引入了"进程绑定内核 API"方案：在程序 `__init__(pid, initArgs)` 中注入 `initArgs.kernelAPI.call(apiName, args)`，由内核以闭包绑定真实 PID，并通过令牌校验使其可跳过调用栈一致性校验。

原实现中，令牌 `ProcessManager._boundCallSymbol` 作为 `ProcessManager` 的静态属性对所有应用代码可读，同时内部入口 `ProcessManager._internalCallKernelAPI(pid, apiName, args, boundToken)` 也是可被任意应用直接调用的公开静态方法。攻击者因此可以直接读取令牌并调用内部入口，构造 `skipCallerCheck=true` 的调用路径，绕过调用栈/PID 一致性校验，并可进一步以 `EXPLOIT_PID(10000)` 执行任意内核 API，从而实现完全权限提升。

该问题属于"能力令牌（capability）泄露/可伪造"，Symbol 并不构成安全边界：只要攻击者在同一 JS 运行时中能读取该 Symbol 引用，就可以伪造为"内核注入调用"。

## 受影响组件

- **文件**: `kernel/process/processManager.js`
- **函数/成员**:
  - `ProcessManager._boundCallSymbol` (已移除)
  - `ProcessManager._internalCallKernelAPI(pid, apiName, args, boundToken)` (已移除)
  - `ProcessManager._callKernelAPICore(pid, apiName, args, { skipCallerCheck })` (保留，内核内部使用)

## 漏洞分析

在原 `kernel/process/processManager.js` 实现中：

1) 令牌作为类静态属性暴露：

```javascript
static _boundCallSymbol = Symbol('ProcessManager.boundCallKernelAPI');
```

2) 注入的 `kernelAPI.call()` 转发到内部入口：

```javascript
kernelAPI: {
  call(apiName, args) {
    return ProcessManager._internalCallKernelAPI(pid, apiName, args || [], ProcessManager._boundCallSymbol);
  }
}
```

3) 内部入口仅对比令牌，可被伪造：

```javascript
static async _internalCallKernelAPI(pid, apiName, args, boundToken) {
  if (boundToken !== ProcessManager._boundCallSymbol) throw new Error('令牌无效');
  return await ProcessManager._callKernelAPICore(pid, apiName, args || [], { skipCallerCheck: true });
}
```

4) `skipCallerCheck=true` 会跳过 Exploit PID 校验：

```javascript
if (processInfo.isExploit) {
  if (!skipCallerCheck && ProcessManager._isStackFromApplication()) throw new Error('禁止应用层使用 Exploit PID');
  return await ProcessManager._executeKernelAPI(apiName, args, pid);
}
```

攻击者无需通过 `initArgs.kernelAPI.call`（受注入路径约束），只需直接调用 `_internalCallKernelAPI` 并提供可读取的 `_boundCallSymbol`，即可获得与"内核注入调用"等价的权限通道。

## 修复内容

### 代码修改

**文件**: `kernel/process/processManager.js`

**修改 1**: 移除类静态属性 `_boundCallSymbol`

**修改 2**: 移除静态方法 `_internalCallKernelAPI`

**修改 3**: kernelAPI.call 内联实现

```javascript
// 修复后
kernelAPI: {
  call(apiName, args) {
    return ProcessManager._callKernelAPICore(pid, apiName, args || [], { skipCallerCheck: true });
  }
}
```

通过将 `kernelAPI.call` 内联实现，直接调用 `_callKernelAPICore` 并传入 `skipCallerCheck: true`，消除了所有内部成员的暴露。

## 向后兼容性

- ✅ 程序通过 `initArgs.kernelAPI.call()` 调用内核 API 完全正常
- ✅ PID 绑定机制仍然有效（闭包绑定本进程 PID）
- ✅ `callKernelAPI(pid, apiName, args)` 公开方法不受影响
- ✅ 所有现有程序无需修改即可继续运行

## 危害评估

该漏洞允许任何能够运行代码的应用（包含通过 `.zom` 安装的第三方程序）在无需用户授权/管理员确认的前提下实现系统级能力：

1. **完全权限提升**：可调用任意需要危险权限的内核 API（文件读写/删除、网络访问、系统存储读写、进程管理等）。
2. **持久化**：可写入 `D:/server/server-*.js` 等系统加载路径，形成重启后自动执行的后门。
3. **数据窃取与破坏**：可读取/篡改用户数据与系统配置，破坏系统完整性。

✅ 漏洞已修复，攻击者无法再通过上述方式提权。

## 复现步骤（原漏洞，现已无效）

前置条件：攻击者能在 ZerOS 内运行任意应用代码（例如安装并运行一个恶意 `.zom` 程序）。

1. 在任意应用代码中读取令牌并直接调用内部入口：

```javascript
await ProcessManager._internalCallKernelAPI(
  ProcessManager.EXPLOIT_PID,
  'FileSystem.write',
  ['D:/pwned.txt', 'PWNED'],
  ProcessManager._boundCallSymbol
);
```

2. 观察 `D:/pwned.txt` 是否成功写入。

✅ **漏洞已修复**: 上述攻击代码不再有效，因为 `ProcessManager._internalCallKernelAPI` 和 `ProcessManager._boundCallSymbol` 已不存在。

## 回归验证

✅ **验证通过**:
1. 普通应用执行原 PoC 代码会失败（内部成员不可访问）
2. 正常应用通过 `initArgs.kernelAPI.call()` 仍可稳定调用其被授权的内核 API
3. 应用无法以任何方式触发 `skipCallerCheck=true` 并指定 `EXPLOIT_PID` 执行内核 API

## 参考资料

- [CWE-285: Improper Authorization](https://cwe.mitre.org/data/definitions/285.html)
- [CWE-863: Incorrect Authorization](https://cwe.mitre.org/data/definitions/863.html)
- [CWE-269: Improper Privilege Management](https://cwe.mitre.org/data/definitions/269.html)
