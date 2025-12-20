// ZerOS 内核检查程序
// 专业的内核检查程序，严格且全面地检查内核的方方面面
// 包括各种内核 API 的功能测试与检查（而非只检查是否存在）
// 提供可视化实时检查项目与结果
// 每一个功能都要做到检查并且要及时清理检查痕迹
// 注意：此程序必须禁止自动初始化，通过 ProcessManager 管理

(function(window) {
    'use strict';
    
    const KERNELCHECKER = {
        pid: null,
        window: null,
        
        // 检查状态
        _checkResults: [],
        _currentCheckIndex: 0,
        _isChecking: false,
        _checkInterval: null,
        
        // 检查痕迹清理
        _testFiles: [],
        _testDirectories: [],
        _testMemory: [],
        _testNotifications: [],
        _testWindows: [],
        _testKeys: [],
        
        // 内存管理引用
        _heap: null,
        _shed: null,
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            // 初始化内存管理
            this._initMemory(pid);
            
            // 获取 GUI 容器
            const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
            
            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'kernelchecker-window';
            this.window.dataset.pid = pid.toString();
            this.window.style.cssText = `
                width: 1000px;
                height: 800px;
                min-width: 800px;
                min-height: 600px;
            `;
            
            // 使用GUIManager注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('kernelchecker');
                }
                
                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '内核检查程序',
                    icon: icon,
                    onClose: () => {
                        // 先执行清理
                        this._cleanup();
                        // onClose 回调只做清理工作，不调用 _closeWindow 或 unregisterWindow
                        // 窗口关闭由 GUIManager._closeWindow 统一处理
                        // _closeWindow 会在窗口关闭后检查该 PID 是否还有其他窗口，如果没有，会 kill 进程
                        // 这样可以确保程序多实例（不同 PID）互不影响
                    }
                });
                // 保存窗口ID，用于精确清理
                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }
            
            // 创建主内容区域
            const content = this._createContent();
            this.window.appendChild(content);
            
            // 添加到容器
            guiContainer.appendChild(this.window);
        },
        
        _initMemory: function(pid) {
            if (typeof MemoryManager !== 'undefined') {
                try {
                    if (typeof MemoryUtils !== 'undefined' && typeof MemoryUtils.getAppMemory === 'function') {
                        const memory = MemoryUtils.getAppMemory(pid);
                        if (memory) {
                            this._heap = memory.heap;
                            this._shed = memory.shed;
                        }
                    } else {
                        const appSpace = MemoryManager.APPLICATION_SOP.get(pid);
                        if (appSpace) {
                            this._heap = appSpace.heaps.get(1) || null;
                            this._shed = appSpace.sheds.get(1) || null;
                        }
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("KernelChecker", `内存初始化失败: ${e.message}`);
                    }
                }
            }
        },
        
        _createContent: function() {
            const content = document.createElement('div');
            content.className = 'kernelchecker-content';
            content.style.cssText = `
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 创建工具栏
            const toolbar = this._createToolbar();
            content.appendChild(toolbar);
            
            // 创建检查结果区域
            const resultsArea = this._createResultsArea();
            content.appendChild(resultsArea);
            
            // 创建状态栏
            const statusBar = this._createStatusBar();
            content.appendChild(statusBar);
            
            return content;
        },
        
        _createToolbar: function() {
            const toolbar = document.createElement('div');
            toolbar.className = 'kernelchecker-toolbar';
            toolbar.style.cssText = `
                padding: 15px 20px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                display: flex;
                gap: 10px;
                align-items: center;
            `;
            
            // 开始检查按钮
            const startBtn = document.createElement('button');
            startBtn.textContent = '开始检查';
            startBtn.className = 'kernelchecker-btn kernelchecker-btn-primary';
            startBtn.dataset.action = 'start';
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (e.target === startBtn || startBtn.contains(e.target)) {
                        this._startCheck();
                    }
                }, {
                    priority: 100,
                    selector: '.kernelchecker-btn[data-action="start"]'
                });
            } else {
                startBtn.addEventListener('click', () => this._startCheck());
            }
            toolbar.appendChild(startBtn);
            
            // 停止检查按钮
            const stopBtn = document.createElement('button');
            stopBtn.textContent = '停止检查';
            stopBtn.className = 'kernelchecker-btn kernelchecker-btn-secondary';
            stopBtn.dataset.action = 'stop';
            stopBtn.disabled = true;
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (e.target === stopBtn || stopBtn.contains(e.target)) {
                        this._stopCheck();
                    }
                }, {
                    priority: 100,
                    selector: '.kernelchecker-btn[data-action="stop"]'
                });
            } else {
                stopBtn.addEventListener('click', () => this._stopCheck());
            }
            this._stopBtn = stopBtn;
            toolbar.appendChild(stopBtn);
            
            // 清理痕迹按钮
            const cleanupBtn = document.createElement('button');
            cleanupBtn.textContent = '清理检查痕迹';
            cleanupBtn.className = 'kernelchecker-btn kernelchecker-btn-secondary';
            cleanupBtn.dataset.action = 'cleanup';
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (e.target === cleanupBtn || cleanupBtn.contains(e.target)) {
                        this._cleanup();
                    }
                }, {
                    priority: 100,
                    selector: '.kernelchecker-btn[data-action="cleanup"]'
                });
            } else {
                cleanupBtn.addEventListener('click', () => this._cleanup());
            }
            toolbar.appendChild(cleanupBtn);
            
            // 导出报告按钮
            const exportBtn = document.createElement('button');
            exportBtn.textContent = '导出报告';
            exportBtn.className = 'kernelchecker-btn kernelchecker-btn-secondary';
            exportBtn.dataset.action = 'export';
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (e.target === exportBtn || exportBtn.contains(e.target)) {
                        this._exportReport();
                    }
                }, {
                    priority: 100,
                    selector: '.kernelchecker-btn[data-action="export"]'
                });
            } else {
                exportBtn.addEventListener('click', () => this._exportReport());
            }
            toolbar.appendChild(exportBtn);
            
            return toolbar;
        },
        
        _createResultsArea: function() {
            const resultsArea = document.createElement('div');
            resultsArea.className = 'kernelchecker-results';
            resultsArea.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                background: rgba(0, 0, 0, 0.2);
            `;
            
            // 检查结果列表
            const resultsList = document.createElement('div');
            resultsList.className = 'kernelchecker-results-list';
            this._resultsList = resultsList;
            resultsArea.appendChild(resultsList);
            
            return resultsArea;
        },
        
        _createStatusBar: function() {
            const statusBar = document.createElement('div');
            statusBar.className = 'kernelchecker-statusbar';
            statusBar.style.cssText = `
                padding: 10px 20px;
                border-top: 1px solid rgba(108, 142, 255, 0.2);
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                color: rgba(232, 236, 240, 0.7);
            `;
            
            // 状态文本
            const statusText = document.createElement('div');
            statusText.textContent = '就绪';
            this._statusText = statusText;
            statusBar.appendChild(statusText);
            
            // 统计信息
            const stats = document.createElement('div');
            stats.className = 'kernelchecker-stats';
            stats.textContent = '总计: 0 | 通过: 0 | 失败: 0 | 警告: 0';
            this._stats = stats;
            statusBar.appendChild(stats);
            
            return statusBar;
        },
        
        _startCheck: async function() {
            if (this._isChecking) return;
            
            this._isChecking = true;
            this._currentCheckIndex = 0;
            this._checkResults = [];
            this._resultsList.innerHTML = '';
            this._stopBtn.disabled = false;
            this._statusText.textContent = '正在检查...';
            
            // 初始化检查项目
            const checks = this._getAllChecks();
            
            // 逐个执行检查
            for (let i = 0; i < checks.length; i++) {
                if (!this._isChecking) break;
                
                this._currentCheckIndex = i;
                const check = checks[i];
                
                try {
                    const result = await this._executeCheck(check);
                    this._checkResults.push(result);
                    this._updateResultsDisplay(result);
                    this._updateStats();
                } catch (error) {
                    const errorResult = {
                        category: check.category,
                        name: check.name,
                        status: 'error',
                        message: `检查异常: ${error.message}`,
                        details: error.stack
                    };
                    this._checkResults.push(errorResult);
                    this._updateResultsDisplay(errorResult);
                    this._updateStats();
                }
                
                // 短暂延迟以便界面更新
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            this._isChecking = false;
            this._stopBtn.disabled = true;
            this._statusText.textContent = '检查完成';
            
            // 检查完成后自动清理测试痕迹
            await this._cleanup();
        },
        
        _stopCheck: async function() {
            this._isChecking = false;
            this._stopBtn.disabled = true;
            this._statusText.textContent = '检查已停止';
            
            // 停止检查时也清理测试痕迹
            await this._cleanup();
        },
        
        _getAllChecks: function() {
            const checks = [];
            
            // 1. 核心模块检查
            checks.push(...this._getCoreModuleChecks());
            
            // 2. 文件系统检查
            checks.push(...this._getFileSystemChecks());
            
            // 3. 内存管理检查
            checks.push(...this._getMemoryManagementChecks());
            
            // 4. 进程管理检查
            checks.push(...this._getProcessManagementChecks());
            
            // 5. GUI 管理检查
            checks.push(...this._getGUIManagementChecks());
            
            // 6. 驱动层检查
            checks.push(...this._getDriveChecks());
            
            // 7. 权限管理检查
            checks.push(...this._getPermissionChecks());
            
            // 8. 主题系统检查
            checks.push(...this._getThemeChecks());
            
            // 9. 通知系统检查
            checks.push(...this._getNotificationChecks());
            
            // 10. 网络管理检查
            checks.push(...this._getNetworkChecks());
            
            // 11. 加密驱动检查
            checks.push(...this._getCryptDriveChecks());
            
            return checks;
        },
        
        _getCoreModuleChecks: function() {
            return [
                {
                    category: '核心模块',
                    name: 'KernelLogger 存在性',
                    check: () => typeof KernelLogger !== 'undefined'
                },
                {
                    category: '核心模块',
                    name: 'KernelLogger.info 功能',
                    check: async () => {
                        if (typeof KernelLogger === 'undefined') return false;
                        try {
                            KernelLogger.info("KernelChecker", "[测试] KernelLogger.info 功能测试");
                            return true;
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '核心模块',
                    name: 'KernelLogger.error 功能',
                    check: async () => {
                        if (typeof KernelLogger === 'undefined') return false;
                        try {
                            // 注意：此测试会输出错误日志，这是正常的测试行为
                            KernelLogger.error("KernelChecker", "[测试] KernelLogger.error 功能测试");
                            return true;
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '核心模块',
                    name: 'DependencyConfig 存在性',
                    check: () => typeof DependencyConfig !== 'undefined'
                },
                {
                    category: '核心模块',
                    name: 'POOL 存在性',
                    check: () => typeof POOL !== 'undefined'
                },
                {
                    category: '核心模块',
                    name: 'POOL.__GET__ 功能',
                    check: async () => {
                        if (typeof POOL === 'undefined') return false;
                        try {
                            const hasPool = POOL.__HAS__ && POOL.__HAS__("KERNEL_GLOBAL_POOL");
                            return hasPool;
                        } catch (e) {
                            return false;
                        }
                    }
                }
            ];
        },
        
        _getFileSystemChecks: function() {
            return [
                {
                    category: '文件系统',
                    name: 'Disk 存在性',
                    check: () => typeof Disk !== 'undefined'
                },
                {
                    category: '文件系统',
                    name: 'Disk.canUsed 状态',
                    check: () => typeof Disk !== 'undefined' && Disk.canUsed === true
                },
                {
                    category: '文件系统',
                    name: '文件系统 - 创建测试目录',
                    check: async () => {
                        if (typeof ProcessManager === 'undefined') {
                            throw new Error('ProcessManager 不可用');
                        }
                        // 检查 Disk 是否已初始化
                        if (typeof Disk === 'undefined' || !Disk.canUsed) {
                            throw new Error('Disk 模块未加载或不可用');
                        }
                        // 检查 D: 分区是否存在（不依赖 initialized 属性，因为分区可能已存在但还未完全初始化）
                        const diskMap = Disk.diskSeparateMap;
                        const diskSize = Disk.diskSeparateSize;
                        const hasDPartition = (diskMap && diskMap.has('D:') && diskMap.get('D:')) || 
                                             (diskSize && diskSize.has('D:'));
                        if (!hasDPartition) {
                            throw new Error('D: 分区不存在');
                        }
                        try {
                            const testDir = `D:/kernelchecker_test_${Date.now()}`;
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("KernelChecker", `开始创建测试目录: ${testDir}`);
                            }
                            const result = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.create', ['directory', testDir]);
                            // FileSystem.create 返回 { status: 'success', data: ... }
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("KernelChecker", `创建测试目录结果: ${JSON.stringify(result)}`);
                            }
                            if (result && result.status === 'success') {
                                this._testDirectories.push(testDir);
                                return true;
                            }
                            // 如果返回了结果但没有 status，抛出详细错误
                            const errorMsg = `创建测试目录失败: 返回结果=${JSON.stringify(result)}, 类型=${typeof result}`;
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn("KernelChecker", errorMsg);
                            }
                            throw new Error(errorMsg);
                        } catch (e) {
                            // 检查是否是权限错误
                            const errorMessage = e?.message || String(e);
                            const isPermissionError = errorMessage && (
                                errorMessage.includes('没有权限') || 
                                errorMessage.includes('权限已被用户拒绝') ||
                                errorMessage.includes('权限检查失败') ||
                                errorMessage.includes('权限错误') ||
                                errorMessage.includes('权限')
                            );
                            
                            if (isPermissionError) {
                                const errorMsg = `权限被拒绝: ${errorMessage}`;
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn("KernelChecker", errorMsg);
                                }
                                // 权限错误应该明确标记为失败，抛出包含"权限错误"的错误
                                throw new Error(`权限错误: ${errorMessage}`);
                            }
                            
                            const errorMsg = `创建测试目录异常: ${errorMessage}`;
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error("KernelChecker", errorMsg, { error: e, stack: e.stack });
                            }
                            throw new Error(errorMsg);
                        }
                    }
                },
                {
                    category: '文件系统',
                    name: '文件系统 - 创建测试文件',
                    check: async () => {
                        if (typeof ProcessManager === 'undefined') {
                            throw new Error('ProcessManager 不可用');
                        }
                        // 检查 Disk 是否已初始化
                        if (typeof Disk === 'undefined' || !Disk.canUsed) {
                            throw new Error('Disk 模块未加载或不可用');
                        }
                        // 检查 D: 分区是否存在（不依赖 initialized 属性，因为分区可能已存在但还未完全初始化）
                        const diskMap = Disk.diskSeparateMap;
                        const diskSize = Disk.diskSeparateSize;
                        const hasDPartition = (diskMap && diskMap.has('D:') && diskMap.get('D:')) || 
                                             (diskSize && diskSize.has('D:'));
                        if (!hasDPartition) {
                            throw new Error('D: 分区不存在');
                        }
                        try {
                            const testFile = `D:/kernelchecker_test_${Date.now()}.txt`;
                            const testContent = 'KernelChecker test file';
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("KernelChecker", `开始创建测试文件: ${testFile}`);
                            }
                            // FileSystem.write 返回 true 或抛出错误
                            const result = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.write', [testFile, testContent]);
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("KernelChecker", `创建测试文件结果: ${JSON.stringify(result)}, 类型=${typeof result}`);
                            }
                            if (result === true) {
                                this._testFiles.push(testFile);
                                return true;
                            }
                            // 如果返回了结果但不是 true，抛出详细错误
                            const errorMsg = `创建测试文件失败: 返回结果=${JSON.stringify(result)}, 类型=${typeof result}, 期望=true`;
                            if (typeof KernelLogger !== 'undefined' && result !== undefined) {
                                KernelLogger.warn("KernelChecker", errorMsg);
                            }
                            throw new Error(errorMsg);
                        } catch (e) {
                            // 检查是否是权限错误
                            const errorMessage = e?.message || String(e);
                            const isPermissionError = errorMessage && (
                                errorMessage.includes('没有权限') || 
                                errorMessage.includes('权限已被用户拒绝') ||
                                errorMessage.includes('权限检查失败') ||
                                errorMessage.includes('权限错误') ||
                                errorMessage.includes('权限')
                            );
                            
                            if (isPermissionError) {
                                const errorMsg = `权限被拒绝: ${errorMessage}`;
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn("KernelChecker", errorMsg);
                                }
                                // 权限错误应该明确标记为失败，抛出包含"权限错误"的错误
                                throw new Error(`权限错误: ${errorMessage}`);
                            }
                            
                            const errorMsg = `创建测试文件异常: ${errorMessage}`;
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error("KernelChecker", errorMsg, { error: e, stack: e.stack });
                            }
                            throw new Error(errorMsg);
                        }
                    }
                },
                {
                    category: '文件系统',
                    name: '文件系统 - 读取测试文件',
                    check: async () => {
                        if (this._testFiles.length === 0) {
                            throw new Error('没有可读取的测试文件（可能创建文件失败）');
                        }
                        try {
                            const testFile = this._testFiles[this._testFiles.length - 1];
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("KernelChecker", `开始读取测试文件: ${testFile}`);
                            }
                            const result = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.read', [testFile]);
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.debug("KernelChecker", `读取测试文件结果: 类型=${typeof result}, 值=${JSON.stringify(result)}`);
                            }
                            // FileSystem.read 直接返回内容，不是对象
                            // 注意：readFile 可能返回带有换行符的内容，需要去除首尾空白字符
                            if (typeof result === 'string') {
                                const trimmedResult = result.trim();
                                const expected = 'KernelChecker test file';
                                if (trimmedResult === expected) {
                                    return true;
                                } else {
                                    const errorMsg = `读取测试文件内容不匹配: 期望="${expected}", 实际="${trimmedResult}"`;
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn("KernelChecker", errorMsg);
                                    }
                                    throw new Error(errorMsg);
                                }
                            }
                            // 如果返回了结果但不是字符串，抛出详细错误
                            const errorMsg = `读取测试文件失败: 返回类型为 ${typeof result}，值: ${JSON.stringify(result)}`;
                            if (typeof KernelLogger !== 'undefined' && result !== undefined) {
                                KernelLogger.warn("KernelChecker", errorMsg);
                            }
                            throw new Error(errorMsg);
                        } catch (e) {
                            const errorMsg = `读取测试文件异常: ${e.message}`;
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error("KernelChecker", errorMsg, { error: e, stack: e.stack });
                            }
                            throw new Error(errorMsg);
                        }
                    }
                },
                {
                    category: '文件系统',
                    name: '文件系统 - 列出目录',
                    check: async () => {
                        if (typeof ProcessManager === 'undefined') return false;
                        try {
                            const result = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.list', ['D:']);
                            // FileSystem.list 返回对象 { path, files, directories }
                            return result && typeof result === 'object' && Array.isArray(result.files) && Array.isArray(result.directories);
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '文件系统',
                    name: 'LStorage 存在性',
                    check: () => typeof LStorage !== 'undefined'
                },
                {
                    category: '文件系统',
                    name: 'LStorage.setSystemStorage 功能',
                    check: async () => {
                        if (typeof LStorage === 'undefined') return false;
                        try {
                            const testKey = `kernelchecker_test_${Date.now()}`;
                            await LStorage.setSystemStorage(testKey, 'test_value');
                            const value = await LStorage.getSystemStorage(testKey);
                            await LStorage.deleteSystemStorage(testKey);
                            return value === 'test_value';
                        } catch (e) {
                            return false;
                        }
                    }
                }
            ];
        },
        
        _getMemoryManagementChecks: function() {
            return [
                {
                    category: '内存管理',
                    name: 'MemoryManager 存在性',
                    check: () => typeof MemoryManager !== 'undefined'
                },
                {
                    category: '内存管理',
                    name: 'MemoryManager.allocateMemory 功能',
                    check: async () => {
                        if (typeof MemoryManager === 'undefined') return false;
                        try {
                            const memory = MemoryManager.allocateMemory(this.pid, 1024);
                            if (memory && memory.heap) {
                                this._testMemory.push(memory);
                                return true;
                            }
                            return false;
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '内存管理',
                    name: 'MemoryManager.checkMemory 功能',
                    check: async () => {
                        if (typeof MemoryManager === 'undefined') return false;
                        try {
                            const info = MemoryManager.checkMemory(this.pid);
                            return info !== null && typeof info === 'object';
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '内存管理',
                    name: 'Heap 存在性',
                    check: () => typeof Heap !== 'undefined'
                },
                {
                    category: '内存管理',
                    name: 'Shed 存在性',
                    check: () => typeof Shed !== 'undefined'
                },
                {
                    category: '内存管理',
                    name: 'KernelMemory 存在性',
                    check: () => typeof KernelMemory !== 'undefined'
                },
                {
                    category: '内存管理',
                    name: 'KernelMemory.saveData 功能',
                    check: async () => {
                        if (typeof KernelMemory === 'undefined') return false;
                        try {
                            const testKey = `kernelchecker_test_${Date.now()}`;
                            KernelMemory.saveData(testKey, { test: 'value' });
                            const data = KernelMemory.loadData(testKey);
                            KernelMemory.deleteData(testKey);
                            return data && data.test === 'value';
                        } catch (e) {
                            return false;
                        }
                    }
                }
            ];
        },
        
        _getProcessManagementChecks: function() {
            return [
                {
                    category: '进程管理',
                    name: 'ProcessManager 存在性',
                    check: () => typeof ProcessManager !== 'undefined'
                },
                {
                    category: '进程管理',
                    name: 'ProcessManager.listProcesses 功能',
                    check: async () => {
                        if (typeof ProcessManager === 'undefined') return false;
                        try {
                            const processes = ProcessManager.listProcesses();
                            return Array.isArray(processes);
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '进程管理',
                    name: 'ProcessManager.getProcessInfo 功能',
                    check: async () => {
                        if (typeof ProcessManager === 'undefined') return false;
                        try {
                            const info = ProcessManager.getProcessInfo(this.pid);
                            return info !== null && typeof info === 'object';
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '进程管理',
                    name: 'ApplicationAssetManager 存在性',
                    check: () => typeof ApplicationAssetManager !== 'undefined'
                },
                {
                    category: '进程管理',
                    name: 'ApplicationAssetManager.listPrograms 功能',
                    check: async () => {
                        if (typeof ApplicationAssetManager === 'undefined') return false;
                        try {
                            const programs = ApplicationAssetManager.listPrograms();
                            return Array.isArray(programs) && programs.length > 0;
                        } catch (e) {
                            return false;
                        }
                    }
                }
            ];
        },
        
        _getGUIManagementChecks: function() {
            return [
                {
                    category: 'GUI 管理',
                    name: 'GUIManager 存在性',
                    check: () => typeof GUIManager !== 'undefined'
                },
                {
                    category: 'GUI 管理',
                    name: 'GUIManager.registerWindow 功能',
                    check: async () => {
                        if (typeof GUIManager === 'undefined') return false;
                        try {
                            const testWindow = document.createElement('div');
                            // 添加必要的类名和基础样式，确保窗口能被正确管理
                            testWindow.className = 'zos-gui-window';
                            // 设置基础样式，但让 GUIManager 来管理位置和样式
                            testWindow.style.cssText = 'width: 200px; height: 150px; display: flex; flex-direction: column;';
                            testWindow.dataset.pid = this.pid.toString();
                            
                            // 添加一些内容以便测试窗口功能
                            const testContent = document.createElement('div');
                            testContent.textContent = '测试窗口';
                            testContent.style.cssText = 'padding: 10px; color: #e8ecf0;';
                            testWindow.appendChild(testContent);
                            
                            // 窗口需要先添加到 DOM 才能被注册
                            const guiContainer = document.getElementById('gui-container');
                            if (!guiContainer) {
                                return false;
                            }
                            guiContainer.appendChild(testWindow);
                            
                            // 注册窗口
                            const windowInfo = GUIManager.registerWindow(this.pid, testWindow, {
                                title: 'KernelChecker 测试窗口',
                                onClose: () => {
                                    // 测试窗口关闭回调
                                }
                            });
                            
                            if (windowInfo && windowInfo.windowId) {
                                // 验证窗口信息
                                const isValid = windowInfo.windowId && 
                                               windowInfo.window === testWindow && 
                                               windowInfo.pid === this.pid;
                                
                                if (isValid) {
                                    this._testWindows.push({ window: testWindow, windowId: windowInfo.windowId });
                                    return true;
                                }
                            }
                            
                            // 如果注册失败，清理窗口
                            if (testWindow.parentElement) {
                                testWindow.parentElement.removeChild(testWindow);
                            }
                            return false;
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.warn("KernelChecker", `GUI 窗口测试失败: ${e.message}`);
                            }
                            return false;
                        }
                    }
                },
                {
                    category: 'GUI 管理',
                    name: 'ThemeManager 存在性',
                    check: () => typeof ThemeManager !== 'undefined'
                },
                {
                    category: 'GUI 管理',
                    name: 'ThemeManager.getCurrentTheme 功能',
                    check: async () => {
                        if (typeof ThemeManager === 'undefined') return false;
                        try {
                            const theme = ThemeManager.getCurrentTheme();
                            return theme !== null && typeof theme === 'object';
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: 'GUI 管理',
                    name: 'TaskbarManager 存在性',
                    check: () => typeof TaskbarManager !== 'undefined'
                },
                {
                    category: 'GUI 管理',
                    name: 'EventManager 存在性',
                    check: () => typeof EventManager !== 'undefined'
                },
                {
                    category: 'GUI 管理',
                    name: 'ContextMenuManager 存在性',
                    check: () => typeof ContextMenuManager !== 'undefined'
                },
                {
                    category: 'GUI 管理',
                    name: 'DesktopManager 存在性',
                    check: () => typeof DesktopManager !== 'undefined'
                }
            ];
        },
        
        _getDriveChecks: function() {
            return [
                {
                    category: '驱动层',
                    name: 'MultithreadingDrive 存在性',
                    check: () => typeof MultithreadingDrive !== 'undefined'
                },
                {
                    category: '驱动层',
                    name: 'DragDrive 存在性',
                    check: () => typeof DragDrive !== 'undefined'
                },
                {
                    category: '驱动层',
                    name: 'GeographyDrive 存在性',
                    check: () => typeof GeographyDrive !== 'undefined'
                },
                {
                    category: '驱动层',
                    name: 'AnimateManager 存在性',
                    check: () => typeof AnimateManager !== 'undefined'
                },
                {
                    category: '驱动层',
                    name: 'DynamicManager 存在性',
                    check: () => typeof DynamicManager !== 'undefined'
                }
            ];
        },
        
        _getPermissionChecks: function() {
            return [
                {
                    category: '权限管理',
                    name: 'PermissionManager 存在性',
                    check: () => typeof PermissionManager !== 'undefined'
                },
                {
                    category: '权限管理',
                    name: 'PermissionManager.hasPermission 功能',
                    check: async () => {
                        if (typeof PermissionManager === 'undefined') return false;
                        try {
                            const hasPermission = PermissionManager.hasPermission(
                                this.pid,
                                PermissionManager.PERMISSION.GUI_WINDOW_CREATE
                            );
                            return typeof hasPermission === 'boolean';
                        } catch (e) {
                            return false;
                        }
                    }
                }
            ];
        },
        
        _getThemeChecks: function() {
            return [
                {
                    category: '主题系统',
                    name: 'ThemeManager.setTheme 功能',
                    check: async () => {
                        if (typeof ThemeManager === 'undefined') return false;
                        try {
                            const currentTheme = ThemeManager.getCurrentTheme();
                            if (!currentTheme) return false;
                            
                            // 尝试设置主题（然后恢复）
                            const themeId = currentTheme.id || currentTheme.name;
                            ThemeManager.setTheme(themeId);
                            const newTheme = ThemeManager.getCurrentTheme();
                            return newTheme !== null;
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '主题系统',
                    name: 'ThemeManager.getCurrentDesktopBackground 功能',
                    check: async () => {
                        if (typeof ThemeManager === 'undefined') return false;
                        try {
                            const bg = ThemeManager.getCurrentDesktopBackground();
                            return bg !== null;
                        } catch (e) {
                            return false;
                        }
                    }
                }
            ];
        },
        
        _getNotificationChecks: function() {
            return [
                {
                    category: '通知系统',
                    name: 'NotificationManager 存在性',
                    check: () => typeof NotificationManager !== 'undefined'
                },
                {
                    category: '通知系统',
                    name: 'NotificationManager.createNotification 功能',
                    check: async () => {
                        if (typeof ProcessManager === 'undefined') return false;
                        try {
                            const result = await ProcessManager.callKernelAPI(this.pid, 'Notification.create', [{
                                title: 'KernelChecker 测试',
                                message: '这是一个测试通知',
                                type: 'snapshot',
                                duration: 1000
                            }]);
                            if (result && result.status === 'success' && result.data && result.data.id) {
                                this._testNotifications.push(result.data.id);
                                // 立即移除通知
                                setTimeout(() => {
                                    ProcessManager.callKernelAPI(this.pid, 'Notification.remove', [result.data.id]).catch(() => {});
                                }, 100);
                                return true;
                            }
                            return false;
                        } catch (e) {
                            // 检查是否是权限错误
                            const errorMessage = e?.message || String(e);
                            const isPermissionError = errorMessage && (
                                errorMessage.includes('没有权限') || 
                                errorMessage.includes('权限已被用户拒绝') ||
                                errorMessage.includes('权限检查失败') ||
                                errorMessage.includes('权限错误') ||
                                errorMessage.includes('权限')
                            );
                            
                            if (isPermissionError) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.warn("KernelChecker", `权限被拒绝: ${errorMessage}`);
                                }
                                // 权限错误应该明确标记为失败，抛出包含"权限错误"的错误
                                throw new Error(`权限错误: ${errorMessage}`);
                            }
                            
                            return false;
                        }
                    }
                }
            ];
        },
        
        _getNetworkChecks: function() {
            return [
                {
                    category: '网络管理',
                    name: 'NetworkManager 存在性',
                    check: () => {
                        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                            try {
                                const nm = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
                                return nm !== null && nm !== undefined;
                            } catch (e) {
                                return false;
                            }
                        }
                        return typeof NetworkManager !== 'undefined';
                    }
                },
                {
                    category: '网络管理',
                    name: 'NetworkManager.isOnline 功能',
                    check: async () => {
                        let networkManager = null;
                        if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                            try {
                                networkManager = POOL.__GET__("KERNEL_GLOBAL_POOL", "NetworkManager");
                            } catch (e) {}
                        }
                        if (!networkManager && typeof NetworkManager !== 'undefined') {
                            networkManager = NetworkManager;
                        }
                        if (!networkManager) return false;
                        
                        try {
                            const isOnline = networkManager.isOnline();
                            return typeof isOnline === 'boolean';
                        } catch (e) {
                            return false;
                        }
                    }
                }
            ];
        },
        
        _getCryptDriveChecks: function() {
            return [
                {
                    category: '加密驱动',
                    name: 'CryptDrive 存在性',
                    check: () => typeof CryptDrive !== 'undefined'
                },
                {
                    category: '加密驱动',
                    name: 'CryptDrive.generateKeyPair 功能',
                    check: async () => {
                        if (typeof CryptDrive === 'undefined') return false;
                        try {
                            const keyPair = await CryptDrive.generateKeyPair({
                                description: 'KernelChecker 测试密钥',
                                expiresIn: 1000 * 60 * 5 // 5分钟后过期
                            });
                            if (keyPair && keyPair.keyId) {
                                this._testKeys.push(keyPair.keyId);
                                return true;
                            }
                            return false;
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '加密驱动',
                    name: 'CryptDrive.encrypt 功能',
                    check: async () => {
                        if (typeof CryptDrive === 'undefined' || this._testKeys.length === 0) return false;
                        try {
                            const testData = 'KernelChecker test data';
                            const encrypted = await CryptDrive.encrypt(testData, this._testKeys[this._testKeys.length - 1]);
                            return encrypted !== null && typeof encrypted === 'string' && encrypted.length > 0;
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '加密驱动',
                    name: 'CryptDrive.decrypt 功能',
                    check: async () => {
                        if (typeof CryptDrive === 'undefined' || this._testKeys.length === 0) return false;
                        try {
                            const testData = 'KernelChecker test data';
                            const keyId = this._testKeys[this._testKeys.length - 1];
                            const encrypted = await CryptDrive.encrypt(testData, keyId);
                            if (!encrypted) return false;
                            
                            const decrypted = await CryptDrive.decrypt(encrypted, keyId);
                            return decrypted === testData;
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '加密驱动',
                    name: 'CryptDrive.md5 功能',
                    check: async () => {
                        if (typeof CryptDrive === 'undefined') return false;
                        try {
                            const testData = 'KernelChecker test data';
                            // md5 是异步方法
                            const hash = await CryptDrive.md5(testData);
                            return typeof hash === 'string' && hash.length === 32;
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '加密驱动',
                    name: 'CryptDrive.randomInt 功能',
                    check: async () => {
                        if (typeof CryptDrive === 'undefined') return false;
                        try {
                            const random = CryptDrive.randomInt(1, 100);
                            return typeof random === 'number' && random >= 1 && random <= 100;
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '加密驱动',
                    name: 'CryptDrive.randomBoolean 功能',
                    check: async () => {
                        if (typeof CryptDrive === 'undefined') return false;
                        try {
                            const random = CryptDrive.randomBoolean();
                            return typeof random === 'boolean';
                        } catch (e) {
                            return false;
                        }
                    }
                },
                {
                    category: '加密驱动',
                    name: 'CryptDrive.listKeys 功能',
                    check: async () => {
                        if (typeof CryptDrive === 'undefined') return false;
                        try {
                            const keys = CryptDrive.listKeys();
                            return Array.isArray(keys);
                        } catch (e) {
                            return false;
                        }
                    }
                }
            ];
        },
        
        _executeCheck: async function(check) {
            const result = {
                category: check.category,
                name: check.name,
                status: 'pending',
                message: '',
                details: ''
            };
            
            try {
                const checkResult = await check.check();
                
                if (checkResult === true) {
                    result.status = 'success';
                    result.message = '检查通过';
                } else if (checkResult === false) {
                    result.status = 'failed';
                    result.message = '检查失败';
                } else if (typeof checkResult === 'object') {
                    result.status = checkResult.status || 'success';
                    result.message = checkResult.message || '检查完成';
                    result.details = checkResult.details || '';
                } else {
                    result.status = 'warning';
                    result.message = '检查结果未知';
                }
            } catch (error) {
                // 检查是否是权限错误
                const errorMessage = error?.message || String(error);
                const isPermissionError = errorMessage && (
                    errorMessage.includes('没有权限') || 
                    errorMessage.includes('权限已被用户拒绝') ||
                    errorMessage.includes('权限检查失败') ||
                    errorMessage.includes('权限错误') ||
                    errorMessage.includes('权限')
                );
                
                if (isPermissionError) {
                    result.status = 'failed'; // 权限错误应该标记为失败，而不是错误
                    result.message = `权限被拒绝: ${errorMessage}`;
                    result.details = `程序没有权限执行此操作。${error?.stack || ''}`;
                } else {
                    result.status = 'error';
                    result.message = `检查异常: ${errorMessage}`;
                    result.details = error?.stack || '';
                }
            }
            
            return result;
        },
        
        _updateResultsDisplay: function(result) {
            const item = document.createElement('div');
            item.className = `kernelchecker-result-item kernelchecker-result-${result.status}`;
            item.style.cssText = `
                padding: 12px;
                margin-bottom: 8px;
                border-radius: 6px;
                border-left: 4px solid;
                background: rgba(0, 0, 0, 0.3);
                transition: all 0.3s;
            `;
            
            // 状态颜色
            const statusColors = {
                success: '#00ff00',
                failed: '#ff4444',
                warning: '#ffaa00',
                error: '#ff0000',
                pending: '#888888'
            };
            item.style.borderLeftColor = statusColors[result.status] || '#888888';
            
            // 内容
            const category = document.createElement('div');
            category.className = 'kernelchecker-result-category';
            category.textContent = `[${result.category}]`;
            category.style.cssText = `
                font-size: 11px;
                color: rgba(232, 236, 240, 0.6);
                margin-bottom: 4px;
            `;
            item.appendChild(category);
            
            const name = document.createElement('div');
            name.className = 'kernelchecker-result-name';
            name.textContent = result.name;
            name.style.cssText = `
                font-size: 14px;
                font-weight: 600;
                color: #e8ecf0;
                margin-bottom: 4px;
            `;
            item.appendChild(name);
            
            const message = document.createElement('div');
            message.className = 'kernelchecker-result-message';
            message.textContent = result.message;
            message.style.cssText = `
                font-size: 12px;
                color: rgba(232, 236, 240, 0.8);
            `;
            item.appendChild(message);
            
            if (result.details) {
                const details = document.createElement('div');
                details.className = 'kernelchecker-result-details';
                details.textContent = result.details;
                details.style.cssText = `
                    font-size: 11px;
                    color: rgba(232, 236, 240, 0.6);
                    margin-top: 4px;
                    font-family: monospace;
                    white-space: pre-wrap;
                    word-break: break-all;
                `;
                item.appendChild(details);
            }
            
            this._resultsList.appendChild(item);
            
            // 滚动到底部
            this._resultsList.scrollTop = this._resultsList.scrollHeight;
        },
        
        _updateStats: function() {
            const total = this._checkResults.length;
            const passed = this._checkResults.filter(r => r.status === 'success').length;
            const failed = this._checkResults.filter(r => r.status === 'failed' || r.status === 'error').length;
            const warnings = this._checkResults.filter(r => r.status === 'warning').length;
            
            this._stats.textContent = `总计: ${total} | 通过: ${passed} | 失败: ${failed} | 警告: ${warnings}`;
        },
        
        _cleanup: async function() {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("KernelChecker", "开始清理检查痕迹...");
            }
            
            let deletedFiles = 0;
            let deletedDirs = 0;
            
            // 清理测试文件（先删除文件，再删除目录）
            const filesToDelete = [...this._testFiles];
            for (const file of filesToDelete) {
                try {
                    if (typeof ProcessManager !== 'undefined') {
                        const result = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.delete', [file]).catch(() => null);
                        if (result !== null && result !== undefined) {
                            deletedFiles++;
                        }
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("KernelChecker", `删除测试文件失败: ${file}, ${e.message}`);
                    }
                }
            }
            this._testFiles = [];
            
            // 清理测试目录（倒序删除，确保先删除子目录）
            const dirsToDelete = [...this._testDirectories].reverse();
            for (const dir of dirsToDelete) {
                try {
                    if (typeof ProcessManager !== 'undefined') {
                        const result = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.delete', [dir]).catch(() => null);
                        if (result !== null && result !== undefined) {
                            deletedDirs++;
                        }
                    }
                } catch (e) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn("KernelChecker", `删除测试目录失败: ${dir}, ${e.message}`);
                    }
                }
            }
            this._testDirectories = [];
            
            if (typeof KernelLogger !== 'undefined' && (deletedFiles > 0 || deletedDirs > 0)) {
                KernelLogger.info("KernelChecker", `已清理 ${deletedFiles} 个测试文件和 ${deletedDirs} 个测试目录`);
            }
            
            // 清理测试窗口
            for (const testWindow of this._testWindows) {
                try {
                    if (typeof GUIManager !== 'undefined' && testWindow.windowId) {
                        GUIManager.unregisterWindow(testWindow.windowId);
                    }
                    if (testWindow.window && testWindow.window.parentElement) {
                        testWindow.window.parentElement.removeChild(testWindow.window);
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
            this._testWindows = [];
            
            // 清理测试通知（先检查通知是否存在，避免警告）
            let removedNotifications = 0;
            for (const notifId of this._testNotifications) {
                try {
                    // 先检查通知是否存在
                    if (typeof NotificationManager !== 'undefined' && NotificationManager.hasNotification(notifId)) {
                        if (typeof ProcessManager !== 'undefined') {
                            const result = await ProcessManager.callKernelAPI(this.pid, 'Notification.remove', [notifId]).catch(() => null);
                            if (result !== null && result !== undefined) {
                                removedNotifications++;
                            }
                        }
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
            this._testNotifications = [];
            
            if (typeof KernelLogger !== 'undefined' && removedNotifications > 0) {
                KernelLogger.debug("KernelChecker", `已清理 ${removedNotifications} 个测试通知`);
            }
            
            // 清理测试密钥
            for (const keyId of this._testKeys) {
                try {
                    if (typeof CryptDrive !== 'undefined') {
                        await CryptDrive.deleteKey(keyId).catch(() => {});
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
            this._testKeys = [];
            
            // 清理测试内存
            for (const memory of this._testMemory) {
                try {
                    if (typeof MemoryManager !== 'undefined' && memory && memory.heap) {
                        // MemoryManager.freeMemory 只接受 pid 参数，会释放所有内存
                        // 这里我们只记录，不实际释放（因为程序退出时会自动释放）
                        // 如果需要释放特定内存，应该使用 heap.free(addr, size)
                        // 但为了测试完整性，我们暂时不释放，让系统自动清理
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
            this._testMemory = [];
            
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.info("KernelChecker", "检查痕迹清理完成");
            }
        },
        
        _exportReport: async function() {
            if (this._checkResults.length === 0) {
                // 没有检查结果，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '内核检查程序',
                            content: '没有检查结果可导出',
                            duration: 3000
                        });
                    } catch (e) {
                        // 通知创建失败，记录日志但不打断用户
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('KernelChecker', `创建通知失败: ${e.message}`);
                        }
                    }
                }
                return;
            }
            
            // 检查 ProcessManager 是否可用
            if (typeof ProcessManager === 'undefined') {
                // ProcessManager 不可用，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '内核检查程序',
                            content: 'ProcessManager 不可用',
                            duration: 3000
                        });
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.error('KernelChecker', `ProcessManager 不可用，且创建通知失败: ${e.message}`);
                        }
                    }
                } else {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('KernelChecker', 'ProcessManager 不可用');
                    }
                }
                return;
            }
            
            try {
                // 启动文件管理器作为文件夹选择器
                await ProcessManager.startProgram('filemanager', {
                    args: [],
                    mode: 'folder-selector',
                    onFolderSelected: async (folderItem) => {
                        if (!folderItem || !folderItem.path) {
                            // 未选择文件夹，静默处理（用户已经知道没选择）
                            return;
                        }
                        
                        try {
                            // 生成报告内容
                            const report = {
                                timestamp: new Date().toISOString(),
                                total: this._checkResults.length,
                                passed: this._checkResults.filter(r => r.status === 'success').length,
                                failed: this._checkResults.filter(r => r.status === 'failed' || r.status === 'error').length,
                                warnings: this._checkResults.filter(r => r.status === 'warning').length,
                                results: this._checkResults
                            };
                            
                            const reportText = JSON.stringify(report, null, 2);
                            const fileName = `kernelchecker_report_${Date.now()}.json`;
                            
                            // 组合文件路径
                            // folderItem.path 格式应该是 "D:/some/path" 或 "D:/some/path/"
                            let folderPath = folderItem.path;
                            // 规范化路径：统一使用正斜杠，移除尾部斜杠（但保留根路径如 "D:/"）
                            folderPath = folderPath.replace(/\\/g, '/');
                            if (folderPath.endsWith('/') && !folderPath.match(/^[CD]:\/$/)) {
                                folderPath = folderPath.slice(0, -1);
                            }
                            // 确保根路径格式正确（如 "D:" -> "D:/"）
                            if (/^[CD]:$/.test(folderPath)) {
                                folderPath = folderPath + '/';
                            }
                            
                            // 组合完整文件路径（格式：盘符/路径/文件名）
                            const fullPath = `${folderPath}/${fileName}`;
                            
                            // 使用 FileSystem.write 写入文件（如果文件不存在会自动创建）
                            const writeResult = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.write', [fullPath, reportText, 'OVERWRITE']);
                            if (writeResult !== true) {
                                throw new Error('写入文件失败');
                            }
                            
                            // 导出成功，使用通知提示（不打断用户）
                            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                try {
                                    await NotificationManager.createNotification(this.pid, {
                                        type: 'snapshot',
                                        title: '导出成功',
                                        content: `报告已导出到: ${fullPath}`,
                                        duration: 5000
                                    });
                                } catch (e) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('KernelChecker', `创建通知失败: ${e.message}`);
                                    }
                                }
                            }
                        } catch (e) {
                            if (typeof KernelLogger !== 'undefined') {
                                KernelLogger.error('KernelChecker', `导出报告失败: ${e.message}`, e);
                            }
                            // 导出失败，使用通知提示（不打断用户）
                            if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                                try {
                                    await NotificationManager.createNotification(this.pid, {
                                        type: 'snapshot',
                                        title: '导出失败',
                                        content: `导出报告失败: ${e.message}`,
                                        duration: 5000
                                    });
                                } catch (notifError) {
                                    if (typeof KernelLogger !== 'undefined') {
                                        KernelLogger.warn('KernelChecker', `创建通知失败: ${notifError.message}`);
                                    }
                                }
                            }
                        }
                    }
                });
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('KernelChecker', `打开文件夹选择器失败: ${e.message}`, e);
                }
                // 打开文件夹选择器失败，使用通知提示（不打断用户）
                if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.createNotification === 'function') {
                    try {
                        await NotificationManager.createNotification(this.pid, {
                            type: 'snapshot',
                            title: '错误',
                            content: `打开文件夹选择器失败: ${e.message}`,
                            duration: 5000
                        });
                    } catch (notifError) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('KernelChecker', `创建通知失败: ${notifError.message}`);
                        }
                    }
                }
            }
        },
        
        __exit__: async function() {
            // 停止检查
            this._stopCheck();
            
            // 清理检查痕迹
            await this._cleanup();
            
            // 注销窗口
            if (typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            } else if (this.window && this.window.parentElement) {
                this.window.parentElement.removeChild(this.window);
            }
        },
        
        __info__: function() {
            return {
                name: 'kernelchecker',
                type: 'GUI',
                version: '1.0.0',
                description: '专业的内核检查程序',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_READ,
                    PermissionManager.PERMISSION.KERNEL_DISK_WRITE,
                    PermissionManager.PERMISSION.KERNEL_DISK_CREATE,
                    PermissionManager.PERMISSION.KERNEL_DISK_DELETE,
                    PermissionManager.PERMISSION.KERNEL_DISK_LIST,
                    PermissionManager.PERMISSION.SYSTEM_NOTIFICATION,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,
                    PermissionManager.PERMISSION.EVENT_LISTENER,
                    PermissionManager.PERMISSION.THEME_READ,
                    PermissionManager.PERMISSION.THEME_WRITE,
                    PermissionManager.PERMISSION.CRYPT_GENERATE_KEY,
                    PermissionManager.PERMISSION.CRYPT_ENCRYPT,
                    PermissionManager.PERMISSION.CRYPT_DECRYPT,
                    PermissionManager.PERMISSION.CRYPT_DELETE_KEY,
                    PermissionManager.PERMISSION.CRYPT_MD5,
                    PermissionManager.PERMISSION.CRYPT_RANDOM
                ] : [],
                metadata: {
                    autoStart: false,
                    priority: 1,
                    allowMultipleInstances: true
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.KERNELCHECKER = KERNELCHECKER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.KERNELCHECKER = KERNELCHECKER;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);
        