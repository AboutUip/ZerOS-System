# CVS-ZEROS-009: ProcessManager PID 欺骗与权限提升漏洞

## 漏洞概述

- **编号**: CVS-ZEROS-009
- **标题**: ProcessManager 内核 API 调用 PID 欺骗导致权限提升
- **发现日期**: 2026-02-06
- **修复日期**: 待修复
- **严重程度**: 严重 (9.3)
- **CWE分类**: CWE-285 (Improper Authorization), CWE-639 (Authorization Bypass Through User-Controlled Key)
- **状态**: 待修复

## 漏洞描述

`ProcessManager.callKernelAPI` 方法存在严重的安全设计缺陷。该方法作为应用程序调用内核 API 的统一入口，接受一个 `pid` 参数用于标识调用者身份，并使用该 `pid` 进行权限验证（通过 `PermissionManager.checkAndRequestPermission`）。

然而，系统并未验证传入的 `pid` 是否与实际调用者的进程 ID 一致。由于 `ProcessManager.callKernelAPI` 是暴露给所有应用程序的接口，恶意的低权限进程可以构造调用，传入高权限进程（如系统进程 PID 1）的 PID，从而欺骗系统使其认为该操作是由高权限进程发起的。

一旦欺骗成功，`PermissionManager` 将检查被冒充的高权限进程的权限，并予以通过，导致恶意进程可以绕过所有权限限制，执行任意内核 API 操作（如文件读写、网络访问、系统配置修改等）。

## 受影响组件

- **文件**: `d:\Project\Algorithm\ZerOS\kernel\process\processManager.js`
- **函数**: `ProcessManager.callKernelAPI(pid, apiName, args)`

## 漏洞分析

在 `kernel/process/processManager.js` 中：

```javascript
    static async callKernelAPI(pid, apiName, args = []) {
        // ...
        
        // 权限检查
        if (typeof PermissionManager !== 'undefined' && !skipDefaultPermissionCheck) {
            const requiredPermission = ProcessManager._getRequiredPermission(apiName);
            if (requiredPermission) {
                try {
                    // 直接使用传入的 pid 进行权限检查
                    const hasPermission = await PermissionManager.checkAndRequestPermission(pid, requiredPermission);
                    if (!hasPermission) {
                        // ...
                    }
                    // ...
                } catch (e) {
                    // ...
                }
            }
            // ...
        }
        
        // ...
        
        // 执行API调用
        return await ProcessManager._executeKernelAPI(apiName, args, pid);
    }
```

代码完全信任传入的 `pid` 参数，没有进行来源验证（如检查调用栈或使用无法伪造的进程上下文）。

## 危害评估

该漏洞允许任何能够运行代码的进程（包括受限的第三方应用）完全接管系统。

1.  **权限提升**: 普通用户进程可以冒充管理员进程或系统核心进程。
2.  **文件系统破坏**: 攻击者可以利用 `FileSystem.write` 和 `FileSystem.delete` 篡改或删除系统关键文件。
3.  **数据泄露**: 攻击者可以利用 `FileSystem.read` 读取受保护的用户数据。
4.  **持久化攻击**: 攻击者可以修改系统启动脚本或注册恶意服务。

## 复现步骤

1.  创建一个普通的非特权应用程序或脚本。
2.  在程序中调用 `ProcessManager.callKernelAPI`，并将 `pid` 参数设置为 1 (或其他已知的高权限 PID)，调用一个需要高权限的 API (如 `FileSystem.write`)。
    ```javascript
    // 假设当前进程 PID 为 200，且没有 KERNEL_DISK_WRITE 权限
    // 冒充 PID 1 (通常拥有所有权限)
    await ProcessManager.callKernelAPI(1, 'FileSystem.write', ['D:/system_critical_file.txt', 'HACKED', 'OVERWRITE']);
    ```
3.  观察操作是否成功执行。如果文件被写入，则证明漏洞存在。

## 修复建议

1.  **移除 PID 参数依赖**: `callKernelAPI` 不应接受 `pid` 参数，而应由内核内部自动获取调用者的真实 PID。
2.  **调用者身份验证**:
    - 利用 `UserGroup._getCurrentPid()` 中使用的调用栈分析技术，确定调用者的真实代码路径和归属进程。
    - 或者，重构 API 调用机制，使应用程序只能通过特定于进程的上下文对象（Process Context Object）调用 API，该对象在进程创建时生成并绑定了真实的 PID，且不可被应用篡改。
3.  **深度防御**: 在 `PermissionManager` 中增加对 PID 来源的交叉验证。

## 参考资料

- [IDOR (Insecure Direct Object References)](https://owasp.org/www-project-top-ten/2017/A5_2017-Broken_Access_Control)
- [CWE-639: Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
