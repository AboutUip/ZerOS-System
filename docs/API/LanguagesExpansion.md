# LanguagesExpansion API 文档

## 概述

`LanguagesExpansion` 是 ZerOS 内核的语言扩展模块，作为**语言包管理器**运行。负责从 `DISK/D/plugins` 目录加载语言包、设置当前语言、以及按常量名获取本地化文本。API 通过 `ProcessManager.callKernelAPI` 暴露给进程，并受权限管控。

## 依赖

- `Disk` / `NodeTreeCollection` - 文件系统（用于读取 D/plugins 下语言包 JSON）
- `LStorage` - 本地存储（用于持久化当前语言设置）

## 语言包存放位置

- **路径**：`D/plugins`（或 `D:/plugins`，取决于分区名）
- **格式**：每个语言包为一个 JSON 文件，文件名即语言标识，如 `zh-CN.json`、`en.json`
- 语言包格式说明见 [语言包格式文档](../LanguagePack.md)

## 数据来源与回落

语言包列表与文件读取采用「NodeTree 优先、FSDirve 回落」策略，与 NodeTree 的初始化与重建策略一致：

- **listPacks**：先通过 NodeTree 的 `list_file(D/plugins)` 获取 `*.json` 列表；若节点不存在或为空，则通过 FSDirve 的 `list_dir(D:/plugins)` 获取；若仍失败，则返回默认列表 `["zh-CN.json", "en.json"]`。
- **loadPack**：先通过 NodeTree 的 `read_file(D/plugins, <locale>.json)` 读取；若失败则通过 FSDirve 的 `read_file(D:/plugins, <fileName>)` 读取。

## 初始化

语言扩展在 BootLoader 中按依赖顺序加载（依赖 `kernel/filesystem/init.js` 与 `kernel/drive/LStorage.js`），无需在程序中手动初始化。

## 语言变更监听（参考 ThemeManager.onThemeChange）

应用程序可通过**直接调用** `LanguagesExpansion` 的监听 API，在用户切换语言时收到回调并自行刷新界面文案，实现多语言支持。无需通过 ProcessManager.callKernelAPI，也不占用权限。

### LanguagesExpansion.onLanguageChange(listener)

注册语言变更监听器。当用户通过设置或 API 切换语言（`Languages.setCurrent`）时，会调用所有已注册的监听器。

**参数**：
- `listener` (function(string)): 监听器函数，参数为新语言标识 `locale`（如 `"zh-CN"`）

**返回值**：`function()` - 取消监听的函数，调用后即移除该监听器

**说明**：注册后会立即调用一次 `listener(currentLocale)`，便于程序初始化时按当前语言渲染。

**示例**：
```javascript
// 在 __init__ 中注册，并在 __exit__ 中取消
const LanguagesExpansion = POOL.__GET__("KERNEL_GLOBAL_POOL", "LanguagesExpansion") || window.LanguagesExpansion;
this._unsubscribeLanguage = LanguagesExpansion.onLanguageChange((locale) => {
    this._refreshUITexts(locale);  // 自行实现：用 LanguagesExpansion.getText 或 callKernelAPI 更新界面
});

// 退出时取消
__exit__: async function() {
    if (this._unsubscribeLanguage && typeof this._unsubscribeLanguage === 'function') {
        this._unsubscribeLanguage();
    }
}
```

### LanguagesExpansion.offLanguageChange(listener)

移除此前通过 `onLanguageChange` 注册的监听器。

**参数**：
- `listener` (function): 此前注册的监听器函数

**示例**：
```javascript
LanguagesExpansion.offLanguageChange(this._languageChangeHandler);
```

## 内核 API（通过 ProcessManager.callKernelAPI 调用）

程序需在 `__info__.permissions` 中声明 `LANGUAGES_READ` 和/或 `LANGUAGES_WRITE` 后，方可调用以下 API。

### Languages.loadPack

加载指定语言包（从 `D/plugins/<locale>.json` 读取并缓存）。先通过 NodeTree 读取文件；若该路径节点不存在或读取失败，则通过 FSDirve（PHP）`read_file` 回落读取。

**权限**：`LANGUAGES_WRITE`

**参数**：
- `locale` (string): 语言标识，如 `"zh-CN"`，对应文件 `zh-CN.json`

