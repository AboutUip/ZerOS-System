<?php
/**
 * ZerOS 随机安全校验服务
 * 接收前端生成的128位随机字符串，生成 JWT Token 并返回
 * 
 * 访问地址: http://localhost:8089/system/service/randomSecurity.php
 */

// 引入 JWT 工具类
require_once __DIR__ . '/JWT.php';
// 与 CryptDrive._md5Hash 一致的密码哈希（非 PHP 内置 md5()），供 UserToken 签发校验
require_once __DIR__ . '/cryptDriveMd5Compat.php';

// JWT 记录文件路径（与 DISK/D 一致，便于与其他服务数据一起管理）
define('BOOT_SECURITY_TOKEN_FILE', __DIR__ . '/DISK/D/BootSecurityToken.json');
// 最多允许的 JWT 数量
define('BOOT_SECURITY_TOKEN_MAX_COUNT', 2);
// CVS-ZEROS-016：SystemToken 签发前须先提交 randomValue，存储「每 IP 一笔未消费提交」
define('BOOT_COMMIT_FILE', __DIR__ . '/DISK/D/cache/temp/boot_commit.json');
define('BOOT_COMMIT_TTL', 30);       // 提交有效秒数
define('BOOT_COMMIT_REPLACE_AGE', 5); // 超过该秒数允许同 IP 新提交覆盖旧提交（刷新恢复）
// CVS-ZEROS-017：UserToken 签发仅从可信系统分区 D 的 LocalSData 读取（与 LStorage DISK/D 一致）
define('ZEROS_LOCAL_SDATA_FILE', __DIR__ . '/DISK/D/LocalSData.json');

/**
 * 与 UserControl.HIGH_RISK_PERMISSIONS / jwtVerifyGetHighRiskPermissions 一致
 * @return string[]
 */
function zerosRandomSecurityHighRiskPermissions() {
    return [
        'CRYPT_GENERATE_KEY',
        'CRYPT_IMPORT_KEY',
        'CRYPT_DELETE_KEY',
        'CRYPT_ENCRYPT',
        'CRYPT_DECRYPT',
        'PROCESS_MANAGE',
        'SYSTEM_STORAGE_WRITE_USER_CONTROL',
        'SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL',
    ];
}

/**
 * 与 PermissionManager.PERMISSION 枚举值一致（供 JWT permissions 与 UserControl.getGrantablePermissions 对齐）
 * @return string[]
 */
function zerosRandomSecurityAllPermissionIds() {
    return [
        'SYSTEM_NOTIFICATION',
        'KERNEL_DISK_READ',
        'KERNEL_DISK_WRITE',
        'KERNEL_DISK_DELETE',
        'KERNEL_DISK_CREATE',
        'KERNEL_DISK_LIST',
        'KERNEL_MEMORY_READ',
        'KERNEL_MEMORY_WRITE',
        'NETWORK_ACCESS',
        'GUI_WINDOW_CREATE',
        'GUI_WINDOW_MANAGE',
        'SYSTEM_STORAGE_READ',
        'SYSTEM_STORAGE_WRITE',
        'ENVIRONMENT_READ',
        'ENVIRONMENT_WRITE',
        'SYSTEM_STORAGE_READ_USER_CONTROL',
        'SYSTEM_STORAGE_READ_PERMISSION_CONTROL',
        'SYSTEM_STORAGE_WRITE_USER_CONTROL',
        'SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL',
        'SYSTEM_STORAGE_WRITE_DESKTOP',
        'PROCESS_MANAGE',
        'PROCESS_BACKGROUND',
        'THEME_READ',
        'THEME_WRITE',
        'DESKTOP_MANAGE',
        'DESKTOP_SHORTCUT',
        'MULTITHREADING_CREATE',
        'MULTITHREADING_EXECUTE',
        'DRAG_ELEMENT',
        'DRAG_FILE',
        'DRAG_WINDOW',
        'GEOGRAPHY_LOCATION',
        'CRYPT_GENERATE_KEY',
        'CRYPT_IMPORT_KEY',
        'CRYPT_DELETE_KEY',
        'CRYPT_ENCRYPT',
        'CRYPT_DECRYPT',
        'CRYPT_MD5',
        'CRYPT_RANDOM',
        'EVENT_LISTENER',
        'CACHE_READ',
        'CACHE_WRITE',
        'SPEECH_RECOGNITION',
        'MEDIA_ACCESS',
        'SCHEDULE_TASK_CREATE',
        'SCHEDULE_TASK_MANAGE',
        'SCHEDULE_TASK_STARTUP',
        'APPLICATION_INSTALL',
        'APPLICATION_UNINSTALL',
        'SYSTEM_LOG_READ',
        'LANGUAGES_READ',
        'LANGUAGES_WRITE',
        'SERVER_SERVICE_MANAGE',
        'FILE_ASSOC_MANAGE',
    ];
}

