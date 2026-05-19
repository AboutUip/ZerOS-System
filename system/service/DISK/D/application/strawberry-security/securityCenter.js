(function(window) {
    'use strict';

    /**
     * 草莓安全软件（ZerOS 安全中心 ZOM 客户端）
     *
     * 目标（后续迭代逐步补全）：
     * - 作为 ZOM 程序的“安全安装入口”和“安全策略管理 UI”
     * - 未来对接高权限 ZerOS 服务，由服务代理执行真正的高权限操作
     */
    const SECURITY_CENTER = {
        pid: null,
        windowElement: null,
        windowId: null,
        dragHandle: null,
        _kernelAPI: null,
        _securityLog: [],
        _policy: { requireZomReview: true, logEvents: true },
        _childWindowId: null,

        __info__: function() {
            return {
                name: 'StrawberrySecurity',
                type: 'GUI',
                version: '0.1.0',
                description: '草莓安全软件：ZerOS 安全中心与 ZOM 安装网关',
                author: 'ZerOS Security Team',
                copyright: '© 2026 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.DESKTOP_MANAGE,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    // 自安装服务需要读写 D:/application 与 D:/server
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    // 文件关联：将 .zom 默认用草莓安全打开，需 SYSTEM_STORAGE_* 以便持久化
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.FILE_ASSOC_MANAGE,
                    PermissionManager.PERMISSION.PROCESS_MANAGE,
                    PermissionManager.PERMISSION.PROCESS_BACKGROUND,
                    PermissionManager.PERMISSION.SCHEDULE_TASK_STARTUP,
                    PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE,
                    PermissionManager.PERMISSION.CACHE_READ,
                    PermissionManager.PERMISSION.CACHE_WRITE
                ] : [],
                metadata: {
                    autoStart: true,
                    priority: 5,
                    allowMultipleInstances: false,
                    alwaysShowInTaskbar: false
                }
            };
        },

        __init__: async function(pid, initArgs) {
            this.pid = pid;
            this._kernelAPI = initArgs && initArgs.kernelAPI ? initArgs.kernelAPI : null;

            // 基础环境检查：GUIManager / ProcessManager 必须可用
            if (typeof GUIManager === 'undefined' || typeof ProcessManager === 'undefined') {
                if (typeof console !== 'undefined') {
                    console.error('StrawberrySecurity: GUIManager 或 ProcessManager 不可用');
                }
                throw new Error('草莓安全软件需要 GUIManager 与 ProcessManager 环境');
            }

            const guiContainer = ProcessManager.getGUIContainer && ProcessManager.getGUIContainer();
            if (!guiContainer || !guiContainer.appendChild) {
                throw new Error('草莓安全软件无法获取 GUI 容器');
            }

            // 创建主窗口容器（无边框 + 科技风 HUB）
            const root = document.createElement('div');
            root.className = 'zos-security-center-window zos-gui-window zsc-hub-window';

            root.innerHTML = [
                '<div class="zsc-container" data-role="drag">',
                '  <div class="zsc-titlebar" data-nodrag="1">',
                '    <div class="zsc-titlebar-left">',
                '      <span class="zsc-hub-logo"></span>',
                '      <span class="zsc-title">草莓安全 · 控制中心</span>',
                '      <span class="zsc-subtitle-inline">Security Hub</span>',
                '    </div>',
                '    <div class="zsc-win-controls">',
                '      <button type="button" class="zsc-winbtn" data-win="min" aria-label="最小化">—</button>',
                '      <button type="button" class="zsc-winbtn" data-win="max" aria-label="最大化">□</button>',
                '      <button type="button" class="zsc-winbtn zsc-winbtn-close" data-win="close" aria-label="关闭">×</button>',
                '    </div>',
                '  </div>',
                '  <div class="zsc-body">',
                '  <div class="zsc-sidebar">',
                '    <button class="zsc-nav-btn zsc-nav-btn-active" data-view="overview">概览</button>',
                '    <button class="zsc-nav-btn" data-view="install">ZOM 安装网关</button>',
                '    <button class="zsc-nav-btn" data-view="monitor">运行监控</button>',
                '    <button class="zsc-nav-btn" data-view="policy">安全策略</button>',
                '    <button class="zsc-nav-btn" data-view="cleanup">垃圾清理</button>',
                '    <button class="zsc-nav-btn" data-view="logs">安全日志</button>',
                '  </div>',
                '  <div class="zsc-content">',
                '    <div class="zsc-view zsc-view-overview">',
                '      <h2>概览</h2>',
                '      <div class="zsc-overview-status"></div>',
                '      <div class="zsc-overview-lastlog"></div>',
                '    </div>',
                '    <div class="zsc-view zsc-view-install" style="display:none">',
                '      <h2>ZOM 安装网关</h2>',
                '      <div class="zsc-install-status"></div>',
                '      <div class="zsc-install-actions"></div>',
                '      <p class="zsc-install-plan">计划功能：安装前解析 application.json、权限与风险提示、按本机策略允许/拒绝安装。</p>',
                '    </div>',
                '    <div class="zsc-view zsc-view-monitor" style="display:none">',
                '      <h2>运行监控</h2>',
                '      <div class="zsc-monitor-toolbar"><button type="button" class="zsc-btn zsc-btn-refresh">刷新</button></div>',
                '      <div class="zsc-monitor-list"></div>',
                '    </div>',
                '    <div class="zsc-view zsc-view-policy" style="display:none">',
                '      <h2>安全策略</h2>',
                '      <div class="zsc-policy-list"></div>',
                '      <p class="zsc-policy-note">策略仅当前会话有效，重启后恢复默认。</p>',
                '    </div>',
                '    <div class="zsc-view zsc-view-cleanup" style="display:none">',
                '      <h2>垃圾清理</h2>',
                '      <p class="zsc-cleanup-desc">仅清理缓存管理器中<strong>生命周期已到期</strong>的缓存项（含对应 .cache 文件），不扫描或删除壁纸、桌面等非缓存文件；支持系统缓存及所有程序（如音乐播放器等）的过期缓存。</p>',
                '      <div class="zsc-cleanup-actions">',
                '        <button type="button" class="zsc-btn zsc-btn-cleanup">清理过期缓存</button>',
                '      </div>',
                '      <div class="zsc-cleanup-result"></div>',
                '    </div>',
                '    <div class="zsc-view zsc-view-logs" style="display:none">',
                '      <h2>安全日志</h2>',
                '      <div class="zsc-logs-toolbar"><button type="button" class="zsc-btn zsc-btn-export">导出</button></div>',
                '      <div class="zsc-logs-list"></div>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join('');

            guiContainer.appendChild(root);
            this.windowElement = root;
            this.dragHandle = root.querySelector('.zsc-container');

            var self = this;
            root.addEventListener('click', function(e) {
                var winBtn = e.target.closest('[data-win]');
                if (!winBtn) return;
                var t = String(winBtn.dataset.win || '');
                if (t === 'min' && typeof GUIManager !== 'undefined' && GUIManager.minimizeWindow) {
                    try { GUIManager.minimizeWindow(self.windowId || self.pid); } catch (err) {}
                }
                if (t === 'max' && typeof GUIManager !== 'undefined' && GUIManager.toggleMaximize) {
                    try { GUIManager.toggleMaximize(self.windowId || self.pid); } catch (err) {}
                }
                if (t === 'close') self._minimizeToBackground();
            });

            var winInfo = GUIManager.registerWindow(this.pid, root, {
                title: '草莓安全 · 控制中心',
                icon: null,
                borderless: true,
                noTitleBar: true,
                dragHandle: this.dragHandle,
                onClose: () => {
                    try {
                        this._minimizeToBackground();
                    } catch (e) {
                        if (typeof console !== 'undefined') {
                            console.error('StrawberrySecurity onClose error:', e);
                        }
                    }
                }
            });
            if (winInfo && winInfo.windowId) {
                this.windowId = winInfo.windowId;
                root.dataset.windowId = winInfo.windowId;
            }

            this._bindNavigation(root);
            this._bindMonitorAndLogs(root);
            this._renderPolicy(root);
            this._log('info', '草莓安全已启动');
            // 概览先显示加载中，等服务安装完成后再刷新，避免读取 D:/server 未存在文件导致 404 报错
            var overviewStatus = root.querySelector('.zsc-overview-status');
            if (overviewStatus) overviewStatus.innerHTML = '<p>正在加载…</p>';

            // 延迟执行：服务安装由 setup 程序负责；主程序仅拉起已安装的服务并刷新概览
            var self = this;
            setTimeout(function() {
                self._ensureServiceAutoStart();
                self._refreshOverview(self.windowElement);
                try {
                    self._callKernelAPI('Process.registerBackgroundTrayClick', [function() {
                        if (typeof self._callKernelAPI === 'function') {
                            self._callKernelAPI('Process.requestForeground', []).then(function() {
                                self._showFromBackground();
                            }).catch(function() {});
                        }
                    }]);
                } catch (e) {}
                self._callKernelAPI('Cache.clearExpiredGlobally', []).then(function(n) {
                    var total = typeof n === 'number' ? n : 0;
                    return self._callKernelAPI('Cache.clear', [{ programName: 'musicplayer', expiredOnly: false }]).then(function(m) {
                        if (typeof m === 'number' && m > 0) total += m;
                        return total;
                    }).catch(function() { return total; });
                }).then(function(total) {
                    if (typeof total === 'number' && total > 0) {
                        self._log('info', '自动垃圾清理：已清理 ' + total + ' 条过期/音乐缓存');
                    }
                }).catch(function() {});
                try {
                    self._callKernelAPI('Process.requestBackground', []).then(function() {
                        self._log('info', '草莓安全已转入后台运行');
                    }).catch(function() {});
                } catch (e) {}
            }, 800);
        },

        /**
         * 调用内核 API 的小工具：优先使用注入的 kernelAPI.call，避免在异步回调中触发 PID 校验问题
         */
        _callKernelAPI: function(apiName, args) {
            var params = Array.isArray(args) ? args : [];
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                return this._kernelAPI.call(apiName, params);
            }
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                return ProcessManager.callKernelAPI(this.pid, apiName, params);
            }
            return Promise.reject(new Error('内核 API 当前不可用'));
        },

        /** 服务脚本路径（setup 由 zominstall 从 tempDir 调用，不复制到程序目录；主程序「运行安装」从应用目录读取） */
        _SERVER_SOURCE_PATH: 'D:/application/strawberry-security/server-strawberrysecurity.js',
        _SERVER_TARGET_PATH: 'D:/server/server-strawberrysecurity.js',

        /** 服务 id：与 D/server 下 server-strawberrysecurity.js 对应 */
        _STRAWBERRY_SERVICE_ID: 'strawberrysecurity',

        /**
         * 维持服务自启：若无“系统启动时启动草莓安全服务”的计划任务则创建，并立即启动服务。
         * 需要 SCHEDULE_TASK_STARTUP、SERVER_SERVICE_MANAGE 权限；失败时静默忽略。
         */
        _ensureServiceAutoStart: function() {
            var self = this;
            var sid = this._STRAWBERRY_SERVICE_ID;
            this._callKernelAPI('ScheduleTask.getAll', [])
                .then(function(tasks) {
                    if (!Array.isArray(tasks)) return;
                    var has = tasks.some(function(t) {
                        return t.taskType === 'service' && t.serviceId === sid &&
                            t.triggerType === 'SYSTEM_STARTUP' && t.enabled;
                    });
                    if (has) {
                        return self._callKernelAPI('Server.start', [sid]).catch(function() {});
                    }
                    return self._callKernelAPI('ScheduleTask.create', [{
                        taskType: 'service',
                        serviceId: sid,
                        serviceAction: 'start',
                        triggerType: 'SYSTEM_STARTUP',
                        triggerConfig: {},
                        enabled: true
                    }, true]).then(function() {
                        self._log('info', '已设置草莓安全服务系统启动时自启');
                        return self._callKernelAPI('Server.start', [sid]);
                    }).then(function() {
                        self._log('info', '草莓安全服务已启动');
                    });
                })
                .catch(function() {});
        },

        /**
         * 确保 .zom 扩展名默认用草莓安全打开（FileAssoc.set('.zom', 'strawberry-security')）
         * 若已为草莓安全则跳过；失败时静默忽略（可能无 FILE_ASSOC_MANAGE 权限）
         */
        _ensureZomFileAssoc: function() {
            var self = this;
            this._callKernelAPI('FileAssoc.get', ['.zom'])
                .then(function(current) {
                    if (current === 'strawberry-security') {
                        return null;
                    }
                    return self._callKernelAPI('FileAssoc.set', ['.zom', 'strawberry-security']).then(function() {
                        self._log('info', '.zom 已关联到草莓安全打开');
                    });
                })
                .catch(function() {});
        },

        _log: function(type, message) {
            this._securityLog.push({ time: new Date().toISOString(), type: type || 'info', message: message });
            if (this._policy.logEvents && this.windowElement) {
                var list = this.windowElement.querySelector('.zsc-logs-list');
                if (list) this._refreshLogsList(list);
            }
        },

        _bindNavigation: function(root) {
            var self = this;
            const navButtons = root.querySelectorAll('.zsc-nav-btn');
            const views = {
                overview: root.querySelector('.zsc-view-overview'),
                install: root.querySelector('.zsc-view-install'),
                monitor: root.querySelector('.zsc-view-monitor'),
                policy: root.querySelector('.zsc-view-policy'),
                cleanup: root.querySelector('.zsc-view-cleanup'),
                logs: root.querySelector('.zsc-view-logs')
            };

            if (!navButtons || !views.overview) return;

            navButtons.forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const view = btn.getAttribute('data-view');
                    navButtons.forEach(function(b) {
                        b.classList.toggle('zsc-nav-btn-active', b === btn);
                    });
                    Object.keys(views).forEach(function(key) {
                        if (views[key]) {
                            views[key].style.display = key === view ? '' : 'none';
                        }
                    });
                    if (view === 'overview') self._refreshOverview();
                    else if (view === 'install') self._refreshInstall(root);
                    else if (view === 'monitor') self._refreshMonitor(root);
                    else if (view === 'cleanup') self._refreshCleanup(root);
                    else if (view === 'logs') self._refreshLogs(root);
                });
            });
        },

        _switchToView: function(view) {
            var root = this.windowElement;
            if (!root) return;
            var btn = root.querySelector('.zsc-nav-btn[data-view="' + view + '"]');
            if (btn) btn.click();
        },

        _escapeHTML: function(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        _refreshOverview: function() {
            var self = this;
            var root = this.windowElement;
            if (!root) return;
            var statusEl = root.querySelector('.zsc-overview-status');
            var lastLogEl = root.querySelector('.zsc-overview-lastlog');
            if (!statusEl) return;
            statusEl.innerHTML = '<p>正在加载…</p>';
            var protectionStorageKey = 'strawberry-security.protectionStartDate';
            self._callKernelAPI('LocalStorage.get', [protectionStorageKey]).catch(function() { return null; })
                .then(function(val) {
                    var startTs = (val != null && val !== '') ? (parseFloat(val) || Date.now()) : null;
                    if (startTs == null) {
                        startTs = Date.now();
                        return self._callKernelAPI('LocalStorage.set', [protectionStorageKey, String(startTs)]).then(function() { return startTs; });
                    }
                    return startTs;
                })
                .then(function(startTs) {
                    return Promise.all([
                        self._callKernelAPI('FileAssoc.get', ['.zom']).catch(function() { return null; }),
                        self._callKernelAPI('FileAssoc.list', []).catch(function() { return {}; }),
                        self._callKernelAPI('FileSystem.read', ['D:/server/server-strawberrysecurity.js']).catch(function() { return null; }),
                        self._callKernelAPI('Process.getRunningProcesses', []).catch(function() { return null; })
                    ]).then(function(res) {
                        return { startTs: startTs, zomProg: res[0], assocMap: res[1], serviceContent: res[2], processes: res[3] };
                    });
                })
                .then(function(data) {
                    var startTs = data.startTs;
                    var zomProg = data.zomProg;
                    var assocMap = data.assocMap;
                    var serviceContent = data.serviceContent;
                    var processes = data.processes;
                    var protectionDays = Math.floor((Date.now() - startTs) / 86400000);

                    var assocCount = (assocMap && typeof assocMap === 'object') ? Object.keys(assocMap).length : 0;
                    var runningCount = Array.isArray(processes) ? processes.length : 0;
                    var bgCount = Array.isArray(processes) ? processes.filter(function(p) { return p && p.isBackground; }).length : 0;

                    statusEl.innerHTML = [
                        '<div class="zsc-protection-days">',
                        '  <span class="zsc-protection-days-num">' + protectionDays + '</span>',
                        '  <span class="zsc-protection-days-label">已安全保护</span>',
                        '  <span class="zsc-protection-days-unit">天</span>',
                        '</div>',
                        '<div class="zsc-grid">',
                    '  <section class="zsc-card">',
                    '    <div class="zsc-card-title">ZOM 防护</div>',
                    '    <div class="zsc-card-body">',
                    '      <div class="zsc-kv"><span class="k">.zom 默认打开</span><span class="v">' + (zomProg || '未设置') + (zomProg === 'strawberry-security' ? ' <span class="zsc-badge zsc-badge-ok">已接管</span>' : ' <span class="zsc-badge zsc-badge-warn">未接管</span>') + '</span></div>',
                    '      <div class="zsc-kv"><span class="k">策略</span><span class="v">' + (self._policy.requireZomReview ? '需要审核' : '不强制') + '</span></div>',
                    '    </div>',
                    '  </section>',
                    '  <section class="zsc-card">',
                    '    <div class="zsc-card-title">服务状态</div>',
                    '    <div class="zsc-card-body">',
                    '      <div class="zsc-kv"><span class="k">服务脚本</span><span class="v">' + (serviceContent && serviceContent.length > 0 ? '<span class="zsc-badge zsc-badge-ok">已安装</span>' : '<span class="zsc-badge zsc-badge-warn">未安装</span>') + '</span></div>',
                    '      <div class="zsc-kv"><span class="k">说明</span><span class="v">占位服务（可扩展高权限代理）</span></div>',
                    '    </div>',
                    '  </section>',
                    '  <section class="zsc-card">',
                    '    <div class="zsc-card-title">文件关联</div>',
                    '    <div class="zsc-card-body">',
                    '      <div class="zsc-kv"><span class="k">已配置数量</span><span class="v">' + assocCount + '</span></div>',
                    '      <div class="zsc-kv"><span class="k">快速查看</span><span class="v"><button type="button" class="zsc-btn zsc-btn-small zsc-btn-view-assoc">查看列表</button></span></div>',
                    '    </div>',
                    '  </section>',
                    '  <section class="zsc-card">',
                    '    <div class="zsc-card-title">运行进程</div>',
                    '    <div class="zsc-card-body">',
                    '      <div class="zsc-kv"><span class="k">运行中</span><span class="v">' + runningCount + '</span></div>',
                    '      <div class="zsc-kv"><span class="k">后台</span><span class="v">' + bgCount + '</span></div>',
                    '      <div class="zsc-kv"><span class="k">快速操作</span><span class="v"><button type="button" class="zsc-btn zsc-btn-small zsc-btn-open-monitor">打开监控</button></span></div>',
                    '    </div>',
                    '  </section>',
                    '</div>'
                ].join('');

                var btnAssoc = root.querySelector('.zsc-btn-view-assoc');
                if (btnAssoc) btnAssoc.onclick = function() { self._openAssocWindow(assocMap); };
                var btnMon = root.querySelector('.zsc-btn-open-monitor');
                if (btnMon) btnMon.onclick = function() { self._switchToView('monitor'); };

                if (lastLogEl) {
                    var last = self._securityLog[self._securityLog.length - 1];
                    lastLogEl.innerHTML = last
                        ? '<p><strong>最近一条：</strong> <span class="zsc-badge zsc-badge-' + (last.type || 'info') + '">' + (last.type || 'info') + '</span> ' + self._escapeHTML(last.message) + '</p>'
                        : '<p>暂无日志</p>';
                }
            }).catch(function() {
                statusEl.innerHTML = '<p>无法获取状态</p>';
            });
        },

        _parseServiceVersion: function(content) {
            if (!content || typeof content !== 'string') return null;
            var m = content.match(/version\s*:\s*['"]([^'"]+)['"]/);
            return m ? m[1] : null;
        },
        _compareVersions: function(a, b) {
            if (a === b) return 0;
            var pa = (a || '').toString().split('.');
            var pb = (b || '').toString().split('.');
            for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
                var na = parseInt(pa[i], 10) || 0;
                var nb = parseInt(pb[i], 10) || 0;
                if (na !== nb) return na > nb ? 1 : -1;
            }
            return 0;
        },

        /**
         * 运行安装步骤（内联）：setup 由 zominstall 调用且不复制到程序目录，故主程序在此直接执行服务安装、.zom 关联、服务自启并启动。
         */
        _runSetup: function() {
            var self = this;
            var root = this.windowElement;
            var sourcePath = this._SERVER_SOURCE_PATH;
            var targetPath = this._SERVER_TARGET_PATH;
            var sid = this._STRAWBERRY_SERVICE_ID;
            self._callKernelAPI('FileSystem.read', [sourcePath])
                .then(function(sourceContent) {
                    if (!sourceContent || typeof sourceContent !== 'string' || !sourceContent.trim()) {
                        self._log('error', '未找到服务脚本');
                        return Promise.reject();
                    }
                    var sourceVersion = self._parseServiceVersion(sourceContent);
                    return self._callKernelAPI('FileSystem.read', [targetPath]).catch(function() { return null; }).then(function(targetContent) {
                        var targetVersion = (targetContent && typeof targetContent === 'string') ? self._parseServiceVersion(targetContent) : null;
                        var shouldWrite = !targetVersion || (sourceVersion && self._compareVersions(sourceVersion, targetVersion) > 0);
                        if (shouldWrite) {
                            return self._callKernelAPI('FileSystem.write', [targetPath, sourceContent, 'OVERWRITE']).then(function() {
                                self._log('info', '服务脚本已安装/更新到 D:/server');
                            });
                        }
                    });
                })
                .then(function() {
                    return self._callKernelAPI('FileAssoc.set', ['.zom', 'strawberry-security']).then(function() {
                        self._log('info', '.zom 已设为草莓安全打开');
                    }).catch(function() {});
                })
                .then(function() {
                    return self._callKernelAPI('ScheduleTask.getAll', []).then(function(tasks) {
                        if (!Array.isArray(tasks)) tasks = [];
                        var has = tasks.some(function(t) {
                            return t && t.taskType === 'service' && t.serviceId === sid && t.triggerType === 'SYSTEM_STARTUP' && t.enabled;
                        });
                        if (!has) {
                            return self._callKernelAPI('ScheduleTask.create', [{
                                taskType: 'service',
                                serviceId: sid,
                                serviceAction: 'start',
                                triggerType: 'SYSTEM_STARTUP',
                                triggerConfig: {},
                                enabled: true
                            }, true]).then(function() {
                                self._log('info', '已设置服务系统启动时自启');
                            });
                        }
                    });
                })
                .then(function() {
                    return self._callKernelAPI('Server.start', [sid]).then(function() {
                        self._log('info', '草莓安全服务已启动');
                    });
                })
                .then(function() {
                    if (root) self._refreshInstall(root);
                })
                .catch(function(err) {
                    if (err && err.message) self._log('error', '安装步骤失败: ' + err.message);
                });
        },

        _refreshInstall: function(root) {
            var self = this;
            if (!root || !root.querySelector) return;
            var statusEl = root.querySelector('.zsc-install-status');
            var actionsEl = root.querySelector('.zsc-install-actions');
            if (!statusEl || !actionsEl) return;
            statusEl.innerHTML = '<p>正在加载…</p>';
            actionsEl.innerHTML = '';
            this._callKernelAPI('FileAssoc.get', ['.zom']).then(function(current) {
                statusEl.innerHTML = '<p><strong>当前 .zom 默认打开程序：</strong> ' + (current || '未设置') + (current === 'strawberry-security' ? '（草莓安全）' : '') + '</p>';
                var runSetupBtn = document.createElement('button');
                runSetupBtn.type = 'button';
                runSetupBtn.className = 'zsc-btn zsc-btn-primary';
                runSetupBtn.textContent = '运行安装程序';
                runSetupBtn.title = '安装服务脚本到 D:/server、设置 .zom 关联与服务自启（首次安装或修复时使用）';
                runSetupBtn.addEventListener('click', function() {
                    runSetupBtn.disabled = true;
                    self._runSetup();
                    setTimeout(function() { runSetupBtn.disabled = false; }, 2000);
                });
                actionsEl.appendChild(runSetupBtn);
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'zsc-btn';
                btn.textContent = current === 'strawberry-security' ? '已为草莓安全' : '强制设为草莓安全打开';
                btn.disabled = current === 'strawberry-security';
                btn.addEventListener('click', function() {
                    btn.disabled = true;
                    self._callKernelAPI('FileAssoc.set', ['.zom', 'strawberry-security']).then(function() {
                        self._log('info', '.zom 已设为草莓安全打开');
                        self._refreshInstall(self.windowElement);
                    }).catch(function(err) {
                        self._log('error', '设置 .zom 关联失败: ' + (err && err.message));
                        btn.disabled = false;
                    });
                });
                actionsEl.appendChild(btn);
            }).catch(function() {
                statusEl.innerHTML = '<p>无法获取关联状态</p>';
            });
        },

        _bindMonitorAndLogs: function(root) {
            var self = this;
            var refreshBtn = root.querySelector('.zsc-btn-refresh');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', function() { self._refreshMonitor(root); });
            }
            var exportBtn = root.querySelector('.zsc-btn-export');
            if (exportBtn) {
                exportBtn.addEventListener('click', function() {
                    var json = JSON.stringify(self._securityLog, null, 2);
                    var a = document.createElement('a');
                    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
                    a.download = 'strawberry-security-logs-' + new Date().toISOString().slice(0, 10) + '.json';
                    a.click();
                });
            }
        },

        _refreshCleanup: function(root) {
            var self = this;
            if (!root || !root.querySelector) return;
            var resultEl = root.querySelector('.zsc-cleanup-result');
            var btn = root.querySelector('.zsc-btn-cleanup');
            if (resultEl) resultEl.innerHTML = '';
            if (!btn) return;
            btn.onclick = function() {
                if (resultEl) resultEl.innerHTML = '<p class="zsc-cleanup-status">清理中…</p>';
                btn.disabled = true;
                self._callKernelAPI('Cache.clearExpiredGlobally', [])
                    .then(function(count) {
                        var n = typeof count === 'number' ? count : 0;
                        return self._callKernelAPI('Cache.clear', [{ programName: 'musicplayer', expiredOnly: false }])
                            .then(function(m) {
                                if (typeof m === 'number') n += m;
                                return n;
                            })
                            .catch(function() { return n; });
                    })
                    .then(function(n) {
                        if (resultEl) {
                            resultEl.innerHTML = '<p class="zsc-cleanup-status zsc-badge zsc-badge-ok">已清理 ' + n + ' 条缓存（含过期缓存与 KiteMusic 缓存）</p>';
                        }
                        self._log('info', '垃圾清理：已清理 ' + n + ' 条缓存');
                    })
                    .catch(function(err) {
                        if (resultEl) {
                            resultEl.innerHTML = '<p class="zsc-cleanup-status zsc-badge zsc-badge-warn">清理失败：' + self._escapeHTML(err && err.message ? err.message : String(err)) + '</p>';
                        }
                        self._log('warn', '垃圾清理失败：' + (err && err.message ? err.message : String(err)));
                    })
                    .then(function() {
                        btn.disabled = false;
                    });
            };
        },

        _refreshMonitor: function(root) {
            var self = this;
            if (!root || !root.querySelector) return;
            var listEl = root.querySelector('.zsc-monitor-list');
            if (!listEl) return;
            if (!root.querySelector('.zsc-monitor-filters')) {
                var filters = document.createElement('div');
                filters.className = 'zsc-monitor-filters';
                filters.innerHTML = [
                    '<input class="zsc-input zsc-monitor-search" type="text" placeholder="搜索程序名 / PID" />',
                    '<select class="zsc-select zsc-monitor-scope">',
                    '  <option value="all">全部</option>',
                    '  <option value="fg">仅前台</option>',
                    '  <option value="bg">仅后台</option>',
                    '</select>'
                ].join('');
                var toolbar = root.querySelector('.zsc-monitor-toolbar');
                if (toolbar) toolbar.appendChild(filters);
                var search = filters.querySelector('.zsc-monitor-search');
                var scope = filters.querySelector('.zsc-monitor-scope');
                if (search) search.addEventListener('input', function() { self._refreshMonitor(root); });
                if (scope) scope.addEventListener('change', function() { self._refreshMonitor(root); });
            }
            listEl.innerHTML = '<p>正在加载进程列表…</p>';
            this._callKernelAPI('Process.getRunningProcesses', []).then(function(processes) {
                if (!Array.isArray(processes) || processes.length === 0) {
                    listEl.innerHTML = '<p>暂无运行中进程</p>';
                    return;
                }
                var q = '';
                var scopeVal = 'all';
                var searchEl = root.querySelector('.zsc-monitor-search');
                var scopeEl = root.querySelector('.zsc-monitor-scope');
                if (searchEl && typeof searchEl.value === 'string') q = searchEl.value.trim().toLowerCase();
                if (scopeEl && typeof scopeEl.value === 'string') scopeVal = scopeEl.value;
                var filtered = processes.filter(function(p) {
                    if (!p) return false;
                    if (scopeVal === 'fg' && p.isBackground) return false;
                    if (scopeVal === 'bg' && !p.isBackground) return false;
                    if (!q) return true;
                    var name = (p.programName || '').toLowerCase();
                    var pidStr = (p.pid != null) ? String(p.pid) : '';
                    return name.includes(q) || pidStr.includes(q);
                });
                var table = document.createElement('table');
                table.className = 'zsc-table';
                table.innerHTML = '<thead><tr><th>程序名</th><th>PID</th><th>状态</th><th>后台</th><th>操作</th></tr></thead><tbody></tbody>';
                var tbody = table.querySelector('tbody');
                filtered.forEach(function(p) {
                    var tr = document.createElement('tr');
                    var prog = (p && p.programName) ? p.programName : '-';
                    var pid = (p && p.pid != null) ? p.pid : '-';
                    var status = (p && p.status) ? p.status : '-';
                    var bg = (p && p.isBackground) ? '是' : '否';
                    tr.innerHTML = '<td>' + prog + '</td><td>' + pid + '</td><td>' + status + '</td><td>' + bg + '</td><td></td>';
                    var tdAction = tr.querySelector('td:last-child');
                    tr.style.cursor = 'pointer';
                    tr.addEventListener('click', function(ev) {
                        if (ev && ev.target && ev.target.closest && ev.target.closest('button')) return;
                        if (typeof pid === 'number') self._openProcessWindow(pid);
                    });
                    if (typeof pid === 'number' && pid !== self.pid) {
                        var killBtn = document.createElement('button');
                        killBtn.type = 'button';
                        killBtn.className = 'zsc-btn zsc-btn-danger';
                        killBtn.textContent = '终止';
                        killBtn.addEventListener('click', function() {
                            killBtn.disabled = true;
                            self._callKernelAPI('Process.manage', [pid, true]).then(function() {
                                self._log('info', '已终止进程 ' + pid + ' (' + prog + ')');
                                self._refreshMonitor(self.windowElement);
                            }).catch(function(err) {
                                self._log('error', '终止进程失败: ' + (err && err.message));
                                killBtn.disabled = false;
                            });
                        });
                        tdAction.appendChild(killBtn);
                    }
                    tbody.appendChild(tr);
                });
                listEl.innerHTML = '';
                listEl.appendChild(table);
            }).catch(function(err) {
                listEl.innerHTML = '<p>加载失败（可能缺少 PROCESS_MANAGE 权限）: ' + (err && err.message) + '</p>';
            });
        },

        _renderPolicy: function(root) {
            var self = this;
            var listEl = root.querySelector('.zsc-policy-list');
            if (!listEl) return;
            var items = [
                { key: 'requireZomReview', label: 'ZOM 安装前必须经本程序审核' },
                { key: 'logEvents', label: '记录安全事件到日志' }
            ];
            listEl.innerHTML = '';
            items.forEach(function(item) {
                var wrap = document.createElement('div');
                wrap.className = 'zsc-policy-item';
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = 'zsc-policy-' + item.key;
                cb.checked = self._policy[item.key];
                cb.addEventListener('change', function() {
                    self._policy[item.key] = cb.checked;
                });
                var label = document.createElement('label');
                label.htmlFor = cb.id;
                label.textContent = item.label;
                wrap.appendChild(cb);
                wrap.appendChild(label);
                listEl.appendChild(wrap);
            });
        },

        _refreshLogs: function(root) {
            var listEl = root && root.querySelector('.zsc-logs-list');
            if (listEl) this._refreshLogsList(listEl);
        },

        _refreshLogsList: function(listEl) {
            listEl.innerHTML = '';
            if (this._securityLog.length === 0) {
                listEl.innerHTML = '<p>暂无安全日志</p>';
                return;
            }
            var ul = document.createElement('ul');
            ul.className = 'zsc-logs-ul';
            for (var i = this._securityLog.length - 1; i >= 0; i--) {
                var e = this._securityLog[i];
                var li = document.createElement('li');
                li.className = 'zsc-log-entry zsc-log-' + (e.type || 'info');
                li.textContent = '[' + (e.time || '').slice(11, 19) + '] [' + (e.type || 'info') + '] ' + (e.message || '');
                ul.appendChild(li);
            }
            listEl.appendChild(ul);
        },

        _closeChildWindow: function() {
            if (this._childWindowId && typeof GUIManager !== 'undefined' && GUIManager.unregisterWindow) {
                try { GUIManager.unregisterWindow(this._childWindowId); } catch (e) {}
            }
            this._childWindowId = null;
        },

        _openAssocWindow: function(assocMap) {
            var self = this;
            this._closeChildWindow();
            var data = (assocMap && typeof assocMap === 'object') ? assocMap : {};
            var win = document.createElement('div');
            win.className = 'zos-gui-window zsc-child';
            win.style.cssText = 'width:520px;height:420px;display:flex;flex-direction:column;overflow:hidden;';

            var content = document.createElement('div');
            content.style.cssText = 'padding:12px 14px;overflow:auto;flex:1;';
            var keys = Object.keys(data).sort(function(a, b) { return a.localeCompare(b); });
            if (keys.length === 0) {
                content.innerHTML = '<p>暂无文件关联</p>';
            } else {
                var html = ['<table class="zsc-table"><thead><tr><th>扩展名</th><th>默认程序</th></tr></thead><tbody>'];
                keys.forEach(function(k) {
                    html.push('<tr><td>' + self._escapeHTML(k) + '</td><td>' + self._escapeHTML(data[k]) + '</td></tr>');
                });
                html.push('</tbody></table>');
                content.innerHTML = html.join('');
            }
            win.appendChild(content);

            var guiContainer = (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getGUIContainer === 'function')
                ? ProcessManager.getGUIContainer() : document.getElementById('gui-container');
            if (guiContainer) guiContainer.appendChild(win);
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.registerWindow === 'function') {
                var info = GUIManager.registerWindow(this.pid, win, {
                    title: '文件关联（只读）',
                    onClose: function() { self._childWindowId = null; }
                });
                if (info && info.windowId) this._childWindowId = info.windowId;
            }
        },

        _openProcessWindow: function(targetPid) {
            var self = this;
            this._closeChildWindow();
            var win = document.createElement('div');
            win.className = 'zos-gui-window zsc-child';
            win.style.cssText = 'width:560px;height:460px;display:flex;flex-direction:column;overflow:hidden;';

            var header = document.createElement('div');
            header.style.cssText = 'padding:10px 14px;display:flex;gap:8px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.06);';
            header.innerHTML = '<button type="button" class="zsc-btn zsc-btn-danger zsc-btn-small">终止</button><button type="button" class="zsc-btn zsc-btn-small">刷新</button><span class="zsc-muted">PID: ' + self._escapeHTML(targetPid) + '</span>';
            win.appendChild(header);

            var pre = document.createElement('pre');
            pre.className = 'zsc-pre';
            pre.textContent = '正在加载…';
            win.appendChild(pre);

            var killBtn = header.querySelector('button.zsc-btn-danger');
            var refBtn = header.querySelectorAll('button')[1];
            function refresh() {
                self._callKernelAPI('Process.getProcessInfo', [targetPid]).then(function(info) {
                    pre.textContent = JSON.stringify(info, null, 2);
                }).catch(function(err) {
                    pre.textContent = '加载失败: ' + (err && err.message);
                });
            }
            if (refBtn) refBtn.onclick = refresh;
            if (killBtn) killBtn.onclick = function() {
                killBtn.disabled = true;
                self._callKernelAPI('Process.manage', [targetPid, true]).then(function() {
                    self._log('info', '已终止进程 ' + targetPid);
                    self._closeChildWindow();
                    self._refreshMonitor(self.windowElement);
                }).catch(function(err) {
                    self._log('error', '终止进程失败: ' + (err && err.message));
                    killBtn.disabled = false;
                });
            };
            refresh();

            var guiContainer = (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getGUIContainer === 'function')
                ? ProcessManager.getGUIContainer() : document.getElementById('gui-container');
            if (guiContainer) guiContainer.appendChild(win);
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.registerWindow === 'function') {
                var info = GUIManager.registerWindow(this.pid, win, {
                    title: '进程详情',
                    onClose: function() { self._childWindowId = null; }
                });
                if (info && info.windowId) this._childWindowId = info.windowId;
            }
        },

        /** 关闭时转入后台：隐藏窗口并请求后台运行，进程不退出 */
        _minimizeToBackground: function() {
            var root = this.windowElement;
            if (!root) return;
            root.style.setProperty('display', 'none', 'important');
            this._log('info', '草莓安全已最小化到后台');
            this._callKernelAPI('Process.requestBackground', []).catch(function() {});
        },

        /** 从托盘点击恢复：请求前台并重新显示窗口 */
        _showFromBackground: function() {
            var root = this.windowElement;
            if (!root) return;
            root.style.removeProperty('display');
            if (typeof GUIManager !== 'undefined' && root.dataset && root.dataset.windowId) {
                try {
                    GUIManager.focusWindow(root.dataset.windowId);
                } catch (e) {}
            }
        },

        __exit__: async function() {
            this._closeChildWindow();
            if (this.windowElement && this.windowElement.parentNode) {
                this.windowElement.parentNode.removeChild(this.windowElement);
            }
            this.windowElement = null;
            this._kernelAPI = null;
        }
    };

    if (typeof window !== 'undefined') {
        // ProcessManager 通过 programName.toUpperCase() 查找程序对象：
        // strawberry-security -> window['STRAWBERRY-SECURITY']
        window.SECURITY_CENTER = SECURITY_CENTER; // 向后兼容 / 开发调试
        window['STRAWBERRY-SECURITY'] = SECURITY_CENTER; // 启动所需的标准注册名
        window.STRAWBERRY_SECURITY = SECURITY_CENTER; // 便于手动访问
    } else if (typeof globalThis !== 'undefined') {
        globalThis.SECURITY_CENTER = SECURITY_CENTER;
        globalThis['STRAWBERRY-SECURITY'] = SECURITY_CENTER;
        globalThis.STRAWBERRY_SECURITY = SECURITY_CENTER;
    }
})(window);

