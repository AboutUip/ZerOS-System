<?php
/**
 * ZerOS 磁盘分区管理服务
 * 提供分区的创建、检查、删除、合并等管理功能
 * 
 * 访问地址: http://localhost:8089/system/service/DISKMANAGER.php?action=xxx&...
 */

// 设置响应头
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token, X-JWT');

// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/jwtVerify.php';
requireJWTVerify('DISKMANAGER');

// 基础路径配置
define('DISK_BASE_PATH', __DIR__ . '/DISK');
// 注意：DISK_DATA_FILE 常量已废弃，请使用 getDiskDataFilePath() 函数
// 该函数会优先使用系统盘 D:，如果 D: 不存在则使用第一个可用分区
define('DISK_DATA_FILE', DISK_BASE_PATH . '/D/DiskData.json'); // 向后兼容，已废弃

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
 * 验证分区名称格式
 * @param string $partitionName 分区名称（如 "C:", "D:"）
 * @return array|false 返回 ['letter' => 'C'] 或 false
 */
function validatePartitionName($partitionName) {
    // 检查格式：必须是单个大写字母 + 冒号
    if (!preg_match('/^([A-Z]):$/', $partitionName, $matches)) {
        return false;
    }
    return ['letter' => $matches[1]];
}

/**
 * 获取分区物理路径
 * @param string $diskLetter 分区字母 (A-Z)
 * @return string|null 分区路径
 */
function getPartitionPath($diskLetter) {
    if (!preg_match('/^[A-Z]$/', $diskLetter)) {
        return null;
    }
    return DISK_BASE_PATH . '/' . $diskLetter;
}

/**
 * 检查分区是否存在
 * @param string $partitionName 分区名称（如 "C:"）
 * @return array 分区信息
 */
function checkPartition($partitionName) {
    $validated = validatePartitionName($partitionName);
    if (!$validated) {
        sendResponse(false, '无效的分区名称格式: ' . $partitionName . ' (格式应为单个大写字母+冒号，如 C:)', null, 400);
    }
    
    $diskLetter = $validated['letter'];
    $partitionPath = getPartitionPath($diskLetter);
    
    $exists = is_dir($partitionPath);
    $info = [
        'partition' => $partitionName,
        'letter' => $diskLetter,
        'exists' => $exists,
        'path' => $partitionPath
    ];
    
    if ($exists) {
        // 获取分区详细信息
        $info['size'] = calculateDirectorySize($partitionPath);
        $info['fileCount'] = countFilesRecursive($partitionPath);
        $info['dirCount'] = countDirectoriesRecursive($partitionPath);
        $info['created'] = file_exists($partitionPath) ? date('Y-m-d H:i:s', filectime($partitionPath)) : null;
        $info['modified'] = file_exists($partitionPath) ? date('Y-m-d H:i:s', filemtime($partitionPath)) : null;
        
        // 获取磁盘空间信息
        $totalSize = disk_total_space($partitionPath);
        $freeSpace = disk_free_space($partitionPath);
        if ($totalSize !== false && $freeSpace !== false) {
            $info['diskTotalSize'] = $totalSize;
            $info['diskFreeSpace'] = $freeSpace;
            $info['diskUsedSpace'] = $totalSize - $freeSpace;
            $info['diskUsagePercent'] = $totalSize > 0 ? round((($totalSize - $freeSpace) / $totalSize) * 100, 2) : 0;
        }
    }
    
    sendResponse(true, $exists ? '分区存在' : '分区不存在', $info);
}

/**
 * 读取 DiskData 配置（仅返回数组，不发送响应）
 * @return array ['totalSize' => int, 'partitions' => array]
 */
function getDiskDataForCheck() {
    $default = ['totalSize' => 3221225472, 'partitionCount' => 0, 'partitions' => []];
    $diskDataFile = getDiskDataFilePath();
    if (!file_exists($diskDataFile)) {
        return $default;
    }
    $content = file_get_contents($diskDataFile);
    if ($content === false) {
        return $default;
    }
    $data = json_decode($content, true);
    return $data ? $data : $default;
}

/**
 * 创建分区
 * @param string $partitionName 分区名称（如 "C:"）
 */
