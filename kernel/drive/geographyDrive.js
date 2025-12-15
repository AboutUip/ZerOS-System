// 地理位置驱动管理器
// 负责管理系统级的地理位置功能，包括高精度定位、低精度定位、地址信息获取等
// 提供统一的地理位置 API 供程序使用

KernelLogger.info("GeographyDrive", "模块初始化");

class GeographyDrive {
    // ==================== 常量定义 ====================
    
    /**
     * 定位精度枚举
     */
    static ACCURACY = {
        HIGH: 'HIGH',           // 高精度（使用原生 API）
        LOW: 'LOW'               // 低精度（使用第三方 API）
    };
    
    /**
     * 定位状态枚举
     */
    static STATUS = {
        IDLE: 'IDLE',           // 空闲
        LOCATING: 'LOCATING',    // 定位中
        SUCCESS: 'SUCCESS',      // 成功
        FAILED: 'FAILED'         // 失败
    };
    
    /**
     * 第三方 API 地址
     */
    static API_URL = 'https://api-v1.cenguigui.cn/api/UserInfo/apilet.php';
    
    // ==================== 内部状态 ====================
    
    /**
     * 缓存的位置信息
     * @type {Object|null}
     */
    static _cachedLocation = null;
    
    /**
     * 缓存的时间戳
     * @type {number|null}
     */
    static _cachedTimestamp = null;
    
    /**
     * 缓存过期时间（毫秒）
     */
    static _cacheExpireTime = 5 * 60 * 1000; // 5分钟
    
    /**
     * 正在进行的定位请求 Promise（用于防止并发重复请求）
     * @type {Promise<Object>|null}
     */
    static _pendingRequest = null;
    
    // ==================== 初始化 ====================
    
    /**
     * 初始化地理位置驱动
     */
    static init() {
        KernelLogger.info("GeographyDrive", "初始化地理位置驱动");
        KernelLogger.info("GeographyDrive", "地理位置驱动初始化完成");
    }
    
    // ==================== 核心功能 ====================
    
