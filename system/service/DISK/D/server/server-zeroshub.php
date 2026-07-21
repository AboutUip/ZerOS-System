<?php
/**
 * ZerOS DevBridge - PHP 桥接端点
 * 由 DevBridge 应用自动生成和管理
 * 安全机制：Token 认证 + 速率限制 + 输入校验
 */

define('ZEROSHUB_TOKEN', "zos_replace_me_regenerate_via_zeroshub_app");
define('MAX_REQUESTS_PER_MINUTE', 60);
define('MAX_REQUEST_SIZE', 65536);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

function fail($code, $msg) {
    http_response_code($code);
    echo json_encode(['status' => 'error', 'message' => $msg]);
    exit;
}

function ok($data = null) {
    echo json_encode(['status' => 'success', 'data' => $data]);
    exit;
}

function validate_token() {
    $token = isset($_GET['token']) ? $_GET['token'] : (isset($_POST['token']) ? $_POST['token'] : '');
    if (!hash_equals(ZEROSHUB_TOKEN, $token)) {
        fail(401, '无效的认证令牌');
    }
}

function rate_limit() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
    $limit_file = __DIR__ . '/.zeroshub_ratelimit.json';
    $data = @file_exists($limit_file) ? json_decode(@file_get_contents($limit_file), true) : [];
    if (!is_array($data)) $data = [];
    $now = time();
    $window = intdiv($now, 60);
    $key = $ip . '_' . $window;
    $count = isset($data[$key]) ? $data[$key] : 0;
    if ($count >= MAX_REQUESTS_PER_MINUTE) {
        fail(429, '请求频率超限，请稍后重试');
    }
    $data[$key] = $count + 1;
    $cleaned = [];
    foreach ($data as $k => $v) {
        if (isset($k) && is_string($k) && strlen($k) > 0) {
            $parts = explode('_', $k);
            $w = isset($parts[1]) ? intval($parts[1]) : 0;
            if ($w >= $window - 5) $cleaned[$k] = $v;
        }
    }
    @file_put_contents($limit_file, json_encode($cleaned), LOCK_EX);
}

function read_queue() {
    $file = __DIR__ . '/.zeroshub_cmd_queue.json';
    if (!file_exists($file)) return ['commands' => []];
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? $data : ['commands' => []];
}

function write_queue($queue) {
    $file = __DIR__ . '/.zeroshub_cmd_queue.json';
    file_put_contents($file, json_encode($queue), LOCK_EX);
}

function read_response($cmd_id) {
    $file = __DIR__ . '/.zeroshub_cmd_resp.json';
    if (!file_exists($file)) return null;
    $data = json_decode(file_get_contents($file), true);
    if (is_array($data) && isset($data['cmd_id']) && $data['cmd_id'] === $cmd_id) {
        @unlink($file);
        return $data;
    }
    return null;
}

function call_fsdrive($action, $params = []) {
    $ctx = stream_context_create(['http' => ['timeout' => 5]]);
    $query = http_build_query(array_merge(['action' => $action], $params));
    $scheme = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
    $d = '/system/service';
    if ($d === '/' || $d === '\\' || $d === '.') $d = '';
    $url = $scheme . '://' . $host . $d . '/FSDirve.php?' . $query;
    $resp = @file_get_contents($url, false, $ctx);
    if ($resp === false) return null;
    $data = json_decode($resp, true);
    return is_array($data) ? $data : null;
}

function get_system_info() {
    $info = ['php_version' => phpversion(), 'server_software' => isset($_SERVER['SERVER_SOFTWARE']) ? $_SERVER['SERVER_SOFTWARE'] : 'unknown', 'server_time' => date('c')];
    return $info;
}

function cmd_status() {
    ok(['bridge' => 'active', 'token_valid' => true, 'server_time' => date('c'), 'system' => get_system_info()]);
}

function cmd_info() {
    ok(get_system_info());
}

