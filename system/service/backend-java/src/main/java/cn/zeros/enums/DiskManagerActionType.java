package cn.zeros.enums;

import cn.zeros.model.ActionContext;
import lombok.Getter;

@Getter
public enum DiskManagerActionType {

    CHECK("check", "Check partition", "Partition checked", ParamRequirement.PARTITION),
    CREATE("create", "Create partition", "Partition created", ParamRequirement.PARTITION),
    DELETE("delete", "Delete partition", "Partition deleted", ParamRequirement.PARTITION),
    MERGE("merge", "Merge partitions", "Partitions merged", ParamRequirement.SOURCE_AND_TARGET),
    LIST("list", "List partitions", "Partition list loaded", ParamRequirement.NONE),
    READ_DATA("read_data", "Read DiskData.json", "DiskData.json read", ParamRequirement.NONE),
    WRITE_DATA("write_data", "Write DiskData.json", "DiskData.json write blocked", ParamRequirement.NONE),
    SYNC_DATA("sync_data", "Sync DiskData.json", "DiskData.json synced", ParamRequirement.NONE),
    FORMAT("format", "Format partition", "Partition formatted", ParamRequirement.PARTITION),
    RESIZE("resize", "Resize partition", "Partition resized", ParamRequirement.PARTITION_AND_SIZE),
    HEALTH("health", "Check disk health", "Disk health checked", ParamRequirement.NONE),
    CLONE("clone", "Clone partition", "Partition cloned", ParamRequirement.SOURCE_AND_TARGET);

    public enum ParamRequirement {
        NONE,
        PARTITION,
        PARTITION_AND_SIZE,
        SOURCE_AND_TARGET
    }

    private final String code;
    private final String description;
    private final String successMessage;
    private final ParamRequirement paramRequirement;

    DiskManagerActionType(String code, String description, String successMessage, ParamRequirement paramRequirement) {
        this.code = code;
        this.description = description;
        this.successMessage = successMessage;
        this.paramRequirement = paramRequirement;
    }

    public String validate(ActionContext ctx) {
        return switch (paramRequirement) {
            case PARTITION -> isBlank(ctx.getPartition()) ? "Missing required parameter: partition" : null;
            case PARTITION_AND_SIZE -> {
                if (isBlank(ctx.getPartition())) {
                    yield "Missing required parameter: partition";
                }
                if (ctx.getNewSize() <= 0) {
                    yield "Missing required parameter: newSize (must be greater than 0)";
                }
                yield null;
            }
            case SOURCE_AND_TARGET -> (isBlank(ctx.getSource()) || isBlank(ctx.getTarget()))
                    ? "Missing required parameters: source, target"
                    : null;
            case NONE -> null;
        };
    }

    private static boolean isBlank(String str) {
        return str == null || str.isEmpty();
    }

    public static DiskManagerActionType getByCode(String code) {
        for (DiskManagerActionType type : values()) {
            if (type.getCode().equals(code)) {
                return type;
            }
        }
        return null;
    }

    public static boolean isValid(String code) {
        return getByCode(code) != null;
    }
}
