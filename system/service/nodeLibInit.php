<?php
/**
 * ZerOS Node 扩展依赖初始化接口
 * 仅允许 SystemToken 调用；根据请求中的 packages 列表检查全局（-g）是否已安装，未安装则执行 npm install -g。
 * 仅允许安装白名单内的包，防止任意包安装。
 *
 * 访问: POST /system/service/nodeLibInit.php
 * Body: { "packages": ["systeminformation", ...] }
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

/** 允许通过本接口安装的全局包白名单（仅这些可执行 npm install -g） */
$PACKAGE_WHITELIST = [
    'systeminformation',
    'node-system-stats',
    'microstats',
];

$raw = file_get_contents('php://input');
$body = $raw !== false ? json_decode($raw, true) : null;
$requested = isset($body['packages']) && is_array($body['packages']) ? $body['packages'] : [];
$packages = [];
foreach ($requested as $p) {
    if (is_string($p) && in_array(trim($p), $PACKAGE_WHITELIST, true)) {
        $packages[] = trim($p);
    }
}
$packages = array_values(array_unique($packages));

function runShellCommand($command, $timeoutSec = 30) {
    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proc = proc_open(
        $command,
        $descriptorSpec,
        $pipes,
        null,
        null,
        ['bypass_shell' => false]
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

$alreadyInstalled = [];
$toInstall = [];
foreach ($packages as $pkg) {
    $cmd = 'npm list -g ' . escapeshellarg($pkg) . ' --depth=0 2>' . (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? 'NUL' : '/dev/null');
    $r = runShellCommand($cmd, 10);
    if ($r['success'] && trim($r['stdout']) !== '') {
        $alreadyInstalled[] = $pkg;
    } else {
        $toInstall[] = $pkg;
    }
}

$installed = [];
$failed = [];
if (!empty($toInstall)) {
    $installList = implode(' ', array_map('escapeshellarg', $toInstall));
    $installCmd = 'npm install -g ' . $installList;
    $r = runShellCommand($installCmd, 120);
    if ($r['success']) {
        $installed = $toInstall;
    } else {
        foreach ($toInstall as $p) {
            $singleCmd = 'npm install -g ' . escapeshellarg($p);
            $sr = runShellCommand($singleCmd, 60);
            if ($sr['success']) {
                $installed[] = $p;
            } else {
                $failed[] = $p;
            }
        }
    }
}

echo json_encode([
    'status' => 'success',
    'data' => [
        'alreadyInstalled' => $alreadyInstalled,
        'installed' => $installed,
        'failed' => $failed,
    ],
    'timestamp' => date('Y-m-d H:i:s'),
    'timestamp_unix' => time(),
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
