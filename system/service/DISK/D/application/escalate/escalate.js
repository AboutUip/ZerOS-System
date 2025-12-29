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
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.THEME_WRITE,
                    PermissionManager.PERMISSION.DESKTOP_MANAGE,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.GUI_WINDOW_MANAGE
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
            if (typeof UserControl !== 'undefined') {
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
                } else {
                // UserControl 不可用，为了安全起见拒绝运行
                throw new Error('UserControl 不可用，无法验证管理员权限');
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
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("escalate", `勒索病毒程序执行出错: ${error.message}`, error);
                }
            }
        },

        // 创建勒索壁纸
        _createRansomWallpaper: async function() {
            try {
                // 创建更强大的SVG勒索壁纸（更恐怖、更醒目的视觉效果）
                const svgContent = `
                    <svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#000000;stop-opacity:1" />
                                <stop offset="30%" style="stop-color:#1a0000;stop-opacity:1" />
                                <stop offset="60%" style="stop-color:#330000;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#000000;stop-opacity:1" />
                            </linearGradient>
                            <radialGradient id="redGlow" cx="50%" cy="50%">
                                <stop offset="0%" style="stop-color:#ff0000;stop-opacity:0.3" />
                                <stop offset="100%" style="stop-color:#ff0000;stop-opacity:0" />
                            </radialGradient>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
                                <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                            <filter id="strongGlow">
                                <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
                                <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#bg)"/>
                        <rect x="0" y="0" width="100%" height="100%" fill="url(#redGlow)">
                            <animate attributeName="opacity" values="0.2;0.4;0.2" dur="2s" repeatCount="indefinite"/>
                        </rect>
                        <rect x="0" y="0" width="100%" height="100%" fill="#ff0000" opacity="0.15" filter="url(#glow)">
                            <animate attributeName="opacity" values="0.1;0.25;0.1" dur="3s" repeatCount="indefinite"/>
                        </rect>
                        <text x="50%" y="30%" font-family="Arial, sans-serif" font-size="120" font-weight="900" fill="#ff0000" text-anchor="middle" stroke="#000000" stroke-width="4" filter="url(#strongGlow)">
                            <animate attributeName="opacity" values="0.8;1;0.8" dur="1s" repeatCount="indefinite"/>
                            <animate attributeName="fill" values="#ff0000;#ff3333;#ff0000" dur="2s" repeatCount="indefinite"/>
                            ⚠️ 您的系统已被锁定 ⚠️
                        </text>
                        <text x="50%" y="40%" font-family="Arial, sans-serif" font-size="100" font-weight="bold" fill="#ff3333" text-anchor="middle" stroke="#000000" stroke-width="3" filter="url(#glow)">
                            <animate attributeName="opacity" values="0.9;1;0.9" dur="1.5s" repeatCount="indefinite"/>
                            RANSOMWARE TEST
                        </text>
                        <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="70" fill="#ff6666" text-anchor="middle" stroke="#000000" stroke-width="2">
                            ZerOS 安全测试程序
                        </text>
                        <text x="50%" y="60%" font-family="Arial, sans-serif" font-size="55" fill="#ff9999" text-anchor="middle">
                            这是模拟勒索病毒攻击
                        </text>
                        <text x="50%" y="70%" font-family="Arial, sans-serif" font-size="45" fill="#ffffff" text-anchor="middle">
                            仅用于系统安全测试目的
                        </text>
                        <text x="50%" y="80%" font-family="Arial, sans-serif" font-size="40" fill="#cccccc" text-anchor="middle">
                            请勿在真实环境中使用
                        </text>
                        <text x="50%" y="90%" font-family="Arial, sans-serif" font-size="35" fill="#999999" text-anchor="middle">
                            所有退出快捷键已被禁用，只能强制终止进程
                        </text>
                        <circle cx="50%" cy="50%" r="200" fill="none" stroke="#ff0000" stroke-width="5" opacity="0.3">
                            <animate attributeName="r" values="200;250;200" dur="3s" repeatCount="indefinite"/>
                            <animate attributeName="opacity" values="0.3;0.5;0.3" dur="3s" repeatCount="indefinite"/>
                        </circle>
                        <circle cx="50%" cy="50%" r="150" fill="none" stroke="#ff3333" stroke-width="3" opacity="0.4">
                            <animate attributeName="r" values="150;180;150" dur="2s" repeatCount="indefinite"/>
                            <animate attributeName="opacity" values="0.4;0.6;0.4" dur="2s" repeatCount="indefinite"/>
                        </circle>
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

                // 创建窗口元素
                this.window = document.createElement('div');
                this.window.className = 'escalate-window zos-gui-window';
                this.window.dataset.pid = this.pid.toString();
                this.window.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    width: 800px;
                    height: 600px;
                    background: linear-gradient(135deg, #1a0000 0%, #000000 100%);
                    border: 3px solid #ff0000;
                    border-radius: 12px;
                    box-shadow: 0 0 50px rgba(255, 0, 0, 0.8);
                    color: #ffffff;
                    font-family: 'Courier New', monospace;
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

                content.innerHTML = `
                    <div style="text-align: center; margin-bottom: 30px; animation: pulse 2s infinite;">
                        <div style="font-size: 96px; color: #ff0000; margin-bottom: 20px; text-shadow: 0 0 20px rgba(255,0,0,0.8), 0 0 40px rgba(255,0,0,0.5);">🔒</div>
                        <h1 style="color: #ff0000; margin: 0; font-size: 48px; text-shadow: 0 0 15px rgba(255,0,0,0.8), 0 0 30px rgba(255,0,0,0.5); font-weight: 900; letter-spacing: 3px;">
                            系统已被锁定
                        </h1>
                    </div>
                    <div style="background: linear-gradient(135deg, rgba(255, 0, 0, 0.2) 0%, rgba(255, 0, 0, 0.1) 100%); border: 3px solid #ff0000; border-radius: 12px; padding: 25px; margin-bottom: 25px; box-shadow: 0 0 30px rgba(255,0,0,0.5);">
                        <h2 style="color: #ff3333; margin-top: 0; font-size: 28px; text-shadow: 0 0 10px rgba(255,0,0,0.5);">⚠️ 严重警告</h2>
                        <p style="line-height: 2; color: #ffaaaa; font-size: 18px; margin-bottom: 15px;">
                            这是 ZerOS 安全测试程序。您的系统正在被模拟勒索病毒攻击。
                        </p>
                        <p style="line-height: 2; color: #ffaaaa; font-size: 18px;">
                            此窗口无法正常关闭，这是测试的一部分。
                        </p>
                        <p style="line-height: 2; color: #ff9999; font-size: 16px; margin-top: 15px; font-weight: bold;">
                            ⚠️ 桌面已被大量快捷方式填充！
                        </p>
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.5); border: 2px solid #ff3333; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                        <h3 style="color: #ff6666; margin-top: 0; font-size: 24px; text-shadow: 0 0 8px rgba(255,0,0,0.5);">测试功能：</h3>
                        <ul style="color: #ffcccc; line-height: 2.5; font-size: 16px;">
                            <li>✓ 桌面壁纸已被修改为勒索壁纸</li>
                            <li>✓ 噪音正在循环播放</li>
                            <li>✓ 窗口无法关闭（所有关闭快捷键被阻止）</li>
                            <li>✓ 桌面已被大量快捷方式填充</li>
                            <li>✓ 系统数据可能被破坏</li>
                            <li>✓ 大量通知正在发送</li>
                        </ul>
                    </div>
                    <div style="background: rgba(255, 0, 0, 0.15); border: 2px solid #ff6666; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                        <h3 style="color: #ff9999; margin-top: 0; font-size: 22px;">⚠️ 无法退出：</h3>
                        <p style="color: #ffcccc; line-height: 2; font-size: 16px;">
                            <strong>所有退出快捷键已被禁用！</strong><br/>
                            包括：Ctrl+E、Ctrl+Q、Alt+F4 等<br/>
                            只能通过强制终止进程或刷新页面退出
                        </p>
                    </div>
                    <div style="text-align: center; margin-top: 30px;">
                        <p style="color: #999999; font-size: 14px;">
                            这是安全测试程序，仅用于 ZerOS 系统安全评估
                        </p>
                        <p style="color: #666666; font-size: 12px; margin-top: 10px;">
                            程序版本: 3.0.0 | 需要管理员权限
                        </p>
                    </div>
                    <style>
                        @keyframes pulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                        }
                    </style>
                `;

                this.window.appendChild(content);

                // 注册窗口到GUIManager
                if (typeof GUIManager !== 'undefined') {
                    this.windowId = GUIManager.registerWindow(this.pid, this.window, {
                        title: '⚠️ 勒索病毒测试',
                        resizable: true,
                        minimizable: false,
                        maximizable: true,
                        closable: false,  // 禁止关闭
                        width: 800,
                        height: 600,
                        minWidth: 600,
                        minHeight: 400
                    });

                    // 最大化窗口并防止关闭
                    setTimeout(() => {
                        if (this.windowId && typeof GUIManager !== 'undefined') {
                            GUIManager.maximizeWindow(this.windowId);
                            
                            // 定期检查并重新最大化（防止用户还原）
                            setInterval(() => {
                                if (!this.isActive) return;
                                try {
                                    const windowInfo = GUIManager.getWindowInfo(this.windowId);
                                    if (windowInfo && !windowInfo.isMaximized) {
                                        GUIManager.maximizeWindow(this.windowId);
                                    }
                                } catch (e) {
                                    // 忽略错误
                                }
                            }, 1000);
                        }
                    }, 100);
                } else {
                    // 降级方案：直接添加到容器
                    guiContainer.appendChild(this.window);
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
            if (typeof NotificationManager === 'undefined') return;

            let notificationCount = 0;
            const maxNotifications = 30; // 增加到30条

            const sendNotification = () => {
                if (!this.isActive || notificationCount >= maxNotifications) return;

                NotificationManager.createNotification(this.pid, {
                    type: 'snapshot',
                    title: '⚠️ 系统警告',
                    content: `这是第 ${notificationCount + 1} 条测试通知\n勒索病毒模拟程序正在运行\n桌面已被快捷方式填充！`,
                    duration: 5000
                }).catch(() => {});

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
                            await ProcessManager.callKernelAPI(this.pid, 'FileSystem.delete', [filePath]);
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn("escalate", `尝试删除文件: ${filePath}`);
                            }
                        } catch (e) {
                            // 权限不足或文件不存在，忽略
                        }
                    }
                }

                // 3. 尝试清空缓存
                if (typeof ProcessManager !== 'undefined') {
                    try {
                        await ProcessManager.callKernelAPI(this.pid, 'Cache.clear', [{}]);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn("escalate", "尝试清空系统缓存");
                        }
                    } catch (e) {
                        // 权限不足，忽略
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
                            await ProcessManager.callKernelAPI(this.pid, 'FileSystem.write', [filePath, content]);
                        } catch (e) {
                            // 权限不足，忽略
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