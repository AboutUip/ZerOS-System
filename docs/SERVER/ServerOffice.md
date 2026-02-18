# Office 服务 (ServerOffice)

## 概述

Office 服务是 ZerOS 的 **D/server** 系统服务模块之一，用于承载 ZerOS Office 相关能力。v1 优先实现 **ZDOC 预览渲染**。

- 服务文件：`D:/server/server-office.js`
- 服务 ID：`office`
- POOL 暴露：`POOL.__GET__("SERVER", "Office")`

## 预览渲染（v1）

### API

服务启动后在 POOL 暴露以下方法：

- `Office.previewZdoc(path: string) -> Promise<{ description, pages, html }>`
  - `path`：ZerOS 虚拟路径，如 `D:/docs/a.zdoc`
  - 返回：
    - `description`：`Description.json` 内容
    - `pages`：按页输出的 `{ index, html }`
    - `html`：完整可直接预览的 HTML 文档（可用于 iframe.srcdoc）

- `Office.previewZdocBuffer(arrayBuffer: ArrayBuffer) -> Promise<{ description, pages, html }>`
  - 直接对内存中的 zdoc bytes 做预览，适合编辑器内联/测试场景

- `Office.disposePreviewResources() -> void`
  - 释放预览过程中创建的 objectURL（图片/音视频等）

### 渲染规则

- 渲染顺序：页首（若存在）→ 内容 → 页尾（若存在）
- `container` 子项顺序：
  - 若存在 `order`：按 `order` 声明顺序
  - 否则：按子节点 `id` 字典序升序，保证稳定预览
- 资产解析：
  - `image/audio/video`：若 `content.value` 为 URL（含任意 scheme）则直接作为外链，否则从 zdoc zip 内的 `assets/images|audios|videos` 读取并使用 objectURL 预览
  - `asset`：若为 URL 则外链，否则从 `assets/` 根下解析

## 启动方式

程序应通过进程管理器注入的 `kernelAPI` 调用 Server.*（需要 `SERVER_SERVICE_MANAGE` 权限）：

```js
await kernelAPI.call('Server.start', ['office'])
```

也可使用系统“服务管理器”启动/停止该服务。

