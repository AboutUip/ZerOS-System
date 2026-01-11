<?php
/**
 * ZerOS 系统安装 - 文件解压服务
 * 用于解压安装包到指定位置
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
// systemsetup 的父目录就是安装根目录
define('BASE_DIR', __DIR__);

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
 * 解压 ZIP 文件
 */
function extractZip($zipPath, $targetDir) {
    if (!file_exists($zipPath)) {
        return ['success' => false, 'message' => 'ZIP文件不存在: ' . $zipPath];
    }
    
    if (!extension_loaded('zip')) {
        return ['success' => false, 'message' => 'PHP Zip扩展未安装'];
    }
    
    $zip = new ZipArchive();
    $result = $zip->open($zipPath);
    
    if ($result !== true) {
        return ['success' => false, 'message' => '无法打开ZIP文件，错误代码: ' . $result];
    }
    
    // 确保目标目录存在
    if (!is_dir($targetDir)) {
        if (!mkdir($targetDir, 0755, true)) {
            $zip->close();
            return ['success' => false, 'message' => '无法创建目标目录: ' . $targetDir];
        }
    }
    // 获取真实路径（规范化路径）
    $targetDir = realpath($targetDir);
    
    // 解压文件
    if (!$zip->extractTo($targetDir)) {
        $errorMsg = '解压失败';
        // 尝试获取更多错误信息
        if (function_exists('error_get_last')) {
            $lastError = error_get_last();
            if ($lastError) {
                $errorMsg .= ': ' . $lastError['message'];
            }
        }
        $zip->close();
        return ['success' => false, 'message' => $errorMsg];
    }
    
    $extractedCount = $zip->numFiles;
    $zip->close();
    return ['success' => true, 'message' => '解压成功，共解压 ' . $extractedCount . ' 个文件'];
}

// 获取请求参数
$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'extract-core':
        $zipPath = SETUP_DIR . '/system-core.zip';
        $targetDir = BASE_DIR;
        $result = extractZip($zipPath, $targetDir);
        sendResponse($result['success'], $result['message']);
        break;
        
    case 'extract-libs':
        $zipPath = SETUP_DIR . '/system-libs.zip';
        $targetDir = BASE_DIR . '/kernel/dynamicModule/libs';
        $result = extractZip($zipPath, $targetDir);
        sendResponse($result['success'], $result['message']);
        break;
        
    case 'extract-arch':
        $zipPath = SETUP_DIR . '/system-arch.zip';
        $targetDir = BASE_DIR . '/system/service/DISK';
        $result = extractZip($zipPath, $targetDir);
        sendResponse($result['success'], $result['message']);
        break;
        
    case 'extract-apps':
        $zipPath = SETUP_DIR . '/system-apps.zip';
        $targetDir = BASE_DIR . '/system/service/DISK/D';
        $result = extractZip($zipPath, $targetDir);
        sendResponse($result['success'], $result['message']);
        break;
        
    default:
        sendResponse(false, '无效的操作', null, 400);
        break;
}