    /**
     * 获取当前位置信息
     * 第三方 API 自动调用获取位置信息，只有程序明确需要高精度定位时才尝试使用原生 API
     * @param {Object} options - 定位选项
     * @param {boolean} options.enableHighAccuracy - 是否启用高精度定位（默认 false，只有明确需要时才启用）
     * @param {number} options.timeout - 超时时间（毫秒，默认 10000）
     * @param {number} options.maximumAge - 最大缓存时间（毫秒，默认 0，0 表示不限制缓存时间，只要在缓存过期时间内即可）
     * @returns {Promise<Object>} 位置信息对象
     */
    static async getCurrentPosition(options = {}) {
        const {
            enableHighAccuracy = false,  // 默认不启用高精度定位，需要用户明确请求
            timeout = 10000,
            maximumAge = 0  // 0 表示不限制，只要在缓存过期时间内即可使用
        } = options;
        
        KernelLogger.debug("GeographyDrive", "开始获取当前位置", { enableHighAccuracy, maximumAge });
        
        // 检查缓存：如果有缓存且未过期，直接返回
        if (GeographyDrive._cachedLocation && GeographyDrive._cachedTimestamp) {
            const age = Date.now() - GeographyDrive._cachedTimestamp;
            // 如果缓存在过期时间内（5分钟），且（maximumAge 为 0 或缓存在 maximumAge 内），则使用缓存
            const isCacheValid = age < GeographyDrive._cacheExpireTime;
            const isWithinMaximumAge = maximumAge === 0 || age < maximumAge;
            if (isCacheValid && isWithinMaximumAge) {
                KernelLogger.debug("GeographyDrive", "使用缓存的位置信息", { age, cacheAge: age });
                return GeographyDrive._cachedLocation;
            }
        }
        
        // 检查是否有正在进行的请求，如果有则等待该请求完成（防止并发重复请求）
        if (GeographyDrive._pendingRequest) {
            KernelLogger.debug("GeographyDrive", "检测到正在进行的定位请求，等待其完成");
            try {
                return await GeographyDrive._pendingRequest;
            } catch (error) {
                // 如果之前的请求失败，继续执行新的请求
                KernelLogger.debug("GeographyDrive", "之前的请求失败，继续执行新请求");
            }
        }
        
        // 创建新的请求 Promise
        const requestPromise = (async () => {
            let nativeLocation = null;
            let apiLocation = null;
            
            // 只有程序明确需要高精度定位时，才尝试使用原生 API
            // 原生 API 会触发浏览器权限请求，需要用户确认
            if (enableHighAccuracy && navigator.geolocation) {
                try {
                    KernelLogger.debug("GeographyDrive", "程序请求高精度定位，尝试使用原生 API");
                    nativeLocation = await GeographyDrive._getNativeLocation(timeout, maximumAge);
                    KernelLogger.info("GeographyDrive", "原生 API 定位成功");
                } catch (error) {
                    KernelLogger.warn("GeographyDrive", `原生 API 定位失败: ${error.message}`);
                    // 原生 API 失败不影响第三方 API 的调用
                }
            } else {
                KernelLogger.debug("GeographyDrive", "未启用高精度定位，跳过原生 API，直接使用第三方 API");
            }
            
            // 第三方 API 始终自动调用（无论原生 API 是否成功）
            // 如果原生 API 成功，第三方 API 数据作为补充（城市名称、地址等）
            // 如果原生 API 失败或未启用，第三方 API 提供低精度定位
            try {
                KernelLogger.debug("GeographyDrive", "自动调用第三方 API 获取位置信息");
                apiLocation = await GeographyDrive._getApiLocation(nativeLocation);
                KernelLogger.info("GeographyDrive", "第三方 API 获取位置信息成功");
            } catch (error) {
                KernelLogger.error("GeographyDrive", `第三方 API 获取位置信息失败: ${error.message}`);
                // 如果原生 API 也失败了，抛出错误
                if (!nativeLocation) {
                    throw new Error(`获取位置信息失败: ${error.message}`);
                }
                // 如果原生 API 成功但第三方 API 失败，使用原生 API 的数据
                KernelLogger.warn("GeographyDrive", "第三方 API 失败，仅使用原生 API 数据");
            }
            
            // 合并位置信息
            const location = GeographyDrive._mergeLocationData(nativeLocation, apiLocation);
            
            // 更新缓存
            GeographyDrive._cachedLocation = location;
            GeographyDrive._cachedTimestamp = Date.now();
            
            return location;
        })();
        
        // 保存请求 Promise，以便并发调用可以等待
        GeographyDrive._pendingRequest = requestPromise;
        
        try {
            const location = await requestPromise;
            // 请求成功，清除 pending 状态
            GeographyDrive._pendingRequest = null;
            return location;
        } catch (error) {
            // 请求失败，清除 pending 状态
            GeographyDrive._pendingRequest = null;
            throw error;
        }
    }
    
