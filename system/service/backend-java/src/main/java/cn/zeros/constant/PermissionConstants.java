package cn.zeros.constant;

import java.util.List;
import java.util.Map;

/**
 * 权限常量定义（对应 PHP 端 jwtVerify.php 中的权限映射逻辑）
 *
 * <p>本类定义了两部分核心数据：
 * <ol>
 *   <li><b>ACTION_PERMISSION_MAP</b> — 服务名 → (action → 所需权限) 的三级映射表。
 *       当 UserToken 请求受保护接口时，JwtAuthInterceptor 根据请求的服务名和 action
 *       查询此映射，确定该操作需要哪个权限（如 KERNEL_DISK_READ），
 *       然后校验程序（upid）是否声明了该权限、用户是否有权授予该权限。</li>
 *   <li><b>HIGH_RISK_PERMISSIONS</b> — 高风险权限列表。
 *       这些权限仅允许 ADMIN 或 DEFAULT_ADMIN 级别的用户授予，
 *       普通 USER 即使拥有这些权限也无法将其授权给程序。
 *       与前端 UserControl.HIGH_RISK_PERMISSIONS 保持一致。</li>
 * </ol>
 *
 * <p>权限校验流程（在 JwtAuthInterceptor 中执行）：
 * <pre>
 * 1. 从请求路径提取服务名（FSDirve / CompressionDirve / DISKMANAGER）
 * 2. 从请求参数提取 action（如 read_file）
 * 3. 查表得到所需权限（如 KERNEL_DISK_READ）
 * 4. 检查程序的 upid 是否在 programPermissionsMap 中声明了该权限
 * 5. 检查当前用户级别是否有权授予该权限（高风险权限需要管理员）
 * </pre>
 *
 * @author zeros
 */
public final class PermissionConstants {

    private PermissionConstants() {}

    /**
     * 高风险权限列表
     * 仅 ADMIN / DEFAULT_ADMIN 级别的用户可以授予这些权限给程序
     * 普通 USER 即使自身拥有这些权限也无法授权
     */
    public static final List<String> HIGH_RISK_PERMISSIONS = List.of(
            "CRYPT_GENERATE_KEY",                       // 生成加密密钥
            "CRYPT_IMPORT_KEY",                         // 导入加密密钥
            "CRYPT_DELETE_KEY",                         // 删除加密密钥
            "CRYPT_ENCRYPT",                            // 加密数据
            "CRYPT_DECRYPT",                            // 解密数据
            "PROCESS_MANAGE",                           // 进程管理
            "SYSTEM_STORAGE_WRITE_USER_CONTROL",        // 写入用户控制存储
            "SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL"   // 写入权限控制存储
    );

