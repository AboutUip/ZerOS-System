# Application API 文档

## 概述

`Application API` 是 ZerOS 后端服务提供的**应用商店接口**，用于管理 ZerOS 应用程序（.zom 安装包）的发布、浏览、搜索等功能。

## 基本信息

| 项目 | 说明 |
|------|------|
| 基础路径 | `/api/application` |
| 认证 | 公开接口无需认证，管理接口需要管理员登录 |
| CORS | 支持跨域（`@CrossOrigin(origins = "*")`） |
| 响应格式 | JSON |

## 公开接口

### 获取应用列表

获取所有已发布应用的列表（按下载量排序）。

**接口**: `GET /api/application/list`

**请求参数**: 无

**响应示例**:

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    {
      "id": 1,
      "name": "ZerOS Terminal",
      "author": "ZerOS Team",
      "version": "1.0.0",
      "copyright": "© 2026 ZerOS",
      "description": "ZerOS 官方终端程序",
      "iconUrl": "http://localhost:8088/uploads/icons/xxx.png",
      "screenshotUrls": [
        "http://localhost:8088/uploads/screenshots/xxx1.png",
        "http://localhost:8088/uploads/screenshots/xxx2.png"
      ],
      "packageUrl": "http://localhost:8088/uploads/packages/terminal.zom",
      "packageSize": 1024000,
      "downloadCount": 150,
      "isActive": true,
      "createdAt": "2026-02-16T10:00:00"
    }
  ],
  "total": 1
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Long | 应用ID |
| `name` | String | 应用名称 |
| `author` | String | 作者 |
| `version` | String | 版本号 |
| `copyright` | String | 版权信息 |
| `description` | String | 应用介绍 |
| `iconUrl` | String | 程序图标URL |
| `screenshotUrls` | String[] | 宣传图URL数组（1-5张） |
| `packageUrl` | String | .zom安装包远程链接 |
| `packageSize` | Long | 安装包大小（字节） |
| `downloadCount` | Integer | 下载次数 |
| `isActive` | Boolean | 是否激活 |
| `createdAt` | LocalDateTime | 创建时间 |

---

### 搜索应用

根据关键字搜索应用（搜索范围：名称、作者、描述）。

**接口**: `GET /api/application/search`

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `keyword` | String | 是 | 搜索关键字 |

**响应示例**:

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    {
      "id": 1,
      "name": "ZerOS Terminal",
      "author": "ZerOS Team",
      "version": "1.0.0",
      "packageUrl": "http://localhost:8088/uploads/packages/terminal.zom",
      "downloadCount": 150
    }
  ],
  "total": 1
}
```

---

### 获取应用详情

获取单个应用的详细信息。

**接口**: `GET /api/application/{id}`

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | Long | 应用ID |

**响应示例**:

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": 1,
    "name": "ZerOS Terminal",
    "author": "ZerOS Team",
    "version": "1.0.0",
    "copyright": "© 2026 ZerOS",
    "description": "ZerOS 官方终端程序，提供强大的命令行功能...",
    "iconUrl": "http://localhost:8088/uploads/icons/xxx.png",
    "screenshotUrls": [
      "http://localhost:8088/uploads/screenshots/xxx1.png",
      "http://localhost:8088/uploads/screenshots/xxx2.png"
    ],
    "packageUrl": "http://localhost:8088/uploads/packages/terminal.zom",
    "packageSize": 1024000,
    "downloadCount": 150,
    "createdAt": "2026-02-16T10:00:00"
  }
}
```

---

### 下载应用

记录下载次数并返回安装包链接。

**接口**: `POST /api/application/{id}/download`

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | Long | 应用ID |

**响应示例**:

```json
{
  "code": 200,
  "msg": "success",
  "data": "http://localhost:8088/uploads/packages/terminal.zom"
}
```

**调用示例**:

```javascript
fetch('http://localhost:8088/api/application/1/download', { method: 'POST' })
  .then(res => res.json())
  .then(data => {
    if (data.code === 200) {
      window.location.href = data.data;
    }
  });
```

---

## 管理接口

管理接口位于 `/admin/application` 路径下，需要管理员登录后才能访问。

### 发布程序

发布新的应用程序。

**接口**: `POST /admin/application/create`

**请求参数** (Multipart/form-data):

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | String | 是 | 软件名称 |
| `author` | String | 是 | 作者 |
| `version` | String | 是 | 版本号 |
| `copyright` | String | 否 | 版权信息 |
| `description` | String | 否 | 介绍 |
| `iconFile` | MultipartFile | 否 | 程序图标（建议 PNG/JPG） |
| `screenshotFiles` | MultipartFile[] | 否 | 宣传图（1-5张） |
| `packageFile` | MultipartFile | 是 | .zom 安装包 |

**响应**: 重定向到 `/admin/application`

---

### 删除程序

删除已发布的应用程序。

**接口**: `POST /admin/application/delete/{id}`

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | Long | 应用ID |

**响应**: 重定向到 `/admin/application`

---

## 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功返回 |
| 401 | 未授权（管理接口） |
| 404 | 应用不存在 |
| 500 | 服务器内部错误 |

## 调用示例

### 获取应用列表 (JavaScript)

```javascript
fetch('http://localhost:8088/api/application/list')
  .then(res => res.json())
  .then(data => {
    if (data.code === 200) {
      console.log('应用列表:', data.data);
      console.log('总数:', data.total);
    }
  });
```

### 搜索应用 (JavaScript)

```javascript
fetch('http://localhost:8088/api/application/search?keyword=terminal')
  .then(res => res.json())
  .then(data => {
    if (data.code === 200) {
      console.log('搜索结果:', data.data);
    }
  });
```

### 获取详情并下载 (JavaScript)

```javascript
const appId = 1;

fetch(`http://localhost:8088/api/application/${appId}`)
  .then(res => res.json())
  .then(data => {
    if (data.code === 200) {
      const app = data.data;
      console.log(`应用: ${app.name} v${app.version}`);
      console.log(`包地址: ${app.packageUrl}`);
    }
  });

fetch(`http://localhost:8088/api/application/${appId}/download`, { method: 'POST' })
  .then(res => res.json())
  .then(data => {
    if (data.code === 200) {
      window.location.href = data.data;
    }
  });
```

## 相关文档

- [Notice API](./Notice.md) - 系统公告获取接口
