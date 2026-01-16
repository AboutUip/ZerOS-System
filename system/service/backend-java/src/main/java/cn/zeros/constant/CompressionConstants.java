package cn.zeros.constant;

/**
 * 压缩服务相关常量
 *
 * @author zeros
 * @date 2026-01-16
 */
public final class CompressionConstants {

    private CompressionConstants() {
        throw new UnsupportedOperationException("工具类不允许实例化");
    }

    /**
     * 压缩级别：最小
     */
    public static final int LEVEL_MIN = 0;

    /**
     * 压缩级别：最大
     */
    public static final int LEVEL_MAX = 9;

    /**
     * 压缩级别：默认
     */
    public static final int LEVEL_DEFAULT = 6;
}