function createPartition($partitionName) {
    $validated = validatePartitionName($partitionName);
    if (!$validated) {
        sendResponse(false, '无效的分区名称格式: ' . $partitionName . ' (格式应为单个大写字母+冒号，如 C:)', null, 400);
    }
    
    $diskLetter = $validated['letter'];
    $partitionPath = getPartitionPath($diskLetter);
    
    // 检查分区是否已存在
    if (is_dir($partitionPath)) {
        sendResponse(false, '分区已存在: ' . $partitionName, [
            'partition' => $partitionName,
            'path' => $partitionPath
        ], 409);
    }
    
    // 校验：分区总容量不能超过磁盘总大小（如 3GB）
    $diskData = getDiskDataForCheck();
    $totalSize = isset($diskData['totalSize']) ? (int)$diskData['totalSize'] : 3221225472;
    $partitions = isset($diskData['partitions']) && is_array($diskData['partitions']) ? $diskData['partitions'] : [];
    $currentSum = 0;
    foreach ($partitions as $p => $size) {
        $currentSum += (int)$size;
    }
    $newPartitionSize = ($diskLetter === 'D') ? 2147483648 : 1073741824; // D: 2GB，其它 1GB
    if ($currentSum + $newPartitionSize > $totalSize) {
        $totalGB = round($totalSize / 1024 / 1024 / 1024, 1);
        $usedGB = round($currentSum / 1024 / 1024 / 1024, 1);
        sendResponse(false, '分区总容量不能超过磁盘总大小（总大小 ' . $totalGB . ' GB，已分配 ' . $usedGB . ' GB，新分区需要 ' . round($newPartitionSize / 1024 / 1024 / 1024, 1) . ' GB）', null, 400);
    }
    
    // 确保DISK基础目录存在
    if (!is_dir(DISK_BASE_PATH)) {
        if (!mkdir(DISK_BASE_PATH, 0755, true)) {
            sendResponse(false, '无法创建DISK基础目录: ' . DISK_BASE_PATH, null, 500);
        }
    }
    
    // 特殊处理：D: 是系统盘，需要从 SYSTEMRESOURCE.zip 解压
    if ($diskLetter === 'D') {
        return createSystemPartitionD($partitionPath);
    }
    
    // 创建普通分区目录
    if (mkdir($partitionPath, 0755, true)) {
        // 同步更新 DiskData.json（异步，不阻塞响应）
        syncDiskDataToFile($diskLetter, 1073741824); // 默认 1GB，后续可以通过参数指定
        
        sendResponse(true, '分区创建成功: ' . $partitionName, [
            'partition' => $partitionName,
            'letter' => $diskLetter,
            'path' => $partitionPath,
            'created' => date('Y-m-d H:i:s')
        ]);
    } else {
        sendResponse(false, '分区创建失败: ' . $partitionName, null, 500);
    }
}

/**
 * 获取 DiskData.json 文件路径（存储在系统盘 D:，如果 D: 不存在则使用第一个可用分区）
 * @return string DiskData.json 文件路径
 */
function getDiskDataFilePath() {
    // D: 是系统盘，优先使用 D:
    $dPath = DISK_BASE_PATH . '/D/DiskData.json';
    if (is_dir(DISK_BASE_PATH . '/D')) {
        return $dPath;
    }
    
    // 如果 D: 不存在，尝试从第一个可用分区读取（按字母顺序）
    for ($i = 0; $i < 26; $i++) {
        $letter = chr(65 + $i); // A-Z
        $partitionPath = DISK_BASE_PATH . '/' . $letter;
        if (is_dir($partitionPath)) {
            return $partitionPath . '/DiskData.json';
        }
    }
    
    // 如果没有任何分区，默认使用 D:（分区可能会被创建）
    return $dPath;
}

/**
 * 同步分区数据到 DiskData.json（内部函数，不发送响应）
 * DiskData.json 存储在系统盘 D:（如果 D: 不存在则使用第一个可用分区）
 */
