package cn.zeros.enums;

import cn.zeros.constant.ErrorCode;
import cn.zeros.exception.BusinessException;
import cn.zeros.model.ActionContext;
import cn.zeros.service.IFSDirveService;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.Map;

/**
 * FSDirve操作类型枚举
 * 使用策略模式，每个枚举值包含自己的处理逻辑
 *
 * @author zeros
 * @date 2026-01-16
 */
@Getter
@AllArgsConstructor
public enum ActionType {

    // 目录操作
    CREATE_DIR("create_dir", "创建目录") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getPath(), "path", ctx.getName(), "name");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.createDirectory(ctx.getPath(), ctx.getName());
        }
    },
    DELETE_DIR("delete_dir", "删除目录") {
        @Override
        public void validate(ActionContext ctx) {
            requireParam(ctx.getPath(), "path");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.deleteDirectory(ctx.getPath());
        }
    },
    DELETE_DIR_RECURSIVE("delete_dir_recursive", "递归删除目录") {
        @Override
        public void validate(ActionContext ctx) {
            requireParam(ctx.getPath(), "path");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.deleteDirectoryRecursive(ctx.getPath());
        }
    },
    LIST_DIR("list_dir", "列出目录") {
        @Override
        public void validate(ActionContext ctx) {
            requireParam(ctx.getPath(), "path");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.listDirectory(ctx.getPath());
        }
    },
    RENAME_DIR("rename_dir", "重命名目录") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getPath(), "path", ctx.getOldName(), "oldName", ctx.getNewName(), "newName");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.renameDirectory(ctx.getPath(), ctx.getOldName(), ctx.getNewName());
        }
    },
    MOVE_DIR("move_dir", "移动目录") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getSourcePath(), "sourcePath", ctx.getTargetPath(), "targetPath");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.moveDirectory(ctx.getSourcePath(), ctx.getTargetPath());
        }
    },
    COPY_DIR("copy_dir", "复制目录") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getSourcePath(), "sourcePath", ctx.getTargetPath(), "targetPath");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.copyDirectory(ctx.getSourcePath(), ctx.getTargetPath());
        }
    },

    // 文件操作
    CREATE_FILE("create_file", "创建文件") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getPath(), "path", ctx.getFileName(), "fileName");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.createFile(ctx.getPath(), ctx.getFileName(),
                    ctx.getContent() != null ? ctx.getContent() : "");
        }
    },
    READ_FILE("read_file", "读取文件") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getPath(), "path", ctx.getFileName(), "fileName");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.readFile(ctx.getPath(), ctx.getFileName(), ctx.isAsBase64());
        }
    },
    WRITE_FILE("write_file", "写入文件") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getPath(), "path", ctx.getFileName(), "fileName");
            requireParam(ctx.getContent(), "content");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.writeFile(ctx.getPath(), ctx.getFileName(), ctx.getContent(),
                    ctx.getWriteMod(), ctx.isBase64());
        }
    },
    DELETE_FILE("delete_file", "删除文件") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getPath(), "path", ctx.getFileName(), "fileName");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.deleteFile(ctx.getPath(), ctx.getFileName());
        }
    },
    RENAME_FILE("rename_file", "重命名文件") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getPath(), "path", ctx.getOldFileName(), "oldFileName", ctx.getNewFileName(), "newFileName");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.renameFile(ctx.getPath(), ctx.getOldFileName(), ctx.getNewFileName());
        }
    },
    MOVE_FILE("move_file", "移动文件") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getSourcePath(), "sourcePath", ctx.getSourceFileName(), "sourceFileName",
                    ctx.getTargetPath(), "targetPath");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.moveFile(ctx.getSourcePath(), ctx.getSourceFileName(),
                    ctx.getTargetPath(), ctx.getTargetFileName());
        }
    },
    COPY_FILE("copy_file", "复制文件") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getSourcePath(), "sourcePath", ctx.getSourceFileName(), "sourceFileName",
                    ctx.getTargetPath(), "targetPath");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.copyFile(ctx.getSourcePath(), ctx.getSourceFileName(),
                    ctx.getTargetPath(), ctx.getTargetFileName());
        }
    },
    GET_FILE_INFO("get_file_info", "获取文件信息") {
        @Override
        public void validate(ActionContext ctx) {
            requireParams(ctx.getPath(), "path", ctx.getFileName(), "fileName");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.getFileInfo(ctx.getPath(), ctx.getFileName());
        }
    },

    // 其他操作
    EXISTS("exists", "检查路径是否存在") {
        @Override
        public void validate(ActionContext ctx) {
            requireParam(ctx.getPath(), "path");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.checkPathExists(ctx.getPath());
        }
    },
    GET_DISK_INFO("get_disk_info", "获取磁盘信息") {
        @Override
        public void validate(ActionContext ctx) {
            requireParam(ctx.getDisk(), "disk");
        }
        @Override
        public Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception {
            return service.getDiskInfo(ctx.getDisk());
        }
    };

    /**
     * 操作代码
     */
    private final String code;

    /**
     * 操作描述
     */
    private final String description;

    /**
     * 验证参数
     */
    public abstract void validate(ActionContext ctx);

    /**
     * 执行操作
     */
    public abstract Map<String, Object> execute(IFSDirveService service, ActionContext ctx) throws Exception;

    /**
     * 获取成功消息
     */
    public String getSuccessMessage() {
        return description + "成功";
    }

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

    // ============ 参数验证辅助方法 ============

    protected static void requireParam(Object value, String paramName) {
        if (value == null || (value instanceof String && ((String) value).isEmpty())) {
            throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: " + paramName);
        }
    }

    protected static void requireParams(Object... paramsAndNames) {
        StringBuilder missing = new StringBuilder();
        for (int i = 0; i < paramsAndNames.length; i += 2) {
            Object value = paramsAndNames[i];
            String name = (String) paramsAndNames[i + 1];
            if (value == null || (value instanceof String && ((String) value).isEmpty())) {
                if (!missing.isEmpty()) {
                    missing.append(", ");
                }
                missing.append(name);
            }
        }
        if (!missing.isEmpty()) {
            throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: " + missing);
        }
    }
}


