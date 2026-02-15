<?php
/**
 * 浏览器网页代理服务
 * 用于代理外部网页请求，绕过 X-Frame-Options、CSP frame-ancestors 等 iframe 限制
 * 使 ZerOS 内置浏览器能够正常加载各类网站
 * 
 * 访问地址: http://localhost:8089/system/service/BrowserProxy.php?url=https://example.com
 */

// 错误报告（开发环境）
error_reporting(E_ALL);
ini_set('display_errors', 0);
session_start();

// 允许 GET 和 POST 请求
$requestMethod = $_SERVER['REQUEST_METHOD'];
if (!in_array($requestMethod, ['GET', 'POST'])) {
    http_response_code(405);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Method not allowed';
    exit;
}

// 获取目标 URL
$targetUrl = $_GET['url'] ?? '';

if (empty($targetUrl)) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'URL parameter is required';
    exit;
}

// URL 解码（支持多次编码，如 %253A -> %3A -> :）
$targetUrl = $targetUrl;
for ($i = 0; $i < 5; $i++) {
    $decoded = rawurldecode($targetUrl);
    if ($decoded === $targetUrl) break;
    $targetUrl = $decoded;
}

// 验证 URL 格式（filter_var 对复杂查询串可能失败，改用 parse_url）
$parsed = parse_url($targetUrl);
if (!$parsed || empty($parsed['host']) || !isset($parsed['scheme'])) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Invalid URL format';
    exit;
}

// 只允许 HTTP/HTTPS，拒绝 data:、javascript: 等被错误解析的 URL
$urlScheme = parse_url($targetUrl, PHP_URL_SCHEME);
if (!in_array($urlScheme, ['http', 'https'])) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Only HTTP and HTTPS URLs are allowed';
    exit;
}
if (stripos($targetUrl, 'data:') !== false || stripos($targetUrl, 'javascript:') !== false) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Invalid URL: data and javascript schemes are not allowed';
    exit;
}

// 检查 cURL 扩展
if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'cURL extension is not available';
    exit;
}

// 获取代理自身的 base URL（用于重写 HTML 中的链接）
$proxyBasePath = '/system/service/BrowserProxy.php';

try {
    $ch = curl_init();
    if ($ch === false) {
        throw new Exception('Failed to initialize cURL');
    }
    
    $cookieDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'zeros_browserproxy_cookies';
    if (!is_dir($cookieDir)) {
        @mkdir($cookieDir, 0700, true);
    }
    $sessionId = session_id();
    $cookieFile = $cookieDir . DIRECTORY_SEPARATOR . 'cookie_' . preg_replace('#[^a-zA-Z0-9_-]#', '', $sessionId) . '.txt';
    
    curl_setopt($ch, CURLOPT_URL, $targetUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_REFERER, $targetUrl);
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    curl_setopt($ch, CURLOPT_HEADER, false);
    curl_setopt($ch, CURLOPT_ENCODING, '');  // 支持 gzip 等
    
    $headers = [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
        'Sec-CH-UA: "Chromium";v="120", "Google Chrome";v="120", "Not_A Brand";v="24"',
        'Sec-CH-UA-Mobile: ?0',
        'Sec-CH-UA-Platform: "Windows"',
    ];
    
    if ($requestMethod === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        $contentType = $_SERVER['CONTENT_TYPE'] ?? 'application/x-www-form-urlencoded';
        $postBody = file_get_contents('php://input');
        if (!empty($postBody)) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postBody);
            $headers[] = 'Content-Type: ' . $contentType;
        } else {
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($_POST));
        }
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    
    $response = curl_exec($ch);
    
    if ($response === false) {
        $error = curl_error($ch);
        $errno = curl_errno($ch);
        curl_close($ch);
        throw new Exception("cURL error ($errno): $error");
    }
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);
    
    $body = $response;
    
    $resolvedTargetUrl = !empty($effectiveUrl) ? $effectiveUrl : $targetUrl;
    // 解析目标 URL 用于重写相对路径
    $baseUrl = rtrim($resolvedTargetUrl, '/');
    $parsedTarget = parse_url($resolvedTargetUrl);
    $targetOrigin = ($parsedTarget['scheme'] ?? 'https') . '://' . ($parsedTarget['host'] ?? '');
    $targetPath = isset($parsedTarget['path']) ? preg_replace('#/[^/]*$#', '/', $parsedTarget['path']) : '/';
    $targetBase = $targetOrigin . $targetPath;
    
    // 检测是否为 HTML 内容
    $isHtml = false;
    $isCss = false;
    if ($contentType && (stripos($contentType, 'text/html') !== false || stripos($contentType, 'application/xhtml') !== false)) {
        $isHtml = true;
    }
    if ($contentType && stripos($contentType, 'text/css') !== false) {
        $isCss = true;
    }
    
    // 对于 HTML，重写其中的 URL 使其通过代理加载
    if ($isHtml && !empty($body)) {
        $requestScheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $requestHost = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $proxyBaseUrl = $requestScheme . '://' . $requestHost . $proxyBasePath;
        $body = rewriteHtmlUrls($body, $resolvedTargetUrl, $targetBase, $targetOrigin, $proxyBaseUrl);
    } elseif ($isCss && !empty($body)) {
        $requestScheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $requestHost = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $proxyBaseUrl = $requestScheme . '://' . $requestHost . $proxyBasePath;
        $body = rewriteCssUrls($body, $resolvedTargetUrl, $proxyBaseUrl);
    }
    
    if ($httpCode >= 400 && empty($body)) {
        http_response_code($httpCode);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>加载失败</title></head><body>';
        echo '<h2>页面加载失败</h2><p>HTTP ' . intval($httpCode) . '</p>';
        echo '<p>URL: ' . htmlspecialchars($resolvedTargetUrl) . '</p></body></html>';
        exit;
    }
    
    // 设置响应头 - 关键：不包含 X-Frame-Options、CSP frame-ancestors 等限制 iframe 的头
    // 这样 iframe 可以正常显示代理返回的内容
    header('Content-Type: ' . ($contentType ?: 'text/html; charset=utf-8'));
    header('Cache-Control: public, max-age=300');  // 缓存 5 分钟
    header('X-Content-Type-Options: nosniff');     // 允许正确识别类型
    
    // 注意：故意不设置 X-Frame-Options，允许在 iframe 中显示
    
    echo $body;
    exit;
    
} catch (Exception $e) {
    http_response_code(502);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>加载失败</title></head><body>';
    echo '<h2>页面加载失败</h2><p>' . htmlspecialchars($e->getMessage()) . '</p>';
    echo '<p>URL: ' . htmlspecialchars($targetUrl) . '</p></body></html>';
    exit;
}

