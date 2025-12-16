// 加密驱动
// 提供加密、解密、随机数生成等功能
// 依赖 jsencrypt 库进行 RSA 加密/解密

KernelLogger.info("CryptDrive", "模块初始化");

class CryptDrive {
    // 存储键名
    static STORAGE_KEY = 'cryptDrive.keys';
    
    // 密钥数据结构
    // {
    //     keys: {
    //         [keyId: string]: {
    //             publicKey: string,
    //             privateKey: string,
    //             createdAt: number,
    //             expiresAt: number | null,  // null 表示永不过期
    //             description: string,
    //             tags: string[]
    //         }
    //     },
    //     defaultKeyId: string | null
    // }
    static _keys = null;
    static _initialized = false;
    static _jsencrypt = null;
    
    /**
     * 初始化加密驱动
     * @returns {Promise<void>}
     */
    static async init() {
        if (CryptDrive._initialized) {
            KernelLogger.debug("CryptDrive", "已初始化，跳过");
            return;
        }
        
        KernelLogger.info("CryptDrive", "初始化加密驱动");
        
        try {
            // 加载 jsencrypt 库
            if (typeof DynamicManager !== 'undefined') {
                try {
                    CryptDrive._jsencrypt = await DynamicManager.loadModule('jsencrypt');
                    KernelLogger.info("CryptDrive", "jsencrypt 库加载成功");
                } catch (error) {
                    KernelLogger.warn("CryptDrive", `jsencrypt 库加载失败: ${error.message}`);
                    // 继续初始化，但 RSA 功能将不可用
                }
            } else {
                KernelLogger.warn("CryptDrive", "DynamicManager 不可用，无法加载 jsencrypt");
            }
            
            // 加载密钥数据
            await CryptDrive._loadKeys();
            
            CryptDrive._initialized = true;
            KernelLogger.info("CryptDrive", "加密驱动初始化完成");
        } catch (error) {
            KernelLogger.error("CryptDrive", `初始化失败: ${error.message}`, error);
            // 初始化失败时使用空数据结构
            CryptDrive._keys = {
                keys: {},
                defaultKeyId: null
            };
            CryptDrive._initialized = true;
        }
    }
    
