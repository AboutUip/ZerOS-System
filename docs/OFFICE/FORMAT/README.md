# 文件格式

本目录用于定义 ZerOS Office 自研文件格式及容器结构。

## 文档列表

- [ZDOC 规范](./ZDOC.md) - ZerOS 文字文档格式（ZIP 容器 + Description.json + pages/assets）

## 通用约束

- ZerOS Office 文档格式以“容器 + 描述文件 + 内容目录”组织
- 规范使用 MUST/SHALL/MAY 关键词描述强制性与可选项
- 同一主版本号内新增字段 MUST 保持向后兼容；移除/破坏性变更 MUST 升级主版本号
