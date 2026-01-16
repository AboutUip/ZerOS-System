# 压缩服务与磁盘管理服务重构文档

> 重构时间：2026-01-16
> 作者：zeros

## 一、重构概述

### 1.1 重构目标

本次重构主要针对压缩服务（CompressionDirve）和磁盘管理服务（DiskManager）进行代码优化，目标如下：

1. **消除重复代码**：提取公共逻辑到工具类
2. **增强枚举功能**：在枚举中添加参数验证和成功消息
3. **简化控制器逻辑**：使用函数式映射替代冗长的 switch 语句
4. **统一参数传递**：引入 ActionContext 统一封装请求参数

### 1.2 重构背景

原有代码存在以下问题：

- 控制器中存在大量 switch-case 语句，代码冗长
- 参数验证逻辑分散在各处，难以维护
- 服务实现类中存在大量重复的路径处理、结果构建代码
- 缺乏统一的参数传递机制

## 二、新建文件详情

### 2.1 ActionContext.java

**路径**：`src/main/java/cn/zeros/model/ActionContext.java`

**功能描述**：动作上下文类，封装控制器接收的所有参数，用于统一传递给服务层。

**主要字段**：

| 字段名 | 类型 | 描述 |
|--------|------|------|
| `sourcePath` | `String` | 源路径（单个） |
| `targetPath` | `String` | 目标路径 |
| `sourcePaths` | `List<String>` | 源路径列表（多个） |
| `options` | `Map<String, Object>` | 额外选项 |
| `partition` | `String` | 分区名称（用于磁盘管理） |
| `source` | `String` | 源分区（用于合并/克隆操作） |
| `target` | `String` | 目标分区（用于合并/克隆操作） |
| `force` | `boolean` | 是否强制执行 |
| `deleteSource` | `boolean` | 是否删除源 |
| `quick` | `boolean` | 是否快速操作 |
| `newSize` | `long` | 新大小（用于调整分区大小） |

**主要方法**：

| 方法名 | 返回类型 | 描述 |
|--------|----------|------|
| `getOption(String key, T defaultValue)` | `<T>` | 获取选项值，如果不存在返回默认值 |
| `getOptionsOrEmpty()` | `Map<String, Object>` | 获取非空的选项 Map |

---

### 2.2 DirectoryStats.java

**路径**：`src/main/java/cn/zeros/model/DirectoryStats.java`

**功能描述**：目录统计信息类，用于统一返回目录的大小、文件数、目录数等信息。

**主要字段**：

| 字段名 | 类型 | 描述 |
|--------|------|------|
| `totalSize` | `long` | 总大小（字节） |
| `fileCount` | `int` | 文件数量 |
| `directoryCount` | `int` | 目录数量 |

**主要方法**：

| 方法名 | 返回类型 | 描述 |
|--------|----------|------|
| `empty()` | `DirectoryStats` | 静态方法，创建一个空的统计信息 |
| `add(DirectoryStats other)` | `void` | 累加另一个统计信息 |
| `addFile(long size)` | `void` | 增加文件计数和大小 |
| `addDirectory()` | `void` | 增加目录计数 |

---

### 2.3 CompressionUtil.java

**路径**：`src/main/java/cn/zeros/util/CompressionUtil.java`

**功能描述**：压缩服务工具类，提供压缩/解压操作的公共方法，减少服务实现类中的重复代码。

**主要方法**：

| 方法名 | 返回类型 | 描述 |
|--------|----------|------|
| `resolveSourcePaths(String, List<String>, DiskConfig)` | `List<Path>` | 解析源路径列表，将虚拟路径转换为实际路径 |
| `getFinalSourcePaths(String, List<String>)` | `List<String>` | 获取最终的源路径字符串列表 |
| `ensureTargetReady(Path, String)` | `void` | 确保目标文件不存在并创建父目录 |
| `validateSourceFile(String, DiskConfig)` | `Path` | 验证源文件存在 |
| `buildListResult(String, List<Map>)` | `Map<String, Object>` | 构建列表结果 |
| `buildCompressResult(List<String>, String, long)` | `Map<String, Object>` | 构建压缩结果 |
| `buildExtractResult(String, String, int, List<String>)` | `Map<String, Object>` | 构建解压结果 |
| `shouldExclude(String, List<String>)` | `boolean` | 判断路径是否应该被排除 |
| `parseInt(Object, int)` | `int` | 解析整数选项 |
| `parseBoolean(Object, boolean)` | `boolean` | 解析布尔选项 |
| `getStringList(Object)` | `List<String>` | 获取字符串列表选项 |

---

### 2.4 DiskUtil.java

