# CVS-ZEROS-023 网安学习计划

> **最后更新**: 2026-07-04  
> **学习者**: 小小萱  
> **当前任务**: 任务 1 — 系统基础必知（进行中）

---

## 0. 三大任务（总纲）

| # | 任务 | 目标 | 对应章节 |
|---|------|------|----------|
| **1** | **了解系统基础必须知识** | 搞懂 ZerOS 是什么、怎么跑、进程/权限/缓存/锁屏各在哪 | § 任务 1 |
| **2** | **学习 bin 程序与相关基础 API** | 能自写 CLI 命令，会调 `kernelAPI` + `Cache.*` | § 任务 2 |
| **3** | **复现漏洞 CVS-ZEROS-023** | 自写 bin 完成投毒 → 锁屏验证 →（可选）XSS 加深 | § 任务 3 |

**顺序**：1 → 2 → 3，不跳步。任务 2 完成前不做 023 投毒；任务 1 不必全读完再动手，但 **1.1～1.5 必做**。

**终局验收**：在授权靶机上，**不用 `vulnrepro`**，用自己写的 bin 证明跨命名空间缓存投毒 + 锁屏消费链成立。

---

## 1. 协作约定（AI 必读）

| 规则 | 说明 |
|------|------|
| AI 角色 | **指导者**：解释、步骤、答疑、Review；不代写、不代跑 |
| 例外 | 仅当小小萱**明确要求**「帮我写 / 改 / 跑」时方可动手 |
| 工具限制 | 不使用 `vulnrepro`；可参考 `ps.js` 等结构 |
| 环境 | 仅本地或授权 ZerOS 实例 |

**进度回写**：完成 checkbox 后在 § 进度追踪 打勾；新会话 AI 先读本文档。

---

## 2. 背景速记

**漏洞一句话**：普通程序有 `CACHE_WRITE`，`Cache.set` 可传 `programName: 'exploit'` 写入锁屏读的命名空间；锁屏 `innerHTML` 渲染 → XSS / 提权链。

| 用途 | 路径 |
|------|------|
| 漏洞报告 | `VULN/CVS_ZEROS_023.md` |
| bin 目录 | `system/service/DISK/D/bin/` |
| bin 范例 | `system/service/DISK/D/bin/ps.js` |
| Cache API | `docs/API/CacheDrive.md` |
| ProcessManager | `docs/API/ProcessManager.md` |
| bin Skill | `dev/skill/zeros-bin-development/SKILL.md` |
| 系统入门书 | `dev/books/ZerOSVirtualSystem/chapter1_overview/` |
| 缓存落盘 | `system/service/DISK/D/LocalCache.json` |
| 锁屏 | `system/ui/lockscreen.js` |

---

## 任务 1：了解系统基础必须知识

**目标**：不必成为 ZerOS 开发者，但需能回答「程序怎么跑、API 谁校验、缓存存哪、锁屏读啥」。

### 1.1 ZerOS 是什么（10 分钟）

- [ ] **1.1** 读 `dev/books/ZerOSVirtualSystem/chapter1_overview/section1_concept/` 中概念篇（或 README 摘要）
- [ ] **1.2** 用自己的话说：ZerOS = 浏览器里的虚拟 OS；`D:/` `C:/` 是虚拟盘，对应仓库 `system/service/DISK/`

**必知**：前端 JS 内核 + PHP 后端服务；日常练漏洞主要在前端进程与 `D:` 盘文件。

### 1.2 启动与终端（实操 5 分钟）

- [ ] **1.3** 本地启动 ZerOS，完成登录，打开**终端**应用
- [ ] **1.4** 在终端输入 `ps`，确认能看到进程列表（说明 bin 机制存在）

### 1.3 进程与 PID（15 分钟）

- [ ] **1.5** 读 `docs/API/ProcessManager.md` 概述 + `EXPLOIT_PID` 说明
- [ ] **1.6** 记住：`EXPLOIT_PID = 10000`，进程名 `exploit`；普通应用 PID ≥ 10001

**必知三句**（能口头复述即可）：

1. 每个运行的程序有一个 **pid**
2. 程序通过 **`initArgs.kernelAPI.call(apiName, args)`** 调内核能力
3. 内核会做 **权限检查**；`EXPLOIT_PID` 是系统内置特殊进程

### 1.4 权限（10 分钟）

- [ ] **1.7** 在 `kernel/process/permissionManager.js` 搜 `CACHE_READ`、`CACHE_WRITE`，确认级别为 **NORMAL**
- [ ] **1.8** 理解：`__info__.permissions` 声明程序要什么权限；023 利用的是「普通权限却能跨命名空间写」

### 1.5 缓存与锁屏（15 分钟）

- [ ] **1.9** 读 `VULN/CVS_ZEROS_023.md` 的「漏洞概述」+「攻击链」（先读，不练）
- [ ] **1.10** 打开 `LocalCache.json`，找到 `programs.exploit` 与 `system` 两段
- [ ] **1.11** 在 `lockscreen.js` 搜 `dailyQuote`、`innerHTML`，确认锁屏用 `EXPLOIT_PID` 读缓存

**任务 1 验收**（小小萱自答，AI Review）：

