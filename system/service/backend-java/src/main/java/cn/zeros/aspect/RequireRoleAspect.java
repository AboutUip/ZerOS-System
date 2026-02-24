package cn.zeros.aspect;

import cn.zeros.annotation.RequireRole;
import cn.zeros.constant.ErrorCode;
import cn.zeros.exception.AuthenticationException;
import cn.zeros.security.UserContextHolder;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 权限切面：校验 @RequireRole 注解，未满足角色要求时抛出 FORBIDDEN
 *
 * @author zeros
 */
@Slf4j
@Aspect
@Component
@Order(1)
public class RequireRoleAspect {

    @Before("@annotation(requireRole)")
    public void checkRole(JoinPoint joinPoint, RequireRole requireRole) {
        if (requireRole == null || requireRole.value() == null || requireRole.value().length == 0) {
            return;
        }

        if (!UserContextHolder.isAuthenticated()) {
            throw new AuthenticationException(ErrorCode.UNAUTHORIZED.getCode(), "未认证，无法访问该资源");
        }

        if (!UserContextHolder.get().hasAnyRole(requireRole.value())) {
            throw new AuthenticationException(ErrorCode.FORBIDDEN.getCode(),
                    "权限不足，需要角色: " + String.join(", ", requireRole.value()));
        }
    }

    @Before("@within(requireRole)")
    public void checkRoleOnClass(JoinPoint joinPoint, RequireRole requireRole) {
        if (requireRole == null || requireRole.value() == null || requireRole.value().length == 0) {
            return;
        }
        checkRole(joinPoint, requireRole);
    }
}
