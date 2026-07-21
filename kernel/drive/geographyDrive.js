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
     * 第三方 API 地址（基于 IP 的定位，核心数据为 district）
     */
    static API_URL = 'https://uapis.cn/api/v1/network/myip?source=commercial';
    
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
                // 第三方 API 失败，静默降级（不记录错误日志，只记录调试日志）
                KernelLogger.debug("GeographyDrive", `第三方 API 获取位置信息失败: ${error.message}`);
                
                // 如果原生 API 成功但第三方 API 失败，尝试使用反向地理编码获取城市名称
                if (nativeLocation) {
                    KernelLogger.debug("GeographyDrive", "第三方 API 失败，尝试使用反向地理编码获取城市名称");
                    try {
                        apiLocation = await GeographyDrive._getLocationFromReverseGeocoding(nativeLocation);
                        if (apiLocation && apiLocation.name) {
                            KernelLogger.debug("GeographyDrive", "反向地理编码成功，获取到城市名称");
                        } else {
                            KernelLogger.debug("GeographyDrive", "反向地理编码未返回城市名称，仅使用原生 API 数据");
                        }
                    } catch (reverseError) {
                        // 反向地理编码失败，静默降级（只记录调试日志）
                        KernelLogger.debug("GeographyDrive", `反向地理编码失败: ${reverseError.message}，仅使用原生 API 数据`);
                    }
                } else {
                    // 如果原生 API 也失败了，尝试使用 BOM 方法作为后备
                    KernelLogger.debug("GeographyDrive", "第三方 API 失败且原生 API 未启用，尝试使用 BOM 后备方案");
                    try {
                        // 尝试使用原生 API 作为后备（即使未明确启用高精度）
                        if (navigator.geolocation) {
                            KernelLogger.debug("GeographyDrive", "尝试使用原生地理位置 API 作为后备（需要浏览器权限）");
                            nativeLocation = await GeographyDrive._getNativeLocation(timeout, maximumAge);
                            if (nativeLocation) {
                                // 使用反向地理编码获取城市名称
                                try {
                                    apiLocation = await GeographyDrive._getLocationFromReverseGeocoding(nativeLocation);
                                    if (apiLocation && apiLocation.name) {
                                        KernelLogger.debug("GeographyDrive", "BOM 后备方案成功，已获取城市名称");
                                    }
                                } catch (reverseError) {
                                    // 反向地理编码失败，静默降级（只记录调试日志）
                                    KernelLogger.debug("GeographyDrive", `反向地理编码失败: ${reverseError.message}`);
                                }
                            }
                        } else {
                            throw new Error('浏览器不支持地理位置 API');
                        }
                    } catch (bomError) {
                        // BOM 后备方案失败，静默降级（只记录调试日志）
                        KernelLogger.debug("GeographyDrive", `BOM 后备方案失败: ${bomError.message}`);
                        // 不抛出错误，允许返回 null 或部分数据
                    }
                }
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
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SERVICE,
                    `GeographyDrive.获取当前位置失败: ${error.message}`,
                    { enableHighAccuracy, timeout, maximumAge, error: error.message, stack: error.stack }
                ).catch(() => { });
            }
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
                    KernelLogger.info("GeographyDrive", "原生地理位置 API 定位成功");
                    resolve(location);
                },
                (error) => {
                    let errorMessage = '未知错误';
                    let errorCode = 'UNKNOWN';
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = '用户拒绝了地理位置权限请求，无法使用 BOM 方法获取位置';
                            errorCode = 'PERMISSION_DENIED';
                            KernelLogger.warn("GeographyDrive", "浏览器地理位置权限被拒绝");
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = '位置信息不可用';
                            errorCode = 'POSITION_UNAVAILABLE';
                            break;
                        case error.TIMEOUT:
                            errorMessage = '定位请求超时';
                            errorCode = 'TIMEOUT';
                            break;
                    }
                    const geoError = new Error(errorMessage);
                    geoError.code = errorCode;
                    reject(geoError);
                },
                options
            );
        });
    }
    
    /**
     * 使用第三方 API 获取位置信息（uapis.cn myip，基于 IP 定位，核心数据为 district）
     * @param {Object|null} nativeLocation - 原生 API 获取的位置信息（可选，本 API 不依赖此参数）
     * @returns {Promise<Object>} 位置信息对象 { name, geo, address, source }
     */
    static async _getApiLocation(nativeLocation) {
        try {
            const response = await fetch(GeographyDrive.API_URL, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            const contentType = response.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');
            
            let data;
            if (isJson) {
                try {
                    data = JSON.parse(text);
                } catch (jsonError) {
                    KernelLogger.error("GeographyDrive", `JSON 解析失败，响应内容: ${text.substring(0, 500)}`);
                    throw new Error(`API 返回了无效的 JSON 响应: ${jsonError.message}`);
                }
            } else {
                KernelLogger.error("GeographyDrive", `API 返回了非 JSON 响应 (Content-Type: ${contentType})，响应内容: ${text.substring(0, 500)}`);
                throw new Error(`API 返回了非 JSON 响应 (可能是服务器错误页面)`);
            }
            
            if (!data || typeof data !== 'object') {
                throw new Error('API 响应数据格式错误');
            }
            
            // uapis.cn myip 响应: ip, region("中国 省 市 区"), district, latitude, longitude 等
            const district = data.district != null ? String(data.district).trim() : null;
            const region = data.region != null ? String(data.region).trim() : null;
            const city = GeographyDrive._extractCityFromRegion(region, district);
            // name 保留区县级（兼容旧逻辑）；city 为天气等场景使用的市级名
            const name = district || city || null;
            const geo = (data.latitude != null && data.longitude != null)
                ? { latitude: Number(data.latitude), longitude: Number(data.longitude) }
                : null;
            
            if (!name && !city && !geo) {
                throw new Error('API 响应缺少有效位置数据（district/region 或 latitude/longitude）');
            }
            
            return {
                name: name || null,
                city: city || null,
                district: district || null,
                region: region || null,
                geo: geo,
                address: region || null,
                source: nativeLocation ? GeographyDrive.ACCURACY.HIGH : GeographyDrive.ACCURACY.LOW
            };
        } catch (error) {
            KernelLogger.debug("GeographyDrive", `第三方 API 请求失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 使用反向地理编码获取城市名称（基于经纬度）
     * @param {Object} nativeLocation - 原生 API 位置数据（包含 latitude 和 longitude）
     * @returns {Promise<Object>} 位置信息对象（包含城市名称）
     */
    static async _getLocationFromReverseGeocoding(nativeLocation) {
        try {
            if (!nativeLocation || !nativeLocation.latitude || !nativeLocation.longitude) {
                throw new Error('缺少经纬度信息');
            }
            
            // 使用浏览器的 Intl API 进行反向地理编码
            // 注意：Intl API 不直接支持反向地理编码，但我们可以使用其他方法
            
            // 方法1：使用免费的 OpenStreetMap Nominatim API（不需要 API Key）
            const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${nativeLocation.latitude}&lon=${nativeLocation.longitude}&zoom=10&addressdetails=1`;
            
            KernelLogger.debug("GeographyDrive", `使用反向地理编码 API: ${nominatimUrl}`);
            
            const response = await fetch(nominatimUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'ZerOS-GeographyDrive/1.0' // Nominatim 要求提供 User-Agent
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            // 先读取文本内容（避免响应流被重复读取）
            const text = await response.text();
            
            // 检查响应类型
            const contentType = response.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');
            
            let data;
            if (isJson) {
                try {
                    data = JSON.parse(text);
                } catch (jsonError) {
                    // JSON 解析失败，静默降级（只记录调试日志）
                    KernelLogger.debug("GeographyDrive", `反向地理编码 JSON 解析失败，响应内容: ${text.substring(0, 500)}`);
                    throw new Error(`反向地理编码 API 返回了无效的 JSON 响应`);
                }
            } else {
                // 非 JSON 响应，静默降级（只记录调试日志）
                KernelLogger.debug("GeographyDrive", `反向地理编码 API 返回了非 JSON 响应，响应内容: ${text.substring(0, 500)}`);
                throw new Error(`反向地理编码 API 返回了非 JSON 响应`);
            }
            
            // 解析 Nominatim 响应
            if (!data || typeof data !== 'object') {
                throw new Error('反向地理编码响应数据格式错误');
            }
            
            // 提取城市名称
            let cityName = null;
            if (data.address) {
                // Nominatim 的地址结构可能包含 city, town, village, municipality 等字段
                cityName = data.address.city || 
                          data.address.town || 
                          data.address.village || 
                          data.address.municipality ||
                          data.address.county ||
                          data.address.state;
            }
            
            // 如果没有找到城市名称，尝试从 display_name 中提取
            if (!cityName && data.display_name) {
                // display_name 格式通常是: "城市, 省份, 国家"
                const parts = data.display_name.split(',');
                if (parts.length > 0) {
                    cityName = parts[0].trim();
                }
            }
            
            return {
                name: cityName,
                city: cityName || null,
                district: (data.address && (data.address.suburb || data.address.district || data.address.city_district)) || null,
                region: data.display_name || null,
                geo: {
                    latitude: nativeLocation.latitude,
                    longitude: nativeLocation.longitude
                },
                address: data.address || null,
                source: GeographyDrive.ACCURACY.HIGH
            };
        } catch (error) {
            // 反向地理编码失败，静默降级（只记录调试日志，因为这是降级过程中的正常情况）
            KernelLogger.debug("GeographyDrive", `反向地理编码失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 从 myip region 字符串解析市级地名
     * region 格式通常为: "中国 河南 郑州 管城" → "郑州"
     * @param {string|null} region
     * @param {string|null} district
     * @returns {string|null}
     */
    static _extractCityFromRegion(region, district = null) {
        if (!region || typeof region !== 'string') {
            return null;
        }
        const parts = region.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 3) {
            // 国家 省 市 [区...] → 取市级（第 3 段）
            return parts[2];
        }
        if (parts.length === 2) {
            return parts[1];
        }
        if (parts.length === 1) {
            return parts[0];
        }
        return null;
    }
    
    /**
     * 解析适合天气 API 的城市名（优先市级，避免区县级导致 LOCATION_NOT_FOUND）
     * @param {Object|string|null} locationOrName - 定位对象或城市字符串
     * @returns {string|null}
     */
    static resolveWeatherCityName(locationOrName) {
        if (!locationOrName) {
            return null;
        }
        if (typeof locationOrName === 'string') {
            const t = locationOrName.trim();
            return t || null;
        }
        if (locationOrName.city && typeof locationOrName.city === 'string' && locationOrName.city.trim()) {
            return locationOrName.city.trim();
        }
        const regionStr = (typeof locationOrName.region === 'string' && locationOrName.region.trim())
            ? locationOrName.region.trim()
            : (typeof locationOrName.address === 'string' && locationOrName.address.trim()
                ? locationOrName.address.trim()
                : null);
        const extracted = GeographyDrive._extractCityFromRegion(
            regionStr,
            locationOrName.district || locationOrName.name || null
        );
        if (extracted) {
            return extracted;
        }
        if (locationOrName.name && typeof locationOrName.name === 'string' && locationOrName.name.trim()) {
            return locationOrName.name.trim();
        }
        if (locationOrName.district && typeof locationOrName.district === 'string' && locationOrName.district.trim()) {
            return locationOrName.district.trim();
        }
        return null;
    }
    
    /**
     * 生成天气查询候选城市名（市级优先，含后缀剥离与 IP 自动识别兜底）
     * @param {Object|string|null} locationOrName
     * @returns {Array<string|null>}
     */
    static getWeatherCityCandidates(locationOrName) {
        const candidates = [];
        const add = (value) => {
            if (value === null) {
                if (!candidates.includes(null)) {
                    candidates.push(null);
                }
                return;
            }
            if (typeof value !== 'string') {
                return;
            }
            const t = value.trim();
            if (!t || candidates.includes(t)) {
                return;
            }
            candidates.push(t);
            const stripped = t.replace(/(特别行政区|自治区|自治州|地区|盟|回族区|市|区|县|旗)$/u, '');
            if (stripped && stripped !== t && !candidates.includes(stripped)) {
                candidates.push(stripped);
            }
        };
        
        if (typeof locationOrName === 'string') {
            add(locationOrName);
        } else if (locationOrName && typeof locationOrName === 'object') {
            add(locationOrName.city);
            add(GeographyDrive.resolveWeatherCityName(locationOrName));
            const regionStr = (typeof locationOrName.region === 'string')
                ? locationOrName.region
                : (typeof locationOrName.address === 'string' ? locationOrName.address : null);
            add(GeographyDrive._extractCityFromRegion(regionStr, locationOrName.district || locationOrName.name));
            add(locationOrName.name);
            add(locationOrName.district);
        }
        // 最后尝试不传 city，由天气 API 按 IP 识别
        add(null);
        return candidates;
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
            city: null,
            district: null,
            region: null,
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
            location.city = apiLocation.city || null;
            location.district = apiLocation.district || null;
            location.region = apiLocation.region || null;
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

