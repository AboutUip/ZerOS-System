// KiteEngine 引擎核心服务（服务即核心）
// 存放在 kiteengine/assets/，由后续程序自动加载并安装到 D/server/ 后作为系统服务运行

(function () {
    'use strict';

    var _pid = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;

    var _running = false;
    var _initialized = false;
    var _THREE = null;
    /** 当前运行中的会话，用于 stop */
    var _currentSession = null;

    /** 固定步长（秒），1/60 ≈ 0.01667 */
    var FIXED_DT = 1 / 60;
    /** 每帧最多执行的逻辑步数，防止螺旋 */
    var MAX_FIXED_STEPS_PER_FRAME = 3;

    /** 输入状态（由调用方通过 feed* 写入，脚本通过 get* 读取） */
    var _inputState = {
        keyDown: {},
        mousePosition: { x: 0, y: 0 },
        mouseButtons: { 0: false, 1: false, 2: false }
    };

    function _clearInputState() {
        _inputState.keyDown = {};
        _inputState.mouseButtons = { 0: false, 1: false, 2: false };
    }

    function feedKeyDown(keyCode) { _inputState.keyDown[keyCode] = true; }
    function feedKeyUp(keyCode) { delete _inputState.keyDown[keyCode]; }
    function feedMouseMove(x, y) { _inputState.mousePosition.x = x; _inputState.mousePosition.y = y; }
    function feedMouseButton(button, pressed) { _inputState.mouseButtons[button] = !!pressed; }

    function getKey(keyCode) { return !!_inputState.keyDown[keyCode]; }
    function getMousePosition() { return { x: _inputState.mousePosition.x, y: _inputState.mousePosition.y }; }
    function getMouseButton(button) { return !!_inputState.mouseButtons[button || 0]; }

    function _log(level, msg, err) {
        if (typeof KernelLogger === 'undefined') return;
        if (level === 'info') KernelLogger.info('server-kiteEngine', msg);
        else if (level === 'warn') KernelLogger.warn('server-kiteEngine', msg);
        else if (level === 'error') KernelLogger.error('server-kiteEngine', msg, err || undefined);
    }

    /**
     * 懒加载 Three.js：优先 DynamicManager（three.webgl / three.js），取含 WebGLRenderer 的命名空间或 default；仍无可选 CDN 脚本回退
     * @returns {Promise<Object>} THREE 对象
     */
    function _loadThree() {
        if (_THREE) return Promise.resolve(_THREE);
        function use(T) {
            if (!T || typeof T.WebGLRenderer !== 'function') return null;
            try {
                var r = new T.WebGLRenderer({ antialias: false });
                if (r && typeof r.dispose === 'function') r.dispose();
            } catch (e) {
                return null;
            }
            _THREE = T;
            _log('info', 'Three.js 已加载');
            return _THREE;
        }
        function take(m) {
            if (m != null && typeof m.WebGLRenderer === 'function') return use(m);
            if (m != null && m.default != null && typeof m.default.WebGLRenderer === 'function') return use(m.default);
            var winT = (typeof window !== 'undefined' && window.THREE) || (typeof globalThis !== 'undefined' && globalThis.THREE);
            if (winT && typeof winT.WebGLRenderer === 'function') return use(winT);
            return null;
        }
        function tryModule(name) {
            if (typeof DynamicManager === 'undefined') return Promise.resolve(null);
            return DynamicManager.loadModule(name).then(function (m) {
                var out = take(m);
                if (out) return out;
                return new Promise(function (resolve) {
                    setTimeout(function () { resolve(take(null)); }, 200);
                });
            }).catch(function () { return null; });
        }
        function loadScriptFallback() {
            return new Promise(function (resolve) {
                if (typeof window === 'undefined' || !window.document || !window.document.head) { resolve(null); return; }
                if (window.THREE && typeof window.THREE.WebGLRenderer === 'function') { resolve(use(window.THREE)); return; }
                var tried = 0;
                function poll() {
                    if (window.THREE && typeof window.THREE.WebGLRenderer === 'function') {
                        resolve(use(window.THREE));
                        return;
                    }
                    tried += 1;
                    if (tried < 25) setTimeout(poll, 80);
                    else resolve(null);
                }
                var script = document.createElement('script');
                script.src = 'https://unpkg.com/three@0.160.0/build/three.min.js';
                script.crossOrigin = 'anonymous';
                script.onload = function () { setTimeout(poll, 50); };
                script.onerror = function () {
                    var s2 = document.createElement('script');
                    s2.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
                    s2.crossOrigin = 'anonymous';
                    s2.onload = function () { setTimeout(poll, 50); };
                    s2.onerror = function () { resolve(null); };
                    document.head.appendChild(s2);
                };
                document.head.appendChild(script);
            });
        }
        return tryModule('three.webgl').then(function (T) {
            if (T) return T;
            return tryModule('three.js');
        }).then(function (T) {
            if (T) return T;
            return loadScriptFallback();
        }).then(function (T) {
            if (T) return T;
            return Promise.reject(new Error('Three.js 加载失败：未找到含 WebGLRenderer 的构建'));
        });
    }

    /**
     * 停止当前运行中的会话（rAF、dispose、移除 DOM）
     */
    function _stopCurrentSession() {
        if (!_currentSession) return;
        var s = _currentSession;
        _currentSession = null;
        if (s.animationId != null) cancelAnimationFrame(s.animationId);
        if (s.scene) {
            s.scene.traverse(function (obj) {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
                    else obj.material.dispose();
                }
            });
        }
        if (s.resizeObserver && s.container) {
            try { s.resizeObserver.disconnect(); } catch (e) {}
        }
        if (s.renderer) {
            s.renderer.dispose();
            if (s.renderer.domElement && s.renderer.domElement.parentNode) {
                s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
            }
        }
        _clearInputState();
        _log('info', '会话已停止');
    }

    function _updateSessionSize(s) {
        if (!s || !s.container || !s.renderer || !s.camera) return;
        var w = s.container.clientWidth || 640;
        var h = s.container.clientHeight || 480;
        s.renderer.setSize(w, h);
        s.camera.aspect = w / h;
        s.camera.updateProjectionMatrix();
    }

    /** 对当前会话场景应用配置驱动行为（如 Rotate） */
    function _applyBuiltInBehaviours(dt) {
        if (!_currentSession || !_currentSession.scene) return;
        _currentSession.scene.traverse(function (obj) {
            var ud = obj.userData;
            if (!ud || !ud.behavior) return;
            if (ud.behavior === 'Rotate') {
                var p = ud.behaviorParams || {};
                var sx = (p.speedX != null) ? Number(p.speedX) : 0;
                var sy = (p.speedY != null) ? Number(p.speedY) : 0;
                var sz = (p.speedZ != null) ? Number(p.speedZ) : 0;
                obj.rotation.x += sx * dt;
                obj.rotation.y += sy * dt;
                obj.rotation.z += sz * dt;
            }
        });
    }

    /**
     * 固定步长逻辑步钩子：先应用配置驱动行为，再调用用户 onFixedStep，再调用脚本 onUpdate(dt)
     * @param {number} dt - 固定步长（秒）
     */
    function _onFixedStep(dt) {
        _applyBuiltInBehaviours(dt);
        if (_currentSession && typeof _currentSession.onFixedStep === 'function') {
            _currentSession.onFixedStep(dt);
        }
        if (_currentSession && _currentSession.scriptApi && typeof _currentSession.scriptApi.onUpdate === 'function') {
            try {
                _currentSession.scriptApi.onUpdate(dt);
            } catch (e) {
                _log('error', 'script onUpdate error', e);
            }
        }
    }

    /**
     * 从场景 JSON 构建 Three 场景（节点树 → Three.Object3D）
     * 节点格式：{ id?, children?, position?, rotation?, scale?, mesh?, color?, radius?, width?, height?, behavior?, behaviorParams? }
     * position/rotation/scale 为 [x,y,z]；rotation 为弧度。mesh: "Cube"|"Sphere"|"Plane"。
     * color 可选，十六进制数或 "#rrggbb"。Sphere 可选 radius；Plane 可选 width/height。
     * behavior 可选，如 "Rotate"；behaviorParams 为 { speedX?, speedY?, speedZ? }（弧度/秒），供固定步逻辑驱动。
     * @param {Object} sceneJson - 场景数据（根节点或含 root 的对象）
     * @param {Object} THREE - Three.js 命名空间
     * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera }}
     */
    function buildThreeScene(sceneJson, THREE) {
        var scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        var root = sceneJson && (sceneJson.root != null ? sceneJson.root : sceneJson);
        if (root) _addNodeToScene(scene, root, THREE);
        var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        camera.position.set(0, 0, 5);
        camera.lookAt(0, 0, 0);
        return { scene: scene, camera: camera };
    }

    function _addNodeToScene(parentObj3D, node, THREE) {
        var obj = new THREE.Group();
        obj.userData = obj.userData || {};
        if (node.id != null) obj.userData.nodeId = node.id;
        if (node.behavior) obj.userData.behavior = node.behavior;
        if (node.behaviorParams && typeof node.behaviorParams === 'object') obj.userData.behaviorParams = node.behaviorParams;
        if (node.position && Array.isArray(node.position)) obj.position.set(node.position[0], node.position[1], node.position[2]);
        if (node.rotation && Array.isArray(node.rotation)) obj.rotation.set(node.rotation[0], node.rotation[1], node.rotation[2]);
        if (node.scale && Array.isArray(node.scale)) obj.scale.set(node.scale[0], node.scale[1], node.scale[2]);
        var color = (node.color != null && node.color !== '') ? (typeof node.color === 'number' ? node.color : parseInt(String(node.color).replace(/^#/, '0x'), 16)) : 0x8b5cf6;
        if (node.mesh === 'Cube') {
            var geom = new THREE.BoxGeometry(1, 1, 1);
            var mat = new THREE.MeshBasicMaterial({ color: color });
            obj.add(new THREE.Mesh(geom, mat));
        } else if (node.mesh === 'Sphere') {
            var r = (node.radius != null && node.radius > 0) ? node.radius : 0.5;
            var g = new THREE.SphereGeometry(r, 32, 32);
            var m = new THREE.MeshBasicMaterial({ color: color });
            obj.add(new THREE.Mesh(g, m));
        } else if (node.mesh === 'Plane') {
            var pw = (node.width != null && node.width > 0) ? node.width : 1;
            var ph = (node.height != null && node.height > 0) ? node.height : 1;
            var pg = new THREE.PlaneGeometry(pw, ph);
            var pm = new THREE.MeshBasicMaterial({ color: color });
            obj.add(new THREE.Mesh(pg, pm));
        }
        parentObj3D.add(obj);
        if (node.children && Array.isArray(node.children)) {
            for (var i = 0; i < node.children.length; i++) _addNodeToScene(obj, node.children[i], THREE);
        }
    }

    /**
     * 按 manifest + scene 数据在容器内运行场景（不读盘，由调用方传入数据）
     * @param {Object} manifest - { version?, entryScene? } 仅作预留
     * @param {Object} sceneJson - 场景节点树，见 buildThreeScene
     * @param {HTMLElement} containerElement - 挂载 canvas 的 DOM 元素
     * @param {{ onFixedStep?: function(number), scriptCode?: string }} [options] - 可选；onFixedStep(dt) 每逻辑步调用；
     *   scriptCode 为一段求值为 { onStart?, onUpdate(dt)? } 的脚本，注入 Engine/Input/Entity/Scene 后执行
     * @returns {Promise<{ stop: function }>}
     */
    function runWithData(manifest, sceneJson, containerElement, options) {
        if (!containerElement || !containerElement.appendChild) {
            return Promise.reject(new Error('runWithData 需要有效的 DOM 容器'));
        }
        if (!sceneJson) return Promise.reject(new Error('runWithData 需要 sceneJson'));
        _stopCurrentSession();
        _clearInputState();
        return _loadThree().then(function (THREE) {
            var width = containerElement.clientWidth || 640;
            var height = containerElement.clientHeight || 480;
            var built = buildThreeScene(sceneJson, THREE);
            var scene = built.scene;
            var camera = built.camera;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            var nodeMap = {};
            scene.traverse(function (o) {
                if (o.userData && o.userData.nodeId != null) nodeMap[o.userData.nodeId] = o;
            });
            var canvas = document.createElement('canvas');
            containerElement.appendChild(canvas);
            var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1);
            var animationId = null;
            var lastTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            var accumulator = 0;
            function animate() {
                animationId = requestAnimationFrame(animate);
                var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                var deltaSec = (now - lastTime) / 1000;
                lastTime = now;
                accumulator += deltaSec;
                var steps = 0;
                while (accumulator >= FIXED_DT && steps < MAX_FIXED_STEPS_PER_FRAME) {
                    _onFixedStep(FIXED_DT);
                    accumulator -= FIXED_DT;
                    steps++;
                }
                renderer.render(scene, camera);
            }
            var session = { scene: scene, camera: camera, renderer: renderer, animationId: animationId, container: containerElement, nodeMap: nodeMap };
            if (options && typeof options.onFixedStep === 'function') session.onFixedStep = options.onFixedStep;
            if (options && typeof options.scriptCode === 'string' && options.scriptCode.length > 0) {
                var Engine = {
                    deltaTime: FIXED_DT,
                    getKey: getKey,
                    getMousePosition: getMousePosition,
                    getMouseButton: getMouseButton,
                    KEY: { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, SPACE: 32, ENTER: 13, ESC: 27, A: 65, D: 68, W: 87, S: 83 }
                };
                var Input = { getKey: getKey, getMousePosition: getMousePosition, getMouseButton: getMouseButton };
                var Entity = {
                    getNode: function (id) {
                        return (session.nodeMap && session.nodeMap[id]) || null;
                    }
                };
                var Scene = { getRoot: function () { return session.scene; } };
                try {
                    var fn = new Function('Engine', 'Input', 'Entity', 'Scene', 'return (' + options.scriptCode + ');');
                    var api = fn(Engine, Input, Entity, Scene);
                    if (api && typeof api === 'object') session.scriptApi = api;
                } catch (e) {
                    _log('error', 'script load error', e);
                }
            }
            _currentSession = session;
            if (session.scriptApi && typeof session.scriptApi.onStart === 'function') {
                try {
                    session.scriptApi.onStart();
                } catch (e) {
                    _log('error', 'script onStart error', e);
                }
            }
            if (typeof ResizeObserver !== 'undefined') {
                session.resizeObserver = new ResizeObserver(function () { _updateSessionSize(_currentSession); });
                session.resizeObserver.observe(containerElement);
            }
            _updateSessionSize(session);
            animate();
            _log('info', 'runWithData 已启动');
            return {
                stop: function () {
                    if (_currentSession && _currentSession.animationId === animationId) _stopCurrentSession();
                }
            };
        });
    }

    /**
     * 在指定容器内运行默认场景（立方体 + 相机 + 渲染循环）
     * @param {HTMLElement} containerElement - 挂载 canvas 的 DOM 元素
     * @returns {Promise<{ stop: function }>} 返回带 stop 方法的对象，用于停止运行
     */
    function runInContainer(containerElement) {
        if (!containerElement || !containerElement.appendChild) {
            return Promise.reject(new Error('runInContainer 需要有效的 DOM 容器'));
        }
        _stopCurrentSession();
        _clearInputState();
        return _loadThree().then(function (THREE) {
            var width = containerElement.clientWidth || 640;
            var height = containerElement.clientHeight || 480;
            var scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1a1a2e);
            var camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
            camera.position.set(0, 0, 5);
            camera.lookAt(0, 0, 0);
            var geometry = new THREE.BoxGeometry(1, 1, 1);
            var material = new THREE.MeshBasicMaterial({ color: 0x8b5cf6 });
            var cube = new THREE.Mesh(geometry, material);
            scene.add(cube);
            var canvas = document.createElement('canvas');
            containerElement.appendChild(canvas);
            var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1);
            var animationId = null;
            var lastTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            var accumulator = 0;
            function animate() {
                animationId = requestAnimationFrame(animate);
                var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                var deltaSec = (now - lastTime) / 1000;
                lastTime = now;
                accumulator += deltaSec;
                var steps = 0;
                while (accumulator >= FIXED_DT && steps < MAX_FIXED_STEPS_PER_FRAME) {
                    _onFixedStep(FIXED_DT);
                    accumulator -= FIXED_DT;
                    steps++;
                }
                renderer.render(scene, camera);
            }
            var session = { scene: scene, camera: camera, renderer: renderer, animationId: animationId, container: containerElement };
            session.onFixedStep = function () { cube.rotation.x += 0.005; cube.rotation.y += 0.01; };
            _currentSession = session;
            if (typeof ResizeObserver !== 'undefined') {
                session.resizeObserver = new ResizeObserver(function () { _updateSessionSize(_currentSession); });
                session.resizeObserver.observe(containerElement);
            }
            _updateSessionSize(session);
            animate();
            _log('info', 'runInContainer 已启动');
            return {
                stop: function () {
                    if (_currentSession && _currentSession.animationId === animationId) _stopCurrentSession();
                }
            };
        });
    }

    function __init__() {
        _log('info', 'Service initialized');
        _initialized = true;
    }

    function __start__() {
        if (_running) {
            _log('warn', 'Service already running');
            return;
        }
        _running = true;
        _log('info', 'Service started');
    }

    function __stop__() {
        if (!_running) {
            _log('warn', 'Service not running');
            return;
        }
        _stopCurrentSession();
        _running = false;
        _log('info', 'Service stopped');
    }

    function __status__() {
        return {
            running: _running,
            initialized: _initialized,
            hasSession: _currentSession != null,
            threeLoaded: _THREE != null
        };
    }

    function __info__() {
        return {
            name: 'KiteEngine',
            version: '1.0.0',
            description: 'KiteEngine 3D 游戏引擎核心服务（服务即核心）'
        };
    }

    /** 对外 API：供安装后由 Player/编辑器 调用 */
    var KiteEngineAPI = {
        runInContainer: runInContainer,
        runWithData: runWithData,
        buildThreeScene: buildThreeScene,
        stopCurrentSession: _stopCurrentSession,
        getStatus: __status__,
        isRunning: function () { return _running; },
        /* 输入：调用方在容器上监听 DOM 事件后调用 feed* 写入，脚本通过 get* 读取 */
        feedKeyDown: feedKeyDown,
        feedKeyUp: feedKeyUp,
        feedMouseMove: feedMouseMove,
        feedMouseButton: feedMouseButton,
        getKey: getKey,
        getMousePosition: getMousePosition,
        getMouseButton: getMouseButton,
        /** 固定步长（秒），供调用方参考 */
        FIXED_DT: FIXED_DT,
        /** 常用按键码（与 KeyboardEvent.keyCode 一致），供 getKey 使用 */
        KEY: { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, SPACE: 32, ENTER: 13, ESC: 27, A: 65, D: 68, W: 87, S: 83 }
    };

    if (typeof window !== 'undefined') {
        window.__ZerOS_ServerExpansion_Register__({
            __init__: __init__,
            __start__: __start__,
            __stop__: __stop__,
            __status__: __status__,
            __info__: __info__
        });
        window.KiteEngineAPI = KiteEngineAPI;
    }
})();
