# ZerOS Toolkit

本目录用于存放 **PowerShell 工具脚本**，供开发、构建、打包或日常维护 ZerOS 项目时在 Windows 下使用。

## 目录说明

- **位置**：`dev/toolkit/`
- **用途**：集中管理 `.ps1` 等 PowerShell 脚本
- **运行环境**：Windows + PowerShell 5.1 或 PowerShell Core (pwsh)

## 使用方式

在项目根目录或任意位置调用脚本，例如：

```powershell
# 在项目根目录执行
.\dev\toolkit\脚本名.ps1 [参数]

# 或先进入 toolkit 目录
cd dev\toolkit
.\脚本名.ps1 [参数]
```

若系统默认禁止执行脚本，可临时放宽策略（仅当前用户、当前进程）：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Encoding

Scripts in this folder are in **ANSI** (Windows-1252) so that legacy PowerShell consoles and editors display them correctly. To re-save as ANSI in your editor: "Save with Encoding" -> "Western European (Windows 1252)" or "Windows ANSI".

## Scripts

### zompkg.ps1 — Pack .zom locally

在 Windows 下将目录打包为 ZerOS `.zom` 程序安装包（ZIP 格式），与 `D:/bin/zompkg.js` 行为一致。

**用法：**

```powershell
# 源目录已有 application.json
.\dev\toolkit\zompkg.ps1 D:\dev\myapp

# 指定输出路径
.\dev\toolkit\zompkg.ps1 D:\dev\myapp C:\out\myapp.zom

# 手动提供 application.json 数据（自动创建）
.\dev\toolkit\zompkg.ps1 D:\dev\myapp -Name myapp -Script myapp.js -Type GUI

# 使用外部 JSON 作为 application.json
.\dev\toolkit\zompkg.ps1 D:\dev\myapp C:\out.zom -Config D:\dev\app.json

# 查看帮助
.\dev\toolkit\zompkg.ps1 -Help
```

**主要参数：** `-Name`、`-Config`、`-Version`、`-Script`、`-Description`、`-Type`、`-Icon`、`-Styles`、`-Assets`、`-Category`。详见脚本内注释或 `-Help`。

---

### zomunpack.ps1 — 解包 .zom

将 ZerOS `.zom` 程序包（ZIP 格式）解压到指定目录。

**用法：**

```powershell
# 解压到与 .zom 同名的目录
.\dev\toolkit\zomunpack.ps1 D:\dist\myapp.zom

# 指定输出目录
.\dev\toolkit\zomunpack.ps1 D:\dist\myapp.zom D:\projects\myapp

# 仅列出包内文件
.\dev\toolkit\zomunpack.ps1 D:\dist\myapp.zom -ListOnly

# 覆盖已存在文件
.\dev\toolkit\zomunpack.ps1 D:\dist\myapp.zom -Overwrite

.\dev\toolkit\zomunpack.ps1 -Help
```

---

### paperpkg.ps1 — 打包 .paper 壁纸

将壁纸源目录打包为 WallpaperEngine `.paper` 包（ZIP 格式），符合 `PAPER-FORMAT`。源目录需包含：`preview.png` / `preview.svg` / `preview.jpg`（其一）、`README.json`、`run.js`、`config.json`；可选 `assets/`。**不需要** `index.html`（由引擎注入）。

**用法：**

```powershell
# 源目录已有必需文件，输出为 源目录.paper
.\dev\toolkit\paperpkg.ps1 D:\dev\particle-mouse

# 指定输出路径
.\dev\toolkit\paperpkg.ps1 D:\dev\particle-mouse C:\out\particle-mouse.paper

# 跳过必需文件校验（强制打包）
.\dev\toolkit\paperpkg.ps1 D:\dev\particle-mouse -SkipValidation

.\dev\toolkit\paperpkg.ps1 -Help
```

---

### paperunpack.ps1 — 解包 .paper 壁纸

将 WallpaperEngine `.paper` 包解压到指定目录。

**用法：**

```powershell
# 解压到与 .paper 同名的目录
.\dev\toolkit\paperunpack.ps1 D:\dist\particle-mouse.paper

# 指定输出目录
.\dev\toolkit\paperunpack.ps1 D:\dist\particle-mouse.paper D:\projects\particle-mouse

# 仅列出包内文件
.\dev\toolkit\paperunpack.ps1 D:\dist\particle-mouse.paper -ListOnly

# 覆盖已存在文件
.\dev\toolkit\paperunpack.ps1 D:\dist\particle-mouse.paper -Overwrite

.\dev\toolkit\paperunpack.ps1 -Help
```

---

## 工具规划建议

可在此目录下继续添加脚本，例如：

| 用途       | 示例脚本名      | 说明                     |
|------------|-----------------|--------------------------|
| 打包 ZOM   | `zompkg.ps1`    | 本地打包 .zom（已提供）  |
| 解包 ZOM   | `zomunpack.ps1` | 解压 .zom 到目录（已提供） |
| 打包 .paper | `paperpkg.ps1`  | 壁纸目录打包为 .paper（已提供） |
| 解包 .paper | `paperunpack.ps1` | 解压 .paper 到目录（已提供） |
| 构建/清理  | `build.ps1`     | 构建或清理输出目录       |
| 开发服务   | `serve.ps1`     | 启动本地开发/静态服务    |
| 代码检查   | `lint.ps1`      | 运行 ESLint 等检查       |

## 约定

- 脚本尽量**幂等**、可重复执行
- 重要操作前可加 `-Confirm` 或交互确认
- 路径建议使用项目根相对路径或通过参数传入，便于在不同机器上运行

## 相关文档

- ZerOS 项目根目录：`README.md`
- 开发技能与规范：`dev/skill/`
- ZOM 打包与安装：`docs/API/ZOMInstall.md`
- 壁纸格式规范（.paper）：`dev/wallpaper-engine/assets/doc/PAPER-FORMAT.md`
