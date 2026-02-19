# zomunpack.ps1

将 ZerOS `.zom` 程序包解包到指定目录。

## 概述

`zomunpack.ps1` 是 ZerOS 的解包工具，用于将 `.zom` 程序包（ZIP 格式）解包到指定目录。这对于分析已打包的应用程序、检查包内容或修改现有程序包非常有用。

## 语法

```powershell
.\zomunpack.ps1 <PackagePath> [OutputDir] [options]
```

## 参数

### 位置参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `PackagePath` | string | 是 | .zom 包文件路径 |
| `OutputDir` | string | 否 | 输出目录路径，默认值为 `(PackageName)` 文件夹 |

### 命名参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `-ListOnly` | switch | 仅列出包内容，不解包 |
| `-Overwrite` | switch | 覆盖已存在的文件 |
| `-Help` | switch | 显示帮助信息 |

## 使用方式

### 方式一：解包到默认目录

将 .zom 文件解包到同名的文件夹中：

```powershell
.\zomunpack.ps1 D:\dist\myapp.zom
```

输出目录：`D:\dist\myapp\`

### 方式二：解包到指定目录

```powershell
.\zomunpack.ps1 D:\dist\myapp.zom D:\projects\myapp
```

### 方式三：列出包内容

仅查看包内文件列表，不解包：

```powershell
.\zomunpack.ps1 D:\dist\myapp.zom -ListOnly
```

输出示例：

```
Package: D:\dist\myapp.zom
Contents:

  application.json                              312 B
  main.js                                       2.4 KB
  style.css                                     1.1 KB
  assets/images/logo.png                        45.2 KB
  assets/fonts/roboto.woff2                     78.3 KB

Total: 5 file(s)
```

### 方式四：覆盖已存在的文件

```powershell
.\zomunpack.ps1 D:\dist\myapp.zom D:\projects\myapp -Overwrite
```

## 输出信息

解包完成后，脚本会显示：

1. **提取的文件数量**：例如 `Extracted 5 file(s)`
2. **应用程序信息**：如果存在 `application.json`，会显示应用名称和版本

示例：

```
zomunpack: Extracting to D:\projects\myapp
zomunpack: Extracted 5 file(s)
zomunpack: Application: myapp v1.0.0
```

## 解包规则

1. **目录结构**：保持 ZIP 内的目录结构不变
2. **application.json**：如果包内包含此文件，解包后会保留
3. **空目录**：ZIP 中的空目录会被创建
4. **非空检查**：默认情况下，如果输出目录非空且包含文件，脚本会报错并退出

## 错误处理

脚本会检查以下错误情况：

- 包文件不存在
- 包文件没有 `.zom` 后缀
- 输出目录非空（除非使用 `-Overwrite`）
- 包文件损坏或不是有效的 ZIP 文件

## 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 失败（错误信息会显示在 stderr） |

## 与 zompkg.ps1 配合使用

`zompkg.ps1` 和 `zomunpack.ps1` 是一对互补工具：

```powershell
# 打包
.\zompkg.ps1 D:\projects\myapp D:\dist\myapp.zom

# 解包
.\zomunpack.ps1 D:\dist\myapp.zom D:\projects\myapp
```

## 注意事项

1. PowerShell 执行策略可能需要调整才能运行脚本：
   ```powershell
   Set-ExecutionPolicy -RemoteSigned -Scope CurrentUser
   ```
2. 使用 `-ListOnly` 时不会创建任何文件，非常适合检查包内容
3. 如果输出目录已存在且为空，脚本会正常解包
