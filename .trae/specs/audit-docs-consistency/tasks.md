# Tasks
- [ ] Task 1: 建立 docs/ 文档清单与一致性基线
  - [ ] 枚举 docs/ 下所有 markdown 文件并按模块分组（API/、SERVER/、PLUGINS/、顶层文档）
  - [ ] 定义一致性规则与统一模板（API 最小字段、链接规范、术语表）

- [ ] Task 2: API 文档对齐实现并补齐缺失说明
  - [ ] 逐个核对 docs/API/*.md 与实际实现（API 名称、参数、返回、权限、错误行为）
  - [ ] 为“不够详细”的 API 补齐：用途/入口/参数/返回/权限/错误/示例/边界条件
  - [ ] 标记或移除文档中实现已不存在的 API，并给出替代方案

- [ ] Task 3: 系统与服务文档一致性修订
  - [ ] 对齐 docs/ZEROS_KERNEL.md、SYSTEM_FLOW.md、DEVELOPER_GUIDE.md、KERNEL_DEVELOPER_GUIDE.md 与现实现行为
  - [ ] 对齐 docs/SERVER/*.md 与实际 ServerExpansion/服务脚本结构
  - [ ] 对齐 docs/PLUGINS/*.md 与插件加载机制与目录结构

- [ ] Task 4: 交叉引用与索引修复
  - [ ] 修复过时链接、错误文件名、路径格式不一致（如大小写、盘符、虚拟路径）
  - [ ] 更新 docs/README.md 与 docs/API/README.md（如存在）索引条目与最后更新日期

- [ ] Task 5: 文档一致性回归核验
  - [ ] 运行全量链接与引用校验（基于仓库内文件存在性）
  - [ ] 抽样校验关键 API 文档示例与权限描述可成立

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2 and Task 3
- Task 5 depends on Task 4

