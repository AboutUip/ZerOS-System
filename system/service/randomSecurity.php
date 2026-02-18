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
    // 获取请求方法
    $method = $_SERVER['REQUEST_METHOD'];
    
    // action=clear：系统关机/重启时清空所有 JWT
    $action = $_GET['action'] ?? ($_POST['action'] ?? null);
    if ($method === 'POST') {
        $rawInput = @file_get_contents('php://input');
        if ($rawInput) {
            $postData = json_decode($rawInput, true);
            if ($postData && isset($postData['action'])) {
                $action = $postData['action'];
            }
        }
    }
    
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
    
    // 获取随机字符串（特征符）、Token 类型、用户级别、可授权权限列表（由前端传入）
    $randomValue = null;
    $tokenType = null;
    $userLevel = null;
    $permissions = null;
    
    if ($method === 'POST') {
        // POST 请求：从请求体读取
        $rawInput = file_get_contents('php://input');
        $inputData = json_decode($rawInput, true);
        
        if ($inputData) {
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
