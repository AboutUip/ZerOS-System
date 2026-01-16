package cn.zeros.service.impl;

import cn.zeros.config.DiskConfig;
import cn.zeros.constant.CommonConstants;
import cn.zeros.constant.DiskConstants;
import cn.zeros.constant.FileConstants;
import cn.zeros.service.IFSDirveService;
import cn.zeros.util.PathUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Stream;

/**
 * 文件系统驱动服务实现类
 *
 * @author zeros
 * @date 2026-01-16
 */
@Slf4j
@Service
public class FSDirveServiceImpl implements IFSDirveService {

    private final DiskConfig diskConfig;
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern(CommonConstants.DATE_TIME_FORMAT);

    public FSDirveServiceImpl(DiskConfig diskConfig) {
        this.diskConfig = diskConfig;
    }

    // ============ 目录操作 ============

    public Map<String, Object> createDirectory(String path, String name) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        Path newDirPath = dirPath.resolve(name).normalize();
        
        if (!Files.exists(dirPath)) {
            throw new IOException("父目录不存在: " + path);
        }
        
        if (Files.exists(newDirPath)) {
            Map<String, Object> result = new HashMap<>();
            result.put("path", path + CommonConstants.PATH_SEPARATOR + name);
            result.put("name", name);
            result.put("existed", true);
            return result;
        }
        
