# 扩展与插件（PLUGINS）

本目录为 ZerOS **扩展与插件**的编写与使用说明，包括语言包、服务模块等。

## 文档索引

| 文档 | 描述 | 适用对象 |
|------|------|----------|
| [语言包格式 (LanguagePack.md)](./LanguagePack.md) | D/plugins 语言包存放位置与 JSON 格式 | 多语言支持、语言包维护 |
| [服务模块编写 (ServiceModule.md)](./ServiceModule.md) | D/server 服务模块命名、接口约定与生命周期 | 系统服务开发者 |

## 扩展类型概览

### 语言扩展（LanguagesExpansion）

- **目录**：`D/plugins`（虚拟路径），项目内 `system/service/DISK/D/plugins/`
- **用途**：语言包 JSON 的加载、当前语言设置、按常量名获取本地化文本
- **API 文档**：[LanguagesExpansion API](../API/LanguagesExpansion.md)

### 服务扩展（ServerExpansion）

- **目录**：`D/server`（虚拟路径），项目内 `system/service/DISK/D/server/`
- **用途**：自识别并加载 `server-xxx.js` 服务模块，提供 start/stop 生命周期管理
- **API 文档**：[ServerExpansion API](../API/ServerExpansion.md)
- **编写指南**：[服务模块编写 (ServiceModule.md)](./ServiceModule.md)

## 相关链接

- [文档中心](../README.md)
- [API 文档索引](../API/README.md)
- [开发者指南](../DEVELOPER_GUIDE.md)
