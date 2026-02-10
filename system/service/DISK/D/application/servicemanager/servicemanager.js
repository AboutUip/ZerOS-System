// ZerOS 系统服务管理程序
// 用于查看、启动、停止 D/server 下的系统服务，严格遵守 ZerOS 开发约定
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function (window) {
    'use strict';

    const SERVICEMANAGER = {
        pid: null,
        window: null,
        windowId: null,

        /** 事件处理器 ID 列表（用于 __exit__ 清理） */
        eventHandlers: [],

        /** 当前选中的服务 id */
        _selectedId: null,

        /** 自启计划任务映射：serviceId -> taskId（仅 SYSTEM_STARTUP + service 类型且 enabled） */
        _autoStartMap: {},

        /** 语言变更监听器取消函数 */
        _languageChangeUnsubscribe: null,

        /** 进程管理器注入的 kernelAPI（通过 Server.* 调用服务，需 SERVER_SERVICE_MANAGE 权限） */
        _kernelAPI: null,

        /** 授予权限后自动刷新轮询（列表为空时每 1.5s 重试，直到加载到服务或达到次数） */
        _refreshPollTimer: null,
        _refreshPollCount: 0,
        _REFRESH_POLL_INTERVAL_MS: 1500,
        _REFRESH_POLL_MAX: 15,

        /** 服务状态定时刷新（列表和当前选中项状态，每 3s 刷新一次） */
        _statusRefreshTimer: null,
        _STATUS_REFRESH_INTERVAL_MS: 3000,
        _refreshingServiceList: false,

        /** 是否具备服务扩展 API（kernelAPI 可用且支持 Server.*） */
        _hasServerAPI: function () {
            return this._kernelAPI && typeof this._kernelAPI.call === 'function';
        },

        /** 多语言文案（可选） */
        _getText: function (key, fallback) {
            try {
                const LanguagesExpansion = (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function')
                    ? POOL.__GET__('KERNEL_GLOBAL_POOL', 'LanguagesExpansion')
                    : (typeof window !== 'undefined' ? window.LanguagesExpansion : null);
                if (LanguagesExpansion && typeof LanguagesExpansion.getText === 'function') {
                    const value = LanguagesExpansion.getText(key);
                    if (value && value !== key) return value;
                }
            } catch (e) {}
            return fallback != null ? fallback : key;
        },

        __init__: async function (pid, initArgs) {
            this.pid = pid;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('SERVICEMANAGER', '系统服务管理程序初始化');
            }

            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');

            this.window = document.createElement('div');
            this.window.className = 'servicemanager-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = 'display: flex; flex-direction: column; overflow: hidden; min-width: 520px; min-height: 420px;';

            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('servicemanager');
                }
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: this._getText('SERVICEMANAGER_TITLE', '系统服务管理'),
                    icon: icon,
                    onClose: function () {}
                });
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }

            this._buildUI();
            guiContainer.appendChild(this.window);

            this._registerEventHandlers();
            this._refreshServiceList();
            this._startStatusRefreshTimer();

            var LanguagesExpansion = (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function')
                ? POOL.__GET__('KERNEL_GLOBAL_POOL', 'LanguagesExpansion')
                : (typeof window !== 'undefined' ? window.LanguagesExpansion : null);
            if (LanguagesExpansion && typeof LanguagesExpansion.onLanguageChange === 'function') {
                this._languageChangeUnsubscribe = LanguagesExpansion.onLanguageChange(function () {
                    this._refreshAllUITexts();
                }.bind(this));
            }
        },

        __exit__: async function () {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('SERVICEMANAGER', '系统服务管理程序退出');
            }
            this._stopRefreshPoll();
            this._stopStatusRefreshTimer();
            if (this._languageChangeUnsubscribe && typeof this._languageChangeUnsubscribe === 'function') {
                this._languageChangeUnsubscribe();
                this._languageChangeUnsubscribe = null;
            }
            if (typeof EventManager !== 'undefined') {
                for (var i = 0; i < this.eventHandlers.length; i++) {
                    try {
                        EventManager.unregisterEventHandler(this.pid, this.eventHandlers[i]);
                    } catch (e) {}
                }
            }
            this.eventHandlers = [];
            if (this.window && this._onWindowFocusRefresh) {
                this.window.removeEventListener('focus', this._onWindowFocusRefresh);
                this._onWindowFocusRefresh = null;
            }
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                GUIManager.unregisterWindow(this.windowId);
            } else if (this.pid && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
            this.window = null;
            this.windowId = null;
        },

        __info__: function () {
            return {
                name: '系统服务管理',
                type: 'GUI',
                version: '1.0.0',
                description: '查看、启动、停止 D/server 下的系统服务',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_CREATE,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_MANAGE,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_STARTUP,
                    PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE
                ] : [],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        },

        _buildUI: function () {
            var toolbar = document.createElement('div');
            toolbar.className = 'servicemanager-toolbar';
            toolbar.style.cssText = 'flex-shrink: 0; min-height: 40px; max-height: 40px; height: 40px; box-sizing: border-box; display: flex; align-items: center; padding: 0 12px; gap: 8px; border-bottom: 1px solid var(--theme-border, rgba(139,92,246,0.25));';
            var btnRefresh = document.createElement('button');
            btnRefresh.className = 'servicemanager-btn servicemanager-btn-refresh';
            btnRefresh.textContent = this._getText('SERVICEMANAGER_REFRESH', '刷新列表');
            btnRefresh.dataset.action = 'refresh';
            toolbar.appendChild(btnRefresh);
            this.window.appendChild(toolbar);

            /* 窗口获得焦点时刷新列表，使授予权限后无需手动点刷新即可显示服务 */
            var self = this;
            var refreshOnFocusTimer = null;
            this._onWindowFocusRefresh = function () {
                if (refreshOnFocusTimer) clearTimeout(refreshOnFocusTimer);
                refreshOnFocusTimer = setTimeout(function () {
                    refreshOnFocusTimer = null;
                    if (self.window && self._hasServerAPI()) {
                        self._refreshServiceList();
                    }
                }, 200);
            };
            if (this.window) {
                this.window.addEventListener('focus', this._onWindowFocusRefresh);
            }

            var main = document.createElement('div');
            main.className = 'servicemanager-main';
            main.style.cssText = 'flex: 1; display: flex; overflow: hidden; min-height: 0;';

            var listWrap = document.createElement('div');
            listWrap.className = 'servicemanager-list-wrap';
            listWrap.style.cssText = 'width: 240px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--theme-border, rgba(139,92,246,0.25));';
            var listLabel = document.createElement('div');
            listLabel.className = 'servicemanager-list-label';
            listLabel.style.cssText = 'height: 32px; line-height: 32px; padding: 0 10px; font-weight: 600; flex-shrink: 0;';
            listLabel.textContent = this._getText('SERVICEMANAGER_SERVICES', '服务列表');
            listWrap.appendChild(listLabel);
            var listBox = document.createElement('div');
            listBox.className = 'servicemanager-list';
            listBox.dataset.role = 'list';
            listBox.style.cssText = 'flex: 1; min-height: 0; overflow-y: auto;';
            listWrap.appendChild(listBox);
            main.appendChild(listWrap);

            var detailWrap = document.createElement('div');
            detailWrap.className = 'servicemanager-detail-wrap';
            detailWrap.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden;';
            var detailLabel = document.createElement('div');
            detailLabel.className = 'servicemanager-detail-label';
            detailLabel.style.cssText = 'height: 32px; line-height: 32px; padding: 0 10px; font-weight: 600; flex-shrink: 0;';
            detailLabel.textContent = this._getText('SERVICEMANAGER_DETAIL', '服务详情');
            detailWrap.appendChild(detailLabel);
            var detailContent = document.createElement('div');
            detailContent.className = 'servicemanager-detail-content';
            detailContent.dataset.role = 'detail';
            detailContent.style.cssText = 'flex: 1; min-height: 0; overflow-y: auto; padding: 10px; box-sizing: border-box;';
            detailWrap.appendChild(detailContent);
            main.appendChild(detailWrap);

            this.window.appendChild(main);
        },

        /** 语言切换时刷新所有界面文案 */
        _refreshAllUITexts: function () {
            if (!this.window) return;
            var titleEl = this.window.querySelector('.zos-window-title');
            if (titleEl) titleEl.textContent = this._getText('SERVICEMANAGER_TITLE', '系统服务管理');
            var refreshBtn = this.window.querySelector('.servicemanager-btn-refresh');
            if (refreshBtn) refreshBtn.textContent = this._getText('SERVICEMANAGER_REFRESH', '刷新列表');
            var listLabel = this.window.querySelector('.servicemanager-list-label');
            if (listLabel) listLabel.textContent = this._getText('SERVICEMANAGER_SERVICES', '服务列表');
            var detailLabel = this.window.querySelector('.servicemanager-detail-label');
            if (detailLabel) detailLabel.textContent = this._getText('SERVICEMANAGER_DETAIL', '服务详情');
            this._refreshServiceList();
        },

        _registerEventHandlers: function () {
            var self = this;
            var listEl = this.window.querySelector('[data-role="list"]');
            if (!listEl) return;

            if (typeof EventManager !== 'undefined') {
                var refreshBtn = this.window.querySelector('.servicemanager-btn-refresh');
                if (refreshBtn) {
                    var refreshId = EventManager.registerElementEvent(this.pid, refreshBtn, 'click', function () {
                        self._refreshServiceList();
                    });
                    this.eventHandlers.push(refreshId);
                }
                var delegateId = EventManager.registerElementEvent(this.pid, listEl, 'click', function (e) {
                    var row = e.target.closest('[data-service-id]');
                    if (!row) return;
                    self._selectService(row.dataset.serviceId);
                });
                this.eventHandlers.push(delegateId);

                var detailWrap = this.window.querySelector('.servicemanager-detail-wrap');
                if (detailWrap) {
                    var detailClickId = EventManager.registerElementEvent(this.pid, detailWrap, 'click', function (e) {
                        var btn = e.target.closest('[data-action]');
                        if (!btn || !self._selectedId) return;
                        e.preventDefault();
                        if (btn.dataset.action === 'toggle-autostart') {
                            self._toggleAutoStart(self._selectedId);
                        } else if (btn.dataset.action === 'start') {
                            self._startService(self._selectedId);
                        } else if (btn.dataset.action === 'stop') {
                            self._stopService(self._selectedId);
                        } else if (btn.dataset.action === 'save-config') {
                            self._saveServiceConfig(self._selectedId);
                        }
                    });
                    this.eventHandlers.push(detailClickId);
                }
            }
        },

        /** 切换服务自启（与计划任务联动：创建/删除 SYSTEM_STARTUP 类型的 service 任务） */
        _toggleAutoStart: async function (serviceId) {
            var taskId = this._autoStartMap[serviceId];
            var self = this;
            try {
                if (typeof POOL === 'undefined' || typeof POOL.__GET__ !== 'function') {
                    self._showMessage(self._getText('SERVICEMANAGER_NO_POOL', '系统不可用'));
                    return;
                }
                var pm = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                if (!pm || typeof pm.callKernelAPI !== 'function') {
                    self._showMessage(self._getText('SERVICEMANAGER_NO_PM', '进程管理器不可用'));
                    return;
                }
                if (taskId) {
                    await pm.callKernelAPI(self.pid, 'ScheduleTask.delete', [taskId]);
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('SERVICEMANAGER', '已关闭服务自启: ' + serviceId);
                    }
                } else {
                    await pm.callKernelAPI(self.pid, 'ScheduleTask.create', [{
                        taskType: 'service',
                        serviceId: serviceId,
                        serviceAction: 'start',
                        triggerType: 'SYSTEM_STARTUP',
                        triggerConfig: {},
                        enabled: true
                    }, true]);
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('SERVICEMANAGER', '已开启服务自启: ' + serviceId);
                    }
                }
                await self._refreshServiceList();
            } catch (e) {
                var msg = e && (e.message || String(e)) || self._getText('SERVICEMANAGER_OPERATION_FAIL', '操作失败');
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('SERVICEMANAGER', '自启切换失败: ' + msg);
                }
                self._showMessage(msg);
                await self._refreshServiceList();
            }
        },

        _showMessage: function (text) {
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                try {
                    NotificationManager.createNotification(this.pid, { title: '服务管理', content: text, type: 'snapshot', duration: 4000 });
                } catch (err) {}
            } else if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                try {
                    GUIManager.showAlert(text, '服务管理', 'info');
                } catch (err) {}
            }
        },

        /** 获取计划任务列表并更新自启映射（SYSTEM_STARTUP + service 且 enabled） */
        _updateAutoStartMap: async function () {
            this._autoStartMap = {};
            try {
                if (typeof POOL === 'undefined' || typeof POOL.__GET__ !== 'function') return;
                var pm = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                if (!pm || typeof pm.callKernelAPI !== 'function') return;
                var tasks = await pm.callKernelAPI(this.pid, 'ScheduleTask.getAll', []);
                if (!Array.isArray(tasks)) return;
                for (var t = 0; t < tasks.length; t++) {
                    var task = tasks[t];
                    if (task.taskType === 'service' && task.triggerType === 'SYSTEM_STARTUP' && task.enabled && task.serviceId) {
                        this._autoStartMap[task.serviceId] = task.id;
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('SERVICEMANAGER', '获取计划任务失败: ' + (e && e.message));
                }
            }
        },

        /** 对“自启且未运行”的服务调用 Server.start（补足计划任务可能未执行到的 init/start） */
        _startAutoStartServicesIfNeeded: async function (ids) {
            if (!this._hasServerAPI() || !ids || !Array.isArray(ids)) return;
            var api = this._kernelAPI;
            for (var i = 0; i < ids.length; i++) {
                var id = ids[i];
                if (!this._autoStartMap[id]) continue;
                try {
                    var started = await api.call('Server.isStarted', [id]);
                    if (started) continue;
                    await api.call('Server.start', [id]);
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info('SERVICEMANAGER', '自启服务已拉起: ' + id);
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('SERVICEMANAGER', '自启服务拉起失败: ' + id + ', ' + (e && e.message));
                    }
                }
            }
        },

        _refreshServiceList: async function () {
            if (this._refreshingServiceList) return;
            this._refreshingServiceList = true;
            var listEl = this.window.querySelector('[data-role="list"]');
            var detailEl = this.window.querySelector('[data-role="detail"]');
            try {
                if (!listEl) return;

                if (!this._hasServerAPI()) {
                listEl.innerHTML = '<div class="servicemanager-empty">' + (this._getText('SERVICEMANAGER_NO_EXPANSION', 'ServerExpansion 未加载或缺少权限（授予权限后将自动刷新）')) + '</div>';
                if (detailEl) detailEl.innerHTML = '';
                this._startRefreshPoll();
                return;
            }

            var api = this._kernelAPI;
            try {
                await api.call('Server.loadAll', []);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('SERVICEMANAGER', 'Server.loadAll 失败: ' + (e && e.message));
                }
            }

            await this._updateAutoStartMap();
            var ids = [];
            try {
                ids = (await api.call('Server.listServices', [])) || [];
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('SERVICEMANAGER', 'Server.listServices 失败', e);
            }
            await this._startAutoStartServicesIfNeeded(ids);
            listEl.innerHTML = '';
            if (ids.length === 0) {
                listEl.innerHTML = '<div class="servicemanager-empty">' + (this._getText('SERVICEMANAGER_NO_SERVICES', '暂无已加载的服务（授予权限后将自动刷新）')) + '</div>';
                if (detailEl) detailEl.innerHTML = '';
                this._startRefreshPoll();
                return;
            }
            this._stopRefreshPoll();

            for (var i = 0; i < ids.length; i++) {
                var id = ids[i];
                var row = document.createElement('div');
                row.className = 'servicemanager-list-item';
                row.dataset.serviceId = id;
                row.style.cssText = 'display: flex; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--theme-border, rgba(139,92,246,0.15)); min-height: 40px; box-sizing: border-box; cursor: pointer;';
                var label = document.createElement('span');
                label.className = 'servicemanager-item-label';
                label.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px;';
                label.textContent = id;
                row.appendChild(label);
                listEl.appendChild(row);
            }

            if (this._selectedId && ids.indexOf(this._selectedId) >= 0) {
                this._selectService(this._selectedId);
            } else {
                this._selectedId = null;
                if (detailEl) detailEl.innerHTML = '<div class="servicemanager-detail-placeholder">' + (this._getText('SERVICEMANAGER_SELECT_SERVICE', '请从左侧选择一项服务')) + '</div>';
            }
            } finally {
                this._refreshingServiceList = false;
            }
        },

        _startStatusRefreshTimer: function () {
            var self = this;
            this._stopStatusRefreshTimer();
            this._statusRefreshTimer = setInterval(function () {
                if (!self.window || !self.window.parentElement) return;
                if (!self._hasServerAPI()) return;
                self._refreshServiceList();
            }, this._STATUS_REFRESH_INTERVAL_MS);
        },

        _stopStatusRefreshTimer: function () {
            if (this._statusRefreshTimer) {
                clearInterval(this._statusRefreshTimer);
                this._statusRefreshTimer = null;
            }
        },

        _startRefreshPoll: function () {
            var self = this;
            this._stopRefreshPoll();
            this._refreshPollCount = 0;
            this._refreshPollTimer = setInterval(function () {
                self._refreshPollCount++;
                if (self._refreshPollCount > self._REFRESH_POLL_MAX) {
                    self._stopRefreshPoll();
                    return;
                }
                self._refreshServiceList();
            }, this._REFRESH_POLL_INTERVAL_MS);
        },

        _stopRefreshPoll: function () {
            if (this._refreshPollTimer) {
                clearInterval(this._refreshPollTimer);
                this._refreshPollTimer = null;
            }
            this._refreshPollCount = 0;
        },

        _selectService: function (id) {
            this._selectedId = id;
            var listEl = this.window.querySelector('[data-role="list"]');
            var detailEl = this.window.querySelector('[data-role="detail"]');
            if (listEl) {
                var items = listEl.querySelectorAll('[data-service-id]');
                for (var i = 0; i < items.length; i++) {
                    items[i].classList.toggle('servicemanager-item-selected', items[i].dataset.serviceId === id);
                }
            }
            if (!detailEl) return;

            if (!this._hasServerAPI()) {
                detailEl.innerHTML = '';
                return;
            }

            var api = this._kernelAPI;
            var infoPromise = api.call('Server.info', [id]);
            var statusPromise = api.call('Server.status', [id]);
            var listConfigPromise = api.call('Server.listConfig', [id]).catch(function () { return []; });
            detailEl.innerHTML = '<div class="servicemanager-detail-loading">' + (this._getText('SERVICEMANAGER_LOADING', '加载中...')) + '</div>';

            var self = this;
            Promise.all([infoPromise, statusPromise, listConfigPromise]).then(function (results) {
                var info = results[0];
                var status = results[1];
                var configItems = Array.isArray(results[2]) ? results[2] : [];
                return api.call('Server.isStarted', [id]).then(function (started) {
                    return { info: info, status: status, started: started, configItems: configItems };
                });
            }).then(function (data) {
                var info = data.info;
                var status = data.status;
                var started = data.started;
                var configItems = data.configItems || [];
                var autoStart = !!self._autoStartMap[id];
                var runningText = started ? (self._getText('SERVICEMANAGER_RUNNING', '运行中')) : (self._getText('SERVICEMANAGER_STOPPED', '已停止'));
                var badgeClass = started ? 'servicemanager-badge-running' : 'servicemanager-badge-stopped';
                var html = '<div class="servicemanager-detail-inner">';
                html += '<header class="servicemanager-detail-header">';
                html += '<h2 class="servicemanager-detail-title">' + (self._escapeHtml(id)) + '</h2>';
                html += '<span class="servicemanager-detail-badge ' + badgeClass + '">' + (self._escapeHtml(runningText)) + '</span>';
                html += '</header>';
                html += '<div class="servicemanager-detail-card">';
                html += '<div class="servicemanager-detail-card-title">' + (self._getText('SERVICEMANAGER_OPERATIONS', '操作')) + '</div>';
                html += '<div class="servicemanager-detail-card-body"><div class="servicemanager-detail-actions">';
                html += '<button type="button" class="servicemanager-btn servicemanager-btn-start" data-action="start"' + (started ? ' disabled' : '') + '>' + (self._getText('SERVICEMANAGER_START', '启动')) + '</button>';
                html += '<button type="button" class="servicemanager-btn servicemanager-btn-stop" data-action="stop"' + (!started ? ' disabled' : '') + '>' + (self._getText('SERVICEMANAGER_STOP', '停止')) + '</button>';
                html += '</div></div></div>';
                if (configItems.length > 0) {
                    html += '<div class="servicemanager-detail-card servicemanager-detail-card-config" data-role="config-card">';
                    html += '<div class="servicemanager-detail-card-title">' + (self._getText('SERVICEMANAGER_CONFIG', '配置')) + '</div>';
                    html += '<div class="servicemanager-detail-card-body">';
                    for (var c = 0; c < configItems.length; c++) {
                        var item = configItems[c];
                        var k = (item.key || '').replace(/"/g, '&quot;');
                        var lab = self._escapeHtml(item.label || item.key || '');
                        var typ = (item.type || 'text');
                        var val = item.value;
                        if (typ === 'boolean') {
                            html += '<div class="servicemanager-config-row"><label><input type="checkbox" data-config-key="' + k + '" data-config-type="boolean"' + (val ? ' checked' : '') + '>' + lab + '</label></div>';
                        } else if (typ === 'number') {
                            html += '<div class="servicemanager-config-row"><label>' + lab + '</label><input type="number" data-config-key="' + k + '" data-config-type="number" value="' + self._escapeHtml(String(val != null ? val : '')) + '"></div>';
                        } else {
                            html += '<div class="servicemanager-config-row"><label>' + lab + '</label><input type="text" data-config-key="' + k + '" data-config-type="text" value="' + self._escapeHtml(String(val != null ? val : '')) + '"></div>';
                        }
                    }
                    html += '<button type="button" class="servicemanager-btn servicemanager-btn-save" data-action="save-config">' + (self._getText('SERVICEMANAGER_SAVE_CONFIG', '保存配置')) + '</button>';
                    html += '</div></div>';
                }
                html += '<div class="servicemanager-detail-card">';
                html += '<div class="servicemanager-detail-card-title">' + (self._getText('SERVICEMANAGER_AUTOSTART', '自启')) + '</div>';
                html += '<div class="servicemanager-detail-card-body">';
                html += '<div class="servicemanager-autostart-row"><input type="checkbox" id="servicemanager-autostart-' + (self._escapeHtml(id)) + '" data-action="toggle-autostart"' + (autoStart ? ' checked' : '') + '><label for="servicemanager-autostart-' + (self._escapeHtml(id)) + '">' + (self._getText('SERVICEMANAGER_AUTOSTART_LABEL', '系统启动时自动启动此服务')) + '</label></div>';
                html += '<div class="servicemanager-detail-hint">' + (self._getText('SERVICEMANAGER_AUTOSTART_HINT', '与计划任务联动')) + '</div></div></div>';
                html += '<div class="servicemanager-detail-card">';
                html += '<div class="servicemanager-detail-card-title">' + (self._getText('SERVICEMANAGER_INFO', '信息')) + '</div>';
                html += '<div class="servicemanager-detail-card-body">' + self._renderInfoFriendly(info) + '</div></div>';
                html += '<div class="servicemanager-detail-card">';
                html += '<div class="servicemanager-detail-card-title">' + (self._getText('SERVICEMANAGER_STATUS', '状态')) + '</div>';
                html += '<div class="servicemanager-detail-card-body">' + self._renderStatusFriendly(status) + '</div></div>';
                html += '</div>';
                detailEl.innerHTML = html;
            }).catch(function () {
                detailEl.innerHTML = '<div class="servicemanager-detail-error">' + (self._getText('SERVICEMANAGER_LOAD_FAIL', '加载失败')) + '</div>';
            });
        },

        _escapeHtml: function (text) {
            if (text == null || text === '') return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        _renderInfoFriendly: function (info) {
            if (info == null || typeof info !== 'object') return '<p class="servicemanager-detail-value" style="margin:0">—</p>';
            var labels = { name: '名称', version: '版本', description: '描述', author: '作者', copyright: '版权' };
            var keys = ['name', 'version', 'description', 'author', 'copyright'];
            var html = '<div class="servicemanager-detail-grid">';
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (!info.hasOwnProperty(k)) continue;
                var v = info[k];
                if (v === undefined || v === null) v = '—';
                else if (typeof v === 'object') v = JSON.stringify(v);
                else v = String(v);
                var label = labels[k] || k;
                html += '<span class="servicemanager-detail-label">' + (this._escapeHtml(label)) + '</span>';
                html += '<span class="servicemanager-detail-value">' + (this._escapeHtml(v)) + '</span>';
            }
            var rest = Object.keys(info).filter(function (k) { return keys.indexOf(k) === -1; });
            for (var j = 0; j < rest.length; j++) {
                var key = rest[j];
                var val = info[key];
                if (val === undefined || val === null) val = '—';
                else if (typeof val === 'object') val = JSON.stringify(val);
                else val = String(val);
                html += '<span class="servicemanager-detail-label">' + (this._escapeHtml(key)) + '</span>';
                html += '<span class="servicemanager-detail-value">' + (this._escapeHtml(val)) + '</span>';
            }
            html += '</div>';
            return html;
        },

        _renderStatusFriendly: function (status) {
            if (status == null || typeof status !== 'object') return '<p class="servicemanager-detail-value" style="margin:0">—</p>';
            var labels = { running: '运行状态', lastFetchTime: '最后拉取时间', lastSubTime: '最后公告时间', lastError: '错误信息', apiUrl: 'API 配置' };
            var keys = ['running', 'lastFetchTime', 'lastSubTime', 'lastError', 'apiUrl'];
            var html = '<div class="servicemanager-detail-grid">';
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (!status.hasOwnProperty(k)) continue;
                var v = status[k];
                if (k === 'running') v = v ? (this._getText('SERVICEMANAGER_RUNNING', '运行中')) : (this._getText('SERVICEMANAGER_STOPPED', '已停止'));
                else if (k === 'lastFetchTime' || k === 'lastSubTime') v = (v != null && v > 0) ? new Date(v).toLocaleString('zh-CN') : '—';
                else if (k === 'lastError') v = (v != null && v !== '') ? String(v) : '—';
                else if (k === 'apiUrl') v = (v != null && String(v).length > 0 && String(v).indexOf('未配置') === -1) ? '已配置' : '未配置';
                else if (v === undefined || v === null) v = '—';
                else if (typeof v === 'object') v = JSON.stringify(v);
                else v = String(v);
                var label = labels[k] || k;
                html += '<span class="servicemanager-detail-label">' + (this._escapeHtml(label)) + '</span>';
                html += '<span class="servicemanager-detail-value">' + (this._escapeHtml(v)) + '</span>';
            }
            var rest = Object.keys(status).filter(function (k) { return keys.indexOf(k) === -1; });
            for (var j = 0; j < rest.length; j++) {
                var key = rest[j];
                var val = status[key];
                if (val === undefined || val === null) val = '—';
                else if (typeof val === 'object') val = JSON.stringify(val);
                else val = String(val);
                html += '<span class="servicemanager-detail-label">' + (this._escapeHtml(key)) + '</span>';
                html += '<span class="servicemanager-detail-value">' + (this._escapeHtml(val)) + '</span>';
            }
            html += '</div>';
            return html;
        },

        _startService: function (id) {
            if (!this._hasServerAPI()) return;
            var self = this;
            this._kernelAPI.call('Server.start', [id]).then(function (ok) {
                if (typeof KernelLogger !== 'undefined' && ok) {
                    KernelLogger.info('SERVICEMANAGER', '已启动服务: ' + id);
                }
                self._refreshServiceList();
            }).catch(function (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('SERVICEMANAGER', '启动服务失败: ' + id, e);
                self._refreshServiceList();
            });
        },

        _stopService: function (id) {
            if (!this._hasServerAPI()) return;
            var self = this;
            this._kernelAPI.call('Server.stop', [id]).then(function (ok) {
                if (typeof KernelLogger !== 'undefined' && ok) {
                    KernelLogger.info('SERVICEMANAGER', '已停止服务: ' + id);
                }
                self._refreshServiceList();
            }).catch(function (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('SERVICEMANAGER', '停止服务失败: ' + id, e);
                self._refreshServiceList();
            });
        },

        _saveServiceConfig: function (id) {
            if (!this._hasServerAPI() || !id) return;
            var detailEl = this.window && this.window.querySelector('[data-role="detail"]');
            var configCard = detailEl && detailEl.querySelector('[data-role="config-card"]');
            if (!configCard) return;
            var inputs = configCard.querySelectorAll('[data-config-key]');
            var config = {};
            for (var i = 0; i < inputs.length; i++) {
                var inp = inputs[i];
                var key = inp.dataset.configKey;
                var typ = inp.dataset.configType || 'text';
                if (!key) continue;
                if (typ === 'boolean') {
                    config[key] = inp.checked;
                } else if (typ === 'number') {
                    var n = parseFloat(inp.value, 10);
                    config[key] = isNaN(n) ? 0 : n;
                } else {
                    config[key] = inp.value || '';
                }
            }
            var self = this;
            this._kernelAPI.call('Server.setConfig', [id, config]).then(function () {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info('SERVICEMANAGER', '已保存服务配置: ' + id);
                }
                self._showMessage(self._getText('SERVICEMANAGER_CONFIG_SAVED', '配置已保存'));
            }).catch(function (e) {
                var msg = e && (e.message || String(e)) || self._getText('SERVICEMANAGER_OPERATION_FAIL', '操作失败');
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('SERVICEMANAGER', '保存配置失败: ' + id, e);
                self._showMessage(msg);
            });
        }
    };

    if (typeof window !== 'undefined') {
        window.SERVICEMANAGER = SERVICEMANAGER;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.SERVICEMANAGER = SERVICEMANAGER;
    }
})(typeof window !== 'undefined' ? window : globalThis);
