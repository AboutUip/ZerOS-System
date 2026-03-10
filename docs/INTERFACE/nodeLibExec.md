# Node 扩展执行接口（nodeLibExec）

## 概述

`nodeLibExec` 是 ZerOS 后端的 **Node 扩展执行接口**：在宿主支持 shell 的前提下，执行 `node --version`（检测）或 `node system/assets/nodeLibs/{scriptId}.js`（白名单脚本）。供前端 `NodeLibExpansion` 调用。

- **鉴权**：**仅 SystemToken 放行**，UserToken 及无 Token 一律 401
- **输入**：仅接受 POST body 中的 `scriptId`，且 **必须为白名单枚举**，不接收用户自由输入
- **PHP 实现**：`system/service/nodeLibExec.php`；其他后端（SpringBoot、Python）可据此文档同步实现

---

## 请求

- **Method**: `POST`
- **URL**: `/system/service/nodeLibExec.php`（PHP）或等价路径
- **Headers**: 需携带 JWT（SystemToken）
  - `Authorization: Bearer <token>` 或 `X-Auth-Token` / `X-JWT`
- **Body**: `application/json`

```json
{
  "scriptId": "check"
}
```

| 字段      | 类型   | 必填 | 说明 |
|-----------|--------|------|------|
| scriptId  | string | 是   | 白名单枚举：`check` \| `perf`（随白名单扩展可增，见下） |

### scriptId 白名单（与 PHP 保持一致）

| scriptId | 行为 |
|----------|------|
| `check`  | 执行 `node --version`，用于检测宿主是否具备 Node 环境 |
| `perf`   | 执行 `node system/assets/nodeLibs/perf.js`（或项目内等价路径） |

**约定**：除 `check` 外，其余 scriptId 均映射为 `system/assets/nodeLibs/{scriptId}.js`，且仅当该文件存在且路径在受控目录内时执行。不接收用户传入路径或任意字符串。

---

## 响应

### scriptId = check

- **200 成功**：

```json
{
  "status": "success",
  "data": {
    "nodeAvailable": true,
    "version": "v20.10.0",
    "stdout": "v20.10.0\n",
    "stderr": "",
    "code": 0
  },
  "timestamp": "2026-03-10 12:00:00",
  "timestamp_unix": 1710000000
}
```

- `nodeAvailable`: 布尔，表示 `node --version` 是否执行成功且 stdout 非空
- `version`: 成功时为 node 版本字符串（如 `v20.10.0`），否则可为 `null`

### scriptId = perf（或其他脚本）

- **200 成功**：

```json
{
  "status": "success",
  "data": {
    "stdout": "...",
    "stderr": "",
    "code": 0
  },
  "timestamp": "2026-03-10 12:00:00",
  "timestamp_unix": 1710000000
}
```

### 错误

- **400**：`scriptId` 缺失或不在白名单
- **401**：未携带 Token、Token 无效或非 SystemToken（如 UserToken）
- **500**：服务端执行异常（如 nodeLibs 目录不存在、脚本执行超时等）

---

## 权限与安全

- **仅 SystemToken 可调用**：实现方必须在入口处校验 JWT，且仅当 `payload.type === 'SystemToken'` 时放行，否则返回 401。
- **无用户输入**：脚本路径与命令均由服务端根据白名单 scriptId 硬编码或映射，请求体仅传 scriptId 枚举，不传路径、命令行参数或任意用户输入。
- **执行超时建议**：`check` 建议 5s，脚本执行建议 15s，避免长时间挂起。

---

## 其他后端实现要点

- **SpringBoot**：使用 `ProcessBuilder` 或 `Runtime.getRuntime().exec()`，参数写死为 `["node", "--version"]` 或 `["node", scriptPath]`；scriptPath 由服务端根据 scriptId 白名单解析到 `system/assets/nodeLibs/{scriptId}.js`（或项目内等价路径），并做 realpath 与目录边界检查。
- **Python**：使用 `subprocess.run(..., timeout=...)`，同样仅使用白名单 scriptId 映射出的路径，不拼接用户输入。
- **脚本目录**：与 PHP 保持一致，脚本文件位于 `system/assets/nodeLibs/` 下，文件名 `{scriptId}.js`，便于多后端共用同一套脚本。

---

## 相关文档

- [jwtVerify](./jwtVerify.md) - JWT 校验；本接口使用 `requireSystemTokenOnly()`
- [EXPANSION_GUIDE](../EXPANSION_GUIDE.md) - 扩展编写；NodeLibExpansion 调用本接口
