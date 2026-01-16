# ZerOS Backend Service (Java/Spring Boot)

这是 ZerOS 项目的 Java 后端服务实现，使用 Spring Boot 3.2.0 和 JDK 21 开发。

## 功能特性

本实现与 PHP 版本功能一致，包含以下服务：

1. **FSDirve** - 文件系统驱动服务
   - 目录操作：创建、删除、列出、重命名、移动、复制
   - 文件操作：创建、读取、写入、删除、重命名、移动、复制、获取信息
   - 其他操作：检查路径存在、获取磁盘信息

2. **CompressionDirve** - 压缩/解压缩服务
   - ZIP 压缩、解压、列表
   - RAR 支持（需要额外实现）

3. **AudioProxy** - 音频代理服务
   - 代理外部音频文件，绕过 CORS 限制
   - 支持 Range 请求（流式播放）
   - 支持多种音频格式

4. **ImageProxy** - 图片代理服务
   - 代理外部图片，避免 CORS 问题
   - 只允许 HTTPS 请求
   - 支持多种图片格式

5. **ModuleProxy** - ES 模块代理服务
   - 正确设置 ES 模块文件的 MIME 类型
   - 禁止缓存
   - 支持多种文件类型

## 技术栈

- Spring Boot 3.2.0
- JDK 21 (LTS)
- Spring WebFlux (用于代理服务)
- Apache Commons Compress (ZIP 支持)
- Junrar (RAR 支持，需额外实现)

## 配置说明

配置文件：`src/main/resources/application.yml`

```yaml
server:
  port: 8898
  servlet:
    context-path: /system/service

disk:
  base-path: ../system/service/DISK
  c-path: ${disk.base-path}/C
  d-path: ${disk.base-path}/D
```

## 构建和运行

### 构建项目

```bash
cd backend-java
mvn clean package
```

### 运行项目

```bash
java -jar target/zeros-backend-1.0.0.jar
```

或者使用 Maven：

```bash
mvn spring-boot:run
```

## API 端点

所有 API 端点都在 `/system/service` 路径下：

- `/system/service/FSDirve` - 文件系统服务
- `/system/service/CompressionDirve` - 压缩服务
- `/system/service/audio-proxy` - 音频代理
- `/system/service/ImageProxy` - 图片代理
- `/system/service/module-proxy` - 模块代理

## 注意事项

1. **JDK 版本**：项目使用 JDK 21 (LTS)，Spring Boot 3.2.0 完全支持。最低要求 JDK 17。
2. **RAR 支持**：RAR 解压功能需要额外的 junrar 库实现，当前代码中仅为接口定义
3. **路径配置**：DISK 路径配置为相对路径，需要根据实际部署情况调整
4. **安全校验**：当前实现未包含安全校验和过滤，仅保证功能可用

## 与 PHP 版本的兼容性

本实现尽量保持与 PHP 版本的 API 兼容，但以下方面可能有所不同：

- 错误响应格式可能略有差异
- 某些边界情况的处理可能不同
- RAR 功能尚未完全实现

## 开发状态

- ✅ FSDirve 服务 - 已完成
- ✅ CompressionDirve 服务（ZIP）- 已完成
- ⚠️ CompressionDirve 服务（RAR）- 部分完成（需要额外实现）
- ✅ AudioProxy 服务 - 已完成
- ✅ ImageProxy 服务 - 已完成
- ✅ ModuleProxy 服务 - 已完成

