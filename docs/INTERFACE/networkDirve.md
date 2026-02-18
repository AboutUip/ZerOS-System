# 网络驱动服务（networkDirve）

## 概述

`networkDirve.php` 提供 TCP 端口监听、注册/注销、数据收发等能力，与 `kernel/drive/networkManager.js` 协同工作。因 PHP 请求-响应模型限制，实际套接字由 `networkDirveDaemon.php`（CLI 守护进程）管理，主脚本通过文件与守护进程通信。

- **类型**：PHP 后端服务
- **位置**：`system/service/networkDirve.php`
- **鉴权**：需通过 `requireJWTVerify()`
- **调用方**：NetworkManager

## 访问方式

```
GET  /system/service/networkDirve.php?action=xxx&port=xxx&...
POST /system/service/networkDirve.php
```

## 操作

| action | 说明 | 参数 |
|--------|------|------|
| register | 注册端口监听 | port, pid, programName |
| unregister | 取消端口监听 | port |
| check | 检查端口（接受新连接、读取数据） | port |
| status | 获取端口状态 | port |
| send | 向指定 host:port 发送数据 | host, port, data |
| list | 列出所有已注册端口 | 无 |

### register

**参数**：`port`（1-65535）、`pid`、`programName`

验证端口可用后创建配置，启动守护进程（若存在）并通知其监听该端口。

### unregister

**参数**：`port`

通知守护进程停止监听，删除端口配置与数据文件。

### check

**参数**：`port`

返回该端口的新连接列表与已接收数据队列，并清空队列。NetworkManager 定时轮询以获取连接与数据。

### status

**参数**：`port`

返回端口配置、连接数、连接列表等。

### send

**参数**：`host`（默认 127.0.0.1）、`port`、`data`

以 TCP 客户端方式向 `host:port` 发送 `data`。

### list

返回所有已注册端口的列表。

## 数据目录

端口配置与数据存放在 `D:/cache/network/`：
- `port_<port>.json` - 端口配置
- `port_<port>_connections.json` - 连接列表
- `port_<port>_data_queue.json` - 数据队列
- `daemon.pid` - 守护进程 PID
- `daemon_control.json` - 守护进程控制命令

## 相关文档

- [NetworkManager API](../API/NetworkManager.md) - 网络管理器
- [NetworkPort API](../API/NetworkPort.md) - 端口管理
