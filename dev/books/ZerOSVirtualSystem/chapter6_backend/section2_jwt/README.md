# 第6.2节：JWT 认证服务

## 本节导读

JWT 认证服务是 ZerOS 后端安全体系的核心。本节详细讲解 randomSecurity（Token 签发）、jwtVerify（Token 校验）、以及 programPermissions（程序权限与 upid 分配）的完整实现。

## 本节小节

- [6.2.1 randomSecurity 服务详解](6.2.1_randomSecurity服务详解.md)
- [6.2.2 jwtVerify 验证中间件](6.2.2_jwtVerify验证中间件.md)
- [6.2.3 程序权限与 upid 分配](6.2.3_程序权限与upid分配.md)

## 学习目标

完成本节学习后，读者应能够：
1. 理解 JWT Token 的生成与校验原理
2. 掌握 randomSecurity 服务的签发与清除逻辑
3. 理解 jwtVerify 中间件的工作流程
4. 掌握 upid 的分配与权限管理机制

---

**[返回章节目录](../README.md)** | **[返回第6章目录](../README.md)**
