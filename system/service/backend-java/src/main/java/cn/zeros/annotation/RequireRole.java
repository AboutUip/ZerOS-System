package cn.zeros.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 接口权限控制：要求用户具有指定角色之一才能访问
 * 需配合 JwtAuthInterceptor 使用，确保 UserContext 已放入 ThreadLocal
 *
 * 使用方式：
 * <pre>
 * &#64;RequireRole("admin")
 * &#64;GetMapping("/admin/settings")
 * public ApiResponse&lt;?&gt; getSettings() { ... }
 *
 * &#64;RequireRole({"admin", "editor"})  // 具有任一角色即可
 * &#64;PostMapping("/article")
 * public ApiResponse&lt;?&gt; createArticle() { ... }
 * </pre>
 *
 * @author zeros
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireRole {

    /**
     * 需要的角色，具有任一即可
     */
    String[] value();
}
