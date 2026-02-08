// AI 智能翻译 + 普通机器翻译服务：启用后在 POOL > SERVER 中暴露 Translate
// - translateSimple(text, toLang)：普通机器翻译，POST /api/v1/translate/text，请求体 { text }，响应 { text, translate }
// - translate(textOrTexts, optionsOrTargetLang)：AI 智能翻译，单条/批量、风格、上下文等

(function () {
    'use strict';

    /** 普通机器翻译 API（简单 text + to_lang） */
    const SIMPLE_TRANSLATE_API = 'https://uapis.cn/api/v1/translate/text';
    /** AI 智能翻译 API */
    const AI_TRANSLATE_API = 'https://uapis.cn/api/v1/ai/translate';
    const POOL_CATEGORY = 'SERVER';
    const POOL_KEY = 'Translate';

    /** 翻译风格 */
    var STYLE = { casual: 'casual', professional: 'professional', academic: 'academic', literary: 'literary' };
    /** 翻译上下文 */
    var CONTEXT = {
        general: 'general', business: 'business', technical: 'technical', medical: 'medical',
        legal: 'legal', marketing: 'marketing', entertainment: 'entertainment', education: 'education', news: 'news'
    };

    var _running = false;

    var _requestCount = 0;
    var _successCount = 0;
    var _errorCount = 0;
    var _lastRequestAt = null;
    var _lastSuccessAt = null;
    var _lastErrorAt = null;
    var _lastError = null;

    function recordRequest() {
        _requestCount++;
        _lastRequestAt = Date.now();
    }
    function recordSuccess() {
        _successCount++;
        _lastSuccessAt = Date.now();
    }
    function recordError(msg) {
        _errorCount++;
        _lastErrorAt = Date.now();
        _lastError = msg;
    }

    /**
     * 普通机器翻译：POST /api/v1/translate/text?to_lang=xxx，请求体 { text }，响应 { text, translate }
     * @param {string} text 待翻译文本
     * @param {string} [toLang='en'] 目标语言代码
     * @returns {Promise<{ text: string, translate: string }>}
     */
    function translateSimple(text, toLang) {
        toLang = (toLang != null && String(toLang).trim()) ? String(toLang).trim() : 'en';
        var url = SIMPLE_TRANSLATE_API + '?to_lang=' + encodeURIComponent(toLang);
        var body = JSON.stringify({ text: text == null ? '' : String(text) });

        if (typeof fetch === 'undefined' || typeof fetch !== 'function') {
            var err = new Error('fetch 不可用');
            recordRequest();
            recordError(err.message);
            return Promise.reject(err);
        }

        recordRequest();

        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        }).then(function (res) {
            if (!res || !res.ok) {
                return Promise.reject(new Error('HTTP ' + (res ? res.status : 'unknown')));
            }
            return res.json();
        }).then(function (data) {
            if (!data || typeof data !== 'object') {
                return Promise.reject(new Error('无效响应'));
            }
            recordSuccess();
            return {
                text: data.text != null ? String(data.text) : '',
                translate: data.translate != null ? String(data.translate) : ''
            };
        }).catch(function (err) {
            recordError(err && (err.message || String(err)) || 'unknown');
            return Promise.reject(err);
        });
    }

    function normalizeOptions(optionsOrTargetLang) {
        var targetLang = 'en';
        var sourceLang = undefined;
        var style = 'professional';
        var context = 'general';
        var preserveFormat = true;
        var fastMode = false;
        var maxConcurrency = 3;

        if (optionsOrTargetLang != null) {
            if (typeof optionsOrTargetLang === 'string') {
                targetLang = optionsOrTargetLang.trim() || 'en';
            } else if (typeof optionsOrTargetLang === 'object') {
                if (optionsOrTargetLang.target_lang != null) targetLang = String(optionsOrTargetLang.target_lang).trim() || 'en';
                if (optionsOrTargetLang.source_lang != null) sourceLang = String(optionsOrTargetLang.source_lang).trim();
                if (optionsOrTargetLang.style != null && STYLE[optionsOrTargetLang.style] != null) style = optionsOrTargetLang.style;
                if (optionsOrTargetLang.context != null && CONTEXT[optionsOrTargetLang.context] != null) context = optionsOrTargetLang.context;
                if (typeof optionsOrTargetLang.preserve_format === 'boolean') preserveFormat = optionsOrTargetLang.preserve_format;
                if (typeof optionsOrTargetLang.fast_mode === 'boolean') fastMode = optionsOrTargetLang.fast_mode;
                if (typeof optionsOrTargetLang.max_concurrency === 'number' && optionsOrTargetLang.max_concurrency >= 1 && optionsOrTargetLang.max_concurrency <= 10) {
                    maxConcurrency = Math.floor(optionsOrTargetLang.max_concurrency);
                }
            }
        }

        return {
            target_lang: targetLang,
            source_lang: sourceLang,
            style: style,
            context: context,
            preserve_format: preserveFormat,
            fast_mode: fastMode,
            max_concurrency: maxConcurrency
        };
    }

    function buildBody(input, opts) {
        var body = {
            style: opts.style,
            context: opts.context,
            preserve_format: opts.preserve_format,
            fast_mode: opts.fast_mode
        };
        if (Array.isArray(input)) {
            var list = input.slice(0, 50).map(function (s) { return s == null ? '' : String(s); });
            body.texts = list;
            body.max_concurrency = opts.max_concurrency;
        } else {
            body.text = input == null ? '' : String(input);
        }
        if (opts.source_lang) body.source_lang = opts.source_lang;
        return body;
    }

    function normalizeSingleResponse(data, performance) {
        if (!data || typeof data !== 'object') {
            return { original_text: '', translated_text: '', detected_lang: '', confidence_score: 0, alternatives: [], explanation: {}, quality_metrics: {}, performance: performance || {} };
        }
        return {
            original_text: data.original_text != null ? String(data.original_text) : '',
            translated_text: data.translated_text != null ? String(data.translated_text) : '',
            detected_lang: data.detected_lang != null ? String(data.detected_lang) : '',
            confidence_score: typeof data.confidence_score === 'number' ? data.confidence_score : 0,
            alternatives: Array.isArray(data.alternatives) ? data.alternatives.map(String) : [],
            explanation: data.explanation && typeof data.explanation === 'object' ? data.explanation : {},
            quality_metrics: data.quality_metrics && typeof data.quality_metrics === 'object' ? data.quality_metrics : {},
            performance: performance && typeof performance === 'object' ? performance : {}
        };
    }

    /**
     * AI 智能翻译：单条或批量，支持风格、上下文等
     * @param {string|string[]} textOrTexts 单条文本或文本数组（批量最多 50 条）
     * @param {string|object} [optionsOrTargetLang] 目标语言或选项对象
     * @returns {Promise<object>} 单条 { is_batch: false, data, performance }；批量 { is_batch: true, batch_data, batch_summary, performance }
     */
    function translate(textOrTexts, optionsOrTargetLang) {
        var isBatch = Array.isArray(textOrTexts);
        var input = isBatch ? textOrTexts : textOrTexts;
        var opts = normalizeOptions(optionsOrTargetLang);
        var body = buildBody(input, opts);
        var url = AI_TRANSLATE_API + '?target_lang=' + encodeURIComponent(opts.target_lang);

        if (typeof fetch === 'undefined' || typeof fetch !== 'function') {
            var err = new Error('fetch 不可用');
            recordRequest();
            recordError(err.message);
            return Promise.reject(err);
        }

        recordRequest();

        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) {
            if (!res || !res.ok) {
                return Promise.reject(new Error('HTTP ' + (res ? res.status : 'unknown')));
            }
            return res.json();
        }).then(function (json) {
            if (!json || typeof json !== 'object') {
                return Promise.reject(new Error('无效响应'));
            }
            recordSuccess();

            var performance = json.performance && typeof json.performance === 'object' ? json.performance : {};
            if (json.is_batch === true && Array.isArray(json.batch_data)) {
                return {
                    is_batch: true,
                    batch_data: json.batch_data,
                    batch_summary: json.batch_summary && typeof json.batch_summary === 'object' ? json.batch_summary : {},
                    performance: performance
                };
            }
            return {
                is_batch: false,
                data: normalizeSingleResponse(json.data, performance),
                performance: performance
            };
        }).catch(function (err) {
            recordError(err && (err.message || String(err)) || 'unknown');
            return Promise.reject(err);
        });
    }

    function getTranslateAPI() {
        return {
            /** 普通机器翻译：translateSimple(text, toLang) → { text, translate } */
            translateSimple: translateSimple,
            /** AI 智能翻译：单条/批量、风格、上下文 → { is_batch, data|batch_data, batch_summary?, performance } */
            translate: translate,
            STYLE: STYLE,
            CONTEXT: CONTEXT
        };
    }

    function __init__() {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-translate', 'init');
        }
    }

    function __start__() {
        if (_running) return;
        _running = true;
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                if (!POOL.__HAS__(POOL_CATEGORY)) {
                    POOL.__INIT__(POOL_CATEGORY);
                }
                POOL.__ADD__(POOL_CATEGORY, POOL_KEY, getTranslateAPI());
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('server-translate', '已向 POOL > SERVER 注册 Translate');
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-translate', '注册 POOL 失败: ' + (e && e.message));
                }
            }
        }
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-translate', 'start');
        }
    }

    function __stop__() {
        if (!_running) return;
        _running = false;
        if (typeof POOL !== 'undefined' && typeof POOL.__REMOVE__ === 'function') {
            try {
                POOL.__REMOVE__(POOL_CATEGORY, POOL_KEY);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('server-translate', '已从 POOL > SERVER 移除 Translate');
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-translate', '移除 POOL 失败: ' + (e && e.message));
                }
            }
        }
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-translate', 'stop');
        }
    }

    function __status__() {
        var poolExposed = _running && typeof POOL !== 'undefined' && POOL.__HAS__(POOL_CATEGORY, POOL_KEY);
        return {
            serviceId: 'translate',
            serviceName: 'Translate',
            version: '2.0',
            running: _running,
            poolExposed: poolExposed,
            poolCategory: POOL_CATEGORY,
            poolKey: POOL_KEY,
            poolPath: POOL_CATEGORY + ' > ' + POOL_KEY,
            simpleApi: SIMPLE_TRANSLATE_API,
            aiApi: AI_TRANSLATE_API,
            defaultTargetLang: 'en',
            styles: Object.keys(STYLE),
            contexts: Object.keys(CONTEXT),
            fetchAvailable: typeof fetch === 'function',
            usage: poolExposed ? 'Translate.translateSimple(text, toLang) | Translate.translate(textOrTexts, options)' : null,
            stats: {
                requestCount: _requestCount,
                successCount: _successCount,
                errorCount: _errorCount,
                lastRequestAt: _lastRequestAt,
                lastSuccessAt: _lastSuccessAt,
                lastErrorAt: _lastErrorAt,
                lastError: _lastError
            }
        };
    }

    function __info__() {
        return {
            name: 'Translate',
            version: '2.0',
            description: 'ZerOS 翻译服务：普通机器翻译 translateSimple(text, toLang)；AI 智能翻译 translate(textOrTexts, options)。POOL > SERVER 暴露 Translate'
        };
    }

    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__({
            __init__: __init__,
            __start__: __start__,
            __stop__: __stop__,
            __status__: __status__,
            __info__: __info__
        });
    }
})();
