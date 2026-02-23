package cn.zeros.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * JWT 配置属性
 *
 * @author zeros
 */
@Data
@Component
@ConfigurationProperties(prefix = "jwt")
public class JwtProperties {

    private String secret = "zeros-default-secret-change-in-production-min-256-bits";

    private long expirationSeconds = 7200;

    private String issuer = "zeros-system";

    /**
     * 不需要 JWT 验证的路径（支持 Ant 风格通配符）
     * 包含：登录、代理服务、令牌签发服务等
     */
    private List<String> excludePaths = List.of(
            "/api/auth/**",
            "/DISK/**",
            "/randomSecurity",
            "/randomSecurity/**",
            "/module-proxy",
            "/module-proxy/**",
            "/ImageProxy",
            "/ImageProxy/**",
            "/audio-proxy",
            "/audio-proxy/**",
            "/spark-ai-proxy",
            "/spark-ai-proxy/**",
            "/dashscope-ai-proxy",
            "/dashscope-ai-proxy/**",
            "/BrowserProxy",
            "/BrowserProxy/**",
            "/test",
            "/test/**",
            "/error",
            "/actuator/**",
            "/swagger-ui/**",
            "/v3/api-docs/**"
    );

    /**
     * 仅验证但不强制的路径：有 token 则解析并放入 ThreadLocal，没有也不拦截
     */
    private List<String> optionalAuthPaths = List.of();
}
