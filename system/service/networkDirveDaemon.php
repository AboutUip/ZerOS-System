<?php
/**
 * ZerOS 网络驱动守护进程
 * 负责管理真正的 TCP 套接字监听和数据接收
 * 与 networkDirve.php 协同工作
 * 
 * 运行方式: php networkDirveDaemon.php
 * 注意：此脚本需要在 CLI 模式下运行
 */

// 检查是否在 CLI 模式下运行
if (php_sapi_name() !== 'cli') {
    die("此脚本只能在 CLI 模式下运行\n");
}

// 基础路径配置（与主脚本一致）
define('DISK_BASE_PATH', __DIR__ . '/DISK');
define('DISK_D_PATH', DISK_BASE_PATH . '/D');
define('NETWORK_DATA_PATH', DISK_D_PATH . '/cache/network');
define('DAEMON_PID_FILE', NETWORK_DATA_PATH . '/daemon.pid');
define('DAEMON_CONTROL_FILE', NETWORK_DATA_PATH . '/daemon_control.json');

// 确保目录存在
if (!is_dir(NETWORK_DATA_PATH)) {
    mkdir(NETWORK_DATA_PATH, 0755, true);
}

// 全局变量
$sockets = []; // port => socket resource
$clients = []; // connectionId => client socket resource
$running = true;

/**
 * 信号处理
 */
function signalHandler($signo) {
    global $running;
    switch ($signo) {
        case SIGTERM:
        case SIGINT:
            echo "收到终止信号，正在关闭...\n";
            $running = false;
            break;
    }
}

// 注册信号处理器
if (function_exists('pcntl_signal')) {
    pcntl_signal(SIGTERM, 'signalHandler');
    pcntl_signal(SIGINT, 'signalHandler');
}

/**
 * 获取端口配置文件路径
 */
function getPortConfigPath($port) {
    return NETWORK_DATA_PATH . '/port_' . $port . '.json';
}

/**
 * 获取端口连接数据路径
 */
function getPortConnectionsPath($port) {
    return NETWORK_DATA_PATH . '/port_' . $port . '_connections.json';
}

/**
 * 获取端口数据队列路径
 */
function getPortDataQueuePath($port) {
    return NETWORK_DATA_PATH . '/port_' . $port . '_data_queue.json';
}

/**
 * 写入 PID 文件
 */
function writePidFile() {
    file_put_contents(DAEMON_PID_FILE, getmypid());
}

/**
 * 加载所有需要监听的端口
 */
function loadPorts() {
    global $sockets;
    $sockets = [];
    
    $files = glob(NETWORK_DATA_PATH . '/port_*.json');
    foreach ($files as $file) {
        if (preg_match('/port_(\d+)\.json$/', $file, $matches)) {
            $port = (int)$matches[1];
            $configPath = getPortConfigPath($port);
            
            if (file_exists($configPath) && !strpos($file, '_connections') && !strpos($file, '_data_queue')) {
                $config = json_decode(file_get_contents($configPath), true);
                if ($config && isset($config['status']) && $config['status'] === 'listening') {
                    // 创建服务器套接字
                    $address = $config['address'] ?? '0.0.0.0';
                    $socket = @stream_socket_server("tcp://{$address}:{$port}", $errno, $errstr, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN);
                    
                    if ($socket) {
                        stream_set_blocking($socket, false);
                        $sockets[$port] = $socket;
                        echo "端口 {$port} 开始监听\n";
                    } else {
                        echo "警告: 无法监听端口 {$port}: {$errstr}\n";
                    }
                }
            }
        }
    }
}

/**
 * 处理控制命令
 */
function processControlCommands() {
    global $sockets;
    
    if (!file_exists(DAEMON_CONTROL_FILE)) {
        return;
    }
    
    $commands = json_decode(file_get_contents(DAEMON_CONTROL_FILE), true) ?: [];
    
    foreach ($commands as $cmd) {
        $command = $cmd['command'] ?? '';
        $data = $cmd['data'] ?? [];
        
        switch ($command) {
            case 'register':
                $port = $data['port'] ?? null;
                if ($port && !isset($sockets[$port])) {
                    $address = $data['address'] ?? '0.0.0.0';
                    $socket = @stream_socket_server("tcp://{$address}:{$port}", $errno, $errstr, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN);
                    
                    if ($socket) {
                        stream_set_blocking($socket, false);
                        $sockets[$port] = $socket;
                        echo "端口 {$port} 注册成功\n";
                    } else {
                        echo "警告: 无法注册端口 {$port}: {$errstr}\n";
                    }
                }
                break;
                
            case 'unregister':
                $port = $data['port'] ?? null;
                if ($port && isset($sockets[$port])) {
                    @fclose($sockets[$port]);
                    unset($sockets[$port]);
                    echo "端口 {$port} 已取消注册\n";
                }
                break;
        }
    }
    
    // 清空控制文件
    file_put_contents(DAEMON_CONTROL_FILE, json_encode([], JSON_UNESCAPED_UNICODE));
}

