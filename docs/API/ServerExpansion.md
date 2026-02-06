# ServerExpansion API 文档

## 概述

`ServerExpansion` 是 ZerOS 的**服务扩展**模块，负责从 `D/server` 自识别并加载 `server-xxx.js` 服务模块，提供 start/stop 生命周期管理。合规模块需包含 `__init__`、`__start__`、`__stop__`、`__status__`、`__info__` 五个方法；加载时**不调用任何方法**，仅当用户或系统明确启用某服务时依次调用 init、start，再次启动不会调用 init。

## 依赖

- `Disk` / `NodeTree` - 文件系统（用于列出 D/server 下 `server-*.js`）
- `ProcessManager` - 用于 `convertVirtualPathToUrl` 将 D/server 路径转为可加载的脚本 URL

## 服务目录与命名

- **路径**：`D/server`（虚拟路径），项目内对应 `system/service/DISK/D/server/`
- **命名**：文件名须为 `server-<id>.js`，如 `server-myservice.js`，id 为 `myservice`
- **合规**：模块加载后须调用 `window.__ZerOS_ServerExpansion_Register__(api)` 上报导出对象，且 `api` 必须包含上述五个方法且均为函数

详见 [服务模块编写指南](../PLUGINS/ServiceModule.md)。

## 初始化

服务扩展在 BootLoader 中按依赖顺序加载（依赖 `kernel/filesystem/init.js` 与 `kernel/process/processManager.js`），加载后会自动扫描 D/server 并加载所有合规的 `server-*.js`，**不会**调用任何服务方法（包括 `__init__`）。

## 获取扩展对象

- 全局：`window.ServerExpansion` 或 `globalThis.ServerExpansion`
- POOL：`POOL.__GET__("KERNEL_GLOBAL_POOL", "ServerExpansion")`

## API 方法

### ServerExpansion.listServices()

获取已加载的合规服务 id 列表。

**返回值**：`string[]` - 服务 id 数组

**示例**：
```javascript
const ids = ServerExpansion.listServices(); // e.g. ['myservice', 'hello']
```

---

### ServerExpansion.loadAll()

重新扫描 D/server 并加载所有合规的 `server-*.js`（不调用任何服务方法）。

**返回值**：`Promise<string[]>` - 本次加载后所有合规服务 id 列表

---

### ServerExpansion.start(id)

启动服务。首次启动会先调用该服务的 `__init__` 再调用 `__start__`；之后再次启动仅调用 `__start__`。

**参数**：
- `id` (string): 服务 id，对应文件名 `server-<id>.js` 中的 `<id>`

**返回值**：`Promise<boolean>` - 是否成功

**示例**：
```javascript
await ServerExpansion.start('myservice');
```

---

### ServerExpansion.stop(id)

停止服务，调用该服务的 `__stop__`。

**参数**：
- `id` (string): 服务 id

**返回值**：`Promise<boolean>` - 是否成功

---

### ServerExpansion.status(id)

查询服务状态，调用该服务的 `__status__` 并返回其返回值。

**参数**：
- `id` (string): 服务 id

**返回值**：`Promise<*>` - `__status__` 的返回值，未加载或异常时为 `undefined`

---

### ServerExpansion.info(id)

获取服务信息，调用该服务的 `__info__` 并返回其返回值。

**参数**：
- `id` (string): 服务 id

**返回值**：`Promise<*>` - `__info__` 的返回值，未加载或异常时为 `undefined`

---

### ServerExpansion.isInited(id)

判断服务是否已初始化（是否已调用过 `__init__`）。

**参数**：
- `id` (string): 服务 id

**返回值**：`boolean`

---

### ServerExpansion.isStarted(id)

判断服务是否已启动（已调用 `__start__` 且未调用 `__stop__`）。

**参数**：
- `id` (string): 服务 id

**返回值**：`boolean`

---

### ServerExpansion.init()

初始化扩展：扫描并加载 D/server 下所有合规服务，不调用任何服务方法。一般由 BootLoader 间接触发，也可手动调用以重新扫描。

**返回值**：`Promise<string[]>` - 已加载的合规服务 id 列表

## 生命周期说明

| 操作 | 行为 |
|------|------|
| 系统启动 / 扩展加载 | 扫描 D/server，加载所有 `server-*.js`，不调用任何方法 |
| 第一次 `start(id)` | 先 `__init__()`，再 `__start__()` |
| 后续 `start(id)` | 仅 `__start__()` |
| `stop(id)` | 调用 `__stop__()` |
| `status(id)` / `info(id)` | 调用 `__status__()` / `__info__()`，无副作用 |

## 相关文档

- [服务模块编写指南](../PLUGINS/ServiceModule.md) - D/server 服务模块的编写约定与示例
- [扩展与插件索引](../PLUGINS/README.md) - 语言包、服务模块等扩展文档
- [Starter](./Starter.md) - BootLoader 与模块加载顺序
