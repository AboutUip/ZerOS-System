# CVS-ZEROS-024: 终端 tempAsset 程序名冲突导致缓存命名空间劫持

**漏洞编号**: CVS-ZEROS-024  
**发现日期**: 2026-07-27  
**修复日期**: 待修复  
**发现者**: 小萱baibai  
**分析协助**: opencode / deepseek-v4-pro  
**严重程度**: 高 (CVSS 7.7)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-1021 (不当的 UI 呈现命名冲突), CWE-863 (授权不正确), CWE-506 (嵌入恶意代码)  
**状态**: 待修复

---

## 漏洞概述

ZerOS 终端在通过 `tempAsset` 机制加载外部文件作为 CLI 程序运行时，以文件的基本名（去扩展名）直接作为 `programName` 注册进程。该过程未校验该名称是否与 `APPLICATION_ASSETS` 中已注册的系统程序名冲突。由于缓存命名空间仅依赖 `programName` 且 Cache API 仅做泛型权限检查（`CACHE_READ` / `CACHE_WRITE`），攻击者可构造与目标系统程序同名的无扩展名文件，获得该程序缓存命名空间的完整读写权限，实现**缓存劫持**。

> **注**: 本漏洞与 CVS-ZEROS-023 不同。CVS-ZEROS-023 通过显式传入 `options.programName` 实现跨命名空间读写；本漏洞利用的是终端 `tempAsset` 加载路径中程序名直接取自文件名的设计缺陷，通过**进程名冲突**获得对目标缓存空间的合法身份。

---

## 漏洞描述

### 攻击链

1. 攻击者创建一个无扩展名的合法 ZerOS CLI 程序文件，文件名与目标系统程序名相同（如 `settings`、`exploit`、`TaskbarManager` 等）。
2. 在 ZerOS 终端中以路径形式执行该文件（如 `./tmp/settings`）。
3. 终端读取文件内容，以文件基本名 `"settings"` 作为 `programName`，通过 `tempAsset` 调用 `ProcessManager.startProgram("settings", { tempAsset, ... })`。
4. 进程表中注册 `programName: "settings"` 的新进程，获得合法 PID。
5. 该恶意程序的 `__info__` 声明 `CACHE_READ` / `CACHE_WRITE` 权限，由于是普通权限，自动授予。
6. 恶意程序调用 `kernelAPI.call('Cache.get', ['key', null])` 时，PID 自动注入，`CacheDrive._getProgramNameFromPid()` 查表返回 `"settings"`。
7. 恶意程序以 `"settings"` 命名空间访问缓存，可读写合法 `settings` 应用存储的所有缓存数据。

### 根本原因

- **tempAsset 无名称冲突检查** (`processManager.js:1234-1239`): `startProgram` 遇到 `tempAsset` 时直接跳过 `APPLICATION_ASSETS` 查找，不校验 `programName` 是否与已注册程序冲突。
- **程序名直接取自文件名** (`terminal.js:9094-9095`): `programNameFromPath = fileName.replace(/\.js$/i, '') || fileName`，无验证环节。
- **缓存命名空间仅基于 programName** (`cacheDrive.js:192-203, 1081-1086`): `_getProgramNameFromPid` 映射 PID → `programName`，缓存直接以 `programName` 为命名空间键。
- **Cache API 权限为泛型** (`processManager.js:3564-3570`): 只检查 `CACHE_READ` / `CACHE_WRITE`，无命名空间级别访问控制。
- **validateProgramFile 不检查名称冲突** (`processManager.js:1112-1165`): 仅校验 `__init__`、`__info__` 等方法存在性，不涉及程序名合法性。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `kernel/process/processManager.js:1234-1239` | `tempAsset` 分支跳过 APPLICATION_ASSETS，不校验程序名冲突 |
| `kernel/process/processManager.js:1481-1483` | 进程信息以传入的 `programName` 注册，来源不可信 |
| `kernel/process/processManager.js:1593` | tempAsset 通过 `<script>` 标签注入全局作用域，无隔离 |
| `kernel/process/processManager.js:1640-1696` | 等待循环无加载前后快照比对，无条件接受 `window[UPPER]` |
| `kernel/process/processManager.js:1666,1679,1746,1757` | POOL→window 交叉同步，单点污染扩散到全系统 |
| `kernel/process/processManager.js:1112-1165` | `validateProgramFile` 不检查名称冲突 |
| `kernel/drive/cacheDrive.js:192-203` | `_getProgramNameFromPid` 从进程表获取程序名，无条件返回 |
| `kernel/drive/cacheDrive.js:1020-1031` | `set()` 以 `programName` 决定缓存命名空间 |
| `kernel/drive/cacheDrive.js:1081-1086` | 缓存写入 `programs[programName]` 命名空间 |
| `kernel/core/signal/pool.js:135` | `__ADD__` 裸赋值，无重复键检查，静默覆盖 |
| `kernel/core/signal/dependencyConfig.js:190-204` | `publishSignal` 无发送方认证，可伪造依赖加载状态 |
| `system/service/DISK/D/application/terminal/terminal.js:9094-9095` | 程序名直接从文件名推导，无冲突检测 |
| `system/service/DISK/D/application/terminal/terminal.js:9110-9129` | tempAsset 以文件名作为 programName 传递给 startProgram |
| `system/service/DISK/D/application/terminal/terminal.js:9469-9492` | D:/bin 路径同样使用文件名作为 programName |

