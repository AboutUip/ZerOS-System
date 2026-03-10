# perf：性能指标脚本

## 用途

采集运行 Node 的宿主机的详细性能数据，供监控、运维或任务管理器展示。输出单行 JSON，包含当前进程的 CPU/内存、可选的 `resourceUsage`，以及 OS 的 CPU 数、内存、负载、主机信息等。推荐在扩展配置中启用 **nodeDependencies: ['systeminformation']**，启动 nodeLib 服务时会自动检查并安装该库，以支持更详细的指标（见 [ServerNodeLib](../../SERVER/ServerNodeLib.md)）。

## 调用与解析

- 接口：`scriptId: "perf"`
- 成功时接口返回 `status: "success"`，`data.stdout` 为单行 JSON 字符串
- 解析示例：`var metrics = JSON.parse(result.data.stdout);`

## 输出结构（根字段）

| 字段 | 类型 | 说明 |
|------|------|------|
| `ts` | number | 采集时间戳（毫秒，Date.now()） |
| `tsHr` | string \| null | 高精度时间（process.hrtime.bigint 字符串，若支持） |
| `process` | object | 当前 Node 进程相关指标，见下 |
| `os` | object | 操作系统相关指标，见下 |
| `si` | object \| 无 | 仅当已安装 **systeminformation**（npm install -g）时存在，见下 |

## process 对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `memory` | object \| null | process.memoryUsage()；见下表 |
| `cpuUsage` | object \| null | process.cpuUsage()；user/system 单位微秒 |
| `uptime` | number \| null | 进程运行时间（秒） |
| `resourceUsage` | object \| null | process.resourceUsage()（Node 12.6+，部分平台）；见下表 |
| `nodeVersion` | string \| null | 如 "v20.10.0" |
| `versions` | object \| null | process.versions（V8、uv 等） |

**memory**（单位：字节）：

| 字段 | 说明 |
|------|------|
| `rss` | 常驻集大小 |
| `heapTotal` | 堆总分配 |
| `heapUsed` | 堆已用 |
| `external` | C++ 等外部占用 |
| `arrayBuffers` | ArrayBuffer 占用（可选） |

**resourceUsage**（若存在）：

| 字段 | 说明 |
|------|------|
| `userCPUTime` | 用户态 CPU 时间（微秒） |
| `systemCPUTime` | 内核态 CPU 时间（微秒） |
| `maxRSS` | 最大常驻集（字节） |
| `sharedMemorySize` | 共享内存 |
| `unsharedDataSize` | 非共享数据 |
| `unsharedStackSize` | 非共享栈 |
| `minorPageFault` | 次缺页 |
| `majorPageFault` | 主缺页 |
| `swappedOut` | 换出 |
| `fsRead` | 文件系统读取次数 |
| `fsWrite` | 文件系统写入次数 |
| `involuntaryContextSwitches` | 非自愿上下文切换 |

## os 对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string \| null | 如 "win32"、"linux"、"darwin" |
| `release` | string \| null | 内核/系统版本 |
| `type` | string \| null | 如 "Windows_NT"、"Linux"、"Darwin" |
| `arch` | string \| null | 如 "x64"、"arm64" |
| `hostname` | string \| null | 主机名 |
| `uptime` | number \| null | 系统运行时间（秒） |
| `freemem` | number \| null | 空闲内存（字节） |
| `totalmem` | number \| null | 总内存（字节） |
| `loadavg` | number[] \| null | 1/5/15 分钟负载（Linux/macOS；Windows 常为 [0,0,0]） |
| `cpusCount` | number | CPU 逻辑核心数 |
| `cpus` | array \| null | 每核信息：model、speed、times（user/nice/sys/idle/irq） |
| `endianness` | string \| null | 字节序 |
| `homedir` | string \| null | 用户主目录 |
| `tmpdir` | string \| null | 临时目录 |
| `error` | string | 仅当 require('os') 失败时存在 |

任意字段在采集失败或不可用时可为 `null`，不会导致整段输出失败。

## si 对象（性能指标库 systeminformation，可选）

当宿主机已全局安装 `systeminformation`（扩展默认 nodeDependencies 含该库，启动 nodeLib 服务时会自动安装）时，输出会多出 `si` 字段，内含：

| 子字段 | 说明 |
|--------|------|
| `cpu` | CPU 型号、核心数、主频等（si.cpu()） |
| `mem` | 内存总量/已用/可用等（si.mem()） |
| `currentLoad` | 当前负载、用户/系统/空闲占比等（si.currentLoad()） |
| `graphics` | 显卡/GPU 列表、型号、显存等（si.graphics()） |
| `osInfo` | 系统信息（si.osInfo()） |
| `system` | 主机厂商、型号、序列号等（si.system()） |

各子字段结构以 [systeminformation](https://www.npmjs.com/package/systeminformation) 文档为准；任一项采集失败时为 `null`，不影响其余字段及 `process`/`os`。

## 示例输出（节选）

```json
{
  "ts": 1710000000123,
  "tsHr": "1710000000123456789",
  "process": {
    "memory": { "rss": 25600000, "heapTotal": 12000000, "heapUsed": 8000000, "external": 100000, "arrayBuffers": 0 },
    "cpuUsage": { "user": 15000, "system": 3000 },
    "uptime": 1.5,
    "resourceUsage": { "userCPUTime": 15000, "systemCPUTime": 3000, "maxRSS": 25600, "minorPageFault": 100, "majorPageFault": 0 },
    "nodeVersion": "v20.10.0",
    "versions": { "node": "20.10.0", "v8": "11.3.0", "uv": "1.44.0" }
  },
  "os": {
    "platform": "win32",
    "release": "10.0.26300",
    "hostname": "MY-PC",
    "uptime": 86400,
    "freemem": 8589934592,
    "totalmem": 17179869184,
    "loadavg": [0, 0, 0],
    "cpusCount": 8,
    "cpus": [{ "model": "Intel...", "speed": 2400, "times": { "user": 1000, "nice": 0, "sys": 500, "idle": 9000, "irq": 0 } }]
  }
}
```

## 相关

- [NodeLibs 索引](./README.md)
- [nodeLibExec](../../INTERFACE/nodeLibExec.md) | [ServerNodeLib](../../SERVER/ServerNodeLib.md)
