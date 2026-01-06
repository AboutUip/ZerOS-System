package cn.zeros.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

import jakarta.annotation.PostConstruct;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Configuration
@PropertySource("classpath:application.yml")
public class DiskConfig {
    
    @Value("${disk.base-path:../system/service/DISK}")
    private String basePath;
    
    @Value("${disk.c-path:${disk.base-path}/C}")
    private String cPath;
    
    @Value("${disk.d-path:${disk.base-path}/D}")
    private String dPath;
    
    private Path diskBasePath;
    private Path diskCPath;
    private Path diskDPath;
    
    @PostConstruct
    public void init() {
        try {
            // 解析路径（支持相对路径）
            diskBasePath = Paths.get(basePath).toAbsolutePath().normalize();
            diskCPath = Paths.get(cPath).toAbsolutePath().normalize();
            diskDPath = Paths.get(dPath).toAbsolutePath().normalize();
            
            // 确保目录存在
            Files.createDirectories(diskCPath);
            Files.createDirectories(diskDPath);
        } catch (Exception e) {
            throw new RuntimeException("Failed to initialize disk paths", e);
        }
    }
    
    public Path getDiskBasePath() {
        return diskBasePath;
    }
    
    public Path getDiskCPath() {
        return diskCPath;
    }
    
    public Path getDiskDPath() {
        return diskDPath;
    }
}

