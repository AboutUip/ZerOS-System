# docs/ 文档一致性审计与修订 Spec

## Why
docs/ 目录包含 ZerOS 的核心架构、API、插件与服务文档。随着实现演进，文档中的 API 签名、权限说明、目录路径与行为描述可能出现过时与不一致，影响安全审计、二次开发与测试复现。

## What Changes
- 对 docs/ 目录下所有文档进行一致性检查，识别并更正过时/无效信息
- 将 API 文档与实际实现对齐：名称、参数、返回结构、错误行为、权限要求、示例与注意事项
- 扩写不够详细的 API 文档：补齐最小可用说明（用途、调用方式、参数/返回、权限、示例、边界条件）
- 统一 docs/ 文档元信息与结构：标题、术语、路径格式、日期/版本标注、交叉引用链接
- 清理无用内容：删除或明确标记已废弃（Deprecated）能力，并给出替代方案

## Impact
- Affected specs: 开发者文档、API 参考、系统/服务流程说明
- Affected code: docs/ 目录下所有 markdown 文档（不涉及业务逻辑代码修改）

## ADDED Requirements
### Requirement: 文档-实现一致性
系统 SHALL 保证 docs/ 中所有 API 文档与当前代码实现一致。

#### Scenario: API 描述与实现对齐
- **WHEN** 打开任一 docs/API/*.md
- **THEN** 文档中描述的 API 名称、参数与返回字段 MUST 与实现一致
- **AND** 文档中标注的权限要求 MUST 与内核权限映射一致
- **AND** 文档中给出的示例 MUST 可在当前实现语义下成立（无需依赖已移除能力）

### Requirement: API 文档最小完备性
每个 API 文档 SHALL 至少包含：用途、调用入口、参数、返回、权限、错误/异常、示例。

#### Scenario: 不完整文档补齐
- **WHEN** 发现某 API 文档缺少上述任一要素
- **THEN** MUST 补齐并保持与代码一致

### Requirement: 过时信息处理
文档中的过时能力 SHALL 被删除或标记为 Deprecated，并提供迁移/替代说明。

#### Scenario: 废弃能力标注
- **WHEN** 文档描述的能力在代码中不存在或已被替换
- **THEN** 文档 MUST 明确标注并提供替代路径

## MODIFIED Requirements
### Requirement: 统一文档风格
docs/ 中文档的标题、术语、路径与链接格式 MUST 统一，避免同一概念多种表述导致歧义。

## REMOVED Requirements
无