/**
 * 接受新连接
 */
function acceptConnections() {
    global $sockets, $clients;
    
    foreach ($sockets as $port => $socket) {
        $client = @stream_socket_accept($socket, 0);
        if ($client) {
            stream_set_blocking($client, false);
            
            $clientInfo = stream_socket_get_name($client, true);
            $connectionId = uniqid('conn_', true);
            
            // 解析远程地址和端口
            $remoteParts = explode(':', $clientInfo);
            $remoteAddress = $remoteParts[0] ?? 'unknown';
            $remotePort = isset($remoteParts[1]) ? (int)$remoteParts[1] : 0;
            
            $connectionData = [
                'id' => $connectionId,
                'connectionId' => $connectionId,
                'remote_address' => $remoteAddress,
                'remoteAddress' => $remoteAddress,
                'remote_port' => $remotePort,
                'remotePort' => $remotePort,
                'connected_at' => time(),
                'connectedAt' => time()
            ];
            
            $clients[$connectionId] = [
                'socket' => $client,
                'port' => $port,
                'connection' => $connectionData
            ];
            
            // 保存连接信息
            $connectionsPath = getPortConnectionsPath($port);
            $connections = [];
            if (file_exists($connectionsPath)) {
                $connections = json_decode(file_get_contents($connectionsPath), true) ?: [];
            }
            $connections[$connectionId] = $connectionData;
            file_put_contents($connectionsPath, json_encode($connections, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            
            echo "新连接: {$remoteAddress}:{$remotePort} -> 端口 {$port} (连接ID: {$connectionId})\n";
        }
    }
}

/**
 * 读取客户端数据
 */
function readClientData() {
    global $clients;
    
    foreach ($clients as $connectionId => $clientInfo) {
        $socket = $clientInfo['socket'];
        $port = $clientInfo['port'];
        
        // 检查连接是否仍然有效
        if (feof($socket)) {
            // 连接已关闭
            @fclose($socket);
            unset($clients[$connectionId]);
            
            // 从连接列表中移除
            $connectionsPath = getPortConnectionsPath($port);
            if (file_exists($connectionsPath)) {
                $connections = json_decode(file_get_contents($connectionsPath), true) ?: [];
                unset($connections[$connectionId]);
                file_put_contents($connectionsPath, json_encode($connections, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            }
            
            echo "连接关闭: {$connectionId}\n";
            continue;
        }
        
        // 读取数据（非阻塞）
        $buffer = '';
        while (($chunk = @fread($socket, 8192)) !== false && $chunk !== '') {
            $buffer .= $chunk;
        }
        
        if (!empty($buffer)) {
            // 将数据添加到队列
            $dataQueuePath = getPortDataQueuePath($port);
            $dataQueue = [];
            if (file_exists($dataQueuePath)) {
                $dataQueue = json_decode(file_get_contents($dataQueuePath), true) ?: [];
            }
            
            // 获取连接的远程地址信息
            $connection = $clientInfo['connection'];
            $remoteAddress = $connection['remote_address'] ?? $connection['remoteAddress'] ?? 'unknown';
            $remotePort = $connection['remote_port'] ?? $connection['remotePort'] ?? 0;
            
            $dataQueue[] = [
                'connectionId' => $connectionId,
                'data' => base64_encode($buffer), // 使用 base64 编码以支持二进制数据
                'received_at' => time(),
                'receivedAt' => time(), // 保持兼容性
                'size' => strlen($buffer),
                'from_host' => $remoteAddress,
                'from_port' => $remotePort
            ];
            
            // 限制队列大小（最多保留 1000 条）
            if (count($dataQueue) > 1000) {
                $dataQueue = array_slice($dataQueue, -1000);
            }
            
            file_put_contents($dataQueuePath, json_encode($dataQueue, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            
            echo "收到数据: 端口 {$port}, 连接 {$connectionId}, 大小 " . strlen($buffer) . " 字节\n";
        }
    }
}

/**
 * 主循环
 */
function mainLoop() {
    global $running, $sockets;
    
    echo "守护进程启动 (PID: " . getmypid() . ")\n";
    writePidFile();
    
    // 加载所有端口
    loadPorts();
    
    // 主循环
    while ($running) {
        // 处理信号
        if (function_exists('pcntl_signal_dispatch')) {
            pcntl_signal_dispatch();
        }
        
        // 处理控制命令
        processControlCommands();
        
        // 接受新连接
        acceptConnections();
        
        // 读取客户端数据
        readClientData();
        
        // 短暂休眠，避免 CPU 占用过高
        usleep(10000); // 10ms
    }
    
    // 清理资源
    echo "正在关闭所有套接字...\n";
    foreach ($sockets as $socket) {
        @fclose($socket);
    }
    foreach ($clients as $clientInfo) {
        @fclose($clientInfo['socket']);
    }
    
    // 删除 PID 文件
    @unlink(DAEMON_PID_FILE);
    
    echo "守护进程已退出\n";
}

// 运行主循环
mainLoop();