function cmd_queue_push() {
    global $RAW_INPUT;
    $body = json_decode($RAW_INPUT, true);
    if (!$body || !isset($body['action'])) {
        fail(400, '缺少 action 字段');
    }
    $queue = read_queue();
    if (!isset($queue['commands'])) $queue['commands'] = [];
    $cmd_id = 'cmd_' . dechex(time()) . '_' . bin2hex(random_bytes(4));
    $body['cmd_id'] = $cmd_id;
    $body['created_at'] = date('c');
    $body['processed'] = false;
    $queue['commands'][] = $body;
    while (count($queue['commands']) > 50) array_shift($queue['commands']);
    write_queue($queue);
    
    $maxWait = 15;
    $start = time();
    while (time() - $start < $maxWait) {
        usleep(300000);
        $resp = read_response($cmd_id);
        if ($resp) { ok($resp); }
    }
    ok(['cmd_id' => $cmd_id, 'status' => 'queued', 'message' => '命令已入队，等待浏览器端处理']);
}

function cmd_queue_list() {
    $queue = read_queue();
    ok($queue);
}

function cmd_resp_get() {
    $cmd_id = isset($_GET['cmd_id']) ? trim($_GET['cmd_id']) : '';
    if (!$cmd_id) fail(400, '缺少 cmd_id');
    $resp = read_response($cmd_id);
    if ($resp) { ok($resp); }
    ok(['status' => 'pending', 'message' => '响应尚未就绪']);
}

function cmd_fs_list() {
    $path = isset($_GET['path']) ? trim($_GET['path']) : 'D:/';
    $data = call_fsdrive('list_dir', ['path' => $path]);
    if ($data === null) fail(500, 'FSDirve 调用失败');
    ok($data);
}

function cmd_fs_read() {
    $path = isset($_GET['path']) ? trim($_GET['path']) : 'D:/';
    $fileName = isset($_GET['fileName']) ? trim($_GET['fileName']) : '';
    if ($fileName === '') fail(400, '缺少 fileName');
    $data = call_fsdrive('read_file', ['path' => $path, 'fileName' => $fileName]);
    if ($data === null) fail(500, 'FSDirve 调用失败');
    ok($data);
}

function cmd_fs_write() {
    global $RAW_INPUT;
    $body = json_decode($RAW_INPUT, true);
    if (!$body) fail(400, '无效的请求体');
    $path = isset($body['path']) ? trim($body['path']) : 'D:/';
    $fileName = isset($body['fileName']) ? trim($body['fileName']) : '';
    $content = isset($body['content']) ? $body['content'] : '';
    if ($fileName === '') fail(400, '缺少 fileName');
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => 'Content-Type: application/json', 'content' => json_encode(['content' => $content]), 'timeout' => 10]]);
    $scheme = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
    $d = '/system/service';
    if ($d === '/' || $d === '\\' || $d === '.') $d = '';
    $query = http_build_query(['action' => 'write_file', 'path' => $path, 'fileName' => $fileName, 'writeMod' => 'overwrite']);
    $url = $scheme . '://' . $host . $d . '/FSDirve.php?' . $query;
    $resp = @file_get_contents($url, false, $ctx);
    if ($resp === false) fail(500, 'FSDirve 写入失败');
    $data = json_decode($resp, true);
    if (!is_array($data) || (isset($data['status']) && $data['status'] !== 'success')) {
        fail(500, isset($data['message']) ? $data['message'] : 'FSDirve 写入返回异常');
    }
    ok($data);
}

function cmd_ping() {
    ok(['pong' => true, 'time' => date('c')]);
}

validate_token();
rate_limit();

$RAW_INPUT = file_get_contents('php://input');
if ($_SERVER['REQUEST_METHOD'] === 'POST' && strlen($RAW_INPUT) > MAX_REQUEST_SIZE) {
    fail(413, '请求体过大');
}

$action = isset($_GET['action']) ? trim($_GET['action']) : 'status';

switch ($action) {
    case 'status':
        cmd_status();
        break;
    case 'info':
        cmd_info();
        break;
    case 'queue_push':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, '仅支持 POST');
        cmd_queue_push();
        break;
    case 'queue_list':
        cmd_queue_list();
        break;
    case 'resp_get':
        cmd_resp_get();
        break;
    case 'fs_list':
        cmd_fs_list();
        break;
    case 'fs_read':
        cmd_fs_read();
        break;
    case 'fs_write':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, '仅支持 POST');
        cmd_fs_write();
        break;
    case 'ping':
        cmd_ping();
        break;
    default:
        fail(400, '未知操作: ' . $action);
}
