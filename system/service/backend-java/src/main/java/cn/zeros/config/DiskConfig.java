package cn.zeros.config;

import cn.zeros.constant.DiskConstants;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

import jakarta.annotation.PostConstruct;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 磁盘配置类
 * 简化配置，移除预定义的 C/D 盘路径，改为动态获取
 *
 * @author zeros
 * @date 2026-01-16
 */
@Configuration
@PropertySource("classpath:application.yml")
public class DiskConfig {

    @Value("${disk.base-path:../DISK}")
    private String basePath;

    @Value("${disk.system-partition:D}")
    private String systemPartition;

    @Value("${disk.system-resource-zip:../test/assets/SYSTEMRESOURCE.zip}")
    private String systemResourceZipPath;

    private Path diskBasePath;
    private Path systemResourceZip;

    @PostConstruct
    public void init() {
        // 解析路径（支持相对路径）
        diskBasePath = Paths.get(basePath).toAbsolutePath().normalize();
        systemResourceZip = Paths.get(systemResourceZipPath).toAbsolutePath().normalize();
        // 不再预创建 C/D 目录，由 DiskManager 动态管理
    }

    /**
     * 获取磁盘基础路径
     */
    public Path getDiskBasePath() {
        return diskBasePath;
    }

    /**
     * 根据分区字母获取路径
     *
     * @param letter 分区字母 (A-Z)
     * @return 分区路径
     */
    public Path getPartitionPath(String letter) {
        return diskBasePath.resolve(letter);
    }

    /**
     * 获取系统分区标识
     */
    public String getSystemPartition() {
        return systemPartition;
    }

    /**
     * 获取 SYSTEMRESOURCE.zip 路径
     *
     * @return SYSTEMRESOURCE.zip 文件路径
     */
    public Path getSystemResourceZipPath() {
        return systemResourceZip;
    }

    /**
     * 获取 C 盘路径（兼容方法，推荐使用 getPartitionPath("C")）
     *
     * @deprecated 使用 {@link #getPartitionPath(String)} 代替
     */
    @Deprecated
    public Path getDiskCPath() {
        return getPartitionPath(DiskConstants.DISK_C);
    }

    /**
     * 获取 D 盘路径（兼容方法，推荐使用 getPartitionPath("D")）
     *
     * @deprecated 使用 {@link #getPartitionPath(String)} 代替
     */
    @Deprecated
    public Path getDiskDPath() {
        return getPartitionPath(DiskConstants.DISK_D);
    }
}

