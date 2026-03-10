# ZerOS Toolkit

ZerOS 工具包包含用于开发、打包与解包 ZerOS 应用程序及壁纸的 **PowerShell 脚本**，与 `dev/toolkit/` 目录一一对应。

**脚本位置：** 项目根目录下 `dev/toolkit/`（如 `dev/toolkit/zompkg.ps1`）。  
**运行环境：** Windows + PowerShell 5.1 或 PowerShell Core (pwsh)。  
**执行方式：** 在项目根目录执行 `.\dev\toolkit\脚本名.ps1 [参数]`，或先 `cd dev\toolkit` 再执行。

---

## 工具列表

### zompkg.ps1 — 打包 .zom 程序

将目录打包成 ZerOS `.zom` 程序包（ZIP 格式），与系统内 `D:/bin/zompkg.js` 行为一致。

**功能：**
- 将指定目录打包成 `.zom` 文件
- 支持从源目录读取 `application.json`
- 支持通过 `-Config` 参数指定 JSON 配置文件
- 支持通过 `-Name`、`-Script`、`-Type` 等参数自动生成 `application.json`

**位置：** `dev/toolkit/zompkg.ps1`  
**详细文档：** [zompkg.md](zompkg.md)

---

### zomunpack.ps1 — 解包 .zom 程序

将 ZerOS `.zom` 程序包解包到指定目录。

**功能：**
- 解包 `.zom` 文件到指定目录
- 支持 `-ListOnly` 列出包内容而不解包
- 支持 `-Overwrite` 覆盖已存在文件
- 自动检测并显示 application.json 信息

**位置：** `dev/toolkit/zomunpack.ps1`  
**详细文档：** [zomunpack.md](zomunpack.md)

---

### paperpkg.ps1 — 打包 .paper 壁纸

将壁纸源目录打包为 WallpaperEngine `.paper` 包（ZIP 格式），符合 PAPER-FORMAT。

**功能：**
- 将指定目录打包成 `.paper` 文件
- 源目录需包含：`preview.png` / `preview.svg` / `preview.jpg`（其一）、`README.json`、`run.js`、`config.json`；可选 `assets/`
- 支持 `-SkipValidation` 跳过必需文件校验后强制打包

**位置：** `dev/toolkit/paperpkg.ps1`  
**详细文档：** [paperpkg.md](paperpkg.md)  
**格式规范：** `dev/wallpaper-engine/assets/doc/PAPER-FORMAT.md`

---

### paperunpack.ps1 — 解包 .paper 壁纸

将 WallpaperEngine `.paper` 包解压到指定目录。

**功能：**
- 解包 `.paper` 文件到指定目录
- 支持 `-ListOnly` 仅列出包内容
- 支持 `-Overwrite` 覆盖已存在文件

**位置：** `dev/toolkit/paperunpack.ps1`  
**详细文档：** [paperunpack.md](paperunpack.md)

---

## 与 dev/toolkit 的对应关系

| 文档（docs/TOOLKIT/） | 脚本（dev/toolkit/） | 说明     |
|----------------------|----------------------|----------|
| [zompkg.md](zompkg.md) | zompkg.ps1           | 打包 .zom |
| [zomunpack.md](zomunpack.md) | zomunpack.ps1   | 解包 .zom |
| [paperpkg.md](paperpkg.md) | paperpkg.ps1       | 打包 .paper |
| [paperunpack.md](paperunpack.md) | paperunpack.ps1 | 解包 .paper |

更多用法与约定见 **`dev/toolkit/README.md`**。
