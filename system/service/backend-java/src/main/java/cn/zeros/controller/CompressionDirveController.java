package cn.zeros.controller;

import cn.zeros.enums.CompressionActionType;
import cn.zeros.exception.BusinessException;
import cn.zeros.constant.ErrorCode;
import cn.zeros.model.ActionContext;
import cn.zeros.model.ApiResponse;
import cn.zeros.service.ICompressionDirveService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 压缩驱动控制器
 * 使用函数式映射替代 switch 语句，代码更简洁
 *
 * @author zeros
 * @date 2026-01-16
 */
@RestController
@RequestMapping("/CompressionDirve")
@Slf4j
public class CompressionDirveController {

    private final ICompressionDirveService compressionService;
    private final Map<CompressionActionType, Function<ActionContext, Map<String, Object>>> executors;

    public CompressionDirveController(ICompressionDirveService compressionService) {
        this.compressionService = compressionService;
        this.executors = initExecutors();
    }

    /**
     * 初始化操作执行器映射
     */
    private Map<CompressionActionType, Function<ActionContext, Map<String, Object>>> initExecutors() {
        return Map.ofEntries(
                // ZIP 操作
                Map.entry(CompressionActionType.COMPRESS_ZIP, this::executeCompressZip),
                Map.entry(CompressionActionType.EXTRACT_ZIP, this::executeExtractZip),
                Map.entry(CompressionActionType.LIST_ZIP, this::executeListZip),

                // 加密 ZIP 操作
                Map.entry(CompressionActionType.COMPRESS_ZIP_ENCRYPTED, this::executeCompressZipEncrypted),
                Map.entry(CompressionActionType.EXTRACT_ZIP_ENCRYPTED, this::executeExtractZipEncrypted),

                // RAR 操作
                Map.entry(CompressionActionType.COMPRESS_RAR, this::executeCompressRar),
                Map.entry(CompressionActionType.EXTRACT_RAR, this::executeExtractRar),
                Map.entry(CompressionActionType.LIST_RAR, this::executeListRar),

                // 7Z 操作
                Map.entry(CompressionActionType.COMPRESS_7Z, this::executeCompress7z),
                Map.entry(CompressionActionType.EXTRACT_7Z, this::executeExtract7z),
                Map.entry(CompressionActionType.LIST_7Z, this::executeList7z),

                // TAR 操作
                Map.entry(CompressionActionType.COMPRESS_TAR, this::executeCompressTar),
                Map.entry(CompressionActionType.EXTRACT_TAR, this::executeExtractTar),
                Map.entry(CompressionActionType.LIST_TAR, this::executeListTar),

                // TAR.GZ 操作
                Map.entry(CompressionActionType.COMPRESS_TARGZ, this::executeCompressTarGz),
                Map.entry(CompressionActionType.EXTRACT_TARGZ, this::executeExtractTarGz),
                Map.entry(CompressionActionType.LIST_TARGZ, this::executeListTarGz),

                // 其他
                Map.entry(CompressionActionType.CHECK_SUPPORT, this::executeCheckSupport)
        );
    }

    @RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<ApiResponse<?>> handleRequest(
            @RequestParam String action,
            @RequestParam(required = false) String sourcePath,
            @RequestParam(required = false) String targetPath,
            @RequestBody(required = false) Map<String, Object> requestBody) {

        // 构建上下文
        ActionContext ctx = buildContext(sourcePath, targetPath, requestBody);

        // 验证操作类型
        CompressionActionType actionType = CompressionActionType.getByCode(action);
        if (actionType == null) {
            throw new BusinessException(ErrorCode.UNKNOWN_ACTION);
        }

        log.info("执行压缩操作: {}", actionType.getDescription());

        // 验证参数
        actionType.validate(ctx);

        // 执行操作
        Function<ActionContext, Map<String, Object>> executor = executors.get(actionType);
        if (executor == null) {
            throw new BusinessException(ErrorCode.UNKNOWN_ACTION);
        }

        Map<String, Object> result = executor.apply(ctx);
        return ResponseEntity.ok(ApiResponse.success(actionType.getSuccessMessage(), result));
    }

