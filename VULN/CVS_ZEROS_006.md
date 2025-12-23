# CVS-ZEROS-006: LStorage 内核模块调用验证绕过与 UserControl Proxy 保护机制绕过漏洞

**漏洞编号**: CVS-ZEROS-006  
**发现日期**: 2025-12-24  
**修复日期**: 2025-12-24  
**严重程度**: 严重 (CVSS 8.5)  
**CWE分类**: CWE-284 (不恰当的访问控制), CWE-639 (授权绕过), CWE-693 (保护机制失败)  
**状态**: 已修复

---

## 漏洞概述

本次发现两个相关的权限绕过漏洞：

1. **LStorage 内核模块调用验证绕过漏洞**：`LStorage._isKernelModuleCall()` 方法的调用栈检查存在缺陷，可能将用户程序调用误判为内核模块调用，导致危险系统存储键的写入权限检查被绕过。

2. **UserControl Proxy 保护机制绕过漏洞**：`UserControl._users` Proxy 的调用栈检查过于宽泛，使用 `includes('userControl')` 或 `includes('usercontrol')` 进行匹配，可能被用户程序通过路径伪造绕过，导致用户数据被直接修改。

## 漏洞描述

### 漏洞 1: LStorage 内核模块调用验证绕过

`kernel/drive/LStorage.js` 中的 `_isKernelModuleCall()` 方法用于判断调用是否来自内核模块。如果判断为内核模块调用，`setSystemStorage()` 方法会跳过权限检查，允许直接写入危险系统存储键（如 `permissionControl.*`）。

**问题**：原始实现使用简单的正则表达式匹配调用栈，如果调用栈中包含 `kernel/` 路径，就会被识别为内核模块调用。但调用栈中可能包含 `kernel/drive/LStorage.js` 本身，导致误判。

### 漏洞 2: UserControl Proxy 保护机制绕过

`kernel/core/usercontrol/userControl.js` 中的 `_users` Proxy 用于保护用户数据不被外部直接修改。当通过 `_users.get(username)` 获取用户数据时，返回的对象被包装在 Proxy 中，拦截属性修改操作。

**问题**：Proxy 的 `set` trap 在检查调用栈时，使用了过于宽泛的字符串匹配：
- `callerString.includes('userControl')`
- `callerString.includes('usercontrol')`

这可能导致用户程序通过路径伪造（如 `application/userControlTest.js`）绕过检查。

## 技术细节

### 漏洞位置 1: LStorage 内核模块调用验证

**文件**: `kernel/drive/LStorage.js`  
**方法**: `LStorage._isKernelModuleCall()`  
**行号**: 925-938

**原始漏洞代码**:
```javascript
static _isKernelModuleCall() {
    try {
        const stack = new Error().stack;
        if (!stack) return false;
        
        // 问题：简单的正则匹配，可能误判
        // 如果调用栈中包含 kernel/drive/LStorage.js 本身，也会被识别为内核模块调用
        const kernelModulePattern = /kernel[\/\\](core|process|drive|filesystem|dynamicModule)[\/\\]/;
        return kernelModulePattern.test(stack);
    } catch (e) {
        KernelLogger.debug("LStorage", `检查内核模块调用失败: ${e.message}`);
        return false;
    }
}
```

**攻击场景**:

用户程序通过某种方式（如通过其他内核模块间接调用）可能使调用栈中包含 `kernel/` 路径，从而被误判为内核模块调用：

```javascript
// 用户程序 escalate.js
// 如果调用栈中包含 kernel/drive/LStorage.js，可能被误判为内核模块调用
await LStorage.setSystemStorage('permissionControl.settings', maliciousData);
// 如果被误判为内核模块调用，会跳过权限检查，直接允许写入
```

### 漏洞位置 2: UserControl Proxy 保护机制

**文件**: `kernel/core/usercontrol/userControl.js`  
**方法**: `UserControl._initializeProtectedState()` 中的 `_users` Proxy  
**行号**: 143-201

