// 文件系统初始化函数
async function init() {
    // fileSystem开始初始化
    KernelLogger.info("FSInit", "模块初始化");

    // 初始化磁盘虚拟硬件
    // 使用异步等待确保 Disk 模块已加载
    try {
        const Dependency = (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function') 
            ? POOL.__GET__("KERNEL_GLOBAL_POOL", "Dependency") 
            : null;
        
        if (Dependency && typeof Dependency.waitLoaded === 'function') {
            // 等待Disk模块加载
            try {
                await Dependency.waitLoaded("../kernel/fileSystem/disk.js", {
                    interval: 50,
                    timeout: 2000,  // 增加超时时间
                });
                
                if (typeof Disk !== 'undefined' && Disk && typeof Disk.init === 'function') {
                    Disk.init();
                    KernelLogger.info("FSInit", "磁盘初始化已启动");
                } else {
                    KernelLogger.warn("FSInit", "Disk 模块未定义或缺少 init 方法");
                }
            } catch (e) {
                KernelLogger.error("FSInit", `等待Disk模块加载失败: ${e.message}`);
                // 尝试直接初始化（可能已经加载）
                if (typeof Disk !== 'undefined' && Disk && typeof Disk.init === 'function') {
                    Disk.init();
                    KernelLogger.info("FSInit", "磁盘初始化已启动（降级方案）");
                }
            }
        } else {
            // 如果 Dependency 不可用，直接尝试初始化（可能已经加载）
            if (typeof Disk !== 'undefined' && Disk && typeof Disk.init === 'function') {
                Disk.init();
                KernelLogger.info("FSInit", "磁盘初始化已启动（直接调用）");
            } else {
                KernelLogger.warn("FSInit", "Dependency 或 Disk 未加载，延迟初始化");
                // 延迟重试（最多重试5次）
                let retryCount = 0;
                const maxRetries = 5;
                const retryInterval = 200;
                
                const retryInit = () => {
                    if (retryCount >= maxRetries) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error("FSInit", "磁盘初始化重试次数超限，停止重试");
                        } else {
                            console.error("[内核][FSInit] 磁盘初始化重试次数超限");
                        }
                        return;
                    }
                    
                    retryCount++;
                    setTimeout(() => {
                        if (typeof Disk !== 'undefined' && Disk && typeof Disk.init === 'function') {
                            try {
                                Disk.init();
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.info("FSInit", `磁盘初始化已启动（延迟重试 ${retryCount}）`);
                                }
                            } catch (e) {
                                // 如果初始化失败，不再重试
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error("FSInit", `磁盘初始化失败: ${e.message}`);
                                }
                            }
                        } else if (retryCount < maxRetries) {
                            // 只有在还有重试次数时才继续
                            retryInit();
                        }
                    }, retryInterval);
                };
                
                retryInit();
            }
        }
    } catch (e) {
        KernelLogger.error("FSInit", `初始化失败: ${e.message}`, e);
        // 即使失败也发布信号，避免阻塞其他模块
    }

    // 注意：应用程序文件已直接存在于 D:/application/ 目录下，无需创建链接映射
    // 所有程序路径已在 applicationAssets.js 中配置为 D:/application/... 格式

    // fileSystem初始化完成
    if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
        DependencyConfig.publishSignal("../kernel/fileSystem/init.js");
    }
}

// 自动初始化（如果DOM已就绪）
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init().catch(e => {
                KernelLogger.error("FSInit", `自动初始化失败: ${e.message}`, e);
            });
        });
    } else {
        // DOM已就绪，立即初始化
        init().catch(e => {
            KernelLogger.error("FSInit", `自动初始化失败: ${e.message}`, e);
        });
    }
} else {
    // 非浏览器环境，直接初始化
    init().catch(e => {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.error("FSInit", `初始化失败: ${e.message}`, e);
        } else {
            console.error("[内核][FSInit] 初始化失败", e);
        }
    });
}
