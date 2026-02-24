package cn.zeros.config;

import cn.zeros.interceptor.JwtAuthInterceptor;
import cn.zeros.service.BootSecurityTokenService;
import cn.zeros.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.ArrayList;
import java.util.List;

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

    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        for (HttpMessageConverter<?> converter : converters) {
            if (converter instanceof MappingJackson2HttpMessageConverter jacksonConverter) {
                List<MediaType> supportedTypes = new ArrayList<>(jacksonConverter.getSupportedMediaTypes());
                supportedTypes.add(MediaType.TEXT_PLAIN);
                supportedTypes.add(new MediaType("text", "plain", java.nio.charset.StandardCharsets.UTF_8));
                jacksonConverter.setSupportedMediaTypes(supportedTypes);
                break;
            }
        }
    }
}
