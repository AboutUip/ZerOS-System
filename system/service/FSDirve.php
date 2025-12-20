<?php
/**
 * ZerOS 文件系统驱动服务
 * 与 kernel/filesystem/ 协同工作，处理所有文件目录操作
 * 所有文件实际存储在 service/DISK/C/ 和 service/DISK/D/ 下
 * 
 * 访问地址: http://localhost:8089/system/service/FSDirve.php?action=xxx&...
 */

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

// 确保磁盘目录存在
if (!is_dir(DISK_C_PATH)) {
    mkdir(DISK_C_PATH, 0755, true);
}
if (!is_dir(DISK_D_PATH)) {
    mkdir(DISK_D_PATH, 0755, true);
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
 * 获取目录路径（用于目录操作）
 */
function getDirPath($virtualPath) {
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
    
    // 规范化路径
    $realPath = str_replace(['\\', '//'], '/', $realPath);
    $realPath = rtrim($realPath, '/');
    
    return $realPath;
}

/**
 * 创建目录
 */
function createDirectory($path, $name) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    $newDirPath = $dirPath . '/' . $name;
    
    // 验证目录名
    if (empty($name) || strpos($name, '/') !== false || strpos($name, '\\') !== false) {
        sendResponse(false, '无效的目录名', null, 400);
    }
    
    // 检查父目录是否存在
    if (!is_dir($dirPath)) {
        sendResponse(false, '父目录不存在: ' . $path, null, 404);
    }
    
    // 检查目录是否已存在
    if (is_dir($newDirPath)) {
        // 目录已存在，返回成功（而不是 409 错误）
        sendResponse(true, '目录已存在', [
            'path' => $path . '/' . $name,
            'name' => $name,
            'existed' => true
        ]);
        return;
    }
    
    // 创建目录
    if (mkdir($newDirPath, 0755, true)) {
        sendResponse(true, '目录创建成功', [
            'path' => $path . '/' . $name,
            'name' => $name,
            'existed' => false
        ]);
    } else {
        sendResponse(false, '目录创建失败', null, 500);
    }
}

/**
 * 删除目录
 */
function deleteDirectory($path) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查目录是否存在
    if (!is_dir($dirPath)) {
        sendResponse(false, '目录不存在: ' . $path, null, 404);
    }
    
    // 检查目录是否为空
    $files = array_diff(scandir($dirPath), ['.', '..']);
    if (!empty($files)) {
        sendResponse(false, '目录不为空，无法删除', null, 400);
    }
    
    // 删除目录
    if (rmdir($dirPath)) {
        sendResponse(true, '目录删除成功', ['path' => $path]);
    } else {
        sendResponse(false, '目录删除失败', null, 500);
    }
}

/**
 * 列出目录内容
 */
function listDirectory($path) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查目录是否存在
    if (!is_dir($dirPath)) {
        sendResponse(false, '目录不存在: ' . $path, null, 404);
    }
    
    $items = [];
    $files = scandir($dirPath);
    
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') {
            continue;
        }
        
        $itemPath = $dirPath . '/' . $file;
        $isDir = is_dir($itemPath);
        
        $item = [
            'name' => $file,
            'type' => $isDir ? 'directory' : 'file',
            'path' => $path . '/' . $file
        ];
        
        if ($isDir) {
            $item['size'] = 0;
        } else {
            $item['size'] = filesize($itemPath);
            $item['extension'] = pathinfo($file, PATHINFO_EXTENSION);
        }
        
        $item['modified'] = date('Y-m-d H:i:s', filemtime($itemPath));
        $item['created'] = date('Y-m-d H:i:s', filectime($itemPath));
        
        $items[] = $item;
    }
    
    // 排序：目录在前，文件在后，按名称排序
    usort($items, function($a, $b) {
        if ($a['type'] !== $b['type']) {
            return $a['type'] === 'directory' ? -1 : 1;
        }
        return strcasecmp($a['name'], $b['name']);
    });
    
    sendResponse(true, '目录列表获取成功', [
        'path' => $path,
        'items' => $items,
        'count' => count($items)
    ]);
}

/**
 * 创建文件
 */
