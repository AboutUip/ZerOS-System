<?php
/**
 * ZerOS 随机安全校验服务
 * 接收前端生成的128位随机字符串，生成 JWT Token 并返回
 * 
 * 访问地址: http://localhost:8089/system/service/randomSecurity.php
 */

// 引入 JWT 工具类
require_once __DIR__ . '/JWT.php';

// JWT 记录文件路径（与 DISK/D 一致，便于与其他服务数据一起管理）
define('BOOT_SECURITY_TOKEN_FILE', __DIR__ . '/DISK/D/BootSecurityToken.json');
// 最多允许的 JWT 数量
define('BOOT_SECURITY_TOKEN_MAX_COUNT', 2);
// CVS-ZEROS-016：SystemToken 签发前须先提交 randomValue，存储「每 IP 一笔未消费提交」
define('BOOT_COMMIT_FILE', __DIR__ . '/DISK/D/cache/temp/boot_commit.json');
define('BOOT_COMMIT_TTL', 30);       // 提交有效秒数
define('BOOT_COMMIT_REPLACE_AGE', 5); // 超过该秒数允许同 IP 新提交覆盖旧提交（刷新恢复）

// 设置响应头
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/**
 * 响应函数
 */
function sendResponse($success, $message, $data = null, $code = 200) {
    http_response_code($code);
    $response = [
        'status' => $success ? 'success' : 'error',
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s'),
        'timestamp_unix' => time()
    ];
    if ($data !== null) {
        $response['data'] = $data;
    }
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

try {
    // 获取请求方法与 POST 体（php://input 只能读一次）
    $method = $_SERVER['REQUEST_METHOD'];
    $postBody = ($method === 'POST') ? @file_get_contents('php://input') : null;

    $action = $_GET['action'] ?? ($_POST['action'] ?? null);
    if ($postBody !== null && $postBody !== '') {
        $postData = json_decode($postBody, true);
        if (is_array($postData) && isset($postData['action'])) {
            $action = $postData['action'];
        }
    }

    // action=clear：系统关机/重启时清空所有 JWT
    if ($action === 'clear') {
        $cleared = false;
        $errorMsg = null;
        if (file_exists(BOOT_SECURITY_TOKEN_FILE)) {
            if (@unlink(BOOT_SECURITY_TOKEN_FILE)) {
                $cleared = true;
            } else {
                $errorMsg = '删除文件失败';
            }
        } else {
            $cleared = true; // 文件不存在视为已清空
        }
        sendResponse(true, 'JWT 已清空', [
            'cleared' => $cleared,
            'error' => $errorMsg
        ]);
    }

    // action=commit_for_system：CVS-ZEROS-016 引导提交 randomValue，每 IP 仅允许一笔未消费提交
    if ($action === 'commit_for_system') {
        $inputData = $postBody !== null ? json_decode($postBody, true) : null;
        $commitRv = (is_array($inputData) && isset($inputData['randomValue'])) ? $inputData['randomValue'] : null;
        if (!$commitRv || !is_string($commitRv) || !preg_match('/^[0-9a-f]{32}$/i', $commitRv)) {
            sendResponse(false, 'commit_for_system 需要有效的 randomValue（32位十六进制）', null, 400);
        }
        $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
        if ($clientIp === '') {
            sendResponse(false, '无法获取客户端 IP', null, 403);
        }
        $commits = [];
        $commitDir = dirname(BOOT_COMMIT_FILE);
        if (is_dir($commitDir) && file_exists(BOOT_COMMIT_FILE)) {
            $raw = @file_get_contents(BOOT_COMMIT_FILE);
            if ($raw !== false) {
                $dec = json_decode($raw, true);
                if (is_array($dec) && isset($dec['commits']) && is_array($dec['commits'])) {
                    $commits = $dec['commits'];
                }
            }
        } elseif (!is_dir($commitDir)) {
            @mkdir($commitDir, 0755, true);
        }
        $now = time();
        foreach ($commits as $rv => $info) {
            if (!is_array($info) || ($info['created_at'] ?? 0) < $now - BOOT_COMMIT_TTL) {
                unset($commits[$rv]);
            }
        }
        foreach ($commits as $rv => $info) {
            if (($info['ip'] ?? '') === $clientIp) {
                $age = $now - ($info['created_at'] ?? 0);
                if ($age < BOOT_COMMIT_REPLACE_AGE) {
                    sendResponse(false, '该 IP 已有未消费的引导提交，请稍后再试或完成当前引导', null, 403);
                }
                unset($commits[$rv]);
                break;
            }
        }
        $commits[$commitRv] = ['ip' => $clientIp, 'created_at' => $now];
        $json = json_encode(['commits' => $commits], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false || file_put_contents(BOOT_COMMIT_FILE, $json, LOCK_EX) === false) {
            sendResponse(false, '提交记录写入失败', null, 500);
        }
        sendResponse(true, '已提交，可用于本次引导签发 SystemToken', ['committed' => true]);
    }

    // 获取随机字符串（特征符）、Token 类型、用户级别、可授权权限列表（由前端传入）
    $randomValue = null;
    $tokenType = null;
    $userLevel = null;
    $permissions = null;
    
    if ($method === 'POST' && $postBody !== null) {
        $inputData = json_decode($postBody, true);
        if ($inputData && is_array($inputData)) {
            $randomValue = $inputData['randomValue'] ?? null;
            $tokenType = $inputData['type'] ?? null;
            $userLevel = $inputData['userLevel'] ?? null;
            $permissions = isset($inputData['permissions']) && is_array($inputData['permissions']) ? $inputData['permissions'] : null;
        }
        if ($randomValue === null && isset($_POST['randomValue'])) {
            $randomValue = $_POST['randomValue'];
            $tokenType = $_POST['type'] ?? null;
            $userLevel = $_POST['userLevel'] ?? null;
            $permissions = isset($_POST['permissions']) ? json_decode($_POST['permissions'], true) : null;
            if (!is_array($permissions)) $permissions = null;
        }
    } elseif ($method === 'GET') {
        // GET 请求：从查询参数读取
        $randomValue = $_GET['randomValue'] ?? null;
        $tokenType = $_GET['type'] ?? null;
        $userLevel = $_GET['userLevel'] ?? null;
        $permissions = isset($_GET['permissions']) ? json_decode($_GET['permissions'], true) : null;
        if (!is_array($permissions)) $permissions = null;
    }
    
    // 验证随机字符串
    if (!$randomValue || !is_string($randomValue)) {
        sendResponse(false, '缺少 randomValue 参数或格式错误', null, 400);
    }
    
    // 验证随机字符串格式（应该是32个十六进制字符，128位）
    if (!preg_match('/^[0-9a-f]{32}$/i', $randomValue)) {
        sendResponse(false, 'randomValue 格式错误，应为32个十六进制字符（128位）', null, 400);
    }
    
    // 获取 Token 类型（用于判断是否 SystemToken）
    $resolvedType = is_string($tokenType) && $tokenType !== '' ? $tokenType : 'Unknown';

    // CVS-ZEROS-016：SystemToken 必须先通过 action=commit_for_system 提交本 randomValue（同 IP、未消费）
    if ($resolvedType === 'SystemToken') {
        $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
        $commits = [];
        if (file_exists(BOOT_COMMIT_FILE)) {
            $raw = @file_get_contents(BOOT_COMMIT_FILE);
            if ($raw !== false) {
                $dec = json_decode($raw, true);
                if (is_array($dec) && isset($dec['commits']) && is_array($dec['commits'])) {
                    $commits = $dec['commits'];
                }
            }
        }
        $now = time();
        $found = false;
        foreach ($commits as $rv => $info) {
            if ($rv === $randomValue && is_array($info) && ($info['ip'] ?? '') === $clientIp) {
                if (($info['created_at'] ?? 0) < $now - BOOT_COMMIT_TTL) {
                    sendResponse(false, '引导提交已过期，请重新加载页面后重试', null, 403);
                }
                $found = true;
                unset($commits[$rv]);
                break;
            }
        }
        if (!$found) {
            sendResponse(false, 'SystemToken 仅允许在引导流程中签发，请先通过 commit_for_system 提交本 randomValue', null, 403);
        }
        foreach ($commits as $rv => $info) {
            if (!is_array($info) || ($info['created_at'] ?? 0) < $now - BOOT_COMMIT_TTL) {
                unset($commits[$rv]);
            }
        }
        $json = json_encode(['commits' => $commits], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json !== false) {
            @file_put_contents(BOOT_COMMIT_FILE, $json, LOCK_EX);
        }
    }

    // 检查已有 JWT 数量，达到上限则禁止生成
    $existingTokens = [];
    if (file_exists(BOOT_SECURITY_TOKEN_FILE)) {
        $content = file_get_contents(BOOT_SECURITY_TOKEN_FILE);
        $parsed = json_decode($content, true);
        if ($parsed !== null) {
            if (isset($parsed['token'])) {
                // 旧格式：单个对象
                $existingTokens = [$parsed];
            } elseif (isset($parsed['tokens']) && is_array($parsed['tokens'])) {
                $existingTokens = $parsed['tokens'];
            } elseif (isset($parsed[0]) && is_array($parsed[0])) {
                $existingTokens = $parsed;
            }
        }
    }
    
    // 当接收到类型为 SystemToken 的 JWT 生成请求时，立即清空现有 JWT 记录
    if ($resolvedType === 'SystemToken' && count($existingTokens) > 0) {
        if (file_exists(BOOT_SECURITY_TOKEN_FILE)) {
            @unlink(BOOT_SECURITY_TOKEN_FILE);
        }
        $existingTokens = [];
    }
    
    // 当接收到类型为 UserToken 时：清除已存在的用户相关数据，保证注销再次登录时 JWT 一致（单用户会话，每次登录覆盖为最新 userLevel、permissions 等）
    if ($resolvedType === 'UserToken') {
        $existingTokens = array_values(array_filter($existingTokens, function ($t) {
            return ($t['type'] ?? '') !== 'UserToken';
        }));
    }
    
    if (count($existingTokens) >= BOOT_SECURITY_TOKEN_MAX_COUNT) {
        sendResponse(false, 'JWT 数量已达上限，禁止生成', [
            'current_count' => count($existingTokens),
            'max_count' => BOOT_SECURITY_TOKEN_MAX_COUNT
        ], 403);
    }
    
    // 构建 JWT Payload（type 由前端传入，未传则使用默认值；UserToken 固定 type 并包含 userLevel、permissions）
    $payload = [
        'randomValue' => $randomValue,  // 特征符
        'type' => $resolvedType === 'UserToken' ? 'UserToken' : $resolvedType,  // UserToken 固定
        'generated_at' => time()         // 生成时间戳
    ];
    if ($resolvedType === 'UserToken' && $userLevel !== null && $userLevel !== '') {
        $payload['userLevel'] = $userLevel;
    }
    if ($resolvedType === 'UserToken' && $permissions !== null && is_array($permissions)) {
        $payload['permissions'] = $permissions;  // 当前用户可授权的权限列表，JSON 数组格式
    }
    
    // 生成 JWT Token（永不过期，会实时动态修改）
    $expiration = 0; // 0 表示永不过期
    $token = JWT::encode($payload, $expiration);
    
    // 记录 JWT 到本地文件
    $record = [
        'token' => $token,
        'randomValue' => $randomValue,
        'type' => $payload['type'],
        'userLevel' => $payload['userLevel'] ?? null,
        'permissions' => $payload['permissions'] ?? null,
        'generated_at' => time(),
        'generated_at_str' => date('Y-m-d H:i:s'),
        'expiration' => 0,
        'expires_at' => null,
        'expires_at_str' => null
    ];
    
    $recordSaved = false;
    $recordError = null;
    
    if (is_dir(dirname(BOOT_SECURITY_TOKEN_FILE))) {
        // 追加到现有列表，并保留 programPermissionsMap
        $existingTokens[] = $record;
        $programPermissionsMap = [];
        if (file_exists(BOOT_SECURITY_TOKEN_FILE)) {
            $content = file_get_contents(BOOT_SECURITY_TOKEN_FILE);
            $parsed = json_decode($content, true);
            if (is_array($parsed) && isset($parsed['programPermissionsMap']) && is_array($parsed['programPermissionsMap'])) {
                $programPermissionsMap = $parsed['programPermissionsMap'];
            }
        }
        $data = [
            'tokens' => $existingTokens,
            'count' => count($existingTokens),
            'max_count' => BOOT_SECURITY_TOKEN_MAX_COUNT,
            'programPermissionsMap' => $programPermissionsMap
        ];
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json !== false && file_put_contents(BOOT_SECURITY_TOKEN_FILE, $json, LOCK_EX) !== false) {
            $recordSaved = true;
        } else {
            $recordError = '写入文件失败';
        }
    } else {
        $recordError = '目录不存在: ' . dirname(BOOT_SECURITY_TOKEN_FILE);
    }
    
    // 返回成功响应
    sendResponse(true, 'JWT Token 生成成功', [
        'token' => $token,
        'randomValue' => $randomValue,
        'expiration' => 0,
        'expires_at' => null,
        'recorded' => $recordSaved,
        'record_error' => $recordError,
        'current_count' => count($existingTokens),
        'max_count' => BOOT_SECURITY_TOKEN_MAX_COUNT
    ]);
    
} catch (Exception $e) {
    sendResponse(false, '服务器错误: ' . $e->getMessage(), null, 500);
}

?>
