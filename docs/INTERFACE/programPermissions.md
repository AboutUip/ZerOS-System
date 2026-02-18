# 程序权限注册服务（programPermissions）

## 概述

`programPermissions.php` 用于接收程序声明的权限、分配 upid，并将结果写入 `BootSecurityToken.json` 的 `programPermissionsMap`。由内核 ProcessManager 在程序启动时调用。

- **类型**：PHP 后端服务
- **位置**：`system/service/programPermissions.php`
- **鉴权**：需通过 `requireJWTVerify()`（SystemToken 或 UserToken+upid）
- **调用方**：ProcessManager

## upid 生成算法

1. 生成 2 个随机 16 位数字
2. 将 programName 进行 Unicode/UTF-8 编码
3. 分别对 (随机数1 + 编码后 programName)、(随机数2 + 编码后 programName) 做 SHA-256
4. 两个 SHA-256 结果按随机顺序拼接
5. 对拼接结果做 MD5，得到 32 位十六进制字符串作为最终 upid

## 访问方式

```
GET  /system/service/programPermissions.php?action=xxx
POST /system/service/programPermissions.php
Content-Type: application/json
```

## 操作

### register（注册权限）

将程序的权限列表注册到 `programPermissionsMap`，分配唯一 upid。

**参数**（GET 或 POST body）：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| permissions | array | 是 | 权限列表 |
| programName | string | 否 | 程序名（当前未用于 upid 生成，可扩展审计） |

**响应**（成功）：
```json
{
  "status": "success",
  "message": "权限注册成功",
  "data": { "upid": "a1b2c3d4e5f6789012345678901234ab" }
}
```
（upid 为 32 位十六进制字符串）

### reclaim（回收 upid）

从 `programPermissionsMap` 中移除指定 upid 的权限记录。

**参数**：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| upid | number | 是 | 要回收的 upid |

**响应**（成功）：
```json
{
  "status": "success",
  "message": "upid 已回收",
  "data": { "upid": 1 }
}
```

## 数据存储

数据写入 `system/service/DISK/D/BootSecurityToken.json` 的 `programPermissionsMap` 字段，供 jwtVerify 及后端校验程序权限时使用。

## ProcessManager 申请 upid 时拥有的信息

ProcessManager 在 `startProgram` 中调用 register 时，**当前已传递**和**可扩展传递**的字段如下：

| 字段 | 是否已传递 | 说明 |
|------|-----------|------|
| `action` | 是 | 固定为 `'register'` |
| `programName` | 是 | 程序名（如 `'filemanager'`） |
| `permissions` | 是 | 来自 `programClass.__info__().permissions` |
| `pid` | 否 | 进程 ID（`ProcessManager._allocatePid()` 分配） |
| `programType` | 否 | 来自 `__info__().type`（如 `'CLI'`、`'GUI'`） |
| `scriptPath` | 否 | 程序脚本路径 |
| `isAdminProgram` | 否 | 是否管理员专用程序 |

当前 register 接口仅使用 `permissions` 与 `programName`。`pid` 未传递（upid 由后端独立分配，与前端 pid 无绑定）。若需扩展（如审计、防重放），可将 `pid`、`programType` 等加入请求体。

## 相关文档

- [jwtVerify](./jwtVerify.md) - JWT 校验
- [ProcessManager API](../API/ProcessManager.md) - 进程管理
