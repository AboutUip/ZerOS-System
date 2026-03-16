// 手势控制服务
// 启动后加载 MediaPipe 依赖、监听摄像头，识别手势并执行操作；支持配置：最多手数、精度/速度、各手势触发的操作
// 依赖：DynamicManager.mediapipe、navigator.mediaDevices.getUserMedia、GUIManager（关闭程序）

(function () {
    'use strict';

    var _pid = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;

    var _running = false;
    var _initialized = false;
    var _vision = null;
    var _handLandmarker = null;
    var _gestureRecognizer = null;
    var _video = null;
    var _stream = null;
    var _animationFrameId = null;
    var _idleCallbackId = null;
    var _lastDetectTime = 0;
    var _lastError = null;
    var _lastGesture = null;
    var _lastHandCount = 0;
    var _actionDebounceUntil = 0;
    var _ACTION_DEBOUNCE_MS = 1500;

    var _CONFIG_STORAGE_KEY = '_server_gesturecontrol_config';

    /** 当前配置（可从 __list__/__set__ 读写并持久化） */
    var _config = {
        maxHands: 2,
        precisionSpeed: 'balanced',
        useMultithreading: false,
        gestureActions: {},
        gesturePrograms: {}
    };

    /** 程序通过 POOL 注册的手势回调（仅通知，不修改配置） */
    var _gestureListeners = [];

    /** 支持为每种手势单独配置“触发的操作” */
    var _ACTION_OPTIONS = [
        { value: 'none', label: '无（不执行任何操作）' },
        { value: 'close_program', label: '关闭程序（关闭当前焦点窗口）' },
        { value: 'minimize_program', label: '最小化程序（当前焦点窗口最小化到任务栏）' },
        { value: 'maximize_program', label: '最大化/还原程序（当前焦点窗口全屏与还原切换）' },
        { value: 'run_program', label: '运行程序（启动指定程序，需填写程序名）' }
    ];

    /** 参与配置的手势列表（MediaPipe 常见类别） */
    var _GESTURE_IDS = ['Victory', 'Pointing_Up', 'Closed_Fist', 'Open_Palm', 'Thumb_Up', 'Thumb_Down', 'ILoveYou', 'Thumb_Left', 'Thumb_Right'];
    /** 手势中文名（用于状态展示） */
    var _GESTURE_NAMES_ZH = {
        Victory: '比耶',
        Pointing_Up: '食指向上',
        Closed_Fist: '握拳',
        Open_Palm: '张开手掌',
        Thumb_Up: '竖大拇指',
        Thumb_Down: '拇指向下',
        ILoveYou: '我爱你',
        Thumb_Left: '拇指向左',
        Thumb_Right: '拇指向右'
    };

    function _log(level, msg, err) {
        if (typeof KernelLogger === 'undefined') return;
        if (level === 'info') KernelLogger.info('server-gesturecontrol', msg);
        else if (level === 'warn') KernelLogger.warn('server-gesturecontrol', msg);
        else if (level === 'error') KernelLogger.error('server-gesturecontrol', msg, err || undefined);
    }

    function _getDetectIntervalMs() {
        switch (_config.precisionSpeed) {
            case 'speed': return 150;
            case 'precision': return 66;
            default: return 100;
        }
    }

    function _getMinConfidence() {
        switch (_config.precisionSpeed) {
            case 'speed': return 0.4;
            case 'precision': return 0.6;
            default: return 0.5;
        }
    }

    /**
     * 执行“关闭程序”：关闭当前焦点窗口（若存在）
     */
    function _executeCloseProgram() {
        var now = Date.now();
        if (now < _actionDebounceUntil) return;
        _actionDebounceUntil = now + _ACTION_DEBOUNCE_MS;
        if (typeof GUIManager === 'undefined' || typeof GUIManager.getFocusedWindow !== 'function' || typeof GUIManager._closeWindow !== 'function') {
            _log('warn', '关闭程序: GUIManager 不可用');
            return;
        }
        var focused = GUIManager.getFocusedWindow();
        if (!focused || !focused.windowId) return;
        GUIManager._closeWindow(focused.windowId, false);
        _log('info', '关闭程序: 已关闭焦点窗口');
    }

    /**
     * 执行“最小化程序”：将当前焦点窗口最小化到任务栏
     */
    function _executeMinimizeProgram() {
        var now = Date.now();
        if (now < _actionDebounceUntil) return;
        _actionDebounceUntil = now + _ACTION_DEBOUNCE_MS;
        if (typeof GUIManager === 'undefined' || typeof GUIManager.getFocusedWindow !== 'function' || typeof GUIManager.minimizeWindow !== 'function') {
            _log('warn', '最小化程序: GUIManager 不可用');
            return;
        }
        var focused = GUIManager.getFocusedWindow();
        if (!focused || !focused.windowId) return;
        GUIManager.minimizeWindow(focused.windowId);
        _log('info', '最小化程序: 已最小化焦点窗口');
    }

    /**
     * 执行“最大化/还原程序”：当前焦点窗口在全屏与还原之间切换
     */
    function _executeMaximizeProgram() {
        var now = Date.now();
        if (now < _actionDebounceUntil) return;
        _actionDebounceUntil = now + _ACTION_DEBOUNCE_MS;
        if (typeof GUIManager === 'undefined' || typeof GUIManager.getFocusedWindow !== 'function' || typeof GUIManager.toggleMaximize !== 'function') {
            _log('warn', '最大化程序: GUIManager 不可用');
            return;
        }
        var focused = GUIManager.getFocusedWindow();
        if (!focused || !focused.windowId) return;
        GUIManager.toggleMaximize(focused.windowId);
        _log('info', '最大化/还原程序: 已切换焦点窗口');
    }

    /**
     * 执行“运行程序”：根据程序名启动应用（需 ProcessManager.startProgram）
     */
    function _executeRunProgram(programName) {
        var now = Date.now();
        if (now < _actionDebounceUntil) return;
        _actionDebounceUntil = now + _ACTION_DEBOUNCE_MS;
        var name = (programName && typeof programName === 'string') ? programName.trim() : '';
        if (!name) {
            _log('warn', '运行程序: 未指定程序名');
            return;
        }
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.startProgram !== 'function') {
            _log('warn', '运行程序: ProcessManager.startProgram 不可用');
            return;
        }
        ProcessManager.startProgram(name, {}).then(function (pid) {
            _log('info', '运行程序: 已启动 ' + name + ' (PID ' + pid + ')');
        }).catch(function (e) {
            _log('warn', '运行程序失败: ' + name + ', ' + (e && e.message));
        });
    }

    /**
     * 根据配置执行手势对应操作
     * @param {string} gestureName - 手势名称
     * @param {number} handIndex - 手部索引
     * @param {Array} landmarks - 关键点
     * @param {number} confidence - 置信度
     */
    function _onGesture(gestureName, handIndex, landmarks, confidence) {
        var minConf = _getMinConfidence();
        if (confidence != null && confidence < minConf) return;
        _lastGesture = { gestureName: gestureName, handIndex: handIndex, confidence: confidence, time: Date.now() };

        var action = (_config.gestureActions && _config.gestureActions[gestureName]) || 'none';
        if (action === 'close_program') _executeCloseProgram();
        else if (action === 'minimize_program') _executeMinimizeProgram();
        else if (action === 'maximize_program') _executeMaximizeProgram();
        else if (action === 'run_program') {
            var programName = (_config.gesturePrograms && _config.gesturePrograms[gestureName]) || '';
            _executeRunProgram(programName);
        }
        for (var i = 0; i < _gestureListeners.length; i++) {
            try {
                _gestureListeners[i](gestureName, handIndex, confidence, landmarks);
            } catch (e) {
                _log('warn', '手势回调异常: ' + (e && e.message));
            }
        }
    }

    /**
     * 加载 MediaPipe 并创建手部与手势检测器
     */
    function _loadMediaPipe() {
        if (_handLandmarker && _gestureRecognizer) return Promise.resolve();
        if (typeof DynamicManager === 'undefined') {
            return Promise.reject(new Error('DynamicManager 不可用'));
        }
        return DynamicManager.loadModule('mediapipe').then(function (vision) {
            _vision = vision;
            if (!_vision || !_vision.HandLandmarker || !_vision.GestureRecognizer || !_vision.FilesetResolver) {
                return Promise.reject(new Error('MediaPipe 模块不完整'));
            }
            var HandLandmarker = _vision.HandLandmarker;
            var GestureRecognizer = _vision.GestureRecognizer;
            var FilesetResolver = _vision.FilesetResolver;
            var wasmPath = '/kernel/dynamicModule/libs/mediapipe/wasm';
            var numHands = Math.max(1, Math.min(2, _config.maxHands));
            var minConf = _getMinConfidence();
            return FilesetResolver.forVisionTasks(wasmPath).then(function (resolver) {
                return HandLandmarker.createFromOptions(resolver, {
                    baseOptions: {
                        modelAssetPath: '/kernel/dynamicModule/libs/mediapipe/models/hand_landmarker.task',
                        delegate: 'GPU'
                    },
                    numHands: numHands,
                    minHandDetectionConfidence: minConf,
                    minHandPresenceConfidence: minConf,
                    minTrackingConfidence: minConf
                }).then(function (handLandmarker) {
                    _handLandmarker = handLandmarker;
                    return GestureRecognizer.createFromOptions(resolver, {
                        baseOptions: {
                            modelAssetPath: '/kernel/dynamicModule/libs/mediapipe/models/gesture_recognizer.task',
                            delegate: 'GPU'
                        },
                        numHands: numHands,
                        minHandDetectionConfidence: minConf,
                        minHandPresenceConfidence: minConf,
                        minTrackingConfidence: minConf
                    });
                }).then(function (gestureRecognizer) {
                    _gestureRecognizer = gestureRecognizer;
                    _log('info', 'MediaPipe 手部与手势检测器已创建');
                    return;
                });
            });
        });
    }

    /**
     * 请求摄像头并绑定到 video 元素
     */
    function _startCamera() {
        if (_stream) return Promise.resolve();
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            return Promise.reject(new Error('浏览器不支持摄像头'));
        }
        var constraints = { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } };
        return navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
            _stream = stream;
            if (!_video) {
                _video = document.createElement('video');
                _video.setAttribute('playsinline', 'true');
                _video.setAttribute('muted', 'true');
                _video.style.cssText = 'position:fixed;left:-9999px;width:640px;height:480px;';
                if (document.body) document.body.appendChild(_video);
            }
            _video.srcObject = stream;
            return new Promise(function (resolve) {
                _video.onloadedmetadata = function () {
                    _video.play().then(resolve).catch(resolve);
                };
                _video.onerror = function () { resolve(); };
            });
        });
    }

    /**
     * 检测循环：每 _detectIntervalMs 执行一次手部+手势检测，并调用占位回调
     */
    function _detectionLoop() {
        if (!_running || !_video || !_handLandmarker || !_gestureRecognizer) return;

        var now = Date.now();
        var intervalMs = _getDetectIntervalMs();
        if (now - _lastDetectTime < intervalMs) {
            _scheduleNextDetect();
            return;
        }
        _lastDetectTime = now;

        if (_video.readyState < 2) {
            _scheduleNextDetect();
            return;
        }

        Promise.all([
            _handLandmarker.detect(_video),
            _gestureRecognizer.recognize(_video)
        ]).then(function (results) {
            var handResults = results[0];
            var gestureResults = results[1];
            var landmarksList = (handResults && handResults.landmarks) ? handResults.landmarks : [];
            var gesturesList = (gestureResults && gestureResults.gestures) ? gestureResults.gestures : [];
            var maxHands = Math.max(1, Math.min(2, _config.maxHands));
            if (landmarksList.length > maxHands) {
                landmarksList = landmarksList.slice(0, maxHands);
                if (gesturesList.length > maxHands) gesturesList = gesturesList.slice(0, maxHands);
            }
            _lastHandCount = landmarksList.length;

            for (var i = 0; i < landmarksList.length; i++) {
                var landmarks = landmarksList[i];
                var gestures = gesturesList[i];
                var topGesture = (gestures && gestures.length > 0) ? gestures[0] : null;
                var name = (topGesture && topGesture.categoryName) ? topGesture.categoryName : 'Unknown';
                var score = (topGesture && topGesture.score != null) ? topGesture.score : 0;
                _onGesture(name, i, landmarks, score);
            }
        }).catch(function (err) {
            if (err && err.message && err.message.indexOf('ROI') === -1) {
                _lastError = err.message;
                _log('warn', '检测异常: ' + err.message);
            }
        });

        _scheduleNextDetect();
    }

    /** 调度下一帧检测：多线程加速时用 requestIdleCallback 让出主线程，减轻阻塞；否则用 requestAnimationFrame */
    function _scheduleNextDetect() {
        if (!_running) return;
        if (_config.useMultithreading && typeof requestIdleCallback === 'function') {
            _animationFrameId = null;
            _idleCallbackId = requestIdleCallback(function () {
                _idleCallbackId = null;
                _detectionLoop();
            }, { timeout: _getDetectIntervalMs() + 100 });
        } else {
            _idleCallbackId = null;
            _animationFrameId = requestAnimationFrame(_detectionLoop);
        }
    }

    function _stopCamera() {
        if (_stream) {
            _stream.getTracks().forEach(function (t) { t.stop(); });
            _stream = null;
        }
        if (_video && _video.srcObject) {
            _video.srcObject = null;
        }
    }

    function _closeDetectors() {
        if (_gestureRecognizer && typeof _gestureRecognizer.close === 'function') {
            try { _gestureRecognizer.close(); } catch (e) {}
            _gestureRecognizer = null;
        }
        if (_handLandmarker && typeof _handLandmarker.close === 'function') {
            try { _handLandmarker.close(); } catch (e) {}
            _handLandmarker = null;
        }
    }

    function loadConfig() {
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') return;
        ProcessManager.callKernelAPI(_pid, 'Environment.get', [_CONFIG_STORAGE_KEY])
            .then(function (raw) {
                if (typeof raw !== 'string' || !raw.trim()) return;
                try {
                    var parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        if (parsed.maxHands === 1 || parsed.maxHands === 2) _config.maxHands = parsed.maxHands;
                        if (parsed.precisionSpeed === 'speed' || parsed.precisionSpeed === 'balanced' || parsed.precisionSpeed === 'precision') {
                            _config.precisionSpeed = parsed.precisionSpeed;
                        }
                        if (parsed.useMultithreading === true || parsed.useMultithreading === false) _config.useMultithreading = parsed.useMultithreading;
                        if (parsed.gestureActions && typeof parsed.gestureActions === 'object') {
                            _config.gestureActions = parsed.gestureActions;
                        }
                        if (parsed.gesturePrograms && typeof parsed.gesturePrograms === 'object') {
                            _config.gesturePrograms = parsed.gesturePrograms;
                        }
                    }
                } catch (e) {}
            })
            .catch(function () {});
    }

    function saveConfig(cfg) {
        if (typeof ProcessManager === 'undefined' || typeof ProcessManager.callKernelAPI !== 'function') {
            return Promise.resolve();
        }
        var toSave = {
            maxHands: _config.maxHands,
            precisionSpeed: _config.precisionSpeed,
            useMultithreading: _config.useMultithreading,
            gestureActions: _config.gestureActions ? JSON.parse(JSON.stringify(_config.gestureActions)) : {},
            gesturePrograms: _config.gesturePrograms ? JSON.parse(JSON.stringify(_config.gesturePrograms)) : {}
        };
        if (cfg && typeof cfg === 'object') {
            if (cfg.maxHands === 1 || cfg.maxHands === 2) toSave.maxHands = cfg.maxHands;
            if (cfg.precisionSpeed === 'speed' || cfg.precisionSpeed === 'balanced' || cfg.precisionSpeed === 'precision') toSave.precisionSpeed = cfg.precisionSpeed;
            if (cfg.useMultithreading === true || cfg.useMultithreading === false) toSave.useMultithreading = cfg.useMultithreading;
            if (cfg.gestureActions && typeof cfg.gestureActions === 'object') toSave.gestureActions = cfg.gestureActions;
            if (cfg.gesturePrograms && typeof cfg.gesturePrograms === 'object') toSave.gesturePrograms = cfg.gesturePrograms;
        }
        var value = JSON.stringify(toSave);
        return ProcessManager.callKernelAPI(_pid, 'Environment.set', [_CONFIG_STORAGE_KEY, value])
            .then(function () { return; })
            .catch(function (e) {
                _log('warn', '保存配置失败: ' + (e && e.message));
                throw e;
            });
    }

    var POOL_CATEGORY = 'SERVER';
    var POOL_KEY = 'GestureControl';

    /**
     * 供程序通过 POOL 调用的 API：为特定手势绑定操作或订阅手势事件
     */
    function _getGestureControlAPI() {
        return {
            /** 支持的手势名列表（只读副本） */
            gestureIds: _GESTURE_IDS.slice(),
            /** 支持的操作：none | close_program | minimize_program | maximize_program | run_program */
            setGestureAction: function (gestureName, action, options) {
                if (!_GESTURE_IDS.includes(gestureName)) {
                    _log('warn', 'setGestureAction: 未知手势 ' + gestureName);
                    return Promise.reject(new Error('未知手势: ' + gestureName));
                }
                var allowed = ['none', 'close_program', 'minimize_program', 'maximize_program', 'run_program'];
                if (allowed.indexOf(action) === -1) {
                    return Promise.reject(new Error('未知操作: ' + action));
                }
                if (!_config.gestureActions) _config.gestureActions = {};
                _config.gestureActions[gestureName] = action;
                if (action === 'run_program') {
                    if (!_config.gesturePrograms) _config.gesturePrograms = {};
                    if (options && typeof options.program === 'string' && options.program.trim()) {
                        _config.gesturePrograms[gestureName] = options.program.trim();
                    } else {
                        delete _config.gesturePrograms[gestureName];
                    }
                } else {
                    if (_config.gesturePrograms) delete _config.gesturePrograms[gestureName];
                }
                return saveConfig({});
            },
            /** 获取当前手势→操作与程序名配置 */
            getGestureActions: function () {
                return {
                    gestureActions: _config.gestureActions ? JSON.parse(JSON.stringify(_config.gestureActions)) : {},
                    gesturePrograms: _config.gesturePrograms ? JSON.parse(JSON.stringify(_config.gesturePrograms)) : {}
                };
            },
            /** 获取完整配置（含 maxHands、precisionSpeed 等） */
            getConfig: function () {
                return JSON.parse(JSON.stringify(_config));
            },
            /** 订阅手势事件：识别到任意手势时回调 (gestureName, handIndex, confidence, landmarks) */
            onGesture: function (callback) {
                if (typeof callback === 'function' && _gestureListeners.indexOf(callback) === -1) {
                    _gestureListeners.push(callback);
                }
            },
            /** 取消订阅 */
            offGesture: function (callback) {
                var i = _gestureListeners.indexOf(callback);
                if (i !== -1) _gestureListeners.splice(i, 1);
            },
            /** 服务是否正在运行（摄像头与检测是否开启） */
            isRunning: function () { return _running; }
        };
    }

    function __init__() {
        if (_initialized) return;
        _initialized = true;
        loadConfig();
        if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
            try {
                if (!POOL.__HAS__(POOL_CATEGORY)) {
                    POOL.__INIT__(POOL_CATEGORY);
                }
                POOL.__ADD__(POOL_CATEGORY, POOL_KEY, _getGestureControlAPI());
                _log('info', '已向 POOL > SERVER 注册 GestureControl API');
            } catch (e) {
                _log('warn', 'POOL 注册失败: ' + (e && e.message));
            }
        }
        _log('info', 'init');
    }

    function __start__() {
        if (_running) return;
        _running = true;
        _lastError = null;
        _closeDetectors();
        _log('info', 'start: 正在加载依赖并启动摄像头...');

        _loadMediaPipe()
            .then(function () { return _startCamera(); })
            .then(function () {
                _lastError = null;
                _log('info', '摄像头与检测已启动，手势识别中（操作为占位）');
                _detectionLoop();
            })
            .catch(function (err) {
                _lastError = (err && err.message) ? err.message : String(err);
                _log('error', '启动失败: ' + _lastError, err);
                _running = false;
            });
    }

    function __stop__() {
        if (!_running) return;
        _running = false;
        if (_animationFrameId != null) {
            cancelAnimationFrame(_animationFrameId);
            _animationFrameId = null;
        }
        if (_idleCallbackId != null && typeof cancelIdleCallback === 'function') {
            cancelIdleCallback(_idleCallbackId);
            _idleCallbackId = null;
        }
        _stopCamera();
        _closeDetectors();
        _lastHandCount = 0;
        _lastGesture = null;
        _log('info', 'stop');
    }

    function __status__() {
        var runningText = _running ? '运行中' : '已停止';
        var lastGestureText = '无';
        if (_lastGesture && _lastGesture.gestureName) {
            var zhName = _GESTURE_NAMES_ZH[_lastGesture.gestureName] || _lastGesture.gestureName;
            var pct = _lastGesture.confidence != null ? (_lastGesture.confidence * 100).toFixed(0) + '%' : '-';
            lastGestureText = zhName + '（' + _lastGesture.gestureName + '）置信度 ' + pct;
        }
        var precisionSpeedText = { speed: '偏速度', balanced: '平衡', precision: '偏精度' }[_config.precisionSpeed] || _config.precisionSpeed;
        return {
            running: _running,
            initialized: _initialized,
            lastError: _lastError,
            lastHandCount: _lastHandCount,
            lastGesture: _lastGesture,
            hasVideo: !!(_video && _stream),
            hasDetectors: !!(_handLandmarker && _gestureRecognizer),
            config: { maxHands: _config.maxHands, precisionSpeed: _config.precisionSpeed, useMultithreading: _config.useMultithreading },
            display: {
                statusText: runningText,
                statusDescription: _running ? '服务正在监听摄像头并识别手势，识别到配置的手势时会执行对应操作。' : '服务未运行，不会占用摄像头。',
                lastGestureText: lastGestureText,
                lastGestureDescription: '最近一次识别到的手势及置信度（0–100% 越高越可靠）。',
                lastHandCount: _lastHandCount,
                lastHandCountDescription: '当前帧检测到的手的数量（0、1 或 2），受「最多监听手数」限制。',
                hasVideo: !!(_video && _stream),
                hasVideoDescription: '摄像头是否已成功打开并推流。',
                hasDetectors: !!(_handLandmarker && _gestureRecognizer),
                hasDetectorsDescription: '手部与手势识别模型是否已加载。',
                precisionSpeedText: precisionSpeedText,
                precisionSpeedDescription: '偏速度：检测更快、占用更低，可能略容易误检；偏精度：更严格、更准，占用更高；平衡：折中。',
                maxHandsDescription: '同时跟踪的手的数量上限（1 或 2）。',
                useMultithreading: _config.useMultithreading,
                useMultithreadingDescription: '启用后检测在浏览器空闲时调度（requestIdleCallback），减轻主线程压力，避免卡顿；检测本身仍在主线程执行。',
                metricsHint: 'lastHandCount=检测到的手数；lastGesture=最近识别的手势及置信度；precisionSpeed 影响检测间隔与置信度阈值；useMultithreading 影响调度方式。'
            }
        };
    }

    function __info__() {
        return {
            name: '手势控制',
            nameEn: 'GestureControl',
            version: '1.0.0',
            description: '监听摄像头并识别手势，根据配置执行操作（关闭/最小化/最大化/运行程序）。可配置手数、精度/速度、各手势触发的操作；并暴露 POOL > SERVER > GestureControl API，供程序为特定手势绑定操作或订阅手势事件。'
        };
    }

    function __list__() {
        var list = [
            {
                key: 'maxHands',
                label: '最多监听手数',
                hint: '同时跟踪的手的数量上限。设为 1 可减少运算量。',
                type: 'select',
                value: _config.maxHands,
                options: [{ value: 1, label: '1 只手' }, { value: 2, label: '2 只手' }]
            },
            {
                key: 'precisionSpeed',
                label: '检测精度/速度',
                hint: '偏速度：检测更频繁、置信度要求较低，响应快但可能误检；偏精度：置信度要求高、检测稍慢，更稳定；平衡为折中。',
                type: 'select',
                value: _config.precisionSpeed,
                options: [
                    { value: 'speed', label: '偏速度（更快，略易误检）' },
                    { value: 'balanced', label: '平衡' },
                    { value: 'precision', label: '偏精度（更准，稍耗资源）' }
                ]
            },
            {
                key: 'useMultithreading',
                label: '多线程/空闲调度加速',
                hint: '启用后使用 requestIdleCallback 在浏览器空闲时执行检测，减轻主线程占用、减少界面卡顿；检测逻辑仍在主线程，完整 Worker 加速需后续支持。',
                type: 'boolean',
                value: _config.useMultithreading
            }
        ];
        for (var g = 0; g < _GESTURE_IDS.length; g++) {
            var gid = _GESTURE_IDS[g];
            var zhName = _GESTURE_NAMES_ZH[gid] || gid;
            list.push({
                key: 'gesture_' + gid,
                label: '手势「' + zhName + '」触发的操作',
                hint: '当识别到「' + zhName + '」（' + gid + '）且置信度达标时执行的操作。',
                type: 'select',
                value: (_config.gestureActions && _config.gestureActions[gid]) || 'none',
                options: _ACTION_OPTIONS
            });
            list.push({
                key: 'gesture_' + gid + '_program',
                label: '手势「' + zhName + '」运行的程序名',
                hint: '仅当上项为「运行程序」时有效，填写要启动的程序名（如 notepad、terminal、filemanager）。',
                type: 'text',
                value: (_config.gesturePrograms && _config.gesturePrograms[gid]) || ''
            });
        }
        return list;
    }

    function __set__(config) {
        if (!config || typeof config !== 'object') return Promise.resolve();
        if (config.maxHands === 1 || config.maxHands === 2) _config.maxHands = config.maxHands;
        if (config.precisionSpeed === 'speed' || config.precisionSpeed === 'balanced' || config.precisionSpeed === 'precision') {
            _config.precisionSpeed = config.precisionSpeed;
        }
        if (!_config.gestureActions) _config.gestureActions = {};
        if (!_config.gesturePrograms) _config.gesturePrograms = {};
        for (var g = 0; g < _GESTURE_IDS.length; g++) {
            var gid = _GESTURE_IDS[g];
            var key = 'gesture_' + gid;
            var val = config[key];
            if (val === 'none' || val === 'close_program' || val === 'minimize_program' || val === 'maximize_program' || val === 'run_program') {
                _config.gestureActions[gid] = val;
                if (val !== 'run_program') delete _config.gesturePrograms[gid];
            }
            var programKey = 'gesture_' + gid + '_program';
            var programVal = config[programKey];
            if (typeof programVal === 'string') {
                var trimmed = programVal.trim();
                if (trimmed) _config.gesturePrograms[gid] = trimmed;
                else delete _config.gesturePrograms[gid];
            }
        }
        if (config.useMultithreading === true || config.useMultithreading === false) {
            _config.useMultithreading = config.useMultithreading;
        }
        return saveConfig(config);
    }

    if (typeof window !== 'undefined' && typeof window.__ZerOS_ServerExpansion_Register__ === 'function') {
        window.__ZerOS_ServerExpansion_Register__({
            __init__: __init__,
            __start__: __start__,
            __stop__: __stop__,
            __status__: __status__,
            __info__: __info__,
            __list__: __list__,
            __set__: __set__
        });
    }
})();
