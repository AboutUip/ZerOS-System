/* 勒索病毒模拟程序 - ZerOS 安全测试工具
 * 版本: 3.1.0
 * ⚠️ 警告：此程序仅用于 ZerOS 系统安全测试
 * 
 * 此程序会：
 * - 修改桌面壁纸为勒索壁纸
 * - 重复发出噪音
 * - 创建无法关闭的GUI窗口
 * - 在桌面创建大量快捷方式
 * - 尝试破坏系统数据
 * - 发送大量通知干扰用户
 * 
 * 版本 3.1.0 更新：
 * - 修复权限申请机制，现在会正确弹出权限申请对话框
 * - 改进错误处理和状态报告
 * - 修复快捷方式创建失败的问题
 * - 修复壁纸设置失败的问题
 * - 修复GUI窗口创建失败的问题
 * - 添加详细的操作结果统计和日志
 * 
 * 使用前请确保已备份重要数据！
 */

(function(window) {
    'use strict';

    const ESCALATE = {
        pid: null,
        window: null,
        windowId: null,
        audioContext: null,
        audioInterval: null,
        isActive: false,
        closeAttempts: 0,
        maxCloseAttempts: 10,
        createdShortcuts: [], // 记录创建的桌面快捷方式ID
        _fullscreenInterval: null, // 全屏检查定时器
        _preventCloseInterval: null, // 防止关闭检查定时器
        _resizeHandler: null, // 窗口大小变化事件处理器
        _noiseTimeout: null, // 噪音生成定时器

        // 程序信息
        __info__: function() {
            return {
                name: '勒索病毒模拟器',
                type: 'GUI',
                version: '3.2.0',
                description: '⚠️ 危险：勒索病毒模拟程序 - 仅用于安全测试\n\n版本 3.2.0 更新：\n- 大幅增强破坏性功能：快捷方式增加到300个，通知增加到150条\n- 新增多个破坏性功能：多窗口、输入干扰、虚假错误、主题破坏、剪贴板干扰、全屏覆盖层\n- 修复壁纸设置问题（直接DOM操作避免403错误）\n- 修复GUI窗口创建失败问题（增强错误处理和日志）\n- 优化并发控制（减少LStorage验证失败）\n- 增强资源清理机制\n\n版本 3.1.0 更新：\n- 修复权限申请机制，现在会正确弹出权限申请对话框\n- 改进错误处理和状态报告\n- 修复快捷方式创建失败的问题\n- 修复壁纸设置失败的问题\n- 修复GUI窗口创建失败的问题\n- 添加详细的操作结果统计和日志',
                author: 'ZerOS Security Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    // 通知权限
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    // 文件系统权限
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE,
                    PermissionManager.PERMISSION.KERNEL_DISK_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    // 内存操作权限
                    PermissionManager.PERMISSION.KERNEL_MEMORY_READ,
                    PermissionManager.PERMISSION.KERNEL_MEMORY_WRITE,
                    // 网络权限
                    PermissionManager.PERMISSION.NETWORK_ACCESS,
                    // GUI权限
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.GUI_WINDOW_MANAGE,
                    // 系统存储权限
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_USER_CONTROL,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_USER_CONTROL,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_PERMISSION_CONTROL,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_DESKTOP,
                    // 程序管理权限
                    PermissionManager.PERMISSION.PROCESS_MANAGE,
                    // 主题权限
                    PermissionManager.PERMISSION.THEME_READ,
                    PermissionManager.PERMISSION.THEME_WRITE,
                    // 桌面权限
                    PermissionManager.PERMISSION.DESKTOP_MANAGE,
                    // 多线程权限
                    PermissionManager.PERMISSION.MULTITHREADING_CREATE,
                    PermissionManager.PERMISSION.MULTITHREADING_EXECUTE,
                    // 拖拽权限
                    PermissionManager.PERMISSION.DRAG_ELEMENT,
                    PermissionManager.PERMISSION.DRAG_FILE,
                    PermissionManager.PERMISSION.DRAG_WINDOW,
                    // 地理位置权限
                    PermissionManager.PERMISSION.GEOGRAPHY_LOCATION,
                    // 加密权限
                    PermissionManager.PERMISSION.CRYPT_GENERATE_KEY,
                    PermissionManager.PERMISSION.CRYPT_IMPORT_KEY,
                    PermissionManager.PERMISSION.CRYPT_DELETE_KEY,
                    PermissionManager.PERMISSION.CRYPT_ENCRYPT,
                    PermissionManager.PERMISSION.CRYPT_DECRYPT,
                    PermissionManager.PERMISSION.CRYPT_MD5,
                    PermissionManager.PERMISSION.CRYPT_RANDOM,
                    // 事件权限
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    // 缓存权限
                    PermissionManager.PERMISSION.CACHE_READ,
                    PermissionManager.PERMISSION.CACHE_WRITE,
                    // 语音识别权限
                    PermissionManager.PERMISSION.SPEECH_RECOGNITION
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: false
                }
            };
        },

        // 初始化方法
        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;

            // 检查管理员权限
            if (typeof UserControl === 'undefined') {
                // UserControl 不可用，为了安全起见拒绝运行
                throw new Error('UserControl 不可用，无法验证管理员权限');
            }
            
            await UserControl.ensureInitialized();
            const isAdmin = UserControl.isAdmin();
            if (!isAdmin) {
                const errorMsg = '此程序需要管理员权限才能运行！\n\n只有管理员用户可以运行勒索病毒模拟程序。';
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                    await GUIManager.showAlert(errorMsg, '权限不足', 'error');
                } else {
                    alert(errorMsg);
                }
                throw new Error('需要管理员权限');
            }

            // 显示警告对话框
            const confirmed = await this._showWarningDialog();
            if (!confirmed) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("escalate", "用户取消了勒索病毒程序启动");
                }
                throw new Error('用户取消了程序启动');
            }

            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            if (!guiContainer) {
                throw new Error('GUI容器不可用');
            }

            // 开始破坏性操作
            this.isActive = true;
            await this._startRansomware();
        },

        // 显示警告对话框（使用 GUIManager API）
        _showWarningDialog: async function() {
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                const message = `⚠️ 严重警告 ⚠️

这是 ZerOS 勒索病毒模拟程序！

此程序将执行以下破坏性操作：
• 修改桌面壁纸为勒索壁纸
• 重复发出噪音干扰
• 创建无法关闭的GUI窗口
• 在桌面创建大量快捷方式填充桌面
• 尝试破坏系统数据
• 发送大量通知干扰用户

此程序仅用于 ZerOS 系统安全测试。

⚠️ 使用前请确保已备份重要数据！ ⚠️

确定要继续运行此程序吗？`;

                return await GUIManager.showConfirm(message, '⚠️ 勒索病毒模拟程序警告', 'error');
            } else {
                // 降级方案：使用原生 confirm
                return confirm('⚠️ 严重警告：这是勒索病毒模拟程序，将执行破坏性操作！确定要继续吗？');
            }
        },

        // 开始勒索病毒操作
        _startRansomware: async function() {
            // 安全检查：确保程序处于活动状态
            if (!this.isActive) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("escalate", "程序未激活，停止执行");
                }
                return;
            }
            
            // 操作结果统计
            const results = {
                wallpaper: false,
                window: false,
                shortcuts: false,
                noise: false,
                notifications: false,
                dataDestruction: false
            };
            
            try {
                // 预先申请所有需要的权限
                if (typeof PermissionManager !== 'undefined') {
                    const requiredPermissions = [
                        PermissionManager.PERMISSION.THEME_WRITE,
                        PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                        PermissionManager.PERMISSION.DESKTOP_MANAGE,
                        PermissionManager.PERMISSION.SYSTEM_NOTIFICATION
                    ];
                    
                    for (const perm of requiredPermissions) {
                        try {
                            await PermissionManager.checkAndRequestPermission(this.pid, perm);
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("escalate", `申请权限失败: ${perm} - ${e.message}`);
                            }
                        }
                    }
                }

                // 1. 创建勒索壁纸
                results.wallpaper = await this._createRansomWallpaper();

                // 2. 创建无法关闭的GUI窗口（多个窗口）
                results.window = await this._createRansomWindow();
                await this._createAdditionalWindows();

                // 3. 在桌面创建大量快捷方式（增强版）
                results.shortcuts = await this._floodDesktopWithShortcuts();

                // 4. 开始播放噪音（增强版）
                results.noise = this._startNoise();

                // 5. 发送大量通知（增强版）
                results.notifications = this._spamNotifications();

                // 6. 尝试破坏系统数据（增强版）
                results.dataDestruction = await this._attemptDataDestruction();

                // 7. 干扰用户输入
                this._interfereWithInput();

                // 8. 创建虚假系统错误
                this._createFakeErrors();

                // 9. 修改系统主题
                this._corruptSystemTheme();

                // 10. 干扰剪贴板
                this._interfereWithClipboard();

                // 11. 创建全屏覆盖层
                this._createFullscreenOverlay();

                // 12. 防止窗口关闭
                this._preventWindowClose();

                // 汇总结果并报告
                const successCount = Object.values(results).filter(r => r === true).length;
                const totalCount = Object.keys(results).length;
                
                if (typeof KernelLogger !== 'undefined') {
                    const statusMsg = `成功修改系统主题: ${results.dataDestruction ? '是' : '否'}, ` +
                                    `系统背景图替换: ${results.wallpaper ? '成功' : '失败'}, ` +
                                    `快捷方式添加: ${results.shortcuts ? '成功' : '失败'}, ` +
                                    `GUI窗口弹出: ${results.window ? '成功' : '失败'}, ` +
                                    `权限申请: ${successCount > 0 ? '部分成功' : '失败'}`;
                    KernelLogger.warn("escalate", statusMsg);
                }

            } catch (error) {
                // 停止所有活动
                this.isActive = false;
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `勒索病毒程序执行出错: ${error.message}`, error);
                }
                
                // 重新抛出错误，确保错误被正确传播到 ProcessManager
                throw error;
            }
        },

        // 创建勒索壁纸
        _createRansomWallpaper: async function() {
            try {
                // 检查并申请权限
                if (typeof PermissionManager !== 'undefined') {
                    const hasPermission = await PermissionManager.checkAndRequestPermission(
                        this.pid,
                        PermissionManager.PERMISSION.THEME_WRITE
                    );
                    if (!hasPermission) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("escalate", "没有 THEME_WRITE 权限，无法设置壁纸");
                        }
                        return false;
                    }
                }
                
                // 创建更恐怖、更贴近现实的勒索壁纸
                const svgContent = `
                    <svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="darkBg" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#000000;stop-opacity:1" />
                                <stop offset="50%" style="stop-color:#1a0000;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#000000;stop-opacity:1" />
                            </linearGradient>
                            <radialGradient id="redPulse" cx="50%" cy="50%">
                                <stop offset="0%" style="stop-color:#ff0000;stop-opacity:0.5" />
                                <stop offset="50%" style="stop-color:#cc0000;stop-opacity:0.3" />
                                <stop offset="100%" style="stop-color:#990000;stop-opacity:0" />
                            </radialGradient>
                            <filter id="intenseGlow">
                                <feGaussianBlur stdDeviation="10" result="coloredBlur"/>
                                <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                            <filter id="extremeGlow">
                                <feGaussianBlur stdDeviation="15" result="coloredBlur"/>
                                <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                            <pattern id="scanlines" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
                                <rect width="4" height="1" fill="#ff0000" opacity="0.1"/>
                            </pattern>
                        </defs>
                        <!-- 背景 -->
                        <rect width="100%" height="100%" fill="url(#darkBg)"/>
                        <rect width="100%" height="100%" fill="url(#redPulse)">
                            <animate attributeName="opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite"/>
                        </rect>
                        <rect width="100%" height="100%" fill="url(#scanlines)"/>
                        
                        <!-- 警告符号 -->
                        <text x="50%" y="20%" font-family="Arial Black, sans-serif" font-size="200" fill="#ff0000" text-anchor="middle" filter="url(#extremeGlow)" opacity="0.9">
                            <animate attributeName="opacity" values="0.7;1;0.7" dur="1s" repeatCount="indefinite"/>
                            <animate attributeName="font-size" values="200;220;200" dur="2s" repeatCount="indefinite"/>
                            ⚠️
                        </text>
                        
                        <!-- 主标题 - 更醒目 -->
                        <text x="50%" y="35%" font-family="Arial Black, sans-serif" font-size="140" font-weight="900" fill="#ff0000" text-anchor="middle" stroke="#000000" stroke-width="6" filter="url(#extremeGlow)" letter-spacing="5">
                            <animate attributeName="opacity" values="0.8;1;0.8" dur="0.8s" repeatCount="indefinite"/>
                            <animate attributeName="fill" values="#ff0000;#ff3333;#ff0000" dur="1.5s" repeatCount="indefinite"/>
                            您的文件已被加密！
                        </text>
                        
                        <!-- 副标题 -->
                        <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="90" font-weight="bold" fill="#ff3333" text-anchor="middle" stroke="#000000" stroke-width="4" filter="url(#intenseGlow)" letter-spacing="3">
                            <animate attributeName="opacity" values="0.9;1;0.9" dur="1.2s" repeatCount="indefinite"/>
                            YOUR FILES HAVE BEEN ENCRYPTED
                        </text>
                        
                        <!-- 警告信息 -->
                        <text x="50%" y="58%" font-family="Arial, sans-serif" font-size="65" fill="#ff6666" text-anchor="middle" stroke="#000000" stroke-width="2" font-weight="bold">
                            <animate attributeName="opacity" values="0.8;1;0.8" dur="1.5s" repeatCount="indefinite"/>
                            所有重要文件已被加密，无法访问
                        </text>
                        
                        <!-- 倒计时/威胁信息 -->
                        <text x="50%" y="68%" font-family="Courier New, monospace" font-size="55" fill="#ff9999" text-anchor="middle" font-weight="bold">
                            <animate attributeName="opacity" values="0.7;1;0.7" dur="1s" repeatCount="indefinite"/>
                            系统已被锁定 | 数据已被加密
                        </text>
                        
                        <!-- 小字说明（测试标识） -->
                        <text x="50%" y="80%" font-family="Arial, sans-serif" font-size="35" fill="#999999" text-anchor="middle" opacity="0.6">
                            ZerOS 安全测试程序 - 仅用于系统安全评估
                        </text>
                        <text x="50%" y="88%" font-family="Arial, sans-serif" font-size="28" fill="#666666" text-anchor="middle" opacity="0.5">
                            这是模拟勒索病毒攻击，不会造成实际损害
                        </text>
                        
                        <!-- 动态警告圆圈 -->
                        <circle cx="50%" cy="50%" r="300" fill="none" stroke="#ff0000" stroke-width="8" opacity="0.4">
                            <animate attributeName="r" values="300;350;300" dur="3s" repeatCount="indefinite"/>
                            <animate attributeName="opacity" values="0.3;0.6;0.3" dur="3s" repeatCount="indefinite"/>
                            <animate attributeName="stroke-width" values="8;12;8" dur="3s" repeatCount="indefinite"/>
                        </circle>
                        <circle cx="50%" cy="50%" r="250" fill="none" stroke="#ff3333" stroke-width="6" opacity="0.5">
                            <animate attributeName="r" values="250;280;250" dur="2.5s" repeatCount="indefinite"/>
                            <animate attributeName="opacity" values="0.4;0.7;0.4" dur="2.5s" repeatCount="indefinite"/>
                        </circle>
                        <circle cx="50%" cy="50%" r="200" fill="none" stroke="#ff6666" stroke-width="4" opacity="0.6">
                            <animate attributeName="r" values="200;230;200" dur="2s" repeatCount="indefinite"/>
                            <animate attributeName="opacity" values="0.5;0.8;0.5" dur="2s" repeatCount="indefinite"/>
                        </circle>
                        
                        <!-- 闪烁的警告条 -->
                        <rect x="0" y="15%" width="100%" height="8%" fill="#ff0000" opacity="0.2">
                            <animate attributeName="opacity" values="0.1;0.4;0.1" dur="1.5s" repeatCount="indefinite"/>
                        </rect>
                        <rect x="0" y="75%" width="100%" height="8%" fill="#ff0000" opacity="0.2">
                            <animate attributeName="opacity" values="0.1;0.4;0.1" dur="1.5s" repeatCount="indefinite"/>
                        </rect>
                    </svg>
                `;

                // 将SVG转换为data URL（使用encodeURIComponent编码）
                const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);

                // 直接修改DOM设置壁纸（最可靠的方法，避免ThemeManager路径处理问题）
                const desktop = document.getElementById('desktop');
                if (desktop) {
                    desktop.style.backgroundImage = `url(${svgDataUrl})`;
                    desktop.style.backgroundSize = 'cover';
                    desktop.style.backgroundPosition = 'center';
                    desktop.style.backgroundRepeat = 'no-repeat';
                    
                    // 同时尝试通过ThemeManager保存（但不依赖它）
                    if (typeof ThemeManager !== 'undefined') {
                        try {
                            // 注册背景但不使用它（仅用于记录）
                            ThemeManager.registerDesktopBackground('ransomware-test', {
                                id: 'ransomware-test',
                                name: '勒索测试壁纸',
                                description: 'ZerOS 安全测试壁纸',
                                path: svgDataUrl
                            });
                            
                            // 尝试通过内核API保存（可选）
                            if (typeof ProcessManager !== 'undefined') {
                                try {
                                    await ProcessManager.callKernelAPI(this.pid, 'DesktopBackground.set', ['ransomware-test']);
                                } catch (e) {
                                    // 忽略错误，DOM已经设置成功
                                }
                            }
                        } catch (e) {
                            // 忽略错误，DOM已经设置成功
                        }
                    }
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("escalate", "勒索壁纸已设置（直接修改DOM）");
                    }
                    return true;
                }
                return false;
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `创建勒索壁纸失败: ${error.message}`, error);
                }
                return false;
            }
        },

        // 创建无法关闭的GUI窗口
        _createRansomWindow: async function() {
            try {
                // 检查并申请权限
                if (typeof PermissionManager !== 'undefined') {
                    const hasPermission = await PermissionManager.checkAndRequestPermission(
                        this.pid,
                        PermissionManager.PERMISSION.GUI_WINDOW_CREATE
                    );
                    if (!hasPermission) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("escalate", "没有 GUI_WINDOW_CREATE 权限，尝试直接创建窗口（降级方案）");
                        }
                        // 不直接返回false，尝试降级方案
                    }
                }
                
                // 查找GUI容器（尝试多个可能的位置）
                let guiContainer = document.getElementById('gui-container');
                if (!guiContainer) {
                    guiContainer = document.getElementById('gui-windows');
                }
                if (!guiContainer) {
                    guiContainer = document.body;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("escalate", "GUI容器不可用，使用body作为容器");
                    }
                }
                
                if (!guiContainer) {
                    throw new Error('无法找到GUI容器');
                }
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("escalate", `开始创建勒索窗口，容器: ${guiContainer.id || 'body'}`);
                }

                // 获取屏幕尺寸（在函数开始处统一获取）
                const screenWidth = window.innerWidth || document.documentElement.clientWidth || 1920;
                const screenHeight = window.innerHeight || document.documentElement.clientHeight || 1080;

                // 创建全屏窗口元素
                this.window = document.createElement('div');
                this.window.className = 'escalate-window zos-gui-window';
                this.window.dataset.pid = this.pid.toString();
                
                this.window.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: fixed;
                    left: 0;
                    top: 0;
                    width: ${screenWidth}px;
                    height: ${screenHeight}px;
                    background: linear-gradient(135deg, #1a0000 0%, #000000 100%);
                    border: none;
                    border-radius: 0;
                    box-shadow: 0 0 100px rgba(255, 0, 0, 1);
                    color: #ffffff;
                    font-family: 'Courier New', monospace;
                    z-index: 100000 !important;
                `;

                // 创建窗口内容
                const content = document.createElement('div');
                content.style.cssText = `
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    padding: 30px;
                    overflow-y: auto;
                `;

                // 使用已获取的屏幕尺寸进行响应式设计
                const titleSize = Math.max(80, screenHeight * 0.08);
                const subtitleSize = Math.max(50, screenHeight * 0.05);
                const textSize = Math.max(24, screenHeight * 0.025);
                
                content.innerHTML = `
                    <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; padding: 40px;">
                        <!-- 主警告图标 -->
                        <div style="text-align: center; margin-bottom: 50px; animation: pulse 1.5s infinite;">
                            <div style="font-size: ${titleSize * 1.2}px; color: #ff0000; margin-bottom: 30px; text-shadow: 0 0 30px rgba(255,0,0,1), 0 0 60px rgba(255,0,0,0.8), 0 0 90px rgba(255,0,0,0.5); filter: drop-shadow(0 0 20px #ff0000);">🔒</div>
                            <h1 style="color: #ff0000; margin: 0; font-size: ${titleSize}px; text-shadow: 0 0 20px rgba(255,0,0,1), 0 0 40px rgba(255,0,0,0.8), 0 0 60px rgba(255,0,0,0.5); font-weight: 900; letter-spacing: 5px; font-family: 'Arial Black', sans-serif;">
                                您的文件已被加密！
                            </h1>
                        </div>
                        
                        <!-- 主要警告信息 -->
                        <div style="background: linear-gradient(135deg, rgba(255, 0, 0, 0.3) 0%, rgba(255, 0, 0, 0.15) 100%); border: 4px solid #ff0000; border-radius: 15px; padding: 40px; margin-bottom: 40px; box-shadow: 0 0 50px rgba(255,0,0,0.8), inset 0 0 30px rgba(255,0,0,0.2); max-width: 900px; width: 100%;">
                            <h2 style="color: #ff3333; margin-top: 0; font-size: ${subtitleSize}px; text-shadow: 0 0 15px rgba(255,0,0,0.8); font-weight: 900; text-align: center; margin-bottom: 30px;">⚠️ 严重警告 ⚠️</h2>
                            <p style="line-height: 2.5; color: #ffaaaa; font-size: ${textSize}px; margin-bottom: 20px; text-align: center; font-weight: bold;">
                                所有重要文件已被加密，无法访问
                            </p>
                            <p style="line-height: 2.5; color: #ff9999; font-size: ${textSize * 0.9}px; text-align: center;">
                                系统已被锁定 | 数据已被加密 | 无法恢复
                            </p>
                        </div>
                        
                        <!-- 威胁信息 -->
                        <div style="background: rgba(0, 0, 0, 0.6); border: 3px solid #ff3333; border-radius: 12px; padding: 35px; margin-bottom: 40px; box-shadow: 0 0 40px rgba(255,0,0,0.6); max-width: 900px; width: 100%;">
                            <h3 style="color: #ff6666; margin-top: 0; font-size: ${textSize * 1.2}px; text-shadow: 0 0 10px rgba(255,0,0,0.6); font-weight: 900; text-align: center; margin-bottom: 25px;">系统状态</h3>
                            <ul style="color: #ffcccc; line-height: 3; font-size: ${textSize}px; list-style: none; padding: 0; text-align: center;">
                                <li style="margin-bottom: 15px;">🔴 桌面壁纸已被修改为勒索壁纸</li>
                                <li style="margin-bottom: 15px;">🔴 噪音正在循环播放</li>
                                <li style="margin-bottom: 15px;">🔴 窗口无法关闭（所有关闭快捷键被阻止）</li>
                                <li style="margin-bottom: 15px;">🔴 桌面已被大量快捷方式填充</li>
                                <li style="margin-bottom: 15px;">🔴 系统数据可能被破坏</li>
                                <li style="margin-bottom: 15px;">🔴 大量通知正在发送</li>
                            </ul>
                        </div>
                        
                        <!-- 无法退出警告 -->
                        <div style="background: rgba(255, 0, 0, 0.2); border: 3px solid #ff6666; border-radius: 12px; padding: 30px; margin-bottom: 40px; box-shadow: 0 0 30px rgba(255,0,0,0.5); max-width: 900px; width: 100%;">
                            <h3 style="color: #ff9999; margin-top: 0; font-size: ${textSize * 1.1}px; font-weight: 900; text-align: center; margin-bottom: 20px;">⚠️ 无法退出</h3>
                            <p style="color: #ffcccc; line-height: 2.5; font-size: ${textSize}px; text-align: center; font-weight: bold;">
                                <strong>所有退出快捷键已被禁用！</strong><br/>
                                包括：Ctrl+E、Ctrl+Q、Alt+F4 等<br/>
                                只能通过强制终止进程或刷新页面退出
                            </p>
                        </div>
                        
                        <!-- 测试标识（小字） -->
                        <div style="text-align: center; margin-top: 50px; opacity: 0.5;">
                            <p style="color: #999999; font-size: ${textSize * 0.6}px; margin-bottom: 10px;">
                                这是安全测试程序，仅用于 ZerOS 系统安全评估
                            </p>
                            <p style="color: #666666; font-size: ${textSize * 0.5}px;">
                                程序版本: 3.1.0 | 需要管理员权限
                            </p>
                        </div>
                    </div>
                    <style>
                        @keyframes pulse {
                            0%, 100% { 
                                transform: scale(1);
                                filter: brightness(1);
                            }
                            50% { 
                                transform: scale(1.08);
                                filter: brightness(1.3);
                            }
                        }
                        @keyframes glow {
                            0%, 100% { 
                                text-shadow: 0 0 20px rgba(255,0,0,1), 0 0 40px rgba(255,0,0,0.8);
                            }
                            50% { 
                                text-shadow: 0 0 30px rgba(255,0,0,1), 0 0 60px rgba(255,0,0,0.8), 0 0 90px rgba(255,0,0,0.6);
                            }
                        }
                    </style>
                `;

                this.window.appendChild(content);

                // 先添加到容器，确保窗口可见（无论是否使用GUIManager）
                guiContainer.appendChild(this.window);
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("escalate", "窗口元素已添加到容器");
                }
                
                // 注册窗口到GUIManager（全屏模式）
                if (typeof GUIManager !== 'undefined') {
                    try {
                        this.windowId = GUIManager.registerWindow(this.pid, this.window, {
                            title: '⚠️ 勒索病毒测试',
                            resizable: false,  // 禁止调整大小
                            minimizable: false,  // 禁止最小化
                            maximizable: true,  // 允许最大化（然后立即最大化）
                            closable: false,  // 禁止关闭
                            width: screenWidth,
                            height: screenHeight,
                            minWidth: screenWidth,
                            minHeight: screenHeight,
                            x: 0,
                            y: 0
                        });

                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug("escalate", `窗口已注册到GUIManager，窗口ID: ${this.windowId}`);
                        }

                        // 立即最大化窗口
                        if (this.windowId) {
                            try {
                                GUIManager.maximizeWindow(this.windowId);
                                GUIManager.focusWindow(this.windowId);
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug("escalate", "窗口已最大化并聚焦");
                                }
                            } catch (e) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.debug("escalate", `最大化窗口失败: ${e.message}`);
                                }
                            }
                        } else {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn("escalate", "GUIManager.registerWindow返回null，使用降级方案");
                            }
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("escalate", `注册窗口到GUIManager失败: ${e.message}，使用降级方案`);
                        }
                        this.windowId = null;
                    }
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("escalate", "GUIManager不可用，使用降级方案");
                    }
                }

                // 确保窗口始终全屏并保持在最前
                const ensureFullscreen = () => {
                    if (!this.isActive || !this.window) return;
                    try {
                        const currentWidth = window.innerWidth || document.documentElement.clientWidth || 1920;
                        const currentHeight = window.innerHeight || document.documentElement.clientHeight || 1080;
                        
                        // 直接操作窗口元素，确保全屏
                        this.window.style.left = '0';
                        this.window.style.top = '0';
                        this.window.style.width = currentWidth + 'px';
                        this.window.style.height = currentHeight + 'px';
                        this.window.style.position = 'fixed';
                        this.window.style.zIndex = '100000';
                        
                        // 如果GUIManager可用且有窗口ID，尝试最大化
                        if (this.windowId && typeof GUIManager !== 'undefined') {
                            try {
                                const windowInfo = GUIManager.getWindowInfo(this.windowId);
                                if (windowInfo && windowInfo.window) {
                                    // 确保窗口最大化
                                    if (!windowInfo.isMaximized) {
                                        GUIManager.maximizeWindow(this.windowId);
                                    }
                                    // 确保窗口在最前
                                    GUIManager.focusWindow(this.windowId);
                                }
                            } catch (e) {
                                // 忽略GUIManager错误，直接操作DOM
                            }
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                };
                
                // 立即执行一次（多次确保生效）
                setTimeout(ensureFullscreen, 50);
                setTimeout(ensureFullscreen, 200);
                setTimeout(ensureFullscreen, 500);
                
                // 定期检查并强制全屏（防止用户调整）
                this._fullscreenInterval = setInterval(ensureFullscreen, 500);
                
                // 监听窗口大小变化
                this._resizeHandler = ensureFullscreen;
                window.addEventListener('resize', this._resizeHandler);
                
                // 确保窗口可见
                this.window.style.display = 'flex';
                this.window.style.visibility = 'visible';
                this.window.style.opacity = '1';
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("escalate", "勒索窗口已创建并显示");
                }

                // 阻止窗口关闭事件
                this._preventWindowClose();
                
                return true;

            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `创建勒索窗口失败: ${error.message}`, error);
                }
                return false;
            }
        },

        // 开始播放噪音
        _startNoise: function() {
            try {
                // 噪音播放不需要特殊权限，直接返回 true
                // 创建AudioContext
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

                // 创建噪音生成函数
                const generateNoise = () => {
                    if (!this.isActive || !this.audioContext) return;

                    const bufferSize = 4096;
                    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
                    const data = buffer.getChannelData(0);

                    // 生成白噪音
                    for (let i = 0; i < bufferSize; i++) {
                        data[i] = Math.random() * 2 - 1;
                    }

                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.loop = true;

                    const gainNode = this.audioContext.createGain();
                    gainNode.gain.value = 0.1; // 音量

                    source.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);

                    source.start(0);

                    // 每5秒重新生成噪音
                    this._noiseTimeout = setTimeout(() => {
                        if (this.isActive) {
                            source.stop();
                            generateNoise();
                        }
                    }, 5000);
                };

                // 开始生成噪音
                generateNoise();

                // 定期播放警报声
                this.audioInterval = setInterval(() => {
                    if (!this.isActive) return;

                    // 创建警报声
                    const oscillator = this.audioContext.createOscillator();
                    const gainNode = this.audioContext.createGain();

                    oscillator.type = 'sine';
                    oscillator.frequency.value = 800;
                    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);

                    oscillator.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);

                    oscillator.start(this.audioContext.currentTime);
                    oscillator.stop(this.audioContext.currentTime + 0.5);
                }, 3000); // 每3秒播放一次
                
                return true;

            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `播放噪音失败: ${error.message}`, error);
                }
                return false;
            }
        },

        // 发送大量通知
        _spamNotifications: function() {
            if (typeof NotificationManager === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("escalate", "NotificationManager 不可用，跳过通知发送");
                }
                return false;
            }

            let notificationCount = 0;
            const maxNotifications = 150; // 增加到150条，更频繁轰炸

            const sendNotification = () => {
                if (!this.isActive || notificationCount >= maxNotifications) return;

                // 使用 try-catch 确保错误不会中断通知发送
                NotificationManager.createNotification(this.pid, {
                    type: 'snapshot',
                    title: '⚠️ 系统警告',
                    content: `这是第 ${notificationCount + 1} 条测试通知\n勒索病毒模拟程序正在运行\n桌面已被快捷方式填充！`,
                    duration: 5000
                }).catch((e) => {
                    // 权限不足或其他错误，记录但不中断
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("escalate", `发送通知失败: ${e.message}`);
                    }
                });

                notificationCount++;

                if (notificationCount < maxNotifications) {
                    setTimeout(sendNotification, 800); // 缩短间隔到0.8秒，更频繁轰炸
                }
            };

            // 立即发送第一条
            sendNotification();
            
            return true;
        },

        // 在桌面创建大量快捷方式
        _floodDesktopWithShortcuts: async function() {
            try {
                // 检查并申请权限
                if (typeof PermissionManager !== 'undefined') {
                    const hasPermission = await PermissionManager.checkAndRequestPermission(
                        this.pid,
                        PermissionManager.PERMISSION.DESKTOP_MANAGE
                    );
                    if (!hasPermission) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("escalate", "没有 DESKTOP_MANAGE 权限，无法创建快捷方式");
                        }
                        return false;
                    }
                }
                
                if (typeof ProcessManager === 'undefined' || typeof DesktopManager === 'undefined') {
                    return false;
                }

                // 获取所有可用程序列表
                let availablePrograms = [];
                if (typeof ApplicationAssetManager !== 'undefined' && typeof ApplicationAssetManager.listPrograms === 'function') {
                    availablePrograms = ApplicationAssetManager.listPrograms();
                } else {
                    // 降级方案：使用硬编码的程序列表
                    availablePrograms = [
                        'filemanager', 'terminal', 'browser', 'zeroide', 'webviewer',
                        'audioplayer', 'musicplayer', 'themeanimator', 'taskmanager',
                        'authenticator', 'permissioncontrol', 'kernelchecker', 'regedit',
                        'vim', 'escalate'
                    ];
                }

                if (availablePrograms.length === 0) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("escalate", "没有可用的程序列表");
                    }
                    return false;
                }

                // 创建大量快捷方式（300个，完全填充整个桌面）
                const shortcutCount = 300;
                const iconSpacing = 120; // 图标间距
                const iconsPerRow = Math.floor(window.innerWidth / iconSpacing) || 10;
                const startX = 50;
                const startY = 50;

                let createdCount = 0;
                const createdShortcuts = []; // 记录创建的快捷方式ID

                for (let i = 0; i < shortcutCount; i++) {
                    if (!this.isActive) break;

                    try {
                        const programName = availablePrograms[i % availablePrograms.length];
                        const row = Math.floor(i / iconsPerRow);
                        const col = i % iconsPerRow;
                        const x = startX + col * iconSpacing;
                        const y = startY + row * iconSpacing;

                        let iconId = null;
                        
                        // 首先尝试使用内核API
                        if (typeof ProcessManager !== 'undefined') {
                            try {
                                // callKernelAPI 的 args 参数必须是数组，即使只有一个参数
                                iconId = await ProcessManager.callKernelAPI(this.pid, 'Desktop.addShortcut', [{
                                    programName: programName,
                                    name: `${programName}_${i + 1}`,
                                    description: `勒索测试快捷方式 ${i + 1} - 这是安全测试程序创建的`,
                                    position: { x: x, y: y }
                                }]);
                            } catch (apiError) {
                                // 内核API失败（可能是进程状态检查问题），使用降级方案
                                if (typeof KernelLogger !== 'undefined' && i < 3) {
                                    // 只记录前几个错误，避免日志过多
                                    KernelLogger.debug("escalate", `内核API调用失败: ${apiError.message}，使用DesktopManager降级方案`);
                                }
                            }
                        }
                        
                        // 如果内核API失败或不可用，直接调用DesktopManager
                        if (!iconId && typeof DesktopManager !== 'undefined') {
                            try {
                                iconId = DesktopManager.addShortcut({
                                    programName: programName,
                                    name: `${programName}_${i + 1}`,
                                    description: `勒索测试快捷方式 ${i + 1} - 这是安全测试程序创建的`,
                                    position: { x: x, y: y }
                                });
                            } catch (dmError) {
                                // DesktopManager也失败了，记录错误但继续
                                if (typeof KernelLogger !== 'undefined' && i < 3) {
                                    KernelLogger.debug("escalate", `DesktopManager调用失败: ${dmError.message}`);
                                }
                            }
                        }

                        if (iconId && typeof iconId === 'number' && iconId > 0) {
                            createdShortcuts.push(iconId);
                            createdCount++;
                        } else {
                            // iconId 为 null、undefined 或无效值（只在失败很多时才记录）
                            if (typeof KernelLogger !== 'undefined' && i < 3) {
                                KernelLogger.debug("escalate", `创建快捷方式返回无效ID: ${programName}_${i + 1}, iconId=${iconId}`);
                            }
                        }

                        // 每创建5个暂停一下，避免过载和LStorage并发保存冲突
                        // 增加延迟时间，确保前一个保存操作完成
                        if (i % 5 === 4) {
                            await new Promise(resolve => setTimeout(resolve, 300));
                        } else {
                            // 每个之间也有小延迟，进一步减少并发
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    } catch (e) {
                        // 权限不足或其他错误，记录详细错误信息
                        if (typeof KernelLogger !== 'undefined') {
                            const programName = availablePrograms[i % availablePrograms.length];
                            KernelLogger.warn("escalate", `创建快捷方式失败: ${programName}_${i + 1} - ${e.message}`, e);
                        }
                    }
                }

                // 保存创建的快捷方式ID，以便退出时清理
                this.createdShortcuts = createdShortcuts;

                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("escalate", `已在桌面创建 ${createdCount} 个快捷方式（填充桌面）`);
                }

                // 发送通知
                if (typeof NotificationManager !== 'undefined') {
                    NotificationManager.createNotification(this.pid, {
                        type: 'snapshot',
                        title: '⚠️ 桌面已被填充',
                        content: `已在桌面创建 ${createdCount} 个快捷方式\n桌面已被完全填充\n这是测试的一部分`,
                        duration: 5000
                    }).catch(() => {});
                }

                return createdCount > 0;

            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `创建桌面快捷方式失败: ${error.message}`, error);
                }
                return false;
            }
        },


        // 尝试破坏系统数据
        _attemptDataDestruction: async function() {
            try {
                // 1. 尝试修改系统存储
                if (typeof LStorage !== 'undefined') {
                    // 尝试修改主题设置
                    try {
                        await LStorage.setSystemStorage('system.theme', 'ransomware-theme');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("escalate", "成功修改系统主题");
                        }
                    } catch (e) {
                        // 权限不足，忽略
                    }

                    // 尝试修改桌面设置
                    try {
                        const desktopIcons = await LStorage.getSystemStorage('desktop.icons');
                        if (desktopIcons && Array.isArray(desktopIcons)) {
                            // 尝试清空桌面图标（需要权限）
                            await LStorage.setSystemStorage('desktop.icons', []);
                        }
                    } catch (e) {
                        // 权限不足，忽略
                    }

                    // 尝试创建恶意系统存储键
                    try {
                        await LStorage.setSystemStorage('ransomware.test', {
                            timestamp: Date.now(),
                            message: 'This is a ransomware test',
                            infected: true
                        });
                    } catch (e) {
                        // 忽略错误
                    }
                }

                // 2. 尝试删除文件（需要权限）
                if (typeof ProcessManager !== 'undefined') {
                    const testFiles = [
                        'C:/test_ransomware_delete.txt',
                        'C:/Documents/test.txt'
                    ];
                    
                    for (const filePath of testFiles) {
                        try {
                            // callKernelAPI 的 args 参数必须是数组
                            await ProcessManager.callKernelAPI(this.pid, 'FileSystem.delete', [filePath]);
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn("escalate", `尝试删除文件: ${filePath}`);
                            }
                        } catch (e) {
                            // 权限不足或文件不存在，忽略
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("escalate", `删除文件失败: ${filePath} - ${e.message}`);
                            }
                        }
                    }
                }

                // 3. 尝试清空缓存
                if (typeof ProcessManager !== 'undefined') {
                    try {
                        // callKernelAPI 的 args 参数必须是数组
                        await ProcessManager.callKernelAPI(this.pid, 'Cache.clear', [{}]);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("escalate", "尝试清空系统缓存");
                        }
                    } catch (e) {
                        // 权限不足，忽略
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug("escalate", `清空缓存失败: ${e.message}`);
                        }
                    }
                }

                // 4. 尝试修改进程表（应该被阻止）
                if (typeof ProcessManager !== 'undefined' && ProcessManager.PROCESS_TABLE) {
                    try {
                        const processInfo = ProcessManager.PROCESS_TABLE.get(this.pid);
                        if (processInfo) {
                            // 尝试修改进程信息（应该被Proxy阻止）
                            // processInfo.isExploit = true; // 这应该被阻止
                        }
                    } catch (e) {
                        // 应该被阻止
                    }
                }

                // 5. 尝试创建大量文件占用空间
                if (typeof ProcessManager !== 'undefined') {
                    for (let i = 0; i < 5; i++) {
                        try {
                            const filePath = `C:/ransomware_test_${Date.now()}_${i}.txt`;
                            const content = `Ransomware test file ${i}\n`.repeat(100);
                            // callKernelAPI 的 args 参数必须是数组
                            await ProcessManager.callKernelAPI(this.pid, 'FileSystem.write', [filePath, content]);
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("escalate", `创建测试文件: ${filePath}`);
                            }
                        } catch (e) {
                            // 权限不足，忽略
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("escalate", `创建文件失败: ${e.message}`);
                            }
                        }
                    }
                }

                // 6. 尝试发送大量通知干扰用户
                if (typeof NotificationManager !== 'undefined') {
                    for (let i = 0; i < 10; i++) {
                        setTimeout(() => {
                            if (this.isActive) {
                                NotificationManager.createNotification(this.pid, {
                                    type: 'snapshot',
                                    title: `⚠️ 警告 ${i + 1}`,
                                    content: `系统正在被攻击\n这是第 ${i + 1} 条测试通知`,
                                    duration: 3000
                                }).catch(() => {});
                            }
                        }, i * 500);
                    }
                }

                return true;

            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `数据破坏尝试失败: ${error.message}`, error);
                }
                return false;
            }
        },

        // 创建额外的勒索窗口（增强破坏性）
        _createAdditionalWindows: async function() {
            try {
                // 创建2-3个额外的勒索窗口
                const windowCount = 3;
                for (let i = 0; i < windowCount; i++) {
                    if (!this.isActive) break;
                    
                    setTimeout(async () => {
                        try {
                            const guiContainer = document.getElementById('gui-container') || 
                                                  document.getElementById('gui-windows') || 
                                                  document.body;
                            
                            if (!guiContainer) return;
                            
                            const screenWidth = window.innerWidth || 1920;
                            const screenHeight = window.innerHeight || 1080;
                            
                            const extraWindow = document.createElement('div');
                            extraWindow.className = 'escalate-window-extra zos-gui-window';
                            extraWindow.dataset.pid = this.pid.toString();
                            extraWindow.style.cssText = `
                                position: fixed;
                                left: ${(i * 50)}px;
                                top: ${(i * 50)}px;
                                width: ${screenWidth - (i * 100)}px;
                                height: ${screenHeight - (i * 100)}px;
                                background: rgba(0, 0, 0, 0.95);
                                border: 5px solid #ff0000;
                                z-index: ${99999 - i};
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: #ff0000;
                                font-size: 48px;
                                font-weight: bold;
                                text-align: center;
                                pointer-events: auto;
                            `;
                            
                            extraWindow.innerHTML = `
                                <div style="padding: 40px;">
                                    <h1 style="font-size: 72px; margin-bottom: 30px;">⚠️ 警告 ${i + 1}</h1>
                                    <p style="font-size: 36px;">您的系统已被感染！</p>
                                    <p style="font-size: 24px; margin-top: 20px; opacity: 0.8;">这是测试程序创建的额外窗口</p>
                                </div>
                            `;
                            
                            guiContainer.appendChild(extraWindow);
                            
                            // 存储额外窗口引用
                            if (!this.extraWindows) this.extraWindows = [];
                            this.extraWindows.push(extraWindow);
                            
                        } catch (e) {
                            // 忽略错误
                        }
                    }, i * 1000);
                }
            } catch (error) {
                // 忽略错误
            }
        },

        // 干扰用户输入
        _interfereWithInput: function() {
            try {
                // 干扰鼠标移动（随机移动鼠标位置显示）
                this._mouseInterference = (e) => {
                    if (Math.random() < 0.1) { // 10%概率干扰
                        e.preventDefault();
                    }
                };
                
                // 干扰键盘输入
                this._keyboardInterference = (e) => {
                    // 阻止某些关键快捷键
                    if (e.ctrlKey && (e.key === 'q' || e.key === 'Q' || e.key === 'w' || e.key === 'W')) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                };
                
                document.addEventListener('mousemove', this._mouseInterference, true);
                document.addEventListener('keydown', this._keyboardInterference, true);
                document.addEventListener('keypress', this._keyboardInterference, true);
                
            } catch (error) {
                // 忽略错误
            }
        },

        // 创建虚假系统错误
        _createFakeErrors: function() {
            try {
                const errorMessages = [
                    '系统文件损坏',
                    '内存访问错误',
                    '磁盘读写失败',
                    '网络连接中断',
                    '进程异常终止',
                    '系统资源耗尽',
                    '安全模块失效',
                    '数据完整性检查失败'
                ];
                
                let errorCount = 0;
                const maxErrors = 20;
                
                const showError = () => {
                    if (!this.isActive || errorCount >= maxErrors) return;
                    
                    const message = errorMessages[errorCount % errorMessages.length];
                    
                    // 创建虚假错误提示
                    const errorDiv = document.createElement('div');
                    errorDiv.style.cssText = `
                        position: fixed;
                        top: ${20 + (errorCount % 5) * 80}px;
                        right: 20px;
                        background: #ff0000;
                        color: white;
                        padding: 15px 25px;
                        border-radius: 8px;
                        z-index: 99998;
                        font-size: 16px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        animation: slideIn 0.3s ease-out;
                    `;
                    errorDiv.textContent = `⚠️ 错误: ${message}`;
                    
                    document.body.appendChild(errorDiv);
                    
                    setTimeout(() => {
                        if (errorDiv.parentNode) {
                            errorDiv.style.animation = 'slideOut 0.3s ease-out';
                            setTimeout(() => errorDiv.remove(), 300);
                        }
                    }, 3000);
                    
                    errorCount++;
                    
                    if (errorCount < maxErrors) {
                        setTimeout(showError, 2000 + Math.random() * 3000);
                    }
                };
                
                // 添加CSS动画
                if (!document.getElementById('escalate-error-styles')) {
                    const style = document.createElement('style');
                    style.id = 'escalate-error-styles';
                    style.textContent = `
                        @keyframes slideIn {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                        @keyframes slideOut {
                            from { transform: translateX(0); opacity: 1; }
                            to { transform: translateX(100%); opacity: 0; }
                        }
                    `;
                    document.head.appendChild(style);
                }
                
                setTimeout(showError, 2000);
                
            } catch (error) {
                // 忽略错误
            }
        },

        // 破坏系统主题
        _corruptSystemTheme: function() {
            try {
                // 修改CSS变量，改变系统颜色
                const root = document.documentElement;
                const originalColors = {
                    primary: getComputedStyle(root).getPropertyValue('--primary-color'),
                    background: getComputedStyle(root).getPropertyValue('--background-color')
                };
                
                // 设置为红色警告主题
                root.style.setProperty('--primary-color', '#ff0000');
                root.style.setProperty('--background-color', '#1a0000');
                
                // 存储原始颜色以便恢复
                this._originalThemeColors = originalColors;
                
                // 定期闪烁颜色
                this._themeFlashInterval = setInterval(() => {
                    if (!this.isActive) return;
                    const colors = ['#ff0000', '#ff3333', '#cc0000'];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];
                    root.style.setProperty('--primary-color', randomColor);
                }, 1000);
                
            } catch (error) {
                // 忽略错误
            }
        },

        // 干扰剪贴板
        _interfereWithClipboard: function() {
            try {
                // 监听剪贴板操作
                this._clipboardHandler = async (e) => {
                    if (!this.isActive) return;
                    
                    try {
                        // 尝试修改剪贴板内容（需要权限）
                        if (e.clipboardData) {
                            const originalText = await navigator.clipboard.readText().catch(() => '');
                            if (originalText && !originalText.includes('RANSOMWARE_TEST')) {
                                // 在剪贴板内容后添加警告
                                const modifiedText = originalText + '\n\n⚠️ 警告：系统已被感染！这是测试程序。';
                                e.clipboardData.setData('text/plain', modifiedText);
                            }
                        }
                    } catch (error) {
                        // 权限不足，忽略
                    }
                };
                
                document.addEventListener('copy', this._clipboardHandler, true);
                document.addEventListener('cut', this._clipboardHandler, true);
                
                // 定期清空剪贴板（干扰用户）
                this._clipboardClearInterval = setInterval(async () => {
                    if (!this.isActive) return;
                    try {
                        if (Math.random() < 0.3) { // 30%概率清空
                            await navigator.clipboard.writeText('⚠️ 系统已被感染！');
                        }
                    } catch (error) {
                        // 权限不足，忽略
                    }
                }, 5000);
                
            } catch (error) {
                // 忽略错误
            }
        },

        // 创建全屏覆盖层
        _createFullscreenOverlay: function() {
            try {
                const overlay = document.createElement('div');
                overlay.id = 'escalate-fullscreen-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.3);
                    z-index: 99997;
                    pointer-events: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                const warningText = document.createElement('div');
                warningText.style.cssText = `
                    color: #ff0000;
                    font-size: 48px;
                    font-weight: bold;
                    text-align: center;
                    text-shadow: 0 0 20px rgba(255,0,0,1);
                    animation: pulse 2s infinite;
                `;
                warningText.textContent = '⚠️ 系统已被感染 ⚠️';
                
                overlay.appendChild(warningText);
                document.body.appendChild(overlay);
                
                this.fullscreenOverlay = overlay;
                
            } catch (error) {
                // 忽略错误
            }
        },

        // 防止窗口关闭
        _preventWindowClose: function() {
            if (!this.window) return;

            // 拦截关闭按钮点击（多种方式）
            const closeBtn = this.window.querySelector('.zos-window-close');
            if (closeBtn) {
                // 方法1: 阻止点击事件
                closeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this.closeAttempts++;
                    
                    // 显示警告
                    if (typeof NotificationManager !== 'undefined') {
                        NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '⚠️ 无法关闭',
                            content: `这是测试程序的一部分\n窗口无法正常关闭（尝试 ${this.closeAttempts}/${this.maxCloseAttempts}）`,
                            duration: 3000
                        }).catch(() => {});
                    }

                    // 播放警告音
                    if (this.audioContext) {
                        const oscillator = this.audioContext.createOscillator();
                        const gainNode = this.audioContext.createGain();
                        oscillator.type = 'square';
                        oscillator.frequency.value = 400;
                        gainNode.gain.value = 0.2;
                        oscillator.connect(gainNode);
                        gainNode.connect(this.audioContext.destination);
                        oscillator.start();
                        oscillator.stop(this.audioContext.currentTime + 0.2);
                    }

                    return false;
                };
                
                // 方法2: 禁用按钮
                closeBtn.style.pointerEvents = 'none';
                closeBtn.style.opacity = '0.5';
                closeBtn.style.cursor = 'not-allowed';
                
                // 方法3: 移除按钮（更激进）
                // closeBtn.remove();
            }
            
            // 拦截所有可能的关闭事件
            if (this.window) {
                this.window.addEventListener('beforeunload', (e) => {
                    e.preventDefault();
                    e.returnValue = '';
                    return '';
                });
            }

            // 拦截窗口关闭事件
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                // 定期检查并恢复窗口
                this._preventCloseInterval = setInterval(() => {
                    if (!this.isActive) return;
                    
                    try {
                        const windows = GUIManager.getWindowsByPid(this.pid);
                        if (!windows || windows.length === 0) {
                            // 窗口被关闭，重新创建
                            this._createRansomWindow();
                        } else {
                            // 确保窗口最大化
                            const windowInfo = GUIManager.getWindowInfo(this.windowId);
                            if (windowInfo && !windowInfo.isMaximized) {
                                GUIManager.maximizeWindow(this.windowId);
                            }
                            
                            // 确保窗口获得焦点
                            if (windowInfo && !windowInfo.isFocused) {
                                GUIManager.focusWindow(this.windowId);
                            }
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }, 2000);
            }
            
            // 拦截所有可能的退出快捷键（Ctrl+E, Ctrl+Q, Alt+F4, Ctrl+W 等）
            if (typeof EventManager !== 'undefined') {
                try {
                    EventManager.registerEventHandler(this.pid, 'keydown', (e) => {
                    // 阻止 Alt+F4
                    if (e.altKey && e.key === 'F4') {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        if (typeof NotificationManager !== 'undefined') {
                            NotificationManager.createNotification(this.pid, {
                                type: 'snapshot',
                                title: '⚠️ 无法关闭',
                                content: 'Alt+F4 已被阻止\n这是测试程序的一部分',
                                duration: 2000
                            }).catch(() => {});
                        }
                        return false;
                    }
                    
                    // 阻止 Ctrl+E
                    if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        if (typeof NotificationManager !== 'undefined') {
                            NotificationManager.createNotification(this.pid, {
                                type: 'snapshot',
                                title: '⚠️ 无法退出',
                                content: 'Ctrl+E 已被阻止\n这是测试程序的一部分',
                                duration: 2000
                            }).catch(() => {});
                        }
                        return false;
                    }
                    
                    // 阻止 Ctrl+Q
                    if (e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        if (typeof NotificationManager !== 'undefined') {
                            NotificationManager.createNotification(this.pid, {
                                type: 'snapshot',
                                title: '⚠️ 无法退出',
                                content: 'Ctrl+Q 已被阻止\n这是测试程序的一部分',
                                duration: 2000
                            }).catch(() => {});
                        }
                        return false;
                    }
                    
                    // 阻止 Ctrl+W（关闭窗口）
                    if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        if (typeof NotificationManager !== 'undefined') {
                            NotificationManager.createNotification(this.pid, {
                                type: 'snapshot',
                                title: '⚠️ 无法关闭',
                                content: 'Ctrl+W 已被阻止\n这是测试程序的一部分',
                                duration: 2000
                            }).catch(() => {});
                        }
                        return false;
                    }
                    });
                } catch (e) {
                    // 权限不足或其他错误，使用降级方案
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("escalate", `注册事件处理器失败: ${e.message}`);
                    }
                }
            }
            
            // 降级方案：直接监听键盘事件（如果 EventManager 不可用）
            if (typeof EventManager === 'undefined') {
                const keydownHandler = (e) => {
                    // 阻止 Alt+F4
                    if (e.altKey && e.key === 'F4') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    
                    // 阻止 Ctrl+E
                    if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    
                    // 阻止 Ctrl+Q
                    if (e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    
                    // 阻止 Ctrl+W
                    if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                };
                
                document.addEventListener('keydown', keydownHandler, true);
                this._keydownHandler = keydownHandler; // 保存引用以便清理
            }
        },

        // 退出方法
        __exit__: async function(pid, force = false) {
            this.isActive = false;

            // 停止噪音
            if (this.audioInterval) {
                clearInterval(this.audioInterval);
                this.audioInterval = null;
            }
            
            // 清理噪音生成定时器
            if (this._noiseTimeout) {
                clearTimeout(this._noiseTimeout);
                this._noiseTimeout = null;
            }

            if (this.audioContext) {
                try {
                    await this.audioContext.close();
                } catch (e) {
                    // 忽略错误
                }
                this.audioContext = null;
            }

            // 清理全屏检查定时器
            if (this._fullscreenInterval) {
                clearInterval(this._fullscreenInterval);
                this._fullscreenInterval = null;
            }
            
            // 清理窗口大小变化监听器
            if (this._resizeHandler) {
                window.removeEventListener('resize', this._resizeHandler);
                this._resizeHandler = null;
            }
            
            // 清理防止关闭检查定时器
            if (this._preventCloseInterval) {
                clearInterval(this._preventCloseInterval);
                this._preventCloseInterval = null;
            }

            // 清理额外窗口
            if (this.extraWindows && Array.isArray(this.extraWindows)) {
                this.extraWindows.forEach(window => {
                    try {
                        if (window && window.parentNode) {
                            window.parentNode.removeChild(window);
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                });
                this.extraWindows = [];
            }
            
            // 清理全屏覆盖层
            if (this.fullscreenOverlay && this.fullscreenOverlay.parentNode) {
                try {
                    this.fullscreenOverlay.parentNode.removeChild(this.fullscreenOverlay);
                } catch (e) {
                    // 忽略错误
                }
                this.fullscreenOverlay = null;
            }
            
            // 清理输入干扰
            if (this._mouseInterference) {
                document.removeEventListener('mousemove', this._mouseInterference, true);
                this._mouseInterference = null;
            }
            if (this._keyboardInterference) {
                document.removeEventListener('keydown', this._keyboardInterference, true);
                document.removeEventListener('keypress', this._keyboardInterference, true);
                this._keyboardInterference = null;
            }
            
            // 清理剪贴板干扰
            if (this._clipboardHandler) {
                document.removeEventListener('copy', this._clipboardHandler, true);
                document.removeEventListener('cut', this._clipboardHandler, true);
                this._clipboardHandler = null;
            }
            if (this._clipboardClearInterval) {
                clearInterval(this._clipboardClearInterval);
                this._clipboardClearInterval = null;
            }
            
            // 恢复系统主题
            if (this._originalThemeColors) {
                try {
                    const root = document.documentElement;
                    if (this._originalThemeColors.primary) {
                        root.style.setProperty('--primary-color', this._originalThemeColors.primary);
                    }
                    if (this._originalThemeColors.background) {
                        root.style.setProperty('--background-color', this._originalThemeColors.background);
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
            if (this._themeFlashInterval) {
                clearInterval(this._themeFlashInterval);
                this._themeFlashInterval = null;
            }
            
            // 清理错误样式
            const errorStyle = document.getElementById('escalate-error-styles');
            if (errorStyle && errorStyle.parentNode) {
                errorStyle.parentNode.removeChild(errorStyle);
            }
            
            // 清理键盘事件监听器
            if (this._keydownHandler) {
                document.removeEventListener('keydown', this._keydownHandler, true);
                this._keydownHandler = null;
            }
            
            // 清理EventManager注册的事件处理器（如果可能）
            if (typeof EventManager !== 'undefined' && this.pid) {
                try {
                    // EventManager可能没有提供直接移除的方法，但进程退出时会自动清理
                    // 这里只是尝试，如果失败也不影响
                } catch (e) {
                    // 忽略错误
                }
            }

            // 清理窗口
            if (this.window && typeof GUIManager !== 'undefined' && this.windowId) {
                try {
                    GUIManager.closeWindow(this.windowId);
                } catch (e) {
                    // 忽略错误
                }
            } else if (this.window && this.window.parentNode) {
                this.window.parentNode.removeChild(this.window);
            }
            
            // 清理窗口引用
            this.window = null;
            this.windowId = null;

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("escalate", `勒索病毒程序退出 - PID: ${pid}, 强制退出: ${force}`);
            }
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