    /**
     * 使用原生 Geolocation API 获取位置
     * @param {number} timeout - 超时时间（毫秒）
     * @param {number} maximumAge - 最大缓存时间（毫秒）
     * @returns {Promise<Object>} 位置信息对象
     */
    static _getNativeLocation(timeout, maximumAge) {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('浏览器不支持地理位置 API'));
                return;
            }
            
            const options = {
                enableHighAccuracy: true,
                timeout: timeout,
                maximumAge: maximumAge
            };
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        altitude: position.coords.altitude,
                        altitudeAccuracy: position.coords.altitudeAccuracy,
                        heading: position.coords.heading,
                        speed: position.coords.speed,
                        timestamp: position.timestamp,
                        source: GeographyDrive.ACCURACY.HIGH
                    };
                    resolve(location);
                },
                (error) => {
                    let errorMessage = '未知错误';
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = '用户拒绝了地理位置请求';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = '位置信息不可用';
                            break;
                        case error.TIMEOUT:
                            errorMessage = '定位请求超时';
                            break;
                    }
                    reject(new Error(errorMessage));
                },
                options
            );
        });
    }
    
    /**
     * 使用第三方 API 获取位置信息
     * @param {Object|null} nativeLocation - 原生 API 获取的位置信息（可选）
     * @returns {Promise<Object>} 位置信息对象
     */
    static async _getApiLocation(nativeLocation) {
        try {
            // 构建请求参数
            const params = new URLSearchParams();
            if (nativeLocation) {
                params.append('latitude', nativeLocation.latitude);
                params.append('longitude', nativeLocation.longitude);
            }
            
            // 发送请求
            const url = GeographyDrive.API_URL + (params.toString() ? '?' + params.toString() : '');
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // 检查响应格式
            if (data.code !== '200' || !Array.isArray(data.data) || data.data.length === 0) {
                throw new Error('API 响应格式错误或数据为空');
            }
            
            // 使用 data[0]（市区）作为数据源
            const cityData = data.data[0];
            
            return {
                name: cityData.name || null,
                geo: cityData.geo || null,
                address: cityData.address || null,
                source: nativeLocation ? GeographyDrive.ACCURACY.HIGH : GeographyDrive.ACCURACY.LOW
            };
        } catch (error) {
            KernelLogger.error("GeographyDrive", `第三方 API 请求失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 合并原生 API 和第三方 API 的位置数据
     * @param {Object|null} nativeLocation - 原生 API 位置数据
     * @param {Object|null} apiLocation - 第三方 API 位置数据
     * @returns {Object} 合并后的位置信息对象
     */
    static _mergeLocationData(nativeLocation, apiLocation) {
        const location = {
            // 基础位置信息
            latitude: null,
            longitude: null,
            accuracy: null,
            source: GeographyDrive.ACCURACY.LOW,
            
            // 扩展信息（来自第三方 API）
            name: null,
            address: null,
            
            // 高精度信息（来自原生 API）
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            timestamp: null
        };
        
        // 优先使用原生 API 的高精度位置
        if (nativeLocation) {
            location.latitude = nativeLocation.latitude;
            location.longitude = nativeLocation.longitude;
            location.accuracy = nativeLocation.accuracy;
            location.altitude = nativeLocation.altitude;
            location.altitudeAccuracy = nativeLocation.altitudeAccuracy;
            location.heading = nativeLocation.heading;
            location.speed = nativeLocation.speed;
            location.timestamp = nativeLocation.timestamp;
            location.source = GeographyDrive.ACCURACY.HIGH;
        }
        
        // 使用第三方 API 的补充信息
        if (apiLocation) {
            // 如果原生 API 失败，使用第三方 API 的位置
            if (!nativeLocation && apiLocation.geo) {
                location.latitude = apiLocation.geo.latitude;
                location.longitude = apiLocation.geo.longitude;
            }
            
            // 补充地址信息
            location.name = apiLocation.name;
            location.address = apiLocation.address;
        }
        
        return location;
    }
    
    /**
     * 清除位置缓存
     */
    static clearCache() {
        GeographyDrive._cachedLocation = null;
        GeographyDrive._cachedTimestamp = null;
        KernelLogger.debug("GeographyDrive", "位置缓存已清除");
    }
    
    /**
     * 检查浏览器是否支持地理位置 API
     * @returns {boolean} 是否支持
     */
    static isSupported() {
        return typeof navigator !== 'undefined' && 'geolocation' in navigator;
    }
    
    /**
     * 获取缓存的位置信息（如果存在且未过期）
     * @param {number} maximumAge - 最大缓存时间（毫秒，可选，0 表示不限制）
     * @returns {Object|null} 缓存的位置信息，如果不存在或已过期则返回 null
     */
    static getCachedLocation(maximumAge = 0) {
        if (!GeographyDrive._cachedLocation || !GeographyDrive._cachedTimestamp) {
            return null;
        }
        
        const age = Date.now() - GeographyDrive._cachedTimestamp;
        
        // 检查是否在缓存过期时间内（5分钟）
        if (age >= GeographyDrive._cacheExpireTime) {
            return null;
        }
        
        // 如果指定了 maximumAge，检查是否在 maximumAge 内
        if (maximumAge > 0 && age >= maximumAge) {
            return null;
        }
        
        return GeographyDrive._cachedLocation;
    }
}

// 自动初始化
if (typeof KernelLogger !== 'undefined') {
    GeographyDrive.init();
}

// 发布信号，通知 DependencyConfig 模块已加载完成
if (typeof DependencyConfig !== 'undefined') {
    DependencyConfig.publishSignal("../kernel/drive/geographyDrive.js");
}

