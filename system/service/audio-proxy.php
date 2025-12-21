<?php
/**
 * 音频代理服务
 * 用于代理外部音频文件请求，绕过 CORS 限制
 * 访问地址: http://localhost:8089/system/service/audio-proxy.php?url=https://example.com/audio.wav
 */

// 设置 CORS 头
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Range');

// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 只允许 GET 请求
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// 获取音频 URL
$audioUrl = $_GET['url'] ?? '';

if (empty($audioUrl)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'URL parameter is required']);
    exit;
}

// 验证 URL 格式
if (!filter_var($audioUrl, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid URL format']);
    exit;
}

// 只允许 HTTPS 和 HTTP 协议
$urlScheme = parse_url($audioUrl, PHP_URL_SCHEME);
if (!in_array($urlScheme, ['http', 'https'])) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Only HTTP and HTTPS URLs are allowed']);
    exit;
}

// 检查 cURL 扩展
if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'cURL extension is not available']);
    exit;
}

// 根据文件扩展名确定 Content-Type
$urlPath = parse_url($audioUrl, PHP_URL_PATH);
$extension = strtolower(pathinfo($urlPath, PATHINFO_EXTENSION));

$contentTypes = [
    'wav' => 'audio/wav',
    'mp3' => 'audio/mpeg',
    'ogg' => 'audio/ogg',
    'm4a' => 'audio/mp4',
    'aac' => 'audio/aac',
    'flac' => 'audio/flac',
    'webm' => 'audio/webm',
    'opus' => 'audio/opus'
];

$contentType = $contentTypes[$extension] ?? 'audio/wav';  // 默认为 wav

try {
    // 初始化 cURL
    $ch = curl_init();
    if ($ch === false) {
        throw new Exception('Failed to initialize cURL');
    }
    
    curl_setopt($ch, CURLOPT_URL, $audioUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);  // 返回响应，不直接输出
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);  // 跟随重定向
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);  // 最多跟随5次重定向
    // 临时禁用 SSL 验证（某些环境可能有问题，生产环境应启用）
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);  // 30秒超时
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);  // 10秒连接超时
    curl_setopt($ch, CURLOPT_USERAGENT, 'ZerOS-AudioProxy/1.0');
    curl_setopt($ch, CURLOPT_HEADER, true);  // 包含响应头
    
    // 支持 Range 请求（用于音频流式播放）
    $headers = ['Accept: audio/*', 'Accept-Encoding: identity'];
    if (isset($_SERVER['HTTP_RANGE'])) {
        $headers[] = 'Range: ' . $_SERVER['HTTP_RANGE'];
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    
    // 执行请求
    $response = curl_exec($ch);
    
    if ($response === false) {
        $error = curl_error($ch);
        $errno = curl_errno($ch);
        curl_close($ch);
        throw new Exception("cURL error ($errno): $error");
    }
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    
    // 检查 HTTP 状态码
    if ($httpCode < 200 || $httpCode >= 400) {
        http_response_code($httpCode);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'Failed to fetch audio',
            'http_code' => $httpCode,
            'url' => $audioUrl
        ]);
        exit;
    }
    
    // 分离响应头和响应体
    if ($headerSize > 0 && strlen($response) > $headerSize) {
        $headers = substr($response, 0, $headerSize);
        $body = substr($response, $headerSize);
    } else {
        $headers = '';
        $body = $response;
    }
    
    // 解析并转发响应头
    $headerLines = explode("\r\n", $headers);
    $contentTypeFound = false;
    $contentLengthFound = false;
    
    foreach ($headerLines as $headerLine) {
        $headerLine = trim($headerLine);
        if (empty($headerLine)) {
            continue;
        }
        
        // 跳过 HTTP 状态行
        if (preg_match('/^HTTP\/[\d.]+ \d+/', $headerLine)) {
            continue;
        }
        
        // 转发重要的响应头
        $headerLower = strtolower($headerLine);
        if (strpos($headerLower, 'content-type:') === 0) {
            header($headerLine);
            $contentTypeFound = true;
        } elseif (strpos($headerLower, 'content-length:') === 0) {
            header($headerLine);
            $contentLengthFound = true;
        } elseif (strpos($headerLower, 'content-range:') === 0 ||
                   strpos($headerLower, 'accept-ranges:') === 0 ||
                   strpos($headerLower, 'cache-control:') === 0 ||
                   strpos($headerLower, 'expires:') === 0 ||
                   strpos($headerLower, 'last-modified:') === 0 ||
                   strpos($headerLower, 'etag:') === 0) {
            header($headerLine);
        }
    }
    
    // 如果没有找到 Content-Type，设置默认值
    if (!$contentTypeFound) {
        header("Content-Type: {$contentType}");
    }
    
    // 设置缓存控制（允许缓存，但时间较短）
    if (!headers_sent()) {
        header('Cache-Control: public, max-age=3600');  // 缓存 1 小时
    }
    
    // 输出音频数据
    echo $body;
    exit;
    
} catch (Exception $e) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Failed to fetch audio',
        'message' => $e->getMessage()
    ]);
    exit;
}

