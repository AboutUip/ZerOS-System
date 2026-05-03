package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.NodeLibService;
import cn.zeros.util.SystemTokenGuard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Node 脚本执行控制器。
 *
 * <p>仅允许 SystemToken 调用，scriptId 白名单和命令执行细节由 {@link NodeLibService} 统一处理，
 * 避免接口层暴露任意命令执行能力。
 *
 * @author zeros
 */
@Slf4j
@RestController
@RequestMapping("/nodeLibExec")
@RequiredArgsConstructor
public class NodeLibExecController {

    private final NodeLibService nodeLibService;

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> execute(@RequestBody(required = false) Map<String, Object> body)
            throws Exception {
        SystemTokenGuard.requireSystemToken();
        String scriptId = body != null && body.get("scriptId") != null ? body.get("scriptId").toString().trim() : "";
        log.info("[NodeLibExec] scriptId={}", scriptId);
        Map<String, Object> data = nodeLibService.executeScript(scriptId);
        return ResponseEntity.ok(ApiResponse.success("Node 脚本执行完成", data));
    }

    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> options() {
        return ResponseEntity.ok().build();
    }
}
