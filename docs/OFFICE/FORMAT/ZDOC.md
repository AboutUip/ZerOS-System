# ZDOC 规范

ZDOC 是 ZerOS 的“Word 文档”格式。ZDOC 文件本质为 ZIP 压缩包，压缩完成后将扩展名重命名为 `.zdoc`。

## 1. 容器格式

### 1.1 文件类型识别

- ZerOS SHALL 将扩展名为 `.zdoc` 的文件识别为 Word 文档（ZerOS Office Word）。
- ZDOC MUST 是一个可被标准 ZIP 解压工具解析的压缩包。

### 1.2 顶层目录结构（强制）

ZDOC 压缩包内 MUST 具备如下结构（大小写敏感）：

```text
<root>/
  Description.json
  pages/
  assets/
```

- `Description.json`：文档描述文件，记录文档“全部属性”（见 2 章）。
- `pages/`：分页内容目录，存放每一页的页面信息与内容数据（见 3 章）。
- `assets/`：资源目录，存放文档引用的外部资源（图片/字体/附件等）（见 4 章）。

## 2. Description.json（强制）

`Description.json` MUST 是 UTF-8 编码的 JSON 文档。

### 2.1 必填字段（v1）

```json
{
  "format": "zdoc",
  "formatVersion": 1,
  "id": "string",
  "title": "string",
  "createdAt": "number",
  "updatedAt": "number",
  "pageCount": "number"
}
```

- `format` MUST 为 `"zdoc"`。
- `formatVersion` MUST 为整数，当前规范为 `1`。
- `id` MUST 为文档全局唯一标识（建议使用随机 ID）。
- `title` MUST 为文档标题（允许为空字符串）。
- `createdAt`、`updatedAt` MUST 为时间戳（毫秒）。
- `pageCount` MUST 为非负整数，表示页数；`pages/` 下 MUST 存在从 `zd0` 到 `zd<pageCount-1>` 的连续目录。

### 2.2 推荐字段（v1，MAY）

```json
{
  "author": "string",
  "description": "string",
  "language": "string",
  "keywords": ["string"],
  "pageSize": { "width": "number", "height": "number", "unit": "px" },
  "margins": { "top": "number", "right": "number", "bottom": "number", "left": "number", "unit": "px" },
  "defaultStyle": {
    "fontFamily": "string",
    "fontSize": "number",
    "lineHeight": "number"
  }
}
```

说明：
- 规范允许你在 `Description.json` 中持续补充“全部属性”，新增字段 SHOULD 保持向后兼容。
- `pageSize/margins/defaultStyle` 为编辑器辅助字段，实现 MAY 用于画布/默认样式初始化；其单位/解释不影响本规范对响应式渲染的强制要求。

## 3. pages/（强制）

`pages/` 目录 MUST 存在。

### 3.1 页面目录结构（强制）

`pages/` 目录下 MUST 存在以页序号命名的子目录，命名规则如下：

- 子目录名 MUST 为 `zd<index>`（小写），其中：
  - `z` 表示 ZerOS
  - `d` 表示 zdoc
  - `<index>` 为从 `0` 开始的非负整数
- `<index>` MUST 连续且无断档：`zd0`、`zd1`、`zd2` ... 依次递增。
- 若缺失任意中间序号目录（例如存在 `zd0`、`zd2` 但缺少 `zd1`），该 ZDOC MUST 视为无效。

示例：

```text
pages/
  zd0/
  zd1/
  zd2/
```

### 3.2 单页内容文件（v1）

每个页面目录 `pages/zd<index>/` 下 MUST 存在以下三个文件（UTF-8 JSON）：

- `page.json`：仅用于标识该页的结构
- `style.json`：仅用于表示该页的样式
- `content.json`：仅负责该页的实际数据填充

#### 3.2.1 page.json（结构）

`page.json` 外层 MUST 为一个匿名对象，且：

- MUST 包含名为 `structure` 的数组
- MAY 额外包含名为 `metadata` 的对象，用于描述该页元数据
- MUST NOT 包含除 `structure`/`metadata` 之外的其他顶层字段

`structure` 数组的长度 MUST 为 1 到 3（含），且 MUST 按位置表达含义：

