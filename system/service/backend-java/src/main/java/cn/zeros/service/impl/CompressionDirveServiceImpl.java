package cn.zeros.service.impl;

import cn.zeros.config.DiskConfig;
import cn.zeros.service.ICompressionDirveService;
import cn.zeros.util.CompressionUtil;
import cn.zeros.util.PathUtil;
import net.lingala.zip4j.ZipFile;
import net.lingala.zip4j.model.ZipParameters;
import net.lingala.zip4j.model.enums.CompressionLevel;
import net.lingala.zip4j.model.enums.CompressionMethod;
import net.lingala.zip4j.model.enums.EncryptionMethod;
import org.apache.commons.compress.archivers.sevenz.SevenZArchiveEntry;
import org.apache.commons.compress.archivers.sevenz.SevenZFile;
import org.apache.commons.compress.archivers.sevenz.SevenZOutputFile;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.*;
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

/**
 * 压缩服务实现类
 * 使用 CompressionUtil 工具类减少重复代码
 *
 * @author zeros
 * @date 2026-01-16
 */
@Slf4j
@Service
public class CompressionDirveServiceImpl implements ICompressionDirveService {

    private final DiskConfig diskConfig;

    public CompressionDirveServiceImpl(DiskConfig diskConfig) {
        this.diskConfig = diskConfig;
    }

    // ============ ZIP 操作 ============

