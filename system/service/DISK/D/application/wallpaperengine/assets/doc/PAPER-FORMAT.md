# 壁纸格式规范（.paper）

WallpaperEngine 支持的壁纸包扩展名为 **`.paper`**，本质为 **ZIP 压缩包**。解压后需包含约定文件，引擎按本规范解析、渲染与运行。

---

## 1. 包内结构

| 路径 | 必需 | 说明 |
|------|------|------|
| `preview.png` / `preview.svg` / `preview.jpg` | 是（三选一） | 壁纸预览图，用于列表/选择器展示 |
| `README.json` | 是 | 壁纸说明元数据，供 UI 渲染展示 |
| `run.js` | 是 | 壁纸核心脚本，定义生命周期与渲染逻辑 |
| `config.json` | 是 | 壁纸配置：常量 + 可配置项定义，供 UI 渲染与运行时注入 |
| `assets/` | 否 | 资源目录，可放图片、字体等；在 `run.js` 内使用**相对路径**引用（如 `assets/bg.png`） |

**壁纸只需提供以上核心文件。** 引擎会自行生成并注入 bootstrap 页面（等效的 index.html），负责创建容器、读取 config、加载 `run.js` 并调用 `init(options)` / `start()`，因此包内**不需要**也不推荐再包含 `index.html`。

除以上文件外，包内可含其他资源。**允许**包含 `assets` 文件夹；包内资源一律通过**相对路径**访问（例如 `assets/image.png`），也可配合引擎在 `init(options)` 中提供的 `resourceBase` 拼完整 URL。

---

## 2. README.json

壁纸的展示用说明与元数据，引擎或选择器 UI 会读取并渲染。

### 2.1 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 壁纸显示名称 |
| `version` | string | 否 | 版本号，建议语义化如 `"1.0.0"` |
| `author` | string | 否 | 作者 |
| `description` | string | 否 | 简短描述（一两句话） |
| `readme` | string | 否 | 长说明，支持 Markdown；用于详情页渲染 |
| `tags` | string[] | 否 | 标签，便于分类与搜索 |

### 2.2 示例

```json
{
  "name": "星空粒子",
  "version": "1.0.0",
  "author": "ZerOS",
  "description": "基于 Canvas 的粒子星空动效",
  "readme": "## 说明\n\n使用 requestAnimationFrame 驱动...",
  "tags": ["粒子", "星空", "动效"]
}
```

---

## 3. config.json

包含**不可配置常量**与**可配置项定义**。常量供脚本与 UI 只读使用；可配置项由 UI 渲染为表单，用户修改后的值在运行时注入 `run.js`。

### 3.1 顶层结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `constants` | object | 键值对，只读常量（如格式版本、内部标识） |
| `options` | array | 可配置项定义，每项见下表 |

### 3.2 constants（常量）

任意键值对，建议包含：

- `paperFormatVersion` (number)：与引擎兼容的纸格式版本，当前为 `1`。
- 其他脚本或 UI 需要的只读常量。

### 3.3 options[] 单项

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `key` | string | 是 | 配置键名，运行时通过 `config[key]` 访问 |
| `type` | string | 是 | 类型：`number` / `string` / `boolean` / `select` |
| `label` | string | 是 | 显示标签（如「动画速度」） |
| `default` | 任意 | 是 | 默认值 |
| `description` | string | 否 | 说明文案 |
| `min` | number | 否 | 仅 `number`：最小值 |
| `max` | number | 否 | 仅 `number`：最大值 |
| `step` | number | 否 | 仅 `number`：步进 |
| `choices` | array | 否 | 仅 `select`：`[{ "value": "...", "label": "..." }]` |

### 3.4 示例

```json
{
  "constants": {
    "paperFormatVersion": 1,
    "name": "星空粒子"
  },
  "options": [
    {
      "key": "speed",
      "type": "number",
      "label": "动画速度",
      "default": 1,
      "min": 0.1,
      "max": 3,
      "step": 0.1,
      "description": "粒子运动倍率"
    },
    {
      "key": "theme",
      "type": "select",
      "label": "主题",
      "default": "dark",
      "choices": [
        { "value": "dark", "label": "深色" },
        { "value": "light", "label": "浅色" }
      ]
    }
  ]
}
```

