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

    var _CONFIG_STORAGE_KEY = 'ZEROS_SERVER_AIA_CONFIG';

    /** 特征符：用于匹配最终输出，取最后一个匹配以过滤思考过程误输出 */
    var MARKER_P = '[P]';
    var MARKER_S = '[S]';

    /** 启动提示词：服务启动时发送给 AI，用于初始化上下文（返回数据被抛弃） */
    var START_PROMPT = `你是小A，ZerOS操作系统的语音助手，开发者是小萱baibai。回复必须以特征符 [P] 或 [S] 开头。

【输出格式】
- [S] 闲聊、问候、简短对话，或无法处理时的拒绝。格式：[S] 回复内容
- [P] 程序/系统操作，格式：[P] [操作] [参数]，无其他文字

【受支持的操作指令】

1. OPEN [程序] — 打开指定程序
   支持程序：about(关于本机), settings(设置), notepad(记事本), terminal(终端), filemanager(文件管理器), taskmanager(任务管理器), browser(浏览器), webviewer(网页查看), imageviewer(图片查看), audioplayer(音频), videoplayer(视频), musicplayer(音乐), minesweeper(扫雷), paint(画板), run(运行), zeroide(代码编辑器), servicemanager(服务管理), scheduletask(计划任务), sparkai(星火AI), timer(时间罗盘), themeanimator(主题管理)
   其他一律回复 [S] 抱歉，暂不支持该程序。

2. CLOSE [程序] — 关闭指定程序（可关闭与 OPEN 相同的程序）

3. MINIMIZE [程序] — 最小化指定程序

4. MAXIMIZE [程序] — 全屏/还原指定程序（切换全屏状态）
   用户说「全屏」「最大化」「放到最大」「铺满屏幕」「全屏显示」+程序名，均输出 [P] MAXIMIZE [程序]

5. SET [资源] [值] — 调整系统资源
   支持资源：brightness(屏幕亮度)，值为 70-100 的整数；language(系统语言)，值为 zh-CN(简体中文) 或 en(英文)；theme(系统主题)，值为 default(默认), deep-blue(深蓝), green(绿色), orange(橙色), red(红色), glass(玻璃)
   用户说「切换中文」「设为英文」「切换语言」等，输出 [P] SET language zh-CN 或 [P] SET language en
   用户说「切换主题」「改成深蓝主题」「改成绿色主题」「改成玻璃主题」等，输出 [P] SET theme [主题名]
   其他一律回复 [S] 抱歉，暂不支持该操作。

6. TIME — 查询当前时间并告知用户（格式：年月日 + 上午/下午 + 时分）
   用户说「几点了」「现在几点」「当前时间」「今天几号」等，输出 [P] TIME

7. WEATHER [城市] — 查询指定城市的天气（城市名为可选，不提供时查询当前位置）
   用户说「天气怎么样」「今天天气」「北京天气」「查询天气」等，输出 [P] WEATHER [城市] 或 [P] WEATHER
   示例：用户说「北京天气」→ [P] WEATHER 北京；用户说「天气怎么样」→ [P] WEATHER

8. SYSTEMINFO — 获取系统信息（系统版本、内核版本、构建日期、宿主环境等）
   用户说「系统信息」「系统版本」「关于系统」「查看系统信息」等，输出 [P] SYSTEMINFO

9. EXEC [命令] — 在终端中执行命令并返回结果（执行后自动关闭终端）
   用户说「执行命令」「运行命令」「查询磁盘分区」「查看磁盘信息」等，输出 [P] EXEC [命令]
   示例：用户说「我想知道系统的磁盘分区信息」→ [P] EXEC diskmanger；用户说「执行 ls 命令」→ [P] EXEC ls
   
   受支持的常用命令及用法：
   - diskmanger [-l] [disk] : 显示磁盘分区信息。可选 -l 显示详细文件和目录占用，可选指定磁盘（如 C: 或 D:）
   - ls [-l] [path] : 列出目录项。可选 -l 输出长格式，可选指定路径
   - tree [-L depth] [path] : 以树状结构显示目录。可选 -L 限制显示深度
   - cd <dir> : 切换目录，支持 .. 返回上级
   - pwd : 显示当前工作目录
   - cat <file> : 显示文件内容
   - whoami : 显示当前用户名
   - clear : 清空终端输出
   - check : 全面自检内核并给出详细的检查报告
   - help : 显示命令帮助信息
   
   当用户需要查询系统信息、磁盘信息、文件列表、目录结构等时，选择合适的命令执行。

10. READFILE [路径] — 读取文件内容
   用户说「读取文件」「查看文件内容」「打开文件」「显示文件」等，输出 [P] READFILE [路径]
   路径格式：盘符/路径/文件名（如 D:/Documents/test.txt）
   示例：用户说「读取 D 盘 Documents 目录下的 test.txt」→ [P] READFILE D:/Documents/test.txt

11. WRITEFILE [路径] [内容] — 写入文件（覆盖模式）
   用户说「写入文件」「保存文件」「创建文件并写入内容」等，输出 [P] WRITEFILE [路径] [内容]
   路径格式：盘符/路径/文件名；内容为要写入的文本
   示例：用户说「在 D 盘创建 test.txt 并写入 hello」→ [P] WRITEFILE D:/Documents/test.txt hello

12. APPENDFILE [路径] [内容] — 追加内容到文件
   用户说「追加内容」「在文件末尾添加」等，输出 [P] APPENDFILE [路径] [内容]
   示例：用户说「在 test.txt 末尾追加 world」→ [P] APPENDFILE D:/Documents/test.txt world

13. DELETEFILE [路径] — 删除文件或目录
   用户说「删除文件」「删除目录」「移除文件」等，输出 [P] DELETEFILE [路径]
   示例：用户说「删除 D 盘 Documents 目录下的 test.txt」→ [P] DELETEFILE D:/Documents/test.txt

14. CREATEDIR [路径] — 创建目录
   用户说「创建目录」「新建文件夹」「建立目录」等，输出 [P] CREATEDIR [路径]
   路径格式：盘符/路径/目录名（如 D:/Documents/NewFolder）
   示例：用户说「在 D 盘 Documents 目录下创建 NewFolder 文件夹」→ [P] CREATEDIR D:/Documents/NewFolder

15. NOTIFICATION_LIST — 查看通知列表
   用户说「查看通知」「通知列表」「有哪些通知」等，输出 [P] NOTIFICATION_LIST

16. NOTIFICATION_CLEAR — 清空所有通知
   用户说「清空通知」「清除通知」「删除所有通知」等，输出 [P] NOTIFICATION_CLEAR

17. DEBUG [参数] — 执行 debug 调试命令
   用户说「debug 服务」「调试服务」等，输出 [P] DEBUG [参数]
   示例：用户说「查看服务状态」→ [P] DEBUG services --status

18. KERNELCHECK — 执行内核自检
   用户说「内核自检」「系统自检」「检查系统」等，输出 [P] KERNELCHECK

【[S] 回复】问候、闲聊、笑话、日常对话可自由发挥；无法识别的请求统一回复：[S] 抱歉，我无法处理你的请求。
禁止：写诗、创作、长篇解释、科普。

【示例】
用户: 打开记事本 → [P] OPEN notepad
用户: 关闭记事本 → [P] CLOSE notepad
用户: 记事本全屏 → [P] MAXIMIZE notepad
用户: 亮度调到80 → [P] SET brightness 80
用户: 切换成中文 → [P] SET language zh-CN
用户: 改成深蓝主题 → [P] SET theme deep-blue
用户: 几点了 → [P] TIME
用户: 北京天气 → [P] WEATHER 北京
用户: 系统信息 → [P] SYSTEMINFO
用户: 查看磁盘信息 → [P] EXEC diskmanger
用户: 读取文件 → [P] READFILE D:/Documents/test.txt
用户: 创建文件并写入 → [P] WRITEFILE D:/Documents/test.txt hello
用户: 查看通知 → [P] NOTIFICATION_LIST
用户: 清空通知 → [P] NOTIFICATION_CLEAR
用户: 调试服务 → [P] DEBUG services --status
用户: 内核自检 → [P] KERNELCHECK`.trim();
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

    /** AI 模型选择：spark=讯飞星火，qwen-plus=阿里云通义千问（北京地域） */
    var AI_MODEL = 'spark';

    /** 讯飞星火 X2.0 API（通过后端代理转发；可通过 __list__/__set__ 配置） */
    var SPARK_API_PASSWORD = '';
    var SPARK_APP_ID = '';

    /** 阿里云 DashScope API Key（qwen-plus 使用，与星火相同方式保存与获取） */
    var DASHSCOPE_API_KEY = '';

    /** Qwen-Plus 对话历史：{ role: 'user'|'assistant', content }[]，用户说再见时清空 */
    var _conversationHistory = [];

    function loadConfig() {
        try {
            if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
                return;
            }
            ProcessManager.callKernelAPI(_pid, 'Environment.get', [_CONFIG_STORAGE_KEY])
                .then(function (raw) {
                    var cfg = null;
                    if (typeof raw === 'string' && raw.trim()) {
                        try { cfg = JSON.parse(raw); } catch (e) { cfg = null; }
                    }
                    if (!cfg || typeof cfg !== 'object') return;
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
                    if (cfg.aiModel === 'spark' || cfg.aiModel === 'qwen-plus') AI_MODEL = cfg.aiModel;
                    if (typeof cfg.dashscopeApiKey === 'string') DASHSCOPE_API_KEY = cfg.dashscopeApiKey;
                })
                .catch(function (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '加载环境配置失败: ' + (e && e.message));
                    }
                });
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '加载配置异常: ' + (e && e.message));
            }
        }
    }

    function saveConfig(cfg) {
        try {
            if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') return;
            ProcessManager.callKernelAPI(_pid, 'Environment.get', [_CONFIG_STORAGE_KEY])
                .then(function (raw) {
                    var existing = null;
                    if (typeof raw === 'string' && raw.trim()) {
                        try { existing = JSON.parse(raw); } catch (e) { existing = null; }
                    }
                    var merged = {};
                    if (existing && typeof existing === 'object') {
                        for (var k in existing) {
                            if (Object.prototype.hasOwnProperty.call(existing, k)) merged[k] = existing[k];
                        }
                    }
                    for (var k2 in cfg) {
                        if (Object.prototype.hasOwnProperty.call(cfg, k2)) merged[k2] = cfg[k2];
                    }
                    var toWrite = JSON.stringify(merged);
                    return ProcessManager.callKernelAPI(_pid, 'Environment.set', [_CONFIG_STORAGE_KEY, toWrite]);
                })
                .catch(function (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '保存环境配置失败: ' + (e && e.message));
                    }
                });
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '保存配置异常: ' + (e && e.message));
            }
        }
    }

    loadConfig();

    /** 清空 Qwen-Plus 对话历史（用户说再见或服务停止时调用） */
    function clearConversationHistory() {
        _conversationHistory = [];
    }

    /** 获取 AI 代理 URL（由代理负责鉴权，前端不携带 Authorization） */
    function getSparkAIProxyUrl() {
        if (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrl) {
            return SystemInformation.buildServiceUrl(SystemInformation.SERVICE_NAMES.SPARK_AI_PROXY);
        }
        const base = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' && window.location ? window.location.origin : '');
        const path = (typeof SystemInformation !== 'undefined' && SystemInformation.getServicePath) ? SystemInformation.getServicePath(SystemInformation.SERVICE_NAMES.SPARK_AI_PROXY) : '/system/service/spark-ai-proxy.php';
        return base ? new URL(path, base).toString() : path;
    }

    /** 获取阿里云 DashScope 代理 URL（由代理转发至北京地域，绕过 CORS） */
    function getDashscopeAIProxyUrl() {
        var proxyUrl;
        if (typeof SystemInformation !== 'undefined' && SystemInformation.SERVICE_NAMES && SystemInformation.SERVICE_NAMES.DASHSCOPE_AI_PROXY && SystemInformation.buildServiceUrl) {
            try {
                proxyUrl = SystemInformation.buildServiceUrl(SystemInformation.SERVICE_NAMES.DASHSCOPE_AI_PROXY);
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('server-aiassistant', 'DashScope 代理 URL (buildServiceUrl): ' + proxyUrl);
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.debug('server-aiassistant', 'buildServiceUrl 失败，使用回退路径: ' + (e && e.message));
                }
                proxyUrl = null;
            }
        }
        if (!proxyUrl) {
            const base = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' && window.location ? window.location.origin : '');
            const path = (typeof SystemInformation !== 'undefined' && SystemInformation.getServicePath) ? SystemInformation.getServicePath(SystemInformation.SERVICE_NAMES.DASHSCOPE_AI_PROXY) : '/system/service/dashscope-ai-proxy.php';
            proxyUrl = base ? new URL(path, base).toString() : path;
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('server-aiassistant', 'DashScope 代理 URL (回退): ' + proxyUrl);
            }
        }
        return proxyUrl;
    }

    /**
     * 讯飞星火：每次请求拼接启动提示词，无上下文
     * @param {string} text 用户输入
     * @param {Object} opts prependStartPrompt
     * @returns {Promise<string>}
     */
    function chatWithSpark(text, opts) {
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
     * 阿里云 Qwen-Plus：首次发送核心提示词，之后仅历史+用户输入，支持多轮对话
     * @param {string} text 用户输入
     * @param {Object} opts prependStartPrompt：false 时表示停止/再见，不发请求，清空历史
     * @returns {Promise<string>}
     */
    function chatWithQwenPlus(text, opts) {
        if (opts && opts.prependStartPrompt === false) {
            clearConversationHistory();
            return Promise.resolve('');
        }
        var userInput = typeof text === 'string' ? text.trim() : '';
        if (!userInput) {
            return Promise.resolve('');
        }
        var messages = [];
        if (_conversationHistory.length === 0) {
            messages.push({ role: 'system', content: START_PROMPT });
        } else {
            messages.push({ role: 'system', content: START_PROMPT });
            for (var i = 0; i < _conversationHistory.length; i++) {
                messages.push(_conversationHistory[i]);
            }
        }
        messages.push({ role: 'user', content: userInput });
        var apikey = DASHSCOPE_API_KEY || '';
        if (!apikey) {
            return Promise.reject(new Error('未配置 DashScope API Key'));
        }
        // 使用兼容 OpenAI 格式的请求体（更简单，无需 input/parameters 包装）
        var payload = {
            model: 'qwen-plus',
            messages: messages,
            _auth: { apiKey: apikey }
        };
        var proxyUrl = getDashscopeAIProxyUrl();
        return fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (response) {
                if (!response.ok) {
                    return response.json().then(function (errorData) {
                        var errMsg = (errorData && errorData.message) ? errorData.message : ('HTTP ' + response.status + ': ' + response.statusText);
                        if (errorData && errorData.code) {
                            errMsg = errorData.code + ': ' + errMsg;
                        }
                        throw new Error(errMsg);
                    }).catch(function () {
                        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                    });
                }
                return response.json();
            })
            .then(function (result) {
                if (!result) {
                    throw new Error('Qwen-Plus 响应为空');
                }
                // 兼容模式端点可能返回错误对象
                if (result.error) {
                    var errMsg = result.error.message || result.error.code || 'API 错误';
                    if (result.error.code) {
                        errMsg = result.error.code + ': ' + errMsg;
                    }
                    throw new Error(errMsg);
                }
                // 兼容 OpenAI 格式的响应：result.choices[0].message.content
                var content = null;
                if (result.choices && result.choices[0] && result.choices[0].message) {
                    content = result.choices[0].message.content;
                } else if (result.output) {
                    // 兼容原生 DashScope 格式
                    if (result.output.choices && result.output.choices[0] && result.output.choices[0].message) {
                        content = result.output.choices[0].message.content;
                    } else if (result.output.text) {
                        content = result.output.text;
                    }
                }
                if (!content) {
                    var errMsg = (result.error && result.error.message) ? result.error.message : 'Qwen-Plus 响应格式错误：缺少 choices[0].message.content';
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', 'Qwen-Plus 响应解析失败，原始响应: ' + JSON.stringify(result).substring(0, 500));
                    }
                    throw new Error(errMsg);
                }
                _conversationHistory.push({ role: 'user', content: userInput });
                _conversationHistory.push({ role: 'assistant', content: content });
                return content;
            });
    }

    /**
     * AI 交互：按配置的 AI_MODEL 路由到对应实现
     * @param {string} text 用户输入
     * @param {Object} [opts] prependStartPrompt：是否拼接启动提示词（qwen-plus 在 prepend=false 时仅清空历史）
     * @returns {Promise<string>} AI 回复内容
     */
    function chatWithAI(text, opts) {
        if (AI_MODEL === 'qwen-plus') {
            return chatWithQwenPlus(text, opts);
        }
        return chatWithSpark(text, opts);
    }

    /**
     * 优化命令输出：将命令的原始输出转换为人类可读的格式
     * @param {string} command 执行的命令
     * @param {string} output 命令的原始输出
     * @returns {Promise<string>} 优化后的输出
     */
    function optimizeCommandOutput(command, output) {
        if (!output || !output.trim()) {
            return Promise.resolve('命令执行完成，但无输出');
        }
        // 使用特殊的优化提示词，告诉 AI 只需要优化输出并返回 [S] 格式
        var optimizePrompt = '你是一个命令输出优化助手。用户执行了一个终端命令，现在需要你将命令的原始输出优化为人类可读的格式。\n\n' +
            '要求：\n' +
            '1. 分析命令输出的内容，提取关键信息\n' +
            '2. 用自然、友好的语言重新组织输出\n' +
            '3. 如果输出包含错误信息，请明确指出问题\n' +
            '4. 如果输出是列表或表格，请用更清晰的方式呈现\n' +
            '5. 只返回优化后的文本，使用 [S] 格式：\n' +
            '   格式：[S] [优化后的文本]\n' +
            '6. 不要执行任何命令，不要输出 [P] 格式的指令\n\n' +
            '执行的命令：' + command + '\n\n' +
            '命令的原始输出：\n' + output + '\n\n' +
            '请优化上述输出：';
        
        // 调用 AI，但不使用 START_PROMPT（避免触发其他指令）
        if (AI_MODEL === 'qwen-plus') {
            // 对于 Qwen-Plus，直接调用 API，不修改历史记录
            var apikey = DASHSCOPE_API_KEY || '';
            if (!apikey) {
                return Promise.resolve(output); // 如果没有 API Key，返回原始输出
            }
            // 将优化提示词拆分为 system message 和 user message
            var systemPrompt = '你是一个命令输出优化助手。用户执行了一个终端命令，现在需要你将命令的原始输出优化为人类可读的格式。\n\n' +
                '要求：\n' +
                '1. 分析命令输出的内容，提取关键信息\n' +
                '2. 用自然、友好的语言重新组织输出\n' +
                '3. 如果输出包含错误信息，请明确指出问题\n' +
                '4. 如果输出是列表或表格，请用更清晰的方式呈现\n' +
                '5. 只返回优化后的文本，使用 [S] 格式：\n' +
                '   格式：[S] [优化后的文本]\n' +
                '6. 不要执行任何命令，不要输出 [P] 格式的指令';
            var userPrompt = '执行的命令：' + command + '\n\n' +
                '命令的原始输出：\n' + output + '\n\n' +
                '请优化上述输出：';
            var messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];
            var payload = {
                model: 'qwen-plus',
                messages: messages,
                _auth: { apiKey: apikey }
            };
            var proxyUrl = getDashscopeAIProxyUrl();
            return fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
                .then(function (response) {
                    if (!response.ok) {
                        return response.json().then(function (errorData) {
                            var errMsg = (errorData && errorData.message) ? errorData.message : ('HTTP ' + response.status + ': ' + response.statusText);
                            if (errorData && errorData.code) {
                                errMsg = errorData.code + ': ' + errMsg;
                            }
                            throw new Error(errMsg);
                        }).catch(function () {
                            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                        });
                    }
                    return response.json();
                })
                .then(function (result) {
                    if (!result) {
                        throw new Error('Qwen-Plus 响应为空');
                    }
                    if (result.error) {
                        var errMsg = result.error.message || result.error.code || 'API 错误';
                        if (result.error.code) {
                            errMsg = result.error.code + ': ' + errMsg;
                        }
                        throw new Error(errMsg);
                    }
                    var content = null;
                    if (result.choices && result.choices[0] && result.choices[0].message) {
                        content = result.choices[0].message.content;
                    } else if (result.output) {
                        if (result.output.choices && result.output.choices[0] && result.output.choices[0].message) {
                            content = result.output.choices[0].message.content;
                        } else if (result.output.text) {
                            content = result.output.text;
                        }
                    }
                    if (!content) {
                        throw new Error('Qwen-Plus 响应格式错误：缺少 choices[0].message.content');
                    }
                    // 提取 [S] 格式的内容
                    var match = content.match(/^\[S\]\s*(.+)$/s);
                    if (match) {
                        return match[1].trim();
                    }
                    var sMatch = content.match(/\[S\](.+?)(?:\[P\]|$)/s);
                    if (sMatch) {
                        return sMatch[1].trim();
                    }
                    return content.trim() || output;
                })
                .catch(function (e) {
                    // 如果优化失败，返回原始输出
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '优化命令输出失败: ' + (e && e.message ? e.message : '未知错误'));
                    }
                    return output;
                });
        } else {
            // 对于 Spark，使用 prependStartPrompt: false 来避免使用 START_PROMPT
            return chatWithSpark(optimizePrompt, { prependStartPrompt: false })
                .then(function (response) {
                    // 如果返回的是 [S] 格式，提取内容；否则直接返回
                    var match = response.match(/^\[S\]\s*(.+)$/s);
                    if (match) {
                        return match[1].trim();
                    }
                    // 如果没有 [S] 格式，尝试提取纯文本
                    var sMatch = response.match(/\[S\](.+?)(?:\[P\]|$)/s);
                    if (sMatch) {
                        return sMatch[1].trim();
                    }
                    return response.trim() || output;
                })
                .catch(function (e) {
                    // 如果优化失败，返回原始输出
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '优化命令输出失败: ' + (e && e.message ? e.message : '未知错误'));
                    }
                    return output;
                });
        }
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
     * 按程序名获取第一个运行中实例的 PID
     * @param {string} programName 程序名（如 'notepad'）
     * @returns {number|null}
     */
    function getPidByProgramName(programName) {
        if (typeof ProcessManager === 'undefined') return null;
        try {
            var processes = ProcessManager.listProcesses && ProcessManager.listProcesses();
            if (!processes || !Array.isArray(processes)) return null;
            var name = (programName || '').toLowerCase();
            for (var i = 0; i < processes.length; i++) {
                var p = processes[i];
                if (p && p.programName && p.programName.toLowerCase() === name && p.status === 'running' && p.pid) {
                    return p.pid;
                }
            }
        } catch (e) {}
        return null;
    }

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

    /**
     * 按程序名最小化第一个运行中的实例
     * @param {string} programName 程序名（如 'notepad'）
     */
    function minimizeProgramByName(programName) {
        var pid = getPidByProgramName(programName);
        if (!pid) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('server-aiassistant', '未找到运行中的程序: ' + programName);
            }
            return;
        }
        if (typeof TaskbarManager !== 'undefined' && typeof TaskbarManager._minimizeProgram === 'function') {
            TaskbarManager._minimizeProgram(pid);
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('server-aiassistant', '最小化程序: ' + programName);
            }
        } else if (typeof GUIManager !== 'undefined' && typeof GUIManager.minimizeWindow === 'function') {
            GUIManager.minimizeWindow(pid);
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('server-aiassistant', '最小化程序: ' + programName);
            }
        }
    }

    /**
     * 按程序名切换全屏/还原第一个运行中的实例
     * @param {string} programName 程序名（如 'notepad'）
     */
    function maximizeProgramByName(programName) {
        var pid = getPidByProgramName(programName);
        if (!pid) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('server-aiassistant', '未找到运行中的程序: ' + programName);
            }
            return;
        }
        if (typeof GUIManager !== 'undefined' && typeof GUIManager.toggleMaximize === 'function') {
            GUIManager.toggleMaximize(pid);
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('server-aiassistant', '切换全屏: ' + programName);
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
                style.textContent = '@keyframes aiAssistantMarquee{to{background-position:1200px 0}}@keyframes aiAssistantMarqueeV{to{background-position:0 1200px}}@keyframes aiAssistantWaveRing{0%{opacity:0;transform:scale(0.3);border-width:3px}25%{opacity:0.78}100%{opacity:0;transform:scale(1.12);border-width:1px}}';
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
            var maskWrap = document.createElement('div');
            maskWrap.setAttribute('data-ai-mask', '1');
            maskWrap.style.cssText = 'position:absolute;top:50%;left:50%;width:0;height:0;pointer-events:none';
            var waveDelays = [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72];
            for (var w = 0; w < waveDelays.length; w++) {
                var ring = document.createElement('div');
                ring.className = 'ai-wave-ring';
                ring.style.cssText = 'position:absolute;top:50%;left:50%;width:200vmax;height:200vmax;margin-left:-100vmax;margin-top:-100vmax;border-radius:50%;border:2px solid rgba(60,140,180,0.55);box-shadow:0 0 32px 2px rgba(0,140,180,0.22);animation:aiAssistantWaveRing 1.4s cubic-bezier(0.25,0.46,0.45,0.94) forwards;animation-delay:' + waveDelays[w] + 's';
                maskWrap.appendChild(ring);
            }
            el.appendChild(maskWrap);
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
        var maskWrap = el.querySelector('[data-ai-mask]');
        if (maskWrap) {
            var rings = maskWrap.querySelectorAll('.ai-wave-ring');
            var waveDelays = [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72];
            for (var r = 0; r < rings.length; r++) {
                rings[r].style.animation = 'none';
            }
            maskWrap.offsetHeight;
            for (var r = 0; r < rings.length; r++) {
                rings[r].style.animation = 'aiAssistantWaveRing 1.4s cubic-bezier(0.25,0.46,0.45,0.94) forwards';
                rings[r].style.animationDelay = (waveDelays[r] || 0) + 's';
            }
        }
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
     * 获取当前时间并格式化为可读字符串（按系统语言）
     * 格式：中文「2025年2月10日 下午3点45分」；英文「3:45 PM, February 10, 2025」
     * @returns {string}
     */
    function getFormattedTime() {
        var d = new Date();
        var locale = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'zh-CN';
        if (locale.startsWith('zh')) {
            var h = d.getHours();
            var m = d.getMinutes();
            var period = h < 12 ? '上午' : '下午';
            var h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
            return '现在是' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + period + h12 + '点' + (m < 10 ? '0' : '') + m + '分';
        } else {
            return "It's " + d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }) + ', ' + d.toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' });
        }
    }

    /**
     * 查询天气信息（使用 Uapi uapis.cn API，与任务栏天气组件一致）
     * @param {string} [city] 城市名（可选，不提供时尝试获取当前位置或使用默认城市）
     * @returns {Promise<string>} 天气信息文本
     */
    function getWeather(city) {
        return new Promise(function (resolve, reject) {
            var cityName = (city && typeof city === 'string') ? city.trim() : '';
            var locale = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'zh-CN';
            var isZh = locale.startsWith('zh');
            
            // 如果没有提供城市名，尝试通过内核 API 获取当前位置（与任务栏一致）
            if (!cityName) {
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                    ProcessManager.callKernelAPI(_pid, 'Geography.getCurrentPosition', [{ enableHighAccuracy: false, timeout: 10000 }])
                        .then(function (loc) {
                            if (loc && loc.name && typeof loc.name === 'string' && loc.name.trim()) {
                                cityName = loc.name.trim();
                            } else {
                                cityName = '北京'; // 默认城市
                            }
                            fetchWeatherData(cityName);
                        })
                        .catch(function (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug('server-aiassistant', '获取定位城市失败，使用默认城市: ' + (e && e.message ? e.message : '未知错误'));
                            }
                            cityName = '北京'; // 默认城市
                            fetchWeatherData(cityName);
                        });
                } else {
                    cityName = '北京'; // 默认城市
                    fetchWeatherData(cityName);
                }
            } else {
                fetchWeatherData(cityName);
            }
            
            function fetchWeatherData(requestCity) {
                // 使用 Uapi (uapis.cn) 天气 API，与任务栏组件一致
                var weatherUrl = 'https://uapis.cn/api/v1/misc/weather?city=' + encodeURIComponent(requestCity) + '&extended=true&indices=true&forecast=true';
                
                fetch(weatherUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                })
                    .then(function (response) {
                        if (!response.ok) {
                            throw new Error('HTTP ' + response.status);
                        }
                        return response.json();
                    })
                    .then(function (data) {
                        if (!data || typeof data !== 'object') {
                            throw new Error('天气数据格式错误');
                        }
                        
                        // 解析 Uapi 响应格式
                        var cityDisplay = data.city ? (data.province ? data.province + ' ' + data.city : data.city) : requestCity;
                        var temp = data.temperature != null ? data.temperature : 'N/A';
                        var desc = data.weather || '未知';
                        var humidity = data.humidity != null ? data.humidity : 'N/A';
                        var windPower = data.wind_power || 'N/A';
                        var windDirection = data.wind_direction || '';
                        
                        var weatherText = isZh
                            ? (cityDisplay + '：' + desc + '，温度 ' + temp + '°C，湿度 ' + humidity + '%' + (windPower !== 'N/A' ? '，风力 ' + windPower + (windDirection ? ' ' + windDirection : '') : ''))
                            : (cityDisplay + ': ' + desc + ', ' + temp + '°C, Humidity ' + humidity + '%' + (windPower !== 'N/A' ? ', Wind ' + windPower + (windDirection ? ' ' + windDirection : '') : ''));
                        
                        resolve(weatherText);
                    })
                    .catch(function (e) {
                        var errorMsg = isZh
                            ? ('查询天气失败：' + (e && e.message ? e.message : '网络错误'))
                            : ('Weather query failed: ' + (e && e.message ? e.message : 'Network error'));
                        reject(new Error(errorMsg));
                    });
            }
        });
    }

    /**
     * 获取系统信息
     * @returns {string} 系统信息文本
     */
    function getSystemInfo() {
        var locale = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'zh-CN';
        var isZh = locale.startsWith('zh');
        
        try {
            var sysInfo = null;
            var hostEnv = null;
            
            if (typeof SystemInformation !== 'undefined') {
                if (typeof SystemInformation.getSystemInfo === 'function') {
                    sysInfo = SystemInformation.getSystemInfo();
                }
                if (typeof SystemInformation.getHostEnvironment === 'function') {
                    hostEnv = SystemInformation.getHostEnvironment();
                }
            }
            
            if (!sysInfo) {
                return isZh ? '无法获取系统信息' : 'Unable to get system information';
            }
            
            var infoText = '';
            if (isZh) {
                infoText = '系统信息：\n';
                infoText += '系统名称：' + (sysInfo.systemName || '未知') + '\n';
                infoText += '系统版本：' + (sysInfo.systemVersion || '未知') + '\n';
                infoText += '内核版本：' + (sysInfo.kernelVersion || '未知') + '\n';
                if (sysInfo.buildDate) {
                    infoText += '构建日期：' + sysInfo.buildDate + '\n';
                }
                if (sysInfo.description) {
                    infoText += '系统描述：' + sysInfo.description + '\n';
                }
                if (hostEnv) {
                    infoText += '\n宿主环境：\n';
                    infoText += '浏览器：' + (hostEnv.browser || '未知') + ' ' + (hostEnv.browserVersion || '') + '\n';
                    infoText += '平台：' + (hostEnv.platform || '未知') + '\n';
                    if (hostEnv.screenWidth && hostEnv.screenHeight) {
                        infoText += '屏幕分辨率：' + hostEnv.screenWidth + ' × ' + hostEnv.screenHeight + '\n';
                    }
                    if (hostEnv.hardwareConcurrency) {
                        infoText += 'CPU核心数：' + hostEnv.hardwareConcurrency + '\n';
                    }
                    if (hostEnv.deviceMemory) {
                        infoText += '设备内存：' + hostEnv.deviceMemory + ' GB\n';
                    }
                }
            } else {
                infoText = 'System Information:\n';
                infoText += 'System Name: ' + (sysInfo.systemName || 'Unknown') + '\n';
                infoText += 'System Version: ' + (sysInfo.systemVersion || 'Unknown') + '\n';
                infoText += 'Kernel Version: ' + (sysInfo.kernelVersion || 'Unknown') + '\n';
                if (sysInfo.buildDate) {
                    infoText += 'Build Date: ' + sysInfo.buildDate + '\n';
                }
                if (sysInfo.description) {
                    infoText += 'Description: ' + sysInfo.description + '\n';
                }
                if (hostEnv) {
                    infoText += '\nHost Environment:\n';
                    infoText += 'Browser: ' + (hostEnv.browser || 'Unknown') + ' ' + (hostEnv.browserVersion || '') + '\n';
                    infoText += 'Platform: ' + (hostEnv.platform || 'Unknown') + '\n';
                    if (hostEnv.screenWidth && hostEnv.screenHeight) {
                        infoText += 'Screen Resolution: ' + hostEnv.screenWidth + ' × ' + hostEnv.screenHeight + '\n';
                    }
                    if (hostEnv.hardwareConcurrency) {
                        infoText += 'CPU Cores: ' + hostEnv.hardwareConcurrency + '\n';
                    }
                    if (hostEnv.deviceMemory) {
                        infoText += 'Device Memory: ' + hostEnv.deviceMemory + ' GB\n';
                    }
                }
            }
            
            return infoText.trim();
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '获取系统信息失败: ' + (e && e.message));
            }
            return isZh ? '获取系统信息失败' : 'Failed to get system information';
        }
    }

    /**
     * 在终端中执行命令并获取输出
     * @param {string} command 要执行的命令
     * @returns {Promise<string>} 命令输出文本
     */
    function executeTerminalCommand(command) {
        return new Promise(function (resolve, reject) {
            if (!command || typeof command !== 'string' || !command.trim()) {
                reject(new Error('命令不能为空'));
                return;
            }
            var cmd = command.trim();
            var locale = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'zh-CN';
            var isZh = locale.startsWith('zh');
            
            // 1. 打开终端（如果未打开）
            var terminalPid = null;
            var terminalInstance = null;
            var terminalClosed = false;
            
            function findOrOpenTerminal() {
                return new Promise(function (resolveFind, rejectFind) {
                    // 先查找已存在的终端实例
                    if (typeof TERMINAL !== 'undefined' && TERMINAL._instances && TERMINAL._instances.size > 0) {
                        var instances = Array.from(TERMINAL._instances.values());
                        var instance = instances[0];
                        if (instance && instance.tabManager) {
                            var activeTerminal = instance.tabManager.getActiveTerminal();
                            if (activeTerminal) {
                                terminalPid = instance.pid;
                                terminalInstance = activeTerminal;
                                resolveFind();
                                return;
                            }
                        }
                    }
                    
                    // 如果没有终端，打开一个新的
                    if (typeof ProcessManager === 'undefined' || typeof ProcessManager.startProgram !== 'function') {
                        rejectFind(new Error('ProcessManager 不可用'));
                        return;
                    }
                    
                    ProcessManager.startProgram('terminal', {})
                        .then(function (pid) {
                            terminalPid = pid;
                            // 等待终端初始化
                            setTimeout(function () {
                                if (typeof TERMINAL !== 'undefined' && TERMINAL._instances && TERMINAL._instances.has(pid)) {
                                    var instance = TERMINAL._instances.get(pid);
                                    if (instance && instance.tabManager) {
                                        var activeTerminal = instance.tabManager.getActiveTerminal();
                                        if (activeTerminal) {
                                            terminalInstance = activeTerminal;
                                            resolveFind();
                                        } else {
                                            rejectFind(new Error('无法获取终端实例'));
                                        }
                                    } else {
                                        rejectFind(new Error('终端实例无效'));
                                    }
                                } else {
                                    rejectFind(new Error('终端未初始化'));
                                }
                            }, 500);
                        })
                        .catch(function (e) {
                            rejectFind(e);
                        });
                });
            }
            
            function executeCommand() {
                return new Promise(function (resolveExec, rejectExec) {
                    if (!terminalInstance) {
                        rejectExec(new Error('终端实例不可用'));
                        return;
                    }
                    
                    // 记录执行前的输出内容长度（用于提取新增输出）
                    var outputEl = terminalInstance.outputEl;
                    var initialOutputLength = outputEl ? outputEl.children.length : 0;
                    var outputStartTime = Date.now();
                    var maxWaitTime = 15000; // 最多等待15秒
                    
                    // 执行命令
                    try {
                        // 确保终端处于活动状态
                        if (!terminalInstance.isActive && terminalInstance.terminalElement) {
                            terminalInstance._setActive(true);
                        }
                        
                        // 使用 executeCommand API（如果可用）
                        if (typeof TERMINAL !== 'undefined' && TERMINAL._instances && TERMINAL._instances.has(terminalPid)) {
                            var instance = TERMINAL._instances.get(terminalPid);
                            if (instance && instance.api && typeof instance.api.executeCommand === 'function') {
                                instance.api.executeCommand(cmd);
                            } else if (typeof terminalInstance._handleInput === 'function') {
                                terminalInstance._handleInput(cmd);
                            } else if (terminalInstance.cmdEl) {
                                terminalInstance.cmdEl.textContent = cmd;
                                var enterEvent = new KeyboardEvent('keydown', {
                                    key: 'Enter',
                                    code: 'Enter',
                                    keyCode: 13,
                                    which: 13,
                                    bubbles: true,
                                    cancelable: true
                                });
                                terminalInstance.cmdEl.dispatchEvent(enterEvent);
                            } else {
                                rejectExec(new Error('无法执行命令：终端接口不可用'));
                                return;
                            }
                        } else {
                            rejectExec(new Error('无法执行命令：终端实例未找到'));
                            return;
                        }
                        
                        // 等待命令执行完成（通过轮询 busy 状态和输出变化）
                        var checkInterval = setInterval(function () {
                            var isBusy = terminalInstance.busy === true;
                            var currentOutputLength = outputEl ? outputEl.children.length : 0;
                            var hasNewOutput = currentOutputLength > initialOutputLength;
                            
                            // 命令完成条件：不忙且有新输出，或者超时
                            if (!isBusy && hasNewOutput) {
                                clearInterval(checkInterval);
                                
                                // 等待一小段时间确保所有输出都已写入
                                setTimeout(function () {
                                    // 提取新增的输出行
                                    var outputLines = [];
                                    if (outputEl && outputEl.children) {
                                        for (var i = initialOutputLength; i < outputEl.children.length; i++) {
                                            var lineEl = outputEl.children[i];
                                            var text = lineEl.textContent || lineEl.innerText || '';
                                            if (text && text.trim()) {
                                                outputLines.push(text.trim());
                                            }
                                        }
                                    }
                                    
                                    var outputText = outputLines.length > 0 
                                        ? outputLines.join('\n') 
                                        : (isZh ? '命令执行完成，但无输出' : 'Command executed but no output');
                                    resolveExec(outputText);
                                }, 500);
                            } else if (Date.now() - outputStartTime > maxWaitTime) {
                                clearInterval(checkInterval);
                                
                                // 超时，尝试提取已有输出
                                var outputLines = [];
                                if (outputEl && outputEl.children) {
                                    for (var i = initialOutputLength; i < outputEl.children.length; i++) {
                                        var lineEl = outputEl.children[i];
                                        var text = lineEl.textContent || lineEl.innerText || '';
                                        if (text && text.trim()) {
                                            outputLines.push(text.trim());
                                        }
                                    }
                                }
                                
                                var timeoutOutput = outputLines.length > 0 
                                    ? outputLines.join('\n') + '\n' + (isZh ? '(执行超时)' : '(Timeout)')
                                    : (isZh ? '命令执行超时' : 'Command timeout');
                                resolveExec(timeoutOutput);
                            }
                        }, 200);
                    } catch (e) {
                        rejectExec(e);
                    }
                });
            }
            
            function closeTerminal() {
                if (terminalPid && typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function' && !terminalClosed) {
                    terminalClosed = true;
                    ProcessManager.killProgram(terminalPid, true).catch(function (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.debug('server-aiassistant', '关闭终端失败: ' + (e && e.message));
                        }
                    });
                }
            }
            
            // 执行流程
            findOrOpenTerminal()
                .then(function () {
                    return executeCommand();
                })
                .then(function (output) {
                    closeTerminal();
                    resolve(output);
                })
                .catch(function (e) {
                    closeTerminal();
                    var errorMsg = isZh
                        ? ('执行命令失败：' + (e && e.message ? e.message : '未知错误'))
                        : ('Command execution failed: ' + (e && e.message ? e.message : 'Unknown error'));
                    reject(new Error(errorMsg));
                });
        });
    }

    /**
     * 读取文件内容
     * @param {string} filePath 文件路径（格式：盘符/路径/文件名，如 D:/Documents/test.txt）
     * @returns {Promise<string>} 文件内容
     */
    function readFile(filePath) {
        if (!filePath || typeof filePath !== 'string') {
            return Promise.reject(new Error('文件路径不能为空'));
        }
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            return Promise.reject(new Error('ProcessManager.callKernelAPI 不可用'));
        }
        return ProcessManager.callKernelAPI(_pid, 'FileSystem.read', [filePath])
            .then(function (content) {
                if (typeof content !== 'string') {
                    return String(content || '');
                }
                return content;
            });
    }

    /**
     * 写入文件（覆盖模式）
     * @param {string} filePath 文件路径（格式：盘符/路径/文件名）
     * @param {string} content 文件内容
     * @returns {Promise<void>}
     */
    function writeFile(filePath, content) {
        if (!filePath || typeof filePath !== 'string') {
            return Promise.reject(new Error('文件路径不能为空'));
        }
        if (content === undefined || content === null) {
            return Promise.reject(new Error('文件内容不能为空'));
        }
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            return Promise.reject(new Error('ProcessManager.callKernelAPI 不可用'));
        }
        return ProcessManager.callKernelAPI(_pid, 'FileSystem.write', [filePath, String(content), 'OVERWRITE']);
    }

    /**
     * 追加内容到文件
     * @param {string} filePath 文件路径（格式：盘符/路径/文件名）
     * @param {string} content 要追加的内容
     * @returns {Promise<void>}
     */
    function appendFile(filePath, content) {
        if (!filePath || typeof filePath !== 'string') {
            return Promise.reject(new Error('文件路径不能为空'));
        }
        if (content === undefined || content === null) {
            return Promise.reject(new Error('文件内容不能为空'));
        }
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            return Promise.reject(new Error('ProcessManager.callKernelAPI 不可用'));
        }
        return ProcessManager.callKernelAPI(_pid, 'FileSystem.write', [filePath, String(content), 'APPEND']);
    }

    /**
     * 删除文件或目录
     * @param {string} path 文件或目录路径（格式：盘符/路径/文件名 或 盘符/路径/目录名）
     * @returns {Promise<void>}
     */
    function deleteFile(path) {
        if (!path || typeof path !== 'string') {
            return Promise.reject(new Error('路径不能为空'));
        }
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            return Promise.reject(new Error('ProcessManager.callKernelAPI 不可用'));
        }
        return ProcessManager.callKernelAPI(_pid, 'FileSystem.delete', [path]);
    }

    /**
     * 创建目录
     * @param {string} dirPath 目录路径（格式：盘符/路径/目录名，如 D:/Documents/NewFolder）
     * @returns {Promise<void>}
     */
    function createDir(dirPath) {
        if (!dirPath || typeof dirPath !== 'string') {
            return Promise.reject(new Error('目录路径不能为空'));
        }
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            return Promise.reject(new Error('ProcessManager.callKernelAPI 不可用'));
        }
        return ProcessManager.callKernelAPI(_pid, 'FileSystem.create', ['directory', dirPath]);
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
     * 设置系统主题（通过 ProcessManager.callKernelAPI 调用 ThemeManager.setTheme）
     * @param {string} themeId 主题ID，如 default, deep-blue, green, orange, red, glass
     */
    function setTheme(themeId) {
        if (!themeId || typeof themeId !== 'string') return;
        var theme = themeId.trim().toLowerCase();
        var validThemes = ['default', 'deep-blue', 'green', 'orange', 'red', 'glass'];
        if (validThemes.indexOf(theme) < 0) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', '不支持的主题: ' + themeId);
            }
            showAssistantBubble('抱歉，不支持该主题。支持的主题：默认、深蓝、绿色、橙色、红色、玻璃');
            speakText('抱歉，不支持该主题');
            return;
        }
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', 'ProcessManager.callKernelAPI 不可用，无法设置主题');
            }
            return;
        }
        ProcessManager.callKernelAPI(_pid, 'Theme.set', [theme])
            .then(function (success) {
                if (success) {
                    var themeNames = {
                        'default': '默认',
                        'deep-blue': '深蓝',
                        'green': '绿色',
                        'orange': '橙色',
                        'red': '红色',
                        'glass': '玻璃'
                    };
                    var themeName = themeNames[theme] || theme;
                    var msg = '已切换为' + themeName + '主题';
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('server-aiassistant', '主题已切换为: ' + theme);
                    }
                    showAssistantBubble(msg);
                    speakText(msg);
                } else {
                    var errorMsg = '切换主题失败，请检查主题是否存在';
                    showAssistantBubble(errorMsg);
                    speakText('切换主题失败');
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '切换主题失败: ' + theme);
                    }
                }
            })
            .catch(function (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-aiassistant', '切换主题失败: ' + (e && e.message));
                }
                showAssistantBubble('切换主题失败，请稍后再试');
                speakText('切换主题失败');
            });
    }

    /**
     * 设置系统界面语言（通过 Languages.loadPack + Languages.setCurrent）
     * @param {string} locale 语言标识，如 zh-CN、en
     */
    function setLanguage(locale) {
        if (!locale || typeof locale !== 'string') return;
        var loc = (locale.trim() || '').toLowerCase();
        if (loc === 'zh-cn' || loc === 'en') {
            loc = loc === 'zh-cn' ? 'zh-CN' : 'en';
        } else {
            loc = locale.trim();
        }
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-aiassistant', 'ProcessManager.callKernelAPI 不可用，无法设置语言');
            }
            return;
        }
        ProcessManager.callKernelAPI(_pid, 'Languages.loadPack', [loc])
            .then(function () {
                return ProcessManager.callKernelAPI(_pid, 'Languages.setCurrent', [loc]);
            })
            .then(function () {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('server-aiassistant', '界面语言已切换为: ' + loc);
                }
                showAssistantBubble(loc === 'zh-CN' ? '已切换为简体中文' : (loc === 'en' ? 'Switched to English' : '已切换为 ' + loc));
                speakText(loc === 'zh-CN' ? '已切换为简体中文' : (loc === 'en' ? 'Switched to English' : '已切换为 ' + loc));
            })
            .catch(function (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-aiassistant', '切换语言失败: ' + (e && e.message));
                }
                showAssistantBubble('切换语言失败，请检查是否已安装对应语言包');
                speakText('切换语言失败');
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
            } else if (action === 'MINIMIZE' && parts[1]) {
                var programToMin = parts[1].toLowerCase();
                if (ALLOWED_PROGRAMS.indexOf(programToMin) >= 0) {
                    minimizeProgramByName(programToMin);
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '不允许操作的程序: ' + programToMin);
                    }
                }
            } else if (action === 'MAXIMIZE' && parts[1]) {
                var programToMax = parts[1].toLowerCase();
                if (ALLOWED_PROGRAMS.indexOf(programToMax) >= 0) {
                    maximizeProgramByName(programToMax);
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', '不允许操作的程序: ' + programToMax);
                    }
                }
            } else if (action === 'SET' && parts[1] && parts[2] !== undefined) {
                var resource = parts[1].toLowerCase();
                if (resource === 'brightness') {
                    setBrightness(parseInt(parts[2], 10));
                } else if (resource === 'language') {
                    setLanguage(parts[2]);
                } else if (resource === 'theme') {
                    setTheme(parts[2]);
                } else if (resource === 'volume') {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('server-aiassistant', 'P SET volume (暂不支持)');
                    }
                }
            } else if (action === 'TIME') {
                var timeStr = getFormattedTime();
                showAssistantBubble(timeStr);
                speakText(timeStr);
            } else if (action === 'WEATHER') {
                var city = parts[1] || '';
                getWeather(city)
                    .then(function (weatherText) {
                        showAssistantBubble(weatherText);
                        speakText(weatherText);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '天气查询成功: ' + (city || '当前位置'));
                        }
                    })
                    .catch(function (e) {
                        var errorMsg = '抱歉，查询天气失败，请稍后再试。';
                        showAssistantBubble(errorMsg);
                        speakText(errorMsg);
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', '天气查询失败: ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
            } else if (action === 'SYSTEMINFO') {
                var sysInfoText = getSystemInfo();
                showAssistantBubble(sysInfoText);
                speakText(sysInfoText.split('\n')[0] || sysInfoText); // 只朗读第一行
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('server-aiassistant', '系统信息查询成功');
                }
            } else if (action === 'EXEC') {
                var cmd = parts.slice(1).join(' '); // 支持带空格的命令
                if (!cmd || !cmd.trim()) {
                    showAssistantBubble('抱歉，请提供要执行的命令');
                    speakText('请提供要执行的命令');
                    return;
                }
                var commandToExecute = cmd.trim();
                executeTerminalCommand(commandToExecute)
                    .then(function (output) {
                        if (output && output.trim()) {
                            // 将命令输出发送给 AI 优化
                            return optimizeCommandOutput(commandToExecute, output);
                        } else {
                            return Promise.resolve('命令执行完成，但无输出');
                        }
                    })
                    .then(function (optimizedOutput) {
                        showAssistantBubble(optimizedOutput);
                        speakText('命令执行完成');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '终端命令执行成功: ' + commandToExecute);
                        }
                    })
                    .catch(function (e) {
                        var errorMsg = '抱歉，执行命令失败：' + (e && e.message ? e.message : '未知错误');
                        showAssistantBubble(errorMsg);
                        speakText('执行命令失败');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', '终端命令执行失败: ' + commandToExecute + ' - ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
            } else if (action === 'DEBUG') {
                var debugArgs = parts.slice(1).join(' ');
                var debugCommand = debugArgs && debugArgs.trim() ? ('debug ' + debugArgs.trim()) : 'debug';
                executeTerminalCommand(debugCommand)
                    .then(function (output) {
                        if (output && output.trim()) {
                            return optimizeCommandOutput(debugCommand, output);
                        } else {
                            return Promise.resolve('命令执行完成，但无输出');
                        }
                    })
                    .then(function (optimizedOutput) {
                        showAssistantBubble(optimizedOutput);
                        speakText('命令执行完成');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', 'debug 命令执行成功: ' + debugCommand);
                        }
                    })
                    .catch(function (e) {
                        var errorMsg = '抱歉，执行 debug 失败：' + (e && e.message ? e.message : '未知错误');
                        showAssistantBubble(errorMsg);
                        speakText('执行 debug 失败');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', 'debug 命令执行失败: ' + debugCommand + ' - ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
            } else if (action === 'KERNELCHECK') {
                var checkCommand = 'check';
                executeTerminalCommand(checkCommand)
                    .then(function (output) {
                        if (output && output.trim()) {
                            return optimizeCommandOutput(checkCommand, output);
                        } else {
                            return Promise.resolve('命令执行完成，但无输出');
                        }
                    })
                    .then(function (optimizedOutput) {
                        showAssistantBubble(optimizedOutput);
                        speakText('内核自检完成');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '内核自检执行成功');
                        }
                    })
                    .catch(function (e) {
                        var errorMsg = '抱歉，内核自检失败：' + (e && e.message ? e.message : '未知错误');
                        showAssistantBubble(errorMsg);
                        speakText('内核自检失败');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', '内核自检执行失败: ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
            } else if (action === 'NOTIFICATION_LIST') {
                if (typeof NotificationManager === 'undefined' || typeof NotificationManager.getAllNotifications !== 'function') {
                    var listError = '通知系统不可用';
                    showAssistantBubble(listError);
                    speakText(listError);
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', 'NotificationManager 不可用，无法查看通知');
                    }
                    return;
                }
                var notifications = NotificationManager.getAllNotifications();
                if (!notifications || notifications.length === 0) {
                    showAssistantBubble('当前没有通知');
                    speakText('当前没有通知');
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('server-aiassistant', '通知列表为空');
                    }
                    return;
                }
                var lines = [];
                for (var i = 0; i < notifications.length; i++) {
                    var n = notifications[i];
                    var titleText = n.title ? String(n.title) : '无标题';
                    var typeText = n.type ? String(n.type) : 'unknown';
                    var pidText = (n.pid !== undefined && n.pid !== null) ? String(n.pid) : 'N/A';
                    var idText = n.id ? String(n.id) : 'N/A';
                    var createdText = '';
                    if (n.createdAt) {
                        try {
                            createdText = new Date(n.createdAt).toLocaleString();
                        } catch (e) {
                            createdText = '';
                        }
                    }
                    var metaText = 'PID ' + pidText + ' / ID ' + idText;
                    if (createdText) {
                        metaText += ' / ' + createdText;
                    }
                    lines.push((i + 1) + '. [' + typeText + '] ' + titleText + ' (' + metaText + ')');
                }
                var header = '当前共有 ' + notifications.length + ' 条通知:';
                showAssistantBubble(header + '\n' + lines.join('\n'));
                speakText('当前共有 ' + notifications.length + ' 条通知');
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('server-aiassistant', '通知列表查询成功: ' + notifications.length + ' 条');
                }
            } else if (action === 'NOTIFICATION_CLEAR') {
                if (typeof NotificationManager === 'undefined' || typeof NotificationManager.getAllNotifications !== 'function' || typeof NotificationManager.removeNotification !== 'function') {
                    var clearError = '通知系统不可用';
                    showAssistantBubble(clearError);
                    speakText(clearError);
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-aiassistant', 'NotificationManager 不可用，无法清空通知');
                    }
                    return;
                }
                var allNotifications = NotificationManager.getAllNotifications();
                if (!allNotifications || allNotifications.length === 0) {
                    showAssistantBubble('当前没有通知可清空');
                    speakText('当前没有通知可清空');
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('server-aiassistant', '通知清空请求：当前为空');
                    }
                    return;
                }
                var removePromises = [];
                for (var j = 0; j < allNotifications.length; j++) {
                    removePromises.push(NotificationManager.removeNotification(allNotifications[j].id));
                }
                Promise.allSettled(removePromises)
                    .then(function (results) {
                        var successCount = 0;
                        var failCount = 0;
                        for (var k = 0; k < results.length; k++) {
                            var r = results[k];
                            if (r && r.status === 'fulfilled' && r.value !== false) {
                                successCount++;
                            } else {
                                failCount++;
                            }
                        }
                        var msg = '已清理通知 ' + successCount + ' 条';
                        if (failCount > 0) {
                            msg += '，失败 ' + failCount + ' 条';
                        }
                        showAssistantBubble(msg);
                        speakText('通知已清理');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '通知清理完成: success=' + successCount + ', fail=' + failCount);
                        }
                    })
                    .catch(function (e) {
                        var errMsg = '清空通知失败，请稍后再试';
                        showAssistantBubble(errMsg);
                        speakText('清空通知失败');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', '通知清理失败: ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
            } else if (action === 'READFILE') {
                var filePath = parts.slice(1).join(' '); // 支持路径中包含空格
                if (!filePath || !filePath.trim()) {
                    showAssistantBubble('抱歉，请提供文件路径');
                    speakText('请提供文件路径');
                    return;
                }
                readFile(filePath.trim())
                    .then(function (content) {
                        var displayContent = content.length > 500 ? content.substring(0, 500) + '\n...(内容过长，已截断)' : content;
                        showAssistantBubble('文件内容：\n' + displayContent);
                        speakText('文件读取成功');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '文件读取成功: ' + filePath);
                        }
                    })
                    .catch(function (e) {
                        var errorMsg = '抱歉，读取文件失败：' + (e && e.message ? e.message : '未知错误');
                        showAssistantBubble(errorMsg);
                        speakText('读取文件失败');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', '文件读取失败: ' + filePath + ' - ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
            } else if (action === 'WRITEFILE') {
                if (parts.length < 3) {
                    showAssistantBubble('抱歉，请提供文件路径和内容');
                    speakText('请提供文件路径和内容');
                    return;
                }
                var filePath = parts[1];
                var content = parts.slice(2).join(' '); // 内容可能包含空格
                writeFile(filePath, content)
                    .then(function () {
                        showAssistantBubble('文件写入成功：' + filePath);
                        speakText('文件写入成功');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '文件写入成功: ' + filePath);
                        }
                    })
                    .catch(function (e) {
                        var errorMsg = '抱歉，写入文件失败：' + (e && e.message ? e.message : '未知错误');
                        showAssistantBubble(errorMsg);
                        speakText('写入文件失败');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', '文件写入失败: ' + filePath + ' - ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
            } else if (action === 'APPENDFILE') {
                if (parts.length < 3) {
                    showAssistantBubble('抱歉，请提供文件路径和要追加的内容');
                    speakText('请提供文件路径和要追加的内容');
                    return;
                }
                var filePath = parts[1];
                var content = parts.slice(2).join(' '); // 内容可能包含空格
                appendFile(filePath, content)
                    .then(function () {
                        showAssistantBubble('内容追加成功：' + filePath);
                        speakText('内容追加成功');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '文件追加成功: ' + filePath);
                        }
                    })
                    .catch(function (e) {
                        var errorMsg = '抱歉，追加内容失败：' + (e && e.message ? e.message : '未知错误');
                        showAssistantBubble(errorMsg);
                        speakText('追加内容失败');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', '文件追加失败: ' + filePath + ' - ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
            } else if (action === 'DELETEFILE') {
                var path = parts.slice(1).join(' '); // 支持路径中包含空格
                if (!path || !path.trim()) {
                    showAssistantBubble('抱歉，请提供要删除的文件或目录路径');
                    speakText('请提供要删除的文件或目录路径');
                    return;
                }
                deleteFile(path.trim())
                    .then(function () {
                        showAssistantBubble('删除成功：' + path);
                        speakText('删除成功');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '文件删除成功: ' + path);
                        }
                    })
                    .catch(function (e) {
                        var errorMsg = '抱歉，删除失败：' + (e && e.message ? e.message : '未知错误');
                        showAssistantBubble(errorMsg);
                        speakText('删除失败');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', '文件删除失败: ' + path + ' - ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
            } else if (action === 'CREATEDIR') {
                var dirPath = parts.slice(1).join(' '); // 支持路径中包含空格
                if (!dirPath || !dirPath.trim()) {
                    showAssistantBubble('抱歉，请提供目录路径');
                    speakText('请提供目录路径');
                    return;
                }
                createDir(dirPath.trim())
                    .then(function () {
                        showAssistantBubble('目录创建成功：' + dirPath);
                        speakText('目录创建成功');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('server-aiassistant', '目录创建成功: ' + dirPath);
                        }
                    })
                    .catch(function (e) {
                        var errorMsg = '抱歉，创建目录失败：' + (e && e.message ? e.message : '未知错误');
                        showAssistantBubble(errorMsg);
                        speakText('创建目录失败');
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('server-aiassistant', '目录创建失败: ' + dirPath + ' - ' + (e && e.message ? e.message : '未知错误'));
                        }
                    });
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
                                clearConversationHistory();
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
                                var wakeReplies = ['嗯', '我在', '嗯哼'];
                                var reply = wakeReplies[Math.floor(Math.random() * wakeReplies.length)];
                                showAssistantBubble(reply);
                                speakText(reply);
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
        clearConversationHistory();
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
        if (AI_MODEL === 'spark') {
            if (!SPARK_APP_ID || !SPARK_API_PASSWORD) {
                var msg = 'AI 助手启动失败：未配置星火 App ID 或 API Password，请先在服务管理中配置或执行: service config aiassistant set sparkAppId=xxx sparkApiPassword=xxx';
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-aiassistant', msg);
                }
                throw new Error(msg);
            }
        } else if (AI_MODEL === 'qwen-plus') {
            if (!DASHSCOPE_API_KEY || !DASHSCOPE_API_KEY.trim()) {
                var msg2 = 'AI 助手启动失败：未配置阿里云 DashScope API Key，请先在服务管理中配置或执行: service config aiassistant set dashscopeApiKey=sk-xxx';
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-aiassistant', msg2);
                }
                throw new Error(msg2);
            }
        }
        _running = true;
        _processingMode = false;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-aiassistant', 'start - 开始监听唤醒词');
        }
        startSpeechRecognition();
        if (AI_MODEL === 'spark') {
            chatWithAI('').then(function () { }).catch(function (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-aiassistant', '启动提示词发送失败: ' + (e && e.message));
                }
            });
        }
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
            { key: 'aiModel', label: 'AI 模型', type: 'text', value: AI_MODEL, options: [{ value: 'spark', label: '讯飞星火 (spark)' }, { value: 'qwen-plus', label: '阿里云通义千问 (qwen-plus)' }] },
            { key: 'sparkAppId', label: '星火 App ID', type: 'text', value: SPARK_APP_ID || '' },
            { key: 'sparkApiPassword', label: '星火 API Password', type: 'text', value: SPARK_API_PASSWORD || '' },
            { key: 'dashscopeApiKey', label: '阿里云 API Key（qwen-plus）', type: 'text', value: DASHSCOPE_API_KEY || '' }
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
        if (config.aiModel === 'spark' || config.aiModel === 'qwen-plus') {
            AI_MODEL = config.aiModel;
        }
        if (typeof config.dashscopeApiKey === 'string') {
            DASHSCOPE_API_KEY = config.dashscopeApiKey;
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
