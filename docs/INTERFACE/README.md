# ZerOS 后端接口文档

本文档提供 ZerOS **后端服务**的接口说明，包括 PHP/SpringBoot 提供的 HTTP 接口。内核与前端 API 文档见 [docs/API/](../API/README.md)。

## 后端服务列表

| 服务 | 文档 | 说明 |
|------|------|------|
| randomSecurity | [randomSecurity.md](./randomSecurity.md) | JWT 签发（Token 生成、清空） |
| jwtVerify | [jwtVerify.md](./jwtVerify.md) | JWT 校验规范（requireJWTVerify、upid） |
| FSDirve | [FSDirve.md](./FSDirve.md) | 文件系统驱动（读写、目录操作） |
| CompressionDirve | [CompressionDrive.md](./CompressionDrive.md) | ZIP/RAR 压缩解压 |
| DISKMANAGER | [DISKMANAGER.md](./DISKMANAGER.md) | 磁盘分区管理（创建、删除、合并） |
| BrowserProxy | [BrowserProxy.md](./BrowserProxy.md) | 浏览器网页代理（绕过 iframe 限制） |
| ImageProxy | [ImageProxy.md](./ImageProxy.md) | 图片代理（跨域图片加载） |
| audio-proxy | [audioProxy.md](./audioProxy.md) | 音频代理（跨域音频加载） |
| video-proxy | [videoProxy.md](./videoProxy.md) | 视频代理（跨域视频加载，支持 Range） |
| module-proxy | [moduleProxy.md](./moduleProxy.md) | ES 模块代理（MIME 类型、跨域） |
| AIProxy | [AIProxy.md](./AIProxy.md) | AI 代理（讯飞星火、通义千问） |
| programPermissions | [programPermissions.md](./programPermissions.md) | 程序权限注册（upid 分配） |
| networkDirve | [networkDirve.md](./networkDirve.md) | 网络驱动（TCP 端口监听、数据收发） |

## 鉴权与 upid

使用 **User JWT** 的接口（FSDirve、CompressionDirve、DISKMANAGER）必须在 GET 参数中携带 `upid`。详见 [RandomSecurity](../API/RandomSecurity.md) 与 [SystemInformation](../API/SystemInformation.md)。

## 相关文档

- [API 文档索引](../API/README.md) - 内核模块 API
- [ZEROS_KERNEL](../ZEROS_KERNEL.md) - 内核架构
- [SERVER/README](../SERVER/README.md) - D/server 服务模块
