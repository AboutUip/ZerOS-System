package cn.zeros.controller;

import cn.zeros.constant.ErrorCode;
import cn.zeros.enums.ActionType;
import cn.zeros.exception.BusinessException;
import cn.zeros.model.ActionContext;
import cn.zeros.model.ApiResponse;
import cn.zeros.service.IFSDirveService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 文件系统驱动控制器
 * 
 * @author zeros
 * @date 2026-01-16
 */
@RestController
@RequestMapping("/FSDirve")
@Slf4j
public class FSDirveController {
    
    private final IFSDirveService fsDirveService;
    
    public FSDirveController(IFSDirveService fsDirveService) {
        this.fsDirveService = fsDirveService;
    }

    @RequestMapping(method = {RequestMethod.OPTIONS, RequestMethod.POST, RequestMethod.GET})
    public ResponseEntity<ApiResponse<?>> handleRequest(
            @RequestParam String action,
            @RequestParam(required = false) String path,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String oldName,
            @RequestParam(required = false) String newName,
            @RequestParam(required = false) String sourcePath,
            @RequestParam(required = false) String targetPath,
            @RequestParam(required = false) String fileName,
            @RequestParam(required = false) String oldFileName,
            @RequestParam(required = false) String newFileName,
            @RequestParam(required = false) String sourceFileName,
            @RequestParam(required = false) String targetFileName,
            @RequestParam(required = false) String writeMod,
            @RequestParam(required = false, defaultValue = "false") boolean asBase64,
            @RequestParam(required = false, defaultValue = "false") boolean isBase64,
            @RequestParam(required = false) String content,
            @RequestParam(required = false) String disk,
            @RequestBody(required = false) Map<String, Object> requestBody) throws Exception {
        
        // 从 POST body 中获取 content 和 isBase64
        if (requestBody != null) {
            if (requestBody.containsKey("content") && (content == null || content.isEmpty())) {
                content = (String) requestBody.get("content");
            }
            if (requestBody.containsKey("isBase64")) {
                Object isBase64Obj = requestBody.get("isBase64");
                if (isBase64Obj instanceof Boolean) {
                    isBase64 = (Boolean) isBase64Obj;
                } else if (isBase64Obj instanceof String) {
                    isBase64 = "true".equalsIgnoreCase((String) isBase64Obj) || "1".equals(isBase64Obj);
                }
            }
        }
        
        // 构建上下文
        ActionContext context = ActionContext.builder()
                .path(path)
                .name(name)
                .oldName(oldName)
                .newName(newName)
                .sourcePath(sourcePath)
                .targetPath(targetPath)
                .fileName(fileName)
                .oldFileName(oldFileName)
                .newFileName(newFileName)
                .sourceFileName(sourceFileName)
                .targetFileName(targetFileName)
                .writeMod(writeMod)
                .asBase64(asBase64)
                .isBase64(isBase64)
                .content(content)
                .disk(disk)
                .build();
            
        // 获取并验证操作类型
        ActionType actionType = ActionType.getByCode(action);
        if (actionType == null) {
            throw new BusinessException(ErrorCode.UNKNOWN_ACTION);
        }
        
        log.debug("执行文件系统操作: {}", actionType.getDescription());
        
        // 验证参数
        actionType.validate(context);
        
        // 执行操作
        Map<String, Object> result = actionType.execute(fsDirveService, context);
        
        // 返回结果
        return ResponseEntity.ok(ApiResponse.success(actionType.getSuccessMessage(), result));
    }
    
    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> handleOptions() {
        return ResponseEntity.ok().build();
    }
}
