<?php
/**
 * 图片代理服务
 * 用于代理外部图片请求，避免 CORS 问题
 * 访问地址: http://localhost:8089/system/service/ImageProxy.php?url=https://api-v1.cenguigui.cn/api/pic/
 */

// 错误报告（开发环境）
error_reporting(E_ALL);
ini_set('display_errors', 0);  // 不直接显示错误，通过 JSON 返回

// 设置 CORS 头
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 检查 cURL 扩展
if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'cURL extension is not available']);
    exit;
}

// 获取目标 URL
$targetUrl = $_GET['url'] ?? '';

if (empty($targetUrl)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'URL parameter is required']);
    exit;
}

// URL 解码
$targetUrl = urldecode($targetUrl);

// 验证 URL 格式
if (!filter_var($targetUrl, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid URL format', 'url' => $targetUrl]);
    exit;
}

// 只允许 HTTPS 请求（安全考虑）
$urlScheme = parse_url($targetUrl, PHP_URL_SCHEME);
if ($urlScheme !== 'https') {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Only HTTPS URLs are allowed']);
    exit;
}

try {
    // 初始化 cURL
    $ch = curl_init();
    if ($ch === false) {
        throw new Exception('Failed to initialize cURL');
    }
    
    curl_setopt($ch, CURLOPT_URL, $targetUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);  // 跟随重定向
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);  // 最多跟随5次重定向
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);  // 临时禁用 SSL 验证（某些环境可能有问题）
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);  // 30秒超时
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);  // 10秒连接超时
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    curl_setopt($ch, CURLOPT_HEADER, true);  // 包含响应头

    // 执行请求
    $response = curl_exec($ch);
    
    if ($response === false) {
        $error = curl_error($ch);
        $errno = curl_errno($ch);
        curl_close($ch);
        throw new Exception("cURL error ($errno): $error");
    }
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    // 检查 HTTP 状态码
    if ($httpCode < 200 || $httpCode >= 300) {
        http_response_code($httpCode);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Request failed', 'httpCode' => $httpCode, 'url' => $targetUrl]);
        exit;
    }

    // 分离响应头和响应体
    if ($headerSize > 0 && strlen($response) > $headerSize) {
        $body = substr($response, $headerSize);
    } else {
        $body = $response;
    }

    // 检查内容类型是否为图片
    $isImage = false;
    if ($contentType && strpos(strtolower($contentType), 'image/') !== false) {
        $isImage = true;
    }
    
    // 如果无法从 Content-Type 判断，尝试从响应头中查找
    if (!$isImage && $headerSize > 0) {
        $headerText = substr($response, 0, $headerSize);
        if (preg_match('/content-type:\s*([^\r\n]+)/i', $headerText, $matches)) {
            $contentTypeFromHeader = trim($matches[1]);
            if (strpos(strtolower($contentTypeFromHeader), 'image/') !== false) {
                $isImage = true;
                $contentType = $contentTypeFromHeader;
            }
        }
    }
    
    // 如果仍然无法确定，但响应不为空，假设是图片（某些服务器可能不发送 Content-Type）
    if (!$isImage && strlen($body) > 0) {
        // 检查文件魔数（图片文件签名）
        $magicBytes = substr($body, 0, 4);
        $imageSignatures = [
            "\xFF\xD8\xFF",  // JPEG
            "\x89PNG",       // PNG
            "GIF8",          // GIF
            "RIFF"           // WebP (部分)
        ];
        foreach ($imageSignatures as $signature) {
            if (strpos($magicBytes, $signature) === 0) {
                $isImage = true;
                break;
            }
        }
    }
    
    if (!$isImage) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'Response is not an image',
            'contentType' => $contentType,
            'bodySize' => strlen($body)
        ]);
        exit;
    }

    // 设置响应头
    header('Content-Type: ' . ($contentType ?: 'image/jpeg'));
    header('Cache-Control: public, max-age=3600');  // 缓存1小时

    // 输出图片数据
    echo $body;
    exit;
    
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Internal server error',
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
    exit;
}

