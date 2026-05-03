package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.IDiskManagerService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DiskManagerControllerTest {

    @Test
    void writeDataIsRecognizedButForbidden() {
        IDiskManagerService service = mock(IDiskManagerService.class);
        DiskManagerController controller = new DiskManagerController(service);

        ResponseEntity<ApiResponse<?>> response = controller.handleRequest(
                "write_data", null, null, null, false, false, false, 0);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getStatus()).isEqualTo("error");
        assertThat(response.getBody().getMessage()).contains("write_data");
        verifyNoInteractions(service);
    }

    @Test
    void ioExceptionReturnsReadableInternalServerError() throws Exception {
        IDiskManagerService service = mock(IDiskManagerService.class);
        when(service.createPartition("E:")).thenThrow(new IOException("磁盘创建失败"));
        DiskManagerController controller = new DiskManagerController(service);

        ResponseEntity<ApiResponse<?>> response = controller.handleRequest(
                "create", "E:", null, null, false, false, false, 0);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getStatus()).isEqualTo("error");
        assertThat(response.getBody().getMessage()).isEqualTo("磁盘创建失败");
    }
}
