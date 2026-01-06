package cn.zeros.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 错误码枚举
 * 
 * @author zeros
 * @date 2024
 */
@Getter
@AllArgsConstructor
public enum ErrorCode {
    
    // 通用错误码 1xxx
    SUCCESS("1000", "操作成功"),
    PARAM_ERROR("1001", "参数错误"),
    PARAM_MISSING("1002", "缺少必要参数"),
    INVALID_PATH("1003", "无效的路径格式"),
    PATH_TRAVERSAL("1004", "路径包含危险字符"),
    
    // 文件系统错误码 2xxx
    FILE_NOT_FOUND("2001", "文件不存在"),
    FILE_ALREADY_EXISTS("2002", "文件已存在"),
    DIRECTORY_NOT_FOUND("2003", "目录不存在"),
    DIRECTORY_ALREADY_EXISTS("2004", "目录已存在"),
    DIRECTORY_NOT_EMPTY("2005", "目录不为空，无法删除"),
    PARENT_DIR_NOT_FOUND("2006", "父目录不存在"),
    INVALID_FILE_NAME("2007", "无效的文件名"),
    FILE_SYSTEM_ERROR("2008", "文件系统操作失败"),
    DISK_NOT_FOUND("2009", "磁盘目录不存在"),
    
    // 压缩操作错误码 3xxx
    COMPRESS_FILE_NOT_FOUND("3001", "压缩文件不存在"),
    COMPRESS_FILE_ALREADY_EXISTS("3002", "目标压缩文件已存在"),
    COMPRESS_SOURCE_NOT_FOUND("3003", "源路径不存在"),
    COMPRESS_FAILED("3004", "压缩操作失败"),
    EXTRACT_FAILED("3005", "解压缩操作失败"),
    COMPRESS_NOT_SUPPORTED("3006", "压缩格式不支持"),
    
    // 代理服务错误码 4xxx
    PROXY_URL_INVALID("4001", "无效的URL格式"),
    PROXY_ONLY_HTTPS("4002", "仅允许HTTPS URL"),
    PROXY_FETCH_FAILED("4003", "代理请求失败"),
    
    // 服务器错误 5xxx
    INTERNAL_ERROR("5000", "服务器内部错误"),
    SYSTEM_ERROR("5001", "系统错误"),
    
    // 未知错误 9xxx
    UNKNOWN_ACTION("9001", "未知的操作"),
    UNKNOWN_ERROR("9999", "未知错误");
    
    /**
     * 错误码
     */
    private final String code;
    
    /**
     * 错误消息
     */
    private final String message;
}


