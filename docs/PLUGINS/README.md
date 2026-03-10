# 扩展与插件（PLUGINS）

本目录为 ZerOS **扩展与插件**的编写与使用说明，包括语言包、服务模块等。

## 文档索引

| 文档 | 描述 | 适用对象 |
|------|------|----------|
| [语言包格式 (LanguagePack.md)](./LanguagePack.md) | D/plugins 语言包存放位置与 JSON 格式 | 多语言支持、语言包维护 |
| [NodeLibs 脚本文档 (nodeLibs/)](./nodeLibs/README.md) | system/assets/nodeLibs 各脚本文档（perf 等），按脚本分文件存放 | 运维、监控、扩展开发 |
| [服务文档 (SERVER)](../SERVER/README.md) | D/server 服务模块编写与各内置服务说明 | 系统服务开发者、运维 |

## 扩展类型概览

### 语言扩展（LanguagesExpansion）

- **目录**：`D/plugins`（虚拟路径），项目内 `system/service/DISK/D/plugins/`
- **用途**：语言包 JSON 的加载、当前语言设置、按常量名获取本地化文本
- **API 文档**：[LanguagesExpansion API](../API/LanguagesExpansion.md)

### 服务扩展（ServerExpansion）

- **目录**：`D/server`（虚拟路径），项目内 `system/service/DISK/D/server/`
- **用途**：自识别并加载 `server-xxx.js` 服务模块，提供 start/stop 生命周期管理
- **API 文档**：[ServerExpansion API](../API/ServerExpansion.md)
- **服务文档**：[服务文档（SERVER）](../SERVER/README.md) - 服务模块编写与各服务说明

### NodeLibs 脚本（NodeLibExpansion + nodeLibExec）

- **目录**：`system/assets/nodeLibs/`
- **用途**：白名单脚本在宿主 Node 环境执行，用于检测、性能采集等；由后端 nodeLibExec 调用，前端通过 NodeLib 服务（POOL > SERVER）或扩展手动触发
- **脚本文档**：[nodeLibs/](./nodeLibs/README.md) - 各脚本单独成文，见该目录下 README 与 perf.md 等

## 相关链接

- [文档中心](../README.md)
- [API 文档索引](../API/README.md)
- [开发者指南](../DEVELOPER_GUIDE.md)
