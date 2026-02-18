<?php
/**
 * ZerOS 后端 JWT 验证模块
 * 供需要鉴权的接口引用：SystemToken 直接放行
 * UserToken：要求请求中携带 upid，并根据 action 分析意图→所需权限，校验：
 *   1. 程序是否在 programPermissionsMap 中声明该权限
 *   2. 当前用户是否有权授予该权限（ADMIN/DEFAULT_ADMIN 可授所有；USER 不能授高风险权限）
 * 
 * 排除：JWT 相关接口（randomSecurity.php、JWT_example.php）、代理接口（*proxy*.php）
 */

if (!defined('JWT_VERIFY_LOADED')) {
    require_once __DIR__ . '/JWT.php';
    define('JWT_VERIFY_LOADED', true);
}

define('JWT_BOOT_SECURITY_FILE', __DIR__ . '/DISK/D/BootSecurityToken.json');

/**
 * action → 所需权限映射（与 UserControl.HIGH_RISK_PERMISSIONS 一致的高风险权限需由管理员授权）
 */
function jwtVerifyGetActionPermissionMap() {
    return [
        'FSDirve' => [
            'create_dir' => 'KERNEL_DISK_CREATE',
            'create_file' => 'KERNEL_DISK_CREATE',
            'delete_dir' => 'KERNEL_DISK_DELETE',
            'delete_file' => 'KERNEL_DISK_DELETE',
            'delete_dir_recursive' => 'KERNEL_DISK_DELETE',
            'list_dir' => 'KERNEL_DISK_LIST',
            'read_file' => 'KERNEL_DISK_READ',
            'get_file_info' => 'KERNEL_DISK_READ',
            'get_disk_info' => 'KERNEL_DISK_READ',
            'exists' => 'KERNEL_DISK_LIST',
            'write_file' => 'KERNEL_DISK_WRITE',
            'rename_file' => 'KERNEL_DISK_WRITE',
            'rename_dir' => 'KERNEL_DISK_WRITE',
            'move_file' => 'KERNEL_DISK_WRITE',
            'move_dir' => 'KERNEL_DISK_WRITE',
            'copy_file' => 'KERNEL_DISK_WRITE',
            'copy_dir' => 'KERNEL_DISK_WRITE',
        ],
        'CompressionDirve' => [
            'compress_zip' => 'KERNEL_DISK_WRITE',
            'extract_zip' => 'KERNEL_DISK_WRITE',
            'list_zip' => 'KERNEL_DISK_READ',
            'compress_rar' => 'KERNEL_DISK_WRITE',
            'extract_rar' => 'KERNEL_DISK_WRITE',
            'list_rar' => 'KERNEL_DISK_READ',
            'check_support' => 'KERNEL_DISK_READ',
        ],
        'DISKMANAGER' => [
            'check' => 'KERNEL_DISK_READ',
            'list' => 'KERNEL_DISK_LIST',
            'read_data' => 'KERNEL_DISK_READ',
            'create' => 'KERNEL_DISK_CREATE',
            'delete' => 'KERNEL_DISK_DELETE',
            'merge' => 'KERNEL_DISK_WRITE',
            'write_data' => 'KERNEL_DISK_WRITE',
            'sync_data' => 'KERNEL_DISK_WRITE',
        ],
    ];
}

