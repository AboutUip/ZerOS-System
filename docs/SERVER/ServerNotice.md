# 通知服务（server-notice）

## 概述

`server-notice` 是 ZerOS 内置的**系统公告通知获取服务**，由 ServerExpansion 从 `D/server` 加载。服务启动后每隔 3 分钟请求公告 API，按 `subTime` 去重，新公告按等级弹通知或仅记录日志。

- **服务 ID**：`notice`（对应文件 `server-notice.js`）
- **位置**：`D/server/server-notice.js`（项目内 `system/service/DISK/D/server/server-notice.js`）
- **依赖**：ServerExpansion 已随 BootLoader 加载；服务运行在主窗口，可访问内核全局对象。

## 功能说明

| 行为 | 说明 |
|------|------|
| 轮询 | 启动后立即拉取一次，之后每 3 分钟拉取一次 |
| 去重 | 以 `response.data.subTime`（或数组中每条的 `subTime`）为准，已接收过则不再弹通知 |
| 已接收记录 | 仅存内存，不写 LStorage，避免覆盖桌面图标、注册表等 LocalSData |
| 等级 | 2 → 系统通知（不自动关闭）；1 → 系统通知（8 秒关闭）；0 → 仅打日志 |

## 公告 API 约定

- **地址**：脚本内常量 `ANNOUNCE_API_URL`，正式使用前需在 `server-notice.js` 中配置为实际 URL。
- **方法**：GET（或当前 `fetch` 默认行为）。
- **响应格式**：JSON，且需包含 `data` 字段：
  - **单条**：`{ "data": { "level": 0|1|2, "title": "", "content": "", "subTime": "唯一标识" } }`
  - **多条**：`{ "data": [ { "level", "title", "content", "subTime" }, ... ] }`
- **level**：0=仅日志，1=通知 8s，2=通知不自动关闭。
- **subTime**：用于去重的唯一标识（如时间戳或发布时间字符串）。

## ZerOS API 使用与放行说明

服务运行在与内核相同的主窗口环境中，以下 API 在加载顺序上已保证可用，且无需额外“放行”配置：

| 使用的 API | 用途 | 说明 |
|------------|------|------|
| `KernelLogger` | 打日志（info/debug/warn） | 脚本内已做 `typeof KernelLogger !== 'undefined'` 判断，缺失时仅跳过日志 |
| `NotificationManager.createNotification(pid, options)` | 弹系统通知 | 使用 `ProcessManager.SERVER_SERVICE_PID`（10000），内核权限对该 PID 放行；`createNotification` 为 async，服务已对返回的 Promise 做 `.catch()`；权限由 NotificationManager 内部按快照通知规则处理（非黑名单则自动授予） |
| `fetch` | 请求公告 API | 浏览器标准 API；跨域需公告接口支持 CORS，否则会被浏览器拦截 |

**注意**：

- 公告接口若为跨域，需服务端返回允许 ZerOS 页面源（Origin）的 CORS 头，否则 `fetch` 会报跨域错误。
- D/server 下服务统一使用 **PID 10000**（`ProcessManager.SERVER_SERVICE_PID`）调用内核 API，内核权限对该 PID 放行（hasPermission 通过、黑名单不拦截）。

## 生命周期与状态

- **__init__**：仅首次 `ServerExpansion.start('notice')` 时调用一次，打日志。
- **__start__**：开始轮询（立即拉取一次 + 每 3 分钟一次）。
- **__stop__**：清除定时器，停止轮询。
- **__status__**：返回 `{ running, lastFetchTime, lastSubTime, lastError, apiUrl }`，其中 `apiUrl` 为“(已配置)”或“(未配置)”。
- **__info__**：返回 `{ name: 'SystemNotice', version: '1.0', description: 'ZerOS系统公告通知获取' }`。

## 配置与自启

- **配置 API 地址**：编辑 `server-notice.js` 顶部常量 `ANNOUNCE_API_URL`，填入实际公告 API 的完整 URL。
- **自启**：在「系统服务管理」中勾选该服务的「系统启动时自动启动此服务」，会通过计划任务创建 SYSTEM_STARTUP 类型的服务任务，实现开机自启。

## 相关文档

- [ServerExpansion API](../API/ServerExpansion.md) - 服务扩展加载与启停
- [服务模块编写 (ServiceModule.md)](./ServiceModule.md) - D/server 服务约定与示例
- [NotificationManager](../API/NotificationManager.md) - 通知创建与权限
