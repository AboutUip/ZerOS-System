# Node 扩展依赖初始化接口（nodeLibInit）

## 概述

`nodeLibInit` 用于在启动 Node 脚本服务前**检查并安装**配置中的 Node 全局依赖（`npm install -g`）。仅 SystemToken 可调用；请求体传入包名列表，后端仅对**白名单内**的包执行检查与安装。

- **鉴权**：仅 SystemToken 放行
- **请求**：POST，Body `{ "packages": ["systeminformation", ...] }`
- **实现**：`system/service/nodeLibInit.php`

## 请求

- **Method**: POST
- **URL**: `/system/service/nodeLibInit.php`
- **Headers**: 需携带 JWT（SystemToken）
- **Body**: `application/json`

```json
{
  "packages": ["systeminformation", "node-system-stats"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| packages | string[] | 是 | 需要确保已全局安装的包名；仅白名单内的包会被实际检查/安装 |

## 包白名单（PHP 内配置）

当前允许通过本接口安装的包（仅这些会执行 `npm install -g`）：

| 包名 | 说明 |
|------|------|
| systeminformation | 系统信息与性能指标 |
| node-system-stats | 系统统计 |
| microstats | 轻量监控 |

其他包名会被忽略，不会报错也不会安装。

## 响应

**200 成功**：

```json
{
  "status": "success",
  "data": {
    "alreadyInstalled": ["systeminformation"],
    "installed": ["node-system-stats"],
    "failed": []
  },
  "timestamp": "2026-03-10 12:00:00",
  "timestamp_unix": 1710000000
}
```

- **alreadyInstalled**：请求中且已在全局安装的包
- **installed**：本次由接口成功安装的包
- **failed**：本次安装失败的包

## 错误

- **401**：未携带 Token 或非 SystemToken
- **405**：非 POST

## 相关文档

- [jwtVerify](./jwtVerify.md) - `requireSystemTokenOnly()`
- [ServerNodeLib](../SERVER/ServerNodeLib.md) - 服务启动时调用本接口完成依赖检查/安装
