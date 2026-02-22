package cn.zeros.exception;

import cn.zeros.constant.ErrorCode;
import lombok.Getter;

/**
 * 认证异常（JWT 无效、过期等）
 *
 * @author zeros
 */
@Getter
public class AuthenticationException extends BusinessException {

    public AuthenticationException(String errorCode, String message) {
        super(errorCode, message);
    }

    public AuthenticationException(ErrorCode errorCode) {
        super(errorCode.getCode(), errorCode.getMessage());
    }
}
