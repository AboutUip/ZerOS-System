# 壁纸引擎 API 参考

服务通过**主窗口上的自定义事件**控制壁纸层，不经过进程管理器，无 kernel API。以下事件需在**主窗口**（与 `#gui-container` 同文档）的 JavaScript 中派发，例如由主窗口内加载的脚本或通过 postMessage 桥接后派发。

---

## 事件一览

| 事件名 | 说明 |
|--------|------|
| `zeros-wallpaperengine-setcontent` | 设置壁纸层为 HTML 字符串 |
| `zeros-wallpaperengine-setcontenturl` | 设置壁纸层为 iframe（URL 或 data URL） |
| `zeros-wallpaperengine-clear` | 清空壁纸内容，恢复系统主题背景 |

---

## zeros-wallpaperengine-setcontent

将壁纸层内容设为一段 HTML 字符串（直接写入层的 `innerHTML`）。适合静态或简单动态壁纸。

### 派发方式

```javascript
window.dispatchEvent(new CustomEvent('zeros-wallpaperengine-setcontent', {
  detail: { html: '<div style="...">...</div>' }
}));
```

### detail

| 字段 | 类型 | 说明 |
|------|------|------|
| `html` | string | 要渲染的 HTML。传空字符串或省略则清空层并设为 `pointer-events: none`。 |

### 行为

- 有内容时：层 `pointer-events: auto`，可点击/交互。
- 无内容时：层 `pointer-events: none`，事件穿透到桌面图标等。

---

## zeros-wallpaperengine-setcontenturl

将壁纸层内容设为一个 **iframe**，源为 URL 或 `data:text/html,...`。适合网页、在线壁纸或需要隔离的 HTML。

### 派发方式

```javascript
// 普通 URL
window.dispatchEvent(new CustomEvent('zeros-wallpaperengine-setcontenturl', {
  detail: { url: 'https://example.com/live-wallpaper.html' }
}));

// data URL（用 srcdoc 渲染）
window.dispatchEvent(new CustomEvent('zeros-wallpaperengine-setcontenturl', {
  detail: { url: 'data:text/html,' + encodeURIComponent('<html>...</html>') }
}));
```

### detail

| 字段 | 类型 | 说明 |
|------|------|------|
| `url` | string | 完整 URL 或 `data:text/html,<html>...</html>`。传空则清空 iframe 并设为无交互。 |

### 行为

- 若 `url` 以 `data:text/html` 开头，使用 iframe 的 `srcdoc` 渲染；否则设置 `src`。
- 有内容时层 `pointer-events: auto`，无内容时为 `none`。

---

## zeros-wallpaperengine-clear

清空壁纸层（HTML 或 iframe），恢复系统主题背景显示。

### 派发方式

```javascript
window.dispatchEvent(new CustomEvent('zeros-wallpaperengine-clear'));
```

无 `detail`，无需参数。

---

## 壁纸层说明

- **位置**：`#gui-container` 的第一个子节点，`z-index: 1`。
- **尺寸**：`width: 100%`、`height: 100%`，随容器变化。
- **类名**：`.wallpaper-engine-layer`；iframe 使用 `.wallpaper-engine-iframe`。
- **状态**：服务 `__status__()` 返回 `active` 表示当前有内容，`hasLayer` 表示层已创建并挂载。
- **无壁纸时**：层会 `display: none`，不遮挡系统默认/主题壁纸；有内容时显示并带不透明背景。
- **iframe 内事件**：壁纸 bootstrap 内会监听 `contextmenu`、`click`、`mousedown`，通过 `postMessage` 发送到主窗口；服务收到后在壁纸层派发合成事件，使桌面右键菜单与单击（如关闭菜单）行为正常。

---

## 使用注意

1. **调用环境**：事件必须在**主窗口**的 `window` 上派发。壁纸引擎 GUI 程序与服务器脚本均运行在同一主文档中，因此程序内直接 `window.dispatchEvent` 即可被服务接收。若其它在 iframe 中运行的程序需要控制壁纸，需通过 postMessage 等与主窗口通信，由主窗口脚本再派发上述事件。
2. **服务已启动**：需先通过 `Server.start('wallpaperengine')` 启动服务，否则无人监听事件。壁纸库「启用」操作会自动确保服务已启动后再派发 `setcontenturl`。
3. **安全**：直接设置 HTML 时注意 XSS；来自不可信来源的内容建议用 `setcontenturl` + `data:text/html` 或外部 URL 放在 iframe 中隔离。
