package cn.zeros.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;

/**
 * 阿里云 DashScope（通义千问）AI 代理服务控制器（对应 PHP 端的 dashscope-ai-proxy.php）
 *
 * <p>功能说明：
 * 代理前端的 AI 请求至阿里云 DashScope API（兼容 OpenAI 格式），绕过浏览器 CORS 限制。
 * API 密钥通过请求体的 _auth 字段传入，不暴露在 URL 中。
 *
 * <p>工作流程：
 * 1. 前端 POST 请求体（OpenAI 兼容格式 + _auth 字段）
 * 2. 从 _auth 中提取 apiKey
 * 3. 将 _auth 从请求体中移除
 * 4. 转发至 DashScope API，设置 Authorization: Bearer 头
 * 5. 透传 DashScope API 的响应（含 HTTP 状态码）
 *
 * <p>此接口无需 JWT 认证（代理服务）
 *
 * <p>调用方：D/server/server-aiassistant.js
 * <p>配置来源：ZEROS_SERVER_AIA_CONFIG（LStorage）
 *
 * @author zeros
 */
@Slf4j
@RestController
@RequestMapping("/dashscope-ai-proxy")
public class DashScopeAiProxyController {

    /** 阿里云 DashScope API 地址（OpenAI 兼容格式端点） */
    private static final String DASHSCOPE_API_URL =
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

    private final WebClient webClient;

    public DashScopeAiProxyController() {
        this.webClient = WebClient.builder()
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(10 * 1024 * 1024))
                .build();
    }

    /**
     * 代理 POST 请求至阿里云 DashScope API
     *
     * @param body 请求体，包含原始 AI 请求数据和 _auth 鉴权信息
     *             _auth 格式: { "apiKey": "sk-xxx" }
     */
    @PostMapping
    @SuppressWarnings("unchecked")
    public Mono<ResponseEntity<byte[]>> proxy(@RequestBody Map<String, Object> body) {
        log.info("[DashScopeAiProxy] proxy request");
        // 从请求体中提取鉴权信息
        Map<String, Object> auth = null;
        if (body.containsKey("_auth") && body.get("_auth") instanceof Map) {
            auth = (Map<String, Object>) body.get("_auth");
        }

        String apiKey = "";
        if (auth != null) {
            apiKey = auth.get("apiKey") != null ? auth.get("apiKey").toString() : "";
        }

        // 移除 _auth 字段，不转发给 DashScope API
        body.remove("_auth");

        // 转发请求至 DashScope API，设置鉴权头
        return webClient.post()
                .uri(DASHSCOPE_API_URL)
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + apiKey)
                .bodyValue(body)
                .exchangeToMono(response -> {
                    HttpStatusCode statusCode = response.statusCode();
                    return response.bodyToMono(byte[].class)
                            .defaultIfEmpty(new byte[0])
                            .map(responseBody -> ResponseEntity.status(statusCode)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .body(responseBody));
                })
                .timeout(Duration.ofSeconds(60))
                .onErrorResume(e -> {
                    log.warn("DashScope AI 代理请求失败: {}", e.getMessage());
                    String error = "{\"error\":\"Proxy request failed\",\"message\":\"" +
                            e.getMessage().replace("\"", "\\\"") + "\"}";
                    return Mono.just(ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(error.getBytes()));
                });
    }
}
