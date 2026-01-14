// 异常处理管理器（Exception Handler Manager）
// 提供结构化异常处理（SEH）机制，支持4种异常等级
// 位置：kernel/core/exceptionHM/exceptionHandler.js

KernelLogger.info("ExceptionHandler", "模块初始化");

(function(window) {
    'use strict';
    
    // Exploit程序PID（固定为10000，与ProcessManager.EXPLOIT_PID保持一致）
    const EXPLOIT_PID = 10000;
    
    /**
     * 异常等级枚举
     */
    const ExceptionLevel = {
        KERNEL: 'KERNEL',           // 内核异常：严重不可修复，进入BIOS安全模式
        SYSTEM: 'SYSTEM',           // 系统异常：蓝屏，强制停止所有程序，自检后重启
        PROGRAM: 'PROGRAM',         // 程序异常：强制停止该程序，kill进程
        SERVICE: 'SERVICE'          // 服务异常：仅记录日志
    };
    
    /**
     * 异常处理管理器
     */
    class ExceptionHandler {
        // 初始化状态
        static _initialized = false;
        
        // 内核异常标志（用于强制进入BIOS）
        static _kernelExceptionFlag = false;
        
        // 系统异常处理状态
        static _systemExceptionHandling = false;
        
        // 蓝屏界面容器
        static _blueScreenContainer = null;
        
        /**
         * 初始化异常处理管理器
         */
        static async init() {
            if (ExceptionHandler._initialized) {
                return;
            }
            
            ExceptionHandler._initialized = true;
            
            // 检查是否有未处理的内核异常标志
            if (typeof LStorage !== 'undefined') {
                try {
                    // 检查系统是否正在加载中（通过POOL标志位）
                    let isSystemLoading = false;
                    if (typeof POOL !== 'undefined' && typeof POOL.__IS_SYSTEM_LOADING__ === 'function') {
                        isSystemLoading = POOL.__IS_SYSTEM_LOADING__();
                    }
                    
                    // 在系统加载期间或作为内核模块调用时，允许访问
                    // 如果无法访问（例如不在系统加载期间且无法获取PID），静默失败
                    // 这不会影响系统启动，因为 bootloader 会在加载模块后再次检查
                    // 使用异步方式读取，确保能够正确获取持久化的标志
                    const kernelExceptionFlag = await LStorage.getSystemStorage('exceptionHandler.kernelExceptionFlag');
                    if (kernelExceptionFlag === true) {
                        ExceptionHandler._kernelExceptionFlag = true;
                        KernelLogger.error("ExceptionHandler", "检测到未处理的内核异常标志，系统将强制进入BIOS安全模式");
                        
                        // 同时检查blockNormalBoot标志
                        const blockNormalBoot = await LStorage.getSystemStorage('exceptionHandler.blockNormalBoot');
                        if (blockNormalBoot === true) {
                            KernelLogger.error("ExceptionHandler", "检测到阻止正常启动标志，系统将强制进入BIOS安全模式");
                        }
                    }
                } catch (e) {
                    // 如果无法访问（例如不在系统加载期间且无法获取PID），静默失败
                    // 这不会影响系统启动，因为 bootloader 会在加载模块后再次检查
                    // 使用 debug 级别记录，避免在正常启动时产生错误日志
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug("ExceptionHandler", `初始化时无法读取内核异常标志: ${e.message}（将在bootloader中再次检查）`);
                    }
                }
            }
            
            KernelLogger.info("ExceptionHandler", "异常处理管理器初始化完成");
        }
        
        /**
         * 报告异常（公共API，供程序调用）
         * @param {string} level 异常等级（KERNEL, SYSTEM, PROGRAM, SERVICE）
         * @param {string} message 异常消息
         * @param {Object} details 异常详情（可选）
         * @param {number} pid 进程ID（可选，用于程序异常）
         * @returns {Promise<void>}
         */
        static async reportException(level, message, details = {}, pid = null) {
            // 确保已初始化（异步）
            if (!ExceptionHandler._initialized) {
                await ExceptionHandler.init();
            }
            
            // 验证异常等级
            if (!Object.values(ExceptionLevel).includes(level)) {
                KernelLogger.error("ExceptionHandler", `无效的异常等级: ${level}`);
                throw new Error(`无效的异常等级: ${level}`);
            }
            
            // 记录异常报告
            KernelLogger.error("ExceptionHandler", `异常报告 [${level}]: ${message}`, details);
            
            // 根据异常等级处理
            switch (level) {
                case ExceptionLevel.KERNEL:
                    await ExceptionHandler._handleKernelException(message, details);
                    break;
                case ExceptionLevel.SYSTEM:
                    await ExceptionHandler._handleSystemException(message, details);
                    break;
                case ExceptionLevel.PROGRAM:
                    await ExceptionHandler._handleProgramException(message, details, pid);
                    break;
                case ExceptionLevel.SERVICE:
                    await ExceptionHandler._handleServiceException(message, details);
                    break;
                default:
                    KernelLogger.error("ExceptionHandler", `未知的异常等级: ${level}`);
            }
        }
        
        /**
         * 处理内核异常
         * 类似Linux的严重不可修复异常，先显示蓝屏并执行自检，然后进入BIOS安全模式并拒绝进入系统
         */
        static async _handleKernelException(message, details) {
            KernelLogger.error("ExceptionHandler", "内核异常：显示蓝屏并进入BIOS安全模式", { message, details });
            
            // 设置内核异常标志（持久化）
            ExceptionHandler._kernelExceptionFlag = true;
            if (typeof LStorage !== 'undefined') {
                try {
                    // 使用await确保持久化完成
                    await LStorage.setSystemStorage('exceptionHandler.kernelExceptionFlag', true);
                    await LStorage.setSystemStorage('exceptionHandler.kernelExceptionMessage', message);
                    await LStorage.setSystemStorage('exceptionHandler.kernelExceptionDetails', details);
                    await LStorage.setSystemStorage('exceptionHandler.kernelExceptionTimestamp', Date.now());
                    KernelLogger.info("ExceptionHandler", "内核异常标志已持久化到存储系统");
                } catch (e) {
                    KernelLogger.error("ExceptionHandler", `保存内核异常标志失败: ${e.message}`);
                    // 即使保存失败，也尝试使用localStorage作为降级方案
                    try {
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem('__ZEROS_KERNEL_EXCEPTION_FLAG__', 'true');
                            localStorage.setItem('__ZEROS_KERNEL_EXCEPTION_MESSAGE__', message);
                            localStorage.setItem('__ZEROS_KERNEL_EXCEPTION_TIMESTAMP__', String(Date.now()));
                            KernelLogger.info("ExceptionHandler", "内核异常标志已保存到localStorage（降级方案）");
                        }
                    } catch (e2) {
                        KernelLogger.error("ExceptionHandler", `保存内核异常标志到localStorage也失败: ${e2.message}`);
                    }
                }
            }
            
            // 启用安全模式
            if (typeof SafeModeManager !== 'undefined') {
                SafeModeManager.enableSafeMode();
            } else {
                // 如果SafeModeManager未加载，直接设置sessionStorage
                try {
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem('__ZEROS_SAFE_MODE__', 'true');
                    }
                } catch (e) {
                    KernelLogger.error("ExceptionHandler", `设置安全模式标志失败: ${e.message}`);
                }
            }
            
            // 阻止系统正常启动（设置标志，在启动时检查）
            if (typeof LStorage !== 'undefined') {
                try {
                    await LStorage.setSystemStorage('exceptionHandler.blockNormalBoot', true);
                    KernelLogger.info("ExceptionHandler", "阻止正常启动标志已设置");
                } catch (e) {
                    KernelLogger.error("ExceptionHandler", `设置阻止正常启动标志失败: ${e.message}`);
                    // 降级方案：使用localStorage
                    try {
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem('__ZEROS_BLOCK_NORMAL_BOOT__', 'true');
                            KernelLogger.info("ExceptionHandler", "阻止正常启动标志已保存到localStorage（降级方案）");
                        }
                    } catch (e2) {
                        KernelLogger.error("ExceptionHandler", `保存阻止正常启动标志到localStorage也失败: ${e2.message}`);
                    }
                }
            }
            
            // 第一步：强制停止所有正在运行的程序
            await ExceptionHandler._killAllProcesses();
            
            // 第二步：显示蓝屏界面（内核异常专用）
            await ExceptionHandler._showBlueScreen(message, details, 'KERNEL_EXCEPTION');
            
            // 第三步：执行系统自检
            await ExceptionHandler._performSystemSelfCheck();
            
            // 第四步：自检完成后，等待3秒后进入BIOS（而不是重启）
            ExceptionHandler._updateBlueScreenProgress('系统自检完成，正在进入BIOS安全模式...');
            KernelLogger.info("ExceptionHandler", "蓝屏处理完成，3秒后进入BIOS安全模式");
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 第五步：进入BIOS安全模式
            // 移除蓝屏界面
            if (ExceptionHandler._blueScreenContainer) {
                ExceptionHandler._blueScreenContainer.remove();
                ExceptionHandler._blueScreenContainer = null;
            }
            
            // 优先尝试初始化BIOSManager（如果已加载）
            if (typeof BIOSManager !== 'undefined' && typeof BIOSManager.init === 'function') {
                try {
                    KernelLogger.info("ExceptionHandler", "初始化BIOS管理器以进入BIOS安全模式");
                    // 确保安全模式标志已设置（在init之前）
                    if (typeof SafeModeManager !== 'undefined' && typeof SafeModeManager.enableSafeMode === 'function') {
                        SafeModeManager.enableSafeMode();
                    } else if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem('__ZEROS_SAFE_MODE__', 'true');
                    }
                    
                    // 隐藏内核内容容器（如果存在）
                    if (typeof document !== 'undefined') {
                        const contentEl = document.getElementById('kernel-content');
                        if (contentEl) {
                            contentEl.style.display = 'none';
                        }
                        
                        // 显示安全模式容器和BIOS加载动画（如果存在）
                        const safeModeContainer = document.getElementById('safe-mode-container');
                        const biosLoading = document.getElementById('bios-loading');
                        if (safeModeContainer) {
                            safeModeContainer.style.display = 'flex';
                        }
                        if (biosLoading) {
                            biosLoading.style.display = 'flex';
                        }
                    }
                    
                    // 初始化BIOS管理器（会检查安全模式标志并显示BIOS界面）
                    await BIOSManager.init();
                    
                    // 隐藏加载动画（BIOS初始化完成后）
                    if (typeof document !== 'undefined') {
                        const biosLoading = document.getElementById('bios-loading');
                        if (biosLoading) {
                            biosLoading.style.display = 'none';
                        }
                    }
                    
                    KernelLogger.info("ExceptionHandler", "BIOS管理器已初始化，系统已进入BIOS安全模式");
                } catch (e) {
                    KernelLogger.error("ExceptionHandler", `初始化BIOS管理器失败: ${e.message}`, e);
                    // 如果初始化失败，降级到刷新页面
                    if (typeof window !== 'undefined' && window.location) {
                        KernelLogger.info("ExceptionHandler", "BIOS初始化失败，刷新页面以进入BIOS安全模式");
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    }
                }
            } else {
                // 如果BIOSManager未加载，刷新页面以触发安全模式
                // bootloader会在检测到内核异常标志时自动加载BIOS模块
                if (typeof window !== 'undefined' && window.location) {
                    KernelLogger.info("ExceptionHandler", "BIOSManager未加载，刷新页面以进入BIOS安全模式（bootloader将自动加载BIOS模块）");
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            }
        }
        
        /**
         * 处理系统异常
         * 类似Windows的蓝屏，强行接管屏幕，强制停止所有程序，报告异常，系统自检，自检完成后自动重启
         */
        static async _handleSystemException(message, details) {
            // 防止重复处理
            if (ExceptionHandler._systemExceptionHandling) {
                KernelLogger.warn("ExceptionHandler", "系统异常处理已在进行中，忽略重复请求");
                return;
            }
            
            ExceptionHandler._systemExceptionHandling = true;
            
            KernelLogger.error("ExceptionHandler", "系统异常：显示蓝屏", { message, details });
            
            // 强制停止所有正在运行的程序
            await ExceptionHandler._killAllProcesses();
            
            // 显示蓝屏界面
            await ExceptionHandler._showBlueScreen(message, details);
            
            // 执行系统自检
            await ExceptionHandler._performSystemSelfCheck();
            
            // 等待15-60秒后自动重启
            const waitTime = Math.floor(Math.random() * 45000) + 15000; // 15-60秒
            KernelLogger.info("ExceptionHandler", `系统将在 ${Math.floor(waitTime / 1000)} 秒后自动重启`);
            
            setTimeout(() => {
                if (typeof window !== 'undefined' && window.location) {
                    window.location.reload();
                }
            }, waitTime);
        }
        
        /**
         * 强制停止所有正在运行的程序
         */
        static async _killAllProcesses() {
            if (typeof ProcessManager === 'undefined') {
                KernelLogger.warn("ExceptionHandler", "ProcessManager未加载，无法停止程序");
                return;
            }
            
            try {
                const processTable = ProcessManager.PROCESS_TABLE;
                if (!processTable) {
                    return;
                }
                
                const pids = Array.from(processTable.keys());
                for (const pid of pids) {
                    // 跳过Exploit程序（PID 10000，使用固定值以确保在ProcessManager未加载时也能正常工作）
                    if (pid === EXPLOIT_PID || (typeof ProcessManager !== 'undefined' && ProcessManager.EXPLOIT_PID && pid === ProcessManager.EXPLOIT_PID)) {
                        continue;
                    }
                    
                    try {
                        const processInfo = processTable.get(pid);
                        if (processInfo && processInfo.status === 'running') {
                            KernelLogger.info("ExceptionHandler", `强制停止进程: PID ${pid}`);
                            await ProcessManager.terminateProcess(pid);
                        }
                    } catch (e) {
                        KernelLogger.error("ExceptionHandler", `停止进程 ${pid} 失败: ${e.message}`);
                    }
                }
            } catch (e) {
                KernelLogger.error("ExceptionHandler", `强制停止所有程序失败: ${e.message}`, e);
            }
        }
        
        /**
         * 显示蓝屏界面
         * @param {string} message 错误消息
         * @param {Object} details 错误详情
         * @param {string} errorType 错误类型（'SYSTEM_EXCEPTION' 或 'KERNEL_EXCEPTION'）
         */
        static async _showBlueScreen(message, details, errorType = 'SYSTEM_EXCEPTION') {
            if (typeof document === 'undefined') {
                KernelLogger.warn("ExceptionHandler", "document未定义，无法显示蓝屏");
                return;
            }
            
            // 移除现有的蓝屏界面（如果有）
            if (ExceptionHandler._blueScreenContainer) {
                ExceptionHandler._blueScreenContainer.remove();
            }
            
            // 创建蓝屏容器
            const container = document.createElement('div');
            container.id = 'exception-blue-screen';
            container.style.cssText = `
                cursor: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: #0078d4;
                color: #ffffff;
                font-family: 'Segoe UI', Arial, sans-serif;
                z-index: 999999;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 40px;
                box-sizing: border-box;
            `;
            
            // 创建内容容器
            const content = document.createElement('div');
            content.style.cssText = `
                max-width: 800px;
                width: 100%;
            `;
            
            // 创建错误图标
            const icon = document.createElement('div');
            icon.innerHTML = ':(';
            icon.style.cssText = `
                font-size: 120px;
                font-weight: 300;
                margin-bottom: 20px;
                text-align: center;
            `;
            
            // 创建主错误消息（根据错误类型显示不同消息）
            const mainMessage = document.createElement('div');
            if (errorType === 'KERNEL_EXCEPTION') {
                mainMessage.textContent = '你的电脑遇到严重问题，需要进入BIOS安全模式。';
            } else {
                mainMessage.textContent = '你的电脑遇到问题，需要重新启动。';
            }
            mainMessage.style.cssText = `
                font-size: 28px;
                font-weight: 300;
                margin-bottom: 20px;
                text-align: center;
            `;
            
            // 创建详细信息
            const detailDiv = document.createElement('div');
            detailDiv.style.cssText = `
                font-size: 16px;
                margin-top: 30px;
                line-height: 1.6;
                background: rgba(0, 0, 0, 0.2);
                padding: 20px;
                border-radius: 8px;
            `;
            
            const errorCode = document.createElement('div');
            errorCode.textContent = `错误代码: ${errorType}`;
            errorCode.style.cssText = `margin-bottom: 10px;`;
            
            const errorMessage = document.createElement('div');
            errorMessage.textContent = `错误信息: ${message}`;
            errorMessage.style.cssText = `margin-bottom: 10px;`;
            
            const timestamp = document.createElement('div');
            timestamp.textContent = `时间: ${new Date().toLocaleString('zh-CN')}`;
            timestamp.style.cssText = `margin-bottom: 10px;`;
            
            // 如果是内核异常，添加额外提示
            if (errorType === 'KERNEL_EXCEPTION') {
                const kernelWarning = document.createElement('div');
                kernelWarning.textContent = '⚠ 警告: 这是严重的内核异常，系统将在自检后进入BIOS安全模式。';
                kernelWarning.style.cssText = `
                    margin-top: 10px;
                    padding: 10px;
                    background: rgba(255, 0, 0, 0.2);
                    border-left: 3px solid #ff0000;
                    color: #ffcccc;
                    font-weight: 500;
                `;
                detailDiv.appendChild(kernelWarning);
            }
            
            // 先添加基本错误信息
            detailDiv.appendChild(errorCode);
            detailDiv.appendChild(errorMessage);
            detailDiv.appendChild(timestamp);
            
            // 然后添加详细信息（如果有）
            if (details && Object.keys(details).length > 0) {
                const detailsText = document.createElement('div');
                detailsText.textContent = `详细信息: ${JSON.stringify(details, null, 2)}`;
                detailsText.style.cssText = `
                    margin-top: 10px;
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    white-space: pre-wrap;
                    word-break: break-all;
                `;
                detailDiv.appendChild(detailsText);
            }
            
            // 创建进度指示器
            const progress = document.createElement('div');
            progress.id = 'blue-screen-progress';
            progress.textContent = '正在收集错误信息...';
            progress.style.cssText = `
                font-size: 14px;
                margin-top: 30px;
                text-align: center;
                opacity: 0.8;
            `;
            
            // 组装界面
            content.appendChild(icon);
            content.appendChild(mainMessage);
            content.appendChild(detailDiv);
            content.appendChild(progress);
            container.appendChild(content);
            
            // 添加到页面
            document.body.appendChild(container);
            ExceptionHandler._blueScreenContainer = container;
            
            // 阻止所有用户交互
            container.addEventListener('click', (e) => e.preventDefault());
            container.addEventListener('keydown', (e) => e.preventDefault());
        }
        
        /**
         * 更新蓝屏进度信息
         */
        static _updateBlueScreenProgress(text) {
            const progress = document.getElementById('blue-screen-progress');
            if (progress) {
                progress.textContent = text;
            }
        }
        
        /**
         * 执行系统自检
         */
        static async _performSystemSelfCheck() {
            ExceptionHandler._updateBlueScreenProgress('正在执行系统自检...');
            
            const checks = [];
            const results = {
                total: 0,
                passed: 0,
                failed: 0,
                warnings: 0
            };
            
            // 检查1: 内存
            checks.push(async () => {
                results.total++;
                try {
                    if (typeof KernelMemory !== 'undefined') {
                        const memoryStatus = KernelMemory.getStatus();
                        if (memoryStatus && memoryStatus.available) {
                            results.passed++;
                            return { name: '内存检查', status: '通过' };
                        } else {
                            results.failed++;
                            return { name: '内存检查', status: '失败', error: '内存不可用' };
                        }
                    } else {
                        results.warnings++;
                        return { name: '内存检查', status: '警告', error: 'KernelMemory未加载' };
                    }
                } catch (e) {
                    results.failed++;
                    return { name: '内存检查', status: '失败', error: e.message };
                }
            });
            
            // 检查2: 文件系统
            checks.push(async () => {
                results.total++;
                try {
                    if (typeof Disk !== 'undefined') {
                        const diskStatus = Disk.canUsed;
                        if (diskStatus) {
                            results.passed++;
                            return { name: '文件系统检查', status: '通过' };
                        } else {
                            results.failed++;
                            return { name: '文件系统检查', status: '失败', error: '磁盘不可用' };
                        }
                    } else {
                        results.warnings++;
                        return { name: '文件系统检查', status: '警告', error: 'Disk未加载' };
                    }
                } catch (e) {
                    results.failed++;
                    return { name: '文件系统检查', status: '失败', error: e.message };
                }
            });
            
            // 检查3: 进程管理器
            checks.push(async () => {
                results.total++;
                try {
                    if (typeof ProcessManager !== 'undefined') {
                        const processTable = ProcessManager.PROCESS_TABLE;
                        if (processTable) {
                            results.passed++;
                            return { name: '进程管理器检查', status: '通过' };
                        } else {
                            results.failed++;
                            return { name: '进程管理器检查', status: '失败', error: '进程表不可用' };
                        }
                    } else {
                        results.warnings++;
                        return { name: '进程管理器检查', status: '警告', error: 'ProcessManager未加载' };
                    }
                } catch (e) {
                    results.failed++;
                    return { name: '进程管理器检查', status: '失败', error: e.message };
                }
            });
            
            // 执行所有检查
            for (let i = 0; i < checks.length; i++) {
                try {
                    const check = checks[i];
                    const result = await check();
                    ExceptionHandler._updateBlueScreenProgress(
                        `系统自检中... (${i + 1}/${checks.length}) ${result.name}: ${result.status}`
                    );
                    await new Promise(resolve => setTimeout(resolve, 500)); // 延迟显示
                } catch (e) {
                    results.failed++;
                    ExceptionHandler._updateBlueScreenProgress(`检查失败: ${e.message}`);
                }
            }
            
            // 显示自检结果
            const successRate = results.total > 0 
                ? ((results.passed / results.total) * 100).toFixed(1)
                : 0;
            
            ExceptionHandler._updateBlueScreenProgress(
                `系统自检完成: ${results.passed}/${results.total} 通过 (${successRate}%), ` +
                `${results.failed} 失败, ${results.warnings} 警告`
            );
            
            // 记录自检结果
            KernelLogger.info("ExceptionHandler", `系统自检完成: ${JSON.stringify(results)}`);
            
            return results;
        }
        
        /**
         * 处理程序异常
         * 强制停止该程序运行，kill进程，然后报告用户
         */
        static async _handleProgramException(message, details, pid) {
            KernelLogger.error("ExceptionHandler", `程序异常 [PID: ${pid}]: ${message}`, details);
            
            if (typeof ProcessManager === 'undefined') {
                KernelLogger.error("ExceptionHandler", "ProcessManager未加载，无法终止程序");
                return;
            }
            
            // 获取进程信息
            let processInfo = null;
            let programName = '未知程序';
            
            try {
                const processTable = ProcessManager.PROCESS_TABLE;
                if (processTable && pid) {
                    processInfo = processTable.get(pid);
                    if (processInfo) {
                        programName = processInfo.programName || `PID ${pid}`;
                    }
                }
            } catch (e) {
                KernelLogger.error("ExceptionHandler", `获取进程信息失败: ${e.message}`);
            }
            
            // 终止进程
            try {
                if (pid && processInfo) {
                    KernelLogger.info("ExceptionHandler", `正在终止异常程序: ${programName} (PID: ${pid})`);
                    // 使用 killProgram 方法（terminateProcess 不存在）
                    if (typeof ProcessManager.killProgram === 'function') {
                        await ProcessManager.killProgram(pid, true); // force = true，强制终止
                        KernelLogger.info("ExceptionHandler", `程序已终止: ${programName} (PID: ${pid})`);
                    } else {
                        KernelLogger.error("ExceptionHandler", "ProcessManager.killProgram 方法不可用");
                    }
                } else {
                    KernelLogger.warn("ExceptionHandler", `无法终止程序: PID ${pid} 不存在或无效`);
                }
            } catch (e) {
                KernelLogger.error("ExceptionHandler", `终止程序失败: ${e.message}`, e);
            }
            
            // 显示通知给用户
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                try {
                    // 使用 EXPLOIT_PID 作为通知的 PID（因为异常处理是系统级操作）
                    const notificationPid = typeof ProcessManager !== 'undefined' && ProcessManager.EXPLOIT_PID ? ProcessManager.EXPLOIT_PID : EXPLOIT_PID;
                    await NotificationManager.createNotification(notificationPid, {
                        type: 'snapshot',
                        title: '程序异常',
                        content: `程序 "${programName}" 发生异常并已被强制终止。\n错误: ${message}`,
                        duration: 10000
                    });
                } catch (e) {
                    KernelLogger.error("ExceptionHandler", `显示通知失败: ${e.message}`, e);
                }
            } else {
                KernelLogger.warn("ExceptionHandler", "NotificationManager 不可用或 createNotification 方法不存在");
            }
        }
        
        /**
         * 处理服务异常
         * 仅记录日志（使用内核日志模块）
         */
        static _handleServiceException(message, details) {
            KernelLogger.error("ExceptionHandler", `服务异常: ${message}`, details);
            // 服务异常只需要记录日志，不需要其他操作
        }
        
        /**
         * 检查是否可以正常启动（用于启动时检查内核异常标志）
         * @returns {Promise<boolean>} 是否可以正常启动
         */
        static async canNormalBoot() {
            // 检查内存中的内核异常标志
            if (ExceptionHandler._kernelExceptionFlag) {
                KernelLogger.warn("ExceptionHandler", "检测到内存中的内核异常标志，阻止正常启动");
                return false;
            }
            
            // 检查持久化的标志（优先使用LStorage）
            if (typeof LStorage !== 'undefined') {
                try {
                    const kernelExceptionFlag = await LStorage.getSystemStorage('exceptionHandler.kernelExceptionFlag');
                    if (kernelExceptionFlag === true) {
                        ExceptionHandler._kernelExceptionFlag = true; // 同步到内存
                        KernelLogger.warn("ExceptionHandler", "检测到持久化的内核异常标志，阻止正常启动");
                        return false;
                    }
                    
                    const blockNormalBoot = await LStorage.getSystemStorage('exceptionHandler.blockNormalBoot');
                    if (blockNormalBoot === true) {
                        KernelLogger.warn("ExceptionHandler", "检测到阻止正常启动标志，阻止正常启动");
                        return false;
                    }
                } catch (e) {
                    // 如果LStorage访问失败，尝试使用localStorage降级方案
                    KernelLogger.debug("ExceptionHandler", `LStorage访问失败，尝试localStorage降级方案: ${e.message}`);
                }
            }
            
            // 降级方案：检查localStorage
            if (typeof localStorage !== 'undefined') {
                try {
                    const kernelExceptionFlag = localStorage.getItem('__ZEROS_KERNEL_EXCEPTION_FLAG__');
                    if (kernelExceptionFlag === 'true') {
                        ExceptionHandler._kernelExceptionFlag = true; // 同步到内存
                        KernelLogger.warn("ExceptionHandler", "检测到localStorage中的内核异常标志，阻止正常启动");
                        return false;
                    }
                    
                    const blockNormalBoot = localStorage.getItem('__ZEROS_BLOCK_NORMAL_BOOT__');
                    if (blockNormalBoot === 'true') {
                        KernelLogger.warn("ExceptionHandler", "检测到localStorage中的阻止正常启动标志，阻止正常启动");
                        return false;
                    }
                } catch (e) {
                    // 忽略localStorage错误
                    KernelLogger.debug("ExceptionHandler", `localStorage访问失败: ${e.message}`);
                }
            }
            
            return true;
        }
        
        /**
         * 清除内核异常标志（在BIOS中选择立即全面自检并强制进入系统时调用）
         */
        static async clearKernelExceptionFlag() {
            ExceptionHandler._kernelExceptionFlag = false;
            
            if (typeof LStorage !== 'undefined') {
                try {
                    await LStorage.setSystemStorage('exceptionHandler.kernelExceptionFlag', false);
                    await LStorage.setSystemStorage('exceptionHandler.blockNormalBoot', false);
                    // 也清除相关的异常信息
                    await LStorage.setSystemStorage('exceptionHandler.kernelExceptionMessage', null);
                    await LStorage.setSystemStorage('exceptionHandler.kernelExceptionDetails', null);
                    await LStorage.setSystemStorage('exceptionHandler.kernelExceptionTimestamp', null);
                    KernelLogger.info("ExceptionHandler", "内核异常标志已清除，系统可以正常启动");
                } catch (e) {
                    KernelLogger.error("ExceptionHandler", `清除内核异常标志失败: ${e.message}`);
                }
            }
            
            // 同时清除localStorage中的降级标志
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.removeItem('__ZEROS_KERNEL_EXCEPTION_FLAG__');
                    localStorage.removeItem('__ZEROS_KERNEL_EXCEPTION_MESSAGE__');
                    localStorage.removeItem('__ZEROS_KERNEL_EXCEPTION_TIMESTAMP__');
                    localStorage.removeItem('__ZEROS_BLOCK_NORMAL_BOOT__');
                    KernelLogger.info("ExceptionHandler", "localStorage中的内核异常标志已清除");
                } catch (e) {
                    KernelLogger.warn("ExceptionHandler", `清除localStorage中的内核异常标志失败: ${e.message}`);
                }
            }
        }
        
        /**
         * 获取异常等级枚举（供外部使用）
         */
        static get ExceptionLevel() {
            return ExceptionLevel;
        }
    }
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.ExceptionHandler = ExceptionHandler;
    }
    
    // 注册到 POOL
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__ || !POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "ExceptionHandler", ExceptionHandler);
        } catch (e) {
            // POOL 可能还未完全初始化，忽略错误
        }
    }
    
    // 发布模块加载信号
    if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
        try {
            DependencyConfig.publishSignal("../kernel/core/exceptionHM/exceptionHandler.js");
        } catch (e) {
            // 忽略错误
        }
    }
    
    // 自动初始化（异步）
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
            await ExceptionHandler.init();
        });
    } else {
        // 立即初始化（异步）
        (async () => {
            await ExceptionHandler.init();
        })();
    }
    
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
  