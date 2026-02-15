<?php
/**
 * 阿里云 DashScope（通义千问）AI 代理服务
 * 用于代理 AI 请求，绕过浏览器 CORS 限制
 * 前端 POST 本接口，代理转发至阿里云 DashScope API（北京地域）
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// 使用兼容 OpenAI 格式的端点（推荐，格式更标准）
$DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true);

if (!is_array($body)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

// 从前端请求体提取鉴权信息（_auth 由 aiassistant 传入）
$_auth = isset($body['_auth']) && is_array($body['_auth']) ? $body['_auth'] : [];
$API_KEY = isset($_auth['apiKey']) ? (string) $_auth['apiKey'] : '';
unset($body['_auth']);

if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'cURL extension is not available']);
    exit;
}

$ch = curl_init();
if ($ch === false) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Failed to initialize cURL']);
    exit;
}

curl_setopt($ch, CURLOPT_URL, $DASHSCOPE_API_URL);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $API_KEY
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Proxy request failed',
        'message' => $curlError ? $curlError : 'Unknown cURL error'
    ]);
    exit;
}

// 尝试解析响应以检查错误
$responseData = json_decode($response, true);
if ($httpCode >= 400 && is_array($responseData)) {
    // 保持原始错误响应格式
    http_response_code($httpCode);
    header('Content-Type: application/json');
    echo $response;
    exit;
}

http_response_code($httpCode);
header('Content-Type: application/json');
echo $response;
