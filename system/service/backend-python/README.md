# ZerOS Python 后端

与 PHP/SpringBoot 后端提供相同 API 接口的 FastAPI 实现，支持 FSDirve、CompressionDirve、DISKMANAGER 以及 JWT 认证。

## 环境要求

- Python 3.10+
- 依赖：`fastapi`、`uvicorn`、`PyJWT`

## 快速开始

```bash
# 进入本目录
cd system/service/backend-python/

# 安装依赖
pip install -r requirements.txt

# 启动服务（默认端口 8000）
uvicorn main:app --host 0.0.0.0 --port 8000
```

## 配置

通过环境变量配置（可选）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| JWT_SECRET | JWT 签名密钥（生产必须设置） | 开发用默认密钥 |
| JWT_ENFORCE | 是否强制 JWT 校验 | false |
| JWT_EXPIRE_DAYS | JWT 过期天数，0 表示不过期 | 30 |
| JWT_WHITELIST_ENABLED | 是否启用机器 ID 白名单 | false |

## 前端访问

**方式一：单端口运行（推荐）**  
仅启动 Python 后端即可，前端与 API 均由同一端口提供：
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```
访问 `http://localhost:8000/test/index.html`，端口 8000 时自动使用 Python 后端，可避免 401 错误。

**方式二：前后端分离**  
前端由 PHP 服务器（端口 8089）提供，访问时添加参数：
`http://localhost:8089/test/index.html?backend=PYTHON`。

## 提供的接口

- `/system/service/randomSecurity` - JWT 签发（SystemToken/UserToken，与 PHP 兼容）
- `/system/service/programPermissions` - 程序权限注册与 upid 分配/回收
- `/system/service/FSDirve` - 文件系统操作
- `/system/service/CompressionDirve` - ZIP 压缩/解压
- `/system/service/DISKMANAGER` - 磁盘分区管理
- `/system/service/auth/jwt` - 机器 ID JWT 获取（可选，与 PHP 无此接口）
- `/system/service/RunPython` - Python 代码执行（实验性）

## JWT 与 upid 鉴权（与 PHP 完全兼容）

- **SystemToken**：系统启动时由 randomSecurity 签发，无需 upid
- **UserToken**：用户登录时由 randomSecurity 签发，调用 FSDirve/CompressionDirve/DISKMANAGER 时需在 URL 中传入 `upid`
- **upid**：程序启动时由 ProcessManager 调用 programPermissions 注册分配，程序退出时回收