### 相关代码

```javascript
// terminal.js:9094-9095 — 程序名直接取自文件名
const fileName = basenameFromPath(resolvedPath);
const programNameFromPath = fileName.replace(/\.js$/i, '') || fileName;
// 若文件名为 "settings" 或 "exploit" → programName = "settings" / "exploit"

// terminal.js:9110-9129 — tempAsset 以文件名作为 programName 启动
const tempAsset = {
    script: fileContent,
    styles: [],
    icon: null,
    metadata: { name: programNameFromPath, type: 'CLI', allowMultipleInstances: true }
};
const pid = await ProcessMgr.startProgram(programNameFromPath, {
    terminal: terminalInstance,
    tempAsset: tempAsset
});

// processManager.js:1234-1239 — tempAsset 直接跳过注册表查询
if (initArgs.tempAsset) {
    asset = ProcessManager._parseAsset(initArgs.tempAsset);
    programMetadata = asset.metadata || {};
    // 不检查 APPLICATION_ASSETS[programName] 是否已存在
}

// processManager.js:1481-1483 — 进程信息以外部传入的 programName 注册
const processInfo = {
    pid: pid,
    programName: programName,  // 由终端传入，可能冒充系统程序
    ...
};

// cacheDrive.js:192-203 — 缓存命名空间完全信任进程表中的 programName
static _getProgramNameFromPid(pid) {
    const processInfo = ProcessManager.PROCESS_TABLE.get(pid);
    if (processInfo && processInfo.programName) {
        return processInfo.programName;  // 无额外验证
    }
    return null;
}

// cacheDrive.js:1081-1086 — 写入对应命名空间
if (finalProgramName) {
    if (!CacheDrive._cacheMetadata.programs[finalProgramName]) {
        CacheDrive._cacheMetadata.programs[finalProgramName] = {};
    }
    CacheDrive._cacheMetadata.programs[finalProgramName][key] = cacheEntry;
}
```

### 攻击 PoC 概念

```javascript
// 文件: D:/tmp/settings (无扩展名)
(function(window) {
    const SETTINGS = {
        __info__: function() {
            return {
                type: 'CLI',
                permissions: ['CACHE_READ', 'CACHE_WRITE']
            };
        },
        __init__: async function(pid, initArgs) {
            const api = initArgs.kernelAPI;

            // 读取合法 settings 程序的缓存
            const legitData = await api.call('Cache.get', ['window_positions']);
            api.call('Cache.getStats', []).then(stats => {
                this.terminal.write(`[!] 成功访问 settings 缓存命名空间:\n`);
                this.terminal.write(JSON.stringify(stats, null, 2));
            });

            // 投毒：写入恶意数据
            await api.call('Cache.set', ['theme_config', maliciousPayload, { ttl: 0 }]);

            // 清理目标缓存
            await api.call('Cache.clear', []);

            this.terminal.write('[*] 缓存劫持完成\n');
        },
        __exit__: function() {}
    };

    window.SETTINGS = SETTINGS;
})(window);
```

```bash
# 攻击者在 ZerOS 终端中执行:
./tmp/settings
# 程序以 programName="settings" 运行，获得合法 settings 缓存命名空间
```

---

## 扩展攻击面：全局对象与 POOL 签名劫持

### 概述

当目标系统程序 **已在运行** 时（如 `settings` 已打开），攻击者加载同名 tempAsset 程序不仅劫持缓存命名空间，还能**同时覆盖全局对象 `window.SETTINGS` 和 POOL 中的程序类注册**，导致后续所有组件对目标程序的查找返回恶意类。

