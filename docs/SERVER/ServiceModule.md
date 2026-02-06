# 服务模块编写指南

本文档说明如何在 ZerOS 中编写 **D/server** 下的服务模块，供服务扩展（ServerExpansion）自动识别、加载与启停。

## 概述

- **服务扩展**：`system/expansion/serverExpansion.js`，由 BootLoader 引导加载。
- **服务目录**：虚拟路径 `D/server`，项目内对应 `system/service/DISK/D/server/`。
- **命名规则**：文件名必须为 `server-<id>.js`，其中 `<id>` 为服务标识（如 `server-myservice.js` 的 id 为 `myservice`）。
- **加载策略**：合规模块会被自动加载，但**不会**在加载时调用任何方法（包括 `__init__`）；仅当用户或系统**明确启用**某服务时，才会依次调用 `__init__`、`__start__`，之后可用 `stop` 停止；再次启动时**不会**再次调用 `__init__`。

## 合规约定

每个服务模块必须提供以下 **五个方法**（均为函数）：

| 方法 | 说明 | 调用时机 |
|------|------|----------|
| `__init__` | 初始化（仅首次启动时调用一次） | 第一次对该服务调用 `ServerExpansion.start(id)` 时 |
| `__start__` | 启动服务 | 每次 `ServerExpansion.start(id)` |
| `__stop__` | 停止服务 | `ServerExpansion.stop(id)` |
| `__status__` | 返回当前状态（任意值） | `ServerExpansion.status(id)` |
| `__info__` | 返回服务信息（任意值） | `ServerExpansion.info(id)` |

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

## 使用 ServerExpansion API

- **获取扩展对象**：`window.ServerExpansion` 或 `POOL.__GET__("KERNEL_GLOBAL_POOL", "ServerExpansion")`
- **列出已加载服务**：`ServerExpansion.listServices()` → 返回 id 数组
- **启动服务**：`ServerExpansion.start(id)` → 首次会先 `__init__` 再 `__start__`，之后仅 `__start__`
- **停止服务**：`ServerExpansion.stop(id)`
- **查询状态/信息**：`ServerExpansion.status(id)`、`ServerExpansion.info(id)`
- **是否已初始化/已启动**：`ServerExpansion.isInited(id)`、`ServerExpansion.isStarted(id)`

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

- **announcement**：`D/server/server-announcement.js`，系统公告通知获取（轮询 API、按等级弹通知）。详见 [公告服务（ServerAnnouncement）](./ServerAnnouncement.md)。

## 相关文档

- [ServerExpansion API](../API/ServerExpansion.md) - 服务扩展 API 说明
- [公告服务（ServerAnnouncement）](./ServerAnnouncement.md) - 内置公告服务说明与 ZerOS API 使用
- [扩展与插件索引](../PLUGINS/README.md) - 语言包、服务模块等扩展文档
- [文档中心](../README.md)
