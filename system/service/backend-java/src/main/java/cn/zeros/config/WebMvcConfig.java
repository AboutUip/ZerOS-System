package cn.zeros.config;

import cn.zeros.interceptor.JwtAuthInterceptor;
import cn.zeros.service.BootSecurityTokenService;
import cn.zeros.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC 配置：注册 JWT 认证拦截器
 *
 * @author zeros
 */
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final JwtUtil jwtUtil;
    private final JwtProperties jwtProperties;
    private final BootSecurityTokenService bootSecurityTokenService;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new JwtAuthInterceptor(jwtUtil, jwtProperties, bootSecurityTokenService))
                .addPathPatterns("/**")
                .order(0);
    }
}