/**
 * 重写 HTML 中的 URL，使链接和资源通过代理加载（全部经代理以绕过 CORS）
 * @param string $proxyBaseUrl 代理完整 URL（用于生成绝对路径，避免 base 标签影响）
 * @param string $targetOrigin 目标站 origin，用于注入 base 标签使 JS 根相对路径正确解析
 */
function rewriteHtmlUrls($html, $pageUrl, $baseUrl, $targetOrigin, $proxyBaseUrl) {
    // 注入 <base href="targetOrigin/"> 使 JS 中 /rp/xxx.js 等根相对路径解析到目标站
    $baseTag = '<base href="' . htmlspecialchars(rtrim($targetOrigin, '/') . '/') . '">';
    if (stripos($html, '<head') !== false) {
        $html = preg_replace('#(<head[^>]*>)#i', '$1' . $baseTag, $html, 1);
    } else {
        $html = $baseTag . $html;
    }
    
    // 对 href、src、action 等属性中的 URL 进行重写，使用绝对代理 URL
    $rewriteCallback = function($match) use ($baseUrl, $proxyBaseUrl, $pageUrl) {
        $fullMatch = $match[0];
        $attrName = strtolower($match[1]);
        $quote = $match[2];
        $url = $match[3];
        
        // 跳过特殊协议
        if (preg_match('#^(data|javascript|mailto|tel|blob|#|about):#i', trim($url))) {
            return $fullMatch;
        }
        
        // 跳过已经是代理 URL 的
        if (strpos($url, 'BrowserProxy.php') !== false) {
            return $fullMatch;
        }
        
        // 解析为绝对 URL
        $absoluteUrl = resolveUrl($url, $baseUrl);
        if (!$absoluteUrl || stripos($absoluteUrl, 'data:') !== false) {
            return $fullMatch;
        }
        
        $proxyUrl = $proxyBaseUrl . '?url=' . rawurlencode($absoluteUrl);
        return $attrName . $quote . $proxyUrl . $quote;
    };
    
    // 匹配 href="...", src="...", action="..." 等
    $html = preg_replace_callback(
        '#\s((?:href|src|action)\s*=\s*)(["\'])([^"\']*)\2#i',
        $rewriteCallback,
        $html
    );
    
    // 处理 style 属性中的 url(...)
    $html = preg_replace_callback(
        '#url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)#i',
        function($match) use ($baseUrl, $proxyBaseUrl) {
            $url = trim($match[1]);
            if (preg_match('#^(data|javascript|#)#i', $url)) {
                return $match[0];
            }
            $absoluteUrl = resolveUrl($url, $baseUrl);
            if ($absoluteUrl && stripos($absoluteUrl, 'data:') === false) {
                $proxyUrl = $proxyBaseUrl . '?url=' . rawurlencode($absoluteUrl);
                return 'url("' . $proxyUrl . '")';
            }
            return $match[0];
        },
        $html
    );
    
    // 移除原有的 <base> 标签（我们已注入新的 base 指向目标站）
    $html = preg_replace('#<base\s+[^>]*href\s*=\s*["\'][^"\']*["\'][^>]*>#i', '<!-- base replaced by proxy -->', $html);
    
    // 将 body 中的 CSP meta 移至 head，消除 "meta outside head" 警告（不修改策略内容）
    $cspPattern = '#<meta\s[^>]*http-equiv\s*=\s*["\']Content-Security-Policy["\'][^>]*>#i';
    if (preg_match_all($cspPattern, $html, $cspMatches) && !empty($cspMatches[0])) {
        $cspTags = $cspMatches[0];
        $html = preg_replace($cspPattern, '<!-- CSP meta moved to head -->', $html);
        $html = preg_replace('#</head>#i', implode("\n", $cspTags) . "\n</head>", $html, 1);
    }
    
    return $html;
}

