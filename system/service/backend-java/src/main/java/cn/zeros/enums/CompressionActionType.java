package cn.zeros.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 压缩操作类型枚举
 * 
 * @author zeros
 * @date 2024
 */
@Getter
@AllArgsConstructor
public enum CompressionActionType {
    
    // ZIP操作
    COMPRESS_ZIP("compress_zip", "压缩为ZIP"),
    EXTRACT_ZIP("extract_zip", "解压ZIP"),
    LIST_ZIP("list_zip", "列出ZIP内容"),
    
    // RAR操作
    COMPRESS_RAR("compress_rar", "压缩为RAR"),
    EXTRACT_RAR("extract_rar", "解压RAR"),
    LIST_RAR("list_rar", "列出RAR内容"),
    
    // 其他
    CHECK_SUPPORT("check_support", "检查支持情况");
    
    /**
     * 操作代码
     */
    private final String code;
    
    /**
     * 操作描述
     */
    private final String description;
    
    /**
     * 根据代码获取操作类型
     * 
     * @param code 操作代码
     * @return 操作类型，如果不存在返回null
     */
    public static CompressionActionType getByCode(String code) {
        for (CompressionActionType type : values()) {
            if (type.getCode().equals(code)) {
                return type;
            }
        }
        return null;
    }
    
    /**
     * 判断是否为有效的操作代码
     * 
     * @param code 操作代码
     * @return 是否有效
     */
    public static boolean isValid(String code) {
        return getByCode(code) != null;
    }
}


