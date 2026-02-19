# ZerOS Toolkit

ZerOS 工具包包含用于开发和打包 ZerOS 应用程序的脚本工具。

## 工具列表

### zompkg.ps1

将目录打包成 ZerOS `.zom` 程序包（ZIP 格式）。

**功能：**
- 将指定目录打包成 `.zom` 文件
- 支持从源目录读取 `application.json`
- 支持通过 `-Config` 参数指定 JSON 配置文件
- 支持通过 `-Name` 等参数自动生成 `application.json`

**位置：** `dev/toolkit/zompkg.ps1`

**详细文档：** [zompkg.md](zompkg.md)

---

### zomunpack.ps1

将 ZerOS `.zom` 程序包解包到指定目录。

**功能：**
- 解包 `.zom` 文件到指定目录
- 支持列出包内容而不解包
- 自动检测并显示 application.json 信息

**位置：** `dev/toolkit/zomunpack.ps1`

**详细文档：** [zomunpack.md](zomunpack.md)
