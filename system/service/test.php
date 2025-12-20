<?php
/**
 * PHP 服务测试接口
 * 用于验证 PHP 服务是否正常运行
 * 访问地址: http://localhost:8089/system/service/test.php
 */

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

// 获取请求方法
$method = $_SERVER['REQUEST_METHOD'];

// 准备响应数据
$response = [
    'status' => 'success',
    'message' => 'PHP 服务运行正常',
    'timestamp' => date('Y-m-d H:i:s'),
    'timestamp_unix' => time(),
    'server' => [
        'php_version' => PHP_VERSION,
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
        'request_method' => $method,
        'request_uri' => $_SERVER['REQUEST_URI'] ?? '',
        'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'Unknown'
    ],
    'request' => [
        'method' => $method,
        'get_params' => $_GET,
        'post_params' => $_POST,
        'headers' => getallheaders()
    ],
    'data' => [
        'test_string' => 'Hello from PHP Service!',
        'test_number' => 12345,
        'test_boolean' => true,
        'test_array' => ['item1', 'item2', 'item3'],
        'test_object' => [
            'key1' => 'value1',
            'key2' => 'value2',
            'nested' => [
                'nested_key' => 'nested_value'
            ]
        ]
    ]
];

// 根据请求方法返回不同的数据
if ($method === 'POST') {
    // POST 请求：返回请求体数据
    $rawInput = file_get_contents('php://input');
    $inputData = json_decode($rawInput, true);
    
    if ($inputData) {
        $response['received_data'] = $inputData;
        $response['message'] = 'POST 请求已接收并处理';
    } else {
        $response['received_data'] = $rawInput;
        $response['message'] = 'POST 请求已接收（非 JSON 格式）';
    }
} elseif ($method === 'GET') {
    // GET 请求：返回查询参数
    if (!empty($_GET)) {
        $response['message'] = 'GET 请求已接收，包含查询参数';
    } else {
        $response['message'] = 'GET 请求已接收';
    }
}

// 设置 HTTP 状态码
http_response_code(200);

// 输出 JSON 响应
echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

?>
