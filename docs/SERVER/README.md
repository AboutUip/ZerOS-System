# 服务文档（SERVER）

本目录存放 **D/server** 服务相关文档，包括服务模块编写约定与各内置服务的说明。

## 文档索引

| 文档 | 描述 |
|------|------|
| [服务模块编写 (ServiceModule.md)](./ServiceModule.md) | D/server 服务模块命名、接口约定与生命周期 |
| [通知服务 (ServerNotice.md)](./ServerNotice.md) | 内置通知服务说明、API 约定与 ZerOS API 使用 |
| [翻译服务 (ServerTranslate.md)](./ServerTranslate.md) | 内置翻译服务说明、POOL API（translateSimple/translate）与终端 debug |
| [进程堆内存服务 (ServerProcessMemory.md)](./ServerProcessMemory.md) | 内置进程堆内存读写服务、POOL API（getProcessMemoryInfo/readProcessHeap/writeProcessHeap）与内存编辑器支持 |

## 相关链接

- [ServerExpansion API](../API/ServerExpansion.md) - 服务扩展加载与启停；服务列表由内核/扩展自动加载（不依赖是否打开服务管理程序）；**权限**：程序通过 kernelAPI（Server.*）调用，需 SERVER_SERVICE_MANAGE
- [PermissionManager API](../API/PermissionManager.md) - 权限枚举（含 SERVER_SERVICE_MANAGE）
- [扩展与插件（PLUGINS）](../PLUGINS/README.md) - 语言包等扩展文档
- [文档中心](../README.md)
