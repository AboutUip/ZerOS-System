<?php
/**
 * PHP 服务检测脚本
 * 用于安装程序检测PHP服务是否正常运行
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

// 简单检测响应
$response = [
    'status' => 'success',
    'message' => 'PHP 服务运行正常',
    'php_version' => PHP_VERSION,
    'timestamp' => date('Y-m-d H:i:s')
];

http_response_code(200);
echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

?>

