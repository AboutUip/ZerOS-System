package cn.zeros.util;

import cn.zeros.config.JwtProperties;
import cn.zeros.security.UserContext;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * JWT 工具类：生成、解析、验证令牌
 * 支持两种模式：
 * 1. 标准模式 (generateToken) - 用户名密码登录，有过期时间
 * 2. RandomSecurity 模式 (generateSecurityToken) - 基于 randomValue 的 SystemToken/UserToken，永不过期
 *
 * @author zeros
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtUtil {

    private final JwtProperties jwtProperties;

    private SecretKey getSigningKey() {
        byte[] keyBytes = jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    /**
     * 生成标准 JWT 令牌（有过期时间）
     */
    public String generateToken(String userId, String username, List<String> roles, String tokenId) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(userId)
                .claim("username", username)
                .claim("roles", roles != null ? roles : Collections.emptyList())
                .claim("permissions", Collections.emptyList())
                .issuer(jwtProperties.getIssuer())
                .issuedAt(new Date(now))
                .expiration(new Date(now + jwtProperties.getExpirationSeconds() * 1000))
                .id(tokenId != null ? tokenId : UUID.randomUUID().toString())
                .signWith(getSigningKey())
                .compact();
    }

    public String generateToken(String userId, String username, List<String> roles) {
        return generateToken(userId, username, roles, null);
    }

    /**
     * 生成 RandomSecurity JWT 令牌（永不过期，用于 SystemToken/UserToken）
     *
     * @param randomValue 32 位十六进制特征符
     * @param type        SystemToken / UserToken
     * @param userLevel   用户级别（UserToken 时传入）
     * @param permissions 可授权权限列表（UserToken 时传入）
     */
    public String generateSecurityToken(String randomValue, String type, String userLevel, List<String> permissions) {
        long now = System.currentTimeMillis();
        JwtBuilder builder = Jwts.builder()
                .claim("randomValue", randomValue)
                .claim("type", type)
                .claim("generated_at", now / 1000)
                .issuer(jwtProperties.getIssuer())
                .issuedAt(new Date(now))
                .id(UUID.randomUUID().toString())
                .signWith(getSigningKey());

        if ("UserToken".equals(type)) {
            if (userLevel != null) {
                builder.claim("userLevel", userLevel);
            }
            if (permissions != null) {
                builder.claim("permissions", permissions);
            }
        }

        return builder.compact();
    }

    /**
     * 解析并验证 JWT（支持永不过期的令牌）
     */
    public Claims parseAndValidate(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(getSigningKey())
                    .requireIssuer(jwtProperties.getIssuer())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (ExpiredJwtException e) {
            log.debug("JWT 已过期: {}", e.getMessage());
            throw e;
        } catch (JwtException e) {
            log.debug("JWT 验证失败: {}", e.getMessage());
            throw e;
        }
    }

    /**
     * 解析 JWT（容忍过期，用于 SecurityToken 无过期时间的场景）
     */
    public Claims parseAllowExpired(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(getSigningKey())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (ExpiredJwtException e) {
            return e.getClaims();
        } catch (JwtException e) {
            log.debug("JWT 验证失败: {}", e.getMessage());
            throw e;
        }
    }

    /**
     * 从 Claims 构建 UserContext
     */
    public UserContext buildUserContext(Claims claims) {
        String userId = claims.getSubject();
        String username = claims.get("username", String.class);
        String tokenType = claims.get("type", String.class);
        String userLevel = claims.get("userLevel", String.class);
        List<String> roles = toStringList(claims.get("roles"));
        List<String> permissions = toStringList(claims.get("permissions"));
        String jti = claims.getId();

        return UserContext.builder()
                .userId(userId)
                .username(username)
                .tokenType(tokenType)
                .userLevel(userLevel)
                .roles(roles)
                .permissions(permissions)
                .tokenId(jti)
                .build();
    }

    /**
     * 提取令牌类型
     */
    public String extractTokenType(Claims claims) {
        return claims.get("type", String.class);
    }

    private static List<String> toStringList(Object obj) {
        if (obj == null) {
            return Collections.emptyList();
        }
        if (obj instanceof List<?> rawList) {
            return rawList.stream()
                    .map(o -> o != null ? o.toString() : null)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }
}
