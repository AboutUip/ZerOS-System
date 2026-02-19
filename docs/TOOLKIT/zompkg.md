# zompkg.ps1

将目录打包成 ZerOS `.zom` 程序包（ZIP 格式）。

## 概述

`zompkg.ps1` 是 ZerOS 的打包工具，用于将应用程序目录打包成可分发的 `.zom` 文件。`.zom` 文件本质上是 ZIP 格式的压缩包，其中包含应用程序的所有文件以及必需的 `application.json` 配置文件。

## 语法

```powershell
.\zompkg.ps1 <SourceDir> [OutputPath] [options]
```

## 参数

### 位置参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `SourceDir` | string | 是 | 源目录路径 |
| `OutputPath` | string | 否 | 输出 .zom 文件路径，默认值为 `(SourceDir).zom` |

### 命名参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `-Config` | string | - | 从 JSON 文件读取完整配置（必须包含 name 字段） |
| `-Name` | string | - | 程序名称（与 -Config 二选一） |
| `-Version` | string | "1.0.0" | 程序版本号 |
| `-Script` | string | `(Name).js` | 主脚本路径 |
| `-Description` | string | "" | 程序描述 |
| `-Type` | string | "GUI" | 程序类型：`GUI` 或 `CLI` |
| `-Icon` | string | - | 图标文件路径 |
| `-Styles` | string | - | 样式文件路径（逗号分隔多个） |
| `-Assets` | string | - | 资源路径（逗号分隔多个） |
| `-Category` | string | "other" | 分类：`system`、`utility`、`game`、`other` |
| `-Help` | switch | - | 显示帮助信息 |

## 使用方式

### 方式一：使用源目录中的 application.json

如果源目录已包含 `application.json` 文件：

```powershell
.\zompkg.ps1 D:\dev\myapp
```

输出：`D:\dev\myapp.zom`

### 方式二：使用配置文件

从指定的 JSON 文件读取配置：

```powershell
.\zompkg.ps1 D:\dev\myapp C:\out\myapp.zom -Config D:\dev\app.json
```

配置文件示例（`app.json`）：

```json
{
    "name": "myapp",
    "version": "1.0.0",
    "description": "My Application",
    "script": "main.js",
    "type": "GUI",
    "category": "utility"
}
```

### 方式三：自动生成 application.json

使用命令行参数自动生成配置：

```powershell
.\zompkg.ps1 D:\dev\myapp -Name myapp -Script main.js -Type GUI -Category utility
```

## application.json 生成规则

当使用 `-Name` 参数时，脚本会自动生成以下结构的 `application.json`：

```json
{
    "name": "<Name>",
    "version": "<Version>",
    "description": "<Description>",
    "script": "<Script>",
    "styles": [<Styles>],
    "icon": "<Icon>",
    "type": "<Type>",
    "autoStart": false,
    "priority": 5,
    "allowMultipleInstances": true,
    "assets": [<Assets>],
    "category": "<Category>"
}
```

## 打包规则

1. **ZIP 根目录**：所有文件直接放在 ZIP 根目录，不包含父文件夹
2. **application.json 优先**：
   - 如果通过 `-Config` 或 `-Name` 提供了配置，打包时会使用该配置
   - 如果源目录也有 `application.json`，会被覆盖
3. **输出路径**：自动添加 `.zom` 后缀（如果未指定）

## 示例

### 示例 1：基本打包

```powershell
.\zompkg.ps1 D:\projects\myapp
```

### 示例 2：指定输出路径

```powershell
.\zompkg.ps1 D:\projects\myapp C:\dist\myapp.zom
```

### 示例 3：使用完整配置

```powershell
.\zompkg.ps1 D:\projects\myapp -Config D:\configs\app.json
```

### 示例 4：自动生成配置

```powershell
.\zompkg.ps1 D:\projects\myapp -Name "My App" -Script app.js -Type GUI -Category utility
```

### 示例 5：包含样式和资源

```powershell
.\zompkg.ps1 D:\projects\myapp -Name myapp -Styles "style.css,theme.css" -Assets "images/,fonts/"
```

## 错误处理

脚本会检查以下错误情况：

- 源目录不存在
- 配置文件不存在或无效
- 配置文件缺少 `name` 字段
- 没有提供任何配置方式（无 application.json 且无 -Config/-Name）

## 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 失败（错误信息会显示在 stderr） |

## 注意事项

1. PowerShell 执行策略可能需要调整才能运行脚本：
   ```powershell
   Set-ExecutionPolicy -RemoteSigned -Scope CurrentUser
   ```
2. 临时文件会在打包完成后自动删除（包含重试机制，防止文件锁定）
3. 输出路径的父目录会在不存在时自动创建