function createFile($path, $fileName, $content = '') {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 验证文件名
    if (empty($fileName) || strpos($fileName, '/') !== false || strpos($fileName, '\\') !== false) {
        sendResponse(false, '无效的文件名', null, 400);
    }
    
    // 检查父目录是否存在
    if (!is_dir($dirPath)) {
        sendResponse(false, '父目录不存在: ' . $path, null, 404);
    }
    
    $filePath = $dirPath . '/' . $fileName;
    
    // 检查文件是否已存在
    if (file_exists($filePath)) {
        sendResponse(false, '文件已存在: ' . $fileName, null, 409);
    }
    
    // 创建文件
    if (file_put_contents($filePath, $content) !== false) {
        sendResponse(true, '文件创建成功', [
            'path' => $path . '/' . $fileName,
            'fileName' => $fileName,
            'size' => strlen($content)
        ]);
    } else {
        sendResponse(false, '文件创建失败', null, 500);
    }
}

/**
 * 读取文件
 */
function readFileContent($path, $fileName, $asBase64 = false) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    $filePath = $dirPath . '/' . $fileName;
    
    // 检查文件是否存在
    if (!file_exists($filePath)) {
        sendResponse(false, '文件不存在: ' . $fileName, null, 404);
    }
    
    // 检查是否为文件
    if (!is_file($filePath)) {
        sendResponse(false, '路径不是文件: ' . $fileName, null, 400);
    }
    
    // 读取文件内容
    $content = file_get_contents($filePath);
    if ($content === false) {
        sendResponse(false, '文件读取失败', null, 500);
    }
    
    // 检测文件类型，如果是二进制文件（图片等），自动使用base64编码
    $fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'];
    $isImage = in_array($fileExt, $imageExtensions);
    
    // 如果请求base64编码，或者是图片文件，则使用base64编码
    $shouldEncodeBase64 = $asBase64 || $isImage;
    
    if ($shouldEncodeBase64) {
        $content = base64_encode($content);
    }
    
    $fileInfo = [
        'path' => $path . '/' . $fileName,
        'fileName' => $fileName,
        'size' => filesize($filePath),
        'content' => $content,
        'isBase64' => $shouldEncodeBase64,
        'modified' => date('Y-m-d H:i:s', filemtime($filePath)),
        'created' => date('Y-m-d H:i:s', filectime($filePath))
    ];
    
    sendResponse(true, '文件读取成功', $fileInfo);
}

/**
 * 写入文件
 */
function writeFile($path, $fileName, $content, $writeMod = 'overwrite', $isBase64 = false) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 验证文件名
    if (empty($fileName) || strpos($fileName, '/') !== false || strpos($fileName, '\\') !== false) {
        sendResponse(false, '无效的文件名', null, 400);
    }
    
    // 检查父目录是否存在
    if (!is_dir($dirPath)) {
        sendResponse(false, '父目录不存在: ' . $path, null, 404);
    }
    
    $filePath = $dirPath . '/' . $fileName;
    $fileExists = file_exists($filePath);
    
    // 如果内容是 base64 编码，则解码
    if ($isBase64) {
        $decoded = base64_decode($content, true);
        if ($decoded === false) {
            sendResponse(false, 'Base64 解码失败', null, 400);
        }
        $content = $decoded;
    }
    
    // 处理写入模式
    if ($writeMod === 'append' && $fileExists) {
        // 追加模式
        $existingContent = file_get_contents($filePath);
        $content = $existingContent . $content;
    } elseif ($writeMod === 'prepend' && $fileExists) {
        // 前置模式
        $existingContent = file_get_contents($filePath);
        $content = $content . $existingContent;
    }
    // overwrite 模式直接覆盖
    
    // 写入文件（使用二进制模式）
    if (file_put_contents($filePath, $content, LOCK_EX) !== false) {
        sendResponse(true, '文件写入成功', [
            'path' => $path . '/' . $fileName,
            'fileName' => $fileName,
            'size' => strlen($content),
            'writeMod' => $writeMod,
            'created' => $fileExists ? false : true
        ]);
    } else {
        sendResponse(false, '文件写入失败', null, 500);
    }
}

/**
 * 删除文件
 */
