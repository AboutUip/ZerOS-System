package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.BootCommitService;
import cn.zeros.service.BootSecurityTokenService;
import cn.zeros.util.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/randomSecurity")
@RequiredArgsConstructor
public class RandomSecurityController {

    private final JwtUtil jwtUtil;
    private final BootSecurityTokenService bootSecurityTokenService;
    private final BootCommitService bootCommitService;

    @RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleRequest(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String randomValue,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String userLevel,
            @RequestParam(required = false) List<String> permissions,
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {

        if (body != null) {
            if (action == null) action = asString(body.get("action"));
            if (randomValue == null) randomValue = asString(body.get("randomValue"));
            if (type == null) type = asString(body.get("type"));
            if (userLevel == null) userLevel = asString(body.get("userLevel"));
            if (permissions == null && body.get("permissions") instanceof List<?> rawPermissions) {
                permissions = rawPermissions.stream().map(Object::toString).toList();
            }
        }

        log.info("[RandomSecurity] action={} type={}", action, type);
        if ("clear".equals(action)) {
            return handleClear();
        }
        if ("commit_for_system".equals(action)) {
            return handleCommitForSystem(randomValue, request);
        }
        return handleGenerate(randomValue, type, userLevel, permissions, request);
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> handleClear() {
        boolean cleared = bootSecurityTokenService.clearTokens();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("cleared", cleared);
        data.put("error", cleared ? null : "Failed to clear JWT records");
        return ResponseEntity.ok(ApiResponse.success("JWT cleared", data));
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> handleCommitForSystem(
            String randomValue, HttpServletRequest request) {
        if (!isValidRandomValue(randomValue)) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("commit_for_system requires a valid randomValue"));
        }

        BootCommitService.CommitResult result = bootCommitService.commit(randomValue, clientIp(request));
        if (!result.success()) {
            return ResponseEntity.status(403).body(ApiResponse.error(result.message()));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("committed", true);
        return ResponseEntity.ok(ApiResponse.success("Boot randomValue committed", data));
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> handleGenerate(
            String randomValue,
            String type,
            String userLevel,
            List<String> permissions,
            HttpServletRequest request) {

        if (randomValue == null || randomValue.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Missing randomValue"));
        }
        if (!isValidRandomValue(randomValue)) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Invalid randomValue format"));
        }

        String resolvedType = type != null && !type.isBlank() ? type : "Unknown";
        if ("SystemToken".equals(resolvedType)) {
            BootCommitService.ConsumeResult consumeResult = bootCommitService.consume(randomValue, clientIp(request));
            if (!consumeResult.success()) {
                return ResponseEntity.status(403).body(ApiResponse.error(consumeResult.message()));
            }
        }

        List<Map<String, Object>> existingTokens = bootSecurityTokenService.getTokens();
        if ("SystemToken".equals(resolvedType) && !existingTokens.isEmpty()) {
            bootSecurityTokenService.clearTokens();
            existingTokens = new ArrayList<>();
        }
        if ("UserToken".equals(resolvedType)) {
            existingTokens = new ArrayList<>(existingTokens);
            existingTokens.removeIf(token -> "UserToken".equals(token.get("type")));
        }
        if (existingTokens.size() >= BootSecurityTokenService.MAX_TOKEN_COUNT) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("current_count", existingTokens.size());
            data.put("max_count", BootSecurityTokenService.MAX_TOKEN_COUNT);
            return ResponseEntity.status(403).body(ApiResponse.error("JWT limit reached"));
        }

        String tokenType = "UserToken".equals(resolvedType) ? "UserToken" : resolvedType;
        String token = jwtUtil.generateSecurityToken(randomValue, tokenType, userLevel, permissions);

        long now = System.currentTimeMillis() / 1000;
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("token", token);
        record.put("randomValue", randomValue);
        record.put("type", tokenType);
        record.put("userLevel", "UserToken".equals(tokenType) ? userLevel : null);
        record.put("permissions", "UserToken".equals(tokenType) ? permissions : null);
        record.put("generated_at", now);
        record.put("generated_at_str", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        record.put("expiration", 0);
        record.put("expires_at", null);
        record.put("expires_at_str", null);

        boolean saved = bootSecurityTokenService.addToken(record);
        List<Map<String, Object>> updatedTokens = bootSecurityTokenService.getTokens();

        Map<String, Object> responseData = new LinkedHashMap<>();
        responseData.put("token", token);
        responseData.put("randomValue", randomValue);
        responseData.put("expiration", 0);
        responseData.put("expires_at", null);
        responseData.put("recorded", saved);
        responseData.put("record_error", saved ? null : "Failed to write token file");
        responseData.put("current_count", updatedTokens.size());
        responseData.put("max_count", BootSecurityTokenService.MAX_TOKEN_COUNT);

        return ResponseEntity.ok(ApiResponse.success("JWT Token generated", responseData));
    }

    private boolean isValidRandomValue(String randomValue) {
        return randomValue != null && randomValue.matches("^[0-9a-fA-F]{32}$");
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private String asString(Object value) {
        return value != null ? value.toString() : null;
    }
}
