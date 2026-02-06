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
define('SETUP_DIR', __DIR__);  // 当前安装脚本所在目录（根目录）

// 正确路径定义（假设您的目录结构是）
// 根目录/
// ├── install-service.php  (这个文件)
// ├── system/
// │   ├── service/
// │   │   ├── DISK/
// │   │   │   ├── D/
// │   │   │   └── ...
// │   │   └── FSDirve.php
// │   └── ...

// DISK应该在 system/service/DISK/
$diskBasePath = SETUP_DIR . DIRECTORY_SEPARATOR . 'system' . DIRECTORY_SEPARATOR . 'service' . DIRECTORY_SEPARATOR . 'DISK';
define('DISK_BASE_PATH', realpath($diskBasePath) ?: $diskBasePath);

// DISK的D子目录
$diskDPath = DISK_BASE_PATH . DIRECTORY_SEPARATOR . 'D';
define('DISK_D_PATH', realpath($diskDPath) ?: $diskDPath);

// 数据文件路径（使用规范化路径）
define('DISK_DATA_FILE', DISK_D_PATH . DIRECTORY_SEPARATOR . 'DiskData.json');
define('LOCAL_SDATA_FILE', DISK_D_PATH . DIRECTORY_SEPARATOR . 'LocalSData.json');

// FSDirve.php路径
$fsDirvePath = SETUP_DIR . DIRECTORY_SEPARATOR . 'system' . DIRECTORY_SEPARATOR . 'service' . DIRECTORY_SEPARATOR . 'FSDirve.php';
define('FSDIRVE_PATH', realpath($fsDirvePath) ?: $fsDirvePath);
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
 * 通过FSDirve服务读取JSON文件
 * 使用system/service/FSDirve.php服务，确保与系统一致
 */
function readJsonFileViaFSDirve($path, $fileName) {
    // 构建FSDirve服务URL
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $serviceUrl = $protocol . '://' . $host . '/system/service/FSDirve.php';
    $url = $serviceUrl . '?action=read_file&path=' . urlencode($path) . '&fileName=' . urlencode($fileName);
    
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10
        ]
    ]);
    
    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        return null;
    }
    
    $result = json_decode($response, true);
    if ($result && $result['status'] === 'success' && isset($result['data']['content'])) {
        $content = $result['data']['content'];
        $data = json_decode($content, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $data;
        }
    }
    
    return null;
}

/**
 * 通过FSDirve服务写入JSON文件
 * 使用system/service/FSDirve.php服务，确保与系统一致
 */
function writeJsonFileViaFSDirve($path, $fileName, $data) {
    // 构建JSON内容
    $content = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return false;
    }
    
    // 构建FSDirve服务URL
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $serviceUrl = $protocol . '://' . $host . '/system/service/FSDirve.php';
    $url = $serviceUrl . '?action=write_file&path=' . urlencode($path) . '&fileName=' . urlencode($fileName) . '&writeMod=overwrite';
    
    $postData = json_encode(['content' => $content]);
    
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => 'Content-Type: application/json',
            'content' => $postData,
            'timeout' => 10
        ]
    ]);
    
    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        return false;
    }
    
    $result = json_decode($response, true);
    return $result && $result['status'] === 'success';
}

/**
 * 读取 JSON 文件（优先使用FSDirve服务）
 * 返回数组 [success => bool, data => array|null, error => string|null]
 */
