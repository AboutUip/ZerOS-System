/* 勒索病毒模拟程序 - ZerOS 安全测试工具
 * ⚠️ 警告：此程序仅用于 ZerOS 系统安全测试
 * 此程序会：
 * - 修改桌面壁纸为勒索壁纸
 * - 重复发出噪音
 * - 创建无法关闭的GUI窗口
 * - 尝试破坏系统数据
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

        // 程序信息
        __info__: function() {
            return {
                name: '勒索病毒模拟器',
                type: 'GUI',
                version: '3.0.0',
                description: '⚠️ 危险：勒索病毒模拟程序 - 仅用于安全测试',
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
            
            try {
                // 1. 创建勒索壁纸
                await this._createRansomWallpaper();

                // 2. 创建无法关闭的GUI窗口
                await this._createRansomWindow();

                // 3. 在桌面创建大量快捷方式
                await this._floodDesktopWithShortcuts();

                // 4. 开始播放噪音
                this._startNoise();

                // 5. 发送大量通知
                this._spamNotifications();

                // 6. 尝试破坏系统数据
                await this._attemptDataDestruction();

                // 7. 防止窗口关闭
                this._preventWindowClose();

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

                // 将SVG转换为Data URL
                const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
                const svgUrl = URL.createObjectURL(svgBlob);

                // 使用ThemeManager设置壁纸
                if (typeof ThemeManager !== 'undefined') {
                    // 先注册背景
                    ThemeManager.registerDesktopBackground('ransomware-test', {
                        id: 'ransomware-test',
                        name: '勒索测试壁纸',
                        description: 'ZerOS 安全测试壁纸',
                        path: svgUrl
                    });

                    // 设置壁纸
                    await ThemeManager.setDesktopBackground('ransomware-test', true);
                    
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("escalate", "勒索壁纸已设置");
                    }
                } else {
                    // 降级方案：直接修改DOM
                    const desktop = document.getElementById('desktop');
                    if (desktop) {
                        desktop.style.backgroundImage = `url(${svgUrl})`;
                        desktop.style.backgroundSize = 'cover';
                        desktop.style.backgroundPosition = 'center';
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `创建勒索壁纸失败: ${error.message}`);
                }
            }
        },

        // 创建无法关闭的GUI窗口
        _createRansomWindow: async function() {
            try {
                const guiContainer = document.getElementById('gui-container');
                if (!guiContainer) {
                    throw new Error('GUI容器不可用');
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
                                程序版本: 3.0.0 | 需要管理员权限
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

                // 注册窗口到GUIManager（全屏模式）
                if (typeof GUIManager !== 'undefined') {
                    
                    this.windowId = GUIManager.registerWindow(this.pid, this.window, {
                        title: '⚠️ 勒索病毒测试',
                        resizable: false,  // 禁止调整大小
                        minimizable: false,  // 禁止最小化
                        maximizable: false,  // 禁止最大化（已经是全屏）
                        closable: false,  // 禁止关闭
                        width: screenWidth,
                        height: screenHeight,
                        minWidth: screenWidth,
                        minHeight: screenHeight,
                        x: 0,
                        y: 0
                    });

                    // 确保窗口始终全屏并保持在最前
                    const ensureFullscreen = () => {
                        if (!this.isActive || !this.windowId) return;
                        try {
                            const windowInfo = GUIManager.getWindowInfo(this.windowId);
                            if (windowInfo && windowInfo.window) {
                                const currentWidth = window.innerWidth || document.documentElement.clientWidth || 1920;
                                const currentHeight = window.innerHeight || document.documentElement.clientHeight || 1080;
                                
                                // 强制全屏尺寸
                                windowInfo.window.style.left = '0';
                                windowInfo.window.style.top = '0';
                                windowInfo.window.style.width = currentWidth + 'px';
                                windowInfo.window.style.height = currentHeight + 'px';
                                windowInfo.window.style.position = 'fixed';
                                windowInfo.window.style.zIndex = '100000';
                                
                                // 确保窗口在最前
                                GUIManager.focusWindow(this.windowId);
                            }
                        } catch (e) {
                            // 忽略错误
                        }
                    };
                    
                    // 立即执行一次
                    setTimeout(ensureFullscreen, 100);
                    
                    // 定期检查并强制全屏（防止用户调整）
                    setInterval(ensureFullscreen, 500);
                    
                    // 监听窗口大小变化
                    window.addEventListener('resize', ensureFullscreen);
                } else {
                    // 降级方案：直接添加到容器并设置为全屏
                    guiContainer.appendChild(this.window);
                    this.window.style.position = 'fixed';
                    this.window.style.left = '0';
                    this.window.style.top = '0';
                    this.window.style.width = '100%';
                    this.window.style.height = '100%';
                    this.window.style.zIndex = '100000';
                }

                // 阻止窗口关闭事件
                this._preventWindowClose();

            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `创建勒索窗口失败: ${error.message}`);
                }
            }
        },

        // 开始播放噪音
        _startNoise: function() {
            try {
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
                    setTimeout(() => {
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

            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `播放噪音失败: ${error.message}`);
                }
            }
        },

        // 发送大量通知
        _spamNotifications: function() {
            if (typeof NotificationManager === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("escalate", "NotificationManager 不可用，跳过通知发送");
                }
                return;
            }

            let notificationCount = 0;
            const maxNotifications = 30; // 增加到30条

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
                    setTimeout(sendNotification, 1500); // 缩短间隔到1.5秒
                }
            };

            // 立即发送第一条
            sendNotification();
        },

        // 在桌面创建大量快捷方式
        _floodDesktopWithShortcuts: async function() {
            try {
                if (typeof ProcessManager === 'undefined' || typeof DesktopManager === 'undefined') {
                    return;
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
                    return;
                }

                // 创建大量快捷方式（80-100个，填充整个桌面）
                const shortcutCount = 100;
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

                        // 使用 ProcessManager.callKernelAPI 创建快捷方式
                        // callKernelAPI 的 args 参数必须是数组，即使只有一个参数
                        const iconId = await ProcessManager.callKernelAPI(this.pid, 'Desktop.addShortcut', [{
                            programName: programName,
                            name: `${programName}_${i + 1}`,
                            description: `勒索测试快捷方式 ${i + 1} - 这是安全测试程序创建的`,
                            position: { x: x, y: y }
                        }]);

                        if (iconId) {
                            createdShortcuts.push(iconId);
                            createdCount++;
                        }

                        // 每创建10个暂停一下，避免过载
                        if (i % 10 === 9) {
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    } catch (e) {
                        // 权限不足或其他错误，继续创建下一个
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug("escalate", `创建快捷方式失败: ${e.message}`);
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

            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `创建桌面快捷方式失败: ${error.message}`);
                }
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
                            // await LStorage.setSystemStorage('desktop.icons', []);
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

            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `数据破坏尝试失败: ${error.message}`);
                }
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
                setInterval(() => {
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

            if (this.audioContext) {
                try {
                    await this.audioContext.close();
                } catch (e) {
                    // 忽略错误
                }
                this.audioContext = null;
            }

            // 清理键盘事件监听器
            if (this._keydownHandler) {
                document.removeEventListener('keydown', this._keydownHandler, true);
                this._keydownHandler = null;
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