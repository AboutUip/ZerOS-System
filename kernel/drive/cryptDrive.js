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
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SYSTEM,
                    `CryptDrive.初始化失败: ${error.message}`,
                    { error: error.message, stack: error.stack }
                ).catch(() => { });
            } else {
                KernelLogger.error("CryptDrive", `初始化失败: ${error.message}`, error);
            }

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

            // 验证密钥数据
            if (!CryptDrive._keys) {
                KernelLogger.warn("CryptDrive", "密钥数据为空，无法保存");
                return false;
            }

            const keyCount = CryptDrive._keys.keys ? Object.keys(CryptDrive._keys.keys).length : 0;
            KernelLogger.info("CryptDrive", `准备保存密钥数据: 存储键=${CryptDrive.STORAGE_KEY}, 密钥数量=${keyCount}`);

            const success = await LStorage.setSystemStorage(CryptDrive.STORAGE_KEY, CryptDrive._keys);
            if (success) {
                KernelLogger.info("CryptDrive", `密钥数据已保存: 存储键=${CryptDrive.STORAGE_KEY}, 密钥数量=${keyCount}`);

                // 验证保存结果
                try {
                    const saved = await LStorage.getSystemStorage(CryptDrive.STORAGE_KEY);
                    if (saved && saved.keys) {
                        const savedKeyCount = Object.keys(saved.keys).length;
                        if (savedKeyCount === keyCount) {
                            KernelLogger.debug("CryptDrive", `保存验证成功: 密钥数量匹配 (${savedKeyCount})`);
                        } else {
                            KernelLogger.warn("CryptDrive", `保存验证警告: 密钥数量不匹配 (期望: ${keyCount}, 实际: ${savedKeyCount})`);
                        }
                    } else {
                        KernelLogger.warn("CryptDrive", "保存验证失败: 读取的数据为空或格式不正确");
                    }
                } catch (verifyError) {
                    KernelLogger.warn("CryptDrive", `保存验证失败: ${verifyError.message}`);
                }
            } else {
                KernelLogger.error("CryptDrive", `密钥数据保存失败: LStorage.setSystemStorage 返回 false`);
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
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SERVICE,
                    `CryptDrive.generateKeyPair 失败: ${error.message}`,
                    { error: error.message, stack: error.stack, options }
                ).catch(() => { });
            }
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
        try {
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

            const crypt = new CryptDrive._jsencrypt();
            crypt.setPublicKey(targetPublicKey);
            const encrypted = crypt.encrypt(data);

            if (!encrypted) {
                throw new Error('加密失败');
            }

            return encrypted;
        } catch (error) {
            KernelLogger.error("CryptDrive", `加密失败: ${error.message}`, error);
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SERVICE,
                    `CryptDrive.encrypt 失败: ${error.message}`,
                    { error: error.message, stack: error.stack, keyId }
                ).catch(() => { });
            }
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
        try {
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

            const crypt = new CryptDrive._jsencrypt();
            crypt.setPrivateKey(targetPrivateKey);
            const decrypted = crypt.decrypt(encryptedData);

            if (!decrypted) {
                throw new Error('解密失败');
            }

            return decrypted;
        } catch (error) {
            KernelLogger.error("CryptDrive", `解密失败: ${error.message}`, error);
            // 报告异常
            if (typeof ExceptionHandler !== 'undefined') {
                ExceptionHandler.reportException(
                    ExceptionHandler.ExceptionLevel.SERVICE,
                    `CryptDrive.decrypt 失败: ${error.message}`,
                    { error: error.message, stack: error.stack, keyId }
                ).catch(() => { });
            }
            throw new Error(`解密失败: ${error.message}`);
        }
    }

    /**
     * MD5 哈希
     * @param {string} data 要哈希的数据
     * @returns {Promise<string>} MD5 哈希值（十六进制）
     */
    static async md5(data) {
        if (data === null || data === undefined || data === '') {
            throw new Error('数据不能为空');
        }
        // RFC 1321 MD5（UTF-8 经 unescape(encodeURIComponent)），与 system/service/cryptDriveMd5Compat.php / randomSecurity 一致
        return CryptDrive._md5Hash(String(data));
    }

    /**
     * MD5 十六进制（RFC 1321）。实现基于 blueimp/JavaScript-MD5（MIT）的 32 位字块路径，替代原先按字节组块且与 RFC 不一致的旧实现。
     * @param {string} data 要哈希的数据
     * @returns {string} MD5 哈希值（十六进制）
     */
    static _md5Hash(data) {
        function safeAdd(x, y) {
            const lsw = (x & 0xffff) + (y & 0xffff);
            const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
            return (msw << 16) | (lsw & 0xffff);
        }
        function bitRotateLeft(num, cnt) {
            return (num << cnt) | (num >>> (32 - cnt));
        }
        function md5cmn(q, a, b, x, s, t) {
            return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
        }
        function md5ff(a, b, c, d, x, s, t) {
            return md5cmn((b & c) | (~b & d), a, b, x, s, t);
        }
        function md5gg(a, b, c, d, x, s, t) {
            return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
        }
        function md5hh(a, b, c, d, x, s, t) {
            return md5cmn(b ^ c ^ d, a, b, x, s, t);
        }
        function md5ii(a, b, c, d, x, s, t) {
            return md5cmn(c ^ (b | ~d), a, b, x, s, t);
        }
        function binlMD5(x, len) {
            x[len >> 5] |= 0x80 << (len % 32);
            x[(((len + 64) >>> 9) << 4) + 14] = len;
            let a = 1732584193;
            let b = -271733879;
            let c = -1732584194;
            let d = 271733878;
            for (let i = 0; i < x.length; i += 16) {
                const olda = a;
                const oldb = b;
                const oldc = c;
                const oldd = d;
                a = md5ff(a, b, c, d, x[i], 7, -680876936);
                d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
                c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
                b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
                a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
                d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
                c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
                b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
                a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
                d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
                c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
                b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
                a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
                d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
                c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
                b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
                a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
                d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
                c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
                b = md5gg(b, c, d, a, x[i], 20, -373897302);
                a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
                d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
                c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
                b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
                a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
                d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
                c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
                b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
                a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
                d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
                c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
                b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
                a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
                d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
                c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
                b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
                a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
                d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
                c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
                b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
                a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
                d = md5hh(d, a, b, c, x[i], 11, -358537222);
                c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
                b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
                a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
                d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
                c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
                b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
                a = md5ii(a, b, c, d, x[i], 6, -198630844);
                d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
                c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
                b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
                a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
                d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
                c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
                b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
                a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
                d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
                c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
                b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
                a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
                d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
                c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
                b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
                a = safeAdd(a, olda);
                b = safeAdd(b, oldb);
                c = safeAdd(c, oldc);
                d = safeAdd(d, oldd);
            }
            return [a, b, c, d];
        }
        function rstr2binl(input) {
            const output = [];
            output[(input.length >> 2) - 1] = undefined;
            for (let i = 0; i < output.length; i += 1) {
                output[i] = 0;
            }
            const length8 = input.length * 8;
            for (let i = 0; i < length8; i += 8) {
                output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << (i % 32);
            }
            return output;
        }
        function binl2rstr(input) {
            let output = '';
            const length32 = input.length * 32;
            for (let i = 0; i < length32; i += 8) {
                output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xff);
            }
            return output;
        }
        function rstr2hex(input) {
            const hexTab = '0123456789abcdef';
            let output = '';
            for (let i = 0; i < input.length; i += 1) {
                const x = input.charCodeAt(i);
                output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f);
            }
            return output;
        }
        const utf8 = unescape(encodeURIComponent(String(data)));
        return rstr2hex(binl2rstr(binlMD5(rstr2binl(utf8), utf8.length * 8)));
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

