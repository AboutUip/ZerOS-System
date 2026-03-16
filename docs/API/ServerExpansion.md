# ServerExpansion API 文档

## 概述

`ServerExpansion` 是 ZerOS 的**服务扩展**模块，负责从 `D/server` 自识别并加载 `server-xxx.js` 服务模块，提供 start/stop 生命周期管理。合规模块需包含 `__init__`、`__start__`、`__stop__`、`__status__`、`__info__` 五个方法；加载时**不调用任何方法**，仅当用户或系统明确启用某服务时依次调用 init、start，再次启动不会调用 init。

**权限管控**：服务启停与查询 API 由进程管理器以 **Server.\*** 形式暴露，所需权限为 **SERVER_SERVICE_MANAGE**（权限等级最高，DANGEROUS）。程序应通过 `kernelAPI.call('Server.xxx', args)` 调用并声明该权限；**禁止直接调用** `ServerExpansion` 的 start/stop/listServices/loadAll/status/info/isInited/isStarted，否则会因内核令牌校验失败而抛错。

## 依赖

- `Disk` / `NodeTree` - 文件系统（用于列出 D/server 下 `server-*.js`）
- `ProcessManager` - 用于 `convertVirtualPathToUrl` 将 D/server 路径转为可加载的脚本 URL，并暴露 Server.* API 与权限校验

## 服务目录与命名

- **路径**：`D/server`（虚拟路径），项目内对应 `system/service/DISK/D/server/`
- **命名**：文件名须为 `server-<id>.js`，如 `server-myservice.js`，id 为 `myservice`
- **合规**：模块加载后须调用 `window.__ZerOS_ServerExpansion_Register__(api)` 上报导出对象，且 `api` 必须包含上述五个方法且均为函数

详见 [服务模块编写指南](../SERVER/ServiceModule.md)。

## 初始化与自动加载服务列表

服务扩展在 BootLoader 中按依赖顺序加载（依赖 `kernel/filesystem/init.js` 与 `kernel/process/processManager.js`）。加载后**立即**执行 `ServerExpansion.init()`（异步）：

- 等待 D/server 路径就绪（`waitForServerPathReady`）
- 扫描 D/server 并加载所有合规的 `server-*.js`（`discoverAndLoad`）
- **不调用**任何服务方法（包括 `__init__`、`__start__`）

该过程与「是否打开系统服务管理程序」无关，**服务列表由内核/扩展自动加载**。完成状态保存在 `ServerExpansion._ready`（Promise）。

所有依赖服务列表的 API（start、stop、listServices、loadAll、status、info、isInited、isStarted）在访问内部 `_modules` 前会**先等待 `_ready`**，因此程序在启动后立即调用 `Server.start('processmemory')` 等不会出现「未知服务」——会等待服务列表加载完成后再执行。

## 获取扩展对象

- 全局：`window.ServerExpansion` 或 `globalThis.ServerExpansion`
- POOL：`POOL.__GET__("KERNEL_GLOBAL_POOL", "ServerExpansion")`

**注意**：程序（如系统服务管理、内存编辑器、终端 service 命令等）**不得**直接调用上述对象上的 start/stop/listServices/loadAll/status/info/isInited/isStarted，否则会抛错「ServerExpansion 仅允许通过进程管理器 kernelAPI（Server.*）调用」。应使用进程管理器注入的 `kernelAPI.call('Server.xxx', args)`，并在 `__info__` 中声明 `PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE`。

## 程序侧 API：Server.*（经进程管理器暴露）

以下 API 由进程管理器以 `kernelAPI.call(apiName, args)` 形式提供，需 **SERVER_SERVICE_MANAGE** 权限：