function syncDiskDataToFile($partitionName, $size = null) {
    try {
        $diskDataFile = getDiskDataFilePath();
        
        // 读取现有数据
        $data = [
            'totalSize' => 3221225472, // 默认 3GB
            'partitionCount' => 0,
            'partitions' => []
        ];
        
        if (file_exists($diskDataFile)) {
            $content = file_get_contents($diskDataFile);
            if ($content !== false) {
                $existingData = json_decode($content, true);
                if ($existingData) {
                    $data = $existingData;
                }
            }
        }
        
        // 更新分区信息
        $partitionKey = is_string($partitionName) && strpos($partitionName, ':') !== false 
            ? $partitionName 
            : $partitionName . ':';
        
        $totalSize = isset($data['totalSize']) ? (int)$data['totalSize'] : 3221225472;
        $currentSum = 0;
        foreach ($data['partitions'] as $p => $s) {
            $currentSum += (int)$s;
        }
        
        if ($size !== null) {
            // 如果分区已存在于配置中，保留原有大小（不覆盖）
            if (!isset($data['partitions'][$partitionKey])) {
                if ($currentSum + $size > $totalSize) {
                    return; // 超过总大小，不写入新分区配置
                }
                $data['partitions'][$partitionKey] = $size;
            }
        } else if (!isset($data['partitions'][$partitionKey])) {
            $letter = str_replace(':', '', $partitionKey);
            $newSize = ($letter === 'C') ? 1073741824 : (($letter === 'D') ? 2147483648 : 1073741824);
            if ($currentSum + $newSize > $totalSize) {
                return; // 超过总大小，不写入新分区配置
            }
            $data['partitions'][$partitionKey] = $newSize;
        }
        
        // 更新分区数量
        $data['partitionCount'] = count($data['partitions']);
        
        // 确保目录存在
        $diskDataDir = dirname($diskDataFile);
        if (!is_dir($diskDataDir)) {
            mkdir($diskDataDir, 0755, true);
        }
        
        // 写入文件
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if ($json !== false) {
            file_put_contents($diskDataFile, $json, LOCK_EX);
        }
    } catch (Exception $e) {
        // 静默失败，不影响主要功能
    }
}

/**
 * 创建系统分区 D:（从 SYSTEMRESOURCE.zip 解压）
 * @param string $partitionPath 分区路径
 */
function createSystemPartitionD($partitionPath) {
    // 检查 ZipArchive 支持
    if (!class_exists('ZipArchive')) {
        sendResponse(false, '系统分区 D: 创建失败: PHP ZipArchive 扩展未安装', null, 500);
    }
    
    // SYSTEMRESOURCE.zip 文件路径（从 system/service/ 到项目根目录）
    $serviceDir = realpath(__DIR__) ?: __DIR__;
    $projectRoot = dirname(dirname($serviceDir));
    $zipFile = $projectRoot . '/test/assets/SYSTEMRESOURCE.zip';
    
    // 检查 ZIP 文件是否存在
    if (!file_exists($zipFile)) {
        sendResponse(false, '系统资源文件不存在: ' . $zipFile, null, 404);
    }
    
    // 创建临时解压目录
    $tempExtractPath = sys_get_temp_dir() . '/zeros_system_' . uniqid();
    if (!mkdir($tempExtractPath, 0755, true)) {
        sendResponse(false, '无法创建临时解压目录', null, 500);
    }
    
    try {
        // 解压 ZIP 文件
        $zip = new ZipArchive();
        if ($zip->open($zipFile) !== true) {
            rmdir($tempExtractPath);
            sendResponse(false, '无法打开系统资源文件: ' . $zipFile, null, 500);
        }
        
        if (!$zip->extractTo($tempExtractPath)) {
            $zip->close();
            deleteDirectoryRecursive($tempExtractPath);
            sendResponse(false, '解压系统资源文件失败', null, 500);
        }
        
        $zip->close();
        
        // 查找解压后的 D 目录
        $extractedDPath = $tempExtractPath . '/D';
        if (!is_dir($extractedDPath)) {
            // 尝试查找其他可能的目录结构
            $items = scandir($tempExtractPath);
            foreach ($items as $item) {
                if ($item !== '.' && $item !== '..' && is_dir($tempExtractPath . '/' . $item)) {
                    // 检查是否是 D 目录（不区分大小写）
                    if (strtoupper($item) === 'D') {
                        $extractedDPath = $tempExtractPath . '/' . $item;
                        break;
                    }
                }
            }
        }
        
        if (!is_dir($extractedDPath)) {
            deleteDirectoryRecursive($tempExtractPath);
            sendResponse(false, '解压后的系统资源目录 D 不存在', null, 500);
        }
        
        // 将解压后的 D 目录移动到目标位置
        // 使用 rename（如果同一文件系统）或递归复制+删除
        if (rename($extractedDPath, $partitionPath)) {
            // 移动成功，清理临时目录
            @rmdir($tempExtractPath);
            // 同步更新 DiskData.json
            syncDiskDataToFile('D:', 2147483648); // D: 默认 2GB
            
            sendResponse(true, '系统分区 D: 创建成功（从系统资源文件解压）', [
                'partition' => 'D:',
                'letter' => 'D',
                'path' => $partitionPath,
                'created' => date('Y-m-d H:i:s'),
                'source' => 'SYSTEMRESOURCE.zip'
            ]);
        } else {
            // rename 失败，使用递归复制
            $fileCount = 0;
            $totalSize = 0;
            $errors = [];
            if (copyDirectoryRecursive($extractedDPath, $partitionPath, $fileCount, $totalSize, $errors)) {
                deleteDirectoryRecursive($tempExtractPath);
                // 同步更新 DiskData.json
                syncDiskDataToFile('D:', 2147483648); // D: 默认 2GB
                
                sendResponse(true, '系统分区 D: 创建成功（从系统资源文件解压）', [
                    'partition' => 'D:',
                    'letter' => 'D',
                    'path' => $partitionPath,
                    'created' => date('Y-m-d H:i:s'),
                    'source' => 'SYSTEMRESOURCE.zip',
                    'fileCount' => $fileCount,
                    'totalSize' => $totalSize
                ]);
            } else {
                deleteDirectoryRecursive($tempExtractPath);
                sendResponse(false, '系统分区 D: 创建失败: ' . implode('; ', $errors), null, 500);
            }
        }
        
    } catch (Exception $e) {
        // 清理临时目录
        if (is_dir($tempExtractPath)) {
            deleteDirectoryRecursive($tempExtractPath);
        }
        sendResponse(false, '系统分区 D: 创建失败: ' . $e->getMessage(), null, 500);
    }
}

