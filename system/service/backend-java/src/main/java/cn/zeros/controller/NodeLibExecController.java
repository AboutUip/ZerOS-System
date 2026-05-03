package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.NodeLibService;
import cn.zeros.util.SystemTokenGuard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

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
        return ResponseEntity.ok(ApiResponse.success("Node script executed", data));
    }

    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> options() {
        return ResponseEntity.ok().build();
    }
}