- 若 `structure.length === 1`：`structure[0]` 为“内容对象”
- 若 `structure.length === 2`：`structure[0]` 为“内容对象”，`structure[1]` 为“页首对象”
- 若 `structure.length === 3`：`structure[0]` 为“内容对象”，`structure[1]` 为“页首对象”，`structure[2]` 为“页尾对象”
- 不存在 `structure.length === 0` 或 `structure.length > 3` 的情况；出现即 MUST 视为无效

`structure` 数组中的每个元素 MUST 为一个对象，其键名表示该对象的 `id`（在当前页面内唯一且不可重复）。并且：

- 每个元素对象 MUST 只包含 1 个键（该键即节点 id）
- 该键对应的值 MUST 为一个对象，且 MUST 包含以下字段：
  - `id`：MUST 存在，且 MUST 与键名一致
  - `type`：MUST 存在，表示节点类型；其值 MUST 为以下之一：
    - `text` / `audio` / `video` / `image` / `url` / `asset` / `container`
  - `child`：MAY 存在，表示子数据集合（仅 `type === "container"` 时解析）

ID 隔离规则：

- 节点 `id` 的唯一性约束仅在“单页范围”内生效
- 不同页面（例如 `zd0` 与 `zd1`）允许出现相同的节点 `id`，互不干扰
- ZDOC 面向编辑器实现，不要求人类可读
- 最佳实践：节点 `id` 建议使用随机生成的 256 位唯一值（例如 64 位 16 进制字符串）

`type` 字段的值决定节点如何被实现与解析：

- 若 `type` 为不被支持的值，该页 MUST 视为无效
- ZDOC 通过 `child` 表示“包含关系”
- 仅当 `type === "container"` 时，实现才会解析其 `child`（其余类型即使存在 `child` 也 MUST 不解析）

节点示例：

```json
{
  "n1": {
    "id": "n1",
    "type": "container",
    "child": {}
  }
}
```

当 `type === "container"` 时，`child` MUST 存在且 MUST 为对象。`child` 对象下的每个键/值对 MUST 表示一个子节点，其中：

- `child` 的键名仅作为映射键使用，实现 MUST 以节点对象中的 `id` 为准
- `child` 的值 MUST 为节点对象，且 MUST 包含 `id/type`；`child` MAY 存在
- 同一 `container.child` 下的子节点 `id` MUST 唯一；若出现重复，该页 MUST 视为无效
- 若子节点 `type === "container"`，其 `child` MUST 存在且 MUST 为对象；递归适用于任意层级

容器子项顺序（v1）：

- `type === "container"` 的节点对象 MAY 额外包含 `order` 字段（数组），用于声明该容器子项的渲染顺序
- 若存在 `order`：
  - `order` MUST 为字符串数组
  - `order` MUST 列出该 `child` 下所有子节点 `id`，且每个 `id` MUST 恰好出现一次
  - 实现 MUST 按 `order` 顺序解析/渲染子项
- 若不存在 `order`：实现 MUST 按子节点 `id` 的字典序升序解析/渲染子项，以保证稳定顺序

`page.json` 最小结构示例：

```json
{
  "structure": [
    {
      "n1": {
        "id": "n1",
        "type": "container",
        "child": {}
      }
    }
  ]
}
```

`metadata`（可选）字段建议（v1，MAY）：

```json
{
  "metadata": {
    "createdBy": "string",
    "updatedBy": "string",
    "createdAt": "number",
    "updatedAt": "number",
    "tags": ["string"],
    "note": "string"
  }
}
```

说明：
- `createdAt/updatedAt` 建议为毫秒时间戳
- 具体扩展字段可继续增加，但 SHOULD 保持向后兼容

#### 3.2.2 style.json（样式）

`style.json` MUST 存在，且顶层 MUST 为一个匿名数组。

该数组 MAY 包含 N 个对象元素。每个对象 MUST 满足：

- MUST 包含 `link`：字符串，表示样式应用到 `page.json` 中某个节点的 `id`
- MUST 包含 `property`：对象，表示样式属性集合
- MUST NOT 包含除 `link/property` 之外的其他字段

`property` 的字段集合取决于被链接节点的 `type`。实现 MUST 仅解析该 `type` 支持的 property-key，其他字段 MUST 忽略。

