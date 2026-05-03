package cn.zeros.service.impl;

import cn.zeros.config.DiskConfig;
import cn.zeros.exception.BusinessException;
import cn.zeros.security.UserContext;
import cn.zeros.security.UserContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FSDirveServiceImplTest {

    @TempDir
    Path tempDir;

    private FSDirveServiceImpl service;

    @BeforeEach
    void setUp() throws Exception {
        DiskConfig diskConfig = new DiskConfig();
        ReflectionTestUtils.setField(diskConfig, "basePath", tempDir.toString());
        ReflectionTestUtils.setField(diskConfig, "systemResourceZipPath", tempDir.resolve("SYSTEMRESOURCE.zip").toString());
        diskConfig.init();
        Files.createDirectories(tempDir.resolve("D"));
        service = new FSDirveServiceImpl(diskConfig);
    }

    @AfterEach
    void tearDown() {
        UserContextHolder.clear();
    }

    @Test
    void readFileAutoBase64EncodesVideoFiles() throws Exception {
        byte[] bytes = new byte[] {0, 1, 2, 3, 4};
        Files.createDirectories(tempDir.resolve("D").resolve("videos"));
        Files.write(tempDir.resolve("D").resolve("videos").resolve("clip.mp4"), bytes);

        Map<String, Object> result = service.readFile("D:/videos", "clip.mp4", false);

        assertThat(result).containsEntry("isBase64", true);
        assertThat(result.get("content")).isEqualTo(Base64.getEncoder().encodeToString(bytes));
    }

    @Test
    void userTokenCannotMutateSensitiveDRootFiles() throws Exception {
        Files.createDirectories(tempDir.resolve("D").resolve("tmp"));
        Files.writeString(tempDir.resolve("D").resolve("LocalSData.json"), "{}");
        Files.writeString(tempDir.resolve("D").resolve("LocalCache.json"), "{}");
        Files.writeString(tempDir.resolve("D").resolve("ApplicationTable.json"), "{}");
        Files.writeString(tempDir.resolve("D").resolve("tmp").resolve("source.txt"), "source");

        UserContextHolder.set(UserContext.builder().tokenType("UserToken").build());

        assertThatThrownBy(() -> service.createFile("D:", "BootSecurityToken.json", "{}"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("UserToken");
        assertThatThrownBy(() -> service.writeFile("D:", "LocalSData.json", "{}", "overwrite", false))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("UserToken");
        assertThatThrownBy(() -> service.deleteFile("D:", "LocalSData.json"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("UserToken");
        assertThatThrownBy(() -> service.renameFile("D:", "LocalCache.json", "LocalCache.copy.json"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("UserToken");
        assertThatThrownBy(() -> service.moveFile("D:", "ApplicationTable.json", "D:/tmp", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("UserToken");
        assertThatThrownBy(() -> service.copyFile("D:/tmp", "source.txt", "D:", "ApplicationTable.json"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("UserToken");
        assertThatThrownBy(() -> service.copyFile("D:", "ApplicationTable.json", "D:/tmp", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("UserToken");
    }
}
