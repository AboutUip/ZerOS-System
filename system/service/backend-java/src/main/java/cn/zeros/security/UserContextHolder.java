package cn.zeros.security;

/**
 * ThreadLocal 持有者，在请求生命周期内存储当前用户上下文
 * 拦截器在 preHandle 中设置，必须在 afterCompletion 中清除，避免内存泄漏
 *
 * @author zeros
 */
public final class UserContextHolder {

    private static final ThreadLocal<UserContext> HOLDER = new ThreadLocal<>();

    private UserContextHolder() {
        throw new UnsupportedOperationException("工具类不允许实例化");
    }

    /**
     * 设置当前用户上下文
     */
    public static void set(UserContext context) {
        HOLDER.set(context);
    }

    /**
     * 获取当前用户上下文，可能为 null（未认证或白名单路径）
     */
    public static UserContext get() {
        return HOLDER.get();
    }

    /**
     * 获取当前用户 ID，未认证时返回 null
     */
    public static String getUserId() {
        UserContext ctx = HOLDER.get();
        return ctx != null ? ctx.getUserId() : null;
    }

    /**
     * 判断当前请求是否已认证
     */
    public static boolean isAuthenticated() {
        return HOLDER.get() != null;
    }

    /**
     * 清除上下文，必须在请求结束后调用（拦截器 afterCompletion）
     */
    public static void clear() {
        HOLDER.remove();
    }
}