`property` MAY 使用一层嵌套对象表示语义分组样式（例如 `border: { width, color }`）。实现 MUST 仅解析最多一层嵌套；若出现更深层级嵌套，实现 MUST 忽略该嵌套分支。

`property` 值类型约束（v1）：

- `property` 下的值 SHOULD 为字符串/数字/布尔
- 若使用一层嵌套语义分组：嵌套对象的值同样 SHOULD 为字符串/数字/布尔

建议语义分组（v1，MAY）：

- `layout`：尺寸与定位（width/height/min/max/align/translateX/translateY/top/left/right/bottom）
- `spacing`：间距（padding/margin/gap/indent/letterSpacing/wordSpacing）
- `border`：边框（borderWidth/borderColor/borderStyle/borderRadius）
- `background`：背景（backgroundColor）
- `transform`：变换（rotate/scale）
- `text`：文本（size/color/fontFamily/weight/style/decoration/lineHeight/whiteSpace/wrap/maxLines/ellipsis/align）
- `media`：多媒体（fit/position/poster/autoplay/loop/muted/controls/volume）
- `link`：链接（target/rel）
- `asset`：资源（label/icon/downloadName/openMode）

分组 key 映射（v1）：

- 在语义分组对象内，key 使用其“短名”形式；实现 MUST 将其映射为对应的平铺 property-key
  - `layout.width` → `width`
  - `layout.height` → `height`
  - `layout.minWidth` → `minWidth`
  - `layout.maxWidth` → `maxWidth`
  - `layout.minHeight` → `minHeight`
  - `layout.maxHeight` → `maxHeight`
  - `layout.align` → `align`
  - `layout.translateX` → `translateX`
  - `layout.translateY` → `translateY`
  - `layout.top` → `top`
  - `layout.left` → `left`
  - `layout.right` → `right`
  - `layout.bottom` → `bottom`
  - `spacing.padding` → `padding`
  - `spacing.paddingTop` → `paddingTop`
  - `spacing.paddingRight` → `paddingRight`
  - `spacing.paddingBottom` → `paddingBottom`
  - `spacing.paddingLeft` → `paddingLeft`
  - `spacing.margin` → `margin`
  - `spacing.marginTop` → `marginTop`
  - `spacing.marginRight` → `marginRight`
  - `spacing.marginBottom` → `marginBottom`
  - `spacing.marginLeft` → `marginLeft`
  - `spacing.gap` → `gap`
  - `spacing.indent` → `indent`
  - `spacing.letterSpacing` → `letterSpacing`
  - `spacing.wordSpacing` → `wordSpacing`
  - `border.width` → `borderWidth`
  - `border.color` → `borderColor`
  - `border.style` → `borderStyle`
  - `border.radius` → `borderRadius`
  - `background.color` → `backgroundColor`
  - `transform.rotate` → `rotate`
  - `transform.scale` → `scale`
  - `text.size` → `size`
  - `text.color` → `color`
  - `text.fontFamily` → `fontFamily`
  - `text.weight` → `weight`
  - `text.style` → `style`
  - `text.decoration` → `decoration`
  - `text.lineHeight` → `lineHeight`
  - `text.whiteSpace` → `whiteSpace`
  - `text.wrap` → `wrap`
  - `text.maxLines` → `maxLines`
  - `text.ellipsis` → `ellipsis`
  - `text.align` → `textAlign`
  - `media.fit` → `fit`
  - `media.position` → `position`
  - `media.poster` → `poster`
  - `media.autoplay` → `autoplay`
  - `media.loop` → `loop`
  - `media.muted` → `muted`
  - `media.controls` → `controls`
  - `media.volume` → `volume`
  - `link.target` → `target`
  - `link.rel` → `rel`
  - `asset.label` → `label`
  - `asset.icon` → `icon`
  - `asset.downloadName` → `downloadName`
  - `asset.openMode` → `openMode`

单位约束（v1）：

- 响应式优先：布局相关尺寸 MUST 使用百分比（`%`）
- 颜色 MUST 使用 16 进制（`#RRGGBB`）
- 文本字体大小（`size`）MUST 使用 `rem` 单位
- 容器尺寸（`width`/`height`）MUST 使用百分比（`%`）单位
- 与尺寸相关的 property-key（例如 `minWidth/maxWidth/minHeight/maxHeight/translateX/translateY/gap/padding/margin/borderWidth/borderRadius/letterSpacing/wordSpacing/indent`）MUST 使用百分比（`%`）单位
- 若某个 property-key 的值单位不符合本规范，实现 MUST 忽略该 property-key（不影响同一对象的其他合法 key）

