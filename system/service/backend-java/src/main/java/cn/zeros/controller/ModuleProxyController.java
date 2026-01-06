package cn.zeros.controller;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/module-proxy")
public class ModuleProxyController {
    
    // 定义自定义 MediaType 常量
    private static final MediaType APPLICATION_JAVASCRIPT = MediaType.parseMediaType("application/javascript");
    private static final MediaType TEXT_CSS = MediaType.parseMediaType("text/css");
    private static final MediaType TEXT_HTML = MediaType.parseMediaType("text/html");
    private static final MediaType TEXT_PLAIN = MediaType.parseMediaType("text/plain");
    
    private static final Map<String, MediaType> MIME_TYPES;
    
    static {
        Map<String, MediaType> map = new HashMap<>();
        map.put("js", APPLICATION_JAVASCRIPT);
        map.put("mjs", APPLICATION_JAVASCRIPT);
        map.put("cjs", APPLICATION_JAVASCRIPT);
        map.put("json", MediaType.APPLICATION_JSON);
        map.put("css", TEXT_CSS);
        map.put("html", TEXT_HTML);
        map.put("htm", TEXT_HTML);
        map.put("wasm", MediaType.parseMediaType("application/wasm"));
        map.put("txt", TEXT_PLAIN);
        map.put("svg", MediaType.parseMediaType("image/svg+xml"));
        map.put("png", MediaType.IMAGE_PNG);
        map.put("jpg", MediaType.IMAGE_JPEG);
        map.put("jpeg", MediaType.IMAGE_JPEG);
        map.put("gif", MediaType.IMAGE_GIF);
        map.put("webp", MediaType.parseMediaType("image/webp"));
        MIME_TYPES = Map.copyOf(map);
    }
    
    @GetMapping
    public ResponseEntity<?> proxyModule(@RequestParam String path) {
        try {
            // 移除开头的斜杠
            String filePath = path.startsWith("/") ? path.substring(1) : path;
            
            // 获取项目根目录（从当前工作目录开始）
            Path projectRoot = Paths.get("").toAbsolutePath().normalize();
            
            // 构建完整路径
            Path fullPath = projectRoot.resolve(filePath).normalize();
            
            // 安全检查：确保路径在项目目录内
            if (!fullPath.startsWith(projectRoot)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"Access denied - Path outside project root\"}");
            }
            
            // 检查文件是否存在
            if (!Files.exists(fullPath) || !Files.isRegularFile(fullPath)) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"File not found\"}");
            }
            
            // 确定 Content-Type
            String fileName = fullPath.getFileName().toString();
            String extension = "";
            if (fileName.contains(".")) {
                extension = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
            }
            
            MediaType mediaType = MIME_TYPES.getOrDefault(extension, MediaType.APPLICATION_OCTET_STREAM);
            
            HttpHeaders headers = new HttpHeaders();
            
            // 设置 Content-Type
            if ("wasm".equals(extension)) {
                headers.setContentType(MediaType.parseMediaType("application/wasm"));
            } else if ("js".equals(extension) || "mjs".equals(extension)) {
                headers.setContentType(APPLICATION_JAVASCRIPT);
                headers.set("X-Content-Type-Options", "nosniff");
            } else {
                headers.setContentType(mediaType);
                if (mediaType.getType().startsWith("text")) {
                    headers.setContentType(MediaType.parseMediaType(mediaType.toString() + "; charset=utf-8"));
                }
            }
            
            // 禁止缓存
            headers.setCacheControl(CacheControl.noCache().noStore().mustRevalidate());
            headers.setPragma("no-cache");
            headers.setExpires(0);
            
            // 读取文件内容
            byte[] fileContent;
            if ("wasm".equals(extension)) {
                fileContent = Files.readAllBytes(fullPath);
            } else {
                fileContent = Files.readAllBytes(fullPath);
            }
            
            return ResponseEntity.ok()
                    .headers(headers)
                    .body(fileContent);
                    
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"Failed to read file\",\"message\":\"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"Invalid path\",\"message\":\"" + e.getMessage() + "\"}");
        }
    }
    
    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> handleOptions() {
        return ResponseEntity.ok().build();
    }
}