**路径**：`src/main/java/cn/zeros/util/DiskUtil.java`

**功能描述**：磁盘管理工具类，提供磁盘管理操作的公共方法。

**主要方法**：

| 方法名 | 返回类型 | 描述 |
|--------|----------|------|
| `validateAndGetDiskLetter(String)` | `String` | 验证分区名称格式并返回磁盘字母 |
| `requireValidDiskLetter(String)` | `String` | 验证分区名称格式，无效则抛出异常 |
| `validatePartitionExists(String, DiskConfig)` | `Path` | 验证分区存在 |
| `calculateStats(Path)` | `DirectoryStats` | 计算目录统计信息（大小、文件数、目录数） |
| `calculateDirectorySize(Path)` | `long` | 计算目录大小 |
| `countFiles(Path)` | `int` | 统计目录中的文件数量 |
| `countDirectories(Path)` | `int` | 统计目录中的子目录数量 |
| `deleteDirectoryRecursive(Path)` | `void` | 递归删除目录 |
| `deleteFilesOnly(Path)` | `void` | 仅删除目录中的文件（保留目录结构） |
| `deleteDirectoryContents(Path)` | `void` | 删除目录内容（保留目录本身） |
| `formatTime(long)` | `String` | 格式化时间戳 |
| `currentTime()` | `String` | 获取当前格式化时间 |
| `isSystemPartition(String)` | `boolean` | 检查是否为系统分区（D:） |
| `requireNotSystemPartition(String, String)` | `void` | 验证不是系统分区，如果是则抛出异常 |

## 三、修改文件详情

### 3.1 CompressionActionType.java

**路径**：`src/main/java/cn/zeros/enums/CompressionActionType.java`

**改动内容**：

1. **新增内部枚举 `ParamRequirement`**：定义参数需求类型
   - `NONE`：无需参数
   - `SOURCE_ONLY`：仅需要源路径
   - `TARGET_REQUIRED`：仅需要目标路径
   - `SOURCE_AND_TARGET`：需要源路径和目标路径

2. **新增字段**：
   - `successMessage`：操作成功消息
   - `paramRequirement`：参数需求类型

3. **新增方法**：
   - `validate(ActionContext ctx)`：验证参数是否满足要求，不满足则抛出 `BusinessException`

**改动前后对比**：

```java
// 改动前
COMPRESS_ZIP("compress_zip", "压缩为ZIP"),

// 改动后
COMPRESS_ZIP("compress_zip", "压缩为ZIP", "ZIP 压缩成功", ParamRequirement.TARGET_REQUIRED),
```

---

### 3.2 DiskManagerActionType.java

**路径**：`src/main/java/cn/zeros/enums/DiskManagerActionType.java`

**改动内容**：

1. **新增内部枚举 `ParamRequirement`**：定义参数需求类型
   - `NONE`：无需参数
   - `PARTITION`：需要分区参数
   - `PARTITION_AND_SIZE`：需要分区和大小参数
   - `SOURCE_AND_TARGET`：需要源和目标参数

2. **新增字段**：
   - `successMessage`：操作成功消息
   - `paramRequirement`：参数需求类型

3. **新增方法**：
   - `validate(ActionContext ctx)`：验证参数是否满足要求，返回错误消息或 null

---

### 3.3 CompressionDirveController.java

**路径**：`src/main/java/cn/zeros/controller/CompressionDirveController.java`

**改动内容**：

1. **引入函数式映射**：使用 `Map<CompressionActionType, Function<ActionContext, Map<String, Object>>>` 替代 switch 语句

2. **新增 `initExecutors()` 方法**：初始化操作执行器映射

3. **简化 `handleRequest()` 方法**：
   - 构建 ActionContext
   - 验证操作类型
   - 调用枚举的 validate() 方法验证参数
   - 从映射中获取执行器并执行

**改动前后对比**：

```java
// 改动前
switch (actionType) {
    case COMPRESS_ZIP:
        result = compressionService.compressZip(...);
        break;
    case EXTRACT_ZIP:
        result = compressionService.extractZip(...);
        break;
    // ... 更多 case
}

// 改动后
Function<ActionContext, Map<String, Object>> executor = executors.get(actionType);
Map<String, Object> result = executor.apply(ctx);
```

---

### 3.4 DiskManagerController.java

**路径**：`src/main/java/cn/zeros/controller/DiskManagerController.java`

**改动内容**：

1. **引入函数式映射**：使用 `Map<DiskManagerActionType, Function<ActionContext, Map<String, Object>>>` 替代 switch 语句

2. **新增 `initExecutors()` 方法**：初始化操作执行器映射

3. **新增 `buildSuccessMessage()` 方法**：为某些需要动态消息的操作构建成功消息

