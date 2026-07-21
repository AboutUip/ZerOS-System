# WallpaperEngine 壁纸引擎

壁纸引擎程序及配套服务的**开发态源码**，位于 `dev/wallpaper-engine/`。本程序为**分发版**（通过 ZOM 安装），非系统内置；依赖 D/server 下的**壁纸引擎服务**提供壁纸层渲染。服务源码存放在程序 `assets` 下，安装/首次运行时会部署到 `D/server/`。

## 目录结构

```
dev/wallpaper-engine/
├── README.md                    # 本说明
├── application.json             # ZOM 清单（name/script/styles/icon/assets）
├── WallpaperEngine.js           # 主程序入口，导出 WALLPAPERENGINE
├── wallpaperengine.css          # 程序样式
├── uninstall.js                 # 卸载时清理服务与计划任务
├── icon.svg                     # 程序图标
└── assets/
    ├── server-wallpaperengine.js   # 服务源码（部署到 D/server/ 后由 ServerExpansion 加载）
    └── doc/                        # 程序内「查看API文档」加载的文档
        ├── README.md               # 概述与功能说明
        ├── API.md                  # 服务事件 API
        └── PAPER-FORMAT.md         # .paper 壁纸包格式规范
```

## 程序（WallpaperEngine）

- **程序名 / 资源 ID**：`wallpaperengine`
- **导出对象**：`window.WALLPAPERENGINE`
- **权限**：GUI 窗口、事件监听、后台/自退、服务管理、磁盘读写与列表、通知、计划任务等（见 `__info__`）。

### 行为概览

- **启动**：显示加载界面后转入后台，注册托盘；若未部署服务则从 `assets/server-wallpaperengine.js` 拷贝到 `D/server/server-wallpaperengine.js` 并 `Server.loadAll` / `Server.start('wallpaperengine')`。
- **托盘**：右键菜单提供「程序自启」「查看API文档」「库」「重启服务」等；关闭程序需从托盘或任务管理操作。
- **壁纸库**：从托盘打开「库」窗口，可**导入 .paper**、查看已安装壁纸列表与详情；在详情右侧可**启用/禁用**当前壁纸、**删除壁纸**（先删注册表再删缓存目录）。启用状态**互斥**，仅允许一个壁纸处于启用；启用后自动确保服务已启动并派发 `setcontenturl` 加载该壁纸。
- **注册表**：LocalStorage 键 `wallpaperengine.library`，结构为 `{ version: 1, items: [{ id, path, sourceFile?, name?, addedAt?, ... }], enabledId: string | null }`。`enabledId` 为当前启用的壁纸 id，下次启动程序后会自动加载该壁纸（先校验目录存在再拉服务并应用）。
- **缓存目录**：`D:/cache/wallpaper/`；每个壁纸解压到 `D:/cache/wallpaper/{id}/`。删除壁纸时优先移除注册表信息再 `FileSystem.delete` 对应目录；列表刷新时会根据磁盘目录修剪注册表（缺失目录的项及无效的 `enabledId` 会被清理）。

## 服务（server-wallpaperengine）

- **服务 ID**：`wallpaperengine`（与 `server-wallpaperengine.js` 对应）
- **运行位置**：部署到 `D/server/server-wallpaperengine.js` 后由 ServerExpansion 加载；通过 `Server.start('wallpaperengine')` 时执行 `__init__`、`__start__`。
- **契约**：实现 `__init__`、`__start__`、`__stop__`、`__status__`、`__info__` 并在脚本末尾调用 `window.__ZerOS_ServerExpansion_Register__(...)`。
- **能力**：在 `#gui-container` 首位插入壁纸层（z-index: 1），监听主窗口上的 `zeros-wallpaperengine-setcontent` / `zeros-wallpaperengine-setcontenturl` / `zeros-wallpaperengine-clear` 事件，设置 HTML 或 iframe URL 或清空。无壁纸时层 `display: none`，不遮挡系统默认壁纸；有内容时层带不透明背景并接收点击。壁纸 iframe 内右键/单击/按下会通过 postMessage 传到主窗口，由服务派发合成事件，使桌面右键菜单与点击关闭菜单等行为正常。

## 同步约定

- **源码**：以 `dev/wallpaper-engine/` 为开发态源码；部署目录为 `system/service/DISK/D/application/wallpaperengine/` 与 `system/service/DISK/D/server/server-wallpaperengine.js`。
- **方向**：日常开发在 dev 修改，部署时执行 **dev → DISK** 同步；需要从线上恢复时执行 **DISK → dev** 同步。避免用 DISK 覆盖 dev 后忘记反向同步导致 dev 丢失修改。

## 打包与安装

- **打包**：项目根目录使用 `dev/toolkit/zompkg.ps1`，源目录指定 `dev/wallpaper-engine`，输出为 `.zom`。
- **安装**：使用 zominstall 或文件管理器安装 `.zom`；安装后程序出现在应用列表。首次运行时会从 `D:/application/wallpaperengine/assets/server-wallpaperengine.js` 部署到 `D/server/` 并启动服务。

## 卸载

卸载时执行 `uninstall.js`：删除 `D/server/server-wallpaperengine.js`，并移除本程序的「程序自启」计划任务（若存在）。