function deleteFile($path, $fileName) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    $filePath = $dirPath . '/' . $fileName;
    
    // 检查文件是否存在
    if (!file_exists($filePath)) {
        sendResponse(false, '文件不存在: ' . $fileName, null, 404);
    }
    
    // 检查是否为文件
    if (!is_file($filePath)) {
        sendResponse(false, '路径不是文件: ' . $fileName, null, 400);
    }
    
    // 删除文件
    if (unlink($filePath)) {
        sendResponse(true, '文件删除成功', [
            'path' => $path . '/' . $fileName,
            'fileName' => $fileName
        ]);
    } else {
        sendResponse(false, '文件删除失败', null, 500);
    }
}

/**
 * 重命名文件
 */
function renameFile($path, $oldFileName, $newFileName) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 验证文件名
    if (empty($oldFileName) || empty($newFileName)) {
        sendResponse(false, '文件名不能为空', null, 400);
    }
    
    if (strpos($oldFileName, '/') !== false || strpos($newFileName, '/') !== false ||
        strpos($oldFileName, '\\') !== false || strpos($newFileName, '\\') !== false) {
        sendResponse(false, '无效的文件名', null, 400);
    }
    
    $oldFilePath = $dirPath . '/' . $oldFileName;
    $newFilePath = $dirPath . '/' . $newFileName;
    
    // 检查源文件是否存在
    if (!file_exists($oldFilePath)) {
        sendResponse(false, '源文件不存在: ' . $oldFileName, null, 404);
    }
    
    // 检查目标文件是否已存在
    if (file_exists($newFilePath)) {
        sendResponse(false, '目标文件已存在: ' . $newFileName, null, 409);
    }
    
    // 重命名文件
    if (rename($oldFilePath, $newFilePath)) {
        sendResponse(true, '文件重命名成功', [
            'path' => $path,
            'oldFileName' => $oldFileName,
            'newFileName' => $newFileName
        ]);
    } else {
        sendResponse(false, '文件重命名失败', null, 500);
    }
}

/**
 * 移动文件
 */