**原始漏洞代码**:
```javascript
// _users Proxy 的 get trap
get(target, prop) {
    if (prop === 'get') {
        return (key) => {
            const value = target.get(key);
            if (value && typeof value === 'object') {
                // 返回受保护的 Proxy 对象
                return new Proxy(value, {
                    set(obj, propName, propValue) {
                        const stack = new Error().stack || '';
                        const callerString = stack.split('\n').slice(1, 10).join('\n');
                        
                        const allowedCallers = [
                            'UserControl._loadUsers',
                            'UserControl.createUser',
                            // ... 其他允许的调用者
                        ];
                        
                        // 问题：过于宽泛的匹配
                        const isAllowed = allowedCallers.some(caller => 
                            callerString.includes(caller) || 
                            callerString.includes('userControl') ||  // 可能被绕过
                            callerString.includes('usercontrol')    // 可能被绕过
                        );
                        
                        if (!isAllowed) {
                            throw new Error(`安全错误: 不能直接修改用户数据对象。`);
                        }
                        
                        obj[propName] = propValue;
                        return true;
                    }
                });
            }
            return value;
        };
    }
    // ...
}
```

**攻击场景**:

用户程序可以通过路径伪造绕过检查：

```javascript
// 用户程序路径: D:/application/userControlTest/escalate.js
// 调用栈中会包含 "userControlTest"，匹配 includes('userControl') 成功
const userData = UserControl._users.get('TestUser');
userData.level = 'DEFAULT_ADMIN';  // 可能绕过 Proxy 保护
```

### 完整的攻击流程

1. **用户启动恶意程序**（如 `escalate`）
2. **程序尝试修改 `permissionControl.*` 键**
   - 如果 `_isKernelModuleCall()` 误判为内核模块调用，会跳过权限检查
3. **程序尝试直接修改 `UserControl._users` 中的用户数据**
   - 如果 Proxy 的调用栈检查被绕过，可以成功修改内存中的用户数据
4. **虽然修改可能不会持久化到存储**，但内存中的修改可能影响当前会话的权限检查

## 影响评估

### 漏洞 1 的影响

- **权限绕过**: 用户程序可能被误判为内核模块调用，绕过危险键的权限检查
- **系统配置篡改**: 可能修改 `permissionControl.*` 和 `permissionManager.permissions` 键
- **影响范围**: 所有尝试写入危险系统存储键的程序都可能利用此漏洞

### 漏洞 2 的影响

- **内存数据篡改**: 可能修改内存中的用户数据，影响当前会话的权限检查
- **保护机制失效**: Proxy 保护机制可能被绕过，用户数据可能被直接修改
- **影响范围**: 所有尝试直接访问 `UserControl._users` 的程序都可能利用此漏洞

### 组合影响

虽然两个漏洞单独存在时影响有限（漏洞1需要误判，漏洞2只影响内存），但组合使用可能导致：
- 内存中的权限提升（虽然不持久化）
- 系统配置的临时篡改
- 保护机制的完全绕过

## 修复方案

### 修复 1: 改进 LStorage 内核模块调用验证

**修复位置**: `kernel/drive/LStorage.js`  
**修复方法**: 改进 `_isKernelModuleCall()` 方法，跳过 `LStorage.js` 本身的调用栈行，检查实际调用者

**修复代码**:
```javascript
static _isKernelModuleCall() {
    try {
        const stack = new Error().stack;
        if (!stack) return false;
        
        // 将调用栈按行分割
        const stackLines = stack.split('\n');
        
        // 跳过第一行（Error 消息）和第二行（LStorage.js 本身）
        // 从第三行开始检查，找到第一个不是 LStorage.js 的调用者
        for (let i = 2; i < Math.min(stackLines.length, 10); i++) {
            const line = stackLines[i];
            
            // 跳过 LStorage.js 本身的调用栈行
            if (line.includes('LStorage.js') || line.includes('lStorage.js')) {
                continue;
            }
            
            // 检查是否包含内核模块路径
            // 内核模块路径示例：kernel/core/usercontrol/, kernel/process/ 等
            // 但排除 kernel/drive/LStorage.js 本身
            const kernelModulePattern = /kernel[\/\\](core|process|filesystem|dynamicModule)[\/\\]/;
            if (kernelModulePattern.test(line)) {
                // 找到内核模块调用，记录详细信息用于调试
                KernelLogger.debug("LStorage", `检测到内核模块调用，调用栈行: ${line.substring(0, 100)}`);
                return true;
            }
            
            // 如果找到用户程序路径（application/），说明是用户程序调用
            if (/service[\/\\]DISK[\/\\][CD][\/\\]application[\/\\]/.test(line)) {
                KernelLogger.debug("LStorage", `检测到用户程序调用，调用栈行: ${line.substring(0, 100)}`);
                return false;
            }
        }
        
        // 如果没有找到明确的调用者，默认返回 false（安全策略：宁可拒绝也不允许）
        KernelLogger.debug("LStorage", `无法确定调用来源，默认拒绝（安全策略）`);
        return false;
    } catch (e) {
        KernelLogger.debug("LStorage", `检查内核模块调用失败: ${e.message}`);
        return false;
    }
}
```

