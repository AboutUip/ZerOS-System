package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.ICompressionDirveService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CompressionDirveControllerTest {

    @Test
    @SuppressWarnings("unchecked")
    void queryParametersStillMergeWithBodyOptions() {
        CapturingCompressionService service = new CapturingCompressionService();
        CompressionDirveController controller = new CompressionDirveController(service);

        Map<String, Object> options = new LinkedHashMap<>();
        options.put("bodyOnly", true);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sourcePaths", List.of("D:/from-body.txt"));
        body.put("options", options);

        ResponseEntity<ApiResponse<?>> response = controller.handleRequest(
                "compress_zip",
                null,
                "D:/target.zip",
                "D:/a.txt,D:/b.txt",
                "node_modules,dist",
                3,
                null,
                true,
                "secret",
                body);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(service.sourcePaths).containsExactly("D:/from-body.txt");
        assertThat(service.options).containsEntry("bodyOnly", true)
                .containsEntry("compressionLevel", 3)
                .containsEntry("overwrite", true)
                .containsEntry("password", "secret");
        assertThat((List<String>) service.options.get("exclude")).containsExactly("node_modules", "dist");
    }

    private static class CapturingCompressionService implements ICompressionDirveService {
        private List<String> sourcePaths;
        private Map<String, Object> options;

        @Override
        public Map<String, Object> compressZip(String targetPath, String sourcePath,
                                               List<String> sourcePaths, Map<String, Object> options) {
            this.sourcePaths = sourcePaths;
            this.options = options;
            return Map.of("targetPath", targetPath);
        }

        @Override
        public Map<String, Object> checkSupport() {
            return Map.of();
        }

        @Override
        public Map<String, Object> extractZip(String sourcePath, String targetPath, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> listZip(String sourcePath) throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> extractRar(String sourcePath, String targetPath, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> compressRar(String sourcePath, String targetPath, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> listRar(String sourcePath) throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> compress7z(String targetPath, String sourcePath,
                                              List<String> sourcePaths, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> extract7z(String sourcePath, String targetPath, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> list7z(String sourcePath) throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> compressTar(String targetPath, String sourcePath,
                                               List<String> sourcePaths, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> extractTar(String sourcePath, String targetPath, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> listTar(String sourcePath) throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> compressTarGz(String targetPath, String sourcePath,
                                                 List<String> sourcePaths, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> extractTarGz(String sourcePath, String targetPath, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> listTarGz(String sourcePath) throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> compressZipEncrypted(String targetPath, String sourcePath,
                                                        List<String> sourcePaths, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, Object> extractZipEncrypted(String sourcePath, String targetPath, Map<String, Object> options)
                throws IOException {
            throw new UnsupportedOperationException();
        }
    }
}
