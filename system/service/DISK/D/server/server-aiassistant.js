// AI 助手服务
// 自启动后持续监听语音，识别到「你好小A」或「小A小A」后进入处理模式，处理用户语句直到说「再见」或「拜拜」，然后回到监听状态
// 依赖：ProcessManager、SpeechDrive（通过 ProcessManager.callKernelAPI）

(function () {
    'use strict';

    /** D/server 服务使用的 PID（内核对该 PID 放行） */
    var _pid = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;

    var _running = false;
    var _processingMode = false;  // false=仅监听唤醒词，true=处理用户语句
    var _sessionCreated = false;
    var _aiRequestInFlight = false;   // 防止并发 AI 请求
    var _pendingUserInput = null;     // AI 请求进行中时的新输入，完成后处理
    var _debounceTimer = null;        // 防抖定时器，合并连续语音识别结果
    var _debounceInput = null;        // 防抖窗口内的用户输入（取较长者，过滤短片段）
    var _DEBOUNCE_MS = 500;           // 防抖间隔（毫秒）
    var _speaking = false;            // 语音输出进行中，期间不处理用户输入

    /** 调试模式：为 true 时仅在控制台输出，不执行任何操作（不打开程序、不语音输出） */
    var DEBUG = false;

    /** 是否使用语音回复 [S] 类回复；为 false 时不朗读，避免 AI 语音被麦克风错误识别 */
    var ENABLE_VOICE_REPLY = false;

    /** 唤醒时是否播放展开音效（使用同目录 D/server/ 下的 start.mp3） */
    var ENABLE_WAKE_SOUND = true;

    /** 唤醒词：说出后进入处理模式 */
    var WAKE_WORDS = ['你好', '你好小A', '小A小A'];
    /** 结束词：说出后退出处理模式，继续监听 */
    var GOODBYE_WORDS = ['再见', '拜拜'];

    /** 配置持久化键（localStorage） */
    var _CONFIG_KEY = 'zeros_server_aiassistant_config';

    /** 特征符：用于匹配最终输出，取最后一个匹配以过滤思考过程误输出 */
    var MARKER_P = '[P]';
    var MARKER_S = '[S]';

    /** 启动提示词：服务启动时发送给 AI，用于初始化上下文（返回数据被抛弃） */
    var START_PROMPT = `
你是小A，ZerOS操作系统的语音助手,你的开发者是小萱baibai。每次对话独立，无上下文记忆。最终回复必须以特征符 [P] 或 [S] 开头。

【输出格式】回复必须以以下特征符开头，二选一（特征符后接空格再接内容）：
- [S] 闲聊、问候、讲笑话、简短对话，或无法处理时的拒绝。格式：[S] 回复内容
- [P] 程序/系统操作，格式：[P] [操作] [参数]，无其他文字

【受支持的操作指令】

1. OPEN [程序] — 打开指定程序
   支持程序：about(关于本机), settings(设置), notepad(记事本), terminal(终端), filemanager(文件管理器), taskmanager(任务管理器), browser(浏览器), webviewer(网页查看), imageviewer(图片查看), audioplayer(音频), videoplayer(视频), musicplayer(音乐), minesweeper(扫雷), paint(画板), run(运行), zeroide(代码编辑器), servicemanager(服务管理), scheduletask(计划任务), sparkai(星火AI), timer(时间罗盘), themeanimator(主题管理)
   其他一律回复 [S] 抱歉，暂不支持该程序。

2. CLOSE [程序] — 关闭指定程序（可关闭与 OPEN 相同的程序）

3. SET [资源] [值] — 调整系统资源
   支持资源：brightness(屏幕亮度)，值为 70-100 的整数
   其他一律回复 [S] 抱歉，暂不支持该操作。

【[S] 回复】问候、闲聊、笑话、日常对话可自由发挥；无法识别的请求统一回复：[S] 抱歉，我无法处理你的请求。
禁止：写诗、创作、长篇解释、科普。

【示例】
用户: 打开记事本 → [P] OPEN notepad
用户: 打开设置 → [P] OPEN settings
用户: 关闭记事本 → [P] CLOSE notepad
用户: 亮度调到80 → [P] SET brightness 80
用户: 打开计算器 → [S] 抱歉，暂不支持该程序。

【用户输入】
`.trim();
    /** 停止提示词：服务停止时发送给 AI，用于结束会话（返回数据被抛弃） */
    var STOP_PROMPT = `再见`;

    /**
     * 标准化文本用于匹配（去空格、小写等）
     * @param {string} text
     * @returns {string}
     */
    function normalizeText(text) {
        if (typeof text !== 'string') return '';
        return text.replace(/\s/g, '').trim();
    }

    /**
     * 播放唤醒展开音效
     * 使用同目录（D/server/）下的 start.mp3；若文件不存在则静默跳过
     */
    function playWakeSound() {
        if (!ENABLE_WAKE_SOUND) return;
        try {
            if (typeof window === 'undefined' || typeof document === 'undefined') return;
            var baseUrl = (document.currentScript && document.currentScript.src)
                ? document.currentScript.src.replace(/\/[^/]*$/, '/')
                : '/system/service/DISK/D/server/';
            var audio = new Audio(baseUrl + 'start.mp3');
            audio.volume = 1;
            audio.play().catch(function (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('server-aiassistant', '唤醒音效播放失败: ' + (e && e.message));
                }
            });
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('server-aiassistant', '唤醒音效播放失败: ' + (e && e.message));
            }
        }
    }

    /**
     * 检查文本是否包含唤醒词
     * @param {string} text
     * @returns {boolean}
     */
    function isWakeWord(text) {
        var normalized = normalizeText(text);
        for (var i = 0; i < WAKE_WORDS.length; i++) {
            if (normalized.indexOf(WAKE_WORDS[i]) >= 0) return true;
        }
        return false;
    }

    /**
     * 检查文本是否包含结束词
     * @param {string} text
     * @returns {boolean}
     */
    function isGoodbyeWord(text) {
        var normalized = normalizeText(text);
        for (var i = 0; i < GOODBYE_WORDS.length; i++) {
            if (normalized.indexOf(GOODBYE_WORDS[i]) >= 0) return true;
        }
        return false;
    }

    /** 讯飞星火 X2.0 API（通过后端代理转发；可通过 __list__/__set__ 配置）
     * 注意：当前 spark-ai-proxy.php 使用自身配置，若需前端传入需修改代理 */
    var SPARK_API_PASSWORD = '';
    var SPARK_APP_ID = '';

    /**
     * 从 localStorage 加载配置并应用到运行时变量
     */
    function loadConfig() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            var raw = window.localStorage.getItem(_CONFIG_KEY);
            if (!raw) return;
            var cfg = JSON.parse(raw);
            if (cfg.debug !== undefined) DEBUG = !!cfg.debug;
            if (cfg.enableVoiceReply !== undefined) ENABLE_VOICE_REPLY = !!cfg.enableVoiceReply;
            if (cfg.enableWakeSound !== undefined) ENABLE_WAKE_SOUND = !!cfg.enableWakeSound;
            if (typeof cfg.wakeWords === 'string' && cfg.wakeWords.trim()) {
                WAKE_WORDS = cfg.wakeWords.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            }
            if (typeof cfg.goodbyeWords === 'string' && cfg.goodbyeWords.trim()) {
                GOODBYE_WORDS = cfg.goodbyeWords.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            }
            if (typeof cfg.sparkApiPassword === 'string') SPARK_API_PASSWORD = cfg.sparkApiPassword;
            if (typeof cfg.sparkAppId === 'string') SPARK_APP_ID = cfg.sparkAppId;
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '加载配置失败: ' + (e && e.message));
            }
        }
    }

    /**
     * 保存配置到 localStorage
     * @param {Object} cfg 配置对象（可与现有配置合并）
     */
    function saveConfig(cfg) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            var existing = {};
            try {
                var raw = window.localStorage.getItem(_CONFIG_KEY);
                if (raw) existing = JSON.parse(raw) || {};
            } catch (e) {}
            for (var k in cfg) {
                if (cfg.hasOwnProperty(k)) existing[k] = cfg[k];
            }
            window.localStorage.setItem(_CONFIG_KEY, JSON.stringify(existing));
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '保存配置失败: ' + (e && e.message));
            }
            throw e;
        }
    }

    loadConfig();

    /** 获取 AI 代理 URL（由代理负责鉴权，前端不携带 Authorization） */
    function getSparkAIProxyUrl() {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrl) {
            return SystemInformation.buildServiceUrl(SystemInformation.SERVICE_NAMES.SPARK_AI_PROXY);
        }
        return (typeof window !== 'undefined' && window.location)
            ? new URL('/system/service/spark-ai-proxy.php', window.location.origin).toString()
            : '/system/service/spark-ai-proxy.php';
    }

    /**
     * AI 交互：传入字符串，调用讯飞星火大模型 API，返回 AI 回复文字
     * AI 不支持上下文，每次请求都会拼接启动提示词
     * @param {string} text 用户输入，会拼接到 START_PROMPT 后面
     * @param {Object} [opts] 可选参数
     * @param {boolean} [opts.prependStartPrompt=true] 是否在文本前拼接启动提示词，设为 false 时直接发送 text（如 STOP_PROMPT）
     * @returns {Promise<string>} AI 回复内容，失败时 reject
     */
    function chatWithAI(text, opts) {
        var prepend = !(opts && opts.prependStartPrompt === false);
        var msg = prepend
            ? (START_PROMPT + (text && text.trim() ? '\n' + text.trim() : ''))
            : (typeof text === 'string' ? text.trim() : '');
        if (!msg) {
            return Promise.reject(new Error('请输入有效文本'));
        }
        var body = {
            model: 'spark-x',
            user: 'aiassistant',
            messages: [{ role: 'user', content: msg }],
            stream: false,
            max_tokens: 4096,
            temperature: 0.5,
            top_k: 5,
            presence_penalty: 1,
            frequency_penalty: 0.02,
            thinking: { type: 'disabled' },
            _auth: { appId: SPARK_APP_ID || '', apiPassword: SPARK_API_PASSWORD || '' }
        };
        var proxyUrl = getSparkAIProxyUrl();
        return fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }
                return response.json();
            })
            .then(function (data) {
                if (data.code !== 0) {
                    throw new Error(data.message || '讯飞星火响应错误 code=' + data.code);
                }
                var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                if (!content) {
                    throw new Error('讯飞星火响应格式错误：缺少 content 字段');
                }
                return content;
            });
    }

    /**
     * 语音输出：将传入的字符串通过 TTS 朗读
     * 使用浏览器 Web Speech API (SpeechSynthesis)
     * 朗读期间 _speaking 为 true，语音识别结果将被忽略
     * @param {string} text 要朗读的文字
     */
    function speakText(text) {
        if (!ENABLE_VOICE_REPLY) return;
        if (typeof text !== 'string' || !text.trim()) return;
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '浏览器不支持语音合成');
            }
            return;
        }
        _speaking = true;
        var u = new SpeechSynthesisUtterance(text.trim());
        u.lang = 'zh-CN';
        u.onend = u.onerror = function () {
            setTimeout(function () {
                try {
                    if (!window.speechSynthesis || !window.speechSynthesis.speaking) {
                        _speaking = false;
                    }
                } catch (e) {
                    _speaking = false;
                }
            }, 0);
        };
        window.speechSynthesis.speak(u);
    }

    /** 允许通过 P OPEN/CLOSE 控制的程序（与 applicationAssets 中的 key 一致） */
    var ALLOWED_PROGRAMS = [
        'about', 'settings', 'notepad', 'terminal', 'filemanager', 'taskmanager', 'browser', 'webviewer',
        'imageviewer', 'audioplayer', 'videoplayer', 'musicplayer', 'minesweeper', 'paint', 'run',
        'zeroide', 'servicemanager', 'scheduletask', 'sparkai', 'timer', 'themeanimator'
    ];

    /**
     * 按程序名关闭所有运行中的实例
     * @param {string} programName 程序名（如 'notepad'）
     */
    function closeProgramByName(programName) {
        if (typeof ProcessManager === 'undefined') return;
        try {
            var processes = ProcessManager.listProcesses && ProcessManager.listProcesses();
            if (!processes || !Array.isArray(processes)) return;
            var closed = 0;
            for (var i = 0; i < processes.length; i++) {
                var p = processes[i];
                if (p && p.programName && p.programName.toLowerCase() === programName && p.status === 'running' && p.pid) {
                    ProcessManager.killProgram(p.pid, true);
                    closed++;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('server-aiassistant', '关闭程序: ' + programName + ' (PID: ' + p.pid + ')');
                    }
                }
            }
            if (closed === 0 && typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('server-aiassistant', '未找到运行中的程序: ' + programName);
            }
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '关闭程序失败: ' + (e && e.message));
            }
        }
    }

    /** AI 助手光效 overlay 元素 ID */
    var _LIGHT_EFFECT_ID = 'ai-assistant-light-effect';
    var _lightEffectHideTimer = null;

    /** AI 助手气泡容器 ID */
    var _BUBBLE_ID = 'ai-assistant-bubble';
    var _bubbleHideTimer = null;

    /**
     * 以气泡对话形式显示 AI 回复
     * @param {string} text 回复内容
     */
    function showAssistantBubble(text) {
        if (typeof document === 'undefined' || !text || typeof text !== 'string') return;
        var t = text.trim();
        if (!t) return;
        if (_bubbleHideTimer) { clearTimeout(_bubbleHideTimer); _bubbleHideTimer = null; }
        var wrap = document.getElementById(_BUBBLE_ID);
        if (!wrap) {
            if (!document.getElementById('ai-assistant-bubble-style')) {
                var s = document.createElement('style');
                s.id = 'ai-assistant-bubble-style';
                s.textContent = '#ai-assistant-bubble{position:fixed;bottom:70px;left:24px;max-width:min(360px,calc(100vw - 48px));z-index:9997;pointer-events:none;opacity:0;transition:opacity 0.3s ease}' +
                    '#ai-assistant-bubble .ai-bubble{background:rgba(30,35,50,0.92);border:1px solid rgba(139,92,246,0.35);border-radius:14px;padding:12px 16px;box-shadow:0 4px 20px rgba(0,0,0,0.3),0 0 1px rgba(139,92,246,0.2);' +
                    'color:#d7e0dd;font-size:14px;line-height:1.5;word-break:break-word;backdrop-filter:blur(8px)}' +
                    '#ai-assistant-bubble .ai-bubble::before{content:"";position:absolute;bottom:-8px;left:20px;border:8px solid transparent;border-top-color:rgba(139,92,246,0.35);border-left-width:0)}';
                document.head.appendChild(s);
            }
            wrap = document.createElement('div');
            wrap.id = _BUBBLE_ID;
            (document.body || document.documentElement).appendChild(wrap);
        }
        wrap.innerHTML = '<div class="ai-bubble">' + t.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        wrap.style.display = '';
        wrap.style.opacity = '0';
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                wrap.style.opacity = '1';
            });
        });
        _bubbleHideTimer = setTimeout(function () {
            _bubbleHideTimer = null;
            wrap.style.opacity = '0';
            setTimeout(function () {
                wrap.style.display = 'none';
            }, 320);
        }, 6000);
    }

    /**
     * 在桌面展示动态光效：科技感彩色灯带沿边缘流动，带淡入淡出
     */
    function showAssistantLightEffect() {
        if (typeof document === 'undefined') return;
        var el = document.getElementById(_LIGHT_EFFECT_ID);
        if (!el) {
            if (!document.getElementById('ai-assistant-light-style')) {
                var style = document.createElement('style');
                style.id = 'ai-assistant-light-style';
                style.textContent = '@keyframes aiAssistantMarquee{to{background-position:1200px 0}}@keyframes aiAssistantMarqueeV{to{background-position:0 1200px}}';
                document.head.appendChild(style);
            }
            var tech = 'rgba(0,212,255,0.95),rgba(99,102,241,0.95),rgba(139,92,246,0.9),rgba(0,212,255,0.95)';
            var g = 'linear-gradient(90deg,' + tech + ')';
            var gv = 'linear-gradient(180deg,' + tech + ')';
            var glow = '0 0 16px rgba(0,212,255,0.35),0 0 4px rgba(139,92,246,0.4)';
            var anim = 'aiAssistantMarquee 4s linear infinite';
            var animRev = 'aiAssistantMarquee 4s linear infinite reverse';
            var animV = 'aiAssistantMarqueeV 4s linear infinite';
            var animVRev = 'aiAssistantMarqueeV 4s linear infinite reverse';
            el = document.createElement('div');
            el.id = _LIGHT_EFFECT_ID;
            el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;opacity:0;transition:opacity 0.5s ease-out';
            [
                { style: 'top:0;left:0;right:0;height:10px;background:' + g + ';background-size:1200px 100%;background-repeat:repeat-x;animation:' + anim + ';box-shadow:' + glow },
                { style: 'top:0;right:0;bottom:0;width:10px;background:' + gv + ';background-size:100% 1200px;background-repeat:repeat-y;animation:' + animV + ';box-shadow:' + glow },
                { style: 'bottom:0;left:0;right:0;height:10px;background:' + g + ';background-size:1200px 100%;background-repeat:repeat-x;animation:' + animRev + ';box-shadow:' + glow },
                { style: 'top:0;left:0;bottom:0;width:10px;background:' + gv + ';background-size:100% 1200px;background-repeat:repeat-y;animation:' + animVRev + ';box-shadow:' + glow }
            ].forEach(function (item) {
                var d = document.createElement('div');
                d.style.cssText = 'position:absolute;pointer-events:none;' + item.style;
                el.appendChild(d);
            });
            (document.body || document.documentElement).appendChild(el);
        }
        if (_lightEffectHideTimer) { clearTimeout(_lightEffectHideTimer); _lightEffectHideTimer = null; }
        el.style.display = '';
        el.style.visibility = 'visible';
        el.style.opacity = '0';
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                el.style.opacity = '1';
            });
        });
    }

    /**
     * 隐藏桌面动态光效（淡出后隐藏）
     */
    function hideAssistantLightEffect() {
        if (typeof document === 'undefined') return;
        var el = document.getElementById(_LIGHT_EFFECT_ID);
        if (el) {
            if (_lightEffectHideTimer) { clearTimeout(_lightEffectHideTimer); }
            el.style.transition = 'opacity 0.4s ease-in';
            el.style.opacity = '0';
            _lightEffectHideTimer = setTimeout(function () {
                _lightEffectHideTimer = null;
                el.style.display = 'none';
            }, 420);
        }
    }

    /**
     * 设置屏幕亮度（70-100）
     * 通过 Display.setBrightness 内核 API 执行（在 kernel 上下文中读写 LStorage，避免 server 无法获取 PID 的权限问题）
     * @param {number} value 亮度值
     */
    function setBrightness(value) {
        var b = Math.max(70, Math.min(100, parseInt(value, 10) || 70));
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', 'ProcessManager.callKernelAPI 不可用，无法设置亮度');
            }
            return;
        }
        ProcessManager.callKernelAPI(_pid, 'Display.setBrightness', [b]).then(function () {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('server-aiassistant', '亮度已设置为: ' + b + '%');
            }
        }).catch(function (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '保存亮度失败: ' + (e && e.message));
            }
        });
    }

    /**
     * 从回复中提取最后一个特征符及其后的内容，作为最终处理数据（过滤思考过程误输出）
     * @param {string} response AI 原始回复
     * @returns {{ type: string, payload: string }|null} { type: 'P'|'S', payload } 或 null
     */
    function extractLastMarkerPayload(response) {
        if (!response || typeof response !== 'string') return null;
        var trimmed = response.trim();
        if (!trimmed) return null;

        var lastP = trimmed.lastIndexOf(MARKER_P);
        var lastS = trimmed.lastIndexOf(MARKER_S);
        if (lastP < 0 && lastS < 0) return null;

        if (lastP > lastS) {
            return { type: 'P', payload: trimmed.substring(lastP + MARKER_P.length).trim() };
        } else {
            return { type: 'S', payload: trimmed.substring(lastS + MARKER_S.length).trim() };
        }
    }

    /**
     * 解析并执行 AI 回复
     * 取最后一个 [P] 或 [S] 及其后内容作为最终输入
     * @param {string} response AI 原始回复
     */
    function parseAndExecuteAIResponse(response) {
        var extracted = extractLastMarkerPayload(response);
        if (!extracted) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '未匹配到特征符 [P] 或 [S]，原始回复: ' + (response || '').substring(0, 200));
            }
            return;
        }

        if (DEBUG) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('server-aiassistant', '[DEBUG] 提取到最终数据 type=' + extracted.type + ' payload=' + extracted.payload);
            }
            return;
        }

        if (extracted.type === 'P') {
            var parts = extracted.payload.split(/\s+/);
            var action = (parts[0] || '').toUpperCase();
            if (action === 'OPEN' && parts[1]) {
                var program = parts[1].toLowerCase();
                if (ALLOWED_PROGRAMS.indexOf(program) >= 0) {
                    if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.startProgram === 'function') {
                        ProcessManager.startProgram(program, {});
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '打开程序: ' + program);
                        }
                    } else {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', 'ProcessManager.startProgram 不可用');
                        }
                    }
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '不允许打开的程序: ' + program);
                    }
                }
            } else if (action === 'CLOSE' && parts[1]) {
                var programToClose = parts[1].toLowerCase();
                if (ALLOWED_PROGRAMS.indexOf(programToClose) >= 0) {
                    closeProgramByName(programToClose);
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '不允许关闭的程序: ' + programToClose);
                    }
                }
            } else if (action === 'SET' && parts[1] && parts[2] !== undefined) {
                var resource = parts[1].toLowerCase();
                var value = parseInt(parts[2], 10);
                if (resource === 'brightness') {
                    setBrightness(value);
                } else if (resource === 'volume') {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('server-aiassistant', 'P SET volume ' + value + ' (暂不支持)');
                    }
                }
            }
        } else if (extracted.type === 'S' && extracted.payload) {
            showAssistantBubble(extracted.payload);
            speakText(extracted.payload);
        }
    }

    /**
     * 防抖调度：将用户输入加入防抖队列，合并短时间内的多次识别结果
     * @param {string} text 语音识别得到的文本
     */
    function scheduleProcessUserSentence(text) {
        if (!text || !text.trim()) return;
        var t = text.trim();
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceInput = (!_debounceInput || t.length >= _debounceInput.length) ? t : _debounceInput;
        _debounceTimer = setTimeout(function () {
            _debounceTimer = null;
            var input = _debounceInput;
            _debounceInput = null;
            if (input) processUserSentence(input);
        }, _DEBOUNCE_MS);
    }

    /**
     * 处理用户语句：调用 AI → 解析回复 → 执行
     * 带请求锁：同一时刻仅一个 AI 请求，新输入会排队
     * @param {string} text 用户说的话
     */
    function processUserSentence(text) {
        if (!text || !text.trim()) return;
        var userInput = text.trim();

        if (_aiRequestInFlight) {
            _pendingUserInput = userInput;
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('server-aiassistant', 'AI 请求进行中，暂存输入: ' + userInput);
            }
            return;
        }

        _aiRequestInFlight = true;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-aiassistant', '用户输入: ' + userInput);
        }
        chatWithAI(userInput)
            .then(function (response) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('server-aiassistant', 'AI 回复: ' + response);
                }
                parseAndExecuteAIResponse(response);
            })
            .catch(function (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('server-aiassistant', 'AI 调用失败: ' + (e && e.message), e);
                }
                if (!DEBUG) {
                    showAssistantBubble('抱歉，请求失败，请稍后再试。');
                    speakText('抱歉，请求失败，请稍后再试。');
                }
            })
            .finally(function () {
                _aiRequestInFlight = false;
                if (_pendingUserInput) {
                    var next = _pendingUserInput;
                    _pendingUserInput = null;
                    processUserSentence(next);
                }
            });
    }

    /**
     * 创建语音识别会话并启动
     * @returns {Promise<void>}
     */
    function startSpeechRecognition() {
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', 'ProcessManager 不可用，无法启动语音识别');
            }
            return Promise.resolve();
        }

        return ProcessManager.callKernelAPI(_pid, 'Speech.isSupported')
            .then(function (supported) {
                if (!supported) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '浏览器不支持语音识别');
                    }
                    return;
                }
                return ProcessManager.callKernelAPI(_pid, 'Speech.createSession', [{
                    language: 'zh-CN',
                    continuous: true,
                    interimResults: true,
                    onResult: function (text, isFinal) {
                        if (!isFinal || !text || !text.trim()) return;
                        if (_speaking) return;

                        var t = text.trim();
                        if (_processingMode) {
                            if (isGoodbyeWord(t)) {
                                if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; _debounceInput = null; }
                                _processingMode = false;
                                hideAssistantLightEffect();
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.info('server-aiassistant', '用户说再见，退出处理模式');
                                }
                            } else {
                                scheduleProcessUserSentence(t);
                            }
                        } else {
                            if (isWakeWord(t)) {
                                _processingMode = true;
                                playWakeSound();
                                showAssistantLightEffect();
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.info('server-aiassistant', '识别到唤醒词，进入处理模式');
                                }
                            }
                        }
                    },
                    onError: function (err) {
                        if (typeof KernelLogger !== 'undefined') {
                            var msg = err && err.message ? String(err.message) : '';
                            if (msg.indexOf('未检测到语音') >= 0 || msg.indexOf('no-speech') >= 0) {
                                KernelLogger.debug('server-aiassistant', '未检测到语音（正常情况，用户未说话）');
                            } else {
                                KernelLogger.error('server-aiassistant', '语音识别错误: ' + msg);
                            }
                        }
                    }
                }]).then(function () {
                    _sessionCreated = true;
                    return ProcessManager.callKernelAPI(_pid, 'Speech.startRecognition');
                }).then(function () {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('server-aiassistant', '语音识别已启动，等待唤醒词');
                    }
                });
            })
            .catch(function (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('server-aiassistant', '启动语音识别失败: ' + (e && e.message), e);
                }
            });
    }

    /**
     * 停止语音识别会话
     * @returns {Promise<void>}
     */
    function stopSpeechRecognition() {
        if (!_sessionCreated || typeof ProcessManager === 'undefined') {
            return Promise.resolve();
        }
        _sessionCreated = false;
        _processingMode = false;
        _pendingUserInput = null;
        hideAssistantLightEffect();
        if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; _debounceInput = null; }
        return ProcessManager.callKernelAPI(_pid, 'Speech.stopSession')
            .then(function () {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('server-aiassistant', '语音识别已停止');
                }
            })
            .catch(function (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-aiassistant', '停止语音识别失败: ' + (e && e.message));
                }
            });
    }

    function __init__() {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-aiassistant', 'init');
        }
    }

    function __start__() {
        if (_running) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('server-aiassistant', '已在运行，跳过 start');
            }
            return;
        }
        if (!SPARK_APP_ID || !SPARK_API_PASSWORD) {
            var msg = 'AI 助手启动失败：未配置星火 App ID 或 API Password，请先在服务管理中配置或执行: service config aiassistant set sparkAppId=xxx sparkApiPassword=xxx';
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', msg);
            }
            throw new Error(msg);
        }
        _running = true;
        _processingMode = false;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-aiassistant', 'start - 开始监听唤醒词');
        }
        startSpeechRecognition();
        chatWithAI('').then(function () { }).catch(function (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '启动提示词发送失败: ' + (e && e.message));
            }
        });
    }

    function __stop__() {
        if (!_running) return;
        _running = false;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-aiassistant', 'stop');
        }
        chatWithAI(STOP_PROMPT, { prependStartPrompt: false }).then(function () { }).catch(function (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '停止提示词发送失败: ' + (e && e.message));
            }
        });
        stopSpeechRecognition();
    }

    function __status__() {
        return {
            running: _running,
            processingMode: _processingMode,
            sessionCreated: _sessionCreated
        };
    }

    function __info__() {
        return {
            name: 'AI 助手',
            version: '1.0.0',
            description: '语音唤醒式 AI 助手'
        };
    }

    function __list__() {
        return [
            { key: 'enableVoiceReply', label: '启用语音回复', type: 'boolean', value: ENABLE_VOICE_REPLY },
            { key: 'enableWakeSound', label: '启用唤醒音效', type: 'boolean', value: ENABLE_WAKE_SOUND },
            { key: 'wakeWords', label: '唤醒词（逗号分隔）', type: 'text', value: WAKE_WORDS.join(',') },
            { key: 'goodbyeWords', label: '结束词（逗号分隔）', type: 'text', value: GOODBYE_WORDS.join(',') },
            { key: 'debug', label: '调试模式', type: 'boolean', value: DEBUG },
            { key: 'sparkAppId', label: '星火 App ID', type: 'text', value: SPARK_APP_ID || '' },
            { key: 'sparkApiPassword', label: '星火 API Password', type: 'text', value: SPARK_API_PASSWORD || '' }
        ];
    }

    function __set__(config) {
        if (config.debug !== undefined) {
            DEBUG = !!config.debug;
        }
        if (config.enableVoiceReply !== undefined) {
            ENABLE_VOICE_REPLY = !!config.enableVoiceReply;
        }
        if (config.enableWakeSound !== undefined) {
            ENABLE_WAKE_SOUND = !!config.enableWakeSound;
        }
        if (typeof config.wakeWords === 'string') {
            WAKE_WORDS = config.wakeWords.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            if (WAKE_WORDS.length === 0) WAKE_WORDS = ['你好', '你好小A', '小A小A'];
        }
        if (typeof config.goodbyeWords === 'string') {
            GOODBYE_WORDS = config.goodbyeWords.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            if (GOODBYE_WORDS.length === 0) GOODBYE_WORDS = ['再见', '拜拜'];
        }
        if (typeof config.sparkAppId === 'string') {
            SPARK_APP_ID = config.sparkAppId;
        }
        if (typeof config.sparkApiPassword === 'string') {
            SPARK_API_PASSWORD = config.sparkApiPassword;
        }
        saveConfig(config);
    }

    var api = {
        __init__: __init__,
        __start__: __start__,
        __stop__: __stop__,
        __status__: __status__,
        __info__: __info__,
        __list__: __list__,
        __set__: __set__,
        speakText: speakText,
        chatWithAI: chatWithAI
    };

    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__(api);
    }
    if (typeof window !== 'undefined') {
        window.AIAssistant = { speakText: speakText, chatWithAI: chatWithAI };
    } else if (typeof globalThis !== 'undefined') {
        globalThis.AIAssistant = { speakText: speakText, chatWithAI: chatWithAI };
    }
})();
