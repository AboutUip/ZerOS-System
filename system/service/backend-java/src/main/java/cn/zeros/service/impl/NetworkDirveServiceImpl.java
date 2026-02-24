package cn.zeros.service.impl;

import cn.zeros.config.DiskConfig;
import cn.zeros.service.INetworkDirveService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.channels.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 网络驱动服务实现（对应 PHP 端的 networkDirve.php + networkDirveDaemon.php）
 *
 * <p>架构差异（Java vs PHP）：
 * PHP 由于请求-响应模型的限制，需要一个独立的 CLI 守护进程（networkDirveDaemon.php）
 * 来保持 TCP 套接字打开，主脚本通过文件系统（JSON 文件）与守护进程进行 IPC 通信。
 * Java 版利用 NIO 的 {@link ServerSocketChannel} 直接在 JVM 内保持端口监听（非阻塞模式），
 * 无需独立守护进程，架构更简单、更可靠。
 *
 * <p>内存中的数据结构：
 * <ul>
 *   <li>serverChannels — 端口号 → ServerSocketChannel 的映射，保持端口监听</li>
 *   <li>pendingConnections — 端口号 → 待处理的新连接列表</li>
 *   <li>dataQueues — 端口号 → 接收到的数据队列</li>
 * </ul>
 *
 * <p>文件存储（DISK/D/cache/network/）：
 * <ul>
 *   <li>port_{port}.json — 端口配置（pid、programName、status 等）</li>
 *   <li>port_{port}_connections.json — 连接记录</li>
 *   <li>port_{port}_data_queue.json — 数据队列</li>
 * </ul>
 *
 * <p>生命周期：JVM 关闭时（@PreDestroy）自动关闭所有监听端口
 *
 * @author zeros
 */
@Slf4j
@Service
public class NetworkDirveServiceImpl implements INetworkDirveService {

    private final DiskConfig diskConfig;
    private final ObjectMapper objectMapper;

    /** 网络数据文件存储目录：DISK/D/cache/network/ */
    private final Path networkDataPath;

    /** 端口号 → ServerSocketChannel 映射，保持端口监听状态 */
    private final ConcurrentHashMap<Integer, ServerSocketChannel> serverChannels = new ConcurrentHashMap<>();

    /** 端口号 → 待处理的新连接列表 */
    private final ConcurrentHashMap<Integer, List<Map<String, Object>>> pendingConnections = new ConcurrentHashMap<>();

    /** 端口号 → 接收到的数据队列 */
    private final ConcurrentHashMap<Integer, List<Map<String, Object>>> dataQueues = new ConcurrentHashMap<>();

    public NetworkDirveServiceImpl(DiskConfig diskConfig, ObjectMapper objectMapper) {
        this.diskConfig = diskConfig;
        this.objectMapper = objectMapper;
        this.networkDataPath = diskConfig.getPartitionPath("D").resolve("cache").resolve("network");
        try {
            Files.createDirectories(networkDataPath);
        } catch (IOException e) {
            log.warn("无法创建网络数据目录: {}", networkDataPath, e);
        }
    }

    /**
     * JVM 关闭时自动清理：关闭所有监听中的端口
     */
    @PreDestroy
    public void shutdown() {
        serverChannels.forEach((port, channel) -> {
            try {
                channel.close();
                log.info("关闭端口 {} 的监听", port);
            } catch (IOException e) {
                log.warn("关闭端口 {} 失败", port, e);
            }
        });
        serverChannels.clear();
    }

    /**
     * 注册端口监听：创建 NIO ServerSocketChannel 并绑定到指定端口
     *
     * @param port        要监听的端口号（1-65535）
     * @param pid         注册程序的进程 ID
     * @param programName 注册程序的名称
     */
    @Override
    public Map<String, Object> registerPort(int port, String pid, String programName) {
        if (port < 1 || port > 65535) {
            return errorResult("无效的端口号（必须是 1-65535 之间的数字）");
        }

        if (serverChannels.containsKey(port)) {
            return errorResult("端口 " + port + " 已被注册并正在监听");
        }

        try {
            // 创建非阻塞的 ServerSocketChannel，绑定到所有网络接口
            ServerSocketChannel ssc = ServerSocketChannel.open();
            ssc.configureBlocking(false);
            ssc.bind(new InetSocketAddress("0.0.0.0", port));

            // 保存到内存映射
            serverChannels.put(port, ssc);
            pendingConnections.put(port, Collections.synchronizedList(new ArrayList<>()));
            dataQueues.put(port, Collections.synchronizedList(new ArrayList<>()));

            // 同时写入文件（与 PHP 的文件 IPC 模式兼容）
            Map<String, Object> config = new LinkedHashMap<>();
            config.put("port", port);
            config.put("pid", pid);
            config.put("programName", programName);
            config.put("status", "listening");
            config.put("created", System.currentTimeMillis() / 1000);
            config.put("address", "0.0.0.0");
            writeJson(getPortConfigPath(port), config);
            writeJson(getPortConnectionsPath(port), new LinkedHashMap<>());
            writeJson(getPortDataQueuePath(port), new ArrayList<>());

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("port", port);
            result.put("pid", pid);
            result.put("programName", programName);
            result.put("status", "listening");
            return successResult("端口 " + port + " 注册成功", result);

        } catch (BindException e) {
            return errorResult("端口 " + port + " 已被其他程序占用");
        } catch (IOException e) {
            return errorResult("无法创建服务器套接字: " + e.getMessage());
        }
    }