/**
 * 删除分区
 * @param string $partitionName 分区名称（如 "C:"）
 * @param bool $force 是否强制删除（即使分区不为空）
 */
function deletePartition($partitionName, $force = false) {
    $validated = validatePartitionName($partitionName);
    if (!$validated) {
        sendResponse(false, '无效的分区名称格式: ' . $partitionName . ' (格式应为单个大写字母+冒号，如 C:)', null, 400);
    }
    
    $diskLetter = $validated['letter'];
    
    // D: 是系统盘，不允许删除
    if ($diskLetter === 'D') {
        sendResponse(false, '系统分区 D: 不允许删除', [
            'partition' => 'D:',
            'reason' => 'D: 是系统盘，受保护'
        ], 403);
    }
    
    $partitionPath = getPartitionPath($diskLetter);
    
    // 检查分区是否存在
    if (!is_dir($partitionPath)) {
        sendResponse(false, '分区不存在: ' . $partitionName, null, 404);
    }
    
    // 检查分区是否为空（除非强制删除）
    if (!$force) {
        $files = array_diff(scandir($partitionPath), ['.', '..']);
        if (!empty($files)) {
            $fileCount = countFilesRecursive($partitionPath);
            sendResponse(false, '分区不为空，无法删除: ' . $partitionName . ' (包含 ' . $fileCount . ' 个文件/目录，使用 force=true 强制删除)', [
                'partition' => $partitionName,
                'fileCount' => $fileCount
            ], 400);
        }
    }
    
    // 删除分区（递归删除所有内容）
    $deleted = false;
    if ($force) {
        // 强制删除：递归删除所有内容
        if (deleteDirectoryRecursive($partitionPath)) {
            $deleted = true;
        }
    } else {
        // 普通删除：只删除空目录
        if (rmdir($partitionPath)) {
            $deleted = true;
        }
    }
    
    if ($deleted) {
        // 同步更新 DiskData.json
        removePartitionFromDiskData($partitionName);
        
        sendResponse(true, $force ? '分区已强制删除: ' . $partitionName : '分区已删除: ' . $partitionName, [
            'partition' => $partitionName,
            'force' => $force,
            'deleted' => date('Y-m-d H:i:s')
        ]);
    } else {
        sendResponse(false, '分区删除失败: ' . $partitionName, null, 500);
    }
}