function moveFile($sourcePath, $sourceFileName, $targetPath, $targetFileName = null) {
    $sourceDirPath = getDirPath($sourcePath);
    $targetDirPath = getDirPath($targetPath);
    
    if (!$sourceDirPath || !$targetDirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 如果没有指定目标文件名，使用源文件名
    if ($targetFileName === null) {
        $targetFileName = $sourceFileName;
    }
    
    // 验证文件名
    if (empty($sourceFileName) || empty($targetFileName)) {
        sendResponse(false, '文件名不能为空', null, 400);
    }
    
    $sourceFilePath = $sourceDirPath . '/' . $sourceFileName;
    $targetFilePath = $targetDirPath . '/' . $targetFileName;
    
    // 检查源文件是否存在
    if (!file_exists($sourceFilePath)) {
        sendResponse(false, '源文件不存在: ' . $sourceFileName, null, 404);
    }
    
    // 检查目标目录是否存在
    if (!is_dir($targetDirPath)) {
        sendResponse(false, '目标目录不存在: ' . $targetPath, null, 404);
    }
    
    // 检查目标文件是否已存在
    if (file_exists($targetFilePath)) {
        sendResponse(false, '目标文件已存在: ' . $targetFileName, null, 409);
    }
    
    // 移动文件
    if (rename($sourceFilePath, $targetFilePath)) {
        sendResponse(true, '文件移动成功', [
            'sourcePath' => $sourcePath . '/' . $sourceFileName,
            'targetPath' => $targetPath . '/' . $targetFileName,
            'sourceFileName' => $sourceFileName,
            'targetFileName' => $targetFileName
        ]);
    } else {
        sendResponse(false, '文件移动失败', null, 500);
    }
}

/**
 * 复制文件
 */
function copyFile($sourcePath, $sourceFileName, $targetPath, $targetFileName = null) {
    $sourceDirPath = getDirPath($sourcePath);
    $targetDirPath = getDirPath($targetPath);
    
    if (!$sourceDirPath || !$targetDirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 如果没有指定目标文件名，使用源文件名
    if ($targetFileName === null) {
        $targetFileName = $sourceFileName;
    }
    
    // 验证文件名
    if (empty($sourceFileName) || empty($targetFileName)) {
        sendResponse(false, '文件名不能为空', null, 400);
    }
    
    $sourceFilePath = $sourceDirPath . '/' . $sourceFileName;
    $targetFilePath = $targetDirPath . '/' . $targetFileName;
    
    // 检查源文件是否存在
    if (!file_exists($sourceFilePath)) {
        sendResponse(false, '源文件不存在: ' . $sourceFileName, null, 404);
    }
    
    // 检查目标目录是否存在
    if (!is_dir($targetDirPath)) {
        sendResponse(false, '目标目录不存在: ' . $targetPath, null, 404);
    }
    
    // 检查目标文件是否已存在
    if (file_exists($targetFilePath)) {
        sendResponse(false, '目标文件已存在: ' . $targetFileName, null, 409);
    }
    
    // 复制文件
    if (copy($sourceFilePath, $targetFilePath)) {
        sendResponse(true, '文件复制成功', [
            'sourcePath' => $sourcePath . '/' . $sourceFileName,
            'targetPath' => $targetPath . '/' . $targetFileName,
            'sourceFileName' => $sourceFileName,
            'targetFileName' => $targetFileName
        ]);
    } else {
        sendResponse(false, '文件复制失败', null, 500);
    }
}

/**
 * 获取文件信息
 */
function getFileInfo($path, $fileName) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    $filePath = $dirPath . '/' . $fileName;
    
    // 检查文件是否存在
    if (!file_exists($filePath)) {
        sendResponse(false, '文件不存在: ' . $fileName, null, 404);
    }
    
    $isDir = is_dir($filePath);
    $info = [
        'path' => $path . '/' . $fileName,
        'name' => $fileName,
        'type' => $isDir ? 'directory' : 'file',
        'size' => $isDir ? 0 : filesize($filePath),
        'modified' => date('Y-m-d H:i:s', filemtime($filePath)),
        'created' => date('Y-m-d H:i:s', filectime($filePath))
    ];
    
    if (!$isDir) {
        $info['extension'] = pathinfo($fileName, PATHINFO_EXTENSION);
    }
    
    sendResponse(true, '文件信息获取成功', $info);
}

/**
 * 重命名目录
 */
function renameDirectory($path, $oldName, $newName) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 验证目录名
    if (empty($oldName) || empty($newName)) {
        sendResponse(false, '目录名不能为空', null, 400);
    }
    
    if (strpos($oldName, '/') !== false || strpos($newName, '/') !== false ||
        strpos($oldName, '\\') !== false || strpos($newName, '\\') !== false) {
        sendResponse(false, '无效的目录名', null, 400);
    }
    
    $oldDirPath = $dirPath . '/' . $oldName;
    $newDirPath = $dirPath . '/' . $newName;
    
    // 检查源目录是否存在
    if (!is_dir($oldDirPath)) {
        sendResponse(false, '源目录不存在: ' . $oldName, null, 404);
    }
    
    // 检查目标目录是否已存在
    if (is_dir($newDirPath)) {
        sendResponse(false, '目标目录已存在: ' . $newName, null, 409);
    }
    
    // 重命名目录
    if (rename($oldDirPath, $newDirPath)) {
        sendResponse(true, '目录重命名成功', [
            'path' => $path,
            'oldName' => $oldName,
            'newName' => $newName
        ]);
    } else {
        sendResponse(false, '目录重命名失败', null, 500);
    }
}

/**
 * 移动目录
 */
