package cn.zeros.util;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Resolves the ZerOS repository root from common Spring Boot launch locations.
 */
public final class ProjectRootUtil {

    private ProjectRootUtil() {
        throw new UnsupportedOperationException("Utility class");
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
