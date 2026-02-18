# CVS-ZEROS-010: 进程绑定内核 API 令牌可读导致权限提升漏洞

## 漏洞概述

- **编号**: CVS-ZEROS-010
- **标题**: ProcessManager 进程绑定内核 API 令牌可读导致任意内核 API 调用（提权）
- **发现日期**: 2026-02-15
- **修复日期**: 未修复
- **严重程度**: 严重 (9.8)
- **CWE分类**: CWE-285 (Improper Authorization), CWE-863 (Incorrect Authorization), CWE-269 (Improper Privilege Management)
- **状态**: 未修复

## 漏洞描述

为修复 CVS-ZEROS-009（PID 欺骗），系统引入了“进程绑定内核 API”方案：在程序 `__init__(pid, initArgs)` 中注入 `initArgs.kernelAPI.call(apiName, args)`，由内核以闭包绑定真实 PID，并通过令牌校验使其可跳过调用栈一致性校验。

但当前实现中，令牌 `ProcessManager._boundCallSymbol` 作为 `ProcessManager` 的静态属性对所有应用代码可读，同时内部入口 `ProcessManager._internalCallKernelAPI(pid, apiName, args, boundToken)` 也是可被任意应用直接调用的公开静态方法。攻击者因此可以直接读取令牌并调用内部入口，构造 `skipCallerCheck=true` 的调用路径，绕过调用栈/PID 一致性校验，并可进一步以 `EXPLOIT_PID(10000)` 执行任意内核 API，从而实现完全权限提升。

该问题属于“能力令牌（capability）泄露/可伪造”，Symbol 并不构成安全边界：只要攻击者在同一 JS 运行时中能读取该 Symbol 引用，就可以伪造为“内核注入调用”。

## 受影响组件

- **文件**: `d:\Project\Algorithm\ZerOS\kernel\process\processManager.js`
- **函数/成员**:
  - `ProcessManager._boundCallSymbol`
  - `ProcessManager._internalCallKernelAPI(pid, apiName, args, boundToken)`
  - `ProcessManager._callKernelAPICore(pid, apiName, args, { skipCallerCheck })`

## 漏洞分析

在 `kernel/process/processManager.js` 中：

1) 令牌对应用代码可见：

```javascript
static _boundCallSymbol = Symbol('ProcessManager.boundCallKernelAPI');
```

2) 注入的 `kernelAPI.call()` 实际只是“读取同一个静态令牌并转发到内部入口”：

```javascript
kernelAPI: {
  call(apiName, args) {
    return ProcessManager._internalCallKernelAPI(pid, apiName, args || [], ProcessManager._boundCallSymbol);
  }
}
```

3) 内部入口仅对比 `boundToken === ProcessManager._boundCallSymbol`，可被任意应用伪造满足：

```javascript
static async _internalCallKernelAPI(pid, apiName, args, boundToken) {
  if (boundToken !== ProcessManager._boundCallSymbol) throw new Error('令牌无效');
  return await ProcessManager._callKernelAPICore(pid, apiName, args || [], { skipCallerCheck: true });
}
```

4) 一旦 `skipCallerCheck=true`，调用栈/PID 一致性校验会被跳过，且对 Exploit 分支不再触发“应用栈禁止使用 EXPLOIT_PID”的限制，从而可直接以 `EXPLOIT_PID(10000)` 执行内核 API：

```javascript
if (processInfo.isExploit) {
  if (!skipCallerCheck && ProcessManager._isStackFromApplication()) throw new Error('禁止应用层使用 Exploit PID');
  return await ProcessManager._executeKernelAPI(apiName, args, pid);
}
```

综合以上，攻击者不需要通过 `initArgs.kernelAPI.call`（受注入路径约束），只需直接调用 `_internalCallKernelAPI` 并提供可读取的 `_boundCallSymbol`，即可获得与“内核注入调用”等价的权限通道。

## 危害评估

该漏洞允许任何能够运行代码的应用（包含通过 `.zom` 安装的第三方程序）在无需用户授权/管理员确认的前提下实现系统级能力：

1. **完全权限提升**：可调用任意需要危险权限的内核 API（文件读写/删除、网络访问、系统存储读写、进程管理等）。
2. **持久化**：可写入 `D:/server/server-*.js` 等系统加载路径，形成重启后自动执行的后门（取决于系统服务加载逻辑）。
3. **数据窃取与破坏**：可读取/篡改用户数据与系统配置，破坏系统完整性。

## 复现步骤（最小 PoC）

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

2. 观察 `D:/pwned.txt` 是否成功写入。若成功，则证明应用可绕过权限体系并以 Exploit PID 执行内核 API。

说明：上述仅示例文件写入。攻击者同理可替换为 `FileSystem.delete`、`Storage.write`、`Application.install` 等高风险 API 以扩大影响。

## 修复建议

1. **将令牌从可读全局静态属性中移除**  
   - 不要把“能力令牌”存放在 `ProcessManager` 可被应用直接访问的成员上。
   - Symbol 不是秘密；可读即等价于可伪造。

2. **将内部入口从公开可调用面隐藏**  
   - 将 `_internalCallKernelAPI` 改为模块私有函数（IIFE/ESM 模块作用域），不暴露在全局对象上。
   - 或使用真正的语言级私有字段/私有方法并确保外部不可触达（同时避免通过公开方法间接提供等价能力）。

3. **把“跳过调用者校验”的权能与 PID 强绑定且不可外部选择**  
   - `skipCallerCheck=true` 只能由内核内部流程触发，且 PID 必须固定为当前进程 PID（由闭包绑定），不得允许调用者传入任意 pid（尤其是 `EXPLOIT_PID`）。

4. **增加纵深防御**  
   - 对 `EXPLOIT_PID(10000)` 增加额外限制：即使 `skipCallerCheck=true`，也要求调用源来自受信任系统模块域，或要求更强的内核上下文证明。

## 回归验证建议

1. 构造一个普通应用（无 `KERNEL_DISK_WRITE` 等权限声明），执行本报告 PoC，预期失败（抛出令牌不可用/内部入口不可访问/权限拒绝）。
2. 验证正常应用通过 `initArgs.kernelAPI.call()` 仍可稳定调用其被授权的内核 API（确保异步场景不再触发 CVS-ZEROS-009 的误拦截）。
3. 验证应用无法以任何方式触发 `skipCallerCheck=true` 并指定 `EXPLOIT_PID` 执行内核 API。

## 参考资料

- [CWE-285: Improper Authorization](https://cwe.mitre.org/data/definitions/285.html)
- [CWE-863: Incorrect Authorization](https://cwe.mitre.org/data/definitions/863.html)
- [CWE-269: Improper Privilege Management](https://cwe.mitre.org/data/definitions/269.html)

