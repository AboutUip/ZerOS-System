// 固定框架
(function(window){
    // 不强制要求严格,但推荐如此
    'use strict';

    // 进程名称(不要求,但推荐)
    const PROGRAM_NAME = 'NOTEPAD';

    // 导出对象(可以是class,也可以是普通对象)
    const NOTEPAD = {

        // 程序自有属性
        pid: null,
        window: null,
        windowId: null,
        applicationInfo: null,
        textEl: null,
        statusLeftEl: null,
        statusRightEl: null,
        filePath: null,
        dirty: false,
        lastSavedText: '',
        dropZoneSelector: null,
        eventListeners: [],
        _languageChangeUnsubscribe: null,

        // 初始化方法
        __init__ : async function(pid,initArgs) {
            
            // 更新pid
            this.pid = pid;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;

            // 获取窗口容器(必须这样获取)
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');

            // 创建窗口(固定写法)
            this.window = document.createElement('div');
            this.window.className = 'notepad-window zos-gui-window';
            this.window.dataset.pid = pid.toString();

            // 窗口内容（按钮文案由 _refreshUIStrings 多语言刷新）
            this.window.innerHTML = `
                <div class="notepad-toolbar">
                    <div class="notepad-toolbar-left">
                        <button class="notepad-btn" data-action="new"></button>
                        <button class="notepad-btn" data-action="open"></button>
                        <button class="notepad-btn" data-action="save"></button>
                        <button class="notepad-btn" data-action="saveas"></button>
                        <button class="notepad-btn" data-action="clear"></button>
                        <button class="notepad-btn" data-action="exit"></button>
                    </div>
                    <div class="notepad-toolbar-right">
                        <span class="notepad-path"></span>
                    </div>
                </div>
                <div class="notepad-editor" data-drop-zone="true">
                    <textarea class="notepad-text-input" spellcheck="false"></textarea>
                </div>
                <div class="notepad-statusbar">
                    <span class="notepad-status-left"></span>
                    <span class="notepad-status-right"></span>
                </div>
            `;

            this.textEl = this.window.querySelector('.notepad-text-input');
            this.statusLeftEl = this.window.querySelector('.notepad-status-left');
            this.statusRightEl = this.window.querySelector('.notepad-status-right');
            this.pathEl = this.window.querySelector('.notepad-path');
            this.dropZoneSelector = `.notepad-window[data-pid="${this.pid}"] .notepad-editor`;

            // 注册到 GUIManager
            if (typeof GUIManager !== 'undefined') {

                // 该API详细用法参考 GUIManager 文档
                this.applicationInfo = GUIManager.registerWindow(pid, this.window, {
                    title: this._getText('NOTEPAD_TITLE', 'Notepad'),
                    icon: ApplicationAssetManager.getIcon('notepad'),
                    // 兼容保留
                    // 窗口关闭回调
                    onClose: () => {
                        // onClose 回调只用于执行清理工作，不应调用 unregisterWindow 或 _closeWindow
                        // 窗口关闭流程由 GUIManager 统一管理
                        // GUIManager 会在窗口关闭后自动检查该 PID 是否还有其他窗口
                        // 如果没有且不是 Exploit 程序（PID 10000），会自动 kill 进程
                        // 这样可以确保程序多实例（不同 PID）互不影响
                    },
                    // 窗口最小化回调
                    onMinimize: () => {
                        // 窗口最小化回调
                    },
                    // 窗口最大化/还原回调
                    onMaximize: (isMaximized) => {
                        // 窗口最大化回调，isMaximized 为 true 表示最大化，false 表示还原
                    }
                });
            }

            // 保存窗口ID以备后续使用
            this.windowId = this.applicationInfo && this.applicationInfo.windowId ? this.applicationInfo.windowId : null;

            // 添加到容器
            guiContainer.appendChild(this.window);

            this._bindUI();
            this._refreshUIStrings();
            this._languageChangeUnsubscribe = null;
            if (typeof LanguagesExpansion !== 'undefined' && typeof LanguagesExpansion.onLanguageChange === 'function') {
                this._languageChangeUnsubscribe = LanguagesExpansion.onLanguageChange(() => {
                    this._refreshUIStrings();
                });
            }

            const args = (initArgs && Array.isArray(initArgs.args)) ? initArgs.args : [];
            const filePathArg = (initArgs && initArgs.filePath != null) ? initArgs.filePath : null;
            const argsFirst = (args && args.length > 0) ? args[0] : null;
            const initialPathRaw = (typeof filePathArg === 'string' ? filePathArg : null) || (typeof argsFirst === 'string' ? argsFirst : null) || null;
            const pathStr = (initialPathRaw && String(initialPathRaw).trim() !== '' && String(initialPathRaw) !== 'undefined') ? String(initialPathRaw).trim() : '';
            const initialPath = pathStr ? this._normalizePath(pathStr) : null;
            if (initialPath) {
                // 延后一帧再打开文件，确保进程已完全注册、权限与 kernel API 可用
                await new Promise(r => setTimeout(r, 0));
                await this._openFile(initialPath);
            } else {
                this._setText('');
                this._setFilePath(null);
                this._setDirty(false);
            }
        },

        // 退出方法
        __exit__ : async function(){
            if (this._languageChangeUnsubscribe && typeof this._languageChangeUnsubscribe === 'function') {
                this._languageChangeUnsubscribe();
                this._languageChangeUnsubscribe = null;
            }
            this._unbindUI();

            // 注销窗口(固定写法)
            if (typeof GUIManager !== 'undefined') {

                // 针对多实例程序支持
                if (this.windowId) {
                    GUIManager.unregisterWindow(this.windowId);
                } else if (this.pid) {
                    GUIManager.unregisterWindow(this.pid);
                }
            } else if (this.window && this.window.parentElement) {

                // 强制注销(保留兼容)
                this.window.parentElement.removeChild(this.window);
            }
        },

        // 信息方法
        __info__ : function(){
            // 固定返回注册信息就好；description 使用多语言（与语言包 NOTEPAD_DESCRIPTION 一致）
            const desc = (typeof LanguagesExpansion !== 'undefined' && typeof LanguagesExpansion.getText === 'function')
                ? LanguagesExpansion.getText('NOTEPAD_DESCRIPTION') : 'Notepad记事本';
            return {
                name: 'Notepad',
                type: 'GUI',
                version: '1.0.0',
                description: desc || 'Notepad记事本',
                author: 'ZerOS Team',
                copyright: 'Copyright (c) 2026 ZerOS Team',
                metadata: {
                    allowMultipleInstances: true
                },

                // 程序权限声明
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    PermissionManager.PERMISSION.DRAG_FILE,
                    PermissionManager.PERMISSION.EVENT_LISTENER
                ] : []
            };
        },

        _bindUI: function() {
            if (!this.window) return;

            const toolbar = this.window.querySelector('.notepad-toolbar');
            if (toolbar) {
                const onToolbarClick = async (e) => {
                    const btn = e.target && e.target.closest ? e.target.closest('.notepad-btn') : null;
                    if (!btn) return;
                    const action = btn.dataset.action;
                    if (action === 'new') await this._newFile();
                    else if (action === 'open') await this._openFileDialog();
                    else if (action === 'save') await this._saveFile();
                    else if (action === 'saveas') await this._saveAs();
                    else if (action === 'clear') await this._clear();
                    else if (action === 'exit') await this._exit();
                };
                toolbar.addEventListener('click', onToolbarClick);
                this.eventListeners.push({ el: toolbar, type: 'click', handler: onToolbarClick });
            }

            if (this.textEl) {
                const onInput = () => {
                    const currentText = this._getEditorText();
                    const isDirty = this.filePath ? (currentText !== this.lastSavedText) : (currentText.length > 0);
                    this._setDirty(isDirty);
                    this._updateStatus();
                };
                const onKeyDown = async (e) => {
                    const isCtrl = e.ctrlKey || e.metaKey;
                    if (!isCtrl) return;
                    const key = (e.key || '').toLowerCase();
                    if (key === 's') {
                        e.preventDefault();
                        if (e.shiftKey) await this._saveAs();
                        else await this._saveFile();
                    } else if (key === 'o') {
                        e.preventDefault();
                        await this._openFileDialog();
                    } else if (key === 'n') {
                        e.preventDefault();
                        await this._newFile();
                    } else if (key === 'l') {
                        e.preventDefault();
                        await this._clear();
                    }
                };
                const onSelectionChange = () => this._updateStatus();

                this.textEl.addEventListener('input', onInput);
                this.textEl.addEventListener('keydown', onKeyDown);
                this.textEl.addEventListener('click', onSelectionChange);
                this.textEl.addEventListener('keyup', onSelectionChange);
                this.eventListeners.push({ el: this.textEl, type: 'input', handler: onInput });
                this.eventListeners.push({ el: this.textEl, type: 'keydown', handler: onKeyDown });
                this.eventListeners.push({ el: this.textEl, type: 'click', handler: onSelectionChange });
                this.eventListeners.push({ el: this.textEl, type: 'keyup', handler: onSelectionChange });
            }

            this._setupDropZone();
            this._updateTitle();
            this._updateStatus();
        },

        _unbindUI: function() {
            for (const l of this.eventListeners) {
                try {
                    if (l && l.el) l.el.removeEventListener(l.type, l.handler);
                } catch (e) {}
            }
            this.eventListeners = [];

            if (this.dropZoneSelector && typeof ProcessManager !== 'undefined') {
                try {
                    ProcessManager.callKernelAPI(this.pid, 'Drag.unregisterDropZone', [this.dropZoneSelector]).catch(() => {});
                } catch (e) {}
            }
        },

        _setupDropZone: async function() {
            if (!this.dropZoneSelector) return;
            if (typeof ProcessManager === 'undefined') return;
            try {
                await ProcessManager.callKernelAPI(this.pid, 'Drag.registerDropZone', [this.dropZoneSelector]);
            } catch (e) {}

            const dropZoneEl = this.window.querySelector('.notepad-editor');
            if (!dropZoneEl) return;

            const onDrop = async (e) => {
                const detail = e && e.detail ? e.detail : null;
                const session = detail && detail.session ? detail.session : null;
                const dragData = session && session.dragData ? session.dragData : (detail && detail.dragData ? detail.dragData.data : null);
                const filePaths = dragData && Array.isArray(dragData.filePaths) ? dragData.filePaths : null;
                if (!filePaths || filePaths.length === 0) return;

                const filePath = this._normalizePath(filePaths[0]);
                if (!filePath) return;
                await this._openFile(filePath);
            };
            dropZoneEl.addEventListener('zeros-drop', onDrop);
            this.eventListeners.push({ el: dropZoneEl, type: 'zeros-drop', handler: onDrop });
        },

        /** 多语言：优先 LanguagesExpansion.getText，否则返回 fallback */
        _getText: function (key, fallback) {
            if (typeof LanguagesExpansion !== 'undefined' && typeof LanguagesExpansion.getText === 'function') {
                return LanguagesExpansion.getText(key) || fallback;
            }
            return fallback;
        },
        _getEditorText: function() {
            return this.textEl ? (this.textEl.value || '') : '';
        },
        /** 语言切换时刷新工具栏、标题、状态栏等多语言文案 */
        _refreshUIStrings: function() {
            const w = this.window;
            if (!w) return;
            const btnKeys = { new: 'NOTEPAD_BTN_NEW', open: 'NOTEPAD_BTN_OPEN', save: 'NOTEPAD_BTN_SAVE', saveas: 'NOTEPAD_BTN_SAVEAS', clear: 'NOTEPAD_BTN_CLEAR', exit: 'NOTEPAD_BTN_EXIT' };
            const fallbacks = { new: '新建', open: '打开', save: '保存', saveas: '另存为', clear: '清空', exit: '退出' };
            Object.keys(btnKeys).forEach(action => {
                const btn = w.querySelector('.notepad-btn[data-action="' + action + '"]');
                if (btn) btn.textContent = this._getText(btnKeys[action], fallbacks[action]);
            });
            if (this.pathEl) this.pathEl.textContent = this.filePath || this._getText('NOTEPAD_UNNAMED', '未命名');
            this._updateTitle();
            this._updateStatus();
        },

        _setText: function(text) {
            if (!this.textEl) return;
            this.textEl.value = text == null ? '' : String(text);
            this._updateStatus();
        },

        _setFilePath: function(path) {
            this.filePath = path ? this._normalizePath(path) : null;
            if (this.pathEl) {
                this.pathEl.textContent = this.filePath || this._getText('NOTEPAD_UNNAMED', '未命名');
            }
            this._updateTitle();
        },

        _setDirty: function(dirty) {
            this.dirty = !!dirty;
            this._updateTitle();
            this._updateStatus();
        },

        _updateTitle: function() {
            const name = this.filePath ? this.filePath.split('/').pop() : this._getText('NOTEPAD_UNNAMED', '未命名');
            const prefix = this.dirty ? '* ' : '';
            const titleEl = this.window ? this.window.querySelector('.zos-window-titlebar .zos-window-title') : null;
            if (titleEl) {
                titleEl.textContent = `${prefix}${name} - ${this._getText('NOTEPAD_TITLE', 'Notepad')}`;
            }
        },

        _updateStatus: function() {
            if (!this.statusLeftEl || !this.statusRightEl) return;
            const name = this.filePath ? this.filePath.split('/').pop() : this._getText('NOTEPAD_UNNAMED', '未命名');
            const dirtyText = this.dirty ? this._getText('NOTEPAD_STATUS_MODIFIED', '已修改') : (this.filePath ? this._getText('NOTEPAD_STATUS_SAVED', '已保存') : this._getText('NOTEPAD_STATUS_UNSAVED', '未保存'));
            this.statusLeftEl.textContent = `${name} · ${dirtyText}`;

            const { line, col, length } = this._getCursorInfo();
            const fmt = this._getText('NOTEPAD_STATUS_LINE_COL', '行 {0}, 列 {1} · {2} 字符');
            this.statusRightEl.textContent = fmt.replace('{0}', String(line)).replace('{1}', String(col)).replace('{2}', String(length));
        },

        _getCursorInfo: function() {
            const text = this._getEditorText();
            const length = text.length;
            if (!this.textEl) return { line: 1, col: 1, length };
            const pos = typeof this.textEl.selectionStart === 'number' ? this.textEl.selectionStart : 0;
            let line = 1;
            let lastBreak = -1;
            for (let i = 0; i < pos && i < text.length; i++) {
                if (text[i] === '\n') {
                    line++;
                    lastBreak = i;
                }
            }
            const col = pos - lastBreak;
            return { line, col, length };
        },

        _normalizePath: function(p) {
            if (!p || typeof p !== 'string') return '';
            let s = p.replace(/\\/g, '/');
            s = s.replace(/\/+/g, '/');
            // 确保盘符后紧跟 '/'，否则 FileSystem.read 无法解析（如 "D:path/file" -> "D:/path/file"）
            if (/^[A-Za-z]:[^/]/.test(s)) {
                s = s.charAt(0) + s.charAt(1) + '/' + s.slice(2);
            }
            return s;
        },

        _notify: async function(title, content, type = 'snapshot', duration = 2500) {
            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                try {
                    await NotificationManager.createNotification(this.pid, {
                        type,
                        title,
                        content,
                        duration
                    });
                    return;
                } catch (e) {}
            }
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showAlert === 'function') {
                try {
                    await GUIManager.showAlert(content, title, 'info');
                } catch (e) {}
            }
        },

        _confirm: async function(message, title, type = 'warning') {
            if (title === undefined) title = this._getText('NOTEPAD_CONFIRM', '确认');
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                try {
                    return await GUIManager.showConfirm(message, title, type);
                } catch (e) {
                    return false;
                }
            }
            return confirm(message);
        },

        _prompt: async function(message, title, defaultValue = '') {
            if (title === undefined) title = this._getText('NOTEPAD_PROMPT', '输入');
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                try {
                    return await GUIManager.showPrompt(message, title, defaultValue);
                } catch (e) {
                    return null;
                }
            }
            return prompt(message, defaultValue);
        },

        _maybeSaveChanges: async function() {
            if (!this.dirty) return true;
            const ok = await this._confirm(this._getText('NOTEPAD_SAVE_BEFORE_LEAVE', '当前内容尚未保存，是否先保存？'), this._getText('NOTEPAD_TITLE', 'Notepad'), 'warning');
            if (!ok) {
                const discard = await this._confirm(this._getText('NOTEPAD_DISCARD_CHANGES', '不保存并继续操作？'), this._getText('NOTEPAD_TITLE', 'Notepad'), 'danger');
                return discard;
            }
            const saved = await this._saveFile();
            return !!saved;
        },

        _openFileDialog: async function() {
            if (typeof ProcessManager === 'undefined') {
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), this._getText('NOTEPAD_PM_UNAVAILABLE', 'ProcessManager 不可用'));
                return;
            }
            const ok = await this._maybeSaveChanges();
            if (!ok) return;

            try {
                await ProcessManager.startProgram('filemanager', {
                    args: [this.filePath ? (this.filePath.split('/').slice(0, -1).join('/') || (this.filePath.split(':')[0] + ':')) : 'D:'],
                    mode: 'file-selector',
                    onFileSelected: async (fileItem) => {
                        if (fileItem && fileItem.path) {
                            await this._openFile(fileItem.path);
                        }
                    }
                });
            } catch (e) {
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), (this._getText('NOTEPAD_OPEN_FAILED', '打开文件失败: {0}')).replace('{0}', e.message || String(e)));
            }
        },

        _openFile: async function(path) {
            if (!path) return;
            if (typeof ProcessManager === 'undefined') {
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), this._getText('NOTEPAD_PM_UNAVAILABLE', 'ProcessManager 不可用'));
                return;
            }

            try {
                const filePath = this._normalizePath(path);
                if (!filePath) return;
                if (this.dirty && this.filePath !== filePath) {
                    const ok = await this._maybeSaveChanges();
                    if (!ok) return;
                }
                // 统一使用 ProcessManager.callKernelAPI，避免 __init__ 阶段注入的 kernelAPI 尚未生效
                const raw = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.read', [filePath]);
                const content = raw == null ? '' : (Array.isArray(raw) ? raw.join('\n') : String(raw));
                this._setText(content);
                this.lastSavedText = this._getEditorText();
                this._setFilePath(filePath);
                this._setDirty(false);
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), this._getText('NOTEPAD_FILE_OPENED', '文件已打开'));
            } catch (e) {
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), (this._getText('NOTEPAD_OPEN_FAILED_MSG', '打开失败: {0}')).replace('{0}', e.message || String(e)));
            }
        },

        _saveFile: async function() {
            if (!this.filePath) {
                return await this._saveAs();
            }
            if (typeof ProcessManager === 'undefined') {
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), this._getText('NOTEPAD_PM_UNAVAILABLE', 'ProcessManager 不可用'));
                return false;
            }
            try {
                const ok = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.write', [this.filePath, this._getEditorText(), 'OVERWRITE']);
                if (ok) {
                    this.lastSavedText = this._getEditorText();
                    this._setDirty(false);
                    await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), this._getText('NOTEPAD_SAVED', '已保存'));
                    return true;
                }
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), this._getText('NOTEPAD_SAVE_FAILED', '保存失败'));
                return false;
            } catch (e) {
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), (this._getText('NOTEPAD_SAVE_FAILED_MSG', '保存失败: {0}')).replace('{0}', e.message || String(e)));
                return false;
            }
        },

        _saveAs: async function() {
            if (typeof ProcessManager === 'undefined') {
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), this._getText('NOTEPAD_PM_UNAVAILABLE', 'ProcessManager 不可用'));
                return false;
            }

            try {
                const cwd = this.filePath ? (this.filePath.split('/').slice(0, -1).join('/') || (this.filePath.split(':')[0] + ':')) : 'D:';
                const folderItem = await new Promise((resolve) => {
                    let settled = false;
                    const timer = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        resolve(null);
                    }, 5 * 60 * 1000);
                    ProcessManager.startProgram('filemanager', {
                        args: [cwd],
                        mode: 'folder-selector',
                        onFolderSelected: async (item) => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);
                            resolve(item || null);
                        }
                    }).catch(() => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        resolve(null);
                    });
                });
                if (!folderItem || !folderItem.path) return false;

                const defaultName = this.filePath ? this.filePath.split('/').pop() : 'untitled.txt';
                const fileName = await this._prompt(this._getText('NOTEPAD_SAVEAS_PROMPT', '请输入文件名:'), this._getText('NOTEPAD_SAVEAS_TITLE', '另存为'), defaultName);
                if (!fileName) return false;

                const folder = this._normalizePath(folderItem.path).replace(/\/$/, '');
                const targetPath = `${folder}/${fileName}`.replace(/\/+/g, '/');

                const ok = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.write', [targetPath, this._getEditorText(), 'OVERWRITE']);
                if (ok) {
                    this.lastSavedText = this._getEditorText();
                    this._setFilePath(targetPath);
                    this._setDirty(false);
                    await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), this._getText('NOTEPAD_SAVEAS_DONE', '已另存为'));
                    return true;
                }
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), this._getText('NOTEPAD_SAVEAS_FAILED', '另存为失败'));
                return false;
            } catch (e) {
                await this._notify(this._getText('NOTEPAD_TITLE', 'Notepad'), (this._getText('NOTEPAD_SAVEAS_FAILED_MSG', '另存为失败: {0}')).replace('{0}', e.message || String(e)));
                return false;
            }
        },

        _newFile: async function() {
            const ok = await this._maybeSaveChanges();
            if (!ok) return;
            this._setText('');
            this.lastSavedText = '';
            this._setFilePath(null);
            this._setDirty(false);
        },

        _clear: async function() {
            const ok = await this._confirm(this._getText('NOTEPAD_CLEAR_CONFIRM', '清空编辑区？'), this._getText('NOTEPAD_TITLE', 'Notepad'), 'warning');
            if (!ok) return;
            this._setText('');
            const currentText = this._getEditorText();
            const isDirty = this.filePath ? (currentText !== this.lastSavedText) : (currentText.length > 0);
            this._setDirty(isDirty);
        },

        _exit: async function() {
            const ok = await this._maybeSaveChanges();
            if (!ok) return;
            if (typeof ProcessManager !== 'undefined') {
                try {
                    await ProcessManager.killProgram(this.pid);
                    return;
                } catch (e) {}
            }
            if (this.windowId && typeof GUIManager !== 'undefined') {
                try {
                    GUIManager.unregisterWindow(this.windowId);
                } catch (e) {}
            }
        }
    };

    // 自动导出(固定写法)
    // 导出程序对象,有的地方改一改就行
    if(typeof window !== 'undefined'){
        window[PROGRAM_NAME] = NOTEPAD;
    }else if(typeof globalThis !== 'undefined'){
        globalThis[PROGRAM_NAME] = NOTEPAD;
    }

    // TIP: 一定注意导出名与程序名,文件名一致(仅导出名全大写,具体参见文档)

})(typeof window !== 'undefined' ? window : globalThis);
