package cn.zeros.constant;

/**
 * 磁盘管理相关常量
 *
 * @author zeros
 * @date 2026-01-16
 */
public final class DiskConstants {

    private DiskConstants() {
        throw new UnsupportedOperationException("工具类不允许实例化");
    }

    /**
     * 磁盘标识
     */
    public static final String DISK_C = "C";
    public static final String DISK_D = "D";

    /**
     * 默认分区大小（1GB）
     */
    public static final long DEFAULT_PARTITION_SIZE = 1073741824L;

    /**
     * 系统分区大小（2GB，D:）
     */
    public static final long SYSTEM_PARTITION_SIZE = 2147483648L;

    /**
     * 默认总磁盘大小（3GB）
     */
    public static final long DEFAULT_TOTAL_SIZE = 3221225472L;

    /**
     * 分区名称正则表达式（单个大写字母+冒号，如 C:）
     */
    public static final String PARTITION_PATTERN = "^[A-Z]:$";

    /**
     * 默认系统分区标识
     */
    public static final String DEFAULT_SYSTEM_PARTITION = "D";
}
