<?php
/**
 * ZerOS PHP 内置服务器路由脚本
 * 用于处理文件请求并设置正确的 MIME 类型
 * 
 * 使用方法：
 * php -S localhost:8089 router.php
 */

$requestUri = $_SERVER['REQUEST_URI'];
$requestPath = parse_url($requestUri, PHP_URL_PATH);

// 移除查询字符串
$requestPath = strtok($requestPath, '?');

// 如果请求的是 PHP 文件或已存在的服务文件，直接返回 false（让 PHP 处理）
if (preg_match('/\.php$/', $requestPath) || 
    strpos($requestPath, '/service/') === 0) {
    return false;
}

// 构建实际文件路径
$filePath = __DIR__ . $requestPath;

// 如果文件不存在，返回 404
if (!file_exists($filePath) || !is_file($filePath)) {
    http_response_code(404);
    echo "File not found: " . htmlspecialchars($requestPath);
    return true;
}

// 根据文件扩展名设置 MIME 类型
$extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
$mimeTypes = [
    'js' => 'application/javascript',
    'mjs' => 'application/javascript',
    'cjs' => 'application/javascript',
    'json' => 'application/json',
    'css' => 'text/css',
    'html' => 'text/html',
    'htm' => 'text/html',
    'wasm' => 'application/wasm',
    'txt' => 'text/plain',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'task' => 'application/octet-stream'  // MediaPipe model files
];

$mimeType = $mimeTypes[$extension] ?? 'application/octet-stream';

// 设置正确的 MIME 类型
if ($extension === 'wasm') {
    header('Content-Type: application/wasm');
} else {
    header('Content-Type: ' . $mimeType . '; charset=utf-8');
}

// 设置缓存头
header('Cache-Control: public, max-age=3600');

// 对于 WASM 文件，使用二进制模式输出
if ($extension === 'wasm') {
    header('Content-Length: ' . filesize($filePath));
    readfile($filePath);
    return true;
}

// 对于其他文件，直接输出
readfile($filePath);
return true;

