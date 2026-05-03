<?php
/**
 * Bilibili API proxy for ZerOS native client.
 * Provides a small allowlisted JSON proxy to avoid browser CORS and forbidden headers.
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['status' => 'error', 'message' => 'cURL extension is not available'], JSON_UNESCAPED_UNICODE);
    exit;
}

function sendJson($payload, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function param($name, $default = '') {
    return isset($_GET[$name]) ? trim((string) $_GET[$name]) : $default;
}

function positiveIntParam($name, $default, $max = null) {
    $value = isset($_GET[$name]) ? (int) $_GET[$name] : $default;
    if ($value < 1) $value = $default;
    if ($max !== null && $value > $max) $value = $max;
    return $value;
}

function bilibiliRequest($url, $accept = 'application/json') {
    $ch = curl_init();
    if ($ch === false) {
        sendJson(['status' => 'error', 'message' => 'Failed to initialize cURL'], 500);
    }

    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: ' . $accept,
        'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
        'Referer: https://www.bilibili.com/',
        'Origin: https://www.bilibili.com',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]);

    $body = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        sendJson(['status' => 'error', 'message' => $error ?: 'Proxy request failed'], 502);
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        sendJson([
            'status' => 'error',
            'message' => 'Bilibili request failed',
            'httpCode' => $httpCode
        ], 502);
    }

    return $body;
}

function proxyJson($url) {
    $raw = bilibiliRequest($url);
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        sendJson(['status' => 'error', 'message' => 'Invalid JSON response'], 502);
    }

    sendJson([
        'status' => 'success',
        'data' => $data
    ]);
}

$action = param('action');
$base = 'https://api.bilibili.com';
$liveBase = 'https://api.live.bilibili.com';

switch ($action) {
    case 'view':
        $bvid = param('bvid');
        $aid = param('aid');
        if ($bvid !== '') {
            proxyJson($base . '/x/web-interface/view?bvid=' . rawurlencode($bvid));
        }
        if ($aid !== '') {
            proxyJson($base . '/x/web-interface/view?aid=' . rawurlencode($aid));
        }
        sendJson(['status' => 'error', 'message' => 'Missing bvid or aid'], 400);
        break;

    case 'search':
        $keyword = param('keyword');
        if ($keyword === '') {
            sendJson(['status' => 'error', 'message' => 'Missing keyword'], 400);
        }
        $page = positiveIntParam('page', 1, 20);
        $pageSize = positiveIntParam('pageSize', 12, 30);
        proxyJson($base . '/x/web-interface/search/type?search_type=video&keyword=' . rawurlencode($keyword) . '&ps=' . $pageSize . '&pn=' . $page);
        break;

    case 'popular':
        $page = positiveIntParam('page', 1, 20);
        $pageSize = positiveIntParam('pageSize', 20, 50);
        proxyJson($base . '/x/web-interface/popular?ps=' . $pageSize . '&pn=' . $page);
        break;

    case 'weekly':
        $number = positiveIntParam('number', 1, 30);
        proxyJson($base . '/x/web-interface/popular/weekly?number=' . $number);
        break;

    case 'precious':
        $page = positiveIntParam('page', 1, 20);
        $pageSize = positiveIntParam('pageSize', 20, 50);
        proxyJson($base . '/x/web-interface/popular/precious?ps=' . $pageSize . '&pn=' . $page);
        break;

    case 'movieRanking':
        proxyJson($base . '/pgc/web/rank/list?season_type=2&day=3');
        break;

    case 'userVideos':
        $uid = param('uid');
        if ($uid === '') {
            sendJson(['status' => 'error', 'message' => 'Missing uid'], 400);
        }
        $page = positiveIntParam('page', 1, 20);
        $pageSize = positiveIntParam('pageSize', 10, 30);
        proxyJson($base . '/x/space/arc/search?mid=' . rawurlencode($uid) . '&ps=' . $pageSize . '&pn=' . $page . '&order=pubdate');
        break;

    case 'liveStatus':
        $uid = param('uid');
        if ($uid === '') {
            sendJson(['status' => 'error', 'message' => 'Missing uid'], 400);
        }
        proxyJson($liveBase . '/room/v1/Room/getRoomInfoOld?mid=' . rawurlencode($uid));
        break;

    case 'tags':
        $bvid = param('bvid');
        $aid = param('aid');
        $query = $bvid !== '' ? 'bvid=' . rawurlencode($bvid) : ($aid !== '' ? 'aid=' . rawurlencode($aid) : '');
        if ($query === '') {
            sendJson(['status' => 'error', 'message' => 'Missing bvid or aid'], 400);
        }
        proxyJson($base . '/x/web-interface/view/detail/tag?' . $query);
        break;

    case 'comments':
        $aid = param('aid');
        if ($aid === '') {
            sendJson(['status' => 'error', 'message' => 'Missing aid'], 400);
        }
        proxyJson($base . '/x/v2/reply/main?type=1&oid=' . rawurlencode($aid));
        break;

    case 'danmaku':
        $cid = param('cid');
        if ($cid === '') {
            sendJson(['status' => 'error', 'message' => 'Missing cid'], 400);
        }
        $xml = bilibiliRequest($base . '/x/v1/dm/list.so?oid=' . rawurlencode($cid), 'application/xml,text/xml,*/*');
        sendJson([
            'status' => 'success',
            'data' => [
                'raw_xml' => $xml
            ]
        ]);
        break;

    default:
        sendJson(['status' => 'error', 'message' => 'Unknown action: ' . $action], 400);
}
