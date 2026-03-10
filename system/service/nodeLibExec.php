<?php
/**
 * ZerOS Node 扩展执行接口
 * 仅允许 SystemToken 调用；通过硬编码 scriptId 白名单执行 node --version 或 node system/assets/nodeLibs/{scriptId}.js
 * 不接收用户输入，所有脚本由配置项固定。
 *
 * 访问: POST /system/service/nodeLibExec.php
 * Body: { "scriptId": "check" | "perf" }（仅白名单）
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token, X-JWT');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/jwtVerify.php';
requireSystemTokenOnly();

/** scriptId 白名单：check = 检测 node 环境，其余 = system/assets/nodeLibs/{scriptId}.js */
$SCRIPT_ID_WHITELIST = ['check', 'perf'];

$raw = file_get_contents('php://input');
$body = $raw !== false ? json_decode($raw, true) : null;
$scriptId = isset($body['scriptId']) && is_string($body['scriptId']) ? trim($body['scriptId']) : '';

if ($scriptId === '' || !in_array($scriptId, $SCRIPT_ID_WHITELIST, true)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'scriptId 必须为白名单之一: ' . implode(', ', $SCRIPT_ID_WHITELIST),
        'timestamp' => date('Y-m-d H:i:s'),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function runNodeCommand(array $command, $timeoutSec = 5) {
    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $cmd = implode(' ', array_map('escapeshellarg', $command));
    $proc = proc_open(
        $cmd,
        $descriptorSpec,
        $pipes,
        null,
        null,
        ['bypass_shell' => true]
    );
    if (!is_resource($proc)) {
        return ['success' => false, 'stdout' => '', 'stderr' => 'proc_open failed', 'code' => -1];
    }
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    return ['success' => $code === 0, 'stdout' => $stdout, 'stderr' => $stderr, 'code' => $code];
}

if ($scriptId === 'check') {
    $result = runNodeCommand(['node', '--version'], 5);
    $nodeAvailable = $result['success'] && trim($result['stdout']) !== '';
    echo json_encode([
        'status' => 'success',
        'data' => [
            'nodeAvailable' => $nodeAvailable,
            'version' => $nodeAvailable ? trim($result['stdout']) : null,
            'stdout' => $result['stdout'],
            'stderr' => $result['stderr'],
            'code' => $result['code'],
        ],
        'timestamp' => date('Y-m-d H:i:s'),
        'timestamp_unix' => time(),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$baseDir = realpath(__DIR__ . '/../assets/nodeLibs');
if ($baseDir === false || !is_dir($baseDir)) {
    echo json_encode([
        'status' => 'error',
        'message' => 'nodeLibs 目录不存在',
        'timestamp' => date('Y-m-d H:i:s'),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$scriptFile = $scriptId . '.js';
$scriptPath = realpath($baseDir . DIRECTORY_SEPARATOR . $scriptFile);
if ($scriptPath === false || !is_file($scriptPath) || strpos($scriptPath, $baseDir) !== 0) {
    echo json_encode([
        'status' => 'error',
        'message' => '脚本不在白名单或不存在: ' . $scriptId,
        'timestamp' => date('Y-m-d H:i:s'),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$result = runNodeCommand(['node', $scriptPath], 15);
echo json_encode([
    'status' => 'success',
    'data' => [
        'stdout' => $result['stdout'],
        'stderr' => $result['stderr'],
        'code' => $result['code'],
    ],
    'timestamp' => date('Y-m-d H:i:s'),
    'timestamp_unix' => time(),
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
