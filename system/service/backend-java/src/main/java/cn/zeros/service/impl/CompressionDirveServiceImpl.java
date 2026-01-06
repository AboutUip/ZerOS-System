package cn.zeros.service.impl;

import cn.zeros.config.DiskConfig;
import cn.zeros.service.ICompressionDirveService;
import cn.zeros.util.PathUtil;
import org.springframework.stereotype.Service;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@Service
public class CompressionDirveServiceImpl implements ICompressionDirveService {

    private final DiskConfig diskConfig;

    public CompressionDirveServiceImpl(DiskConfig diskConfig) {
        this.diskConfig = diskConfig;
    }

    // ============ ZIP 操作 ============

    @Override
    public Map<String, Object> compressZip(String targetPath,
                                          String sourcePath,
                                          List<String> sourcePaths,
                                          Map<String, Object> options) throws IOException {
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig.getDiskCPath(), diskConfig.getDiskDPath());

        // 确定源路径列表
        List<String> finalSourcePaths = new ArrayList<>();
        if (sourcePaths != null && !sourcePaths.isEmpty()) {
            finalSourcePaths.addAll(sourcePaths);
        } else if (sourcePath != null && !sourcePath.isEmpty()) {
            finalSourcePaths.add(sourcePath);
        } else {
            throw new IOException("缺少源路径参数");
        }

        // 转换为实际路径
        List<Path> sourceRealPaths = new ArrayList<>();
        for (String sp : finalSourcePaths) {
            sourceRealPaths.add(PathUtil.convertVirtualPath(sp, diskConfig.getDiskCPath(), diskConfig.getDiskDPath()));
        }

        // 检查源路径是否存在
        for (Path sp : sourceRealPaths) {
            if (!Files.exists(sp)) {
                throw new IOException("源路径不存在: " + sp);
            }
        }

        // 检查目标文件是否存在
        if (Files.exists(targetRealPath)) {
            throw new IOException("目标文件已存在: " + targetPath);
        }

        // 确保父目录存在
        Path parent = targetRealPath.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        // 获取选项
        List<String> exclude = getStringList(options != null ? options.get("exclude") : null);
        int compressionLevel = parseInt(options != null ? options.get("compressionLevel") : null, 6);
        compressionLevel = Math.max(0, Math.min(9, compressionLevel));

