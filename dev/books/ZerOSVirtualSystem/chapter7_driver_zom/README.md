# 第7章：驱动服务与 Zom 程序

## 章节简介

本章深入讲解 ZerOS 的驱动服务系统与 Zom 程序（应用程序包）。驱动服务是 ZerOS 扩展内核功能的重要机制，而 Zom 是 ZerOS 应用程序的封装格式。本章将帮助读者理解驱动的加载机制、系统扩展的实现、以及 Zom 程序的打包与安装流程。

## 本章小节速览

### [7.1 系统驱动详解](section1_drivers/README.md)
- [7.1.1 系统驱动概述与加载机制](section1_drivers/7.1.1_系统驱动概述与加载机制.md)
- [7.1.2 CacheDrive 缓存驱动](section1_drivers/7.1.2_CacheDrive缓存驱动.md)
- [7.1.3 CryptDrive 加密驱动](section1_drivers/7.1.3_CryptDrive加密驱动.md)
- [7.1.4 NetworkManager 网络驱动](section1_drivers/7.1.4_NetworkManager网络驱动.md)

### [7.2 系统扩展](section2_expansion/README.md)
- [7.2.1 LanguagesExpansion 语言扩展](section2_expansion/7.2.1_LanguagesExpansion语言扩展.md)
- [7.2.2 ServerExpansion 服务扩展](section2_expansion/7.2.2_ServerExpansion服务扩展.md)

### [7.3 Zom 程序](section3_zom/README.md)
- [7.3.1 Zom 程序格式与打包](section3_zom/7.3.1_Zom程序格式与打包.md)
- [7.3.2 Zom 安装器实现](section3_zom/7.3.2_Zom安装器实现.md)
- [7.3.3 Zom 包管理工具](section3_zom/7.3.3_Zom包管理工具.md)

## 学习目标

完成本章学习后，读者应能够：
1. 理解 ZerOS 驱动服务的架构设计与加载机制
2. 掌握 CacheDrive、CryptDrive、NetworkManager 等核心驱动的实现
3. 理解系统扩展（LanguagesExpansion、ServerExpansion）的工作原理
4. 掌握 Zom 程序的打包格式与安装流程
5. 能够自行开发新的驱动或创建 Zom 程序包

---

**[返回章节目录](../README.md)** | **[上一章：第6章 系统依赖的后端实现](../chapter6_backend/README.md)** | **[下一章：第8章 漏洞安全测试](../chapter8_security/README.md)**
