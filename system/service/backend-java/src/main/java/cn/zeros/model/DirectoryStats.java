package cn.zeros.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 目录统计信息类
 * 用于统一返回目录的大小、文件数、目录数等信息
 *
 * @author zeros
 * @date 2026-01-16
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DirectoryStats {

    /**
     * 总大小（字节）
     */
    private long totalSize;

    /**
     * 文件数量
     */
    private int fileCount;

    /**
     * 目录数量
     */
    private int directoryCount;

    /**
     * 创建一个空的统计信息
     */
    public static DirectoryStats empty() {
        return new DirectoryStats(0, 0, 0);
    }

    /**
     * 累加另一个统计信息
     */
    public void add(DirectoryStats other) {
        if (other != null) {
            this.totalSize += other.totalSize;
            this.fileCount += other.fileCount;
            this.directoryCount += other.directoryCount;
        }
    }

    /**
     * 增加文件
     */
    public void addFile(long size) {
        this.fileCount++;
        this.totalSize += size;
    }

    /**
     * 增加目录
     */
    public void addDirectory() {
        this.directoryCount++;
    }
}
