package cn.zeros.enums;

import cn.zeros.model.ActionContext;
import lombok.Getter;

/**
 * DiskManager操作类型枚举
 * 包含参数验证规则和成功消息
 *
 * @author zeros
 * @date 2026-01-16
 */
@Getter
public enum DiskManagerActionType {

    CHECK("check", "检查分区是否存在", "分区检查完成", ParamRequirement.PARTITION),
    CREATE("create", "创建分区", "分区创建成功", ParamRequirement.PARTITION),
    DELETE("delete", "删除分区", "分区已删除", ParamRequirement.PARTITION),
    MERGE("merge", "合并分区", "分区合并成功", ParamRequirement.SOURCE_AND_TARGET),
    LIST("list", "列出所有分区", "分区列表获取成功", ParamRequirement.NONE),
    READ_DATA("read_data", "读取DiskData.json", "DiskData.json 读取成功", ParamRequirement.NONE),
    SYNC_DATA("sync_data", "同步磁盘数据", "DiskData.json 同步成功", ParamRequirement.NONE),
    FORMAT("format", "格式化分区", "分区格式化成功", ParamRequirement.PARTITION),
    RESIZE("resize", "调整分区大小", "分区大小调整成功", ParamRequirement.PARTITION_AND_SIZE),
    HEALTH("health", "磁盘健康检查", "磁盘健康检查完成", ParamRequirement.NONE),
    CLONE("clone", "克隆分区", "分区克隆成功", ParamRequirement.SOURCE_AND_TARGET);

    /**
     * 参数需求类型
     */
    public enum ParamRequirement {
        /** 无需参数 */
        NONE,
        /** 需要分区参数 */
        PARTITION,
        /** 需要分区和大小参数 */
        PARTITION_AND_SIZE,
        /** 需要源和目标参数 */
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

    DiskManagerActionType(String code, String description, String successMessage, ParamRequirement paramRequirement) {
        this.code = code;
        this.description = description;
        this.successMessage = successMessage;
        this.paramRequirement = paramRequirement;
    }

    /**
     * 验证参数是否满足要求
     *
     * @param ctx 动作上下文
     * @return 错误消息null
     */
    public String validate(ActionContext ctx) {
        switch (paramRequirement) {
            case PARTITION:
                if (isBlank(ctx.getPartition())) {
                    return "缺少必要参数: partition";
                }
                break;
            case PARTITION_AND_SIZE:
                if (isBlank(ctx.getPartition())) {
                    return "缺少必要参数: partition";
                }
                if (ctx.getNewSize() <= 0) {
                    return "缺少必要参数: newSize (必须大于0)";
                }
                break;
            case SOURCE_AND_TARGET:
                if (isBlank(ctx.getSource()) || isBlank(ctx.getTarget())) {
                    return "缺少必要参数: source, target";
                }
                break;
            case NONE:
            default:
                // 无需验证
                break;
        }
        return null;
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
    public static DiskManagerActionType getByCode(String code) {
        for (DiskManagerActionType type : values()) {
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