function readJsonFileWithError($filePath) {
    // 规范化路径（处理Windows路径分隔符问题）
    $filePath = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $filePath);
    $realPath = realpath($filePath);
    if ($realPath !== false) {
        $filePath = $realPath;
    }
    
    // 安装阶段直接使用文件操作，不使用FSDirve服务（避免循环依赖）
    // 检查文件是否存在
    if (!file_exists($filePath)) {
        return ['success' => false, 'data' => null, 'error' => '文件不存在: ' . $filePath];
    }
    
    // 读取文件内容
    $content = file_get_contents($filePath);
    if ($content === false) {
        return ['success' => false, 'data' => null, 'error' => '无法读取文件内容'];
    }
    
    // 移除BOM（如果存在）
    if (substr($content, 0, 3) === "\xEF\xBB\xBF") {
        $content = substr($content, 3);
    }
    
    // 移除UTF-8 BOM的另一种形式
    $content = ltrim($content, "\xEF\xBB\xBF");
    
    // 尝试解析JSON
    $data = json_decode($content, true);
    $jsonError = json_last_error();
    if ($jsonError !== JSON_ERROR_NONE) {
        $errorMsg = 'JSON解析错误: ' . json_last_error_msg() . ' (错误代码: ' . $jsonError . ')';
        // 显示文件大小和内容预览
        $errorMsg .= '。文件大小: ' . strlen($content) . ' 字节';
        if (strlen($content) > 0) {
            $preview = substr($content, 0, min(200, strlen($content)));
            $errorMsg .= '。文件内容开头: ' . $preview . '...';
        }
        return ['success' => false, 'data' => null, 'error' => $errorMsg];
    }
    
    return ['success' => true, 'data' => $data, 'error' => null];
}

/**
 * 读取 JSON 文件（兼容函数）
 */
function readJsonFile($filePath) {
    $result = readJsonFileWithError($filePath);
    return $result['data'];
}

/**
 * 写入 JSON 文件（优先使用FSDirve服务）
 */
function writeJsonFile($filePath, $data) {
    // 优先使用FSDirve服务（如果可用）
    if (file_exists(FSDIRVE_PATH)) {
        // 从文件路径提取虚拟路径
        if (strpos($filePath, DISK_D_PATH) === 0) {
            $relativePath = substr($filePath, strlen(DISK_D_PATH));
            $fileName = basename($relativePath);
            $path = 'D:';
            if (writeJsonFileViaFSDirve($path, $fileName, $data)) {
                return true;
            }
        }
    }
    
    // 如果FSDirve服务不可用，回退到直接文件操作（仅安装阶段）
    $dir = dirname($filePath);
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0755, true)) {
            return false;
        }
    }
    
    $content = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return false;
    }
    
    $result = file_put_contents($filePath, $content, LOCK_EX);
    return $result !== false;
}

/**
 * MD5 加密密码（与CryptDrive.md5使用完全相同的实现）
 * 使用与JavaScript CryptDrive._md5Hash相同的算法
 * 
 * 注意：此函数已不再使用。密码加密现在在JS端（index.html）进行，
 * 使用与CryptDrive._md5Hash完全一致的逻辑，然后将加密后的MD5值传给PHP。
 * PHP端直接使用接收到的已加密MD5值，不再进行加密。
 */
function md5Hash($password) {
    // 转换为UTF-8字节数组
    $utf8 = mb_convert_encoding($password, 'UTF-8', 'UTF-8');
    $bytes = [];
    $len = strlen($utf8);
    for ($i = 0; $i < $len; $i++) {
        $bytes[] = ord($utf8[$i]);
    }
    
    // 填充
    $originalLen = count($bytes);
    $bytes[] = 0x80;
    while (count($bytes) % 64 !== 56) {
        $bytes[] = 0;
    }
    
    // 添加长度（64位，小端序）
    $bitLen = $originalLen * 8;
    for ($i = 0; $i < 8; $i++) {
        $bytes[] = ($bitLen >> ($i * 8)) & 0xFF;
    }
    
    // 初始化MD5缓冲区
    $h = [1732584193, -271733879, -1732584194, 271733878];
    
    // 处理每个512位块
    $bytesLen = count($bytes);
    for ($i = 0; $i < $bytesLen; $i += 64) {
        $chunk = [];
        for ($j = 0; $j < 16; $j++) {
            $idx = $i + $j * 4;
            $chunk[$j] = $bytes[$idx] | 
                        ($bytes[$idx + 1] << 8) | 
                        ($bytes[$idx + 2] << 16) | 
                        ($bytes[$idx + 3] << 24);
        }
        md5cycle($h, $chunk);
    }
    
    return hex($h);
}

/**
 * MD5循环处理
 */
