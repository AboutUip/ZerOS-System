// 语言扩展：语言包管理器
// 负责从 DISK/D/plugins 加载语言包、设置当前语言、按常量名获取本地化文本
// API 通过 ProcessManager.callKernelAPI 暴露给进程，并受权限管控

(function () {
    'use strict';

    if (typeof KernelLogger !== 'undefined') {
        KernelLogger.info("LanguagesExpansion", "模块初始化");
    }

    /** 语言包存放目录：盘符 D（或 D:），路径 plugins（即 D/plugins 或 D:/plugins） */
    const LANG_PACKS_DIR = 'plugins';
    /** 当前语言持久化存储键（LStorage 顶层 key） */
    const LANG_STORAGE_KEY = 'languagesExpansion';

    /**
     * 获取 D 盘对应的 NodeTreeCollection 及 plugins 路径（若未挂载则返回 null）
     * 兼容分区名 "D" 与 "D:"
     * @returns {{ nodeTree: Object, packsPath: string }|null}
     */
    function getNodeTreeForLangPacks() {
        if (typeof Disk === 'undefined') return null;
        let map = Disk.diskSeparateMap;
        if (!map) return null;
        let nodeTree = map.get('D') || map.get('D:') || null;
        if (!nodeTree) return null;
        let packsPath = nodeTree.separateName + '/' + LANG_PACKS_DIR;
        return { nodeTree: nodeTree, packsPath: packsPath };
    }

    /**
     * 从 D/plugins 读取文件内容（内核内直接使用 NodeTree，不经过 ProcessManager）
     * 若 D/plugins 节点不存在则直接返回 null，由上层走 PHP 回落，避免触发 NodeTree 错误日志
     * @param {string} fileName 文件名，如 "zh-CN.json"
     * @returns {Promise<string|null>} 文件内容，失败返回 null
     */
    async function readLangPackFile(fileName) {
        let ref = getNodeTreeForLangPacks();
        if (!ref || !ref.nodeTree.initialized) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("LanguagesExpansion", "无法读取语言包: D 盘或 plugins 目录未就绪");
            }
            return null;
        }
        if (typeof ref.nodeTree.hasNode === 'function' && !ref.nodeTree.hasNode(ref.packsPath)) {
            return null;
        }
        try {
            let content = await ref.nodeTree.read_file(ref.packsPath, fileName);
            return content != null ? String(content) : null;
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("LanguagesExpansion", "读取语言包文件失败: " + fileName + ", " + (e && e.message));
            }
            return null;
        }
    }

    /** D 盘 plugins 目录的虚拟路径（用于 PHP FSDirve：D:/plugins） */
    const LANG_PACKS_VIRTUAL_PATH = 'D:/plugins';

    /**
     * 获取 FSDirve 服务 URL 的 base（用于 PHP 回退）
     * @returns {URL|null}
     */
    function getFSDirveBaseUrl() {
        if (typeof SystemInformation === 'undefined') return null;
        try {
            if (typeof SystemInformation.buildServiceUrlObject === 'function') {
                var path = typeof SystemInformation.getFSDirvePath === 'function'
                    ? SystemInformation.getFSDirvePath()
                    : (SystemInformation.SERVICE_NAMES && SystemInformation.SERVICE_NAMES.FSDIRVE) || '/system/service/FSDirve.php';
                return SystemInformation.buildServiceUrlObject(path);
            }
            var origin = typeof SystemInformation.getOrigin === 'function' ? SystemInformation.getOrigin() : (typeof window !== 'undefined' ? window.location.origin : '');
            var path = typeof SystemInformation.getFSDirvePath === 'function' ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php';
            return new URL(path, origin);
        } catch (e) {
            return null;
        }
    }

    /**
     * 通过 PHP FSDirve 列出 D/plugins 目录（NodeTree 无该节点时回退）
     * @returns {Promise<string[]|null>} 文件名列表，失败返回 null
     */
    function listLangPackFilesViaPHP() {
        var base = getFSDirveBaseUrl();
        if (!base) return Promise.resolve(null);
        var url = new URL(base);
        url.searchParams.set('action', 'list_dir');
        url.searchParams.set('path', LANG_PACKS_VIRTUAL_PATH);
        return fetch(url.toString())
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (result) {
                if (!result || result.status !== 'success' || !result.data) return null;
                var items = result.data.items;
                if (!Array.isArray(items)) return null;
                return items
                    .filter(function (item) { return item && item.type === 'file' && item.name && /\.json$/i.test(item.name); })
                    .map(function (item) { return item.name; });
            })
            .catch(function () { return null; });
    }

    /**
     * 通过 PHP FSDirve 读取 D/plugins 下文件（NodeTree 无该节点时回退）
     * @param {string} fileName 文件名
     * @returns {Promise<string|null>}
     */
    function readLangPackFileViaPHP(fileName) {
        var base = getFSDirveBaseUrl();
        if (!base) return Promise.resolve(null);
        var url = new URL(base);
        url.searchParams.set('action', 'read_file');
        url.searchParams.set('path', LANG_PACKS_VIRTUAL_PATH);
        url.searchParams.set('fileName', fileName);
        return fetch(url.toString())
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (result) {
                if (!result || result.status !== 'success' || !result.data || result.data.content == null) return null;
                return String(result.data.content);
            })
            .catch(function () { return null; });
    }

    /**
     * 列出 D/plugins 目录下的文件名（仅 NodeTree，无 PHP 回退）
     * 若 D/plugins 节点不存在则直接返回 []，由上层走 PHP 回落，避免触发 NodeTree 警告日志
     * @returns {string[]} 文件名列表
     */
    function listLangPackFiles() {
        let ref = getNodeTreeForLangPacks();
        if (!ref || !ref.nodeTree.initialized) return [];
        if (typeof ref.nodeTree.hasNode === 'function' && !ref.nodeTree.hasNode(ref.packsPath)) {
            return [];
        }
        try {
            let list = ref.nodeTree.list_file(ref.packsPath);
            if (!Array.isArray(list)) return [];
            return list
                .filter(function (item) { return item && item.name && /\.json$/i.test(item.name); })
                .map(function (item) { return item.name; });
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("LanguagesExpansion", "列出语言包目录失败: " + (e && e.message));
            }
            return [];
        }
    }

    /**
     * 解析语言包 JSON 为 { [constantName]: string }
     * 支持格式：{ "strings": { "KEY": "text" } } 或 { "KEY": "text" }
     * @param {string} raw 文件内容
     * @param {string} locale 语言标识（用于日志）
     * @returns {Object.<string, string>} 常量名到文本的映射
     */
    function parseLangPackJson(raw, locale) {
        if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return {};
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("LanguagesExpansion", `语言包 JSON 解析失败: ${locale}, ${e.message}`);
            }
            return {};
        }
        if (!data || typeof data !== 'object') return {};
        if (data.strings && typeof data.strings === 'object') return data.strings;
        let out = {};
        for (let k in data) {
            if (Object.prototype.hasOwnProperty.call(data, k) && typeof data[k] === 'string') {
                out[k] = data[k];
            }
        }
        return out;
    }

    /** 已加载的语言包缓存：locale -> { [constantName]: string } */
    let loadedPacks = new Map();
    /** 当前语言（内存），持久化在 LStorage */
    let currentLocale = '';
    /** 语言变更监听器（参考 ThemeManager._themeChangeListeners） */
    let _languageChangeListeners = [];

    /**
     * 通知所有语言变更监听器
     * @param {string} locale 新语言标识
     */
    function _notifyLanguageChange(locale) {
        _languageChangeListeners.forEach(function (listener) {
            try {
                listener(locale);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("LanguagesExpansion", "语言变更监听器执行失败: " + (e && e.message));
                }
            }
        });
    }

    /**
     * 从 LStorage 读取当前语言（仅当 LStorage 可用时，异步）
     * @returns {Promise<void>} 便于 init 等待恢复完成
     */
    function loadCurrentLocaleFromStorage() {
        if (typeof LStorage === 'undefined') return Promise.resolve();
        return LStorage.getSystemStorage(LANG_STORAGE_KEY).then(function (data) {
            if (data && data.currentLocale && typeof data.currentLocale === 'string') {
                currentLocale = data.currentLocale;
            }
        }).catch(function (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug("LanguagesExpansion", "读取当前语言失败: " + (e && e.message));
            }
        });
    }

    /**
     * 将当前语言写入 LStorage（仅当 LStorage 可用时，异步）
     */
    function saveCurrentLocaleToStorage() {
        if (typeof LStorage === 'undefined') return;
        LStorage.getSystemStorage(LANG_STORAGE_KEY).then(function (data) {
            let obj = data && typeof data === 'object' ? data : {};
            obj.currentLocale = currentLocale;
            return LStorage.setSystemStorage(LANG_STORAGE_KEY, obj);
        }).catch(function (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug("LanguagesExpansion", "保存当前语言失败: " + (e && e.message));
            }
        });
    }

    let LanguagesExpansion = {
        /**
         * 加载指定语言包（从 D/plugins/<locale>.json）
         * @param {string} locale 语言标识，如 "zh-CN"，对应文件 zh-CN.json
         * @returns {Promise<boolean>} 是否加载成功
         */
        loadLanguagePack: async function (locale) {
            if (!locale || typeof locale !== 'string') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("LanguagesExpansion", "loadLanguagePack: locale 必须是非空字符串");
                }
                return false;
            }
            var fileName = locale + '.json';
            var raw = await readLangPackFile(fileName);
            if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
                return readLangPackFileViaPHP(fileName).then(function (content) {
                    if (content == null) return false;
                    var strings = parseLangPackJson(content, locale);
                    loadedPacks.set(locale, strings);
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info("LanguagesExpansion", "已加载语言包（PHP 回退）: " + locale);
                    }
                    return true;
                });
            }
            var strings = parseLangPackJson(raw, locale);
            loadedPacks.set(locale, strings);
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("LanguagesExpansion", "已加载语言包: " + locale);
            }
            return true;
        },

        /**
         * 设置当前使用的语言包（会持久化到 LStorage）
         * 若该语言包未加载，会先尝试加载
         * @param {string} locale 语言标识
         * @returns {Promise<boolean>} 是否设置成功
         */
        setLanguagePack: function (locale) {
            if (!locale || typeof locale !== 'string') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("LanguagesExpansion", "setLanguagePack: locale 必须是非空字符串");
                }
                return Promise.resolve(false);
            }
            var self = this;
            if (!loadedPacks.has(locale)) {
                return this.loadLanguagePack(locale).then(function (ok) {
                    if (ok) {
                        currentLocale = locale;
                        saveCurrentLocaleToStorage();
                        _notifyLanguageChange(locale);
                        return true;
                    }
                    return false;
                });
            }
            currentLocale = locale;
            saveCurrentLocaleToStorage();
            _notifyLanguageChange(locale);
            return Promise.resolve(true);
        },

        /**
         * 使用常量名获取当前（或指定）语言下的实际文本
         * @param {string} constantName 常量名，如 "KEY_OK"
         * @param {string} [locale] 可选，指定语言；不传则使用当前语言
         * @returns {string} 对应文本，未找到时返回 constantName 本身
         */
        getText: function (constantName, locale) {
            if (!constantName || typeof constantName !== 'string') return '';
            let useLocale = locale != null && locale !== '' ? locale : currentLocale;
            let pack = useLocale ? loadedPacks.get(useLocale) : null;
            if (pack && Object.prototype.hasOwnProperty.call(pack, constantName)) {
                return pack[constantName];
            }
            return constantName;
        },

        /**
         * 列出已存在的语言包文件名（D/plugins 下 *.json）
         * 先尝试 NodeTree，若节点不存在则通过 PHP FSDirve 回退，仍失败则返回默认列表
         * @returns {Promise<string[]>} 文件名列表，如 ["zh-CN.json", "en.json"]
         */
        listPacks: function () {
            var fromNode = listLangPackFiles();
            if (fromNode && fromNode.length > 0) return Promise.resolve(fromNode);
            return listLangPackFilesViaPHP().then(function (fromPHP) {
                if (fromPHP && fromPHP.length > 0) return fromPHP;
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug("LanguagesExpansion", "NodeTree 与 PHP 均无 D/plugins，使用默认语言包列表");
                }
                return ['zh-CN.json', 'en.json'];
            });
        },

        /**
         * 获取当前语言
         * @returns {string}
         */
        getCurrentLocale: function () {
            return currentLocale;
        },

        /**
         * 获取已加载的语言标识列表
         * @returns {string[]}
         */
        getLoadedLocales: function () {
            return Array.from(loadedPacks.keys());
        },

        /**
         * 注册语言变更监听器（参考 ThemeManager.onThemeChange）
         * 当用户切换语言（Languages.setCurrent）时会调用所有监听器，应用程序可在此更新界面文案。
         * @param {function(string): void} listener 监听器函数，参数为新语言标识 locale（如 "zh-CN"）
         * @returns {function(): void} 取消监听的函数
         */
        onLanguageChange: function (listener) {
            if (typeof listener !== 'function') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("LanguagesExpansion", "onLanguageChange: 监听器必须是函数");
                }
                return function () {};
            }
            _languageChangeListeners.push(listener);
            try {
                listener(currentLocale);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("LanguagesExpansion", "onLanguageChange 初始化调用失败: " + (e && e.message));
                }
            }
            return function () {
                var i = _languageChangeListeners.indexOf(listener);
                if (i !== -1) _languageChangeListeners.splice(i, 1);
            };
        },

        /**
         * 移除语言变更监听器
         * @param {function(string): void} listener 此前通过 onLanguageChange 注册的监听器
         */
        offLanguageChange: function (listener) {
            var i = _languageChangeListeners.indexOf(listener);
            if (i !== -1) _languageChangeListeners.splice(i, 1);
        },

        /**
         * 初始化：从 LStorage 恢复当前语言，并预加载该语言包、通知监听器
         * @returns {Promise<void>} 调用方可 await 以确保重启后语言已恢复
         */
        init: function () {
            var self = this;
            return loadCurrentLocaleFromStorage().then(function () {
                if (currentLocale && !loadedPacks.has(currentLocale)) {
                    return self.loadLanguagePack(currentLocale);
                }
            }).then(function () {
                if (currentLocale) {
                    _notifyLanguageChange(currentLocale);
                }
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info("LanguagesExpansion", "初始化完成，当前语言: " + (currentLocale || '(未设置)'));
                }
            });
        }
    };

    LanguagesExpansion._ready = LanguagesExpansion.init();

    if (typeof window !== 'undefined') {
        window.LanguagesExpansion = LanguagesExpansion;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.LanguagesExpansion = LanguagesExpansion;
    }

    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
                POOL.__INIT__("KERNEL_GLOBAL_POOL");
            }
            POOL.__ADD__("KERNEL_GLOBAL_POOL", "LanguagesExpansion", LanguagesExpansion);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn("LanguagesExpansion", "注册到 POOL 失败: " + (e && e.message));
            }
        }
    }

    if (typeof DependencyConfig !== 'undefined' && typeof DependencyConfig.publishSignal === 'function') {
        DependencyConfig.publishSignal("../system/expansion/languagesExpansion.js");
    }
})();
