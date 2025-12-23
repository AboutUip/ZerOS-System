# CVS-ZEROS-005: LStorage 系统存储写入权限检查缺失漏洞

**漏洞编号**: CVS-ZEROS-005  
**发现日期**: 2025-12-23  
**修复日期**: 2025-12-23  
**严重程度**: 严重 (CVSS 8.8)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-639 (授权绕过)  
**状态**: 已修复

---

## 漏洞概述

`LStorage.setSystemStorage()` 方法在写入系统存储数据时，没有对存储键进行权限验证。虽然该方法需要调用程序拥有 `SYSTEM_STORAGE_WRITE` 权限，但该权限属于**特殊权限**，普通用户可以授权。获得该权限后，程序可以修改任何系统存储数据，包括 `userControl.users`，从而实现权限提升。

## 漏洞描述

`kernel/drive/LStorage.js` 中的 `setSystemStorage()` 方法在写入系统存储时，只检查了调用程序是否拥有 `SYSTEM_STORAGE_WRITE` 权限，但没有对存储键进行进一步的安全验证。这允许普通用户授权的程序修改敏感的系统配置数据。

## 技术细节

### 漏洞位置

**文件**: `kernel/drive/LStorage.js`  
**方法**: `LStorage.setSystemStorage(key, value)`  
**行号**: 926-1000

**漏洞代码**:
```javascript
static async setSystemStorage(key, value) {
    if (!LStorage._initialized) {
        await LStorage.init();
    }
    
    // 只检查了调用程序是否有 SYSTEM_STORAGE_WRITE 权限
    // 但没有对 key 进行验证，允许修改任何系统存储数据
    
    // 先更新内存中的数据
    LStorage._storageData.system[key] = value;
    
    // 保存到文件系统
    await LStorage._saveStorageData();
    
    return true;
}
```

### 权限检查缺失

**问题**: `SYSTEM_STORAGE_WRITE` 权限是**特殊权限**，根据 `PermissionManager.PERMISSION_LEVEL_MAP` 的定义：

```javascript
[PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
```

特殊权限虽然需要用户确认，但**普通用户可以授权**（与危险权限不同，危险权限需要管理员授权）。

### 攻击场景

**场景1: 权限提升攻击**

普通用户启动恶意程序，授权 `SYSTEM_STORAGE_WRITE` 权限后，程序可以：

```javascript
// 读取当前用户数据
const usersData = await LStorage.getSystemStorage('userControl.users');

// 修改当前用户的权限级别
usersData[currentUser] = {
    ...usersData[currentUser],
    level: 'DEFAULT_ADMIN'  // 提升为最高权限
};

// 利用漏洞：直接写入系统存储，无需额外权限检查
await LStorage.setSystemStorage('userControl.users', usersData);
```

**场景2: 系统配置篡改**

攻击者可以修改其他敏感的系统存储数据：

```javascript
// 修改权限控制设置
await LStorage.setSystemStorage('permissionControl.blacklist', []);  // 清空黑名单

// 修改权限控制白名单
await LStorage.setSystemStorage('permissionControl.whitelist', ['malicious-app']);  // 添加恶意程序到白名单

// 修改系统主题（虽然影响较小）
await LStorage.setSystemStorage('system.theme', 'malicious-theme');
```

### 完整的攻击流程

1. **用户启动恶意程序**（如 `escalate`）
2. **用户授权 `SYSTEM_STORAGE_WRITE` 权限**（普通用户可以授权特殊权限）
3. **程序读取 `userControl.users` 数据**
4. **程序修改当前用户的 `level` 字段为 `DEFAULT_ADMIN`**
5. **程序调用 `LStorage.setSystemStorage()` 保存修改**
6. **权限提升完成**，用户现在拥有系统最高权限

### 验证程序

已创建验证程序 `system/service/DISK/D/application/escalate/escalate.js`，演示该漏洞的利用过程。

## 影响评估

- **权限提升**: 普通用户可以提升为 `DEFAULT_ADMIN`（系统最高权限）
- **系统控制**: 获得最高权限后，可以授权所有高风险权限给程序
- **配置篡改**: 可以修改系统配置（黑名单、白名单、主题等）
- **持久化攻击**: 修改会持久化到文件系统，重启后仍然有效
- **影响范围**: 所有拥有 `SYSTEM_STORAGE_WRITE` 权限的程序都可能利用此漏洞

## 修复方案

### 1. 细粒度权限定义

在 `PermissionManager` 中添加细粒度的系统存储权限：

```javascript
// kernel/process/permissionManager.js
static PERMISSION = {
    // ... 其他权限 ...
    
    // 系统存储权限
    SYSTEM_STORAGE_READ: 'SYSTEM_STORAGE_READ',     // 读取系统存储
    SYSTEM_STORAGE_WRITE: 'SYSTEM_STORAGE_WRITE',   // 写入系统存储（基础权限，仅可写入非敏感键）
    
    // 系统存储细粒度权限（危险权限，仅管理员可授予）
    SYSTEM_STORAGE_WRITE_USER_CONTROL: 'SYSTEM_STORAGE_WRITE_USER_CONTROL',           // 写入用户控制相关存储（userControl.*）
    SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL: 'SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL', // 写入权限控制相关存储（permissionControl.*, permissionManager.*）
    SYSTEM_STORAGE_WRITE_DESKTOP: 'SYSTEM_STORAGE_WRITE_DESKTOP',                     // 写入桌面相关存储（desktop.*）
};
```

权限级别映射：

