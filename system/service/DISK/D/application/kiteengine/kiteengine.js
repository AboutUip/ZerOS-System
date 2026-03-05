// KiteEngine - ZerOS 3D 游戏引擎（GUI 主程序）
// 主窗口提供服务检查入口：未安装时自动将 assets 内服务写入 D/server 并拉起（需声明 SERVER_SERVICE_MANAGE、KERNEL_DISK_READ/WRITE）

(function(window) {
    'use strict';

    const PM = typeof PermissionManager !== 'undefined' ? PermissionManager.PERMISSION : {};
    const SERVICE_ID = 'kiteEngine';
    const SERVER_FILENAME = 'server-kiteEngine.js';
    const ASSET_SERVICE_PATH = 'D:/application/kiteengine/assets/server-kiteEngine.js';
    const SERVER_SERVICE_PATH = 'D:/server/' + SERVER_FILENAME;

    const KITEENGINE = {
        pid: null,
        window: null,
        windowId: null,
        _kernelAPI: null,
        eventHandlers: [],
        dragHandle: null,
        engineContainer: null,
        _engineStop: null,
        _engineControl: null,
        _fallbackPanel: null,
        _hierarchyEl: null,
        _inspectorEl: null,
        _unsubscribeSelection: null,

        __info__: function() {
            return {
                name: 'KiteEngine',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS 3D 游戏引擎',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PM.GUI_WINDOW_CREATE,
                    PM.EVENT_LISTENER,
                    PM.KERNEL_DISK_READ,
                    PM.KERNEL_DISK_WRITE,
                    PM.KERNEL_DISK_LIST,
                    PM.SERVER_SERVICE_MANAGE
                ] : [],
                metadata: {
                    category: 'utility',
                    showOnDesktop: true,
                    allowMultipleInstances: false,
                    supportsPreview: true
                }
            };
        },

        __init__: async function(pid, initArgs) {
            this.pid = pid;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;
            this.eventHandlers = [];

            const guiContainer = (initArgs && initArgs.guiContainer) || document.getElementById('gui-container');
            if (!guiContainer) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('KITEENGINE', '未找到 gui-container');
                }
                return;
            }

            this.window = document.createElement('div');
            this.window.className = 'kiteengine-window';
            this.window.dataset.pid = String(pid);
            this.window.style.cssText = `
                width: 640px;
                height: 480px;
                min-width: 400px;
                min-height: 300px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                position: relative;
            `;

            const dragStrip = document.createElement('div');
            dragStrip.className = 'kiteengine-drag-strip';
            dragStrip.style.cssText = `
                height: 28px;
                min-height: 28px;
                max-height: 28px;
                flex-shrink: 0;
                cursor: move;
                user-select: none;
                display: flex;
                align-items: center;
                padding: 0 0 0 12px;
                box-sizing: border-box;
                background: var(--theme-window-titlebar-bg, rgba(0,0,0,0.15));
                color: var(--theme-text-primary, #e2e8f0);
                font-size: 13px;
                font-weight: 500;
            `;
            const titleLeft = document.createElement('div');
            titleLeft.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';
            let icon = null;
            if (typeof ApplicationAssetManager !== 'undefined') {
                icon = ApplicationAssetManager.getIcon('kiteengine');
            }
            if (icon) {
                const iconEl = document.createElement('img');
                const iconUrl = (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function')
                    ? ProcessManager.convertVirtualPathToUrl(icon) : icon;
                iconEl.src = iconUrl;
                iconEl.alt = '';
                iconEl.style.cssText = 'width:16px;height:16px;pointer-events:none;';
                titleLeft.appendChild(iconEl);
            }
            const dragTitle = document.createElement('span');
            dragTitle.textContent = 'KiteEngine';
            titleLeft.appendChild(dragTitle);
            dragStrip.appendChild(titleLeft);
            const titleSpacer = document.createElement('div');
            titleSpacer.style.cssText = 'flex:1;min-width:0;';
            dragStrip.appendChild(titleSpacer);
            this.window.appendChild(dragStrip);
            this.dragHandle = dragStrip;

            const menuBar = document.createElement('div');
            menuBar.className = 'kiteengine-menubar';
            menuBar.style.cssText = `
                height: 24px;
                min-height: 24px;
                max-height: 24px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                padding: 0 12px;
                gap: 4px;
                box-sizing: border-box;
                background: var(--theme-window-titlebar-bg, rgba(0,0,0,0.08));
                color: var(--theme-text-secondary, #94a3b8);
                font-size: 12px;
                border-bottom: 1px solid var(--theme-border, rgba(139,92,246,0.2));
            `;
            ['文件', '编辑', '视图', '帮助'].forEach(function (label) {
                const item = document.createElement('span');
                item.className = 'kiteengine-menuitem';
                item.textContent = label;
                item.style.cssText = 'padding:2px 8px;border-radius:4px;cursor:default;';
                item.addEventListener('mouseenter', function () { item.style.background = 'rgba(255,255,255,0.06)'; });
                item.addEventListener('mouseleave', function () { item.style.background = 'transparent'; });
                menuBar.appendChild(item);
            });
            this.window.appendChild(menuBar);

            const toolbar = document.createElement('div');
            toolbar.className = 'kiteengine-toolbar';
            toolbar.style.cssText = `
                height: 32px;
                min-height: 32px;
                max-height: 32px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                padding: 0 8px;
                gap: 4px;
                box-sizing: border-box;
                background: var(--theme-window-titlebar-bg, rgba(0,0,0,0.06));
                border-bottom: 1px solid var(--theme-border, rgba(139,92,246,0.15));
            `;
            const toolBtnStyle = 'height:24px;padding:0 10px;font-size:12px;border-radius:4px;border:1px solid rgba(139,92,246,0.3);background:rgba(139,92,246,0.15);color:var(--theme-text-primary,#e2e8f0);cursor:pointer;';
            ['立方体', '球体', '平面'].forEach(function (label, idx) {
                const type = ['box', 'sphere', 'plane'][idx];
                const btn = document.createElement('button');
                btn.className = 'kiteengine-toolbtn';
                btn.textContent = label;
                btn.style.cssText = toolBtnStyle;
                btn.addEventListener('click', function () {
                    if (this._engineControl && this._engineControl.addObject) this._engineControl.addObject(type);
                }.bind(this));
                toolbar.appendChild(btn);
            });
            const delBtn = document.createElement('button');
            delBtn.className = 'kiteengine-toolbtn-delete';
            delBtn.textContent = '删除选中';
            delBtn.style.cssText = toolBtnStyle + ' border-color:rgba(239,68,68,0.4);background:rgba(239,68,68,0.12);';
            delBtn.addEventListener('click', function () {
                if (this._engineControl && this._engineControl.removeObject && this._engineControl.getSelection()) {
                    this._engineControl.removeObject(this._engineControl.getSelection());
                    this._refreshEditorPanels();
                }
            }.bind(this));
            toolbar.appendChild(delBtn);
            this.window.appendChild(toolbar);

            const body = document.createElement('div');
            body.className = 'kiteengine-body';
            body.style.cssText = 'flex:1;min-height:0;display:flex;overflow:hidden;';

            const hierarchyPanel = document.createElement('div');
            hierarchyPanel.className = 'kiteengine-panel kiteengine-hierarchy';
            hierarchyPanel.style.cssText = 'width:200px;min-width:200px;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--theme-border,rgba(139,92,246,0.2));';
            const hierarchyTitle = document.createElement('div');
            hierarchyTitle.style.cssText = 'height:24px;min-height:24px;flex-shrink:0;padding:0 8px;line-height:24px;font-size:12px;font-weight:600;color:var(--theme-text-secondary,#94a3b8);background:rgba(0,0,0,0.2);';
            hierarchyTitle.textContent = '层级';
            hierarchyPanel.appendChild(hierarchyTitle);
            const hierarchyList = document.createElement('div');
            hierarchyList.className = 'kiteengine-hierarchy-list';
            hierarchyList.style.cssText = 'flex:1;min-height:0;overflow:auto;padding:4px;font-size:12px;';
            hierarchyPanel.appendChild(hierarchyList);
            this._hierarchyEl = hierarchyList;
            body.appendChild(hierarchyPanel);

            this.engineContainer = document.createElement('div');
            this.engineContainer.className = 'kiteengine-engine-container';
            this.engineContainer.style.cssText = 'flex:1;min-width:0;min-height:0;background:#1a1a2e;position:relative;';
            body.appendChild(this.engineContainer);

            const inspectorPanel = document.createElement('div');
            inspectorPanel.className = 'kiteengine-panel kiteengine-inspector';
            inspectorPanel.style.cssText = 'width:220px;min-width:220px;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;border-left:1px solid var(--theme-border,rgba(139,92,246,0.2));';
            const inspectorTitle = document.createElement('div');
            inspectorTitle.style.cssText = 'height:24px;min-height:24px;flex-shrink:0;padding:0 8px;line-height:24px;font-size:12px;font-weight:600;color:var(--theme-text-secondary,#94a3b8);background:rgba(0,0,0,0.2);';
            inspectorTitle.textContent = '检查器';
            inspectorPanel.appendChild(inspectorTitle);
            const inspectorContent = document.createElement('div');
            inspectorContent.className = 'kiteengine-inspector-content';
            inspectorContent.style.cssText = 'flex:1;min-height:0;overflow:auto;padding:8px;font-size:12px;';
            inspectorPanel.appendChild(inspectorContent);
            this._inspectorEl = inspectorContent;
            body.appendChild(inspectorPanel);

            this.window.appendChild(body);

            if (typeof GUIManager !== 'undefined') {
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: 'KiteEngine',
                    icon: icon,
                    borderless: true,
                    noTitleBar: true,
                    dragHandle: this.dragHandle,
                    onClose: () => this._onCloseRequest()
                });
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                    this._addWindowControlButtons(dragStrip);
                }
            }

            guiContainer.appendChild(this.window);

            this._ensureServiceAndStartEngine();

            this._registerEventHandlers();
        },

        _hasServerAPI: function() {
            return this._kernelAPI && typeof this._kernelAPI.call === 'function';
        },

        _ensureServiceAndStartEngine: async function() {
            const self = this;
            if (typeof window.KiteEngineAPI !== 'undefined' && typeof window.KiteEngineAPI.runInContainer === 'function') {
                self._runEngineInContainer();
                return;
            }
            if (self._hasServerAPI()) {
                try {
                    await self._ensureServiceReady();
                    await self._waitForKiteEngineAPI(800);
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') KernelLogger.warn('KITEENGINE', 'ensureServiceReady: ' + (e && e.message));
                }
            }
            if (typeof window.KiteEngineAPI !== 'undefined' && typeof window.KiteEngineAPI.runInContainer === 'function') {
                self._runEngineInContainer();
                return;
            }
            self._showFallbackPanel(true);
        },

        _ensureServiceReady: async function() {
            const api = this._kernelAPI;
            let ids = [];
            try {
                ids = (await api.call('Server.listServices', [])) || [];
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('KITEENGINE', 'listServices: ' + (e && e.message));
                return;
            }
            const installed = ids.indexOf(SERVICE_ID) >= 0;
            if (!installed) {
                const listed = await this._listServerDir();
                if (listed.indexOf(SERVER_FILENAME) < 0) {
                    await this._installService();
                } else {
                    await api.call('Server.loadAll', []);
                }
            }
            try {
                await api.call('Server.start', [SERVICE_ID]);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('KITEENGINE', 'Server.start: ' + (e && e.message));
            }
        },

        _listServerDir: async function() {
            try {
                const list = (await this._kernelAPI.call('FileSystem.list', ['D:/server'])) || {};
                const files = list.files || [];
                const dirs = list.directories || list.dirs || [];
                const names = files.concat(dirs).map(function(x) { return (x && x.name) ? x.name : (typeof x === 'string' ? x : ''); });
                return names.filter(Boolean);
            } catch (e) {
                return [];
            }
        },

        _installService: async function() {
            const api = this._kernelAPI;
            const content = await api.call('FileSystem.read', [ASSET_SERVICE_PATH]);
            if (!content && content !== '') {
                throw new Error('读取服务文件为空');
            }
            await api.call('FileSystem.write', [SERVER_SERVICE_PATH, content]);
            await api.call('Server.loadAll', []);
        },

        _waitForKiteEngineAPI: function(maxMs) {
            const step = 100;
            let elapsed = 0;
            return new Promise(function(resolve) {
                function tick() {
                    if (typeof window.KiteEngineAPI !== 'undefined' && typeof window.KiteEngineAPI.runInContainer === 'function') {
                        resolve();
                        return;
                    }
                    elapsed += step;
                    if (elapsed >= maxMs) {
                        resolve();
                        return;
                    }
                    setTimeout(tick, step);
                }
                setTimeout(tick, step);
            });
        },

        _runEngineInContainer: function() {
            const self = this;
            if (typeof window.KiteEngineAPI === 'undefined' || typeof window.KiteEngineAPI.runInContainer !== 'function') return;
            // 等一帧确保容器已布局，避免 clientWidth/clientHeight 为 0 导致画布无内容
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    if (!self.engineContainer) return;
                    window.KiteEngineAPI.runInContainer(self.engineContainer).then(function(control) {
                        self._removeFallbackPanel();
                        if (control) {
                            self._engineControl = control;
                            self._engineStop = typeof control.stop === 'function' ? control.stop : null;
                            if (typeof control.onSelectionChange === 'function') {
                                self._unsubscribeSelection = control.onSelectionChange(function() { self._refreshEditorPanels(); });
                            }
                            self._refreshEditorPanels();
                        }
                    }).catch(function(e) {
                        if (typeof KernelLogger !== 'undefined') KernelLogger.warn('KITEENGINE', '引擎启动失败: ' + (e && e.message));
                        self._showFallbackPanel(true);
                    });
                });
            });
        },

        _installAndStartService: async function() {
            const self = this;
            if (!self._hasServerAPI()) return;
            const btn = self._fallbackPanel && self._fallbackPanel.querySelector('.kiteengine-btn-install');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '正在安装并启动…';
            }
            try {
                const ids = (await self._kernelAPI.call('Server.listServices', [])) || [];
                if (ids.indexOf(SERVICE_ID) < 0) {
                    const names = await self._listServerDir();
                    if (names.indexOf(SERVER_FILENAME) < 0) {
                        await self._installService();
                    } else {
                        await self._kernelAPI.call('Server.loadAll', []);
                    }
                }
                await self._kernelAPI.call('Server.start', [SERVICE_ID]);
                await self._waitForKiteEngineAPI(1200);
                if (typeof window.KiteEngineAPI !== 'undefined' && typeof window.KiteEngineAPI.runInContainer === 'function') {
                    self._runEngineInContainer();
                } else {
                    if (btn) { btn.disabled = false; btn.textContent = '安装并启动服务'; }
                    self._setFallbackText('服务已启动，请关闭本窗口后重新打开 KiteEngine');
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.warn('KITEENGINE', 'installAndStart: ' + (e && e.message));
                if (btn) { btn.disabled = false; btn.textContent = '安装并启动服务'; }
                self._setFallbackText('安装或启动失败：' + (e && e.message));
            }
        },

        _retryStartEngine: function() {
            if (typeof window.KiteEngineAPI !== 'undefined' && typeof window.KiteEngineAPI.runInContainer === 'function') {
                this._runEngineInContainer();
            } else {
                this._installAndStartService();
            }
        },

        _showFallbackPanel: function(showInstallButton) {
            this._removeFallbackPanel();
            if (!this.engineContainer) return;
            const panel = document.createElement('div');
            panel.className = 'kiteengine-fallback-panel';
            panel.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;font-size:14px;text-align:center;padding:24px;box-sizing:border-box;background:#1a1a2e;';
            const title = document.createElement('div');
            title.style.cssText = 'font-weight:600;margin-bottom:8px;color:#e2e8f0;';
            title.textContent = 'KiteEngine 服务未就绪';
            panel.appendChild(title);
            const desc = document.createElement('div');
            desc.className = 'kiteengine-fallback-desc';
            desc.style.cssText = 'margin-bottom:16px;max-width:320px;';
            desc.textContent = '未检测到引擎服务。若未安装，将把服务写入系统并自动启动（需已授予磁盘写入与服务管理权限）。';
            panel.appendChild(desc);
            if (showInstallButton && this._hasServerAPI()) {
                const btn = document.createElement('button');
                btn.className = 'kiteengine-btn-install';
                btn.textContent = '安装并启动服务';
                btn.style.cssText = 'padding:8px 16px;cursor:pointer;border-radius:6px;border:1px solid rgba(139,92,246,0.5);background:rgba(139,92,246,0.2);color:#c4b5fd;';
                btn.addEventListener('click', () => this._installAndStartService());
                panel.appendChild(btn);
            }
            this.engineContainer.appendChild(panel);
            this._fallbackPanel = panel;
        },

        _setFallbackText: function(text) {
            if (this._fallbackPanel) {
                const desc = this._fallbackPanel.querySelector('.kiteengine-fallback-desc');
                if (desc) desc.textContent = text;
            }
        },

        _removeFallbackPanel: function() {
            if (this._fallbackPanel && this._fallbackPanel.parentNode) {
                this._fallbackPanel.parentNode.removeChild(this._fallbackPanel);
            }
            this._fallbackPanel = null;
        },

        _refreshEditorPanels: function() {
            const ctrl = this._engineControl;
            if (!ctrl || !this._hierarchyEl) return;
            const sel = ctrl.getSelection ? ctrl.getSelection() : null;

            this._hierarchyEl.innerHTML = '';
            function addNode(par, node, depth) {
                if (!node || node.id === 'scene') {
                    if (node && node.children && node.children.length) {
                        node.children.forEach(function (ch) { addNode(par, ch, depth + 1); });
                    }
                    return;
                }
                const row = document.createElement('div');
                row.className = 'kiteengine-hierarchy-item';
                row.style.cssText = 'padding:4px 8px 4px ' + (8 + depth * 12) + 'px;cursor:pointer;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                if (sel === node.id) row.style.background = 'rgba(139,92,246,0.25)';
                row.textContent = node.name || node.id || 'Object';
                row.addEventListener('click', function () {
                    if (ctrl.setSelection) ctrl.setSelection(node.id);
                });
                par.appendChild(row);
                if (node.children && node.children.length) {
                    node.children.forEach(function (ch) { addNode(par, ch, depth + 1); });
                }
            }
            const root = ctrl.getHierarchy ? ctrl.getHierarchy() : null;
            if (root && root.children) root.children.forEach(function (ch) { addNode(this._hierarchyEl, ch, 0); }.bind(this));

            if (!this._inspectorEl) return;
            this._inspectorEl.innerHTML = '';
            if (!sel) {
                this._inspectorEl.innerHTML = '<div style="color:var(--theme-text-secondary,#94a3b8);">未选中对象</div>';
                return;
            }
            const props = ctrl.getObjectProperties ? ctrl.getObjectProperties(sel) : null;
            if (!props) return;
            const insp = this._inspectorEl;
            function addProp(label, key, fields) {
                const block = document.createElement('div');
                block.style.marginBottom = '12px';
                block.innerHTML = '<div style="font-weight:600;margin-bottom:4px;color:var(--theme-text-secondary,#94a3b8);">' + label + '</div>';
                const val = props[key];
                if (fields && val && typeof val === 'object') {
                    fields.forEach(function (axis) {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
                        const v = (val[axis] != null ? val[axis] : 0);
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.value = v;
                        input.style.cssText = 'width:60px;padding:4px;font-size:11px;border-radius:4px;border:1px solid rgba(139,92,246,0.3);background:rgba(0,0,0,0.2);color:inherit;';
                        input.addEventListener('change', function () {
                            const next = { x: val.x, y: val.y, z: val.z };
                            next[axis] = parseFloat(input.value, 10) || 0;
                            if (ctrl.setObjectProperty) ctrl.setObjectProperty(sel, key, next);
                        });
                        row.innerHTML = '<span style="width:12px;">' + axis.toUpperCase() + '</span>';
                        row.appendChild(input);
                        block.appendChild(row);
                    });
                }
                insp.appendChild(block);
            }
            insp.appendChild(document.createElement('div')).textContent = props.name || 'Object';
            insp.lastChild.style.cssText = 'font-weight:600;margin-bottom:8px;';
            addProp('位置', 'position', ['x', 'y', 'z']);
            addProp('旋转', 'rotation', ['x', 'y', 'z']);
            addProp('缩放', 'scale', ['x', 'y', 'z']);
            if (props.color != null) {
                const colorBlock = document.createElement('div');
                colorBlock.style.marginBottom = '12px';
                colorBlock.innerHTML = '<div style="font-weight:600;margin-bottom:4px;color:var(--theme-text-secondary,#94a3b8);">颜色</div>';
                const input = document.createElement('input');
                input.type = 'text';
                input.value = '#' + (Number(props.color).toString(16).padStart(6, '0'));
                input.style.cssText = 'width:80px;padding:4px;font-size:11px;border-radius:4px;border:1px solid rgba(139,92,246,0.3);background:rgba(0,0,0,0.2);color:inherit;';
                input.addEventListener('change', function () {
                    const hex = parseInt(input.value.replace('#', ''), 16);
                    if (!isNaN(hex) && ctrl.setObjectProperty) ctrl.setObjectProperty(sel, 'color', hex);
                });
                colorBlock.appendChild(input);
                insp.appendChild(colorBlock);
            }
        },

        _registerEventHandlers: function() {
            if (typeof EventManager === 'undefined') return;
            // 若有按钮等需点击，可在此用 EventManager.registerElementEvent 注册并 push 到 this.eventHandlers
        },

        _onCloseRequest: function() {
            this._exit();
        },

        _addWindowControlButtons: function(dragStrip) {
            if (typeof GUIManager === 'undefined' || !this.windowId) return;
            const self = this;
            const btnStyle = `
                width: 28px; height: 28px; border: none; background: transparent;
                color: var(--theme-text-primary, rgba(215,224,221,0.8)); cursor: pointer;
                border-radius: 4px; display: flex; align-items: center; justify-content: center;
                font-size: 16px; line-height: 1; flex-shrink: 0;
            `;
            const controls = document.createElement('div');
            controls.className = 'kiteengine-titlebar-controls';
            controls.style.cssText = 'display:flex;align-items:center;cursor:default;';

            const minBtn = document.createElement('button');
            minBtn.className = 'kiteengine-btn-min';
            minBtn.title = '最小化';
            minBtn.innerHTML = '−';
            minBtn.style.cssText = btnStyle;
            minBtn.addEventListener('click', function(e) { e.stopPropagation(); GUIManager.minimizeWindow(self.windowId); });
            minBtn.addEventListener('mouseenter', function() { minBtn.style.background = 'rgba(255,255,255,0.08)'; });
            minBtn.addEventListener('mouseleave', function() { minBtn.style.background = 'transparent'; });

            const maxBtn = document.createElement('button');
            maxBtn.className = 'kiteengine-btn-max';
            maxBtn.title = '最大化';
            maxBtn.innerHTML = '□';
            maxBtn.style.cssText = btnStyle;
            maxBtn.addEventListener('click', function(e) { e.stopPropagation(); GUIManager.toggleMaximize(self.windowId); });
            maxBtn.addEventListener('mouseenter', function() { maxBtn.style.background = 'rgba(255,255,255,0.08)'; });
            maxBtn.addEventListener('mouseleave', function() { maxBtn.style.background = 'transparent'; });

            const closeBtn = document.createElement('button');
            closeBtn.className = 'kiteengine-btn-close';
            closeBtn.title = '关闭';
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText = btnStyle + ' font-size: 20px;';
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof GUIManager._showTaskbar === 'function') GUIManager._showTaskbar();
                GUIManager._closeWindow(self.windowId, false);
            });
            closeBtn.addEventListener('mouseenter', function() {
                closeBtn.style.background = 'rgba(255,95,87,0.15)';
                closeBtn.style.color = '#ff5f57';
            });
            closeBtn.addEventListener('mouseleave', function() {
                closeBtn.style.background = 'transparent';
                closeBtn.style.color = 'var(--theme-text-primary, rgba(215,224,221,0.8))';
            });

            controls.appendChild(minBtn);
            controls.appendChild(maxBtn);
            controls.appendChild(closeBtn);
            controls.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            dragStrip.appendChild(controls);
        },

        _exit: function() {
            if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                this._kernelAPI.call('Process.requestSelfTermination', []).catch(function(e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('KITEENGINE', 'requestSelfTermination 失败: ' + (e && e.message));
                    }
                });
            }
        },

        __exit__: async function() {
            if (typeof EventManager !== 'undefined') {
                for (let i = 0; i < this.eventHandlers.length; i++) {
                    try {
                        EventManager.unregisterEventHandler(this.eventHandlers[i]);
                    } catch (e) {}
                }
            }
            this.eventHandlers = [];
            this._removeFallbackPanel();

            if (this._unsubscribeSelection && typeof this._unsubscribeSelection === 'function') {
                try { this._unsubscribeSelection(); } catch (e) {}
                this._unsubscribeSelection = null;
            }
            if (this._engineStop && typeof this._engineStop === 'function') {
                try { this._engineStop(); } catch (e) {}
                this._engineStop = null;
            }
            this._engineControl = null;
            if (typeof window.KiteEngineAPI !== 'undefined' && typeof window.KiteEngineAPI.stopCurrentSession === 'function') {
                try { window.KiteEngineAPI.stopCurrentSession(); } catch (e) {}
            }

            if (typeof GUIManager !== 'undefined' && this.windowId) {
                GUIManager.unregisterWindow(this.windowId);
            } else if (this.pid && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            }

            if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }

            this.window = null;
            this.windowId = null;
            this.engineContainer = null;
            this.dragHandle = null;
            this._hierarchyEl = null;
            this._inspectorEl = null;
            this._kernelAPI = null;
        }
    };

    if (typeof window !== 'undefined') {
        window.KITEENGINE = KITEENGINE;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.KITEENGINE = KITEENGINE;
    }
})(typeof window !== 'undefined' ? window : globalThis);
