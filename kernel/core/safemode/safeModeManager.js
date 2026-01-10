// 安全模式管理器
// 负责管理系统的安全模式状态和逻辑

KernelLogger.info("SafeModeManager", "模块初始化");

(function(window) {
    'use strict';
    
    class SafeModeManager {
        // 安全模式状态标志
        static _safeModeEnabled = false;
        static _initialized = false;
        
        /**
         * 检查是否启用了安全模式
         * @returns {boolean} 是否处于安全模式
         */
        static isSafeMode() {
            // 从sessionStorage读取安全模式标志（在加载阶段设置）
            try {
                if (typeof sessionStorage !== 'undefined') {
                    const safeModeFlag = sessionStorage.getItem('__ZEROS_SAFE_MODE__');
                    SafeModeManager._safeModeEnabled = safeModeFlag === 'true';
                }
            } catch (e) {
                // sessionStorage可能不可用，忽略错误
            }
            
            return SafeModeManager._safeModeEnabled;
        }
        
        /**
         * 启用安全模式
         */
        static enableSafeMode() {
            SafeModeManager._safeModeEnabled = true;
            try {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('__ZEROS_SAFE_MODE__', 'true');
                }
            } catch (e) {
                // sessionStorage可能不可用，忽略错误
            }
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("SafeModeManager", "安全模式已启用");
            } else {
                console.log("[SafeModeManager] 安全模式已启用");
            }
        }
        
        /**
         * 禁用安全模式
         */
        static disableSafeMode() {
            SafeModeManager._safeModeEnabled = false;
            try {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.removeItem('__ZEROS_SAFE_MODE__');
                }
            } catch (e) {
                // sessionStorage可能不可用，忽略错误
            }
        }
        
        /**
         * 初始化安全模式管理器
         */
        static init() {
            if (SafeModeManager._initialized) {
                return;
            }
            
            SafeModeManager._initialized = true;
            
            // 检查是否处于安全模式
            const isSafeMode = SafeModeManager.isSafeMode();
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("SafeModeManager", `安全模式管理器初始化完成，安全模式状态: ${isSafeMode ? '已启用' : '未启用'}`);
            }
            
            // 如果处于安全模式，显示安全模式界面
            if (isSafeMode) {
                SafeModeManager._showSafeModeInterface();
            }
        }
        
        /**
         * 显示安全模式界面
         */
        static _showSafeModeInterface() {
            if (typeof document === 'undefined') {
                return;
            }
            
            const safeModeContainer = document.getElementById('safe-mode-container');
            if (safeModeContainer) {
                safeModeContainer.style.display = 'flex';
                
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("SafeModeManager", "安全模式界面已显示");
                }
            }
        }
        
        /**
         * 隐藏安全模式界面
         */
        static hideSafeModeInterface() {
            if (typeof document === 'undefined') {
                return;
            }
            
            const safeModeContainer = document.getElementById('safe-mode-container');
            if (safeModeContainer) {
                safeModeContainer.style.display = 'none';
            }
        }
    }
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.SafeModeManager = SafeModeManager;
    }
    
    // 注册到 POOL（如果 POOL 已加载）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__ || !POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "SafeModeManager", SafeModeManager);
        } catch (e) {
            // POOL 可能还未完全初始化，忽略错误
        }
    }
    
    // 发布模块加载信号（如果 DependencyConfig 已加载）
    if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
        try {
            DependencyConfig.publishSignal("../kernel/core/safemode/safeModeManager.js");
        } catch (e) {
            // 忽略错误
        }
    }
    
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);

