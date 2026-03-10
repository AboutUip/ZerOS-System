# ZerOS 扩展编写指南

本文档说明如何在 `system/expansion/` 下编写**独立扩展**。该目录下每个 `.js` 文件都是一个**互不依赖**的扩展模块，仅依赖 BootLoader 中声明的内核模块。

---

## 1. 扩展的共性结构

- **形式**：单个 IIFE + 严格模式，不导出到模块系统，只挂到全局。
- **加载**：由 BootLoader 按 `starter.js` 里 `DependencyConfig` 的依赖顺序加载，**不**被其他 expansion 引用。
- **命名**：建议 `xxxExpansion.js`，全局对象 `XxxExpansion`（如 `WasmExpansion`、`LanguagesExpansion`）。

---

## 2. 必须完成的四件事

### 2.1 在 BootLoader 中声明依赖

在 `bootloader/starter.js` 的依赖表里增加一条，键为扩展脚本相对路径，值为所依赖的脚本路径数组（通常包含文件系统或 LStorage 等）：

```javascript
// 示例：依赖文件系统
"../system/expansion/yourExpansion.js": [
    "../kernel/filesystem/init.js"
],
```

扩展只应依赖**已在该表中先加载**的模块（如 `Disk`、`LStorage`、`ProcessManager`），不要依赖其他 expansion。

### 2.2 初始化与日志

- 若用到 `KernelLogger`，在脚本顶部打一条初始化日志，便于排查加载顺序问题：
  - `KernelLogger.info("YourExpansion", "模块初始化");`
- 若有“就绪”概念，可提供 `init()` 并挂到 `YourExpansion._ready`（Promise），供调用方 `await YourExpansion._ready`（如 ServerExpansion、LanguagesExpansion）。

### 2.3 挂到全局并发布就绪信号

- 挂到全局，供内核或 D/server 服务使用：
  - `window.YourExpansion = YourExpansion;`
  - 可选：`globalThis.YourExpansion = YourExpansion;`
- 通知依赖系统“本扩展已加载”：
  - `DependencyConfig.publishSignal("../system/expansion/yourExpansion.js");`
  - 必须放在 IIFE 末尾执行，保证扩展逻辑已运行完。

### 2.4 可选：注册到 POOL

若希望通过 `POOL.__ADD__("KERNEL_GLOBAL_POOL", "YourExpansion", YourExpansion)` 被其他内核模块按名取用，可仿照 `serverExpansion.js` / `languagesExpansion.js` 在末尾增加 POOL 注册；非必须（如 WasmExpansion 未注册 POOL）。

---

## 3. 各扩展的差异（按需选用）

| 项目 | ServerExpansion | WasmExpansion | LanguagesExpansion | SystemExpansion |
|------|-----------------|---------------|--------------------|-----------------|
| **职责** | 从 D/server 加载 server-*.js 服务，管理启停 | 从 D/wasm 加载 .wasm，提供 load/call 等 | 从 D/plugins 加载语言包，提供 getText 等 | 全屏覆盖 UI（协议/补丁/配置） |
| **数据来源** | D/server（虚拟盘） | D/wasm（虚拟盘或 URL） | D/plugins（虚拟盘或 FSDirve 回退） | 无盘上资源 |
| **调用限制** | 仅通过 ProcessManager 的 kernelAPI（Server.*）+ 内核令牌 | 仅 D/server 或 terminal（调用栈检查） | 无限制 | 仅 D/server 或 terminal（调用栈检查） |
| **POOL** | 注册 | 不注册 | 注册 | 注册 |
| **init / _ready** | `_ready = init()`，init 里扫描并加载服务 | 无 | `_ready = init()`，恢复当前语言 | `_ready = init()`，空实现 |

可得出两条可选约定：

- **调用方限制**：若扩展只允许 D/server 下服务或终端调用，在入口里用 `_checkCaller()` 检查 `new Error().stack` 是否包含 `system/service/DISK/D/server/` 或 `terminal` / `Terminal` / `debug`，不通过则抛错或返回失败（参考 WasmExpansion、SystemExpansion）。
- **init 与 _ready**：若扩展需要“准备就绪”再被用（如扫描目录、恢复持久化），提供 `init()` 并设 `YourExpansion._ready = YourExpansion.init();`，其他模块用 `Promise.resolve(YourExpansion._ready).then(...)` 等待。

---

## 4. 推荐模板（最小可用）

```javascript
// 你的扩展：一句话说明职责
// 可选：仅允许 xxx 调用（调用栈检查）

(function () {
    'use strict';

    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("YourExpansion", "模块初始化");
    }

    // 1) 私有函数、常量、状态
    function _getSomeRef() {
        if (typeof Disk === 'undefined') return null;
        var nodeTree = Disk.diskSeparateMap && (Disk.diskSeparateMap.get('D') || Disk.diskSeparateMap.get('D:'));
        if (!nodeTree) return null;
        return { nodeTree: nodeTree, somePath: nodeTree.separateName + '/yourDir' };
    }

    var YourExpansion = {
        doSomething: function () {
            var ref = _getSomeRef();
            if (!ref || !ref.nodeTree.initialized) return Promise.resolve(null);
            // ...
            return Promise.resolve(result);
        },

        init: function () {
            // 可选：预加载、恢复状态
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("YourExpansion", "初始化完成");
            }
            return Promise.resolve();
        }
    };

    YourExpansion._ready = YourExpansion.init();

    if (typeof window !== 'undefined') {
        window.YourExpansion = YourExpansion;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.YourExpansion = YourExpansion;
    }

    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "YourExpansion", YourExpansion);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("YourExpansion", "注册到 POOL 失败: " + (e && e.message));
            }
        }
    }

    if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
        DependencyConfig.publishSignal("../system/expansion/yourExpansion.js");
    }
})();
```

在 `starter.js` 中为该文件添加依赖项（见 2.1），即可作为独立扩展参与启动。

---

## 5. 小结

- **每个 expansion 文件独立**：不 require/import 其他 expansion，只依赖在 starter 里声明的内核模块。
- **四件必做**：声明依赖、初始化日志、挂全局、`publishSignal`；若需被内核按名取用则加 POOL 注册。
- **按需选用**：调用栈校验（`_checkCaller`）、`init` / `_ready`、从 D 盘或 FSDirve 读资源。

参考实现：`system/expansion/serverExpansion.js`、`wasmExpansion.js`、`languagesExpansion.js`、`systemExpansion.js`。
