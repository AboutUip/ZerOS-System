/* Vim 文本编辑器 - 全面重写版本
 * 功能：
 * - 完整的vim模式系统（Normal/Insert/Command/Visual）
 * - 文件读写功能
 * - 键盘事件处理
 * - 渲染系统
 * - 完整的vim命令支持
 */

(function (window) {
    'use strict';

    const VIM = {
        pid: null,
        terminal: null,
        _closing: false,
        _instances: new Map(), // 存储所有vim实例

        /**
         * 程序信息
         */
        __info__: function () {
            return {
                name: 'VIM',
                type: 'CLI',
                version: '2.0.0',
                description: 'Vim文本编辑器 - 全面重写版本',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.NETWORK_ACCESS
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: true
                }
            };
        },

        /**
         * 初始化方法
         */
        __init__: async function (pid, initArgs = {}) {
            this.pid = pid;
            this._upid = initArgs && initArgs.upid;
            this.terminal = initArgs.terminal;
            this._kernelAPI = initArgs.kernelAPI || null;

            if (!this.terminal) {
                throw new Error('VIM 程序需要终端环境');
            }

            // 保存参数供后续使用
            const args = initArgs.args || [];
            const cwd = initArgs.cwd || 'C:';

            // 创建VimEditor实例
            const editor = new VimEditor(pid, this.terminal, cwd, this._kernelAPI, this._upid);
            this._instances.set(pid, editor);

            // 使用 setTimeout 延迟执行，确保进程状态已设置为 running
            setTimeout(async () => {
                try {
                    // 解析文件名参数
                    const filename = args.length > 0 ? args[0] : null;

                    // 初始化编辑器
                    await editor.init(filename);
                } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('Vim', '初始化失败', error);
                    }
                    this.terminal.write(`vim: 错误: ${error.message}\n`);
                    await this._selfClose(pid);
                }
            }, 0);
        },

        /**
         * 退出方法
         */
        __exit__: async function (pid) {
            const editor = this._instances.get(pid);
            if (editor) {
                await editor.cleanup();
                this._instances.delete(pid);
            }
            this.terminal = null;
        },

        /**
         * 自我关闭
         */
        _selfClose: async function (pid) {
            if (this._closing) return;
            this._closing = true;

            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    // 忽略错误
                }
            }

            if (ProcessMgr || this._kernelAPI) {
                try {
                    // 关闭自身时优先使用 kernelAPI.call（跳过调用栈校验，避免 VM 中运行导致 PID 校验失败）
                    if (pid === this.pid && this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                        await this._kernelAPI.call('Process.requestSelfTermination', []);
                    } else if (typeof ProcessMgr.callKernelAPI === 'function') {
                        await ProcessMgr.callKernelAPI(pid, 'Process.requestSelfTermination', []);
                    } else if (typeof ProcessMgr.requestSelfTermination === 'function') {
                        await ProcessMgr.requestSelfTermination(pid);
                    } else if (typeof ProcessMgr.killProgram === 'function') {
                        await ProcessMgr.killProgram(pid, true);
                    }
                } catch (error) {
                    if (ProcessMgr && typeof ProcessMgr.killProgram === 'function') {
                        try {
                            await ProcessMgr.killProgram(pid, true);
                        } catch (forceError) {}
                    }
                }
            }
        }
    };

    /**
     * VimEditor 类 - vim编辑器核心实现
     */
    class VimEditor {
        constructor(pid, terminal, cwd, kernelAPI = null, upid = null) {
            this.pid = pid;
            this.terminal = terminal;
            this.cwd = cwd;
            this._kernelAPI = kernelAPI || null;
            this._upid = upid != null ? upid : null;

            // 编辑器状态
            this.mode = 'NORMAL'; // NORMAL, INSERT, COMMAND, VISUAL
            this.lines = []; // 文件内容（按行存储）
            this.cursorRow = 0;
            this.cursorCol = 0;
            this.filePath = null;
            this.fileName = null;
            this.modified = false;

            // 命令历史
            this.commandHistory = [];
            this.commandHistoryIndex = -1;
            this.commandText = ''; // 命令模式下的命令文本
            
            // 事件处理器ID
            this.eventHandlerIds = [];
            
            // 标记是否已初始化
            this.initialized = false;
        }

        /**
         * 初始化编辑器
         */
        async init(filename) {
            if (this.initialized) return;
            this.initialized = true;

            // 注入vim CSS样式
            this._injectVimCSS();

            // 如果提供了文件名，打开文件
            if (filename) {
                await this.openFile(filename);
                } else {
                // 没有文件名，创建空文件
                this.lines = [''];
            }

            // 注册键盘事件
            this._registerEvents();

            // 渲染界面
            this.render();
        }

        /**
         * 注入vim CSS样式
         */
        _injectVimCSS() {
            const cssId = `vim-css-${this.pid}`;
            const vimCSS = `
                /* Vim编辑器样式 */
                .vim-container {
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 14px;
                    line-height: 1.5;
                    color: #d7e0dd;
                    background-color: #0b0f12;
                    padding: 0;
                    margin: 0;
                    overflow-x: auto;
                }

                .vim-line {
                    white-space: pre;
                    padding: 0;
                    margin: 0;
                    min-height: 1.5em;
                }

                .vim-line-normal {
                    color: #d7e0dd;
                    background-color: transparent;
                }

                .vim-line-insert {
                    color: #d7e0dd;
                    background-color: transparent;
                }

                .vim-cursor {
                    background-color: #ffffff !important;
                    color: #000000 !important;
                    display: inline-block;
                    min-width: 1ch;
                }

                .vim-cursor-insert {
                    background-color: #d7e0dd !important;
                    color: #0b0f12 !important;
                    border-left: 2px solid #d7e0dd;
                    margin-left: -2px;
                }

                .vim-status-line {
                    background-color: #1e2329 !important;
                    color: #d7e0dd !important;
                    padding: 4px 8px !important;
                    margin-top: 2px !important;
                    border-top: 1px solid #3c3c3c !important;
                    font-weight: bold !important;
                    font-size: 12px !important;
                    display: block !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                    white-space: pre !important;
                    position: sticky !important;
                    bottom: 0 !important;
                    z-index: 100 !important;
                }

                .vim-status-line .vim-mode {
                    color: #00ff6a !important;
                    font-weight: bold !important;
                }

                .vim-status-line .vim-filename {
                    color: #4EC9B0 !important;
                }

                .vim-status-line .vim-modified {
                    color: #ff6b6b !important;
                }

                .vim-status-line .vim-position {
                    float: right;
                    color: #9aa6a0 !important;
                }

                .vim-command-line {
                    background-color: #1e2329 !important;
                    color: #d7e0dd !important;
                    padding: 4px 8px !important;
                    margin-top: 2px !important;
                    border-top: 1px solid #3c3c3c !important;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
                    font-size: 14px !important;
                    display: block !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                }

                /* 行号（可选，未来可以添加） */
                .vim-line-number {
                    color: #9aa6a0;
                    background-color: #1e1e1e;
                    padding-right: 8px;
                    margin-right: 8px;
                    border-right: 1px solid #3c3c3c;
                    user-select: none;
                    text-align: right;
                    min-width: 4ch;
                    display: inline-block;
                }
            `;

            // 使用terminal的injectCSS方法（如果可用）
            if (this.terminal && typeof this.terminal.injectCSS === 'function') {
                this.terminal.injectCSS(vimCSS, cssId);
            } else if (typeof document !== 'undefined') {
                // 降级方案：直接创建style元素
                let styleEl = document.getElementById(cssId);
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = cssId;
                    styleEl.type = 'text/css';
                    document.head.appendChild(styleEl);
                }
                styleEl.textContent = vimCSS;
            }
        }

        /**
         * 打开文件
         */
        async openFile(filename) {
            try {
                // 解析文件路径
                const resolvedPath = this._resolvePath(this.cwd, filename);
                const pathParts = this._parsePath(resolvedPath);

                this.filePath = pathParts.dirPath;
                this.fileName = pathParts.fileName;

                // 读取文件
                const content = await this._readFile(pathParts.dirPath, pathParts.fileName);

                // 按行分割内容
                if (content) {
                    this.lines = content.split('\n');
                    // 如果文件以换行符结尾，移除最后一个空行
                    if (this.lines.length > 0 && this.lines[this.lines.length - 1] === '' && content.endsWith('\n')) {
                        this.lines.pop();
                    }
                    if (this.lines.length === 0) {
                    this.lines = [''];
                    }
                } else {
                            this.lines = [''];
                    }
                    
                    this.cursorRow = 0;
                    this.cursorCol = 0;
                this.modified = false;
            } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Vim', '打开文件失败', error);
                }
                throw error;
            }
        }

        /**
         * 保存文件
         */
        async saveFile() {
            if (!this.fileName) {
                throw new Error('文件未命名，请使用 :w <filename> 保存');
            }
            
            try {
                const content = this.lines.join('\n');
                await this._writeFile(this.filePath, this.fileName, content);
                this.modified = false;
                    return true;
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Vim', '保存文件失败', error);
                }
                throw error;
            }
        }

        /**
         * 解析路径
         */
        _parsePath(filePath) {
            // 解析路径，分离目录路径和文件名
            // 例如：C:/folder/file.txt -> dirPath: C:/folder, fileName: file.txt
            // 例如：C:/file.txt -> dirPath: C:, fileName: file.txt
            const normalized = filePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
            const lastSlashIndex = normalized.lastIndexOf('/');

            let dirPath, fileName;
            if (normalized.match(/^[A-Z]:/)) {
                if (lastSlashIndex > 1) {
                    dirPath = normalized.substring(0, lastSlashIndex);
                    fileName = normalized.substring(lastSlashIndex + 1);
                } else if (lastSlashIndex === 1) {
                    dirPath = normalized.substring(0, 2);
                    fileName = normalized.substring(3);
                } else {
                    dirPath = normalized.substring(0, 2);
                    fileName = normalized.substring(2);
                }
            } else {
                if (lastSlashIndex >= 0) {
                    dirPath = normalized.substring(0, lastSlashIndex);
                    fileName = normalized.substring(lastSlashIndex + 1);
                } else {
                    dirPath = this.cwd;
                    fileName = normalized;
                }
            }

            // 如果目录路径为空，使用当前工作目录
            if (!dirPath) {
                dirPath = this.cwd;
            }

            return { dirPath, fileName };
        }

        /**
         * 解析路径（相对路径转绝对路径）
         */
        _resolvePath(cwd, inputPath) {
            if (!inputPath) return cwd;

            // 已是绝对盘符路径，如 A: 或 A:/...（仅支持大写 A-Z）
            if (/^[A-Z]:/.test(inputPath)) {
                return inputPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
            }

            const root = String(cwd).split('/')[0];
            let baseParts = String(cwd).split('/');

            // 如果以 / 开头，表示相对于当前盘符根
            if (inputPath.startsWith('/')) {
                baseParts = [root];
                inputPath = inputPath.replace(/^\/+/, '');
            }

            const parts = inputPath.split('/').filter(Boolean);
            for (const p of parts) {
                if (p === '.') continue;
                if (p === '..') {
                    if (baseParts.length > 1) baseParts.pop();
            } else {
                    baseParts.push(p);
                }
            }

            return baseParts.join('/');
        }

        /**
         * 读取文件
         */
        async _readFile(dirPath, fileName) {
                try {
                    const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject) 
                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid })
                    : new URL((typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath)
                        ? SystemInformation.getFSDirvePath()
                        : '/system/service/FSDirve.php',
                        (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin)
                            ? SystemInformation.getOrigin()
                            : window.location.origin);
                    if (this._upid != null) url.searchParams.set('upid', this._upid);

                    url.searchParams.set('action', 'read_file');
                url.searchParams.set('path', dirPath);
                    url.searchParams.set('fileName', fileName);
                    
                    const response = await fetch(url.toString());
                const result = await response.json();

                if (result.status === 'success') {
                    return result.data.content || '';
                        } else {
                    throw new Error(result.message || '读取文件失败');
                }
            } catch (error) {
                if (error.message.includes('不存在')) {
                    // 文件不存在，返回空内容
                    return '';
                }
                throw error;
            }
        }

        /**
         * 写入文件
         */
        async _writeFile(dirPath, fileName, content) {
            const url = (typeof SystemInformation !== 'undefined' && SystemInformation.buildServiceUrlObject)
                        ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE, { upid: this._upid })
                : new URL((typeof SystemInformation !== 'undefined' && SystemInformation.getFSDirvePath)
                    ? SystemInformation.getFSDirvePath()
                    : '/system/service/FSDirve.php',
                    (typeof SystemInformation !== 'undefined' && SystemInformation.getOrigin)
                            ? SystemInformation.getOrigin()
                            : window.location.origin);
            if (this._upid != null) url.searchParams.set('upid', this._upid);

            url.searchParams.set('action', 'write_file');
            url.searchParams.set('path', dirPath);
            url.searchParams.set('fileName', fileName);
            url.searchParams.set('writeMod', 'overwrite');

            const response = await fetch(url.toString(), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                body: JSON.stringify({ content })
            });

            const result = await response.json();

                    if (result.status !== 'success') {
                throw new Error(result.message || '写入文件失败');
            }
        }

        /**
         * 注册事件
         */
        _registerEvents() {
            if (typeof EventManager === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('Vim', 'EventManager 不可用，无法注册键盘事件');
                }
                return;
            }
            
            // 注册键盘事件
            const handlerId = EventManager.registerEventHandler(this.pid, 'keydown', (ev, eventContext) => {
                try {
                    // 如果提供了eventContext，使用它来阻止默认行为
                    if (eventContext && typeof eventContext.preventDefault === 'function') {
                        eventContext.preventDefault();
                    } else if (ev && typeof ev.preventDefault === 'function') {
                        ev.preventDefault();
                    }
                    
                    this._handleKey(ev, eventContext);
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('Vim', '键盘事件处理失败', error);
                    }
                }
            }, {
                priority: 50 // 高优先级
            });

            if (handlerId) {
                this.eventHandlerIds.push(handlerId);
            }
        }

        /**
         * 确保编辑器状态有效
         */
        _ensureValidState() {
            // 确保lines数组存在
            if (!Array.isArray(this.lines) || this.lines.length === 0) {
                    this.lines = [''];
            }

            // 确保光标位置有效
            if (typeof this.cursorRow !== 'number' || this.cursorRow < 0) {
                this.cursorRow = 0;
            }
            if (this.cursorRow >= this.lines.length) {
                this.cursorRow = Math.max(0, this.lines.length - 1);
            }
            if (typeof this.cursorCol !== 'number' || this.cursorCol < 0) {
                this.cursorCol = 0;
            }

            // 确保当前行的列位置有效
            const currentLine = this.lines[this.cursorRow];
            if (typeof currentLine !== 'string') {
                this.lines[this.cursorRow] = '';
            }
            const maxCol = this.lines[this.cursorRow].length;
            if (this.cursorCol > maxCol) {
                this.cursorCol = maxCol;
            }

            // 确保模式有效
            if (!this.mode || typeof this.mode !== 'string') {
                this.mode = 'NORMAL';
            }
        }

        /**
         * 安全获取当前行
         */
        _getCurrentLine() {
            this._ensureValidState();
            return this.lines[this.cursorRow] || '';
        }

        /**
         * 安全地调用事件方法
         */
        _safePreventDefault(ev, eventContext) {
            if (eventContext && typeof eventContext.preventDefault === 'function') {
                try {
                    eventContext.preventDefault();
                return;
                } catch (e) {}
            }
            if (ev && typeof ev.preventDefault === 'function') {
                try {
                    ev.preventDefault();
                } catch (e) {}
            }
        }

        /**
         * 安全地停止事件传播
         */
        _safeStopPropagation(ev, eventContext) {
            if (eventContext && typeof eventContext.stopPropagation === 'function') {
                try {
                    eventContext.stopPropagation();
                return;
                } catch (e) {}
            }
            if (ev && typeof ev.stopPropagation === 'function') {
                try {
                    ev.stopPropagation();
                } catch (e) {}
            }
        }

        /**
         * 处理键盘事件
         */
        _handleKey(ev, eventContext) {
            // 验证事件对象
            if (!ev || typeof ev !== 'object') {
                return;
            }
            
            // 检查编辑器是否已初始化
            if (!this.initialized || !this.terminal) {
                return;
            }
            
            // 确保编辑器状态有效
            try {
                this._ensureValidState();
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Vim', '确保状态有效失败', error);
                }
                return;
            }

            // 根据当前模式处理键盘事件
            try {
                const mode = this.mode || 'NORMAL';
                if (mode === 'NORMAL') {
                    this._handleNormalMode(ev, eventContext);
                } else if (mode === 'INSERT') {
                    this._handleInsertMode(ev, eventContext);
                } else if (mode === 'COMMAND') {
                    this._handleCommandMode(ev, eventContext);
                } else if (mode === 'VISUAL') {
                    this._handleVisualMode(ev, eventContext);
                }
            } catch (error) {
                // 安全地记录错误，避免在记录错误时再次抛出异常
                if (typeof KernelLogger !== 'undefined') {
                    try {
                        const errorMsg = error && typeof error === 'object' && error.message 
                            ? error.message 
                            : String(error || '未知错误');
                        KernelLogger.error('Vim', '处理键盘事件失败: ' + errorMsg, error);
                    } catch (logError) {
                        // 完全失败，静默忽略
                    }
                }
            }
        }

        /**
         * 处理Normal模式
         */
        _handleNormalMode(ev, eventContext) {
            this._safePreventDefault(ev, eventContext);
            this._safeStopPropagation(ev, eventContext);

            const key = ev.key;
            const ctrl = ev.ctrlKey;
            const shift = ev.shiftKey;
            const alt = ev.altKey;

            // ESC键：确保在Normal模式
            if (key === 'Escape') {
                this.mode = 'NORMAL';
                this.render();
                return;
            }

            // 方向键移动
            if (key === 'ArrowUp' || (ctrl && key === 'p')) {
                if (this.cursorRow > 0) {
                    this.cursorRow--;
                    this._adjustCursorCol();
                }
                this.render();
                return;
            }
            if (key === 'ArrowDown' || (ctrl && key === 'n')) {
                if (this.cursorRow < this.lines.length - 1) {
                    this.cursorRow++;
                    this._adjustCursorCol();
                }
                this.render();
                return;
            }
            if (key === 'ArrowLeft' || (ctrl && key === 'b')) {
            if (this.cursorCol > 0) {
                this.cursorCol--;
                } else if (this.cursorRow > 0) {
                    this.cursorRow--;
                    this._ensureValidState();
                    this.cursorCol = this._getCurrentLine().length;
                }
                this.render();
                return;
            }
            if (key === 'ArrowRight' || (ctrl && key === 'f')) {
                this._ensureValidState();
                const lineLength = this._getCurrentLine().length;
                if (this.cursorCol < lineLength) {
                this.cursorCol++;
                } else if (this.cursorRow < this.lines.length - 1) {
                    this.cursorRow++;
                this.cursorCol = 0;
                }
                this.render();
                return;
            }

            // i键：进入插入模式
            if (key === 'i') {
                this.mode = 'INSERT';
                this.render();
                return;
            }

            // a键：在当前字符后进入插入模式
            if (key === 'a') {
                this._ensureValidState();
                const lineLength = this._getCurrentLine().length;
                if (this.cursorCol < lineLength) {
            this.cursorCol++;
                }
                this.mode = 'INSERT';
                this.render();
                return;
            }
            
            // A键：在当前行末尾进入插入模式
            if (key === 'A' && shift) {
                this._ensureValidState();
                this.cursorCol = this._getCurrentLine().length;
                this.mode = 'INSERT';
                this.render();
                return;
            }
            
            // o键：在下一行插入
            if (key === 'o') {
                this.lines.splice(this.cursorRow + 1, 0, '');
            this.cursorRow++;
            this.cursorCol = 0;
                this.modified = true;
                this.mode = 'INSERT';
                this.render();
                return;
            }
            
            // O键：在上一行插入
            if (key === 'O' && shift) {
                this.lines.splice(this.cursorRow, 0, '');
            this.cursorCol = 0;
                this.modified = true;
                this.mode = 'INSERT';
                this.render();
                return;
            }

            // :键：进入命令模式
            if (key === ':' && shift) {
                this.mode = 'COMMAND';
                this.commandText = '';
                this.render();
                return;
            }

            // x键：删除当前字符
            if (key === 'x') {
                this._ensureValidState();
                const line = this._getCurrentLine();
                if (this.cursorCol < line.length) {
                    this.lines[this.cursorRow] = line.substring(0, this.cursorCol) + line.substring(this.cursorCol + 1);
                    this.modified = true;
                } else if (this.cursorRow < this.lines.length - 1) {
                    // 在行尾，合并下一行
                    this.lines[this.cursorRow] += this.lines[this.cursorRow + 1];
                this.lines.splice(this.cursorRow + 1, 1);
                    this.modified = true;
                }
                this.render();
                return;
            }
            
            // dd键：删除当前行（需要记录按键序列）
            if (key === 'd') {
                // 简单的dd处理（实际vim需要记录按键序列）
            if (this.lines.length > 1) {
                this.lines.splice(this.cursorRow, 1);
                if (this.cursorRow >= this.lines.length) {
                    this.cursorRow = this.lines.length - 1;
                }
                    this.cursorCol = 0;
                    this.modified = true;
                    this.render();
                    return;
                }
            }

            // u键：撤销（简化实现）
            if (key === 'u' && ctrl) {
                // 撤销功能需要历史记录，这里简化处理
                this.render();
                return;
            }
        }

        /**
         * 处理Insert模式
         */
        _handleInsertMode(ev, eventContext) {
            // 验证事件对象
            if (!ev || typeof ev !== 'object') {
                return;
            }

            // 安全地获取事件属性
            const key = ev.key || '';
            const ctrl = ev.ctrlKey || false;
            const shift = ev.shiftKey || false;
            const alt = ev.altKey || false;

            // ESC键：退出插入模式
            if (key === 'Escape') {
                this.mode = 'NORMAL';
                this.render();
                return;
            }

            // Backspace：删除前一个字符
            if (key === 'Backspace') {
                this._safePreventDefault(ev, eventContext);
                this._safeStopPropagation(ev, eventContext);
                this._ensureValidState();
                const line = this._getCurrentLine();
                if (this.cursorCol > 0) {
                    this.lines[this.cursorRow] = line.substring(0, this.cursorCol - 1) + line.substring(this.cursorCol);
                    this.cursorCol--;
                    this.modified = true;
                } else if (this.cursorRow > 0) {
                    // 在行首，合并到上一行
                    this._ensureValidState();
                    const prevLine = this.lines[this.cursorRow - 1];
                    const currentLine = this.lines[this.cursorRow];
                    if (typeof prevLine === 'string' && typeof currentLine === 'string') {
                        const prevLineLen = prevLine.length;
                        this.lines[this.cursorRow - 1] = prevLine + currentLine;
                        this.lines.splice(this.cursorRow, 1);
                        this.cursorRow--;
                        this.cursorCol = prevLineLen;
                        this.modified = true;
                    }
                }
                this.render();
                return;
            }

            // Delete：删除当前字符
            if (key === 'Delete') {
                this._safePreventDefault(ev, eventContext);
                this._safeStopPropagation(ev, eventContext);
                this._ensureValidState();
                const line = this._getCurrentLine();
                if (this.cursorCol < line.length) {
                    this.lines[this.cursorRow] = line.substring(0, this.cursorCol) + line.substring(this.cursorCol + 1);
                    this.modified = true;
                } else if (this.cursorRow < this.lines.length - 1) {
                    // 在行尾，合并下一行
                    this._ensureValidState();
                    this.lines[this.cursorRow] += this.lines[this.cursorRow + 1];
                    this.lines.splice(this.cursorRow + 1, 1);
                    this.modified = true;
                }
                this.render();
                return;
            }

            // Enter：换行
            if (key === 'Enter') {
                this._safePreventDefault(ev, eventContext);
                this._safeStopPropagation(ev, eventContext);
                this._ensureValidState();
                const line = this._getCurrentLine();
                const beforeCursor = line.substring(0, this.cursorCol);
                const afterCursor = line.substring(this.cursorCol);
                this.lines[this.cursorRow] = beforeCursor;
                this.lines.splice(this.cursorRow + 1, 0, afterCursor);
                this.cursorRow++;
                this.cursorCol = 0;
                this.modified = true;
                this.render();
                    return;
            }

            // 方向键移动（在插入模式下也支持）
            if (key === 'ArrowUp') {
                this._safePreventDefault(ev, eventContext);
                this._safeStopPropagation(ev, eventContext);
            if (this.cursorRow > 0) {
                this.cursorRow--;
                    this._adjustCursorCol();
                }
                this.render();
                return;
            }
            if (key === 'ArrowDown') {
                this._safePreventDefault(ev, eventContext);
                this._safeStopPropagation(ev, eventContext);
            if (this.cursorRow < this.lines.length - 1) {
                this.cursorRow++;
                    this._adjustCursorCol();
                }
                this.render();
                return;
            }
            if (key === 'ArrowLeft') {
                this._safePreventDefault(ev, eventContext);
                this._safeStopPropagation(ev, eventContext);
            if (this.cursorCol > 0) {
                this.cursorCol--;
            } else if (this.cursorRow > 0) {
                this.cursorRow--;
                this._ensureValidState();
                this.cursorCol = this._getCurrentLine().length;
                }
                this.render();
                return;
            }
            if (key === 'ArrowRight') {
                this._safePreventDefault(ev, eventContext);
                this._safeStopPropagation(ev, eventContext);
                this._ensureValidState();
                const lineLength = this._getCurrentLine().length;
                if (this.cursorCol < lineLength) {
                    this.cursorCol++;
                } else if (this.cursorRow < this.lines.length - 1) {
                this.cursorRow++;
                this.cursorCol = 0;
                }
                this.render();
                return;
            }

            // 其他字符：插入文本
            if (key.length === 1 && !ctrl && !alt) {
                this._safePreventDefault(ev, eventContext);
                this._safeStopPropagation(ev, eventContext);
                this._ensureValidState();
                const line = this._getCurrentLine();
                this.lines[this.cursorRow] = line.substring(0, this.cursorCol) + key + line.substring(this.cursorCol);
                this.cursorCol++;
                this.modified = true;
                this.render();
                return;
            }
        }

        /**
         * 处理Command模式
         */
        _handleCommandMode(ev, eventContext) {
            // 验证事件对象
            if (!ev || typeof ev !== 'object') {
                return;
            }

            // 安全地获取事件属性
            const key = ev.key || '';
            const ctrl = ev.ctrlKey || false;

            this._safePreventDefault(ev, eventContext);
            this._safeStopPropagation(ev, eventContext);

            // ESC键：退出命令模式
            if (key === 'Escape') {
                this.mode = 'NORMAL';
                this.commandText = '';
                this.render();
                return;
            }

            // Enter：执行命令
            if (key === 'Enter') {
                this._executeCommand(this.commandText);
                this.commandText = '';
                this.render();
                return;
            }

            // Backspace：删除命令文本
            if (key === 'Backspace') {
                if (this.commandText.length > 0) {
                    this.commandText = this.commandText.substring(0, this.commandText.length - 1);
                }
                this.render();
                return;
            }

            // 方向键：命令历史
            if (key === 'ArrowUp') {
                if (this.commandHistoryIndex > 0) {
                    this.commandHistoryIndex--;
                    this.commandText = this.commandHistory[this.commandHistoryIndex] || '';
                }
                this.render();
                return;
            }
            if (key === 'ArrowDown') {
                if (this.commandHistoryIndex < this.commandHistory.length - 1) {
                    this.commandHistoryIndex++;
                    this.commandText = this.commandHistory[this.commandHistoryIndex] || '';
                } else {
                    this.commandHistoryIndex = this.commandHistory.length;
                    this.commandText = '';
                }
                this.render();
                return;
            }

            // 其他字符：添加到命令文本
            if (key.length === 1 && !ctrl) {
                this.commandText += key;
                this.render();
                return;
            }
        }

        /**
         * 处理Visual模式
         */
        _handleVisualMode(ev, eventContext) {
            // 验证事件对象
            if (!ev || typeof ev !== 'object') {
                return;
            }

            // Visual模式简化实现
            // 安全地获取事件属性
            const key = ev.key || '';

            // ESC键：退出Visual模式
            if (key === 'Escape') {
                this.mode = 'NORMAL';
                this.render();
                return;
            }

            // 方向键移动选择
            if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
                this._handleNormalMode(ev);
                return;
            }
        }

        /**
         * 执行命令
         */
        async _executeCommand(cmd) {
            const trimmedCmd = cmd.trim();
            if (!trimmedCmd) return;

            // 添加到命令历史
            this.commandHistory.push(trimmedCmd);
            if (this.commandHistory.length > 100) {
                this.commandHistory.shift();
            }
            this.commandHistoryIndex = this.commandHistory.length;

            const parts = trimmedCmd.split(/\s+/);
            const command = parts[0];

            try {
                switch (command) {
                    case 'w':
                    case 'write':
                        // 保存文件
                        if (parts.length > 1) {
                            // :w filename
                            const filename = parts.slice(1).join(' ');
                            const resolvedPath = this._resolvePath(this.cwd, filename);
                            const pathParts = this._parsePath(resolvedPath);
                            this.filePath = pathParts.dirPath;
                            this.fileName = pathParts.fileName;
                        }
                        await this.saveFile();
                        this.mode = 'NORMAL';
                        break;

                    case 'q':
                    case 'quit':
                        // 退出
                        if (this.modified) {
                            // 有未保存的修改，需要:wq或:q!
                            this.mode = 'NORMAL';
                            this.render();
                            return;
                        }
                        await this.cleanup();
                        await this._selfClose(this.pid);
                        break;

                    case 'wq':
                        // 保存并退出
                        if (parts.length > 1) {
                            const filename = parts.slice(1).join(' ');
                            const resolvedPath = this._resolvePath(this.cwd, filename);
                            const pathParts = this._parsePath(resolvedPath);
                            this.filePath = pathParts.dirPath;
                            this.fileName = pathParts.fileName;
                        }
                        await this.saveFile();
                        await this.cleanup();
                        await this._selfClose(this.pid);
                        break;

                    case 'q!':
                        // 强制退出
                        await this.cleanup();
                        await this._selfClose(this.pid);
                        break;

                    case 'e':
                    case 'edit':
                        // 打开文件
                        if (parts.length > 1) {
                            const filename = parts.slice(1).join(' ');
                            await this.openFile(filename);
                            this.mode = 'NORMAL';
                        }
                        break;

                    default:
                        this.mode = 'NORMAL';
                        this.render();
                        break;
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('Vim', '执行命令失败', error);
                }
                this.mode = 'NORMAL';
                this.render();
            }
        }

        /**
         * 调整光标列位置
         */
        _adjustCursorCol() {
            this._ensureValidState();
            const lineLength = this._getCurrentLine().length;
            if (this.cursorCol > lineLength) {
                this.cursorCol = lineLength;
            }
        }

        /**
         * 渲染界面
         */
        render() {
            if (!this.terminal) return;

            // 确保状态有效
            this._ensureValidState();

            // 清空终端
            this.terminal.clear();

            // 渲染文件内容
            for (let i = 0; i < this.lines.length; i++) {
                const line = this.lines[i] || '';
                const isCurrentLine = i === this.cursorRow;
                const safeLine = typeof line === 'string' ? line : '';
                
                if (isCurrentLine) {
                    // 当前行，显示光标
                    let html = '';
                    const lineClass = this.mode === 'INSERT' ? 'vim-line vim-line-insert' : 'vim-line vim-line-normal';
                    
                    for (let j = 0; j < safeLine.length; j++) {
                        if (j === this.cursorCol) {
                            const cursorClass = this.mode === 'INSERT' ? 'vim-cursor vim-cursor-insert' : 'vim-cursor';
                            html += `<span class="${cursorClass}">${this._escapeHtml(safeLine[j])}</span>`;
                        } else {
                            html += this._escapeHtml(safeLine[j]);
                        }
                    }
                    
                    // 如果光标在行尾
                    if (this.cursorCol >= safeLine.length) {
                        const cursorClass = this.mode === 'INSERT' ? 'vim-cursor vim-cursor-insert' : 'vim-cursor';
                        html += `<span class="${cursorClass}"> </span>`;
                    }
                    
                    this.terminal.write({ 
                        html: html, 
                        className: lineClass 
                    });
                } else {
                    // 普通行
                    this.terminal.write({ 
                        text: safeLine || ' ', 
                        className: 'vim-line vim-line-normal' 
                    });
                }
            }

            // 渲染状态行（始终在最后，固定在底部）
            const statusLine = this._getStatusLine();
            this.terminal.write({ 
                html: statusLine, 
                className: 'vim-status-line',
                style: {
                    position: 'sticky',
                    bottom: '0',
                    zIndex: '100'
                }
            });
        }

        /**
         * 获取状态行
         */
        _getStatusLine() {
            const modeText = this.mode === 'NORMAL' ? 'NORMAL' : 
                           this.mode === 'INSERT' ? 'INSERT' : 
                           this.mode === 'COMMAND' ? 'COMMAND' : 
                           this.mode === 'VISUAL' ? 'VISUAL' : 'NORMAL';
            
            const fileName = this.fileName || '[未命名]';
            const modified = this.modified ? '[已修改]' : '';
            
            let statusText = '';
            
            // 如果是命令模式，显示命令文本
            if (this.mode === 'COMMAND') {
                statusText = `:<span class="vim-mode">${this._escapeHtml(this.commandText || '')}</span>`;
            } else {
                statusText = `<span class="vim-mode">${modeText}</span> - <span class="vim-filename">${this._escapeHtml(fileName)}</span>`;
                if (modified) {
                    statusText += ` <span class="vim-modified">${modified}</span>`;
                }
                statusText += ` <span class="vim-position">行 ${this.cursorRow + 1}/${this.lines.length} | 列 ${this.cursorCol + 1}</span>`;
            }
            
            return statusText;
        }

        /**
         * HTML转义
         */
        _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

        /**
         * 自我关闭
         */
        async _selfClose(pid) {
            // 如果没有传递pid，使用this.pid
            const targetPid = pid || this.pid;
            if (!targetPid) {
                return;
            }

            let ProcessMgr = null;
            if (typeof ProcessManager !== 'undefined') {
                ProcessMgr = ProcessManager;
            } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                try {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                } catch (e) {
                    // 忽略错误
                }
            }

            if (ProcessMgr || this._kernelAPI) {
                try {
                    // 关闭自身时优先使用 kernelAPI.call（跳过调用栈校验，避免 VM 中运行导致 PID 校验失败）
                    if (targetPid === this.pid && this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                        await this._kernelAPI.call('Process.requestSelfTermination', []);
                    } else if (typeof ProcessMgr.callKernelAPI === 'function') {
                        await ProcessMgr.callKernelAPI(targetPid, 'Process.requestSelfTermination', []);
                    } else if (typeof ProcessMgr.requestSelfTermination === 'function') {
                        await ProcessMgr.requestSelfTermination(targetPid);
                    } else if (typeof ProcessMgr.killProgram === 'function') {
                        await ProcessMgr.killProgram(targetPid, true);
                    }
                } catch (error) {
                    if (ProcessMgr && typeof ProcessMgr.killProgram === 'function') {
                        try {
                            await ProcessMgr.killProgram(targetPid, true);
                        } catch (forceError) {}
                    }
                }
            }
        }

        /**
         * 清理资源
         */
        async cleanup() {
            // 注销事件处理器
            if (typeof EventManager !== 'undefined' && this.eventHandlerIds.length > 0) {
                for (const handlerId of this.eventHandlerIds) {
                    try {
                        EventManager.unregisterEventHandler(handlerId);
                    } catch (e) {
                        // 忽略错误
                    }
                }
                this.eventHandlerIds = [];
            }

            // 清空终端
            if (this.terminal) {
                this.terminal.clear();
            }
        }
    }

    // 注册到全局
    if (typeof window !== 'undefined') {
        window.VIM = VIM;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.VIM = VIM;
    }

    // 注册到 POOL（如果可用）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
                POOL.__INIT__("APPLICATION_SHARED_POOL");
            }
            POOL.__ADD__("APPLICATION_SHARED_POOL", "VIM", VIM);
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("VIM", `注册到 POOL 失败: ${e.message}`, e);
            }
        }
    }

})(window);