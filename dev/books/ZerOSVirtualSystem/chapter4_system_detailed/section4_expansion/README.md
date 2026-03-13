# 4.4 系统扩展

## 大节简介

本节讲解 ZerOS **系统扩展**模块：在文件系统与内核就绪后加载的 **LanguagesExpansion**、**SystemExpansion**、**ServerExpansion**、**WasmExpansion**、**NodeLibExpansion** 等。它们通过 _ready Promise 或回调与 BootLoader 的 start_init 衔接，负责语言包、全屏系统协议/补丁/配置、D/server 服务、Wasm、Node 兼容库等能力。

## 小节列表

- [4.4.1 系统扩展概述与加载顺序](4.4.1_系统扩展概述与加载顺序.md)
- [4.4.2 LanguagesExpansion 与 SystemExpansion](4.4.2_LanguagesExpansion与SystemExpansion.md)

---

**[返回章节目录](../README.md)** | **[上一节：4.3 权限与锁屏](../section3_permission_lockscreen/README.md)**
