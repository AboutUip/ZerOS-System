package cn.zeros.util;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * ZerOS 项目根目录解析工具。
 *
 * <p>Spring Boot 可能从仓库根目录或 backend-java 目录启动，模块代理和 Node 服务需要
 * 稳定定位仓库根路径，避免使用易受工作目录影响的相对路径。
 *
 * @author zeros
 */
public final class ProjectRootUtil {

    private ProjectRootUtil() {
        throw new UnsupportedOperationException("工具类不允许实例化");
    }

    public static Path resolveProjectRoot() {
        Path cwd = Paths.get("").toAbsolutePath().normalize();
        Path current = cwd;
        for (int i = 0; current != null && i < 8; i++) {
            if (looksLikeProjectRoot(current)) {
                return current;
            }
            current = current.getParent();
        }

        Path backendParent = cwd.getParent();
        if (backendParent != null && "service".equalsIgnoreCase(backendParent.getFileName().toString())) {
            Path candidate = backendParent.getParent();
            if (candidate != null && looksLikeProjectRoot(candidate.getParent() != null ? candidate.getParent() : candidate)) {
                return candidate.getParent() != null ? candidate.getParent() : candidate;
            }
        }

        return cwd;
    }

    private static boolean looksLikeProjectRoot(Path path) {
        return Files.isDirectory(path.resolve("system").resolve("service"))
                && Files.isDirectory(path.resolve("kernel"))
                && Files.exists(path.resolve("README.md"));
    }
}
