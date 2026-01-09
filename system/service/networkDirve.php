<?php
/**
 * ZerOS 网络驱动服务
 * 支持 TCP 端口监听、多端口管理、数据通信
 * 与 kernel/drive/networkManager.js 协同工作
 * 
 * 访问地址: http://localhost:8089/system/service/networkDirve.php?action=xxx&...
 * 
 * 架构说明：
 * - 由于 PHP 请求-响应模型的限制，无法在请求之间保持套接字打开
 * - 使用守护进程（networkDirveDaemon.php）来管理真正的套接字监听
 * - 主脚本通过文件系统与守护进程通信
 * - 支持多端口同时监听
 */

// 设置错误处理，确保所有错误都返回 JSON
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) {
        return false;
    }
    
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'error',
        'message' => '服务器内部错误: ' . $errstr,
        'timestamp' => date('Y-m-d H:i:s'),
        'timestamp_unix' => time()
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

// 设置异常处理
set_exception_handler(function($exception) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'error',
        'message' => '未捕获的异常: ' . $exception->getMessage(),
        'timestamp' => date('Y-m-d H:i:s'),
        'timestamp_unix' => time()
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

// 设置响应头
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 基础路径配置
define('DISK_BASE_PATH', __DIR__ . '/DISK');
define('DISK_D_PATH', DISK_BASE_PATH . '/D');
define('NETWORK_DATA_PATH', DISK_D_PATH . '/cache/network');
define('DAEMON_SCRIPT', __DIR__ . '/networkDirveDaemon.php');
define('DAEMON_PID_FILE', NETWORK_DATA_PATH . '/daemon.pid');
define('DAEMON_CONTROL_FILE', NETWORK_DATA_PATH . '/daemon_control.json');

// 确保目录存在
if (!is_dir(NETWORK_DATA_PATH)) {
    mkdir(NETWORK_DATA_PATH, 0755, true);
}

/**
 * 响应函数
 */
function sendResponse($success, $message, $data = null, $code = 200) {
    http_response_code($code);
    $response = [
        'status' => $success ? 'success' : 'error',
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s'),
        'timestamp_unix' => time()
    ];
    if ($data !== null) {
        $response['data'] = $data;
    }
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
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
 * 获取端口数据队列路径（用于存储接收到的数据）
 */
function getPortDataQueuePath($port) {
    return NETWORK_DATA_PATH . '/port_' . $port . '_data_queue.json';
}

/**
 * 启动守护进程
 */
function startDaemon() {
    // 检查守护进程是否已在运行
    if (isDaemonRunning()) {
        return true;
    }
    
    // 检查守护进程脚本是否存在
    if (!file_exists(DAEMON_SCRIPT)) {
        // 如果守护进程脚本不存在，使用简化模式（直接监听）
        return true;
    }
    
    // 启动守护进程（跨平台兼容）
    if (PHP_OS_FAMILY === 'Windows') {
        // Windows 使用 start 命令在后台运行
        $command = 'start /B php ' . escapeshellarg(DAEMON_SCRIPT);
        pclose(popen($command, 'r'));
    } else {
        // Linux/Unix 使用标准后台运行
        $command = 'php ' . escapeshellarg(DAEMON_SCRIPT) . ' > /dev/null 2>&1 &';
        exec($command);
    }
    
    // 等待守护进程启动
    usleep(500000); // 500ms
    
    return isDaemonRunning();
}

/**
 * 检查守护进程是否在运行
 */
function isDaemonRunning() {
    if (!file_exists(DAEMON_PID_FILE)) {
        return false;
    }
    
    $pid = (int)trim(file_get_contents(DAEMON_PID_FILE));
    if ($pid <= 0) {
        return false;
    }
    
    // 检查进程是否存在（Windows 和 Linux 兼容）
    if (PHP_OS_FAMILY === 'Windows') {
        $command = "tasklist /FI \"PID eq {$pid}\" 2>NUL | find \"{$pid}\" >NUL";
        exec($command, $output, $returnVar);
        return $returnVar === 0;
    } else {
        // Linux/Unix 系统
        if (function_exists('posix_kill')) {
            return @posix_kill($pid, 0);
        } else {
            // 如果没有 posix 扩展，使用 ps 命令
            exec("ps -p {$pid} > /dev/null 2>&1", $output, $returnVar);
            return $returnVar === 0;
        }
    }
}

/**
 * 向守护进程发送控制命令
 */
function sendDaemonCommand($command, $data = []) {
    if (!file_exists(DAEMON_CONTROL_FILE)) {
        file_put_contents(DAEMON_CONTROL_FILE, json_encode([], JSON_UNESCAPED_UNICODE));
    }
    
    $commands = json_decode(file_get_contents(DAEMON_CONTROL_FILE), true) ?: [];
    $commands[] = [
        'command' => $command,
        'data' => $data,
        'timestamp' => time()
    ];
    
    // 只保留最近 100 条命令
    if (count($commands) > 100) {
        $commands = array_slice($commands, -100);
    }
    
    file_put_contents(DAEMON_CONTROL_FILE, json_encode($commands, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

/**
 * 获取所有端口列表
 */
function getAllPorts() {
    $ports = [];
    $files = glob(NETWORK_DATA_PATH . '/port_*.json');
    foreach ($files as $file) {
        if (preg_match('/port_(\d+)\.json$/', $file, $matches)) {
            $port = (int)$matches[1];
            $configPath = getPortConfigPath($port);
            if (file_exists($configPath) && !strpos($file, '_connections') && !strpos($file, '_data_queue')) {
                $config = json_decode(file_get_contents($configPath), true);
                if ($config) {
                    $ports[] = [
                        'port' => $port,
                        'pid' => $config['pid'] ?? null,
                        'programName' => $config['programName'] ?? null,
                        'status' => $config['status'] ?? 'unknown',
                        'created' => $config['created'] ?? null,
                        'address' => $config['address'] ?? '0.0.0.0'
                    ];
                }
            }
        }
    }
    return $ports;
}

/**
 * 注册端口监听
 */
function registerPort($port, $pid, $programName) {
    // 验证端口号
    if (!is_numeric($port) || $port < 1 || $port > 65535) {
        return ['success' => false, 'message' => '无效的端口号（必须是 1-65535 之间的数字）'];
    }
    
    $port = (int)$port;
    
    // 检查端口是否已被注册
    $configPath = getPortConfigPath($port);
    if (file_exists($configPath)) {
        $existingConfig = json_decode(file_get_contents($configPath), true);
        if ($existingConfig && isset($existingConfig['status']) && $existingConfig['status'] === 'listening') {
            return ['success' => false, 'message' => "端口 {$port} 已被注册并正在监听"];
        }
    }
    
    // 尝试创建服务器套接字以验证端口是否可用
    $address = '0.0.0.0'; // 监听所有接口
    $socket = @stream_socket_server("tcp://{$address}:{$port}", $errno, $errstr, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN);
    
    if (!$socket) {
        // 如果端口已被占用，检查是否是我们的守护进程在使用
        if ($errno === 98 || $errno === 10048) { // Address already in use
            // 检查配置文件是否存在（可能是守护进程在使用）
            if (file_exists($configPath)) {
                $existingConfig = json_decode(file_get_contents($configPath), true);
                if ($existingConfig && isset($existingConfig['status']) && $existingConfig['status'] === 'listening') {
                    return ['success' => false, 'message' => "端口 {$port} 已被注册并正在监听"];
                }
            }
            return ['success' => false, 'message' => "端口 {$port} 已被其他程序占用"];
        }
        return ['success' => false, 'message' => "无法创建服务器套接字: {$errstr} (错误代码: {$errno})"];
    }
    
    // 关闭测试套接字
    @fclose($socket);
    
    // 保存配置
    $config = [
        'port' => $port,
        'pid' => $pid,
        'programName' => $programName,
        'status' => 'listening',
        'created' => time(),
        'address' => $address
    ];
    
    file_put_contents($configPath, json_encode($config, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    
    // 初始化连接数据文件
    $connectionsPath = getPortConnectionsPath($port);
    file_put_contents($connectionsPath, json_encode([], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    
    // 初始化数据队列文件
    $dataQueuePath = getPortDataQueuePath($port);
    file_put_contents($dataQueuePath, json_encode([], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    
    // 启动守护进程（如果存在）
    if (file_exists(DAEMON_SCRIPT)) {
        startDaemon();
        // 通知守护进程注册新端口
        sendDaemonCommand('register', [
            'port' => $port,
            'pid' => $pid,
            'programName' => $programName,
            'address' => $address
        ]);
    }
    
    return [
        'success' => true,
        'message' => "端口 {$port} 注册成功",
        'data' => [
            'port' => $port,
            'pid' => $pid,
            'programName' => $programName,
            'status' => 'listening'
        ]
    ];
}

/**
 * 取消端口监听
 */
function unregisterPort($port) {
    $port = (int)$port;
    $configPath = getPortConfigPath($port);
    
    if (!file_exists($configPath)) {
        return ['success' => false, 'message' => "端口 {$port} 未注册"];
    }
    
    // 通知守护进程取消端口
    if (file_exists(DAEMON_SCRIPT) && isDaemonRunning()) {
        sendDaemonCommand('unregister', ['port' => $port]);
    }
    
    // 删除配置文件
    @unlink($configPath);
    
    // 删除连接数据文件
    $connectionsPath = getPortConnectionsPath($port);
    @unlink($connectionsPath);
    
    // 删除数据队列文件
    $dataQueuePath = getPortDataQueuePath($port);
    @unlink($dataQueuePath);
    
    return [
        'success' => true,
        'message' => "端口 {$port} 已取消注册"
    ];
}

/**
 * 检查端口（接受新连接并读取数据）
 * 如果守护进程存在，从守护进程获取数据；否则使用简化模式
 */
function checkPort($port) {
    $port = (int)$port;
    $configPath = getPortConfigPath($port);
    
    if (!file_exists($configPath)) {
        return ['success' => false, 'message' => "端口 {$port} 未注册"];
    }
    
    $config = json_decode(file_get_contents($configPath), true);
    if (!$config || $config['status'] !== 'listening') {
        return ['success' => false, 'message' => "端口 {$port} 未在监听状态"];
    }
    
    $newConnections = [];
    $dataReceived = [];
    
    // 如果守护进程在运行，从数据队列读取
    if (file_exists(DAEMON_SCRIPT) && isDaemonRunning()) {
        // 从数据队列读取新连接和数据
        $connectionsPath = getPortConnectionsPath($port);
        $dataQueuePath = getPortDataQueuePath($port);
        
        // 读取新连接（守护进程会写入）
        if (file_exists($connectionsPath)) {
            $allConnections = json_decode(file_get_contents($connectionsPath), true) ?: [];
            $lastCheckedConnections = $config['lastCheckedConnections'] ?? [];
            
            // 找出新连接
            foreach ($allConnections as $connId => $conn) {
                if (!isset($lastCheckedConnections[$connId])) {
                    $newConnections[] = [
                        'id' => $conn['id'] ?? $connId,
                        'connectionId' => $conn['connectionId'] ?? $connId,
                        'remote_address' => $conn['remote_address'] ?? $conn['remoteAddress'] ?? 'unknown',
                        'remoteAddress' => $conn['remoteAddress'] ?? $conn['remote_address'] ?? 'unknown',
                        'remote_port' => $conn['remote_port'] ?? $conn['remotePort'] ?? 0,
                        'remotePort' => $conn['remotePort'] ?? $conn['remote_port'] ?? 0,
                        'connected_at' => $conn['connected_at'] ?? $conn['connectedAt'] ?? time(),
                        'connectedAt' => $conn['connectedAt'] ?? $conn['connected_at'] ?? time()
                    ];
                }
            }
            
            // 更新最后检查的连接列表
            $config['lastCheckedConnections'] = $allConnections;
            file_put_contents($configPath, json_encode($config, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        }
        
        // 读取数据队列
        if (file_exists($dataQueuePath)) {
            $dataQueue = json_decode(file_get_contents($dataQueuePath), true) ?: [];
            if (!empty($dataQueue)) {
                // 处理数据队列（解码 base64 数据）
                foreach ($dataQueue as $dataItem) {
                    $dataReceived[] = [
                        'connectionId' => $dataItem['connectionId'] ?? null,
                        'data' => isset($dataItem['data']) ? base64_decode($dataItem['data']) : '',
                        'received_at' => $dataItem['received_at'] ?? time(),
                        'receivedAt' => $dataItem['received_at'] ?? time(), // 保持兼容性
                        'size' => $dataItem['size'] ?? 0,
                        'from_host' => $dataItem['from_host'] ?? null,
                        'from_port' => $dataItem['from_port'] ?? null
                    ];
                }
                // 清空队列（已读取）
                file_put_contents($dataQueuePath, json_encode([], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            }
        }
    } else {
        // 简化模式：直接尝试接受连接（每次都要重新创建套接字）
        $address = $config['address'] ?? '0.0.0.0';
        $socket = @stream_socket_server("tcp://{$address}:{$port}", $errno, $errstr, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN);
        
        if ($socket) {
            stream_set_blocking($socket, false);
            
            // 接受新连接（非阻塞）
            $timeout = 0.1; // 100ms 超时
            $startTime = microtime(true);
            
            while ((microtime(true) - $startTime) < $timeout) {
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
                    
                    $newConnections[] = $connectionData;
                    
                    // 保存连接信息
                    $connectionsPath = getPortConnectionsPath($port);
                    $connections = [];
                    if (file_exists($connectionsPath)) {
                        $connections = json_decode(file_get_contents($connectionsPath), true) ?: [];
                    }
                    $connections[$connectionId] = $connectionData;
                    file_put_contents($connectionsPath, json_encode($connections, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
                    
                    // 尝试读取数据（非阻塞）
                    $buffer = '';
                    while (($chunk = @fread($client, 8192)) !== false && $chunk !== '') {
                        $buffer .= $chunk;
                    }
                    
                    if (!empty($buffer)) {
                        $dataReceived[] = [
                            'connectionId' => $connectionId,
                            'data' => $buffer,
                            'received_at' => time(),
                            'receivedAt' => time(), // 保持兼容性
                            'size' => strlen($buffer),
                            'from_host' => $remoteAddress,
                            'from_port' => $remotePort
                        ];
                    }
                    
                    @fclose($client);
                }
                
                usleep(10000); // 10ms 延迟
            }
            
            @fclose($socket);
        }
    }
    
    return [
        'success' => true,
        'message' => "端口 {$port} 检查完成",
        'data' => [
            'newConnections' => $newConnections,
            'dataReceived' => $dataReceived
        ]
    ];
}

/**
 * 获取端口状态
 */
function getPortStatus($port) {
    $port = (int)$port;
    $configPath = getPortConfigPath($port);
    
    if (!file_exists($configPath)) {
        return [
            'success' => false,
            'message' => "端口 {$port} 未注册"
        ];
    }
    
    $config = json_decode(file_get_contents($configPath), true);
    if (!$config) {
        return [
            'success' => false,
            'message' => "端口 {$port} 配置文件损坏"
        ];
    }
    
    // 获取连接信息
    $connectionsPath = getPortConnectionsPath($port);
    $connections = [];
    if (file_exists($connectionsPath)) {
        $connections = json_decode(file_get_contents($connectionsPath), true) ?: [];
    }
    
    return [
        'success' => true,
        'data' => [
            'port' => $port,
            'pid' => $config['pid'] ?? null,
            'programName' => $config['programName'] ?? null,
            'status' => $config['status'] ?? 'unknown',
            'created' => $config['created'] ?? null,
            'address' => $config['address'] ?? '0.0.0.0',
            'connectionCount' => count($connections),
            'connections' => array_values($connections)
        ]
    ];
}

/**
 * 向端口发送数据（作为客户端）
 */
function sendDataToPort($host, $port, $data) {
    $port = (int)$port;
    
    if (!is_numeric($port) || $port < 1 || $port > 65535) {
        return ['success' => false, 'message' => '无效的端口号'];
    }
    
    if (empty($host)) {
        $host = '127.0.0.1';
    }
    
    $socket = @fsockopen($host, $port, $errno, $errstr, 5);
    
    if (!$socket) {
        return ['success' => false, 'message' => "无法连接到 {$host}:{$port}: {$errstr} (错误代码: {$errno})"];
    }
    
    $bytesWritten = fwrite($socket, $data);
    fclose($socket);
    
    return [
        'success' => true,
        'message' => "数据已发送到 {$host}:{$port}",
        'data' => [
            'bytesWritten' => $bytesWritten
        ]
    ];
}

/**
 * 获取所有已注册的端口
 */
function listPorts() {
    $ports = getAllPorts();
    return [
        'success' => true,
        'data' => $ports
    ];
}

// 获取操作类型
$action = $_GET['action'] ?? $_POST['action'] ?? '';

// 根据操作类型执行相应功能
switch ($action) {
    case 'register':
        // 注册端口监听
        $port = $_GET['port'] ?? $_POST['port'] ?? null;
        $pid = $_GET['pid'] ?? $_POST['pid'] ?? null;
        $programName = $_GET['programName'] ?? $_POST['programName'] ?? null;
        
        if ($port === null || $pid === null || $programName === null) {
            sendResponse(false, '缺少必需参数: port, pid, programName', null, 400);
        }
        
        $result = registerPort($port, $pid, $programName);
        if ($result['success']) {
            sendResponse(true, $result['message'], $result['data'] ?? null);
        } else {
            sendResponse(false, $result['message'], null, 400);
        }
        break;
        
    case 'unregister':
        // 取消端口监听
        $port = $_GET['port'] ?? $_POST['port'] ?? null;
        
        if ($port === null) {
            sendResponse(false, '缺少必需参数: port', null, 400);
        }
        
        $result = unregisterPort($port);
        if ($result['success']) {
            sendResponse(true, $result['message']);
        } else {
            sendResponse(false, $result['message'], null, 400);
        }
        break;
        
    case 'check':
        // 检查端口（接受新连接并读取数据）
        $port = $_GET['port'] ?? $_POST['port'] ?? null;
        
        if ($port === null) {
            sendResponse(false, '缺少必需参数: port', null, 400);
        }
        
        $result = checkPort($port);
        if ($result['success']) {
            sendResponse(true, $result['message'], $result['data'] ?? null);
        } else {
            sendResponse(false, $result['message'], null, 400);
        }
        break;
        
    case 'status':
        // 获取端口状态
        $port = $_GET['port'] ?? $_POST['port'] ?? null;
        
        if ($port === null) {
            sendResponse(false, '缺少必需参数: port', null, 400);
        }
        
        $result = getPortStatus($port);
        if ($result['success']) {
            sendResponse(true, '获取端口状态成功', $result['data']);
        } else {
            // 端口未注册是正常情况，返回 200 状态码而不是 400
            // 只有真正的错误（如配置文件损坏）才返回 400
            $isNormalCase = strpos($result['message'], '未注册') !== false;
            $httpCode = $isNormalCase ? 200 : 400;
            sendResponse(false, $result['message'], null, $httpCode);
        }
        break;
        
    case 'send':
        // 向端口发送数据
        $host = $_GET['host'] ?? $_POST['host'] ?? '127.0.0.1';
        $port = $_GET['port'] ?? $_POST['port'] ?? null;
        $data = $_GET['data'] ?? $_POST['data'] ?? null;
        
        if ($port === null || $data === null) {
            sendResponse(false, '缺少必需参数: port, data', null, 400);
        }
        
        $result = sendDataToPort($host, $port, $data);
        if ($result['success']) {
            sendResponse(true, $result['message'], $result['data'] ?? null);
        } else {
            sendResponse(false, $result['message'], null, 400);
        }
        break;
        
    case 'list':
        // 列出所有已注册的端口
        $result = listPorts();
        sendResponse(true, '获取端口列表成功', $result['data']);
        break;
        
    default:
        sendResponse(false, '未知的操作类型', null, 400);
        break;
}