**返回值**：`Promise<boolean>` - 是否加载成功

**示例**：
```javascript
const ok = await ProcessManager.callKernelAPI(this.pid, 'Languages.loadPack', ['zh-CN']);
```

### Languages.setCurrent

设置当前使用的语言包（会持久化到 LStorage）。若该语言包未加载，会先尝试加载。

**权限**：`LANGUAGES_WRITE`

**参数**：
- `locale` (string): 语言标识

**返回值**：`Promise<boolean>` - 是否设置成功

**示例**：
```javascript
await ProcessManager.callKernelAPI(this.pid, 'Languages.setCurrent', ['zh-CN']);
```

### Languages.getText

使用常量名获取当前（或指定）语言下的实际文本。

**权限**：`LANGUAGES_READ`

**参数**：
- `constantName` (string): 常量名，如 `"KEY_OK"`
- `locale` (string, 可选): 指定语言；不传则使用当前语言

**返回值**：`string` - 对应文本，未找到时返回常量名本身

**示例**：
```javascript
const text = await ProcessManager.callKernelAPI(this.pid, 'Languages.getText', ['KEY_OK']);
const textEn = await ProcessManager.callKernelAPI(this.pid, 'Languages.getText', ['KEY_OK', 'en']);
```

### Languages.listPacks

列出已存在的语言包文件名（`D/plugins` 下所有 `*.json` 文件）。采用多级回落：先通过 NodeTree 列出目录；若节点不存在或为空，则通过 FSDirve（PHP）请求 `list_dir`；若仍失败，则返回默认列表 `["zh-CN.json", "en.json"]`。

**权限**：`LANGUAGES_READ`

**参数**：无

**返回值**：`Promise<string[]>` - 文件名列表，如 `["zh-CN.json", "en.json"]`

**示例**：
```javascript
const files = await ProcessManager.callKernelAPI(this.pid, 'Languages.listPacks', []);
```

### Languages.getCurrentLocale

获取当前语言标识。

**权限**：`LANGUAGES_READ`

**参数**：无

**返回值**：`string` - 当前语言，未设置时为空字符串

**示例**：
```javascript
const locale = await ProcessManager.callKernelAPI(this.pid, 'Languages.getCurrentLocale', []);
```

### Languages.getLoadedLocales

获取已加载到内存的语言标识列表。

**权限**：`LANGUAGES_READ`

**参数**：无

**返回值**：`string[]` - 已加载的 locale 列表

**示例**：
```javascript
const locales = await ProcessManager.callKernelAPI(this.pid, 'Languages.getLoadedLocales', []);
```

## 权限

| 权限 | 说明 | 级别 |
|------|------|------|
| `LANGUAGES_READ` | 读取语言包、按常量名获取文本、列出语言包、获取当前/已加载语言 | NORMAL（自动授予） |
| `LANGUAGES_WRITE` | 加载语言包、设置当前语言 | NORMAL（自动授予） |

程序在 `__info__` 中声明示例：

```javascript
__info__() {
    return {
        name: '我的程序',
        permissions: ['LANGUAGES_READ', 'LANGUAGES_WRITE'],
        // ...
    };
}
```

## 使用示例

```javascript
// 在 __init__ 中保存 pid，并确保 __info__.permissions 包含 LANGUAGES_READ、LANGUAGES_WRITE
async __init__(pid, initArgs) {
    this.pid = pid;
    const ProcessManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "ProcessManager");

    // 加载并设置为中文
    await ProcessManager.callKernelAPI(this.pid, 'Languages.loadPack', ['zh-CN']);
    await ProcessManager.callKernelAPI(this.pid, 'Languages.setCurrent', ['zh-CN']);

    // 按常量名取当前语言文本
    const okText = await ProcessManager.callKernelAPI(this.pid, 'Languages.getText', ['KEY_OK']);
    const cancelText = await ProcessManager.callKernelAPI(this.pid, 'Languages.getText', ['KEY_CANCEL']);
}
```

## 相关文档

- [语言包格式 (LanguagePack.md)](../LanguagePack.md) - 语言包 JSON 格式与存放说明
- [ProcessManager.md](./ProcessManager.md) - 内核 API 调用方式
- [PermissionManager.md](./PermissionManager.md) - 权限枚举与级别