/**
 * 从 DiskData.json 移除分区（内部函数）
 */
function removePartitionFromDiskData($partitionName) {
    try {
        $diskDataFile = getDiskDataFilePath();
        
        if (!file_exists($diskDataFile)) {
            return;
        }
        
        $content = file_get_contents($diskDataFile);
        if ($content === false) {
            return;
        }
        
        $data = json_decode($content, true);
        if (!$data || !isset($data['partitions'])) {
            return;
        }
        
        $partitionKey = is_string($partitionName) && strpos($partitionName, ':') !== false 
            ? $partitionName 
            : $partitionName . ':';
        
        if (isset($data['partitions'][$partitionKey])) {
            unset($data['partitions'][$partitionKey]);
            $data['partitionCount'] = count($data['partitions']);
            
            $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            if ($json !== false) {
                file_put_contents($diskDataFile, $json, LOCK_EX);
            }
        }
    } catch (Exception $e) {
        // 静默失败
    }
}

/**
 * 合并分区（将源分区的内容合并到目标分区）
 * @param string $sourcePartition 源分区名称（如 "C:"）
 * @param string $targetPartition 目标分区名称（如 "D:"）
 * @param bool $deleteSource 合并后是否删除源分区
 */
function mergePartitions($sourcePartition, $targetPartition, $deleteSource = false) {
    $sourceValidated = validatePartitionName($sourcePartition);
    $targetValidated = validatePartitionName($targetPartition);
    
    if (!$sourceValidated) {
        sendResponse(false, '无效的源分区名称: ' . $sourcePartition, null, 400);
    }
    if (!$targetValidated) {
        sendResponse(false, '无效的目标分区名称: ' . $targetPartition, null, 400);
    }
    
    if ($sourcePartition === $targetPartition) {
        sendResponse(false, '源分区和目标分区不能相同', null, 400);
    }
    
    $sourceLetter = $sourceValidated['letter'];
    $targetLetter = $targetValidated['letter'];
    $sourcePath = getPartitionPath($sourceLetter);
    $targetPath = getPartitionPath($targetLetter);
    
    // 检查源分区是否存在
    if (!is_dir($sourcePath)) {
        sendResponse(false, '源分区不存在: ' . $sourcePartition, null, 404);
    }
    
    // 检查目标分区是否存在
    if (!is_dir($targetPath)) {
        sendResponse(false, '目标分区不存在: ' . $targetPartition, null, 404);
    }
    
    // 统计源分区文件数量
    $sourceFileCount = countFilesRecursive($sourcePath);
    $sourceSize = calculateDirectorySize($sourcePath);
    
    // 合并分区（复制所有文件）
    $mergedCount = 0;
    $mergedSize = 0;
    $errors = [];
    
    try {
        $result = copyDirectoryRecursive($sourcePath, $targetPath, $mergedCount, $mergedSize, $errors);
        
        if (!$result) {
            sendResponse(false, '分区合并失败，部分文件可能未合并', [
                'source' => $sourcePartition,
                'target' => $targetPartition,
                'mergedCount' => $mergedCount,
                'mergedSize' => $mergedSize,
                'errors' => $errors
            ], 500);
        }
        
        $responseData = [
            'source' => $sourcePartition,
            'target' => $targetPartition,
            'mergedCount' => $mergedCount,
            'mergedSize' => $mergedSize,
            'sourceFileCount' => $sourceFileCount,
            'sourceSize' => $sourceSize,
            'merged' => date('Y-m-d H:i:s')
        ];
        
        // 如果要求删除源分区
        if ($deleteSource) {
            if (deleteDirectoryRecursive($sourcePath)) {
                $responseData['sourceDeleted'] = true;
                sendResponse(true, '分区合并成功，源分区已删除', $responseData);
            } else {
                $responseData['sourceDeleted'] = false;
                $responseData['warning'] = '分区合并成功，但源分区删除失败';
                sendResponse(true, '分区合并成功，但源分区删除失败', $responseData);
            }
        } else {
            sendResponse(true, '分区合并成功', $responseData);
        }
        
    } catch (Exception $e) {
        sendResponse(false, '分区合并失败: ' . $e->getMessage(), [
            'source' => $sourcePartition,
            'target' => $targetPartition,
            'mergedCount' => $mergedCount,
            'errors' => $errors
        ], 500);
    }
}

