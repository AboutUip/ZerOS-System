package cn.zeros.util;

import cn.zeros.config.DiskConfig;
import cn.zeros.constant.CommonConstants;
import cn.zeros.constant.DiskConstants;
import cn.zeros.model.DirectoryStats;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.regex.Pattern;

/**
 * 磁盘管理工具类
 * 提供磁盘管理操作的公共方法
 *
 * @author zeros
 * @date 2026-01-16
 */
public final class DiskUtil {

    private DiskUtil() {
        // 工具类不允许实例化
    }

    private static final Pattern PARTITION_PATTERN = Pattern.compile(DiskConstants.PARTITION_PATTERN);
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern(CommonConstants.DATE_TIME_FORMAT);

    /**
     * 验证分区名称格式并返回磁盘字母
     *
     * @param partition 分区名称（如 "C:"）
     * @return 磁盘字母（如 "C"），如果格式无效返回 null
     */
    public static String validateAndGetDiskLetter(String partition) {
        if (partition == null || !PARTITION_PATTERN.matcher(partition).matches()) {
            return null;
        }
        return partition.substring(0, 1);
    }

    /**
     * 验证分区名称格式，如果无效则抛出异常
     *
     * @param partition 分区名称
     * @return 磁盘字母
     * @throws IllegalArgumentException 如果分区名称格式无效
     */
    public static String requireValidDiskLetter(String partition) {
        String diskLetter = validateAndGetDiskLetter(partition);
        if (diskLetter == null) {
            throw new IllegalArgumentException("无效的分区名称格式: " + partition + " (格式应为单个大写字母+冒号，如 C:)");
        }
        return diskLetter;
    }

    /**
     * 验证分区存在
     *
     * @param diskLetter 磁盘字母
     * @param diskConfig 磁盘配置
     * @return 分区路径
     * @throws IOException 如果分区不存在
     */
    public static Path validatePartitionExists(String diskLetter, DiskConfig diskConfig) throws IOException {
        Path partitionPath = diskConfig.getPartitionPath(diskLetter);
        if (!Files.isDirectory(partitionPath)) {
            throw new IOException("分区不存在: " + diskLetter + ":");
        }
        return partitionPath;
    }

    /**
     * 计算目录统计信息（大小、文件数、目录数）
     * 合并了 calculateDirectorySize, countFilesRecursive, countDirectoriesRecursive 三个方法
     *
     * @param dir 目录路径
     * @return 目录统计信息
     * @throws IOException 如果发生 IO 错误
     */
    public static DirectoryStats calculateStats(Path dir) throws IOException {
        if (!Files.isDirectory(dir)) {
            return DirectoryStats.empty();
        }

        DirectoryStats stats = DirectoryStats.empty();

        Files.walkFileTree(dir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                stats.addFile(attrs.size());
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult preVisitDirectory(Path d, BasicFileAttributes attrs) {
                if (!d.equals(dir)) {
                    stats.addDirectory();
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });

        return stats;
    }

    /**
     * 计算目录大小
     *
     * @param dir 目录路径
     * @return 目录大小（字节）
     * @throws IOException 如果发生 IO 错误
     */
    public static long calculateDirectorySize(Path dir) throws IOException {
        return calculateStats(dir).getTotalSize();
    }

    /**
     * 统计目录中的文件数量
     *
     * @param dir 目录路径
     * @return 文件数量
     * @throws IOException 如果发生 IO 错误
     */
    public static int countFiles(Path dir) throws IOException {
        return calculateStats(dir).getFileCount();
    }

    /**
     * 统计目录中的子目录数量
     *
     * @param dir 目录路径
     * @return 子目录数量
     * @throws IOException 如果发生 IO 错误
     */
    public static int countDirectories(Path dir) throws IOException {
        return calculateStats(dir).getDirectoryCount();
    }

    /**
     * 递归删除目录
     *
     * @param dir 目录路径
     * @throws IOException 如果发生 IO 错误
     */
    public static void deleteDirectoryRecursive(Path dir) throws IOException {
        if (!Files.exists(dir)) {
            return;
        }

        Files.walkFileTree(dir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                Files.delete(d);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    /**
     * 仅删除目录中的文件（保留目录结构）
     *
     * @param dir 目录路径
     * @throws IOException 如果发生 IO 错误
     */
    public static void deleteFilesOnly(Path dir) throws IOException {
        if (!Files.isDirectory(dir)) {
            return;
        }

        Files.walkFileTree(dir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });
    }

    /**
     * 删除目录内容（保留目录本身）
     *
     * @param dir 目录路径
     * @throws IOException 如果发生 IO 错误
     */
    public static void deleteDirectoryContents(Path dir) throws IOException {
        if (!Files.isDirectory(dir)) {
            return;
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path entry : stream) {
                if (Files.isDirectory(entry)) {
                    deleteDirectoryRecursive(entry);
                } else {
                    Files.delete(entry);
                }
            }
        }
    }

    /**
     * 格式化时间戳
     *
     * @param millis 毫秒时间戳
     * @return 格式化后的时间字符串
     */
    public static String formatTime(long millis) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneId.systemDefault()).format(DATE_FORMATTER);
    }

    /**
     * 获取当前格式化时间
     *
     * @return 当前时间字符串
     */
    public static String currentTime() {
        return formatTime(System.currentTimeMillis());
    }

    /**
     * 检查是否为系统分区（D:）
     *
     * @param diskLetter 磁盘字母
     * @return 是否为系统分区
     */
    public static boolean isSystemPartition(String diskLetter) {
        return DiskConstants.DEFAULT_SYSTEM_PARTITION.equals(diskLetter);
    }

    /**
     * 验证不是系统分区，如果是则抛出异常
     *
     * @param diskLetter 磁盘字母
     * @param operation  操作名称
     * @throws IOException 如果是系统分区
     */
    public static void requireNotSystemPartition(String diskLetter, String operation) throws IOException {
        if (isSystemPartition(diskLetter)) {
            throw new IOException("系统分区 D: 不允许" + operation);
        }
    }
}
