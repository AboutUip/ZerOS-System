package cn.zeros.util;

import cn.zeros.constant.ErrorCode;
import cn.zeros.exception.AuthenticationException;
import cn.zeros.security.UserContext;
import cn.zeros.security.UserContextHolder;

/**
 * SystemToken 调用保护工具。
 *
 * <p>Node 执行、依赖安装等系统级接口只能由 SystemToken 调用，避免 UserToken 或匿名请求触发
 * 本机命令执行。
 *
 * @author zeros
 */
public final class SystemTokenGuard {

    private SystemTokenGuard() {
        throw new UnsupportedOperationException("工具类不允许实例化");
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
