package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.BootSecurityTokenService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 程序权限注册服务控制器（对应 PHP 端的 programPermissions.php）
 *
 * <p>功能说明：
 * 由 ProcessManager（进程管理器）在启动程序时调用，为每个程序注册其声明的权限，
 * 并分配一个唯一的 upid（用户进程 ID，32 位十六进制字符串）。
 * upid 随后用于 JWT 鉴权时的权限校验（JwtAuthInterceptor 中使用）。
 *
 * <p>操作类型：
 * <ul>
 *   <li>register — 注册程序权限，返回分配的 upid</li>
 *   <li>reclaim  — 回收 upid（程序退出时调用，从 programPermissionsMap 中移除）</li>
 * </ul>
 *
 * <p>upid 生成算法（与 PHP 保持一致）：
 * 2 个随机 16 位数 + programName(UTF-8) → 分别 SHA-256 → 随机顺序拼接 → MD5 得到 32 位 hex
 *
 * <p>数据存储：写入 DISK/D/BootSecurityToken.json 的 programPermissionsMap 字段
 *
 * <p>此接口需要 JWT 认证（SystemToken 直接放行，UserToken 需携带 upid）
 *
 * <p>调用方：kernel/processManager/ProcessManager.js
 *
 * @author zeros
 */
@Slf4j
@RestController
@RequestMapping("/programPermissions")
@RequiredArgsConstructor
public class ProgramPermissionsController {

    private final BootSecurityTokenService bootSecurityTokenService;

    /**
     * 统一入口：同时支持 GET 和 POST
     *
     * @param action 操作类型：register（注册）/ reclaim（回收）
     * @param upid   用户进程 ID（回收时必填）
     * @param body   POST 请求体（JSON 格式），包含 permissions[] 和 programName 等字段
     */
    @RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleRequest(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String upid,
            @RequestBody(required = false) Map<String, Object> body) {

        log.info("[ProgramPermissions] action={}", action);
        // POST body 作为参数补充
        if (body != null) {
            if (action == null) action = (String) body.get("action");
            if (upid == null) upid = (String) body.get("upid");
        }

        if ("register".equals(action)) {
            return handleRegister(body);
        }

        if ("reclaim".equals(action)) {
            return handleReclaim(upid, body);
        }

        return ResponseEntity.badRequest()
                .body(ApiResponse.error("无效的 action"));
    }

    /**
     * 注册程序权限：接收权限列表和程序名，生成 upid 并写入安全文件
     *
     * @param body 请求体，必须包含 permissions（权限数组）和 programName（程序名称）
     */
    private ResponseEntity<ApiResponse<Map<String, Object>>> handleRegister(Map<String, Object> body) {
        if (body == null) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("缺少请求体"));
        }

        Object permObj = body.get("permissions");
        if (!(permObj instanceof List)) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("permissions 必须为数组"));
        }

        List<String> permissions = ((List<?>) permObj).stream()
                .map(Object::toString)
                .toList();

        String programName = (String) body.get("programName");

        // 生成 upid 并将 {upid: permissions[]} 写入 BootSecurityToken.json
        String upid = bootSecurityTokenService.registerProgramPermission(programName, permissions);
        if (upid == null) {
            return ResponseEntity.internalServerError()
                    .body(ApiResponse.error("写入安全文件失败"));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("upid", upid);
        return ResponseEntity.ok(ApiResponse.success("权限注册成功", data));
    }

    /**
     * 回收 upid：程序退出时，从 programPermissionsMap 中删除对应记录
     *
     * @param upid 要回收的用户进程 ID
     * @param body 备选参数来源（POST body 中也可以传 upid）
     */
    private ResponseEntity<ApiResponse<Map<String, Object>>> handleReclaim(String upid, Map<String, Object> body) {
        if (upid == null && body != null) {
            upid = (String) body.get("upid");
        }

        if (upid == null || upid.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("缺少 upid 参数"));
        }

        boolean ok = bootSecurityTokenService.reclaimUpid(upid);
        if (!ok) {
            return ResponseEntity.internalServerError()
                    .body(ApiResponse.error("写入安全文件失败"));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("upid", upid);
        return ResponseEntity.ok(ApiResponse.success("upid 已回收", data));
    }
}
