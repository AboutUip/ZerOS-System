# paperpkg.ps1

将壁纸源目录打包为 WallpaperEngine `.paper` 包（ZIP 格式），符合 PAPER-FORMAT。

## 概述

`paperpkg.ps1` 用于将壁纸工程目录打包成可分发的 `.paper` 文件。`.paper` 为 ZIP 格式，根目录需包含规范要求的必需文件；格式详见 `dev/wallpaper-engine/assets/doc/PAPER-FORMAT.md`。

## 语法

```powershell
.\paperpkg.ps1 <SourceDir> [OutputPath] [options]
```

## 参数

### 位置参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `SourceDir` | string | 是 | 壁纸源目录路径 |
| `OutputPath` | string | 否 | 输出 .paper 文件路径，默认值为 `(SourceDir).paper` |

### 命名参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `-SkipValidation` | switch | 跳过必需文件校验，强制打包 |
| `-Help` | switch | 显示帮助信息 |

## 源目录要求

- **必需文件**：`README.json`、`run.js`、`config.json`
- **预览图**：`preview.png`、`preview.svg`、`preview.jpg` 中至少一个
- **可选**：`assets/` 及其他文件；`index.html` 非必需（引擎提供引导）

未使用 `-SkipValidation` 时，缺少上述必需项会报错并退出。

## 示例

### 打包到默认路径（源目录同名 .paper）

```powershell
.\paperpkg.ps1 D:\dev\particle-mouse
```

输出：`D:\dev\particle-mouse.paper`

### 指定输出路径

```powershell
.\paperpkg.ps1 D:\dev\particle-mouse C:\out\particle-mouse.paper
```

### 跳过校验后打包

```powershell
.\paperpkg.ps1 D:\dev\my-wallpaper -SkipValidation
```

## 位置

脚本路径：**`dev/toolkit/paperpkg.ps1`**（相对于项目根）。  
格式规范：**`dev/wallpaper-engine/assets/doc/PAPER-FORMAT.md`**。