/**
 * 读取 DiskData.json
 */
function readDiskData() {
    try {
        $diskDataFile = getDiskDataFilePath();
        
        if (!file_exists($diskDataFile)) {
            sendResponse(true, 'DiskData.json 不存在', [
                'totalSize' => 3221225472,
                'partitionCount' => 0,
                'partitions' => []
            ]);
        }
        
        $content = file_get_contents($diskDataFile);
        if ($content === false) {
            sendResponse(false, '无法读取 DiskData.json', null, 500);
        }
        
        $data = json_decode($content, true);
        if ($data === null) {
            sendResponse(false, 'DiskData.json 格式错误', null, 500);
        }
        
        sendResponse(true, 'DiskData.json 读取成功', $data);
    } catch (Exception $e) {
        sendResponse(false, '读取 DiskData.json 失败: ' . $e->getMessage(), null, 500);
    }
}

/**
 * 同步 DiskData.json（根据物理目录和配置同步）
 */
function syncDiskData() {
    try {
        $diskDataFile = getDiskDataFilePath();
        
        // 读取现有配置
        $data = [
            'totalSize' => 3221225472,
            'partitionCount' => 0,
            'partitions' => []
        ];
        
        if (file_exists($diskDataFile)) {
            $content = file_get_contents($diskDataFile);
            if ($content !== false) {
                $existingData = json_decode($content, true);
                if ($existingData) {
                    $data = $existingData;
                }
            }
        }
        
        // 扫描物理目录，确保配置中包含所有存在的分区（且不超过总大小）
        $totalSize = isset($data['totalSize']) ? (int)$data['totalSize'] : 3221225472;
        if (is_dir(DISK_BASE_PATH)) {
            $items = scandir(DISK_BASE_PATH);
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') {
                    continue;
                }
                
                $itemPath = DISK_BASE_PATH . '/' . $item;
                if (is_dir($itemPath) && preg_match('/^[A-Z]$/', $item)) {
                    $partitionName = $item . ':';
                    if (!isset($data['partitions'][$partitionName])) {
                        $letter = $item;
                        $defaultSize = ($letter === 'C') ? 1073741824 : (($letter === 'D') ? 2147483648 : 1073741824);
                        $currentSum = array_sum(array_map('intval', $data['partitions']));
                        if ($currentSum + $defaultSize <= $totalSize) {
                            $data['partitions'][$partitionName] = $defaultSize;
                        }
                        // 超过总大小时不加入配置，避免配置中分区之和超过 totalSize
                    }
                }
            }
        }
        
        // 更新分区数量
        $data['partitionCount'] = count($data['partitions']);
        
        // 确保目录存在
        $diskDataDir = dirname($diskDataFile);
        if (!is_dir($diskDataDir)) {
            mkdir($diskDataDir, 0755, true);
        }
        
        // 写入文件
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            sendResponse(false, '无法编码 JSON 数据', null, 500);
        }
        
        if (file_put_contents($diskDataFile, $json, LOCK_EX) === false) {
            sendResponse(false, '无法写入 DiskData.json', null, 500);
        }
        
        sendResponse(true, 'DiskData.json 同步成功', $data);
    } catch (Exception $e) {
        sendResponse(false, '同步 DiskData.json 失败: ' . $e->getMessage(), null, 500);
    }
}

/**
 * 列出所有分区
 * 从 DiskData.json 读取配置，如果分区在配置中存在但物理目录不存在，则自动创建
 */