    /**
     * 取消端口监听：关闭 ServerSocketChannel 并清理相关文件
     */
    @Override
    public Map<String, Object> unregisterPort(int port) {
        ServerSocketChannel ssc = serverChannels.remove(port);
        if (ssc != null) {
            try {
                ssc.close();
            } catch (IOException e) {
                log.warn("关闭端口 {} 失败", port, e);
            }
        }
        pendingConnections.remove(port);
        dataQueues.remove(port);

        // 清理文件
        deleteFile(getPortConfigPath(port));
        deleteFile(getPortConnectionsPath(port));
        deleteFile(getPortDataQueuePath(port));

        if (ssc == null && !Files.exists(getPortConfigPath(port))) {
            return errorResult("端口 " + port + " 未注册");
        }

        return successResult("端口 " + port + " 已取消注册", null);
    }

    /**
     * 检查端口：非阻塞地接受所有待处理的新连接并读取数据
     * 返回自上次检查以来的新连接和收到的数据
     *
     * 由前端 NetworkManager 定时轮询调用
     */
    @Override
    public Map<String, Object> checkPort(int port) {
        ServerSocketChannel ssc = serverChannels.get(port);
        if (ssc == null) {
            if (!Files.exists(getPortConfigPath(port))) {
                return errorResult("端口 " + port + " 未注册");
            }
            return errorResult("端口 " + port + " 未在监听状态");
        }

        List<Map<String, Object>> newConnections = new ArrayList<>();
        List<Map<String, Object>> dataReceived = new ArrayList<>();

        try {
            // 非阻塞模式：accept() 无等待连接时返回 null
            SocketChannel client;
            while ((client = ssc.accept()) != null) {
                client.configureBlocking(false);
                String connId = "conn_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);

                InetSocketAddress remoteAddr = (InetSocketAddress) client.getRemoteAddress();
                String remoteHost = remoteAddr.getAddress().getHostAddress();
                int remotePort = remoteAddr.getPort();
                long connTime = System.currentTimeMillis() / 1000;

                // 记录连接信息（同时提供 snake_case 和 camelCase 字段名，兼容前端）
                Map<String, Object> connData = new LinkedHashMap<>();
                connData.put("id", connId);
                connData.put("connectionId", connId);
                connData.put("remote_address", remoteHost);
                connData.put("remoteAddress", remoteHost);
                connData.put("remote_port", remotePort);
                connData.put("remotePort", remotePort);
                connData.put("connected_at", connTime);
                connData.put("connectedAt", connTime);
                newConnections.add(connData);

                // 尝试读取客户端发送的数据（非阻塞，读完即止）
                ByteBuffer buffer = ByteBuffer.allocate(8192);
                StringBuilder sb = new StringBuilder();
                int bytesRead;
                while ((bytesRead = client.read(buffer)) > 0) {
                    buffer.flip();
                    byte[] bytes = new byte[buffer.remaining()];
                    buffer.get(bytes);
                    sb.append(new String(bytes));
                    buffer.clear();
                }

                if (!sb.isEmpty()) {
                    Map<String, Object> dataItem = new LinkedHashMap<>();
                    dataItem.put("connectionId", connId);
                    dataItem.put("data", sb.toString());
                    dataItem.put("received_at", connTime);
                    dataItem.put("receivedAt", connTime);
                    dataItem.put("size", sb.length());
                    dataItem.put("from_host", remoteHost);
                    dataItem.put("from_port", remotePort);
                    dataReceived.add(dataItem);
                }

                client.close();
            }
        } catch (IOException e) {
            log.info("检查端口 {} 时出错: {}", port, e.getMessage());
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("newConnections", newConnections);
        data.put("dataReceived", dataReceived);
        return successResult("端口 " + port + " 检查完成", data);
    }

    /**
     * 获取端口状态：从配置文件读取端口信息和连接数
     */
    @Override
    public Map<String, Object> getPortStatus(int port) {
        Path configPath = getPortConfigPath(port);
        if (!Files.exists(configPath)) {
            return errorResult("端口 " + port + " 未注册");
        }

        try {
            Map<String, Object> config = readJson(configPath);
            Map<String, Object> connections = readJson(getPortConnectionsPath(port));
            if (connections == null) connections = new LinkedHashMap<>();

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("port", port);
            data.put("pid", config.get("pid"));
            data.put("programName", config.get("programName"));
            data.put("status", config.get("status"));
            data.put("created", config.get("created"));
            data.put("address", config.getOrDefault("address", "0.0.0.0"));
            data.put("connectionCount", connections.size());
            data.put("connections", new ArrayList<>(connections.values()));
            return successResult("获取端口状态成功", data);
        } catch (IOException e) {
            return errorResult("读取端口配置失败: " + e.getMessage());
        }
    }

    /**
     * 向指定 host:port 发送数据（作为 TCP 客户端）
     *
     * @param host 目标主机（默认 127.0.0.1）
     * @param port 目标端口
     * @param data 要发送的数据字符串
     */
    @Override
    public Map<String, Object> sendData(String host, int port, String data) {
        if (port < 1 || port > 65535) {
            return errorResult("无效的端口号");
        }
        if (host == null || host.isBlank()) {
            host = "127.0.0.1";
        }

        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 5000);
            OutputStream out = socket.getOutputStream();
            byte[] bytes = data.getBytes();
            out.write(bytes);
            out.flush();

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("bytesWritten", bytes.length);
            return successResult("数据已发送到 " + host + ":" + port, result);
        } catch (IOException e) {
            return errorResult("无法连接到 " + host + ":" + port + ": " + e.getMessage());
        }
    }

    /**
     * 列出所有已注册的端口（扫描文件目录中的 port_*.json 配置文件）
     */
    @Override
    public Map<String, Object> listPorts() {
        List<Map<String, Object>> ports = new ArrayList<>();

        try {
            if (Files.exists(networkDataPath)) {
                Files.list(networkDataPath)
                        .filter(p -> p.getFileName().toString().matches("port_\\d+\\.json"))
                        .forEach(p -> {
                            try {
                                Map<String, Object> config = readJson(p);
                                if (config != null) {
                                    Map<String, Object> info = new LinkedHashMap<>();
                                    info.put("port", config.get("port"));
                                    info.put("pid", config.get("pid"));
                                    info.put("programName", config.get("programName"));
                                    info.put("status", config.get("status"));
                                    info.put("created", config.get("created"));
                                    info.put("address", config.getOrDefault("address", "0.0.0.0"));
                                    ports.add(info);
                                }
                            } catch (IOException e) {
                                log.info("读取端口配置失败: {}", p, e);
                            }
                        });
            }
        } catch (IOException e) {
            log.warn("列出端口目录失败", e);
        }

        return successResult("获取端口列表成功", Map.of("ports", ports));
    }

    // ============ 文件路径辅助方法 ============

    private Path getPortConfigPath(int port) {
        return networkDataPath.resolve("port_" + port + ".json");
    }

    private Path getPortConnectionsPath(int port) {
        return networkDataPath.resolve("port_" + port + "_connections.json");
    }

    private Path getPortDataQueuePath(int port) {
        return networkDataPath.resolve("port_" + port + "_data_queue.json");
    }

    // ============ JSON 读写辅助方法 ============

    private void writeJson(Path path, Object data) {
        try {
            Files.createDirectories(path.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), data);
        } catch (IOException e) {
            log.error("写入 JSON 失败: {}", path, e);
        }
    }

    private Map<String, Object> readJson(Path path) throws IOException {
        if (!Files.exists(path)) return null;
        return objectMapper.readValue(path.toFile(), new TypeReference<>() {});
    }

    private void deleteFile(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            log.info("删除文件失败: {}", path, e);
        }
    }

    // ============ 返回值构造辅助方法 ============

    private Map<String, Object> successResult(String message, Object data) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("message", message);
        if (data != null) result.put("data", data);
        return result;
    }

    private Map<String, Object> errorResult(String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", false);
        result.put("message", message);
        return result;
    }
}
