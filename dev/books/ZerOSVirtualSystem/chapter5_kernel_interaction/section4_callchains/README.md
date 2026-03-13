# 5.4 完整调用链示例

## 大节简介

本节给出两条**端到端调用链**的完整文字描述：**① 应用读取文件**（从应用脚本 callKernelAPI('FileSystem.read') 到 Disk/NodeTree/PHP 的完整路径）；**② 进程退出与资源回收**（从 kill/requestSelfTermination 到 PROCESS_TABLE、MemoryManager、GUIManager、EventManager 的清理顺序）。便于读者把第 5 章前几节的“通信机制”“应用与内核边界”“协作模式”串成一条线，并在排查问题时按链定位。

## 小节列表

- [5.4.1 应用读取文件的完整调用链](5.4.1_应用读取文件的完整调用链.md)
- [5.4.2 进程退出与资源回收的完整调用链](5.4.2_进程退出与资源回收的完整调用链.md)

---

**[返回本章目录](../../README.md)** | **[上一节：5.3 典型协作模式](../section3_collaboration/README.md)** | **[下一节：5.5 常见错误与排查汇总](../section5_troubleshooting/README.md)**