/**
 * 与 UserControl.getGrantablePermissions 语义一致：管理员全量；USER 为全量减高风险
 * @param string $userLevel USER|ADMIN|DEFAULT_ADMIN
 * @return string[]
 */
function zerosRandomSecurityGrantablePermissionsForLevel($userLevel) {
    $all = array_values(array_unique(zerosRandomSecurityAllPermissionIds()));
    if ($userLevel === 'ADMIN' || $userLevel === 'DEFAULT_ADMIN') {
        return $all;
    }
    $hr = array_flip(zerosRandomSecurityHighRiskPermissions());
    $out = [];
    foreach ($all as $p) {
        if (!isset($hr[$p])) {
            $out[] = $p;
        }
    }
    return $out;
}

/**
 * CVS-ZEROS-017：根据用户名/密码从 LocalSData 解析 UserToken 的 userLevel 与 permissions（不信任客户端声明）
 * @param string $username
 * @param string|null $password 明文；无密码用户可为 null 或 ''
 * @return array{userLevel:string,permissions:string[]}
 */
function zerosRandomSecurityResolveUserTokenFromLocalSdata($username, $password) {
    if (!is_string($username) || trim($username) === '') {
        sendResponse(false, 'UserToken 签发需要提供有效的 username', null, 400);
    }
    $username = trim($username);
    $username = preg_replace('/^\xEF\xBB\xBF/', '', $username);
    if (!is_file(ZEROS_LOCAL_SDATA_FILE)) {
        sendResponse(false, '用户数据文件不可用，无法签发 UserToken', null, 500);
    }
    $raw = @file_get_contents(ZEROS_LOCAL_SDATA_FILE);
    if ($raw === false || $raw === '') {
        sendResponse(false, '无法读取用户数据', null, 500);
    }
    $doc = json_decode($raw, true);
    if (!is_array($doc) || !isset($doc['system']) || !is_array($doc['system'])) {
        sendResponse(false, '用户数据格式无效', null, 500);
    }
    $sys = $doc['system'];
    $usersKey = 'userControl.users';
    if (!isset($sys[$usersKey]) || !is_array($sys[$usersKey])) {
        sendResponse(false, '用户库不存在或格式无效', null, 500);
    }
    $users = $sys[$usersKey];
    $canonicalUser = null;
    if (isset($users[$username]) && is_array($users[$username])) {
        $canonicalUser = $username;
    } else {
        foreach ($users as $storedName => $row) {
            if (is_string($storedName) && strcasecmp($storedName, $username) === 0 && is_array($row)) {
                $canonicalUser = $storedName;
                break;
            }
        }
    }
    if ($canonicalUser === null || !is_array($users[$canonicalUser])) {
        sendResponse(false, '用户不存在', null, 403);
    }
    $userRow = $users[$canonicalUser];
    $level = isset($userRow['level']) && is_string($userRow['level']) ? $userRow['level'] : 'USER';
    if (!in_array($level, ['USER', 'ADMIN', 'DEFAULT_ADMIN'], true)) {
        $level = 'USER';
    }
    $stored = $userRow['password'] ?? null;
    $hasPassword = is_string($stored) && $stored !== '';
    if ($hasPassword) {
        if ($password === null || $password === '') {
            sendResponse(false, '密码错误', null, 403);
        }
        $plain = is_string($password) ? $password : (string)$password;
        $hashCompat = zeros_cryptdrive_md5_hash($plain);
        $storedNorm = strtolower((string)$stored);
        $ok = hash_equals($storedNorm, strtolower($hashCompat));
        if (!$ok) {
            sendResponse(false, '密码错误', null, 403);
        }
    } else {
        if ($password !== null && $password !== '' && is_string($password)) {
            // 与 UserControl.login 一致：无密码用户即使传了密码仍允许登录
        }
    }
    $permissions = zerosRandomSecurityGrantablePermissionsForLevel($level);
    return ['userLevel' => $level, 'permissions' => $permissions];
}

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

    // 获取 randomValue、type（CVS-ZEROS-017：UserToken 的 userLevel/permissions 仅由服务端根据 LocalSData 与密码生成）
    $randomValue = null;
    $tokenType = null;
    $inputData = [];

    if ($method === 'POST' && $postBody !== null && $postBody !== '') {
        $decoded = json_decode($postBody, true);
        if (is_array($decoded)) {
            $inputData = $decoded;
        }
        $randomValue = $inputData['randomValue'] ?? null;
        $tokenType = $inputData['type'] ?? null;
        if ($randomValue === null && isset($_POST['randomValue'])) {
            $randomValue = $_POST['randomValue'];
            $tokenType = $tokenType ?? ($_POST['type'] ?? null);
        }
    } elseif ($method === 'POST') {
        $randomValue = $_POST['randomValue'] ?? null;
        $tokenType = $_POST['type'] ?? null;
    } elseif ($method === 'GET') {
        $randomValue = $_GET['randomValue'] ?? null;
        $tokenType = $_GET['type'] ?? null;
    }
    
    // 验证随机字符串
    if (!$randomValue || !is_string($randomValue)) {
        sendResponse(false, '缺少 randomValue 参数或格式错误', null, 400);
    }
    
    // 验证随机字符串格式（应该是32个十六进制字符，128位）
    if (!preg_match('/^[0-9a-f]{32}$/i', $randomValue)) {
        sendResponse(false, 'randomValue 格式错误，应为32个十六进制字符（128位）', null, 400);
    }
    
    // 获取 Token 类型（用于判断是否 SystemToken）；UserToken 大小写不敏感，避免绕过 CVS-ZEROS-017 认证分支
    $resolvedType = is_string($tokenType) && $tokenType !== '' ? $tokenType : 'Unknown';
    $isUserToken = is_string($tokenType) && strcasecmp(trim($tokenType), 'UserToken') === 0;

    $userLevel = null;
    $permissions = null;
    if ($isUserToken) {
        if ($method !== 'POST' || $postBody === null || $postBody === '') {
            sendResponse(false, 'UserToken 必须使用 POST 且提供 JSON 请求体（randomValue、type、username；password 无密码用户可省略或空字符串）', null, 400);
        }
        $uname = isset($inputData['username']) ? trim((string)$inputData['username']) : '';
        if ($uname === '') {
            sendResponse(false, 'UserToken 签发需要 JSON 字段 username', null, 400);
        }
        $pwd = array_key_exists('password', $inputData) ? $inputData['password'] : null;
        if ($pwd !== null && !is_string($pwd)) {
            sendResponse(false, 'password 须为字符串', null, 400);
        }
        $claims = zerosRandomSecurityResolveUserTokenFromLocalSdata($uname, $pwd);
        $userLevel = $claims['userLevel'];
        $permissions = $claims['permissions'];
    }

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
    if ($isUserToken) {
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
    
    // 构建 JWT Payload（UserToken 的 type 固定为 UserToken；userLevel/permissions 仅来自服务端 zerosRandomSecurityResolveUserTokenFromLocalSdata）
    $payload = [
        'randomValue' => $randomValue,  // 特征符
        'type' => $isUserToken ? 'UserToken' : $resolvedType,
        'generated_at' => time()         // 生成时间戳
    ];
    if ($isUserToken && $userLevel !== null && $userLevel !== '') {
        $payload['userLevel'] = $userLevel;
    }
    if ($isUserToken && $permissions !== null && is_array($permissions)) {
        $payload['permissions'] = $permissions;
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
