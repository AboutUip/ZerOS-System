# 公告服务维护指南 (server-notice)

## 概述

本文档用于维护 ZerOS 系统的公告通知服务 (`server-notice`)。该服务负责从远程 API 获取系统公告，并根据公告等级向用户展示通知。

- **服务名称**: SystemNotice
- **服务文件**: `D/server/server-notice.js`
- **项目路径**: `system/service/DISK/D/server/server-notice.js`

---

## 快速配置

### 修改 API 地址

编辑 `server-notice.js` 文件顶部常量：

```javascript
// 第 9 行
const ANNOUNCE_API_URL = 'http://localhost:8088/api/notice';
```

### 服务启停

```javascript
// 启动服务
Server.start('notice');

// 停止服务
Server.stop('notice');

// 查询状态
Server.status('notice');
```

---

## 配置项

### 1. 公告 API 地址

| 配置项 | 常量名 | 默认值 | 说明 |
|--------|--------|--------|------|
| API 地址 | `ANNOUNCE_API_URL` | `http://localhost:8088/api/notice` | 公告接口的完整 URL |

**修改方式**: 编辑 `server-notice.js` 文件第 9 行。

```javascript
const ANNOUNCE_API_URL = 'http://your-api-server.com/api/notice';
```

### 2. 轮询间隔

| 配置项 | 常量名 | 默认值 | 说明 |
|--------|--------|--------|------|
| 轮询间隔 | `POLL_INTERVAL_MS` | `3 * 60 * 1000` (3分钟) | 每次请求的间隔时间(毫秒) |

**修改方式**: 编辑 `server-notice.js` 文件第 11 行。

```javascript
// 5分钟轮询一次
const POLL_INTERVAL_MS = 5 * 60 * 1000;
```

### 3. 系统 PID

| 配置项 | 常量名 | 默认值 | 说明 |
|--------|--------|--------|------|
| 系统服务 PID | `SYSTEM_PID` | `10000` | 使用 ProcessManager.SERVER_SERVICE_PID |

**说明**: 服务使用内核预留的系统服务 PID，无需修改。

### 4. 存储键名

| 配置项 | 常量名 | 值 | 说明 |
|--------|--------|-----|------|
| 历史记录键 | `STORAGE_KEY` | `_server_notice_history` | LStorage 中存储已接收公告历史的键名 |

**说明**: 用于持久化已接收公告的 subTime，避免重启后重复显示。

---

## 公告等级响应方式

服务通过 `level` 字段区分公告的重要程度，采取不同的响应策略：

| 等级 (level) | 类型 | 响应方式 | 通知持续时间 |
|--------------|------|----------|--------------|
| 0 | 普通 | 仅记录日志，不弹窗 | - |
| 1 | 重要 | 弹出系统通知 | 8秒后自动关闭 |
| 2 | 紧急 | 弹出系统通知 | 不自动关闭（需用户手动关闭） |

### 代码实现

```javascript
// server-notice.js 第 126-132 行
if (level === 2) {
    notify(0);  // 不自动关闭
} else if (level === 1) {
    notify(8000);  // 8秒后关闭
} else {
    // level 0：仅记录，不弹窗
}
```

---

## API 响应格式约定

### 请求

- **方法**: GET
- **URL**: `ANNOUNCE_API_URL` 指定的地址
- **跨域**: 如有跨域需求，服务端需返回 CORS 头

### 响应格式

服务支持两种响应格式：

#### 1. 单条公告

```json
{
    "code": 200,
    "data": {
        "level": 2,
        "title": "系统维护通知",
        "content": "将于今晚22:00进行系统维护...",
        "subTime": "2026-02-19 18:00:00"
    }
}
```

#### 2. 多条公告（数组）

```json
{
    "code": 200,
    "data": [
        {
            "level": 2,
            "title": "系统维护通知",
            "content": "将于今晚22:00进行系统维护...",
            "subTime": "2026-02-19 18:00:00"
        },
        {
            "level": 1,
            "title": "版本更新",
            "content": "ZerOS v1.1.0 已发布",
            "subTime": "2026-02-18 10:00:00"
        }
    ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `level` | number | 是 | 公告等级：0=普通, 1=重要, 2=紧急 |
| `title` | string | 是 | 公告标题 |
| `content` | string | 是 | 公告内容 |
| `subTime` | string | 是 | 公告发布时间，用于去重（唯一标识） |

---

## 数据持久化

### 已接收公告历史

- **存储位置**: LStorage (`_server_notice_history`)
- **存储内容**: 已显示过的公告 `subTime` 数组
- **持久化方式**: 使用 `LStorage.setSystemStorage()` 写入
- **加载方式**: 服务启动时使用 `LStorage.getSystemStorage()` 读取

### 去重机制

服务通过 `subTime` 字段判断公告是否已显示：

1. **启动时** - `__init__()` 调用 `loadFromStorage()` 从 LStorage 加载历史
2. **获取公告后** - 检查 `subTime` 是否在 `_receivedTimes` 数组中
3. **新公告处理** - 调用 `processAnnouncement()` 并通过 `addReceivedTime()` 保存到 LStorage

### 存储流程

```
__init__() 
    ↓
