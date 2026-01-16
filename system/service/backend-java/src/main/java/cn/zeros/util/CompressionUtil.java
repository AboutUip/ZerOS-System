package cn.zeros.util;

import cn.zeros.config.DiskConfig;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 压缩服务工具类
 * 提供压缩/解压操作的公共方法
 *
 * @author zeros
 * @date 2026-01-16
 */
public final class CompressionUtil {

    private CompressionUtil() {
        // 工具类不允许实例化
    }

    /**
     * 解析源路径列表
     * 将虚拟路径转换为实际路径，并验证存在性
     *
     * @param sourcePath  单个源路径
     * @param sourcePaths 多个源路径
     * @param diskConfig  磁盘配置
     * @return 实际路径列表
     * @throws IOException 如果源路径不存在或无效
     */
    public static List<Path> resolveSourcePaths(String sourcePath, List<String> sourcePaths, DiskConfig diskConfig) throws IOException {
        List<String> finalSourcePaths = new ArrayList<>();
        if (sourcePaths != null && !sourcePaths.isEmpty()) {
            finalSourcePaths.addAll(sourcePaths);
        } else if (sourcePath != null && !sourcePath.isEmpty()) {
            finalSourcePaths.add(sourcePath);
        } else {
            throw new IOException("缺少源路径参数");
        }

        List<Path> sourceRealPaths = new ArrayList<>();
        for (String sp : finalSourcePaths) {
            Path realPath = PathUtil.convertVirtualPath(sp, diskConfig);
            if (!Files.exists(realPath)) {
                throw new IOException("源路径不存在: " + sp);
            }
            sourceRealPaths.add(realPath);
        }

        return sourceRealPaths;
    }

    /**
     * 获取最终的源路径字符串列表
     *
     * @param sourcePath  单个源路径
     * @param sourcePaths 多个源路径
     * @return 源路径字符串列表
     * @throws IOException 如果没有提供源路径
     */
    public static List<String> getFinalSourcePaths(String sourcePath, List<String> sourcePaths) throws IOException {
        List<String> finalSourcePaths = new ArrayList<>();
        if (sourcePaths != null && !sourcePaths.isEmpty()) {
            finalSourcePaths.addAll(sourcePaths);
        } else if (sourcePath != null && !sourcePath.isEmpty()) {
            finalSourcePaths.add(sourcePath);
        } else {
            throw new IOException("缺少源路径参数");
        }
        return finalSourcePaths;
    }

    /**
     * 确保目标文件不存在并创建父目录
     *
     * @param targetPath    目标实际路径
     * @param virtualPath   目标虚拟路径（用于错误消息）
     * @throws IOException 如果目标文件已存在或无法创建父目录
     */
    public static void ensureTargetReady(Path targetPath, String virtualPath) throws IOException {
        if (Files.exists(targetPath)) {
            throw new IOException("目标文件已存在: " + virtualPath);
        }

        Path parent = targetPath.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
    }

    /**
     * 验证源文件存在
     *
     * @param sourcePath 源虚拟路径
     * @param diskConfig 磁盘配置
     * @return 源文件的实际路径
     * @throws IOException 如果源文件不存在
     */
    public static Path validateSourceFile(String sourcePath, DiskConfig diskConfig) throws IOException {
        Path sourceRealPath = PathUtil.convertVirtualPath(sourcePath, diskConfig);
        if (!Files.exists(sourceRealPath) || !Files.isRegularFile(sourceRealPath)) {
            throw new IOException("压缩文件不存在: " + sourcePath);
        }
        return sourceRealPath;
    }

    /**
     * 构建列表结果
     *
     * @param sourcePath 源路径
     * @param files      文件列表
     * @return 结果 Map
     */
    public static Map<String, Object> buildListResult(String sourcePath, List<Map<String, Object>> files) {
        Map<String, Object> result = new HashMap<>();
        result.put("sourcePath", sourcePath);
        result.put("files", files);
        result.put("count", files.size());
        return result;
    }

    /**
     * 构建压缩结果
     *
     * @param sourcePaths 源路径列表
     * @param targetPath  目标路径
     * @param size        文件大小
     * @return 结果 Map
     */
    public static Map<String, Object> buildCompressResult(List<String> sourcePaths, String targetPath, long size) {
        Map<String, Object> result = new HashMap<>();
        result.put("sourcePaths", sourcePaths);
        if (sourcePaths.size() == 1) {
            result.put("sourcePath", sourcePaths.get(0));
        }
        result.put("targetPath", targetPath);
        result.put("size", size);
        result.put("sourceCount", sourcePaths.size());
        return result;
    }

    /**
     * 构建解压结果
     *
     * @param sourcePath     源路径
     * @param targetPath     目标路径
     * @param count          解压文件数
     * @param extractedFiles 解压的文件列表
     * @return 结果 Map
     */
    public static Map<String, Object> buildExtractResult(String sourcePath, String targetPath, int count, List<String> extractedFiles) {
        Map<String, Object> result = new HashMap<>();
        result.put("sourcePath", sourcePath);
        result.put("targetPath", targetPath);
        result.put("extractedCount", count);
        result.put("extractedFiles", extractedFiles);
        return result;
    }

    /**
     * 判断路径是否应该被排除
     *
     * @param path    路径
     * @param exclude 排除列表
     * @return 是否应该排除
     */
    public static boolean shouldExclude(String path, List<String> exclude) {
        if (exclude == null || exclude.isEmpty()) {
            return false;
        }
        for (String pattern : exclude) {
            String normalizedPattern = pattern.replace("\\", "/");
            if (path.startsWith(normalizedPattern) || path.equals(normalizedPattern)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 解析整数选项
     *
     * @param value        选项值
     * @param defaultValue 默认值
     * @return 解析后的整数
     */
    public static int parseInt(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        if (value instanceof String) {
            try {
                return Integer.parseInt(((String) value).trim());
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    /**
     * 解析布尔选项
     *
     * @param value        选项值
     * @param defaultValue 默认值
     * @return 解析后的布尔值
     */
    public static boolean parseBoolean(Object value, boolean defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        if (value instanceof Number) {
            return ((Number) value).intValue() != 0;
        }
        if (value instanceof String) {
            String s = ((String) value).trim();
            return "true".equalsIgnoreCase(s) || "1".equals(s);
        }
        return defaultValue;
    }

    /**
     * 获取字符串列表选项
     *
     * @param value 选项值
     * @return 字符串列表
     */
    public static List<String> getStringList(Object value) {
        if (value == null) {
            return new ArrayList<>();
        }
        if (value instanceof List<?>) {
            List<?> list = (List<?>) value;
            List<String> result = new ArrayList<>(list.size());
            for (Object item : list) {
                if (item != null) {
                    result.add(String.valueOf(item));
                }
            }
            return result;
        }
        return new ArrayList<>();
    }
}
