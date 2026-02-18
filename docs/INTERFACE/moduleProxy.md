# ES 模块代理服务（module-proxy）

## 概述

`module-proxy.php` 用于按正确 MIME 类型返回项目内的 ES 模块（.mjs/.js）、WASM、CSS 等文件。解决浏览器对 `import()` 的 MIME 要求及跨域限制。

- **类型**：PHP 后端服务
- **位置**：`system/service/module-proxy.php`
- **调用方**：networkServiceWorker、需要加载动态模块的页面

## 访问方式

```
GET /system/service/module-proxy.php?path=<相对项目根的路径>
```

## 参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| path | string | 是 | 相对于项目根目录的路径，如 `/kernel/dynamicModule/libs/mediapipe/vision_bundle.mjs` |

## 路径规则

- 路径相对于项目根目录（ZerOS 根）
- 会检查路径是否在项目目录内，否则返回 403
- 支持 .mjs、.js、.cjs、.json、.css、.html、.wasm、.svg、.png 等

## MIME 类型

| 扩展名 | MIME |
|--------|------|
| js / mjs / cjs | application/javascript |
| wasm | application/wasm |
| json | application/json |
| css | text/css |
| 等 | 见实现 |

## 缓存

设置 `Cache-Control: no-cache`，始终获取最新文件。

## 错误码

| HTTP | 说明 |
|------|------|
| 200 | 成功 |
| 400 | 缺少 path |
| 403 | 路径超出项目根 |
| 404 | 文件不存在 |
| 500 | 读取失败 |

## 使用示例

```text
/system/service/module-proxy.php?path=/kernel/dynamicModule/libs/mediapipe/vision_bundle.mjs
```

## 相关文档

- [SystemInformation API](../API/SystemInformation.md) - MODULE_PROXY 常量