loadFromStorage() 
    ↓
LStorage.getSystemStorage('_server_notice_history')
    ↓
赋值给 _receivedTimes 数组
    ↓
fetchOnce() 获取新公告
    ↓
addReceivedTime(subTime)
    ↓
saveToStorage()
    ↓
LStorage.setSystemStorage('_server_notice_history', _receivedTimes)
```

---

## 生命周期

| 方法 | 调用时机 | 说明 |
|------|----------|------|
| `__init__()` | 服务首次启动 | 初始化，加载历史记录 |
| `__start__()` | 服务开始运行 | 立即执行首次拉取，设置定时器 |
| `__stop__()` | 服务停止 | 清除定时器，停止轮询 |
| `__status__()` | 查询服务状态 | 返回运行状态和相关信息 |
| `__info__()` | 获取服务信息 | 返回服务名称、版本、描述 |

### __status__ 返回值

```javascript
{
    running: true,                      // 是否运行中
    lastFetchTime: 1771495000000,      // 最后获取时间戳 (毫秒)
    lastSubTime: "2026-02-19 18:00:00", // 最后处理的公告时间
    lastError: null,                    // 最后错误信息
    apiUrl: "(已配置)"                  // API 配置状态
}
```

### __info__ 返回值

```javascript
{
    name: 'SystemNotice',
    version: '1.0',
    description: 'ZerOS系统公告通知获取'
}
```

---

## 日志记录

服务使用 `KernelLogger` 记录日志：

| 级别 | 场景 |
|------|------|
| `info` | 服务启动、停止、运行状态 |
| `debug` | 加载历史记录数量、处理公告 |
| `warn` | 加载/保存历史失败、API 请求失败 |

### 日志示例

```
[内核][server-announcement] [信息] init
[内核][server-announcement] [调试] 从 LStorage 加载了 5 条公告历史
[内核][server-announcement] [信息] start, interval=180s
[内核][server-announcement] [信息] 处理公告 level=2 subTime=2026-02-19 18:00:00 title=系统维护
[内核][server-announcement] [警告] 拉取公告失败: HTTP 404
```

---

## 故障排查

### 常见问题

#### 1. 跨域错误

```
Access to fetch at 'http://xxx' from origin 'http://localhost:8089' has been blocked by CORS policy
```

- **原因**: 公告 API 不支持 CORS
- **解决**: 服务端配置 CORS 响应头，允许 ZerOS 页面源

#### 2. 公告重复显示

- **原因**: LStorage 存储失败或历史未正确加载
- **排查步骤**:
  1. 检查浏览器控制台是否有 `LStorage.getSystemStorage is not a function` 错误
  2. 检查 LStorage 是否正确初始化
  3. 查看日志中 `从 LStorage 加载了 X 条公告历史`

#### 3. 通知不显示

- **原因**: 通知权限或 NotificationManager 异常
- **排查步骤**:
  1. 检查内核通知模块是否加载
  2. 检查权限配置
  3. 查看内核日志中通知相关错误

#### 4. 加载/保存历史失败

```
[内核][server-announcement] [警告] 加载公告历史失败: LStorage.getSystemStorage is not a function
```

- **原因**: LStorage 未正确加载或方法不存在
- **解决**: 确保 LStorage.js 已随 BootLoader 加载

---

## 自启动配置

服务支持开机自启：

1. 打开「系统服务管理」
2. 找到 `notice` 服务
3. 勾选「系统启动时自动启动此服务」
4. 保存配置

系统会创建 `SYSTEM_STARTUP` 类型的计划任务，实现开机自动启动。

---

## 相关文档

- [ServerNotice 服务文档](../SERVER/ServerNotice.md) - 服务详细说明
- [ServerExpansion API](../API/ServerExpansion.md) - 服务扩展加载与启停
- [NotificationManager API](../API/NotificationManager.md) - 通知创建与权限
- [LStorage API](../API/LStorage.md) - 本地存储系统
- [ServiceModule.md](../SERVER/ServiceModule.md) - 服务模块编写规范