        Files.createDirectories(newDirPath);
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path + "/" + name);
        result.put("name", name);
        result.put("existed", false);
        return result;
    }
    
    public Map<String, Object> deleteDirectory(String path) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        
        if (!Files.exists(dirPath) || !Files.isDirectory(dirPath)) {
            throw new IOException("目录不存在: " + path);
        }
        
        try (Stream<Path> stream = Files.list(dirPath)) {
            if (stream.findAny().isPresent()) {
                throw new IOException("目录不为空，无法删除");
            }
        }
        
        Files.delete(dirPath);
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path);
        return result;
    }
    
    public Map<String, Object> deleteDirectoryRecursive(String path) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        
        if (!Files.exists(dirPath) || !Files.isDirectory(dirPath)) {
            throw new IOException("目录不存在: " + path);
        }
        
        Files.walkFileTree(dirPath, new SimpleFileVisitor<Path>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }
            
            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                Files.delete(dir);
                return FileVisitResult.CONTINUE;
            }
        });
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path);
        return result;
    }
    
    public Map<String, Object> listDirectory(String path) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        if (!Files.exists(dirPath) || !Files.isDirectory(dirPath)) {
            throw new IOException("目录不存在: " + path);
        }
        
        List<Map<String, Object>> items = new ArrayList<>();
        
        try (Stream<Path> stream = Files.list(dirPath)) {
            stream.forEach(itemPath -> {
                try {
                    Map<String, Object> item = new HashMap<>();
                    String fileName = itemPath.getFileName().toString();
                    boolean isDir = Files.isDirectory(itemPath);
                    
                    item.put("name", fileName);
                    item.put("type", isDir ? CommonConstants.FILE_TYPE_DIRECTORY : CommonConstants.FILE_TYPE_FILE);
                    item.put("path", path + CommonConstants.PATH_SEPARATOR + fileName);
                    
                    BasicFileAttributes attrs = Files.readAttributes(itemPath, BasicFileAttributes.class);
                    
                    if (isDir) {
                        item.put("size", 0);
                    } else {
                        item.put("size", attrs.size());
                        String ext = getFileExtension(fileName);
                        if (!ext.isEmpty()) {
                            item.put("extension", ext);
                        }
                    }
                    
                    item.put("modified", formatDateTime(attrs.lastModifiedTime().toInstant()));
                    item.put("created", formatDateTime(attrs.creationTime().toInstant()));
                    
                    items.add(item);
                } catch (IOException e) {
                    // 忽略错误项
                }
            });
        }
        
        // 排序：目录在前，文件在后
        items.sort((a, b) -> {
            String typeA = (String) a.get("type");
            String typeB = (String) b.get("type");
            if (!typeA.equals(typeB)) {
                return typeA.equals(CommonConstants.FILE_TYPE_DIRECTORY) ? -1 : 1;
            }
            return ((String) a.get("name")).compareToIgnoreCase((String) b.get("name"));
        });
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path);
        result.put("items", items);
        result.put("count", items.size());
        return result;
    }
    
    public Map<String, Object> renameDirectory(String path, String oldName, String newName) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        Path oldDirPath = dirPath.resolve(oldName).normalize();
        Path newDirPath = dirPath.resolve(newName).normalize();
        
        if (!Files.exists(oldDirPath) || !Files.isDirectory(oldDirPath)) {
            throw new IOException("目录不存在: " + path + "/" + oldName);
        }
        
        if (Files.exists(newDirPath)) {
            throw new IOException("目标目录已存在: " + path + "/" + newName);
        }
        
        Files.move(oldDirPath, newDirPath);
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path);
        result.put("oldName", oldName);
        result.put("newName", newName);
        return result;
    }
    
    public Map<String, Object> moveDirectory(String sourcePath, String targetPath) throws IOException {
        Path sourceDirPath = PathUtil.convertVirtualPath(sourcePath, diskConfig);
        Path targetDirPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        
        if (!Files.exists(sourceDirPath) || !Files.isDirectory(sourceDirPath)) {
            throw new IOException("源目录不存在: " + sourcePath);
        }
        
        if (!Files.exists(targetDirPath) || !Files.isDirectory(targetDirPath)) {
            throw new IOException("目标目录不存在: " + targetPath);
        }
        
        String dirName = sourceDirPath.getFileName().toString();
        Path newPath = targetDirPath.resolve(dirName).normalize();
        
        if (Files.exists(newPath)) {
            throw new IOException("目标位置已存在同名目录");
        }
        
        Files.move(sourceDirPath, newPath);
        
        Map<String, Object> result = new HashMap<>();
        result.put("sourcePath", sourcePath);
        result.put("targetPath", targetPath + "/" + dirName);
        return result;
    }
    
    public Map<String, Object> copyDirectory(String sourcePath, String targetPath) throws IOException {
        Path sourceDirPath = PathUtil.convertVirtualPath(sourcePath, diskConfig);
        Path targetDirPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        
        if (!Files.exists(sourceDirPath) || !Files.isDirectory(sourceDirPath)) {
            throw new IOException("源目录不存在: " + sourcePath);
        }
        
        if (!Files.exists(targetDirPath) || !Files.isDirectory(targetDirPath)) {
            throw new IOException("目标目录不存在: " + targetPath);
        }
        
        String dirName = sourceDirPath.getFileName().toString();
        Path newPath = targetDirPath.resolve(dirName).normalize();
        
        if (Files.exists(newPath)) {
            throw new IOException("目标位置已存在同名目录");
        }
        
        copyDirectoryRecursive(sourceDirPath, newPath);
        
        Map<String, Object> result = new HashMap<>();
        result.put("sourcePath", sourcePath);
        result.put("targetPath", targetPath + "/" + dirName);
        return result;
    }
    
    private void copyDirectoryRecursive(Path source, Path target) throws IOException {
        Files.walkFileTree(source, new SimpleFileVisitor<Path>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                Path targetDir = target.resolve(source.relativize(dir));
                Files.createDirectories(targetDir);
                return FileVisitResult.CONTINUE;
            }
            
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Path targetFile = target.resolve(source.relativize(file));
                Files.copy(file, targetFile, StandardCopyOption.REPLACE_EXISTING);
                return FileVisitResult.CONTINUE;
            }
        });
    }
    
    // ============ 文件操作 ============
    
    public Map<String, Object> createFile(String path, String fileName, String content) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        Path filePath = dirPath.resolve(fileName).normalize();
        
        // 验证文件名
        if (fileName == null || fileName.isEmpty() || fileName.contains("/") || fileName.contains("\\")) {
            throw new IllegalArgumentException("无效的文件名");
        }
        
        if (!Files.exists(dirPath)) {
            throw new IOException("父目录不存在: " + path);
        }
        
        if (Files.exists(filePath)) {
            throw new IOException("文件已存在: " + fileName);
        }
        
        Files.writeString(filePath, content != null ? content : "", StandardCharsets.UTF_8);
        log.debug("创建文件: {}, 大小: {}", filePath, content != null ? content.length() : 0);
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path + "/" + fileName);
        result.put("fileName", fileName);
        result.put("size", content != null ? content.length() : 0);
        return result;
    }
    
    public Map<String, Object> readFile(String path, String fileName, boolean asBase64) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        Path filePath = dirPath.resolve(fileName).normalize();
        
        if (!Files.exists(filePath)) {
            throw new IOException("文件不存在: " + fileName);
        }
        
        if (!Files.isRegularFile(filePath)) {
            throw new IOException("路径不是文件: " + fileName);
        }
        
        // 检测文件类型，如果是二进制文件（图片等），自动使用base64编码
        String fileExt = getFileExtension(fileName).toLowerCase();
        boolean isImage = FileConstants.IMAGE_EXTENSIONS.contains(fileExt);
        
        // 如果请求base64编码，或者是图片文件，则使用base64编码
        boolean shouldEncodeBase64 = asBase64 || isImage;
        
        BasicFileAttributes attrs = Files.readAttributes(filePath, BasicFileAttributes.class);
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path + "/" + fileName);
        result.put("fileName", fileName);
        result.put("size", attrs.size());
        
        if (shouldEncodeBase64) {
            byte[] bytes = Files.readAllBytes(filePath);
            result.put("content", Base64.getEncoder().encodeToString(bytes));
            result.put("isBase64", true);
        } else {
            result.put("content", Files.readString(filePath, StandardCharsets.UTF_8));
            result.put("isBase64", false);
        }
        
        result.put("modified", formatDateTime(attrs.lastModifiedTime().toInstant()));
        result.put("created", formatDateTime(attrs.creationTime().toInstant()));
        
        return result;
    }
    
    public Map<String, Object> writeFile(String path, String fileName, String content, String writeMod, boolean isBase64) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        Path filePath = dirPath.resolve(fileName).normalize();
        
        // 验证文件名
        if (fileName == null || fileName.isEmpty() || fileName.contains("/") || fileName.contains("\\")) {
            throw new IllegalArgumentException("无效的文件名");
        }
        
        if (!Files.exists(dirPath)) {
            throw new IOException("父目录不存在: " + path);
        }
        
        boolean fileExists = Files.exists(filePath);
        
        byte[] bytes;
        if (isBase64) {
            try {
                bytes = Base64.getDecoder().decode(content);
            } catch (IllegalArgumentException e) {
                throw new IOException("Base64 解码失败");
            }
        } else {
            bytes = content.getBytes(StandardCharsets.UTF_8);
        }
        
        String finalWriteMod = writeMod != null ? writeMod : "overwrite";
        switch (finalWriteMod) {
            case "append":
                if (fileExists) {
                    Files.write(filePath, bytes, StandardOpenOption.APPEND);
                } else {
                    Files.write(filePath, bytes);
                }
                break;
            case "prepend":
                if (fileExists) {
                    byte[] existingBytes = Files.readAllBytes(filePath);
                    byte[] newBytes = new byte[bytes.length + existingBytes.length];
                    System.arraycopy(bytes, 0, newBytes, 0, bytes.length);
                    System.arraycopy(existingBytes, 0, newBytes, bytes.length, existingBytes.length);
                    Files.write(filePath, newBytes);
                } else {
                    Files.write(filePath, bytes);
                }
                break;
            case "overwrite":
            default:
                Files.write(filePath, bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
                break;
        }
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path + "/" + fileName);
        result.put("fileName", fileName);
        result.put("size", Files.size(filePath));
        result.put("writeMod", finalWriteMod);
        result.put("created", !fileExists);
        return result;
    }
    
    public Map<String, Object> deleteFile(String path, String fileName) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        Path filePath = dirPath.resolve(fileName).normalize();
        
        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            throw new IOException("文件不存在: " + path + "/" + fileName);
        }
        
        Files.delete(filePath);
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path + "/" + fileName);
        result.put("fileName", fileName);
        return result;
    }
    
    public Map<String, Object> renameFile(String path, String oldFileName, String newFileName) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        Path oldFilePath = dirPath.resolve(oldFileName).normalize();
        Path newFilePath = dirPath.resolve(newFileName).normalize();
        
        if (!Files.exists(oldFilePath) || !Files.isRegularFile(oldFilePath)) {
            throw new IOException("文件不存在: " + path + "/" + oldFileName);
        }
        
        if (Files.exists(newFilePath)) {
            throw new IOException("目标文件已存在: " + path + "/" + newFileName);
        }
        
        Files.move(oldFilePath, newFilePath);
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path);
        result.put("oldFileName", oldFileName);
        result.put("newFileName", newFileName);
        return result;
    }
    
    public Map<String, Object> moveFile(String sourcePath, String sourceFileName, String targetPath, String targetFileName) throws IOException {
        Path sourceDirPath = PathUtil.convertVirtualPath(sourcePath, diskConfig);
        Path targetDirPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        
        Path sourceFilePath = sourceDirPath.resolve(sourceFileName).normalize();
        String finalTargetFileName = targetFileName != null ? targetFileName : sourceFileName;
        Path targetFilePath = targetDirPath.resolve(finalTargetFileName).normalize();
        
        if (!Files.exists(sourceFilePath) || !Files.isRegularFile(sourceFilePath)) {
            throw new IOException("源文件不存在: " + sourcePath + "/" + sourceFileName);
        }
        
        if (!Files.exists(targetDirPath)) {
            throw new IOException("目标目录不存在: " + targetPath);
        }
        
        if (Files.exists(targetFilePath)) {
            throw new IOException("目标文件已存在: " + targetPath + "/" + finalTargetFileName);
        }
        
        Files.move(sourceFilePath, targetFilePath);
        
        Map<String, Object> result = new HashMap<>();
        result.put("sourcePath", sourcePath + "/" + sourceFileName);
        result.put("targetPath", targetPath + "/" + finalTargetFileName);
        return result;
    }
    
    public Map<String, Object> copyFile(String sourcePath, String sourceFileName, String targetPath, String targetFileName) throws IOException {
        Path sourceDirPath = PathUtil.convertVirtualPath(sourcePath, diskConfig);
        Path targetDirPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        
        Path sourceFilePath = sourceDirPath.resolve(sourceFileName).normalize();
        String finalTargetFileName = targetFileName != null ? targetFileName : sourceFileName;
        Path targetFilePath = targetDirPath.resolve(finalTargetFileName).normalize();
        
        if (!Files.exists(sourceFilePath) || !Files.isRegularFile(sourceFilePath)) {
            throw new IOException("源文件不存在: " + sourcePath + "/" + sourceFileName);
        }
        
        if (!Files.exists(targetDirPath)) {
            throw new IOException("目标目录不存在: " + targetPath);
        }
        
        if (Files.exists(targetFilePath)) {
            throw new IOException("目标文件已存在: " + targetPath + "/" + finalTargetFileName);
        }
        
        Files.copy(sourceFilePath, targetFilePath);
        
        Map<String, Object> result = new HashMap<>();
        result.put("sourcePath", sourcePath + "/" + sourceFileName);
        result.put("targetPath", targetPath + "/" + finalTargetFileName);
        return result;
    }
    
    public Map<String, Object> getFileInfo(String path, String fileName) throws IOException {
        Path dirPath = PathUtil.convertVirtualPath(path, diskConfig);
        Path filePath = dirPath.resolve(fileName).normalize();
        
        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            throw new IOException("文件不存在: " + path + "/" + fileName);
        }
        
        BasicFileAttributes attrs = Files.readAttributes(filePath, BasicFileAttributes.class);
        
        Map<String, Object> result = new HashMap<>();
        result.put("path", path + "/" + fileName);
        result.put("fileName", fileName);
        result.put("size", attrs.size());
        result.put("extension", getFileExtension(fileName));
        result.put("modified", formatDateTime(attrs.lastModifiedTime().toInstant()));
        result.put("created", formatDateTime(attrs.creationTime().toInstant()));
        
        return result;
    }
    
    // ============ 其他操作 ============
    
    public Map<String, Object> checkPathExists(String path) {
        try {
            Path realPath = PathUtil.convertVirtualPath(path, diskConfig);
            boolean exists = Files.exists(realPath);
            boolean isDir = exists && Files.isDirectory(realPath);
            boolean isFile = exists && Files.isRegularFile(realPath);
            
            Map<String, Object> result = new HashMap<>();
            result.put("path", path);
            result.put("exists", exists);
            result.put("type", isDir ? CommonConstants.FILE_TYPE_DIRECTORY : (isFile ? CommonConstants.FILE_TYPE_FILE : null));
            
            if (exists) {
                BasicFileAttributes attrs = Files.readAttributes(realPath, BasicFileAttributes.class);
                result.put("size", isFile ? attrs.size() : 0);
                result.put("modified", formatDateTime(attrs.lastModifiedTime().toInstant()));
                result.put("created", formatDateTime(attrs.creationTime().toInstant()));
                
                if (isFile) {
                    String fileName = realPath.getFileName().toString();
                    String extension = getFileExtension(fileName);
                    if (!extension.isEmpty()) {
                        result.put("extension", extension);
                    }
                }
            }
            
            return result;
        } catch (Exception e) {
            Map<String, Object> result = new HashMap<>();
            result.put("path", path);
            result.put("exists", false);
            return result;
        }
    }
    
    public Map<String, Object> getDiskInfo(String disk) throws IOException {
        Path diskPath = diskConfig.getPartitionPath(disk);
        
        if (!Files.exists(diskPath) || !Files.isDirectory(diskPath)) {
            throw new IOException("磁盘目录不存在: " + disk);
        }
        
        // 获取文件系统信息
        long totalSpace = Files.getFileStore(diskPath).getTotalSpace();
        long freeSpace = Files.getFileStore(diskPath).getUsableSpace();
        long usedSpace = totalSpace - freeSpace;
        
        // 计算目录大小（递归）
        long dirSize = calculateDirectorySize(diskPath);
        
        // 计算使用百分比
        double usagePercent = totalSpace > 0 ? Math.round((usedSpace * 100.0 / totalSpace) * 100.0) / 100.0 : 0.0;
        
        Map<String, Object> result = new HashMap<>();
        result.put("disk", disk);
        result.put("totalSize", totalSpace);
        result.put("freeSpace", freeSpace);
        result.put("usedSpace", usedSpace);
        result.put("dirSize", dirSize);
        result.put("usagePercent", usagePercent);
        
        return result;
    }
    
    /**
     * 递归计算目录大小
     */
    private long calculateDirectorySize(Path dir) {
        if (!Files.exists(dir) || !Files.isDirectory(dir)) {
            return 0;
        }
        
        long size = 0;
        try (Stream<Path> stream = Files.walk(dir)) {
            size = stream
                    .filter(Files::isRegularFile)
                    .mapToLong(path -> {
                        try {
                            return Files.size(path);
                        } catch (IOException e) {
                            return 0;
                        }
                    })
                    .sum();
        } catch (IOException e) {
            return 0;
        }
        
        return size;
    }
    
    // ============ 工具方法 ============
    
    private String getFileExtension(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        return lastDot > 0 ? fileName.substring(lastDot + 1) : "";
    }
    
    private String formatDateTime(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneId.systemDefault())
                .format(DATE_FORMATTER);
    }
}

