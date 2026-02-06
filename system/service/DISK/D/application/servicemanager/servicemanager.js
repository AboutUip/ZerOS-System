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
        },

        __exit__: async function () {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('SERVICEMANAGER', '系统服务管理程序退出');
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
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : [],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        },

        _buildUI: function () {
            var toolbar = document.createElement('div');
            toolbar.className = 'servicemanager-toolbar';
            toolbar.style.cssText = 'flex-shrink: 0; height: 40px; display: flex; align-items: center; padding: 0 12px; gap: 8px; border-bottom: 1px solid var(--theme-border, rgba(139,92,246,0.25));';
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
            listBox.style.cssText = 'flex: 1; overflow-y: auto; min-height: 200px; height: 280px;';
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
            detailContent.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px; min-height: 120px; height: 200px; box-sizing: border-box;';
            detailWrap.appendChild(detailContent);
            main.appendChild(detailWrap);

            this.window.appendChild(main);
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
                    var sid = row.dataset.serviceId;
                    var btn = e.target.closest('[data-action]');
                    if (btn && btn.dataset.action === 'start') {
                        self._startService(sid);
                        return;
                    }
                    if (btn && btn.dataset.action === 'stop') {
                        self._stopService(sid);
                        return;
                    }
                    self._selectService(sid);
                });
                this.eventHandlers.push(delegateId);
            }
        },

        _refreshServiceList: function () {
            var listEl = this.window.querySelector('[data-role="list"]');
            var detailEl = this.window.querySelector('[data-role="detail"]');
            if (!listEl) return;

            var se = this._getServerExpansion();
            if (!se) {
                listEl.innerHTML = '<div class="servicemanager-empty">' + (this._getText('SERVICEMANAGER_NO_EXPANSION', 'ServerExpansion 未加载')) + '</div>';
                if (detailEl) detailEl.innerHTML = '';
                return;
            }

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
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--theme-border, rgba(139,92,246,0.15)); min-height: 44px; box-sizing: border-box;';
                var started = se.isStarted(id);
                var label = document.createElement('span');
                label.className = 'servicemanager-item-label';
                label.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                label.textContent = id;
                row.appendChild(label);
                var statusSpan = document.createElement('span');
                statusSpan.className = 'servicemanager-item-status';
                statusSpan.style.cssText = 'font-size: 12px; margin-right: 8px; flex-shrink: 0;';
                statusSpan.textContent = started ? (this._getText('SERVICEMANAGER_RUNNING', '运行中')) : (this._getText('SERVICEMANAGER_STOPPED', '已停止'));
                statusSpan.style.color = started ? 'var(--theme-success, #22c55e)' : 'var(--theme-text-muted, #94a3b8)';
                row.appendChild(statusSpan);
                var btnStart = document.createElement('button');
                btnStart.className = 'servicemanager-btn servicemanager-btn-start';
                btnStart.dataset.action = 'start';
                btnStart.textContent = this._getText('SERVICEMANAGER_START', '启动');
                btnStart.style.cssText = 'padding: 4px 10px; font-size: 12px; flex-shrink: 0;';
                if (started) btnStart.disabled = true;
                row.appendChild(btnStart);
                var btnStop = document.createElement('button');
                btnStop.className = 'servicemanager-btn servicemanager-btn-stop';
                btnStop.dataset.action = 'stop';
                btnStop.textContent = this._getText('SERVICEMANAGER_STOP', '停止');
                btnStop.style.cssText = 'padding: 4px 10px; font-size: 12px; margin-left: 4px; flex-shrink: 0;';
                if (!started) btnStop.disabled = true;
                row.appendChild(btnStop);
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
                var html = '<div class="servicemanager-detail-section"><strong>' + (id) + '</strong></div>';
                html += '<div class="servicemanager-detail-section"><strong>' + (this._getText('SERVICEMANAGER_INFO', '信息')) + '</strong><pre class="servicemanager-detail-pre">' + (typeof info !== 'undefined' && info !== null ? JSON.stringify(info, null, 2) : '—') + '</pre></div>';
                html += '<div class="servicemanager-detail-section"><strong>' + (this._getText('SERVICEMANAGER_STATUS', '状态')) + '</strong><pre class="servicemanager-detail-pre">' + (typeof status !== 'undefined' && status !== null ? JSON.stringify(status, null, 2) : '—') + '</pre></div>';
                detailEl.innerHTML = html;
            }.bind(this)).catch(function () {
                detailEl.innerHTML = '<div class="servicemanager-detail-error">' + (this._getText('SERVICEMANAGER_LOAD_FAIL', '加载失败')) + '</div>';
            }.bind(this));
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
