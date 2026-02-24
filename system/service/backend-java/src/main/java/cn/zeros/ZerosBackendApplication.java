package cn.zeros;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.Environment;

/**
 * ZerOS 后端服务启动入口
 *
 * @author zeros
 * @date 2026-01-16
 */
@Slf4j
@SpringBootApplication
public class ZerosBackendApplication implements ApplicationListener<ApplicationReadyEvent> {

    public static void main(String[] args) {
        SpringApplication.run(ZerosBackendApplication.class, args);
    }

    /**
     * 应用启动完成后输出访问地址
     *
     * @param event 应用就绪事件
     */
    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        try {
            Environment env = event.getApplicationContext().getEnvironment();
            String port = env.getProperty("server.port", "8888");
            String contextPath = env.getProperty("server.servlet.context-path", "/");

            // 格式化 contextPath（确保以 / 开头，不以 / 结尾）
            if (!contextPath.startsWith("/")) {
                contextPath = "/" + contextPath;
            }
            if (contextPath.endsWith("/") && contextPath.length() > 1) {
                contextPath = contextPath.substring(0, contextPath.length() - 1);
            }

            String separator = "=".repeat(60);
            log.info("\n{}\n  系统启动成功！\n{}\n  本地后端服务访问地址：\n    http://localhost:{}{}\n    http://127.0.0.1:{}{}\n  本地前端服务访问地址：\n    http://localhost:8089/test/index.html\n    http://127.0.0.1:8089/test/index.html\n{}",
                    separator, separator, port, contextPath, port, contextPath, separator);
        } catch (Exception e) {
            log.error("获取访问地址失败：{}", e.getMessage(), e);
        }
    }
}