    /**
     * 从 LStorage 加载密钥数据
     * @returns {Promise<void>}
     */
    static async _loadKeys() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.warn("CryptDrive", "LStorage 不可用，使用空密钥数据");
            CryptDrive._keys = {
                keys: {},
                defaultKeyId: null
            };
            return;
        }
        
        try {
            // 确保 LStorage 已初始化
            if (!LStorage._initialized) {
                await LStorage.init();
            }
            
            const stored = await LStorage.getSystemStorage(CryptDrive.STORAGE_KEY);
            if (stored && typeof stored === 'object') {
                CryptDrive._keys = stored;
                // 清理过期密钥
                await CryptDrive._cleanupExpiredKeys();
            } else {
                CryptDrive._keys = {
                    keys: {},
                    defaultKeyId: null
                };
            }
        } catch (error) {
            KernelLogger.error("CryptDrive", `加载密钥数据失败: ${error.message}`, error);
            CryptDrive._keys = {
                keys: {},
                defaultKeyId: null
            };
        }
    }
    
    /**
     * 保存密钥数据到 LStorage
     * @returns {Promise<boolean>}
     */
    static async _saveKeys() {
        if (typeof LStorage === 'undefined') {
            KernelLogger.warn("CryptDrive", "LStorage 不可用，无法保存密钥数据");
            return false;
        }
        
        try {
            // 确保 LStorage 已初始化
            if (!LStorage._initialized) {
                await LStorage.init();
            }
            
            const success = await LStorage.setSystemStorage(CryptDrive.STORAGE_KEY, CryptDrive._keys);
            if (success) {
                KernelLogger.debug("CryptDrive", "密钥数据已保存");
            }
            return success;
        } catch (error) {
            KernelLogger.error("CryptDrive", `保存密钥数据失败: ${error.message}`, error);
            return false;
        }
    }
    
    /**
     * 清理过期密钥
     * @returns {Promise<void>}
     */
    static async _cleanupExpiredKeys() {
        if (!CryptDrive._keys || !CryptDrive._keys.keys) {
            return;
        }
        
        const now = Date.now();
        let cleaned = false;
        
        for (const [keyId, keyData] of Object.entries(CryptDrive._keys.keys)) {
            if (keyData.expiresAt !== null && keyData.expiresAt < now) {
                delete CryptDrive._keys.keys[keyId];
                cleaned = true;
                KernelLogger.info("CryptDrive", `已清理过期密钥: ${keyId}`);
            }
        }
        
        // 如果默认密钥被删除，清除默认密钥ID
        if (CryptDrive._keys.defaultKeyId && !CryptDrive._keys.keys[CryptDrive._keys.defaultKeyId]) {
            CryptDrive._keys.defaultKeyId = null;
            cleaned = true;
        }
        
        if (cleaned) {
            await CryptDrive._saveKeys();
        }
    }
    
    /**
     * 生成 RSA 密钥对
     * @param {Object} options 选项
     * @param {number} options.keySize 密钥长度（默认 1024）
     * @param {string} options.keyId 密钥ID（可选，默认自动生成）
     * @param {number} options.expiresIn 过期时间（毫秒，可选，null 表示永不过期）
     * @param {string} options.description 描述（可选）
     * @param {string[]} options.tags 标签（可选）
     * @param {boolean} options.setAsDefault 是否设置为默认密钥（默认 false）
     * @returns {Promise<Object>} { keyId, publicKey, privateKey }
     */
    static async generateKeyPair(options = {}) {
        if (!CryptDrive._jsencrypt) {
            throw new Error('jsencrypt 库未加载，无法生成密钥对');
        }
        
        const {
            keySize = 1024,
            keyId = null,
            expiresIn = null,
            description = '',
            tags = [],
            setAsDefault = false
        } = options;
        
        try {
            // 生成密钥对
            const crypt = new CryptDrive._jsencrypt();
            crypt.getKey();
            
            const publicKey = crypt.getPublicKey();
            const privateKey = crypt.getPrivateKey();
            
            if (!publicKey || !privateKey) {
                throw new Error('密钥对生成失败');
            }
            
            // 生成密钥ID
            const finalKeyId = keyId || `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // 计算过期时间
            const expiresAt = expiresIn !== null ? Date.now() + expiresIn : null;
            
            // 保存密钥
            if (!CryptDrive._keys) {
                CryptDrive._keys = {
                    keys: {},
                    defaultKeyId: null
                };
            }
            
            CryptDrive._keys.keys[finalKeyId] = {
                publicKey: publicKey,
                privateKey: privateKey,
                createdAt: Date.now(),
                expiresAt: expiresAt,
                description: description,
                tags: tags
            };
            
            // 设置为默认密钥
            if (setAsDefault) {
                CryptDrive._keys.defaultKeyId = finalKeyId;
            }
            
            // 保存到存储
            await CryptDrive._saveKeys();
            
            KernelLogger.info("CryptDrive", `密钥对已生成: ${finalKeyId}`);
            
            return {
                keyId: finalKeyId,
                publicKey: publicKey,
                privateKey: privateKey
            };
        } catch (error) {
            KernelLogger.error("CryptDrive", `生成密钥对失败: ${error.message}`, error);
            throw new Error(`生成密钥对失败: ${error.message}`);
        }
    }
    
    /**
     * 导入密钥对
     * @param {string} publicKey 公钥
     * @param {string} privateKey 私钥
     * @param {Object} options 选项
     * @param {string} options.keyId 密钥ID（可选，默认自动生成）
     * @param {number} options.expiresIn 过期时间（毫秒，可选，null 表示永不过期）
     * @param {string} options.description 描述（可选）
     * @param {string[]} options.tags 标签（可选）
     * @param {boolean} options.setAsDefault 是否设置为默认密钥（默认 false）
     * @returns {Promise<string>} 密钥ID
     */
    static async importKeyPair(publicKey, privateKey, options = {}) {
        if (!CryptDrive._jsencrypt) {
            throw new Error('jsencrypt 库未加载，无法导入密钥对');
        }
        
        const {
            keyId = null,
            expiresIn = null,
            description = '',
            tags = [],
            setAsDefault = false
        } = options;
        
        // 验证密钥格式
        try {
            const crypt = new CryptDrive._jsencrypt();
            crypt.setPublicKey(publicKey);
            crypt.setPrivateKey(privateKey);
            
            // 测试加密/解密
            const testData = 'test';
            const encrypted = crypt.encrypt(testData);
            if (!encrypted) {
                throw new Error('公钥无效');
            }
            const decrypted = crypt.decrypt(encrypted);
            if (decrypted !== testData) {
                throw new Error('私钥无效或与公钥不匹配');
            }
        } catch (error) {
            throw new Error(`密钥验证失败: ${error.message}`);
        }
        
        // 生成密钥ID
        const finalKeyId = keyId || `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 计算过期时间
        const expiresAt = expiresIn !== null ? Date.now() + expiresIn : null;
        
        // 保存密钥
        if (!CryptDrive._keys) {
            CryptDrive._keys = {
                keys: {},
                defaultKeyId: null
            };
        }
        
        CryptDrive._keys.keys[finalKeyId] = {
            publicKey: publicKey,
            privateKey: privateKey,
            createdAt: Date.now(),
            expiresAt: expiresAt,
            description: description,
            tags: tags
        };
        
        // 设置为默认密钥
        if (setAsDefault) {
            CryptDrive._keys.defaultKeyId = finalKeyId;
        }
        
        // 保存到存储
        await CryptDrive._saveKeys();
        
        KernelLogger.info("CryptDrive", `密钥对已导入: ${finalKeyId}`);
        
        return finalKeyId;
    }
    
    /**
     * 获取密钥信息
     * @param {string} keyId 密钥ID（可选，默认使用默认密钥）
     * @returns {Object|null} 密钥信息（不包含私钥）
     */
    static getKeyInfo(keyId = null) {
        if (!CryptDrive._keys || !CryptDrive._keys.keys) {
            return null;
        }
        
        const targetKeyId = keyId || CryptDrive._keys.defaultKeyId;
        if (!targetKeyId || !CryptDrive._keys.keys[targetKeyId]) {
            return null;
        }
        
        const keyData = CryptDrive._keys.keys[targetKeyId];
        
        // 检查是否过期
        if (keyData.expiresAt !== null && keyData.expiresAt < Date.now()) {
            return null;
        }
        
        return {
            keyId: targetKeyId,
            publicKey: keyData.publicKey,
            createdAt: keyData.createdAt,
            expiresAt: keyData.expiresAt,
            description: keyData.description,
            tags: keyData.tags,
            isDefault: targetKeyId === CryptDrive._keys.defaultKeyId
        };
    }
    
    /**
     * 列出所有密钥
     * @returns {Array<Object>} 密钥信息数组
     */
    static listKeys() {
        if (!CryptDrive._keys || !CryptDrive._keys.keys) {
            return [];
        }
        
        const now = Date.now();
        const keys = [];
        
        for (const [keyId, keyData] of Object.entries(CryptDrive._keys.keys)) {
            // 跳过过期密钥
            if (keyData.expiresAt !== null && keyData.expiresAt < now) {
                continue;
            }
            
            keys.push({
                keyId: keyId,
                publicKey: keyData.publicKey,
                createdAt: keyData.createdAt,
                expiresAt: keyData.expiresAt,
                description: keyData.description,
                tags: keyData.tags,
                isDefault: keyId === CryptDrive._keys.defaultKeyId
            });
        }
        
        return keys;
    }
    
    /**
     * 删除密钥
     * @param {string} keyId 密钥ID
     * @returns {Promise<boolean>} 是否成功
     */
    static async deleteKey(keyId) {
        if (!CryptDrive._keys || !CryptDrive._keys.keys || !CryptDrive._keys.keys[keyId]) {
            return false;
        }
        
        delete CryptDrive._keys.keys[keyId];
        
        // 如果删除的是默认密钥，清除默认密钥ID
        if (CryptDrive._keys.defaultKeyId === keyId) {
            CryptDrive._keys.defaultKeyId = null;
        }
        
        await CryptDrive._saveKeys();
        
        KernelLogger.info("CryptDrive", `密钥已删除: ${keyId}`);
        
        return true;
    }
    
    /**
     * 设置默认密钥
     * @param {string} keyId 密钥ID
     * @returns {Promise<boolean>} 是否成功
     */
    static async setDefaultKey(keyId) {
        if (!CryptDrive._keys || !CryptDrive._keys.keys || !CryptDrive._keys.keys[keyId]) {
            return false;
        }
        
        // 检查是否过期
        const keyData = CryptDrive._keys.keys[keyId];
        if (keyData.expiresAt !== null && keyData.expiresAt < Date.now()) {
            return false;
        }
        
        CryptDrive._keys.defaultKeyId = keyId;
        await CryptDrive._saveKeys();
        
        KernelLogger.info("CryptDrive", `默认密钥已设置: ${keyId}`);
        
        return true;
    }
    
    /**
     * RSA 加密
     * @param {string} data 要加密的数据
     * @param {string} keyId 密钥ID（可选，默认使用默认密钥）
     * @param {string} publicKey 公钥（可选，如果提供则使用此公钥，忽略 keyId）
     * @returns {string} 加密后的数据（Base64）
     */
    static encrypt(data, keyId = null, publicKey = null) {
        if (!CryptDrive._jsencrypt) {
            throw new Error('jsencrypt 库未加载，无法加密');
        }
        
        if (!data || typeof data !== 'string') {
            throw new Error('数据必须是字符串');
        }
        
        let targetPublicKey = publicKey;
        
        // 如果没有提供公钥，从密钥存储中获取
        if (!targetPublicKey) {
            const targetKeyId = keyId || CryptDrive._keys?.defaultKeyId;
            if (!targetKeyId || !CryptDrive._keys?.keys?.[targetKeyId]) {
                throw new Error('密钥不存在或未设置默认密钥');
            }
            
            const keyData = CryptDrive._keys.keys[targetKeyId];
            
            // 检查是否过期
            if (keyData.expiresAt !== null && keyData.expiresAt < Date.now()) {
                throw new Error('密钥已过期');
            }
            
            targetPublicKey = keyData.publicKey;
        }
        
        try {
            const crypt = new CryptDrive._jsencrypt();
            crypt.setPublicKey(targetPublicKey);
            const encrypted = crypt.encrypt(data);
            
            if (!encrypted) {
                throw new Error('加密失败');
            }
            
            return encrypted;
        } catch (error) {
            KernelLogger.error("CryptDrive", `加密失败: ${error.message}`, error);
            throw new Error(`加密失败: ${error.message}`);
        }
    }
    
    /**
     * RSA 解密
     * @param {string} encryptedData 加密的数据（Base64）
     * @param {string} keyId 密钥ID（可选，默认使用默认密钥）
     * @param {string} privateKey 私钥（可选，如果提供则使用此私钥，忽略 keyId）
     * @returns {string} 解密后的数据
     */
    static decrypt(encryptedData, keyId = null, privateKey = null) {
        if (!CryptDrive._jsencrypt) {
            throw new Error('jsencrypt 库未加载，无法解密');
        }
        
        if (!encryptedData || typeof encryptedData !== 'string') {
            throw new Error('加密数据必须是字符串');
        }
        
        let targetPrivateKey = privateKey;
        
        // 如果没有提供私钥，从密钥存储中获取
        if (!targetPrivateKey) {
            const targetKeyId = keyId || CryptDrive._keys?.defaultKeyId;
            if (!targetKeyId || !CryptDrive._keys?.keys?.[targetKeyId]) {
                throw new Error('密钥不存在或未设置默认密钥');
            }
            
            const keyData = CryptDrive._keys.keys[targetKeyId];
            
            // 检查是否过期
            if (keyData.expiresAt !== null && keyData.expiresAt < Date.now()) {
                throw new Error('密钥已过期');
            }
            
            targetPrivateKey = keyData.privateKey;
        }
        
        try {
            const crypt = new CryptDrive._jsencrypt();
            crypt.setPrivateKey(targetPrivateKey);
            const decrypted = crypt.decrypt(encryptedData);
            
            if (!decrypted) {
                throw new Error('解密失败');
            }
            
            return decrypted;
        } catch (error) {
            KernelLogger.error("CryptDrive", `解密失败: ${error.message}`, error);
            throw new Error(`解密失败: ${error.message}`);
        }
    }
    
    /**
     * MD5 哈希
     * @param {string} data 要哈希的数据
     * @returns {Promise<string>} MD5 哈希值（十六进制）
     */
    static async md5(data) {
        if (!data) {
            throw new Error('数据不能为空');
        }
        
        // 使用 Web Crypto API（如果可用）
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            try {
                const encoder = new TextEncoder();
                const dataBuffer = encoder.encode(String(data));
                const hashBuffer = await crypto.subtle.digest('MD5', dataBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                return hashHex;
            } catch (error) {
                // Web Crypto API 可能不支持 MD5，降级到纯 JavaScript 实现
                KernelLogger.debug("CryptDrive", "Web Crypto API 不支持 MD5，使用纯 JavaScript 实现");
            }
        }
        
        // 纯 JavaScript MD5 实现
        return CryptDrive._md5Hash(String(data));
    }
    
    /**
     * MD5 哈希（纯 JavaScript 实现）
     * @param {string} data 要哈希的数据
     * @returns {string} MD5 哈希值（十六进制）
     */
    static _md5Hash(data) {
        // MD5 算法实现
        function md5cycle(x, k) {
            let a = x[0], b = x[1], c = x[2], d = x[3];
            
            a = ff(a, b, c, d, k[0], 7, -680876936);
            d = ff(d, a, b, c, k[1], 12, -389564586);
            c = ff(c, d, a, b, k[2], 17, 606105819);
            b = ff(b, c, d, a, k[3], 22, -1044525330);
            a = ff(a, b, c, d, k[4], 7, -176418897);
            d = ff(d, a, b, c, k[5], 12, 1200080426);
            c = ff(c, d, a, b, k[6], 17, -1473231341);
            b = ff(b, c, d, a, k[7], 22, -45705983);
            a = ff(a, b, c, d, k[8], 7, 1770035416);
            d = ff(d, a, b, c, k[9], 12, -1958414417);
            c = ff(c, d, a, b, k[10], 17, -42063);
            b = ff(b, c, d, a, k[11], 22, -1990404162);
            a = ff(a, b, c, d, k[12], 7, 1804603682);
            d = ff(d, a, b, c, k[13], 12, -40341101);
            c = ff(c, d, a, b, k[14], 17, -1502002290);
            b = ff(b, c, d, a, k[15], 22, 1236535329);
            
            a = gg(a, b, c, d, k[1], 5, -165796510);
            d = gg(d, a, b, c, k[6], 9, -1069501632);
            c = gg(c, d, a, b, k[11], 14, 643717713);
            b = gg(b, c, d, a, k[0], 20, -373897302);
            a = gg(a, b, c, d, k[5], 5, -701558691);
            d = gg(d, a, b, c, k[10], 9, 38016083);
            c = gg(c, d, a, b, k[15], 14, -660478335);
            b = gg(b, c, d, a, k[4], 20, -405537848);
            a = gg(a, b, c, d, k[9], 5, 568446438);
            d = gg(d, a, b, c, k[14], 9, -1019803690);
            c = gg(c, d, a, b, k[3], 14, -187363961);
            b = gg(b, c, d, a, k[8], 20, 1163531501);
            a = gg(a, b, c, d, k[13], 5, -1444681467);
            d = gg(d, a, b, c, k[2], 9, -51403784);
            c = gg(c, d, a, b, k[7], 14, 1735328473);
            b = gg(b, c, d, a, k[12], 20, -1926607734);
            
            a = hh(a, b, c, d, k[5], 4, -378558);
            d = hh(d, a, b, c, k[8], 11, -2022574463);
            c = hh(c, d, a, b, k[11], 16, 1839030562);
            b = hh(b, c, d, a, k[14], 23, -35309556);
            a = hh(a, b, c, d, k[1], 4, -1530992060);
            d = hh(d, a, b, c, k[4], 11, 1272893353);
            c = hh(c, d, a, b, k[7], 16, -155497632);
            b = hh(b, c, d, a, k[10], 23, -1094730640);
            a = hh(a, b, c, d, k[13], 4, 681279174);
            d = hh(d, a, b, c, k[0], 11, -358537222);
            c = hh(c, d, a, b, k[3], 16, -722521979);
            b = hh(b, c, d, a, k[6], 23, 76029189);
            a = hh(a, b, c, d, k[9], 4, -640364487);
            d = hh(d, a, b, c, k[12], 11, -421815835);
            c = hh(c, d, a, b, k[15], 16, 530742520);
            b = hh(b, c, d, a, k[2], 23, -995338651);
            
            a = ii(a, b, c, d, k[0], 6, -198630844);
            d = ii(d, a, b, c, k[7], 10, 1126891415);
            c = ii(c, d, a, b, k[14], 15, -1416354905);
            b = ii(b, c, d, a, k[5], 21, -57434055);
            a = ii(a, b, c, d, k[12], 6, 1700485571);
            d = ii(d, a, b, c, k[3], 10, -1894986606);
            c = ii(c, d, a, b, k[10], 15, -1051523);
            b = ii(b, c, d, a, k[1], 21, -2054922799);
            a = ii(a, b, c, d, k[8], 6, 1873313359);
            d = ii(d, a, b, c, k[15], 10, -30611744);
            c = ii(c, d, a, b, k[6], 15, -1560198380);
            b = ii(b, c, d, a, k[13], 21, 1309151649);
            a = ii(a, b, c, d, k[4], 6, -145523070);
            d = ii(d, a, b, c, k[11], 10, -1120210379);
            c = ii(c, d, a, b, k[2], 15, 718787259);
            b = ii(b, c, d, a, k[9], 21, -343485551);
            
            x[0] = add32(a, x[0]);
            x[1] = add32(b, x[1]);
            x[2] = add32(c, x[2]);
            x[3] = add32(d, x[3]);
        }
        
        function cmn(q, a, b, x, s, t) {
            a = add32(add32(a, q), add32(x, t));
            return add32((a << s) | (a >>> (32 - s)), b);
        }
        
        function ff(a, b, c, d, x, s, t) {
            return cmn((b & c) | ((~b) & d), a, b, x, s, t);
        }
        
        function gg(a, b, c, d, x, s, t) {
            return cmn((b & d) | (c & (~d)), a, b, x, s, t);
        }
        
        function hh(a, b, c, d, x, s, t) {
            return cmn(b ^ c ^ d, a, b, x, s, t);
        }
        
        function ii(a, b, c, d, x, s, t) {
            return cmn(c ^ (b | (~d)), a, b, x, s, t);
        }
        
        function add32(a, b) {
            return (a + b) & 0xFFFFFFFF;
        }
        
        function rhex(n) {
            let s = '';
            const hexChr = '0123456789abcdef';
            for (let i = 0; i < 4; i++) {
                s += hexChr.charAt((n >> (i * 8 + 4)) & 0x0F) + hexChr.charAt((n >> (i * 8)) & 0x0F);
            }
            return s;
        }
        
        function hex(x) {
            const result = [];
            for (let i = 0; i < x.length; i++) {
                result.push(rhex(x[i]));
            }
            return result.join('');
        }
        
        // 转换为 UTF-8 字节数组
        const utf8 = unescape(encodeURIComponent(data));
        const bytes = [];
        for (let i = 0; i < utf8.length; i++) {
            bytes.push(utf8.charCodeAt(i));
        }
        
        // 填充
        const len = bytes.length;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56) {
            bytes.push(0);
        }
        
        // 添加长度（64位，小端序）
        const bitLen = len * 8;
        for (let i = 0; i < 8; i++) {
            bytes.push((bitLen >>> (i * 8)) & 0xFF);
        }
        
        // 初始化 MD5 缓冲区
        let h = [1732584193, -271733879, -1732584194, 271733878];
        
        // 处理每个 512 位块
        for (let i = 0; i < bytes.length; i += 64) {
            const chunk = [];
            for (let j = 0; j < 16; j++) {
                chunk[j] = bytes[i + j * 4] | (bytes[i + j * 4 + 1] << 8) | 
                          (bytes[i + j * 4 + 2] << 16) | (bytes[i + j * 4 + 3] << 24);
            }
            md5cycle(h, chunk);
        }
        
        return hex(h);
    }
    
    /**
     * 生成随机整数
     * @param {number} min 最小值（包含）
     * @param {number} max 最大值（包含）
     * @returns {number} 随机整数
     */
    static randomInt(min, max) {
        if (min > max) {
            throw new Error('最小值不能大于最大值');
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    /**
     * 生成随机浮点数
     * @param {number} min 最小值（包含）
     * @param {number} max 最大值（不包含）
     * @returns {number} 随机浮点数
     */
    static randomFloat(min, max) {
        if (min > max) {
            throw new Error('最小值不能大于最大值');
        }
        return Math.random() * (max - min) + min;
    }
    
    /**
     * 生成随机布尔值
     * @returns {boolean} 随机布尔值
     */
    static randomBoolean() {
        return Math.random() >= 0.5;
    }
    
    /**
     * 生成随机字符串
     * @param {number} length 长度
     * @param {string} charset 字符集（默认：'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'）
     * @returns {string} 随机字符串
     */
    static randomString(length, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        if (length <= 0) {
            throw new Error('长度必须大于 0');
        }
        
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    }
    
    /**
     * 从数组中随机选择一个元素
     * @param {Array} array 数组
     * @returns {*} 随机元素
     */
    static randomChoice(array) {
        if (!Array.isArray(array) || array.length === 0) {
            throw new Error('数组不能为空');
        }
        return array[Math.floor(Math.random() * array.length)];
    }
    
    /**
     * 打乱数组（Fisher-Yates 洗牌算法）
     * @param {Array} array 数组
     * @returns {Array} 打乱后的数组（新数组）
     */
    static shuffle(array) {
        if (!Array.isArray(array)) {
            throw new Error('参数必须是数组');
        }
        
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

// 自动初始化
CryptDrive.init().catch(error => {
    KernelLogger.error("CryptDrive", `自动初始化失败: ${error.message}`, error);
});

// 注册到 POOL
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "CryptDrive", CryptDrive);
    } catch (e) {
        KernelLogger.warn("CryptDrive", `注册到POOL失败: ${e.message}`);
    }
}

