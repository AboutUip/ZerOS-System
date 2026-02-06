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

        /** 获取 ServerExpansion（window 或 POOL） */
        _getServerExpansion: function () {
            if (typeof window !== 'undefined' && window.ServerExpansion) return window.ServerExpansion;
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    return POOL.__GET__('KERNEL_GLOBAL_POOL', 'ServerExpansion');
                } catch (e) {}
            }
            return null;
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
                    PermissionManager.PERMISSION.SCHEDULE_TASK_STARTUP
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

        _refreshServiceList: async function () {
            var listEl = this.window.querySelector('[data-role="list"]');
            var detailEl = this.window.querySelector('[data-role="detail"]');
            if (!listEl) return;

            var se = this._getServerExpansion();
            if (!se) {
                listEl.innerHTML = '<div class="servicemanager-empty">' + (this._getText('SERVICEMANAGER_NO_EXPANSION', 'ServerExpansion 未加载')) + '</div>';
                if (detailEl) detailEl.innerHTML = '';
                return;
            }

            // 先触发 loadAll 重新扫描 D/server，避免 init 时 D 盘未就绪导致 _modules 为空
            if (typeof se.loadAll === 'function') {
                try {
                    await se.loadAll();
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('SERVICEMANAGER', 'ServerExpansion.loadAll 失败: ' + (e && e.message));
                    }
                }
            }

            await this._updateAutoStartMap();
            var ids = se.listServices();
            listEl.innerHTML = '';
            if (ids.length === 0) {
                listEl.innerHTML = '<div class="servicemanager-empty">' + (this._getText('SERVICEMANAGER_NO_SERVICES', '暂无已加载的服务')) + '</div>';
                if (detailEl) detailEl.innerHTML = '';
                return;
            }

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

            var se = this._getServerExpansion();
            if (!se) {
                detailEl.innerHTML = '';
                return;
            }

            var infoPromise = se.info(id);
            var statusPromise = se.status(id);
            detailEl.innerHTML = '<div class="servicemanager-detail-loading">' + (this._getText('SERVICEMANAGER_LOADING', '加载中...')) + '</div>';

            Promise.all([infoPromise, statusPromise]).then(function (results) {
                var info = results[0];
                var status = results[1];
                var autoStart = !!this._autoStartMap[id];
                var started = se.isStarted(id);
                var runningText = started ? (this._getText('SERVICEMANAGER_RUNNING', '运行中')) : (this._getText('SERVICEMANAGER_STOPPED', '已停止'));
                var badgeClass = started ? 'servicemanager-badge-running' : 'servicemanager-badge-stopped';
                var html = '<div class="servicemanager-detail-inner">';
                html += '<header class="servicemanager-detail-header">';
                html += '<h2 class="servicemanager-detail-title">' + (this._escapeHtml(id)) + '</h2>';
                html += '<span class="servicemanager-detail-badge ' + badgeClass + '">' + (this._escapeHtml(runningText)) + '</span>';
                html += '</header>';
                html += '<div class="servicemanager-detail-card">';
                html += '<div class="servicemanager-detail-card-title">' + (this._getText('SERVICEMANAGER_OPERATIONS', '操作')) + '</div>';
                html += '<div class="servicemanager-detail-card-body"><div class="servicemanager-detail-actions">';
                html += '<button type="button" class="servicemanager-btn servicemanager-btn-start" data-action="start"' + (started ? ' disabled' : '') + '>' + (this._getText('SERVICEMANAGER_START', '启动')) + '</button>';
                html += '<button type="button" class="servicemanager-btn servicemanager-btn-stop" data-action="stop"' + (!started ? ' disabled' : '') + '>' + (this._getText('SERVICEMANAGER_STOP', '停止')) + '</button>';
                html += '</div></div></div>';
                html += '<div class="servicemanager-detail-card">';
                html += '<div class="servicemanager-detail-card-title">' + (this._getText('SERVICEMANAGER_AUTOSTART', '自启')) + '</div>';
                html += '<div class="servicemanager-detail-card-body">';
                html += '<div class="servicemanager-autostart-row"><input type="checkbox" id="servicemanager-autostart-' + (this._escapeHtml(id)) + '" data-action="toggle-autostart"' + (autoStart ? ' checked' : '') + '><label for="servicemanager-autostart-' + (this._escapeHtml(id)) + '">' + (this._getText('SERVICEMANAGER_AUTOSTART_LABEL', '系统启动时自动启动此服务')) + '</label></div>';
                html += '<div class="servicemanager-detail-hint">' + (this._getText('SERVICEMANAGER_AUTOSTART_HINT', '与计划任务联动')) + '</div></div></div>';
                html += '<div class="servicemanager-detail-card">';
                html += '<div class="servicemanager-detail-card-title">' + (this._getText('SERVICEMANAGER_INFO', '信息')) + '</div>';
                html += '<div class="servicemanager-detail-card-body">' + this._renderInfoFriendly(info) + '</div></div>';
                html += '<div class="servicemanager-detail-card">';
                html += '<div class="servicemanager-detail-card-title">' + (this._getText('SERVICEMANAGER_STATUS', '状态')) + '</div>';
                html += '<div class="servicemanager-detail-card-body">' + this._renderStatusFriendly(status) + '</div></div>';
                html += '</div>';
                detailEl.innerHTML = html;
            }.bind(this)).catch(function () {
                detailEl.innerHTML = '<div class="servicemanager-detail-error">' + (this._getText('SERVICEMANAGER_LOAD_FAIL', '加载失败')) + '</div>';
            }.bind(this));
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
            var se = this._getServerExpansion();
            if (!se) return;
            var self = this;
            se.start(id).then(function (ok) {
                if (typeof KernelLogger !== 'undefined' && ok) {
                    KernelLogger.info('SERVICEMANAGER', '已启动服务: ' + id);
                }
                self._refreshServiceList();
            });
        },

        _stopService: function (id) {
            var se = this._getServerExpansion();
            if (!se) return;
            var self = this;
            se.stop(id).then(function (ok) {
                if (typeof KernelLogger !== 'undefined' && ok) {
                    KernelLogger.info('SERVICEMANAGER', '已停止服务: ' + id);
                }
                self._refreshServiceList();
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
