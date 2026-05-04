# CVS-ZEROS-018: FSDirve 文件名参数未校验导致路径穿越

**漏洞编号**: CVS-ZEROS-018  
**发现日期**: 2026-05-04  
**修复日期**: 待修复  
**严重程度**: 严重 (CVSS 9.1)  
**CWE分类**: CWE-22 (路径遍历), CWE-73 (外部控制文件名或路径)  
**状态**: 待修复

---

## 漏洞概述

`system/service/FSDirve.php` 对虚拟目录参数 `path` 做了 `validatePath()` 校验，禁止 `..` 并限制分区格式；但多个文件级操作在拼接 `$dirPath . '/' . $fileName` 前未校验 `fileName`、`sourceFileName`、`targetFileName` 是否包含路径分隔符或 `..`。攻击者可通过 `fileName=../../../JWT.php` 等方式越出虚拟盘目录，读取、删除或复制服务端文件。

## 漏洞描述

### 受影响操作

以下操作存在文件名路径穿越风险：

- `read_file`
- `delete_file`
- `get_file_info`
- `copy_file`
- `move_file`

`create_file`、`write_file`、`rename_file` 对部分文件名参数已有 `/`、`\` 校验，但其余文件级入口未统一复用该校验逻辑。

### 攻击链

1. 攻击者持有可调用 FSDirve 的 token 与 upid，或结合 CVS-ZEROS-017 伪造权限。
2. 请求 `FSDirve.php?action=read_file&path=D:/cache&fileName=../../../JWT.php`。
3. `path=D:/cache` 通过 `validatePath()`，后端拼接得到 `DISK/D/cache/../../../JWT.php`。
4. PHP 文件系统解析 `..` 后读取 `system/service/JWT.php`，泄露 JWT 默认密钥与签名逻辑。

### 根本原因

- 路径安全只覆盖了目录参数 `path`，没有覆盖最终参与拼接的文件名参数。
- 敏感文件限制只关注 D 盘根目录固定文件名，无法覆盖通过 `../` 逃逸后的真实目标。
- 未在最终路径上使用 `realpath()` 做分区根目录边界校验。

---

## 技术细节

### 漏洞位置

| 位置 | 说明 |
|------|------|
| `readFileContent($path, $fileName, ...)` | 未校验 `$fileName` 即拼接并读取 |
| `deleteFile($path, $fileName)` | 未校验 `$fileName` 即拼接并删除 |
| `getFileInfo($path, $fileName)` | 未校验 `$fileName` 即拼接并返回文件信息 |
| `copyFile($sourcePath, $sourceFileName, ...)` | 未校验源/目标文件名是否含路径穿越 |
| `moveFile($sourcePath, $sourceFileName, ...)` | 未校验源/目标文件名是否含路径穿越 |

### 相关代码

```php
function readFileContent($path, $fileName, $asBase64 = false) {
    $dirPath = getDirPath($path);
    // ...
    $filePath = $dirPath . '/' . $fileName;
    // ...
    $content = file_get_contents($filePath);
}
```

```php
function deleteFile($path, $fileName) {
    $dirPath = getDirPath($path);
    // ...
    $filePath = $dirPath . '/' . $fileName;
    // ...
    unlink($filePath);
}
```

## 影响评估

- **源码泄露**: 可读取 `JWT.php`、代理服务源码、后端配置等。
- **密钥泄露后提权**: 读取硬编码 JWT 密钥后可离线伪造 SystemToken/UserToken。
- **破坏系统状态**: `delete_file` 可删除越权路径上的服务文件或安全状态文件。
- **绕过历史修复**: 可绕过 CVS-ZEROS-012/015 对 D 根敏感文件名的限制。

### CVSS 3.1 评分建议

- **AV**: Network (N)
- **AC**: Low (L)
- **PR**: Low (L)
- **UI**: None (N)
- **S**: Changed (C)
- **C/I/A**: High (H)
- **向量**: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H -> **9.1（严重）**

---

## 修复建议

1. 新增统一 `validateFileName($name)`，拒绝空值、`/`、`\`、`..`、URL 编码后的路径分隔符及控制字符。
2. 所有文件级 action 在业务逻辑前统一校验所有文件名参数。
3. 在拼接后调用 `realpath()`，并确认最终路径仍位于对应分区根目录内；新建文件可校验父目录真实路径。
4. 对 `copy_file`、`move_file` 同时校验源文件名和目标文件名。
5. 将敏感文件保护从“虚拟路径字符串判断”升级为“真实路径 allow/deny 策略”。

---

## 相关文件

- `system/service/FSDirve.php`
- `system/service/jwtVerify.php`
- `system/service/JWT.php`

---

**修复状态**: 待修复
