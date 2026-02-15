/* BTOP - 系统性能监控工具
 * 功能：
 * - 实时显示CPU、内存、进程等系统性能信息
 * - 类似htop/btop的终端GUI界面
 * - 支持键盘交互（q退出，上下键选择进程等）
 * - 自动刷新显示
 */

(function(window) {
    'use strict';

    const BTOP = {
        pid: null,
        terminal: null,
        _kernelAPI: null,
        _closing: false,
        _refreshInterval: null,
        _refreshRate: 1000, // 刷新间隔（毫秒）
        _selectedIndex: 0, // 选中的进程索引
        _sortBy: 'cpu', // 排序方式：'cpu', 'memory', 'pid', 'name'
        _sortOrder: 'desc', // 排序顺序：'asc', 'desc'
        _showHelp: false, // 是否显示帮助

        /**
         * 程序信息
         */
        __info__: function() {
            return {
                name: 'BTOP',
                type: 'CLI',
                version: '1.0.0',
                description: '系统性能监控工具（类似btop）',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.EVENT_LISTENER
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
        __init__: async function(pid, initArgs = {}) {
            this.pid = pid;
            this.terminal = initArgs.terminal;
            this._kernelAPI = initArgs.kernelAPI || null;

            if (!this.terminal) {
                throw new Error('BTOP 程序需要终端环境');
            }

            const args = initArgs.args || [];

            // 解析参数
            if (args.includes('-h') || args.includes('--help')) {
                this._showUsage();
                setTimeout(() => this._selfClose(), 300);
                return;
            }

            // 解析刷新率参数
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                if ((arg === '-d' || arg === '--delay') && i + 1 < args.length) {
                    const delay = parseInt(args[i + 1]);
                    if (!isNaN(delay) && delay > 0) {
                        this._refreshRate = delay;
                    }
                    i++;
                }
            }

            // 使用 setTimeout 延迟执行
            setTimeout(async () => {
                try {
                    // 清屏
                    this.terminal.clear();
                    
                    // 注册键盘事件
                    this._registerKeyboardEvents();
                    
                    // 开始刷新循环
                    this._startRefreshLoop();
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error("BTOP", `初始化失败: ${error.message}`, error);
                    }
                    this.terminal.write(`错误: ${error.message}\n`);
                    setTimeout(() => this._selfClose(), 1000);
                }
            }, 0);
        },

        /**
         * 注册键盘事件
         */
        _registerKeyboardEvents: function() {
            if (typeof EventManager === 'undefined') return;

            // 注册键盘事件处理器
            const handlerId = EventManager.registerEventHandler(
                this.pid,
                'keydown',
                (e) => {
                    this._handleKeyPress(e);
                },
                {
                    priority: 10, // 高优先级
                    stopPropagation: true
                }
            );

            // 保存handler ID以便清理
            this._keyboardHandlerId = handlerId;
        },

        /**
         * 处理键盘按键
         */
        _handleKeyPress: function(e) {
            if (this._closing) return;

            const key = e.key;
            const ctrl = e.ctrlKey;
            const shift = e.shiftKey;

            // q 或 Ctrl+C: 退出
            if (key === 'q' || (ctrl && key === 'c')) {
                e.preventDefault();
                this._selfClose();
                return false;
            }

            // h: 切换帮助显示
            if (key === 'h' || key === 'H') {
                e.preventDefault();
                this._showHelp = !this._showHelp;
                this._render();
                return false;
            }

            // 上下键: 选择进程
            if (key === 'ArrowUp') {
                e.preventDefault();
                this._selectedIndex = Math.max(0, this._selectedIndex - 1);
                this._render();
                return false;
            }

            if (key === 'ArrowDown') {
                e.preventDefault();
                this._selectedIndex++;
                this._render();
                return false;
            }

            // 排序快捷键
            if (key === 'P' && ctrl) {
                e.preventDefault();
                this._sortBy = 'pid';
                this._sortOrder = this._sortBy === 'pid' && this._sortOrder === 'desc' ? 'asc' : 'desc';
                this._render();
                return false;
            }

            if (key === 'M' && ctrl) {
                e.preventDefault();
                this._sortBy = 'memory';
                this._sortOrder = this._sortBy === 'memory' && this._sortOrder === 'desc' ? 'asc' : 'desc';
                this._render();
                return false;
            }

            if (key === 'T' && ctrl) {
                e.preventDefault();
                this._sortBy = 'cpu';
                this._sortOrder = this._sortBy === 'cpu' && this._sortOrder === 'desc' ? 'asc' : 'desc';
                this._render();
                return false;
            }

            // 空格: 暂停/继续刷新
            if (key === ' ') {
                e.preventDefault();
                if (this._refreshInterval) {
                    clearInterval(this._refreshInterval);
                    this._refreshInterval = null;
                } else {
                    this._startRefreshLoop();
                }
                return false;
            }

            return true;
        },

        /**
         * 开始刷新循环
         */
        _startRefreshLoop: function() {
            // 立即渲染一次
            this._render();

            // 设置定时刷新
            this._refreshInterval = setInterval(() => {
                if (!this._closing) {
                    this._render();
                }
            }, this._refreshRate);
        },

        /**
         * 渲染界面（HTML版本）
         */
        _render: function() {
            if (this._closing) return;

            try {
                // 获取系统信息
                const systemInfo = this._getSystemInfo();
                const processes = this._getProcesses();
                const memoryInfo = this._getMemoryInfo();

                // 清屏
                this.terminal.clear();

                // 生成HTML内容
                const html = this._generateHTML(systemInfo, memoryInfo, processes);

                // 输出HTML
                this.terminal.write({
                    html: html,
                    style: {
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        lineHeight: '1.4'
                    }
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error("BTOP", `渲染失败: ${error.message}`, error);
                }
            }
        },

        /**
         * 生成HTML内容
         */
        _generateHTML: function(systemInfo, memoryInfo, processes) {
            const cpuUsage = this._calculateCPUUsage();
            const memUsage = memoryInfo.totalSize > 0 
                ? (memoryInfo.totalUsed / memoryInfo.totalSize) * 100 
                : 0;
            const memFree = memoryInfo.totalSize - memoryInfo.totalUsed;

            return `
<style>
@keyframes glow-pulse {
    0%, 100% { box-shadow: 0 0 5px currentColor, 0 0 10px currentColor, 0 0 15px currentColor; }
    50% { box-shadow: 0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor; }
}
@keyframes scan-line {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}
@keyframes data-flow {
    0% { opacity: 0.3; }
    50% { opacity: 1; }
    100% { opacity: 0.3; }
}
.btop-container {
    background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0f172a 100%);
    color: #e2e8f0;
    padding: 8px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.4;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    max-height: calc(100vh - 80px);
    min-height: 0;
    position: relative;
}
.btop-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, #00ffff, #8b5cf6, #ff00ff, transparent);
    animation: scan-line 3s linear infinite;
    z-index: 1;
}
.btop-header {
    border: 2px solid #8b5cf6;
    border-image: linear-gradient(90deg, #00ffff, #8b5cf6, #ff00ff) 1;
    padding: 8px;
    margin-bottom: 4px;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(0, 255, 255, 0.05));
    flex-shrink: 0;
    min-width: 0;
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.3), inset 0 0 20px rgba(139, 92, 246, 0.1);
    position: relative;
    overflow: hidden;
}
.btop-header::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    animation: scan-line 2s linear infinite;
}
.btop-title {
    color: #a78bfa;
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 4px;
    text-shadow: 0 0 10px rgba(167, 139, 250, 0.8), 0 0 20px rgba(167, 139, 250, 0.4);
    position: relative;
    z-index: 1;
}
.btop-info {
    color: #cbd5e1;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
    z-index: 1;
}
.btop-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-bottom: 4px;
    flex-shrink: 0;
    min-width: 0;
}
.btop-panel {
    border: 1px solid #475569;
    border-image: linear-gradient(135deg, rgba(0, 255, 255, 0.3), rgba(139, 92, 246, 0.3)) 1;
    padding: 6px;
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
    min-width: 0;
    overflow: hidden;
    box-shadow: 0 0 8px rgba(0, 255, 255, 0.1), inset 0 0 15px rgba(139, 92, 246, 0.05);
    position: relative;
}
.btop-panel::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(45deg, transparent 30%, rgba(0, 255, 255, 0.03) 50%, transparent 70%);
    pointer-events: none;
    animation: data-flow 4s ease-in-out infinite;
}
.btop-panel-title {
    color: #8b5cf6;
    font-weight: bold;
    margin-bottom: 6px;
    font-size: 12px;
    text-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
    position: relative;
    z-index: 1;
}
.btop-stat-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 11px;
}
.btop-stat-label {
    color: #94a3b8;
}
.btop-stat-value {
    color: #e2e8f0;
    font-weight: bold;
}
.btop-bar-container {
    width: 100%;
    height: 10px;
    background: linear-gradient(90deg, #1e293b, #334155, #1e293b);
    border-radius: 3px;
    overflow: hidden;
    margin: 3px 0;
    border: 1px solid rgba(0, 255, 255, 0.2);
    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5), 0 0 5px rgba(0, 255, 255, 0.1);
    position: relative;
}
.btop-bar-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    animation: scan-line 2s linear infinite;
    pointer-events: none;
}
.btop-bar-fill {
    height: 100%;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.5s ease;
    position: relative;
    box-shadow: 0 0 10px currentColor, inset 0 0 10px rgba(255, 255, 255, 0.3);
    border-radius: 2px;
}
.btop-bar-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
    animation: scan-line 1.5s linear infinite;
}
.btop-bar-low { 
    background: linear-gradient(90deg, #00ff88, #34d399, #00ff88);
    color: #00ff88;
}
.btop-bar-medium { 
    background: linear-gradient(90deg, #ffaa00, #fbbf24, #ffaa00);
    color: #ffaa00;
}
.btop-bar-high { 
    background: linear-gradient(90deg, #ff3366, #f87171, #ff3366);
    color: #ff3366;
}
.btop-bar-neon-cyan {
    background: linear-gradient(90deg, #00ffff, #00ccff, #00ffff);
    color: #00ffff;
    animation: glow-pulse 2s ease-in-out infinite;
}
.btop-bar-neon-purple {
    background: linear-gradient(90deg, #8b5cf6, #a78bfa, #8b5cf6);
    color: #8b5cf6;
}
.btop-bar-neon-pink {
    background: linear-gradient(90deg, #ff00ff, #ff66ff, #ff00ff);
    color: #ff00ff;
}
.btop-process-wrap {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    margin-bottom: 4px;
    -webkit-overflow-scrolling: touch;
}
.btop-process-panel {
    min-width: 0;
}
.btop-process-table {
    width: 100%;
    min-width: 600px;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 4px;
    table-layout: auto;
}
.btop-process-table th {
    color: #ffaa00;
    text-align: left;
    padding: 4px 6px;
    border-bottom: 2px solid rgba(0, 255, 255, 0.3);
    font-weight: bold;
    white-space: nowrap;
    text-shadow: 0 0 8px rgba(255, 170, 0, 0.6);
    background: linear-gradient(180deg, rgba(0, 255, 255, 0.1), transparent);
}
.btop-process-table td {
    padding: 3px 6px;
    border-bottom: 1px solid rgba(0, 255, 255, 0.1);
    max-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
.btop-process-row {
    transition: all 0.2s ease;
}
.btop-process-row:hover {
    background: rgba(0, 255, 255, 0.05);
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
}
.btop-process-row.selected {
    background: linear-gradient(90deg, rgba(139, 92, 246, 0.2), rgba(0, 255, 255, 0.1));
    box-shadow: 0 0 15px rgba(139, 92, 246, 0.4), inset 0 0 20px rgba(139, 92, 246, 0.1);
    border-left: 3px solid #8b5cf6;
}
.btop-process-row.selected td {
    color: #e2e8f0;
    text-shadow: 0 0 6px rgba(226, 232, 240, 0.5);
}
.btop-process-pid { 
    color: #00ffff; 
    font-weight: bold; 
    text-shadow: 0 0 6px #00ffff;
}
.btop-process-name { 
    color: #cbd5e1; 
}
.btop-process-status-running { 
    color: #00ff88; 
    text-shadow: 0 0 6px #00ff88;
}
.btop-process-status-exited { 
    color: #ff3366; 
    text-shadow: 0 0 6px #ff3366;
}
.btop-process-cpu { 
    color: #ffaa00; 
    text-shadow: 0 0 6px #ffaa00;
}
.btop-process-mem { 
    color: #00ffff; 
    text-shadow: 0 0 6px #00ffff;
}
.btop-process-bar-cell {
    width: 60px;
    padding: 2px 6px !important;
}
.btop-process-bar-mini {
    width: 50px;
    height: 6px;
    background: rgba(0, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
    border: 1px solid rgba(0, 255, 255, 0.2);
    box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.5);
}
.btop-process-bar-mini-fill {
    height: 100%;
    border-radius: 1px;
    box-shadow: 0 0 4px currentColor;
    transition: width 0.3s ease;
}
.btop-footer {
    border-top: 1px solid #475569;
    padding: 4px;
    margin-top: 4px;
    font-size: 11px;
    color: #64748b;
    display: flex;
    justify-content: space-between;
    flex-shrink: 0;
    min-width: 0;
    flex-wrap: wrap;
    gap: 8px;
}
.btop-help {
    border: 1px solid #475569;
    padding: 8px;
    margin-top: 4px;
    background: #1e293b;
    font-size: 11px;
    flex-shrink: 0;
    min-width: 0;
}
.btop-help-title {
    color: #ffaa00;
    font-weight: bold;
    margin-bottom: 6px;
    text-shadow: 0 0 8px rgba(255, 170, 0, 0.8);
}
.btop-help-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}
.btop-help-key {
    color: #00ffff;
    font-weight: bold;
    text-shadow: 0 0 6px #00ffff;
}
.btop-help-desc {
    color: #cbd5e1;
}
.btop-graph {
    height: 50px;
    background: linear-gradient(180deg, #0a0e27, #0f172a, #0a0e27);
    border: 1px solid rgba(0, 255, 255, 0.3);
    margin: 4px 0;
    display: flex;
    align-items: flex-end;
    padding: 2px;
    min-width: 0;
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(0, 255, 255, 0.2);
    position: relative;
    overflow: hidden;
}
.btop-graph::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.5), transparent);
    animation: scan-line 2s linear infinite;
    z-index: 1;
}
.btop-graph-bar {
    flex: 1;
    margin: 0 1px;
    min-height: 2px;
    min-width: 0;
    border-radius: 2px 2px 0 0;
    transition: height 0.3s ease;
    box-shadow: 0 -2px 8px currentColor, inset 0 2px 4px rgba(255, 255, 255, 0.3);
    position: relative;
    z-index: 0;
}
.btop-graph-bar::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 30%;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.6), transparent);
    border-radius: 2px 2px 0 0;
}
</style>
<div class="btop-container">
    ${this._renderHeaderHTML(systemInfo)}
    <div class="btop-grid">
        ${this._renderCPUPanelHTML(cpuUsage)}
        ${this._renderMemoryPanelHTML(memoryInfo, memUsage, memFree)}
    </div>
    <div class="btop-grid">
        ${this._renderDiskPanelHTML()}
        ${this._renderNetworkPanelHTML()}
    </div>
    <div class="btop-grid">
        ${this._renderSystemLoadPanelHTML(cpuUsage, processes)}
        ${this._renderIOPanelHTML()}
    </div>
    <div class="btop-grid">
        ${this._renderTemperaturePanelHTML()}
        ${this._renderThreadPanelHTML(processes)}
    </div>
    <div class="btop-grid">
        ${this._renderCachePanelHTML()}
        ${this._renderPowerPanelHTML()}
    </div>
    <div class="btop-grid">
        ${this._renderSecurityPanelHTML()}
        ${this._renderSystemStatsPanelHTML(processes)}
    </div>
    <div class="btop-process-wrap">${this._renderProcessTableHTML(processes)}</div>
    ${this._showHelp ? this._renderHelpHTML() : this._renderFooterHTML()}
</div>`;
        },

        /**
         * 渲染标题栏HTML
         */
        _renderHeaderHTML: function(systemInfo) {
            return `
<div class="btop-header">
    <div class="btop-title">BTOP - ZerOS 系统性能监控</div>
    <div class="btop-info">
        系统: <span style="color: #00ffff; font-weight: bold; text-shadow: 0 0 8px #00ffff;">${systemInfo.systemName} ${systemInfo.systemVersion}</span> | 
        内核: <span style="color: #00ffff; font-weight: bold; text-shadow: 0 0 8px #00ffff;">${systemInfo.kernelVersion}</span> | 
        运行时间: <span style="color: #00ff88; font-weight: bold; text-shadow: 0 0 8px #00ff88;">${systemInfo.uptime}</span>
    </div>
</div>`;
        },

        /**
         * 渲染CPU面板HTML
         */
        _renderCPUPanelHTML: function(cpuUsage) {
            const cpuColor = this._getUsageColor(cpuUsage);
            const cpuBarClass = cpuUsage < 50 ? 'btop-bar-low' : (cpuUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            const cpuBarWidth = Math.min(cpuUsage, 100);
            
            // 生成CPU历史图表数据（模拟，使用更科幻的颜色）
            const graphData = [];
            for (let i = 0; i < 60; i++) {
                graphData.push(Math.random() * 100);
            }
            const graphBars = graphData.map((val, i) => {
                let barColor = '#00ffff';
                if (val < 30) barColor = '#00ff88';
                else if (val < 60) barColor = '#ffaa00';
                else if (val < 80) barColor = '#ff3366';
                else barColor = '#ff00ff';
                return `<div class="btop-graph-bar" style="height: ${val}%; background: ${barColor}; color: ${barColor};"></div>`;
            }).join('');

            // 生成多个核心数据（4-8个核心）
            const coreCount = 4;
            const cores = [];
            for (let i = 0; i < coreCount; i++) {
                const coreUsage = Math.max(0, Math.min(100, cpuUsage + (Math.random() * 20 - 10)));
                const coreColor = this._getUsageColor(coreUsage);
                const coreBarClass = coreUsage < 50 ? 'btop-bar-low' : (coreUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high');
                cores.push({ id: i + 1, usage: coreUsage, color: coreColor, barClass: coreBarClass });
            }

            // 模拟温度和频率
            const temp = 45 + Math.random() * 15;
            const freq = 2.4 + Math.random() * 1.2;
            const tempColor = temp < 50 ? '#00ff88' : (temp < 70 ? '#ffaa00' : '#ff3366');

            return `
<div class="btop-panel">
    <div class="btop-panel-title">¹cpu <span style="color: #00ffff; font-size: 10px;">${freq.toFixed(2)} GHz ${temp.toFixed(0)}°C</span></div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">使用率:</span>
        <span class="btop-stat-value" style="color: ${cpuColor}; text-shadow: 0 0 8px ${cpuColor};">${cpuUsage.toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${cpuBarClass}" style="width: ${cpuBarWidth}%;"></div>
    </div>
    <div class="btop-graph">
        ${graphBars}
    </div>
    ${cores.map(core => `
    <div class="btop-stat-row">
        <span class="btop-stat-label">核心 ${core.id}:</span>
        <span class="btop-stat-value" style="color: ${core.color};">${core.usage.toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container" style="height: 6px; margin: 1px 0 3px 0;">
        <div class="btop-bar-fill ${core.barClass}" style="width: ${core.usage}%;"></div>
    </div>`).join('')}
    <div class="btop-stat-row">
        <span class="btop-stat-label">负载:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${(cpuUsage / 100).toFixed(2)} ${(cpuUsage / 100 * 0.9).toFixed(2)} ${(cpuUsage / 100 * 0.8).toFixed(2)}</span>
    </div>
    <div class="btop-bar-container" style="height: 6px; margin: 2px 0;">
        <div class="btop-bar-fill btop-bar-neon-cyan" style="width: ${Math.min((cpuUsage / 100) * 100, 100)}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">温度:</span>
        <span class="btop-stat-value" style="color: ${tempColor}; text-shadow: 0 0 6px ${tempColor};">${temp.toFixed(0)}°C</span>
    </div>
    <div class="btop-bar-container" style="height: 6px; margin: 2px 0;">
        <div class="btop-bar-fill ${temp < 50 ? 'btop-bar-low' : (temp < 70 ? 'btop-bar-medium' : 'btop-bar-high')}" style="width: ${Math.min((temp / 100) * 100, 100)}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">频率:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${freq.toFixed(2)} GHz (${((freq / 3.6) * 100).toFixed(0)}%)</span>
    </div>
    <div class="btop-bar-container" style="height: 6px; margin: 2px 0;">
        <div class="btop-bar-fill btop-bar-neon-cyan" style="width: ${Math.min((freq / 3.6) * 100, 100)}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">缓存命中率:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${(85 + Math.random() * 10).toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">L1缓存:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${(90 + Math.random() * 8).toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">L2缓存:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${(88 + Math.random() * 10).toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">L3缓存:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${(82 + Math.random() * 15).toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">指令/秒:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${this._formatNumber(Math.floor(freq * 1000000000 * cpuUsage / 100))}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">周期/秒:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${this._formatNumber(Math.floor(freq * 1000000000))}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">CPI:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${(1.2 + Math.random() * 0.3).toFixed(2)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">分支预测:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${(92 + Math.random() * 6).toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">TLB命中率:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${(95 + Math.random() * 4).toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">上下文切换:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 50000 + 10000))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">中断数:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 20000 + 5000))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">软中断:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 10000 + 2000))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">硬中断:</span>
        <span class="btop-stat-value" style="color: #ff3366; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 5000 + 1000))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">CPU等待:</span>
        <span class="btop-stat-value" style="color: ${cpuUsage < 20 ? '#00ff88' : '#ffaa00'}; font-size: 10px;">${(100 - cpuUsage).toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container" style="height: 6px; margin: 2px 0;">
        <div class="btop-bar-fill btop-bar-low" style="width: ${100 - cpuUsage}%;"></div>
    </div>
</div>`;
        },

        /**
         * 渲染内存面板HTML
         */
        _renderMemoryPanelHTML: function(memoryInfo, memUsage, memFree) {
            const memColor = this._getUsageColor(memUsage);
            const memBarClass = memUsage < 50 ? 'btop-bar-low' : (memUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            const memBarWidth = Math.min(memUsage, 100);
            const freePercent = memoryInfo.totalSize > 0 ? (memFree / memoryInfo.totalSize) * 100 : 0;
            const freeBarWidth = Math.min(freePercent, 100);
            
            // 模拟缓存和交换分区数据
            const cached = memoryInfo.totalSize * 0.15 + Math.random() * memoryInfo.totalSize * 0.1;
            const cachedPercent = memoryInfo.totalSize > 0 ? (cached / memoryInfo.totalSize) * 100 : 0;
            const cachedBarWidth = Math.min(cachedPercent, 100);
            const swapTotal = memoryInfo.totalSize * 0.5;
            const swapUsed = swapTotal * 0.1 + Math.random() * swapTotal * 0.1;
            const swapPercent = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0;
            const swapBarWidth = Math.min(swapPercent, 100);
            const swapBarClass = swapPercent < 50 ? 'btop-bar-low' : (swapPercent < 80 ? 'btop-bar-medium' : 'btop-bar-high');

            // 生成内存使用历史图表
            const graphData = [];
            for (let i = 0; i < 50; i++) {
                graphData.push(Math.random() * 100);
            }
            const graphBars = graphData.map((val, i) => {
                let barColor = '#00ffff';
                if (val < 30) barColor = '#00ff88';
                else if (val < 60) barColor = '#ffaa00';
                else if (val < 80) barColor = '#ff3366';
                else barColor = '#ff00ff';
                return `<div class="btop-graph-bar" style="height: ${val}%; background: ${barColor}; color: ${barColor};"></div>`;
            }).join('');

            // 计算缓冲区数据
            const buffers = memoryInfo.totalSize * 0.05 + Math.random() * memoryInfo.totalSize * 0.05;
            const buffersPercent = memoryInfo.totalSize > 0 ? (buffers / memoryInfo.totalSize) * 100 : 0;
            const buffersBarWidth = Math.min(buffersPercent, 100);

            // 计算共享内存
            const shared = memoryInfo.totalSize * 0.02 + Math.random() * memoryInfo.totalSize * 0.03;
            const sharedPercent = memoryInfo.totalSize > 0 ? (shared / memoryInfo.totalSize) * 100 : 0;
            const sharedBarWidth = Math.min(sharedPercent, 100);

            // 计算可用内存
            const available = memFree + cached;
            const availablePercent = memoryInfo.totalSize > 0 ? (available / memoryInfo.totalSize) * 100 : 0;
            const availableBarWidth = Math.min(availablePercent, 100);

            return `
<div class="btop-panel">
    <div class="btop-panel-title">²mem <span style="color: #00ffff; font-size: 10px;">内存使用历史</span></div>
    <div class="btop-graph" style="height: 40px; margin-bottom: 4px;">
        ${graphBars}
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">总计:</span>
        <span class="btop-stat-value" style="color: #a78bfa; text-shadow: 0 0 6px #a78bfa;">${this._formatBytes(memoryInfo.totalSize)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">已用:</span>
        <span class="btop-stat-value" style="color: ${memColor}; text-shadow: 0 0 6px ${memColor};">${memUsage.toFixed(1)}%</span>
        <span class="btop-stat-value" style="color: ${memColor};">${this._formatBytes(memoryInfo.totalUsed)}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${memBarClass}" style="width: ${memBarWidth}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">空闲:</span>
        <span class="btop-stat-value" style="color: #00ff88; text-shadow: 0 0 6px #00ff88;">${freePercent.toFixed(1)}%</span>
        <span class="btop-stat-value" style="color: #00ff88;">${this._formatBytes(memFree)}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill btop-bar-low" style="width: ${freeBarWidth}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">可用:</span>
        <span class="btop-stat-value" style="color: #00ff88; text-shadow: 0 0 6px #00ff88;">${availablePercent.toFixed(1)}%</span>
        <span class="btop-stat-value" style="color: #00ff88;">${this._formatBytes(available)}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill btop-bar-low" style="width: ${availableBarWidth}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">缓存:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${cachedPercent.toFixed(1)}%</span>
        <span class="btop-stat-value" style="color: #00ffff;">${this._formatBytes(cached)}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill btop-bar-neon-cyan" style="width: ${cachedBarWidth}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">缓冲区:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${buffersPercent.toFixed(1)}% ${this._formatBytes(buffers)}</span>
    </div>
    <div class="btop-bar-container" style="height: 6px;">
        <div class="btop-bar-fill btop-bar-neon-cyan" style="width: ${buffersBarWidth}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">共享:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${sharedPercent.toFixed(1)}% ${this._formatBytes(shared)}</span>
    </div>
    <div class="btop-bar-container" style="height: 6px;">
        <div class="btop-bar-fill btop-bar-neon-pink" style="width: ${sharedBarWidth}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">交换:</span>
        <span class="btop-stat-value" style="color: ${swapBarClass === 'btop-bar-low' ? '#00ff88' : (swapBarClass === 'btop-bar-medium' ? '#ffaa00' : '#ff3366')}; text-shadow: 0 0 6px currentColor;">${swapPercent.toFixed(1)}%</span>
        <span class="btop-stat-value" style="color: #ff00ff;">${this._formatBytes(swapUsed)} / ${this._formatBytes(swapTotal)}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${swapBarClass}" style="width: ${swapBarWidth}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">进程数:</span>
        <span class="btop-stat-value" style="color: #00ff88; text-shadow: 0 0 6px #00ff88;">${memoryInfo.totalProcesses}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">堆数:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${memoryInfo.totalHeaps}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">栈数:</span>
        <span class="btop-stat-value" style="color: #ff00ff; text-shadow: 0 0 6px #ff00ff;">${memoryInfo.totalSheds || 0}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">内存压力:</span>
        <span class="btop-stat-value" style="color: ${memUsage < 50 ? '#00ff88' : (memUsage < 80 ? '#ffaa00' : '#ff3366')}; text-shadow: 0 0 6px currentColor;">${memUsage < 50 ? '低' : (memUsage < 80 ? '中' : '高')}</span>
    </div>
    <div class="btop-bar-container" style="height: 6px; margin: 2px 0;">
        <div class="btop-bar-fill ${memUsage < 50 ? 'btop-bar-low' : (memUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high')}" style="width: ${memUsage}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">页面错误:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 1000 + 100))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">主要错误:</span>
        <span class="btop-stat-value" style="color: #ff3366; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 50 + 5))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">次要错误:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 500 + 50))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">页面换入:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 200 + 20))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">页面换出:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 100 + 10))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">内存碎片:</span>
        <span class="btop-stat-value" style="color: ${memUsage < 50 ? '#00ff88' : '#ffaa00'}; font-size: 10px;">${(memUsage * 0.3 + Math.random() * 10).toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container" style="height: 6px; margin: 2px 0;">
        <div class="btop-bar-fill ${memUsage < 50 ? 'btop-bar-low' : 'btop-bar-medium'}" style="width: ${Math.min(memUsage * 0.3 + Math.random() * 10, 100)}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">内存分配:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 10000 + 1000))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">内存释放:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 10000 + 1000))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">内存泄漏:</span>
        <span class="btop-stat-value" style="color: ${Math.random() > 0.8 ? '#ff3366' : '#00ff88'}; font-size: 10px;">${Math.random() > 0.8 ? '检测到' : '正常'}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">内存映射:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${Math.floor(Math.random() * 500 + 100)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">匿名页:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${this._formatBytes(memoryInfo.totalUsed * 0.6)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">文件页:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${this._formatBytes(memoryInfo.totalUsed * 0.3)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">脏页:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${this._formatBytes(memoryInfo.totalUsed * 0.1)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">写回:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 1000 + 100))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">内存压缩:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${(Math.random() * 20).toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">NUMA节点:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">1</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">内存带宽:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${(Math.random() * 20 + 5).toFixed(1)} GB/s</span>
    </div>
</div>`;
        },

        /**
         * 渲染磁盘面板HTML
         */
        _renderDiskPanelHTML: function() {
            // 模拟更多磁盘数据
            const disks = [
                { name: 'root', used: 66, total: '465 GiB', usedSize: '307 GiB', io: 10, read: '125 MB/s', write: '89 MB/s', mount: '/', fs: 'ext4' },
                { name: 'swap', used: 0, total: '488 GiB', usedSize: '0 Byte', io: 0, read: '0 B/s', write: '0 B/s', mount: 'swap', fs: 'swap' },
                { name: 'boot', used: 25, total: '943 MiB', usedSize: '239 MiB', io: 5, read: '12 MB/s', write: '8 MB/s', mount: '/boot', fs: 'ext2' },
                { name: 'data', used: 45, total: '1.2 TiB', usedSize: '540 GiB', io: 15, read: '200 MB/s', write: '150 MB/s', mount: '/data', fs: 'ext4' },
                { name: 'cache', used: 82, total: '32 GiB', usedSize: '26 GiB', io: 25, read: '45 MB/s', write: '30 MB/s', mount: '/cache', fs: 'tmpfs' }
            ];

            // 计算总IO
            const totalIO = disks.reduce((sum, d) => sum + d.io, 0);
            const totalSize = '3.75 TiB';
            const totalIOK = '440K';

            // 生成磁盘IO历史图表
            const graphData = [];
            for (let i = 0; i < 50; i++) {
                graphData.push(Math.random() * 100);
            }
            const graphBars = graphData.map((val, i) => {
                let barColor = '#00ffff';
                if (val < 30) barColor = '#00ff88';
                else if (val < 60) barColor = '#ffaa00';
                else barColor = '#ff3366';
                return `<div class="btop-graph-bar" style="height: ${val}%; background: ${barColor}; color: ${barColor};"></div>`;
            }).join('');

            // 计算总读写速度
            const totalReadSpeed = disks.reduce((sum, d) => {
                const readNum = parseFloat(d.read.replace(/[^\d.]/g, ''));
                return sum + (d.read.includes('MB') ? readNum * 1024 : readNum);
            }, 0);
            const totalWriteSpeed = disks.reduce((sum, d) => {
                const writeNum = parseFloat(d.write.replace(/[^\d.]/g, ''));
                return sum + (d.write.includes('MB') ? writeNum * 1024 : writeNum);
            }, 0);

            let html = `
<div class="btop-panel">
    <div class="btop-panel-title">disks <span style="color: #00ffff; font-size: 10px; text-shadow: 0 0 6px #00ffff;">io ${totalIOK} ${totalSize}</span></div>
    <div class="btop-graph" style="height: 40px; margin-bottom: 4px;">
        ${graphBars}
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">总读取:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${totalReadSpeed.toFixed(1)} KB/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">总写入:</span>
        <span class="btop-stat-value" style="color: #ff00ff; text-shadow: 0 0 6px #ff00ff;">${totalWriteSpeed.toFixed(1)} KB/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">总IO%:</span>
        <span class="btop-stat-value" style="color: #ffaa00; text-shadow: 0 0 6px #ffaa00;">${totalIO}%</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${totalIO < 50 ? 'btop-bar-low' : (totalIO < 80 ? 'btop-bar-medium' : 'btop-bar-high')}" style="width: ${Math.min(totalIO, 100)}%;"></div>
    </div>`;

            disks.forEach((disk, idx) => {
                const diskColor = this._getUsageColor(disk.used);
                const diskBarClass = disk.used < 50 ? 'btop-bar-low' : (disk.used < 80 ? 'btop-bar-medium' : 'btop-bar-high');
                const ioColor = disk.io < 30 ? '#00ff88' : (disk.io < 70 ? '#ffaa00' : '#ff3366');
                const ioBarWidth = Math.min(disk.io, 100);
                const ioBarClass = disk.io < 30 ? 'btop-bar-low' : (disk.io < 70 ? 'btop-bar-medium' : 'btop-bar-high');

                html += `
    <div style="margin-bottom: 6px; border-bottom: 1px solid rgba(0, 255, 255, 0.1); padding-bottom: 4px;">
        <div class="btop-stat-row">
            <span class="btop-stat-label">${disk.name}:</span>
            <span class="btop-stat-value" style="color: #a78bfa; text-shadow: 0 0 6px #a78bfa;">${disk.total}</span>
            <span style="color: #64748b; font-size: 9px; margin-left: 4px;">${disk.fs}</span>
        </div>
        <div class="btop-stat-row">
            <span class="btop-stat-label">挂载:</span>
            <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${disk.mount}</span>
        </div>
        <div class="btop-stat-row">
            <span class="btop-stat-label">IO%:</span>
            <span class="btop-stat-value" style="color: ${ioColor}; text-shadow: 0 0 6px ${ioColor};">${disk.io}%</span>
        </div>
        <div class="btop-bar-container">
            <div class="btop-bar-fill ${ioBarClass}" style="width: ${ioBarWidth}%;"></div>
        </div>
        <div class="btop-stat-row">
            <span class="btop-stat-label">读取:</span>
            <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${disk.read}</span>
        </div>
        <div class="btop-stat-row">
            <span class="btop-stat-label">写入:</span>
            <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${disk.write}</span>
        </div>
        <div class="btop-stat-row">
            <span class="btop-stat-label">已用:</span>
            <span class="btop-stat-value" style="color: ${diskColor}; text-shadow: 0 0 6px ${diskColor};">${disk.used}%</span>
            <span class="btop-stat-value" style="color: ${diskColor};">${disk.usedSize}</span>
        </div>
        <div class="btop-bar-container">
            <div class="btop-bar-fill ${diskBarClass}" style="width: ${disk.used}%;"></div>
        </div>
    </div>`;
            });

            // 添加磁盘健康状态
            const diskHealth = totalIO < 50 ? '正常' : (totalIO < 80 ? '繁忙' : '警告');
            const healthColor = totalIO < 50 ? '#00ff88' : (totalIO < 80 ? '#ffaa00' : '#ff3366');
            
            html += `
    <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(0, 255, 255, 0.2);">
        <div class="btop-stat-row">
            <span class="btop-stat-label">磁盘状态:</span>
            <span class="btop-stat-value" style="color: ${healthColor}; text-shadow: 0 0 6px ${healthColor};">${diskHealth}</span>
        </div>
    </div>
</div>`;
            return html;
        },

        /**
         * 渲染网络面板HTML
         */
        _renderNetworkPanelHTML: function() {
            // 模拟更详细的网络数据
            const downloadSpeed = (Math.random() * 100).toFixed(1);
            const uploadSpeed = (Math.random() * 50).toFixed(1);
            const downloadTotal = (Math.random() * 500).toFixed(1);
            const uploadTotal = (Math.random() * 100).toFixed(1);
            const downloadPeak = (parseFloat(downloadSpeed) * 1.5).toFixed(1);
            const uploadPeak = (parseFloat(uploadSpeed) * 1.3).toFixed(1);
            const packetsIn = Math.floor(Math.random() * 1000 + 500);
            const packetsOut = Math.floor(Math.random() * 800 + 300);
            const errors = Math.floor(Math.random() * 5);
            
            // 计算使用率（相对于峰值）
            const downloadUsage = Math.min(100, (parseFloat(downloadSpeed) / parseFloat(downloadPeak)) * 100);
            const uploadUsage = Math.min(100, (parseFloat(uploadSpeed) / parseFloat(uploadPeak)) * 100);
            const downloadBarWidth = downloadUsage;
            const uploadBarWidth = uploadUsage;
            const downloadBarClass = downloadUsage < 50 ? 'btop-bar-low' : (downloadUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            const uploadBarClass = uploadUsage < 50 ? 'btop-bar-low' : (uploadUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high');

            // 生成网络历史图表（使用更科幻的颜色）
            const graphData = [];
            for (let i = 0; i < 60; i++) {
                graphData.push(Math.random() * 100);
            }
            const graphBars = graphData.map((val, i) => {
                let barColor = '#00ffff';
                if (val < 30) barColor = '#00ff88';
                else if (val < 60) barColor = '#ffaa00';
                else barColor = '#ff00ff';
                return `<div class="btop-graph-bar" style="height: ${val}%; background: ${barColor}; color: ${barColor};"></div>`;
            }).join('');

            return `
<div class="btop-panel">
    <div class="btop-panel-title">³net <span style="color: #00ffff; text-shadow: 0 0 8px #00ffff;">192.168.1.9</span></div>
    <div class="btop-graph">
        ${graphBars}
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">下载:</span>
        <span class="btop-stat-value" style="color: #00ff88; text-shadow: 0 0 6px #00ff88;">${downloadSpeed} KiB/s</span>
        <span style="color: #64748b; font-size: 10px;">峰值: ${downloadPeak}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${downloadBarClass}" style="width: ${downloadBarWidth}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">上传:</span>
        <span class="btop-stat-value" style="color: #ff00ff; text-shadow: 0 0 6px #ff00ff;">${uploadSpeed} KiB/s</span>
        <span style="color: #64748b; font-size: 10px;">峰值: ${uploadPeak}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${uploadBarClass}" style="width: ${uploadBarWidth}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">总下载:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${downloadTotal} MiB</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">总上传:</span>
        <span class="btop-stat-value" style="color: #ff00ff; text-shadow: 0 0 6px #ff00ff;">${uploadTotal} MiB</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">入包:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${packetsIn}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">出包:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${packetsOut}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">错误:</span>
        <span class="btop-stat-value" style="color: ${errors > 0 ? '#ff3366' : '#00ff88'}; text-shadow: 0 0 6px currentColor;">${errors}</span>
    </div>
</div>`;
        },

        /**
         * 渲染系统负载面板HTML
         */
        _renderSystemLoadPanelHTML: function(cpuUsage, processes) {
            // 计算系统负载
            const load1 = (cpuUsage / 100).toFixed(2);
            const load5 = (cpuUsage / 100 * 0.9).toFixed(2);
            const load15 = (cpuUsage / 100 * 0.8).toFixed(2);
            const loadAvg = ((parseFloat(load1) + parseFloat(load5) + parseFloat(load15)) / 3).toFixed(2);
            const loadPercent = Math.min(100, (parseFloat(loadAvg) / 4) * 100); // 假设4核系统
            const loadBarClass = loadPercent < 50 ? 'btop-bar-low' : (loadPercent < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            
            // 计算上下文切换
            const contextSwitches = Math.floor(Math.random() * 50000 + 10000);
            const interrupts = Math.floor(Math.random() * 20000 + 5000);
            
            // 计算系统调用
            const syscalls = Math.floor(Math.random() * 100000 + 50000);
            const syscallRate = (syscalls / 1000).toFixed(1);
            
            return `
<div class="btop-panel">
    <div class="btop-panel-title">⁴load <span style="color: #00ffff; font-size: 10px;">系统负载</span></div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">1分钟:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${load1}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">5分钟:</span>
        <span class="btop-stat-value" style="color: #00ff88; text-shadow: 0 0 6px #00ff88;">${load5}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">15分钟:</span>
        <span class="btop-stat-value" style="color: #ffaa00; text-shadow: 0 0 6px #ffaa00;">${load15}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">平均负载:</span>
        <span class="btop-stat-value" style="color: #ff00ff; text-shadow: 0 0 6px #ff00ff;">${loadAvg}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${loadBarClass}" style="width: ${loadPercent}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">上下文切换:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${this._formatNumber(contextSwitches)}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">中断:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${this._formatNumber(interrupts)}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">系统调用:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${syscallRate}K/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">运行队列:</span>
        <span class="btop-stat-value" style="color: #ffaa00; text-shadow: 0 0 6px #ffaa00;">${processes.length}</span>
    </div>
</div>`;
        },

        /**
         * 渲染IO统计面板HTML
         */
        _renderIOPanelHTML: function() {
            // 模拟IO统计数据
            const readIOPS = Math.floor(Math.random() * 5000 + 1000);
            const writeIOPS = Math.floor(Math.random() * 3000 + 500);
            const readBytes = Math.floor(Math.random() * 1000000000 + 500000000);
            const writeBytes = Math.floor(Math.random() * 500000000 + 100000000);
            const readLatency = (Math.random() * 5 + 1).toFixed(2);
            const writeLatency = (Math.random() * 8 + 2).toFixed(2);
            
            // 计算IO使用率
            const totalIOPS = readIOPS + writeIOPS;
            const ioUsage = Math.min(100, (totalIOPS / 10000) * 100);
            const ioBarClass = ioUsage < 50 ? 'btop-bar-low' : (ioUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            
            // 计算IO等待时间
            const ioWait = (Math.random() * 10 + 2).toFixed(1);
            const ioWaitColor = ioWait < 5 ? '#00ff88' : (ioWait < 8 ? '#ffaa00' : '#ff3366');
            
            return `
<div class="btop-panel">
    <div class="btop-panel-title">⁵io <span style="color: #00ffff; font-size: 10px;">I/O 统计</span></div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">读取 IOPS:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${this._formatNumber(readIOPS)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">写入 IOPS:</span>
        <span class="btop-stat-value" style="color: #ff00ff; text-shadow: 0 0 6px #ff00ff;">${this._formatNumber(writeIOPS)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">总 IOPS:</span>
        <span class="btop-stat-value" style="color: #ffaa00; text-shadow: 0 0 6px #ffaa00;">${this._formatNumber(totalIOPS)}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${ioBarClass}" style="width: ${ioUsage}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">读取字节:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${this._formatBytes(readBytes)}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">写入字节:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${this._formatBytes(writeBytes)}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">读取延迟:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${readLatency}ms</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">写入延迟:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${writeLatency}ms</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">IO等待:</span>
        <span class="btop-stat-value" style="color: ${ioWaitColor}; text-shadow: 0 0 6px ${ioWaitColor};">${ioWait}%</span>
    </div>
</div>`;
        },

        /**
         * 渲染温度监控面板HTML
         */
        _renderTemperaturePanelHTML: function() {
            // 模拟温度数据
            const cpuTemp = 45 + Math.random() * 15;
            const gpuTemp = 40 + Math.random() * 20;
            const systemTemp = 35 + Math.random() * 10;
            const maxTemp = Math.max(cpuTemp, gpuTemp, systemTemp);
            
            const getTempColor = (temp) => {
                if (temp < 50) return '#00ff88';
                if (temp < 70) return '#ffaa00';
                return '#ff3366';
            };
            
            const cpuTempColor = getTempColor(cpuTemp);
            const gpuTempColor = getTempColor(gpuTemp);
            const sysTempColor = getTempColor(systemTemp);
            
            // 计算温度使用率（相对于100°C）
            const cpuTempPercent = Math.min(100, (cpuTemp / 100) * 100);
            const gpuTempPercent = Math.min(100, (gpuTemp / 100) * 100);
            const cpuTempBarClass = cpuTempPercent < 50 ? 'btop-bar-low' : (cpuTempPercent < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            const gpuTempBarClass = gpuTempPercent < 50 ? 'btop-bar-low' : (gpuTempPercent < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            
            // 风扇转速
            const fanSpeed = Math.floor(Math.random() * 2000 + 1000);
            const fanPercent = Math.min(100, (fanSpeed / 3000) * 100);
            const fanBarClass = fanPercent < 50 ? 'btop-bar-low' : (fanPercent < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            
            return `
<div class="btop-panel">
    <div class="btop-panel-title">⁶temp <span style="color: #00ffff; font-size: 10px;">温度监控</span></div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">CPU温度:</span>
        <span class="btop-stat-value" style="color: ${cpuTempColor}; text-shadow: 0 0 6px ${cpuTempColor};">${cpuTemp.toFixed(0)}°C</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${cpuTempBarClass}" style="width: ${cpuTempPercent}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">GPU温度:</span>
        <span class="btop-stat-value" style="color: ${gpuTempColor}; text-shadow: 0 0 6px ${gpuTempColor};">${gpuTemp.toFixed(0)}°C</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${gpuTempBarClass}" style="width: ${gpuTempPercent}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">系统温度:</span>
        <span class="btop-stat-value" style="color: ${sysTempColor}; text-shadow: 0 0 6px ${sysTempColor};">${systemTemp.toFixed(0)}°C</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">最高温度:</span>
        <span class="btop-stat-value" style="color: ${getTempColor(maxTemp)}; text-shadow: 0 0 6px ${getTempColor(maxTemp)};">${maxTemp.toFixed(0)}°C</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">风扇转速:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${fanSpeed} RPM</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${fanBarClass}" style="width: ${fanPercent}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">散热状态:</span>
        <span class="btop-stat-value" style="color: ${maxTemp < 60 ? '#00ff88' : '#ffaa00'}; text-shadow: 0 0 6px currentColor;">${maxTemp < 60 ? '正常' : '偏高'}</span>
    </div>
</div>`;
        },

        /**
         * 渲染线程统计面板HTML
         */
        _renderThreadPanelHTML: function(processes) {
            // 计算线程统计
            const totalThreads = processes.length * 2 + Math.floor(Math.random() * 20);
            const activeThreads = Math.floor(totalThreads * 0.8);
            const sleepingThreads = totalThreads - activeThreads;
            const threadUsage = (activeThreads / totalThreads) * 100;
            const threadBarClass = threadUsage < 50 ? 'btop-bar-low' : (threadUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            
            // 文件句柄
            const openFiles = Math.floor(Math.random() * 500 + 100);
            const maxFiles = 1024;
            const fileUsage = (openFiles / maxFiles) * 100;
            const fileBarClass = fileUsage < 50 ? 'btop-bar-low' : (fileUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            
            // 套接字
            const openSockets = Math.floor(Math.random() * 200 + 50);
            const maxSockets = 500;
            const socketUsage = (openSockets / maxSockets) * 100;
            const socketBarClass = socketUsage < 50 ? 'btop-bar-low' : (socketUsage < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            
            // 信号量
            const semaphores = Math.floor(Math.random() * 100 + 20);
            
            return `
<div class="btop-panel">
    <div class="btop-panel-title">⁷threads <span style="color: #00ffff; font-size: 10px;">线程统计</span></div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">总线程数:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${totalThreads}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">活动线程:</span>
        <span class="btop-stat-value" style="color: #00ff88; text-shadow: 0 0 6px #00ff88;">${activeThreads}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">休眠线程:</span>
        <span class="btop-stat-value" style="color: #ffaa00; text-shadow: 0 0 6px #ffaa00;">${sleepingThreads}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${threadBarClass}" style="width: ${threadUsage}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">打开文件:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${openFiles}/${maxFiles}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${fileBarClass}" style="width: ${fileUsage}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">打开套接字:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${openSockets}/${maxSockets}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${socketBarClass}" style="width: ${socketUsage}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">信号量:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${semaphores}</span>
    </div>
</div>`;
        },

        /**
         * 渲染缓存性能面板HTML
         */
        _renderCachePanelHTML: function() {
            // 模拟缓存统计数据
            const l1HitRate = 90 + Math.random() * 8;
            const l2HitRate = 85 + Math.random() * 10;
            const l3HitRate = 80 + Math.random() * 15;
            const pageCacheHit = 95 + Math.random() * 4;
            const bufferCacheHit = 92 + Math.random() * 6;
            const cacheMissRate = 100 - l1HitRate;
            
            return `
<div class="btop-panel">
    <div class="btop-panel-title">⁸cache <span style="color: #00ffff; font-size: 10px;">缓存性能</span></div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">L1命中率:</span>
        <span class="btop-stat-value" style="color: #00ff88; text-shadow: 0 0 6px #00ff88;">${l1HitRate.toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill btop-bar-low" style="width: ${l1HitRate}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">L2命中率:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${l2HitRate.toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill btop-bar-neon-cyan" style="width: ${l2HitRate}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">L3命中率:</span>
        <span class="btop-stat-value" style="color: #ffaa00; text-shadow: 0 0 6px #ffaa00;">${l3HitRate.toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill btop-bar-medium" style="width: ${l3HitRate}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">页面缓存:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${pageCacheHit.toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container" style="height: 6px;">
        <div class="btop-bar-fill btop-bar-low" style="width: ${pageCacheHit}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">缓冲区缓存:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${bufferCacheHit.toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container" style="height: 6px;">
        <div class="btop-bar-fill btop-bar-neon-cyan" style="width: ${bufferCacheHit}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">缓存未命中:</span>
        <span class="btop-stat-value" style="color: #ff3366; font-size: 10px;">${cacheMissRate.toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">缓存刷新:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 1000 + 100))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">缓存写入:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 500 + 50))}/s</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">预取命中:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${(75 + Math.random() * 20).toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">TLB命中:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${(95 + Math.random() * 4).toFixed(1)}%</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">缓存行填充:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 10000 + 1000))}/s</span>
    </div>
</div>`;
        },

        /**
         * 渲染电源管理面板HTML
         */
        _renderPowerPanelHTML: function() {
            // 模拟电源数据
            const powerUsage = 25 + Math.random() * 30; // 25-55W
            const powerLimit = 65;
            const powerPercent = (powerUsage / powerLimit) * 100;
            const powerBarClass = powerPercent < 50 ? 'btop-bar-low' : (powerPercent < 80 ? 'btop-bar-medium' : 'btop-bar-high');
            
            const voltage = 1.1 + Math.random() * 0.2;
            const current = powerUsage / voltage;
            const efficiency = 85 + Math.random() * 10;
            
            return `
<div class="btop-panel">
    <div class="btop-panel-title">⁹power <span style="color: #00ffff; font-size: 10px;">电源管理</span></div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">功耗:</span>
        <span class="btop-stat-value" style="color: ${powerPercent < 50 ? '#00ff88' : (powerPercent < 80 ? '#ffaa00' : '#ff3366')}; text-shadow: 0 0 6px currentColor;">${powerUsage.toFixed(1)}W</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill ${powerBarClass}" style="width: ${powerPercent}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">功耗限制:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${powerLimit}W</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">电压:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${voltage.toFixed(2)}V</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">电流:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${current.toFixed(2)}A</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">效率:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${efficiency.toFixed(1)}%</span>
    </div>
    <div class="btop-bar-container" style="height: 6px;">
        <div class="btop-bar-fill btop-bar-neon-cyan" style="width: ${efficiency}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">待机功耗:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${(2 + Math.random() * 3).toFixed(1)}W</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">峰值功耗:</span>
        <span class="btop-stat-value" style="color: #ff3366; font-size: 10px;">${(powerUsage * 1.5).toFixed(1)}W</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">节能模式:</span>
        <span class="btop-stat-value" style="color: ${powerUsage < 30 ? '#00ff88' : '#ffaa00'}; font-size: 10px;">${powerUsage < 30 ? '启用' : '禁用'}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">CPU频率缩放:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${powerUsage < 30 ? '节能' : (powerUsage < 50 ? '平衡' : '性能')}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">功耗趋势:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${powerUsage > 40 ? '上升' : '稳定'}</span>
    </div>
</div>`;
        },

        /**
         * 渲染安全监控面板HTML
         */
        _renderSecurityPanelHTML: function() {
            // 模拟安全统计数据
            const failedLogins = Math.floor(Math.random() * 5);
            const activeConnections = Math.floor(Math.random() * 50 + 10);
            const blockedIPs = Math.floor(Math.random() * 10);
            const securityThreats = Math.floor(Math.random() * 3);
            const firewallRules = 150 + Math.floor(Math.random() * 50);
            const encryptedConnections = Math.floor(activeConnections * 0.8);
            
            return `
<div class="btop-panel">
    <div class="btop-panel-title">¹⁰security <span style="color: #00ffff; font-size: 10px;">安全监控</span></div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">失败登录:</span>
        <span class="btop-stat-value" style="color: ${failedLogins > 0 ? '#ff3366' : '#00ff88'}; text-shadow: 0 0 6px currentColor;">${failedLogins}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">活动连接:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${activeConnections}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill btop-bar-neon-cyan" style="width: ${Math.min((activeConnections / 100) * 100, 100)}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">加密连接:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${encryptedConnections} (${((encryptedConnections / activeConnections) * 100).toFixed(0)}%)</span>
    </div>
    <div class="btop-bar-container" style="height: 6px;">
        <div class="btop-bar-fill btop-bar-low" style="width: ${(encryptedConnections / activeConnections) * 100}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">阻止IP:</span>
        <span class="btop-stat-value" style="color: ${blockedIPs > 0 ? '#ff3366' : '#00ff88'}; font-size: 10px;">${blockedIPs}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">安全威胁:</span>
        <span class="btop-stat-value" style="color: ${securityThreats > 0 ? '#ff3366' : '#00ff88'}; text-shadow: 0 0 6px currentColor;">${securityThreats > 0 ? securityThreats + ' 检测到' : '无'}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">防火墙规则:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${firewallRules}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">安全状态:</span>
        <span class="btop-stat-value" style="color: ${securityThreats === 0 && failedLogins < 3 ? '#00ff88' : '#ffaa00'}; text-shadow: 0 0 6px currentColor;">${securityThreats === 0 && failedLogins < 3 ? '安全' : '警告'}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">入侵检测:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${securityThreats === 0 ? '正常' : '活动'}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">SSL/TLS连接:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${encryptedConnections}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">端口扫描:</span>
        <span class="btop-stat-value" style="color: ${Math.random() > 0.8 ? '#ff3366' : '#00ff88'}; font-size: 10px;">${Math.random() > 0.8 ? '检测到' : '无'}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">恶意软件:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">无</span>
    </div>
</div>`;
        },

        /**
         * 渲染系统统计面板HTML
         */
        _renderSystemStatsPanelHTML: function(processes) {
            // 计算各种系统统计
            const uptimeSeconds = Math.floor((Date.now() - (this._programStartTime || Date.now())) / 1000);
            const uptimeHours = Math.floor(uptimeSeconds / 3600);
            const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
            
            const totalEvents = Math.floor(Math.random() * 1000000 + 500000);
            const eventsPerSec = Math.floor(totalEvents / Math.max(uptimeSeconds, 1));
            
            const fileOperations = Math.floor(Math.random() * 50000 + 10000);
            const networkConnections = Math.floor(Math.random() * 200 + 50);
            const systemCalls = Math.floor(Math.random() * 200000 + 100000);
            
            return `
<div class="btop-panel">
    <div class="btop-panel-title">¹¹stats <span style="color: #00ffff; font-size: 10px;">系统统计</span></div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">运行时间:</span>
        <span class="btop-stat-value" style="color: #00ffff; text-shadow: 0 0 6px #00ffff;">${uptimeHours}时${uptimeMinutes}分</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">总事件数:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${this._formatNumber(totalEvents)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">事件/秒:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${this._formatNumber(eventsPerSec)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">文件操作:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${this._formatNumber(fileOperations)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">网络连接:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${networkConnections}</span>
    </div>
    <div class="btop-bar-container">
        <div class="btop-bar-fill btop-bar-neon-pink" style="width: ${Math.min((networkConnections / 500) * 100, 100)}%;"></div>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">系统调用:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${this._formatNumber(systemCalls)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">进程创建:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${processes.length}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">信号发送:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${this._formatNumber(Math.floor(Math.random() * 1000 + 100))}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">定时器:</span>
        <span class="btop-stat-value" style="color: #ff00ff; font-size: 10px;">${Math.floor(Math.random() * 100 + 20)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">消息队列:</span>
        <span class="btop-stat-value" style="color: #00ff88; font-size: 10px;">${Math.floor(Math.random() * 50 + 10)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">共享内存段:</span>
        <span class="btop-stat-value" style="color: #ffaa00; font-size: 10px;">${Math.floor(Math.random() * 20 + 5)}</span>
    </div>
    <div class="btop-stat-row">
        <span class="btop-stat-label">系统负载指数:</span>
        <span class="btop-stat-value" style="color: #00ffff; font-size: 10px;">${(Math.random() * 2).toFixed(2)}</span>
    </div>
</div>`;
        },

        /**
         * 渲染进程表格HTML
         */
        _renderProcessTableHTML: function(processes) {
            const maxDisplay = 20; // 增加显示数量
            const displayProcesses = processes.slice(0, maxDisplay);

            let html = `
<div class="btop-panel btop-process-panel">
    <div class="btop-panel-title">进程列表 <span style="color: #00ffff; font-size: 10px;">${processes.length} 个进程</span></div>
    <table class="btop-process-table">
        <thead>
            <tr>
                <th>PID</th>
                <th>程序名</th>
                <th>状态</th>
                <th>CPU%</th>
                <th>CPU</th>
                <th>内存%</th>
                <th>内存</th>
                <th>堆内存</th>
                <th>栈内存</th>
            </tr>
        </thead>
        <tbody>`;

            displayProcesses.forEach((proc, i) => {
                const isSelected = i === this._selectedIndex;
                const statusColor = proc.status === 'running' ? '#00ff88' : '#ff3366';
                const statusText = proc.status === 'running' ? '运行中' : '已退出';
                const cpuPercent = proc.cpuPercent || 0;
                const memPercent = proc.memPercent || 0;
                const cpuColor = this._getUsageColor(cpuPercent);
                const memColor = this._getUsageColor(memPercent);
                const cpuBarClass = cpuPercent < 50 ? 'btop-bar-low' : (cpuPercent < 80 ? 'btop-bar-medium' : 'btop-bar-high');
                const memBarClass = memPercent < 50 ? 'btop-bar-low' : (memPercent < 80 ? 'btop-bar-medium' : 'btop-bar-high');
                const cpuBarWidth = Math.min(cpuPercent, 100);
                const memBarWidth = Math.min(memPercent, 100);

                html += `
            <tr class="btop-process-row ${isSelected ? 'selected' : ''}">
                <td class="btop-process-pid">${proc.pid}</td>
                <td class="btop-process-name">${(proc.programName || `Program-${proc.pid}`).substring(0, 20)}</td>
                <td class="btop-process-status-${proc.status}" style="color: ${statusColor};">${statusText}</td>
                <td class="btop-process-cpu" style="color: ${cpuColor};">${cpuPercent.toFixed(1)}%</td>
                <td class="btop-process-bar-cell">
                    <div class="btop-process-bar-mini">
                        <div class="btop-process-bar-mini-fill ${cpuBarClass}" style="width: ${cpuBarWidth}%; color: ${cpuColor};"></div>
                    </div>
                </td>
                <td class="btop-process-mem" style="color: ${memColor};">${memPercent.toFixed(1)}%</td>
                <td class="btop-process-bar-cell">
                    <div class="btop-process-bar-mini">
                        <div class="btop-process-bar-mini-fill ${memBarClass}" style="width: ${memBarWidth}%; color: ${memColor};"></div>
                    </div>
                </td>
                <td style="color: #00ffff; text-shadow: 0 0 4px #00ffff;">${this._formatBytes(proc.heapSize || 0)}</td>
                <td style="color: #ff00ff; text-shadow: 0 0 4px #ff00ff;">${this._formatBytes(proc.shedSize || 0)}</td>
            </tr>`;
            });

            html += `
        </tbody>
    </table>`;

            if (displayProcesses.length === 0) {
                html += `
    <div style="margin-top: 8px; padding: 8px; text-align: center; color: #64748b; font-size: 11px;">
        暂无进程数据
    </div>`;
            } else if (processes.length > maxDisplay) {
                html += `
    <div style="margin-top: 4px; color: #64748b; font-style: italic; font-size: 10px;">
        ... 还有 ${processes.length - maxDisplay} 个进程未显示
    </div>`;
            }

            html += `</div>`;
            return html;
        },

        /**
         * 渲染帮助HTML
         */
        _renderHelpHTML: function() {
            return `
<div class="btop-help">
    <div class="btop-help-title">快捷键帮助</div>
    <div class="btop-help-grid">
        <div>
            <span class="btop-help-key">q, Ctrl+C</span>
            <span class="btop-help-desc">退出程序</span>
        </div>
        <div>
            <span class="btop-help-key">↑/↓</span>
            <span class="btop-help-desc">选择进程</span>
        </div>
        <div>
            <span class="btop-help-key">h</span>
            <span class="btop-help-desc">显示/隐藏帮助</span>
        </div>
        <div>
            <span class="btop-help-key">Ctrl+P</span>
            <span class="btop-help-desc">按PID排序</span>
        </div>
        <div>
            <span class="btop-help-key">空格</span>
            <span class="btop-help-desc">暂停/继续刷新</span>
        </div>
        <div>
            <span class="btop-help-key">Ctrl+M</span>
            <span class="btop-help-desc">按内存排序</span>
        </div>
        <div>
            <span class="btop-help-key">Ctrl+T</span>
            <span class="btop-help-desc">按CPU排序</span>
        </div>
    </div>
</div>`;
        },

        /**
         * 渲染页脚HTML
         */
        _renderFooterHTML: function() {
            return `
<div class="btop-footer">
    <div>
        按 <span style="color: #00ffff; font-weight: bold; text-shadow: 0 0 6px #00ffff;">h</span> 显示帮助 | 
        按 <span style="color: #00ffff; font-weight: bold; text-shadow: 0 0 6px #00ffff;">q</span> 退出 | 
        刷新间隔: <span style="color: #00ff88; font-weight: bold; text-shadow: 0 0 6px #00ff88;">${this._refreshRate}ms</span>
    </div>
    <div>
        排序: <span style="color: #ffaa00; font-weight: bold; text-shadow: 0 0 6px #ffaa00;">${this._sortBy.toUpperCase()}</span> 
        (<span style="color: #64748b;">${this._sortOrder === 'asc' ? '升序' : '降序'}</span>)
    </div>
</div>`;
        },

        /**
         * 渲染标题栏（保留用于兼容）
         */
        _renderHeader: function(systemInfo) {
            const width = 100;
            const title = ' BTOP - ZerOS 系统性能监控 ';
            const border = '═'.repeat(width - 2);
            
            // 顶部边框
            this.terminal.write({
                text: `╔${border}╗\n`,
                color: '#8b5cf6',
                bold: true
            });
            
            // 标题
            this.terminal.write({
                text: '║',
                color: '#8b5cf6',
                bold: true
            });
            this.terminal.write({
                text: title,
                color: '#a78bfa',
                bold: true
            });
            this.terminal.write({
                text: ' '.repeat(width - title.length - 3) + '║\n',
                color: '#8b5cf6',
                bold: true
            });
            
            // 系统信息行
            this.terminal.write({
                text: '║',
                color: '#8b5cf6',
                bold: true
            });
            this.terminal.write({
                text: ` 系统: `,
                color: '#cbd5e1'
            });
            this.terminal.write({
                text: `${systemInfo.systemName} ${systemInfo.systemVersion}`,
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: `  |  内核: `,
                color: '#cbd5e1'
            });
            this.terminal.write({
                text: `${systemInfo.kernelVersion}`,
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: `  |  运行时间: `,
                color: '#cbd5e1'
            });
            this.terminal.write({
                text: `${systemInfo.uptime}`,
                color: '#34d399',
                bold: true
            });
            this.terminal.write({
                text: ' '.repeat(width - 60) + '║\n',
                color: '#8b5cf6',
                bold: true
            });
            
            // 底部边框
            this.terminal.write({
                text: `╚${border}╝\n`,
                color: '#8b5cf6',
                bold: true
            });
            this.terminal.write('\n');
        },

        /**
         * 渲染顶部信息栏
         */
        _renderTopBar: function(memoryInfo, systemInfo) {
            const width = 100;
            
            // CPU使用率
            const cpuUsage = this._calculateCPUUsage();
            const cpuColor = this._getUsageColor(cpuUsage);
            const cpuBar = this._createBar(cpuUsage, 40, cpuColor);
            
            this.terminal.write({
                text: ' CPU使用率: ',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write({
                text: cpuBar,
                color: cpuColor
            });
            this.terminal.write({
                text: ` ${cpuUsage.toFixed(1)}%`,
                color: cpuColor,
                bold: true
            });
            
            // 内存使用率
            const memUsage = memoryInfo.totalSize > 0 
                ? (memoryInfo.totalUsed / memoryInfo.totalSize) * 100 
                : 0;
            const memColor = this._getUsageColor(memUsage);
            const memBar = this._createBar(memUsage, 40, memColor);
            
            this.terminal.write({
                text: '  |  内存使用: ',
                color: '#cbd5e1'
            });
            this.terminal.write({
                text: memBar,
                color: memColor
            });
            this.terminal.write({
                text: ` ${memUsage.toFixed(1)}%`,
                color: memColor,
                bold: true
            });
            this.terminal.write({
                text: ` (${this._formatBytes(memoryInfo.totalUsed)}/${this._formatBytes(memoryInfo.totalSize)})\n`,
                color: '#94a3b8'
            });
            
            // 进程统计
            this.terminal.write({
                text: ' 运行进程: ',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write({
                text: `${memoryInfo.totalProcesses}`,
                color: '#34d399',
                bold: true
            });
            this.terminal.write({
                text: ' 个进程  |  ',
                color: '#cbd5e1'
            });
            this.terminal.write({
                text: `${memoryInfo.totalHeaps}`,
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: ' 个堆  |  ',
                color: '#cbd5e1'
            });
            this.terminal.write({
                text: `${memoryInfo.totalSheds}`,
                color: '#a78bfa',
                bold: true
            });
            this.terminal.write({
                text: ' 个栈\n',
                color: '#cbd5e1'
            });
            
            this.terminal.write({
                text: '─'.repeat(width) + '\n',
                color: '#475569'
            });
            this.terminal.write('\n');
        },

        /**
         * 渲染详细信息区域
         */
        _renderDetailsSection: function(memoryInfo, systemInfo) {
            const width = 100;
            const leftWidth = 48;
            const rightWidth = 48;
            
            // 左侧：CPU和内存详情
            this.terminal.write({
                text: ' CPU 详情',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write(' '.repeat(leftWidth - 9));
            this.terminal.write({
                text: ' 内存详情',
                bold: true,
                color: '#3b82f6'
            });
            this.terminal.write('\n');
            
            // CPU核心信息（模拟多核心）
            const cpuUsage = this._calculateCPUUsage();
            const cpuColor = this._getUsageColor(cpuUsage);
            
            this.terminal.write({
                text: '  核心 1: ',
                color: '#cbd5e1'
            });
            const cpuBar1 = this._createBar(cpuUsage + Math.random() * 10 - 5, 30, cpuColor);
            this.terminal.write({
                text: cpuBar1,
                color: cpuColor
            });
            this.terminal.write({
                text: ` ${(cpuUsage + Math.random() * 10 - 5).toFixed(1)}%\n`,
                color: cpuColor,
                bold: true
            });
            
            // 内存详细信息
            const memUsage = memoryInfo.totalSize > 0 
                ? (memoryInfo.totalUsed / memoryInfo.totalSize) * 100 
                : 0;
            const memFree = memoryInfo.totalSize - memoryInfo.totalUsed;
            const memColor = this._getUsageColor(memUsage);
            
            this.terminal.write(' '.repeat(leftWidth));
            this.terminal.write({
                text: '  已用: ',
                color: '#cbd5e1'
            });
            this.terminal.write({
                text: this._formatBytes(memoryInfo.totalUsed),
                color: memColor,
                bold: true
            });
            this.terminal.write({
                text: ` (${memUsage.toFixed(1)}%)\n`,
                color: '#94a3b8'
            });
            
            // CPU核心2（模拟）
            this.terminal.write({
                text: '  核心 2: ',
                color: '#cbd5e1'
            });
            const cpuBar2 = this._createBar(cpuUsage + Math.random() * 10 - 5, 30, cpuColor);
            this.terminal.write({
                text: cpuBar2,
                color: cpuColor
            });
            this.terminal.write({
                text: ` ${(cpuUsage + Math.random() * 10 - 5).toFixed(1)}%\n`,
                color: cpuColor,
                bold: true
            });
            
            // 内存空闲
            this.terminal.write(' '.repeat(leftWidth));
            this.terminal.write({
                text: '  空闲: ',
                color: '#cbd5e1'
            });
            this.terminal.write({
                text: this._formatBytes(memFree),
                color: '#34d399',
                bold: true
            });
            this.terminal.write({
                text: ` (${(100 - memUsage).toFixed(1)}%)\n`,
                color: '#94a3b8'
            });
            
            // CPU平均负载
            this.terminal.write({
                text: '  负载: ',
                color: '#cbd5e1'
            });
            const load1 = (cpuUsage / 100).toFixed(2);
            const load5 = (cpuUsage / 100 * 0.9).toFixed(2);
            const load15 = (cpuUsage / 100 * 0.8).toFixed(2);
            this.terminal.write({
                text: `${load1}  ${load5}  ${load15}`,
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write('\n');
            
            // 内存总计
            this.terminal.write(' '.repeat(leftWidth));
            this.terminal.write({
                text: '  总计: ',
                color: '#cbd5e1'
            });
            this.terminal.write({
                text: this._formatBytes(memoryInfo.totalSize),
                color: '#a78bfa',
                bold: true
            });
            this.terminal.write('\n');
            
            // 分隔线
            this.terminal.write({
                text: '─'.repeat(width) + '\n',
                color: '#475569'
            });
            this.terminal.write('\n');
        },

        /**
         * 渲染进程列表
         */
        _renderProcessList: function(processes) {
            const width = 100;
            
            // 表头
            this.terminal.write({
                text: ' PID',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write({
                text: '  NAME',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write(' '.repeat(15));
            this.terminal.write({
                text: 'STATUS',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write(' '.repeat(3));
            this.terminal.write({
                text: 'CPU%',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write(' '.repeat(3));
            this.terminal.write({
                text: 'MEM%',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write(' '.repeat(3));
            this.terminal.write({
                text: 'HEAP',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write(' '.repeat(3));
            this.terminal.write({
                text: 'SHED',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write('\n');
            
            this.terminal.write({
                text: '─'.repeat(width) + '\n',
                color: '#475569'
            });

            // 限制显示数量
            const maxDisplay = 15;
            const displayProcesses = processes.slice(0, maxDisplay);

            // 渲染进程
            for (let i = 0; i < displayProcesses.length; i++) {
                const proc = displayProcesses[i];
                const isSelected = i === this._selectedIndex;

                // 选中高亮背景
                if (isSelected) {
                    this.terminal.write({
                        text: '▶ ',
                        color: '#8b5cf6',
                        bold: true
                    });
                } else {
                    this.terminal.write('  ');
                }

                // PID
                this.terminal.write({
                    text: String(proc.pid).padEnd(6),
                    color: isSelected ? '#a78bfa' : '#60a5fa',
                    bold: isSelected
                });

                // 程序名
                const name = (proc.programName || `Program-${proc.pid}`).substring(0, 20).padEnd(20);
                this.terminal.write({
                    text: name,
                    color: isSelected ? '#e2e8f0' : '#cbd5e1',
                    bold: isSelected
                });

                // 状态
                const status = proc.status || 'unknown';
                let statusColor = '#94a3b8';
                let statusText = status;
                if (status === 'running') {
                    statusColor = '#34d399';
                    statusText = '运行中';
                } else if (status === 'exited') {
                    statusColor = '#f87171';
                    statusText = '已退出';
                } else if (status === 'starting') {
                    statusColor = '#fbbf24';
                    statusText = '启动中';
                }
                
                this.terminal.write({
                    text: statusText.padEnd(8),
                    color: statusColor,
                    bold: true
                });

                // CPU使用率（模拟）
                const cpuPercent = proc.cpuPercent || 0;
                const cpuColor = this._getUsageColor(cpuPercent);
                this.terminal.write({
                    text: `${cpuPercent.toFixed(1)}%`.padEnd(6),
                    color: cpuColor,
                    bold: cpuPercent > 50
                });

                // 内存使用率
                const memPercent = proc.memPercent || 0;
                const memColor = this._getUsageColor(memPercent);
                this.terminal.write({
                    text: `${memPercent.toFixed(1)}%`.padEnd(6),
                    color: memColor,
                    bold: memPercent > 50
                });

                // 堆内存
                const heapSize = this._formatBytes(proc.heapSize || 0);
                this.terminal.write({
                    text: heapSize.padEnd(10),
                    color: '#60a5fa'
                });

                // 栈内存
                const shedSize = this._formatBytes(proc.shedSize || 0);
                this.terminal.write({
                    text: shedSize.padEnd(10),
                    color: '#a78bfa'
                });

                this.terminal.write('\n');
            }

            if (processes.length > maxDisplay) {
                this.terminal.write({
                    text: `\n... 还有 ${processes.length - maxDisplay} 个进程未显示\n`,
                    color: '#64748b',
                    italic: true
                });
            }

            this.terminal.write('\n');
        },

        /**
         * 渲染帮助信息
         */
        _renderHelp: function() {
            const width = 100;
            
            this.terminal.write({
                text: '─'.repeat(width) + '\n',
                color: '#475569'
            });
            
            this.terminal.write({
                text: ' 快捷键帮助',
                bold: true,
                color: '#fbbf24'
            });
            this.terminal.write('\n');
            
            this.terminal.write({
                text: '─'.repeat(width) + '\n',
                color: '#475569'
            });
            
            // 第一列
            this.terminal.write({
                text: '  q, Ctrl+C',
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: '    退出程序',
                color: '#cbd5e1'
            });
            
            this.terminal.write(' '.repeat(20));
            
            this.terminal.write({
                text: '  ↑/↓',
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: '          选择进程',
                color: '#cbd5e1'
            });
            
            this.terminal.write('\n');
            
            // 第二列
            this.terminal.write({
                text: '  h',
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: '            显示/隐藏帮助',
                color: '#cbd5e1'
            });
            
            this.terminal.write(' '.repeat(20));
            
            this.terminal.write({
                text: '  Ctrl+P',
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: '       按PID排序',
                color: '#cbd5e1'
            });
            
            this.terminal.write('\n');
            
            // 第三列
            this.terminal.write({
                text: '  空格',
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: '          暂停/继续刷新',
                color: '#cbd5e1'
            });
            
            this.terminal.write(' '.repeat(20));
            
            this.terminal.write({
                text: '  Ctrl+M',
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: '       按内存排序',
                color: '#cbd5e1'
            });
            
            this.terminal.write('\n');
            
            // 第四列
            this.terminal.write(' '.repeat(15));
            this.terminal.write({
                text: '  Ctrl+T',
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: '       按CPU排序',
                color: '#cbd5e1'
            });
            
            this.terminal.write('\n');
            this.terminal.write('\n');
        },

        /**
         * 渲染页脚
         */
        _renderFooter: function() {
            const width = 100;
            
            this.terminal.write({
                text: '─'.repeat(width) + '\n',
                color: '#475569'
            });
            
            this.terminal.write({
                text: ' 按 ',
                color: '#64748b'
            });
            this.terminal.write({
                text: 'h',
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: ' 显示帮助  |  按 ',
                color: '#64748b'
            });
            this.terminal.write({
                text: 'q',
                color: '#60a5fa',
                bold: true
            });
            this.terminal.write({
                text: ' 退出  |  刷新间隔: ',
                color: '#64748b'
            });
            this.terminal.write({
                text: `${this._refreshRate}ms`,
                color: '#34d399',
                bold: true
            });
            this.terminal.write({
                text: `  |  排序: `,
                color: '#64748b'
            });
            this.terminal.write({
                text: `${this._sortBy.toUpperCase()}`,
                color: '#fbbf24',
                bold: true
            });
            this.terminal.write({
                text: ` (${this._sortOrder === 'asc' ? '升序' : '降序'})\n`,
                color: '#64748b'
            });
        },

        /**
         * 获取系统信息
         */
        _getSystemInfo: function() {
            let systemName = 'ZerOS';
            let systemVersion = '0.6.6';
            let kernelVersion = '0.6.5';
            let uptime = '未知';

            try {
                if (typeof SystemInformation !== 'undefined') {
                    systemName = SystemInformation.SYSTEM_NAME || systemName;
                    systemVersion = SystemInformation.SYSTEM_VERSION || systemVersion;
                    kernelVersion = SystemInformation.KERNEL_VERSION || kernelVersion;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    const sysInfo = POOL.__GET__('KERNEL_GLOBAL_POOL', 'SystemInformation');
                    if (sysInfo) {
                        systemName = sysInfo.SYSTEM_NAME || systemName;
                        systemVersion = sysInfo.SYSTEM_VERSION || systemVersion;
                        kernelVersion = sysInfo.KERNEL_VERSION || kernelVersion;
                    }
                }

                // 计算运行时间（简化版）
                uptime = this._calculateUptime();
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("BTOP", `获取系统信息失败: ${e.message}`);
                }
            }

            return {
                systemName,
                systemVersion,
                kernelVersion,
                uptime
            };
        },

        /**
         * 获取进程列表
         */
        _getProcesses: function() {
            let processes = [];

            try {
                let ProcessMgr = null;
                if (typeof ProcessManager !== 'undefined') {
                    ProcessMgr = ProcessManager;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    ProcessMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'ProcessManager');
                }

                if (ProcessMgr) {
                    const allProcesses = ProcessMgr.getProcessInfo();
                    processes = allProcesses
                        .filter(p => p.status === 'running')
                        .map(p => {
                            const memInfo = p.memoryInfo;
                            let heapSize = 0;
                            let shedSize = 0;
                            let memPercent = 0;

                            if (memInfo && memInfo.programs && memInfo.programs.length > 0) {
                                const prog = memInfo.programs[0];
                                heapSize = prog.totalHeapSize || 0;
                                shedSize = prog.totalShedSize || 0;
                            }

                            // 计算内存使用百分比（相对于总内存）
                            const totalMem = this._getTotalMemory();
                            if (totalMem > 0) {
                                memPercent = (heapSize / totalMem) * 100;
                            }

                            return {
                                pid: p.pid,
                                programName: p.programName || `Program-${p.pid}`,
                                status: p.status || 'unknown',
                                heapSize: heapSize,
                                shedSize: shedSize,
                                memPercent: memPercent,
                                cpuPercent: 0 // CPU使用率需要历史数据计算，这里简化
                            };
                        });
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("BTOP", `获取进程列表失败: ${e.message}`);
                }
            }

            // 如果没有进程，添加一些模拟进程数据
            if (processes.length === 0) {
                const mockProcesses = [
                    { pid: 10000, name: 'kernel', heapSize: 1024 * 1024 * 2, shedSize: 512 * 1024 },
                    { pid: 10001, name: 'terminal', heapSize: 1024 * 1024 * 1.5, shedSize: 256 * 1024 },
                    { pid: 10002, name: 'btop', heapSize: 512 * 1024, shedSize: 128 * 1024 },
                    { pid: 10003, name: 'filesystem', heapSize: 768 * 1024, shedSize: 192 * 1024 },
                    { pid: 10004, name: 'event-manager', heapSize: 256 * 1024, shedSize: 64 * 1024 },
                    { pid: 10005, name: 'gui-manager', heapSize: 384 * 1024, shedSize: 96 * 1024 },
                    { pid: 10006, name: 'memory-manager', heapSize: 128 * 1024, shedSize: 32 * 1024 },
                    { pid: 10007, name: 'process-manager', heapSize: 192 * 1024, shedSize: 48 * 1024 },
                    { pid: 10008, name: 'network-service', heapSize: 256 * 1024, shedSize: 64 * 1024 },
                    { pid: 10009, name: 'disk-service', heapSize: 320 * 1024, shedSize: 80 * 1024 },
                ];
                
                const totalMem = this._getTotalMemory();
                processes = mockProcesses.map((mock, idx) => {
                    const heapSize = mock.heapSize;
                    const shedSize = mock.shedSize;
                    const memPercent = totalMem > 0 ? (heapSize / totalMem) * 100 : 0;
                    const cpuPercent = Math.random() * 15 + (idx < 3 ? 5 : 0); // 前3个进程CPU使用率稍高
                    
                    return {
                        pid: mock.pid,
                        programName: mock.name,
                        status: 'running',
                        heapSize: heapSize,
                        shedSize: shedSize,
                        memPercent: memPercent,
                        cpuPercent: cpuPercent
                    };
                });
            }

            // 为每个进程计算CPU使用率（如果还没有）
            processes.forEach(proc => {
                if (!proc.cpuPercent || proc.cpuPercent === 0) {
                    // 基于进程ID和内存使用率生成模拟CPU使用率
                    proc.cpuPercent = Math.max(0.1, Math.min(20, (proc.memPercent || 0) * 0.3 + Math.random() * 5));
                }
            });

            // 排序
            processes.sort((a, b) => {
                let aVal, bVal;
                
                switch (this._sortBy) {
                    case 'cpu':
                        aVal = a.cpuPercent || 0;
                        bVal = b.cpuPercent || 0;
                        break;
                    case 'memory':
                        aVal = a.heapSize || 0;
                        bVal = b.heapSize || 0;
                        break;
                    case 'pid':
                        aVal = a.pid;
                        bVal = b.pid;
                        break;
                    case 'name':
                        aVal = (a.programName || '').toLowerCase();
                        bVal = (b.programName || '').toLowerCase();
                        break;
                    default:
                        aVal = a.pid;
                        bVal = b.pid;
                }

                if (this._sortOrder === 'asc') {
                    return aVal > bVal ? 1 : (aVal < bVal ? -1 : 0);
                } else {
                    return aVal < bVal ? 1 : (aVal > bVal ? -1 : 0);
                }
            });

            // 更新选中索引范围
            if (this._selectedIndex >= processes.length) {
                this._selectedIndex = Math.max(0, processes.length - 1);
            }

            return processes;
        },

        /**
         * 获取内存信息
         */
        _getMemoryInfo: function() {
            let memoryInfo = {
                totalProcesses: 0,
                totalHeaps: 0,
                totalSheds: 0,
                totalSize: 0,
                totalUsed: 0,
                totalFree: 0
            };

            try {
                let MemoryMgr = null;
                if (typeof MemoryManager !== 'undefined') {
                    MemoryMgr = MemoryManager;
                } else if (typeof POOL !== 'undefined' && typeof POOL.__GET__ === 'function') {
                    MemoryMgr = POOL.__GET__('KERNEL_GLOBAL_POOL', 'MemoryManager');
                }

                if (MemoryMgr && typeof MemoryMgr.getMemoryStatistics === 'function') {
                    const stats = MemoryMgr.getMemoryStatistics();
                    memoryInfo = {
                        totalProcesses: stats.totalProcesses || 0,
                        totalHeaps: stats.totalHeaps || 0,
                        totalSheds: 0, // MemoryManager没有统计sheds
                        totalSize: stats.totalSize || 0,
                        totalUsed: stats.totalUsed || 0,
                        totalFree: stats.totalFree || 0
                    };
                }
            } catch (e) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn("BTOP", `获取内存信息失败: ${e.message}`);
                }
            }

            // 如果内存信息为空，使用模拟数据
            if (memoryInfo.totalSize === 0) {
                memoryInfo = {
                    totalProcesses: 10,
                    totalHeaps: 15,
                    totalSheds: 8,
                    totalSize: 2 * 1024 * 1024, // 2MB
                    totalUsed: 1.2 * 1024 * 1024, // 1.2MB
                    totalFree: 0.8 * 1024 * 1024 // 0.8MB
                };
            }

            // 确保totalFree计算正确
            if (memoryInfo.totalFree === 0 && memoryInfo.totalSize > 0) {
                memoryInfo.totalFree = memoryInfo.totalSize - memoryInfo.totalUsed;
            }

            return memoryInfo;
        },

        /**
         * 获取总内存（用于计算百分比）
         */
        _getTotalMemory: function() {
            const memoryInfo = this._getMemoryInfo();
            return memoryInfo.totalSize || 1; // 避免除零
        },

        /**
         * 计算CPU使用率（模拟，因为浏览器环境是单线程）
         */
        _calculateCPUUsage: function() {
            // 在浏览器环境中，CPU使用率难以准确测量
            // 这里返回一个基于进程数量的模拟值
            const processes = this._getProcesses();
            const baseUsage = Math.min(processes.length * 3, 60); // 每个进程3%，最多60%
            
            // 添加历史数据跟踪，使CPU使用率更平滑
            if (!this._cpuHistory) {
                this._cpuHistory = [];
            }
            
            // 计算当前使用率（添加随机波动）
            const currentUsage = Math.max(5, Math.min(95, baseUsage + Math.random() * 15 - 5));
            
            // 保存历史数据（保留最近20个值）
            this._cpuHistory.push(currentUsage);
            if (this._cpuHistory.length > 20) {
                this._cpuHistory.shift();
            }
            
            // 返回平均值，使数据更平滑
            const avgUsage = this._cpuHistory.reduce((a, b) => a + b, 0) / this._cpuHistory.length;
            return Math.max(5, Math.min(95, avgUsage));
        },

        /**
         * 计算系统运行时间
         */
        _calculateUptime: function() {
            try {
                // 尝试从系统获取启动时间
                if (typeof SystemInformation !== 'undefined' && SystemInformation.SYSTEM_START_TIME) {
                    const startTime = SystemInformation.SYSTEM_START_TIME;
                    const now = Date.now();
                    const uptimeMs = now - startTime;
                    return this._formatUptime(uptimeMs);
                }
                
                // 如果没有启动时间，使用程序启动时间作为参考
                if (!this._programStartTime) {
                    this._programStartTime = Date.now();
                }
                const uptimeMs = Date.now() - this._programStartTime;
                return this._formatUptime(uptimeMs);
            } catch (e) {
                // 如果获取失败，返回模拟的运行时间
                const hours = Math.floor(Math.random() * 24);
                const minutes = Math.floor(Math.random() * 60);
                const seconds = Math.floor(Math.random() * 60);
                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        },

        /**
         * 格式化运行时间
         */
        _formatUptime: function(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (days > 0) {
                return `${days}天 ${hours % 24}时 ${minutes % 60}分`;
            } else if (hours > 0) {
                return `${hours}时 ${minutes % 60}分 ${seconds % 60}秒`;
            } else if (minutes > 0) {
                return `${minutes}分 ${seconds % 60}秒`;
            } else {
                return `${seconds}秒`;
            }
        },

        /**
         * 获取使用率颜色（科幻风格）
         */
        _getUsageColor: function(percent) {
            if (percent < 30) return '#00ff88'; // 青色 - 低使用率
            if (percent < 60) return '#ffaa00'; // 橙色 - 中等使用率
            if (percent < 80) return '#ff3366'; // 红色 - 高使用率
            return '#ff00ff'; // 紫色 - 极高使用率
        },

        /**
         * 创建进度条
         */
        _createBar: function(percent, width, color) {
            const filled = Math.floor((Math.min(percent, 100) / 100) * width);
            const empty = width - filled;
            const bar = '█'.repeat(filled) + '░'.repeat(empty);
            return bar;
        },

        /**
         * 格式化字节数
         */
        _formatBytes: function(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
        },

        /**
         * 格式化数字（添加千分位分隔符）
         */
        _formatNumber: function(num) {
            if (num < 1000) return num.toString();
            if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
            if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
            return (num / 1000000000).toFixed(1) + 'B';
        },

        /**
         * 显示使用说明
         */
        _showUsage: function() {
            this.terminal.write('用法: btop [选项]\n');
            this.terminal.write('\n');
            this.terminal.write('选项:\n');
            this.terminal.write('  -d, --delay <ms>    设置刷新间隔（毫秒，默认1000）\n');
            this.terminal.write('  -h, --help          显示此帮助信息\n');
            this.terminal.write('\n');
            this.terminal.write('示例:\n');
            this.terminal.write('  btop                启动性能监控（默认1秒刷新）\n');
            this.terminal.write('  btop -d 500         每500毫秒刷新一次\n');
            this.terminal.write('\n');
            this.terminal.write('快捷键:\n');
            this.terminal.write('  q, Ctrl+C          退出\n');
            this.terminal.write('  h                   显示/隐藏帮助\n');
            this.terminal.write('  ↑/↓                选择进程\n');
            this.terminal.write('  Ctrl+P/M/T         按PID/内存/CPU排序\n');
            this.terminal.write('  空格                暂停/继续刷新\n');
        },

        /**
         * 自关闭程序
         */
        _selfClose: async function() {
            if (this._closing) return;
            this._closing = true;

            // 停止刷新循环
            if (this._refreshInterval) {
                clearInterval(this._refreshInterval);
                this._refreshInterval = null;
            }

            // 清理事件处理器
            if (typeof EventManager !== 'undefined' && this._keyboardHandlerId) {
                try {
                    EventManager.unregisterEventHandler(this._keyboardHandlerId);
                } catch (e) {}
            }

            // 清屏
            this.terminal.clear();
            this.terminal.write('BTOP 已退出\n');

            // 延迟后关闭
            await new Promise(resolve => setTimeout(resolve, 200));

            if (!this.pid) return;

            try {
                if (this._kernelAPI && typeof this._kernelAPI.call === 'function') {
                    await this._kernelAPI.call('Process.requestSelfTermination', []);
                } else if (typeof ProcessManager !== 'undefined') {
                    await ProcessManager.callKernelAPI(this.pid, 'Process.requestSelfTermination', []);
                }
            } catch (error) {
                if (typeof ProcessManager !== 'undefined' && ProcessManager.killProgram) {
                    try {
                        await ProcessManager.killProgram(this.pid, true);
                    } catch (e) {}
                }
            }
        },

        /**
         * 退出方法
         */
        __exit__: async function() {
            // 停止刷新循环
            if (this._refreshInterval) {
                clearInterval(this._refreshInterval);
                this._refreshInterval = null;
            }

            // 清理事件处理器
            if (typeof EventManager !== 'undefined' && this._keyboardHandlerId) {
                try {
                    EventManager.unregisterEventHandler(this._keyboardHandlerId);
                } catch (e) {}
            }

            // 清理引用
            this.terminal = null;
            this._kernelAPI = null;
        }
    };

    // 注册到全局
    if (typeof window !== 'undefined') {
        window.BTOP = BTOP;
    }

    // 注册到 POOL（如果可用）
    if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
        try {
            if (!POOL.__HAS__("APPLICATION_SHARED_POOL")) {
                POOL.__INIT__("APPLICATION_SHARED_POOL");
            }
            POOL.__ADD__("APPLICATION_SHARED_POOL", "BTOP", BTOP);
        } catch (e) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.error("BTOP", `注册到 POOL 失败: ${e.message}`, e);
            }
        }
    }

})(window);
