package cn.zeros.controller;

import cn.zeros.enums.CompressionActionType;
import cn.zeros.exception.BusinessException;
import cn.zeros.constant.ErrorCode;
import cn.zeros.model.ActionContext;
import cn.zeros.model.ApiResponse;
import cn.zeros.service.ICompressionDirveService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.function.Function;

/**
 * 压缩驱动控制器。
 *
 * <p>保持与 PHP 端 CompressionDirve 参数风格兼容，同时通过动作映射集中分发压缩、解压和列表操作。
 *
 * @author zeros
 */
@RestController
@RequestMapping("/CompressionDirve")
@Slf4j
public class CompressionDirveController {

    private final ICompressionDirveService compressionService;
    private final Map<CompressionActionType, Function<ActionContext, Map<String, Object>>> executors;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

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
            @RequestParam(required = false) String sourcePaths,
            @RequestParam(required = false) String exclude,
            @RequestParam(required = false) Integer compressionLevel,
            @RequestParam(required = false) String files,
            @RequestParam(required = false) Boolean overwrite,
            @RequestParam(required = false) String password,
            @RequestBody(required = false) Map<String, Object> requestBody) {

        // 构建上下文
        ActionContext ctx = buildContext(sourcePath, targetPath, sourcePaths, exclude,
                compressionLevel, files, overwrite, password, requestBody);

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
    private ActionContext buildContext(String sourcePath,
                                       String targetPath,
                                       String sourcePathsQuery,
                                       String exclude,
                                       Integer compressionLevel,
                                       String files,
                                       Boolean overwrite,
                                       String password,
                                       Map<String, Object> requestBody) {
        String finalSourcePath = sourcePath;
        String finalTargetPath = targetPath;
        List<String> sourcePaths = null;
        Map<String, Object> options = new LinkedHashMap<>();

        if (requestBody != null) {
            if (requestBody.containsKey("sourcePath") && finalSourcePath == null) {
                finalSourcePath = (String) requestBody.get("sourcePath");
            }
            if (requestBody.containsKey("targetPath") && finalTargetPath == null) {
                finalTargetPath = (String) requestBody.get("targetPath");
            }
            if (requestBody.containsKey("sourcePaths")) {
                sourcePaths = toStringList(requestBody.get("sourcePaths"));
            }
            if (requestBody.containsKey("options")) {
                options.putAll(toObjectMap(requestBody.get("options")));
            }
        }

        if (sourcePaths == null && sourcePathsQuery != null && !sourcePathsQuery.isBlank()) {
            sourcePaths = parseStringList(sourcePathsQuery);
        }
        if (exclude != null && !exclude.isBlank()) {
            options.put("exclude", parseStringList(exclude));
        }
        if (compressionLevel != null) {
            options.put("compressionLevel", compressionLevel);
        }
        if (files != null && !files.isBlank()) {
            options.put("files", parseStringList(files));
        }
        if (overwrite != null) {
            options.put("overwrite", overwrite);
        }
        if (password != null) {
            options.put("password", password);
        }

        return ActionContext.builder()
                .sourcePath(finalSourcePath)
                .targetPath(finalTargetPath)
                .sourcePaths(sourcePaths)
                .options(options.isEmpty() ? null : options)
                .build();
    }

    private List<String> parseStringList(String raw) {
        String value = raw.trim();
        if (value.startsWith("[") && value.endsWith("]")) {
            try {
                List<Object> parsed = OBJECT_MAPPER.readValue(value, new TypeReference<>() {});
                return parsed.stream().map(Object::toString).toList();
            } catch (JsonProcessingException e) {
                log.debug("列表参数不是合法 JSON 数组，按逗号分隔处理: {}", raw);
            }
        }
        List<String> result = new ArrayList<>();
        for (String part : value.split(",")) {
            String item = part.trim();
            if (!item.isEmpty()) {
                result.add(item);
            }
        }
        return result;
    }

    private List<String> toStringList(Object value) {
        if (!(value instanceof List<?> rawList)) {
            return null;
        }
        return rawList.stream().map(Object::toString).toList();
    }

    private Map<String, Object> toObjectMap(Object value) {
        if (!(value instanceof Map<?, ?> rawMap)) {
            return Map.of();
        }

        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
            if (entry.getKey() != null) {
                result.put(entry.getKey().toString(), entry.getValue());
            }
        }
        return result;
    }

    // ============ ZIP 操作执行器 ============

    private Map<String, Object> executeCompressZip(ActionContext ctx) {
        return executeCompression(() -> compressionService.compressZip(ctx.getTargetPath(), ctx.getSourcePath(),
                ctx.getSourcePaths(), ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeExtractZip(ActionContext ctx) {
        return executeCompression(() -> compressionService.extractZip(ctx.getSourcePath(), ctx.getTargetPath(),
                ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeListZip(ActionContext ctx) {
        return executeCompression(() -> compressionService.listZip(ctx.getSourcePath()));
    }

    // ============ 加密 ZIP 操作执行器 ============

    private Map<String, Object> executeCompressZipEncrypted(ActionContext ctx) {
        return executeCompression(() -> compressionService.compressZipEncrypted(ctx.getTargetPath(), ctx.getSourcePath(),
                ctx.getSourcePaths(), ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeExtractZipEncrypted(ActionContext ctx) {
        return executeCompression(() -> compressionService.extractZipEncrypted(ctx.getSourcePath(), ctx.getTargetPath(),
                ctx.getOptionsOrEmpty()));
    }

    // ============ RAR 操作执行器 ============

    private Map<String, Object> executeCompressRar(ActionContext ctx) {
        return executeCompression(() -> compressionService.compressRar(ctx.getSourcePath(), ctx.getTargetPath(),
                ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeExtractRar(ActionContext ctx) {
        return executeCompression(() -> compressionService.extractRar(ctx.getSourcePath(), ctx.getTargetPath(),
                ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeListRar(ActionContext ctx) {
        return executeCompression(() -> compressionService.listRar(ctx.getSourcePath()));
    }

    // ============ 7Z 操作执行器 ============

    private Map<String, Object> executeCompress7z(ActionContext ctx) {
        return executeCompression(() -> compressionService.compress7z(ctx.getTargetPath(), ctx.getSourcePath(),
                ctx.getSourcePaths(), ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeExtract7z(ActionContext ctx) {
        return executeCompression(() -> compressionService.extract7z(ctx.getSourcePath(), ctx.getTargetPath(),
                ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeList7z(ActionContext ctx) {
        return executeCompression(() -> compressionService.list7z(ctx.getSourcePath()));
    }

    // ============ TAR 操作执行器 ============

    private Map<String, Object> executeCompressTar(ActionContext ctx) {
        return executeCompression(() -> compressionService.compressTar(ctx.getTargetPath(), ctx.getSourcePath(),
                ctx.getSourcePaths(), ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeExtractTar(ActionContext ctx) {
        return executeCompression(() -> compressionService.extractTar(ctx.getSourcePath(), ctx.getTargetPath(),
                ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeListTar(ActionContext ctx) {
        return executeCompression(() -> compressionService.listTar(ctx.getSourcePath()));
    }

    // ============ TAR.GZ 操作执行器 ============

    private Map<String, Object> executeCompressTarGz(ActionContext ctx) {
        return executeCompression(() -> compressionService.compressTarGz(ctx.getTargetPath(), ctx.getSourcePath(),
                ctx.getSourcePaths(), ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeExtractTarGz(ActionContext ctx) {
        return executeCompression(() -> compressionService.extractTarGz(ctx.getSourcePath(), ctx.getTargetPath(),
                ctx.getOptionsOrEmpty()));
    }

    private Map<String, Object> executeListTarGz(ActionContext ctx) {
        return executeCompression(() -> compressionService.listTarGz(ctx.getSourcePath()));
    }

    // ============ 其他操作执行器 ============

    private Map<String, Object> executeCheckSupport(ActionContext ctx) {
        return compressionService.checkSupport();
    }

    private Map<String, Object> executeCompression(Callable<Map<String, Object>> operation) {
        try {
            return operation.call();
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, e.getMessage());
        }
    }

    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> handleOptions() {
        return ResponseEntity.ok().build();
    }
}
