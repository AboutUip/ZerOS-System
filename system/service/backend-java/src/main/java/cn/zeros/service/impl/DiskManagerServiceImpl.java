package cn.zeros.service.impl;

import cn.zeros.config.DiskConfig;
import cn.zeros.constant.DiskConstants;
import cn.zeros.model.DirectoryStats;
import cn.zeros.service.IDiskManagerService;
import cn.zeros.util.DiskUtil;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 磁盘管理服务实现类
 * 使用 DiskUtil 工具类减少重复代码
 *
 * @author zeros
 * @date 2026-01-16
 */
@Slf4j
@Service
public class DiskManagerServiceImpl implements IDiskManagerService {

    private final DiskConfig diskConfig;
    private final ObjectMapper objectMapper;

    public DiskManagerServiceImpl(DiskConfig diskConfig) {
        this.diskConfig = diskConfig;
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public Map<String, Object> checkPartition(String partition) {
        log.info("[DiskMgr] checkPartition {}", partition);
        String diskLetter = DiskUtil.requireValidDiskLetter(partition);
        Path partitionPath = diskConfig.getPartitionPath(diskLetter);

        boolean exists = Files.isDirectory(partitionPath);
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("partition", partition);
        info.put("letter", diskLetter);
        info.put("exists", exists);
        info.put("path", partitionPath.toString());

        if (exists) {
            try {
                DirectoryStats stats = DiskUtil.calculateStats(partitionPath);
                info.put("size", stats.getTotalSize());
                info.put("fileCount", stats.getFileCount());
                info.put("dirCount", stats.getDirectoryCount());

                BasicFileAttributes attrs = Files.readAttributes(partitionPath, BasicFileAttributes.class);
                info.put("created", DiskUtil.formatTime(attrs.creationTime().toMillis()));
                info.put("modified", DiskUtil.formatTime(attrs.lastModifiedTime().toMillis()));

                // 获取配置的磁盘大小
                Map<String, Object> diskData = readDiskDataInternal();
                @SuppressWarnings("unchecked")
                Map<String, Object> partitions = (Map<String, Object>) diskData.get("partitions");
                if (partitions != null && partitions.containsKey(partition)) {
                    long configuredSize = ((Number) partitions.get(partition)).longValue();
                    long actualSize = stats.getTotalSize();
                    info.put("diskTotalSize", configuredSize);
                    info.put("diskFreeSpace", configuredSize - actualSize);
                    info.put("diskUsedSpace", actualSize);
                    info.put("diskUsagePercent", configuredSize > 0 ? Math.round((actualSize * 100.0) / configuredSize * 100) / 100.0 : 0);
                }
            } catch (IOException e) {
                // 忽略错误，返回基本信息
            }
        }

        return info;
    }

    @Override
    public Map<String, Object> createPartition(String partition) throws IOException {
        log.info("[DiskMgr] createPartition {}", partition);
        String diskLetter = DiskUtil.requireValidDiskLetter(partition);
        Path partitionPath = diskConfig.getPartitionPath(diskLetter);

        // 检查分区是否已存在
        if (Files.isDirectory(partitionPath)) {
            throw new IOException("分区已存在: " + partition);
        }

        // 确保 DISK 基础目录存在
        Path basePath = diskConfig.getDiskBasePath();
        if (!Files.isDirectory(basePath)) {
            Files.createDirectories(basePath);
        }

        // 特殊处理：D: 是系统盘，需要从 SYSTEMRESOURCE.zip 解压
        if (DiskUtil.isSystemPartition(diskLetter)) {
            return createSystemPartitionD(partitionPath);
        }

        // 创建普通分区目录
        Files.createDirectories(partitionPath);

        // 同步更新 DiskData.json
        syncDiskDataToFile(partition, DiskConstants.DEFAULT_PARTITION_SIZE);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("partition", partition);
        result.put("letter", diskLetter);
        result.put("path", partitionPath.toString());
        result.put("created", DiskUtil.currentTime());
        return result;
    }

    @Override
    public Map<String, Object> deletePartition(String partition, boolean force) throws IOException {
        log.info("[DiskMgr] deletePartition {} force={}", partition, force);
        String diskLetter = DiskUtil.requireValidDiskLetter(partition);
        DiskUtil.requireNotSystemPartition(diskLetter, "删除");

        Path partitionPath = diskConfig.getPartitionPath(diskLetter);

        // 检查分区是否存在
        if (!Files.isDirectory(partitionPath)) {
            throw new IOException("分区不存在: " + partition);
        }

        // 检查分区是否为空（除非强制删除）
        if (!force) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(partitionPath)) {
                if (stream.iterator().hasNext()) {
                    int fileCount = DiskUtil.countFiles(partitionPath);
                    throw new IOException("分区不为空，无法删除: " + partition + " (包含 " + fileCount + " 个文件/目录，使用 force=true 强制删除)");
                }
            }
        }

