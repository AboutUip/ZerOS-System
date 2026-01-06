package cn.zeros.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * FSDirve操作类型枚举
 * 
 * @author zeros
 * @date 2024
 */
@Getter
@AllArgsConstructor
public enum ActionType {
    
    // 目录操作
    CREATE_DIR("create_dir", "创建目录"),
    DELETE_DIR("delete_dir", "删除目录"),
    DELETE_DIR_RECURSIVE("delete_dir_recursive", "递归删除目录"),
    LIST_DIR("list_dir", "列出目录"),
    RENAME_DIR("rename_dir", "重命名目录"),
    MOVE_DIR("move_dir", "移动目录"),
    COPY_DIR("copy_dir", "复制目录"),
    
    // 文件操作
    CREATE_FILE("create_file", "创建文件"),
    READ_FILE("read_file", "读取文件"),
    WRITE_FILE("write_file", "写入文件"),
    DELETE_FILE("delete_file", "删除文件"),
    RENAME_FILE("rename_file", "重命名文件"),
    MOVE_FILE("move_file", "移动文件"),
    COPY_FILE("copy_file", "复制文件"),
    GET_FILE_INFO("get_file_info", "获取文件信息"),
    
    // 其他操作
    EXISTS("exists", "检查路径是否存在"),
    GET_DISK_INFO("get_disk_info", "获取磁盘信息");
    
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
    public static ActionType getByCode(String code) {
        for (ActionType type : values()) {
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


