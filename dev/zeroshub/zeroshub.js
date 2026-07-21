// ZerOS DevBridge - 远程开发者桥接器
// 功能：安全地在 ZerOS 系统与外部开发工具间建立通信通道
// 通过 D:/server/server-zeroshub.php 对外暴露 token 认证的 HTTP API

(function(window) {
    'use strict';

    var PM = typeof PermissionManager !== 'undefined' ? PermissionManager.PERMISSION : {};

    var SERVICE_ID = 'zeroshub';
    var PHP_FILENAME = 'server-zeroshub.php';
    var PHP_SERVER_PATH = 'D:/server/' + PHP_FILENAME;
    var ASSET_SERVICE_PATH = 'D:/application/zeroshub/assets/' + PHP_FILENAME;
    var CMD_QUEUE_FILE = 'D:/server/.zeroshub_cmd_queue.json';
    var CMD_RESP_FILE = 'D:/server/.zeroshub_cmd_resp.json';
    var LSTORAGE_KEY = 'zeroshub';
    var POLL_INTERVAL_MS = 2000;

    var ZEROSHUB = {
        pid: null,
        window: null,
        windowId: null,
        _body: null,
        _kernelAPI: null,
        _upid: null,
        eventHandlers: [],
        _pollTimer: null,
        _bridgeActive: false,
        _bridgeToken: null,
        _config: null,
        _logLines: [],
        _cmdQueueSeq: 0,

        __info__: function() {
            return {
                name: 'DevBridge',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS DevBridge - 远程开发者桥接器，为外部开发工具提供安全可控的系统访问通道',
                author: 'ZerOS Developer',
                copyright: '© 2026',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PM.GUI_WINDOW_CREATE,
                    PM.EVENT_LISTENER,
                    PM.KERNEL_DISK_READ,
                    PM.KERNEL_DISK_WRITE,
                    PM.KERNEL_DISK_CREATE,
                    PM.KERNEL_DISK_DELETE,
                    PM.KERNEL_DISK_LIST,
                    PM.SYSTEM_STORAGE_READ,
                    PM.SYSTEM_STORAGE_WRITE,
                    PM.SERVER_SERVICE_MANAGE
                ] : [],
                metadata: {
                    category: 'system',
                    allowMultipleInstances: false,
                    supportsPreview: true
                }
            };
        },

        __init__: async function(pid, initArgs) {
            this.pid = pid;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;
            this._upid = (initArgs && initArgs.upid) || null;
            this.eventHandlers = [];

            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info('ZEROSHUB', 'DevBridge 初始化 PID=' + pid);
            }

            var guiContainer = (initArgs && initArgs.guiContainer) || document.getElementById('gui-container');
            if (!guiContainer) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('ZEROSHUB', '未找到 gui-container');
                return;
            }

            this.window = document.createElement('div');
            this.window.className = 'zeroshub-window zos-gui-window';
            this.window.dataset.pid = String(pid);
            this.window.style.cssText = 'width:520px;height:620px;min-width:420px;min-height:500px;position:relative;display:flex;flex-direction:column;overflow:hidden;';

            var dragStrip = document.createElement('div');
            dragStrip.className = 'zeroshub-drag-strip';
            dragStrip.style.cssText = 'height:32px;min-height:32px;max-height:32px;flex-shrink:0;cursor:move;user-select:none;display:flex;align-items:center;padding:0 0 0 14px;box-sizing:border-box;background:var(--theme-window-titlebar-bg,rgba(0,0,0,0.15));color:var(--theme-text-primary,#e2e8f0);font-size:13px;font-weight:500;';
            var titleLeft = document.createElement('div');
            titleLeft.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

            var icon = null;
            if (typeof ApplicationAssetManager !== 'undefined') {
                icon = ApplicationAssetManager.getIcon('zeroshub');
            }
            if (icon) {
                var iconEl = document.createElement('img');
                var iconUrl = (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function')
                    ? ProcessManager.convertVirtualPathToUrl(icon) : icon;
                iconEl.src = iconUrl;
                iconEl.alt = '';
                iconEl.style.cssText = 'width:16px;height:16px;pointer-events:none;';
                titleLeft.appendChild(iconEl);
            }
            var dragTitle = document.createElement('span');
            dragTitle.textContent = 'DevBridge';
            titleLeft.appendChild(dragTitle);
            dragStrip.appendChild(titleLeft);

            var titleSpacer = document.createElement('div');
            titleSpacer.style.cssText = 'flex:1;min-width:0;';
            dragStrip.appendChild(titleSpacer);

            this.window.appendChild(dragStrip);

            this._body = document.createElement('div');
            this._body.className = 'zeroshub-body';
            this._body.style.cssText = 'flex:1;min-height:0;overflow-y:auto;';
            this.window.appendChild(this._body);

            if (typeof GUIManager !== 'undefined') {
                var windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: 'DevBridge',
                    icon: icon,
                    borderless: true,
                    noTitleBar: true,
                    dragHandle: dragStrip,
                    onClose: function() {}
                });
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                    this._addWindowControlButtons(dragStrip);
                }
            }

            guiContainer.appendChild(this.window);

            await this._loadConfig();
            this._render();

            this._registerEventHandlers();
        },

        __exit__: async function() {
            if (typeof KernelLogger !== 'undefined') KernelLogger.info('ZEROSHUB', 'DevBridge 退出');

            this._stopPolling();

            if (this._bridgeActive) {
                try { await this._removeBridgeSilent(); } catch (e) {}
            }

            if (typeof EventManager !== 'undefined') {
                for (var i = 0; i < this.eventHandlers.length; i++) {
                    try { EventManager.unregisterEventHandler(this.pid, this.eventHandlers[i]); } catch (e) {}
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
            this._body = null;
            this._kernelAPI = null;
        },

        // ---- Config ----

        _loadConfig: async function() {
            var self = this;
            try {
                if (typeof LStorage !== 'undefined' && typeof LStorage.get === 'function') {
                    var stored = LStorage.get(LSTORAGE_KEY);
                    if (stored && typeof stored === 'object') {
                        self._config = stored;
                        self._bridgeToken = stored.token || null;
                        return;
                    }
                }
            } catch (e) {}
            self._config = {};
            self._bridgeToken = null;
        },

        _saveConfig: async function() {
            var self = this;
            try {
                if (typeof LStorage !== 'undefined' && typeof LStorage.set === 'function') {
                    LStorage.set(LSTORAGE_KEY, {
                        token: self._bridgeToken,
                        installedAt: self._config.installedAt || Date.now(),
                        version: '1.0.0'
                    });
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('ZEROSHUB', '保存配置失败: ' + (e && e.message));
            }
        },

        // ---- Render ----

        _render: function() {
            if (!this._body) return;
            this._body.innerHTML = '';
            if (this._bridgeToken) {
                this._renderHub(this._body);
            } else {
                this._renderWizard(this._body);
            }
        },

        _renderWizard: function(body) {
            var self = this;
            body.innerHTML = '';

            var wizard = document.createElement('div');
            wizard.className = 'zeroshub-wizard zeroshub-fade-in';

            var icon = document.createElement('img');
            icon.className = 'zeroshub-wizard-icon';
            icon.src = this._getAssetUrl('assets/icon.svg');
            icon.alt = 'DevBridge';
            icon.onerror = function() { icon.style.display = 'none'; };
            wizard.appendChild(icon);

            var title = document.createElement('h2');
            title.className = 'zeroshub-wizard-title';
            title.textContent = 'DevBridge - 远程桥接器';
            wizard.appendChild(title);

            var desc = document.createElement('p');
            desc.className = 'zeroshub-wizard-desc';
            desc.innerHTML = '为外部开发工具（如 AI 助手、CI/CD 管线）提供<strong>安全、可控</strong>的 ZerOS 系统访问通道。<br><br>安装后将在系统盘写入一个受 token 保护的 PHP 桥接端点，仅持有令牌的外部调用方可访问。';
            wizard.appendChild(desc);

            var permList = document.createElement('div');
            permList.className = 'zeroshub-permission-list';
            permList.innerHTML =
                '<div class="zeroshub-permission-item"><span class="perm-badge danger">高危</span> 磁盘写入 — 写入桥接 PHP 文件到 D:/server/</div>' +
                '<div class="zeroshub-permission-item"><span class="perm-badge danger">高危</span> 磁盘删除 — 卸载时清理 PHP 文件</div>' +
                '<div class="zeroshub-permission-item"><span class="perm-badge warn">特殊</span> 系统存储 — 持久化认证令牌</div>' +
                '<div class="zeroshub-permission-item"><span class="perm-badge normal">普通</span> GUI 窗口 / 事件监听</div>';
            wizard.appendChild(permList);

            var note = document.createElement('p');
            note.style.cssText = 'font-size:11px;color:#64748b;max-width:380px;margin:0 auto 24px;line-height:1.5;';
            note.innerHTML = '<strong>安全承诺：</strong><br>PHP 桥接使用 64 位随机令牌认证，拒绝无令牌请求；内置频率限制防止滥用；卸载时自动清除所有痕迹。';
            wizard.appendChild(note);

            var actions = document.createElement('div');
            actions.className = 'zeroshub-wizard-actions';

            var installBtn = document.createElement('button');
            installBtn.className = 'zeroshub-btn zeroshub-btn-primary';
            installBtn.textContent = '安装并启用桥接';
            installBtn.addEventListener('click', function() { self._installBridge(installBtn); });
            actions.appendChild(installBtn);

            var cancelBtn = document.createElement('button');
            cancelBtn.className = 'zeroshub-btn zeroshub-btn-ghost';
            cancelBtn.textContent = '稍后设置';
            cancelBtn.addEventListener('click', function() {
                self._exitApp();
            });
            actions.appendChild(cancelBtn);

            wizard.appendChild(actions);
            body.appendChild(wizard);
        },

        _renderHub: function(body) {
            var self = this;
            body.innerHTML = '';
            body.classList.add('zeroshub-fade-in');

            // Status card
            var statusCard = document.createElement('div');
            statusCard.className = 'zeroshub-status-card ' + (this._bridgeActive ? 'active' : 'inactive');
            statusCard.setAttribute('data-role', 'status-card');

            var dot = document.createElement('div');
            dot.className = 'zeroshub-status-dot ' + (this._bridgeActive ? 'green' : 'red');
            dot.setAttribute('data-role', 'status-dot');
            statusCard.appendChild(dot);

            var statusText = document.createElement('div');
            statusText.className = 'zeroshub-status-text';
            statusText.innerHTML = '<div class="zeroshub-status-label" data-role="status-label">' +
                (this._bridgeActive ? '桥接已启用' : '桥接已停止') +
                '</div><div class="zeroshub-status-desc" data-role="status-desc">' +
                (this._bridgeActive ? '外部工具可通过 PHP 端点访问系统' : '点击按钮启用桥接') +
                '</div>';
            statusCard.appendChild(statusText);

            var statusActions = document.createElement('div');
            statusActions.className = 'zeroshub-status-actions';
            statusActions.setAttribute('data-role', 'status-actions');

            var toggleBtn = document.createElement('button');
            toggleBtn.className = 'zeroshub-btn ' + (this._bridgeActive ? 'zeroshub-btn-danger' : 'zeroshub-btn-success');
            toggleBtn.setAttribute('data-role', 'toggle-btn');
            toggleBtn.textContent = this._bridgeActive ? '停止桥接' : '启用桥接';
            toggleBtn.addEventListener('click', function() {
                if (self._bridgeActive) { self._stopBridge(); }
                else { self._startBridge(); }
            });
            statusActions.appendChild(toggleBtn);

            var uninstallBtn = document.createElement('button');
            uninstallBtn.className = 'zeroshub-btn zeroshub-btn-ghost zeroshub-btn-sm';
            uninstallBtn.textContent = '卸载';
            uninstallBtn.title = '删除 PHP 文件并清除配置';
            uninstallBtn.addEventListener('click', function() { self._uninstallBridge(); });
            statusActions.appendChild(uninstallBtn);

            statusCard.appendChild(statusActions);
            body.appendChild(statusCard);

            // URL card
            var urlCard = document.createElement('div');
            urlCard.className = 'zeroshub-card';
            urlCard.innerHTML = '<div class="zeroshub-card-title" style="display:flex;justify-content:space-between;align-items:center;">' +
                '桥接端点<span style="font-weight:400;font-size:10px;color:#64748b;">一键复制 URL 给开发者</span></div>' +
                '<div style="font-size:12px;color:var(--theme-text-secondary,#94a3b8);margin-bottom:6px;">外部工具通过此 URL + Token 访问系统</div>' +
                '<div class="zeroshub-url-box" data-role="bridge-url">' + this._getBridgeUrl() + '</div>';
            var urlCopyBtn = document.createElement('button');
            urlCopyBtn.className = 'zeroshub-btn zeroshub-btn-sm zeroshub-btn-primary';
            urlCopyBtn.style.cssText = 'margin-top:8px;';
            urlCopyBtn.textContent = '复制 URL';
            urlCopyBtn.addEventListener('click', function() {
                self._copyToClipboard(self._getBridgeUrl());
                urlCopyBtn.textContent = '已复制!';
                setTimeout(function() { urlCopyBtn.textContent = '复制 URL'; }, 2000);
            });
            urlCard.appendChild(urlCopyBtn);
            body.appendChild(urlCard);

            // Token card
            var tokenCard = document.createElement('div');
            tokenCard.className = 'zeroshub-card';
            tokenCard.innerHTML = '<div class="zeroshub-card-title">认证令牌</div>' +
                '<div class="zeroshub-token-row">' +
                '<span class="zeroshub-token-text" data-role="token-text">' + this._bridgeToken + '</span>' +
                '</div>';
            var copyBtn = document.createElement('button');
            copyBtn.className = 'zeroshub-btn zeroshub-btn-sm zeroshub-btn-primary';
            copyBtn.style.cssText = 'margin-top:8px;';
            copyBtn.textContent = '复制令牌';
            copyBtn.addEventListener('click', function() {
                self._copyToClipboard(self._bridgeToken);
                copyBtn.textContent = '已复制!';
                setTimeout(function() { copyBtn.textContent = '复制令牌'; }, 2000);
            });
            tokenCard.appendChild(copyBtn);
            body.appendChild(tokenCard);

            // System info card
            var infoCard = document.createElement('div');
            infoCard.className = 'zeroshub-card';
            infoCard.setAttribute('data-role', 'info-card');
            infoCard.innerHTML = '<div class="zeroshub-card-title">系统信息</div>' +
                '<div class="zeroshub-info-grid" data-role="info-grid">' +
                this._buildInfoGrid() +
                '</div>';
            body.appendChild(infoCard);

            // Log card
            var logCard = document.createElement('div');
            logCard.className = 'zeroshub-card';
            logCard.innerHTML = '<div class="zeroshub-card-title" style="display:flex;justify-content:space-between;align-items:center;">' +
                '活动日志<span data-role="log-count" style="font-weight:400;font-size:10px;color:#64748b;">' +
                this._logLines.length + ' 条</span></div>' +
                '<div class="zeroshub-log" data-role="log-container">' + this._buildLogHtml() + '</div>';
            body.appendChild(logCard);

            if (this._bridgeActive) {
                this._startPolling();
            }
        },

        _buildInfoGrid: function() {
            var parts = [];
            parts.push('<div class="zeroshub-info-item"><span class="zeroshub-info-key">系统名称</span><span class="zeroshub-info-val">' +
                (typeof SystemInformation !== 'undefined' ? SystemInformation.getSystemName() : 'ZerOS') + '</span></div>');
            parts.push('<div class="zeroshub-info-item"><span class="zeroshub-info-key">系统版本</span><span class="zeroshub-info-val">' +
                (typeof SystemInformation !== 'undefined' ? SystemInformation.getSystemVersion() : '-') + '</span></div>');
            parts.push('<div class="zeroshub-info-item"><span class="zeroshub-info-key">内核版本</span><span class="zeroshub-info-val">' +
                (typeof SystemInformation !== 'undefined' ? SystemInformation.getKernelVersion() : '-') + '</span></div>');
            parts.push('<div class="zeroshub-info-item"><span class="zeroshub-info-key">后端类型</span><span class="zeroshub-info-val">' +
                (typeof SystemInformation !== 'undefined' && typeof SystemInformation.getBackendType === 'function' ?
                    SystemInformation.getBackendType() : '-') + '</span></div>');
            parts.push('<div class="zeroshub-info-item"><span class="zeroshub-info-key">PID</span><span class="zeroshub-info-val">' +
                this.pid + '</span></div>');
            parts.push('<div class="zeroshub-info-item"><span class="zeroshub-info-key">用户代理</span><span class="zeroshub-info-val">' +
                (typeof navigator !== 'undefined' ? (navigator.userAgent || '').substring(0, 40) + '...' : '-') + '</span></div>');
            return parts.join('');
        },

        _buildLogHtml: function() {
            if (this._logLines.length === 0) {
                return '<div style="color:#64748b;font-size:11px;text-align:center;padding:16px;">暂无活动</div>';
            }
            var html = '';
            for (var i = this._logLines.length - 1; i >= 0; i--) {
                var entry = this._logLines[i];
                var cls = entry.type === 'error' ? ' error' : (entry.type === 'success' ? ' success' : (entry.type === 'warn' ? ' warn' : ''));
                html += '<div class="zeroshub-log-entry"><span class="zeroshub-log-time">' + entry.time + '</span>' +
                    '<span class="zeroshub-log-msg' + cls + '">' + this._escapeHtml(entry.msg) + '</span></div>';
            }
            return html;
        },

        // ---- Bridge Management ----

        _installBridge: async function(btn) {
            var self = this;
            if (btn) { btn.disabled = true; btn.textContent = '正在安装...'; }

            self._addLog('info', '开始安装桥接...');

            try {
                self._bridgeToken = self._generateToken();
                self._addLog('info', '已生成认证令牌');

                var phpContent = self._getPhpTemplate(self._bridgeToken);
                var writeSuccess = await self._writeFile(PHP_SERVER_PATH, phpContent);

                if (!writeSuccess) {
                    throw new Error('写入 PHP 文件失败');
                }
                self._addLog('success', 'PHP 桥接文件已写入 ' + PHP_SERVER_PATH);

                self._config.installedAt = Date.now();
                await self._saveConfig();

                self._bridgeActive = true;
                self._addLog('success', '桥接安装并启用成功');

                try { await self._writeFileJsonViaKernel(CMD_QUEUE_FILE, { commands: [] }); } catch (e) {}

                if (typeof NotificationManager !== 'undefined') {
                    try {
                        NotificationManager.show({
                            title: 'DevBridge 已就绪',
                            message: '桥接端点已部署，外部工具可通过 token 访问系统',
                            type: 'success',
                            duration: 4000
                        });
                    } catch (e) {}
                }

                self._render();

            } catch (e) {
                self._addLog('error', '安装失败: ' + (e && e.message));
                if (btn) { btn.disabled = false; btn.textContent = '安装并启用桥接'; }
                if (typeof GUIManager !== 'undefined') {
                    try { GUIManager.showAlert('安装失败: ' + (e && e.message), '错误', 'error'); } catch (ex) {}
                }
            }
        },

        _startBridge: async function() {
            var self = this;
            if (!self._bridgeToken) {
                self._addLog('warn', '未安装桥接，请先安装');
                return;
            }

            self._addLog('info', '正在启用桥接...');

            try {
                var phpContent = self._getPhpTemplate(self._bridgeToken);
                await self._writeFile(PHP_SERVER_PATH, phpContent);
                self._bridgeActive = true;
                self._addLog('success', '桥接已启用');
                try { await self._writeFileJsonViaKernel(CMD_QUEUE_FILE, { commands: [] }); } catch (e) {}
                self._refreshHub();
                self._startPolling();
            } catch (e) {
                self._addLog('error', '启用失败: ' + (e && e.message));
            }
        },

        _stopBridge: async function() {
            this._stopPolling();
            this._bridgeActive = false;
            this._refreshHub();
        },

        _uninstallBridge: async function() {
            var self = this;
            if (typeof GUIManager !== 'undefined') {
                try {
                    var confirmed = await GUIManager.showConfirm(
                        '确定要卸载 DevBridge 吗？\n\n这将：\n· 删除 PHP 桥接文件\n· 清除认证令牌\n· 停止所有桥接活动\n\n此操作不可撤销。',
                        '确认卸载',
                        'warning'
                    );
                    if (!confirmed) return;
                } catch (e) {}
            }

            self._addLog('info', '正在卸载桥接...');
            self._stopPolling();

            try {
                await self._deleteFile(PHP_SERVER_PATH);

                try { await self._deleteFile(CMD_QUEUE_FILE); } catch (e) {}
                try { await self._deleteFile(CMD_RESP_FILE); } catch (e) {}

                self._addLog('success', 'PHP 桥接文件已删除');
            } catch (e) {
                self._addLog('error', '删除 PHP 文件失败: ' + (e && e.message));
            }

            self._bridgeActive = false;
            self._bridgeToken = null;
            self._config = {};

            try {
                if (typeof LStorage !== 'undefined' && typeof LStorage.remove === 'function') {
                    LStorage.remove(LSTORAGE_KEY);
                }
            } catch (e) {}

            self._addLog('success', 'DevBridge 已完全卸载');
            self._render();
        },

        _removeBridgeSilent: async function() {
            try { await this._deleteFile(PHP_SERVER_PATH); } catch (e) {}
            try { await this._deleteFile(CMD_QUEUE_FILE); } catch (e) {}
            try { await this._deleteFile(CMD_RESP_FILE); } catch (e) {}
        },

        // ---- Command Polling ----

        _startPolling: function() {
            var self = this;
            if (self._pollTimer) return;
            self._pollTimer = setInterval(function() { self._pollCommands(); }, POLL_INTERVAL_MS);
        },

        _stopPolling: function() {
            if (this._pollTimer) {
                clearInterval(this._pollTimer);
                this._pollTimer = null;
            }
        },

        _pollCommands: async function() {
            var self = this;
            try {
                var queueData = await self._readFileJsonViaKernel(CMD_QUEUE_FILE);
                if (!queueData || !queueData.commands || queueData.commands.length === 0) return;

                var processed = false;
                for (var i = queueData.commands.length - 1; i >= 0; i--) {
                    var cmd = queueData.commands[i];
                    if (cmd.processed) continue;

                    self._addLog('info', '收到外部命令: ' + (cmd.action || cmd.type || 'unknown'));
                    var result = await self._executeCommand(cmd);

                    var resp = {
                        cmd_id: cmd.cmd_id,
                        status: result.status || 'ok',
                        data: result.data || null,
                        error: result.error || null,
                        timestamp: Date.now()
                    };
                    await self._writeFileJsonViaKernel(CMD_RESP_FILE, resp);

                    cmd.processed = true;
                    cmd.completedAt = Date.now();
                    processed = true;
                    self._addLog('success', '命令执行完成: ' + cmd.cmd_id);
                }

                if (processed) {
                    await self._writeFileJsonViaKernel(CMD_QUEUE_FILE, queueData);
                }
            } catch (e) {}
        },

        _readFileJsonViaKernel: async function(filePath) {
            try {
                var lastSlash = filePath.lastIndexOf('/');
                var dir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : 'D:/';
                var fileName = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;
                var content = await this._readFileText(dir, fileName);
                return content ? JSON.parse(content) : null;
            } catch (e) {
                return null;
            }
        },

        _writeFileJsonViaKernel: async function(filePath, data) {
            await this._writeFile(filePath, JSON.stringify(data));
        },

        _executeCommand: async function(cmd) {
            try {
                switch (cmd.action) {
                    case 'status':
                        return { status: 'ok', data: {
                            bridgeActive: this._bridgeActive,
                            pid: this.pid,
                            systemName: typeof SystemInformation !== 'undefined' ? SystemInformation.getSystemName() : 'ZerOS',
                            systemVersion: typeof SystemInformation !== 'undefined' ? SystemInformation.getSystemVersion() : '-',
                            kernelVersion: typeof SystemInformation !== 'undefined' ? SystemInformation.getKernelVersion() : '-',
                            backendType: typeof SystemInformation !== 'undefined' && typeof SystemInformation.getBackendType === 'function' ? SystemInformation.getBackendType() : '-',
                            timestamp: Date.now()
                        }};

                    case 'info':
                        return { status: 'ok', data: {
                            pid: this.pid,
                            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '-',
                            screenWidth: typeof screen !== 'undefined' ? screen.width : 0,
                            screenHeight: typeof screen !== 'undefined' ? screen.height : 0,
                            language: typeof navigator !== 'undefined' ? navigator.language : '-',
                            online: typeof navigator !== 'undefined' ? navigator.onLine : false,
                            timestamp: Date.now()
                        }};

                    case 'list_dir':
                        return { status: 'ok', data: await this._listDir(cmd.path || 'D:/') };

                    case 'read_file':
                        return { status: 'ok', data: { content: await this._readFileText(cmd.path || 'D:/', cmd.fileName || '') }};

                    case 'write_file':
                        var wpath = cmd.path || 'D:/';
                        var wname = cmd.fileName || '';
                        var wcontent = cmd.content || '';
                        await this._writeFileViaParams(wpath, wname, wcontent);
                        return { status: 'ok', data: { written: wpath + '/' + wname }};

                    case 'delete_file':
                        if (cmd.fileName) {
                            await this._deleteFileByParams(cmd.path || 'D:/', cmd.fileName);
                        } else {
                            await this._deleteFile(cmd.path);
                        }
                        return { status: 'ok', data: { deleted: true }};

                    case 'create_dir':
                        await this._createDir(cmd.path || 'D:/', cmd.name || '');
                        return { status: 'ok', data: { created: cmd.path + '/' + cmd.name }};

                    case 'delete_dir':
                        await this._deleteDir(cmd.path || '');
                        return { status: 'ok', data: { deleted: true }};

                    case 'check_file':
                        return { status: 'ok', data: { exists: await this._fileExists(cmd.path || '') }};

                    case 'log':
                        return { status: 'ok', data: { logs: this._logLines.slice(-30) }};

                    case 'ping':
                        return { status: 'ok', data: { pong: true, timestamp: Date.now() }};

                    case 'start_program':
                        var pn = cmd.name || 'terminal';
                        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.startProgram === 'function') {
                            await ProcessManager.startProgram(pn, cmd.args || {});
                            return { status: 'ok', data: { started: pn }};
                        }
                        return { status: 'error', error: 'ProcessManager.startProgram 不可用' };

                    case 'kill_program':
                        var kpid = cmd.pid;
                        if (kpid && typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                            await ProcessManager.killProgram(kpid);
                            return { status: 'ok', data: { killed: kpid }};
                        }
                        return { status: 'error', error: '需要 pid 参数' };

                    case 'list_processes':
                        var raw = [];
                        if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getProcessInfo === 'function') {
                            try { raw = ProcessManager.getProcessInfo() || []; } catch (e) {}
                        }
                        if (raw.length === 0 && typeof MemoryManager !== 'undefined' && typeof MemoryManager.checkMemory === 'function') {
                            try {
                                var mem = MemoryManager.checkMemory();
                                if (mem && mem.programs) raw = mem.programs;
                            } catch (e) {}
                        }
                        var plist = [];
                        for (var i = 0; i < raw.length; i++) {
                            var p = raw[i];
                            if (!p || !p.pid) continue;
                            plist.push({
                                pid: p.pid,
                                name: p.programName || '',
                                status: p.status || 'unknown',
                                startTime: p.startTime || null,
                                exitTime: p.exitTime || null,
                                type: (p.metadata && p.metadata.type) || (p.isCLI ? 'CLI' : 'GUI'),
                                category: (p.metadata && p.metadata.category) || ''
                            });
                        }
                        return { status: 'ok', data: { processes: plist, count: plist.length }};

                    case 'list_services':
                        var sids = [];
                        if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                            try { sids = (await this._kernelAPI.call('Server.listServices', [])) || []; } catch (e) {}
                        }
                        return { status: 'ok', data: { services: sids }};

                    case 'start_service':
                        var ssid = cmd.service || '';
                        if (ssid && this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                            await this._kernelAPI.call('Server.start', [ssid]);
                            return { status: 'ok', data: { started: ssid }};
                        }
                        return { status: 'error', error: '需要 service 参数或 kernelAPI 不可用' };

                    case 'stop_service':
                        var spid = cmd.service || '';
                        if (spid && this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                            await this._kernelAPI.call('Server.stop', [spid]);
                            return { status: 'ok', data: { stopped: spid }};
                        }
                        return { status: 'error', error: '需要 service 参数或 kernelAPI 不可用' };

                    case 'show_notification':
                        if (typeof NotificationManager !== 'undefined') {
                            try {
                                await NotificationManager.show({
                                    title: cmd.title || 'DevBridge',
                                    message: cmd.message || '',
                                    type: cmd.type || 'info',
                                    duration: cmd.duration || 4000
                                });
                            } catch (e) {}
                        }
                        return { status: 'ok', data: { shown: true }};

                    case 'get_theme':
                        var theme = null;
                        if (typeof ThemeManager !== 'undefined' && typeof ThemeManager.getCurrentTheme === 'function') {
                            try { theme = ThemeManager.getCurrentTheme(); } catch (e) {}
                        }
                        return { status: 'ok', data: { theme: theme }};

                    case 'install_perflog':
                        var perflogContent = this._getPerflogTemplate();
                        await this._writeFileViaParams('D:/server', 'server-perflog.js', perflogContent);
                        if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                            try { await this._kernelAPI.call('Server.loadAll', []); } catch (e) {}
                            try { await this._kernelAPI.call('Server.start', ['perflog']); } catch (e) {}
                        }
                        return { status: 'ok', data: { installed: 'server-perflog.js', effect: 'action日志已关闭，仅在任务管理器运行时临时开启' }};

                    case 'uninstall_perflog':
                        if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                            try { await this._kernelAPI.call('Server.stop', ['perflog']); } catch (e) {}
                        }
                        await this._deleteFile('D:/server/server-perflog.js');
                        ProcessManager._logProgramAction = this._perflogOriginal || ProcessManager._logProgramAction;
                        return { status: 'ok', data: { uninstalled: true }};

                    default:
                        return { status: 'error', error: 'Unknown command: ' + (cmd.action || '') };
                }
            } catch (e) {
                return { status: 'error', error: (e && e.message) || 'Execution failed' };
            }
        },

        _writeFileViaParams: async function(path, fileName, content) {
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                try {
                    var fp = path + '/' + fileName;
                    await this._kernelAPI.call('FileSystem.write', [fp, content]);
                    return;
                } catch (e) {}
            }
            await this._writeFile(path + '/' + fileName, content);
        },

        _deleteFileByParams: async function(path, fileName) {
            await this._deleteFile(path + '/' + fileName);
        },

        _createDir: async function(path, name) {
            var url = this._buildUrl('FSDirve', { action: 'create_dir', path: path, name: name });
            var res = await fetch(url);
            var data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'create_dir 失败');
        },

        _deleteDir: async function(path) {
            var url = this._buildUrl('FSDirve', { action: 'delete_dir_recursive', path: path });
            var res = await fetch(url);
            var data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'delete_dir_recursive 失败');
        },

        // ---- File System Helpers ----

        _buildUrl: function(serviceName, params) {
            if (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) {
                var nameMap = {
                    FSDirve: SystemInformation.SERVICE_NAMES.FSDIRVE,
                    CompressionDirve: SystemInformation.SERVICE_NAMES.COMPRESSION_DIRVE,
                    DISKMANAGER: SystemInformation.SERVICE_NAMES.DISKMANAGER
                };
                var key = nameMap[serviceName] || serviceName;
                var url = SystemInformation.buildServiceUrlObject(key, { upid: this._upid });
                if (params) {
                    for (var k in params) {
                        if (params.hasOwnProperty(k)) url.searchParams.set(k, String(params[k]));
                    }
                }
                return url.toString();
            }
            var origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:8089';
            var pathMap = {
                FSDirve: (typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath) ? SystemInformation.getFSDirvePath() : '/system/service/FSDirve.php',
                CompressionDirve: (typeof SystemInformation !== 'undefined' && SystemInformation.getCompressionDirvePath) ? SystemInformation.getCompressionDirvePath() : '/system/service/CompressionDirve.php'
            };
            var url = new URL(pathMap[serviceName] || serviceName, (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin) ? SystemInformation.getOrigin() : origin);
            if (this._upid != null) url.searchParams.set('upid', String(this._upid));
            if (params) {
                for (var k2 in params) {
                    if (params.hasOwnProperty(k2)) url.searchParams.set(k2, String(params[k2]));
                }
            }
            return url.toString();
        },

        _writeFile: async function(filePath, content) {
            // Parse path into dir + filename
            var lastSlash = filePath.lastIndexOf('/');
            var dir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : 'D:/';
            var fileName = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;

            // First try via kernelAPI
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                try {
                    await this._kernelAPI.call('FileSystem.write', [filePath, content]);
                    return true;
                } catch (e) {}
            }

            // Fallback: FSDirve POST
            var url = this._buildUrl('FSDirve', {
                action: 'write_file',
                path: dir,
                fileName: fileName,
                writeMod: 'overwrite'
            });
            var res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: content })
            });
            var data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'write_file 失败');
            return true;
        },

        _deleteFile: async function(filePath) {
            var lastSlash = filePath.lastIndexOf('/');
            var dir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : 'D:/';
            var fileName = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;

            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                try {
                    await this._kernelAPI.call('FileSystem.delete', [filePath]);
                    return true;
                } catch (e) {}
            }

            var url = this._buildUrl('FSDirve', {
                action: 'delete_file',
                path: dir,
                fileName: fileName
            });
            var res = await fetch(url);
            if (!res.ok) {
                var data = await res.json();
                if (data.message && data.message.indexOf('不存在') >= 0) return true;
                throw new Error(data.message || 'delete_file 失败');
            }
            return true;
        },

        _listDir: async function(path) {
            var url = this._buildUrl('FSDirve', { action: 'list_dir', path: path || 'D:' });
            var res = await fetch(url);
            var data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'list_dir 失败');
            return data.data || {};
        },

        _readFileText: async function(path, fileName) {
            var url = this._buildUrl('FSDirve', {
                action: 'read_file',
                path: path,
                fileName: fileName
            });
            var res = await fetch(url);
            var data = await res.json();
            if (!res.ok || data.status !== 'success') throw new Error(data.message || 'read_file 失败');
            return (data.data && data.data.content) || '';
        },

        _readFileJson: async function(filePath) {
            try {
                var lastSlash = filePath.lastIndexOf('/');
                var dir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : 'D:/';
                var fileName = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;
                var url = this._buildUrl('FSDirve', { action: 'read_file', path: dir, fileName: fileName });
                var res = await fetch(url);
                if (!res.ok) return null;
                var data = await res.json();
                if (data.status !== 'success') return null;
                var text = (data.data && data.data.content) || '';
                return text ? JSON.parse(text) : null;
            } catch (e) {
                return null;
            }
        },

        _writeFileJson: async function(filePath, data) {
            return await this._writeFile(filePath, JSON.stringify(data));
        },

        _fileExists: async function(filePath) {
            try {
                var url = this._buildUrl('FSDirve', { action: 'check_path_exists', path: filePath });
                var res = await fetch(url);
                var data = await res.json();
                return data.status === 'success' && data.data && data.data.exists;
            } catch (e) {
                return false;
            }
        },

        // ---- Helpers ----

        _generateToken: function() {
            var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            var arr = new Uint32Array(64);
            if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
                crypto.getRandomValues(arr);
            } else {
                for (var i = 0; i < 64; i++) { arr[i] = Math.floor(Math.random() * 4294967296); }
            }
            var token = '';
            for (var j = 0; j < 64; j++) {
                token += chars.charAt(arr[j] % chars.length);
            }
            return 'zos_' + token;
        },

        _getBridgeUrl: function() {
            var origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:8089';
            return origin + '/system/service/DISK/D/server/' + PHP_FILENAME;
        },

        _getAssetUrl: function(relativePath) {
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
                return ProcessManager.convertVirtualPathToUrl('D:/application/zeroshub/' + relativePath);
            }
            return 'assets/' + relativePath.split('/').pop();
        },

        _refreshHub: function() {
            if (this._body) {
                this._body.innerHTML = '';
                this._renderHub(this._body);
            }
        },

        _addLog: function(type, msg) {
            var now = new Date();
            var time = ('0' + now.getHours()).slice(-2) + ':' +
                ('0' + now.getMinutes()).slice(-2) + ':' +
                ('0' + now.getSeconds()).slice(-2);
            this._logLines.push({ time: time, type: type, msg: msg });
            if (this._logLines.length > 100) this._logLines.shift();

            if (typeof KernelLogger !== 'undefined') {
                if (type === 'error') KernelLogger.error('ZEROSHUB', msg);
                else if (type === 'warn') KernelLogger.warn('ZEROSHUB', msg);
                else KernelLogger.info('ZEROSHUB', msg);
            }
        },

        _escapeHtml: function(str) {
            var div = document.createElement('div');
            div.appendChild(document.createTextNode(str));
            return div.innerHTML;
        },

        _copyToClipboard: function(text) {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(function() {});
            }
        },

        _addWindowControlButtons: function(dragStrip) {
            if (typeof GUIManager === 'undefined' || !this.windowId) return;
            var self = this;
            var btnStyle = 'width:28px;height:28px;border:none;background:transparent;color:var(--theme-text-primary,rgba(215,224,221,0.8));cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;flex-shrink:0;';
            var controls = document.createElement('div');
            controls.style.cssText = 'display:flex;align-items:center;cursor:default;';

            var minBtn = document.createElement('button');
            minBtn.title = '最小化';
            minBtn.innerHTML = '−';
            minBtn.style.cssText = btnStyle;
            minBtn.addEventListener('click', function(e) { e.stopPropagation(); GUIManager.minimizeWindow(self.windowId); });
            minBtn.addEventListener('mouseenter', function() { minBtn.style.background = 'rgba(255,255,255,0.08)'; });
            minBtn.addEventListener('mouseleave', function() { minBtn.style.background = 'transparent'; });

            var maxBtn = document.createElement('button');
            maxBtn.title = '最大化';
            maxBtn.innerHTML = '□';
            maxBtn.style.cssText = btnStyle;
            maxBtn.addEventListener('click', function(e) { e.stopPropagation(); GUIManager.toggleMaximize(self.windowId); });
            maxBtn.addEventListener('mouseenter', function() { maxBtn.style.background = 'rgba(255,255,255,0.08)'; });
            maxBtn.addEventListener('mouseleave', function() { maxBtn.style.background = 'transparent'; });

            var closeBtn = document.createElement('button');
            closeBtn.title = '关闭';
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText = btnStyle + ' font-size:20px;';
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof GUIManager._showTaskbar === 'function') GUIManager._showTaskbar();
                GUIManager._closeWindow(self.windowId, false);
            });
            closeBtn.addEventListener('mouseenter', function() { closeBtn.style.background = 'rgba(255,95,87,0.15)'; closeBtn.style.color = '#ff5f57'; });
            closeBtn.addEventListener('mouseleave', function() { closeBtn.style.background = 'transparent'; closeBtn.style.color = 'var(--theme-text-primary,rgba(215,224,221,0.8))'; });

            controls.appendChild(minBtn);
            controls.appendChild(maxBtn);
            controls.appendChild(closeBtn);
            controls.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            dragStrip.appendChild(controls);
        },

        _exitApp: function() {
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                this._kernelAPI.call('Process.requestSelfTermination', []).catch(function(e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('ZEROSHUB', 'requestSelfTermination 失败: ' + (e && e.message));
                    }
                });
                return;
            }
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function') {
                ProcessManager.killProgram(this.pid).catch(function() {});
            }
        },

        _registerEventHandlers: function() {
            // Most interactions handled via inline event listeners; EventManager mainly for global events
            if (typeof EventManager === 'undefined') return;
        },

        // ---- PHP Template ----

        _getPerflogTemplate: function() {
            return '// server-perflog.js\n' +
'// 关闭 ProcessManager action 日志，仅任务管理器运行时临时开启\n' +
'(function() {\n' +
'    var _orig = null, _patched = false, _timer = null, _tmr = false;\n' +
'    function _chk() {\n' +
'        try { var ps = ProcessManager.getProcessInfo() || [];\n' +
'            for (var i = 0; i < ps.length; i++) {\n' +
'                if (ps[i].status === "running" && ps[i].programName === "taskmanager") return true;\n' +
'            }\n' +
'        } catch (e) {}\n' +
'        return false;\n' +
'    }\n' +
'    function _on() {\n' +
'        if (!_patched && typeof ProcessManager !== "undefined" && typeof ProcessManager._logProgramAction === "function") {\n' +
'            _orig = ProcessManager._logProgramAction;\n' +
'            ProcessManager._actionLoggingEnabled = false;\n' +
'            ProcessManager._logProgramAction = function(p, a, d) {\n' +
'                if (!ProcessManager._actionLoggingEnabled) return;\n' +
'                return _orig.call(this, p, a, d);\n' +
'            };\n' +
'            _patched = true;\n' +
'        }\n' +
'    }\n' +
'    var api = {\n' +
'        __init__: function() { _on(); if (!_timer) { _timer = setInterval(function() { var w = _tmr; _tmr = _chk(); if (_tmr !== w && typeof ProcessManager !== "undefined") ProcessManager._actionLoggingEnabled = _tmr; }, 3000); } },\n' +
'        __start__: function() { _on(); if (!_timer) { _timer = setInterval(function() { var w = _tmr; _tmr = _chk(); if (_tmr !== w && typeof ProcessManager !== "undefined") ProcessManager._actionLoggingEnabled = _tmr; }, 3000); } },\n' +
'        __stop__: function() { if (_timer) { clearInterval(_timer); _timer = null; } if (typeof ProcessManager !== "undefined") ProcessManager._actionLoggingEnabled = false; },\n' +
'        __status__: function() { return { patched: _patched, taskManagerRunning: _tmr }; },\n' +
'        __info__: function() { return { name: "perflog", version: "1.0", description: "关闭 ProcessManager action 日志，任务管理器运行时临时开启" }; }\n' +
'    };\n' +
'    if (typeof window !== "undefined" && typeof window.__ZerOS_ServerExpansion_Register__ === "function") {\n' +
'        window.__ZerOS_ServerExpansion_Register__(api);\n' +
'    }\n' +
'})();\n';
        },

        _getPhpTemplate: function(token) {
            return '<?php\n' +
'/**\n' +
' * ZerOS DevBridge - PHP 桥接端点\n' +
' * 由 DevBridge 应用自动生成和管理\n' +
' * 安全机制：Token 认证 + 速率限制 + 输入校验\n' +
' */\n' +
'\n' +
'define(\'ZEROSHUB_TOKEN\', ' + JSON.stringify(token) + ');\n' +
'define(\'MAX_REQUESTS_PER_MINUTE\', 60);\n' +
'define(\'MAX_REQUEST_SIZE\', 65536);\n' +
'\n' +
'header(\'Content-Type: application/json; charset=utf-8\');\n' +
'header(\'X-Content-Type-Options: nosniff\');\n' +
'header(\'X-Frame-Options: DENY\');\n' +
'\n' +
'function fail($code, $msg) {\n' +
'    http_response_code($code);\n' +
'    echo json_encode([\'status\' => \'error\', \'message\' => $msg]);\n' +
'    exit;\n' +
'}\n' +
'\n' +
'function ok($data = null) {\n' +
'    echo json_encode([\'status\' => \'success\', \'data\' => $data]);\n' +
'    exit;\n' +
'}\n' +
'\n' +
'function validate_token() {\n' +
'    $token = isset($_GET[\'token\']) ? $_GET[\'token\'] : (isset($_POST[\'token\']) ? $_POST[\'token\'] : \'\');\n' +
'    if (!hash_equals(ZEROSHUB_TOKEN, $token)) {\n' +
'        fail(401, \'无效的认证令牌\');\n' +
'    }\n' +
'}\n' +
'\n' +
'function rate_limit() {\n' +
'    $ip = isset($_SERVER[\'REMOTE_ADDR\']) ? $_SERVER[\'REMOTE_ADDR\'] : \'unknown\';\n' +
'    $limit_file = __DIR__ . \'/.zeroshub_ratelimit.json\';\n' +
'    $data = @file_exists($limit_file) ? json_decode(@file_get_contents($limit_file), true) : [];\n' +
'    if (!is_array($data)) $data = [];\n' +
'    $now = time();\n' +
'    $window = intdiv($now, 60);\n' +
'    $key = $ip . \'_\' . $window;\n' +
'    $count = isset($data[$key]) ? $data[$key] : 0;\n' +
'    if ($count >= MAX_REQUESTS_PER_MINUTE) {\n' +
'        fail(429, \'请求频率超限，请稍后重试\');\n' +
'    }\n' +
'    $data[$key] = $count + 1;\n' +
'    $cleaned = [];\n' +
'    foreach ($data as $k => $v) {\n' +
'        if (isset($k) && is_string($k) && strlen($k) > 0) {\n' +
'            $parts = explode(\'_\', $k);\n' +
'            $w = isset($parts[1]) ? intval($parts[1]) : 0;\n' +
'            if ($w >= $window - 5) $cleaned[$k] = $v;\n' +
'        }\n' +
'    }\n' +
'    @file_put_contents($limit_file, json_encode($cleaned), LOCK_EX);\n' +
'}\n' +
'\n' +
'function read_queue() {\n' +
'    $file = __DIR__ . \'/.zeroshub_cmd_queue.json\';\n' +
'    if (!file_exists($file)) return [\'commands\' => []];\n' +
'    $data = json_decode(file_get_contents($file), true);\n' +
'    return is_array($data) ? $data : [\'commands\' => []];\n' +
'}\n' +
'\n' +
'function write_queue($queue) {\n' +
'    $file = __DIR__ . \'/.zeroshub_cmd_queue.json\';\n' +
'    file_put_contents($file, json_encode($queue), LOCK_EX);\n' +
'}\n' +
'\n' +
'function read_response($cmd_id) {\n' +
'    $file = __DIR__ . \'/.zeroshub_cmd_resp.json\';\n' +
'    if (!file_exists($file)) return null;\n' +
'    $data = json_decode(file_get_contents($file), true);\n' +
'    if (is_array($data) && isset($data[\'cmd_id\']) && $data[\'cmd_id\'] === $cmd_id) {\n' +
'        @unlink($file);\n' +
'        return $data;\n' +
'    }\n' +
'    return null;\n' +
'}\n' +
'\n' +
'function call_fsdrive($action, $params = []) {\n' +
'    $ctx = stream_context_create([\'http\' => [\'timeout\' => 5]]);\n' +
'    $query = http_build_query(array_merge([\'action\' => $action], $params));\n' +
'    $scheme = isset($_SERVER[\'HTTPS\']) && $_SERVER[\'HTTPS\'] === \'on\' ? \'https\' : \'http\';\n' +
'    $host = isset($_SERVER[\'HTTP_HOST\']) ? $_SERVER[\'HTTP_HOST\'] : \'localhost\';\n' +
'    $d = \'/system/service\';\n' +
'    if ($d === \'/\' || $d === \'\\\\\' || $d === \'.\') $d = \'\';\n' +
'    $url = $scheme . \'://\' . $host . $d . \'/FSDirve.php?\' . $query;\n' +
'    $resp = @file_get_contents($url, false, $ctx);\n' +
'    if ($resp === false) return null;\n' +
'    $data = json_decode($resp, true);\n' +
'    return is_array($data) ? $data : null;\n' +
'}\n' +
'\n' +
'function get_system_info() {\n' +
'    $info = [\'php_version\' => phpversion(), \'server_software\' => isset($_SERVER[\'SERVER_SOFTWARE\']) ? $_SERVER[\'SERVER_SOFTWARE\'] : \'unknown\', \'server_time\' => date(\'c\')];\n' +
'    return $info;\n' +
'}\n' +
'\n' +
'function cmd_status() {\n' +
'    ok([\'bridge\' => \'active\', \'token_valid\' => true, \'server_time\' => date(\'c\'), \'system\' => get_system_info()]);\n' +
'}\n' +
'\n' +
'function cmd_info() {\n' +
'    ok(get_system_info());\n' +
'}\n' +
'\n' +
'function cmd_queue_push() {\n' +
'    global $RAW_INPUT;\n' +
'    $body = json_decode($RAW_INPUT, true);\n' +
'    if (!$body || !isset($body[\'action\'])) {\n' +
'        fail(400, \'缺少 action 字段\');\n' +
'    }\n' +
'    $queue = read_queue();\n' +
'    if (!isset($queue[\'commands\'])) $queue[\'commands\'] = [];\n' +
'    $cmd_id = \'cmd_\' . dechex(time()) . \'_\' . bin2hex(random_bytes(4));\n' +
'    $body[\'cmd_id\'] = $cmd_id;\n' +
'    $body[\'created_at\'] = date(\'c\');\n' +
'    $body[\'processed\'] = false;\n' +
'    $queue[\'commands\'][] = $body;\n' +
'    while (count($queue[\'commands\']) > 50) array_shift($queue[\'commands\']);\n' +
'    write_queue($queue);\n' +
'    \n' +
'    $maxWait = 15;\n' +
'    $start = time();\n' +
'    while (time() - $start < $maxWait) {\n' +
'        usleep(300000);\n' +
'        $resp = read_response($cmd_id);\n' +
'        if ($resp) { ok($resp); }\n' +
'    }\n' +
'    ok([\'cmd_id\' => $cmd_id, \'status\' => \'queued\', \'message\' => \'命令已入队，等待浏览器端处理\']);\n' +
'}\n' +
'\n' +
'function cmd_queue_list() {\n' +
'    $queue = read_queue();\n' +
'    ok($queue);\n' +
'}\n' +
'\n' +
'function cmd_resp_get() {\n' +
'    $cmd_id = isset($_GET[\'cmd_id\']) ? trim($_GET[\'cmd_id\']) : \'\';\n' +
'    if (!$cmd_id) fail(400, \'缺少 cmd_id\');\n' +
'    $resp = read_response($cmd_id);\n' +
'    if ($resp) { ok($resp); }\n' +
'    ok([\'status\' => \'pending\', \'message\' => \'响应尚未就绪\']);\n' +
'}\n' +
'\n' +
'function cmd_fs_list() {\n' +
'    $path = isset($_GET[\'path\']) ? trim($_GET[\'path\']) : \'D:/\';\n' +
'    $data = call_fsdrive(\'list_dir\', [\'path\' => $path]);\n' +
'    if ($data === null) fail(500, \'FSDirve 调用失败\');\n' +
'    ok($data);\n' +
'}\n' +
'\n' +
'function cmd_fs_read() {\n' +
'    $path = isset($_GET[\'path\']) ? trim($_GET[\'path\']) : \'D:/\';\n' +
'    $fileName = isset($_GET[\'fileName\']) ? trim($_GET[\'fileName\']) : \'\';\n' +
'    if ($fileName === \'\') fail(400, \'缺少 fileName\');\n' +
'    $data = call_fsdrive(\'read_file\', [\'path\' => $path, \'fileName\' => $fileName]);\n' +
'    if ($data === null) fail(500, \'FSDirve 调用失败\');\n' +
'    ok($data);\n' +
'}\n' +
'\n' +
'function cmd_fs_write() {\n' +
'    global $RAW_INPUT;\n' +
'    $body = json_decode($RAW_INPUT, true);\n' +
'    if (!$body) fail(400, \'无效的请求体\');\n' +
'    $path = isset($body[\'path\']) ? trim($body[\'path\']) : \'D:/\';\n' +
'    $fileName = isset($body[\'fileName\']) ? trim($body[\'fileName\']) : \'\';\n' +
'    $content = isset($body[\'content\']) ? $body[\'content\'] : \'\';\n' +
'    if ($fileName === \'\') fail(400, \'缺少 fileName\');\n' +
'    $ctx = stream_context_create([\'http\' => [\'method\' => \'POST\', \'header\' => \'Content-Type: application/json\', \'content\' => json_encode([\'content\' => $content]), \'timeout\' => 10]]);\n' +
'    $scheme = isset($_SERVER[\'HTTPS\']) && $_SERVER[\'HTTPS\'] === \'on\' ? \'https\' : \'http\';\n' +
'    $host = isset($_SERVER[\'HTTP_HOST\']) ? $_SERVER[\'HTTP_HOST\'] : \'localhost\';\n' +
'    $d = \'/system/service\';\n' +
'    if ($d === \'/\' || $d === \'\\\\\' || $d === \'.\') $d = \'\';\n' +
'    $query = http_build_query([\'action\' => \'write_file\', \'path\' => $path, \'fileName\' => $fileName, \'writeMod\' => \'overwrite\']);\n' +
'    $url = $scheme . \'://\' . $host . $d . \'/FSDirve.php?\' . $query;\n' +
'    $resp = @file_get_contents($url, false, $ctx);\n' +
'    if ($resp === false) fail(500, \'FSDirve 写入失败\');\n' +
'    $data = json_decode($resp, true);\n' +
'    if (!is_array($data) || (isset($data[\'status\']) && $data[\'status\'] !== \'success\')) {\n' +
'        fail(500, isset($data[\'message\']) ? $data[\'message\'] : \'FSDirve 写入返回异常\');\n' +
'    }\n' +
'    ok($data);\n' +
'}\n' +
'\n' +
'function cmd_ping() {\n' +
'    ok([\'pong\' => true, \'time\' => date(\'c\')]);\n' +
'}\n' +
'\n' +
'validate_token();\n' +
'rate_limit();\n' +
'\n' +
'$RAW_INPUT = file_get_contents(\'php://input\');\n' +
'if ($_SERVER[\'REQUEST_METHOD\'] === \'POST\' && strlen($RAW_INPUT) > MAX_REQUEST_SIZE) {\n' +
'    fail(413, \'请求体过大\');\n' +
'}\n' +
'\n' +
'$action = isset($_GET[\'action\']) ? trim($_GET[\'action\']) : \'status\';\n' +
'\n' +
'switch ($action) {\n' +
'    case \'status\':\n' +
'        cmd_status();\n' +
'        break;\n' +
'    case \'info\':\n' +
'        cmd_info();\n' +
'        break;\n' +
'    case \'queue_push\':\n' +
'        if ($_SERVER[\'REQUEST_METHOD\'] !== \'POST\') fail(405, \'仅支持 POST\');\n' +
'        cmd_queue_push();\n' +
'        break;\n' +
'    case \'queue_list\':\n' +
'        cmd_queue_list();\n' +
'        break;\n' +
'    case \'resp_get\':\n' +
'        cmd_resp_get();\n' +
'        break;\n' +
'    case \'fs_list\':\n' +
'        cmd_fs_list();\n' +
'        break;\n' +
'    case \'fs_read\':\n' +
'        cmd_fs_read();\n' +
'        break;\n' +
'    case \'fs_write\':\n' +
'        if ($_SERVER[\'REQUEST_METHOD\'] !== \'POST\') fail(405, \'仅支持 POST\');\n' +
'        cmd_fs_write();\n' +
'        break;\n' +
'    case \'ping\':\n' +
'        cmd_ping();\n' +
'        break;\n' +
'    default:\n' +
'        fail(400, \'未知操作: \' . $action);\n' +
'}\n';
        }
    };

    if (typeof window !== 'undefined') {
        window.ZEROSHUB = ZEROSHUB;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.ZEROSHUB = ZEROSHUB;
    }
})(typeof window !== 'undefined' ? window : globalThis);
