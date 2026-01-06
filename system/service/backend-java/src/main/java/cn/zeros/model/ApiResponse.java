package cn.zeros.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {
    private String status;
    private String message;
    private String timestamp;
    private Long timestampUnix;
    private T data;
    
    public static <T> ApiResponse<T> success(String message, T data) {
        long unixTime = System.currentTimeMillis() / 1000;
        return ApiResponse.<T>builder()
                .status("success")
                .message(message)
                .timestamp(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")))
                .timestampUnix(unixTime)
                .data(data)
                .build();
    }
    
    public static <T> ApiResponse<T> success(String message) {
        return success(message, null);
    }
    
    public static <T> ApiResponse<T> error(String message) {
        long unixTime = System.currentTimeMillis() / 1000;
        return ApiResponse.<T>builder()
                .status("error")
                .message(message)
                .timestamp(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")))
                .timestampUnix(unixTime)
                .build();
    }
    
    /**
     * 创建错误响应（带错误码）
     * 
     * @param errorCode 错误码
     * @param message 错误消息
     * @param <T> 数据类型
     * @return 错误响应
     */
    public static <T> ApiResponse<T> error(String errorCode, String message) {
        long unixTime = System.currentTimeMillis() / 1000;
        ApiResponse<T> response = ApiResponse.<T>builder()
                .status("error")
                .message(message)
                .timestamp(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")))
                .timestampUnix(unixTime)
                .build();
        // 注意：如果需要在响应中包含错误码，可以添加errorCode字段
        return response;
    }
}

