package cn.zeros.controller;

import cn.zeros.constant.CommonConstants;
import cn.zeros.constant.FileConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.time.Duration;

/**
 * 音频代理控制器
 * 
 * @author zeros
 * @date 2024
 */
@RestController
@RequestMapping("/audio-proxy")
@Slf4j
public class AudioProxyController {
    
    private final WebClient webClient;
    
    public AudioProxyController() {
        this.webClient = WebClient.builder()
                .defaultHeader(HttpHeaders.USER_AGENT, "ZerOS-AudioProxy/1.0")
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(CommonConstants.DEFAULT_MAX_IN_MEMORY_SIZE))
                .build();
    }
    
    @GetMapping
    public Mono<ResponseEntity<byte[]>> proxyAudio(
            @RequestParam String url,
            @RequestHeader(value = "Range", required = false) String rangeHeader) {
        
        try {
            URI uri = URI.create(url);
            String scheme = uri.getScheme();
            
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                return Mono.just(ResponseEntity.badRequest()
                        .body("Only HTTP and HTTPS URLs are allowed".getBytes()));
            }
            
            // 确定 Content-Type
            String path = uri.getPath();
            String extension = "";
            if (path != null && path.contains(".")) {
                extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            }
            String contentType = FileConstants.AUDIO_CONTENT_TYPES.getOrDefault(extension, FileConstants.DEFAULT_AUDIO_CONTENT_TYPE);
            
            // 构建请求
            WebClient.RequestHeadersSpec<?> requestSpec = webClient.get()
                    .uri(uri)
                    .header("Accept", "audio/*")
                    .header("Accept-Encoding", "identity");
            
            // 添加 Range 头（如果存在）
            if (rangeHeader != null) {
                requestSpec.header("Range", rangeHeader);
            }
            
            // 执行请求
            return requestSpec
                    .exchangeToMono(response -> {
                        HttpStatus status = (HttpStatus) response.statusCode();
                        
                        if (status.is2xxSuccessful()) {
                            return response.bodyToMono(byte[].class)
                                    .map(body -> {
                                        HttpHeaders headers = new HttpHeaders();
                                        
                                        // 复制响应头
                                        response.headers().asHttpHeaders().forEach((key, values) -> {
                                            String lowerKey = key.toLowerCase();
                                            if (lowerKey.equals("content-type") ||
                                                    lowerKey.equals("content-length") ||
                                                    lowerKey.equals("content-range") ||
                                                    lowerKey.equals("accept-ranges") ||
                                                    lowerKey.equals("cache-control") ||
                                                    lowerKey.equals("expires") ||
                                                    lowerKey.equals("last-modified") ||
                                                    lowerKey.equals("etag")) {
                                                headers.put(key, values);
                                            }
                                        });
                                        
                                        // 如果没有 Content-Type，设置默认值
                                        if (!headers.containsKey(HttpHeaders.CONTENT_TYPE)) {
                                            headers.setContentType(MediaType.parseMediaType(contentType));
                                        }
                                        
                                        // 设置缓存控制
                                        if (!headers.containsKey(HttpHeaders.CACHE_CONTROL)) {
                                            headers.setCacheControl(CacheControl.maxAge(Duration.ofHours(CommonConstants.CACHE_MAX_AGE_HOURS)));
                                        }
                                        
                                        return ResponseEntity.ok()
                                                .headers(headers)
                                                .body(body);
                                    });
                        } else {
                            return response.bodyToMono(String.class)
                                    .defaultIfEmpty("")
                                    .map(body -> ResponseEntity.status(status)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .body(("{\"error\":\"Failed to fetch audio\",\"http_code\":" + status.value() + "}").getBytes()));
                        }
                    })
                    .timeout(Duration.ofSeconds(CommonConstants.WEB_CLIENT_TIMEOUT_SECONDS))
                    .onErrorResume(e -> Mono.just(ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(("{\"error\":\"Failed to fetch audio\",\"message\":\"" + e.getMessage() + "\"}").getBytes())));
                    
        } catch (Exception e) {
            return Mono.just(ResponseEntity.badRequest()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(("{\"error\":\"Invalid URL format\"}").getBytes()));
        }
    }
    
    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> handleOptions() {
        return ResponseEntity.ok().build();
    }
}

