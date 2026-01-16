package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 测试控制器
 * 用于验证 Spring 服务是否正常运行
 * 访问地址: http://localhost:8089/system/service/test
 * 
 * @author zeros
 * @date 2026-01-16
 */
@RestController
@RequestMapping("/test")
@Slf4j
public class TestController {
    
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
    
    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> handleOptions() {
        return ResponseEntity.ok().build();
    }
}

