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
    
    // 清理过期缓存（异步执行，不阻塞初始化）
    cleanupExpiredCache().catch(e => {
        KernelLogger.warn("FSInit", `清理过期缓存失败: ${e.message}`);
    });
}

/**
 * 清理过期缓存
 */
async function cleanupExpiredCache() {
    try {
        // 检查 fetch 是否可用
        if (typeof fetch === 'undefined') {
            KernelLogger.debug("FSInit", "fetch 不可用，跳过缓存清理");
            return;
        }
        
        // 定义过期时间（1天，单位：毫秒）
        const EXPIRY_TIME = 24 * 60 * 60 * 1000;
        const now = Date.now();
        
        // 列出 D:/cache/ 目录下的所有文件
        const listUrl = new URL('/service/FSDirve.php', window.location.origin);
        listUrl.searchParams.set('action', 'list_dir');
        listUrl.searchParams.set('path', 'D:/cache/');
        
        const listResponse = await fetch(listUrl.toString());
        if (!listResponse.ok) {
            // 如果目录不存在或无法访问，直接返回
            KernelLogger.debug("FSInit", "缓存目录不存在或无法访问，跳过清理");
            return;
        }
        
        const listResult = await listResponse.json();
        if (listResult.status !== 'success' || !listResult.data || !Array.isArray(listResult.data)) {
            return;
        }
        
        // 查找所有过期文件
        const expiredFiles = [];
        for (const item of listResult.data) {
            if (item.type === 'file' && item.modified) {
                // 解析修改时间
                const modifiedTime = new Date(item.modified).getTime();
                const age = now - modifiedTime;
                
                // 如果文件超过过期时间，标记为过期
                if (age > EXPIRY_TIME) {
                    expiredFiles.push(item);
                }
            }
        }
        
        // 删除所有过期文件
        let deletedCount = 0;
        for (const file of expiredFiles) {
            try {
                const deleteUrl = new URL('/service/FSDirve.php', window.location.origin);
                deleteUrl.searchParams.set('action', 'delete_file');
                deleteUrl.searchParams.set('path', 'D:/cache/');
                deleteUrl.searchParams.set('fileName', file.name);
                
                const deleteResponse = await fetch(deleteUrl.toString());
                if (deleteResponse.ok) {
                    const deleteResult = await deleteResponse.json();
                    if (deleteResult.status === 'success') {
                        deletedCount++;
                    }
                }
            } catch (e) {
                // 单个文件删除失败不影响其他文件的删除
                KernelLogger.debug("FSInit", `删除过期文件 ${file.name} 失败: ${e.message}`);
            }
        }
        
        if (deletedCount > 0) {
            KernelLogger.info("FSInit", `已清理 ${deletedCount} 个过期缓存文件`);
        }
    } catch (e) {
        KernelLogger.warn("FSInit", `清理过期缓存时出错: ${e.message}`);
        // 不抛出错误，允许系统继续启动
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
