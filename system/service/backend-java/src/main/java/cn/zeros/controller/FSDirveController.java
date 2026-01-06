package cn.zeros.controller;

import cn.zeros.constant.ErrorCode;
import cn.zeros.enums.ActionType;
import cn.zeros.exception.BusinessException;
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
 * @date 2024
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
            
            // 验证操作类型
            ActionType actionType = ActionType.getByCode(action);
            if (actionType == null) {
                throw new BusinessException(ErrorCode.UNKNOWN_ACTION);
            }
            
            log.debug("执行文件系统操作: {}", actionType.getDescription());
            
            ApiResponse<?> response;
            switch (actionType) {
                // 目录操作
                case CREATE_DIR:
                    if (path == null || name == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path, name");
                    }
                    response = ApiResponse.success("目录创建成功", fsDirveService.createDirectory(path, name));
                    break;
                    
                case DELETE_DIR:
                    if (path == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path");
                    }
                    response = ApiResponse.success("目录删除成功", fsDirveService.deleteDirectory(path));
                    break;
                    
                case DELETE_DIR_RECURSIVE:
                    if (path == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path");
                    }
                    response = ApiResponse.success("目录删除成功", fsDirveService.deleteDirectoryRecursive(path));
                    break;
                    
                case LIST_DIR:
                    if (path == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path");
                    }
                    response = ApiResponse.success("目录列表获取成功", fsDirveService.listDirectory(path));
                    break;
                    
                case RENAME_DIR:
                    if (path == null || oldName == null || newName == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path, oldName, newName");
                    }
                    response = ApiResponse.success("目录重命名成功", fsDirveService.renameDirectory(path, oldName, newName));
                    break;
                    
                case MOVE_DIR:
                    if (sourcePath == null || targetPath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath, targetPath");
                    }
                    response = ApiResponse.success("目录移动成功", fsDirveService.moveDirectory(sourcePath, targetPath));
                    break;
                    
                case COPY_DIR:
                    if (sourcePath == null || targetPath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath, targetPath");
                    }
                    response = ApiResponse.success("目录复制成功", fsDirveService.copyDirectory(sourcePath, targetPath));
                    break;
                    
                // 文件操作
                case CREATE_FILE:
                    if (path == null || fileName == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path, fileName");
                    }
                    response = ApiResponse.success("文件创建成功", fsDirveService.createFile(path, fileName, content != null ? content : ""));
                    break;
                    
                case READ_FILE:
                    if (path == null || fileName == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path, fileName");
                    }
                    response = ApiResponse.success("文件读取成功", fsDirveService.readFile(path, fileName, asBase64));
                    break;
                    
                case WRITE_FILE:
                    if (path == null || fileName == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path, fileName");
                    }
                    if (content == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: content");
                    }
                    response = ApiResponse.success("文件写入成功", fsDirveService.writeFile(path, fileName, content, writeMod, isBase64));
                    break;
                    
                case DELETE_FILE:
                    if (path == null || fileName == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path, fileName");
                    }
                    response = ApiResponse.success("文件删除成功", fsDirveService.deleteFile(path, fileName));
                    break;
                    
                case RENAME_FILE:
                    if (path == null || oldFileName == null || newFileName == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path, oldFileName, newFileName");
                    }
                    response = ApiResponse.success("文件重命名成功", fsDirveService.renameFile(path, oldFileName, newFileName));
                    break;
                    
                case MOVE_FILE:
                    if (sourcePath == null || sourceFileName == null || targetPath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath, sourceFileName, targetPath");
                    }
                    response = ApiResponse.success("文件移动成功", fsDirveService.moveFile(sourcePath, sourceFileName, targetPath, targetFileName));
                    break;
                    
                case COPY_FILE:
                    if (sourcePath == null || sourceFileName == null || targetPath == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: sourcePath, sourceFileName, targetPath");
                    }
                    response = ApiResponse.success("文件复制成功", fsDirveService.copyFile(sourcePath, sourceFileName, targetPath, targetFileName));
                    break;
                    
                case GET_FILE_INFO:
                    if (path == null || fileName == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path, fileName");
                    }
                    response = ApiResponse.success("文件信息获取成功", fsDirveService.getFileInfo(path, fileName));
                    break;
                    
                // 其他操作
                case EXISTS:
                    if (path == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: path");
                    }
                    response = ApiResponse.success("路径检查完成", fsDirveService.checkPathExists(path));
                    break;
                    
                case GET_DISK_INFO:
                    if (disk == null) {
                        throw new BusinessException(ErrorCode.PARAM_MISSING, "缺少必要参数: disk");
                    }
                    response = ApiResponse.success("磁盘信息获取成功", fsDirveService.getDiskInfo(disk));
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

