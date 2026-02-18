(function (window) {
    'use strict';

    const OFFICE = {
        pid: null,
        window: null,
        windowId: null,
        kernelAPI: null,
        iframe: null,
        input: null,
        statusEl: null,
        dragHandle: null,
        editorEl: null,
        editorEnabled: false,
        currentPath: '',
        currentBuffer: null,
        zip: null,
        basePrefix: '',
        desc: null,
        page: null,
        styleEntries: null,
        contentEntries: null,
        selectedId: '',
        currentPageIndex: 0,
        childWindows: [],

        __init__: async function (pid, initArgs) {
            this.pid = pid;
            this._upid = initArgs && initArgs.upid;
            this.kernelAPI = initArgs && initArgs.kernelAPI ? initArgs.kernelAPI : null;

            const guiContainer = (initArgs && initArgs.guiContainer) || document.getElementById('gui-container');
            this.window = document.createElement('div');
            this.window.className = 'office-window zos-gui-window';
            this.window.dataset.pid = String(pid);

            this.window.innerHTML = '' +
                '<div class="office-container" data-role="drag">' +
                '  <div class="office-start-screen">' +
                '    <div class="office-start-drag-handle"></div>' +
                '  <div class="office-start-header" data-nodrag="1">' +
                '  </div>' +
                '  <div class="office-start-content" data-nodrag="1">' +
                '    <div class="office-start-actions">' +
                '      <div class="office-start-card" data-action="newDoc" data-nodrag="1">' +
                '        <div class="office-start-card-icon">' +
                '          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                '            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
                '            <polyline points="14 2 14 8 20 8"></polyline>' +
                '            <line x1="12" y1="18" x2="12" y2="12"></line>' +
                '            <line x1="9" y1="15" x2="15" y2="15"></line>' +
                '          </svg>' +
                '        </div>' +
                '        <div class="office-start-card-title">新建文档</div>' +
                '        <div class="office-start-card-desc">创建空白 ZDOC 文档</div>' +
                '      </div>' +
                '      <div class="office-start-card" data-action="openDoc" data-nodrag="1">' +
                '        <div class="office-start-card-icon">' +
                '          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                '            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' +
                '          </svg>' +
                '        </div>' +
                '        <div class="office-start-card-title">打开文档</div>' +
                '        <div class="office-start-card-desc">打开现有的 ZDOC 文件</div>' +
                '      </div>' +
                '      <div class="office-start-card" data-action="openSample" data-nodrag="1">' +
                '        <div class="office-start-card-icon">' +
                '          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                '            <circle cx="12" cy="12" r="10"></circle>' +
                '            <polygon points="10 8 16 12 10 16 10 8"></polygon>' +
                '          </svg>' +
                '        </div>' +
                '        <div class="office-start-card-title">示例文档</div>' +
                '        <div class="office-start-card-desc">查看 ZDOC 格式示例</div>' +
                '      </div>' +
                '    </div>' +
                '  </div>' +
                '  <div class="office-start-footer">' +
                '    <div class="office-start-version">ZerOS Office v1.0</div>' +
                '  </div>' +
                '</div>' +
                '<div class="office-toolbar" style="display:none">' +
                '  <input class="office-input" type="text" placeholder="ZDOC 路径，例如 D:/test/demo.zdoc" />' +
                '  <button class="office-btn" data-action="preview" data-nodrag="1">预览</button>' +
                '  <button class="office-btn" data-action="edit" data-nodrag="1">编辑</button>' +
                '  <button class="office-btn office-btn-secondary" data-action="addNode" data-nodrag="1" style="display:none" title="添加节点">+节点</button>' +
                '  <button class="office-btn office-btn-secondary" data-action="deleteNode" data-nodrag="1" style="display:none" title="删除选中节点">删节点</button>' +
                '  <button class="office-btn office-btn-secondary" data-action="addPage" data-nodrag="1" style="display:none" title="添加页面">+页</button>' +
                '  <button class="office-btn office-btn-secondary" data-action="deletePage" data-nodrag="1" style="display:none" title="删除当前页面">删页</button>' +
                '  <button class="office-btn office-btn-secondary" data-action="apply" data-nodrag="1" style="display:none">应用</button>' +
                '  <button class="office-btn office-btn-secondary" data-action="save" data-nodrag="1" style="display:none">保存</button>' +
                '  <button class="office-btn office-btn-secondary" data-action="saveas" data-nodrag="1" style="display:none">另存为</button>' +
                '  <button class="office-btn office-btn-secondary" data-action="backToStart" data-nodrag="1" title="返回主界面">返回</button>' +
                '  <span class="office-status"></span>' +
                '  <div class="office-window-controls" data-nodrag="1">' +
                '    <button class="office-winbtn" data-win="min" aria-label="最小化">—</button>' +
                '    <button class="office-winbtn" data-win="max" aria-label="最大化/还原">□</button>' +
                '    <button class="office-winbtn office-winbtn-close" data-win="close" aria-label="关闭">×</button>' +
                '  </div>' +
                '</div>' +
                '<div class="office-start-controls" data-nodrag="1">' +
                '  <div class="office-start-title">ZerOS Office</div>' +
                '  <div class="office-start-win-controls">' +
                '    <button class="office-winbtn" data-win="min" aria-label="最小化">—</button>' +
                '    <button class="office-winbtn" data-win="max" aria-label="最大化/还原">□</button>' +
                '    <button class="office-winbtn office-winbtn-close" data-win="close" aria-label="关闭">×</button>' +
                '  </div>' +
                '</div>' +
                '<div class="office-body" style="display:none">' +
                '  <div class="office-split">' +
                '    <div class="office-nodes-panel" style="display:none" data-nodrag="1">' +
                '      <div class="office-nodes-header">' +
                '        <span>节点树</span>' +
                '        <select class="office-page-selector" style="margin-left:8px;font-size:12px;padding:2px 4px;border-radius:4px;border:1px solid #ccc;"></select>' +
                '      </div>' +
                '      <div class="office-nodes-tree"></div>' +
                '    </div>' +
                '    <div class="office-view">' +
                '      <iframe class="office-iframe" sandbox="allow-scripts allow-popups"></iframe>' +
                '    </div>' +
                '    <div class="office-editor" style="display:none" data-nodrag="1">' +
                '      <div class="office-editor-head">' +
                '        <div class="office-editor-title">编辑</div>' +
                '        <div class="office-editor-sub" data-bind="meta"></div>' +
                '      </div>' +
                '      <div class="office-editor-section">' +
                '        <div class="office-field">' +
                '          <div class="office-label">节点ID</div>' +
                '          <input class="office-input-mini" data-bind="nodeId" placeholder="节点ID" />' +
                '        </div>' +
                '        <div class="office-field">' +
                '          <div class="office-label">类型</div>' +
                '          <div class="office-readonly" data-bind="type"></div>' +
                '        </div>' +
                '      </div>' +
                '      <div class="office-editor-section" data-section="content">' +
                '        <div class="office-label">内容</div>' +
                '        <textarea class="office-textarea" data-bind="value" placeholder="选中节点后编辑内容"></textarea>' +
                '      </div>' +
                '      <div class="office-editor-section" data-section="layout">' +
                '        <div class="office-editor-grid">' +
                '          <div class="office-field" data-prop="width">' +
                '            <div class="office-label">宽度</div>' +
                '            <input class="office-input-mini" data-bind="width" placeholder="100%" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="height">' +
                '            <div class="office-label">高度</div>' +
                '            <input class="office-input-mini" data-bind="height" placeholder="auto" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="top">' +
                '            <div class="office-label">上边距</div>' +
                '            <input class="office-input-mini" data-bind="top" placeholder="0%" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="left">' +
                '            <div class="office-label">左边距</div>' +
                '            <input class="office-input-mini" data-bind="left" placeholder="0%" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="right">' +
                '            <div class="office-label">右边距</div>' +
                '            <input class="office-input-mini" data-bind="right" placeholder="0%" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="bottom">' +
                '            <div class="office-label">下边距</div>' +
                '            <input class="office-input-mini" data-bind="bottom" placeholder="0%" />' +
                '          </div>' +
                '        </div>' +
                '      </div>' +
                '      <div class="office-editor-section" data-section="text">' +
                '        <div class="office-editor-grid">' +
                '          <div class="office-field" data-prop="size">' +
                '            <div class="office-label">字号</div>' +
                '            <input class="office-input-mini" data-bind="size" placeholder="1.0rem" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="color">' +
                '            <div class="office-label">颜色</div>' +
                '            <input class="office-input-mini" data-bind="color" placeholder="#111827" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="weight">' +
                '            <div class="office-label">粗细</div>' +
                '            <input class="office-input-mini" data-bind="weight" placeholder="700" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="textAlign">' +
                '            <div class="office-label">对齐</div>' +
                '            <select class="office-select-mini" data-bind="textAlign">' +
                '              <option value=""></option>' +
                '              <option value="left">left</option>' +
                '              <option value="center">center</option>' +
                '              <option value="right">right</option>' +
                '              <option value="justify">justify</option>' +
                '            </select>' +
                '          </div>' +
                '          <div class="office-field" data-prop="fontFamily">' +
                '            <div class="office-label">字体</div>' +
                '            <input class="office-input-mini" data-bind="fontFamily" placeholder="system-ui" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="lineHeight">' +
                '            <div class="office-label">行高</div>' +
                '            <input class="office-input-mini" data-bind="lineHeight" placeholder="1.5" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="letterSpacing">' +
                '            <div class="office-label">字间距</div>' +
                '            <input class="office-input-mini" data-bind="letterSpacing" placeholder="0%" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="decoration">' +
                '            <div class="office-label">装饰</div>' +
                '            <select class="office-select-mini" data-bind="decoration">' +
                '              <option value=""></option>' +
                '              <option value="none">none</option>' +
                '              <option value="underline">underline</option>' +
                '              <option value="line-through">line-through</option>' +
                '            </select>' +
                '          </div>' +
                '        </div>' +
                '      </div>' +
                '      <div class="office-editor-section" data-section="container">' +
                '        <div class="office-editor-grid">' +
                '          <div class="office-field" data-prop="padding">' +
                '            <div class="office-label">内边距</div>' +
                '            <input class="office-input-mini" data-bind="padding" placeholder="2%" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="gap">' +
                '            <div class="office-label">间距</div>' +
                '            <input class="office-input-mini" data-bind="gap" placeholder="1%" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="direction">' +
                '            <div class="office-label">方向</div>' +
                '            <select class="office-select-mini" data-bind="direction">' +
                '              <option value=""></option>' +
                '              <option value="row">row</option>' +
                '              <option value="column">column</option>' +
                '            </select>' +
                '          </div>' +
                '          <div class="office-field" data-prop="justify">' +
                '            <div class="office-label">主轴对齐</div>' +
                '            <select class="office-select-mini" data-bind="justify">' +
                '              <option value=""></option>' +
                '              <option value="start">start</option>' +
                '              <option value="center">center</option>' +
                '              <option value="end">end</option>' +
                '              <option value="space-between">space-between</option>' +
                '            </select>' +
                '          </div>' +
                '          <div class="office-field" data-prop="items">' +
                '            <div class="office-label">交叉对齐</div>' +
                '            <select class="office-select-mini" data-bind="items">' +
                '              <option value=""></option>' +
                '              <option value="start">start</option>' +
                '              <option value="center">center</option>' +
                '              <option value="end">end</option>' +
                '              <option value="stretch">stretch</option>' +
                '            </select>' +
                '          </div>' +
                '          <div class="office-field" data-prop="wrap">' +
                '            <div class="office-label">换行</div>' +
                '            <select class="office-select-mini" data-bind="wrap">' +
                '              <option value=""></option>' +
                '              <option value="nowrap">nowrap</option>' +
                '              <option value="wrap">wrap</option>' +
                '            </select>' +
                '          </div>' +
                '        </div>' +
                '      </div>' +
                '      <div class="office-editor-section" data-section="appearance">' +
                '        <div class="office-editor-grid">' +
                '          <div class="office-field" data-prop="bg">' +
                '            <div class="office-label">背景</div>' +
                '            <input class="office-input-mini" data-bind="bg" placeholder="#F3F4F6" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="borderRadius">' +
                '            <div class="office-label">边框圆角</div>' +
                '            <input class="office-input-mini" data-bind="borderRadius" placeholder="0%" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="borderColor">' +
                '            <div class="office-label">边框颜色</div>' +
                '            <input class="office-input-mini" data-bind="borderColor" placeholder="#000000" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="borderWidth">' +
                '            <div class="office-label">边框宽度</div>' +
                '            <input class="office-input-mini" data-bind="borderWidth" placeholder="0%" />' +
                '          </div>' +
                '          <div class="office-field" data-prop="opacity">' +
                '            <div class="office-label">透明度</div>' +
                '            <input class="office-input-mini" data-bind="opacity" placeholder="1.0" />' +
                '          </div>' +
                '        </div>' +
                '      </div>' +
                '      <div class="office-editor-foot">' +
                '        <button class="office-btn office-btn-secondary" data-action="apply" data-nodrag="1">应用</button>' +
                '        <button class="office-btn office-btn-secondary" data-action="save" data-nodrag="1">保存</button>' +
                '        <button class="office-btn office-btn-secondary" data-action="saveas" data-nodrag="1">另存为</button>' +
                '      </div>' +
                '    </div>' +
                '  </div>' +
                '</div>' +
                '<div class="office-node-menu" style="display:none" data-nodrag="1">' +
                '  <div class="office-node-menu-item" data-node-type="text">文本</div>' +
                '  <div class="office-node-menu-item" data-node-type="container">容器</div>' +
                '  <div class="office-node-menu-item" data-node-type="image">图片</div>' +
                '  <div class="office-node-menu-item" data-node-type="audio">音频</div>' +
                '  <div class="office-node-menu-item" data-node-type="video">视频</div>' +
                '  <div class="office-node-menu-item" data-node-type="url">链接</div>' +
                '  <div class="office-node-menu-item" data-node-type="asset">附件</div>' +
                '</div>';

            this.iframe = this.window.querySelector('.office-iframe');
            this.input = this.window.querySelector('.office-input');
            this.statusEl = this.window.querySelector('.office-status');
            this.editorEl = this.window.querySelector('.office-editor');
            this.nodesPanel = this.window.querySelector('.office-nodes-panel');
            this.officeView = this.window.querySelector('.office-view');
            this.officeSplit = this.window.querySelector('.office-split');
            
            const container = this.window.querySelector('.office-container');
            const startScreen = this.window.querySelector('.office-start-screen');
            const toolbar = this.window.querySelector('.office-toolbar');
            const startControls = this.window.querySelector('.office-start-controls');
            
            this.dragHandle = container;
            
            if (initArgs && initArgs.args && initArgs.args[0]) {
                const filePath = String(initArgs.args[0]).trim();
                this.input.value = filePath;
                startScreen.style.display = 'none';
                if (startControls) startControls.style.display = 'none';
                toolbar.style.display = '';
                const body = this.window.querySelector('.office-body');
                if (body) body.style.display = '';
                this._openDocumentFromPath(filePath).catch(() => {});
            }
            
            this._createResizers();
            this._initResizerDrag();

            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('office');
                }
                const w = GUIManager.registerWindow(pid, this.window, {
                    title: 'Office',
                    icon: icon,
                    borderless: true,
                    noTitleBar: true,
                    dragHandle: this.dragHandle,
                    onClose: function () { }
                });
                if (w && w.windowId) this.windowId = w.windowId;
            } else {
                this.window.style.width = '980px';
                this.window.style.height = '720px';
            }

            if (guiContainer) guiContainer.appendChild(this.window);

            if (initArgs && initArgs.args && initArgs.args[0]) {
                const filePath = String(initArgs.args[0]).trim();
                this.input.value = filePath;
                this._openDocumentFromPath(filePath).catch(() => {});
            }

            const clickHandler = (e) => {
                const winBtn = e.target.closest('[data-win]');
                if (winBtn) {
                    const t = String(winBtn.dataset.win || '');
                    if (t === 'min') this._minimize();
                    if (t === 'max') this._toggleMaximize();
                    if (t === 'close') this._close();
                    return;
                }
                const startCard = e.target.closest('.office-start-card');
                if (startCard) {
                    const action = startCard.dataset.action;
                    if (action === 'newDoc') this._createNewDoc();
                    if (action === 'openDoc') this._openFilePicker();
                    if (action === 'openSample') this._previewSample();
                    return;
                }
                const nodeMenuItem = e.target.closest('.office-node-menu-item');
                if (nodeMenuItem) {
                    const nodeType = nodeMenuItem.dataset.nodeType;
                    if (nodeType) {
                        this._addNodeByType(nodeType);
                        return;
                    }
                }
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                if (action === 'preview') this._previewFromPath();
                if (action === 'edit') this._toggleEditor();
                if (action === 'apply') this._applyEdits();
                if (action === 'save') this._save(false);
                if (action === 'saveas') this._save(true);
                if (action === 'addNode') this._showAddNodeMenu();
                if (action === 'deleteNode') this._deleteSelectedNode();
                if (action === 'addPage') this._addPage();
                if (action === 'deletePage') this._deletePage();
                if (action === 'backToStart') this._backToStart();
            };
            if (typeof EventManager !== 'undefined') {
                EventManager.registerElementEvent(pid, this.window, 'click', clickHandler);
            } else {
                this.window.addEventListener('click', clickHandler);
            }

            const stopDrag = (ev) => { ev.stopPropagation(); };
            const nodragEls = this.window.querySelectorAll('[data-nodrag="1"], .office-input');
            nodragEls.forEach((el) => {
                el.addEventListener('mousedown', stopDrag, true);
                el.addEventListener('touchstart', stopDrag, true);
            });

            const msgHandler = (evt) => {
                try {
                    if (!evt || !evt.data) return;
                    if (!this.iframe || evt.source !== this.iframe.contentWindow) return;
                    const msg = evt.data;
                    if (!msg || msg.type !== 'zdoc-select') return;
                    if (!msg.id) return;
                    this._selectNode(String(msg.id));
                } catch (e) {}
            };
            window.addEventListener('message', msgHandler);

            const keydownHandler = (e) => {
                if (!this.editorEnabled) return;
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true';
                    if (!isTyping && this.selectedId) {
                        e.preventDefault();
                        this._deleteSelectedNode();
                    }
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this._save(false);
                }
            };
            if (typeof EventManager !== 'undefined') {
                EventManager.registerElementEvent(pid, this.window, 'keydown', keydownHandler);
            } else {
                this.window.addEventListener('keydown', keydownHandler);
            }

            if (this.kernelAPI && typeof this.kernelAPI.call === 'function') {
                try {
                    await this.kernelAPI.call('Server.start', ['office']);
                } catch (e) {
                    this._setStatus('无法自动启动 Office 服务: ' + (e && (e.message || String(e))));
                }
            }

            if (this.input && this.input.value) {
                const p = String(this.input.value);
                if (/\.zdoc$/i.test(p)) {
                    await this._previewFromPath();
                }
            }
        },

        __exit__: async function () {
            try {
                const office = this._getOffice();
                if (office && typeof office.disposePreviewResources === 'function') {
                    office.disposePreviewResources();
                }
            } catch (e) {}
            if (this.window && this.window.parentElement) {
                try { this.window.parentElement.removeChild(this.window); } catch (e) {}
            }
        },

        __info__: function () {
            return {
                name: 'Office',
                type: 'GUI',
                version: '1.0.0',
                description: 'ZerOS Office - ZDOC 预览渲染',
                author: 'ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : []
            };
        },

        _setStatus: function (text) {
            if (!this.statusEl) return;
            this.statusEl.textContent = text || '';
        },

        _getOffice: function () {
            if (typeof POOL === 'undefined' || typeof POOL.__GET__ !== 'function') return null;
            const office = POOL.__GET__('SERVER', 'Office');
            if (!office || office.isInit === false) return null;
            return office;
        },

        _minimize: function () {
            try {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.minimizeWindow === 'function') {
                    GUIManager.minimizeWindow(this.windowId || this.pid);
                    return;
                }
            } catch (e) {}
        },

        _toggleMaximize: function () {
            try {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.toggleMaximize === 'function') {
                    GUIManager.toggleMaximize(this.windowId || this.pid);
                    return;
                }
            } catch (e) {}
        },

        _close: function () {
            try {
                if (typeof GUIManager !== 'undefined' && typeof GUIManager._closeWindow === 'function' && this.windowId) {
                    GUIManager._closeWindow(this.windowId, false);
                    return;
                }
            } catch (e) {}
            try {
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.killProgram === 'function' && this.pid != null) {
                    ProcessManager.killProgram(this.pid);
                }
            } catch (e) {}
        },

        _previewFromPath: async function () {
            try {
                const office = this._getOffice();
                if (!office || typeof office.previewZdoc !== 'function') {
                    this._setStatus('Office 服务不可用，请先启动 office 服务');
                    return;
                }
                const path = (this.input && this.input.value) ? String(this.input.value).trim() : '';
                if (!path) {
                    this._setStatus('请输入 zdoc 路径');
                    return;
                }
                this.currentPath = path;
                this._setStatus('渲染中...');
                const res = await office.previewZdoc(path);
                this._renderHtml(res && res.html ? res.html : '', false);
                this._showEditorUI();
                this._setStatus('完成');
            } catch (e) {
                this._setStatus('预览失败: ' + (e && (e.message || String(e))));
            }
        },

        _openDocumentFromPath: async function (filePath) {
            try {
                const office = this._getOffice();
                if (!office || typeof office.previewZdoc !== 'function') {
                    this._setStatus('Office 服务不可用');
                    return;
                }
                this._setStatus('加载文档...');
                const res = await office.previewZdoc(filePath);
                this.currentPath = filePath;
                this._renderHtml(res && res.html ? res.html : '', false);
                const container = this.window.querySelector('.office-container');
                this.dragHandle = container;
                this._showEditorUI();
                this._setStatus('已打开: ' + filePath.split('/').pop());
            } catch (e) {
                this._setStatus('打开失败: ' + (e && e.message || String(e)));
            }
        },

        _ensureJSZip: function () {
            if (typeof JSZip !== 'undefined') return Promise.resolve();
            return new Promise((resolve, reject) => {
                const url = '/kernel/dynamicModule/libs/office/jszip/jszip.min.js';
                const exists = document.querySelector('script[data-office-jszip="' + url.replace(/"/g, '&quot;') + '"]');
                if (exists) {
                    resolve();
                    return;
                }
                const s = document.createElement('script');
                s.async = true;
                s.src = url;
                s.dataset.officeJszip = url;
                s.onload = () => resolve();
                s.onerror = () => reject(new Error('load jszip failed'));
                document.head.appendChild(s);
            });
        },

        _buildSampleZdoc: async function () {
            await this._ensureJSZip();
            const zip = new JSZip();
            const desc = {
                format: 'zdoc',
                formatVersion: 1,
                id: 'demo',
                title: 'ZDOC Demo',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                pageCount: 1
            };
            zip.file('Description.json', JSON.stringify(desc, null, 2));
            const page = {
                structure: [
                    {
                        root: {
                            id: 'root',
                            type: 'container',
                            child: {
                                a: { id: 'a', type: 'text' },
                                b: { id: 'b', type: 'text' }
                            },
                            order: ['a', 'b']
                        }
                    }
                ]
            };
            const style = [
                { link: 'root', property: { width: '100%', height: '100%', direction: 'column', gap: '2%', padding: '4%' } },
                { link: 'a', property: { text: { size: '1.2rem', color: '#333333' } } },
                { link: 'b', property: { text: { size: '1rem', color: '#666666' } } }
            ];
            const content = [
                { link: 'a', value: 'Hello ZerOS Office' },
                { link: 'b', value: 'This is a sample ZDOC generated in-memory.' }
            ];
            zip.file('pages/zd0/page.json', JSON.stringify(page, null, 2));
            zip.file('pages/zd0/style.json', JSON.stringify(style, null, 2));
            zip.file('pages/zd0/content.json', JSON.stringify(content, null, 2));
            zip.folder('assets').folder('images');
            zip.folder('assets').folder('audios');
            zip.folder('assets').folder('videos');
            zip.folder('assets').folder('attachments');
            const blob = await zip.generateAsync({ type: 'blob' });
            return await blob.arrayBuffer();
        },

        _previewSample: async function () {
            try {
                const office = this._getOffice();
                if (!office || typeof office.previewZdocBuffer !== 'function') {
                    this._setStatus('Office 服务不可用，请先启动 office 服务');
                    return;
                }
                this._setStatus('生成并渲染示例...');
                const buf = await this._buildSampleZdoc();
                this.currentBuffer = buf;
                const res = await office.previewZdocBuffer(buf);
                this._renderHtml(res && res.html ? res.html : '', false);
                this._showEditorUI();
                this._setStatus('完成');
            } catch (e) {
                this._setStatus('示例预览失败: ' + (e && (e.message || String(e))));
            }
        },

        _createNewDoc: async function () {
            try {
                this._setStatus('创建新文档...');
                const buf = await this._buildSampleZdoc();
                this.currentBuffer = buf;
                const office = this._getOffice();
                if (!office || typeof office.previewZdocBuffer !== 'function') {
                    this._setStatus('Office 服务不可用');
                    return;
                }
                const res = await office.previewZdocBuffer(buf);
                this._renderHtml(res && res.html ? res.html : '', false);
                this._showEditorUI();
                this._setStatus('新文档已创建');
            } catch (e) {
                this._setStatus('创建文档失败: ' + (e && e.message || String(e)));
            }
        },

        _openFilePicker: function () {
            const self = this;
            if (typeof ProcessManager === 'undefined') {
                this._setStatus('无法打开文件选择器');
                return;
            }
            ProcessManager.startProgram('filemanager', {
                args: [],
                mode: 'file-selector',
                filter: ['.zdoc'],
                onFileSelected: async function (fileItem) {
                    const filePath = fileItem?.path || fileItem?.absolutePath || fileItem?.fullPath || '';
                    if (!filePath) {
                        self._setStatus('未选择文件');
                        return;
                    }
                    self._setStatus('加载文档...');
                    try {
                        const buf = await self._fetchArrayBuffer(filePath);
                        self.currentBuffer = buf;
                        self.currentPath = filePath;
                        self.input.value = filePath;
                        const office = self._getOffice();
                        if (!office || typeof office.previewZdocBuffer !== 'function') {
                            self._setStatus('Office 服务不可用');
                            return;
                        }
                        const res = await office.previewZdocBuffer(buf);
                        self._renderHtml(res && res.html ? res.html : '', false);
                        self._showEditorUI();
                        self._setStatus('已打开: ' + filePath.split('/').pop());
                    } catch (e) {
                        self._setStatus('打开文档失败: ' + (e && e.message || String(e)));
                    }
                }
            }).catch(function () {
                self._setStatus('取消选择');
            });
        },

        _showEditorUI: function () {
            const container = this.window.querySelector('.office-container');
            const startScreen = this.window.querySelector('.office-start-screen');
            const startControls = this.window.querySelector('.office-start-controls');
            const toolbar = this.window.querySelector('.office-toolbar');
            const body = this.window.querySelector('.office-body');
            if (startScreen) startScreen.style.display = 'none';
            if (startControls) startControls.style.display = 'none';
            if (toolbar) toolbar.style.display = '';
            if (body) body.style.display = '';
            this.dragHandle = container;
            this._updatePageSelector();
            this._updateNodesTree();
        },

        _backToStart: function () {
            const container = this.window.querySelector('.office-container');
            const startScreen = this.window.querySelector('.office-start-screen');
            const startControls = this.window.querySelector('.office-start-controls');
            const toolbar = this.window.querySelector('.office-toolbar');
            const body = this.window.querySelector('.office-body');
            if (startScreen) startScreen.style.display = '';
            if (startControls) startControls.style.display = '';
            if (toolbar) toolbar.style.display = 'none';
            if (body) body.style.display = 'none';
            this.dragHandle = container;
            this.editorEnabled = false;
            this.selectedId = '';
            this._clearEditorFields();
            this._setStatus('');
        },

        _renderHtml: function (html, enableEditorBridge) {
            if (!this.iframe) return;
            const src = html || '<!doctype html><html><body></body></html>';
            if (!enableEditorBridge) {
                this.iframe.srcdoc = src;
                return;
            }
            const injected = this._injectEditorBridge(src);
            this.iframe.srcdoc = injected;
        },

        _injectEditorBridge: function (html) {
            const bridge = '<style>[data-zdoc-id]{cursor:pointer} .zdoc-selected{outline:3px solid rgba(108,142,255,0.9);outline-offset:2px}</style>' +
                '<script>(function(){' +
                'var sel=null;' +
                'function clear(){if(sel){try{sel.classList.remove(\"zdoc-selected\");}catch(e){} sel=null;}}' +
                'document.addEventListener(\"click\",function(e){' +
                'var el=e.target && e.target.closest ? e.target.closest(\"[data-zdoc-id]\") : null;' +
                'if(!el) return;' +
                'e.preventDefault(); e.stopPropagation();' +
                'clear(); sel=el; try{sel.classList.add(\"zdoc-selected\");}catch(err){}' +
                'try{parent.postMessage({type:\"zdoc-select\",id:el.getAttribute(\"data-zdoc-id\")},\"*\");}catch(err){}' +
                '},true);' +
                '})();</script>';
            const idx = html.lastIndexOf('</body>');
            if (idx >= 0) return html.slice(0, idx) + bridge + html.slice(idx);
            return html + bridge;
        },

        _toggleEditor: async function () {
            try {
                const next = !this.editorEnabled;
                if (next) {
                    await this._enterEditor();
                } else {
                    this._exitEditor();
                }
            } catch (e) {
                this._setStatus('进入编辑失败: ' + (e && (e.message || String(e))));
            }
        },

        _setEditorUiVisible: function (visible) {
            if (!this.editorEl) return;
            this.editorEl.style.display = visible ? '' : 'none';
            const nodesPanel = this.window.querySelector('.office-nodes-panel');
            if (nodesPanel) nodesPanel.style.display = visible ? '' : 'none';
            const topApply = this.window.querySelector('button[data-action="apply"][style]');
            const topSave = this.window.querySelector('button[data-action="save"][style]');
            const topSaveAs = this.window.querySelector('button[data-action="saveas"][style]');
            const topAddNode = this.window.querySelector('button[data-action="addNode"]');
            const topDeleteNode = this.window.querySelector('button[data-action="deleteNode"]');
            const topAddPage = this.window.querySelector('button[data-action="addPage"]');
            const topDeletePage = this.window.querySelector('button[data-action="deletePage"]');
            if (topApply) topApply.style.display = visible ? '' : 'none';
            if (topSave) topSave.style.display = visible ? '' : 'none';
            if (topSaveAs) topSaveAs.style.display = visible ? '' : 'none';
            if (topAddNode) topAddNode.style.display = visible ? '' : 'none';
            if (topDeleteNode) topDeleteNode.style.display = visible ? '' : 'none';
            if (topAddPage) topAddPage.style.display = visible ? '' : 'none';
            if (topDeletePage) topDeletePage.style.display = visible ? '' : 'none';
            if (visible) {
                this._updatePageSelector();
                this._updateNodesTree();
            }
        },

        _enterEditor: async function () {
            await this._ensureJSZip();
            const path = (this.input && this.input.value) ? String(this.input.value).trim() : '';
            if (!path || !/\.zdoc$/i.test(path)) {
                this._setStatus('请输入 .zdoc 路径后再编辑');
                return;
            }
            this.currentPath = path;
            this._setStatus('载入文档...');
            const buf = await this._fetchArrayBuffer(path);
            this.currentBuffer = buf;
            await this._loadZdocFromBuffer(buf);
            this.editorEnabled = true;
            this._setEditorUiVisible(true);
            await this._rerenderFromBuffer();
            this._setStatus('完成');
        },

        _exitEditor: function () {
            this.editorEnabled = false;
            this.selectedId = '';
            this._setEditorUiVisible(false);
            this._clearEditorFields();
        },

        _virtualPathToUrl: function (vpath) {
            if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.convertVirtualPathToUrl === 'function') {
                return ProcessManager.convertVirtualPathToUrl(vpath);
            }
            const m = String(vpath || '').match(/^([A-Z]):\/?(.*)$/);
            if (!m) return null;
            const disk = m[1];
            const rel = m[2] || '';
            return '/system/service/DISK/' + disk + '/' + rel;
        },

        _fetchArrayBuffer: async function (vpath) {
            const url = this._virtualPathToUrl(vpath);
            if (!url) throw new Error('invalid path');
            const res = await fetch(url);
            if (!res || !res.ok) throw new Error('fetch failed: ' + (res ? res.status : 'unknown'));
            return await res.arrayBuffer();
        },

        _stripBom: function (text) {
            const s = String(text == null ? '' : text);
            if (s && s.charCodeAt(0) === 0xFEFF) return s.slice(1);
            return s;
        },

        _looksUtf16le: function (u8) {
            if (!u8 || u8.length < 8) return false;
            let oddZero = 0;
            let oddCount = 0;
            for (let i = 1; i < u8.length; i += 2) {
                oddCount++;
                if (u8[i] === 0) oddZero++;
            }
            return oddCount > 0 && (oddZero / oddCount) > 0.6;
        },

        _decodeBytesToText: function (u8) {
            const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8 || []);
            if (typeof TextDecoder !== 'undefined') {
                if (this._looksUtf16le(bytes)) {
                    try { return new TextDecoder('utf-16le').decode(bytes); } catch (e) {}
                }
                try { return new TextDecoder('utf-8').decode(bytes); } catch (e) {}
            }
            let s = '';
            for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
            return s;
        },

        _findBasePrefix: function (zip) {
            const direct = zip.file('Description.json');
            if (direct) return '';
            const keys = zip && zip.files ? Object.keys(zip.files) : [];
            let best = null;
            keys.forEach(function (p) {
                if (!/(^|\/)Description\.json$/i.test(p)) return;
                if (!best || String(p).length < String(best).length) best = p;
            });
            if (!best) return '';
            return String(best).slice(0, String(best).length - 'Description.json'.length);
        },

        _readZipJson: async function (zip, p) {
            const f = zip.file(p);
            if (!f) throw new Error('missing file: ' + p);
            const bytes = await f.async('uint8array');
            const text = this._stripBom(this._decodeBytesToText(bytes));
            return JSON.parse(text);
        },

        _loadZdocFromBuffer: async function (arrayBuffer, pageIndex) {
            await this._ensureJSZip();
            this.zip = await JSZip.loadAsync(arrayBuffer);
            this.basePrefix = this._findBasePrefix(this.zip);
            this.desc = await this._readZipJson(this.zip, this.basePrefix + 'Description.json');
            if (pageIndex == null) {
                pageIndex = this.currentPageIndex || 0;
            }
            if (pageIndex < 0) pageIndex = 0;
            const maxPage = (this.desc && this.desc.pageCount != null) ? this.desc.pageCount - 1 : 0;
            if (pageIndex > maxPage) pageIndex = maxPage;
            this.currentPageIndex = pageIndex;
            const base = this.basePrefix + 'pages/zd' + pageIndex + '/';
            this.page = await this._readZipJson(this.zip, base + 'page.json');
            const styleArr = await this._readZipJson(this.zip, base + 'style.json');
            const contentArr = await this._readZipJson(this.zip, base + 'content.json');
            this.styleEntries = new Map();
            (Array.isArray(styleArr) ? styleArr : []).forEach((e) => {
                if (!e || typeof e !== 'object' || Array.isArray(e)) return;
                if (typeof e.link !== 'string') return;
                this.styleEntries.set(e.link, e);
            });
            this.contentEntries = new Map();
            (Array.isArray(contentArr) ? contentArr : []).forEach((e) => {
                if (!e || typeof e !== 'object' || Array.isArray(e)) return;
                if (typeof e.link !== 'string') return;
                if (typeof e.value !== 'string') return;
                this.contentEntries.set(e.link, e);
            });
            this._updateMetaDisplay();
            this._updatePageSelector();
        },

        _updatePageSelector: function () {
            const selector = this.window.querySelector('.office-page-selector');
            if (!selector) return;
            const pageCount = this.desc && this.desc.pageCount != null ? this.desc.pageCount : 0;
            selector.innerHTML = '';
            for (let i = 0; i < pageCount; i++) {
                const option = document.createElement('option');
                option.value = String(i);
                option.textContent = '第 ' + (i + 1) + ' 页';
                if (i === this.currentPageIndex) {
                    option.selected = true;
                }
                selector.appendChild(option);
            }
            const self = this;
            selector.onchange = function () {
                const newIndex = parseInt(this.value, 10);
                if (!isNaN(newIndex) && newIndex !== self.currentPageIndex) {
                    self._switchToPage(newIndex);
                }
            };
        },

        _switchToPage: async function (pageIndex) {
            try {
                this._setStatus('切换页面...');
                await this._loadZdocFromBuffer(this.currentBuffer, pageIndex);
                await this._rerenderFromBuffer();
                this._updateNodesTree();
                this.selectedId = '';
                this._clearEditorFields();
                this._setStatus('已切换到第 ' + (pageIndex + 1) + ' 页');
            } catch (e) {
                this._setStatus('切换页面失败: ' + (e && e.message || String(e)));
            }
        },

        _rerenderFromBuffer: async function () {
            const office = this._getOffice();
            if (!office || typeof office.previewZdocBuffer !== 'function') throw new Error('Office 服务不可用');
            const res = await office.previewZdocBuffer(this.currentBuffer);
            this._renderHtml(res && res.html ? res.html : '', true);
        },

        _selectNode: function (id) {
            this.selectedId = id;
            if (!this.editorEnabled) return;
            const nodeIdEl = this.editorEl && this.editorEl.querySelector('[data-bind="nodeId"]');
            const typeEl = this.editorEl && this.editorEl.querySelector('[data-bind="type"]');
            if (nodeIdEl) nodeIdEl.value = id;
            const nodeType = this._findNodeType(id);
            if (typeEl) typeEl.textContent = nodeType || '';
            
            this._updateEditorSectionsForType(nodeType);
            
            const val = this.contentEntries && this.contentEntries.has(id) ? String(this.contentEntries.get(id).value || '') : '';
            const vEl = this.editorEl && this.editorEl.querySelector('[data-bind="value"]');
            if (vEl) vEl.value = val;
            this._fillStyleFields(id);
            this._highlightNodeInTree(id);
        },

        _updateEditorSectionsForType: function (nodeType) {
            const contentSection = this.editorEl.querySelector('[data-section="content"]');
            const textSection = this.editorEl.querySelector('[data-section="text"]');
            const containerSection = this.editorEl.querySelector('[data-section="container"]');
            
            const textProps = ['size', 'color', 'weight', 'textAlign', 'fontFamily', 'lineHeight', 'letterSpacing', 'decoration'];
            const containerProps = ['padding', 'gap', 'direction', 'justify', 'items', 'wrap'];
            
            textProps.forEach(prop => {
                const el = this.editorEl.querySelector('[data-prop="' + prop + '"]');
                if (el) el.style.display = '';
            });
            containerProps.forEach(prop => {
                const el = this.editorEl.querySelector('[data-prop="' + prop + '"]');
                if (el) el.style.display = '';
            });
            
            if (nodeType === 'text' || nodeType === 'url' || nodeType === 'asset') {
                if (contentSection) contentSection.style.display = '';
                if (textSection) textSection.style.display = '';
                if (containerSection) containerSection.style.display = 'none';
                containerProps.forEach(prop => {
                    const el = this.editorEl.querySelector('[data-prop="' + prop + '"]');
                    if (el) el.style.display = 'none';
                });
            } else if (nodeType === 'container') {
                if (contentSection) contentSection.style.display = 'none';
                if (textSection) textSection.style.display = 'none';
                if (containerSection) containerSection.style.display = '';
                textProps.forEach(prop => {
                    const el = this.editorEl.querySelector('[data-prop="' + prop + '"]');
                    if (el) el.style.display = 'none';
                });
            } else if (nodeType === 'image' || nodeType === 'audio' || nodeType === 'video') {
                if (contentSection) contentSection.style.display = '';
                if (textSection) textSection.style.display = 'none';
                if (containerSection) containerSection.style.display = 'none';
                textProps.forEach(prop => {
                    const el = this.editorEl.querySelector('[data-prop="' + prop + '"]');
                    if (el) el.style.display = 'none';
                });
                containerProps.forEach(prop => {
                    const el = this.editorEl.querySelector('[data-prop="' + prop + '"]');
                    if (el) el.style.display = 'none';
                });
            } else {
                if (contentSection) contentSection.style.display = '';
                if (textSection) textSection.style.display = '';
                if (containerSection) containerSection.style.display = '';
            }
        },

        _highlightNodeInTree: function (id) {
            const treeEl = this.window.querySelector('.office-nodes-tree');
            if (!treeEl) return;
            const allItems = treeEl.querySelectorAll('.office-node-item');
            allItems.forEach((item) => {
                item.classList.remove('office-node-selected');
            });
            const selectedItem = treeEl.querySelector('.office-node-item[data-node-id="' + id + '"]');
            if (selectedItem) {
                selectedItem.classList.add('office-node-selected');
            }
        },

        _clearEditorFields: function () {
            if (!this.editorEl) return;
            const ids = ['id', 'type', 'value', 'size', 'color', 'weight', 'width', 'padding', 'gap', 'bg'];
            ids.forEach((k) => {
                const el = this.editorEl.querySelector('[data-bind="' + k + '"]');
                if (!el) return;
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = '';
                else el.textContent = '';
            });
            const dir = this.editorEl.querySelector('[data-bind="direction"]');
            if (dir) dir.value = '';
        },

        _findNodeType: function (id) {
            const page = this.page;
            const structure = page && Array.isArray(page.structure) ? page.structure : [];
            let found = '';
            const walk = (n) => {
                if (!n || typeof n !== 'object' || Array.isArray(n) || found) return;
                if (String(n.id) === String(id) && typeof n.type === 'string') {
                    found = String(n.type);
                    return;
                }
                if (n.type === 'container' && n.child && typeof n.child === 'object' && !Array.isArray(n.child)) {
                    Object.keys(n.child).forEach((k) => walk(n.child[k]));
                }
            };
            structure.forEach((obj) => {
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
                const keys = Object.keys(obj);
                if (keys.length !== 1) return;
                walk(obj[keys[0]]);
            });
            return found;
        },

        _getStyleEntry: function (id) {
            if (!this.styleEntries) return null;
            if (this.styleEntries.has(id)) return this.styleEntries.get(id);
            const e = { link: id, property: {} };
            this.styleEntries.set(id, e);
            return e;
        },

        _fillStyleFields: function (id) {
            if (!this.editorEl) return;
            const entry = this._getStyleEntry(id);
            const prop = entry && entry.property && typeof entry.property === 'object' && !Array.isArray(entry.property) ? entry.property : {};
            const flat = Object.assign({}, prop);
            const t = prop.text && typeof prop.text === 'object' && !Array.isArray(prop.text) ? prop.text : {};
            const b = prop.background && typeof prop.background === 'object' && !Array.isArray(prop.background) ? prop.background : {};
            const l = prop.layout && typeof prop.layout === 'object' && !Array.isArray(prop.layout) ? prop.layout : {};
            
            const size = t.size != null ? String(t.size) : '';
            const color = t.color != null ? String(t.color) : '';
            const weight = t.weight != null ? String(t.weight) : '';
            const textAlign = t.align != null ? String(t.align) : '';
            const fontFamily = t.fontFamily != null ? String(t.fontFamily) : '';
            const lineHeight = t.lineHeight != null ? String(t.lineHeight) : '';
            const letterSpacing = t.letterSpacing != null ? String(t.letterSpacing) : '';
            const decoration = t.decoration != null ? String(t.decoration) : '';
            
            const width = flat.width != null ? String(flat.width) : '';
            const height = flat.height != null ? String(flat.height) : '';
            const top = l.top != null ? String(l.top) : '';
            const left = l.left != null ? String(l.left) : '';
            const right = l.right != null ? String(l.right) : '';
            const bottom = l.bottom != null ? String(l.bottom) : '';
            
            const padding = flat.padding != null ? String(flat.padding) : '';
            const gap = flat.gap != null ? String(flat.gap) : '';
            const direction = flat.direction != null ? String(flat.direction) : '';
            const justify = flat.justify != null ? String(flat.justify) : '';
            const items = flat.items != null ? String(flat.items) : '';
            const wrap = flat.wrap != null ? String(flat.wrap) : '';
            
            const bg = b.color != null ? String(b.color) : '';
            const borderRadius = flat.borderRadius != null ? String(flat.borderRadius) : '';
            const borderColor = flat.borderColor != null ? String(flat.borderColor) : '';
            const borderWidth = flat.borderWidth != null ? String(flat.borderWidth) : '';
            const opacity = flat.opacity != null ? String(flat.opacity) : '';

            const setVal = (k, v) => {
                const el = this.editorEl.querySelector('[data-bind="' + k + '"]');
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.value = v;
                if (el && el.tagName === 'SELECT') el.value = v;
            };
            setVal('size', size);
            setVal('color', color);
            setVal('weight', weight);
            setVal('textAlign', textAlign);
            setVal('fontFamily', fontFamily);
            setVal('lineHeight', lineHeight);
            setVal('letterSpacing', letterSpacing);
            setVal('decoration', decoration);
            setVal('width', width);
            setVal('height', height);
            setVal('top', top);
            setVal('left', left);
            setVal('right', right);
            setVal('bottom', bottom);
            setVal('padding', padding);
            setVal('gap', gap);
            setVal('bg', bg);
            setVal('borderRadius', borderRadius);
            setVal('borderColor', borderColor);
            setVal('borderWidth', borderWidth);
            setVal('opacity', opacity);
            const dirEl = this.editorEl.querySelector('[data-bind="direction"]');
            if (dirEl) dirEl.value = direction;
            const justifyEl = this.editorEl.querySelector('[data-bind="justify"]');
            if (justifyEl) justifyEl.value = justify;
            const itemsEl = this.editorEl.querySelector('[data-bind="items"]');
            if (itemsEl) itemsEl.value = items;
            const wrapEl = this.editorEl.querySelector('[data-bind="wrap"]');
            if (wrapEl) wrapEl.value = wrap;
        },

        _applyEdits: async function () {
            if (!this.editorEnabled) return;
            const oldId = String(this.selectedId || '');
            if (!oldId) {
                this._setStatus('请先在预览中点击选中一个节点');
                return;
            }
            try {
                const nodeIdEl = this.editorEl && this.editorEl.querySelector('[data-bind="nodeId"]');
                const newId = nodeIdEl ? String(nodeIdEl.value || '').trim() : oldId;
                
                if (newId && newId !== oldId) {
                    await this._updateNodeId(oldId, newId);
                    return;
                }
                
                const nodeType = this._findNodeType(oldId);
                const valEl = this.editorEl && this.editorEl.querySelector('[data-bind="value"]');
                const nextVal = valEl ? String(valEl.value || '') : '';
                if (nodeType === 'text' || nodeType === 'url' || nodeType === 'asset' || nodeType === 'image' || nodeType === 'audio' || nodeType === 'video') {
                    if (this.contentEntries) {
                        if (this.contentEntries.has(oldId)) {
                            this.contentEntries.get(oldId).value = nextVal;
                        } else {
                            const e = { link: oldId, value: nextVal };
                            this.contentEntries.set(oldId, e);
                        }
                    }
                }

                const entry = this._getStyleEntry(oldId);
                if (entry) {
                    if (!entry.property || typeof entry.property !== 'object' || Array.isArray(entry.property)) entry.property = {};
                    const prop = entry.property;

                    const read = (k) => {
                        const el = this.editorEl && this.editorEl.querySelector('[data-bind="' + k + '"]');
                        if (!el) return '';
                        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return String(el.value || '').trim();
                        if (el.tagName === 'SELECT') return String(el.value || '').trim();
                        return '';
                    };
                    
                    const size = read('size');
                    const color = read('color');
                    const weight = read('weight');
                    const textAlign = read('textAlign');
                    const fontFamily = read('fontFamily');
                    const lineHeight = read('lineHeight');
                    const letterSpacing = read('letterSpacing');
                    const decoration = read('decoration');
                    
                    const width = read('width');
                    const height = read('height');
                    const top = read('top');
                    const left = read('left');
                    const right = read('right');
                    const bottom = read('bottom');
                    
                    const padding = read('padding');
                    const gap = read('gap');
                    const direction = read('direction');
                    const justify = read('justify');
                    const items = read('items');
                    const wrap = read('wrap');
                    
                    const bg = read('bg');
                    const borderRadius = read('borderRadius');
                    const borderColor = read('borderColor');
                    const borderWidth = read('borderWidth');
                    const opacity = read('opacity');

                    if (size || color || weight || textAlign || fontFamily || lineHeight || letterSpacing || decoration) {
                        if (!prop.text || typeof prop.text !== 'object' || Array.isArray(prop.text)) prop.text = {};
                        if (size) prop.text.size = size;
                        if (color) prop.text.color = color;
                        if (weight) prop.text.weight = (/^\d+$/.test(weight) ? Number(weight) : weight);
                        if (textAlign) prop.text.align = textAlign;
                        if (fontFamily) prop.text.fontFamily = fontFamily;
                        if (lineHeight) prop.text.lineHeight = (/^\d+(\.\d+)?$/.test(lineHeight) ? Number(lineHeight) : lineHeight);
                        if (letterSpacing) prop.text.letterSpacing = letterSpacing;
                        if (decoration) prop.text.decoration = decoration;
                    }
                    if (width) prop.width = width;
                    if (height) prop.height = height;
                    if (top || left || right || bottom) {
                        if (!prop.layout || typeof prop.layout !== 'object' || Array.isArray(prop.layout)) prop.layout = {};
                        if (top) prop.layout.top = top;
                        if (left) prop.layout.left = left;
                        if (right) prop.layout.right = right;
                        if (bottom) prop.layout.bottom = bottom;
                    }
                    if (padding) prop.padding = padding;
                    if (gap) prop.gap = gap;
                    if (direction) prop.direction = direction;
                    if (justify) prop.justify = justify;
                    if (items) prop.items = items;
                    if (wrap) prop.wrap = wrap;
                    if (borderRadius) prop.borderRadius = borderRadius;
                    if (borderColor) prop.borderColor = borderColor;
                    if (borderWidth) prop.borderWidth = borderWidth;
                    if (opacity) prop.opacity = (/^\d+(\.\d+)?$/.test(opacity) ? Number(opacity) : opacity);
                    if (bg) {
                        if (!prop.background || typeof prop.background !== 'object' || Array.isArray(prop.background)) prop.background = {};
                        prop.background.color = bg;
                    }
                }

                await this._rebuildZipAndPreview();
                this._setStatus('完成');
            } catch (e) {
                this._setStatus('应用失败: ' + (e && (e.message || String(e))));
            }
        },

        _updateNodeId: async function (oldId, newId) {
            this._setStatus('更新节点ID...');
            try {
                const office = this._getOffice();
                if (!office || typeof office.editZdocBuffer !== 'function') {
                    throw new Error('Office 服务不可用');
                }
                const result = await office.editZdocBuffer(this.currentBuffer, {
                    type: 'renameNode',
                    pageIndex: this.currentPageIndex,
                    oldNodeId: oldId,
                    newNodeId: newId
                });
                if (!result || !result.success) {
                    throw new Error(result && result.error || '更新失败');
                }
                this.currentBuffer = result.buffer;
                await this._loadZdocFromBuffer(this.currentBuffer);
                await this._rerenderFromBuffer();
                this._updateNodesTree();
                this._selectNode(newId);
                this._setStatus('节点ID已更新');
            } catch (e) {
                this._setStatus('更新节点ID失败: ' + (e && e.message || String(e)));
            }
        },

        _rebuildZipAndPreview: async function () {
            if (!this.zip) throw new Error('zip not loaded');
            const base = this.basePrefix + 'pages/zd' + this.currentPageIndex + '/';
            const styleArr = Array.from(this.styleEntries ? this.styleEntries.values() : []);
            const contentArr = Array.from(this.contentEntries ? this.contentEntries.values() : []);
            this.zip.file(this.basePrefix + 'Description.json', JSON.stringify(this.desc || {}, null, 2));
            this.zip.file(base + 'page.json', JSON.stringify(this.page || {}, null, 2));
            this.zip.file(base + 'style.json', JSON.stringify(styleArr, null, 2));
            this.zip.file(base + 'content.json', JSON.stringify(contentArr, null, 2));
            const buf = await this.zip.generateAsync({ type: 'arraybuffer' });
            this.currentBuffer = buf;
            await this._rerenderFromBuffer();
        },

        _save: async function (saveAs) {
            if (!this.editorEnabled) {
                this._setStatus('请先进入编辑模式');
                return;
            }
            try {
                await this._ensureJSZip();
                const target = saveAs ? await this._pickSavePath() : this.currentPath;
                if (!target) return;
                this._setStatus('写入中...');
                const base = this.basePrefix + 'pages/zd' + this.currentPageIndex + '/';
                const styleArr = Array.from(this.styleEntries ? this.styleEntries.values() : []);
                const contentArr = Array.from(this.contentEntries ? this.contentEntries.values() : []);
                this.zip.file(this.basePrefix + 'Description.json', JSON.stringify(this.desc || {}, null, 2));
                this.zip.file(base + 'page.json', JSON.stringify(this.page || {}, null, 2));
                this.zip.file(base + 'style.json', JSON.stringify(styleArr, null, 2));
                this.zip.file(base + 'content.json', JSON.stringify(contentArr, null, 2));
                const base64 = await this.zip.generateAsync({ type: 'base64' });
                await this._writeBase64File(target, base64);
                this.currentPath = target;
                if (this.input) this.input.value = target;
                this._setStatus('完成');
            } catch (e) {
                this._setStatus('保存失败: ' + (e && (e.message || String(e))));
            }
        },

        _pickSavePath: async function () {
            const current = (this.input && this.input.value) ? String(this.input.value).trim() : '';
            const nameGuess = (current.split('/').pop() || current.split('\\').pop() || 'document.zdoc');
            return new Promise((resolve) => {
                if (typeof ProcessManager === 'undefined') {
                    resolve('');
                    return;
                }
                ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'folder-selector',
                    onFolderSelected: async (folderItem) => {
                        let folderPath = folderItem?.path || folderItem?.absolutePath || folderItem?.fullPath || '';
                        if (!folderPath) {
                            resolve('');
                            return;
                        }
                        folderPath = String(folderPath).replace(/\\/g, '/');
                        if (folderPath.endsWith('/') && !folderPath.match(/^[A-Z]:\/$/)) {
                            folderPath = folderPath.slice(0, -1);
                        }
                        if (/^[A-Z]:$/.test(folderPath)) folderPath += '/';
                        resolve(folderPath + '/' + nameGuess);
                    }
                }).catch(() => resolve(''));
            });
        },

        _writeBase64File: async function (vpath, base64) {
            let targetPath = String(vpath || '').replace(/\\/g, '/');
            const parts = targetPath.split('/');
            const fileName = parts.pop() || '';
            let dirPath = parts.join('/');
            if (!dirPath) throw new Error('invalid path');
            if (/^[A-Z]:$/.test(dirPath)) dirPath += '/';

            const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject)
                ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid })
                : new URL(SystemInformation.getFSDirvePath(), (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin)
                    ? SystemInformation.getOrigin()
                    : window.location.origin);
            if (this._upid != null) url.searchParams.set('upid', this._upid);
            url.searchParams.set('action', 'write_file');
            url.searchParams.set('path', dirPath);
            url.searchParams.set('fileName', fileName);
            url.searchParams.set('writeMod', 'overwrite');

            const resp = await fetch(url.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: String(base64 || ''), isBase64: true })
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const json = await resp.json();
            if (!json || !json.status) throw new Error(json && json.message ? json.message : '写入失败');
        },

        _showAddNodeMenu: function () {
            if (!this.editorEnabled) {
                this._setStatus('请先进入编辑模式');
                return;
            }
            if (!this.selectedId) {
                this._setStatus('请先在预览中选中一个容器节点');
                return;
            }
            const nodeType = this._findNodeType(this.selectedId);
            if (nodeType !== 'container') {
                this._setStatus('请先选中一个容器类型的节点');
                return;
            }
            const menu = this.window.querySelector('.office-node-menu');
            if (!menu) return;
            const btn = this.window.querySelector('[data-action="addNode"]');
            if (!btn) return;
            const rect = btn.getBoundingClientRect();
            menu.style.display = 'block';
            menu.style.position = 'fixed';
            menu.style.left = rect.left + 'px';
            menu.style.top = (rect.bottom + 4) + 'px';
            menu.dataset.targetParentId = this.selectedId;
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        },

        _addNodeByType: async function (nodeType, customParentId) {
            if (!this.editorEnabled || !this.currentBuffer) return;
            let parentId = customParentId;
            if (!parentId) {
                const menu = this.window.querySelector('.office-node-menu');
                parentId = menu && menu.dataset.targetParentId;
            }
            if (!parentId) {
                this._setStatus('未选择父节点');
                return;
            }
            const menuEl = this.window.querySelector('.office-node-menu');
            if (menuEl) menuEl.style.display = 'none';
            this._setStatus('添加节点...');
            try {
                const office = this._getOffice();
                if (!office || typeof office.editZdocBuffer !== 'function') {
                    throw new Error('Office 服务不可用');
                }
                const result = await office.editZdocBuffer(this.currentBuffer, {
                    type: 'addNode',
                    pageIndex: this.currentPageIndex,
                    parentId: parentId,
                    nodeType: nodeType
                });
                if (!result || !result.success) {
                    throw new Error(result && result.error || '添加失败');
                }
                this.currentBuffer = result.buffer;
                await this._loadZdocFromBuffer(this.currentBuffer);
                await this._rerenderFromBuffer();
                this._updateNodesTree();
                if (result.newNodeId) {
                    this._selectNode(result.newNodeId);
                }
                this._setStatus('已添加 ' + nodeType + ' 节点');
            } catch (e) {
                this._setStatus('添加节点失败: ' + (e && e.message || String(e)));
            }
        },

        _deleteSelectedNode: async function () {
            if (!this.editorEnabled || !this.currentBuffer) return;
            if (!this.selectedId) {
                this._setStatus('请先在预览中选中一个节点');
                return;
            }
            const nodeType = this._findNodeType(this.selectedId);
            if (nodeType === 'container' && this.selectedId === 'content') {
                this._setStatus('不能删除根容器');
                return;
            }
            const confirmed = await this._showConfirmDialog('确定要删除选中的节点吗？');
            if (!confirmed) return;
            this._setStatus('删除节点...');
            try {
                const office = this._getOffice();
                if (!office || typeof office.editZdocBuffer !== 'function') {
                    throw new Error('Office 服务不可用');
                }
                const result = await office.editZdocBuffer(this.currentBuffer, {
                    type: 'removeNode',
                    pageIndex: this.currentPageIndex,
                    nodeId: this.selectedId
                });
                if (!result || !result.success) {
                    throw new Error(result && result.error || '删除失败');
                }
                this.currentBuffer = result.buffer;
                await this._loadZdocFromBuffer(this.currentBuffer);
                await this._rerenderFromBuffer();
                this._updateNodesTree();
                this.selectedId = '';
                this._clearEditorFields();
                this._setStatus('节点已删除');
            } catch (e) {
                this._setStatus('删除节点失败: ' + (e && e.message || String(e)));
            }
        },

        _addPage: async function () {
            if (!this.editorEnabled || !this.currentBuffer) return;
            this._setStatus('添加页面...');
            try {
                const office = this._getOffice();
                if (!office || typeof office.editZdocBuffer !== 'function') {
                    throw new Error('Office 服务不可用');
                }
                const result = await office.editZdocBuffer(this.currentBuffer, {
                    type: 'addPage'
                });
                if (!result || !result.success) {
                    throw new Error(result && result.error || '添加页面失败');
                }
                this.currentBuffer = result.buffer;
                await this._loadZdocFromBuffer(this.currentBuffer);
                await this._rerenderFromBuffer();
                this._updateMetaDisplay();
                this._updatePageSelector();
                this._setStatus('已添加页面，当前共 ' + (this.desc && this.desc.pageCount) + ' 页');
            } catch (e) {
                this._setStatus('添加页面失败: ' + (e && e.message || String(e)));
            }
        },

        _deletePage: async function () {
            if (!this.editorEnabled || !this.currentBuffer) return;
            if (this.desc && this.desc.pageCount <= 1) {
                this._setStatus('不能删除唯一的页面');
                return;
            }
            const confirmed = await this._showConfirmDialog('确定要删除当前页面吗？');
            if (!confirmed) return;
            this._setStatus('删除页面...');
            try {
                const office = this._getOffice();
                if (!office || typeof office.editZdocBuffer !== 'function') {
                    throw new Error('Office 服务不可用');
                }
                const result = await office.editZdocBuffer(this.currentBuffer, {
                    type: 'removePage',
                    pageIndex: this.currentPageIndex
                });
                if (!result || !result.success) {
                    throw new Error(result && result.error || '删除页面失败');
                }
                this.currentBuffer = result.buffer;
                const newPageIndex = Math.max(0, this.currentPageIndex - 1);
                await this._loadZdocFromBuffer(this.currentBuffer, newPageIndex);
                await this._rerenderFromBuffer();
                this._updateNodesTree();
                this._updateMetaDisplay();
                this._updatePageSelector();
                this._setStatus('已删除页面，当前共 ' + (this.desc && this.desc.pageCount) + ' 页');
            } catch (e) {
                this._setStatus('删除页面失败: ' + (e && e.message || String(e)));
            }
        },

        _updateMetaDisplay: function () {
            const meta = this.editorEl && this.editorEl.querySelector('[data-bind="meta"]');
            if (meta) {
                meta.textContent = (this.desc && this.desc.title ? String(this.desc.title) : '') + ' · pageCount=' + String(this.desc && this.desc.pageCount != null ? this.desc.pageCount : '');
            }
        },

        _updateNodesTree: function () {
            const treeEl = this.window.querySelector('.office-nodes-tree');
            if (!treeEl || !this.page) return;
            const structure = this.page.structure;
            if (!structure || !Array.isArray(structure)) return;
            const buildTree = (node, depth) => {
                const indent = depth * 16;
                const typeColors = {
                    text: '#4B5563',
                    container: '#2563EB',
                    image: '#059669',
                    audio: '#7C3AED',
                    video: '#DC2626',
                    url: '#0891B2',
                    asset: '#D97706'
                };
                const typeLabels = {
                    text: 'T',
                    container: 'C',
                    image: 'I',
                    audio: 'A',
                    video: 'V',
                    url: 'L',
                    asset: 'F'
                };
                let html = '<div class="office-node-item" data-node-id="' + String(node.id) + '" style="padding-left:' + indent + 'px">';
                const type = node.type || 'unknown';
                const color = typeColors[type] || '#666';
                const label = typeLabels[type] || '?';
                html += '<span class="office-node-badge" style="background:' + color + '">' + label + '</span>';
                html += '<span class="office-node-name">' + String(node.id) + '</span>';
                html += '</div>';
                if (node.type === 'container' && node.child) {
                    const order = node.order || Object.keys(node.child).sort();
                    order.forEach((childId) => {
                        const child = node.child[childId];
                        if (child) html += buildTree(child, depth + 1);
                    });
                }
                return html;
            };
            let treeHtml = '';
            structure.forEach((section) => {
                if (!section) return;
                for (const key in section) {
                    const root = section[key];
                    if (root) treeHtml += buildTree(root, 0);
                }
            });
            treeEl.innerHTML = treeHtml;
            const items = treeEl.querySelectorAll('.office-node-item');
            const self = this;
            items.forEach((item) => {
                item.addEventListener('click', (e) => {
                    const id = item.dataset.nodeId;
                    if (id) {
                        self._selectNode(id);
                    }
                });
                item.addEventListener('dblclick', (e) => {
                    const id = item.dataset.nodeId;
                    if (id) {
                        self._selectNode(id);
                        const textarea = self.editorEl && self.editorEl.querySelector('[data-bind="value"]');
                        if (textarea) textarea.focus();
                    }
                });
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const id = item.dataset.nodeId;
                    if (id) {
                        self._selectNode(id);
                        self._showContextMenu(e, id);
                    }
                });
            });
        },

        _showContextMenu: function (e, nodeId) {
            const nodeType = this._findNodeType(nodeId);
            let menu = this.window.querySelector('.office-context-menu');
            if (!menu) {
                menu = document.createElement('div');
                menu.className = 'office-context-menu';
                this.window.appendChild(menu);
            }
            let menuHtml = '';
            if (nodeType === 'container') {
                menuHtml += '<div class="office-context-menu-item" data-action="addText">添加文本</div>';
                menuHtml += '<div class="office-context-menu-item" data-action="addContainer">添加容器</div>';
                menuHtml += '<div class="office-context-menu-item" data-action="addImage">添加图片</div>';
                menuHtml += '<div class="office-context-menu-item" data-action="addAudio">添加音频</div>';
                menuHtml += '<div class="office-context-menu-item" data-action="addVideo">添加视频</div>';
                menuHtml += '<div class="office-context-menu-item" data-action="addUrl">添加链接</div>';
                menuHtml += '<div class="office-context-menu-item" data-action="addAsset">添加附件</div>';
                menuHtml += '<div class="office-context-menu-separator"></div>';
            }
            if (nodeId !== 'content') {
                menuHtml += '<div class="office-context-menu-item" data-action="delete">删除</div>';
            }
            menu.innerHTML = menuHtml;
            menu.style.display = 'block';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            const self = this;
            const menuItems = menu.querySelectorAll('.office-context-menu-item');
            menuItems.forEach((mi) => {
                mi.onclick = function() {
                    menu.style.display = 'none';
                    const action = this.dataset.action;
                    if (action === 'delete') {
                        self._deleteSelectedNode();
                    } else if (action === 'addText') {
                        self._addNodeByType('text', self.selectedId);
                    } else if (action === 'addContainer') {
                        self._addNodeByType('container', self.selectedId);
                    } else if (action === 'addImage') {
                        self._addNodeByType('image', self.selectedId);
                    } else if (action === 'addAudio') {
                        self._addNodeByType('audio', self.selectedId);
                    } else if (action === 'addVideo') {
                        self._addNodeByType('video', self.selectedId);
                    } else if (action === 'addUrl') {
                        self._addNodeByType('url', self.selectedId);
                    } else if (action === 'addAsset') {
                        self._addNodeByType('asset', self.selectedId);
                    }
                };
            });
            const closeMenu = (evt) => {
                if (!menu.contains(evt.target)) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        },

        _createResizers: function () {
            if (!this.officeSplit || !this.nodesPanel || !this.officeView || !this.editorEl) return;
            
            const resizerLeft = document.createElement('div');
            resizerLeft.className = 'office-resizer office-resizer-left';
            resizerLeft.dataset.nodrag = '1';
            
            const resizerRight = document.createElement('div');
            resizerRight.className = 'office-resizer office-resizer-right';
            resizerRight.dataset.nodrag = '1';
            
            this.nodesPanel.parentNode.insertBefore(resizerLeft, this.officeView);
            this.officeView.parentNode.insertBefore(resizerRight, this.editorEl);
            
            this.resizerLeft = resizerLeft;
            this.resizerRight = resizerRight;
        },

        _initResizerDrag: function () {
            const self = this;
            
            let dragState = {
                active: false,
                resizer: null,
                startX: 0,
                startWidth1: 0,
                startWidth2: 0,
                panel1: null,
                panel2: null
            };
            
            const startDrag = (e, resizer, panel1, panel2) => {
                e.preventDefault();
                e.stopPropagation();
                
                dragState.active = true;
                dragState.resizer = resizer;
                dragState.startX = e.clientX;
                dragState.startWidth1 = panel1.offsetWidth;
                dragState.startWidth2 = panel2.offsetWidth;
                dragState.panel1 = panel1;
                dragState.panel2 = panel2;
                
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            };
            
            const doDrag = (e) => {
                if (!dragState.active) return;
                
                const dx = e.clientX - dragState.startX;
                const panel1 = dragState.panel1;
                const panel2 = dragState.panel2;
                
                if (dragState.resizer === self.resizerLeft) {
                    const newWidth1 = Math.max(180, Math.min(400, dragState.startWidth1 + dx));
                    panel1.style.width = newWidth1 + 'px';
                    panel1.style.minWidth = newWidth1 + 'px';
                    panel1.style.maxWidth = newWidth1 + 'px';
                } else if (dragState.resizer === self.resizerRight) {
                    const newWidth2 = Math.max(280, Math.min(500, dragState.startWidth2 - dx));
                    panel2.style.width = newWidth2 + 'px';
                    panel2.style.minWidth = newWidth2 + 'px';
                    panel2.style.maxWidth = newWidth2 + 'px';
                }
            };
            
            const endDrag = () => {
                if (!dragState.active) return;
                
                dragState.active = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };
            
            if (this.resizerLeft) {
                this.resizerLeft.addEventListener('mousedown', (e) => startDrag(e, this.resizerLeft, this.nodesPanel, this.officeView));
            }
            
            if (this.resizerRight) {
                this.resizerRight.addEventListener('mousedown', (e) => startDrag(e, this.resizerRight, this.officeView, this.editorEl));
            }
            
            document.addEventListener('mousemove', doDrag);
            document.addEventListener('mouseup', endDrag);
            document.addEventListener('mouseleave', endDrag);
        },

        _showConfirmDialog: function (message) {
            return new Promise((resolve) => {
                const self = this;
                const windowId = 'window_' + this.pid + '_office_confirm_' + Date.now();
                
                const dialogWindow = document.createElement('div');
                dialogWindow.className = 'office-confirm-dialog zos-gui-window';
                dialogWindow.dataset.pid = String(this.pid);
                dialogWindow.dataset.windowId = windowId;
                
                dialogWindow.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    width: 360px;
                    min-width: 360px;
                    max-width: 360px;
                    padding: 20px;
                    background: linear-gradient(180deg, rgba(26,31,46,.98) 0%, rgba(22,33,62,.98) 100%);
                    border: 1px solid rgba(108,142,255,.35);
                    border-radius: 12px;
                    box-shadow: 0 12px 40px rgba(0,0,0,.5);
                `;
                
                const guiContainer = document.getElementById('gui-container');
                if (!guiContainer) {
                    resolve(false);
                    return;
                }
                
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('office');
                }
                
                const windowInfo = GUIManager.registerWindow(this.pid, dialogWindow, {
                    title: '确认',
                    icon: icon,
                    windowId: windowId,
                    onClose: () => {
                        const idx = self.childWindows.findIndex(w => w.windowId === (windowInfo ? windowInfo.windowId : windowId));
                        if (idx !== -1) self.childWindows.splice(idx, 1);
                        if (dialogWindow.parentElement) dialogWindow.parentElement.removeChild(dialogWindow);
                        if (windowInfo && windowInfo.windowId) GUIManager.unregisterWindow(windowInfo.windowId);
                        else GUIManager.unregisterWindow(windowId);
                        resolve(false);
                    }
                });
                
                const actualWindowId = windowInfo ? windowInfo.windowId : windowId;
                this.childWindows.push({ windowId: actualWindowId, window: dialogWindow });
                
                dialogWindow.innerHTML = `
                    <div style="margin-bottom:20px;color:#fff;font-size:15px;line-height:1.5;">${message}</div>
                    <div style="display:flex;gap:12px;justify-content:flex-end;">
                        <button class="office-dialog-btn office-dialog-btn-cancel" style="
                            background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);
                            border-radius:8px;color:#fff;padding:8px 16px;cursor:pointer;font-size:13px;
                        ">取消</button>
                        <button class="office-dialog-btn office-dialog-btn-ok" style="
                            background:rgba(108,142,255,.35);border:1px solid rgba(108,142,255,.5);
                            border-radius:8px;color:#fff;padding:8px 16px;cursor:pointer;font-size:13px;
                        ">确定</button>
                    </div>
                `;
                
                const cancelBtn = dialogWindow.querySelector('.office-dialog-btn-cancel');
                const okBtn = dialogWindow.querySelector('.office-dialog-btn-ok');
                
                const closeDialog = (result) => {
                    const idx = self.childWindows.findIndex(w => w.windowId === actualWindowId);
                    if (idx !== -1) self.childWindows.splice(idx, 1);
                    if (dialogWindow.parentElement) dialogWindow.parentElement.removeChild(dialogWindow);
                    GUIManager.unregisterWindow(actualWindowId);
                    resolve(result);
                };
                
                cancelBtn.addEventListener('click', () => closeDialog(false));
                okBtn.addEventListener('click', () => closeDialog(true));
                
                guiContainer.appendChild(dialogWindow);
            });
        }
    };

    if (typeof window !== 'undefined') {
        window.OFFICE = OFFICE;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.OFFICE = OFFICE;
    }
})(typeof window !== 'undefined' ? window : globalThis);
