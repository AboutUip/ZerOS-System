# 第8章：漏洞安全测试

## 章节简介

安全是 ZerOS 系统的核心关注点之一。本章深入讲解 ZerOS 系统的安全漏洞分析与修复，包括已修复的历史漏洞、待修复的漏洞、安全测试方法论、以及安全开发最佳实践。

## 本章小节速览

### [8.1 漏洞概述与统计](section1_overview/README.md)
- [8.1.1 ZerOS 安全漏洞概述](section1_overview/8.1.1_ZerOS安全漏洞概述.md)
- [8.1.2 漏洞统计与分析](section1_overview/8.1.2_漏洞统计与分析.md)

### [8.2 权限绕过漏洞](section2_privilege_escalation/README.md)
- [8.2.1 CVS-ZEROS-001: 权限提升漏洞](section2_privilege_escalation/8.2.1_CVS-ZEROS-001权限提升漏洞.md)
- [8.2.2 CVS-ZEROS-012: 敏感文件写入导致用户提权](section2_privilege_escalation/8.2.2_CVS-ZEROS-012敏感文件写入导致用户提权.md)

### [8.3 存储相关漏洞](section3_storage/README.md)
- [8.3.1 CVS-ZEROS-005: LStorage 写入权限检查缺失](section3_storage/8.3.1_CVS-ZEROS-005_LStorage写入权限检查缺失.md)
- [8.3.2 CVS-ZEROS-006: LStorage 内核模块调用验证绕过](section3_storage/8.3.2_CVS-ZEROS-006_LStorage内核模块调用验证绕过.md)

### [8.4 后端安全漏洞](section4_backend/README.md)
- [8.4.1 CVS-ZEROS-008: FSDirve 未授权远程文件操作](section4_backend/8.4.1_CVS-ZEROS-008_FSDirve未授权远程文件操作.md)
- [8.4.2 CVS-ZEROS-011: 密码使用弱哈希算法](section4_backend/8.4.2_CVS-ZEROS-011_密码使用弱哈希算法.md)

### [8.5 安全测试与最佳实践](section5_best_practices/README.md)
- [8.5.1 安全测试方法论](section5_best_practices/8.5.1_安全测试方法论.md)
- [8.5.2 安全开发最佳实践](section5_best_practices/8.5.2_安全开发最佳实践.md)

## 学习目标

完成本章学习后，读者应能够：
1. 理解 ZerOS 系统的安全架构和潜在攻击面
2. 掌握常见漏洞类型（权限绕过、存储问题、后端安全）
3. 理解漏洞的发现、复现、修复流程
4. 能够在开发中避免常见安全问题
5. 理解安全测试的方法论

---

**[返回章节目录](../README.md)** | **[上一章：第7章 驱动服务与 Zom 程序](../chapter7_driver_zom/README.md)** | **[下一章：第9章 示例与实践](../chapter9_examples/README.md)**
