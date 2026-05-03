package cn.zeros.controller;

import cn.zeros.constant.HttpConstants;
import cn.zeros.constant.FileConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.time.Duration;

/**
 * 图片代理控制器
 *
 * @author zeros
 * @date 2026-01-16
 */
@RestController
@RequestMapping("/ImageProxy")
@Slf4j
public class ImageProxyController {

    private final WebClient webClient;

    public ImageProxyController() {
        this.webClient = WebClient.builder()
                .defaultHeader(HttpHeaders.USER_AGENT, "ZerOS-ImageProxy/1.0")
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(HttpConstants.DEFAULT_MAX_IN_MEMORY_SIZE))
                .build();
    }
    
    @GetMapping
    public Mono<ResponseEntity<byte[]>> proxyImage(@RequestParam String url) {
        log.info("[ImageProxy] url={}", url);
        try {
            URI uri = URI.create(url);
            String scheme = uri.getScheme();
            
            // 只允许 HTTPS
            if (!"https".equals(scheme)) {
                return Mono.just(ResponseEntity.badRequest()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"Only HTTPS URLs are allowed\"}".getBytes()));
            }
            
            // 确定 Content-Type
            String path = uri.getPath();
            String extension = "";
            if (path != null && path.contains(".")) {
                extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            }
            String contentType = FileConstants.IMAGE_CONTENT_TYPES.getOrDefault(extension, FileConstants.DEFAULT_IMAGE_CONTENT_TYPE);
            
            // 执行请求
            return webClient.get()
                    .uri(uri)
                    .exchangeToMono(response -> {
                        HttpStatus status = (HttpStatus) response.statusCode();
                        
                        if (status.is2xxSuccessful()) {
                            return response.bodyToMono(byte[].class)
                                    .map(body -> {
                                        // 验证是否为图片（通过魔数）
                                        String detectedContentType = detectImageType(body);
                                        if (detectedContentType == null) {
                                            detectedContentType = contentType;
                                        }
                                        
                                        HttpHeaders headers = new HttpHeaders();
                                        headers.setContentType(MediaType.parseMediaType(detectedContentType));
                                        headers.setCacheControl(CacheControl.maxAge(Duration.ofHours(HttpConstants.CACHE_MAX_AGE_HOURS)));
                                        
                                        return ResponseEntity.ok()
                                                .headers(headers)
                                                .body(body);
                                    });
                        } else {
                            return response.bodyToMono(String.class)
                                    .defaultIfEmpty("")
                                    .map(body -> ResponseEntity.status(status)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .body(("{\"error\":\"Failed to fetch image\",\"http_code\":" + status.value() + "}").getBytes()));
                        }
                    })
                    .timeout(Duration.ofSeconds(HttpConstants.WEB_CLIENT_TIMEOUT_SECONDS))
                    .onErrorResume(e -> Mono.just(ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(("{\"error\":\"Failed to fetch image\",\"message\":\"" + e.getMessage() + "\"}").getBytes())));
                    
        } catch (Exception e) {
            return Mono.just(ResponseEntity.badRequest()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(("{\"error\":\"Invalid URL format\"}").getBytes()));
        }
    }
    
    private String detectImageType(byte[] data) {
        if (data.length < 4) {
            return null;
        }
        
        // JPEG: FF D8 FF
        if (data.length >= 3 && 
            data[0] == FileConstants.ImageMagicNumbers.JPEG[0] && 
            data[1] == FileConstants.ImageMagicNumbers.JPEG[1] && 
            data[2] == FileConstants.ImageMagicNumbers.JPEG[2]) {
            return "image/jpeg";
        }
        
        // PNG: 89 50 4E 47
        if (data.length >= 4 && 
            data[0] == FileConstants.ImageMagicNumbers.PNG[0] && 
            data[1] == FileConstants.ImageMagicNumbers.PNG[1] && 
            data[2] == FileConstants.ImageMagicNumbers.PNG[2] && 
            data[3] == FileConstants.ImageMagicNumbers.PNG[3]) {
            return "image/png";
        }
        
        // GIF: 47 49 46 38
        if (data.length >= 4 && 
            data[0] == FileConstants.ImageMagicNumbers.GIF[0] && 
            data[1] == FileConstants.ImageMagicNumbers.GIF[1] && 
            data[2] == FileConstants.ImageMagicNumbers.GIF[2] && 
            data[3] == FileConstants.ImageMagicNumbers.GIF[3]) {
            return "image/gif";
        }
        
        // WebP: 需要检查更多字节
        if (data.length >= 12 && 
            data[0] == FileConstants.ImageMagicNumbers.WEBP_PREFIX[0] && 
            data[1] == FileConstants.ImageMagicNumbers.WEBP_PREFIX[1] && 
            data[2] == FileConstants.ImageMagicNumbers.WEBP_PREFIX[2] && 
            data[3] == FileConstants.ImageMagicNumbers.WEBP_PREFIX[3] &&
            data[8] == FileConstants.ImageMagicNumbers.WEBP_SUFFIX[0] && 
            data[9] == FileConstants.ImageMagicNumbers.WEBP_SUFFIX[1] && 
            data[10] == FileConstants.ImageMagicNumbers.WEBP_SUFFIX[2] && 
            data[11] == FileConstants.ImageMagicNumbers.WEBP_SUFFIX[3]) {
            return "image/webp";
        }
        
        return null;
    }
    
    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> handleOptions() {
        return ResponseEntity.ok().build();
    }
}

