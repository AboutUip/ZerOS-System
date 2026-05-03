package cn.zeros.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 动作上下文类
 * 封装控制器接收的所有参数，用于统一传递给服务层
 *
 * @author zeros
 * @date 2026-01-16
 */
@Data
@Builder
public class ActionContext {

    // ============ 通用路径参数 ============

    /**
     * 路径（通用）
     */
    private String path;

    /**
     * 源路径（单个）
     */
    private String sourcePath;

    /**
     * 目标路径
     */
    private String targetPath;

    /**
     * 源路径列表（多个）
     */
    private List<String> sourcePaths;

    // ============ 文件/目录名称参数 ============

    /**
     * 名称（目录名）
     */
    private String name;

    /**
     * 旧名称
     */
    private String oldName;

    /**
     * 新名称
     */
    private String newName;

    /**
     * 文件名
     */
    private String fileName;

    /**
     * 旧文件名
     */
    private String oldFileName;

    /**
     * 新文件名
     */
    private String newFileName;

    /**
     * 源文件名
     */
    private String sourceFileName;

    /**
     * 目标文件名
     */
    private String targetFileName;

    // ============ 文件内容参数 ============

    /**
     * 文件内容
     */
    private String content;

    /**
     * 写入模式
     */
    private String writeMod;

    /**
     * 是否以 Base64 返回
     */
    private boolean asBase64;

    /**
     * 内容是否为 Base64
     */
    private boolean isBase64;

    // ============ 磁盘管理参数 ============

    /**
     * 磁盘标识
     */
    private String disk;

    /**
     * 分区名称（用于磁盘管理）
     */
    private String partition;

    /**
     * 源分区（用于磁盘管理的合并/克隆操作）
     */
    private String source;

    /**
     * 目标分区（用于磁盘管理的合并/克隆操作）
     */
    private String target;

    /**
     * 是否强制执行
     */
    private boolean force;

    /**
     * 是否删除源
     */
    private boolean deleteSource;

    /**
     * 是否快速操作
     */
    private boolean quick;

    /**
     * 新大小（用于调整分区大小）
     */
    private long newSize;

    // ============ 额外选项 ============

    /**
     * 额外选项
     */
    private Map<String, Object> options;

    /**
     * 获取选项值，如果不存在返回默认值
     */
    public <T> T getOption(String key, Class<T> type, T defaultValue) {
        if (options == null || !options.containsKey(key)) {
            return defaultValue;
        }
        Object value = options.get(key);
        return Optional.ofNullable(value)
                .filter(type::isInstance)
                .map(type::cast)
                .orElse(defaultValue);
    }

    /**
     * 获取非空的选项 Map
     */
    public Map<String, Object> getOptionsOrEmpty() {
        return options != null ? options : Map.of();
    }
}