function md5cycle(&$x, $k) {
    $a = $x[0];
    $b = $x[1];
    $c = $x[2];
    $d = $x[3];
    
    $a = ff($a, $b, $c, $d, $k[0], 7, -680876936);
    $d = ff($d, $a, $b, $c, $k[1], 12, -389564586);
    $c = ff($c, $d, $a, $b, $k[2], 17, 606105819);
    $b = ff($b, $c, $d, $a, $k[3], 22, -1044525330);
    $a = ff($a, $b, $c, $d, $k[4], 7, -176418897);
    $d = ff($d, $a, $b, $c, $k[5], 12, 1200080426);
    $c = ff($c, $d, $a, $b, $k[6], 17, -1473231341);
    $b = ff($b, $c, $d, $a, $k[7], 22, -45705983);
    $a = ff($a, $b, $c, $d, $k[8], 7, 1770035416);
    $d = ff($d, $a, $b, $c, $k[9], 12, -1958414417);
    $c = ff($c, $d, $a, $b, $k[10], 17, -42063);
    $b = ff($b, $c, $d, $a, $k[11], 22, -1990404162);
    $a = ff($a, $b, $c, $d, $k[12], 7, 1804603682);
    $d = ff($d, $a, $b, $c, $k[13], 12, -40341101);
    $c = ff($c, $d, $a, $b, $k[14], 17, -1502002290);
    $b = ff($b, $c, $d, $a, $k[15], 22, 1236535329);
    
    $a = gg($a, $b, $c, $d, $k[1], 5, -165796510);
    $d = gg($d, $a, $b, $c, $k[6], 9, -1069501632);
    $c = gg($c, $d, $a, $b, $k[11], 14, 643717713);
    $b = gg($b, $c, $d, $a, $k[0], 20, -373897302);
    $a = gg($a, $b, $c, $d, $k[5], 5, -701558691);
    $d = gg($d, $a, $b, $c, $k[10], 9, 38016083);
    $c = gg($c, $d, $a, $b, $k[15], 14, -660478335);
    $b = gg($b, $c, $d, $a, $k[4], 20, -405537848);
    $a = gg($a, $b, $c, $d, $k[9], 5, 568446438);
    $d = gg($d, $a, $b, $c, $k[14], 9, -1019803690);
    $c = gg($c, $d, $a, $b, $k[3], 14, -187363961);
    $b = gg($b, $c, $d, $a, $k[8], 20, 1163531501);
    $a = gg($a, $b, $c, $d, $k[13], 5, -1444681467);
    $d = gg($d, $a, $b, $c, $k[2], 9, -51403784);
    $c = gg($c, $d, $a, $b, $k[7], 14, 1735328473);
    $b = gg($b, $c, $d, $a, $k[12], 20, -1926607734);
    
    $a = hh($a, $b, $c, $d, $k[5], 4, -378558);
    $d = hh($d, $a, $b, $c, $k[8], 11, -2022574463);
    $c = hh($c, $d, $a, $b, $k[11], 16, 1839030562);
    $b = hh($b, $c, $d, $a, $k[14], 23, -35309556);
    $a = hh($a, $b, $c, $d, $k[1], 4, -1530992060);
    $d = hh($d, $a, $b, $c, $k[4], 11, 1272893353);
    $c = hh($c, $d, $a, $b, $k[7], 16, -155497632);
    $b = hh($b, $c, $d, $a, $k[10], 23, -1094730640);
    $a = hh($a, $b, $c, $d, $k[13], 4, 681279174);
    $d = hh($d, $a, $b, $c, $k[0], 11, -358537222);
    $c = hh($c, $d, $a, $b, $k[3], 16, -722521979);
    $b = hh($b, $c, $d, $a, $k[6], 23, 76029189);
    $a = hh($a, $b, $c, $d, $k[9], 4, -640364487);
    $d = hh($d, $a, $b, $c, $k[12], 11, -421815835);
    $c = hh($c, $d, $a, $b, $k[15], 16, 530742520);
    $b = hh($b, $c, $d, $a, $k[2], 23, -995338651);
    
    $a = ii($a, $b, $c, $d, $k[0], 6, -198630844);
    $d = ii($d, $a, $b, $c, $k[7], 10, 1126891415);
    $c = ii($c, $d, $a, $b, $k[14], 15, -1416354905);
    $b = ii($b, $c, $d, $a, $k[5], 21, -57434055);
    $a = ii($a, $b, $c, $d, $k[12], 6, 1700485571);
    $d = ii($d, $a, $b, $c, $k[3], 10, -1894986606);
    $c = ii($c, $d, $a, $b, $k[10], 15, -1051523);
    $b = ii($b, $c, $d, $a, $k[1], 21, -2054922799);
    $a = ii($a, $b, $c, $d, $k[8], 6, 1873313359);
    $d = ii($d, $a, $b, $c, $k[15], 10, -30611744);
    $c = ii($c, $d, $a, $b, $k[6], 15, -1560198380);
    $b = ii($b, $c, $d, $a, $k[13], 21, 1309151649);
    $a = ii($a, $b, $c, $d, $k[4], 6, -145523070);
    $d = ii($d, $a, $b, $c, $k[11], 10, -1120210379);
    $c = ii($c, $d, $a, $b, $k[2], 15, 718787259);
    $b = ii($b, $c, $d, $a, $k[9], 21, -343485551);
    
    $x[0] = add32($a, $x[0]);
    $x[1] = add32($b, $x[1]);
    $x[2] = add32($c, $x[2]);
    $x[3] = add32($d, $x[3]);
}

