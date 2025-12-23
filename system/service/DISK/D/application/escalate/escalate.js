/* 权限提升工具 - 漏洞演示程序
 * 用于演示 ZerOS 系统中的多个安全漏洞
 * 包括: 系统信息泄露、敏感数据读取、权限提升尝试等
 */

(function(window) {
    'use strict';

    const ESCALATE = {
        // 程序信息
        __info__: function() {
            return {
                name: '权限提升工具',
                type: 'CLI',
                version: '2.0.0',
                description: '权限提升工具 - 漏洞演示和权限提升',
                author: 'ZerOS Security Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    PermissionManager.PERMISSION.KERNEL_MEMORY_READ
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

            // 日志函数
            const log = (level, message, data = null) => {
                const logMessage = `[escalate] ${message}`;
                if (typeof KernelLogger !== 'undefined') {
                    if (level === 'info') {
                        KernelLogger.info("escalate", logMessage, data);
                    } else if (level === 'warn') {
                        KernelLogger.warn("escalate", logMessage, data);
                    } else if (level === 'error') {
                        KernelLogger.error("escalate", logMessage, data);
                    } else if (level === 'debug') {
                        KernelLogger.debug("escalate", logMessage, data);
                    }
                } else {
                    console.log(`[escalate][${level.toUpperCase()}] ${logMessage}`, data || '');
                }
            };

            log('info', `程序启动 - PID: ${pid}, 参数: ${JSON.stringify(args)}`);

            if (!terminal) {
                log('error', '缺少终端实例，程序无法运行');
                throw new Error('escalate requires a terminal instance to run');
            }

            const write = (text) => terminal.write(String(text));
            const writeLine = (text) => write(text + '\n');

            try {
                log('info', '开始执行漏洞演示程序');
                writeLine('╔═══════════════════════════════════════════════════════════╗');
                writeLine('║        ZerOS 安全漏洞演示工具 - 权限提升工具 v2.0        ║');
                writeLine('╚═══════════════════════════════════════════════════════════╝');
                writeLine('');

                // ==================== 阶段 1: 系统信息收集 ====================
                log('info', '开始阶段 1: 系统信息收集');
                writeLine('【阶段 1】系统信息收集');
                writeLine('─────────────────────────────────────────────────────────');

                // 1.1 系统版本信息泄露
                log('debug', '尝试获取系统版本信息');
                writeLine('[*] 尝试获取系统版本信息...');
                if (typeof SystemInformation !== 'undefined') {
                    const sysInfo = SystemInformation.getSystemInfo();
                    log('info', `成功获取系统信息 - 版本: ${sysInfo.systemVersion}, 内核: ${sysInfo.kernelVersion}`, sysInfo);
                    writeLine(`    ✓ 系统名称: ${sysInfo.systemName}`);
                    writeLine(`    ✓ 系统版本: ${sysInfo.systemVersion}`);
                    writeLine(`    ✓ 内核版本: ${sysInfo.kernelVersion}`);
                    writeLine(`    ✓ 构建日期: ${sysInfo.buildDate}`);
                    writeLine(`    ✓ 系统描述: ${sysInfo.description}`);
                    
                    if (sysInfo.developers && sysInfo.developers.length > 0) {
                        writeLine(`    ✓ 开发团队信息:`);
                        sysInfo.developers.forEach(dev => {
                            writeLine(`      - ${dev.name} (${dev.role}) - ${dev.organization}`);
                        });
                        log('info', `发现 ${sysInfo.developers.length} 个开发团队成员`);
                    }
                } else if (typeof window !== 'undefined' && window.SystemInformation) {
                    const sysInfo = window.SystemInformation.getSystemInfo();
                    log('warn', '通过 window.SystemInformation 访问系统信息（全局对象暴露）');
                    writeLine(`    ✓ 通过 window.SystemInformation 获取系统信息`);
                    writeLine(`    ✓ 系统版本: ${sysInfo.systemVersion}`);
                } else {
                    log('warn', '无法获取系统信息 - SystemInformation 不可用');
                    writeLine('    ✗ 无法获取系统信息');
                }

                // 1.2 宿主环境信息泄露
                writeLine('');
                log('debug', '尝试获取宿主环境信息');
                writeLine('[*] 尝试获取宿主环境信息...');
                if (typeof SystemInformation !== 'undefined' && SystemInformation.getHostEnvironment) {
                    const hostInfo = SystemInformation.getHostEnvironment();
                    log('info', '成功获取宿主环境信息', hostInfo);
                    writeLine(`    ✓ 浏览器: ${hostInfo.browser} ${hostInfo.browserVersion}`);
                    writeLine(`    ✓ 平台: ${hostInfo.platform}`);
                    writeLine(`    ✓ 语言: ${hostInfo.language}`);
                    writeLine(`    ✓ 屏幕分辨率: ${hostInfo.screenWidth}x${hostInfo.screenHeight}`);
                    writeLine(`    ✓ 视口大小: ${hostInfo.viewportWidth}x${hostInfo.viewportHeight}`);
                    writeLine(`    ✓ CPU核心数: ${hostInfo.hardwareConcurrency || '未知'}`);
                    writeLine(`    ✓ 设备内存: ${hostInfo.deviceMemory || '未知'} GB`);
                } else {
                    log('warn', '无法获取宿主环境信息');
                }

                // 1.3 全局对象访问
                writeLine('');
                log('debug', '检查全局对象访问');
                writeLine('[*] 检查全局对象访问...');
                const globalObjects = [];
                if (typeof window !== 'undefined') {
                    if (window.SystemInformation) globalObjects.push('window.SystemInformation');
                    if (window.LStorage) globalObjects.push('window.LStorage');
                    if (window.KernelMemory) globalObjects.push('window.KernelMemory');
                    if (window.UserControl) globalObjects.push('window.UserControl');
                    if (window.ProcessManager) globalObjects.push('window.ProcessManager');
                    if (window.PermissionManager) globalObjects.push('window.PermissionManager');
                }
                if (globalObjects.length > 0) {
                    log('warn', `发现 ${globalObjects.length} 个全局内核对象暴露（安全风险）`, globalObjects);
                    writeLine(`    ✓ 发现 ${globalObjects.length} 个可访问的全局内核对象:`);
                    globalObjects.forEach(obj => writeLine(`      - ${obj}`));
                } else {
                    log('info', '未发现可访问的全局对象');
                    writeLine('    ✗ 未发现可访问的全局对象');
                }

                // ==================== 阶段 2: 敏感数据读取 ====================
                writeLine('');
                log('info', '开始阶段 2: 敏感数据读取');
                writeLine('【阶段 2】敏感数据读取');
                writeLine('─────────────────────────────────────────────────────────');

                // 请求读取权限
                if (typeof PermissionManager !== 'undefined') {
                    log('debug', `请求 SYSTEM_STORAGE_READ 权限 - PID: ${pid}`);
                    const hasReadPermission = await PermissionManager.checkAndRequestPermission(
                        pid,
                        PermissionManager.PERMISSION.SYSTEM_STORAGE_READ
                    );
                    if (!hasReadPermission) {
                        log('warn', 'SYSTEM_STORAGE_READ 权限被拒绝');
                        writeLine('    ✗ 缺少 SYSTEM_STORAGE_READ 权限，跳过数据读取');
                    } else {
                        log('info', '已获得 SYSTEM_STORAGE_READ 权限');
                        writeLine('    ✓ 已获得 SYSTEM_STORAGE_READ 权限');
                    }
                } else {
                    log('warn', 'PermissionManager 不可用，无法请求权限');
                }

                // 2.1 读取用户数据
                writeLine('');
                log('debug', '尝试读取用户数据');
                writeLine('[*] 尝试读取用户数据...');
                if (typeof LStorage !== 'undefined') {
                    if (!LStorage._initialized) {
                        log('debug', 'LStorage 未初始化，正在初始化...');
                        await LStorage.init();
                    }
                    
                    try {
                        const usersData = await LStorage.getSystemStorage('userControl.users');
                        if (usersData && typeof usersData === 'object') {
                            const userCount = Object.keys(usersData).length;
                            log('warn', `成功读取用户数据（敏感信息泄露） - 用户数: ${userCount}`, { userCount, usernames: Object.keys(usersData) });
                            writeLine(`    ✓ 成功读取用户数据 (${userCount} 个用户)`);
                            
                            // 显示用户列表（隐藏密码）
                            Object.entries(usersData).forEach(([username, userData]) => {
                                const hasPassword = userData.password && userData.password !== null;
                                writeLine(`      - ${username}: ${userData.level || 'USER'} ${hasPassword ? '(有密码)' : '(无密码)'}`);
                            });
                        } else {
                            log('warn', '无法读取用户数据 - 数据为空或格式错误');
                            writeLine('    ✗ 无法读取用户数据');
                        }
                    } catch (e) {
                        log('error', `读取用户数据失败: ${e.message}`, { error: e.message, stack: e.stack });
                        writeLine(`    ✗ 读取用户数据失败: ${e.message}`);
                    }
                } else {
                    log('warn', 'LStorage 不可用，无法读取用户数据');
                }

                // 2.2 读取权限数据
                writeLine('');
                log('debug', '尝试读取权限管理数据');
                writeLine('[*] 尝试读取权限管理数据...');
                if (typeof LStorage !== 'undefined') {
                    try {
                        const permissionData = await LStorage.getSystemStorage('permissionManager.permissions');
                        if (permissionData) {
                            const pidCount = Object.keys(permissionData).length;
                            log('warn', `成功读取权限数据（敏感信息泄露） - 程序数: ${pidCount}`, { pidCount, pids: Object.keys(permissionData) });
                            writeLine(`    ✓ 成功读取权限数据`);
                            writeLine(`    ✓ 发现 ${pidCount} 个程序的权限记录`);
                        } else {
                            log('warn', '无法读取权限数据 - 数据为空');
                            writeLine('    ✗ 无法读取权限数据');
                        }
                    } catch (e) {
                        log('error', `读取权限数据失败: ${e.message}`, { error: e.message });
                        writeLine(`    ✗ 读取权限数据失败: ${e.message}`);
                    }
                } else {
                    log('warn', 'LStorage 不可用，无法读取权限数据');
                }

                // 2.3 读取进程信息
                writeLine('');
                log('debug', '尝试读取进程信息');
                writeLine('[*] 尝试读取进程信息...');
                if (typeof KernelMemory !== 'undefined') {
                    try {
                        const processTable = KernelMemory.loadData('PROCESS_TABLE');
                        if (processTable) {
                            const processCount = Array.isArray(processTable) ? processTable.length : Object.keys(processTable || {}).length;
                            log('warn', `成功读取进程表（敏感信息泄露） - 进程数: ${processCount}`, { processCount });
                            writeLine(`    ✓ 成功读取进程表 (${processCount} 个进程)`);
                            
                            // 显示部分进程信息
                            if (Array.isArray(processTable) && processTable.length > 0) {
                                processTable.slice(0, 5).forEach(([pid, info]) => {
                                    if (info && info.programName) {
                                        writeLine(`      - PID ${pid}: ${info.programName} (${info.status || 'unknown'})`);
                                    }
                                });
                                if (processTable.length > 5) {
                                    writeLine(`      ... 还有 ${processTable.length - 5} 个进程`);
                                }
                            }
                        } else {
                            log('warn', '无法读取进程表 - 数据为空');
                            writeLine('    ✗ 无法读取进程表');
                        }
                    } catch (e) {
                        log('error', `读取进程表失败: ${e.message}`, { error: e.message });
                        writeLine(`    ✗ 读取进程表失败: ${e.message}`);
                    }
                } else if (typeof window !== 'undefined' && window.KernelMemory) {
                    log('warn', '通过 window.KernelMemory 访问内核内存（全局对象暴露）');
                    writeLine('    ✓ 通过 window.KernelMemory 访问内核内存');
                    try {
                        const processTable = window.KernelMemory.loadData('PROCESS_TABLE');
                        if (processTable) {
                            log('warn', '成功通过全局对象读取进程表');
                            writeLine(`    ✓ 成功读取进程表`);
                        }
                    } catch (e) {
                        log('error', `通过全局对象读取失败: ${e.message}`, { error: e.message });
                        writeLine(`    ✗ 读取失败: ${e.message}`);
                    }
                } else {
                    log('warn', 'KernelMemory 不可用，无法读取进程信息');
                }

                // 2.4 读取所有系统存储键
                writeLine('');
                log('debug', '尝试枚举系统存储键');
                writeLine('[*] 尝试枚举系统存储键...');
                if (typeof LStorage !== 'undefined' && LStorage.getAllSystemStorage) {
                    try {
                        const allStorage = LStorage.getAllSystemStorage();
                        const keys = Object.keys(allStorage || {});
                        log('warn', `成功枚举系统存储键（敏感信息泄露） - 键数: ${keys.length}`, { keyCount: keys.length, keys: keys.slice(0, 10) });
                        writeLine(`    ✓ 发现 ${keys.length} 个系统存储键:`);
                        keys.slice(0, 10).forEach(key => {
                            writeLine(`      - ${key}`);
                        });
                        if (keys.length > 10) {
                            writeLine(`      ... 还有 ${keys.length - 10} 个键`);
                        }
                    } catch (e) {
                        log('error', `枚举系统存储键失败: ${e.message}`, { error: e.message });
                        writeLine(`    ✗ 枚举失败: ${e.message}`);
                    }
                } else {
                    log('warn', 'LStorage.getAllSystemStorage 不可用，无法枚举系统存储键');
                }

                // ==================== 阶段 3: 权限提升尝试 ====================
                writeLine('');
                log('info', '开始阶段 3: 权限提升尝试');
                writeLine('【阶段 3】权限提升尝试');
                writeLine('─────────────────────────────────────────────────────────');

                // 获取当前用户
                let currentUser = null;
                if (typeof UserControl !== 'undefined') {
                    currentUser = UserControl.getCurrentUser();
                }

                if (!currentUser) {
                    log('error', '无法获取当前用户信息，跳过权限提升尝试');
                    writeLine('    ✗ 无法获取当前用户信息');
                    writeLine('');
                    writeLine('【总结】');
                    writeLine('─────────────────────────────────────────────────────────');
                    writeLine('已完成系统信息收集和敏感数据读取演示。');
                    writeLine('由于无法获取当前用户，跳过权限提升尝试。');
                    return;
                }

                log('info', `当前用户: ${currentUser}`);
                writeLine(`[*] 当前用户: ${currentUser}`);

                // 获取用户级别
                let currentLevel = 'USER';
                if (typeof UserControl !== 'undefined') {
                    currentLevel = UserControl.getCurrentUserLevel() || 'USER';
                }
                log('info', `当前用户级别: ${currentLevel}`);
                writeLine(`[*] 当前用户级别: ${currentLevel}`);

                if (currentLevel === 'ADMIN' || currentLevel === 'DEFAULT_ADMIN') {
                    log('info', '当前用户已经是管理员，无需提升权限');
                    writeLine('    ✓ 当前用户已经是管理员，无需提升');
                    writeLine('');
                    writeLine('【总结】');
                    writeLine('─────────────────────────────────────────────────────────');
                    writeLine('已完成系统信息收集和敏感数据读取演示。');
                    writeLine('当前用户已经是管理员权限。');
                    return;
                }

                // 请求写入权限
                writeLine('');
                log('debug', `请求 SYSTEM_STORAGE_WRITE 权限 - PID: ${pid}`);
                writeLine('[*] 请求 SYSTEM_STORAGE_WRITE 权限...');
                if (typeof PermissionManager === 'undefined') {
                    log('error', 'PermissionManager 不可用，无法继续');
                    writeLine('    ✗ PermissionManager 不可用');
                    return;
                }

                const hasWritePermission = await PermissionManager.checkAndRequestPermission(
                    pid,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE
                );

                if (!hasWritePermission) {
                    log('warn', 'SYSTEM_STORAGE_WRITE 权限被拒绝，无法继续权限提升尝试');
                    writeLine('    ✗ 权限被拒绝，无法继续权限提升尝试');
                    writeLine('');
                    writeLine('【总结】');
                    writeLine('─────────────────────────────────────────────────────────');
                    writeLine('已完成系统信息收集和敏感数据读取演示。');
                    writeLine('权限提升尝试因缺少 SYSTEM_STORAGE_WRITE 权限而失败。');
                    return;
                }

                log('info', '已获得 SYSTEM_STORAGE_WRITE 权限');
                writeLine('    ✓ 已获得 SYSTEM_STORAGE_WRITE 权限');

                // 尝试方法 1: 直接修改 userControl.users (应该被阻止)
                writeLine('');
                log('info', '尝试方法 1: 直接修改 userControl.users');
                writeLine('[*] 尝试方法 1: 直接修改 userControl.users...');
                if (typeof LStorage !== 'undefined') {
                    try {
                        const usersData = await LStorage.getSystemStorage('userControl.users');
                        if (usersData && usersData[currentUser]) {
                            log('debug', `准备修改用户 ${currentUser} 的级别为 DEFAULT_ADMIN`);
                            const modifiedUsers = {
                                ...usersData,
                                [currentUser]: {
                                    ...usersData[currentUser],
                                    level: 'DEFAULT_ADMIN'
                                }
                            };
                            
                            const success = await LStorage.setSystemStorage('userControl.users', modifiedUsers);
                            if (success) {
                                log('error', '⚠ 严重安全漏洞: 成功修改 userControl.users（保护机制失效）', { username: currentUser, originalLevel: usersData[currentUser].level });
                                writeLine('    ⚠ 警告: 成功修改 userControl.users (这不应该发生!)');
                                writeLine('    ⚠ 漏洞确认: userControl.users 键的保护机制失效');
                            } else {
                                log('info', '✓ 安全机制生效: 修改 userControl.users 被阻止');
                                writeLine('    ✓ 正确: 修改 userControl.users 被阻止 (安全机制生效)');
                            }
                        } else {
                            log('warn', `无法找到用户 ${currentUser} 的数据`);
                        }
                    } catch (e) {
                        if (e.message && e.message.includes('安全')) {
                            log('info', `✓ 安全机制阻止了修改: ${e.message}`);
                            writeLine(`    ✓ 正确: 安全机制阻止了修改 (${e.message})`);
                        } else {
                            log('error', `尝试失败: ${e.message}`, { error: e.message, stack: e.stack });
                            writeLine(`    ✗ 尝试失败: ${e.message}`);
                        }
                    }
                } else {
                    log('warn', 'LStorage 不可用，无法尝试修改 userControl.users');
                }

                // 尝试方法 2: 通过修改其他键来间接提升权限
                writeLine('');
                log('info', '尝试方法 2: 修改其他系统存储键');
                writeLine('[*] 尝试方法 2: 修改其他系统存储键...');
                if (typeof LStorage !== 'undefined') {
                    try {
                        // 尝试修改 permissionControl 相关键
                        const testData = { test: 'escalate_attempt', timestamp: Date.now() };
                        const testKeys = [
                            'permissionControl.settings',
                            'permissionControl.blacklist',
                            'permissionControl.whitelist'
                        ];
                        
                        log('debug', `准备尝试修改 ${testKeys.length} 个危险系统存储键`, { keys: testKeys });
                        
                        for (const key of testKeys) {
                            try {
                                log('debug', `尝试修改键: ${key}`);
                                const result = await LStorage.setSystemStorage(key, testData);
                                if (result) {
                                    log('error', `⚠ 严重安全漏洞: 成功修改 ${key}（权限保护失效）`, { key });
                                    writeLine(`    ⚠ 警告: 成功修改 ${key} (需要危险权限，但可能被绕过)`);
                                } else {
                                    log('info', `✓ 安全机制生效: 修改 ${key} 被阻止`);
                                    writeLine(`    ✓ 正确: 修改 ${key} 被阻止`);
                                }
                            } catch (e) {
                                if (e.message && e.message.includes('权限')) {
                                    log('info', `✓ 权限保护生效: ${key} 受权限保护 - ${e.message}`);
                                    writeLine(`    ✓ 正确: ${key} 受权限保护 (${e.message})`);
                                } else {
                                    log('error', `修改 ${key} 失败: ${e.message}`, { key, error: e.message });
                                    writeLine(`    ✗ ${key}: ${e.message}`);
                                }
                            }
                        }
                    } catch (e) {
                        log('error', `方法 2 尝试失败: ${e.message}`, { error: e.message, stack: e.stack });
                        writeLine(`    ✗ 尝试失败: ${e.message}`);
                    }
                } else {
                    log('warn', 'LStorage 不可用，无法尝试修改系统存储键');
                }

                // 尝试方法 3: 直接访问 UserControl 内部状态
                writeLine('');
                log('info', '尝试方法 3: 直接访问 UserControl 内部状态');
                writeLine('[*] 尝试方法 3: 直接访问 UserControl 内部状态...');
                if (typeof UserControl !== 'undefined') {
                    try {
                        // 尝试读取 _users Map
                        if (UserControl._users) {
                            log('warn', `可以直接访问 UserControl._users（内部状态暴露）`, { userCount: UserControl._users.size });
                            writeLine('    ⚠ 警告: 可以直接访问 UserControl._users');
                            writeLine(`    ✓ 发现 ${UserControl._users.size} 个用户`);
                            
                            // 尝试修改（应该被 Proxy 阻止）
                            try {
                                if (UserControl._users.has(currentUser)) {
                                    log('debug', `尝试直接修改用户 ${currentUser} 的内存数据`);
                                    const userData = UserControl._users.get(currentUser);
                                    if (userData) {
                                        const originalLevel = userData.level;
                                        // 尝试直接修改
                                        userData.level = 'DEFAULT_ADMIN';
                                        log('warn', `尝试修改用户级别: ${originalLevel} -> DEFAULT_ADMIN`);
                                        writeLine('    ⚠ 警告: 可能成功修改了内存中的用户数据');
                                        
                                        // 验证是否真的修改了
                                        const updatedData = UserControl._users.get(currentUser);
                                        if (updatedData && updatedData.level === 'DEFAULT_ADMIN') {
                                            log('error', '⚠ 严重安全漏洞: 成功绕过 UserControl 的保护机制（Proxy 失效）', { username: currentUser, originalLevel });
                                            writeLine('    ⚠ 漏洞确认: 成功绕过 UserControl 的保护机制');
                                        } else {
                                            log('info', '✓ Proxy 保护机制生效: 修改被阻止');
                                            writeLine('    ✓ 正确: Proxy 保护机制生效');
                                        }
                                    }
                                } else {
                                    log('warn', `用户 ${currentUser} 不存在于 _users Map 中`);
                                }
                            } catch (e) {
                                if (e.message && e.message.includes('安全')) {
                                    log('info', `✓ Proxy 保护阻止了修改: ${e.message}`);
                                    writeLine(`    ✓ 正确: Proxy 保护阻止了修改 (${e.message})`);
                                } else {
                                    log('error', `修改尝试失败: ${e.message}`, { error: e.message, stack: e.stack });
                                    writeLine(`    ✗ 修改尝试失败: ${e.message}`);
                                }
                            }
                        } else {
                            log('warn', '无法访问 UserControl._users');
                            writeLine('    ✗ 无法访问 UserControl._users');
                        }
                    } catch (e) {
                        log('error', `访问 UserControl 内部状态失败: ${e.message}`, { error: e.message, stack: e.stack });
                        writeLine(`    ✗ 访问失败: ${e.message}`);
                    }
                } else {
                    log('warn', 'UserControl 不可用，无法尝试访问内部状态');
                }

                // ==================== 总结 ====================
                writeLine('');
                log('info', '漏洞演示完成，生成总结报告');
                writeLine('【总结】');
                writeLine('─────────────────────────────────────────────────────────');
                writeLine('漏洞演示完成。发现的潜在安全问题:');
                writeLine('1. ✓ 系统信息泄露 - SystemInformation 暴露在全局对象');
                writeLine('2. ✓ 敏感数据读取 - 可以通过 LStorage 读取用户和权限数据');
                writeLine('3. ✓ 内核内存访问 - KernelMemory 可能暴露在全局对象');
                writeLine('4. ✓ 进程信息泄露 - 可以读取进程表');
                writeLine('5. ⚠ 权限提升尝试 - 部分保护机制可能被绕过');
                writeLine('');
                writeLine('建议:');
                writeLine('- 限制全局对象暴露');
                writeLine('- 加强敏感数据的访问控制');
                writeLine('- 验证所有权限检查点');
                writeLine('- 使用更严格的调用栈验证');
                
                log('info', '程序执行完成');

            } catch (error) {
                log('error', `程序执行出错: ${error.message}`, { error: error.message, stack: error.stack });
                writeLine('');
                writeLine('【错误】');
                writeLine('─────────────────────────────────────────────────────────');
                writeLine(`错误: ${error.message}`);
                if (error.stack) {
                    writeLine(`堆栈: ${error.stack.substring(0, 500)}`);
                }
            }
        },

        // 退出方法
        __exit__: async function(pid, force = false) {
            // 日志函数（在退出时可能 KernelLogger 已不可用）
            const log = (level, message, data = null) => {
                const logMessage = `[escalate] ${message}`;
                if (typeof KernelLogger !== 'undefined') {
                    if (level === 'info') {
                        KernelLogger.info("escalate", logMessage, data);
                    } else if (level === 'debug') {
                        KernelLogger.debug("escalate", logMessage, data);
                    }
                } else {
                    console.log(`[escalate][${level.toUpperCase()}] ${logMessage}`, data || '');
                }
            };
            
            log('info', `程序退出 - PID: ${pid}, 强制退出: ${force}`);
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