function moveDirectory($sourcePath, $targetPath) {
    $sourceDirPath = getDirPath($sourcePath);
    $targetParentPath = getDirPath(dirname($targetPath));
    $targetName = basename($targetPath);
    
    if (!$sourceDirPath || !$targetParentPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查源目录是否存在
    if (!is_dir($sourceDirPath)) {
        sendResponse(false, '源目录不存在: ' . $sourcePath, null, 404);
    }
    
    // 检查目标父目录是否存在
    if (!is_dir($targetParentPath)) {
        sendResponse(false, '目标父目录不存在: ' . dirname($targetPath), null, 404);
    }
    
    $targetDirPath = $targetParentPath . '/' . $targetName;
    
    // 检查目标目录是否已存在
    if (is_dir($targetDirPath)) {
        sendResponse(false, '目标目录已存在: ' . $targetPath, null, 409);
    }
    
    // 移动目录
    if (rename($sourceDirPath, $targetDirPath)) {
        sendResponse(true, '目录移动成功', [
            'sourcePath' => $sourcePath,
            'targetPath' => $targetPath
        ]);
    } else {
        sendResponse(false, '目录移动失败', null, 500);
    }
}

/**
 * 复制目录（递归）
 */
function copyDirectory($sourcePath, $targetPath) {
    $sourceDirPath = getDirPath($sourcePath);
    $targetParentPath = getDirPath(dirname($targetPath));
    $targetName = basename($targetPath);
    
    if (!$sourceDirPath || !$targetParentPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查源目录是否存在
    if (!is_dir($sourceDirPath)) {
        sendResponse(false, '源目录不存在: ' . $sourcePath, null, 404);
    }
    
    // 检查目标父目录是否存在
    if (!is_dir($targetParentPath)) {
        sendResponse(false, '目标父目录不存在: ' . dirname($targetPath), null, 404);
    }
    
    $targetDirPath = $targetParentPath . '/' . $targetName;
    
    // 检查目标目录是否已存在
    if (is_dir($targetDirPath)) {
        sendResponse(false, '目标目录已存在: ' . $targetPath, null, 409);
    }
    
    // 递归复制目录
    if (copyDirectoryRecursive($sourceDirPath, $targetDirPath)) {
        sendResponse(true, '目录复制成功', [
            'sourcePath' => $sourcePath,
            'targetPath' => $targetPath
        ]);
    } else {
        sendResponse(false, '目录复制失败', null, 500);
    }
}

/**
 * 递归复制目录内部实现
 */
function copyDirectoryRecursive($source, $target) {
    if (!is_dir($source)) {
        return false;
    }
    
    if (!is_dir($target)) {
        if (!mkdir($target, 0755, true)) {
            return false;
        }
    }
    
    $files = array_diff(scandir($source), ['.', '..']);
    
    foreach ($files as $file) {
        $sourceFile = $source . '/' . $file;
        $targetFile = $target . '/' . $file;
        
        if (is_dir($sourceFile)) {
            if (!copyDirectoryRecursive($sourceFile, $targetFile)) {
                return false;
            }
        } else {
            if (!copy($sourceFile, $targetFile)) {
                return false;
            }
        }
    }
    
    return true;
}

/**
 * 递归删除目录
 */
function deleteDirectoryRecursive($path) {
    $dirPath = getDirPath($path);
    if (!$dirPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    // 检查目录是否存在
    if (!is_dir($dirPath)) {
        sendResponse(false, '目录不存在: ' . $path, null, 404);
    }
    
    // 递归删除目录
    if (deleteDirectoryRecursiveInternal($dirPath)) {
        sendResponse(true, '目录删除成功', ['path' => $path]);
    } else {
        sendResponse(false, '目录删除失败', null, 500);
    }
}

/**
 * 递归删除目录内部实现
 */
function deleteDirectoryRecursiveInternal($dir) {
    if (!is_dir($dir)) {
        return false;
    }
    
    $files = array_diff(scandir($dir), ['.', '..']);
    
    foreach ($files as $file) {
        $filePath = $dir . '/' . $file;
        
        if (is_dir($filePath)) {
            if (!deleteDirectoryRecursiveInternal($filePath)) {
                return false;
            }
        } else {
            if (!unlink($filePath)) {
                return false;
            }
        }
    }
    
    return rmdir($dir);
}

/**
 * 检查路径是否存在
 */
function checkPathExists($path) {
    $realPath = getRealPath($path);
    if (!$realPath) {
        sendResponse(false, '无效的路径格式', null, 400);
    }
    
    $exists = file_exists($realPath);
    $isDir = $exists && is_dir($realPath);
    $isFile = $exists && is_file($realPath);
    
    $info = [
        'path' => $path,
        'exists' => $exists,
        'type' => $isDir ? 'directory' : ($isFile ? 'file' : null)
    ];
    
    if ($exists) {
        $info['size'] = $isFile ? filesize($realPath) : 0;
        $info['modified'] = date('Y-m-d H:i:s', filemtime($realPath));
        $info['created'] = date('Y-m-d H:i:s', filectime($realPath));
        
        if ($isFile) {
            $info['extension'] = pathinfo($realPath, PATHINFO_EXTENSION);
        }
    }
    
    sendResponse(true, $exists ? '路径存在' : '路径不存在', $info);
}

/**
 * 获取磁盘信息
 */
function getDiskInfo($disk) {
    $basePath = $disk === 'C' ? DISK_C_PATH : DISK_D_PATH;
    
    if (!is_dir($basePath)) {
        sendResponse(false, '磁盘目录不存在: ' . $disk, null, 404);
    }
    
    // 计算磁盘使用情况
    $totalSize = disk_total_space($basePath);
    $freeSpace = disk_free_space($basePath);
    $usedSpace = $totalSize - $freeSpace;
    
    // 计算目录大小（递归）
    $dirSize = calculateDirectorySize($basePath);
    
    $info = [
        'disk' => $disk,
        'totalSize' => $totalSize,
        'freeSpace' => $freeSpace,
        'usedSpace' => $usedSpace,
        'dirSize' => $dirSize,
        'usagePercent' => $totalSize > 0 ? round(($usedSpace / $totalSize) * 100, 2) : 0
    ];
    
    sendResponse(true, '磁盘信息获取成功', $info);
}

/**
 * 递归计算目录大小
 */
function calculateDirectorySize($dir) {
    $size = 0;
    
    if (!is_dir($dir)) {
        return 0;
    }
    
    $files = array_diff(scandir($dir), ['.', '..']);
    
    foreach ($files as $file) {
        $filePath = $dir . '/' . $file;
        
        if (is_dir($filePath)) {
            $size += calculateDirectorySize($filePath);
        } else {
            $size += filesize($filePath);
        }
    }
    
    return $size;
}

// 主处理逻辑
$action = $_GET['action'] ?? '';

switch ($action) {
    // 目录操作
    case 'create_dir':
        $path = $_GET['path'] ?? '';
        $name = $_GET['name'] ?? '';
        if (empty($path) || empty($name)) {
            sendResponse(false, '缺少必要参数: path, name', null, 400);
        }
        createDirectory($path, $name);
        break;
        
    case 'delete_dir':
        $path = $_GET['path'] ?? '';
        if (empty($path)) {
            sendResponse(false, '缺少必要参数: path', null, 400);
        }
        deleteDirectory($path);
        break;
        
    case 'list_dir':
        $path = $_GET['path'] ?? '';
        if (empty($path)) {
            sendResponse(false, '缺少必要参数: path', null, 400);
        }
        listDirectory($path);
        break;
        
    // 文件操作
    case 'create_file':
        $path = $_GET['path'] ?? '';
        $fileName = $_GET['fileName'] ?? '';
        $content = $_GET['content'] ?? '';
        // 支持 POST 请求传递内容
        if (empty($content) && $_SERVER['REQUEST_METHOD'] === 'POST') {
            $rawInput = file_get_contents('php://input');
            $postData = json_decode($rawInput, true);
            if ($postData && isset($postData['content'])) {
                $content = $postData['content'];
            }
        }
        if (empty($path) || empty($fileName)) {
            sendResponse(false, '缺少必要参数: path, fileName', null, 400);
        }
        createFile($path, $fileName, $content);
        break;
        
    case 'read_file':
        $path = $_GET['path'] ?? '';
        $fileName = $_GET['fileName'] ?? '';
        $asBase64 = isset($_GET['asBase64']) && ($_GET['asBase64'] === 'true' || $_GET['asBase64'] === '1');
        if (empty($path) || empty($fileName)) {
            sendResponse(false, '缺少必要参数: path, fileName', null, 400);
        }
        readFileContent($path, $fileName, $asBase64);
        break;
        
    case 'write_file':
        $path = $_GET['path'] ?? '';
        $fileName = $_GET['fileName'] ?? '';
        $writeMod = $_GET['writeMod'] ?? 'overwrite';
        $isBase64 = isset($_GET['isBase64']) && ($_GET['isBase64'] === 'true' || $_GET['isBase64'] === '1');
        $content = $_GET['content'] ?? '';
        // 支持 POST 请求传递内容
        if (empty($content) && $_SERVER['REQUEST_METHOD'] === 'POST') {
            $rawInput = file_get_contents('php://input');
            $postData = json_decode($rawInput, true);
            if ($postData && isset($postData['content'])) {
                $content = $postData['content'];
                // 如果 POST 数据中有 isBase64 参数，使用它
                if (isset($postData['isBase64'])) {
                    $isBase64 = $postData['isBase64'] === true || $postData['isBase64'] === 'true' || $postData['isBase64'] === '1';
                }
            }
        }
        if (empty($path) || empty($fileName)) {
            sendResponse(false, '缺少必要参数: path, fileName', null, 400);
        }
        writeFile($path, $fileName, $content, $writeMod, $isBase64);
        break;
        
    case 'delete_file':
        $path = $_GET['path'] ?? '';
        $fileName = $_GET['fileName'] ?? '';
        if (empty($path) || empty($fileName)) {
            sendResponse(false, '缺少必要参数: path, fileName', null, 400);
        }
        deleteFile($path, $fileName);
        break;
        
    case 'rename_file':
        $path = $_GET['path'] ?? '';
        $oldFileName = $_GET['oldFileName'] ?? '';
        $newFileName = $_GET['newFileName'] ?? '';
        if (empty($path) || empty($oldFileName) || empty($newFileName)) {
            sendResponse(false, '缺少必要参数: path, oldFileName, newFileName', null, 400);
        }
        renameFile($path, $oldFileName, $newFileName);
        break;
        
    case 'move_file':
        $sourcePath = $_GET['sourcePath'] ?? '';
        $sourceFileName = $_GET['sourceFileName'] ?? '';
        $targetPath = $_GET['targetPath'] ?? '';
        $targetFileName = $_GET['targetFileName'] ?? null;
        if (empty($sourcePath) || empty($sourceFileName) || empty($targetPath)) {
            sendResponse(false, '缺少必要参数: sourcePath, sourceFileName, targetPath', null, 400);
        }
        moveFile($sourcePath, $sourceFileName, $targetPath, $targetFileName);
        break;
        
    case 'copy_file':
        $sourcePath = $_GET['sourcePath'] ?? '';
        $sourceFileName = $_GET['sourceFileName'] ?? '';
        $targetPath = $_GET['targetPath'] ?? '';
        $targetFileName = $_GET['targetFileName'] ?? null;
        if (empty($sourcePath) || empty($sourceFileName) || empty($targetPath)) {
            sendResponse(false, '缺少必要参数: sourcePath, sourceFileName, targetPath', null, 400);
        }
        copyFile($sourcePath, $sourceFileName, $targetPath, $targetFileName);
        break;
        
    case 'get_file_info':
        $path = $_GET['path'] ?? '';
        $fileName = $_GET['fileName'] ?? '';
        if (empty($path) || empty($fileName)) {
            sendResponse(false, '缺少必要参数: path, fileName', null, 400);
        }
        getFileInfo($path, $fileName);
        break;
        
    case 'rename_dir':
        $path = $_GET['path'] ?? '';
        $oldName = $_GET['oldName'] ?? '';
        $newName = $_GET['newName'] ?? '';
        if (empty($path) || empty($oldName) || empty($newName)) {
            sendResponse(false, '缺少必要参数: path, oldName, newName', null, 400);
        }
        renameDirectory($path, $oldName, $newName);
        break;
        
    case 'move_dir':
        $sourcePath = $_GET['sourcePath'] ?? '';
        $targetPath = $_GET['targetPath'] ?? '';
        if (empty($sourcePath) || empty($targetPath)) {
            sendResponse(false, '缺少必要参数: sourcePath, targetPath', null, 400);
        }
        moveDirectory($sourcePath, $targetPath);
        break;
        
    case 'copy_dir':
        $sourcePath = $_GET['sourcePath'] ?? '';
        $targetPath = $_GET['targetPath'] ?? '';
        if (empty($sourcePath) || empty($targetPath)) {
            sendResponse(false, '缺少必要参数: sourcePath, targetPath', null, 400);
        }
        copyDirectory($sourcePath, $targetPath);
        break;
        
    case 'delete_dir_recursive':
        $path = $_GET['path'] ?? '';
        if (empty($path)) {
            sendResponse(false, '缺少必要参数: path', null, 400);
        }
        deleteDirectoryRecursive($path);
        break;
        
    case 'exists':
        $path = $_GET['path'] ?? '';
        if (empty($path)) {
            sendResponse(false, '缺少必要参数: path', null, 400);
        }
        checkPathExists($path);
        break;
        
    case 'get_disk_info':
        $disk = $_GET['disk'] ?? '';
        if (empty($disk) || !in_array($disk, ['C', 'D'])) {
            sendResponse(false, '缺少必要参数: disk (必须是 C 或 D)', null, 400);
        }
        getDiskInfo($disk);
        break;
        
    default:
        sendResponse(false, '未知的操作: ' . $action, null, 400);
        break;
}