**额外保护**: 对于危险键（`permissionControl.*` 和 `permissionManager.permissions`），即使被识别为内核模块调用，也要验证是否为 `PermissionManager` 模块：

```javascript
// 对于 permissionControl.* 和 permissionManager.permissions 键，只允许 PermissionManager 模块写入
else if (isPermissionControlKey) {
    if (/kernel[\/\\]process[\/\\]permissionManager\.js/i.test(stack) || 
        /kernel[\/\\]process[\/\\]permissionmanager\.js/i.test(stack)) {
        allowed = true;
        KernelLogger.debug("LStorage", `PermissionManager 模块调用，允许写入 ${key}`);
    } else {
        KernelLogger.error("LStorage", `安全警告：检测到疑似伪造的内核模块调用，拒绝写入 ${key}`);
        throw new Error(`安全验证失败：只有 PermissionManager 模块可以写入 ${key} 键`);
    }
}
```

### 修复 2: 加强 UserControl Proxy 保护机制

**修复位置**: `kernel/core/usercontrol/userControl.js`  
**修复方法**: 移除宽泛的字符串匹配，只允许精确匹配 `allowedCallers` 列表，并额外检查调用栈中必须包含内核模块路径

**修复代码**:
```javascript
// 严格检查：只允许来自 UserControl 内部方法的调用
// 必须精确匹配 allowedCallers 中的方法名
let isAllowed = allowedCallers.some(caller => 
    callerString.includes(caller)
);

// 额外检查：确保调用栈中包含 kernel/core/usercontrol/ 路径
// 这样可以防止用户程序通过伪造调用栈绕过检查
if (isAllowed) {
    const isKernelModule = /kernel[\/\\]core[\/\\]usercontrol[\/\\]/i.test(callerString);
    if (!isKernelModule) {
        // 如果匹配了 allowedCallers 但不在内核模块路径中，拒绝
        isAllowed = false;
    }
}
```

## 修复验证

修复后应验证：

✅ `_isKernelModuleCall()` 正确识别用户程序调用，不会误判  
✅ `_isKernelModuleCall()` 跳过 `LStorage.js` 本身的调用栈行  
✅ 用户程序无法通过伪造调用栈绕过 `permissionControl.*` 键的权限检查  
✅ 即使被误判为内核模块调用，`permissionControl.*` 键也只允许 `PermissionManager` 模块写入  
✅ `UserControl._users` Proxy 的调用栈检查不再使用宽泛的字符串匹配  
✅ 用户程序无法通过路径伪造（如 `userControlTest.js`）绕过 Proxy 保护  
✅ 只有来自 `kernel/core/usercontrol/` 路径的调用才能修改用户数据  
✅ 所有修改用户数据的尝试都被正确阻止并记录日志  

## 相关文件

- `kernel/drive/LStorage.js` - LStorage 内核模块调用验证
- `kernel/core/usercontrol/userControl.js` - UserControl Proxy 保护机制
- `system/service/DISK/D/application/escalate/escalate.js` - 验证程序

## 参考

- CVS-ZEROS-005: LStorage 系统存储写入权限检查缺失漏洞（已修复）
- CVS-ZEROS-001: ProcessManager/PermissionManager/UserControl 权限提升漏洞（已修复）

---

**修复状态**: ✅ 已修复

**修复提交**: 
- 改进 `LStorage._isKernelModuleCall()` 方法，跳过自身调用栈行，检查实际调用者
- 对于危险键，即使被识别为内核模块调用，也验证是否为允许的内核模块
- 加强 `UserControl._users` Proxy 的调用栈检查，移除宽泛匹配，要求精确匹配和内核模块路径验证

