package cn.zeros.controller;

import cn.zeros.constant.FileConstants;
import cn.zeros.constant.HttpConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.net.URI;
import java.time.Duration;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/video-proxy")
public class VideoProxyController {

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

    private final WebClient webClient;

    public VideoProxyController() {
        this.webClient = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(HttpClient.create().followRedirect(true)))
                .defaultHeader(HttpHeaders.USER_AGENT, "ZerOS-VideoProxy/1.0")
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(HttpConstants.DEFAULT_MAX_IN_MEMORY_SIZE))
                .build();
    }

    @GetMapping
    public Mono<ResponseEntity<byte[]>> proxyVideo(
            @RequestParam String url,
            @RequestHeader(value = "Range", required = false) String rangeHeader) {
        log.info("[VideoProxy] url={}", url);
        URI uri;
        try {
            uri = URI.create(url);
        } catch (Exception e) {
            return Mono.just(jsonError(HttpStatus.BAD_REQUEST, "{\"error\":\"Invalid URL format\"}"));
        }

        String scheme = uri.getScheme();
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return Mono.just(jsonError(HttpStatus.BAD_REQUEST, "{\"error\":\"Only HTTP and HTTPS URLs are allowed\"}"));
        }

        String contentType = defaultVideoContentType(uri);
        WebClient.RequestHeadersSpec<?> request = webClient.get()
                .uri(uri)
                .header(HttpHeaders.ACCEPT, "video/*")
                .header(HttpHeaders.ACCEPT_ENCODING, "identity");
        if (rangeHeader != null && !rangeHeader.isBlank()) {
            request.header(HttpHeaders.RANGE, rangeHeader);
        }

        return request.exchangeToMono(response -> {
                    HttpStatusCode upstreamStatus = response.statusCode();
                    if (!upstreamStatus.is2xxSuccessful()) {
                        return response.bodyToMono(String.class)
                                .defaultIfEmpty("")
                                .map(body -> jsonError(upstreamStatus,
                                        "{\"error\":\"Upstream error\",\"http_code\":" + upstreamStatus.value() + "}"));
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
                .timeout(Duration.ofSeconds(60))
                .onErrorResume(e -> Mono.just(jsonError(HttpStatus.BAD_GATEWAY,
                        "{\"error\":\"Proxy fetch failed\",\"message\":\"" + escapeJson(e.getMessage()) + "\"}")));
    }

    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> options() {
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

    private String defaultVideoContentType(URI uri) {
        String path = uri.getPath();
        String extension = "";
        if (path != null && path.contains(".")) {
            extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        }
        return FileConstants.VIDEO_CONTENT_TYPES.getOrDefault(extension, FileConstants.DEFAULT_VIDEO_CONTENT_TYPE);
    }

    private ResponseEntity<byte[]> jsonError(HttpStatusCode status, String json) {
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .body(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
