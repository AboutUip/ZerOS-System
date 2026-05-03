<?php
/**
 * Generic browser proxy for ZerOS Browser/WebView.
 * Proxies http(s) pages and resources so iframe content can run inside ZerOS.
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'cURL extension is not available'], JSON_UNESCAPED_UNICODE);
    exit;
}

function failProxy($code, $message) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function normalizeTargetUrl($raw) {
    $url = trim((string) $raw);
    for ($i = 0; $i < 3; $i++) {
        $decoded = rawurldecode($url);
        if ($decoded === $url) break;
        $url = $decoded;
    }
    if ($url === '' || preg_match('/^\s*(javascript|data|file):/i', $url)) {
        return null;
    }
    if (strpos($url, '//') === 0) {
        $url = 'https:' . $url;
    }
    $scheme = parse_url($url, PHP_URL_SCHEME);
    if (!in_array($scheme, ['http', 'https'], true)) {
        return null;
    }
    $host = parse_url($url, PHP_URL_HOST);
    if ($host === 'bfs') {
        $path = parse_url($url, PHP_URL_PATH) ?: '/';
        $query = parse_url($url, PHP_URL_QUERY);
        $url = 'https://i0.hdslb.com/bfs' . $path . ($query ? '?' . $query : '');
    }
    return $url;
}

function serviceOrigin() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host;
}

function proxiedUrl($targetUrl) {
    return serviceOrigin() . '/system/service/DISK/D/application/browser/proxy.php?url=' . rawurlencode($targetUrl);
}

function isOptionalBilibiliScript($url) {
    return preg_match('#/(b-mirror|biliMirror|log-reporter|bili-collect|bili-user-fingerprint|reporter-pb|bmg/register)/#i', $url)
        || preg_match('#/(biliMirror\.umd\.mini|fallback|log-reporter|bili-collect|bili-user-fingerprint|index)\.js#i', $url);
}

function isImageRequest($url, $contentType = '') {
    return stripos($contentType, 'image/') === 0
        || preg_match('#\.(png|jpe?g|gif|webp|avif|svg)(@[^/?#]*)?(\?|#|$)#i', $url);
}

function sendOptionalScriptFallback() {
    http_response_code(200);
    header('Content-Type: application/javascript; charset=utf-8', true);
    header('Cache-Control: public, max-age=60', true);
    echo '/* ZerOS proxy: optional Bilibili telemetry script suppressed */';
    exit;
}

function sendTransparentImageFallback() {
    http_response_code(200);
    header('Content-Type: image/png', true);
    header('Cache-Control: public, max-age=60', true);
    echo base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=');
    exit;
}

function absoluteUrl($url, $baseUrl) {
    $url = trim((string) $url);
    if ($url === '' || preg_match('/^(#|javascript:|data:|mailto:|tel:)/i', $url)) {
        return null;
    }
    if (strpos($url, '//') === 0) {
        return 'https:' . $url;
    }
    if (preg_match('/^https?:\/\//i', $url)) {
        return $url;
    }
    $base = parse_url($baseUrl);
    if (!$base || empty($base['scheme']) || empty($base['host'])) {
        return null;
    }
    $origin = $base['scheme'] . '://' . $base['host'] . (isset($base['port']) ? ':' . $base['port'] : '');
    if ($url[0] === '/') {
        return $origin . $url;
    }
    $path = isset($base['path']) ? $base['path'] : '/';
    $dir = preg_replace('#/[^/]*$#', '/', $path);
    return $origin . $dir . $url;
}