### 技术原理

**1. tempAsset 脚本在全局作用域执行（`processManager.js:1593`）**

```javascript
script.textContent = scriptPath;  // 恶意脚本内容
document.head.appendChild(script);  // 全局作用域执行，无沙箱
```

tempAsset 通过 `<script>` 标签注入，具有完全全局作用域访问权。

**2. POOL.__ADD__ 无重复键保护（`pool.js:135`）**

```javascript
__ADD__(type, name, elem) {
    // ... 无任何重复键检查 ...
    const obj = this.__KEY_POOL__.get(key);
    obj[name] = elem;   // 裸赋值，静默覆盖已有条目
}
```

`APPLICATION_SHARED_POOL` 和 `APPLICATION_POOL` 中所有已注册程序类均可被同名 tempAsset 覆盖。

**3. 等待循环无加载前后快照比对（`processManager.js:1640-1696`）**

```javascript
// 仅检查 window[programNameUpper] 是否存在，不比对加载前后差异
if (typeof window !== 'undefined' && window[programNameUpper]) {
    programLoaded = true;
    break;
}
```

即使 `window.SETTINGS` 在脚本加载前就已存在（合法程序注册的），循环无条件接受加载后该键对应的任何值。

**4. POOL → window 交叉同步扩散（`processManager.js:1666,1679,1746,1757`）**

```javascript
// 从 POOL 读取后自动写回 window — 桥梁效应
if (typeof window !== 'undefined') {
    window[programNameUpper] = sharedPoolObj;
}

// killProgram 的 __exit__ 查找同样执行此同步
window[programNameUpper] = programClass;
```

任一入口被污染，另一入口被自动传播。恶意类可通过覆盖 POOL 间接污染 `window`，反之亦然。

### 攻击链（目标程序已运行）

```
1. 合法 settings 正在运行 → window.SETTINGS 已注册、POOL 已注册

2. ./malicious_settings (终端 tempAsset 加载)
   ↓
3. <script> 注入全局执行:
   window.SETTINGS = EvilSettingsClass;                          // 覆盖全局
   POOL.__ADD__('APPLICATION_SHARED_POOL', 'SETTINGS', EvilSettingsClass);  // 覆盖 POOL
   ↓
4. 等待循环找到 window.SETTINGS (已是恶意版本) → 通过
   POOL→window 交叉同步确保两边一致被污染
   ↓
5. 二级影响 — 所有后续查找被劫持:
   ├── ProcessManager.startProgram('settings')  → 使用恶意类
   ├── ProcessManager.killProgram → 调用恶意 __exit__
   ├── ProcessManager.getProgramInfo → 返回恶意元数据
   ├── ContextMenuManager (1957, 2369) → window[programNameUpper] 返回恶意类
   └── terminal.js (2608) → 返回恶意类
```

### 受影响的 POOL 查找点

| 组件 | 文件:行 | 查找方式 |
|------|---------|----------|
| 启动程序后获取类 | `processManager.js:1730-1757` | window → POOL → 交叉同步 |
| 终止程序 `__exit__` | `processManager.js:2187-2221` | window → POOL → 交叉同步 |
| 获取程序信息 | `processManager.js:8683` | `window[programNameUpper]` |
| 桌面右键菜单 | `contextMenuManager.js:1957,2369` | `window[programNameUpper]` |
| 终端程序解析 | `terminal.js:2608` | `window[programNameUpper]` |
| D:/bin 程序注册 | `nmap.js:208` 等 | `POOL.__ADD__` 无冲突检查 |

### 此扩展与主漏洞的关系

主漏洞 (024 基础) 解决的是**进程表层面**的命名空间伪造——恶意程序以同名注册进程表条目，获得缓存命名空间访问权。而全局对象/POOL 劫持更进一步——当目标程序**已在运行**时，同名 tempAsset 同时污染**类注册层**，影响未来所有程序查找和操作。

---

## 影响评估

