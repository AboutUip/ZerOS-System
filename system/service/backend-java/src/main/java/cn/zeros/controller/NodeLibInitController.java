package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.NodeLibService;
import cn.zeros.util.SystemTokenGuard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/nodeLibInit")
@RequiredArgsConstructor
public class NodeLibInitController {

    private final NodeLibService nodeLibService;

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> initialize(@RequestBody(required = false) Map<String, Object> body)
            throws Exception {
        SystemTokenGuard.requireSystemToken();
        Object packagesObj = body != null ? body.get("packages") : null;
        List<?> packages = packagesObj instanceof List<?> list ? list : List.of();
        log.info("[NodeLibInit] packages={}", packages);
        Map<String, Object> data = nodeLibService.initializePackages(packages);
        return ResponseEntity.ok(ApiResponse.success("Node packages initialized", data));
    }

    @RequestMapping(method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> options() {
        return ResponseEntity.ok().build();
    }
}
