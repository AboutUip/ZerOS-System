# Node 脚本服务（server-nodeLib）

## 概述

`server-nodeLib` 是 ZerOS 内置的 **Node 脚本服务**，依赖 `NodeLibExpansion` 扩展，仅支持**手动调用**脚本（无定时执行）。服务启动后向 **POOL > SERVER** 暴露 **NodeLib** API，供程序通过 `POOL.__GET__("SERVER", "NodeLib")` 获取并调用。

- **服务 ID**：`nodeLib`（对应文件 `server-nodeLib.js`）
- **位置**：`D/server/server-nodeLib.js`
- **POOL**：启动后注册 `POOL.__ADD__("SERVER", "NodeLib", api)`，停止时 `POOL.__REMOVE__("SERVER", "NodeLib")`

## 程序使用方式

1. 确保服务已启动：`kernelAPI.call('Server.start', ['nodeLib'])`（需 SERVER_SERVICE_MANAGE 权限）。
2. 从 POOL 获取 API：

```javascript
var NodeLib = POOL.__GET__("SERVER", "NodeLib");
if (NodeLib) {
    var available = NodeLib.isNodeAvailable();
    if (available) {
        NodeLib.run('perf').then(function (result) { /* result.success, result.data */ });
    }
    NodeLib.check();   // 主动检测一次 Node 环境
    var config = NodeLib.getConfig();  // { scriptId, scriptIdWhitelist }
    var lastCheck = NodeLib.getLastCheck();
}
```

## NodeLib API（由服务暴露）

| 方法 | 说明 |
|------|------|
| `isNodeAvailable()` | 是否支持 Node（最近一次检测结果） |
| `getLastCheck()` | 最近一次检测时间戳 |
| `getConfig()` | 当前配置 `{ scriptId, scriptIdWhitelist, nodeDependencies }` |
| `check()` | 执行一次 Node 环境检测，返回 `Promise<boolean>` |
| `run(scriptId)` | 手动执行一次脚本（白名单如 `'perf'`），返回 `Promise<{ success, data }>` |

## 生命周期

- **__start__**：等待 NodeLibExpansion 就绪 → 若配置项 `nodeDependencies` 非空，则发起一次 **init** 请求（检查并尝试 `npm install -g` 未安装的包），等待完成或超时（90s）→ 执行一次 `check()` → 向 POOL > SERVER 注册 NodeLib。
- **__stop__**：从 POOL > SERVER 移除 NodeLib。

## 配置项 nodeDependencies（Node 全局依赖）

- 在扩展配置中可设置 **nodeDependencies**（字符串数组，仅 D/server 或 terminal 可通过 `setConfig` 修改）。
- 用户尝试启动本服务时，会自动检查这些包是否已全局安装（`npm list -g`）；未安装则由后端 **nodeLibInit** 接口执行一次 `npm install -g`，已安装则直接放行。
- 后端仅允许安装白名单内的包（如 `systeminformation`、`node-system-stats`、`microstats`），详见 [nodeLibInit](../INTERFACE/nodeLibInit.md)。

## 相关文档

- [nodeLibExec 接口](../INTERFACE/nodeLibExec.md) - 后端 exec 与白名单
- [nodeLibInit 接口](../INTERFACE/nodeLibInit.md) - 依赖检查与全局安装
- [服务模块编写 (ServiceModule.md)](./ServiceModule.md) - D/server 服务约定
