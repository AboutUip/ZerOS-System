// ZerOS 扫雷游戏
// 仿Windows经典扫雷游戏

(function(window) {
    'use strict';
    
    const MINESWEEPER = {
        pid: null,
        window: null,
        windowId: null,
        
        // 游戏配置
        difficulty: 'beginner', // 'beginner', 'intermediate', 'expert'
        difficulties: {
            beginner: { rows: 9, cols: 9, mines: 10 },
            intermediate: { rows: 16, cols: 16, mines: 40 },
            expert: { rows: 16, cols: 30, mines: 99 }
        },
        
        // 游戏状态
        board: [], // 游戏板：-1=地雷, 0-8=周围地雷数
        revealed: [], // 已揭开的格子
        flagged: [], // 已标记的格子
        gameState: 'ready', // 'ready', 'playing', 'won', 'lost'
        firstClick: true,
        startTime: null,
        timer: null,
        timerInterval: null,
        
        // UI元素引用
        mineCountDisplay: null,
        faceButton: null,
        timerDisplay: null,
        gameBoard: null,
        difficultyMenu: null,
        contextMenuId: null, // 上下文菜单拦截器ID
        contextMenuId2: null, // 上下文菜单拦截器ID 2
        contextMenuId3: null, // 上下文菜单拦截器ID 3
        
        // 事件监听器
        _eventHandlers: [],
        
        __init__: async function(pid, initArgs) {
            this.pid = pid;
            
            try {
                // 获取 GUI 容器
                const guiContainer = initArgs.guiContainer || document.getElementById('gui-container');
                
                // 创建主窗口
                this.window = document.createElement('div');
                this.window.className = 'minesweeper-window zos-gui-window';
                this.window.dataset.pid = pid.toString();
                
                // 在 document 级别注册拦截器（必须在窗口创建后，因为需要检查 .minesweeper-window）
                // 使用捕获阶段，并确保在 ContextMenuManager 之前执行
                if (typeof document !== 'undefined') {
                    const documentInterceptor = (e) => {
                        // 检查是否点击在扫雷窗口中
                        const minesweeperWindow = e.target.closest('.minesweeper-window');
                        if (minesweeperWindow && minesweeperWindow.dataset.pid === pid.toString()) {
                            // 如果点击在游戏格子上，不阻止事件传播，让格子自己的监听器处理
                            if (e.target.closest('.minesweeper-cell')) {
                                // 只阻止默认行为，但不阻止事件传播
                                e.preventDefault();
                                return;
                            }
                            // 如果点击在其他区域，阻止默认行为和事件传播
                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                        }
                    };
                    // 只注册一次，使用 _addEventHandler 管理
                    this._addEventHandler(document, 'contextmenu', documentInterceptor, true);
                }
                
                // 在窗口级别直接阻止右键菜单（最优先拦截）
                this._addEventHandler(this.window, 'contextmenu', (e) => {
                    // 如果点击在游戏格子上，不阻止事件传播，让格子自己的监听器处理
                    if (e.target.closest('.minesweeper-cell')) {
                        // 只阻止默认行为，但不阻止事件传播
                        e.preventDefault();
                        return;
                    }
                    // 如果点击在其他区域，阻止默认菜单
                    if (e.target.closest('.minesweeper-board') || 
                        e.target.closest('.minesweeper-board-container') ||
                        e.target.closest('.minesweeper-window')) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }, true); // 使用捕获阶段，确保最早处理
                
                // 窗口样式（根据难度设置初始大小）
                const config = this.difficulties[this.difficulty];
                const menuBarHeight = 22; // 固定菜单栏高度
                const controlPanelHeight = 50; // 固定控制面板高度
                const boardWidth = config.cols * 16 + 16; // 格子宽度 + 边框
                const boardHeight = config.rows * 16 + 16; // 格子高度 + 边框
                const windowWidth = Math.max(300, boardWidth + 16); // 最小宽度300px
                const windowHeight = menuBarHeight + controlPanelHeight + boardHeight + 16; // 菜单栏 + 控制面板 + 游戏板 + 边距
                
                if (typeof GUIManager === 'undefined') {
                    this.window.style.cssText = `
                        position: fixed;
                        width: ${windowWidth}px;
                        height: ${windowHeight}px;
                        background: var(--theme-background-elevated, #c0c0c0);
                        border: 2px outset #ffffff;
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                    `;
                } else {
                    this.window.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        background: var(--theme-background-elevated, #c0c0c0);
                        width: ${windowWidth}px;
                        height: ${windowHeight}px;
                    `;
                }
                
                // 先添加到容器（必须在注册窗口之前）
                guiContainer.appendChild(this.window);
                
                // 使用GUIManager注册窗口
                if (typeof GUIManager !== 'undefined') {
                    let icon = null;
                    if (typeof ApplicationAssetManager !== 'undefined') {
                        icon = ApplicationAssetManager.getIcon('minesweeper');
                    }
                    
                    const windowInfo = GUIManager.registerWindow(pid, this.window, {
                        title: '扫雷',
                        icon: icon,
                        onClose: () => {
                            if (typeof ProcessManager !== 'undefined') {
                                ProcessManager.killProgram(this.pid);
                            }
                        }
                    });
                    
                    if (windowInfo && windowInfo.windowId) {
                        this.windowId = windowInfo.windowId;
                    }
                }
                
                // 创建游戏界面（延迟创建，避免阻塞）
                this._createGameUI();
                
                // 初始化游戏
                this._initGame();
                
                // 如果使用GUIManager，窗口已自动居中并获得焦点
                if (typeof GUIManager !== 'undefined') {
                    GUIManager.focusWindow(pid);
                }
                
                // 注册高优先级的自定义菜单来拦截默认菜单（在游戏板上）
                this._registerContextMenuInterceptor();
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("MINESWEEPER", `初始化失败: ${error.message}`, error);
                } else {
                    console.error('扫雷游戏初始化失败:', error);
                }
            }
        },
        
        /**
         * 注册上下文菜单拦截器（拦截ContextMenuManager的默认菜单）
         */
        _registerContextMenuInterceptor: function() {
            if (typeof ContextMenuManager === 'undefined' || !this.pid) {
                return;
            }
            
            // 注册多个高优先级的菜单，覆盖所有可能的上下文类型
            // 注意：返回 null 而不是空数组，这样系统菜单就不会显示
            // 1. 拦截 'desktop' 上下文（扫雷窗口在 gui-container 中，会被判断为 desktop）
            this.contextMenuId = ContextMenuManager.registerContextMenu(this.pid, {
                context: 'desktop',
                selector: '.minesweeper-window, .minesweeper-cell, .minesweeper-board, .minesweeper-board-container',
                priority: 1000, // 非常高的优先级，确保优先于默认菜单
                items: (target) => {
                    // 如果点击在扫雷窗口内的任何地方，返回一个特殊标记，让系统知道要阻止菜单
                    // 但实际上，由于事件已经被阻止，这个函数可能不会被调用
                    if (target.closest('.minesweeper-window')) {
                        // 返回一个包含特殊标记的数组，但长度为0，这样 mergedItems.length 会是 0
                        // 但我们需要确保系统菜单也不显示
                        // 实际上，由于事件已经被阻止，这个函数不应该被调用
                        return []; // 返回空数组
                    }
                    // 其他情况返回 null，让默认菜单处理
                    return null;
                }
            });
            
            // 2. 拦截 'default' 上下文（作为后备）
            this.contextMenuId2 = ContextMenuManager.registerContextMenu(this.pid, {
                context: 'default',
                selector: '.minesweeper-window, .minesweeper-cell, .minesweeper-board, .minesweeper-board-container',
                priority: 1000,
                items: (target) => {
                    if (target.closest('.minesweeper-window')) {
                        return null; // 返回 null，阻止显示任何菜单
                    }
                    return null;
                }
            });
            
            // 3. 拦截 '*' 上下文（匹配所有上下文，作为最终后备）
            this.contextMenuId3 = ContextMenuManager.registerContextMenu(this.pid, {
                context: '*',
                selector: '.minesweeper-window, .minesweeper-cell, .minesweeper-board, .minesweeper-board-container',
                priority: 1000,
                items: (target) => {
                    if (target.closest('.minesweeper-window')) {
                        return null; // 返回 null，阻止显示任何菜单
                    }
                    return null;
                }
            });
        },
        
        /**
         * 创建游戏UI
         */
        _createGameUI: function() {
            // 菜单栏
            const menuBar = document.createElement('div');
            menuBar.className = 'minesweeper-menu-bar';
            menuBar.style.cssText = `
                height: 22px;
                min-height: 22px;
                max-height: 22px;
                background: #c0c0c0;
                border-bottom: 1px solid #808080;
                display: flex;
                align-items: center;
                padding: 0 4px;
                font-size: 11px;
                user-select: none;
                flex-shrink: 0;
            `;
            
            const gameMenu = document.createElement('div');
            gameMenu.textContent = '游戏(G)';
            gameMenu.style.cssText = `
                padding: 2px 8px;
                cursor: pointer;
                color: #000;
            `;
            this._addEventHandler(gameMenu, 'click', (e) => {
                e.stopPropagation();
                this._showDifficultyMenu();
            });
            menuBar.appendChild(gameMenu);
            
            this.window.appendChild(menuBar);
            
            // 控制面板
            const controlPanel = document.createElement('div');
            controlPanel.className = 'minesweeper-control-panel';
            controlPanel.style.cssText = `
                height: 50px;
                min-height: 50px;
                max-height: 50px;
                padding: 8px;
                background: #c0c0c0;
                border: 2px inset #808080;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
                box-sizing: border-box;
            `;
            
            // 地雷计数显示
            const mineCountContainer = document.createElement('div');
            mineCountContainer.style.cssText = `
                width: 39px;
                height: 23px;
                background: #000;
                color: #f00;
                font-family: 'Courier New', monospace;
                font-size: 20px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px inset #808080;
            `;
            this.mineCountDisplay = document.createElement('span');
            this.mineCountDisplay.textContent = '010';
            mineCountContainer.appendChild(this.mineCountDisplay);
            controlPanel.appendChild(mineCountContainer);
            
            // 笑脸按钮
            this.faceButton = document.createElement('button');
            this.faceButton.className = 'minesweeper-face-button';
            this.faceButton.textContent = '😊';
            this.faceButton.style.cssText = `
                width: 26px;
                height: 26px;
                font-size: 20px;
                border: 2px outset #ffffff;
                background: #c0c0c0;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                user-select: none;
            `;
            this._addEventHandler(this.faceButton, 'mousedown', (e) => {
                if (e.button === 0) {
                    this.faceButton.style.border = '2px inset #808080';
                }
            });
            this._addEventHandler(this.faceButton, 'mouseup', (e) => {
                if (e.button === 0) {
                    this.faceButton.style.border = '2px outset #ffffff';
                    this._resetGame();
                }
            });
            this._addEventHandler(this.faceButton, 'mouseleave', () => {
                this.faceButton.style.border = '2px outset #ffffff';
            });
            controlPanel.appendChild(this.faceButton);
            
            // 计时器显示
            const timerContainer = document.createElement('div');
            timerContainer.style.cssText = `
                width: 39px;
                height: 23px;
                background: #000;
                color: #f00;
                font-family: 'Courier New', monospace;
                font-size: 20px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px inset #808080;
            `;
            this.timerDisplay = document.createElement('span');
            this.timerDisplay.textContent = '000';
            timerContainer.appendChild(this.timerDisplay);
            controlPanel.appendChild(timerContainer);
            
            this.window.appendChild(controlPanel);
            
            // 游戏板容器
            const boardContainer = document.createElement('div');
            boardContainer.className = 'minesweeper-board-container';
            boardContainer.style.cssText = `
                padding: 8px;
                background: #c0c0c0;
                border: 2px inset #808080;
                flex: 1;
                overflow: auto;
                display: flex;
                justify-content: center;
                align-items: flex-start;
            `;
            
            // 在游戏板容器上阻止右键菜单冒泡（拦截ContextMenuManager）
            // 注意：不阻止事件传播到游戏格子，让格子自己的监听器处理
            this._addEventHandler(boardContainer, 'contextmenu', (e) => {
                // 如果点击在游戏格子上，只阻止默认行为，不阻止事件传播
                if (e.target.closest('.minesweeper-cell')) {
                    e.preventDefault();
                    // 不调用 stopPropagation，让事件继续传播到格子元素
                    return;
                }
                // 如果点击在其他区域，阻止默认菜单
                e.preventDefault();
                e.stopPropagation();
            }, true); // 使用捕获阶段，确保优先处理
            
            this.gameBoard = document.createElement('div');
            this.gameBoard.className = 'minesweeper-board';
            this.gameBoard.style.cssText = `
                display: inline-grid;
                gap: 0;
                border: 2px outset #ffffff;
                background: #c0c0c0;
            `;
            
            // 在游戏板上也阻止右键菜单冒泡
            // 注意：不阻止事件传播到游戏格子，让格子自己的监听器处理
            this._addEventHandler(this.gameBoard, 'contextmenu', (e) => {
                if (e.target.closest('.minesweeper-cell')) {
                    e.preventDefault();
                    // 不调用 stopPropagation，让事件继续传播到格子元素
                    return;
                }
                // 如果点击在其他区域，阻止默认菜单
                e.preventDefault();
                e.stopPropagation();
            }, true); // 使用捕获阶段
            
            boardContainer.appendChild(this.gameBoard);
            this.window.appendChild(boardContainer);
        },
        
        /**
         * 初始化游戏
         */
        _initGame: function() {
            const config = this.difficulties[this.difficulty];
            this._initBoard(config.rows, config.cols, config.mines);
            this._renderBoard();
            this._updateMineCount();
            this._updateFace('ready');
            this._updateTimer(0);
        },
        
        /**
         * 初始化游戏板
         */
        _initBoard: function(rows, cols, mines) {
            this.board = [];
            this.revealed = [];
            this.flagged = [];
            this.gameState = 'ready';
            this.firstClick = true;
            this.startTime = null;
            
            // 初始化数组
            for (let i = 0; i < rows; i++) {
                this.board[i] = [];
                this.revealed[i] = [];
                this.flagged[i] = [];
                for (let j = 0; j < cols; j++) {
                    this.board[i][j] = 0;
                    this.revealed[i][j] = false;
                    this.flagged[i][j] = false;
                }
            }
        },
        
        /**
         * 生成地雷（在第一次点击后）
         */
        _generateMines: function(firstRow, firstCol, rows, cols, mines) {
            let placed = 0;
            while (placed < mines) {
                const row = Math.floor(Math.random() * rows);
                const col = Math.floor(Math.random() * cols);
                
                // 确保第一次点击的位置及其周围没有地雷
                if (Math.abs(row - firstRow) <= 1 && Math.abs(col - firstCol) <= 1) {
                    continue;
                }
                
                if (this.board[row][col] !== -1) {
                    this.board[row][col] = -1;
                    placed++;
                }
            }
            
            // 计算每个格子的数字
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    if (this.board[i][j] !== -1) {
                        let count = 0;
                        for (let di = -1; di <= 1; di++) {
                            for (let dj = -1; dj <= 1; dj++) {
                                if (di === 0 && dj === 0) continue;
                                const ni = i + di;
                                const nj = j + dj;
                                if (ni >= 0 && ni < rows && nj >= 0 && nj < cols) {
                                    if (this.board[ni][nj] === -1) {
                                        count++;
                                    }
                                }
                            }
                        }
                        this.board[i][j] = count;
                    }
                }
            }
        },
        
        /**
         * 渲染游戏板（优化：使用文档片段批量添加，提高性能）
         */
        _renderBoard: function() {
            this.gameBoard.innerHTML = '';
            const config = this.difficulties[this.difficulty];
            const rows = config.rows;
            const cols = config.cols;
            
            this.gameBoard.style.gridTemplateColumns = `repeat(${cols}, 16px)`;
            this.gameBoard.style.gridTemplateRows = `repeat(${rows}, 16px)`;
            
            // 使用文档片段批量添加，减少重排
            const fragment = document.createDocumentFragment();
            
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    const cell = document.createElement('div');
                    cell.className = 'minesweeper-cell';
                    cell.dataset.row = i;
                    cell.dataset.col = j;
                    cell.style.cssText = `
                        width: 16px;
                        height: 16px;
                        background: #c0c0c0;
                        border: 1px outset #ffffff;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 11px;
                        font-weight: bold;
                        font-family: 'Courier New', monospace;
                        cursor: pointer;
                        user-select: none;
                    `;
                    
                    // 事件监听器（统一使用 _addEventHandler 管理）
                    // 使用闭包保存 i, j 的值
                    const row = i;
                    const col = j;
                    this._addEventHandler(cell, 'mousedown', (e) => {
                        if (e.button === 0 && !this.flagged[row][col]) {
                            cell.style.border = '1px inset #808080';
                        }
                    });
                    this._addEventHandler(cell, 'click', (e) => {
                        if (e.button === 0 || !e.button) {
                            this._handleCellClick(row, col);
                        }
                    });
                    this._addEventHandler(cell, 'contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation(); // 阻止事件冒泡到ContextMenuManager
                        // 注意：不使用 stopImmediatePropagation，确保事件能正常处理
                        this._handleCellRightClick(row, col);
                    });
                    
                    fragment.appendChild(cell);
                }
            }
            
            // 一次性添加所有格子，减少DOM操作
            this.gameBoard.appendChild(fragment);
        },
        
        /**
         * 处理格子点击
         */
        _handleCellClick: function(row, col) {
            if (this.gameState === 'won' || this.gameState === 'lost') {
                return;
            }
            
            if (this.flagged[row][col]) {
                return;
            }
            
            // 第一次点击时生成地雷
            if (this.firstClick) {
                const config = this.difficulties[this.difficulty];
                this._generateMines(row, col, config.rows, config.cols, config.mines);
                this.firstClick = false;
                this.gameState = 'playing';
                this.startTime = Date.now();
                this._startTimer();
                this._updateFace('playing');
            }
            
            if (this.revealed[row][col]) {
                return;
            }
            
            // 揭开格子
            this._revealCell(row, col);
            
            // 检查游戏状态
            this._checkGameState();
        },
        
        /**
         * 处理格子右键点击
         */
        _handleCellRightClick: function(row, col) {
            if (this.gameState === 'won' || this.gameState === 'lost') {
                return;
            }
            
            if (this.revealed[row][col]) {
                return;
            }
            
            // 切换标记状态
            this.flagged[row][col] = !this.flagged[row][col];
            this._updateCell(row, col);
            this._updateMineCount();
        },
        
        /**
         * 揭开格子
         */
        _revealCell: function(row, col) {
            if (this.revealed[row][col] || this.flagged[row][col]) {
                return;
            }
            
            this.revealed[row][col] = true;
            
            const config = this.difficulties[this.difficulty];
            const rows = config.rows;
            const cols = config.cols;
            
            // 如果是地雷，游戏结束
            if (this.board[row][col] === -1) {
                this.gameState = 'lost';
                this._endGame();
                return;
            }
            
            // 如果是0，自动揭开周围
            if (this.board[row][col] === 0) {
                for (let di = -1; di <= 1; di++) {
                    for (let dj = -1; dj <= 1; dj++) {
                        if (di === 0 && dj === 0) continue;
                        const ni = row + di;
                        const nj = col + dj;
                        if (ni >= 0 && ni < rows && nj >= 0 && nj < cols) {
                            if (!this.revealed[ni][nj] && !this.flagged[ni][nj]) {
                                this._revealCell(ni, nj);
                            }
                        }
                    }
                }
            }
            
            this._updateCell(row, col);
        },
        
        /**
         * 更新格子显示
         */
        _updateCell: function(row, col) {
            const cell = this.gameBoard.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            if (!cell) return;
            
            if (this.flagged[row][col]) {
                cell.textContent = '🚩';
                cell.style.background = '#c0c0c0';
                cell.style.border = '1px outset #ffffff';
                cell.style.color = '#000';
            } else if (this.revealed[row][col]) {
                cell.style.border = '1px inset #808080';
                cell.style.background = '#c0c0c0';
                
                if (this.board[row][col] === -1) {
                    cell.textContent = '💣';
                    cell.style.background = '#f00';
                } else if (this.board[row][col] === 0) {
                    cell.textContent = '';
                } else {
                    const colors = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'];
                    cell.textContent = this.board[row][col];
                    cell.style.color = colors[this.board[row][col]] || '#000';
                }
            } else {
                cell.textContent = '';
                cell.style.background = '#c0c0c0';
                cell.style.border = '1px outset #ffffff';
            }
        },
        
        /**
         * 检查游戏状态
         */
        _checkGameState: function() {
            const config = this.difficulties[this.difficulty];
            const rows = config.rows;
            const cols = config.cols;
            const mines = config.mines;
            
            // 检查是否所有非地雷格子都已揭开
            let revealedCount = 0;
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    if (this.revealed[i][j]) {
                        revealedCount++;
                    }
                }
            }
            
            if (revealedCount === rows * cols - mines) {
                this.gameState = 'won';
                this._endGame();
            }
        },
        
        /**
         * 结束游戏
         */
        _endGame: function() {
            this._stopTimer();
            
            if (this.gameState === 'lost') {
                this._updateFace('lost');
                // 显示所有地雷
                const config = this.difficulties[this.difficulty];
                for (let i = 0; i < config.rows; i++) {
                    for (let j = 0; j < config.cols; j++) {
                        if (this.board[i][j] === -1 && !this.flagged[i][j]) {
                            this.revealed[i][j] = true;
                            this._updateCell(i, j);
                        }
                    }
                }
            } else if (this.gameState === 'won') {
                this._updateFace('won');
            }
        },
        
        /**
         * 重置游戏
         */
        _resetGame: function() {
            this._stopTimer();
            this._initGame();
        },
        
        /**
         * 更新地雷计数
         */
        _updateMineCount: function() {
            const config = this.difficulties[this.difficulty];
            const mines = config.mines;
            let flaggedCount = 0;
            
            const rows = config.rows;
            const cols = config.cols;
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    if (this.flagged[i][j]) {
                        flaggedCount++;
                    }
                }
            }
            
            const remaining = mines - flaggedCount;
            this.mineCountDisplay.textContent = String(Math.max(0, remaining)).padStart(3, '0');
        },
        
        /**
         * 更新笑脸按钮
         */
        _updateFace: function(state) {
            const faces = {
                ready: '😊',
                playing: '😊',
                won: '😎',
                lost: '😵'
            };
            this.faceButton.textContent = faces[state] || '😊';
        },
        
        /**
         * 开始计时器
         */
        _startTimer: function() {
            this._stopTimer();
            this.timer = 0;
            this.timerInterval = setInterval(() => {
                this.timer++;
                this._updateTimer(this.timer);
            }, 1000);
        },
        
        /**
         * 停止计时器
         */
        _stopTimer: function() {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        },
        
        /**
         * 更新计时器显示
         */
        _updateTimer: function(seconds) {
            this.timerDisplay.textContent = String(Math.min(999, seconds)).padStart(3, '0');
        },
        
        /**
         * 显示难度菜单
         */
        _showDifficultyMenu: function() {
            // 简单的难度切换
            const difficulties = ['beginner', 'intermediate', 'expert'];
            const currentIndex = difficulties.indexOf(this.difficulty);
            const nextIndex = (currentIndex + 1) % difficulties.length;
            this.difficulty = difficulties[nextIndex];
            
            // 调整窗口大小
            const config = this.difficulties[this.difficulty];
            const menuBarHeight = 22; // 固定菜单栏高度
            const controlPanelHeight = 50; // 固定控制面板高度
            const boardWidth = config.cols * 16 + 16;
            const boardHeight = config.rows * 16 + 16;
            const windowWidth = Math.max(300, boardWidth + 16);
            const windowHeight = menuBarHeight + controlPanelHeight + boardHeight + 16;
            
            if (this.window) {
                this.window.style.width = `${windowWidth}px`;
                this.window.style.height = `${windowHeight}px`;
            }
            
            this._resetGame();
        },
        
        /**
         * 添加事件监听器（用于清理）
         */
        _addEventHandler: function(element, event, handler, useCapture = false) {
            element.addEventListener(event, handler, useCapture);
            this._eventHandlers.push({ element, event, handler, useCapture });
        },
        
        /**
         * 程序退出
         */
        __exit__: async function() {
            try {
                // 停止计时器
                this._stopTimer();
                
                // 注销上下文菜单拦截器
                if (typeof ContextMenuManager !== 'undefined') {
                    if (this.contextMenuId) {
                        ContextMenuManager.unregisterContextMenu(this.pid, this.contextMenuId);
                        this.contextMenuId = null;
                    }
                    if (this.contextMenuId2) {
                        ContextMenuManager.unregisterContextMenu(this.pid, this.contextMenuId2);
                        this.contextMenuId2 = null;
                    }
                    if (this.contextMenuId3) {
                        ContextMenuManager.unregisterContextMenu(this.pid, this.contextMenuId3);
                        this.contextMenuId3 = null;
                    }
                }
                
                // 移除所有事件监听器
                if (this._eventHandlers && Array.isArray(this._eventHandlers)) {
                    this._eventHandlers.forEach(({ element, event, handler, useCapture }) => {
                        if (element && typeof element.removeEventListener === 'function') {
                            element.removeEventListener(event, handler, useCapture || false);
                        }
                    });
                    this._eventHandlers = null;
                }
                
                // 取消注册 GUI 窗口
                if (this.windowId && typeof GUIManager !== 'undefined') {
                    await GUIManager.unregisterWindow(this.windowId);
                } else if (this.pid && typeof GUIManager !== 'undefined') {
                    await GUIManager.unregisterWindow(this.pid);
                }
                
                // 清理 DOM 元素
                if (this.window && this.window.parentElement) {
                    this.window.parentElement.removeChild(this.window);
                }
                
                // 清理所有对象引用
                this.window = null;
                this.windowId = null;
                this.mineCountDisplay = null;
                this.faceButton = null;
                this.timerDisplay = null;
                this.gameBoard = null;
                this.board = null;
                this.revealed = null;
                this.flagged = null;
                
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("MINESWEEPER", `清理资源失败: ${error.message}`, error);
                } else {
                    console.error('扫雷游戏清理失败:', error);
                }
            }
        },
        
        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'minesweeper',
                type: 'GUI',
                version: '1.0.0',
                description: '经典扫雷游戏，仿Windows风格',
                author: 'ZerOS Team',
                copyright: '© 2024',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE
                ] : [],
                metadata: {
                    allowMultipleInstances: true
                }
            };
        }
    };
    
    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.MINESWEEPER = MINESWEEPER;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.MINESWEEPER = MINESWEEPER;
    }
    
})(typeof window !== 'undefined' ? window : globalThis);

