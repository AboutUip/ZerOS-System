<?php
/**
 * ZerOS 程序权限注册服务
 * 接收前端程序声明的权限，分配 upid，保存到安全文件
 * 访问地址: /system/service/programPermissions.php
 * 
 * upid 生成：2个随机16位数 + programName(Unicode/UTF-8) → SHA-256×2 → 随机顺序拼接 → MD5
 */

require_once __DIR__ . '/jwtVerify.php';

define('BOOT_SECURITY_TOKEN_FILE', __DIR__ . '/DISK/D/BootSecurityToken.json');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token, X-JWT');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

requireJWTVerify();

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

/**
 * 在文件锁保护下执行 load-modify-save，避免并发写入导致数据丢失
 * @param callable $modifyFn function(array $data): void 修改 $data（原地修改）
 * @return bool 是否保存成功
 */
function loadModifySaveBootSecurity(callable $modifyFn) {
    $path = BOOT_SECURITY_TOKEN_FILE;
    $dir = dirname($path);
    if (!is_dir($dir)) {
        return false;
    }
    $fp = fopen($path, 'c+');
    if ($fp === false) {
        return false;
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        return false;
    }
    $content = stream_get_contents($fp);
    $parsed = ($content !== false && $content !== '') ? json_decode($content, true) : null;
    $data = is_array($parsed) ? $parsed : ['tokens' => [], 'count' => 0, 'max_count' => 2, 'programPermissionsMap' => []];
    if (!isset($data['programPermissionsMap']) || !is_array($data['programPermissionsMap'])) {
        $data['programPermissionsMap'] = [];
    }
    $modifyFn($data);
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    ftruncate($fp, 0);
    rewind($fp);
    $written = fwrite($fp, $json);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $written !== false;
}

function loadBootSecurityFile() {
    if (!file_exists(BOOT_SECURITY_TOKEN_FILE)) {
        return ['tokens' => [], 'count' => 0, 'max_count' => 2, 'programPermissionsMap' => []];
    }
    $content = file_get_contents(BOOT_SECURITY_TOKEN_FILE);
    $parsed = json_decode($content, true);
    if (!is_array($parsed)) return ['tokens' => [], 'count' => 0, 'max_count' => 2, 'programPermissionsMap' => []];
    if (!isset($parsed['programPermissionsMap']) || !is_array($parsed['programPermissionsMap'])) {
        $parsed['programPermissionsMap'] = [];
    }
    return $parsed;
}

/**
 * 生成 upid：2个随机16位数 + programName(Unicode/UTF-8编码) → 分别 SHA-256 → 随机顺序拼接 → MD5
 * @param string|null $programName 程序名
 * @param array $existingKeys 已存在的 upid 键，用于碰撞时重试
 * @return string 32位十六进制 upid
 */
function generateUpid($programName, array $existingKeys = []) {
    $encoded = ($programName !== null && $programName !== '')
        ? mb_convert_encoding((string)$programName, 'UTF-8', 'UTF-8')
        : '';
    do {
        $rand1 = (string)random_int(1000000000000000, 9999999999999999);
        $rand2 = (string)random_int(1000000000000000, 9999999999999999);
        $hash1 = hash('sha256', $rand1 . $encoded);
        $hash2 = hash('sha256', $rand2 . $encoded);
        $concatenated = (random_int(0, 1) === 0) ? ($hash1 . $hash2) : ($hash2 . $hash1);
        $upid = hash('md5', $concatenated);
    } while (isset($existingKeys[$upid]));
    return $upid;
}

function saveBootSecurityFile($data) {
    $dir = dirname(BOOT_SECURITY_TOKEN_FILE);
    if (!is_dir($dir)) {
        return false;
    }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    return file_put_contents(BOOT_SECURITY_TOKEN_FILE, $json, LOCK_EX) !== false;
}

try {
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? null;
    $postData = [];
    if ($method === 'POST') {
        $rawInput = @file_get_contents('php://input');
        if ($rawInput) {
            $postData = json_decode($rawInput, true) ?: [];
            if (isset($postData['action'])) {
                $action = $postData['action'];
            }
        }
    }

    if ($action === 'register') {
        $permissions = $postData['permissions'] ?? null;
        $programName = $postData['programName'] ?? null;

        if (!is_array($permissions)) {
            sendResponse(false, 'permissions 必须为数组', null, 400);
        }

        $upid = null;
        $ok = loadModifySaveBootSecurity(function (array &$data) use ($programName, $permissions, &$upid) {
            $map = &$data['programPermissionsMap'];
            $upid = generateUpid($programName, $map);
            $map[$upid] = $permissions;
        });
        if (!$ok || $upid === null) {
            sendResponse(false, '写入安全文件失败', null, 500);
        }
        sendResponse(true, '权限注册成功', ['upid' => $upid]);
    }

    if ($action === 'reclaim') {
        $upidRaw = $postData['upid'] ?? $_GET['upid'] ?? null;
        $upid = is_string($upidRaw) ? trim($upidRaw) : (string)$upidRaw;
        if ($upid === null || $upid === '') {
            sendResponse(false, '缺少 upid 参数', null, 400);
        }

        $ok = loadModifySaveBootSecurity(function (array &$data) use ($upid) {
            $map = &$data['programPermissionsMap'];
            if (isset($map[$upid])) {
                unset($map[$upid]);
            }
        });
        if (!$ok) {
            sendResponse(false, '写入安全文件失败', null, 500);
        }
        sendResponse(true, 'upid 已回收', ['upid' => $upid]);
    }

    sendResponse(false, '无效的 action', null, 400);
} catch (Exception $e) {
    sendResponse(false, '服务器错误: ' . $e->getMessage(), null, 500);
}
