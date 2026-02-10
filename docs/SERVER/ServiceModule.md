# 服务模块编写指南

本文档说明如何在 ZerOS 中编写 **D/server** 下的服务模块，供服务扩展（ServerExpansion）自动识别、加载与启停。

## 概述

- **服务扩展**：`system/expansion/serverExpansion.js`，由 BootLoader 引导加载。
- **服务目录**：虚拟路径 `D/server`，项目内对应 `system/service/DISK/D/server/`。
- **命名规则**：文件名必须为 `server-<id>.js`，其中 `<id>` 为服务标识（如 `server-myservice.js` 的 id 为 `myservice`）。
- **加载策略**：合规模块会被**自动加载**——ServerExpansion 在脚本加载时执行 `init()`，等待 D/server 就绪后扫描并加载所有 `server-*.js`，与「是否打开系统服务管理程序」无关。加载时**不会**调用任何服务方法（包括 `__init__`）；仅当用户或系统**明确启用**某服务时（如 `kernelAPI.call('Server.start', [id])`），才会依次调用 `__init__`、`__start__`，之后可用 `stop` 停止；再次启动时**不会**再次调用 `__init__`。所有 Server.* API 会先等待服务列表加载完成（`_ready`）再执行，因此程序无需先调用 `Server.loadAll` 即可使用 `Server.start` 等。

## 合规约定

每个服务模块必须提供以下 **五个方法**（均为函数）：

| 方法 | 说明 | 调用时机 |
|------|------|----------|
| `__init__` | 初始化（仅首次启动时调用一次） | 第一次对该服务通过进程管理器 `Server.start(id)` 启动时 |
| `__start__` | 启动服务 | 每次 `Server.start(id)`（经 kernelAPI 调用） |
| `__stop__` | 停止服务 | `Server.stop(id)`（经 kernelAPI 调用） |
| `__status__` | 返回当前状态（任意值） | `Server.status(id)` |
| `__info__` | 返回服务信息（任意值） | `Server.info(id)` |

**可选方法**（成对实现，仅当提供 `__set__` 时必须同时提供 `__list__`）：

| 方法 | 说明 | 调用时机 |
|------|------|----------|
| `__list__` | 返回可配置项列表，供系统服务程序渲染输入框/开关 | `Server.listConfig(id)` |
| `__set__` | 接收配置对象并持久化（服务自行保存，如写入 LStorage） | `Server.setConfig(id, config)` |

`__list__` 应返回数组，每项形如 `{ key: string, label: string, type: 'text'|'number'|'boolean', value: any }`。`type` 为 `text`/`number` 时渲染为输入框，`boolean` 时渲染为开关。

模块加载后必须通过**全局注册函数**上报上述导出对象，否则视为不合规，不会被加入已加载列表。

## 注册方式

脚本执行结束时，调用全局注册函数并传入包含五个方法的对象：

```javascript
if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
    window.__ZerOS_ServerExpansion_Register__({
        __init__: function () { /* 仅首次 start 时调用 */ },
        __start__: function () { /* 每次 start 时调用 */ },
        __stop__: function () { /* stop 时调用 */ },
        __status__: function () { return { running: true }; },
        __info__: function () { return { name: 'MyService', version: '1.0' }; }
    });
}
```

- 注册函数名：`window.__ZerOS_ServerExpansion_Register__`
- 参数：一个对象，必须包含 `__init__`、`__start__`、`__stop__`、`__status__`、`__info__` 且均为函数。
- 若未调用或对象不合规，该文件不会被识别为有效服务，也不会被加入 `ServerExpansion.listServices()`。

## 最小示例

文件路径：`D/server/server-hello.js`（项目内 `system/service/DISK/D/server/server-hello.js`）

```javascript
(function () {
    'use strict';
    var _running = false;

    function __init__() {
        console.log('[server-hello] init');
    }
    function __start__() {
        _running = true;
        console.log('[server-hello] start');
    }
    function __stop__() {
        _running = false;
        console.log('[server-hello] stop');
    }
    function __status__() {
        return { running: _running };
    }
    function __info__() {
        return { name: 'Hello', version: '1.0', description: '示例服务' };
    }

    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__({
            __init__: __init__,
            __start__: __start__,
            __stop__: __stop__,
            __status__: __status__,
            __info__: __info__
        });
    }
})();
```

## 使用服务启停 API（程序侧）