    /**
     * 服务名 → (action → 所需权限) 的映射表
     *
     * 当前覆盖三个受保护的服务：
     * - FSDirve（文件系统操作）
     * - CompressionDirve（压缩/解压操作）
     * - DISKMANAGER（磁盘分区管理）
     */
    public static final Map<String, Map<String, String>> ACTION_PERMISSION_MAP = Map.of(
            "FSDirve", Map.ofEntries(
                    // 创建类操作 → KERNEL_DISK_CREATE
                    Map.entry("create_dir", "KERNEL_DISK_CREATE"),
                    Map.entry("create_file", "KERNEL_DISK_CREATE"),
                    // 删除类操作 → KERNEL_DISK_DELETE
                    Map.entry("delete_dir", "KERNEL_DISK_DELETE"),
                    Map.entry("delete_file", "KERNEL_DISK_DELETE"),
                    Map.entry("delete_dir_recursive", "KERNEL_DISK_DELETE"),
                    // 读取/列出类操作 → KERNEL_DISK_READ / KERNEL_DISK_LIST
                    Map.entry("list_dir", "KERNEL_DISK_LIST"),
                    Map.entry("read_file", "KERNEL_DISK_READ"),
                    Map.entry("get_file_info", "KERNEL_DISK_READ"),
                    Map.entry("get_disk_info", "KERNEL_DISK_READ"),
                    Map.entry("exists", "KERNEL_DISK_LIST"),
                    // 写入/修改类操作 → KERNEL_DISK_WRITE
                    Map.entry("write_file", "KERNEL_DISK_WRITE"),
                    Map.entry("rename_file", "KERNEL_DISK_WRITE"),
                    Map.entry("rename_dir", "KERNEL_DISK_WRITE"),
                    Map.entry("move_file", "KERNEL_DISK_WRITE"),
                    Map.entry("move_dir", "KERNEL_DISK_WRITE"),
                    Map.entry("copy_file", "KERNEL_DISK_WRITE"),
                    Map.entry("copy_dir", "KERNEL_DISK_WRITE")
            ),
            "CompressionDirve", Map.of(
                    "compress_zip", "KERNEL_DISK_WRITE",
                    "extract_zip", "KERNEL_DISK_WRITE",
                    "list_zip", "KERNEL_DISK_READ",
                    "compress_rar", "KERNEL_DISK_WRITE",
                    "extract_rar", "KERNEL_DISK_WRITE",
                    "list_rar", "KERNEL_DISK_READ",
                    "check_support", "KERNEL_DISK_READ"
            ),
            "DISKMANAGER", Map.of(
                    "check", "KERNEL_DISK_READ",
                    "list", "KERNEL_DISK_LIST",
                    "read_data", "KERNEL_DISK_READ",
                    "create", "KERNEL_DISK_CREATE",
                    "delete", "KERNEL_DISK_DELETE",
                    "merge", "KERNEL_DISK_WRITE",
                    "write_data", "KERNEL_DISK_WRITE",
                    "sync_data", "KERNEL_DISK_WRITE"
            )
    );

    /**
     * 根据请求路径提取对应的服务名称
     * 用于确定当前请求属于哪个受保护服务，进而查询权限映射
     *
     * @param path 请求的 servlet path（如 /FSDirve、/CompressionDirve、/DISKMANAGER）
     * @return 服务名称，不属于任何受保护服务时返回 null
     */
    public static String extractServiceName(String path) {
        if (path == null) return null;
        if (path.contains("/FSDirve")) return "FSDirve";
        if (path.contains("/CompressionDirve")) return "CompressionDirve";
        if (path.contains("/DISKMANAGER")) return "DISKMANAGER";
        return null;
    }

    /**
     * 获取指定服务的某个 action 所需的权限
     *
     * @param serviceName 服务名称
     * @param action      操作名称
     * @return 所需权限名称，未配置时返回 null（表示不限制）
     */
    public static String getRequiredPermission(String serviceName, String action) {
        if (serviceName == null || action == null) return null;
        Map<String, String> serviceMap = ACTION_PERMISSION_MAP.get(serviceName);
        if (serviceMap == null) return null;
        return serviceMap.get(action);
    }

    /**
     * 检查指定权限是否为高风险权限
     */
    public static boolean isHighRisk(String permission) {
        return HIGH_RISK_PERMISSIONS.contains(permission);
    }

    /**
     * 检查用户是否有能力授予指定权限给程序
     * 这是 JWT 鉴权的最后一道检查（复刻 PHP 端 UserControl.canGrantPermission 的逻辑）
     *
     * @param permission      需要授予的权限
     * @param userLevel       用户级别：USER / ADMIN / DEFAULT_ADMIN
     * @param userPermissions 用户自身拥有的权限列表（从 JWT payload 中获取）
     * @return true 表示用户可以授予该权限
     */
    public static boolean canUserGrantPermission(String permission, String userLevel, List<String> userPermissions) {
        // 管理员可以授予所有权限
        if ("ADMIN".equals(userLevel) || "DEFAULT_ADMIN".equals(userLevel)) {
            return true;
        }
        // 普通用户不能授予高风险权限
        if (isHighRisk(permission)) {
            return false;
        }
        // 普通用户只能授予自己拥有的非高风险权限
        return userPermissions != null && userPermissions.contains(permission);
    }
}
