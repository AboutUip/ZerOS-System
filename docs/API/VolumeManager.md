# VolumeManager API 文档

## 概述

`VolumeManager` 是 ZerOS 的音量管理器，在任务栏初始化阶段注入 Web Audio 拦截，维护系统音量（0–1）并统一缩放所有经 `AudioContext` 输出的音频。任务栏音量图标与面板通过本模块读写系统音量并持久化。

## 依赖

- `LStorage` - 本地存储（用于持久化 `system.volume`）
- `KernelLogger` - 内核日志（脚本加载时已存在）
- `DependencyConfig` - 模块加载完成后发布信号（脚本加载时已存在）

## 获取实例

VolumeManager 注册在 POOL 中：

```javascript
const VolumeManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "VolumeManager");
```

## 初始化

音量拦截在**任务栏初始化时**执行，由 `TaskbarManager.init()` 调用，无需单独调用：

```javascript
// 由 TaskbarManager.init() 内部调用
VolumeManager.init();
```

**说明**：`init()` 仅执行一次，会包装全局 `window.AudioContext` 与 `window.webkitAudioContext`，使所有 `new AudioContext()` 的 `destination` 指向受控 GainNode，从而统一应用系统音量。

## API 方法

### `init()`

在任务栏初始化时调用，包装全局 AudioContext，并异步从 LStorage 恢复 `system.volume`。重复调用会直接返回。

### `getSystemVolume()`

获取当前系统音量。

**返回值**: `number` - 0–1

**示例**:
```javascript
const vol = VolumeManager.getSystemVolume();
console.log('系统音量:', vol); // 0.8
```

### `setSystemVolume(value)`

设置系统音量并持久化到 LStorage，同时应用到所有已注册的 GainNode。

**参数**:
- `value` (number): 0–1，超出范围会被夹紧

**示例**:
```javascript
VolumeManager.setSystemVolume(0.5);
```

## 持久化

- **存储键**: `system.volume`（LStorage 系统存储）
- **取值**: 0–1 数字
- **时机**: `setSystemVolume()` 时写入；`init()` 内异步读取并应用到已有 GainNode

## 音频拦截说明

- **作用范围**：仅对通过 **Web Audio API**（`AudioContext`）输出到 `context.destination` 的音频生效。程序使用 `new AudioContext()` 并将节点连接到 `context.destination` 时，会自动经过受控 GainNode，无需改应用代码。
- **仅使用 `<audio>` / `<video>` 且未接入 AudioContext**：不受系统音量控制。若希望受控，应使用 `AudioContext.createMediaElementSource(mediaElement)` 将媒体元素接入 Web Audio，再连接到 `context.destination`。
- **系统音量**：作为全局缩放系数 0–1，与 GainNode 的 `gain` 一致。

## 任务栏集成

- 任务栏在「亮度」与「天气」之间显示音量图标，点击可打开音量面板（滑块 0–100%、静音按钮）。
- 图标与面板通过 `VolumeManager.getSystemVolume()` / `VolumeManager.setSystemVolume()` 读写，持久化完全由 VolumeManager 负责。

## 系统音量变更事件

调用 `setSystemVolume(value)` 时，会在 `document` 上派发自定义事件，便于其他模块（如音乐应用）同步：

- **事件名**: `zeros-system-volume-change`
- **detail**: `{ value: number }`（0–1）
- **用法**: `document.addEventListener('zeros-system-volume-change', (e) => { ... e.detail.value ... });`

音乐应用（musicplayer）通过该事件接收系统音量，并与应用内音量（localStorage `volume`）相乘后应用到 `<audio>.volume`，从而受任务栏系统音量控制。

## 相关文档

- [TaskbarManager.md](./TaskbarManager.md) - 任务栏管理（内含音量 UI）
- [LStorage.md](./LStorage.md) - 本地存储
- [PermissionManager.md](./PermissionManager.md) - 权限管理（与音量无关，无额外权限要求）
