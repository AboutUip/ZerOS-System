# ZOM Application Sources

Source folders for building ZerOS `.zom` packages.

**Note:** When you run `zompkg.ps1`, it creates a temporary ZIP file in this directory (e.g. `.zompkg_xxxxx.zip`) and deletes it after copying to the output `.zom`. If the script is interrupted or delete fails, these temp files may remain; you can delete them manually. They are ignored by `.gitignore`.

Pack with:

```powershell
.\dev\toolkit\zompkg.ps1 dev\zom-sources\<app-folder> [output.zom]
```

## diskmanager

磁盘分区管理程序（当前版本 **1.0.6**）。功能：查看分区列表与详情、新建/删除/合并分区、格式化/调整大小；调用 DISKMANAGER 后端 API，使用 ZerOS 对话框与权限。

- **Source:** `diskmanager/`
- **Package:** `diskmanager.zom`（由 `dev/toolkit/zompkg.ps1` 从 `diskmanager/` 打包）
- **Install:** 将 `diskmanager.zom` 复制到 ZerOS 后执行 `zominstall diskmanager.zom`（需管理员权限）。
- **UI:** 无边框窗口、深色简约主题（#0e1016）；标题栏与功能按钮同一行，功能按钮在左侧（刷新、新建分区、格式化/调整大小、删除分区、合并分区），右侧为最小化/最大化/关闭；支持自定义标题栏拖拽（`noTitleBar` + `dragHandle`）、`borderless`。
