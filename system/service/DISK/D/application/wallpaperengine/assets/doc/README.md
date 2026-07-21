# 壁纸引擎文档

本目录下的 `.md` 文件会在托盘右键「查看API文档」中动态加载并渲染。

## 概述

壁纸引擎由**程序**与**服务**两部分组成：程序负责安装/启动服务、壁纸库管理（导入、启用/禁用、删除）与托盘交互；服务接管系统桌面壁纸层，提供 HTML/URL 渲染与事件。

---

## 程序（WallpaperEngine）

- **程序名**：`wallpaperengine`
- **导出对象**：`window.WALLPAPERENGINE`
- **安装路径**：`D:/application/wallpaperengine/`（ZOM 安装后）

### 功能

- **首次运行**：将 `assets/server-wallpaperengine.js` 部署到 `D/server/server-wallpaperengine.js`，并调用 `Server.loadAll`、`Server.start('wallpaperengine')`。
- **启动后**：转入后台，在托盘显示图标。
- **托盘右键菜单**：
  - **程序自启**：通过计划任务（SYSTEM_STARTUP）开启/关闭开机自启；点击后立即更新菜单显示状态（已启用/已禁用），无需重新打开菜单。
  - **查看API文档**：打开本目录（`assets/doc/`）下所有 `.md` 的动态渲染窗口。
  - **库**：打开壁纸库窗口（导入、列表、详情、启用/禁用、删除）。
  - **重启服务**：重新启动壁纸引擎服务。
- **关闭程序**：需从托盘菜单或任务管理器操作；关闭窗口即请求退出进程。

### 壁纸库

- **入口**：托盘右键 →「库」。
- **左侧列表**：已安装壁纸（来自注册表且缓存目录仍存在的项）；点击项在右侧显示详情。
- **导入壁纸**：工具栏「导入壁纸」→ 文件选择器选 `.paper` 文件 → 解压到 `D:/cache/wallpaper/{id}/` 并写入注册表，刷新列表。
- **详情右侧操作**：
  - **启用**：将当前壁纸设为唯一启用（`enabledId`），确保服务已启动后派发 `zeros-wallpaperengine-setcontenturl` 加载该壁纸；启用与其它壁纸互斥。
  - **禁用**：清空 `enabledId` 并派发 `zeros-wallpaperengine-clear`。
  - **删除壁纸**：从注册表移除该项、若为当前启用则清空 `enabledId`，再删除 `D:/cache/wallpaper/{id}/` 目录；**优先删除注册表信息**，再删缓存，保证列表与注册表一致。

### 注册表与启动自动加载

- **存储**：LocalStorage 键 `wallpaperengine.library`。
- **结构**：`{ version: 1, items: [ { id, path, sourceFile?, name?, addedAt?, ... } ], enabledId: string | null }`。
- **启动时**：程序转入后台后读取注册表；若存在 `enabledId` 且对应缓存目录仍存在，则先确保服务已启动，再派发 `setcontenturl` 加载该壁纸；若目录不存在则清空 `enabledId` 并写回注册表，并派发 `clear`。
- **列表刷新**：打开库时会根据 `FileSystem.list(CACHE_WALLPAPER_DIR)` 修剪注册表：移除目录已不存在的 items，若 `enabledId` 对应目录不存在则置为 `null`。

### 卸载

卸载程序时会执行 `uninstall.js`：删除 `D:/server/server-wallpaperengine.js`，并移除本程序的「程序自启」计划任务（若存在）。

---

## 服务（server-wallpaperengine）

- **服务 ID**：`wallpaperengine`（对应文件 `server-wallpaperengine.js`）
- **运行位置**：部署在 `D/server/server-wallpaperengine.js`，由 ServerExpansion 加载；通过 `Server.start('wallpaperengine')` 启动后才会执行 `__init__`、`__start__`。

### 能力

- 在桌面容器（`#gui-container`）**首位**插入壁纸层（`.wallpaper-engine-layer`），`z-index: 1`，位于主题背景之上、桌面图标与窗口之下。有内容时层带不透明背景；**无壁纸时层 `display: none`**，不遮挡系统默认壁纸。
- 通过**自定义事件**设置 HTML 内容、URL（iframe）或清空内容；有内容时层可接收点击等事件（`pointer-events: auto`），无内容时穿透（`pointer-events: none`）。
- **壁纸 iframe 内事件桥接**：iframe 内右键、单击、鼠标按下会通过 `postMessage` 传到主窗口，服务在壁纸层上派发合成的 `MouseEvent`（contextmenu 使用合成事件对象调用 `ContextMenuManager._handleContextMenu`），使桌面右键菜单、点击关闭菜单等行为与点击桌面一致。
- 事件需在**主窗口**（与 `gui-container` 同文档）的 `window` 上派发；壁纸引擎程序与服务同文档，故程序内 `window.dispatchEvent` 即可生效。

- 壁纸包格式（.paper 包结构、README.json、config.json、run.js 生命周期）见 **[PAPER-FORMAT.md](./PAPER-FORMAT.md)**。
- 服务事件名、参数与示例见 **[API.md](./API.md)**。
