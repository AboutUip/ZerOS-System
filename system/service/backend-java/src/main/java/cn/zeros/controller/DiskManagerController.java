package cn.zeros.controller;

import cn.zeros.enums.DiskManagerActionType;
import cn.zeros.model.ActionContext;
import cn.zeros.model.ApiResponse;
import cn.zeros.service.IDiskManagerService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.Map;

/**
 * 磁盘管理控制器。
 *
 * <p>提供 DISKMANAGER 兼容接口，负责将 action 参数分发给磁盘服务层，并保持 PHP 端已有的
 * write_data 禁用语义。
 *
 * @author zeros
 */
@Slf4j
@RestController
@RequestMapping("/DISKMANAGER")
public class DiskManagerController {

    private final IDiskManagerService diskManagerService;
    private final Map<DiskManagerActionType, DiskActionExecutor> executors;

    public DiskManagerController(IDiskManagerService diskManagerService) {
        this.diskManagerService = diskManagerService;
        this.executors = initExecutors();
    }

    private Map<DiskManagerActionType, DiskActionExecutor> initExecutors() {
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

        DiskManagerActionType actionType = DiskManagerActionType.getByCode(action);
        if (actionType == null) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("Unknown action: " + action
                            + " (supported: check, create, delete, merge, list, read_data, write_data, sync_data, format, resize, health, clone)"));
        }
        if (actionType == DiskManagerActionType.WRITE_DATA) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.error("write_data is not allowed through API"));
        }

        ActionContext ctx = ActionContext.builder()
                .partition(partition)
                .source(source)
                .target(target)
                .force(force)
                .deleteSource(deleteSource)
                .quick(quick)
                .newSize(newSize)
                .build();

        String validationError = actionType.validate(ctx);
        if (validationError != null) {
            return ResponseEntity.badRequest().body(ApiResponse.error(validationError));
        }

        try {
            log.info("[DiskManager] action={}", actionType.getCode());
            DiskActionExecutor executor = executors.get(actionType);
            Map<String, Object> result = executor.execute(ctx);
            return ResponseEntity.ok(ApiResponse.success(buildSuccessMessage(actionType, ctx, result), result));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    private String buildSuccessMessage(DiskManagerActionType actionType, ActionContext ctx, Map<String, Object> result) {
        return switch (actionType) {
            case DELETE -> ctx.isForce() ? "Partition force deleted: " + ctx.getPartition() : "Partition deleted: " + ctx.getPartition();
            case MERGE -> ctx.isDeleteSource() && Boolean.TRUE.equals(result.get("sourceDeleted"))
                    ? "Partitions merged and source deleted"
                    : "Partitions merged";
            case FORMAT -> ctx.isQuick() ? "Partition quick formatted: " + ctx.getPartition() : "Partition formatted: " + ctx.getPartition();
            case RESIZE -> "Partition resized: " + ctx.getPartition();
            default -> actionType.getSuccessMessage();
        };
    }

    private Map<String, Object> executeCheck(ActionContext ctx) {
        return diskManagerService.checkPartition(ctx.getPartition());
    }

    private Map<String, Object> executeCreate(ActionContext ctx) throws IOException {
        return diskManagerService.createPartition(ctx.getPartition());
    }

    private Map<String, Object> executeDelete(ActionContext ctx) throws IOException {
        return diskManagerService.deletePartition(ctx.getPartition(), ctx.isForce());
    }

    private Map<String, Object> executeMerge(ActionContext ctx) throws IOException {
        return diskManagerService.mergePartitions(ctx.getSource(), ctx.getTarget(), ctx.isDeleteSource());
    }

    private Map<String, Object> executeList(ActionContext ctx) {
        return diskManagerService.listPartitions();
    }

    private Map<String, Object> executeReadData(ActionContext ctx) throws IOException {
        return diskManagerService.readDiskData();
    }

    private Map<String, Object> executeSyncData(ActionContext ctx) throws IOException {
        return diskManagerService.syncDiskData();
    }

    private Map<String, Object> executeFormat(ActionContext ctx) throws IOException {
        return diskManagerService.formatPartition(ctx.getPartition(), ctx.isQuick());
    }

    private Map<String, Object> executeResize(ActionContext ctx) throws IOException {
        return diskManagerService.resizePartition(ctx.getPartition(), ctx.getNewSize());
    }

    private Map<String, Object> executeHealth(ActionContext ctx) {
        return diskManagerService.checkHealth();
    }

    private Map<String, Object> executeClone(ActionContext ctx) throws IOException {
        return diskManagerService.clonePartition(ctx.getSource(), ctx.getTarget());
    }

    @FunctionalInterface
    private interface DiskActionExecutor {
        Map<String, Object> execute(ActionContext ctx) throws IOException;
    }
}
