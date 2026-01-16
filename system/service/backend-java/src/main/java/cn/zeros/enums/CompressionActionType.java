package cn.zeros.enums;

import cn.zeros.model.ActionContext;
import cn.zeros.exception.BusinessException;
import cn.zeros.constant.ErrorCode;
import lombok.Getter;

/**
 * 压缩操作类型枚举
 * 包含参数验证规则和成功消息
 *
 * @author zeros
 * @date 2026-01-16
 */
@Getter
public enum CompressionActionType {

    // ZIP操作
    COMPRESS_ZIP("compress_zip", "压缩为ZIP", "ZIP 压缩成功", ParamRequirement.TARGET_REQUIRED),
    EXTRACT_ZIP("extract_zip", "解压ZIP", "ZIP 解压缩成功", ParamRequirement.SOURCE_AND_TARGET),
    LIST_ZIP("list_zip", "列出ZIP内容", "ZIP 列表获取成功", ParamRequirement.SOURCE_ONLY),

    // 加密ZIP操作
    COMPRESS_ZIP_ENCRYPTED("compress_zip_encrypted", "压缩为加密ZIP", "加密 ZIP 压缩成功", ParamRequirement.TARGET_REQUIRED),
    EXTRACT_ZIP_ENCRYPTED("extract_zip_encrypted", "解压加密ZIP", "加密 ZIP 解压缩成功", ParamRequirement.SOURCE_AND_TARGET),

    // RAR操作
    COMPRESS_RAR("compress_rar", "压缩为RAR", "RAR 压缩成功", ParamRequirement.SOURCE_AND_TARGET),
    EXTRACT_RAR("extract_rar", "解压RAR", "RAR 解压缩成功", ParamRequirement.SOURCE_AND_TARGET),
    LIST_RAR("list_rar", "列出RAR内容", "RAR 列表获取成功", ParamRequirement.SOURCE_ONLY),

    // 7Z操作
    COMPRESS_7Z("compress_7z", "压缩为7Z", "7Z 压缩成功", ParamRequirement.TARGET_REQUIRED),
    EXTRACT_7Z("extract_7z", "解压7Z", "7Z 解压缩成功", ParamRequirement.SOURCE_AND_TARGET),
    LIST_7Z("list_7z", "列出7Z内容", "7Z 列表获取成功", ParamRequirement.SOURCE_ONLY),

    // TAR操作
    COMPRESS_TAR("compress_tar", "压缩为TAR", "TAR 压缩成功", ParamRequirement.TARGET_REQUIRED),
    EXTRACT_TAR("extract_tar", "解压TAR", "TAR 解压缩成功", ParamRequirement.SOURCE_AND_TARGET),
    LIST_TAR("list_tar", "列出TAR内容", "TAR 列表获取成功", ParamRequirement.SOURCE_ONLY),

    // TAR.GZ操作
    COMPRESS_TARGZ("compress_targz", "压缩为TAR.GZ", "TAR.GZ 压缩成功", ParamRequirement.TARGET_REQUIRED),
    EXTRACT_TARGZ("extract_targz", "解压TAR.GZ", "TAR.GZ 解压缩成功", ParamRequirement.SOURCE_AND_TARGET),
    LIST_TARGZ("list_targz", "列出TAR.GZ内容", "TAR.GZ 列表获取成功", ParamRequirement.SOURCE_ONLY),

    // 其他
    CHECK_SUPPORT("check_support", "检查支持情况", "支持检查完成", ParamRequirement.NONE);

    /**
     * 参数需求类型
     */
    public enum ParamRequirement {
        /** 无需参数 */
        NONE,
        /** 仅需要源路径 */
        SOURCE_ONLY,
        /** 仅需要目标路径（压缩操作，源可以从 sourcePaths 获取） */
        TARGET_REQUIRED,
        /** 需要源路径和目标路径 */
        SOURCE_AND_TARGET
    }

    /**
     * 操作代码
     */
    private final String code;

    /**
     * 操作描述
     */
    private final String description;

    /**
     * 成功消息
     */
    private final String successMessage;

    /**
     * 参数需求
     */
    private final ParamRequirement paramRequirement;

    CompressionActionType(String code, String description, String successMessage, ParamRequirement paramRequirement) {
        this.code = code;
        this.description = description;
        this.successMessage = successMessage;
        this.paramRequirement = paramRequirement;
    }

    /**
     * 验证参数是否满足要求
     *
     * @param ctx 动作上下文
     * @throws BusinessException 如果参数不满足要求
     */
    public void validate(ActionContext ctx) {
        switch (paramRequirement) {
            case SOURCE_ONLY:
                if (isBlank(ctx.getSourcePath())) {
                    throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath");
                }
                break;
            case TARGET_REQUIRED:
                if (isBlank(ctx.getTargetPath())) {
                    throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: targetPath");
                }
                break;
            case SOURCE_AND_TARGET:
                if (isBlank(ctx.getSourcePath()) || isBlank(ctx.getTargetPath())) {
                    throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath, targetPath");
                }
                break;
            case NONE:
            default:
                // 无需验证
                break;
        }
    }

    private static boolean isBlank(String str) {
        return str == null || str.isEmpty();
    }

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