    /**
     * 构建动作上下文
     */
    private ActionContext buildContext(String sourcePath, String targetPath, Map<String, Object> requestBody) {
        String finalSourcePath = sourcePath;
        String finalTargetPath = targetPath;
        List<String> sourcePaths = null;
        Map<String, Object> options = null;

        if (requestBody != null) {
            if (requestBody.containsKey("sourcePath") && finalSourcePath == null) {
                finalSourcePath = (String) requestBody.get("sourcePath");
            }
            if (requestBody.containsKey("targetPath") && finalTargetPath == null) {
                finalTargetPath = (String) requestBody.get("targetPath");
            }
            if (requestBody.containsKey("sourcePaths")) {
                @SuppressWarnings("unchecked")
                List<String> sps = (List<String>) requestBody.get("sourcePaths");
                sourcePaths = sps;
            }
            if (requestBody.containsKey("options")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> opts = (Map<String, Object>) requestBody.get("options");
                options = opts;
            }
        }

        return ActionContext.builder()
                .sourcePath(finalSourcePath)
                .targetPath(finalTargetPath)
                .sourcePaths(sourcePaths)
                .options(options)
                .build();
    }

    // ============ ZIP 操作执行器 ============

    private Map<String, Object> executeCompressZip(ActionContext ctx) {
        try {
            return compressionService.compressZip(ctx.getTargetPath(), ctx.getSourcePath(),
                    ctx.getSourcePaths(), ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeExtractZip(ActionContext ctx) {
        try {
            return compressionService.extractZip(ctx.getSourcePath(), ctx.getTargetPath(),
                    ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeListZip(ActionContext ctx) {
        try {
            return compressionService.listZip(ctx.getSourcePath());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    // ============ 加密 ZIP 操作执行器 ============

    private Map<String, Object> executeCompressZipEncrypted(ActionContext ctx) {
        try {
            return compressionService.compressZipEncrypted(ctx.getTargetPath(), ctx.getSourcePath(),
                    ctx.getSourcePaths(), ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeExtractZipEncrypted(ActionContext ctx) {
        try {
            return compressionService.extractZipEncrypted(ctx.getSourcePath(), ctx.getTargetPath(),
                    ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    // ============ RAR 操作执行器 ============

    private Map<String, Object> executeCompressRar(ActionContext ctx) {
        try {
            return compressionService.compressRar(ctx.getSourcePath(), ctx.getTargetPath(),
                    ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeExtractRar(ActionContext ctx) {
        try {
            return compressionService.extractRar(ctx.getSourcePath(), ctx.getTargetPath(),
                    ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeListRar(ActionContext ctx) {
        try {
            return compressionService.listRar(ctx.getSourcePath());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    // ============ 7Z 操作执行器 ============

    private Map<String, Object> executeCompress7z(ActionContext ctx) {
        try {
            return compressionService.compress7z(ctx.getTargetPath(), ctx.getSourcePath(),
                    ctx.getSourcePaths(), ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeExtract7z(ActionContext ctx) {
        try {
            return compressionService.extract7z(ctx.getSourcePath(), ctx.getTargetPath(),
                    ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeList7z(ActionContext ctx) {
        try {
            return compressionService.list7z(ctx.getSourcePath());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    // ============ TAR 操作执行器 ============

    private Map<String, Object> executeCompressTar(ActionContext ctx) {
        try {
            return compressionService.compressTar(ctx.getTargetPath(), ctx.getSourcePath(),
                    ctx.getSourcePaths(), ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeExtractTar(ActionContext ctx) {
        try {
            return compressionService.extractTar(ctx.getSourcePath(), ctx.getTargetPath(),
                    ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeListTar(ActionContext ctx) {
        try {
            return compressionService.listTar(ctx.getSourcePath());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    // ============ TAR.GZ 操作执行器 ============

    private Map<String, Object> executeCompressTarGz(ActionContext ctx) {
        try {
            return compressionService.compressTarGz(ctx.getTargetPath(), ctx.getSourcePath(),
                    ctx.getSourcePaths(), ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeExtractTarGz(ActionContext ctx) {
        try {
            return compressionService.extractTarGz(ctx.getSourcePath(), ctx.getTargetPath(),
                    ctx.getOptionsOrEmpty());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> executeListTarGz(ActionContext ctx) {
        try {
            return compressionService.listTarGz(ctx.getSourcePath());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    // ============ 其他操作执行器 ============

    private Map<String, Object> executeCheckSupport(ActionContext ctx) {
        return compressionService.checkSupport();
    }

    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> handleOptions() {
        return ResponseEntity.ok().build();
    }
}
