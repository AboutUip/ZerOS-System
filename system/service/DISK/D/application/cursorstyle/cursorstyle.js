/**
 * CursorStyle — ZerOS 第三方 ZOM：SVG 指针主题、向导、任务栏后台与右键菜单
 * 打包：在项目根执行 dev/toolkit/zompkg.ps1 dev/zom-sources/cursorstyle
 */
(function (global) {
    'use strict';

    var PROGRAM = 'CURSORSTYLE';
    var STORAGE_KEY = 'system.cursorPointerTheme';
    var STYLE_ID = 'cursorstyle-global-cursor-css';

    function svgDataUri(svg) {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' ').trim());
    }

    var THEMES = {
        system: {
            id: 'system',
            name: '跟随系统',
            desc: '不覆盖 ZerOS 默认指针',
            svg: null,
            hx: 0,
            hy: 0
        },
        default: {
            id: 'default',
            name: '经典箭头',
            desc: '高对比描边',
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#1e1b2e" stroke="#e9d5ff" stroke-width="1.2" d="M2 2l7.2 18L9.6 12l6.4-2.4L2 2z"/></svg>',
            hx: 0,
            hy: 0
        },
        neon: {
            id: 'neon',
            name: '霓虹环',
            desc: '青色发光焦点',
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="8" fill="none" stroke="#22d3ee" stroke-width="2"/><circle cx="14" cy="14" r="2.5" fill="#a5f3fc"/></svg>',
            hx: 14,
            hy: 14
        },
        minimal: {
            id: 'minimal',
            name: '极简十字',
            desc: '细线准星',
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path stroke="#f472b6" stroke-width="1.5" d="M10 2v16M2 10h16"/><circle cx="10" cy="10" r="1.8" fill="#fbcfe8"/></svg>',
            hx: 10,
            hy: 10
        },
        bubble: {
            id: 'bubble',
            name: '气泡指针',
            desc: '柔和对话气泡',
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path fill="rgba(99,102,241,0.35)" stroke="#a5b4fc" stroke-width="1.5" d="M4 6c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H9l-5 4v-4H6c-1.1 0-2-.9-2-2V6z"/><circle cx="13" cy="10" r="2" fill="#c7d2fe"/></svg>',
            hx: 4,
            hy: 4
        },
        reticle: {
            id: 'reticle',
            name: '战术准星',
            desc: '绿色十字刻度',
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="#4ade80" stroke-width="1.8" d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="6" stroke="#86efac" stroke-width="1.2" fill="none"/><circle cx="12" cy="12" r="1.2" fill="#bbf7d0"/></svg>',
            hx: 12,
            hy: 12
        }
    };

    var CURSORSTYLE = {
        pid: null,
        window: null,
        windowId: null,
        _upid: null,
        _state: { version: 1, themeId: 'neon', onboardingDone: false },
        _wizardStep: 0,
        _selectedTheme: 'neon',
        _autoStart: false,
        _visibleSettings: false,

        __info__: function () {
            var P = typeof PermissionManager !== 'undefined' ? PermissionManager.PERMISSION : {};
            return {
                name: 'cursorstyle',
                type: 'GUI',
                version: '1.0.0',
                description: 'SVG 鼠标指针主题与任务栏后台管理',
                author: 'ZerOS Community',
                copyright: 'MIT',
                permissions: [
                    P.GUI_WINDOW_CREATE,
                    P.EVENT_LISTENER,
                    P.SYSTEM_NOTIFICATION,
                    P.SYSTEM_STORAGE_READ,
                    P.SYSTEM_STORAGE_WRITE,
                    P.PROCESS_BACKGROUND,
                    P.SCHEDULE_TASK_CREATE,
                    P.SCHEDULE_TASK_MANAGE
                ],
                metadata: { allowMultipleInstances: false }
            };
        },

        __init__: async function (pid, initArgs) {
            this.pid = pid;
            this._upid = initArgs && initArgs.upid;
            try {
                await this._loadState();
                this._selectedTheme = this._state.themeId || 'neon';
                this._autoStart = await this._readAutoStartFromSchedule();

                var guiContainer = (initArgs && initArgs.guiContainer) || document.getElementById('gui-container');
                this.window = document.createElement('div');
                this.window.className = 'cursorstyle-root zos-gui-window';
                this.window.dataset.pid = String(pid);
                this.window.setAttribute('role', 'application');

                if (typeof GUIManager !== 'undefined') {
                    var iconPath = null;
                    if (typeof ApplicationAssetManager !== 'undefined' && ApplicationAssetManager.getIcon) {
                        iconPath = ApplicationAssetManager.getIcon('cursorstyle');
                    }
                    if (!iconPath) {
                        iconPath = 'application/cursorstyle/assets/icon.svg';
                    }
                    var reg = GUIManager.registerWindow(pid, this.window, {
                        title: '指针主题 CursorStyle',
                        icon: iconPath,
                        onClose: function () {}
                    });
                    this.windowId = reg && reg.windowId != null ? reg.windowId : null;
                }

                this._renderShell();
                guiContainer.appendChild(this.window);
                this._bindEvents();

                this._applyTheme(this._selectedTheme);

                if (!this._state.onboardingDone) {
                    this._wizardStep = 0;
                    this._syncPanels();
                    void this._bringUi();
                } else {
                    this._wizardStep = 4;
                    this._syncPanels();
                }

                // ProcessManager 在 status===starting 时禁止大部分内核 API（含 registerBackgroundTray* / requestBackground）。
                // 必须等 __init__ 返回后进程变为 running 再注册托盘并转入后台。
                var self = this;
                setTimeout(function () {
                    self._runDeferredStartup().catch(function (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error(PROGRAM, '延后启动失败: ' + (e && e.message), e);
                        }
                    });
                }, 0);
            } catch (err) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error(PROGRAM, '初始化失败: ' + (err && err.message), err);
                }
                throw err;
            }
        },

        __exit__: async function () {
            try {
                this._removeInjectedCursor();
                if (typeof EventManager !== 'undefined') {
                    EventManager.unregisterAllHandlersForPid(this.pid);
                }
                if (this.windowId && typeof GUIManager !== 'undefined') {
                    await GUIManager.unregisterWindow(this.windowId);
                } else if (this.pid && typeof GUIManager !== 'undefined') {
                    await GUIManager.unregisterWindow(this.pid);
                } else if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn(PROGRAM, '__exit__ 清理: ' + (e && e.message));
                }
            }
            this.window = null;
            this.windowId = null;
        },

        _log: function (msg, err) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info(PROGRAM, msg, err);
            }
        },

        _loadState: async function () {
            if (typeof LStorage === 'undefined' || !LStorage.getSystemStorage) return;
            try {
                var raw = await LStorage.getSystemStorage(STORAGE_KEY);
                if (raw && typeof raw === 'object') {
                    this._state = Object.assign(this._state, raw);
                }
            } catch (e) {
                this._log('读取状态失败 ' + e.message);
            }
        },

        _saveState: async function () {
            if (typeof LStorage === 'undefined' || !LStorage.setSystemStorage) return;
            try {
                await LStorage.setSystemStorage(STORAGE_KEY, Object.assign({}, this._state, {
                    themeId: this._selectedTheme,
                    onboardingDone: this._state.onboardingDone
                }));
            } catch (e) {
                this._log('保存状态失败 ' + e.message);
            }
        },

        /**
         * 与「计划任务管理」一致：通过 ScheduleTaskManager 持久化到 LocalSData，
         * 系统启动时由内核执行「程序 / cursorstyle / SYSTEM_STARTUP」任务（默认后台运行）。
         */
        _isCursorstyleStartupTask: function (task) {
            if (!task || typeof task !== 'object') return false;
            var tt = task.taskType || 'program';
            if (tt !== 'program') return false;
            if (task.programName !== 'cursorstyle') return false;
            return task.triggerType === 'SYSTEM_STARTUP';
        },

        _readAutoStartFromSchedule: async function () {
            if (typeof ProcessManager === 'undefined' || !ProcessManager.callKernelAPI) return false;
            try {
                var tasks = await ProcessManager.callKernelAPI(this.pid, 'ScheduleTask.getAll', []);
                if (!Array.isArray(tasks)) return false;
                for (var i = 0; i < tasks.length; i++) {
                    if (this._isCursorstyleStartupTask(tasks[i]) && tasks[i].enabled !== false) return true;
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn(PROGRAM, '读取计划任务自启状态失败: ' + (e && e.message));
                }
            }
            return false;
        },

        /**
         * @param {boolean} enabled
         * @param {boolean} requiresStartupPermission 与计划任务创建对话框一致：勾选「系统启动后执行（需要危险权限）」时为 true
         */
        _setAutoStartSchedule: async function (enabled, requiresStartupPermission) {
            if (typeof ProcessManager === 'undefined' || !ProcessManager.callKernelAPI) {
                throw new Error('ProcessManager 不可用');
            }
            if (requiresStartupPermission === undefined) requiresStartupPermission = false;
            var tasks = await ProcessManager.callKernelAPI(this.pid, 'ScheduleTask.getAll', []);
            if (!Array.isArray(tasks)) tasks = [];
            var matches = [];
            for (var m = 0; m < tasks.length; m++) {
                if (this._isCursorstyleStartupTask(tasks[m])) matches.push(tasks[m]);
            }
            if (enabled) {
                var hasEnabled = false;
                for (var e = 0; e < matches.length; e++) {
                    if (matches[e].enabled !== false) hasEnabled = true;
                }
                if (hasEnabled) {
                    this._autoStart = true;
                    return;
                }
                var revive = null;
                for (var d = 0; d < matches.length; d++) {
                    if (matches[d].enabled === false) {
                        revive = matches[d];
                        break;
                    }
                }
                if (revive) {
                    await ProcessManager.callKernelAPI(this.pid, 'ScheduleTask.setEnabled', [revive.id, true]);
                    this._autoStart = true;
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.info(PROGRAM, '已启用开机计划任务: ' + revive.id);
                    }
                    return;
                }
                await ProcessManager.callKernelAPI(this.pid, 'ScheduleTask.create', [
                    {
                        taskType: 'program',
                        programName: 'cursorstyle',
                        triggerType: 'SYSTEM_STARTUP',
                        triggerConfig: {},
                        enabled: true,
                        runInBackground: true
                    },
                    requiresStartupPermission
                ]);
                this._autoStart = true;
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info(PROGRAM, '已创建开机计划任务（SYSTEM_STARTUP，runInBackground）');
                }
            } else {
                for (var x = 0; x < matches.length; x++) {
                    var t = matches[x];
                    if (t.enabled !== false) {
                        await ProcessManager.callKernelAPI(this.pid, 'ScheduleTask.setEnabled', [t.id, false]);
                    }
                }
                this._autoStart = false;
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.info(PROGRAM, '已禁用与 CursorStyle 相关的开机计划任务');
                }
            }
        },

        /**
         * __init__ 返回、进程 status 变为 running 之后执行：注册托盘、必要时转入后台。
         */
        _runDeferredStartup: async function () {
            await this._registerTray();
            if (this._state.onboardingDone) {
                await this._hideUiForBackground();
                await this._goBackground();
                await this._toast('指针主题已在后台运行。点击任务栏「隐藏的应用」中的图标可打开设置，或右键查看更多选项。');
            }
        },

        _removeInjectedCursor: function () {
            var el = document.getElementById(STYLE_ID);
            if (el) el.remove();
            document.body.classList.remove('zos-cursorstyle-active');
            document.body.removeAttribute('data-cursorstyle-theme');
        },

        _applyTheme: function (themeId) {
            this._removeInjectedCursor();
            var t = THEMES[themeId] || THEMES.neon;
            if (themeId === 'system' || !t.svg) {
                this._selectedTheme = 'system';
                return;
            }
            var uri = svgDataUri(t.svg);
            var css = 'body.zos-cursorstyle-active, body.zos-cursorstyle-active * { cursor: url("' + uri + '") ' + t.hx + ' ' + t.hy + ', auto !important; }';
            var style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = css;
            document.head.appendChild(style);
            document.body.classList.add('zos-cursorstyle-active');
            document.body.setAttribute('data-cursorstyle-theme', themeId);
            this._selectedTheme = themeId;
        },

        _renderShell: function () {
            var self = this;
            this.window.innerHTML = [
                '<div class="cursorstyle-header">',
                '  <h1>指针主题 CursorStyle</h1>',
                '  <p>为 ZerOS 桌面应用 SVG 指针样式，支持向导配置与任务栏后台常驻。</p>',
                '</div>',
                '<div class="cursorstyle-body">',
                '  <div class="cursorstyle-steps" data-cs-steps></div>',
                '  <div class="cursorstyle-panel" data-panel="0">',
                '    <p>欢迎使用 CursorStyle。本程序会在后台保持运行以持续应用指针样式。</p>',
                '    <p class="cursorstyle-footnote">提示：安装后注册名为 <code>cursorstyle</code>；若尚未通过 ZOM 安装，部分「开机自启」功能将不可用。</p>',
                '    <div class="cursorstyle-actions">',
                '      <button type="button" class="cursorstyle-btn primary" data-cs-action="wiz-next">开始配置</button>',
                '    </div>',
                '  </div>',
                '  <div class="cursorstyle-panel" data-panel="1">',
                '    <p>选择一套 SVG 指针样式（可稍后从任务栏右键更改）。</p>',
                '    <div class="cursorstyle-theme-grid" data-cs-theme-grid></div>',
                '    <div class="cursorstyle-actions">',
                '      <button type="button" class="cursorstyle-btn ghost" data-cs-action="wiz-back">上一步</button>',
                '      <button type="button" class="cursorstyle-btn primary" data-cs-action="wiz-next">下一步</button>',
                '    </div>',
                '  </div>',
                '  <div class="cursorstyle-panel" data-panel="2">',
                '    <p>是否开启「系统启动时自动运行」？将写入<strong>计划任务</strong>（与「计划任务管理」相同机制，需授权 <code>SCHEDULE_TASK_CREATE</code> / <code>SCHEDULE_TASK_MANAGE</code>）。</p>',
                '    <div class="cursorstyle-row">',
                '      <div><div>开机自动运行 CursorStyle</div>',
                '      <div class="hint">创建「程序 · cursorstyle · 系统启动时」任务，默认后台运行；可在计划任务管理中查看或编辑。</div></div>',
                '      <button type="button" class="cursorstyle-toggle" data-cs-action="toggle-autostart" aria-pressed="false" aria-label="切换开机自启"></button>',
                '    </div>',
                '    <div class="cursorstyle-actions">',
                '      <button type="button" class="cursorstyle-btn ghost" data-cs-action="wiz-back">上一步</button>',
                '      <button type="button" class="cursorstyle-btn primary" data-cs-action="wiz-next">下一步</button>',
                '    </div>',
                '  </div>',
                '  <div class="cursorstyle-panel" data-panel="3">',
                '    <p>配置完成。即将最小化到任务栏后台，可随时在「隐藏的应用」中单击图标打开本窗口。</p>',
                '    <div class="cursorstyle-actions">',
                '      <button type="button" class="cursorstyle-btn primary" data-cs-action="wiz-finish">完成并转入后台</button>',
                '    </div>',
                '  </div>',
                '  <div class="cursorstyle-panel" data-panel="4">',
                '    <p>快速设置</p>',
                '    <div class="cursorstyle-theme-grid" data-cs-theme-grid-settings></div>',
                '    <div class="cursorstyle-row">',
                '      <div><div>开机自动运行</div><div class="hint">与计划任务中「系统启动时」启动本程序的任务同步（禁用不会删除任务，仅关闭启用）。</div></div>',
                '      <button type="button" class="cursorstyle-toggle" data-cs-toggle-settings="autostart" aria-pressed="false" aria-label="开机自启"></button>',
                '    </div>',
                '    <div class="cursorstyle-actions">',
                '      <button type="button" class="cursorstyle-btn ghost" data-cs-action="open-wizard">重新运行向导</button>',
                '      <button type="button" class="cursorstyle-btn" data-cs-action="apply-save">应用并保存</button>',
                '      <button type="button" class="cursorstyle-btn primary" data-cs-action="settings-bg">隐藏窗口（保持后台）</button>',
                '    </div>',
                '    <p class="cursorstyle-footnote">右键任务栏托盘中的本程序可切换主题、打开本页或退出。</p>',
                '  </div>',
                '</div>'
            ].join('');

            this._fillThemeGrids();
            this._syncAutostartToggles();
        },

        _fillThemeGrids: function () {
            var mkCard = function (key) {
                var th = THEMES[key];
                var prev = '';
                if (th.svg) {
                    var src = svgDataUri(th.svg);
                    prev = '<div class="preview"><img src="' + src + '" alt=""/></div>';
                } else {
                    prev = '<div class="preview"><span style="font-size:0.7rem;opacity:0.7">系统</span></div>';
                }
                return (
                    '<div class="cursorstyle-theme-card' + (key === this._selectedTheme ? ' is-selected' : '') + '" data-cs-theme="' + key + '" tabindex="0">' +
                    prev + '<div class="name">' + th.name + '</div></div>'
                );
            }.bind(this);

            var g1 = this.window.querySelector('[data-cs-theme-grid]');
            var g2 = this.window.querySelector('[data-cs-theme-grid-settings]');
            var keys = Object.keys(THEMES);
            if (g1) g1.innerHTML = keys.map(mkCard).join('');
            if (g2) g2.innerHTML = keys.map(mkCard).join('');
        },

        _syncAutostartToggles: function () {
            var a = this.window.querySelector('[data-cs-action="toggle-autostart"]');
            var b = this.window.querySelector('[data-cs-toggle-settings="autostart"]');
            var v = this._autoStart ? 'true' : 'false';
            if (a) a.setAttribute('aria-pressed', v);
            if (b) b.setAttribute('aria-pressed', v);
        },

        _syncPanels: function () {
            var steps = this.window.querySelector('[data-cs-steps]');
            if (steps) {
                var labels = ['欢迎', '样式', '自启', '完成'];
                if (this._wizardStep >= 4) {
                    steps.innerHTML = '<span class="cursorstyle-step-pill is-active">设置</span>';
                } else {
                    steps.innerHTML = labels.map(function (_, i) {
                        return '<span class="cursorstyle-step-pill' + (i === this._wizardStep ? ' is-active' : '') + '">' + (i + 1) + '. ' + labels[i] + '</span>';
                    }, this).join('');
                }
            }
            var panels = this.window.querySelectorAll('.cursorstyle-panel');
            for (var i = 0; i < panels.length; i++) {
                var p = panels[i];
                var idx = parseInt(p.getAttribute('data-panel'), 10);
                var show = this._wizardStep >= 4 ? idx === 4 : idx === this._wizardStep;
                p.classList.toggle('is-visible', show);
            }
            this._fillThemeGrids();
            this._highlightSelectedCards();
            this._syncAutostartToggles();
        },

        _highlightSelectedCards: function () {
            var cards = this.window.querySelectorAll('.cursorstyle-theme-card');
            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                c.classList.toggle('is-selected', c.getAttribute('data-cs-theme') === this._selectedTheme);
            }
        },

        _bindEvents: function () {
            var self = this;
            if (typeof EventManager === 'undefined') return;

            EventManager.registerEventHandler(this.pid, 'click', function (e) {
                if (!self.window || !self.window.contains(e.target)) return;
                var t = e.target;
                var actionEl = t.closest('[data-cs-action]');
                if (actionEl) {
                    var act = actionEl.getAttribute('data-cs-action');
                    if (act === 'wiz-next') self._onWizardNext();
                    else if (act === 'wiz-back') self._onWizardBack();
                    else if (act === 'wiz-finish') self._onWizardFinish();
                    else if (act === 'toggle-autostart') self._toggleAutostartFromWizard();
                    else if (act === 'open-wizard') { self._wizardStep = 0; self._syncPanels(); }
                    else if (act === 'apply-save') self._applySettingsSave();
                    else if (act === 'settings-bg') self._hideSettingsToBackground();
                }
                var themeCard = t.closest('[data-cs-theme]');
                if (themeCard && themeCard.closest('.cursorstyle-theme-grid')) {
                    var id = themeCard.getAttribute('data-cs-theme');
                    if (id) {
                        self._selectedTheme = id;
                        self._applyTheme(id);
                        self._highlightSelectedCards();
                    }
                }
                var st = t.closest('[data-cs-toggle-settings]');
                if (st && st.getAttribute('data-cs-toggle-settings') === 'autostart') {
                    self._toggleAutostartSettings();
                }
            }, { priority: 80 });
        },

        _toggleAutostartFromWizard: function () {
            this._autoStart = !this._autoStart;
            this._syncAutostartToggles();
        },

        _toggleAutostartSettings: function () {
            this._autoStart = !this._autoStart;
            this._syncAutostartToggles();
        },

        _onWizardNext: function () {
            if (this._wizardStep < 3) {
                this._wizardStep++;
                if (this._wizardStep === 2) this._syncAutostartToggles();
                this._syncPanels();
            }
        },

        _onWizardBack: function () {
            if (this._wizardStep > 0) {
                this._wizardStep--;
                this._syncPanels();
            }
        },

        _onWizardFinish: async function () {
            try {
                if (this._autoStart) {
                    await this._setAutoStartSchedule(true, false);
                } else {
                    await this._setAutoStartSchedule(false);
                }
            } catch (e) {
                if (typeof GUIManager !== 'undefined' && GUIManager.showAlert) {
                    await GUIManager.showAlert(
                        '自启未写入：' + (e.message || e) + '\n请授权 SCHEDULE_TASK_CREATE / SCHEDULE_TASK_MANAGE；若策略要求「系统启动后执行」危险权限，请在计划任务管理中勾选对应选项创建任务。',
                        'CursorStyle',
                        'warning'
                    );
                }
            }
            this._state.onboardingDone = true;
            await this._saveState();
            this._wizardStep = 4;
            this._syncPanels();
            await this._hideUiForBackground();
            await this._goBackground();
            await this._toast('指针主题已应用。可在任务栏「隐藏的应用」中管理本程序。');
        },

        _applySettingsSave: async function () {
            try {
                await this._setAutoStartSchedule(!!this._autoStart, false);
            } catch (e) {
                if (typeof GUIManager !== 'undefined' && GUIManager.showAlert) {
                    await GUIManager.showAlert('保存自启失败：' + (e.message || e) + '（需计划任务相关权限）', 'CursorStyle', 'warning');
                }
            }
            await this._saveState();
            await this._toast('已保存指针与自启设置');
        },

        _hideSettingsToBackground: async function () {
            await this._hideUiForBackground();
            await this._goBackground();
        },

        _bringUi: async function () {
            if (!this.window) return;
            this.window.style.cssText = '';
            this._visibleSettings = true;
            var self = this;
            if (typeof ProcessManager !== 'undefined' && ProcessManager.callKernelAPI) {
                try {
                    await ProcessManager.callKernelAPI(this.pid, 'Process.requestForeground', []);
                } catch (e) { /* starting 阶段可能失败，忽略 */ }
            }
            try {
                self._autoStart = await self._readAutoStartFromSchedule();
                self._syncAutostartToggles();
            } catch (e) { /* 忽略 */ }
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                if (typeof GUIManager.restoreWindow === 'function') {
                    try {
                        GUIManager.restoreWindow(this.windowId, true);
                    } catch (e) { /* 忽略 */ }
                }
                if (typeof GUIManager.showWindowsForPid === 'function') {
                    try {
                        GUIManager.showWindowsForPid(this.pid);
                    } catch (e) { /* 忽略 */ }
                }
                if (typeof GUIManager.focusWindow === 'function') {
                    GUIManager.focusWindow(this.windowId);
                }
            }
        },

        _hideUiForBackground: function () {
            if (!this.window) return;
            this.window.style.cssText = 'position:fixed!important;left:-9999px!important;top:0!important;width:4px!important;height:4px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important;';
            this._visibleSettings = false;
        },

        _goBackground: async function () {
            if (typeof ProcessManager !== 'undefined' && ProcessManager.callKernelAPI) {
                try {
                    await ProcessManager.callKernelAPI(this.pid, 'Process.requestBackground', []);
                } catch (e) {
                    this._log('requestBackground: ' + e.message);
                }
            }
            if (typeof TaskbarManager !== 'undefined' && TaskbarManager.update) {
                TaskbarManager.update();
            }
        },

        _toast: async function (msg) {
            if (typeof NotificationManager === 'undefined' || !NotificationManager.createNotification) return;
            try {
                await NotificationManager.createNotification(this.pid, {
                    type: 'snapshot',
                    title: 'CursorStyle',
                    message: msg,
                    duration: 4200
                });
            } catch (e) { /* 忽略 */ }
        },

        _registerTray: async function () {
            var self = this;
            if (typeof ProcessManager === 'undefined' || !ProcessManager.callKernelAPI) return;
            try {
                await ProcessManager.callKernelAPI(this.pid, 'Process.registerBackgroundTrayClick', [
                    function () {
                        if (self._visibleSettings) {
                            self._hideUiForBackground();
                            self._goBackground();
                        } else {
                            self._wizardStep = 4;
                            self._syncPanels();
                            void self._bringUi();
                        }
                    }
                ]);
                await ProcessManager.callKernelAPI(this.pid, 'Process.registerBackgroundTrayContextMenu', [
                    function () {
                        return [
                            {
                                label: '打开设置',
                                onClick: function () {
                                    self._wizardStep = 4;
                                    self._syncPanels();
                                    void self._bringUi();
                                }
                            },
                            {
                                label: '重新运行向导',
                                onClick: function () {
                                    self._wizardStep = 0;
                                    self._syncPanels();
                                    void self._bringUi();
                                }
                            },
                            {
                                label: '使用：跟随系统',
                                onClick: function () {
                                    self._selectedTheme = 'system';
                                    self._applyTheme('system');
                                    self._saveState();
                                }
                            },
                            {
                                label: '使用：经典箭头',
                                onClick: function () {
                                    self._applyTheme('default');
                                    self._saveState();
                                }
                            },
                            {
                                label: '使用：霓虹环',
                                onClick: function () {
                                    self._applyTheme('neon');
                                    self._saveState();
                                }
                            },
                            {
                                label: '使用：极简十字',
                                onClick: function () {
                                    self._applyTheme('minimal');
                                    self._saveState();
                                }
                            },
                            {
                                label: '使用：气泡',
                                onClick: function () {
                                    self._applyTheme('bubble');
                                    self._saveState();
                                }
                            },
                            {
                                label: '使用：战术准星',
                                onClick: function () {
                                    self._applyTheme('reticle');
                                    self._saveState();
                                }
                            }
                        ];
                    }
                ]);
            } catch (e) {
                this._log('注册托盘菜单失败 ' + e.message);
            }
        }
    };

    global[PROGRAM] = CURSORSTYLE;
})(typeof window !== 'undefined' ? window : globalThis);