        // 创建 ZIP 文件
        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(targetRealPath.toFile()))) {
            // ZipOutputStream 支持设置压缩级别（0-9）
            zos.setLevel(compressionLevel);

            for (Path sourceRealPath : sourceRealPaths) {
                if (Files.isRegularFile(sourceRealPath)) {
                    // 单个文件（保持原行为：仅使用文件名，可能在多源时存在重名覆盖风险）
                    addFileToZip(zos, sourceRealPath, sourceRealPath.getFileName().toString());
                } else if (Files.isDirectory(sourceRealPath)) {
                    // 目录：保持原行为（目录作为顶层文件夹）
                    String baseName = sourceRealPath.getFileName().toString();
                    String basePrefix = baseName + "/";

                    Files.walkFileTree(sourceRealPath, new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                            Path relativePath = sourceRealPath.relativize(file);
                            String relative = relativePath.toString().replace("\\", "/");

                            if (shouldExclude(relative, exclude)) {
                                return FileVisitResult.CONTINUE;
                            }

                            String zipPath = basePrefix + relative;
                            addFileToZip(zos, file, zipPath);
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                            if (dir.equals(sourceRealPath)) {
                                return FileVisitResult.CONTINUE;
                            }

                            Path relativePath = sourceRealPath.relativize(dir);
                            String relative = relativePath.toString().replace("\\", "/");

                            if (!shouldExclude(relative, exclude)) {
                                String zipPath = basePrefix + relative + "/";
                                zos.putNextEntry(new ZipEntry(zipPath));
                                zos.closeEntry();
                            }
                            return FileVisitResult.CONTINUE;
                        }
                    });
                }
            }
        }

        long fileSize = Files.size(targetRealPath);

        Map<String, Object> result = new HashMap<>();
        result.put("sourcePaths", finalSourcePaths);
        if (finalSourcePaths.size() == 1) {
            result.put("sourcePath", finalSourcePaths.get(0));
        }
        result.put("targetPath", targetPath);
        result.put("size", fileSize);
        result.put("compressionLevel", compressionLevel);
        result.put("sourceCount", finalSourcePaths.size());
        return result;
    }

    private void addFileToZip(ZipOutputStream zos, Path file, String zipPath) throws IOException {
        zos.putNextEntry(new ZipEntry(zipPath));
        Files.copy(file, zos);
        zos.closeEntry();
    }

    private boolean shouldExclude(String path, List<String> exclude) {
        for (String pattern : exclude) {
            String normalizedPattern = pattern.replace("\\", "/");
            if (path.startsWith(normalizedPattern) || path.equals(normalizedPattern)) {
                return true;
            }
        }
        return false;
    }

    @Override
    public Map<String, Object> extractZip(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        Path sourceRealPath = PathUtil.convertVirtualPath(sourcePath, diskConfig.getDiskCPath(), diskConfig.getDiskDPath());
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig.getDiskCPath(), diskConfig.getDiskDPath());

        if (!Files.exists(sourceRealPath) || !Files.isRegularFile(sourceRealPath)) {
            throw new IOException("压缩文件不存在: " + sourcePath);
        }

        // 确保目标目录存在
        Files.createDirectories(targetRealPath);

        List<String> filesToExtract = getStringList(options != null ? options.get("files") : null);
        boolean overwrite = parseBoolean(options != null ? options.get("overwrite") : null, false);

        int extractedCount = 0;
        List<String> extractedFiles = new ArrayList<>();

        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(sourceRealPath.toFile()))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String entryName = entry.getName();

                // 如果指定了文件列表，只解压指定的文件
                if (!filesToExtract.isEmpty() && !filesToExtract.contains(entryName)) {
                    zis.closeEntry();
                    continue;
                }

                Path entryPath = targetRealPath.resolve(entryName).normalize();

                // 安全检查：确保路径在目标目录内（防 Zip Slip）
                if (!entryPath.startsWith(targetRealPath.normalize())) {
                    zis.closeEntry();
                    continue;
                }

                if (entry.isDirectory()) {
                    Files.createDirectories(entryPath);
                } else {
                    if (Files.exists(entryPath) && !overwrite) {
                        zis.closeEntry();
                        continue;
                    }

                    Path entryParent = entryPath.getParent();
                    if (entryParent != null) {
                        Files.createDirectories(entryParent);
                    }
                    Files.copy(zis, entryPath, StandardCopyOption.REPLACE_EXISTING);
                    extractedFiles.add(entryName);
                    extractedCount++;
                }

                zis.closeEntry();
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("sourcePath", sourcePath);
        result.put("targetPath", targetPath);
        result.put("extractedCount", extractedCount);
        result.put("extractedFiles", extractedFiles);
        return result;
    }

    @Override
    public Map<String, Object> listZip(String sourcePath) throws IOException {
        Path sourceRealPath = PathUtil.convertVirtualPath(sourcePath, diskConfig.getDiskCPath(), diskConfig.getDiskDPath());

        if (!Files.exists(sourceRealPath) || !Files.isRegularFile(sourceRealPath)) {
            throw new IOException("压缩文件不存在: " + sourcePath);
        }

        List<Map<String, Object>> files = new ArrayList<>();

        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(sourceRealPath.toFile()))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                Map<String, Object> fileInfo = new HashMap<>();
                fileInfo.put("name", entry.getName());
                fileInfo.put("size", entry.getSize());
                fileInfo.put("compressedSize", entry.getCompressedSize());
                fileInfo.put("directory", entry.isDirectory());
                fileInfo.put("time", entry.getTime());
                files.add(fileInfo);
                zis.closeEntry();
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("sourcePath", sourcePath);
        result.put("files", files);
        result.put("count", files.size());
        return result;
    }

    // ============ RAR 操作 ============

    @Override
    public Map<String, Object> checkSupport() {
        Map<String, Object> result = new HashMap<>();
        // ZIP 支持（Java 标准库支持）
        result.put("zip", true);
        // RAR 支持（需要 junrar 库，目前未完全实现）
        result.put("rar", false);
        return result;
    }

    @Override
    public Map<String, Object> extractRar(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        // 使用 junrar 库实现
        throw new IOException("RAR 解压功能需要使用 junrar 库，暂未完全实现");
    }

    @Override
    public Map<String, Object> compressRar(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        // RAR 压缩需要外部工具
        throw new IOException("RAR 压缩功能需要外部工具，暂未实现");
    }

    @Override
    public Map<String, Object> listRar(String sourcePath) throws IOException {
        // 使用 junrar 库实现
        throw new IOException("RAR 列表功能需要使用 junrar 库，暂未完全实现");
    }

    private static int parseInt(Object value, int defaultValue) {
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

    private static boolean parseBoolean(Object value, boolean defaultValue) {
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

    private static List<String> getStringList(Object value) {
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