        // 删除分区
        if (force) {
            DiskUtil.deleteDirectoryRecursive(partitionPath);
        } else {
            Files.delete(partitionPath);
        }

        // 从 DiskData.json 移除分区
        removePartitionFromDiskData(partition);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("partition", partition);
        result.put("force", force);
        result.put("deleted", DiskUtil.currentTime());
        return result;
    }

    @Override
    public Map<String, Object> mergePartitions(String source, String target, boolean deleteSource) throws IOException {
        log.info("[DiskMgr] mergePartitions {} -> {} deleteSource={}", source, target, deleteSource);
        String sourceLetter = DiskUtil.requireValidDiskLetter(source);
        String targetLetter = DiskUtil.requireValidDiskLetter(target);

        if (source.equals(target)) {
            throw new IllegalArgumentException("源分区和目标分区不能相同");
        }

        Path sourcePath = diskConfig.getPartitionPath(sourceLetter);
        Path targetPath = diskConfig.getPartitionPath(targetLetter);

        // 检查源分区是否存在
        if (!Files.isDirectory(sourcePath)) {
            throw new IOException("源分区不存在: " + source);
        }

        // 检查目标分区是否存在
        if (!Files.isDirectory(targetPath)) {
            throw new IOException("目标分区不存在: " + target);
        }

        // 统计源分区信息
        DirectoryStats sourceStats = DiskUtil.calculateStats(sourcePath);

        // 合并分区（复制所有文件）
        AtomicInteger mergedCount = new AtomicInteger(0);
        AtomicLong mergedSize = new AtomicLong(0);
        List<String> errors = new ArrayList<>();

        copyDirectoryRecursive(sourcePath, targetPath, mergedCount, mergedSize, errors);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("source", source);
        result.put("target", target);
        result.put("mergedCount", mergedCount.get());
        result.put("mergedSize", mergedSize.get());
        result.put("sourceFileCount", sourceStats.getFileCount());
        result.put("sourceSize", sourceStats.getTotalSize());
        result.put("merged", DiskUtil.currentTime());

        if (!errors.isEmpty()) {
            result.put("errors", errors);
        }

        // 如果要求删除源分区
        if (deleteSource) {
            try {
                DiskUtil.deleteDirectoryRecursive(sourcePath);
                removePartitionFromDiskData(source);
                result.put("sourceDeleted", true);
            } catch (IOException e) {
                result.put("sourceDeleted", false);
                result.put("warning", "分区合并成功，但源分区删除失败: " + e.getMessage());
            }
        }

        return result;
    }

    @Override
    public Map<String, Object> listPartitions() {
        log.info("[DiskMgr] listPartitions");
        Path basePath = diskConfig.getDiskBasePath();

        if (!Files.isDirectory(basePath)) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("partitions", Collections.emptyList());
            result.put("count", 0);
            return result;
        }

        // 读取 DiskData.json 配置
        Map<String, Long> partitionSizes = new HashMap<>();
        try {
            Map<String, Object> diskData = readDiskDataInternal();
            @SuppressWarnings("unchecked")
            Map<String, Object> partitions = (Map<String, Object>) diskData.get("partitions");
            if (partitions != null) {
                for (Map.Entry<String, Object> entry : partitions.entrySet()) {
                    partitionSizes.put(entry.getKey(), ((Number) entry.getValue()).longValue());
                }
            }
        } catch (IOException e) {
            // 忽略错误
        }

        // 扫描物理目录
        List<Map<String, Object>> partitionList = new ArrayList<>();
        List<String> createdPartitions = new ArrayList<>();

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(basePath)) {
            for (Path path : stream) {
                String name = path.getFileName().toString();
                if (Files.isDirectory(path) && name.length() == 1 && Character.isUpperCase(name.charAt(0))) {
                    String partitionName = name + ":";
                    Map<String, Object> info = new LinkedHashMap<>();
                    info.put("partition", partitionName);
                    info.put("letter", name);
                    info.put("path", path.toString());

                    try {
                        DirectoryStats stats = DiskUtil.calculateStats(path);
                        long actualSize = stats.getTotalSize();
                        info.put("size", actualSize);
                        info.put("fileCount", stats.getFileCount());
                        info.put("dirCount", stats.getDirectoryCount());

                        BasicFileAttributes attrs = Files.readAttributes(path, BasicFileAttributes.class);
                        info.put("created", DiskUtil.formatTime(attrs.creationTime().toMillis()));
                        info.put("modified", DiskUtil.formatTime(attrs.lastModifiedTime().toMillis()));

                        Long configuredSize = partitionSizes.get(partitionName);
                        if (configuredSize != null) {
                            info.put("configuredSize", configuredSize);
                            info.put("diskTotalSize", configuredSize);
                            info.put("diskFreeSpace", configuredSize - actualSize);
                            info.put("diskUsedSpace", actualSize);
                            info.put("diskUsagePercent", configuredSize > 0 ? Math.round((actualSize * 100.0) / configuredSize * 100) / 100.0 : 0);
                        }
                    } catch (IOException e) {
                        // 忽略错误
                    }

                    partitionList.add(info);
                }
            }
        } catch (IOException e) {
            // 忽略错误
        }

        // 按分区字母排序
        partitionList.sort((a, b) -> ((String) a.get("letter")).compareTo((String) b.get("letter")));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("partitions", partitionList);
        result.put("count", partitionList.size());
        if (!createdPartitions.isEmpty()) {
            result.put("createdPartitions", createdPartitions);
        }
        return result;
    }

    @Override
    public Map<String, Object> readDiskData() throws IOException {
        log.info("[DiskMgr] readDiskData");
        return readDiskDataInternal();
    }

    @Override
    public Map<String, Object> syncDiskData() throws IOException {
        log.info("[DiskMgr] syncDiskData");
        Path diskDataFile = getDiskDataFilePath();

        // 读取现有配置
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalSize", DiskConstants.DEFAULT_TOTAL_SIZE);
        data.put("partitionCount", 0);
        data.put("partitions", new LinkedHashMap<String, Object>());

        if (Files.exists(diskDataFile)) {
            try {
                Map<String, Object> existingData = objectMapper.readValue(diskDataFile.toFile(), new TypeReference<>() {});
                if (existingData != null) {
                    data = existingData;
                }
            } catch (IOException e) {
                // 忽略错误，使用默认值
            }
        }

        // 扫描物理目录，确保配置中包含所有存在的分区
        Path basePath = diskConfig.getDiskBasePath();
        if (Files.isDirectory(basePath)) {
            @SuppressWarnings("unchecked")
            Map<String, Object> partitions = (Map<String, Object>) data.computeIfAbsent("partitions", k -> new LinkedHashMap<>());

            try (DirectoryStream<Path> stream = Files.newDirectoryStream(basePath)) {
                for (Path path : stream) {
                    String name = path.getFileName().toString();
                    if (Files.isDirectory(path) && name.length() == 1 && Character.isUpperCase(name.charAt(0))) {
                        String partitionName = name + ":";
                        if (!partitions.containsKey(partitionName)) {
                            // 如果物理目录存在但配置中没有，使用默认大小
                            long defaultSize = "C".equals(name) ? DiskConstants.DEFAULT_PARTITION_SIZE :
                                    ("D".equals(name) ? DiskConstants.SYSTEM_PARTITION_SIZE : DiskConstants.DEFAULT_PARTITION_SIZE);
                            partitions.put(partitionName, defaultSize);
                        }
                    }
                }
            }

            data.put("partitionCount", partitions.size());
        }

        // 确保目录存在
        Path parent = diskDataFile.getParent();
        if (parent != null && !Files.exists(parent)) {
            Files.createDirectories(parent);
        }

        // 写入文件
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(diskDataFile.toFile(), data);

        return data;
    }

    // ============ 私有辅助方法 ============

    private Path getDiskDataFilePath() {
        // 系统盘优先使用配置的 systemPartition
        String systemPartition = diskConfig.getSystemPartition();
        Path systemPartitionPath = diskConfig.getPartitionPath(systemPartition);
        Path dPath = systemPartitionPath.resolve("DiskData.json");
        if (Files.isDirectory(systemPartitionPath)) {
            return dPath;
        }

        // 如果 D: 不存在，尝试从第一个可用分区读取
        Path basePath = diskConfig.getDiskBasePath();
        if (Files.isDirectory(basePath)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(basePath)) {
                for (Path path : stream) {
                    String name = path.getFileName().toString();
                    if (Files.isDirectory(path) && name.length() == 1 && Character.isUpperCase(name.charAt(0))) {
                        return path.resolve("DiskData.json");
                    }
                }
            } catch (IOException e) {
                // 忽略
            }
        }

        // 默认使用 D:
        return dPath;
    }

    private Map<String, Object> readDiskDataInternal() throws IOException {
        Path diskDataFile = getDiskDataFilePath();

        if (!Files.exists(diskDataFile)) {
            Map<String, Object> defaultData = new LinkedHashMap<>();
            defaultData.put("totalSize", DiskConstants.DEFAULT_TOTAL_SIZE);
            defaultData.put("partitionCount", 0);
            defaultData.put("partitions", new LinkedHashMap<>());
            return defaultData;
        }

        return objectMapper.readValue(diskDataFile.toFile(), new TypeReference<>() {});
    }

    private void syncDiskDataToFile(String partitionName, long size) {
        try {
            Path diskDataFile = getDiskDataFilePath();

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("totalSize", DiskConstants.DEFAULT_TOTAL_SIZE);
            data.put("partitionCount", 0);
            data.put("partitions", new LinkedHashMap<String, Object>());

            if (Files.exists(diskDataFile)) {
                try {
                    Map<String, Object> existingData = objectMapper.readValue(diskDataFile.toFile(), new TypeReference<>() {});
                    if (existingData != null) {
                        data = existingData;
                    }
                } catch (IOException e) {
                    // 忽略
                }
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> partitions = (Map<String, Object>) data.computeIfAbsent("partitions", k -> new LinkedHashMap<>());

            // 只有分区不存在时才设置新的大小
            String key = partitionName.contains(":") ? partitionName : partitionName + ":";
            if (!partitions.containsKey(key)) {
                partitions.put(key, size);
            }

            data.put("partitionCount", partitions.size());

            // 确保目录存在
            Path parent = diskDataFile.getParent();
            if (parent != null && !Files.exists(parent)) {
                Files.createDirectories(parent);
            }

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(diskDataFile.toFile(), data);
        } catch (IOException e) {
            // 静默失败
        }
    }

    private void removePartitionFromDiskData(String partitionName) {
        try {
            Path diskDataFile = getDiskDataFilePath();

            if (!Files.exists(diskDataFile)) {
                return;
            }

            Map<String, Object> data = objectMapper.readValue(diskDataFile.toFile(), new TypeReference<>() {});
            if (data == null || !data.containsKey("partitions")) {
                return;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> partitions = (Map<String, Object>) data.get("partitions");
            String key = partitionName.contains(":") ? partitionName : partitionName + ":";

            if (partitions.containsKey(key)) {
                partitions.remove(key);
                data.put("partitionCount", partitions.size());
                objectMapper.writerWithDefaultPrettyPrinter().writeValue(diskDataFile.toFile(), data);
            }
        } catch (IOException e) {
            // 静默失败
        }
    }

    private Map<String, Object> createSystemPartitionD(Path partitionPath) throws IOException {
        Path zipFile = diskConfig.getSystemResourceZipPath();

        // 检查 ZIP 文件是否存在
        if (!Files.exists(zipFile)) {
            throw new IOException("系统资源文件不存在: " + zipFile);
        }

        // 创建临时解压目录
        Path tempExtractPath = Files.createTempDirectory("zeros_system_");

        try {
            // 解压 ZIP 文件
            try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(zipFile))) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    Path entryPath = tempExtractPath.resolve(entry.getName()).normalize();

                    // 安全检查
                    if (!entryPath.startsWith(tempExtractPath)) {
                        zis.closeEntry();
                        continue;
                    }

                    if (entry.isDirectory()) {
                        Files.createDirectories(entryPath);
                    } else {
                        Path parent = entryPath.getParent();
                        if (parent != null) {
                            Files.createDirectories(parent);
                        }
                        Files.copy(zis, entryPath, StandardCopyOption.REPLACE_EXISTING);
                    }
                    zis.closeEntry();
                }
            }

            // 查找解压后的 D 目录
            Path extractedDPath = tempExtractPath.resolve("D");
            if (!Files.isDirectory(extractedDPath)) {
                // 尝试查找其他可能的目录结构
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(tempExtractPath)) {
                    for (Path path : stream) {
                        if (Files.isDirectory(path) && "D".equalsIgnoreCase(path.getFileName().toString())) {
                            extractedDPath = path;
                            break;
                        }
                    }
                }
            }

            if (!Files.isDirectory(extractedDPath)) {
                throw new IOException("解压后的系统资源目录 D 不存在");
            }

            // 将解压后的 D 目录移动到目标位置
            try {
                Files.move(extractedDPath, partitionPath, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                // move 失败，使用递归复制
                AtomicInteger fileCount = new AtomicInteger(0);
                AtomicLong totalSize = new AtomicLong(0);
                List<String> errors = new ArrayList<>();
                copyDirectoryRecursive(extractedDPath, partitionPath, fileCount, totalSize, errors);

                if (!errors.isEmpty()) {
                    throw new IOException("系统分区 D: 创建失败: " + String.join("; ", errors));
                }
            }

            // 同步更新 DiskData.json
            syncDiskDataToFile("D:", DiskConstants.SYSTEM_PARTITION_SIZE);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("partition", "D:");
            result.put("letter", "D");
            result.put("path", partitionPath.toString());
            result.put("created", DiskUtil.currentTime());
            result.put("source", "SYSTEMRESOURCE.zip");
            return result;

        } finally {
            // 清理临时目录
            try {
                DiskUtil.deleteDirectoryRecursive(tempExtractPath);
            } catch (IOException e) {
                // 忽略
            }
        }
    }

    private void copyDirectoryRecursive(Path source, Path target, AtomicInteger fileCount, AtomicLong totalSize, List<String> errors) throws IOException {
        if (!Files.isDirectory(source)) {
            return;
        }

        if (!Files.exists(target)) {
            Files.createDirectories(target);
        }

        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                Path targetDir = target.resolve(source.relativize(dir));
                if (!Files.exists(targetDir)) {
                    Files.createDirectories(targetDir);
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                try {
                    Path targetFile = target.resolve(source.relativize(file));
                    if (!Files.exists(targetFile)) {
                        Files.copy(file, targetFile);
                        fileCount.incrementAndGet();
                        totalSize.addAndGet(attrs.size());
                    }
                } catch (IOException e) {
                    errors.add("复制文件失败: " + file + " -> " + e.getMessage());
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                errors.add("访问文件失败: " + file + " -> " + exc.getMessage());
                return FileVisitResult.CONTINUE;
            }
        });
    }

    // ============ 新增功能实现 ============

    @Override
    public Map<String, Object> formatPartition(String partition, boolean quick) throws IOException {
        log.info("[DiskMgr] formatPartition {} quick={}", partition, quick);
        String diskLetter = DiskUtil.requireValidDiskLetter(partition);
        DiskUtil.requireNotSystemPartition(diskLetter, "格式化");

        Path partitionPath = diskConfig.getPartitionPath(diskLetter);

        // 检查分区是否存在
        if (!Files.isDirectory(partitionPath)) {
            throw new IOException("分区不存在: " + partition);
        }

        // 统计格式化前的信息
        DirectoryStats originalStats = DiskUtil.calculateStats(partitionPath);

        if (quick) {
            // 快速格式化：仅删除文件，保留目录结构
            DiskUtil.deleteFilesOnly(partitionPath);
        } else {
            // 完全格式化：删除所有内容
            DiskUtil.deleteDirectoryContents(partitionPath);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("partition", partition);
        result.put("letter", diskLetter);
        result.put("quick", quick);
        result.put("originalSize", originalStats.getTotalSize());
        result.put("originalFileCount", originalStats.getFileCount());
        result.put("originalDirCount", originalStats.getDirectoryCount());
        result.put("formatted", DiskUtil.currentTime());
        return result;
    }

    @Override
    public Map<String, Object> resizePartition(String partition, long newSize) throws IOException {
        log.info("[DiskMgr] resizePartition {} newSize={}", partition, newSize);
        String diskLetter = DiskUtil.requireValidDiskLetter(partition);
        Path partitionPath = diskConfig.getPartitionPath(diskLetter);

        // 检查分区是否存在
        if (!Files.isDirectory(partitionPath)) {
            throw new IOException("分区不存在: " + partition);
        }

        // 验证新大小
        if (newSize <= 0) {
            throw new IllegalArgumentException("分区大小必须大于0");
        }

        // 检查当前使用量
        long currentUsage = DiskUtil.calculateDirectorySize(partitionPath);
        if (newSize < currentUsage) {
            throw new IOException("新分区大小 (" + newSize + " 字节) 小于当前使用量 (" + currentUsage + " 字节)");
        }

        // 读取现有配置
        Path diskDataFile = getDiskDataFilePath();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalSize", DiskConstants.DEFAULT_TOTAL_SIZE);
        data.put("partitionCount", 0);
        data.put("partitions", new LinkedHashMap<String, Object>());

        long oldSize = DiskConstants.DEFAULT_PARTITION_SIZE;

        if (Files.exists(diskDataFile)) {
            try {
                Map<String, Object> existingData = objectMapper.readValue(diskDataFile.toFile(), new TypeReference<>() {});
                if (existingData != null) {
                    data = existingData;
                    @SuppressWarnings("unchecked")
                    Map<String, Object> partitions = (Map<String, Object>) data.get("partitions");
                    if (partitions != null && partitions.containsKey(partition)) {
                        oldSize = ((Number) partitions.get(partition)).longValue();
                    }
                }
            } catch (IOException e) {
                // 忽略
            }
        }

        // 更新分区大小
        @SuppressWarnings("unchecked")
        Map<String, Object> partitions = (Map<String, Object>) data.computeIfAbsent("partitions", k -> new LinkedHashMap<>());
        partitions.put(partition, newSize);
        data.put("partitionCount", partitions.size());

        // 确保目录存在
        Path parent = diskDataFile.getParent();
        if (parent != null && !Files.exists(parent)) {
            Files.createDirectories(parent);
        }

        // 写入文件
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(diskDataFile.toFile(), data);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("partition", partition);
        result.put("letter", diskLetter);
        result.put("oldSize", oldSize);
        result.put("newSize", newSize);
        result.put("currentUsage", currentUsage);
        result.put("freeSpace", newSize - currentUsage);
        result.put("resized", DiskUtil.currentTime());
        return result;
    }

    @Override
    public Map<String, Object> checkHealth() {
        log.info("[DiskMgr] checkHealth");
        Path basePath = diskConfig.getDiskBasePath();

        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> partitionHealthList = new ArrayList<>();
        long totalUsedSpace = 0;
        long totalConfiguredSpace = 0;
        int totalFiles = 0;
        int totalDirs = 0;

        // 读取 DiskData.json 配置
        Map<String, Long> partitionSizes = new HashMap<>();
        try {
            Map<String, Object> diskData = readDiskDataInternal();
            @SuppressWarnings("unchecked")
            Map<String, Object> partitions = (Map<String, Object>) diskData.get("partitions");
            if (partitions != null) {
                for (Map.Entry<String, Object> entry : partitions.entrySet()) {
                    partitionSizes.put(entry.getKey(), ((Number) entry.getValue()).longValue());
                }
            }
        } catch (IOException e) {
            // 忽略错误
        }

        if (Files.isDirectory(basePath)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(basePath)) {
                for (Path path : stream) {
                    String name = path.getFileName().toString();
                    if (Files.isDirectory(path) && name.length() == 1 && Character.isUpperCase(name.charAt(0))) {
                        String partitionName = name + ":";
                        Map<String, Object> health = new LinkedHashMap<>();
                        health.put("partition", partitionName);
                        health.put("letter", name);
                        health.put("status", "healthy");

                        try {
                            DirectoryStats stats = DiskUtil.calculateStats(path);
                            long usedSpace = stats.getTotalSize();
                            int fileCount = stats.getFileCount();
                            int dirCount = stats.getDirectoryCount();

                            health.put("usedSpace", usedSpace);
                            health.put("fileCount", fileCount);
                            health.put("dirCount", dirCount);

                            totalUsedSpace += usedSpace;
                            totalFiles += fileCount;
                            totalDirs += dirCount;

                            // 获取配置的大小
                            Long configuredSize = partitionSizes.get(partitionName);
                            if (configuredSize != null) {
                                health.put("configuredSize", configuredSize);
                                health.put("freeSpace", configuredSize - usedSpace);
                                double usagePercent = configuredSize > 0 ? Math.round((usedSpace * 100.0) / configuredSize * 100) / 100.0 : 0;
                                health.put("usagePercent", usagePercent);
                                totalConfiguredSpace += configuredSize;

                                // 健康状态判断
                                if (usagePercent >= 95) {
                                    health.put("status", "critical");
                                    health.put("warning", "分区使用率超过95%");
                                } else if (usagePercent >= 80) {
                                    health.put("status", "warning");
                                    health.put("warning", "分区使用率超过80%");
                                }
                            }

                            // 查找最大文件
                            Map<String, Object> largestFile = findLargestFile(path);
                            if (largestFile != null) {
                                health.put("largestFile", largestFile);
                            }

                            BasicFileAttributes attrs = Files.readAttributes(path, BasicFileAttributes.class);
                            health.put("created", DiskUtil.formatTime(attrs.creationTime().toMillis()));
                            health.put("lastModified", DiskUtil.formatTime(attrs.lastModifiedTime().toMillis()));

                        } catch (IOException e) {
                            health.put("status", "error");
                            health.put("error", e.getMessage());
                        }

                        partitionHealthList.add(health);
                    }
                }
            } catch (IOException e) {
                result.put("error", "无法读取磁盘目录: " + e.getMessage());
            }
        }

        // 按分区字母排序
        partitionHealthList.sort((a, b) -> ((String) a.get("letter")).compareTo((String) b.get("letter")));

        result.put("partitions", partitionHealthList);
        result.put("partitionCount", partitionHealthList.size());
        result.put("totalUsedSpace", totalUsedSpace);
        result.put("totalConfiguredSpace", totalConfiguredSpace);
        result.put("totalFreeSpace", totalConfiguredSpace - totalUsedSpace);
        result.put("totalFiles", totalFiles);
        result.put("totalDirs", totalDirs);
        result.put("overallUsagePercent", totalConfiguredSpace > 0 ? Math.round((totalUsedSpace * 100.0) / totalConfiguredSpace * 100) / 100.0 : 0);
        result.put("checkedAt", DiskUtil.currentTime());

        return result;
    }

    @Override
    public Map<String, Object> clonePartition(String source, String target) throws IOException {
        log.info("[DiskMgr] clonePartition {} -> {}", source, target);
        String sourceLetter = DiskUtil.requireValidDiskLetter(source);
        String targetLetter = DiskUtil.requireValidDiskLetter(target);

        if (source.equals(target)) {
            throw new IllegalArgumentException("源分区和目标分区不能相同");
        }

        Path sourcePath = diskConfig.getPartitionPath(sourceLetter);
        Path targetPath = diskConfig.getPartitionPath(targetLetter);

        // 检查源分区是否存在
        if (!Files.isDirectory(sourcePath)) {
            throw new IOException("源分区不存在: " + source);
        }

        // 检查目标分区是否已存在
        if (Files.exists(targetPath)) {
            throw new IOException("目标分区已存在: " + target + " (请先删除或使用其他分区名)");
        }

        // 统计源分区信息
        DirectoryStats sourceStats = DiskUtil.calculateStats(sourcePath);

        // 创建目标分区目录
        Files.createDirectories(targetPath);

        // 复制所有内容
        AtomicInteger clonedCount = new AtomicInteger(0);
        AtomicLong clonedSize = new AtomicLong(0);
        List<String> errors = new ArrayList<>();

        copyDirectoryRecursive(sourcePath, targetPath, clonedCount, clonedSize, errors);

        // 获取源分区的配置大小，并为目标分区设置相同大小
        try {
            Map<String, Object> diskData = readDiskDataInternal();
            @SuppressWarnings("unchecked")
            Map<String, Object> partitions = (Map<String, Object>) diskData.get("partitions");
            long partitionSize = DiskConstants.DEFAULT_PARTITION_SIZE;
            if (partitions != null && partitions.containsKey(source)) {
                partitionSize = ((Number) partitions.get(source)).longValue();
            }
            syncDiskDataToFile(target, partitionSize);
        } catch (IOException e) {
            // 使用默认大小
            syncDiskDataToFile(target, DiskConstants.DEFAULT_PARTITION_SIZE);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("source", source);
        result.put("target", target);
        result.put("sourceSize", sourceStats.getTotalSize());
        result.put("sourceFileCount", sourceStats.getFileCount());
        result.put("sourceDirCount", sourceStats.getDirectoryCount());
        result.put("clonedFileCount", clonedCount.get());
        result.put("clonedSize", clonedSize.get());
        result.put("cloned", DiskUtil.currentTime());

        if (!errors.isEmpty()) {
            result.put("errors", errors);
        }

        return result;
    }

    // ============ 新增私有辅助方法 ============

    private Map<String, Object> findLargestFile(Path dir) throws IOException {
        if (!Files.isDirectory(dir)) {
            return null;
        }

        final Path[] largestFile = {null};
        final long[] largestSize = {0};

        Files.walkFileTree(dir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (attrs.size() > largestSize[0]) {
                    largestSize[0] = attrs.size();
                    largestFile[0] = file;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });

        if (largestFile[0] != null) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("path", dir.relativize(largestFile[0]).toString());
            result.put("size", largestSize[0]);
            return result;
        }

        return null;
    }
}