样式合并规则（v1）：

- 若存在多条样式对象具有相同的 `link`，实现 MUST 按数组顺序依次合并
- 当同一 `property-key` 被重复赋值时：后出现的值 MUST 覆盖先出现的值
- 语义分组（嵌套一层）与平铺 key 同时存在时：实现 MUST 先解析平铺 key，再解析语义分组 key；若发生冲突，以语义分组内的值为准

支持的 `property-key`（v1，全部启用）：

- 通用（任意 type）：
  - `display`：`block|inline|none`
  - `opacity`：`0..1`
  - `visible`：`boolean`
  - `zIndex`：`integer`
  - `rotate`：`deg`
  - `scale`：`number`
  - `translateX`：`%`
  - `translateY`：`%`
  - `align`：`left|center|right`
  - `backgroundColor`：`#RRGGBB`
- 当 `type === "container"`：
  - `width`：`%`
  - `height`：`%`
  - `minWidth`：`%`
  - `maxWidth`：`%`
  - `minHeight`：`%`
  - `maxHeight`：`%`
  - `padding`：`%`
  - `paddingTop`：`%`
  - `paddingRight`：`%`
  - `paddingBottom`：`%`
  - `paddingLeft`：`%`
  - `margin`：`%`
  - `marginTop`：`%`
  - `marginRight`：`%`
  - `marginBottom`：`%`
  - `marginLeft`：`%`
  - `gap`：`%`
  - `direction`：`row|column`
  - `justify`：`start|center|end|space-between|space-around`
  - `items`：`start|center|end|stretch`
  - `wrap`：`nowrap|wrap`
  - `borderWidth`：`%`
  - `borderColor`：`#RRGGBB`
  - `borderStyle`：`solid|dashed|dotted|none`
  - `borderRadius`：`%`
  - `shadow`：字符串
- 当 `type === "text"`：
  - `size`：`rem`
  - `color`：`#RRGGBB`
  - `fontFamily`：字符串
  - `weight`：数字或 `normal|bold`
  - `style`：`normal|italic`
  - `decoration`：`none|underline|line-through`
  - `lineHeight`：`number`
  - `letterSpacing`：`%`
  - `wordSpacing`：`%`
  - `align`：`left|center|right|justify`
  - `indent`：`%`
  - `whiteSpace`：`normal|nowrap|pre|pre-wrap`
  - `wrap`：`word|char|none`
  - `maxLines`：`integer`
  - `ellipsis`：`boolean`
- 当 `type === "image"`：
  - `width`：`%`
  - `height`：`%`
  - `fit`：`contain|cover|fill|none|scale-down`
  - `position`：`center|top|bottom|left|right`
  - `borderRadius`：`%`
  - `opacity`：`0..1`
- 当 `type === "video"`：
  - `width`：`%`
  - `height`：`%`
  - `autoplay`：`boolean`
  - `loop`：`boolean`
  - `muted`：`boolean`
  - `controls`：`boolean`
  - `poster`：字符串（资源引用）
- 当 `type === "audio"`：
  - `autoplay`：`boolean`
  - `loop`：`boolean`
  - `muted`：`boolean`
  - `controls`：`boolean`
  - `volume`：`0..1`
- 当 `type === "url"`：
  - `color`：`#RRGGBB`
  - `decoration`：`none|underline`
  - `target`：`_self|_blank`
  - `rel`：字符串
- 当 `type === "asset"`：
  - `label`：字符串
  - `icon`：字符串（资源引用）
  - `downloadName`：字符串
  - `openMode`：`preview|download`

最小示例：

```json
[
  { "link": "n_container_1", "property": { "width": "100%", "height": "50%" } },
  { "link": "n_text_1", "property": { "size": "1rem", "color": "#333333", "lineHeight": 1.5 } }
]
```

#### 3.2.3 content.json（数据）

`content.json` MUST 存在，且顶层 MUST 为一个匿名数组。

