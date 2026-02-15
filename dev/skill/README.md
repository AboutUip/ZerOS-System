# ZerOS Development Skills 使用指南

本目录包含了 ZerOS 项目开发的技能指南（Skills），用于指导 AI 助手进行 ZerOS 相关开发工作。

## Skills 列表

1. **zeros-kernel-interaction** - 如何与 ZerOS 内核/系统交互
2. **zeros-bin-development** - 如何开发 bin 程序（CLI 命令）
3. **zeros-server-development** - 如何开发系统服务
4. **zeros-kernel-module-development** - 如何开发内核模块或驱动扩展
5. **zeros-gui-development** - 如何开发 GUI 程序

## 如何在 Cursor 中加载 Skills

### 方法 1: 移动到 Cursor Skills 目录（推荐）

为了让 Cursor 自动识别和加载这些 skills，需要将它们移动到 Cursor 的 skills 目录：

#### 项目级 Skills（推荐）

将 skills 复制到项目根目录的 `.cursor/skills/` 目录：

```bash
# 在项目根目录执行
mkdir -p .cursor/skills
cp -r dev/skill/* .cursor/skills/
```

**目录结构：**
```
ZerOS/
├── .cursor/
│   └── skills/
│       ├── zeros-kernel-interaction/
│       │   └── SKILL.md
│       ├── zeros-bin-development/
│       │   └── SKILL.md
│       ├── zeros-server-development/
│       │   └── SKILL.md
│       ├── zeros-kernel-module-development/
│       │   └── SKILL.md
│       └── zeros-gui-development/
│           └── SKILL.md
└── dev/
    └── skill/  # 原始位置（保留作为备份）
```

**优点：**
- 项目团队成员都可以使用
- 版本控制友好（可以提交到 Git）
- 项目特定的 skills

#### 个人级 Skills

将 skills 复制到用户目录的 `~/.cursor/skills/` 目录：

**Windows:**
```bash
# PowerShell
mkdir $env:USERPROFILE\.cursor\skills -Force
xcopy /E /I dev\skill $env:USERPROFILE\.cursor\skills\
```

**macOS/Linux:**
```bash
mkdir -p ~/.cursor/skills
cp -r dev/skill/* ~/.cursor/skills/
```

**优点：**
- 所有项目都可以使用
- 个人定制化

**缺点：**
- 不会随项目一起提交到 Git
- 团队成员需要单独配置

### 方法 2: 使用符号链接（高级）

如果希望保持 skills 在 `dev/skill/` 目录，但让 Cursor 也能识别，可以使用符号链接：

**Windows (PowerShell 管理员权限):**
```powershell
# 创建符号链接
New-Item -ItemType SymbolicLink -Path ".cursor\skills" -Target "dev\skill"
```

**macOS/Linux:**
```bash
ln -s dev/skill .cursor/skills
```

### 方法 3: 手动引用（临时）

如果不想移动文件，可以在对话中直接引用 skill 文件：

```
请参考 dev/skill/zeros-kernel-interaction/SKILL.md 来帮助我...
```

## 验证 Skills 是否加载成功

### 检查方法

1. **查看 Cursor 设置**
   - 打开 Cursor 设置
   - 搜索 "skills" 或 "agent skills"
   - 查看已加载的 skills 列表

2. **测试 Skill 触发**
   - 在对话中提及相关关键词，例如：
     - "如何开发 GUI 程序" → 应该触发 `zeros-gui-development`
     - "如何调用内核 API" → 应该触发 `zeros-kernel-interaction`
     - "如何开发 bin 命令" → 应该触发 `zeros-bin-development`

3. **查看 Agent 响应**
   - 如果 skill 已加载，AI 助手会自动应用相关指南
   - 响应会包含 skill 中的具体指导内容

## Skills 的工作原理

### Skill 文件结构

每个 skill 都是一个 Markdown 文件，包含：

1. **YAML Frontmatter**（必需）
   ```yaml
   ---
   name: skill-name
   description: Skill description with trigger keywords
   ---
   ```

2. **Markdown 内容**
   - 详细的开发指南
   - 代码示例
   - 最佳实践
   - 常见问题

### Skill 触发机制

Cursor 会根据以下因素自动选择和应用 skills：

1. **Description 字段**
   - 包含关键词匹配
   - 例如：`"Use when creating GUI programs"` 会在用户提到 GUI 开发时触发

2. **对话上下文**
   - 用户的问题和代码上下文
   - 当前打开的文件类型

3. **项目结构**
   - 正在编辑的文件路径
   - 例如：编辑 `kernel/` 目录下的文件可能触发 `zeros-kernel-module-development`

## 更新和维护 Skills

### 更新 Skill

1. 编辑 `dev/skill/<skill-name>/SKILL.md`
2. 如果使用了方法 1，同步更新 `.cursor/skills/` 中的文件
3. 提交更改到 Git（如果是项目级 skills）

### 添加新 Skill

1. 在 `dev/skill/` 目录下创建新目录
2. 创建 `SKILL.md` 文件，包含：
   - YAML frontmatter（name 和 description）
   - 详细的开发指南内容
3. 复制到 `.cursor/skills/`（如果使用方法 1）

### Skill 命名规范

- 使用小写字母和连字符：`zeros-kernel-interaction`
- 名称应该清晰描述 skill 的用途
- 最大长度：64 字符

### Description 编写建议

- **使用第三人称**：描述 skill 的功能，而不是"我可以帮你..."
- **包含触发关键词**：例如 "Use when creating GUI programs"
- **具体明确**：说明 skill 的具体用途和适用场景

示例：
```yaml
description: Guide for developing GUI programs in ZerOS. Use when creating GUI applications, managing windows with GUIManager, handling events with EventManager, or developing graphical interfaces in ZerOS.
```

## 故障排除

### Skill 没有被触发

1. **检查文件位置**
   - 确认 skill 文件在正确的位置（`.cursor/skills/` 或 `~/.cursor/skills/`）
   - 确认目录结构正确（`skill-name/SKILL.md`）

2. **检查 YAML Frontmatter**
   - 确认 `name` 和 `description` 字段存在
   - 确认格式正确（前后有 `---`）

3. **检查 Description**
   - 确认 description 包含相关的触发关键词
   - 尝试在对话中使用这些关键词

4. **重启 Cursor**
   - 有时需要重启 Cursor 才能识别新添加的 skills

### Skill 内容不完整

- 检查 `SKILL.md` 文件是否完整
- 确认文件编码为 UTF-8
- 确认 Markdown 格式正确

## 最佳实践

1. **使用项目级 Skills**
   - 对于项目特定的开发指南，使用项目级 skills（`.cursor/skills/`）
   - 这样可以确保团队成员都有一致的开发指导

2. **保持 Skills 更新**
   - 随着项目发展，及时更新 skills
   - 添加新的代码示例和最佳实践

3. **编写清晰的 Description**
   - 好的 description 能让 AI 助手更准确地选择和应用 skill
   - 包含足够的触发关键词

4. **版本控制**
   - 将项目级 skills 提交到 Git
   - 这样可以追踪 skills 的变更历史

## 相关资源

- [Cursor Skills 官方文档](https://cursor.sh/docs/skills)
- [创建 Skills 指南](../../.cursor/skills-cursor/create-skill/SKILL.md)（如果存在）

## 注意事项

⚠️ **重要提示：**
- 不要将 skills 放在 `~/.cursor/skills-cursor/` 目录
- 这个目录是 Cursor 内置 skills 的保留目录
- 只使用 `.cursor/skills/`（项目级）或 `~/.cursor/skills/`（个人级）