| API 名称 | 说明 | 参数 | 返回值 |
|----------|------|------|--------|
| `Server.start` | 启动服务（会先等待服务列表自动加载完成） | `[id]` | `Promise<boolean>` |
| `Server.stop` | 停止服务（会先等待服务列表自动加载完成） | `[id]` | `Promise<boolean>` |
| `Server.listServices` | 已加载服务 id 列表（会先等待服务列表自动加载完成） | `[]` | `Promise<string[]>` |
| `Server.loadAll` | 重新扫描 D/server 并加载服务（会先等待 init 完成） | `[]` | `Promise<string[]>` |
| `Server.status` | 查询服务状态 | `[id]` | `Promise<*>` |
| `Server.info` | 查询服务信息 | `[id]` | `Promise<*>` |
| `Server.isInited` | 是否已初始化 | `[id]` | `Promise<boolean>` |
| `Server.isStarted` | 是否已启动 | `[id]` | `Promise<boolean>` |
| `Server.listConfig` | 列出服务可配置项（调用 `__list__`，供系统服务程序渲染） | `[id]` | `Promise<Array>` |
| `Server.setConfig` | 设置并持久化配置（调用 `__set__`，服务自行保存） | `[id, config]` | `Promise<void>` |

服务若实现 `__set__` 则必须同时实现 `__list__`；系统服务程序通过 `listConfig` 获取可配置项、渲染输入框/开关，保存时调用 `setConfig`。

**示例**（在程序的 `__init__` 中保存 `initArgs.kernelAPI` 后使用）：

```javascript
await this._kernelAPI.call('Server.start', ['processmemory']);
const ids = await this._kernelAPI.call('Server.listServices', []);
await this._kernelAPI.call('Server.stop', ['processmemory']);
```

## ServerExpansion 内部 API 方法（仅供内核/令牌调用）

以下方法在**传入内核令牌**时由进程管理器内部调用；程序直接调用将抛错。

### ServerExpansion.listServices(token)

获取已加载的合规服务 id 列表。会先等待 `_ready`（init 完成），再返回 `_modules` 的 key 列表。

**参数**：`token` - 内核令牌（由 ProcessManager 传入）

**返回值**：`Promise<string[]>` - 服务 id 数组

**示例**：
```javascript
const ids = await ServerExpansion.listServices(token); // e.g. ['myservice', 'processmemory']
```

---

### ServerExpansion.loadAll(token)

重新扫描 D/server 并加载所有合规的 `server-*.js`（不调用任何服务方法）。会先等待 `_ready`（init 完成）再执行。

**参数**：`token` - 内核令牌（由 ProcessManager 传入）

**返回值**：`Promise<string[]>` - 本次加载后所有合规服务 id 列表

---

### ServerExpansion.start(id, token)

启动服务。会先等待 `_ready`（服务列表自动加载完成），再查找并启动。首次启动会先调用该服务的 `__init__` 再调用 `__start__`；之后再次启动仅调用 `__start__`。

**参数**：
- `id` (string): 服务 id，对应文件名 `server-<id>.js` 中的 `<id>`
- `token`: 内核令牌（由 ProcessManager 传入）

**返回值**：`Promise<boolean>` - 是否成功

**示例**：
```javascript
await ServerExpansion.start('myservice');
```

---

### ServerExpansion.stop(id, token)

停止服务。会先等待 `_ready`，再调用该服务的 `__stop__`。

**参数**：
- `id` (string): 服务 id
- `token`: 内核令牌（由 ProcessManager 传入）

**返回值**：`Promise<boolean>` - 是否成功

---

### ServerExpansion.status(id, token)

查询服务状态。会先等待 `_ready`，再调用该服务的 `__status__` 并返回其返回值。

**参数**：
- `id` (string): 服务 id
- `token`: 内核令牌（由 ProcessManager 传入）

**返回值**：`Promise<*>` - `__status__` 的返回值，未加载或异常时为 `undefined`

---

### ServerExpansion.info(id, token)

获取服务信息。会先等待 `_ready`，再调用该服务的 `__info__` 并返回其返回值。

**参数**：
- `id` (string): 服务 id
- `token`: 内核令牌（由 ProcessManager 传入）

**返回值**：`Promise<*>` - `__info__` 的返回值，未加载或异常时为 `undefined`

---

### ServerExpansion.isInited(id, token)