/** 高风险权限（与 UserControl.HIGH_RISK_PERMISSIONS 一致），仅 ADMIN/DEFAULT_ADMIN 可授予 */
function jwtVerifyGetHighRiskPermissions() {
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
 * 从请求中提取 action
 * 仅从 $_GET['action'] 读取，避免消耗 php://input（FSDirve/CompressionDirve 等 POST 时需用 body 传文件内容）
 * @return string|null
 */
function jwtVerifyExtractAction() {
    $action = $_GET['action'] ?? null;
    return ($action !== null && $action !== '') ? $action : null;
}

/**
 * 加载 programPermissionsMap
 * @return array [upid => [permission, ...], ...]
 */
function jwtVerifyLoadProgramPermissionsMap() {
    if (!file_exists(JWT_BOOT_SECURITY_FILE)) {
        return [];
    }
    $content = file_get_contents(JWT_BOOT_SECURITY_FILE);
    $parsed = json_decode($content, true);
    if (!is_array($parsed) || !isset($parsed['programPermissionsMap']) || !is_array($parsed['programPermissionsMap'])) {
        return [];
    }
    return $parsed['programPermissionsMap'];
}

/**
 * 检查当前用户是否可以授予指定权限（复刻 UserControl.canGrantPermission）
 * @param string $permission 权限名
 * @param array $payload UserToken 解码后的 payload（含 userLevel、permissions）
 * @return bool
 */
function jwtVerifyCanUserGrantPermission($permission, $payload) {
    $level = $payload['userLevel'] ?? 'USER';
    if ($level === 'ADMIN' || $level === 'DEFAULT_ADMIN') {
        return true;
    }
    if (in_array($permission, jwtVerifyGetHighRiskPermissions(), true)) {
        return false;
    }
    $userPerms = $payload['permissions'] ?? [];
    return is_array($userPerms) && in_array($permission, $userPerms, true);
}

/**
 * 当存在 upid 时，根据 action 分析意图，校验程序权限与用户授权能力
 * @param string $serviceName 服务名（FSDirve、CompressionDirve、DISKMANAGER）
 * @param string|int $upid 用户进程 ID
 * @param array $payload UserToken 解码后的 payload
 */
function jwtVerifyCheckUpidPermission($serviceName, $upid, $payload) {
    $action = jwtVerifyExtractAction();
    if ($action === null || $action === '') {
        jwtVerifyDeny('请求缺少 action 参数');
    }

    $map = jwtVerifyGetActionPermissionMap();
    $serviceMap = $map[$serviceName] ?? null;
    if ($serviceMap === null) {
        return; // 服务未配置权限映射，跳过 upid 权限检查（向后兼容）
    }

    $requiredPermission = $serviceMap[$action] ?? null;
    if ($requiredPermission === null) {
        return; // 该 action 未配置所需权限，跳过
    }

    $programMap = jwtVerifyLoadProgramPermissionsMap();
    $upidStr = (string) $upid;
    $declaredPerms = $programMap[$upidStr] ?? null;

    if ($declaredPerms === null) {
        jwtVerifyDeny('upid 未在程序权限映射中注册或已失效');
    }
    if (!is_array($declaredPerms) || !in_array($requiredPermission, $declaredPerms, true)) {
        jwtVerifyDeny('程序未声明该操作所需的权限: ' . $requiredPermission);
    }

    if (!jwtVerifyCanUserGrantPermission($requiredPermission, $payload)) {
        jwtVerifyDeny('当前用户无法授权该权限: ' . $requiredPermission);
    }
}

/**
 * 从请求中提取 JWT Token
 * 支持 Authorization: Bearer xxx、X-Auth-Token、X-JWT
 * @return string|null Token 或 null
 */
function jwtVerifyExtractToken() {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($auth === '') {
        $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    }
    if ($auth === '' && function_exists('getallheaders')) {
        $h = getallheaders();
        $auth = $h['Authorization'] ?? $h['authorization'] ?? '';
    }
    if ($auth !== '' && preg_match('/^\s*Bearer\s+(.+)$/i', $auth, $m)) {
        return trim($m[1]);
    }
    $xAuth = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if ($xAuth === '' && function_exists('getallheaders')) {
        $h = getallheaders();
        $xAuth = $h['X-Auth-Token'] ?? $h['x-auth-token'] ?? '';
    }
    if ($xAuth !== '') {
        return trim($xAuth);
    }
    $xJwt = $_SERVER['HTTP_X_JWT'] ?? '';
    if ($xJwt === '' && function_exists('getallheaders')) {
        $h = getallheaders();
        $xJwt = $h['X-JWT'] ?? $h['x-jwt'] ?? '';
    }
    if ($xJwt !== '') {
        return trim($xJwt);
    }
    return null;
}

/**
 * 鉴权失败时返回 401
 * @param string|null $reason 可选，具体原因（如 UserToken 缺少 upid）
 */
function jwtVerifyDeny($reason = null) {
    $message = $reason !== null && $reason !== ''
        ? $reason
        : '缺少或无效的 JWT 鉴权';
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token, X-JWT');
    echo json_encode([
        'status' => 'error',
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s'),
        'timestamp_unix' => time()
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * 从 GET 参数获取 upid（trim 后非空才返回）
 * @return mixed upid 或 null
 */
function jwtVerifyExtractUpid() {
    $raw = $_GET['upid'] ?? null;
    if ($raw === null) {
        return null;
    }
    $upid = is_string($raw) ? trim($raw) : (string)$raw;
    return ($upid !== '') ? $upid : null;
}

/**
 * 执行 JWT 验证：SystemToken 放行；UserToken 要求携带 upid，并根据 action 校验程序权限与用户授权能力
 * @param string|null $serviceName 可选，服务名（FSDirve、CompressionDirve、DISKMANAGER），传入时对 UserToken+upid 做权限校验
 * 无 Token 或 Token 无效时返回 401
 */
function requireJWTVerify($serviceName = null) {
    $token = jwtVerifyExtractToken();
    if ($token === null || $token === '') {
        jwtVerifyDeny();
    }

    $payload = JWT::decode($token);
    if ($payload === false) {
        jwtVerifyDeny();
    }

    $type = $payload['type'] ?? '';
    if ($type === 'SystemToken') {
        return;
    }
    if ($type === 'UserToken') {
        $upid = jwtVerifyExtractUpid();
        if ($upid === null || $upid === '') {
            jwtVerifyDeny('UserToken 需在 URL 中传入 upid 参数');
        }
        if ($serviceName !== null && $serviceName !== '') {
            jwtVerifyCheckUpidPermission($serviceName, $upid, $payload);
        }
        return;
    }

    jwtVerifyDeny();
}
