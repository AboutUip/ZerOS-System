# AI 助手服务（server-aiassistant）

## 概述

`server-aiassistant` 是 ZerOS 内置的**语音唤醒式 AI 助手服务**，由 ServerExpansion 从 `D/server` 加载。服务自启动后持续监听语音，识别到唤醒词后进入处理模式，可打开/关闭程序、调节亮度、闲聊等，直到说出结束词后回到监听状态。

- **服务 ID**：`aiassistant`（对应文件 `server-aiassistant.js`）
- **位置**：`D/server/server-aiassistant.js`（项目内 `system/service/DISK/D/server/server-aiassistant.js`）
- **依赖**：ProcessManager、SpeechDrive（通过 ProcessManager.callKernelAPI）

## 唤醒音效

- **音效文件**：同目录（`D/server/`）下的 `start.mp3`
- **触发时机**：识别到唤醒词并进入处理模式时播放
- **配置**：脚本内 `ENABLE_WAKE_SOUND = true` 可关闭唤醒音效
- **说明**：若 `start.mp3` 不存在或加载失败，则静默跳过

## 唤醒词与结束词

| 类型 | 关键词 |
|------|--------|
| 唤醒词 | 你好、你好小A、小A小A |
| 结束词 | 再见、拜拜 |

## 功能概览

| 能力 | 说明 |
|------|------|
| 打开程序 | 支持 about、settings、notepad、terminal、filemanager、taskmanager、browser 等 21 个程序 |
| 关闭程序 | 可关闭上述程序 |
| 调节亮度 | `SET brightness 70-100` |
| 闲聊 | [S] 类回复，可问候、讲笑话、简短对话 |

## 相关文档

- [AIProxy 后端接口](../INTERFACE/AIProxy.md) - 讯飞星火、通义千问代理
- [ServerExpansion API](../API/ServerExpansion.md) - 服务扩展加载与启停
- [SpeechDrive API](../API/SpeechDrive.md) - 语音识别与合成
- [服务模块编写 (ServiceModule.md)](./ServiceModule.md) - D/server 服务编写约定
