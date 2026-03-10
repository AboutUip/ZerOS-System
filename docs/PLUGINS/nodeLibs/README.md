# NodeLibs 脚本

本目录为 **nodeLibs** 各脚本文档，每个脚本单独成文。脚本运行在宿主 Node 环境中，由后端 `nodeLibExec` 按 `scriptId` 白名单执行，不接收用户输入；前端通过 NodeLibExpansion / server-nodeLib 的 `run(scriptId)` 调用。

## 目录与约定

- **脚本目录**：`system/assets/nodeLibs/`
- **白名单**：由 `system/service/nodeLibExec.php` 与扩展共同维护；新增脚本需加入后端白名单并在本目录新增对应脚本文档
- **调用**：POST `nodeLibExec`，`body.scriptId` 为白名单之一；除 `check` 外执行 `node system/assets/nodeLibs/{scriptId}.js`
- **输出**：脚本将结果以**单行 JSON** 输出到 stdout；接口返回的 `data.stdout` 即该行，前端需 `JSON.parse(result.data.stdout)` 得到结构化数据

## 脚本文档索引

| scriptId | 说明 | 脚本文档 |
|----------|------|----------|
| `check` | 内置，执行 `node --version` 检测宿主 Node 是否可用 | （无单独文档） |
| `perf` | 采集宿主性能指标（进程/OS 内存、CPU、负载等） | [perf.md](./perf.md) |

## 相关文档

- [nodeLibExec 接口](../../INTERFACE/nodeLibExec.md) - 后端执行与白名单
- [ServerNodeLib](../../SERVER/ServerNodeLib.md) - 服务暴露的 NodeLib API（POOL > SERVER）
- [扩展与插件索引](../README.md)
