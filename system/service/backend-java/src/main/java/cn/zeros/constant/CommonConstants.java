package cn.zeros.constant;

/**
 * 通用常量类（仅保留真正通用的常量）
 *
 * 磁盘相关常量请使用 {@link DiskConstants}
 * 压缩相关常量请使用 {@link CompressionConstants}
 * HTTP相关常量请使用 {@link HttpConstants}
 *
 * @author zeros
 * @date 2026-01-16
 */
public final class CommonConstants {

    private CommonConstants() {
        throw new UnsupportedOperationException("工具类不允许实例化");
    }

    /**
     * 日期时间格式
     */
    public static final String DATE_TIME_FORMAT = "yyyy-MM-dd HH:mm:ss";

    /**
     * 默认字符集
     */
    public static final String DEFAULT_CHARSET = "UTF-8";

    /**
     * 路径分隔符
     */
    public static final String PATH_SEPARATOR = "/";

    /**
     * Windows路径分隔符
     */
    public static final String WINDOWS_PATH_SEPARATOR = "\\";

    /**
     * 文件类型：目录
     */
    public static final String FILE_TYPE_DIRECTORY = "directory";

    /**
     * 文件类型：文件
     */
    public static final String FILE_TYPE_FILE = "file";
}


