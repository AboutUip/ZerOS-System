// ZerOS 系统信息模块
// 集中管理系统版本、内核版本、构建信息、开发者信息等

KernelLogger.info("SystemInformation", "模块初始化");

class SystemInformation {
    // 系统版本
    static SYSTEM_VERSION = '0.6.5';
    
    // 内核版本
    static KERNEL_VERSION = '0.6.4';
    
    // 构建日期
    static BUILD_DATE = new Date('2025-11-28');
    
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
            organization: 'KitePromiss 工作室',
            role: '后端开发者',
            name: 'yan'
        },
        {
            organization: '个人开发者',
            role: '后端开发者',
            name:'qianjiangjiangjiang'
        },
        {
            organization: 'KitePromiss 工作室',
            role: '后端开发者',
            name: 'xianyu'
        },
        {
            organization: '个人开发者',
            role: '内核开发',
            name: '默默'
        },
        {
            organization: 'AI模型',
            role: 'Google',
            name: 'Gemini 3 Pro'
        }
    ];
    
    // 赞助商信息（名称、链接、描述可选）
    static SPONSORS = [
        {
            name: 'AxtTeam',
            link: 'https://uapis.cn/',
            description: 'API赞助'
        }
    ];
    
    // 合作伙伴信息（名称、链接、描述可选）
    static PARTNERS = [
        {
            name: 'mc-yzy15',
            link: 'https://github.com/mc-yzy15',
            description: '部分ZOM程序合作'
        }
    ];
    
    // 系统 Logo 路径（相对于 test/index.html）
    static LOGO_PATH = 'zeros-logo.svg';
    
    // ==================== 系统服务地址配置 ====================
    
    // 后端类型枚举
    static BACKEND_TYPE = {
        PHP: 'PHP',
        SPRINGBOOT: 'SPRINGBOOT'
    };
    
    // 后端配置（可通过 LStorage 或环境变量配置）
    static _backendConfig = {
        type: SystemInformation.BACKEND_TYPE.PHP,
        phpPort: 8089,                              // PHP 默认端口
        springBootPort: 8080                        // SpringBoot 默认端口
    };
    
    // 服务名称常量（不含后缀，根据后端类型自动添加）
    static SERVICE_NAMES = {
        FSDIRVE: 'FSDirve',
        COMPRESSION_DIRVE: 'CompressionDirve',
        IMAGE_PROXY: 'ImageProxy',
        AUDIO_PROXY: 'audio-proxy',
        MODULE_PROXY: 'module-proxy',
        DISKMANAGER: 'DISKMANAGER'
    };
    
    // 服务基础路径
    static SERVICE_BASE_PATH = '/system/service';
    
    /**
     * 初始化后端配置（从 LStorage 或环境变量读取）
     */
    static _initBackendConfig() {
        try {
            // 尝试从 LStorage 读取配置
            if (typeof LStorage !== 'undefined') {
                const config = LStorage.getSystemStorage('system.backendConfig');
                if (config) {
                    SystemInformation._backendConfig = {
                        ...SystemInformation._backendConfig,
                        ...config
                    };
                }
            }
            
            // 尝试从环境变量或 URL 参数读取
            if (typeof window !== 'undefined' && window.location) {
                const urlParams = new URLSearchParams(window.location.search);
                const backendType = urlParams.get('backend') || urlParams.get('backendType');
                if (backendType && Object.values(SystemInformation.BACKEND_TYPE).includes(backendType.toUpperCase())) {
                    SystemInformation._backendConfig.type = backendType.toUpperCase();
                }
            }
        } catch (e) {
            KernelLogger.warn("SystemInformation", `初始化后端配置失败: ${e.message}`);
        }
    }
    
    /**
     * 获取当前后端类型
     * @returns {string} 后端类型（PHP 或 SPRINGBOOT）
     */
    static getBackendType() {
        return SystemInformation._backendConfig.type;
    }
    
    /**
     * 设置后端类型
     * @param {string} type 后端类型（PHP 或 SPRINGBOOT）
     */
    static setBackendType(type) {
        if (Object.values(SystemInformation.BACKEND_TYPE).includes(type)) {
            SystemInformation._backendConfig.type = type;
            // 保存到 LStorage
            if (typeof LStorage !== 'undefined') {
                LStorage.setSystemStorage('system.backendConfig', SystemInformation._backendConfig);
            }
        }
    }
    
    /**
     * 获取服务路径后缀（根据后端类型）
     * @returns {string} 后缀（.php 或空字符串）
     */
    static _getServiceSuffix() {
        return SystemInformation._backendConfig.type === SystemInformation.BACKEND_TYPE.PHP ? '.php' : '';
    }
    
    /**
     * 获取服务完整路径（根据后端类型自动添加后缀）
     * @param {string} serviceName 服务名称（如 'FSDirve'）
     * @returns {string} 完整服务路径（如 '/system/service/FSDirve.php' 或 '/system/service/FSDirve'）
     */
    static getServicePath(serviceName) {
        const suffix = SystemInformation._getServiceSuffix();
        return `${SystemInformation.SERVICE_BASE_PATH}/${serviceName}${suffix}`;
    }

    /**
     * 获取源地址(基于location.origin,但是移除端口号)
     * @returns {string} 源地址
     */
    static getOriginURL() {
        const origin = window.location.origin;
        return origin.replace(/:\d+$/, '');
    }
    
    /**
     * 获取系统基础URL（origin）
     * 根据后端类型自动选择端口
     * 注意：当后端类型为SpringBoot时，强制使用SpringBoot端口，确保请求发送到正确的后端服务
     * @returns {string} 系统基础URL
     */
    static getOrigin() {
        // 根据后端类型选择端口
        const port = SystemInformation._backendConfig.type === SystemInformation.BACKEND_TYPE.PHP
            ? SystemInformation._backendConfig.phpPort
            : SystemInformation._backendConfig.springBootPort;
        
        
        // 降级：使用默认PHP端口
        return `${SystemInformation.getOriginURL()}:${port}`;
    }
    
    /**
     * 获取文件系统服务路径
     * @returns {string} 服务路径（不含 origin）
     */
    static getFSDirvePath() {
        return SystemInformation.getServicePath(SystemInformation.SERVICE_NAMES.FSDIRVE);
    }
    
    /**
     * 获取文件系统服务URL
     * @returns {string} 完整的文件系统服务URL
     */
    static getFSDirveUrl() {
        return new URL(SystemInformation.getFSDirvePath(), SystemInformation.getOrigin()).toString();
    }
    
    /**
     * 获取压缩服务路径
     * @returns {string} 服务路径（不含 origin）
     */
    static getCompressionDirvePath() {
        return SystemInformation.getServicePath(SystemInformation.SERVICE_NAMES.COMPRESSION_DIRVE);
    }
    
    /**
     * 获取压缩服务URL
     * @returns {string} 完整的压缩服务URL
     */
    static getCompressionDirveUrl() {
        return new URL(SystemInformation.getCompressionDirvePath(), SystemInformation.getOrigin()).toString();
    }
    
    /**
     * 获取图片代理服务路径
     * @returns {string} 服务路径（不含 origin）
     */
    static getImageProxyPath() {
        return SystemInformation.getServicePath(SystemInformation.SERVICE_NAMES.IMAGE_PROXY);
    }
    
    /**
     * 获取图片代理服务URL
     * @returns {string} 完整的图片代理服务URL
     */
    static getImageProxyUrl() {
        return new URL(SystemInformation.getImageProxyPath(), SystemInformation.getOrigin()).toString();
    }
    
    /**
     * 获取音频代理服务路径
     * @returns {string} 服务路径（不含 origin）
     */
    static getAudioProxyPath() {
        return SystemInformation.getServicePath(SystemInformation.SERVICE_NAMES.AUDIO_PROXY);
    }
    
    /**
     * 获取音频代理服务URL
     * @returns {string} 完整的音频代理服务URL
     */
    static getAudioProxyUrl() {
        return new URL(SystemInformation.getAudioProxyPath(), SystemInformation.getOrigin()).toString();
    }
    
    /**
     * 获取模块代理服务路径
     * @returns {string} 服务路径（不含 origin）
     */
    static getModuleProxyPath() {
        return SystemInformation.getServicePath(SystemInformation.SERVICE_NAMES.MODULE_PROXY);
    }
    
    /**
     * 获取模块代理服务URL
     * @returns {string} 完整的模块代理服务URL
     */
    static getModuleProxyUrl() {
        return new URL(SystemInformation.getModuleProxyPath(), SystemInformation.getOrigin()).toString();
    }
    
    /**
     * 构建完整的服务URL
     * @param {string} serviceName 服务名称（如 'FSDirve'）或完整路径
     * @param {Object} params 查询参数对象（可选）
     * @returns {string} 完整的服务URL
     */
    static buildServiceUrl(serviceName, params = null) {
        // 如果已经是完整路径，直接使用；否则根据服务名称构建
        let servicePath = serviceName.startsWith('/') 
            ? serviceName 
            : SystemInformation.getServicePath(serviceName);
        
        const url = new URL(servicePath, SystemInformation.getOrigin());
        if (params && typeof params === 'object') {
            Object.keys(params).forEach(key => {
                url.searchParams.set(key, params[key]);
            });
        }
        return url.toString();
    }
    
    /**
     * 构建URL对象（用于需要修改查询参数的场景）
     * @param {string} serviceName 服务名称（如 'FSDirve'）或完整路径
     * @returns {URL} URL对象
     */
    static buildServiceUrlObject(serviceName) {
        // 如果已经是完整路径，直接使用；否则根据服务名称构建
        const servicePath = serviceName.startsWith('/') 
            ? serviceName 
            : SystemInformation.getServicePath(serviceName);
        
        return new URL(servicePath, SystemInformation.getOrigin());
    }
    
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
     * 获取赞助商列表
     * @returns {Array<Object>} 赞助商数组 { name, link?, description? }
     */
    static getSponsors() {
        return SystemInformation.SPONSORS || [];
    }
    
    /**
     * 获取合作伙伴列表
     * @returns {Array<Object>} 合作伙伴数组 { name, link?, description? }
     */
    static getPartners() {
        return SystemInformation.PARTNERS || [];
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
            developers: SystemInformation.getDevelopers(),
            sponsors: SystemInformation.getSponsors(),
            partners: SystemInformation.getPartners()
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

// 初始化：初始化后端配置并注册到 POOL
SystemInformation._initBackendConfig();
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