- **缓存数据泄露**: 可读取目标系统程序存储的所有缓存数据（如窗口状态、用户配置、主题设置等）。
- **缓存数据投毒**: 可写入恶意缓存值，目标程序读取后会使用被篡改的数据，可能引发逻辑错误或安全降级。
- **全局对象劫持**: 可在 `window[程序名大写]` 和 POOL 中替换合法程序类，影响后续启动、终止、信息查询等操作。
- **POOL 交叉污染**: `window` 与 POOL 的自动同步机制使得单点污染即扩散到全系统。
- **联合 CVS-ZEROS-023 扩大危害**: 若结合锁屏 innerHTML 渲染问题，可进一步实现系统级 XSS 与提权。
- **隐蔽性**: 攻击通过正常程序启动路径完成，进程表条目完全合法，审计日志中只显示正常 `callKernelAPI` 记录。
- **影响范围**: 所有在 `APPLICATION_ASSETS` 中注册的程序名均可能被冒充，包括但不限于：
  - `settings` — 系统设置
  - `taskmanager` — 任务管理器
  - `browser` — 浏览器
  - `themeanimator` — 主题管理器
  - `filemanager` — 文件管理器
  - `exploit` — 内核进程（EXPLOIT_PID 对应）

### CVSS 3.1 评分建议（含扩展攻击面）

- **AV**: Local (L)
- **AC**: Low (L)
- **PR**: Low (L)
- **UI**: None (N)
- **S**: Unchanged (U)
- **C/I/A**: High / High / High (H/H/H)
- **向量**: CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H -> **7.8（高）**

> 若结合 CVS-ZEROS-023 的锁屏 XSS 提权链，综合危害可达严重级别。

---

## 修复建议

### P0 — 立即修复

1. **`startProgram` 增加 tempAsset 名称冲突检查**: 当 `initArgs.tempAsset` 存在且 `programName` 已存在于 `APPLICATION_ASSETS` 或 `ApplicationAssetManager` 中时，应拒绝启动或要求显式覆写标志。
   ```javascript
   // processManager.js:1234 附近
   if (initArgs.tempAsset) {
       if (!initArgs.overrideReservedName) {
           if (typeof ApplicationAssetManager !== 'undefined' &&
               ApplicationAssetManager.hasProgram(programName)) {
               throw new Error(
                   `程序名 "${programName}" 与系统程序冲突，禁止通过 tempAsset 启动。`
               );
           }
       }
       asset = ProcessManager._parseAsset(initArgs.tempAsset);
   }
   ```

2. **终端层增加名称校验** (`terminal.js:9095` 附近): 在推导 `programNameFromPath` 后，检查是否与注册表已有程序名冲突，若冲突则拒绝或追加命名空间后缀。

3. **缓存命名空间增加来源隔离**: 对 `tempAsset` 来源的程序，缓存命名空间应附加路径 hash 或特殊前缀（如 `temp_<hash>_<name>`），而非直接使用程序名。

4. **POOL.__ADD__ 增加重复键保护**: 在覆盖前检查键是否已存在，若存在则记录告警或拒绝覆盖（除非有 `force` 参数）。
   ```javascript
   // pool.js:135 附近
   if (obj.hasOwnProperty(name) && !force) {
       KernelLogger.warn("POOL", `键 "${name}" 在 "${realType}" 中已存在，拒绝覆盖`);
       return;
   }
   obj[name] = elem;
   ```

5. **等待循环增加加载前后快照比对** (`processManager.js:1640` 之前): 记录 `window[programNameUpper]` 的加载前值，加载后若值发生变化且旧值原本存在，则告警并拒绝使用新值。

### P1 — 高优先级

6. **Cache API 引入命名空间级别准入控制**: `Cache.set/get` 应校验"调用者 programName 是否有权访问目标命名空间"，而非仅依赖泛型 `CACHE_READ` / `CACHE_WRITE`。

7. **`validateProgramFile` 增加名称合法性检查**: 解析文件中的程序对象导出名，与文件名比对，发现不一致时告警或拒绝。

8. **POOL→window 交叉同步增加来源校验**: 当从 POOL 读取值并写回 `window` 时，比对旧值并记录变更审计日志。

### P2 — 中优先级

9. **审计所有 `startProgram` 调用点**: 确认所有传入的 `programName` 均来自可信来源，对不可信来源强制追加来源标识。

10. **`publishSignal` 增加发送方认证**: 对 `dependencyLoaded` 事件增加来源校验（如要求携带调用栈签名或与脚本路径绑定），防止恶意脚本伪造依赖加载状态。

---

## 相关文件

- `kernel/process/processManager.js`
- `kernel/drive/cacheDrive.js`
- `kernel/core/signal/pool.js`
- `kernel/core/signal/dependencyConfig.js`
- `system/service/DISK/D/application/terminal/terminal.js`
- `kernel/process/applicationAssets.js`
- `kernel/process/permissionManager.js`
- `system/ui/contextMenuManager.js`

---

**修复状态**: 待修复  
**发现者**: 小萱baibai  
**分析协助**: opencode / deepseek-v4-pro
