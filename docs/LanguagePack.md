# 语言包格式说明

本文档说明 ZerOS 语言扩展所使用的**语言包**存放位置与 JSON 格式。语言包由语言扩展模块（LanguagesExpansion）从磁盘读取并缓存，程序通过 `ProcessManager.callKernelAPI` 的 `Languages.*` API 加载、设置和按常量名获取文本。

## 存放位置

- **目录**：`DISK/D/plugins`（即 D 盘下的 `plugins` 目录，虚拟路径为 `D/plugins` 或 `D:/plugins`）
- **实际路径**：在项目文件系统中对应 `system/service/DISK/D/plugins/`
- **文件命名**：`<locale>.json`，如 `zh-CN.json`、`en.json`，其中 `locale` 为语言标识（如简体中文 `zh-CN`、英文 `en`）

每个语言包是一个独立的 JSON 文件，扩展只负责读取与解析，不负责包内容的业务实现。读取时优先从 NodeTree 读，若节点不存在或读取失败则通过 FSDirve（PHP）回落读取，详见 [LanguagesExpansion API](./API/LanguagesExpansion.md) 的「数据来源与回落」。

## JSON 格式

支持两种写法，二选一即可。

### 格式一：根对象为常量名到文本的映射

键为常量名（如 `KEY_OK`），值为该语言下的实际显示文本。

```json
{
    "KEY_OK": "确定",
    "KEY_CANCEL": "取消",
    "KEY_SAVE": "保存",
    "KEY_CLOSE": "关闭",
    "KEY_OPEN": "打开",
    "KEY_EDIT": "编辑",
    "KEY_DELETE": "删除",
    "KEY_COPY": "复制",
    "KEY_PASTE": "粘贴",
    "KEY_CUT": "剪切",
    "KEY_NEW": "新建",
    "KEY_HELP": "帮助",
    "KEY_ABOUT": "关于",
    "KEY_SETTINGS": "设置",
    "KEY_EXIT": "退出"
}
```

### 格式二：使用 `strings` 子对象

包含 `locale`（可选）和 `strings` 对象，`strings` 内为常量名到文本的映射。

```json
{
    "locale": "zh-CN",
    "strings": {
        "KEY_OK": "确定",
        "KEY_CANCEL": "取消",
        "KEY_SAVE": "保存"
    }
}
```

解析时：若存在 `strings` 且为对象，则使用 `strings` 作为常量名→文本的映射；否则使用根对象中所有值为字符串的键值对作为映射。

## 常量名约定

- 建议使用全大写 + 下划线，如 `KEY_OK`、`MENU_FILE_OPEN`，便于在代码中作为常量引用。
- 程序通过 `Languages.getText(constantName [, locale])` 获取文本时，传入的 `constantName` 需与 JSON 中的键一致。
- 若某常量在指定语言包中不存在，API 会返回常量名本身作为回退。

## 示例：中文语言包文件

文件名：`zh-CN.json`  
路径：`D/plugins/zh-CN.json`（或项目内 `system/service/DISK/D/plugins/zh-CN.json`）

内容示例见项目中的 `system/service/DISK/D/plugins/zh-CN.json`。

## 相关文档

- [LanguagesExpansion API](./API/LanguagesExpansion.md) - 语言扩展 API 与调用方式
- [ProcessManager API](./API/ProcessManager.md) - `callKernelAPI` 与内核 API 列表