function listPartitions() {
    if (!is_dir(DISK_BASE_PATH)) {
        sendResponse(true, 'DISK目录不存在', ['partitions' => []]);
    }
    
    // 读取 DiskData.json 配置
    $diskDataFile = getDiskDataFilePath();
    $diskData = null;
    $partitionSizes = [];
    
    if (file_exists($diskDataFile)) {
        $content = file_get_contents($diskDataFile);
        if ($content !== false) {
            $diskData = json_decode($content, true);
            if ($diskData && isset($diskData['partitions']) && is_array($diskData['partitions'])) {
                $partitionSizes = $diskData['partitions'];
            }
        }
    }
    
    // 扫描物理目录
    $physicalPartitions = [];
    $items = scandir(DISK_BASE_PATH);
    
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        
        $itemPath = DISK_BASE_PATH . '/' . $item;
        
        // 只处理目录，且目录名是单个大写字母
        if (is_dir($itemPath) && preg_match('/^[A-Z]$/', $item)) {
            $physicalPartitions[$item] = true;
        }
    }
    
    // 从 DiskData.json 读取的分区，如果物理目录不存在则自动创建
    $createdPartitions = [];
    foreach ($partitionSizes as $partitionName => $size) {
        // 确保分区名称格式正确（以:结尾）
        if (!preg_match('/^([A-Z]):$/', $partitionName, $matches)) {
            continue;
        }
        
        $diskLetter = $matches[1];
        $partitionPath = DISK_BASE_PATH . '/' . $diskLetter;
        
        // 如果配置中存在但物理目录不存在，自动创建
        if (!isset($physicalPartitions[$diskLetter]) && !is_dir($partitionPath)) {
            // D: 是系统盘，不能自动创建（需要从 SYSTEMRESOURCE.zip 解压）
            if ($diskLetter === 'D') {
                continue;
            }
            
            // 创建分区目录
            if (mkdir($partitionPath, 0755, true)) {
                $createdPartitions[] = $partitionName;
            }
        }
    }
    
    // 构建分区列表
    $partitions = [];
    $items = scandir(DISK_BASE_PATH);
    
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        
        $itemPath = DISK_BASE_PATH . '/' . $item;
        
        // 只处理目录，且目录名是单个大写字母
        if (is_dir($itemPath) && preg_match('/^[A-Z]$/', $item)) {
            $partitionName = $item . ':';
            $partitionPath = $itemPath;
            
            // 从配置中获取分区大小，如果没有则使用计算的大小
            $configuredSize = isset($partitionSizes[$partitionName]) ? $partitionSizes[$partitionName] : null;
            $actualSize = calculateDirectorySize($partitionPath);
            
            $info = [
                'partition' => $partitionName,
                'letter' => $item,
                'path' => $partitionPath,
                'size' => $actualSize,
                'configuredSize' => $configuredSize,
                'fileCount' => countFilesRecursive($partitionPath),
                'dirCount' => countDirectoriesRecursive($partitionPath),
                'created' => file_exists($partitionPath) ? date('Y-m-d H:i:s', filectime($partitionPath)) : null,
                'modified' => file_exists($partitionPath) ? date('Y-m-d H:i:s', filemtime($partitionPath)) : null
            ];
            
            // 如果有配置的大小，使用配置的大小作为磁盘总大小
            if ($configuredSize !== null) {
                $info['diskTotalSize'] = $configuredSize;
                $info['diskFreeSpace'] = $configuredSize - $actualSize;
                $info['diskUsedSpace'] = $actualSize;
                $info['diskUsagePercent'] = $configuredSize > 0 ? round(($actualSize / $configuredSize) * 100, 2) : 0;
            } else {
                // 获取磁盘空间信息（物理磁盘）
                $totalSize = disk_total_space($partitionPath);
                $freeSpace = disk_free_space($partitionPath);
                if ($totalSize !== false && $freeSpace !== false) {
                    $info['diskTotalSize'] = $totalSize;
                    $info['diskFreeSpace'] = $freeSpace;
                    $info['diskUsedSpace'] = $totalSize - $freeSpace;
                    $info['diskUsagePercent'] = $totalSize > 0 ? round((($totalSize - $freeSpace) / $totalSize) * 100, 2) : 0;
                }
            }
            
            $partitions[] = $info;
        }
    }
    
    // 按分区字母排序
    usort($partitions, function($a, $b) {
        return strcmp($a['letter'], $b['letter']);
    });
    
    $message = '分区列表获取成功';
    if (count($createdPartitions) > 0) {
        $message .= '（已自动创建分区: ' . implode(', ', $createdPartitions) . '）';
    }
    
    sendResponse(true, $message, [
        'partitions' => $partitions,
        'count' => count($partitions),
        'createdPartitions' => $createdPartitions
    ]);
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

