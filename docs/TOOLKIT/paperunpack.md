# paperunpack.ps1

将 WallpaperEngine `.paper` 包解压到指定目录。

## 概述

`paperunpack.ps1` 用于将 `.paper` 包（ZIP 格式）解压到本地目录，便于查看或二次编辑壁纸工程。

## 语法

```powershell
.\paperunpack.ps1 <PackagePath> [OutputDir] [options]
```

## 参数

### 位置参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `PackagePath` | string | 是 | .paper 包文件路径 |
| `OutputDir` | string | 否 | 解压目标目录，默认值为包所在目录下与包同名的文件夹 |

### 命名参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `-ListOnly` | switch | 仅列出包内文件，不解压 |
| `-Overwrite` | switch | 解压时覆盖已存在的文件 |
| `-Help` | switch | 显示帮助信息 |

## 示例

### 解压到默认目录（与 .paper 同名的文件夹）

```powershell
.\paperunpack.ps1 D:\dist\particle-mouse.paper
```

解压到：`D:\dist\particle-mouse\`

### 解压到指定目录

```powershell
.\paperunpack.ps1 D:\dist\particle-mouse.paper D:\projects\particle-mouse
```

### 仅列出包内容

```powershell
.\paperunpack.ps1 D:\dist\particle-mouse.paper -ListOnly
```

### 覆盖已存在文件

```powershell
.\paperunpack.ps1 D:\dist\particle-mouse.paper D:\projects\particle-mouse -Overwrite
```

## 位置

脚本路径：**`dev/toolkit/paperunpack.ps1`**（相对于项目根）。