function injectClientScript($targetUrl) {
    $encoded = json_encode($targetUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return '<script>
(function(){
  var currentUrl = ' . $encoded . ';
  function proxyUrl(url) {
    try {
      var absolute = new URL(url, currentUrl).href;
      if (!/^https?:\/\//i.test(absolute)) return url;
      return window.location.origin + "/system/service/DISK/D/application/browser/proxy.php?url=" + encodeURIComponent(absolute);
    } catch (e) {
      return url;
    }
  }
  var openInFrame = function(url) {
    if (url) window.location.href = proxyUrl(url);
    return null;
  };
  try {
    Object.defineProperty(window, "open", {
      value: openInFrame,
      writable: false,
      configurable: false
    });
  } catch (e) {
    window.open = openInFrame;
  }
  document.addEventListener("click", function(event) {
    var node = event.target;
    while (node && node.tagName !== "A") node = node.parentElement;
    if (!node) return;
    var href = node.getAttribute("href");
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) return;
    event.preventDefault();
    event.stopPropagation();
    window.location.href = proxyUrl(href);
  }, true);
  document.addEventListener("submit", function(event) {
    var form = event.target;
    if (!form || form.tagName !== "FORM") return;
    var action = form.getAttribute("action") || window.location.href;
    if (!/^https?:|^\//i.test(action)) return;
    event.preventDefault();
    event.stopPropagation();
    window.location.href = proxyUrl(action);
  }, true);
})();
</script>';
}

function rewriteHtml($html, $targetUrl) {
    $attrs = ['src', 'href', 'action', 'poster'];
    foreach ($attrs as $attr) {
        $html = preg_replace_callback('/\b' . $attr . '\s*=\s*(["\'])(.*?)\1/i', function ($m) use ($attr, $targetUrl) {
            $value = html_entity_decode($m[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $absolute = absoluteUrl($value, $targetUrl);
            if (!$absolute) return $m[0];
            return $attr . '=' . $m[1] . htmlspecialchars(proxiedUrl($absolute), ENT_QUOTES, 'UTF-8') . $m[1];
        }, $html);
    }

    // Some Bilibili pages create malformed protocol-relative image paths like //bfs/...
    $html = str_replace(['https://bfs/', 'http://bfs/', '//bfs/'], ['https://i0.hdslb.com/bfs/', 'https://i0.hdslb.com/bfs/', 'https://i0.hdslb.com/bfs/'], $html);

    $baseTag = '<base href="' . htmlspecialchars($targetUrl, ENT_QUOTES, 'UTF-8') . '">';
    $inject = $baseTag . injectClientScript($targetUrl);

    if (preg_match('/<head\b[^>]*>/i', $html)) {
        $html = preg_replace('/<head\b([^>]*)>/i', '<head$1>' . $inject, $html, 1);
    } else {
        $html = $inject . $html;
    }

    return $html;
}

$targetUrl = normalizeTargetUrl($_GET['url'] ?? '');
if (!$targetUrl) {
    failProxy(400, 'Invalid or missing url');
}

$ch = curl_init($targetUrl);
if ($ch === false) {
    failProxy(500, 'Failed to initialize cURL');
}

$headers = [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept: ' . ($_SERVER['HTTP_ACCEPT'] ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
    'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    'Referer: https://www.bilibili.com/'
];
if (isset($_SERVER['HTTP_RANGE'])) {
    $headers[] = 'Range: ' . $_SERVER['HTTP_RANGE'];
}

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}

$raw = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'application/octet-stream';
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$error = curl_error($ch);
curl_close($ch);

if ($raw === false) {
    if (isOptionalBilibiliScript($targetUrl)) {
        sendOptionalScriptFallback();
    }
    if (isImageRequest($targetUrl)) {
        sendTransparentImageFallback();
    }
    failProxy(502, $error ?: 'Proxy request failed');
}

$body = $headerSize > 0 ? substr($raw, $headerSize) : $raw;

if ($httpCode >= 500) {
    if (isOptionalBilibiliScript($targetUrl)) {
        sendOptionalScriptFallback();
    }
    if (isImageRequest($targetUrl, $contentType)) {
        sendTransparentImageFallback();
    }
}

http_response_code($httpCode);

if (stripos($contentType, 'text/html') !== false) {
    header('Content-Type: text/html; charset=utf-8', true);
    header('Content-Security-Policy: frame-ancestors *', true);
    header('Permissions-Policy: unload=(self)', true);
    echo rewriteHtml($body, $targetUrl);
    exit;
}

header('Content-Type: ' . $contentType, true);
header('Cache-Control: public, max-age=300', true);
header('Permissions-Policy: unload=(self)', true);
echo $body;
