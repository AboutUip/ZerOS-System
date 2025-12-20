<?php
/**
 * ES 模块代理服务
 * 用于正确设置 ES 模块文件的 MIME 类型
 * 访问地址: http://localhost:8089/system/service/module-proxy.php?path=/kernel/dynamicModule/libs/mediapipe/vision_bundle.mjs
 */

// 设置 CORS 头
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// 禁止缓存 - 确保总是获取最新文件
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 获取请求路径
$requestPath = $_GET['path'] ?? '';

if (empty($requestPath)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Path parameter is required']);
    exit;
}

// 移除开头的斜杠，构建实际文件路径
$filePath = ltrim($requestPath, '/');

// system/service/module-proxy.php 在 system/service/ 目录下，需要访问项目根目录的文件
// 所以需要向上到项目根目录
// 使用 realpath 确保路径规范化，避免符号链接等问题
$serviceDir = realpath(__DIR__) ?: __DIR__;
$projectRoot = dirname(dirname($serviceDir)); // 从 system/service/ 到项目根目录

// 确保项目根目录路径使用正确的分隔符
$projectRoot = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $projectRoot);

// 验证项目根目录是否存在
if (!is_dir($projectRoot)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Invalid project root directory',
        'debug' => [
            '__DIR__' => __DIR__,
            '__FILE__' => __FILE__,
            'serviceDir' => $serviceDir,
            'projectRoot' => $projectRoot,
            'projectRootExists' => is_dir($projectRoot)
        ]
    ]);
    exit;
}

// 将 URL 路径分隔符转换为系统路径分隔符
// 在 Windows 上，DIRECTORY_SEPARATOR 是反斜杠，但 realpath 可以处理正斜杠
$normalizedPath = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $filePath);
// 移除路径中的多余分隔符
$normalizedPath = preg_replace('/[\/\\\\]+/', DIRECTORY_SEPARATOR, $normalizedPath);
$fullPath = $projectRoot . DIRECTORY_SEPARATOR . $normalizedPath;

// 同时尝试使用正斜杠的路径（某些系统可能更兼容）
$fullPathAlt = $projectRoot . '/' . str_replace('\\', '/', $filePath);

// 安全检查：确保文件在项目目录内
$basePath = realpath($projectRoot);
if (!$basePath) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid project root']);
    exit;
}

// 检查路径是否在项目目录内（即使文件不存在也要检查路径）
// 先尝试使用正斜杠路径（realpath 在 Windows 上可以处理正斜杠）
$realPath = realpath($fullPathAlt) ?: realpath($fullPath);

// 安全检查：确保路径在项目目录内
// 在 Windows 上，路径比较需要不区分大小写
$normalizedFullPath = strtolower(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $fullPath));
$normalizedBasePath = strtolower(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $basePath));
if (strpos($normalizedFullPath, $normalizedBasePath) !== 0) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Access denied - Path outside project root',
        'debug' => [
            'requestPath' => $requestPath,
            'filePath' => $filePath,
            'fullPath' => $fullPath,
            'normalizedFullPath' => $normalizedFullPath,
            'basePath' => $basePath,
            'normalizedBasePath' => $normalizedBasePath
        ]
    ]);
    exit;
}

// 如果 realpath 成功，再次检查真实路径是否在项目目录内（双重检查，不区分大小写）
if ($realPath) {
    $normalizedRealPath = strtolower(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $realPath));
    if (strpos($normalizedRealPath, $normalizedBasePath) !== 0) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'Access denied - Real path outside project root',
            'debug' => [
                'requestPath' => $requestPath,
                'filePath' => $filePath,
                'fullPath' => $fullPath,
                'realPath' => $realPath,
                'normalizedRealPath' => $normalizedRealPath,
                'basePath' => $basePath,
                'normalizedBasePath' => $normalizedBasePath
            ]
        ]);
        exit;
    }
}

