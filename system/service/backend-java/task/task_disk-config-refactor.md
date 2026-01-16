# Disk 配置清理与常量重构任务

## 任务概述
1. 简化 disk 配置，移除不必要的预定义盘符配置
2. 将项目中的常量进行分类抽离，提高代码组织性

## 执行步骤

### 一、常量分类重构
- [x] 1. 新建 `DiskConstants.java` - 磁盘相关常量
- [ ] 2. 新建 `CompressionConstants.java` - 压缩相关常量
- [ ] 3. 新建 `HttpConstants.java` - HTTP/代理相关常量
- [ ] 4. 修改 `CommonConstants.java` - 移除已拆分常量

### 二、Disk 配置简化
- [ ] 5. 修改 `application.yml` - 简化 disk 配置
- [ ] 6. 修改 `DiskConfig.java` - 简化配置类

### 三、代码适配
- [ ] 7. 修改 `PathUtil.java` - 适配新 DiskConfig
- [ ] 8. 修改 `CompressionUtil.java` - 适配新路径方式
- [ ] 9. 修改 `FSDirveServiceImpl.java` - 适配 + 移除重复常量
- [ ] 10. 修改 `CompressionDirveServiceImpl.java` - 适配新路径方式
- [ ] 11. 修改 `DiskManagerServiceImpl.java` - 使用 DiskConstants
- [ ] 12. 修改 `DiskUtil.java` - 使用常量类

### 四、验证
- [ ] 13. 编译验证：`mvn clean compile`

## 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `DiskConstants.java` | 新建 | 磁盘相关常量 |
| `CompressionConstants.java` | 新建 | 压缩相关常量 |
| `HttpConstants.java` | 新建 | HTTP/代理相关常量 |
| `CommonConstants.java` | 修改 | 移除已拆分常量 |
| `application.yml` | 修改 | 简化 disk 配置 |
| `DiskConfig.java` | 修改 | 移除 c-path/d-path，添加 system-partition |
| `PathUtil.java` | 修改 | 适配新的 DiskConfig |
| `CompressionUtil.java` | 修改 | 适配新的路径获取方式 |
| `FSDirveServiceImpl.java` | 修改 | 适配新的路径获取方式，移除重复 DATE_FORMATTER |
| `CompressionDirveServiceImpl.java` | 修改 | 适配新的路径获取方式 |
| `DiskManagerServiceImpl.java` | 修改 | 使用 DiskConstants |
| `DiskUtil.java` | 修改 | 使用 DiskConstants 和 CommonConstants |
