// 系统公告通知获取服务
// 每隔 3 分钟请求公告 API，按 data.subTime 去重，新公告按等级处理；已接收时间存储到 LStorage 持久化
// 公告 API 地址待定，响应格式：response.data { level(0-2), title, content, subTime }

(function () {
    'use strict';

    /** 公告 API 地址（待定，正式上线前需替换） */
    const ANNOUNCE_API_URL = 'http://zeros.xin/api/notice';
    /** 轮询间隔：3 分钟 */
    const POLL_INTERVAL_MS = 3 * 60 * 1000;
    /** 系统公告通知使用的 PID（D/server 服务约定使用 ProcessManager.SERVER_SERVICE_PID，内核对该 PID 放行） */
    const SYSTEM_PID = (typeof ProcessManager !== 'undefined' && ProcessManager.SERVER_SERVICE_PID !== undefined)
        ? ProcessManager.SERVER_SERVICE_PID
        : 10000;
    /** LStorage 中存储公告历史的键名 */
    const STORAGE_KEY = '_server_notice_history';

    var _timerId = null;
    var _running = false;
    var _lastFetchTime = null;
    var _lastSubTime = null;
    var _lastError = null;

    /** 已接收公告的 subTime 列表（持久化到 LStorage） */
    var _receivedTimes = [];

    /**
     * 从 LStorage 加载历史记录
     * @returns {Promise<string[]>}
     */
    function loadFromStorage() {
        return new Promise(async (resolve) => {
            if (typeof LStorage === 'undefined' || typeof LStorage.getSystemStorage !== 'function') {
                resolve([]);
                return;
            }
            try {
                const data = await LStorage.getSystemStorage(STORAGE_KEY);
                if (data && Array.isArray(data)) {
                    _receivedTimes = data;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.debug('server-announcement', `从 LStorage 加载了 ${data.length} 条公告历史`);
                    }
                }
                resolve(_receivedTimes.slice());
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-announcement', '加载公告历史失败: ' + e.message);
                }
                resolve([]);
            }
        });
    }

    /**
     * 保存历史记录到 LStorage
     * @returns {Promise<void>}
     */
    function saveToStorage() {
        return new Promise(async (resolve) => {
            if (typeof LStorage === 'undefined' || typeof LStorage.setSystemStorage !== 'function') {
                resolve();
                return;
            }
            try {
                await LStorage.setSystemStorage(STORAGE_KEY, _receivedTimes);
                resolve();
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('server-announcement', '保存公告历史失败: ' + e.message);
                }
                resolve();
            }
        });
    }

    /**
     * 获取已接收的公告发布时间列表
     * @returns {Promise<string[]>}
     */
    function getReceivedTimes() {
        return Promise.resolve(_receivedTimes.slice());
    }

    /**
     * 将 subTime 追加到已接收列表（持久化到 LStorage）
     * @param {string} subTime
     * @returns {Promise<void>}
     */
    function addReceivedTime(subTime) {
        if (_receivedTimes.indexOf(subTime) >= 0) return Promise.resolve();
        _receivedTimes.push(subTime);
        saveToStorage();
        return Promise.resolve();
    }

    /**
     * 按公告等级处理新公告（逻辑待定，当前为占位：等级 2 弹通知，0/1 仅打日志或轻量提示）
     * @param {{ level: number, title: string, content: string, subTime: string }} data
     */
    function processAnnouncement(data) {
        var level = typeof data.level === 'number' ? data.level : 0;
        var title = (data.title != null) ? String(data.title) : '';
        var content = (data.content != null) ? String(data.content) : '';

        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-announcement', '处理公告 level=' + level + ' subTime=' + (data.subTime || '') + ' title=' + title);
        }

        // 等级 2：严重 — 弹系统通知；等级 0/1：普通 — 可仅打日志或轻量提示（待定）
        // createNotification 为 async，需处理 Promise 拒绝，避免未捕获异常
        var notify = function (durationMs) {
            if (typeof NotificationManager === 'undefined' || typeof NotificationManager.createNotification !== 'function') return;
            var p = NotificationManager.createNotification(SYSTEM_PID, {
                type: 'snapshot',
                title: title || '系统公告',
                content: content,
                duration: durationMs
            });
            if (p && typeof p.catch === 'function') {
                p.catch(function (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('server-announcement', '创建通知失败: ' + (e && e.message));
                    }
                });
            }
        };
        if (level === 2) {
            notify(0);
        } else if (level === 1) {
            notify(8000);
        } else {
            // level 0：仅记录，不弹窗（可按需求改为弹通知）
        }
    }

    /**
     * 执行一次公告拉取：请求 API → 解析 data → 按 subTime 去重 → 新公告处理并保存时间
     */
    function fetchOnce() {
        if (!ANNOUNCE_API_URL) {
            _lastError = 'ANNOUNCE_API_URL 未配置';
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('server-announcement', _lastError);
            }
            return;
        }

        _lastFetchTime = Date.now();
        _lastError = null;

        var req = typeof fetch !== 'undefined' ? fetch(ANNOUNCE_API_URL) : null;
        if (!req || typeof req.then !== 'function') {
            _lastError = 'fetch 不可用';
            return;
        }

        req.then(function (res) {
            if (!res || !res.ok) {
                _lastError = 'HTTP ' + (res ? res.status : 'unknown');
                return null;
            }
            return res.json();
        }).then(function (body) {
            if (!body || typeof body !== 'object') return;
            var data = body.data;
            if (data == null) return;
            // 支持 data 为单条对象或数组（多条）
            var list = Array.isArray(data) ? data : [data];
            var seq = Promise.resolve();
            for (var i = 0; i < list.length; i++) {
                var item = list[i];
                if (!item || typeof item !== 'object') continue;
                var subTime = item.subTime != null ? String(item.subTime) : '';
                if (!subTime) continue;
                seq = seq.then(function (st, d) {
                    return getReceivedTimes().then(function (received) {
                        if (received.indexOf(st) >= 0) {
                            _lastSubTime = st;
                            return;
                        }
                        processAnnouncement({
                            level: d.level,
                            title: d.title,
                            content: d.content,
                            subTime: st
                        });
                        _lastSubTime = st;
                        return addReceivedTime(st);
                    });
                }.bind(null, subTime, item));
            }
            return seq;
        }).catch(function (e) {
            _lastError = e && (e.message || String(e)) || 'request failed';
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.warn('server-announcement', '拉取公告失败: ' + _lastError);
            }
        });
    }

    function __init__() {
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-announcement', 'init');
        }
        loadFromStorage();
    }

    function __start__() {
        if (_running) return;
        _running = true;
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-announcement', 'start, interval=' + (POLL_INTERVAL_MS / 1000) + 's');
        }
        fetchOnce();
        _timerId = setInterval(fetchOnce, POLL_INTERVAL_MS);
    }

    function __stop__() {
        if (!_running) return;
        _running = false;
        if (_timerId != null) {
            clearInterval(_timerId);
            _timerId = null;
        }
        if (typeof KernelLogger !== 'undefined') {
            KernelLogger.info('server-announcement', 'stop');
        }
    }

    function __status__() {
        return {
            running: _running,
            lastFetchTime: _lastFetchTime,
            lastSubTime: _lastSubTime,
            lastError: _lastError,
            apiUrl: ANNOUNCE_API_URL ? '(已配置)' : '(未配置)'
        };
    }

    function __info__() {
        return {
            name: 'SystemNotice',
            version: '1.0',
            description: 'ZerOS系统公告通知获取'
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
