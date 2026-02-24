package cn.zeros.exception;

import cn.zeros.constant.ErrorCode;
import cn.zeros.model.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.io.IOException;

/**
 * 全局异常处理器
 * 
 * @author zeros
 * @date 2026-01-16
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    /**
     * 处理业务异常
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<?>> handleBusinessException(BusinessException e) {
        log.warn("业务异常: {}", e.getErrorMessage(), e);
        
        // 根据错误码确定HTTP状态码
        HttpStatus status = determineHttpStatus(e.getErrorCode());
        
        return ResponseEntity.status(status)
                .body(ApiResponse.error(e.getErrorCode(), e.getErrorMessage()));
    }
    
    /**
     * 处理参数异常
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<?>> handleIllegalArgumentException(IllegalArgumentException e) {
        log.warn("参数异常: {}", e.getMessage(), e);
        
        String errorCode = ErrorCode.PARAM_ERROR.getCode();
        String message = e.getMessage();
        
        // 根据消息内容判断具体的错误类型
        if (message != null) {
            if (message.contains("路径") || message.contains("path")) {
                if (message.contains("危险字符") || message.contains("..")) {
                    errorCode = ErrorCode.PATH_TRAVERSAL.getCode();
                } else {
                    errorCode = ErrorCode.INVALID_PATH.getCode();
                }
            } else if (message.contains("文件名") || message.contains("file name")) {
                errorCode = ErrorCode.INVALID_FILE_NAME.getCode();
            }
        }
        
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(errorCode, message != null ? message : ErrorCode.PARAM_ERROR.getMessage()));
    }
    
    /**
     * 处理IO异常
     */
    @ExceptionHandler(IOException.class)
    public ResponseEntity<ApiResponse<?>> handleIOException(IOException e) {
        log.error("IO异常: {}", e.getMessage(), e);
        
        String message = e.getMessage();
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        String errorCode = ErrorCode.FILE_SYSTEM_ERROR.getCode();
        
        // 根据错误消息判断状态码
        if (message != null) {
            if (message.contains("不存在")) {
                status = HttpStatus.NOT_FOUND;
                if (message.contains("文件")) {
                    errorCode = ErrorCode.FILE_NOT_FOUND.getCode();
                } else if (message.contains("目录") || message.contains("磁盘")) {
                    errorCode = ErrorCode.DIRECTORY_NOT_FOUND.getCode();
                }
            } else if (message.contains("已存在")) {
                status = HttpStatus.CONFLICT;
                if (message.contains("文件")) {
                    errorCode = ErrorCode.FILE_ALREADY_EXISTS.getCode();
                } else {
                    errorCode = ErrorCode.DIRECTORY_ALREADY_EXISTS.getCode();
                }
            } else if (message.contains("不为空")) {
                status = HttpStatus.CONFLICT;
                errorCode = ErrorCode.DIRECTORY_NOT_EMPTY.getCode();
            } else if (message.contains("父目录")) {
                status = HttpStatus.NOT_FOUND;
                errorCode = ErrorCode.PARENT_DIR_NOT_FOUND.getCode();
            }
        }
        
        return ResponseEntity.status(status)
                .body(ApiResponse.error(errorCode, message != null ? message : ErrorCode.FILE_SYSTEM_ERROR.getMessage()));
    }
    
    /**
     * 处理静态资源未找到异常
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<?>> handleNoResourceFound(NoResourceFoundException e) {
        log.info("资源未找到: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("404", "资源未找到: " + e.getResourcePath()));
    }

    /**
     * 处理无匹配 Controller 的请求（路径未找到）
     */
    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<ApiResponse<?>> handleNoHandlerFound(NoHandlerFoundException e) {
        log.info("路径未找到: {} {}", e.getHttpMethod(), e.getRequestURL());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("404", "路径未找到: " + e.getRequestURL()));
    }

    /**
     * 处理其他异常
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handleException(Exception e) {
        log.error("系统异常: ", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(ErrorCode.INTERNAL_ERROR.getCode(), 
                        "服务器内部错误: " + e.getMessage()));
    }
    
    /**
     * 根据错误码确定HTTP状态码
     */
    private HttpStatus determineHttpStatus(String errorCode) {
        if (errorCode == null) {
            return HttpStatus.INTERNAL_SERVER_ERROR;
        }
        
        // 1xxx - 通用错误，通常是参数错误
        if (errorCode.startsWith("1")) {
            return HttpStatus.BAD_REQUEST;
        }
        // 2xxx - 文件系统错误
        if (errorCode.startsWith("2")) {
            if (errorCode.contains("01") || errorCode.contains("03") || errorCode.contains("06") || errorCode.contains("09")) {
                // 不存在相关错误
                return HttpStatus.NOT_FOUND;
            } else if (errorCode.contains("02") || errorCode.contains("04") || errorCode.contains("05")) {
                // 已存在相关错误
                return HttpStatus.CONFLICT;
            }
            return HttpStatus.INTERNAL_SERVER_ERROR;
        }
        // 3xxx - 压缩操作错误
        if (errorCode.startsWith("3")) {
            if (errorCode.contains("01") || errorCode.contains("03")) {
                return HttpStatus.NOT_FOUND;
            } else if (errorCode.contains("02")) {
                return HttpStatus.CONFLICT;
            }
            return HttpStatus.INTERNAL_SERVER_ERROR;
        }
        // 401x - 认证错误
        if (errorCode.startsWith("401")) {
            return HttpStatus.UNAUTHORIZED;
        }
        // 403x - 授权错误
        if (errorCode.startsWith("403")) {
            return HttpStatus.FORBIDDEN;
        }
        // 4xxx - 代理服务错误
        if (errorCode.startsWith("4")) {
            if (errorCode.contains("01") || errorCode.contains("02")) {
                return HttpStatus.BAD_REQUEST;
            }
            return HttpStatus.BAD_GATEWAY;
        }
        // 5xxx - 服务器错误
        if (errorCode.startsWith("5")) {
            return HttpStatus.INTERNAL_SERVER_ERROR;
        }
        // 9xxx - 未知错误
        if (errorCode.startsWith("9")) {
            return HttpStatus.BAD_REQUEST;
        }
        
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
}


