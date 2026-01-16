package cn.zeros.util;

import cn.zeros.config.DiskConfig;
import cn.zeros.constant.CommonConstants;
import cn.zeros.constant.DiskConstants;
import lombok.extern.slf4j.Slf4j;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 路径工具类
 *
 * @author zeros
 * @date 2026-01-16
 */
@Slf4j
public class PathUtil {

    /**
     * 将虚拟路径（如 C:/path 或 D:/path）转换为实际文件系统路径
     * 将//路径（如 C://path 或 D://path）转换为 单斜杠
     *
     * @param virtualPath 虚拟路径
     * @param diskConfig  磁盘配置
     * @return 实际文件系统路径
     */
    public static Path convertVirtualPath(String virtualPath, DiskConfig diskConfig) {
        if (virtualPath == null || virtualPath.isEmpty()) {
            throw new IllegalArgumentException("路径不能为空");
        }
        // 移除开头的斜杠
        String path = virtualPath.trim().replaceFirst("^/", "");
        // 将\\转换为 / (防止前端恶意)
        path = path.replace(CommonConstants.WINDOWS_PATH_SEPARATOR, CommonConstants.PATH_SEPARATOR);
        // 对路径中 // 进行去重保持为 / (适配多种情况)
        path = path.replaceAll("//+", CommonConstants.PATH_SEPARATOR);
        // 检查路径格式：应该是 盘符:、盘符:/... 格式
        String diskPattern = "^[A-Z]:(/.*)?$";
        if (!path.matches(diskPattern)) {
            throw new IllegalArgumentException("无效的路径格式: " + virtualPath);
        }
        // 检查目录遍历攻击
        if (path.contains("..")) {
            throw new IllegalArgumentException("路径包含危险字符");
        }

        // 提取盘符和相对路径
        String[] parts = path.split(":", 2);
        String disk = parts[0];
        String relativePath = parts.length > 1 ? parts[1] : "";

        // 验证盘符（支持 A-Z）
        if (disk.length() != 1 || !Character.isUpperCase(disk.charAt(0))) {
            throw new IllegalArgumentException("无效的盘符: " + disk);
        }

        // 移除开头的斜杠并规范化
        relativePath = relativePath.replaceFirst("^/", "").replace(CommonConstants.WINDOWS_PATH_SEPARATOR, CommonConstants.PATH_SEPARATOR);

        // 再次检查相对路径中的目录遍历
        if (relativePath.contains("..")) {
            throw new IllegalArgumentException("路径包含危险字符");
        }

        // 获取基础路径
        Path basePath = diskConfig.getPartitionPath(disk);

        // 构建完整路径
        if (relativePath.isEmpty()) {
            return basePath;
        }

        Path fullPath = basePath.resolve(relativePath).normalize();

        // 安全检查：确保路径在基础路径内
        if (!isPathSafe(fullPath, basePath)) {
            throw new IllegalArgumentException("路径超出允许范围");
        }
        // 对路径中 // 进行去重保持为 /
        fullPath = Paths.get(fullPath.toString().replaceAll("//+", CommonConstants.PATH_SEPARATOR));

        return fullPath;
    }

    /**
     * 将虚拟路径（如 C:/path 或 D:/path）转换为实际文件系统路径
     * 兼容旧版方法签名
     *
     * @param virtualPath 虚拟路径
     * @param diskCPath   C盘路径
     * @param diskDPath   D盘路径
     * @return 实际文件系统路径
     * @deprecated 使用 {@link #convertVirtualPath(String, DiskConfig)} 代替
     */
    @Deprecated
    public static Path convertVirtualPath(String virtualPath, Path diskCPath, Path diskDPath) {
        if (virtualPath == null || virtualPath.isEmpty()) {
            throw new IllegalArgumentException("路径不能为空");
        }
        // 移除开头的斜杠
        String path = virtualPath.trim().replaceFirst("^/", "");
        // 将\\转换为 / (防止前端恶意)
        path = path.replace(CommonConstants.WINDOWS_PATH_SEPARATOR, CommonConstants.PATH_SEPARATOR);
        // 对路径中 // 进行去重保持为 / (适配多种情况)
        path = path.replaceAll("//+", CommonConstants.PATH_SEPARATOR);
        // 检查路径格式：应该是 C:、C:/...、D: 或 D:/...
        String diskPattern = "^[" + DiskConstants.DISK_C + DiskConstants.DISK_D + "]:(/.*)?$";
        if (!path.matches(diskPattern)) {
            throw new IllegalArgumentException("无效的路径格式: " + virtualPath);
        }
        // 检查目录遍历攻击
        if (path.contains("..")) {
            throw new IllegalArgumentException("路径包含危险字符");
        }

        // 提取盘符和相对路径
        String[] parts = path.split(":", 2);
        String disk = parts[0];
        String relativePath = parts.length > 1 ? parts[1] : "";

        // 验证盘符
        if (!DiskConstants.DISK_C.equals(disk) && !DiskConstants.DISK_D.equals(disk)) {
            throw new IllegalArgumentException("无效的盘符: " + disk);
        }

        // 移除开头的斜杠并规范化
        relativePath = relativePath.replaceFirst("^/", "").replace(CommonConstants.WINDOWS_PATH_SEPARATOR, CommonConstants.PATH_SEPARATOR);

        // 再次检查相对路径中的目录遍历
        if (relativePath.contains("..")) {
            throw new IllegalArgumentException("路径包含危险字符");
        }

        // 获取基础路径
        Path basePath = DiskConstants.DISK_C.equals(disk) ? diskCPath : diskDPath;

        // 构建完整路径
        if (relativePath.isEmpty()) {
            return basePath;
        }

        Path fullPath = basePath.resolve(relativePath).normalize();

        // 安全检查：确保路径在基础路径内
        if (!isPathSafe(fullPath, basePath)) {
            throw new IllegalArgumentException("路径超出允许范围");
        }
        // 对路径中 // 进行去重保持为 /
        fullPath = Paths.get(fullPath.toString().replaceAll("//+", CommonConstants.PATH_SEPARATOR));

        return fullPath;
    }

    /**
     * 验证路径是否在允许的范围内（防止目录遍历）
     */
    public static boolean isPathSafe(Path path, Path basePath) {
        try {
            Path normalizedPath = path.normalize();
            Path normalizedBase = basePath.normalize();
            return normalizedPath.startsWith(normalizedBase);
        } catch (Exception e) {
            return false;
        }
    }
}

