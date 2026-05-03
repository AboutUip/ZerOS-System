package cn.zeros.controller;

import cn.zeros.config.DiskConfig;
import cn.zeros.model.ApiResponse;
import cn.zeros.service.BootSecurityTokenService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ProgramPermissionsControllerTest {

    @TempDir
    Path tempDir;

    private BootSecurityTokenService tokenService;
    private ProgramPermissionsController controller;

    @BeforeEach
    void setUp() throws Exception {
        DiskConfig diskConfig = new DiskConfig();
        ReflectionTestUtils.setField(diskConfig, "basePath", tempDir.toString());
        ReflectionTestUtils.setField(diskConfig, "systemResourceZipPath", tempDir.resolve("SYSTEMRESOURCE.zip").toString());
        diskConfig.init();
        Files.createDirectories(tempDir.resolve("D"));

        tokenService = new BootSecurityTokenService(diskConfig, new ObjectMapper());
        controller = new ProgramPermissionsController(tokenService);
    }

    @Test
    void registerUpdateAndReclaimMutateProgramPermissionsMap() {
        Map<String, Object> registerBody = new LinkedHashMap<>();
        registerBody.put("programName", "desktop-app");
        registerBody.put("permissions", List.of("KERNEL_DISK_READ"));

        ResponseEntity<ApiResponse<Map<String, Object>>> register = controller.handleRequest(
                "register", null, registerBody);
        assertThat(register.getStatusCode()).isEqualTo(HttpStatus.OK);
        String upid = (String) register.getBody().getData().get("upid");
        assertThat(tokenService.loadProgramPermissionsMap()).containsEntry(upid, List.of("KERNEL_DISK_READ"));

        Map<String, Object> updateBody = new LinkedHashMap<>();
        updateBody.put("upid", upid);
        updateBody.put("permissions", List.of("KERNEL_DISK_WRITE", "KERNEL_DISK_READ"));

        ResponseEntity<ApiResponse<Map<String, Object>>> update = controller.handleRequest(
                "update", null, updateBody);
        assertThat(update.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(tokenService.loadProgramPermissionsMap())
                .containsEntry(upid, List.of("KERNEL_DISK_WRITE", "KERNEL_DISK_READ"));

        ResponseEntity<ApiResponse<Map<String, Object>>> reclaim = controller.handleRequest(
                "reclaim", upid, null);
        assertThat(reclaim.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(tokenService.loadProgramPermissionsMap()).doesNotContainKey(upid);
    }
}
