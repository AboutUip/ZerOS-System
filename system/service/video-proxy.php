<?php
/**
 * 视频代理服务（多后端之一：PHP）
 * 用于代理外部视频请求，绕过 CORS/Referer 限制（如第三方短视频 API 返回的 CDN 链接）
 * 访问: GET /system/service/video-proxy.php?url=<encoded_video_url>
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Range');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$videoUrl = $_GET['url'] ?? '';
if (empty($videoUrl)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'URL parameter is required']);
    exit;
}

$videoUrl = urldecode($videoUrl);
if (!filter_var($videoUrl, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid URL format']);
    exit;
}

$scheme = parse_url($videoUrl, PHP_URL_SCHEME);
if (!in_array($scheme, ['http', 'https'])) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Only HTTP and HTTPS URLs are allowed']);
    exit;
}

if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'cURL extension is not available']);
    exit;
}

$path = parse_url($videoUrl, PHP_URL_PATH);
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$contentTypes = [
    'mp4' => 'video/mp4',
    'webm' => 'video/webm',
    'ogg' => 'video/ogg',
    'm3u8' => 'application/vnd.apple.mpegurl',
];
$contentType = $contentTypes[$ext] ?? 'video/mp4';

$ch = curl_init();
if ($ch === false) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Failed to initialize cURL']);
    exit;
}

curl_setopt($ch, CURLOPT_URL, $videoUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
curl_setopt($ch, CURLOPT_USERAGENT, 'ZerOS-VideoProxy/1.0');
curl_setopt($ch, CURLOPT_HEADER, true);

$headers = ['Accept: video/*', 'Accept-Encoding: identity'];
if (isset($_SERVER['HTTP_RANGE'])) {
    $headers[] = 'Range: ' . $_SERVER['HTTP_RANGE'];
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($ch);
if ($response === false) {
    $err = curl_error($ch);
    curl_close($ch);
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Proxy fetch failed', 'message' => $err]);
    exit;
}

$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

if ($httpCode < 200 || $httpCode >= 400) {
    http_response_code($httpCode);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Upstream error', 'http_code' => $httpCode, 'url' => $videoUrl]);
    exit;
}

if ($headerSize > 0 && strlen($response) > $headerSize) {
    $rawHeaders = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
} else {
    $rawHeaders = '';
    $body = $response;
}

$contentTypeFound = false;
$contentLengthFound = false;
foreach (explode("\r\n", $rawHeaders) as $line) {
    $line = trim($line);
    if ($line === '' || preg_match('/^HTTP\/[\d.]+ \d+/', $line)) continue;
    $lower = strtolower($line);
    if (strpos($lower, 'content-type:') === 0) {
        header($line);
        $contentTypeFound = true;
    } elseif (strpos($lower, 'content-length:') === 0 || strpos($lower, 'content-range:') === 0
        || strpos($lower, 'accept-ranges:') === 0 || strpos($lower, 'cache-control:') === 0
        || strpos($lower, 'expires:') === 0 || strpos($lower, 'last-modified:') === 0 || strpos($lower, 'etag:') === 0) {
        header($line);
        if (strpos($lower, 'content-length:') === 0) $contentLengthFound = true;
    }
}

if (!$contentTypeFound) {
    header('Content-Type: ' . $contentType);
}
if (!headers_sent()) {
    header('Cache-Control: public, max-age=3600');
}

echo $body;
exit;
