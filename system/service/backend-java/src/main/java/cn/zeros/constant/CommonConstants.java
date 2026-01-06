package cn.zeros.constant;

/**
 * 通用常量类
 * 
 * @author zeros
 * @date 2024
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
     * 磁盘标识
     */
    public static final String DISK_C = "C";
    public static final String DISK_D = "D";
    
    /**
     * 文件类型：目录
     */
    public static final String FILE_TYPE_DIRECTORY = "directory";
    
    /**
     * 文件类型：文件
     */
    public static final String FILE_TYPE_FILE = "file";
    
    /**
     * 压缩级别范围
     */
    public static final int COMPRESSION_LEVEL_MIN = 0;
    public static final int COMPRESSION_LEVEL_MAX = 9;
    public static final int COMPRESSION_LEVEL_DEFAULT = 6;
    
    /**
     * WebClient超时时间（秒）
     */
    public static final int WEB_CLIENT_TIMEOUT_SECONDS = 30;
    
    /**
     * 缓存时间（小时）
     */
    public static final int CACHE_MAX_AGE_HOURS = 1;
    
    /**
     * 默认内存大小（10MB）
     */
    public static final int DEFAULT_MAX_IN_MEMORY_SIZE = 10 * 1024 * 1024;
}


