package cn.zeros.interceptor;

import cn.zeros.config.JwtProperties;
import cn.zeros.constant.ErrorCode;
import cn.zeros.constant.PermissionConstants;
import cn.zeros.exception.AuthenticationException;
import cn.zeros.security.UserContext;
import cn.zeros.security.UserContextHolder;
import cn.zeros.service.BootSecurityTokenService;
import cn.zeros.util.JwtUtil;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.List;
import java.util.Map;

/**
 * JWT 认证拦截器
 * 支持 SystemToken（直接放行）和 UserToken（需 upid + 权限校验）
 * 令牌提取支持：Authorization: Bearer、X-Auth-Token、X-JWT
 *
 * @author zeros
 */
@Slf4j
@RequiredArgsConstructor
public class JwtAuthInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;
    private final JwtProperties jwtProperties;
    private final BootSecurityTokenService bootSecurityTokenService;

    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();
    private static final String BEARER_PREFIX = "Bearer ";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        UserContextHolder.clear();

        String path = request.getRequestURI();
        String servletPath = request.getServletPath();
        String pathToMatch = StringUtils.hasText(servletPath) ? servletPath : path;

        if (isExcluded(pathToMatch)) {
            return true;
        }

        // 所有 GET 请求直接放行，不检查 JWT
        if ("GET".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String token = extractTokenFromRequest(request);

        if (isOptionalAuth(pathToMatch)) {
            if (StringUtils.hasText(token)) {
                try {
                    UserContext context = jwtUtil.buildUserContext(jwtUtil.parseAndValidate(token));
                    UserContextHolder.set(context);
                } catch (JwtException e) {
                    log.debug("可选认证路径 token 无效，继续匿名访问: {}", e.getMessage());
                }
            }
            return true;
        }

        if (!StringUtils.hasText(token)) {
            throw new AuthenticationException(ErrorCode.UNAUTHORIZED.getCode(),
                    "缺少认证令牌，请携带 Authorization: Bearer <token>");
        }

        try {
            Claims claims = jwtUtil.parseAndValidate(token);
            UserContext context = jwtUtil.buildUserContext(claims);
            String tokenType = context.getTokenType();

            if ("SystemToken".equals(tokenType)) {
                UserContextHolder.set(context);
                return true;
            }

            if ("UserToken".equals(tokenType)) {
                String upid = request.getParameter("upid");
                if (!StringUtils.hasText(upid)) {
                    throw new AuthenticationException(ErrorCode.UPID_REQUIRED.getCode(),
                            "UserToken 需在 URL 中传入 upid 参数");
                }

                String serviceName = PermissionConstants.extractServiceName(pathToMatch);
                if (serviceName != null) {
                    String action = request.getParameter("action");
                    validateUpidPermission(serviceName, upid, action, context);
                }

                UserContextHolder.set(context);
                return true;
            }

            UserContextHolder.set(context);
            return true;

        } catch (AuthenticationException e) {
            throw e;
        } catch (ExpiredJwtException e) {
            throw new AuthenticationException(ErrorCode.TOKEN_EXPIRED.getCode(), "令牌已过期，请重新登录");
        } catch (JwtException e) {
            throw new AuthenticationException(ErrorCode.TOKEN_INVALID.getCode(), "令牌无效: " + e.getMessage());
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        UserContextHolder.clear();
    }

    /**
     * 验证 upid 权限：检查程序权限声明 + 用户授权能力
     */
    private void validateUpidPermission(String serviceName, String upid, String action, UserContext context) {
        if (action == null || action.isBlank()) {
            throw new AuthenticationException(ErrorCode.PARAM_MISSING.getCode(), "请求缺少 action 参数");
        }

        String requiredPermission = PermissionConstants.getRequiredPermission(serviceName, action);
        if (requiredPermission == null) {
            return;
        }

        Map<String, List<String>> programMap = bootSecurityTokenService.loadProgramPermissionsMap();
        List<String> declaredPerms = programMap.get(upid);

        if (declaredPerms == null) {
            throw new AuthenticationException(ErrorCode.UPID_NOT_REGISTERED.getCode(),
                    "upid 未在程序权限映射中注册或已失效");
        }

        if (!declaredPerms.contains(requiredPermission)) {
            throw new AuthenticationException(ErrorCode.PERMISSION_DENIED.getCode(),
                    "程序未声明该操作所需的权限: " + requiredPermission);
        }

        if (!PermissionConstants.canUserGrantPermission(
                requiredPermission, context.getUserLevel(), context.getPermissions())) {
            throw new AuthenticationException(ErrorCode.USER_CANNOT_GRANT.getCode(),
                    "当前用户无法授权该权限: " + requiredPermission);
        }
    }

    /**
     * 从请求中提取 JWT 令牌
     * 优先级：Authorization: Bearer > X-Auth-Token > X-JWT
     */
    private String extractTokenFromRequest(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (StringUtils.hasText(authHeader) && authHeader.startsWith(BEARER_PREFIX)) {
            return authHeader.substring(BEARER_PREFIX.length()).trim();
        }

        String xAuthToken = request.getHeader("X-Auth-Token");
        if (StringUtils.hasText(xAuthToken)) {
            return xAuthToken.trim();
        }

        String xJwt = request.getHeader("X-JWT");
        if (StringUtils.hasText(xJwt)) {
            return xJwt.trim();
        }

        return null;
    }

    private boolean isExcluded(String path) {
        for (String pattern : jwtProperties.getExcludePaths()) {
            if (PATH_MATCHER.match(pattern, path)) {
                return true;
            }
        }
        return false;
    }

    private boolean isOptionalAuth(String path) {
        if (jwtProperties.getOptionalAuthPaths() == null || jwtProperties.getOptionalAuthPaths().isEmpty()) {
            return false;
        }
        for (String pattern : jwtProperties.getOptionalAuthPaths()) {
            if (PATH_MATCHER.match(pattern, path)) {
                return true;
            }
        }
        return false;
    }
}