该数组 MAY 包含 N 个对象元素。每个对象 MUST 满足：

- MUST 包含 `link`：字符串，表示链接到 `page.json` 中某个节点的 `id`
- MUST 包含 `value`：表示该节点的具体值；`value` MUST 为字符串
- MUST NOT 包含除 `link/value` 之外的其他字段
- 对象内 MUST NOT 出现嵌套对象或嵌套数组；若存在嵌套结构，实现 MUST 不解析该对象

`link` 作用域（v1）：

- `link` MUST 指向该页内任意节点 `id`（包含 `structure` 三段根节点与任意层级 `container.child` 子节点）

`value` 的取值约定（v1）：

- 若被链接节点的 `type === "text"`：`value` MUST 为字符串
- 若被链接节点的 `type === "asset"`：
  - 若 `value` 为 URL 字符串（例如匹配 `^[a-zA-Z][a-zA-Z0-9+.-]*:`）：实现 MAY 视为外部链接
  - 否则 `value` MUST 视为相对于 `assets/` 目录的路径（例如 `attachments/a.pdf`）
- 若被链接节点的 `type === "image"`：
  - 若 `value` 为 URL 字符串（例如匹配 `^[a-zA-Z][a-zA-Z0-9+.-]*:`）：实现 MAY 视为外部链接
  - 否则：
    - 若 `value` 以 `images/` 开头：`value` MUST 视为相对于 `assets/` 的路径（例如 `images/logo.png`）
    - 否则 `value` MUST 视为相对于 `assets/images/` 的路径（例如 `logo.png`）
- 若被链接节点的 `type === "audio"`：
  - 若 `value` 为 URL 字符串（例如匹配 `^[a-zA-Z][a-zA-Z0-9+.-]*:`）：实现 MAY 视为外部链接
  - 否则：
    - 若 `value` 以 `audios/` 开头：`value` MUST 视为相对于 `assets/` 的路径（例如 `audios/intro.mp3`）
    - 否则 `value` MUST 视为相对于 `assets/audios/` 的路径（例如 `intro.mp3`）
- 若被链接节点的 `type === "video"`：
  - 若 `value` 为 URL 字符串（例如匹配 `^[a-zA-Z][a-zA-Z0-9+.-]*:`）：实现 MAY 视为外部链接
  - 否则：
    - 若 `value` 以 `videos/` 开头：`value` MUST 视为相对于 `assets/` 的路径（例如 `videos/clip.mp4`）
    - 否则 `value` MUST 视为相对于 `assets/videos/` 的路径（例如 `clip.mp4`）
- 若被链接节点的 `type === "url"`：`value` MUST 为 URL 字符串

内容合并规则（v1）：

- 若存在多条内容对象具有相同的 `link`，实现 MUST 以数组中最后出现的一条为准

最小示例：

```json
[
  { "link": "n_text_1", "value": "Hello ZerOS" },
  { "link": "n_img_1", "value": "logo.png" },
  { "link": "n_url_1", "value": "https://example.com" },
  { "link": "n_asset_1", "value": "attachments/readme.txt" }
]
```

## 4. assets/（强制）

`assets/` 目录 MUST 存在，用于存放资源文件。

### 4.1 资源目录结构（强制）

`assets/` 目录下 MUST 存在以下子目录（大小写敏感）：

```text
assets/
  images/
  audios/
  videos/
  attachments/
```

- `images/`：图片资源目录
- `audios/`：音频资源目录
- `videos/`：视频资源目录
- `attachments/`：附件资源目录

### 4.2 资源引用约定（v1）

- 页面内容或 `Description.json` 中对资源的引用 MUST 使用相对于 `assets/` 的路径，例如：`images/logo.png`。
- 资源文件 MUST 存放在与其类型匹配的目录下：
  - 图片类资源 MUST 存放在 `assets/images/`
  - 音频类资源 MUST 存放在 `assets/audios/`
  - 视频类资源 MUST 存放在 `assets/videos/`
  - 不被支持或无法归类的资源 MUST 存放在 `assets/attachments/`
- ZerOS Office 的“被支持资源类型清单”由实现定义；当实现无法识别资源类型时 MUST 按附件处理并存放于 `assets/attachments/`。