function rewriteCssUrls($css, $baseUrl, $proxyBaseUrl) {
    $css = preg_replace_callback(
        '#url\s*\(\s*([\'"]?)([^\'")\s]+)\1\s*\)#i',
        function($match) use ($baseUrl, $proxyBaseUrl) {
            $url = trim($match[2]);
            if (preg_match('#^(data|javascript|mailto|tel|blob|#)#i', $url)) {
                return $match[0];
            }
            $absoluteUrl = resolveUrl($url, $baseUrl);
            if (!$absoluteUrl) {
                return $match[0];
            }
            $proxyUrl = $proxyBaseUrl . '?url=' . rawurlencode($absoluteUrl);
            return 'url("' . $proxyUrl . '")';
        },
        $css
    );

    $css = preg_replace_callback(
        '#@import\s+(?:url\()?\s*([\'"]?)([^\'")\s]+)\1\s*\)?([^;]*);#i',
        function($match) use ($baseUrl, $proxyBaseUrl) {
            $url = trim($match[2]);
            if (preg_match('#^(data|javascript|mailto|tel|blob|#)#i', $url)) {
                return $match[0];
            }
            $absoluteUrl = resolveUrl($url, $baseUrl);
            if (!$absoluteUrl) {
                return $match[0];
            }
            $proxyUrl = $proxyBaseUrl . '?url=' . rawurlencode($absoluteUrl);
            $media = trim($match[3] ?? '');
            return '@import url("' . $proxyUrl . '")' . ($media ? ' ' . $media : '') . ';';
        },
        $css
    );

    return $css;
}

/**
 * 将相对 URL 解析为绝对 URL
 */
function resolveUrl($url, $baseUrl) {
    $url = trim($url);
    if (empty($url)) {
        return null;
    }
    
    // 不解析 data:、javascript: 等内联协议（不应代理）
    if (preg_match('#^(data|javascript|mailto|tel|blob|#|about):#i', $url)) {
        return null;
    }
    
    // 已经是绝对 URL
    if (preg_match('#^https?://#i', $url)) {
        return $url;
    }
    
    $parsedBase = parse_url($baseUrl);
    $scheme = $parsedBase['scheme'] ?? 'https';
    $host = $parsedBase['host'] ?? '';
    $path = $parsedBase['path'] ?? '/';
    $port = isset($parsedBase['port']) ? ':' . $parsedBase['port'] : '';
    
    if ($url[0] === '/') {
        if (strlen($url) > 1 && $url[1] === '/') {
            return $scheme . ':' . $url;
        }
        // 避免 /data:... 被解析为 https://domain.com/data:...
        if (preg_match('#^/data:#i', $url)) {
            return null;
        }
        return $scheme . '://' . $host . $port . $url;
    }
    
    if ($url[0] === '?') {
        $path = preg_replace('#\?.*$#', '', $path);
        return $scheme . '://' . $host . $port . $path . $url;
    }
    
    if ($url[0] === '#') {
        $baseWithoutFragment = preg_replace('##.*$#', '', $baseUrl);
        return $baseWithoutFragment . $url;
    }
    
    // 相对路径（如 ./data:image/... 会产生含 data: 的无效 URL，需拒绝）
    $dir = preg_replace('#/[^/]*$#', '/', $path);
    $resolved = $dir . $url;
    $resolved = normalizePath($resolved);
    $result = $scheme . '://' . $host . $port . $resolved;
    if (stripos($result, 'data:') !== false) {
        return null;
    }
    return $result;
}

/**
 * 规范化路径（处理 ./ 和 ../）
 */
function normalizePath($path) {
    $parts = explode('/', $path);
    $result = [];
    foreach ($parts as $part) {
        if ($part === '' || $part === '.') {
            continue;
        }
        if ($part === '..') {
            array_pop($result);
            continue;
        }
        $result[] = $part;
    }
    return '/' . implode('/', $result);
}
