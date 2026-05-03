<?php
/**
 * 浏览器程序内代理入口：将请求转发到 system/service/BrowserProxy.php，使 iframe 从本目录加载，便于同目录 Service Worker 管控。
 * 使用：?url= 目标地址（与 BrowserProxy.php 一致）
 */
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$base = $scheme . '://' . $host;
$backend = $base . '/system/service/BrowserProxy.php';
$backendUrl = $backend . (isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== '' ? '?' . $_SERVER['QUERY_STRING'] : '');

$ch = curl_init($backendUrl);
if (!$ch) {
    http_response_code(502);
    exit;
}
$opts = [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 5,
    CURLOPT_TIMEOUT => 30,
];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $opts[CURLOPT_POST] = true;
    $opts[CURLOPT_POSTFIELDS] = file_get_contents('php://input');
    $ct = $_SERVER['CONTENT_TYPE'] ?? null;
    if ($ct) {
        $opts[CURLOPT_HTTPHEADER] = ['Content-Type: ' . $ct];
    }
}
curl_setopt_array($ch, $opts);
$raw = curl_exec($ch);
$err = curl_errno($ch);
curl_close($ch);

if ($err || $raw === false) {
    http_response_code(502);
    exit;
}

$split = preg_split('#\r?\n\r?\n#', $raw, 2);
$headers = $split[0];
$body = isset($split[1]) ? $split[1] : '';
// 不转发 Transfer-Encoding，避免与后端 chunked 冲突导致 ERR_INVALID_CHUNKED_ENCODING；用 Content-Length 输出
$skipHeaders = [
    'transfer-encoding',
    'connection',
    'content-length',
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers'
];
foreach (preg_split('#\r?\n#', $headers) as $line) {
    if (preg_match('#^HTTP/#', $line)) {
        if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $m)) {
            http_response_code((int) $m[1]);
        }
        continue;
    }
    if (preg_match('#^([^:]+):\s*(.*)$#', $line, $m)) {
        $name = strtolower(trim($m[1]));
        if (in_array($name, $skipHeaders, true)) {
            continue;
        }
        header($m[1] . ': ' . $m[2], true);
    }
}
header('Content-Length: ' . strlen($body));
echo $body;
