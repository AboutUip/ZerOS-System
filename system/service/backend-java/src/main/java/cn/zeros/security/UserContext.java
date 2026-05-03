package cn.zeros.security;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Collections;
import java.util.List;

/**
 * 当前请求用户上下文，存储在 ThreadLocal 中供后续接口权限控制使用
 * 支持 SystemToken / UserToken 两种令牌类型
 *
 * @author zeros
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserContext {

    private String userId;
    private String username;

    /**
     * 令牌类型：SystemToken / UserToken / null（标准令牌）
     */
    private String tokenType;

    /**
     * 用户级别：USER / ADMIN / DEFAULT_ADMIN（UserToken 专属）
     */
    private String userLevel;

    @Builder.Default
    private List<String> roles = Collections.emptyList();

    @Builder.Default
    private List<String> permissions = Collections.emptyList();

    private String tokenId;

    public boolean isSystemToken() {
        return "SystemToken".equals(tokenType);
    }

    public boolean isUserToken() {
        return "UserToken".equals(tokenType);
    }

    public boolean isAdmin() {
        return "ADMIN".equals(userLevel) || "DEFAULT_ADMIN".equals(userLevel);
    }

    public boolean hasRole(String role) {
        return roles != null && roles.contains(role);
    }

    public boolean hasPermission(String permission) {
        return permissions != null && permissions.contains(permission);
    }

    public boolean hasAnyRole(String... roles) {
        if (this.roles == null || roles == null) {
            return false;
        }
        for (String role : roles) {
            if (this.roles.contains(role)) {
                return true;
            }
        }
        return false;
    }
}
