package cn.zeros.controller;

import cn.zeros.config.DiskConfig;
import cn.zeros.config.JwtProperties;
import cn.zeros.model.ApiResponse;
import cn.zeros.service.BootCommitService;
import cn.zeros.service.BootSecurityTokenService;
import cn.zeros.util.JwtUtil;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class RandomSecurityControllerTest {

    private static final String RANDOM_VALUE = "0123456789abcdef0123456789abcdef";

    @TempDir
    Path tempDir;

    private ObjectMapper objectMapper;
    private RandomSecurityController controller;

    @BeforeEach
    void setUp() throws Exception {
        objectMapper = new ObjectMapper();
        DiskConfig diskConfig = diskConfig(tempDir);
        Files.createDirectories(tempDir.resolve("D"));
        BootSecurityTokenService tokenService = new BootSecurityTokenService(diskConfig, objectMapper);
        BootCommitService commitService = new BootCommitService(diskConfig, objectMapper);
        controller = new RandomSecurityController(new JwtUtil(new JwtProperties()), tokenService, commitService);
    }

    @Test
    void systemTokenRequiresAndConsumesBootCommit() {
        MockHttpServletRequest request = requestFrom("10.1.1.7");

        ResponseEntity<ApiResponse<Map<String, Object>>> missingCommit = controller.handleRequest(
                null, RANDOM_VALUE, "SystemToken", null, null, null, request);
        assertThat(missingCommit.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        ResponseEntity<ApiResponse<Map<String, Object>>> commit = controller.handleRequest(
                "commit_for_system", RANDOM_VALUE, null, null, null, null, request);
        assertThat(commit.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<ApiResponse<Map<String, Object>>> issued = controller.handleRequest(
                null, RANDOM_VALUE, "SystemToken", null, null, null, request);
        assertThat(issued.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(issued.getBody()).isNotNull();
        assertThat(issued.getBody().getData()).containsKey("token");

        ResponseEntity<ApiResponse<Map<String, Object>>> reused = controller.handleRequest(
                null, RANDOM_VALUE, "SystemToken", null, null, null, request);
        assertThat(reused.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @SuppressWarnings("unchecked")
    void expiredBootCommitIsRejected() throws Exception {
        MockHttpServletRequest request = requestFrom("10.1.1.8");
        controller.handleRequest("commit_for_system", RANDOM_VALUE, null, null, null, null, request);

        Path commitFile = tempDir.resolve("D").resolve("cache").resolve("temp").resolve("boot_commit.json");
        Map<String, Object> root = objectMapper.readValue(commitFile.toFile(), new TypeReference<>() {});
        Map<String, Object> commits = (Map<String, Object>) root.get("commits");
        Map<String, Object> commit = (Map<String, Object>) commits.get(RANDOM_VALUE);
        commit.put("created_at", System.currentTimeMillis() / 1000 - 31);
        objectMapper.writeValue(commitFile.toFile(), root);

        ResponseEntity<ApiResponse<Map<String, Object>>> issued = controller.handleRequest(
                null, RANDOM_VALUE, "SystemToken", null, null, null, request);

        assertThat(issued.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    private MockHttpServletRequest requestFrom(String ip) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(ip);
        return request;
    }

    private DiskConfig diskConfig(Path basePath) {
        DiskConfig diskConfig = new DiskConfig();
        ReflectionTestUtils.setField(diskConfig, "basePath", basePath.toString());
        ReflectionTestUtils.setField(diskConfig, "systemResourceZipPath", basePath.resolve("SYSTEMRESOURCE.zip").toString());
        diskConfig.init();
        return diskConfig;
    }
}