1. bin 命令文件放在哪、怎么执行？  
2. `EXPLOIT_PID` 和 `programName: 'exploit'` 什么关系？  
3. 锁屏读的缓存键名是什么、落在 JSON 哪一段？

---

## 任务 2：学习 bin 程序与相关基础 API

**前置**：任务 1 验收通过。

**目标**：独立编写 CLI，会使用 `terminal.write`、`kernelAPI`、`Cache.set/get/delete`。

### 2.1 bin 结构与生命周期

- [ ] **2.1** 读 `dev/skill/zeros-bin-development/SKILL.md` → Overview + Basic Template
- [ ] **2.2** 对照 `ps.js`：`__info__`、`__init__`、`setTimeout`、`_selfClose`
- [ ] **2.3** 理解：文件名 = 命令名；`type: 'CLI'`；必须 `setTimeout(..., 0)` 再跑主逻辑

### 2.2 练习 A：`hello` 命令

- [ ] **2.4** 自建 `system/service/DISK/D/bin/hello.js`
- [ ] **2.5** 输出 `Hello from my first bin`；支持 `-h`；能自动退出
- [ ] **2.6** 扩展：`hello 小小萱` → `Hello, 小小萱!`；无参 → `Hello, World!`

### 2.3 练习 B：`kernelAPI` + `Cache.*`（本进程命名空间）

- [ ] **2.7** 读 `docs/API/ProcessManager.md` 的 `initArgs.kernelAPI` 小节
- [ ] **2.8** 读 `docs/API/CacheDrive.md` 的 `Cache.set` / `Cache.get`
- [ ] **2.9** 在 `hello.js`（或新建 bin）中：`Cache.set('hello.lastRun', 时间戳)` 再 `Cache.get` 打印
- [ ] **2.10** `__info__.permissions` 加入 `CACHE_READ`、`CACHE_WRITE`
- [ ] **2.11** 在 `LocalCache.json` 的 `programs.<你的程序名>` 下确认键存在

**任务 2 验收**：

- 终端能跑通自建 bin，进程不卡住
- 能解释 `kernelAPI.call` vs `ProcessManager.callKernelAPI(pid, ...)`
- 能解释不传 `programName` 时缓存写在哪个命名空间

| 常见坑 | 方向 |
|--------|------|
| command not found | 文件不在 `D/bin/` 或文件名≠命令名 |
| 不退出 | 未 `requestSelfTermination` |
| 无输出 | 应用 `terminal.write` 而非仅 `console.log` |

---

## 任务 3：复现 CVS-ZEROS-023

**前置**：任务 2 验收通过。  
**方式**：自写 bin（建议名 `cachelab`，自定），**不用 vulnrepro**。

### 3.1 读透漏洞

- [ ] **3.1** 精读 `VULN/CVS_ZEROS_023.md`：根因、相关代码、修复建议
- [ ] **3.2** 对照源码：`processManager.js` 的 `Cache.set`；`cacheDrive.js` 的 `programName` 分支

### 3.2 API 层投毒（核心）

- [ ] **3.3** bin 实现 `poison`：`Cache.set('system.dailyQuote', marker, { programName: 'exploit', ttl: 0 })`
- [ ] **3.4** bin 实现 `read`：`ProcessManager.callKernelAPI(EXPLOIT_PID, 'Cache.get', ['system.dailyQuote', null, {}])`
- [ ] **3.5** 验证：`read` 输出 === `poison` 写入的 marker
- [ ] **3.6** 对照 `LocalCache.json` → `programs.exploit.system.dailyQuote`

### 3.3 UI 层验证

- [ ] **3.7** 确认锁屏「每日一言」已启用
- [ ] **3.8** `poison` → **`Ctrl+L`** → 锁屏显示 marker
- [ ] **3.9** 理解读完后锁屏会 `Cache.delete`（为何只触发一次 UI）

### 3.4 加深（可选）

- [ ] **3.10** 无害 HTML payload + DevTools 确认锁屏上下文执行
- [ ] **3.11** 执行 `cleanup`：`Cache.delete` 清 `programs.exploit` 下该键

### 3.5 总结

- [ ] **3.12** 自答：为何 `programName` 可覆盖？只改 `textContent` 够吗？
- [ ] **3.13** 用自己的话写 5 行攻击链（贴到下方笔记区）

**任务 3 验收**：

1. 自写 bin 完成 poison + read 一致  
2. 锁屏 UI 出现 marker  
3. 能讲清攻击链与两处根因（命名空间未绑定 + innerHTML）

---

## 进度追踪

| 任务 | 状态 | 备注 |
|------|------|------|
| 任务 1 系统基础 | 未开始 | 当前 |
| 任务 2 bin + API | 未开始 | |
| 任务 3 复现 023 | 未开始 | |
| 3.4 XSS 加深 | 可选 | |

**小小萱笔记区**：

```
（踩坑、输出摘要、疑问）
```

---

## AI 续教检查清单

1. 读本文档 + `dev/plans/README.md`
2. 确认当前在任务 1 / 2 / 3 哪一步，**不跳任务**
3. 只给**下一步**，不批量代做
4. 任务 1 从 **1.1** 或验收问答开始；任务 2 从 **2.1** 或 `hello` Review 开始

**建议开场白**：「继续 023 计划，当前任务 X」
