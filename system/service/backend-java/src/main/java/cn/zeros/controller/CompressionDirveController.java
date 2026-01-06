package cn.zeros.controller;

import cn.zeros.enums.CompressionActionType;
import cn.zeros.exception.BusinessException;
import cn.zeros.constant.ErrorCode;
import cn.zeros.model.ApiResponse;
import cn.zeros.service.ICompressionDirveService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 压缩驱动控制器
 * 
 * @author zeros
 * @date 2024
 */
@RestController
@RequestMapping("/CompressionDirve")
@Slf4j
public class CompressionDirveController {
    
    private final ICompressionDirveService compressionDirveService;
    
    public CompressionDirveController(ICompressionDirveService compressionDirveService) {
        this.compressionDirveService = compressionDirveService;
    }
    
    @GetMapping
    @PostMapping
    public ResponseEntity<ApiResponse<?>> handleRequest(
            @RequestParam String action,
            @RequestParam(required = false) String sourcePath,
            @RequestParam(required = false) String targetPath,
            @RequestBody(required = false) Map<String, Object> requestBody) throws Exception {
        
        ApiResponse<?> response;
            
            // 从 requestBody 中提取参数
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
            
            // 验证操作类型
            CompressionActionType actionType = CompressionActionType.getByCode(action);
            if (actionType == null) {
                throw new BusinessException(ErrorCode.UNKNOWN_ACTION);
            }
            
            log.debug("执行压缩操作: {}", actionType.getDescription());
            
            switch (actionType) {
                case COMPRESS_ZIP:
                    if (finalTargetPath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: targetPath");
                    }
                    response = ApiResponse.success("ZIP 压缩成功", 
                            compressionDirveService.compressZip(finalTargetPath, finalSourcePath, sourcePaths, options != null ? options : Map.of()));
                    break;
                    
                case EXTRACT_ZIP:
                    if (finalSourcePath == null || finalTargetPath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath, targetPath");
                    }
                    response = ApiResponse.success("ZIP 解压缩成功",
                            compressionDirveService.extractZip(finalSourcePath, finalTargetPath, options != null ? options : Map.of()));
                    break;
                    
                case LIST_ZIP:
                    if (finalSourcePath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath");
                    }
                    response = ApiResponse.success("ZIP 列表获取成功",
                            compressionDirveService.listZip(finalSourcePath));
                    break;
                    
                case EXTRACT_RAR:
                    if (finalSourcePath == null || finalTargetPath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath, targetPath");
                    }
                    response = ApiResponse.success("RAR 解压缩成功",
                            compressionDirveService.extractRar(finalSourcePath, finalTargetPath, options != null ? options : Map.of()));
                    break;
                    
                case COMPRESS_RAR:
                    if (finalSourcePath == null || finalTargetPath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath, targetPath");
                    }
                    response = ApiResponse.success("RAR 压缩成功",
                            compressionDirveService.compressRar(finalSourcePath, finalTargetPath, options != null ? options : Map.of()));
                    break;
                    
                case LIST_RAR:
                    if (finalSourcePath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath");
                    }
                    response = ApiResponse.success("RAR 列表获取成功",
                            compressionDirveService.listRar(finalSourcePath));
                    break;
                    
                case CHECK_SUPPORT:
                    response = ApiResponse.success("支持检查完成",
                            compressionDirveService.checkSupport());
                    break;
                    
                default:
                    throw new BusinessException(ErrorCode.UNKNOWN_ACTION);
            }
            
            return ResponseEntity.ok(response);
    }
    
    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> handleOptions() {
        return ResponseEntity.ok().build();
    }
}

