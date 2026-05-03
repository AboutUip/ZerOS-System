package cn.zeros.controller;

import cn.zeros.config.DiskConfig;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * DISK 静态文件伺服控制器
 *
 * <p>在 PHP 环境中，Apache/Nginx 会直接伺服 DISK/ 目录下的所有静态文件。
 * Spring Boot 不具备此能力，因此需要一个 catch-all 控制器来提供同等功能。
 *
 * <p>请求路径示例：
 * GET /system/service/DISK/D/application/musicplayer/assets/index.html
 * → 读取 DISK 基础目录下的 D/application/musicplayer/assets/index.html
 *
 * <p>无需 JWT 认证（静态资源）
 *
 * @author zeros
 */
@Slf4j
@RestController
@RequestMapping("/DISK")
@RequiredArgsConstructor
public class DiskStaticFileController {

    private final DiskConfig diskConfig;

    private static final Map<String, MediaType> MEDIA_TYPES = Map.ofEntries(
            Map.entry("html", MediaType.TEXT_HTML),
            Map.entry("htm", MediaType.TEXT_HTML),
            Map.entry("css", MediaType.valueOf("text/css")),
            Map.entry("js", MediaType.valueOf("application/javascript")),
            Map.entry("mjs", MediaType.valueOf("application/javascript")),
            Map.entry("json", MediaType.APPLICATION_JSON),
            Map.entry("xml", MediaType.APPLICATION_XML),
            Map.entry("txt", MediaType.TEXT_PLAIN),
            Map.entry("png", MediaType.IMAGE_PNG),
            Map.entry("jpg", MediaType.IMAGE_JPEG),
            Map.entry("jpeg", MediaType.IMAGE_JPEG),
            Map.entry("gif", MediaType.IMAGE_GIF),
            Map.entry("svg", MediaType.valueOf("image/svg+xml")),
            Map.entry("webp", MediaType.valueOf("image/webp")),
            Map.entry("ico", MediaType.valueOf("image/x-icon")),
            Map.entry("woff", MediaType.valueOf("font/woff")),
            Map.entry("woff2", MediaType.valueOf("font/woff2")),
            Map.entry("ttf", MediaType.valueOf("font/ttf")),
            Map.entry("otf", MediaType.valueOf("font/otf")),
            Map.entry("eot", MediaType.valueOf("application/vnd.ms-fontobject")),
            Map.entry("mp3", MediaType.valueOf("audio/mpeg")),
            Map.entry("wav", MediaType.valueOf("audio/wav")),
            Map.entry("ogg", MediaType.valueOf("audio/ogg")),
            Map.entry("mp4", MediaType.valueOf("video/mp4")),
            Map.entry("webm", MediaType.valueOf("video/webm")),
            Map.entry("wasm", MediaType.valueOf("application/wasm")),
            Map.entry("pdf", MediaType.APPLICATION_PDF),
            Map.entry("zip", MediaType.valueOf("application/zip"))
    );

    /**
     * 伺服 DISK 目录下的任意静态文件
     * 使用 /** 通配匹配所有子路径
     */
    @GetMapping("/**")
    public ResponseEntity<Resource> serveFile(HttpServletRequest request) {
        // 提取 /DISK 之后的相对路径
        String fullPath = request.getServletPath();
        String relativePath = fullPath.replaceFirst("^/DISK/", "");
        log.info("[DISK] serveFile {}", relativePath);

        if (relativePath.isBlank() || relativePath.contains("..")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Path filePath = diskConfig.getDiskBasePath().resolve(relativePath).normalize();

        // 安全检查：确保路径在 DISK 基础目录内
        if (!filePath.startsWith(diskConfig.getDiskBasePath())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            return ResponseEntity.notFound().build();
        }

        String fileName = filePath.getFileName().toString();
        String ext = "";
        int dotIdx = fileName.lastIndexOf('.');
        if (dotIdx > 0) {
            ext = fileName.substring(dotIdx + 1).toLowerCase();
        }

        MediaType mediaType = MEDIA_TYPES.getOrDefault(ext, MediaType.APPLICATION_OCTET_STREAM);

        Resource resource = new FileSystemResource(filePath);

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                .body(resource);
    }
}
