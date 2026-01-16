package cn.zeros.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 文件写入模式枚举
 * 
 * @author zeros
 * @date 2026-01-16
 */
@Getter
@AllArgsConstructor
public enum WriteMode {
    
    /**
     * 覆盖模式
     */
    OVERWRITE("overwrite", "覆盖"),
    
    /**
     * 追加模式
     */
    APPEND("append", "追加"),
    
    /**
     * 前置模式
     */
    PREPEND("prepend", "前置");
    
    /**
     * 模式代码
     */
    private final String code;
    
    /**
     * 模式描述
     */
    private final String description;
    
    /**
     * 根据代码获取写入模式
     * 
     * @param code 模式代码
     * @return 写入模式，如果不存在返回OVERWRITE
     */
    public static WriteMode getByCode(String code) {
        if (code == null || code.isEmpty()) {
            return OVERWRITE;
        }
        
        for (WriteMode mode : values()) {
            if (mode.getCode().equalsIgnoreCase(code)) {
                return mode;
            }
        }
        return OVERWRITE;
    }
}


