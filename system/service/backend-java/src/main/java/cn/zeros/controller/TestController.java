package cn.zeros.controller;

import cn.zeros.model.Announcement;
import cn.zeros.model.ApiResponse;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 测试控制器
 * 用于验证 Spring 服务是否正常运行
 * 访问地址：http://localhost:8089/system/service/test
 *
 * @author zeros
 * @date 2026-01-16
 */
@Slf4j
@RestController
@RequestMapping("/test")
@RequiredArgsConstructor
public class TestController {

    private final ObjectMapper objectMapper;

    private static final String ANNOUNCEMENT_FILE_PATH = "announcement/post.json";

    @RequestMapping(method = {RequestMethod.OPTIONS, RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleRequest(
            @RequestBody(required = false) Map<String, Object> requestBody) {
        
        try {
            // 准备响应数据
            Map<String, Object> responseData = new HashMap<>();
            responseData.put("test_string", "Hello from Spring Service!");
            responseData.put("test_number", 12345);
            responseData.put("test_boolean", true);
            responseData.put("test_array", new String[]{"item1", "item2", "item3"});
            
            Map<String, Object> testObject = new HashMap<>();
            testObject.put("key1", "value1");
            testObject.put("key2", "value2");
            Map<String, Object> nested = new HashMap<>();
            nested.put("nested_key", "nested_value");
            testObject.put("nested", nested);
            responseData.put("test_object", testObject);
            
            // 服务器信息
            Map<String, Object> serverInfo = new HashMap<>();
            serverInfo.put("java_version", System.getProperty("java.version"));
            serverInfo.put("java_vendor", System.getProperty("java.vendor"));
            serverInfo.put("os_name", System.getProperty("os.name"));
            serverInfo.put("os_version", System.getProperty("os.version"));
            serverInfo.put("server_software", "Spring Boot");
            
            // 请求信息
            Map<String, Object> requestInfo = new HashMap<>();
            if (requestBody != null && !requestBody.isEmpty()) {
                requestInfo.put("request_body", requestBody);
                responseData.put("received_data", requestBody);
            }
            
            // 构建完整响应数据
            Map<String, Object> fullData = new HashMap<>();
            fullData.put("data", responseData);
            fullData.put("server", serverInfo);
            fullData.put("request", requestInfo);
            
            String message = requestBody != null && !requestBody.isEmpty() 
                ? "POST 请求已接收并处理" 
                : "GET 请求已接收";
            
            log.info("Test endpoint accessed: {}", message);
            
            return ResponseEntity.ok(ApiResponse.success(message, fullData));
            
        } catch (Exception e) {
            log.error("Test endpoint error", e);
            return ResponseEntity.ok(ApiResponse.success("请求处理完成（处理过程中有异常）", null));
        }
    }
    
    /**
     * 处理 /test/handle 的 POST 请求（预留占位）
     */
    @PostMapping("/handle")
    public ResponseEntity<Void> handlePost() {
        return ResponseEntity.ok().build();
    }

    @GetMapping("/announcement")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAnnouncement() {
        try {
            // 1. 读取文件（相对路径，基于进程工作目录，如 /app/announcement/post.json）
            File file = new File(ANNOUNCEMENT_FILE_PATH);

            if (!file.exists()) {
                // 文件不存在时返回空公告，避免前端 404（如未部署公告文件时）
                Map<String, Object> empty = new LinkedHashMap<>();
                empty.put("title", "");
                empty.put("content", "");
                empty.put("level", 0);
                empty.put("subTime", System.currentTimeMillis());
                return ResponseEntity.ok(ApiResponse.success("无公告", empty));
            }

            // 2. 读取并解析 JSON
            String jsonContent = Files.readString(file.toPath(), StandardCharsets.UTF_8);
            objectMapper.setDateFormat(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss"));
            Announcement announcement = objectMapper.readValue(jsonContent, Announcement.class);

            // 3. 直接构建您需要的data结构
            Map<String, Object> data = getStringObjectMap(announcement, file);

            // 5. 返回响应
            return ResponseEntity.ok()
                    .body(ApiResponse.success("公告读取成功", data));

        } catch (JsonProcessingException e) {
            log.error("JSON解析失败", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.error("公告格式错误"));
        } catch (IOException e) {
            log.error("文件读取失败", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("读取公告文件失败"));
        }
    }

    private static Map<String, Object> getStringObjectMap(Announcement announcement, File file) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("title", announcement.getTitle());
        data.put("content", announcement.getContent());
        data.put("level", announcement.getLevel());

        // 4. 处理updateTime转换为时间戳
        if (announcement.getUpdateTime() != null) {
            // 使用updateTime字段，但在data中命名为subTime
            data.put("subTime", announcement.getUpdateTime().getTime());
        } else {
            // 如果没有updateTime，使用文件创建的时间
            data.put("subTime", file.lastModified());
        }
        return data;
    }


}

