package cn.zeros.controller;

import cn.zeros.model.ApiResponse;
import cn.zeros.service.INetworkDirveService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 网络驱动控制器（对应 PHP 端的 networkDirve.php）
 *
 * <p>功能说明：
 * 提供 TCP 端口的注册监听、注销、连接检查、状态查询、数据发送等功能。
 * 与内核的 NetworkManager（kernel/drive/networkManager.js）协同工作。
 *
 * <p>与 PHP 实现的主要区别：
 * PHP 需要独立的守护进程（networkDirveDaemon.php）来保持套接字打开，
 * Java 版利用 NIO 的 ServerSocketChannel 直接在 JVM 内保持端口监听，
 * 无需守护进程，更高效且更可靠。
 *
 * <p>支持的操作（通过 action 参数指定）：
 * <ul>
 *   <li>register   — 注册端口监听（需要 port、pid、programName）</li>
 *   <li>unregister — 取消端口监听（需要 port）</li>
 *   <li>check      — 检查端口，接受新连接并读取数据（需要 port）</li>
 *   <li>status     — 获取端口状态和连接信息（需要 port）</li>
 *   <li>send       — 作为客户端向 host:port 发送数据（需要 port、data，host 默认 127.0.0.1）</li>
 *   <li>list       — 列出所有已注册的端口</li>
 * </ul>
 *
 * <p>此接口需要 JWT 认证
 *
 * <p>调用方：kernel/drive/networkManager.js
 *
 * @author zeros
 */
@Slf4j
@RestController
@RequestMapping("/networkDirve")
@RequiredArgsConstructor
public class NetworkDirveController {

    private final INetworkDirveService networkDirveService;

    /**
     * 统一入口：根据 action 参数分发到不同的操作
     *
     * @param action      操作类型（必填）
     * @param port        端口号 1-65535（大部分操作需要）
     * @param pid         进程 ID（register 时需要）
     * @param programName 程序名称（register 时需要）
     * @param host        目标主机（send 时使用，默认 127.0.0.1）
     * @param data        要发送的数据（send 时需要）
     */
    @RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
    public ResponseEntity<ApiResponse<?>> handleRequest(
            @RequestParam String action,
            @RequestParam(required = false) Integer port,
            @RequestParam(required = false) String pid,
            @RequestParam(required = false) String programName,
            @RequestParam(required = false) String host,
            @RequestParam(required = false) String data) {

        return switch (action) {
            case "register" -> {
                if (port == null || pid == null || programName == null) {
                    yield ResponseEntity.badRequest()
                            .body(ApiResponse.error("缺少必需参数: port, pid, programName"));
                }
                Map<String, Object> result = networkDirveService.registerPort(port, pid, programName);
                yield buildResponse(result);
            }
            case "unregister" -> {
                if (port == null) {
                    yield ResponseEntity.badRequest()
                            .body(ApiResponse.error("缺少必需参数: port"));
                }
                Map<String, Object> result = networkDirveService.unregisterPort(port);
                yield buildResponse(result);
            }
            case "check" -> {
                if (port == null) {
                    yield ResponseEntity.badRequest()
                            .body(ApiResponse.error("缺少必需参数: port"));
                }
                Map<String, Object> result = networkDirveService.checkPort(port);
                yield buildResponse(result);
            }
            case "status" -> {
                if (port == null) {
                    yield ResponseEntity.badRequest()
                            .body(ApiResponse.error("缺少必需参数: port"));
                }
                Map<String, Object> result = networkDirveService.getPortStatus(port);
                yield buildResponse(result);
            }
            case "send" -> {
                if (port == null || data == null) {
                    yield ResponseEntity.badRequest()
                            .body(ApiResponse.error("缺少必需参数: port, data"));
                }
                Map<String, Object> result = networkDirveService.sendData(
                        host != null ? host : "127.0.0.1", port, data);
                yield buildResponse(result);
            }
            case "list" -> {
                Map<String, Object> result = networkDirveService.listPorts();
                yield buildResponse(result);
            }
            default -> ResponseEntity.badRequest()
                    .body(ApiResponse.error("未知的操作类型: " + action));
        };
    }

    /**
     * 将 Service 层返回的 Map 结果转换为统一的 ApiResponse 格式
     */
    private ResponseEntity<ApiResponse<?>> buildResponse(Map<String, Object> result) {
        boolean success = Boolean.TRUE.equals(result.get("success"));
        String message = (String) result.get("message");
        Object data = result.get("data");

        if (success) {
            return ResponseEntity.ok(ApiResponse.success(message, data));
        } else {
            return ResponseEntity.badRequest().body(ApiResponse.error(message));
        }
    }
}
