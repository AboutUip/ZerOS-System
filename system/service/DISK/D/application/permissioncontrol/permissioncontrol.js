// ZerOS 权限管控中心
// 负责权限的管控、统计、黑名单、白名单等功能

(function (window) {
    'use strict';

    const PERMISSIONCONTROL = {
        pid: null,
        window: null,
        windowId: null,
        refreshTimer: null,
        currentTab: 'overview', // 'overview', 'programs', 'permissions', 'blacklist', 'whitelist', 'audit'
        blacklist: new Set(), // 程序黑名单
        whitelist: new Set(), // 程序白名单
        autoGrantEnabled: true, // 是否启用自动授予（仅普通权限）

        __init__: async function (pid, initArgs) {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('PermissionControl', `__init__ 被调用, PID: ${pid}`);
            }
            this.pid = pid;

            // 获取 GUI 容器
            const guiContainer =
                (initArgs && initArgs.guiContainer)
                || (typeof ProcessManager !== 'undefined' && typeof ProcessManager.getGUIContainer === 'function'
                    ? ProcessManager.getGUIContainer()
                    : null)
                || document.getElementById('gui-container')
                || document.body;

            // PermissionManager 应该已经在系统启动时初始化
            // 使用 _ensureInitialized() 方法（内部会检查是否已初始化，避免重复初始化警告）
            if (typeof PermissionManager !== 'undefined') {
                try {
                    if (typeof PermissionManager._ensureInitialized === 'function') {
                        await PermissionManager._ensureInitialized();
                    } else if (typeof PermissionManager.init === 'function' && !PermissionManager._initialized) {
                        // 降级方案：如果 _ensureInitialized 不存在，检查 _initialized 标志
                        await PermissionManager.init();
                    }
                } catch (error) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.warn('PermissionControl', `PermissionManager 初始化检查失败: ${error.message}`);
                    }
                }
            }

            // 加载黑名单和白名单
            await this._loadLists();

            // 创建主窗口
            this.window = document.createElement('div');
            this.window.className = 'permissioncontrol-window zos-gui-window';
            this.window.dataset.pid = pid.toString();

            // 设置窗口样式
            this.window.style.cssText = `
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;

            // 使用 GUIManager 注册窗口
            if (typeof GUIManager !== 'undefined') {
                let icon = null;
                if (typeof ApplicationAssetManager !== 'undefined') {
                    icon = ApplicationAssetManager.getIcon('permissioncontrol');
                }

                const windowInfo = GUIManager.registerWindow(pid, this.window, {
                    title: '权限管控中心',
                    icon: icon,
                    onClose: () => {
                        // 窗口关闭时终止程序
                        if (typeof ProcessManager !== 'undefined') {
                            ProcessManager.killProgram(pid);
                        }
                    }
                });

                if (windowInfo && windowInfo.windowId) {
                    this.windowId = windowInfo.windowId;
                }
            }

            // 创建工具栏
            const toolbar = this._createToolbar();
            this.window.appendChild(toolbar);

            // 创建主内容区域
            const content = document.createElement('div');
            content.className = 'permissioncontrol-content';
            content.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
                min-height: 0;
            `;

            // 创建左侧导航栏
            const leftPanel = this._createNavigationPanel();
            content.appendChild(leftPanel);

            // 创建右侧内容区域
            const rightPanel = this._createContentPanel();
            content.appendChild(rightPanel);

            this.window.appendChild(content);

            // 添加到容器
            guiContainer.appendChild(this.window);

            // 注册键盘快捷键
            this._registerKeyboardShortcuts();

            // 延迟加载数据，确保进程已完全注册
            setTimeout(async () => {
                await this._refreshData();
            }, 100);
        },

        __exit__: async function () {
            if (typeof KernelLogger !== 'undefined') {
                KernelLogger.debug('PermissionControl', '__exit__ 被调用');
            }

            // 清理定时器
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }

            // 注销窗口
            if (typeof GUIManager !== 'undefined' && this.windowId) {
                GUIManager.unregisterWindow(this.windowId);
            } else if (this.pid && typeof GUIManager !== 'undefined') {
                GUIManager.unregisterWindow(this.pid);
            }

            // 清理引用
            this.window = null;
            this.windowId = null;
        },

        __info__: function () {
            return {
                name: '权限管控中心',
                type: 'GUI',
                description: '权限管控、统计、黑名单、白名单管理工具',
                version: '1.0.0',
                author: 'ZerOS Team',
                copyright: '© 2025 ZerOS',
                permissions: typeof PermissionManager !== 'undefined' ? [
                    PermissionManager.PERMISSION.GUI_WINDOW_CREATE,      // 创建GUI窗口
                    PermissionManager.PERMISSION.EVENT_LISTENER,          // 注册事件监听器
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ,   // 读取系统存储（基础权限，仅可读取非敏感键）
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_READ_PERMISSION_CONTROL, // 读取权限控制存储（读取黑名单、白名单、设置）- 需要管理员授权
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE,  // 写入系统存储（基础权限，仅可写入非敏感键）
                    PermissionManager.PERMISSION.SYSTEM_STORAGE_WRITE_PERMISSION_CONTROL, // 写入权限控制存储（保存黑名单、白名单、设置）- 需要管理员授权
                    PermissionManager.PERMISSION.PROCESS_MANAGE          // 管理进程（需要查看和管理其他程序的权限）
                ] : [],
                metadata: {
                    allowMultipleInstances: false
                }
            };
        },

        /**
         * 创建工具栏
         */
        _createToolbar: function () {
            const toolbar = document.createElement('div');
            toolbar.className = 'permissioncontrol-toolbar';
            toolbar.style.cssText = `
                height: 48px;
                min-height: 48px;
                max-height: 48px;
                flex: 0 0 48px;
                display: flex;
                align-items: center;
                padding: 0 16px;
                gap: 12px;
                border-bottom: 1px solid rgba(108, 142, 255, 0.2);
                box-sizing: border-box;
            `;

            // 刷新按钮
            const refreshBtn = this._createToolbarButton('刷新', async () => {
                await this._refreshData();
            });
            toolbar.appendChild(refreshBtn);

            // 自动授予开关
            const autoGrantLabel = document.createElement('label');
            autoGrantLabel.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                color: rgba(215, 224, 221, 0.9);
                font-size: 13px;
                cursor: pointer;
                margin-left: auto;
            `;
            const autoGrantCheckbox = document.createElement('input');
            autoGrantCheckbox.type = 'checkbox';
            autoGrantCheckbox.checked = this.autoGrantEnabled;
            autoGrantCheckbox.style.cssText = 'cursor: pointer;';
            autoGrantCheckbox.addEventListener('change', (e) => {
                this.autoGrantEnabled = e.target.checked;
                this._saveSettings();
            });
            autoGrantLabel.appendChild(autoGrantCheckbox);
            autoGrantLabel.appendChild(document.createTextNode('自动授予普通权限'));
            toolbar.appendChild(autoGrantLabel);

            return toolbar;
        },

        /**
         * 创建工具栏按钮
         */
        _createToolbarButton: function (text, onClick) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.cssText = `
                padding: 6px 16px;
                background: rgba(108, 142, 255, 0.1);
                border: 1px solid rgba(108, 142, 255, 0.3);
                border-radius: 6px;
                color: rgba(215, 224, 221, 0.9);
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(108, 142, 255, 0.2)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(108, 142, 255, 0.1)';
            });
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'click', (e) => {
                    if (e.target === btn) {
                        e.stopPropagation();
                        onClick();
                    }
                }, {
                    priority: 100,
                    selector: null
                });
            } else {
                btn.addEventListener('click', onClick);
            }
            return btn;
        },

        /**
         * 创建导航面板
         */
        _createNavigationPanel: function () {
            const panel = document.createElement('div');
            panel.className = 'permissioncontrol-nav';
            panel.style.cssText = `
                width: 200px;
                min-width: 200px;
                max-width: 200px;
                display: flex;
                flex-direction: column;
                border-right: 1px solid rgba(108, 142, 255, 0.2);
                background: rgba(20, 20, 30, 0.3);
                overflow-y: auto;
            `;

            const navItems = [
                { id: 'overview', label: '概览', icon: '📊' },
                { id: 'programs', label: '程序权限', icon: '📱' },
                { id: 'permissions', label: '权限统计', icon: '📈' },
                { id: 'blacklist', label: '黑名单', icon: '🚫' },
                { id: 'whitelist', label: '白名单', icon: '✅' },
                { id: 'audit', label: '审计日志', icon: '📋' }
            ];

            navItems.forEach(item => {
                const navItem = document.createElement('div');
                navItem.className = 'permissioncontrol-nav-item';
                navItem.dataset.tab = item.id;
                navItem.style.cssText = `
                    padding: 12px 16px;
                    cursor: pointer;
                    color: rgba(215, 224, 221, 0.7);
                    font-size: 13px;
                    border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                navItem.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;

                if (item.id === this.currentTab) {
                    navItem.style.background = 'rgba(108, 142, 255, 0.15)';
                    navItem.style.color = 'rgba(215, 224, 221, 1)';
                }

                navItem.addEventListener('click', () => {
                    this._switchTab(item.id);
                });

                panel.appendChild(navItem);
            });

            return panel;
        },

        /**
         * 创建内容面板
         */
        _createContentPanel: function () {
            const panel = document.createElement('div');
            panel.className = 'permissioncontrol-content-panel';
            panel.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                min-height: 0;
            `;
            this.contentPanel = panel;
            return panel;
        },

        /**
         * 切换标签页
         */
        _switchTab: function (tabId) {
            this.currentTab = tabId;

            // 更新导航栏样式
            const navItems = this.window.querySelectorAll('.permissioncontrol-nav-item');
            navItems.forEach(item => {
                if (item.dataset.tab === tabId) {
                    item.style.background = 'rgba(108, 142, 255, 0.15)';
                    item.style.color = 'rgba(215, 224, 221, 1)';
                } else {
                    item.style.background = 'transparent';
                    item.style.color = 'rgba(215, 224, 221, 0.7)';
                }
            });

            // 更新内容区域
            this._renderContent();
        },

        /**
         * 渲染内容区域
         */
        _renderContent: async function () {
            if (!this.contentPanel) return;

            this.contentPanel.innerHTML = '';

            switch (this.currentTab) {
                case 'overview':
                    await this._renderOverview();
                    break;
                case 'programs':
                    await this._renderPrograms();
                    break;
                case 'permissions':
                    await this._renderPermissions();
                    break;
                case 'blacklist':
                    await this._renderBlacklist();
                    break;
                case 'whitelist':
                    await this._renderWhitelist();
                    break;
                case 'audit':
                    await this._renderAudit();
                    break;
            }
        },

        /**
         * 渲染概览页面
         */
        _renderOverview: async function () {
            const container = document.createElement('div');
            container.style.cssText = `
                flex: 1;
                padding: 24px;
                overflow-y: auto;
            `;

            // 获取统计信息
            const stats = typeof PermissionManager !== 'undefined' 
                ? PermissionManager.getPermissionStats() 
                : null;

            // 统计卡片
            const statsGrid = document.createElement('div');
            statsGrid.style.cssText = `
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
                margin-bottom: 24px;
            `;

            const statCards = [
                { label: '已注册程序', value: stats?.totalPrograms || 0, color: '#6C8EFF' },
                { label: '总权限数', value: stats?.totalPermissions || 0, color: '#8B5CF6' },
                { label: '审计日志', value: stats?.auditLogSize || 0, color: '#10B981' },
                { label: '违规记录', value: stats?.violationLogSize || 0, color: '#EF4444' },
                { label: '黑名单程序', value: this.blacklist.size, color: '#F59E0B' },
                { label: '白名单程序', value: this.whitelist.size, color: '#3B82F6' }
            ];

            statCards.forEach(card => {
                const cardEl = document.createElement('div');
                cardEl.style.cssText = `
                    background: rgba(20, 20, 30, 0.5);
                    border: 1px solid rgba(108, 142, 255, 0.2);
                    border-radius: 12px;
                    padding: 20px;
                `;
                cardEl.innerHTML = `
                    <div style="font-size: 12px; color: rgba(215, 224, 221, 0.6); margin-bottom: 8px;">${card.label}</div>
                    <div style="font-size: 28px; font-weight: bold; color: ${card.color};">${card.value}</div>
                `;
                statsGrid.appendChild(cardEl);
            });

            container.appendChild(statsGrid);

            // 最近违规记录
            if (typeof PermissionManager !== 'undefined') {
                const violations = PermissionManager.getViolationLog({}, 5);
                if (violations.length > 0) {
                    const violationsSection = document.createElement('div');
                    violationsSection.style.cssText = 'margin-top: 24px;';
                    violationsSection.innerHTML = `
                        <h3 style="font-size: 16px; color: rgba(215, 224, 221, 0.9); margin-bottom: 12px;">最近违规记录</h3>
                    `;
                    const violationsList = document.createElement('div');
                    violationsList.style.cssText = `
                        background: rgba(20, 20, 30, 0.5);
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        border-radius: 12px;
                        padding: 16px;
                    `;
                    violations.forEach(v => {
                        const item = document.createElement('div');
                        item.style.cssText = `
                            padding: 8px 0;
                            border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                            font-size: 12px;
                            color: rgba(215, 224, 221, 0.8);
                        `;
                        const time = new Date(v.timestamp).toLocaleString();
                        item.textContent = `${time} - ${v.programName} (PID ${v.pid}) 尝试访问 ${v.permission}`;
                        violationsList.appendChild(item);
                    });
                    violationsSection.appendChild(violationsList);
                    container.appendChild(violationsSection);
                }
            }

            this.contentPanel.appendChild(container);
        },

        /**
         * 渲染程序权限页面
         */
        _renderPrograms: async function () {
            const container = document.createElement('div');
            container.style.cssText = `
                flex: 1;
                padding: 24px;
                overflow-y: auto;
            `;

            if (typeof ProcessManager === 'undefined' || typeof PermissionManager === 'undefined') {
                container.innerHTML = '<div style="color: rgba(255, 95, 87, 0.8);">ProcessManager 或 PermissionManager 不可用</div>';
                this.contentPanel.appendChild(container);
                return;
            }

            // 获取所有运行的程序
            const programs = [];
            for (const [pid, processInfo] of ProcessManager.PROCESS_TABLE) {
                if (processInfo.programName) {
                    const permissions = PermissionManager.getProgramPermissions(pid);
                    const isBlacklisted = this.blacklist.has(processInfo.programName);
                    const isWhitelisted = this.whitelist.has(processInfo.programName);
                    programs.push({
                        pid,
                        programName: processInfo.programName,
                        permissions,
                        isBlacklisted,
                        isWhitelisted
                    });
                }
            }

            // 排序：按程序名称
            programs.sort((a, b) => a.programName.localeCompare(b.programName));

            const table = document.createElement('table');
            table.style.cssText = `
                width: 100%;
                border-collapse: collapse;
                background: rgba(20, 20, 30, 0.5);
                border-radius: 12px;
                overflow: hidden;
            `;

            // 表头
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr style="background: rgba(108, 142, 255, 0.1);">
                    <th style="padding: 12px; text-align: left; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">程序名称</th>
                    <th style="padding: 12px; text-align: left; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">PID</th>
                    <th style="padding: 12px; text-align: center; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">权限数</th>
                    <th style="padding: 12px; text-align: center; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">状态</th>
                    <th style="padding: 12px; text-align: center; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">操作</th>
                </tr>
            `;
            table.appendChild(thead);

            // 表体
            const tbody = document.createElement('tbody');
            programs.forEach(prog => {
                const row = document.createElement('tr');
                row.style.cssText = `
                    border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                `;
                
                let statusHtml = '';
                if (prog.isBlacklisted) {
                    statusHtml = '<span style="color: #EF4444;">🚫 黑名单</span>';
                } else if (prog.isWhitelisted) {
                    statusHtml = '<span style="color: #10B981;">✅ 白名单</span>';
                } else {
                    statusHtml = '<span style="color: rgba(215, 224, 221, 0.5);">-</span>';
                }

                row.innerHTML = `
                    <td style="padding: 12px; color: rgba(215, 224, 221, 0.9); font-size: 13px;">${prog.programName}</td>
                    <td style="padding: 12px; color: rgba(215, 224, 221, 0.7); font-size: 13px;">${prog.pid}</td>
                    <td style="padding: 12px; text-align: center; color: rgba(215, 224, 221, 0.9); font-size: 13px;">${prog.permissions.length}</td>
                    <td style="padding: 12px; text-align: center; font-size: 13px;">${statusHtml}</td>
                    <td style="padding: 12px; text-align: center;">
                        <button class="view-permissions-btn" data-pid="${prog.pid}" data-program="${prog.programName}" style="
                            padding: 4px 12px;
                            background: rgba(108, 142, 255, 0.2);
                            border: 1px solid rgba(108, 142, 255, 0.3);
                            border-radius: 4px;
                            color: rgba(108, 142, 255, 0.9);
                            font-size: 12px;
                            cursor: pointer;
                        ">查看权限</button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            if (programs.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td colspan="5" style="padding: 24px; text-align: center; color: rgba(215, 224, 221, 0.5);">
                        暂无运行的程序
                    </td>
                `;
                tbody.appendChild(row);
            }

            table.appendChild(tbody);
            container.appendChild(table);

            // 查看权限按钮事件
            const viewBtns = container.querySelectorAll('.view-permissions-btn');
            viewBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const pid = parseInt(btn.dataset.pid);
                    const programName = btn.dataset.program;
                    this._showProgramPermissions(pid, programName);
                });
            });

            this.contentPanel.appendChild(container);
        },

        /**
         * 显示程序权限详情
         */
        _showProgramPermissions: async function (pid, programName) {
            if (typeof PermissionManager === 'undefined') {
                return;
            }

            const permissions = PermissionManager.getProgramPermissions(pid);
            const permissionInfo = typeof PermissionManager._getPermissionInfo === 'function' 
                ? PermissionManager._getPermissionInfo 
                : null;

            const content = document.createElement('div');
            content.style.cssText = 'padding: 20px; max-height: 400px; overflow-y: auto;';
            
            const title = document.createElement('h3');
            title.textContent = `${programName} (PID: ${pid}) 的权限`;
            title.style.cssText = 'font-size: 16px; color: rgba(215, 224, 221, 0.9); margin-bottom: 16px;';
            content.appendChild(title);

            if (permissions.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.textContent = '该程序暂无权限';
                emptyMsg.style.cssText = 'color: rgba(215, 224, 221, 0.5); text-align: center; padding: 24px;';
                content.appendChild(emptyMsg);
            } else {
                const list = document.createElement('div');
                list.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
                
                permissions.forEach(perm => {
                    const item = document.createElement('div');
                    item.style.cssText = `
                        padding: 8px 12px;
                        background: rgba(20, 20, 30, 0.5);
                        border: 1px solid rgba(108, 142, 255, 0.2);
                        border-radius: 6px;
                        font-size: 13px;
                        color: rgba(215, 224, 221, 0.9);
                    `;
                    item.textContent = perm;
                    list.appendChild(item);
                });
                
                content.appendChild(list);
            }

            await this._showCustomDialog({
                title: '程序权限详情',
                width: 500,
                height: 500,
                content: () => content,
                buttons: [
                    { text: '关闭', action: 'close', primary: true }
                ]
            });
        },

        /**
         * 渲染权限统计页面
         */
        _renderPermissions: async function () {
            const container = document.createElement('div');
            container.style.cssText = `
                flex: 1;
                padding: 24px;
                overflow-y: auto;
            `;

            if (typeof PermissionManager === 'undefined') {
                container.innerHTML = '<div style="color: rgba(255, 95, 87, 0.8);">PermissionManager 不可用</div>';
                this.contentPanel.appendChild(container);
                return;
            }

            const stats = PermissionManager.getPermissionStats();
            const permissionStats = stats.permissionStats || {};

            const table = document.createElement('table');
            table.style.cssText = `
                width: 100%;
                border-collapse: collapse;
                background: rgba(20, 20, 30, 0.5);
                border-radius: 12px;
                overflow: hidden;
            `;

            // 表头
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr style="background: rgba(108, 142, 255, 0.1);">
                    <th style="padding: 12px; text-align: left; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">权限名称</th>
                    <th style="padding: 12px; text-align: center; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">授予次数</th>
                    <th style="padding: 12px; text-align: center; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">拒绝次数</th>
                    <th style="padding: 12px; text-align: center; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">检查次数</th>
                </tr>
            `;
            table.appendChild(thead);

            // 表体
            const tbody = document.createElement('tbody');
            const sortedPermissions = Object.entries(permissionStats).sort((a, b) => {
                const totalA = a[1].granted + a[1].denied + a[1].checked;
                const totalB = b[1].granted + b[1].denied + b[1].checked;
                return totalB - totalA;
            });

            sortedPermissions.forEach(([permission, stats]) => {
                const row = document.createElement('tr');
                row.style.cssText = `
                    border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                `;
                row.innerHTML = `
                    <td style="padding: 12px; color: rgba(215, 224, 221, 0.9); font-size: 13px;">${permission}</td>
                    <td style="padding: 12px; text-align: center; color: #10B981; font-size: 13px;">${stats.granted || 0}</td>
                    <td style="padding: 12px; text-align: center; color: #EF4444; font-size: 13px;">${stats.denied || 0}</td>
                    <td style="padding: 12px; text-align: center; color: rgba(215, 224, 221, 0.7); font-size: 13px;">${stats.checked || 0}</td>
                `;
                tbody.appendChild(row);
            });

            if (sortedPermissions.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td colspan="4" style="padding: 24px; text-align: center; color: rgba(215, 224, 221, 0.5);">
                        暂无权限统计数据
                    </td>
                `;
                tbody.appendChild(row);
            }

            table.appendChild(tbody);
            container.appendChild(table);

            this.contentPanel.appendChild(container);
        },

        /**
         * 渲染黑名单页面
         */
        _renderBlacklist: async function () {
            const container = document.createElement('div');
            container.style.cssText = `
                flex: 1;
                padding: 24px;
                overflow-y: auto;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            `;
            header.innerHTML = `
                <h3 style="font-size: 16px; color: rgba(215, 224, 221, 0.9); margin: 0;">程序黑名单</h3>
                <button id="add-blacklist-btn" style="
                    padding: 6px 16px;
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 6px;
                    color: rgba(239, 68, 68, 0.9);
                    font-size: 13px;
                    cursor: pointer;
                ">添加程序</button>
            `;
            container.appendChild(header);

            const list = document.createElement('div');
            list.style.cssText = `
                background: rgba(20, 20, 30, 0.5);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 12px;
                padding: 16px;
            `;

            if (this.blacklist.size === 0) {
                list.innerHTML = '<div style="color: rgba(215, 224, 221, 0.5); text-align: center; padding: 24px;">黑名单为空</div>';
            } else {
                this.blacklist.forEach(programName => {
                    const item = document.createElement('div');
                    item.style.cssText = `
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px;
                        border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                    `;
                    item.innerHTML = `
                        <span style="color: rgba(215, 224, 221, 0.9); font-size: 13px;">${programName}</span>
                        <button class="remove-blacklist-btn" data-program="${programName}" style="
                            padding: 4px 12px;
                            background: rgba(239, 68, 68, 0.2);
                            border: 1px solid rgba(239, 68, 68, 0.3);
                            border-radius: 4px;
                            color: rgba(239, 68, 68, 0.9);
                            font-size: 12px;
                            cursor: pointer;
                        ">移除</button>
                    `;
                    list.appendChild(item);
                });
            }

            container.appendChild(list);

            // 添加按钮事件
            const addBtn = container.querySelector('#add-blacklist-btn');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    this._showAddBlacklistDialog();
                });
            }

            // 移除按钮事件
            const removeBtns = container.querySelectorAll('.remove-blacklist-btn');
            removeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const programName = btn.dataset.program;
                    this._removeFromBlacklist(programName);
                });
            });

            this.contentPanel.appendChild(container);
        },

        /**
         * 渲染白名单页面
         */
        _renderWhitelist: async function () {
            const container = document.createElement('div');
            container.style.cssText = `
                flex: 1;
                padding: 24px;
                overflow-y: auto;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            `;
            header.innerHTML = `
                <h3 style="font-size: 16px; color: rgba(215, 224, 221, 0.9); margin: 0;">程序白名单</h3>
                <button id="add-whitelist-btn" style="
                    padding: 6px 16px;
                    background: rgba(16, 185, 129, 0.2);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    border-radius: 6px;
                    color: rgba(16, 185, 129, 0.9);
                    font-size: 13px;
                    cursor: pointer;
                ">添加程序</button>
            `;
            container.appendChild(header);

            const list = document.createElement('div');
            list.style.cssText = `
                background: rgba(20, 20, 30, 0.5);
                border: 1px solid rgba(16, 185, 129, 0.3);
                border-radius: 12px;
                padding: 16px;
            `;

            if (this.whitelist.size === 0) {
                list.innerHTML = '<div style="color: rgba(215, 224, 221, 0.5); text-align: center; padding: 24px;">白名单为空</div>';
            } else {
                this.whitelist.forEach(programName => {
                    const item = document.createElement('div');
                    item.style.cssText = `
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px;
                        border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                    `;
                    item.innerHTML = `
                        <span style="color: rgba(215, 224, 221, 0.9); font-size: 13px;">${programName}</span>
                        <button class="remove-whitelist-btn" data-program="${programName}" style="
                            padding: 4px 12px;
                            background: rgba(239, 68, 68, 0.2);
                            border: 1px solid rgba(239, 68, 68, 0.3);
                            border-radius: 4px;
                            color: rgba(239, 68, 68, 0.9);
                            font-size: 12px;
                            cursor: pointer;
                        ">移除</button>
                    `;
                    list.appendChild(item);
                });
            }

            container.appendChild(list);

            // 添加按钮事件
            const addBtn = container.querySelector('#add-whitelist-btn');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    this._showAddWhitelistDialog();
                });
            }

            // 移除按钮事件
            const removeBtns = container.querySelectorAll('.remove-whitelist-btn');
            removeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const programName = btn.dataset.program;
                    this._removeFromWhitelist(programName);
                });
            });

            this.contentPanel.appendChild(container);
        },

        /**
         * 渲染审计日志页面
         */
        _renderAudit: async function () {
            const container = document.createElement('div');
            container.style.cssText = `
                flex: 1;
                padding: 24px;
                overflow-y: auto;
            `;

            if (typeof PermissionManager === 'undefined') {
                container.innerHTML = '<div style="color: rgba(255, 95, 87, 0.8);">PermissionManager 不可用</div>';
                this.contentPanel.appendChild(container);
                return;
            }

            const auditLog = PermissionManager.getAuditLog({}, 100);

            const table = document.createElement('table');
            table.style.cssText = `
                width: 100%;
                border-collapse: collapse;
                background: rgba(20, 20, 30, 0.5);
                border-radius: 12px;
                overflow: hidden;
            `;

            // 表头
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr style="background: rgba(108, 142, 255, 0.1);">
                    <th style="padding: 12px; text-align: left; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">时间</th>
                    <th style="padding: 12px; text-align: left; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">程序</th>
                    <th style="padding: 12px; text-align: left; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">权限</th>
                    <th style="padding: 12px; text-align: left; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">操作</th>
                    <th style="padding: 12px; text-align: left; color: rgba(215, 224, 221, 0.9); font-size: 13px; font-weight: 600;">结果</th>
                </tr>
            `;
            table.appendChild(thead);

            // 表体
            const tbody = document.createElement('tbody');
            auditLog.forEach(log => {
                const row = document.createElement('tr');
                row.style.cssText = `
                    border-bottom: 1px solid rgba(108, 142, 255, 0.1);
                `;
                const time = new Date(log.timestamp).toLocaleString();
                const resultColor = log.result ? '#10B981' : '#EF4444';
                const resultText = log.result ? '✓' : '✗';
                row.innerHTML = `
                    <td style="padding: 12px; color: rgba(215, 224, 221, 0.7); font-size: 12px;">${time}</td>
                    <td style="padding: 12px; color: rgba(215, 224, 221, 0.9); font-size: 13px;">${log.programName}</td>
                    <td style="padding: 12px; color: rgba(215, 224, 221, 0.9); font-size: 13px;">${log.permission}</td>
                    <td style="padding: 12px; color: rgba(215, 224, 221, 0.9); font-size: 13px;">${log.action}</td>
                    <td style="padding: 12px; color: ${resultColor}; font-size: 13px; font-weight: bold;">${resultText}</td>
                `;
                tbody.appendChild(row);
            });

            if (auditLog.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td colspan="5" style="padding: 24px; text-align: center; color: rgba(215, 224, 221, 0.5);">
                        暂无审计日志
                    </td>
                `;
                tbody.appendChild(row);
            }

            table.appendChild(tbody);
            container.appendChild(table);

            this.contentPanel.appendChild(container);
        },

        /**
         * 加载黑名单和白名单
         */
        _loadLists: async function () {
            if (typeof LStorage === 'undefined') {
                return;
            }

            try {
                // 加载黑名单
                const blacklistData = await LStorage.getSystemStorage('permissionControl.blacklist');
                if (Array.isArray(blacklistData)) {
                    this.blacklist = new Set(blacklistData);
                }

                // 加载白名单
                const whitelistData = await LStorage.getSystemStorage('permissionControl.whitelist');
                if (Array.isArray(whitelistData)) {
                    this.whitelist = new Set(whitelistData);
                }

                // 加载设置
                const settings = await LStorage.getSystemStorage('permissionControl.settings');
                if (settings && typeof settings.autoGrantEnabled === 'boolean') {
                    this.autoGrantEnabled = settings.autoGrantEnabled;
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.warn('PermissionControl', `加载列表失败: ${error.message}`);
                }
            }
        },

        /**
         * 保存设置
         */
        _saveSettings: async function () {
            if (typeof LStorage === 'undefined') {
                return;
            }

            try {
                await LStorage.setSystemStorage('permissionControl.settings', {
                    autoGrantEnabled: this.autoGrantEnabled
                });
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('PermissionControl', `保存设置失败: ${error.message}`);
                }
            }
        },

        /**
         * 保存黑名单
         */
        _saveBlacklist: async function () {
            if (typeof LStorage === 'undefined') {
                return;
            }

            try {
                await LStorage.setSystemStorage('permissionControl.blacklist', Array.from(this.blacklist));
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('PermissionControl', `保存黑名单失败: ${error.message}`);
                }
            }
        },

        /**
         * 保存白名单
         */
        _saveWhitelist: async function () {
            if (typeof LStorage === 'undefined') {
                return;
            }

            try {
                await LStorage.setSystemStorage('permissionControl.whitelist', Array.from(this.whitelist));
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('PermissionControl', `保存白名单失败: ${error.message}`);
                }
            }
        },

        /**
         * 刷新数据
         */
        _refreshData: async function () {
            await this._renderContent();
        },

        /**
         * 显示添加黑名单对话框
         */
        _showAddBlacklistDialog: async function () {
            const programs = this._getAvailablePrograms();
            
            // 统一使用自定义对话框，以便支持选择程序按钮
            {
                // 降级方案：使用自定义对话框
                const result = await this._showCustomDialog({
                    title: '添加黑名单',
                    width: 400,
                    height: 200,
                    content: () => {
                        const container = document.createElement('div');
                        container.style.cssText = 'padding: 20px;';
                        
                        const label = document.createElement('label');
                        label.textContent = '程序名称:';
                        label.style.cssText = 'display: block; margin-bottom: 8px; color: rgba(215, 224, 221, 0.9); font-size: 13px;';
                        container.appendChild(label);
                        
                        // 输入框和选择按钮容器
                        const inputContainer = document.createElement('div');
                        inputContainer.style.cssText = 'display: flex; gap: 8px; align-items: stretch;';
                        
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.id = 'blacklist-program-input';
                        input.placeholder = '例如: filemanager';
                        input.style.cssText = 'flex: 1; padding: 8px; background: rgba(20, 20, 30, 0.5); border: 1px solid rgba(108, 142, 255, 0.3); border-radius: 6px; color: rgba(215, 224, 221, 0.9); font-size: 13px; box-sizing: border-box;';
                        inputContainer.appendChild(input);
                        
                        // 选择程序按钮
                        const selectBtn = document.createElement('button');
                        selectBtn.type = 'button';
                        selectBtn.textContent = '选择程序';
                        selectBtn.style.cssText = `
                            padding: 8px 16px;
                            background: rgba(139, 92, 246, 0.3);
                            border: 1px solid rgba(139, 92, 246, 0.5);
                            border-radius: 6px;
                            color: rgba(215, 224, 221, 0.9);
                            font-size: 13px;
                            cursor: pointer;
                            white-space: nowrap;
                            transition: all 0.2s;
                        `;
                        selectBtn.addEventListener('mouseenter', () => {
                            selectBtn.style.background = 'rgba(139, 92, 246, 0.5)';
                        });
                        selectBtn.addEventListener('mouseleave', () => {
                            selectBtn.style.background = 'rgba(139, 92, 246, 0.3)';
                        });
                        selectBtn.addEventListener('click', () => {
                            this._selectProgram(input, 'blacklist');
                        });
                        inputContainer.appendChild(selectBtn);
                        
                        container.appendChild(inputContainer);
                        
                        return container;
                    },
                    buttons: [
                        { text: '取消', action: 'cancel' },
                        {
                            text: '添加',
                            action: 'confirm',
                            primary: true,
                            getData: (dialogWindow) => {
                                const input = dialogWindow.querySelector('#blacklist-program-input');
                                return { programName: input?.value || '' };
                            }
                        }
                    ]
                });

                if (result === 'confirm' || (result && result.action === 'confirm')) {
                    const programName = result?.data?.programName || '';
                    if (programName.trim()) {
                        this._addToBlacklist(programName.trim());
                    }
                }
            }
        },

        /**
         * 添加到黑名单
         */
        _addToBlacklist: async function (programName) {
            if (!programName) return;

            this.blacklist.add(programName);
            await this._saveBlacklist();
            await this._refreshData();
        },

        /**
         * 从黑名单移除
         */
        _removeFromBlacklist: async function (programName) {
            if (!programName) return;

            this.blacklist.delete(programName);
            await this._saveBlacklist();
            await this._refreshData();
        },

        /**
         * 显示添加白名单对话框
         */
        _showAddWhitelistDialog: async function () {
            const programs = this._getAvailablePrograms();
            
            // 统一使用自定义对话框，以便支持选择程序按钮
            {
                // 降级方案：使用自定义对话框
                const result = await this._showCustomDialog({
                    title: '添加白名单',
                    width: 400,
                    height: 200,
                    content: () => {
                        const container = document.createElement('div');
                        container.style.cssText = 'padding: 20px;';
                        
                        const label = document.createElement('label');
                        label.textContent = '程序名称:';
                        label.style.cssText = 'display: block; margin-bottom: 8px; color: rgba(215, 224, 221, 0.9); font-size: 13px;';
                        container.appendChild(label);
                        
                        // 输入框和选择按钮容器
                        const inputContainer = document.createElement('div');
                        inputContainer.style.cssText = 'display: flex; gap: 8px; align-items: stretch;';
                        
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.id = 'whitelist-program-input';
                        input.placeholder = '例如: filemanager';
                        input.style.cssText = 'flex: 1; padding: 8px; background: rgba(20, 20, 30, 0.5); border: 1px solid rgba(108, 142, 255, 0.3); border-radius: 6px; color: rgba(215, 224, 221, 0.9); font-size: 13px; box-sizing: border-box;';
                        inputContainer.appendChild(input);
                        
                        // 选择程序按钮
                        const selectBtn = document.createElement('button');
                        selectBtn.type = 'button';
                        selectBtn.textContent = '选择程序';
                        selectBtn.style.cssText = `
                            padding: 8px 16px;
                            background: rgba(139, 92, 246, 0.3);
                            border: 1px solid rgba(139, 92, 246, 0.5);
                            border-radius: 6px;
                            color: rgba(215, 224, 221, 0.9);
                            font-size: 13px;
                            cursor: pointer;
                            white-space: nowrap;
                            transition: all 0.2s;
                        `;
                        selectBtn.addEventListener('mouseenter', () => {
                            selectBtn.style.background = 'rgba(139, 92, 246, 0.5)';
                        });
                        selectBtn.addEventListener('mouseleave', () => {
                            selectBtn.style.background = 'rgba(139, 92, 246, 0.3)';
                        });
                        selectBtn.addEventListener('click', () => {
                            this._selectProgram(input, 'whitelist');
                        });
                        inputContainer.appendChild(selectBtn);
                        
                        container.appendChild(inputContainer);
                        
                        return container;
                    },
                    buttons: [
                        { text: '取消', action: 'cancel' },
                        {
                            text: '添加',
                            action: 'confirm',
                            primary: true,
                            getData: (dialogWindow) => {
                                const input = dialogWindow.querySelector('#whitelist-program-input');
                                return { programName: input?.value || '' };
                            }
                        }
                    ]
                });

                if (result === 'confirm' || (result && result.action === 'confirm')) {
                    const programName = result?.data?.programName || '';
                    if (programName.trim()) {
                        this._addToWhitelist(programName.trim());
                    }
                }
            }
        },

        /**
         * 添加到白名单
         */
        _addToWhitelist: async function (programName) {
            if (!programName) return;

            this.whitelist.add(programName);
            await this._saveWhitelist();
            await this._refreshData();
        },

        /**
         * 从白名单移除
         */
        _removeFromWhitelist: async function (programName) {
            if (!programName) return;

            this.whitelist.delete(programName);
            await this._saveWhitelist();
            await this._refreshData();
        },

        /**
         * 选择程序（调用任务管理器的选择模式）
         * @param {HTMLInputElement} programNameInput 程序名称输入框
         * @param {string} listType 列表类型：'blacklist' 或 'whitelist'
         */
        _selectProgram: async function (programNameInput, listType) {
            if (typeof ProcessManager === 'undefined') {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('PermissionControl', 'ProcessManager 不可用');
                }
                return;
            }

            try {
                // 读取任务管理器程序文件
                const taskManagerPath = 'D:/application/taskmanager/taskmanager.js';
                let taskManagerContent = null;

                // 尝试通过 ProcessManager 读取文件
                if (typeof ProcessManager !== 'undefined' && typeof ProcessManager.callKernelAPI === 'function') {
                    try {
                        const result = await ProcessManager.callKernelAPI(this.pid, 'FileSystem.read', [taskManagerPath], null);
                        if (result && result.content) {
                            taskManagerContent = result.content;
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('PermissionControl', `通过 ProcessManager 读取任务管理器失败: ${e.message}`);
                        }
                    }
                }

                // 如果 ProcessManager 读取失败，尝试直接使用 fetch
                if (!taskManagerContent) {
                    try {
                        const url = typeof SystemInformation !== 'undefined' && typeof SystemInformation.buildServiceUrlObject === 'function'
                            ? SystemInformation.buildServiceUrlObject(SystemInformation.SERVICE_NAMES.FSDIRVE)
                            : new URL('/system/service/FSDirve.php', window.location.origin);
                        url.searchParams.set('action', 'read_file');
                        url.searchParams.set('path', 'D:/application/taskmanager');
                        url.searchParams.set('fileName', 'taskmanager.js');

                        const response = await fetch(url.toString());
                        if (response.ok) {
                            const result = await response.json();
                            if (result.status === 'success' && result.data && result.data.content) {
                                taskManagerContent = result.data.content;
                            }
                        }
                    } catch (e) {
                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.warn('PermissionControl', `通过 fetch 读取任务管理器失败: ${e.message}`);
                        }
                    }
                }

                if (!taskManagerContent) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('PermissionControl', '无法读取任务管理器程序文件');
                    }
                    return;
                }

                // 创建 tempAsset
                const tempAsset = {
                    script: taskManagerContent,
                    styles: [],
                    icon: null,
                    metadata: {
                        name: 'taskmanager',
                        type: 'GUI',
                        allowMultipleInstances: false
                    }
                };

                // 启动任务管理器，使用程序选择模式
                const taskManagerPid = await ProcessManager.startProgram('taskmanager', {
                    mode: 'program-selector',
                    onProgramSelected: async (programName, programInfo) => {
                        // 选择完成，更新输入框
                        if (programNameInput) {
                            programNameInput.value = programName;
                            // 触发 input 事件，确保表单验证能够识别
                            programNameInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }

                        if (typeof KernelLogger !== 'undefined') {
                            KernelLogger.info('PermissionControl', `已选择程序: ${programName} (${listType})`);
                        }
                    }
                }, null, {
                    tempAsset: tempAsset
                });

                if (!taskManagerPid) {
                    if (typeof KernelLogger !== 'undefined') {
                        KernelLogger.error('PermissionControl', '启动任务管理器失败');
                    }
                }
            } catch (error) {
                if (typeof KernelLogger !== 'undefined') {
                    KernelLogger.error('PermissionControl', '选择程序失败', error);
                }
            }
        },

        /**
         * 获取可用程序列表
         */
        _getAvailablePrograms: function () {
            const programs = [];
            if (typeof ProcessManager !== 'undefined' && ProcessManager.PROCESS_TABLE) {
                const programSet = new Set();
                for (const [pid, processInfo] of ProcessManager.PROCESS_TABLE) {
                    if (processInfo.programName && !programSet.has(processInfo.programName)) {
                        programSet.add(processInfo.programName);
                        programs.push(processInfo.programName);
                    }
                }
            }
            return programs.sort();
        },

        /**
         * 显示自定义对话框
         */
        _showCustomDialog: async function (options) {
            return new Promise((resolve) => {
                const guiContainer = ProcessManager.getGUIContainer() || document.getElementById('gui-container') || document.body;
                
                const dialogWindow = document.createElement('div');
                dialogWindow.className = 'zos-gui-window';
                dialogWindow.style.cssText = `
                    width: ${options.width || 500}px;
                    height: ${options.height || 300}px;
                    min-width: 300px;
                    min-height: 200px;
                    display: flex;
                    flex-direction: column;
                `;
                
                const contentArea = document.createElement('div');
                contentArea.style.cssText = `
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                `;
                const content = typeof options.content === 'function' ? options.content() : options.content;
                if (content) {
                    contentArea.appendChild(content);
                }
                dialogWindow.appendChild(contentArea);
                
                const buttonBar = document.createElement('div');
                buttonBar.style.cssText = `
                    height: 60px;
                    min-height: 60px;
                    max-height: 60px;
                    flex: 0 0 60px;
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    padding: 0 20px;
                    gap: 12px;
                    border-top: 1px solid rgba(108, 142, 255, 0.2);
                    box-sizing: border-box;
                `;
                
                const closeDialog = (action, data = null) => {
                    let result = action;
                    if (data !== null && data !== undefined) {
                        result = { action: action, data: data };
                    }
                    
                    setTimeout(() => {
                        if (typeof GUIManager !== 'undefined' && dialogWindowId) {
                            GUIManager.unregisterWindow(dialogWindowId);
                        } else if (dialogWindow.parentElement) {
                            dialogWindow.remove();
                        }
                        resolve(result);
                    }, 0);
                };
                
                let dialogWindowId = null;
                if (typeof GUIManager !== 'undefined') {
                    const windowInfo = GUIManager.registerWindow(this.pid, dialogWindow, {
                        title: options.title || '对话框',
                        onClose: () => {
                            closeDialog('cancel');
                        }
                    });
                    if (windowInfo && windowInfo.windowId) {
                        dialogWindowId = windowInfo.windowId;
                        GUIManager.focusWindow(windowInfo.windowId);
                    }
                }
                
                (options.buttons || []).forEach(btnConfig => {
                    const btn = document.createElement('button');
                    btn.textContent = btnConfig.text;
                    btn.style.cssText = `
                        padding: 8px 20px;
                        border: 1px solid ${btnConfig.primary ? 'rgba(108, 142, 255, 0.5)' : 'rgba(108, 142, 255, 0.3)'};
                        background: ${btnConfig.primary ? 'rgba(108, 142, 255, 0.1)' : 'transparent'};
                        color: rgba(215, 224, 221, 0.9);
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                        transition: all 0.2s ease;
                    `;
                    btn.addEventListener('click', () => {
                        let buttonData = null;
                        if (typeof btnConfig.getData === 'function') {
                            try {
                                buttonData = btnConfig.getData(dialogWindow);
                            } catch (error) {
                                if (typeof KernelLogger !== 'undefined') {
                                    KernelLogger.error('PermissionControl', `对话框 getData 失败: ${error.message}`);
                                }
                            }
                        }
                        closeDialog(btnConfig.action, buttonData);
                    });
                    buttonBar.appendChild(btn);
                });
                
                dialogWindow.appendChild(buttonBar);
                guiContainer.appendChild(dialogWindow);
            });
        },

        /**
         * 注册键盘快捷键
         */
        _registerKeyboardShortcuts: function () {
            if (typeof EventManager !== 'undefined' && this.pid) {
                EventManager.registerEventHandler(this.pid, 'keydown', (e) => {
                    const activeElement = document.activeElement;
                    if (activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    )) {
                        return;
                    }

                    // F5: 刷新
                    if (e.key === 'F5') {
                        e.preventDefault();
                        e.stopPropagation();
                        this._refreshData();
                    }
                }, {
                    priority: 100,
                    selector: null
                });
            }
        }
    };

    // 导出到全局作用域
    if (typeof window !== 'undefined') {
        window.PERMISSIONCONTROL = PERMISSIONCONTROL;
    } else if (typeof globalThis !== 'undefined') {
        globalThis.PERMISSIONCONTROL = PERMISSIONCONTROL;
    }

})(typeof window !== 'undefined' ? window : globalThis);