---

## 4. run.js 与生命周期

壁纸核心脚本，由引擎在**隔离环境**（如 iframe 或独立函数作用域）中加载并调用，必须实现约定生命周期并在 `stop` 时彻底释放资源，**避免切换壁纸时内存泄漏**。

### 4.1 导出约定

脚本执行后需向引擎暴露一个对象，方式二选一：

- **返回值**：若为函数/IIFE，其返回值即为壁纸对象；
- **全局变量**：在约定全局名（如 `WALLPAPER_RUN`）上挂载壁纸对象。

壁纸对象必须包含以下方法（均为函数）。

### 4.2 生命周期方法

| 方法 | 调用时机 | 说明 |
|------|----------|------|
| `init(options)` | 壁纸被加载时调用一次 | 初始化：创建 DOM、解析配置等。`options` 见下。 |
| `start()` | 壁纸被选中展示时调用 | 开始渲染/动画（如启动 requestAnimationFrame、定时器、事件监听）。 |
| `stop()` | 切换壁纸或引擎停止当前壁纸时调用 | **必须**在此释放所有资源并清空引用，见 4.4。 |

引擎保证：在一次 `stop()` 之后，不会再次调用该实例的 `start()` 或 `init()`，直到该壁纸被重新加载（新实例）。因此可在 `stop()` 内将定时器、监听、DOM 引用等置空。

### 4.3 init(options) 参数

| 字段 | 类型 | 说明 |
|------|------|------|
| `container` | HTMLElement | 壁纸层内挂载根节点，脚本仅在此节点内操作 DOM |
| `config` | object | 当前配置：`constants` 与用户修改后的可配置项键值对 |
| `previewUrl` | string | 可选，预览图 URL（引擎生成） |
| `resourceBase` | string | 可选，包内资源根 URL，用于加载包内图片等 |

### 4.4 stop() 与防内存泄漏

在 `stop()` 中**必须**：

- 清除所有 `setInterval` / `setTimeout`；
- 取消所有 `requestAnimationFrame`；
- 移除所有通过 `addEventListener` 注册的监听；
- 断开对 `container`、子节点及外部 DOM 的引用；
- 若有 Web Worker、Media 等，终止或释放。

未在 `stop()` 中清理的定时器、监听或 DOM 引用会导致切换壁纸后仍占用内存或继续执行，视为泄漏。

### 4.5 run.js 示例骨架

```javascript
(function () {
  'use strict';
  var rafId = null;
  var container = null;

  var api = {
    init: function (options) {
      container = options.container;
      var config = options.config || {};
      // 使用 config.speed, config.theme 等创建 DOM、预加载资源
    },
    start: function () {
      function tick() {
        // 渲染一帧
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    },
    stop: function () {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (container) {
        container.innerHTML = '';
        container = null;
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.WALLPAPER_RUN = api;
  }
  return api;
})();
```

---

## 5. 总结

- **.paper** = ZIP，内含 `preview.*`、`README.json`、`run.js`、`config.json`（**无需** index.html，由引擎注入 bootstrap）。
- **README.json**：展示用元数据与长说明（含 Markdown）。
- **config.json**：`constants`（只读）+ `options`（可配置项定义，供 UI 与运行时使用）。
- **run.js**：实现 `init(options)`、`start()`、`stop()`；在 `stop()` 中必须释放所有资源，避免切换壁纸时内存泄漏。

引擎在运行壁纸时自行生成 bootstrap 页面、读取 config、加载 `run.js` 并调用生命周期；选择器在加载 .paper 时按上述规范解析并渲染预览、说明与配置。

### 本地打包与解包

开发时可用项目内工具脚本（PowerShell）：

- **打包**：`dev/toolkit/paperpkg.ps1` — 将壁纸源目录打成 `.paper`，例：`.\dev\toolkit\paperpkg.ps1 .\dev\particle-mouse`
- **解包**：`dev/toolkit/paperunpack.ps1` — 将 `.paper` 解压到目录，例：`.\dev\toolkit\paperunpack.ps1 .\out.paper`  
详见 `dev/toolkit/README.md`。
