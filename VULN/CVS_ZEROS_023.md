# CVS-ZEROS-023: Cache API 命名空间可控导致锁屏缓存投毒与系统上下文提权

**漏洞编号**: CVS-ZEROS-023  
**发现日期**: 2026-05-04  
**修复日期**: 待修复  
**严重程度**: 严重 (CVSS 9.0)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-79 (跨站脚本), CWE-863 (授权不正确)  
**状态**: 待修复

---

## 漏洞概述

`ProcessManager` 暴露的 `Cache.*` API 会把调用者 PID 自动填入 `options.pid`，但如果调用方显式传入 `options.pid` 或 `options.programName`，后端不会校验该命名空间是否属于当前进程。由于 `CACHE_READ` / `CACHE_WRITE` 属于普通权限，普通应用可写入任意程序命名空间甚至 `EXPLOIT_PID` 对应的缓存。

锁屏模块读取每日一言缓存时使用 `ProcessManager.EXPLOIT_PID` 访问 `Cache.get('system.dailyQuote')`，实际会读取 `exploit` 程序命名空间缓存，并将缓存字符串直接赋给 `innerHTML`。攻击者可通过缓存投毒写入 HTML 事件处理器，触发系统 UI 上下文 XSS。该脚本不处于普通应用调用栈，进一步可借 `ProcessManager.EXPLOIT_PID` 调用内核 API，形成提权。

## 漏洞描述

### 攻击链

1. 普通应用获得自动授予的 `CACHE_WRITE` 权限。
2. 调用 `kernelAPI.call('Cache.set', ['system.dailyQuote', '<img src=x onerror="...">', { programName: 'exploit', ttl: 0 }])`，或传入 `{ pid: ProcessManager.EXPLOIT_PID }`。
3. `ProcessManager` 不覆盖已存在的 `options.programName` / `options.pid`，`CacheDrive` 将数据写入 `programs.exploit['system.dailyQuote']`。
4. 锁屏显示每日一言时，用 `EXPLOIT_PID` 调用 `Cache.get('system.dailyQuote', null, {})`，读取同一命名空间缓存。
5. `lockscreen.js` 将缓存内容赋值到 `quoteText.innerHTML`，触发 HTML 事件处理器。
6. 恶意脚本在系统 UI / 全局上下文执行，可访问 `window.ProcessManager`、`CacheDrive` 等全局对象，并尝试使用 `EXPLOIT_PID` 调用内核 API。

### 根本原因

- `Cache.*` API 没有把缓存命名空间强绑定到真实调用者 PID。
- 调用方可覆盖 `options.pid` 和 `options.programName`，造成跨程序缓存读写。
- `CACHE_WRITE` 是普通权限，默认可获得，无法承载跨命名空间写入风险。
- 锁屏模块信任缓存内容并使用 `innerHTML` 渲染。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `kernel/process/processManager.js` | `Cache.set/get/clear/...` 保留调用方传入的 `options.pid`、`options.programName` |
| `kernel/drive/cacheDrive.js` | `programName` 优先于 PID，未校验调用者与命名空间关系 |
| `system/ui/lockscreen.js` | 从缓存读取每日一言后使用 `innerHTML` 渲染 |
| `kernel/process/permissionManager.js` | `CACHE_READ` / `CACHE_WRITE` 为普通权限 |

### 相关代码

```javascript
// processManager.js - 仅在 options.pid 未定义时才填入调用者 pid
'Cache.set': async (key, value, options = {}) => {
    const finalOptions = typeof options === 'object' && options !== null ? { ...options } : {};
    if (pid !== null && pid !== undefined && finalOptions.pid === undefined) {
        finalOptions.pid = pid;
    }
    return await CacheDrive.set(key, value, finalOptions);
}
```

```javascript
// cacheDrive.js - programName 优先，调用者可控
if (programName && typeof programName === 'string') {
    finalProgramName = programName;
} else if (pid !== null && typeof pid === 'number') {
    finalProgramName = CacheDrive._getProgramNameFromPid(pid);
}
```

```javascript
// lockscreen.js - 缓存内容直接进入 innerHTML
quote = await ProcessManager.callKernelAPI(
    systemPid,
    'Cache.get',
    ['system.dailyQuote', null, {}]
);
// ...
quoteText.innerHTML = quote.trim();
```

## 影响评估

- **跨程序缓存投毒**: 普通程序可读写其它程序或系统组件使用的缓存命名空间。
- **系统 UI XSS**: 锁屏每日一言缓存被投毒后，HTML 事件处理器可在系统 UI 上下文执行。
- **提权**: 系统 UI 上下文脚本可尝试使用 `EXPLOIT_PID` 调用内核 API，绕过普通应用调用栈限制。
- **持久化**: 缓存写入 `D:/LocalCache.json` 或 `D:/cache/*.cache`，重启后仍可能被读取。
- **隐蔽性**: 投毒内容伪装为普通缓存项，不需要修改系统核心文件。

### CVSS 3.1 评分建议

- **AV**: Network (N)
- **AC**: Low (L)
- **PR**: Low (L)
- **UI**: Required (R)
- **S**: Changed (C)
- **C/I/A**: High (H)
- **向量**: CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:H -> **9.0（严重）**

---

## 修复建议

1. `ProcessManager` 的 `Cache.*` API 应忽略调用方传入的 `options.pid` 和 `options.programName`，始终使用真实调用者 PID 推导命名空间。
2. 如需系统缓存，新增单独 API 或危险权限，仅允许 SystemToken / 内核模块写入。
3. `CacheDrive` 不应导出可被普通应用直接调用的全局写接口，或内部也应校验调用来源。
4. 锁屏每日一言应使用 `textContent` 渲染，不得使用 `innerHTML`。
5. 清理现有 `LocalCache.json` 中可疑的 `programs.exploit.system.dailyQuote` 等高风险缓存项。
6. 对缓存元数据增加 schema 校验，系统组件只读取自己受信命名空间下的缓存。

---

## 相关文件

- `kernel/process/processManager.js`
- `kernel/drive/cacheDrive.js`
- `kernel/process/permissionManager.js`
- `system/ui/lockscreen.js`
- `system/service/DISK/D/LocalCache.json`

---

**修复状态**: 待修复
