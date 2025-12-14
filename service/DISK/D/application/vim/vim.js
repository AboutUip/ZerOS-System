/* Vim 编辑器实现
 * 功能要求：
 * 1. 尽可能还原vim功能
 * 2. 所有数据操作（包括常量）都转接到内核管理
 * 3. 动态数据申请MemoryManager类的栈内存
 * 4. 美化界面，实现简单的命令行图形化输出
 */

(function(window) {
    'use strict';

    // 模式枚举 - 存储在栈内存中
    let MODE_NORMAL = 0;
    let MODE_INSERT = 1;
    let MODE_COMMAND = 2;
    let MODE_VISUAL = 3;

    // Vim主类
    class Vim {
        constructor(terminalWrite, terminalEnv, pid = null) {
            this.terminalWrite = terminalWrite;
            this.terminalEnv = terminalEnv;
            this.pid = pid;  // 存储ProcessManager分配的PID
            
            // 注意：内存管理将在__init__中初始化，因为需要pid
            // 这里不调用_initMemory()，等待pid被设置后再初始化
            
            // 编辑器状态（将存储在栈内存中）
            this.mode = MODE_NORMAL; // 当前模式
            this.lines = []; // 文件内容（存储在堆内存）- 保留作为缓存
            this.linePointers = []; // 行指针数组（存储到堆内存的地址）
            this.cursorRow = 0; // 当前行（从0开始）- 存储在栈内存
            this.cursorCol = 0; // 当前列（从0开始）- 存储在栈内存
            this.commandBuffer = ''; // 命令缓冲区 - 存储在栈内存
            this.commandBufferAddr = null; // 命令缓冲区地址
            this.filename = null; // 当前文件名 - 存储在栈内存
            this.filenameAddr = null; // 文件名地址
            this.filePath = null; // 当前文件路径 - 存储在栈内存
            this.filePathAddr = null; // 文件路径地址
            this.unsavedChanges = false; // 是否有未保存更改 - 存储在栈内存
            this.scrollOffset = 0; // 滚动偏移 - 存储在栈内存
            this.visualStartRow = -1; // 视觉模式起始行 - 存储在栈内存
            this.visualStartCol = -1; // 视觉模式起始列 - 存储在栈内存
            this.yankBuffer = ''; // 复制缓冲区（存储在堆内存）
            this.yankBufferAddr = null; // 复制缓冲区地址
            
            // 显示配置
            this.viewRows = 20; // 可见行数
            this.viewCols = 80; // 可见列数
            
            // Vim输出容器标记
            this._vimContainerId = 'vim-container-' + Date.now();
            this._renderCount = 0;
            this._vimContainerElement = null; // 保存DOM元素引用
            
            // 绑定键盘事件
            this._bindEvents();
        }

        // 初始化内存管理
        _initMemory(pid) {
            if (!pid) {
                console.error('Vim: PID not available');
                return;
            }
            
            // 安全访问MemoryManager
            let MemoryMgr = null;
            try {
                if (typeof MemoryManager !== 'undefined') {
                    MemoryMgr = MemoryManager;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    MemoryMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'MemoryManager');
                } else if (typeof window !== 'undefined' && window.POOL && typeof window.POOL.__GET__ === 'function') {
                    MemoryMgr = window.POOL.__GET__('KERNEL_GLOBAL_POOL', 'MemoryManager');
                }
            } catch (e) {
                console.error('Vim: Error accessing MemoryManager', e);
            }
            
            if (!MemoryMgr) {
                console.error('Vim: MemoryManager not available');
                return;
            }
            
            // 分配栈内存用于存储常量和状态数据
            try {
                MemoryMgr.allocateMemory(-1, 1, -1, pid);
            } catch (e) {
                console.error('Vim: Error allocating stack memory', e);
            }
            
            // 分配堆内存用于存储文件内容（增大堆内存以支持更大的文件）
            try {
                MemoryMgr.allocateMemory(1, -1, 50000, pid);
            } catch (e) {
                console.error('Vim: Error allocating heap memory', e);
            }
            
            // 注册程序名称（如果还未注册）
            if (typeof MemoryMgr.registerProgramName === 'function') {
                try {
                    MemoryMgr.registerProgramName(pid, 'Vim');
                } catch (e) {
                    // 可能已经注册，忽略错误
                }
            }
            
            // 获取堆和栈引用
            try {
                const appSpace = MemoryMgr.APPLICATION_SOP.get(pid);
                if (appSpace) {
                    this._heap = appSpace.heaps ? appSpace.heaps.get(1) : null;
                    this._shed = appSpace.sheds ? appSpace.sheds.get(1) : null;
                }
            } catch (e) {
                console.error('Vim: Error getting memory references', e);
            }
        }
        
        // 从堆内存读取字符串（通过地址）- 使用批量读取优化
        _readStringFromHeap(addr) {
            if (!this._heap || !addr) return null;
            
            // 安全访问Heap类
            let HeapClass = null;
            try {
                if (typeof Heap !== 'undefined') {
                    HeapClass = Heap;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    HeapClass = POOL.__GET__('KERNEL_GLOBAL_POOL', 'Heap');
                } else if (typeof window !== 'undefined' && window.POOL && typeof window.POOL.__GET__ === 'function') {
                    HeapClass = window.POOL.__GET__('KERNEL_GLOBAL_POOL', 'Heap');
                }
            } catch (e) {
                console.error('Vim: Error accessing Heap', e);
            }
            
            if (!HeapClass || typeof HeapClass.addressing !== 'function') {
                // 降级：直接使用堆的readString方法（如果可用）
                try {
                    if (typeof this._heap.readString === 'function') {
                        return this._heap.readString(addr, this._heap.heapSize);
                    }
                } catch (e) {
                    console.error('Vim: Error reading string from heap (fallback)', e);
                }
                return null;
            }
            
            try {
                const startIdx = HeapClass.addressing(addr, 10);
                if (startIdx < 0 || startIdx >= this._heap.heapSize) return null;
                
                // 首先检查是否为预留块，如果是，读取元信息
                const firstData = this._heap.memoryDataList[startIdx];
                if (firstData && typeof firstData === 'object' && firstData.__reserved) {
                    // 这是一个预留块，我们需要找到base地址
                    const baseIdx = firstData.base;
                    const length = firstData.length - 1; // 减去结束符
                    
                    // 使用批量读取方法
                    const baseAddr = HeapClass.addressing(baseIdx, 16);
                    const str = this._heap.readString(baseAddr, length);
                    return str;
                } else {
                    // 直接使用批量读取方法，最多读取剩余堆大小
                    const maxLength = this._heap.heapSize - startIdx;
                    const str = this._heap.readString(addr, maxLength);
                    return str;
                }
            } catch (e) {
                console.error('Vim: Error reading string from heap', e);
                return null;
            }
        }
        
        // 写入字符串到堆内存，返回地址
        _writeStringToHeap(str) {
            if (!this._heap || !str) return null;
            
            // 安全访问Heap类
            let HeapClass = null;
            try {
                if (typeof Heap !== 'undefined') {
                    HeapClass = Heap;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    HeapClass = POOL.__GET__('KERNEL_GLOBAL_POOL', 'Heap');
                } else if (typeof window !== 'undefined' && window.POOL && typeof window.POOL.__GET__ === 'function') {
                    HeapClass = window.POOL.__GET__('KERNEL_GLOBAL_POOL', 'Heap');
                }
            } catch (e) {
                console.error('Vim: Error accessing Heap', e);
            }
            
            if (!HeapClass || typeof HeapClass.addressing !== 'function') {
                console.error('Vim: Heap.addressing not available');
                return null;
            }
            
            try {
                const length = str.length;
                const addr = this._heap.alloc(length + 1);
                if (!addr) return null;
                
                const startIdx = HeapClass.addressing(addr, 10);
                if (startIdx < 0 || startIdx >= this._heap.heapSize) return null;
                
                // 写入字符串字符
                for (let i = 0; i < length; i++) {
                    if (startIdx + i < this._heap.heapSize) {
                        this._heap.writeData(HeapClass.addressing(startIdx + i, 16), str[i]);
                    }
                }
                
                // 写入结束符
                if (startIdx + length < this._heap.heapSize) {
                    this._heap.writeData(HeapClass.addressing(startIdx + length, 16), '\0');
                }
                
                return addr;
            } catch (e) {
                console.error('Vim: Error writing string to heap', e);
                return null;
            }
        }
        
        // 更新堆内存中的字符串
        _updateStringInHeap(addr, newStr) {
            if (!this._heap || !addr || !newStr) return false;
            
            // 安全访问Heap类
            let HeapClass = null;
            try {
                if (typeof Heap !== 'undefined') {
                    HeapClass = Heap;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    HeapClass = POOL.__GET__('KERNEL_GLOBAL_POOL', 'Heap');
                } else if (typeof window !== 'undefined' && window.POOL && typeof window.POOL.__GET__ === 'function') {
                    HeapClass = window.POOL.__GET__('KERNEL_GLOBAL_POOL', 'Heap');
                }
            } catch (e) {
                console.error('Vim: Error accessing Heap', e);
            }
            
            if (!HeapClass || typeof HeapClass.addressing !== 'function') {
                console.error('Vim: Heap.addressing not available');
                return false;
            }
            
            try {
                // 先读取旧字符串的长度
                const oldStr = this._readStringFromHeap(addr);
                const oldLength = oldStr ? oldStr.length : 0;
                const newLength = newStr.length;
                
                // 如果新字符串更短或相等，可以直接覆盖
                if (newLength <= oldLength) {
                    const startIdx = HeapClass.addressing(addr, 10);
                    for (let i = 0; i < newLength; i++) {
                        if (startIdx + i < this._heap.heapSize) {
                            this._heap.writeData(HeapClass.addressing(startIdx + i, 16), newStr[i]);
                        }
                    }
                    // 更新结束符
                    if (startIdx + newLength < this._heap.heapSize) {
                        this._heap.writeData(HeapClass.addressing(startIdx + newLength, 16), '\0');
                    }
                    return true;
                } else {
                    // 新字符串更长，需要重新分配
                    // 释放旧内存
                    if (oldLength > 0 && typeof this._heap.free === 'function') {
                        try {
                            this._heap.free(addr, oldLength + 1);
                        } catch (e) {
                            console.error('Vim: Error freeing old memory', e);
                        }
                    }
                    // 分配新内存并写入
                    const newAddr = this._writeStringToHeap(newStr);
                    return newAddr ? newAddr : false;
                }
            } catch (e) {
                console.error('Vim: Error updating string in heap', e);
                return false;
            }
        }

        // 从栈内存加载常量并初始化状态数据
        _loadConstants(pid) {
            if (!pid) return;
            
            // 安全访问MemoryManager
            let MemoryMgr = null;
            try {
                if (typeof MemoryManager !== 'undefined') {
                    MemoryMgr = MemoryManager;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    MemoryMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'MemoryManager');
                } else if (typeof window !== 'undefined' && window.POOL && typeof window.POOL.__GET__ === 'function') {
                    MemoryMgr = window.POOL.__GET__('KERNEL_GLOBAL_POOL', 'MemoryManager');
                }
            } catch (e) {
                console.error('Vim: Error accessing MemoryManager', e);
            }
            
            if (!MemoryMgr) return;
            
            const appSpace = MemoryMgr.APPLICATION_SOP.get(pid);
            if (!appSpace || !appSpace.sheds) return;
            
            const shed = appSpace.sheds.get(1);
            if (!shed) return;
            
            // 在栈内存中存储常量
            if (shed.codeArea.length === 0) {
                shed.writeCode('MODE_NORMAL=0');
                shed.writeCode('MODE_INSERT=1');
                shed.writeCode('MODE_COMMAND=2');
                shed.writeCode('MODE_VISUAL=3');
            }
            
            // 解析常量
            for (let i = 0; i < shed.codeArea.length; i++) {
                const line = shed.readCode(i);
                if (line && typeof line === 'string') {
                    if (line.startsWith('MODE_NORMAL=')) {
                        MODE_NORMAL = parseInt(line.split('=')[1]) || 0;
                    } else if (line.startsWith('MODE_INSERT=')) {
                        MODE_INSERT = parseInt(line.split('=')[1]) || 1;
                    } else if (line.startsWith('MODE_COMMAND=')) {
                        MODE_COMMAND = parseInt(line.split('=')[1]) || 2;
                    } else if (line.startsWith('MODE_VISUAL=')) {
                        MODE_VISUAL = parseInt(line.split('=')[1]) || 3;
                    }
                }
            }
            
            // 将编辑器状态存储到栈内存的resourceLinkArea中
            this._saveStateToStack();
        }
        
        // 将编辑器状态保存到栈内存
        _saveStateToStack() {
            if (!this._shed) return;
            
            try {
                // 将状态数据存储到resourceLinkArea
                this._shed.writeResourceLink('mode', String(this.mode));
                this._shed.writeResourceLink('cursorRow', String(this.cursorRow));
                this._shed.writeResourceLink('cursorCol', String(this.cursorCol));
                this._shed.writeResourceLink('scrollOffset', String(this.scrollOffset));
                this._shed.writeResourceLink('visualStartRow', String(this.visualStartRow));
                this._shed.writeResourceLink('visualStartCol', String(this.visualStartCol));
                this._shed.writeResourceLink('unsavedChanges', String(this.unsavedChanges));
                this._shed.writeResourceLink('viewRows', String(this.viewRows));
                this._shed.writeResourceLink('viewCols', String(this.viewCols));
            } catch (e) {
                console.error('Vim: Error saving state to stack', e);
            }
        }
        
        // 从栈内存加载编辑器状态
        _loadStateFromStack() {
            if (!this._shed) return;
            
            try {
                const modeStr = this._shed.readResourceLink('mode');
                if (modeStr) this.mode = parseInt(modeStr) || MODE_NORMAL;
                
                const cursorRowStr = this._shed.readResourceLink('cursorRow');
                if (cursorRowStr) this.cursorRow = parseInt(cursorRowStr) || 0;
                
                const cursorColStr = this._shed.readResourceLink('cursorCol');
                if (cursorColStr) this.cursorCol = parseInt(cursorColStr) || 0;
                
                const scrollOffsetStr = this._shed.readResourceLink('scrollOffset');
                if (scrollOffsetStr) this.scrollOffset = parseInt(scrollOffsetStr) || 0;
                
                const visualStartRowStr = this._shed.readResourceLink('visualStartRow');
                if (visualStartRowStr) this.visualStartRow = parseInt(visualStartRowStr) || -1;
                
                const visualStartColStr = this._shed.readResourceLink('visualStartCol');
                if (visualStartColStr) this.visualStartCol = parseInt(visualStartColStr) || -1;
                
                const unsavedChangesStr = this._shed.readResourceLink('unsavedChanges');
                if (unsavedChangesStr) this.unsavedChanges = unsavedChangesStr === 'true';
                
                const viewRowsStr = this._shed.readResourceLink('viewRows');
                if (viewRowsStr) this.viewRows = parseInt(viewRowsStr) || 20;
                
                const viewColsStr = this._shed.readResourceLink('viewCols');
                if (viewColsStr) this.viewCols = parseInt(viewColsStr) || 80;
            } catch (e) {
                console.error('Vim: Error loading state from stack', e);
            }
        }

            // 打开文件（异步，从 PHP 服务读取）
            async openFile(filepath) {
                if (!filepath) {
                    this.lines = [''];
                    this.filename = '[No Name]';
                    this.filePath = null;
                    this.unsavedChanges = false;
                    this.cursorRow = 0;
                    this.cursorCol = 0;
                    return; // 不在这里渲染，让调用者控制
                }

                // 解析路径（如果已经是绝对路径，直接使用；否则相对于当前工作目录解析）
                let resolved;
                if (/^[A-Za-z]:/.test(filepath)) {
                    // 已经是绝对路径，直接使用（但需要规范化）
                    resolved = filepath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
                } else {
                    // 相对路径，需要解析
                    resolved = this._resolvePath(this.terminalEnv.cwd, filepath);
                }
                console.log(`Vim: openFile - cwd: ${this.terminalEnv.cwd}, filepath: ${filepath}, resolved: ${resolved}`);
                
                const parts = resolved.split('/');
                const root = parts[0];
                const fileName = parts[parts.length - 1];
                const parentPath = parts.slice(0, -1).join('/') || root;
                
                console.log(`Vim: Path parts - root: ${root}, fileName: ${fileName}, parentPath: ${parentPath}`);
                
                // 确保路径格式正确
                let phpPath = parentPath;
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }
                
                console.log(`Vim: Final phpPath: ${phpPath}`);
                
                // 从 PHP 服务读取文件
                try {
                    const url = new URL('/service/FSDirve.php', window.location.origin);
                    url.searchParams.set('action', 'read_file');
                    url.searchParams.set('path', phpPath);
                    url.searchParams.set('fileName', fileName);
                    
                    console.log(`Vim: Reading file - resolved: ${resolved}, phpPath: ${phpPath}, fileName: ${fileName}`);
                    console.log(`Vim: Request URL: ${url.toString()}`);
                    
                    const response = await fetch(url.toString());
                    
                    if (!response.ok) {
                        // 尝试读取错误响应
                        let errorMessage = response.statusText;
                        try {
                            const errorResult = await response.json();
                            errorMessage = errorResult.message || errorMessage;
                        } catch (e) {
                            // 忽略 JSON 解析错误
                        }
                        
                        console.error(`Vim: HTTP error ${response.status}: ${errorMessage}`);
                        
                        // 文件不存在，创建新文件
                        if (response.status === 404) {
                            this.lines = [''];
                            this.filename = fileName;
                            this.filePath = resolved;
                            this.unsavedChanges = false;
                            this.terminalWrite(`Vim: File ${fileName} does not exist, creating new file`);
                            this.cursorRow = 0;
                            this.cursorCol = 0;
                            return;
                        } else {
                            this.terminalWrite(`Vim: Error reading file: ${errorMessage} (HTTP ${response.status})`);
                            return;
                        }
                    }
                    
                    const result = await response.json();
                    
                    console.log(`Vim: Response status: ${result.status}, has data: ${!!result.data}, has content: ${!!(result.data && result.data.content)}`);
                    
                    if (result.status !== 'success' || !result.data || !result.data.content) {
                        // 文件不存在，创建新文件
                        const errorMsg = result.message || 'File not found';
                        console.error(`Vim: File read failed: ${errorMsg}`);
                        this.lines = [''];
                        this.filename = fileName;
                        this.filePath = resolved;
                        this.unsavedChanges = false;
                        this.terminalWrite(`Vim: File ${fileName} does not exist, creating new file`);
                        this.cursorRow = 0;
                        this.cursorCol = 0;
                        return;
                    }
                    
                    const content = result.data.content;
                    
                    // 调试信息
                    console.log(`Vim: Reading file ${resolved}, content type: ${typeof content}, length: ${content ? content.length : 0}`);
                    
                    // 确保 content 是字符串类型
                    const contentStr = typeof content === 'string' ? content : String(content || '');
                    
                    // 调试信息
                    console.log(`Vim: File content length: ${contentStr.length}, first 100 chars: ${contentStr.substring(0, 100)}`);
                    
                    // 解析文件内容到堆内存
                    this._loadContentToHeap(contentStr);
                    this.filename = fileName;
                    this.filePath = resolved;
                    this.unsavedChanges = false;
                    
                    // 调试信息
                    console.log(`Vim: Loaded ${this.lines.length} lines from file`);
                    
                    this.cursorRow = 0;
                    this.cursorCol = 0;
                } catch (e) {
                    this.terminalWrite(`Vim: Error opening file: ${e.message || e}`);
                    console.error('Vim: Error opening file', e);
                }
            }

        // 将内容加载到堆内存
        _loadContentToHeap(content) {
            // 先清空现有的行指针
            this._freeAllLines();
            
            // 确保 content 是字符串
            const contentStr = typeof content === 'string' ? content : String(content || '');
            
            // 调试信息
            console.log(`Vim: _loadContentToHeap - content length: ${contentStr.length}, first 200 chars: ${contentStr.substring(0, 200)}`);
            
            if (!this._heap) {
                // 降级：直接使用数组
                this.lines = contentStr.split('\n');
                // 移除最后一个空行（如果文件以换行符结尾）
                if (this.lines.length > 0 && this.lines[this.lines.length - 1] === '') {
                    this.lines.pop();
                }
                // 如果所有行都是空的，至少保留一个空行
                if (this.lines.length === 0) {
                    this.lines = [''];
                }
                console.log(`Vim: _loadContentToHeap (no heap) - loaded ${this.lines.length} lines`);
                return;
            }

            // 将每行存储到堆内存
            const contentLines = contentStr.split('\n');
            // 移除最后一个空行（如果文件以换行符结尾）
            if (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') {
                contentLines.pop();
            }
            // 如果所有行都是空的，至少保留一个空行
            if (contentLines.length === 0) {
                contentLines.push('');
            }

            this.lines = [];
            this.linePointers = [];

            for (const line of contentLines) {
                // 使用辅助方法写入堆内存
                const addr = this._writeStringToHeap(line);
                if (addr) {
                    this.linePointers.push(addr);
                    // 同时保留在数组中作为缓存（提高读取性能）
                    this.lines.push(line);
                } else {
                    // 如果堆内存分配失败，降级到数组
                    this.lines.push(line);
                    this.linePointers.push(null);
                }
            }
            
            console.log(`Vim: _loadContentToHeap (with heap) - loaded ${this.lines.length} lines`);
        }
        
        // 从堆内存读取指定行的内容
        _getLineFromHeap(lineIndex) {
            if (lineIndex < 0 || lineIndex >= this.linePointers.length) {
                return null;
            }
            
            // 优先从缓存读取
            if (this.lines[lineIndex] !== undefined) {
                return this.lines[lineIndex];
            }
            
            // 从堆内存读取
            const addr = this.linePointers[lineIndex];
            if (addr && this._heap) {
                const line = this._readStringFromHeap(addr);
                if (line !== null) {
                    // 更新缓存
                    this.lines[lineIndex] = line;
                    return line;
                }
            }
            
            return '';
        }
        
        // 更新堆内存中的指定行
        _updateLineInHeap(lineIndex, newLine) {
            if (lineIndex < 0 || lineIndex >= this.linePointers.length) {
                return false;
            }
            
            const oldAddr = this.linePointers[lineIndex];
            
            if (!this._heap) {
                // 降级：直接更新数组
                this.lines[lineIndex] = newLine;
                return true;
            }
            
            // 更新堆内存
            if (oldAddr) {
                const updatedAddr = this._updateStringInHeap(oldAddr, newLine);
                if (updatedAddr && typeof updatedAddr === 'string') {
                    // 返回的是新地址
                    this.linePointers[lineIndex] = updatedAddr;
                }
            } else {
                // 之前没有地址，分配新内存
                const newAddr = this._writeStringToHeap(newLine);
                if (newAddr) {
                    this.linePointers[lineIndex] = newAddr;
                }
            }
            
            // 更新缓存
            this.lines[lineIndex] = newLine;
            this.unsavedChanges = true;
            this._saveStateToStack();
            return true;
        }
        
        // 释放所有行的堆内存
        _freeAllLines() {
            if (!this._heap) return;
            
            for (const addr of this.linePointers) {
                if (addr) {
                    try {
                        const line = this._readStringFromHeap(addr);
                        if (line) {
                            this._heap.free(addr, line.length + 1);
                        }
                    } catch (e) {
                        console.error('Vim: Error freeing line', e);
                    }
                }
            }
            
            this.linePointers = [];
            this.lines = [];
        }

        // 保存文件（异步，等待 PHP 操作完成）
        async saveFile() {
            if (!this.filePath) {
                // 如果没有文件路径，提示需要文件名
                this.mode = MODE_COMMAND;
                this.commandBuffer = ':w ';
                this._render();
                return;
            }

            try {
                const content = this._getContentFromHeap();
                const parts = this.filePath.split('/');
                const root = parts[0];
                const fileName = parts[parts.length - 1];
                const parentPath = parts.slice(0, -1).join('/') || root;

                // 确保路径格式正确
                let phpPath = parentPath;
                if (/^[CD]:$/.test(phpPath)) {
                    phpPath = phpPath + '/';
                }

                // 检查文件是否存在（从 PHP 服务）
                let fileExists = false;
                try {
                    const checkUrl = new URL('/service/FSDirve.php', window.location.origin);
                    checkUrl.searchParams.set('action', 'exists');
                    checkUrl.searchParams.set('path', phpPath + '/' + fileName);
                    
                    const checkResponse = await fetch(checkUrl.toString());
                    if (checkResponse.ok) {
                        const checkResult = await checkResponse.json();
                        if (checkResult.status === 'success' && checkResult.data && checkResult.data.exists && checkResult.data.type === 'file') {
                            fileExists = true;
                        }
                    }
                } catch (e) {
                    console.error('Vim: Error checking file existence', e);
                }

                // 如果文件不存在，需要创建
                if (!fileExists) {
                    // 通过 PHP 服务创建文件
                    try {
                        const createUrl = new URL('/service/FSDirve.php', window.location.origin);
                        createUrl.searchParams.set('action', 'create_file');
                        createUrl.searchParams.set('path', phpPath);
                        createUrl.searchParams.set('fileName', fileName);
                        createUrl.searchParams.set('content', content);
                        
                        const createResponse = await fetch(createUrl.toString());
                        if (!createResponse.ok) {
                            const createResult = await createResponse.json();
                            this.terminalWrite(`Vim: Error creating file: ${createResult.message || createResponse.statusText}`);
                            return;
                        }
                    } catch (e) {
                        this.terminalWrite(`Vim: Error creating file: ${e.message || e}`);
                        return;
                    }
                }

                // 写入文件（通过 PHP 服务）
                try {
                    const writeUrl = new URL('/service/FSDirve.php', window.location.origin);
                    writeUrl.searchParams.set('action', 'write_file');
                    writeUrl.searchParams.set('path', phpPath);
                    writeUrl.searchParams.set('fileName', fileName);
                    writeUrl.searchParams.set('writeMod', 'overwrite');
                    
                    const writeResponse = await fetch(writeUrl.toString(), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ content: content })
                    });
                    
                    if (!writeResponse.ok) {
                        const writeResult = await writeResponse.json();
                        this.terminalWrite(`Vim: Error writing file: ${writeResult.message || writeResponse.statusText}`);
                        return;
                    }
                    
                    const writeResult = await writeResponse.json();
                    if (writeResult.status !== 'success') {
                        this.terminalWrite(`Vim: Error writing file: ${writeResult.message || 'Unknown error'}`);
                        return;
                    }
                    
                    this.unsavedChanges = false;
                    this.terminalWrite(`"${fileName}" ${this.lines.length}L, ${content.length}C written`);
                    
                    // 刷新显示
                    setTimeout(() => {
                        this.mode = MODE_NORMAL;
                        this._render();
                    }, 500);
                } catch (e) {
                    this.terminalWrite(`Vim: Error writing file: ${e.message || e}`);
                }
            } catch (e) {
                this.terminalWrite(`Vim: Error saving file: ${e.message || e}`);
            }
        }

        // 从堆内存获取内容
        _getContentFromHeap() {
            if (!this.pid) {
                return this.lines.join('\n') + '\n';
            }
            
            // 安全访问MemoryManager
            let MemoryMgr = null;
            try {
                if (typeof MemoryManager !== 'undefined') {
                    MemoryMgr = MemoryManager;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    MemoryMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'MemoryManager');
                } else if (typeof window !== 'undefined' && window.POOL && typeof window.POOL.__GET__ === 'function') {
                    MemoryMgr = window.POOL.__GET__('KERNEL_GLOBAL_POOL', 'MemoryManager');
                }
            } catch (e) {
                console.error('Vim: Error accessing MemoryManager', e);
            }

            if (!MemoryMgr) {
                return this.lines.join('\n') + '\n';
            }

            const appSpace = MemoryMgr.APPLICATION_SOP.get(this.pid);
            if (!appSpace || !appSpace.heaps) {
                return this.lines.join('\n') + '\n';
            }

            const heap = appSpace.heaps.get(1);
            if (!heap) {
                return this.lines.join('\n') + '\n';
            }

            // 从堆内存读取内容（降级：直接使用数组）
            return this.lines.join('\n') + '\n';
        }

        // 解析路径
        _resolvePath(cwd, filepath) {
            if (!filepath) return cwd;
            if (/^[A-Za-z]:/.test(filepath)) {
                return filepath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
            }
            const root = String(cwd).split('/')[0];
            let baseParts = String(cwd).split('/');
            if (filepath.startsWith('/')) {
                baseParts = [root];
                filepath = filepath.replace(/^\/+/, '');
            }
            const parts = filepath.split('/').filter(Boolean);
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

        // 处理键盘输入
        handleKey(key, ctrlKey, shiftKey) {
            if (this.mode === MODE_NORMAL) {
                this._handleNormalMode(key, ctrlKey, shiftKey);
            } else if (this.mode === MODE_INSERT) {
                this._handleInsertMode(key, ctrlKey, shiftKey);
            } else if (this.mode === MODE_COMMAND) {
                this._handleCommandMode(key, ctrlKey, shiftKey);
            } else if (this.mode === MODE_VISUAL) {
                this._handleVisualMode(key, ctrlKey, shiftKey);
            }
        }

        // Normal模式处理
        _handleNormalMode(key, ctrlKey, shiftKey) {
            switch(key) {
                case 'h':
                    this._moveLeft();
                    break;
                case 'j':
                    this._moveDown();
                    break;
                case 'k':
                    this._moveUp();
                    break;
                case 'l':
                    this._moveRight();
                    break;
                case 'i':
                    this.mode = MODE_INSERT;
                    break;
                case 'a':
                    this._moveRight();
                    this.mode = MODE_INSERT;
                    break;
                case 'A':
                    const lineA = this._getLineFromHeap(this.cursorRow) || '';
                    this.cursorCol = lineA.length;
                    this.mode = MODE_INSERT;
                    break;
                case 'o':
                    this._insertLineBelow();
                    this.mode = MODE_INSERT;
                    break;
                case 'O':
                    this._insertLineAbove();
                    this.mode = MODE_INSERT;
                    break;
                case 'x':
                    this._deleteChar();
                    break;
                case 'X':
                    if (this.cursorCol > 0) {
                        this.cursorCol--;
                        this._deleteChar();
                    }
                    break;
                case 'd':
                    if (shiftKey) {
                        // dd - 删除当前行
                        this._deleteLine();
                    }
                    break;
                case 'y':
                    if (shiftKey) {
                        // yy - 复制当前行
                        this._yankLine();
                    }
                    break;
                case 'p':
                    this._paste();
                    break;
                case 'P':
                    this._pasteBefore();
                    break;
                case 'u':
                    // 撤销（简化实现）
                    this.terminalWrite('Undo not implemented');
                    break;
                case 'v':
                    this.mode = MODE_VISUAL;
                    this.visualStartRow = this.cursorRow;
                    this.visualStartCol = this.cursorCol;
                    break;
                case ':':
                    this.mode = MODE_COMMAND;
                    this.commandBuffer = ':';
                    break;
                case 'Escape':
                    // 已经在Normal模式，不做操作
                    break;
                case '0':
                    this.cursorCol = 0;
                    break;
                case '$':
                    this.cursorCol = this.lines[this.cursorRow].length;
                    break;
                case 'g':
                    if (shiftKey) {
                        // G - 跳到最后一行
                        this.cursorRow = this.lines.length - 1;
                        this.cursorCol = 0;
                    }
                    break;
            }
            this._render();
        }

        // Insert模式处理
        _handleInsertMode(key, ctrlKey, shiftKey) {
            if (key === 'Escape') {
                this.mode = MODE_NORMAL;
                this._render();
                return;
            }

            // Ctrl+V 粘贴系统剪贴板内容
            if (ctrlKey && key === 'v') {
                this._pasteFromClipboard();
                return;
            }

            if (key === 'Enter') {
                this._insertNewline();
                this._render();
                return;
            }

            if (key === 'Backspace') {
                this._backspace();
                this._render();
                return;
            }

            if (key === 'Delete') {
                this._deleteChar();
                this._render();
                return;
            }

            if (key === 'ArrowLeft') {
                this._moveLeft();
                this._render();
                return;
            }

            if (key === 'ArrowRight') {
                this._moveRight();
                this._render();
                return;
            }

            if (key === 'ArrowUp') {
                this._moveUp();
                this._render();
                return;
            }

            if (key === 'ArrowDown') {
                this._moveDown();
                this._render();
                return;
            }

            // 处理特殊字符
            const specialChars = {
                ' ': ' ',
                'Space': ' ',
                'Tab': '\t'
            };
            
            if (specialChars.hasOwnProperty(key)) {
                this._insertChar(specialChars[key]);
                this._render();
                return;
            }

            // 输入普通字符
            // ev.key 已经自动处理了Shift键组合（如Shift+1会返回'!'）
            // 所以我们直接使用key的值
            
            // 检查是否为可打印字符（长度1，且不是控制字符）
            // 排除功能键（如 F1-F12, Home, End, PageUp, PageDown 等）
            const functionKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
                                  'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'PrintScreen', 'ScrollLock',
                                  'Pause', 'ContextMenu', 'Meta', 'Alt', 'Control', 'Shift', 'CapsLock',
                                  'NumLock', 'AudioVolumeMute', 'AudioVolumeDown', 'AudioVolumeUp'];
            
            // 如果按键不在功能键列表中，且长度为1，或者是可打印字符
            if (!functionKeys.includes(key) && key.length === 1) {
                // 对于字母，保持原始大小写（因为ev.key已经处理了Shift）
                // 对于其他字符，直接使用
                let char = key;
                // 确保字符是可打印的（ASCII 32-126 或 Unicode 可打印字符）
                if (char.charCodeAt(0) >= 32 || char === '\t' || char === '\n') {
                    this._insertChar(char);
                    this._render();
                    return;
                }
            }
            
            // 如果按键没有被处理，记录警告（用于调试）
            if (key.length > 1 && !functionKeys.includes(key) && 
                key !== 'Escape' && key !== 'Enter' && key !== 'Backspace' && key !== 'Delete' &&
                key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' &&
                key !== 'Tab' && key !== 'Space') {
                console.warn('Vim Insert Mode: 未处理的按键:', key, 'ctrlKey:', ctrlKey, 'shiftKey:', shiftKey);
            }
        }

        // Command模式处理
        _handleCommandMode(key, ctrlKey, shiftKey) {
            if (key === 'Escape') {
                this.mode = MODE_NORMAL;
                this.commandBuffer = '';
                this._render();
                return;
            }

            if (key === 'Enter') {
                this._executeCommand();
                return;
            }

            if (key === 'Backspace') {
                if (this.commandBuffer.length > 1) {
                    this.commandBuffer = this.commandBuffer.slice(0, -1);
                }
                this._render();
                return;
            }

            // 输入命令字符
            // ev.key已经自动处理了Shift键组合，直接使用
            if (key.length === 1) {
                this.commandBuffer += key;
                this._render();
            }
        }

        // Visual模式处理
        _handleVisualMode(key, ctrlKey, shiftKey) {
            switch(key) {
                case 'Escape':
                    this.mode = MODE_NORMAL;
                    this.visualStartRow = -1;
                    this.visualStartCol = -1;
                    break;
                case 'h':
                    this._moveLeft();
                    break;
                case 'j':
                    this._moveDown();
                    break;
                case 'k':
                    this._moveUp();
                    break;
                case 'l':
                    this._moveRight();
                    break;
                case 'd':
                    // 删除选中内容
                    this.mode = MODE_NORMAL;
                    break;
                case 'y':
                    // 复制选中内容
                    this._yankSelection();
                    this.mode = MODE_NORMAL;
                    this.visualStartRow = -1;
                    this.visualStartCol = -1;
                    break;
            }
            this._render();
        }

        // 执行命令
        _executeCommand() {
            const cmd = this.commandBuffer.trim();
            
            if (cmd === ':q') {
                if (this.unsavedChanges) {
                    this.terminalWrite('E37: No write since last change (add ! to override)');
                    this.mode = MODE_NORMAL;
                    this.commandBuffer = '';
                    this._render();
                    return;
                }
                this._exit();
                return;
            }

            if (cmd === ':q!') {
                this._exit();
                return;
            }

            if (cmd === ':w') {
                (async () => {
                    await this.saveFile();
                })();
                return;
            }

            if (cmd === ':wq' || cmd === ':x') {
                (async () => {
                    await this.saveFile();
                    setTimeout(() => {
                        this._exit();
                    }, 100);
                })();
                return;
            }

            if (cmd.startsWith(':w ')) {
                const filename = cmd.substring(3).trim();
                if (filename) {
                    this.filePath = this._resolvePath(this.terminalEnv.cwd, filename);
                    const parts = this.filePath.split('/');
                    this.filename = parts[parts.length - 1];
                    (async () => {
                        await this.saveFile();
                    })();
                    return;
                }
            }

            if (cmd === ':help') {
                this.terminalWrite('Vim Help:');
                this.terminalWrite('  Normal mode: h/j/k/l (move), i/a/o (insert), x/dd (delete), y/p (yank/paste)');
                this.terminalWrite('  :w (save), :q (quit), :wq (save and quit)');
                this.mode = MODE_NORMAL;
                this.commandBuffer = '';
                setTimeout(() => this._render(), 1000);
                return;
            }

            // 未知命令
            this.terminalWrite(`E492: Not an editor command: ${cmd}`);
            this.mode = MODE_NORMAL;
            this.commandBuffer = '';
            this._render();
        }

        // 移动操作
        _moveLeft() {
            if (this.cursorCol > 0) {
                this.cursorCol--;
                this._saveStateToStack();
            }
        }

        _moveRight() {
            const line = this._getLineFromHeap(this.cursorRow) || '';
            if (this.cursorCol < line.length) {
                this.cursorCol++;
                this._saveStateToStack();
            }
        }

        _moveUp() {
            if (this.cursorRow > 0) {
                this.cursorRow--;
                const line = this._getLineFromHeap(this.cursorRow) || '';
                if (this.cursorCol > line.length) {
                    this.cursorCol = line.length;
                }
                this._saveStateToStack();
            }
        }

        _moveDown() {
            if (this.cursorRow < this.lines.length - 1) {
                this.cursorRow++;
                const line = this._getLineFromHeap(this.cursorRow) || '';
                if (this.cursorCol > line.length) {
                    this.cursorCol = line.length;
                }
                this._saveStateToStack();
            }
        }

        // 编辑操作
        _insertChar(char) {
            const line = this._getLineFromHeap(this.cursorRow) || '';
            const newLine = line.slice(0, this.cursorCol) + char + line.slice(this.cursorCol);
            this._updateLineInHeap(this.cursorRow, newLine);
            this.cursorCol++;
            this.unsavedChanges = true;
            this._saveStateToStack();
        }

        _insertNewline() {
            const line = this._getLineFromHeap(this.cursorRow) || '';
            const before = line.slice(0, this.cursorCol);
            const after = line.slice(this.cursorCol);
            
            // 更新当前行
            this._updateLineInHeap(this.cursorRow, before);
            
            // 插入新行到堆内存
            const newAddr = this._writeStringToHeap(after);
            if (newAddr) {
                this.linePointers.splice(this.cursorRow + 1, 0, newAddr);
                this.lines.splice(this.cursorRow + 1, 0, after);
            } else {
                // 降级：直接插入到数组
                this.lines.splice(this.cursorRow + 1, 0, after);
                this.linePointers.splice(this.cursorRow + 1, 0, null);
            }
            
            this.cursorRow++;
            this.cursorCol = 0;
            this.unsavedChanges = true;
            this._saveStateToStack();
        }

        _insertLineBelow() {
            const newAddr = this._writeStringToHeap('');
            if (newAddr) {
                this.linePointers.splice(this.cursorRow + 1, 0, newAddr);
                this.lines.splice(this.cursorRow + 1, 0, '');
            } else {
                this.lines.splice(this.cursorRow + 1, 0, '');
                this.linePointers.splice(this.cursorRow + 1, 0, null);
            }
            this.cursorRow++;
            this.cursorCol = 0;
            this.unsavedChanges = true;
            this._saveStateToStack();
        }

        _insertLineAbove() {
            const newAddr = this._writeStringToHeap('');
            if (newAddr) {
                this.linePointers.splice(this.cursorRow, 0, newAddr);
                this.lines.splice(this.cursorRow, 0, '');
            } else {
                this.lines.splice(this.cursorRow, 0, '');
                this.linePointers.splice(this.cursorRow, 0, null);
            }
            this.cursorCol = 0;
            this.unsavedChanges = true;
            this._saveStateToStack();
        }

        _deleteChar() {
            const line = this._getLineFromHeap(this.cursorRow) || '';
            if (this.cursorCol < line.length) {
                const newLine = line.slice(0, this.cursorCol) + line.slice(this.cursorCol + 1);
                this._updateLineInHeap(this.cursorRow, newLine);
                this.unsavedChanges = true;
            } else if (this.cursorRow < this.lines.length - 1) {
                // 删除行尾，合并到下一行
                const nextLine = this._getLineFromHeap(this.cursorRow + 1) || '';
                const mergedLine = line + nextLine;
                
                // 释放下一行的内存
                const nextAddr = this.linePointers[this.cursorRow + 1];
                if (nextAddr && this._heap) {
                    try {
                        this._heap.free(nextAddr, nextLine.length + 1);
                    } catch (e) {
                        console.error('Vim: Error freeing line', e);
                    }
                }
                
                // 更新当前行并删除下一行
                this._updateLineInHeap(this.cursorRow, mergedLine);
                this.lines.splice(this.cursorRow + 1, 1);
                this.linePointers.splice(this.cursorRow + 1, 1);
                this.unsavedChanges = true;
            }
            this._saveStateToStack();
        }

        _backspace() {
            if (this.cursorCol > 0) {
                this.cursorCol--;
                this._deleteChar();
            } else if (this.cursorRow > 0) {
                // 行首退格，合并到上一行
                const prevLine = this._getLineFromHeap(this.cursorRow - 1) || '';
                const currentLine = this._getLineFromHeap(this.cursorRow) || '';
                this.cursorCol = prevLine.length;
                
                // 合并行
                const mergedLine = prevLine + currentLine;
                this._updateLineInHeap(this.cursorRow - 1, mergedLine);
                
                // 释放当前行的内存
                const currentAddr = this.linePointers[this.cursorRow];
                if (currentAddr && this._heap) {
                    try {
                        this._heap.free(currentAddr, currentLine.length + 1);
                    } catch (e) {
                        console.error('Vim: Error freeing line', e);
                    }
                }
                
                // 删除当前行
                this.lines.splice(this.cursorRow, 1);
                this.linePointers.splice(this.cursorRow, 1);
                this.cursorRow--;
                this.unsavedChanges = true;
                this._saveStateToStack();
            }
        }

        _deleteLine() {
            if (this.lines.length > 1) {
                // 释放被删除行的内存
                const addr = this.linePointers[this.cursorRow];
                if (addr && this._heap) {
                    const line = this._getLineFromHeap(this.cursorRow);
                    if (line) {
                        try {
                            this._heap.free(addr, line.length + 1);
                        } catch (e) {
                            console.error('Vim: Error freeing line', e);
                        }
                    }
                }
                
                // 删除行
                this.lines.splice(this.cursorRow, 1);
                this.linePointers.splice(this.cursorRow, 1);
                
                if (this.cursorRow >= this.lines.length) {
                    this.cursorRow = this.lines.length - 1;
                }
                const currentLine = this._getLineFromHeap(this.cursorRow) || '';
                this.cursorCol = Math.min(this.cursorCol, currentLine.length);
                this.unsavedChanges = true;
                this._saveStateToStack();
            }
        }

        _yankLine() {
            const line = this._getLineFromHeap(this.cursorRow) || '';
            this.yankBuffer = line;
            
            // 将复制缓冲区存储到堆内存
            if (this._heap) {
                if (this.yankBufferAddr) {
                    // 释放旧的缓冲区
                    try {
                        const oldBuf = this._readStringFromHeap(this.yankBufferAddr);
                        if (oldBuf) {
                            this._heap.free(this.yankBufferAddr, oldBuf.length + 1);
                        }
                    } catch (e) {
                        console.error('Vim: Error freeing yank buffer', e);
                    }
                }
                // 分配新的缓冲区
                this.yankBufferAddr = this._writeStringToHeap(line);
            }
        }

        _yankSelection() {
            // 简化实现：只复制当前行
            const line = this._getLineFromHeap(this.cursorRow) || '';
            this.yankBuffer = line;
            
            // 将复制缓冲区存储到堆内存
            if (this._heap) {
                if (this.yankBufferAddr) {
                    // 释放旧的缓冲区
                    try {
                        const oldBuf = this._readStringFromHeap(this.yankBufferAddr);
                        if (oldBuf) {
                            this._heap.free(this.yankBufferAddr, oldBuf.length + 1);
                        }
                    } catch (e) {
                        console.error('Vim: Error freeing yank buffer', e);
                    }
                }
                // 分配新的缓冲区
                this.yankBufferAddr = this._writeStringToHeap(line);
            }
        }

        _paste() {
            // 从堆内存或缓冲区获取复制的内容
            let pasteContent = this._getYankBufferContent();
            
            if (pasteContent) {
                // 将粘贴内容写入堆内存
                const newAddr = this._writeStringToHeap(pasteContent);
                if (newAddr) {
                    this.linePointers.splice(this.cursorRow + 1, 0, newAddr);
                    this.lines.splice(this.cursorRow + 1, 0, pasteContent);
                } else {
                    // 降级：直接插入到数组
                    this.lines.splice(this.cursorRow + 1, 0, pasteContent);
                    this.linePointers.splice(this.cursorRow + 1, 0, null);
                }
                
                this.cursorRow++;
                this.cursorCol = 0;
                this.unsavedChanges = true;
                this._saveStateToStack();
                this._render();
            }
        }

        _pasteBefore() {
            // 从堆内存或缓冲区获取复制的内容
            let pasteContent = this._getYankBufferContent();
            
            if (pasteContent) {
                // 将粘贴内容写入堆内存
                const newAddr = this._writeStringToHeap(pasteContent);
                if (newAddr) {
                    this.linePointers.splice(this.cursorRow, 0, newAddr);
                    this.lines.splice(this.cursorRow, 0, pasteContent);
                } else {
                    // 降级：直接插入到数组
                    this.lines.splice(this.cursorRow, 0, pasteContent);
                    this.linePointers.splice(this.cursorRow, 0, null);
                }
                
                this.cursorCol = 0;
                this.unsavedChanges = true;
                this._saveStateToStack();
                this._render();
            }
        }
        
        // 从堆内存或缓冲区获取复制的内容
        _getYankBufferContent() {
            let pasteContent = '';
            
            if (this.yankBufferAddr && this._heap) {
                // 优先从堆内存读取
                pasteContent = this._readStringFromHeap(this.yankBufferAddr);
            }
            
            // 如果堆内存读取失败，使用本地缓冲区
            if (!pasteContent && this.yankBuffer) {
                pasteContent = this.yankBuffer;
            }
            
            return pasteContent || '';
        }
        
        // 从系统剪贴板粘贴（插入模式下使用）
        _pasteFromClipboard() {
            // 尝试从系统剪贴板读取
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        this._pasteText(text);
                    }
                }).catch(err => {
                    console.error('Vim: Failed to read clipboard', err);
                    // 降级：尝试使用DOM方式
                    this._pasteTextDOM();
                });
            } else {
                // 降级：使用DOM方式
                this._pasteTextDOM();
            }
        }
        
        // 使用DOM方式读取剪贴板（降级方案）
        _pasteTextDOM() {
            // 创建一个临时的textarea来接收粘贴内容
            const tempTextarea = document.createElement('textarea');
            tempTextarea.style.position = 'fixed';
            tempTextarea.style.left = '-9999px';
            tempTextarea.style.top = '-9999px';
            document.body.appendChild(tempTextarea);
            tempTextarea.focus();
            
            setTimeout(() => {
                try {
                    const pastedText = tempTextarea.value;
                    if (pastedText) {
                        this._pasteText(pastedText);
                    }
                } catch (e) {
                    console.error('Vim: Failed to read clipboard via DOM', e);
                } finally {
                    document.body.removeChild(tempTextarea);
                }
            }, 100);
        }
        
        // 粘贴文本内容（可以是多行）
        _pasteText(text) {
            if (!text) return;
            
            // 将文本按行分割
            const lines = text.split('\n');
            
            if (lines.length === 1) {
                // 单行：在当前光标位置插入
                const currentLine = this._getLineFromHeap(this.cursorRow) || '';
                const before = currentLine.slice(0, this.cursorCol);
                const after = currentLine.slice(this.cursorCol);
                const newLine = before + text + after;
                this._updateLineInHeap(this.cursorRow, newLine);
                this.cursorCol += text.length;
            } else {
                // 多行：拆分当前行，插入新行
                const currentLine = this._getLineFromHeap(this.cursorRow) || '';
                const before = currentLine.slice(0, this.cursorCol);
                const after = currentLine.slice(this.cursorCol);
                
                // 第一行：合并到当前行
                const firstLine = before + lines[0];
                this._updateLineInHeap(this.cursorRow, firstLine);
                
                // 中间行：插入新行
                for (let i = 1; i < lines.length - 1; i++) {
                    const newAddr = this._writeStringToHeap(lines[i]);
                    if (newAddr) {
                        this.linePointers.splice(this.cursorRow + i, 0, newAddr);
                        this.lines.splice(this.cursorRow + i, 0, lines[i]);
                    } else {
                        this.lines.splice(this.cursorRow + i, 0, lines[i]);
                        this.linePointers.splice(this.cursorRow + i, 0, null);
                    }
                }
                
                // 最后一行：插入并与原行剩余部分合并
                const lastLine = lines[lines.length - 1] + after;
                const lastAddr = this._writeStringToHeap(lastLine);
                if (lastAddr) {
                    this.linePointers.splice(this.cursorRow + lines.length - 1, 0, lastAddr);
                    this.lines.splice(this.cursorRow + lines.length - 1, 0, lastLine);
                } else {
                    this.lines.splice(this.cursorRow + lines.length - 1, 0, lastLine);
                    this.linePointers.splice(this.cursorRow + lines.length - 1, 0, null);
                }
                
                // 移动光标到最后一行
                this.cursorRow += lines.length - 1;
                this.cursorCol = lines[lines.length - 1].length;
            }
            
            this.unsavedChanges = true;
            this._saveStateToStack();
            this._render();
        }

        // 退出vim
        _exit() {
            // 通知ProcessManager终止进程
            const pid = this._processPid || this.pid;
            if (pid) {
                // 安全访问ProcessManager
                let ProcessMgr = null;
                try {
                    if (typeof ProcessManager !== 'undefined') {
                        ProcessMgr = ProcessManager;
                    } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                        ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                    } else if (typeof window !== 'undefined' && window.POOL && typeof window.POOL.__GET__ === 'function') {
                        ProcessMgr = window.POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                    }
                } catch (e) {
                    console.error('Vim: Error accessing ProcessManager', e);
                }
                
                // 调用ProcessManager.killProgram来正确终止进程
                if (ProcessMgr && typeof ProcessMgr.killProgram === 'function') {
                    ProcessMgr.killProgram(pid, false).then((success) => {
                        if (success) {
                            console.log(`[Vim] 进程 ${pid} 已通过ProcessManager终止`);
                        } else {
                            console.warn(`[Vim] 进程 ${pid} 终止失败`);
                        }
                    }).catch((error) => {
                        console.error(`[Vim] 终止进程 ${pid} 时出错:`, error);
                    });
                } else {
                    // ProcessManager不可用，降级处理
                    console.warn('[Vim] ProcessManager不可用，无法正确终止进程');
                    // 清理内存（如果pid可用）
                    if (pid && typeof MemoryManager !== 'undefined') {
                        try {
                            MemoryManager.freeMemory(pid);
                        } catch (e) {
                            console.error('Vim: Error freeing memory', e);
                        }
                    }
                }
            }
            
            // 显示退出消息
            this.terminalWrite('');
            this.terminalWrite('Vim exited');
            
            // 退出vim，返回终端
            if (this.onExit) {
                this.onExit();
            }
        }

        // 绑定键盘事件
        _bindEvents() {
            // 键盘事件将在终端层面处理
        }
        
        // 处理鼠标滚轮事件
        _handleWheel(ev) {
            // 计算滚动方向（deltaY > 0 向下滚动，< 0 向上滚动）
            const scrollAmount = Math.abs(ev.deltaY);
            const scrollDirection = ev.deltaY > 0 ? 1 : -1;
            
            // 根据滚动量调整scrollOffset（每次滚动3行）
            const linesToScroll = Math.max(1, Math.floor(scrollAmount / 10));
            this.scrollOffset += scrollDirection * linesToScroll;
            
            // 限制scrollOffset范围
            const maxOffset = Math.max(0, this.lines.length - this.viewRows);
            this.scrollOffset = Math.max(0, Math.min(maxOffset, this.scrollOffset));
            
            // 更新光标位置以反映滚动
            if (this.scrollOffset > 0) {
                const newCursorRow = Math.min(this.lines.length - 1, this.scrollOffset + Math.floor(this.viewRows / 2));
                if (newCursorRow !== this.cursorRow) {
                    this.cursorRow = newCursorRow;
                    const line = this._getLineFromHeap(this.cursorRow) || '';
                    this.cursorCol = Math.min(this.cursorCol, line.length);
                }
            }
            
            // 保存状态并重新渲染
            this._saveStateToStack();
            this._render();
        }

        // 渲染界面
        _render() {
            // 获取或创建vim容器
            let container = this._vimContainerElement || document.getElementById(this._vimContainerId);
            
            // 如果容器不存在，创建新容器
            if (!container) {
                // 找到终端输出区域
                const outputEl = this._findOutputElement();
                
                if (outputEl) {
                    // 移除所有旧的vim容器
                    const oldContainers = outputEl.querySelectorAll('.vim-container');
                    oldContainers.forEach(el => el.remove());
                    
                    // 创建新容器 - 占满整个终端窗口
                    container = document.createElement('div');
                    container.id = this._vimContainerId;
                    container.className = 'vim-container';
                    container.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; font-family: "Consolas", "Monaco", "Courier New", monospace; background: #1e1e1e; color: #d4d4d4; padding: 0; margin: 0; border: none; font-size: 14px; line-height: 1.5; display: flex; flex-direction: column; z-index: 1000;';
                    
                    // 隐藏输出区域的其他内容
                    const outputChildren = Array.from(outputEl.children);
                    outputChildren.forEach(child => {
                        if (!child.classList.contains('vim-container')) {
                            child.style.display = 'none';
                        }
                    });
                    
                    // 让输出区域成为相对定位容器
                    if (getComputedStyle(outputEl).position === 'static') {
                        outputEl.style.position = 'relative';
                    }
                    outputEl.style.overflow = 'hidden';
                    
                    // 追加到输出区域
                    outputEl.appendChild(container);
                    this._vimContainerElement = container;
                } else {
                    // 降级：使用terminalWrite（第一次）
                    this.terminalWrite({
                        html: `<div class="vim-container" id="${this._vimContainerId}" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; background: #1e1e1e; color: #d4d4d4; padding: 0; margin: 0; border: none; font-size: 14px; line-height: 1.5; display: flex; flex-direction: column; z-index: 1000;"></div>`
                    });
                    container = document.getElementById(this._vimContainerId);
                    if (container) {
                        this._vimContainerElement = container;
                        // 设置输出区域的样式
                        const outputEl = this._findOutputElement();
                        if (outputEl) {
                            if (getComputedStyle(outputEl).position === 'static') {
                                outputEl.style.position = 'relative';
                            }
                            outputEl.style.overflow = 'hidden';
                        }
                    }
                }
            }
            
            // 构建内容HTML - 占满可用空间
            let contentHtml = '';
            // 计算可见行数（根据容器高度动态调整）
            const containerHeight = container ? container.offsetHeight : 600;
            const lineHeight = 21; // 每行高度
            const statusBarHeight = 30; // 状态栏高度
            const commandBarHeight = 40; // 命令栏高度（如果有）
            const availableHeight = containerHeight - statusBarHeight - (this.mode === MODE_COMMAND ? commandBarHeight : 0);
            const visibleRows = Math.max(10, Math.floor(availableHeight / lineHeight));
            this.viewRows = visibleRows;
            
            contentHtml += '<div class="vim-content" style="flex: 1; padding: 4px; overflow-y: auto; display: flex; flex-direction: column; min-height: 0; overflow-x: hidden;">';
            
            // 计算可见行范围（考虑滚动偏移）
            let startRow;
            if (this.scrollOffset > 0) {
                startRow = this.scrollOffset;
            } else {
                startRow = Math.max(0, this.cursorRow - Math.floor(this.viewRows / 2));
            }
            const endRow = Math.min(this.lines.length, startRow + this.viewRows);
            
            for (let i = startRow; i < endRow; i++) {
                // 确保行索引有效
                if (i < 0 || i >= this.lines.length) {
                    continue;
                }
                
                const line = this._getLineFromHeap(i);
                // 如果从堆内存读取失败，尝试从缓存读取
                const lineContent = (line !== null && line !== undefined) ? line : (this.lines[i] || '');
                const lineNum = String(i + 1).padStart(4, ' ');
                const isCurrentLine = i === this.cursorRow;
                
                // 行号区域
                let lineHtml = `<div style="display: flex; min-height: 21px; line-height: 21px;">`;
                lineHtml += `<span style="color: #858585; width: 50px; text-align: right; padding-right: 8px; background: ${isCurrentLine ? '#2d2d2d' : '#1e1e1e'}; user-select: none; flex-shrink: 0;">${lineNum}</span>`;
                
                // 内容区域
                lineHtml += `<span style="flex: 1; background: ${isCurrentLine ? '#2d2d2d' : '#1e1e1e'}; position: relative; white-space: pre-wrap; word-break: break-all;">`;
                
                // 显示行内容
                for (let j = 0; j < lineContent.length; j++) {
                    const char = lineContent[j];
                    const charHtml = escapeHtml(char === ' ' ? '·' : char);
                    
                    // 在插入模式下，光标在字符之间（在字符之前显示）
                    if (isCurrentLine && this.mode === MODE_INSERT && j === this.cursorCol) {
                        // Insert模式：在光标位置显示蓝色竖线
                        lineHtml += '<span style="background: #0078d4; width: 2px; min-width: 2px; height: 18px; display: inline-block; vertical-align: middle; animation: blink 1s infinite; margin-right: -1px;"></span>';
                    }
                    
                    // Normal模式下的光标高亮（光标在字符上）
                    if (isCurrentLine && this.mode === MODE_NORMAL && j === this.cursorCol) {
                        // Normal模式：白色背景，黑色文字，反转显示
                        lineHtml += `<span style="background: #ffffff; color: #000000; padding: 0 1px; font-weight: bold;">${charHtml || '&nbsp;'}</span>`;
                    } else {
                        lineHtml += charHtml;
                    }
                }
                
                // 如果光标在行尾或空行，显示光标
                if (isCurrentLine && this.cursorCol >= lineContent.length) {
                    if (this.mode === MODE_INSERT) {
                        // Insert模式光标：蓝色竖线
                        lineHtml += '<span style="background: #0078d4; width: 2px; min-width: 2px; height: 18px; display: inline-block; vertical-align: middle; animation: blink 1s infinite;"></span>';
                    } else {
                        // Normal模式光标：白色块（在空行或行尾）
                        lineHtml += '<span style="background: #ffffff; width: 8px; min-width: 8px; height: 18px; display: inline-block; vertical-align: middle; animation: blink 1s infinite;"></span>';
                    }
                }
                
                lineHtml += '</span></div>';
                contentHtml += lineHtml;
            }
            
            contentHtml += '</div>';

            // 渲染状态栏
            const modeNames = ['NORMAL', 'INSERT', 'COMMAND', 'VISUAL'];
            const modeName = modeNames[this.mode] || 'UNKNOWN';
            const modeColor = {
                'NORMAL': '#00ff00',
                'INSERT': '#00d4ff',
                'COMMAND': '#ffff00',
                'VISUAL': '#ff8800'
            }[modeName] || '#ffffff';
            
            let statusHtml = `<div class="vim-statusbar" style="flex-shrink: 0; border-top: 1px solid #3c3c3c; padding: 4px 8px; background: #007acc; color: #ffffff; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 500;">`;
            statusHtml += `<span style="font-weight: bold; color: ${modeColor}; text-shadow: 0 0 5px ${modeColor};">-- ${modeName} --</span>`;
            statusHtml += `<span style="margin: 0 10px;">${escapeHtml(this.filename || '[No Name]')}${this.unsavedChanges ? ' <span style="color: #ff6b6b;">[+]</span>' : ''}</span>`;
            statusHtml += `<span>${this.cursorRow + 1},${this.cursorCol + 1} | ${this.lines.length} lines</span>`;
            
            statusHtml += '</div>';
            
            // 命令模式：单独显示命令输入区域，更明显
            if (this.mode === MODE_COMMAND) {
                let commandHtml = `<div class="vim-command-input" style="border-top: 2px solid #ffff00; padding: 8px 12px; background: #1a1a1a; color: #ffff00; font-size: 15px; font-weight: bold; display: flex; align-items: center; box-shadow: 0 -2px 10px rgba(255, 255, 0, 0.3);">`;
                commandHtml += `<span style="color: #ffff00; margin-right: 10px; font-weight: bold; font-size: 16px;">:</span>`;
                commandHtml += `<span style="color: #ffffff; background: #000000; padding: 4px 8px; border-radius: 3px; flex: 1; font-family: 'Consolas', 'Monaco', monospace; letter-spacing: 0.5px; min-height: 20px; display: inline-block;">${escapeHtml(this.commandBuffer)}</span>`;
                // 添加闪烁光标
                commandHtml += `<span style="background: #ffff00; width: 3px; height: 18px; display: inline-block; margin-left: 4px; animation: blink 1s infinite; box-shadow: 0 0 5px #ffff00;"></span>`;
                commandHtml += '</div>';
                statusHtml += commandHtml;
            }
            
            contentHtml += statusHtml;
            contentHtml += '</div>';
            
            // 添加CSS动画（光标闪烁）- 只在第一次添加
            if (!document.getElementById('vim-blink-style')) {
                const style = document.createElement('style');
                style.id = 'vim-blink-style';
                style.textContent = `
                    @keyframes blink {
                        0%, 50% { opacity: 1; }
                        51%, 100% { opacity: 0.3; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            // 直接更新容器的innerHTML，而不是追加新元素
            if (container) {
                container.innerHTML = contentHtml;
            } else {
                // 降级：如果找不到容器，使用terminalWrite（但只应该第一次）
                this.terminalWrite({
                    html: `<div class="vim-container" id="${this._vimContainerId}">${contentHtml}</div>`
                });
                // 保存容器引用
                this._vimContainerElement = document.getElementById(this._vimContainerId);
            }
        }
        
        // 查找终端输出元素
        _findOutputElement() {
            // 尝试从terminalWrite函数中获取outputEl
            if (this.terminalWrite && this.terminalWrite._outputEl) {
                return this.terminalWrite._outputEl;
            }
            
            // 尝试从全局查找活动终端
            const activeTerminal = window.TabManager ? window.TabManager.getActiveTerminal() : null;
            if (activeTerminal && activeTerminal.outputEl) {
                return activeTerminal.outputEl;
            }
            
            // 尝试从DOM查找
            const terminals = document.querySelectorAll('.terminal-instance');
            for (const term of terminals) {
                if (term.classList.contains('active')) {
                    const output = term.querySelector('.output');
                    if (output) {
                        return output;
                    }
                }
            }
            
            // 降级：查找第一个终端
            const firstTerminal = document.querySelector('.terminal-instance');
            if (firstTerminal) {
                const output = firstTerminal.querySelector('.output');
                if (output) {
                    return output;
                }
            }
            
            return null;
        }
    }

    // HTML转义函数
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 导出Vim类到全局
    window.Vim = Vim;
    
    // 导出VIM对象（符合进程管理器规范）
    const VIM = {
        // 程序信息方法
        __info__() {
            return {
                name: 'Vim文本编辑器',
                type: 'CLI',  // CLI程序
                version: '1.0.0',
                description: 'Vim文本编辑器 - 类Vim编辑体验',
                author: 'ZerOS Team',
                copyright: 'Copyright (c) 2024 ZerOS',
                capabilities: [
                    'text_editing',
                    'file_operations',
                    'vim_modes',
                    'memory_management'
                ],
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: true  // 支持多开
                }
            };
        },
        
        // 初始化方法（由 ProcessManager 调用）
        __init__(pid, initArgs = {}) {
            // 解析初始化参数
            const args = initArgs.args || [];  // 命令行参数
            const terminal = initArgs.terminal || null;  // 终端实例
            const env = initArgs.env || {};  // 环境变量
            const cwd = initArgs.cwd || 'C:';  // 当前工作目录
            
            // 获取文件名（第一个参数）
            const filename = args.length > 0 ? args[0] : null;
            
            // 如果没有终端实例，无法启动vim（vim需要终端来显示）
            if (!terminal) {
                throw new Error('Vim requires a terminal instance to run');
            }
            
            // 创建vim的write函数
            const vimWriteFn = (content) => {
                if (typeof content === 'object' && content.html) {
                    terminal.write({ html: content.html });
                } else {
                    terminal.write(String(content));
                }
            };
            
            // 立即设置outputEl引用
            vimWriteFn._outputEl = terminal.outputEl;
            
            // 创建vim实例（传递pid）
            const vim = new Vim(vimWriteFn, env, pid);
            
            // 保存pid到vim实例（用于退出时通知ProcessManager）
            vim._processPid = pid;
            
            // 初始化内存管理（使用ProcessManager分配的pid）
            vim._initMemory(pid);
            
            // 从栈内存读取常量
            vim._loadConstants(pid);
            
            // 标记终端进入vim模式
            terminal._vimMode = true;
            terminal._vimInstance = vim;
            
            // 保存当前终端内容到内存系统
            terminal._saveTerminalContent();
            
            // 清空终端输出
            terminal.clear();
            
            // 设置退出回调
            vim.onExit = () => {
                terminal._vimMode = false;
                terminal._vimInstance = null;
                
                // 清除焦点检查间隔
                if (terminal._vimFocusInterval) {
                    clearInterval(terminal._vimFocusInterval);
                    terminal._vimFocusInterval = null;
                }
                
                // 移除input事件监听器
                if (terminal._vimInputHandler) {
                    terminal.cmdEl.removeEventListener('input', terminal._vimInputHandler);
                    terminal._vimInputHandler = null;
                }
                
                // 恢复滚轮监听器为普通模式
                if (terminal._wheelHandler && terminal._wheelHandlerVim) {
                    terminal.outputEl.removeEventListener('wheel', terminal._wheelHandlerVim);
                    terminal.outputEl.addEventListener('wheel', terminal._wheelHandler, { passive: true });
                }
                
                // 恢复输出区域的滚动设置
                if (terminal.outputEl) {
                    terminal.outputEl.style.overflow = '';
                    terminal.outputEl.style.position = '';
                    const children = terminal.outputEl.children;
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if (!child.classList.contains('vim-container')) {
                            child.style.display = '';
                        }
                    }
                    const vimContainers = terminal.outputEl.querySelectorAll('.vim-container');
                    vimContainers.forEach(el => el.remove());
                }
                
                // 恢复终端内容
                const restored = terminal._restoreTerminalContent();
                if (!restored) {
                    terminal.clear();
                }
                
                // 恢复命令输入框显示
                const inputArea = terminal.cmdEl.closest('.input-area');
                if (inputArea) {
                    inputArea.style.opacity = '';
                    inputArea.style.pointerEvents = '';
                }
                terminal.cmdEl.classList.remove('vim-mode');
                
                terminal._updatePrompt();
                terminal.focus();
            };
            
            // 切换到Vim模式的滚轮监听器
            if (terminal._wheelHandler && terminal._wheelHandlerVim) {
                terminal.outputEl.removeEventListener('wheel', terminal._wheelHandler);
                terminal.outputEl.addEventListener('wheel', terminal._wheelHandlerVim, { passive: false });
            }
            
            // 在vim模式下，将输入框设置为透明但保持可聚焦
            const inputArea = terminal.cmdEl.closest('.input-area');
            if (inputArea) {
                inputArea.style.opacity = '0';
                inputArea.style.pointerEvents = 'auto';
            }
            terminal.cmdEl.textContent = '';
            terminal.cmdEl.classList.add('vim-mode');
            
            // 添加input事件监听器
            const clearInputHandler = () => {
                if (terminal._vimMode) {
                    terminal.cmdEl.textContent = '';
                }
            };
            terminal.cmdEl.addEventListener('input', clearInputHandler);
            terminal._vimInputHandler = clearInputHandler;
            
            // 确保输入框获得焦点
            setTimeout(() => {
                terminal.cmdEl.focus();
                if (!terminal._vimFocusInterval) {
                    terminal._vimFocusInterval = setInterval(() => {
                        if (terminal._vimMode && document.activeElement !== terminal.cmdEl) {
                            terminal.cmdEl.focus();
                        }
                    }, 100);
                }
            }, 100);
            
            // 打开文件（如果提供了文件名）
            // 注意：filename可能是相对路径，需要解析
            if (filename) {
                // 解析文件路径（相对于当前工作目录）
                // vim实例已经有_resolvePath方法，可以直接使用
                const resolvedPath = vim._resolvePath(cwd, filename);
                vim.openFile(resolvedPath).then(() => {
                    // 延迟渲染，确保DOM更新
                    setTimeout(() => {
                        if (vim._render) {
                            vim._render();
                        }
                    }, 50);
                }).catch(e => {
                    console.error('Vim: Error opening file', e);
                });
            } else {
                // 如果没有提供文件名，打开空文件
                vim.openFile(null);
                // 延迟渲染，确保DOM更新
                setTimeout(() => {
                    if (vim._render) {
                        vim._render();
                    }
                }, 50);
            }
            
            return {
                pid: pid,
                vim: vim,
                filename: filename
            };
        },
        
        // 退出方法（由 ProcessManager 调用）
        __exit__(pid, force = false) {
            // 如果vim实例正在运行，触发退出
            // 注意：vim的退出主要通过onExit回调处理
            // 这里只是清理资源
            
            // 查找所有活动的vim实例（通过终端）
            // 优先通过POOL查找TerminalAPI
            let terminal = null;
            try {
                if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    const terminalAPI = POOL.__GET__('APPLICATION_SHARED_POOL', 'TerminalAPI');
                    if (terminalAPI && typeof terminalAPI.getActiveTerminal === 'function') {
                        terminal = terminalAPI.getActiveTerminal();
                    }
                } else if (typeof window !== 'undefined' && window.POOL && typeof window.POOL.__GET__ === 'function') {
                    const terminalAPI = window.POOL.__GET__('APPLICATION_SHARED_POOL', 'TerminalAPI');
                    if (terminalAPI && typeof terminalAPI.getActiveTerminal === 'function') {
                        terminal = terminalAPI.getActiveTerminal();
                    }
                }
            } catch (e) {
                console.error('[Vim] 获取终端实例失败:', e);
            }
            
            // 降级：通过全局对象查找
            if (!terminal && typeof window !== 'undefined' && window.Terminal) {
                terminal = window.Terminal();
            }
            
            if (terminal && terminal._vimInstance) {
                // 触发vim退出
                if (terminal._vimInstance.onExit) {
                    terminal._vimInstance.onExit();
                }
            } else {
                console.warn(`[Vim] 未找到活动的vim实例 (PID: ${pid})`);
            }
        }
    };
    
    // 导出VIM对象到全局（进程管理器需要访问）
    if (typeof window !== 'undefined') {
        window.VIM = VIM;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.VIM = VIM;
    }
    
    // 发布信号（如果 DependencyConfig 可用）
    if (typeof DependencyConfig !== 'undefined') {
        DependencyConfig.publishSignal("../../test/application/vim/vim.js");
    }

})(window);

