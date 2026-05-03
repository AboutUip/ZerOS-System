package cn.zeros.controller;

import cn.zeros.constant.FileConstants;
import cn.zeros.constant.HttpConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;

/**
 * 音频代理控制器。
 *
 * <p>代理前端音频资源请求，支持 Range 请求透传和上游 206 状态保留，避免浏览器直接访问音频源时
 * 遇到跨域限制。对 NetEase 音源保留 PHP 端使用的请求头兼容行为。
 *
 * @author zeros
 */
@RestController
@RequestMapping("/audio-proxy")
@Slf4j
public class AudioProxyController {

    private static final Set<String> FORWARDED_HEADERS = Set.of(
            "content-type",
            "content-length",
            "content-range",
            "accept-ranges",
            "cache-control",
            "expires",
            "last-modified",
            "etag"
    );

    private static final String NETEASE_USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/120.0.0.0 Safari/537.36";

    private final WebClient webClient;

    public AudioProxyController() {
        this.webClient = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(HttpClient.create().followRedirect(true)))
                .defaultHeader(HttpHeaders.USER_AGENT, "ZerOS-AudioProxy/1.0")
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(HttpConstants.DEFAULT_MAX_IN_MEMORY_SIZE))
                .build();
    }

    @GetMapping
    public Mono<ResponseEntity<byte[]>> proxyAudio(
            @RequestParam String url,
            @RequestHeader(value = "Range", required = false) String rangeHeader) {
        log.info("[AudioProxy] url={}", url);

        URI uri;
        try {
            uri = URI.create(url);
        } catch (Exception e) {
            return Mono.just(jsonError(HttpStatus.BAD_REQUEST, "{\"error\":\"Invalid URL format\"}"));
        }

        String scheme = uri.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            return Mono.just(jsonError(HttpStatus.BAD_REQUEST, "{\"error\":\"Only HTTP and HTTPS URLs are allowed\"}"));
        }

        String contentType = defaultAudioContentType(uri);
        boolean isNetEase = url.contains("music.126.net");
        WebClient.RequestHeadersSpec<?> request = webClient.get()
                .uri(uri)
                .header(HttpHeaders.ACCEPT, "audio/*")
                .header(HttpHeaders.ACCEPT_ENCODING, "identity")
                .header(HttpHeaders.USER_AGENT, isNetEase ? NETEASE_USER_AGENT : "ZerOS-AudioProxy/1.0")
                .header(HttpHeaders.ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9,en;q=0.8")
                .header(HttpHeaders.CONNECTION, "keep-alive")
                .header("Upgrade-Insecure-Requests", "1");

        if (isNetEase) {
            request.header(HttpHeaders.REFERER, "https://music.163.com/")
                    .header(HttpHeaders.ORIGIN, "https://music.163.com");
        }
        if (rangeHeader != null && !rangeHeader.isBlank()) {
            request.header(HttpHeaders.RANGE, rangeHeader);
        }

        return request.exchangeToMono(response -> {
                    HttpStatusCode upstreamStatus = response.statusCode();
                    if (!upstreamStatus.is2xxSuccessful()) {
                        return response.bodyToMono(String.class)
                                .defaultIfEmpty("")
                                .map(body -> jsonError(upstreamStatus,
                                        "{\"error\":\"Failed to fetch audio\",\"http_code\":" + upstreamStatus.value() + "}"));
                    }

                    return response.bodyToMono(byte[].class)
                            .defaultIfEmpty(new byte[0])
                            .map(body -> {
                                HttpHeaders headers = copyMediaHeaders(response.headers().asHttpHeaders());
                                if (!headers.containsKey(HttpHeaders.CONTENT_TYPE)) {
                                    headers.setContentType(MediaType.parseMediaType(contentType));
                                }
                                if (!headers.containsKey(HttpHeaders.CACHE_CONTROL)) {
                                    headers.setCacheControl(CacheControl.maxAge(Duration.ofHours(HttpConstants.CACHE_MAX_AGE_HOURS)));
                                }
                                return ResponseEntity.status(upstreamStatus)
                                        .headers(headers)
                                        .body(body);
                            });
                })
                .timeout(Duration.ofSeconds(HttpConstants.WEB_CLIENT_TIMEOUT_SECONDS))
                .onErrorResume(e -> Mono.just(jsonError(HttpStatus.BAD_GATEWAY,
                        "{\"error\":\"Failed to fetch audio\",\"message\":\"" + escapeJson(e.getMessage()) + "\"}")));
    }

    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> handleOptions() {
        return ResponseEntity.ok().build();
    }

    private HttpHeaders copyMediaHeaders(HttpHeaders upstreamHeaders) {
        HttpHeaders headers = new HttpHeaders();
        upstreamHeaders.forEach((key, values) -> {
            if (FORWARDED_HEADERS.contains(key.toLowerCase())) {
                headers.put(key, values);
            }
        });
        return headers;
    }

    private String defaultAudioContentType(URI uri) {
        String path = uri.getPath();
        String extension = "";
        if (path != null && path.contains(".")) {
            extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        }
        return FileConstants.AUDIO_CONTENT_TYPES.getOrDefault(extension, FileConstants.DEFAULT_AUDIO_CONTENT_TYPE);
    }

    private ResponseEntity<byte[]> jsonError(HttpStatusCode status, String json) {
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .body(json.getBytes(StandardCharsets.UTF_8));
    }

    private String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