**权限**：服务启停与查询由进程管理器以 **Server.\*** 形式暴露，所需权限为 **SERVER_SERVICE_MANAGE**（权限等级最高，DANGEROUS）。程序**不得**直接调用 `ServerExpansion` 的 start/stop/listServices/loadAll/status/info/isInited/isStarted（会因内核令牌校验失败而抛错）。

- **调用方式**：在 `__init__` 中保存 `initArgs.kernelAPI`，通过 `kernelAPI.call('Server.xxx', args)` 调用。
- **声明权限**：在 `__info__` 的 `permissions` 中加入 `PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE`。

| 能力 | API 名称 | 参数示例 |
|------|----------|----------|
| 列出已加载服务 | `Server.listServices` | `[]` |
| 重新扫描并加载 | `Server.loadAll` | `[]` |
| 启动服务 | `Server.start` | `['serviceId']` |
| 停止服务 | `Server.stop` | `['serviceId']` |
| 查询状态/信息 | `Server.status` / `Server.info` | `['serviceId']` |
| 是否已初始化/已启动 | `Server.isInited` / `Server.isStarted` | `['serviceId']` |
| 列出可配置项 | `Server.listConfig` | `['serviceId']` |
| 设置并保存配置 | `Server.setConfig` | `['serviceId', config]` |

示例：`await this._kernelAPI.call('Server.start', ['processmemory']);`

详见 [ServerExpansion API](../API/ServerExpansion.md)。

## 调用内核 API 时的 PID 约定

D/server 下服务运行在主窗口，无独立进程；调用需要 PID 的内核 API（如 `NotificationManager.createNotification(pid, options)`）时，应使用 **PID 10000**（`ProcessManager.SERVER_SERVICE_PID`）。内核权限对该 PID 放行（hasPermission 通过、黑名单不拦截）。服务脚本中可写：

```javascript
const pid = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
    ? ProcessManager.SERVER_SERVICE_PID
    : 10000;
```

## 目录与引导

- **D/server 目录**：若不存在，扩展会得到空列表，不会报错；可在 D 盘下创建 `server` 目录并放入 `server-xxx.js`。
- **BootLoader**：ServerExpansion 已在 `bootloader/starter.js` 的依赖表中注册，系统启动时会自动加载扩展并扫描 D/server，无需额外配置。

## 内置服务示例

- **notice**：`D/server/server-notice.js`，系统公告通知获取（轮询 API、按等级弹通知）。详见 [通知服务（ServerNotice）](./ServerNotice.md)。
- **translate**：`D/server/server-translate.js`，AI 智能翻译 + 普通机器翻译。启用后在 POOL > SERVER 中暴露 `Translate`：`translateSimple(text, toLang)` 普通机器翻译（POST `/api/v1/translate/text`，请求体 `{ text }`，响应 `{ text, translate }`）；`translate(textOrTexts, options)` AI 智能翻译（单条/批量、风格、上下文等）。详见 [翻译服务（ServerTranslate）](./ServerTranslate.md)。
- **processmemory**：`D/server/server-processmemory.js`，进程堆内存读写。启用后在 POOL > SERVER 中暴露 `ProcessMemory`：`getProcessMemoryInfo(targetPid)`、`readProcessHeap(targetPid, heapId, start, length)`、`writeProcessHeap(targetPid, heapId, offset, data)`，供内存编辑器等工具使用。详见 [进程堆内存服务（ServerProcessMemory）](./ServerProcessMemory.md)。
- **aiassistant**：`D/server/server-aiassistant.js`，语音唤醒式 AI 助手。识别唤醒词（你好小A、小A小A 等）后进入处理模式，可打开/关闭程序、调节亮度、闲聊。唤醒音效使用同目录下的 `start.mp3`。详见 [AI 助手服务（ServerAIAssistant）](./ServerAIAssistant.md)。

## 相关文档

- [ServerExpansion API](../API/ServerExpansion.md) - 服务扩展 API 说明
- [通知服务（ServerNotice）](./ServerNotice.md) - 内置通知服务说明与 ZerOS API 使用
- [翻译服务（ServerTranslate）](./ServerTranslate.md) - 内置翻译服务说明与 POOL API 使用
- [浏览器代理（BrowserProxy）](../API/BrowserProxy.md) - 浏览器网页代理服务（PHP 后端）
- [扩展与插件索引](../PLUGINS/README.md) - 语言包、服务模块等扩展文档
- [文档中心](../README.md)
