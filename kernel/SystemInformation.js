// ZerOS 系统信息模块
// 集中管理系统版本、内核版本、构建信息、开发者信息等

KernelLogger.info("SystemInformation", "模块初始化");

class SystemInformation {
    // 系统版本
    static SYSTEM_VERSION = '0.4.3';
    
    // 内核版本
    static KERNEL_VERSION = '0.4.9';
    
    // 构建日期
    static BUILD_DATE = new Date('2024-11-28');
    
    // 系统名称
    static SYSTEM_NAME = 'ZerOS';
    
    // 系统描述
    static SYSTEM_DESCRIPTION = '基于浏览器实现的虚拟操作系统内核';
    
    // 开发团队信息
    static DEVELOPERS = [
        {
            organization: 'KitePromiss 工作室',
            role: '全栈开发者',
            name: '萱崽Aa'
        },
        {
            organization: '个人开发者',
            role: '内核开发',
            name: '默默'
        },
        {
            organization: 'Open AI',
            role: 'AI 模型',
            name: 'Gemini 3 Pro'
        }
    ];
    
    // 系统 Logo 路径（相对于 test/index.html）
    static LOGO_PATH = 'zeros-logo.svg';
    
    /**
     * 获取系统版本
     * @returns {string} 系统版本
     */
    static getSystemVersion() {
        return SystemInformation.SYSTEM_VERSION;
    }
    
    /**
     * 获取内核版本
     * @returns {string} 内核版本
     */
    static getKernelVersion() {
        // 尝试从 KernelLogger 获取版本（如果可用）
        if (typeof KernelLogger !== 'undefined' && KernelLogger.VERSION) {
            return KernelLogger.VERSION;
        }
        return SystemInformation.KERNEL_VERSION;
    }
    
    /**
     * 获取构建日期
     * @param {string} locale 语言环境，默认为 'zh-CN'
     * @returns {string} 格式化的构建日期
     */
    static getBuildDate(locale = 'zh-CN') {
        return SystemInformation.BUILD_DATE.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    /**
     * 获取系统名称
     * @returns {string} 系统名称
     */
    static getSystemName() {
        return SystemInformation.SYSTEM_NAME;
    }
    
    /**
     * 获取系统描述
     * @returns {string} 系统描述
     */
    static getSystemDescription() {
        return SystemInformation.SYSTEM_DESCRIPTION;
    }
    
    /**
     * 获取开发团队信息
     * @returns {Array<Object>} 开发者信息数组
     */
    static getDevelopers() {
        return SystemInformation.DEVELOPERS;
    }
    
    /**
     * 获取 Logo 路径
     * @returns {string} Logo 路径
     */
    static getLogoPath() {
        return SystemInformation.LOGO_PATH;
    }
    
    /**
     * 获取完整的系统信息对象
     * @returns {Object} 系统信息对象
     */
    static getSystemInfo() {
        return {
            systemName: SystemInformation.getSystemName(),
            systemVersion: SystemInformation.getSystemVersion(),
            kernelVersion: SystemInformation.getKernelVersion(),
            buildDate: SystemInformation.getBuildDate(),
            description: SystemInformation.getSystemDescription(),
            logoPath: SystemInformation.getLogoPath(),
            developers: SystemInformation.getDevelopers()
        };
    }
    
    /**
     * 获取宿主环境信息
     * @returns {Object} 宿主环境信息对象
     */
    static getHostEnvironment() {
        const browserInfo = SystemInformation._getBrowserInfo();
        
        return {
            browser: browserInfo.name,
            browserVersion: browserInfo.version,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '未知',
            platform: typeof navigator !== 'undefined' ? navigator.platform : '未知',
            language: typeof navigator !== 'undefined' ? navigator.language : '未知',
            languages: typeof navigator !== 'undefined' && navigator.languages ? [...navigator.languages] : [],
            screenWidth: typeof window !== 'undefined' ? window.screen.width : 0,
            screenHeight: typeof window !== 'undefined' ? window.screen.height : 0,
            viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
            viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
            hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null,
            deviceMemory: typeof navigator !== 'undefined' && navigator.deviceMemory ? navigator.deviceMemory : null,
            cookieEnabled: typeof navigator !== 'undefined' ? navigator.cookieEnabled : false,
            onLine: typeof navigator !== 'undefined' ? navigator.onLine : false
        };
    }
    
    /**
     * 获取浏览器信息
     * @returns {Object} { name: string, version: string }
     */
    static _getBrowserInfo() {
        if (typeof navigator === 'undefined') {
            return { name: '未知', version: '未知' };
        }
        
        const ua = navigator.userAgent;
        let browserName = '未知';
        let browserVersion = '未知';
        
        if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
            browserName = 'Chrome';
            const match = ua.match(/Chrome\/(\d+)/);
            if (match) browserVersion = match[1];
        } else if (ua.indexOf('Firefox') > -1) {
            browserName = 'Firefox';
            const match = ua.match(/Firefox\/(\d+)/);
            if (match) browserVersion = match[1];
        } else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
            browserName = 'Safari';
            const match = ua.match(/Version\/(\d+)/);
            if (match) browserVersion = match[1];
        } else if (ua.indexOf('Edg') > -1) {
            browserName = 'Edge';
            const match = ua.match(/Edg\/(\d+)/);
            if (match) browserVersion = match[1];
        } else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) {
            browserName = 'Opera';
            const match = ua.match(/(?:Opera|OPR)\/(\d+)/);
            if (match) browserVersion = match[1];
        }
        
        return { name: browserName, version: browserVersion };
    }
    
    /**
     * 注册到 POOL
     */
    static _registerToPool() {
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                // 确保 KERNEL_GLOBAL_POOL 类别存在
                if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                    POOL.__INIT__("KERNEL_GLOBAL_POOL");
                }
                POOL.__ADD__("KERNEL_GLOBAL_POOL", "SystemInformation", SystemInformation);
                KernelLogger.debug("SystemInformation", "已注册到 POOL");
            } catch (e) {
                KernelLogger.warn("SystemInformation", `注册到 POOL 失败: ${e.message}`);
            }
        }
    }
}

// 初始化：注册到 POOL
SystemInformation._registerToPool();

// 导出到全局（如果 POOL 不可用）
if (typeof window !== 'undefined') {
    window.SystemInformation = SystemInformation;
} else if (typeof globalThis !== 'undefined') {
    globalThis.SystemInformation = SystemInformation;
}

// 发布信号
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/SystemInformation.js");
} else {
    // 如果 DependencyConfig 还未加载，延迟发布信号
    if (typeof document !== 'undefined' && document.body) {
        const publishWhenReady = () => {
            if (typeof DependencyConfig !== 'undefined') {
                DependencyConfig.publishSignal("../kernel/SystemInformation.js");
            } else {
                setTimeout(publishWhenReady, 10);
            }
        };
        publishWhenReady();
    }
}

