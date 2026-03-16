# 第6章：系统依赖的后端实现

## 章节简介

ZerOS 虽然是一个运行在浏览器端的虚拟操作系统，但其虚拟文件系统需要真实的后端服务来持久化数据。本章深入讲解 ZerOS **后端服务层**的完整实现，包括 PHP、Python、Java 三种后端实现，以及各服务的核心 API、鉴权机制、架构设计。

读者将理解：为何需要后端服务、后端服务如何与前端内核协同工作、各服务的职责边界与实现细节、安全机制（JWT 鉴权、Token 验证、IP 白名单）、以及如何扩展后端服务。学完后可 100% 理解 ZerOS 前后端协作的每一处设计，并能自行开发新的后端服务或修复安全问题。

## 本章小节速览

### [6.1 文件系统驱动 FSDirve](section1_fsdrive/README.md)
- [6.1.1 FSDirve 职责与整体架构](section1_fsdrive/6.1.1_FSDirve职责与整体架构.md)
- [6.1.2 核心操作实现详解](section1_fsdrive/6.1.2_核心操作实现详解.md)
- [6.1.3 JWT 鉴权与 upid 机制](section1_fsdrive/6.1.3_JWT鉴权与upid机制.md)

### [6.2 JWT 认证服务](section2_jwt/README.md)
- [6.2.1 randomSecurity 服务详解](section2_jwt/6.2.1_randomSecurity服务详解.md)
- [6.2.2 jwtVerify 验证中间件](section2_jwt/6.2.2_jwtVerify验证中间件.md)
- [6.2.3 程序权限与 upid 分配](section2_jwt/6.2.3_程序权限与upid分配.md)

### [6.3 压缩与解压缩服务](section3_compression/README.md)
- [6.3.1 CompressionDirve 接口规范](section3_compression/6.3.1_CompressionDirve接口规范.md)
- [6.3.2 ZIP 压缩解压缩实现](section3_compression/6.3.2_ZIP压缩解压缩实现.md)

### [6.4 媒体代理服务](section4_media_proxy/README.md)
- [6.4.1 ImageProxy 图片代理](section4_media_proxy/6.4.1_ImageProxy图片代理.md)
- [6.4.2 AudioProxy 音频代理](section4_media_proxy/6.4.2_AudioProxy音频代理.md)
- [6.4.3 VideoProxy 视频代理](section4_media_proxy/6.4.3_VideoProxy视频代理.md)

### [6.5 AI 代理服务](section5_ai_proxy/README.md)
- [6.5.1 讯飞星火 AI 代理](section5_ai_proxy/6.5.1_讯飞星火AI代理.md)
- [6.5.2 通义千问 AI 代理](section5_ai_proxy/6.5.2_通义千问AI代理.md)

### [6.6 磁盘管理服务](section6_disk_manager/README.md)
- [6.6.1 DISKMANAGER 职责与接口](section6_disk_manager/6.6.1_DISKMANAGER职责与接口.md)
- [6.6.2 分区操作与配额管理](section6_disk_manager/6.6.2_分区操作与配额管理.md)

## 学习目标

完成本章学习后，读者应能够：
1. 理解 ZerOS 前后端分离架构的设计理念
2. 掌握 FSDirve 文件系统驱动的核心实现与鉴权机制
3. 理解 JWT Token 生成、校验、与 upid 权限分配的完整流程
4. 掌握压缩服务、媒体代理、AI 代理的工作原理
5. 能够自行开发新的后端服务或扩展现有服务
6. 理解常见后端安全漏洞与修复方案

---

**[返回章节目录](../README.md)** | **[上一章：第5章 系统内核模块关联与交互](../chapter5_kernel_interaction/README.md)** | **[下一章：第7章 驱动服务与 Zom 程序](../chapter7_driver_zom/README.md)**
