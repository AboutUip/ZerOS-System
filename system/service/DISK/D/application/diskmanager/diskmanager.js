// ZerOS Disk Partition Manager
// Uses DISKMANAGER API: list, create, delete, merge. Format/resize via Disk.format. MB/GB unit. 确认/输入/大小使用程序子窗口，少用拟态弹窗。

(function (window) {
    'use strict';

    var L = {
        DISKMANAGER_TITLE: '磁盘管理',
        REFRESH: '刷新',
        NEW_PARTITION: '新建分区',
        FORMAT_RESIZE: '格式化/调整大小',
        DELETE_PARTITION: '删除分区',
        MERGE: '合并分区',
        PARTITIONS: '分区',
        USED: '已用',
        FREE: '空闲',
        TOTAL_CAPACITY: '总容量',
        USAGE: '使用率',
        SYSTEM: '系统',
        NO_PARTITIONS: '无可用分区。',
        SELECT_PARTITION: '请选择左侧分区查看详情。',
        LOADING: '加载中…',
        SUMMARY_COUNT: '共 {n} 个分区',
        SUMMARY_TOTAL: '总容量',
        SUMMARY_NONE: '暂无分区',
        TIP: '提示：选择分区后可进行格式化、调整大小、删除或合并操作。',
        NEW_PARTITION_PROMPT: '请输入新分区盘符 (A-Z，不能与现有分区重复)：',
        SIZE_LABEL: '大小',
        SIZE_UNIT_MB: 'MB',
        SIZE_UNIT_GB: 'GB',
        OK: '确定',
        CANCEL: '取消',
        FORMAT_SIZE_PROMPT: '请输入新大小：',
        FORMAT_CONFIRM: '格式化将清除该分区所有数据，是否继续？',
        FORMAT_D_CONFIRM: 'D: 为系统盘，修改可能导致系统不可用。是否继续？',
        DELETE_CONFIRM: '删除分区将清除该分区所有数据，是否继续？',
        DELETE_D_FORBIDDEN: '系统分区 D: 不允许删除。',
        MERGE_SOURCE: '源分区',
        MERGE_TARGET: '目标分区',
        MERGE_DELETE_SOURCE: '合并后删除源分区',
        MERGE_CONFIRM: '确认将源分区内容合并到目标分区？',
        OPERATION_FAILED: '操作失败：',
        OPERATION_SUCCESS: '操作成功',
        INVALID_LETTER: '请输入单个字母 A-Z。',
        INVALID_SIZE: '请输入有效数字。',
        LETTER_IN_USE: '该盘符已被使用。',
        REFRESH_TIP: '重新加载分区列表',
        NEW_PARTITION_TIP: '创建新分区',
        FORMAT_RESIZE_TIP: '格式化或调整分区大小',
        DELETE_PARTITION_TIP: '删除所选分区',
        MERGE_TIP: '将源分区合并到目标分区',
        LOAD_FAILED: '加载分区列表失败，请重试。',
        EXCEED_TOTAL_SIZE: '分区总容量不能超过磁盘总大小，当前已无剩余空间可分配。',
        MAXIMIZE: '最大化',
        RESTORE: '还原'
    };

    var VERSION = '1.0.6';

    const DISKMANAGER = {
        pid: null,
        window: null,
        windowId: null,
        _selectedPartition: null,
        _boundClick: null,
        _listCache: null,

        _getText: function (key, fallback) {
            try {
                var Lang = (typeof POOL !== 'undefined' && POOL && typeof POOL.__GET__ === 'function')
                    ? POOL.__GET__('KERNEL_GLOBAL_POOL', 'LanguagesExpansion')
                    : (typeof window !== 'undefined' ? window.LanguagesExpansion : null);
                if (Lang && typeof Lang.getText === 'function') {
                    var v = Lang.getText(key);
                    if (v && v !== key) return v;
                }
            } catch (e) {}
            return L[key] != null ? L[key] : (fallback != null ? fallback : key);
        },

        _formatBytes: function (bytes) {
            if (bytes === 0) return '0 B';
            var k = 1024;
            var sizes = ['B', 'KB', 'MB', 'GB'];
            var i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        },

        _getDiskManagerUrl: function () {
            if (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject && SystemInformation.SERVICE_NAMES && SystemInformation.SERVICE_NAMES.DISKMANAGER) {
                return SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.DISKMANAGER).toString();
            }
            var origin = (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : (typeof window !== 'undefined' ? window.location.origin : '');
            return new URL('/system/service/DISKMANAGER.php', origin).toString();
        },

        _callDiskManagerAPI: async function (action, params) {
            var url = this._getDiskManagerUrl();
            if (url.indexOf('?') >= 0) url = url.split('?')[0];
            var u = new URL(url);
            u.searchParams.set('action', action);
            for (var k in params) {
                if (params[k] !== undefined && params[k] !== null) {
                    u.searchParams.set(k, params[k] === true ? 'true' : String(params[k]));
                }
            }
            if (this._upid != null) u.searchParams.set('upid', this._upid);
            var response = await fetch(u.toString());
            return await response.json();
        },

        /* 使用程序子窗口代替拟态弹窗：确认、输入、大小对话框均为独立子窗口 */
        _showConfirm: function (message, title, type) {
            var self = this;
            return new Promise(function (resolve) {
                if (typeof GUIManager === 'undefined' || !self.pid || !self.window) {
                    resolve(false);
                    return;
                }
                var container = self.window.parentElement || document.getElementById('gui-container');
                if (!container) { resolve(false); return; }
                var win = document.createElement('div');
                win.className = 'diskmanager-subwindow diskmanager-subwindow-confirm';
                win.style.cssText = 'min-width:320px;max-width:420px;padding:0;overflow:hidden;background:#0e1016;border:1px solid rgba(255,255,255,0.08);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.4);';
                var titleBar = document.createElement('div');
                titleBar.className = 'diskmanager-subwindow-titlebar';
                titleBar.style.cssText = 'padding:10px 14px;font-weight:600;font-size:13px;color:rgba(226,230,235,0.95);cursor:move;user-select:none;border-bottom:1px solid rgba(255,255,255,0.06);';
                titleBar.textContent = title || self._getText('OK', '确定');
                var body = document.createElement('div');
                body.className = 'diskmanager-subwindow-body';
                body.style.cssText = 'padding:16px 14px;font-size:13px;color:rgba(226,230,235,0.85);line-height:1.5;';
                body.textContent = message || '';
                var footer = document.createElement('div');
                footer.className = 'diskmanager-subwindow-footer';
                footer.style.cssText = 'padding:10px 14px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid rgba(255,255,255,0.06);';
                var cancelBtn = document.createElement('button');
                cancelBtn.textContent = self._getText('CANCEL', '取消');
                cancelBtn.className = 'diskmanager-subwindow-btn';
                cancelBtn.style.cssText = 'padding:6px 14px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:rgba(255,255,255,0.06);color:rgba(226,230,235,0.9);cursor:pointer;font-size:12px;';
                var okBtn = document.createElement('button');
                okBtn.textContent = self._getText('OK', '确定');
                okBtn.className = 'diskmanager-subwindow-btn diskmanager-subwindow-btn-primary';
                okBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:rgba(255,255,255,0.12);color:#e2e6eb;cursor:pointer;font-size:12px;';
                if (type === 'danger') okBtn.style.background = 'rgba(220,80,70,0.35)';
                win.appendChild(titleBar);
                win.appendChild(body);
                win.appendChild(footer);
                footer.appendChild(cancelBtn);
                footer.appendChild(okBtn);
                container.appendChild(win);
                var winInfo = GUIManager.registerWindow(self.pid, win, {
                    title: title || '',
                    noTitleBar: true,
                    dragHandle: titleBar,
                    borderless: true,
                    onClose: function () {
                        if (win.parentNode) win.parentNode.removeChild(win);
                        resolve(false);
                    }
                });
                var done = function (result) {
                    if (typeof GUIManager !== 'undefined' && winInfo && winInfo.windowId) GUIManager.unregisterWindow(winInfo.windowId);
                    if (win.parentNode) win.parentNode.removeChild(win);
                    resolve(result);
                };
                cancelBtn.addEventListener('click', function () { done(false); });
                okBtn.addEventListener('click', function () { done(true); });
            });
        },

        _showPrompt: function (message, title, defaultValue) {
            var self = this;
            return new Promise(function (resolve) {
                if (typeof GUIManager === 'undefined' || !self.pid || !self.window) {
                    resolve(null);
                    return;
                }
                var container = self.window.parentElement || document.getElementById('gui-container');
                if (!container) { resolve(null); return; }
                var win = document.createElement('div');
                win.className = 'diskmanager-subwindow diskmanager-subwindow-prompt';
                win.style.cssText = 'min-width:320px;max-width:420px;padding:0;overflow:hidden;background:#0e1016;border:1px solid rgba(255,255,255,0.08);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.4);';
                var titleBar = document.createElement('div');
                titleBar.className = 'diskmanager-subwindow-titlebar';
                titleBar.style.cssText = 'padding:10px 14px;font-weight:600;font-size:13px;color:rgba(226,230,235,0.95);cursor:move;user-select:none;border-bottom:1px solid rgba(255,255,255,0.06);';
                titleBar.textContent = title || '';
                var body = document.createElement('div');
                body.className = 'diskmanager-subwindow-body';
                body.style.cssText = 'padding:16px 14px;font-size:13px;color:rgba(226,230,235,0.85);line-height:1.5;';
                body.textContent = message || '';
                var input = document.createElement('input');
                input.type = 'text';
                input.value = defaultValue || '';
                input.style.cssText = 'margin-top:10px;width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:rgba(0,0,0,0.3);color:#e2e6eb;font-size:13px;';
                body.appendChild(input);
                var footer = document.createElement('div');
                footer.className = 'diskmanager-subwindow-footer';
                footer.style.cssText = 'padding:10px 14px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid rgba(255,255,255,0.06);';
                var cancelBtn = document.createElement('button');
                cancelBtn.textContent = self._getText('CANCEL', '取消');
                cancelBtn.className = 'diskmanager-subwindow-btn';
                cancelBtn.style.cssText = 'padding:6px 14px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:rgba(255,255,255,0.06);color:rgba(226,230,235,0.9);cursor:pointer;font-size:12px;';
                var okBtn = document.createElement('button');
                okBtn.textContent = self._getText('OK', '确定');
                okBtn.className = 'diskmanager-subwindow-btn diskmanager-subwindow-btn-primary';
                okBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:rgba(255,255,255,0.12);color:#e2e6eb;cursor:pointer;font-size:12px;';
                win.appendChild(titleBar);
                win.appendChild(body);
                win.appendChild(footer);
                footer.appendChild(cancelBtn);
                footer.appendChild(okBtn);
                container.appendChild(win);
                var winInfo = GUIManager.registerWindow(self.pid, win, {
                    title: title || '',
                    noTitleBar: true,
                    dragHandle: titleBar,
                    borderless: true,
                    onClose: function () {
                        if (win.parentNode) win.parentNode.removeChild(win);
                        resolve(null);
                    }
                });
                var done = function (result) {
                    if (typeof GUIManager !== 'undefined' && winInfo && winInfo.windowId) GUIManager.unregisterWindow(winInfo.windowId);
                    if (win.parentNode) win.parentNode.removeChild(win);
                    resolve(result);
                };
                cancelBtn.addEventListener('click', function () { done(null); });
                okBtn.addEventListener('click', function () { done(input.value.trim()); });
                setTimeout(function () { input.focus(); input.select(); }, 100);
            });
        },

        _showNotify: function (message, type) {
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                // NotificationManager.type 仅支持 'snapshot' 或 'dependent'，语义类型（error/success）仅用于本地逻辑，传 snapshot
                NotificationManager.createNotification(this.pid, { title: this._getText('DISKMANAGER_TITLE', '磁盘管理'), content: message, type: 'snapshot', duration: 4000 });
            }
        },

        _showSizeDialog: function (title, defaultVal, defaultUnit) {
            var self = this;
            return new Promise(function (resolve) {
                if (typeof GUIManager === 'undefined' || !self.pid || !self.window) {
                    resolve(null);
                    return;
                }
                var container = self.window.parentElement || document.getElementById('gui-container');
                if (!container) { resolve(null); return; }
                var win = document.createElement('div');
                win.className = 'diskmanager-subwindow diskmanager-subwindow-size';
                win.style.cssText = 'min-width:320px;max-width:420px;padding:0;overflow:hidden;background:#0e1016;border:1px solid rgba(255,255,255,0.08);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.4);';
                var titleBar = document.createElement('div');
                titleBar.className = 'diskmanager-subwindow-titlebar';
                titleBar.style.cssText = 'padding:10px 14px;font-weight:600;font-size:13px;color:rgba(226,230,235,0.95);cursor:move;user-select:none;border-bottom:1px solid rgba(255,255,255,0.06);';
                titleBar.textContent = title || self._getText('SIZE_LABEL', '大小');
                var body = document.createElement('div');
                body.className = 'diskmanager-subwindow-body';
                body.style.cssText = 'padding:16px 14px;font-size:13px;color:rgba(226,230,235,0.85);';
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;';
                var input = document.createElement('input');
                input.type = 'number';
                input.min = '1';
                input.value = String(defaultVal || 512);
                input.style.cssText = 'width:100px;padding:8px 10px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:rgba(0,0,0,0.3);color:#e2e6eb;font-size:13px;';
                var select = document.createElement('select');
                select.style.cssText = 'padding:8px 10px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:rgba(0,0,0,0.3);color:#e2e6eb;font-size:13px;';
                var optMB = document.createElement('option');
                optMB.value = 'MB';
                optMB.textContent = self._getText('SIZE_UNIT_MB', 'MB');
                var optGB = document.createElement('option');
                optGB.value = 'GB';
                optGB.textContent = self._getText('SIZE_UNIT_GB', 'GB');
                select.appendChild(optMB);
                select.appendChild(optGB);
                select.value = defaultUnit === 'GB' ? 'GB' : 'MB';
                row.appendChild(input);
                row.appendChild(select);
                body.appendChild(row);
                var footer = document.createElement('div');
                footer.className = 'diskmanager-subwindow-footer';
                footer.style.cssText = 'padding:10px 14px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid rgba(255,255,255,0.06);';
                var cancelBtn = document.createElement('button');
                cancelBtn.textContent = self._getText('CANCEL', '取消');
                cancelBtn.className = 'diskmanager-subwindow-btn';
                cancelBtn.style.cssText = 'padding:6px 14px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:rgba(255,255,255,0.06);color:rgba(226,230,235,0.9);cursor:pointer;font-size:12px;';
                var okBtn = document.createElement('button');
                okBtn.textContent = self._getText('OK', '确定');
                okBtn.className = 'diskmanager-subwindow-btn diskmanager-subwindow-btn-primary';
                okBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:rgba(255,255,255,0.12);color:#e2e6eb;cursor:pointer;font-size:12px;';
                win.appendChild(titleBar);
                win.appendChild(body);
                win.appendChild(footer);
                footer.appendChild(cancelBtn);
                footer.appendChild(okBtn);
                container.appendChild(win);
                var winInfo = GUIManager.registerWindow(self.pid, win, {
                    title: title || '',
                    noTitleBar: true,
                    dragHandle: titleBar,
                    borderless: true,
                    onClose: function () {
                        if (win.parentNode) win.parentNode.removeChild(win);
                        resolve(null);
                    }
                });
                var done = function (result) {
                    if (typeof GUIManager !== 'undefined' && winInfo && winInfo.windowId) GUIManager.unregisterWindow(winInfo.windowId);
                    if (win.parentNode) win.parentNode.removeChild(win);
                    resolve(result);
                };
                cancelBtn.addEventListener('click', function () { done(null); });
                okBtn.addEventListener('click', function () {
                    var val = parseFloat(input.value, 10);
                    var unit = select.value;
                    if (isNaN(val) || val <= 0) {
                        self._showNotify(self._getText('INVALID_SIZE', '请输入有效数字。'), 'error');
                        return;
                    }
                    done({ value: val, unit: unit });
                });
                setTimeout(function () { input.focus(); input.select(); }, 100);
            });
        },

        _sizeToBytes: function (val, unit) {
            if (unit === 'GB') return val * 1024 * 1024 * 1024;
            return val * 1024 * 1024;
        },

        __init__: async function (pid, initArgs) {
            this.pid = pid;
            this._upid = initArgs && initArgs.upid;
            var guiContainer = initArgs.guiContainer || document.getElementById('gui-container');

            this.window = document.createElement('div');
            this.window.className = 'diskmanager-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = 'display: flex; flex-direction: column; overflow: hidden; min-width: 560px; min-height: 380px; position: relative;';

            this._buildUI();

            if (typeof GUIManager !== 'undefined') {
                var windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: this._getText('DISKMANAGER_TITLE', '磁盘管理'),
                    icon: null,
                    onClose: function () {},
                    noTitleBar: true,
                    dragHandle: this.window.querySelector('.diskmanager-custom-titlebar'),
                    borderless: true
                });
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                    this._attachCustomTitleBarActions(this.windowId);
                }
            }

            guiContainer.appendChild(this.window);
            this._registerEventHandlers();
            setTimeout(function () {
                this._refreshPartitionList();
            }.bind(this), 200);
        },

        __exit__: async function () {
            if (this._boundClick && this.window) {
                this.window.removeEventListener('click', this._boundClick);
                this._boundClick = null;
            }
            if (this._maxBtnObserver) {
                this._maxBtnObserver.disconnect();
                this._maxBtnObserver = null;
            }
            this._maxBtnRef = null;
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
                name: this._getText('DISKMANAGER_TITLE', '磁盘管理'),
                type: 'GUI',
                version: VERSION,
                description: '查看分区、新建/删除/合并分区、格式化/调整大小',
                author: 'ZerOS',
                copyright: 'ZerOS',
                permissions: [],
                metadata: { allowMultipleInstances: true }
            };
        },

        _buildUI: function () {
            var titleBar = document.createElement('div');
            titleBar.className = 'diskmanager-custom-titlebar zos-fixed-height';
            titleBar.dataset.role = 'custom-titlebar';
            var left = document.createElement('div');
            left.className = 'diskmanager-custom-titlebar-left';
            var titleText = document.createElement('span');
            titleText.className = 'diskmanager-custom-titlebar-title';
            titleText.textContent = this._getText('DISKMANAGER_TITLE', '磁盘管理');
            left.appendChild(titleText);
            if (typeof ApplicationAssetManager !== 'undefined') {
                var icon = ApplicationAssetManager.getIcon('diskmanager');
                if (icon) {
                    var iconWrap = document.createElement('span');
                    iconWrap.className = 'diskmanager-custom-titlebar-icon';
                    var img = document.createElement('img');
                    img.src = (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') ? ProcessManager.convertVirtualPathToUrl(icon) : icon;
                    img.alt = '';
                    img.setAttribute('width', '16');
                    img.setAttribute('height', '16');
                    iconWrap.appendChild(img);
                    left.insertBefore(iconWrap, titleText);
                }
            }
            /* 功能按钮置于左侧：标题右侧紧跟 刷新/新建分区/格式化/删除/合并 */
            var actions = [
                { action: 'refresh', text: this._getText('REFRESH', '刷新'), tipKey: 'REFRESH_TIP' },
                { action: 'new-partition', text: this._getText('NEW_PARTITION', '新建分区'), tipKey: 'NEW_PARTITION_TIP' },
                { action: 'format-resize', text: this._getText('FORMAT_RESIZE', '格式化/调整大小'), tipKey: 'FORMAT_RESIZE_TIP' },
                { action: 'delete-partition', text: this._getText('DELETE_PARTITION', '删除分区'), tipKey: 'DELETE_PARTITION_TIP' },
                { action: 'merge', text: this._getText('MERGE', '合并分区'), tipKey: 'MERGE_TIP' }
            ];
            var actionsWrap = document.createElement('div');
            actionsWrap.className = 'diskmanager-topbar-actions';
            for (var i = 0; i < actions.length; i++) {
                var btn = document.createElement('button');
                btn.className = 'diskmanager-btn-' + actions[i].action;
                btn.textContent = actions[i].text;
                btn.dataset.action = actions[i].action;
                btn.title = this._getText(actions[i].tipKey, actions[i].text);
                actionsWrap.appendChild(btn);
            }
            left.appendChild(actionsWrap);
            titleBar.appendChild(left);
            var right = document.createElement('div');
            right.className = 'diskmanager-custom-titlebar-controls';
            var minBtn = document.createElement('button');
            minBtn.type = 'button';
            minBtn.className = 'diskmanager-titlebar-btn diskmanager-titlebar-btn-minimize';
            minBtn.title = '最小化';
            minBtn.setAttribute('aria-label', '最小化');
            minBtn.textContent = '\u2212';
            var maxBtn = document.createElement('button');
            maxBtn.type = 'button';
            maxBtn.className = 'diskmanager-titlebar-btn diskmanager-titlebar-btn-maximize';
            maxBtn.title = '最大化';
            maxBtn.setAttribute('aria-label', '最大化');
            maxBtn.textContent = '\u25A1';
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'diskmanager-titlebar-btn diskmanager-titlebar-btn-close';
            closeBtn.title = '关闭';
            closeBtn.setAttribute('aria-label', '关闭');
            closeBtn.textContent = '\u00D7';
            right.appendChild(minBtn);
            right.appendChild(maxBtn);
            right.appendChild(closeBtn);
            titleBar.appendChild(right);
            this.window.appendChild(titleBar);

            var summaryBar = document.createElement('div');
            summaryBar.className = 'diskmanager-summary zos-fixed-height';
            summaryBar.dataset.role = 'summary';
            summaryBar.textContent = this._getText('LOADING', '加载中…');
            this.window.appendChild(summaryBar);

            var main = document.createElement('div');
            main.className = 'diskmanager-main';
            main.style.cssText = 'flex: 1; display: flex; overflow: hidden; min-height: 0;';

            var listWrap = document.createElement('div');
            listWrap.style.cssText = 'width: 280px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid rgba(108, 142, 255, 0.25);';
            var listLabel = document.createElement('div');
            listLabel.className = 'diskmanager-list-label';
            listLabel.textContent = this._getText('PARTITIONS', '分区');
            listWrap.appendChild(listLabel);
            var listBox = document.createElement('div');
            listBox.className = 'diskmanager-list';
            listBox.dataset.role = 'list';
            listWrap.appendChild(listBox);
            main.appendChild(listWrap);

            var detailWrap = document.createElement('div');
            detailWrap.className = 'diskmanager-detail';
            detailWrap.dataset.role = 'detail';
            detailWrap.style.cssText = 'flex: 1; min-width: 0; overflow: auto;';
            main.appendChild(detailWrap);

            this.window.appendChild(main);
        },

        _attachCustomTitleBarActions: function (windowId) {
            var self = this;
            if (typeof GUIManager === 'undefined' || !this.window) return;
            var bar = this.window.querySelector('.diskmanager-custom-titlebar');
            if (!bar) return;
            var minBtn = bar.querySelector('.diskmanager-titlebar-btn-minimize');
            var maxBtn = bar.querySelector('.diskmanager-titlebar-btn-maximize');
            var closeBtn = bar.querySelector('.diskmanager-titlebar-btn-close');
            if (minBtn) minBtn.addEventListener('click', function () { GUIManager.minimizeWindow(windowId); });
            if (maxBtn) {
                this._maxBtnRef = maxBtn;
                maxBtn.addEventListener('click', function () {
                    GUIManager.toggleMaximize(windowId);
                    self._updateMaximizeButton(maxBtn);
                });
                this._updateMaximizeButton(maxBtn);
                if (typeof MutationObserver !== 'undefined' && this.window) {
                    var obs = new MutationObserver(function () { self._updateMaximizeButton(maxBtn); });
                    obs.observe(this.window, { attributes: true, attributeFilter: ['class'] });
                    this._maxBtnObserver = obs;
                }
            }
            if (closeBtn) closeBtn.addEventListener('click', function () { GUIManager._closeWindow(windowId, false); });
        },

        _updateMaximizeButton: function (maxBtn) {
            if (!maxBtn || !this.window) return;
            var isMax = this.window.classList.contains('zos-window-maximized');
            maxBtn.textContent = isMax ? '\u2A09' : '\u25A1';
            maxBtn.title = isMax ? (this._getText('RESTORE', '还原') || '还原') : (this._getText('MAXIMIZE', '最大化') || '最大化');
            if (isMax) maxBtn.classList.add('diskmanager-btn-restored'); else maxBtn.classList.remove('diskmanager-btn-restored');
        },

        _getPartitionList: async function () {
            try {
                var res = await this._callDiskManagerAPI('list', {});
                if (res.status === 'success' && res.data && res.data.partitions && Array.isArray(res.data.partitions)) {
                    this._listCache = res.data.partitions;
                    return res.data.partitions.map(function (p) { return p.partition || (p.letter ? p.letter + ':' : ''); }).filter(Boolean).sort();
                }
            } catch (e) {}
            this._listCache = null;
            var list = [];
            if (typeof Disk !== 'undefined' && Disk.canUsed) {
                if (Disk.diskSeparateMap && Disk.diskSeparateMap.size > 0) {
                    Disk.diskSeparateMap.forEach(function (nodeTree, name) {
                        if (nodeTree) list.push(name);
                    });
                }
                if (list.length === 0 && Disk.diskSeparateSize) {
                    Disk.diskSeparateSize.forEach(function (size, name) {
                        list.push(name);
                    });
                }
            }
            return list.sort();
        },

        _getPartitionInfo: function (partitionName) {
            if (this._listCache) {
                for (var i = 0; i < this._listCache.length; i++) {
                    var p = this._listCache[i];
                    if ((p.partition || (p.letter ? p.letter + ':' : '')) === partitionName) {
                        var used = p.diskUsedSpace || 0;
                        var free = (p.diskFreeSpace != null) ? p.diskFreeSpace : 0;
                        var total = (used + free) > 0 ? (used + free) : (p.size || p.diskTotalSize || 0);
                        return { name: partitionName, total: total, used: used, free: free };
                    }
                }
            }
            var total = 0, used = 0, free = 0;
            if (typeof Disk !== 'undefined' && Disk.diskSeparateSize) {
                total = Disk.diskSeparateSize.get(partitionName) || 0;
            }
            if (typeof Disk !== 'undefined' && Disk.diskUsedMap) {
                used = Disk.diskUsedMap.get(partitionName) || 0;
            }
            if (typeof Disk !== 'undefined' && Disk.diskFreeMap) {
                free = Disk.diskFreeMap.get(partitionName) || (total - used);
            } else {
                free = total - used;
            }
            return { name: partitionName, total: total, used: used, free: free };
        },

        _refreshPartitionList: function () {
            var self = this;
            if (typeof Disk !== 'undefined' && typeof Disk.update === 'function') {
                try { Disk.update(); } catch (e) {}
            }
            this._getPartitionList().then(function (partitions) {
                var listEl = self.window ? self.window.querySelector('[data-role="list"]') : null;
                var detailEl = self.window ? self.window.querySelector('[data-role="detail"]') : null;
                if (!listEl || !detailEl) return;

                var summaryEl = self.window ? self.window.querySelector('[data-role="summary"]') : null;
                listEl.innerHTML = '';
                if (!Array.isArray(partitions)) {
                    listEl.innerHTML = '<div class="diskmanager-status-msg error">' + self._getText('LOAD_FAILED', '加载分区列表失败，请重试。') + '</div>';
                    if (summaryEl) summaryEl.textContent = self._getText('LOAD_FAILED', '加载分区列表失败，请重试。');
                    return;
                }
                if (partitions.length === 0) {
                    listEl.innerHTML = '<div class="diskmanager-status-msg">' + self._getText('NO_PARTITIONS', '无可用分区。') + '</div>';
                    if (summaryEl) summaryEl.textContent = self._getText('SUMMARY_NONE', '暂无分区');
                    detailEl.innerHTML =
                        '<div class="diskmanager-empty-state">' +
                        '<div class="diskmanager-empty-icon">💾</div>' +
                        '<p class="diskmanager-empty-title">' + self._getText('NO_PARTITIONS', '无可用分区。') + '</p>' +
                        '<p class="diskmanager-empty-tip">' + self._getText('SELECT_PARTITION', '请选择左侧分区查看详情。') + '</p>' +
                        '</div>';
                    return;
                }
                var totalBytes = 0;
                partitions.forEach(function (name) {
                    var info = self._getPartitionInfo(name);
                    totalBytes += info.total || 0;
                });
                if (summaryEl) {
                    var countTpl = self._getText('SUMMARY_COUNT', '共 {n} 个分区');
                    var totalLabel = self._getText('SUMMARY_TOTAL', '总容量');
                    summaryEl.innerHTML = '<span class="diskmanager-summary-count">' + countTpl.replace('{n}', String(partitions.length)) + '</span><span class="diskmanager-summary-sep">·</span><span class="diskmanager-summary-total">' + totalLabel + ' ' + self._formatBytes(totalBytes) + '</span><span class="diskmanager-summary-sep">·</span><span class="diskmanager-summary-version">v' + VERSION + '</span>';
                }

                var usedText = self._getText('USED', '已用');
                var freeText = self._getText('FREE', '空闲');
                partitions.forEach(function (name) {
                    var info = self._getPartitionInfo(name);
                    var usedPercent = info.total > 0 ? (info.used / info.total * 100) : 0;
                    var row = document.createElement('div');
                    row.className = 'diskmanager-partition-row';
                    row.dataset.partition = name;
                    row.innerHTML =
                        '<span class="letter">' + name.replace(':', '') + '</span>' +
                        '<div class="bar-wrap">' +
                        '<div class="bar-label"><span>' + usedText + '</span><span>' + self._formatBytes(info.used) + ' / ' + self._formatBytes(info.total) + '</span></div>' +
                        '<div class="bar"><div class="bar-fill" style="width: ' + Math.min(100, usedPercent) + '%;"></div></div>' +
                        '</div>' +
                        '<span class="size">' + self._formatBytes(info.free) + ' ' + freeText + '</span>';
                    listEl.appendChild(row);
                });

                if (!self._selectedPartition || partitions.indexOf(self._selectedPartition) < 0) {
                    self._selectedPartition = partitions[0];
                }
                self._selectPartition(self._selectedPartition);
            }).catch(function () {
                var listEl = self.window ? self.window.querySelector('[data-role="list"]') : null;
                var summaryEl = self.window ? self.window.querySelector('[data-role="summary"]') : null;
                if (listEl) listEl.innerHTML = '<div class="diskmanager-status-msg error">' + self._getText('LOAD_FAILED', '加载分区列表失败，请重试。') + '</div>';
                if (summaryEl) summaryEl.textContent = self._getText('LOAD_FAILED', '加载分区列表失败，请重试。');
            });
        },

        _selectPartition: function (partitionName) {
            this._selectedPartition = partitionName;
            var rows = this.window.querySelectorAll('.diskmanager-partition-row');
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].dataset.partition === partitionName) {
                    rows[i].classList.add('selected');
                } else {
                    rows[i].classList.remove('selected');
                }
            }
            var detailEl = this.window.querySelector('[data-role="detail"]');
            if (!detailEl) return;
            var info = this._getPartitionInfo(partitionName);
            var usedPercent = info.total > 0 ? Math.min(100, (info.used / info.total) * 100) : 0;
            var usedPercentStr = usedPercent.toFixed(1);
            var label = partitionName === 'D:' ? partitionName + ' (' + this._getText('SYSTEM', '系统') + ')' : partitionName;
            var totalCap = this._getText('TOTAL_CAPACITY', '总容量');
            var used = this._getText('USED', '已用');
            var free = this._getText('FREE', '空闲');
            var usage = this._getText('USAGE', '使用率');
            var tip = this._getText('TIP', '提示：选择分区后可进行格式化、调整大小、删除或合并操作。');
            detailEl.innerHTML =
                '<div class="diskmanager-detail-card">' +
                '<div class="diskmanager-detail-section">' +
                '<h4 class="diskmanager-detail-title">' + label + '</h4>' +
                '<div class="diskmanager-detail-bar-wrap">' +
                '<div class="diskmanager-detail-bar"><div class="diskmanager-detail-bar-fill" style="width:' + usedPercent + '%;"></div></div>' +
                '<span class="diskmanager-detail-percent">' + usedPercentStr + '%</span>' +
                '</div>' +
                '<div class="diskmanager-detail-rows">' +
                '<div class="row"><span>' + totalCap + '</span><span class="value">' + this._formatBytes(info.total) + '</span></div>' +
                '<div class="row"><span>' + used + '</span><span class="value">' + this._formatBytes(info.used) + '</span></div>' +
                '<div class="row"><span>' + free + '</span><span class="value">' + this._formatBytes(info.free) + '</span></div>' +
                '<div class="row"><span>' + usage + '</span><span class="value">' + usedPercentStr + '%</span></div>' +
                '</div>' +
                '</div>' +
                '<p class="diskmanager-detail-tip">' + tip + '</p>' +
                '</div>';
        },

        _doNewPartition: async function () {
            var self = this;
            var existing = await this._getPartitionList();
            var usedLetters = {};
            existing.forEach(function (p) {
                usedLetters[p.replace(':', '')] = true;
            });
            var letter = await this._showPrompt(
                this._getText('NEW_PARTITION_PROMPT', '请输入新分区盘符 (A-Z)：'),
                this._getText('NEW_PARTITION', '新建分区'),
                'E'
            );
            if (letter == null || letter === '') return;
            letter = letter.trim().toUpperCase();
            if (letter.length !== 1 || letter < 'A' || letter > 'Z') {
                this._showNotify(this._getText('INVALID_LETTER', '请输入单个字母 A-Z。'), 'error');
                return;
            }
            if (usedLetters[letter]) {
                this._showNotify(this._getText('LETTER_IN_USE', '该盘符已被使用。'), 'error');
                return;
            }
            var partition = letter + ':';
            /* 预检：总大小 3GB，已分配分区之和不能超过总大小 */
            try {
                var dataRes = await this._callDiskManagerAPI('read_data', {});
                if (dataRes.status === 'success' && dataRes.data) {
                    var totalSize = dataRes.data.totalSize || 0;
                    var partitions = dataRes.data.partitions || {};
                    var used = 0;
                    for (var k in partitions) { used += Number(partitions[k]) || 0; }
                    var defaultNewBytes = (letter === 'D') ? 2147483648 : 1073741824;
                    if (used + defaultNewBytes > totalSize) {
                        this._showNotify(this._getText('EXCEED_TOTAL_SIZE', '分区总容量不能超过磁盘总大小，当前已无剩余空间可分配。'), 'error');
                        return;
                    }
                }
            } catch (e) { /* 预检失败仍允许尝试创建，由后端最终校验 */ }
            try {
                var res = await this._callDiskManagerAPI('create', { partition: partition });
                if (res.status === 'success') {
                    await this._callDiskManagerAPI('sync_data', {});
                    this._showNotify(this._getText('OPERATION_SUCCESS', '操作成功'), 'success');
                    this._refreshPartitionList();
                } else {
                    this._showNotify((this._getText('OPERATION_FAILED', '操作失败：') + (res.message || '')), 'error');
                }
            } catch (e) {
                this._showNotify(this._getText('OPERATION_FAILED', '操作失败：') + (e.message || e), 'error');
            }
        },

        _doFormatResize: async function () {
            if (!this._selectedPartition) return;
            var part = this._selectedPartition;
            var msg = part === 'D:' ? this._getText('FORMAT_D_CONFIRM', 'D: 为系统盘，修改可能导致系统不可用。是否继续？') : this._getText('FORMAT_CONFIRM', '格式化将清除该分区所有数据，是否继续？');
            var confirmed = await this._showConfirm(msg, this._getText('FORMAT_RESIZE', '格式化/调整大小'), part === 'D:' ? 'danger' : 'warning');
            if (!confirmed) return;
            var info = this._getPartitionInfo(part);
            var defaultMB = Math.max(1, Math.ceil(info.total / (1024 * 1024)));
            var sizeResult = await this._showSizeDialog(this._getText('FORMAT_SIZE_PROMPT', '请输入新大小：'), defaultMB, 'MB');
            if (!sizeResult) return;
            var sizeBytes = this._sizeToBytes(sizeResult.value, sizeResult.unit);
            try {
                if (typeof Disk !== 'undefined' && typeof Disk.format === 'function') {
                    Disk.format(part, sizeBytes);
                    if (typeof Disk.update === 'function') Disk.update();
                    this._showNotify(this._getText('OPERATION_SUCCESS', '操作成功'), 'success');
                    this._refreshPartitionList();
                } else {
                    this._showNotify(this._getText('OPERATION_FAILED', '操作失败：') + ' Disk.format 不可用', 'error');
                }
            } catch (e) {
                this._showNotify(this._getText('OPERATION_FAILED', '操作失败：') + (e.message || e), 'error');
            }
        },

        _doDeletePartition: async function () {
            if (!this._selectedPartition) return;
            var part = this._selectedPartition;
            if (part === 'D:') {
                this._showNotify(this._getText('DELETE_D_FORBIDDEN', '系统分区 D: 不允许删除。'), 'error');
                return;
            }
            var confirmed = await this._showConfirm(this._getText('DELETE_CONFIRM', '删除分区将清除该分区所有数据，是否继续？'), this._getText('DELETE_PARTITION', '删除分区'), 'danger');
            if (!confirmed) return;
            try {
                var res = await this._callDiskManagerAPI('delete', { partition: part, force: true });
                if (res.status === 'success') {
                    await this._callDiskManagerAPI('sync_data', {});
                    this._showNotify(this._getText('OPERATION_SUCCESS', '操作成功'), 'success');
                    this._selectedPartition = null;
                    this._refreshPartitionList();
                } else {
                    this._showNotify(this._getText('OPERATION_FAILED', '操作失败：') + (res.message || ''), 'error');
                }
            } catch (e) {
                this._showNotify(this._getText('OPERATION_FAILED', '操作失败：') + (e.message || e), 'error');
            }
        },

        _doMerge: async function () {
            if (!this._selectedPartition) return;
            var target = this._selectedPartition;
            var partitions = await this._getPartitionList();
            var others = partitions.filter(function (p) { return p !== target; });
            if (others.length === 0) {
                this._showNotify('没有其他分区可作为源分区。', 'error');
                return;
            }
            var self = this;
            var source = await this._showPrompt(
                this._getText('MERGE_SOURCE', '源分区') + ' (可选: ' + others.join(', ') + ')，输入盘符：',
                this._getText('MERGE', '合并分区'),
                others[0].replace(':', '')
            );
            if (source == null || source === '') return;
            source = source.trim().toUpperCase();
            if (source.indexOf(':') < 0) source = source + ':';
            if (source === target) {
                this._showNotify('源分区与目标分区不能相同。', 'error');
                return;
            }
            if (partitions.indexOf(source) < 0) {
                this._showNotify('源分区不存在。', 'error');
                return;
            }
            var confirmed = await this._showConfirm(
                this._getText('MERGE_CONFIRM', '确认将源分区内容合并到目标分区？') + ' ' + source + ' -> ' + target,
                this._getText('MERGE', '合并分区'),
                'warning'
            );
            if (!confirmed) return;
            try {
                var res = await this._callDiskManagerAPI('merge', { source: source, target: target, deleteSource: false });
                if (res.status === 'success') {
                    await this._callDiskManagerAPI('sync_data', {});
                    this._showNotify(this._getText('OPERATION_SUCCESS', '操作成功'), 'success');
                    this._refreshPartitionList();
                } else {
                    this._showNotify(this._getText('OPERATION_FAILED', '操作失败：') + (res.message || ''), 'error');
                }
            } catch (e) {
                this._showNotify(this._getText('OPERATION_FAILED', '操作失败：') + (e.message || e), 'error');
            }
        },

        _onClick: function (e) {
            var target = e.target;
            if (!target || !this.window || !this.window.contains(target)) return;
            var btn = target.closest('button[data-action]');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                var action = btn.dataset.action;
                if (action === 'refresh') this._refreshPartitionList();
                else if (action === 'new-partition') this._doNewPartition();
                else if (action === 'format-resize') this._doFormatResize();
                else if (action === 'delete-partition') this._doDeletePartition();
                else if (action === 'merge') this._doMerge();
                return;
            }
            var row = target.closest('.diskmanager-partition-row');
            if (row && row.dataset.partition) {
                e.preventDefault();
                e.stopPropagation();
                this._selectPartition(row.dataset.partition);
            }
        },

        _registerEventHandlers: function () {
            var self = this;
            this._boundClick = function (e) {
                self._onClick(e);
            };
            this.window.addEventListener('click', this._boundClick);
        }
    };

    if (typeof window !== 'undefined') {
        window.DISKMANAGER = DISKMANAGER;
    }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