4. **简化请求处理逻辑**

---

### 3.5 CompressionDirveServiceImpl.java

**路径**：`src/main/java/cn/zeros/service/impl/CompressionDirveServiceImpl.java`

**改动内容**：

1. **使用 CompressionUtil 工具类**：
   - `CompressionUtil.resolveSourcePaths()` 替代重复的路径解析逻辑
   - `CompressionUtil.getFinalSourcePaths()` 获取源路径列表
   - `CompressionUtil.ensureTargetReady()` 替代重复的目标准备逻辑
   - `CompressionUtil.validateSourceFile()` 替代重复的源文件验证
   - `CompressionUtil.buildListResult()` 构建列表结果
   - `CompressionUtil.buildCompressResult()` 构建压缩结果
   - `CompressionUtil.buildExtractResult()` 构建解压结果
   - `CompressionUtil.shouldExclude()` 判断排除路径
   - `CompressionUtil.parseInt()` / `parseBoolean()` / `getStringList()` 解析选项

2. **代码量减少**：通过工具类复用，减少了约 30% 的重复代码

---

### 3.6 DiskManagerServiceImpl.java

**路径**：`src/main/java/cn/zeros/service/impl/DiskManagerServiceImpl.java`

**改动内容**：

1. **使用 DiskUtil 工具类**：
   - `DiskUtil.requireValidDiskLetter()` 验证分区名称
   - `DiskUtil.requireNotSystemPartition()` 验证非系统分区
   - `DiskUtil.calculateStats()` 计算目录统计信息
   - `DiskUtil.deleteDirectoryRecursive()` 递归删除目录
   - `DiskUtil.deleteFilesOnly()` 仅删除文件
   - `DiskUtil.deleteDirectoryContents()` 删除目录内容
   - `DiskUtil.formatTime()` / `currentTime()` 格式化时间
   - `DiskUtil.isSystemPartition()` 检查系统分区

2. **使用 DirectoryStats 模型**：统一返回目录统计信息

## 四、代码结构对比

### 4.1 重构前结构

```
cn.zeros
├── controller
│   ├── CompressionDirveController.java  (大量 switch-case)
│   └── DiskManagerController.java       (大量 switch-case)
├── enums
│   ├── CompressionActionType.java       (仅 code, description)
│   └── DiskManagerActionType.java       (仅 code, description)
├── service/impl
│   ├── CompressionDirveServiceImpl.java (大量重复代码)
│   └── DiskManagerServiceImpl.java      (大量重复代码)
└── model
    └── ApiResponse.java
```

### 4.2 重构后结构

```
cn.zeros
├── controller
│   ├── CompressionDirveController.java  (函数式映射，简洁)
│   └── DiskManagerController.java       (函数式映射，简洁)
├── enums
│   ├── CompressionActionType.java       (含 validate, successMessage)
│   └── DiskManagerActionType.java       (含 validate, successMessage)
├── service/impl
│   ├── CompressionDirveServiceImpl.java (使用 CompressionUtil)
│   └── DiskManagerServiceImpl.java      (使用 DiskUtil)
├── model
│   ├── ApiResponse.java
│   ├── ActionContext.java               [新增]
│   └── DirectoryStats.java              [新增]
└── util
    ├── CompressionUtil.java             [新增]
    └── DiskUtil.java                    [新增]
```

## 五、重构收益

### 5.1 代码质量提升

| 指标 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| 控制器代码行数 | ~400行 | ~200行 | -50% |
| 服务实现重复代码 | 高 | 低 | 显著减少 |
| 参数验证分散度 | 分散 | 集中在枚举 | 统一管理 |
| 可维护性 | 一般 | 良好 | 提升 |

### 5.2 功能增强

1. **参数验证自动化**：枚举自带验证逻辑，新增操作只需定义参数需求
2. **成功消息统一**：枚举定义成功消息，无需在控制器中硬编码
3. **目录统计优化**：`DiskUtil.calculateStats()` 一次遍历获取所有统计信息

### 5.3 扩展性提升

- 新增压缩格式：只需在枚举中添加类型，在 executors 映射中添加执行器
- 新增磁盘操作：同上，无需修改控制器主逻辑

## 六、验证结果

### 6.1 编译验证

```bash
cd backend-java
mvn clean compile
# BUILD SUCCESS
```

### 6.2 功能验证

所有原有功能保持正常：
- ZIP/7Z/TAR/TAR.GZ 压缩解压
- 加密 ZIP 压缩解压
- 分区创建/删除/合并/克隆
- 分区格式化/调整大小
- 磁盘健康检查

---

*文档完成时间：2026-01-16*
