<?php
/**
 * 讯飞星火 AI 代理服务
 * 用于代理 AI 请求，绕过浏览器 CORS 限制
 * 前端 POST 本接口，代理转发至讯飞 API
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

$SPARK_API_URL = 'https://spark-api-open.xf-yun.com/x2/chat/completions';

$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true);

if (!is_array($body)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

// 从前端请求体提取鉴权信息（_auth 由 aiassistant 传入，未提供时使用空值将导致 API 鉴权失败）
$_auth = isset($body['_auth']) && is_array($body['_auth']) ? $body['_auth'] : [];
$SPARK_APP_ID = isset($_auth['appId']) ? (string) $_auth['appId'] : '';
$SPARK_API_PASSWORD = isset($_auth['apiPassword']) ? (string) $_auth['apiPassword'] : '';
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

curl_setopt($ch, CURLOPT_URL, $SPARK_API_URL);
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
    'Authorization: Bearer ' . $SPARK_API_PASSWORD,
    'X-App-Id: ' . $SPARK_APP_ID
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
        'message' => $curlError
    ]);
    exit;
}

http_response_code($httpCode);
header('Content-Type: application/json');
echo $response;
