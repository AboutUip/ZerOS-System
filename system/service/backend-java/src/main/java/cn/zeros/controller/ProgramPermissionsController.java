package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.BootSecurityTokenService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 程序权限声明控制器。
 *
 * <p>维护 BootSecurityToken.json 中的 programPermissionsMap，供 UserToken 请求在
 * {@code JwtAuthInterceptor} 中按 upid 校验程序声明权限。
 *
 * @author zeros
 */
@Slf4j
@RestController
@RequestMapping("/programPermissions")
@RequiredArgsConstructor
public class ProgramPermissionsController {

    private final BootSecurityTokenService bootSecurityTokenService;

    @RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleRequest(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String upid,
            @RequestBody(required = false) Map<String, Object> body) {

        if (body != null) {
            if (action == null) action = asString(body.get("action"));
            if (upid == null) upid = asString(body.get("upid"));
        }

        log.info("[ProgramPermissions] action={}", action);
        if ("register".equals(action)) {
            return handleRegister(body);
        }
        if ("reclaim".equals(action)) {
            return handleReclaim(upid, body);
        }
        if ("update".equals(action)) {
            return handleUpdate(upid, body);
        }

        return ResponseEntity.badRequest().body(ApiResponse.error("Invalid action"));
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> handleRegister(Map<String, Object> body) {
        if (body == null || !(body.get("permissions") instanceof List<?> rawPermissions)) {
            return ResponseEntity.badRequest().body(ApiResponse.error("permissions must be an array"));
        }

        List<String> permissions = rawPermissions.stream().map(Object::toString).toList();
        String programName = asString(body.get("programName"));
        String upid = bootSecurityTokenService.registerProgramPermission(programName, permissions);
        if (upid == null) {
            return ResponseEntity.internalServerError().body(ApiResponse.error("写入安全令牌文件失败"));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("upid", upid);
        return ResponseEntity.ok(ApiResponse.success("Permissions registered", data));
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> handleReclaim(String upid, Map<String, Object> body) {
        if ((upid == null || upid.isBlank()) && body != null) {
            upid = asString(body.get("upid"));
        }
        if (upid == null || upid.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Missing upid"));
        }

        boolean ok = bootSecurityTokenService.reclaimUpid(upid.trim());
        if (!ok) {
            return ResponseEntity.internalServerError().body(ApiResponse.error("写入安全令牌文件失败"));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("upid", upid.trim());
        return ResponseEntity.ok(ApiResponse.success("upid reclaimed", data));
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> handleUpdate(String upid, Map<String, Object> body) {
        if ((upid == null || upid.isBlank()) && body != null) {
            upid = asString(body.get("upid"));
        }

        Object permissionsObj = body != null ? body.get("permissions") : null;
        if (upid == null || upid.isBlank() || !(permissionsObj instanceof List<?> rawPermissions)) {
            return ResponseEntity.badRequest().body(ApiResponse.error("upid and permissions are required"));
        }

        List<String> permissions = rawPermissions.stream().map(Object::toString).toList();
        boolean ok = bootSecurityTokenService.updateProgramPermissions(upid.trim(), permissions);
        if (!ok) {
            return ResponseEntity.internalServerError().body(ApiResponse.error("写入安全令牌文件失败"));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("upid", upid.trim());
        return ResponseEntity.ok(ApiResponse.success("Permissions updated", data));
    }

    private String asString(Object value) {
        return value != null ? value.toString() : null;
    }
}
