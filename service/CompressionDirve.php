<?php
/**
 * ZerOS 压缩驱动服务
 * 支持 ZIP 和 RAR 格式的压缩与解压缩操作
 * 
 * 访问地址: http://localhost:8089/service/CompressionDirve.php?action=xxx&...
 */

// 设置错误处理，确保所有错误都返回 JSON
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    // 忽略某些错误类型
    if (!(error_reporting() & $errno)) {
        return false;
    }
    
    // 发送 JSON 错误响应
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'error',
        'message' => '服务器内部错误: ' . $errstr,
        'timestamp' => date('Y-m-d H:i:s'),
        'timestamp_unix' => time()
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

// 设置异常处理
set_exception_handler(function($exception) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'error',
        'message' => '未捕获的异常: ' . $exception->getMessage(),
        'timestamp' => date('Y-m-d H:i:s'),
        'timestamp_unix' => time()
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

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

// 基础路径配置
define('DISK_BASE_PATH', __DIR__ . '/DISK');
define('DISK_C_PATH', DISK_BASE_PATH . '/C');
define('DISK_D_PATH', DISK_BASE_PATH . '/D');

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

/**
 * 验证路径安全性
 */
function validatePath($path) {
    // 移除开头的斜杠
    $path = ltrim($path, '/');
    
    // 检查路径格式：应该是 C:、C:/...、D: 或 D:/...
    if (!preg_match('/^[CD]:(\/|$)/', $path)) {
        return false;
    }
    
    // 提取盘符和相对路径
    $parts = explode(':', $path, 2);
    $disk = $parts[0];
    $relativePath = isset($parts[1]) ? ltrim($parts[1], '/') : '';
    
    // 验证盘符
    if (!in_array($disk, ['C', 'D'])) {
        return false;
    }
    
    // 检查路径中是否包含危险字符（防止目录遍历攻击）
    if (strpos($relativePath, '..') !== false) {
        return false;
    }
    
    return ['disk' => $disk, 'path' => $relativePath];
}

/**
 * 将虚拟路径转换为实际文件系统路径
 */
function getRealPath($virtualPath) {
    $validated = validatePath($virtualPath);
    if (!$validated) {
        return null;
    }
    
    $disk = $validated['disk'];
    $relativePath = $validated['path'];
    
    $basePath = $disk === 'C' ? DISK_C_PATH : DISK_D_PATH;
    
    // 如果相对路径为空，直接返回基础路径（根目录）
    if (empty($relativePath)) {
        return $basePath;
    }
    
    $realPath = $basePath . '/' . $relativePath;
    
    // 规范化路径（移除多余的斜杠）
    $realPath = str_replace(['\\', '//'], '/', $realPath);
    $realPath = rtrim($realPath, '/');
    
    return $realPath;
}

/**
 * 检查 ZIP 支持
 */
function checkZipSupport() {
    if (!class_exists('ZipArchive')) {
        return false;
    }
    return true;
}

/**
 * 检查 RAR 支持
 */
function checkRarSupport() {
    if (!extension_loaded('rar')) {
        return false;
    }
    return true;
}

/**
 * 获取文件扩展名
 */
function getFileExtension($filename) {
    return strtolower(pathinfo($filename, PATHINFO_EXTENSION));
}

/**
 * ZIP 压缩（支持多个源路径）
 * @param string|array $sourcePath 源路径（文件或目录），可以是单个路径字符串或路径数组
 * @param string $targetPath 目标压缩文件路径
 * @param array $options 选项（可选）
 *   - exclude: 排除的文件/目录列表
 *   - compressionLevel: 压缩级别 (0-9, 默认 6)
 */
function compressZip($sourcePath, $targetPath, $options = []) {
    // 支持单个路径或路径数组
    $sourcePaths = is_array($sourcePath) ? $sourcePath : [$sourcePath];
    if (!checkZipSupport()) {
        sendResponse(false, 'ZIP 扩展未安装，无法进行 ZIP 压缩', null, 500);
    }
    
    $targetRealPath = getRealPath($targetPath);
    
    if (!$targetRealPath) {
        sendResponse(false, '无效的目标路径格式', null, 400);
    }
    
    // 验证所有源路径
    $sourceRealPaths = [];
    foreach ($sourcePaths as $path) {
        $realPath = getRealPath($path);
        if (!$realPath) {
            sendResponse(false, '无效的源路径格式: ' . $path, null, 400);
        }
        if (!file_exists($realPath)) {
            sendResponse(false, '源路径不存在: ' . $path, null, 404);
        }
        $sourceRealPaths[] = $realPath;
    }
    
    // 检查目标目录是否存在
    $targetDir = dirname($targetRealPath);
    if (!is_dir($targetDir)) {
        sendResponse(false, '目标目录不存在: ' . dirname($targetPath), null, 404);
    }
    
    // 检查目标文件是否已存在
    if (file_exists($targetRealPath)) {
        sendResponse(false, '目标文件已存在: ' . basename($targetPath), null, 409);
    }
    
    // 获取选项
    $exclude = $options['exclude'] ?? [];
    $compressionLevel = isset($options['compressionLevel']) ? intval($options['compressionLevel']) : 6;
    $compressionLevel = max(0, min(9, $compressionLevel)); // 限制在 0-9 之间
    
    $zip = new ZipArchive();
    if ($zip->open($targetRealPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
        sendResponse(false, '无法创建 ZIP 文件', null, 500);
    }
    
    // 注意：PHP ZipArchive 不支持直接设置全局压缩级别
    // 压缩级别由系统默认值决定，通常为 6
    // 如果需要控制压缩级别，需要使用外部工具或第三方库
    
    try {
        // 处理多个源路径
        foreach ($sourceRealPaths as $sourceRealPath) {
            if (is_file($sourceRealPath)) {
                // 单个文件：添加到 ZIP 根目录，使用文件名
                $zip->addFile($sourceRealPath, basename($sourceRealPath));
            } else {
                // 目录：递归添加所有文件
                $sourceDir = $sourceRealPath;
                $baseName = basename($sourceDir);
                $iterator = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($sourceDir, RecursiveDirectoryIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::SELF_FIRST
                );
                
                foreach ($iterator as $file) {
                    $filePath = $file->getRealPath();
                    // 规范化路径分隔符，确保使用正斜杠
                    $normalizedSourceDir = str_replace('\\', '/', $sourceDir);
                    $normalizedFilePath = str_replace('\\', '/', $filePath);
                    $relativePath = str_replace($normalizedSourceDir . '/', '', $normalizedFilePath);
                    
                    // 如果只有一个源路径，保持原有行为（相对路径）
                    // 如果有多个源路径，使用目录名作为前缀以避免冲突
                    $zipPath = count($sourceRealPaths) > 1 ? $baseName . '/' . $relativePath : $relativePath;
                    
                    // 检查是否在排除列表中
                    $shouldExclude = false;
                    foreach ($exclude as $pattern) {
                        // 规范化排除模式
                        $normalizedPattern = str_replace('\\', '/', $pattern);
                        if (strpos($relativePath, $normalizedPattern) === 0 || $relativePath === $normalizedPattern) {
                            $shouldExclude = true;
                            break;
                        }
                    }
                    if ($shouldExclude) {
                        continue;
                    }
                    
                    if ($file->isDir()) {
                        $zip->addEmptyDir($zipPath);
                    } else {
                        $zip->addFile($filePath, $zipPath);
                    }
                }
            }
        }
        
        $zip->close();
        
        $fileSize = filesize($targetRealPath);
        sendResponse(true, 'ZIP 压缩成功', [
            'sourcePaths' => $sourcePaths,
            'sourcePath' => count($sourcePaths) === 1 ? $sourcePaths[0] : null, // 兼容性：单个路径时提供
            'targetPath' => $targetPath,
            'size' => $fileSize,
            'compressionLevel' => $compressionLevel,
            'sourceCount' => count($sourcePaths)
        ]);
    } catch (Exception $e) {
        if ($zip->close() === false) {
            @unlink($targetRealPath); // 删除不完整的文件
        }
        sendResponse(false, 'ZIP 压缩失败: ' . $e->getMessage(), null, 500);
    }
}

/**
 * ZIP 解压缩
 * @param string $sourcePath 压缩文件路径
 * @param string $targetPath 解压目标目录路径
 * @param array $options 选项（可选）
 *   - files: 要解压的特定文件列表（为空则解压所有）
 *   - overwrite: 是否覆盖已存在的文件（默认 false）
 */
function extractZip($sourcePath, $targetPath, $options = []) {
    if (!checkZipSupport()) {
        sendResponse(false, 'ZIP 扩展未安装，无法进行 ZIP 解压缩', null, 500);
    }
    
    $sourceRealPath = getRealPath($sourcePath);
    $targetRealPath = getRealPath($targetPath);
    
    if (!$sourceRealPath || !$targetRealPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查源文件是否存在
    if (!file_exists($sourceRealPath)) {
        sendResponse(false, '压缩文件不存在: ' . $sourcePath, null, 404);
    }
    
    // 检查是否为 ZIP 文件
    if (getFileExtension($sourceRealPath) !== 'zip') {
        sendResponse(false, '文件不是 ZIP 格式: ' . $sourcePath, null, 400);
    }
    
    // 检查目标目录是否存在
    if (!is_dir($targetRealPath)) {
        // 尝试创建目录
        if (!mkdir($targetRealPath, 0755, true)) {
            sendResponse(false, '无法创建目标目录: ' . $targetPath, null, 500);
        }
    }
    
    // 获取选项
    $filesToExtract = $options['files'] ?? [];
    $overwrite = $options['overwrite'] ?? false;
    
    $zip = new ZipArchive();
    if ($zip->open($sourceRealPath) !== TRUE) {
        sendResponse(false, '无法打开 ZIP 文件', null, 500);
    }
    
    try {
        $extractedCount = 0;
        $extractedFiles = [];
        
        // 如果指定了要解压的文件列表
        if (!empty($filesToExtract)) {
            // extractTo 的第二个参数应该是数组
            $filesArray = is_array($filesToExtract) ? $filesToExtract : [$filesToExtract];
            
            // 解压所有指定文件
            if ($zip->extractTo($targetRealPath, $filesArray)) {
                // 验证每个文件是否成功解压
                foreach ($filesArray as $fileInZip) {
                    // 规范化路径分隔符
                    $normalizedFileInZip = str_replace('\\', '/', $fileInZip);
                    $targetFile = $targetRealPath . '/' . $normalizedFileInZip;
                    
                    // 检查文件是否已存在（解压成功）
                    if (file_exists($targetFile)) {
                        $extractedCount++;
                        $extractedFiles[] = $normalizedFileInZip;
                    }
                }
            }
        } else {
            // 解压所有文件
            if ($zip->extractTo($targetRealPath)) {
                $extractedCount = $zip->numFiles;
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $extractedFiles[] = $zip->getNameIndex($i);
                }
            }
        }
        
        $zip->close();
        
        sendResponse(true, 'ZIP 解压缩成功', [
            'sourcePath' => $sourcePath,
            'targetPath' => $targetPath,
            'extractedCount' => $extractedCount,
            'extractedFiles' => $extractedFiles
        ]);
    } catch (Exception $e) {
        $zip->close();
        sendResponse(false, 'ZIP 解压缩失败: ' . $e->getMessage(), null, 500);
    }
}

/**
 * 列出 ZIP 文件内容
 * @param string $sourcePath 压缩文件路径
 */
function listZip($sourcePath) {
    if (!checkZipSupport()) {
        sendResponse(false, 'ZIP 扩展未安装，无法列出 ZIP 内容', null, 500);
    }
    
    $sourceRealPath = getRealPath($sourcePath);
    
    if (!$sourceRealPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查源文件是否存在
    if (!file_exists($sourceRealPath)) {
        sendResponse(false, '压缩文件不存在: ' . $sourcePath, null, 404);
    }
    
    // 检查是否为 ZIP 文件
    if (getFileExtension($sourceRealPath) !== 'zip') {
        sendResponse(false, '文件不是 ZIP 格式: ' . $sourcePath, null, 400);
    }
    
    $zip = new ZipArchive();
    if ($zip->open($sourceRealPath) !== TRUE) {
        sendResponse(false, '无法打开 ZIP 文件', null, 500);
    }
    
    $files = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        if ($stat === false) {
            continue; // 跳过无效的条目
        }
        
        // 安全地获取所有字段，使用默认值
        $files[] = [
            'name' => $stat['name'] ?? '',
            'size' => $stat['size'] ?? 0,
            'compressedSize' => $stat['compressed_size'] ?? ($stat['size'] ?? 0), // 如果压缩大小不存在，使用原始大小
            'isDir' => substr($stat['name'] ?? '', -1) === '/',
            'modified' => isset($stat['mtime']) && $stat['mtime'] > 0 ? date('Y-m-d H:i:s', $stat['mtime']) : null
        ];
    }
    
    $zip->close();
    
    sendResponse(true, 'ZIP 文件列表获取成功', [
        'sourcePath' => $sourcePath,
        'fileCount' => count($files),
        'files' => $files
    ]);
}

/**
 * RAR 压缩
 * 注意：PHP 没有内置 RAR 支持，需要安装 RAR 扩展或使用外部工具
 */
function compressRar($sourcePath, $targetPath, $options = []) {
    if (!checkRarSupport()) {
        sendResponse(false, 'RAR 扩展未安装，无法进行 RAR 压缩。请安装 php-rar 扩展或使用 ZIP 格式', null, 500);
    }
    
    $sourceRealPath = getRealPath($sourcePath);
    $targetRealPath = getRealPath($targetPath);
    
    if (!$sourceRealPath || !$targetRealPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查源路径是否存在
    if (!file_exists($sourceRealPath)) {
        sendResponse(false, '源路径不存在: ' . $sourcePath, null, 404);
    }
    
    // 检查目标目录是否存在
    $targetDir = dirname($targetRealPath);
    if (!is_dir($targetDir)) {
        sendResponse(false, '目标目录不存在: ' . dirname($targetPath), null, 404);
    }
    
    // 检查目标文件是否已存在
    if (file_exists($targetRealPath)) {
        sendResponse(false, '目标文件已存在: ' . basename($targetPath), null, 409);
    }
    
    // PHP RAR 扩展主要用于读取，不支持创建 RAR 文件
    // 需要使用外部工具（如 WinRAR 命令行）或第三方库
    sendResponse(false, 'RAR 压缩功能需要外部工具支持，当前版本暂不支持 RAR 压缩。请使用 ZIP 格式或安装 WinRAR 命令行工具', null, 501);
}

/**
 * RAR 解压缩
 * @param string $sourcePath 压缩文件路径
 * @param string $targetPath 解压目标目录路径
 * @param array $options 选项（可选）
 *   - files: 要解压的特定文件列表（为空则解压所有）
 *   - overwrite: 是否覆盖已存在的文件（默认 false）
 */
function extractRar($sourcePath, $targetPath, $options = []) {
    if (!checkRarSupport()) {
        sendResponse(false, 'RAR 扩展未安装，无法进行 RAR 解压缩。请安装 php-rar 扩展', null, 500);
    }
    
    $sourceRealPath = getRealPath($sourcePath);
    $targetRealPath = getRealPath($targetPath);
    
    if (!$sourceRealPath || !$targetRealPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查源文件是否存在
    if (!file_exists($sourceRealPath)) {
        sendResponse(false, '压缩文件不存在: ' . $sourcePath, null, 404);
    }
    
    // 检查是否为 RAR 文件
    $ext = getFileExtension($sourceRealPath);
    if ($ext !== 'rar') {
        sendResponse(false, '文件不是 RAR 格式: ' . $sourcePath, null, 400);
    }
    
    // 检查目标目录是否存在
    if (!is_dir($targetRealPath)) {
        // 尝试创建目录
        if (!mkdir($targetRealPath, 0755, true)) {
            sendResponse(false, '无法创建目标目录: ' . $targetPath, null, 500);
        }
    }
    
    // 获取选项
    $filesToExtract = $options['files'] ?? [];
    $overwrite = $options['overwrite'] ?? false;
    
    try {
        $rar = RarArchive::open($sourceRealPath);
        if (!$rar) {
            sendResponse(false, '无法打开 RAR 文件', null, 500);
        }
        
        $extractedCount = 0;
        $extractedFiles = [];
        
        $entries = $rar->getEntries();
        if (!$entries) {
            $rar->close();
            sendResponse(false, 'RAR 文件为空或损坏', null, 500);
        }
        
        foreach ($entries as $entry) {
            // 如果指定了要解压的文件列表
            if (!empty($filesToExtract) && !in_array($entry->getName(), $filesToExtract)) {
                continue;
            }
            
            // 跳过目录
            if ($entry->isDirectory()) {
                continue;
            }
            
            $entryName = $entry->getName();
            // 规范化路径分隔符（RAR 文件可能使用反斜杠）
            $normalizedEntryName = str_replace('\\', '/', $entryName);
            $targetFile = $targetRealPath . '/' . $normalizedEntryName;
            $targetDir = dirname($targetFile);
            
            // 创建目录（如果需要）
            if (!is_dir($targetDir)) {
                mkdir($targetDir, 0755, true);
            }
            
            // 检查文件是否已存在
            if (file_exists($targetFile) && !$overwrite) {
                continue;
            }
            
            // 解压文件
            $stream = $entry->getStream();
            if ($stream) {
                $fileContent = stream_get_contents($stream);
                fclose($stream);
                
                if (file_put_contents($targetFile, $fileContent) !== false) {
                    $extractedCount++;
                    $extractedFiles[] = $normalizedEntryName;
                }
            }
        }
        
        $rar->close();
        
        sendResponse(true, 'RAR 解压缩成功', [
            'sourcePath' => $sourcePath,
            'targetPath' => $targetPath,
            'extractedCount' => $extractedCount,
            'extractedFiles' => $extractedFiles
        ]);
    } catch (Exception $e) {
        sendResponse(false, 'RAR 解压缩失败: ' . $e->getMessage(), null, 500);
    }
}

/**
 * 列出 RAR 文件内容
 * @param string $sourcePath 压缩文件路径
 */
function listRar($sourcePath) {
    if (!checkRarSupport()) {
        sendResponse(false, 'RAR 扩展未安装，无法列出 RAR 内容。请安装 php-rar 扩展', null, 500);
    }
    
    $sourceRealPath = getRealPath($sourcePath);
    
    if (!$sourceRealPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查源文件是否存在
    if (!file_exists($sourceRealPath)) {
        sendResponse(false, '压缩文件不存在: ' . $sourcePath, null, 404);
    }
    
    // 检查是否为 RAR 文件
    if (getFileExtension($sourceRealPath) !== 'rar') {
        sendResponse(false, '文件不是 RAR 格式: ' . $sourcePath, null, 400);
    }
    
    try {
        $rar = RarArchive::open($sourceRealPath);
        if (!$rar) {
            sendResponse(false, '无法打开 RAR 文件', null, 500);
        }
        
        $files = [];
        $entries = $rar->getEntries();
        
        if ($entries) {
            foreach ($entries as $entry) {
                $files[] = [
                    'name' => $entry->getName(),
                    'size' => $entry->getUnpackedSize(),
                    'compressedSize' => $entry->getPackedSize(),
                    'isDir' => $entry->isDirectory(),
                    'modified' => $entry->getFileTime() ? date('Y-m-d H:i:s', $entry->getFileTime()) : null
                ];
            }
        }
        
        $rar->close();
        
        sendResponse(true, 'RAR 文件列表获取成功', [
            'sourcePath' => $sourcePath,
            'fileCount' => count($files),
            'files' => $files
        ]);
    } catch (Exception $e) {
        sendResponse(false, '列出 RAR 文件失败: ' . $e->getMessage(), null, 500);
    }
}

/**
 * 检查压缩格式支持
 */
function checkSupport() {
    $support = [
        'zip' => checkZipSupport(),
        'rar' => checkRarSupport()
    ];
    
    sendResponse(true, '压缩格式支持检查完成', $support);
}

// 主处理逻辑
try {
    $action = $_GET['action'] ?? '';

    if (empty($action)) {
        sendResponse(false, '缺少 action 参数', null, 400);
    }

    switch ($action) {
    // ZIP 操作
    case 'compress_zip':
        $targetPath = $_GET['targetPath'] ?? '';
        $options = [];
        $sourcePath = null;
        $sourcePaths = null;
        
        // 解析选项和源路径（从 POST 或 GET）
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $rawInput = file_get_contents('php://input');
            $postData = json_decode($rawInput, true);
            if ($postData) {
                // 支持 sourcePaths（数组）或 sourcePath（单个）
                if (isset($postData['sourcePaths']) && is_array($postData['sourcePaths'])) {
                    $sourcePaths = $postData['sourcePaths'];
                } else if (isset($postData['sourcePath'])) {
                    $sourcePath = $postData['sourcePath'];
                }
                if (isset($postData['options'])) {
                    $options = $postData['options'];
                }
            }
        } else {
            // GET 方式：支持 sourcePath（单个）或 sourcePaths（JSON 字符串）
            if (isset($_GET['sourcePaths'])) {
                $decoded = json_decode($_GET['sourcePaths'], true);
                if (is_array($decoded)) {
                    $sourcePaths = $decoded;
                }
            } else if (isset($_GET['sourcePath'])) {
                $sourcePath = $_GET['sourcePath'];
            }
            if (isset($_GET['exclude'])) {
                $options['exclude'] = is_array($_GET['exclude']) ? $_GET['exclude'] : explode(',', $_GET['exclude']);
            }
            if (isset($_GET['compressionLevel'])) {
                $options['compressionLevel'] = intval($_GET['compressionLevel']);
            }
        }
        
        // 确定使用的源路径
        $finalSourcePath = $sourcePaths !== null ? $sourcePaths : ($sourcePath !== null ? $sourcePath : '');
        
        // 检查源路径：如果是数组，检查是否为空数组；如果是字符串，检查是否为空
        $isSourcePathEmpty = false;
        if (is_array($finalSourcePath)) {
            $isSourcePathEmpty = empty($finalSourcePath);
        } else {
            $isSourcePathEmpty = empty($finalSourcePath);
        }
        
        if ($isSourcePathEmpty || empty($targetPath)) {
            sendResponse(false, '缺少必要参数: sourcePath/sourcePaths, targetPath', null, 400);
        }
        compressZip($finalSourcePath, $targetPath, $options);
        break;
        
    case 'extract_zip':
        $sourcePath = $_GET['sourcePath'] ?? '';
        $targetPath = $_GET['targetPath'] ?? '';
        $options = [];
        
        // 解析选项
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $rawInput = file_get_contents('php://input');
            $postData = json_decode($rawInput, true);
            if ($postData && isset($postData['options'])) {
                $options = $postData['options'];
            }
        } else {
            if (isset($_GET['files'])) {
                $options['files'] = is_array($_GET['files']) ? $_GET['files'] : explode(',', $_GET['files']);
            }
            if (isset($_GET['overwrite'])) {
                $options['overwrite'] = filter_var($_GET['overwrite'], FILTER_VALIDATE_BOOLEAN);
            }
        }
        
        if (empty($sourcePath) || empty($targetPath)) {
            sendResponse(false, '缺少必要参数: sourcePath, targetPath', null, 400);
        }
        extractZip($sourcePath, $targetPath, $options);
        break;
        
    case 'list_zip':
        $sourcePath = $_GET['sourcePath'] ?? '';
        if (empty($sourcePath)) {
            sendResponse(false, '缺少必要参数: sourcePath', null, 400);
        }
        listZip($sourcePath);
        break;
        
    // RAR 操作
    case 'compress_rar':
        $sourcePath = $_GET['sourcePath'] ?? '';
        $targetPath = $_GET['targetPath'] ?? '';
        $options = [];
        
        // 解析选项
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $rawInput = file_get_contents('php://input');
            $postData = json_decode($rawInput, true);
            if ($postData && isset($postData['options'])) {
                $options = $postData['options'];
            }
        }
        
        if (empty($sourcePath) || empty($targetPath)) {
            sendResponse(false, '缺少必要参数: sourcePath, targetPath', null, 400);
        }
        compressRar($sourcePath, $targetPath, $options);
        break;
        
    case 'extract_rar':
        $sourcePath = $_GET['sourcePath'] ?? '';
        $targetPath = $_GET['targetPath'] ?? '';
        $options = [];
        
        // 解析选项
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $rawInput = file_get_contents('php://input');
            $postData = json_decode($rawInput, true);
            if ($postData && isset($postData['options'])) {
                $options = $postData['options'];
            }
        } else {
            if (isset($_GET['files'])) {
                $options['files'] = is_array($_GET['files']) ? $_GET['files'] : explode(',', $_GET['files']);
            }
            if (isset($_GET['overwrite'])) {
                $options['overwrite'] = filter_var($_GET['overwrite'], FILTER_VALIDATE_BOOLEAN);
            }
        }
        
        if (empty($sourcePath) || empty($targetPath)) {
            sendResponse(false, '缺少必要参数: sourcePath, targetPath', null, 400);
        }
        extractRar($sourcePath, $targetPath, $options);
        break;
        
    case 'list_rar':
        $sourcePath = $_GET['sourcePath'] ?? '';
        if (empty($sourcePath)) {
            sendResponse(false, '缺少必要参数: sourcePath', null, 400);
        }
        listRar($sourcePath);
        break;
        
    // 检查支持
    case 'check_support':
        checkSupport();
        break;
        
    default:
        sendResponse(false, '未知的操作: ' . $action, null, 400);
        break;
}
} catch (Exception $e) {
    // 捕获所有未处理的异常
    sendResponse(false, '服务器错误: ' . $e->getMessage(), null, 500);
} catch (Error $e) {
    // 捕获 PHP 7+ 的致命错误
    sendResponse(false, '服务器错误: ' . $e->getMessage(), null, 500);
}

