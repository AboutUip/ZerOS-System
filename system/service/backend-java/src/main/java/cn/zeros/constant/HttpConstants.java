package cn.zeros.constant;

/**
 * HTTP/代理服务相关常量
 *
 * @author zeros
 * @date 2026-01-16
 */
public final class HttpConstants {

    private HttpConstants() {
        throw new UnsupportedOperationException("工具类不允许实例化");
    }

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
