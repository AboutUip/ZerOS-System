package cn.zeros.controller;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class MediaProxyControllerTest {

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void videoProxyForwardsRangeAndPreservesPartialContent() throws Exception {
        AtomicReference<String> seenRange = new AtomicReference<>();
        String url = startPartialContentServer("video/mp4", seenRange);

        ResponseEntity<byte[]> response = new VideoProxyController()
                .proxyVideo(url, "bytes=0-3")
                .block(Duration.ofSeconds(10));

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PARTIAL_CONTENT);
        assertThat(response.getHeaders().getFirst("Content-Range")).isEqualTo("bytes 0-3/4");
        assertThat(response.getBody()).isEqualTo(new byte[] {1, 2, 3, 4});
        assertThat(seenRange).hasValue("bytes=0-3");
    }

    @Test
    void audioProxyPreservesPartialContent() throws Exception {
        AtomicReference<String> seenRange = new AtomicReference<>();
        String url = startPartialContentServer("audio/mpeg", seenRange);

        ResponseEntity<byte[]> response = new AudioProxyController()
                .proxyAudio(url, "bytes=0-3")
                .block(Duration.ofSeconds(10));

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PARTIAL_CONTENT);
        assertThat(response.getHeaders().getFirst("Content-Range")).isEqualTo("bytes 0-3/4");
        assertThat(response.getBody()).isEqualTo(new byte[] {1, 2, 3, 4});
        assertThat(seenRange).hasValue("bytes=0-3");
    }

    private String startPartialContentServer(String contentType, AtomicReference<String> seenRange) throws IOException {
        byte[] body = new byte[] {1, 2, 3, 4};
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/media", exchange -> {
            seenRange.set(exchange.getRequestHeaders().getFirst("Range"));
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.getResponseHeaders().set("Content-Range", "bytes 0-3/4");
            exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
            exchange.sendResponseHeaders(206, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        int port = server.getAddress().getPort();
        return "http://127.0.0.1:" + port + "/media";
    }
}
