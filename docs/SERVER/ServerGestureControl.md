# 手势控制服务（server-gesturecontrol）

## 概述

`server-gesturecontrol` 是 ZerOS 内置的**摄像头手势识别与控制**服务，由 ServerExpansion 从 `D/server` 加载。服务启动后加载 MediaPipe 手部与手势模型、打开摄像头，按配置识别手势并执行操作（关闭/最小化/最大化程序、运行指定程序）；同时在 **POOL > SERVER** 中暴露 `GestureControl` 对象，供其他程序为特定手势绑定操作或订阅手势事件。

- **服务 ID**：`gesturecontrol`（对应文件 `server-gesturecontrol.js`）
- **位置**：`D/server/server-gesturecontrol.js`（项目内 `system/service/DISK/D/server/server-gesturecontrol.js`）
- **依赖**：ServerExpansion、DynamicManager.mediapipe（HandLandmarker + GestureRecognizer）、`navigator.mediaDevices.getUserMedia`、GUIManager（关闭/最小化/最大化窗口）、ProcessManager（启动程序、Environment 持久化配置）。

## 与「手势跟踪」应用的区别

- **手势跟踪应用**：独立窗口程序，用于实时显示手部关键点与手势类别，供演示或调试。
- **手势控制服务**：后台服务，无窗口；持续监听摄像头，识别到配置的手势时**执行系统操作**（关闭/最小化/最大化当前焦点窗口，或启动指定程序），并可被其他程序通过 POOL API 扩展（绑定操作、订阅事件）。

## 暴露的 API（POOL > SERVER）

服务在 **__init__** 时即向 POOL 注册（与是否已 __start__ 无关），其他模块可通过 `POOL.__GET__('SERVER', 'GestureControl')` 获取 API：

| 方法/属性 | 说明 |
|-----------|------|
| `gestureIds` | 支持的手势名列表（只读数组副本），如 `['Victory','Pointing_Up','Closed_Fist','Open_Palm','Thumb_Up','Thumb_Down','ILoveYou','Thumb_Left','Thumb_Right']`。 |
| `setGestureAction(gestureName, action, options)` | 为某手势设置触发的操作并持久化。`action`：`'none'` \| `'close_program'` \| `'minimize_program'` \| `'maximize_program'` \| `'run_program'`。当为 `'run_program'` 时，可传 `options.program`（程序名，小写）；不传或空则清除该手势绑定的程序。返回 `Promise`（保存完成或失败）。 |
| `getGestureActions()` | 返回当前 `{ gestureActions, gesturePrograms }`（深拷贝）。 |
| `getConfig()` | 返回完整配置对象（深拷贝），含 `maxHands`、`precisionSpeed`、`useMultithreading`、`gestureActions`、`gesturePrograms`。 |
| `onGesture(callback)` | 订阅手势事件：识别到任意手势时同步调用 `callback(gestureName, handIndex, confidence, landmarks)`。仅通知，不修改配置。 |
| `offGesture(callback)` | 取消订阅。 |
| `isRunning()` | 服务是否正在运行（摄像头与检测循环是否开启）。 |

### 调用示例

```javascript
var GC = POOL.__GET__('SERVER', 'GestureControl');
if (!GC) return;

// 为「比耶」绑定运行计算器
GC.setGestureAction('Victory', 'run_program', { program: 'calculator' }).then(function () {
    console.log('已设置 Victory -> 运行 calculator');
});

// 订阅识别结果（仅通知）
GC.onGesture(function (gestureName, handIndex, confidence, landmarks) {
    console.log('识别到:', gestureName, '置信度:', confidence);
});

// 查询当前配置
var cfg = GC.getConfig();
var actions = GC.getGestureActions();
```

## 配置项（__list__ / __set__）

通过 `Server.listConfig` / `Server.setConfig`（需 SERVER_SERVICE_MANAGE 权限）读写；配置持久化在 Environment 键 `_server_gesturecontrol_config`。

| 配置键 | 类型 | 说明 |
|--------|------|------|
| `maxHands` | 1 \| 2 | 最多同时跟踪的手数。 |
| `precisionSpeed` | `'speed'` \| `'balanced'` \| `'precision'` | 检测策略：偏速度（间隔更长、置信度阈值较低）、平衡、偏精度（间隔更短、阈值较高）。 |
| `useMultithreading` | boolean | 是否使用 `requestIdleCallback` 调度检测循环，减轻主线程压力（检测仍在主线程执行）。 |
| `gesture_<GestureId>` | 字符串 | 每个手势触发的操作：`none`、`close_program`、`minimize_program`、`maximize_program`、`run_program`。例如 `gesture_Victory`。 |
| `gesture_<GestureId>_program` | 字符串 | 当该手势操作为 `run_program` 时，要启动的程序名（小写）。例如 `gesture_Victory_program`。 |

状态与指标说明（`__status__` 的 `display`）为中文，包括：状态文案、最近识别手势及置信度、当前手数、摄像头/模型是否就绪、精度/速度与多线程调度说明。

## 生命周期与状态

- **__init__**：仅首次启动服务时调用一次；从 Environment 加载配置，向 POOL 注册 `SERVER > GestureControl`。
- **__start__**：加载 MediaPipe、打开摄像头、启动检测循环；若启用多线程则用 `requestIdleCallback` 调度。
- **__stop__**：取消动画帧与 idle 回调、关闭摄像头与释放模型。
- **__status__**：返回 `running`、`initialized`、`lastError`、`lastHandCount`、`lastGesture`、`hasVideo`、`hasDetectors`、`config` 及中文 `display`（状态与指标说明）。
- **__info__**：返回 `name`（手势控制）、`nameEn`、`version`、`description`。

## 依赖与权限

- **依赖**：BootLoader 已加载 ServerExpansion；MediaPipe 通过 DynamicManager.mediapipe 按需加载；摄像头需用户授权；GUIManager、ProcessManager 为主窗口/内核全局对象。
- **权限**：启停服务与读写配置需 **SERVER_SERVICE_MANAGE**（通过 `Server.start` / `Server.stop` / `Server.listConfig` / `Server.setConfig`）。POOL API 无额外权限校验，任何能访问 POOL 的代码均可调用。

## 注意事项

- 手势动作有约 1.5 秒防抖，避免同一手势连续触发多次。
- `run_program` 通过 `ProcessManager.startProgram(programName, {})` 启动，程序名需与系统已安装/注册的程序一致（小写）。
- 服务停止后 POOL 中的 GestureControl API 仍可调用（配置读写、订阅管理），但 `isRunning()` 为 false，不会进行识别与执行操作。
