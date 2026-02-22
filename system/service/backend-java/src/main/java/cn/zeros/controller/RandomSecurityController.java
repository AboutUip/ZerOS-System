package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.BootSecurityTokenService;
import cn.zeros.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 随机安全校验服务控制器（对应 PHP 端的 randomSecurity.php）
 *
 * <p>功能说明：
 * 接收前端（内核 RandomSecurity 模块）生成的 128 位随机字符串（randomValue），
 * 据此生成 JWT Token 并存储到 BootSecurityToken.json 文件中。
 *
 * <p>令牌类型：
 * <ul>
 *   <li>SystemToken — 系统启动时签发，会清空已有的全部 JWT</li>
 *   <li>UserToken  — 用户登录时签发，会覆盖已有的 UserToken（单用户会话）</li>
 * </ul>
 *
 * <p>令牌上限：最多同时存在 2 个 JWT（1 个 SystemToken + 1 个 UserToken）
 *
 * <p>特殊操作：action=clear 用于系统关机/重启时清空所有 JWT
 *
 * <p>此接口无需 JWT 认证（它本身就是令牌签发服务，被列入白名单）
 *
 * <p>调用方：kernel/security/RandomSecurity.js（启动时）、UserControl（登录时）
 *
 * @author zeros
 */
@Slf4j
@RestController
@RequestMapping("/randomSecurity")
@RequiredArgsConstructor
public class RandomSecurityController {

    private final JwtUtil jwtUtil;
    private final BootSecurityTokenService bootSecurityTokenService;

    /**
     * 统一入口：同时支持 GET 和 POST
     * 参数既可以放在 URL query 中，也可以放在 JSON 请求体中（POST 时自动合并）
     *
     * @param action      操作类型，传 "clear" 表示清空所有 JWT
     * @param randomValue 128 位随机字符串（32 个十六进制字符），由前端内核生成
     * @param type        令牌类型：SystemToken / UserToken（未传则为 Unknown）
     * @param userLevel   用户级别：USER / ADMIN / DEFAULT_ADMIN（仅 UserToken 需要）
     * @param permissions 当前用户可授权的权限列表（仅 UserToken 需要）
     * @param body        POST 请求体（JSON 格式，用于补充上述参数）
     */
    @RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleRequest(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String randomValue,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String userLevel,
            @RequestParam(required = false) List<String> permissions,
            @RequestBody(required = false) Map<String, Object> body) {

        // POST 请求体中的参数作为补充（URL 参数优先）
        if (body != null) {
            if (action == null) action = (String) body.get("action");
            if (randomValue == null) randomValue = (String) body.get("randomValue");
            if (type == null) type = (String) body.get("type");
            if (userLevel == null) userLevel = (String) body.get("userLevel");
            if (permissions == null && body.get("permissions") instanceof List) {
                @SuppressWarnings("unchecked")
                List<String> p = (List<String>) body.get("permissions");
                permissions = p;
            }
        }

        // action=clear：系统关机/重启时调用，清空所有 JWT
        if ("clear".equals(action)) {
            return handleClear();
        }

        // 默认操作：生成 JWT
        return handleGenerate(randomValue, type, userLevel, permissions);
    }

    /**
     * 清空所有 JWT（保留 programPermissionsMap 不受影响）
     */
    private ResponseEntity<ApiResponse<Map<String, Object>>> handleClear() {
        boolean cleared = bootSecurityTokenService.clearTokens();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("cleared", cleared);
        data.put("error", cleared ? null : "清空失败");
        return ResponseEntity.ok(ApiResponse.success("JWT 已清空", data));
    }

    /**
     * 生成 JWT Token 的核心逻辑
     *
     * 流程：
     * 1. 校验 randomValue 格式（必须是 32 位十六进制）
     * 2. 如果是 SystemToken → 清空已有所有 JWT
     * 3. 如果是 UserToken → 移除已有的 UserToken（保留 SystemToken）
     * 4. 检查 JWT 数量上限（最多 2 个）
     * 5. 调用 JwtUtil 生成永不过期的安全令牌
     * 6. 将令牌记录写入 BootSecurityToken.json
     * 7. 返回令牌和状态信息
     */
    private ResponseEntity<ApiResponse<Map<String, Object>>> handleGenerate(
            String randomValue, String type, String userLevel, List<String> permissions) {

        // 参数校验：randomValue 必填
        if (randomValue == null || randomValue.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("缺少 randomValue 参数或格式错误"));
        }

        // 格式校验：必须是 32 个十六进制字符（128 位）
        if (!randomValue.matches("^[0-9a-fA-F]{32}$")) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("randomValue 格式错误，应为32个十六进制字符（128位）"));
        }

        String resolvedType = (type != null && !type.isBlank()) ? type : "Unknown";

        List<Map<String, Object>> existingTokens = bootSecurityTokenService.getTokens();

        // SystemToken 签发时清空已有的全部 JWT（系统启动时的行为）
        if ("SystemToken".equals(resolvedType) && !existingTokens.isEmpty()) {
            bootSecurityTokenService.clearTokens();
            existingTokens = new ArrayList<>();
        }

        // UserToken 签发时覆盖已有的 UserToken（保证单用户会话）
        if ("UserToken".equals(resolvedType)) {
            existingTokens = new ArrayList<>(existingTokens);
            existingTokens.removeIf(t -> "UserToken".equals(t.get("type")));
        }

        // JWT 数量上限检查
        if (existingTokens.size() >= BootSecurityTokenService.MAX_TOKEN_COUNT) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("current_count", existingTokens.size());
            data.put("max_count", BootSecurityTokenService.MAX_TOKEN_COUNT);
            return ResponseEntity.status(403)
                    .body(ApiResponse.error("JWT 数量已达上限，禁止生成"));
        }

        // 生成永不过期的安全令牌（不设 expiration，与 PHP 行为一致）
        String token = jwtUtil.generateSecurityToken(
                randomValue,
                "UserToken".equals(resolvedType) ? "UserToken" : resolvedType,
                userLevel,
                permissions
        );

        // 构建令牌记录，写入 BootSecurityToken.json
        long now = System.currentTimeMillis() / 1000;
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("token", token);
        record.put("randomValue", randomValue);
        record.put("type", "UserToken".equals(resolvedType) ? "UserToken" : resolvedType);
        record.put("userLevel", "UserToken".equals(resolvedType) ? userLevel : null);
        record.put("permissions", "UserToken".equals(resolvedType) ? permissions : null);
        record.put("generated_at", now);
        record.put("generated_at_str", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        record.put("expiration", 0);       // 0 = 永不过期
        record.put("expires_at", null);
        record.put("expires_at_str", null);

        boolean saved = bootSecurityTokenService.addToken(record);

        List<Map<String, Object>> updatedTokens = bootSecurityTokenService.getTokens();

        // 返回令牌信息和存储状态
        Map<String, Object> responseData = new LinkedHashMap<>();
        responseData.put("token", token);
        responseData.put("randomValue", randomValue);
        responseData.put("expiration", 0);
        responseData.put("expires_at", null);
        responseData.put("recorded", saved);
        responseData.put("record_error", saved ? null : "写入文件失败");
        responseData.put("current_count", updatedTokens.size());
        responseData.put("max_count", BootSecurityTokenService.MAX_TOKEN_COUNT);

        return ResponseEntity.ok(ApiResponse.success("JWT Token 生成成功", responseData));
    }
}