/**
 * MD5辅助函数
 */
function cmn($q, $a, $b, $x, $s, $t) {
    $a = add32(add32($a, $q), add32($x, $t));
    return add32((($a << $s) | (($a & 0xFFFFFFFF) >> (32 - $s))) & 0xFFFFFFFF, $b);
}

function ff($a, $b, $c, $d, $x, $s, $t) {
    return cmn((($b & $c) | ((~$b) & $d)) & 0xFFFFFFFF, $a, $b, $x, $s, $t);
}

function gg($a, $b, $c, $d, $x, $s, $t) {
    return cmn((($b & $d) | ($c & (~$d))) & 0xFFFFFFFF, $a, $b, $x, $s, $t);
}

function hh($a, $b, $c, $d, $x, $s, $t) {
    return cmn((($b ^ $c) ^ $d) & 0xFFFFFFFF, $a, $b, $x, $s, $t);
}

function ii($a, $b, $c, $d, $x, $s, $t) {
    return cmn(($c ^ ($b | (~$d))) & 0xFFFFFFFF, $a, $b, $x, $s, $t);
}

function add32($a, $b) {
    return ($a + $b) & 0xFFFFFFFF;
}

function rhex($n) {
    $s = '';
    $hexChr = '0123456789abcdef';
    $n = $n & 0xFFFFFFFF; // 确保是无符号32位整数
    for ($i = 0; $i < 4; $i++) {
        $s .= $hexChr[(($n >> ($i * 8 + 4)) & 0x0F)] . $hexChr[(($n >> ($i * 8)) & 0x0F)];
    }
    return $s;
}