判断服务是否已初始化（是否已调用过 `__init__`）。会先等待 `_ready`。

**参数**：
- `id` (string): 服务 id
- `token`: 内核令牌（由 ProcessManager 传入）

**返回值**：`Promise<boolean>`

---

### ServerExpansion.isStarted(id, token)

判断服务是否已启动（已调用 `__start__` 且未调用 `__stop__`）。会先等待 `_ready`。

**参数**：
- `id` (string): 服务 id
- `token`: 内核令牌（由 ProcessManager 传入）

**返回值**：`Promise<boolean>`

---

### ServerExpansion.init()

初始化扩展：等待 D/server 就绪后扫描并加载 D/server 下所有合规服务，不调用任何服务方法。脚本加载时自动执行一次（`ServerExpansion._ready = ServerExpansion.init()`），程序无需再依赖「先打开服务管理」才可用服务。

**返回值**：`Promise<string[]>` - 已加载的合规服务 id 列表

### ServerExpansion._ready

初始化完成的 Promise。所有 start/stop/listServices/loadAll/status/info/isInited/isStarted 内部会先 `Promise.resolve(_ready)` 再访问 `_modules`，保证不会出现「未知服务」因列表未加载而报错。

## 生命周期说明

| 操作 | 行为 |
|------|------|
| 系统启动 / 扩展加载 | 自动执行 `init()`，扫描 D/server 并加载所有 `server-*.js`，不调用任何服务方法；结果保存在 `_ready` |
| 任意 `start`/`stop`/`listServices`/… 调用 | 先等待 `_ready`，再访问 `_modules` 并执行对应逻辑 |
| 第一次 `start(id)` | 先 `__init__()`，再 `__start__()` |
| 后续 `start(id)` | 仅 `__start__()` |
| `stop(id)` | 调用 `__stop__()` |
| `status(id)` / `info(id)` | 调用 `__status__()` / `__info__()`，无副作用 |

## 兼容程序

以下程序已适配 Server.* 权限管控，通过 `kernelAPI.call('Server.xxx', ...)` 访问服务，并声明 **SERVER_SERVICE_MANAGE** 权限：

- **系统服务管理（servicemanager）**：列表、启动、停止、状态、信息、自启联动
- **终端 service 命令（D/bin/service.js）**：list / start / stop / status / info / reload
- **计划任务管理（scheduletask）**：服务类型任务的服务 ID 下拉（Server.loadAll / Server.listServices）
- **计划任务内核（scheduleTaskManager）**：执行服务类型任务时通过内核令牌调用 ServerExpansion.start/stop/loadAll
- **终端 debug services / debug translate**：列出服务、查询 translate 状态（Server.listServices / Server.status）
- **内存编辑器（memoryediter）**：用户确认后自动启动/退出时关闭 ProcessMemory 服务（Server.start / Server.stop）

## 内置服务示例

- **notice**（`server-notice.js`）：系统公告通知获取，每 3 分钟拉取公告 API，按等级弹通知或打日志。详见 [通知服务（ServerNotice）](../SERVER/ServerNotice.md)。
- **gesturecontrol**（`server-gesturecontrol.js`）：摄像头手势识别，可配置各手势执行关闭/最小化/最大化/运行程序，POOL 暴露 `SERVER > GestureControl`。详见 [手势控制服务（ServerGestureControl）](../SERVER/ServerGestureControl.md)。

## 相关文档

- [服务文档（SERVER）](../SERVER/README.md) - D/server 服务模块编写与各服务说明
- [服务模块编写指南](../SERVER/ServiceModule.md) - D/server 服务模块的编写约定与示例
- [通知服务（ServerNotice）](../SERVER/ServerNotice.md) - 内置通知服务说明与 ZerOS API 使用
- [手势控制服务（ServerGestureControl）](../SERVER/ServerGestureControl.md) - 手势识别服务与 POOL API
- [扩展与插件索引](../PLUGINS/README.md) - 语言包等扩展文档
- [Starter](./Starter.md) - BootLoader 与模块加载顺序
