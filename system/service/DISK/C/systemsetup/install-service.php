<?php
/**
 * ZerOS 系统安装 - 安装服务
 * 用于处理磁盘初始化和用户创建
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 基础路径配置
define('SETUP_DIR', __DIR__);
define('DISK_BASE_PATH', dirname(dirname(__DIR__)) . '/DISK');
define('DISK_D_PATH', DISK_BASE_PATH . '/D');
define('DISK_DATA_FILE', DISK_D_PATH . '/DiskData.json');
define('LOCAL_SDATA_FILE', DISK_D_PATH . '/LocalSData.json');

/**
 * 响应函数
 */
function sendResponse($success, $message, $data = null, $code = 200) {
    http_response_code($code);
    $response = [
        'status' => $success ? 'success' : 'error',
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ];
    if ($data !== null) {
        $response['data'] = $data;
    }
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * 读取 JSON 文件
 */
function readJsonFile($filePath) {
    if (!file_exists($filePath)) {
        return null;
    }
    $content = file_get_contents($filePath);
    return json_decode($content, true);
}

/**
 * 写入 JSON 文件
 */
function writeJsonFile($filePath, $data) {
    $dir = dirname($filePath);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $content = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    return file_put_contents($filePath, $content) !== false;
}

/**
 * MD5 加密密码
 */
function md5Hash($password) {
    return md5($password);
}

/**
 * 同步磁盘数据
 */
function syncDiskData($partitions) {
    $totalSize = 5 * 1024 * 1024 * 1024; // 5GB
    $diskData = [
        'totalSize' => $totalSize,
        'partitionCount' => count($partitions),
        'partitions' => $partitions
    ];
    
    return writeJsonFile(DISK_DATA_FILE, $diskData);
}

/**
 * 创建管理员用户
 */
function createAdminUser($username, $password) {
    // 读取 LocalSData.json
    $localData = readJsonFile(LOCAL_SDATA_FILE);
    if ($localData === null) {
        $localData = ['system' => []];
    }
    
    if (!isset($localData['system'])) {
        $localData['system'] = [];
    }
    
    // 初始化用户数据
    if (!isset($localData['system']['userControl.users'])) {
        $localData['system']['userControl.users'] = [];
    }
    
    // 创建管理员用户
    $userData = [
        'level' => 'DEFAULT_ADMIN',
        'password' => md5Hash($password),
        'avatar' => null,
        'createdAt' => time() * 1000, // JavaScript timestamp
        'lastLogin' => null
    ];
    
    $localData['system']['userControl.users'][$username] = $userData;
    $localData['system']['userControl.currentUser'] = $username;
    
    return writeJsonFile(LOCAL_SDATA_FILE, $localData);
}

// 处理请求
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

if ($method === 'POST') {
    $action = $input['action'] ?? '';
    
    switch ($action) {
        case 'sync-disk':
            // 同步磁盘数据
            $partitions = $input['partitions'] ?? [];
            
            // 验证分区数据
            $totalSize = 5 * 1024 * 1024 * 1024; // 5GB
            $systemSize = 2 * 1024 * 1024 * 1024; // 2GB (D盘)
            $allocated = 0;
            
            foreach ($partitions as $name => $size) {
                if (!preg_match('/^[A-Z]:$/', $name)) {
                    sendResponse(false, '无效的分区名称: ' . $name);
                }
                $allocated += $size;
            }
            
            // 验证 D: 分区大小
            if (!isset($partitions['D:']) || $partitions['D:'] !== $systemSize) {
                sendResponse(false, '系统盘 D: 必须为 2GB');
            }
            
            // 验证总大小
            if ($allocated > $totalSize) {
                sendResponse(false, '分区总大小超过 5GB');
            }
            
            if (syncDiskData($partitions)) {
                sendResponse(true, '磁盘数据同步成功');
            } else {
                sendResponse(false, '磁盘数据同步失败');
            }
            break;
            
        case 'create-admin':
            // 创建管理员用户
            $username = $input['username'] ?? '';
            $password = $input['password'] ?? '';
            
            // 验证用户名（只能英文）
            if (!preg_match('/^[a-zA-Z][a-zA-Z0-9_]*$/', $username)) {
                sendResponse(false, '用户名只能包含英文字母、数字和下划线，且必须以字母开头');
                break;
            }
            
            if (empty($password)) {
                sendResponse(false, '密码不能为空');
                break;
            }
            
            if (createAdminUser($username, $password)) {
                sendResponse(true, '管理员用户创建成功');
            } else {
                sendResponse(false, '管理员用户创建失败');
            }
            break;
            
        case 'cleanup':
            // 清理安装文件（包括所有安装相关的文件）
            // 安全检查：确保只删除安装目录下的文件
            $setupDirReal = realpath(SETUP_DIR);
            if (!$setupDirReal) {
                sendResponse(false, '安装目录不存在', null, 500);
            }
            
            // 允许删除的文件列表（仅文件名，不包含路径）
            $allowedFiles = [
                'system-core.zip',
                'system-libs.zip',
                'system-arch.zip',
                'system-apps.zip',
                'index.html',
                'install.css',
                'install-extract.php',
                'test.php',
                'zeros-logo.svg',
                'install-service.php'
            ];
            
            $deleted = [];
            $failed = [];
            
            foreach ($allowedFiles as $fileName) {
                $filePath = SETUP_DIR . '/' . $fileName;
                $fileRealPath = realpath($filePath);
                
                // 安全检查：确保文件在安装目录内
                if ($fileRealPath && strpos($fileRealPath, $setupDirReal) === 0) {
                    if (file_exists($fileRealPath) && is_file($fileRealPath)) {
                        // install-service.php 最后删除（当前脚本文件）
                        if ($fileName === 'install-service.php') {
                            continue; // 跳过，最后处理
                        }
                        
                        if (unlink($fileRealPath)) {
                            $deleted[] = $fileName;
                        } else {
                            $failed[] = $fileName;
                        }
                    }
                } else {
                    $failed[] = $fileName . ' (路径验证失败)';
                }
            }
            
            // 最后删除 install-service.php（如果存在）
            $serviceFilePath = SETUP_DIR . '/install-service.php';
            $serviceFileRealPath = realpath($serviceFilePath);
            if ($serviceFileRealPath && strpos($serviceFileRealPath, $setupDirReal) === 0) {
                if (file_exists($serviceFileRealPath) && is_file($serviceFileRealPath)) {
                    // 注意：删除当前执行的脚本文件是安全的，因为PHP会先完成执行
                    if (unlink($serviceFileRealPath)) {
                        $deleted[] = 'install-service.php';
                    } else {
                        $failed[] = 'install-service.php';
                    }
                }
            }
            
            sendResponse(true, '清理完成', [
                'deleted' => $deleted,
                'failed' => $failed
            ]);
            break;
            
        default:
            sendResponse(false, '无效的操作', null, 400);
            break;
    }
} else {
    sendResponse(false, '仅支持 POST 请求', null, 405);
}

