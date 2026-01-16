package cn.zeros.controller;

import cn.zeros.enums.DiskManagerActionType;
import cn.zeros.model.ActionContext;
import cn.zeros.model.ApiResponse;
import cn.zeros.service.IDiskManagerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;
import java.util.function.Function;

/**
 * 磁盘管理控制器
 * 使用函数式映射替代 switch 语句，代码更简洁
 *
 * @author zeros
 * @date 2026-01-16
 */
@RestController
@RequestMapping("/DISKMANAGER")
public class DiskManagerController {

    private final IDiskManagerService diskManagerService;
    private final Map<DiskManagerActionType, Function<ActionContext, Map<String, Object>>> executors;

    public DiskManagerController(IDiskManagerService diskManagerService) {
        this.diskManagerService = diskManagerService;
        this.executors = initExecutors();
    }

    /**
     * 初始化操作执行器映射
     */
    private Map<DiskManagerActionType, Function<ActionContext, Map<String, Object>>> initExecutors() {
        return Map.ofEntries(
                Map.entry(DiskManagerActionType.CHECK, this::executeCheck),
                Map.entry(DiskManagerActionType.CREATE, this::executeCreate),
                Map.entry(DiskManagerActionType.DELETE, this::executeDelete),
                Map.entry(DiskManagerActionType.MERGE, this::executeMerge),
                Map.entry(DiskManagerActionType.LIST, this::executeList),
                Map.entry(DiskManagerActionType.READ_DATA, this::executeReadData),
                Map.entry(DiskManagerActionType.SYNC_DATA, this::executeSyncData),
                Map.entry(DiskManagerActionType.FORMAT, this::executeFormat),
                Map.entry(DiskManagerActionType.RESIZE, this::executeResize),
                Map.entry(DiskManagerActionType.HEALTH, this::executeHealth),
                Map.entry(DiskManagerActionType.CLONE, this::executeClone)
        );
    }

    @RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<ApiResponse<?>> handleRequest(
            @RequestParam String action,
            @RequestParam(required = false) String partition,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String target,
            @RequestParam(required = false, defaultValue = "false") boolean force,
            @RequestParam(required = false, defaultValue = "false") boolean deleteSource,
            @RequestParam(required = false, defaultValue = "false") boolean quick,
            @RequestParam(required = false, defaultValue = "0") long newSize) {

        // 验证操作类型
        DiskManagerActionType actionType = DiskManagerActionType.getByCode(action);
        if (actionType == null) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("未知的操作: " + action + " (支持的操作: check, create, delete, merge, list, read_data, sync_data, format, resize, health, clone)"));
        }

        // 构建上下文
        ActionContext ctx = ActionContext.builder()
                .partition(partition)
                .source(source)
                .target(target)
                .force(force)
                .deleteSource(deleteSource)
                .quick(quick)
                .newSize(newSize)
                .build();

        // 验证参数
        String validationError = actionType.validate(ctx);
        if (validationError != null) {
            return ResponseEntity.badRequest().body(ApiResponse.error(validationError));
        }

        try {
            // 执行操作
            Function<ActionContext, Map<String, Object>> executor = executors.get(actionType);
            Map<String, Object> result = executor.apply(ctx);

            // 构建成功消息
            String message = buildSuccessMessage(actionType, ctx, result);
            return ResponseEntity.ok(ApiResponse.success(message, result));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        } catch (RuntimeException e) {
            // 处理包装的 IOException
            Throwable cause = e.getCause();
            if (cause instanceof IOException) {
                return ResponseEntity.internalServerError().body(ApiResponse.error(cause.getMessage()));
            }
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * 构建成功消息（某些操作需要动态消息）
     */
    private String buildSuccessMessage(DiskManagerActionType actionType, ActionContext ctx, Map<String, Object> result) {
        switch (actionType) {
            case DELETE:
                return ctx.isForce() ? "分区已强制删除: " + ctx.getPartition() : "分区已删除: " + ctx.getPartition();
            case MERGE:
                boolean sourceDeleted = ctx.isDeleteSource() && Boolean.TRUE.equals(result.get("sourceDeleted"));
                return sourceDeleted ? "分区合并成功，源分区已删除" : "分区合并成功";
            case FORMAT:
                return ctx.isQuick() ? "分区快速格式化成功: " + ctx.getPartition() : "分区格式化成功: " + ctx.getPartition();
            case RESIZE:
                return "分区大小调整成功: " + ctx.getPartition();
            default:
                return actionType.getSuccessMessage();
        }
    }

    // ============ 操作执行器 ============

    private Map<String, Object> executeCheck(ActionContext ctx) {
        return diskManagerService.checkPartition(ctx.getPartition());
    }

    private Map<String, Object> executeCreate(ActionContext ctx) {
        try {
            return diskManagerService.createPartition(ctx.getPartition());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private Map<String, Object> executeDelete(ActionContext ctx) {
        try {
            return diskManagerService.deletePartition(ctx.getPartition(), ctx.isForce());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private Map<String, Object> executeMerge(ActionContext ctx) {
        try {
            return diskManagerService.mergePartitions(ctx.getSource(), ctx.getTarget(), ctx.isDeleteSource());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private Map<String, Object> executeList(ActionContext ctx) {
        return diskManagerService.listPartitions();
    }

    private Map<String, Object> executeReadData(ActionContext ctx) {
        try {
            return diskManagerService.readDiskData();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private Map<String, Object> executeSyncData(ActionContext ctx) {
        try {
            return diskManagerService.syncDiskData();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private Map<String, Object> executeFormat(ActionContext ctx) {
        try {
            return diskManagerService.formatPartition(ctx.getPartition(), ctx.isQuick());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private Map<String, Object> executeResize(ActionContext ctx) {
        try {
            return diskManagerService.resizePartition(ctx.getPartition(), ctx.getNewSize());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private Map<String, Object> executeHealth(ActionContext ctx) {
        return diskManagerService.checkHealth();
    }

    private Map<String, Object> executeClone(ActionContext ctx) {
        try {
            return diskManagerService.clonePartition(ctx.getSource(), ctx.getTarget());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
