# 程序权限注册服务（programPermissions）

## 概述

`programPermissions.php` 用于接收**前端实际授予的权限**、分配/更新 upid 与权限列表，并将结果写入 `BootSecurityToken.json` 的 `programPermissionsMap`。由内核 ProcessManager（程序启动时 register）与 PermissionManager（用户授权后 update）调用。

- **类型**：PHP 后端服务
- **位置**：`system/service/programPermissions.php`
- **鉴权**：需通过 `requireJWTVerify()`（SystemToken 或 UserToken）
- **调用方**：ProcessManager（register/reclaim）、PermissionManager（update）

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

将**当前已授予该进程的权限列表**注册到 `programPermissionsMap`，分配唯一 upid。ProcessManager 在**先完成** `PermissionManager.registerProgramPermissions(pid, programInfo, options)` 后，使用 `PermissionManager.getGrantedPermissions(pid)` 作为 `permissions` 调用本接口（CVS-ZEROS-014 修复：不再使用 `__info__.permissions` 声明）。

**参数**（POST body）：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定为 `'register'` |
| permissions | array | 是 | **已授予**该进程的权限列表（与前端 PermissionManager 一致） |
| programName | string | 是 | 程序名（用于 upid 生成与审计） |

**响应**（成功）：
```json
{
  "status": "success",
  "message": "权限注册成功",
  "data": { "upid": "a1b2c3d4e5f6789012345678901234ab" }
}
```
（upid 为 32 位十六进制字符串）

### update（更新权限）

更新已注册 upid 的权限列表。当用户在同一会话内通过权限弹窗授予新权限、或持久化恢复后授予时，PermissionManager 在 `_grantPermission` 中会调用本接口，将 `getGrantedPermissions(pid)` 同步到后端，保证后端与前端一致（含「仅请求一次、允许后持久化放行」的兼容）。

**参数**（POST body）：
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定为 `'update'` |
| upid | string | 是 | 已由 register 分配的 upid |
| permissions | array | 是 | 该 upid 对应的**完整**已授予权限列表 |

**响应**（成功）：
```json
{
  "status": "success",
  "message": "权限已同步",
  "data": { "upid": "a1b2c3d4e5f6789012345678901234ab" }
}
```

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

## 调用时机与数据来源

| 操作 | 调用方 | 时机 | permissions 来源 |
|------|--------|------|-------------------|
| register | ProcessManager | 程序启动，在 `registerProgramPermissions` **之后** | `PermissionManager.getGrantedPermissions(pid)` |
| update | PermissionManager | 每次 `_grantPermission(pid, permission)` 后，且该 pid 已有 upid | `PermissionManager.getGrantedPermissions(pid)` |
| reclaim | ProcessManager | 进程退出或 __init__ 失败时 | — |

register 与 update 均不信任 `__info__.permissions` 声明，仅写入前端实际授予的权限，避免程序提权（见 [CVS-ZEROS-014](../../VULN/CVS_ZEROS_014.md)）。

## 相关文档

- [jwtVerify](./jwtVerify.md) - JWT 校验
- [ProcessManager API](../API/ProcessManager.md) - 进程管理