// 发布依赖加载完成信号
if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
    DependencyConfig.publishSignal("../kernel/drive/cryptDrive.js");
} else if (typeof document !== 'undefined' && document.body) {
    document.body.dispatchEvent(
        new CustomEvent("dependencyLoaded", {
            detail: {
                name: "../kernel/drive/cryptDrive.js",
            },
        })
    );
    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("CryptDrive", "已发布依赖加载信号（降级方案）");
    }
} else {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                DependencyConfig.publishSignal("../kernel/drive/cryptDrive.js");
            } else {
                document.body.dispatchEvent(
                    new CustomEvent("dependencyLoaded", {
                        detail: {
                            name: "../kernel/drive/cryptDrive.js",
                        },
                    })
                );
            }
        });
    } else {
        setTimeout(() => {
            if (document.body) {
                if (typeof DependencyConfig !== 'undefined' && DependencyConfig && typeof DependencyConfig.publishSignal === 'function') {
                    DependencyConfig.publishSignal("../kernel/drive/cryptDrive.js");
                } else {
                    document.body.dispatchEvent(
                        new CustomEvent("dependencyLoaded", {
                            detail: {
                                name: "../kernel/drive/cryptDrive.js",
                            },
                        })
                    );
                }
            }
        }, 0);
    }
}