```javascript
static PERMISSION_LEVEL_MAP = {
    // ...
    [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE]: PermissionManager.PERMISSION_LEVEL.NORMAL, // 基础权限，自动授予，但仅可写入非敏感键
    
    // 系统存储细粒度权限（危险权限，仅管理员可授予）
    [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL]: PermissionManager.PERMISSION_LEVEL.DANGEROUS,
    [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL]: PermissionManager.PERMISSION_LEVEL.DANGEROUS,
    [PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_DESKTOP]: PermissionManager.PERMISSION_LEVEL.SPECIAL,
};
```

### 2. 基于键的权限检查

在 `LStorage.setSystemStorage()` 方法中添加基于键的权限检查：

```javascript
static async setSystemStorage(key, value) {
    // 获取当前进程PID（通过调用栈分析）
    const currentPid = LStorage._getCurrentPid();
    
    // 定义危险存储键及其所需权限（需要危险权限，仅管理员可授予）
    const DANGEROUS_KEY_PERMISSIONS = {
        // 用户控制相关
        'userControl.users': PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL,
        'userControl.settings': PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL,
        
        // 权限控制相关
        'permissionControl.blacklist': PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL,
        'permissionControl.whitelist': PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL,
        'permissionControl.settings': PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL,
        'permissionManager.permissions': PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL,
    };
    
    // 检查是否为危险键
    const requiredPermission = DANGEROUS_KEY_PERMISSIONS[key];
    if (requiredPermission) {
        // 需要危险权限（仅管理员可授予）
        if (currentPid) {
            const hasPermission = await PermissionManager.checkAndRequestPermission(currentPid, requiredPermission);
            if (!hasPermission) {
                throw new Error(`缺少权限：${requiredPermission}（需要管理员授权）`);
            }
        } else {
            // 无法获取PID，降级为检查用户权限
            if (!UserControl.isAdmin()) {
                throw new Error(`写入系统存储键 ${key} 需要管理员权限`);
            }
        }
    } else {
        // 非敏感键，检查基础权限（SYSTEM_STORAGE_WRITE，普通权限，自动授予）
        if (currentPid) {
            const hasBasePermission = PermissionManager.hasPermission(currentPid, PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE);
            if (!hasBasePermission) {
                const granted = await PermissionManager.checkAndRequestPermission(currentPid, PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE);
                if (!granted) {
                    throw new Error(`缺少权限：SYSTEM_STORAGE_WRITE`);
                }
            }
        }
    }
    
    // 继续正常的存储操作
    // ...
}
```

### 3. 程序存储隔离

对于普通程序，默认权限仅可以操作和自己程序相关的注册表项（通过 `setProgramStorage(pid, key, value)`），该操作无需额外权限，因为程序存储是按 PID 隔离的。

### 4. 权限设计原则

- **基础权限** (`SYSTEM_STORAGE_WRITE`): 普通权限，自动授予，可写入非敏感的系统存储键
- **危险权限** (`SYSTEM_STORAGE_WRITE_USER_CONTROL`, `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL`): 危险权限，仅管理员可授予，可写入敏感的系统存储键
- **特殊权限** (`SYSTEM_STORAGE_WRITE_DESKTOP`): 特殊权限，需要用户确认，可写入桌面相关存储

### 5. 关键存储键分类

| 存储键 | 所需权限 | 权限级别 | 说明 |
|--------|---------|---------|------|
| `userControl.users` | `SYSTEM_STORAGE_WRITE_USER_CONTROL` | 危险 | 用户数据，仅管理员可授权 |
| `userControl.settings` | `SYSTEM_STORAGE_WRITE_USER_CONTROL` | 危险 | 用户设置，仅管理员可授权 |
| `permissionControl.*` | `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL` | 危险 | 权限控制配置，仅管理员可授权 |
| `permissionManager.permissions` | `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL` | 危险 | 权限管理器数据，仅管理员可授权 |
| `desktop.*` | `SYSTEM_STORAGE_WRITE_DESKTOP` | 特殊 | 桌面配置，需要用户确认 |
| 其他键 | `SYSTEM_STORAGE_WRITE` | 普通 | 非敏感系统存储，自动授予 |

## 修复验证

修复后应验证：

✅ 普通用户无法修改 `userControl.users`（需要 `SYSTEM_STORAGE_WRITE_USER_CONTROL` 危险权限）  
✅ 普通用户无法修改权限控制相关配置（需要 `SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL` 危险权限）  
✅ 危险权限仅管理员可以授权给程序  
✅ 基础权限 `SYSTEM_STORAGE_WRITE` 为普通权限，自动授予，但仅可写入非敏感键  
✅ 非敏感键（如主题设置）可以正常写入（需要基础权限 `SYSTEM_STORAGE_WRITE`）  
✅ 普通程序默认只能操作自己程序相关的注册表项（通过 `setProgramStorage`，无需额外权限）  
✅ 权限检查通过调用栈正确获取当前进程PID  
✅ 无法获取PID时降级为用户权限检查（对于危险键）

## 相关文件

- `kernel/drive/LStorage.js`
- `kernel/process/permissionManager.js`
- `kernel/core/usercontrol/userControl.js`
- `system/service/DISK/D/application/escalate/escalate.js` (验证程序)

## 参考

- CVS-ZEROS-001: ProcessManager/PermissionManager/UserControl 权限提升漏洞（已修复）
- CVS-ZEROS-003: 终端命令处理权限绕过漏洞（已修复）

---

**修复状态**: ✅ 已修复

