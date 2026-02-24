package cn.zeros.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 统一 API 响应包装类
 *
 * <p>所有接口均返回此结构，前端通过 {@code status} 字段判断成功或失败。
 *
 * @param <T> 响应数据类型
 * @author zeros
 * @date 2026-01-16
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    /** 响应状态：{@code success} 或 {@code error} */
    private String status;

    /** 响应消息 */
    private String message;

    /** 响应时间（格式：yyyy-MM-dd HH:mm:ss） */
    private String timestamp;

    /** 响应时间（Unix 秒级时间戳） */
    @JsonProperty("timestamp_unix")
    private Long timestampUnix;

    /** 业务错误码（仅在 error 响应时存在） */
    @JsonProperty("error_code")
    private String errorCode;

    /** 响应业务数据 */
    private T data;

    /**
     * 创建成功响应（含数据）
     *
     * @param message 成功消息
     * @param data    响应数据
     * @param <T>     数据类型
     * @return 成功响应对象
     */
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

    /**
     * 创建成功响应（无数据）
     *
     * @param message 成功消息
     * @param <T>     数据类型
     * @return 成功响应对象
     */
    public static <T> ApiResponse<T> success(String message) {
        return success(message, null);
    }

    /**
     * 创建错误响应（无错误码）
     *
     * @param message 错误消息
     * @param <T>     数据类型
     * @return 错误响应对象
     */
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
     * 创建错误响应（含错误码）
     *
     * @param errorCode 业务错误码
     * @param message   错误消息
     * @param <T>       数据类型
     * @return 错误响应对象
     */
    public static <T> ApiResponse<T> error(String errorCode, String message) {
        long unixTime = System.currentTimeMillis() / 1000;
        return ApiResponse.<T>builder()
                .status("error")
                .errorCode(errorCode)
                .message(message)
                .timestamp(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")))
                .timestampUnix(unixTime)
                .build();
    }
}

