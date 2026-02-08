// ZerOS 内存编辑器 - 选择任意进程，以16进制方式查看并编辑堆内存
// 遵循 ZerOS 程序约定：IIFE、__init__、__exit__、__info__，禁止自动初始化

(function(window) {
    'use strict';

    const PROGRAM_NAME = 'MEMORYEDITER';
    const BYTES_PER_ROW = 16;
    const PAGE_SIZE = 256;
    const INITIAL_LOAD_SIZE = 1024;
    const ROWS_PER_FRAME = 12;

    const MEMORYEDITER = {
        pid: null,
        window: null,
        windowId: null,
        processSelect: null,
        heapSelect: null,
        hexContainer: null,
        gotoInput: null,
        statusBar: null,
        _processList: [],
        _memoryInfo: null,
        _currentOffset: 0,
        /** 已加载到的字节偏移（用于垂直滚动加载更多） */
        _loadedEndOffset: 0,
        _loadingMore: false,
        _refreshTimer: null,
        _processMemoryService: null,
        _askedAutoStartProcessMemory: false,
        /** 本实例是否由用户确认后拉起了 ProcessMemory 服务（退出时在恰当时候关闭该服务，不持久化） */
        _weStartedProcessMemoryService: false,
        /** 进程管理器注入的 kernelAPI（用于通过权限管控调用 Server.*） */
        _kernelAPI: null,
        /** 当前内存区域类型：heap | stack */
        _memoryType: 'heap',

        /** 获取 POOL > SERVER 的 ProcessMemory 服务；若未启动则在恰当时候询问用户是否由程序拉起服务（通过 kernelAPI 调用 Server.start，需 SERVER_SERVICE_MANAGE 权限） */
        _getProcessMemoryService: async function() {
            if (this._processMemoryService && typeof this._processMemoryService.getProcessMemoryInfo === 'function') {
                return this._processMemoryService;
            }
            if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                this._processMemoryService = POOL.__GET__('SERVER', 'ProcessMemory');
            }
            var hasValidService = this._processMemoryService && typeof this._processMemoryService.getProcessMemoryInfo === 'function';
            if (!hasValidService && !this._askedAutoStartProcessMemory) {
                this._askedAutoStartProcessMemory = true;
                var msg = this._getText('MEMORYEDITER_ASK_START_SERVICE', '需要 ProcessMemory 服务才能查看/编辑内存。是否自动启动该服务？');
                var userConfirm = false;
                if (typeof GUIManager !== 'undefined' && typeof GUIManager.showConfirm === 'function') {
                    userConfirm = await GUIManager.showConfirm(msg, this._getText('MEMORYEDITER_ASK_START_TITLE', '启动服务'), 'info');
                } else {
                    userConfirm = window.confirm(msg);
                }
                if (userConfirm && this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                    try {
                        await this._kernelAPI.call('Server.start', ['processmemory']);
                        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                            this._processMemoryService = POOL.__GET__('SERVER', 'ProcessMemory');
                        }
                        if (this._processMemoryService) {
                            this._weStartedProcessMemoryService = true;
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') KernelLogger.warn('MEMORYEDITER', '启动 ProcessMemory 服务失败', e);
                        if (typeof NotificationManager !== 'undefined') {
                            NotificationManager.createNotification(this.pid, this._getText('MEMORYEDITER_START_SERVICE_FAIL', '启动 ProcessMemory 服务失败') + (e.message ? ': ' + e.message : ''), 'error');
                        }
                    }
                } else if (userConfirm && (!this._kernelAPI || typeof this._kernelAPI.call !== 'function')) {
                    if (typeof NotificationManager !== 'undefined') {
                        NotificationManager.createNotification(this.pid, this._getText('MEMORYEDITER_START_SERVICE_FAIL', '启动 ProcessMemory 服务失败：内核 API 不可用'), 'error');
                    }
                }
            }
            return this._processMemoryService || null;
        },

        _getText: function(key, fallback) {
            if (typeof LanguagesExpansion !== 'undefined' && typeof LanguagesExpansion.getText === 'function') {
                const v = LanguagesExpansion.getText(key);
                if (v && v !== key) return v;
            }
            return fallback != null ? fallback : key;
        },

        _setStatus: function(text) {
            if (this.statusBar) this.statusBar.textContent = text || '';
        },

        /** 将堆单元值转为十六进制显示（2位）；null/undefined 显示为 -- 表示空闲槽位（未分配），非截断 */
        _valueToHex: function(v) {
            if (v === null || v === undefined) return '--';
            if (typeof v === 'number' && !Number.isNaN(v)) return ((v & 0xFF) + 0x100).toString(16).toUpperCase().slice(-2);
            if (typeof v === 'string' && v.length === 1) return (v.charCodeAt(0) + 0x100).toString(16).toUpperCase().slice(-2);
            return '??';
        },

        /** 将堆单元值转为 ASCII 显示 */
        _valueToAscii: function(v) {
            if (v === null || v === undefined) return '.';
            if (typeof v === 'number') return (v >= 32 && v <= 126) ? String.fromCharCode(v) : '.';
            if (typeof v === 'string' && v.length === 1) return (v.charCodeAt(0) >= 32 && v.charCodeAt(0) <= 126) ? v : '.';
            return '.';
        },

        /** 解析用户输入的十六进制字节为可写入的值（0-255 数字） */
        _parseHexByte: function(s) {
            const t = String(s).trim();
            if (/^[0-9a-fA-F]{1,2}$/.test(t)) return parseInt(t, 16);
            if (/^0x[0-9a-fA-F]{1,2}$/i.test(t)) return parseInt(t, 16);
            return null;
        },

        __init__: async function(pid, initArgs) {
            this.pid = pid;
            this._kernelAPI = (initArgs && initArgs.kernelAPI) || null;
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container') || document.body;

            this.window = document.createElement('div');
            this.window.className = 'memoryediter-window zos-gui-window';
            this.window.dataset.pid = pid.toString();
            this.window.setAttribute('role', 'application');
            this.window.setAttribute('aria-label', this._getText('MEMORYEDITER_TITLE', '内存编辑器'));

            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') icon = ApplicationAssetManager.getIcon('memoryediter');
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: this._getText('MEMORYEDITER_TITLE', '内存编辑器'),
                    icon: icon,
                    onClose: () => {}
                });
                if (windowInfo && windowInfo.windowId) this.windowId = windowInfo.windowId;
            }

            const toolbar = document.createElement('div');
            toolbar.className = 'memoryediter-toolbar';
            toolbar.setAttribute('role', 'toolbar');

            toolbar.innerHTML = `
                <label style="color: var(--theme-text, #d7e0dd); font-size: 13px;">进程</label>
                <select class="memoryediter-process-select" style="min-width: 180px; padding: 6px 10px; border-radius: 6px; background: rgba(20,20,30,0.8); color: var(--theme-text); border: 1px solid rgba(108,142,255,0.3);"></select>
                <label style="color: var(--theme-text); font-size: 13px;">类型</label>
                <select class="memoryediter-type-select" style="min-width: 72px; padding: 6px 10px; border-radius: 6px; background: rgba(20,20,30,0.8); color: var(--theme-text); border: 1px solid rgba(108,142,255,0.3);">
                    <option value="heap">堆</option>
                    <option value="stack">栈</option>
                </select>
                <label style="color: var(--theme-text); font-size: 13px;">区域</label>
                <select class="memoryediter-heap-select" style="min-width: 120px; padding: 6px 10px; border-radius: 6px; background: rgba(20,20,30,0.8); color: var(--theme-text); border: 1px solid rgba(108,142,255,0.3);"></select>
                <button type="button" class="memoryediter-refresh" style="padding: 6px 14px; border-radius: 6px; background: var(--theme-primary, #8b5cf6); color: #fff; border: none; cursor: pointer;">刷新</button>
                <label style="color: var(--theme-text); font-size: 13px;">跳转</label>
                <input type="text" class="memoryediter-goto" placeholder="0x0" style="width: 80px; padding: 6px 8px; border-radius: 6px; background: rgba(20,20,30,0.8); color: var(--theme-text); border: 1px solid rgba(108,142,255,0.3);">
            `;

            this.processSelect = toolbar.querySelector('.memoryediter-process-select');
            this.typeSelect = toolbar.querySelector('.memoryediter-type-select');
            this.heapSelect = toolbar.querySelector('.memoryediter-heap-select');
            this.gotoInput = toolbar.querySelector('.memoryediter-goto');
            var refreshBtn = toolbar.querySelector('.memoryediter-refresh');

            this.window.appendChild(toolbar);

            var main = document.createElement('div');
            main.className = 'memoryediter-body';
            main.setAttribute('role', 'main');
            this._bodyEl = main;
            this.hexContainer = document.createElement('div');
            this.hexContainer.className = 'memoryediter-hex-container';
            main.appendChild(this.hexContainer);
            this.window.appendChild(main);

            var statusBar = document.createElement('div');
            statusBar.className = 'memoryediter-statusbar';
            statusBar.setAttribute('role', 'status');
            statusBar.setAttribute('aria-live', 'polite');
            statusBar.textContent = this._getText('MEMORYEDITER_STATUS_READY', '就绪');
            this.statusBar = statusBar;
            this.window.appendChild(statusBar);

            guiContainer.appendChild(this.window);

            await this._loadProcessList();
            this._bindToolbarEvents(refreshBtn);
            this._refreshTimer = setInterval(() => this._loadProcessList(), 5000);
            /* 程序启动时若 ProcessMemory 服务未运行，在窗口显示后询问用户是否由程序拉起（仅一次/会话） */
            var self = this;
            setTimeout(function() {
                self._getProcessMemoryService().catch(function() {});
            }, 400);
        },

        _loadProcessList: async function() {
            if (typeof ProcessManager === 'undefined') return;
            if (!this.processSelect) return;
            var list = ProcessManager.listProcesses();
            if (!Array.isArray(list)) return;
            list = list.filter(function(p) { return p.status === 'running'; });
            this._processList = list;
            var prevPid = this.processSelect.value ? parseInt(this.processSelect.value, 10) : null;
            this.processSelect.innerHTML = '';
            var option0 = document.createElement('option');
            option0.value = '';
            option0.textContent = this._getText('MEMORYEDITER_SELECT_PROCESS', '选择进程');
            this.processSelect.appendChild(option0);
            list.forEach(function(p) {
                var pid = p.pid != null ? p.pid : (p.memoryInfo && p.memoryInfo.pid);
                if (pid == null) return;
                var name = p.programName || ('PID ' + pid);
                var opt = document.createElement('option');
                opt.value = String(pid);
                opt.textContent = name + ' (' + pid + ')';
                this.processSelect.appendChild(opt);
                if (prevPid === pid) this.processSelect.value = String(pid);
            }.bind(this));
        },

        _onProcessChange: async function() {
            if (!this.processSelect) return;
            var pidStr = this.processSelect.value;
            if (!pidStr) {
                if (this.heapSelect) this.heapSelect.innerHTML = '';
                if (this.hexContainer) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_SELECT_PROCESS', '选择进程') + '</div>';
                this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                return;
            }
            var svc = await this._getProcessMemoryService();
            if (!svc || typeof svc.getProcessMemoryInfo !== 'function') {
                if (this.heapSelect) this.heapSelect.innerHTML = '';
                if (this.hexContainer) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_SERVICE_REQUIRED', '请先在服务管理器中启动 ProcessMemory 服务') + '</div>';
                this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                return;
            }
            var targetPid = parseInt(pidStr, 10);
            try {
                var result = svc.getProcessMemoryInfo(targetPid);
                if (!result) {
                    this._memoryInfo = null;
                    if (this.heapSelect) this.heapSelect.innerHTML = '';
                    if (this.hexContainer) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_NO_HEAP', '该进程无堆内存') + '</div>';
                    this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                    return;
                }
                this._memoryInfo = result;
                this._memoryType = (this.typeSelect && this.typeSelect.value === 'stack') ? 'stack' : 'heap';
                this._fillRegionSelect(result);
                if (this._memoryType === 'stack') {
                    if (result.sheds && result.sheds.length > 0) {
                        this.heapSelect.value = String(result.sheds[0].stackId);
                        this._showStackView(result.sheds[0]);
                    } else {
                        if (this.hexContainer) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_NO_STACK', '该进程无栈') + '</div>';
                        this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                    }
                } else {
                    if (result.heaps && result.heaps.length > 0) {
                        this.heapSelect.value = String(result.heaps[0].heapId);
                        this._currentOffset = 0;
                        await this._loadHexView();
                    } else {
                        if (this.hexContainer) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_NO_HEAP', '该进程无堆内存') + '</div>';
                        this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                    }
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.error('MEMORYEDITER', 'getProcessMemoryInfo', e);
                if (this.hexContainer) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + (e.message || '加载失败') + '</div>';
                this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
            }
        },

        _fillRegionSelect: function(result) {
            if (!this.heapSelect) return;
            this.heapSelect.innerHTML = '';
            var type = (this.typeSelect && this.typeSelect.value === 'stack') ? 'stack' : 'heap';
            if (type === 'stack') {
                if (!result.sheds || result.sheds.length === 0) {
                    var opt0 = document.createElement('option');
                    opt0.value = '';
                    opt0.textContent = this._getText('MEMORYEDITER_NO_STACK', '无栈');
                    this.heapSelect.appendChild(opt0);
                    return;
                }
                result.sheds.forEach(function(s) {
                    var opt = document.createElement('option');
                    opt.value = String(s.stackId);
                    opt.textContent = 'Stack ' + s.stackId + ' (' + (s.stackSize || 0) + ' bytes)';
                    this.heapSelect.appendChild(opt);
                }.bind(this));
            } else {
                if (!result.heaps || result.heaps.length === 0) {
                    var o0 = document.createElement('option');
                    o0.value = '';
                    o0.textContent = this._getText('MEMORYEDITER_NO_HEAP', '无堆');
                    this.heapSelect.appendChild(o0);
                    return;
                }
                result.heaps.forEach(function(h) {
                    var opt = document.createElement('option');
                    opt.value = String(h.heapId);
                    opt.textContent = 'Heap ' + h.heapId + ' (' + (h.heapSizeNum || 0) + ' bytes)';
                    this.heapSelect.appendChild(opt);
                }.bind(this));
            }
        },

        _showStackView: function(shed) {
            if (!this.hexContainer) return;
            var size = shed.stackSize != null ? shed.stackSize : 0;
            var codeSize = shed.codeSize != null ? shed.codeSize : 0;
            var resourceSize = shed.resourceLinkSize != null ? shed.resourceLinkSize : 0;
            this.hexContainer.innerHTML = '<div class="memoryediter-placeholder memoryediter-stack-summary">' +
                '<div>' + this._getText('MEMORYEDITER_STACK_ID', '栈 ID') + ': ' + (shed.stackId || '') + '</div>' +
                '<div>' + this._getText('MEMORYEDITER_STACK_SIZE', '栈大小') + ': ' + size + ' bytes</div>' +
                '<div>' + this._getText('MEMORYEDITER_CODE_ITEMS', '代码项') + ': ' + codeSize + '</div>' +
                '<div>' + this._getText('MEMORYEDITER_RESOURCE_LINKS', '资源链接') + ': ' + resourceSize + '</div>' +
                '<div style="margin-top:0.5rem; color: var(--theme-text-muted);">' + this._getText('MEMORYEDITER_STACK_READONLY', '栈为只读摘要，不支持十六进制编辑。') + '</div></div>';
            this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
        },

        _loadHexView: async function(opts) {
            opts = opts || {};
            var append = !!opts.append;
            var startOffset = opts.startOffset != null ? opts.startOffset : (append ? this._loadedEndOffset : 0);
            var length = append ? PAGE_SIZE : INITIAL_LOAD_SIZE;
            if (!this.processSelect || !this.heapSelect) return;
            var pidStr = this.processSelect.value;
            var heapIdStr = this.heapSelect.value;
            if (!pidStr || !heapIdStr) return;
            var svc = await this._getProcessMemoryService();
            if (!svc || typeof svc.readProcessHeap !== 'function') {
                if (!append) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_SERVICE_REQUIRED', '请先在服务管理器中启动 ProcessMemory 服务') + '</div>';
                this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                return;
            }
            var targetPid = parseInt(pidStr, 10);
            var heapId = heapIdStr;
            var self = this;
            if (!append) this._setStatus(this._getText('MEMORYEDITER_STATUS_LOADING', '加载中...'));
            try {
                var rows = svc.readProcessHeap(targetPid, heapId, startOffset, length);
                if (append && (!rows || rows.length === 0)) {
                    this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                    return;
                }
                if (!append) this._setStatus(this._getText('MEMORYEDITER_STATUS_RENDERING', '正在渲染...'));
                this._renderHexRowsChunked(rows, targetPid, heapId, startOffset, append, function() {
                    var total = startOffset + (rows ? rows.length : 0);
                    self._loadedEndOffset = total;
                    self._setStatus(self._getText('MEMORYEDITER_STATUS_LOADED', '已加载') + ' ' + total + ' ' + (self._getText('MEMORYEDITER_BYTES', '字节')) + (append ? ' (' + self._getText('MEMORYEDITER_APPEND', '追加') + ')' : ''));
                });
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.error('MEMORYEDITER', 'readProcessHeap', e);
                if (!append) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + (e.message || '读取失败') + '</div>';
                this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
            }
        },

        _loadMoreHex: async function() {
            if (this._loadingMore) return;
            if (!this.processSelect || !this.heapSelect || !this.processSelect.value || !this.heapSelect.value) return;
            this._setStatus(this._getText('MEMORYEDITER_STATUS_LOADMORE', '加载更多...'));
            var svc = await this._getProcessMemoryService();
            if (!svc || typeof svc.readProcessHeap !== 'function') {
                this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                return;
            }
            this._loadingMore = true;
            var self = this;
            try {
                var targetPid = parseInt(this.processSelect.value, 10);
                var heapId = this.heapSelect.value;
                var rows = svc.readProcessHeap(targetPid, heapId, this._loadedEndOffset, PAGE_SIZE);
                if (rows && rows.length > 0) {
                    this._renderHexRows(rows, targetPid, heapId, this._loadedEndOffset, true);
                    this._loadedEndOffset += rows.length;
                    this._setStatus(this._getText('MEMORYEDITER_STATUS_LOADED', '已加载') + ' ' + this._loadedEndOffset + ' ' + this._getText('MEMORYEDITER_BYTES', '字节'));
                } else {
                    this._setStatus(this._getText('MEMORYEDITER_STATUS_END_OF_HEAP', '已加载至堆末尾 (共') + ' ' + this._loadedEndOffset + ' ' + this._getText('MEMORYEDITER_BYTES', '字节') + ')');
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.error('MEMORYEDITER', 'readProcessHeap (more)', e);
                this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
            }
            this._loadingMore = false;
        },

        _renderHexRowsChunked: function(rows, targetPid, heapId, baseOffset, append, callback) {
            var self = this;
            if (append) {
                this._renderHexRows(rows, targetPid, heapId, baseOffset, true);
                if (callback) callback();
                return;
            }
            this.hexContainer.innerHTML = '';
            if (!rows || rows.length === 0) {
                this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_EMPTY', '无数据') + '</div>';
                if (callback) callback();
                return;
            }
            var header = document.createElement('div');
            header.className = 'memoryediter-hex-header';
            header.setAttribute('role', 'row');
            var addrH = document.createElement('span');
            addrH.className = 'memoryediter-header-addr';
            addrH.textContent = this._getText('MEMORYEDITER_HEADER_ADDR', '地址');
            var hexH = document.createElement('span');
            hexH.className = 'memoryediter-header-hex';
            hexH.textContent = this._getText('MEMORYEDITER_HEADER_HEX', '十六进制');
            hexH.title = this._getText('MEMORYEDITER_LEGEND_HEX', '-- 表示空闲槽位（未分配），非截断；向下滚动可继续加载');
            var asciiH = document.createElement('span');
            asciiH.className = 'memoryediter-header-ascii';
            asciiH.textContent = 'ASCII';
            header.appendChild(addrH);
            header.appendChild(hexH);
            header.appendChild(asciiH);
            this.hexContainer.appendChild(header);

            var rowStart = 0;
            function renderChunk() {
                var end = Math.min(rowStart + ROWS_PER_FRAME * BYTES_PER_ROW, rows.length);
                for (; rowStart < end; rowStart += BYTES_PER_ROW) {
                    var rowCells = rows.slice(rowStart, rowStart + BYTES_PER_ROW);
                    var addr = rowCells[0] && rowCells[0].addr != null ? rowCells[0].addr : ('0x' + (baseOffset + rowStart).toString(16));
                    var rowEl = document.createElement('div');
                    rowEl.className = 'memoryediter-hex-row';
                    rowEl.setAttribute('role', 'row');
                    var addrSpan = document.createElement('span');
                    addrSpan.className = 'memoryediter-addr';
                    addrSpan.textContent = typeof addr === 'string' ? addr : ('0x' + Number(addr).toString(16));
                    rowEl.appendChild(addrSpan);
                    var hexSpan = document.createElement('span');
                    hexSpan.className = 'memoryediter-hex-bytes';
                    var asciiSpan = document.createElement('span');
                    asciiSpan.className = 'memoryediter-ascii';
                    for (var i = 0; i < BYTES_PER_ROW; i++) {
                        var cell = rowCells[i];
                        var byteEl = document.createElement('span');
                        byteEl.className = 'memoryediter-byte';
                        byteEl.dataset.offset = String(baseOffset + rowStart + i);
                        byteEl.setAttribute('role', 'gridcell');
                        byteEl.textContent = cell ? self._valueToHex(cell.data) : '  ';
                        byteEl.title = cell && (cell.data === null || cell.data === undefined)
                            ? self._getText('MEMORYEDITER_FREE_SLOT', '空闲槽位（未分配），可点击编辑写入')
                            : self._getText('MEMORYEDITER_CLICK_TO_EDIT', '点击编辑');
                        asciiSpan.appendChild(document.createTextNode(cell ? self._valueToAscii(cell.data) : ' '));
                        hexSpan.appendChild(byteEl);
                    }
                    rowEl.appendChild(hexSpan);
                    rowEl.appendChild(asciiSpan);
                    self.hexContainer.appendChild(rowEl);
                    (function(rStart, hSpan, aSpan) {
                        hSpan.querySelectorAll('.memoryediter-byte').forEach(function(el, idx) {
                            var offset = baseOffset + rStart + idx;
                            var asciiNode = aSpan.childNodes[idx];
                            if (typeof EventManager !== 'undefined') {
                                EventManager.registerElementEvent(self.pid, el, 'click', function() {
                                    self._editByte(targetPid, heapId, offset, el, asciiNode);
                                });
                            } else {
                                el.addEventListener('click', function() { self._editByte(targetPid, heapId, offset, el, asciiNode); });
                            }
                        });
                    })(rowStart, hexSpan, asciiSpan);
                }
                if (rowStart < rows.length) {
                    requestAnimationFrame(renderChunk);
                } else {
                    if (callback) callback();
                }
            }
            requestAnimationFrame(renderChunk);
        },

        _renderHexRows: function(rows, targetPid, heapId, baseOffset, append) {
            if (!append) {
                this.hexContainer.innerHTML = '';
                if (!rows || rows.length === 0) {
                    this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_EMPTY', '无数据') + '</div>';
                    return;
                }
                var header = document.createElement('div');
                header.className = 'memoryediter-hex-header';
                header.setAttribute('role', 'row');
                var addrH = document.createElement('span');
                addrH.className = 'memoryediter-header-addr';
                addrH.textContent = this._getText('MEMORYEDITER_HEADER_ADDR', '地址');
                var hexH = document.createElement('span');
                hexH.className = 'memoryediter-header-hex';
                hexH.textContent = this._getText('MEMORYEDITER_HEADER_HEX', '十六进制');
                hexH.title = this._getText('MEMORYEDITER_LEGEND_HEX', '-- 表示空闲槽位（未分配），非截断；向下滚动可继续加载');
                var asciiH = document.createElement('span');
                asciiH.className = 'memoryediter-header-ascii';
                asciiH.textContent = 'ASCII';
                header.appendChild(addrH);
                header.appendChild(hexH);
                header.appendChild(asciiH);
                this.hexContainer.appendChild(header);
            } else if (!rows || rows.length === 0) {
                return;
            }

            for (var rowStart = 0; rowStart < rows.length; rowStart += BYTES_PER_ROW) {
                var rowCells = rows.slice(rowStart, rowStart + BYTES_PER_ROW);
                var addr = rowCells[0] && rowCells[0].addr != null ? rowCells[0].addr : ('0x' + (baseOffset + rowStart).toString(16));
                var rowEl = document.createElement('div');
                rowEl.className = 'memoryediter-hex-row';
                rowEl.setAttribute('role', 'row');
                var addrSpan = document.createElement('span');
                addrSpan.className = 'memoryediter-addr';
                addrSpan.textContent = typeof addr === 'string' ? addr : ('0x' + Number(addr).toString(16));
                rowEl.appendChild(addrSpan);

                var hexSpan = document.createElement('span');
                hexSpan.className = 'memoryediter-hex-bytes';
                var asciiSpan = document.createElement('span');
                asciiSpan.className = 'memoryediter-ascii';

                for (var i = 0; i < BYTES_PER_ROW; i++) {
                    var cell = rowCells[i];
                    var byteEl = document.createElement('span');
                    byteEl.className = 'memoryediter-byte';
                    byteEl.dataset.offset = String(baseOffset + rowStart + i);
                    byteEl.setAttribute('role', 'gridcell');
                    byteEl.textContent = cell ? this._valueToHex(cell.data) : '  ';
                    byteEl.title = cell && (cell.data === null || cell.data === undefined)
                        ? this._getText('MEMORYEDITER_FREE_SLOT', '空闲槽位（未分配），可点击编辑写入')
                        : this._getText('MEMORYEDITER_CLICK_TO_EDIT', '点击编辑');
                    asciiSpan.appendChild(document.createTextNode(cell ? this._valueToAscii(cell.data) : ' '));
                    hexSpan.appendChild(byteEl);
                }
                rowEl.appendChild(hexSpan);
                rowEl.appendChild(asciiSpan);
                this.hexContainer.appendChild(rowEl);

                var self = this;
                hexSpan.querySelectorAll('.memoryediter-byte').forEach(function(el, i) {
                    var offset = baseOffset + rowStart + i;
                    var asciiNode = asciiSpan.childNodes[i];
                    if (typeof EventManager !== 'undefined') {
                        EventManager.registerElementEvent(self.pid, el, 'click', function() {
                            self._editByte(targetPid, heapId, offset, el, asciiNode);
                        });
                    } else {
                        el.addEventListener('click', function() { self._editByte(targetPid, heapId, offset, el, asciiNode); });
                    }
                });
            }
        },

        _editByte: async function(targetPid, heapId, offset, byteEl, asciiNode) {
            var current = byteEl.textContent.trim();
            var newVal = null;
            if (typeof GUIManager !== 'undefined' && typeof GUIManager.showPrompt === 'function') {
                newVal = await GUIManager.showPrompt(this._getText('MEMORYEDITER_ENTER_HEX', '输入新值 (十六进制 00-FF):'), this._getText('MEMORYEDITER_EDIT_BYTE', '编辑字节'), current);
            } else {
                newVal = window.prompt(this._getText('MEMORYEDITER_ENTER_HEX', '输入新值 (十六进制 00-FF):'), current);
            }
            if (newVal === null || newVal === undefined) return;
            const num = this._parseHexByte(newVal);
            if (num === null) {
                if (typeof NotificationManager !== 'undefined') NotificationManager.createNotification(this.pid, this._getText('MEMORYEDITER_INVALID_HEX', '无效的十六进制字节'), 'warn');
                return;
            }
            const svc = await this._getProcessMemoryService();
            if (!svc || typeof svc.writeProcessHeap !== 'function') {
                if (typeof NotificationManager !== 'undefined') NotificationManager.createNotification(this.pid, this._getText('MEMORYEDITER_SERVICE_REQUIRED', '请先在服务管理器中启动 ProcessMemory 服务'), 'warn');
                return;
            }
            try {
                const ok = svc.writeProcessHeap(targetPid, heapId, offset, num);
                if (ok) {
                    byteEl.textContent = ((num & 0xFF) + 0x100).toString(16).toUpperCase().slice(-2);
                    if (asciiNode) asciiNode.textContent = (num >= 32 && num <= 126) ? String.fromCharCode(num) : '.';
                } else {
                    if (typeof NotificationManager !== 'undefined') NotificationManager.createNotification(this.pid, this._getText('MEMORYEDITER_WRITE_FAIL', '写入失败'), 'error');
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') KernelLogger.error('MEMORYEDITER', 'writeProcessHeap', e);
                if (typeof NotificationManager !== 'undefined') NotificationManager.createNotification(this.pid, (e.message || '写入失败'), 'error');
            }
        },

        _onRegionChange: function() {
            var self = this;
            if (this._memoryType === 'stack') {
                if (!this.heapSelect || !this.heapSelect.value || !this._memoryInfo || !this._memoryInfo.sheds) return;
                var stackIdStr = this.heapSelect.value;
                for (var i = 0; i < this._memoryInfo.sheds.length; i++) {
                    if (String(this._memoryInfo.sheds[i].stackId) === stackIdStr) {
                        this._showStackView(this._memoryInfo.sheds[i]);
                        return;
                    }
                }
                return;
            }
            this._loadHexView();
        },

        _onTypeChange: function() {
            this._memoryType = (this.typeSelect && this.typeSelect.value === 'stack') ? 'stack' : 'heap';
            if (!this._memoryInfo) return;
            this._fillRegionSelect(this._memoryInfo);
            if (this._memoryType === 'stack') {
                if (this._memoryInfo.sheds && this._memoryInfo.sheds.length > 0) {
                    this.heapSelect.value = String(this._memoryInfo.sheds[0].stackId);
                    this._showStackView(this._memoryInfo.sheds[0]);
                } else {
                    if (this.hexContainer) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_NO_STACK', '该进程无栈') + '</div>';
                    this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                }
            } else {
                if (this._memoryInfo.heaps && this._memoryInfo.heaps.length > 0) {
                    this.heapSelect.value = String(this._memoryInfo.heaps[0].heapId);
                    this._currentOffset = 0;
                    this._loadHexView();
                } else {
                    if (this.hexContainer) this.hexContainer.innerHTML = '<div class="memoryediter-placeholder">' + this._getText('MEMORYEDITER_NO_HEAP', '该进程无堆内存') + '</div>';
                    this._setStatus(this._getText('MEMORYEDITER_STATUS_READY', '就绪'));
                }
            }
        },

        _bindToolbarEvents: function(refreshBtn) {
            var self = this;
            var bind = function(el, ev, fn) {
                if (typeof EventManager !== 'undefined' && el) EventManager.registerElementEvent(self.pid, el, ev, fn);
                else if (el) el.addEventListener(ev, fn);
            };
            bind(this.processSelect, 'change', function() { self._onProcessChange(); });
            if (this.typeSelect) bind(this.typeSelect, 'change', function() { self._onTypeChange(); });
            bind(this.heapSelect, 'change', function() { self._onRegionChange(); });
            bind(refreshBtn, 'click', function() {
                if (self._memoryType === 'stack' && self._memoryInfo && self.heapSelect && self.heapSelect.value) {
                    var stackIdStr = self.heapSelect.value;
                    for (var i = 0; i < (self._memoryInfo.sheds || []).length; i++) {
                        if (String(self._memoryInfo.sheds[i].stackId) === stackIdStr) {
                            self._showStackView(self._memoryInfo.sheds[i]);
                            return;
                        }
                    }
                } else {
                    self._loadHexView();
                }
            });
            bind(this.gotoInput, 'keydown', function(e) { if (e.key === 'Enter') self._gotoOffset(); });
            if (this._bodyEl) {
                var scrollThrottle = null;
                bind(this._bodyEl, 'scroll', function() {
                    if (scrollThrottle) return;
                    scrollThrottle = requestAnimationFrame(function() {
                        scrollThrottle = null;
                        var el = self._bodyEl;
                        if (!el || !el.parentElement) return;
                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) self._loadMoreHex();
                    });
                });
            }
        },

        _gotoOffset: function() {
            if (this._memoryType === 'stack') return;
            var s = (this.gotoInput && this.gotoInput.value) || '';
            var t = s.trim();
            var num = 0;
            if (/^0x[0-9a-fA-F]+$/.test(t)) num = parseInt(t, 16);
            else if (/^\d+$/.test(t)) num = parseInt(t, 10);
            else return;
            this._currentOffset = Math.max(0, num);
            this._loadHexView({ startOffset: this._currentOffset });
        },

        __exit__: async function() {
            if (this._refreshTimer) {
                clearInterval(this._refreshTimer);
                this._refreshTimer = null;
            }
            if (typeof EventManager !== 'undefined' && this.pid) EventManager.unregisterAllHandlersForPid(this.pid);
            if (typeof GUIManager !== 'undefined') {
                if (this.windowId) await GUIManager.unregisterWindow(this.windowId);
                else if (this.pid) await GUIManager.unregisterWindow(this.pid);
            }
            if (this.window && this.window.parentElement) this.window.parentElement.removeChild(this.window);
            this.window = null;
            this.processSelect = null;
            this.typeSelect = null;
            this.heapSelect = null;
            this.hexContainer = null;
            this.gotoInput = null;
            this.statusBar = null;
            this._bodyEl = null;
            this._processMemoryService = null;
            this._askedAutoStartProcessMemory = false;
            /* 若本实例由用户确认后拉起了 ProcessMemory 服务，在恰当时候关闭服务（不持久化，仅本次会话；通过 kernelAPI 调用 Server.stop） */
            if (this._weStartedProcessMemoryService && this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                try {
                    await this._kernelAPI.call('Server.stop', ['processmemory']);
                    if (typeof KernelLogger !== 'undefined') KernelLogger.info('MEMORYEDITER', '已关闭由本程序拉起的 ProcessMemory 服务');
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') KernelLogger.warn('MEMORYEDITER', '关闭 ProcessMemory 服务时异常', e);
                }
            }
            this._weStartedProcessMemoryService = false;
            this._kernelAPI = null;
        },

        __info__: function() {
            return {
                name: 'memoryediter',
                type: 'GUI',
                version: '1.0.0',
                description: this._getText('MEMORYEDITER_DESC', '内存编辑器 - 查看并编辑进程堆内存'),
                author: 'ZerOS',
                copyright: '© ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.SERVER_SERVICE_MANAGE  // 通过 kernelAPI 启动/停止 ProcessMemory 服务（最高等级）
                ] : [],
                metadata: { allowMultipleInstances: true }
            };
        }
    };

    if (typeof window !== 'undefined') window[PROGRAM_NAME] = MEMORYEDITER;
    else if (typeof globalThis !== 'undefined') globalThis[PROGRAM_NAME] = MEMORYEDITER;
})(typeof window !== 'undefined' ? window : globalThis);