## 5. 校验规则（严格）

ZDOC 在被 ZerOS Office 打开前 SHOULD 做如下校验：

- 必须存在 `Description.json`、`pages/`、`assets/`
- `pages/` 下必须存在连续页目录 `zd0..zdN`，且 `N = pageCount - 1`
- 必须存在 `assets/images/`、`assets/audios/`、`assets/videos/`、`assets/attachments/`
- `Description.json` 可被 JSON 解析，且 `format === "zdoc"`、`formatVersion` 为受支持值
- 每个页面目录下必须存在 `page.json`、`style.json`、`content.json`，且三者均可被 JSON 解析
- 每个 `page.json` 必须包含 `structure` 数组，且 `structure.length` 必须为 1..3
- `structure` 数组内每个元素必须为“单键对象”，其键名在当前页面内必须唯一
- `structure` 数组内每个节点值对象必须包含 `id/type`，且 `id` 必须与键名一致
- 每个节点 `type` 必须为受支持值（`text/audio/video/image/url/asset/container`），否则该页无效
- 当 `type === "container"` 时，`child` MUST 存在且 MUST 为对象；`child` 下的每个值必须为节点对象（至少包含 `{id,type}`），且同一层级的子节点 `id` 必须唯一
- 当 `type === "container"` 且存在 `order` 时：`order` 必须覆盖全部子节点 `id` 且无重复；实现按 `order` 排序
- `content.json` 顶层必须为数组；每个元素必须包含 `link/value`，且不得包含嵌套对象或嵌套数组
- `content.json` 中每个元素不得包含除 `link/value` 外的字段，且 `value` 必须为字符串
- `style.json` 顶层必须为数组；每个元素必须包含 `link/property`，且 `property` 必须为对象（允许一层嵌套）
- `style.json` 中每个元素不得包含除 `link/property` 外的字段
- `content.json` 与 `style.json` 中的 `link` SHOULD 指向该页内已存在的节点 `id`；若未命中，实现 SHOULD 忽略该条记录

## 6. 实现约定（预览/编辑）

本节用于保证不同实现之间的预览与编辑行为一致。

### 6.1 预览渲染（v1）

- 渲染顺序 MUST 为：页首（若存在）→ 内容 → 页尾（若存在）
- 对每个节点：
  - 渲染实现 MUST 基于 `page.json` 的结构树生成渲染节点
  - 节点的样式 MUST 由 `style.json` 中同 `link` 的样式合并得到
  - 节点的数据 MUST 由 `content.json` 中同 `link` 的内容合并得到
- `container` 子项顺序 MUST 遵循 `order` 规则；无 `order` 时使用子节点 `id` 字典序升序

### 6.2 编辑一致性（v1）

- 编辑器在修改结构时 MUST 同步维护：
  - `page.json` 中节点树与 `container.order` 的一致性
  - `content.json/style.json` 中引用到已删除节点的条目（实现 SHOULD 删除或忽略）
- 编辑器生成的节点 `id` SHOULD 使用随机 256 位唯一值，以避免同页冲突

### 6.3 节点 ID 重命名（v1）

- 编辑器 MUST 支持节点 ID 的重命名操作
- 重命名时 MUST 同步更新：
  - `page.json` 中节点的 `id` 字段
  - 所有容器 `child` 对象中的键名（与新 ID 保持一致）
  - 所有容器 `order` 数组中的 ID
  - `style.json` 中所有引用该 ID 的 `link` 字段
  - `content.json` 中所有引用该 ID 的 `link` 字段

### 6.4 单位支持扩展（v1）

- 除百分比（`%`）外，实现 MAY 也支持以下单位：
  - `px`：像素单位
  - `rem`：相对单位（推荐用于文本）
- 响应式布局优先推荐使用百分比（`%`），但实现可根据场景选择合适的单位

### 6.5 属性可见性控制（v1）

- 编辑器 SHOULD 根据节点类型动态显示/隐藏相应的属性编辑控件：
  - 文本类节点（`text/url/asset`）：显示文本相关属性
  - 容器类节点（`container`）：显示容器布局相关属性
  - 媒体类节点（`image/audio/video`）：显示媒体相关属性
  - 布局属性（`width/height/top/left/right/bottom`）：适用于所有节点类型
