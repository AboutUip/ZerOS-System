package cn.zeros.util;

import cn.zeros.constant.ErrorCode;
import cn.zeros.exception.AuthenticationException;
import cn.zeros.security.UserContext;
import cn.zeros.security.UserContextHolder;

/**
 * Small guard for endpoints that must only be callable with a SystemToken.
 */
public final class SystemTokenGuard {

    private SystemTokenGuard() {
        throw new UnsupportedOperationException("Utility class");
    }

    public static void requireSystemToken() {
        UserContext context = UserContextHolder.get();
        if (context == null) {
            throw new AuthenticationException(ErrorCode.UNAUTHORIZED.getCode(), "SystemToken is required");
        }
        if (!context.isSystemToken()) {
            throw new AuthenticationException(ErrorCode.FORBIDDEN.getCode(), "Only SystemToken may call this endpoint");
        }
    }
}