// 检查文件是否存在
// 按优先级检查：realPath > fullPathAlt > fullPath
// 同时尝试多种路径变体（Windows 路径大小写不敏感）
$fileToCheck = null;
$pathsToTry = [];
if ($realPath) {
    $pathsToTry[] = $realPath;
}
$pathsToTry[] = $fullPathAlt;
$pathsToTry[] = $fullPath;
// 尝试使用反斜杠路径（Windows）
$pathsToTry[] = str_replace('/', '\\', $fullPathAlt);
// 尝试使用正斜杠路径（Unix）
$pathsToTry[] = str_replace('\\', '/', $fullPath);

foreach ($pathsToTry as $path) {
    if ($path && file_exists($path) && is_file($path)) {
        $fileToCheck = $path;
        break;
    }
}

if (!$fileToCheck) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'File not found',
        'debug' => [
            'requestPath' => $requestPath,
            'filePath' => $filePath,
            'fullPath' => $fullPath,
            'fullPathAlt' => isset($fullPathAlt) ? $fullPathAlt : 'not set',
            'realPath' => $realPath,
            'fileToCheck' => $fileToCheck,
            'basePath' => $basePath,
            'projectRoot' => $projectRoot,
            'fileExists_fullPath' => file_exists($fullPath),
            'isFile_fullPath' => is_file($fullPath),
            'fileExists_fullPathAlt' => isset($fullPathAlt) ? file_exists($fullPathAlt) : false,
            'isFile_fullPathAlt' => isset($fullPathAlt) ? is_file($fullPathAlt) : false,
            'fileExists_realPath' => $realPath ? file_exists($realPath) : false,
            'isFile_realPath' => $realPath ? is_file($realPath) : false,
            'dirname' => dirname(__FILE__),
            '__DIR__' => __DIR__,
            'DIRECTORY_SEPARATOR' => DIRECTORY_SEPARATOR
        ]
    ]);
    exit;
}

// 使用实际存在的文件路径
$actualPath = $fileToCheck;

// 根据文件扩展名设置正确的 MIME 类型
$extension = strtolower(pathinfo($actualPath, PATHINFO_EXTENSION));
$mimeTypes = [
    'js' => 'application/javascript',
    'mjs' => 'application/javascript',
    'cjs' => 'application/javascript',
    'json' => 'application/json',
    'css' => 'text/css',
    'html' => 'text/html',
    'htm' => 'text/html',
    'wasm' => 'application/wasm',
    'txt' => 'text/plain',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp'
];

$mimeType = $mimeTypes[$extension] ?? 'application/octet-stream';

// 设置正确的 MIME 类型
// WASM 文件是二进制文件，不应该设置 charset
if ($extension === 'wasm') {
    header('Content-Type: application/wasm');
} else if ($extension === 'js' || $extension === 'mjs') {
    // ES 模块文件：使用 application/javascript，不设置 charset（某些浏览器对 import() 有严格要求）
    // 同时添加 X-Content-Type-Options 头，防止浏览器 MIME 类型嗅探
    header('Content-Type: application/javascript');
    header('X-Content-Type-Options: nosniff');
} else {
    // 其他文本文件可以设置 charset
    header('Content-Type: ' . $mimeType . '; charset=utf-8');
}

// 不设置长期缓存，确保总是获取最新文件
// 已在文件开头设置了 no-cache 头

// 对于 WASM 文件，使用二进制模式读取
if ($extension === 'wasm') {
    // 直接输出二进制文件，不经过 PHP 的字符串处理
    header('Content-Length: ' . filesize($actualPath));
    readfile($actualPath);
    exit;
}

// 读取文件内容（文本文件）
$fileContent = file_get_contents($actualPath);

// 检查文件是否成功读取
if ($fileContent === false) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Failed to read file']);
    exit;
}

// 检查文件是否为空
if (empty($fileContent)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'File is empty',
        'debug' => [
            'filePath' => $actualPath,
            'fileSize' => filesize($actualPath)
        ]
    ]);
    exit;
}

// 输出文件内容
echo $fileContent;