    @Override
    public Map<String, Object> compressZip(String targetPath, String sourcePath,
                                           List<String> sourcePaths, Map<String, Object> options) throws IOException {
        log.info("[Compress] compressZip target={}", targetPath);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        List<String> finalSourcePaths = CompressionUtil.getFinalSourcePaths(sourcePath, sourcePaths);
        List<Path> sourceRealPaths = CompressionUtil.resolveSourcePaths(sourcePath, sourcePaths, diskConfig);

        CompressionUtil.ensureTargetReady(targetRealPath, targetPath);

        List<String> exclude = CompressionUtil.getStringList(options != null ? options.get("exclude") : null);
        int compressionLevel = CompressionUtil.parseInt(options != null ? options.get("compressionLevel") : null, 6);
        compressionLevel = Math.max(0, Math.min(9, compressionLevel));

        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(targetRealPath.toFile()))) {
            zos.setLevel(compressionLevel);

            for (Path sourceRealPath : sourceRealPaths) {
                compressToZip(zos, sourceRealPath, exclude);
            }
        }

        Map<String, Object> result = CompressionUtil.buildCompressResult(finalSourcePaths, targetPath, Files.size(targetRealPath));
        result.put("compressionLevel", compressionLevel);
        return result;
    }

    private void compressToZip(ZipOutputStream zos, Path sourceRealPath, List<String> exclude) throws IOException {
        if (Files.isRegularFile(sourceRealPath)) {
            addFileToZip(zos, sourceRealPath, sourceRealPath.getFileName().toString());
        } else if (Files.isDirectory(sourceRealPath)) {
            String baseName = sourceRealPath.getFileName().toString();
            String basePrefix = baseName + "/";

            Files.walkFileTree(sourceRealPath, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    String relative = sourceRealPath.relativize(file).toString().replace("\\", "/");
                    if (!CompressionUtil.shouldExclude(relative, exclude)) {
                        addFileToZip(zos, file, basePrefix + relative);
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                    if (!dir.equals(sourceRealPath)) {
                        String relative = sourceRealPath.relativize(dir).toString().replace("\\", "/");
                        if (!CompressionUtil.shouldExclude(relative, exclude)) {
                            zos.putNextEntry(new ZipEntry(basePrefix + relative + "/"));
                            zos.closeEntry();
                        }
                    }
                    return FileVisitResult.CONTINUE;
                }
            });
        }
    }

    private void addFileToZip(ZipOutputStream zos, Path file, String zipPath) throws IOException {
        zos.putNextEntry(new ZipEntry(zipPath));
        Files.copy(file, zos);
        zos.closeEntry();
    }

    @Override
    public Map<String, Object> extractZip(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        log.info("[Compress] extractZip {} -> {}", sourcePath, targetPath);
        Path sourceRealPath = CompressionUtil.validateSourceFile(sourcePath, diskConfig);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        Files.createDirectories(targetRealPath);

        List<String> filesToExtract = CompressionUtil.getStringList(options != null ? options.get("files") : null);
        boolean overwrite = CompressionUtil.parseBoolean(options != null ? options.get("overwrite") : null, false);

        List<String> extractedFiles = new ArrayList<>();

        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(sourceRealPath.toFile()))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String entryName = entry.getName();

                if (!filesToExtract.isEmpty() && !filesToExtract.contains(entryName)) {
                    zis.closeEntry();
                    continue;
                }

                Path entryPath = targetRealPath.resolve(entryName).normalize();
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
                }
                zis.closeEntry();
            }
        }

        return CompressionUtil.buildExtractResult(sourcePath, targetPath, extractedFiles.size(), extractedFiles);
    }

    @Override
    public Map<String, Object> listZip(String sourcePath) throws IOException {
        log.info("[Compress] listZip {}", sourcePath);
        Path sourceRealPath = CompressionUtil.validateSourceFile(sourcePath, diskConfig);
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

        return CompressionUtil.buildListResult(sourcePath, files);
    }

    // ============ RAR 操作 ============

    @Override
    public Map<String, Object> checkSupport() {
        log.info("[Compress] checkSupport");
        Map<String, Object> result = new HashMap<>();
        result.put("zip", true);
        result.put("zip_encrypted", true);
        result.put("rar", false);
        result.put("7z", true);
        result.put("tar", true);
        result.put("targz", true);
        return result;
    }

    @Override
    public Map<String, Object> extractRar(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        log.info("[Compress] extractRar {} -> {}", sourcePath, targetPath);
        throw new IOException("RAR 解压功能需要使用 junrar 库，暂未完全实现");
    }

    @Override
    public Map<String, Object> compressRar(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        log.info("[Compress] compressRar {} -> {}", sourcePath, targetPath);
        throw new IOException("RAR 压缩功能需要外部工具，暂未实现");
    }

    @Override
    public Map<String, Object> listRar(String sourcePath) throws IOException {
        log.info("[Compress] listRar {}", sourcePath);
        throw new IOException("RAR 列表功能需要使用 junrar 库，暂未完全实现");
    }

    // ============ TAR 操作 ============

    @Override
    public Map<String, Object> compressTar(String targetPath, String sourcePath, List<String> sourcePaths, Map<String, Object> options) throws IOException {
        log.info("[Compress] compressTar target={}", targetPath);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        List<String> finalSourcePaths = CompressionUtil.getFinalSourcePaths(sourcePath, sourcePaths);
        List<Path> sourceRealPaths = CompressionUtil.resolveSourcePaths(sourcePath, sourcePaths, diskConfig);

        CompressionUtil.ensureTargetReady(targetRealPath, targetPath);

        List<String> exclude = CompressionUtil.getStringList(options != null ? options.get("exclude") : null);

        try (TarArchiveOutputStream taos = new TarArchiveOutputStream(new FileOutputStream(targetRealPath.toFile()))) {
            taos.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX);
            taos.setBigNumberMode(TarArchiveOutputStream.BIGNUMBER_POSIX);

            for (Path sourceRealPath : sourceRealPaths) {
                compressToTar(taos, sourceRealPath, exclude);
            }
        }

        return CompressionUtil.buildCompressResult(finalSourcePaths, targetPath, Files.size(targetRealPath));
    }

    private void compressToTar(TarArchiveOutputStream taos, Path sourceRealPath, List<String> exclude) throws IOException {
        if (Files.isRegularFile(sourceRealPath)) {
            addFileToTar(taos, sourceRealPath, sourceRealPath.getFileName().toString());
        } else if (Files.isDirectory(sourceRealPath)) {
            String baseName = sourceRealPath.getFileName().toString();
            String basePrefix = baseName + "/";

            Files.walkFileTree(sourceRealPath, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    String relative = sourceRealPath.relativize(file).toString().replace("\\", "/");
                    if (!CompressionUtil.shouldExclude(relative, exclude)) {
                        addFileToTar(taos, file, basePrefix + relative);
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                    if (!dir.equals(sourceRealPath)) {
                        String relative = sourceRealPath.relativize(dir).toString().replace("\\", "/");
                        if (!CompressionUtil.shouldExclude(relative, exclude)) {
                            TarArchiveEntry entry = new TarArchiveEntry(basePrefix + relative + "/");
                            taos.putArchiveEntry(entry);
                            taos.closeArchiveEntry();
                        }
                    }
                    return FileVisitResult.CONTINUE;
                }
            });
        }
    }

    private void addFileToTar(TarArchiveOutputStream taos, Path file, String tarPath) throws IOException {
        TarArchiveEntry entry = new TarArchiveEntry(file.toFile(), tarPath);
        taos.putArchiveEntry(entry);
        Files.copy(file, taos);
        taos.closeArchiveEntry();
    }

    @Override
    public Map<String, Object> extractTar(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        log.info("[Compress] extractTar {} -> {}", sourcePath, targetPath);
        Path sourceRealPath = CompressionUtil.validateSourceFile(sourcePath, diskConfig);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        Files.createDirectories(targetRealPath);

        List<String> filesToExtract = CompressionUtil.getStringList(options != null ? options.get("files") : null);
        boolean overwrite = CompressionUtil.parseBoolean(options != null ? options.get("overwrite") : null, false);

        List<String> extractedFiles = new ArrayList<>();

        try (TarArchiveInputStream tais = new TarArchiveInputStream(new FileInputStream(sourceRealPath.toFile()))) {
            extractFromTar(tais, targetRealPath, filesToExtract, overwrite, extractedFiles);
        }

        return CompressionUtil.buildExtractResult(sourcePath, targetPath, extractedFiles.size(), extractedFiles);
    }

    private void extractFromTar(TarArchiveInputStream tais, Path targetRealPath, List<String> filesToExtract,
                                boolean overwrite, List<String> extractedFiles) throws IOException {
        TarArchiveEntry entry;
        while ((entry = tais.getNextTarEntry()) != null) {
            String entryName = entry.getName();

            if (!filesToExtract.isEmpty() && !filesToExtract.contains(entryName)) {
                continue;
            }

            Path entryPath = targetRealPath.resolve(entryName).normalize();
            if (!entryPath.startsWith(targetRealPath.normalize())) {
                continue;
            }

            if (entry.isDirectory()) {
                Files.createDirectories(entryPath);
            } else {
                if (Files.exists(entryPath) && !overwrite) {
                    continue;
                }
                Path entryParent = entryPath.getParent();
                if (entryParent != null) {
                    Files.createDirectories(entryParent);
                }
                Files.copy(tais, entryPath, StandardCopyOption.REPLACE_EXISTING);
                extractedFiles.add(entryName);
            }
        }
    }

    @Override
    public Map<String, Object> listTar(String sourcePath) throws IOException {
        log.info("[Compress] listTar {}", sourcePath);
        Path sourceRealPath = CompressionUtil.validateSourceFile(sourcePath, diskConfig);
        List<Map<String, Object>> files = new ArrayList<>();

        try (TarArchiveInputStream tais = new TarArchiveInputStream(new FileInputStream(sourceRealPath.toFile()))) {
            TarArchiveEntry entry;
            while ((entry = tais.getNextTarEntry()) != null) {
                Map<String, Object> fileInfo = new HashMap<>();
                fileInfo.put("name", entry.getName());
                fileInfo.put("size", entry.getSize());
                fileInfo.put("directory", entry.isDirectory());
                fileInfo.put("time", entry.getModTime().getTime());
                files.add(fileInfo);
            }
        }

        return CompressionUtil.buildListResult(sourcePath, files);
    }

    // ============ TAR.GZ 操作 ============

    @Override
    public Map<String, Object> compressTarGz(String targetPath, String sourcePath, List<String> sourcePaths, Map<String, Object> options) throws IOException {
        log.info("[Compress] compressTarGz target={}", targetPath);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        List<String> finalSourcePaths = CompressionUtil.getFinalSourcePaths(sourcePath, sourcePaths);
        List<Path> sourceRealPaths = CompressionUtil.resolveSourcePaths(sourcePath, sourcePaths, diskConfig);

        CompressionUtil.ensureTargetReady(targetRealPath, targetPath);

        List<String> exclude = CompressionUtil.getStringList(options != null ? options.get("exclude") : null);

        try (GzipCompressorOutputStream gcos = new GzipCompressorOutputStream(new FileOutputStream(targetRealPath.toFile()));
             TarArchiveOutputStream taos = new TarArchiveOutputStream(gcos)) {
            taos.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX);
            taos.setBigNumberMode(TarArchiveOutputStream.BIGNUMBER_POSIX);

            for (Path sourceRealPath : sourceRealPaths) {
                compressToTar(taos, sourceRealPath, exclude);
            }
        }

        return CompressionUtil.buildCompressResult(finalSourcePaths, targetPath, Files.size(targetRealPath));
    }

    @Override
    public Map<String, Object> extractTarGz(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        log.info("[Compress] extractTarGz {} -> {}", sourcePath, targetPath);
        Path sourceRealPath = CompressionUtil.validateSourceFile(sourcePath, diskConfig);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        Files.createDirectories(targetRealPath);

        List<String> filesToExtract = CompressionUtil.getStringList(options != null ? options.get("files") : null);
        boolean overwrite = CompressionUtil.parseBoolean(options != null ? options.get("overwrite") : null, false);

        List<String> extractedFiles = new ArrayList<>();

        try (GzipCompressorInputStream gcis = new GzipCompressorInputStream(new FileInputStream(sourceRealPath.toFile()));
             TarArchiveInputStream tais = new TarArchiveInputStream(gcis)) {
            extractFromTar(tais, targetRealPath, filesToExtract, overwrite, extractedFiles);
        }

        return CompressionUtil.buildExtractResult(sourcePath, targetPath, extractedFiles.size(), extractedFiles);
    }

    @Override
    public Map<String, Object> listTarGz(String sourcePath) throws IOException {
        log.info("[Compress] listTarGz {}", sourcePath);
        Path sourceRealPath = CompressionUtil.validateSourceFile(sourcePath, diskConfig);
        List<Map<String, Object>> files = new ArrayList<>();

        try (GzipCompressorInputStream gcis = new GzipCompressorInputStream(new FileInputStream(sourceRealPath.toFile()));
             TarArchiveInputStream tais = new TarArchiveInputStream(gcis)) {
            TarArchiveEntry entry;
            while ((entry = tais.getNextTarEntry()) != null) {
                Map<String, Object> fileInfo = new HashMap<>();
                fileInfo.put("name", entry.getName());
                fileInfo.put("size", entry.getSize());
                fileInfo.put("directory", entry.isDirectory());
                fileInfo.put("time", entry.getModTime().getTime());
                files.add(fileInfo);
            }
        }

        return CompressionUtil.buildListResult(sourcePath, files);
    }

    // ============ 7Z 操作 ============

    @Override
    public Map<String, Object> compress7z(String targetPath, String sourcePath, List<String> sourcePaths, Map<String, Object> options) throws IOException {
        log.info("[Compress] compress7z target={}", targetPath);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        List<String> finalSourcePaths = CompressionUtil.getFinalSourcePaths(sourcePath, sourcePaths);
        List<Path> sourceRealPaths = CompressionUtil.resolveSourcePaths(sourcePath, sourcePaths, diskConfig);

        CompressionUtil.ensureTargetReady(targetRealPath, targetPath);

        List<String> exclude = CompressionUtil.getStringList(options != null ? options.get("exclude") : null);

        try (SevenZOutputFile sevenZOutput = new SevenZOutputFile(targetRealPath.toFile())) {
            for (Path sourceRealPath : sourceRealPaths) {
                compressTo7z(sevenZOutput, sourceRealPath, exclude);
            }
        }

        return CompressionUtil.buildCompressResult(finalSourcePaths, targetPath, Files.size(targetRealPath));
    }

    private void compressTo7z(SevenZOutputFile sevenZOutput, Path sourceRealPath, List<String> exclude) throws IOException {
        if (Files.isRegularFile(sourceRealPath)) {
            addFileTo7z(sevenZOutput, sourceRealPath, sourceRealPath.getFileName().toString());
        } else if (Files.isDirectory(sourceRealPath)) {
            String baseName = sourceRealPath.getFileName().toString();
            String basePrefix = baseName + "/";

            Files.walkFileTree(sourceRealPath, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    String relative = sourceRealPath.relativize(file).toString().replace("\\", "/");
                    if (!CompressionUtil.shouldExclude(relative, exclude)) {
                        addFileTo7z(sevenZOutput, file, basePrefix + relative);
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                    if (!dir.equals(sourceRealPath)) {
                        String relative = sourceRealPath.relativize(dir).toString().replace("\\", "/");
                        if (!CompressionUtil.shouldExclude(relative, exclude)) {
                            SevenZArchiveEntry entry = sevenZOutput.createArchiveEntry(dir.toFile(), basePrefix + relative + "/");
                            sevenZOutput.putArchiveEntry(entry);
                            sevenZOutput.closeArchiveEntry();
                        }
                    }
                    return FileVisitResult.CONTINUE;
                }
            });
        }
    }

    private void addFileTo7z(SevenZOutputFile sevenZOutput, Path file, String entryName) throws IOException {
        SevenZArchiveEntry entry = sevenZOutput.createArchiveEntry(file.toFile(), entryName);
        sevenZOutput.putArchiveEntry(entry);
        try (InputStream is = Files.newInputStream(file)) {
            byte[] buffer = new byte[8192];
            int len;
            while ((len = is.read(buffer)) != -1) {
                sevenZOutput.write(buffer, 0, len);
            }
        }
        sevenZOutput.closeArchiveEntry();
    }

    @Override
    public Map<String, Object> extract7z(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        log.info("[Compress] extract7z {} -> {}", sourcePath, targetPath);
        Path sourceRealPath = CompressionUtil.validateSourceFile(sourcePath, diskConfig);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        Files.createDirectories(targetRealPath);

        List<String> filesToExtract = CompressionUtil.getStringList(options != null ? options.get("files") : null);
        boolean overwrite = CompressionUtil.parseBoolean(options != null ? options.get("overwrite") : null, false);

        List<String> extractedFiles = new ArrayList<>();

        try (SevenZFile sevenZFile = new SevenZFile(sourceRealPath.toFile())) {
            SevenZArchiveEntry entry;
            while ((entry = sevenZFile.getNextEntry()) != null) {
                String entryName = entry.getName();

                if (!filesToExtract.isEmpty() && !filesToExtract.contains(entryName)) {
                    continue;
                }

                Path entryPath = targetRealPath.resolve(entryName).normalize();
                if (!entryPath.startsWith(targetRealPath.normalize())) {
                    continue;
                }

                if (entry.isDirectory()) {
                    Files.createDirectories(entryPath);
                } else {
                    if (Files.exists(entryPath) && !overwrite) {
                        continue;
                    }
                    Path entryParent = entryPath.getParent();
                    if (entryParent != null) {
                        Files.createDirectories(entryParent);
                    }
                    try (OutputStream os = Files.newOutputStream(entryPath)) {
                        byte[] buffer = new byte[8192];
                        int len;
                        while ((len = sevenZFile.read(buffer)) != -1) {
                            os.write(buffer, 0, len);
                        }
                    }
                    extractedFiles.add(entryName);
                }
            }
        }

        return CompressionUtil.buildExtractResult(sourcePath, targetPath, extractedFiles.size(), extractedFiles);
    }

    @Override
    public Map<String, Object> list7z(String sourcePath) throws IOException {
        log.info("[Compress] list7z {}", sourcePath);
        Path sourceRealPath = CompressionUtil.validateSourceFile(sourcePath, diskConfig);
        List<Map<String, Object>> files = new ArrayList<>();

        try (SevenZFile sevenZFile = new SevenZFile(sourceRealPath.toFile())) {
            SevenZArchiveEntry entry;
            while ((entry = sevenZFile.getNextEntry()) != null) {
                Map<String, Object> fileInfo = new HashMap<>();
                fileInfo.put("name", entry.getName());
                fileInfo.put("size", entry.getSize());
                fileInfo.put("directory", entry.isDirectory());
                fileInfo.put("time", entry.getLastModifiedDate() != null ? entry.getLastModifiedDate().getTime() : 0);
                files.add(fileInfo);
            }
        }

        return CompressionUtil.buildListResult(sourcePath, files);
    }

    // ============ 加密 ZIP 操作 ============

    @Override
    public Map<String, Object> compressZipEncrypted(String targetPath, String sourcePath, List<String> sourcePaths, Map<String, Object> options) throws IOException {
        log.info("[Compress] compressZipEncrypted target={}", targetPath);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);
        List<String> finalSourcePaths = CompressionUtil.getFinalSourcePaths(sourcePath, sourcePaths);
        List<Path> sourceRealPaths = CompressionUtil.resolveSourcePaths(sourcePath, sourcePaths, diskConfig);

        String password = options != null ? (String) options.get("password") : null;
        if (password == null || password.isEmpty()) {
            throw new IOException("加密 ZIP 需要提供密码");
        }

        CompressionUtil.ensureTargetReady(targetRealPath, targetPath);

        int compressionLevel = CompressionUtil.parseInt(options.get("compressionLevel"), 6);
        compressionLevel = Math.max(0, Math.min(9, compressionLevel));

        ZipParameters zipParameters = new ZipParameters();
        zipParameters.setCompressionMethod(CompressionMethod.DEFLATE);
        zipParameters.setCompressionLevel(CompressionLevel.values()[Math.min(compressionLevel, CompressionLevel.values().length - 1)]);
        zipParameters.setEncryptFiles(true);
        zipParameters.setEncryptionMethod(EncryptionMethod.AES);

        try (ZipFile zipFile = new ZipFile(targetRealPath.toFile(), password.toCharArray())) {
            for (Path sourceRealPath : sourceRealPaths) {
                if (Files.isRegularFile(sourceRealPath)) {
                    zipFile.addFile(sourceRealPath.toFile(), zipParameters);
                } else if (Files.isDirectory(sourceRealPath)) {
                    zipFile.addFolder(sourceRealPath.toFile(), zipParameters);
                }
            }
        }

        Map<String, Object> result = CompressionUtil.buildCompressResult(finalSourcePaths, targetPath, Files.size(targetRealPath));
        result.put("encrypted", true);
        return result;
    }

    @Override
    public Map<String, Object> extractZipEncrypted(String sourcePath, String targetPath, Map<String, Object> options) throws IOException {
        log.info("[Compress] extractZipEncrypted {} -> {}", sourcePath, targetPath);
        Path sourceRealPath = CompressionUtil.validateSourceFile(sourcePath, diskConfig);
        Path targetRealPath = PathUtil.convertVirtualPath(targetPath, diskConfig);

        String password = options != null ? (String) options.get("password") : null;
        if (password == null || password.isEmpty()) {
            throw new IOException("解压加密 ZIP 需要提供密码");
        }

        Files.createDirectories(targetRealPath);

        List<String> extractedFiles = new ArrayList<>();

        try (ZipFile zipFile = new ZipFile(sourceRealPath.toFile(), password.toCharArray())) {
            zipFile.extractAll(targetRealPath.toString());

            for (var header : zipFile.getFileHeaders()) {
                if (!header.isDirectory()) {
                    extractedFiles.add(header.getFileName());
                }
            }
        }

        Map<String, Object> result = CompressionUtil.buildExtractResult(sourcePath, targetPath, extractedFiles.size(), extractedFiles);
        result.put("encrypted", true);
        return result;
    }
}