function hex($x) {
    $result = '';
    for ($i = 0; $i < count($x); $i++) {
        $result .= rhex($x[$i]);
    }
    return $result;
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
    
    // 确保DISK_BASE_PATH目录存在
    if (!is_dir(DISK_BASE_PATH)) {
        if (!mkdir(DISK_BASE_PATH, 0755, true)) {
            return false;
        }
    }
    
    // 为每个分区创建物理文件夹和filesystem JSON文件
    foreach ($partitions as $partitionName => $size) {
        // 提取分区字母（如 "D:" -> "D"）
        $diskLetter = rtrim($partitionName, ':');
        $partitionPath = DISK_BASE_PATH . '/' . $diskLetter;
        
        // 创建分区目录（如果不存在）
        if (!is_dir($partitionPath)) {
            if (!mkdir($partitionPath, 0755, true)) {
                return false;
            }
        }
        
        // 创建filesystem JSON文件（如果不存在）
        $safeName = str_replace(':', '_', $partitionName); // "D:" -> "D_"
        $filesystemFileName = "filesystem_{$safeName}.json";
        $filesystemFilePath = $partitionPath . '/' . $filesystemFileName;
        
        if (!file_exists($filesystemFilePath)) {
            // 创建初始的filesystem JSON结构
            $filesystemData = [
                'separateName' => $partitionName,
                'nodes' => [
                    [
                        'path' => $partitionName,
                        'name' => $partitionName,
                        'parent' => null,
                        'attributes' => (object)[],  // 空对象
                        'children' => [],  // 空数组
                        'meta' => (object)[]  // 空对象
                    ]
                ]
            ];
            
            $filesystemJson = json_encode($filesystemData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            if ($filesystemJson === false) {
                return false; // JSON编码失败
            }
            
            if (file_put_contents($filesystemFilePath, $filesystemJson, LOCK_EX) === false) {
                return false; // 文件写入失败
            }
        }
    }
    
    return writeJsonFile(DISK_DATA_FILE, $diskData);
}

/**
 * 创建管理员用户
 * 重要：只修改用户相关的数据，保留其他所有数据不变
 * 系统资源释放后（用户创建时）将用户选择的语言写入注册表（system.registry.language 与 system.languagesExpansion.currentLocale）
 *
 * @param string $username 用户名
 * @param string $password 已加密的MD5密码值（在JS端使用与CryptDrive._md5Hash完全一致的逻辑加密）
 * @param string|null $language 用户语言，如 'zh-CN' 或 'en'，为空时默认 'zh-CN'
 */
function createAdminUser($username, $password, $language = null) {
    // 规范化路径（处理Windows路径分隔符问题）
    $localSDataFile = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, LOCAL_SDATA_FILE);
    
    // 尝试规范化路径（即使文件不存在，目录路径也应该能realpath）
    $dirPath = dirname($localSDataFile);
    $fileName = basename($localSDataFile);
    $realDirPath = realpath($dirPath);
    if ($realDirPath !== false) {
        $localSDataFile = $realDirPath . DIRECTORY_SEPARATOR . $fileName;
    } else {
        // 如果目录路径无法realpath，使用原始路径
        $localSDataFile = LOCAL_SDATA_FILE;
    }
    
    // 读取现有的 LocalSData.json（如果存在）
    $readResult = readJsonFileWithError($localSDataFile);
    
    // 如果读取失败，尝试其他路径格式
    if (!$readResult['success']) {
        // 尝试原始路径
        if ($localSDataFile !== LOCAL_SDATA_FILE) {
            $readResult = readJsonFileWithError(LOCAL_SDATA_FILE);
            if ($readResult['success']) {
                $localSDataFile = LOCAL_SDATA_FILE;
            }
        }
        
        // 如果仍然失败，尝试其他路径格式
        if (!$readResult['success']) {
            $altPath = str_replace('\\', '/', LOCAL_SDATA_FILE);
            if (file_exists($altPath)) {
                $readResult = readJsonFileWithError($altPath);
                if ($readResult['success']) {
                    $localSDataFile = $altPath;
                }
            }
        }
        
        if (!$readResult['success']) {
            $altPath2 = str_replace('/', '\\', LOCAL_SDATA_FILE);
            if (file_exists($altPath2)) {
                $readResult = readJsonFileWithError($altPath2);
                if ($readResult['success']) {
                    $localSDataFile = $altPath2;
                }
            }
        }
    }
    
    $localData = $readResult['data'];
    
    // 如果文件不存在或JSON解析失败，创建新的数据结构
    // 但如果文件存在但JSON解析失败，我们需要保留原始文件（不覆盖）
    if ($localData === null) {
        // 检查文件是否存在
        if (file_exists($localSDataFile)) {
            // 文件存在但JSON解析失败，不能覆盖，返回详细错误信息
            return 'LocalSData.json文件存在但格式错误，无法读取。' . $readResult['error'] . ' 文件路径: ' . $localSDataFile;
        }
        // 文件不存在，创建新的数据结构（匹配LocalSData.json的标准结构）
        $localData = [
            'system' => [],
            'programs' => []
        ];
    }
    
    // 确保顶层结构存在（保留其他顶层键）
    if (!is_array($localData)) {
        $localData = [
            'system' => [],
            'programs' => []
        ];
    }
    
    // 确保 system 键存在（保留其他 system 数据）
    if (!isset($localData['system']) || !is_array($localData['system'])) {
        $localData['system'] = [];
    }
    
    // 确保 programs 键存在（保留其他 programs 数据）
    if (!isset($localData['programs']) || !is_array($localData['programs'])) {
        $localData['programs'] = [];
    }
    
    // userControl.users 是键值对对象（在 PHP 中是关联数组），键是用户名，值是用户信息对象
    // 确保 userControl.users 存在且是数组（保留现有的用户数据）
    if (!isset($localData['system']['userControl.users']) || !is_array($localData['system']['userControl.users'])) {
        $localData['system']['userControl.users'] = [];
    }
    
    // 准备用户数据
    // 注意：密码已经在JS端使用MD5加密（与CryptDrive._md5Hash逻辑100%一致），这里直接使用
    $userData = [
        'level' => 'DEFAULT_ADMIN',
        'password' => $password,  // 直接使用已加密的MD5值
        'avatar' => null,
        'createdAt' => time() * 1000, // JavaScript timestamp
        'lastLogin' => null
    ];
    
    // 如果用户已存在，合并数据（新数据覆盖旧数据，保留旧数据中的其他字段）
    if (isset($localData['system']['userControl.users'][$username]) && is_array($localData['system']['userControl.users'][$username])) {
        // array_merge 的第二个参数会覆盖第一个参数，所以先放旧数据，再放新数据
        // 这样新数据（密码等）会覆盖旧数据，但旧数据中的其他字段会被保留
        $userData = array_merge($localData['system']['userControl.users'][$username], $userData);
    }
    
    // 添加/更新用户数据（键值对结构，键是用户名，值是用户信息对象）
    $localData['system']['userControl.users'][$username] = $userData;
    
    // 设置当前用户（保留其他 system 数据）
    $localData['system']['userControl.currentUser'] = $username;
    
    // 系统资源释放后，将用户语言写入注册表（支持 LanguagesExpansion 与 registry）
    $locale = ($language !== null && $language !== '') ? $language : 'zh-CN';
    if (!in_array($locale, ['zh-CN', 'en'], true)) {
        $locale = 'zh-CN';
    }
    if (!isset($localData['system']['registry']) || !is_array($localData['system']['registry'])) {
        $localData['system']['registry'] = [];
    }
    $localData['system']['registry']['language'] = $locale;
    if (!isset($localData['system']['languagesExpansion']) || !is_array($localData['system']['languagesExpansion'])) {
        $localData['system']['languagesExpansion'] = [];
    }
    $localData['system']['languagesExpansion']['currentLocale'] = $locale;
    
    // 写入文件（保留所有其他数据）
    if (!writeJsonFile($localSDataFile, $localData)) {
        // 检查目录是否存在
        $dir = dirname($localSDataFile);
        if (!is_dir($dir)) {
            return '无法创建目录: ' . $dir;
        }
        if (!is_writable($dir)) {
            return '目录不可写: ' . $dir;
        }
        return '文件写入失败: ' . $localSDataFile;
    }
    
    return true;
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
            // 创建管理员用户（系统资源释放后，将用户语言写入注册表）
            $username = $input['username'] ?? '';
            $password = $input['password'] ?? '';
            $language = isset($input['language']) ? trim((string) $input['language']) : null;
            
            // 验证用户名（只能英文）
            if (!preg_match('/^[a-zA-Z][a-zA-Z0-9_]*$/', $username)) {
                sendResponse(false, '用户名只能包含英文字母、数字和下划线，且必须以字母开头');
                break;
            }
            
            // 验证密码（应该是32位的MD5哈希值）
            if (empty($password) || !preg_match('/^[a-f0-9]{32}$/i', $password)) {
                sendResponse(false, '密码格式无效（应为MD5哈希值）');
                break;
            }
            
            $result = createAdminUser($username, $password, $language);
            if ($result === true) {
                sendResponse(true, '管理员用户创建成功');
            } else {
                $errorMsg = is_string($result) ? $result : '管理员用户创建失败';
                sendResponse(false, $errorMsg);
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

