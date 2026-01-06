package cn.zeros;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.Environment;

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

            // 格式化contextPath（确保以/开头，不以/结尾）
            if (!contextPath.startsWith("/")) {
                contextPath = "/" + contextPath;
            }
            if (contextPath.endsWith("/") && contextPath.length() > 1) {
                contextPath = contextPath.substring(0, contextPath.length() - 1);
            }
            // 本地可以保留,服务器不行
            System.out.println("\n" + "=".repeat(60));
            System.out.println("  系统启动成功！");
            System.out.println("=".repeat(60));
            System.out.println("  本地后端服务访问地址：");
            System.out.println("    http://localhost:" + port + contextPath);
            System.out.println("    http://127.0.0.1:" + port + contextPath);
            System.out.println("  本地前端服务访问地址：");
            System.out.println("    http://localhost:8089" + "/test/index.html");
            System.out.println("    http://127.0.0.1:8089" + "/test/index.html");
            System.out.println("=".repeat(60) + "\n");
        } catch (Exception e) {
            System.err.println("获取访问地址失败：" + e.getMessage());
        }
    }

}