/**
 * 递归计算文件数量
 */
function countFilesRecursive($dir) {
    $count = 0;
    if (!is_dir($dir)) {
        return 0;
    }
    
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $filePath = $dir . '/' . $file;
        if (is_dir($filePath)) {
            $count += countFilesRecursive($filePath);
        } else {
            $count++;
        }
    }
    return $count;
}

/**
 * 递归计算目录数量
 */
function countDirectoriesRecursive($dir) {
    $count = 0;
    if (!is_dir($dir)) {
        return 0;
    }
    
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $filePath = $dir . '/' . $file;
        if (is_dir($filePath)) {
            $count++;
            $count += countDirectoriesRecursive($filePath);
        }
    }
    return $count;
}

/**
 * 递归删除目录
 */
function deleteDirectoryRecursive($dir) {
    if (!is_dir($dir)) {
        return false;
    }
    
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $filePath = $dir . '/' . $file;
        if (is_dir($filePath)) {
            if (!deleteDirectoryRecursive($filePath)) {
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
 * 递归复制目录
 */
function copyDirectoryRecursive($source, $target, &$fileCount = 0, &$totalSize = 0, &$errors = []) {
    if (!is_dir($source)) {
        return false;
    }
    
    // 如果目标目录不存在，尝试创建
    if (!is_dir($target)) {
        if (!mkdir($target, 0755, true)) {
            $errors[] = "无法创建目标目录: $target";
            return false;
        }
    }
    
    $files = array_diff(scandir($source), ['.', '..']);
    
    foreach ($files as $file) {
        $sourceFile = $source . '/' . $file;
        $targetFile = $target . '/' . $file;
        
        if (is_dir($sourceFile)) {
            // 递归复制子目录
            if (!copyDirectoryRecursive($sourceFile, $targetFile, $fileCount, $totalSize, $errors)) {
                $errors[] = "复制目录失败: $sourceFile -> $targetFile";
            }
        } else {
            // 复制文件
            if (file_exists($targetFile)) {
                // 文件已存在，跳过或覆盖（这里选择跳过，避免冲突）
                continue;
            }
            
            if (copy($sourceFile, $targetFile)) {
                $fileCount++;
                $totalSize += filesize($targetFile);
            } else {
                $errors[] = "复制文件失败: $sourceFile -> $targetFile";
            }
        }
    }
    
    return count($errors) === 0;
}

// 主处理逻辑
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'check':
        $partition = $_GET['partition'] ?? '';
        if (empty($partition)) {
            sendResponse(false, '缺少必要参数: partition', null, 400);
        }
        checkPartition($partition);
        break;
        
    case 'create':
        $partition = $_GET['partition'] ?? '';
        if (empty($partition)) {
            sendResponse(false, '缺少必要参数: partition', null, 400);
        }
        createPartition($partition);
        break;
        
    case 'delete':
        $partition = $_GET['partition'] ?? '';
        $force = isset($_GET['force']) && ($_GET['force'] === 'true' || $_GET['force'] === '1');
        if (empty($partition)) {
            sendResponse(false, '缺少必要参数: partition', null, 400);
        }
        deletePartition($partition, $force);
        break;
        
    case 'merge':
        $sourcePartition = $_GET['source'] ?? '';
        $targetPartition = $_GET['target'] ?? '';
        $deleteSource = isset($_GET['deleteSource']) && ($_GET['deleteSource'] === 'true' || $_GET['deleteSource'] === '1');
        if (empty($sourcePartition) || empty($targetPartition)) {
            sendResponse(false, '缺少必要参数: source, target', null, 400);
        }
        mergePartitions($sourcePartition, $targetPartition, $deleteSource);
        break;
        
    case 'list':
        listPartitions();
        break;
        
    case 'read_data':
        readDiskData();
        break;
        
    case 'write_data':
        // 只允许内部调用，不提供外部API（安全考虑）
        sendResponse(false, 'write_data 操作不允许通过 API 调用', null, 403);
        break;
        
    case 'sync_data':
        syncDiskData();
        break;
        
    default:
        sendResponse(false, '未知的操作: ' . $action . ' (支持的操作: check, create, delete, merge, list, read_data, sync_data)', null, 400);
        break;
}

